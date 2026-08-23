const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function waitForBoxIdle(page) {
  await page.waitForFunction(() => {
    const box = window.Components?.box;
    return !!document.querySelector('#boxPlot #boxSvg')
      && (!box?.isIdleForSnapshot || box.isIdleForSnapshot());
  }, null, { timeout: 20_000 });
}

test('Box keeps existing single-dataset styles attached to their source columns when a column is inserted', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.locator('#boxGraphType').selectOption('strip');
  await page.evaluate(async () => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.hot;
    if (!box || !state || !hot || typeof hot.loadData !== 'function') {
      throw new Error('Box table is unavailable');
    }

    hot.loadData([
      ['A', 'B', 'C', 'D', 'E'],
      [1, 11, 21, 31, 41],
      [2, 12, 22, 32, 42],
      [3, 13, 23, 33, 43]
    ], { source: 'e2e-box-column-style-setup', recordUndo: false });

    state.fillColors = ['#111111', '#222222', '#777777', '#00aa55', '#ff0000'];
    state.borderColors = ['#111111', '#222222', '#777777', '#00aa55', '#ff0000'];
    state.traceShapeStyles = {
      2: { fill: '#777777' },
      3: { fill: '#00aa55' },
      4: { fill: '#ff0000' }
    };
    state.pointStyles = {
      2: { fill: '#777777', stroke: '#777777' },
      3: { fill: '#00aa55', stroke: '#00aa55' },
      4: { fill: '#ff0000', stroke: '#ff0000' }
    };
    state.summaryStyles = {
      2: { color: '#777777' },
      3: { color: '#00aa55' },
      4: { color: '#ff0000' }
    };

    await box.draw({ force: true, reason: 'e2e-box-column-style-before-insert' });
  });
  await waitForBoxIdle(page);

  const before = await page.evaluate(() => {
    const state = window.Components?.box?.__getState?.();
    return {
      headers: state?.hot?.getDataAtRow?.(0)?.slice(0, 5) || [],
      fillColors: state?.fillColors?.slice(0, 5) || [],
      pointStyles: JSON.parse(JSON.stringify(state?.pointStyles || {}))
    };
  });
  expect(before.headers).toEqual(['A', 'B', 'C', 'D', 'E']);
  expect(before.fillColors).toEqual(['#111111', '#222222', '#777777', '#00aa55', '#ff0000']);

  await page.evaluate(() => {
    const state = window.Components?.box?.__getState?.();
    state?.hot?.alter?.('insert_col_left', 2, 1, 'header-menu');
  });

  await expect.poll(async () => page.evaluate(() => {
    const state = window.Components?.box?.__getState?.();
    return state?.hot?.getDataAtRow?.(0)?.slice(0, 6) || [];
  }), {
    timeout: 15_000,
    intervals: [100, 200, 400]
  }).toEqual(['A', 'B', '', 'C', 'D', 'E']);
  await waitForBoxIdle(page);

  const after = await page.evaluate(() => {
    const state = window.Components?.box?.__getState?.();
    const pointGroups = Array.from(document.querySelectorAll('#boxPlot g[data-export-layer="box-points"]'));
    return {
      fillColors: state?.fillColors?.slice(0, 6) || [],
      borderColors: state?.borderColors?.slice(0, 6) || [],
      traceShapeStyles: JSON.parse(JSON.stringify(state?.traceShapeStyles || {})),
      pointStyles: JSON.parse(JSON.stringify(state?.pointStyles || {})),
      summaryStyles: JSON.parse(JSON.stringify(state?.summaryStyles || {})),
      renderedStyleIndices: pointGroups.map(group => Number(group.getAttribute('data-style-trace'))).filter(Number.isFinite)
    };
  });

  expect(after.fillColors.slice(0, 2)).toEqual(['#111111', '#222222']);
  expect(after.fillColors.slice(3, 6)).toEqual(['#777777', '#00aa55', '#ff0000']);
  expect(after.borderColors.slice(0, 2)).toEqual(['#111111', '#222222']);
  expect(after.borderColors.slice(3, 6)).toEqual(['#777777', '#00aa55', '#ff0000']);
  // Structural insertion creates an unstyled slot. The next draw legitimately
  // resolves that neutral slot through the active palette; it must not inherit
  // the explicit style of C when C moves from physical column 2 to column 3.
  expect(after.fillColors[2]).not.toBe('#777777');
  expect(after.borderColors[2]).not.toBe('#777777');
  expect(after.traceShapeStyles).toEqual({
    3: { fill: '#777777' },
    4: { fill: '#00aa55' },
    5: { fill: '#ff0000' }
  });
  expect(after.pointStyles).toEqual({
    3: { fill: '#777777', stroke: '#777777' },
    4: { fill: '#00aa55', stroke: '#00aa55' },
    5: { fill: '#ff0000', stroke: '#ff0000' }
  });
  expect(after.summaryStyles).toEqual({
    3: { color: '#777777' },
    4: { color: '#00aa55' },
    5: { color: '#ff0000' }
  });
  expect(after.renderedStyleIndices).toEqual(expect.arrayContaining([0, 1, 3, 4, 5]));
  expect(after.renderedStyleIndices).not.toContain(2);
  expect(issues.critical).toEqual([]);
});
