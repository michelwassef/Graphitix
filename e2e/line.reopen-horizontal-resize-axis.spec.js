const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readLineAxisMetrics() {
  const root = document.querySelector('#linePage:not([hidden])') || document;
  const svgBox = root.querySelector('#lineGraphPanel .svgbox');
  const svgs = Array.from(root.querySelectorAll('#linePlot svg'));
  const svg = svgs.filter(node => {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  }).at(-1) || null;
  if (!svg || !svgBox) {
    return null;
  }

  const verticalAxes = Array.from(svg.querySelectorAll('line[data-axis-control="1"]'))
    .map(line => {
      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      if (![x1, x2, y1, y2].every(Number.isFinite)) {
        return null;
      }
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);
      const stroke = String(line.getAttribute('stroke') || '').toLowerCase();
      if (stroke === 'transparent' || dx > 0.25 || dy <= 10) {
        return null;
      }
      const rect = line.getBoundingClientRect();
      return {
        svgX: x1,
        length: dy,
        pageX: ((rect.left + rect.right) / 2) + window.scrollX
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.length - a.length || a.svgX - b.svgX);
  const yAxis = verticalAxes[0] || null;
  const yTitle = Array.from(svg.querySelectorAll('text'))
    .filter(node => String(node.textContent || '').trim() && /rotate/i.test(String(node.getAttribute('transform') || '')))
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  const titleRect = yTitle?.getBoundingClientRect?.() || null;
  const boxRect = svgBox.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);

  return {
    boxWidth: boxRect.width,
    svgWidth: svgRect.width,
    viewBox: viewBox.length === 4 && viewBox.every(Number.isFinite) ? viewBox : null,
    preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
    yAxisPageX: yAxis?.pageX ?? null,
    yAxisSvgX: yAxis?.svgX ?? null,
    yTitlePageX: titleRect ? ((titleRect.left + titleRect.right) / 2) + window.scrollX : null,
    lockAxis: svgBox.dataset.resizerAxisViewportLockAxis || null,
    stableMinY: Number(svgBox.dataset.graphViewportStableMinY),
    stableHeight: Number(svgBox.dataset.graphViewportStableHeight),
    stableRenderedWidth: Number(svgBox.dataset.graphViewportStableRenderedWidth)
  };
}

function summarizeHorizontalDrag(samples) {
  const metrics = samples.map(sample => sample.metrics).filter(Boolean);
  const first = metrics[0] || null;
  const axisValues = metrics.map(item => item.yAxisPageX).filter(Number.isFinite);
  const titleValues = metrics.map(item => item.yTitlePageX).filter(Number.isFinite);
  return {
    first,
    last: metrics.at(-1) || null,
    maxYAxisPageXDrift: axisValues.length && first && Number.isFinite(first.yAxisPageX)
      ? Math.max(...axisValues.map(value => Math.abs(value - first.yAxisPageX)))
      : null,
    maxYTitlePageXDrift: titleValues.length && first && Number.isFinite(first.yTitlePageX)
      ? Math.max(...titleValues.map(value => Math.abs(value - first.yTitlePageX)))
      : null
  };
}

async function prepareLine(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#linePage:not([hidden]) #linePlot svg'), null, { timeout: 30_000 });
  await page.evaluate(() => {
    const checkbox = document.querySelector('#lineGraphPanel .resizer-aspect-checkbox');
    if (checkbox?.checked) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForFunction(() => {
    const box = document.querySelector('#lineGraphPanel .svgbox');
    return !!box && box.dataset.resizerAspectLocked === 'false'
      && window.Components?.line?.isIdleForSnapshot?.() === true;
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(400);
}

async function captureLineWorkspaceArchive(page) {
  const archive = await page.evaluate(async () => {
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-line-horizontal-resize-reopen'
    });
    if (!blob) {
      throw new Error('Line workspace archive was not created.');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return { base64: btoa(binary), size: blob.size };
  });
  return {
    buffer: Buffer.from(archive.base64, 'base64'),
    size: archive.size
  };
}

async function reopenLineWorkspaceArchive(page, archiveBuffer) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles({
    name: 'line-horizontal-resize-reopen.graph',
    mimeType: 'application/octet-stream',
    buffer: archiveBuffer
  });
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState || null;
    return Array.isArray(state?.tabs) && state.tabs.some(tab => tab?.type === 'line' && !tab?.isWelcome);
  }, null, { timeout: 60_000 });
  const tabId = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    return (state.tabs || []).find(tab => tab?.type === 'line' && !tab?.isWelcome)?.id || null;
  });
  if (!tabId) {
    throw new Error('Line tab was not found after manual archive reopen.');
  }
  await page.evaluate(async id => {
    const activateTab = window.Main?.tabs?.activateTab;
    if (typeof activateTab !== 'function') {
      return;
    }
    const result = activateTab(id, { reason: 'e2e-line-horizontal-resize-reopen-activate' });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, tabId);
  await page.waitForFunction(id => {
    const state = window.Main?.session?.workspaceState || null;
    return state?.activeTabId === id
      && !!document.querySelector('#linePage:not([hidden]) #linePlot svg')
      && window.Components?.line?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 60_000 });
}

