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


function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

async function attachRenderCacheDiagnostics(testInfo, name, diagnostics) {
  if (!testInfo || typeof testInfo.attach !== 'function') {
    return;
  }
  await testInfo.attach(name, {
    body: stableJson(diagnostics),
    contentType: 'application/json'
  });
}

async function collectWorkspaceRenderCacheDiagnostics(page, label) {
  return page.evaluate((diagnosticLabel) => {
    const tabs = Array.isArray(window.Main?.session?.workspaceState?.tabs)
      ? window.Main.session.workspaceState.tabs
      : [];
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const summarizeCache = (cacheLike) => {
      const envelope = cacheLike && cacheLike.cache ? cacheLike.cache : cacheLike;
      const cache = envelope && typeof envelope === 'object' ? envelope : null;
      if (!cache) {
        return {
          present: false,
          keys: [],
          hasMetadata: false,
          component: null,
          reason: null,
          bitmapMarkerCount: 0,
          canvasMarkerCount: 0,
          serializedLength: 0
        };
      }
      let serialized = '';
      try {
        serialized = JSON.stringify(cache);
      } catch (_err) {
        serialized = '';
      }
      const metadata = cache.__graphitixRenderCache || cache.metadata || cache.meta || null;
      return {
        present: true,
        keys: Object.keys(cache).sort(),
        hasMetadata: !!metadata,
        component: metadata?.component || metadata?.type || cache.type || null,
        reason: metadata?.reason || cache.reason || null,
        bitmapMarkerCount: (serialized.match(/data-graphitix-render-cache-canvas-bitmap/g) || []).length,
        canvasMarkerCount: (serialized.match(/<canvas|canvas/gi) || []).length,
        serializedLength: serialized.length,
        envelopePayloadSignatureLength: String(cacheLike?.payloadSignature || '').length,
        envelopeLayoutSignatureLength: String(cacheLike?.layoutSignature || '').length
      };
    };
    const activeDom = (() => {
      const active = tabs.find(tab => tab && tab.id === activeTabId) || null;
      if (!active?.type) {
        return null;
      }
      if (active.type === 'scatter') {
        const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg [data-layer="points"]');
        return {
          type: 'scatter',
          renderMode: layer?.getAttribute?.('data-render-mode') || null,
          canvasCount: layer?.querySelectorAll?.('foreignObject[data-point-renderer] canvas')?.length || 0,
          bitmapCount: layer?.querySelectorAll?.('foreignObject[data-point-renderer] img[data-graphitix-render-cache-canvas-bitmap="true"]')?.length || 0
        };
      }
      if (active.type === 'box') {
        const plot = document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
        return {
          type: 'box',
          canvasCount: plot?.querySelectorAll?.('g[data-export-layer="box-points"] foreignObject canvas, g[data-export-layer="box-points"] foreignobject canvas')?.length || 0,
          bitmapCount: plot?.querySelectorAll?.('g[data-export-layer="box-points"] foreignObject img[data-graphitix-render-cache-canvas-bitmap="true"], g[data-export-layer="box-points"] foreignobject img[data-graphitix-render-cache-canvas-bitmap="true"]')?.length || 0
        };
      }
      return { type: active.type };
    })();
    return {
      label: diagnosticLabel,
      activeTabId,
      sessionDirty: !!window.Main?.session?.workspaceState?.sessionDirty,
      sessionUserDirty: !!window.Main?.session?.workspaceState?.sessionUserDirty,
      activeDom,
      tabs: tabs
        .filter(tab => tab && !tab.isWelcome && tab.type)
        .map(tab => ({
          id: tab.id,
          type: tab.type,
          title: tab.title || null,
          active: tab.id === activeTabId,
          payloadSignatureLength: String(tab.payloadSignature || '').length,
          layoutSignatureLength: String(tab.layoutSignature || '').length,
          previewSignatureLength: String(tab.previewSignature || '').length,
          previewHasBitmap: typeof tab.previewMarkup === 'string'
            ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"')
            : false,
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
  }, label);
}

async function summarizeArchiveFileInPage(page, archivePath, label) {
  const base64 = fs.readFileSync(archivePath).toString('base64');
  return page.evaluate(async ({ b64, diagnosticLabel }) => {
    const graphArchive = window.Shared?.graphArchive;
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
      throw new Error('Shared.graphArchive.parseFile unavailable for archive-file diagnostics');
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/zip' });
    const parsed = await graphArchive.parseFile(blob, { fileName: `${diagnosticLabel}.graph` });
    const tabs = Array.isArray(parsed?.session?.tabs) ? parsed.session.tabs : [];
    const summarizeCache = (cache) => {
      if (!cache || typeof cache !== 'object') {
        return { present: false, keys: [], bitmapMarkerCount: 0, serializedLength: 0 };
      }
      let serialized = '';
      try { serialized = JSON.stringify(cache); } catch (_err) { serialized = ''; }
      return {
        present: true,
        keys: Object.keys(cache).sort(),
        bitmapMarkerCount: (serialized.match(/data-graphitix-render-cache-canvas-bitmap/g) || []).length,
        serializedLength: serialized.length,
        metadata: cache.__graphitixRenderCache || null
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
        previewHasBitmap: typeof tab?.previewMarkup === 'string'
          ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"')
          : false,
        archiveRenderCache: summarizeCache(tab?.archiveRenderCache)
      }))
    };
  }, { b64: base64, diagnosticLabel: label });
}

async function openNewTabType(page, type, reason = 'e2e-open-new-tab') {
  const idsBefore = await page.evaluate(() => Array.from(
    document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]')
  ).map(node => String(node.getAttribute('data-tab-id') || '').trim()).filter(Boolean));
  await page.evaluate(async ({ graphType, reasonText }) => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') {
        await maybe;
      }
    }
    if (tabs && typeof tabs.handleGraphSelection === 'function') {
      const maybe = tabs.handleGraphSelection(graphType, { reason: reasonText || 'e2e-open-new-tab' });
      if (maybe && typeof maybe.then === 'function') {
        await maybe;
      }
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
  const createdTabId = idsAfter.find(id => !idsBefore.includes(id)) || null;
  return createdTabId;
}

async function activateTab(page, tabId) {
  await page.evaluate(async (id) => {
    const activate = window.Main?.tabs?.activateTab;
    if (typeof activate !== 'function') {
      return;
    }
    const maybe = activate(id, { reason: 'e2e-heavy-tab-activate' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
  }, tabId);
  await page.waitForTimeout(350);
}

async function loadHeavyScatterData(page, variant) {
  await page.evaluate((variantId) => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.()
      || window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__getState?.()?.hot;
    if (!hot || typeof hot.loadData !== 'function') {
      throw new Error('scatter hot table unavailable');
    }
    const rows = [['label', 'x', 'y']];
    const pointCount = 24_000;
    for (let idx = 1; idx <= pointCount; idx += 1) {
      const shift = variantId === 'B' ? 0.75 : 0;
      const x = ((idx / 125) + shift).toFixed(5);
      const y = (
        Math.sin((idx / (variantId === 'B' ? 17 : 23)) + shift) * 10
        + Math.cos((idx / (variantId === 'B' ? 61 : 89)) + shift) * 4
        + idx / (variantId === 'B' ? 860 : 990)
      ).toFixed(5);
      rows.push([`${variantId}${idx}`, x, y]);
    }
    const graphType = document.getElementById('scatterGraphType');
    if (graphType) {
      graphType.value = 'scatter';
      graphType.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hot.loadData(rows);
    window.Components?.scatter?.draw?.({ reason: `e2e-heavy-scatter-${variantId}` });
  }, variant);
}

async function waitForScatterHot(page) {
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.()
      || window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__getState?.()?.hot;
    return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
  }, null, { timeout: 60_000 });
}

async function waitForScatterCanvas(page) {
  await page.waitForFunction(() => {
    const hasPaintedCanvas = (canvas) => {
      if (!canvas || !canvas.width || !canvas.height) return false;
      const rect = canvas.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      const ctx = canvas.getContext?.('2d', { willReadFrequently: true });
      if (!ctx) return false;
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let idx = 3; idx < data.length; idx += 4) {
          if (data[idx] !== 0) return true;
        }
      } catch (_err) {
        return false;
      }
      return false;
    };
    const hasDecodedBitmapImage = (image) => {
      if (!image) return false;
      const rect = image.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      const src = String(image.getAttribute?.('src') || '').trim();
      return !!src && image.complete !== false && (Number(image.naturalWidth) || 0) > 0 && (Number(image.naturalHeight) || 0) > 0;
    };
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg [data-layer="points"]');
    if (!layer) {
      return false;
    }
    const mode = layer.getAttribute('data-render-mode');
    if (mode !== 'canvas' && mode !== 'canvas-resize-reused') {
      return false;
    }
    const canvas = layer.querySelector('foreignObject[data-point-renderer] canvas');
    const bitmap = layer.querySelector('foreignObject[data-point-renderer] img[data-graphitix-render-cache-canvas-bitmap="true"]');
    return hasPaintedCanvas(canvas) || hasDecodedBitmapImage(bitmap);
  }, null, { timeout: 120_000 });
}


