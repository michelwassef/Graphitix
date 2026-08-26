describe('fontControls tab-scoped style isolation', () => {
  const NS = 'http://www.w3.org/2000/svg';

  function setActiveTab(tabId){
    const tabs = Array.from(document.querySelectorAll('.workspace-tab[data-tab-id]'));
    tabs.forEach(btn => {
      const isActive = btn.dataset.tabId === tabId;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function createSvgText(label){
    const svg = document.createElementNS(NS, 'svg');
    const text = document.createElementNS(NS, 'text');
    text.textContent = label;
    svg.appendChild(text);
    document.body.appendChild(svg);
    return text;
  }

  function dispatchChange(input){
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setToolbarScope(scope){
    const select = document.querySelector('select.font-controls-panel__select');
    expect(select).toBeTruthy();
    select.value = scope;
    dispatchChange(select);
  }

  function setToolbarFontFamily(value){
    const input = document.querySelector('input[aria-label="Font family"]');
    expect(input).toBeTruthy();
    input.value = value;
    dispatchChange(input);
  }

  function setToolbarFontSize(value){
    const input = document.querySelector('input[aria-label="Font size"]');
    expect(input).toBeTruthy();
    input.value = value;
    dispatchChange(input);
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="workspaceTabsList" class="workspace-tabs-list">
        <button type="button" class="workspace-tab is-active" data-tab-id="tab-box-1" aria-selected="true"></button>
        <button type="button" class="workspace-tab" data-tab-id="tab-box-2" aria-selected="false"></button>
      </div>
      <div class="workspace-toolbar">
        <div class="workspace-toolbar__section workspace-toolbar__section--dock">
          <button id="boxFontHost" type="button">Font host</button>
          <button id="heatmapFontHost" type="button">Heatmap font host</button>
        </div>
      </div>
    `;
    require('../js/vendor.js');
    require('../js/shared/undo.js');
    require('../js/shared/fontControls.js');
    window.Shared.undoManager.clear();
  });

  test('same component scope keeps independent styles per active tab', () => {
    const fontControls = window.Shared?.fontControls;
    expect(fontControls && typeof fontControls.markText === 'function').toBe(true);

    const textTab1 = createSvgText('Tab1');
    const textTab2 = createSvgText('Tab2');

    setActiveTab('tab-box-1');
    fontControls.markText(textTab1, { scopeId: 'box', key: 'xTick' });
    fontControls.importScopeStyles('box', { xTick: { fontSize: '22px' } }, { prune: true });
    expect(textTab1.getAttribute('font-size')).toBe('22px');

    setActiveTab('tab-box-2');
    fontControls.markText(textTab2, { scopeId: 'box', key: 'xTick' });
    fontControls.importScopeStyles('box', { xTick: { fontSize: '11px' } }, { prune: true });
    expect(textTab2.getAttribute('font-size')).toBe('11px');
    expect(textTab1.getAttribute('font-size')).toBe('22px');

    setActiveTab('tab-box-1');
    const exportedTab1 = fontControls.exportScopeStyles('box');
    expect(exportedTab1?.xTick?.fontSize).toBe('22px');

    setActiveTab('tab-box-2');
    const exportedTab2 = fontControls.exportScopeStyles('box');
    expect(exportedTab2?.xTick?.fontSize).toBe('11px');

    setActiveTab('tab-box-1');
    fontControls.importScopeStyles('box', { xTick: { fontSize: '26px' } }, { prune: true });
    expect(textTab1.getAttribute('font-size')).toBe('26px');
    expect(textTab2.getAttribute('font-size')).toBe('11px');
  });

  test('a size-only role style preserves renderer-owned text colors', () => {
    const fontControls = window.Shared?.fontControls;
    const first = createSvgText('First group');
    const second = createSvgText('Second group');
    first.setAttribute('fill', '#0044cc');
    second.setAttribute('fill', '#cc2200');

    setActiveTab('tab-box-1');
    fontControls.markText(first, { scopeId: 'survival', key: 'riskTable' });
    fontControls.markText(second, { scopeId: 'survival', key: 'riskTable' });
    fontControls.importScopeStyles('survival', {
      riskTable: { fontSize: '18px' }
    }, { prune: true });

    expect(first.getAttribute('font-size')).toBe('18px');
    expect(second.getAttribute('font-size')).toBe('18px');
    expect(first.getAttribute('fill')).toBe('#0044cc');
    expect(second.getAttribute('fill')).toBe('#cc2200');
  });

  test('font edits preserve renderer-owned multiline tspan layout', () => {
    const fontControls = window.Shared?.fontControls;
    const text = createSvgText('');
    text.dataset.fontPreserveStructure = 'children';
    ['First statistic', 'Second statistic'].forEach((value, index) => {
      const line = document.createElementNS(NS, 'tspan');
      line.dataset.fontStructurePart = 'line';
      line.dataset.fontStructureText = value;
      line.setAttribute('x', '100');
      line.setAttribute('dy', index === 0 ? '0' : '1.2em');
      line.textContent = value;
      text.appendChild(line);
    });

    setActiveTab('tab-box-1');
    fontControls.markText(text, { scopeId: 'line', role: 'statsSummary', key: 'statsSummary' });
    fontControls.importScopeStyles('line', {
      statsSummary: { fontSize: '18px', fontWeight: '700', fill: '#cc0000' }
    }, { prune: true });

    const lines = Array.from(text.children);
    expect(lines).toHaveLength(2);
    expect(lines.map(line => line.textContent)).toEqual(['First statistic', 'Second statistic']);
    expect(lines.map(line => line.getAttribute('dy'))).toEqual(['0', '1.2em']);
    expect(text.getAttribute('font-size')).toBe('18px');
    expect(text.getAttribute('font-weight')).toBe('700');
    expect(text.getAttribute('fill')).toBe('#cc0000');
  });

  test('selection font-family edit does not shield that text from later graph font-size edits', () => {
    const fontControls = window.Shared?.fontControls;
    const title = createSvgText('Title');
    const axis = createSvgText('Axis');
    title.setAttribute('font-size', '12px');
    axis.setAttribute('font-size', '12px');

    setActiveTab('tab-box-1');
    fontControls.markText(title, { scopeId: 'box', key: 'graphTitle' });
    fontControls.markText(axis, { scopeId: 'box', key: 'xTitle' });

    fontControls.openForElement(title, { scopeId: 'box', key: 'graphTitle' });
    setToolbarFontFamily('Georgia');

    let exported = fontControls.exportScopeStyles('box');
    expect(exported?.graphTitle?.fontFamily).toBe('Georgia');
    expect(exported?.graphTitle?.fontSize).toBeUndefined();

    setToolbarScope('graph');
    setToolbarFontSize('20');

    expect(title.getAttribute('font-family')).toBe('Georgia');
    expect(title.getAttribute('font-size')).toBe('26.67px');
    expect(axis.getAttribute('font-size')).toBe('26.67px');

    exported = fontControls.exportScopeStyles('box');
    expect(exported?.__graph__?.fontSize).toBe('26.67px');
    expect(exported?.graphTitle?.fontFamily).toBe('Georgia');
    expect(exported?.graphTitle?.fontSize).toBeUndefined();

    const redrawnTitle = createSvgText('Title');
    redrawnTitle.setAttribute('font-size', '12px');
    fontControls.markText(redrawnTitle, { scopeId: 'box', key: 'graphTitle' });
    expect(redrawnTitle.getAttribute('font-family')).toBe('Georgia');
    expect(redrawnTitle.getAttribute('font-size')).toBe('26.67px');
  });

  test('graph font-size edit removes stale selection font-size overrides for the active tab only', () => {
    const fontControls = window.Shared?.fontControls;
    const titleTab1 = createSvgText('Tab 1 title');
    const axisTab1 = createSvgText('Tab 1 axis');
    const titleTab2 = createSvgText('Tab 2 title');

    setActiveTab('tab-box-1');
    fontControls.markText(titleTab1, { scopeId: 'box', key: 'graphTitle' });
    fontControls.markText(axisTab1, { scopeId: 'box', key: 'xTitle' });
    fontControls.importScopeStyles('box', {
      graphTitle: { fontSize: '18px', fontFamily: 'Georgia' }
    }, { prune: true });

    setActiveTab('tab-box-2');
    fontControls.markText(titleTab2, { scopeId: 'box', key: 'graphTitle' });
    fontControls.importScopeStyles('box', {
      graphTitle: { fontSize: '11px', fontFamily: 'Verdana' }
    }, { prune: true });

    setActiveTab('tab-box-1');
    fontControls.openForElement(titleTab1, { scopeId: 'box', key: 'graphTitle' });
    setToolbarScope('graph');
    setToolbarFontSize('16');

    expect(titleTab1.getAttribute('font-size')).toBe('21.33px');
    expect(axisTab1.getAttribute('font-size')).toBe('21.33px');
    expect(titleTab1.getAttribute('font-family')).toBe('Georgia');

    let exported = fontControls.exportScopeStyles('box');
    expect(exported?.__graph__?.fontSize).toBe('21.33px');
    expect(exported?.graphTitle?.fontFamily).toBe('Georgia');
    expect(exported?.graphTitle?.fontSize).toBeUndefined();

    setActiveTab('tab-box-2');
    exported = fontControls.exportScopeStyles('box');
    expect(exported?.graphTitle?.fontSize).toBe('11px');
    expect(exported?.graphTitle?.fontFamily).toBe('Verdana');
    expect(titleTab2.getAttribute('font-size')).toBe('11px');
  });

  test('undo graph font-size edit restores per-text font-size overrides', () => {
    const fontControls = window.Shared?.fontControls;
    const title = createSvgText('Title');
    const axis = createSvgText('Axis');

    setActiveTab('tab-box-1');
    fontControls.markText(title, { scopeId: 'box', key: 'graphTitle' });
    fontControls.markText(axis, { scopeId: 'box', key: 'xTitle' });
    fontControls.importScopeStyles('box', {
      graphTitle: { fontSize: '18px', fontFamily: 'Georgia' },
      xTitle: { fontSize: '12px', fontFamily: 'Arial' }
    }, { prune: true });

    fontControls.openForElement(title, { scopeId: 'box', key: 'graphTitle' });
    setToolbarScope('graph');
    setToolbarFontSize('16');

    expect(title.getAttribute('font-size')).toBe('21.33px');
    expect(axis.getAttribute('font-size')).toBe('21.33px');

    expect(window.Shared.undoManager.undo()).toBe(true);
    expect(title.getAttribute('font-size')).toBe('18px');
    expect(axis.getAttribute('font-size')).toBe('12px');
    expect(title.getAttribute('font-family')).toBe('Georgia');
    expect(axis.getAttribute('font-family')).toBe('Arial');
  });

  test('point-label font size supports individual and all-label scopes without affecting other graph text', () => {
    const fontControls = window.Shared?.fontControls;
    const firstLabel = createSvgText('Sample A');
    const secondLabel = createSvgText('Sample B');
    const title = createSvgText('Graph title');
    [firstLabel, secondLabel, title].forEach(node => node.setAttribute('font-size', '12px'));

    setActiveTab('tab-box-1');
    fontControls.markText(firstLabel, {
      scopeId: 'box',
      role: 'pointLabel',
      key: 'pointLabel:a',
      collection: 'labels'
    });
    fontControls.markText(secondLabel, {
      scopeId: 'box',
      role: 'pointLabel',
      key: 'pointLabel:b',
      collection: 'labels'
    });
    fontControls.markText(title, { scopeId: 'box', role: 'graphTitle', key: 'graphTitle' });

    fontControls.openForElement(firstLabel, { scopeId: 'box', key: 'pointLabel:a' });
    setToolbarFontSize('14');
    expect(firstLabel.getAttribute('font-size')).toBe('18.67px');
    expect(secondLabel.getAttribute('font-size')).toBe('12px');
    expect(title.getAttribute('font-size')).toBe('12px');

    setToolbarScope('labels');
    setToolbarFontSize('16');
    expect(firstLabel.getAttribute('font-size')).toBe('21.33px');
    expect(secondLabel.getAttribute('font-size')).toBe('21.33px');
    expect(title.getAttribute('font-size')).toBe('12px');

    const exported = fontControls.exportScopeStyles('box', { tabId: 'tab-box-1' });
    expect(exported?.__labels__?.fontSize).toBe('21.33px');
    expect(exported?.['pointLabel:a']?.fontSize).toBeUndefined();
  });

  test('named collections expose a dynamic bulk scope and remain tab-isolated', () => {
    const fontControls = window.Shared?.fontControls;
    const rowA = createSvgText('Row A');
    const rowB = createSvgText('Row B');
    const columnA = createSvgText('Column A');

    setActiveTab('tab-box-1');
    [rowA, rowB].forEach((node, index) => fontControls.markText(node, {
      scopeId: 'heatmap',
      role: 'rowLabel',
      key: `row-label-${index}`,
      collection: 'rowLabels',
      collectionLabel: 'Row labels'
    }));
    fontControls.markText(columnA, {
      scopeId: 'heatmap',
      role: 'columnLabel',
      key: 'column-label-0',
      collection: 'columnLabels',
      collectionLabel: 'Column labels'
    });

    fontControls.openForElement(rowA, { scopeId: 'heatmap', key: 'row-label-0' });
    let scope = document.querySelector('select.font-controls-panel__select');
    expect(Array.from(scope.options).filter(option => !option.hidden).map(option => option.textContent))
      .toEqual(['Selection', 'Row labels', 'Graph']);
    setToolbarScope('collection');
    setToolbarFontFamily('Georgia');
    expect(rowA.getAttribute('font-family')).toBe('Georgia');
    expect(rowB.getAttribute('font-family')).toBe('Georgia');
    expect(columnA.getAttribute('font-family')).toBeNull();

    fontControls.openForElement(columnA, { scopeId: 'heatmap', key: 'column-label-0' });
    scope = document.querySelector('select.font-controls-panel__select');
    expect(scope.value).toBe('collection');
    expect(Array.from(scope.options).filter(option => !option.hidden).map(option => option.textContent))
      .toEqual(['Selection', 'Column labels', 'Graph']);
    setToolbarFontFamily('Verdana');
    expect(columnA.getAttribute('font-family')).toBe('Verdana');
    expect(rowA.getAttribute('font-family')).toBe('Georgia');

    const exportedTab1 = fontControls.exportScopeStyles('heatmap', { tabId: 'tab-box-1' });
    expect(exportedTab1?.['__collection__:rowLabels']?.fontFamily).toBe('Georgia');
    expect(exportedTab1?.['__collection__:columnLabels']?.fontFamily).toBe('Verdana');

    setActiveTab('tab-box-2');
    const otherRow = createSvgText('Other row');
    fontControls.markText(otherRow, {
      scopeId: 'heatmap',
      role: 'rowLabel',
      key: 'row-label-0',
      collection: 'rowLabels',
      collectionLabel: 'Row labels'
    });
    expect(otherRow.getAttribute('font-family')).toBeNull();
    expect(fontControls.exportScopeStyles('heatmap', { tabId: 'tab-box-2' })?.['__collection__:rowLabels']).toBeUndefined();

    fontControls.importScopeStyles('heatmap', exportedTab1, { tabId: 'tab-box-2', prune: true });
    expect(otherRow.getAttribute('font-family')).toBe('Georgia');
    const otherColumn = createSvgText('Other column');
    fontControls.markText(otherColumn, {
      scopeId: 'heatmap',
      role: 'columnLabel',
      key: 'column-label-0',
      collection: 'columnLabels',
      collectionLabel: 'Column labels'
    });
    expect(otherColumn.getAttribute('font-family')).toBe('Verdana');
  });
});
