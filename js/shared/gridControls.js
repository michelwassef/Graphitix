(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const hostCache = new Map();
  let panelEl = null;
  let panelTitleEl = null;
  let fieldsRowEl = null;
  let thicknessField = null;
  let thicknessLabelEl = null;
  let thicknessInput = null;
  let colorField = null;
  let colorLabelEl = null;
  let colorInput = null;
  let styleField = null;
  let styleLabelEl = null;
  let styleControlEl = null;
  let styleChipEl = null;
  let styleChipPreviewEl = null;
  let styleChipValueEl = null;
  let stylePickerCleanup = null;
  let styleDragState = null;
  let suppressStyleChipClick = false;
  let patternField = null;
  let patternLabelEl = null;
  let patternSelect = null;
  let transparencyField = null;
  let transparencyLabelEl = null;
  let transparencyInput = null;
  let transparencyValueEl = null;
  let activeConfig = null;
  let activeHost = null;
  let hasDocListener = false;
  let applyingSync = false;
  let colorPickerAttached = false;

  const DEFAULTS = Object.freeze({
    color: '#dddddd',
    thickness: 1,
    pattern: 'solid',
    transparency: 0
  });

  function isDebugEnabled(){
    try{
      return !Shared.isDebugEnabled || Shared.isDebugEnabled();
    }catch(err){
      return true;
    }
  }

  function logDebug(message, payload){
    if(!isDebugEnabled()){ return; }
    if(payload === undefined){
      console.debug('[gridControls] ' + message);
      return;
    }
    console.debug('[gridControls] ' + message, payload);
  }

  function clamp(value, min, max){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){ return min; }
    if(numeric < min){ return min; }
    if(numeric > max){ return max; }
    return numeric;
  }

  function sanitizePattern(value){
    const normalized = String(value || '').trim().toLowerCase();
    if(normalized === 'dashed' || normalized === 'dotted' || normalized === 'solid'){
      return normalized;
    }
    return 'solid';
  }

  function sanitizeColor(value, fallback){
    const candidate = String(value || '').trim();
    if(/^#[0-9a-f]{6}$/i.test(candidate)){ return candidate.toLowerCase(); }
    if(/^#[0-9a-f]{3}$/i.test(candidate)){
      const short = candidate.toLowerCase();
      return '#' + short.slice(1).split('').map(ch => ch + ch).join('');
    }
    return sanitizeColor(fallback || DEFAULTS.color, DEFAULTS.color);
  }

  function sanitizeThickness(value, fallback){
    const base = Number.isFinite(Number(fallback)) ? Number(fallback) : DEFAULTS.thickness;
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric < 0){ return Math.max(0, base); }
    return Math.max(0, numeric);
  }

  function sanitizeTransparency(value, fallback){
    const base = Number.isFinite(Number(fallback)) ? Number(fallback) : DEFAULTS.transparency;
    return clamp(value == null ? base : value, 0, 100);
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
    if(!styleChipEl || !styleChipPreviewEl || !styleChipValueEl || !thicknessInput || !colorInput){
      return;
    }
    const color = sanitizeColor(colorInput.value, DEFAULTS.color);
    const thicknessValue = sanitizeThickness(thicknessInput.value, DEFAULTS.thickness);
    styleChipPreviewEl.style.background = color;
    styleChipValueEl.textContent = formatThicknessChipValue(thicknessValue);
    styleChipEl.dataset.noBorder = thicknessValue <= 0 ? '1' : '0';
  }

  function clearStylePickerSection(overlayEl){
    if(!overlayEl || !overlayEl.querySelectorAll){
      return;
    }
    overlayEl.querySelectorAll('.shared-color-picker__section--grid-style').forEach(node => node.remove());
  }

  function attachStylePickerThicknessSection(overlayEl){
    if(!overlayEl){
      return () => {};
    }
    clearStylePickerSection(overlayEl);
    const controls = resolveControls(activeConfig || {});
    const section = overlayEl.ownerDocument.createElement('section');
    section.className = 'shared-color-picker__section shared-color-picker__section--scatter-style shared-color-picker__section--grid-style';
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
    input.value = thicknessInput?.value || '1';
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

  function sanitizeStyle(style, fallback){
    const source = (style && typeof style === 'object') ? style : {};
    const defaults = (fallback && typeof fallback === 'object') ? fallback : {};
    const color = sanitizeColor(source.color, defaults.color || DEFAULTS.color);
    const thickness = sanitizeThickness(source.thickness, defaults.thickness || DEFAULTS.thickness);
    const pattern = sanitizePattern(source.pattern || defaults.pattern || DEFAULTS.pattern);
    const transparency = sanitizeTransparency(source.transparency, defaults.transparency || DEFAULTS.transparency);
    return { color, thickness, pattern, transparency };
  }

  function patternToDasharray(pattern, thickness){
    const normalized = sanitizePattern(pattern);
    const width = Math.max(0.1, Number.isFinite(Number(thickness)) ? Number(thickness) : DEFAULTS.thickness);
    if(normalized === 'dashed'){
      const dash = Math.max(2, Math.round(width * 3));
      const gap = Math.max(2, Math.round(width * 2));
      return `${dash},${gap}`;
    }
    if(normalized === 'dotted'){
      const dash = Math.max(1, Math.round(width));
      const gap = Math.max(2, Math.round(width * 2.2));
      return `${dash},${gap}`;
    }
    return null;
  }

  function transparencyToOpacity(transparency){
    const pct = sanitizeTransparency(transparency, DEFAULTS.transparency);
    return Math.max(0, Math.min(1, 1 - (pct / 100)));
  }

  function buildStrokeAttributes(style, options){
    const opts = options && typeof options === 'object' ? options : {};
    const fallback = {
      color: opts.fallbackColor || DEFAULTS.color,
      thickness: Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : DEFAULTS.thickness,
      pattern: opts.fallbackPattern || DEFAULTS.pattern,
      transparency: Number.isFinite(Number(opts.fallbackTransparency)) ? Number(opts.fallbackTransparency) : DEFAULTS.transparency
    };
    const normalized = sanitizeStyle(style, fallback);
    const attrs = {
      stroke: normalized.color,
      'stroke-width': normalized.thickness
    };
    const dasharray = patternToDasharray(normalized.pattern, normalized.thickness);
    if(dasharray){
      attrs['stroke-dasharray'] = dasharray;
    }
    const opacity = transparencyToOpacity(normalized.transparency);
    if(opacity < 1){
      attrs['stroke-opacity'] = opacity;
    }
    return attrs;
  }

  function resolveToolbarHost(scopeId){
    if(!global.document){ return null; }
    const doc = global.document;
    const key = scopeId || '__global__';
    if(hostCache.has(key)){
      return hostCache.get(key);
    }
    let button = null;
    const preferredAnchorId = scopeId ? `${scopeId}FontHost` : null;
    if(preferredAnchorId){
      button = doc.getElementById(preferredAnchorId) || null;
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
        const candidate = doc.getElementById(fallbackIds[i]);
        if(candidate){ button = candidate; }
      }
    }
    if(!button && scopeId){
      const dataHost = doc.querySelector(`[data-font-toolbar-scope="${key}"]`);
      if(dataHost){
        button = dataHost;
      }
    }
    const existingHost = doc.querySelector(`.font-toolbar-host[data-font-toolbar-scope="${key}"]`);
    if(existingHost){
      hostCache.set(key, existingHost);
      return existingHost;
    }
    if(!button){
      hostCache.set(key, null);
      return null;
    }
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = key;
    host.style.display = 'none';
    button.insertAdjacentElement('afterend', host);
    hostCache.set(key, host);
    return host;
  }

  function clearHostSizing(host){
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

  function updateDockActiveState(host, isActive){
    if(!host || typeof host.closest !== 'function'){ return; }
    const dock = host.closest('.workspace-toolbar__dock');
    if(!dock){ return; }
    dock.classList.toggle('workspace-toolbar__dock--active', !!isActive);
    if(typeof Shared.setToolbarDockActive === 'function'){
      try{
        Shared.setToolbarDockActive(dock, !!isActive);
      }catch(err){
        logDebug('setToolbarDockActive failed', { error: err?.message || String(err) });
      }
    }
  }

  function getContext(){
    return {
      target: activeConfig?.target || null
    };
  }

  function isGridClickTarget(target){
    if(!target || typeof target !== 'object'){
      return false;
    }
    if(target.getAttribute && target.getAttribute('data-grid-control') === '1'){
      return true;
    }
    if(typeof target.closest === 'function'){
      return !!target.closest('[data-grid-control="1"]');
    }
    let node = target.parentNode;
    while(node){
      if(node.getAttribute && node.getAttribute('data-grid-control') === '1'){
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function setNodeCursorPointer(node){
    if(!node){ return; }
    try{ node.setAttribute('cursor', 'pointer'); }catch(err){}
    if(node.style){
      node.style.cursor = 'pointer';
    }
  }

  function removeGridHitLayer(root){
    if(!root || typeof root.querySelectorAll !== 'function'){
      return;
    }
    root.querySelectorAll('[data-grid-hit-layer="1"]').forEach(layer => {
      if(layer && typeof layer.remove === 'function'){
        layer.remove();
      }
    });
  }

  function ensureGridHitLayer(root){
    if(!root || typeof root.querySelectorAll !== 'function'){
      return;
    }
    removeGridHitLayer(root);
    const sourceNodes = Array.from(root.querySelectorAll('[data-grid-control="1"]')).filter(node => {
      if(!node || typeof node.getAttribute !== 'function'){
        return false;
      }
      if(node.getAttribute('data-grid-hit-overlay') === '1'){
        return false;
      }
      if(typeof node.closest === 'function' && node.closest('[data-grid-hit-layer="1"]')){
        return false;
      }
      return true;
    });
    if(!sourceNodes.length){
      return;
    }
    const doc = root.ownerDocument || global.document;
    if(!doc){
      return;
    }
    const layer = doc.createElementNS(SVG_NS, 'g');
    layer.setAttribute('data-grid-hit-layer', '1');
    layer.setAttribute('data-export-ignore', '1');
    let hitCount = 0;
    for(let i = 0; i < sourceNodes.length; i += 1){
      const source = sourceNodes[i];
      if(!source || typeof source.tagName !== 'string'){
        continue;
      }
      const tag = source.tagName.toLowerCase();
      setNodeCursorPointer(source);
      if(tag !== 'line' && tag !== 'path' && tag !== 'polyline'){
        continue;
      }
      const overlay = doc.createElementNS(SVG_NS, tag);
      if(tag === 'line'){
        overlay.setAttribute('x1', source.getAttribute('x1') || '0');
        overlay.setAttribute('y1', source.getAttribute('y1') || '0');
        overlay.setAttribute('x2', source.getAttribute('x2') || '0');
        overlay.setAttribute('y2', source.getAttribute('y2') || '0');
      }else if(tag === 'path'){
        const d = source.getAttribute('d');
        if(!d){ continue; }
        overlay.setAttribute('d', d);
      }else if(tag === 'polyline'){
        const points = source.getAttribute('points');
        if(!points){ continue; }
        overlay.setAttribute('points', points);
      }
      const sourceWidthRaw = Number(source.getAttribute('stroke-width'));
      const sourceWidth = Number.isFinite(sourceWidthRaw) && sourceWidthRaw > 0 ? sourceWidthRaw : 1;
      const hitWidth = Math.max(12, sourceWidth + 8);
      overlay.setAttribute('fill', 'none');
      overlay.setAttribute('stroke', 'transparent');
      overlay.setAttribute('stroke-width', String(hitWidth));
      overlay.setAttribute('pointer-events', 'stroke');
      overlay.setAttribute('vector-effect', 'non-scaling-stroke');
      overlay.setAttribute('data-grid-control', '1');
      overlay.setAttribute('data-grid-hit-overlay', '1');
      overlay.setAttribute('data-export-ignore', '1');
      setNodeCursorPointer(overlay);
      layer.appendChild(overlay);
      hitCount += 1;
    }
    if(hitCount > 0){
      root.appendChild(layer);
      logDebug('grid hit layer created', { count: hitCount });
    }
  }

  function resolveControls(config){
    const controls = (config && typeof config.controls === 'object') ? config.controls : {};
    return {
      panelTitle: controls.panelTitle || config?.panelTitle || 'Grid',
      showVisibility: false,
      showThickness: controls.showThickness !== false,
      showColor: controls.showColor !== false,
      showPattern: controls.showPattern !== false,
      showTransparency: controls.showTransparency !== false,
      visibilityLabel: '',
      thicknessLabel: controls.thicknessLabel || 'Line width',
      colorLabel: controls.colorLabel || 'Line',
      patternLabel: controls.patternLabel || 'Pattern',
      transparencyLabel: controls.transparencyLabel || 'Transparency',
      thicknessMin: Number.isFinite(Number(controls.thicknessMin)) ? Number(controls.thicknessMin) : 0,
      thicknessMax: Number.isFinite(Number(controls.thicknessMax)) ? Number(controls.thicknessMax) : 10,
      thicknessStep: Number.isFinite(Number(controls.thicknessStep)) && Number(controls.thicknessStep) > 0 ? Number(controls.thicknessStep) : 0.25
    };
  }

  function syncPanelFromConfig(config){
    if(!panelEl || !config){ return; }
    const controls = resolveControls(config);
    const context = getContext();
    const styleRaw = typeof config.getStyle === 'function' ? config.getStyle(context) : null;
    const fallbackStyle = (config.defaults && typeof config.defaults === 'object') ? config.defaults : null;
    const style = sanitizeStyle(styleRaw, fallbackStyle);

    if(panelTitleEl){ panelTitleEl.textContent = controls.panelTitle; }
    if(thicknessLabelEl){ thicknessLabelEl.textContent = controls.thicknessLabel; }
    if(colorLabelEl){ colorLabelEl.textContent = controls.colorLabel; }
    if(styleLabelEl){ styleLabelEl.textContent = controls.colorLabel; }
    if(patternLabelEl){ patternLabelEl.textContent = controls.patternLabel; }
    if(transparencyLabelEl){ transparencyLabelEl.textContent = controls.transparencyLabel; }

    if(thicknessField){ thicknessField.hidden = true; }
    if(colorField){ colorField.hidden = true; }
    if(styleField){ styleField.hidden = !(controls.showColor || controls.showThickness); }
    if(patternField){ patternField.hidden = !controls.showPattern; }
    if(transparencyField){ transparencyField.hidden = !controls.showTransparency; }

    applyingSync = true;
    try{
      if(thicknessInput){
        thicknessInput.min = String(controls.thicknessMin);
        thicknessInput.max = String(controls.thicknessMax);
        thicknessInput.step = String(controls.thicknessStep);
        thicknessInput.value = String(Math.max(controls.thicknessMin, style.thickness));
      }
      if(colorInput){
        colorInput.value = style.color;
      }
      if(patternSelect){
        patternSelect.value = style.pattern;
      }
      if(transparencyInput){
        transparencyInput.value = String(Math.round(style.transparency));
      }
      if(transparencyValueEl){
        transparencyValueEl.textContent = `${Math.round(style.transparency)}%`;
      }
      syncStyleChipUi();
    }finally{
      applyingSync = false;
    }
  }

  function ensureDocumentListener(){
    if(hasDocListener || !global.document){ return; }
    global.document.addEventListener('click', evt => {
      if(!panelEl || panelEl.dataset.open !== '1'){ return; }
      const target = evt.target;
      if(panelEl.contains(target)){ return; }
      if(activeConfig?.keepOpenWithinHost && activeHost && typeof activeHost.contains === 'function' && activeHost.contains(target)){ return; }
      if(isGridClickTarget(target)){ return; }
      if(target?.closest && (target.closest('.shared-color-picker') || target.closest('[data-font-controls-overlay="1"]'))){ return; }
      closePanel('outside');
    });
    hasDocListener = true;
  }

  function ensurePanel(){
    if(panelEl || !global.document){ return panelEl; }
    const doc = global.document;
    panelEl = doc.createElement('div');
    panelEl.className = 'grid-controls-panel';
    panelEl.setAttribute('role', 'toolbar');
    panelEl.setAttribute('aria-label', 'Grid controls');
    panelEl.style.display = 'none';
    panelEl.hidden = true;
    panelEl.dataset.open = '0';

    panelTitleEl = doc.createElement('div');
    panelTitleEl.className = 'grid-controls-panel__title';
    panelTitleEl.textContent = 'Grid';
    panelEl.appendChild(panelTitleEl);

    fieldsRowEl = doc.createElement('div');
    fieldsRowEl.className = 'grid-controls-panel__row';
    panelEl.appendChild(fieldsRowEl);

    thicknessField = doc.createElement('div');
    thicknessField.className = 'grid-controls-panel__field grid-controls-panel__field--numeric';
    thicknessLabelEl = doc.createElement('div');
    thicknessLabelEl.className = 'grid-controls-panel__field-label';
    thicknessLabelEl.textContent = 'Line width';
    thicknessField.appendChild(thicknessLabelEl);
    thicknessInput = doc.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.className = 'grid-controls-panel__input grid-controls-panel__input--small';
    thicknessInput.min = '0';
    thicknessInput.max = '10';
    thicknessInput.step = '0.25';
    thicknessField.appendChild(thicknessInput);
    fieldsRowEl.appendChild(thicknessField);

    styleField = doc.createElement('div');
    styleField.className = 'grid-controls-panel__field grid-controls-panel__field--style';
    styleLabelEl = doc.createElement('div');
    styleLabelEl.className = 'grid-controls-panel__field-label';
    styleLabelEl.textContent = 'Line';
    styleControlEl = doc.createElement('div');
    styleControlEl.className = 'shared-border-style-control';
    styleChipEl = doc.createElement('button');
    styleChipEl.type = 'button';
    styleChipEl.className = 'shared-border-style-chip';
    styleChipEl.title = 'Click to edit grid line color. Wheel or Alt+drag to adjust line width.';
    styleChipPreviewEl = doc.createElement('span');
    styleChipPreviewEl.className = 'shared-border-style-chip-preview';
    styleChipValueEl = doc.createElement('span');
    styleChipValueEl.className = 'shared-border-style-chip-value';
    styleChipEl.appendChild(styleChipPreviewEl);
    styleChipEl.appendChild(styleChipValueEl);
    colorLabelEl = doc.createElement('div');
    colorLabelEl.className = 'grid-controls-panel__field-label';
    colorLabelEl.textContent = 'Line';
    colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'shared-border-style-input grid-controls-panel__color-input';
    colorInput.value = DEFAULTS.color;
    styleControlEl.appendChild(styleChipEl);
    styleControlEl.appendChild(colorInput);
    styleField.appendChild(styleLabelEl);
    styleField.appendChild(styleControlEl);
    fieldsRowEl.appendChild(styleField);

    colorField = styleField;

    patternField = doc.createElement('div');
    patternField.className = 'grid-controls-panel__field grid-controls-panel__field--pattern';
    patternLabelEl = doc.createElement('div');
    patternLabelEl.className = 'grid-controls-panel__field-label';
    patternLabelEl.textContent = 'Pattern';
    patternField.appendChild(patternLabelEl);
    patternSelect = doc.createElement('select');
    patternSelect.className = 'grid-controls-panel__input grid-controls-panel__input--select';
    [
      { value: 'solid', label: 'Solid' },
      { value: 'dashed', label: 'Dashed' },
      { value: 'dotted', label: 'Dotted' }
    ].forEach(optCfg => {
      const opt = doc.createElement('option');
      opt.value = optCfg.value;
      opt.textContent = optCfg.label;
      patternSelect.appendChild(opt);
    });
    patternField.appendChild(patternSelect);
    fieldsRowEl.appendChild(patternField);

    transparencyField = doc.createElement('div');
    transparencyField.className = 'grid-controls-panel__field grid-controls-panel__field--transparency';
    transparencyLabelEl = doc.createElement('div');
    transparencyLabelEl.className = 'grid-controls-panel__field-label';
    transparencyLabelEl.textContent = 'Transparency';
    transparencyField.appendChild(transparencyLabelEl);
    const transparencyWrap = doc.createElement('div');
    transparencyWrap.className = 'grid-controls-panel__range';
    transparencyInput = doc.createElement('input');
    transparencyInput.type = 'range';
    transparencyInput.className = 'grid-controls-panel__transparency-input';
    transparencyInput.min = '0';
    transparencyInput.max = '100';
    transparencyInput.step = '1';
    transparencyInput.value = String(DEFAULTS.transparency);
    transparencyWrap.appendChild(transparencyInput);
    transparencyValueEl = doc.createElement('span');
    transparencyValueEl.className = 'grid-controls-panel__range-value';
    transparencyValueEl.textContent = '0%';
    transparencyWrap.appendChild(transparencyValueEl);
    transparencyField.appendChild(transparencyWrap);
    fieldsRowEl.appendChild(transparencyField);

    thicknessInput.addEventListener('input', () => {
      if(applyingSync){ return; }
      if(!activeConfig || typeof activeConfig.onStyleChange !== 'function'){ return; }
      const context = getContext();
      const style = sanitizeStyle(typeof activeConfig.getStyle === 'function' ? activeConfig.getStyle(context) : null, activeConfig.defaults);
      style.thickness = sanitizeThickness(thicknessInput.value, style.thickness);
      try{
        activeConfig.onStyleChange(style, context);
      }catch(err){
        logDebug('onStyleChange(thickness) failed', { error: err?.message || String(err) });
      }
      syncPanelFromConfig(activeConfig);
    });

    if(styleChipEl){
      styleChipEl.addEventListener('wheel', evt => {
        evt.preventDefault();
        const step = evt.deltaY < 0 ? 0.5 : -0.5;
        const current = sanitizeThickness(thicknessInput?.value, DEFAULTS.thickness);
        const next = Math.max(0, current + step);
        if(thicknessInput){
          thicknessInput.value = String(next);
          thicknessInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, { passive: false });
      const onStyleDragMove = evt => {
        if(!styleDragState || !thicknessInput){ return; }
        const deltaX = evt.clientX - styleDragState.startX;
        const steps = Math.round(deltaX / 8);
        const next = Math.max(0, styleDragState.startValue + (steps * 0.5));
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
        const current = sanitizeThickness(thicknessInput?.value, DEFAULTS.thickness);
        styleDragState = { startX: evt.clientX, startValue: current };
        global.addEventListener('mousemove', onStyleDragMove);
        global.addEventListener('mouseup', onStyleDragUp);
      });
      styleChipEl.addEventListener('click', evt => {
        if(!suppressStyleChipClick){ return; }
        suppressStyleChipClick = false;
        evt.preventDefault();
        evt.stopPropagation();
      }, true);
    }

    colorInput.addEventListener('input', () => {
      if(applyingSync){ return; }
      if(!activeConfig || typeof activeConfig.onStyleChange !== 'function'){ return; }
      const context = getContext();
      const style = sanitizeStyle(typeof activeConfig.getStyle === 'function' ? activeConfig.getStyle(context) : null, activeConfig.defaults);
      style.color = sanitizeColor(colorInput.value, style.color);
      try{
        activeConfig.onStyleChange(style, context);
      }catch(err){
        logDebug('onStyleChange(color) failed', { error: err?.message || String(err) });
      }
      syncPanelFromConfig(activeConfig);
    });

    colorInput.addEventListener('change', () => {
      if(applyingSync){ return; }
      if(!activeConfig || typeof activeConfig.onStyleChange !== 'function'){ return; }
      const context = getContext();
      const style = sanitizeStyle(typeof activeConfig.getStyle === 'function' ? activeConfig.getStyle(context) : null, activeConfig.defaults);
      style.color = sanitizeColor(colorInput.value, style.color);
      try{
        activeConfig.onStyleChange(style, context);
      }catch(err){
        logDebug('onStyleChange(color-change) failed', { error: err?.message || String(err) });
      }
      syncPanelFromConfig(activeConfig);
    });

    patternSelect.addEventListener('change', () => {
      if(applyingSync){ return; }
      if(!activeConfig || typeof activeConfig.onStyleChange !== 'function'){ return; }
      const context = getContext();
      const style = sanitizeStyle(typeof activeConfig.getStyle === 'function' ? activeConfig.getStyle(context) : null, activeConfig.defaults);
      style.pattern = sanitizePattern(patternSelect.value);
      try{
        activeConfig.onStyleChange(style, context);
      }catch(err){
        logDebug('onStyleChange(pattern) failed', { error: err?.message || String(err) });
      }
      syncPanelFromConfig(activeConfig);
    });

    transparencyInput.addEventListener('input', () => {
      if(applyingSync){ return; }
      if(!activeConfig || typeof activeConfig.onStyleChange !== 'function'){ return; }
      const context = getContext();
      const style = sanitizeStyle(typeof activeConfig.getStyle === 'function' ? activeConfig.getStyle(context) : null, activeConfig.defaults);
      style.transparency = sanitizeTransparency(transparencyInput.value, style.transparency);
      try{
        activeConfig.onStyleChange(style, context);
      }catch(err){
        logDebug('onStyleChange(transparency) failed', { error: err?.message || String(err) });
      }
      syncPanelFromConfig(activeConfig);
    });

    if(!colorPickerAttached){
      if(typeof Shared.openColorPicker === 'function'){
        styleChipEl.addEventListener('click', evt => {
          evt.preventDefault();
          evt.stopPropagation();
          const current = sanitizeColor(colorInput.value, DEFAULTS.color);
          const overlayEl = Shared.openColorPicker({
            anchor: styleChipEl,
            color: current,
            element: colorInput,
            onInput(value){
              colorInput.value = sanitizeColor(value, current);
              colorInput.dispatchEvent(new Event('input', { bubbles: true }));
            },
            onChange(value){
              colorInput.value = sanitizeColor(value, current);
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
        colorPickerAttached = true;
      }else if(typeof Shared.attachColorPickerNear === 'function'){
        Shared.attachColorPickerNear(colorInput);
        styleChipEl.addEventListener('click', evt => {
          evt.preventDefault();
          colorInput.click();
        });
        colorPickerAttached = true;
      }
    }

    ensureDocumentListener();
    return panelEl;
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
      activeHost.classList.remove('font-toolbar-host--grid');
      activeHost.classList.remove('font-toolbar-host--grid-dual');
      if(typeof activeConfig?.hostClass === 'string' && activeConfig.hostClass){
        activeHost.classList.remove(activeConfig.hostClass);
      }
      const fontPanel = activeHost.querySelector('.font-controls-panel');
      const axisPanel = activeHost.querySelector('.axis-controls-panel');
      const additionalLinePanel = activeHost.querySelector('.additional-line-controls-panel');
      const significancePanel = activeHost.querySelector('.significance-controls-panel');
      const dendrogramPanel = activeHost.querySelector('.dendrogram-controls-panel');
      const hasEmbeddedForm = !!activeHost.querySelector('.workspace-toolbar__form, .box-point-controls, [data-point-controls="1"]');
      const additionalLineOpen = !!(additionalLinePanel && additionalLinePanel !== panelEl && additionalLinePanel.dataset.open === '1');
      if((!fontPanel || fontPanel.dataset.open !== '1')
        && (!axisPanel || axisPanel.dataset.open !== '1')
        && (!significancePanel || significancePanel.dataset.open !== '1')
        && (!dendrogramPanel || dendrogramPanel.dataset.open !== '1')
        && !additionalLineOpen
        && !hasEmbeddedForm
        && !activeConfig?.keepHostVisible){
        activeHost.classList.remove('font-toolbar-host--visible');
        activeHost.style.display = 'none';
        updateDockActiveState(activeHost, false);
      }
    }
    activeConfig = null;
    activeHost = null;
    logDebug('panel closed', { reason });
  }

  function openPanel(config){
    ensurePanel();
    if(!panelEl || !config){ return; }
    if(config.skipHideAll !== true){
      try{
        if(Shared && typeof Shared.hideAllFormatControls === 'function'){
          Shared.hideAllFormatControls();
        }
      }catch(err){
        logDebug('hideAllFormatControls failed', { error: err?.message || String(err) });
      }
    }
    activeConfig = config;
    const host = config.host || resolveToolbarHost(config.scopeId);
    if(host){
      if(config.clearHost === true || (config.appendToHost !== true && config.clearHost !== false)){
        try{
          host.querySelectorAll('.workspace-toolbar__form, .box-point-controls, [data-point-controls="1"]').forEach(node => node.remove());
        }catch(err){}
      }
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      clearHostSizing(host);
      host.style.display = typeof config.hostDisplay === 'string' && config.hostDisplay.trim()
        ? config.hostDisplay.trim()
        : 'grid';
      host.classList.add('font-toolbar-host--visible');
      host.classList.add('font-toolbar-host--grid');
      host.classList.add('font-toolbar-host--grid-dual');
      if(typeof config.hostClass === 'string' && config.hostClass){
        host.classList.add(config.hostClass);
      }
      updateDockActiveState(host, true);
      activeHost = host;
    }else{
      activeHost = null;
      logDebug('host unavailable for open', { scopeId: config.scopeId });
    }
    syncPanelFromConfig(config);
    panelEl.style.display = 'flex';
    panelEl.hidden = false;
    panelEl.dataset.open = '1';
    logDebug('panel opened', { scopeId: config.scopeId });
  }

  function registerGraphElement(element, config){
    if(!element || !config){ return; }
    try{
      ensureGridHitLayer(element);
    }catch(err){
      logDebug('ensureGridHitLayer failed', { error: err?.message || String(err) });
    }
    const mergedConfig = Object.assign({
      appendToHost: true,
      clearHost: false,
      skipHideAll: true,
      keepOpenWithinHost: true
    }, config);
    element.__gridControlConfig = mergedConfig;
    const previousHandler = element.__gridControlHandler;
    if(previousHandler){
      try{
        element.removeEventListener('click', previousHandler, true);
      }catch(err){}
    }
    const handler = evt => {
      const liveConfig = element.__gridControlConfig || mergedConfig;
      let allowed = isGridClickTarget(evt && evt.target ? evt.target : null);
      if(typeof liveConfig.shouldOpen === 'function'){
        try{
          allowed = !!liveConfig.shouldOpen(evt);
        }catch(err){
          allowed = true;
        }
      }
      if(!allowed){ return; }
      const openCfg = Object.assign({}, liveConfig, { target: evt && evt.target ? evt.target : element });
      const enqueue = typeof global.requestAnimationFrame === 'function'
        ? global.requestAnimationFrame.bind(global)
        : (fn => global.setTimeout(fn, 0));
      enqueue(() => {
        try{
          openPanel(openCfg);
        }catch(err){
          console.error('gridControls registerGraphElement open failed', err);
        }
      });
    };
    element.addEventListener('click', handler, true);
    element.__gridControlHandler = handler;
  }

  gridControls.ensurePanel = ensurePanel;
  gridControls.close = closePanel;
  gridControls.show = openPanel;
  gridControls.refresh = () => syncPanelFromConfig(activeConfig);
  gridControls.registerGraphElement = registerGraphElement;
  gridControls.sanitizeStyle = sanitizeStyle;
  gridControls.patternToDasharray = patternToDasharray;
  gridControls.transparencyToOpacity = transparencyToOpacity;
  gridControls.getStrokeAttributes = buildStrokeAttributes;
})(typeof window !== 'undefined' ? window : globalThis);
