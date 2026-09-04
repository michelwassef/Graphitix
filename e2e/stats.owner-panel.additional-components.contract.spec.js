const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

const CASES = [
  { key: 'pca', pageId: 'pcaPage', panels: ['#pcaStatsSummary', '#pcaStatsResults'] },
  { key: 'heatmap', pageId: 'heatmapPage', panels: ['#heatmapStatsContent'] },
  { key: 'hist', pageId: 'histPage', panels: ['#histStatsResults'] },
  { key: 'surface', pageId: 'surfacePage', panels: ['#surfaceStatsSummary'] },
  {
    key: 'survival',
    pageId: 'survivalPage',
    panels: ['#survivalStatsSummary', '#survivalStatsLogRank', '#survivalStatsHazardRatios', '#survivalStatsCox'],
    advisorSelector: '#survivalStatsAdvisor'
  },
  { key: 'venn', pageId: 'vennPage', panels: ['#significanceResults'] }
];

async function graphTabIds(page, type) {
  return page.evaluate(componentType => (
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => tab && !tab.isWelcome && tab.type === componentType)
      .map(tab => String(tab.id || '').trim())
      .filter(Boolean)
  ), type);
}

async function openComponentTab(page, componentCase, { first = false } = {}) {
  if (first) {
    await openComponentFromWelcome(page, { type: componentCase.key, pageId: componentCase.pageId }, { first: true });
  } else {
    await page.evaluate(async type => {
      const tabs = window.Main?.tabs;
      if (typeof tabs?.handleAddTabClick === 'function') {
        await Promise.resolve(tabs.handleAddTabClick());
      }
      if (typeof tabs?.handleGraphSelection === 'function') {
        await Promise.resolve(tabs.handleGraphSelection(type, { reason: 'e2e-stats-owner-panel-additional' }));
      }
      const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
      const empty = document.querySelector('#duplicateEmpty');
      if (prompt && empty && !empty.disabled) empty.click();
    }, componentCase.key);
  }
  await expect(page.locator(`#${componentCase.pageId}:not([hidden])`)).toBeVisible({ timeout: 25_000 });
  await page.waitForFunction(type => {
    const hooks = window.Components?.[type]?.__testHooks;
    return !!hooks?.getSession && !!hooks?.captureStatsPanelForOwner && !!hooks?.restoreStatsPanelForOwner;
  }, componentCase.key, { timeout: 25_000 });
}

async function activateTab(page, type, tabId) {
  await page.evaluate(async id => {
    await Promise.resolve(window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-stats-owner-panel-activate' }));
  }, tabId);
  await page.waitForFunction(id => String(window.Main?.session?.workspaceState?.activeTabId || '') === String(id), tabId, { timeout: 20_000 });
  await page.waitForFunction(({ componentType, id }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, componentType) || null;
    return !!root && root.isConnected === true;
  }, { componentType: type, id: tabId }, { timeout: 20_000 });
}

async function prepareComponentData(page, componentCase) {
  if (componentCase.key !== 'heatmap') return;
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await expect(page.locator('#heatmapPage:not([hidden]) #heatmapSvg')).toBeVisible({ timeout: 25_000 });
  await page.waitForFunction(() => {
    const component = window.Components?.heatmap;
    return typeof component?.awaitReadyForSnapshot === 'function';
  }, null, { timeout: 25_000 });
  await page.evaluate(async () => {
    await window.Components.heatmap.awaitReadyForSnapshot({
      reason: 'e2e-stats-owner-panel-prepare',
      timeoutMs: 12_000,
      settleFrames: 3
    });
  });
}

