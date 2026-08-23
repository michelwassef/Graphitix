const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');
const PCA_COMPONENT = { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' };

async function waitForPcaMetric(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#pcaPage:not([hidden])');
    const svg = root?.querySelector('#pcaSvg');
    const xAxis = svg?.querySelector('[data-axis-line="1"][data-axis-key="x"]');
    const yAxis = svg?.querySelector('[data-axis-line="1"][data-axis-key="y"]');
    const xTicks = svg?.querySelectorAll('[data-axis-tick="1"][data-axis-key="x"][data-axis-value]')?.length || 0;
    const yTicks = svg?.querySelectorAll('[data-axis-tick="1"][data-axis-key="y"][data-axis-value]')?.length || 0;
    return !!xAxis && !!yAxis && xTicks >= 2 && yTicks >= 2 && !!xAxis.getScreenCTM?.() && !!yAxis.getScreenCTM?.();
  }, null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('#pcaPage:not([hidden])');
    const xAxis = root?.querySelector('#pcaXAxis');
    const yAxis = root?.querySelector('#pcaYAxis');
    if (!xAxis || !yAxis || xAxis.disabled || yAxis.disabled || xAxis.options.length < 2 || yAxis.options.length < 2) {
      return false;
    }
    const state = window.Main?.session?.workspaceState;
    const activeTab = (state?.tabs || []).find(tab => tab && tab.id === state?.activeTabId && tab.type === 'pca') || null;
    const selection = activeTab?.payload?.config?.axisSelection || null;
    if (selection) {
      if (selection.x != null && String(xAxis.value) !== String(selection.x)) return false;
      if (selection.y != null && String(yAxis.value) !== String(selection.y)) return false;
    }
    return true;
  }, null, { timeout: 60_000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function readCanonicalAxisSelection(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const activeTab = (state?.tabs || []).find(tab => tab && tab.id === state?.activeTabId && tab.type === 'pca') || null;
    const selection = activeTab?.payload?.config?.axisSelection || null;
    return selection ? {
      x: String(selection.x ?? ''),
      y: String(selection.y ?? ''),
      z: String(selection.z ?? '')
    } : null;
  });
}

async function readRenderedMetric(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#pcaPage:not([hidden])');
    const svgBox = root?.querySelector('#pcaGraphPanel .svgbox');
    const svg = root?.querySelector('#pcaSvg');
    const screenLength = line => {
      if (!line || !svg) return NaN;
      const ctm = line.getScreenCTM?.();
      if (!ctm) return NaN;
      const p1 = svg.createSVGPoint();
      p1.x = Number(line.getAttribute('x1')) || 0;
      p1.y = Number(line.getAttribute('y1')) || 0;
      const p2 = svg.createSVGPoint();
      p2.x = Number(line.getAttribute('x2')) || 0;
      p2.y = Number(line.getAttribute('y2')) || 0;
      const s1 = p1.matrixTransform(ctm);
      const s2 = p2.matrixTransform(ctm);
      return Math.hypot(s2.x - s1.x, s2.y - s1.y);
    };
    const axisMetric = axis => {
      const line = svg?.querySelector(`[data-axis-line="1"][data-axis-key="${axis}"]`);
      const min = Number(line?.getAttribute('data-axis-min'));
      const max = Number(line?.getAttribute('data-axis-max'));
      const span = Number.isFinite(min) && Number.isFinite(max) && max > min ? max - min : NaN;
      const pixels = screenLength(line);
      return {
        pixels,
        span,
        pixelsPerUnit: Number.isFinite(pixels) && Number.isFinite(span) && span > 0 ? pixels / span : NaN,
        min,
        max
      };
    };
    const x = axisMetric('x');
    const y = axisMetric('y');
    const boxRect = svgBox?.getBoundingClientRect?.();
    const equalAxisLengthsInput = root?.querySelector('.resizer-axeslength-checkbox--equal-scale');
    return {
      hasLockControl: !!root?.querySelector('.resizer-aspect-control, .resizer-aspect-checkbox'),
      hasAxesLengthControl: !!root?.querySelector('.resizer-axeslength-control'),
      axesLengthOptionCount: root?.querySelectorAll('.resizer-axeslength-checkbox')?.length || 0,
      equalAxisLengthsChecked: !!equalAxisLengthsInput?.checked,
      hasInvalidAxesLengthControl: !!root?.querySelector('.resizer-axeslength-checkbox--equal-length, .resizer-axeslength-checkbox--variance, #pcaVarianceAxisScale'),
      aspectLocked: svgBox?.dataset?.resizerAspectLocked || '',
      boxWidth: Number(boxRect?.width || 0),
      boxHeight: Number(boxRect?.height || 0),
      viewMode: svg?.dataset?.viewMode || '',
      preserveAspectRatio: svg?.getAttribute?.('preserveAspectRatio') || '',
      x,
      y,
      ratio: x.pixelsPerUnit / y.pixelsPerUnit,
      selectedX: root?.querySelector('#pcaXAxis')?.value || '',
      selectedY: root?.querySelector('#pcaYAxis')?.value || '',
      xAxisDisabled: root?.querySelector('#pcaXAxis')?.disabled !== false,
      yAxisDisabled: root?.querySelector('#pcaYAxis')?.disabled !== false,
      xAxisOptionCount: root?.querySelector('#pcaXAxis')?.options?.length || 0,
      yAxisOptionCount: root?.querySelector('#pcaYAxis')?.options?.length || 0
    };
  });
}

