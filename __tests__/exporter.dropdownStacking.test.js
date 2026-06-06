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

    const dropdown = document.querySelector('.export-dropdown[data-action-key="download"]');
    const trigger = dropdown?.querySelector('.export-trigger');
    const menu = dropdown?.querySelector('.export-menu');

    trigger.getBoundingClientRect = () => rect({ top: 400, bottom: 432, height: 32 });
    menu.getBoundingClientRect = () => rect({ top: 438, bottom: 598, height: 160 });

    return {
      dropdown,
      trigger,
      menu,
      graphPanel: document.getElementById('testGraphPanel')
    };
  }

  test('promotes the open graph export menu without changing graph panel scrolling', () => {
    const { dropdown, trigger, menu, graphPanel } = mountGraphExportControls();
    const originalMenuParent = menu.parentNode;

    expect(originalMenuParent).toBe(dropdown);
    expect(graphPanel.classList.contains('export-dropdown-scope-open')).toBe(false);

    trigger.click();

    expect(menu.hidden).toBe(false);
    expect(menu.parentNode).toBe(document.body);
    expect(menu.classList.contains('export-dropdown-layer')).toBe(true);
    expect(dropdown.dataset.menuDirection).toBeUndefined();
    expect(menu.style.position).toBe('');
    expect(menu.style.top).toBe('438px');
    expect(menu.style.left).toBe('0px');
    expect(graphPanel.style.overflow).toBe('');
    expect(graphPanel.classList.contains('export-dropdown-scope-open')).toBe(false);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(menu.hidden).toBe(true);
    expect(menu.parentNode).toBe(dropdown);
    expect(menu.classList.contains('export-dropdown-layer')).toBe(false);
    expect(graphPanel.classList.contains('export-dropdown-scope-open')).toBe(false);
  });

  test('top-layer menu CSS has enough specificity to override the base absolute menu rule', () => {
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(path.resolve(__dirname, '../css/style.css'), 'utf8');

    expect(css).toContain('.export-menu.export-dropdown-layer{position:fixed');
  });
});
