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

const TMP_DIR = path.resolve(__dirname, '.tmp-render-cache-lifecycle');
const COMPONENTS = ['scatter', 'box', 'line'];
const DATA_SIZES = ['light', 'heavy'];
const TOPOLOGIES = ['single', 'mixed'];
const RESTORE_MODES = ['reopen', 'recovery'];

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function sanitizeDiagnosticFileName(name) {
  return String(name || 'diagnostic')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'diagnostic';
}

async function attachJson(testInfo, name, value) {
  const fileName = sanitizeDiagnosticFileName(String(name || 'diagnostic').endsWith('.json') ? name : `${name}.json`);
  const serialized = stableJson(value);
  const paths = [];

  if (testInfo && typeof testInfo.outputPath === 'function') {
    paths.push(testInfo.outputPath(fileName));
  }

  // Also write a stable copy under test-results so the diagnostics can be collected
  // with `Get-ChildItem .\test-results -Recurse -Filter *.json` regardless of the
  // Playwright reporter's attachment handling. This is intentionally test-only.
  const titleSlug = sanitizeDiagnosticFileName(testInfo?.title || 'unknown-test');
  paths.push(path.resolve(process.cwd(), 'test-results', 'render-cache-diagnostics-json', titleSlug, fileName));

  let primaryPath = null;
  for (const outputPath of Array.from(new Set(paths))) {
    try {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, serialized, 'utf8');
      if (!primaryPath) primaryPath = outputPath;
    } catch (_err) {
      // Do not let diagnostics-writing failures hide the actual lifecycle failure.
    }
  }

  if (testInfo && typeof testInfo.attach === 'function' && primaryPath) {
    await testInfo.attach(fileName, {
      path: primaryPath,
      contentType: 'application/json'
    });
  }
}

function installLifecycleConsoleCapture(page) {
  const records = [];
  page.on('console', message => {
    const text = message.text();
    if (!/(render cache|render-cache|archive render cache|archiveRenderCache|promoted to runtime|fallback|redraw|restore|workspace state persisted|persistActiveTabState|recovery)/i.test(text)) {
      return;
    }
    records.push({
      type: message.type(),
      text,
      location: message.location?.() || null,
      timestamp: Date.now()
    });
  });
  return records;
}

async function clearRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const openDb = () => new Promise((resolve) => {
      const request = window.indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    const db = await openDb();
    if (!db || !db.objectStoreNames.contains('snapshots')) return;
    await new Promise(resolve => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').delete('active-recovery');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
    db.close?.();
  });
}

async function openFreshApp(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await clearRecoverySnapshot(page);
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
}

async function openNewTabType(page, type, reason = 'e2e-open-new-tab') {
  const idsBefore = await page.evaluate(() => Array.from(
    document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]')
  ).map(node => String(node.getAttribute('data-tab-id') || '').trim()).filter(Boolean));

  await page.evaluate(async ({ graphType, reasonText }) => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    if (tabs && typeof tabs.handleGraphSelection === 'function') {
      const maybe = tabs.handleGraphSelection(graphType, { reason: reasonText || 'e2e-open-new-tab' });
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const emptyButton = document.getElementById('duplicateEmpty');
    if (prompt && emptyButton && !emptyButton.disabled) {
      emptyButton.click();
      await new Promise(resolve => setTimeout(resolve, 220));
    }
  }, { graphType: type, reasonText: reason });

  const visibleCard = page.locator(`#graphSelectionGrid [data-graph-type="${type}"]`).first();
  if (await visibleCard.isVisible().catch(() => false)) {
    await visibleCard.click({ force: true });
  }
  await page.waitForSelector(`#${type}Page:not([hidden])`, { timeout: 30_000 });

  const idsAfter = await page.evaluate(() => Array.from(
    document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]')
  ).map(node => String(node.getAttribute('data-tab-id') || '').trim()).filter(Boolean));
  return idsAfter.find(id => !idsBefore.includes(id)) || await activeTabId(page);
}

async function activeTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function activateTab(page, tabId) {
  await page.evaluate(async (id) => {
    const activate = window.Main?.tabs?.activateTab;
    if (typeof activate !== 'function') return;
    const maybe = activate(id, { reason: 'e2e-cache-lifecycle-activate' });
    if (maybe && typeof maybe.then === 'function') await maybe;
  }, tabId);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
}

async function waitForScatterHot(page) {
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.()
      || window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__getState?.()?.hot;
    return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
  }, null, { timeout: 60_000 });
}

