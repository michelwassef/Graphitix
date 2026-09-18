(function(global){
  'use strict';

  const api = global.GraphitixOwnerPayloadDriver = global.GraphitixOwnerPayloadDriver || {};
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

  const MAX_DOM_TEXT = 120;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const pathKey = path => path.map(part => typeof part === 'number' ? `[${part}]` : part).join('.');
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
    const compact = normalized.replace(/[^a-z0-9]+/g, '');
    const leaf = leafName(path).replace(/[^a-z0-9]+/gi, '').toLowerCase();
    const terms = semanticTerms(path);
    let score = 0;
    terms.forEach(term => {
      const normalizedTerm = String(term || '').toLowerCase();
      const compactTerm = normalizedTerm.replace(/[^a-z0-9]+/g, '');
      if(normalizedTerm && (normalized.includes(normalizedTerm) || (compactTerm && compact.includes(compactTerm)))){
        score += compactTerm === leaf ? 6 : 2;
      }
    });
    return score;
  }

  function isPersistentParameterControl(element){
    if(!element || element.disabled) return false;
    const type = String(element.type || '').toLowerCase();
    if(['file', 'hidden', 'button', 'submit', 'reset', 'image'].includes(type)) return false;
    if(element.closest?.('[hidden]')) return false;
    if(element.hidden || String(element.style?.display || '').toLowerCase() === 'none') return false;
    if(element.closest?.('.ag-root, .ag-popup, [role="grid"], [data-parameter-isolation-ignore="true"]')) return false;
    return true;
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
      if(settingsAlias){
        const setting = settingsAlias[1];
        payload.config[setting] = clone(value);
        payload.config.settings = {
          ...(payload.config.settings && typeof payload.config.settings === 'object' ? payload.config.settings : {}),
          [setting]: clone(value)
        };
      }
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
    const ownerProjection = type === 'heatmap' && componentSession?.state
      ? {
          config: {
            view: componentSession.state.controls?.view ?? null,
            colorScheme: componentSession.state.colorScheme ?? null
          }
        }
      : null;
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
      ownerProjection,
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
    const sizingMatch = parameter.key.match(/^meta\.graphSizing\.display\.(widthPx|heightPx|aspectLocked|proportionalFontResize)$/i);
    // Geometry is archived as tab layout state. The payload copy is a live
    // convenience and may be omitted after restore when layout state is present.
    const payloadValue = sizingMatch
      ? clone(state.owner?.[`layoutSizing.${sizingMatch[1]}`])
      : clone(getAtPath(state.payload, parameter.path));
    const domValue = witness?.domKey ? clone(state.dom?.[witness.domKey]) : undefined;
    const ownerValue = witness?.ownerKey ? clone(state.owner?.[witness.ownerKey]) : undefined;
    if(!equivalent(payloadValue, expected)) failures.push(`${label}: canonical payload value drifted`);
    if(parameter.requiresDomWitness !== false){
      if(!witness?.domKey) failures.push(`${label}: no exact parameter-associated DOM projection witness`);
      else if(!equivalent(domValue, expected)) failures.push(`${label}: DOM exact value drifted`);
    }
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

  function explicitMutationAlternative(mutation, current){
    const operation = String(mutation?.operation || '').trim();
    if(operation === 'boolean-toggle'){
      return typeof current === 'boolean'
        ? { covered: true, value: !current, source: 'explicit-boolean-toggle' }
        : { covered: false, reason: 'explicit-boolean-baseline-required' };
    }
    if(operation === 'enum-cycle' || operation === 'scheme-cycle'){
      const values = Array.isArray(mutation.values) ? mutation.values : [];
      const index = values.findIndex(value => equivalent(value, current));
      if(index < 0 || values.length < 2){
        return { covered: false, reason: 'explicit-enum-baseline-outside-declared-domain' };
      }
      return { covered: true, value: clone(values[(index + 1) % values.length]), source: `explicit-${operation}` };
    }
    if(operation === 'text-suffix'){
      if(typeof current !== 'string') return { covered: false, reason: 'explicit-text-baseline-required' };
      const suffix = String(mutation.suffix || ' [variant]');
      return { covered: true, value: `${current}${suffix}`, source: 'explicit-text-suffix' };
    }
    if(operation === 'color-alternative'){
      if(typeof current !== 'string' || !mutation.value) return { covered: false, reason: 'explicit-color-baseline-required' };
      const value = String(mutation.value);
      return { covered: !equivalent(value, current), value, source: 'explicit-color-alternative' };
    }
    if(operation === 'number-delta'){
      const numeric = Number(current);
      const delta = Number(mutation.delta);
      if(!Number.isFinite(numeric) || !Number.isFinite(delta) || delta === 0){
        return { covered: false, reason: 'explicit-number-baseline-required' };
      }
      const next = numeric + delta;
      return { covered: true, value: next, source: 'explicit-number-delta' };
    }
    return { covered: false, reason: `unknown-explicit-mutation-operation:${operation || 'missing'}` };
  }

  function discoverExplicitParameters(type, baseline, plan){
    const parameters = [];
    const classified = [];
    const requiredPaths = Array.isArray(plan?.baseline?.requiredPayloadPaths) ? plan.baseline.requiredPayloadPaths : [];
    requiredPaths.forEach(path => {
      if(getAtPath(baseline, String(path).split('.')) === undefined){
        classified.push({ path: String(path), reason: 'explicit-baseline-path-missing' });
      }
    });
    (plan?.mutations || []).forEach(mutation => {
      const path = String(mutation.path || '').split('.').filter(Boolean);
      const key = pathKey(path);
      const before = clone(getAtPath(baseline, path));
      const alternative = explicitMutationAlternative(mutation, before);
      parameters.push({
        id: String(mutation.id || ''),
        kind: String(mutation.kind || ''),
        path,
        key,
        before,
        after: clone(alternative.value),
        covered: alternative.covered === true && !equivalent(before, alternative.value),
        mutationSource: alternative.source || null,
        uncoveredReason: alternative.covered === true && !equivalent(before, alternative.value)
          ? null
          : (alternative.reason || 'explicit-mutation-did-not-change-value'),
        semanticFingerprint: Array.isArray(mutation.fingerprint) ? mutation.fingerprint.slice() : [],
        requiresDomWitness: mutation.requiresDomWitness !== false,
        controlIndex: null,
        controlDomKey: null
      });
    });
    return { parameters, classified };
  }

  async function discover(type, tabId, options = {}){
    if(!options.mutationPlan || !Array.isArray(options.mutationPlan.mutations)){
      throw new Error(`${type}: explicit mutation plan is required; generic payload-leaf discovery has been retired`);
    }
    await activateTab(tabId, `parameter-discovery-${type}`);
    // Parameter discovery must observe the settled owner, not activation defaults that
    // a component is still normalizing to the current data (for example PCA's
    // loadings limit). Otherwise the matrix can manufacture an impossible value and
    // report the component's correct clamp as persistence drift.
    await awaitOwnerReadyForSnapshot(type, tabId, `parameter-discovery-${type}-ready`);
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
    const explicit = discoverExplicitParameters(type, baseline, options.mutationPlan);
    const explicitMissing = explicit.classified.filter(item => item.reason === 'explicit-baseline-path-missing');
    if(explicitMissing.length){
      throw new Error(`${type}: explicit mutation baseline is incomplete (${explicitMissing.map(item => item.path).join(', ')})`);
    }
    return {
      baseline,
      storedBaseline,
      roots: USER_ROOTS[type] || ['config', 'style', 'notes', 'meta'],
      parameters: explicit.parameters,
      classified: explicit.classified,
      synthetic,
      controlGaps: [],
      mutationPlanId: `${type}:explicit-v1`
    };
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
    if(path[0] === 'meta' && path[1] === 'graphSizing' && path[2] === 'display'){
      // Width, height, and lock state are coupled by the resizer. Test each
      // transition independently so a valid lock adjustment is not mistaken
      // for loss of another sizing value in the same synthetic payload.
      return `meta.graphSizing.${String(path[3] || 'display')}`;
    }
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
      mutationId: parameter.id || null,
      kind: parameter.kind || null,
      parameter: parameter.key,
      before: clone(parameter.before),
      after: clone(parameter.after),
      mutationSource: parameter.mutationSource,
      semanticFingerprint: Array.isArray(parameter.semanticFingerprint) ? parameter.semanticFingerprint.slice() : [],
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
    const mutationPlan = options.mutationPlan;
    if(!mutationPlan || !Array.isArray(mutationPlan.mutations)){
      throw new Error(`${type}: explicit mutation plan is required for persistence matrix`);
    }
    const discovered = await discover(type, initialTabId, { mutationPlan });
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
      mutationPlanId: discovered.mutationPlanId || null,
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
    const mutationPlan = options.mutationPlan;
    if(!mutationPlan || !Array.isArray(mutationPlan.mutations)){
      throw new Error(`${type}: explicit mutation plan is required for same-type isolation`);
    }
    const discoveredA = await discover(type, initialTabAId, { mutationPlan });
    const discoveredB = await discover(type, initialTabBId, { mutationPlan });
    // The explicit catalog describes independent mutations on one canonical
    // baseline. The renderer harness also keeps the two original tabs
    // deliberately different for variant-isolation coverage; reusing that
    // second variant here would make an otherwise valid mutation inactive
    // (for example Line display mode is unavailable in a 3D table). Build
    // both generated parameter tabs from the same reviewed baseline so this
    // phase isolates one mutation at a time from the same reviewed baseline.
    const baselineB = clone(discoveredA.baseline);
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
      mutationPlanId: discoveredA.mutationPlanId || null,
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
