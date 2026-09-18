/**
 * Crash-recovery regression for primary graph publication.
 *
 * Recovery intentionally omits render caches so every component must finish the shared
 * restore transaction by publishing a graph from its authoritative payload. Auxiliary SVGs
 * (stats, controls, scree plots, icons) must never satisfy the publication check.
 */
const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const {
  buildWorkspaceArchive
} = require('../helpers/archiveDriver');
const {
  clearRecoverySnapshot,
  reloadAndAcceptRecovery,
  seedRecoveryArchive
} = require('../helpers/recoveryDriver');

const CASES = [
  {
    type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample', primarySelector: '#pcaPlot',
    renderedSelector: '[data-plot-point="1"], canvas.pca-fast-points-layer'
  },
  {
    type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample', primarySelector: '#piePlot',
    renderedSelector: 'svg#pieSvg [data-pie-trace="1"]'
  },
  {
    type: 'roc', pageId: 'rocPage', exampleButtonId: 'rocLoadExample', primarySelector: '#rocPlot',
    renderedSelector: 'svg#rocSvg path[data-series][d]'
  },
  {
    type: 'survival', pageId: 'survivalPage', exampleButtonId: 'survivalLoadExample', primarySelector: '#survivalPlot',
    renderedSelector: 'svg#survivalSvg path[data-group][d]'
  },
  {
    type: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample', primarySelector: '#surfaceSvg',
    renderedSelector: 'g.surface-faces polygon[points]'
  },
  {
    type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample', primarySelector: '#stage',
    renderedSelector: '[data-venn-trace-id], rect[data-upset-trace-kind], circle[data-upset-trace-kind], path[data-upset-trace-kind]'
  },
  {
    type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', primarySelector: '#scatterPlot',
    renderedSelector: 'g[data-export-layer="scatter-points"] > *'
  },
  {
    type: 'scatter', variant: '3d', label: 'scatter 3D', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', primarySelector: '#scatterPlot',
    renderedSelector: 'g[data-export-layer="scatter-points"] > *',
    prepare: async page => {
      await page.locator('#scatterPage:not([hidden]) #scatterViewMode').selectOption('3d');
      await clickExampleButtonIfPresent(page, 'scatterLoadExample');
      await page.waitForFunction(() => {
        const svg = document.querySelector('#scatterPage:not([hidden]) #scatterSvg');
        const component = window.Components?.scatter || null;
        const root = document.querySelector('#scatterPage:not([hidden])');
        return !!svg
          && svg.dataset?.viewMode === '3d'
          && svg.dataset?.rotationControlsAttached === 'true'
          && component?.__testHooks?.isRestoredRenderCacheVisuallyReady?.(root) === true;
      }, null, { timeout: 30_000 });
    }
  }
];

async function seedLeanRecoverySnapshot(page) {
  const workspaceState = await page.evaluate(() => window.Main?.session?.workspaceState || {});
  const graphTabs = Array.isArray(workspaceState.tabs)
    ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
    : [];
  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'recovery',
    policyMode: 'recovery',
    reason: 'e2e-primary-graph-recovery',
    captureRenderCacheBeforeSnapshot: false,
    includeRenderCacheInSnapshot: false,
    useWorker: false
  });
  await seedRecoveryArchive(page, archive.base64, {
    reason: 'e2e-primary-graph-recovery',
    tabCount: graphTabs.length,
    fileName: workspaceState.sessionFileName || 'workspace.graph',
    fileScope: workspaceState.sessionFileScope || 'workspace'
  });
}

