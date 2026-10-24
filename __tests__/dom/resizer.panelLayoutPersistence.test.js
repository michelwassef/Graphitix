describe('Shared panel resizer layout persistence', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="panelRoot" data-workspace-tab-id="tab-1">
        <div id="tablePanel"></div>
        <div id="panelResizer" class="panel-resizer"></div>
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

    require('../../js/shared/resizer.js');
    require('../../js/shared/componentLayout.js');
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

  test('keyboard divider movement shares resize persistence and exposes its live value', () => {
    const panelResizer = document.getElementById('panelResizer');
    const tablePanel = document.getElementById('tablePanel');
    const graphPanel = document.getElementById('graphPanel');
    const syncPanels = jest.fn();
    document.documentElement.style.setProperty('--workspace-data-panel-min-width', '150px');
    tablePanel.style.minWidth = '0px';
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    jest.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      if(element === tablePanel){
        return {
          minWidth: '0px',
          getPropertyValue: name => name === '--workspace-data-panel-min-width' ? '150px' : ''
        };
      }
      return nativeGetComputedStyle(element);
    });
    tablePanel.getBoundingClientRect = () => ({ width: tablePanel.style.width ? Number.parseFloat(tablePanel.style.width) : 400, height: 600 });
    graphPanel.getBoundingClientRect = () => ({ width: graphPanel.style.width ? Number.parseFloat(graphPanel.style.width) : 800, height: 600 });
    panelResizer.setAttribute('role', 'separator');
    panelResizer.setAttribute('aria-valuemin', '0');
    panelResizer.setAttribute('aria-valuemax', '100');

    window.Shared.resizer.attachPanelDragResizer({ panelResizer, tablePanel, graphPanel, syncPanels, debugLabel: 'scatter' });
    panelResizer.focus();
    panelResizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));

    expect(Number.parseFloat(tablePanel.style.width)).toBe(424);
    expect(tablePanel.style.minWidth).toBe('0px');
    expect(Number.parseFloat(graphPanel.style.width)).toBe(776);
    expect(panelResizer.getAttribute('aria-valuenow')).toBe('35');
    expect(panelResizer.getAttribute('aria-valuetext')).toBe('Table 35 percent; graph 65 percent');
    expect(syncPanels).toHaveBeenCalledWith(expect.objectContaining({ phase: 'drag', source: 'panel-keyboard' }));
    expect(syncPanels).toHaveBeenCalledWith(expect.objectContaining({ phase: 'end', source: 'panel-keyboard' }));
    expect(window.Main.session.markTabUserModified).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-1', type: 'scatter' }),
      'scatter-panel-keyboard',
      expect.objectContaining({ origin: 'user', affectsPayload: false, captureCanonical: false })
    );
    expect(window.Main.session.captureUserModifiedTabLayout).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-1', type: 'scatter' }),
      { reason: 'scatter-panel-keyboard' }
    );

    panelResizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(panelResizer.getAttribute('aria-valuemin')).toBe('0');
    expect(panelResizer.getAttribute('aria-valuenow')).toBe('0');
    expect(Number.parseFloat(tablePanel.style.width)).toBe(0);
    expect(tablePanel.getAttribute('aria-hidden')).toBe('true');
    expect(tablePanel.inert).toBe(true);
    panelResizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    expect(panelResizer.getAttribute('aria-valuemax')).toBe('100');
    expect(panelResizer.getAttribute('aria-valuenow')).toBe('100');
    expect(Number.parseFloat(graphPanel.style.width)).toBe(0);
    expect(graphPanel.getAttribute('aria-hidden')).toBe('true');
    expect(graphPanel.inert).toBe(true);
  });

  test('keyboard divider refuses to mutate a divider owned by an inactive tab', () => {
    const panelResizer = document.getElementById('panelResizer');
    const tablePanel = document.getElementById('tablePanel');
    const graphPanel = document.getElementById('graphPanel');
    const syncPanels = jest.fn();
    window.Shared.workspaceTabs.resolveTab = value => value
      ? { id: 'tab-1', type: 'scatter' }
      : { id: 'tab-2', type: 'scatter' };
    window.Shared.resizer.attachPanelDragResizer({ panelResizer, tablePanel, graphPanel, syncPanels, debugLabel: 'scatter' });
    const keyEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });

    panelResizer.dispatchEvent(keyEvent);

    expect(tablePanel.style.width).toBe('');
    expect(graphPanel.style.width).toBe('');
    expect(syncPanels).not.toHaveBeenCalled();
    expect(keyEvent.defaultPrevented).toBe(false);
    expect(window.Main.session.markTabUserModified).not.toHaveBeenCalled();
  });

  test('stacked responsive layout clears panel pixel locks without changing graph size state', () => {
    document.body.innerHTML = `
      <div id="panelRoot" style="display:flex;flex-direction:column;min-width:390px" data-panel-min-width-locked="true">
        <div id="tablePanel" style="width:390px;flex:0 0 390px;min-width:0px"></div>
        <div id="panelResizer"></div>
        <div id="graphPanel" style="width:390px;flex:0 0 390px;min-width:390px">
          <div class="svgbox" style="width:256px;height:256px" data-resizer-resized="true" data-resizer-width="256px" data-resizer-table-width="150">
            <div class="diagram-area"><div id="configPanel"></div></div>
          </div>
        </div>
      </div>
    `;
    const root = document.getElementById('panelRoot');
    const tablePanel = document.getElementById('tablePanel');
    const graphPanel = document.getElementById('graphPanel');
    const configPanel = document.getElementById('configPanel');
    const svgBox = document.querySelector('.svgbox');
    Object.defineProperty(tablePanel, 'offsetParent', { configurable: true, value: root });
    Object.defineProperty(graphPanel, 'offsetParent', { configurable: true, value: root });
    tablePanel.getBoundingClientRect = () => ({ width: 390, height: 300 });
    graphPanel.getBoundingClientRect = () => ({ width: 390, height: 600 });
    configPanel.getBoundingClientRect = () => ({ width: 220, height: 300 });
    svgBox.getBoundingClientRect = () => ({ width: 256, height: 256 });

    const result = window.Shared.syncPanelWidths(tablePanel, graphPanel, configPanel, jest.fn(), {
      debugLabel: 'surface',
      svgBox,
      lockGraphPanelWidth: true
    });

    expect(result.isManualResize).toBe(true);
    expect(tablePanel.style.width).toBe('');
    expect(tablePanel.style.flex).toBe('');
    expect(tablePanel.style.flexBasis).toBe('');
    expect(tablePanel.style.minWidth).toBe('0px');
    expect(graphPanel.style.cssText).toBe('');
    expect(root.style.minWidth).toBe('');
    expect(root.dataset.panelMinWidthLocked).toBeUndefined();
    expect(svgBox.style.width).toBe('256px');
    expect(svgBox.style.height).toBe('256px');
    expect(svgBox.dataset.resizerResized).toBe('true');
    expect(svgBox.dataset.resizerTableWidth).toBe('150');
  });
});