async function waitForBoxHot(page) {
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    const hot = state?.ensureHotForActiveTab?.() || state?.hot || null;
    return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
  }, null, { timeout: 60_000 });
}

async function waitForLineHot(page) {
  await page.waitForFunction(() => {
    const line = window.Components?.line || null;
    const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot || null;
    return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
  }, null, { timeout: 60_000 });
}

async function loadScatterData(page, size, marker) {
  const rowCount = size === 'heavy' ? 25_000 : 80;
  await waitForScatterHot(page);
  await page.evaluate(({ count, markerText }) => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.()
      || window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__getState?.()?.hot;
    if (!hot || typeof hot.loadData !== 'function') throw new Error('scatter hot table unavailable');
    const rows = [['Label', 'X', 'Y']];
    for (let idx = 1; idx <= count; idx += 1) {
      rows.push([
        `${markerText}${idx}`,
        (idx / 97).toFixed(5),
        (Math.sin(idx / 23) * 8 + Math.cos(idx / 71) * 3 + idx / 1200).toFixed(5)
      ]);
    }
    const graphType = document.getElementById('scatterGraphType');
    if (graphType) {
      graphType.value = 'scatter';
      graphType.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hot.loadData(rows);
    window.Components?.scatter?.draw?.({ reason: `e2e-${markerText}-${count}` });
  }, { count: rowCount, markerText: marker });
  await waitForComponentRenderer(page, 'scatter', size);
}

async function loadBoxData(page, size, marker) {
  const rowCount = size === 'heavy' ? 2_200 : 60;
  await waitForBoxHot(page);
  await page.evaluate(({ count, markerText }) => {
    const state = window.Components?.box?.__getState?.() || null;
    const hot = state?.ensureHotForActiveTab?.() || state?.hot || null;
    if (!hot || typeof hot.loadData !== 'function') throw new Error('box hot table unavailable');
    const rows = [[`${markerText}-Control`, `${markerText}-Treatment A`, `${markerText}-Treatment B`]];
    for (let idx = 1; idx <= count; idx += 1) {
      rows.push([
        (Math.sin(idx / 17) * 2 + idx / 800).toFixed(5),
        (Math.cos(idx / 29) * 2.5 + 1 + idx / 900).toFixed(5),
        (Math.sin(idx / 41) * 1.5 + 2 + idx / 1000).toFixed(5)
      ]);
    }
    hot.loadData(rows);
    window.Components?.box?.draw?.({ reason: `e2e-${markerText}-${count}` });
  }, { count: rowCount, markerText: marker });
  await waitForComponentRenderer(page, 'box', size);
}

async function loadLineData(page, size, marker) {
  const rowCount = size === 'heavy' ? 18_000 : 120;
  await waitForLineHot(page);
  await page.evaluate(({ count, markerText }) => {
    const line = window.Components?.line || null;
    const hot = line?.__ensureHotForActiveTab?.() || line?.__getState?.()?.hot || null;
    if (!hot || typeof hot.loadData !== 'function') throw new Error('line hot table unavailable');
    const rows = [['X', `${markerText}-Series A`, `${markerText}-Series B`]];
    for (let idx = 1; idx <= count; idx += 1) {
      rows.push([
        idx,
        (Math.sin(idx / 37) * 7 + idx / 900).toFixed(5),
        (Math.cos(idx / 53) * 5 + 2 + idx / 1200).toFixed(5)
      ]);
    }
    hot.loadData(rows, { source: 'e2e-line-render-cache-lifecycle', skipUndo: true });
    const origin = document.getElementById('lineOriginMode');
    if (origin) {
      origin.value = 'zero';
      origin.dispatchEvent(new Event('change', { bubbles: true }));
    }
    line?.draw?.({ force: true, reason: `e2e-${markerText}-${count}`, skipThresholdEvaluation: true });
  }, { count: rowCount, markerText: marker });
  await waitForComponentRenderer(page, 'line', size);
}