function expectMetric(state, label = 'PCA metric', options = {}) {
  const expectEqualAxisLengths = options.equalAxisLengths;
  expect(state.hasLockControl, `${label}: Lock ratio control must not exist`).toBe(false);
  expect(state.hasAxesLengthControl, `${label}: valid axes-length control must exist`).toBe(true);
  expect(state.axesLengthOptionCount, `${label}: only one PCA axes-length option must exist`).toBe(1);
  expect(state.hasInvalidAxesLengthControl, `${label}: unequal-scale/variance-scaled controls must not exist`).toBe(false);
  expect(state.aspectLocked, `${label}: shared resizer must remain internally constrained`).toBe('true');
  expect(state.xAxisDisabled, `${label}: X component selector must be usable`).toBe(false);
  expect(state.yAxisDisabled, `${label}: Y component selector must be usable`).toBe(false);
  expect(state.xAxisOptionCount, `${label}: X component selector must be populated`).toBeGreaterThanOrEqual(2);
  expect(state.yAxisOptionCount, `${label}: Y component selector must be populated`).toBeGreaterThanOrEqual(2);
  expect(Number.isFinite(state.x?.pixelsPerUnit), `${label}: X px/unit must be measurable`).toBe(true);
  expect(Number.isFinite(state.y?.pixelsPerUnit), `${label}: Y px/unit must be measurable`).toBe(true);
  expect(state.x.pixelsPerUnit, `${label}: X px/unit must be positive`).toBeGreaterThan(0);
  expect(state.y.pixelsPerUnit, `${label}: Y px/unit must be positive`).toBeGreaterThan(0);
  expect(Math.abs(state.ratio - 1), `${label}: physical X/Y coordinate-unit scale must match`).toBeLessThan(0.01);
  if (expectEqualAxisLengths !== undefined) {
    expect(state.equalAxisLengthsChecked, `${label}: equal-axis-lengths checkbox state`).toBe(expectEqualAxisLengths);
  }
  if (expectEqualAxisLengths === true) {
    expect(Math.abs(state.x.span - state.y.span), `${label}: displayed numerical spans must match`).toBeLessThan(1e-9);
    expect(Math.abs(state.x.pixels - state.y.pixels), `${label}: physical axis lengths must match`).toBeLessThan(1);
  }
}

