(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const significanceControls = Shared.significanceControls = Shared.significanceControls || {};
  const SIGNIFICANCE_CONTROLS_DEFAULT_SCOPE = '__global__';

  // DOM-only toolbar host cache. It never owns tab state; stale disconnected hosts are pruned.
  const toolbarHostCache = new Map();
  let panelEl = null;
  let summaryValueEl = null;
  let thicknessInput = null;
  let colorInput = null;
  let styleChipEl = null;
  let styleChipPreviewEl = null;
  let styleChipValueEl = null;
  let whiskerToggleInput = null;
  let whiskerModeField = null;
  let whiskerModeSelect = null;
  let pScientificToggleInput = null;
  let pDecimalsField = null;
  let pDecimalsInput = null;
  let textStyleButton = null;
  let activeConfig = null;
  let activeHost = null;
  let hasDocListener = false;
  let applyingFromUndo = false;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function logDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: significanceControls ' + message, payload || {});
    }
  }

  function getUndoManager(){
    const manager = global.Shared?.undoManager;
    if(manager && typeof manager.recordStateChange === 'function'){
      return manager;
    }
    return null;
  }

  function configsMatch(a, b){
    if(!a || !b){ return false; }
    const orientationA = a.orientation || '';
    const orientationB = b.orientation || '';
    if(orientationA !== orientationB){ return false; }
    const scopeA = a.scopeId || '';
    const scopeB = b.scopeId || '';
    return scopeA === scopeB;
  }

  function sanitizeThicknessValue(value){
    if(value === null || value === undefined || value === ''){ return null; }
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){ return null; }
    return numeric;
  }

  function sanitizeColorState(value){
    if(typeof value !== 'string'){ return null; }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function normalizeColorForCompare(value){
    const sanitized = sanitizeColorState(value);
    return sanitized ? sanitized.toLowerCase() : '';
  }

  function toColorInputValue(value){
    const sanitized = sanitizeColorState(value);
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

  function sanitizeWhiskerValue(value){
    return value !== false;
  }

  function sanitizeWhiskerMode(value){
    if(typeof value !== 'string'){ return 'fixed'; }
    const trimmed = value.trim().toLowerCase();
    return trimmed === 'adaptive' ? 'adaptive' : 'fixed';
  }

  function sanitizeScientificValue(value){
    return value === true;
  }

  function sanitizeDecimalsValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 2;
    }
    const rounded = Math.round(numeric);
    return Math.max(0, Math.min(8, rounded));
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

  function updatePanelInputs(config){
    if(!panelEl || !config || !thicknessInput || !colorInput || !whiskerToggleInput){ return; }
    const orientationLabel = config.orientation === 'horizontal' ? 'Horizontal Bars' : 'Vertical Bars';
    if(summaryValueEl){
      summaryValueEl.textContent = orientationLabel;
    }
    const thicknessValueRaw = config.getThickness ? config.getThickness() : null;
    const thicknessValue = sanitizeThicknessValue(thicknessValueRaw);
    thicknessInput.value = thicknessValue === null ? '' : String(thicknessValue);
    const colorValueRaw = config.getColor ? config.getColor() : null;
    colorInput.value = toColorInputValue(colorValueRaw);
    syncStyleChipUi();
    const whiskerValueRaw = config.getWhiskers ? config.getWhiskers() : true;
    whiskerToggleInput.checked = sanitizeWhiskerValue(whiskerValueRaw);

    const hasWhiskerMode = !!(whiskerModeField && whiskerModeSelect && (config.getWhiskerMode || config.onWhiskerModeChange));
    if(hasWhiskerMode){
      whiskerModeField.style.display = '';
      const whiskerModeRaw = config.getWhiskerMode ? config.getWhiskerMode() : 'fixed';
      whiskerModeSelect.value = sanitizeWhiskerMode(whiskerModeRaw);
    }else if(whiskerModeField){
      whiskerModeField.style.display = 'none';
    }

    const hasPScientificMode = !!(pScientificToggleInput && (config.getPScientific || config.onPScientificChange));
    if(hasPScientificMode){
      const pScientificRaw = config.getPScientific ? config.getPScientific() : false;
      pScientificToggleInput.checked = sanitizeScientificValue(pScientificRaw);
      pScientificToggleInput.disabled = false;
      if(pScientificToggleInput.parentElement && pScientificToggleInput.parentElement.dataset){
        pScientificToggleInput.parentElement.dataset.checked = pScientificToggleInput.checked ? '1' : '0';
      }
    }else if(pScientificToggleInput){
      pScientificToggleInput.checked = false;
      pScientificToggleInput.disabled = true;
      if(pScientificToggleInput.parentElement && pScientificToggleInput.parentElement.dataset){
        pScientificToggleInput.parentElement.dataset.checked = '0';
      }
    }

    const hasPDecimals = !!(pDecimalsField && pDecimalsInput && (config.getPDecimals || config.onPDecimalsChange));
    if(hasPDecimals){
      pDecimalsField.style.display = '';
      const pDecimalsRaw = config.getPDecimals ? config.getPDecimals() : 2;
      pDecimalsInput.value = String(sanitizeDecimalsValue(pDecimalsRaw));
    }else if(pDecimalsField){
      pDecimalsField.style.display = 'none';
    }
  }

  function formatThicknessChipValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){
      return '0px';
    }
    const rounded = Math.round(numeric * 10) / 10;
    return `${rounded}px`;
  }

  function syncStyleChipUi(){
    if(!styleChipEl || !styleChipPreviewEl || !styleChipValueEl || !thicknessInput || !colorInput){
      return;
    }
    const thicknessValue = sanitizeThicknessValue(thicknessInput.value);
    styleChipPreviewEl.style.background = toColorInputValue(colorInput.value);
    styleChipValueEl.textContent = formatThicknessChipValue(thicknessValue == null ? 0 : thicknessValue);
  }

  function clearSignificanceStylePickerSection(overlayEl){
    if(!overlayEl || !overlayEl.querySelectorAll){
      return;
    }
    overlayEl.querySelectorAll('.shared-color-picker__section--significance-style').forEach(node => node.remove());
  }

  function attachSignificanceStylePickerThicknessSection(overlayEl){
    if(!overlayEl){
      return () => {};
    }
    clearSignificanceStylePickerSection(overlayEl);
    const doc = overlayEl.ownerDocument || global.document;
    if(!doc){
      return () => {};
    }
    const section = doc.createElement('section');
    section.className = 'shared-color-picker__section shared-color-picker__section--scatter-style shared-color-picker__section--significance-style';
    const title = doc.createElement('div');
    title.className = 'shared-color-picker__section-title';
    title.textContent = 'Line thickness';
    section.appendChild(title);
    const row = doc.createElement('div');
    row.className = 'shared-color-picker__scatter-style-row shared-color-picker__scatter-style-row--single';
    const field = doc.createElement('label');
    field.className = 'shared-color-picker__scatter-style-field';
    const input = doc.createElement('input');
    input.className = 'shared-color-picker__scatter-style-input';
    input.type = 'number';
    input.min = thicknessInput?.min || '0.25';
    input.max = thicknessInput?.max || '10';
    input.step = thicknessInput?.step || '0.25';
    input.value = thicknessInput?.value || '1';
    input.setAttribute('aria-label', 'Line thickness');
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

  function syncPanelInputsFromConfig(config){
    if(!panelEl || panelEl.dataset.open !== '1'){ return; }
    if(!configsMatch(activeConfig, config)){ return; }
    updatePanelInputs(activeConfig);
  }

  function recordSignificanceStateChange(config, type, previousValue, nextValue, applyFn, equals){
    const manager = getUndoManager();
    if(!manager){ return; }
    const compare = typeof equals === 'function'
      ? equals
      : ((a, b) => (a === b) || (a === null && b === null));
    if(compare(previousValue, nextValue)){ return; }
    const parts = ['significance'];
    if(config?.scopeId){ parts.push(config.scopeId); }
    if(config?.orientation){ parts.push(config.orientation); }
    parts.push(type);
    const label = parts.filter(Boolean).join(':');
    manager.recordStateChange({
      label,
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
      logDebug('host sizing cleared',{ scopeId: host.dataset?.fontToolbarScope || null, hasDock: true });
    } else {
      logDebug('host sizing cleared',{ scopeId: host.dataset?.fontToolbarScope || null, hasDock: false });
    }
  }

  function ensureDocumentListener(){
    if(hasDocListener || !global.document){ return; }
    global.document.addEventListener('click', evt => {
      if(!panelEl || panelEl.dataset.open !== '1'){ return; }
      if(panelEl.contains(evt.target)){ return; }
      if(activeHost && evt.target && typeof activeHost.contains === 'function' && activeHost.contains(evt.target)){
        logDebug('outside click ignored (within shared host)', {
          scopeId: activeHost.dataset?.fontToolbarScope || null
        });
        return;
      }
      if(evt.target?.dataset?.significanceControl === '1'){ return; }
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
    const key = scopeId || SIGNIFICANCE_CONTROLS_DEFAULT_SCOPE;
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
        logDebug('resolveToolbarHost preferred anchor match',{ scopeId: key, anchorId: preferredAnchorId });
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
          logDebug('host fallback matched',{ scopeId: key, candidateId });
        }
      }
    }
    if(!button && scopeId){
      const dataHost = doc.querySelector(`[data-font-toolbar-scope="${key}"]`);
      if(dataHost){
        button = dataHost;
        logDebug('host data attribute match',{ scopeId: key });
      }
    }
    let existingHost = doc.querySelector(`.font-toolbar-host[data-font-toolbar-scope="${key}"]`);
    if(existingHost){
      toolbarHostCache.set(key, existingHost);
      logDebug('host reused existing font toolbar',{ scopeId: key });
      return existingHost;
    }
    if(!button){
      logDebug('host missing button',{ scopeId: key });
      return null;
    }
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = key;
    host.style.display = 'none';
    button.insertAdjacentElement('afterend', host);
    toolbarHostCache.set(key, host);
    logDebug('host created',{ scopeId: key, buttonId });
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

  function resolveFontTarget(config){
    if(!config){ return null; }
    if(typeof config.getFontTarget === 'function'){
      const target = config.getFontTarget();
      if(target){ return target; }
    }
    if(config.fontTarget && config.fontTarget.nodeType === 1){
      return config.fontTarget;
    }
    return null;
  }

  function openFontControlsForConfig(config, reason){
    const fontControls = Shared?.fontControls;
    if(!fontControls || typeof fontControls.openForElement !== 'function'){
      return;
    }
    const target = resolveFontTarget(config);
    if(!target){
      logDebug('font target unavailable',{ reason, scopeId: config?.scopeId || null });
      return;
    }
    const options = {
      scopeId: config?.scopeId || target?.dataset?.fontScope || null,
      key: config?.fontKey || target?.dataset?.fontKey || null,
      coexistWithComponent: true,
      coexistComponentClass: 'font-toolbar-host--significance-dual',
      host: activeHost && activeHost.nodeType === 1 ? activeHost : null
    };
    fontControls.openForElement(target, options);
    logDebug('font controls opened',{ reason, scopeId: options.scopeId, key: options.key || null });
  }

  function ensurePanel(){
    if(panelEl || !global.document){ return panelEl; }
    const doc = global.document;
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    const panelParts = toolbarApi.createSubPanel({
      panelClass: 'significance-controls-panel additional-line-controls-panel',
      role: 'toolbar',
      ariaLabel: 'Significance bar controls',
      title: 'Significance bars, p-value format',
      rowClass: 'additional-line-controls-panel__row significance-controls-panel__row'
    });
    panelEl = panelParts.panel;
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.hidden = true;
    panelParts.title.classList.add('additional-line-controls-panel__title', 'significance-controls-panel__title');

    const row = panelParts.row;

    summaryValueEl = null;

    const styleField = doc.createElement('label');
    styleField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--style significance-controls-panel__field significance-controls-panel__field--style';
    const styleLabel = doc.createElement('span');
    styleLabel.className = 'additional-line-controls-panel__field-label significance-controls-panel__field-label';
    styleLabel.textContent = 'Border';
    const styleControlParts = toolbarApi.createBorderStyleControl({
      chipTitle: 'Click to edit significance bar color. Wheel or Alt+drag to adjust thickness.',
      includeThicknessInput: true,
      thicknessInputClass: 'additional-line-controls-panel__input additional-line-controls-panel__input--small significance-controls-panel__input significance-controls-panel__input--small',
      thicknessInputAttrs: {
        min: '0.25',
        max: '10',
        step: '0.25',
        placeholder: '1',
        'data-undo-ignore': '1'
      },
      colorInputClass: 'shared-border-style-input significance-controls-panel__color-input',
      colorInputAttrs: { 'data-undo-ignore': '1' }
    });
    thicknessInput = styleControlParts.thicknessInput;
    colorInput = styleControlParts.colorInput;
    const styleControl = styleControlParts.control;
    styleChipEl = styleControlParts.chip;
    styleChipPreviewEl = styleControlParts.preview;
    styleChipValueEl = styleControlParts.value;
    styleField.appendChild(styleLabel);
    // Keep hidden input in DOM for existing event/undo wiring.
    styleField.appendChild(thicknessInput);
    styleField.appendChild(styleControl);
    row.appendChild(styleField);

    let stylePickerCleanup = null;
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
        stylePickerCleanup = attachSignificanceStylePickerThicknessSection(overlayEl);
      });
    }else if(typeof Shared.attachColorPickerNear === 'function'){
      Shared.attachColorPickerNear(colorInput);
      styleChipEl.addEventListener('click', evt => {
        evt.preventDefault();
        colorInput.click();
      });
    }
    styleChipEl.addEventListener('wheel', evt => {
      evt.preventDefault();
      const current = sanitizeThicknessValue(thicknessInput.value) ?? 1;
      const step = evt.deltaY < 0 ? 0.5 : -0.5;
      thicknessInput.value = String(Math.max(0.25, current + step));
      thicknessInput.dispatchEvent(new Event('change', { bubbles: true }));
    }, { passive: false });
    let styleDragState = null;
    const onStyleMove = evt => {
      if(!styleDragState){ return; }
      const deltaX = evt.clientX - styleDragState.startX;
      const steps = Math.round(deltaX / 8);
      const next = Math.max(0.25, styleDragState.startValue + (steps * 0.5));
      thicknessInput.value = String(next);
      thicknessInput.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const onStyleUp = () => {
      if(!styleDragState){ return; }
      styleDragState = null;
      global.removeEventListener('mousemove', onStyleMove);
      global.removeEventListener('mouseup', onStyleUp);
    };
    styleChipEl.addEventListener('mousedown', evt => {
      if(!evt.altKey || evt.button !== 0){ return; }
      evt.preventDefault();
      styleDragState = {
        startX: evt.clientX,
        startValue: sanitizeThicknessValue(thicknessInput.value) ?? 1
      };
      global.addEventListener('mousemove', onStyleMove);
      global.addEventListener('mouseup', onStyleUp);
    });

    const whiskerField = doc.createElement('label');
    whiskerField.className = 'additional-line-controls-panel__field significance-controls-panel__field significance-controls-panel__field--toggle';
    const whiskerLabel = doc.createElement('span');
    whiskerLabel.className = 'additional-line-controls-panel__field-label significance-controls-panel__field-label';
    whiskerLabel.textContent = 'Whiskers';
    whiskerField.appendChild(whiskerLabel);
    const toggleRow = doc.createElement('div');
    toggleRow.className = 'significance-controls-panel__toggle-row';
    const whiskerSwitch = doc.createElement('label');
    whiskerSwitch.className = 'workspace-toolbar__checkbox workspace-toolbar__checkbox--toolbar significance-controls-panel__checkbox-chip';
    whiskerSwitch.dataset.checked = '0';
    whiskerToggleInput = doc.createElement('input');
    whiskerToggleInput.type = 'checkbox';
    whiskerToggleInput.className = 'significance-controls-panel__checkbox';
    whiskerToggleInput.setAttribute('aria-label', 'Toggle significance whiskers');
    whiskerToggleInput.setAttribute('data-undo-ignore','1');
    whiskerSwitch.appendChild(whiskerToggleInput);
    toggleRow.appendChild(whiskerSwitch);
    whiskerField.appendChild(toggleRow);
    row.appendChild(whiskerField);

    whiskerModeField = doc.createElement('label');
    whiskerModeField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--numeric significance-controls-panel__field significance-controls-panel__field--numeric';
    const whiskerModeLabel = doc.createElement('span');
    whiskerModeLabel.className = 'additional-line-controls-panel__field-label significance-controls-panel__field-label';
    whiskerModeLabel.textContent = 'Whisker Style';
    whiskerModeSelect = doc.createElement('select');
    whiskerModeSelect.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--select significance-controls-panel__input significance-controls-panel__input--square';
    whiskerModeSelect.setAttribute('aria-label', 'Significance whisker style');
    whiskerModeSelect.setAttribute('data-undo-ignore','1');
    const optionFixed = doc.createElement('option');
    optionFixed.value = 'fixed';
    optionFixed.textContent = 'Fixed';
    const optionAdaptive = doc.createElement('option');
    optionAdaptive.value = 'adaptive';
    optionAdaptive.textContent = 'Adaptive';
    whiskerModeSelect.appendChild(optionFixed);
    whiskerModeSelect.appendChild(optionAdaptive);
    whiskerModeField.appendChild(whiskerModeLabel);
    whiskerModeField.appendChild(whiskerModeSelect);
    whiskerModeField.style.display = 'none';
    row.appendChild(whiskerModeField);

    const pScientificField = doc.createElement('label');
    pScientificField.className = 'additional-line-controls-panel__field significance-controls-panel__field significance-controls-panel__field--toggle';
    const pScientificLabel = doc.createElement('span');
    pScientificLabel.className = 'additional-line-controls-panel__field-label significance-controls-panel__field-label';
    pScientificLabel.textContent = 'Scientific';
    pScientificField.appendChild(pScientificLabel);
    const pScientificRow = doc.createElement('div');
    pScientificRow.className = 'significance-controls-panel__toggle-row';
    const pScientificSwitch = doc.createElement('label');
    pScientificSwitch.className = 'workspace-toolbar__checkbox workspace-toolbar__checkbox--toolbar significance-controls-panel__checkbox-chip';
    pScientificSwitch.dataset.checked = '0';
    pScientificToggleInput = doc.createElement('input');
    pScientificToggleInput.type = 'checkbox';
    pScientificToggleInput.className = 'significance-controls-panel__checkbox';
    pScientificToggleInput.setAttribute('aria-label', 'Toggle scientific notation for significance p-values');
    pScientificToggleInput.setAttribute('data-undo-ignore', '1');
    pScientificSwitch.appendChild(pScientificToggleInput);
    pScientificRow.appendChild(pScientificSwitch);
    pScientificField.appendChild(pScientificRow);
    row.appendChild(pScientificField);

    pDecimalsField = doc.createElement('label');
    pDecimalsField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--numeric significance-controls-panel__field significance-controls-panel__field--numeric';
    const pDecimalsLabel = doc.createElement('span');
    pDecimalsLabel.className = 'additional-line-controls-panel__field-label significance-controls-panel__field-label';
    pDecimalsLabel.textContent = 'Decimals';
    pDecimalsInput = doc.createElement('input');
    pDecimalsInput.type = 'number';
    pDecimalsInput.min = '0';
    pDecimalsInput.max = '8';
    pDecimalsInput.step = '1';
    pDecimalsInput.placeholder = '2';
    pDecimalsInput.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--small significance-controls-panel__input significance-controls-panel__input--small significance-controls-panel__input--square';
    pDecimalsInput.setAttribute('aria-label', 'Number of decimals for significance p-values');
    pDecimalsInput.setAttribute('data-undo-ignore', '1');
    pDecimalsField.appendChild(pDecimalsLabel);
    pDecimalsField.appendChild(pDecimalsInput);
    pDecimalsField.style.display = 'none';
    row.appendChild(pDecimalsField);

    textStyleButton = null;

    thicknessInput.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      const raw = thicknessInput.value;
      const previousValue = sanitizeThicknessValue(config.getThickness ? config.getThickness() : null);
      const requestedValue = sanitizeThicknessValue(raw);
      logDebug('thickness change',{ raw, numeric: requestedValue });
      if(config.onThicknessChange){
        config.onThicknessChange(requestedValue);
      }
      const nextValue = sanitizeThicknessValue(config.getThickness ? config.getThickness() : null);
      syncStyleChipUi();
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'thickness',
        previousValue,
        nextValue,
        value => {
          if(config.onThicknessChange){
            config.onThicknessChange(value);
          }
        }
      );
    });

    colorInput.addEventListener('input', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      const previousValue = sanitizeColorState(config.getColor ? config.getColor() : null);
      const raw = colorInput.value || null;
      const requestedValue = sanitizeColorState(raw);
      logDebug('color change',{ value: requestedValue });
      if(config.onColorChange){
        config.onColorChange(requestedValue);
      }
      const nextValue = sanitizeColorState(config.getColor ? config.getColor() : null);
      syncStyleChipUi();
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'color',
        previousValue,
        nextValue,
        value => {
          if(config.onColorChange){
            config.onColorChange(value);
          }
        },
        (a, b) => normalizeColorForCompare(a) === normalizeColorForCompare(b)
      );
    });

    colorInput.addEventListener('change', () => {
      syncStyleChipUi();
    });

    whiskerToggleInput.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      const previousValue = sanitizeWhiskerValue(config.getWhiskers ? config.getWhiskers() : null);
      const nextValue = sanitizeWhiskerValue(whiskerToggleInput.checked);
      logDebug('whisker toggle change',{ value: nextValue });
      if(config.onWhiskersChange){
        config.onWhiskersChange(nextValue);
      }
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'whiskers',
        previousValue,
        nextValue,
        value => {
          if(config.onWhiskersChange){
            config.onWhiskersChange(value);
          }
        }
      );
    });

    whiskerModeSelect.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      if(!config.getWhiskerMode && !config.onWhiskerModeChange){ return; }
      const previousValue = sanitizeWhiskerMode(config.getWhiskerMode ? config.getWhiskerMode() : null);
      const nextValue = sanitizeWhiskerMode(whiskerModeSelect.value);
      logDebug('whisker mode change',{ value: nextValue });
      if(config.onWhiskerModeChange){
        config.onWhiskerModeChange(nextValue);
      }
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'whisker-mode',
        previousValue,
        nextValue,
        value => {
          if(config.onWhiskerModeChange){
            config.onWhiskerModeChange(sanitizeWhiskerMode(value));
          }
        }
      );
    });

    pScientificToggleInput.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      if(!config.getPScientific && !config.onPScientificChange){ return; }
      const previousValue = sanitizeScientificValue(config.getPScientific ? config.getPScientific() : null);
      const nextValue = sanitizeScientificValue(pScientificToggleInput.checked);
      if(pScientificToggleInput.parentElement && pScientificToggleInput.parentElement.dataset){
        pScientificToggleInput.parentElement.dataset.checked = nextValue ? '1' : '0';
      }
      logDebug('p scientific toggle change', { value: nextValue });
      if(config.onPScientificChange){
        config.onPScientificChange(nextValue);
      }
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'p-scientific',
        previousValue,
        nextValue,
        value => {
          if(config.onPScientificChange){
            config.onPScientificChange(sanitizeScientificValue(value));
          }
        }
      );
    });

    pDecimalsInput.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      if(!config.getPDecimals && !config.onPDecimalsChange){ return; }
      const previousValue = sanitizeDecimalsValue(config.getPDecimals ? config.getPDecimals() : null);
      const nextValue = sanitizeDecimalsValue(pDecimalsInput.value);
      pDecimalsInput.value = String(nextValue);
      logDebug('p decimals change', { value: nextValue });
      if(config.onPDecimalsChange){
        config.onPDecimalsChange(nextValue);
      }
      syncPanelInputsFromConfig(config);
      recordSignificanceStateChange(
        config,
        'p-decimals',
        previousValue,
        nextValue,
        value => {
          if(config.onPDecimalsChange){
            config.onPDecimalsChange(sanitizeDecimalsValue(value));
          }
        }
      );
    });

    ensureDocumentListener();
    syncStyleChipUi();
    logDebug('panel created');
    return panelEl;
  }

  function updateOverlayBounds(target, overlay, padding){
    if(!target || !overlay || typeof target.getBBox !== 'function'){ return null; }
    let bbox;
    try{
      bbox = target.getBBox();
    }catch(err){
      logDebug('overlay bbox failed',{ error: err && err.message });
      return null;
    }
    if(!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)){ return null; }
    const pad = Number.isFinite(padding) ? padding : 5;
    const inflate = Math.max(2, pad);
    const width = Math.max(1, bbox.width + inflate * 2);
    const height = Math.max(1, bbox.height + inflate * 2);
    overlay.setAttribute('x', String(bbox.x - inflate));
    overlay.setAttribute('y', String(bbox.y - inflate));
    overlay.setAttribute('width', String(width));
    overlay.setAttribute('height', String(height));
    return { width, height, inflate };
  }

  function ensureSignificanceOverlay(element){
    if(!element || element.__significanceControlOverlay){
      if(element && element.__significanceControlOverlay){
        const info = element.__significanceControlOverlay;
        updateOverlayBounds(element, info.element, info.padding);
        return info;
      }
      return null;
    }
    const svg = element.ownerSVGElement;
    if(!svg || typeof svg.ownerDocument?.createElementNS !== 'function'){ return null; }
    const overlay = svg.ownerDocument.createElementNS(SVG_NS, 'rect');
    overlay.setAttribute('fill', 'transparent');
    overlay.setAttribute('pointer-events', 'fill');
    overlay.dataset.significanceControl = '1';
    overlay.style.cursor = 'pointer';
    const parent = element.parentNode;
    if(parent && typeof parent.insertBefore === 'function'){
      parent.insertBefore(overlay, element.nextSibling);
    }else{
      logDebug('overlay missing parent',{ hasParent: !!parent });
      return null;
    }
    const padding = 6;
    const bounds = updateOverlayBounds(element, overlay, padding);
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { updateOverlayBounds(element, overlay, padding); })
      : null;
    if(observer){
      observer.observe(element, { attributes: true, subtree: true, childList: true });
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
            element.__significanceControlOverlay = null;
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
    element.__significanceControlOverlay = overlayInfo;
    logDebug('significance overlay ensured',{ inflate: bounds ? bounds.inflate : null });
    return overlayInfo;
  }

  function closePanel(reason){
    if(!panelEl){ return; }
    panelEl.style.display = 'none';
    panelEl.hidden = true;
    panelEl.dataset.open = '0';
    if(activeHost){
      activeHost.classList.remove('font-toolbar-host--significance');
      activeHost.classList.remove('font-toolbar-host--significance-dual');
      activeHost.style.removeProperty('display');
      activeHost.style.removeProperty('grid-auto-flow');
      activeHost.style.removeProperty('grid-auto-columns');
      activeHost.style.removeProperty('column-gap');
      activeHost.style.removeProperty('align-items');
      activeHost.style.removeProperty('justify-content');
      const fontPanel = activeHost.querySelector('.font-controls-panel');
      const axisPanel = activeHost.querySelector('.axis-controls-panel');
      const dendrogramPanel = activeHost.querySelector('.dendrogram-controls-panel');
      const additionalLinePanel = activeHost.querySelector('.additional-line-controls-panel');
      const gridPanel = activeHost.querySelector('.grid-controls-panel');
      const hasEmbeddedForm = !!activeHost.querySelector('.workspace-toolbar__form, .box-point-controls, [data-point-controls=\"1\"]');
      const additionalLineOpen = !!(additionalLinePanel && additionalLinePanel.dataset.open === '1');
      if((!fontPanel || fontPanel.dataset.open !== '1')
        && (!axisPanel || axisPanel.dataset.open !== '1')
        && (!dendrogramPanel || dendrogramPanel.dataset.open !== '1')
        && (!gridPanel || gridPanel.dataset.open !== '1')
        && !additionalLineOpen
        && !hasEmbeddedForm){
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
  }

  function openPanel(config){
    ensurePanel();
    if(!panelEl){ return; }
    try{
      if(Shared && typeof Shared.hideAllFormatControls === 'function'){
        try{ Shared.hideAllFormatControls({ force: true }); }catch(e){}
      }
    }catch(e){}
    try{
      const dendrogramControls = global.Shared?.dendrogramControls;
      if(dendrogramControls && typeof dendrogramControls.close === 'function'){
        dendrogramControls.close('significance-open');
      }
    }catch(err){
      logDebug('dendrogram close failed',{ error: err?.message || String(err) });
    }
    activeConfig = config;
    const host = resolveToolbarHost(config.scopeId);
    if(host){
      try{
        host.querySelectorAll('.workspace-toolbar__form, .box-point-controls, [data-point-controls="1"]').forEach(n => n.remove());
      }catch(e){}
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      clearHostSizing(host);
      const toolbarApi = Shared.getWorkspaceToolbarApi();
      if(typeof toolbarApi.showHost === 'function'){
        toolbarApi.showHost(host, { hostClass: 'font-toolbar-host--significance' });
      }else{
        host.style.display = 'block';
        host.classList.add('font-toolbar-host--visible');
        host.classList.add('font-toolbar-host--significance');
        updateDockActiveState(host, true);
      }
      activeHost = host;
    }else{
      activeHost = null;
      logDebug('host unavailable for open',{ scopeId: config.scopeId });
    }
    updatePanelInputs(config);
    panelEl.style.display = 'flex';
    panelEl.hidden = false;
    panelEl.dataset.open = '1';
    if(textStyleButton){
      textStyleButton.disabled = !resolveFontTarget(config);
    }
    openFontControlsForConfig(config, 'significance-open');
    logDebug('panel opened',{ orientation: config.orientation, scopeId: config.scopeId });
  }

  function registerSignificanceElement(element, config){
    if(!element || !config){ return; }
    element.dataset.significanceControl = '1';
    element.style.cursor = 'pointer';
    const disableOverlay = config.disableOverlay === true;
    const overlayInfo = disableOverlay ? null : ensureSignificanceOverlay(element);
    const handler = evt => {
      evt.preventDefault();
      evt.stopPropagation();
      logDebug('significance clicked',{ orientation: config.orientation, scopeId: config.scopeId });
      openPanel({
        orientation: config.orientation,
        scopeId: config.scopeId,
        undoScope: config.undoScope,
        getThickness: config.getThickness,
        getColor: config.getColor,
        getWhiskers: config.getWhiskers,
        getWhiskerMode: config.getWhiskerMode,
        getPScientific: config.getPScientific,
        getPDecimals: config.getPDecimals,
        getFontTarget: config.getFontTarget,
        fontTarget: config.fontTarget,
        fontKey: config.fontKey,
        onThicknessChange: config.onThicknessChange,
        onColorChange: config.onColorChange,
        onWhiskersChange: config.onWhiskersChange,
        onWhiskerModeChange: config.onWhiskerModeChange,
        onPScientificChange: config.onPScientificChange,
        onPDecimalsChange: config.onPDecimalsChange
      });
    };
    if(!element.__significanceControlHandler){
      element.addEventListener('click', handler);
      element.__significanceControlHandler = handler;
    }
    if(overlayInfo && !overlayInfo.element.__significanceControlHandler){
      overlayInfo.element.addEventListener('click', handler);
      overlayInfo.element.__significanceControlHandler = handler;
    }
    logDebug('significance element registered',{ orientation: config.orientation, scopeId: config.scopeId, overlay: overlayInfo ? overlayInfo.meta : null });
  }

  function pruneToolbarHostCache(){
    Array.from(toolbarHostCache.entries()).forEach(([key, host]) => {
      if(!host || host.isConnected === false){
        toolbarHostCache.delete(key);
      }
    });
  }

  significanceControls.disposeTab = function disposeTab(){
    pruneToolbarHostCache();
    if(activeHost && activeHost.isConnected === false){
      closePanel('dispose-tab');
    }
    return true;
  };

  try{
    Shared.workspaceTabs?.registerSharedControlDisposer?.('significanceControls', significanceControls.disposeTab);
  }catch(_err){}

  significanceControls.ensurePanel = ensurePanel;
  significanceControls.registerSignificanceElement = registerSignificanceElement;
  significanceControls.close = closePanel;
  significanceControls.updateOverlayBounds = updateOverlayBounds;
})(typeof window !== 'undefined' ? window : globalThis);

