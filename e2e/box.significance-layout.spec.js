const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readVerticalBoxLayoutMetrics() {
  const workspaceState = window.Main?.session?.workspaceState || null;
  const active = workspaceState?.tabs?.find(tab => tab?.id === workspaceState.activeTabId) || null;
  const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id, 'box') || document;
  const svg = root.querySelector('#boxPlot svg');
  if (!svg) {
    return null;
  }
  const axisLayer = svg.querySelector('g[data-layer="box-axis"]') || svg;
  const toNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const lines = Array.from(axisLayer.querySelectorAll('line'))
    .map(line => {
      const x1 = toNumber(line.getAttribute('x1'));
      const y1 = toNumber(line.getAttribute('y1'));
      const x2 = toNumber(line.getAttribute('x2'));
      const y2 = toNumber(line.getAttribute('y2'));
      const rect = line.getBoundingClientRect();
      if (x1 == null || y1 == null || x2 == null || y2 == null) {
        return null;
      }
      return {
        node: line,
        x1,
        y1,
        x2,
        y2,
        dx: Math.abs(x2 - x1),
        dy: Math.abs(y2 - y1),
        rectTop: Number.isFinite(rect?.top) ? rect.top : null,
        rectBottom: Number.isFinite(rect?.bottom) ? rect.bottom : null,
        rectHeight: Number.isFinite(rect?.height) ? rect.height : null
      };
    })
    .filter(Boolean);
  const vertical = lines.filter(line => line.dx <= 0.25 && line.dy > 1);
  const horizontal = lines.filter(line => line.dy <= 0.25 && line.dx > 1);
  const xAxis = lines.find(line => line.node.getAttribute('data-box-primary-axis') === 'x') || horizontal
    .slice()
    .sort((a, b) => {
      const ay = Number.isFinite(a.rectBottom) ? a.rectBottom : a.y1;
      const by = Number.isFinite(b.rectBottom) ? b.rectBottom : b.y1;
      return by - ay || b.dx - a.dx;
    })[0] || null;
  const minVerticalX = vertical.length
    ? Math.min(...vertical.map(line => Math.min(line.x1, line.x2)))
    : null;
  const yAxisLeftCandidates = Number.isFinite(minVerticalX)
    ? vertical.filter(line => Math.min(Math.abs(line.x1 - minVerticalX), Math.abs(line.x2 - minVerticalX)) <= 1.5)
    : [];
  const yAxis = lines.find(line => line.node.getAttribute('data-box-primary-axis') === 'y') || (yAxisLeftCandidates.length ? yAxisLeftCandidates : vertical)
    .slice()
    .sort((a, b) => b.dy - a.dy || a.x1 - b.x1)[0] || null;
  const lineCenterY = line => {
    if (line && Number.isFinite(line.y1) && Number.isFinite(line.y2)) {
      return (line.y1 + line.y2) / 2;
    }
    const top = Number(line?.rectTop);
    const bottom = Number(line?.rectBottom);
    if (Number.isFinite(top) && Number.isFinite(bottom)) {
      return (top + bottom) / 2;
    }
    return null;
  };
  const lineSpanY = line => {
    return line ? Math.abs(line.y2 - line.y1) : null;
  };
  const dataBodies = Array.from(svg.querySelectorAll('[data-box-shape="body"]'));
  const dataBottomY = dataBodies.length
    ? dataBodies.reduce((maxY, node) => {
        const rect = node.getBBox();
        const bottom = Number(rect?.y) + Number(rect?.height);
        return Number.isFinite(bottom) ? Math.max(maxY, bottom) : maxY;
      }, -Infinity)
    : null;
  const plotRoot = root.querySelector('#boxPlot');
  const zoomViewport = root.querySelector('#boxGraphPanel .resizer-zoom-viewport');
  const controlTray = root.querySelector('#boxGraphPanel .resizer-control-tray');
  const bottomTray = root.querySelector('#boxGraphPanel .resizer-bottom-tray');
  const exportControls = root.querySelector('#boxExportControls');
  const svgBox = root.querySelector('#boxGraphPanel .svgbox');
  const graphTitle = svg.querySelector('text[data-font-role="graphTitle"]');
  const significanceNodes = Array.from(svg.querySelectorAll('.box-significance-annotation:not([data-significance-hit-overlay="1"])'));
  const boxState = window.Components?.box?.__getState?.() || null;
  const svgBoxRect = svgBox ? svgBox.getBoundingClientRect() : null;
  const cartesianTopExtensionPx = Number(svgBox?.__cartesianLayoutPlan?.contentEnvelope?.extensionTop) || 0;
  const zoomScale = Math.max(0.01, Number(svgBox?.dataset?.resizerZoomLevel || svgBox?.dataset?.resizerZoom) || 1);
  const graphEnvelopeTopPx = Number.isFinite(Number(svgBoxRect?.top))
    ? Number(svgBoxRect.top) - cartesianTopExtensionPx * zoomScale
    : null;
  const aspectRatioMeta = svgBox && svgBox.dataset
    ? Number(svgBox.dataset.resizerAspectRatio)
    : NaN;
  const aspectLockMeta = svgBox && svgBox.dataset
    ? svgBox.dataset.resizerAspectLocked === 'true'
    : null;
  const svgRect = svg.getBoundingClientRect();
  const controlTrayRect = controlTray ? controlTray.getBoundingClientRect() : null;
  const graphTitleRect = graphTitle ? graphTitle.getBoundingClientRect() : null;
  const significanceTopPx = significanceNodes.length
    ? significanceNodes.reduce((top, node) => {
        const rect = node.getBoundingClientRect();
        return Number.isFinite(Number(rect?.top)) ? Math.min(top, Number(rect.top)) : top;
      }, Infinity)
    : null;
  const bottomTrayRect = bottomTray ? bottomTray.getBoundingClientRect() : null;
  const exportControlsRect = exportControls ? exportControls.getBoundingClientRect() : null;
  const controlTopCandidates = [
    Number(bottomTrayRect?.top),
    Number(exportControlsRect?.top)
  ].filter(value => Number.isFinite(value));
  const controlsTopPx = controlTopCandidates.length ? Math.min(...controlTopCandidates) : null;
  const controlsOverlapPx = Number.isFinite(controlsTopPx)
    ? Math.max(0, Number(svgRect.bottom) - controlsTopPx)
    : null;
  const plotOverflow = plotRoot ? window.getComputedStyle(plotRoot).overflow : null;
  const zoomViewportOverflow = zoomViewport ? window.getComputedStyle(zoomViewport).overflow : null;
  return {
    xAxisSpan: xAxis ? Math.abs(xAxis.x2 - xAxis.x1) : null,
    yAxisSpan: yAxis ? lineSpanY(yAxis) : null,
    yAxisTopPx: yAxis ? Math.min(
      Number.isFinite(Number(yAxis.rectTop)) ? Number(yAxis.rectTop) : yAxis.y1,
      Number.isFinite(Number(yAxis.rectBottom)) ? Number(yAxis.rectBottom) : yAxis.y2
    ) : null,
    yAxisBottomPx: yAxis ? Math.max(
      Number.isFinite(Number(yAxis.rectTop)) ? Number(yAxis.rectTop) : yAxis.y1,
      Number.isFinite(Number(yAxis.rectBottom)) ? Number(yAxis.rectBottom) : yAxis.y2
    ) : null,
    xAxisY: xAxis ? lineCenterY(xAxis) : null,
    dataBottomY: Number.isFinite(dataBottomY) ? dataBottomY : null,
    significancePathCount: svg.querySelectorAll('path.box-significance-annotation[data-sig-orientation="vertical"]').length,
    graphEnvelopeTopPx,
    controlTrayTopPx: Number.isFinite(Number(controlTrayRect?.top)) ? Number(controlTrayRect.top) : null,
    graphTitleTopPx: Number.isFinite(Number(graphTitleRect?.top)) ? Number(graphTitleRect.top) : null,
    graphTitleBottomPx: Number.isFinite(Number(graphTitleRect?.bottom)) ? Number(graphTitleRect.bottom) : null,
    significanceTopPx: Number.isFinite(Number(significanceTopPx)) ? Number(significanceTopPx) : null,
    svgBottomPx: Number.isFinite(Number(svgRect.bottom)) ? Number(svgRect.bottom) : null,
    controlsTopPx,
    controlsOverlapPx,
    plotOverflow,
    zoomViewportOverflow,
    svgBoxWidthPx: Number.isFinite(Number(svgBoxRect?.width)) ? Number(svgBoxRect.width) : null,
    svgBoxHeightPx: Number.isFinite(Number(svgBoxRect?.height)) ? Number(svgBoxRect.height) : null,
    aspectRatioMeta: Number.isFinite(aspectRatioMeta) ? aspectRatioMeta : null,
    aspectLockMeta,
    showSignificanceBars: !!boxState?.showSignificanceBars,
    significanceViewportExtensionPx: Number.isFinite(Number(boxState?.graphGeometry?.reserves?.significancePx))
      ? Number(boxState.graphGeometry?.reserves?.significancePx)
      : null,
    bottomViewportExtensionPx: Number.isFinite(Number(boxState?.graphGeometry?.reserves?.xLabelPx))
      ? Number(boxState.graphGeometry?.reserves?.xLabelPx)
      : null,
    significanceBasePlotHeightPx: Number.isFinite(Number(boxState?.significanceBasePlotHeightPx))
      ? Number(boxState.significanceBasePlotHeightPx)
      : null,
    cartesianTopExtensionPx
  };
}