async function waitForComponentRenderer(page, type, size) {
  const selector = type === 'scatter'
    ? '#scatterPage:not([hidden]) #scatterPlot svg'
    : type === 'box'
      ? '#boxPage:not([hidden]) #boxPlot svg'
      : '#linePage:not([hidden]) #linePlot svg';
  await page.waitForSelector(selector, { timeout: 60_000 });
  await page.waitForFunction(({ componentType, expectedSize }) => {
    const hasPaintedCanvas = (canvas) => {
      if (!canvas || !canvas.width || !canvas.height) return false;
      const rect = canvas.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      const ctx = canvas.getContext?.('2d', { willReadFrequently: true });
      if (!ctx) return false;
      try {
        const sampleWidth = Math.max(1, Math.min(canvas.width, 360));
        const sampleHeight = Math.max(1, Math.min(canvas.height, 360));
        const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
        for (let idx = 3; idx < data.length; idx += 4) {
          if (data[idx] !== 0) return true;
        }
      } catch (_err) { return false; }
      return false;
    };
    const hasDecodedBitmapImage = (image) => {
      if (!image) return false;
      const rect = image.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      const src = String(image.getAttribute?.('src') || '').trim();
      return !!src && image.complete !== false && (Number(image.naturalWidth) || 0) > 0 && (Number(image.naturalHeight) || 0) > 0;
    };
    const root = componentType === 'scatter'
      ? document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg')
      : componentType === 'box'
        ? document.querySelector('#boxPage:not([hidden]) #boxPlot svg')
        : document.querySelector('#linePage:not([hidden]) #linePlot svg');
    if (!root) return false;
    const canvases = Array.from(root.querySelectorAll('foreignObject canvas, foreignobject canvas'));
    const bitmaps = Array.from(root.querySelectorAll('foreignObject img[data-graphitix-render-cache-canvas-bitmap="true"], foreignobject img[data-graphitix-render-cache-canvas-bitmap="true"]'));
    if (expectedSize === 'heavy' && (componentType === 'scatter' || componentType === 'box')) {
      return canvases.some(hasPaintedCanvas) || bitmaps.some(hasDecodedBitmapImage);
    }
    const visiblePoint = root.querySelector('circle, path, rect, line, polyline, polygon, foreignObject, foreignobject');
    return !!visiblePoint;
  }, { componentType: type, expectedSize: size }, { timeout: size === 'heavy' ? 120_000 : 60_000 });
}

async function loadComponentData(page, type, size, marker) {
  if (type === 'scatter') {
    await loadScatterData(page, size, marker);
  } else if (type === 'box') {
    await loadBoxData(page, size, marker);
  } else if (type === 'line') {
    await loadLineData(page, size, marker);
  } else {
    throw new Error(`Unsupported cache-lifecycle component: ${type}`);
  }
}

async function getTabState(page, tabId) {
  return page.evaluate((id) => {
    const workspace = window.Main?.session?.workspaceState || {};
    const tab = Array.isArray(workspace.tabs) ? workspace.tabs.find(item => item?.id === id) : null;
    return {
      id,
      exists: !!tab,
      type: tab?.type || null,
      title: tab?.title || null,
      active: workspace.activeTabId === id,
      payloadSignatureLength: String(tab?.payloadSignature || '').length,
      layoutSignatureLength: String(tab?.layoutSignature || '').length,
      previewSignatureLength: String(tab?.previewSignature || '').length,
      previewHasBitmap: typeof tab?.previewMarkup === 'string' ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"') : false,
      hasRenderCache: !!tab?.renderCache,
      hasArchiveRenderCache: !!tab?.archiveRenderCache,
      renderCacheSignatureLength: String(tab?.renderCacheSignature || tab?.renderCache?.payloadSignature || '').length,
      renderCacheLayoutSignatureLength: String(tab?.renderCacheLayoutSignature || tab?.renderCache?.layoutSignature || '').length,
      archiveRenderCacheSignatureLength: String(tab?.archiveRenderCacheSignature || '').length,
      archiveRenderCacheLayoutSignatureLength: String(tab?.archiveRenderCacheLayoutSignature || '').length,
      payloadDirty: !!tab?.payloadDirty,
      userModified: !!tab?.userModified,
      hasAuthoritativeRenderRestoreProperty: Object.prototype.hasOwnProperty.call(tab || {}, ['authoritative', 'Render', 'Restore'].join(''))
    };
  }, tabId);
}

