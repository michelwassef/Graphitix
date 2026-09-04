const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

const CASES = [
  {
    type: 'survival',
    pageId: 'survivalPage',
    exampleButtonId: 'survivalLoadExample',
    managerKey: '__survivalDataViewsManager',
    notesPanelId: 'survivalGraphPanel',
    controlsA: { survivalShowCI: true, survivalShowCensor: false, survivalShowLegend: false, survivalShowHazardRatios: false, survivalFitCox: false },
    controlsB: { survivalShowCI: false, survivalShowCensor: true, survivalShowLegend: true, survivalShowHazardRatios: true, survivalFitCox: true }
  },
  {
    type: 'roc',
    pageId: 'rocPage',
    exampleButtonId: 'rocLoadExample',
    managerKey: '__rocDataViewsManager',
    notesPanelId: 'rocGraphPanel',
    controlsA: { rocGraphType: 'roc', rocShowGrid: true, rocShowFrame: false, rocShowLegend: false },
    controlsB: { rocGraphType: 'pr', rocShowGrid: false, rocShowFrame: true, rocShowLegend: true }
  },
  {
    type: 'hist',
    pageId: 'histPage',
    exampleButtonId: 'histLoadExample',
    managerKey: '__histDataViewsManager',
    notesPanelId: 'histGraphPanel',
    controlsA: { histPlotMode: 'histogram', histShowGrid: true, histShowFrame: false, histShowLegend: false, histLogY: false },
    controlsB: { histPlotMode: 'density', histShowGrid: false, histShowFrame: true, histShowLegend: true, histLogY: true }
  },
  {
    type: 'box',
    pageId: 'boxPage',
    exampleButtonId: 'boxLoadExample',
    managerKey: '__boxDataViewsManager',
    hotWrapperId: 'hotWrapper',
    notesPanelId: 'boxGraphPanel',
    controlsA: { boxShowGrid: true, boxShowFrame: false, boxShowLegend: false },
    controlsB: { boxShowGrid: false, boxShowFrame: true, boxShowLegend: true }
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    exampleButtonId: 'scatterLoadExample',
    managerKey: '__scatterDataViewsManager',
    notesPanelId: 'scatterGraphPanel',
    controlsA: { scatterShowGrid: true, scatterShowFrame: false, scatterShowLegend: false },
    controlsB: { scatterShowGrid: false, scatterShowFrame: true, scatterShowLegend: true }
  },
  {
    type: 'pca',
    pageId: 'pcaPage',
    exampleButtonId: 'pcaLoadExample',
    managerKey: '__pcaDataViewsManager',
    notesPanelId: 'pcaGraphPanel',
    controlsA: { pcaYAxis: '2', pcaShowGrid: false, pcaShowFrame: true, pcaShowLegend: true },
    controlsB: { pcaYAxis: '3', pcaShowGrid: true, pcaShowFrame: true, pcaShowLegend: false }
  },
  {
    type: 'line',
    pageId: 'linePage',
    exampleButtonId: 'lineLoadExample',
    managerKey: '__lineDataViewsManager',
    notesPanelId: 'lineGraphPanel',
    controlsA: { lineShowGrid: true, lineShowFrame: false, lineShowLegend: false },
    controlsB: { lineShowGrid: false, lineShowFrame: true, lineShowLegend: true }
  }
];

async function activateTabById(page, tabId, component) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForFunction(
    ({ id, type }) => {
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
      return active?.id === id && active?.type === type;
    },
    { id: tabId, type: component.type },
    { timeout: 20_000 }
  );
  await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
  await page.waitForTimeout(250);
}

async function openComponentTab(page, component, { first = false } = {}) {
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  await openComponentFromWelcome(page, component, { first, loadExample: true });
  await page.waitForFunction(type => !!window.Components?.[type]?.ready, component.type, { timeout: 35_000 });
  await page.waitForFunction(
    type => {
      const payload = window.Components?.[type]?.getPayload?.();
      return !!payload && Array.isArray(payload.data) && payload.data.length > 1;
    },
    component.type,
    { timeout: 35_000 }
  );
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  const tabId = after.find(id => id && !before.includes(id));
  expect(tabId).toBeTruthy();
  return tabId;
}

