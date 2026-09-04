#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'assets', 'welcome-examples');
const REGISTRY_FILE = 'thumbnails.js';
const PORT = Number(process.env.GRAPHITIX_WELCOME_THUMB_PORT || 4174);
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 220;
const THUMBNAIL_PADDING = 10;
const MANIFEST_SCHEMA_VERSION = 6;
const GENERATOR_ID = 'scripts/generate-welcome-example-thumbnails.cjs';
const PREVIEW_SOURCE = 'Graphitix owner-scoped SVG projection';
const ASSET_FORMAT = 'svg';
const TYPES = Object.freeze([
  'box',
  'scatter',
  'line',
  'hist',
  'heatmap',
  'pca',
  'pie',
  'roc',
  'survival',
  'venn',
  'surface'
]);
const EXAMPLE_MODES_BY_TYPE = Object.freeze({
  box: ['single', 'grouped'],
  scatter: ['scatter', 'scatter3d', 'scatterBubble', 'grouped', 'groupedXY', 'volcano', 'ma'],
  line: ['standard', 'groupedDoseResponse', 'threeD'],
  hist: ['default'],
  heatmap: ['default'],
  pca: ['standard', 'grouped'],
  pie: ['default'],
  roc: ['default'],
  survival: ['default'],
  venn: ['default'],
  surface: ['default']
});
const GENERATOR_OUTPUT_CONTRACT = 'graphitix-welcome-svg-v6-platform-neutral-provenance-structural-ids';
const GRAPH_TITLE_CONTROL_SELECTOR = '.resizer-graph-title-checkbox';
const GRAPH_TITLE_ROLE_SELECTOR = 'text[data-font-role="graphTitle"]';
const GRAPH_TITLE_MARKER_PATTERN = /data-font-role=["']graphTitle["']/i;
const PROPORTIONAL_STROKE_CONTRACT = 'source-viewport-baked-strokes-v1';
const LEGEND_CONTROL_IDS = Object.freeze({
  box: 'boxShowLegend',
  scatter: 'scatterShowLegend',
  line: 'lineShowLegend',
  hist: 'histShowLegend',
  pca: 'pcaShowLegend',
  pie: 'pieShowLegend',
  roc: 'rocShowLegend',
  survival: 'survivalShowLegend',
  surface: 'surfaceShowLegend'
});
const CANONICAL_CONTROL_SUPPRESSIONS = Object.freeze({
  survival: Object.freeze([
    {
      controlId: 'survivalShowRiskTable',
      readyReason: 'welcome-thumbnail-risk-table-suppressed'
    }
  ])
});
const LEGEND_NODE_SELECTOR = [
  '[data-legend-viewport-content="true"]',
  '[data-box-legend]',
  '[data-legend-key]',
  'g.surface-legend'
].join(',');
const LEGEND_MARKER_PATTERN = /(?:data-legend-viewport-content|data-box-legend|data-legend-key|class=["'][^"']*\bsurface-legend\b)/i;
const SOURCE_COMMON_FILES = Object.freeze([
  'index.html',
  'package.json',
  'css/style.css',
  'js/main/bootstrap.js',
  'js/main/components.js',
  'js/main/tabs.js'
]);

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm'
  };
  return types[ext] || 'application/octet-stream';
}

function resolveStaticPath(requestUrl) {
  const parsed = new URL(requestUrl || '/', 'http://127.0.0.1');
  const decoded = decodeURIComponent(parsed.pathname || '/');
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relativePath);
  return resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`) ? resolved : null;
}

function createStaticServer(port) {
  const server = http.createServer((req, res) => {
    const filePath = resolveStaticPath(req.url);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    fs.stat(filePath, (error, stat) => {
      if (error || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': mimeType(filePath),
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function normalizeTextForHash(value) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function hashCanonicalText(value) {
  return crypto.createHash('sha256').update(normalizeTextForHash(value), 'utf8').digest('hex');
}

function walkFiles(relativeDirectory) {
  const absoluteDirectory = path.join(ROOT, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) {
    return [];
  }
  const output = [];
  const visit = absolutePath => {
    fs.readdirSync(absolutePath, { withFileTypes: true }).forEach(entry => {
      const childPath = path.join(absolutePath, entry.name);
      if (entry.isDirectory()) {
        visit(childPath);
      } else if (entry.isFile()) {
        output.push(path.relative(ROOT, childPath).replace(/\\/g, '/'));
      }
    });
  };
  visit(absoluteDirectory);
  return output.sort();
}

function getSourceFiles(type) {
  return Array.from(new Set([
    ...SOURCE_COMMON_FILES,
    ...walkFiles('js/shared').filter(relativePath => relativePath !== 'js/shared/exampleDatasets.js'),
    ...walkFiles('js/workers'),
    `js/components/${type}.js`
  ])).sort();
}

function readExampleRecordsForFingerprint(type) {
  const sourcePath = path.join(ROOT, 'js', 'shared', 'exampleDatasets.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  const registry = sandbox.window?.Shared?.exampleDatasets;
  if (!registry || typeof registry.get !== 'function') {
    throw new Error('Welcome thumbnail source registry could not be evaluated.');
  }
  return (EXAMPLE_MODES_BY_TYPE[type] || ['default']).map(mode => ({
    mode,
    record: registry.get(type, mode)
  }));
}

function computeSourceFingerprint(type) {
  const hash = crypto.createHash('sha256');
  hash.update(GENERATOR_OUTPUT_CONTRACT);
  hash.update('\0');
  getSourceFiles(type).forEach(relativePath => {
    const absolutePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Welcome thumbnail source is missing: ${relativePath}`);
    }
    hash.update(relativePath);
    hash.update('\0');
    hash.update(normalizeTextForHash(fs.readFileSync(absolutePath)));
    hash.update('\0');
  });
  hash.update('example-records');
  hash.update('\0');
  hash.update(JSON.stringify(readExampleRecordsForFingerprint(type)));
  return hash.digest('hex');
}

function computeSourceFingerprints() {
  const byType = Object.fromEntries(TYPES.map(type => [type, computeSourceFingerprint(type)]));
  return {
    byType,
    aggregate: hashCanonicalText(TYPES.map(type => `${type}:${byType[type]}`).join('\n'))
  };
}

function parseRequestedTypes(argv = process.argv.slice(2)) {
  const option = argv.find(argument => argument.startsWith('--types='));
  if (!option) {
    return TYPES.slice();
  }
  const requested = option.slice('--types='.length)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const invalid = requested.filter(type => !TYPES.includes(type));
  if (!requested.length || invalid.length) {
    throw new Error(`Invalid welcome thumbnail type selection: ${invalid.join(', ') || 'empty selection'}.`);
  }
  return TYPES.filter(type => requested.includes(type));
}

function stripXmlDeclaration(svgText) {
  return String(svgText || '').replace(/^\s*<\?xml\b[^>]*>\s*/i, '').trim();
}

function readSvgAttributes(svgText) {
  const openingTag = stripXmlDeclaration(svgText).match(/^<svg\b[^>]*>/i)?.[0] || '';
  const read = name => openingTag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] || null;
  return {
    width: read('width'),
    height: read('height'),
    viewBox: read('viewBox'),
    xmlns: read('xmlns'),
    preserveAspectRatio: read('preserveAspectRatio')
  };
}

