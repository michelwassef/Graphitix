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
        </div>
      </div>
    `;
    require('../js/vendor.js');
    require('../js/shared/fontControls.js');
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
});