async function loadHeavyBoxData(page) {
  await page.evaluate(() => {
    const state = window.Components?.box?.__getState?.() || null;
    const hot = state?.ensureHotForActiveTab?.() || state?.hot || null;
    if (!hot || typeof hot.loadData !== 'function') {
      throw new Error('box hot table unavailable');
    }
    const rows = [['Control', 'Treatment A', 'Treatment B']];
    const rowCount = 2_200;
    for (let idx = 1; idx <= rowCount; idx += 1) {
      rows.push([
        (Math.sin(idx / 17) * 2 + idx / 800).toFixed(5),
        (Math.cos(idx / 29) * 2.5 + 1 + idx / 900).toFixed(5),
        (Math.sin(idx / 41) * 1.5 + 2 + idx / 1000).toFixed(5)
      ]);
    }
    hot.loadData(rows);
    window.Components?.box?.draw?.({ reason: 'e2e-heavy-box-canvas' });
  });
}

async function waitForBoxCanvas(page) {
  await page.waitForFunction(() => {
    const hasPaintedCanvas = (canvas) => {
      if (!canvas || !canvas.width || !canvas.height) return false;
      const rect = canvas.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      const ctx = canvas.getContext?.('2d', { willReadFrequently: true });
      if (!ctx) return false;
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let idx = 3; idx < data.length; idx += 4) {
          if (data[idx] !== 0) return true;
        }
      } catch (_err) {
        return false;
      }
      return false;
    };
    const hasDecodedBitmapImage = (image) => {
      if (!image) return false;
      const rect = image.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      const src = String(image.getAttribute?.('src') || '').trim();
      return !!src && image.complete !== false && (Number(image.naturalWidth) || 0) > 0 && (Number(image.naturalHeight) || 0) > 0;
    };
    const plot = document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    if (!plot) return false;
    const canvas = plot.querySelector('g[data-export-layer="box-points"] foreignObject canvas, g[data-export-layer="box-points"] foreignobject canvas');
    const bitmap = plot.querySelector('g[data-export-layer="box-points"] foreignObject img[data-graphitix-render-cache-canvas-bitmap="true"], g[data-export-layer="box-points"] foreignobject img[data-graphitix-render-cache-canvas-bitmap="true"]');
    return hasPaintedCanvas(canvas) || hasDecodedBitmapImage(bitmap);
  }, null, { timeout: 120_000 });
}


