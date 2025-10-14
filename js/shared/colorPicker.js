// Shared color picker overlay with palette, recent colors, and custom picker support.
// Exposes Shared.initColorPickerOverlay(), Shared.attachColorPickerNear(el), and Shared.openColorPicker(options)
(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const documentRef = global.document;

  const STANDARD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
  const MORE_TOGGLE_LABELS = { show: 'Show more', hide: 'Hide' };
  const RECENT_LIMIT = 12;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let moreSectionIdCounter = 0;

  function hslToHex(h, s, l){
    const hue = ((h % 360) + 360) % 360;
    const saturation = Math.min(Math.max(s, 0), 1);
    const lightness = Math.min(Math.max(l, 0), 1);
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const scaledHue = hue / 60;
    const secondComponent = chroma * (1 - Math.abs((scaledHue % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if(scaledHue >= 0 && scaledHue < 1){
      r = chroma;
      g = secondComponent;
    }else if(scaledHue >= 1 && scaledHue < 2){
      r = secondComponent;
      g = chroma;
    }else if(scaledHue >= 2 && scaledHue < 3){
      g = chroma;
      b = secondComponent;
    }else if(scaledHue >= 3 && scaledHue < 4){
      g = secondComponent;
      b = chroma;
    }else if(scaledHue >= 4 && scaledHue < 5){
      r = secondComponent;
      b = chroma;
    }else{
      r = chroma;
      b = secondComponent;
    }
    const match = lightness - (chroma / 2);
    const toHex = (value)=>{
      const channel = Math.round((value + match) * 255);
      const clamped = Math.min(Math.max(channel, 0), 255);
      return clamped.toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  function buildMoreFillPalette(){
    const rows = [];
    const columnCount = 12;
    const hueStep = 360 / columnCount;
    for(let lightIndex = 0; lightIndex < 6; lightIndex += 1){
      const lightness = 0.78 - (lightIndex * 0.09);
      const saturation = 0.82 - (lightIndex * 0.05);
      const row = [];
      for(let columnIndex = 0; columnIndex < columnCount; columnIndex += 1){
        const hue = columnIndex * hueStep;
        row.push(hslToHex(hue, Math.max(saturation, 0.35), Math.max(lightness, 0.18)));
      }
      rows.push(row);
    }
    const grayscaleRow = [];
    for(let columnIndex = 0; columnIndex < columnCount; columnIndex += 1){
      const ratio = columnIndex / (columnCount - 1 || 1);
      const value = Math.round((1 - ratio) * 255);
      const component = value.toString(16).padStart(2, '0').toUpperCase();
      grayscaleRow.push(`#${component}${component}${component}`);
    }
    rows.push(grayscaleRow);
    return rows;
  }

  const MORE_FILL_ROWS = buildMoreFillPalette();

  let overlay = null;
  const swatchRegistry = new Map();
  const dynamicRecentSwatches = [];
  const overlayState = {
    recentColors: [],
    activeColor: '#000000',
    anchor: null,
    recentSection: null,
    recentRow: null,
    customInput: null,
    hexInput: null,
    lastSelectedSwatch: null,
    moreToggle: null,
    moreMatrix: null
  };

  function isDebugEnabled(){
    return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
  }

  function logDebug(label, payload){
    if(isDebugEnabled()){
      console.debug(`Debug: colorPicker ${label}`, payload || {});
    }
  }

  function normalizeHex(value){
    if(typeof value !== 'string'){
      return null;
    }
    let hex = value.trim();
    if(!hex){
      return null;
    }
    if(hex[0] !== '#'){
      hex = `#${hex}`;
    }
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
    if(!match){
      return null;
    }
    let digits = match[1];
    if(digits.length === 3){
      digits = digits.split('').map(ch => ch + ch).join('');
    }
    return `#${digits.toUpperCase()}`;
  }

  function colorKey(value){
    const normalized = normalizeHex(value);
    return normalized ? normalized.toLowerCase() : null;
  }

  function registerSwatch(color, element, { isDynamic = false } = {}){
    const key = colorKey(color);
    if(!key){
      return;
    }
    let bucket = swatchRegistry.get(key);
    if(!bucket){
      bucket = new Set();
      swatchRegistry.set(key, bucket);
    }
    bucket.add(element);
    if(isDynamic){
      dynamicRecentSwatches.push({ key, element });
    }
  }

  function clearDynamicSwatches(){
    if(!dynamicRecentSwatches.length){
      return;
    }
    for(let i = 0; i < dynamicRecentSwatches.length; i += 1){
      const entry = dynamicRecentSwatches[i];
      const bucket = swatchRegistry.get(entry.key);
      if(bucket){
        bucket.delete(entry.element);
        if(bucket.size === 0){
          swatchRegistry.delete(entry.key);
        }
      }
    }
    dynamicRecentSwatches.length = 0;
  }

  function findSwatch(color){
    const key = colorKey(color);
    if(!key){
      return null;
    }
    const bucket = swatchRegistry.get(key);
    if(!bucket || bucket.size === 0){
      return null;
    }
    const iterator = bucket.values();
    const first = iterator.next();
    return first && !first.done ? first.value : null;
  }

  function setActiveColor(value, { skipCustomUpdate = false } = {}){
    const normalized = normalizeHex(value) || '#000000';
    overlayState.activeColor = normalized;
    if(overlayState.lastSelectedSwatch && overlayState.lastSelectedSwatch.isConnected){
      overlayState.lastSelectedSwatch.classList.remove('shared-color-picker__swatch--selected');
    }
    const swatch = findSwatch(normalized);
    if(swatch){
      swatch.classList.add('shared-color-picker__swatch--selected');
      overlayState.lastSelectedSwatch = swatch;
    }else{
      overlayState.lastSelectedSwatch = null;
    }
    if(!skipCustomUpdate){
      updateCustomInputs(normalized);
    }
    return normalized;
  }

  function updateCustomInputs(value){
    const normalized = normalizeHex(value);
    if(!normalized){
      return;
    }
    if(overlayState.customInput && overlayState.customInput.value !== normalized){
      overlayState.customInput.value = normalized;
    }
    if(overlayState.hexInput && overlayState.hexInput.value.toUpperCase() !== normalized){
      overlayState.hexInput.value = normalized;
    }
  }

  function dispatchInput(value, meta){
    const target = overlay?.targetEl;
    if(!target){
      return;
    }
    if(typeof target.onOverlayInput === 'function'){
      target.onOverlayInput(value, meta || {});
    } else if(target instanceof HTMLElement){
      target.value = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function dispatchChange(value, meta){
    const target = overlay?.targetEl;
    if(!target){
      return;
    }
    if(typeof target.onOverlayChange === 'function'){
      target.onOverlayChange(value, meta || {});
    } else if(target instanceof HTMLElement){
      target.value = value;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function addRecentColor(value){
    const normalized = normalizeHex(value);
    if(!normalized){
      return;
    }
    const list = overlayState.recentColors;
    const existingIndex = list.indexOf(normalized);
    if(existingIndex !== -1){
      list.splice(existingIndex, 1);
    }
    list.unshift(normalized);
    if(list.length > RECENT_LIMIT){
      list.length = RECENT_LIMIT;
    }
    renderRecentColors();
  }

  function renderRecentColors(){
    if(!overlayState.recentRow || !overlayState.recentSection){
      return;
    }
    clearDynamicSwatches();
    const list = overlayState.recentColors;
    overlayState.recentRow.textContent = '';
    if(!list.length){
      overlayState.recentSection.classList.add('shared-color-picker__section--empty');
      return;
    }
    overlayState.recentSection.classList.remove('shared-color-picker__section--empty');
    overlayState.recentRow.style.setProperty('--columns', String(Math.min(list.length, 10) || 1));
    for(let i = 0; i < list.length; i += 1){
      const color = list[i];
      const swatch = createSwatch(color, { ariaPrefix: 'Recent color' });
      overlayState.recentRow.appendChild(swatch);
      registerSwatch(color, swatch, { isDynamic: true });
    }
  }

  function createSwatch(color, { ariaPrefix = 'Select color' } = {}){
    const normalized = normalizeHex(color) || '#000000';
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'shared-color-picker__swatch';
    button.dataset.color = normalized;
    button.style.setProperty('--swatch-color', normalized);
    button.setAttribute('aria-label', `${ariaPrefix} ${normalized}`);
    return button;
  }

  function createPaletteRowSection(label, colors){
    const section = documentRef.createElement('section');
    section.className = 'shared-color-picker__section shared-color-picker__section--row';
    if(label){
      const title = documentRef.createElement('div');
      title.className = 'shared-color-picker__section-title';
      title.textContent = label;
      section.appendChild(title);
    }
    const rowEl = documentRef.createElement('div');
    rowEl.className = 'shared-color-picker__swatch-row';
    rowEl.style.setProperty('--columns', String(colors.length || 1));
    for(let i = 0; i < colors.length; i += 1){
      const color = colors[i];
      const swatch = createSwatch(color, { ariaPrefix: `${label} color` });
      rowEl.appendChild(swatch);
      registerSwatch(color, swatch);
    }
    section.appendChild(rowEl);
    return section;
  }

  function createMoreFillSection(){
    const section = documentRef.createElement('section');
    section.className = 'shared-color-picker__section shared-color-picker__section--more';

    const header = documentRef.createElement('div');
    header.className = 'shared-color-picker__more-header';
    section.appendChild(header);

    const title = documentRef.createElement('div');
    title.className = 'shared-color-picker__section-title';
    title.textContent = 'More Fill Colors';
    header.appendChild(title);

    const toggle = documentRef.createElement('button');
    toggle.type = 'button';
    toggle.className = 'shared-color-picker__more-toggle';
    toggle.textContent = MORE_TOGGLE_LABELS.show;
    toggle.setAttribute('aria-expanded', 'false');
    const matrixId = `shared-color-picker-more-${++moreSectionIdCounter}`;
    toggle.setAttribute('aria-controls', matrixId);
    header.appendChild(toggle);

    const matrix = documentRef.createElement('div');
    matrix.className = 'shared-color-picker__matrix shared-color-picker__matrix--extended';
    matrix.id = matrixId;
    matrix.hidden = true;
    section.appendChild(matrix);

    for(let rowIndex = 0; rowIndex < MORE_FILL_ROWS.length; rowIndex += 1){
      const paletteRow = MORE_FILL_ROWS[rowIndex];
      const rowEl = documentRef.createElement('div');
      rowEl.className = 'shared-color-picker__swatch-row';
      rowEl.style.setProperty('--columns', String(paletteRow.length || 1));
      for(let columnIndex = 0; columnIndex < paletteRow.length; columnIndex += 1){
        const color = paletteRow[columnIndex];
        const swatch = createSwatch(color, { ariaPrefix: 'Extended color' });
        rowEl.appendChild(swatch);
        registerSwatch(color, swatch);
      }
      matrix.appendChild(rowEl);
    }

    return { section, toggle, matrix };
  }

  function createRecentSection(){
    const section = documentRef.createElement('section');
    section.className = 'shared-color-picker__section shared-color-picker__section--recent shared-color-picker__section--empty';
    const title = documentRef.createElement('div');
    title.className = 'shared-color-picker__section-title';
    title.textContent = 'Recent Colors';
    section.appendChild(title);
    const rowEl = documentRef.createElement('div');
    rowEl.className = 'shared-color-picker__swatch-row';
    rowEl.style.setProperty('--columns', '1');
    section.appendChild(rowEl);
    return { section, row: rowEl };
  }

  function createCustomSection(){
    const section = documentRef.createElement('section');
    section.className = 'shared-color-picker__section shared-color-picker__section--custom';
    const title = documentRef.createElement('div');
    title.className = 'shared-color-picker__section-title';
    title.textContent = 'Custom Color';
    section.appendChild(title);

    const row = documentRef.createElement('div');
    row.className = 'shared-color-picker__custom-row';

    const colorInput = documentRef.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'shared-color-picker__color-input';
    colorInput.value = overlayState.activeColor;
    colorInput.setAttribute('aria-label', 'Choose a custom color');
    row.appendChild(colorInput);

    const hexInput = documentRef.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'shared-color-picker__hex-input';
    hexInput.placeholder = '#RRGGBB';
    hexInput.value = overlayState.activeColor;
    hexInput.setAttribute('aria-label', 'Enter a hex color');
    hexInput.maxLength = 7;
    row.appendChild(hexInput);

    let eyedropperButton = null;
    if(typeof global.EyeDropper === 'function'){
      eyedropperButton = documentRef.createElement('button');
      eyedropperButton.type = 'button';
      eyedropperButton.className = 'shared-color-picker__eyedropper';
      eyedropperButton.setAttribute('aria-label', 'Pick a color from the screen');
      eyedropperButton.title = 'Pick screen color';
      const icon = documentRef.createElementNS(SVG_NS, 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('class', 'shared-color-picker__eyedropper-icon');
      icon.setAttribute('aria-hidden', 'true');
      const path = documentRef.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M20.03 4.22a1.5 1.5 0 0 0-2.12 0l-1.77 1.77-1.13-1.13 1.77-1.77a1.5 1.5 0 0 0-1.06-2.56 1.5 1.5 0 0 0-1.06.44l-3.96 3.96a2.5 2.5 0 0 0-.66 1.08l-.38 1.18-5.85 5.85a2.1 2.1 0 0 0 0 2.97l.88.88a2.1 2.1 0 0 0 2.97 0l5.85-5.85 1.18-.38a2.5 2.5 0 0 0 1.08-.66l3.96-3.96a1.5 1.5 0 0 0 0-2.12zM8.49 17.66a1.1 1.1 0 0 1-1.56 0l-.88-.88a1.1 1.1 0 0 1 0-1.56l5.56-5.56 2.44 2.44-5.56 5.56zm6.21-7.33-2.03-2.03.27-.84 2.6-2.6 2.87 2.87-2.6 2.6-.84.27z');
      icon.appendChild(path);
      const srLabel = documentRef.createElement('span');
      srLabel.className = 'shared-color-picker__sr-only';
      srLabel.textContent = 'Pick screen color';
      eyedropperButton.appendChild(icon);
      eyedropperButton.appendChild(srLabel);
      row.appendChild(eyedropperButton);
    }else{
      const disabledButton = documentRef.createElement('button');
      disabledButton.type = 'button';
      disabledButton.className = 'shared-color-picker__eyedropper shared-color-picker__eyedropper--disabled';
      disabledButton.setAttribute('aria-label', 'Eyedropper unavailable');
      disabledButton.title = 'Eyedropper unavailable';
      const icon = documentRef.createElementNS(SVG_NS, 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('class', 'shared-color-picker__eyedropper-icon');
      icon.setAttribute('aria-hidden', 'true');
      const path = documentRef.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M20.03 4.22a1.5 1.5 0 0 0-2.12 0l-1.77 1.77-1.13-1.13 1.77-1.77a1.5 1.5 0 0 0-1.06-2.56 1.5 1.5 0 0 0-1.06.44l-3.96 3.96a2.5 2.5 0 0 0-.66 1.08l-.38 1.18-5.85 5.85a2.1 2.1 0 0 0 0 2.97l.88.88a2.1 2.1 0 0 0 2.97 0l5.85-5.85 1.18-.38a2.5 2.5 0 0 0 1.08-.66l3.96-3.96a1.5 1.5 0 0 0 0-2.12zM8.49 17.66a1.1 1.1 0 0 1-1.56 0l-.88-.88a1.1 1.1 0 0 1 0-1.56l5.56-5.56 2.44 2.44-5.56 5.56zm6.21-7.33-2.03-2.03.27-.84 2.6-2.6 2.87 2.87-2.6 2.6-.84.27z');
      icon.appendChild(path);
      const srLabel = documentRef.createElement('span');
      srLabel.className = 'shared-color-picker__sr-only';
      srLabel.textContent = 'Eyedropper unavailable';
      disabledButton.appendChild(icon);
      disabledButton.appendChild(srLabel);
      disabledButton.disabled = true;
      row.appendChild(disabledButton);
    }

    section.appendChild(row);
    return { section, colorInput, hexInput, eyedropperButton };
  }

  function handleMoreToggle(evt){
    evt.preventDefault();
    toggleMoreFill();
  }

  function toggleMoreFill(expand){
    const toggle = overlayState.moreToggle;
    const matrix = overlayState.moreMatrix;
    if(!toggle || !matrix){
      return;
    }
    const currentExpanded = toggle.getAttribute('aria-expanded') === 'true';
    const nextExpanded = typeof expand === 'boolean' ? expand : !currentExpanded;
    toggle.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
    toggle.classList.toggle('shared-color-picker__more-toggle--expanded', nextExpanded);
    toggle.textContent = nextExpanded ? MORE_TOGGLE_LABELS.hide : MORE_TOGGLE_LABELS.show;
    matrix.hidden = !nextExpanded;
    logDebug('more-fill-toggle', { expanded: nextExpanded });
    scheduleReposition();
  }

  function ensureOverlay(){
    if(overlay || !documentRef || !documentRef.body){
      return overlay;
    }
    overlay = documentRef.createElement('div');
    overlay.className = 'shared-color-picker';
    overlay.dataset.fontControlsOverlay = '1';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Color picker');
    overlay.tabIndex = -1;
    overlay.style.position = 'absolute';
    overlay.style.zIndex = '1000';
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'none';

    const standardSection = createPaletteRowSection('Standard Colors', STANDARD_COLORS);
    overlay.appendChild(standardSection);

    const moreFillSection = createMoreFillSection();
    overlayState.moreToggle = moreFillSection.toggle;
    overlayState.moreMatrix = moreFillSection.matrix;
    overlay.appendChild(moreFillSection.section);

    const recentSection = createRecentSection();
    overlayState.recentSection = recentSection.section;
    overlayState.recentRow = recentSection.row;
    overlay.appendChild(recentSection.section);

    const customSection = createCustomSection();
    overlayState.customInput = customSection.colorInput;
    overlayState.hexInput = customSection.hexInput;
    overlay.appendChild(customSection.section);

    documentRef.body.appendChild(overlay);

    overlay.addEventListener('click', handleOverlayClick);
    overlay.addEventListener('keydown', handleOverlayKeydown);

    documentRef.addEventListener('pointerdown', handleDocumentPointerDown, true);
    documentRef.addEventListener('scroll', handleDocumentScroll, true);
    global.addEventListener('resize', handleWindowResize);

    if(overlayState.customInput){
      overlayState.customInput.addEventListener('input', handleCustomColorInput);
      overlayState.customInput.addEventListener('change', handleCustomColorChange);
    }
    if(overlayState.hexInput){
      overlayState.hexInput.addEventListener('input', handleHexInput);
      overlayState.hexInput.addEventListener('change', handleHexChange);
      overlayState.hexInput.addEventListener('keydown', handleHexKeydown);
    }
    if(customSection.eyedropperButton){
      customSection.eyedropperButton.addEventListener('click', handleEyeDropperClick);
    }
    if(overlayState.moreToggle){
      overlayState.moreToggle.addEventListener('click', handleMoreToggle);
    }

    logDebug('overlay-created', { swatches: swatchRegistry.size });
    return overlay;
  }

  function placeOverlayNear(anchorEl){
    if(!overlay || !anchorEl || typeof anchorEl.getBoundingClientRect !== 'function'){
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const docEl = documentRef.documentElement;
    const scrollX = global.pageXOffset || docEl?.scrollLeft || 0;
    const scrollY = global.pageYOffset || docEl?.scrollTop || 0;

    const placementCandidates = [];
    placementCandidates.push({ left: rect.right + scrollX + 8, top: rect.top + scrollY });
    placementCandidates.push({ left: rect.left + scrollX, top: rect.bottom + scrollY + 8 });
    placementCandidates.push({ left: rect.left + scrollX, top: rect.top + scrollY - overlay.offsetHeight - 8 });
    placementCandidates.push({ left: rect.left + scrollX - overlay.offsetWidth - 8, top: rect.top + scrollY });

    const viewportWidth = global.innerWidth || docEl?.clientWidth || 0;
    const viewportHeight = global.innerHeight || docEl?.clientHeight || 0;

    const avoidRect = anchorEl.__fontControlsAvoidRect || null;
    let applied = null;

    for(let i = 0; i < placementCandidates.length; i += 1){
      const candidate = placementCandidates[i];
      let left = candidate.left;
      let top = candidate.top;
      if(viewportWidth){
        const minLeft = scrollX + 8;
        const maxLeft = scrollX + viewportWidth - overlay.offsetWidth - 8;
        left = Math.min(Math.max(left, minLeft), maxLeft);
      }
      if(viewportHeight){
        const minTop = scrollY + 8;
        const maxTop = scrollY + viewportHeight - overlay.offsetHeight - 8;
        top = Math.min(Math.max(top, minTop), maxTop);
      }
      const candidateRect = { left, right: left + overlay.offsetWidth, top, bottom: top + overlay.offsetHeight };
      if(!avoidRect || candidateRect.left >= avoidRect.right || candidateRect.right <= avoidRect.left || candidateRect.top >= avoidRect.bottom || candidateRect.bottom <= avoidRect.top){
        applied = candidateRect;
        overlay.style.left = `${left}px`;
        overlay.style.top = `${top}px`;
        break;
      }
    }

    if(!applied){
      const fallbackLeft = scrollX + Math.max(8, viewportWidth / 2 - overlay.offsetWidth / 2);
      const fallbackTop = scrollY + Math.max(8, viewportHeight / 2 - overlay.offsetHeight / 2);
      overlay.style.left = `${fallbackLeft}px`;
      overlay.style.top = `${fallbackTop}px`;
      applied = { left: fallbackLeft, top: fallbackTop };
    }

    logDebug('overlay-positioned', { left: applied.left, top: applied.top });
  }

  function repositionOverlay(){
    if(!overlay || overlay.style.display === 'none' || !overlayState.anchor){
      return;
    }
    placeOverlayNear(overlayState.anchor);
  }

  const scheduleReposition = typeof Shared.debounceFrame === 'function'
    ? Shared.debounceFrame(repositionOverlay)
    : repositionOverlay;

  function handleDocumentPointerDown(evt){
    if(!overlay || overlay.style.display === 'none'){
      return;
    }
    const target = evt.target;
    if(overlay.contains(target)){
      return;
    }
    if(overlayState.anchor && typeof overlayState.anchor.contains === 'function' && overlayState.anchor.contains(target)){
      return;
    }
    closeOverlay('pointer-dismiss');
  }

  function handleDocumentScroll(){
    scheduleReposition();
  }

  function handleWindowResize(){
    scheduleReposition();
  }

  function handleOverlayClick(evt){
    const target = evt.target;
    const swatch = target && typeof target.closest === 'function' ? target.closest('[data-color]') : null;
    if(!swatch || swatch.disabled){
      return;
    }
    evt.preventDefault();
    const color = swatch.dataset.color;
    logDebug('swatch-click', { color });
    applyColor(color, { source: 'palette' });
  }

  function handleOverlayKeydown(evt){
    if(evt.key === 'Escape'){
      evt.preventDefault();
      closeOverlay('escape');
    }
  }

  function handleCustomColorInput(evt){
    const value = normalizeHex(evt.target.value);
    if(!value){
      return;
    }
    logDebug('custom-input', { color: value });
    setActiveColor(value, { skipCustomUpdate: true });
    updateHexInput(value);
    dispatchInput(value, { source: 'custom-input', intermediate: true });
  }

  function handleCustomColorChange(evt){
    const value = normalizeHex(evt.target.value);
    if(!value){
      return;
    }
    logDebug('custom-change', { color: value });
    applyColor(value, { source: 'custom-input' });
  }

  function updateHexInput(value){
    if(overlayState.hexInput && overlayState.hexInput.value.toUpperCase() !== value){
      overlayState.hexInput.value = value;
    }
  }

  function handleHexInput(evt){
    const value = normalizeHex(evt.target.value);
    if(!value){
      return;
    }
    logDebug('hex-input', { color: value });
    setActiveColor(value, { skipCustomUpdate: true });
    if(overlayState.customInput && overlayState.customInput.value !== value){
      overlayState.customInput.value = value;
    }
    dispatchInput(value, { source: 'hex-input', intermediate: true });
  }

  function handleHexChange(evt){
    const value = normalizeHex(evt.target.value);
    if(!value){
      if(overlayState.activeColor){
        evt.target.value = overlayState.activeColor;
      }
      return;
    }
    logDebug('hex-change', { color: value });
    applyColor(value, { source: 'hex-input' });
  }

  function handleHexKeydown(evt){
    if(evt.key === 'Enter'){
      evt.preventDefault();
      const value = normalizeHex(evt.target.value);
      if(value){
        logDebug('hex-enter', { color: value });
        applyColor(value, { source: 'hex-input' });
      }
    }
  }

  function handleEyeDropperClick(evt){
    evt.preventDefault();
    if(typeof global.EyeDropper !== 'function'){
      return;
    }
    try{
      const eyeDropper = new global.EyeDropper();
      logDebug('eyedropper-open', {});
      eyeDropper.open().then(result => {
        const value = normalizeHex(result?.sRGBHex);
        if(value){
          logDebug('eyedropper-result', { color: value });
          applyColor(value, { source: 'eyedropper' });
        }
      }).catch(err => {
        logDebug('eyedropper-cancelled', { message: err?.message || String(err) });
      });
    }catch(err){
      console.warn('colorPicker eyedropper error', err);
    }
  }

  function applyColor(color, { source = 'palette', final = true } = {}){
    const normalized = setActiveColor(color);
    dispatchInput(normalized, { source, intermediate: !final });
    if(final){
      dispatchChange(normalized, { source });
      addRecentColor(normalized);
      closeOverlay('selection');
    }
  }

  function closeOverlay(reason){
    if(!overlay || overlay.style.display === 'none'){
      return;
    }
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'none';
    overlay.dataset.visible = '0';
    const target = overlay.targetEl;
    overlay.targetEl = null;
    if(target && typeof target.onOverlayClose === 'function'){
      try{
        target.onOverlayClose({ reason });
      }catch(err){
        console.warn('colorPicker close handler error', err);
      }
    }
    logDebug('overlay-closed', { reason });
    overlayState.anchor = null;
  }

  Shared.openColorPicker = function openColorPicker(options){
    const opts = options || {};
    const ov = ensureOverlay();
    if(!ov){
      console.warn('Shared.openColorPicker skipped: overlay missing');
      return null;
    }
    const initialColor = normalizeHex(opts.color) || overlayState.activeColor || '#000000';
    overlayState.anchor = opts.anchor || opts.element || null;

    if(opts.target && (typeof opts.target.onOverlayInput === 'function' || typeof opts.target.onOverlayChange === 'function')){
      ov.targetEl = opts.target;
    }else{
      const element = opts.target instanceof HTMLElement ? opts.target : (opts.element instanceof HTMLElement ? opts.element : null);
      ov.targetEl = {
        onOverlayInput(value, meta){
          if(typeof opts.onInput === 'function'){
            opts.onInput(value, meta);
          }else if(element){
            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
        onOverlayChange(value, meta){
          if(typeof opts.onChange === 'function'){
            opts.onChange(value, meta);
          }else if(element){
            element.value = value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
        },
        onOverlayClose(payload){
          if(typeof opts.onClose === 'function'){
            opts.onClose(payload);
          }
        }
      };
    }

    setActiveColor(initialColor);
    renderRecentColors();
    toggleMoreFill(false);

    ov.style.display = 'block';
    ov.style.pointerEvents = 'auto';
    ov.dataset.visible = '1';

    if(overlayState.anchor && typeof overlayState.anchor.getBoundingClientRect === 'function'){
      placeOverlayNear(overlayState.anchor);
    }else if(Number.isFinite(opts.left) && Number.isFinite(opts.top)){
      ov.style.left = `${opts.left}px`;
      ov.style.top = `${opts.top}px`;
    }

    try{
      ov.focus({ preventScroll: true });
    }catch(err){
      logDebug('focus-error', { message: err?.message || String(err) });
    }

    logDebug('overlay-open', { color: initialColor, hasAnchor: !!overlayState.anchor });
    return ov;
  };

  Shared.initColorPickerOverlay = function initColorPickerOverlay(){
    return ensureOverlay();
  };

  Shared.attachColorPickerNear = function attachColorPickerNear(el){
    if(!el){
      return;
    }
    ensureOverlay();
    if(Shared.chartStyle?.normalizeColorInput){
      try{
        Shared.chartStyle.normalizeColorInput(el, { reason: 'colorPicker.attach' });
      }catch(normalizeErr){
        console.error('colorPicker normalizeColorInput error', normalizeErr);
      }
    }
    el.addEventListener('click', (evt)=>{
      evt.preventDefault();
      logDebug('attached-click', { id: el.id || null });
      Shared.openColorPicker({
        anchor: el,
        color: el.value,
        element: el,
        onInput(value){
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        },
        onChange(value){
          el.value = value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
  };
})(window);
