const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome, clickExpectedExampleButton } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

const AXES_2D = ['xTitle', 'yTitle'];
const AXES_3D = ['xTitle', 'yTitle', 'zTitle'];

const TITLE_MODE_MATRIX = {
  venn: [
    { id: 'venn', selects: { vennPlotType: 'venn' }, axes: [] },
    { id: 'upset', selects: { vennPlotType: 'upset' }, axes: ['xTitle', 'yTitle'] }
  ],
  box: ['box', 'notched', 'bar', 'strip', 'violin'].map(value => ({
    id: value,
    selects: { boxGraphType: value },
    axes: ['yTitle']
  })),
  scatter: [
    { id: 'scatter-2d', selects: { scatterGraphType: 'scatter', scatterViewMode: '2d' }, axes: AXES_2D },
    { id: 'scatter-bubble', selects: { scatterGraphType: 'scatter', scatterViewMode: 'bubble' }, axes: AXES_2D, reloadExample: true },
    { id: 'scatter-3d', selects: { scatterGraphType: 'scatter', scatterViewMode: '3d' }, axes: AXES_3D, reloadExample: true },
    { id: 'volcano', selects: { scatterGraphType: 'volcano' }, axes: AXES_2D, reloadExample: true },
    { id: 'ma', selects: { scatterGraphType: 'ma' }, axes: AXES_2D, reloadExample: true }
  ],
  pca: [
    { id: 'pca-2d', selects: { pcaMethod: 'pca', pcaViewMode: '2d' }, axes: AXES_2D },
    { id: 'mds-2d', selects: { pcaMethod: 'mds', pcaViewMode: '2d' }, axes: AXES_2D },
    { id: 'tsne-2d', selects: { pcaMethod: 'tsne', pcaViewMode: '2d' }, axes: AXES_2D },
    { id: 'umap-2d', selects: { pcaMethod: 'umap', pcaViewMode: '2d' }, axes: AXES_2D },
    {
      id: 'pca-3d',
      selects: { pcaViewMode: '3d' },
      svgSelector: '#pcaPlot #pcaSvg',
      rotateBeforeAxisEdit: true,
      axisKeys: ['y', 'x', 'z']
    },
    {
      id: 'mds-3d',
      selects: { pcaMethod: 'mds', pcaViewMode: '3d' },
      svgSelector: '#pcaPlot #pcaSvg',
      rotateBeforeAxisEdit: true,
      axisKeys: ['y', 'x', 'z']
    }
  ],
  line: [
    {
      id: 'line-2d',
      selects: { lineTableFormat: 'single', lineViewMode: '2d', lineDisplayMode: 'line' },
      axes: AXES_2D,
      reloadExample: true
    },
    { id: 'area-2d', selects: { lineTableFormat: 'single', lineViewMode: '2d', lineDisplayMode: 'area' }, axes: AXES_2D },
    { id: 'line-3d', selects: { lineTableFormat: '3d', lineViewMode: '3d' }, axes: AXES_3D, reloadExample: true }
  ],
  heatmap: [
    { id: 'values', selects: { heatmapView: 'values' }, axes: [] },
    { id: 'correlation-columns', selects: { heatmapView: 'corr-columns' }, axes: [] },
    { id: 'correlation-rows', selects: { heatmapView: 'corr-rows' }, axes: [] }
  ],
  surface: [
    { id: 'grid-surface', selects: { surfaceInterpolation: 'grid' }, axes: AXES_3D },
    { id: 'points-only', selects: { surfaceInterpolation: 'scatter' }, axes: AXES_3D }
  ],
  roc: [
    { id: 'roc', selects: { rocGraphType: 'roc' }, axes: AXES_2D },
    { id: 'precision-recall', selects: { rocGraphType: 'pr' }, axes: AXES_2D }
  ],
  survival: [
    { id: 'kaplan-meier-cox-enabled', checks: { survivalFitCox: true, survivalShowHazardRatios: true }, axes: AXES_2D },
    { id: 'kaplan-meier-cox-disabled', checks: { survivalFitCox: false, survivalShowHazardRatios: false }, axes: AXES_2D }
  ],
  hist: [
    { id: 'histogram-overlay', selects: { histPlotMode: 'histogram', histSeriesDisplay: 'overlay', histFrequencyCreateMode: 'frequency' }, axes: AXES_2D },
    { id: 'histogram-cumulative-panels', selects: { histPlotMode: 'histogram', histSeriesDisplay: 'panels', histPanelArrangement: 'grid', histFrequencyCreateMode: 'cumulative' }, axes: AXES_2D },
    { id: 'density-overlay', selects: { histPlotMode: 'density', histSeriesDisplay: 'overlay' }, axes: AXES_2D },
    { id: 'density-panels', selects: { histPlotMode: 'density', histSeriesDisplay: 'panels', histPanelArrangement: 'vertical' }, axes: AXES_2D }
  ],
  pie: [
    { id: 'pie', selects: { pieChartType: 'pie' }, axes: [] },
    { id: 'donut', selects: { pieChartType: 'donut' }, axes: [] },
    { id: 'stacked-bar', selects: { pieChartType: 'stacked' }, axes: ['yTitle'] }
  ]
};

