describe('Shared panel resizer layout persistence', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="panelRoot" data-workspace-tab-id="tab-1">
        <div id="tablePanel"></div>
        <div id="panelResizer"></div>
        <div id="graphPanel"></div>
      </div>
    `;

    const tablePanel = document.getElementById('tablePanel');
    const graphPanel = document.getElementById('graphPanel');
    tablePanel.getBoundingClientRect = () => ({ width: 400, height: 600 });
    graphPanel.getBoundingClientRect = () => ({ width: 800, height: 600 });

    const tab = { id: 'tab-1', type: 'scatter', isWelcome: false };
    window.Shared = {
      workspaceTabs: {
        resolveTab: value => value ? tab : tab
      }
    };
    window.Main = {
      session: {
        markTabUserModified: jest.fn(),
        captureUserModifiedTabLayout: jest.fn(() => true)
      }
    };

    require('../js/shared/resizer.js');
  });

  test('commits panel width through the owning session without undo state', () => {
    const panelResizer = document.getElementById('panelResizer');
    const tablePanel = document.getElementById('tablePanel');
    const graphPanel = document.getElementById('graphPanel');
    const syncPanels = jest.fn();

    window.Shared.resizer.attachPanelDragResizer({
      panelResizer,
      tablePanel,
      graphPanel,
      syncPanels,
      debugLabel: 'scatter'
    });

    panelResizer.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 400
    }));
    document.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 560
    }));
    document.dispatchEvent(new MouseEvent('pointerup', {
      bubbles: true,
      clientX: 560
    }));

    expect(syncPanels).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'drag',
      source: 'panel-drag'
    }));
    expect(syncPanels).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'end',
      source: 'panel-drag'
    }));
    expect(window.Main.session.markTabUserModified).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-1', type: 'scatter' }),
      'scatter-panel-drag',
      expect.objectContaining({
        origin: 'user',
        affectsPayload: false,
        captureCanonical: false
      })
    );
    expect(window.Main.session.captureUserModifiedTabLayout).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-1', type: 'scatter' }),
      { reason: 'scatter-panel-drag' }
    );
  });
});
