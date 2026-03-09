const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const targetRoot = path.join(desktopRoot, 'app');
const requiredEntries = ['index.html', 'css', 'js', 'libs'];
const nodeModulesRoots = [
  path.join(desktopRoot, 'node_modules'),
  path.join(repoRoot, 'node_modules')
];
const vendorEntries = [
  {
    id: 'ag-grid.css',
    target: 'vendor/ag-grid.css',
    candidates: [
      ['ag-grid-community', 'styles', 'ag-grid.css']
    ]
  },
  {
    id: 'ag-theme-balham.css',
    target: 'vendor/ag-theme-balham.css',
    candidates: [
      ['ag-grid-community', 'styles', 'ag-theme-balham.css']
    ]
  },
  {
    id: 'ag-grid-community.min.noStyle.js',
    target: 'vendor/ag-grid-community.min.noStyle.js',
    candidates: [
      ['ag-grid-community', 'dist', 'ag-grid-community.min.noStyle.js'],
      ['ag-grid-community', 'dist', 'ag-grid-community.min.js']
    ]
  },
  {
    id: 'jstat.min.js',
    target: 'vendor/jstat.min.js',
    candidates: [
      ['jstat', 'dist', 'jstat.min.js']
    ]
  },
  {
    id: 'jszip.min.js',
    target: 'vendor/jszip.min.js',
    candidates: [
      ['jszip', 'dist', 'jszip.min.js']
    ]
  },
  {
    id: 'svd-js.min.js',
    target: 'vendor/svd-js.min.js',
    candidates: [
      ['svd-js', 'build-umd', 'svd-js.min.js'],
      ['svd-js', 'build-umd', 'svd-js.js']
    ]
  },
  {
    id: 'chart.umd.js',
    target: 'vendor/chart.umd.js',
    candidates: [
      ['chart.js', 'dist', 'chart.umd.js'],
      ['chart.js', 'dist', 'chart.umd.min.js'],
      ['chart.js', 'dist', 'chart.js']
    ]
  }
];
const patches = [
  {
    file: 'index.html',
    label: 'index.agGridCss',
    pattern: /<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/ag-grid-community@[^"]*\/styles\/ag-grid\.css"[^>]*>/g,
    replacement: '<link rel="stylesheet" href="vendor/ag-grid.css">'
  },
  {
    file: 'index.html',
    label: 'index.agGridTheme',
    pattern: /<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/ag-grid-community@[^"]*\/styles\/ag-theme-balham\.css"[^>]*>/g,
    replacement: '<link rel="stylesheet" href="vendor/ag-theme-balham.css">'
  },
  {
    file: 'index.html',
    label: 'index.agGridScript',
    pattern: /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/ag-grid-community@[^"]*\/dist\/ag-grid-community\.min\.noStyle\.js"[^>]*><\/script>/g,
    replacement: '<script src="vendor/ag-grid-community.min.noStyle.js"></script>'
  },
  {
    file: 'index.html',
    label: 'index.jstatScript',
    pattern: /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/jstat@[^"]*\/dist\/jstat\.min\.js"[^>]*><\/script>/g,
    replacement: '<script src="vendor/jstat.min.js"></script>'
  },
  {
    file: 'js/shared/loaders.js',
    label: 'loaders.chart',
    pattern: /url:\s*'https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js[^']*'/g,
    replacement: "url: 'vendor/chart.umd.js'"
  },
  {
    file: 'js/shared/loaders.js',
    label: 'loaders.svd',
    pattern: /url:\s*'https:\/\/cdn\.jsdelivr\.net\/npm\/svd-js[^']*'/g,
    replacement: "url: 'vendor/svd-js.min.js'"
  },
  {
    file: 'js/shared/loaders.js',
    label: 'loaders.zip',
    pattern: /url:\s*'https:\/\/cdn\.jsdelivr\.net\/npm\/jszip[^']*'/g,
    replacement: "url: 'vendor/jszip.min.js'"
  },
  {
    file: 'js/shared/graphArchive.js',
    label: 'graphArchive.zipScript',
    pattern: /const ZIP_SCRIPT_URL = 'https:\/\/cdn\.jsdelivr\.net\/npm\/jszip[^']*';/g,
    replacement: "const ZIP_SCRIPT_URL = 'vendor/jszip.min.js';"
  },
  {
    file: 'js/shared/tableImport.js',
    label: 'tableImport.zipFallback',
    pattern: /script\.src = 'https:\/\/cdn\.jsdelivr\.net\/npm\/jszip[^']*';/g,
    replacement: "script.src = 'vendor/jszip.min.js';"
  },
  {
    file: 'js/workers/scatter.worker.js',
    label: 'scatterWorker.jstat',
    pattern: /const JSTAT_URL = 'https:\/\/cdn\.jsdelivr\.net\/npm\/jstat[^']*';/g,
    replacement: "const JSTAT_URL = '../../vendor/jstat.min.js';"
  },
  {
    file: 'js/workers/box.worker.js',
    label: 'boxWorker.jstat',
    pattern: /const JSTAT_URL = 'https:\/\/cdn\.jsdelivr\.net\/npm\/jstat[^']*';/g,
    replacement: "const JSTAT_URL = '../../vendor/jstat.min.js';"
  },
  {
    file: 'js/workers/pca.worker.js',
    label: 'pcaWorker.svd',
    pattern: /const SVD_URL = 'https:\/\/cdn\.jsdelivr\.net\/npm\/svd-js[^']*';/g,
    replacement: "const SVD_URL = '../../vendor/svd-js.min.js';"
  },
  {
    file: 'js/workers/pca-embed.worker.js',
    label: 'pcaEmbedWorker.svd',
    pattern: /const SVD_URL = 'https:\/\/cdn\.jsdelivr\.net\/npm\/svd-js[^']*';/g,
    replacement: "const SVD_URL = '../../vendor/svd-js.min.js';"
  },
  {
    file: 'js/workers/graphArchive.worker.js',
    label: 'graphArchiveWorker.zip',
    pattern: /const ZIP_SCRIPT_URL = 'https:\/\/cdn\.jsdelivr\.net\/npm\/jszip[^']*';/g,
    replacement: "const ZIP_SCRIPT_URL = '../../vendor/jszip.min.js';"
  }
];

