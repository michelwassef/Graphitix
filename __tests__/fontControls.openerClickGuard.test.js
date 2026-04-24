describe('fontControls opener click guard', () => {
  const NS = 'http://www.w3.org/2000/svg';

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="workspaceTabsList" class="workspace-tabs-list">
        <button type="button" class="workspace-tab is-active" data-tab-id="tab-scatter-1" aria-selected="true"></button>
      </div>
      <button id="scatterLoadExample" type="button">Load Example</button>
    `;
    require('../js/vendor.js');
    require('../js/shared/fontControls.js');
  });

  test('openForElement stays open for the triggering click event', () => {
    const fontControls = window.Shared?.fontControls;
    expect(fontControls && typeof fontControls.openForElement === 'function').toBe(true);

    const svg = document.createElementNS(NS, 'svg');
    const text = document.createElementNS(NS, 'text');
    text.textContent = 'Scatter plot';
    svg.appendChild(text);
    document.body.appendChild(svg);

    fontControls.markText(text, { scopeId: 'scatter', key: 'graphTitle' });

    text.addEventListener('click', evt => {
      fontControls.openForElement(text, {
        scopeId: 'scatter',
        key: 'graphTitle',
        triggerEvent: evt
      });
    });

    text.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const panel = document.querySelector('.font-controls-panel');
    expect(panel).toBeTruthy();
    expect(panel.dataset.open).toBe('1');

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.dataset.open).toBe('0');
  });
});
