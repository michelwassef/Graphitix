const fs = require('fs');
const path = require('path');

const rocSource = () => fs
  .readFileSync(path.join(__dirname, '../js/components/roc.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function sourceBlock(source, startMarker, endMarker = null, fallbackLength = 7000) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing source marker ${startMarker}`);
  if (endMarker) {
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (end < 0) throw new Error(`Missing boundary marker ${endMarker}`);
    return source.slice(start, end);
  }
  return source.slice(start, start + fallbackLength);
}

function functionBlock(source, name, nextName = null) {
  return sourceBlock(
    source,
    `  function ${name}`,
    nextName ? `  function ${nextName}` : null
  );
}

describe('ROC stats panel owner contract', () => {
  test('uses Line-style session/ref snapshots and discards disconnected DOM refs', () => {
    const source = rocSource();
    expect(source).toContain('function normalizeRocRefValue(value)');
    expect(source).toContain("value.nodeType && value.isConnected === false");
    expect(source).toContain('function createRocRefsSnapshot(source = {})');
    expect(source).toContain('function resolveRocRefsContext(session = null, options = {})');
    expect(source).toContain('function setRocSessionRefs(session = null, source = {}, options = {})');
    expect(source).toContain('statsAdvisor: null');
    expect(source).toContain("const statsAdvisor = ownerRoot?.querySelector?.('#rocStatsAdvisor') || null");
  });

  test('inactive session creation never borrows the projected sibling root', () => {
    const block = functionBlock(rocSource(), 'getRocSession(tabLike = null, meta = {}, options = {})', 'getRocWorkspaceActiveTabId()');
    expect(block).toContain("const projectedTabId = String(getRocProjectionTabId() || '').trim()");
    expect(block).toContain('root: projectedTabId === tabId ?');
    expect(block).not.toContain('root: resolveRocRoot(tabId || null)');
  });

  test('stats restore preserves the explicit owner through the panel target and report host', () => {
    const source = rocSource();
    const restore = functionBlock(source, 'restoreRocStatsPanelModel(model, options = {})', 'commitRocCompareStateToSession(');
    expect(restore).toContain('const session = ensureRocSessionOwnershipShape(options.session || getActiveRocSessionForState())');
    expect(restore).toContain('const rocRefs = resolveRocStatsRefsForSession(session, options)');
    expect(restore).toContain('Shared.statsReporting.restorePanelModel(statsResults, normalized');
    expect(restore).toContain('ensureRocStatsReportHost({ ...options, session, refs: rocRefs })');
    expect(restore).toContain('scheduleRocStatsReportOrderPin({ ...options, session, refs: rocRefs })');
    expect(restore).toContain('restoreOutcome?.restoredMain === true || restoreOutcome?.restoredReport === true');
    expect(restore).not.toContain('restorePanelModel(refs.statsResults');
  });

  test('matches Line by rejecting empty live captures instead of erasing a durable stats model', () => {
    const source = rocSource();
    const capture = functionBlock(source, 'captureRocStatsPanelModel(fallback = null, options = {})', 'rocStatsPanelModelHasContent(');
    expect(source).toContain('function rocStatsPanelModelHasContent(model)');
    expect(source).not.toContain('function rocStatsPanelNodeHasStatContent(node)');
    expect(source).toContain('function selectRocStatsPanelModel(...sources)');
    expect(capture).toContain('const normalizedCaptured = normalizeRocStatsPanelModel(captured)');
    expect(capture).toContain('rocStatsPanelModelHasContent(normalizedCaptured)');
    expect(source).toContain('return !!(normalized.resultsModel || normalized.reportModel)');
    expect(capture).toContain('? normalizedCaptured');
    expect(capture).toContain(': previous');
    expect(capture).not.toContain('normalizeRocStatsPanelModel(captured || previous)');
  });

  test('captures the live owner stats model at deactivation, tab-switch, payload, and runtime snapshot boundaries', () => {
    const source = rocSource();
    const deactivate = functionBlock(source, 'captureRocSessionForDeactivation(tab, meta = {})', 'syncRocSessionRefsFromActive(');
    expect(deactivate).toContain("reason: meta?.reason || 'deactivate-tab'");
    expect(deactivate).toContain('captureStatsPanel: true');

    const bind = functionBlock(source, 'bindRocSessionForTab(tabLike = null, meta = {}, options = {})', 'setRocSessionStateFromRuntimeRecord(');
    expect(bind).toContain("reason: meta?.reason || 'roc-session-switch-capture'");
    expect(bind).toContain('captureStatsPanel: true');

    const payload = sourceBlock(source, '  function getPayload(context = {})', '  roc.getPayload = getPayload;');
    expect(payload).toContain("reason: 'roc-get-payload-canonicalize'");
    expect(payload).toContain('captureStatsPanel: true');
    expect(payload).toContain('const statsPanelModel = selectRocStatsPanelModel(');

    const runtime = sourceBlock(source, '  roc.captureRuntimeState = function captureRocRuntimeState', '  roc.applyRuntimeState = function applyRocRuntimeState');
    expect(runtime).toContain("reason: meta?.reason || 'roc-runtime-capture'");
    expect(runtime).toContain('captureStatsPanel: true');
  });

  test('owner restore never falls back to the projected stats model or projected target', () => {
    const block = sourceBlock(
      rocSource(),
      '  function restoreRocStatsSurfaceFromOwner(owner = null)',
      '  roc.captureRenderCache = function captureRenderCache'
    );
    expect(block).toContain('const ownerRefs = resolveRocStatsRefsForSession(shaped');
    expect(block).toContain('return restoreRocStatsPanelModel(model, {');
    expect(block).toContain('session: shaped');
    expect(block).toContain('refs: ownerRefs');
    expect(block).not.toContain('|| state.statsPanelModel\n      || null');
  });

  test('advisor context, DOM, and persistence stay bound to the owning ROC session', () => {
    const source = rocSource();
    const advisor = functionBlock(source, 'renderRocStatsAdvisor(rawContext, options = {})', 'renderStatsControls(options = {})');
    expect(advisor).toContain('const session = ensureRocSessionOwnershipShape(options.session || getActiveRocSessionForState())');
    expect(advisor).toContain('const rocRefs = resolveRocStatsRefsForSession(session, options)');
    expect(advisor).toContain('const container = rocRefs.statsAdvisor || null');
    expect(advisor).toContain("persistRocTabState('roc-stats-advisor-toggle', session)");
    expect(advisor).toContain("persistRocTabState('roc-stats-advisor-answer', session)");
    expect(advisor).toContain("persistRocTabState('roc-stats-advisor-apply', session)");
    expect(advisor).toContain("persistRocTabState('roc-stats-advisor-reset', session)");
    expect(source).not.toContain('state.advisorContext');

    const payloadApply = sourceBlock(
      source,
      '  function applyRocPayload(payload, meta)',
      '  async function saveFile()'
    );
    expect(payloadApply).toContain('setRocAdvisorState(statsConfig.advisor || {}, payloadSession || scheduleTargetSession');
  });

  test('published derived results write through to the owning payload without invalidating the rendered frame', () => {
    const source = rocSource();
    const helper = functionBlock(source, "persistRocDerivedResultsToOwnerPayload(session = null, reason = 'roc-draw-results-published')", 'markRocOverlayPending(');
    expect(helper).toContain("const tab = tabId ? (tabs.find(item => item && String(item.id || '').trim() === tabId) || null) : null");
    expect(helper).toContain('compareResult: normalizeRocCompareResultModel(shaped.results?.compareResult || shaped.state?.compareResult || null)');
    expect(helper).toContain('resultsModel: panelModel.resultsModel || null');
    expect(helper).toContain('reportModel: panelModel.reportModel || null');
    expect(helper).toContain('sessionApi.updateTabPayload(tab, draft => {');
    expect(helper).toContain("origin: 'system'");
    expect(helper).toContain('renderEquivalent: true');

    const draw = sourceBlock(source, '  async function drawRoc(meta = {}, session = null)', '  // PART: PERSISTENCE');
    expect(draw).toContain("persistRocDerivedResultsToOwnerPayload(drawSession, 'roc-draw-results-published')");
    expect(draw.indexOf('framePublication.commit()')).toBeLessThan(draw.indexOf("persistRocDerivedResultsToOwnerPayload(drawSession, 'roc-draw-results-published')"));
  });

  test('delayed report ordering closes over the owner target instead of rediscovering active ROC DOM', () => {
    const block = functionBlock(rocSource(), 'scheduleRocStatsReportOrderPin(options = {})', 'normalizeRocStatsPanelModel(');
    expect(block).toContain('const statsResults = rocRefs.statsResults || null');
    expect(block).toContain('const run = () => pinRocStatsReportAfterMetrics(statsResults');
    expect(block).not.toContain("getRocNodeById('rocStatsResults')");
    expect(block).not.toContain('refs.statsResults');
  });

  test('draw obtains owner refs without merging the projected refs object', () => {
    const source = rocSource();
    const start = source.indexOf('  async function drawRoc(meta = {}, session = null)');
    const end = source.indexOf('  function scheduleRocDrawForSession', start);
    const block = source.slice(start, end > start ? end : start + 30000);
    expect(block).toContain('refreshRocActiveDomRefsForSession(drawSession');
    expect(block).toContain('const drawRefs = resolveRocRefsContext(drawSession, { allowFallback: false })');
    expect(block).toContain("getRocOwnedNodeById('rocStatsResults', drawTabId, { allowProjected: false })");
    expect(block).not.toContain('drawSession?.refs || {}, refs || {}');
    expect(block).not.toContain('setRocSessionRefs(drawSession, drawRefs, { applyActive: true })');
  });

  test('publishes the matching base frame and statistics before cooperative PR comparison work', () => {
    const source = rocSource();
    const draw = sourceBlock(source, '  async function drawRoc(meta = {}, session = null)', '  // PART: PERSISTENCE');
    const publication = draw.indexOf('publishCartesianLayout');
    const comparison = draw.indexOf('bootstrapCurveDiffCooperative');
    expect(publication).toBeGreaterThanOrEqual(0);
    expect(comparison).toBeGreaterThanOrEqual(0);
    expect(publication).toBeLessThan(comparison);
    expect(draw.indexOf('commitFrame: () => commitRocFrame()')).toBeLessThan(comparison);
    expect(draw.indexOf('renderRocStatsSummary(stats, graphType')).toBeLessThan(comparison);
    expect(draw.indexOf('captureRocStatsPanelModel(null, { session: drawSession')).toBeLessThan(comparison);
    expect(draw.indexOf('drawSession.state.statsPanelSignature = state.statsPanelSignature')).toBeLessThan(comparison);
    expect(draw).toContain('drawGeneration: meta?.drawGeneration');
  });

  test('renders one owner-scoped comparison card for valid multi-curve ROC and PR results', () => {
    const source = rocSource();
    const comparison = functionBlock(source, 'renderRocComparisonStatsPanel(stats, graphType, diffResult, options = {})', 'appendRocReportPanel');
    expect(comparison).toContain('stats.length < 2');
    expect(comparison).toContain('isRocStatsPublicationCurrent(session, normalizedGraphType, options)');
    expect(comparison).toContain("section: 'comparisons'");
    expect(comparison).toContain("className: 'roc-curve-comparison-card'");
    expect(comparison).toContain("const metricLabel = normalizedGraphType === 'roc' ? 'ΔAUC' : 'ΔAP';");
    expect(comparison).toContain("caption: 'Curve comparison'");
    expect(comparison).toContain('statsResults.insertBefore(rendered.wrapper, statsResults.firstChild || null)');
    expect(source).toContain('populateRocCompareOptions(seriesNames, ownerSession = null)');
    expect(source).toContain('commitRocCompareStateToSession(session, {');
    expect(source).not.toContain("state.compareResult.textContent");
  });

  test('does not retain a comparison result when the loaded curves or selected pair are not comparable', () => {
    const source = rocSource();
    const options = functionBlock(source, 'populateRocCompareOptions(seriesNames, ownerSession = null)', 'ensureLabelColors');
    expect(options).toContain('const hasLoadedSeries = names.length > 0;');
    expect(options).toContain('const selectionChanged = hasLoadedSeries');
    expect(options).toContain('const compareResult = !hasLoadedSeries');
    const clear = functionBlock(source, 'clearPlotArea(reason, options = {})', 'updateFontSizeLabel');
    expect(clear).toContain('state.compareResultModel = null;');
    expect(clear).toContain('session.results = createDefaultRocResultsState({');
    expect(clear).toContain('compareResult: null');
  });

  test('render cache restore requires durable stats restoration when a stats model exists', () => {
    const source = rocSource();
    const start = source.indexOf('  roc.restoreRenderCache = function restoreRenderCache');
    const end = source.indexOf('  roc.__testHooks', start);
    const block = source.slice(start, end);
    expect(block).toContain('const requiresStatsRestore = rocStatsPanelModelHasContent(');
    expect(block).toContain('const statsRestored = requiresStatsRestore ? restoreRocStatsSurfaceFromOwner(owner) : true');
    expect(block).toContain('return visuallyReady && (!requiresStatsRestore || statsRestored)');
  });
});
