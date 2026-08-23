describe('Venn title and set-label layout', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.Shared;
    delete window.Components;
    require('../js/vendor.js');
    require('../js/shared/debug.js');
    require('../js/shared/dom.js');
    require('../js/shared/chartStyle.js');
    require('../js/components/venn.js');
  });

  function overlaps(a, b) {
    return a.x < b.x + b.width
      && a.x + a.width > b.x
      && a.y < b.y + b.height
      && a.y + a.height > b.y;
  }

  function expectCollisionFree(layout, titleBounds) {
    const labels = Object.values(layout.labels || {});
    expect(labels.length).toBeGreaterThanOrEqual(2);
    labels.forEach(label => {
      expect(overlaps(label.box, titleBounds)).toBe(false);
    });
    labels.forEach((label, index) => {
      labels.slice(index + 1).forEach(other => {
        expect(overlaps(label.box, other.box)).toBe(false);
      });
    });
    const circleTop = Math.min(...layout.circles.map(circle => circle.y - circle.r));
    expect(circleTop).toBeGreaterThan(titleBounds.y + titleBounds.height);
  }

  test('three collinear sets alternate label bands and remain clear of the graph title', () => {
    const hooks = window.Components.venn.__testHooks;
    const fontSize = 18;
    const labels = {
      A: hooks.measureTextMetrics('Luminal A (12)', fontSize, 'Arial'),
      B: hooks.measureTextMetrics('Luminal B (14)', fontSize, 'Arial'),
      C: hooks.measureTextMetrics('Basal-like (14)', fontSize, 'Arial')
    };
    const titleBounds = { x: 245, y: 24, width: 150, height: 24 };
    const layout = hooks.resolveDiagramLayout({
      stageWidth: 640,
      stageHeight: 520,
      fontSize,
      titleBounds,
      titleBandBottom: 64,
      circles: [
        { id: 'A', x: 0, y: 0, r: 4.2 },
        { id: 'B', x: 3.1, y: 0, r: 4.5 },
        { id: 'C', x: 6.3, y: 0, r: 4.5 }
      ],
      labelMetrics: labels
    });

    expectCollisionFree(layout, titleBounds);
    const sides = new Set(Object.values(layout.labels).map(label => label.side));
    expect(sides).toEqual(new Set(['top', 'bottom']));
  });

  test('two long set names are placed on opposite arcs when one label band cannot fit', () => {
    const hooks = window.Components.venn.__testHooks;
    const fontSize = 12;
    const labels = {
      A: hooks.measureTextMetrics('Chromatin remodelling complex alpha (30)', fontSize, 'Arial'),
      B: hooks.measureTextMetrics('DNA-damage response interactors beta (28)', fontSize, 'Arial')
    };
    const titleBounds = { x: 150.5, y: 12, width: 96, height: 15 };
    const layout = hooks.resolveDiagramLayout({
      stageWidth: 397,
      stageHeight: 339,
      fontSize,
      titleBounds,
      titleBandBottom: 36,
      circles: [
        { id: 'A', x: 0, y: 0, r: 5.1 },
        { id: 'B', x: 5.3, y: 0, r: 4.9 }
      ],
      labelMetrics: labels
    });

    expectCollisionFree(layout, titleBounds);
    expect(layout.labels.A.side).not.toBe(layout.labels.B.side);
  });

  test('manual title coordinates cannot alter automatic diagram geometry', () => {
    const hooks = window.Components.venn.__testHooks;
    const fontSize = 17;
    const common = {
      stageWidth: 640,
      stageHeight: 460,
      fontSize,
      titleBandBottom: 62,
      circles: [
        { id: 'A', x: 0, y: 0, r: 4.2 },
        { id: 'B', x: 3.1, y: 0, r: 4.5 },
        { id: 'C', x: 6.3, y: 0, r: 4.5 }
      ],
      labelMetrics: {
        A: hooks.measureTextMetrics('Luminal A (12)', fontSize, 'Arial'),
        B: hooks.measureTextMetrics('Luminal B (14)', fontSize, 'Arial'),
        C: hooks.measureTextMetrics('Basal-like (14)', fontSize, 'Arial')
      }
    };

    const defaultTitleLayout = hooks.resolveDiagramLayout({
      ...common,
      titleBounds: { x: 220, y: 18, width: 200, height: 22 }
    });
    const movedTitleLayout = hooks.resolveDiagramLayout({
      ...common,
      titleBounds: { x: 40, y: 240, width: 260, height: 22 }
    });

    expect(movedTitleLayout.circles).toEqual(defaultTitleLayout.circles);
    expect(movedTitleLayout.labels).toEqual(defaultTitleLayout.labels);
    expect(movedTitleLayout.transform).toEqual(defaultTitleLayout.transform);
  });

  test('owner-scoped layout cache ignores manual title coordinates and invalidates on data geometry changes', () => {
    const hooks = window.Components.venn.__testHooks;
    const session = { componentKey: 'venn', tabId: 'workspace-layout-cache', cache: {} };
    const common = {
      stageWidth: 640,
      stageHeight: 460,
      fontSize: 16,
      titleBandBottom: 58,
      circles: [
        { id: 'A', x: 0, y: 0, r: 4.2 },
        { id: 'B', x: 3.1, y: 0, r: 4.5 },
        { id: 'C', x: 6.3, y: 0, r: 4.5 }
      ],
      labelMetrics: {
        A: hooks.measureTextMetrics('Luminal A (12)', 16, 'Arial'),
        B: hooks.measureTextMetrics('Luminal B (14)', 16, 'Arial'),
        C: hooks.measureTextMetrics('Basal-like (14)', 16, 'Arial')
      }
    };

    const first = hooks.resolveDiagramLayoutForSession(session, {
      ...common,
      titleBounds: { x: 220, y: 18, width: 200, height: 22 }
    });
    const movedTitle = hooks.resolveDiagramLayoutForSession(session, {
      ...common,
      titleBounds: { x: 40, y: 240, width: 260, height: 22 }
    });
    const changedData = hooks.resolveDiagramLayoutForSession(session, {
      ...common,
      circles: common.circles.map(circle => circle.id === 'A' ? { ...circle, r: 5.2 } : circle)
    });

    expect(movedTitle).toBe(first);
    expect(changedData).not.toBe(first);
    expect(session.cache.diagramLayout).toBe(changedData);
  });
});
