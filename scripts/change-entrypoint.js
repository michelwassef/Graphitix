#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const COMPONENTS_JS = path.join(ROOT, 'js', 'main', 'components.js');
const TEST_DIRS = [path.join(ROOT, '__tests__'), path.join(ROOT, 'e2e')];

const KNOWN_HOOKS = new Set([
  'ensure',
  'draw',
  'getPayload',
  'loadFromFile',
  'loadFromPayload',
  'applyColorSchemePayload',
  'createEmptyPayload',
  'activateTab',
  'captureRuntimeState',
  'applyRuntimeState',
  'captureRenderCache',
  'restoreRenderCache',
  'getLayoutState',
  'getDefaultLayoutState',
  'applyLayoutState'
]);

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function toRel(absPath) {
  return toPosix(path.relative(ROOT, absPath));
}

function splitCamelCase(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    types: [],
    list: false,
    showTests: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--no-tests') {
      options.showTests = false;
    } else if (arg === '--type') {
      const value = String(argv[i + 1] || '').trim();
      i += 1;
      options.types.push(...value.split(',').map(s => s.trim()).filter(Boolean));
    } else {
      options.types.push(...String(arg).split(',').map(s => s.trim()).filter(Boolean));
    }
  }
  options.types = Array.from(new Set(options.types.map(s => s.toLowerCase())));
  return options;
}

function printHelp() {
  console.log(
    'Usage: node scripts/change-entrypoint.js [--type box,scatter] [--list] [--no-tests]\n' +
    '\n' +
    'Purpose:\n' +
    '  Show fast orientation details for component entrypoints:\n' +
    '  - index.html script load locations\n' +
    '  - js/main/components.js bundle descriptor + registry hooks\n' +
    '  - related unit/e2e tests\n' +
    '\n' +
    'Examples:\n' +
    '  node scripts/change-entrypoint.js --list\n' +
    '  node scripts/change-entrypoint.js --type box\n' +
    '  node scripts/change-entrypoint.js scatter,heatmap'
  );
}

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function countChar(text, needle) {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === needle) count += 1;
  }
  return count;
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
      continue;
    }
    if (entry.isFile()) out.push(full);
  }
  return out;
}

function parseIndexScripts(lines) {
  const scripts = [];
  const regex = /<script\s+src="([^"]+)"/i;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(regex);
    if (!match) continue;
    scripts.push({
      src: match[1],
      line: i + 1
    });
  }
  return scripts;
}

function parseBundleDescriptors(lines) {
  const bundles = new Map();
  const regex = /^\s*([a-z][a-z0-9_]*):\s*\{\s*browserPath:\s*'([^']+)',\s*requirePath:\s*'([^']+)'\s*\},?\s*$/i;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(regex);
    if (!match) continue;
    bundles.set(match[1].toLowerCase(), {
      type: match[1].toLowerCase(),
      browserPath: match[2],
      requirePath: match[3],
      line: i + 1
    });
  }
  return bundles;
}

function parseWorkspaceRegistry(lines) {
  const start = lines.findIndex(line => line.includes('const WORKSPACES = {'));
  if (start < 0) return new Map();
  const workspaces = new Map();
  let inRegistry = false;
  let registryDepth = 0;
  let current = null;
  let currentDepth = 0;

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inRegistry) {
      inRegistry = true;
      registryDepth = countChar(line, '{') - countChar(line, '}');
      continue;
    }

    if (!current) {
      const entry = line.match(/^\s{4}([a-z][a-z0-9_]*):\s*\{\s*$/i);
      if (entry) {
        current = {
          key: entry[1].toLowerCase(),
          startLine: i + 1,
          endLine: i + 1,
          type: null,
          elementId: null,
          hooks: [],
          rawProperties: []
        };
        currentDepth = countChar(line, '{') - countChar(line, '}');
      }
    } else {
      currentDepth += countChar(line, '{') - countChar(line, '}');
      current.endLine = i + 1;

      const typeMatch = line.match(/^\s{6}type:\s*'([^']+)'/);
      if (typeMatch) {
        current.type = typeMatch[1];
        current.rawProperties.push({ key: 'type', value: typeMatch[1], line: i + 1 });
      }
      const elementMatch = line.match(/^\s{6}element:\s*document\.getElementById\('([^']+)'\)/);
      if (elementMatch) {
        current.elementId = elementMatch[1];
        current.rawProperties.push({ key: 'element', value: elementMatch[1], line: i + 1 });
      }
      const hookMatch = line.match(/^\s{6}([A-Za-z0-9_]+):\s*(.+)$/);
      if (hookMatch && KNOWN_HOOKS.has(hookMatch[1])) {
        current.hooks.push({
          key: hookMatch[1],
          line: i + 1,
          expression: hookMatch[2].trim().replace(/,\s*$/, '')
        });
      }

      if (currentDepth <= 0) {
        workspaces.set(current.key, current);
        current = null;
      }
    }

    registryDepth += countChar(line, '{') - countChar(line, '}');
    if (registryDepth <= 0) break;
  }
  return workspaces;
}

