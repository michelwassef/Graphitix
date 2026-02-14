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
  const SHARED_SHAPE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'circle', label: 'Circle' }),
    Object.freeze({ value: 'triangle', label: 'Triangle' }),
    Object.freeze({ value: 'square', label: 'Square' }),
    Object.freeze({ value: 'diamond', label: 'Diamond' }),
    Object.freeze({ value: 'cross', label: 'Cross' }),
    Object.freeze({ value: 'plus', label: 'Plus' }),
    Object.freeze({ value: 'star', label: 'Star' })
  ]);
  const SHARED_SHAPE_VALUES = new Set(SHARED_SHAPE_OPTIONS.map(opt => opt.value));

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
    moreMatrix: null,
    shapeSection: null,
    shapeContainer: null,
    shapeOptions: null,
    shapeValue: null,
    shapeOnChange: null,
    shapeAllowed: null,
    closeOnSelect: false
  };

  function isDebugEnabled(){
    return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
  }

  function logDebug(label, payload){
    if(isDebugEnabled()){
      console.debug(`Debug: colorPicker ${label}`, payload || {});
    }
  }

  function ensureFallbackColorInput(){
    if(overlayState.__fallbackColorInput && overlayState.__fallbackColorInput.isConnected){
      return overlayState.__fallbackColorInput;
    }
    const input = documentRef.createElement('input');
    input.type = 'color';
    input.className = 'shared-color-picker__hidden-fallback-input';
    input.tabIndex = -1;
    input.style.position = 'fixed';
    input.style.inset = '0';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.addEventListener('input', (evt)=>{
      const value = normalizeHex(evt.target.value);
      if(value){
        logDebug('eyedropper-fallback-input', { color: value });
        applyColor(value, { source: 'eyedropper' });
      }
    });
    documentRef.body.appendChild(input);
    overlayState.__fallbackColorInput = input;
    return input;
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

    const eyedropperButton = documentRef.createElement('button');
    eyedropperButton.type = 'button';
    eyedropperButton.className = 'shared-color-picker__eyedropper';
    const supportsNativeEyeDropper = typeof global.EyeDropper === 'function';
    eyedropperButton.dataset.mode = supportsNativeEyeDropper ? 'native' : 'fallback';
    const eyeDropperLabel = supportsNativeEyeDropper ? 'Pick a color from the screen' : 'Open the system color picker';
    eyedropperButton.setAttribute('aria-label', eyeDropperLabel);
    eyedropperButton.title = supportsNativeEyeDropper ? 'Pick screen color' : 'Open system color picker';
    if(!supportsNativeEyeDropper){
      eyedropperButton.classList.add('shared-color-picker__eyedropper--fallback');
    }
    const icon = documentRef.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('class', 'shared-color-picker__eyedropper-icon');
    icon.setAttribute('aria-hidden', 'true');
    const path = documentRef.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M18.17 2.83a3 3 0 0 0-4.24 0l-2.2 2.2-.47-.47a1 1 0 0 0-1.41 0l-1.76 1.76a1 1 0 0 0 0 1.41l.47.47-6.5 6.5a2 2 0 0 0 0 2.83l1.42 1.42a2 2 0 0 0 2.83 0l6.5-6.5.47.47a1 1 0 0 0 1.41 0l1.76-1.76a1 1 0 0 0 0-1.41l-.47-.47 2.2-2.2a3 3 0 0 0 0-4.24zm-4.95 8.78-6.5 6.5a.5.5 0 0 1-.71 0l-1.42-1.42a.5.5 0 0 1 0-.71l6.5-6.5 2.13 2.13zm4.24-4.24-1.5 1.5-2.83-2.83 1.5-1.5a1 1 0 0 1 1.41 0l1.42 1.42a1 1 0 0 1 0 1.41z');
    icon.appendChild(path);
    const srLabel = documentRef.createElement('span');
    srLabel.className = 'shared-color-picker__sr-only';
    srLabel.textContent = eyeDropperLabel;
    eyedropperButton.appendChild(icon);
    eyedropperButton.appendChild(srLabel);
    row.appendChild(eyedropperButton);

    section.appendChild(row);
    return { section, colorInput, hexInput, eyedropperButton };
  }

  let shapeGroupIdCounter = 0;

  function createShapePreview(shape){
    const svg = documentRef.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'shared-color-picker__shape-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const normalized = typeof shape === 'string' ? shape.toLowerCase() : '';
    const center = 12;
    const radius = 7;
    if(normalized === 'square'){
      const rect = documentRef.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(center - radius));
      rect.setAttribute('y', String(center - radius));
      rect.setAttribute('width', String(radius * 2));
      rect.setAttribute('height', String(radius * 2));
      rect.setAttribute('fill', 'currentColor');
      svg.appendChild(rect);
      return svg;
    }
    if(normalized === 'triangle'){
      const path = documentRef.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M ${center} ${center - radius} L ${center + radius} ${center + radius} L ${center - radius} ${center + radius} Z`);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      return svg;
    }
    if(normalized === 'diamond'){
      const path = documentRef.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M ${center} ${center - radius} L ${center + radius} ${center} L ${center} ${center + radius} L ${center - radius} ${center} Z`);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      return svg;
    }
    if(normalized === 'cross'){
      const size = radius * 2;
      const half = size / 2;
      const bar = Math.max(Math.round(size / 3), 4);
      const halfBar = bar / 2;
      const top = center - half;
      const bottom = center + half;
      const left = center - half;
      const right = center + half;
      const path = documentRef.createElementNS(SVG_NS, 'path');
      const d = [
        `M ${left} ${top + halfBar}`,
        `L ${left + halfBar} ${top}`,
        `L ${center} ${center - halfBar}`,
        `L ${right - halfBar} ${top}`,
        `L ${right} ${top + halfBar}`,
        `L ${center + halfBar} ${center}`,
        `L ${right} ${bottom - halfBar}`,
        `L ${right - halfBar} ${bottom}`,
        `L ${center} ${center + halfBar}`,
        `L ${left + halfBar} ${bottom}`,
        `L ${left} ${bottom - halfBar}`,
        `L ${center - halfBar} ${center}`,
        'Z'
      ].join(' ');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      return svg;
    }
    if(normalized === 'plus'){
      const size = radius * 2;
      const half = size / 2;
      const bar = Math.max(Math.round(size / 3), 4);
      const halfBar = bar / 2;
      const path = documentRef.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M ${center - halfBar} ${center - half} H ${center + halfBar} V ${center - halfBar} H ${center + half} V ${center + halfBar} H ${center + halfBar} V ${center + half} H ${center - halfBar} V ${center + halfBar} H ${center - half} V ${center - halfBar} H ${center - halfBar} Z`);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      return svg;
    }
    if(normalized === 'star'){
      const outer = radius;
      const inner = Math.max(radius * 0.45, 2);
      const points = [];
      for(let i = 0; i < 5; i += 1){
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        points.push({ x: center + Math.cos(a) * outer, y: center + Math.sin(a) * outer });
        const b = a + Math.PI / 5;
        points.push({ x: center + Math.cos(b) * inner, y: center + Math.sin(b) * inner });
      }
      const path = documentRef.createElementNS(SVG_NS, 'path');
      const d = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') + ' Z';
      path.setAttribute('d', d);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      return svg;
    }
    const circle = documentRef.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(center));
    circle.setAttribute('cy', String(center));
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', 'currentColor');
    svg.appendChild(circle);
    return svg;
  }

  Shared.getShapePickerOptions = function getShapePickerOptions(){
    return SHARED_SHAPE_OPTIONS;
  };

  Shared.getShapePickerValues = function getShapePickerValues(){
    return SHARED_SHAPE_VALUES;
  };

  Shared.createShapeColorSwatch = function createShapeColorSwatch(options){
    const opts = options || {};
    const doc = opts.document || documentRef;
    if(!doc){
      return null;
    }
    const container = doc.createElement('div');
    container.className = 'shared-shape-color-control';
    const swatch = doc.createElement('button');
    swatch.type = 'button';
    swatch.className = 'shared-shape-color-swatch';
    swatch.setAttribute('aria-label', opts.label || 'Fill/Shape');
    const input = doc.createElement('input');
    input.type = 'color';
    input.className = 'shared-shape-color-input';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    container.appendChild(swatch);
    container.appendChild(input);

    const normalizeShape = shapeValue => {
      const normalized = typeof shapeValue === 'string' ? shapeValue.toLowerCase() : '';
      return SHARED_SHAPE_VALUES.has(normalized) ? normalized : 'circle';
    };
    let currentColor = normalizeHex(opts.color) || '#000000';
    let currentShape = normalizeShape(opts.shape);
    input.value = currentColor;

    const renderSwatch = () => {
      swatch.textContent = '';
      const svg = createShapePreview(currentShape);
      svg.style.color = currentColor;
      swatch.appendChild(svg);
      swatch.dataset.shape = currentShape;
      swatch.dataset.color = currentColor;
      try{ input.value = currentColor; }catch(e){}
    };

    const update = (nextColor, nextShape) => {
      if(nextColor){
        const normalized = normalizeHex(nextColor);
        if(normalized){
          currentColor = normalized;
        }
      }
      if(nextShape){
        currentShape = normalizeShape(nextShape);
      }
      renderSwatch();
    };

    const openPicker = (evt) => {
      if(evt && typeof evt.preventDefault === 'function'){
        evt.preventDefault();
      }
      if(typeof Shared.openColorPicker === 'function'){
        const shapeOptions = Array.isArray(opts.shapeOptions) && opts.shapeOptions.length
          ? opts.shapeOptions
          : SHARED_SHAPE_OPTIONS;
        let previousColor = currentColor;
        const pickerOptions = opts.pickerOptions && typeof opts.pickerOptions === 'object'
          ? opts.pickerOptions
          : null;
        const requestedCloseOnSelect = pickerOptions && typeof pickerOptions.closeOnSelect === 'boolean'
          ? pickerOptions.closeOnSelect
          : (opts.closeOnSelect === true);
        const pickerOnClose = pickerOptions && typeof pickerOptions.onClose === 'function'
          ? pickerOptions.onClose
          : null;
        const overlayEl = Shared.openColorPicker({
          anchor: opts.anchor || swatch,
          color: currentColor,
          closeOnSelect: requestedCloseOnSelect,
          shapePicker: {
            value: currentShape,
            options: shapeOptions,
            onChange(nextShape){
              const normalized = normalizeShape(nextShape);
              if(normalized === currentShape){
                return;
              }
              currentShape = normalized;
              renderSwatch();
              if(typeof opts.onShapeChange === 'function'){
                opts.onShapeChange(currentShape);
              }
            }
          },
          onInput(value){
            const normalized = normalizeHex(value);
            if(!normalized){
              return;
            }
            currentColor = normalized;
            renderSwatch();
            if(typeof opts.onColorInput === 'function'){
              opts.onColorInput(currentColor);
            }
          },
          onChange(value){
            const normalized = normalizeHex(value);
            if(!normalized){
              return;
            }
            currentColor = normalized;
            renderSwatch();
            if(typeof opts.onColorChange === 'function'){
              opts.onColorChange(currentColor, previousColor);
            }
            previousColor = currentColor;
          },
          onClose(payload){
            if(typeof opts.onPickerClose === 'function'){
              opts.onPickerClose(payload);
            }
            if(pickerOnClose){
              pickerOnClose(payload);
            }
          }
        });
        if(typeof opts.onPickerOpen === 'function'){
          opts.onPickerOpen({
            overlay: overlayEl || null,
            swatch,
            input,
            color: currentColor,
            shape: currentShape
          });
        }
      }else{
        try{ input.click(); }catch(e){}
      }
    };

    swatch.addEventListener('click', openPicker);
    input.addEventListener('input', () => {
      const normalized = normalizeHex(input.value);
      if(normalized){
        currentColor = normalized;
        renderSwatch();
        if(typeof opts.onColorInput === 'function'){
          opts.onColorInput(currentColor);
        }
      }
    });
    input.addEventListener('change', () => {
      const normalized = normalizeHex(input.value);
      if(normalized){
        currentColor = normalized;
        renderSwatch();
        if(typeof opts.onColorChange === 'function'){
          opts.onColorChange(currentColor);
        }
      }
    });

    renderSwatch();
    return {
      element: container,
      swatch,
      input,
      update,
      open: openPicker
    };
  };

  function createShapeSection(){
    const section = documentRef.createElement('section');
    section.className = 'shared-color-picker__section shared-color-picker__section--shapes';
    section.hidden = true;
    section.setAttribute('aria-hidden', 'true');
    const title = documentRef.createElement('div');
    title.className = 'shared-color-picker__section-title';
    title.textContent = 'Marker shape';
    section.appendChild(title);
    const optionsRow = documentRef.createElement('div');
    optionsRow.className = 'shared-color-picker__shape-list';
    optionsRow.setAttribute('role', 'radiogroup');
    optionsRow.setAttribute('aria-label', 'Marker shape');
    section.appendChild(optionsRow);
    return { section, container: optionsRow };
  }

  function setActiveShapeValue(value, { trigger = true } = {}){
    const optionRefs = overlayState.shapeOptions;
    if(!Array.isArray(optionRefs) || !optionRefs.length){
      return null;
    }
    const allowed = overlayState.shapeAllowed;
    let normalized = null;
    if(allowed && allowed.has(value)){
      normalized = value;
    }else if(allowed && allowed.size){
      const first = optionRefs[0];
      normalized = first ? first.value : null;
    }else{
      normalized = value;
    }
    if(!normalized){
      return null;
    }
    if(overlayState.shapeValue === normalized){
      return normalized;
    }
    overlayState.shapeValue = normalized;
    for(let i = 0; i < optionRefs.length; i += 1){
      const ref = optionRefs[i];
      const isSelected = ref.value === normalized;
      if(ref.element){
        ref.element.classList.toggle('shared-color-picker__shape-option--selected', isSelected);
      }
      if(ref.input){
        ref.input.checked = isSelected;
      }
    }
    if(trigger && typeof overlayState.shapeOnChange === 'function'){
      try{
        overlayState.shapeOnChange(normalized);
      }catch(err){
        console.warn('colorPicker shape change handler error', err);
      }
    }
    logDebug('shape-change', { value: normalized, trigger });
    scheduleReposition();
    return normalized;
  }

  function renderShapePicker(config){
    const section = overlayState.shapeSection;
    const container = overlayState.shapeContainer;
    overlayState.shapeOptions = null;
    overlayState.shapeValue = null;
    overlayState.shapeOnChange = null;
    overlayState.shapeAllowed = null;
    if(!section || !container){
      return;
    }
    while(container.firstChild){
      container.removeChild(container.firstChild);
    }
    if(!config || !Array.isArray(config.options) || !config.options.length){
      section.hidden = true;
      section.setAttribute('aria-hidden', 'true');
      logDebug('shape-hidden', { reason: 'no-config' });
      return;
    }
    const options = [];
    const allowed = new Set();
    for(let i = 0; i < config.options.length; i += 1){
      const raw = config.options[i];
      const value = typeof raw === 'string' ? raw : (raw && typeof raw.value === 'string' ? raw.value : null);
      if(!value || allowed.has(value)){
        continue;
      }
      const label = typeof raw === 'object' && raw && typeof raw.label === 'string' && raw.label
        ? raw.label
        : value;
      options.push({ value, label });
      allowed.add(value);
    }
    if(!options.length){
      section.hidden = true;
      section.setAttribute('aria-hidden', 'true');
      logDebug('shape-hidden', { reason: 'no-options' });
      return;
    }
    overlayState.shapeAllowed = allowed;
    overlayState.shapeOnChange = typeof config.onChange === 'function' ? config.onChange : null;
    const fallbackValue = options[0].value;
    const providedValue = typeof config.value === 'string' ? config.value : null;
    const initialValue = providedValue && allowed.has(providedValue) ? providedValue : fallbackValue;
    const groupName = `shared-color-picker-shapes-${shapeGroupIdCounter += 1}`;
    const optionRefs = [];
    for(let i = 0; i < options.length; i += 1){
      const opt = options[i];
      const labelEl = documentRef.createElement('label');
      labelEl.className = 'shared-color-picker__shape-option';
      labelEl.dataset.shapeValue = opt.value;
      const input = documentRef.createElement('input');
      input.type = 'radio';
      input.name = groupName;
      input.value = opt.value;
      input.className = 'shared-color-picker__shape-input';
      input.setAttribute('aria-label', opt.label);
      const swatch = documentRef.createElement('span');
      swatch.className = 'shared-color-picker__shape-swatch';
      swatch.appendChild(createShapePreview(opt.value));
      const srLabel = documentRef.createElement('span');
      srLabel.className = 'shared-color-picker__sr-only';
      srLabel.textContent = opt.label;
      labelEl.appendChild(input);
      labelEl.appendChild(swatch);
      labelEl.appendChild(srLabel);
      input.addEventListener('change', () => {
        if(input.checked){
          logDebug('shape-input', { value: opt.value });
          setActiveShapeValue(opt.value);
        }
      });
      container.appendChild(labelEl);
      optionRefs.push({ value: opt.value, element: labelEl, input });
    }
    overlayState.shapeOptions = optionRefs;
    section.hidden = false;
    section.setAttribute('aria-hidden', 'false');
    setActiveShapeValue(initialValue, { trigger: false });
    logDebug('shape-render', { count: optionRefs.length, value: initialValue });
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

    const shapeSection = createShapeSection();
    overlayState.shapeSection = shapeSection.section;
    overlayState.shapeContainer = shapeSection.container;
    overlay.appendChild(shapeSection.section);

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
    if(!rect || (rect.width === 0 && rect.height === 0)){
      return;
    }
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

  function openSystemColorPickerFallback(){
    if(!overlayState.customInput){
      return;
    }
    try{
      overlayState.customInput.focus({ preventScroll: true });
    }catch(err){
      overlayState.customInput.focus();
    }
    overlayState.customInput.click();
  }

  async function handleEyeDropperClick(evt){
    evt.preventDefault();
    const mode = evt && evt.currentTarget && evt.currentTarget.dataset ? evt.currentTarget.dataset.mode : null;
    if(mode === 'fallback' || typeof global.EyeDropper !== 'function'){
      const fallbackReason = mode === 'fallback' ? 'native-unavailable' : 'missing-interface';
      logDebug('eyedropper-fallback', { reason: fallbackReason });
      const fallbackInput = ensureFallbackColorInput();
      if(fallbackInput){
        fallbackInput.value = overlayState.activeColor || '#000000';
        try{
          fallbackInput.showPicker?.();
        }catch(err){
          // Firefox exposes showPicker behind flags; fallback to click()
          fallbackInput.click();
        }
      }else{
        openSystemColorPickerFallback();
      }
      return;
    }
    try{
      const eyeDropper = new global.EyeDropper();
      logDebug('eyedropper-open', {});
      const result = await eyeDropper.open();
      const value = normalizeHex(result?.sRGBHex);
      if(value){
        logDebug('eyedropper-result', { color: value });
        applyColor(value, { source: 'eyedropper' });
      }
    }catch(err){
      logDebug('eyedropper-cancelled', { message: err?.message || String(err) });
    }
  }

  function applyColor(color, { source = 'palette', final = true } = {}){
    const normalized = setActiveColor(color);
    dispatchInput(normalized, { source, intermediate: !final });
    if(final){
      dispatchChange(normalized, { source });
      addRecentColor(normalized);
      if(overlayState.closeOnSelect){
        closeOverlay('selection');
      }
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
    overlayState.shapeOptions = null;
    overlayState.shapeValue = null;
    overlayState.shapeOnChange = null;
    overlayState.shapeAllowed = null;
    overlayState.closeOnSelect = false;
    if(overlayState.shapeSection){
      overlayState.shapeSection.hidden = true;
      overlayState.shapeSection.setAttribute('aria-hidden', 'true');
    }
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

    renderShapePicker(opts.shapePicker);
    overlayState.closeOnSelect = opts && typeof opts.closeOnSelect === 'boolean' ? opts.closeOnSelect : false;

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
