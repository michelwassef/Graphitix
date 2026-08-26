describe('fontControls proportional font resize', () => {
  const NS = 'http://www.w3.org/2000/svg';

  function createTextInSvgBox(key){
    const svgBox = document.getElementById('svgbox');
    const svg = svgBox.querySelector('svg');
    const text = document.createElementNS(NS, 'text');
    text.textContent = key;
    svg.appendChild(text);
    return text;
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="workspaceTabsList" class="workspace-tabs-list">
        <button type="button" class="workspace-tab is-active" data-tab-id="tab-scatter-1" aria-selected="true"></button>
      </div>
      <div id="svgbox" class="svgbox" style="width: 100px; height: 100px;">
        <svg></svg>
      </div>
      <div class="workspace-toolbar">
        <div class="workspace-toolbar__section workspace-toolbar__section--dock">
          <button id="scatterFontHost" type="button">Font host</button>
          <button id="heatmapFontHost" type="button">Heatmap font host</button>
        </div>
      </div>
    `;
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/fontControls.js');

    const svgBox = document.getElementById('svgbox');
    Object.assign(svgBox.dataset, {
      resizerProportionalFontResize: 'true',
      resizerDefaultWidth: '100',
      resizerDefaultHeight: '100',
      graphWidthPx: '100',
      graphHeightPx: '100',
      resizerAspectLocked: 'false',
      resizerLastAxis: 'x'
    });
  });

  test('manual per-element font sizes keep their own proportional baselines', () => {
    const fontControls = window.Shared?.fontControls;
    expect(fontControls && typeof fontControls.markText).toBe('function');

    fontControls.importScopeStyles('scatter', {
      graphTitle: { fontSize: '20px', fontSizeResizeReference: 1 },
      xTitle: { fontSize: '10px', fontSizeResizeReference: 1 }
    }, { prune: false });

    const title = createTextInSvgBox('Title');
    const xTitle = createTextInSvgBox('X title');
    fontControls.markText(title, { scopeId: 'scatter', key: 'graphTitle' });
    fontControls.markText(xTitle, { scopeId: 'scatter', key: 'xTitle' });

    expect(title.getAttribute('font-size')).toBe('20px');
    expect(xTitle.getAttribute('font-size')).toBe('10px');

    const svgBox = document.getElementById('svgbox');
    svgBox.dataset.graphWidthPx = '200';
    svgBox.style.width = '200px';
    fontControls.applySavedStyle(title);
    fontControls.applySavedStyle(xTitle);

    expect(title.getAttribute('font-size')).toBe('40px');
    expect(xTitle.getAttribute('font-size')).toBe('20px');

    svgBox.dataset.resizerProportionalFontResize = 'false';
    fontControls.applySavedStyle(title);
    fontControls.applySavedStyle(xTitle);

    expect(title.getAttribute('font-size')).toBe('20px');
    expect(xTitle.getAttribute('font-size')).toBe('10px');
  });

  test('selection and named collection sizes use the explicit rendered font scale', () => {
    const fontControls = window.Shared?.fontControls;
    const text = createTextInSvgBox('Dense label');
    text.setAttribute('font-size', '16px');
    text.dataset.fontSizeDisplayScale = '0.3125';
    fontControls.markText(text, {
      scopeId: 'heatmap',
      key: 'row-label-0',
      collection: 'rowLabels',
      collectionLabel: 'Row labels'
    });
    fontControls.openForElement(text, { scopeId: 'heatmap', key: 'row-label-0' });

    const panel = document.querySelector('.font-controls-panel[data-open="1"]');
    const size = panel.querySelector('.font-controls-panel__input--size');
    const scope = panel.querySelector('.font-controls-panel__field--scope select');
    expect(size.value).toBe('3.75');

    size.value = '4.5';
    size.dispatchEvent(new Event('change', { bubbles: true }));
    expect(text.getAttribute('font-size')).toBe('19.2px');
    expect(fontControls.exportScopeStyles('heatmap')?.['row-label-0']?.fontSize).toBe('19.2px');

    scope.value = 'collection';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    expect(size.value).toBe('4.5');

    size.value = '6';
    size.dispatchEvent(new Event('change', { bubbles: true }));
    expect(text.getAttribute('font-size')).toBe('25.6px');
    expect(fontControls.exportScopeStyles('heatmap')?.['__collection__:rowLabels']?.fontSize).toBe('25.6px');

    scope.value = 'graph';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    expect(size.value).toBe('19.2');
  });

  test('named collection styles reapply through a compact inherited owner', () => {
    const fontControls = window.Shared?.fontControls;
    const svg = document.querySelector('#svgbox svg');
    const group = document.createElementNS(NS, 'g');
    group.dataset.fontScope = 'heatmap';
    group.dataset.fontTabId = 'tab-scatter-1';
    svg.appendChild(group);
    const text = document.createElementNS(NS, 'text');
    text.dataset.fontSizeDisplayScale = '0.5';
    group.appendChild(text);

    fontControls.importScopeStyles('heatmap', {
      '__collection__:rowLabels': {
        fontSize: '20px',
        fontSizeDisplayScaleReference: 0.25
      }
    }, { tabId: 'tab-scatter-1', prune: false });
    fontControls.markText(text, {
      scopeId: 'heatmap',
      tabId: 'tab-scatter-1',
      key: 'row-label-0',
      role: 'rowLabel',
      collection: 'rowLabels',
      compactContext: true
    });

    expect(text.getAttribute('font-size')).toBe('10px');
    expect(text.dataset.fontScope).toBeUndefined();
    expect(text.dataset.fontTabId).toBeUndefined();
  });
});
