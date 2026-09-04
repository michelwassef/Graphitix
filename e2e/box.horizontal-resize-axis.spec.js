const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readBoxAxisMetrics() {
  const root = document.querySelector('#boxPage:not([hidden])') || document;
  const svg = root.querySelector('#boxPlot svg');
  const svgBox = root.querySelector('#boxGraphPanel .svgbox');
  if (!svg || !svgBox) {
    return null;
  }
  const axisLayer = svg.querySelector('g[data-layer="box-axis"]') || svg;
  const lines = Array.from(axisLayer.querySelectorAll('line'))
    .map(line => {
      const x1 = Number(line.getAttribute('x1'));
      const y1 = Number(line.getAttribute('y1'));
      const x2 = Number(line.getAttribute('x2'));
      const y2 = Number(line.getAttribute('y2'));
      if (![x1, y1, x2, y2].every(Number.isFinite)) {
        return null;
      }
      const rect = line.getBoundingClientRect();
      return {
        x1,
        y1,
        x2,
        y2,
        dx: Math.abs(x2 - x1),
        dy: Math.abs(y2 - y1),
        stroke: String(line.getAttribute('stroke') || '').toLowerCase(),
        rectLeft: Number(rect.left),
        rectRight: Number(rect.right),
        rectTop: Number(rect.top),
        rectBottom: Number(rect.bottom)
      };
    })
    .filter(Boolean);
  const visibleLines = lines.filter(line => line.stroke !== 'transparent');
  const minVerticalX = visibleLines
    .filter(line => line.dx <= 0.25 && line.dy > 10)
    .reduce((min, line) => Math.min(min, line.x1, line.x2), Infinity);
  const yAxis = visibleLines
    .filter(line => line.dx <= 0.25 && line.dy > 10)
    .filter(line => !Number.isFinite(minVerticalX) || Math.min(Math.abs(line.x1 - minVerticalX), Math.abs(line.x2 - minVerticalX)) <= 1.5)
    .sort((a, b) => b.dy - a.dy || a.x1 - b.x1)[0] || null;
  const yTitle = Array.from(svg.querySelectorAll('text'))
    .filter(node => {
      const text = String(node.textContent || '').trim();
      const transform = String(node.getAttribute('transform') || '');
      return text && /rotate/i.test(transform);
    })
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  const svgBoxRect = svgBox.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const titleRect = yTitle?.getBoundingClientRect?.() || null;
  const boxState = window.Components?.box?.__getState?.() || null;
  const yAxisScreenX = yAxis ? (yAxis.rectLeft + yAxis.rectRight) / 2 : null;
  return {
    svgBoxWidth: svgBoxRect.width,
    svgLeft: svgRect.left,
    svgRenderedWidth: svgRect.width,
    viewBox: svg.getAttribute('viewBox'),
    viewBoxMinX: Number((svg.getAttribute('viewBox') || '').trim().split(/\s+/)[0]),
    viewBoxWidth: Number((svg.getAttribute('viewBox') || '').trim().split(/\s+/)[2]),
    stableMinX: Number(svgBox.dataset.graphViewportStableMinX),
    stableWidth: Number(svgBox.dataset.graphViewportStableWidth),
    yAxisSvgX: yAxis ? yAxis.x1 : null,
    yAxisScreenX,
    yAxisPageX: yAxisScreenX == null ? null : yAxisScreenX + window.scrollX,
    yTitlePageX: titleRect ? ((titleRect.left + titleRect.right) / 2) + window.scrollX : null,
    plotHeight: Number(svg.dataset.boxPlotH),
    bottomViewportExtensionPx: Number(boxState?.graphGeometry?.reserves?.xLabelPx) || 0,
    significanceViewportExtensionPx: Number(boxState?.graphGeometry?.reserves?.significancePx) || 0,
    marginLeft: Number(yAxis?.x1)
  };
}

async function prepareBox(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#boxPlot svg'), null, { timeout: 30_000 });
  await page.locator('#boxGraphType').selectOption('strip');
  await page.evaluate(() => {
    const checkbox = document.querySelector('#boxGraphPanel .resizer-aspect-checkbox');
    if (checkbox && checkbox.checked) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    return !!document.querySelector('#boxPlot svg')
      && Number(state?.graphGeometry?.reserves?.xLabelPx || 0) > 0;
  }, null, { timeout: 20_000 });
  await page.waitForTimeout(600);
}

