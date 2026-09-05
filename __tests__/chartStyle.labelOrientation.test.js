describe('chartStyle rotated tick-label clearance', () => {
  beforeAll(() => {
    jest.resetModules();
    require('../js/shared/chartStyle.js');
  });

  function makeMockLabel() {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    node.setAttribute('x', '100');
    node.setAttribute('y', '50');
    node.setAttribute('font-size', '16');
    node.setAttribute('text-anchor', 'middle');
    node.setAttribute('dy', '0.35em');
    node.textContent = 'Treatment';
    node.getBBox = () => {
      const dyAttr = node.getAttribute('dy') || '0';
      const dy = Number.parseFloat(dyAttr)
        * (/em$/i.test(dyAttr) ? 16 : 1);
      const anchor = node.getAttribute('text-anchor') || 'start';
      const x = anchor === 'end' ? 40 : (anchor === 'middle' ? 70 : 100);
      return { x, y: 50 + dy - 12, width: 60, height: 16 };
    };
    return node;
  }

  function rotatedTop(box, pivotX, pivotY, angleDeg) {
    const radians = angleDeg * Math.PI / 180;
    const sine = Math.sin(radians);
    const cosine = Math.cos(radians);
    const xs = [box.x, box.x + box.width];
    const ys = [box.y, box.y + box.height];
    return Math.min(...xs.flatMap(boxX => ys.map(boxY => (
      pivotY
      + ((boxX - pivotX) * sine)
      + ((boxY - pivotY) * cosine)
    ))));
  }

  test.each([-45, -90, 45, 90])(
    'preserves the canonical unrotated edge plus optical clearance at %s degrees',
    angle => {
      const { chartStyle } = window.Shared;
      const node = makeMockLabel();
      const anchor = angle < 0 ? 'end' : 'start';

      chartStyle.applyLabelOrientation([node], {
        angle,
        anchor,
        dy: '0.35em',
        opticalPaddingPx: 4,
        force: true
      });

      expect(node.getAttribute('dy')).toBe('0.35em');
      const transform = node.getAttribute('transform') || '';
      const match = transform.match(/^translate\(0 ([-+0-9.]+)\) rotate\(([-+0-9.]+) 100 50\)$/);
      expect(match).not.toBeNull();
      const shift = Number(match[1]);
      expect(Number(match[2])).toBe(angle);

      const unrotatedBox = node.getBBox();
      const visibleRotatedTop = rotatedTop(unrotatedBox, 100, 50, angle) + shift;
      expect(visibleRotatedTop).toBeCloseTo(unrotatedBox.y + 4, 3);
    }
  );


  test('explicit zero-degree orientation clears a stale rotation on reused tick nodes', () => {
    const { chartStyle } = window.Shared;
    const node = makeMockLabel();
    node.setAttribute('transform', 'translate(0 12) rotate(-90 100 50)');
    node.setAttribute('text-anchor', 'end');

    expect(chartStyle.applyLabelOrientation([node], {
      angle: 0,
      anchor: 'middle',
      dy: '0.35em',
      force: false,
      disableAuto: true
    })).toBe(false);

    expect(node.getAttribute('text-anchor')).toBe('middle');
    expect(node.getAttribute('dy')).toBe('0.35em');
    expect(node.hasAttribute('transform')).toBe(false);
  });

  test('keeps the original dy when labels remain horizontal', () => {
    const { chartStyle } = window.Shared;
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    node.setAttribute('x', '100');
    node.setAttribute('y', '50');
    node.setAttribute('dy', '0.35em');

    expect(chartStyle.applyLabelOrientation([node], { force: false })).toBe(false);
    expect(node.getAttribute('dy')).toBe('0.35em');
    expect(node.hasAttribute('transform')).toBe(false);
  });
});
