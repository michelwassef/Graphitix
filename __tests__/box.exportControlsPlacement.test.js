describe('box export controls placement', () => {
  test('keeps graph export controls outside the drawable frame', () => {
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

    expect(boxSvgBox.contains(boxControls)).toBe(false);
    expect(scatterSvgBox.contains(scatterControls)).toBe(false);
    expect(boxControls.parentElement).toBe(boxSvgBox.parentElement);
    expect(scatterControls.parentElement).toBe(scatterSvgBox.parentElement);
    expect(boxSvgBox.nextElementSibling).toBe(boxControls);
    expect(scatterSvgBox.nextElementSibling).toBe(scatterControls);
    expect(boxControls.classList.contains('graph-export-controls')).toBe(true);
    expect(scatterControls.classList.contains('graph-export-controls')).toBe(true);
    expect(boxControls.classList.contains('box-export-controls-row')).toBe(false);
  });
});