async function collectWorkspaceDiagnostics(page, label, targetTabId = null) {
  return page.evaluate(({ diagnosticLabel, targetId }) => {
    const tabs = Array.isArray(window.Main?.session?.workspaceState?.tabs) ? window.Main.session.workspaceState.tabs : [];
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const summarizeCache = (cacheLike) => {
      const envelope = cacheLike && cacheLike.cache ? cacheLike.cache : cacheLike;
      const cache = envelope && typeof envelope === 'object' ? envelope : null;
      if (!cache) return { present: false, keys: [], bitmapMarkerCount: 0, serializedLength: 0, metadata: null };
      let serialized = '';
      try { serialized = JSON.stringify(cache); } catch (_err) { serialized = ''; }
      return {
        present: true,
        keys: Object.keys(cache).sort(),
        bitmapMarkerCount: (serialized.match(/data-graphitix-render-cache-canvas-bitmap/g) || []).length,
        canvasMarkerCount: (serialized.match(/<canvas|canvas/gi) || []).length,
        serializedLength: serialized.length,
        metadata: cache.__graphitixRenderCache || cache.metadata || cache.meta || null,
        envelopePayloadSignatureLength: String(cacheLike?.payloadSignature || '').length,
        envelopeLayoutSignatureLength: String(cacheLike?.layoutSignature || '').length,
        envelopeCapturedAt: Number(cacheLike?.capturedAt || 0),
        envelopeCaptureSequence: Number(cacheLike?.captureSequence || 0),
        envelopePayloadVersion: Number(cacheLike?.payloadVersion || 0),
        envelopeLayoutVersion: Number(cacheLike?.layoutVersion || 0),
        envelopeRenderCommitVersion: Number(cacheLike?.renderCommitVersion || 0)
      };
    };
    const domSummary = (() => {
      const active = tabs.find(tab => tab && tab.id === activeTabId) || null;
      const type = active?.type || null;
      const root = type === 'scatter'
        ? document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg')
        : type === 'box'
          ? document.querySelector('#boxPage:not([hidden]) #boxPlot svg')
          : type === 'line'
            ? document.querySelector('#linePage:not([hidden]) #linePlot svg')
            : null;
      if (!root) return { type, present: false };
      const canvases = Array.from(root.querySelectorAll('foreignObject canvas, foreignobject canvas'));
      const bitmaps = Array.from(root.querySelectorAll('foreignObject img[data-graphitix-render-cache-canvas-bitmap="true"], foreignobject img[data-graphitix-render-cache-canvas-bitmap="true"]'));
      const scatterLayer = type === 'scatter' ? root.querySelector('[data-layer="points"]') : null;
      return {
        type,
        present: true,
        renderMode: scatterLayer?.getAttribute?.('data-render-mode') || null,
        canvasCount: canvases.length,
        bitmapCount: bitmaps.length,
        bitmapDecodedCount: bitmaps.filter(img => img.complete !== false && (Number(img.naturalWidth) || 0) > 0).length,
        pointLikeNodeCount: root.querySelectorAll('circle, path, rect, line, polyline, polygon, foreignObject, foreignobject').length
      };
    })();
    return {
      label: diagnosticLabel,
      activeTabId,
      targetTabId: targetId,
      sessionDirty: !!window.Main?.session?.workspaceState?.sessionDirty,
      sessionUserDirty: !!window.Main?.session?.workspaceState?.sessionUserDirty,
      dom: domSummary,
      tabs: tabs.filter(tab => tab && !tab.isWelcome && tab.type).map(tab => ({
        id: tab.id,
        type: tab.type,
        title: tab.title || null,
        active: tab.id === activeTabId,
        target: tab.id === targetId,
        payloadSignatureLength: String(tab.payloadSignature || '').length,
        layoutSignatureLength: String(tab.layoutSignature || '').length,
        previewSignatureLength: String(tab.previewSignature || '').length,
        previewHasBitmap: typeof tab.previewMarkup === 'string' ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"') : false,
        hasRenderCache: !!tab.renderCache,
        hasArchiveRenderCache: !!tab.archiveRenderCache,
        renderCacheSignatureLength: String(tab.renderCacheSignature || tab.renderCache?.payloadSignature || '').length,
        renderCacheLayoutSignatureLength: String(tab.renderCacheLayoutSignature || tab.renderCache?.layoutSignature || '').length,
        archiveRenderCacheSignatureLength: String(tab.archiveRenderCacheSignature || '').length,
        archiveRenderCacheLayoutSignatureLength: String(tab.archiveRenderCacheLayoutSignature || '').length,
        renderCache: summarizeCache(tab.renderCache),
        archiveRenderCache: summarizeCache(tab.archiveRenderCache),
        payloadDirty: !!tab.payloadDirty,
        userModified: !!tab.userModified,
        hasAuthoritativeRenderRestoreProperty: Object.prototype.hasOwnProperty.call(tab || {}, ['authoritative', 'Render', 'Restore'].join(''))
      }))
    };
  }, { diagnosticLabel: label, targetId: targetTabId });
}

