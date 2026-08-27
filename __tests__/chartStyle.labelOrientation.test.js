describe('chartStyle rotated tick-label clearance', () => {
  beforeAll(() => {
    jest.resetModules();
    require('../js/shared/chartStyle.js');
  });

  test('reduces rotated baseline dy to preserve the unrotated optical gap', () => {
    const { chartStyle } = window.Shared;
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    node.setAttribute('x', '100');
    node.setAttribute('y', '50');
    node.setAttribute('font-size', '16');
    node.setAttribute('text-anchor', 'middle');
    node.setAttribute('dy', '0.35em');
    node.textContent = 'Treatment';
    node.getBBox = () => {
      const dy = Number.parseFloat(node.getAttribute('dy'))
        * (/em$/i.test(node.getAttribute('dy')) ? 16 : 1);
      const x = node.getAttribute('text-anchor') === 'end' ? 40 : 70;
      return { x, y: 50 + dy - 12, width: 60, height: 16 };
    };

    chartStyle.applyLabelOrientation([node], {
      angle: -45,
      anchor: 'end',
      dy: '0.35em',
      force: true
    });

    expect(node.getAttribute('transform')).toBe('rotate(-45 100 50)');
    expect(Number.parseFloat(node.getAttribute('dy'))).toBeCloseTo(2.95, 2);
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
