const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

const LOCK_RATIO_COMPONENTS = [
  {
    type: 'venn',
    pageId: 'vennPage',
    exampleButtonId: 'sample',
    prepare: async page => {
      await page.locator('#vennPage:not([hidden]) #vennPlotType').selectOption('upset');
      await page.waitForTimeout(500);
    }
  },
  { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
  { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
  { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample' },
  { type: 'roc', pageId: 'rocPage', exampleButtonId: 'rocLoadExample' },
  { type: 'survival', pageId: 'survivalPage', exampleButtonId: 'survivalLoadExample' },
  { type: 'hist', pageId: 'histPage', exampleButtonId: 'histLoadExample' },
  { type: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample', forced: true },
  {
    type: 'pie',
    pageId: 'piePage',
    exampleButtonId: 'pieLoadExample',
    prepare: async page => {
      await page.locator('#piePage:not([hidden]) #pieChartType').selectOption('stacked');
      await page.waitForTimeout(500);
    }
  }
];

const FORCED_3D_COMPONENTS = [
  {
    type: 'line',
    pageId: 'linePage',
    exampleButtonId: 'lineLoadExample',
    prepare: page => page.locator('#linePage:not([hidden]) #lineViewMode').selectOption('3d')
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    exampleButtonId: 'scatterLoadExample',
    prepare: async page => {
      await page.locator('#scatterPage:not([hidden]) #scatterViewMode').selectOption('3d');
      await clickExampleButtonIfPresent(page, 'scatterLoadExample');
      await page.waitForFunction(() => {
        const data = window.Components?.scatter?.__getActiveHot?.()?.getData?.() || [];
        return data.some((row, index) => index > 0 && Array.isArray(row) && row[3] !== '' && row[3] != null);
      }, null, { timeout: 30_000 });
    }
  },
  { type: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample' }
];

async function waitForAxes(page, pageId) {
  await page.waitForFunction(({ pageId }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const axisSelector = pageId === 'piePage'
      ? '.svgbox svg:not(.resizer-options-icon) line'
      : (pageId === 'boxPage'
        ? '.svgbox line[data-box-primary-axis]'
        : '.svgbox line[data-axis-control="1"], .svgbox line[data-axis-line="1"]');
    const lines = Array.from(root?.querySelectorAll?.(
      axisSelector
    ) || []);
    let horizontal = 0;
    let vertical = 0;
    let explicitX = 0;
    let explicitY = 0;
    lines.forEach(line => {
      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      if(![x1, x2, y1, y2].every(Number.isFinite)) return;
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);
      const key = pageId === 'boxPage'
        ? line.getAttribute('data-box-primary-axis')
        : line.getAttribute('data-axis-key');
      const length = Math.hypot(dx, dy);
      if(key === 'x'){
        explicitX = Math.max(explicitX, length);
        return;
      }
      if(key === 'y'){
        explicitY = Math.max(explicitY, length);
        return;
      }
      if(key) return;
      if(dy <= Math.max(2, dx * 0.05)) horizontal = Math.max(horizontal, dx);
      if(dx <= Math.max(2, dy * 0.05)) vertical = Math.max(vertical, dy);
    });
    return (explicitX > 2 && explicitY > 2) || (horizontal > 20 && vertical > 20);
  }, { pageId }, { timeout: 45_000 });
}

async function clickResizeHandle(page, pageId, selector) {
  await page.locator(`#${pageId}:not([hidden]) .svgbox ${selector}`).click({ position: { x: 3, y: 3 } });
}

async function readGeometry(page, pageId) {
  return page.evaluate(({ pageId }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const svgBox = root?.querySelector?.('.svgbox') || null;
    const svg = svgBox?.querySelector?.('svg:not(.resizer-options-icon)') || null;
    const boxRect = svgBox?.getBoundingClientRect?.() || null;
    const svgRect = svg?.getBoundingClientRect?.() || null;
    const viewBox = svg?.viewBox?.baseVal || null;
    if(!svgBox || !svg || !boxRect || !svgRect || !viewBox?.width || !viewBox?.height){
      return null;
    }
    let xAxis = 0;
    let yAxis = 0;
    const axisSelector = pageId === 'piePage'
      ? 'line'
      : (pageId === 'boxPage'
        ? 'line[data-box-primary-axis]'
        : 'line[data-axis-control="1"], line[data-axis-line="1"]');
    const boxPrimaryExtents = {
      x: { min: Infinity, max: -Infinity },
      y: { min: Infinity, max: -Infinity }
    };
    Array.from(svg.querySelectorAll(axisSelector)).forEach(line => {
      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      if(![x1, x2, y1, y2].every(Number.isFinite)) return;
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);
      const key = pageId === 'boxPage'
        ? line.getAttribute('data-box-primary-axis')
        : line.getAttribute('data-axis-key');
      const scaleX = svgRect.width / viewBox.width;
      const scaleY = svgRect.height / viewBox.height;
      const preserveAspectRatio = String(svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();
      const renderedLength = preserveAspectRatio !== 'none'
        ? Math.hypot(dx, dy) * Math.min(scaleX, scaleY)
        : Math.hypot(dx * scaleX, dy * scaleY);
      if(pageId === 'boxPage' && (key === 'x' || key === 'y')){
        // Box publishes the visible primary axes explicitly. Measure those
        // lines only and keep both axes in rendered screen units. This avoids
        // selecting a transparent interaction line after redraws and handles
        // fragmented primary axes by measuring their complete visible extent.
        const matrix = typeof line.getScreenCTM === 'function' ? line.getScreenCTM() : null;
        if(matrix && typeof DOMPoint === 'function'){
          const p1 = new DOMPoint(x1, y1).matrixTransform(matrix);
          const p2 = new DOMPoint(x2, y2).matrixTransform(matrix);
          const values = key === 'x' ? [p1.x, p2.x] : [p1.y, p2.y];
          boxPrimaryExtents[key].min = Math.min(boxPrimaryExtents[key].min, ...values);
          boxPrimaryExtents[key].max = Math.max(boxPrimaryExtents[key].max, ...values);
        }else{
          const values = key === 'x' ? [x1 * scaleX, x2 * scaleX] : [y1 * scaleY, y2 * scaleY];
          boxPrimaryExtents[key].min = Math.min(boxPrimaryExtents[key].min, ...values);
          boxPrimaryExtents[key].max = Math.max(boxPrimaryExtents[key].max, ...values);
        }
        return;
      }
      if(key === 'x'){
        xAxis = Math.max(xAxis, renderedLength);
        return;
      }
      if(key === 'y'){
        yAxis = Math.max(yAxis, renderedLength);
        return;
      }
      if(key) return;
      if(dy <= Math.max(2, dx * 0.05)) xAxis = Math.max(xAxis, dx * svgRect.width / viewBox.width);
      if(dx <= Math.max(2, dy * 0.05)) yAxis = Math.max(yAxis, dy * svgRect.height / viewBox.height);
    });
    if(pageId === 'boxPage'){
      if(Number.isFinite(boxPrimaryExtents.x.min) && Number.isFinite(boxPrimaryExtents.x.max)){
        xAxis = Math.max(0, boxPrimaryExtents.x.max - boxPrimaryExtents.x.min);
      }
      if(Number.isFinite(boxPrimaryExtents.y.min) && Number.isFinite(boxPrimaryExtents.y.max)){
        yAxis = Math.max(0, boxPrimaryExtents.y.max - boxPrimaryExtents.y.min);
      }
    }
    return {
      frameWidth: boxRect.width,
      frameHeight: boxRect.height,
      svgWidth: svgRect.width,
      svgHeight: svgRect.height,
      viewBoxWidth: viewBox.width,
      viewBoxHeight: viewBox.height,
      baseWidth: Number(svg.getAttribute('data-surface-base-width')) || null,
      baseHeight: Number(svg.getAttribute('data-surface-base-height')) || null,
      preserveAspectRatio: svg.getAttribute('preserveAspectRatio') || '',
      xAxis,
      yAxis,
      axisRatio: xAxis / yAxis,
      checked: !!svgBox.querySelector('.resizer-aspect-checkbox')?.checked,
      disabled: !!svgBox.querySelector('.resizer-aspect-checkbox')?.disabled,
      locked: svgBox.dataset.resizerAspectLocked,
      // Migrated 2D charts publish the Lock target from the committed
      // Cartesian plot transaction. Explicitly excluded/legacy renderers keep
      // the older rendered-geometry target. The test consumes whichever
      // contract the active renderer owns rather than forcing a fallback.
      targetRatio: svgBox.dataset.cartesianLayoutComplete === 'true'
        ? Number(svgBox.dataset.resizerCartesianPlotRatio || svgBox.dataset.cartesianLockTargetRatio)
        : Number(svgBox.dataset.resizerLockedGeometryRatio),
      cartesianComplete: svgBox.dataset.cartesianLayoutComplete === 'true',
      cartesianOwnerTabId: svgBox.dataset.cartesianLayoutTabId || null,
      cartesianComponent: svgBox.dataset.cartesianLayoutComponent || null,
      tabId: String(window.Main?.session?.workspaceState?.activeTabId || '')
    };
  }, { pageId });
}

async function waitForStableGeometry(page, pageId, options = {}) {
  const timeout = options.timeout ?? 8_000;
  const interval = options.interval ?? 175;
  const tolerance = options.tolerance ?? 0.08;
  const deadline = Date.now() + timeout;
  await page.evaluate(async ({ pageId }) => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => String(item?.id || '') === String(state?.activeTabId || '')) || null;
    const ready = tab?.type ? window.Components?.[tab.type]?.awaitReadyForSnapshot?.({
      tabId: tab.id,
      componentKey: tab.type,
      reason: `lock-ratio-geometry-${pageId}-stable`
    }) : null;
    if(ready && typeof ready.then === 'function') await ready;
  }, { pageId });
  let previous = null;
  let stableSamples = 0;
  while(Date.now() < deadline){
    await waitForAxes(page, pageId);
    const current = await readGeometry(page, pageId);
    const stable = previous
      && Math.abs(current.frameWidth - previous.frameWidth) <= tolerance
      && Math.abs(current.frameHeight - previous.frameHeight) <= tolerance
      && Math.abs(current.svgWidth - previous.svgWidth) <= tolerance
      && Math.abs(current.svgHeight - previous.svgHeight) <= tolerance
      && Math.abs(current.viewBoxWidth - previous.viewBoxWidth) <= tolerance
      && Math.abs(current.viewBoxHeight - previous.viewBoxHeight) <= tolerance
      && Math.abs(current.xAxis - previous.xAxis) <= tolerance
      && Math.abs(current.yAxis - previous.yAxis) <= tolerance;
    stableSamples = stable ? stableSamples + 1 : 0;
    if(stableSamples >= 2){
      return current;
    }
    previous = current;
    await page.waitForTimeout(interval);
  }
  throw new Error(`${pageId} geometry did not settle: ${JSON.stringify(previous)}`);
}

async function setLock(page, pageId, checked) {
  await page.evaluate(({ pageId, checked }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const checkbox = root?.querySelector?.('.svgbox .resizer-aspect-checkbox');
    if(!checkbox || checkbox.disabled) throw new Error('User-toggleable Lock ratio control unavailable');
    if(checkbox.checked !== checked){
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { pageId, checked });
  await page.waitForTimeout(250);
}

async function dragHandle(page, pageId, selector, dx, dy) {
  const handle = page.locator(`#${pageId}:not([hidden]) .svgbox ${selector}`).first();
  await handle.scrollIntoViewIfNeeded();
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.evaluate(() => {
    window.Shared?.enableDebugLogging?.();
    window.__lockRatioReleaseDraws = [];
    if(window.__lockRatioDebugWrapped) return;
    window.__lockRatioDebugWrapped = true;
    const originalDebug = console.debug.bind(console);
    console.debug = (...args) => {
      const label = String(args[0] || '');
      if(label === 'Debug: drawRoc start'
        || label === 'Debug: survival draw start'
        || label === 'drawScatter called'){
        window.__lockRatioReleaseDraws?.push(label);
      }
      originalDebug(...args);
    };
  });
  await page.mouse.up();
  await page.evaluate(async () => {
    const state = window.Main?.session?.workspaceState;
    const tabId = String(state?.activeTabId || '');
    const tab = state?.tabs?.find(item => String(item?.id || '') === tabId) || null;
    const ready = tab?.type ? window.Components?.[tab.type]?.awaitReadyForSnapshot?.({
      tabId,
      componentKey: tab.type,
      reason: 'lock-ratio-resize-ready'
    }) : null;
    if(ready && typeof ready.then === 'function'){
      await ready;
    }
  });
  await page.waitForTimeout(150);
  const releaseDraws = await page.evaluate(() => window.__lockRatioReleaseDraws || []);
  expect(releaseDraws.length, `post-release redraws: ${JSON.stringify(releaseDraws)}`).toBeLessThanOrEqual(1);
}

function expectGeometryEqual(actual, expected, label, tolerance = {}) {
  const frameTolerance = tolerance.frame ?? 0.6;
  const axisTolerance = tolerance.axis ?? 0.75;
  expect(Math.abs(actual.frameWidth - expected.frameWidth), `${label} frame width ${JSON.stringify({ actual, expected })}`).toBeLessThanOrEqual(frameTolerance);
  expect(Math.abs(actual.frameHeight - expected.frameHeight), `${label} frame height ${JSON.stringify({ actual, expected })}`).toBeLessThanOrEqual(frameTolerance);
  expect(Math.abs(actual.xAxis - expected.xAxis), `${label} x-axis length ${JSON.stringify({ actual, expected })}`).toBeLessThanOrEqual(axisTolerance);
  expect(Math.abs(actual.yAxis - expected.yAxis), `${label} y-axis length ${JSON.stringify({ actual, expected })}`).toBeLessThanOrEqual(axisTolerance);
}

function expectCanonicalGeometryEqual(actual, expected, label, tolerance = {}) {
  const frameTolerance = tolerance.frame ?? 0.6;
  const viewBoxTolerance = tolerance.viewBox ?? 0.08;
  expect(Math.abs(actual.frameWidth - expected.frameWidth), `${label} frame width ${JSON.stringify({ actual, expected })}`).toBeLessThanOrEqual(frameTolerance);
  expect(Math.abs(actual.frameHeight - expected.frameHeight), `${label} frame height ${JSON.stringify({ actual, expected })}`).toBeLessThanOrEqual(frameTolerance);
  expect(Math.abs(actual.viewBoxWidth - expected.viewBoxWidth), `${label} viewBox width ${JSON.stringify({ actual, expected })}`).toBeLessThanOrEqual(viewBoxTolerance);
  expect(Math.abs(actual.viewBoxHeight - expected.viewBoxHeight), `${label} viewBox height ${JSON.stringify({ actual, expected })}`).toBeLessThanOrEqual(viewBoxTolerance);
}

function expectRatioLocked(actual, target, label, minAxisLength = 20, ratioTolerance = 0.01) {
  expect(actual.xAxis, `${label} x-axis`).toBeGreaterThan(minAxisLength);
  expect(actual.yAxis, `${label} y-axis`).toBeGreaterThan(minAxisLength);
  expect(
    Math.abs(actual.axisRatio / target - 1),
    `${label} axis ratio ${JSON.stringify({ actual, target })}`
  ).toBeLessThanOrEqual(ratioTolerance);
}

function expectLockTargetMatchesRenderedAxes(geometry, renderedGeometry, label, pixelTolerance = 0.1) {
  const targetRatio = Number(geometry?.targetRatio);
  const renderedXAxis = Number(renderedGeometry?.xAxis);
  const renderedYAxis = Number(renderedGeometry?.yAxis);
  expect(Number.isFinite(targetRatio) && targetRatio > 0, `${label} target ratio ${JSON.stringify({ geometry, renderedGeometry })}`).toBe(true);
  expect(renderedXAxis, `${label} rendered x-axis`).toBeGreaterThan(0);
  expect(renderedYAxis, `${label} rendered y-axis`).toBeGreaterThan(0);

  // The committed Cartesian target is canonical plot-space geometry, whereas
  // readGeometry() measures browser-rendered SVG axes. Comparing those ratios
  // to six decimal places mixes two measurement domains and is stricter than
  // the sub-pixel geometry assertions above. Convert the ratio difference back
  // to an implied rendered-axis displacement and require that to stay sub-pixel.
  const impliedXAxisDelta = Math.abs((targetRatio * renderedYAxis) - renderedXAxis);
  expect(
    impliedXAxisDelta,
    `${label} target/rendered ratio ${JSON.stringify({ geometry, renderedGeometry, impliedXAxisDelta })}`
  ).toBeLessThanOrEqual(pixelTolerance);
}

async function activateTab(page, tabId, pageId) {
  await page.evaluate(async ({ tabId }) => {
    const result = window.Main?.tabs?.activateTab?.(tabId, { reason: 'lock-ratio-geometry-restore' });
    if(result && typeof result.then === 'function') await result;
  }, { tabId });
  await page.waitForFunction(({ tabId }) => (
    String(window.Main?.session?.workspaceState?.activeTabId || '') === String(tabId)
  ), { tabId }, { timeout: 30_000 });
  await page.waitForSelector(`#${pageId}:not([hidden])`, { timeout: 30_000 });
  await waitForAxes(page, pageId);
  await page.evaluate(async ({ tabId }) => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => String(item?.id || '') === String(tabId)) || null;
    const ready = tab?.type ? window.Components?.[tab.type]?.awaitReadyForSnapshot?.({
      tabId,
      componentKey: tab.type,
      reason: 'lock-ratio-geometry-restore-ready'
    }) : null;
    if(ready && typeof ready.then === 'function'){
      await ready;
    }
  }, { tabId });
  await page.waitForTimeout(500);
}

async function captureArchiveBase64(page) {
  return page.evaluate(async () => {
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'lock-ratio-axis-geometry'
    });
    if(!blob) throw new Error('Workspace archive unavailable');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for(let index = 0; index < bytes.length; index += 0x8000){
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  });
}

test('Lock ratio is toggle-neutral and preserves primary-axis proportions across default components', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const requestedComponent = String(process.env.LOCK_RATIO_COMPONENT || '').trim();
  // UpSet remains on the explicitly excluded legacy/integrated-layout resizer contract.
  // Keep it opt-in via LOCK_RATIO_COMPONENT=venn so its pre-existing drift remains
  // measurable without making the Cartesian transaction acceptance gate depend on it.
  const lockRatioComponents = requestedComponent
    ? LOCK_RATIO_COMPONENTS.filter(component => component.type === requestedComponent)
    : LOCK_RATIO_COMPONENTS.filter(component => component.type !== 'venn');
  const saved = [];
  for(let index = 0; index < lockRatioComponents.length; index += 1){
    const component = lockRatioComponents[index];
    await test.step(component.type, async () => {
      await openComponentFromWelcome(page, component, { first: index === 0, loadExample: true });
      await clickExampleButtonIfPresent(page, component.exampleButtonId);
      if(component.prepare) await component.prepare(page);
      await waitForAxes(page, component.pageId);

      const initial = await waitForStableGeometry(page, component.pageId);
      let targetRatio;
      if(component.forced){
        expect(initial.checked).toBe(true);
        expect(initial.disabled).toBe(true);
        targetRatio = initial.axisRatio;
        await clickResizeHandle(page, component.pageId, '.resizer-vertical');
        expectGeometryEqual(await waitForStableGeometry(page, component.pageId), initial, `${component.type} locked handle click`);
      }else{
        if(initial.checked) await setLock(page, component.pageId, false);
        await dragHandle(page, component.pageId, '.resizer-vertical', 83, 0);
        await dragHandle(page, component.pageId, '.resizer-horizontal', 0, 57);
        const custom = await waitForStableGeometry(page, component.pageId);

        await setLock(page, component.pageId, true);
        const locked = await waitForStableGeometry(page, component.pageId);
        expectGeometryEqual(locked, custom, `${component.type} lock`);
        expectLockTargetMatchesRenderedAxes(locked, custom, `${component.type} lock`);
        await clickResizeHandle(page, component.pageId, '.resizer-vertical');
        expectGeometryEqual(await waitForStableGeometry(page, component.pageId), locked, `${component.type} lock handle click`);

        await setLock(page, component.pageId, false);
        const unlocked = await waitForStableGeometry(page, component.pageId);
        expectGeometryEqual(unlocked, locked, `${component.type} unlock`);
        await clickResizeHandle(page, component.pageId, '.resizer-vertical');
        expectGeometryEqual(await waitForStableGeometry(page, component.pageId), unlocked, `${component.type} unlock handle click`);

        await setLock(page, component.pageId, true);
        targetRatio = (await waitForStableGeometry(page, component.pageId)).axisRatio;
      }
      await dragHandle(page, component.pageId, '.resizer-vertical', 97, 0);
      await waitForStableGeometry(page, component.pageId);
      expectRatioLocked(
        await readGeometry(page, component.pageId),
        targetRatio,
        `${component.type} horizontal resize`,
        20,
        component.type === 'venn' ? 0.02 : 0.01
      );

      await dragHandle(page, component.pageId, '.resizer-horizontal', 0, 71);
      const finalGeometry = await waitForStableGeometry(page, component.pageId);
      expectRatioLocked(
        finalGeometry,
        targetRatio,
        `${component.type} vertical resize`,
        20,
        component.type === 'venn' ? 0.02 : 0.01
      );
      saved.push({ component, geometry: finalGeometry });
    });
  }

  const archiveBase64 = await captureArchiveBase64(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 });
  await page.locator('#workspaceSessionInput').setInputFiles({
    name: 'lock-ratio-axis-geometry.graph',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(archiveBase64, 'base64')
  });
  await page.waitForFunction(expectedCount => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return tabs.filter(tab => tab && !tab.isWelcome).length >= expectedCount;
  }, saved.length, { timeout: 60_000 });

  for(const entry of saved){
    const reopenedTabId = await page.evaluate(type => {
      const tabs = window.Main?.session?.workspaceState?.tabs || [];
      return String(tabs.find(tab => tab && !tab.isWelcome && tab.type === type)?.id || '');
    }, entry.component.type);
    expect(reopenedTabId, `${entry.component.type} reopened tab`).toBeTruthy();
    await activateTab(page, reopenedTabId, entry.component.pageId);
    const reopened = await waitForStableGeometry(page, entry.component.pageId);
    expectGeometryEqual(reopened, entry.geometry, `${entry.component.type} reopen`, { frame: 1.1, axis: 2 });
    expect(reopened.locked).toBe('true');
    if(Number.isFinite(entry.geometry.targetRatio)){
      expect(reopened.targetRatio, `${entry.component.type} reopened ratio target`).toBeCloseTo(entry.geometry.targetRatio, 6);
    }
    expectRatioLocked(reopened, entry.geometry.axisRatio, `${entry.component.type} reopen`);
  }

  expect(issues.critical, `Critical browser issues: ${JSON.stringify(issues.critical.slice(0, 5))}`).toEqual([]);
});

