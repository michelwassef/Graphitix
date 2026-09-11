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

  beforeEach(() => {
    jest.resetModules();
    global.Shared = window.Shared = {};
    global.Main = window.Main = {};
    document.body.innerHTML = `
      ${tableFileInputIds.map(id => `<input id="${id}" type="file" data-file-formats="table">`).join('')}
      <div class="workspace-page__topbar" data-toolbar="box">
        <div data-toolbar-root></div>
      </div>
    `;
    require('../../js/shared/tableImport.js');
    require('../../js/shared/workspaceToolbar.js');
  });

  test('table import file inputs expose PZFX beside PRISM', () => {
    window.Shared.tableImport.applyFormatMetadata(document);

    for (const id of tableFileInputIds) {
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
    const host = document.querySelector('.workspace-page__topbar');
    window.Shared.workspaceToolbar.renderForElement(host);

    const importButton = host.querySelector('#boxImport');
    expect(importButton).toBeTruthy();
    expect(importButton.title).toContain('PRISM');
    expect(importButton.title).toContain('PZFX');
  });
});