test.setTimeout(300_000);

async function waitForReady(page, type){
  await waitForComponentOwnerReady(page, type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 75_000
  });
}

function graphTitle(page, pageId, svgSelector = '.svgbox svg'){
  return page.locator(`#${pageId}:not([hidden]) ${svgSelector} text[data-font-role="graphTitle"]`).first();
}

function axisTitle(page, pageId, role, svgSelector = '.svgbox svg'){
  return page.locator(`#${pageId}:not([hidden]) ${svgSelector} text[data-font-role="${role}"]`).first();
}

async function editAsTwoLines(page, target, componentType, modeId, label, updatedTarget = target, options = {}){
  await expect(target, `${componentType}/${modeId}: title target`).toBeVisible();
  await expect(target).toHaveAttribute('data-inline-editable', '1');
  const extraLines = Array.isArray(options.extraLines) && options.extraLines.length
    ? options.extraLines.map(String)
    : ['line'];
  const initialPlotTop = ['pie', 'heatmap'].includes(componentType)
    ? await target.evaluate((node, component) => {
      const svg = node.ownerSVGElement;
      if(component === 'pie'){
        const traces = Array.from(svg?.querySelectorAll('[data-pie-trace="1"]') || []);
        const tops = traces.map(trace => Number(trace.getBBox?.().y)).filter(Number.isFinite);
        return tops.length ? Math.min(...tops) : null;
      }
      const cellLayer = svg?.querySelector('[data-export-layer="heatmap-cells"]');
      const firstCell = cellLayer?.querySelector('rect, foreignObject, canvas');
      const y = Number(firstCell?.getAttribute?.('y'));
      return Number.isFinite(y) ? y : null;
    }, componentType)
    : null;
  const initialCartesianPlotY = componentType === 'pie'
    ? await target.evaluate(node => Number(node.ownerSVGElement?.dataset?.cartesianPlotY))
    : null;
  const initialHeatmapSceneHeight = componentType === 'heatmap'
    ? await target.evaluate(node => Number(node.ownerSVGElement?.dataset?.heatmapSceneHeight))
    : null;
  await target.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  const firstLine = `${label} ${modeId}`;
  await editor.fill(firstLine);
  for(const line of extraLines){
    await editor.press('End');
    await editor.press('Enter');
    await editor.type(line);
  }
  const expectedText = [firstLine, ...extraLines].join('\n');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue(expectedText);
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await waitForReady(page, componentType);

  const renderedText = await updatedTarget.evaluate(node => node?.dataset?.titleBlockText || '');
  expect(renderedText, `${componentType}/${modeId}: rendered title text`).toBe(expectedText);
  const geometry = await updatedTarget.evaluate((node, component) => {
    const svg = node.ownerSVGElement;
    const lines = Array.from(node.querySelectorAll('tspan[data-title-line="1"]'));
    const viewBox = String(svg?.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const box = node.getBBox();
    const matrix = node.getScreenCTM();
    const rootScreenInverse = svg?.getScreenCTM?.()?.inverse?.() || null;
    const corners = [
      [box.x, box.y], [box.x + box.width, box.y],
      [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]
    ].map(([x, y]) => {
      const point = svg.createSVGPoint();
      point.x = x;
      point.y = y;
      const screenPoint = point.matrixTransform(matrix);
      return rootScreenInverse ? screenPoint.matrixTransform(rootScreenInverse) : screenPoint;
    });
    return {
      lineHeight: Number(node.dataset.titleLineHeight),
      baselines: lines.map(line => Number(line.getAttribute('y'))),
      baselineRootY: lines.map(line => {
        const point = svg.createSVGPoint();
        point.x = Number(node.getAttribute('x')) || 0;
        point.y = Number(line.getAttribute('y')) || 0;
        return point.matrixTransform(node.getScreenCTM())
          .matrixTransform(rootScreenInverse).y;
      }),
      viewBox,
      reserve: {
        left: Number(svg?.dataset.graphContentReserveLeft) || 0,
        right: Number(svg?.dataset.graphContentReserveRight) || 0,
        top: Number(svg?.dataset.graphContentReserveTop) || 0,
        bottom: Number(svg?.dataset.graphContentReserveBottom) || 0,
        baseWidth: Number(svg?.dataset.graphContentBaseWidth),
        baseHeight: Number(svg?.dataset.graphContentBaseHeight),
        cartesianMaxX: Number(svg?.dataset.cartesianEnvelopeMaxX),
        cartesianMaxY: Number(svg?.dataset.cartesianEnvelopeMaxY)
      },
      bounds: {
        left: Math.min(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)),
        right: Math.max(...corners.map(point => point.x)),
        bottom: Math.max(...corners.map(point => point.y))
      },
      screenBounds: (() => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      })(),
      plotTop: (() => {
        if(component === 'pie'){
          const traces = Array.from(svg?.querySelectorAll('[data-pie-trace="1"]') || []);
          const tops = traces.map(trace => Number(trace.getBBox?.().y)).filter(Number.isFinite);
          return tops.length ? Math.min(...tops) : null;
        }
        if(component === 'heatmap'){
          const cellLayer = svg?.querySelector('[data-export-layer="heatmap-cells"]');
          const firstCell = cellLayer?.querySelector('rect, foreignObject, canvas');
          const y = Number(firstCell?.getAttribute?.('y'));
          return Number.isFinite(y) ? y : null;
        }
        return null;
      })(),
      heatmapSceneHeight: Number(svg?.dataset?.heatmapSceneHeight),
      titleTransformScaleY: (() => {
        try{
          return Number(node.transform?.baseVal?.consolidate?.()?.matrix?.d) || 1;
        }catch(_err){ return 1; }
      })(),
      cartesianPlotY: Number(svg?.dataset?.cartesianPlotY),
      cartesianReserveBottom: Number(svg?.dataset?.cartesianReserveBottom),
      heatmapCells: (() => {
        if(component !== 'heatmap') return null;
        const layer = svg?.querySelector('[data-export-layer="heatmap-cells"]');
        const box = layer?.getBBox?.();
        const renderMode = layer?.getAttribute('data-render-mode') || '';
        const visualChild = renderMode === 'canvas'
          ? layer?.querySelector('canvas, image[data-graphitix-render-cache-canvas-bitmap="true"]')
          : layer?.querySelector('rect, path[data-heatmap-vector-cell-bucket], [data-heatmap-cell-value]');
        return {
          rowCount: Number(layer?.getAttribute('data-heatmap-row-count')) || 0,
          columnCount: Number(layer?.getAttribute('data-heatmap-column-count')) || 0,
          renderMode,
          hasVisualChild: !!visualChild,
          bounds: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
          screenBounds: (() => {
            const rect = layer?.getBoundingClientRect?.();
            return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
          })(),
          svgScreenBounds: (() => {
            const rect = svg?.getBoundingClientRect?.();
            return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
          })()
        };
      })()
    };
  }, componentType);
  expect(geometry.baselines, `${componentType}/${modeId}: explicit SVG line wrappers`).toHaveLength(extraLines.length + 1);
  expect(geometry.baselines[1] - geometry.baselines[0])
    .toBeCloseTo(geometry.lineHeight, 2);
  if(componentType === 'heatmap'){
    const root = await updatedTarget.evaluate(node => {
      const svgRect = node.ownerSVGElement.getBoundingClientRect();
      const titleRect = node.getBoundingClientRect();
      return {
        svg: { left: svgRect.left, top: svgRect.top, right: svgRect.right, bottom: svgRect.bottom },
        title: { left: titleRect.left, top: titleRect.top, right: titleRect.right, bottom: titleRect.bottom }
      };
    });
    expect(root.title.left, `${componentType}/${modeId}: visible title bounds ${JSON.stringify(root)}`).toBeGreaterThanOrEqual(root.svg.left - 0.5);
    expect(root.title.top, `${componentType}/${modeId}: visible title bounds ${JSON.stringify(root)}`).toBeGreaterThanOrEqual(root.svg.top - 0.5);
    expect(root.title.right, `${componentType}/${modeId}: visible title bounds ${JSON.stringify(root)}`).toBeLessThanOrEqual(root.svg.right + 0.5);
    expect(root.title.bottom, `${componentType}/${modeId}: visible title bounds ${JSON.stringify(root)}`).toBeLessThanOrEqual(root.svg.bottom + 0.5);
  }else{
    expect(geometry.bounds.left, `${componentType}/${modeId}: title left edge ${JSON.stringify(geometry)}`)
      .toBeGreaterThanOrEqual(geometry.viewBox[0] - 0.05);
    expect(geometry.bounds.top, `${componentType}/${modeId}: title top edge ${JSON.stringify(geometry)}`)
      .toBeGreaterThanOrEqual(geometry.viewBox[1] - 0.05);
    expect(geometry.bounds.right, `${componentType}/${modeId}: right title bounds ${JSON.stringify(geometry)}`)
      .toBeLessThanOrEqual(geometry.viewBox[0] + geometry.viewBox[2] + 0.05);
    expect(geometry.bounds.bottom, `${componentType}/${modeId}: bottom title bounds ${JSON.stringify(geometry)}`)
      .toBeLessThanOrEqual(geometry.viewBox[1] + geometry.viewBox[3] + 0.05);
  }
  if(componentType === 'heatmap' && modeId.startsWith('correlation-')){
    const clearance = await updatedTarget.evaluate(node => {
      const svg = node.ownerSVGElement;
      const titleRect = node.getBoundingClientRect();
      const labels = Array.from(svg?.querySelectorAll('text[data-font-role="columnLabel"]') || []);
      const columnTops = labels.map(label => label.getBoundingClientRect().top)
        .filter(Number.isFinite);
      const svgRect = svg?.getBoundingClientRect();
      const viewBox = String(svg?.getAttribute('viewBox') || '').trim();
      const clearanceGroup = svg?.querySelector('[data-heatmap-title-clearance-shift]') || null;
      return {
        titleBottom: titleRect.bottom,
        titleTop: titleRect.top,
        nearestColumnTop: Math.min(...columnTops),
        columnCount: columnTops.length,
        titleY: Number(node.getAttribute('y')),
        viewBox,
        svgHeight: svg?.getAttribute('height'),
        svgRect: svgRect ? { top: svgRect.top, bottom: svgRect.bottom, width: svgRect.width, height: svgRect.height } : null,
        clearanceShift: Number(clearanceGroup?.dataset?.heatmapTitleClearanceShift) || 0
      };
    });
    expect(clearance.columnCount, `${componentType}/${modeId}: rendered correlation column labels`)
      .toBeGreaterThan(0);
    expect(clearance.nearestColumnTop, `${componentType}/${modeId}: graph title must clear rotated column labels ${JSON.stringify(clearance)}`)
      .toBeGreaterThanOrEqual(clearance.titleBottom + 0.1);
  }
  if(componentType === 'pie'){
    const expectedShift = geometry.lineHeight * extraLines.length * geometry.titleTransformScaleY;
    expect(initialPlotTop, `${componentType}/${modeId}: initial plot geometry`).not.toBeNull();
    expect(geometry.plotTop, `${componentType}/${modeId}: final plot geometry`).not.toBeNull();
    expect(geometry.plotTop - initialPlotTop)
      .toBeCloseTo(expectedShift, 0, `${componentType}/${modeId}: plot shift ${JSON.stringify({ initialPlotTop, initialCartesianPlotY, geometry })}`);
    expect(geometry.reserve.bottom, `${componentType}/${modeId}: title reserve ${JSON.stringify(geometry)}`)
      .toBeGreaterThanOrEqual(expectedShift - 1);
  }
  if(componentType === 'heatmap'){
    expect(geometry.heatmapCells, `${componentType}/${modeId}: rendered matrix layer`).toMatchObject({
      rowCount: expect.any(Number),
      columnCount: expect.any(Number),
      hasVisualChild: true
    });
    expect(geometry.heatmapCells.rowCount).toBeGreaterThan(0);
    expect(geometry.heatmapCells.columnCount).toBeGreaterThan(0);
    expect(geometry.heatmapCells.bounds?.width, `${componentType}/${modeId}: visible matrix width`).toBeGreaterThan(0);
    expect(geometry.heatmapCells.bounds?.height, `${componentType}/${modeId}: visible matrix height`).toBeGreaterThan(0);
    expect(geometry.heatmapCells.screenBounds?.right).toBeGreaterThan(geometry.heatmapCells.svgScreenBounds?.left);
    expect(geometry.heatmapCells.screenBounds?.left).toBeLessThan(geometry.heatmapCells.svgScreenBounds?.right);
    expect(geometry.heatmapCells.screenBounds?.bottom).toBeGreaterThan(geometry.heatmapCells.svgScreenBounds?.top);
    expect(geometry.heatmapCells.screenBounds?.top).toBeLessThan(geometry.heatmapCells.svgScreenBounds?.bottom);
    const renderedSceneLineHeight = geometry.baselineRootY[1] - geometry.baselineRootY[0];
    const expectedShift = renderedSceneLineHeight * extraLines.length;
    expect(initialPlotTop, `${componentType}/${modeId}: initial matrix geometry`).not.toBeNull();
    expect(geometry.plotTop - initialPlotTop)
      .toBeCloseTo(expectedShift, 0);
    expect(geometry.reserve.bottom, `${componentType}/${modeId}: graph-content bottom reserve`)
      .toBeCloseTo(expectedShift, 0);
    expect(geometry.heatmapSceneHeight - initialHeatmapSceneHeight)
      .toBeCloseTo(expectedShift, 0, `${componentType}/${modeId}: SVG scene reserve must equal added rendered line height ${JSON.stringify({ initialHeatmapSceneHeight, expectedShift, geometry })}`);
  }
}

