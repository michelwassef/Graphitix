const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../..');
const scannerPath = path.join(repositoryRoot, 'scripts/audit-tab-leak-surfaces.cjs');

test('the tab-isolation scanner follows local mutation helpers but skips read-only helpers', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-tab-scan-'));
  const fixturePath = path.join(tempRoot, 'helper-sinks.js');
  const fixture = `
function createComponent() {
let scatterTableFormat = 'grouped';
let savedFileHandle = null;
let savedFileName = 'graph.graph';
const currentOwner = { tabId: 'owner-a' };
function applyScatterTableFormatMode(nextMode) {
  scatterTableFormat = nextMode;
}
function patchLineTabFormat(session, value) {
  session.state.tableFormat = value;
}
function readOnlyLabel(input) {
  const label = input.value;
  return label;
}
function buildLocalOnly() {
  const resolved = [];
  resolved.push('local');
  return resolved;
}
const tableFormatSelect = { addEventListener() {} };
const labelInput = { addEventListener() {} };
const localOnlyButton = { addEventListener() {} };
const saveButton = { addEventListener() {} };
async function saveToFile() {
  await Shared.fileIO.saveGraphFile({
    owner: currentOwner,
    fileHandle: savedFileHandle,
    fileName: savedFileName
  });
}
tableFormatSelect.addEventListener('change', event => {
  applyScatterTableFormatMode(event.target.value);
});
bindLineControlHandler(tableFormatSelect, 'change', 'format', (event, ownerSession) => {
  if (!isLineSessionActive(ownerSession)) return;
  patchLineTabFormat(ownerSession, event.currentTarget.value);
});
labelInput.addEventListener('input', event => {
  readOnlyLabel(event.currentTarget);
});
localOnlyButton.addEventListener('click', () => {
  buildLocalOnly();
});
saveButton.addEventListener('click', saveToFile);
}
createComponent();
`;

  try {
    fs.writeFileSync(fixturePath, fixture, 'utf8');
    const result = spawnSync(process.execPath, [scannerPath, '--file', fixturePath, '--json'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    const callbacks = output.findings.filter(item => item.callback === '<anonymous callback>');
    const tableFormat = callbacks.find(item => item.helperWrites?.some(write => (
      write.name === 'scatterTableFormat'
      && write.via?.[0] === 'applyScatterTableFormatMode'
    )));
    const ownerBoundFormat = callbacks.find(item => item.ownerWrapperPresent && item.helperWrites?.some(write => (
      write.name === 'parameter:session'
      && write.kind === 'property assignment'
      && write.via?.[0] === 'patchLineTabFormat'
    )));

    expect(tableFormat).toBeTruthy();
    expect(tableFormat.ownerGuardOrderingCue).toEqual(expect.objectContaining({
      beforeLastCapturedWrite: null,
      helperWriteOrderingUnresolved: true
    }));
    expect(ownerBoundFormat).toBeTruthy();
    expect(ownerBoundFormat.triageReasons).toContain('durable-looking names: parameter:session');
    expect(callbacks).toHaveLength(2);

    const fileSave = output.findings.find(item => (
      item.callback === 'saveToFile'
      && item.externalSinks?.some(sink => sink.name === 'Shared.fileIO.saveGraphFile')
    ));
    expect(fileSave).toBeTruthy();
    expect(fileSave.externalSinks[0].selectors).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'owner', expression: 'currentOwner', scopeDepth: 1 }),
      expect.objectContaining({ key: 'fileHandle', expression: 'savedFileHandle', scopeDepth: 1 })
    ]));
    expect(output.summary.externalFileWriteCandidates).toBeGreaterThan(0);

    const moduleScopeResult = spawnSync(process.execPath, [
      scannerPath, '--file', fixturePath, '--module-scope-only', '--json'
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    });
    expect(moduleScopeResult.status).toBe(0);
    const moduleScopeOutput = JSON.parse(moduleScopeResult.stdout);
    expect(moduleScopeOutput.summary.filteredCandidates).toBe(1);
    expect(moduleScopeOutput.findings).toHaveLength(1);
    expect(moduleScopeOutput.findings[0].helperWrites).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'scatterTableFormat', scopeDepth: 1 })
    ]));

    const directOnlyResult = spawnSync(process.execPath, [
      scannerPath, '--file', fixturePath, '--helper-depth=0', '--json'
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    });
    expect(directOnlyResult.status).toBe(0);
    const directOnlyOutput = JSON.parse(directOnlyResult.stdout);
    expect(directOnlyOutput.summary.helperDepth).toBe(0);
    expect(directOnlyOutput.findings).toHaveLength(1);
    expect(directOnlyOutput.findings[0].externalSinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Shared.fileIO.saveGraphFile' })
    ]));
  } finally {
    const resolvedTempRoot = path.resolve(tempRoot);
    expect(resolvedTempRoot.startsWith(path.resolve(os.tmpdir()))).toBe(true);
    fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
  }
});

test('the scanner reports Scatter table-format transformation sinks through its owner binder', () => {
  const result = spawnSync(process.execPath, [
    scannerPath, '--file', 'js/components/scatter.js', '--json', '--all'
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  expect(result.status).toBe(0);
  const output = JSON.parse(result.stdout);
  const candidate = output.findings.find(item => (
    item.registeredBy === 'bindScatterControlListener'
    && item.helperWrites?.some(write => (
      write.name === 'scatterTableFormat'
      && write.via?.[0] === 'applyScatterTableFormatMode'
    ))
    && item.helperWrites?.some(write => write.name === 'hot.loadData')
  ));

  expect(candidate).toEqual(expect.objectContaining({
    ownerWrapperPresent: true,
    ownerGuardOrderingCue: expect.objectContaining({ helperWriteOrderingUnresolved: true })
  }));
});

test('the scanner attributes callback registrations to the lexically resolved function', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-tab-scan-scope-'));
  const fixturePath = path.join(tempRoot, 'shadowed-callbacks.js');
  const fixture = `
let durableState = 'ready';
function registerDurableCleanup() {
  function cancel() {
    durableState = 'cleared';
  }
  setTimeout(cancel, 0);
}
function registerLocalRestore() {
  let localCount = 0;
  function cancel() {
    localCount += 1;
  }
  setTimeout(cancel, 0);
}
registerDurableCleanup();
registerLocalRestore();
`;

  try {
    fs.writeFileSync(fixturePath, fixture, 'utf8');
    const result = spawnSync(process.execPath, [scannerPath, '--file', fixturePath, '--json'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    const callbacks = output.findings.filter(item => item.callback === 'cancel');
    const durableCancel = callbacks.find(item => item.capturedWrites?.some(write => write.name === 'durableState'));
    const localCancel = callbacks.find(item => item.capturedWrites?.some(write => write.name === 'localCount'));
    const durableTimerLine = fixture.split('\n').findIndex(line => line.includes('setTimeout(cancel')) + 1;
    const localTimerLine = fixture.split('\n').map((line, index) => ({ line, number: index + 1 }))
      .findLast(item => item.line.includes('setTimeout(cancel'))?.number;

    expect(durableCancel).toBeTruthy();
    expect(localCancel).toBeTruthy();
    expect(durableCancel.registrationSites.map(site => site.line)).toEqual([durableTimerLine]);
    expect(localCancel.registrationSites.map(site => site.line)).toEqual([localTimerLine]);
  } finally {
    const resolvedTempRoot = path.resolve(tempRoot);
    expect(resolvedTempRoot.startsWith(path.resolve(os.tmpdir()))).toBe(true);
    fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
  }
});