async function waitForPrimaryGraph(page, component, timeout = 90_000) {
  await page.waitForFunction(({ type, primarySelector, renderedSelector }) => {
    const workspaceState = window.Main?.session?.workspaceState || null;
    const activeTab = workspaceState?.tabs?.find(tab => tab?.id === workspaceState.activeTabId) || null;
    if (!activeTab || activeTab.type !== type) {
      return false;
    }
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(activeTab.id, type)
      || document.querySelector(`#${type}Page:not([hidden])`)
      || null;
    const primary = root?.matches?.(primarySelector) ? root : root?.querySelector?.(primarySelector);
    if (!primary || primary.getBoundingClientRect().width <= 1 || primary.getBoundingClientRect().height <= 1) {
      return false;
    }
    return Array.from(primary.querySelectorAll(renderedSelector)).some(node => {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      if (node instanceof HTMLCanvasElement) {
        return node.width > 1 && node.height > 1;
      }
      const tag = String(node.tagName || '').toLowerCase();
      if (tag === 'path') return String(node.getAttribute('d') || '').trim().length > 0;
      if (tag === 'circle') return Number(node.getAttribute('r')) > 0;
      if (tag === 'polygon') return String(node.getAttribute('points') || '').trim().length > 0;
      const box = node.getBoundingClientRect?.();
      return !box || box.width > 0 || box.height > 0;
    });
  }, {
    type: component.type,
    primarySelector: component.primarySelector,
    renderedSelector: component.renderedSelector
  }, { timeout });
}

async function reloadPrimaryRecovery(page, component) {
  const recoveryAccepted = await reloadAndAcceptRecovery(page);
  await expect.poll(() => recoveryAccepted, {
    timeout: 20_000,
    message: `${component.type}: recovery prompt should be accepted`
  }).toBe(true);
  await page.waitForFunction(({ type, pageId }) => {
    const state = window.Main?.session?.workspaceState || null;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    return active?.type === type && !!document.querySelector(`#${pageId}:not([hidden])`);
  }, { type: component.type, pageId: component.pageId }, { timeout: 60_000 });
}

for (const component of CASES) {
  test(`lean crash recovery publishes ${component.label || component.type} before any resize`, async ({ page }) => {
    test.setTimeout(150_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await clearRecoverySnapshot(page);
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, component, { first: true });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    if (typeof component.prepare === 'function') {
      await component.prepare(page);
    }
    await waitForPrimaryGraph(page, component);

    await seedLeanRecoverySnapshot(page);
    await reloadPrimaryRecovery(page, component);

    // This assertion is deliberately made before any pointer, resize, tab-switch, or graph-type
    // interaction. The recovered payload itself must publish the graph.
    await waitForPrimaryGraph(page, component);

    if (component.type === 'scatter' && component.variant === '3d') {
      const publication = await page.evaluate(() => {
        const state = window.Main?.session?.workspaceState || null;
        const activeTab = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
        const root = activeTab
          ? window.Shared?.workspaceTabs?.getMountedRoot?.(activeTab.id, 'scatter')
          : null;
        const svg = root?.querySelector?.('#scatterSvg') || null;
        return {
          activeTabId: activeTab?.id || null,
          activeType: activeTab?.type || null,
          viewMode: svg?.dataset?.viewMode || null,
          rotationBound: svg?.dataset?.rotationControlsAttached || null,
          visuallyReady: window.Components?.scatter?.__testHooks
            ?.isRestoredRenderCacheVisuallyReady?.(root) === true
        };
      });
      expect(publication.activeType).toBe('scatter');
      expect(publication.viewMode).toBe('3d');
      expect(publication.rotationBound).toBe('true');
      expect(publication.visuallyReady).toBe(true);
      expect(issues.all.some(entry => /workspace-post-restore-fallback-failed/i.test(entry.text || ''))).toBe(false);
    }

    if (component.type === 'venn') {
      const runtime = await page.evaluate(() => {
        const state = window.Components?.venn?.__getState?.() || null;
        return {
          ready: window.Components?.venn?.ready === true,
          hasScheduler: typeof state?.ui?.scheduleDraw === 'function',
          hasLayout: !!state?.ui?.layout
        };
      });
      expect(runtime).toEqual({ ready: true, hasScheduler: true, hasLayout: true });

      // Venn previously advertised ready after a passive bind while its scheduler/layout were
      // absent. Clear the SVG and request the same owner-scoped redraw used by resize handling.
      await page.evaluate(() => {
        const state = window.Components?.venn?.__getState?.();
        state?.ui?.stage?.replaceChildren();
        state?.ui?.scheduleDraw?.({
          force: true,
          forceDraw: true,
          tabId: window.Main?.session?.workspaceState?.activeTabId || null,
          reason: 'e2e-venn-recovery-redraw'
        });
      });
      await waitForPrimaryGraph(page, component);
    }

    expect(issues.critical).toEqual([]);
  });
}
