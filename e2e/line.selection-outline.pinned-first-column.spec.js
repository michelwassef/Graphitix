const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('line topmost pinned-first-column selected cell keeps visible outline borders', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });

  await page.waitForFunction(() => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
    return !!(hot && hot.gridApi && typeof hot.selectCell === 'function' && hot.rootElement);
  });

  await page.evaluate(() => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
    if(!hot || !hot.rootElement){
      return null;
    }

    hot.setDataAtCell?.([
      [0, 0, 'Month'],
      [0, 1, 'North'],
      [1, 0, '1'],
      [1, 1, '120']
    ], 'e2e-line-top-pinned-outline-seed');
    hot.selectCell(0, 0, 0, 0);
    hot.gridApi?.refreshCells?.({ force: true, suppressFlash: true });
  });

  let snapshot = null;
  await expect.poll(async () => {
    snapshot = await page.evaluate(() => {
      const line = window.Components?.line;
      const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot;
      if(!hot || !hot.rootElement){
        return { present: false, display: 'missing-hot' };
      }
      const outline = hot.rootElement.querySelector('.hot-selection-outline');
      if(!outline){
        return { present: false, display: 'missing-outline' };
      }
      const style = getComputedStyle(outline);
      const handle = hot.rootElement.querySelector('.hot-fill-handle');
      const handleStyle = handle ? getComputedStyle(handle) : null;
      return {
        present: true,
        display: style.display,
        borderTopColor: style.borderTopColor,
        borderLeftColor: style.borderLeftColor,
        borderRightColor: style.borderRightColor,
        borderBottomColor: style.borderBottomColor,
        handleDisplay: handleStyle ? handleStyle.display : 'missing'
      };
    });
    return snapshot;
  }, {
    timeout: 10_000,
    intervals: [100, 200, 400]
  }).toMatchObject({
    present: true,
    display: 'block'
  });

  expect(snapshot.borderTopColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(snapshot.borderLeftColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(snapshot.borderRightColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(snapshot.borderBottomColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(snapshot.handleDisplay).toBe('block');
  expect(issues.critical).toEqual([]);
});