function findRelatedTests(type) {
  const tokenSet = new Set([type.toLowerCase(), ...splitCamelCase(type)]);
  const allTests = TEST_DIRS.flatMap(walkFiles)
    .filter(file => /\.(test|spec)\.js$/i.test(file));
  const scored = [];
  for (const file of allTests) {
    const rel = toRel(file).toLowerCase();
    let score = 0;
    for (const token of tokenSet) {
      if (token.length < 3) continue;
      if (rel.includes(token)) score += 5;
    }
    if (score > 0) {
      scored.push({ file: toRel(file), score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return scored.map(item => item.file);
}

function formatLineRef(relPath, lineNumber) {
  return `${relPath}:${lineNumber}`;
}

function printWorkspaceDetails(workspace, bundle, context) {
  const componentsRel = toRel(COMPONENTS_JS);
  console.log(`\n## ${workspace.key}`);
  console.log(`- Registry block: ${formatLineRef(componentsRel, workspace.startLine)} to ${formatLineRef(componentsRel, workspace.endLine)}`);
  if (bundle) {
    console.log(`- Bundle descriptor: ${formatLineRef(componentsRel, bundle.line)} -> requirePath "${bundle.requirePath}"`);
  } else {
    console.log('- Bundle descriptor: not found');
  }
  if (workspace.type) {
    const typeLine = workspace.rawProperties.find(item => item.key === 'type')?.line || workspace.startLine;
    console.log(`- Workspace type field: ${formatLineRef(componentsRel, typeLine)} -> "${workspace.type}"`);
  }
  if (workspace.elementId) {
    const elementLine = workspace.rawProperties.find(item => item.key === 'element')?.line || workspace.startLine;
    console.log(`- Workspace element id: ${formatLineRef(componentsRel, elementLine)} -> "${workspace.elementId}"`);
  }

  if (workspace.hooks.length) {
    console.log('- Main.components hooks:');
    for (const hook of workspace.hooks) {
      console.log(`  - ${hook.key}: ${formatLineRef(componentsRel, hook.line)} -> ${hook.expression}`);
    }
  } else {
    console.log('- Main.components hooks: none detected');
  }

  const indexScripts = context.indexScripts;
  const sharedScripts = indexScripts.filter(item => item.src.startsWith('js/shared/'));
  const mainScripts = indexScripts.filter(item => item.src.startsWith('js/main/'));
  console.log(`- index.html shared bootstrap span: ${sharedScripts.length ? formatLineRef('index.html', sharedScripts[0].line) : 'n/a'} .. ${sharedScripts.length ? formatLineRef('index.html', sharedScripts[sharedScripts.length - 1].line) : 'n/a'}`);
  console.log(`- index.html main bootstrap span: ${mainScripts.length ? formatLineRef('index.html', mainScripts[0].line) : 'n/a'} .. ${mainScripts.length ? formatLineRef('index.html', mainScripts[mainScripts.length - 1].line) : 'n/a'}`);

  if (context.showTests) {
    const tests = findRelatedTests(workspace.key);
    if (tests.length) {
      console.log(`- Related tests (${tests.length}):`);
      for (const rel of tests.slice(0, 20)) {
        console.log(`  - ${rel}`);
      }
      if (tests.length > 20) {
        console.log(`  - ... (${tests.length - 20} more)`);
      }
    } else {
      console.log('- Related tests: none detected by path token matching');
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const indexLines = readLines(INDEX_HTML);
  const componentLines = readLines(COMPONENTS_JS);
  const indexScripts = parseIndexScripts(indexLines);
  const bundles = parseBundleDescriptors(componentLines);
  const workspaces = parseWorkspaceRegistry(componentLines);
  const available = Array.from(workspaces.keys()).sort((a, b) => a.localeCompare(b));

  if (options.list) {
    console.log(available.join('\n'));
    return;
  }

  const requested = options.types.length ? options.types : available;
  const missing = requested.filter(type => !workspaces.has(type));
  if (missing.length) {
    console.error(`Unknown component types: ${missing.join(', ')}`);
    console.error(`Available: ${available.join(', ')}`);
    process.exit(1);
  }

  console.log('# Change Entrypoint Report');
  console.log(`- index.html: ${toRel(INDEX_HTML)}`);
  console.log(`- components registry: ${toRel(COMPONENTS_JS)}`);
  console.log(`- requested: ${requested.join(', ')}`);

  const context = { indexScripts, showTests: options.showTests };
  for (const type of requested) {
    const workspace = workspaces.get(type);
    const bundle = bundles.get(type) || null;
    printWorkspaceDetails(workspace, bundle, context);
  }
}

main();