function parseFiniteSvgNumber(value) {
  const normalized = String(value ?? '').trim().replace(/px$/i, '');
  const numeric = Number(normalized);
  return normalized !== '' && Number.isFinite(numeric) ? numeric : null;
}

function parseSvgViewBox(rawValue, fallbackWidth, fallbackHeight) {
  const values = String(rawValue || '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  }
  const width = parseFiniteSvgNumber(fallbackWidth);
  const height = parseFiniteSvgNumber(fallbackHeight);
  if (!(width > 0) || !(height > 0)) {
    throw new Error('Canonical SVG has no usable viewport.');
  }
  return { x: 0, y: 0, width, height };
}

function resolveCanonicalSvgDimensions(svgText, fallbackWidth, fallbackHeight) {
  const attributes = readSvgAttributes(svgText);
  const fallbackWidthValue = parseFiniteSvgNumber(fallbackWidth);
  const fallbackHeightValue = parseFiniteSvgNumber(fallbackHeight);
  const attributeWidth = parseFiniteSvgNumber(attributes.width);
  const attributeHeight = parseFiniteSvgNumber(attributes.height);
  const viewBox = parseSvgViewBox(
    attributes.viewBox,
    attributeWidth || fallbackWidthValue,
    attributeHeight || fallbackHeightValue
  );
  return {
    width: attributeWidth > 0 ? attributeWidth : (fallbackWidthValue > 0 ? fallbackWidthValue : viewBox.width),
    height: attributeHeight > 0 ? attributeHeight : (fallbackHeightValue > 0 ? fallbackHeightValue : viewBox.height)
  };
}

function parsePreserveAspectRatio(rawValue) {
  const tokens = String(rawValue || 'xMidYMid meet')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => token.toLowerCase() !== 'defer');
  if (tokens[0]?.toLowerCase() === 'none') {
    return { align: 'none', mode: 'none', xFactor: 0, yFactor: 0 };
  }
  const align = /^(xMin|xMid|xMax)(YMin|YMid|YMax)$/i.test(tokens[0] || '')
    ? tokens[0]
    : 'xMidYMid';
  const mode = String(tokens[1] || 'meet').toLowerCase() === 'slice' ? 'slice' : 'meet';
  const xFactor = /^xMin/i.test(align) ? 0 : (/^xMax/i.test(align) ? 1 : 0.5);
  const yFactor = /YMin$/i.test(align) ? 0 : (/YMax$/i.test(align) ? 1 : 0.5);
  return { align, mode, xFactor, yFactor };
}

function computeWelcomeThumbnailProjection(options = {}) {
  const width = Number(options.width);
  const height = Number(options.height);
  const padding = Number(options.padding);
  const sourceWidth = Number(options.sourceWidth);
  const sourceHeight = Number(options.sourceHeight);
  const viewBox = options.viewBox || null;
  if (!(width > 0) || !(height > 0) || !(padding >= 0)) {
    throw new Error('Welcome thumbnail target dimensions are invalid.');
  }
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    throw new Error('Canonical SVG source dimensions are invalid.');
  }
  if (!viewBox || !(viewBox.width > 0) || !(viewBox.height > 0)) {
    throw new Error('Canonical SVG source viewBox is invalid.');
  }

  const contentWidth = Math.max(1, width - padding * 2);
  const contentHeight = Math.max(1, height - padding * 2);
  const viewportScale = Math.min(contentWidth / sourceWidth, contentHeight / sourceHeight);
  const renderedViewportWidth = sourceWidth * viewportScale;
  const renderedViewportHeight = sourceHeight * viewportScale;
  const viewportX = padding + (contentWidth - renderedViewportWidth) / 2;
  const viewportY = padding + (contentHeight - renderedViewportHeight) / 2;
  const preserve = parsePreserveAspectRatio(options.preserveAspectRatio);

  let scaleX;
  let scaleY;
  let sourceOffsetX = 0;
  let sourceOffsetY = 0;
  if (preserve.mode === 'none') {
    scaleX = sourceWidth / viewBox.width;
    scaleY = sourceHeight / viewBox.height;
  } else {
    const candidateX = sourceWidth / viewBox.width;
    const candidateY = sourceHeight / viewBox.height;
    const sourceScale = preserve.mode === 'slice'
      ? Math.max(candidateX, candidateY)
      : Math.min(candidateX, candidateY);
    scaleX = sourceScale;
    scaleY = sourceScale;
    sourceOffsetX = (sourceWidth - viewBox.width * sourceScale) * preserve.xFactor;
    sourceOffsetY = (sourceHeight - viewBox.height * sourceScale) * preserve.yFactor;
  }

  const a = viewportScale * scaleX;
  const d = viewportScale * scaleY;
  const e = viewportX + viewportScale * sourceOffsetX - viewBox.x * a;
  const f = viewportY + viewportScale * sourceOffsetY - viewBox.y * d;
  return {
    matrix: { a, b: 0, c: 0, d, e, f },
    viewportScale,
    renderedViewport: {
      x: viewportX,
      y: viewportY,
      width: renderedViewportWidth,
      height: renderedViewportHeight
    },
    preserveAspectRatio: preserve,
    viewBox: { ...viewBox },
    sourceWidth,
    sourceHeight
  };
}

function formatSvgNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error('Cannot serialize a non-finite SVG number.');
  }
  const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(12));
  return String(rounded);
}

