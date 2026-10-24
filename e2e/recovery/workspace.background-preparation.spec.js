'use strict';
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer, parseWorkspaceArchive } = require('../helpers/archiveDriver');
const { seedRecoveryArchive, reloadAndAcceptRecovery, clearRecoverySnapshot } = require('../helpers/recoveryDriver');
const { waitForOwnerReady } = require('../../test-support/readiness');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

function populatedMatrix(matrix) {
  // Live grids add empty viewport capacity; those cells are not saved data.
  const rows = matrix.map(row => {
    const copy = row.slice();
    while (copy.length && (copy[copy.length - 1] === '' || copy[copy.length - 1] == null)) copy.pop();
    return copy;
  });
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

async function ready(page, type, id) {
  await waitForOwnerReady(page, { type, pageId: `${type}Page`, expectedTabId: id,
    requirePublished: true, requireIdle: true, requireMountedRoot: true, timeout: 60000 });
  await page.waitForFunction(tabId => {
    const root = window.Shared.workspaceTabs.getMountedRoot(tabId);
    return root && !root.classList.contains('workspace-restoring');
  }, id);
}

async function seed(page, types = ['scatter', 'scatter', 'line']) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const originals = [];
  for (const [index, type] of types.entries()) {
    await openComponentFromWelcome(page, { type, pageId: `${type}Page` }, { first: index === 0, loadExample: true });
    const id = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);
    await ready(page, type, id);
    if (type === 'scatter') {
      await page.evaluate(value => window.Components.scatter.__getActiveHot().setDataAtCell(1, 1, value, 'edit'), 10 + index);
      await ready(page, type, id);
    }
    const original = await page.evaluate(({ id, type, index }) => {
      const session = window.Main.session;
      const tab = session.workspaceState.tabs.find(item => item.id === id);
      tab.title = `${type}-${index}`;
      session.persistActiveTabState(tab, { reason: 'e2e-background-preparation', captureRenderCache: true, origin: 'lifecycle' });
      return { title: tab.title, type, data: tab.payload.data };
    }, { id, type, index });
    originals.push(original);
  }
  return originals;
}

test('background preparation preserves each of the eleven component owners after reopen', async ({ page }, testInfo) => {
  test.setTimeout(360000);
  await installLocalCdnOverrides(page);
  // The extra active Scatter leaves one inactive owner of every component type.
  await seed(page, [...COMPONENT_CATALOG.map(component => component.type), 'scatter']);
  const archive = await buildWorkspaceArchive(page, { scope: 'workspace', useWorker: false });
  const saved = await parseWorkspaceArchive(page, archive.base64);
  await clearRecoverySnapshot(page);
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'));
  await page.waitForFunction(() => !window.Main.session.workspaceState.documentOperation?.active
    && window.Main.session.workspaceState.tabs.filter(tab => tab.loadedFromArchive).length === 12);
  const restored = await page.evaluate(() => window.Main.session.workspaceState.tabs.filter(tab => tab.loadedFromArchive)
    .map(tab => ({ id: tab.id, title: tab.title, type: tab.type })));
  const activeId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);
  const results = [];
  for (const tab of restored.filter(tab => tab.id !== activeId)) {
    const before = await page.evaluate(() => {
      const state = window.Main.session.workspaceState;
      return { id: state.activeTabId, payload: JSON.stringify(state.tabs.find(tab => tab.id === state.activeTabId).payload) };
    });
    await page.waitForFunction(id => {
      const tab = window.Main.session.workspaceState.tabs.find(tab => tab.id === id);
      return window.Main.workspacePreparation.getState(tab) === 'ready';
    }, tab.id, { timeout: 45000 });
    expect(await page.evaluate(() => {
      const state = window.Main.session.workspaceState;
      return { id: state.activeTabId, payload: JSON.stringify(state.tabs.find(tab => tab.id === state.activeTabId).payload) };
    })).toEqual(before);
    await page.locator(`.workspace-tab[data-tab-id="${tab.id}"]`).click();
    await ready(page, tab.type, tab.id);
    const actual = await page.evaluate(id => {
      const tab = window.Main.session.workspaceState.tabs.find(tab => tab.id === id);
      return tab.payload.data;
    }, tab.id);
    expect(actual).toEqual(saved.session.tabs.find(original => original.title === tab.title).payload.data);
    results.push({ type: tab.type, preparedAndRestored: true });
  }
  await testInfo.attach('all-component-preparation.json', {
    body: Buffer.from(JSON.stringify(results, null, 2)), contentType: 'application/json'
  });
});