async function setEqualAxisLengths(page, checked, options = {}) {
  await page.waitForSelector('#pcaPage:not([hidden]) .resizer-axeslength-checkbox--equal-scale', { timeout: 30_000, state: 'attached' });
  await page.evaluate(nextChecked => {
    const input = document.querySelector('#pcaPage:not([hidden]) .resizer-axeslength-checkbox--equal-scale');
    if (input && input.checked !== nextChecked) {
      input.checked = nextChecked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, checked);
  if (options.viewMode === '3d') {
    await page.waitForFunction(expected => {
      const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
      return svg?.dataset?.viewMode === '3d'
        && svg?.dataset?.pcaEqualAxisLengths === String(expected)
        && window.Components?.pca?.isIdleForSnapshot?.() === true;
    }, checked, { timeout: 60_000 });
    return;
  }
  await waitForPcaMetric(page);
}

async function openPcaExample(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, PCA_COMPONENT, { first: true });
  await clickExampleButtonIfPresent(page, 'pcaLoadExample');
  await waitForPcaMetric(page);
}

async function dragResize(page, selector, dx, dy) {
  const handle = page.locator(`#pcaPage:not([hidden]) #pcaGraphPanel .svgbox ${selector}`).first();
  await expect(handle).toHaveCount(1);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`Missing PCA resize handle ${selector}`);
  const x = box.x + Math.max(2, box.width / 2);
  const y = box.y + Math.max(2, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
  await waitForPcaMetric(page);
}

async function changeXAxisTickInterval(page) {
  const currentStep = await page.evaluate(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    const values = Array.from(svg?.querySelectorAll('[data-axis-tick="1"][data-axis-key="x"][data-axis-value]') || [])
      .map(node => Number(node.dataset.axisValue))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    return values.length >= 2 ? Math.abs(values[1] - values[0]) : NaN;
  });
  expect(Number.isFinite(currentStep)).toBe(true);
  const xAxis = page.locator('#pcaPage:not([hidden]) #pcaSvg [data-axis-line="1"][data-axis-key="x"]').first();
  await xAxis.click({ force: true });
  const panel = page.locator('.axis-controls-panel[data-open="1"]');
  await expect(panel).toBeVisible();
  const input = panel.locator('.axis-controls-panel__field', { hasText: 'Tick interval' }).locator('input').first();
  await expect(input).toBeVisible();
  await input.fill(String(currentStep * 2));
  await input.evaluate(node => node.dispatchEvent(new Event('change', { bubbles: true })));
  await input.blur();
  await waitForPcaMetric(page);
}

async function changePcaAxisLength(page, axisKey, deltaPx) {
  const axis = axisKey === 'y' ? 'y' : 'x';
  await page.evaluate(axisName => {
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    const activeRoot = document.querySelector('#pcaPage:not([hidden])');
    const lines = Array.from(activeRoot?.querySelectorAll(
      `#pcaSvg [data-axis-line="1"][data-axis-key="${axisName}"]`
    ) || []);
    const line = lines.find(node => !activeTabId || node.dataset.axisTabId === activeTabId) || null;
    if (!line) {
      throw new Error(`Active PCA ${axisName}-axis line not found`);
    }
    line.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }, axis);

  const panel = page.locator('.axis-controls-panel[data-open="1"]');
  await expect(panel).toBeVisible();
  const lengthField = panel.locator('.axis-controls-panel__field--length').first();
  const input = lengthField.locator('input[type="number"]').first();
  const preserveToggle = lengthField.locator('input[aria-label="preserve ratio"]').first();
  await expect(input).toBeEnabled();
  await expect(preserveToggle).toBeChecked();
  await expect(preserveToggle).toBeDisabled();

  const currentLength = Number(await input.inputValue());
  expect(Number.isFinite(currentLength)).toBe(true);
  const requestedLength = Math.max(20, currentLength + Number(deltaPx || 0));
  await page.evaluate(() => {
    const box = document.querySelector('#pcaPage:not([hidden]) #pcaGraphPanel .svgbox');
    window.__pcaAxisLengthResizeObserver?.disconnect?.();
    const samples = [];
    const push = rect => {
      const width = Number(rect?.width);
      const height = Number(rect?.height);
      if (!(width > 0) || !(height > 0)) return;
      const previous = samples[samples.length - 1];
      if (!previous || Math.abs(previous.width - width) > 0.5 || Math.abs(previous.height - height) > 0.5) {
        samples.push({ width, height });
      }
    };
    push(box?.getBoundingClientRect?.());
    const observer = new ResizeObserver(entries => {
      const entry = entries.find(candidate => candidate.target === box);
      if (entry) push(box.getBoundingClientRect());
    });
    if (box) observer.observe(box);
    window.__pcaAxisLengthResizeSamples = samples;
    window.__pcaAxisLengthResizeObserver = observer;
  });
  await input.fill(String(requestedLength));
  await input.evaluate(node => node.dispatchEvent(new Event('change', { bubbles: true })));
  await input.blur();

  const readAxisSettleState = () => page.evaluate(({ axisName, requested }) => {
    const root = document.querySelector('#pcaPage:not([hidden])');
    const svg = root?.querySelector('#pcaSvg');
    const axisLine = svg?.querySelector(`[data-axis-line="1"][data-axis-key="${axisName}"]`);
    const ctm = axisLine?.getScreenCTM?.();
    if (!svg || !axisLine || !ctm) {
      return { delta: Number.POSITIVE_INFINITY, actualLength: null, locked: false, forced: false, idle: false };
    }
    const point = (x, y) => {
      const p = svg.createSVGPoint();
      p.x = x;
      p.y = y;
      return p.matrixTransform(ctm);
    };
    const p1 = point(Number(axisLine.getAttribute('x1')) || 0, Number(axisLine.getAttribute('y1')) || 0);
    const p2 = point(Number(axisLine.getAttribute('x2')) || 0, Number(axisLine.getAttribute('y2')) || 0);
    const actualLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const box = root.querySelector('#pcaGraphPanel .svgbox');
    const state = box?.__sharedResizableBoxApi?.getState?.();
    return {
      delta: Math.abs(actualLength - requested),
      actualLength,
      locked: box?.dataset?.resizerAspectLocked === 'true',
      forced: state?.forcedAspectLocked === true,
      idle: window.Components?.pca?.isIdleForSnapshot?.() === true
    };
  }, { axisName: axis, requested: requestedLength });

  await expect.poll(async () => (await readAxisSettleState()).delta, {
    timeout: 60_000,
    message: `PCA ${axis}-axis must settle at the requested physical length`
  }).toBeLessThanOrEqual(1.5);
  await expect.poll(async () => (await readAxisSettleState()).idle, {
    timeout: 30_000,
    message: `PCA ${axis}-axis resize must become snapshot-idle`
  }).toBe(true);
  const settled = await readAxisSettleState();
  expect(settled.locked).toBe(true);
  expect(settled.forced).toBe(true);
  const resizeSamples = await page.evaluate(() => {
    window.__pcaAxisLengthResizeObserver?.disconnect?.();
    const samples = Array.isArray(window.__pcaAxisLengthResizeSamples)
      ? window.__pcaAxisLengthResizeSamples.slice()
      : [];
    delete window.__pcaAxisLengthResizeObserver;
    delete window.__pcaAxisLengthResizeSamples;
    return samples;
  });
  expect(resizeSamples.length, `PCA ${axis}-axis toolbar edit must perform one visible frame resize`).toBeLessThanOrEqual(2);

  await waitForPcaMetric(page);
  return requestedLength;
}