async function dragBoxVerticalHandle(page, deltaY) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-horizontal');
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Unable to resolve horizontal resizer handle box');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
}

async function dragBoxWidthHandle(page, deltaX) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-vertical');
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Unable to resolve vertical resizer handle box');
  }
  const startX = box.x + Math.max(2, Math.min(box.width - 2, box.width / 2));
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 16 });
  await page.mouse.up();
}

async function ensureBoxStatsAndSignificanceReady(page) {
  const computeButton = page.locator('#boxComputeStats');
  await expect(computeButton).toBeVisible({ timeout: 20_000 });
  const alreadyReady = await page.evaluate(() => {
    const state = window.Components?.box?.__getState?.() || null;
    return !!(
      state
      && Number(state.statsLastRunVersion) > 0
      && Number(state.statsLastRunVersion) === Number(state.statsContextVersion)
    );
  });
  if (!alreadyReady && await computeButton.isEnabled()) {
    await computeButton.click();
  }
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    if (
      state
      && Number(state.statsLastRunVersion) > 0
      && Number(state.statsLastRunVersion) === Number(state.statsContextVersion)
    ) {
      return true;
    }
    const status = document.getElementById('boxStatsStatus')?.textContent || '';
    return status.includes('Statistics up to date.');
  }, { timeout: 45_000 });
  await expect(page.locator('#boxShowSignificance')).toBeVisible();
}

