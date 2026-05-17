const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function waitForLockRatioCheckbox(page, pageId) {
  await page.waitForSelector(`#${pageId}:not([hidden]) .svgbox .resizer-aspect-checkbox`, {
    timeout: 30_000,
    state: 'attached'
  });
}

async function getLockRatioState(page, pageId) {
  return page.evaluate(({ pageId }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const checkbox = root?.querySelector?.('.svgbox .resizer-aspect-checkbox') || null;
    return {
      present: !!checkbox,
      checked: !!checkbox?.checked,
      disabled: !!checkbox?.disabled
    };
  }, { pageId });
}

test.describe('Lock ratio subtype enforcement', () => {
  test('line 3D mode enforces lock ratio', async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(
      page,
      { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample' },
      { first: true }
    );
    await waitForLockRatioCheckbox(page, 'linePage');
    await page.selectOption('#lineViewMode', '3d');
    await page.waitForTimeout(350);
    const state = await getLockRatioState(page, 'linePage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);
  });

  test('scatter 3D mode enforces lock ratio', async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(
      page,
      { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
      { first: true }
    );
    await waitForLockRatioCheckbox(page, 'scatterPage');
    await page.selectOption('#scatterViewMode', '3d');
    await page.waitForTimeout(350);
    const state = await getLockRatioState(page, 'scatterPage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);
  });

  test('pca always enforces lock ratio', async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(
      page,
      { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' },
      { first: true }
    );
    await waitForLockRatioCheckbox(page, 'pcaPage');
    await page.waitForTimeout(300);
    let state = await getLockRatioState(page, 'pcaPage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);

    await page.selectOption('#pcaViewMode', '3d');
    await page.waitForTimeout(300);
    state = await getLockRatioState(page, 'pcaPage');
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);

    await page.selectOption('#pcaViewMode', '2d');
    await page.waitForTimeout(300);
    state = await getLockRatioState(page, 'pcaPage');
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);
  });

  test('venn mode enforces lock ratio while upset mode remains user-toggleable', async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(
      page,
      { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' },
      { first: true }
    );
    await waitForLockRatioCheckbox(page, 'vennPage');

    await page.selectOption('#vennPlotType', 'venn');
    await page.waitForTimeout(300);
    let state = await getLockRatioState(page, 'vennPage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);

    await page.selectOption('#vennPlotType', 'upset');
    await page.waitForTimeout(300);
    state = await getLockRatioState(page, 'vennPage');
    expect(state.present).toBe(true);
    expect(state.disabled).toBe(false);
  });

  test('surface enforces lock ratio', async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(
      page,
      { type: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample' },
      { first: true }
    );
    await waitForLockRatioCheckbox(page, 'surfacePage');
    await page.waitForTimeout(350);
    const state = await getLockRatioState(page, 'surfacePage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);
  });
});