async function changeGraphTitleFontSize(page, sizePt) {
  const title = page.locator('#pcaPage:not([hidden]) #pcaSvg text[data-font-role="graphTitle"]').first();
  await expect(title).toBeVisible();
  await title.click({ force: true });
  const panel = page.locator('.font-controls-panel[data-open="1"]');
  await expect(panel).toBeVisible();
  const input = panel.locator('input.font-controls-panel__input--size').first();
  await expect(input).toBeVisible();
  await input.fill(String(sizePt));
  await input.evaluate(node => node.dispatchEvent(new Event('change', { bubbles: true })));
  await input.blur();
  await waitForPcaMetric(page);
}

async function moveLegend(page, dx = -35, dy = 18) {
  const target = page.locator('#pcaPage:not([hidden]) #pcaSvg [data-legend-viewport-content="true"] text').first();
  await expect(target).toBeVisible();
  const before = await page.locator('#pcaPage:not([hidden]) #pcaSvg [data-legend-viewport-content="true"]').getAttribute('transform');
  const box = await target.boundingBox();
  if (!box) throw new Error('Missing PCA legend target bounding box');
  const x = box.x + Math.max(2, box.width / 2);
  const y = box.y + Math.max(2, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await waitForPcaMetric(page);
  const after = await page.locator('#pcaPage:not([hidden]) #pcaSvg [data-legend-viewport-content="true"]').getAttribute('transform');
  expect(after).not.toBe(before);
}

async function getActiveTabId(page) {
  return page.evaluate(() => String(window.Main?.session?.workspaceState?.activeTabId || ''));
}

async function openSecondPcaTab(page) {
  const before = await page.evaluate(() => (window.Main?.session?.workspaceState?.tabs || [])
    .filter(tab => tab && !tab.isWelcome && tab.type === 'pca')
    .map(tab => String(tab.id || '')));
  await page.evaluate(async () => {
    const tabs = window.Main?.tabs;
    const addResult = tabs?.handleAddTabClick?.();
    if (addResult?.then) await addResult;
    const result = tabs?.handleGraphSelection?.('pca', {
      forceBlankWorkspace: true,
      skipDuplicatePrompt: true,
      disableDuplicatePrompt: true,
      reason: 'e2e-pca-metric-second-tab'
    });
    if (result?.then) await result;
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const empty = document.getElementById('duplicateEmpty');
    if (prompt && empty && !empty.disabled) empty.click();
  });
  await page.waitForSelector('#pcaPage:not([hidden])', { timeout: 30_000 });
  const after = await page.evaluate(() => (window.Main?.session?.workspaceState?.tabs || [])
    .filter(tab => tab && !tab.isWelcome && tab.type === 'pca')
    .map(tab => String(tab.id || '')));
  return after.find(id => !before.includes(id)) || after[after.length - 1] || '';
}

async function activateTab(page, tabId) {
  await page.evaluate(async id => {
    const result = window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-pca-metric-activate' });
    if (result?.then) await result;
  }, tabId);
  await page.waitForFunction(id => String(window.Main?.session?.workspaceState?.activeTabId || '') === String(id), tabId, { timeout: 30_000 });
}

async function findPcaTabByAxisSelection(page, selection) {
  return page.evaluate(expected => {
    const tabs = (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab && tab.type === 'pca');
    const match = tabs.find(tab => {
      const axisSelection = tab?.payload?.config?.axisSelection || null;
      return axisSelection
        && String(axisSelection.x ?? '') === String(expected.x ?? '')
        && String(axisSelection.y ?? '') === String(expected.y ?? '');
    });
    return match?.id || '';
  }, selection || {});
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async stem => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-pca-metric-archive'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return { fileName: `${stem}.graph`, base64: btoa(binary) };
  }, fileStem);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function seedRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const openDb = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const context = window.Main.tabs.getSessionActionsContext();
    const graphTabs = (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab && !tab.isWelcome && tab.type);
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'recovery-interval',
      useWorker: true
    });
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        meta: {
          app: 'Graphitix', kind: 'recovery', version: 1, savedAt: new Date().toISOString(), updatedAt: Date.now(),
          reason: 'recovery-interval', dirty: true, hasData: true, tabCount: graphTabs.length,
          fileName: 'workspace.graph', fileScope: 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  });
}