function validateStandaloneSvg(svgText, type = null) {
  const text = String(svgText || '').trim();
  const markup = stripXmlDeclaration(text);
  if (!markup.startsWith('<svg')) {
    throw new Error('Generated thumbnail is not a standalone SVG document.');
  }
  const attrs = readSvgAttributes(text);
  if (attrs.width !== String(THUMBNAIL_WIDTH)
    || attrs.height !== String(THUMBNAIL_HEIGHT)
    || attrs.viewBox !== `0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}`
    || attrs.xmlns !== 'http://www.w3.org/2000/svg') {
    throw new Error('Generated SVG does not match the welcome thumbnail viewport contract.');
  }
  const svgTagCount = (markup.match(/<svg\b/gi) || []).length;
  if (svgTagCount !== 1) {
    throw new Error(`Generated SVG must have one flattened root; found ${svgTagCount} SVG elements.`);
  }
  if (/<(?:script|foreignObject|iframe|object|embed)\b|javascript\s*:/i.test(markup)) {
    throw new Error('Generated SVG contains executable or unsupported embedded content.');
  }
  if (/<image\b/i.test(markup)) {
    throw new Error('Generated SVG contains a raster image; welcome thumbnails must remain vector.');
  }
  const externalReference = markup.match(/\b(?:href|xlink:href)\s*=\s*["'](?!#)([^"']+)["']/i);
  if (externalReference) {
    throw new Error(`Generated SVG contains an external reference: ${externalReference[1]}`);
  }
  if (!/\bdata-inline-ready=["']true["']/i.test(markup)) {
    throw new Error('Generated SVG is not marked as inline-ready.');
  }
  if (!/\bdata-graph-title-suppressed=["']true["']/i.test(markup)) {
    throw new Error('Generated SVG is not marked as graph-title suppressed.');
  }
  if (!new RegExp(`\\bdata-proportional-stroke-contract=["']${PROPORTIONAL_STROKE_CONTRACT}["']`, 'i').test(markup)) {
    throw new Error('Generated SVG does not use the proportional stroke-scaling contract.');
  }
  if (!/\bdata-thumbnail-visual-scale=["'][0-9.eE+-]+["']/i.test(markup)
    || !/\bdata-non-scaling-stroke-count=["']\d+["']/i.test(markup)) {
    throw new Error('Generated SVG is missing visual-scaling provenance.');
  }
  const expectedBakedStrokeCount = Number(markup.match(/\bdata-non-scaling-stroke-count=["'](\d+)["']/i)?.[1] || 0);
  const actualBakedStrokeCount = (markup.match(/\bdata-welcome-baked-stroke=["']true["']/gi) || []).length;
  if (actualBakedStrokeCount !== expectedBakedStrokeCount) {
    throw new Error('Generated SVG baked-stroke provenance does not match its content.');
  }
  if (type === 'heatmap') {
    const projection = markup.match(/\bdata-export-projection=["']([^"']+)["']/i)?.[1] || '';
    if (!['svg', 'vector-matrix'].includes(projection)) {
      throw new Error(`Heatmap thumbnail has an invalid vector export projection: ${projection || 'missing'}.`);
    }
    if (projection === 'vector-matrix'
      && !/\bdata-heatmap-vector-cell-count=["'][1-9]\d*["']/i.test(markup)) {
      throw new Error('Heatmap vector-matrix thumbnail has no vector cell payload.');
    }
  }
  return attrs;
}

function readManifest() {
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Welcome example manifest is missing.');
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Welcome example manifest is invalid JSON: ${error.message}`);
  }
  if (manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION
    || manifest?.generator !== GENERATOR_ID
    || manifest?.assetFormat !== ASSET_FORMAT
    || manifest?.previewSource !== PREVIEW_SOURCE
    || manifest?.width !== THUMBNAIL_WIDTH
    || manifest?.height !== THUMBNAIL_HEIGHT
    || !Array.isArray(manifest?.examples)
    || manifest?.registry?.file !== REGISTRY_FILE) {
    throw new Error('Welcome example manifest does not match the SVG generation contract.');
  }
  return manifest;
}

function validateLegendSuppression(type, record, failures) {
  const suppression = record?.legendSuppression || null;
  const controlId = LEGEND_CONTROL_IDS[type] || null;
  if (controlId) {
    if (!suppression
      || suppression.mode !== 'control'
      || suppression.controlId !== controlId
      || suppression.requested !== true
      || suppression.verified !== true) {
      failures.push(`${type}.svg has invalid canonical legend-suppression metadata`);
    }
    return;
  }
  if (!suppression
    || suppression.mode !== 'not-applicable'
    || suppression.requested !== false
    || !['continuous-color-scale', 'no-legend-control'].includes(suppression.reason)) {
    failures.push(`${type}.svg has invalid legend applicability metadata`);
  }
}

function validateGraphTitleSuppression(type, record, failures) {
  const suppression = record?.graphTitleSuppression || null;
  if (!suppression
    || suppression.mode !== 'control'
    || suppression.selector !== GRAPH_TITLE_CONTROL_SELECTOR
    || suppression.requested !== true
    || suppression.verified !== true) {
    failures.push(`${type}.svg has invalid canonical graph-title-suppression metadata`);
  }
}

function readRegistry(registryText) {
  const sandbox = { window: {} };
  vm.runInNewContext(String(registryText || ''), sandbox, {
    filename: REGISTRY_FILE,
    timeout: 1000
  });
  const registry = sandbox.window.GraphitixWelcomeThumbnails;
  if (!registry || typeof registry !== 'object') {
    throw new Error('Welcome thumbnail registry did not publish GraphitixWelcomeThumbnails.');
  }
  return registry;
}

function checkGeneratedAssets(options = {}) {
  const manifest = readManifest();
  const fingerprints = computeSourceFingerprints();
  const recordsByType = new Map(manifest.examples.map(record => [record?.type, record]));
  const failures = [];
  const manifestTypes = manifest.examples.map(record => record?.type);
  const registryPath = path.join(OUTPUT_DIR, REGISTRY_FILE);
  let registry = null;

  if (manifest.sourceFingerprint !== fingerprints.aggregate) {
    failures.push('manifest source fingerprint is stale');
  }
  if (manifestTypes.length !== TYPES.length
    || new Set(manifestTypes).size !== TYPES.length
    || TYPES.some((type, index) => manifestTypes[index] !== type)) {
    failures.push(`manifest types must be exactly: ${TYPES.join(', ')}`);
  }

  if (!fs.existsSync(registryPath)) {
    failures.push(`${REGISTRY_FILE} is missing`);
  } else {
    try {
      const registryText = fs.readFileSync(registryPath, 'utf8');
      if (manifest.registry.sha256 !== hashCanonicalText(registryText)) {
        failures.push(`${REGISTRY_FILE} does not match its manifest hash`);
      }
      registry = readRegistry(registryText);
    } catch (error) {
      failures.push(`${REGISTRY_FILE}: ${error.message}`);
    }
  }

  TYPES.forEach(type => {
    const fileName = `${type}.svg`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    const record = recordsByType.get(type);
    if (!record) {
      failures.push(`${fileName} has no manifest record`);
      return;
    }
    if (record.file !== fileName
      || record.width !== THUMBNAIL_WIDTH
      || record.height !== THUMBNAIL_HEIGHT
      || record.source !== PREVIEW_SOURCE
      || !['canonical-export', 'owner-preview-migrated'].includes(record.captureMode)
      || record.sourceFormat !== 'svg'
      || record.inlineReady !== true
      || record.rasterImageCount !== 0
      || record.proportionalStrokeContract !== PROPORTIONAL_STROKE_CONTRACT
      || !(record.visualScale > 0)
      || !(record.sourceWidth > 0)
      || !(record.sourceHeight > 0)
      || !Number.isInteger(record.nonScalingStrokeCount)
      || record.nonScalingStrokeCount < 0
      || record.sourceFingerprint !== fingerprints.byType[type]) {
      failures.push(`${fileName} has invalid or stale provenance metadata`);
    }
    validateLegendSuppression(type, record, failures);
    validateGraphTitleSuppression(type, record, failures);
    if (!fs.existsSync(filePath)) {
      failures.push(`${fileName} is missing`);
      return;
    }
    try {
      const svgText = fs.readFileSync(filePath, 'utf8');
      validateStandaloneSvg(svgText, type);
      if (Buffer.byteLength(svgText, 'utf8') < 800) {
        failures.push(`${fileName} is unexpectedly small`);
      }
      if (LEGEND_CONTROL_IDS[type] && LEGEND_MARKER_PATTERN.test(svgText)) {
        failures.push(`${fileName} still contains a rendered legend after canonical suppression`);
      }
      if (!/\bdata-graph-title-suppressed=["']true["']/i.test(svgText)) {
        failures.push(`${fileName} is not marked as graph-title suppressed`);
      }
      if (!new RegExp(`\\bdata-proportional-stroke-contract=["']${PROPORTIONAL_STROKE_CONTRACT}["']`, 'i').test(svgText)) {
        failures.push(`${fileName} is not marked with the proportional-stroke contract`);
      }
      if (GRAPH_TITLE_MARKER_PATTERN.test(svgText)) {
        failures.push(`${fileName} still contains a graph-title marker after canonical suppression`);
      }
      if (/\bvector-effect\s*=\s*["']non-scaling-stroke["']/i.test(svgText)
        || /\bvector-effect\s*:\s*non-scaling-stroke\b/i.test(svgText)) {
        failures.push(`${fileName} still contains a non-scaling stroke`);
      }
      if (record.sha256 !== hashCanonicalText(svgText)) {
        failures.push(`${fileName} does not match its manifest hash`);
      }
      if (!registry
        || normalizeTextForHash(registry[type]) !== normalizeTextForHash(stripXmlDeclaration(svgText))) {
        failures.push(`${fileName} does not match the inline thumbnail registry`);
      }
    } catch (error) {
      failures.push(`${fileName}: ${error.message}`);
    }
  });

  if (registry) {
    const registryTypes = Object.keys(registry);
    if (registryTypes.length !== TYPES.length || TYPES.some(type => !registryTypes.includes(type))) {
      failures.push(`${REGISTRY_FILE} must contain exactly the ${TYPES.length} graph types`);
    }
  }

  if (failures.length) {
    throw new Error(`Welcome example assets are invalid or stale:\n- ${failures.join('\n- ')}`);
  }
  if (options.quiet !== true) {
    process.stdout.write(`Verified ${TYPES.length} fresh, self-contained vector welcome thumbnails.\n`);
  }
  return manifest;
}

async function awaitOwnerRenderReady(page, type, reason) {
  const outcome = await page.evaluate(async ({ selectedType, readyReason }) => {
    const state = window.Main?.session?.workspaceState || null;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const component = window.Components?.[selectedType] || null;
    if (!tab || !component) {
      return { ok: false, reason: 'owner-or-component-missing' };
    }
    let readiness = { ok: true, skipped: true, reason: 'no-component-readiness-hook' };
    if (typeof component.awaitReadyForSnapshot === 'function') {
      readiness = await component.awaitReadyForSnapshot({
        tabId: tab.id,
        componentKey: selectedType,
        reason: readyReason
      });
    }
    await window.Shared?.componentLifecycle?.waitForAnimationFrames?.(2);
    return readiness || { ok: true };
  }, { selectedType: type, readyReason: reason });
  if (outcome?.ok === false) {
    throw new Error(`Graphitix did not reach snapshot readiness for ${type}: ${outcome.reason || 'unknown reason'}.`);
  }
}

async function waitForRenderedExample(page, type) {
  await page.evaluate(async selectedType => {
    await window.Main.tabs.launchWelcomeGraph(selectedType, {
      loadExample: true,
      reason: 'welcome-thumbnail-generator'
    });
  }, type);

  await page.waitForFunction(selectedType => {
    const state = window.Main?.session?.workspaceState || null;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const mounted = tab
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, selectedType) || null
      : null;
    const root = mounted || document.querySelector(`#${selectedType}Page:not([hidden])`);
    const svg = root?.querySelector?.('.svgbox svg:not(.resizer-options-icon), svg[data-preview-source="true"]') || null;
    if (!tab || !root || !svg || window.Components?.[selectedType]?.ready !== true) {
      return false;
    }
    if (window.Shared?.componentLifecycle?.isRestoreTransactionActive?.(selectedType, { tabId: tab.id })) {
      return false;
    }
    return typeof svg.innerHTML === 'string' && svg.innerHTML.trim().length > 0;
  }, type, { timeout: 120000 });
  await awaitOwnerRenderReady(page, type, 'welcome-thumbnail-example-ready');
}

async function suppressLegendThroughCanonicalControl(page, type) {
  const controlId = LEGEND_CONTROL_IDS[type] || null;
  if (!controlId) {
    return {
      mode: 'not-applicable',
      requested: false,
      reason: type === 'heatmap' ? 'continuous-color-scale' : 'no-legend-control'
    };
  }

  const result = await page.evaluate(({ selectedType, selectedControlId }) => {
    const state = window.Main?.session?.workspaceState || null;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const mounted = tab
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, selectedType) || null
      : null;
    const root = mounted || document.querySelector(`#${selectedType}Page:not([hidden])`);
    const control = root?.querySelector?.(`#${selectedControlId}`) || null;
    if (!(control instanceof HTMLInputElement) || control.type !== 'checkbox') {
      return { ok: false, reason: 'control-missing' };
    }
    const changed = control.checked === true;
    if (changed) {
      control.click();
    }
    return { ok: true, changed, checked: control.checked };
  }, { selectedType: type, selectedControlId: controlId });

  if (!result?.ok) {
    throw new Error(`Canonical legend control #${controlId} is unavailable for ${type}.`);
  }

  await page.waitForFunction(({ selectedType, selectedControlId, legendSelector }) => {
    const state = window.Main?.session?.workspaceState || null;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const mounted = tab
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, selectedType) || null
      : null;
    const root = mounted || document.querySelector(`#${selectedType}Page:not([hidden])`);
    const svg = root?.querySelector?.('.svgbox svg:not(.resizer-options-icon), svg[data-preview-source="true"]') || null;
    const control = root?.querySelector?.(`#${selectedControlId}`) || null;
    if (!tab || !root || !svg || !control || control.checked) {
      return false;
    }
    if (window.Shared?.componentLifecycle?.isRestoreTransactionActive?.(selectedType, { tabId: tab.id })) {
      return false;
    }
    return !Array.from(svg.querySelectorAll(legendSelector)).some(node => {
      const style = window.getComputedStyle?.(node);
      if (style?.display === 'none' || style?.visibility === 'hidden' || Number(style?.opacity) === 0) {
        return false;
      }
      try {
        const box = typeof node.getBBox === 'function' ? node.getBBox() : null;
        return !box || box.width > 0 || box.height > 0;
      } catch (_) {
        return true;
      }
    });
  }, {
    selectedType: type,
    selectedControlId: controlId,
    legendSelector: LEGEND_NODE_SELECTOR
  }, { timeout: 120000 });

  await awaitOwnerRenderReady(page, type, 'welcome-thumbnail-legend-suppressed');
  return {
    mode: 'control',
    controlId,
    requested: true,
    changed: result.changed === true,
    verified: true
  };
}

async function suppressGraphTitleThroughCanonicalControl(page, type) {
  const result = await page.evaluate(({ selectedType, controlSelector }) => {
    const state = window.Main?.session?.workspaceState || null;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const mounted = tab
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, selectedType) || null
      : null;
    const root = mounted || document.querySelector(`#${selectedType}Page:not([hidden])`);
    const control = root?.querySelector?.(controlSelector) || null;
    if (!(control instanceof HTMLInputElement) || control.type !== 'checkbox') {
      return { ok: false, reason: 'control-missing' };
    }
    const changed = control.checked === true;
    if (changed) {
      control.click();
    }
    return { ok: true, changed, checked: control.checked };
  }, { selectedType: type, controlSelector: GRAPH_TITLE_CONTROL_SELECTOR });

  if (!result?.ok) {
    throw new Error(`Canonical graph-title control ${GRAPH_TITLE_CONTROL_SELECTOR} is unavailable for ${type}.`);
  }

  await page.waitForFunction(({ selectedType, controlSelector, titleSelector }) => {
    const state = window.Main?.session?.workspaceState || null;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const mounted = tab
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, selectedType) || null
      : null;
    const root = mounted || document.querySelector(`#${selectedType}Page:not([hidden])`);
    const control = root?.querySelector?.(controlSelector) || null;
    const svg = root?.querySelector?.('.svgbox svg:not(.resizer-options-icon), svg[data-preview-source="true"]') || null;
    if (!tab || !root || !control || control.checked || !svg) {
      return false;
    }
    if (window.Shared?.componentLifecycle?.isRestoreTransactionActive?.(selectedType, { tabId: tab.id })) {
      return false;
    }
    return !Array.from(svg.querySelectorAll(titleSelector)).some(node => {
      const style = window.getComputedStyle?.(node);
      return style?.display !== 'none'
        && style?.visibility !== 'hidden'
        && Number(style?.opacity ?? 1) !== 0;
    });
  }, {
    selectedType: type,
    controlSelector: GRAPH_TITLE_CONTROL_SELECTOR,
    titleSelector: GRAPH_TITLE_ROLE_SELECTOR
  }, { timeout: 120000 });

  await awaitOwnerRenderReady(page, type, 'welcome-thumbnail-graph-title-suppressed');
  return {
    mode: 'control',
    selector: GRAPH_TITLE_CONTROL_SELECTOR,
    requested: true,
    changed: result.changed === true,
    verified: true
  };
}

async function applyCanonicalControlSuppressions(page, type) {
  const suppressions = CANONICAL_CONTROL_SUPPRESSIONS[type] || [];
  if (!suppressions.length) {
    return;
  }

  for (const suppression of suppressions) {
    const { controlId, readyReason } = suppression;

    const result = await page.evaluate(({ selectedType, selectedControlId }) => {
      const state = window.Main?.session?.workspaceState || null;
      const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
      const mounted = tab
        ? window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, selectedType) || null
        : null;
      const root = mounted || document.querySelector(`#${selectedType}Page:not([hidden])`);
      const control = root?.querySelector?.(`#${selectedControlId}`) || null;

      if (!(control instanceof HTMLInputElement) || control.type !== 'checkbox') {
        return { ok: false, reason: 'control-missing' };
      }

      const changed = control.checked === true;
      if (changed) {
        control.click();
      }

      return {
        ok: true,
        changed,
        checked: control.checked
      };
    }, { selectedType: type, selectedControlId: controlId });

    if (!result?.ok) {
      throw new Error(`Canonical control #${controlId} is unavailable for ${type}.`);
    }

    await page.waitForFunction(({ selectedType, selectedControlId }) => {
      const state = window.Main?.session?.workspaceState || null;
      const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
      const mounted = tab
        ? window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, selectedType) || null
        : null;
      const root = mounted || document.querySelector(`#${selectedType}Page:not([hidden])`);
      const control = root?.querySelector?.(`#${selectedControlId}`) || null;
      const svg = root?.querySelector?.('.svgbox svg:not(.resizer-options-icon), svg[data-preview-source="true"]') || null;

      if (!tab || !root || !svg || !(control instanceof HTMLInputElement) || control.checked) {
        return false;
      }
      if (window.Shared?.componentLifecycle?.isRestoreTransactionActive?.(selectedType, { tabId: tab.id })) {
        return false;
      }
      return true;
    }, {
      selectedType: type,
      selectedControlId: controlId
    }, { timeout: 120000 });

    await awaitOwnerRenderReady(page, type, readyReason || `welcome-thumbnail-${controlId}-suppressed`);
  }
}

async function captureCanonicalSvg(page, type) {
  const payload = await page.evaluate(selectedType => {
    const state = window.Main?.session?.workspaceState || null;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const mounted = tab
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(tab.id, selectedType) || null
      : null;
    const root = mounted || document.querySelector(`#${selectedType}Page:not([hidden])`);
    const component = window.Components?.[selectedType] || null;
    let sourceSvg = typeof component?.getExportSvg === 'function'
      ? component.getExportSvg()
      : null;
    if (!sourceSvg && typeof component?.getPreviewSvg === 'function') {
      sourceSvg = component.getPreviewSvg(tab);
    }
    if (!sourceSvg) {
      sourceSvg = root?.querySelector?.('.svgbox svg:not(.resizer-options-icon), svg[data-preview-source="true"]') || null;
    }
    if (!(sourceSvg instanceof SVGElement)) {
      return { ok: false, reason: 'svg-source-missing' };
    }
    const projection = sourceSvg.getAttribute('data-heatmap-export-projection') || 'svg';
    if (selectedType === 'heatmap' && !['svg', 'vector-matrix'].includes(projection)) {
      return { ok: false, reason: `heatmap-export-${projection}` };
    }
    const xml = window.Shared?.exporter?.svgElementToXml?.(
      sourceSvg,
      `welcome-example-${selectedType}`
    ) || '';
    return {
      ok: Boolean(xml),
      xml,
      projection,
      sourceWidth: Number(sourceSvg.getAttribute('width')) || Number(sourceSvg.clientWidth) || 0,
      sourceHeight: Number(sourceSvg.getAttribute('height')) || Number(sourceSvg.clientHeight) || 0,
      preserveAspectRatio: sourceSvg.getAttribute('preserveAspectRatio') || 'xMidYMid meet',
      reason: xml ? null : 'svg-serialization-empty'
    };
  }, type);
  if (!payload?.ok || !payload.xml) {
    throw new Error(`Canonical SVG capture failed for ${type}: ${payload?.reason || 'unknown reason'}.`);
  }
  const canonicalDimensions = resolveCanonicalSvgDimensions(
    payload.xml,
    payload.sourceWidth,
    payload.sourceHeight
  );
  payload.sourceWidth = canonicalDimensions.width;
  payload.sourceHeight = canonicalDimensions.height;
  return payload;
}

async function createStandaloneSvg(page, type, source) {
  const attributes = readSvgAttributes(source.xml);
  const canonicalDimensions = resolveCanonicalSvgDimensions(
    source.xml,
    source.sourceWidth,
    source.sourceHeight
  );
  const sourceWidth = canonicalDimensions.width;
  const sourceHeight = canonicalDimensions.height;
  const viewBox = parseSvgViewBox(attributes.viewBox, sourceWidth, sourceHeight);
  const projection = computeWelcomeThumbnailProjection({
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    padding: THUMBNAIL_PADDING,
    sourceWidth,
    sourceHeight,
    viewBox,
    preserveAspectRatio: source.preserveAspectRatio || attributes.preserveAspectRatio
  });
  const matrix = projection.matrix;
  const matrixValue = `matrix(${[
    matrix.a,
    matrix.b,
    matrix.c,
    matrix.d,
    matrix.e,
    matrix.f
  ].map(formatSvgNumber).join(' ')})`;

  const result = await page.evaluate(({
    selectedType,
    sourcePayload,
    width,
    height,
    projectionPayload,
    contentTransform,
    proportionalStrokeContract
  }) => {
    const NS = 'http://www.w3.org/2000/svg';
    const parser = new DOMParser();
    const sourceDocument = parser.parseFromString(sourcePayload.xml, 'image/svg+xml');
    const parseError = sourceDocument.querySelector('parsererror');
    if (parseError) {
      throw new Error(`Canonical SVG could not be parsed: ${parseError.textContent || 'parser error'}`);
    }
    const sourceSvg = sourceDocument.documentElement;
    if (sourceSvg?.localName !== 'svg') {
      throw new Error('Canonical export did not produce an SVG root.');
    }

    const parseStrokeWidth = value => {
      const match = String(value ?? '').trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:px)?$/i);
      if (!match) {
        return null;
      }
      const numeric = Number(match[1]);
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
    };
    const readInlineStyleValue = (node, property) => {
      const styleText = String(node?.getAttribute?.('style') || '');
      const match = styleText.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
      return match?.[1]?.trim() || null;
    };
    const hasNonScalingStroke = node => {
      const attribute = String(node?.getAttribute?.('vector-effect') || '').trim().toLowerCase();
      const styleValue = String(readInlineStyleValue(node, 'vector-effect') || '').trim().toLowerCase();
      return attribute === 'non-scaling-stroke' || styleValue === 'non-scaling-stroke';
    };
    const resolveEffectiveStrokeWidth = node => {
      let current = node;
      while (current) {
        const styleWidth = parseStrokeWidth(readInlineStyleValue(current, 'stroke-width'));
        if (styleWidth !== null) {
          return styleWidth;
        }
        const attributeWidth = parseStrokeWidth(current.getAttribute?.('stroke-width'));
        if (attributeWidth !== null) {
          return attributeWidth;
        }
        if (current === sourceSvg) {
          break;
        }
        current = current.parentElement;
      }
      return null;
    };
    const formatNumber = value => {
      const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(12));
      return String(rounded);
    };
    const resolveViewportScale = node => {
      const matrix = node?.getCTM?.();
      if (!matrix) {
        return null;
      }
      const scaleX = Math.hypot(matrix.a, matrix.b);
      const scaleY = Math.hypot(matrix.c, matrix.d);
      if (!(scaleX > 0) || !(scaleY > 0)) {
        return null;
      }
      return Math.sqrt(scaleX * scaleY);
    };
    const measurementHost = document.createElement('div');
    measurementHost.setAttribute('aria-hidden', 'true');
    measurementHost.style.cssText = [
      'position:fixed',
      'left:-100000px',
      'top:0',
      `width:${projectionPayload.sourceWidth}px`,
      `height:${projectionPayload.sourceHeight}px`,
      'overflow:hidden',
      'opacity:0',
      'pointer-events:none'
    ].join(';');
    const measurementRoot = measurementHost.attachShadow({ mode: 'closed' });
    measurementRoot.appendChild(sourceSvg);

    let strokeAdjustments = [];
    try {
      document.body.appendChild(measurementHost);
      const nonScalingStrokeNodes = [sourceSvg, ...sourceSvg.querySelectorAll('*')]
        .filter(hasNonScalingStroke);
      strokeAdjustments = nonScalingStrokeNodes
        .map(node => ({
          node,
          width: resolveEffectiveStrokeWidth(node),
          sourceScale: resolveViewportScale(node)
        }))
        .filter(entry => entry.width !== null && entry.sourceScale > 0);
      strokeAdjustments.forEach(({ node, width: strokeWidth, sourceScale }) => {
        node.style?.removeProperty?.('vector-effect');
        node.removeAttribute('vector-effect');
        node.style?.removeProperty?.('stroke-width');
        node.setAttribute('stroke-width', formatNumber(strokeWidth / sourceScale));
      node.setAttribute('data-welcome-baked-stroke', 'true');
      });
    } finally {
      measurementHost.remove();
    }

    const outer = document.createElementNS(NS, 'svg');
    outer.setAttribute('xmlns', NS);
    outer.setAttribute('width', String(width));
    outer.setAttribute('height', String(height));
    outer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    outer.setAttribute('role', 'img');
    outer.setAttribute('aria-label', `${selectedType} example rendered in Graphitix`);
    outer.setAttribute('data-graphitix-welcome-thumbnail', selectedType);
    outer.setAttribute('data-preview-source', 'Graphitix owner-scoped SVG projection');
    outer.setAttribute('data-source-format', 'svg');
    outer.setAttribute('data-inline-ready', 'true');
    outer.setAttribute('data-id-prefix', `graphitix-welcome-${selectedType}-id-`);
    outer.setAttribute('data-export-projection', sourcePayload.projection || 'svg');
    outer.setAttribute('data-graph-title-suppressed', 'true');
    outer.setAttribute('data-proportional-stroke-contract', proportionalStrokeContract);
    outer.setAttribute('data-source-viewport-width', formatNumber(projectionPayload.sourceWidth));
    outer.setAttribute('data-source-viewport-height', formatNumber(projectionPayload.sourceHeight));
    outer.setAttribute('data-thumbnail-visual-scale', formatNumber(projectionPayload.viewportScale));
    outer.setAttribute('data-non-scaling-stroke-count', String(strokeAdjustments.length));
    outer.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    ['font-family', 'font-size', 'color', 'fill', 'stroke', 'shape-rendering', 'text-rendering'].forEach(name => {
      const value = sourceSvg.getAttribute(name);
      if (value) {
        outer.setAttribute(name, value);
      }
    });

    const background = document.createElementNS(NS, 'rect');
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(height));
    background.setAttribute('fill', '#ffffff');
    background.setAttribute('data-welcome-thumbnail-background', 'true');
    outer.appendChild(background);

    const importedChildren = Array.from(sourceSvg.childNodes).map(node => document.importNode(node, true));
    const metadataNodes = importedChildren.filter(node => {
      const name = String(node.localName || '').toLowerCase();
      return name === 'defs' || name === 'title' || name === 'desc';
    });
    const drawableNodes = importedChildren.filter(node => !metadataNodes.includes(node));
    metadataNodes.forEach(node => outer.appendChild(node));

    const content = document.createElementNS(NS, 'g');
    content.setAttribute('transform', contentTransform);
    content.setAttribute('data-welcome-thumbnail-content', 'true');
    drawableNodes.forEach(node => content.appendChild(node));
    outer.appendChild(content);

    const idMap = new Map();
    const idPrefix = `graphitix-welcome-${selectedType}-id-`;
    const idNodes = Array.from(outer.querySelectorAll('[id]'));
    idNodes.forEach((node, index) => {
      const oldId = node.getAttribute('id');
      if (!oldId) return;
      if (idMap.has(oldId)) {
        throw new Error(`Canonical export contains duplicate SVG id: ${oldId}`);
      }
      const newId = `${idPrefix}${index + 1}`;
      idMap.set(oldId, newId);
      node.setAttribute('id', newId);
    });

    const replaceUrlReferences = value => String(value || '').replace(
      /url\(\s*["']?#([^)"'\s]+)["']?\s*\)/g,
      (match, oldId) => idMap.has(oldId) ? `url(#${idMap.get(oldId)})` : match
    );
    const replaceFragmentReference = value => {
      const text = String(value || '');
      if (!text.startsWith('#')) return text;
      const oldId = text.slice(1);
      return idMap.has(oldId) ? `#${idMap.get(oldId)}` : text;
    };
    outer.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes || []).forEach(attribute => {
        let value = replaceUrlReferences(attribute.value);
        if (attribute.name === 'href' || attribute.name === 'xlink:href') {
          value = replaceFragmentReference(value);
        } else if (attribute.name === 'aria-labelledby' || attribute.name === 'aria-describedby') {
          value = value.split(/\s+/).map(token => idMap.get(token) || token).join(' ');
        }
        if (value !== attribute.value) {
          node.setAttribute(attribute.name, value);
        }
      });
    });

    outer.querySelectorAll('[data-workspace-tab-id], [data-visual-owner-tab-id], [data-font-tab-id], [data-box-tab-id]').forEach(node => {
      node.removeAttribute('data-workspace-tab-id');
      node.removeAttribute('data-visual-owner-tab-id');
      node.removeAttribute('data-font-tab-id');
      node.removeAttribute('data-box-tab-id');
    });

    if (outer.querySelector('script, foreignObject, iframe, object, embed, image')) {
      throw new Error('Canonical export contains unsupported embedded content.');
    }
    const serialized = new XMLSerializer().serializeToString(outer);
    return {
      svgText: `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}\n`,
      nonScalingStrokeCount: strokeAdjustments.length
    };
  }, {
    selectedType: type,
    sourcePayload: source,
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    projectionPayload: projection,
    contentTransform: matrixValue,
    proportionalStrokeContract: PROPORTIONAL_STROKE_CONTRACT
  });
  validateStandaloneSvg(result.svgText, type);
  return {
    svgText: result.svgText,
    visualScale: Number(formatSvgNumber(projection.viewportScale)),
    nonScalingStrokeCount: result.nonScalingStrokeCount,
    sourceViewBox: viewBox,
    sourcePreserveAspectRatio: source.preserveAspectRatio || attributes.preserveAspectRatio || 'xMidYMid meet'
  };
}

