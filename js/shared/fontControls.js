(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};

  const DEFAULT_FONTS = [
    'Inter',
    'Segoe UI',
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Cambria',
    'Garamond',
    'Palatino',
    'Courier New',
    'Fira Sans',
    'IBM Plex Sans',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Symbol'
  ];

  const LATIN_TO_GREEK_UPPER = {
    A: 'Α',
    B: 'Β',
    C: 'Χ',
    D: 'Δ',
    E: 'Ε',
    F: 'Φ',
    G: 'Γ',
    H: 'Η',
    I: 'Ι',
    J: 'Ξ',
    K: 'Κ',
    L: 'Λ',
    M: 'Μ',
    N: 'Ν',
    O: 'Ο',
    P: 'Π',
    Q: 'Θ',
    R: 'Ρ',
    S: 'Σ',
    T: 'Τ',
    U: 'Υ',
    W: 'Ω',
    X: 'Ξ',
    Y: 'Ψ',
    Z: 'Ζ'
  };

  const LATIN_TO_GREEK_LOWER = {
    a: 'α',
    b: 'β',
    c: 'χ',
    d: 'δ',
    e: 'ε',
    f: 'φ',
    g: 'γ',
    h: 'η',
    i: 'ι',
    j: 'ξ',
    k: 'κ',
    l: 'λ',
    m: 'μ',
    n: 'ν',
    o: 'ο',
    p: 'π',
    q: 'θ',
    r: 'ρ',
    s: 'σ',
    t: 'τ',
    u: 'υ',
    w: 'ω',
    x: 'ξ',
    y: 'ψ',
    z: 'ζ'
  };

  const styleStore = new Map();
  const svgRegistry = new WeakSet();
  const svgScopeMap = new WeakMap();
  const supportsWeakRef = typeof global.WeakRef === 'function';
  const nodeGroupStore = new Map();
  const toolbarHostMap = new Map();
  let activeHost = null;

  let panelEl = null;
  let fontInput = null;
  let fontSelect = null;
  let customInputWrapper = null;
  let customInputVisible = false;
  let colorInput = null;
  let boldToggle = null;
  let italicToggle = null;
  let sizeInput = null;
  let greekBtn = null;
  let closeBtn = null;
  let previewTextEl = null;
  let targetLabelEl = null;
  let currentTarget = null;
  let currentScope = null;
  let currentKey = null;

  function logDebug(label, payload){
    try {
      console.debug(`Debug: fontControls ${label}`, payload); // Debug: font control trace
    } catch(err) {
      // Logging failures should never break execution.
    }
  }

  function resolveToolbarHost(scopeId){
    if(!global.document){ return null; }
    const doc = global.document;
    const key = scopeId || '__global__';
    if(toolbarHostMap.has(key)){
      return toolbarHostMap.get(key);
    }
    const buttonId = scopeId ? `${scopeId}LoadExample` : null;
    const button = buttonId ? doc.getElementById(buttonId) : null;
    if(!button){
      logDebug('resolveToolbarHost missing button', { scopeId: key, buttonId });
      return null;
    }
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = key;
    host.style.display = 'none';
    button.insertAdjacentElement('afterend', host);
    toolbarHostMap.set(key, host);
    logDebug('toolbar host created', { scopeId: key, buttonId });
    return host;
  }

  function showToolbarHost(host){
    if(!host){ return; }
    host.style.display = 'flex';
    host.classList.add('font-toolbar-host--visible');
    logDebug('toolbar host shown', { scopeId: host.dataset?.fontToolbarScope || null });
  }

  function hideToolbarHost(host){
    if(!host){ return; }
    host.classList.remove('font-toolbar-host--visible');
    host.style.display = 'none';
    logDebug('toolbar host hidden', { scopeId: host.dataset?.fontToolbarScope || null });
  }

  function toggleCustomFontInput(show){
    if(!customInputWrapper){ return; }
    const shouldShow = !!show;
    if(customInputVisible === shouldShow){ return; }
    customInputVisible = shouldShow;
    if(shouldShow){
      customInputWrapper.classList.remove('font-controls-panel__custom-input--hidden');
    } else {
      customInputWrapper.classList.add('font-controls-panel__custom-input--hidden');
    }
    logDebug('custom font input toggled', { visible: shouldShow });
  }

  function syncFontSelectValue(rawValue, meta){
    if(!fontSelect){ return; }
    const sanitized = (rawValue || '').replace(/"/g, '').trim();
    const options = fontSelect.options ? Array.from(fontSelect.options) : [];
    let matchedValue = '';
    for(let i = 0; i < options.length; i += 1){
      const option = options[i];
      if(!option || !option.value || option.value === '__custom__'){ continue; }
      if(option.value.toLowerCase() === sanitized.toLowerCase()){
        matchedValue = option.value;
        break;
      }
    }
    if(sanitized && !matchedValue){
      fontSelect.value = '__custom__';
      toggleCustomFontInput(true);
      if(fontInput && fontInput.value.trim() !== sanitized){
        fontInput.value = sanitized;
      }
    } else {
      fontSelect.value = matchedValue || '';
      toggleCustomFontInput(false);
      if(!sanitized && fontInput){
        fontInput.value = '';
      }
    }
    logDebug('font select sync', {
      value: sanitized || null,
      matched: matchedValue || null,
      source: meta?.source || 'sync'
    });
  }

  function convertLatinStringToGreek(input){
    if(!input){
      return { text: input, changes: 0 };
    }
    const chars = Array.from(input);
    let changes = 0;
    const converted = chars.map((char, index) => {
      let replacement = null;
      if(char === 's'){
        const next = chars[index + 1];
        const boundary = !next || /[^a-zA-Z]/.test(next);
        replacement = boundary ? 'ς' : LATIN_TO_GREEK_LOWER.s;
      } else if(char === 'S'){
        replacement = LATIN_TO_GREEK_UPPER.S;
      } else if(LATIN_TO_GREEK_UPPER[char]){
        replacement = LATIN_TO_GREEK_UPPER[char];
      } else if(LATIN_TO_GREEK_LOWER[char]){
        replacement = LATIN_TO_GREEK_LOWER[char];
      }
      if(replacement && replacement !== char){
        changes += 1;
        return replacement;
      }
      return char;
    }).join('');
    return { text: converted, changes };
  }

  function humanizeToken(token){
    if(!token){ return null; }
    const cleaned = String(token)
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if(!cleaned){ return null; }
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function updatePanelContext(){
    if(!targetLabelEl){ return; }
    const parts = [];
    if(currentTarget){
      const role = humanizeToken(currentTarget.dataset?.fontRole || currentTarget.dataset?.fontKey);
      const scope = humanizeToken(currentTarget.dataset?.fontScope);
      const rawText = (currentTarget.textContent || '').trim();
      if(role){ parts.push(role); }
      if(scope && scope !== role){ parts.push(scope); }
      if(rawText){
        const snippet = rawText.length > 26 ? `${rawText.slice(0, 26)}…` : rawText;
        parts.push(`“${snippet}”`);
      }
    }
    const description = parts.length ? parts.join(' • ') : 'Select text to edit';
    targetLabelEl.textContent = description;
    logDebug('panel context refreshed', { description });
  }

  function updatePreviewText(){
    if(!previewTextEl){ return; }
    const content = (currentTarget?.textContent || '').trim();
    previewTextEl.textContent = content || 'AaBbCc 123';
    logDebug('preview text refreshed', { sample: previewTextEl.textContent });
  }

  function updatePreviewFromInputs(){
    if(!previewTextEl){ return; }
    const fontFamilyRaw = fontInput?.value?.trim() || '';
    const weightActive = boldToggle?.dataset?.active === '1';
    const italicActive = italicToggle?.dataset?.active === '1';
    const sizeValue = sizeInput?.value?.trim();
    const colorValue = colorInput?.value || '#0f172a';
    let computedSize = '';
    if(sizeValue){
      const numericSize = parseFloat(sizeValue);
      if(Number.isFinite(numericSize)){
        computedSize = `${numericSize}px`;
      }
    }
    previewTextEl.style.fontFamily = fontFamilyRaw || '';
    previewTextEl.style.fontWeight = weightActive ? '700' : '400';
    previewTextEl.style.fontStyle = italicActive ? 'italic' : 'normal';
    previewTextEl.style.fontSize = computedSize;
    previewTextEl.style.color = colorValue;
    logDebug('preview style refreshed', {
      fontFamily: fontFamilyRaw || null,
      weightActive,
      italicActive,
      size: computedSize || null,
      color: colorValue
    });
  }

  function buildStoreKey(scopeId, key){
    const scope = scopeId || '__global__';
    const token = key || '__default__';
    return `${scope}::${token}`;
  }

  function parseColorToHex(color){
    if(!color){ return '#000000'; }
    const trimmed = String(color).trim();
    if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)){
      if(trimmed.length === 4){
        return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
      }
      return trimmed.toLowerCase();
    }
    const rgbMatch = trimmed.match(/^rgba?\((\d+),(\d+),(\d+)/i);
    if(rgbMatch){
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
      const hex = [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
      return `#${hex}`;
    }
    // Fallback: attempt to resolve via a temporary element.
    try {
      const doc = global.document;
      if(!doc) return '#000000';
      const helper = doc.createElement('span');
      helper.style.color = trimmed;
      doc.body.appendChild(helper);
      const computed = global.getComputedStyle(helper).color;
      doc.body.removeChild(helper);
      return parseColorToHex(computed);
    } catch(resolveErr){
      logDebug('parseColor fallback error', { color, resolveErr });
      return '#000000';
    }
  }

  function applyStyleToNode(node, style){
    if(!node || !style){ return; }
    if(style.fontFamily){
      node.setAttribute('font-family', style.fontFamily);
    } else {
      node.removeAttribute('font-family');
    }
    if(style.fontWeight){
      node.setAttribute('font-weight', style.fontWeight);
    } else {
      node.removeAttribute('font-weight');
    }
    if(style.fontStyle){
      node.setAttribute('font-style', style.fontStyle);
    } else {
      node.removeAttribute('font-style');
    }
    if(style.fontSize){
      node.setAttribute('font-size', style.fontSize);
    } else {
      node.removeAttribute('font-size');
    }
    if(style.fill){
      node.setAttribute('fill', style.fill);
    }
    logDebug('applyStyleToNode', {
      text: node?.textContent,
      scope: node?.dataset?.fontScope || null,
      key: node?.dataset?.fontKey || null,
      style
    });
  }

  function isStyleEmpty(style){
    if(!style){ return true; }
    return !style.fontFamily && !style.fontWeight && !style.fontStyle && !style.fill && !style.fontSize;
  }

  function clearStyleFromNode(node){
    if(!node){ return; }
    node.removeAttribute('font-family');
    node.removeAttribute('font-weight');
    node.removeAttribute('font-style');
    node.removeAttribute('font-size');
    node.removeAttribute('fill');
    logDebug('clearStyleFromNode', {
      text: node?.textContent,
      scope: node?.dataset?.fontScope || null,
      key: node?.dataset?.fontKey || null
    });
  }

  function cleanupWeakRefs(entry){
    if(!entry || !Array.isArray(entry.refs)){ return; }
    entry.refs = entry.refs.filter(ref => {
      const node = ref?.deref?.();
      return !!node;
    });
  }

  function registerNodeForKey(node, storeKey){
    if(!node || !storeKey){ return; }
    let entry = nodeGroupStore.get(storeKey);
    if(!entry){
      entry = supportsWeakRef ? { refs: [], cleanupCounter: 0 } : { nodes: new Set() };
      nodeGroupStore.set(storeKey, entry);
    }
    if(supportsWeakRef){
      entry.refs.push(new global.WeakRef(node));
      entry.cleanupCounter = (entry.cleanupCounter || 0) + 1;
      if(entry.cleanupCounter >= 20){
        cleanupWeakRefs(entry);
        entry.cleanupCounter = 0;
        logDebug('registerNodeForKey cleanup', { storeKey, remaining: entry.refs.length });
      }
    } else {
      entry.nodes.add(node);
    }
  }

  function broadcastStyle(storeKey, style, sourceNode){
    if(!storeKey){ return; }
    const entry = nodeGroupStore.get(storeKey);
    if(!entry){ return; }
    if(supportsWeakRef){
      entry.refs = entry.refs.filter(ref => {
        const node = ref?.deref?.();
        if(!node){ return false; }
        if(node !== sourceNode){
          if(style && !isStyleEmpty(style)){
            applyStyleToNode(node, style);
          } else {
            clearStyleFromNode(node);
          }
        }
        return true;
      });
    } else {
      const stale = [];
      entry.nodes.forEach(node => {
        if(!node || !node.isConnected){
          stale.push(node);
          return;
        }
        if(node === sourceNode){ return; }
        if(style && !isStyleEmpty(style)){
          applyStyleToNode(node, style);
        } else {
          clearStyleFromNode(node);
        }
      });
      stale.forEach(node => entry.nodes.delete(node));
    }
    logDebug('broadcastStyle', { storeKey, hasStyle: !isStyleEmpty(style || null) });
  }

  function storeCurrentStyle(style){
    if(!currentTarget){ return; }
    const scope = currentScope || currentTarget.dataset?.fontScope || null;
    const key = currentKey || currentTarget.dataset?.fontKey || null;
    const dataset = currentTarget.dataset || {};
    const explicitEditable = dataset.fontEditable === '1';
    if(!explicitEditable && !scope && !key){
      logDebug('storeCurrentStyle skipped (no scope/key for implicit node)', {
        text: currentTarget.textContent,
        hasDataset: !!dataset,
      });
      return;
    }
    const storeKey = buildStoreKey(scope, key);
    if(isStyleEmpty(style)){
      styleStore.delete(storeKey);
      broadcastStyle(storeKey, null, currentTarget);
      logDebug('storeCurrentStyle cleared', { scope, key, style });
    } else {
      const clone = Object.assign({}, style);
      styleStore.set(storeKey, clone);
      broadcastStyle(storeKey, clone, currentTarget);
      logDebug('storeCurrentStyle saved', { scope, key, style });
    }
  }

  function syncPanelStateFromTarget(){
    if(!panelEl || !currentTarget){ return; }
    const computed = global.getComputedStyle(currentTarget);
    const attrFamily = currentTarget.getAttribute('font-family') || computed.fontFamily || '';
    const attrWeight = currentTarget.getAttribute('font-weight') || computed.fontWeight || '';
    const attrStyle = currentTarget.getAttribute('font-style') || computed.fontStyle || '';
    const attrSize = currentTarget.getAttribute('font-size') || computed.fontSize || '';
    const attrFill = currentTarget.getAttribute('fill') || computed.fill || '#000000';
    const sanitizedFamily = attrFamily.replace(/"/g, '').trim();
    if(fontInput){
      fontInput.value = sanitizedFamily;
    }
    syncFontSelectValue(sanitizedFamily, { source: 'target-sync' });
    if(colorInput){
      colorInput.value = parseColorToHex(attrFill);
    }
    if(sizeInput){
      const sizeNum = parseFloat(String(attrSize).replace(/px$/, ''));
      sizeInput.value = Number.isFinite(sizeNum) ? String(sizeNum) : '';
    }
    if(boldToggle){
      const boldActive = /bold|700|800|900/.test(String(attrWeight));
      boldToggle.setAttribute('aria-pressed', boldActive ? 'true' : 'false');
      boldToggle.dataset.active = boldActive ? '1' : '0';
    }
    if(italicToggle){
      const italicActive = /italic|oblique/.test(String(attrStyle));
      italicToggle.setAttribute('aria-pressed', italicActive ? 'true' : 'false');
      italicToggle.dataset.active = italicActive ? '1' : '0';
    }
    updatePanelContext();
    updatePreviewText();
    updatePreviewFromInputs();
    logDebug('syncPanelStateFromTarget', {
      text: currentTarget.textContent,
      fontFamily: fontInput?.value || null,
      fill: colorInput?.value || null,
      bold: boldToggle?.dataset?.active === '1',
      italic: italicToggle?.dataset?.active === '1'
    });
  }

  function ensurePanel(){
    if(panelEl || !global.document){ return panelEl; }
    const doc = global.document;
    panelEl = doc.createElement('div');
    panelEl.className = 'font-controls-panel';
    panelEl.setAttribute('role', 'toolbar');
    panelEl.setAttribute('aria-label', 'Font controls');
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.hidden = true;
    if(panelEl.dataset.scope){
      delete panelEl.dataset.scope;
    }

    const header = doc.createElement('div');
    header.className = 'font-controls-panel__header';

    closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'font-controls-panel__close';
    closeBtn.setAttribute('aria-label', 'Close font controls');
    closeBtn.textContent = '×';

    header.appendChild(closeBtn);
    panelEl.appendChild(header);

    const body = doc.createElement('div');
    body.className = 'font-controls-panel__body';

    const controlsRow = doc.createElement('div');
    controlsRow.className = 'font-controls-panel__controls';

    const fontField = doc.createElement('label');
    fontField.className = 'font-controls-panel__field';
    const fontLabel = doc.createElement('span');
    fontLabel.className = 'font-controls-panel__field-label';
    fontLabel.textContent = 'Font family';
    fontField.appendChild(fontLabel);

    const selectWrapper = doc.createElement('div');
    selectWrapper.className = 'font-controls-panel__select-wrapper';
    fontSelect = doc.createElement('select');
    fontSelect.className = 'font-controls-panel__select';
    const defaultOption = doc.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Match chart default';
    fontSelect.appendChild(defaultOption);
    const uniqueFonts = Array.from(new Set(DEFAULT_FONTS));
    uniqueFonts.forEach(fontName => {
      const option = doc.createElement('option');
      option.value = fontName;
      option.textContent = fontName;
      fontSelect.appendChild(option);
    });
    const customOption = doc.createElement('option');
    customOption.value = '__custom__';
    customOption.textContent = 'Custom font…';
    fontSelect.appendChild(customOption);
    selectWrapper.appendChild(fontSelect);
    fontField.appendChild(selectWrapper);

    customInputWrapper = doc.createElement('div');
    customInputWrapper.className = 'font-controls-panel__custom-input font-controls-panel__custom-input--hidden';
    fontInput = doc.createElement('input');
    fontInput.type = 'text';
    fontInput.className = 'font-controls-panel__input';
    fontInput.placeholder = 'Enter custom font';
    customInputWrapper.appendChild(fontInput);
    fontField.appendChild(customInputWrapper);
    controlsRow.appendChild(fontField);

    const sizeField = doc.createElement('label');
    sizeField.className = 'font-controls-panel__field';
    const sizeLabel = doc.createElement('span');
    sizeLabel.className = 'font-controls-panel__field-label';
    sizeLabel.textContent = 'Font size';
    sizeInput = doc.createElement('input');
    sizeInput.type = 'number';
    sizeInput.min = '6';
    sizeInput.max = '96';
    sizeInput.step = '0.5';
    sizeInput.placeholder = '14';
    sizeInput.className = 'font-controls-panel__input font-controls-panel__input--number';
    sizeField.appendChild(sizeLabel);
    sizeField.appendChild(sizeInput);
    controlsRow.appendChild(sizeField);

    const colorField = doc.createElement('label');
    colorField.className = 'font-controls-panel__field';
    const colorLabel = doc.createElement('span');
    colorLabel.className = 'font-controls-panel__field-label';
    colorLabel.textContent = 'Color';
    colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'font-controls-panel__color-input';
    colorField.appendChild(colorLabel);
    colorField.appendChild(colorInput);
    controlsRow.appendChild(colorField);

    const emphasisLabel = doc.createElement('span');
    emphasisLabel.className = 'font-controls-panel__field-label';
    emphasisLabel.textContent = 'Emphasis';
    const chipRow = doc.createElement('div');
    chipRow.className = 'font-controls-panel__chips';

    boldToggle = doc.createElement('button');
    boldToggle.type = 'button';
    boldToggle.className = 'font-controls-panel__chip font-controls-panel__toggle';
    boldToggle.dataset.active = '0';
    boldToggle.setAttribute('aria-pressed', 'false');
    boldToggle.setAttribute('title', 'Toggle bold');
    const boldIcon = doc.createElement('span');
    boldIcon.className = 'font-controls-panel__chip-icon';
    boldIcon.textContent = 'B';
    const boldText = doc.createElement('span');
    boldText.textContent = 'Bold';
    boldToggle.appendChild(boldIcon);
    boldToggle.appendChild(boldText);

    italicToggle = doc.createElement('button');
    italicToggle.type = 'button';
    italicToggle.className = 'font-controls-panel__chip font-controls-panel__toggle';
    italicToggle.dataset.active = '0';
    italicToggle.setAttribute('aria-pressed', 'false');
    italicToggle.setAttribute('title', 'Toggle italic');
    const italicIcon = doc.createElement('span');
    italicIcon.className = 'font-controls-panel__chip-icon';
    italicIcon.textContent = 'I';
    const italicText = doc.createElement('span');
    italicText.textContent = 'Italic';
    italicToggle.appendChild(italicIcon);
    italicToggle.appendChild(italicText);

    greekBtn = doc.createElement('button');
    greekBtn.type = 'button';
    greekBtn.className = 'font-controls-panel__chip font-controls-panel__chip--action';
    greekBtn.setAttribute('title', 'Convert Latin a/A characters to Greek α/Α');
    const greekIcon = doc.createElement('span');
    greekIcon.className = 'font-controls-panel__chip-icon';
    greekIcon.textContent = 'α';
    const greekText = doc.createElement('span');
    greekText.textContent = 'Greekify';
    greekBtn.appendChild(greekIcon);
    greekBtn.appendChild(greekText);

    chipRow.appendChild(boldToggle);
    chipRow.appendChild(italicToggle);
    chipRow.appendChild(greekBtn);

    const emphasisContainer = doc.createElement('div');
    emphasisContainer.className = 'font-controls-panel__section';
    emphasisContainer.appendChild(emphasisLabel);
    emphasisContainer.appendChild(chipRow);
    controlsRow.appendChild(emphasisContainer);

    body.appendChild(controlsRow);

    panelEl.appendChild(body);

    const footer = doc.createElement('div');
    footer.className = 'font-controls-panel__footer';
    footer.textContent = 'Changes cascade to every element in the selected group.';
    panelEl.appendChild(footer);

    updatePanelContext();
    console.debug('Debug: font controls compact layout ready', { sections: controlsRow.children.length }); // Debug: layout ready

    updatePreviewText();
    updatePreviewFromInputs();

    if(typeof Shared.attachColorPickerNear === 'function'){
      Shared.attachColorPickerNear(colorInput);
    }

    const commitFontFamily = (rawValue, meta) => {
      if(!currentTarget){ return; }
      const value = (rawValue || '').trim();
      if(value){
        currentTarget.setAttribute('font-family', value);
      } else {
        currentTarget.removeAttribute('font-family');
      }
      const style = {
        fontFamily: value || null,
        fontWeight: currentTarget.getAttribute('font-weight') || null,
        fontStyle: currentTarget.getAttribute('font-style') || null,
        fontSize: currentTarget.getAttribute('font-size') || null,
        fill: currentTarget.getAttribute('fill') || colorInput.value
      };
      storeCurrentStyle(style);
      updatePreviewFromInputs();
      logDebug('font family committed', {
        value: value || null,
        source: meta?.source || 'unknown',
        text: currentTarget.textContent
      });
    };

    if(fontSelect){
      fontSelect.addEventListener('change', () => {
        if(!currentTarget){ return; }
        const selected = fontSelect.value;
        if(selected === '__custom__'){
          toggleCustomFontInput(true);
          if(fontInput){ fontInput.focus(); }
          logDebug('font select custom activated', { text: currentTarget.textContent });
          return;
        }
        const applied = selected || '';
        if(fontInput){ fontInput.value = applied; }
        toggleCustomFontInput(false);
        commitFontFamily(applied, { source: 'select-change' });
        syncFontSelectValue(applied, { source: 'select-change' });
        logDebug('font select change', { selected: applied || null, text: currentTarget.textContent });
      });
    }

    fontInput.addEventListener('change', () => {
      if(!currentTarget){ return; }
      const value = fontInput.value.trim();
      commitFontFamily(value, { source: 'input-change' });
      syncFontSelectValue(value, { source: 'input-change' });
    });

    fontInput.addEventListener('input', () => {
      if(fontSelect && fontSelect.value !== '__custom__'){
        fontSelect.value = '__custom__';
      }
      toggleCustomFontInput(true);
      updatePreviewFromInputs();
      logDebug('fontInput input preview', { value: fontInput.value });
    });

    colorInput.addEventListener('input', () => {
      if(!currentTarget) return;
      const val = colorInput.value;
      currentTarget.setAttribute('fill', val);
      const style = {
        fontFamily: currentTarget.getAttribute('font-family') || null,
        fontWeight: currentTarget.getAttribute('font-weight') || null,
        fontStyle: currentTarget.getAttribute('font-style') || null,
        fontSize: currentTarget.getAttribute('font-size') || null,
        fill: val
      };
      storeCurrentStyle(style);
      updatePreviewFromInputs();
      logDebug('colorInput input', { value: val, text: currentTarget.textContent });
    });

    sizeInput.addEventListener('change', () => {
      if(!currentTarget) return;
      const raw = sizeInput.value.trim();
      let val = null;
      if(raw){
        const numeric = parseFloat(raw);
        if(Number.isFinite(numeric)){
          val = `${numeric}px`;
        }
      }
      if(val){
        currentTarget.setAttribute('font-size', val);
      } else {
        currentTarget.removeAttribute('font-size');
      }
      const style = {
        fontFamily: currentTarget.getAttribute('font-family') || null,
        fontWeight: currentTarget.getAttribute('font-weight') || null,
        fontStyle: currentTarget.getAttribute('font-style') || null,
        fontSize: currentTarget.getAttribute('font-size') || null,
        fill: currentTarget.getAttribute('fill') || colorInput.value
      };
      storeCurrentStyle(style);
      updatePreviewFromInputs();
      logDebug('sizeInput change', { value: raw, applied: style.fontSize, text: currentTarget.textContent });
    });

    sizeInput.addEventListener('input', () => {
      updatePreviewFromInputs();
      logDebug('sizeInput input preview', { value: sizeInput.value });
    });

    const toggleHandler = (btn, attr, activeValue) => {
      btn.addEventListener('click', () => {
        if(!currentTarget) return;
        const isActive = btn.dataset.active === '1';
        const nextActive = !isActive;
        btn.dataset.active = nextActive ? '1' : '0';
        btn.setAttribute('aria-pressed', nextActive ? 'true' : 'false');
        if(nextActive){
          currentTarget.setAttribute(attr, activeValue);
        } else {
          currentTarget.removeAttribute(attr);
        }
        const style = {
          fontFamily: currentTarget.getAttribute('font-family') || null,
          fontWeight: currentTarget.getAttribute('font-weight') || null,
          fontStyle: currentTarget.getAttribute('font-style') || null,
          fontSize: currentTarget.getAttribute('font-size') || null,
          fill: currentTarget.getAttribute('fill') || colorInput.value
        };
        storeCurrentStyle(style);
        updatePreviewFromInputs();
        logDebug('toggle change', { attr, active: nextActive, text: currentTarget.textContent });
      });
    };

    toggleHandler(boldToggle, 'font-weight', 'bold');
    toggleHandler(italicToggle, 'font-style', 'italic');

    greekBtn.addEventListener('click', () => {
      if(!currentTarget){ return; }
      const original = currentTarget.textContent || '';
      const result = convertLatinStringToGreek(original);
      if(result.changes > 0){
        currentTarget.textContent = result.text;
        updatePreviewText();
        updatePanelContext();
        logDebug('greek conversion applied', {
          before: original,
          after: result.text,
          changes: result.changes
        });
      } else {
        logDebug('greek conversion skipped', { reason: 'no-latin-characters', text: original });
      }
    });

    closeBtn.addEventListener('click', () => {
      closePanel('button');
    });

    doc.addEventListener('keydown', (evt) => {
      if(evt.key === 'Escape'){ closePanel('escape'); }
    });

    doc.addEventListener('click', (evt) => {
      if(!panelEl || panelEl.dataset.open !== '1'){ return; }
      if(panelEl.contains(evt.target)){ return; }
      if(currentTarget && evt.target === currentTarget){ return; }
      closePanel('outside');
    });

    logDebug('panel initialized', { fonts: DEFAULT_FONTS.length });
    return panelEl;
  }

  function closePanel(reason){
    if(!panelEl){ return; }
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.hidden = true;
    if(activeHost && panelEl.parentElement === activeHost){
      hideToolbarHost(activeHost);
      activeHost = null;
    }
    if(colorInput){
      colorInput.__fontControlsAvoidRect = null;
    }
    toggleCustomFontInput(false);
    currentTarget = null;
    currentScope = null;
    currentKey = null;
    logDebug('panel closed', { reason });
  }

  function openPanelForTarget(target, options){
    if(!target){ return; }
    ensurePanel();
    currentTarget = target;
    currentScope = options?.scopeId || target.dataset?.fontScope || null;
    currentKey = options?.key || target.dataset?.fontKey || null;
    if(!panelEl){ return; }
    const host = resolveToolbarHost(currentScope);
    if(host){
      if(activeHost && activeHost !== host){
        hideToolbarHost(activeHost);
      }
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      activeHost = host;
      showToolbarHost(host);
    } else {
      if(activeHost){
        hideToolbarHost(activeHost);
      }
      activeHost = null;
      logDebug('panel host unavailable', { scope: currentScope, key: currentKey });
    }

    panelEl.style.display = 'flex';
    panelEl.hidden = false;
    panelEl.setAttribute('aria-hidden', 'false');
    panelEl.dataset.open = '1';
    panelEl.style.left = '';
    panelEl.style.top = '';
    if(currentScope){
      panelEl.dataset.scope = currentScope;
    } else {
      delete panelEl.dataset.scope;
    }

    const rect = target.getBoundingClientRect();
    if(colorInput){
      colorInput.__fontControlsAvoidRect = {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      };
      logDebug('color avoid rect updated', {
        targetTop: rect.top,
        targetLeft: rect.left,
        width: rect.width,
        height: rect.height
      });
    }

    syncPanelStateFromTarget();
    logDebug('panel opened', {
      scope: currentScope,
      key: currentKey,
      text: target.textContent,
      hostScope: activeHost?.dataset?.fontToolbarScope || null
    });
  }

  function handleSvgClick(evt){
    const target = evt.target;
    if(!target || target.tagName?.toLowerCase() !== 'text'){ return; }
    const editableFlag = target.dataset?.fontEditable;
    if(editableFlag === '0'){ return; }
    const isEditable = editableFlag === '1' || typeof editableFlag === 'undefined';
    if(!isEditable){ return; }
    const svg = evt.currentTarget;
    const scope = target.dataset?.fontScope || svgScopeMap.get(svg) || null;
    const key = target.dataset?.fontKey || null;
    openPanelForTarget(target, { scopeId: scope, key });
  }

  function enableForSvg(svg, options){
    if(!svg){
      logDebug('enableForSvg skipped', { reason: 'no-svg' });
      return;
    }
    const scopeId = options?.scopeId || svg.dataset?.fontScope || svg.id || null;
    svgScopeMap.set(svg, scopeId);
    if(svgRegistry.has(svg)){ return; }
    svg.addEventListener('click', handleSvgClick, true);
    svgRegistry.add(svg);
    logDebug('enableForSvg attached', {
      scopeId,
      hasDatasetScope: !!svg.dataset?.fontScope,
      nodeName: svg.nodeName
    });
  }

  function markText(node, options){
    if(!node){ return; }
    const scopeId = options?.scopeId || node.dataset?.fontScope || null;
    const role = options?.role || null;
    const key = options?.key || role || null;
    if(node.dataset){
      node.dataset.fontEditable = '1';
      if(scopeId){ node.dataset.fontScope = scopeId; }
      if(role){ node.dataset.fontRole = role; }
      if(key){ node.dataset.fontKey = key; }
    }
    const storeKey = buildStoreKey(scopeId, key);
    registerNodeForKey(node, storeKey);
    if(styleStore.has(storeKey)){
      applyStyleToNode(node, styleStore.get(storeKey));
    }
    logDebug('markText applied', { scopeId, role, key, text: node?.textContent });
  }

  function applySavedStyle(node){
    if(!node){ return; }
    const scopeId = node.dataset?.fontScope || null;
    const key = node.dataset?.fontKey || null;
    const storeKey = buildStoreKey(scopeId, key);
    if(styleStore.has(storeKey)){
      applyStyleToNode(node, styleStore.get(storeKey));
    }
  }

  fontControls.ensurePanel = ensurePanel;
  fontControls.enableForSvg = enableForSvg;
  fontControls.markText = markText;
  fontControls.openForElement = openPanelForTarget;
  fontControls.applySavedStyle = applySavedStyle;
  fontControls.close = closePanel;

  ensurePanel();
})(typeof window !== 'undefined' ? window : globalThis);