async function observeFrames(page) {
  await page.evaluate(() => {
    const evidence = window.preparationEvidence = { violations: [], frames: 0, prepared: [], consumed: [] };
    window.addEventListener('graphitix:lifecycle-event', event => {
      const detail = event.detail;
      if (detail.action === 'prepare-complete') evidence.prepared.push(detail.tabId);
      if (detail.action === 'prepare-consumed') evidence.consumed.push(detail.tabId);
    });
    const sample = () => {
      const state = window.Main.session.workspaceState;
      const tab = state.tabs.find(item => item.id === state.activeTabId);
      if (tab?.loadedFromArchive && !state.documentOperation?.active) {
        const root = window.Shared.workspaceTabs.getMountedRoot(tab, tab.type);
        if (root?.isConnected && !root.classList.contains('workspace-restoring')
          && getComputedStyle(root).visibility === 'visible' && getComputedStyle(root).display !== 'none') {
          evidence.frames++;
          const graph = window.Main.components.registry[tab.type].hasRenderedGraph({ tab, tabId: tab.id, root });
          const rows = root.querySelectorAll('.ag-row').length;
          if (!graph || !rows || root.dataset.workspaceTabId !== tab.id) {
            evidence.violations.push({ tabId: tab.id, graph, rows, rootOwner: root.dataset.workspaceTabId });
          }
        }
      }
      evidence.frame = requestAnimationFrame(sample);
    };
    evidence.frame = requestAnimationFrame(sample);
  });
}

