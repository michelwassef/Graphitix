describe('chartStyle axis-resize margin baseline', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../js/shared/chartStyle.js');
  });

  function markHorizontalResizeLock(svgBox) {
    svgBox.dataset.resizerAspectLocked = 'false';
    svgBox.dataset.resizerLastAxis = 'x';
    svgBox.dataset.resizerAxisViewportLockAxis = 'x';
    svgBox.dataset.resizerAxisViewportLockUntil = String(Date.now() + 5000);
  }

  test('a provisional pass cannot seed an empty baseline after render-cache restore', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    markHorizontalResizeLock(svgBox);

    const provisional = chartStyle.stabilizeAxisResizeMargins(
      { top: 36, right: 24, bottom: 64, left: 56 },
      { svgBox, scopeId: 'test', commitBaseline: false }
    );
    const measured = chartStyle.stabilizeAxisResizeMargins(
      { top: 36, right: 24, bottom: 64, left: 92 },
      { svgBox, scopeId: 'test' }
    );
    const laterPass = chartStyle.stabilizeAxisResizeMargins(
      { top: 36, right: 24, bottom: 64, left: 108 },
      { svgBox, scopeId: 'test' }
    );

    expect(provisional.left).toBe(56);
    expect(measured.left).toBe(92);
    expect(laterPass.left).toBe(92);
  });

  test('a provisional pass still consumes an existing live-session baseline', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');

    const liveBaseline = chartStyle.stabilizeAxisResizeMargins(
      { top: 36, right: 24, bottom: 64, left: 92 },
      { svgBox, scopeId: 'test' }
    );
    expect(liveBaseline.left).toBe(92);

    markHorizontalResizeLock(svgBox);
    const provisional = chartStyle.stabilizeAxisResizeMargins(
      { top: 36, right: 24, bottom: 64, left: 56 },
      { svgBox, scopeId: 'test', commitBaseline: false }
    );
    const measured = chartStyle.stabilizeAxisResizeMargins(
      { top: 36, right: 24, bottom: 64, left: 108 },
      { svgBox, scopeId: 'test' }
    );

    expect(provisional.left).toBe(92);
    expect(measured.left).toBe(92);
  });
});