async function summarizeArchiveBlobInPage(page, blobBase64, label) {
  return page.evaluate(async ({ b64, diagnosticLabel }) => {
    const graphArchive = window.Shared?.graphArchive;
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') throw new Error('Shared.graphArchive.parseFile unavailable');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/zip' });
    const parsed = await graphArchive.parseFile(blob, { fileName: `${diagnosticLabel}.graph` });
    const tabs = Array.isArray(parsed?.session?.tabs) ? parsed.session.tabs : [];
    const summarizeCache = (cache) => {
      if (!cache || typeof cache !== 'object') return { present: false, keys: [], bitmapMarkerCount: 0, serializedLength: 0 };
      let serialized = '';
      try { serialized = JSON.stringify(cache); } catch (_err) { serialized = ''; }
      return {
        present: true,
        keys: Object.keys(cache).sort(),
        bitmapMarkerCount: (serialized.match(/data-graphitix-render-cache-canvas-bitmap/g) || []).length,
        canvasMarkerCount: (serialized.match(/<canvas|canvas/gi) || []).length,
        serializedLength: serialized.length,
        metadata: cache.__graphitixRenderCache || cache.metadata || cache.meta || null
      };
    };
    return {
      label: diagnosticLabel,
      source: parsed?.source || null,
      activeIndex: parsed?.session?.activeIndex ?? null,
      tabCount: tabs.length,
      tabs: tabs.map((tab, index) => ({
        index,
        title: tab?.title || null,
        type: tab?.type || tab?.payload?.type || null,
        hasArchiveRenderCache: !!tab?.archiveRenderCache,
        archiveRenderCacheSignatureLength: String(tab?.archiveRenderCacheSignature || '').length,
        archiveRenderCacheLayoutSignatureLength: String(tab?.archiveRenderCacheLayoutSignature || '').length,
        previewHasBitmap: typeof tab?.previewMarkup === 'string' ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"') : false,
        archiveRenderCache: summarizeCache(tab?.archiveRenderCache)
      }))
    };
  }, { b64: blobBase64, diagnosticLabel: label });
}

async function buildArchiveBlob(page, mode, label) {
  return page.evaluate(async ({ snapshotMode, diagnosticLabel }) => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    if (!tabsApi || typeof tabsApi.getSessionActionsContext !== 'function') throw new Error('Main.tabs.getSessionActionsContext unavailable');
    if (!sessionActions || typeof sessionActions.buildWorkspaceArchiveBlob !== 'function') throw new Error('Main.sessionActions.buildWorkspaceArchiveBlob unavailable');
    const context = tabsApi.getSessionActionsContext();
    const options = snapshotMode === 'recovery'
      ? { scope: 'workspace', snapshotKind: 'recovery', policyMode: 'recovery', reason: diagnosticLabel, idleForMs: 8_000, useWorker: true }
      : { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE', reason: diagnosticLabel };
    const policy = window.Main?.snapshotPolicy?.resolveArchiveBuildPolicy?.({
      mode: snapshotMode === 'recovery' ? 'recovery' : 'manual-save',
      snapshotKind: options.snapshotKind,
      reason: diagnosticLabel,
      scope: 'workspace',
      idleForMs: options.idleForMs
    }) || null;
    const beforeBuild = await window.__collectGraphitixCacheDiagnostics?.(`${diagnosticLabel}-before-build`);
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, options);
    if (!blob) throw new Error(`${snapshotMode} archive blob was empty`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return { base64: btoa(binary), byteLength: bytes.length, policy, beforeBuild };
  }, { snapshotMode: mode, diagnosticLabel: label });
}

async function saveArchiveToPath(archive, fileStem) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, `${fileStem}.graph`);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function loadWorkspaceArchiveFromPath(page, archivePath) {
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForTimeout(1_000);
}

async function seedRecoverySnapshot(page, archive, scenarioLabel) {
  await page.evaluate(async ({ b64, label }) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/zip' });
    const workspaceState = window.Main?.session?.workspaceState || {};
    const openDb = () => new Promise((resolve, reject) => {
      const request = window.indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
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
          reason: label,
          dirty: true,
          hasData: true,
          tabCount: Array.isArray(workspaceState.tabs) ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type).length : 0,
          fileName: workspaceState.sessionFileName || 'workspace.graph',
          filePath: workspaceState.sessionFilePath || '',
          fileScope: workspaceState.sessionFileScope || 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB recovery snapshot write failed'));
    });
    db.close?.();
  }, { b64: archive.base64, label: scenarioLabel });
}

async function reloadAndAcceptRecovery(page) {
  let acceptedDialog = false;
  const dialogHandler = async dialog => {
    acceptedDialog = true;
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.Main?.session?.workspaceState?.sessionUserDirty === true,
      null,
      { timeout: 60_000 }
    );
  } finally {
    page.off('dialog', dialogHandler);
  }
  return acceptedDialog;
}