async function setPValueBeforeSentinel(page, componentCase, tabId, scientific) {
  await page.evaluate(({ type, panelSelector, id, value }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
    const panel = root?.querySelector?.(panelSelector) || null;
    if (!panel) throw new Error(`${type} p-value format target unavailable`);
    window.Shared.statsReporting.setPValueFormatScientific(value, {
      target: panel,
      tabId: id,
      persist: true,
      source: 'e2e-stats-owner-panel-additional',
      reason: 'e2e-stats-owner-panel-pvalue-format'
    });
  }, { type: componentCase.key, panelSelector: componentCase.panels[0], id: tabId, value: scientific });
  if (componentCase.key === 'heatmap') {
    await page.evaluate(async () => {
      await window.Components.heatmap.awaitReadyForSnapshot({
        reason: 'e2e-stats-owner-panel-pvalue-format',
        timeoutMs: 12_000,
        settleFrames: 3
      });
    });
  }
}

async function installDurableSentinel(page, componentCase, sentinel, scientific) {
  const ids = await graphTabIds(page, componentCase.key);
  const activeId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  await setPValueBeforeSentinel(page, componentCase, activeId || ids[0], scientific);
  const captured = await page.evaluate(async ({ type, panels, text, pValueScientific }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || null;
    const hooks = window.Components?.[type]?.__testHooks;
    const reporting = window.Shared?.statsReporting;
    if (!active?.id || !root || !hooks) throw new Error(`${type} owner surface unavailable`);
    const missing = [];
    const resolvedPanels = panels.map((selector, index) => {
      const panel = root.querySelector(selector);
      if (!panel) {
        missing.push(selector);
        return null;
      }
      if (type === 'pca' && selector === '#pcaStatsResults') {
        const card = panel.ownerDocument.createElement('div');
        card.className = 'stats-table-card';
        card.innerHTML = `<table><tbody><tr><td>${text}::RESULT::${index}</td></tr></tbody></table>`;
        panel.appendChild(card);
      } else {
        panel.innerHTML = `<div class="stats-table-card"><table><tbody><tr><td>${text}::RESULT::${index}</td></tr></tbody></table></div>`;
      }
      return panel;
    });
    if (missing.length) throw new Error(`${type} missing stats panels: ${missing.join(', ')}`);

    // Give each owner a real reporting model as well as a distinct results model. This
    // exercises owner-local report-host resolution (including Survival's detached Cox host).
    const reportTarget = resolvedPanels[resolvedPanels.length - 1];
    if (reportTarget && typeof reporting?.appendReportPanel === 'function') {
      reporting.appendReportPanel(reportTarget, {
        title: 'Reporting and reproducibility',
        methodsText: `${text}::REPORT::METHODS`,
        resultsText: `${text}::REPORT::RESULTS`
      });
    }


    const model = hooks.captureStatsPanelForOwner(active.id);
    const session = hooks.getSession(active.id);
    const persist = window.Shared?.componentLifecycle?.persistOwnedUserState?.(
      type,
      { tabId: active.id, session },
      { reason: 'e2e-stats-owner-panel-sentinel' }
    );
    await Promise.resolve(persist);

    const reportArtifacts = new Set();
    resolvedPanels.forEach(panel => {
      if (!panel) return;
      if (panel.__statsReportHost?.nodeType === 1) reportArtifacts.add(panel.__statsReportHost);
      panel.querySelectorAll?.('.stats-report-host, .stats-report-panel').forEach(node => reportArtifacts.add(node));
    });
    root.querySelectorAll?.('.stats-report-host, .stats-report-panel').forEach(node => reportArtifacts.add(node));
    return {
      tabId: active.id,
      modelText: JSON.stringify(model || {}),
      canonicalText: JSON.stringify({ state: session?.state || null, results: session?.results || null, advisor: session?.advisor || null }),
      visibleText: resolvedPanels.map(panel => String(panel?.textContent || '').trim()).join(' | '),
      reportArtifactCount: reportArtifacts.size,
      reportArtifactsOwned: Array.from(reportArtifacts).every(node => root.contains(node)),
      pValueScientific: active?.payload?.meta?.statsReporting?.pValueScientific
    };
  }, { type: componentCase.key, panels: componentCase.panels, text: sentinel, pValueScientific: scientific });

  expect(captured.modelText, `${componentCase.key}: durable model should contain sentinel`).toContain(sentinel);
  expect(captured.canonicalText, `${componentCase.key}: canonical owner state should contain sentinel`).toContain(sentinel);
  expect(captured.visibleText).toContain(sentinel);
  expect(captured.reportArtifactCount, `${componentCase.key}: report artifact should exist`).toBeGreaterThan(0);
  expect(captured.reportArtifactsOwned, `${componentCase.key}: report artifact escaped owner root`).toBe(true);

  await page.waitForFunction(({ id, text, expectedScientific }) => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return JSON.stringify(tab?.payload || {}).includes(text)
      && tab?.payload?.meta?.statsReporting?.pValueScientific === expectedScientific;
  }, { id: captured.tabId, text: sentinel, expectedScientific: scientific }, { timeout: 20_000 });
  return captured.tabId;
}