test('PCA axis toolbar changes physical X and Y lengths without breaking metric geometry', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await installLocalCdnOverrides(page);
  await openPcaExample(page);

  const initial = await readRenderedMetric(page);
  expectMetric(initial, 'axis-toolbar initial', { equalAxisLengths: false });

  const requestedX = await changePcaAxisLength(page, 'x', 60);
  const afterX = await readRenderedMetric(page);
  expectMetric(afterX, 'axis-toolbar X resize', { equalAxisLengths: false });
  expect(Math.abs(afterX.x.pixels - requestedX)).toBeLessThanOrEqual(1.5);
  expect(afterX.x.pixels).toBeGreaterThan(initial.x.pixels + 40);
  expect(afterX.y.pixels).toBeGreaterThan(initial.y.pixels + 15);
  expect(afterX.boxWidth).toBeGreaterThan(initial.boxWidth + 15);
  expect(afterX.boxHeight).toBeGreaterThan(initial.boxHeight + 15);

  const requestedY = await changePcaAxisLength(page, 'y', -20);
  const afterY = await readRenderedMetric(page);
  expectMetric(afterY, 'axis-toolbar Y resize', { equalAxisLengths: false });
  expect(Math.abs(afterY.y.pixels - requestedY)).toBeLessThanOrEqual(1.5);
  expect(afterY.x.pixels).toBeLessThan(afterX.x.pixels - 15);
  expect(afterY.y.pixels).toBeLessThan(afterX.y.pixels - 10);
  expect(afterY.boxWidth).toBeLessThan(afterX.boxWidth - 10);
  expect(afterY.boxHeight).toBeLessThan(afterX.boxHeight - 10);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});