async function expectRestoredCacheClearedByUserInput(page, testInfo, tabId, type, selector, nextValue, label) {
  await activateTab(page, tabId);
  const before = await page.evaluate((id) => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id) || null;
    return {
      hasRenderCache: !!tab?.renderCache,
      hasArchiveRenderCache: !!tab?.archiveRenderCache,
      payloadDirty: !!tab?.payloadDirty,
      userModified: !!tab?.userModified,
      renderCacheSignatureLength: String(tab?.renderCacheSignature || tab?.renderCache?.payloadSignature || '').length,
      archiveRenderCacheSignatureLength: String(tab?.archiveRenderCacheSignature || '').length,
      renderCacheLayoutSignatureLength: String(tab?.renderCacheLayoutSignature || tab?.renderCache?.layoutSignature || '').length,
      archiveRenderCacheLayoutSignatureLength: String(tab?.archiveRenderCacheLayoutSignature || '').length
    };
  }, tabId);
  const beforeWorkspace = await collectWorkspaceRenderCacheDiagnostics(page, `${label || type}-before-user-edit`);
  await attachRenderCacheDiagnostics(testInfo, `${label || type}-before-user-edit.json`, {
    tabId,
    type,
    before,
    workspace: beforeWorkspace
  });

  const hadRestoredCacheBeforeEdit = !!(before.hasRenderCache || before.hasArchiveRenderCache);
  if (!hadRestoredCacheBeforeEdit) {
    return {
      tabId,
      type,
      label,
      hadRestoredCacheBeforeEdit: false,
      skippedEdit: true,
      skipReason: 'no-restored-cache-before-user-edit'
    };
  }

  const editResult = await page.evaluate(({ componentType, preferredSelector, value }) => {
    const preferred = preferredSelector ? [preferredSelector] : [];
    const fallbackSelectors = componentType === 'box'
      ? [
          '#boxPage:not([hidden]) #boxShowGrid',
          '#boxPage:not([hidden]) #boxFontSize',
          '#boxPage:not([hidden]) #boxGraphType',
          '#boxPage:not([hidden]) #boxYMax'
        ]
      : [
          '#scatterPage:not([hidden]) #scatterFill',
          '#scatterPage:not([hidden]) #scatterShowGrid',
          '#scatterPage:not([hidden]) #scatterFontSize',
          '#scatterPage:not([hidden]) #scatterDotSize',
          '#scatterPage:not([hidden]) #scatterYMax'
        ];
    const selectors = [...preferred, ...fallbackSelectors].filter((item, index, array) => item && array.indexOf(item) === index);
    const input = selectors.map(candidate => document.querySelector(candidate)).find(Boolean) || null;
    if (!input) {
      return {
        edited: false,
        reason: 'missing-control',
        triedSelectors: selectors
      };
    }

    const flag = window.Main?.session?.__USER_TRUSTED_FLAG__ || '__graphitixUserTrusted';
    const dispatchTrusted = (eventType) => {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      event[flag] = true;
      input.dispatchEvent(event);
    };

    const beforeValue = input.type === 'checkbox' ? !!input.checked : String(input.value ?? '');
    if (input.type === 'checkbox') {
      input.checked = !input.checked;
      dispatchTrusted('input');
      dispatchTrusted('change');
    } else if (input.tagName === 'SELECT') {
      const options = Array.from(input.options || []);
      const currentIndex = Math.max(0, input.selectedIndex || 0);
      const nextOption = options[(currentIndex + 1) % Math.max(1, options.length)] || null;
      if (nextOption) {
        input.value = nextOption.value;
      }
      dispatchTrusted('input');
      dispatchTrusted('change');
    } else if (input.type === 'number' || input.type === 'range') {
      const numeric = Number(input.value);
      const step = Number(input.step) || 1;
      const min = Number(input.min);
      const max = Number(input.max);
      let nextNumeric = Number.isFinite(numeric) ? numeric + step : 1;
      if (Number.isFinite(max) && nextNumeric > max) {
        nextNumeric = Number.isFinite(min) ? min : numeric - step;
      }
      input.value = String(nextNumeric);
      dispatchTrusted('input');
      dispatchTrusted('change');
    } else {
      input.value = value;
      dispatchTrusted('input');
      dispatchTrusted('change');
    }
    return {
      edited: true,
      selector: input.id ? `#${input.id}` : null,
      tagName: input.tagName,
      type: input.type || null,
      beforeValue,
      afterValue: input.type === 'checkbox' ? !!input.checked : String(input.value ?? '')
    };
  }, { componentType: type, preferredSelector: selector, value: nextValue });

  if (!editResult.edited) {
    await attachRenderCacheDiagnostics(testInfo, `${label || type}-user-edit-control-missing.json`, {
      tabId,
      type,
      editResult,
      workspace: await collectWorkspaceRenderCacheDiagnostics(page, `${label || type}-user-edit-control-missing`)
    });
    return {
      tabId,
      type,
      label,
      hadRestoredCacheBeforeEdit,
      skippedEdit: true,
      skipReason: editResult.reason || 'edit-control-unavailable',
      editResult
    };
  }

  let invalidatedAfterEdit = false;
  try {
    await page.waitForFunction((id) => {
      const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id) || null;
      return !!tab
        && !tab.renderCache
        && !tab.archiveRenderCache
        && tab.userModified === true;
    }, tabId, { timeout: 10_000 });
    invalidatedAfterEdit = true;
  } catch (_err) {
    invalidatedAfterEdit = false;
  }

  const afterWorkspace = await collectWorkspaceRenderCacheDiagnostics(page, `${label || type}-after-user-edit`);
  await attachRenderCacheDiagnostics(testInfo, `${label || type}-after-user-edit.json`, {
    tabId,
    type,
    editResult,
    invalidatedAfterEdit,
    workspace: afterWorkspace
  });
  if (type === 'scatter') {
    await waitForScatterCanvas(page);
  } else if (type === 'box') {
    await waitForBoxCanvas(page);
  }
  return {
    tabId,
    type,
    label,
    hadRestoredCacheBeforeEdit,
    skippedEdit: false,
    editResult,
    invalidatedAfterEdit
  };
}

