const fs = require('fs');
const path = require('path');
const espree = require('espree');

const ROOT = process.cwd();
const SOURCE_DIRS = ['js/main', 'js/shared', 'js/components', 'js/workers'];
const ROOT_SOURCE_FILES = ['js/main.js', 'js/vendor.js'];
const OUTPUT_PATH = path.join(ROOT, 'docs', 'development', 'module-call-map.md');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function pushLineMatch(map, symbol, line) {
  if (!map.has(symbol)) {
    map.set(symbol, new Set());
  }
  map.get(symbol).add(line);
}

function mapToSortedObject(map) {
  const out = {};
  for (const [symbol, lines] of map.entries()) {
    out[symbol] = Array.from(lines).sort((a, b) => a - b);
  }
  return out;
}

function collectNamespaceExports(lines) {
  const exports = [];
  const linesBySymbol = new Map();
  const patterns = [
    /\bShared\.([A-Za-z0-9_]+)\s*=/g,
    /\bComponents\.([A-Za-z0-9_]+)\s*=/g,
    /\bMain\.([A-Za-z0-9_]+)\s*=/g,
    /\bnamespace\.([A-Za-z0-9_]+)\s*=/g
  ];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const text = lines[lineIndex];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const symbol = match[1];
        exports.push(symbol);
        pushLineMatch(linesBySymbol, symbol, lineIndex + 1);
      }
      pattern.lastIndex = 0;
    }
  }
  return {
    symbols: uniqueSorted(exports),
    linesBySymbol: mapToSortedObject(linesBySymbol)
  };
}

function staticMemberName(member) {
  if (!member?.computed && member?.property?.type === 'Identifier') {
    return member.property.name;
  }
  if (member?.computed && member?.property?.type === 'Literal'
    && typeof member.property.value === 'string') {
    return member.property.value;
  }
  return null;
}

function resolveNamespacePath(node, prefix) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (node.type === 'Identifier') {
    return node.name === prefix ? { path: [] } : null;
  }
  if (node.type !== 'MemberExpression') {
    return null;
  }
  const property = staticMemberName(node);
  if (!property) {
    return null;
  }
  if (node.object?.type === 'Identifier'
    && ['window', 'globalThis'].includes(node.object.name)
    && property === prefix) {
    return { path: [] };
  }
  const parent = resolveNamespacePath(node.object, prefix);
  return parent ? { path: [...parent.path, property] } : null;
}

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(child => walkAst(child, visit));
    return;
  }
  if (typeof node.type === 'string') {
    visit(node);
  }
  Object.keys(node).forEach(key => {
    if (key !== 'parent' && key !== 'loc' && key !== 'range' && key !== 'tokens' && key !== 'comments') {
      walkAst(node[key], visit);
    }
  });
}

function collectSymbolReferences(source, prefix) {
  const lines = [];
  const linesBySymbol = new Map();
  const ast = espree.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    loc: true,
    allowReturnOutsideFunction: true
  });
  walkAst(ast, node => {
    if (node.type === 'MemberExpression') {
      const namespacePath = resolveNamespacePath(node, prefix);
      const symbol = namespacePath?.path?.[0];
      if (symbol) {
        lines.push(symbol);
        pushLineMatch(linesBySymbol, symbol, node.loc.start.line);
      }
      return;
    }

    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'ObjectPattern') {
      return;
    }
    const namespacePath = resolveNamespacePath(node.init, prefix);
    if (!namespacePath || namespacePath.path.length) {
      return;
    }
    node.id.properties.forEach(property => {
      if (property.type !== 'Property' || property.computed) {
        return;
      }
      const symbol = property.key?.type === 'Identifier'
        ? property.key.name
        : (property.key?.type === 'Literal' ? property.key.value : null);
      if (typeof symbol === 'string' && symbol) {
        lines.push(symbol);
        pushLineMatch(linesBySymbol, symbol, property.loc.start.line);
      }
    });
  });
  return {
    symbols: uniqueSorted(lines),
    linesBySymbol: mapToSortedObject(linesBySymbol)
  };
}

