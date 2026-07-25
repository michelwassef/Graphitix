describe('fontControls debug logging', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div class="workspace-toolbar">
        <div class="workspace-toolbar__section workspace-toolbar__section--dock"></div>
      </div>
    `;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('hot-path text registration logs only when canonical debug logging is enabled', () => {
    require('../js/vendor.js');
    require('../js/shared/debug.js');
    require('../js/shared/fontControls.js');
    window.Shared.disableDebugLogging();
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

    const first = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    first.textContent = 'Row 1';
    window.Shared.fontControls.markText(first, {
      scopeId: 'heatmap',
      tabId: 'workspace-1',
      role: 'rowLabel',
      key: 'row-label-0'
    });
    expect(debugSpy).not.toHaveBeenCalled();

    window.Shared.enableDebugLogging();
    const second = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    second.textContent = 'Row 2';
    window.Shared.fontControls.markText(second, {
      scopeId: 'heatmap',
      tabId: 'workspace-1',
      role: 'rowLabel',
      key: 'row-label-1'
    });
    expect(debugSpy).toHaveBeenCalledWith(
      'Debug: fontControls markText applied',
      expect.objectContaining({ role: 'rowLabel', key: 'row-label-1' })
    );
  });
});