async function assertEmptyCapturePreservesDurable(page, componentCase, tabId, sentinel) {
  const probe = await page.evaluate(async ({ type, panels, id, expected }) => {
    const hooks = window.Components?.[type]?.__testHooks;
    const session = hooks?.getSession?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || session?.root || null;
    if (!hooks || !session || !root || root.isConnected !== true) throw new Error(`${type} active owner unavailable`);
    const before = JSON.stringify(hooks.captureStatsPanelForOwner(id) || {});
    panels.forEach(selector => {
      const panel = root.querySelector(selector);
      if (!panel) return;
      if (type === 'pca' && selector === '#pcaStatsResults') {
        panel.querySelector('#pcaStatsSummary')?.replaceChildren();
        panel.querySelectorAll('.stats-report-host, .stats-report-panel, .stats-table-card').forEach(node => node.replaceChildren());
      } else {
        panel.innerHTML = '';
      }
    });
    // Attached hosts can be removed by clearing their target; detached/sibling hosts (notably
    // Survival Cox) must also be emptied so this is genuinely an empty/transient live capture.
    root.querySelectorAll?.('.stats-report-host').forEach(host => { host.innerHTML = ''; });
    const captured = hooks.captureStatsPanelForOwner(id);
    const afterCapture = JSON.stringify(captured || {});
    const canonicalAfterCapture = JSON.stringify({ state: session.state || null, results: session.results || null, advisor: session.advisor || null });
    const restored = hooks.restoreStatsPanelForOwner(id) === true;
    const afterRestore = panels.map(selector => String(root.querySelector(selector)?.textContent || '').trim()).join(' | ');
    const persist = window.Shared?.componentLifecycle?.persistOwnedUserState?.(
      type,
      { tabId: id, session },
      { reason: 'e2e-stats-owner-empty-capture-fallback' }
    );
    await Promise.resolve(persist);
    return {
      before,
      afterCapture,
      canonicalAfterCapture,
      restored,
      afterRestore,
      expectedStillPresent: afterCapture.includes(expected) && canonicalAfterCapture.includes(expected)
    };
  }, { type: componentCase.key, panels: componentCase.panels, id: tabId, expected: sentinel });

  expect(probe.before).toContain(sentinel);
  expect(probe.expectedStillPresent, JSON.stringify(probe)).toBe(true);
  expect(probe.restored, JSON.stringify(probe)).toBe(true);
  expect(probe.afterRestore).toContain(sentinel);
  await page.waitForFunction(({ id, text }) => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return JSON.stringify(tab?.payload || {}).includes(text);
  }, { id: tabId, text: sentinel }, { timeout: 20_000 });
}

async function setActiveAdvisorOpen(page, componentCase, tabId, open) {
  if (!componentCase.advisorSelector) return;
  await activateTab(page, componentCase.key, tabId);
  await page.waitForFunction(({ type, id, selector }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
    return !!root?.querySelector?.(`${selector} .stats-advisor__toggle`);
  }, { type: componentCase.key, id: tabId, selector: componentCase.advisorSelector }, { timeout: 20_000 });
  await page.evaluate(({ type, id, selector, shouldOpen }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
    const advisor = root?.querySelector?.(`${selector} .stats-advisor`) || null;
    const toggle = root?.querySelector?.(`${selector} .stats-advisor__toggle`) || null;
    if (!advisor || !toggle) throw new Error(`${type} Statistics advisor unavailable`);
    const current = advisor.dataset.open === '1';
    if (current !== shouldOpen) toggle.click();
  }, { type: componentCase.key, id: tabId, selector: componentCase.advisorSelector, shouldOpen: open });
  await page.waitForFunction(({ type, id, expected }) => {
    const session = window.Components?.[type]?.__testHooks?.getSession?.(id) || null;
    return (session?.advisor?.open === true) === expected;
  }, { type: componentCase.key, id: tabId, expected: open }, { timeout: 20_000 });
}