test('cold tab predictions retain the completed screen and commit only the latest destination', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  await installLocalCdnOverrides(page);
  await seed(page);
  const archive = await buildWorkspaceArchive(page, { scope: 'workspace', useWorker: false,
    captureRenderCacheBeforeSnapshot: false, includeRenderCacheInSnapshot: false });
  await clearRecoverySnapshot(page);
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'));
  await page.waitForFunction(() => !window.Main.session.workspaceState.documentOperation?.active);
  const owners = await page.evaluate(() => {
    const state = window.Main.session.workspaceState;
    return state.tabs.filter(tab => tab.loadedFromArchive).map(tab => ({ id: tab.id, type: tab.type }));
  });
  const line = owners.find(tab => tab.type === 'line');
  const scatter = owners.filter(tab => tab.type === 'scatter');
  await ready(page, 'line', line.id);
  await page.evaluate(() => {
    const config = window.Main.components.registry.scatter;
    const original = config.draw;
    const hasRenderedGraph = config.hasRenderedGraph;
    window.heldRestoreDraws = new Map();
    const released = new Set();
    // Hold the publication boundary explicitly, even if passive hydration has
    // already drawn a graph. The actual component still builds and renders.
    config.hasRenderedGraph = meta => released.has(meta?.tabId) && hasRenderedGraph(meta);
    config.draw = meta => new Promise(resolve => {
      window.heldRestoreDraws.set(meta.tabId, {
        release: draw => {
          released.add(meta.tabId);
          resolve(draw ? original(meta) : false);
        }
      });
    });
    window.restoreDrawConfig = () => { config.draw = original; config.hasRenderedGraph = hasRenderedGraph; };
  });
  const before = await page.evaluate(id => {
    const tab = window.Main.session.workspaceState.tabs.find(item => item.id === id);
    const root = window.Shared.workspaceTabs.getMountedRoot(tab);
    const marker = document.createElement('canvas');
    marker.id = 'restoreCanvasMarker';
    marker.width = marker.height = 4;
    marker.getContext('2d').fillStyle = '#123456';
    marker.getContext('2d').fillRect(0, 0, 4, 4);
    root.append(marker);
    window.readPresentationWitness = container => ['#lineSvg', '.ag-root'].map(selector => {
      const node = container.querySelector(selector);
      const rect = node.getBoundingClientRect();
      return { selector, rect: [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value)) };
    });
    return { data: JSON.stringify(tab.payload.data), visual: window.readPresentationWitness(root) };
  }, line.id);
  await page.locator(`.workspace-tab[data-tab-id="${scatter[0].id}"]`).click();
  await page.waitForFunction(id => window.heldRestoreDraws.has(id), scatter[0].id, { timeout: 20000 });
  await expect(page.locator('.workspace-restore-message')).toBeVisible();
  await expect(page.locator('.workspace-tab.is-active')).toHaveAttribute('data-tab-id', line.id);
  const retained = await page.evaluate(id => {
    const preview = document.querySelector('.workspace-restore-preview');
    const root = window.Shared.workspaceTabs.getMountedRoot(id);
    window.retainedRestorePreview = preview;
    return {
      hidden: preview.getAttribute('aria-hidden'), inert: preview.inert,
      graph: !!preview.shadowRoot.querySelector('#lineSvg'),
      rows: preview.shadowRoot.querySelectorAll('.ag-row').length,
      liveLineGraphs: document.querySelectorAll('#lineSvg').length,
      canvasPixel: Array.from(preview.shadowRoot.querySelector('#restoreCanvasMarker').getContext('2d').getImageData(0, 0, 1, 1).data),
      visual: window.readPresentationWitness(preview.shadowRoot),
      destinationInert: root.inert
    };
  }, scatter[0].id);
  expect(retained).toEqual({ hidden: 'true', inert: true, graph: true,
    rows: expect.any(Number), liveLineGraphs: 0, canvasPixel: [18, 52, 86, 255], visual: before.visual, destinationInert: true });
  expect(retained.rows).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('retained-complete-workspace.png') });
  await page.locator(`.workspace-tab[data-tab-id="${scatter[1].id}"]`).click();
  await page.waitForFunction(id => window.heldRestoreDraws.has(id), scatter[1].id, { timeout: 20000 });
  await page.evaluate(id => window.heldRestoreDraws.get(id).release(false), scatter[0].id);
  expect(await page.evaluate(() => document.querySelector('.workspace-restore-preview') === window.retainedRestorePreview)).toBe(true);
  await expect(page.locator('.workspace-tab.is-active')).toHaveAttribute('data-tab-id', line.id);
  await page.evaluate(id => {
    window.restoreDrawConfig();
    window.heldRestoreDraws.get(id).release(true);
  }, scatter[1].id);
  await ready(page, 'scatter', scatter[1].id);
  await expect(page.locator('.workspace-restore-status')).toHaveCount(0);
  await expect(page.locator('.workspace-tab.is-active')).toHaveAttribute('data-tab-id', scatter[1].id);
  expect(await page.evaluate(id => JSON.stringify(window.Main.session.workspaceState.tabs.find(tab => tab.id === id).payload.data), line.id)).toBe(before.data);
});

