'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { COMPONENT_CATALOG } = require('../test-support/componentCatalog.js');
const { COMPONENT_RULES } = require('../test-support/impactMap.js');
const {
  LEGACY_UNMAPPED_BASELINE,
  buildFileManifest,
  summarizeManifest,
  validateManifest
} = require('../test-support/testManifest.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXPECTED_COMPONENT_TYPES = [
  'venn', 'box', 'scatter', 'pca', 'line', 'heatmap',
  'surface', 'roc', 'survival', 'hist', 'pie'
];
const INTENTIONALLY_UNMAPPED_FILES = Object.freeze([
  '__tests__/exporter.firefoxSvgCopy.test.js',
  '__tests__/tableImport.firefoxExcelPaste.test.js'
]);

function toRelative(filePath, rootDir = ROOT_DIR) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function readSourceLines(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

function countMatches(filePaths, pattern, rootDir = ROOT_DIR) {
  let count = 0;
  const files = [];
  for (const relative of filePaths) {
    const absolute = path.resolve(rootDir, relative);
    const text = fs.readFileSync(absolute, 'utf8');
    const matches = text.match(pattern) || [];
    if (matches.length > 0) {
      count += matches.length;
      files.push({ file: relative, count: matches.length });
    }
  }
  return { count, files };
}

function collectLineMatches(filePaths, pattern, rootDir = ROOT_DIR) {
  const files = [];
  let count = 0;
  for (const relative of filePaths) {
    const absolute = path.resolve(rootDir, relative);
    const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
    const matches = [];
    lines.forEach((line, index) => {
      if (!pattern.test(line)) return;
      matches.push({ line: index + 1, text: line.trim() });
      pattern.lastIndex = 0;
    });
    if (matches.length > 0) {
      count += matches.length;
      files.push({ file: relative, matches });
    }
  }
  return { count, files };
}

function collectWorkerComponentTypes(rootDir = ROOT_DIR) {
  return COMPONENT_CATALOG
    .filter(component => {
      const componentPath = path.join(rootDir, 'js', 'components', `${component.type}.js`);
      if (!fs.existsSync(componentPath)) return false;
      return /Shared\.Workers|\b[A-Za-z]+Worker\b|\bWorker\b/.test(fs.readFileSync(componentPath, 'utf8'));
    })
    .map(component => component.type);
}

function collectStaticInventory(rootDir = ROOT_DIR) {
  const testFiles = walkFiles(path.join(rootDir, '__tests__'))
    .filter(file => /\.(?:test|spec)\.js$/.test(file))
    .map(file => toRelative(file, rootDir));
  const jestFiles = testFiles.filter(file => file.endsWith('.test.js'));
  const orphanJestSpecs = testFiles.filter(file => file.endsWith('.spec.js'));
  const e2eSpecs = walkFiles(path.join(rootDir, 'e2e'))
    .filter(file => file.endsWith('.spec.js'))
    .map(file => toRelative(file, rootDir));
  const contractSpecs = e2eSpecs.filter(file => /\.contract\.spec\.js$/.test(file));
  const testTree = walkFiles(path.join(rootDir, '__tests__'))
    .filter(file => file.endsWith('.js'))
    .map(file => toRelative(file, rootDir));
  const e2eTree = walkFiles(path.join(rootDir, 'e2e'))
    .filter(file => file.endsWith('.js'))
    .map(file => toRelative(file, rootDir));

  const staticFiles = {
    jestTests: jestFiles,
    orphanJestSpecs,
    e2eSpecs,
    testTree,
    e2eTree
  };

  return {
    files: {
      jestTestFiles: jestFiles.length,
      testFilesPresent: testFiles.length,
      orphanJestSpecs: orphanJestSpecs.length,
      e2eSpecs: e2eSpecs.length,
      testTreeJavaScript: testTree.length,
      e2eTreeJavaScript: e2eTree.length
    },
    lines: {
      jestSpecs: jestFiles.reduce((sum, file) => sum + readSourceLines(path.resolve(rootDir, file)), 0),
      testTree: testTree.reduce((sum, file) => sum + readSourceLines(path.resolve(rootDir, file)), 0),
      e2eSpecs: e2eSpecs.reduce((sum, file) => sum + readSourceLines(path.resolve(rootDir, file)), 0),
      e2eTree: e2eTree.reduce((sum, file) => sum + readSourceLines(path.resolve(rootDir, file)), 0)
    },
    patterns: {
      e2eWaitForTimeout: countMatches(e2eSpecs, /\bwaitForTimeout\s*\(/g, rootDir),
      e2eSetTimeout: countMatches(e2eSpecs, /\bsetTimeout\s*\(/g, rootDir),
      e2ePageEvaluate: countMatches(e2eSpecs, /\bpage\.evaluate\s*\(/g, rootDir),
      // Playwright locator actions are awaited; this metric targets the
      // synchronous element.click() calls used inside page.evaluate setup.
      e2eDirectDomClicks: countMatches(e2eSpecs, /(?<!await )\b(?:button|element|node)\.click\s*\(/g, rootDir),
      e2eSuppressedFailures: countMatches(e2eSpecs, /\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/g, rootDir),
      e2eContractWaitForTimeout: countMatches(contractSpecs, /\bwaitForTimeout\s*\(/g, rootDir),
      e2eContractSetTimeout: countMatches(contractSpecs, /(?<![\w.])setTimeout\s*\(/g, rootDir),
      e2eContractSuppressedFailures: countMatches(contractSpecs, /\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/g, rootDir),
      jestProductionRequires: countMatches(jestFiles, /require\(\s*['"]\.\.\/js\//g, rootDir),
      jestBeforeEach: countMatches(jestFiles, /\bbeforeEach\s*\(/g, rootDir),
      jestAfterEach: countMatches(jestFiles, /\bafterEach\s*\(/g, rootDir),
      jestSourceReads: countMatches(jestFiles, /\breadFileSync\s*\(/g, rootDir),
      conditionalSkips: countMatches([...jestFiles, ...e2eSpecs], /\btest\.skip\s*\(/g, rootDir),
      skipDeclarations: collectLineMatches([...jestFiles, ...e2eSpecs], /\btest\.skip\s*\(/g, rootDir),
      fixmes: countMatches([...jestFiles, ...e2eSpecs], /\b(?:test|describe)\.fixme\s*\(/g, rootDir),
      fixedScratchPaths: countMatches(e2eSpecs, /path\.resolve\(__dirname,\s*['"]\.tmp/g, rootDir),
      componentMatrixArrays: countMatches([...testTree, ...e2eTree], /COMPONENT_MATRIX\s*=\s*\[/g, rootDir)
    },
    catalog: {
      count: COMPONENT_CATALOG.length,
      types: COMPONENT_CATALOG.map(component => component.type),
      frozen: Object.isFrozen(COMPONENT_CATALOG),
      workerSourceTypes: collectWorkerComponentTypes(rootDir),
      workerCatalogTypes: COMPONENT_CATALOG
        .filter(component => component.capabilities.worker === true)
        .map(component => component.type),
      impactMapComponentTypes: Array.from(new Set(COMPONENT_RULES
        .map(rule => rule.component)
        .filter(Boolean)))
    },
    _files: staticFiles
  };
}

function runNodeCli(rootDir, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed with status ${result.status}: ${process.execPath} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function parseJestDiscovery(output) {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start < 0 || end < start) {
    throw new Error('Jest discovery did not return a JSON array.');
  }
  return JSON.parse(output.slice(start, end + 1)).map(file => String(file));
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function parsePlaywrightDiscovery(output) {
  const clean = stripAnsi(output);
  const match = clean.match(/Total:\s*(\d+)\s+tests?\s+in\s+(\d+)\s+files?/i);
  if (!match) {
    throw new Error('Playwright discovery did not report a total.');
  }
  return { tests: Number(match[1]), files: Number(match[2]) };
}

function collectFrameworkDiscovery(rootDir = ROOT_DIR) {
  const jestCli = path.join(rootDir, 'node_modules', 'jest', 'bin', 'jest.js');
  const playwrightCli = path.join(rootDir, 'node_modules', '@playwright', 'test', 'cli.js');
  if (!fs.existsSync(jestCli) || !fs.existsSync(playwrightCli)) {
    throw new Error('Dependencies are not installed; framework discovery cannot run.');
  }
  const jestPaths = parseJestDiscovery(runNodeCli(rootDir, [jestCli, '--listTests', '--json']));
  const playwright = parsePlaywrightDiscovery(runNodeCli(rootDir, [playwrightCli, 'test', '--list', '--project=chromium']));
  return {
    jest: {
      files: jestPaths.length,
      paths: jestPaths.map(file => toRelative(file, rootDir))
    },
    playwright: {
      chromium: playwright,
      firefox: { status: 'deferred', tests: null, files: null }
    }
  };
}

function validateInventory(inventory) {
  const failures = [];
  const staticData = inventory.static;
  const discovery = inventory.discovery;
  const discoveredJest = new Set(discovery.jest.paths);
  const missingJest = staticData._files.jestTests.filter(file => !discoveredJest.has(file));
  if (staticData.files.orphanJestSpecs > 0) {
    failures.push(`orphan Jest-style specs: ${staticData._files.orphanJestSpecs.join(', ')}`);
  }
  if (missingJest.length > 0) {
    failures.push(`Jest test files not discovered: ${missingJest.join(', ')}`);
  }
  if (discovery.jest.files !== staticData.files.jestTestFiles) {
    failures.push(`Jest discovery count ${discovery.jest.files} differs from ${staticData.files.jestTestFiles} test files`);
  }
  if (discovery.playwright.chromium.files !== staticData.files.e2eSpecs) {
    failures.push(`Chromium discovery files ${discovery.playwright.chromium.files} differs from ${staticData.files.e2eSpecs} E2E specs`);
  }
  if (!staticData.catalog.frozen || staticData.catalog.types.join('|') !== EXPECTED_COMPONENT_TYPES.join('|')) {
    failures.push('component catalog is incomplete, reordered, or mutable');
  }
  if (staticData.catalog.workerSourceTypes.join('|') !== staticData.catalog.workerCatalogTypes.join('|')) {
    failures.push('component worker capability catalog differs from component source');
  }
  if (staticData.catalog.impactMapComponentTypes.join('|') !== EXPECTED_COMPONENT_TYPES.join('|')) {
    failures.push('changed-path impact map does not cover every component');
  }
  if (staticData.patterns.componentMatrixArrays.count > 0) {
    failures.push('component matrix array definitions remain outside the canonical catalog');
  }
  if (staticData.patterns.e2eContractWaitForTimeout.count > 0) {
    failures.push('contract specs contain arbitrary page.waitForTimeout calls');
  }
  if (staticData.patterns.e2eContractSetTimeout.count > 0) {
    failures.push('contract specs contain unclassified timer-based waits');
  }
  if (staticData.patterns.e2eContractSuppressedFailures.count > 0) {
    failures.push('contract specs suppress failures with empty catch handlers');
  }
  for (const fileRecord of staticData.patterns.skipDeclarations.files) {
    for (const match of fileRecord.matches) {
      if (!/,\s*['"`][^'"`\r\n]+['"`]/.test(match.text)) {
        failures.push(`conditional skip has no explicit reason: ${fileRecord.file}:${match.line}`);
      }
      if (fileRecord.file.startsWith('e2e/')
        && (!/browserName/.test(match.text) || !/chromium/i.test(match.text))) {
        failures.push(`E2E skip is not explicitly Chromium-scoped: ${fileRecord.file}:${match.line}`);
      }
    }
  }
  if (staticData.patterns.fixmes.count > 0) {
    failures.push('test.fixme/describe.fixme declarations require explicit migration review');
  }
  if (inventory.manifest?.entries) {
    failures.push(...validateManifest(inventory.manifest.entries));
    if (inventory.manifest.entries.length !== discovery.jest.files + staticData.files.e2eSpecs) {
      failures.push('generated manifest does not cover every discovered test file');
    }
    if (inventory.manifest.summary.unmapped > LEGACY_UNMAPPED_BASELINE) {
      failures.push(`legacy-unmapped test count increased from ${LEGACY_UNMAPPED_BASELINE} to ${inventory.manifest.summary.unmapped}`);
    }
    const allowedUnmapped = new Set(INTENTIONALLY_UNMAPPED_FILES);
    const unmapped = inventory.manifest.entries
      .filter(entry => entry.status === 'legacy-unmapped')
      .map(entry => entry.file);
    const unexpected = unmapped.filter(file => !allowedUnmapped.has(file));
    const missingAllowed = INTENTIONALLY_UNMAPPED_FILES.filter(file => !unmapped.includes(file));
    if (unexpected.length > 0) {
      failures.push(`unmapped discovered tests require reviewed scenario IDs: ${unexpected.join(', ')}`);
    }
    if (missingAllowed.length > 0) {
      failures.push(`intentional unmapped allowlist no longer matches discovery: ${missingAllowed.join(', ')}`);
    }
  }
  return failures;
}

function buildInventory(rootDir = ROOT_DIR) {
  const staticInventory = collectStaticInventory(rootDir);
  const discovery = collectFrameworkDiscovery(rootDir);
  const manifestEntries = buildFileManifest({
    jestPaths: discovery.jest.paths,
    e2ePaths: staticInventory._files.e2eSpecs
  });
  const manifest = {
    summary: summarizeManifest(manifestEntries),
    entries: manifestEntries
  };
  return {
    schemaVersion: 1,
    static: staticInventory,
    discovery,
    manifest,
    checks: validateInventory({ static: staticInventory, discovery, manifest })
  };
}

function printHuman(inventory, check) {
  const { static: staticData, discovery } = inventory;
  console.log(`Jest: ${discovery.jest.files} discovered (${staticData.files.jestTestFiles} .test.js files)`);
  console.log(`Playwright: Chromium ${discovery.playwright.chromium.tests} tests / ${discovery.playwright.chromium.files} files; Firefox discovery deferred`);
  console.log(`E2E waits: waitForTimeout=${staticData.patterns.e2eWaitForTimeout.count}, setTimeout=${staticData.patterns.e2eSetTimeout.count}`);
  console.log(`E2E shortcuts: direct DOM clicks=${staticData.patterns.e2eDirectDomClicks.count}, suppressed failures=${staticData.patterns.e2eSuppressedFailures.count}, contract waits=${staticData.patterns.e2eContractWaitForTimeout.count}, contract timers=${staticData.patterns.e2eContractSetTimeout.count}`);
  console.log(`Catalog: ${staticData.catalog.types.join(', ')}`);
  console.log(`Manifest: ${inventory.manifest.summary.total} files, ${inventory.manifest.summary.unmapped} legacy-unmapped`);
  if (check) {
    if (inventory.checks.length > 0) {
      for (const failure of inventory.checks) console.error(`FAIL ${failure}`);
      process.exitCode = 1;
    } else {
      console.log('Inventory checks passed.');
    }
  }
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const inventory = buildInventory(ROOT_DIR);
  if (args.has('--json')) {
    const output = { ...inventory };
    delete output.static._files;
    delete output.discovery.jest.paths;
    delete output.manifest.entries;
    console.log(JSON.stringify(output, null, 2));
  } else {
    printHuman(inventory, args.has('--check'));
  }
  if (args.has('--check') && inventory.checks.length > 0) {
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED_COMPONENT_TYPES,
  INTENTIONALLY_UNMAPPED_FILES,
  collectStaticInventory,
  collectFrameworkDiscovery,
  validateInventory,
  buildInventory
};
