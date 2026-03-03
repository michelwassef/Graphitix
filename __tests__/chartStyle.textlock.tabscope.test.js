describe('chartStyle text lock tab-scoped isolation', () => {
  function setActiveTab(tabId){
    const tabs = Array.from(document.querySelectorAll('.workspace-tab[data-tab-id]'));
    tabs.forEach(btn => {
      const isActive = btn.dataset.tabId === tabId;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="workspaceTabsList" class="workspace-tabs-list">
        <button type="button" class="workspace-tab is-active" data-tab-id="tab-a" aria-selected="true"></button>
        <button type="button" class="workspace-tab" data-tab-id="tab-b" aria-selected="false"></button>
      </div>
      <div id="textLockSvg" class="svgbox"></div>
      <input id="textLockFont" type="range" value="12" min="6" max="36" />
    `;
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
  });

  test('same scope id does not share lock state across tabs', () => {
    const chartStyle = window.Shared?.chartStyle;
    const svgBox = document.getElementById('textLockSvg');
    const scopeId = 'boxGraphPanel';

    setActiveTab('tab-a');
    chartStyle.setTextSizeLock(true, { scopeId, svgBox, force: true });
    expect(chartStyle.isTextSizeLocked({ scopeId, svgBox })).toBe(true);

    setActiveTab('tab-b');
    expect(chartStyle.isTextSizeLocked({ scopeId, svgBox })).toBe(false);
    chartStyle.setTextSizeLock(true, { scopeId, svgBox, force: true });
    expect(chartStyle.isTextSizeLocked({ scopeId, svgBox })).toBe(true);

    setActiveTab('tab-a');
    expect(chartStyle.isTextSizeLocked({ scopeId, svgBox })).toBe(true);

    setActiveTab('tab-b');
    chartStyle.setTextSizeLock(false, { scopeId, svgBox, force: true });
    expect(chartStyle.isTextSizeLocked({ scopeId, svgBox })).toBe(false);

    setActiveTab('tab-a');
    expect(chartStyle.isTextSizeLocked({ scopeId, svgBox })).toBe(true);
  });
});
