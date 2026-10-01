/**
 * Tests that 3D graph legends can be dragged to reposition them,
 * and that the saved position persists across owner-scoped redraws.
 *
 * Root causes fixed:
 * 1. applyLegendPointerGuards on child elements (swatches/text) was calling
 *    stopPropagation() which prevented pointerdown from reaching the legendGroup's
 *    enableLegendDrag handler — so drag never started.
 * 2. PCA's onDragEnd referenced legendGapFor3d which was not defined.
 */

const { test, expect } = require('@playwright/test');
const { buildWorkspaceArchive } = require('../helpers/archiveDriver');
const { openComponentFromWelcome, clickExpectedExampleButton } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { reloadAndAcceptRecovery, seedRecoveryArchive } = require('../helpers/recoveryDriver');

// Simulate dragging a legend starting from a child element (closest to real user behavior)
async function dragLegendFromChild(page, { svgId, startFromChild = true, deltaX = 70, deltaY = 35 }) {
  return page.evaluate(async ({ svgId, startFromChild, deltaX, deltaY }) => {
    const svg = document.getElementById(svgId);
    if (!svg) return { error: `no svg #${svgId}` };

    const legendGroup = Array.from(svg.querySelectorAll('g')).find(g => g.style.cursor === 'move');
    if (!legendGroup) return { error: 'no legend group with cursor:move', svgId };

    const r = legendGroup.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { error: 'legend has zero dimensions' };

    const child = startFromChild ? legendGroup.querySelector('[data-legend-key], rect, circle, path') : null;
    const dispatchTarget = (child && legendGroup.contains(child)) ? child : legendGroup;
    const dr = dispatchTarget.getBoundingClientRect();
    const cx = dr.left + dr.width / 2;
    const cy = dr.top + dr.height / 2;

    const beforeTransform = legendGroup.getAttribute('transform');

    // Pointer down on child
    dispatchTarget.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: cx, clientY: cy, pointerId: 1, button: 0,
      bubbles: true, cancelable: true, isPrimary: true
    }));
    await new Promise(r => setTimeout(r, 30));

    // Move past drag threshold (>4px), then to final position
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: cx + 6, clientY: cy + 6, pointerId: 1, bubbles: true, cancelable: true, isPrimary: true
    }));
    await new Promise(r => setTimeout(r, 20));

    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: cx + deltaX, clientY: cy + deltaY, pointerId: 1, bubbles: true, cancelable: true, isPrimary: true
    }));
    await new Promise(r => setTimeout(r, 30));

    const duringTransform = legendGroup.getAttribute('transform');

    // Release
    window.dispatchEvent(new PointerEvent('pointerup', {
      clientX: cx + deltaX, clientY: cy + deltaY, pointerId: 1, bubbles: true, cancelable: true, isPrimary: true
    }));
    await new Promise(r => setTimeout(r, 50));

    const afterTransform = legendGroup.getAttribute('transform');

    return {
      moved: beforeTransform !== afterTransform,
      duringMoved: beforeTransform !== duringTransform,
      beforeTransform,
      afterTransform,
      dispatchedOnChild: dispatchTarget !== legendGroup,
      childTag: dispatchTarget.tagName
    };
  }, { svgId, startFromChild, deltaX, deltaY });
}

async function replaceRecoverySnapshot(page, reason) {
  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'recovery',
    policyMode: 'recovery',
    reason,
    useWorker: false
  });
  const metadata = await page.evaluate(() => {
    const workspaceState = window.Main?.session?.workspaceState || {};
    const graphTabs = (workspaceState.tabs || []).filter(tab => tab && !tab.isWelcome && tab.type);
    return {
      tabCount: graphTabs.length,
      fileName: workspaceState.sessionFileName || 'workspace.graph',
      filePath: workspaceState.sessionFilePath || '',
      fileScope: workspaceState.sessionFileScope || 'workspace'
    };
  });
  return seedRecoveryArchive(page, archive.base64, {
    reason,
    dirty: true,
    hasData: true,
    ...metadata
  });
}

async function recoveredLegendFrame(page, svgId) {
  return page.evaluate(id => {
    const svg = document.getElementById(id);
    const legend = svg?.querySelector?.('[data-legend-viewport-content="true"]') || null;
    const svgBox = svg?.closest?.('.svgbox') || null;
    const rect = svgBox?.getBoundingClientRect?.() || null;
    return {
      managed: window.Shared?.isManagedLegendDragTarget?.(legend) === true,
      viewBox: svg?.getAttribute?.('viewBox') || null,
      width: rect?.width || 0,
      height: rect?.height || 0
    };
  }, svgId);
}

// ─── PCA 3D ───────────────────────────────────────────────────────────────────

