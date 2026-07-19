describe('table import format registry', () => {
  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    window.Shared = global.Shared;
    document.body.innerHTML = `
      <input id="table-file" type="file" data-file-formats="table">
      <input id="session-file" type="file" data-file-formats="session">
      <span id="welcome-formats" data-file-formats-label="welcome"></span>
    `;
    require('../js/shared/tableImport.js');
  });

  test('one registry drives accept metadata, labels, and dispatch', () => {
    const api = window.Shared.tableImport;
    api.applyFormatMetadata(document);

    expect(document.getElementById('table-file').getAttribute('accept')).toBe(
      '.csv,.tsv,.txt,.xls,.xlsx,.ods,.prism,.pzfx'
    );
    expect(document.getElementById('session-file').getAttribute('accept')).toBe('.graph,.json');
    expect(document.getElementById('welcome-formats').textContent).not.toContain('.json');
    expect(document.getElementById('welcome-formats').textContent).not.toContain('.session');
    expect(document.getElementById('welcome-formats').textContent).toContain('.pzfx');
    expect(document.getElementById('welcome-formats').textContent).toContain('.txt');
    expect(api.getDispatchKind('.xlsx')).toBe('spreadsheet');
    expect(api.getDispatchKind('csv')).toBe('tabular-text');
    expect(api.getDispatchKind('prism')).toBe('prism');
    expect(api.supportsExtension('pzfx', 'table')).toBe(true);
    expect(api.supportsExtension('graph', 'table')).toBe(false);
  });
});
