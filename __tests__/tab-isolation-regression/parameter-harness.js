(function(global){
  'use strict';

  const api = global.GraphitixParameterIsolation = global.GraphitixParameterIsolation || {};
  const USER_ROOTS = Object.freeze({
    venn: ['style', 'analysis', 'notes', 'meta'],
    box: ['config', 'style', 'notes', 'meta'],
    scatter: ['config', 'style', 'notes', 'meta'],
    pca: ['config', 'style', 'notes', 'meta'],
    line: ['config', 'style', 'notes', 'meta'],
    heatmap: ['config', 'style', 'notes', 'meta'],
    surface: ['config', 'style', 'notes', 'meta'],
    roc: ['config', 'style', 'notes', 'meta'],
    survival: ['config', 'style', 'notes', 'meta'],
    hist: ['config', 'style', 'notes', 'meta'],
    pie: ['config', 'style', 'notes', 'meta']
  });

  const DERIVED_PATH = /(?:^|\.)(?:results?|resultModel|reportModel|precomputed|summary|lastSummary|lastStats|statsPanelModel|annotationModel|assumptions|cache|signature|schemaVersion|payloadVersion|contextVersion|lastRunVersion|computedAt|updatedAt|savedAt|capturedAt|runtimeGeneration|fileHandle)(?:\.|$)/i;
  const DOCUMENT_METADATA_PATH = /(?:^|\.)(?:fileName|filePath|documentId)(?:\.|$)/i;
  const NON_PARAMETER_SELECTION_PATH = /(?:^|\.)selectedRows(?:\.|$)/i;
  const DERIVED_PROJECTION_PATH = /(?:^|\.)(?:colorSchemeUserOverride|legendAutoHidden)(?:\.|$)|(?:^|\.)(?:stats|analysis)\.version(?:\.|$)|(?:^|\.)rotation\.quaternion(?:\.|$)|(?:^|\.)labelPositions?\.[^.]+\.(?:relX|relY|originX|originY)(?:\.|$)/i;
  const META_TECHNICAL_PATH = /^meta\.graphSizing\.(?:version|export(?:\..+)?|display\.(?:defaultWidthPx|defaultHeightPx|minWidthPx|minHeightPx|maxWidthPx|maxHeightPx|aspectRatio|allowUnlimitedWidth|allowUnlimitedHeight))$/i;
  const VENN_DERIVED_ANALYSIS_PATH = /^analysis\.(?:goResult|goFormatted|goOrganism|goPerformed|stringSvg|stringEnrichment|stringPerformed|speciesIndicator|lastSignificance|significancePanelModel)(?:\.|$)/i;
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

  function mergeMissingShape(target, source){
    if(!source || typeof source !== 'object') return target;
    if(Array.isArray(source)){
      return Array.isArray(target) ? target : clone(source);
    }
    const output = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
    Object.keys(source).forEach(key => {
      const sourceValue = source[key];
      if(!Object.prototype.hasOwnProperty.call(output, key) || output[key] === undefined){
        output[key] = clone(sourceValue);
      }else if(sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)){
        output[key] = mergeMissingShape(output[key], sourceValue);
      }
    });
    return output;
  }



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

  function explicitClassification(path){
    const key = pathKey(path);
    if(VENN_DERIVED_ANALYSIS_PATH.test(key)) return 'derived-analysis';
    if(DERIVED_PATH.test(key)) return 'derived';
    if(DOCUMENT_METADATA_PATH.test(key)) return 'document-metadata';
    if(NON_PARAMETER_SELECTION_PATH.test(key)) return 'selection-state-not-parameter';
    if(DERIVED_PROJECTION_PATH.test(key)) return 'derived-projection';
    if(META_TECHNICAL_PATH.test(key)) return 'technical-meta';
    return null;
  }

  function collectLeaves(value, path, output, classified){
    const reason = explicitClassification(path);
    if(reason){
      classified.push({ path: pathKey(path), reason });
      return;
    }
    if(Array.isArray(value)){
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
    await settle(options.draw === true ? (type === 'hist' ? 180 : 100) : 0);
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
    ['significancethreshold', ['significance', 'threshold']],
    ['colors', ['fill', 'color']],
    ['fillcolors', ['fill', 'color']],
    ['bordercolors', ['stroke', 'border', 'color']],
    ['color', ['color', 'fill', 'stroke']],
    ['opacity', ['opacity', 'alpha']]
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
    const group = element.closest?.('fieldset, .form-row, .control-row, .box-stats-options__row, .stats-control-row, [data-setting-group]');
    const groupText = group ? String(group.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160) : '';
    const identity = attrs.map(name => String(element.getAttribute?.(name) || '')).filter(Boolean).concat(labelText, groupText).join(' ');
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
    const controls = persistentParameterControls(root)
      .map((element, index) => elementDescriptor(element, index));
    const ranked = controls.map(item => ({ ...item, ...scoreControl(item, path, current) }))
      // A coincidentally equal primitive value is never enough to identify a control.
      .filter(item => item.semanticScore > 0)
      .sort((a, b) => b.score - a.score || b.semanticScore - a.semanticScore || a.index - b.index);
    return ranked[0] || null;
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
    const delta = Number.isFinite(step) && step > 0 ? step : (Number.isInteger(numeric) ? 1 : Math.max(0.1, Math.abs(numeric) * 0.2 || 0.5));
    let next;
    if(/(?:opacity|alpha|ratio|fraction|threshold)/i.test(key) && numeric >= 0 && numeric <= 1){
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
      mode: { auto: 'manual', manual: 'auto', linear: 'quadratic', quadratic: 'linear' },
      colors: { unified: 'individual', individual: 'unified' },
      colormode: { auto: 'individual', individual: 'auto', unified: 'individual' },
      colorscheme: { scientific: 'soft', soft: 'normal', normal: 'grayscale', grayscale: 'colorblind', colorblind: 'scientific', dark: 'scientific' },
      densitypalette: { viridis: 'plasma', plasma: 'viridis' },
      stattype: { auto: 'pearson', pearson: 'spearman', spearman: 'pearson' },
      shape: { circle: 'diamond', diamond: 'square', square: 'circle', triangle: 'diamond' },
      display: { panels: 'overlay', overlay: 'panels' },
      arrangement: { vertical: 'grid', grid: 'vertical' },
      sort: { 'size-desc': 'degree-desc', 'degree-desc': 'size-desc', 'size-asc': 'degree-asc', 'degree-asc': 'size-asc' }
    };
    return maps[key]?.[value];
  }

  function buildAlternative(path, current, root){
    const key = lowerPath(path);
    const control = /^meta\.graphSizing\./i.test(pathKey(path)) ? null : findControl(root, path, current);
    const el = control?.element || null;
    const controlDomKey = el ? controlObservableKey(root, el) : null;
    if(el instanceof global.HTMLInputElement && el.type === 'radio'){
      const name = String(el.name || '').trim();
      const radios = name
        ? Array.from(root.querySelectorAll('input[type="radio"]')).filter(candidate => String(candidate.name || '') === name && !candidate.disabled)
        : [el];
      const alternative = radios.find(candidate => String(candidate.value) !== String(current));
      if(alternative){
        return { covered: true, value: String(alternative.value), source: 'radio', controlIndex: control.index, controlDomKey };
      }
    }
    if(el instanceof global.HTMLSelectElement){
      const options = Array.from(el.options).filter(option => !option.disabled && String(option.value) !== String(el.value));
      if(options.length) return { covered: true, value: options[0].value, source: 'select', controlIndex: control.index, controlDomKey };
    }
    if(typeof current === 'boolean') return { covered: true, value: !current, source: el?.type === 'checkbox' ? 'checkbox' : 'boolean', controlIndex: control?.index ?? null, controlDomKey };
    if(typeof current === 'number' && Number.isFinite(current)){
      const next = numericAlternative(current, el, key);
      if(next !== undefined && !equivalent(next, current)) return { covered: true, value: next, source: el ? 'numeric-control' : 'numeric', controlIndex: control?.index ?? null, controlDomKey };
    }
    if(typeof current === 'string'){
      const trimmed = current.trim();
      if(el instanceof global.HTMLInputElement && el.type === 'color'){
        return { covered: true, value: trimmed.toLowerCase() === '#2468ac' ? '#ac2468' : '#2468ac', source: 'color-control', controlIndex: control.index, controlDomKey };
      }
      if(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)){
        const next = numericAlternative(Number(trimmed), el, key);
        if(next !== undefined && !equivalent(next, current)) return { covered: true, value: String(next), source: el ? 'numeric-control-string' : 'numeric-string', controlIndex: control?.index ?? null, controlDomKey };
      }
      if(/^#[0-9a-f]{3,8}$/i.test(trimmed) || /color$/i.test(leafName(path))){
        return { covered: true, value: trimmed.toLowerCase() === '#2468ac' ? '#ac2468' : '#2468ac', source: 'color', controlIndex: control?.index ?? null, controlDomKey };
      }
      const enumValue = enumAlternative(path, current);
      if(enumValue !== undefined) return { covered: true, value: enumValue, source: 'enum-map', controlIndex: control?.index ?? null, controlDomKey };
      if(el && !(el instanceof global.HTMLSelectElement)){
        return { covered: true, value: `${current || leafName(path)}__tabB`, source: 'text-control', controlIndex: control.index, controlDomKey };
      }
      if(/(?:title|subtitle|label|text|note|caption|prefix|suffix)$/i.test(leafName(path))){
        return { covered: true, value: `${current || leafName(path)}__tabB`, source: 'text', controlIndex: control?.index ?? null, controlDomKey };
      }
    }
    if(current === null || current === undefined){
      if(el instanceof global.HTMLInputElement && el.type === 'checkbox') return { covered: true, value: true, source: 'nullable-checkbox', controlIndex: control.index, controlDomKey };
      if(el instanceof global.HTMLInputElement && ['number', 'range'].includes(el.type)){
        const next = numericAlternative(Number(el.value || 0), el, key);
        return { covered: true, value: next, source: 'nullable-numeric-control', controlIndex: control.index, controlDomKey };
      }
    }
    return { covered: false, reason: 'no-valid-alternative' };
  }

  function isPersistentParameterControl(element){
    if(!element || element.disabled) return false;
    const type = String(element.type || '').toLowerCase();
    if(['file', 'hidden', 'button', 'submit', 'reset', 'image'].includes(type)) return false;
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
    if(/(?:transform.*(?:multimode|customexpr)|publication style.*preset)/i.test(semanticIdentity)) return 'action-control';
    if(element?.matches?.('.export-select, .resizer-zoom-input, [data-publication-preset]') || element?.closest?.('[data-publication-preset]')) return 'action-control';
    if(/^(?:label[ABC]|list[ABC]|n(?:A|B|C|AB|AC|BC|ABC))$/i.test(id)) return 'data-entry-control';
    return null;
  }

  function persistentParameterControls(root){
    if(!root?.querySelectorAll) return [];
    return Array.from(root.querySelectorAll('input, select, textarea')).filter(isPersistentParameterControl);
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
    const rotationMatch = key.match(/^(.*\.rotation)\.(x|y|z)$/i);
    if(rotationMatch){
      const rotationPath = rotationMatch[1].split('.');
      const rotation = getAtPath(payload, rotationPath);
      // Quaternion is a derived representation of the user-visible Euler rotation.
      // Removing it lets the component rebuild a coherent quaternion while only the
      // logical x/y/z parameter under test changes.
      if(rotation && typeof rotation === 'object') delete rotation.quaternion;
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
      'data-graph-title', 'data-axis-label', 'data-legend-key', 'data-layer', 'class'
    ];
    for(const attr of semanticAttrs){
      const value = String(element.getAttribute?.(attr) || '').trim();
      if(value) return `${tag}[${attr}=${value}]`;
    }
    return `${tag}@${index}`;
  }

  function controlObservableKey(root, element){
    if(!root || !element) return null;
    const controls = Array.from(root.querySelectorAll('input,select,textarea,[aria-pressed],[aria-checked]'));
    const index = controls.indexOf(element);
    if(index < 0) return null;
    const key = domNodeKey(element, index);
    if(element instanceof global.HTMLInputElement && element.type === 'checkbox') return `${key}.checked`;
    if(element instanceof global.HTMLInputElement && element.type === 'radio'){
      const name = String(element.name || '').trim();
      return name ? `radio[name=${name}].selectedValue` : `${key}.selectedValue`;
    }
    if('value' in element) return `${key}.value`;
    if(element.hasAttribute?.('aria-pressed')) return `${key}.aria-pressed`;
    if(element.hasAttribute?.('aria-checked')) return `${key}.aria-checked`;
    return null;
  }

  function captureDomObservables(tabId, type){
    const root = getMountedRoot(tabId, type);
    const values = {};
    if(!root) return values;
    const rootControls = Array.from(root.querySelectorAll('input,select,textarea,[aria-pressed],[aria-checked]'));
    const externalControls = Array.from(global.document.querySelectorAll('input,select,textarea,[aria-pressed],[aria-checked]'))
      .filter(el => !root.contains(el));
    rootControls.concat(externalControls).forEach((el, index) => {
      const external = !root.contains(el);
      const key = `${external ? 'active-ui:' : ''}${domNodeKey(el, index)}`;
      if(el instanceof global.HTMLInputElement && el.type === 'checkbox') values[`${key}.checked`] = !!el.checked;
      else if(el instanceof global.HTMLInputElement && el.type === 'radio'){
        const name = String(el.name || '').trim();
        if(el.checked){
          values[name ? `radio[name=${name}].selectedValue` : `${key}.selectedValue`] = String(el.value ?? '');
        }
      }else if('value' in el) values[`${key}.value`] = String(el.value ?? '');
      if(el.hasAttribute?.('aria-pressed')) values[`${key}.aria-pressed`] = el.getAttribute('aria-pressed') === 'true';
      if(el.hasAttribute?.('aria-checked')) values[`${key}.aria-checked`] = el.getAttribute('aria-checked') === 'true';
    });
    const visualSelector = 'svg, svg *, .svgbox, [data-graph-aspect-locked], [data-resizer-aspect-locked]';
    Array.from(root.querySelectorAll(visualSelector)).forEach((el, index) => {
      const key = `visual:${domNodeKey(el, index)}`;
      ['fill','stroke','stroke-width','opacity','font-size','font-family','font-weight','font-style','width','height','x','y','cx','cy','transform','data-graph-aspect-locked','data-resizer-aspect-locked'].forEach(attr => {
        if(el.hasAttribute?.(attr)) values[`${key}.${attr}`] = String(el.getAttribute(attr));
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
      value.forEach((entry, index) => flattenPrimitives(entry, `${prefix}[${index}]`, output, seen, depth + 1));
    }else{
      Object.keys(value).sort().forEach(key => {
        if(/(?:capturedAt|updatedAt|createdAt|runtimeGeneration)$/i.test(key)) return;
        if(/^(?:ui|refs|root|hot|managers|cache|workers|timers)$/i.test(key)) return;
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
      componentSession = component?.__testHooks?.getSession?.(tabId) || null;
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
      aspectLocked: layoutSizingRecord.display.aspectLocked === true
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

  function isDirectLabelCoordinatePath(path){
    return /(?:^|\.)labelPositions?\.[^.]+\.(?:x|y)$/i.test(pathKey(path));
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
    // Draggable SVG labels are not uniformly tagged across components. For a
    // label x/y coordinate, a single exact before->after transition is still a
    // parameter-specific witness; ambiguity is rejected instead of fingerprinted.
    if(isDirectLabelCoordinatePath(parameter.path) && exactTransitions.length === 1){
      return exactTransitions[0];
    }
    return null;
  }

  async function captureBatchState(type, tabId, reason){
    await activateTab(tabId, reason || 'parameter-isolation-batch-capture');
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
        ownerValue
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

  function synthesizeDirectManipulationState(baseline){
    const synthetic = [];
    const fixedRoles = ['title', 'xLabel', 'yLabel', 'legend'];
    let ordinal = 0;
    const visit = (value, path = []) => {
      if(!value || typeof value !== 'object' || Array.isArray(value)) return;
      Object.keys(value).forEach(key => {
        const nextPath = path.concat(key);
        const child = value[key];
        if(/^showLegend$/i.test(String(key)) && typeof child === 'boolean' && child === false){
          value[key] = true;
          synthetic.push({ path: pathKey(nextPath), source: 'label-position-visibility-prerequisite' });
        }
        if(/^labelPositions?$/i.test(String(key)) && child && typeof child === 'object' && !Array.isArray(child)){
          fixedRoles.forEach(role => {
            if(Object.prototype.hasOwnProperty.call(child, role) && child[role] == null){
              const x = 150 + ((ordinal % 4) * 23);
              const y = 90 + ((ordinal % 5) * 19);
              child[role] = { x, y };
              synthetic.push({ path: pathKey(nextPath.concat(role)), source: 'explicit-label-position-fixture' });
              ordinal += 1;
            }
          });
        }
        visit(child, nextPath);
      });
    };
    visit(baseline, []);
    return synthetic;
  }

  function synthesizeSharedUserState(type, tabId, baseline, root){
    const synthetic = [];
    const thresholdControl = root?.querySelector?.('.stats-significance-controls__input') || null;
    if(thresholdControl){
      const path = ['meta', 'statsReporting', 'significanceThreshold'];
      const threshold = Number(global.Shared?.statsReporting?.getSignificanceThreshold?.({
        target: thresholdControl.closest?.('[data-stats-reporting]') || thresholdControl,
        tabId
      }));
      const fallback = Number(thresholdControl.value);
      const value = Number.isFinite(threshold) ? threshold : (Number.isFinite(fallback) ? fallback : 0.05);
      if(getAtPath(baseline, path) === undefined){
        setAtPath(baseline, path, value);
        synthetic.push({ path: pathKey(path), source: 'shared-stats-control-default' });
      }
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
      const entries = [
        [['meta', 'graphSizing', 'display', 'widthPx'], width],
        [['meta', 'graphSizing', 'display', 'heightPx'], height],
        [['meta', 'graphSizing', 'display', 'aspectLocked'], locked]
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
    // Discovery is read-only. The stored tab payload is already the canonical source
    // of truth, so forcing a live persistence capture here would both be unnecessary
    // and could perturb the very baseline the matrix is meant to audit.
    await activateTab(tabId, `parameter-discovery-${type}`);
    const component = getComponent(type);
    const storedBaseline = captureCanonicalPayload(type, tabId, `parameter-discovery-${type}-payload`) || { type };
    let template = null;
    try{
      template = component?.createEmptyPayload?.() || null;
    }catch(error){
      template = null;
    }
    const baseline = mergeMissingShape(clone(storedBaseline), clone(template));
    const root = getMountedRoot(tabId, type);
    const synthetic = [
      ...synthesizeDirectManipulationState(baseline),
      ...synthesizeSharedUserState(type, tabId, baseline, root)
    ];
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

  function parameterBatchKey(parameter){
    return String(parameter.path[0] || parameter.key || 'parameters');
  }

  function buildParameterBatches(parameters){
    const batches = new Map();
    parameters.forEach(parameter => {
      const key = parameterBatchKey(parameter);
      const batch = batches.get(key) || { key, parameters: [] };
      batch.parameters.push(parameter);
      batches.set(key, batch);
    });
    return Array.from(batches.values());
  }

  function createPayloadTab(type, title){
    const session = global.Main?.session;
    const workspace = getWorkspace();
    if(!session?.createTab || !workspace) throw new Error('workspace tab creation unavailable');
    const tab = session.createTab({ type, title, payload: { type } });
    workspace.tabs.push(tab);
    if(typeof session.assignTabPayload === 'function'){
      session.assignTabPayload(tab, { type }, { reason: 'parameter-isolation-batch-tab' });
    }
    global.Main?.tabs?.renderTabs?.();
    return tab;
  }

  function batchNeedsDraw(batch){
    return batch?.parameters?.some(parameter => /(?:^|\.)labelPositions?\./i.test(parameter.key)) === true;
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
    const uncovered = discovered.parameters.filter(parameter => !parameter.covered).map(parameter => ({
      path: parameter.key,
      reason: parameter.uncoveredReason,
      value: clone(parameter.before)
    })).concat(discovered.controlGaps || []);
    const exercised = discovered.parameters.filter(item => item.covered);
    const batches = buildParameterBatches(exercised);
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
        const tab = createPayloadTab(type, makeBatchTitle(type, 'B', batchIndex));
        currentTabId = String(tab.id);
        await applyPayload(type, currentTabId, variantPayload, `persistence-${type}-batch-${batchIndex + 1}`, {
          draw: batchNeedsDraw(batch)
        });
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
      parameterCount: discovered.parameters.length,
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
    const uncovered = discoveredA.parameters.filter(parameter => !parameter.covered).map(parameter => ({
      path: parameter.key,
      reason: parameter.uncoveredReason,
      value: clone(parameter.before)
    })).concat(discoveredA.controlGaps || []);
    const exercised = discoveredA.parameters.filter(parameter => parameter.covered);
    const batches = buildParameterBatches(exercised);
    const resultMap = createParameterResults(exercised);
    const startedAt = performance.now();
    let currentTabAId = initialTabAId;
    let currentTabBId = initialTabBId;
    let archiveCount = 0;
    try{
      const captureSequence = async (phase, tabAId, tabBId, parameters, witnesses) => {
        const sequence = [
          { role: 'A', tabId: tabAId, expectedKey: 'before' },
          { role: 'B', tabId: tabBId, expectedKey: 'after' },
          { role: 'A', tabId: tabAId, expectedKey: 'before' },
          { role: 'B', tabId: tabBId, expectedKey: 'after' }
        ];
        for(let index = 0; index < sequence.length; index += 1){
          const step = sequence[index];
          const state = await captureBatchState(type, step.tabId, `${phase}-${step.role}-${index + 1}`);
          parameters.forEach(parameter => {
            recordParameterAssertion(
              resultMap,
              parameter,
              state,
              parameter[step.expectedKey],
              witnesses.get(parameter.key),
              `${phase}-${step.role}-${index + 1}`
            );
          });
        }
      };

      const batchRecords = [];
      for(let batchIndex = 0; batchIndex < batches.length; batchIndex += 1){
        const batch = batches[batchIndex];
        const payloadA = buildParameterVariantPayload(discoveredA.baseline, batch.parameters, 'before');
        const payloadB = buildParameterVariantPayload(baselineB, batch.parameters, 'after');
        let tabA;
        let tabB;
        if(batchIndex === 0){
          tabA = getTab(currentTabAId);
          tabB = getTab(currentTabBId);
        }else{
          tabA = createPayloadTab(type, makeBatchTitle(type, 'A', batchIndex));
          tabB = createPayloadTab(type, makeBatchTitle(type, 'B', batchIndex));
        }
        currentTabAId = String(tabA.id);
        currentTabBId = String(tabB.id);
        const drawBatch = batchNeedsDraw(batch);
        await applyPayload(type, currentTabAId, payloadA, `parameter-${type}-batch-${batchIndex + 1}-a`, { draw: drawBatch });
        await applyPayload(type, currentTabBId, payloadB, `parameter-${type}-batch-${batchIndex + 1}-b`, { draw: drawBatch });
        const beforeState = await captureBatchState(type, currentTabAId, `parameter-${type}-batch-${batchIndex + 1}-witness-a`);
        const afterState = await captureBatchState(type, currentTabBId, `parameter-${type}-batch-${batchIndex + 1}-witness-b`);
        const witnesses = buildParameterWitnesses(batch.parameters, beforeState, afterState);
        batch.parameters.forEach(parameter => {
          resultMap.get(parameter.key).witnesses = witnesses.get(parameter.key);
        });
        await captureSequence(`switch-batch-${batchIndex + 1}`, currentTabAId, currentTabBId, batch.parameters, witnesses);
        const locatorA = captureTabLocator(currentTabAId, type);
        const locatorB = captureTabLocator(currentTabBId, type);
        if(!locatorA || !locatorB) throw new Error(`could not capture batch ${batchIndex + 1} owner locators`);
        batchRecords.push({ batch, witnesses, locatorA, locatorB });
      }
      if(options.reopen !== false){
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
            record.witnesses
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
      parameterCount: discoveredA.parameters.length,
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
