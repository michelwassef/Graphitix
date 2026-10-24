describe('componentLayout root hydration', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="vennPage" class="workspace-page">
        <div class="wrap" style="display:flex;flex-direction:row">
          <div id="vennInputPanel" class="panel">
            <div id="vennTablePanel" class="venn-table-panel"></div>
            <details id="vennNumericMode"></details>
          </div>
          <div id="vennPanelResizer" class="panel-resizer"></div>
          <div id="vennGraphPanel" class="panel">
            <div class="svgbox"></div>
          </div>
        </div>
      </div>
    `;
    window.Shared = {
      chartStyle: {},
      graphSizing: {},
      isDebugEnabled: () => false
    };
    require('../../js/shared/componentLayout.js');
  });

  test('applies the workspace split to Venn outer panels, not its nested table', () => {
    const root = document.getElementById('vennPage');
    const inputPanel = root.querySelector('#vennInputPanel');
    const table = root.querySelector('#vennTablePanel');
    const graphPanel = root.querySelector('#vennGraphPanel');

    window.Shared.componentLayout.hydrateRootFromState('venn', root, {
      version: 1,
      component: 'venn',
      workspace: { version: 1, tableFraction: 0.42 }
    });

    expect(inputPanel.style.flex).toBe('0.42 1 0px');
    expect(table.style.flex).toBe('');
    expect(Number(graphPanel.style.flexGrow)).toBeCloseTo(0.58);
  });
});
