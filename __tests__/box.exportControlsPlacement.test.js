describe('box export controls placement', () => {
  test('mounts graph export controls inside the drawable frame like scatter', () => {
    const boxSvgBox = document.querySelector('#boxGraphPanel .svgbox');
    const boxPlot = document.getElementById('boxPlot');
    const boxControls = document.getElementById('boxExportControls');
    const scatterSvgBox = document.querySelector('#scatterGraphPanel .svgbox');
    const scatterControls = document.getElementById('scatterExportControls');

    expect(boxSvgBox).toBeTruthy();
    expect(boxPlot).toBeTruthy();
    expect(boxControls).toBeTruthy();
    expect(scatterSvgBox).toBeTruthy();
    expect(scatterControls).toBeTruthy();

    expect(boxSvgBox.contains(boxControls)).toBe(true);
    expect(scatterSvgBox.contains(scatterControls)).toBe(true);
    expect(boxControls.parentElement).toBe(boxSvgBox);
    expect(boxPlot.nextElementSibling).toBe(boxControls);
    expect(boxControls.classList.contains('box-export-controls-row')).toBe(false);
  });
});
