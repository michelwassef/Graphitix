const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('vertical scrollbar gutter covers pinned-row selection and fills the top corner', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    return !!(hot?.rootElement && typeof hot.selectCell === 'function');
  });

  const result = await page.evaluate(async () => {
    const state = window.Components.box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    const root = hot.rootElement;
    const horizontal = root.querySelector('.ag-body-horizontal-scroll-viewport');
    const vertical = root.querySelector('.ag-body-vertical-scroll');
    hot.selectCell(0, 6, 7, 7);

    const waitFrames = async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    };
    const snapshots = [];
    const maxScroll = Math.max(0, horizontal.scrollWidth - horizontal.clientWidth);
    for(let left = 0; left <= maxScroll; left += 20){
      horizontal.scrollLeft = left;
      horizontal.dispatchEvent(new Event('scroll', { bubbles: true }));
      await waitFrames();
      const pinnedCell = root.querySelector('.ag-floating-top .ag-cell[col-id="c7"], .ag-pinned-top .ag-cell[col-id="c7"]');
      const outline = root.querySelector('.hot-selection-outline');
      const rightEdge = outline?.querySelector('.hot-selection-outline-edge[data-edge="right"]');
      const pinnedRect = pinnedCell?.getBoundingClientRect?.();
      const verticalRect = vertical?.getBoundingClientRect?.();
      const outlineRect = outline?.getBoundingClientRect?.();
      if(pinnedRect && verticalRect && outlineRect
        && pinnedRect.left < verticalRect.left + 30
        && pinnedRect.right > verticalRect.left - 30){
        snapshots.push({
          scrollLeft: horizontal.scrollLeft,
          pinnedRight: pinnedRect.right,
          scrollbarLeft: verticalRect.left,
          outlineRight: outlineRect.right,
          rightEdgeDisplay: getComputedStyle(rightEdge).display
        });
      }
    }
    return { maxScroll, snapshots };
  });

  expect(result.snapshots.length).toBeGreaterThan(0);
  const occluded = result.snapshots.filter(snapshot => snapshot.pinnedRight >= snapshot.scrollbarLeft - 1.5);
  const clear = result.snapshots.filter(snapshot => snapshot.pinnedRight < snapshot.scrollbarLeft - 1.5);
  expect(occluded.length).toBeGreaterThan(0);
  expect(clear.length).toBeGreaterThan(0);
  for(const snapshot of occluded){
    expect(snapshot.rightEdgeDisplay).toBe('none');
    expect(snapshot.outlineRight).toBeLessThanOrEqual(snapshot.scrollbarLeft + 0.5);
  }
  for(const snapshot of clear){
    expect(snapshot.rightEdgeDisplay).toBe('block');
    expect(snapshot.outlineRight).toBeLessThanOrEqual(snapshot.scrollbarLeft + 0.5);
  }
  const cornerGeometry = await page.evaluate(() => {
    const state = window.Components.box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    const root = hot.rootElement;
    const agRoot = root.querySelector('.ag-root');
    const vertical = root.querySelector('.ag-body-vertical-scroll');
    const horizontal = root.querySelector('.ag-body-horizontal-scroll');
    const header = root.querySelector('.ag-header');
    const floatingTop = root.querySelector('.ag-floating-top');
    const rootRect = agRoot.getBoundingClientRect();
    const verticalRect = vertical.getBoundingClientRect();
    const verticalStyle = getComputedStyle(vertical);
    const cornerStyle = getComputedStyle(vertical, '::before');
    return {
      gapHeight: verticalRect.top - rootRect.top,
      scrollbarWidth: verticalRect.width,
      cornerHeight: Number.parseFloat(cornerStyle.height),
      cornerWidth: Number.parseFloat(cornerStyle.width),
      cornerContent: cornerStyle.content,
      cornerBackground: cornerStyle.backgroundColor,
      verticalBackground: verticalStyle.backgroundColor,
      horizontalBackground: getComputedStyle(horizontal).backgroundColor,
      verticalZ: Number(verticalStyle.zIndex),
      headerZ: Number(getComputedStyle(header).zIndex),
      floatingTopZ: Number(getComputedStyle(floatingTop).zIndex)
    };
  });
  expect(cornerGeometry.gapHeight).toBeGreaterThan(0);
  expect(cornerGeometry.cornerContent).not.toBe('none');
  expect(cornerGeometry.cornerHeight).toBeGreaterThanOrEqual(cornerGeometry.gapHeight);
  expect(cornerGeometry.cornerWidth).toBeCloseTo(cornerGeometry.scrollbarWidth, 1);
  expect(cornerGeometry.cornerBackground).toBe(cornerGeometry.horizontalBackground);
  expect(cornerGeometry.cornerBackground).toBe(cornerGeometry.verticalBackground);
  expect(cornerGeometry.verticalZ).toBeGreaterThan(cornerGeometry.headerZ);
  expect(cornerGeometry.verticalZ).toBeGreaterThan(cornerGeometry.floatingTopZ);
  expect(issues.critical).toEqual([]);
});