async function seedRichBoxRecoverySnapshot(page) {
  return page.evaluate(async () => {
    const request = window.indexedDB.open('graphitix-document-state', 2);
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains('snapshots')) {
          opened.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'e2e-box-horizontal-resize-recovery',
      useWorker: true
    });
    if (!blob) {
      db.close();
      throw new Error('Recovery archive was not created.');
    }
    const workspaceState = window.Main?.session?.workspaceState || {};
    const graphTabs = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
      : [];
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        meta: {
          app: 'Graphitix',
          kind: 'recovery',
          version: 1,
          savedAt: new Date().toISOString(),
          updatedAt: Date.now(),
          reason: 'e2e-box-horizontal-resize-recovery',
          dirty: true,
          hasData: true,
          tabCount: graphTabs.length,
          revision: Number(workspaceState.sessionRevision) || 0,
          fileName: workspaceState.sessionFileName || 'recovered.graph',
          filePath: workspaceState.sessionFilePath || '',
          fileScope: workspaceState.sessionFileScope || 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB recovery write failed.'));
    });
    db.close();
    return { bytes: blob.size, tabCount: graphTabs.length };
  });
}

async function captureBoxWorkspaceArchive(page) {
  const archive = await page.evaluate(async () => {
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-box-horizontal-resize-reopen'
    });
    if (!blob) {
      throw new Error('Box workspace archive was not created.');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    const activeTab = window.Main?.session?.getActiveTab?.() || null;
    const viewport = activeTab?.payload?.layout?.boxGeometry?.viewportGeometry || null;
    return {
      base64: btoa(binary),
      size: blob.size,
      payloadHasDerivedReserveAuthority: !!(viewport && (
        Object.prototype.hasOwnProperty.call(viewport, 'bottomViewportExtensionPx')
        || Object.prototype.hasOwnProperty.call(viewport, 'significanceViewportExtensionPx')
        || Object.prototype.hasOwnProperty.call(viewport, 'leftViewportExtensionPx')
        || Object.prototype.hasOwnProperty.call(viewport, 'rightViewportExtensionPx')
      )),
      payloadUserFrameWidthPx: Number(viewport?.userFrameWidthPx) || 0,
      payloadUserFrameHeightPx: Number(viewport?.userFrameHeightPx) || 0
    };
  });
  return {
    buffer: Buffer.from(archive.base64, 'base64'),
    size: archive.size,
    payloadHasDerivedReserveAuthority: archive.payloadHasDerivedReserveAuthority,
    payloadUserFrameWidthPx: archive.payloadUserFrameWidthPx,
    payloadUserFrameHeightPx: archive.payloadUserFrameHeightPx
  };
}

async function reopenBoxWorkspaceArchive(page, archiveBuffer) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles({
    name: 'box-horizontal-resize-reopen.graph',
    mimeType: 'application/octet-stream',
    buffer: archiveBuffer
  });
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState || null;
    return Array.isArray(state?.tabs) && state.tabs.some(tab => tab?.type === 'box' && !tab?.isWelcome);
  }, null, { timeout: 60_000 });
  const tabId = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    return (state.tabs || []).find(tab => tab?.type === 'box' && !tab?.isWelcome)?.id || null;
  });
  if (!tabId) {
    throw new Error('Box tab was not found after manual archive reopen.');
  }
  await page.evaluate(async id => {
    const activateTab = window.Main?.tabs?.activateTab;
    if (typeof activateTab !== 'function') {
      return;
    }
    const result = activateTab(id, { reason: 'e2e-box-horizontal-resize-reopen-activate' });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, tabId);
  await page.waitForFunction(id => {
    const state = window.Main?.session?.workspaceState || null;
    return state?.activeTabId === id
      && !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
  }, tabId, { timeout: 60_000 });
}

async function reloadAndAcceptBoxRecovery(page) {
  let recoveryAccepted = false;
  const handler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) {
      recoveryAccepted = true;
    }
    await dialog.accept();
  };
  page.on('dialog', handler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => recoveryAccepted, {
      timeout: 20_000,
      message: 'Box crash-recovery prompt should be accepted'
    }).toBe(true);
    await page.waitForFunction(() => {
      const state = window.Main?.session?.workspaceState || null;
      const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
      return active?.type === 'box'
        && !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    }, null, { timeout: 60_000 });
  } finally {
    page.off('dialog', handler);
  }
}