async function buildScenarioWorkspace(page, { component, size, topology }) {
  await openFreshApp(page);
  await openComponentFromWelcome(page, { type: component, pageId: `${component}Page` }, { first: true });
  const targetTabId = await activeTabId(page);
  expect(targetTabId).toBeTruthy();
  await loadComponentData(page, component, size, `${component}-${size}-target-`);

  let auxiliary = null;
  if (topology === 'mixed') {
    const auxType = component === 'scatter' ? 'box' : 'scatter';
    const auxTabId = await openNewTabType(page, auxType, `e2e-${component}-${size}-mixed-aux`);
    expect(auxTabId).toBeTruthy();
    await loadComponentData(page, auxType, 'light', `${auxType}-light-aux-`);
    auxiliary = { tabId: auxTabId, type: auxType, size: 'light' };
    // loadComponentData() already waits for the auxiliary renderer while that
    // newly created tab is active. Re-activating it here can re-enter the
    // restore/cache lifecycle and obscure the target heavy-tab diagnostics.
    if (await activeTabId(page) !== auxTabId) {
      await activateTab(page, auxTabId);
    }
  } else {
    await activateTab(page, targetTabId);
    await waitForComponentRenderer(page, component, size);
  }

  const targetBeforeSnapshot = await getTabState(page, targetTabId);
  return {
    target: { tabId: targetTabId, type: component, size },
    auxiliary,
    topology,
    activeBeforeSnapshot: await activeTabId(page),
    targetBeforeSnapshot
  };
}

async function findRestoredTargetTab(page, component) {
  return page.evaluate((type) => {
    const tabs = Array.isArray(window.Main?.session?.workspaceState?.tabs) ? window.Main.session.workspaceState.tabs : [];
    const matches = tabs.filter(tab => tab && !tab.isWelcome && tab.type === type);
    return matches[0]?.id || null;
  }, component);
}

function cacheIdentityForDiagnostics(tab) {
  if (!tab) return 'missing-tab';
  const cacheIdentity = (entry) => {
    if (!entry?.present) return 'absent';
    const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    return [
      'present',
      entry.envelopeCaptureSequence || 0,
      entry.envelopeCapturedAt || 0,
      entry.envelopePayloadVersion || 0,
      entry.envelopeLayoutVersion || 0,
      entry.envelopeRenderCommitVersion || 0,
      entry.envelopePayloadSignatureLength || 0,
      entry.envelopeLayoutSignatureLength || 0,
      entry.serializedLength || 0,
      metadata.normalizedAt || 0,
      metadata.reason || '',
      metadata.graphicKey || '',
      metadata.previewKey || ''
    ].join(':');
  };
  return [
    tab.id || '',
    tab.type || '',
    cacheIdentity(tab.renderCache),
    cacheIdentity(tab.archiveRenderCache)
  ].join('|');
}

function cacheWasInvalidatedOrReplaced(beforeTab, afterTab) {
  if (!beforeTab || !afterTab || afterTab.userModified !== true) return false;
  const hadCacheBefore = !!(beforeTab.hasRenderCache || beforeTab.hasArchiveRenderCache);
  if (!hadCacheBefore) return true;
  const hasCacheAfter = !!(afterTab.hasRenderCache || afterTab.hasArchiveRenderCache);
  if (!hasCacheAfter) return true;
  return cacheIdentityForDiagnostics(beforeTab) !== cacheIdentityForDiagnostics(afterTab);
}

