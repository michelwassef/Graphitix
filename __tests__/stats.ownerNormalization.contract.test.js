const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function expectAll(source, patterns, label) {
  patterns.forEach(pattern => {
    if (!pattern.test(source)) {
      throw new Error(`${label}: missing ${String(pattern)}`);
    }
  });
}

function expectNone(source, patterns, label) {
  patterns.forEach(pattern => {
    if (pattern.test(source)) {
      throw new Error(`${label}: forbidden ${String(pattern)}`);
    }
  });
}

describe('cross-component statistics ownership normalization', () => {
  test('PCA carries one explicit owner through summary/results capture and restore', () => {
    const source = read('js/components/pca.js');
    expectAll(source, [
      /function resolvePcaStatsPanelContext\(options = \{\}\)/,
      /canUseLiveProjection = !session \|\| isPcaSessionActiveForModuleState\(session\)/,
      /summaryTarget: resolveTarget\('statsSummary', 'pcaStatsSummary'\)/,
      /resultsTarget: resolveTarget\('statsResults', 'pcaStatsResults'\)/,
      /if\(!context\.canUseLiveProjection\)\{\s*return previous;/,
      /setPcaStatsPanelResultsState\(durable, context\.session, \{ mirrorActive: false \}\)/,
      /function ensurePcaReportHost\(session = null\)[\s\S]{0,420}const target = context\.resultsTarget;[\s\S]{0,420}reporting\.ensureReportHost\(target,/ ,
      /captureStatsPanelForOwner:/,
      /restoreStatsPanelForOwner:/
    ], 'PCA');
  });

  test('Heatmap, Histogram, and Surface make durable stats models authoritative over cached stats DOM', () => {
    const heatmap = read('js/components/heatmap.js');
    expectAll(heatmap, [
      /function resolveHeatmapStatsPanelContext\(session = null\)/,
      /context\.canUseLiveProjection \? state\.statsPanelModel : null/,
      /heatmapStatsPanelModelHasContent\(captured\) \? captured : previous/,
      /durableStatsModel = normalizeHeatmapStatsPanelModel/,
      /restoreHeatmapStatsPanelModel\(durableStatsModel, restoreSession\)/,
      /else if\(cache\.stats\)\{\s*restoredStats = restoreChildren\(stats, cache\.stats\)/,
      /captureStatsPanelForOwner:/,
      /restoreStatsPanelForOwner:/
    ], 'Heatmap');
    expectNone(heatmap, [
      /capturePanelModel\(state\.statsEl\)/
    ], 'Heatmap');

    const hist = read('js/components/hist.js');
    expectAll(hist, [
      /function resolveHistStatsPanelContext\(session = null\)/,
      /context\.canUseLiveProjection \? state\.lastStatsPanelModel : null/,
      /histStatsPanelModelHasContent\(captured\) \? captured : previous/,
      /durableStatsModel = normalizeHistStatsPanelModel/,
      /restoreHistStatsPanelModel\(durableStatsModel, owner\)/,
      /else if\(cache\.stats\)\{\s*restoredStats = restoreChildren\(stats, cache\.stats\)/,
      /captureStatsPanelForOwner:/,
      /restoreStatsPanelForOwner:/
    ], 'Histogram');

    const surface = read('js/components/surface.js');
    expectAll(surface, [
      /function resolveSurfaceStatsPanelContext\(session = null\)/,
      /context\.canUseLiveProjection \? state\.statsPanelModel : null/,
      /surfaceStatsPanelModelHasContent\(captured\) \? captured : previous/,
      /durableStatsModel = normalizeSurfaceStatsPanelModel/,
      /restoreSurfaceStatsPanelModel\(durableStatsModel, cacheSession\)/,
      /else if\(cache\.stats\)\{\s*restoredStats = restoreChildren\(state\.statsEl, cache\.stats\)/,
      /captureStatsPanelForOwner:/,
      /restoreStatsPanelForOwner:/
    ], 'Surface');
    expectNone(surface, [
      /capturePanelModel\(state\.statsEl\)/
    ], 'Surface');
  });

  test('Survival owns all four panels, preserves detached Cox reporting, and persists advisor mutations', () => {
    const source = read('js/components/survival.js');
    expectAll(source, [
      /function resolveSurvivalStatsPanelContext\(session = null\)/,
      /summary: resolveTarget\('statsSummary', 'survivalStatsSummary'\)/,
      /logRank: resolveTarget\('statsLogRank', 'survivalStatsLogRank'\)/,
      /hazardRatios: resolveTarget\('statsHazardRatios', 'survivalStatsHazardRatios'\)/,
      /cox: resolveTarget\('statsCox', 'survivalStatsCox'\)/,
      /attachToTarget: false/,
      /context\.canUseLiveProjection \? state\.statsPanelModels : null/,
      /if\(!context\.canUseLiveProjection\)\{\s*return false;/,
      /function persistSurvivalStatsTabState/,
      /persistOwnedUserState\?\.\(\s*'survival'/,
      /persistSurvivalStatsTabState\('survival-stats-advisor-toggle', advisorSession\)/,
      /persistSurvivalStatsTabState\('survival-stats-advisor-apply', advisorSession\)/,
      /captureStatsPanelForOwner:/,
      /restoreStatsPanelForOwner:/
    ], 'Survival');
  });

  test('Pie separates owner settings/advisor/results and never projects an inactive runtime owner', () => {
    const source = read('js/components/pie.js');
    expectAll(source, [
      /function resolvePieStatsOwnerContext\(session = null\)/,
      /stats: normalizePieStatsSettings\(src\.stats \|\| \{\}\)/,
      /advisor: normalizePieAdvisorState\(source\.advisor \|\| \{\}\)/,
      /function createDefaultPieResultsState\(source = \{\}\)[\s\S]{0,180}statsDataModel:[\s\S]{0,180}statsPanelModel:/,
      /const ownerSettings = normalizePieStatsSettings\(context\.owner\?\.state\?\.stats \|\| \{\}\)/,
      /context\.owner\.state\.stats = settings;/,
      /context\.owner\.advisor = advisor;/,
      /statsPanelModel: panelModel/,
      /if\(context\.owner && !context\.canUseLiveProjection\)\{\s*return false;/,
      /if\(applySession && !canProjectOwner\)[\s\S]{0,900}inactive runtime snapshot stored without active projection/ ,
      /rememberPieStatsState\('advanced-toggle', \{ syncControls: false, session: ownerSession \}\)/,
      /rememberPieStatsState\('pie-advisor-toggle', \{ syncControls: false, session: advisorSession \}\)/,
      /requestPieStatsContextRefresh\('advisor-apply', \{ session: advisorSession \}\)/,
      /rememberPieStatsState\('pie-stats-compute-success', \{ syncControls: false, session: statsSession \}\)/,
      /exportPieStatsConfig\(ownerSession\)/
    ], 'Pie');
    expectNone(source, [
      /function createDefaultPieDurableState\(source = \{\}\)[\s\S]{0,1200}statsDataModel:/,
      /rememberPieStatsState\('advanced-toggle', \{ syncControls: false \}\)/
    ], 'Pie');
  });

  test('Venn significance capture cannot pull GO/STRING/significance state from the active sibling', () => {
    const source = read('js/components/venn.js');
    expectAll(source, [
      /function resolveVennSignificancePanelContext\(session = null\)/,
      /context\.canUseLiveProjection \? state\.analysis\.significancePanelModel : null/,
      /vennSignificancePanelModelHasContent\(captured\) \? captured : previous/,
      /if\(owner\?\.tabId && !isVennSessionActiveForModuleState\(owner\)\)\{\s*return createDefaultVennResultsState\(owner\.results \|\| \{\}\);/,
      /captureStatsPanelForOwner:/,
      /restoreStatsPanelForOwner:/
    ], 'Venn');
  });

  test('Box background statistics survive deactivation without gaining permission to touch sibling DOM', () => {
    const source = read('js/components/box.js');
    expectAll(source, [
      /function resolveBoxStatsPanelContext\(session = null\)/,
      /canUseLiveProjection = !!owner && isBoxSessionActiveForModuleState\(owner\)/,
      /createAsyncScope\('box-stats'\)/,
      /const isCurrentStatsComputationOwner = \(\) => \{/ ,
      /runtime\.ownerTabId = statsSession\?\.tabId \|\| null/ ,
      /captureBoxStatsResultsState\('box-stats-success', statsSession, \{ captureLivePanel: true \}\)/,
      /currentContext\.signature === context\.signature/,
      /Number\(currentContext\.version\) === Number\(context\.version\)/,
      /const storeDeferredStatsModel = model => \{/ ,
      /updateTabPayload\(ownerTabId, draft =>/,
      /function materializeDeferredBoxStatsModel/,
      /expectedVersion = Number\(results\.deferredContextVersion\) \|\| 0/,
      /contextDrifted = \(expectedSignature && context\.signature !== expectedSignature\)/,
      /box\.__statsAsyncScope\?\.cancelAllForTab\?\.\(tabId/,
      /box stats computation retained for inactive owner/
    ], 'Box');
    expectNone(source, [
      /const ownerMatchesActive =/,
      /captureBoxStatsPanelModel\(previous\.panelModel\)(?!,)/
    ], 'Box');
  });

  test('Scatter background statistics commit to their owner and preserve owner-local regression metadata', () => {
    const source = read('js/components/scatter.js');
    expectAll(source, [
      /function resolveScatterStatsPanelContext\(session = null\)/,
      /createAsyncScope\('scatter-stats'\)/,
      /function commitScatterComputedStats\(session, context, meta = \{\}\)/,
      /function runScatterStatsWorker\(payload, session = null\)[\s\S]{0,420}tabId = owner\?\.tabId \|\| null/,
      /markScatterRenderRuntimeDirty\(targetSession, 'scatter-payload-data-load'\)/,
      /setScatterSessionViewState\(targetSession, createScatterOwnedViewStateFromMirrors\(\)/,
      /useLivePanel === false[\s\S]{0,180}existing\.panelModel/,
      /lastRegressionSummary: cloneSimple\(context\.lastRegressionSummary\)/,
      /function persistScatterDerivedStatsToOwnerPayload/,
      /updateTabPayload\(tab, applyPatch/,
      /scatter\.__statsAsyncScope\?\.cancelAllForTab\?\.\(tabId/,
      /scatter stats computation retained for inactive owner|scatter stats worker stored for inactive owner/
    ], 'Scatter');
    expectNone(source, [
      /isSessionMetaCurrent\([^\n]*statsSessionMeta/
    ], 'Scatter');
  });
});