async function collectScatterTabState(page, tabId) {
  await activateTab(page, tabId);
  await waitForScatterCanvas(page);
  return page.evaluate((id) => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === id) || null;
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg [data-layer="points"]');
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    const data = typeof hot?.getData === 'function' ? hot.getData() : [];
    const rowCount = Array.isArray(data) ? Math.max(0, data.length - 1) : 0;
    const firstLabel = rowCount > 0 ? String(data[1]?.[0] || '') : '';
    const previewApi = window.Main?.previews;
    const config = window.Main?.components?.registry?.scatter;
    if (previewApi && config && typeof previewApi.updateTabPreviewFromWorkspace === 'function') {
      previewApi.updateTabPreviewFromWorkspace(tab, config, {
        forceCapture: true,
        reason: 'e2e-heavy-mixed-preview-capture'
      });
    }
    const canvases = Array.from(layer?.querySelectorAll?.('foreignObject[data-point-renderer] canvas') || []);
    const bitmapImages = Array.from(layer?.querySelectorAll?.('foreignObject[data-point-renderer] img[data-graphitix-render-cache-canvas-bitmap="true"]') || []);
    const hasPaintedCanvas = (canvas) => {
      if (!canvas || !canvas.width || !canvas.height) return false;
      const rect = canvas.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      const ctx = canvas.getContext?.('2d', { willReadFrequently: true });
      if (!ctx) return false;
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let idx = 3; idx < data.length; idx += 4) {
          if (data[idx] !== 0) return true;
        }
      } catch (_err) {}
      return false;
    };
    const hasDecodedBitmapImage = (image) => {
      if (!image) return false;
      const rect = image.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      const src = String(image.getAttribute?.('src') || '').trim();
      return !!src && image.complete !== false && (Number(image.naturalWidth) || 0) > 0 && (Number(image.naturalHeight) || 0) > 0;
    };
    const renderer = canvases[0] || bitmapImages[0] || null;
    const rendererRect = renderer?.getBoundingClientRect?.() || null;
    const svg = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg');
    const svgRect = svg?.getBoundingClientRect?.() || null;
    return {
      tabId: id,
      payloadSignature: tab?.payloadSignature || null,
      previewSignature: tab?.previewSignature || null,
      previewHasCanvasBitmap: typeof tab?.previewMarkup === 'string'
        ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"')
        : false,
      previewIsPlaceholder: typeof tab?.previewMarkup === 'string'
        ? tab.previewMarkup.includes('data-preview-placeholder')
        : false,
      rowCount,
      firstLabel,
      renderMode: layer?.getAttribute?.('data-render-mode') || null,
      canvasCount: canvases.length,
      bitmapImageCount: bitmapImages.length,
      paintedCanvasCount: canvases.filter(hasPaintedCanvas).length,
      decodedBitmapImageCount: bitmapImages.filter(hasDecodedBitmapImage).length,
      rendererLeft: Number.isFinite(rendererRect?.left) ? rendererRect.left : null,
      rendererRight: Number.isFinite(rendererRect?.right) ? rendererRect.right : null,
      svgLeft: Number.isFinite(svgRect?.left) ? svgRect.left : null,
      svgRight: Number.isFinite(svgRect?.right) ? svgRect.right : null
    };
  }, tabId);
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    const graphArchive = window.Shared?.graphArchive;
    if (!tabsApi || typeof tabsApi.getSessionActionsContext !== 'function') {
      throw new Error('Main.tabs.getSessionActionsContext unavailable');
    }
    if (!sessionActions || typeof sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      throw new Error('Main.sessionActions.buildWorkspaceArchiveBlob unavailable');
    }
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
      throw new Error('Shared.graphArchive.parseFile unavailable for archive diagnostics');
    }
    const context = tabsApi.getSessionActionsContext();
    const policy = window.Main?.snapshotPolicy?.resolveArchiveBuildPolicy?.({
      mode: 'manual-save',
      snapshotKind: 'document-snapshot',
      reason: 'e2e-heavy-mixed-archive',
      scope: 'workspace'
    }) || null;
    const beforeBuild = await window.__collectGraphitixCacheDiagnostics?.('before-document-snapshot-build');
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-heavy-mixed-archive'
    });
    if (!blob) {
      throw new Error('buildWorkspaceArchiveBlob returned null');
    }
    const summarizeCache = (cache) => {
      if (!cache || typeof cache !== 'object') {
        return { present: false, keys: [], bitmapMarkerCount: 0, serializedLength: 0 };
      }
      let serialized = '';
      try { serialized = JSON.stringify(cache); } catch (_err) { serialized = ''; }
      return {
        present: true,
        keys: Object.keys(cache).sort(),
        bitmapMarkerCount: (serialized.match(/data-graphitix-render-cache-canvas-bitmap/g) || []).length,
        serializedLength: serialized.length,
        metadata: cache.__graphitixRenderCache || null
      };
    };
    const parsed = await graphArchive.parseFile(blob, { fileName: `${stem}.graph` });
    const parsedTabs = Array.isArray(parsed?.session?.tabs) ? parsed.session.tabs : [];
    const archiveSummary = {
      label: 'document-snapshot-blob',
      policy,
      source: parsed?.source || null,
      activeIndex: parsed?.session?.activeIndex ?? null,
      tabCount: parsedTabs.length,
      tabs: parsedTabs.map((tab, index) => ({
        index,
        title: tab?.title || null,
        type: tab?.type || tab?.payload?.type || null,
        hasArchiveRenderCache: !!tab?.archiveRenderCache,
        archiveRenderCacheSignatureLength: String(tab?.archiveRenderCacheSignature || '').length,
        archiveRenderCacheLayoutSignatureLength: String(tab?.archiveRenderCacheLayoutSignature || '').length,
        previewHasBitmap: typeof tab?.previewMarkup === 'string'
          ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"')
          : false,
        archiveRenderCache: summarizeCache(tab?.archiveRenderCache)
      }))
    };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return {
      fileName: `${stem}.graph`,
      base64: btoa(binary),
      byteLength: bytes.length,
      diagnostics: {
        policy,
        beforeBuild,
        archiveSummary
      }
    };
  }, fileStem);

  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return { archivePath, byteLength: archive.byteLength, diagnostics: archive.diagnostics };
}