async function dragBoxWidthDense(page, dx, options = {}) {
  const steps = options.steps || 28;
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing box width handle');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const samples = [];
  await page.mouse.move(x, y);
  await page.mouse.down();
  samples.push({ phase: 'down', metrics: await page.evaluate(readBoxAxisMetrics) });
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(x + (dx * step) / steps, y);
    await page.waitForTimeout(options.stepDelayMs || 35);
    samples.push({ phase: `move-${step}`, metrics: await page.evaluate(readBoxAxisMetrics) });
  }
  await page.mouse.up();
  await page.waitForTimeout(options.endDelayMs || 500);
  samples.push({ phase: 'end', metrics: await page.evaluate(readBoxAxisMetrics) });
  return samples;
}

async function dragBoxHeightDense(page, dy, options = {}) {
  const steps = options.steps || 28;
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-horizontal').first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing box height handle');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const samples = [];
  await page.mouse.move(x, y);
  await page.mouse.down();
  samples.push({ phase: 'down', metrics: await page.evaluate(readBoxAxisMetrics) });
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(x, y + (dy * step) / steps);
    await page.waitForTimeout(options.stepDelayMs || 35);
    samples.push({ phase: `move-${step}`, metrics: await page.evaluate(readBoxAxisMetrics) });
  }
  await page.mouse.up();
  await page.waitForTimeout(options.endDelayMs || 500);
  samples.push({ phase: 'end', metrics: await page.evaluate(readBoxAxisMetrics) });
  return samples;
}

function summarize(samples) {
  const valid = samples.map(sample => sample.metrics).filter(Boolean);
  const axisValues = valid.map(metrics => metrics.yAxisPageX).filter(Number.isFinite);
  const titleValues = valid.map(metrics => metrics.yTitlePageX).filter(Number.isFinite);
  const drift = values => values.length
    ? Math.max(...values.map(value => Math.abs(value - values[0])))
    : null;
  return {
    base: valid[0] || null,
    maxYAxisPageXDrift: drift(axisValues),
    maxYTitlePageXDrift: drift(titleValues),
    yAxisPageX: axisValues,
    yTitlePageX: titleValues
  };
}