for (const mode of ['normal', 'recovery']) {
  for (const caches of [true, false]) {
    test(`${mode} reopen prepares inactive owners and publishes complete workspaces (${caches ? 'saved cache' : 'payload redraw'})`, async ({ page }, testInfo) => {
      test.setTimeout(240000);
      await installLocalCdnOverrides(page);
      const originals = await seed(page);
      const archive = await buildWorkspaceArchive(page, { scope: 'workspace', useWorker: false,
        captureRenderCacheBeforeSnapshot: caches, includeRenderCacheInSnapshot: caches });
      const parsed = await parseWorkspaceArchive(page, archive.base64);
      if (caches) expect(parsed.session.tabs.every(tab => !!tab.archiveRenderCache)).toBe(true);
      else expect(parsed.session.tabs.every(tab => !tab.archiveRenderCache)).toBe(true);
      await clearRecoverySnapshot(page);
      if (mode === 'normal') {
        await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'));
      } else {
        await seedRecoveryArchive(page, archive.base64, { tabCount: 3 });
        expect(await reloadAndAcceptRecovery(page)).toBe(true);
      }
      await page.waitForFunction(() => {
        const state = window.Main.session.workspaceState;
        return state.tabs.filter(tab => tab.loadedFromArchive).length === 3 && !state.documentOperation?.active;
      });
      await observeFrames(page);
      const restored = await page.evaluate(() => window.Main.session.workspaceState.tabs.filter(tab => tab.loadedFromArchive)
        .map(tab => ({ id: tab.id, title: tab.title, type: tab.type })));
      const line = restored.find(tab => tab.type === 'line');
      await ready(page, 'line', line.id);
      const beforePreparation = await page.evaluate(() => {
        const state = window.Main.session.workspaceState;
        const active = state.tabs.find(tab => tab.id === state.activeTabId);
        const root = window.Shared.workspaceTabs.getMountedRoot(active);
        window.preparationActiveRoot = root;
        window.preparationActiveSvg = root.querySelector('#lineSvg');
        return { activeId: active.id, data: active.payload.data, signature: active.payloadSignature };
      });
      await page.waitForFunction(() => window.Main.session.workspaceState.tabs.filter(tab => tab.type === 'scatter')
        .every(tab => window.Main.workspacePreparation.getState(tab) === 'ready'), null, { timeout: 45000 });
      expect(await page.evaluate(() => {
        const state = window.Main.session.workspaceState;
        const active = state.tabs.find(tab => tab.id === state.activeTabId);
        const root = window.Shared.workspaceTabs.getMountedRoot(active);
        return { activeId: active.id, data: active.payload.data, signature: active.payloadSignature,
          sameRoot: root === window.preparationActiveRoot, sameSvg: root.querySelector('#lineSvg') === window.preparationActiveSvg,
          inactiveMounted: state.tabs.filter(tab => tab.type === 'scatter').some(tab => window.Shared.workspaceTabs.getMountedRoot(tab)?.isConnected) };
      })).toEqual({ ...beforePreparation, sameRoot: true, sameSvg: true, inactiveMounted: false });

      for (const tab of [...restored.filter(item => item.type === 'scatter'), line]) {
        await page.locator(`.workspace-tab[data-tab-id="${tab.id}"]`).click();
        await ready(page, tab.type, tab.id);
        const actual = await page.evaluate(({ id, type }) => {
          const tab = window.Main.session.workspaceState.tabs.find(item => item.id === id);
          const hot = window.Components[type].__getActiveHot?.() || window.Shared.workspaceTabs.getSessionRecord(tab, type)?.session?.managers?.hot;
          return { payload: tab.payload.data, live: hot?.getData() };
        }, tab);
        expect(actual.payload).toEqual(originals.find(item => item.title === tab.title).data);
        if (tab.type === 'scatter') expect(populatedMatrix(actual.live)).toEqual(populatedMatrix(actual.payload));
      }
      // Start two same-component activations in one task. Only the last owner may publish.
      const scatter = restored.filter(tab => tab.type === 'scatter');
      await page.evaluate(async ids => {
        await Promise.all(ids.map(id => window.Main.tabs.activateTab(id, { reason: 'e2e-rapid-owner-switch' })));
      }, [scatter[0].id, scatter[1].id, line.id, scatter[0].id]);
      await ready(page, 'scatter', scatter[0].id);
      const evidence = await page.evaluate(() => {
        cancelAnimationFrame(window.preparationEvidence.frame);
        return window.preparationEvidence;
      });
      await testInfo.attach('background-preparation.json', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
      expect(evidence.frames).toBeGreaterThan(0);
      expect(evidence.violations).toEqual([]);
      expect(evidence.consumed).toEqual(expect.arrayContaining(scatter.map(tab => tab.id)));
      if (caches) {
        const cacheEvents = await page.evaluate(() => window.Shared.renderCacheDiagnostics.getEvents({ phase: 'hydrate', outcome: 'hit' }));
        expect(cacheEvents.map(event => event.tabId)).toEqual(expect.arrayContaining(scatter.map(tab => tab.id)));
      }
      if (mode === 'normal' && caches) {
        await page.screenshot({ path: testInfo.outputPath('restored-workspace.png') });
      }
    });
  }
}
