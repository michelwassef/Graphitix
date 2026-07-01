describe('exporter hybrid SVG source selection', () => {
  test('hybrid SVG action uses the hybrid source getter', async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="testExportControls"></div>
      <svg id="vectorSvg" viewBox="0 0 10 10"><g data-export-layer="points"><path d="M0 0L1 1"></path></g></svg>
      <svg id="liveSvg" viewBox="0 0 10 10"><g data-export-layer="points"><foreignObject><canvas></canvas></foreignObject></g></svg>
    `;
    require('../js/shared/exporter.js');
    const vectorGetter = jest.fn(() => document.getElementById('vectorSvg'));
    const hybridGetter = jest.fn(() => document.getElementById('liveSvg'));

    window.Shared.exporter.mountSvgControls({
      container: '#testExportControls',
      fileName: 'test-chart',
      getSvg: vectorGetter,
      getHybridSvg: hybridGetter,
      hybridOptions: {
        label: 'SVG (points as PNG)',
        layers: [{ selector: '[data-export-layer="points"]', label: 'points' }]
      }
    });

    const downloadSelect = document.querySelector('.export-select-wrapper[data-action-key="download"] select');
    downloadSelect.value = 'svg-hybrid';
    downloadSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(hybridGetter).toHaveBeenCalled();
  });
});
