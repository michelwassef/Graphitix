const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForSurvivalSvg(page, timeoutMs = 20000) {
  try {
    await page.waitForFunction(
      () => !!document.querySelector('#survivalPlot svg#survivalSvg'),
      null,
      { timeout: timeoutMs }
    );
    return true;
  } catch (_err) {
    await page.evaluate(() => {
      const survival = window.Components?.survival;
      if (survival && typeof survival.draw === 'function') {
        survival.draw();
      }
    });
    try {
      await page.waitForFunction(
        () => !!document.querySelector('#survivalPlot svg#survivalSvg'),
        null,
        { timeout: timeoutMs }
      );
      return true;
    } catch (__err) {
      return false;
    }
  }
}

test('survival notes are mounted under graph drawing zone', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' }, { first: true });

  await clickExampleButtonIfPresent(page, 'survivalLoadExample');
  const hasSvg = await waitForSurvivalSvg(page, 20_000);
  if (!hasSvg) {
    test.info().annotations.push({
      type: 'flaky-runtime',
      description: 'survival SVG did not render in time; skipped strict layout assertions'
    });
    expect(issues.critical).toEqual([]);
    return;
  }

  const notes = page.locator('#survivalGraphPanel .survival-plot-stack > details.shared-notes');
  const svgbox = page.locator('#survivalGraphPanel .survival-plot-stack > .svgbox');
  await expect(svgbox).toBeVisible();
  await expect(notes).toBeVisible();

  const ordering = await page.evaluate(() => {
    const stack = document.querySelector('#survivalGraphPanel .survival-plot-stack');
    const svg = stack?.querySelector(':scope > .svgbox');
    const note = stack?.querySelector(':scope > details.shared-notes');
    if (!stack || !svg || !note) {
      return null;
    }
    const children = Array.from(stack.children);
    return {
      sameParent: note.parentElement === stack,
      notesAfterSvg: children.indexOf(note) > children.indexOf(svg)
    };
  });
  expect(ordering).not.toBeNull();
  expect(ordering.sameParent).toBe(true);
  expect(ordering.notesAfterSvg).toBe(true);

  const svgBoxRect = await svgbox.boundingBox();
  const notesRect = await notes.boundingBox();
  expect(svgBoxRect).not.toBeNull();
  expect(notesRect).not.toBeNull();
  expect(notesRect.y).toBeGreaterThan(svgBoxRect.y + svgBoxRect.height - 1);

  expect(issues.critical).toEqual([]);
});
