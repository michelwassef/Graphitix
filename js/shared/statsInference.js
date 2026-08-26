(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const inference = Shared.statsInference = Shared.statsInference || {};

  const CONTROL_KEY = 'statsInference';
  const SCHEMA_VERSION = 1;
  const DEFAULT_ALPHA = 0.05;
  const DEFAULT_TARGET_FDR = 0.05;
  const FDR_METHODS = new Set(['bh', 'by']);
  const FWER_METHODS = new Set([
    'bonferroni', 'holm', 'holm-sidak', 'sidak', 'hochberg',
    'tukey', 'games-howell', 'tamhane-t2', 'dunnett', 'dunnett-t3', 'nemenyi'
  ]);
  const METHOD_ALIASES = Object.freeze({
    'unadjusted': 'none',
    'holm-bonferroni': 'holm',
    'holm_bonferroni': 'holm',
    'holm sidak': 'holm-sidak',
    'holmsidak': 'holm-sidak',
    'holm_sidak': 'holm-sidak',
    'sidak-bonferroni': 'sidak',
    'sidak_bonferroni': 'sidak',
    'fdr': 'bh',
    'benjamini-hochberg': 'bh',
    'benjaminihochberg': 'bh',
    'bh-fdr': 'bh',
    'benjamini-yekutieli': 'by',
    'benjaminiyekutieli': 'by',
    'by-fdr': 'by',
    'gameshowell': 'games-howell',
    'games_howell': 'games-howell',
    'tamhanet2': 'tamhane-t2',
    'tamhane_t2': 'tamhane-t2',
    'dunnettt3': 'dunnett-t3',
    'dunnett_t3': 'dunnett-t3'
  });
  const mountedHosts = new Set();

  function debug(label, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug(`Debug: statsInference.${label}`, payload || {});
    }
  }

  function normalizeTabId(value){
    if(value == null){
      return null;
    }
    const text = String(value).trim();
    return text || null;
  }

  function getActiveTab(){
    return global.Main?.session?.getActiveTab?.() || null;
  }

  function resolveTab(options = {}){
    if(options && typeof options === 'object' && options.id != null && !Object.prototype.hasOwnProperty.call(options, 'tab')){
      return options;
    }
    const explicitTab = options?.tab && typeof options.tab === 'object' ? options.tab : null;
    if(explicitTab?.id != null){
      return explicitTab;
    }
    const tabId = normalizeTabId(options?.tabId || (typeof options?.tab === 'string' ? options.tab : null));
    if(tabId){
      const byGetter = global.Main?.session?.getTabById?.(tabId) || null;
      if(byGetter){
        return byGetter;
      }
      const activeTab = getActiveTab();
      if(normalizeTabId(activeTab?.id) === tabId){
        return activeTab;
      }
      return tabId;
    }
    return getActiveTab();
  }

  function resolveTabId(options = {}){
    const tab = resolveTab(options);
    return normalizeTabId(typeof tab === 'string' ? tab : tab?.id);
  }

  function sanitizeLevel(value, fallback = DEFAULT_ALPHA){
    const fallbackNumeric = Number(fallback);
    const safeFallback = Number.isFinite(fallbackNumeric) && fallbackNumeric > 0 && fallbackNumeric < 1
      ? fallbackNumeric
      : DEFAULT_ALPHA;
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0 || numeric >= 1){
      return safeFallback;
    }
    return numeric;
  }

  function normalizeMethod(method){
    const raw = String(method || 'none').trim().toLowerCase() || 'none';
    return METHOD_ALIASES[raw] || raw;
  }

  function getMethodSemantics(method){
    const key = normalizeMethod(method);
    if(FDR_METHODS.has(key)){
      return Object.freeze({
        method: key,
        criterion: 'fdr',
        errorControl: 'fdr',
        levelLabel: 'Target FDR',
        decisionLabel: 'Discovery',
        negativeDecisionLabel: 'No discovery'
      });
    }
    const errorControl = key === 'none' ? 'unadjusted' : (FWER_METHODS.has(key) ? 'fwer' : 'unadjusted');
    return Object.freeze({
      method: key,
      criterion: 'alpha',
      errorControl,
      levelLabel: errorControl === 'fwer' ? 'Family-wise significance level (α)' : 'Significance level (α)',
      decisionLabel: 'Significant',
      negativeDecisionLabel: 'Not significant'
    });
  }

  function getControlState(tabLike, options = {}){
    const tab = tabLike != null ? tabLike : resolveTab(options);
    const tabId = normalizeTabId(typeof tab === 'string' ? tab : tab?.id);
    if(!tabId || !Shared.workspaceTabs){
      return null;
    }
    try{
      const values = options.create === true
        ? Shared.workspaceTabs.ensureSharedControlState?.(tab, CONTROL_KEY, {
            tabId,
            reason: options.reason || 'stats-inference-state-ensure'
          })
        : Shared.workspaceTabs.getSharedControlState?.(tab, CONTROL_KEY, {
            tabId,
            reason: options.reason || 'stats-inference-state-read'
          });
      return values && typeof values === 'object' ? values : null;
    }catch(error){
      debug('stateError', { tabId, reason: options.reason || null, message: error?.message || String(error) });
      return null;
    }
  }

  function readState(options = {}){
    const tab = resolveTab(options);
    const sharedState = getControlState(tab, { create: false, reason: options.reason || 'stats-inference-read' });
    return {
      schemaVersion: SCHEMA_VERSION,
      alpha: sanitizeLevel(sharedState?.alpha, DEFAULT_ALPHA),
      targetFdr: sanitizeLevel(sharedState?.targetFdr, DEFAULT_TARGET_FDR)
    };
  }

  function writeState(partial, options = {}){
    const tab = resolveTab(options);
    const tabId = normalizeTabId(typeof tab === 'string' ? tab : tab?.id);
    if(!tabId){
      return readState(options);
    }
    const previous = readState({ tab, reason: 'stats-inference-write-previous' });
    const next = {
      schemaVersion: SCHEMA_VERSION,
      alpha: Object.prototype.hasOwnProperty.call(partial || {}, 'alpha')
        ? sanitizeLevel(partial.alpha, previous.alpha)
        : previous.alpha,
      targetFdr: Object.prototype.hasOwnProperty.call(partial || {}, 'targetFdr')
        ? sanitizeLevel(partial.targetFdr, previous.targetFdr)
        : previous.targetFdr
    };
    const sharedState = getControlState(tab, { create: true, reason: options.reason || 'stats-inference-write' });
    if(sharedState){
      sharedState.alpha = next.alpha;
      sharedState.targetFdr = next.targetFdr;
      sharedState.schemaVersion = SCHEMA_VERSION;
    }
    return next;
  }

  function persistStateForTab(tabId, options = {}){
    const key = normalizeTabId(tabId);
    const sessionApi = global.Main?.session || null;
    const activeTab = sessionApi?.getActiveTab?.() || null;
    if(!key || normalizeTabId(activeTab?.id) !== key){
      debug('persistSkipped', { tabId: key, activeTabId: activeTab?.id || null, source: options.source || null });
      return false;
    }
    try{
      if(typeof sessionApi.updateTabPayload === 'function'){
        return sessionApi.updateTabPayload(activeTab, draft => {
          const payload = draft && typeof draft === 'object' && !Array.isArray(draft)
            ? draft
            : { type: activeTab.type || null };
          if(!payload.meta || typeof payload.meta !== 'object' || Array.isArray(payload.meta)){
            payload.meta = {};
          }
          payload.meta.statsInference = readState({ tab: activeTab, reason: 'stats-inference-persist-read' });
          return payload;
        }, {
          reason: options.reason || 'stats-inference-state-change',
          origin: 'user'
        }) !== false;
      }
      const persistOptions = {
        reason: options.reason || 'stats-inference-state-change',
        origin: 'user',
        affectsPayload: true,
        snapshotIntent: {
          captureLivePayload: true,
          allowSkipLivePayloadCapture: false
        }
      };
      if(typeof sessionApi.persistUserModifiedTabState === 'function'){
        return sessionApi.persistUserModifiedTabState(activeTab, persistOptions) !== false;
      }
      if(typeof sessionApi.persistActiveTabState === 'function'){
        return sessionApi.persistActiveTabState(activeTab, persistOptions) !== false;
      }
    }catch(error){
      debug('persistError', { tabId: key, message: error?.message || String(error) });
    }
    return false;
  }

  function dispatchChange(previous, next, options = {}){
    const tabId = resolveTabId(options);
    try{
      if(typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function'){
        global.dispatchEvent(new global.CustomEvent('stats:inference-change', {
          detail: {
            tabId,
            previous,
            next,
            changed: {
              alpha: previous.alpha !== next.alpha,
              targetFdr: previous.targetFdr !== next.targetFdr
            },
            source: options.source || null,
            reason: options.reason || null
          }
        }));
      }
    }catch(error){
      debug('dispatchError', { tabId, message: error?.message || String(error) });
    }
    refreshMountedControlsForTab(tabId);
  }

  function setState(partial, options = {}){
    const tab = resolveTab(options);
    const tabId = normalizeTabId(typeof tab === 'string' ? tab : tab?.id);
    const previous = readState({ tab, reason: 'stats-inference-set-previous' });
    const next = writeState(partial, { tab, reason: options.reason || 'stats-inference-set' });
    if(previous.alpha !== next.alpha || previous.targetFdr !== next.targetFdr){
      if(options.persist !== false && tabId){
        persistStateForTab(tabId, options);
      }
      dispatchChange(previous, next, { ...options, tab, tabId });
    }else{
      refreshMountedControlsForTab(tabId);
    }
    return next;
  }

  function makeDecisionSpec(options = {}){
    const methodSemantics = getMethodSemantics(options.method);
    const state = readState(options);
    const criterion = options.criterion === 'fdr' || options.criterion === 'alpha'
      ? options.criterion
      : methodSemantics.criterion;
    const level = sanitizeLevel(
      options.level,
      criterion === 'fdr' ? state.targetFdr : state.alpha
    );
    const isFdr = criterion === 'fdr';
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      criterion,
      level,
      method: normalizeMethod(options.method),
      errorControl: isFdr ? 'fdr' : (methodSemantics.errorControl === 'fdr' ? 'unadjusted' : methodSemantics.errorControl),
      valueKind: options.valueKind || (normalizeMethod(options.method) === 'none' ? 'raw-p' : 'adjusted-p'),
      decisionLabel: options.decisionLabel || (isFdr ? 'Discovery' : 'Significant'),
      negativeDecisionLabel: options.negativeDecisionLabel || (isFdr ? 'No discovery' : 'Not significant')
    });
  }

  function createSnapshot(options = {}){
    const state = readState(options);
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      alpha: state.alpha,
      targetFdr: state.targetFdr
    };
    if(options.includeOverall !== false){
      snapshot.overall = makeDecisionSpec({
        ...options,
        criterion: 'alpha',
        method: 'none',
        valueKind: 'raw-p'
      });
    }
    if(options.includeComparisons === true || options.method != null){
      snapshot.comparisons = makeDecisionSpec({
        ...options,
        method: options.method || 'none'
      });
    }
    return Object.freeze(snapshot);
  }

  function classifyPValue(pValue, spec){
    const numeric = Number(pValue);
    const normalizedSpec = spec && typeof spec === 'object'
      ? makeDecisionSpec(spec)
      : makeDecisionSpec({});
    if(!Number.isFinite(numeric) || numeric < 0 || numeric > 1){
      return Object.freeze({
        valid: false,
        meetsCriterion: false,
        token: '',
        label: '',
        criterion: normalizedSpec.criterion,
        level: normalizedSpec.level
      });
    }
    const meetsCriterion = numeric <= normalizedSpec.level;
    const isFdr = normalizedSpec.criterion === 'fdr';
    return Object.freeze({
      valid: true,
      meetsCriterion,
      token: isFdr ? (meetsCriterion ? 'Discovery' : 'No discovery') : (meetsCriterion ? '*' : 'NS'),
      label: meetsCriterion ? normalizedSpec.decisionLabel : normalizedSpec.negativeDecisionLabel,
      criterion: normalizedSpec.criterion,
      level: normalizedSpec.level,
      method: normalizedSpec.method,
      valueKind: normalizedSpec.valueKind
    });
  }

  function formatLevel(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return '0.05';
    }
    if(numeric >= 0.001){
      return numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    }
    return numeric.toExponential(2).replace(/\.0+(?=e)/, '').replace(/e\+?(-?)0+/, 'e$1');
  }

  function createLevelField(documentRef, config){
    const label = documentRef.createElement('label');
    label.className = 'stats-inference-controls__field';
    const labelText = documentRef.createElement('span');
    labelText.className = 'stats-inference-controls__label';
    labelText.textContent = config.label;
    const input = documentRef.createElement('input');
    input.type = 'number';
    input.min = '0.000001';
    input.max = '0.999999';
    input.step = '0.001';
    input.className = 'stats-inference-controls__input';
    input.dataset.statsInferenceKey = config.key;
    input.setAttribute('data-undo-ignore', '1');
    input.setAttribute('aria-label', config.label);
    label.appendChild(labelText);
    label.appendChild(input);
    return { label, input };
  }

  function normalizeMountConfig(host, options = {}){
    const methodProvider = typeof options.method === 'function' ? options.method : () => options.method || 'none';
    const includeOverallProvider = typeof options.includeOverall === 'function' ? options.includeOverall : () => options.includeOverall !== false;
    const includeComparisonsProvider = typeof options.includeComparisons === 'function' ? options.includeComparisons : () => options.includeComparisons === true;
    const tabIdProvider = typeof options.tabId === 'function' ? options.tabId : () => options.tabId;
    return {
      host,
      tabIdProvider,
      methodProvider,
      includeOverallProvider,
      includeComparisonsProvider,
      onChange: typeof options.onChange === 'function' ? options.onChange : null,
      source: options.source || host.id || 'stats-inference-control',
      compact: options.compact === true
    };
  }

  function getMountTabId(config){
    const provided = config?.tabIdProvider?.();
    return normalizeTabId(provided) || resolveTabId({});
  }

  function syncMountedHost(host){
    const config = host?.__statsInferenceMount;
    if(!config || !host.ownerDocument){
      return false;
    }
    const tabId = getMountTabId(config);
    const method = normalizeMethod(config.methodProvider());
    const semantics = getMethodSemantics(method);
    const includeOverall = !!config.includeOverallProvider();
    const includeComparisons = !!config.includeComparisonsProvider();
    const state = readState({ tabId });
    const needsFdr = includeComparisons && semantics.criterion === 'fdr';
    const needsAlpha = includeOverall || (includeComparisons && !needsFdr);

    host.classList.add('stats-inference-controls');
    host.classList.toggle('stats-inference-controls--compact', config.compact);
    host.dataset.statsInferenceTabId = tabId || '';
    host.dataset.statsInferenceMethod = method;
    host.replaceChildren();

    if(needsAlpha){
      const alphaLabel = includeOverall && needsFdr
        ? 'Overall-test significance level (α)'
        : (!includeOverall && includeComparisons && semantics.errorControl === 'fwer'
          ? 'Family-wise significance level (α)'
          : 'Significance level (α)');
      const field = createLevelField(host.ownerDocument, { key: 'alpha', label: alphaLabel });
      field.input.value = formatLevel(state.alpha);
      field.input.addEventListener('change', () => {
        const previous = readState({ tabId });
        const next = setState({ alpha: field.input.value }, {
          tabId,
          source: config.source,
          reason: 'stats-inference-alpha-change',
          persist: true
        });
        field.input.value = formatLevel(next.alpha);
        config.onChange?.({ key: 'alpha', previous, next, tabId, method });
      });
      host.appendChild(field.label);
    }

    if(needsFdr){
      const field = createLevelField(host.ownerDocument, {
        key: 'targetFdr',
        label: includeOverall ? 'Pairwise target FDR' : 'Target FDR'
      });
      field.input.value = formatLevel(state.targetFdr);
      field.input.addEventListener('change', () => {
        const previous = readState({ tabId });
        const next = setState({ targetFdr: field.input.value }, {
          tabId,
          source: config.source,
          reason: 'stats-inference-fdr-change',
          persist: true
        });
        field.input.value = formatLevel(next.targetFdr);
        config.onChange?.({ key: 'targetFdr', previous, next, tabId, method });
      });
      host.appendChild(field.label);
    }

    const help = host.ownerDocument.createElement('span');
    help.className = 'stats-inference-controls__help';
    if(needsFdr && includeOverall){
      help.textContent = `Overall tests use α = ${formatLevel(state.alpha)}; ${semantics.method.toUpperCase()} pairwise discoveries use target FDR = ${formatLevel(state.targetFdr)}.`;
    }else if(needsFdr){
      help.textContent = `${semantics.method.toUpperCase()}-adjusted p-values are compared with target FDR = ${formatLevel(state.targetFdr)}.`;
    }else if(includeComparisons && method !== 'none'){
      const correctionMeta = ['bonferroni','holm','holm-sidak','sidak','hochberg','none'].includes(method)
        ? Shared.stats?.getCorrectionMeta?.(method)
        : null;
      const methodLabel = correctionMeta?.shortLabel || method.replace(/(^|[-_])([a-z])/g, (_m, sep, ch) => `${sep ? ' ' : ''}${ch.toUpperCase()}`);
      help.textContent = includeOverall
        ? `Overall tests use α = ${formatLevel(state.alpha)}; ${methodLabel}-adjusted pairwise p-values use the same α.`
        : `${methodLabel}-adjusted p-values are compared with family-wise α = ${formatLevel(state.alpha)}.`;
    }else{
      help.textContent = `Results are interpreted at α = ${formatLevel(state.alpha)}.`;
    }
    host.appendChild(help);
    host.hidden = !needsAlpha && !needsFdr;
    return true;
  }

  function mountControls(host, options = {}){
    if(!host || host.nodeType !== 1){
      return null;
    }
    host.__statsInferenceMount = normalizeMountConfig(host, options);
    mountedHosts.add(host);
    syncMountedHost(host);
    return {
      host,
      refresh(){ syncMountedHost(host); },
      destroy(){
        mountedHosts.delete(host);
        delete host.__statsInferenceMount;
        host.replaceChildren();
      }
    };
  }

  function refreshMountedControlsForTab(tabId){
    const key = normalizeTabId(tabId);
    for(const host of Array.from(mountedHosts)){
      if(!host || !host.isConnected){
        mountedHosts.delete(host);
        continue;
      }
      const config = host.__statsInferenceMount;
      if(!config){
        mountedHosts.delete(host);
        continue;
      }
      const hostTabId = getMountTabId(config);
      if(!key || !hostTabId || hostTabId === key){
        syncMountedHost(host);
      }
    }
  }

  inference.DEFAULT_ALPHA = DEFAULT_ALPHA;
  inference.DEFAULT_TARGET_FDR = DEFAULT_TARGET_FDR;
  inference.sanitizeLevel = sanitizeLevel;
  inference.normalizeMethod = normalizeMethod;
  inference.getMethodSemantics = getMethodSemantics;
  inference.getState = readState;
  inference.setState = setState;
  inference.getAlpha = options => readState(options).alpha;
  inference.getTargetFdr = options => readState(options).targetFdr;
  inference.getComparisonLevel = function getComparisonLevel(options = {}){
    const semantics = getMethodSemantics(options.method);
    const state = readState(options);
    return semantics.criterion === 'fdr' ? state.targetFdr : state.alpha;
  };
  inference.createDecisionSpec = makeDecisionSpec;
  inference.createSnapshot = createSnapshot;
  inference.classifyPValue = classifyPValue;
  inference.formatLevel = formatLevel;
  inference.mountControls = mountControls;
  inference.refreshMountedControls = refreshMountedControlsForTab;
  inference.persistStateForTab = persistStateForTab;

  inference.captureTabState = function captureTabState(tabLike){
    const stored = getControlState(tabLike, { create: false, reason: 'stats-inference-capture' });
    if(!stored || (!Object.prototype.hasOwnProperty.call(stored, 'alpha') && !Object.prototype.hasOwnProperty.call(stored, 'targetFdr'))){
      return null;
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      alpha: sanitizeLevel(stored.alpha, DEFAULT_ALPHA),
      targetFdr: sanitizeLevel(stored.targetFdr, DEFAULT_TARGET_FDR)
    };
  };

  inference.applyTabState = function applyTabState(tabLike, source = {}, options = {}){
    const hasPersistedState = !!source && typeof source === 'object' && (
      Object.prototype.hasOwnProperty.call(source, 'alpha')
      || Object.prototype.hasOwnProperty.call(source, 'targetFdr')
    );
    const tabId = normalizeTabId(typeof tabLike === 'string' ? tabLike : tabLike?.id);
    if(!hasPersistedState){
      Shared.workspaceTabs?.clearSharedControlState?.(tabLike, CONTROL_KEY, {
        tabId,
        reason: options.reason || 'stats-inference-apply-empty'
      });
      refreshMountedControlsForTab(tabId);
      return null;
    }
    const next = writeState({
      alpha: Object.prototype.hasOwnProperty.call(source, 'alpha') ? source.alpha : DEFAULT_ALPHA,
      targetFdr: Object.prototype.hasOwnProperty.call(source, 'targetFdr') ? source.targetFdr : DEFAULT_TARGET_FDR
    }, {
      tab: tabLike,
      reason: options.reason || 'stats-inference-apply'
    });
    refreshMountedControlsForTab(tabId);
    return next;
  };

})(window);