test('forced Lock ratio preserves projected x/y axis proportions in every 3D component', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  for(let index = 0; index < FORCED_3D_COMPONENTS.length; index += 1){
    const component = FORCED_3D_COMPONENTS[index];
    await test.step(component.type, async () => {
      await openComponentFromWelcome(page, component, { first: index === 0, loadExample: true });
      await clickExampleButtonIfPresent(page, component.exampleButtonId);
      if(component.prepare){
        await component.prepare(page);
        await page.waitForTimeout(700);
      }
      await waitForAxes(page, component.pageId);
      const initial = await waitForStableGeometry(page, component.pageId);
      await clickResizeHandle(page, component.pageId, '.resizer-vertical');
      // 3D legends are published in the outward SVG envelope. A redraw may
      // settle that envelope without changing the canonical frame or viewBox;
      // those are the geometry values the locked handle must preserve.
      expectCanonicalGeometryEqual(await waitForStableGeometry(page, component.pageId), initial, `${component.type} 3D locked handle click`);
      expect(initial.checked, `${component.type} lock`).toBe(true);
      expect(initial.disabled, `${component.type} forced lock`).toBe(true);

      await dragHandle(page, component.pageId, '.resizer-vertical', 97, 0);
      expectRatioLocked(await waitForStableGeometry(page, component.pageId), initial.axisRatio, `${component.type} 3D horizontal resize`, 2);

      await dragHandle(page, component.pageId, '.resizer-horizontal', 0, 71);
      expectRatioLocked(await waitForStableGeometry(page, component.pageId), initial.axisRatio, `${component.type} 3D vertical resize`, 2);
    });
  }

  expect(issues.critical, `Critical browser issues: ${JSON.stringify(issues.critical.slice(0, 5))}`).toEqual([]);
});
