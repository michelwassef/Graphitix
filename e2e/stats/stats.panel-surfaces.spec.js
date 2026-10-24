const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function openHistogram(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' }, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'hist', { requireIdle: true });
}

async function measureSurfaces(results) {
  return results.evaluate(root => {
    const visible = node => node.getBoundingClientRect().height > 0;
    const gap = (before, after) => after.getBoundingClientRect().top - before.getBoundingClientRect().bottom;
    const sections = [...root.children].filter(node => node.matches('.stats-results-main, .stats-results-advanced-panel, .stats-results-descriptive') && visible(node));
    const sectionGaps = sections.slice(1).map((node, index) => gap(sections[index], node));
    const cardGaps = [...root.querySelectorAll('.stats-results-main, .stats-results-descriptive, .stats-results-advanced-panel__body')].flatMap(group => {
      const cards = [...group.children].filter(node => node.classList.contains('stats-table-card') && visible(node));
      return cards.slice(1).map((node, index) => gap(cards[index], node));
    });
    const corners = [...root.querySelectorAll('.stats-table-card')].filter(visible).map(card => {
      const footer = card.lastElementChild;
      const cardStyle = getComputedStyle(card);
      const footerStyle = getComputedStyle(footer);
      return {
        expectedLeft: Math.max(0, parseFloat(cardStyle.borderBottomLeftRadius) - parseFloat(cardStyle.borderLeftWidth)),
        expectedRight: Math.max(0, parseFloat(cardStyle.borderBottomRightRadius) - parseFloat(cardStyle.borderRightWidth)),
        actualLeft: parseFloat(footerStyle.borderBottomLeftRadius),
        actualRight: parseFloat(footerStyle.borderBottomRightRadius),
        overflow: cardStyle.overflow
      };
    });
    return { sectionGaps, cardGaps, corners, expectedGap: parseFloat(getComputedStyle(root).getPropertyValue('--ui-gap-wide')) };
  });
}

function expectSurfaces(measurement) {
  expect(measurement.corners.length).toBeGreaterThan(1);
  for (const gap of [...measurement.sectionGaps, ...measurement.cardGaps]) {
    expect(Math.abs(gap - measurement.expectedGap)).toBeLessThanOrEqual(1);
  }
  for (const corner of measurement.corners) {
    expect(corner.actualLeft).toBe(corner.expectedLeft);
    expect(corner.actualRight).toBe(corner.expectedRight);
    expect(corner.overflow).toBe('visible');
  }
}

test('Histogram result sections have gaps and rounded footers with working export menus', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await openHistogram(page);
  await page.locator('#histStatsComparisonMode').selectOption('ks');
  await page.locator('#histComputeStats').click();
  const results = page.locator('#histStatsResults');
  await expect(results).toContainText('Monte Carlo permutation');
  await expect(results.locator(':scope > .stats-results-advanced-panel')).toBeHidden();
  const measurement = await measureSurfaces(results);
  await testInfo.attach('histogram-panel-measurements', { body: JSON.stringify(measurement, null, 2), contentType: 'application/json' });
  expectSurfaces(measurement);
  const card = results.locator('.stats-table-card').first();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('histogram-result-panels.png') });
  const download = card.getByRole('button', { name: 'Download', exact: true });
  await download.click();
  const csv = card.getByRole('menuitem', { name: 'CSV', exact: true });
  await expect(csv).toBeVisible();
  const file = page.waitForEvent('download');
  await csv.click();
  expect((await file).suggestedFilename()).toMatch(/\.csv$/);
});

test('shared result layout keeps one gap across primary, advanced and descriptive cards after restore', async ({ page }) => {
  test.setTimeout(90000);
  await openHistogram(page);
  const results = page.locator('#histStatsResults');
  await page.evaluate(() => {
    const target = document.querySelector('#histStatsResults');
    target.replaceChildren();
    for (const section of ['summary', 'summary', 'diagnostics', 'diagnostics', 'descriptive', 'descriptive']) {
      window.Shared.statsTable.render({
        target, append: true, section, caption: `${section} fixture`,
        columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }],
        rows: [{ metric: 'Example', value: 1 }], footnotes: ['Shared renderer layout fixture.']
      });
    }
    window.Shared.statsReporting.enhancePanelNow(target, 'shared-panel-layout-fixture');
  });
  const advanced = results.locator(':scope > .stats-results-advanced-panel');
  await advanced.locator('summary').click();
  expectSurfaces(await measureSurfaces(results));
  await page.evaluate(() => {
    const target = document.querySelector('#histStatsResults');
    const model = window.Shared.statsReporting.capturePanelModel(target);
    window.Shared.statsReporting.restorePanelModel(target, model);
  });
  await advanced.locator('summary').click();
  expectSurfaces(await measureSurfaces(results));
  // A card whose export footer is absent must round its final footnotes too.
  await results.locator('.stats-table-actions').evaluateAll(nodes => nodes.forEach(node => node.remove()));
  expectSurfaces(await measureSurfaces(results));
});