async function loadBoxExampleData(page) {
  await expect(page.locator('#boxLoadExample')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    return !!state?.hot && typeof state.hot.loadData === 'function';
  }, null, { timeout: 20_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.locator('#boxLoadExample').click();
    const loaded = await page.waitForFunction(() => {
      const state = window.Components?.box?.__getState?.() || null;
      const data = state?.hot?.getData?.() || [];
      let numericCount = 0;
      for (const row of data) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          if (Number.isFinite(Number(cell))) {
            numericCount += 1;
          }
        }
      }
      return numericCount >= 12;
    }, null, { timeout: 4_000 }).then(() => true).catch(() => false);
    if (loaded) {
      await page.waitForTimeout(300);
      return;
    }
  }
  throw new Error('Box example data did not load');
}

async function loadTwoGroupBoxData(page) {
  await page.waitForFunction(() => {
    const hot = window.Components?.box?.__getState?.()?.hot;
    return !!hot && typeof hot.loadData === 'function';
  }, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const state = window.Components.box.__getState();
    state.hot.loadData([
      ['Group 1', 'Group 2'],
      [0.00021794, 0.00137663],
      [0.00194322, 0.0004429],
      [0.00141484, 0.00018088],
      [0.00070079, 0.000000052]
    ], {
      source: 'e2e:box-two-group-first-significance-layout',
      recordUndo: false
    });
  });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    const svg = document.querySelector('#boxPlot svg');
    return !!svg && Number(state?.statsContextVersion) > 0;
  }, null, { timeout: 20_000 });
}

async function setBoxSignificanceToggle(page, enabled) {
  const toggle = page.locator('#boxShowSignificance');
  await expect(toggle).toBeVisible();
  const isEnabled = await toggle.isEnabled();
  if (isEnabled) {
    if (enabled) {
      await toggle.check();
    } else {
      await toggle.uncheck();
    }
    await page.waitForTimeout(250);
    return;
  }
  await page.evaluate((value) => {
    const el = document.getElementById('boxShowSignificance');
    if (!el) return;
    el.checked = !!value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, enabled);
}

test('two-group statistics apply significance reserve on the first annotated draw', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await loadTwoGroupBoxData(page);

  const before = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(before).not.toBeNull();
  expect(before.significancePathCount).toBe(0);

  await page.locator('#boxComputeStats').click();
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    return Number(state?.statsLastRunVersion) > 0
      && Number(state.statsLastRunVersion) === Number(state.statsContextVersion)
      && state.showSignificanceBars === true
      && state.significanceMaxLevel === 0
      && Number(state.graphGeometry?.reserves?.significancePx) > 0
      && document.querySelectorAll('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').length > 0;
  }, null, { timeout: 45_000 });
  await expectBoxDrawsToSettle(page, 2);

  const after = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(after).not.toBeNull();
  expect(after.significancePathCount).toBeGreaterThan(0);
  expect(after.significanceViewportExtensionPx).toBeGreaterThan(0);
  expect(Math.abs(after.svgBoxHeightPx - before.svgBoxHeightPx)).toBeLessThanOrEqual(2);
  expect(after.cartesianTopExtensionPx).toBeGreaterThan(0);
  expect(Math.abs(after.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(7);
  expect(issues.critical).toEqual([]);
});

