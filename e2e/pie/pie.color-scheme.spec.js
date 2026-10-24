const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');

const PIE = { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' };

async function openPie(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, PIE, { first: true });
  await clickExampleButton(page, PIE, { requireMountedRoot: true });
  await waitForComponentOwnerReady(page, 'pie', {
    requireMountedRoot: true, requirePublished: true, requireIdle: true
  });
  await expect(page.locator('#pieSvg [data-pie-trace="1"]').first()).toBeVisible();
}

async function choosePalette(page, scheme = 'colorblind-8') {
  const picker = page.locator('#piePage:not([hidden]) .color-scheme-picker');
  await picker.locator('[data-color-scheme-toggle="1"]').click();
  await picker.locator(`[data-scheme-id="${scheme}"]`).click();
  return picker.locator('[data-color-scheme-choice="1"]');
}

test('Pie default colors change palette without requesting custom-color matching', async ({ page }) => {
  test.setTimeout(90_000);
  await openPie(page);
  const choice = await choosePalette(page);
  await expect(choice).toBeHidden();
  await expect(page.locator('#pieColorSchemeSelect')).toHaveValue('colorblind-8');
});

for (const [chartType, colorMode] of ['pie', 'donut', 'stacked'].flatMap(type => ['match', 'replace'].map(mode => [type, mode]))) {
test(`Pie ${chartType} ${colorMode} projects colors into the owner session and rendered slices`, async ({ page }) => {
  test.setTimeout(90_000);
  await openPie(page);
  const source = await page.evaluate(chartType => {
    const pie = window.Components.pie;
    const payload = pie.getPayload();
    payload.config.chartType = chartType;
    const label = Object.keys(payload.config.colors)[0];
    payload.config.colors[label] = '#123456';
    pie.loadFromPayload(payload, { tabId: window.Main.session.getActiveTab().id });
    return { data: payload.data, stats: payload.config.stats, labelPositions: payload.config.labelPositions };
  }, chartType);
  await waitForComponentOwnerReady(page, 'pie', { requirePublished: true, requireIdle: true });
  const choice = await choosePalette(page);
  await expect(choice).toBeVisible();
  await choice.locator(`[data-color-scheme-choice-action="${colorMode}"]`).click();
  await waitForComponentOwnerReady(page, 'pie', { requirePublished: true, requireIdle: true });
  await expect.poll(() => page.evaluate(() => {
    const payload = window.Components.pie.getPayload();
    const palette = window.Shared.colorSchemes.resolveCategoricalPaletteForType('pie', { schemeId: 'colorblind-8' });
    const fills = [...document.querySelectorAll('#pieSvg [data-pie-trace="1"]')].map(node => node.getAttribute('fill'));
    return {
      scheme: payload.config.colorScheme,
      colorsMatch: Object.values(payload.config.colors).every(color => palette.includes(color)),
      renderedMatch: fills.length > 0 && fills.every(color => palette.includes(color))
    };
  })).toEqual({ scheme: 'colorblind-8', colorsMatch: true, renderedMatch: true });
  await expect(page.locator('#pieColorSchemeSelect')).toHaveValue('colorblind-8');
  expect(await page.evaluate(() => {
    const payload = window.Components.pie.getPayload();
    return { data: payload.data, stats: payload.config.stats, labelPositions: payload.config.labelPositions };
  })).toEqual(source);
});
}

test('Pie palette stays owner-scoped through undo, new categories, tab switching and archive reopen', async ({ page }) => {
  test.setTimeout(120_000);
  await openPie(page);
  const firstId = await page.evaluate(() => window.Main.session.getActiveTab().id);
  const readPalette = () => page.evaluate(() => {
    const pie = window.Components.pie;
    const id = window.Main.session.getActiveTab().id;
    const payload = pie.getPayload();
    const runtime = pie.captureRuntimeState({ tabId: id });
    return {
      scheme: payload.config.colorScheme,
      colors: payload.config.colors,
      runtimeScheme: runtime.state.colorScheme,
      runtimeColors: runtime.state.colors,
      fills: [...document.querySelectorAll('#piePage:not([hidden]) [data-pie-trace="1"]')].map(node => node.getAttribute('fill'))
    };
  });
  const before = await readPalette();
  await choosePalette(page);
  await waitForComponentOwnerReady(page, 'pie', { requirePublished: true, requireIdle: true });
  const changed = await readPalette();
  expect(changed.scheme).toBe('colorblind-8');
  expect(changed.runtimeScheme).toBe(changed.scheme);
  expect(changed.runtimeColors).toEqual(changed.colors);
  expect(changed.colors).not.toEqual(before.colors);
  await page.evaluate(id => window.Shared.undoManager.undo({ tabId: id }), firstId);
  await waitForComponentOwnerReady(page, 'pie', { requirePublished: true, requireIdle: true });
  expect(await readPalette()).toEqual(before);
  await page.evaluate(id => window.Shared.undoManager.redo({ tabId: id }), firstId);
  await waitForComponentOwnerReady(page, 'pie', { requirePublished: true, requireIdle: true });
  expect(await readPalette()).toEqual(changed);

  // Older runtime snapshots lack scheme identity; the hydrated owner supplies it.
  await page.evaluate(id => {
    const pie = window.Components.pie;
    const snapshot = pie.captureRuntimeState({ tabId: id });
    delete snapshot.state.colorScheme;
    pie.applyRuntimeState(snapshot, { tabId: id });
  }, firstId);
  expect(await readPalette()).toEqual(changed);

  await openComponentFromWelcome(page, PIE, { loadExample: true });
  const secondId = await page.evaluate(() => window.Main.session.getActiveTab().id);
  const secondBefore = await readPalette();
  await page.evaluate(id => window.Main.tabs.activateTab(id), firstId);
  await waitForComponentOwnerReady(page, 'pie', { requirePublished: true, requireIdle: true });
  expect(await readPalette()).toEqual(changed);
  await page.evaluate(() => {
    const pie = window.Components.pie;
    const payload = pie.getPayload();
    payload.data.push(['New category', ...payload.data[1].slice(1)]);
    pie.loadFromPayload(payload, { tabId: window.Main.session.getActiveTab().id });
  });
  await waitForComponentOwnerReady(page, 'pie', { requirePublished: true, requireIdle: true });
  const expanded = await readPalette();
  expect(expanded.colors['New category']).toBeTruthy();
  expect(await page.evaluate(color => window.Shared.colorSchemes.resolveCategoricalPaletteForType('pie', {
    schemeId: 'colorblind-8'
  }).includes(color), expanded.colors['New category'])).toBe(true);
  await page.evaluate(id => window.Main.tabs.activateTab(id), secondId);
  await waitForComponentOwnerReady(page, 'pie', { requirePublished: true, requireIdle: true });
  expect(await readPalette()).toEqual(secondBefore);
  const archive = await buildWorkspaceArchive(page);
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'pie' });
  await waitForDocumentOpenComplete(page);
  const restoredFirstId = await page.evaluate(() => window.Main.session.workspaceState.tabs.find(tab =>
    tab.type === 'pie' && tab.payload?.config?.colorScheme === 'colorblind-8'
  )?.id);
  expect(restoredFirstId).toBeTruthy();
  await page.evaluate(id => window.Main.tabs.activateTab(id), restoredFirstId);
  await waitForComponentOwnerReady(page, 'pie', { requirePublished: true, requireIdle: true });
  expect(await readPalette()).toEqual(expanded);
  await expect(page.locator('#piePage:not([hidden]) #pieColorSchemeSelect')).toHaveValue('colorblind-8');
});