test('box pointer horizontal drag keeps y-axis line stable in page coordinates', async ({ page }, testInfo) => {
  const issues = registerIssueCollectors(page);
  await prepareBox(page);

  const samples = await dragBoxWidthDense(page, -150);
  const summary = summarize(samples);

  await testInfo.attach('box-horizontal-pointer-drag-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ summary, samples, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(summary.base).not.toBeNull();
  expect(summary.maxYAxisPageXDrift).toBeLessThanOrEqual(0.25);
  expect(issues.critical).toEqual([]);
});

test('box crash recovery preserves the horizontal-resize y-axis anchor and x-label reserve', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await prepareBox(page);

  const beforeRecovery = await page.evaluate(readBoxAxisMetrics);
  expect(beforeRecovery).not.toBeNull();
  expect(beforeRecovery.bottomViewportExtensionPx).toBeGreaterThan(0);
  expect(beforeRecovery.significanceViewportExtensionPx).toBe(0);

  const recovery = await seedRichBoxRecoverySnapshot(page);
  expect(recovery.bytes).toBeGreaterThan(0);
  await reloadAndAcceptBoxRecovery(page);
  await page.waitForFunction(expectedReserve => {
    const state = window.Components?.box?.__getState?.() || null;
    return Number(state?.graphGeometry?.reserves?.xLabelPx || 0) === Number(expectedReserve || 0);
  }, beforeRecovery.bottomViewportExtensionPx, { timeout: 20_000 });

  const recoveredBeforeDrag = await page.evaluate(readBoxAxisMetrics);
  const samples = await dragBoxWidthDense(page, -130, { steps: 24 });
  const summary = summarize(samples);
  const plotHeights = samples
    .map(sample => sample.metrics?.plotHeight)
    .filter(Number.isFinite);
  const maxPlotHeightDrift = plotHeights.length
    ? Math.max(...plotHeights.map(value => Math.abs(value - plotHeights[0])))
    : null;
  await testInfo.attach('box-recovery-horizontal-pointer-drag-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ beforeRecovery, recoveredBeforeDrag, recovery, summary, maxPlotHeightDrift, samples, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(recoveredBeforeDrag).not.toBeNull();
  expect(recoveredBeforeDrag.bottomViewportExtensionPx).toBe(beforeRecovery.bottomViewportExtensionPx);
  expect(recoveredBeforeDrag.significanceViewportExtensionPx).toBe(0);
  expect(recoveredBeforeDrag.plotHeight).toBeCloseTo(beforeRecovery.plotHeight, 0);
  expect(summary.maxYAxisPageXDrift).toBeLessThanOrEqual(0.25);
  if (Number.isFinite(summary.maxYTitlePageXDrift)) {
    expect(summary.maxYTitlePageXDrift).toBeLessThanOrEqual(0.5);
  }
  if (Number.isFinite(maxPlotHeightDrift)) {
    expect(maxPlotHeightDrift).toBeLessThanOrEqual(1);
  }
  expect(issues.critical).toEqual([]);
});

test('box manual reopen preserves the first horizontal-resize y-axis anchor', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await prepareBox(page);

  const beforeReopen = await page.evaluate(readBoxAxisMetrics);
  expect(beforeReopen).not.toBeNull();
  expect(beforeReopen.bottomViewportExtensionPx).toBeGreaterThan(0);

  const archive = await captureBoxWorkspaceArchive(page);
  expect(archive.size).toBeGreaterThan(0);
  expect(archive.payloadHasDerivedReserveAuthority).toBe(false);
  expect(archive.payloadUserFrameWidthPx).toBeGreaterThan(0);
  expect(archive.payloadUserFrameHeightPx).toBeGreaterThan(0);
  await reopenBoxWorkspaceArchive(page, archive.buffer);
  await page.waitForFunction(() => {
    const svg = document.querySelector('#boxPage:not([hidden]) #boxSvg');
    return !!svg && window.Components?.box?.isIdleForSnapshot?.() === true;
  }, null, { timeout: 20_000 });

  const reopenedBeforeDrag = await page.evaluate(readBoxAxisMetrics);
  const samples = await dragBoxWidthDense(page, -130, { steps: 24 });
  const summary = summarize(samples);
  const plotHeights = samples
    .map(sample => sample.metrics?.plotHeight)
    .filter(Number.isFinite);
  const maxPlotHeightDrift = plotHeights.length
    ? Math.max(...plotHeights.map(value => Math.abs(value - plotHeights[0])))
    : null;

  await testInfo.attach('box-reopen-horizontal-pointer-drag-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ beforeReopen, reopenedBeforeDrag, summary, maxPlotHeightDrift, samples, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(reopenedBeforeDrag).not.toBeNull();
  expect(reopenedBeforeDrag.bottomViewportExtensionPx).toBe(beforeReopen.bottomViewportExtensionPx);
  expect(reopenedBeforeDrag.significanceViewportExtensionPx).toBe(beforeReopen.significanceViewportExtensionPx);
  expect(reopenedBeforeDrag.plotHeight).toBeCloseTo(beforeReopen.plotHeight, 0);
  expect(summary.maxYAxisPageXDrift).toBeLessThanOrEqual(0.25);
  if (Number.isFinite(summary.maxYTitlePageXDrift)) {
    expect(summary.maxYTitlePageXDrift).toBeLessThanOrEqual(0.5);
  }
  if (Number.isFinite(maxPlotHeightDrift)) {
    expect(maxPlotHeightDrift).toBeLessThanOrEqual(1);
  }
  expect(issues.critical).toEqual([]);
});

test('box pointer vertical drag keeps y-axis line and y-title stable in page coordinates', async ({ page }, testInfo) => {
  const issues = registerIssueCollectors(page);
  await prepareBox(page);

  const samples = await dragBoxHeightDense(page, 150);
  const summary = summarize(samples);

  await testInfo.attach('box-vertical-pointer-drag-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ summary, samples, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(summary.base).not.toBeNull();
  expect(summary.maxYAxisPageXDrift).toBeLessThanOrEqual(0.25);
  if (Number.isFinite(summary.maxYTitlePageXDrift)) {
    expect(summary.maxYTitlePageXDrift).toBeLessThanOrEqual(0.5);
  }
  expect(issues.critical).toEqual([]);
});
