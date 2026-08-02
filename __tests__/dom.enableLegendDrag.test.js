describe('Shared.enableLegendDrag viewport bounds', () => {
  const NS = 'http://www.w3.org/2000/svg';

  function createLegend({ x = 100, y = 80 } = {}) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 300 200');
    svg.createSVGPoint = () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      }
    });
    svg.getScreenCTM = () => null;

    const legend = document.createElementNS(NS, 'g');
    legend.setAttribute('transform', `translate(${x},${y})`);
    legend.getBBox = () => ({ x: 0, y: 0, width: 80, height: 40 });
    svg.appendChild(legend);
    document.body.appendChild(svg);
    return { svg, legend };
  }

  function drag(legend, from, to) {
    legend.dispatchEvent(new window.MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: from.x,
      clientY: from.y
    }));
    window.dispatchEvent(new window.MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: to.x,
      clientY: to.y
    }));
    window.dispatchEvent(new window.MouseEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: to.x,
      clientY: to.y
    }));
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../js/shared/dom.js');
    window.Shared.undoManager = { recordStateChange: jest.fn() };
  });

  test('clamps the complete legend inside every SVG edge while dragging', () => {
    const { svg, legend } = createLegend();
    const onDragEnd = jest.fn();
    window.Shared.enableLegendDrag(legend, svg, { onDragEnd });

    drag(legend, { x: 100, y: 80 }, { x: 700, y: 600 });
    expect(legend.getAttribute('transform')).toBe('translate(220,160)');
    expect(onDragEnd).toHaveBeenLastCalledWith(expect.objectContaining({ x: 220, y: 160 }));

    drag(legend, { x: 220, y: 160 }, { x: -500, y: -500 });
    expect(legend.getAttribute('transform')).toBe('translate(0,0)');
    expect(onDragEnd).toHaveBeenLastCalledWith(expect.objectContaining({ x: 0, y: 0 }));
  });

  test('normalizes a restored position that is already outside the viewport', () => {
    const { svg, legend } = createLegend({ x: 260, y: 190 });
    window.Shared.enableLegendDrag(legend, svg);

    expect(legend.getAttribute('transform')).toBe('translate(220,160)');
    expect(window.Shared.undoManager.recordStateChange).not.toHaveBeenCalled();
  });
});
