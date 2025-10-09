(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const axisControls = Shared.axisControls = Shared.axisControls || {};

  const hostCache = new Map();
  let panelEl = null;
  let axisLabelEl = null;
  let tickInput = null;
  let thicknessInput = null;
  let colorInput = null;
  let activeConfig = null;
  let activeHost = null;
  let hasDocListener = false;

  function logDebug(message, payload){
    console.debug('Debug: axisControls ' + message, payload || {});
  }

  function ensureDocumentListener(){
    if(hasDocListener || !global.document){ return; }
    global.document.addEventListener('click', evt => {
      if(!panelEl || panelEl.dataset.open !== '1'){ return; }
      if(panelEl.contains(evt.target)){ return; }
      if(evt.target?.dataset?.axisControl === '1'){ return; }
      closePanel('outside');
    });
    hasDocListener = true;
    logDebug('document listener attached');
  }

  function resolveToolbarHost(scopeId){
    if(!global.document){ return null; }
    const doc = global.document;
    const key = scopeId || '__global__';
    if(hostCache.has(key)){
      return hostCache.get(key);
    }
    let button = null;
    const buttonId = scopeId ? `${scopeId}LoadExample` : null;
    if(buttonId){
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
      hostCache.set(key, existingHost);
      logDebug('host reused existing font toolbar',{ scopeId: key });
      return existingHost;
    }
    if(!button){
      logDebug('host missing button',{ scopeId: key });
      hostCache.set(key, null);
      return null;
    }
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = key;
    host.style.display = 'none';
    button.insertAdjacentElement('afterend', host);
    hostCache.set(key, host);
    logDebug('host created',{ scopeId: key, buttonId });
    return host;
  }

  function ensurePanel(){
    if(panelEl || !global.document){ return panelEl; }
    const doc = global.document;
    panelEl = doc.createElement('div');
    panelEl.className = 'axis-controls-panel';
    panelEl.setAttribute('role', 'toolbar');
    panelEl.setAttribute('aria-label', 'Axis controls');
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.hidden = true;

    const axisGroup = doc.createElement('div');
    axisGroup.className = 'axis-controls-panel__summary';
    const axisLabelTitle = doc.createElement('span');
    axisLabelTitle.className = 'axis-controls-panel__summary-label';
    axisLabelTitle.textContent = 'Axis';
    axisLabelEl = doc.createElement('span');
    axisLabelEl.className = 'axis-controls-panel__summary-value';
    axisGroup.appendChild(axisLabelTitle);
    axisGroup.appendChild(axisLabelEl);
    panelEl.appendChild(axisGroup);

    const tickField = doc.createElement('label');
    tickField.className = 'axis-controls-panel__field';
    const tickLabel = doc.createElement('span');
    tickLabel.className = 'axis-controls-panel__field-label';
    tickLabel.textContent = 'Tick interval';
    tickInput = doc.createElement('input');
    tickInput.type = 'number';
    tickInput.min = '0';
    tickInput.step = '0.1';
    tickInput.placeholder = 'Auto';
    tickInput.className = 'axis-controls-panel__input';
    tickField.appendChild(tickLabel);
    tickField.appendChild(tickInput);
    panelEl.appendChild(tickField);

    const thicknessField = doc.createElement('label');
    thicknessField.className = 'axis-controls-panel__field';
    const thicknessLabel = doc.createElement('span');
    thicknessLabel.className = 'axis-controls-panel__field-label';
    thicknessLabel.textContent = 'Axis thickness';
    thicknessInput = doc.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.min = '0.25';
    thicknessInput.max = '10';
    thicknessInput.step = '0.25';
    thicknessInput.placeholder = '1';
    thicknessInput.className = 'axis-controls-panel__input';
    thicknessField.appendChild(thicknessLabel);
    thicknessField.appendChild(thicknessInput);
    panelEl.appendChild(thicknessField);

    const colorField = doc.createElement('label');
    colorField.className = 'axis-controls-panel__field axis-controls-panel__field--compact';
    const colorLabel = doc.createElement('span');
    colorLabel.className = 'axis-controls-panel__field-label';
    colorLabel.textContent = 'Axis color';
    colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'axis-controls-panel__color-input';
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorInput);
    panelEl.appendChild(colorField);

    if(typeof Shared.attachColorPickerNear === 'function'){
      Shared.attachColorPickerNear(colorInput);
    }

    tickInput.addEventListener('change', () => {
      if(!activeConfig){ return; }
      const raw = tickInput.value;
      const value = raw === '' ? null : Number(raw);
      logDebug('tick interval change',{ raw, value, axis: activeConfig.axis });
      if(activeConfig.onTickIntervalChange){
        activeConfig.onTickIntervalChange(value, activeConfig.axis);
      }
      const nextValue = activeConfig.getTickInterval ? activeConfig.getTickInterval(activeConfig.axis) : null;
      if(nextValue === null || typeof nextValue === 'undefined' || Number.isNaN(nextValue)){
        tickInput.value = '';
      } else {
        tickInput.value = String(nextValue);
      }
    });

    thicknessInput.addEventListener('change', () => {
      if(!activeConfig){ return; }
      const raw = thicknessInput.value;
      const numeric = raw === '' ? null : Number(raw);
      logDebug('thickness change',{ raw, numeric });
      if(activeConfig.onThicknessChange){
        activeConfig.onThicknessChange(numeric);
      }
      const nextThickness = activeConfig.getThickness ? activeConfig.getThickness() : null;
      if(nextThickness === null || typeof nextThickness === 'undefined' || Number.isNaN(nextThickness)){
        thicknessInput.value = '';
      } else {
        thicknessInput.value = String(nextThickness);
      }
    });

    colorInput.addEventListener('input', () => {
      if(!activeConfig){ return; }
      const value = colorInput.value || null;
      logDebug('color change',{ value });
      if(activeConfig.onColorChange){
        activeConfig.onColorChange(value);
      }
    });

    ensureDocumentListener();
    logDebug('panel created');
    return panelEl;
  }

  function closePanel(reason){
    if(!panelEl){ return; }
    panelEl.style.display = 'none';
    panelEl.hidden = true;
    panelEl.dataset.open = '0';
    if(activeHost){
      const fontPanel = activeHost.querySelector('.font-controls-panel');
      if(!fontPanel || fontPanel.dataset.open !== '1'){
        activeHost.classList.remove('font-toolbar-host--visible');
        activeHost.style.display = 'none';
      }
    }
    logDebug('panel closed',{ reason });
    activeConfig = null;
    activeHost = null;
  }

  function openPanel(config){
    ensurePanel();
    if(!panelEl){ return; }
    activeConfig = config;
    const host = resolveToolbarHost(config.scopeId);
    if(host){
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      host.style.display = 'flex';
      host.classList.add('font-toolbar-host--visible');
      activeHost = host;
    } else {
      activeHost = null;
      logDebug('host unavailable for open',{ scopeId: config.scopeId });
    }
    const axisName = config.axis === 'y' ? 'Y axis' : 'X axis';
    axisLabelEl.textContent = axisName;
    if(config.axis === 'x'){
      tickInput.step = '1';
      tickInput.min = '1';
    } else {
      tickInput.step = '0.1';
      tickInput.min = '0';
    }
    const tickValue = config.getTickInterval ? config.getTickInterval(config.axis) : null;
    if(tickValue === null || typeof tickValue === 'undefined' || tickValue === ''){
      tickInput.value = '';
    } else {
      tickInput.value = String(tickValue);
    }
    const thicknessValue = config.getThickness ? config.getThickness() : null;
    if(thicknessValue === null || typeof thicknessValue === 'undefined' || Number.isNaN(thicknessValue)){
      thicknessInput.value = '';
    } else {
      thicknessInput.value = String(thicknessValue);
    }
    const colorValue = config.getColor ? config.getColor() : null;
    colorInput.value = colorValue || '#000000';
    panelEl.style.display = 'flex';
    panelEl.hidden = false;
    panelEl.dataset.open = '1';
    logDebug('panel opened',{ axis: config.axis, scopeId: config.scopeId });
  }

  function registerAxisElement(element, config){
    if(!element || !config){ return; }
    element.dataset.axisControl = '1';
    element.style.cursor = 'pointer';
    const handler = evt => {
      evt.preventDefault();
      evt.stopPropagation();
      logDebug('axis clicked',{ axis: config.axis, scopeId: config.scopeId });
      openPanel({
        axis: config.axis,
        scopeId: config.scopeId,
        getTickInterval: config.getTickInterval,
        getThickness: config.getThickness,
        getColor: config.getColor,
        onTickIntervalChange: config.onTickIntervalChange,
        onThicknessChange: config.onThicknessChange,
        onColorChange: config.onColorChange
      });
    };
    element.addEventListener('click', handler);
    logDebug('axis element registered',{ axis: config.axis, scopeId: config.scopeId });
  }

  axisControls.ensurePanel = ensurePanel;
  axisControls.registerAxisElement = registerAxisElement;
  axisControls.close = closePanel;
})(typeof window !== 'undefined' ? window : globalThis);
