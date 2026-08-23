describe('chartStyle point-label layout', () => {
  const expectOutwardLeader = placement => {
    const endpoint = placement.leaderPoints.at(-1);
    const approach = placement.leaderPoints.at(-2);
    if(placement.leaderSide === 'start' || placement.leaderSide === 'end'){
      const inwardDirection = placement.leaderSide === 'start' ? 1 : -1;
      expect((approach.x - endpoint.x) * inwardDirection).toBeLessThanOrEqual(0);
    }else{
      const inwardDirection = placement.leaderSide === 'top' ? 1 : -1;
      expect((approach.y - endpoint.y) * inwardDirection).toBeLessThanOrEqual(0);
    }
  };

  const boxesOverlap = (a, b) => a.minX < b.maxX
    && a.maxX > b.minX
    && a.minY < b.maxY
    && a.maxY > b.minY;

  const segmentIntersectsBox = (segment, box) => {
    const samples = 80;
    for(let step = 0; step <= samples; step += 1){
      const t = step / samples;
      const x = segment.x1 + (segment.x2 - segment.x1) * t;
      const y = segment.y1 + (segment.y2 - segment.y1) * t;
      if(x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY){
        return true;
      }
    }
    return false;
  };

  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
    require('../js/shared/chartStyle.js');
  });

  test('dense scientific labels plateau at 7 pt', () => {
    const labelLayout = window.Shared.labelLayout;
    const minimumPx = 7 * (96 / 72);

    expect(labelLayout.computePointLabelFontSize(12, 400, 480, 480, {
      maxFontSize: 12
    })).toBeCloseTo(minimumPx, 6);
    expect(labelLayout.computePointLabelFontSize(12, 400, 480, 480, {
      maxFontSize: 8
    })).toBeCloseTo(minimumPx, 6);
  });

  test('point labels default to 10 pt before density scaling', () => {
    const labelLayout = window.Shared.labelLayout;
    const defaultPx = 10 * (96 / 72);

    expect(labelLayout.POINT_LABEL_DEFAULT_FONT_SIZE_PT).toBe(10);
    expect(labelLayout.resolvePointLabelBaseFontSize()).toBeCloseTo(defaultPx, 8);
    expect(labelLayout.computePointLabelFontSize(defaultPx, 1, 520, 520, {
      maxFontSize: defaultPx
    })).toBeCloseTo(defaultPx, 8);
  });

  test('uses all-label and individual font styles in label geometry', () => {
    const placements = window.Shared.labelLayout.computePointLabelLayout([
      { text: 'All labels', cx: 80, cy: 70, radius: 3, pointId: 'a', labelKey: 'a' },
      { text: 'Individual', cx: 220, cy: 70, radius: 3, pointId: 'b', labelKey: 'b' }
    ], {
      plotLeft: 0,
      plotRight: 360,
      plotTop: 0,
      plotBottom: 180,
      containerLeft: 0,
      containerRight: 360,
      containerTop: 0,
      containerBottom: 180,
      labelFontSize: 10,
      fontStyles: {
        __labels__: { fontSize: '18px' },
        'pointLabel:b': { fontSize: '24px' }
      },
      pointBounds: [
        { cx: 80, cy: 70, r: 3, pointId: 'a' },
        { cx: 220, cy: 70, r: 3, pointId: 'b' }
      ],
      measureText: (text, font) => text.length * Number(font.match(/([\d.]+)px/)?.[1] || 10) * 0.6,
      font: '10px Arial'
    });
    const byId = Object.fromEntries(placements.map(result => [result.entry.pointId, result.placement]));

    expect(byId.a.fontSize).toBe(18);
    expect(byId.b.fontSize).toBe(24);
    expect(byId.a.bbox.maxY - byId.a.bbox.minY).toBeCloseTo(18 * 1.05, 6);
    expect(byId.b.bbox.maxY - byId.b.bbox.minY).toBeCloseTo(24 * 1.05, 6);
  });

  test('keeps the leader straight when boundary fitting would place the point under the label', () => {
    const labelLayout = window.Shared.labelLayout;
    const [result] = labelLayout.computePointLabelLayout([{
      text: 'Boundary label',
      cx: 40,
      cy: 60,
      radius: 2
    }], {
      plotLeft: 0,
      plotRight: 100,
      plotTop: 0,
      plotBottom: 120,
      containerLeft: -30,
      containerRight: 130,
      containerTop: 0,
      containerBottom: 120,
      labelFontSize: 10,
      leaderGap: 2,
      angleSteps: 8,
      maxLeaderScale: 1,
      measureText: () => 60,
      font: '10px Arial'
    });

    const placement = result.placement;
    const endpoint = placement.leaderPoints.at(-1);
    expect(placement.leaderPoints).toHaveLength(2);
    expect(placement.leaderStyle).toBe('straight');
    expectOutwardLeader(placement);
    expect(['start', 'end', 'top', 'bottom']).toContain(placement.leaderSide);
    if(placement.leaderSide === 'start') expect(endpoint.x).toBeCloseTo(placement.bbox.minX, 8);
    if(placement.leaderSide === 'end') expect(endpoint.x).toBeCloseTo(placement.bbox.maxX, 8);
    if(placement.leaderSide === 'top') expect(endpoint.y).toBeCloseTo(placement.bbox.minY, 8);
    if(placement.leaderSide === 'bottom') expect(endpoint.y).toBeCloseTo(placement.bbox.maxY, 8);
  });

  test('leader touches both the source marker and label boundary', () => {
    const [result] = window.Shared.labelLayout.computePointLabelLayout([{
      text: 'Connected', cx: 80, cy: 60, radius: 5, pointId: 'connected'
    }], {
      plotLeft: 0,
      plotRight: 220,
      plotTop: 0,
      plotBottom: 140,
      containerLeft: 0,
      containerRight: 220,
      containerTop: 0,
      containerBottom: 140,
      labelFontSize: 12,
      leaderGap: 4,
      pointBounds: [{ cx: 80, cy: 60, r: 5, pointId: 'connected' }],
      measureText: () => 70,
      font: '12px Arial'
    });
    const placement = result.placement;
    const source = placement.leaderPoints[0];
    const endpoint = placement.leaderPoints.at(-1);

    expect(Math.hypot(source.x - 80, source.y - 60)).toBeCloseTo(5, 8);
    if(placement.leaderSide === 'start') expect(endpoint.x).toBeCloseTo(placement.bbox.minX, 8);
    if(placement.leaderSide === 'end') expect(endpoint.x).toBeCloseTo(placement.bbox.maxX, 8);
    if(placement.leaderSide === 'top') expect(endpoint.y).toBeCloseTo(placement.bbox.minY, 8);
    if(placement.leaderSide === 'bottom') expect(endpoint.y).toBeCloseTo(placement.bbox.maxY, 8);
  });

  test('rejects a leader when the point lies inside the label gap', () => {
    const geometry = window.Shared.labelLayout.resolvePointLabelLeaderGeometry({
      minX: 40,
      maxX: 60
    }, {
      cx: 62,
      cy: 80
    }, {
      textY: 40,
      leaderGap: 4,
      labelFontSize: 10,
      plotLeft: 0,
      plotRight: 100
    });

    expect(geometry).toBeNull();
  });

  test('keeps straight leaders on the outward-facing text end', () => {
    const [result] = window.Shared.labelLayout.computePointLabelLayout([{
      text: 'Side label',
      cx: 80,
      cy: 60,
      radius: 2
    }], {
      plotLeft: 0,
      plotRight: 100,
      plotTop: 0,
      plotBottom: 120,
      labelFontSize: 10,
      leaderGap: 2,
      angleSteps: 8,
      maxLeaderScale: 1,
      measureText: () => 60,
      font: '10px Arial'
    });

    expect(result.placement.leaderStyle).toBe('straight');
    expect(result.placement.leaderSide).toBe('end');
    expect(result.placement.bbox.maxX).toBeLessThanOrEqual(80);
  });

  test('never permits a label outside the SVG container', () => {
    const [result] = window.Shared.labelLayout.computePointLabelLayout([{
      text: 'Right edge label',
      cx: 145,
      cy: 60,
      radius: 3,
      pointId: 'edge'
    }], {
      plotLeft: 20,
      plotRight: 160,
      plotTop: 20,
      plotBottom: 100,
      containerLeft: 0,
      containerRight: 180,
      containerTop: 0,
      containerBottom: 120,
      labelFontSize: 10,
      leaderGap: 3,
      angleSteps: 16,
      maxLeaderScale: 3,
      pointBounds: [{ cx: 145, cy: 60, r: 3, pointId: 'edge' }],
      measureText: () => 72,
      font: '10px Arial'
    });

    expect(result.placement.bbox.minX).toBeGreaterThanOrEqual(2);
    expect(result.placement.bbox.maxX).toBeLessThanOrEqual(178);
    expect(result.placement.bbox.minY).toBeGreaterThanOrEqual(2);
    expect(result.placement.bbox.maxY).toBeLessThanOrEqual(118);
    expect(result.placement.leaderPoints).toHaveLength(2);
    expectOutwardLeader(result.placement);
  });

  test('preserves the outward angle after labels avoid each other', () => {
    const placements = window.Shared.labelLayout.computePointLabelLayout([
      { text: 'First nearby label', cx: 70, cy: 60, radius: 2 },
      { text: 'Second nearby label', cx: 76, cy: 64, radius: 2 }
    ], {
      plotLeft: 0,
      plotRight: 200,
      plotTop: 0,
      plotBottom: 120,
      labelFontSize: 10,
      leaderGap: 4,
      angleSteps: 16,
      maxLeaderScale: 3,
      measureText: () => 80,
      font: '10px Arial'
    });

    expect(placements).toHaveLength(2);
    placements.forEach(({ placement }) => {
      expect(placement.leaderStyle).toBe('straight');
      expect(placement.leaderPoints).toHaveLength(2);
      expectOutwardLeader(placement);
    });
  });

  test('globally avoids labels, foreign leaders, and unrelated points independent of input order', () => {
    const entries = [
      { text: 'Alpha label', cx: 90, cy: 70, radius: 3, pointId: 'a' },
      { text: 'Beta label', cx: 101, cy: 76, radius: 3, pointId: 'b' },
      { text: 'Gamma label', cx: 112, cy: 70, radius: 3, pointId: 'c' },
      { text: 'Delta label', cx: 101, cy: 88, radius: 3, pointId: 'd' }
    ];
    const options = {
      plotLeft: 0,
      plotRight: 300,
      plotTop: 0,
      plotBottom: 220,
      labelFontSize: 10,
      leaderGap: 3,
      angleSteps: 16,
      maxLeaderScale: 4,
      pointBounds: entries.map(entry => ({
        cx: entry.cx,
        cy: entry.cy,
        r: entry.radius,
        pointId: entry.pointId
      })),
      measureText: () => 72,
      font: '10px Arial'
    };
    const solve = input => window.Shared.labelLayout.computePointLabelLayout(input, options);
    const forward = solve(entries);
    const reversed = solve(entries.slice().reverse());
    const positions = placements => Object.fromEntries(placements.map(({ entry, placement }) => [
      entry.pointId,
      [placement.textX, placement.textY]
    ]));

    expect(positions(reversed)).toEqual(positions(forward));
    forward.forEach(({ placement }) => {
      expect(placement.layoutCollisionCount).toBe(0);
      expectOutwardLeader(placement);
    });
    for(let first = 0; first < forward.length; first += 1){
      for(let second = first + 1; second < forward.length; second += 1){
        const a = forward[first].placement;
        const b = forward[second].placement;
        expect(boxesOverlap(a.bbox, b.bbox)).toBe(false);
        expect(a.leaderSegments.some(segment => segmentIntersectsBox(segment, b.bbox))).toBe(false);
        expect(b.leaderSegments.some(segment => segmentIntersectsBox(segment, a.bbox))).toBe(false);
      }
    }
  });

  test('keeps pinned labels fixed while later labels avoid them', () => {
    const labelLayout = window.Shared.labelLayout;
    const pinned = {
      text: 'Pinned label',
      cx: 80,
      cy: 70,
      radius: 3,
      pointId: 'pinned',
      pinnedPosition: { x: 150, y: 55, anchor: 'start' }
    };
    const options = {
      plotLeft: 0,
      plotRight: 320,
      plotTop: 0,
      plotBottom: 180,
      containerLeft: 0,
      containerRight: 320,
      containerTop: 0,
      containerBottom: 180,
      labelFontSize: 10,
      leaderGap: 3,
      angleSteps: 16,
      maxLeaderScale: 4,
      pointBounds: [
        { cx: 80, cy: 70, r: 3, pointId: 'pinned' },
        { cx: 155, cy: 70, r: 3, pointId: 'later' }
      ],
      measureText: () => 72,
      font: '10px Arial'
    };
    const [pinnedOnly] = labelLayout.computePointLabelLayout([pinned], options);
    const placements = labelLayout.computePointLabelLayout([
      pinned,
      { text: 'Later label', cx: 155, cy: 70, radius: 3, pointId: 'later' }
    ], options);
    const pinnedWithLater = placements.find(result => result.entry.pointId === 'pinned');
    const later = placements.find(result => result.entry.pointId === 'later');

    expect(pinnedOnly.placement.pinned).toBe(true);
    expect(pinnedWithLater.placement.textX).toBeCloseTo(pinnedOnly.placement.textX, 8);
    expect(pinnedWithLater.placement.textY).toBeCloseTo(pinnedOnly.placement.textY, 8);
    expect(boxesOverlap(pinnedWithLater.placement.bbox, later.placement.bbox)).toBe(false);
    expect(later.placement.leaderSegments.some(segment => segmentIntersectsBox(segment, pinnedWithLater.placement.bbox))).toBe(false);
  });

  test('normalizes a pinned drag inside the SVG with a straight outward leader', () => {
    const placement = window.Shared.labelLayout.resolvePinnedPointLabelPlacement({
      cx: 100,
      cy: 60,
      radius: 3
    }, {
      x: 98,
      y: -20,
      anchor: 'start'
    }, {
      textWidth: 80,
      labelHeight: 12,
      leaderGap: 3,
      containerLeft: 0,
      containerRight: 220,
      containerTop: 0,
      containerBottom: 140
    });

    expect(placement.pinned).toBe(true);
    expect(placement.bbox.minX).toBeGreaterThanOrEqual(2);
    expect(placement.bbox.maxX).toBeLessThanOrEqual(218);
    expect(placement.bbox.minY).toBeGreaterThanOrEqual(2);
    expect(placement.bbox.maxY).toBeLessThanOrEqual(138);
    expect(placement.leaderPoints).toHaveLength(2);
    expectOutwardLeader(placement);
  });
});