async function advisorOpenForTab(page, componentCase, tabId) {
  if (!componentCase.advisorSelector) return null;
  return page.evaluate(({ type, id }) => {
    const session = window.Components?.[type]?.__testHooks?.getSession?.(id) || null;
    return session?.advisor?.open === true;
  }, { type: componentCase.key, id: tabId });
}

async function inspectTwoOwners(page, componentCase, tabA, tabB, sentinelA, sentinelB) {
  return page.evaluate(({ type, panels, ownerA, ownerB, textA, textB }) => {
    const hooks = window.Components?.[type]?.__testHooks;
    const workspaceTabs = window.Shared?.workspaceTabs;
    const sessionA = hooks?.getSession?.(ownerA) || null;
    const sessionB = hooks?.getSession?.(ownerB) || null;
    const rootA = workspaceTabs?.getMountedRoot?.(ownerA, type) || sessionA?.root || null;
    const rootB = workspaceTabs?.getMountedRoot?.(ownerB, type) || sessionB?.root || null;
    const collectStatsRefs = (session, root) => Object.entries(session?.refs || {})
      .filter(([key, node]) => /stats|significance/i.test(key) && node?.nodeType === 1)
      .map(([key, node]) => ({ key, owned: !!root?.contains?.(node) }));
    const collectReports = (session, root) => {
      const nodes = new Set();
      root?.querySelectorAll?.('.stats-report-host, .stats-report-panel').forEach(node => nodes.add(node));
      Object.entries(session?.refs || {}).forEach(([, node]) => {
        if (node?.nodeType !== 1) return;
        if (node.__statsReportHost?.nodeType === 1) nodes.add(node.__statsReportHost);
      });
      panels.forEach(selector => {
        const panel = root?.querySelector?.(selector) || null;
        if (panel?.__statsReportHost?.nodeType === 1) nodes.add(panel.__statsReportHost);
      });
      return Array.from(nodes);
    };
    const refsA = collectStatsRefs(sessionA, rootA);
    const refsB = collectStatsRefs(sessionB, rootB);
    const reportsA = collectReports(sessionA, rootA);
    const reportsB = collectReports(sessionB, rootB);
    const canonicalA = JSON.stringify({ state: sessionA?.state || null, results: sessionA?.results || null, advisor: sessionA?.advisor || null });
    const canonicalB = JSON.stringify({ state: sessionB?.state || null, results: sessionB?.results || null, advisor: sessionB?.advisor || null });
    return {
      canonicalAHasOwn: canonicalA.includes(textA),
      canonicalAHasSibling: canonicalA.includes(textB),
      canonicalBHasOwn: canonicalB.includes(textB),
      canonicalBHasSibling: canonicalB.includes(textA),
      refsA,
      refsB,
      reportCountA: reportsA.length,
      reportCountB: reportsB.length,
      reportsAOwned: reportsA.every(node => rootA?.contains?.(node)),
      reportsBOwned: reportsB.every(node => rootB?.contains?.(node)),
      reportsDistinct: reportsA.every(nodeA => reportsB.every(nodeB => nodeA !== nodeB)),
      rootsDistinct: rootA !== rootB,
      advisorOpenA: sessionA?.advisor?.open === true,
      advisorOpenB: sessionB?.advisor?.open === true
    };
  }, {
    type: componentCase.key,
    panels: componentCase.panels,
    ownerA: tabA,
    ownerB: tabB,
    textA: sentinelA,
    textB: sentinelB
  });
}