async function loadWorkspaceArchiveFromPath(page, archivePath) {
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForTimeout(1_000);
}

async function seedRecoverySnapshot(page) {
  return page.evaluate(async () => {
    const openWebDb = () => new Promise((resolve, reject) => {
      const request = window.indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });

    const putRecoverySnapshot = async (record) => {
      const db = await openWebDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put(record, 'active-recovery');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB snapshot write failed.'));
      });
    };

    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    const graphArchive = window.Shared?.graphArchive;
    const workspaceState = window.Main?.session?.workspaceState || {};
    if (!tabsApi || typeof tabsApi.getSessionActionsContext !== 'function') {
      throw new Error('Main.tabs.getSessionActionsContext unavailable');
    }
    if (!sessionActions || typeof sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      throw new Error('Main.sessionActions.buildWorkspaceArchiveBlob unavailable');
    }
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
      throw new Error('Shared.graphArchive.parseFile unavailable for recovery diagnostics');
    }
    const graphTabs = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
      : [];
    const context = tabsApi.getSessionActionsContext();
    const policy = window.Main?.snapshotPolicy?.resolveArchiveBuildPolicy?.({
      mode: 'recovery',
      snapshotKind: 'recovery',
      reason: 'recovery-interval',
      scope: 'workspace',
      idleForMs: 8_000
    }) || null;
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'recovery-interval',
      idleForMs: 8_000,
      useWorker: true
    });
    if (!blob) {
      throw new Error('Recovery snapshot blob was empty');
    }
    const summarizeCache = (cache) => {
      if (!cache || typeof cache !== 'object') {
        return { present: false, keys: [], bitmapMarkerCount: 0, serializedLength: 0 };
      }
      let serialized = '';
      try { serialized = JSON.stringify(cache); } catch (_err) { serialized = ''; }
      return {
        present: true,
        keys: Object.keys(cache).sort(),
        bitmapMarkerCount: (serialized.match(/data-graphitix-render-cache-canvas-bitmap/g) || []).length,
        serializedLength: serialized.length,
        metadata: cache.__graphitixRenderCache || null
      };
    };
    const parsed = await graphArchive.parseFile(blob, { fileName: 'active-recovery.graph' });
    const parsedTabs = Array.isArray(parsed?.session?.tabs) ? parsed.session.tabs : [];
    const diagnostics = {
      label: 'recovery-snapshot-blob',
      policy,
      source: parsed?.source || null,
      activeIndex: parsed?.session?.activeIndex ?? null,
      tabCount: parsedTabs.length,
      tabs: parsedTabs.map((tab, index) => ({
        index,
        title: tab?.title || null,
        type: tab?.type || tab?.payload?.type || null,
        hasArchiveRenderCache: !!tab?.archiveRenderCache,
        archiveRenderCacheSignatureLength: String(tab?.archiveRenderCacheSignature || '').length,
        archiveRenderCacheLayoutSignatureLength: String(tab?.archiveRenderCacheLayoutSignature || '').length,
        previewHasBitmap: typeof tab?.previewMarkup === 'string'
          ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"')
          : false,
        archiveRenderCache: summarizeCache(tab?.archiveRenderCache)
      }))
    };
    await putRecoverySnapshot({
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
        fileName: workspaceState.sessionFileName || 'workspace.graph',
        filePath: workspaceState.sessionFilePath || '',
        fileScope: workspaceState.sessionFileScope || 'workspace',
        diagnostics
      },
      blob
    });
    return diagnostics;
  });
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
    await page.waitForTimeout(1_200);
  } finally {
    page.off('dialog', dialogHandler);
  }
  return acceptedDialog;
}

