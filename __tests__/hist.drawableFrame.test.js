describe('hist drawable frame authority', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {
      isDebugEnabled: () => false
    };
    window.Components = {};
    require('../js/shared/componentLayout.js');
    require('../js/components/hist.js');
  });

  test('uses the resizer zoom viewport instead of stale plot height', () => {
    document.body.innerHTML = `
      <div id="histPage">
        <div id="histGraphPanel">
          <div class="svgbox" data-resizer-zoom-level="1">
            <div class="resizer-zoom-viewport">
              <div class="resizer-zoom-content">
                <div id="histPlot"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const plot = document.getElementById('histPlot');
    const viewport = document.querySelector('.resizer-zoom-viewport');
    Object.defineProperty(plot, 'clientWidth', { configurable: true, get: () => 480 });
    Object.defineProperty(plot, 'clientHeight', { configurable: true, get: () => 260 });
    viewport.getBoundingClientRect = () => ({ width: 480, height: 390, top: 0, left: 0, right: 480, bottom: 390 });

    const frame = window.Components.hist.__testHooks.resolveDrawableFrame(plot);

    expect(frame.source).toBe('zoom-viewport');
    expect(frame.width).toBe(480);
    expect(frame.height).toBe(390);
    expect(frame.rawHeight).toBe(260);
    expect(frame.constrained).toBe(false);
  });

  test('falls back to svgbox before plot output when no zoom viewport exists', () => {
    document.body.innerHTML = `
      <div id="histPage">
        <div id="histGraphPanel">
          <div class="svgbox" data-resizer-zoom-level="1">
            <div id="histPlot"></div>
          </div>
        </div>
      </div>
    `;
    const svgBox = document.querySelector('.svgbox');
    const plot = document.getElementById('histPlot');
    Object.defineProperty(plot, 'clientWidth', { configurable: true, get: () => 820 });
    Object.defineProperty(plot, 'clientHeight', { configurable: true, get: () => 640 });
    svgBox.getBoundingClientRect = () => ({ width: 520, height: 340, top: 0, left: 0, right: 520, bottom: 340 });

    const frame = window.Components.hist.__testHooks.resolveDrawableFrame(plot);

    expect(frame.source).toBe('svgbox');
    expect(frame.width).toBe(520);
    expect(frame.height).toBe(340);
    expect(frame.constrained).toBe(true);
  });
});
