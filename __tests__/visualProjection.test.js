describe('Shared.visualProjection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.Shared = {};
    jest.resetModules();
    require('../js/shared/visualProjection.js');
  });

  function createSvg(){
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    return svg;
  }

  test('projects a scaled style only onto the matching owner and channel', () => {
    const svg = createSvg();
    const owned = document.createElementNS(svg.namespaceURI, 'line');
    const unrelated = document.createElementNS(svg.namespaceURI, 'line');
    svg.append(owned, unrelated);

    expect(window.Shared.visualProjection.bind(owned, {
      component: 'hist',
      channel: 'axis',
      tabId: 'tab-a',
      strokeWidthBase: 2,
      renderedStrokeWidth: 3
    })).toBe(true);
    window.Shared.visualProjection.bind(unrelated, {
      component: 'hist',
      channel: 'axis',
      tabId: 'tab-b'
    });

    expect(window.Shared.visualProjection.apply(svg, {
      component: 'hist',
      channel: 'axis',
      tabId: 'tab-a',
      attributes: { stroke: '#123456', strokeWidth: 4 }
    })).toBe(true);
    expect(owned.getAttribute('stroke')).toBe('#123456');
    expect(owned.getAttribute('stroke-width')).toBe('6');
    expect(unrelated.hasAttribute('stroke')).toBe(false);
  });

  test('rejects stale owners and unsupported attributes without partial mutation', () => {
    const svg = createSvg();
    const axis = document.createElementNS(svg.namespaceURI, 'line');
    svg.appendChild(axis);
    window.Shared.visualProjection.bind(axis, {
      component: 'roc',
      channel: 'axis',
      tabId: 'tab-a'
    });

    expect(window.Shared.visualProjection.apply(svg, {
      component: 'roc',
      channel: 'axis',
      tabId: 'tab-b',
      attributes: { stroke: '#ff0000' }
    })).toBe(false);
    expect(window.Shared.visualProjection.apply(svg, {
      component: 'roc',
      channel: 'axis',
      tabId: 'tab-a',
      attributes: { stroke: '#ff0000', transform: 'scale(2)' }
    })).toBe(false);
    expect(axis.hasAttribute('stroke')).toBe(false);
  });

  test('supports keyed series projections', () => {
    const svg = createSvg();
    const first = document.createElementNS(svg.namespaceURI, 'path');
    const second = document.createElementNS(svg.namespaceURI, 'path');
    svg.append(first, second);
    window.Shared.visualProjection.bind(first, {
      component: 'survival',
      channel: 'series',
      tabId: 'tab-a',
      key: 'Control'
    });
    window.Shared.visualProjection.bind(second, {
      component: 'survival',
      channel: 'series',
      tabId: 'tab-a',
      key: 'Treatment'
    });

    expect(window.Shared.visualProjection.apply(svg, {
      component: 'survival',
      channel: 'series',
      tabId: 'tab-a',
      key: 'Treatment',
      attributes: { strokeOpacity: 0.4 }
    })).toBe(true);
    expect(first.hasAttribute('stroke-opacity')).toBe(false);
    expect(second.getAttribute('stroke-opacity')).toBe('0.4');
  });

  test('preserves a renderer-defined minimum while scaling stroke width', () => {
    const svg = createSvg();
    const trace = document.createElementNS(svg.namespaceURI, 'path');
    svg.appendChild(trace);
    window.Shared.visualProjection.bind(trace, {
      component: 'hist',
      channel: 'trace-border',
      tabId: 'tab-a',
      strokeWidthFactor: 1.5,
      strokeWidthMinimum: 2,
      properties: ['strokeWidth']
    });

    expect(window.Shared.visualProjection.apply(svg, {
      component: 'hist',
      channel: 'trace-border',
      tabId: 'tab-a',
      attributes: { strokeWidth: 0.5 }
    })).toBe(true);
    expect(trace.getAttribute('stroke-width')).toBe('2');
  });
});
