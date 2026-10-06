const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'generate-component-contracts.js');
const COMPONENTS_PATH = path.join(ROOT, 'js', 'main', 'components.js');
const CONTRACT_PATH = path.join(ROOT, 'docs', 'development', 'component-contracts.md');

function runCheck(cwd) {
  return spawnSync(process.execPath, ['scripts/generate-component-contracts.js', '--check'], {
    cwd,
    encoding: 'utf8'
  });
}

function createTempProject(contractText) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-component-contract-'));
  const scriptTarget = path.join(tempRoot, 'scripts', 'generate-component-contracts.js');
  const componentsTarget = path.join(tempRoot, 'js', 'main', 'components.js');
  const componentDirectoryTarget = path.join(tempRoot, 'js', 'components');
  const contractTarget = path.join(tempRoot, 'docs', 'development', 'component-contracts.md');

  fs.mkdirSync(path.dirname(scriptTarget), { recursive: true });
  fs.mkdirSync(path.dirname(componentsTarget), { recursive: true });
  fs.mkdirSync(path.dirname(contractTarget), { recursive: true });
  fs.copyFileSync(SCRIPT_PATH, scriptTarget);
  fs.copyFileSync(COMPONENTS_PATH, componentsTarget);
  fs.cpSync(path.join(ROOT, 'js', 'components'), componentDirectoryTarget, { recursive: true });
  fs.writeFileSync(contractTarget, contractText, 'utf8');
  return tempRoot;
}

function firstBundleDescriptor(rootDir) {
  const sourcePath = path.join(rootDir, 'js', 'main', 'components.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const match = source.match(/^\s{4}([a-z][a-z0-9_]*):\s*\{\s*browserPath:\s*'([^']+)',\s*requirePath:\s*'([^']+)'\s*\},?$/m);
  if (!match) throw new Error('Component bundle fixture descriptor was not found.');
  return {
    line: match[0],
    type: match[1],
    browserPath: match[2],
    requirePath: match[3]
  };
}

function updateFirstBundleDescriptor(rootDir, update) {
  const sourcePath = path.join(rootDir, 'js', 'main', 'components.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const descriptor = firstBundleDescriptor(rootDir);
  fs.writeFileSync(sourcePath, source.replace(descriptor.line, update(descriptor)), 'utf8');
  return descriptor;
}

describe('component-contract documentation check mode', () => {
  test('verifies the checked-in contract without rewriting it', () => {
    const before = fs.readFileSync(CONTRACT_PATH, 'utf8');
    const result = runCheck(ROOT);
    const after = fs.readFileSync(CONTRACT_PATH, 'utf8');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Verified docs/development/component-contracts.md');
    expect(after).toBe(before);
  });

  test('accepts Windows line endings without rewriting the checked file', () => {
    const contract = fs.readFileSync(CONTRACT_PATH, 'utf8').replace(/\r?\n/g, '\r\n');
    const tempRoot = createTempProject(contract);
    try {
      const contractTarget = path.join(tempRoot, 'docs', 'development', 'component-contracts.md');

      const result = runCheck(tempRoot);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Verified docs/development/component-contracts.md');
      expect(fs.readFileSync(contractTarget, 'utf8')).toBe(contract);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('fails read-only when the generated contract is stale', () => {
    const tempRoot = createTempProject('stale contract\n');
    try {
      const contractTarget = path.join(tempRoot, 'docs', 'development', 'component-contracts.md');

      const result = runCheck(tempRoot);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('docs/development/component-contracts.md is stale');
      expect(fs.readFileSync(contractTarget, 'utf8')).toBe('stale contract\n');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('fails closed when a declared component source file is missing', () => {
    const tempRoot = createTempProject(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    try {
      const descriptor = firstBundleDescriptor(tempRoot);
      const componentPath = path.resolve(path.dirname(path.join(tempRoot, 'js', 'main', 'components.js')), descriptor.requirePath);
      fs.rmSync(componentPath);

      const result = runCheck(tempRoot);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('bundle source is missing');
      expect(result.stderr).toContain(descriptor.type);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('rejects a descriptor that points to a nonexistent component file', () => {
    const tempRoot = createTempProject(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    try {
      updateFirstBundleDescriptor(tempRoot, descriptor => descriptor.line.replace(
        `requirePath: '${descriptor.requirePath}'`,
        "requirePath: '../components/missing-component.js'"
      ));

      const result = runCheck(tempRoot);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Node bundle source is missing');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('rejects a component source registered under the wrong global key', () => {
    const tempRoot = createTempProject(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    try {
      const descriptor = firstBundleDescriptor(tempRoot);
      const componentPath = path.resolve(path.dirname(path.join(tempRoot, 'js', 'main', 'components.js')), descriptor.requirePath);
      const source = fs.readFileSync(componentPath, 'utf8');
      const registration = new RegExp(`(\\bComponents\\.)${descriptor.type}(\\s*=)`);
      expect(registration.test(source)).toBe(true);
      fs.writeFileSync(componentPath, source.replace(registration, '$1wrongComponent$2'), 'utf8');

      const result = runCheck(tempRoot);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`does not register Components.${descriptor.type}`);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('rejects a component source that omits a required implementation hook', () => {
    const tempRoot = createTempProject(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    try {
      const descriptor = firstBundleDescriptor(tempRoot);
      const componentPath = path.resolve(path.dirname(path.join(tempRoot, 'js', 'main', 'components.js')), descriptor.requirePath);
      const source = fs.readFileSync(componentPath, 'utf8');
      const hookAssignment = new RegExp(`^\\s*${descriptor.type}\\.rehydrateGraphInteractions\\s*=`, 'm');
      expect(hookAssignment.test(source)).toBe(true);
      fs.writeFileSync(componentPath, source.replace(hookAssignment, `  // ${descriptor.type}.rehydrateGraphInteractions removed`), 'utf8');

      const result = runCheck(tempRoot);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`missing required source hook "rehydrateGraphInteractions"`);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