async function corruptInactiveOwnerAndProbe(page, componentCase, tabA, tabB, sentinelB, sentinelA) {
  return page.evaluate(({ type, panels, ownerA, ownerB, expectedB, expectedA }) => {
    const workspaceTabs = window.Shared?.workspaceTabs;
    const hooks = window.Components?.[type]?.__testHooks;
    const rootA = workspaceTabs?.getMountedRoot?.(ownerA, type) || hooks?.getSession?.(ownerA)?.root || null;
    const rootB = workspaceTabs?.getMountedRoot?.(ownerB, type) || hooks?.getSession?.(ownerB)?.root || null;
    const beforeB = panels.map(selector => String(rootB?.querySelector?.(selector)?.textContent || '').trim()).join(' | ');
    panels.forEach(selector => {
      const panel = rootA?.querySelector?.(selector) || null;
      if (!panel) return;
      if (type === 'pca' && selector === '#pcaStatsResults') {
        panel.querySelector('#pcaStatsSummary')?.replaceChildren();
        panel.querySelectorAll('.stats-report-host, .stats-report-panel, .stats-table-card').forEach(node => node.replaceChildren());
      } else {
        panel.innerHTML = '';
      }
    });
    rootA?.querySelectorAll?.('.stats-report-host').forEach(host => { host.innerHTML = ''; });
    const restoredWhileInactive = hooks?.restoreStatsPanelForOwner?.(ownerA) === true;
    const afterB = panels.map(selector => String(rootB?.querySelector?.(selector)?.textContent || '').trim()).join(' | ');
    const afterA = panels.map(selector => String(rootA?.querySelector?.(selector)?.textContent || '').trim()).join(' | ');
    return {
      rootAConnected: rootA?.isConnected === true,
      rootBConnected: rootB?.isConnected === true,
      restoredWhileInactive,
      afterA,
      afterAHasContent: afterA.includes(expectedA),
      beforeB,
      afterB,
      bContainsExpected: beforeB.includes(expectedB)
    };
  }, { type: componentCase.key, panels: componentCase.panels, ownerA: tabA, ownerB: tabB, expectedB: sentinelB, expectedA: sentinelA });
}

async function panelTextForTab(page, componentCase, tabId) {
  return page.evaluate(({ type, panels, id }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || window.Components?.[type]?.__testHooks?.getSession?.(id)?.root || null;
    return {
      connected: root?.isConnected === true,
      text: panels.map(selector => String(root?.querySelector?.(selector)?.textContent || '').trim()).join(' | '),
      allText: String(root?.textContent || '').trim()
    };
  }, { type: componentCase.key, panels: componentCase.panels, id: tabId });
}

async function pValueFormatForTab(page, tabId) {
  return page.evaluate(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return tab?.payload?.meta?.statsReporting?.pValueScientific;
  }, tabId);
}

async function setActivePValueFormat(page, componentCase, tabId, scientific) {
  await activateTab(page, componentCase.key, tabId);
  await page.evaluate(async ({ type, panelSelector, id, value }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
    const panel = root?.querySelector?.(panelSelector) || null;
    if (!panel) throw new Error(`${type} p-value format target unavailable`);
    const reporting = window.Shared?.statsReporting;
    if (typeof reporting?.setPValueFormatScientific !== 'function') throw new Error('Shared stats reporting format API unavailable');
    reporting.setPValueFormatScientific(value, {
      target: panel,
      tabId: id,
      persist: true,
      source: 'e2e-stats-owner-first-reopen-interaction',
      reason: 'e2e-stats-owner-first-reopen-interaction'
    });
  }, { type: componentCase.key, panelSelector: componentCase.panels[0], id: tabId, value: scientific });
  await page.waitForFunction(({ id, expected }) => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return tab?.payload?.meta?.statsReporting?.pValueScientific === expected;
  }, { id: tabId, expected: scientific }, { timeout: 20_000 });
}

async function captureArchive(page, key) {
  const archive = await page.evaluate(async () => {
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-stats-owner-panel-additional'
    });
    if (!blob) throw new Error('No workspace archive blob');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, `${key}-owner-panel-additional.graph`);
  fs.writeFileSync(archivePath, Buffer.from(archive, 'base64'));
  return archivePath;
}