async function configureComponentTab(page, component, variant) {
  await page.evaluate(({ component, variant }) => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, component.type)
      || document.querySelector(`#${component.pageId}:not([hidden])`);
    if (!root) {
      throw new Error(`Active ${component.type} root not found`);
    }
    const setInput = (id, value) => {
      const el = root.querySelector(`#${id}`);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    Object.entries(variant.controls || {}).forEach(([id, value]) => setInput(id, value));
    const details = root.querySelector(`#${component.notesPanelId} details.shared-notes`);
    const editor = details?.querySelector?.('[data-notes-editor="1"], textarea') || null;
    if (details && editor) {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
      if ('value' in editor) {
        editor.value = variant.noteText;
      } else {
        editor.textContent = variant.noteText;
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const hotWrapperId = component.hotWrapperId || `${component.type}HotWrapper`;
    const wrapper = root.querySelector(`#${hotWrapperId}`);
    const manager = wrapper?.__dataViewsOwner || null;
    if (!manager || typeof manager.createDerivedView !== 'function') {
      throw new Error(`${component.type} DataViews manager not found`);
    }
    const data = Array.isArray(manager.getActiveView?.()?.data) ? manager.getActiveView().data : [];
    const derivedData = data.map((row, index) => {
      if (!Array.isArray(row)) return row;
      if (index === 0) return row.slice();
      return row.map((cell, col) => {
        const numeric = Number(cell);
        if (Number.isFinite(numeric) && col > 0) {
          return Number((numeric + variant.numericOffset).toFixed(4));
        }
        return cell;
      });
    });
    const view = manager.createDerivedView({
      title: variant.viewTitle,
      data: derivedData,
      transformSpec: { type: 'e2e-isolation', variant: variant.label },
      activate: true,
      reason: 'e2e-dataviews-notes-isolation'
    });
    if (!view || manager.getActiveView?.()?.title !== variant.viewTitle) {
      throw new Error(`${component.type} derived view did not become active`);
    }
    window.Components?.[component.type]?.draw?.({ reason: 'e2e-dataviews-notes-isolation' });
    return true;
  }, { component, variant });
  await page.waitForTimeout(500);
}

async function snapshotActiveTab(page, component) {
  return page.evaluate(({ component }) => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, component.type)
      || document.querySelector(`#${component.pageId}:not([hidden])`);
    const componentApi = window.Components?.[component.type] || {};
    const payload = componentApi.getPayload?.() || null;
    const config = payload?.config || {};
    const hotWrapperId = component.hotWrapperId || `${component.type}HotWrapper`;
    const wrapper = root?.querySelector?.(`#${hotWrapperId}`) || null;
    const manager = wrapper?.__dataViewsOwner || null;
    const serialized = manager?.serialize?.({ includeData: true }) || payload?.dataViews || null;
    const activeView = manager?.getActiveView?.() || null;
    const notesEditor = root?.querySelector?.(`#${component.notesPanelId} details.shared-notes [data-notes-editor="1"], #${component.notesPanelId} details.shared-notes textarea`) || null;
    const readInput = id => {
      const el = root?.querySelector?.(`#${id}`) || null;
      if (!el) return undefined;
      return el.type === 'checkbox' ? !!el.checked : String(el.value || '');
    };
    return {
      tabId: active?.id || null,
      activeViewTitle: activeView?.title || '',
      serializedActiveTitle: (serialized?.views || []).find(view => view.id === serialized?.activeViewId)?.title || '',
      viewTitles: (serialized?.views || []).map(view => view.title),
      notesDom: notesEditor ? ('value' in notesEditor ? notesEditor.value : notesEditor.textContent || '') : '',
      notesPayload: config.notes?.text || '',
      notesOpen: !!config.notes?.open,
      config,
      controls: Object.fromEntries(Object.keys(component.controlsA || {}).concat(Object.keys(component.controlsB || {})).map(id => [id, readInput(id)])),
      controlDisabled: Object.fromEntries(Object.keys(component.controlsA || {}).concat(Object.keys(component.controlsB || {})).map(id => {
        const el = root?.querySelector?.(`#${id}`) || null;
        return [id, !!el?.disabled];
      }))
    };
  }, { component });
}

async function captureArchive(page, stem) {
  const archive = await page.evaluate(async () => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-dataviews-notes-isolation'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { base64: btoa(binary) };
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, `${stem}.graph`);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function reopenArchive(page, archivePath, component) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForFunction(
    type => (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab && tab.type === type).length === 2,
    component.type,
    { timeout: 60_000 }
  );
}

async function findTabIdByNotesText(page, component, noteText) {
  return page.evaluate(({ type, noteText }) => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    const match = tabs.find(tab => {
      if(!tab || tab.type !== type){
        return false;
      }
      const notes = tab.payload?.config?.notes;
      const text = notes && typeof notes === 'object' ? notes.text : notes;
      return String(text || '') === String(noteText || '');
    });
    return match?.id || null;
  }, { type: component.type, noteText });
}