async function buildMixedHeavyWorkspace(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await waitForScatterHot(page);
  await loadHeavyScatterData(page, 'A');
  await waitForScatterCanvas(page);
  const scatterAId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(scatterAId).toBeTruthy();

  const boxTabId = await openNewTabType(page, 'box', 'e2e-heavy-mixed-open-box');
  expect(boxTabId).toBeTruthy();
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await page.waitForTimeout(250);
  await loadHeavyBoxData(page);
  await waitForBoxCanvas(page);

  const scatterBId = await openNewTabType(page, 'scatter', 'e2e-heavy-mixed-open-scatter-b');
  expect(scatterBId).toBeTruthy();
  await waitForScatterHot(page);
  await loadHeavyScatterData(page, 'B');
  await waitForScatterCanvas(page);

  const baselineScatterA = await collectScatterTabState(page, scatterAId);
  const baselineScatterB = await collectScatterTabState(page, scatterBId);
  return {
    ids: { scatterAId, boxTabId, scatterBId },
    baseline: {
      scatterA: {
        rowCount: baselineScatterA.rowCount,
        firstLabel: baselineScatterA.firstLabel
      },
      scatterB: {
        rowCount: baselineScatterB.rowCount,
        firstLabel: baselineScatterB.firstLabel
      }
    }
  };
}

async function parkOnBoxTab(page, workspace) {
  const boxTabId = workspace?.ids?.boxTabId || null;
  expect(boxTabId).toBeTruthy();
  await activateTab(page, boxTabId);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#boxPlot svg')).toBeVisible({ timeout: 40_000 });
}

