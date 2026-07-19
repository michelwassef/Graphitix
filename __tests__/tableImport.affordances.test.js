describe('table import format affordances', () => {
  const tableFileInputIds = [
    'boxFile',
    'scatterFile',
    'pcaFile',
    'surfaceFile',
    'lineFile',
    'heatmapFile',
    'rocFile',
    'survivalFile',
    'histFile',
    'pieFile'
  ];

  beforeAll(() => {
    require('../js/shared/tableImport.js');
    window.Shared.tableImport.applyFormatMetadata(document);
  });

  test('table import file inputs expose PZFX beside PRISM', () => {
    for(const id of tableFileInputIds){
      const input = document.getElementById(id);
      expect(input).toBeTruthy();
      expect(input.dataset.fileFormats).toBe('table');
      const accepted = window.Shared.tableImport
        .getAcceptedExtensions(input.dataset.fileFormats)
        .map(extension => `.${extension}`);
      expect(accepted).toContain('.prism');
      expect(accepted).toContain('.pzfx');
    }
  });

  test('shared import toolbar tooltip lists PZFX beside PRISM', () => {
    const host = document.createElement('div');
    host.className = 'workspace-page__topbar';
    host.dataset.toolbar = 'box';
    document.body.appendChild(host);

    window.Shared.workspaceToolbar.renderForElement(host);

    const importButton = host.querySelector('#boxImport');
    expect(importButton).toBeTruthy();
    expect(importButton.title).toContain('PRISM');
    expect(importButton.title).toContain('PZFX');
  });
});
