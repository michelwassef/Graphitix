/**
 * Real-browser regression guard for PCA stats restoration.
 *
 * The PCA stats panel (scree plot, biplot, summary, eigen table, loadings) is derived
 * from PcaSession results state and must reappear after every restore path. The render cache used to
 * snapshot the stats-panel DOM and replay it on restore, which orphaned the component's
 * cached node references and silently dropped the scree plot and biplot (file reopen lost
 * both; recovery lost the biplot). The fix makes the render cache carry only the graph and
 * rebuilds the stats panel from data on restore.
 *
 * jsdom cannot host this assertion (no layout / getBoundingClientRect == 0), so the scree
 * SVG and biplot SVG presence must be checked in a real browser.
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

// Presence of each PCA stats sub-panel, read straight off the live DOM.
function pcaStatsPresenceInPage() {
  const screePlot = document.getElementById('pcaScreePlot');
  const biplotCard = document.getElementById('pcaBiplotCard');
  const biplotSvg = document.getElementById('pcaBiplotSvg');
  const eigenWrap = document.getElementById('pcaEigenTableWrapper');
  const summary = document.getElementById('pcaStatsSummary');
  return {
    screeSvgs: screePlot ? screePlot.querySelectorAll('svg').length : 0,
    biplotCardVisible: !!biplotCard && !biplotCard.hidden,
    biplotVectorLines: biplotSvg ? biplotSvg.querySelectorAll('line').length : 0,
    eigenRows: eigenWrap ? eigenWrap.querySelectorAll('tr').length : 0,
    summaryHasText: !!summary && (summary.textContent || '').trim().length > 0,
    plotSvg: !!document.querySelector('#pcaPlot svg')
  };
}

function pcaLegendRecoveryStateInPage() {
  const svg = document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg');
  const legend = svg?.querySelector?.('[data-legend-viewport-content="true"]') || null;
  const svgRect = svg?.getBoundingClientRect?.() || null;
  const legendRect = legend?.getBoundingClientRect?.() || null;
  const layeredRoot = svg?.closest?.('.pca-layered-plot') || null;
  const plot = svg?.closest?.('#pcaPlot') || null;
  const textVisibility = Array.from(legend?.querySelectorAll?.('text') || []).map(node => {
    const rect = node.getBoundingClientRect();
    let clipLeft = -Infinity;
    let clipRight = Infinity;
    let clipTop = -Infinity;
    let clipBottom = Infinity;
    let ancestor = node.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const clipsX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX);
      const clipsY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY);
      if (clipsX || clipsY) {
        const ancestorRect = ancestor.getBoundingClientRect();
        if (clipsX) {
          clipLeft = Math.max(clipLeft, ancestorRect.left);
          clipRight = Math.min(clipRight, ancestorRect.right);
        }
        if (clipsY) {
          clipTop = Math.max(clipTop, ancestorRect.top);
          clipBottom = Math.min(clipBottom, ancestorRect.bottom);
        }
      }
      if (ancestor === plot) break;
      ancestor = ancestor.parentElement;
    }
    return {
      text: node.textContent || '',
      visible: rect.left >= clipLeft - 1 && rect.right <= clipRight + 1
        && rect.top >= clipTop - 1 && rect.bottom <= clipBottom + 1,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      clip: { left: clipLeft, right: clipRight, top: clipTop, bottom: clipBottom }
    };
  });
  return {
    hasSvg: !!svg,
    hasLegend: !!legend,
    fullyVisible: !!svgRect && !!legendRect
      && legendRect.left >= svgRect.left - 1
      && legendRect.right <= svgRect.right + 1
      && legendRect.top >= svgRect.top - 1
      && legendRect.bottom <= svgRect.bottom + 1
      && textVisibility.every(entry => entry.visible),
    managedDrag: window.Shared?.isManagedLegendDragTarget?.(legend) === true,
    viewBox: svg?.getAttribute?.('viewBox') || null,
    svgWidth: svg?.getAttribute?.('width') || null,
    baseWidth: svg?.dataset?.legendBaseWidth || null,
    reserveWidth: svg?.dataset?.legendReserveWidth || null,
    contentReserveRight: svg?.dataset?.graphContentReserveRight || null,
    labels: Array.from(legend?.querySelectorAll?.('text') || []).map(node => node.textContent || ''),
    textVisibility,
    svgOverflow: svg ? getComputedStyle(svg).overflow : null,
    layeredOverflow: layeredRoot ? getComputedStyle(layeredRoot).overflow : null,
    plotOverflow: plot ? getComputedStyle(plot).overflow : null,
    layeredWidth: layeredRoot?.getBoundingClientRect?.().width || 0,
    plotWidth: plot?.getBoundingClientRect?.().width || 0,
    svgRect: svgRect ? { left: svgRect.left, top: svgRect.top, right: svgRect.right, bottom: svgRect.bottom, width: svgRect.width, height: svgRect.height } : null,
    legendRect: legendRect ? { left: legendRect.left, top: legendRect.top, right: legendRect.right, bottom: legendRect.bottom, width: legendRect.width, height: legendRect.height } : null
  };
}

async function dragRecoveredPcaLegend(page, deltaX = -45, deltaY = 20) {
  return page.evaluate(async ({ deltaX, deltaY }) => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg');
    const legend = svg?.querySelector?.('[data-legend-viewport-content="true"]') || null;
    const svgBox = svg?.closest?.('.svgbox') || null;
    if (!svg || !legend || !svgBox) return { error: 'missing recovered PCA legend' };
    const beforeBox = svgBox.getBoundingClientRect();
    const beforeTransform = legend.getAttribute('transform');
    const beforeViewBox = svg.getAttribute('viewBox');
    const target = legend.querySelector('[data-legend-key], text, path, rect, circle') || legend;
    const targetRect = target.getBoundingClientRect();
    const x = targetRect.left + Math.max(1, targetRect.width / 2);
    const y = targetRect.top + Math.max(1, targetRect.height / 2);
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 71, button: 0, isPrimary: true, clientX: x, clientY: y }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 71, isPrimary: true, clientX: x + deltaX, clientY: y + deltaY }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 71, button: 0, isPrimary: true, clientX: x + deltaX, clientY: y + deltaY }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const currentSvg = document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg');
    const currentLegend = currentSvg?.querySelector?.('[data-legend-viewport-content="true"]') || null;
    const afterBox = svgBox.getBoundingClientRect();
    return {
      sameSvg: currentSvg === svg,
      moved: currentLegend?.getAttribute('transform') !== beforeTransform,
      beforeViewBox,
      afterViewBox: currentSvg?.getAttribute('viewBox') || null,
      beforeWidth: beforeBox.width,
      afterWidth: afterBox.width,
      beforeHeight: beforeBox.height,
      afterHeight: afterBox.height
    };
  }, { deltaX, deltaY });
}

async function expectFullPcaStats(page, label) {
  await expect
    .poll(async () => (await page.evaluate(pcaStatsPresenceInPage)).screeSvgs, {
      timeout: 15_000,
      message: `${label}: scree plot SVG should be present`
    })
    .toBeGreaterThan(0);
  const state = await page.evaluate(pcaStatsPresenceInPage);
  expect(state.biplotCardVisible, `${label}: biplot card should be visible`).toBe(true);
  expect(state.biplotVectorLines, `${label}: biplot should draw loading vectors`).toBeGreaterThan(0);
  expect(state.eigenRows, `${label}: eigen table should have rows`).toBeGreaterThan(0);
  expect(state.summaryHasText, `${label}: summary panel should have text`).toBe(true);
  expect(state.plotSvg, `${label}: main plot SVG should be present`).toBe(true);
}

async function buildPca(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.pca?.ready, null, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'pcaLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#pcaPlot svg'), null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE', reason: 'e2e-pca-stats-archive'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) { binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); }
    return { fileName: `${stem}.graph`, base64: btoa(binary) };
  }, fileStem);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function seedRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const openWebDb = () => new Promise((resolve, reject) => {
      const request = window.indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('snapshots')) { db.createObjectStore('snapshots'); } };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await openWebDb();
    const workspaceState = window.Main?.session?.workspaceState || {};
    const graphTabs = (workspaceState.tabs || []).filter(t => t && !t.isWelcome && t.type);
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace', snapshotKind: 'recovery', policyMode: 'recovery', reason: 'recovery-interval', useWorker: true
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        meta: { app: 'Graphitix', kind: 'recovery', version: 1, savedAt: new Date().toISOString(), updatedAt: Date.now(), reason: 'recovery-interval', dirty: true, hasData: true, tabCount: graphTabs.length, fileName: 'workspace.graph', fileScope: 'workspace' },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  });
}

test('PCA scree + biplot survive file reopen (archive load)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await buildPca(page);
  await expectFullPcaStats(page, 'initial');
  const initialLegend = await page.evaluate(pcaLegendRecoveryStateInPage);
  expect(initialLegend.labels.length).toBeGreaterThan(1);
  expect(initialLegend.labels.every(label => String(label || '').trim().length > 0)).toBe(true);
  expect(initialLegend.fullyVisible, JSON.stringify(initialLegend, null, 2)).toBe(true);
  const archivePath = await captureWorkspaceArchive(page, 'pca-stats-reopen');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForTimeout(1000);
  await page.waitForSelector('#pcaPage:not([hidden])', { timeout: 30_000 });

  await expectFullPcaStats(page, 'after file reopen');
  const reopenedLegend = await page.evaluate(pcaLegendRecoveryStateInPage);
  expect(reopenedLegend, JSON.stringify({ initialLegend, reopenedLegend }, null, 2)).toMatchObject({
    hasSvg: true,
    hasLegend: true,
    fullyVisible: true,
    managedDrag: true
  });
  expect(reopenedLegend.labels).toEqual(initialLegend.labels);
  const drag = await dragRecoveredPcaLegend(page);
  expect(drag.error).toBeUndefined();
  expect(drag.sameSvg).toBe(true);
  expect(drag.moved).toBe(true);
  expect(drag.afterViewBox).toBe(drag.beforeViewBox);
  expect(Math.abs(drag.afterWidth - drag.beforeWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(drag.afterHeight - drag.beforeHeight)).toBeLessThanOrEqual(1);
  expect(issues.all.some(entry => /graph-edit-(click|drag)/i.test(entry.text || ''))).toBe(false);
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('PCA scree + biplot survive crash recovery', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await buildPca(page);
  await expectFullPcaStats(page, 'initial');
  const initialLegend = await page.evaluate(pcaLegendRecoveryStateInPage);
  expect(initialLegend.labels.length).toBeGreaterThan(1);
  expect(initialLegend.labels.every(label => String(label || '').trim().length > 0)).toBe(true);
  expect(initialLegend.fullyVisible).toBe(true);
  expect(initialLegend.managedDrag).toBe(true);
  // Model a recovery checkpoint created before the canonical legend-envelope
  // contract existed. Such cached pixels must be rejected and rebuilt from payload.
  await page.evaluate(() => {
    document.querySelectorAll('#pcaPlot [data-legend-viewport-content="true"]').forEach(legend => {
      delete legend.dataset.legendCanonicalOriginX;
      delete legend.dataset.legendCanonicalOriginY;
    });
  });
  await seedRecoverySnapshot(page);

  const dialogHandler = async d => { await d.accept(); };
  page.on('dialog', dialogHandler);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  page.off('dialog', dialogHandler);
  await page.evaluate(async () => {
    const state = window.Main?.session?.workspaceState;
    const tab = (state?.tabs || []).find(t => t && t.type === 'pca');
    if (tab) { const p = window.Main.tabs.activateTab(tab.id, { reason: 'e2e-activate-pca-recovery' }); if (p && p.then) await p; }
  });
  await page.waitForSelector('#pcaPage:not([hidden])', { timeout: 30_000 });

  await expectFullPcaStats(page, 'after crash recovery');
  const recoveredLegend = await page.evaluate(pcaLegendRecoveryStateInPage);
  expect(recoveredLegend, JSON.stringify({ initialLegend, recoveredLegend }, null, 2)).toMatchObject({
    hasSvg: true,
    hasLegend: true,
    fullyVisible: true,
    managedDrag: true
  });
  expect(recoveredLegend.labels).toEqual(initialLegend.labels);
  const drag = await dragRecoveredPcaLegend(page);
  expect(drag.error).toBeUndefined();
  expect(drag.sameSvg).toBe(true);
  expect(drag.moved).toBe(true);
  expect(drag.afterViewBox).toBe(drag.beforeViewBox);
  expect(Math.abs(drag.afterWidth - drag.beforeWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(drag.afterHeight - drag.beforeHeight)).toBeLessThanOrEqual(1);
  expect(issues.all.some(entry => /graph-edit-(click|drag)/i.test(entry.text || ''))).toBe(false);
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});