async function validateSvgRendering(page, type, svgText) {
  const result = await page.evaluate(async ({ selectedType, markup, width, height }) => {
    const stripped = markup.replace(/^\s*<\?xml\b[^>]*>\s*/i, '');
    const template = document.createElement('template');
    template.innerHTML = stripped;
    const svg = template.content.firstElementChild;
    if (!(svg instanceof SVGSVGElement)) {
      return { ok: false, reason: 'inline-svg-missing' };
    }
    const host = document.createElement('div');
    host.style.cssText = `position:absolute;left:-10000px;top:-10000px;width:${width}px;height:${height}px;`;
    host.appendChild(svg);
    document.body.appendChild(host);
    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const inlineRect = svg.getBoundingClientRect();
    const drawableCount = svg.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text').length;
    host.remove();

    const blob = new Blob([markup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const imageResult = await new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve({ loaded: true, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
      image.onerror = () => resolve({ loaded: false, naturalWidth: 0, naturalHeight: 0 });
      image.src = url;
    });
    URL.revokeObjectURL(url);
    return {
      ok: inlineRect.width === width
        && inlineRect.height === height
        && drawableCount > 1
        && imageResult.loaded
        && imageResult.naturalWidth === width
        && imageResult.naturalHeight === height,
      selectedType,
      inlineWidth: inlineRect.width,
      inlineHeight: inlineRect.height,
      drawableCount,
      ...imageResult
    };
  }, {
    selectedType: type,
    markup: svgText,
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT
  });
  if (!result?.ok) {
    throw new Error(`Browser rejected generated ${type}.svg: ${JSON.stringify(result)}`);
  }
}

function createRegistrySource(temporaryDir) {
  const entries = Object.fromEntries(TYPES.map(type => {
    const svgText = fs.readFileSync(path.join(temporaryDir, `${type}.svg`), 'utf8');
    return [type, stripXmlDeclaration(svgText)];
  }));
  return `(function(global){\n  'use strict';\n  global.GraphitixWelcomeThumbnails = Object.freeze(${JSON.stringify(entries)});\n})(window);\n`;
}

async function resetGeneratorPageToWelcome(page, type) {
  const result = await page.evaluate(({ selectedType }) => {
    const state = window.Main?.session?.workspaceState || null;
    const active = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    if (!active || active.isWelcome) {
      return { ok: true, closed: false };
    }
    const closed = window.Main?.tabs?.closeTab?.(active.id, {
      force: true,
      skipPrompt: true,
      skipPersist: true,
      reason: `welcome-thumbnail-${selectedType}-cleanup`
    });
    const nextState = window.Main?.session?.workspaceState || null;
    const nextActive = nextState?.tabs?.find(item => item?.id === nextState.activeTabId) || null;
    return {
      ok: Boolean(nextActive?.isWelcome),
      closed: closed !== false,
      activeTabId: nextActive?.id || null
    };
  }, { selectedType: type });
  if (!result?.ok) {
    throw new Error(`Welcome thumbnail generator could not release the ${type} owner tab.`);
  }
  await page.waitForSelector('#welcomeScreen:not([hidden])[data-welcome-ready="true"]', { timeout: 30000 });
}

async function generateType(page, type, temporaryDir, sourceFingerprint) {
  const pageErrors = [];
  const onPageError = error => pageErrors.push(error);
  page.on('pageerror', onPageError);
  try {
    await waitForRenderedExample(page, type);
    const legendSuppression = await suppressLegendThroughCanonicalControl(page, type);
    const graphTitleSuppression = await suppressGraphTitleThroughCanonicalControl(page, type);
    await applyCanonicalControlSuppressions(page, type);
    const source = await captureCanonicalSvg(page, type);
    const standalone = await createStandaloneSvg(page, type, source);
    await validateSvgRendering(page, type, standalone.svgText);
    if (pageErrors.length) {
      throw pageErrors[0];
    }
    const fileName = `${type}.svg`;
    fs.writeFileSync(path.join(temporaryDir, fileName), standalone.svgText, 'utf8');
    return {
      type,
      file: fileName,
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      source: PREVIEW_SOURCE,
      captureMode: 'canonical-export',
      sourceFormat: 'svg',
      sourceWidth: source.sourceWidth,
      sourceHeight: source.sourceHeight,
      sourceViewBox: standalone.sourceViewBox,
      sourcePreserveAspectRatio: standalone.sourcePreserveAspectRatio,
      exportProjection: source.projection,
      inlineReady: true,
      rasterImageCount: 0,
      legendSuppression,
      graphTitleSuppression,
      proportionalStrokeContract: PROPORTIONAL_STROKE_CONTRACT,
      visualScale: standalone.visualScale,
      nonScalingStrokeCount: standalone.nonScalingStrokeCount,
      sourceFingerprint,
      sha256: hashCanonicalText(standalone.svgText)
    };
  } finally {
    page.off('pageerror', onPageError);
    if (!page.isClosed()) {
      await resetGeneratorPageToWelcome(page, type);
    }
  }
}

function publishGeneratedAssets(temporaryDir, records, sourceFingerprint) {
  const registryText = createRegistrySource(temporaryDir);
  fs.writeFileSync(path.join(temporaryDir, REGISTRY_FILE), registryText, 'utf8');
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generator: GENERATOR_ID,
    assetFormat: ASSET_FORMAT,
    previewSource: PREVIEW_SOURCE,
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    sourceFingerprint,
    registry: {
      file: REGISTRY_FILE,
      sha256: hashCanonicalText(registryText),
      inline: true
    },
    examples: records
  };
  fs.writeFileSync(path.join(temporaryDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const backupDir = path.join(path.dirname(OUTPUT_DIR), `.welcome-examples-backup-${process.pid}`);
  fs.rmSync(backupDir, { recursive: true, force: true });
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.renameSync(OUTPUT_DIR, backupDir);
  }
  try {
    fs.renameSync(temporaryDir, OUTPUT_DIR);
  } catch (error) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    if (fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, OUTPUT_DIR);
    }
    throw error;
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
}

function assertReusableAssetFresh(record, type, expectedSourceFingerprint) {
  if (!record || typeof record !== 'object') {
    throw new Error(`Cannot reuse missing welcome thumbnail manifest record for ${type}.`);
  }
  if (record.sourceFingerprint !== expectedSourceFingerprint) {
    throw new Error(
      `Cannot reuse stale welcome thumbnail asset for ${type}; include it in the requested regeneration set.`
    );
  }
  return true;
}

function copyReusableAssets(temporaryDir, selectedTypes, fingerprints) {
  if (selectedTypes.length === TYPES.length) {
    return [];
  }
  const manifest = readManifest();
  const selected = new Set(selectedTypes);
  return TYPES.filter(type => !selected.has(type)).map(type => {
    const record = manifest.examples.find(item => item?.type === type);
    const sourcePath = path.join(OUTPUT_DIR, `${type}.svg`);
    assertReusableAssetFresh(record, type, fingerprints.byType[type]);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Cannot reuse missing welcome thumbnail asset for ${type}.`);
    }
    const svgText = fs.readFileSync(sourcePath, 'utf8');
    validateStandaloneSvg(svgText, type);
    if (record.sha256 !== hashCanonicalText(svgText)) {
      throw new Error(`Cannot reuse modified welcome thumbnail asset for ${type}.`);
    }
    fs.copyFileSync(sourcePath, path.join(temporaryDir, `${type}.svg`));
    return {
      ...record,
      sha256: hashCanonicalText(svgText)
    };
  });
}

async function withTemporaryAssetDirectory(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('Welcome thumbnail temporary-directory callback is required.');
  }
  const temporaryDir = fs.mkdtempSync(path.join(path.dirname(OUTPUT_DIR), '.welcome-examples-'));
  try {
    return await callback(temporaryDir);
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
}

async function generateAssets(selectedTypes = TYPES) {
  const { chromium } = require('@playwright/test');
  const fingerprints = computeSourceFingerprints();
  const selected = TYPES.filter(type => selectedTypes.includes(type));
  if (!selected.length) {
    throw new Error('No welcome thumbnail types were selected for generation.');
  }
  const baseUrl = `http://127.0.0.1:${PORT}`;
  return withTemporaryAssetDirectory(async temporaryDir => {
    const records = copyReusableAssets(temporaryDir, selected, fingerprints);
    let server = null;
    let browser = null;
    let page = null;
    try {
      server = await createStaticServer(PORT);
      const executablePath = String(process.env.GRAPHITIX_CHROMIUM_EXECUTABLE || '').trim();
      browser = await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {})
      });
      page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#welcomeScreen[data-welcome-ready="true"]', { timeout: 30000 });
      for (const type of selected) {
        const record = await generateType(page, type, temporaryDir, fingerprints.byType[type]);
        records.push(record);
        process.stdout.write(`Generated ${record.file} from ${record.source}.\n`);
      }
      records.sort((left, right) => TYPES.indexOf(left.type) - TYPES.indexOf(right.type));
      publishGeneratedAssets(temporaryDir, records, fingerprints.aggregate);
      checkGeneratedAssets();
    } finally {
      if (page && !page.isClosed()) {
        await page.close();
      }
      if (browser) {
        await browser.close();
      }
      if (server) {
        await new Promise(resolve => {
          server.close(resolve);
        });
      }
    }
  });
}

