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
    require('../../js/vendor.js');
    require('../../js/shared/fontControls.js');
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

  test('SVG font delegation leaves comparison labels to their registered controls', () => {
    const fontControls = window.Shared.fontControls;
    const svg = document.createElementNS(NS, 'svg');
    const text = document.createElementNS(NS, 'text');
    text.textContent = '0.01';
    text.dataset.significanceControl = '1';
    svg.appendChild(text);
    document.body.appendChild(svg);
    fontControls.markText(text, { scopeId: 'scatter', key: 'significance-label' });
    fontControls.enableForSvg(svg, { scopeId: 'scatter' });
    const comparisonClick = jest.fn();
    text.addEventListener('click', comparisonClick);
    text.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(comparisonClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.font-controls-panel[data-open="1"]')).toBeNull();
  });

  test('font menu shows all available fonts for a target using a CSS font stack', () => {
    const fontControls = window.Shared.fontControls;
    const svg = document.createElementNS(NS, 'svg');
    const text = document.createElementNS(NS, 'text');
    text.textContent = 'Graph title';
    text.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
    svg.appendChild(text);
    document.body.appendChild(svg);
    fontControls.markText(text, { scopeId: 'scatter', key: 'graphTitle' });
    fontControls.openForElement(text, { scopeId: 'scatter', key: 'graphTitle' });

    const fontInput = document.querySelector('input[aria-label="Font family"]');
    const toggle = document.querySelector('.font-controls-panel__combo-toggle[aria-label="Show available fonts"]');
    expect(fontInput.value).toBe('Arial, Helvetica, sans-serif');
    toggle.click();

    const fontOptions = () => Array.from(document.querySelectorAll('[aria-label="Common fonts"] .font-controls-panel__combo-option'))
      .filter(option => !option.hidden)
      .map(option => option.dataset.value);
    expect(fontOptions()).toContain('Georgia');
    expect(fontOptions().length).toBeGreaterThan(5);

    fontInput.value = 'Geo';
    fontInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(fontOptions()).toContain('Georgia');
    expect(fontOptions()).not.toContain('Arial');
  });
});
