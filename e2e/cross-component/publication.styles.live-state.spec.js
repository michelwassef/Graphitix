const { test, expect } = require('@playwright/test');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function snapshot(page, type) {
  return page.evaluate(type => {
    const tab = window.Main.session.getActiveTab();
    const payload = window.Components[type].getPayload({ tabId: tab.id });
    let data = Array.isArray(payload.data) ? payload.data.slice() : payload.data;
    if (Array.isArray(data)) {
      while (data.length && Array.isArray(data.at(-1)) && data.at(-1).every(value => value == null || value === '')) data.pop();
    }
    if (type === 'venn' && Array.isArray(data?.table)) {
      // Spare table rows/columns are allocated for the current viewport.
      const table = data.table.map(row => row.slice());
      while (table.length && table.at(-1).every(value => value == null || value === '')) table.pop();
      const width = table.reduce((max, row) => Math.max(max, row.reduce((end, value, index) => value == null || value === '' ? end : index + 1, 0)), 0);
      data = { ...data, table: table.map(row => row.slice(0, width)) };
    }
    const stats = payload.stats ? JSON.parse(JSON.stringify(payload.stats)) : null;
    if (type === 'survival' && stats?.groups) {
      // Palette changes recolor the legend swatches stored alongside results.
      for (const group of stats.groups) delete group.color;
    }
    const statsConfig = payload.config?.stats ? JSON.parse(JSON.stringify(payload.config.stats)) : null;
    const statsContext = type === 'scatter' ? {
      signature: statsConfig?.contextSignature, version: statsConfig?.contextVersion
    } : null;
    if (type === 'scatter' && statsConfig) {
      // Activation may rebuild the transient analysis context lazily. Its
      // identity is checked across the style edit, not across tab activation.
      delete statsConfig.contextSignature;
      delete statsConfig.contextVersion;
    }
    return JSON.parse(JSON.stringify({
      data, stats, statsConfig, statsContext,
      notes: payload.notes || payload.config?.notes || payload.style?.notes || null,
      activeView: payload.activeDataViewId || payload.dataViews?.activeViewId || null,
      fontSize: type === 'venn' ? payload.style.fontsize : type === 'surface' ? payload.config.settings.fontSize : payload.config.fontSize,
      showGrid: payload.config?.showGrid, showFrame: payload.config?.showFrame
    }));
  }, type);
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type}: publication edits retain live data, views and statistics`, async ({ page }) => {
    test.setTimeout(120000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof window.Shared?.hot?.createStandardTable === 'function');
    await page.evaluate(() => {
      const probe = window.publicationProbe = { active: false, tables: [], loads: 0, viewResets: 0 };
      const factory = window.Shared.hot.createStandardTable;
      window.Shared.hot.createStandardTable = function (...args) {
        const table = factory.apply(this, args);
        probe.tables.push(table);
        const load = table.loadData;
        table.loadData = function (...args) {
          if (probe.active) probe.loads++;
          return load.apply(this, args);
        };
        return table;
      };
    });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
    if (['box', 'scatter'].includes(component.type)) {
      await page.locator(`#${component.type}ComputeStats`).click();
      await expect(page.locator(`#${component.type}StatsStatus`)).toContainText('Statistics up to date.', { timeout: 35000 });
      await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
    }
    if (component.type === 'hist') {
      // The plot can publish before the initial statistical report finishes.
      await expect.poll(async () => Boolean((await snapshot(page, 'hist')).statsConfig?.resultsModel), { timeout: 30000 }).toBe(true);
    }
    const before = await snapshot(page, component.type);
    await page.evaluate(type => {
      const tab = window.Main.session.getActiveTab();
      const root = window.Shared.workspaceTabs.getMountedRoot(tab.id, type);
      const probe = window.publicationProbe;
      probe.root = root;
      probe.tableCountBefore = probe.tables.length;
      probe.managers = Array.from(root.querySelectorAll('.data-view-host'), host => ({ host, manager: host.__dataViewsOwner }));
      for (const { manager } of probe.managers) {
        for (const name of ['initialize', 'deserialize']) {
          const original = manager[name];
          manager[name] = function (...args) {
            if (probe.active) probe.viewResets++;
            return original.apply(this, args);
          };
        }
      }
      probe.active = true;
    }, component.type);
    await page.locator(`#${component.pageId} [data-publication-style-select]`).selectOption('npg_single');
    await page.locator(`#${component.pageId} [data-publication-style-apply]`).click();
    await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
    await expect.poll(async () => Number((await snapshot(page, component.type)).fontSize)).toBe(7);
    const after = await snapshot(page, component.type);
    const probe = await page.evaluate(() => ({
      tableCount: window.publicationProbe.tables.length,
      tableCountBefore: window.publicationProbe.tableCountBefore,
      loads: window.publicationProbe.loads,
      viewResets: window.publicationProbe.viewResets,
      managersRetained: window.publicationProbe.root.isConnected
        && window.publicationProbe.managers.every(({ host, manager }) => host.__dataViewsOwner === manager)
    }));
    expect(probe.tableCount).toBeGreaterThan(0);
    expect(probe.tableCount).toBe(probe.tableCountBefore);
    expect(probe.loads).toBe(0);
    expect(probe.viewResets).toBe(0);
    expect(probe.managersRetained).toBe(true);
    expect(after.data).toEqual(before.data);
    expect(after.stats).toEqual(before.stats);
    expect(after.statsConfig).toEqual(before.statsConfig);
    expect(after.statsContext).toEqual(before.statsContext);
    expect(after.notes).toEqual(before.notes);
    expect(after.activeView).toEqual(before.activeView);
    if (before.showGrid !== undefined) expect(after.showGrid).toBe(false);
    if (before.showFrame !== undefined) expect(after.showFrame).toBe(false);

    const ownerId = await page.evaluate(() => {
      window.publicationProbe.active = false;
      return window.Main.session.getActiveTab().id;
    });
    await openComponentFromWelcome(page, component, { loadExample: true });
    await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
    expect(Number((await snapshot(page, component.type)).fontSize)).toBe(Number(before.fontSize));
    await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'publication-style-owner-return' }), ownerId);
    await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
    const returned = await snapshot(page, component.type);
    expect(Number(returned.fontSize)).toBe(7);
    expect(returned.data).toEqual(before.data);
    expect(returned.stats).toEqual(after.stats);
    expect(returned.statsConfig).toEqual(after.statsConfig);
  });
}