function findStaleTypes() {
  const fingerprints = computeSourceFingerprints();
  let manifest;
  try {
    manifest = readManifest();
  } catch (_) {
    return TYPES.slice();
  }
  return TYPES.filter(type => {
    const record = manifest.examples.find(item => item?.type === type);
    const filePath = path.join(OUTPUT_DIR, `${type}.svg`);
    if (!record || !fs.existsSync(filePath) || record.sourceFingerprint !== fingerprints.byType[type]) {
      return true;
    }
    try {
      const svgText = fs.readFileSync(filePath, 'utf8');
      validateStandaloneSvg(svgText, type);
      return record.sha256 !== hashCanonicalText(svgText);
    } catch (_) {
      return true;
    }
  });
}

async function ensureGeneratedAssets() {
  const staleTypes = findStaleTypes();
  if (!staleTypes.length) {
    checkGeneratedAssets();
    process.stdout.write('Welcome example SVG thumbnails are current.\n');
    return;
  }
  process.stdout.write(`Regenerating stale welcome thumbnails: ${staleTypes.join(', ')}.\n`);
  await generateAssets(staleTypes);
}

async function main() {
  if (process.argv.includes('--check')) {
    checkGeneratedAssets();
    return;
  }
  if (process.argv.includes('--ensure')) {
    await ensureGeneratedAssets();
    return;
  }
  await generateAssets(parseRequestedTypes());
}

module.exports = {
  ASSET_FORMAT,
  GRAPH_TITLE_CONTROL_SELECTOR,
  GRAPH_TITLE_MARKER_PATTERN,
  LEGEND_CONTROL_IDS,
  LEGEND_MARKER_PATTERN,
  MANIFEST_SCHEMA_VERSION,
  PREVIEW_SOURCE,
  PROPORTIONAL_STROKE_CONTRACT,
  REGISTRY_FILE,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  TYPES,
  assertReusableAssetFresh,
  checkGeneratedAssets,
  computeWelcomeThumbnailProjection,
  computeSourceFingerprints,
  findStaleTypes,
  hashCanonicalText,
  normalizeTextForHash,
  ensureGeneratedAssets,
  generateAssets,
  parseRequestedTypes,
  parsePreserveAspectRatio,
  parseSvgViewBox,
  resolveCanonicalSvgDimensions,
  stripXmlDeclaration,
  validateStandaloneSvg,
  withTemporaryAssetDirectory
};

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
