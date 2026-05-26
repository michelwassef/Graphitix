(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const additionalLineControls = Shared.additionalLineControls = Shared.additionalLineControls || {};
  const ADDITIONAL_LINE_CONTROLS_DEFAULT_SCOPE = '__global__';

  // DOM-only toolbar host cache. It never owns tab state; stale disconnected hosts are pruned.
  const toolbarHostCache = new Map();
  let panelEl = null;
  let panelTitleEl = null;
  let panelFieldsRowEl = null;
  let summaryLabelEl = null;
  let summaryValueEl = null;
  let scopeField = null;
  let scopeLabelEl = null;
  let scopeSelect = null;
  let thicknessField = null;
  let thicknessLabelEl = null;
  let thicknessInput = null;
  let styleField = null;
  let styleLabelEl = null;
  let styleControlEl = null;
  let styleChipEl = null;
  let styleChipPreviewEl = null;
  let styleChipValueEl = null;
  let stylePickerCleanup = null;
  let styleDragState = null;
  let suppressStyleChipClick = false;
  let colorField = null;
  let colorInput = null;
  let patternField = null;
  let patternLabelEl = null;
  let patternSelect = null;
  let transparencyField = null;
  let transparencyLabelEl = null;
  let transparencyInput = null;
  let transparencyValueEl = null;
  let activeConfig = null;
  let activeHost = null;
  let activeScope = null;
  let hasDocListener = false;
  let applyingFromUndo = false;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function logDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: additionalLineControls ' + message, payload || {});
    }
  }

  function getUndoManager(){
    const manager = global.Shared?.undoManager;
    if(manager && typeof manager.recordStateChange === 'function'){
      return manager;
    }
    return null;
  }

  function sanitizeThicknessValue(value){
    if(value === null || value === undefined || value === ''){
      return null;
    }
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric < 0){
      return null;
    }
    return numeric;
  }

  function sanitizeColorValue(value){
    if(typeof value !== 'string'){
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function normalizeColorForCompare(value){
    const sanitized = sanitizeColorValue(value);
    return sanitized ? sanitized.toLowerCase() : '';
  }

  function sanitizePatternValue(value){
    if(typeof value !== 'string'){
      return 'dotted';
    }
    const normalized = value.trim().toLowerCase();
    if(normalized === 'solid' || normalized === 'continuous'){
      return 'solid';
    }
    if(normalized === 'dotted' || normalized === 'dots'){
      return 'dotted';
    }
    if(normalized === 'dashed'){
      return 'dashed';
    }
    return 'dotted';
  }

  function sanitizeTransparencyValue(value){
    if(value === null || value === undefined || value === ''){
      return 0;
    }
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 0;
    }
    if(numeric < 0){
      return 0;
    }
    if(numeric > 100){
      return 100;
    }
    return numeric;
  }

  function toColorInputValue(value){
    const sanitized = sanitizeColorValue(value);
    if(!sanitized){ return '#000000'; }
    const normalized = sanitized.toLowerCase();
    if(/^#([0-9a-f]{6})$/.test(normalized)){
      return normalized;
    }
    if(/^#([0-9a-f]{3})$/.test(normalized)){
      const hex = normalized.slice(1);
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    return '#000000';
  }

  function getUndoScope(config){
    if(!config){ return null; }
    if(typeof config.undoScope === 'string' && config.undoScope){
      return config.undoScope;
    }
    if(typeof config.scopeId === 'string' && config.scopeId){
      return `${config.scopeId}GraphPanel`;
    }
    return null;
  }

  function decodeScopedValue(value){
    if(Shared && typeof Shared.decodeScopeValue === 'function'){
      return Shared.decodeScopeValue(value);
    }
    const raw = String(value == null ? '' : value).trim();
    if(!raw){
      return { raw: '', kind: '', dataset: '' };
    }
    const tokenIndex = raw.indexOf('::');
    if(tokenIndex <= 0){
      return { raw, kind: raw, dataset: '' };
    }
    const kind = String(raw.slice(0, tokenIndex) || '').trim();
    const encodedDataset = raw.slice(tokenIndex + 2);
    let dataset = encodedDataset;
    try{
      dataset = decodeURIComponent(encodedDataset);
    }catch(err){}
    return {
      raw,
      kind: kind || raw,
      dataset: String(dataset == null ? '' : dataset).trim()
    };
  }

  function getContext(scopeOverride){
    if(scopeOverride && typeof scopeOverride === 'object' && !Array.isArray(scopeOverride)){
      const scopeKind = String(scopeOverride.scope || '').trim();
      const scopeDataset = String(scopeOverride.scopeDataset || '').trim();
      const scopeValueRaw = String(scopeOverride.scopeValue || '').trim();
      const scopeValue = scopeValueRaw || (
        scopeKind
          ? `${scopeKind}${scopeDataset ? `::${encodeURIComponent(scopeDataset)}` : ''}`
          : ''
      );
      return {
        scope: scopeKind || null,
        scopeValue: scopeValue || null,
        scopeDataset: scopeDataset || null,
        target: scopeOverride.target || activeConfig?.target || null
      };
    }
    const rawScope = scopeOverride == null ? activeScope : scopeOverride;
    const parsedScope = decodeScopedValue(rawScope);
    const selectedOption = scopeSelect && scopeSelect.selectedOptions && scopeSelect.selectedOptions.length
      ? scopeSelect.selectedOptions[0]
      : null;
    const optionDataset = String(selectedOption?.dataset?.scopeDataset || '').trim();
    const optionKind = String(selectedOption?.dataset?.scopeKind || '').trim();
    const scopeKind = String(parsedScope.kind || optionKind || rawScope || '').trim();
    const scopeDataset = String(parsedScope.dataset || optionDataset || '').trim();
    return {
      scope: scopeKind || null,
      scopeValue: parsedScope.raw || (rawScope == null ? null : String(rawScope)),
      scopeDataset: scopeDataset || null,
      target: activeConfig?.target || null
    };
  }

  function snapshotContext(context){
    const ctx = context && typeof context === 'object' ? context : getContext();
    return {
      scope: ctx.scope || null,
      scopeValue: ctx.scopeValue || null,
      scopeDataset: ctx.scopeDataset || null,
      target: ctx.target || activeConfig?.target || null
    };
  }

  function resolveControls(config){
    const controls = (config && typeof config.controls === 'object') ? config.controls : {};
    return {
      panelTitle: controls.panelTitle || config?.panelTitle || 'Line',
      showSummary: controls.showSummary !== false,
      showScope: controls.showScope !== false,
      showColor: controls.showColor !== false,
      showThickness: controls.showThickness !== false,
      showPattern: controls.showPattern !== false,
      showTransparency: controls.showTransparency !== false,
      summaryLabel: controls.summaryLabel || 'Line',
      scopeLabel: controls.scopeLabel || (config?.scope?.label || 'Scope'),
      colorLabel: controls.colorLabel || 'Color',
      thicknessLabel: controls.thicknessLabel || 'Thickness',
      patternLabel: controls.patternLabel || 'Pattern',
      transparencyLabel: controls.transparencyLabel || 'Transparency',
      thicknessMin: Number.isFinite(Number(controls.thicknessMin)) ? Number(controls.thicknessMin) : 0,
      thicknessMax: Number.isFinite(Number(controls.thicknessMax)) ? Number(controls.thicknessMax) : 10,
      thicknessStep: Number.isFinite(Number(controls.thicknessStep)) && Number(controls.thicknessStep) > 0 ? Number(controls.thicknessStep) : 0.25
    };
  }

  function formatSummary(config, context){
    if(config && typeof config.getSummary === 'function'){
      const custom = config.getSummary(context);
      if(custom != null){
        const text = String(custom).trim();
        if(text){
          return text;
        }
      }
    }
    const axis = (config?.axis || '').toUpperCase() || '?';
    const rawValue = config && typeof config.getValue === 'function' ? Number(config.getValue(context)) : NaN;
    if(Number.isFinite(rawValue)){
      return `${axis} @ ${Number.parseFloat(rawValue.toPrecision(6))}`;
    }
    return `${axis} line`;
  }

  function formatThicknessChipValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return '0px';
    }
    const rounded = Math.round(numeric * 10) / 10;
    return `${rounded}px`;
  }

  function syncStyleChipUi(){
    if(!styleChipEl || !styleChipPreviewEl || !styleChipValueEl || !colorInput || !thicknessInput){
      return;
    }
    const color = toColorInputValue(colorInput.value);
    const thicknessValue = sanitizeThicknessValue(thicknessInput.value);
    styleChipPreviewEl.style.background = color;
    styleChipValueEl.textContent = formatThicknessChipValue(thicknessValue == null ? 0 : thicknessValue);
    styleChipEl.dataset.noBorder = thicknessValue == null || thicknessValue <= 0 ? '1' : '0';
  }

  function clearStylePickerSection(overlayEl){
    if(!overlayEl || !overlayEl.querySelectorAll){
      return;
    }
    overlayEl.querySelectorAll('.shared-color-picker__section--additional-line-style').forEach(node => node.remove());
  }

  function attachStylePickerThicknessSection(overlayEl){
    if(!overlayEl){
      return () => {};
    }
    clearStylePickerSection(overlayEl);
    const controls = resolveControls(activeConfig || {});
    const section = overlayEl.ownerDocument.createElement('section');
    section.className = 'shared-color-picker__section shared-color-picker__section--scatter-style shared-color-picker__section--additional-line-style';
    const title = overlayEl.ownerDocument.createElement('div');
    title.className = 'shared-color-picker__section-title';
    title.textContent = controls.thicknessLabel || 'Line width';
    section.appendChild(title);
    const row = overlayEl.ownerDocument.createElement('div');
    row.className = 'shared-color-picker__scatter-style-row shared-color-picker__scatter-style-row--single';
    const field = overlayEl.ownerDocument.createElement('label');
    field.className = 'shared-color-picker__scatter-style-field';
    const input = overlayEl.ownerDocument.createElement('input');
    input.className = 'shared-color-picker__scatter-style-input';
    input.type = 'number';
    input.min = thicknessInput?.min || '0';
    input.max = thicknessInput?.max || '10';
    input.step = thicknessInput?.step || '0.25';
    input.value = thicknessInput?.value || '0';
    input.setAttribute('aria-label', controls.thicknessLabel || 'Line width');
    input.addEventListener('input', () => {
      if(!thicknessInput){ return; }
      thicknessInput.value = input.value;
      thicknessInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    input.addEventListener('change', () => {
      if(!thicknessInput){ return; }
      thicknessInput.value = input.value;
      thicknessInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    field.appendChild(input);
    row.appendChild(field);
    section.appendChild(row);
    overlayEl.insertBefore(section, overlayEl.firstChild || null);
    return () => {
      if(section.parentNode){
        section.parentNode.removeChild(section);
      }
    };
  }

  function updatePanelInputs(config){
    if(!panelEl || !config || !thicknessInput || !colorInput || !patternSelect || !transparencyInput){
      return;
    }
    const context = getContext();
    const controls = resolveControls(config);
    if(panelTitleEl){
      panelTitleEl.textContent = controls.panelTitle;
    }
    if(summaryValueEl){
      summaryValueEl.textContent = formatSummary(config, context);
    }
    if(summaryLabelEl){
      summaryLabelEl.textContent = controls.summaryLabel;
      if(summaryLabelEl.parentElement){
        summaryLabelEl.parentElement.hidden = !controls.showSummary;
      }
    }
    if(scopeLabelEl){
      scopeLabelEl.textContent = controls.scopeLabel;
    }
    if(thicknessLabelEl){
      thicknessLabelEl.textContent = controls.thicknessLabel;
    }
    if(styleLabelEl){
      styleLabelEl.textContent = controls.colorLabel;
    }
    if(patternLabelEl){
      patternLabelEl.textContent = controls.patternLabel;
    }
    if(transparencyLabelEl){
      transparencyLabelEl.textContent = controls.transparencyLabel;
    }
    if(scopeField){
      const hasScopeOptions = !!(scopeSelect && scopeSelect.options && scopeSelect.options.length > 0);
      scopeField.hidden = !controls.showScope || !hasScopeOptions;
    }
    if(thicknessField){
      // Thickness is edited via the shared border-style chip section in the color picker.
      thicknessField.hidden = true;
    }
    if(colorField){
      colorField.hidden = true;
    }
    if(styleField){
      styleField.hidden = !(controls.showColor || controls.showThickness);
    }
    if(patternField){
      patternField.hidden = !controls.showPattern;
    }
    if(transparencyField){
      transparencyField.hidden = !controls.showTransparency;
    }
    const thicknessValue = sanitizeThicknessValue(config.getThickness ? config.getThickness(context) : null);
    thicknessInput.min = String(controls.thicknessMin);
    thicknessInput.max = String(controls.thicknessMax);
    thicknessInput.step = String(controls.thicknessStep);
    thicknessInput.value = thicknessValue === null ? '' : String(Math.max(controls.thicknessMin, thicknessValue));
    const colorValue = sanitizeColorValue(config.getColor ? config.getColor(context) : null);
    colorInput.value = toColorInputValue(colorValue);
    patternSelect.value = sanitizePatternValue(config.getPattern ? config.getPattern(context) : 'dotted');
    const transparencyValue = sanitizeTransparencyValue(config.getTransparency ? config.getTransparency(context) : 0);
    transparencyInput.value = String(Math.round(transparencyValue));
    if(transparencyValueEl){
      transparencyValueEl.textContent = `${Math.round(transparencyValue)}%`;
    }
    syncStyleChipUi();
  }

  function syncPanelInputsFromConfig(config){
    if(!panelEl || panelEl.dataset.open !== '1' || !config){ return; }
    if(activeConfig !== config){ return; }
    updatePanelInputs(activeConfig);
  }

  function recordStyleStateChange(config, type, previousValue, nextValue, applyFn, equals){
    const manager = getUndoManager();
    if(!manager){ return; }
    const compare = typeof equals === 'function'
      ? equals
      : ((a, b) => (a === b) || (a === null && b === null));
    if(compare(previousValue, nextValue)){ return; }
    const parts = ['additionalLine'];
    if(config?.scopeId){ parts.push(config.scopeId); }
    if(activeScope){ parts.push(String(activeScope)); }
    if(config?.axis){ parts.push(config.axis); }
    if(Number.isInteger(config?.index)){ parts.push(String(config.index)); }
    parts.push(type);
    manager.recordStateChange({
      label: parts.join(':'),
      scope: getUndoScope(config),
      from: previousValue,
      to: nextValue,
      equals: compare,
      apply(value){
        applyingFromUndo = true;
        try{
          if(typeof applyFn === 'function'){
            applyFn(value);
          }
        }finally{
          applyingFromUndo = false;
        }
        syncPanelInputsFromConfig(config);
        return true;
      }
    });
  }

  function clearHostSizing(host){
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    if(typeof toolbarApi.clearHostSizing === 'function'){
      toolbarApi.clearHostSizing(host);
      return;
    }
    if(!host){ return; }
    host.style.removeProperty('min-width');
    host.style.removeProperty('max-width');
    host.style.removeProperty('width');
    const dock = typeof host.closest === 'function' ? host.closest('.workspace-toolbar__dock') : null;
    if(dock){
      dock.style.removeProperty('min-width');
      dock.style.removeProperty('max-width');
      dock.style.removeProperty('width');
    }
  }

  function ensureDocumentListener(){
    if(hasDocListener || !global.document){ return; }
    global.document.addEventListener('click', evt => {
      if(!panelEl || panelEl.dataset.open !== '1'){ return; }
      if(panelEl.contains(evt.target)){ return; }
      if(activeConfig?.keepOpenWithinHost && activeHost && activeHost.contains && activeHost.contains(evt.target)){ return; }
      if(evt.target?.dataset?.additionalLineControl === '1'){ return; }
      if(evt.target?.closest && evt.target.closest('.shared-color-picker')){ return; }
      closePanel('outside');
    });
    hasDocListener = true;
    logDebug('document listener attached');
  }

  function resolveToolbarHost(scopeId){
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    if(typeof toolbarApi.resolveHost === 'function'){
      return toolbarApi.resolveHost(scopeId);
    }
    if(!global.document){ return null; }
    const doc = global.document;
    const key = scopeId || ADDITIONAL_LINE_CONTROLS_DEFAULT_SCOPE;
    if(toolbarHostCache.has(key)){
      const cachedHost = toolbarHostCache.get(key);
      if(cachedHost && cachedHost.isConnected !== false){
        return cachedHost;
      }
      toolbarHostCache.delete(key);
    }
    let button = null;
    const preferredAnchorId = scopeId ? `${scopeId}FontHost` : null;
    if(preferredAnchorId){
      const preferredAnchor = doc.getElementById(preferredAnchorId);
      if(preferredAnchor){
        button = preferredAnchor;
      }
    }
    const buttonId = !button && scopeId ? `${scopeId}LoadExample` : null;
    if(!button && buttonId){
      button = doc.getElementById(buttonId);
    }
    if(!button && scopeId){
      const fallbackIds = [];
      if(scopeId === 'venn'){ fallbackIds.push('sample'); }
      fallbackIds.push(`${scopeId}Example`, `${scopeId}Sample`, `${scopeId}FontHost`);
      for(let i = 0; i < fallbackIds.length && !button; i += 1){
        const candidateId = fallbackIds[i];
        if(!candidateId){ continue; }
        const candidate = doc.getElementById(candidateId);
        if(candidate){
          button = candidate;
        }
      }
    }
    if(!button && scopeId){
      const dataHost = doc.querySelector(`[data-font-toolbar-scope="${key}"]`);
      if(dataHost){
        button = dataHost;
      }
    }
    let existingHost = doc.querySelector(`.font-toolbar-host[data-font-toolbar-scope="${key}"]`);
    if(existingHost){
      toolbarHostCache.set(key, existingHost);
      return existingHost;
    }
    if(!button){
      return null;
    }
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = key;
    host.style.display = 'none';
    button.insertAdjacentElement('afterend', host);
    toolbarHostCache.set(key, host);
    return host;
  }

  function updateDockActiveState(host, shouldActivate){
    if(!host || !host.parentElement){ return; }
    const dock = host.parentElement;
    if(!dock.classList || !dock.classList.contains('workspace-toolbar__dock')){ return; }
    if(shouldActivate){
      dock.classList.add('workspace-toolbar__dock--active');
      return;
    }
    const hasVisibleHost = dock.querySelector('.font-toolbar-host.font-toolbar-host--visible');
    if(!hasVisibleHost){
      dock.classList.remove('workspace-toolbar__dock--active');
    }
  }

  function ensurePanel(){
    if(panelEl || !global.document){ return panelEl; }
    const doc = global.document;
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    const sharedPanel = toolbarApi.createSubPanel({
      panelClass: 'workspace-toolbar__panel--additional-line additional-line-controls-panel',
      role: 'toolbar',
      ariaLabel: 'Additional line controls',
      title: 'Line',
      rowClass: 'additional-line-controls-panel__row'
    });
    panelEl = sharedPanel.panel;
    panelTitleEl = sharedPanel.title;
    panelFieldsRowEl = sharedPanel.row;
    if(panelTitleEl){
      panelTitleEl.classList.add('additional-line-controls-panel__title');
    }
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.hidden = true;

    const summary = doc.createElement('div');
    summary.className = 'additional-line-controls-panel__summary';
    summaryLabelEl = doc.createElement('span');
    summaryLabelEl.className = 'additional-line-controls-panel__summary-label';
    summaryLabelEl.textContent = 'Line';
    summaryValueEl = doc.createElement('span');
    summaryValueEl.className = 'additional-line-controls-panel__summary-value';
    summary.appendChild(summaryLabelEl);
    summary.appendChild(summaryValueEl);
    panelFieldsRowEl.appendChild(summary);

    scopeField = doc.createElement('label');
    scopeField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--scope';
    scopeLabelEl = doc.createElement('span');
    scopeLabelEl.className = 'additional-line-controls-panel__field-label';
    scopeLabelEl.textContent = 'Scope';
    scopeSelect = doc.createElement('select');
    scopeSelect.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--select';
    scopeSelect.setAttribute('data-undo-ignore','1');
    scopeField.appendChild(scopeLabelEl);
    scopeField.appendChild(scopeSelect);
    scopeField.hidden = true;
    panelFieldsRowEl.appendChild(scopeField);

    thicknessField = doc.createElement('label');
    thicknessField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--numeric';
    thicknessLabelEl = doc.createElement('span');
    thicknessLabelEl.className = 'additional-line-controls-panel__field-label';
    thicknessLabelEl.textContent = 'Thickness';
    thicknessInput = doc.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.min = '0';
    thicknessInput.max = '10';
    thicknessInput.step = '0.25';
    thicknessInput.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--small';
    thicknessInput.setAttribute('data-undo-ignore','1');
    thicknessField.appendChild(thicknessLabelEl);
    thicknessField.appendChild(thicknessInput);
    thicknessField.hidden = true;
    panelFieldsRowEl.appendChild(thicknessField);

    styleField = doc.createElement('label');
    styleField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--style';
    styleLabelEl = doc.createElement('span');
    styleLabelEl.className = 'additional-line-controls-panel__field-label';
    styleLabelEl.textContent = 'Line';
    const toolbarUiApi = Shared.getWorkspaceToolbarApi();
    const styleControlParts = toolbarUiApi.createBorderStyleControl({
      chipTitle: 'Click to edit line color. Wheel or Alt+drag to adjust line thickness.',
      colorInputClass: 'shared-border-style-input additional-line-controls-panel__color-input',
      colorInputAttrs: { 'data-undo-ignore': '1' }
    });
    styleControlEl = styleControlParts.control;
    styleChipEl = styleControlParts.chip;
    styleChipPreviewEl = styleControlParts.preview;
    styleChipValueEl = styleControlParts.value;
    colorInput = styleControlParts.colorInput;
    styleField.appendChild(styleLabelEl);
    styleField.appendChild(styleControlEl);
    panelFieldsRowEl.appendChild(styleField);

    colorField = styleField;

    const patternFieldParts = toolbarUiApi.createLinePatternField({
      fieldClass: 'additional-line-controls-panel__field additional-line-controls-panel__field--pattern',
      label: 'Pattern',
      labelClass: 'additional-line-controls-panel__field-label',
      selectClass: 'additional-line-controls-panel__input additional-line-controls-panel__input--select',
      selectAttrs: { 'data-undo-ignore': '1' },
      solidLabel: 'Continuous'
    });
    patternField = patternFieldParts.field;
    patternLabelEl = patternFieldParts.label;
    patternSelect = patternFieldParts.select;
    panelFieldsRowEl.appendChild(patternField);

    transparencyField = doc.createElement('label');
    transparencyField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--transparency';
    transparencyLabelEl = doc.createElement('span');
    transparencyLabelEl.className = 'additional-line-controls-panel__field-label';
    transparencyLabelEl.textContent = 'Transparency';
    const transparencyParts = toolbarUiApi.createTransparencyControl({
      wrapClass: 'additional-line-controls-panel__range',
      inputClass: 'additional-line-controls-panel__transparency-input',
      inputAttrs: {
        min: '0',
        max: '100',
        step: '1',
        'data-undo-ignore': '1'
      },
      valueClass: 'additional-line-controls-panel__range-value',
      valueText: '0%'
    });
    const transparencyWrap = transparencyParts.wrap;
    transparencyInput = transparencyParts.input;
    transparencyValueEl = transparencyParts.value;
    transparencyField.appendChild(transparencyLabelEl);
    transparencyField.appendChild(transparencyWrap);
    panelFieldsRowEl.appendChild(transparencyField);

    scopeSelect.addEventListener('change', () => {
      if(!activeConfig){ return; }
      activeScope = scopeSelect.value || null;
      const scopeCfg = activeConfig.scope;
      if(scopeCfg && typeof scopeCfg.onChange === 'function'){
        try{ scopeCfg.onChange(activeScope, getContext()); }catch(err){}
      }
      syncPanelInputsFromConfig(activeConfig);
    });

    const applyThicknessFromInput = (recordUndo) => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || typeof activeConfig.onThicknessChange !== 'function'){ return; }
      const config = activeConfig;
      const context = getContext();
      const controls = resolveControls(config);
      const previousValue = sanitizeThicknessValue(config.getThickness ? config.getThickness(context) : null);
      const requestedRaw = sanitizeThicknessValue(thicknessInput.value);
      const requested = requestedRaw == null ? null : Math.max(controls.thicknessMin, requestedRaw);
      config.onThicknessChange(requested, context);
      const nextValue = sanitizeThicknessValue(config.getThickness ? config.getThickness(context) : null);
      syncPanelInputsFromConfig(config);
      if(recordUndo){
        const scopeSnapshot = snapshotContext(context);
        recordStyleStateChange(
          config,
          'thickness',
          previousValue,
          nextValue,
          value => {
            const normalizedRaw = sanitizeThicknessValue(value);
            const normalized = normalizedRaw == null ? null : Math.max(controls.thicknessMin, normalizedRaw);
            config.onThicknessChange(normalized, getContext(scopeSnapshot));
          }
        );
      }
    };
    thicknessInput.addEventListener('input', () => applyThicknessFromInput(false));
    thicknessInput.addEventListener('change', () => applyThicknessFromInput(true));

    if(styleChipEl){
      styleChipEl.addEventListener('wheel', evt => {
        evt.preventDefault();
        const step = evt.deltaY < 0 ? 0.5 : -0.5;
        const current = sanitizeThicknessValue(thicknessInput?.value);
        const next = (current == null ? 0 : current) + step;
        if(thicknessInput){
          thicknessInput.value = String(next);
          thicknessInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, { passive: false });
      const onStyleDragMove = evt => {
        if(!styleDragState || !thicknessInput){ return; }
        const deltaX = evt.clientX - styleDragState.startX;
        const steps = Math.round(deltaX / 8);
        const next = styleDragState.startValue + (steps * 0.5);
        thicknessInput.value = String(next);
        thicknessInput.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const onStyleDragUp = () => {
        if(!styleDragState){ return; }
        styleDragState = null;
        if(thicknessInput){
          thicknessInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        global.removeEventListener('mousemove', onStyleDragMove);
        global.removeEventListener('mouseup', onStyleDragUp);
      };
      styleChipEl.addEventListener('mousedown', evt => {
        if(!evt.altKey || evt.button !== 0){ return; }
        evt.preventDefault();
        suppressStyleChipClick = true;
        const current = sanitizeThicknessValue(thicknessInput?.value);
        styleDragState = { startX: evt.clientX, startValue: current == null ? 0 : current };
        global.addEventListener('mousemove', onStyleDragMove);
        global.addEventListener('mouseup', onStyleDragUp);
      });
      styleChipEl.addEventListener('click', evt => {
        if(!suppressStyleChipClick){ return; }
        suppressStyleChipClick = false;
        evt.preventDefault();
        evt.stopPropagation();
      }, true);
      if(typeof Shared.openColorPicker === 'function'){
        styleChipEl.addEventListener('click', evt => {
          evt.preventDefault();
          evt.stopPropagation();
          const overlayEl = Shared.openColorPicker({
            anchor: styleChipEl,
            color: colorInput.value,
            element: colorInput,
            onInput(value){
              colorInput.value = value;
              colorInput.dispatchEvent(new Event('input', { bubbles: true }));
            },
            onChange(value){
              colorInput.value = value;
              colorInput.dispatchEvent(new Event('change', { bubbles: true }));
            },
            onClose(){
              if(typeof stylePickerCleanup === 'function'){
                stylePickerCleanup();
                stylePickerCleanup = null;
              }
            }
          });
          stylePickerCleanup = attachStylePickerThicknessSection(overlayEl);
        });
      }else if(typeof Shared.attachColorPickerNear === 'function'){
        Shared.attachColorPickerNear(colorInput);
        styleChipEl.addEventListener('click', evt => {
          evt.preventDefault();
          colorInput.click();
        });
      }
    }

    colorInput.addEventListener('input', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || (typeof activeConfig.onColorChange !== 'function' && typeof activeConfig.onColorInput !== 'function')){ return; }
      const config = activeConfig;
      const context = getContext();
      const previousValue = sanitizeColorValue(config.getColor ? config.getColor(context) : null);
      const requested = sanitizeColorValue(colorInput.value || null);
      if(typeof config.onColorInput === 'function'){
        config.onColorInput(requested, context);
      }else{
        config.onColorChange(requested, context);
      }
      const nextValue = sanitizeColorValue(config.getColor ? config.getColor(context) : null);
      const scopeSnapshot = snapshotContext(context);
      syncPanelInputsFromConfig(config);
      recordStyleStateChange(
        config,
        'color',
        previousValue,
        nextValue,
        value => config.onColorChange(sanitizeColorValue(value), getContext(scopeSnapshot)),
        (a, b) => normalizeColorForCompare(a) === normalizeColorForCompare(b)
      );
    });

    colorInput.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || typeof activeConfig.onColorChange !== 'function'){ return; }
      const config = activeConfig;
      const context = getContext();
      const previousValue = sanitizeColorValue(config.getColor ? config.getColor(context) : null);
      const requested = sanitizeColorValue(colorInput.value || null);
      config.onColorChange(requested, context);
      const nextValue = sanitizeColorValue(config.getColor ? config.getColor(context) : null);
      const scopeSnapshot = snapshotContext(context);
      syncPanelInputsFromConfig(config);
      recordStyleStateChange(
        config,
        'color',
        previousValue,
        nextValue,
        value => config.onColorChange(sanitizeColorValue(value), getContext(scopeSnapshot)),
        (a, b) => normalizeColorForCompare(a) === normalizeColorForCompare(b)
      );
    });

    patternSelect.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || typeof activeConfig.onPatternChange !== 'function'){ return; }
      const config = activeConfig;
      const context = getContext();
      const previousValue = sanitizePatternValue(config.getPattern ? config.getPattern(context) : null);
      const requested = sanitizePatternValue(patternSelect.value);
      config.onPatternChange(requested, context);
      const nextValue = sanitizePatternValue(config.getPattern ? config.getPattern(context) : requested);
      const scopeSnapshot = snapshotContext(context);
      syncPanelInputsFromConfig(config);
      recordStyleStateChange(
        config,
        'pattern',
        previousValue,
        nextValue,
        value => config.onPatternChange(sanitizePatternValue(value), getContext(scopeSnapshot))
      );
    });

    transparencyInput.addEventListener('input', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || typeof activeConfig.onTransparencyChange !== 'function'){ return; }
      const config = activeConfig;
      const context = getContext();
      const previousValue = sanitizeTransparencyValue(config.getTransparency ? config.getTransparency(context) : 0);
      const requested = sanitizeTransparencyValue(transparencyInput.value);
      config.onTransparencyChange(requested, context);
      const nextValue = sanitizeTransparencyValue(config.getTransparency ? config.getTransparency(context) : requested);
      const scopeSnapshot = snapshotContext(context);
      syncPanelInputsFromConfig(config);
      recordStyleStateChange(
        config,
        'transparency',
        previousValue,
        nextValue,
        value => config.onTransparencyChange(sanitizeTransparencyValue(value), getContext(scopeSnapshot))
      );
    });

    ensureDocumentListener();
    logDebug('panel created');
    return panelEl;
  }

  function updateOverlayBounds(target, overlay, padding){
    if(!target || !overlay || typeof target.getBBox !== 'function'){ return null; }
    let bbox;
    try{
      bbox = target.getBBox();
    }catch(err){
      logDebug('overlay bbox failed',{ error: err?.message || String(err) });
      return null;
    }
    if(!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)){ return null; }
    const pad = Number.isFinite(padding) ? padding : 5;
    const inflate = Math.max(3, pad);
    const width = Math.max(6, bbox.width + inflate * 2);
    const height = Math.max(6, bbox.height + inflate * 2);
    overlay.setAttribute('x', String(bbox.x - inflate));
    overlay.setAttribute('y', String(bbox.y - inflate));
    overlay.setAttribute('width', String(width));
    overlay.setAttribute('height', String(height));
    return { width, height, inflate };
  }

  function ensureLineOverlay(element){
    if(!element){
      return null;
    }
    if(element.__additionalLineControlOverlay){
      const info = element.__additionalLineControlOverlay;
      updateOverlayBounds(element, info.element, info.padding);
      return info;
    }
    const svg = element.ownerSVGElement;
    if(!svg || typeof svg.ownerDocument?.createElementNS !== 'function'){
      return null;
    }
    const overlay = svg.ownerDocument.createElementNS(SVG_NS, 'rect');
    overlay.setAttribute('fill', 'none');
    overlay.setAttribute('stroke', 'none');
    overlay.setAttribute('pointer-events', 'all');
    overlay.dataset.additionalLineControl = '1';
    overlay.dataset.additionalLineOverlay = '1';
    overlay.style.cursor = 'pointer';
    const parent = element.parentNode;
    if(!parent || typeof parent.insertBefore !== 'function'){
      return null;
    }
    parent.insertBefore(overlay, element.nextSibling);
    const padding = 6;
    const bounds = updateOverlayBounds(element, overlay, padding);
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { updateOverlayBounds(element, overlay, padding); })
      : null;
    if(observer){
      observer.observe(element, { attributes: true, attributeFilter: ['x1','y1','x2','y2','transform','x','y','width','height','d'] });
    }
    let removalObserver = null;
    if(parent && typeof MutationObserver === 'function'){
      removalObserver = new MutationObserver(records => {
        for(let i = 0; i < records.length; i += 1){
          const record = records[i];
          if(record.type !== 'childList'){ continue; }
          const removed = Array.from(record.removedNodes || []);
          if(removed.includes(element) || removed.includes(overlay)){
            if(observer){ observer.disconnect(); }
            if(removalObserver){ removalObserver.disconnect(); }
            overlay.remove();
            element.__additionalLineControlOverlay = null;
            return;
          }
        }
      });
      removalObserver.observe(parent, { childList: true });
    }
    const overlayInfo = {
      element: overlay,
      observer,
      removalObserver,
      padding,
      meta: bounds
    };
    element.__additionalLineControlOverlay = overlayInfo;
    return overlayInfo;
  }

  function closePanel(reason){
    if(!panelEl){ return; }
    if(typeof stylePickerCleanup === 'function'){
      try{ stylePickerCleanup(); }catch(err){}
      stylePickerCleanup = null;
    }
    panelEl.style.display = 'none';
    panelEl.hidden = true;
    panelEl.dataset.open = '0';
    if(activeHost){
      activeHost.classList.remove('font-toolbar-host--additional-line');
      if(typeof activeConfig?.hostClass === 'string' && activeConfig.hostClass){
        activeHost.classList.remove(activeConfig.hostClass);
      }
      const fontPanel = activeHost.querySelector('.font-controls-panel');
      const axisPanel = activeHost.querySelector('.axis-controls-panel');
      const significancePanel = activeHost.querySelector('.significance-controls-panel');
      const dendrogramPanel = activeHost.querySelector('.dendrogram-controls-panel');
      const gridPanel = activeHost.querySelector('.grid-controls-panel');
      const hasEmbeddedForm = !!activeHost.querySelector('.workspace-toolbar__form, .box-point-controls, [data-point-controls=\"1\"]');
      if((!fontPanel || fontPanel.dataset.open !== '1')
        && (!axisPanel || axisPanel.dataset.open !== '1')
        && (!significancePanel || significancePanel.dataset.open !== '1')
        && (!dendrogramPanel || dendrogramPanel.dataset.open !== '1')
        && (!gridPanel || gridPanel.dataset.open !== '1')
        && !hasEmbeddedForm
        && !activeConfig?.keepHostVisible){
        const toolbarApi = Shared.getWorkspaceToolbarApi();
        if(typeof toolbarApi.hideHost === 'function'){
          toolbarApi.hideHost(activeHost);
        }else{
          activeHost.classList.remove('font-toolbar-host--visible');
          activeHost.style.display = 'none';
          updateDockActiveState(activeHost, false);
        }
      }
    }
    logDebug('panel closed',{ reason });
    activeConfig = null;
    activeHost = null;
    activeScope = null;
  }

  function openPanel(config){
    ensurePanel();
    if(!panelEl || !config){ return; }
    if(config.skipHideAll !== true){
      try{
        if(Shared && typeof Shared.hideAllFormatControls === 'function'){
          try{ Shared.hideAllFormatControls({ force: true }); }catch(e){}
        }
      }catch(e){}
    }
    try{
      const dendrogramControls = global.Shared?.dendrogramControls;
      if(dendrogramControls && typeof dendrogramControls.close === 'function'){
        dendrogramControls.close('additional-line-open');
      }
    }catch(err){
      logDebug('dendrogram close failed',{ error: err?.message || String(err) });
    }
    activeConfig = config;

    if(scopeSelect){
      scopeSelect.innerHTML = '';
      const scopeCfg = config.scope && typeof config.scope === 'object' ? config.scope : null;
      const rawOptions = Array.isArray(scopeCfg?.options) ? scopeCfg.options : [];
      const normalizeScopeOptions = Shared && typeof Shared.normalizeScopeOptions === 'function'
        ? Shared.normalizeScopeOptions
        : (options => Array.isArray(options) ? options : []);
      const options = normalizeScopeOptions(rawOptions, { target: config.target }, scopeCfg);
      options.forEach(option => {
        const opt = scopeSelect.ownerDocument.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label || option.value;
        opt.disabled = !!option.disabled;
        if(option.scopeDataset != null){
          opt.dataset.scopeDataset = String(option.scopeDataset);
        }
        if(option.scopeKind != null){
          opt.dataset.scopeKind = String(option.scopeKind);
        }
        scopeSelect.appendChild(opt);
      });
      if(scopeSelect.options.length){
        const desired = typeof scopeCfg?.value === 'string' ? scopeCfg.value : scopeSelect.options[0].value;
        const preferred = Array.from(scopeSelect.options).some(opt => opt.value === desired && !opt.disabled)
          ? desired
          : (Array.from(scopeSelect.options).find(opt => !opt.disabled)?.value || scopeSelect.options[0].value);
        scopeSelect.value = preferred;
        activeScope = scopeSelect.value || null;
      }else{
        activeScope = null;
      }
    }

    const host = config.host || resolveToolbarHost(config.scopeId);
    if(host){
      if(config.clearHost === true || (config.appendToHost !== true && config.clearHost !== false)){
        try{
          host.querySelectorAll('.workspace-toolbar__form, .box-point-controls, [data-point-controls="1"]').forEach(n => n.remove());
        }catch(e){}
      }
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      clearHostSizing(host);
      const requestedHostDisplay = typeof config.hostDisplay === 'string' && config.hostDisplay.trim()
        ? config.hostDisplay.trim()
        : 'block';
      host.classList.add('font-toolbar-host--additional-line');
      if(typeof config.hostClass === 'string' && config.hostClass){
        host.classList.add(config.hostClass);
      }
      const toolbarApi = Shared.getWorkspaceToolbarApi();
      if(typeof toolbarApi.showHost === 'function'){
        toolbarApi.showHost(host, { hostClass: typeof config.hostClass === 'string' ? config.hostClass : '' });
        if(requestedHostDisplay !== 'flex'){
          host.style.display = requestedHostDisplay;
        }
      }else{
        host.style.display = requestedHostDisplay;
        host.classList.add('font-toolbar-host--visible');
        updateDockActiveState(host, true);
      }
      activeHost = host;
    }else{
      activeHost = null;
      logDebug('host unavailable for open',{ scopeId: config.scopeId });
    }
    updatePanelInputs(config);
    panelEl.style.display = 'grid';
    panelEl.hidden = false;
    panelEl.dataset.open = '1';
    logDebug('panel opened',{ axis: config.axis, index: config.index, scopeId: config.scopeId });
  }

  function setScope(nextScope, options){
    if(!scopeSelect || !activeConfig || !panelEl || panelEl.dataset.open !== '1'){
      return;
    }
    const opts = options || {};
    const requested = String(nextScope || '').trim();
    if(!requested){
      return;
    }
    const requestedDataset = String(opts.scopeDataset || '').trim();
    const allOptions = Array.from(scopeSelect.options || []);
    const datasetMatch = requestedDataset
      ? allOptions.find(opt => (
          opt.value === requested
          && !opt.disabled
          && String(opt?.dataset?.scopeDataset || '').trim() === requestedDataset
        ))
      : null;
    const hasOption = !!datasetMatch || allOptions.some(opt => opt.value === requested && !opt.disabled);
    if(!hasOption){
      return;
    }
    if(datasetMatch){
      const matchIndex = allOptions.findIndex(opt => opt === datasetMatch);
      if(matchIndex >= 0 && scopeSelect.selectedIndex !== matchIndex){
        scopeSelect.selectedIndex = matchIndex;
      }
    }else if(scopeSelect.value !== requested){
      scopeSelect.value = requested;
    }
    activeScope = scopeSelect.value || null;
    if(opts.triggerChange === true){
      const scopeCfg = activeConfig.scope;
      if(scopeCfg && typeof scopeCfg.onChange === 'function'){
        try{ scopeCfg.onChange(activeScope, getContext()); }catch(err){}
      }
    }
    syncPanelInputsFromConfig(activeConfig);
  }

  function registerAdditionalLineElement(element, config){
    if(!element || !config){ return; }
    element.dataset.additionalLineControl = '1';
    element.style.cursor = 'pointer';
    element.__additionalLineControlConfig = config;
    const overlayInfo = config.disableOverlay ? null : ensureLineOverlay(element);
    const handler = evt => {
      evt.preventDefault();
      evt.stopPropagation();
      const liveConfig = element.__additionalLineControlConfig || config;
      logDebug('line clicked',{ scopeId: liveConfig.scopeId, axis: liveConfig.axis, index: liveConfig.index });
      openPanel(Object.assign({}, liveConfig, { target: element }));
    };
    if(!element.__additionalLineControlHandler){
      element.addEventListener('click', handler);
      element.__additionalLineControlHandler = handler;
    }
    if(overlayInfo){
      overlayInfo.element.__additionalLineControlConfig = config;
      if(!overlayInfo.element.__additionalLineControlHandler){
        overlayInfo.element.addEventListener('click', handler);
        overlayInfo.element.__additionalLineControlHandler = handler;
      }
    }
  }

  function pruneToolbarHostCache(){
    Array.from(toolbarHostCache.entries()).forEach(([key, host]) => {
      if(!host || host.isConnected === false){
        toolbarHostCache.delete(key);
      }
    });
  }

  additionalLineControls.disposeTab = function disposeTab(){
    pruneToolbarHostCache();
    if(activeHost && activeHost.isConnected === false){
      closePanel('dispose-tab');
    }
    return true;
  };

  try{
    Shared.workspaceTabs?.registerSharedControlDisposer?.('additionalLineControls', additionalLineControls.disposeTab);
  }catch(_err){}

  additionalLineControls.ensurePanel = ensurePanel;
  additionalLineControls.registerAdditionalLineElement = registerAdditionalLineElement;
  additionalLineControls.close = closePanel;
  additionalLineControls.updateOverlayBounds = updateOverlayBounds;
  additionalLineControls.show = openPanel;
  additionalLineControls.refresh = () => syncPanelInputsFromConfig(activeConfig);
  additionalLineControls.setScope = setScope;
})(typeof window !== 'undefined' ? window : globalThis);