test('PCA 2D preserves equal physical scale per displayed coordinate unit through user layout changes', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await installLocalCdnOverrides(page);
  await openPcaExample(page);

  const initial = await readRenderedMetric(page);
  expectMetric(initial, 'initial', { equalAxisLengths: false });

  await dragResize(page, '.resizer-horizontal', 0, 70);
  const verticalResize = await readRenderedMetric(page);
  expectMetric(verticalResize, 'vertical resize', { equalAxisLengths: false });
  expect(verticalResize.boxHeight).toBeGreaterThan(initial.boxHeight + 20);
  expect(verticalResize.boxWidth).toBeGreaterThan(initial.boxWidth + 20);

  await dragResize(page, '.resizer-vertical', 70, 0);
  expectMetric(await readRenderedMetric(page), 'horizontal resize', { equalAxisLengths: false });

  await setEqualAxisLengths(page, true);
  expectMetric(await readRenderedMetric(page), 'equal-axis-length presentation', { equalAxisLengths: true });
  await setEqualAxisLengths(page, false);
  expectMetric(await readRenderedMetric(page), 'natural-span presentation', { equalAxisLengths: false });

  await page.locator('#pcaXAxis').selectOption('2');
  await page.locator('#pcaYAxis').selectOption('3');
  await waitForPcaMetric(page);
  const selectedAxes = await readRenderedMetric(page);
  expect(selectedAxes.selectedX).toBe('2');
  expect(selectedAxes.selectedY).toBe('3');
  expectMetric(selectedAxes, 'axis selection', { equalAxisLengths: false });

  await changeXAxisTickInterval(page);
  expectMetric(await readRenderedMetric(page), 'manual tick interval', { equalAxisLengths: false });

  await moveLegend(page);
  expectMetric(await readRenderedMetric(page), 'legend movement', { equalAxisLengths: false });

  await changeGraphTitleFontSize(page, 18);
  expectMetric(await readRenderedMetric(page), 'font/layout change', { equalAxisLengths: false });

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});

test('PCA standardization is owner-scoped and visibly recomputes the raw example projection', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await installLocalCdnOverrides(page);
  await openPcaExample(page);

  const readStandardizationState = () => page.evaluate(() => {
    const component = window.Components?.pca;
    const session = component?.__testHooks?.getSession?.();
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    const pointSignature = Array.from(svg?.querySelectorAll?.('[data-pca-point-interaction]') || [])
      .map(node => {
        try {
          const data = JSON.parse(node.getAttribute('data-pca-point-interaction') || '{}');
          return [Number(data.x).toFixed(6), Number(data.y).toFixed(6)].join(',');
        } catch (_err) {
          return '';
        }
      })
      .filter(Boolean)
      .join('|');
    return {
      checked: !!document.querySelector('#pcaPage:not([hidden]) #pcaStandardizeVariables')?.checked,
      payloadValue: component?.getPayload?.()?.config?.standardizeVariables,
      ownerValue: session?.state?.state?.controls?.standardizeVariables,
      xAxisLabel: document.querySelector('#pcaPage:not([hidden]) #pcaXAxis option:checked')?.textContent || '',
      pointSignature
    };
  });

  const before = await readStandardizationState();
  expect(before.checked).toBe(false);
  expect(before.payloadValue).toBe(false);
  expect(before.ownerValue).toBe(false);
  expect(before.pointSignature).not.toBe('');
  expectMetric(await readRenderedMetric(page), 'unstandardized raw example', { equalAxisLengths: false });

  await page.locator('#pcaPage:not([hidden]) #pcaStandardizeVariables').check();
  await page.waitForFunction(previousSignature => {
    const component = window.Components?.pca;
    const session = component?.__testHooks?.getSession?.();
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    const pointSignature = Array.from(svg?.querySelectorAll?.('[data-pca-point-interaction]') || [])
      .map(node => {
        try {
          const data = JSON.parse(node.getAttribute('data-pca-point-interaction') || '{}');
          return [Number(data.x).toFixed(6), Number(data.y).toFixed(6)].join(',');
        } catch (_err) {
          return '';
        }
      })
      .filter(Boolean)
      .join('|');
    return component?.getPayload?.()?.config?.standardizeVariables === true
      && session?.state?.state?.controls?.standardizeVariables === true
      && component?.isIdleForSnapshot?.() === true
      && pointSignature
      && pointSignature !== previousSignature;
  }, before.pointSignature, { timeout: 60_000 });

  const after = await readStandardizationState();
  expect(after.checked).toBe(true);
  expect(after.payloadValue).toBe(true);
  expect(after.ownerValue).toBe(true);
  expect(after.pointSignature).not.toBe(before.pointSignature);
  expect(after.xAxisLabel).not.toBe(before.xAxisLabel);
  expectMetric(await readRenderedMetric(page), 'standardized raw example', { equalAxisLengths: false });
  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});