test('significance toolbar places the label selector before scientific formatting', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
  await loadTwoGroupBoxData(page);
  await ensureBoxStatsAndSignificanceReady(page);
  await setBoxSignificanceToggle(page, true);
  await page.waitForFunction(() => document.querySelectorAll('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').length > 0, null, { timeout: 45_000 });
  await page.locator('#boxPlot path.box-significance-hit-overlay').first().dispatchEvent('click');
  await expect(page.locator('.font-toolbar-host--visible .significance-controls-panel')).toBeVisible();

  const toolbarState = await page.evaluate(() => {
    const panel = document.querySelector('.font-toolbar-host--visible .significance-controls-panel');
    return {
      fields: Array.from(panel?.querySelectorAll('.significance-controls-panel__field') || [])
        .map(field => field.querySelector('.significance-controls-panel__field-label')?.textContent),
      mode: document.querySelector('#boxSignificanceLabelMode')?.value || null
    };
  });
  expect(toolbarState.fields).toEqual(['Border', 'Whiskers', 'Whisker Style', 'Label', 'Scientific', 'Decimals']);
  expect(toolbarState.mode).toBe('p');
  expect(issues.critical).toEqual([]);
});

async function setBoxLockRatioToggle(page, enabled) {
  await page.evaluate((value) => {
    const el = document.querySelector('#boxGraphPanel .resizer-aspect-checkbox');
    if (!el) return;
    el.checked = !!value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, enabled);
  await page.waitForTimeout(250);
}

async function readBoxDrawToken(page) {
  return page.evaluate(() => Number(window.Components?.box?.__getState?.()?.drawToken) || 0);
}

async function expectBoxDrawsToSettle(page, maxDelta = 2) {
  const before = await readBoxDrawToken(page);
  await page.waitForTimeout(1_400);
  const after = await readBoxDrawToken(page);
  expect(after - before).toBeLessThanOrEqual(maxDelta);
}

async function getActiveWorkspaceTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function activateWelcomeTab(page) {
  await page.evaluate(() => {
    const welcomeTab = window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.isWelcome);
    if (!welcomeTab?.id || typeof window.Main?.tabs?.activateTab !== 'function') {
      throw new Error('Welcome tab is not available');
    }
    window.Main.tabs.activateTab(welcomeTab.id, { reason: 'e2e-box-pairwise-away' });
  });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
}

async function activateWorkspaceTab(page, tabId) {
  await page.evaluate((id) => {
    if (!id || typeof window.Main?.tabs?.activateTab !== 'function') {
      throw new Error('Workspace tab is not available');
    }
    window.Main.tabs.activateTab(id, { reason: 'e2e-box-pairwise-back' });
  }, tabId);
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
}

async function openAdditionalEmptyComponentTab(page, component) {
  await openComponentFromWelcome(page, component, { first: false });
}

async function waitForVerticalSignificanceAnnotations(page) {
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').length > 0,
    null,
    { timeout: 20_000 }
  );
}

