describe('exporter Firefox SVG copy handling', () => {
  const originalUserAgent = global.navigator.userAgent;

  function setUserAgent(value) {
    Object.defineProperty(global.navigator, 'userAgent', {
      configurable: true,
      value
    });
  }

  afterEach(() => {
    jest.resetModules();
    setUserAgent(originalUserAgent);
  });

  test('disables SVG copy options in Firefox and exposes a tooltip explanation', () => {
    jest.resetModules();
    setUserAgent('Mozilla/5.0 Firefox/120.0');
    document.body.innerHTML = '<div id="exports"></div><svg id="svg"></svg>';
    require('../js/shared/exporter.js');

    window.Shared.exporter.mountSvgControls({
      container: '#exports',
      getSvg: () => document.getElementById('svg'),
      fileName: 'chart',
      hybridOptions: {
        label: 'SVG (points as PNG)',
        layers: [{ selector: 'g', label: 'points' }]
      }
    });

    const copySelect = document.querySelector('.export-select-wrapper[data-action-key="copy"] select');
    const svgOption = copySelect.querySelector('option[value="svg"]');
    const hybridOption = copySelect.querySelector('option[value="svg-hybrid"]');

    expect(svgOption.disabled).toBe(true);
    expect(hybridOption.disabled).toBe(true);
    expect(svgOption.title).toContain('not supported in Firefox');
    expect(hybridOption.title).toContain('not supported in Firefox');
    expect(copySelect.title).toContain('not supported in Firefox');
    expect(document.querySelector('.export-select-wrapper[data-action-key="copy"] .export-select-note')).toBeNull();
  });

  test('keeps SVG copy options enabled outside Firefox', () => {
    jest.resetModules();
    setUserAgent('Mozilla/5.0 Chrome/125.0 Safari/537.36');
    document.body.innerHTML = '<div id="exports"></div><svg id="svg"></svg>';
    require('../js/shared/exporter.js');

    window.Shared.exporter.mountSvgControls({
      container: '#exports',
      getSvg: () => document.getElementById('svg'),
      fileName: 'chart',
      hybridOptions: {
        label: 'SVG (points as PNG)',
        layers: [{ selector: 'g', label: 'points' }]
      }
    });

    const copySelect = document.querySelector('.export-select-wrapper[data-action-key="copy"] select');
    expect(copySelect.querySelector('option[value="svg"]').disabled).toBe(false);
    expect(copySelect.querySelector('option[value="svg-hybrid"]').disabled).toBe(false);
    expect(document.querySelector('.export-select-wrapper[data-action-key="copy"] .export-select-note')).toBeNull();
  });
});