test('PCA metric geometry survives same-component tab switching and file reopen', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await installLocalCdnOverrides(page);
  await openPcaExample(page);

  await page.locator('#pcaXAxis').selectOption('2');
  await page.locator('#pcaYAxis').selectOption('3');
  await waitForPcaMetric(page);
  await changeXAxisTickInterval(page);
  await setEqualAxisLengths(page, false);
  const originalTabId = await getActiveTabId(page);
  const before = await readRenderedMetric(page);
  expectMetric(before, 'before tab switch', { equalAxisLengths: false });
  const canonicalBeforeSwitch = await readCanonicalAxisSelection(page);
  expect(canonicalBeforeSwitch?.x).toBe(before.selectedX);
  expect(canonicalBeforeSwitch?.y).toBe(before.selectedY);

  const secondTabId = await openSecondPcaTab(page);
  expect(secondTabId).not.toBe(originalTabId);
  await activateTab(page, originalTabId);
  await waitForPcaMetric(page);
  const afterSwitch = await readRenderedMetric(page);
  expectMetric(afterSwitch, 'after same-component tab switch', { equalAxisLengths: false });
  expect(afterSwitch.selectedX).toBe(before.selectedX);
  expect(afterSwitch.selectedY).toBe(before.selectedY);

  const archivePath = await captureWorkspaceArchive(page, 'pca-metric-geometry');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  const reopenedTargetId = await findPcaTabByAxisSelection(page, { x: before.selectedX, y: before.selectedY });
  expect(reopenedTargetId, 'reopened archive must contain the PCA tab with the persisted PC selection').toBeTruthy();
  await activateTab(page, reopenedTargetId);
  await page.waitForSelector('#pcaPage:not([hidden])', { timeout: 30_000 });
  await waitForPcaMetric(page);
  const reopened = await readRenderedMetric(page);
  expectMetric(reopened, 'after file reopen', { equalAxisLengths: false });
  expect(reopened.selectedX).toBe(before.selectedX);
  expect(reopened.selectedY).toBe(before.selectedY);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});

test('PCA metric geometry survives crash-recovery restore', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await installLocalCdnOverrides(page);
  await openPcaExample(page);
  await page.locator('#pcaXAxis').selectOption('2');
  await page.locator('#pcaYAxis').selectOption('3');
  await waitForPcaMetric(page);
  await setEqualAxisLengths(page, false);
  const before = await readRenderedMetric(page);
  expectMetric(before, 'before recovery', { equalAxisLengths: false });
  const canonicalBeforeRecovery = await readCanonicalAxisSelection(page);
  expect(canonicalBeforeRecovery?.x).toBe(before.selectedX);
  expect(canonicalBeforeRecovery?.y).toBe(before.selectedY);
  await seedRecoverySnapshot(page);

  const dialogHandler = async dialog => { await dialog.accept(); };
  page.on('dialog', dialogHandler);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForDocumentOpenComplete(page);
  page.off('dialog', dialogHandler);
  const recoveredTargetId = await findPcaTabByAxisSelection(page, { x: before.selectedX, y: before.selectedY });
  expect(recoveredTargetId, 'recovery snapshot must contain the PCA tab with the persisted PC selection').toBeTruthy();
  await activateTab(page, recoveredTargetId);
  await page.waitForSelector('#pcaPage:not([hidden])', { timeout: 45_000 });
  await waitForPcaMetric(page);
  const recovered = await readRenderedMetric(page);
  expectMetric(recovered, 'after recovery', { equalAxisLengths: false });
  expect(recovered.selectedX).toBe(before.selectedX);
  expect(recovered.selectedY).toBe(before.selectedY);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});

