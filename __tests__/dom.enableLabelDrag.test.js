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
});
