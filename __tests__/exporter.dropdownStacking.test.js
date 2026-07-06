describe('exporter graph dropdown stacking', () => {
  function rect({ top = 0, bottom = 0, left = 0, right = 0, width = 0, height = 0 } = {}) {
    return { top, bottom, left, right, width, height, x: left, y: top, toJSON: () => ({ top, bottom, left, right, width, height }) };
  }

  function mountGraphExportControls() {
    document.body.innerHTML = `
      <div class="workspace-page">
        <div class="wrap">
          <div id="testTablePanel" class="panel"></div>
          <div id="testPanelResizer" class="panel-resizer" aria-hidden="true"></div>
          <div id="testGraphPanel" class="panel">
            <div class="diagram-area">
              <div class="svgbox">
                <svg id="testSvg" viewBox="0 0 10 10"></svg>
                <div id="testExportControls"></div>
              </div>
            </div>
          </div>
        </div>
        <div id="workspaceTabsDock"></div>
      </div>
    `;

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
    document.getElementById('workspaceTabsDock').getBoundingClientRect = () => rect({ top: 680, bottom: 700, height: 20 });

    require('../js/shared/exporter.js');
    window.Shared.exporter.mountSvgControls({
      container: '#testExportControls',
      fileName: 'test-chart',
      getSvg: () => document.getElementById('testSvg')
    });

    const wrapper = document.querySelector('.export-select-wrapper[data-action-key="download"]');
    const select = wrapper?.querySelector('select.export-select');
    if(select){
      select.getBoundingClientRect = () => rect({ top: 400, bottom: 432, height: 32 });
    }

    return {
      wrapper,
      select,
      graphPanel: document.getElementById('testGraphPanel')
    };
  }

  test('mounts graph export selects without changing graph panel scrolling', () => {
    const { wrapper, select, graphPanel } = mountGraphExportControls();

    expect(wrapper).toBeTruthy();
    expect(select).toBeTruthy();
    expect(graphPanel.classList.contains('export-dropdown-scope-open')).toBe(false);

    expect(graphPanel.style.overflow).toBe('');
    expect(graphPanel.classList.contains('export-dropdown-scope-open')).toBe(false);
  });

});
