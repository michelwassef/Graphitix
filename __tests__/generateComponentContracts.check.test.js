const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'generate-component-contracts.js');
const COMPONENTS_PATH = path.join(ROOT, 'js', 'main', 'components.js');
const CONTRACT_PATH = path.join(ROOT, 'docs', 'development', 'component-contracts.md');

function runCheck(cwd) {
  return spawnSync(process.execPath, ['scripts/generate-component-contracts.js', '--check'], {
    cwd,
    encoding: 'utf8'
  });
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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-contract-crlf-'));
    try {
      const scriptTarget = path.join(tempRoot, 'scripts', 'generate-component-contracts.js');
      const componentsTarget = path.join(tempRoot, 'js', 'main', 'components.js');
      const contractTarget = path.join(tempRoot, 'docs', 'development', 'component-contracts.md');

      fs.mkdirSync(path.dirname(scriptTarget), { recursive: true });
      fs.mkdirSync(path.dirname(componentsTarget), { recursive: true });
      fs.mkdirSync(path.dirname(contractTarget), { recursive: true });
      fs.copyFileSync(SCRIPT_PATH, scriptTarget);
      fs.copyFileSync(COMPONENTS_PATH, componentsTarget);
      const contract = fs.readFileSync(CONTRACT_PATH, 'utf8').replace(/\r?\n/g, '\r\n');
      fs.writeFileSync(contractTarget, contract, 'utf8');

      const result = runCheck(tempRoot);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Verified docs/development/component-contracts.md');
      expect(fs.readFileSync(contractTarget, 'utf8')).toBe(contract);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('fails read-only when the generated contract is stale', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-contract-check-'));
    try {
      const scriptTarget = path.join(tempRoot, 'scripts', 'generate-component-contracts.js');
      const componentsTarget = path.join(tempRoot, 'js', 'main', 'components.js');
      const contractTarget = path.join(tempRoot, 'docs', 'development', 'component-contracts.md');

      fs.mkdirSync(path.dirname(scriptTarget), { recursive: true });
      fs.mkdirSync(path.dirname(componentsTarget), { recursive: true });
      fs.mkdirSync(path.dirname(contractTarget), { recursive: true });
      fs.copyFileSync(SCRIPT_PATH, scriptTarget);
      fs.copyFileSync(COMPONENTS_PATH, componentsTarget);
      fs.writeFileSync(contractTarget, 'stale contract\n', 'utf8');

      const result = runCheck(tempRoot);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('docs/development/component-contracts.md is stale');
      expect(fs.readFileSync(contractTarget, 'utf8')).toBe('stale contract\n');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
