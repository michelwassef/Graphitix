(function(global){
  'use strict';

  const api = global.GraphitixParameterIsolation = global.GraphitixParameterIsolation || {};
  const USER_ROOTS = Object.freeze({
    venn: ['config', 'style', 'analysis', 'notes', 'meta'],
    box: ['config', 'style', 'notes', 'meta'],
    scatter: ['config', 'style', 'notes', 'meta'],
    pca: ['config', 'style', 'notes', 'meta'],
    line: ['config', 'style', 'notes', 'meta'],
    heatmap: ['config', 'style', 'notes', 'meta'],
    surface: ['config', 'style', 'notes', 'meta'],
    roc: ['config', 'stats', 'style', 'notes', 'meta'],
    survival: ['config', 'style', 'notes', 'meta'],
    hist: ['config', 'style', 'notes', 'meta'],
    pie: ['config', 'style', 'notes', 'meta']
  });

  const DERIVED_PATH = /(?:^|\.)(?:results?|resultsModel|resultModel|reportModel|precomputed|summary|lastSummary|lastStats|statsPanelModel|annotationModel|assumptions|cache|signature|schemaVersion|payloadVersion|contextVersion|lastRunVersion|computedAt|updatedAt|savedAt|capturedAt|runtimeGeneration|fileHandle)(?:\.|$)/i;
  const DOCUMENT_METADATA_PATH = /(?:^|\.)(?:fileName|fileDisplayName|filePath|documentId)(?:\.|$)/i;
  const NON_PARAMETER_SELECTION_PATH = /(?:^|\.)(?:selectedRows|regionSelectValue)(?:\.|$)/i;
  const DERIVED_PROJECTION_PATH = /(?:^|\.)(?:colorSchemeUserOverride|legendAutoHidden)(?:\.|$)|(?:^|\.)(?:stats|analysis)\.version(?:\.|$)|(?:^|\.)rotation\.quaternion(?:\.|$)|(?:^|\.)labelPositions?\.[^.]+\.(?:relX|relY|originX|originY)(?:\.|$)/i;
  const LEGACY_DERIVED_ALIAS_PATH = /^config\.showIntervals$/i;
  const META_TECHNICAL_PATH = /^meta\.graphSizing\.(?:version|export(?:\..+)?|display\.(?:defaultWidthPx|defaultHeightPx|minWidthPx|minHeightPx|maxWidthPx|maxHeightPx|aspectRatio|allowUnlimitedWidth|allowUnlimitedHeight))$/i;
  const VENN_DERIVED_ANALYSIS_PATH = /^analysis\.(?:goResult|goFormatted|goOrganism|goPerformed|stringSvg|stringEnrichment|stringPerformed|speciesIndicator|lastSignificance|significancePanelModel)(?:\.|$)/i;
  const RESULT_PAGINATION_PATH = /(?:^|\.)(?:goLimit|stringLimit)(?:\.|$)/i;
  const OPTIONAL_INACTIVE_OVERRIDE_PATH = /(?:^|\.)(?:globalShape|shapeGlobalStyle|connectionLineStyle)(?:\.|$)/i;
  const STATS_DERIVED_PATH = /(?:^|\.)stats\.(?:contextSignature|report|resultsModel|summaryModel|tableModel)(?:\.|$)/i;
  const MAX_DOM_TEXT = 120;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const pathKey = path => path.map(part => typeof part === 'number' ? `[${part}]` : part).join('.');
  const lowerPath = path => path.map(part => String(part).toLowerCase()).join('.');
  const leafName = path => String(path[path.length - 1] ?? '');
  const getAtPath = (object, path) => path.reduce((value, part) => value == null ? undefined : value[part], object);
  const setAtPath = (object, path, value) => {
    if(!object || typeof object !== 'object' || !Array.isArray(path) || !path.length) return false;
    let cursor = object;
    for(let index = 0; index < path.length - 1; index += 1){
      const part = path[index];
      const nextPart = path[index + 1];
      if(!cursor[part] || typeof cursor[part] !== 'object'){
        cursor[part] = typeof nextPart === 'number' ? [] : {};
      }
      cursor = cursor[part];
    }
    cursor[path[path.length - 1]] = clone(value);
    return true;
  };

  function normalizeComparable(value){
    if(value === null || value === undefined) return value;
    if(typeof value === 'boolean') return value;
    if(typeof value === 'number') return Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
    if(typeof value === 'string'){
      const trimmed = value.trim();
      if(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)){
        const numeric = Number(trimmed);
        if(Number.isFinite(numeric)) return Number(numeric.toPrecision(12));
      }
      if(/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed.toLowerCase();
      return value;
    }
    return value;
  }

  function equivalent(actual, expected){
    return same(normalizeComparable(actual), normalizeComparable(expected));
  }

  function explicitClassification(path, value){
    const key = pathKey(path);
    if(VENN_DERIVED_ANALYSIS_PATH.test(key)) return 'derived-analysis';
    if(RESULT_PAGINATION_PATH.test(key)) return 'result-pagination-state';
    if((value === null || value === undefined) && OPTIONAL_INACTIVE_OVERRIDE_PATH.test(key)) return 'inactive-optional-override';
    if((value === null || value === undefined) && /(?:MajorTickLength|TickInterval)[XYZ]?$/i.test(key)) return 'inactive-optional-override';
    if((value === null || value === undefined) && /(?:^|\.)labelPositions?\.(?:title|xLabel|yLabel|zLabel|legend|stats)$/i.test(key)) return 'inactive-optional-label-position';
    if((value === null || value === undefined) && /(?:^|\.)dotSizeOverrideRaw$/i.test(key)) return 'inactive-optional-size-override';
    if(STATS_DERIVED_PATH.test(key)) return 'derived-statistics-projection';
    if(LEGACY_DERIVED_ALIAS_PATH.test(key)) return 'derived-compatibility-alias';
    if(/Signature(?:\.|$)/i.test(key)) return 'derived-signature';
    if(DERIVED_PATH.test(key)) return 'derived';
    if(DOCUMENT_METADATA_PATH.test(key)) return 'document-metadata';
    if(NON_PARAMETER_SELECTION_PATH.test(key)) return 'selection-state-not-parameter';
    if(DERIVED_PROJECTION_PATH.test(key)) return 'derived-projection';
    if(META_TECHNICAL_PATH.test(key)) return 'technical-meta';
    return null;
  }

  function collectLeaves(value, path, output, classified){
    const reason = explicitClassification(path, value);
    if(reason){
      classified.push({ path: pathKey(path), reason });
      return;
    }
    if(Array.isArray(value)){
      if(/(?:^|\.)(?:selectedColumns|distributions\.selected)$/i.test(pathKey(path))){
        output.push({ path, key: pathKey(path), before: clone(value) });
        return;
      }
      if(!value.length){
        classified.push({ path: pathKey(path), reason: 'empty-user-collection' });
        return;
      }
      value.forEach((entry, index) => collectLeaves(entry, path.concat(index), output, classified));
      return;
    }
    if(value && typeof value === 'object'){
      const keys = Object.keys(value).sort();
      if(!keys.length){
        classified.push({ path: pathKey(path), reason: 'empty-user-object' });
        return;
      }
      keys.forEach(key => collectLeaves(value[key], path.concat(key), output, classified));
      return;
    }
    output.push({ path, key: pathKey(path), before: clone(value) });
  }

  function getWorkspace(){
    return global.Main?.session?.workspaceState || null;
  }

  function getTab(tabId){
    return (getWorkspace()?.tabs || []).find(tab => tab && String(tab.id) === String(tabId)) || null;
  }

  function captureTabLocator(tabId, type = null){
    const tab = getTab(tabId);
    if(!tab) return null;
    const componentType = String(type || tab.type || '').trim();
    const peers = (getWorkspace()?.tabs || []).filter(candidate => candidate
      && !candidate.isWelcome
      && String(candidate.type || '') === componentType);
    return {
      type: componentType,
      title: String(tab.title || ''),
      ordinal: Math.max(0, peers.indexOf(tab))
    };
  }

  function resolveTabLocator(locator){
    if(!locator?.type) return null;
    const peers = (getWorkspace()?.tabs || []).filter(tab => tab
      && !tab.isWelcome
      && String(tab.type || '') === String(locator.type));
    const byTitle = peers.filter(tab => String(tab.title || '') === String(locator.title || ''));
    if(byTitle.length === 1) return byTitle[0];
    if(Number.isInteger(locator.ordinal) && locator.ordinal >= 0 && locator.ordinal < peers.length){
      return peers[locator.ordinal];
    }
    return peers.length === 1 ? peers[0] : null;
  }

  function getComponent(type){
    return global.Main?.components?.registry?.[type] || global.Components?.[type] || null;
  }

  function getMountedRoot(tabId, type){
    return global.Shared?.workspaceTabs?.getMountedRoot?.(tabId, type) || null;
  }

  async function settle(ms = 90){
    await new Promise(resolve => global.requestAnimationFrame(() => global.requestAnimationFrame(resolve)));
    if(ms > 0) await new Promise(resolve => global.setTimeout(resolve, ms));
  }

  function requireOwnerTab(tabId, type = null, reason = 'parameter-isolation-owner'){
    const tab = getTab(tabId);
    if(!tab) throw new Error(`${reason}: owner tab ${tabId || 'none'} is not present in the workspace`);
    if(type && String(tab.type || '') !== String(type)){
      throw new Error(`${reason}: owner tab ${tabId} has type ${tab.type || 'none'}, expected ${type}`);
    }
    const activeId = String(getWorkspace()?.activeTabId || '');
    if(activeId !== String(tab.id)){
      throw new Error(`${reason}: owner tab ${tab.id} is not active (active=${activeId || 'none'})`);
    }
    return tab;
  }

  async function activateTab(tabId, reason = 'parameter-isolation-activate'){
    const tabs = global.Main?.tabs;
    if(!tabs?.activateTab) throw new Error('Main.tabs.activateTab unavailable');
    const target = getTab(tabId);
    if(!target) throw new Error(`${reason}: cannot activate missing owner tab ${tabId || 'none'}`);
    const result = tabs.activateTab(target.id, { reason });
    if(result && typeof result.then === 'function') await result;
    await settle(100);
    return requireOwnerTab(target.id, target.type || null, reason);
  }

  function persistOwner(type, tabId, reason){
    const tab = requireOwnerTab(tabId, type, reason);
    const persist = global.Main?.session?.persistActiveTabState;
    if(typeof persist !== 'function') throw new Error('Main.session.persistActiveTabState unavailable');
    // persistActiveTabState() returns whether the canonical payload/layout changed,
    // not whether the operation succeeded. A clean owner or an intentionally skipped
    // live capture therefore returns false on a valid no-op path. Parameter isolation
    // must judge correctness from the owner payload/session assertions, never this
    // change-indicator boolean.
    persist(tab, {
      workspaces: global.Main.components.registry,
      previews: global.Main.previews,
      reason
    });
    const persistedTab = requireOwnerTab(tabId, type, `${reason}:post-persist`);
    if(!persistedTab.payload || typeof persistedTab.payload !== 'object'){
      throw new Error(`${reason}: owner ${tabId} has no canonical payload after persistence`);
    }
    return persistedTab;
  }

  function captureCanonicalPayload(type, tabId, reason){
    const tab = getTab(tabId);
    if(!tab) return null;
    // The stored tab payload is the durability contract. Do not call getPayload() here:
    // a fresh live-DOM capture could conceal a missing owner-first write-through by
    // repairing the payload from the current projection during the test itself.
    if(tab.payload && typeof tab.payload === 'object'){
      return clone(tab.payload);
    }
    const component = getComponent(type);
    return clone(component?.getPayload?.({ tab, tabId, reason, allowLiveCapture: false }) || null);
  }

  async function applyPayload(type, tabId, payload, reason, options = {}){
    const tab = await activateTab(tabId, `${reason}-activate`);
    await awaitOwnerReadyForSnapshot(type, tabId, `${reason}-pre-hydration-ready`);
    const component = getComponent(type);
    if(!component?.loadFromPayload) throw new Error(`${type}.loadFromPayload unavailable`);
    global.Shared?.workspaceTabs?.applySharedPayloadState?.(tab, type, payload, global.Main?.components?.get?.(type) || null, {
      tab,
      tabId,
      type,
      reason: `${reason}-shared-apply`
    });
    const result = component.loadFromPayload(clone(payload), {
      source: 'parameter-isolation',
      reason,
      tab,
      tabId,
      skipDraw: options.draw !== true,
      skipInitialDraw: options.draw !== true,
      suppressAutoDraw: options.draw !== true,
      suppressResizeDraw: options.draw !== true,
      suppressStatsRecompute: options.draw !== true,
      passiveControls: options.draw !== true
    });
    if(result && typeof result.then === 'function') await result;
    if(payload?.meta?.graphSizing){
      const root = getMountedRoot(tabId, type);
      const element = root?.querySelector?.('.svgbox') || null;
      global.Shared?.graphSizing?.applyPayloadSizingForType?.(type, payload, {
        context: `${reason}-graph-sizing`,
        element,
        tabId,
        isCurrent: () => String(getWorkspace()?.activeTabId || '') === String(tabId) && element?.isConnected !== false,
        retryDelaysMs: [0],
        forceExact: true
      });
    }
    await awaitOwnerReadyForSnapshot(type, tabId, `${reason}-post-hydration-ready`);
    persistOwner(type, tabId, `${reason}-persist`);
    return captureCanonicalPayload(type, tabId, `${reason}-capture`);
  }

  function controlTokens(path){
    return path.flatMap(part => String(part)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^a-z0-9]+/i)
      .map(token => token.toLowerCase())
      .filter(token => token.length > 1 && !/^(?:config|style|meta|display|analysis|notes|px)$/.test(token)));
  }

  const SEMANTIC_ALIASES = new Map([
    ['width', ['width', 'xlength']],
    ['widthpx', ['width', 'xlength']],
    ['height', ['height', 'ylength']],
    ['heightpx', ['height', 'ylength']],
    ['strokewidth', ['stroke-width', 'linewidth', 'thickness']],
    ['borderwidth', ['stroke-width', 'border', 'thickness']],
    ['fontsize', ['font-size', 'fontsize']],
    ['fontfamily', ['font-family', 'fontfamily']],
    ['fontweight', ['font-weight', 'fontweight']],
    ['fontstyle', ['font-style', 'fontstyle']],
    ['aspectlocked', ['aspect', 'lockratio', 'locked']],
    ['absenabled', ['filterabsenable']],
    ['sdenabled', ['filtersdenable']],
    ['significancethreshold', ['significance', 'threshold']],
    ['colors', ['fill', 'color']],
    ['fillcolors', ['fill', 'color']],
    ['bordercolors', ['stroke', 'border', 'color']],
    ['color', ['color', 'fill', 'stroke']],
    ['opacity', ['opacity', 'alpha']],
    ['alpha', ['alpha', 'α']],
    ['xlabel', ['xtitle', 'axis-title=x', 'labels.x']],
    ['ylabel', ['ytitle', 'axis-title=y', 'labels.y']],
    ['zlabel', ['ztitle', 'axis-title=z', 'labels.z']],
    ['alternative', ['hypothesis']],
    ['selectedcolumns', ['statcol', 'conditions']]
  ]);

  function semanticTerms(path){
    const terms = new Set(controlTokens(path));
    path.forEach(part => {
      const normalized = String(part).replace(/[^a-z0-9]+/gi, '').toLowerCase();
      if(normalized) terms.add(normalized);
    });
    Array.from(terms).forEach(term => {
      (SEMANTIC_ALIASES.get(term) || []).forEach(alias => terms.add(alias));
    });
    return terms;
  }

  function observableSemanticScore(key, path){
    const normalized = String(key || '').toLowerCase();
    const leaf = leafName(path).replace(/[^a-z0-9]+/gi, '').toLowerCase();
    const terms = semanticTerms(path);
    let score = 0;
    terms.forEach(term => {
      if(term && normalized.includes(term)) score += term === leaf ? 6 : 2;
    });
    return score;
  }

  function elementDescriptor(element, index){
    const attrs = ['id', 'name', 'class', 'data-setting', 'data-control', 'data-field', 'aria-label', 'title'];
    const label = element.closest?.('label');
    const labelText = label ? String(label.textContent || '').trim().slice(0, 160) : '';
    const group = element.closest?.('.form-row, .control-row, .box-stats-options__row, .box-stats-advanced__body, .box-stats-advanced, .stats-control-row, [data-setting-group]');
    const groupText = group ? String(group.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160) : '';
    const fieldsetLegend = element.closest?.('fieldset')?.querySelector?.(':scope > legend');
    const fieldsetText = fieldsetLegend ? String(fieldsetLegend.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) : '';
    const identity = attrs.map(name => String(element.getAttribute?.(name) || '')).filter(Boolean).concat(labelText, groupText, fieldsetText).join(' ');
    return { index, identity: identity.toLowerCase(), element };
  }

  function scoreControl(descriptor, path, current){
    const terms = semanticTerms(path);
    let semanticScore = 0;
    terms.forEach(token => {
      if(token && descriptor.identity.includes(token)) semanticScore += 5;
    });
    const el = descriptor.element;
    const pathText = lowerPath(path);
    if(el instanceof global.HTMLInputElement && el.type === 'color' && /color/.test(pathText)){
      semanticScore += 5;
    }
    let valueScore = 0;
    if(el instanceof global.HTMLInputElement){
      if(el.type === 'checkbox' && typeof current === 'boolean' && el.checked === current) valueScore += 4;
      else if(el.type !== 'checkbox' && equivalent(el.value, current)) valueScore += 4;
    }else if(el instanceof global.HTMLSelectElement || el instanceof global.HTMLTextAreaElement){
      if(equivalent(el.value, current)) valueScore += 4;
    }
    return { semanticScore, score: semanticScore + valueScore };
  }

  function findControl(root, path, current){
    if(!root?.querySelectorAll) return null;
    const controls = parameterControlCandidates(root)
      .map(({ element, index }) => elementDescriptor(element, index));
    const ranked = controls.map(item => ({ ...item, ...scoreControl(item, path, current) }))
      // A coincidentally equal primitive value is never enough to identify a control.
      .filter(item => item.semanticScore > 0 && (item.valueScore > 0 || item.semanticScore >= 10))
      .sort((a, b) => b.valueScore - a.valueScore || b.semanticScore - a.semanticScore || a.index - b.index);
    if(ranked[0]) return ranked[0];
    const exact = controls.map(item => ({ ...item, ...scoreControl(item, path, current) }))
      .filter(item => item.valueScore > 0);
    return exact.length === 1 ? exact[0] : null;
  }

  function numericConstraint(element, attribute){
    if(!element) return NaN;
    const raw = String(element.getAttribute?.(attribute) ?? '').trim();
    if(!raw || raw.toLowerCase() === 'any') return NaN;
    const value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  }

  function numericAlternative(value, element, key){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return undefined;
    const min = numericConstraint(element, 'min');
    const max = numericConstraint(element, 'max');
    const step = numericConstraint(element, 'step');
    const boundedUnitValue = /(?:opacity|alpha|ratio|fraction|threshold|level|spacing|transparency|(?:^|\.)q$)/i.test(key)
      && numeric >= 0 && numeric <= 1;
    const delta = Number.isFinite(step) && step > 0
      ? step
      : (boundedUnitValue ? 0.1 : (Number.isInteger(numeric) ? 1 : 1));
    let next;
    if(boundedUnitValue){
      next = numeric < 0.5 ? Math.min(1, numeric + Math.max(delta, 0.1)) : Math.max(0, numeric - Math.max(delta, 0.1));
    }else if(/(?:^|\.)(?:min|minimum|lower)$/i.test(key)){
      next = numeric - delta;
    }else if(/(?:^|\.)(?:max|maximum|upper)$/i.test(key)){
      next = numeric + delta;
    }else{
      next = numeric + delta;
      if(Number.isFinite(max) && next > max) next = numeric - delta;
      if(Number.isFinite(min) && next < min) next = numeric + delta;
    }
    if(Number.isFinite(min)) next = Math.max(min, next);
    if(Number.isFinite(max)) next = Math.min(max, next);
    if(next === numeric){
      next = Number.isFinite(min) && numeric !== min ? min : (Number.isFinite(max) && numeric !== max ? max : numeric + (delta || 1));
    }
    return next;
  }

  function enumAlternative(path, current){
    const key = leafName(path).toLowerCase();
    const value = String(current || '').toLowerCase();
    const maps = {
      notation: { auto: 'scientific', decimal: 'scientific', scientific: 'decimal' },
      notationx: { auto: 'scientific', decimal: 'scientific', scientific: 'decimal' },
      notationy: { auto: 'scientific', decimal: 'scientific', scientific: 'decimal' },
      pattern: { solid: 'dashed', dashed: 'dotted', dotted: 'solid', none: 'solid' },
      linepattern: { solid: 'dashed', dashed: 'dotted', dotted: 'solid', none: 'solid' },
      axisorigin: { zero: 'lower', lower: 'zero', custom: 'zero', auto: 'zero' },
      originmode: { zero: 'lower', lower: 'zero', custom: 'zero', auto: 'zero' },
      correction: { none: 'holm', holm: 'bonferroni', bonferroni: 'none', 'holm-sidak': 'bonferroni' },
      multiplecomparisons: { none: 'holm', holm: 'bonferroni', bonferroni: 'none' },
      criterion: { bic: 'aic', aic: 'bic' },
      fitmethod: { ols: 'theil-sen', 'theil-sen': 'ols' },
      regressionmode: { linear: 'quadratic', quadratic: 'linear' },
      mode: { auto: 'manual', manual: 'auto', linear: 'quadratic', quadratic: 'linear', all: 'custom', custom: 'all' },
      colors: { unified: 'individual', individual: 'unified' },
      colormode: { auto: 'solid', solid: 'density', density: 'auto', individual: 'auto', unified: 'individual' },
      graphType: { strip: 'box', box: 'violin', violin: 'strip' },
      graphtype: { strip: 'box', box: 'violin', violin: 'strip' },
      tableformat: { single: 'grouped', grouped: 'single' },
      pointmode: { none: 'overlay', overlay: 'side', side: 'outliers', outliers: 'none' },
      errormode: { both: 'upper', upper: 'both' },
      individualsummary: { 'median-point': 'mean-sem', 'mean-sem': 'median-point' },
      posthoc: { standard: 'tukey', gameshowell: 'standard', tukey: 'standard' },
      rule: { iqr15: 'iqr3', iqr3: 'sd', sd: 'custom', custom: 'iqr15' },
      colorscheme: { scientific: 'soft', soft: 'normal', normal: 'grayscale', grayscale: 'colorblind', colorblind: 'scientific', dark: 'scientific' },
      densitypalette: { viridis: 'plasma', plasma: 'viridis' },
      stattype: { auto: 'pearson', pearson: 'spearman', spearman: 'pearson' },
      method: { ols: 'huber', huber: 'ols', pearson: 'spearman', spearman: 'pearson', pca: 'mds', mds: 'pca' },
      diffmethod: { delong: 'bootstrap', bootstrap: 'delong', permutation: 'bootstrap' },
      singlerocpmethod: { auto: 'exact', exact: 'asymptotic', asymptotic: 'auto' },
      methodchoice: { delong: 'bootstrap', bootstrap: 'delong', permutation: 'bootstrap' },
      preprocessing: { none: 'rna-seq-normalized-log', 'rna-seq-normalized-log': 'none' },
      colorramp: { viridis: 'plasma', plasma: 'viridis' },
      interpolation: { grid: 'scatter', scatter: 'grid' },
      shape: { circle: 'diamond', diamond: 'square', square: 'circle', triangle: 'diamond' },
      display: { panels: 'overlay', overlay: 'panels' },
      arrangement: { vertical: 'grid', grid: 'vertical' },
      sort: { 'size-desc': 'degree-desc', 'degree-desc': 'size-desc', 'size-asc': 'degree-asc', 'degree-asc': 'size-asc' },
      activeresultstab: { go: 'string', string: 'go' },
      grouplayout: { interleaved: 'clustered', clustered: 'interleaved' },
      whiskermode: { adaptive: 'fixed', fixed: 'adaptive' },
      significancelabelmode: { decision: 'p', p: 'decision' },
      significancedisplay: { star: 'pvalue', pvalue: 'star' },
      legendheightmode: { 'match-heatmap': 'fixed', fixed: 'match-heatmap' },
      view: { 'corr-columns': 'values', 'corr-rows': 'values', values: 'corr-columns' },
      alternative: { 'two-sided': 'greater', greater: 'less', less: 'two-sided' },
      distributiondiagnostic: { 'normality-only': 'normal-vs-lognormal', 'normal-vs-lognormal': 'normality-only' },
      groupedanalysis: { twowayanova: 'rowRandomMixed', rowrandommixed: 'twoWayAnova' },
      groupedcomparisonscope: { groupswithincondition: 'conditionsWithinGroup', conditionswithingroup: 'groupsWithinCondition' },
      groupedmultiplicityfamily: { 'within-scope': 'global', global: 'within-scope' },
      effectparametric: { cohend: 'hedgesG', hedgesg: 'cohenD' },
      effectnonparametric: { rankbiserial: 'commonLanguage', commonlanguage: 'rankBiserial' },
      parametricvariant: { classic: 'welch', welch: 'classic' },
      omnibusparametricvariant: { classic: 'welch', welch: 'classic' },
      pairwiseparametricvariant: { classic: 'welch', welch: 'classic' },
      nonparametricvariant: { mannwhitney: 'kolmogorovSmirnov', kolmogorovsmirnov: 'mannWhitney' },
      normalitymethod: { 'shapiro-wilk': 'dagostino', dagostino: 'shapiro-wilk' },
      resamplingmode: { auto: 'monte-carlo', 'monte-carlo': 'auto' },
      resultstab: { overall: 'comparisons', comparisons: 'overall' },
      variancemethod: { 'brown-forsythe': 'bartlett', bartlett: 'brown-forsythe' },
      outliermode: { none: 'grubbs', grubbs: 'none' },
      speciesvalue: { '': 'hsapiens', hsapiens: 'mmusculus', mmusculus: 'hsapiens' },
      test: { parametric: 'nonparametric', nonparametric: 'parametric' }
    };
    const parent = path.length > 1 ? String(path[path.length - 2] || '').toLowerCase() : '';
    if(parent === 'dendrogram' && key === 'mode') return value === 'auto' ? 'fixed' : 'auto';
    if(parent === 'axislabelmodes' && value === 'auto') return 'manual';
    return maps[key]?.[value] ?? maps[`${parent}${key}`]?.[value];
  }

  function colorAlternative(path, current){
    let hash = 0x2468ac;
    pathKey(path).split('').forEach(char => {
      hash = (Math.imul(hash, 33) ^ char.charCodeAt(0)) >>> 0;
    });
    let value = `#${(hash & 0xffffff).toString(16).padStart(6, '0')}`;
    if(value.toLowerCase() === String(current || '').trim().toLowerCase()){
      value = `#${((hash ^ 0x5a5a5a) & 0xffffff).toString(16).padStart(6, '0')}`;
    }
    return value;
  }

  function buildAlternative(path, current, root){
    const key = lowerPath(path);
    if(key === 'config.loadingslimit' && Number.isFinite(Number(current))){
      const numeric = Math.max(1, Math.floor(Number(current)));
      return {
        covered: numeric > 1,
        value: numeric > 1 ? numeric - 1 : numeric,
        source: 'bounded-loadings-limit',
        controlIndex: null,
        controlDomKey: null,
        reason: numeric > 1 ? null : 'no-valid-alternative'
      };
    }
    if(/^config\.axismap\.[xyz]$/i.test(key) && Number.isInteger(current)){
      return { covered: true, value: (current + 1) % 3, source: 'surface-axis-permutation', controlIndex: null, controlDomKey: null };
    }
    if(typeof current === 'string' && ['circle','diamond','square','triangle','cross','plus'].includes(current.toLowerCase())){
      const shapes = ['circle','diamond','square','triangle','cross','plus'];
      return { covered: true, value: shapes[(shapes.indexOf(current.toLowerCase()) + 1) % shapes.length], source: 'shape-enum', controlIndex: null, controlDomKey: null };
    }
    if(typeof current === 'string' && String(path[path.length - 2] || '').toLowerCase() === 'labels'){
      return { covered: true, value: `${current}__tabB`, source: 'label-text', controlIndex: null, controlDomKey: null };
    }
    if(key === 'config.filters.sdthreshold'){
      return { covered: true, value: 0.5, source: 'heatmap-valid-sd-threshold', controlIndex: null, controlDomKey: null };
    }
    if(key === 'config.filters.absvalue'){
      return { covered: true, value: 0.5, source: 'heatmap-valid-absolute-threshold', controlIndex: null, controlDomKey: null };
    }
    if(key === 'config.positiveclass' && current === 1){
      return { covered: true, value: 0, source: 'binary-class-swap', controlIndex: null, controlDomKey: null };
    }
    if((key === 'config.adjust.centerrows' || key === 'config.adjust.centercolumns') && current == null){
      return { covered: true, value: 'mean', source: 'nullable-centering-mode', controlIndex: null, controlDomKey: null };
    }
    if((current === null || current === undefined) && /(?:^|\.)(?:tickinterval|majorticklength)\.[xy]$/i.test(key)){
      return { covered: true, value: 1, source: 'nullable-axis-number', controlIndex: null, controlDomKey: null };
    }
    if(key === 'config.traceopacity' && (current === null || current === undefined)){
      return { covered: true, value: 0.65, source: 'hist-valid-trace-opacity', controlIndex: null, controlDomKey: null };
    }
    let control = /^meta\.graphSizing\./i.test(pathKey(path)) ? null : findControl(root, path, current);
    if((current === null || current === undefined || (typeof current === 'number' && Number.isFinite(current)))
      && /(?:width|size|length|interval|spacing|thickness|alpha|level|count|iterations|multiplier)$/i.test(key)
      && !(control?.element instanceof global.HTMLInputElement && ['number', 'range'].includes(control.element.type))){
      control = parameterControlCandidates(root)
        .map(({ element, index }) => ({ ...elementDescriptor(element, index), ...scoreControl(elementDescriptor(element, index), path, current) }))
        .filter(item => item.element instanceof global.HTMLInputElement && ['number', 'range'].includes(item.element.type) && item.semanticScore > 0)
        .sort((left, right) => right.semanticScore - left.semanticScore || left.index - right.index)[0] || control;
    }
    const el = control?.element || null;
    const controlDomKey = el ? controlObservableKey(root, el) : null;
    if(Array.isArray(current) && /(?:^|\.)selectedColumns$/i.test(pathKey(path))){
      const next = current.length > 1 ? [current[0]] : (current.length === 1 ? [current[0] + 1] : [0]);
      return { covered: true, value: next, source: 'column-selection', controlIndex: control?.index ?? null, controlDomKey };
    }
    if(Array.isArray(current) && key === 'config.distributions.selected'){
      const next = current.includes('normal') ? current.filter(value => value !== 'normal') : current.concat('normal');
      return { covered: true, value: next, source: 'distribution-selection', controlIndex: null, controlDomKey: null };
    }
    if(typeof current === 'boolean') return { covered: true, value: !current, source: el?.type === 'checkbox' ? 'checkbox' : 'boolean', controlIndex: control?.index ?? null, controlDomKey };
    if(typeof current === 'number' && Number.isFinite(current)){
      const numericElement = el instanceof global.HTMLInputElement && ['number', 'range'].includes(el.type) ? el : null;
      const next = /(?:^|\.)labelpositions?\.[^.]+\.(?:x|y)$/i.test(key)
        ? current + 12
        : numericAlternative(current, numericElement, key);
      if(next !== undefined && !equivalent(next, current)) return { covered: true, value: next, source: numericElement ? 'numeric-control' : 'numeric', controlIndex: control?.index ?? null, controlDomKey: numericElement ? controlDomKey : null };
    }
    const explicitEnumCycles = {
      'config.stats.scope': { gof: 'all', all: 'reference', reference: 'custom', custom: 'gof' },
      'config.stats.test': { 'chi-square': 'g-test', 'g-test': 'auto', auto: 'chi-square' },
      'config.stats.advisor.answers.objective': { gof: 'compare', compare: 'gof' },
      'config.stats.advisor.answers.scope': { all: 'reference', reference: 'custom', custom: 'all' },
      'config.stats.advisor.answers.sparse': { no: 'yes', yes: 'unsure', unsure: 'no' },
      'config.advisor.answers.analysisfocus': { describe: 'compare', compare: 'adjust', adjust: 'describe' }
    };
    const explicitEnumValue = typeof current === 'string' ? explicitEnumCycles[key]?.[current.toLowerCase()] : undefined;
    if(explicitEnumValue !== undefined){
      return { covered: true, value: explicitEnumValue, source: 'component-enum-map', controlIndex: control?.index ?? null, controlDomKey };
    }
    if(key === 'config.stats.posthoc' && typeof current === 'string' && el instanceof global.HTMLSelectElement && /^boxStatsPostHoc$/i.test(String(el.id || ''))){
      const option = Array.from(el.options).find(candidate => !candidate.disabled && String(candidate.value) !== String(el.value));
      if(option) return { covered: true, value: String(option.value), source: 'context-valid-select', controlIndex: control.index, controlDomKey };
    }
    const mappedEnumValue = typeof current === 'string' ? enumAlternative(path, current) : undefined;
    if(mappedEnumValue !== undefined) return { covered: true, value: mappedEnumValue, source: 'enum-map', controlIndex: control?.index ?? null, controlDomKey };
    if(el instanceof global.HTMLSelectElement){
      const options = Array.from(el.options).filter(option => !option.disabled && String(option.value) !== String(el.value));
      if(options.length){
        const raw = options[0].value;
        return { covered: true, value: raw, source: 'select', controlIndex: control.index, controlDomKey };
      }
    }
    if(typeof current === 'string' && el instanceof global.HTMLInputElement && el.type === 'radio'){
      const name = String(el.name || '').trim();
      const radios = name
        ? Array.from(root.querySelectorAll('input[type="radio"]')).filter(candidate => String(candidate.name || '') === name && !candidate.disabled)
        : [el];
      const alternative = radios.find(candidate => String(candidate.value) !== String(current));
      if(alternative){
        return { covered: true, value: String(alternative.value), source: 'radio', controlIndex: control.index, controlDomKey };
      }
    }
    if(typeof current === 'string' && /^#[0-9a-f]{3,8}$/i.test(current.trim())){
      return { covered: true, value: colorAlternative(path, current), source: el instanceof global.HTMLInputElement && el.type === 'color' ? 'color-control' : 'color', controlIndex: control?.index ?? null, controlDomKey };
    }
    if(typeof current === 'string'){
      const trimmed = current.trim();
      if(trimmed === '' && el instanceof global.HTMLInputElement && ['number', 'range'].includes(el.type)){
        const next = numericAlternative(Number(el.value || el.min || 0), el, key);
        return { covered: true, value: String(next), source: 'empty-numeric-control', controlIndex: control.index, controlDomKey };
      }
      if(el instanceof global.HTMLInputElement && el.type === 'color'){
        return { covered: true, value: colorAlternative(path, current), source: 'color-control', controlIndex: control.index, controlDomKey };
      }
      if(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)){
        const next = numericAlternative(Number(trimmed), el, key);
        if(next !== undefined && !equivalent(next, current)) return { covered: true, value: String(next), source: el ? 'numeric-control-string' : 'numeric-string', controlIndex: control?.index ?? null, controlDomKey };
      }
      if(/^#[0-9a-f]{3,8}$/i.test(trimmed) || /color$/i.test(leafName(path))){
        return { covered: true, value: colorAlternative(path, current), source: 'color', controlIndex: control?.index ?? null, controlDomKey };
      }
      if(el && !(el instanceof global.HTMLSelectElement)){
        return { covered: true, value: `${current || leafName(path)}__tabB`, source: 'text-control', controlIndex: control.index, controlDomKey };
      }
      if(/(?:title|subtitle|label|text|note|caption|prefix|suffix)$/i.test(leafName(path))){
        return { covered: true, value: `${current || leafName(path)}__tabB`, source: 'text', controlIndex: control?.index ?? null, controlDomKey };
      }
    }
    if(current === null || current === undefined){
      if(el instanceof global.HTMLInputElement && ['number', 'range'].includes(el.type)){
        const next = numericAlternative(Number(el.value || 0), el, key);
        return { covered: true, value: next, source: 'nullable-numeric-control', controlIndex: control.index, controlDomKey };
      }
      if(el instanceof global.HTMLInputElement && el.type === 'checkbox') return { covered: true, value: true, source: 'nullable-checkbox', controlIndex: control.index, controlDomKey };
    }
    return { covered: false, reason: 'no-valid-alternative' };
  }

  function isPersistentParameterControl(element){
    if(!element || element.disabled) return false;
    const type = String(element.type || '').toLowerCase();
    if(['file', 'hidden', 'button', 'submit', 'reset', 'image'].includes(type)) return false;
    if(element.closest?.('[hidden]')) return false;
    if(element.closest?.('.ag-root, .ag-popup, [role="grid"], [data-parameter-isolation-ignore="true"]')) return false;
    return true;
  }

  function nonParameterControlReason(element){
    const id = String(element?.id || '').trim();
    const identity = [id, element?.name, element?.className, element?.getAttribute?.('aria-label')]
      .map(value => String(value || ''))
      .join(' ');
    const labelText = String(element?.closest?.('label')?.textContent || '');
    const semanticIdentity = `${identity} ${labelText}`;
    if(/\bautosave\b/i.test(semanticIdentity)) return 'workspace-action-control';
    if(/workspace-toolbar__transform/i.test(identity)) return 'data-transform-action';
    if(/transform.*(?:multimode|customexpr)/i.test(semanticIdentity)
      || (/publication/i.test(semanticIdentity) && /preset/i.test(semanticIdentity))) return 'action-control';
    if(element?.matches?.('.export-select, .resizer-zoom-input, [data-publication-preset], [data-publication-style-select]')
      || element?.closest?.('[data-publication-preset], [data-publication-style-fieldset]')) return 'action-control';
    if(/^(?:label[ABC]|list[ABC]|n(?:A|B|C|AB|AC|BC|ABC))$/i.test(id)) return 'data-entry-control';
    if(/^regionSelect$/i.test(id)) return 'analysis-result-selection';
    if(/^pcaPreprocessing$/i.test(id)) return 'derived-active-data-view-control';
    if(/^(?:box|pca)GroupedReplicates$/i.test(id)) return 'inactive-table-format-control';
    if(/^upset/i.test(id)) return 'inactive-plot-toolbar-control';
    if(/^boxViolin/i.test(id)) return 'inactive-plot-toolbar-control';
    if(/^scatter(?:InitialValues|ParameterConstraints|GlobalFit)Json$/i.test(id) && String(element?.value || '').trim() === '') return 'inactive-optional-fit-override';
    if(/^(?:histDist_|pieStatCol|statcol)/i.test(id)) return 'collection-projection-control';
    return null;
  }

  function persistentParameterControls(root){
    if(!root?.querySelectorAll) return [];
    return Array.from(root.querySelectorAll('input, select, textarea')).filter(isPersistentParameterControl);
  }

  function domObservableControlEntries(root){
    if(!root?.querySelectorAll) return [];
    const selector = 'input,select,textarea,details,[aria-pressed],[aria-checked],[aria-selected],[contenteditable="true"],[data-parameter-p-value-scientific]';
    const rootControls = Array.from(root.querySelectorAll(selector));
    const externalControls = Array.from(global.document?.querySelectorAll?.(selector) || [])
      .filter(element => !root.contains(element)
        && !element.closest?.('[hidden]')
        && element.getClientRects?.().length > 0);
    return rootControls.concat(externalControls).map((element, index) => ({
      element,
      index,
      external: !root.contains(element)
    }));
  }

  function parameterControlCandidates(root){
    return domObservableControlEntries(root)
      .filter(entry => (entry.element instanceof global.HTMLInputElement
        || entry.element instanceof global.HTMLSelectElement
        || entry.element instanceof global.HTMLTextAreaElement)
        && isPersistentParameterControl(entry.element));
  }

  function readControlPrimitive(element){
    if(element instanceof global.HTMLInputElement && element.type === 'checkbox'){
      return !!element.checked;
    }
    if(element instanceof global.HTMLInputElement && element.type === 'radio'){
      return element.checked ? String(element.value ?? '') : null;
    }
    return 'value' in element ? String(element.value ?? '') : undefined;
  }

  function auditPersistentControlCoverage(root, parameters){
    const seenRadioNames = new Set();
    return persistentParameterControls(root).map((element, index) => elementDescriptor(element, index)).flatMap(descriptor => {
      const classifiedReason = nonParameterControlReason(descriptor.element);
      if(classifiedReason) return [];
      if(descriptor.element instanceof global.HTMLInputElement && descriptor.element.type === 'radio'){
        const name = String(descriptor.element.name || '').trim();
        if(name && seenRadioNames.has(name)) return [];
        if(name) seenRadioNames.add(name);
      }
      const current = readControlPrimitive(descriptor.element);
      const mapped = parameters.some(parameter => {
        const scored = scoreControl(descriptor, parameter.path, parameter.before);
        return scored.semanticScore > 0 && (equivalent(current, parameter.before) || scored.semanticScore >= 10);
      });
      if(mapped){
        return [];
      }
      const identity = String(descriptor.identity || '').trim();
      return [{
        path: `control:${identity || `${descriptor.element.tagName.toLowerCase()}@${descriptor.index}`}`,
        reason: 'persistent-control-not-mapped-to-canonical-parameter',
        value: clone(current)
      }];
    });
  }

  function applyLogicalParameterMutation(payload, parameter, value){
    setAtPath(payload, parameter.path, value);
    const key = pathKey(parameter.path);
    const isAlternative = !equivalent(value, parameter.before);
    if(/(?:^|\.)colorScheme$/i.test(key) && typeof global.Shared?.colorSchemes?.applyToPayload === 'function'){
      const themed = global.Shared.colorSchemes.applyToPayload(payload.type, payload, value);
      if(themed && typeof themed === 'object'){
        Object.keys(payload).forEach(payloadKey => delete payload[payloadKey]);
        Object.assign(payload, themed);
      }
      if(payload.type === 'scatter' && payload.config){ payload.config.colorSchemeUserOverride = true; }
    }
    if(payload.type === 'box' && /^config\.(?:fill|border|colors(?:\.|$)|borderColors(?:\.|$))/i.test(key)){
      payload.config.colorScheme = 'custom';
    }
    if(payload.type === 'box' && isAlternative && key === 'config.tableFormat' && value === 'grouped'){
      const groupedExample = global.Shared?.exampleDatasets?.get?.('box', 'grouped');
      if(Array.isArray(groupedExample?.data)){
        payload.data = clone(groupedExample.data);
        payload.config.grouped = {
          ...(payload.config.grouped || {}),
          replicatesPerGroup: Number(groupedExample.meta?.replicatesPerGroup) || 3
        };
      }
    }
    if(payload.type === 'scatter'){
      const labelMatch = key.match(/^config\.([xyz])Label$/i);
      if(labelMatch){
        payload.config.axisLabelModes = payload.config.axisLabelModes && typeof payload.config.axisLabelModes === 'object'
          ? payload.config.axisLabelModes
          : {};
        payload.config.axisLabelModes[labelMatch[1].toLowerCase()] = 'manual';
      }
      if(key === 'config.showErrorBars' && value === true){
        payload.config.showGroupedReplicatePoints = false;
      }
      if(key === 'config.dotSizeOverrideEnabled' && value === true){
        const currentSize = Number(payload.config.dotSize);
        payload.config.dotSizeOverrideRaw = Number.isFinite(currentSize) ? currentSize : 3;
      }
    }
    const rotationMatch = key.match(/^(.*\.rotation)\.(x|y|z)$/i);
    if(rotationMatch){
      const rotationPath = rotationMatch[1].split('.');
      const rotation = getAtPath(payload, rotationPath);
      // Quaternion is a derived representation of the user-visible Euler rotation.
      // Removing it lets the component rebuild a coherent quaternion while only the
      // logical x/y/z parameter under test changes.
      if(rotation && typeof rotation === 'object') delete rotation.quaternion;
    }
    if(payload.type === 'line' && key === 'config.tableFormat'){
      payload.config.replicates = String(value).toLowerCase() === 'grouped'
        ? Math.max(2, Number(payload.config.replicates) || 2)
        : 1;
    }
    if(payload.type === 'heatmap' && key === 'config.showValues'){
      payload.config.showValuesUserOverride = true;
    }
    if(payload.type === 'heatmap' && isAlternative && key === 'config.filters.sdEnabled' && value === true){
      payload.config.filters.sdThreshold = 0;
    }
    if(payload.type === 'heatmap' && isAlternative && key === 'config.filters.sdThreshold'){
      payload.config.filters.sdEnabled = true;
    }
    if(payload.type === 'heatmap' && isAlternative && key === 'config.filters.absEnabled' && value === true){
      payload.config.filters.absValue = 0.5;
    }
    if(payload.type === 'heatmap' && isAlternative && /^config\.filters\.abs(?:Count|Value)$/i.test(key)){
      payload.config.filters.absEnabled = true;
    }
    if(payload.type === 'surface'){
      const settingsAlias = key.match(/^config\.settings\.(backgroundColor|colorScheme|textColor)$/i);
      if(settingsAlias) payload.config[settingsAlias[1]] = clone(value);
    }
    if(payload.type === 'roc' && isAlternative && key === 'config.positiveClass'){
      payload.config.negativeClass = parameter.before;
    }
    if(payload.type === 'roc' && isAlternative && key === 'config.negativeClass'){
      payload.config.positiveClass = parameter.before;
    }
    return payload;
  }

  function buildParameterVariantPayload(baseline, parameters, valueKey){
    const payload = clone(baseline);
    parameters.forEach(parameter => {
      applyLogicalParameterMutation(payload, parameter, parameter[valueKey]);
    });
    return payload;
  }

  function domNodeKey(element, index){
    const id = String(element.id || '').trim();
    if(id) return `#${id}`;
    const tag = element.tagName.toLowerCase();
    const semanticAttrs = [
      'data-setting', 'data-control', 'data-field', 'aria-label', 'name',
      'data-graph-title', 'data-axis-label', 'data-legend-key', 'data-layer',
      'data-font-role', 'data-box-axis-title', 'data-box-axis-tick', 'class',
      'data-parameter-key'
    ];
    for(const attr of semanticAttrs){
      const value = String(element.getAttribute?.(attr) || '').trim();
      if(value) return `${tag}[${attr}=${value}]`;
    }
    const associatedLabel = element.closest?.('label')
      || (id ? global.document?.querySelector?.(`label[for="${global.CSS?.escape ? global.CSS.escape(id) : id}"]`) : null)
      || element.closest?.('.box-stats-options__row, .box-stats-advanced__row, .stats-control-row, .control-row')?.querySelector?.('label');
    const labelText = String(associatedLabel?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if(labelText) return `${tag}[label=${labelText}]`;
    return `${tag}@${index}`;
  }

  function controlObservableKey(root, element){
    if(!root || !element) return null;
    const entry = domObservableControlEntries(root).find(candidate => candidate.element === element);
    if(!entry) return null;
    const key = `${entry.external ? 'active-ui:' : ''}${domNodeKey(element, entry.index)}`;
    if(element instanceof global.HTMLInputElement && element.type === 'checkbox') return `${key}.checked`;
    if(element instanceof global.HTMLInputElement && element.type === 'radio'){
      const name = String(element.name || '').trim();
      return name ? `radio[name=${name}].selectedValue` : `${key}.selectedValue`;
    }
    if('value' in element) return `${key}.value`;
    if(element.hasAttribute?.('aria-pressed')) return `${key}.aria-pressed`;
    if(element.hasAttribute?.('aria-checked')) return `${key}.aria-checked`;
    if(element.hasAttribute?.('aria-selected')) return `${key}.aria-selected`;
    if(element.getAttribute?.('contenteditable') === 'true') return `${key}.text`;
    return null;
  }

  function captureDomObservables(tabId, type){
    const root = getMountedRoot(tabId, type);
    const values = {};
    if(!root) return values;
    const controlEntries = domObservableControlEntries(root);
    const rootControls = controlEntries.filter(entry => !entry.external).map(entry => entry.element);
    const externalControls = controlEntries.filter(entry => entry.external).map(entry => entry.element);
    controlEntries.forEach(({ element: el, index, external }) => {
      const key = `${external ? 'active-ui:' : ''}${domNodeKey(el, index)}`;
      if(el instanceof global.HTMLInputElement && el.type === 'checkbox') values[`${key}.checked`] = !!el.checked;
      else if(el instanceof global.HTMLInputElement && el.type === 'radio'){
        const name = String(el.name || '').trim();
        if(el.checked){
          values[name ? `radio[name=${name}].selectedValue` : `${key}.selectedValue`] = String(el.value ?? '');
        }
      }else if(el instanceof global.HTMLDetailsElement) values[`${key}.open`] = !!el.open;
      else if('value' in el) values[`${key}.value`] = String(el.value ?? '');
      if(el.hasAttribute?.('aria-pressed')) values[`${key}.aria-pressed`] = el.getAttribute('aria-pressed') === 'true';
      if(el.hasAttribute?.('aria-checked')) values[`${key}.aria-checked`] = el.getAttribute('aria-checked') === 'true';
      if(el.hasAttribute?.('aria-selected')) values[`${key}.aria-selected`] = el.getAttribute('aria-selected') === 'true';
      if(el.getAttribute?.('contenteditable') === 'true') values[`${key}.text`] = String(el.innerHTML || '');
      if(el.hasAttribute?.('data-parameter-p-value-scientific')){
        values[`${key}.data-parameter-p-value-scientific`] = el.getAttribute('data-parameter-p-value-scientific') === 'true';
      }
    });
    const selectedTabGroups = new Set();
    rootControls.concat(externalControls).forEach((el, index) => {
      if(el.getAttribute?.('role') !== 'tab' || el.getAttribute('aria-selected') !== 'true') return;
      const group = el.closest?.('[role="tablist"]');
      if(!group || selectedTabGroups.has(group)) return;
      selectedTabGroups.add(group);
      const raw = String(el.dataset?.value || el.getAttribute('data-tab') || el.getAttribute('aria-controls') || el.id || '');
      const selectedValue = raw
        .replace(/^(?:analysis)?(?:tab|panel)/i, '')
        .replace(/^./, character => character.toLowerCase());
      values[`tablist:${domNodeKey(group, index)}.selectedValue`] = selectedValue;
    });
    const selectedListboxes = new Set();
    rootControls.concat(externalControls).forEach((el, index) => {
      if(el.getAttribute?.('role') !== 'option' || el.getAttribute('aria-selected') !== 'true') return;
      const group = el.closest?.('[role="listbox"]');
      if(!group || selectedListboxes.has(group)) return;
      selectedListboxes.add(group);
      const selectedValue = String(el.dataset?.value || el.getAttribute('data-value') || el.getAttribute('value') || el.id || el.textContent || '').trim();
      values[`listbox:${domNodeKey(group, index)}.selectedValue`] = selectedValue;
    });
    Array.from(root.querySelectorAll('details.shared-notes')).forEach((details, index) => {
      const key = `notes:${domNodeKey(details, index)}`;
      values[`${key}.open`] = !!details.open;
    });
    const selectedColumns = Array.from(root.querySelectorAll('input[id*="StatCol" i]'))
      .filter(input => input.checked)
      .map(input => Number(String(input.id).match(/(\d+)$/)?.[1]))
      .filter(Number.isFinite);
    if(root.querySelector('input[id*="StatCol" i]')) values['stats.selectedColumns'] = selectedColumns;
    const distributionInputs = Array.from(root.querySelectorAll('input[id^="histDist_"]'));
    if(distributionInputs.length){
      values['hist.distributions.selected'] = distributionInputs
        .filter(input => input.checked)
        .map(input => String(input.id || '').replace(/^histDist_/i, ''));
    }
    const boxStatsDesign = root.querySelector('#boxStatsDesign');
    if(boxStatsDesign) values['#boxStatsDesign.paired'] = String(boxStatsDesign.value) === 'paired';
    const visualSelector = 'svg, svg *, .svgbox, [data-graph-aspect-locked], [data-resizer-aspect-locked], [data-parameter-p-value-scientific], [data-parameter-observable]';
    Array.from(root.querySelectorAll(visualSelector)).forEach((el, index) => {
      const key = `visual:${domNodeKey(el, index)}`;
      ['fill','stroke','stroke-width','opacity','font-size','font-family','font-weight','font-style','width','height','x','y','cx','cy','transform','data-graph-aspect-locked','data-resizer-aspect-locked'].forEach(attr => {
        if(el.hasAttribute?.(attr)) values[`${key}.${attr}`] = String(el.getAttribute(attr));
      });
      Array.from(el.attributes || []).forEach(attr => {
        if(!attr.name.startsWith('data-parameter-')) return;
        const raw = String(attr.value || '');
        let value = raw === '' ? null : (raw === 'true' ? true : (raw === 'false' ? false : raw));
        if(raw && (raw.startsWith('[') || raw.startsWith('{'))){
          try{ value = JSON.parse(raw); }catch(_error){ /* keep the exact string */ }
        }
        values[`${key}.${attr.name}`] = value;
      });
      const rotationState = el.__plot3dRotationControl?.state || null;
      if(rotationState && typeof rotationState === 'object'){
        ['x','y','z'].forEach(axis => {
          const numeric = Number(rotationState[axis]);
          if(Number.isFinite(numeric)) values[`${key}.rotation.${axis}`] = numeric;
        });
      }
      const transform = String(el.getAttribute?.('transform') || '').trim();
      const translateMatch = transform.match(/translate\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(?:[, ]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?))?/i);
      if(translateMatch){
        const tx = Number(translateMatch[1]);
        const ty = Number(translateMatch[2] ?? 0);
        if(Number.isFinite(tx)) values[`${key}.translate.x`] = tx;
        if(Number.isFinite(ty)) values[`${key}.translate.y`] = ty;
      }
      if(el.classList?.contains('svgbox')){
        const styleWidth = Number.parseFloat(el.style?.width || '');
        const styleHeight = Number.parseFloat(el.style?.height || '');
        const graphWidth = Number(el.dataset?.graphWidthPx);
        const graphHeight = Number(el.dataset?.graphHeightPx);
        if(Number.isFinite(styleWidth)) values[`${key}.graphSizing.widthPx`] = styleWidth;
        else if(Number.isFinite(graphWidth)) values[`${key}.graphSizing.widthPx`] = graphWidth;
        if(Number.isFinite(styleHeight)) values[`${key}.graphSizing.heightPx`] = styleHeight;
        else if(Number.isFinite(graphHeight)) values[`${key}.graphSizing.heightPx`] = graphHeight;
        if(el.dataset?.graphAspectLocked === 'true' || el.dataset?.graphAspectLocked === 'false'){
          values[`${key}.graphSizing.aspectLocked`] = el.dataset.graphAspectLocked === 'true';
        }else if(el.dataset?.resizerAspectLocked === 'true' || el.dataset?.resizerAspectLocked === 'false'){
          values[`${key}.graphSizing.aspectLocked`] = el.dataset.resizerAspectLocked === 'true';
        }
        if(el.dataset?.resizerProportionalFontResize === 'true' || el.dataset?.resizerProportionalFontResize === 'false'){
          values[`${key}.graphSizing.proportionalFontResize`] = el.dataset.resizerProportionalFontResize === 'true';
        }
      }
      const text = String(el.textContent || '').trim();
      if(text && text.length <= MAX_DOM_TEXT && !text.includes('\n')) values[`${key}.text`] = text;
    });
    return values;
  }

  function flattenPrimitives(value, prefix = '', output = {}, seen = new WeakSet(), depth = 0){
    if(depth > 9) return output;
    if(value === null || value === undefined || typeof value !== 'object'){
      if(prefix) output[prefix] = value;
      return output;
    }
    if(value instanceof global.Node) return output;
    if(seen.has(value)) return output;
    seen.add(value);
    if(Array.isArray(value)){
      if(prefix) output[prefix] = clone(value);
      value.forEach((entry, index) => flattenPrimitives(entry, `${prefix}[${index}]`, output, seen, depth + 1));
    }else{
      Object.keys(value).sort().forEach(key => {
        if(/(?:capturedAt|updatedAt|createdAt|runtimeGeneration)$/i.test(key)) return;
        if(/^(?:ui|refs|root|hot|managers|cache|workers|timers|results|resultsModel|reportModel|statsPanel|statsPanelModel)$/i.test(key)) return;
        flattenPrimitives(value[key], prefix ? `${prefix}.${key}` : key, output, seen, depth + 1);
      });
    }
    return output;
  }

  function captureOwnerObservables(type, tabId){
    const component = getComponent(type);
    const tab = getTab(tabId);
    const sessionRecord = global.Shared?.workspaceTabs?.getSessionRecord?.(tabId, type) || null;
    let runtime = null;
    try{
      runtime = component?.captureRuntimeState?.({ tab, tabId, componentKey: type, reason: 'parameter-isolation-owner-capture' }) || null;
    }catch(error){
      runtime = { __captureError: error?.message || String(error) };
    }
    const stateModel = component?.__stateModel?.snapshot?.(tabId, { tab, tabId, reason: 'parameter-isolation-state-model' }) || null;
    let componentSession = null;
    try{
      componentSession = component?.__testHooks?.getSession?.(tabId)
        || component?.__testHooks?.getSessionForTab?.(tabId)
        || null;
    }catch(_error){
      componentSession = null;
    }
    let activeState = null;
    try{
      activeState = component?.__getState?.() || null;
    }catch(_error){
      activeState = null;
    }
    const layoutState = tab?.layoutState || sessionRecord?.layout || null;
    const layoutSizingRecord = global.Shared?.graphSizing?.captureLayoutSizing?.(layoutState, {
      context: `parameter-isolation-${type}-owner-layout`
    }) || null;
    const layoutSizing = layoutSizingRecord?.display ? {
      widthPx: layoutSizingRecord.display.widthPx,
      heightPx: layoutSizingRecord.display.heightPx,
      aspectLocked: layoutSizingRecord.display.aspectLocked === true,
      proportionalFontResize: layoutSizingRecord.display.proportionalFontResize === true
    } : null;
    return flattenPrimitives({
      runtime,
      sessionRuntime: sessionRecord?.runtime || null,
      sharedState: tab?.sharedState || sessionRecord?.shared || null,
      layoutState,
      layoutSizing,
      stateModel,
      componentSession,
      activeState
    });
  }

  function findWitness(beforeMap, afterMap, beforeValue, afterValue, parameter, preferredKey = null){
    if(preferredKey && equivalent(beforeMap?.[preferredKey], beforeValue) && equivalent(afterMap?.[preferredKey], afterValue)){
      return preferredKey;
    }
    const keys = Array.from(new Set([...Object.keys(beforeMap || {}), ...Object.keys(afterMap || {})]));
    const exactTransitions = keys.filter(key => equivalent(beforeMap?.[key], beforeValue) && equivalent(afterMap?.[key], afterValue));
    const semantic = exactTransitions
      .map(key => ({ key, score: observableSemanticScore(key, parameter.path) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    if(semantic.length) return semantic[0].key;
    // Exact value coincidence alone is not evidence that a DOM node projects this
    // parameter. Require a semantic association (or the explicit control key above)
    // so an unrelated checkbox/details transition cannot certify isolation.
    return null;
  }

  async function captureBatchState(type, tabId, reason, options = {}){
    if(options.activate !== false){
      await activateTab(tabId, reason || 'parameter-isolation-batch-capture');
    }else{
      requireOwnerTab(tabId, type, reason || 'parameter-isolation-batch-capture');
    }
    return {
      tabId,
      payload: captureCanonicalPayload(type, tabId, `${reason || 'parameter-isolation-batch'}-payload`),
      dom: captureDomObservables(tabId, type),
      owner: captureOwnerObservables(type, tabId)
    };
  }

  function buildParameterWitnesses(parameters, beforeState, afterState){
    const witnesses = new Map();
    parameters.forEach(parameter => {
      witnesses.set(parameter.key, {
        domKey: findWitness(
          beforeState.dom,
          afterState.dom,
          parameter.before,
          parameter.after,
          parameter,
          parameter.controlDomKey
        ),
        ownerKey: findWitness(
          beforeState.owner,
          afterState.owner,
          parameter.before,
          parameter.after,
          parameter
        )
      });
    });
    return witnesses;
  }

  function assertParameterState(state, parameter, expected, witness, label){
    const failures = [];
    const payloadValue = clone(getAtPath(state.payload, parameter.path));
    const domValue = witness?.domKey ? clone(state.dom?.[witness.domKey]) : undefined;
    const ownerValue = witness?.ownerKey ? clone(state.owner?.[witness.ownerKey]) : undefined;
    if(!equivalent(payloadValue, expected)) failures.push(`${label}: canonical payload value drifted`);
    if(!witness?.domKey) failures.push(`${label}: no exact parameter-associated DOM projection witness`);
    else if(!equivalent(domValue, expected)) failures.push(`${label}: DOM exact value drifted`);
    if(!witness?.ownerKey) failures.push(`${label}: no exact parameter-associated owner-session witness`);
    else if(!equivalent(ownerValue, expected)) failures.push(`${label}: owner session exact value drifted`);
    return {
      snapshot: {
        phase: label,
        tabId: state.tabId,
        payloadValue,
        domValue,
        ownerValue,
        domCandidates: witness?.domKey ? undefined : Object.keys(state.dom || {})
          .map(key => ({ key, score: observableSemanticScore(key, parameter.path), value: clone(state.dom[key]) }))
          .filter(item => item.score > 0)
          .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
          .slice(0, 6),
        ownerCandidates: witness?.ownerKey ? undefined : Object.keys(state.owner || {})
          .map(key => ({ key, score: observableSemanticScore(key, parameter.path), value: clone(state.owner[key]) }))
          .filter(item => item.score > 0)
          .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
          .slice(0, 8)
      },
      failures
    };
  }

  async function awaitOwnerReadyForSnapshot(type, tabId, reason){
    const tab = requireOwnerTab(tabId, type, `${reason}-owner`);
    const component = getComponent(type);
    if(typeof component?.awaitReadyForSnapshot !== 'function') return { skipped: true, reason: 'missing-hook' };
    const readiness = await component.awaitReadyForSnapshot({
      tab,
      tabId: tab.id,
      type,
      componentKey: type,
      reason,
      timeoutMs: 20_000
    });
    if(readiness?.ok === false){
      throw new Error(`${reason}: ${type} snapshot readiness failed (${readiness.reason || 'not-ready'})`);
    }
    return readiness || { ok: true };
  }

  async function buildArchiveBlob(type, tabId, reason){
    await awaitOwnerReadyForSnapshot(type, tabId, `${reason}-ready`);
    const context = global.Main?.tabs?.getSessionActionsContext?.();
    const blob = await global.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason,
      useWorker: false
    });
    if(!blob) throw new Error(`${reason}: workspace archive blob was not produced`);
    return blob;
  }

  async function reopenArchiveBlob(blob, fileName, reason){
    const context = global.Main?.tabs?.getSessionActionsContext?.();
    const file = new File([blob], fileName || 'parameter-isolation.graph', { type: 'application/zip' });
    const result = await global.Main?.sessionActions?.loadWorkspaceFile?.(context, file, { reason, fileName: file.name });
    await settle(180);
    return result;
  }

  function synthesizeSharedUserState(type, tabId, baseline, root){
    const synthetic = [];
    const inferenceInputs = Array.from(root?.querySelectorAll?.('.stats-inference-controls__input[data-stats-inference-key]') || []);
    if(inferenceInputs.length){
      const inferenceState = global.Shared?.statsInference?.getState?.({ tabId }) || {};
      const seenKeys = new Set();
      inferenceInputs.forEach(input => {
        const key = String(input?.dataset?.statsInferenceKey || '').trim();
        if((key !== 'alpha' && key !== 'targetFdr') || seenKeys.has(key)) return;
        seenKeys.add(key);
        const path = ['meta', 'statsInference', key];
        const stateValue = Number(inferenceState?.[key]);
        const inputValue = Number(input.value);
        const fallback = key === 'targetFdr'
          ? Number(global.Shared?.statsInference?.DEFAULT_TARGET_FDR ?? 0.05)
          : Number(global.Shared?.statsInference?.DEFAULT_ALPHA ?? 0.05);
        const value = Number.isFinite(stateValue)
          ? stateValue
          : (Number.isFinite(inputValue) ? inputValue : fallback);
        if(Number.isFinite(value) && getAtPath(baseline, path) === undefined){
          setAtPath(baseline, path, value);
          synthetic.push({ path: pathKey(path), source: 'shared-stats-inference-control-default' });
        }
      });
    }
    const svgBox = root?.querySelector?.('.svgbox') || null;
    if(svgBox){
      const sizing = global.Shared?.graphSizing?.captureElementSizing?.(svgBox, {
        context: `parameter-isolation-${type}-discovery`
      }) || null;
      const display = sizing?.display || sizing || null;
      const width = Number(display?.widthPx ?? display?.width);
      const height = Number(display?.heightPx ?? display?.height);
      const locked = display?.aspectLocked === true
        || svgBox.dataset?.graphAspectLocked === 'true'
        || svgBox.dataset?.resizerAspectLocked === 'true';
      const proportionalFontResize = display?.proportionalFontResize === true
        || svgBox.dataset?.resizerProportionalFontResize === 'true';
      const entries = [
        [['meta', 'graphSizing', 'display', 'widthPx'], width],
        [['meta', 'graphSizing', 'display', 'heightPx'], height],
        [['meta', 'graphSizing', 'display', 'aspectLocked'], locked],
        [['meta', 'graphSizing', 'display', 'proportionalFontResize'], proportionalFontResize]
      ];
      entries.forEach(([path, value]) => {
        if((typeof value === 'number' ? Number.isFinite(value) : typeof value === 'boolean') && getAtPath(baseline, path) === undefined){
          setAtPath(baseline, path, value);
          synthetic.push({ path: pathKey(path), source: 'shared-graph-sizing-default' });
        }
      });
    }
    return synthetic;
  }

  async function discover(type, tabId){
    await activateTab(tabId, `parameter-discovery-${type}`);
    // Hydration inputs may legally omit implicit defaults. Normalize them once through
    // the owner-scoped serializer before discovery; all later assertions read stored
    // owner state and cannot repair a failed mutation or reopen from the live DOM.
    persistOwner(type, tabId, `parameter-discovery-${type}-normalize`);
    const storedBaseline = captureCanonicalPayload(type, tabId, `parameter-discovery-${type}-payload`) || { type };
    // Only state actually owned by this example is active. Empty-payload templates
    // contain alternatives for mutually exclusive modes; treating those defaults as
    // simultaneously active creates impossible parameter combinations.
    const baseline = clone(storedBaseline);
    const root = getMountedRoot(tabId, type);
    const synthetic = [
      ...synthesizeSharedUserState(type, tabId, baseline, root)
    ];
    const selectedColumns = getAtPath(baseline, ['config', 'stats', 'selectedColumns']);
    if(Array.isArray(selectedColumns) && selectedColumns.length === 0){
      const checkedColumns = Array.from(root?.querySelectorAll?.('input[id*="StatCol" i]:checked') || [])
        .map(input => Number(String(input.id).match(/(\d+)$/)?.[1]))
        .filter(Number.isFinite);
      if(checkedColumns.length){
        setAtPath(baseline, ['config', 'stats', 'selectedColumns'], checkedColumns);
        synthetic.push({ path: 'config.stats.selectedColumns', source: 'normalized-visible-column-selection' });
      }
    }
    const roots = USER_ROOTS[type] || ['config', 'style', 'notes', 'meta'];
    const parameters = [];
    const classified = [];
    roots.forEach(rootKey => {
      if(!Object.prototype.hasOwnProperty.call(baseline, rootKey)){
        classified.push({ path: rootKey, reason: 'missing-root' });
        return;
      }
      collectLeaves(baseline[rootKey], [rootKey], parameters, classified);
    });
    if(type === 'venn' && baseline?.analysis?.goPerformed !== true && baseline?.analysis?.stringPerformed !== true){
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(parameters[index].key === 'analysis.activeResultsTab'){
          classified.push({ path: parameters[index].key, reason: 'inactive-results-panel-state' });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'venn' && String(baseline?.style?.plotType || 'venn').toLowerCase() !== 'upset'){
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(/^style\.upset(?:\.|$)/i.test(parameters[index].key)){
          classified.push({ path: parameters[index].key, reason: 'inactive-plot-toolbar-state' });
          parameters.splice(index, 1);
        }
      }
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(parameters[index].key === 'meta.graphSizing.display.aspectLocked'){
          classified.push({ path: parameters[index].key, reason: 'forced-plot-mode-state' });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'scatter'){
      const scatterProjectionPaths = /^(?:config\.(?:backgroundColor|textColor|showDiagnostics)$|config\.stats\.(?:regressionMode|fitMethod|showCI|showPI|showDiagnostics|precomputedStats)$|config\.stats\.fitSpec(?:\.|$)|config\.axisLabelModes(?:\.|$))/i;
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(scatterProjectionPaths.test(parameters[index].key)){
          classified.push({ path: parameters[index].key, reason: 'derived-scatter-compatibility-projection' });
          parameters.splice(index, 1);
        }
      }
      if(baseline?.config?.dotSizeOverrideEnabled !== true){
        for(let index = parameters.length - 1; index >= 0; index -= 1){
          if(parameters[index].key === 'config.dotSize'){
            classified.push({ path: parameters[index].key, reason: 'derived-adaptive-point-size' });
            parameters.splice(index, 1);
          }
        }
      }
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(/^config\.overlayStyles\.trend\.linkColorToTrend$/i.test(parameters[index].key)){
          classified.push({ path: parameters[index].key, reason: 'derived-self-linked-overlay-state' });
          parameters.splice(index, 1);
        }
      }
      const scatterStatsReady = !!baseline?.config?.stats?.precomputedStats
        || Number(baseline?.config?.stats?.lastRunVersion || 0) > 0;
      if(!scatterStatsReady){
        for(let index = parameters.length - 1; index >= 0; index -= 1){
          if(/^config\.(?:showLine|showPlotStats|showCI|showPI)$/i.test(parameters[index].key)
            || /^config\.overlayStyles\.(?:confidence|prediction)(?:\.|$)/i.test(parameters[index].key)){
            classified.push({ path: parameters[index].key, reason: 'inactive-scatter-stats-overlay-state' });
            parameters.splice(index, 1);
          }
        }
      }
      const requestedView = String(baseline?.config?.viewMode || '2d').toLowerCase();
      if(requestedView !== '3d'){
        for(let index = parameters.length - 1; index >= 0; index -= 1){
          if(/^config\.rotation(?:\.|$)/i.test(parameters[index].key)){
            classified.push({ path: parameters[index].key, reason: 'inactive-scatter-3d-state' });
            parameters.splice(index, 1);
          }
        }
      }
    }
    if(type === 'roc'){
      const derivedRocStats = /^stats\.(?:compareResult(?:\.|$)|advisor\.(?:context(?:\.|$)|lastApplied(?:\.|$)))/i;
      const inactiveRocResampling = String(baseline?.stats?.diffMethod || 'delong').toLowerCase() === 'delong'
        ? /^stats\.resampling(?:Seed|Iterations)$/i
        : null;
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(derivedRocStats.test(parameters[index].key) || inactiveRocResampling?.test(parameters[index].key)){
          classified.push({
            path: parameters[index].key,
            reason: derivedRocStats.test(parameters[index].key) ? 'derived-statistics-projection' : 'inactive-statistics-control'
          });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'line'){
      const inactivePatterns = [
        /^config\.(?:alpha|dotSize)$/i,
        /^config\.showDiagnostics$/i,
        /^config\.(?:groupLabels|groupShapes)(?:\.|$)/i,
        /^config\.stats\.(?:hasResults|panelModel|statsOptions)(?:\.|$)/i,
        /^config\.stats\.controls\.regressionMode$/i
      ];
      if(String(baseline?.config?.viewMode || '2d').toLowerCase() !== '3d'){
        inactivePatterns.push(/^config\.rotation(?:\.|$)/i);
        inactivePatterns.push(/^config\.zLabel$/i);
      }
      if(String(baseline?.config?.tableFormat || 'single').toLowerCase() !== 'grouped'){
        inactivePatterns.push(/^config\.replicates$/i);
      }
      if(baseline?.config?.stats?.hasResults !== true){
        inactivePatterns.push(/^config\.(?:showTrendLine|showConfidenceIntervals|showPredictionIntervals)$/i);
        inactivePatterns.push(/^config\.overlayStyles\.(?:trend|confidence|prediction)(?:\.|$)/i);
      }
      if(baseline?.config?.showGrid !== true) inactivePatterns.push(/^config\.gridStyle(?:\.|$)/i);
      if(baseline?.config?.logX !== true) inactivePatterns.push(/^config\.logPlusOneX$/i);
      if(baseline?.config?.logY !== true) inactivePatterns.push(/^config\.logPlusOneY$/i);
      if(baseline?.config?.showConfidenceIntervals !== true) inactivePatterns.push(/^config\.overlayStyles\.confidence(?:\.|$)/i);
      if(baseline?.config?.showPredictionIntervals !== true) inactivePatterns.push(/^config\.overlayStyles\.prediction(?:\.|$)/i);
      if(baseline?.config?.showTrendLine !== true) inactivePatterns.push(/^config\.overlayStyles\.trend(?:\.|$)/i);
      if(String(baseline?.config?.originMode || 'zero').toLowerCase() !== 'custom'){
        inactivePatterns.push(/^config\.origin[XY]$/i);
      }
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(inactivePatterns.some(pattern => pattern.test(parameters[index].key))){
          classified.push({ path: parameters[index].key, reason: 'inactive-or-derived-line-state' });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'heatmap'){
      const inactivePatterns = [
        /^config\.showValuesUserOverride$/i,
        /^config\.adjust\.logPlusOne$/i
      ];
      if(String(baseline?.config?.view || 'corr-columns').toLowerCase() !== 'values'){
        inactivePatterns.push(/^config\.valueScale(?:\.|$)/i);
        inactivePatterns.push(/^config\.legendHeightMode$/i);
        inactivePatterns.push(/^meta\.graphSizing\.display\.aspectLocked$/i);
      }
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(inactivePatterns.some(pattern => pattern.test(parameters[index].key))){
          classified.push({ path: parameters[index].key, reason: 'inactive-or-derived-heatmap-state' });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'surface'){
      const compatibilityAliases = /^config\.(?:backgroundColor|colorScheme|textColor)$/i;
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(parameters[index].key === 'meta.graphSizing.display.aspectLocked'){
          classified.push({ path: parameters[index].key, reason: 'forced-surface-aspect-state' });
          parameters.splice(index, 1);
        }else if(compatibilityAliases.test(parameters[index].key)){
          classified.push({ path: parameters[index].key, reason: 'derived-surface-settings-projection' });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'pca'){
      const inactiveOrDerived = [
        // The selector projects the active DataView. The persisted operation is the
        // DataView transform/activeDataViewId pair, covered by PCA DataView tests.
        /^config\.preprocessing$/i,
        /^config\.grouped\.(?:colors|shapes)(?:\.|$)/i,
        /^config\.label(?:Colors|Shapes|PointStyles)(?:\.|$)/i,
        /^config\.pointStyleScopes\.(?:global|version)(?:\.|$)/i
      ];
      const pcaMethod = String(baseline?.config?.method || 'pca').toLowerCase();
      const componentRule = String(baseline?.config?.componentSelection?.rule || 'all').toLowerCase();
      if(componentRule !== 'threshold') inactiveOrDerived.push(/^config\.componentSelection\.eigenThreshold$/i);
      if(componentRule !== 'parallel') inactiveOrDerived.push(/^config\.componentSelection\.parallelIterations$/i);
      // PCA coordinates must retain a metric frame, so this layout choice is forced.
      inactiveOrDerived.push(/^meta\.graphSizing\.display\.aspectLocked$/i);
      if(String(baseline?.config?.tableFormat || 'standard').toLowerCase() !== 'grouped'){
        inactiveOrDerived.push(/^config\.grouped\.replicatesPerGroup$/i);
      }
      if(pcaMethod !== 'tsne') inactiveOrDerived.push(/^config\.tsne(?:\.|$)/i);
      if(pcaMethod !== 'umap') inactiveOrDerived.push(/^config\.umap(?:\.|$)/i);
      if(String(baseline?.config?.viewMode || '2d').toLowerCase() !== '3d'){
        inactiveOrDerived.push(/^config\.rotation(?:\.|$)/i);
        inactiveOrDerived.push(/^config\.axisSelection\.z$/i);
      }
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(inactiveOrDerived.some(pattern => pattern.test(parameters[index].key))){
          classified.push({ path: parameters[index].key, reason: 'inactive-or-derived-pca-state' });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'hist'){
      const inactivePatterns = [];
      // Distribution keys identify the fixed distribution definitions. Their label,
      // color and pattern remain independently user-editable parameters.
      inactivePatterns.push(/^config\.distributions\.options\.\[\d+\]\.key$/i);
      if(String(baseline?.config?.seriesLayout?.display || 'overlay').toLowerCase() !== 'panels'){
        inactivePatterns.push(/^config\.seriesLayout\.(?:arrangement|sharedY)$/i);
      }
      if(String(baseline?.config?.frequency?.binningMode || 'auto').toLowerCase() !== 'width'){
        inactivePatterns.push(/^config\.frequency\.manualBinWidth$/i);
        inactivePatterns.push(/^config\.frequency\.(?:firstCenter|lastCenter)(?:Auto)?$/i);
      }
      if(baseline?.config?.frequency?.firstCenterAuto !== false) inactivePatterns.push(/^config\.frequency\.firstCenter$/i);
      if(baseline?.config?.frequency?.lastCenterAuto !== false) inactivePatterns.push(/^config\.frequency\.lastCenter$/i);
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(inactivePatterns.some(pattern => pattern.test(parameters[index].key))){
          classified.push({ path: parameters[index].key, reason: 'inactive-or-structural-hist-state' });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'pie'){
      const statsScope = String(baseline?.config?.stats?.scope || 'all').toLowerCase();
      const advisorOpen = baseline?.config?.stats?.advisor?.open === true;
      const inactivePatterns = [
        /^config\.(?:valueColumn|expectedColumn)$/i,
        /^config\.stats\.advisor\.activated$/i
      ];
      if(!advisorOpen) inactivePatterns.push(/^config\.stats\.advisor\.answers(?:\.|$)/i);
      if(statsScope !== 'gof'){
        inactivePatterns.push(/^config\.stats\.(?:valueColumn|expectedColumn)$/i);
      }
      if(statsScope !== 'reference') inactivePatterns.push(/^config\.stats\.referenceColumn$/i);
      if(statsScope !== 'custom') inactivePatterns.push(/^config\.stats\.customPairs(?:\.|$)/i);
      const chartType = String(baseline?.config?.chartType || 'pie').toLowerCase();
      if(chartType === 'pie' || chartType === 'donut') inactivePatterns.push(/^meta\.graphSizing\.display\.aspectLocked$/i);
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(inactivePatterns.some(pattern => pattern.test(parameters[index].key))){
          const path = parameters[index].key;
          const reason = /^config\.(?:valueColumn|expectedColumn)$/i.test(path)
            ? 'derived-pie-stats-compatibility-projection'
            : (/aspectLocked$/i.test(path) ? 'forced-pie-aspect-state' : 'inactive-or-derived-pie-stats-state');
          classified.push({ path, reason });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'survival'){
      const derivedAdvisorState = /^config\.advisor\.(?:context|lastApplied|activated)(?:\.|$)/i;
      const advisorAnswersInactive = baseline?.config?.advisor?.open !== true;
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(parameters[index].key === 'config.statsReportPScientific'){
          classified.push({ path: parameters[index].key, reason: 'derived-stats-reporting-projection' });
          parameters.splice(index, 1);
        }else if(derivedAdvisorState.test(parameters[index].key)){
          classified.push({ path: parameters[index].key, reason: 'derived-survival-advisor-state' });
          parameters.splice(index, 1);
        }else if(advisorAnswersInactive && /^config\.advisor\.answers(?:\.|$)/i.test(parameters[index].key)){
          classified.push({ path: parameters[index].key, reason: 'inactive-survival-advisor-answer' });
          parameters.splice(index, 1);
        }
      }
    }
    if(type === 'box'){
      const inactivePatterns = [];
      if(baseline?.config?.logScale !== true) inactivePatterns.push(/^config\.logPlusOne$/i);
      if(String(baseline?.config?.whisker?.rule || '').toLowerCase() !== 'custom') inactivePatterns.push(/^config\.whisker\.customMultiplier$/i);
      if(baseline?.meta?.statsReporting && Object.prototype.hasOwnProperty.call(baseline.meta.statsReporting, 'pValueScientific')){
        inactivePatterns.push(/^config\.stats\.reportPScientific$/i);
      }

      if(String(baseline?.config?.colorMode || '').toLowerCase() === 'unified'){
        inactivePatterns.push(/^config\.(?:colors|borderColors)(?:\.|$)/i);
      }
      if(String(baseline?.config?.tableFormat || 'single').toLowerCase() !== 'grouped'){
        inactivePatterns.push(/^config\.(?:groupLayout|grouped)(?:\.|$)/i);
        inactivePatterns.push(/^config\.stats\.grouped(?:Analysis|ComparisonScope|MultiplicityFamily)(?:\.|$)/i);
      }
      if(Array.isArray(baseline?.config?.stats?.selectedColumns) && baseline.config.stats.selectedColumns.length === 0){
        for(let index = parameters.length - 1; index >= 0; index -= 1){
          if(parameters[index].key === 'config.stats.selectedColumns'){
            classified.push({ path: parameters[index].key, reason: 'automatic-empty-selection-sentinel' });
            parameters.splice(index, 1);
          }
        }
      }
      if(String(baseline?.config?.stats?.test || 'parametric').toLowerCase() === 'parametric'){
        inactivePatterns.push(/^config\.stats\.(?:effectNonParametric|nonParametricVariant)(?:\.|$)/i);
      }else{
        inactivePatterns.push(/^config\.stats\.(?:effectParametric|parametricVariant|omnibusParametricVariant|pairwiseParametricVariant)(?:\.|$)/i);
      }
      if(String(baseline?.config?.stats?.outlierMode || 'none').toLowerCase() === 'none'){
        inactivePatterns.push(/^config\.stats\.outlier(?:Alpha|Q)(?:\.|$)/i);
      }
      const statsMode = String(baseline?.config?.stats?.mode || 'all');
      if(statsMode !== 'oneSample') inactivePatterns.push(/^config\.stats\.oneSampleNullValue(?:\.|$)/i);
      if(statsMode !== 'reference') inactivePatterns.push(/^config\.stats\.referenceIndex(?:\.|$)/i);
      if(statsMode !== 'custom') inactivePatterns.push(/^config\.stats\.pairsText(?:\.|$)/i);
      if(String(baseline?.config?.stats?.resultsTab || 'overall') !== 'comparisons'){
        inactivePatterns.push(/^config\.stats\.pairwiseParametricVariant(?:\.|$)/i);
      }
      inactivePatterns.push(/^config\.stats\.parametricVariant(?:\.|$)/i);
      if(baseline?.config?.showGrid !== true) inactivePatterns.push(/^config\.gridStyle(?:\.|$)/i);
      if(baseline?.config?.showSignificanceBars !== true) inactivePatterns.push(/^config\.significance(?:\.|$)/i);
      if(!baseline?.results && !baseline?.stats?.results){
        inactivePatterns.push(/^config\.stats\.resultsTab(?:\.|$)/i);
      }
      const categoryAxis = baseline?.config?.flipAxes === true ? 'y' : 'x';
      const valueAxis = categoryAxis === 'x' ? 'y' : 'x';
      inactivePatterns.push(new RegExp(`^config\\.axis\\.datasetSpacing\\.${valueAxis}$`, 'i'));
      inactivePatterns.push(new RegExp(`^config\\.axis\\.(?:tickInterval|majorTickLength|minorTicks|minorTickSubdivisions|notation)\\.${categoryAxis}$`, 'i'));
      const graphType = String(baseline?.config?.graphType || 'box').toLowerCase();
      if(graphType !== 'bar') inactivePatterns.push(/^config\.(?:barSummary|borderWidths\.bar)(?:\.|$)/i);
      if(graphType !== 'box') inactivePatterns.push(/^config\.borderWidths\.box(?:\.|$)/i);
      if(graphType !== 'notched') inactivePatterns.push(/^config\.borderWidths\.notched(?:\.|$)/i);
      if(graphType !== 'violin') inactivePatterns.push(/^config\.(?:violin|borderWidths\.violin)(?:\.|$)/i);
      if(graphType !== 'strip') inactivePatterns.push(/^config\.borderWidths\.strip(?:\.|$)/i);
      inactivePatterns.push(new RegExp(`^config\\.borderWidths\\.${graphType}$`, 'i'));
      for(let index = parameters.length - 1; index >= 0; index -= 1){
        if(inactivePatterns.some(pattern => pattern.test(parameters[index].key))){
          classified.push({ path: parameters[index].key, reason: 'inactive-box-mode-state' });
          parameters.splice(index, 1);
        }
      }
    }
    const hasActiveReportingElement = selector => Array.from(global.document?.querySelectorAll?.(selector) || [])
      .some(element => root?.contains?.(element)
        || (!element.closest?.('[hidden]') && element.getClientRects?.().length > 0));
    const hasPValueScientificControl = hasActiveReportingElement('[data-parameter-p-value-scientific]');
    const hasStatsInferenceAlphaControl = hasActiveReportingElement('.stats-inference-controls__input[data-stats-inference-key="alpha"]');
    const hasStatsInferenceFdrControl = hasActiveReportingElement('.stats-inference-controls__input[data-stats-inference-key="targetFdr"]');
    for(let index = parameters.length - 1; index >= 0; index -= 1){
      const key = parameters[index].key;
      if(key === 'meta.statsReporting.pValueScientific' && !hasPValueScientificControl){
        classified.push({ path: key, reason: 'inactive-shared-stats-reporting-control' });
        parameters.splice(index, 1);
        continue;
      }
      if((key === 'meta.statsInference.alpha' && !hasStatsInferenceAlphaControl)
        || (key === 'meta.statsInference.targetFdr' && !hasStatsInferenceFdrControl)){
        classified.push({ path: key, reason: 'inactive-shared-stats-inference-control' });
        parameters.splice(index, 1);
      }
    }

    parameters.forEach(parameter => {
      const mutation = buildAlternative(parameter.path, parameter.before, root);
      parameter.after = clone(mutation.value);
      parameter.covered = mutation.covered === true && !equivalent(parameter.before, mutation.value);
      parameter.mutationSource = mutation.source || null;
      parameter.uncoveredReason = parameter.covered ? null : (mutation.reason || 'no-valid-alternative');
      parameter.controlIndex = mutation.controlIndex ?? null;
      parameter.controlDomKey = mutation.controlDomKey ?? null;
    });
    const controlGaps = auditPersistentControlCoverage(root, parameters);
    return { baseline, storedBaseline, roots, parameters, classified, synthetic, controlGaps };
  }

  function describeError(error){
    if(!error) return 'unknown error';
    return String(error?.message || error);
  }

  function resolveReopenedOwners(locators){
    return locators.map(locator => resolveTabLocator(locator));
  }

  function parameterBatchKey(parameter, type){
    const path = Array.isArray(parameter?.path) ? parameter.path : [];
    if(type === 'box'){
      if(path[0] === 'config' && path[1] === 'stats'){
        const field = String(path[2] || '');
        if(/^(?:test|mode|paired|resamplingMode|selectedColumns|postHoc|omnibusParametricVariant)$/i.test(field)) return `box.stats-${field.toLowerCase()}`;
        return 'box.stats-compatible';
      }
      if(path[0] === 'config' && /^(?:graphType|tableFormat|colorMode)$/i.test(String(path[1] || ''))){
        return `box.${String(path[1]).toLowerCase()}`;
      }
      if(path[0] === 'config' && path[1] === 'axis') return 'box.axis-and-sizing';
      if(path[0] === 'meta' && path[1] === 'graphSizing') return 'box.axis-and-sizing';
      if(path[0] === 'config' && /^colorScheme$/i.test(String(path[1] || ''))) return 'box.color-scheme';
      if(path[0] === 'config' && /^(?:logScale|yMin|yMax)$/i.test(String(path[1] || ''))) return 'box.log-axis';
      return 'box.general-compatible';
    }
    if(type === 'hist' && path[0] === 'config'){
      const field = String(path[1] || '');
      if(/^plotMode$/i.test(field)) return 'config.hist-plot-mode';
      if(/^frequency$/i.test(field)){
        const setting = String(path[2] || '');
        if(/^(?:createMode|binningMode|firstCenterAuto|lastCenterAuto)$/i.test(setting)) return pathKey(path.slice(0, 3));
        return 'config.hist-frequency-general';
      }
      if(/^seriesLayout$/i.test(field)) return pathKey(path.slice(0, 3));
      if(/^distributions$/i.test(field)) return 'config.hist-distributions';
    }
    if(type === 'pie' && path[0] === 'config' && path[1] === 'stats'){
      const field = String(path[2] || '');
      if(/^advisor$/i.test(field)) return 'config.pie-stats-advisor';
      return pathKey(path.slice(0, 3));
    }
    if(type === 'pie' && path[0] === 'config' && /^chartType$/i.test(String(path[1] || ''))) return 'config.pie-chart-type';
    if(type === 'survival' && path[0] === 'config' && path[1] === 'advisor') return 'config.survival-advisor';
    if(type === 'surface'){
      if(path[0] === 'config' && path[1] === 'axisMap') return 'config.axisMap';
      if(path[0] === 'config' && path[1] === 'gridStyle') return 'config.gridStyle';
      if(path[0] === 'config' && path[1] === 'settings'){
        if(/^colorScheme$/i.test(String(path[2] || ''))) return 'config.colorScheme';
        if(/^(?:axisColor|backgroundColor|textColor)$/i.test(String(path[2] || ''))) return 'config.surface-colors';
        return 'config.surface-settings';
      }
      if(path[0] === 'meta') return 'meta.graphSizing';
      if(path[0] === 'config') return 'config.surface-general';
    }
    if(type === 'pca' && path[0] === 'config'){
      const field = String(path[1] || '');
      if(/^(?:method|viewMode|preprocessing|standardizeVariables)$/i.test(field)) return `config.pca-${field.toLowerCase()}`;
      if(/^axisSelection$/i.test(field)) return 'config.pca-axis-selection';
      if(/^pointStyleScopes$/i.test(field)) return 'config.pca-point-styles';
      if(/^colorScheme$/i.test(field)) return 'config.colorScheme';
      return 'config.pca-general';
    }
    if(type === 'pca' && path[0] === 'meta') return 'meta.pca';
    if(type === 'line' && path[0] === 'config' && /^(?:showTrendLine|showConfidenceIntervals|showPredictionIntervals)$/i.test(String(path[1] || ''))){
      return pathKey(path.slice(0, 2));
    }
    if(type === 'line' && path[0] === 'config' && path[1] === 'stats' && path[2] === 'controls'){
      return pathKey(path.slice(0, 4));
    }
    if(type === 'line' && path[0] === 'config' && path[1] === 'axis') return 'config.line-general';
    if(path[0] === 'config' && path[1] === 'axis') return 'config.axis';
    if(type === 'line' && path[0] === 'config' && path[1] === 'tableFormat') return 'config.line-table-display';
    if(path[0] === 'config' && (path[1] === 'graphType' || path[1] === 'tableFormat')) return pathKey(path.slice(0, 2));
    if(type === 'scatter' && path[0] === 'config' && /^(?:viewMode|equalAxes|equalScaleAxes|axesVarianceScaled|showErrorBars|showGroupedReplicatePoints|dotSize|dotSizeOverrideEnabled|dotSizeOverrideRaw)$/i.test(String(path[1] || ''))){
      return pathKey(path.slice(0, 2));
    }
    if(type === 'scatter' && path[0] === 'config' && /^(?:showLine|showPlotStats|showCI|showPI)$/i.test(String(path[1] || ''))){
      return pathKey(path.slice(0, 2));
    }
    if(type === 'scatter' && path[0] === 'config' && path[1] === 'stats' && /^statType$/i.test(String(path[2] || ''))){
      return pathKey(path.slice(0, 3));
    }
    if(type === 'scatter' && path[0] === 'config' && path[1] === 'regression') return pathKey(path.slice(0, 3));
    if(type === 'scatter' && path[0] === 'config' && /^overlayStyles$/i.test(String(path[1] || ''))){
      return pathKey(path.slice(0, 3));
    }
    if(type === 'scatter' && path[0] === 'config' && /^gridStyle$/i.test(String(path[1] || ''))){
      return pathKey(path.slice(0, 2));
    }
    if(type === 'scatter' && path[0] === 'config' && /^(?:title|xLabel|yLabel|zLabel)$/i.test(String(path[1] || ''))){
      return 'config.labels';
    }
    if(type === 'line' && path[0] === 'config'){
      const field = String(path[1] || '');
      if(/^colorScheme$/i.test(field)) return 'config.colorScheme';
      if(/^viewMode$/i.test(field)) return 'config.line-view-mode';
      if(/^displayMode$/i.test(field)) return 'config.line-table-display';
      if(/^(?:originMode|equalAxes|logX|logY|xMin|yMin)$/i.test(field)) return 'config.compatible-axis-mode-a';
      if(/^(?:equalScaleAxes|logPlusOneX|logPlusOneY|xMax|yMax)$/i.test(field)) return 'config.compatible-axis-mode-b';
      return 'config.line-general';
    }
    if(type === 'line' && path[0] === 'meta') return 'config.line-general';
    if(type === 'heatmap' && path[0] === 'config'){
      const field = String(path[1] || '');
      if(/^adjust$/i.test(field)) return 'config.adjust';
      if(/^filters$/i.test(field)){
        const filterFamily = String(path[2] || '').match(/^(present|sd|abs|range)/i)?.[1]?.toLowerCase() || 'general';
        return `config.filters.${filterFamily}`;
      }
      if(/^useAbsolute$/i.test(field)) return 'config.heatmap-use-absolute';
      if(/^view$/i.test(field)) return 'config.heatmap-view';
      if(/^colorScheme$/i.test(field)) return 'config.colorScheme';
      return 'config.heatmap-general';
    }
    if(path[0] === 'meta' && path[1] === 'statsReporting') return pathKey(path.slice(0, 3));
    if(path[0] === 'config' && /^colorScheme$/i.test(String(path[1] || ''))){
      return 'config.colorScheme';
    }
    if(path[0] === 'style' && /^colorScheme$/i.test(String(path[1] || ''))){
      return 'style.colorScheme';
    }
    if(type === 'box' && path[0] === 'config' && /^(?:border|fill|colors|borderColors|backgroundColor|textColor)$/i.test(String(path[1] || ''))){
      return 'config.colors';
    }
    return String(path[0] || parameter.key || 'parameters');
  }

  function buildParameterBatches(parameters, type){
    const batches = new Map();
    parameters.forEach(parameter => {
      const key = parameterBatchKey(parameter, type);
      const batch = batches.get(key) || { key, parameters: [] };
      batch.parameters.push(parameter);
      batches.set(key, batch);
    });
    return Array.from(batches.values());
  }

  function createPayloadTab(type, title, payload){
    const session = global.Main?.session;
    const workspace = getWorkspace();
    if(!session?.createTab || !workspace) throw new Error('workspace tab creation unavailable');
    const initialPayload = clone(payload) || { type };
    const tab = session.createTab({ type, title, payload: initialPayload });
    tab.__parameterRequestedPayload = clone(initialPayload);
    workspace.tabs.push(tab);
    if(typeof session.assignTabPayload === 'function'){
      session.assignTabPayload(tab, initialPayload, { reason: 'parameter-isolation-batch-tab' });
    }
    if(initialPayload?.meta?.graphSizing && typeof global.Shared?.graphSizing?.mergePayloadSizingIntoLayout === 'function'){
      tab.layoutState = global.Shared.graphSizing.mergePayloadSizingIntoLayout(tab.layoutState || null, initialPayload, {
        context: 'parameter-isolation-batch-layout',
        preferPayload: true,
        updateDefaults: true
      });
    }
    global.Main?.tabs?.renderTabs?.();
    return tab;
  }

  function closeSeedTabs(tabIds, preserveTabIds = []){
    const preserved = new Set(preserveTabIds.map(String));
    Array.from(new Set(tabIds.map(String))).forEach(tabId => {
      if(!tabId || preserved.has(tabId)) return;
      global.Main?.tabs?.closeTab?.(tabId, {
        force: true,
        skipPrompt: true,
        skipPersist: true,
        reason: 'parameter-isolation-seed-cleanup'
      });
    });
  }

  function applyHeatmapDataViewControlVariant(tab){
    const config = tab?.__parameterRequestedPayload?.config || null;
    if(!config) return false;
    const adjust = config.adjust || {};
    const filters = config.filters || {};
    const currentPayload = global.Components?.heatmap?.getPayload?.() || {};
    const setChecked = (id, value) => {
      const element = global.document.getElementById(id);
      if(element) element.checked = !!value;
      return element;
    };
    const setValue = (id, value) => {
      const element = global.document.getElementById(id);
      if(element && value != null) element.value = String(value);
      return element;
    };
    const logTransform = setChecked('heatmapLogTransform', adjust.logTransform);
    setChecked('heatmapCenterGenes', !!adjust.centerRows);
    setChecked('heatmapNormalizeGenes', adjust.normalizeRows);
    setChecked('heatmapCenterArrays', !!adjust.centerColumns);
    setChecked('heatmapNormalizeArrays', adjust.normalizeColumns);
    const rowMode = global.document.querySelector(`input[name="heatmapCenterGenesMode"][value="${String(adjust.centerRows || 'mean')}"]`);
    const columnMode = global.document.querySelector(`input[name="heatmapCenterArraysMode"][value="${String(adjust.centerColumns || 'mean')}"]`);
    if(rowMode) rowMode.checked = true;
    if(columnMode) columnMode.checked = true;

    const filterToggle = setChecked('heatmapFilterPresentEnable', filters.presentEnabled);
    setValue('heatmapFilterPresentValue', filters.presentThreshold);
    setChecked('heatmapFilterSdEnable', filters.sdEnabled);
    setValue('heatmapFilterSdValue', filters.sdThreshold);
    setChecked('heatmapFilterAbsEnable', filters.absEnabled);
    setValue('heatmapFilterAbsCount', filters.absCount);
    setValue('heatmapFilterAbsValue', filters.absValue);
    setChecked('heatmapFilterRangeEnable', filters.rangeEnabled);
    setValue('heatmapFilterRangeValue', filters.rangeThreshold);

    const requested = JSON.stringify({ adjust, filters });
    const current = JSON.stringify({ adjust: currentPayload.config?.adjust || {}, filters: currentPayload.config?.filters || {} });
    if(requested === current) return false;
    const trigger = JSON.stringify(adjust) !== JSON.stringify(currentPayload.config?.adjust || {})
      ? logTransform
      : filterToggle;
    trigger?.dispatchEvent?.(new Event('change', { bubbles: true }));
    return !!trigger;
  }

  async function preparePayloadTab(type, tab, reason){
    await activateTab(tab.id, `${reason}-activate`);
    await awaitOwnerReadyForSnapshot(type, tab.id, `${reason}-ready`);
    if(type === 'heatmap' && applyHeatmapDataViewControlVariant(tab)){
      await awaitOwnerReadyForSnapshot(type, tab.id, `${reason}-data-view-ready`);
    }
    persistOwner(type, tab.id, `${reason}-persist`);
    return tab;
  }

  function makeBatchTitle(type, role, index){
    return `Parameter ${type} ${role} ${String(index + 1).padStart(2, '0')}`;
  }

  function createParameterResults(parameters){
    return new Map(parameters.map(parameter => [parameter.key, {
      parameter: parameter.key,
      before: clone(parameter.before),
      after: clone(parameter.after),
      mutationSource: parameter.mutationSource,
      witnesses: { domKey: null, ownerKey: null },
      snapshots: [],
      failures: []
    }]));
  }

  function recordParameterAssertion(results, parameter, state, expected, witness, label){
    const result = results.get(parameter.key);
    const assertion = assertParameterState(state, parameter, expected, witness, label);
    result.snapshots.push(assertion.snapshot);
    result.failures.push(...assertion.failures);
  }

  function collectResultFailures(results){
    const failures = [];
    results.forEach(result => {
      failures.push(...result.failures.map(message => `${result.parameter}: ${message}`));
    });
    return failures;
  }

  api.discoverParameters = discover;
  api.runPersistenceMatrix = async function runPersistenceMatrix(options = {}){
    const type = String(options.type || '').trim();
    const initialTabId = String(options.tabId || '').trim();
    if(!type || !initialTabId) throw new Error('runPersistenceMatrix requires type and tabId');
    const discovered = await discover(type, initialTabId);
    const requestedPaths = new Set((options.parameterPaths || []).map(String));
    const selectedParameters = requestedPaths.size
      ? discovered.parameters.filter(parameter => requestedPaths.has(parameter.key))
      : discovered.parameters;
    const uncovered = selectedParameters.filter(parameter => !parameter.covered).map(parameter => ({
      path: parameter.key,
      reason: parameter.uncoveredReason,
      value: clone(parameter.before)
    })).concat(requestedPaths.size ? [] : (discovered.controlGaps || []));
    const exercised = selectedParameters.filter(item => item.covered);
    const batches = buildParameterBatches(exercised, type);
    const resultMap = createParameterResults(exercised);
    const startedAt = performance.now();
    let currentTabId = initialTabId;
    let archiveCount = 0;
    let batchFailure = null;
    try{
      const baselinePayload = buildParameterVariantPayload(discovered.baseline, exercised, 'before');
      await applyPayload(type, currentTabId, baselinePayload, `persistence-${type}-baseline-batch`);
      const beforeState = await captureBatchState(type, currentTabId, `persistence-${type}-baseline-capture`);
      const batchRecords = [];
      for(let batchIndex = 0; batchIndex < batches.length; batchIndex += 1){
        const batch = batches[batchIndex];
        const variantPayload = buildParameterVariantPayload(discovered.baseline, batch.parameters, 'after');
        const tab = createPayloadTab(type, makeBatchTitle(type, 'B', batchIndex), variantPayload);
        currentTabId = String(tab.id);
        await preparePayloadTab(type, tab, `persistence-${type}-batch-${batchIndex + 1}`);
        const afterState = await captureBatchState(type, currentTabId, `persistence-${type}-batch-${batchIndex + 1}-capture`);
        const witnesses = buildParameterWitnesses(batch.parameters, beforeState, afterState);
        batch.parameters.forEach(parameter => {
          const witness = witnesses.get(parameter.key);
          resultMap.get(parameter.key).witnesses = witness;
          recordParameterAssertion(resultMap, parameter, beforeState, parameter.before, witness, 'baseline');
          recordParameterAssertion(resultMap, parameter, afterState, parameter.after, witness, 'mutated');
        });
        const locator = captureTabLocator(currentTabId, type);
        if(!locator) throw new Error(`could not capture batch ${batchIndex + 1} owner locator`);
        batchRecords.push({ batch, locator });
      }

      closeSeedTabs([initialTabId], batchRecords.map(record => resolveTabLocator(record.locator)?.id).filter(Boolean));
      const archive = await buildArchiveBlob(type, currentTabId, `persistence-${type}-batched-archive`);
      archiveCount = 1;
      await reopenArchiveBlob(archive, `${type}-parameter-batch.graph`, `persistence-${type}-batched-reopen`);
      for(let batchIndex = 0; batchIndex < batchRecords.length; batchIndex += 1){
        const record = batchRecords[batchIndex];
        const reopenedTab = resolveTabLocator(record.locator);
        if(!reopenedTab) throw new Error(`reopen did not preserve batch ${batchIndex + 1}`);
        currentTabId = String(reopenedTab.id);
        const reopenedState = await captureBatchState(type, currentTabId, `persistence-${type}-reopened-${batchIndex + 1}`);
        record.batch.parameters.forEach(parameter => {
          recordParameterAssertion(resultMap, parameter, reopenedState, parameter.after, resultMap.get(parameter.key).witnesses, 'reopen');
        });
      }
    }catch(error){
      batchFailure = `batched persistence execution failed: ${describeError(error)}`;
      resultMap.forEach(result => result.failures.push(batchFailure));
    }
    const results = Array.from(resultMap.values());
    const failures = uncovered.map(item => `${item.path}: ${item.reason}`)
      .concat(collectResultFailures(resultMap));
    return {
      type,
      tabId: initialTabId,
      finalTabId: currentTabId,
      roots: discovered.roots,
      parameterCount: selectedParameters.length,
      exercisedCount: exercised.length,
      classified: discovered.classified,
      synthetic: discovered.synthetic,
      uncovered,
      results,
      failures,
      runtimeMs: Math.round(performance.now() - startedAt),
      batchCount: batches.length,
      archiveCount
    };
  };

  api.runSameTypeIsolation = async function runSameTypeIsolation(options = {}){
    const type = String(options.type || '').trim();
    const initialTabAId = String(options.tabAId || '').trim();
    const initialTabBId = String(options.tabBId || '').trim();
    if(!type || !initialTabAId || !initialTabBId) throw new Error('runSameTypeIsolation requires type, tabAId and tabBId');
    const discoveredA = await discover(type, initialTabAId);
    const discoveredB = await discover(type, initialTabBId);
    const baselineB = discoveredB.baseline;
    const requestedPaths = new Set((options.parameterPaths || []).map(String));
    const selectedParameters = requestedPaths.size
      ? discoveredA.parameters.filter(parameter => requestedPaths.has(parameter.key))
      : discoveredA.parameters;
    const uncovered = selectedParameters.filter(parameter => !parameter.covered).map(parameter => ({
      path: parameter.key,
      reason: parameter.uncoveredReason,
      value: clone(parameter.before)
    })).concat(requestedPaths.size ? [] : (discoveredA.controlGaps || []));
    const exercised = selectedParameters.filter(parameter => parameter.covered);
    const batches = buildParameterBatches(exercised, type);
    const resultMap = createParameterResults(exercised);
    const startedAt = performance.now();
    let currentTabAId = initialTabAId;
    let currentTabBId = initialTabBId;
    let archiveCount = 0;
    try{
      const captureSequence = async (phase, tabAId, tabBId, parameters, witnesses, options = {}) => {
        const sequence = options.singlePass === true
          ? [
              { role: 'A', tabId: tabAId, expectedKey: 'before', sequenceIndex: 1 },
              { role: 'B', tabId: tabBId, expectedKey: 'after', sequenceIndex: 2 }
            ]
          : options.continueAfterInitial === true
          ? [
              { role: 'A', tabId: tabAId, expectedKey: 'before', sequenceIndex: 3 },
              { role: 'B', tabId: tabBId, expectedKey: 'after', sequenceIndex: 4 }
            ]
          : [
              { role: 'A', tabId: tabAId, expectedKey: 'before', sequenceIndex: 1 },
              { role: 'B', tabId: tabBId, expectedKey: 'after', sequenceIndex: 2 },
              { role: 'A', tabId: tabAId, expectedKey: 'before', sequenceIndex: 3 },
              { role: 'B', tabId: tabBId, expectedKey: 'after', sequenceIndex: 4 }
            ];
        for(let index = 0; index < sequence.length; index += 1){
          const step = sequence[index];
          const state = await captureBatchState(type, step.tabId, `${phase}-${step.role}-${step.sequenceIndex}`);
          parameters.forEach(parameter => {
            recordParameterAssertion(
              resultMap,
              parameter,
              state,
              parameter[step.expectedKey],
              witnesses.get(parameter.key),
              `${phase}-${step.role}-${step.sequenceIndex}`
            );
          });
        }
      };

      const batchRecords = [];
      for(let batchIndex = 0; batchIndex < batches.length; batchIndex += 1){
        const batch = batches[batchIndex];
        const payloadA = buildParameterVariantPayload(discoveredA.baseline, batch.parameters, 'before');
        const payloadB = buildParameterVariantPayload(baselineB, batch.parameters, 'after');
        const tabA = createPayloadTab(type, makeBatchTitle(type, 'A', batchIndex), payloadA);
        const tabB = createPayloadTab(type, makeBatchTitle(type, 'B', batchIndex), payloadB);
        currentTabAId = String(tabA.id);
        currentTabBId = String(tabB.id);
        await preparePayloadTab(type, tabA, `parameter-${type}-batch-${batchIndex + 1}-a`);
        const beforeState = await captureBatchState(type, currentTabAId, `switch-batch-${batchIndex + 1}-A-1`, { activate: false });
        await preparePayloadTab(type, tabB, `parameter-${type}-batch-${batchIndex + 1}-b`);
        const afterState = await captureBatchState(type, currentTabBId, `switch-batch-${batchIndex + 1}-B-2`, { activate: false });
        const witnesses = buildParameterWitnesses(batch.parameters, beforeState, afterState);
        batch.parameters.forEach(parameter => {
          resultMap.get(parameter.key).witnesses = witnesses.get(parameter.key);
        });
        batch.parameters.forEach(parameter => {
          recordParameterAssertion(resultMap, parameter, beforeState, parameter.before, witnesses.get(parameter.key), `switch-batch-${batchIndex + 1}-A-1`);
          recordParameterAssertion(resultMap, parameter, afterState, parameter.after, witnesses.get(parameter.key), `switch-batch-${batchIndex + 1}-B-2`);
        });
        await captureSequence(`switch-batch-${batchIndex + 1}`, currentTabAId, currentTabBId, batch.parameters, witnesses, { continueAfterInitial: true });
        const locatorA = captureTabLocator(currentTabAId, type);
        const locatorB = captureTabLocator(currentTabBId, type);
        if(!locatorA || !locatorB) throw new Error(`could not capture batch ${batchIndex + 1} owner locators`);
        batchRecords.push({ batch, witnesses, locatorA, locatorB });
      }
      if(options.reopen !== false){
        closeSeedTabs(
          [initialTabAId, initialTabBId],
          batchRecords.flatMap(record => [
            resolveTabLocator(record.locatorA)?.id,
            resolveTabLocator(record.locatorB)?.id
          ]).filter(Boolean)
        );
        const archive = await buildArchiveBlob(type, currentTabBId, `parameter-${type}-batched-archive`);
        archiveCount = 1;
        await reopenArchiveBlob(archive, `${type}-same-type-parameter-batch.graph`, `parameter-${type}-batched-reopen`);
        for(let batchIndex = 0; batchIndex < batchRecords.length; batchIndex += 1){
          const record = batchRecords[batchIndex];
          const [reopenedA, reopenedB] = resolveReopenedOwners([record.locatorA, record.locatorB]);
          if(!reopenedA || !reopenedB || String(reopenedA.id) === String(reopenedB.id)){
            throw new Error(`reopen did not preserve batch ${batchIndex + 1} tab roles`);
          }
          currentTabAId = String(reopenedA.id);
          currentTabBId = String(reopenedB.id);
          await captureSequence(
            `reopen-switch-batch-${batchIndex + 1}`,
            currentTabAId,
            currentTabBId,
            record.batch.parameters,
            record.witnesses,
            { singlePass: true }
          );
        }
      }
    }catch(error){
      const message = `batched same-type execution failed: ${describeError(error)}`;
      resultMap.forEach(result => result.failures.push(message));
    }
    const results = Array.from(resultMap.values());
    const failures = uncovered.map(item => `${item.path}: ${item.reason}`)
      .concat(collectResultFailures(resultMap));
    return {
      type,
      tabAId: initialTabAId,
      tabBId: initialTabBId,
      finalTabAId: currentTabAId,
      finalTabBId: currentTabBId,
      roots: discoveredA.roots,
      parameterCount: selectedParameters.length,
      exercisedCount: exercised.length,
      classified: discoveredA.classified,
      synthetic: discoveredA.synthetic,
      uncovered,
      results,
      failures,
      runtimeMs: Math.round(performance.now() - startedAt),
      batchCount: batches.length,
      archiveCount
    };
  };

  api.USER_ROOTS = USER_ROOTS;
})(window);
