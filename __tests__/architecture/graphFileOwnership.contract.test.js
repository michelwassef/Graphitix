const fs = require('fs');
const path = require('path');

const components = [
  'box',
  'heatmap',
  'hist',
  'line',
  'pca',
  'pie',
  'roc',
  'scatter',
  'surface',
  'survival',
  'venn'
];

const readSource = relativePath => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('workspace graph-file ownership contract', () => {
  test.each(components)('%s routes Save, Save As and Open through Main', component => {
    const source = readSource(`js/components/${component}.js`);
    expect(source).toContain(`${component}.save = () => global.Main?.fileActions?.save?.()`);
    expect(source).toContain(`${component}.saveAs = () => global.Main?.fileActions?.saveAs?.()`);
    expect(source).toContain(`${component}.open = () => global.Main?.fileActions?.open?.()`);
    expect(source).not.toMatch(/fileIO|fileHandle|loadFromFile|GraphFileInput|routeGraphOpenPayload/);
  });

  test('Main delegates component actions to the workspace session controller', () => {
    const main = readSource('js/main.js');
    expect(main).toContain('Main.fileActions = Object.freeze({');
    expect(main).toContain("save: () => handleSessionSaveClick({ reason: 'component-file-action-save' })");
    expect(main).toContain("saveAs: () => handleSessionSaveClick({ reason: 'component-file-action-save-as', forcePicker: true })");
    expect(main).toContain("open: () => handleSessionLoadClick({ reason: 'component-file-action-open' })");
  });

  test('the workspace session controller owns document targets and Save routing', () => {
    const source = readSource('js/main/sessionActions.js');
    expect(source).toContain('workspaceState.sessionFileHandle');
    expect(source).toContain('resolveSessionFileTargetKind(workspaceState)');
    expect(source).toContain('options.forcePicker');
    expect(source).toContain('saveWorkspaceArchiveWithScope(context');
  });

  test('shared fileIO rejects stale graph opens and resolves save payloads from their owner', () => {
    const source = readSource('js/shared/fileIO.js');
    for (const marker of [
      'createGraphOpenOperation',
      'latestGraphOpenOperationByOwner',
      'payload-type-mismatch',
      'stale-operation',
      'stale-owner',
      'commitTabPayload',
      'createGraphSaveOperation',
      'resolveSavePayload',
      'inactiveOwnerCanonicalPayload'
    ]) {
      expect(source).toContain(marker);
    }
  });
});