async function performUserGraphEditAndCollect(page, testInfo, tabId, component, label) {
  await activateTab(page, tabId);
  const before = await collectWorkspaceDiagnostics(page, `${label}-before-user-edit`, tabId);
  const beforeTargetTab = before?.tabs?.find(item => item?.id === tabId || item?.target) || null;
  const beforeCacheIdentity = cacheIdentityForDiagnostics(beforeTargetTab);
  await attachJson(testInfo, `${label}-before-user-edit.json`, {
    ...before,
    targetCacheIdentity: beforeCacheIdentity
  });

  const editResult = await page.evaluate((type) => {
    const selectors = type === 'scatter'
      ? ['#scatterPage:not([hidden]) #scatterFill', '#scatterPage:not([hidden]) #scatterShowGrid', '#scatterPage:not([hidden]) #scatterFontSize', '#scatterPage:not([hidden]) #scatterDotSize']
      : type === 'box'
        ? ['#boxPage:not([hidden]) #boxShowGrid', '#boxPage:not([hidden]) #boxFontSize', '#boxPage:not([hidden]) #boxGraphType', '#boxPage:not([hidden]) #boxYMax']
        : ['#linePage:not([hidden]) #lineShowGrid', '#linePage:not([hidden]) #lineFontSize', '#linePage:not([hidden]) #lineYMax', '#linePage:not([hidden]) #lineOriginMode'];
    const input = selectors.map(selector => document.querySelector(selector)).find(Boolean) || null;
    if (!input) return { edited: false, reason: 'missing-control', selectors };
    const flag = window.Main?.session?.__USER_TRUSTED_FLAG__ || '__graphitixUserTrusted';
    const dispatchTrusted = (eventType) => {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      event[flag] = true;
      input.dispatchEvent(event);
    };
    const beforeValue = input.type === 'checkbox' ? !!input.checked : String(input.value ?? '');
    if (input.type === 'checkbox') {
      input.checked = !input.checked;
    } else if (input.tagName === 'SELECT') {
      const options = Array.from(input.options || []);
      const next = options[(Math.max(0, input.selectedIndex || 0) + 1) % Math.max(1, options.length)] || null;
      if (next) input.value = next.value;
    } else if (input.type === 'number' || input.type === 'range') {
      const current = Number(input.value);
      const step = Number(input.step) || 1;
      const max = Number(input.max);
      const min = Number(input.min);
      let next = Number.isFinite(current) ? current + step : 1;
      if (Number.isFinite(max) && next > max) next = Number.isFinite(min) ? min : current - step;
      input.value = String(next);
    } else {
      input.value = type === 'scatter' ? '#cc5500' : '#4477aa';
    }
    dispatchTrusted('input');
    dispatchTrusted('change');
    return {
      edited: true,
      selector: input.id ? `#${input.id}` : null,
      tagName: input.tagName,
      type: input.type || null,
      beforeValue,
      afterValue: input.type === 'checkbox' ? !!input.checked : String(input.value ?? '')
    };
  }, component);

  if (editResult.edited) {
    await page.waitForFunction((id) => {
      const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id) || null;
      return !!tab && tab.userModified === true;
    }, tabId, { timeout: 10_000 }).catch(() => {});
  }
  await waitForComponentRenderer(page, component, component === 'scatter' ? 'light' : 'light').catch(() => {});
  const after = await collectWorkspaceDiagnostics(page, `${label}-after-user-edit`, tabId);
  const afterTargetTab = after?.tabs?.find(item => item?.id === tabId || item?.target) || null;
  const afterCacheIdentity = cacheIdentityForDiagnostics(afterTargetTab);
  const invalidated = cacheWasInvalidatedOrReplaced(beforeTargetTab, afterTargetTab);
  await attachJson(testInfo, `${label}-after-user-edit.json`, {
    editResult,
    invalidated,
    beforeTargetCacheIdentity: beforeCacheIdentity,
    afterTargetCacheIdentity: afterCacheIdentity,
    cacheIdentityChanged: beforeCacheIdentity !== afterCacheIdentity,
    after
  });
  return { editResult, invalidated, before, after };
}

function targetCachePresence(diagnostics, tabId) {
  const tab = diagnostics?.tabs?.find(item => item.id === tabId || item.target) || null;
  return {
    hasRuntimeCache: !!tab?.hasRenderCache,
    hasArchiveCache: !!tab?.hasArchiveRenderCache,
    hasAnyCache: !!(tab?.hasRenderCache || tab?.hasArchiveRenderCache),
    renderCacheBitmapMarkerCount: Number(tab?.renderCache?.bitmapMarkerCount || 0),
    archiveCacheBitmapMarkerCount: Number(tab?.archiveRenderCache?.bitmapMarkerCount || 0),
    renderCacheSerializedLength: Number(tab?.renderCache?.serializedLength || 0),
    archiveCacheSerializedLength: Number(tab?.archiveRenderCache?.serializedLength || 0)
  };
}

