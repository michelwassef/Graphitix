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

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="workspaceTabsList" class="workspace-tabs-list">
        <button type="button" class="workspace-tab is-active" data-tab-id="tab-box-1" aria-selected="true"></button>
        <button type="button" class="workspace-tab" data-tab-id="tab-box-2" aria-selected="false"></button>
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
});