async function seedRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const openDb = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('graphitix-document-state', 2);
      request.onupgradeneeded = () => {
        if(!request.result.objectStoreNames.contains('snapshots')){
          request.result.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const context = window.Main.tabs.getSessionActionsContext();
    const graphTabs = (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab && !tab.isWelcome && tab.type);
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'recovery-interval',
      useWorker: true
    });
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        meta: {
          app: 'Graphitix',
          kind: 'recovery',
          version: 1,
          savedAt: new Date().toISOString(),
          updatedAt: Date.now(),
          reason: 'recovery-interval',
          dirty: true,
          hasData: true,
          tabCount: graphTabs.length,
          fileName: 'workspace.graph',
          fileScope: 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  });
}

async function recoverWorkspace(page, component) {
  await seedRecoverySnapshot(page);
  const dialogHandler = async dialog => { await dialog.accept(); };
  page.on('dialog', dialogHandler);
  try{
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDocumentOpenComplete(page);
    await page.waitForFunction(
      type => (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab && tab.type === type).length === 2,
      component.type,
      { timeout: 60_000 }
    );
  }finally{
    page.off('dialog', dialogHandler);
  }
}

function expectSnapshot(snapshot, expected, component) {
  expect(snapshot.activeViewTitle || snapshot.serializedActiveTitle).toBe(expected.viewTitle);
  expect(snapshot.viewTitles).toContain(expected.viewTitle);
  expect(snapshot.notesDom || snapshot.notesPayload).toContain(expected.noteText);
  expect(snapshot.notesPayload).toContain(expected.noteText);
  expect(snapshot.notesOpen).toBe(true);
  for (const [id, value] of Object.entries(expected.controls || {})) {
    expect(snapshot.controls[id], `${component.type} DOM control ${id}`).toBe(value);
    expect(snapshot.controlDisabled[id], `${component.type} DOM control ${id} must remain enabled`).toBe(false);
  }
}

for (const component of CASES) {
  test(`${component.type} DataViews, notes, and controls stay isolated across same-type switch, reopen, and recovery`, async ({ page }) => {
    test.setTimeout(240_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

    const first = {
      label: 'A',
      viewTitle: `${component.type} derived view A`,
      noteText: `${component.type} notes A`,
      numericOffset: 0.101,
      controls: component.controlsA
    };
    const second = {
      label: 'B',
      viewTitle: `${component.type} derived view B`,
      noteText: `${component.type} notes B`,
      numericOffset: 0.202,
      controls: component.controlsB
    };

    const firstId = await openComponentTab(page, component, { first: true });
    const secondId = await openComponentTab(page, component);
    expect(secondId).not.toBe(firstId);

    await activateTabById(page, firstId, component);
    await configureComponentTab(page, component, first);
    await activateTabById(page, secondId, component);
    await configureComponentTab(page, component, second);

    for (let i = 0; i < 3; i += 1) {
      await activateTabById(page, firstId, component);
      expectSnapshot(await snapshotActiveTab(page, component), first, component);
      await activateTabById(page, secondId, component);
      expectSnapshot(await snapshotActiveTab(page, component), second, component);
    }

    const archivePath = await captureArchive(page, `${component.type}-dataviews-notes-isolation`);
    await reopenArchive(page, archivePath, component);
    const reopenedFirstId = await findTabIdByNotesText(page, component, first.noteText);
    const reopenedSecondId = await findTabIdByNotesText(page, component, second.noteText);
    expect(reopenedFirstId, `${component.type} reopened tab A must retain its canonical note`).toBeTruthy();
    expect(reopenedSecondId, `${component.type} reopened tab B must retain its canonical note`).toBeTruthy();
    expect(reopenedSecondId).not.toBe(reopenedFirstId);

    await activateTabById(page, reopenedFirstId, component);
    expectSnapshot(await snapshotActiveTab(page, component), first, component);
    await activateTabById(page, reopenedSecondId, component);
    expectSnapshot(await snapshotActiveTab(page, component), second, component);
    await activateTabById(page, reopenedFirstId, component);
    expectSnapshot(await snapshotActiveTab(page, component), first, component);

    await recoverWorkspace(page, component);
    const recoveredFirstId = await findTabIdByNotesText(page, component, first.noteText);
    const recoveredSecondId = await findTabIdByNotesText(page, component, second.noteText);
    expect(recoveredFirstId, `${component.type} recovered tab A must retain its canonical note`).toBeTruthy();
    expect(recoveredSecondId, `${component.type} recovered tab B must retain its canonical note`).toBeTruthy();
    expect(recoveredSecondId).not.toBe(recoveredFirstId);

    await activateTabById(page, recoveredFirstId, component);
    expectSnapshot(await snapshotActiveTab(page, component), first, component);
    await activateTabById(page, recoveredSecondId, component);
    expectSnapshot(await snapshotActiveTab(page, component), second, component);
    await activateTabById(page, recoveredFirstId, component);
    expectSnapshot(await snapshotActiveTab(page, component), first, component);

    expect(issues.critical).toEqual([]);
  });
}