async function verifyMixedTabsAfterRestore(page, workspace, testInfo, scenarioLabel) {
  const ids = workspace?.ids || workspace || {};
  const baseline = workspace?.baseline || {};
  await expect(page.locator('#workspaceTabsList .workspace-tab[data-tab-id]')).toHaveCount(4, { timeout: 20_000 });
  const savedTabs = await page.evaluate(() => {
    const tabs = Array.isArray(window.Main?.session?.workspaceState?.tabs)
      ? window.Main.session.workspaceState.tabs
      : [];
    return tabs
      .filter(tab => tab && !tab.isWelcome && tab.type)
      .map(tab => ({
        id: tab.id,
        type: tab.type,
        payloadSignature: tab.payloadSignature || null,
        previewSignature: tab.previewSignature || null,
        previewHasBitmap: typeof tab.previewMarkup === 'string' ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"') : false
      }));
  });
  await attachRenderCacheDiagnostics(testInfo, `${scenarioLabel || 'restore'}-after-load-tabs.json`, {
    savedTabs,
    workspace: await collectWorkspaceRenderCacheDiagnostics(page, `${scenarioLabel || 'restore'}-after-load-tabs`)
  });
  const scatterSaved = savedTabs.filter(tab => tab.type === 'scatter');
  const boxSaved = savedTabs.filter(tab => tab.type === 'box');
  expect(scatterSaved).toHaveLength(2);
  expect(boxSaved.length).toBeGreaterThan(0);
  expect(scatterSaved.every(tab => tab.previewHasBitmap)).toBe(true);
  expect(scatterSaved.map(tab => tab.payloadSignature).filter(Boolean).length).toBe(2);

  const scatterStates = [];
  for (const tab of scatterSaved) {
    scatterStates.push(await collectScatterTabState(page, tab.id));
  }
  const baselineAFirstLabel = String(baseline.scatterA?.firstLabel || '').trim();
  const baselineBFirstLabel = String(baseline.scatterB?.firstLabel || '').trim();
  const matchesLabel = (state, expected, prefix) => {
    if (!state) {
      return false;
    }
    const normalizedFirstLabel = String(state.firstLabel || '').trim();
    if (expected) {
      return normalizedFirstLabel === expected;
    }
    return new RegExp(`^${prefix}\\d+`).test(normalizedFirstLabel);
  };
  let scatterA = scatterStates.find(state => matchesLabel(state, baselineAFirstLabel, 'A')) || null;
  let scatterB = scatterStates.find(state => matchesLabel(state, baselineBFirstLabel, 'B')) || null;
  if (!scatterA || !scatterB || scatterA.tabId === scatterB.tabId) {
    scatterA = scatterA || scatterStates.find(state => state.tabId === ids.scatterAId) || scatterStates[0];
    scatterB = scatterStates.find(state => state.tabId !== scatterA.tabId) || scatterStates[1];
  }
  expect(scatterA).toBeTruthy();
  expect(scatterB).toBeTruthy();
  expect(scatterA.tabId).not.toBe(scatterB.tabId);
  expect(scatterA.payloadSignature).toBeTruthy();
  expect(scatterB.payloadSignature).toBeTruthy();
  expect(scatterA.payloadSignature).not.toBe(scatterB.payloadSignature);
  expect(scatterA.rowCount).toBeGreaterThan(20_000);
  expect(scatterB.rowCount).toBeGreaterThan(20_000);
  const restoredFirstLabels = [scatterA, scatterB].map(state => String(state.firstLabel || '').trim());
  if (baseline.scatterA?.firstLabel) {
    expect(restoredFirstLabels).toContain(baseline.scatterA.firstLabel);
  } else {
    expect(restoredFirstLabels.some(label => /^A\d+/.test(label))).toBe(true);
  }
  if (baseline.scatterB?.firstLabel) {
    expect(restoredFirstLabels).toContain(baseline.scatterB.firstLabel);
  } else {
    expect(restoredFirstLabels.some(label => /^B\d+/.test(label))).toBe(true);
  }
  expect(scatterA.renderMode).toMatch(/^canvas/);
  expect(scatterB.renderMode).toMatch(/^canvas/);
  expect(scatterA.canvasCount + scatterA.bitmapImageCount).toBeGreaterThan(0);
  expect(scatterB.canvasCount + scatterB.bitmapImageCount).toBeGreaterThan(0);
  expect(scatterA.paintedCanvasCount + scatterA.decodedBitmapImageCount).toBeGreaterThan(0);
  expect(scatterB.paintedCanvasCount + scatterB.decodedBitmapImageCount).toBeGreaterThan(0);
  for (const state of [scatterA, scatterB]) {
    if (Number.isFinite(state.rendererLeft) && Number.isFinite(state.svgLeft)) {
      expect(state.rendererLeft).toBeGreaterThanOrEqual(state.svgLeft - 2);
    }
    if (Number.isFinite(state.rendererRight) && Number.isFinite(state.svgRight)) {
      expect(state.rendererRight).toBeLessThanOrEqual(state.svgRight + 2);
    }
  }
  expect(scatterA.previewHasCanvasBitmap).toBe(true);
  expect(scatterB.previewHasCanvasBitmap).toBe(true);
  expect(scatterA.previewIsPlaceholder).toBe(false);
  expect(scatterB.previewIsPlaceholder).toBe(false);

  await activateTab(page, boxSaved[0].id);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await waitForBoxCanvas(page);

  const invalidationResults = [];
  invalidationResults.push(await expectRestoredCacheClearedByUserInput(
    page,
    testInfo,
    scatterA.tabId,
    'scatter',
    '#scatterPage:not([hidden]) #scatterFill',
    '#cc5500',
    `${scenarioLabel || 'restore'}-scatter-cache-invalidation`
  ));
  invalidationResults.push(await expectRestoredCacheClearedByUserInput(
    page,
    testInfo,
    boxSaved[0].id,
    'box',
    '#boxPage:not([hidden]) #boxShowGrid',
    '#4477aa',
    `${scenarioLabel || 'restore'}-box-cache-invalidation`
  ));
  await attachRenderCacheDiagnostics(testInfo, `${scenarioLabel || 'restore'}-cache-invalidation-summary.json`, {
    scenarioLabel,
    results: invalidationResults
  });

  const missingBeforeEdit = invalidationResults.filter(result => !result?.hadRestoredCacheBeforeEdit);
  const missingControls = invalidationResults.filter(result => result?.skippedEdit && result?.skipReason !== 'no-restored-cache-before-user-edit');
  const notInvalidated = invalidationResults.filter(result => result?.hadRestoredCacheBeforeEdit && !result?.skippedEdit && !result?.invalidatedAfterEdit);
  expect(
    missingControls,
    `${scenarioLabel || 'restore'}: cache invalidation diagnostic could not find an editable graph control; see *user-edit-control-missing.json attachments.`
  ).toEqual([]);
  expect(
    missingBeforeEdit,
    `${scenarioLabel || 'restore'}: restored cache was already absent before simulated user edit; see *before-user-edit.json plus snapshot/open diagnostics.`
  ).toEqual([]);
  expect(
    notInvalidated,
    `${scenarioLabel || 'restore'}: restored cache survived a user graph edit; see *after-user-edit.json diagnostics.`
  ).toEqual([]);
}