async function seedLineRecoverySnapshot(page) {
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
      reason: 'e2e-line-horizontal-resize-recovery',
      useWorker: true
    });
    if (!blob) {
      db.close();
      throw new Error('Line recovery archive was not created.');
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
          reason: 'e2e-line-horizontal-resize-recovery',
          dirty: true,
          hasData: true,
          tabCount: graphTabs.length,
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

async function reloadAndAcceptLineRecovery(page) {
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
      message: 'Line crash-recovery prompt should be accepted'
    }).toBe(true);
    await page.waitForFunction(() => {
      const state = window.Main?.session?.workspaceState || null;
      const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
      return active?.type === 'line'
        && !!document.querySelector('#linePage:not([hidden]) #linePlot svg')
        && window.Components?.line?.isIdleForSnapshot?.() === true;
    }, null, { timeout: 60_000 });
  } finally {
    page.off('dialog', handler);
  }
}

async function dragLineWidthDense(page, dx, options = {}) {
  const steps = options.steps || 24;
  const handle = page.locator('#lineGraphPanel .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing Line horizontal resize handle.');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const samples = [];
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  samples.push({ phase: 'down', metrics: await page.evaluate(readLineAxisMetrics) });
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(startX + (dx * step) / steps, startY);
    await page.waitForTimeout(options.stepDelayMs || 35);
    samples.push({ phase: `move-${step}`, metrics: await page.evaluate(readLineAxisMetrics) });
  }
  await page.mouse.up();
  await page.waitForTimeout(options.endDelayMs || 500);
  samples.push({ phase: 'end', metrics: await page.evaluate(readLineAxisMetrics) });
  return samples;
}

function assertStableHorizontalAxis(summary) {
  expect(summary.first).not.toBeNull();
  expect(summary.last).not.toBeNull();
  expect(summary.last.boxWidth).toBeLessThan(summary.first.boxWidth - 50);
  expect(summary.maxYAxisPageXDrift).toBeLessThanOrEqual(0.5);
  if (Number.isFinite(summary.maxYTitlePageXDrift)) {
    expect(summary.maxYTitlePageXDrift).toBeLessThanOrEqual(0.75);
  }
}

test('Line manual reopen preserves the y-axis anchor throughout horizontal resize', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await prepareLine(page);

  const beforeReopen = await page.evaluate(readLineAxisMetrics);
  const archive = await captureLineWorkspaceArchive(page);
  expect(archive.size).toBeGreaterThan(0);
  await reopenLineWorkspaceArchive(page, archive.buffer);

  const reopenedBeforeDrag = await page.evaluate(readLineAxisMetrics);
  const samples = await dragLineWidthDense(page, -120);
  const summary = summarizeHorizontalDrag(samples);
  await testInfo.attach('line-reopen-horizontal-resize-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ beforeReopen, reopenedBeforeDrag, summary, samples, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(reopenedBeforeDrag).not.toBeNull();
  assertStableHorizontalAxis(summary);
  expect(issues.critical).toEqual([]);
});

test('Line crash recovery preserves the y-axis anchor throughout horizontal resize', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await prepareLine(page);

  const recovery = await seedLineRecoverySnapshot(page);
  expect(recovery.bytes).toBeGreaterThan(0);
  await reloadAndAcceptLineRecovery(page);

  const recoveredBeforeDrag = await page.evaluate(readLineAxisMetrics);
  const samples = await dragLineWidthDense(page, -120);
  const summary = summarizeHorizontalDrag(samples);
  await testInfo.attach('line-recovery-horizontal-resize-axis.metrics.json', {
    body: Buffer.from(JSON.stringify({ recovery, recoveredBeforeDrag, summary, samples, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(recoveredBeforeDrag).not.toBeNull();
  assertStableHorizontalAxis(summary);
  expect(issues.critical).toEqual([]);
});
