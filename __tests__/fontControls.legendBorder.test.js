describe('fontControls legend border formatting', () => {
  const NS = 'http://www.w3.org/2000/svg';

  function setActiveTab(tabId){
    document.querySelectorAll('.workspace-tab[data-tab-id]').forEach(tab => {
      const active = tab.dataset.tabId === tabId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function createLegend(tabId, label = 'Series A'){
    const svg = document.createElementNS(NS, 'svg');
    svg.dataset.fontTabId = tabId;
    const group = document.createElementNS(NS, 'g');
    group.dataset.legendViewportContent = 'true';
    group.dataset.legendContentX = '0';
    group.dataset.legendContentY = '0';
    group.dataset.legendContentWidth = '120';
    group.dataset.legendContentHeight = '24';
    group.dataset.legendContentFontSize = '12';
    const swatch = document.createElementNS(NS, 'rect');
    swatch.setAttribute('x', '0');
    swatch.setAttribute('y', '5');
    swatch.setAttribute('width', '12');
    swatch.setAttribute('height', '12');
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', '20');
    text.setAttribute('y', '12');
    text.setAttribute('font-size', '12');
    text.textContent = label;
    group.appendChild(swatch);
    group.appendChild(text);
    svg.appendChild(group);
    document.body.appendChild(svg);
    return { svg, group, text };
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="workspaceTabsList" class="workspace-tabs-list">
        <button type="button" class="workspace-tab is-active" data-tab-id="tab-line-1" aria-selected="true"></button>
        <button type="button" class="workspace-tab" data-tab-id="tab-line-2" aria-selected="false"></button>
      </div>
      <div class="workspace-toolbar">
        <div class="workspace-toolbar__section workspace-toolbar__section--dock">
          <button id="lineFontHost" type="button">Font host</button>
          <button id="heatmapFontHost" type="button">Heatmap font host</button>
        </div>
      </div>
    `;
    require('../js/vendor.js');
    require('../js/shared/undo.js');
    require('../js/shared/styleUndo.js');
    require('../js/shared/workspaceToolbarAccess.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/gridControls.js');
    require('../js/shared/fontControls.js');
    window.Shared.undoManager.clear();
  });

  test('legend click extends the font toolbar and edits one shared SVG frame', () => {
    const fontControls = window.Shared.fontControls;
    const { svg, group, text } = createLegend('tab-line-1');
    fontControls.enableForSvg(svg, { scopeId: 'line', tabId: 'tab-line-1' });
    fontControls.markText(text, {
      scopeId: 'line',
      role: 'legend',
      key: 'legend-0',
      tabId: 'tab-line-1'
    });

    text.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const panel = document.querySelector('.font-controls-panel');
    const scope = document.querySelector('select.font-controls-panel__select');
    const width = document.querySelector('input[aria-label="Legend border width"]');
    const color = document.querySelector('input[aria-label="Legend border color"]');
    const pattern = document.querySelector('select[aria-label="Legend border style"]');
    const transparency = document.querySelector('input[aria-label="Legend border transparency"]');
    expect(panel?.dataset.open).toBe('1');
    expect(panel?.dataset.legendControls).toBe('1');
    expect(scope?.value).toBe('legend');
    expect(Array.from(scope?.options || []).map(option => option.textContent)).toEqual([
      'Selection', 'Labels', 'Legend', 'Scale', 'Collection', 'Graph'
    ]);
    expect(width).toBeTruthy();
    expect(color).toBeTruthy();
    expect(pattern).toBeTruthy();
    expect(transparency).toBeTruthy();
    expect(width.closest('.font-controls-panel__field').hidden).toBe(false);
    expect(pattern.closest('.font-controls-panel__field').hidden).toBe(false);
    expect(transparency.closest('.font-controls-panel__field').hidden).toBe(false);

    const styleEvents = [];
    const onStyleChanged = event => {
      if(event?.detail?.key === '__legendFrame__'){
        styleEvents.push(event.detail);
      }
    };
    document.addEventListener('fontControls:styleChanged', onStyleChanged);
    width.value = '2';
    width.dispatchEvent(new Event('input', { bubbles: true }));
    expect(styleEvents).toHaveLength(0);
    width.dispatchEvent(new Event('change', { bubbles: true }));
    expect(styleEvents).toHaveLength(1);
    document.removeEventListener('fontControls:styleChanged', onStyleChanged);
    color.value = '#ff0000';
    color.dispatchEvent(new Event('input', { bubbles: true }));
    color.dispatchEvent(new Event('change', { bubbles: true }));
    pattern.value = 'dashed';
    pattern.dispatchEvent(new Event('change', { bubbles: true }));
    transparency.value = '25';
    transparency.dispatchEvent(new Event('input', { bubbles: true }));
    transparency.dispatchEvent(new Event('change', { bubbles: true }));

    const frames = group.querySelectorAll('[data-font-legend-frame="1"]');
    expect(frames).toHaveLength(1);
    const frame = frames[0];
    expect(frame.getAttribute('stroke-width')).toBe('2');
    expect(frame.getAttribute('stroke')).toBe('#ff0000');
    expect(frame.getAttribute('stroke-dasharray')).toBe('6,4');
    expect(frame.getAttribute('stroke-opacity')).toBe('0.75');
    expect(frame.getAttribute('x')).toBe('-4.2');
    expect(frame.getAttribute('y')).toBe('-4.2');
    expect(frame.getAttribute('width')).toBe('128.4');
    expect(frame.getAttribute('height')).toBe('32.4');

    expect(fontControls.exportScopeStyles('line', { tabId: 'tab-line-1' })).toEqual(
      expect.objectContaining({
        __legendFrame__: {
          legendBorderWidth: 2,
          legendBorderColor: '#ff0000',
          legendBorderPattern: 'dashed',
          legendBorderTransparency: 25
        }
      })
    );

    expect(window.Shared.undoManager.undo()).toBe(true);
    expect(frame.getAttribute('stroke-opacity')).toBe('1');
    expect(window.Shared.undoManager.redo()).toBe(true);
    expect(frame.getAttribute('stroke-opacity')).toBe('0.75');
  });

  test('continuous scales use Scale typography without categorical legend controls', () => {
    const fontControls = window.Shared.fontControls;
    const svg = document.createElementNS(NS, 'svg');
    const scale = document.createElementNS(NS, 'g');
    scale.dataset.fontLegend = '1';
    const staleFrame = document.createElementNS(NS, 'rect');
    staleFrame.dataset.fontLegendFrame = '1';
    scale.appendChild(staleFrame);
    const title = document.createElementNS(NS, 'text');
    title.setAttribute('font-size', '14');
    title.textContent = 'Pearson correlation';
    scale.appendChild(title);
    const ticks = ['0', '1'].map((label, index) => {
      const tick = document.createElementNS(NS, 'text');
      tick.dataset.fontScope = 'heatmap';
      tick.dataset.fontRole = 'scaleTick';
      tick.dataset.fontCollection = 'scale';
      tick.dataset.fontKey = `scale-tick-${index}`;
      tick.setAttribute('font-size', '14');
      tick.textContent = label;
      scale.appendChild(tick);
      return tick;
    });
    svg.appendChild(scale);
    document.body.appendChild(svg);

    fontControls.enableForSvg(svg, { scopeId: 'heatmap', tabId: 'tab-line-1' });
    fontControls.markText(title, {
      scopeId: 'heatmap', role: 'scaleTitle', key: 'scale-title-method', tabId: 'tab-line-1'
    });
    ticks.forEach((tick, index) => fontControls.markText(tick, {
      scopeId: 'heatmap', role: 'scaleTick', key: `scale-tick-${index}`, tabId: 'tab-line-1'
    }));

    ticks.forEach(tick => {
      expect(tick.dataset.fontRole).toBe('scaleTick');
      expect(tick.dataset.fontCollection).toBe('scale');
      expect(tick.dataset.fontEditable).toBe('1');
      expect(tick.getAttribute('font-size')).toBe('14');
    });
    expect(title.dataset.fontRole).toBe('scaleTitle');
    expect(title.dataset.fontCollection).toBe('scale');
    expect(title.dataset.fontEditable).toBe('1');
    expect(scale.dataset.fontLegend).toBeUndefined();
    expect(scale.querySelector('[data-font-legend-frame="1"]')).toBeNull();

    ticks[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const scopeSelect = document.querySelector('select.font-controls-panel__select');
    expect(scopeSelect.value).toBe('scale');
    expect(document.querySelector('input[aria-label="Legend border width"]').closest('label').hidden).toBe(true);
    expect(document.querySelector('select[aria-label="Legend border style"]').closest('label').hidden).toBe(true);
    expect(document.querySelector('input[aria-label="Legend border transparency"]').closest('label').hidden).toBe(true);
    const font = document.querySelector('input[aria-label="Font family"]');
    font.value = 'Georgia';
    font.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ticks.map(tick => tick.getAttribute('font-family'))).toEqual(['Georgia', 'Georgia']);
    expect(title.getAttribute('font-family')).toBe('Georgia');
    expect(fontControls.exportScopeStyles('heatmap', { tabId: 'tab-line-1' })?.__scale__?.fontFamily).toBe('Georgia');
  });

  test('Legend is the default scope and formats every legend text only', () => {
    const fontControls = window.Shared.fontControls;
    const { svg, group, text } = createLegend('tab-line-1');
    const second = document.createElementNS(NS, 'text');
    second.setAttribute('x', '20');
    second.setAttribute('y', '24');
    second.setAttribute('font-size', '12');
    second.textContent = 'Series B';
    group.appendChild(second);
    const title = document.createElementNS(NS, 'text');
    title.textContent = 'Chart title';
    svg.appendChild(title);
    fontControls.enableForSvg(svg, { scopeId: 'line', tabId: 'tab-line-1' });
    fontControls.markText(text, { scopeId: 'line', role: 'legend', key: 'legend-0', tabId: 'tab-line-1' });
    fontControls.markText(second, { scopeId: 'line', role: 'legend', key: 'legend-1', tabId: 'tab-line-1' });
    fontControls.markText(title, { scopeId: 'line', role: 'title', key: 'title', tabId: 'tab-line-1' });

    text.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const scope = document.querySelector('select.font-controls-panel__select');
    expect(scope.value).toBe('legend');
    const font = document.querySelector('input[aria-label="Font family"]');
    font.value = 'Georgia';
    font.dispatchEvent(new Event('change', { bubbles: true }));

    expect(text.getAttribute('font-family')).toBe('Georgia');
    expect(second.getAttribute('font-family')).toBe('Georgia');
    expect(title.getAttribute('font-family')).toBeNull();
    expect(fontControls.exportScopeStyles('line', { tabId: 'tab-line-1' })?.__legend__?.fontFamily).toBe('Georgia');

    scope.value = 'selection';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    font.value = 'Verdana';
    font.dispatchEvent(new Event('change', { bubbles: true }));
    expect(text.getAttribute('font-family')).toBe('Verdana');
    expect(second.getAttribute('font-family')).toBe('Georgia');

    fontControls.close('test-reopen');
    second.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(scope.value).toBe('legend');
  });

  test('legend frame state is isolated per tab and reconstructs after reopen-style DOM replacement', () => {
    const fontControls = window.Shared.fontControls;
    const first = createLegend('tab-line-1', 'First tab');
    const second = createLegend('tab-line-2', 'Second tab');

    setActiveTab('tab-line-1');
    fontControls.markText(first.text, {
      scopeId: 'line', role: 'legend', key: 'legend-0', tabId: 'tab-line-1'
    });
    fontControls.importScopeStyles('line', {
      __legendFrame__: {
        legendBorderWidth: 1.5,
        legendBorderColor: '#123456',
        legendBorderPattern: 'dotted',
        legendBorderTransparency: 10
      }
    }, { tabId: 'tab-line-1', prune: true });
    expect(first.group.querySelector('[data-font-legend-frame="1"]')).toBeTruthy();

    setActiveTab('tab-line-2');
    fontControls.markText(second.text, {
      scopeId: 'line', role: 'legend', key: 'legend-0', tabId: 'tab-line-2'
    });
    expect(second.group.querySelector('[data-font-legend-frame="1"]')).toBeNull();
    expect(fontControls.exportScopeStyles('line', { tabId: 'tab-line-2' })?.__legendFrame__).toBeUndefined();

    const saved = fontControls.exportScopeStyles('line', { tabId: 'tab-line-1' });
    first.svg.remove();
    const reopened = createLegend('tab-line-1', 'First tab reopened');
    fontControls.importScopeStyles('line', saved, { tabId: 'tab-line-1', prune: true });
    fontControls.markText(reopened.text, {
      scopeId: 'line', role: 'legend', key: 'legend-0', tabId: 'tab-line-1'
    });

    const restoredFrame = reopened.group.querySelector('[data-font-legend-frame="1"]');
    expect(restoredFrame).toBeTruthy();
    expect(restoredFrame.getAttribute('stroke')).toBe('#123456');
    expect(restoredFrame.getAttribute('stroke-width')).toBe('1.5');
    expect(restoredFrame.getAttribute('stroke-dasharray')).toBe('2,3');
    expect(restoredFrame.getAttribute('stroke-opacity')).toBe('0.9');
    expect(second.group.querySelector('[data-font-legend-frame="1"]')).toBeNull();
  });

  test('restored legend ownership is re-adopted by the current tab before interaction', () => {
    const fontControls = window.Shared.fontControls;
    const restored = createLegend('tab-line-1', 'Cached legend');
    restored.group.dataset.fontLegend = '1';
    restored.group.dataset.fontScope = 'line';
    restored.group.dataset.fontTabId = 'tab-line-1';
    restored.text.dataset.fontScope = 'line';
    restored.text.dataset.fontRole = 'legend';
    restored.text.dataset.fontKey = 'legend-0';
    restored.text.dataset.fontTabId = 'tab-line-1';

    fontControls.importScopeStyles('line', {
      __legendFrame__: {
        legendBorderWidth: 3,
        legendBorderColor: '#aa0000',
        legendBorderPattern: 'solid',
        legendBorderTransparency: 0
      },
      __legend__: { fontFamily: 'Georgia' }
    }, { tabId: 'tab-line-1', prune: true });
    fontControls.markText(restored.text, {
      scopeId: 'line', role: 'legend', key: 'legend-0', tabId: 'tab-line-1'
    });
    expect(restored.group.querySelector('[data-font-legend-frame="1"]')?.getAttribute('stroke')).toBe('#aa0000');
    expect(restored.text.getAttribute('font-family')).toBe('Georgia');

    setActiveTab('tab-line-2');
    fontControls.importScopeStyles('line', {
      __legendFrame__: {
        legendBorderWidth: 1,
        legendBorderColor: '#0055aa',
        legendBorderPattern: 'dashed',
        legendBorderTransparency: 20
      },
      __legend__: { fontFamily: 'Verdana' }
    }, { tabId: 'tab-line-2', prune: true });
    fontControls.enableForSvg(restored.svg, { scopeId: 'line', tabId: 'tab-line-2' });

    expect(restored.group.dataset.fontTabId).toBe('tab-line-2');
    expect(restored.text.dataset.fontTabId).toBe('tab-line-2');
    const frame = restored.group.querySelector('[data-font-legend-frame="1"]');
    expect(frame.getAttribute('stroke')).toBe('#0055aa');
    expect(frame.getAttribute('stroke-width')).toBe('1');
    expect(frame.getAttribute('stroke-dasharray')).toBe('3,2');
    expect(frame.getAttribute('stroke-opacity')).toBe('0.8');
    expect(restored.text.getAttribute('font-family')).toBe('Verdana');

    fontControls.importScopeStyles('line', {
      __legendFrame__: {
        legendBorderWidth: 4,
        legendBorderColor: '#00aa00',
        legendBorderPattern: 'dotted',
        legendBorderTransparency: 0
      }
    }, { tabId: 'tab-line-1', prune: true });
    expect(frame.getAttribute('stroke')).toBe('#0055aa');
  });

});