test.fixme('mixed heavy scatter tabs + heavy box tab survive archive reopen with tab isolation and previews', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  const workspace = await buildMixedHeavyWorkspace(page);
  await parkOnBoxTab(page, workspace);
  const { archivePath, byteLength, diagnostics: archiveDiagnostics } = await captureWorkspaceArchive(page, 'heavy-mixed-reopen');
  expect(byteLength).toBeGreaterThan(0);
  await attachRenderCacheDiagnostics(testInfo, 'document-snapshot-created.json', archiveDiagnostics);
  await attachRenderCacheDiagnostics(testInfo, 'document-snapshot-file-contents.json', await summarizeArchiveFileInPage(page, archivePath, 'document-snapshot-file'));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await loadWorkspaceArchiveFromPath(page, archivePath);
  await attachRenderCacheDiagnostics(testInfo, 'document-reopen-after-input-load.json', await collectWorkspaceRenderCacheDiagnostics(page, 'document-reopen-after-input-load'));
  await attachRenderCacheDiagnostics(testInfo, 'document-reopen-after-open.json', await collectWorkspaceRenderCacheDiagnostics(page, 'document-reopen-after-open'));
  await verifyMixedTabsAfterRestore(page, workspace, testInfo, 'document-reopen');
  expect(issues.critical).toEqual([]);
});

test.fixme('mixed heavy scatter tabs + heavy box tab survive crash-recovery restore with tab isolation and previews', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  const workspace = await buildMixedHeavyWorkspace(page);
  await parkOnBoxTab(page, workspace);
  const recoveryDiagnostics = await seedRecoverySnapshot(page);
  await attachRenderCacheDiagnostics(testInfo, 'recovery-snapshot-created.json', recoveryDiagnostics);
  await reloadAndAcceptRecovery(page);
  await attachRenderCacheDiagnostics(testInfo, 'recovery-after-dialog.json', await collectWorkspaceRenderCacheDiagnostics(page, 'recovery-after-dialog'));
  await attachRenderCacheDiagnostics(testInfo, 'recovery-after-open.json', await collectWorkspaceRenderCacheDiagnostics(page, 'recovery-after-open'));
  await verifyMixedTabsAfterRestore(page, workspace, testInfo, 'recovery');
  expect(issues.critical).toEqual([]);
});
