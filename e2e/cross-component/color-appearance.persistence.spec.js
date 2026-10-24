const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

async function waitForExample(page, type) {
  await page.waitForFunction(type => {
    const tab = window.Main?.session?.getActiveTab?.();
    if(tab?.type !== type) return false;
    const data = tab.payload?.data;
    if(type === 'venn') return !!data?.listA;
    return Array.isArray(data) && data.slice(1).some(row => Array.isArray(row)
      && row.some(value => value !== '' && value != null && Number.isFinite(Number(value))));
  }, type, { timeout: 60_000 });
}

async function settle(page, component, schemeId) {
  await page.waitForFunction(({ type, pageId, id }) => {
    const tab = window.Main?.session?.getActiveTab?.();
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const stored = type === 'venn' ? tab?.payload?.style?.colorScheme : tab?.payload?.config?.colorScheme;
    const workspace = window.Main?.components?.get?.(type);
    return tab?.type === type && stored === id && root
      && root.querySelector('.svgbox')?.getAttribute('data-color-scheme') === id
      && (!workspace?.isIdleForSnapshot || workspace.isIdleForSnapshot());
  }, { ...component, id: schemeId }, { timeout: 60_000 });
}

async function snapshot(page, type) {
  return page.evaluate(type => {
    const tab = window.Main.session.getActiveTab();
    window.Main.session.persistActiveTabState({ reason: 'e2e-color-appearance-capture', captureLivePayload: true });
    const payload = tab.payload;
    const cfg = payload.config || {};
    const style = payload.style || {};
    const meaningfulData = value => {
      if(Array.isArray(value)){
        const result = value.map(meaningfulData);
        // Grid padding is a layout concern; compare all meaningful cells,
        // including interior blanks, rather than generated trailing padding.
        while(result.length && (result[result.length - 1] == null
          || result[result.length - 1] === ''
          || (Array.isArray(result[result.length - 1]) && !result[result.length - 1].length))) result.pop();
        return result;
      }
      if(value && typeof value === 'object'){
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, meaningfulData(entry)]));
      }
      return value;
    };
    const colors = type === 'venn'
      ? [style.colorA, style.colorB, style.colorC]
      : { fill: cfg.fill || null, labelColors: cfg.labelColors || null, colors: cfg.colors || null,
          seriesColors: cfg.seriesColors || null, densityPalette: cfg.densityPalette || null,
          colorRamp: cfg.settings?.colorRamp || null };
    if(type === 'box'){
      colors.renderedPoints = Array.from(document.querySelectorAll(
        '#boxPage:not([hidden]) #boxSvg g[data-export-layer="box-points"][data-trace]'
      )).sort((a, b) => Number(a.dataset.trace) - Number(b.dataset.trace)).map(group =>
        group.querySelector('[fill]:not([fill="none"]):not([data-point-proxy="1"])')?.getAttribute('fill') || null);
    }
    return {
      tabId: tab.id,
      schemeId: type === 'venn' ? style.colorScheme : cfg.colorScheme,
      colors: JSON.parse(JSON.stringify(colors)),
      data: JSON.stringify(meaningfulData(payload.data))
    };
  }, type);
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} appearance preserves palette identity through same-type switching and archive reopen`, async ({ page }) => {
    test.setTimeout(180_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForExample(page, component.type);
    if(component.type === 'box'){
      await page.locator('#boxGraphType').selectOption('strip');
      await page.locator('#boxColorIndividual').check();
    }
    const palette = component.type === 'surface'
      ? 'surface-plasma'
      : (component.type === 'line' || component.type === 'roc' ? 'scientific' : 'normal');
    expect(await page.evaluate(({ type, palette }) =>
      window.Shared.colorSchemes.applyToActiveTab(type, palette, { colorMode: 'replace' }),
    { type: component.type, palette })).toBe(true);
    await settle(page, component, palette);
    const paletteSelect = page.locator(`#${component.pageId}:not([hidden]) select[data-color-scheme-select="1"]`);
    await expect(paletteSelect).toHaveValue(palette);
    const before = await snapshot(page, component.type);
    if(component.type === 'box'){
      expect(before.colors.renderedPoints).toHaveLength(6);
      expect(new Set(before.colors.renderedPoints).size).toBe(6);
    }
    const appearance = page.locator(`#${component.pageId}:not([hidden]) [data-color-appearance-select="1"]`);
    await appearance.selectOption('dark');
    await settle(page, component, `${palette}-dark`);
    await expect(appearance).toHaveValue('dark');
    expect(await page.locator(`#${component.pageId}:not([hidden]) .svgbox`).first()
      .evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(0, 0, 0)');
    const dark = await snapshot(page, component.type);
    expect(dark.data).toBe(before.data);
    if(['heatmap', 'surface'].includes(component.type)) expect(dark.colors).toEqual(before.colors);

    await appearance.selectOption('light');
    await settle(page, component, palette);
    expect((await snapshot(page, component.type)).colors).toEqual(before.colors);
    await appearance.selectOption('dark');
    await settle(page, component, `${palette}-dark`);

    await openComponentFromWelcome(page, component, { loadExample: true });
    await waitForExample(page, component.type);
    const sibling = await snapshot(page, component.type);
    expect(sibling.tabId).not.toBe(before.tabId);
    await expect(paletteSelect).toHaveValue(sibling.schemeId);
    await expect(appearance).toHaveValue('light');
    await page.evaluate(async id => window.Main.tabs.activateTab(id, { reason: 'e2e-color-appearance-return' }), before.tabId);
    await settle(page, component, `${palette}-dark`);
    await expect(paletteSelect).toHaveValue(`${palette}-dark`);
    await expect(appearance).toHaveValue('dark');
    expect((await snapshot(page, component.type)).colors).toEqual(dark.colors);

    const archive = await buildWorkspaceArchive(page, {
      scope: 'workspace', snapshotKind: 'save', policyMode: 'manual-save', compression: 'STORE', useWorker: false
    });
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: component.type });
    await settle(page, component, `${palette}-dark`);
    await expect(appearance).toHaveValue('dark');
    await expect(paletteSelect).toHaveValue(`${palette}-dark`);
    const reopened = await snapshot(page, component.type);
    expect(reopened.colors).toEqual(dark.colors);
    expect(reopened.data).toBe(before.data);
  });
}