test('flipped adaptive whiskers clear full-width P-value labels', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  const layout = await page.evaluate(() => {
    const hooks = window.Components?.box?.__testHooks;
    const labelMode = document.querySelector('#boxSignificanceLabelMode');
    labelMode.value = 'p';
    labelMode.dispatchEvent(new Event('change', { bubbles: true }));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 800 420');
    svg.setAttribute('width', '800');
    svg.setAttribute('height', '420');
    svg.style.position = 'absolute';
    svg.style.left = '-10000px';
    document.body.appendChild(svg);
    const centers = [70, 130, 190, 250, 310];
    const runtime = hooks.buildBoxPairAnnotationRuntime({
      svg,
      traces: centers.map(() => ({ rawY: [12, 16] })),
      significanceEnabled: true,
      annotationOpts: {
        orientation: 'horizontal',
        showWhiskers: true,
        whiskerMode: 'adaptive',
        fontSize: 20,
        strokeWidth: 1,
        pScientific: false,
        pDecimals: 2
      },
      helpers: {
        annotationStyle: {
          orientation: 'horizontal',
          showWhiskers: true,
          whiskerMode: 'adaptive',
          fontSize: 20,
          strokeWidth: 1,
          pScientific: false,
          pDecimals: 2
        }
      },
      orientation: 'horizontal',
      categoryCenter: idx => centers[idx],
      valueToCoord: value => value * 10,
      annotationBracketSize: 10,
      annotationMaxByTrace: centers.map(() => 16)
    });
    const pairs = [];
    for(let ai = 0; ai < centers.length - 1; ai += 1){
      for(let bi = ai + 1; bi < centers.length; bi += 1){
        pairs.push({ ai, bi, rangeMax: 16, p: (ai + bi) % 2 ? 1 : 0.55 });
      }
    }
    runtime.renderPairs(pairs);

    const labels = Array.from(svg.querySelectorAll('text.box-significance-annotation'))
      .map(node => {
        const bbox = node.getBBox();
        return {
          text: node.textContent,
          left: bbox.x,
          right: bbox.x + bbox.width,
          top: bbox.y,
          bottom: bbox.y + bbox.height
        };
      });
    const paths = Array.from(svg.querySelectorAll('path.box-significance-annotation'));
    const pathGeometry = paths.map(path => {
      const values = String(path.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
      return {
        inner: Number(path.getAttribute('data-sig-inner')),
        level: Number(path.getAttribute('data-sig-level')),
        top: Math.min(Number(path.getAttribute('data-sig-x1')), Number(path.getAttribute('data-sig-x2'))),
        bottom: Math.max(Number(path.getAttribute('data-sig-x1')), Number(path.getAttribute('data-sig-x2'))),
        values
      };
    });
    const segments = pathGeometry
      .flatMap((geometry, pathIndex) => {
        const values = geometry.values;
        if(values.length < 8){
          return [];
        }
        return [
          { pathIndex, level: geometry.level, left: Math.min(values[0], values[2]), right: Math.max(values[0], values[2]), y: values[1] },
          { pathIndex, level: geometry.level, left: Math.min(values[4], values[6]), right: Math.max(values[4], values[6]), y: values[5] }
        ];
      });
    const collisions = [];
    segments.forEach((segment, segmentIndex) => {
      labels.forEach(label => {
        const crossesLabelRow = segment.y >= label.top && segment.y <= label.bottom;
        const overlapsLabelWidth = segment.right > label.left && segment.left < label.right;
        if(crossesLabelRow && overlapsLabelWidth){
          collisions.push({ segmentIndex, segment, label });
        }
      });
    });
    const staleLevelEndpoints = [];
    segments.forEach(segment => {
      const precedingSpines = pathGeometry
        .slice(0, segment.pathIndex)
        .filter(geometry =>
          geometry.level < segment.level
          && segment.y >= geometry.top - 8
          && segment.y <= geometry.bottom + 8
        )
        .map(geometry => geometry.inner)
        .filter(Number.isFinite);
      if(!precedingSpines.length){
        return;
      }
      const furthestPrecedingSpine = Math.max(...precedingSpines);
      if(segment.left < furthestPrecedingSpine){
        staleLevelEndpoints.push({ segment, furthestPrecedingSpine });
      }
    });
    const result = {
      collisions,
      staleLevelEndpoints,
      labelTexts: labels.map(label => label.text),
      labelCount: labels.length,
      pathCount: svg.querySelectorAll('path.box-significance-annotation').length
    };
    svg.remove();
    return result;
  });

  expect(layout.labelCount).toBe(10);
  expect(layout.pathCount).toBe(10);
  expect(new Set(layout.labelTexts)).toEqual(new Set(['0.55', '1.00']));
  expect(layout.collisions, JSON.stringify(layout.collisions)).toEqual([]);
  expect(layout.staleLevelEndpoints, JSON.stringify(layout.staleLevelEndpoints)).toEqual([]);
  expect(issues.critical).toEqual([]);
});

test('box versus-reference significance stacks correctly when the reference is the last dataset', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await loadBoxExampleData(page);
  await page.locator('#boxGraphType').selectOption('strip');
  await page.waitForTimeout(300);

  await page.locator('#boxStatsScope').selectOption('reference');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('label')).some(label => label.textContent?.trim() === 'Reference:'));
  const referenceIndex = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent?.trim() === 'Reference:');
    const select = label?.parentElement?.querySelector('select');
    if (!select || !select.options.length) {
      throw new Error('Reference selector is unavailable');
    }
    const lastIndex = select.options.length - 1;
    select.value = String(lastIndex);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return lastIndex;
  });
  expect(referenceIndex).toBe(5);

  await ensureBoxStatsAndSignificanceReady(page);
  await setBoxSignificanceToggle(page, true);
  await waitForVerticalSignificanceAnnotations(page);
  await page.waitForTimeout(700);

  const layout = await page.evaluate(() => {
    const state = window.Components?.box?.__getState?.() || null;
    const paths = Array.from(document.querySelectorAll('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]'));
    return {
      pairCount: paths.length,
      levels: paths.map(path => Number(path.getAttribute('data-sig-level'))).filter(Number.isFinite).sort((a, b) => a - b),
      modelPairs: Array.isArray(state?.statsLastAnnotationModel?.pairs)
        ? state.statsLastAnnotationModel.pairs.map(pair => ({ ai: pair.ai, bi: pair.bi }))
        : []
    };
  });

  expect(layout.pairCount).toBe(5);
  expect(layout.levels).toEqual([0, 1, 2, 3, 4]);
  expect(layout.modelPairs).toHaveLength(5);
  expect(layout.modelPairs.every(pair => pair.ai === 5 && pair.bi >= 0 && pair.bi < 5)).toBe(true);
  expect(issues.critical).toEqual([]);
});

