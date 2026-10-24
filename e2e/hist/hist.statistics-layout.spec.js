const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');

test('Histogram statistics settings align and results formatting survives calculation and reopen', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' }, { first: true });
  await page.evaluate(async () => {
    const component = window.Components.hist;
    const tab = window.Main.session.getActiveTab();
    const payload = component.getPayload();
    payload.data = [['Control', 'Treatment'], [1.1, 1.5], [2.2, 2.6], [3.3, 4.7], [4.4, 6.8], [5.7, 7.9], [6.9, 8.3], [8.1, 9.2], [9.4, 10.6]];
    delete payload.dataViews;
    delete payload.activeDataViewId;
    component.loadFromPayload(payload, { tabId: tab.id, skipDraw: true });
    await component.draw({ tabId: tab.id, force: true, reason: 'hist-statistics-layout-fixture' });
  });
  const stats = page.locator('#histPage:not([hidden]) #histStats');
  const settingsHeading = stats.getByRole('heading', { name: 'Analysis settings', exact: true });
  const settingsBox = stats.locator('.stats-analysis-settings__body');
  const advisorToggle = stats.getByRole('button', { name: 'Help me choose', exact: true });
  await expect(advisorToggle).toHaveAttribute('aria-expanded', 'false');
  const disclosurePositions = await Promise.all([settingsHeading.boundingBox(), advisorToggle.boundingBox()]);
  expect(disclosurePositions[1].x - (disclosurePositions[0].x + disclosurePositions[0].width)).toBeGreaterThanOrEqual(8);
  expect(disclosurePositions[1].x - (disclosurePositions[0].x + disclosurePositions[0].width)).toBeLessThanOrEqual(20);
  const advisorBody = stats.getByRole('region', { name: 'Statistics advisor', exact: true });
  await advisorToggle.focus();
  await advisorToggle.press('Enter');
  await expect(advisorToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(advisorToggle).toBeFocused();
  await expect(advisorBody).toBeVisible();
  const controlledRegion = await advisorToggle.getAttribute('aria-controls');
  await expect(advisorBody).toHaveAttribute('id', controlledRegion);
  await expect(stats.locator('#histStatsDiagnosticsMode')).toHaveValue('off');
  await expect(stats.locator('#histStatsComparisonMode')).toHaveValue('off');
  await page.screenshot({ path: testInfo.outputPath('hist-advisor-expanded.png') });
  await advisorToggle.press('Space');
  await expect(advisorToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(advisorToggle).toBeFocused();
  await expect(advisorBody).toBeHidden();
  const settingsLayout = await stats.evaluate(node => {
    const heading = node.querySelector('#histStatsSettingsTitle').getBoundingClientRect();
    const box = node.querySelector('.stats-analysis-settings__body');
    const grid = node.querySelector('#histStatsControls').getBoundingClientRect();
    const comparison = node.querySelector('#histStatsComparisonMode').getBoundingClientRect();
    return {
      headingOutsideBox: !!box && !box.contains(node.querySelector('#histStatsSettingsTitle')),
      headingAboveBox: !!box && heading.bottom <= box.getBoundingClientRect().top,
      remainingRowSpace: grid.right - comparison.right
    };
  });
  expect(settingsLayout.headingOutsideBox).toBe(true);
  expect(settingsLayout.headingAboveBox).toBe(true);
  expect(settingsLayout.remainingRowSpace).toBeGreaterThan(1);
  const dropdowns = [stats.locator('#histStatsDiagnosticsMode'), stats.locator('#histStatsComparisonMode')];
  const initialDropdowns = await Promise.all(dropdowns.map(control => control.boundingBox()));
  await settingsHeading.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('hist-statistics-off.png') });
  await stats.locator('#histStatsDiagnosticsMode').selectOption('normal-vs-lognormal');
  await stats.locator('#histStatsComparisonMode').selectOption('ks');
  await waitForComponentOwnerReady(page, 'hist');
  const alpha = stats.locator('[data-stats-inference-key="alpha"]');
  await expect(alpha).toBeVisible();
  const positions = await Promise.all([
    stats.locator('#histStatsDiagnosticsMode').boundingBox(),
    stats.locator('#histStatsComparisonMode').boundingBox(),
    alpha.boundingBox()
  ]);
  expect(Math.max(...positions.map(rect => rect.y)) - Math.min(...positions.map(rect => rect.y))).toBeLessThanOrEqual(1);
  expect(new Set(positions.map(rect => Math.round(rect.height))).size).toBe(1);
  positions.slice(0, 2).forEach((rect, index) => {
    expect(Math.abs(rect.width - initialDropdowns[index].width)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.x - initialDropdowns[index].x)).toBeLessThanOrEqual(1);
  });
  await dropdowns[1].selectOption('off');
  await waitForComponentOwnerReady(page, 'hist');
  await expect(alpha).toBeHidden();
  const withoutAlpha = await Promise.all(dropdowns.map(control => control.boundingBox()));
  withoutAlpha.forEach((rect, index) => expect(Math.abs(rect.width - initialDropdowns[index].width)).toBeLessThanOrEqual(1));
  await dropdowns[1].selectOption('ks');
  await waitForComponentOwnerReady(page, 'hist');
  await expect(alpha).toBeVisible();
  await alpha.fill('0.1');
  await alpha.press('Tab');
  await waitForComponentOwnerReady(page, 'hist');
  await expect(alpha).toHaveValue('0.1');
  await stats.locator('#histComputeStats').click();
  await expect(stats.locator('#histStatsStatus')).toHaveText('Statistics calculated for the current data and settings.');
  const header = stats.locator('#histStatsResults > .stats-reporting-controls');
  await expect(header.getByRole('heading', { name: 'Results', exact: true })).toBeVisible();
  const headingAlignment = await Promise.all([settingsHeading.boundingBox(), header.getByRole('heading', { name: 'Results', exact: true }).boundingBox()]);
  expect(Math.abs(headingAlignment[0].x - headingAlignment[1].x)).toBeLessThanOrEqual(1);
  expect((await settingsBox.boundingBox()).y).toBeGreaterThan(headingAlignment[0].y);

  await expect(stats.getByRole('combobox', { name: 'p-value format', exact: true })).toHaveCount(1);
  await header.getByRole('combobox', { name: 'p-value format', exact: true }).selectOption('scientific');
  await expect(stats.locator('#histStatsStatus')).toHaveText('Statistics calculated for the current data and settings.');
  const archive = await buildWorkspaceArchive(page, { useWorker: false });
  await stats.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('hist-statistics-desktop.png') });
  for (const width of [1100, 700]) {
    await page.setViewportSize({ width, height: 1050 });
    await expect.poll(() => stats.locator('#histStatsControls').evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return [...node.querySelectorAll('select, input')].every(control => {
        const rect = control.getBoundingClientRect();
        return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
      });
    })).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('hist-statistics-narrow.png') });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'hist' });
  await waitForDocumentOpenComplete(page);
  await waitForComponentOwnerReady(page, 'hist');
  await expect(alpha).toHaveValue('0.1');
  await expect(header.getByRole('heading', { name: 'Results', exact: true })).toHaveCount(1);
  await expect(header.getByRole('combobox', { name: 'p-value format', exact: true })).toHaveValue('scientific');
  await expect(stats.locator('#histStatsResults .stats-table-card')).not.toHaveCount(0);
  await advisorToggle.click();
  await expect(advisorToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(advisorBody).toBeVisible();
  expect(errors).toEqual([]);
});
