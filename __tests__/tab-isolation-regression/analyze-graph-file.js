'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}
function normalizeWorkspaceIds(text) {
  return String(text || '')
    .replace(/workspace-\d+/g, 'workspace-X')
    .replace(/data-workspace-tab-id="[^"]*"/g, 'data-workspace-tab-id="TAB"')
    .replace(/data-tab-token="[^"]*"/g, 'data-tab-token="TAB"')
    .replace(/\s+/g, ' ')
    .trim();
}
async function readJson(zip, file) {
  const entry = zip.file(file);
  if (!entry) return null;
  const text = await entry.async('string');
  if (!text) return null;
  return JSON.parse(text);
}
async function readText(zip, file) {
  const entry = zip.file(file);
  if (!entry) return '';
  return entry.async('string');
}
function collectWorkspaceIds(value, out = new Set(), seen = new WeakSet()) {
  if (value === null || value === undefined) return out;
  if (typeof value === 'string') {
    const matches = value.match(/workspace-\d+/g);
    if (matches) matches.forEach(id => out.add(id));
    return out;
  }
  if (typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) value.forEach(v => collectWorkspaceIds(v, out, seen));
  else Object.values(value).forEach(v => collectWorkspaceIds(v, out, seen));
  return out;
}
function inferVariant(tab, payload, layout) {
  const direct = Number(payload?.__regressionVariant);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const text = [
    tab?.title,
    payload?.config?.title,
    payload?.style?.title,
    payload?.config?.notes?.text,
    payload?.notes?.text
  ].filter(Boolean).join(' ');
  const match = /variant\s*(\d+)/i.exec(text);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const width = Number(layout?.svgBox?.widthPx ?? layout?.svgBox?.baseWidthPx ?? layout?.svgBox?.dataset?.svgWidth);
  if (width === 426) return 1;
  if (width === 512) return 2;
  return null;
}
function extractVariantProperties(tab, payload, layout, type) {
  const c = payload?.config && typeof payload.config === 'object' ? payload.config : {};
  const style = payload?.style && typeof payload.style === 'object' ? payload.style : {};
  const settings = c.settings && typeof c.settings === 'object' ? c.settings : {};
  const svgBox = layout?.svgBox || {};
  const dataset = svgBox.dataset || {};
  const base = {
    type,
    variant: inferVariant(tab, payload, layout),
    title: c.title || style.title || '',
    fontSize: String(c.fontSize ?? style.fontsize ?? settings.fontSize ?? ''),
    colorScheme: c.colorScheme || style.colorScheme || settings.colorScheme || '',
    width: String(svgBox.widthPx ?? svgBox.baseWidthPx ?? dataset.svgWidth ?? dataset.resizerWidth ?? ''),
    height: String(svgBox.heightPx ?? svgBox.baseHeightPx ?? dataset.svgHeight ?? dataset.resizerHeight ?? ''),
    aspectLocked: String(dataset.aspectLocked ?? dataset.resizerAspectLocked ?? layout?.aspectLocked ?? '')
  };
  switch (type) {
    case 'box': return { ...base, graphType: c.graphType || '', pointMode: c.pointMode || '', groupLayout: c.groupLayout || '', showGrid: !!c.showGrid };
    case 'scatter': return { ...base, graphType: c.graphType || '', viewMode: c.viewMode || '', colorMode: c.colorMode || '', regressionMode: c.regression?.mode || c.stats?.regressionMode || '', showGrid: !!c.showGrid };
    case 'line': return { ...base, displayMode: c.displayMode || '', viewMode: c.viewMode || '', regressionMode: c.regression?.mode || '', showGrid: !!c.showGrid };
    case 'hist': return { ...base, plotMode: c.plotMode || '', createMode: c.frequency?.createMode || '', tabulateMode: c.frequency?.tabulateMode || '', diagnosticsMode: c.stats?.diagnosticsMode || '' };
    case 'heatmap': return { ...base, view: c.view || c.heatmapView || '', significanceDisplay: c.significanceDisplay || '' };
    case 'pca': return { ...base, method: c.method || '', viewMode: c.viewMode || '', showGrid: !!c.showGrid };
    case 'pie': return { ...base, chartType: c.chartType || '', showLegend: c.showLegend !== false };
    case 'roc': return { ...base, graphType: c.graphType || '', showGrid: !!c.showGrid, showLegend: c.showLegend !== false };
    case 'survival': return { ...base, showCI: !!c.showCI, showCensor: !!c.showCensor, showHazardRatios: !!c.showHazardRatios, pairwiseCorrection: c.pairwiseCorrection || '' };
    case 'venn': return { ...base, plotType: style.plotType || '', opacity: style.opacity || '', borderWidth: style.borderWidth || '', labelA: payload?.data?.labelA || '' };
    case 'surface': return { ...base, interpolation: settings.interpolation || c.interpolation || '', showPoints: !!settings.showPoints, showGrid: !!(settings.showGrid ?? c.showGrid) };
    default: return base;
  }
}
function parseArgs(argv) {
  const out = { graph: '', quiet: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--quiet') out.quiet = true;
    else if (!out.graph) out.graph = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

async function analyzeGraphFile(graphPath, options = {}) {
  if (!graphPath) throw new Error('Missing .graph path');
  const buf = fs.readFileSync(graphPath);
  const zip = await JSZip.loadAsync(buf);
  const manifest = await readJson(zip, 'manifest.json');
  const fileNames = Object.keys(zip.files).filter(name => !zip.files[name].dir);

  const tabJsonFiles = fileNames.filter(name => /\/tab\.json$/.test(name)).sort();
  const tabs = [];
  const failures = [];
  const warnings = [];
  const byType = new Map();

  for (const tabFile of tabJsonFiles) {
    const dir = tabFile.replace(/tab\.json$/, '');
    const tab = await readJson(zip, tabFile);
    const payload = await readJson(zip, `${dir}payload.json`);
    const layout = await readJson(zip, `${dir}layout.json`);
    const preview = await readJson(zip, `${dir}preview.json`);
    const renderCache = await readJson(zip, `${dir}render-cache.json`);
    const uiState = await readJson(zip, `${dir}ui-state.json`);
    const type = tab?.type || payload?.type || 'unknown';
    const tabId = tab?.runtimeTabId || tab?.id || tab?.tabId || null;
    const previewMarkup = preview?.markup || preview?.svg || preview?.html || '';
    const normalizedPreview = normalizeWorkspaceIds(previewMarkup);
    const idsInState = {
      layout: Array.from(collectWorkspaceIds(layout)),
      preview: Array.from(collectWorkspaceIds(preview)),
      renderCache: Array.from(collectWorkspaceIds(renderCache)),
      uiState: Array.from(collectWorkspaceIds(uiState))
    };
    const variantProperties = extractVariantProperties(tab, payload, layout, type);
    const variantHash = sha1(JSON.stringify(variantProperties));
    const layoutFingerprint = `${variantProperties.width}x${variantProperties.height}:${variantProperties.aspectLocked}`;
    const row = {
      dir,
      title: tab?.title || '',
      type,
      tabId,
      hasPayload: !!payload,
      hasLayout: !!layout,
      hasPreview: !!previewMarkup,
      hasRenderCache: !!renderCache,
      hasUiState: !!uiState,
      previewLength: normalizedPreview.length,
      previewHash: sha1(normalizedPreview),
      renderCacheOwnerTabId: renderCache?.tabId || renderCache?.__graphitixRenderCache?.tabId || null,
      renderCacheType: renderCache?.type || renderCache?.__graphitixRenderCache?.type || renderCache?.__graphitixRenderCache?.component || null,
      regressionVariant: variantProperties.variant,
      variantHash,
      layoutFingerprint,
      variantProperties,
      idsInState
    };
    tabs.push(row);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(row);

    if (!row.hasPayload) failures.push(`${row.title || row.dir}: missing payload.json`);
    if (!row.hasLayout) failures.push(`${row.title || row.dir}: missing layout.json`);
    if (!row.hasPreview) failures.push(`${row.title || row.dir}: missing preview.json or empty preview markup`);
    if (!row.hasRenderCache) warnings.push(`${row.title || row.dir}: missing render-cache.json`);
    if (!row.hasUiState) failures.push(`${row.title || row.dir}: missing ui-state.json`);
    if (row.renderCacheOwnerTabId && tabId && row.renderCacheOwnerTabId !== tabId) {
      failures.push(`${row.title || row.dir}: render-cache tabId ${row.renderCacheOwnerTabId} != tab runtime id ${tabId}`);
    }
    if (row.renderCacheType && type && row.renderCacheType !== type) {
      failures.push(`${row.title || row.dir}: render-cache type ${row.renderCacheType} != tab type ${type}`);
    }
    for (const [bucket, ids] of Object.entries(idsInState)) {
      const bad = ids.filter(id => tabId && id !== tabId);
      if (bad.length) failures.push(`${row.title || row.dir}: ${bucket} contains stale workspace ids ${bad.join(', ')} expected ${tabId}`);
    }
  }

  const duplicatePreviewGroups = [];
  const duplicateVariantGroups = [];
  const duplicateLayoutGroups = [];
  for (const [type, rows] of byType.entries()) {
    if (rows.length < 2) continue;
    const hashMap = new Map();
    const variantMap = new Map();
    const layoutMap = new Map();
    rows.forEach(row => {
      if (!hashMap.has(row.previewHash)) hashMap.set(row.previewHash, []);
      hashMap.get(row.previewHash).push(row);
      if (!variantMap.has(row.variantHash)) variantMap.set(row.variantHash, []);
      variantMap.get(row.variantHash).push(row);
      if (!layoutMap.has(row.layoutFingerprint)) layoutMap.set(row.layoutFingerprint, []);
      layoutMap.get(row.layoutFingerprint).push(row);
    });
    for (const [hash, group] of hashMap.entries()) {
      if (group.length > 1) {
        duplicatePreviewGroups.push({
          type,
          hash,
          tabIds: group.map(row => row.tabId),
          titles: group.map(row => row.title)
        });
      }
    }
    for (const [hash, group] of variantMap.entries()) {
      if (group.length > 1) {
        duplicateVariantGroups.push({
          type,
          hash,
          tabIds: group.map(row => row.tabId),
          titles: group.map(row => row.title),
          properties: group.map(row => row.variantProperties)
        });
      }
    }
    for (const [fingerprint, group] of layoutMap.entries()) {
      if (group.length > 1) {
        duplicateLayoutGroups.push({
          type,
          fingerprint,
          tabIds: group.map(row => row.tabId),
          titles: group.map(row => row.title)
        });
      }
    }
    const variants = new Set(rows.map(row => row.regressionVariant).filter(Boolean));
    if (variants.size && variants.size < rows.length) {
      failures.push(`saved archive variants for type ${type} are not distinct: ${Array.from(variants).join(', ')}`);
    }
  }
  duplicatePreviewGroups.forEach(group => {
    failures.push(`duplicate saved preview for type ${group.type}: ${group.titles.join(' | ')}`);
  });
  duplicateVariantGroups.forEach(group => {
    failures.push(`duplicate saved variant properties for type ${group.type}: ${group.titles.join(' | ')}`);
  });
  duplicateLayoutGroups.forEach(group => {
    failures.push(`duplicate saved layout for type ${group.type}: ${group.titles.join(' | ')}`);
  });

  const counts = {
    tabs: tabs.length,
    payload: tabs.filter(t => t.hasPayload).length,
    layout: tabs.filter(t => t.hasLayout).length,
    preview: tabs.filter(t => t.hasPreview).length,
    renderCache: tabs.filter(t => t.hasRenderCache).length,
    uiState: tabs.filter(t => t.hasUiState).length,
    components: Array.from(byType.keys()).sort()
  };

  const result = {
    graphPath: path.resolve(graphPath),
    bytes: buf.length,
    manifest: manifest ? { version: manifest.version, scope: manifest.scope, tabCount: manifest.tabCount || manifest.tabs?.length || null } : null,
    counts,
    tabs,
    duplicatePreviewGroups,
    duplicateVariantGroups,
    duplicateLayoutGroups,
    warnings,
    failures
  };

  if (!options.quiet) {
    console.log(JSON.stringify(result, null, 2));
  }
  return result;
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  analyzeGraphFile(args.graph, { quiet: args.quiet }).then(result => {
    if (!args.quiet) return;
    console.log(`Graph: ${result.graphPath}`);
    console.log(`Tabs: ${result.counts.tabs}`);
    console.log(`Payload/layout/preview/cache/ui: ${result.counts.payload}/${result.counts.layout}/${result.counts.preview}/${result.counts.renderCache}/${result.counts.uiState}`);
    if (result.warnings.length) {
      console.log('WARNINGS:');
      result.warnings.forEach(f => console.log(`- ${f}`));
    }
    if (result.failures.length) {
      console.log('FAILURES:');
      result.failures.forEach(f => console.log(`- ${f}`));
      process.exitCode = 1;
    } else {
      console.log('PASS');
    }
  }).catch(err => {
    console.error(err.stack || err.message || String(err));
    process.exit(1);
  });
}

module.exports = { analyzeGraphFile };