test('box pairwise significance stays stable without manual resize and after tab restore', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  const boxTabId = await getActiveWorkspaceTabId(page);
  expect(boxTabId).toBeTruthy();

  await loadBoxExampleData(page);
  await page.locator('#boxGraphType').selectOption('strip');
  await page.locator('#boxShowFrame').check();
  await page.waitForTimeout(350);
  await ensureBoxStatsAndSignificanceReady(page);
  await setBoxSignificanceToggle(page, true);
  await page.waitForTimeout(250);
  await waitForVerticalSignificanceAnnotations(page);
  await page.waitForTimeout(900);
  await expectBoxDrawsToSettle(page, 2);
  await expect.poll(
    () => page.locator('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').count(),
    { timeout: 20_000 }
  ).toBeGreaterThan(0);
  const frameContainment = await page.evaluate(() => {
    const svg = document.querySelector('#boxPlot svg');
    const significanceLayer = svg?.querySelector('[data-box-significance-layer="1"]');
    const frame = svg?.querySelector('g[data-box-frame="1"]');
    const top = frame?.querySelector('[data-box-frame-side="top"]');
    const right = frame?.querySelector('[data-box-frame-side="right"]');
    const leftExtension = frame?.querySelector('[data-box-frame-extension="left"]');
    const bounds = significanceLayer?.getBBox?.();
    return {
      annotationTop: Number(bounds?.y),
      frameTop: Number(top?.getAttribute('y1')),
      plotTop: Number(svg?.dataset?.boxPlotTop),
      rightTop: Number(right?.getAttribute('y1')),
      hasLeftExtension: !!leftExtension,
      visible: frame ? getComputedStyle(frame).display !== 'none' : false
    };
  });
  expect(frameContainment.visible).toBe(true);
  expect(frameContainment.frameTop).toBeLessThan(frameContainment.plotTop);
  expect(frameContainment.frameTop).toBeLessThanOrEqual(frameContainment.annotationTop - 3);
  expect(frameContainment.rightTop).toBeCloseTo(frameContainment.frameTop, 6);
  expect(frameContainment.hasLeftExtension).toBe(true);

  await activateWelcomeTab(page);
  await page.waitForTimeout(300);
  await activateWorkspaceTab(page, boxTabId);
  await page.waitForFunction(
    () => document.querySelector('#boxPlot svg')
      && document.querySelectorAll('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').length > 0,
    null,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(900);
  await expectBoxDrawsToSettle(page, 2);
  await expect.poll(
    () => page.locator('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').count(),
    { timeout: 20_000 }
  ).toBeGreaterThan(0);

  expect(issues.critical).toEqual([]);
});

test('box pairwise layout remains isolated after switching between box tabs', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  const firstTabId = await getActiveWorkspaceTabId(page);
  expect(firstTabId).toBeTruthy();

  await loadBoxExampleData(page);
  await page.locator('#boxGraphType').selectOption('strip');
  await page.waitForTimeout(350);
  await setBoxLockRatioToggle(page, true);
  await ensureBoxStatsAndSignificanceReady(page);
  await setBoxSignificanceToggle(page, true);
  await waitForVerticalSignificanceAnnotations(page);
  await page.waitForTimeout(700);

  await dragBoxVerticalHandle(page, 90);
  await page.waitForTimeout(2_200);
  await expectBoxDrawsToSettle(page, 3);
  const firstPairwise = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(firstPairwise).not.toBeNull();
  expect(firstPairwise.significancePathCount).toBeGreaterThan(0);
  expect(firstPairwise.svgBoxWidthPx).not.toBeNull();
  expect(firstPairwise.svgBoxHeightPx).not.toBeNull();
  expect(firstPairwise.yAxisSpan).not.toBeNull();
  expect(firstPairwise.xAxisY).not.toBeNull();

  await openAdditionalEmptyComponentTab(page, { type: 'box', pageId: 'boxPage' });
  const secondTabId = await getActiveWorkspaceTabId(page);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);
  await loadBoxExampleData(page);
  await page.locator('#boxGraphType').selectOption('box');
  await page.waitForTimeout(350);
  await dragBoxVerticalHandle(page, -55);
  await page.waitForTimeout(600);

  await activateWorkspaceTab(page, firstTabId);
  await waitForVerticalSignificanceAnnotations(page);
  await page.waitForTimeout(900);
  await expectBoxDrawsToSettle(page, 3);

  await setBoxSignificanceToggle(page, false);
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot .box-significance-annotation').length === 0,
    null,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(900);
  await expectBoxDrawsToSettle(page, 3);
  const pairwiseOff = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(pairwiseOff).not.toBeNull();
  expect(pairwiseOff.significancePathCount).toBe(0);
  expect(pairwiseOff.yAxisSpan).not.toBeNull();
  expect(Math.abs(pairwiseOff.yAxisSpan - firstPairwise.yAxisSpan)).toBeLessThanOrEqual(7);

  await setBoxSignificanceToggle(page, true);
  await waitForVerticalSignificanceAnnotations(page);
  await page.waitForTimeout(1_200);
  await expectBoxDrawsToSettle(page, 3);
  const restoredPairwise = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(restoredPairwise).not.toBeNull();
  expect(restoredPairwise.significancePathCount).toBeGreaterThan(0);
  expect(restoredPairwise.svgBoxWidthPx).not.toBeNull();
  expect(restoredPairwise.svgBoxHeightPx).not.toBeNull();
  expect(restoredPairwise.yAxisSpan).not.toBeNull();
  expect(restoredPairwise.xAxisY).not.toBeNull();
  expect(restoredPairwise.showSignificanceBars).toBe(true);

  expect(Math.abs(restoredPairwise.svgBoxWidthPx - firstPairwise.svgBoxWidthPx)).toBeLessThanOrEqual(20);
  expect(Math.abs(restoredPairwise.yAxisSpan - firstPairwise.yAxisSpan)).toBeLessThanOrEqual(7);
  expect(restoredPairwise.yAxisSpan).toBeGreaterThan(0);

  expect(issues.critical).toEqual([]);
});

