/*
 * Shared resizer contracts.
 * These tests exercise one focused concern through a shared DOM harness.
 */

const { createResizerOptionsMenuHarness } = require('../../test-support/resizerOptionsMenuSuite');

describe('Shared resizer options menu controls', () => {
  const harness = createResizerOptionsMenuHarness();

  beforeEach(harness.setup);

  test('keeps zoom visible and moves standard graph options into a cog menu', () => {
    const box = harness.createSvgBox();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      onResize: jest.fn()
    });

    const tray = box.querySelector('.resizer-control-tray');
    const options = tray?.querySelector(':scope > .resizer-options-control');
    const zoom = tray?.querySelector(':scope > .resizer-zoom-control');
    const menu = options?.querySelector('.resizer-options-menu');

    expect(options).toBeTruthy();
    expect(zoom).toBeTruthy();
    expect(tray.firstElementChild).toBe(options);
    expect(zoom.previousElementSibling).toBe(options);
    expect(options?.querySelector('svg.resizer-options-icon path')).toBeTruthy();
    expect(menu?.querySelector('.resizer-aspect-control')).toBeTruthy();
    expect(menu?.querySelector('.resizer-fontresize-control')).toBeTruthy();
    expect(tray.querySelector(':scope > .resizer-aspect-control')).toBeNull();
    expect(tray.querySelector(':scope > .resizer-fontresize-control')).toBeNull();
  });

  test('adds tab-scoped graph and axes title controls when font controls are available', () => {
    const setRoleVisibility = jest.fn(() => true);
    const recordStateChange = jest.fn();
    window.Shared.fontControls = {
      areRolesVisible: jest.fn(() => true),
      setRoleVisibility
    };
    window.Shared.styleUndo = { recordStateChange };
    const box = harness.createSvgBox();
    box.dataset.workspaceTabId = 'tab-a';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const xTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xTitle.dataset.fontRole = 'xTitle';
    svg.appendChild(xTitle);
    box.appendChild(svg);

    window.Shared.attachResizableBox(box, {
      componentName: 'scatter',
      tabId: 'tab-a',
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90
    });

    const graphInput = box.querySelector('.resizer-graph-title-checkbox');
    const axesInput = box.querySelector('.resizer-axes-title-checkbox');
    expect(graphInput).toBeTruthy();
    expect(axesInput).toBeTruthy();
    expect(axesInput.closest('label').hidden).toBe(false);

    graphInput.checked = false;
    graphInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setRoleVisibility).toHaveBeenCalledWith(
      'scatter',
      'graphTitle',
      false,
      expect.objectContaining({
        tabId: 'tab-a',
        recordUndo: true,
        undoLabel: 'title-visibility:graph'
      })
    );
    expect(recordStateChange).not.toHaveBeenCalled();
  });

  test('normalizes graph option order when the legend is registered before shared controls', () => {
    window.Shared.fontControls = {
      areRolesVisible: jest.fn(() => true),
      setRoleVisibility: jest.fn(() => true)
    };
    const box = harness.createSvgBox();
    const legend = document.createElement('label');
    legend.className = 'config-panel__checkbox config-panel__checkbox--inline';
    legend.innerHTML = '<input type="checkbox" checked><span>Show legend</span>';

    window.Shared.resizer.ensureLegendControlPlacement({
      svgBox: box,
      control: legend,
      debugLabel: 'early-legend'
    });
    window.Shared.attachResizableBox(box, {
      componentName: 'scatter',
      tabId: 'tab-a',
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90
    });

    const axes = document.createElement('details');
    axes.className = 'resizer-axeslength-control';
    const summary = document.createElement('summary');
    summary.textContent = 'Axes length';
    axes.appendChild(summary);
    window.Shared.resizer.ensureGraphOptionsMenu({
      svgBox: box,
      controls: [axes],
      debugLabel: 'axes-length'
    });

    const menu = box.querySelector('.resizer-options-menu');
    const labels = Array.from(menu.children).map(control => (
      control.matches('.resizer-axeslength-control')
        ? control.querySelector('summary')?.textContent
        : control.querySelector('span')?.textContent
    ));
    expect(labels).toEqual([
      'Lock ratio',
      'Proportional font resize',
      'Show graph title',
      'Show axes titles',
      'Show legend',
      'Axes length'
    ]);
  });

  test('tracks axis-title applicability from the active rendered graph', async () => {
    window.Shared.fontControls = {
      areRolesVisible: jest.fn(() => true),
      setRoleVisibility: jest.fn(() => true)
    };
    const box = harness.createSvgBox();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    box.appendChild(svg);

    window.Shared.attachResizableBox(box, {
      componentName: 'pie',
      tabId: 'tab-a',
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90
    });

    const axesControl = box.querySelector('.resizer-axes-title-control');
    expect(axesControl.hidden).toBe(true);

    const yTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yTitle.dataset.fontRole = 'yTitle';
    svg.appendChild(yTitle);
    await Promise.resolve();

    expect(axesControl.hidden).toBe(false);

    yTitle.remove();
    await Promise.resolve();

    expect(axesControl.hidden).toBe(true);
  });

  test('places component graph options in the shared menu', async () => {
    const box = harness.createSvgBox();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      onResize: jest.fn()
    });

    const legend = document.createElement('label');
    legend.className = 'config-panel__checkbox config-panel__checkbox--inline';
    legend.innerHTML = '<input type="checkbox" checked><span>Show legend</span>';

    window.Shared.resizer.ensureLegendControlPlacement({
      svgBox: box,
      control: legend,
      debugLabel: 'test-legend'
    });

    const tray = box.querySelector('.resizer-control-tray');
    const axes = document.createElement('details');
    axes.className = 'resizer-axeslength-control';
    const summary = document.createElement('summary');
    summary.className = 'resizer-axeslength-summary';
    summary.textContent = 'Axes length';
    axes.appendChild(summary);
    tray.appendChild(axes);
    await Promise.resolve();

    const menu = box.querySelector('.resizer-options-menu');
    expect(menu?.querySelector('.resizer-legend-control')).toBe(legend);
    expect(menu?.querySelector('.resizer-axeslength-control')).toBe(axes);
    expect(axes.hasAttribute('open')).toBe(true);
    expect(tray.querySelector(':scope > .resizer-legend-control')).toBeNull();
    expect(tray.querySelector(':scope > .resizer-axeslength-control')).toBeNull();
  });

  test('reopens axes length options whenever the cog menu opens', async () => {
    const box = harness.createSvgBox();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      onResize: jest.fn()
    });

    const tray = box.querySelector('.resizer-control-tray');
    const axes = document.createElement('details');
    axes.className = 'resizer-axeslength-control';
    const summary = document.createElement('summary');
    summary.className = 'resizer-axeslength-summary';
    summary.textContent = 'Axes length';
    axes.appendChild(summary);
    tray.appendChild(axes);
    await Promise.resolve();

    const options = box.querySelector('.resizer-options-control');
    axes.removeAttribute('open');
    options.setAttribute('open', '');
    options.dispatchEvent(new Event('toggle'));

    expect(axes.hasAttribute('open')).toBe(true);
  });

  test('closes the cog menu when clicking outside it', () => {
    const box = harness.createSvgBox();

    window.Shared.attachResizableBox(box, {
      defaultWidth: 420,
      defaultHeight: 320,
      minWidth: 120,
      minHeight: 90,
      onResize: jest.fn()
    });

    const options = box.querySelector('.resizer-options-control');
    const menu = box.querySelector('.resizer-options-menu');
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    options.setAttribute('open', '');
    menu.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(options.hasAttribute('open')).toBe(true);

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(options.hasAttribute('open')).toBe(false);
  });
});