async function runLifecycleScenario(page, testInfo, scenario, issues) {
  const label = `${scenario.mode}-${scenario.topology}-${scenario.size}-${scenario.component}`;
  const consoleRecords = installLifecycleConsoleCapture(page);
  const workspace = await buildScenarioWorkspace(page, scenario);

  await attachJson(testInfo, `${label}-00-before-snapshot-workspace.json`, await collectWorkspaceDiagnostics(page, `${label}-00-before-snapshot`, workspace.target.tabId));

  const snapshotMode = scenario.mode === 'recovery' ? 'recovery' : 'document';
  const archive = await buildArchiveBlob(page, snapshotMode, label);
  const archiveSummary = await summarizeArchiveBlobInPage(page, archive.base64, `${label}-snapshot-file`);
  await attachJson(testInfo, `${label}-01-snapshot-created.json`, {
    byteLength: archive.byteLength,
    policy: archive.policy,
    beforeBuild: archive.beforeBuild,
    archiveSummary
  });

  if (scenario.mode === 'reopen') {
    const archivePath = await saveArchiveToPath(archive, label);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await loadWorkspaceArchiveFromPath(page, archivePath);
    await attachJson(testInfo, `${label}-02-after-document-open.json`, await collectWorkspaceDiagnostics(page, `${label}-02-after-document-open`));
  } else {
    await seedRecoverySnapshot(page, archive, label);
    await reloadAndAcceptRecovery(page);
    await attachJson(testInfo, `${label}-02-after-recovery-open.json`, await collectWorkspaceDiagnostics(page, `${label}-02-after-recovery-open`));
  }

  const afterOpen = await collectWorkspaceDiagnostics(page, `${label}-03-after-open`);
  await attachJson(testInfo, `${label}-03-after-open.json`, afterOpen);

  const restoredTargetTabId = await findRestoredTargetTab(page, scenario.component);
  expect(restoredTargetTabId, `${label}: restored target tab not found`).toBeTruthy();
  await attachJson(testInfo, `${label}-04-before-target-activation.json`, await collectWorkspaceDiagnostics(page, `${label}-04-before-target-activation`, restoredTargetTabId));

  await activateTab(page, restoredTargetTabId);
  await attachJson(testInfo, `${label}-05-after-target-activation-before-render-wait.json`, await collectWorkspaceDiagnostics(page, `${label}-05-after-target-activation-before-render-wait`, restoredTargetTabId));
  await waitForComponentRenderer(page, scenario.component, scenario.size);
  const afterRenderWait = await collectWorkspaceDiagnostics(page, `${label}-06-after-target-render-wait`, restoredTargetTabId);
  await attachJson(testInfo, `${label}-06-after-target-render-wait.json`, afterRenderWait);

  const edit = await performUserGraphEditAndCollect(page, testInfo, restoredTargetTabId, scenario.component, `${label}-07-cache-invalidation`);
  const summary = {
    scenario,
    workspace,
    restoredTargetTabId,
    snapshotTargetCache: archiveSummary.tabs.find(tab => tab.type === scenario.component) || null,
    afterOpenTargetCache: targetCachePresence(afterOpen, restoredTargetTabId),
    afterRenderWaitTargetCache: targetCachePresence(afterRenderWait, restoredTargetTabId),
    editInvalidatedCache: edit.invalidated,
    consoleRecords: consoleRecords.slice(-300),
    criticalIssues: issues?.critical || []
  };
  await attachJson(testInfo, `${label}-08-lifecycle-summary.json`, summary);

  expect(issues.critical).toEqual([]);
  expect(edit.editResult.edited, `${label}: graph edit control unavailable`).toBe(true);
  expect(edit.invalidated, `${label}: restored/render cache was not cleared after graph-changing user edit`).toBe(true);

  if (scenario.size === 'heavy') {
    expect(summary.snapshotTargetCache?.hasArchiveRenderCache, `${label}: heavy target cache missing from ${scenario.mode} snapshot`).toBe(true);
  }
  if (scenario.mode === 'reopen' && scenario.size === 'heavy') {
    expect(summary.afterRenderWaitTargetCache.hasAnyCache, `${label}: normal reopen heavy target did not retain cache through activation`).toBe(true);
  }
  if (scenario.mode === 'recovery' && scenario.size === 'heavy') {
    expect(summary.afterRenderWaitTargetCache.hasAnyCache, `${label}: recovery heavy target did not retain cache through activation; inspect lifecycle JSON to see where it disappeared`).toBe(true);
  }
}

for (const component of COMPONENTS) {
  for (const size of DATA_SIZES) {
    for (const topology of TOPOLOGIES) {
      for (const mode of RESTORE_MODES) {
        const title = `${component} ${size} ${topology} ${mode} render-cache lifecycle`;
        const knownPreExistingHeavyMixedCacheGap = size === 'heavy'
          && topology === 'mixed'
          && (component === 'box' || component === 'scatter');
        const defineTest = knownPreExistingHeavyMixedCacheGap ? test.fixme : test;
        defineTest(title, async ({ page }, testInfo) => {
          test.setTimeout(size === 'heavy' ? 300_000 : 180_000);
          const issues = registerIssueCollectors(page);
          await installLocalCdnOverrides(page);
          await runLifecycleScenario(page, testInfo, { component, size, topology, mode }, issues);
        });
      }
    }
  }
}