async function applyMode(page, component, mode){
  for(const [id, value] of Object.entries(mode.selects || {})){
    await page.locator(`#${id}`).selectOption(value);
  }
  for(const [id, checked] of Object.entries(mode.checks || {})){
    const control = page.locator(`#${id}`);
    if(checked) await control.check();
    else await control.uncheck();
  }
  if(mode.reloadExample){
    await clickExpectedExampleButton(page, component.exampleButtonId);
  }
  await waitForReady(page, component.type);
  await expect(graphTitle(page, component.pageId, mode.svgSelector), `${component.type}/${mode.id}: graph title`).toBeAttached();
}

async function rotate3dGraph(page, component, mode){
  const svg = page.locator(`#${component.pageId}:not([hidden]) ${mode.svgSelector}`);
  const box = await svg.boundingBox();
  expect(box, `${component.type}/${mode.id}: 3D plot bounds`).toBeTruthy();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY + 35, { steps: 8 });
  await page.mouse.up();
  await waitForReady(page, component.type);
}

async function runModeGroup(page, component, modes){
  expect(modes, `${component.type}: explicit title mode coverage`).toBeTruthy();
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, {
    first: true,
    loadExample: component.type !== 'line'
  });
  await waitForReady(page, component.type);

  for(const mode of modes){
      await test.step(`${component.type}/${mode.id}`, async () => {
        await applyMode(page, component, mode);
        const graph = graphTitle(page, component.pageId, mode.svgSelector);
        const titleOptions = ['pie', 'heatmap'].includes(component.type)
          ? { extraLines: ['line one', 'line two', 'line three'] }
          : undefined;
        await editAsTwoLines(page, graph, component.type, mode.id, 'Graph', graph, titleOptions);
        if(mode.rotateBeforeAxisEdit){
          await rotate3dGraph(page, component, mode);
        }
        const axisTargets = mode.axisKeys
          ? mode.axisKeys.map(key => ({ key }))
          : (mode.axes || []).map(role => ({ role }));
        for(const axis of axisTargets){
          const svgSelector = mode.svgSelector || '.svgbox svg';
          const selector = axis.key
            ? `#${component.pageId}:not([hidden]) ${svgSelector} [data-axis-label][data-axis-key="${axis.key}"]`
            : `#${component.pageId}:not([hidden]) ${svgSelector} text[data-font-role="${axis.role}"]`;
          const target = axis.key
            ? page.locator(selector)
            : axisTitle(page, component.pageId, axis.role, mode.svgSelector);
          await editAsTwoLines(
            page,
            target,
            component.type,
            `${mode.id}-${axis.role || `axis-${axis.key}`}`,
            'Axis',
            target
          );
        }
      });
  }
}

for(const component of COMPONENT_MATRIX){
  const modes = TITLE_MODE_MATRIX[component.type];
  const groups = ['scatter', 'pca', 'heatmap', 'hist', 'pie'].includes(component.type)
    ? modes.map(mode => [mode])
    : [modes];
  for(const group of groups){
    const label = group.length === 1
      ? `${component.type}/${group[0].id} graph and axis titles edit as multiline`
      : `${component.type} graph and axis titles edit as multiline in every supported graph mode`;
    test(label, async ({ page }) => runModeGroup(page, component, group));
  }
}