function ensureSourceEntryExists(entryName) {
  const entryPath = path.join(repoRoot, entryName);
  if (!fs.existsSync(entryPath)) {
    throw new Error(`Missing required source entry: ${entryName}`);
  }
  return entryPath;
}

function copyEntry(entryName) {
  const source = ensureSourceEntryExists(entryName);
  const target = path.join(targetRoot, entryName);
  fs.cpSync(source, target, { recursive: true });
}

function resolveNodeModulePath(candidates) {
  for (const root of nodeModulesRoots) {
    if (!fs.existsSync(root)) continue;
    for (const parts of candidates) {
      const resolved = path.join(root, ...parts);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
  }
  return null;
}

function copyVendors() {
  for (const vendor of vendorEntries) {
    const source = resolveNodeModulePath(vendor.candidates);
    if (!source) {
      throw new Error(
        `Missing vendor source for ${vendor.id}. Install desktop dependencies with "npm install --prefix desktop".`
      );
    }
    const target = path.join(targetRoot, vendor.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function applyPatch(fileRelativePath, pattern, replacement, label) {
  const filePath = path.join(targetRoot, fileRelativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Patch target missing: ${fileRelativePath}`);
  }
  const original = fs.readFileSync(filePath, 'utf8');
  const next = original.replace(pattern, replacement);
  if (next === original) {
    throw new Error(`Patch "${label}" did not match in ${fileRelativePath}`);
  }
  fs.writeFileSync(filePath, next, 'utf8');
}

function applyOfflinePatches() {
  for (const patch of patches) {
    applyPatch(patch.file, patch.pattern, patch.replacement, patch.label);
  }
}

function walkFiles(rootPath, predicate, output = []) {
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, output);
      continue;
    }
    if (predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function assertNoCdnDependencies() {
  const textFileExtensions = new Set(['.html', '.js', '.css', '.json']);
  const files = walkFiles(
    targetRoot,
    filePath => textFileExtensions.has(path.extname(filePath).toLowerCase())
  );
  const hits = [];
  for (const filePath of files) {
    const relativePath = path.relative(targetRoot, filePath).replace(/\\/g, '/');
    if (relativePath.startsWith('vendor/')) {
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    if (text.includes('cdn.jsdelivr.net')) {
      hits.push(relativePath);
    }
  }
  if (hits.length) {
    throw new Error(
      `Desktop app copy still references jsDelivr in: ${hits.join(', ')}`
    );
  }
}

function main() {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  requiredEntries.forEach(copyEntry);
  copyVendors();
  applyOfflinePatches();
  assertNoCdnDependencies();

  const manifest = {
    generatedAt: new Date().toISOString(),
    entries: requiredEntries,
    vendors: vendorEntries.map(entry => ({
      id: entry.id,
      target: entry.target
    })),
    offlinePatched: true
  };
  fs.writeFileSync(
    path.join(targetRoot, 'desktop-sync-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log(`[desktop:sync:web] synced ${requiredEntries.join(', ')} to ${targetRoot}`);
}

main();