test.describe('3D legend drag', () => {
  test('PCA 3D: legend drags from child element and position persists after re-render', async ({ page }) => {
    test.setTimeout(120_000);
    installLocalCdnOverrides(page);
    const errors = [];
    registerIssueCollectors(page, errors);
    page.on('console', msg => {
      if (msg.text().includes('onDragEnd error') || msg.text().includes('is not defined')) {
        errors.push(msg.text());
      }
    });

    await page.goto('/index.html');
    await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage' }, { first: true, loadExample: true });
    await clickExpectedExampleButton(page, 'pcaLoadExample');
    await waitForComponentOwnerReady(page, 'pca', {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 45_000
    });
    await page.selectOption('#pcaViewMode', '3d');
    await waitForComponentOwnerReady(page, 'pca', {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 45_000
    });

    const dragResult = await dragLegendFromChild(page, { svgId: 'pcaSvg', deltaX: 80, deltaY: 40 });

    expect(dragResult.error, `PCA 3D drag error: ${dragResult.error}`).toBeUndefined();
    expect(dragResult.dispatchedOnChild, 'Should drag from child element').toBe(true);
    expect(dragResult.moved, 'Legend should move during drag').toBe(true);

    // No onDragEnd errors (specifically no legendGapFor3d ReferenceError)
    const dragErrors = errors.filter(e => e.includes('onDragEnd error') || e.includes('legendGapFor3d'));
    expect(dragErrors.length, `No drag errors expected, got: ${dragErrors.join('; ')}`).toBe(0);

    // Trigger a fresh owner-scoped draw, then verify the saved position is projected again.
    const ownerTabId = await page.evaluate(() => {
      const state = window.Main?.session?.workspaceState;
      const tab = state?.tabs?.find(item => item?.id === state?.activeTabId && item?.type === 'pca');
      const component = window.Components?.pca;
      if (!tab || typeof component?.draw !== 'function') {
        throw new Error('Active PCA owner or draw API unavailable');
      }
      component.draw({ tabId: tab.id, reason: 'e2e-pca-legend-drag-rerender' });
      return tab.id;
    });
    await waitForComponentOwnerReady(page, 'pca', {
      expectedTabId: ownerTabId,
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 45_000
    });

    const persistResult = await page.evaluate(expectedTransform => {
      const svg = document.getElementById('pcaSvg');
      const legend = Array.from(svg?.querySelectorAll('g') || []).find(g => g.style.cursor === 'move');
      return {
        currentTransform: legend?.getAttribute('transform'),
        matchesExpected: legend?.getAttribute('transform') === expectedTransform
      };
    }, dragResult.afterTransform);

    expect(persistResult.matchesExpected, 'Transform should match saved position after redraw').toBe(true);
  });

  test('PCA 2D: legend drag still works after 3D fixes', async ({ page }) => {
    test.setTimeout(120_000);
    installLocalCdnOverrides(page);
    registerIssueCollectors(page, []);

    await page.goto('/index.html');
    await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage' }, { first: true, loadExample: true });
    await clickExpectedExampleButton(page, 'pcaLoadExample');
    await waitForComponentOwnerReady(page, 'pca', {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 45_000
    });

    // Stay in 2D mode (default)
    const dragResult = await dragLegendFromChild(page, { svgId: 'pcaSvg', deltaX: 60, deltaY: 30 });
    console.log('PCA 2D drag:', JSON.stringify(dragResult));

    expect(dragResult.error, `PCA 2D drag error: ${dragResult.error}`).toBeUndefined();
    expect(dragResult.moved, 'Legend should move in 2D mode too').toBe(true);
  });
});

test('recovered Line legend drag preserves the SVG container and does not redraw', async ({ page }) => {
  test.setTimeout(150_000);
  await installLocalCdnOverrides(page);
  const issues = registerIssueCollectors(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true, loadExample: true });
  await clickExpectedExampleButton(page, 'lineLoadExample');
  await page.waitForSelector('#linePage:not([hidden]) #lineSvg [data-legend-viewport-content="true"]', { timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelectorAll('#linePlot [data-legend-viewport-content="true"]').forEach(legend => {
      delete legend.dataset.legendCanonicalOriginX;
      delete legend.dataset.legendCanonicalOriginY;
    });
  });
  await replaceRecoverySnapshot(page, 'e2e-line-legend-recovery');

  const accepted = await reloadAndAcceptRecovery(page, { timeout: 20_000 });
  expect(accepted).toBe(true);
  await page.waitForSelector('#linePage:not([hidden]) #lineSvg [data-legend-viewport-content="true"]', { timeout: 60_000 });

  const before = await recoveredLegendFrame(page, 'lineSvg');
  expect(before.managed).toBe(true);
  const drag = await dragLegendFromChild(page, { svgId: 'lineSvg', deltaX: -55, deltaY: 24 });
  expect(drag.error).toBeUndefined();
  expect(drag.moved).toBe(true);
  const after = await recoveredLegendFrame(page, 'lineSvg');
  expect(after.viewBox).toBe(before.viewBox);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  expect(issues.all.some(entry => /graph-edit-(click|drag)/i.test(entry.text || ''))).toBe(false);
});
