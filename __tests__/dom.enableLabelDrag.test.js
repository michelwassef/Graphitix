describe('Shared.enableLabelDrag', () => {
  const NS = 'http://www.w3.org/2000/svg';

  function createSvgText(x = 10, y = 20) {
    const svg = document.createElementNS(NS, 'svg');
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.textContent = 'Label';
    svg.appendChild(text);
    svg.createSVGPoint = () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      }
    });
    svg.getScreenCTM = () => null;
    document.body.appendChild(svg);
    return { svg, text };
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    require('../js/vendor.js');
    require('../js/shared/dom.js');
    window.Shared.undoManager = {
      recordStateChange: jest.fn()
    };
  });

  test('plain clicks do not trigger drag lifecycle or undo', () => {
    const { svg, text } = createSvgText();
    const onDragStart = jest.fn();
    const onDragEnd = jest.fn();

    window.Shared.enableLabelDrag(text, svg, { onDragStart, onDragEnd });

    text.dispatchEvent(new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 120
    }));
    window.dispatchEvent(new window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 120
    }));

    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDragEnd).not.toHaveBeenCalled();
    expect(text.getAttribute('x')).toBe('10');
    expect(text.getAttribute('y')).toBe('20');
    expect(window.Shared.undoManager.recordStateChange).not.toHaveBeenCalled();
  });

  test('movement beyond threshold triggers drag lifecycle once', () => {
    const { svg, text } = createSvgText();
    const onDragStart = jest.fn();
    const onDragEnd = jest.fn();

    window.Shared.enableLabelDrag(text, svg, { onDragStart, onDragEnd });

    text.dispatchEvent(new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 120
    }));
    window.dispatchEvent(new window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 111,
      clientY: 133
    }));
    window.dispatchEvent(new window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 111,
      clientY: 133
    }));

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(text.getAttribute('x')).toBe('21');
    expect(text.getAttribute('y')).toBe('33');
    expect(onDragEnd).toHaveBeenCalledWith(expect.objectContaining({
      x: 21,
      y: 33,
      element: text
    }));
    expect(window.Shared.undoManager.recordStateChange).toHaveBeenCalledTimes(1);
  });

  test.each([
    { axisLock: 'x', expectedX: '21', expectedY: '20' },
    { axisLock: 'y', expectedX: '10', expectedY: '33' }
  ])('axisLock=$axisLock constrains movement and can skip undo recording', ({ axisLock, expectedX, expectedY }) => {
    const { svg, text } = createSvgText();
    const onDragEnd = jest.fn();

    window.Shared.enableLabelDrag(text, svg, {
      axisLock,
      recordUndo: false,
      onDragEnd
    });

    text.dispatchEvent(new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 120
    }));
    window.dispatchEvent(new window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 111,
      clientY: 133
    }));
    window.dispatchEvent(new window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 111,
      clientY: 133
    }));

    expect(text.getAttribute('x')).toBe(expectedX);
    expect(text.getAttribute('y')).toBe(expectedY);
    expect(window.Shared.undoManager.recordStateChange).not.toHaveBeenCalled();
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  test('normalizes the committed position before undo history and owner notification', () => {
    const { svg, text } = createSvgText();
    const normalizePosition = jest.fn(() => ({ x: 18, y: 26 }));
    const onPositionChange = jest.fn();

    window.Shared.enableLabelDrag(text, svg, { normalizePosition, onPositionChange });

    text.dispatchEvent(new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 120
    }));
    window.dispatchEvent(new window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 122,
      clientY: 145
    }));
    window.dispatchEvent(new window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 122,
      clientY: 145
    }));

    expect(normalizePosition).toHaveBeenCalledWith(expect.objectContaining({
      x: 32,
      y: 45,
      origin: { x: 10, y: 20 },
      element: text,
      reason: 'drag-end'
    }));
    expect(text.getAttribute('x')).toBe('18');
    expect(text.getAttribute('y')).toBe('26');
    expect(onPositionChange).toHaveBeenCalledWith(expect.objectContaining({
      x: 18,
      y: 26,
      reason: 'drag-end'
    }));
    const entry = window.Shared.undoManager.recordStateChange.mock.calls[0][0];
    expect(entry.to).toEqual(expect.objectContaining({ x: 18, y: 26 }));
  });

  test('committed positions notify owner state on drag, undo, and redo', () => {
    const { svg, text } = createSvgText();
    const onPositionChange = jest.fn();

    window.Shared.enableLabelDrag(text, svg, { onPositionChange });

    text.dispatchEvent(new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 120
    }));
    window.dispatchEvent(new window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 112,
      clientY: 134
    }));
    window.dispatchEvent(new window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 112,
      clientY: 134
    }));

    expect(onPositionChange).toHaveBeenCalledWith(expect.objectContaining({
      x: 22,
      y: 34,
      element: text,
      reason: 'drag-end'
    }));

    const entry = window.Shared.undoManager.recordStateChange.mock.calls[0][0];
    expect(entry.apply(entry.from, 'undo')).toBe(true);
    expect(onPositionChange).toHaveBeenLastCalledWith(expect.objectContaining({
      x: 10,
      y: 20,
      element: text,
      reason: 'undo'
    }));
    expect(entry.apply(entry.to, 'redo')).toBe(true);
    expect(onPositionChange).toHaveBeenLastCalledWith(expect.objectContaining({
      x: 22,
      y: 34,
      element: text,
      reason: 'redo'
    }));
  });

  test('can normalize every drag frame and notify a linked element without committing early', () => {
    const { svg, text } = createSvgText();
    const onDragMove = jest.fn();
    const onPositionChange = jest.fn();
    const normalizePosition = jest.fn(position => ({
      x: Math.min(20, position.x),
      y: Math.min(30, position.y)
    }));

    window.Shared.enableLabelDrag(text, svg, {
      normalizeDuringDrag: true,
      normalizePosition,
      onDragMove,
      onPositionChange
    });

    text.dispatchEvent(new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 120
    }));
    window.dispatchEvent(new window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 140,
      clientY: 160
    }));

    expect(text.getAttribute('x')).toBe('20');
    expect(text.getAttribute('y')).toBe('30');
    expect(onDragMove).toHaveBeenCalledWith(expect.objectContaining({ x: 20, y: 30 }));
    expect(onPositionChange).not.toHaveBeenCalled();

    window.dispatchEvent(new window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 140,
      clientY: 160
    }));
    expect(onPositionChange).toHaveBeenCalledTimes(1);
  });

  test('syncChildX preserves inline tspan flow while moving explicit line anchors', () => {
    const { svg, text } = createSvgText();
    text.textContent = '';
    const lineStart = document.createElementNS(NS, 'tspan');
    lineStart.setAttribute('x', '10');
    lineStart.textContent = 'y = 32.9964 e';
    const exponent = document.createElementNS(NS, 'tspan');
    exponent.setAttribute('baseline-shift', 'super');
    exponent.setAttribute('font-size', '0.78em');
    exponent.textContent = '0.0703x';
    text.appendChild(lineStart);
    text.appendChild(exponent);

    window.Shared.enableLabelDrag(text, svg, { syncChildX: true });

    text.dispatchEvent(new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 120
    }));
    window.dispatchEvent(new window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 112,
      clientY: 134
    }));
    window.dispatchEvent(new window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 112,
      clientY: 134
    }));

    expect(text.getAttribute('x')).toBe('22');
    expect(lineStart.getAttribute('x')).toBe('22');
    expect(exponent.hasAttribute('x')).toBe(false);

    const entry = window.Shared.undoManager.recordStateChange.mock.calls[0][0];
    expect(entry.apply(entry.from, 'undo')).toBe(true);
    expect(lineStart.getAttribute('x')).toBe('10');
    expect(exponent.hasAttribute('x')).toBe(false);
    expect(entry.apply(entry.to, 'redo')).toBe(true);
    expect(lineStart.getAttribute('x')).toBe('22');
    expect(exponent.hasAttribute('x')).toBe(false);
  });

});