function collectWorkerReferences(lines) {
  const references = [];
  const pattern = /['"`]((?:\.\/)?js\/workers\/[A-Za-z0-9_.\/-]+\.js)['"`]/g;
  for (const line of lines) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      references.push(match[1].replace(/^\.\//, ''));
    }
    pattern.lastIndex = 0;
  }
  return uniqueSorted(references);
}

function buildMap() {
  const files = SOURCE_DIRS
    .map(rel => path.join(ROOT, rel))
    .filter(abs => fs.existsSync(abs))
    .flatMap(abs => walk(abs))
    .concat(ROOT_SOURCE_FILES.map(rel => path.join(ROOT, rel)).filter(abs => fs.existsSync(abs)));

  const modules = [];
  for (const file of files) {
    const rel = toPosix(path.relative(ROOT, file));
    const source = fs.readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);

    const shared = collectSymbolReferences(source, 'Shared');
    const components = collectSymbolReferences(source, 'Components');
    const main = collectSymbolReferences(source, 'Main');
    const namespaceExports = collectNamespaceExports(lines);
    const workerRefs = collectWorkerReferences(lines);

    modules.push({
      rel,
      sharedRefs: shared.symbols,
      sharedLinesBySymbol: shared.linesBySymbol,
      componentRefs: components.symbols,
      componentLinesBySymbol: components.linesBySymbol,
      mainRefs: main.symbols,
      mainLinesBySymbol: main.linesBySymbol,
      workerRefs,
      namespaceExports: namespaceExports.symbols,
      namespaceExportLinesBySymbol: namespaceExports.linesBySymbol
    });
  }

  modules.sort((a, b) => a.rel.localeCompare(b.rel));
  return modules;
}

function summarize(modules) {
  const summary = {
    modules: modules.length,
    sharedSymbols: new Set(),
    componentSymbols: new Set(),
    mainSymbols: new Set()
  };

  for (const module of modules) {
    for (const symbol of module.sharedRefs) summary.sharedSymbols.add(symbol);
    for (const symbol of module.componentRefs) summary.componentSymbols.add(symbol);
    for (const symbol of module.mainRefs) summary.mainSymbols.add(symbol);
  }

  return {
    modules: summary.modules,
    sharedSymbols: summary.sharedSymbols.size,
    componentSymbols: summary.componentSymbols.size,
    mainSymbols: summary.mainSymbols.size
  };
}

function take(values, limit = 12) {
  if (values.length <= limit) return values;
  const extra = values.length - limit;
  return [...values.slice(0, limit), `... (+${extra} more)`];
}

function formatSymbolWithLines(symbol, lineMap, lineLimit = 3) {
  const lines = lineMap[symbol] || [];
  if (!lines.length) return symbol;
  const shown = lines.slice(0, lineLimit).join(',');
  const extra = lines.length > lineLimit ? `,+${lines.length - lineLimit}` : '';
  return `${symbol}@L${shown}${extra}`;
}

function formatSymbolPreview(symbols, lineMap, limit = 12) {
  if (!symbols.length) return '(none)';
  return take(symbols.map(symbol => formatSymbolWithLines(symbol, lineMap))).join(', ');
}

function buildReverseIndex(modules, refKey, lineKey) {
  const index = new Map();
  for (const module of modules) {
    for (const symbol of module[refKey]) {
      if (!index.has(symbol)) index.set(symbol, []);
      index.get(symbol).push({
        module: module.rel,
        lines: module[lineKey][symbol] || []
      });
    }
  }
  for (const [symbol, refs] of index.entries()) {
    refs.sort((a, b) => a.module.localeCompare(b.module));
    index.set(symbol, refs);
  }
  return index;
}