async function reopenArchive(page, archivePath, type) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForFunction(componentType => (
    (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab?.type === componentType).length === 2
  ), type, { timeout: 30_000 });
}

for (const componentCase of CASES) {
  test(`${componentCase.key} durable stats surfaces are owner-bound across switching, inactive restore, and archive reopen`, async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

    await openComponentTab(page, componentCase, { first: true });
    await prepareComponentData(page, componentCase);
    const [tabA] = await graphTabIds(page, componentCase.key);
    expect(tabA).toBeTruthy();
    const sentinelA = `${componentCase.key.toUpperCase()}_OWNER_A_STATS_SENTINEL`;
    await setActiveAdvisorOpen(page, componentCase, tabA, true);
    await installDurableSentinel(page, componentCase, sentinelA, false);
    await assertEmptyCapturePreservesDurable(page, componentCase, tabA, sentinelA);

    await openComponentTab(page, componentCase, { first: false });
    await prepareComponentData(page, componentCase);
    const ids = await graphTabIds(page, componentCase.key);
    const tabB = ids.find(id => id !== tabA);
    expect(tabB).toBeTruthy();
    const sentinelB = `${componentCase.key.toUpperCase()}_OWNER_B_STATS_SENTINEL`;
    await setActiveAdvisorOpen(page, componentCase, tabB, false);
    await installDurableSentinel(page, componentCase, sentinelB, true);
    await assertEmptyCapturePreservesDurable(page, componentCase, tabB, sentinelB);

    const ownerProbe = await inspectTwoOwners(page, componentCase, tabA, tabB, sentinelA, sentinelB);
    expect(ownerProbe.canonicalAHasOwn, JSON.stringify(ownerProbe)).toBe(true);
    expect(ownerProbe.canonicalAHasSibling, JSON.stringify(ownerProbe)).toBe(false);
    expect(ownerProbe.canonicalBHasOwn, JSON.stringify(ownerProbe)).toBe(true);
    expect(ownerProbe.canonicalBHasSibling, JSON.stringify(ownerProbe)).toBe(false);
    expect(ownerProbe.rootsDistinct, JSON.stringify(ownerProbe)).toBe(true);
    expect(ownerProbe.refsA.length, JSON.stringify(ownerProbe)).toBeGreaterThan(0);
    expect(ownerProbe.refsB.length, JSON.stringify(ownerProbe)).toBeGreaterThan(0);
    expect(ownerProbe.refsA.every(entry => entry.owned), JSON.stringify(ownerProbe)).toBe(true);
    expect(ownerProbe.refsB.every(entry => entry.owned), JSON.stringify(ownerProbe)).toBe(true);
    expect(ownerProbe.reportCountA, JSON.stringify(ownerProbe)).toBeGreaterThan(0);
    expect(ownerProbe.reportCountB, JSON.stringify(ownerProbe)).toBeGreaterThan(0);
    expect(ownerProbe.reportsAOwned, JSON.stringify(ownerProbe)).toBe(true);
    expect(ownerProbe.reportsBOwned, JSON.stringify(ownerProbe)).toBe(true);
    expect(ownerProbe.reportsDistinct, JSON.stringify(ownerProbe)).toBe(true);
    if (componentCase.advisorSelector) {
      expect(ownerProbe.advisorOpenA, JSON.stringify(ownerProbe)).toBe(true);
      expect(ownerProbe.advisorOpenB, JSON.stringify(ownerProbe)).toBe(false);
    }

    const inactiveProbe = await corruptInactiveOwnerAndProbe(page, componentCase, tabA, tabB, sentinelB, sentinelA);
    expect(inactiveProbe.rootAConnected, JSON.stringify(inactiveProbe)).toBe(false);
    expect(inactiveProbe.rootBConnected, JSON.stringify(inactiveProbe)).toBe(true);
    expect(inactiveProbe.restoredWhileInactive, JSON.stringify(inactiveProbe)).toBe(false);
    expect(inactiveProbe.afterAHasContent, JSON.stringify(inactiveProbe)).toBe(false);
    expect(inactiveProbe.bContainsExpected, JSON.stringify(inactiveProbe)).toBe(true);
    expect(inactiveProbe.afterB).toBe(inactiveProbe.beforeB);

    // Repeated switching is intentional: a one-off A -> B -> A sequence can miss stale
    // projection refs that only surface after the second handoff. Sentinels above prove
    // canonical ownership and empty-capture fallback; after an activation-driven graph
    // refresh, require the component's real statistics surface rather than fake HTML to
    // survive a legitimate redraw.
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await activateTab(page, componentCase.key, tabA);
      await expect.poll(async () => {
        const snapshot = await panelTextForTab(page, componentCase, tabA);
        return snapshot.text.replace(/[|\s]/g, '').length;
      }, { timeout: 20_000 }).toBeGreaterThan(0);
      expect((await panelTextForTab(page, componentCase, tabB)).connected).toBe(false);
      await activateTab(page, componentCase.key, tabB);
      await expect.poll(async () => {
        const snapshot = await panelTextForTab(page, componentCase, tabB);
        return snapshot.text.replace(/[|\s]/g, '').length;
      }, { timeout: 20_000 }).toBeGreaterThan(0);
      expect((await panelTextForTab(page, componentCase, tabA)).connected).toBe(false);
    }

    // Save with A active so stats-bearing B is explicitly inactive/detached at archive time.
    // Workspace tab ordering is part of the archive contract, so the first/second owner
    // remains A/B even when a legitimate redraw replaced the synthetic sentinel text.
    await activateTab(page, componentCase.key, tabA);
    const archivePath = await captureArchive(page, componentCase.key);
    await reopenArchive(page, archivePath, componentCase.key);
    const reopenedIds = await graphTabIds(page, componentCase.key);
    expect(reopenedIds).toHaveLength(2);
    const [reopenedA, reopenedB] = reopenedIds;

    for (const id of reopenedIds) {
      await activateTab(page, componentCase.key, id);
      await expect.poll(async () => {
        const snapshot = await panelTextForTab(page, componentCase, id);
        return snapshot.text.replace(/[|\s]/g, '').length;
      }, { timeout: 20_000 }).toBeGreaterThan(0);
    }
    expect(await pValueFormatForTab(page, reopenedA)).toBe(false);
    expect(await pValueFormatForTab(page, reopenedB)).toBe(true);
    if (componentCase.advisorSelector) {
      expect(await advisorOpenForTab(page, componentCase, reopenedA)).toBe(true);
      expect(await advisorOpenForTab(page, componentCase, reopenedB)).toBe(false);
    }

    // The first post-reopen stats interaction must patch only its current owner. Use the
    // shared per-tab p-value format because it is a real statistics setting and persists
    // without requiring a graph redraw.
    const bFormatBefore = await pValueFormatForTab(page, reopenedB);
    await setActivePValueFormat(page, componentCase, reopenedA, true);
    expect(await pValueFormatForTab(page, reopenedA)).toBe(true);
    expect(await pValueFormatForTab(page, reopenedB)).toBe(bFormatBefore);
    await expect.poll(async () => (await panelTextForTab(page, componentCase, reopenedA)).text.replace(/[|\s]/g, '').length, { timeout: 20_000 }).toBeGreaterThan(0);

    const aFormatBeforeBInteraction = await pValueFormatForTab(page, reopenedA);
    await setActivePValueFormat(page, componentCase, reopenedB, false);
    expect(await pValueFormatForTab(page, reopenedB)).toBe(false);
    expect(await pValueFormatForTab(page, reopenedA)).toBe(aFormatBeforeBInteraction);
    await expect.poll(async () => (await panelTextForTab(page, componentCase, reopenedB)).text.replace(/[|\s]/g, '').length, { timeout: 20_000 }).toBeGreaterThan(0);

    expect(issues.critical, `${componentCase.key} critical browser issues`).toEqual([]);
  });
}
