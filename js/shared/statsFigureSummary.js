(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const NS = 'http://www.w3.org/2000/svg';
  const CONTROL_KEY = 'statsReporting';
  const ENABLED_FIELD = 'figureSummaryEnabled';
  const GROUP_ATTR = 'data-stats-figure-summary';
  const SUMMARY_FONT_FAMILY = 'Georgia, "Times New Roman", serif';
  const SUMMARY_FONT_ROLE = 'stats-summary';
  const SUMMARY_FONT_KEY = 'stats-summary';
  const SUMMARY_FONT_COLLECTION = 'stats-summary';
  const DEFAULT_ENABLED = false;
  const SUMMARY_BASE_DATASET_KEYS = Object.freeze([
    'statsFigureSummaryBaseViewBoxX',
    'statsFigureSummaryBaseViewBoxY',
    'statsFigureSummaryBaseViewBoxWidth',
    'statsFigureSummaryBaseViewBoxHeight',
    'statsFigureSummaryBaseWidth',
    'statsFigureSummaryBaseHeight',
    'statsFigureSummaryBaseReserveRight',
    'statsFigureSummaryBaseReserveBottom',
    'statsFigureSummaryBaseReserveLeft',
    'statsFigureSummaryBaseReserveTop',
    'statsFigureSummaryBaseEnvelopeMinX',
    'statsFigureSummaryBaseEnvelopeMinY',
    'statsFigureSummaryBaseEnvelopeMaxX',
    'statsFigureSummaryBaseEnvelopeMaxY',
    'statsFigureSummaryBaseLegendWidth'
  ]);
  const CSS = Object.freeze({
    outerGap: 0,
    padX: 10,
    padTop: 7,
    padBottom: 3,
    titleFont: 9.7,
    titleLineHeight: 12.5,
    titleRuleGap: 4.5,
    sectionFont: 8.2,
    sectionLineHeight: 11,
    labelFont: 8.7,
    valueFont: 8.9,
    rowLineHeight: 11.4,
    rowGap: 5.4,
    sectionGap: 6.5,
    labelColumnMin: 52,
    labelColumnMax: 118,
    labelColumnPadding: 7,
    columnGap: 5,
    rowRuleWidth: 0.35
  });

  const COMPONENT_GRAPH = Object.freeze({
    box: { selector: '#boxPlot svg' },
    scatter: { selector: '#scatterPlot svg' },
    line: { selector: '#linePlot svg' },
    hist: { selector: '#histPlot svg' },
    pca: { selector: '#pcaPlot svg' },
    pie: { selector: '#piePlot svg' },
    roc: { selector: '#rocPlot svg' },
    survival: { selector: '#survivalPlot svg' },
    heatmap: { selector: '#heatmapSvg' },
    surface: { selector: '#surfaceSvg' },
    venn: { selector: '#vennGraphPanel svg' }
  });

  const reportByTab = new Map();
  const resizingTabs = new Set();
  const pendingRenders = new Map();
  let lifecycleInstalled = false;

  function debug(label, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug(`Debug: statsFigureSummary.${label}`, payload || {});
    }
  }

  function clone(value){
    if(value == null || typeof value !== 'object') return value;
    try{
      if(typeof global.structuredClone === 'function') return global.structuredClone(value);
    }catch(error){
      debug('cloneStructuredFailed', { message:error?.message || String(error) });
    }
    try{ return JSON.parse(JSON.stringify(value)); }
    catch(error){
      debug('cloneFailed', { message:error?.message || String(error) });
      return null;
    }
  }

  function normalizeTabId(value){
    const text = typeof value === 'string' ? value.trim() : String(value || '').trim();
    return text || '';
  }

  function resolveTab(tabId){
    const key = normalizeTabId(tabId);
    if(!key) return null;
    const workspace = global.Main?.session?.workspaceState || null;
    return (workspace?.tabs || []).find(tab => normalizeTabId(tab?.id) === key) || null;
  }

  function resolveActiveTab(){
    try{ return global.Main?.session?.getActiveTab?.() || null; }
    catch(_err){ return null; }
  }

  function resolveComponentType(tabId, explicitType){
    const explicit = String(explicitType || '').trim().toLowerCase();
    if(explicit && COMPONENT_GRAPH[explicit]) return explicit;
    const tab = resolveTab(tabId);
    const type = String(tab?.type || '').trim().toLowerCase();
    return COMPONENT_GRAPH[type] ? type : '';
  }

  function resolveMountedRoot(tabId, componentType){
    const key = normalizeTabId(tabId);
    const type = resolveComponentType(key, componentType);
    if(!key || !type) return null;
    try{
      const root = Shared.workspaceTabs?.getMountedRoot?.(key, type) || null;
      return root?.isConnected ? root : null;
    }catch(error){
      debug('mountedRootResolveFailed', {
        tabId:key,
        componentType:type,
        message:error?.message || String(error)
      });
      return null;
    }
  }

  function resolveSvg(tabId, componentType){
    const type = resolveComponentType(tabId, componentType);
    const root = resolveMountedRoot(tabId, type);
    if(!type || !root) return null;
    const selector = COMPONENT_GRAPH[type]?.selector;
    if(!selector) return null;
    if(root.matches?.(selector)) return root;
    return root.querySelector?.(selector) || null;
  }

  function resolveGraphViewportHost(svg){
    if(!svg){
      return null;
    }
    // Most renderers mount their SVG directly in the plot host. Radial Pie
    // adds a flex wrapper, so the direct parent is not the node that owns the
    // published viewport slot. Always update the nearest graph plot host.
    return svg.closest?.('[data-graph-viewport-host="true"]')
      || svg.closest?.('[id$="Plot"]')
      || svg.parentElement
      || null;
  }

  function getSharedState(tabLike, create){
    const tabId = normalizeTabId(typeof tabLike === 'object' ? tabLike?.id : tabLike);
    if(!tabId || !Shared.workspaceTabs) return null;
    try{
      const fn = create
        ? Shared.workspaceTabs.ensureSharedControlState
        : Shared.workspaceTabs.getSharedControlState;
      const state = fn?.call(Shared.workspaceTabs, tabLike, CONTROL_KEY, {
        tabId,
        reason: create ? 'stats-figure-summary-state-ensure' : 'stats-figure-summary-state-read'
      });
      return state && typeof state === 'object' ? state : null;
    }catch(error){
      debug('sharedStateError', { tabId, create: !!create, message: error?.message || String(error) });
      return null;
    }
  }

  function isEnabled(tabLike){
    const tabId = normalizeTabId(typeof tabLike === 'object' ? tabLike?.id : tabLike);
    if(!tabId) return DEFAULT_ENABLED;
    const state = getSharedState(tabLike, false);
    return state && Object.prototype.hasOwnProperty.call(state, ENABLED_FIELD)
      ? state[ENABLED_FIELD] === true
      : DEFAULT_ENABLED;
  }

  function setEnabledInSharedState(tabLike, value){
    const tabId = normalizeTabId(typeof tabLike === 'object' ? tabLike?.id : tabLike);
    const next = value === true;
    if(!tabId) return next;
    const state = getSharedState(tabLike, true);
    if(state) state[ENABLED_FIELD] = next;
    return next;
  }

  function removeSummaryGroup(svg){
    if(!svg) return false;
    const nodes = Array.from(svg.querySelectorAll?.(`g[${GROUP_ATTR}="1"]`) || []);
    nodes.forEach(node => node.parentNode?.removeChild(node));
    return nodes.length > 0;
  }

  function isSummaryStyleEvent(detail = {}){
    const key = String(detail.key || '').trim().toLowerCase();
    const collection = String(detail.collection || '').trim().toLowerCase();
    const storeKey = String(detail.storeKey || '').trim().toLowerCase();
    const summaryToken = `__collection__:${SUMMARY_FONT_COLLECTION}`;
    return collection === SUMMARY_FONT_COLLECTION
      || key === SUMMARY_FONT_KEY
      || key === summaryToken
      || storeKey.split('::').some(token => token === SUMMARY_FONT_KEY || token === summaryToken);
  }

  function summaryStyleChangesLayout(detail = {}){
    const keys = Array.isArray(detail.patchKeys) && detail.patchKeys.length
      ? detail.patchKeys
      : Object.keys(detail.style || {});
    return keys.some(key => [
      'fontFamily',
      'fontWeight',
      'fontStyle',
      'fontSize',
      'fontSizeResizeReference',
      'fontSizeDisplayScaleReference',
      'baselineShift',
      'inlineSegments'
    ].includes(String(key)));
  }

  function numericDataset(svg, key, fallback){
    const value = Number(svg?.dataset?.[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function parseViewBox(svg){
    const base = svg?.viewBox?.baseVal;
    if(base && Number.isFinite(base.width) && base.width > 0 && Number.isFinite(base.height) && base.height > 0){
      return { x: Number(base.x) || 0, y: Number(base.y) || 0, width: Number(base.width), height: Number(base.height) };
    }
    const raw = String(svg?.getAttribute?.('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    return raw.length === 4 && raw.every(Number.isFinite) && raw[2] > 0 && raw[3] > 0
      ? { x: raw[0], y: raw[1], width: raw[2], height: raw[3] }
      : null;
  }

  function resolveViewportState(svg, options = {}){
    const ignorePublishedViewportMetadata = options.ignorePublishedViewportMetadata === true;
    const viewBox = parseViewBox(svg);
    const attrWidth = Number(svg?.getAttribute?.('width'));
    const attrHeight = Number(svg?.getAttribute?.('height'));
    const fallbackWidth = Number.isFinite(attrWidth) && attrWidth > 0 ? attrWidth : (viewBox?.width || 1);
    const fallbackHeight = Number.isFinite(attrHeight) && attrHeight > 0 ? attrHeight : (viewBox?.height || 1);
    const baseWidth = ignorePublishedViewportMetadata
      ? fallbackWidth
      : numericDataset(svg, 'graphContentBaseWidth', numericDataset(svg, 'legendBaseWidth', fallbackWidth));
    const baseHeight = ignorePublishedViewportMetadata
      ? fallbackHeight
      : numericDataset(svg, 'graphContentBaseHeight', numericDataset(svg, 'legendBaseHeight', fallbackHeight));
    const right = ignorePublishedViewportMetadata
      ? 0
      : Math.max(0, numericDataset(svg, 'graphContentReserveRight', numericDataset(svg, 'legendReserveWidth', 0)) || 0);
    const bottom = ignorePublishedViewportMetadata
      ? 0
      : Math.max(0, numericDataset(svg, 'graphContentReserveBottom', 0) || 0);
    const left = ignorePublishedViewportMetadata
      ? 0
      : Math.max(0, numericDataset(svg, 'graphContentReserveLeft', 0) || 0);
    const top = ignorePublishedViewportMetadata
      ? 0
      : Math.max(0, numericDataset(svg, 'graphContentReserveTop', 0) || 0);
    const legendWidth = ignorePublishedViewportMetadata
      ? 0
      : Math.max(0, numericDataset(svg, 'legendReserveWidth', 0) || 0);
    const envelopeMinX = ignorePublishedViewportMetadata
      ? (viewBox?.x || 0)
      : numericDataset(svg, 'graphContentEnvelopeMinX', -left);
    const envelopeMinY = ignorePublishedViewportMetadata
      ? (viewBox?.y || 0)
      : numericDataset(svg, 'graphContentEnvelopeMinY', -top);
    const envelopeMaxX = ignorePublishedViewportMetadata
      ? ((viewBox?.x || 0) + baseWidth)
      : numericDataset(svg, 'graphContentEnvelopeMaxX', baseWidth + right);
    const envelopeMaxY = ignorePublishedViewportMetadata
      ? ((viewBox?.y || 0) + baseHeight)
      : numericDataset(svg, 'graphContentEnvelopeMaxY', baseHeight + bottom);
    return { viewBox, baseWidth, baseHeight, right, bottom, left, top, legendWidth, envelopeMinX, envelopeMinY, envelopeMaxX, envelopeMaxY };
  }

  function buildSummaryBaseViewport(viewport){
    if(!viewport || !Number.isFinite(viewport.baseWidth) || !Number.isFinite(viewport.baseHeight)) return null;
    const viewBox = viewport.viewBox || {
      x: viewport.envelopeMinX,
      y: viewport.envelopeMinY,
      width: viewport.baseWidth + viewport.left + viewport.right,
      height: viewport.baseHeight + viewport.top + viewport.bottom
    };
    return {
      viewBox: {
        x: Number(viewBox.x) || 0,
        y: Number(viewBox.y) || 0,
        width: Number(viewBox.width) > 0 ? Number(viewBox.width) : viewport.baseWidth + viewport.left + viewport.right,
        height: Number(viewBox.height) > 0 ? Number(viewBox.height) : viewport.baseHeight + viewport.top + viewport.bottom
      },
      baseWidth: viewport.baseWidth,
      baseHeight: viewport.baseHeight,
      right: Math.max(0, viewport.right || 0),
      bottom: Math.max(0, viewport.bottom || 0),
      left: Math.max(0, viewport.left || 0),
      top: Math.max(0, viewport.top || 0),
      legendWidth: Math.max(0, viewport.legendWidth || 0),
      envelopeMinX: Number.isFinite(viewport.envelopeMinX) ? viewport.envelopeMinX : -(viewport.left || 0),
      envelopeMinY: Number.isFinite(viewport.envelopeMinY) ? viewport.envelopeMinY : -(viewport.top || 0),
      envelopeMaxX: Number.isFinite(viewport.envelopeMaxX) ? viewport.envelopeMaxX : viewport.baseWidth + (viewport.right || 0),
      envelopeMaxY: Number.isFinite(viewport.envelopeMaxY) ? viewport.envelopeMaxY : viewport.baseHeight + (viewport.bottom || 0)
    };
  }

  function captureSummaryBaseViewport(svg, viewport){
    const base = buildSummaryBaseViewport(viewport);
    if(!svg?.dataset || !base) return base;
    const values = {
      statsFigureSummaryBaseViewBoxX: base.viewBox.x,
      statsFigureSummaryBaseViewBoxY: base.viewBox.y,
      statsFigureSummaryBaseViewBoxWidth: base.viewBox.width,
      statsFigureSummaryBaseViewBoxHeight: base.viewBox.height,
      statsFigureSummaryBaseWidth: base.baseWidth,
      statsFigureSummaryBaseHeight: base.baseHeight,
      statsFigureSummaryBaseReserveRight: base.right,
      statsFigureSummaryBaseReserveBottom: base.bottom,
      statsFigureSummaryBaseReserveLeft: base.left,
      statsFigureSummaryBaseReserveTop: base.top,
      statsFigureSummaryBaseEnvelopeMinX: base.envelopeMinX,
      statsFigureSummaryBaseEnvelopeMinY: base.envelopeMinY,
      statsFigureSummaryBaseEnvelopeMaxX: base.envelopeMaxX,
      statsFigureSummaryBaseEnvelopeMaxY: base.envelopeMaxY,
      statsFigureSummaryBaseLegendWidth: base.legendWidth
    };
    Object.entries(values).forEach(([key, value]) => {
      svg.dataset[key] = formatNumber(value);
    });
    return base;
  }

  function readSummaryBaseViewport(svg){
    if(!svg?.dataset) return null;
    const required = SUMMARY_BASE_DATASET_KEYS.map(key => Number(svg.dataset[key]));
    if(required.some(value => !Number.isFinite(value))) return null;
    const [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight,
      baseWidth, baseHeight, right, bottom, left, top,
      envelopeMinX, envelopeMinY, envelopeMaxX, envelopeMaxY, legendWidth] = required;
    if(viewBoxWidth <= 0 || viewBoxHeight <= 0 || baseWidth <= 0 || baseHeight <= 0) return null;
    return {
      viewBox: { x:viewBoxX, y:viewBoxY, width:viewBoxWidth, height:viewBoxHeight },
      baseWidth,
      baseHeight,
      right:Math.max(0, right),
      bottom:Math.max(0, bottom),
      left:Math.max(0, left),
      top:Math.max(0, top),
      legendWidth:Math.max(0, legendWidth),
      envelopeMinX,
      envelopeMinY,
      envelopeMaxX,
      envelopeMaxY
    };
  }

  function summaryBaseViewportChanged(current, cached){
    if(!current || !cached) return true;
    // The cached viewport is deliberately stable while only the report text
    // changes. It is not stable across a graph resize or a graph redraw,
    // however. Compare the frame geometry that belongs to the graph and leave
    // the bottom envelope out because that is where this table is published.
    const comparable = [
      'baseWidth', 'baseHeight', 'right', 'left', 'top', 'legendWidth',
      'envelopeMinX', 'envelopeMinY', 'envelopeMaxX'
    ];
    return comparable.some(key => {
      const currentValue = Number(current[key]);
      const cachedValue = Number(cached[key]);
      if(!Number.isFinite(currentValue) || !Number.isFinite(cachedValue)){
        return currentValue !== cachedValue;
      }
      return Math.abs(currentValue - cachedValue) > 0.5;
    });
  }

  function removeSummaryReserveFromViewport(viewport, reserve, options = {}){
    if(!viewport || reserve <= 0) return viewport;
    const inferBaseHeight = options.inferBaseHeight === true;
    const baseHeight = inferBaseHeight
      ? Math.max(1, viewport.baseHeight - reserve)
      : viewport.baseHeight;
    const baseBottom = inferBaseHeight
      ? Math.max(0, viewport.bottom)
      : Math.max(0, viewport.bottom - reserve);
    const baseViewBox = viewport.viewBox
      ? {
          ...viewport.viewBox,
          height: Math.max(1, viewport.viewBox.height - reserve)
        }
      : null;
    return buildSummaryBaseViewport({
      ...viewport,
      baseHeight,
      bottom:baseBottom,
      envelopeMaxY:Math.min(viewport.envelopeMaxY, baseHeight + baseBottom),
      viewBox:baseViewBox
    }) || viewport;
  }

  function clearSummaryBaseViewport(svg){
    if(!svg?.dataset) return;
    SUMMARY_BASE_DATASET_KEYS.forEach(key => delete svg.dataset[key]);
  }

  function clearSummaryRenderedScale(svg){
    if(!svg?.dataset) return;
    delete svg.dataset.statsFigureSummaryRenderedScaleX;
    delete svg.dataset.statsFigureSummaryRenderedScaleY;
  }

  function computeRenderedScale(svg, viewport, existingSummaryReserve = 0){
    let rect = null;
    try{ rect = svg?.getBoundingClientRect?.() || null; }catch(_err){}
    const currentLogicalWidth = viewport?.viewBox?.width || (viewport.baseWidth + viewport.left + viewport.right);
    const currentLogicalHeight = (viewport?.viewBox?.height || (viewport.baseHeight + viewport.top + viewport.bottom))
      + Math.max(0, Number(existingSummaryReserve) || 0);
    const displayWidth = Number(rect?.width);
    const displayHeight = Number(rect?.height);
    const storedScaleX = numericDataset(svg, 'statsFigureSummaryRenderedScaleX',
      numericDataset(svg, 'graphContentRenderedScaleX', NaN));
    const storedScaleY = numericDataset(svg, 'statsFigureSummaryRenderedScaleY',
      numericDataset(svg, 'graphContentRenderedScaleY', NaN));
    const scaleX = existingSummaryReserve > 0 && Number.isFinite(storedScaleX) && storedScaleX > 0
      ? storedScaleX
      : (Number.isFinite(displayWidth) && displayWidth > 0 && currentLogicalWidth > 0
      ? displayWidth / currentLogicalWidth
      : 1);
    const scaleY = existingSummaryReserve > 0 && Number.isFinite(storedScaleY) && storedScaleY > 0
      ? storedScaleY
      : (Number.isFinite(displayHeight) && displayHeight > 0 && currentLogicalHeight > 0
      ? displayHeight / currentLogicalHeight
      : 1);
    const safeX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
    const safeY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : safeX;
    const uniform = Math.sqrt(safeX * safeY);
    return { scaleX: safeX, scaleY: safeY, scale: Number.isFinite(uniform) && uniform > 0 ? uniform : 1 };
  }

  const SUMMARY_NUMBER_PATTERN = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
  const COMPACT_METRIC_SOURCE = '(?:adjusted\\s+)?r(?:²|2)?|rho|ρ|(?:kendall[’\\\']s\\s+)?tau|τ|auc|Δ\\s*auc|average\\s+precision|Δ\\s*ap|ap|cram(?:e|é)r[’\\\']s\\s+v|cohen[’\\\']s\\s+[dw]|n[+−-]?|df|degrees? of freedom|f|t|z|g|u|w|h|q|d|aicc?|bic|rmse|mae|mape|smape|se|sd|iqr|estimate|slope|intercept|difference|effect(?: size)?|observed overlap|expected(?:\\s+under\\s+the\\s+hypergeometric\\s+null)?|mean|median(?:\\s+survival)?|hazard ratio|odds ratio|risk ratio|hr|or|rr|β|λ|ηp?²?|ω²?|χ²|χ2|x²|x2|chi(?:-square)?|jarque[–-]?bera|ks\\s+d|ad\\s+a²|log loss|eigenvalue|stress(?:-\\s*1)?|kl divergence|learning rate|min(?:imum)? distance|early exaggeration|negative sampling|perplexity|iterations?|epochs?|neighbors?|score|rate|horizon|sensitivity|specificity|precision|recall|f1|concordance|corr(?:elation)?|statistic';
  const COMPACT_COORDINATED_METRIC_SOURCE = '(?:adjusted\\s+)?r(?:²|2)?|rho|ρ|(?:kendall[’\\\']s\\s+)?tau|τ|auc|Δ\\s*auc|average\\s+precision|Δ\\s*ap|ap|cram(?:e|é)r[’\\\']s\\s+v|cohen[’\\\']s\\s+[dw]|estimate|slope|intercept|difference|effect(?: size)?|mean|median(?:\\s+survival)?|hazard ratio|odds ratio|risk ratio|hr|or|rr|β|λ|ηp?²?|ω²?';
  const COMPACT_TEST_STATISTIC_SOURCE = '(?:F|t|z|G|U|W|H|Q|D|χ²|χ2|X²)';
  // Keep statistical expressions together when the summary is narrow. These
  // are layout tokens only; the canonical report text remains unchanged.
  const WRAP_ATOMIC_METRIC_SOURCE = '(?:(?:adjusted|uncentered)\\s+)?r(?:²|2)?|rho|ρ|(?:kendall[’\\\']s\\s+)?tau|τ|auc|Δ\\s*auc|average\\s+precision|Δ\\s*ap|ap|cram(?:e|é)r[’\\\']s\\s+v|cohen[’\\\']s\\s+[dw]|n[+−-]?|df|degrees? of freedom|f|t|z|g|u|w|h|q|d|aicc?|bic|rmse|mae|mape|smape|se|sd|iqr|estimate|slope|intercept|difference|effect(?: size)?|observed overlap|expected(?:\\s+under\\s+the\\s+hypergeometric\\s+null)?|mean|median(?:\\s+survival)?|hazard ratio|odds ratio|risk ratio|hr|or|rr|β|λ|ηp?²?|ω²?|χ²|χ2|x²|x2|chi(?:-square)?|jarque[–-]?bera|ks\\s+d|ad\\s+a²|Δ\\s*aicc?|log loss|eigenvalue|stress(?:-\\s*1)?|kl divergence|learning rate|min(?:imum)? distance|early exaggeration|negative sampling|perplexity|iterations?|epochs?|neighbors?|score|rate|horizon|sensitivity|specificity|precision|recall|f1|concordance|corr(?:elation)?|statistic|events?';
  const WRAP_ATOMIC_PATTERN = new RegExp([
    `(?<![A-Za-z0-9_])(?:\\d+(?:\\.\\d+)?%\\s*)?(?:CI|confidence interval)\\s*(?:\\[[^\\]]+\\]|${SUMMARY_NUMBER_PATTERN}\\s+(?:to|–)\\s+${SUMMARY_NUMBER_PATTERN})`,
    `(?<![A-Za-z0-9_])(?:p|q)(?:\\s*[-_]?\\s*value|adj)?\\s*(?:<=|>=|<|>|≤|≥|=)\\s*${SUMMARY_NUMBER_PATTERN}`,
    `(?<![A-Za-z0-9_])(?:${WRAP_ATOMIC_METRIC_SOURCE})(?:\\s*\\([^)]*\\))?\\s*=\\s*${SUMMARY_NUMBER_PATTERN}(?:\\s*%)?`
  ].join('|'), 'gi');
  // Compact figure summaries use the common biomedical reporting floor. The
  // detailed report formatter has a separate, source-preserving contract.
  const COMPACT_P_VALUE_DISPLAY_FLOOR = 0.001;

  function toNumericPValue(value){
    if(typeof Shared.pValueFormatter?.toNumericValue === 'function'){
      return Shared.pValueFormatter.toNumericValue(value);
    }
    if(value === null || value === undefined || typeof value === 'boolean' || typeof value === 'symbol'){
      return NaN;
    }
    if(typeof value !== 'number' && typeof value !== 'string' && !(value instanceof Number)){
      return NaN;
    }
    if(typeof value === 'string' && value.trim() === ''){
      return NaN;
    }
    try{
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : NaN;
    }catch(_err){
      return NaN;
    }
  }

  function formatCompactNumber(value, decimals = 2){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return String(value == null ? '' : value);
    if(numeric === 0) return '0';
    let places = Number.isInteger(decimals) && decimals >= 0 ? decimals : 2;
    const absolute = Math.abs(numeric);
    if(absolute > 0 && absolute < 1){
      const significantPlaces = 3 - 1 - Math.floor(Math.log10(absolute));
      places = Math.max(places, significantPlaces);
    }
    const rounded = Number(numeric.toFixed(Math.min(8, places)));
    if(!Number.isFinite(rounded)) return String(numeric);
    return String(rounded);
  }

  function formatCompactFixedNumber(value, decimals = 2){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return String(value == null ? '' : value);
    if(numeric === 0) return '0';
    const places = Number.isInteger(decimals) && decimals >= 0 ? decimals : 2;
    return String(Number(numeric.toFixed(Math.min(8, places))));
  }

  function resolveIntervalPlaces(values, preferredPlaces = 2){
    const numericValues = (Array.isArray(values) ? values : [])
      .map(value => Number(value))
      .filter(Number.isFinite);
    let places = Number.isInteger(preferredPlaces) && preferredPlaces >= 0 ? preferredPlaces : 2;
    numericValues.forEach(value => {
      const absolute = Math.abs(value);
      if(absolute > 0 && absolute < 1){
        places = Math.max(places, 3 - 1 - Math.floor(Math.log10(absolute)));
      }
    });
    if(numericValues.length >= 2){
      // For an estimate plus interval, only the two interval limits need to
      // remain distinguishable. The estimate may equal the lower limit.
      const low = numericValues[numericValues.length - 2];
      const high = numericValues[numericValues.length - 1];
      while(places < 6 && low.toFixed(places) === high.toFixed(places)){
        places += 1;
      }
    }
    return Math.min(6, places);
  }

  function formatCompactAlignedNumber(value, decimals = 2){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return String(value == null ? '' : value);
    const places = Number.isInteger(decimals) && decimals >= 0 ? decimals : 2;
    const rounded = numeric.toFixed(Math.min(8, places));
    return /^-0(?:\.0+)?$/.test(rounded) ? rounded.slice(1) : rounded;
  }

  function formatCompactCount(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return String(value == null ? '' : value);
    return Number.isInteger(numeric) ? String(numeric) : formatCompactNumber(numeric, 1);
  }

  function formatCompactPValue(value, operator){
    const numeric = toNumericPValue(value);
    const normalizedOperator = ['<', '>', '<=', '>=', '≤', '≥', '='].includes(operator)
      ? operator
      : '=';
    if(!Number.isFinite(numeric)){
      return { operator:'=', value:'unavailable (not estimable)', invalid:true };
    }
    if(numeric < 0 || numeric > 1){
      return { operator:'=', value:'unavailable (invalid probability)', invalid:true };
    }
    const canUseLowerTailFloor = normalizedOperator === '='
      || normalizedOperator === '<'
      || normalizedOperator === '<=';
    if(numeric < COMPACT_P_VALUE_DISPLAY_FLOOR && canUseLowerTailFloor){
      // The figure summary is intentionally compact. The detailed report
      // retains the source value; the figure uses the documented SAMPL-style
      // display floor and never presents a tail probability as p = 0.
      return {
        operator: normalizedOperator === '=' ? '<' : normalizedOperator,
        value:'0.001',
        invalid:false,
        displayFloor:true
      };
    }
    const exponent = Math.floor(Math.log10(Math.abs(numeric)));
    const places = Math.max(0, 5 - 1 - exponent);
    const rounded = places > 10
      ? Number(numeric.toPrecision(5))
      : Number(numeric.toFixed(places));
    return { operator:normalizedOperator, value:String(rounded), invalid:false };
  }

  function compactPValueText(text){
    const pattern = new RegExp(`\\b((?:p(?:\\s*[-_]?\\s*value|adj)?|q)\\s*)(?:=\\s*)?(<=|>=|<|>|=|≤|≥)\\s*(${SUMMARY_NUMBER_PATTERN})`, 'gi');
    return String(text == null ? '' : text).replace(pattern, (_match, label, operator, rawValue) => {
      const formatted = formatCompactPValue(rawValue, operator);
      return `${label}${formatted.operator} ${formatted.value}`;
    });
  }

  function formatCompactPercentages(text){
    const pattern = new RegExp(`(${SUMMARY_NUMBER_PATTERN})(\\s*%)`, 'g');
    return String(text == null ? '' : text).replace(pattern, (_match, value, unit) => `${formatCompactNumber(value, 2)}${unit}`);
  }

  function formatCompactAlphaSettings(text){
    const pattern = new RegExp(`((?:α|alpha|target\\s+fdr|fdr)\\s*=\\s*)(${SUMMARY_NUMBER_PATTERN})`, 'gi');
    return String(text == null ? '' : text).replace(pattern, (_match, prefix, value) => `${prefix}${formatCompactNumber(value, 2)}`);
  }

  function formatCompactNumericRanges(text){
    const pattern = new RegExp(`(${SUMMARY_NUMBER_PATTERN})\\s+(to|–)\\s+(${SUMMARY_NUMBER_PATTERN})`, 'g');
    return String(text == null ? '' : text).replace(pattern, (_match, low, separator, high) => `${formatCompactNumber(low, 2)} ${separator} ${formatCompactNumber(high, 2)}`);
  }

  function formatCompactMetricValue(metric, value){
    const key = String(metric || '').trim().toLowerCase().replace(/[’']/g, "'").replace(/é/g, 'e').replace(/\s+/g, ' ');
    if(/^(?:n[+−-]?|df|degrees? of freedom|comparisons?|datasets?|groups?|events?|censored|pairs?|observed overlap|horizon|iterations?|epochs?|neighbors?)$/.test(key)){
      return formatCompactCount(value);
    }
    if(/^(?:r|rho|ρ|r²|r2|adjusted r²|adjusted r2|auc|delta auc|δauc|average precision|delta ap|δap|ap|tau|τ|cramer's v|cohen's w|η²|ηp²|ω²|concordance|corr|correlation)$/.test(key)){
      return formatCompactNumber(value, 3);
    }
    if(/^ks d$/.test(key)){
      return formatCompactFixedNumber(value, 3);
    }
    return formatCompactNumber(value, 2);
  }

  function formatCompactConfidenceInterval(text){
    const bracketPattern = new RegExp(`(\\b(?:\\d+(?:\\.\\d+)?%\\s*)?(?:CI|confidence interval)\\b[^\\[]*\\[)([^\\]]+)(\\])`, 'gi');
    let result = String(text == null ? '' : text).replace(bracketPattern, (_match, prefix, body, suffix) => {
      const values = body.match(new RegExp(SUMMARY_NUMBER_PATTERN, 'g')) || [];
      const places = resolveIntervalPlaces(values, values.length && values.every(raw => Math.abs(Number(raw)) < 1) ? 3 : 2);
      const formattedBody = body.replace(new RegExp(SUMMARY_NUMBER_PATTERN, 'g'), raw => formatCompactAlignedNumber(raw, places));
      return `${prefix}${formattedBody}${suffix}`;
    });
    const rangePattern = new RegExp(`(\\b(?:\\d+(?:\\.\\d+)?%\\s*)?(?:CI|confidence interval)\\b\\s*)(${SUMMARY_NUMBER_PATTERN})\\s+(to|–)\\s+(${SUMMARY_NUMBER_PATTERN})`, 'gi');
    result = result.replace(rangePattern, (_match, prefix, low, separator, high) => {
      const places = resolveIntervalPlaces([low, high], Math.abs(Number(low)) < 1 && Math.abs(Number(high)) < 1 ? 3 : 2);
      return `${prefix}${formatCompactAlignedNumber(low, places)} ${separator} ${formatCompactAlignedNumber(high, places)}`;
    });
    return result;
  }

  function coordinatedMetricPlaces(metric, values){
    const key = String(metric || '').trim().toLowerCase().replace(/[’']/g, "'").replace(/é/g, 'e').replace(/\s+/g, ' ');
    const bounded = /^(?:adjusted\s+)?r(?:²|2)?$|^(?:rho|ρ|tau|τ|auc|delta auc|average precision|delta ap|ap|cramer's v|cohen's w|eta(?:p)?²?|omega²?|hr|or|rr|hazard ratio|odds ratio|risk ratio)$/.test(key);
    return resolveIntervalPlaces(values, bounded || values.every(value => Math.abs(Number(value)) < 1) ? 3 : 2);
  }

  // Estimates and their confidence limits are one reporting unit. Give the
  // whole unit one decimal precision so parallel series do not display
  // visually different CI precision merely because trailing zeroes were
  // removed from one endpoint.
  function formatCompactCoordinatedIntervals(text){
    const number = SUMMARY_NUMBER_PATTERN;
    const bracketPattern = new RegExp(`(^|[^A-Za-z0-9_])(${COMPACT_COORDINATED_METRIC_SOURCE})(\\s*=\\s*)(${number})(\\s*;\\s*)((?:\\d+(?:\\.\\d+)?%\\s*)?(?:CI|confidence interval)\\s*\\[)(${number})(\\s*,\\s*)(${number})(\\])`, 'gi');
    let result = String(text == null ? '' : text).replace(bracketPattern, (_match, prefix, metric, assignment, estimate, separator, ciPrefix, low, comma, high, close) => {
      const places = coordinatedMetricPlaces(metric, [estimate, low, high]);
      return `${prefix}${metric}${assignment}${formatCompactAlignedNumber(estimate, places)}${separator}${ciPrefix}${formatCompactAlignedNumber(low, places)}${comma}${formatCompactAlignedNumber(high, places)}${close}`;
    });
    const rangePattern = new RegExp(`(^|[^A-Za-z0-9_])(${COMPACT_COORDINATED_METRIC_SOURCE})(\\s*=\\s*)(${number})(\\s*;\\s*)((?:\\d+(?:\\.\\d+)?%\\s*)?(?:CI|confidence interval)\\s*)(${number})(\\s+(?:to|–)\\s+)(${number})`, 'gi');
    return result.replace(rangePattern, (_match, prefix, metric, assignment, estimate, separator, ciPrefix, low, rangeSeparator, high) => {
      const places = coordinatedMetricPlaces(metric, [estimate, low, high]);
      return `${prefix}${metric}${assignment}${formatCompactAlignedNumber(estimate, places)}${separator}${ciPrefix}${formatCompactAlignedNumber(low, places)}${rangeSeparator}${formatCompactAlignedNumber(high, places)}`;
    });
  }

  function formatCompactTestStatistic(text){
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${COMPACT_TEST_STATISTIC_SOURCE})\\s*\\(\\s*([^)]*)\\s*\\)\\s*=\\s*(${SUMMARY_NUMBER_PATTERN})`, 'gi');
    return String(text == null ? '' : text).replace(pattern, (_match, prefix, statistic, degrees, value) => {
      const formattedDegrees = degrees.replace(new RegExp(SUMMARY_NUMBER_PATTERN, 'g'), formatCompactCount);
      return `${prefix}${statistic}(${formattedDegrees}) = ${formatCompactMetricValue(statistic, value)}`;
    });
  }

  function formatCompactMetricAssignments(text){
    const degreesPattern = new RegExp(`\\b(df|degrees? of freedom)\\s*=\\s*(${SUMMARY_NUMBER_PATTERN}(?:\\s*[,/]\\s*${SUMMARY_NUMBER_PATTERN})+)`, 'gi');
    let result = String(text == null ? '' : text).replace(degreesPattern, (_match, metric, values) => {
      const formattedValues = values
        .split(/\s*[,/]\s*/)
        .map(value => formatCompactCount(value))
        .join(', ');
      return `${metric} = ${formattedValues}`;
    });
    const metricPattern = new RegExp(`(^|[^A-Za-z0-9_])(${COMPACT_METRIC_SOURCE})((?:\\s*\\([^)]*\\)|\\s*\\|[^|]*\\|)?)\\s*=\\s*(${SUMMARY_NUMBER_PATTERN})(\\s*%)?`, 'gi');
    return result.replace(metricPattern, (_match, prefix, metric, qualifier, value, unit) => {
      const normalizedMetric = `${String(metric)}${String(qualifier || '')}`.replace(/\s+$/, '');
      return `${prefix}${normalizedMetric} = ${formatCompactMetricValue(metric, value)}${unit || ''}`;
    });
  }

  function formatCompactStandaloneMetric(value, label){
    const source = String(value == null ? '' : value).trim();
    const key = String(label || '').trim().toLowerCase().replace(/[’']/g, "'");
    const leadingMetricPattern = new RegExp(`^(${SUMMARY_NUMBER_PATTERN})(?=\\s*(?:·|;|,|:))`);
    if(/(?:concordance|harrell|correlation|association|stress|residual)/.test(key) && leadingMetricPattern.test(source)){
      return source.replace(leadingMetricPattern, (_match, number) => formatCompactMetricValue('r', number));
    }
    const match = new RegExp(`^(${SUMMARY_NUMBER_PATTERN})$`).exec(source);
    if(!match) return source;
    if(/^(?:adjusted\s+)?(?:p|q)(?:[- ]?value)?$/.test(key)){
      const formatted = formatCompactPValue(match[1]);
      return formatted.operator === '=' ? formatted.value : `${formatted.operator} ${formatted.value}`;
    }
    if(/(?:^|\b)(?:n|sample size|observations?|groups?|events?|censored|pairs?|comparisons?|datasets?|observed overlap|horizon|iterations?|epochs?|neighbors?)(?:\b|$)/.test(key)){
      return formatCompactCount(match[1]);
    }
    if(/(?:rank[- ]?biserial|correlation|association|\brho\b|(?:^|[\s(])r(?:²|2)(?=$|[\s)])|\br\b|auc|average precision|cramer[’']s\s+v|concordance|harrell)/.test(key)){
      return formatCompactMetricValue('r', match[1]);
    }
    if(/(?:^|\b)(?:df|degrees? of freedom)(?:\b|$)/.test(key)){
      return formatCompactCount(match[1]);
    }
    if(/^(?:ks\s+d|kolmogorov(?:[-–]smirnov)?\s+d)$/.test(key)){
      return formatCompactFixedNumber(match[1], 3);
    }
    return formatCompactMetricValue('effect', match[1]);
  }

  function formatCompactSummaryValue(value, row = {}){
    let result = compactPValueText(Array.isArray(value) ? textFromParts(value) : value);
    result = formatCompactPercentages(result);
    result = formatCompactAlphaSettings(result);
    const role = String(row.figureRole || '').trim().toLowerCase();
    const section = String(row.section || '').trim().toLowerCase();
    const label = String(row.label || '').trim().toLowerCase();
    const metadata = role === 'analysis'
      || role === 'inference'
      || role === 'metadata'
      || role === 'explanatory'
      || section === 'analysis'
      || /^(?:analysis|inference|statistical settings|design|multiplicity)$/.test(label);
    if(metadata){
      result = formatCompactMetricAssignments(result);
      result = formatCompactNumericRanges(result);
      return formatCompactCoordinatedIntervals(result);
    }
    result = formatCompactConfidenceInterval(result);
    result = formatCompactTestStatistic(result);
    result = formatCompactMetricAssignments(result);
    result = formatCompactNumericRanges(result);
    result = formatCompactCoordinatedIntervals(result);
    return formatCompactStandaloneMetric(result, label);
  }

  function textFromParts(value){
    if(Array.isArray(value)){
      const text = value.map(item => {
        if(item && typeof item === 'object' && (item.type === 'pValue' || Object.prototype.hasOwnProperty.call(item, '__statsPValueRaw'))){
          const raw = item.__statsPValueRaw ?? item.value ?? item.rawPValue;
          const operator = item.operator || item.__statsPValueOperator || '=';
          const formatted = formatCompactPValue(raw, operator);
          return formatted.invalid || formatted.operator === '='
            ? formatted.value
            : `${formatted.operator}${formatted.value}`;
        }
        return typeof item === 'string' ? item : (item?.fallback || item?.text || '');
      }).join('');
      // Components commonly provide the literal prefix `p = ` before a
      // structured token. If the token reveals tail underflow, replace that
      // literal equality with the inequality returned by the formatter.
      return text.replace(/\b((?:p(?:\s*[-_]?\s*value|adj)?|q)\s*)=\s*(<=|>=|<|>|≤|≥)\s*/gi, '$1$2 ');
    }
    return String(value == null ? '' : value);
  }

  function normalizeRow(row, tabId, sectionKey, index){
    if(!row || typeof row !== 'object') return null;
    const label = String(row.label || '').trim();
    const section = String(row.section || sectionKey || 'summary').trim().toLowerCase() || 'summary';
    const figureRole = String(row.figureRole || row.summaryRole || '').trim().toLowerCase() || '';
    const value = formatCompactSummaryValue(
      textFromParts(row.valueParts != null ? row.valueParts : row.value).trim(),
      { label, section, figureRole }
    ).trim();
    if(!label && !value) return null;
    return {
      label,
      value,
      section,
      index: Number.isFinite(Number(row.index)) ? Number(row.index) : index,
      keepTogether: row.keepTogether !== false,
      figureRole,
      figurePriority: Number.isFinite(Number(row.figurePriority)) ? Number(row.figurePriority) : 0,
      figureInclude: row.figureInclude !== false
    };
  }

  const COMPACT_MAX_ROWS = 5;

  function summaryRowText(row){
    return `${String(row?.label || '')} ${String(row?.value || '')}`.replace(/\s+/g, ' ').trim();
  }

  function isExplanatorySummaryRow(row){
    const text = summaryRowText(row).toLowerCase();
    if(row?.figureInclude === false || row?.figureRole === 'explanatory' || row?.figureRole === 'metadata') return true;
    // Explicitly classified rows are authoritative. The text heuristic remains
    // only for legacy reports that predate figure roles.
    if(row?.figureRole) return false;
    return /(?:complete (?:comparison|tested|coefficient) family|canonical statistical results|not multiplicity-adjusted across|multiplicity adjustment|required\.|diagnostic scope|comparison scope|coefficient family|selected covariate|configuration|input|scaling|embedding settings)/.test(text);
  }

  function summaryRowScore(row){
    const text = summaryRowText(row);
    const lower = text.toLowerCase();
    let score = 0;
    score += Number(row?.figurePriority) || 0;
    if(row?.figureRole === 'analysis') score += 80;
    if(row?.figureRole === 'inference') score += 70;
    if(row?.figureRole === 'effect' || row?.figureRole === 'test') score += 65;
    if(row?.figureRole === 'diagnostic' || row?.figureRole === 'fit') score += 45;
    if(row?.figureRole === 'comparison') score += 35;
    if(row?.figureRole === 'explanatory' || row?.figureRole === 'metadata') score -= 120;
    if(/\bp\s*[=<]|p-value|adjusted p|raw p/.test(lower)) score += 100;
    if(/95%\s*ci|confidence interval|\bci\s*\[/.test(lower)) score += 65;
    if(/\bauc\b|average precision|\bhr\b|hazard ratio|\br²\b|\br2\b|rmse|goodness|lack-of-fit|anderson|kolmogorov|harrell|concordance/.test(lower)) score += 50;
    if(/χ²|\bf\(|\bt\(|\bz\s*=|\bd\s*=|\br\s*=|ρ\s*=|difference|comparison|overall/.test(lower)) score += 35;
    if(/diagnostic|fit|model/.test(lower)) score += 15;
    if(isExplanatorySummaryRow(row)) score -= 120;
    if(/cutoff|threshold|classification/.test(lower)) score -= 60;
    return score;
  }

  function compactNormalizedModel(model, componentType){
    if(!model || !Array.isArray(model.sections)) return model;
    const type = String(componentType || '').trim().toLowerCase();
    const byKey = new Map(model.sections.map(section => [String(section.key || '').toLowerCase(), section.rows || []]));
    const selected = [];
    const seen = new Set();
    const normalizeCompactValue = value => String(value == null ? '' : value).trim();
    const add = (row, options = {}) => {
      if(!row || (options.required !== true && selected.length >= COMPACT_MAX_ROWS)) return false;
      const label = String(row.label || '').trim();
      const value = normalizeCompactValue(row.value);
      if((!label && !value) || row.figureInclude === false || isExplanatorySummaryRow(row)) return false;
      const key = `${label}|${value}`;
      if(seen.has(key)) return false;
      seen.add(key);
      selected.push({
        ...row,
        label,
        value,
        section:'summary',
        index:selected.length,
        keepTogether:true,
        figureRole:String(row.figureRole || '').trim().toLowerCase(),
        figurePriority:Number(row.figurePriority) || 0,
        figureInclude:true,
      });
      return true;
    };
    const addValue = (label, value, options = {}) => add({
      label,
      value:normalizeCompactValue(value),
      figureRole:options.figureRole || '',
      figurePriority:options.figurePriority || 0,
      figureInclude:options.figureInclude !== false,
    }, options);
    const first = (rows, predicate) => (rows || []).find(row => !predicate || predicate(row)) || null;
    const ranked = rows => (rows || [])
      .filter(row => row && row.figureInclude !== false && !isExplanatorySummaryRow(row))
      .slice()
      .sort((a, b) => summaryRowScore(b) - summaryRowScore(a) || (Number(a.index) || 0) - (Number(b.index) || 0));
    const text = row => summaryRowText(row);
    const analysisRows = byKey.get('analysis') || [];
    const resultRows = byKey.get('results') || [];
    const diagnosticRows = byKey.get('diagnostics') || [];
    const comparisonRows = byKey.get('comparisons') || [];
    const estimateRows = byKey.get('estimates') || [];
    const testRows = byKey.get('tests') || [];

    const analysis = first(analysisRows, row => /^analysis$|^matrix$|^geometry$/i.test(String(row.label || '')))
      || first(analysisRows, row => !isExplanatorySummaryRow(row));
    if(analysis){
      addValue('Analysis', analysis.value, {
        figureRole:analysis.figureRole || 'analysis',
        figurePriority:analysis.figurePriority || 80
      });
    }

    const inference = first(analysisRows, row => /^(statistical settings|inference|decision threshold|multiplicity|design)$/i.test(String(row.label || '')));

    if(type === 'scatter'){
      if(inference){ addValue('Inference', inference.value, { figureRole:inference.figureRole || 'inference', figurePriority:inference.figurePriority || 70 }); }
      const associations = resultRows.filter(row => row.figureRole === 'association'
        || (!row.figureRole && /association/i.test(String(row.label || ''))));
      const regressions = resultRows.filter(row => row.figureRole === 'model'
        || row.figureRole === 'effect'
        || (!row.figureRole && /regression|model/i.test(String(row.label || '')) && !/diagnostic/i.test(String(row.label || ''))));
      if(associations.length <= 1 && regressions.length <= 1){
        const diagnostic = first(diagnosticRows, row => !/interpretation|scope/i.test(String(row.label || '')));
        if(diagnostic && selected.length < COMPACT_MAX_ROWS){ addValue('Diagnostics', diagnostic.value); }
        const keyParts = [];
        if(associations[0]) keyParts.push(`Association: ${associations[0].value}`);
        if(regressions[0]) keyParts.push(`Regression: ${regressions[0].value}`);
        if(keyParts.length) addValue('Key result', keyParts.join(' · '));
        const intercept = first(resultRows, row => /intercept/i.test(String(row.label || '')));
        if(intercept && selected.length < COMPACT_MAX_ROWS){
          addValue(intercept.label || 'Intercept', intercept.value, { figureRole:intercept.figureRole || 'effect', figurePriority:intercept.figurePriority || 65 });
        }
      }else{
        const labels = new Map();
        associations.forEach(row => {
          const label = String(row.label || '').replace(/\s*·\s*association\s*$/i, '').trim() || 'Dataset';
          labels.set(label, { association:row, regression:null });
        });
        regressions.forEach(row => {
          const label = String(row.label || '').replace(/\s*·\s*(regression|model)\s*$/i, '').trim() || 'Dataset';
          const entry = labels.get(label) || { association:null, regression:null };
          entry.regression = row;
          labels.set(label, entry);
        });
        for(const [label, entry] of labels){
          const parts=[];
          if(entry.association) parts.push(entry.association.value);
          if(entry.regression) parts.push(entry.regression.value);
          addValue(label, parts.join(' · '), { required:true });
        }
        const overall = first(comparisonRows, row => /equal slopes|common curve|overall/i.test(String(row.label || '')) && /p\s*=|p-value/i.test(text(row)));
        if(overall && selected.length < COMPACT_MAX_ROWS){ addValue('Comparison', `${overall.label}: ${overall.value}`); }
      }
    }else if(type === 'line'){
      if(inference){ addValue('Inference', inference.value, { figureRole:inference.figureRole || 'inference', figurePriority:inference.figurePriority || 70 }); }
      const associations = resultRows.filter(row => row.figureRole === 'association'
        || (!row.figureRole && /association/i.test(String(row.label || ''))));
      const models = resultRows.filter(row => row.figureRole === 'model'
        || row.figureRole === 'effect'
        || (!row.figureRole && /model|regression/i.test(String(row.label || '')) && !/diagnostic/i.test(String(row.label || ''))));
      const series = new Map();
      associations.forEach(row => {
        const label=String(row.label || '').replace(/\s*·\s*association\s*$/i,'').trim() || 'Series';
        series.set(label,{association:row,model:null});
      });
      models.forEach(row => {
        const label=String(row.label || '').replace(/\s*·\s*(model|regression)\s*$/i,'').trim() || 'Series';
        const entry=series.get(label)||{association:null,model:null}; entry.model=row; series.set(label,entry);
      });
      if(series.size){
        for(const [label,entry] of series){
          const parts=[]; if(entry.association) parts.push(entry.association.value); if(entry.model) parts.push(entry.model.value);
          addValue(series.size === 1 ? 'Key result' : label, parts.join(' · '), { required:true });
        }
      }
      const forecasts = (byKey.get('forecast') || []).filter(row => !isExplanatorySummaryRow(row));
      if(forecasts.length && selected.length < COMPACT_MAX_ROWS){
        const forecastValue = forecasts.slice(0, 2).map(row => {
          const label = String(row.label || '').trim();
          return label && !/^forecast(?:\s*·|$)/i.test(label)
            ? `${label}: ${row.value}`
            : row.value;
        }).join(' · ');
        addValue('Forecast', forecastValue, { figureRole:'diagnostic' });
      }
    }else if(type === 'box'){
      const sampleSizes = first(analysisRows, row => /^sample sizes?$/i.test(String(row.label || '')));
      if(sampleSizes) addValue('Sample sizes', sampleSizes.value, { required:true, figureRole:'context', figurePriority:75 });
      const design = first(analysisRows, row => /^design$/i.test(String(row.label || '')));
      const multiplicity = first(analysisRows, row => /^multiplicity$/i.test(String(row.label || '')));
      const inferenceParts=[];
      if(design) inferenceParts.push(design.value);
      if(multiplicity && !/no multiplicity adjustment required/i.test(multiplicity.value || '')) inferenceParts.push(multiplicity.value);
      if(inferenceParts.length) addValue('Inference', inferenceParts.join(' · '));
      const candidates = resultRows.concat(testRows, comparisonRows);
      candidates.forEach((row,index) => {
        addValue(index === 0 ? 'Key result' : String(row.label || `Result ${index + 1}`), row.value, {
          required:true,
          figureRole:row.figureRole || 'effect',
          figurePriority:row.figurePriority || 65
        });
      });
    }else if(type === 'roc'){
      const classification = first(analysisRows, row => /^classification$/i.test(String(row.label || '')));
      if(classification && selected[0]?.label === 'Analysis'){
        selected[0].value = `${selected[0].value} · ${classification.value}`;
      }
      if(inference && resultRows.length < 4){ addValue('Inference', inference.value, { figureRole:inference.figureRole || 'inference', figurePriority:inference.figurePriority || 70 }); }
      const curves = resultRows.filter(row => row.figureRole === 'effect'
        || (!row.figureRole && !/cutoff|curve comparison/i.test(String(row.label || ''))));
      const thresholds = resultRows.filter(row => row.figureRole === 'threshold');
      const comparison = first(resultRows, row => row.figureRole === 'comparison'
        || (!row.figureRole && /curve comparison/i.test(String(row.label || ''))))
        || first(comparisonRows, row => /auc|average precision|curve/i.test(text(row)));
      curves.forEach(row => addValue(row.label || 'Curve', row.value, { required:true }));
      thresholds.forEach(row => addValue(row.label || 'Threshold', row.value, { required:true, figureRole:'threshold' }));
      if(comparison && selected.length < COMPACT_MAX_ROWS) addValue('Comparison', `${comparison.label}: ${comparison.value}`, { figureRole:'comparison' });
    }else if(type === 'hist'){
      const between = first(diagnosticRows, row => /\bvs\b|two-sample|kolmogorov/i.test(text(row)));
      const diagnosticSpec = first(analysisRows, row => /distribution diagnostics|between-series test/i.test(String(row.label || '')));
      if(diagnosticSpec) addValue('Diagnostics', diagnosticSpec.value, { figureRole:diagnosticSpec.figureRole || 'diagnostic', figurePriority:diagnosticSpec.figurePriority || 45 });
      if(between) addValue('Key result', `${between.label}: ${between.value}`);
      const fits = diagnosticRows.filter(row => /normal fit|goodness|anderson/i.test(text(row)) && !/\bvs\b|two-sample/i.test(text(row)));
      if(fits.length && selected.length < COMPACT_MAX_ROWS){
        addValue('Goodness of fit', fits.slice(0,2).map(row => `${row.label}: ${row.value}`).join(' · '));
      }
      if(!between){
        const modelFit = first(diagnosticRows, row => /model comparison|aicc/i.test(text(row)));
        if(modelFit && selected.length < COMPACT_MAX_ROWS) addValue('Model fit', modelFit.value);
      }
    }else if(type === 'pie'){
      if(inference) addValue('Inference', inference.value, { figureRole:inference.figureRole || 'inference', figurePriority:inference.figurePriority || 70 });
      const overall = first(resultRows, row => /overall/i.test(String(row.label || ''))) || resultRows[0];
      if(overall) addValue('Key result', `${overall.label}: ${overall.value}`);
      const pairwise = resultRows.filter(row => row !== overall);
      if(pairwise.length && selected.length < COMPACT_MAX_ROWS){
        addValue('Comparisons', pairwise.map(row => `${row.label}: ${row.value}`).join(' · '), { required:true });
      }
      const diag = first(diagnosticRows);
      if(diag && selected.length < COMPACT_MAX_ROWS) addValue('Diagnostics', diag.value);
    }else if(type === 'survival'){
      const mult = first(analysisRows, row => /multiplicity|primary comparison/i.test(String(row.label || '')));
      if(mult) addValue('Inference', mult.value, { figureRole:mult.figureRole || 'inference', figurePriority:mult.figurePriority || 70 });
      const logrank = first(testRows, row => /^log-rank$/i.test(String(row.label || '')) || /overall log-rank/i.test(text(row)));
      if(logrank) addValue(logrank.label || 'Log-rank', logrank.value, { figureRole:'test' });
      (byKey.get('groups') || []).forEach(row => {
        addValue(row.label || 'Group', row.value, { required:true, figureRole:'group' });
      });
      const hr = first(estimateRows, row => /^hr:|hazard ratio/i.test(text(row)));
      if(hr) addValue(hr.label || 'Effect estimate', hr.value, { required:true, figureRole:'effect' });
      const fit = first(diagnosticRows, row => /harrell|concordance|goodness|fit/i.test(text(row)));
      if(fit && selected.length < COMPACT_MAX_ROWS) addValue('Model fit', `${fit.label}: ${fit.value}`);
    }else if(type === 'heatmap'){
      if(inference) addValue('Inference', inference.value, { figureRole:inference.figureRole || 'inference', figurePriority:inference.figurePriority || 70 });
      const results = resultRows;
      if(results.length){
        const rowsToShow = results.length <= 6
          ? results
          : results.slice(0, Math.min(3, COMPACT_MAX_ROWS - selected.length));
        rowsToShow.forEach((row,index) => addValue(index === 0 ? 'Key result' : row.label, row.value, { required:results.length <= 6, figureRole:row.figureRole || 'effect' }));
      }else{
        const range = first(analysisRows, row => /value range|clustering|filtering/i.test(String(row.label || '')));
        if(range) addValue('Key result', `${range.label}: ${range.value}`);
      }
    }else if(type === 'venn'){
      if(inference) addValue('Inference', inference.value, { figureRole:inference.figureRole || 'inference', figurePriority:inference.figurePriority || 70 });
      resultRows.forEach((row,index) => {
        addValue(index === 0 ? 'Key result' : row.label, row.value, { required:true });
      });
    }else if(type === 'pca'){
      const top = first(resultRows, row => /top two|cumulative|component selection/i.test(String(row.label || '')));
      if(top) addValue('Key result', `${top.label}: ${top.value}`);
      ranked(resultRows.filter(row => row !== top)).slice(0, Math.max(0, COMPACT_MAX_ROWS-selected.length)).forEach(row => addValue(row.label, row.value));
    }else if(type === 'surface'){
      const geometry = first(analysisRows, row => /geometry/i.test(String(row.label || '')));
      const mesh = first(analysisRows, row => /rendered mesh/i.test(String(row.label || '')));
      const range = first(analysisRows, row => /z range/i.test(String(row.label || '')));
      const excluded = first(analysisRows, row => /excluded rows/i.test(String(row.label || '')));
      const resourceLimit = first(analysisRows, row => /resource limit/i.test(String(row.label || '')));
      if(geometry) addValue('Geometry', geometry.value, { required:true });
      if(mesh) addValue('Rendered mesh', mesh.value, { required:true });
      if(range) addValue('Z range', range.value, { required:true });
      if(excluded) addValue('Excluded rows', excluded.value, { required:true });
      if(resourceLimit) addValue('Resource limit', resourceLimit.value, { required:true });
    }else{
      if(inference) addValue('Inference', inference.value, { figureRole:inference.figureRole || 'inference', figurePriority:inference.figurePriority || 70 });
      const candidates=[];
      model.sections.forEach(section => {
        if(String(section.key || '').toLowerCase() === 'analysis') return;
        (section.rows || []).forEach(row => candidates.push(row));
      });
      ranked(candidates).slice(0, Math.max(0, COMPACT_MAX_ROWS-selected.length)).forEach((row,index) => {
        addValue(index === 0 ? 'Key result' : row.label, row.value);
      });
    }

    if(selected.length < 2){
      const fallback=[];
      model.sections.forEach(section => {
        if(String(section.key || '').toLowerCase() === 'analysis') return;
        (section.rows || []).forEach(row => fallback.push(row));
      });
      const row=ranked(fallback).find(item => !seen.has(`${String(item.label||'').trim()}|${normalizeCompactValue(item.value)}`));
      if(row) addValue('Key result', `${row.label ? `${row.label}: ` : ''}${row.value}`);
    }

    const title = model.kind === 'analysis' ? 'Analysis summary' : 'Statistical summary';
    return {
      ...model,
      title,
      sections:selected.length ? [{ key:'summary', label:'', rows:selected }] : model.sections
    };
  }

  function normalizeModel(reportModel, tabId, componentType){
    const source = reportModel?.figureSummary;
    if(!source || typeof source !== 'object') return null;
    const title = String(source.title || (source.kind === 'analysis' ? 'Analysis summary' : 'Statistical analysis summary')).trim();
    const sections = [];
    const sourceSections = Array.isArray(source.sections)
      ? source.sections
      : [{ key:'summary', label:'', rows:Array.isArray(source.rows) ? source.rows : [] }];
    sourceSections.forEach((section, sectionIndex) => {
      if(!section || typeof section !== 'object') return;
      const key = String(section.key || `section-${sectionIndex + 1}`).trim().toLowerCase();
      const label = String(section.label || '').trim();
      const rows = (Array.isArray(section.rows) ? section.rows : [])
        .map((row, rowIndex) => normalizeRow(row, tabId, key, rowIndex))
        .filter(Boolean);
      if(rows.length) sections.push({ key, label, rows });
    });
    if(!sections.length) return null;
    return compactNormalizedModel({
      schemaVersion: Number(source.schemaVersion) || 1,
      kind: source.kind === 'analysis' ? 'analysis' : 'inferential',
      title: title || 'Statistical analysis summary',
      sections
    }, componentType);
  }

  function makeSvg(tag, attrs){
    const node = global.document?.createElementNS?.(NS, tag) || null;
    if(!node) return null;
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if(value == null) return;
      node.setAttribute(key, String(value));
    });
    return node;
  }

  function formatNumber(value){
    return String(Math.round(Number(value) * 1000) / 1000);
  }

  function measureText(group, text, fontSize, fontWeight, fontFamily){
    const node = makeSvg('text', {
      x: -100000,
      y: -100000,
      'font-size': fontSize,
      'font-family': fontFamily,
      'font-weight': fontWeight || 400,
      visibility: 'hidden'
    });
    if(!node) return 0;
    node.textContent = text || '';
    group.appendChild(node);
    let width = 0;
    try{
      width = Number(node.getComputedTextLength?.());
      if(!Number.isFinite(width) || width < 0){
        const box = node.getBBox?.();
        width = Number(box?.width);
      }
    }catch(_err){ width = 0; }
    node.remove();
    if(Number.isFinite(width) && width >= 0) return width;
    return String(text || '').length * fontSize * 0.52;
  }

  function wrapText(group, text, maxWidth, fontSize, fontWeight, fontFamily){
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if(!normalized) return [''];
    if(!Number.isFinite(maxWidth) || maxWidth <= 0) return [normalized];
    const tokens = [];
    const appendPlainTokens = chunk => {
      String(chunk || '').split(/\s+/).filter(Boolean).forEach(token => {
        // Keep clause punctuation with the preceding expression. A line
        // starting with ';' or ')' is visually noisy and semantically weak.
        if(/^[,;·.:)\]]+$/.test(token) && tokens.length){
          tokens[tokens.length - 1] += token;
        }else{
          tokens.push(token);
        }
      });
    };
    let cursor = 0;
    WRAP_ATOMIC_PATTERN.lastIndex = 0;
    let match;
    while((match = WRAP_ATOMIC_PATTERN.exec(normalized))){
      appendPlainTokens(normalized.slice(cursor, match.index));
      tokens.push(match[0].trim());
      cursor = match.index + match[0].length;
    }
    WRAP_ATOMIC_PATTERN.lastIndex = 0;
    appendPlainTokens(normalized.slice(cursor));
    const lines = [];
    let current = '';
    const pushToken = token => {
      if(!current){ current = token; return; }
      const candidate = `${current} ${token}`;
      if(measureText(group, candidate, fontSize, fontWeight, fontFamily) <= maxWidth){
        current = candidate;
      }else{
        lines.push(current);
        current = token;
      }
    };
    tokens.forEach(token => {
      if(measureText(group, token, fontSize, fontWeight, fontFamily) <= maxWidth){
        pushToken(token);
        return;
      }
      // Break a pathological unspaced token rather than overflow the SVG.
      let fragment = '';
      Array.from(token).forEach(char => {
        const candidate = fragment + char;
        if(fragment && measureText(group, candidate, fontSize, fontWeight, fontFamily) > maxWidth){
          pushToken(fragment);
          fragment = char;
        }else{
          fragment = candidate;
        }
      });
      if(fragment) pushToken(fragment);
    });
    if(current) lines.push(current);
    return lines.length ? lines : [normalized];
  }

  function markSummaryText(node, componentType, tabId){
    if(!node?.dataset) return node;
    node.dataset.fontScopeMode = 'collection';
    const fontControls = Shared.fontControls;
    if(typeof fontControls?.markText === 'function'){
      fontControls.markText(node, {
        scopeId: componentType,
        tabId,
        role: SUMMARY_FONT_ROLE,
        key: SUMMARY_FONT_KEY,
        collection: SUMMARY_FONT_COLLECTION,
        collectionLabel: 'Statistics'
      });
    }else{
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = componentType;
      node.dataset.fontTabId = tabId;
      node.dataset.fontRole = SUMMARY_FONT_ROLE;
      node.dataset.fontKey = SUMMARY_FONT_KEY;
      node.dataset.fontCollection = SUMMARY_FONT_COLLECTION;
    }
    return node;
  }

  function appendMultilineText(group, options){
    const node = makeSvg('text', {
      x: options.x,
      y: options.y,
      fill: options.fill,
      'font-family': options.fontFamily,
      'font-size': options.fontSize,
      'font-weight': options.fontWeight || 400,
      'dominant-baseline': 'hanging',
      'data-font-preserve-structure': 'children',
      'data-stats-summary-role': options.role || 'value'
    });
    if(!node) return null;
    if(options.section) node.setAttribute('data-stats-summary-section', options.section);
    if(options.rowIndex != null) node.setAttribute('data-stats-summary-row', String(options.rowIndex));
    (options.lines || ['']).forEach((line, index) => {
      const tspan = makeSvg('tspan', {
        x: options.x,
        dy: index === 0 ? 0 : options.lineHeight,
        'data-font-structure-part': '1',
        'data-font-structure-text': line
      });
      tspan.textContent = line;
      node.appendChild(tspan);
    });
    group.appendChild(node);
    return markSummaryText(node, options.componentType, options.tabId);
  }

  function resolveDisplayTitle(model){
    return String(model?.title || (model?.kind === 'analysis' ? 'Analysis summary' : 'Statistical summary'));
  }

  function resolveSummaryFontProfile(svg, componentType, tabId){
    const fallbackPx = CSS.valueFont;
    let graphProfile = null;
    let summaryStyle = null;
    try{
      const styles = Shared.fontControls?.exportScopeStyles?.(componentType, { tabId }) || null;
      graphProfile = Shared.chartStyle?.resolveScopedLabelMeasureFont?.({
        styles,
        role:'graph',
        fallbackPx
      }) || null;
      const collectionToken = Shared.fontControls?.getCollectionStyleToken?.(SUMMARY_FONT_COLLECTION)
        || `__${SUMMARY_FONT_COLLECTION}__`;
      summaryStyle = styles?.[collectionToken] || null;
    }catch(_err){
      graphProfile = null;
      summaryStyle = null;
    }
    const explicitSize = Number.parseFloat(String(svg?.getAttribute?.('font-size') || svg?.style?.fontSize || ''));
    const baseFontSizePx = Number.isFinite(Number(graphProfile?.fontSizePx)) && Number(graphProfile.fontSizePx) > 0
      ? Number(graphProfile.fontSizePx)
      : (Number.isFinite(explicitSize) && explicitSize > 0 ? explicitSize : fallbackPx);
    const styles = {
      __graph__: {
        fontFamily: SUMMARY_FONT_FAMILY,
        fontSize: `${baseFontSizePx}px`
      }
    };
    if(summaryStyle){
      styles[`__${SUMMARY_FONT_COLLECTION}__`] = summaryStyle;
    }
    const profile = Shared.chartStyle?.resolveScopedLabelMeasureFont?.({
      styles,
      collection: SUMMARY_FONT_COLLECTION,
      fallbackPx: baseFontSizePx
    }) || null;
    const fontSizePx = Number.isFinite(Number(profile?.fontSizePx)) && Number(profile.fontSizePx) > 0
      ? Number(profile.fontSizePx)
      : baseFontSizePx;
    return {
      fontSizePx,
      fontFamily: profile?.fontFamily || SUMMARY_FONT_FAMILY,
      scale: fontSizePx / CSS.valueFont
    };
  }

  function buildLayout(svg, model, viewport, scale, componentType, tabId){
    const typography = resolveSummaryFontProfile(svg, componentType, tabId);
    const typographyScale = Number.isFinite(typography.scale) && typography.scale > 0 ? typography.scale : 1;
    const ux = value => value * typographyScale / scale.scaleX;
    const uy = value => value * typographyScale / scale.scaleY;
    const uf = value => value * typographyScale / scale.scale;
    const baseWidth = viewport.baseWidth;
    const left = ux(CSS.padX);
    const right = baseWidth - ux(CSS.padX);
    const fontFamily = typography.fontFamily;
    const titleFont = uf(CSS.titleFont);
    const sectionFont = uf(CSS.sectionFont);
    const labelFont = uf(CSS.labelFont);
    const valueFont = uf(CSS.valueFont);
    const titleLH = uy(CSS.titleLineHeight);
    const titleRuleGap = uy(CSS.titleRuleGap);
    const sectionLH = uy(CSS.sectionLineHeight);
    const rowLH = uy(CSS.rowLineHeight);
    const rowGap = uy(CSS.rowGap);
    const sectionGap = uy(CSS.sectionGap);
    const labelMin = ux(CSS.labelColumnMin);
    const labelMax = ux(CSS.labelColumnMax);
    const measuredLabelWidth = model.sections.reduce((maxWidth, section) => {
      return (section.rows || []).reduce((sectionMax, row) => {
        const measured = measureText(
          svg.__statsSummaryMeasureGroup,
          row.label,
          labelFont,
          600,
          fontFamily
        );
        return Math.max(sectionMax, measured);
      }, maxWidth);
    }, 0);
    const labelWidth = Math.max(labelMin, Math.min(labelMax, measuredLabelWidth + ux(CSS.labelColumnPadding)));
    const columnGap = ux(CSS.columnGap);
    const valueX = left + labelWidth + columnGap;
    const valueWidth = Math.max(1, right - valueX);
    const rows = [];
    let y = uy(CSS.padTop) + titleLH + titleRuleGap;
    model.sections.forEach((section, sectionIndex) => {
      if(sectionIndex > 0) y += sectionGap;
      if(section.label){
        y += sectionLH;
      }
      section.rows.forEach((row, rowIndex) => {
        const labelLines = wrapText(svg.__statsSummaryMeasureGroup, row.label, labelWidth, labelFont, 600, fontFamily);
        const valueLines = wrapText(svg.__statsSummaryMeasureGroup, row.value, valueWidth, valueFont, 400, fontFamily);
        const height = Math.max(labelLines.length, valueLines.length, 1) * rowLH + rowGap;
        rows.push({ ...row, sectionLabel: section.label, sectionIndex, rowIndex, y, height, labelLines, valueLines, labelWidth, valueX, valueWidth });
        y += height;
      });
    });
    const contentHeight = y
      - (rows.length ? uy(CSS.rowGap) : 0)
      + uy(CSS.padBottom);
    return {
      left, right, valueX, labelWidth, valueWidth,
      fontFamily, titleFont, sectionFont, labelFont, valueFont,
      titleLH, titleRuleGap, sectionLH, rowLH, rowGap, sectionGap,
      contentHeight, rows, ux, uy, uf, typography
    };
  }

  function renderTable(svg, model, tabId, viewport, scale, baseBottomReserve, componentType){
    const group = makeSvg('g', {
      [GROUP_ATTR]: '1',
      'data-stats-summary-tab-id': tabId,
      'data-stats-summary-kind': model.kind,
      'data-font-scope': componentType,
      'data-font-tab-id': tabId,
      'data-font-collection': SUMMARY_FONT_COLLECTION,
      'data-font-scope-mode': 'collection',
      'pointer-events': 'visiblePainted'
    });
    if(!group) return null;
    svg.appendChild(group);
    svg.__statsSummaryMeasureGroup = group;
    const layout = buildLayout(svg, model, viewport, scale, componentType, tabId);
    delete svg.__statsSummaryMeasureGroup;
    const originY = viewport.baseHeight + baseBottomReserve + layout.uy(CSS.outerGap);
    group.setAttribute('transform', `translate(0 ${formatNumber(originY)})`);

    const ink = '#000000';

    const title = makeSvg('text', {
      x: layout.left,
      y: layout.uy(CSS.padTop),
      fill: ink,
      'font-family': layout.fontFamily,
      'font-size': layout.titleFont,
      'font-weight': 700,
      'dominant-baseline': 'hanging',
      'data-stats-summary-role': 'title'
    });
    title.textContent = resolveDisplayTitle(model);
    group.appendChild(title);
    markSummaryText(title, componentType, tabId);

    const titleRuleY = layout.uy(CSS.padTop) + layout.titleLH + layout.uy(1.25);
    group.appendChild(makeSvg('line', {
      x1: layout.left,
      x2: layout.right,
      y1: titleRuleY,
      y2: titleRuleY,
      stroke: ink,
      'stroke-width': layout.uf(CSS.rowRuleWidth),
      'data-stats-summary-role': 'title-rule'
    }));

    let lastSectionIndex = -1;
    layout.rows.forEach((row, index) => {
      if(row.sectionIndex !== lastSectionIndex){
        const section = model.sections[row.sectionIndex];
        if(section?.label){
          const sectionY = row.y - layout.sectionLH;
          const sectionNode = makeSvg('text', {
            x: layout.left,
            y: sectionY,
            fill: ink,
            'font-family': layout.fontFamily,
            'font-size': layout.sectionFont,
            'font-weight': 700,
            'dominant-baseline': 'hanging',
            'data-stats-summary-role': 'section',
            'data-stats-summary-section': section.key
          });
          sectionNode.textContent = section.label.toUpperCase();
          group.appendChild(sectionNode);
          markSummaryText(sectionNode, componentType, tabId);
        }
        lastSectionIndex = row.sectionIndex;
      }

      if(index > 0){
        const prev = layout.rows[index - 1];
        const sectionBreak = prev.sectionIndex !== row.sectionIndex;
        const separatorY = sectionBreak
          ? row.y - layout.uy(CSS.sectionGap * 0.55)
          : row.y - (layout.rowGap * 0.55);
        group.appendChild(makeSvg('line', {
          x1: layout.left,
          x2: layout.right,
          y1: separatorY,
          y2: separatorY,
          stroke: ink,
          'stroke-width': layout.uf(sectionBreak ? 0.45 : CSS.rowRuleWidth),
          'data-stats-summary-role': 'row-rule'
        }));
      }

      appendMultilineText(group, {
        x: layout.left,
        y: row.y,
        lines: row.labelLines,
        lineHeight: layout.rowLH,
        fill: ink,
        fontFamily: layout.fontFamily,
        fontSize: layout.labelFont,
        fontWeight: 600,
        role: 'label',
        componentType,
        tabId,
        section: row.section,
        rowIndex: row.index
      });
      appendMultilineText(group, {
        x: layout.valueX,
        y: row.y,
        lines: row.valueLines,
        lineHeight: layout.rowLH,
        fill: ink,
        fontFamily: layout.fontFamily,
        fontSize: layout.valueFont,
        fontWeight: 400,
        role: 'value',
        componentType,
        tabId,
        section: row.section,
        rowIndex: row.index
      });
    });

    group.appendChild(makeSvg('line', {
      x1: layout.left,
      x2: layout.right,
      y1: layout.contentHeight,
      y2: layout.contentHeight,
      stroke: ink,
      'stroke-width': layout.uf(CSS.rowRuleWidth),
      'data-stats-summary-role': 'bottom-rule'
    }));

    const reserve = layout.uy(CSS.outerGap) + layout.contentHeight + layout.uy(2);
    group.dataset.statsSummaryReserveBottom = formatNumber(reserve);
    Shared.fontControls?.enableForSvg?.(svg, { scopeId: componentType, tabId });
    return { group, reserve, layout, originY };
  }

  function applyViewport(svg, viewport, baseBottomReserve, summaryReserve, scale){
    const stage = Shared.chartStyle?.stageGraphContentViewport;
    if(typeof stage !== 'function') return false;
    const bottomHeight = Math.max(0, baseBottomReserve + summaryReserve);
    const envelopeMaxY = Math.max(viewport.baseHeight + bottomHeight, viewport.baseHeight + baseBottomReserve);
    const projection = stage({
      svg,
      plot: resolveGraphViewportHost(svg),
      svgBox: svg.closest?.('.svgbox') || null,
      baseWidth: viewport.baseWidth,
      baseHeight: viewport.baseHeight,
      rightWidth: viewport.right,
      legendWidth: viewport.legendWidth,
      bottomHeight,
      leftWidth: viewport.left,
      topHeight: viewport.top,
      contentBounds: {
        minX: viewport.envelopeMinX,
        minY: viewport.envelopeMinY,
        maxX: Math.max(viewport.envelopeMaxX, viewport.baseWidth + viewport.right),
        maxY: envelopeMaxY
      },
      refineContentBounds: false,
      refineLegendReserve: false,
      allowLegendReserveShrink: false,
      includeCarriedStatsFigureSummary: false,
      renderedScaleX: scale.scaleX,
      renderedScaleY: scale.scaleY,
      applyRenderedScaleToSvgDimensions: true
    });
    projection.commit?.();
    return true;
  }

  function restoreViewportWithoutSummary(svg, viewport, baseBottomReserve, scale){
    const stage = Shared.chartStyle?.stageGraphContentViewport;
    if(typeof stage !== 'function') return false;
    const projection = stage({
      svg,
      plot: resolveGraphViewportHost(svg),
      svgBox: svg.closest?.('.svgbox') || null,
      baseWidth: viewport.baseWidth,
      baseHeight: viewport.baseHeight,
      rightWidth: viewport.right,
      legendWidth: viewport.legendWidth,
      bottomHeight: Math.max(0, baseBottomReserve),
      leftWidth: viewport.left,
      topHeight: viewport.top,
      contentBounds: {
        minX: viewport.envelopeMinX,
        minY: viewport.envelopeMinY,
        maxX: Math.max(viewport.envelopeMaxX, viewport.baseWidth + viewport.right),
        maxY: viewport.baseHeight + Math.max(0, baseBottomReserve)
      },
      refineContentBounds: false,
      refineLegendReserve: false,
      allowLegendReserveShrink: false,
      includeCarriedStatsFigureSummary: false,
      renderedScaleX: scale.scaleX,
      renderedScaleY: scale.scaleY,
      applyRenderedScaleToSvgDimensions: true
    });
    projection.commit?.();
    return true;
  }

  function beginGraphRedraw(svg){
    if(!svg){
      return false;
    }
    const mountedSummary = svg.querySelector?.(`g[${GROUP_ATTR}="1"]`) || null;
    const mountedReserve = Math.max(0, Number(mountedSummary?.dataset?.statsSummaryReserveBottom) || 0);
    const storedReserve = Math.max(0, numericDataset(svg, 'statsFigureSummaryReserveBottom', 0) || 0);
    const carriedReserve = svg.dataset?.statsFigureSummaryCarried === '1'
      ? Math.max(0, numericDataset(svg, 'statsFigureSummaryCarryReserveBottom', 0) || 0)
      : 0;
    const previousReserve = Math.max(mountedReserve, storedReserve, carriedReserve);
    if(!mountedSummary && previousReserve <= 0){
      return false;
    }
    // A renderer that keeps its SVG root mounts its next graph before the
    // summary is replaced. Remove only this derived presentation slot so its
    // old rendered height cannot become input to that next graph layout. Keep
    // the summary group itself mounted; the browser never paints an empty table
    // between this synchronous redraw setup and the replacement projection.
    const clearViewportSlot = target => {
      if(!target?.style || !target?.dataset){
        return;
      }
      delete target.dataset.graphContentViewport;
      [
        '--graph-content-viewport-width',
        '--graph-content-rendered-width',
        '--graph-content-viewport-height',
        '--graph-content-rendered-height',
        '--graph-content-origin-left',
        '--graph-content-origin-top'
      ].forEach(property => target.style.removeProperty(property));
    };
    clearViewportSlot(svg);
    clearViewportSlot(svg.parentElement || null);
    const svgBox = svg.closest?.('.svgbox') || null;
    if(svgBox?.style && svgBox?.dataset){
      delete svgBox.dataset.graphContentEnvelope;
      [
        '--graph-content-extra-left',
        '--graph-content-extra-top',
        '--graph-content-extra-right',
        '--graph-content-extra-bottom'
      ].forEach(property => svgBox.style.removeProperty(property));
    }
    if(svg.dataset){
      svg.dataset.statsFigureSummaryGraphRedrawn = '1';
    }
    debug('graphRedrawBegan', {
      previousReserve
    });
    return true;
  }

  function removeAccessibleSummary(root){
    root?.querySelector?.('[data-stats-figure-summary-accessible="1"]')?.remove?.();
  }

  function buildAccessibleSummaryModel(model, componentType){
    const rows = model.sections.flatMap(section => section.rows || [])
      .map(row => [String(row.label || ''), String(row.value || '')]);
    return {
      columns:[
        { key:'statistic', label:'Statistic', align:'left' },
        { key:'value', label:'Value', align:'left' }
      ],
      rows,
      caption:model.title,
      footnotes:['This table contains the rows shown in the figure summary. The complete canonical statistical results remain in the analysis report.'],
      options:{
        fileName:`${componentType || 'graph'}-figure-summary`,
        contextLabel:`${componentType || 'graph'}-figure-summary`
      }
    };
  }

  function renderAccessibleSummary(root, model, componentType, tabId){
    if(!root || !model || !global.document) return false;
    let details = root.querySelector?.('[data-stats-figure-summary-accessible="1"]') || null;
    if(!details){
      details = global.document.createElement('details');
      details.className = 'stats-figure-summary-accessible';
      details.setAttribute('data-stats-figure-summary-accessible', '1');
      details.setAttribute('data-stats-summary-tab-id', tabId);
      const summary = global.document.createElement('summary');
      summary.textContent = 'Accessible summary table and structured data export';
      details.appendChild(summary);
      const body = global.document.createElement('div');
      body.className = 'stats-figure-summary-accessible__body';
      details.appendChild(body);
      const exportControls = root.querySelector?.('.graph-export-controls');
      if(exportControls?.parentElement){
        exportControls.parentElement.insertBefore(details, exportControls.nextSibling);
      }else{
        root.appendChild(details);
      }
    }
    const body = details.querySelector('.stats-figure-summary-accessible__body') || details;
    const tableModel = buildAccessibleSummaryModel(model, componentType);
    if(typeof Shared.statsTable?.render === 'function'){
      Shared.statsTable.render({
        target:body,
        model:tableModel,
        contextLabel:tableModel.options.contextLabel
      });
      return true;
    }
    body.innerHTML = '';
    const table = global.document.createElement('table');
    table.className = 'stats-table';
    const thead = global.document.createElement('thead');
    const headerRow = global.document.createElement('tr');
    ['Statistic', 'Value'].forEach(label => {
      const th = global.document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = global.document.createElement('tbody');
    tableModel.rows.forEach(row => {
      const tr = global.document.createElement('tr');
      row.forEach((value, index) => {
        const cell = global.document.createElement(index === 0 ? 'th' : 'td');
        if(index === 0) cell.scope = 'row';
        cell.textContent = value;
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
    return true;
  }

  function getExportModel(tabId, componentType){
    const key = normalizeTabId(tabId);
    const entry = reportByTab.get(key);
    if(!entry) return null;
    const model = normalizeModel(entry.reportModel, key, componentType || entry.componentType);
    if(!model) return null;
    return buildAccessibleSummaryModel(model, componentType || entry.componentType);
  }

  function renderForTab(tabId, options = {}){
    const key = normalizeTabId(tabId);
    if(!key) return false;
    if(resizingTabs.has(key) && options.allowDuringResize !== true){
      return false;
    }
    const active = resolveActiveTab();
    if(normalizeTabId(active?.id) !== key){
      return false;
    }
    const entry = reportByTab.get(key) || null;
    const type = resolveComponentType(key, options.componentType || entry?.componentType);
    // The mounted SVG resolved from the owning tab is authoritative. Callers
    // must not be able to project one tab's summary into another tab's root.
    const svg = resolveSvg(key, type);
    if(!svg) return false;
    const mountedRoot = resolveMountedRoot(key, type);

    // A component draw may register its report before performing the direct
    // summary projection at the end of that draw. That direct projection is
    // authoritative for the newly published SVG and supersedes the queued
    // registration frame. The scheduled runner marks itself so it does not
    // cancel its own in-flight entry.
    if(options.__scheduledRender !== true){
      pendingRenders.delete(key);
    }

    const graphRedrawn = options.graphRedrawn === true || svg.dataset?.statsFigureSummaryGraphRedrawn === '1';
    const hadGroup = !!svg.querySelector?.(`g[${GROUP_ATTR}="1"]`);
    const carriedSummaryReserve = svg.dataset?.statsFigureSummaryCarried === '1'
      ? Math.max(0, numericDataset(svg, 'statsFigureSummaryCarryReserveBottom', 0) || 0)
      : 0;
    const mountedSummaryReserve = hadGroup
      ? Math.max(0, Number(svg.querySelector?.(`g[${GROUP_ATTR}="1"]`)?.dataset?.statsSummaryReserveBottom) || 0)
      : 0;
    const previousSummaryReserve = Math.max(
      numericDataset(svg, 'statsFigureSummaryReserveBottom', 0) || 0,
      carriedSummaryReserve,
      mountedSummaryReserve
    );
    const currentViewport = resolveViewportState(svg, { ignorePublishedViewportMetadata: graphRedrawn });
    const hasSummaryExtension = hadGroup || previousSummaryReserve > 0;
    const cachedViewport = hasSummaryExtension && !graphRedrawn ? readSummaryBaseViewport(svg) : null;
    const graphWasRedrawn = graphRedrawn || summaryBaseViewportChanged(currentViewport, cachedViewport);
    const hasGraphBaseHeightMetadata = Number.isFinite(Number(svg.dataset?.graphContentBaseHeight));
    let viewport = cachedViewport;
    if(!viewport || graphWasRedrawn){
      viewport = currentViewport;
      if(!graphRedrawn && hasSummaryExtension && previousSummaryReserve > 0 && (hadGroup || carriedSummaryReserve > 0)){
        // The current projection can still include the previous summary
        // extension. Remove only that extension before recapturing the graph's
        // new canonical base viewport. Legacy caches did not serialize the
        // graph-content base height; infer it from the mounted summary reserve
        // so an existing recovered file is not forced through a double reserve.
        viewport = removeSummaryReserveFromViewport(viewport, previousSummaryReserve, {
          inferBaseHeight: !hasGraphBaseHeightMetadata && mountedSummaryReserve > 0
        });
      }
      captureSummaryBaseViewport(svg, viewport);
    }
    if(svg.dataset){
      delete svg.dataset.statsFigureSummaryCarried;
      delete svg.dataset.statsFigureSummaryCarryReserveBottom;
    }
    const scale = computeRenderedScale(svg, viewport, graphRedrawn ? 0 : (hasSummaryExtension ? previousSummaryReserve : 0));
    const baseBottomReserve = Math.max(0, viewport.bottom);
    removeSummaryGroup(svg);

    if(!isEnabled(key)){
      removeAccessibleSummary(mountedRoot);
      if(hadGroup || previousSummaryReserve > 0){
        restoreViewportWithoutSummary(svg, viewport, baseBottomReserve, scale);
      }
      if(svg.dataset){
        delete svg.dataset.statsFigureSummaryReserveBottom;
        delete svg.dataset.statsFigureSummaryBaseBottom;
      }
      clearSummaryBaseViewport(svg);
      clearSummaryRenderedScale(svg);
      delete svg.dataset?.statsFigureSummaryGraphRedrawn;
      debug('hidden', { tabId:key, componentType:type, baseBottomReserve });
      return true;
    }

    const reportModel = options.reportModel || entry?.reportModel || null;
    const model = normalizeModel(reportModel, key, type);
    if(!model){
      removeAccessibleSummary(mountedRoot);
      if(hadGroup || previousSummaryReserve > 0){
        restoreViewportWithoutSummary(svg, viewport, baseBottomReserve, scale);
      }
      if(svg.dataset){
        delete svg.dataset.statsFigureSummaryReserveBottom;
        delete svg.dataset.statsFigureSummaryBaseBottom;
      }
      clearSummaryBaseViewport(svg);
      clearSummaryRenderedScale(svg);
      delete svg.dataset?.statsFigureSummaryGraphRedrawn;
      debug('noModel', { tabId:key, componentType:type });
      return false;
    }

    const rendered = renderTable(svg, model, key, viewport, scale, baseBottomReserve, type);
    if(!rendered) return false;
    if(svg.dataset){
      svg.dataset.statsFigureSummaryReserveBottom = formatNumber(rendered.reserve);
      svg.dataset.statsFigureSummaryBaseBottom = formatNumber(baseBottomReserve);
      svg.dataset.statsFigureSummaryRenderedScaleX = String(scale.scaleX);
      svg.dataset.statsFigureSummaryRenderedScaleY = String(scale.scaleY);
    }
    applyViewport(svg, viewport, baseBottomReserve, rendered.reserve, scale);
    renderAccessibleSummary(mountedRoot, model, type, key);
    delete svg.dataset?.statsFigureSummaryGraphRedrawn;
    debug('rendered', {
      tabId:key,
      componentType:type,
      rowCount:model.sections.reduce((sum, section) => sum + section.rows.length, 0),
      baseBottomReserve,
      summaryReserve:rendered.reserve,
      scale
    });
    return true;
  }

  function scheduleRender(tabId, options = {}){
    const key = normalizeTabId(tabId);
    if(!key) return false;
    const previous = pendingRenders.get(key);
    const mergedOptions = {
      ...(previous?.options || {}),
      ...(options || {})
    };
    if(previous?.options?.allowDuringResize === true || options?.allowDuringResize === true){
      mergedOptions.allowDuringResize = true;
    }
    if(previous?.options?.reportModel && !options?.reportModel){
      mergedOptions.reportModel = previous.options.reportModel;
    }
    if(previous){
      previous.options = mergedOptions;
      return true;
    }
    const pending = { options: mergedOptions };
    pendingRenders.set(key, pending);
    const run = () => {
      if(pendingRenders.get(key) !== pending) return;
      pendingRenders.delete(key);
      renderForTab(key, { ...(pending.options || {}), __scheduledRender:true });
    };
    if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(run);
    }else{
      global.setTimeout?.(run, 0);
    }
    return true;
  }

  function registerReportModel(options = {}){
    const tabId = normalizeTabId(options.tabId);
    const componentType = resolveComponentType(tabId, options.componentType);
    const reportModel = options.reportModel && typeof options.reportModel === 'object'
      ? clone(options.reportModel)
      : null;
    if(!tabId || !reportModel || typeof reportModel !== 'object') return false;
    if(!normalizeModel(reportModel, tabId, componentType)){
      reportByTab.delete(tabId);
      pendingRenders.delete(tabId);
      if(options.scheduleRender !== false){
        scheduleRender(tabId, { componentType });
      }
      debug('rejectedInvalidReport', { tabId, componentType });
      return false;
    }
    reportByTab.set(tabId, { componentType, reportModel });
    if(options.scheduleRender === false){
      pendingRenders.delete(tabId);
    }else{
      scheduleRender(tabId, { componentType, reportModel });
    }
    return true;
  }

  function clearReportModel(tabId){
    const key = normalizeTabId(tabId);
    if(!key) return false;
    reportByTab.delete(key);
    // A pending render may still carry the report that has just been cleared.
    // Remove it before scheduling the empty projection; otherwise the merge
    // logic can resurrect stale statistics after a new report starts.
    pendingRenders.delete(key);
    scheduleRender(key);
    return true;
  }

  function disposeTab(tabLike, meta = {}){
    const key = normalizeTabId(meta.tabId || tabLike?.id || tabLike);
    if(!key) return false;
    const hadReport = reportByTab.delete(key);
    const hadResizeState = resizingTabs.delete(key);
    const hadPendingRender = pendingRenders.delete(key);
    const hadState = hadReport || hadResizeState || hadPendingRender;
    debug('disposedTab', { tabId:key, hadState });
    return hadState;
  }

  function installLifecycleListener(){
    if(lifecycleInstalled || typeof global.addEventListener !== 'function') return;
    lifecycleInstalled = true;
    global.addEventListener('graphitix:lifecycle-event', event => {
      const detail = event?.detail || {};
      const action = String(detail.action || '');
      const tabId = normalizeTabId(detail.tabId);
      if(action === 'resize-phase'){
        if(!tabId || !reportByTab.has(tabId)) return;
        const phase = String(detail.phase || '').toLowerCase();
        const release = phase === 'end'
          || phase === 'reset'
          || phase === 'undo'
          || phase === 'redo'
          || phase === 'programmatic';
        const observedLayout = phase === 'observe';
        if(release || observedLayout){
          const wasResizing = resizingTabs.has(tabId);
          if(release) resizingTabs.delete(tabId);
          const componentType = detail.componentKey || detail.type || null;
          clearSummaryRenderedScale(resolveSvg(tabId, componentType));
          scheduleRender(tabId, {
            componentType,
            allowDuringResize: observedLayout && wasResizing
          });
          if(!release) return;
          const rerender = () => scheduleRender(tabId, { componentType });
          if(typeof global.requestAnimationFrame === 'function'){
            global.requestAnimationFrame(() => global.requestAnimationFrame(rerender));
          }else{
            global.setTimeout?.(rerender, 0);
          }
        }else if(phase === 'start' || phase === 'move' || phase === 'drag'){
          resizingTabs.add(tabId);
          const componentType = detail.componentKey || detail.type || null;
          const svg = resolveSvg(tabId, componentType);
          clearSummaryRenderedScale(svg);
          // Let the component's resize draw run first. Rebuilding the complete
          // table synchronously here competes with that draw and leaves stale
          // callbacks to run after the pointer is released.
          scheduleRender(tabId, { componentType, allowDuringResize:true });
        }
        return;
      }
      if(action !== 'draw-settled' && action !== 'draw-complete' && action !== 'restore-complete' && action !== 'activate-complete') return;
      if(!tabId || !reportByTab.has(tabId)) return;
      if(detail.details?.summaryProjectionHandled === true){
        return;
      }
      if(resizingTabs.has(tabId)){
        // Component resize draws replace the SVG contents and may remove the
        // summary group. Re-project after that draw has settled; doing it
        // before the draw is both wasteful and vulnerable to being overwritten.
        clearSummaryRenderedScale(resolveSvg(tabId, detail.componentKey || detail.type || null));
        scheduleRender(tabId, {
          componentType: detail.componentKey || detail.type || null,
          allowDuringResize:true
        });
        return;
      }
      clearSummaryRenderedScale(resolveSvg(tabId, detail.componentKey || detail.type || null));
      scheduleRender(tabId, { componentType: detail.componentKey || detail.type || null });
    });
    global.addEventListener('stats:pvalue-format-change', event => {
      const tabId = normalizeTabId(event?.detail?.tabId);
      if(tabId && reportByTab.has(tabId)) scheduleRender(tabId);
    });
    global.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if(!isSummaryStyleEvent(detail)) return;
      const tabId = normalizeTabId(detail.tabId || detail.workspaceTabId || null);
      if(!tabId || !reportByTab.has(tabId)) return;
      if(!summaryStyleChangesLayout(detail)) return;
      scheduleRender(tabId, { componentType: detail.scopeId || null });
    });
  }

  const api = Shared.statsFigureSummary = Shared.statsFigureSummary || {};
  api.DEFAULT_ENABLED = DEFAULT_ENABLED;
  api.registerReportModel = registerReportModel;
  api.clearReportModel = clearReportModel;
  api.beginGraphRedraw = beginGraphRedraw;
  api.renderForTab = renderForTab;
  api.scheduleRender = scheduleRender;
  api.isEnabled = isEnabled;
  api.setEnabledInSharedState = setEnabledInSharedState;
  api.resolveSvg = resolveSvg;
  api.formatCompactSummaryValue = formatCompactSummaryValue;
  api.COMPACT_P_VALUE_DISPLAY_FLOOR = COMPACT_P_VALUE_DISPLAY_FLOOR;
  api.normalizeModel = normalizeModel;
  api.compactNormalizedModel = compactNormalizedModel;
  api.getExportModel = getExportModel;
  api.isSummaryStyleEvent = isSummaryStyleEvent;
  api.summaryStyleChangesLayout = summaryStyleChangesLayout;
  api.disposeTab = disposeTab;
  api.__getReportForTab = tabId => clone(reportByTab.get(normalizeTabId(tabId)) || null);
  api.__clearRegistry = () => {
    reportByTab.clear();
    resizingTabs.clear();
    pendingRenders.clear();
  };

  installLifecycleListener();
  try{
    Shared.workspaceTabs?.registerSharedControlDisposer?.('statsFigureSummary', disposeTab);
  }catch(error){
    debug('disposerRegistrationFailed', { message:error?.message || String(error) });
  }
})(typeof window !== 'undefined' ? window : globalThis);
