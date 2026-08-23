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

  test('uses the rendered SVG edges when preserveAspectRatio creates side bands', () => {
    const { svg, legend } = createLegend();
    svg.getBoundingClientRect = () => ({ left: 100, top: 50, right: 500, bottom: 350, width: 400, height: 300 });
    svg.getScreenCTM = () => ({ inverse: () => ({}) });
    svg.createSVGPoint = () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return {
          x: -20 + ((this.x - 100) * 340 / 400),
          y: -10 + ((this.y - 50) * 220 / 300)
        };
      }
    });
    const onDragEnd = jest.fn();
    window.Shared.enableLegendDrag(legend, svg, { onDragEnd });

    drag(legend, { x: 100, y: 80 }, { x: -500, y: 80 });
    expect(legend.getAttribute('transform')).toBe('translate(-20,80)');

    drag(legend, { x: -20, y: 80 }, { x: 700, y: 80 });
    expect(legend.getAttribute('transform')).toBe('translate(240,80)');
    expect(onDragEnd).toHaveBeenLastCalledWith(expect.objectContaining({ x: 240, y: 80 }));
  });

  test('normalizes a restored position that is already outside the viewport', () => {
    const { svg, legend } = createLegend({ x: 260, y: 190 });
    window.Shared.enableLegendDrag(legend, svg);

    expect(legend.getAttribute('transform')).toBe('translate(220,160)');
    expect(window.Shared.undoManager.recordStateChange).not.toHaveBeenCalled();
  });

  test('marks only a live bound legend as a managed graph drag target', () => {
    const { svg, legend } = createLegend();
    const child = document.createElementNS(NS, 'rect');
    legend.appendChild(child);
    window.Shared.enableLegendDrag(legend, svg);

    expect(window.Shared.isManagedLegendDragTarget(child)).toBe(true);

    const restoredSvg = svg.cloneNode(true);
    document.body.appendChild(restoredSvg);
    const restoredChild = restoredSvg.querySelector('rect');
    expect(window.Shared.isManagedLegendDragTarget(restoredChild)).toBe(false);
  });

  test('preserves the clicked legend-text target until a drag actually starts', () => {
    const { svg, legend } = createLegend();
    const text = document.createElementNS(NS, 'text');
    text.textContent = 'Series A';
    legend.appendChild(text);
    legend.setPointerCapture = jest.fn();
    legend.releasePointerCapture = jest.fn();
    window.Shared.enableLegendDrag(legend, svg);

    text.dispatchEvent(new window.MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 80
    }));
    window.dispatchEvent(new window.MouseEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 80
    }));
    expect(legend.setPointerCapture).not.toHaveBeenCalled();

    const dragStart = new window.MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 80
    });
    Object.defineProperty(dragStart, 'pointerId', { value: 7 });
    text.dispatchEvent(dragStart);
    const dragMove = new window.MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 120,
      clientY: 100
    });
    Object.defineProperty(dragMove, 'pointerId', { value: 7 });
    window.dispatchEvent(dragMove);
    expect(legend.setPointerCapture).toHaveBeenCalledTimes(1);
  });

  test('rebinds a serialized legend so its first drag updates owner-relative state', () => {
    const { svg, legend } = createLegend();
    window.Shared.bindLegendDragInteraction(legend, svg, {
      owner: { tabId: 'tab-a' },
      originX: 80,
      originY: 40,
      scaleX: 20,
      scaleY: 40,
      onCommit: jest.fn()
    });

    const restoredSvg = svg.cloneNode(true);
    const restoredLegend = restoredSvg.querySelector('g');
    restoredSvg.createSVGPoint = svg.createSVGPoint;
    restoredSvg.getScreenCTM = svg.getScreenCTM;
    restoredLegend.getBBox = legend.getBBox;
    document.body.appendChild(restoredSvg);
    const owner = { tabId: 'tab-a' };
    const onCommit = jest.fn();

    window.Shared.bindLegendDragInteraction(restoredLegend, restoredSvg, { owner, onCommit });
    drag(restoredLegend, { x: 100, y: 80 }, { x: 120, y: 100 });

    expect(window.Shared.isManagedLegendDragTarget(restoredLegend)).toBe(true);
    expect(restoredLegend.getAttribute('transform')).toBe('translate(120,100)');
    expect(onCommit).toHaveBeenCalledWith({ x: 120, y: 100, relX: 2, relY: 1.5 }, owner);
  });

  test('reclamps and republishes a reused legend after its rendered viewport shrinks', () => {
    const { svg, legend } = createLegend({ x: 0, y: 80 });
    const owner = { tabId: 'tab-a' };
    const onCommit = jest.fn();
    window.Shared.bindLegendDragInteraction(legend, svg, {
      owner,
      originX: 100,
      originY: 40,
      scaleX: 20,
      scaleY: 40,
      onCommit
    });
    expect(onCommit).not.toHaveBeenCalled();

    legend.setAttribute('transform', 'translate(-60,80)');
    window.Shared.bindLegendDragInteraction(legend, svg, {
      owner,
      originX: 80,
      originY: 40,
      scaleX: 20,
      scaleY: 40,
      onCommit
    });

    expect(legend.getAttribute('transform')).toBe('translate(0,80)');
    expect(onCommit).toHaveBeenLastCalledWith({ x: 0, y: 80, relX: -4, relY: 1 }, owner);
  });
});
