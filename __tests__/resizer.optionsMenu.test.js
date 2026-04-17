describe('Shared resizer graph options menu', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../js/shared/resizer.js');
  });

  function createSvgBox(){
    const box = document.createElement('div');
    box.className = 'svgbox';
    box.getBoundingClientRect = () => ({ width: 420, height: 320, top: 0, left: 0, right: 420, bottom: 320 });

    const vertical = document.createElement('div');
    vertical.className = 'resizer resizer-vertical';
    const horizontal = document.createElement('div');
    horizontal.className = 'resizer resizer-horizontal';
    const corner = document.createElement('div');
    corner.className = 'resizer resizer-corner';
    const plot = document.createElement('div');
    plot.id = 'testPlot';

    box.appendChild(vertical);
    box.appendChild(horizontal);
    box.appendChild(corner);
    box.appendChild(plot);
    document.body.appendChild(box);
    return box;
  }

  test('keeps zoom visible and moves standard graph options into a cog menu', () => {
    const box = createSvgBox();

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
    expect(menu?.querySelector('.resizer-textlock-control')).toBeTruthy();
    expect(tray.querySelector(':scope > .resizer-aspect-control')).toBeNull();
    expect(tray.querySelector(':scope > .resizer-textlock-control')).toBeNull();
  });

  test('places component graph options in the shared menu', async () => {
    const box = createSvgBox();

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
    const box = createSvgBox();

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
    const box = createSvgBox();

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
