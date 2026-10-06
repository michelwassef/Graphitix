const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

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
    const activeTab = window.Main?.session?.getActiveTab?.();
    const owner = activeTab?.id ? box?.__testHooks?.getSession?.(activeTab.id) : null;
    if (!box || !state || !owner || !hot || typeof hot.loadData !== 'function') {
      throw new Error('Box table is unavailable');
    }

    hot.loadData([
      ['A', 'B', 'C', 'D', 'E'],
      [1, 11, 21, 31, 41],
      [2, 12, 22, 32, 42],
      [3, 13, 23, 33, 43]
    ], { source: 'e2e-box-column-style-setup', recordUndo: false });

    owner.state.visual.fillColors = ['#111111', '#222222', '#777777', '#00aa55', '#ff0000'];
    owner.state.visual.borderColors = ['#111111', '#222222', '#777777', '#00aa55', '#ff0000'];
    owner.state.styles.traceShapeStyles = {
      2: { fill: '#777777' },
      3: { fill: '#00aa55' },
      4: { fill: '#ff0000' }
    };
    owner.state.styles.pointStyles = {
      2: { fill: '#777777', stroke: '#777777' },
      3: { fill: '#00aa55', stroke: '#00aa55' },
      4: { fill: '#ff0000', stroke: '#ff0000' }
    };
    owner.state.styles.summaryStyles = {
      2: { color: '#777777' },
      3: { color: '#00aa55' },
      4: { color: '#ff0000' }
    };
    state.fillColors = owner.state.visual.fillColors.slice();
    state.borderColors = owner.state.visual.borderColors.slice();
    state.traceShapeStyles = JSON.parse(JSON.stringify(owner.state.styles.traceShapeStyles));
    state.pointStyles = JSON.parse(JSON.stringify(owner.state.styles.pointStyles));
    state.summaryStyles = JSON.parse(JSON.stringify(owner.state.styles.summaryStyles));

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
  const exportedStyleIndices = await page.evaluate(() => {
    const svg = document.querySelector('#boxSvg');
    const xml = window.Shared?.exporter?.svgElementToXml?.(svg, 'box-indexed-style-after-insert');
    if (typeof xml !== 'string') return { validSvg: false, indices: [] };
    const exported = new DOMParser().parseFromString(xml, 'image/svg+xml');
    return {
      validSvg: exported.documentElement?.localName === 'svg',
      expectedStylesPresent: ['#777777', '#00aa55', '#ff0000']
        .map(color => xml.toLowerCase().includes(color))
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
  expect(exportedStyleIndices.validSvg).toBe(true);
  expect(exportedStyleIndices.expectedStylesPresent).toEqual([true, true, true]);
  expect(issues.critical).toEqual([]);

  await page.evaluate(() => {
    const hot = window.Components?.box?.__getState?.()?.hot;
    if (!hot) return false;
    hot.selectCell(0, 3, hot.countRows() - 1);
    const header = document.querySelector('#hot .ag-header-cell[col-id="c3"]');
    header?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }));
    return !!header;
  });
  const columnMenu = page.locator('.ag-hot-menu').last();
  await expect(columnMenu).toBeVisible();
  await columnMenu.getByText('Delete 1 column(s)', { exact: true }).click();
  await expect.poll(async () => page.evaluate(() => {
    const hot = window.Components?.box?.__getState?.()?.hot;
    return hot?.getDataAtRow?.(0)?.slice(0, 5) || [];
  }), { timeout: 15_000, intervals: [100, 200, 400] }).toEqual(['A', 'B', '', 'D', 'E']);
  await waitForBoxIdle(page);
  const afterRemoval = await page.evaluate(() => {
    const activeTab = window.Main?.session?.getActiveTab?.();
    const owner = activeTab?.id
      ? window.Components?.box?.__testHooks?.getSession?.(activeTab.id)
      : null;
    return {
      traceShapeStyles: JSON.parse(JSON.stringify(owner?.state?.styles?.traceShapeStyles || {})),
      pointStyles: JSON.parse(JSON.stringify(owner?.state?.styles?.pointStyles || {})),
      summaryStyles: JSON.parse(JSON.stringify(owner?.state?.styles?.summaryStyles || {}))
    };
  });
  expect(afterRemoval.traceShapeStyles).toEqual({
    3: { fill: '#00aa55' },
    4: { fill: '#ff0000' }
  });
  expect(afterRemoval.pointStyles).toEqual({
    3: { fill: '#00aa55', stroke: '#00aa55' },
    4: { fill: '#ff0000', stroke: '#ff0000' }
  });
  expect(afterRemoval.summaryStyles).toEqual({
    3: { color: '#00aa55' },
    4: { color: '#ff0000' }
  });

  await page.keyboard.press('Control+z');
  await expect.poll(async () => page.evaluate(() => {
    const hot = window.Components?.box?.__getState?.()?.hot;
    return hot?.getDataAtRow?.(0)?.slice(0, 6) || [];
  }), { timeout: 15_000, intervals: [200, 400, 800] }).toEqual(['A', 'B', '', 'C', 'D', 'E']);
  await waitForBoxIdle(page);
  const afterRemovalUndo = await page.evaluate(() => {
    const activeTab = window.Main?.session?.getActiveTab?.();
    const owner = activeTab?.id
      ? window.Components?.box?.__testHooks?.getSession?.(activeTab.id)
      : null;
    return {
      traceShapeStyles: JSON.parse(JSON.stringify(owner?.state?.styles?.traceShapeStyles || {})),
      pointStyles: JSON.parse(JSON.stringify(owner?.state?.styles?.pointStyles || {})),
      summaryStyles: JSON.parse(JSON.stringify(owner?.state?.styles?.summaryStyles || {}))
    };
  });
  expect(afterRemovalUndo.traceShapeStyles).toEqual(after.traceShapeStyles);
  expect(afterRemovalUndo.pointStyles).toEqual(after.pointStyles);
  expect(afterRemovalUndo.summaryStyles).toEqual(after.summaryStyles);

  await page.keyboard.press('Control+y');
  await expect.poll(async () => page.evaluate(() => {
    const hot = window.Components?.box?.__getState?.()?.hot;
    return hot?.getDataAtRow?.(0)?.slice(0, 5) || [];
  }), { timeout: 15_000, intervals: [200, 400, 800] }).toEqual(['A', 'B', '', 'D', 'E']);
  await waitForBoxIdle(page);
  const afterRemovalRedo = await page.evaluate(() => {
    const activeTab = window.Main?.session?.getActiveTab?.();
    const owner = activeTab?.id
      ? window.Components?.box?.__testHooks?.getSession?.(activeTab.id)
      : null;
    return JSON.parse(JSON.stringify(owner?.state?.styles?.traceShapeStyles || {}));
  });
  expect(afterRemovalRedo).toEqual(afterRemoval.traceShapeStyles);
});