test('box title and graph controls remain on the visible top rail with significance comparisons', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await loadBoxExampleData(page);
  await ensureBoxStatsAndSignificanceReady(page);

  const significanceToggle = page.locator('#boxShowSignificance');
  if (await significanceToggle.isChecked()) {
    await setBoxSignificanceToggle(page, false);
  }
  await page.waitForFunction(() => document.querySelectorAll('#boxPlot .box-significance-annotation').length === 0);
  const before = await page.evaluate(readVerticalBoxLayoutMetrics);

  await setBoxSignificanceToggle(page, true);
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').length > 0
  );
  const after = await page.evaluate(readVerticalBoxLayoutMetrics);

  expect(before?.graphEnvelopeTopPx).not.toBeNull();
  expect(before?.graphTitleTopPx).not.toBeNull();
  expect(after?.cartesianTopExtensionPx).toBeGreaterThan(0);
  expect(after?.graphEnvelopeTopPx).not.toBeNull();
  expect(after?.controlTrayTopPx).not.toBeNull();
  expect(after?.graphTitleTopPx).not.toBeNull();
  expect(after?.graphTitleBottomPx).not.toBeNull();
  expect(after?.significanceTopPx).not.toBeNull();
  expect(Math.abs(after.controlTrayTopPx - after.graphEnvelopeTopPx - 10)).toBeLessThanOrEqual(3);
  expect(Math.abs(
    (after.graphTitleTopPx - after.graphEnvelopeTopPx)
      - (before.graphTitleTopPx - before.graphEnvelopeTopPx)
  )).toBeLessThanOrEqual(4);
  expect(after.graphTitleBottomPx).toBeLessThanOrEqual(after.significanceTopPx + 4);
  expect(issues.critical).toEqual([]);
});

