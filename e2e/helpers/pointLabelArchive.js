'use strict';

const { expect } = require('@playwright/test');
const { waitForComponentOwnerReady } = require('./contractWaits');
const { installLocalCdnOverrides } = require('./vendorOverrides');
const {
  buildWorkspaceArchive,
  openWorkspaceArchiveBuffer,
  parseWorkspaceArchive
} = require('./archiveDriver');

async function assertPointLabelCacheArchiveRebind(page, componentType, labelText, readGeometry){
  const before = await readGeometry(page, labelText);
  if(!before?.key){
    throw new Error(`${componentType} point label is not rendered`);
  }
  const archive = await buildWorkspaceArchive(page);
  const parsed = await parseWorkspaceArchive(page, archive.base64, `${componentType}-point-label.graph`);
  const archivedTab = parsed.session?.tabs?.[parsed.session?.activeIndex] || null;
  expect(archivedTab?.type).toBe(componentType);
  expect(archivedTab?.archiveRenderCache, `${componentType}: archive includes the rendered graph cache`).toBeTruthy();
  const archiveCacheMetadata = archivedTab?.archiveRenderCache?.__graphitixRenderCache || null;

  const browser = page.context().browser();
  if(!browser){
    throw new Error('Point-label archive verification requires a browser context.');
  }
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const isolatedContext = await browser.newContext({ viewport });
  try{
    const reopenedPage = await isolatedContext.newPage();
    await installLocalCdnOverrides(reopenedPage);
    await reopenedPage.goto(new URL('/index.html', page.url()).toString(), { waitUntil: 'domcontentloaded' });
    await reopenedPage.waitForFunction(() => !!window.Main?.tabs?.getSessionActionsContext);
    const lifecycleStart = await reopenedPage.evaluate(() => window.Shared?.componentLifecycle?.getLifecycleEventCursor?.() || 0);
    const cacheDiagnosticStart = await reopenedPage.evaluate(() => window.Shared?.renderCacheDiagnostics?.getCursor?.() || 0);
    await openWorkspaceArchiveBuffer(reopenedPage, Buffer.from(archive.base64, 'base64'), {
      componentType,
      fileName: `${componentType}-point-label.graph`,
      reload: false
    });
    await reopenedPage.waitForFunction(({ type, start }) => {
      const events = window.Shared?.componentLifecycle?.getLifecycleEvents?.(start) || [];
      return events.some(event => event.componentKey === type && event.action === 'activate-complete');
    }, { type: componentType, start: lifecycleStart }, { timeout: 60_000 });
    const restoreEvents = await reopenedPage.evaluate(({ type, start }) => {
      const events = window.Shared?.componentLifecycle?.getLifecycleEvents?.(start) || [];
      return events.filter(event => event.componentKey === type)
        .map(({ action, reason, details }) => ({ action, reason, details }));
    }, { type: componentType, start: lifecycleStart });
    const cacheDiagnostics = await reopenedPage.evaluate(({ type, start }) => (
      window.Shared?.renderCacheDiagnostics?.getEvents?.({ afterCursor: start, component: type }) || []
    ).map(({ phase, outcome, reason, details }) => ({ phase, outcome, reason, details })), {
      type: componentType,
      start: cacheDiagnosticStart
    });
    const interactionNodes = await reopenedPage.evaluate(type => {
      const root = document.querySelector(`#${type}Page:not([hidden])`);
      return Array.from(root?.querySelectorAll('svg') || []).map((svg, svgIndex) => ({
        svgIndex,
        viewMode: svg.dataset?.viewMode || '',
        labels: Array.from(svg.querySelectorAll("g[data-layer='point-labels'] text[data-point-label-key]")).map(node => ({
          key: node.dataset?.pointLabelKey || '',
          text: node.textContent || '',
          hasMetrics: !!node.dataset?.pointLabelDragMetrics,
          boundTabId: node.__graphitixLabelDragBinding?.tabId || null,
          boundSvg: node.__graphitixLabelDragBinding?.svg === svg
        })),
        leaders: Array.from(svg.querySelectorAll("g[data-layer='point-labels'] line[data-point-label-leader-key]")).map(node => ({
          key: node.dataset?.pointLabelLeaderKey || ''
        }))
      })).filter(svg => svg.labels.length || svg.leaders.length);
    }, componentType);
    expect(restoreEvents.some(event => event.action === 'saved-render-cache-restored'),
      `${componentType} archive restore events: ${JSON.stringify({ restoreEvents, cacheDiagnostics, archiveCacheMetadata, interactionNodes })}`).toBe(true);
    expect(restoreEvents.some(event => event.action === 'render-cache-interactions-rehydrated'),
      `${componentType} interaction restore events: ${JSON.stringify(restoreEvents)}`).toBe(true);
    expect(restoreEvents.some(event => event.action === 'render-cache-restore-transaction-end'),
      `${componentType} transaction restore events: ${JSON.stringify(restoreEvents)}`).toBe(true);
    await waitForComponentOwnerReady(reopenedPage, componentType, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    const restored = await readGeometry(reopenedPage, labelText);
    expect(restored?.key).toBe(before.key);
    expect(restored.x).toBeCloseTo(before.x, 4);
    expect(restored.y).toBeCloseTo(before.y, 4);
    expect(restored.attachmentGap).toBeLessThan(2);

    const pointLabel = reopenedPage.locator(
      `#${componentType}Svg [data-point-label-key="${before.key}"]`
    );
    await expect(pointLabel).toHaveAttribute('aria-keyshortcuts', /ArrowRight/);
    await pointLabel.focus();
    const moveKey = restored.relX < 0.7 ? 'ArrowRight' : 'ArrowLeft';
    await reopenedPage.keyboard.press(moveKey);
    await expect.poll(async () => (await readGeometry(reopenedPage, labelText)).x).not.toBe(restored.x);

    const moved = await readGeometry(reopenedPage, labelText);
    expect(moved.attachmentGap).toBeLessThan(2);
    const saved = await reopenedPage.evaluate(({ type, key }) => {
      const activeId = window.Main?.session?.workspaceState?.activeTabId;
      const session = window.Components?.[type]?.__testHooks?.getSession?.(activeId);
      const payload = window.Components?.[type]?.getPayload?.();
      const sessionPositions = type === 'scatter'
        ? session?.state?.labels?.positions?.pointLabels
        : session?.state?.state?.labelPositions?.pointLabels;
      return {
        session: sessionPositions?.[key] || null,
        payload: payload?.config?.labelPositions?.pointLabels?.[key] || null
      };
    }, { type: componentType, key: before.key });
    expect(saved.session?.x).toBeCloseTo(moved.x, 4);
    expect(saved.payload?.x).toBeCloseTo(moved.x, 4);

    // The isolated reopen context is discarded after the interaction assertion,
    // so leave its saved position changed instead of trying to reverse a
    // constrained placement with a second arrow key.
  } finally {
    await isolatedContext.close();
  }
}

module.exports = { assertPointLabelCacheArchiveRebind };
