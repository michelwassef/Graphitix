describe('Box significance whisker modes', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('fixed whiskers keep equal end ticks (vertical)', () => {
    expect(hooks).toBeDefined();
    const geom = hooks.buildSignificanceBracketGeometry({
      orientation: 'vertical',
      x1: 10,
      x2: 20,
      valueCoord: 50,
      bracketSize: 10,
      showWhiskers: true,
      whiskerMode: 'fixed',
      outerCoordA: 50,
      outerCoordB: 80
    });
    expect(geom.d).toBe('M10,50 L10,40 L20,40 L20,50');
  });

  test('adaptive whiskers extend the lower end (vertical)', () => {
    expect(hooks).toBeDefined();
    const geom = hooks.buildSignificanceBracketGeometry({
      orientation: 'vertical',
      x1: 10,
      x2: 20,
      valueCoord: 50,
      bracketSize: 10,
      showWhiskers: true,
      whiskerMode: 'adaptive',
      outerCoordA: 50,
      outerCoordB: 80
    });
    expect(geom.d).toBe('M10,50 L10,40 L20,40 L20,80');
    expect(geom.refOuter).toBe(50);
  });

  test('adaptive whiskers extend the earlier max when axes are flipped (horizontal)', () => {
    expect(hooks).toBeDefined();
    const geom = hooks.buildSignificanceBracketGeometry({
      orientation: 'horizontal',
      x1: 10,
      x2: 20,
      valueCoord: 100,
      bracketSize: 10,
      showWhiskers: true,
      whiskerMode: 'adaptive',
      outerCoordA: 100,
      outerCoordB: 70
    });
    expect(geom.d).toBe('M100,10 L110,10 L110,20 L70,20');
    expect(geom.refOuter).toBe(100);
  });

  test('p-value labels use threshold text in normal mode', () => {
    expect(hooks).toBeDefined();
    expect(hooks.formatSignificanceLabel(0.0001, 'p', { scientific: false, decimals: 2 })).toBe('<0.01');
    expect(hooks.formatSignificanceLabel(0.0123, 'p', { scientific: false, decimals: 2 })).toBe('0.01');
  });

  test('p-value labels use scientific notation when enabled', () => {
    expect(hooks).toBeDefined();
    expect(hooks.formatSignificanceLabel(0.0001, 'p', { scientific: true, decimals: 2 })).toBe('1.00e-4');
  });

  test('converging whiskers separate opposite sides while keeping same-side boundaries aligned', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildPairAnnotationLayout).toBe('function');
    const pairs = [
      { ai: 0, bi: 1, rangeMax: 10, id: '0-1' },
      { ai: 1, bi: 2, rangeMax: 11, id: '1-2' },
      { ai: 0, bi: 2, rangeMax: 12, id: '0-2' }
    ];
    const centers = [100, 200, 300];
    const withSeparation = hooks.buildPairAnnotationLayout(pairs, {
      orientation: 'vertical',
      categoryCenter: idx => centers[idx],
      valueToCoord: value => 1000 - value,
      baseOffset: 25,
      levelGap: 25,
      strokeWidth: 1,
      fontSize: 12,
      separateConvergingEndpoints: true,
      endpointSeparationStep: 6,
      endpointSeparationMax: 12
    });
    const withoutSeparation = hooks.buildPairAnnotationLayout(pairs, {
      orientation: 'vertical',
      categoryCenter: idx => centers[idx],
      valueToCoord: value => 1000 - value,
      baseOffset: 25,
      levelGap: 25,
      strokeWidth: 1,
      fontSize: 12,
      separateConvergingEndpoints: false,
      endpointSeparationStep: 6,
      endpointSeparationMax: 12
    });
    const getGeom = (layout, id) => {
      const pair = layout.sorted.find(item => item.id === id);
      return pair ? layout.geometryByPair.get(pair) : null;
    };
    const aLeft = getGeom(withSeparation, '0-1');
    const aTop = getGeom(withSeparation, '0-2');
    const bRight = getGeom(withSeparation, '1-2');
    expect(aLeft).toBeTruthy();
    expect(aTop).toBeTruthy();
    expect(bRight).toBeTruthy();
    // Same-side boundaries (dataset 0 and dataset 2) should align.
    expect(aLeft.x1).toBeCloseTo(aTop.x1, 6);
    expect(bRight.x2).toBeCloseTo(aTop.x2, 6);
    // Converging opposite-side boundaries at dataset 1 should remain separated.
    expect(bRight.x1 - aLeft.x2).toBeGreaterThan(0);
    const woLeft = getGeom(withoutSeparation, '0-1');
    const woTop = getGeom(withoutSeparation, '0-2');
    const woRight = getGeom(withoutSeparation, '1-2');
    expect(woLeft).toBeTruthy();
    expect(woTop).toBeTruthy();
    expect(woRight).toBeTruthy();
    // Vertical bar levels/stacking must remain unchanged by endpoint separation.
    expect(aLeft.annotationCoord).toBeCloseTo(woLeft.annotationCoord, 6);
    expect(aTop.annotationCoord).toBeCloseTo(woTop.annotationCoord, 6);
    expect(bRight.annotationCoord).toBeCloseTo(woRight.annotationCoord, 6);
  });

  test('adaptive whisker obstacle gap stays pixel-stable after resize for bars and labels', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveSvgAxisUnitsPerPixel).toBe('function');
    expect(typeof hooks.resolveAdaptiveWhiskerGapUnits).toBe('function');
    expect(typeof hooks.clampAdaptiveWhiskerToExistingObstacles).toBe('function');
    const svgNS = 'http://www.w3.org/2000/svg';
    const buildLayer = ({ viewBox, width, height, xStart, xEnd, innerY, labelTop, labelBottom }) => {
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', viewBox);
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.getBoundingClientRect = () => ({ width, height, top: 0, left: 0, right: width, bottom: height });
      const layer = document.createElementNS(svgNS, 'g');
      svg.appendChild(layer);
      const bar = document.createElementNS(svgNS, 'path');
      bar.setAttribute('class', 'box-significance-annotation');
      bar.setAttribute('data-sig-orientation', 'vertical');
      bar.setAttribute('data-sig-inner', String(innerY));
      bar.setAttribute('data-sig-x1', String(xStart));
      bar.setAttribute('data-sig-x2', String(xEnd));
      layer.appendChild(bar);
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('class', 'box-significance-annotation');
      label.setAttribute('y', String(labelBottom));
      label.setAttribute('data-sig-label-top', String(labelTop));
      label.getBBox = () => ({
        x: xStart,
        y: labelTop,
        width: Math.max(1, xEnd - xStart),
        height: Math.max(1, labelBottom - labelTop)
      });
      layer.appendChild(label);
      return { svg, layer };
    };

    const gapPx = 6;
    const small = buildLayer({
      viewBox: '0 0 200 200',
      width: 200,
      height: 200,
      xStart: 45,
      xEnd: 55,
      innerY: 130,
      labelTop: 112,
      labelBottom: 120
    });
    const smallUnitsPerPx = hooks.resolveSvgAxisUnitsPerPixel(small.svg, 'y');
    const smallGap = hooks.resolveAdaptiveWhiskerGapUnits(small.svg, 'vertical', null, gapPx, gapPx);
    const smallOuter = hooks.clampAdaptiveWhiskerToExistingObstacles(
      small.layer,
      50,
      80,
      170,
      { gap: smallGap, labelGap: smallGap }
    );
    const smallPixelGapToLabel = (112 - smallOuter) / smallUnitsPerPx;
    expect(smallPixelGapToLabel).toBeCloseTo(gapPx, 4);

    const large = buildLayer({
      viewBox: '0 0 400 400',
      width: 200,
      height: 200,
      xStart: 90,
      xEnd: 110,
      innerY: 260,
      labelTop: 224,
      labelBottom: 240
    });
    const largeUnitsPerPx = hooks.resolveSvgAxisUnitsPerPixel(large.svg, 'y');
    const largeGap = hooks.resolveAdaptiveWhiskerGapUnits(large.svg, 'vertical', null, gapPx, gapPx);
    const largeOuter = hooks.clampAdaptiveWhiskerToExistingObstacles(
      large.layer,
      100,
      160,
      340,
      { gap: largeGap, labelGap: largeGap }
    );
    const largePixelGapToLabel = (224 - largeOuter) / largeUnitsPerPx;
    expect(largePixelGapToLabel).toBeCloseTo(gapPx, 4);
  });

  test('converging whiskers use a shared obstacle window and clamp to identical length', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.clampAdaptiveWhiskerToExistingObstacles).toBe('function');
    const svgNS = 'http://www.w3.org/2000/svg';
    const layer = document.createElementNS(svgNS, 'g');
    const leftObstacle = document.createElementNS(svgNS, 'path');
    leftObstacle.setAttribute('class', 'box-significance-annotation');
    leftObstacle.setAttribute('data-sig-orientation', 'vertical');
    leftObstacle.setAttribute('data-sig-inner', '118');
    leftObstacle.setAttribute('data-sig-x1', '44');
    leftObstacle.setAttribute('data-sig-x2', '47');
    layer.appendChild(leftObstacle);
    const rightObstacle = document.createElementNS(svgNS, 'path');
    rightObstacle.setAttribute('class', 'box-significance-annotation');
    rightObstacle.setAttribute('data-sig-orientation', 'vertical');
    rightObstacle.setAttribute('data-sig-inner', '114');
    rightObstacle.setAttribute('data-sig-x1', '53');
    rightObstacle.setAttribute('data-sig-x2', '56');
    layer.appendChild(rightObstacle);

    const legacyLeft = hooks.clampAdaptiveWhiskerToExistingObstacles(layer, 46, 80, 170, { gap: 4, labelGap: 4 });
    const legacyRight = hooks.clampAdaptiveWhiskerToExistingObstacles(layer, 54, 80, 170, { gap: 4, labelGap: 4 });
    expect(legacyLeft).not.toBeCloseTo(legacyRight, 6);

    const sharedLeft = hooks.clampAdaptiveWhiskerToExistingObstacles(layer, 50, 80, 170, {
      gap: 4,
      labelGap: 4,
      xRangeHalfWidth: 6
    });
    const sharedRight = hooks.clampAdaptiveWhiskerToExistingObstacles(layer, 50, 80, 170, {
      gap: 4,
      labelGap: 4,
      xRangeHalfWidth: 6
    });
    expect(sharedLeft).toBeCloseTo(sharedRight, 6);
    expect(sharedLeft).toBeCloseTo(110, 6);
  });
});