test('box significance bars keep plot height while shifting plot downward', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await loadBoxExampleData(page);
  await page.locator('#boxGraphType').selectOption('box');
  await page.waitForTimeout(350);

  await ensureBoxStatsAndSignificanceReady(page);

  const significanceToggle = page.locator('#boxShowSignificance');
  await setBoxLockRatioToggle(page, true);
  await page.waitForTimeout(250);
  if (await significanceToggle.isChecked()) {
    await setBoxSignificanceToggle(page, false);
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => document.querySelectorAll('#boxPlot .box-significance-annotation').length === 0);

  const before = await page.evaluate(readVerticalBoxLayoutMetrics);
  if(!before){
    expect(issues.critical).toEqual([]);
    return;
  }
  expect(before.yAxisSpan).not.toBeNull();
  expect(before.xAxisY).not.toBeNull();
  expect(before.dataBottomY).not.toBeNull();
  expect(before.controlsOverlapPx).not.toBeNull();
  expect(before.aspectLockMeta).toBe(true);
  expect(before.svgBoxWidthPx).not.toBeNull();
  expect(before.svgBoxHeightPx).not.toBeNull();
  expect(before.aspectRatioMeta).not.toBeNull();
  expect(before.controlsOverlapPx).toBeLessThanOrEqual(2.5);

  await dragBoxVerticalHandle(page, 70);
  await page.waitForTimeout(350);
  const afterManualResize = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(afterManualResize).not.toBeNull();
  expect(afterManualResize.svgBoxHeightPx).not.toBeNull();
  expect(afterManualResize.svgBoxWidthPx).not.toBeNull();
  expect(afterManualResize.aspectRatioMeta).not.toBeNull();
  expect(afterManualResize.aspectLockMeta).toBe(true);
  expect(afterManualResize.svgBoxHeightPx).toBeGreaterThan(before.svgBoxHeightPx + 4);
  expect(afterManualResize.svgBoxWidthPx).toBeGreaterThan(before.svgBoxWidthPx + 4);
  expect(Math.abs(afterManualResize.aspectRatioMeta - before.aspectRatioMeta)).toBeLessThanOrEqual(0.1);

  await setBoxSignificanceToggle(page, true);
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').length > 0
  );
  await page.waitForTimeout(700);

  const after = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(after).not.toBeNull();
  expect(after.yAxisSpan).not.toBeNull();
  expect(after.xAxisY).not.toBeNull();
  expect(after.dataBottomY).not.toBeNull();
  expect(after.controlsOverlapPx).not.toBeNull();
  expect(after.significancePathCount).toBeGreaterThan(0);
  expect(after.graphEnvelopeTopPx).not.toBeNull();
  expect(after.controlTrayTopPx).not.toBeNull();
  expect(after.graphTitleTopPx).not.toBeNull();
  expect(after.graphTitleBottomPx).not.toBeNull();
  expect(after.significanceTopPx).not.toBeNull();
  expect(afterManualResize.graphEnvelopeTopPx).not.toBeNull();
  expect(afterManualResize.graphTitleTopPx).not.toBeNull();
  expect(Math.abs(after.controlTrayTopPx - after.graphEnvelopeTopPx - 10)).toBeLessThanOrEqual(3);
  expect(Math.abs(
    (after.graphTitleTopPx - after.graphEnvelopeTopPx)
      - (afterManualResize.graphTitleTopPx - afterManualResize.graphEnvelopeTopPx)
  )).toBeLessThanOrEqual(4);
  expect(after.graphTitleBottomPx).toBeLessThanOrEqual(after.significanceTopPx + 4);
  expect(after.aspectLockMeta).toBe(true);
  expect(after.svgBoxWidthPx).not.toBeNull();
  expect(after.svgBoxHeightPx).not.toBeNull();
  expect(Math.abs(after.yAxisSpan - afterManualResize.yAxisSpan)).toBeLessThanOrEqual(4);
  expect(Math.abs(after.xAxisY - afterManualResize.xAxisY)).toBeLessThanOrEqual(4);
  expect(Math.abs(after.dataBottomY - afterManualResize.dataBottomY)).toBeLessThanOrEqual(4);
  expect(Math.abs(after.svgBoxHeightPx - afterManualResize.svgBoxHeightPx)).toBeLessThanOrEqual(2);
  expect(after.cartesianTopExtensionPx).toBeGreaterThan(0);
  expect(after.controlsOverlapPx).toBeLessThanOrEqual(2.5);

  await dragBoxVerticalHandle(page, 60);
  await page.waitForTimeout(350);
  const afterSignificanceManualResize = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(afterSignificanceManualResize).not.toBeNull();
  expect(afterSignificanceManualResize.aspectLockMeta).toBe(true);
  expect(afterSignificanceManualResize.svgBoxHeightPx).toBeGreaterThan(after.svgBoxHeightPx + 8);
  expect(afterSignificanceManualResize.svgBoxWidthPx).toBeGreaterThan(after.svgBoxWidthPx + 6);
  expect(Math.abs(afterSignificanceManualResize.aspectRatioMeta - after.aspectRatioMeta)).toBeLessThanOrEqual(0.225);

  expect(issues.critical).toEqual([]);
});

test('box width resize keeps the graph clear of the bottom tray', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await loadBoxExampleData(page);
  await page.waitForFunction(() => {
    const plot = document.getElementById('boxPlot');
    return !!plot && (plot.innerHTML || '').length > 0;
  }, null, { timeout: 20_000 });
  await page.waitForTimeout(700);
  await ensureBoxStatsAndSignificanceReady(page);
  await setBoxSignificanceToggle(page, true);
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').length > 0
  );
  await page.waitForTimeout(600);

  await setBoxLockRatioToggle(page, true);
  await page.waitForTimeout(250);

  const before = await page.evaluate(readVerticalBoxLayoutMetrics);
  if(!before){
    expect(issues.critical).toEqual([]);
    return;
  }
  expect(before.controlsOverlapPx).not.toBeNull();
  expect(before.controlsOverlapPx).toBeLessThanOrEqual(2.5);
  expect(before.aspectLockMeta).toBe(true);
  expect(before.aspectRatioMeta).not.toBeNull();
  expect(before.svgBoxHeightPx).not.toBeNull();
  expect(before.svgBoxWidthPx).not.toBeNull();

  await dragBoxWidthHandle(page, -190);
  await page.waitForTimeout(900);

  const after = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(after).not.toBeNull();
  expect(after.controlsOverlapPx).not.toBeNull();
  expect(after.svgBoxWidthPx).not.toBeNull();
  expect(after.svgBoxWidthPx).toBeLessThan(before.svgBoxWidthPx - 80);
  expect(after.aspectLockMeta).toBe(true);
  expect(after.controlsOverlapPx).toBeLessThanOrEqual(2.5);
  expect(after.aspectRatioMeta).not.toBeNull();
  expect(before.xAxisSpan).not.toBeNull();
  expect(after.xAxisSpan).not.toBeNull();
  expect(before.yAxisSpan).not.toBeNull();
  expect(after.yAxisSpan).not.toBeNull();
  const beforeAxisRatio = before.xAxisSpan / before.yAxisSpan;
  const afterAxisRatio = after.xAxisSpan / after.yAxisSpan;
  expect(Math.abs(afterAxisRatio / beforeAxisRatio - 1)).toBeLessThanOrEqual(0.015);

  expect(issues.critical).toEqual([]);
});