function renderReverseIndex(lines, title, prefix, index) {
  lines.push(`### ${title}`);
  lines.push('');
  const symbols = Array.from(index.keys()).sort((a, b) => a.localeCompare(b));
  if (!symbols.length) {
    lines.push('- (none)');
    lines.push('');
    return;
  }
  for (const symbol of symbols) {
    const refs = index.get(symbol);
    const formattedRefs = refs.map(ref => {
      const linePart = ref.lines.length ? `L${ref.lines.join(',')}` : 'L?';
      return `${ref.module}:${linePart}`;
    }).join('; ');
    lines.push(`- ${prefix}.${symbol}: ${formattedRefs}`);
  }
  lines.push('');
}

function toMarkdown(modules) {
  const now = new Date().toISOString();
  const stats = summarize(modules);
  const lines = [];
  const sharedIndex = buildReverseIndex(modules, 'sharedRefs', 'sharedLinesBySymbol');
  const componentIndex = buildReverseIndex(modules, 'componentRefs', 'componentLinesBySymbol');
  const mainIndex = buildReverseIndex(modules, 'mainRefs', 'mainLinesBySymbol');

  lines.push('# Module Call Map (Generated)');
  lines.push('');
  lines.push(`Generated by \`scripts/generate-architecture-map.js\` on ${now}.`);
  lines.push('');
  lines.push('## Coverage');
  lines.push('');
  lines.push(`- Scanned module files: ${stats.modules}`);
  lines.push(`- Referenced \`Shared.*\` symbols: ${stats.sharedSymbols}`);
  lines.push(`- Referenced \`Components.*\` symbols: ${stats.componentSymbols}`);
  lines.push(`- Referenced \`Main.*\` symbols: ${stats.mainSymbols}`);
  lines.push('');
  lines.push('## Module Index');
  lines.push('');

  for (const module of modules) {
    lines.push(`### ${module.rel}`);
    lines.push('');
    const exportList = module.namespaceExports.length
      ? module.namespaceExports.map(symbol => formatSymbolWithLines(symbol, module.namespaceExportLinesBySymbol)).join(', ')
      : '(none detected)';
    lines.push(`- Namespace assignments: ${exportList}`);
    lines.push(`- Uses Shared symbols: ${formatSymbolPreview(module.sharedRefs, module.sharedLinesBySymbol)}`);
    lines.push(`- Uses Components symbols: ${formatSymbolPreview(module.componentRefs, module.componentLinesBySymbol)}`);
    lines.push(`- Uses Main symbols: ${formatSymbolPreview(module.mainRefs, module.mainLinesBySymbol)}`);
    lines.push(`- Uses worker entries: ${module.workerRefs.length ? module.workerRefs.join(', ') : '(none detected)'}`);
    lines.push('');
  }

  lines.push('## Reverse Lookup');
  lines.push('');
  renderReverseIndex(lines, 'Shared Symbols', 'Shared', sharedIndex);
  renderReverseIndex(lines, 'Components Symbols', 'Components', componentIndex);
  renderReverseIndex(lines, 'Main Symbols', 'Main', mainIndex);

  lines.push('## Notes');
  lines.push('');
  lines.push('- Namespace member references use JavaScript syntax parsing and are intended for fast orientation, not as a complete call graph.');
  lines.push('- It includes root bootstrap files and worker modules; worker edges only capture literal `js/workers/*.js` paths.');
  lines.push('- Static namespace destructuring, optional chains, and literal computed properties are included. Local data-flow aliases, callbacks, computed paths, and dynamic dispatch still require source tracing.');
  lines.push('- Line references use 1-based file line numbers.');
  lines.push('- `namespace.*` entries indicate exported members inside IIFE modules.');
  lines.push('- Regenerate after refactors: `npm run docs:arch-map`.');

  return lines.join('\n') + '\n';
}

function main() {
  const modules = buildMap();
  const markdown = toMarkdown(modules);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, markdown, 'utf8');
  console.log(`Generated ${path.relative(ROOT, OUTPUT_PATH)} (${modules.length} modules)`);
}

if (require.main === module) {
  main();
}

module.exports = { buildMap, collectSymbolReferences, toMarkdown };