test('PCA keeps one metric-safe axis-length presentation across methods and 3D', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await openPcaExample(page);

  await expect(page.locator('#pcaStandardizeVariables')).toHaveCount(1);
  await expect(page.locator('#pcaScale')).toHaveCount(0);
  await expect(page.locator('#pcaStandardizeVariablesControl')).toContainText('Standardize variables');

  for (const method of ['pca', 'mds', 'tsne', 'umap']) {
    await page.locator('#pcaMethod').selectOption(method);
    await page.waitForFunction(expectedMethod => {
      const state = window.Components?.pca?.__state;
      const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
      return state?.controls?.method === expectedMethod
        && document.querySelector('#pcaPage:not([hidden]) #pcaMethod')?.value === expectedMethod
        && svg?.dataset?.viewMode === '2d'
        && window.Components?.pca?.isIdleForSnapshot?.() === true;
    }, method, { timeout: 90_000 });
    await waitForPcaMetric(page);
    expectMetric(await readRenderedMetric(page), `${method} 2D metric`, { equalAxisLengths: false });
    await expect(page.locator('#pcaPage:not([hidden]) #pcaVarianceAxisScale')).toHaveCount(0);
    await expect(page.locator('#pcaPage:not([hidden]) .resizer-axeslength-checkbox--equal-length')).toHaveCount(0);
    await expect(page.locator('#pcaPage:not([hidden]) .resizer-axeslength-checkbox--variance')).toHaveCount(0);
    await expect(page.locator('#pcaPage:not([hidden]) .resizer-aspect-control')).toHaveCount(0);
  }

  await page.locator('#pcaMethod').selectOption('pca');
  await setEqualAxisLengths(page, true);
  await page.locator('#pcaViewMode').selectOption('3d');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    return svg?.dataset?.viewMode === '3d'
      && svg?.dataset?.pcaEqualAxisLengths === 'true'
      && window.Components?.pca?.isIdleForSnapshot?.() === true;
  }, null, { timeout: 60_000 });

  const read3dState = () => page.evaluate(() => {
    const root = document.querySelector('#pcaPage:not([hidden])');
    const box = root?.querySelector('#pcaGraphPanel .svgbox');
    const svg = root?.querySelector('#pcaSvg');
    box?.__sharedResizableBoxApi?.setAspectLocked?.(false, { reason: 'e2e-attempt-pca-unlock' });
    const model = window.Components?.pca?.__testHooks?.getSession?.()?.cache?.pca3dRotationModel || null;
    const axisSpans = model?.axisRanges
      ? ['x', 'y', 'z'].map(axis => Number(model.axisRanges[axis]?.max) - Number(model.axisRanges[axis]?.min))
      : [];
    const firstPoint = model?.points?.[0] || null;
    return {
      aspectLocked: box?.dataset?.resizerAspectLocked || '',
      hasLockControl: !!root?.querySelector('.resizer-aspect-control, .resizer-aspect-checkbox'),
      equalAxisLengthsChecked: !!root?.querySelector('.resizer-axeslength-checkbox--equal-scale')?.checked,
      preserveAspectRatio: svg?.getAttribute?.('preserveAspectRatio') || '',
      equalAxisLengthsDataset: svg?.dataset?.pcaEqualAxisLengths || '',
      axisSpans,
      firstRenderedPoint: firstPoint?.point || null,
      firstOriginalPoint: firstPoint?.tooltip
        ? { x: firstPoint.tooltip.x, y: firstPoint.tooltip.y, z: firstPoint.tooltip.z }
        : null,
      retiredStateKeys: ['equalScaleAxes', 'equalAxes', 'axesVarianceScaled', 'forcedLockRatioPrevious']
        .filter(key => Object.prototype.hasOwnProperty.call(window.Components?.pca?.__state || {}, key))
    };
  });

  const equal3d = await read3dState();
  expect(equal3d.aspectLocked).toBe('true');
  expect(equal3d.hasLockControl).toBe(false);
  expect(equal3d.equalAxisLengthsChecked).toBe(true);
  expect(equal3d.equalAxisLengthsDataset).toBe('true');
  expect(equal3d.preserveAspectRatio).toBe('xMidYMid meet');
  expect(equal3d.axisSpans).toHaveLength(3);
  expect(Math.max(...equal3d.axisSpans) - Math.min(...equal3d.axisSpans)).toBeLessThan(1e-9);
  expect(equal3d.firstRenderedPoint).toMatchObject(equal3d.firstOriginalPoint);
  expect(equal3d.retiredStateKeys).toEqual([]);

  await setEqualAxisLengths(page, false, { viewMode: '3d' });
  const natural3d = await read3dState();
  expect(natural3d.aspectLocked).toBe('true');
  expect(natural3d.equalAxisLengthsChecked).toBe(false);
  expect(natural3d.equalAxisLengthsDataset).toBe('false');
  expect(natural3d.axisSpans).toHaveLength(3);
  natural3d.axisSpans.forEach(span => expect(span).toBeGreaterThan(0));
  expect(natural3d.firstRenderedPoint).toMatchObject(natural3d.firstOriginalPoint);
  expect(natural3d.retiredStateKeys).toEqual([]);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
