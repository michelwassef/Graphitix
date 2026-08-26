(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.colorSchemes = Shared.colorSchemes || {};

  const DEFAULT_SCHEME_ID = 'scientific';
  const CUSTOM_SCHEME_ID = 'custom';
  const COLOR_SCHEME_DATA_KEY_SCAN_ROW_LIMIT = 5000;
  const BASE_SCHEME_OPTION_IDS = Object.freeze(['scientific', 'soft', 'normal', 'grayscale', 'colorblind', 'dark']);
  const SURFACE_SCHEME_OPTION_IDS = Object.freeze(['surface-viridis', 'surface-plasma', 'surface-magma', 'surface-turbo', 'surface-bluered', 'surface-grayscale', 'dark']);
  const TYPE_DEFAULT_SCHEME_IDS = Object.freeze({
    box: 'grayscale',
    surface: 'surface-viridis'
  });
  const DEFAULT_CLASSIC_CATEGORICAL = (() => {
    const fromShared = Array.isArray(Shared?.palette?.DEFAULT_SCATTER_COLORS) && Shared.palette.DEFAULT_SCATTER_COLORS.length
      ? Shared.palette.DEFAULT_SCATTER_COLORS
      : null;
    const fromGlobal = Array.isArray(global.DEFAULT_SCATTER_COLORS) && global.DEFAULT_SCATTER_COLORS.length
      ? global.DEFAULT_SCATTER_COLORS
      : null;
    const fallback = ['#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#800080', '#00a6d6', '#8b4513', '#ff1493', '#666666'];
    const source = fromShared || fromGlobal || fallback;
    return source.slice();
  })();
  const DEFAULT_SCIENTIFIC_TOKENS = Object.freeze({
    axisColor: '#000000',
    gridColor: '#dddddd',
    borderColor: '#000000',
    textColor: '#000000',
    background: '#ffffff'
  });
  const SURFACE_LIGHT_TOKENS = Object.freeze({
    axisColor: '#3b3b3b',
    gridColor: '#dddddd',
    borderColor: '#3b3b3b',
    textColor: '#000000',
    background: '#ffffff'
  });
  const DEFAULT_BOX_CLASSIC_CATEGORICAL = Object.freeze([
    '#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#800080', '#00a6d6', '#8b4513', '#ff1493'
  ]);
  const DEFAULT_BOX_GRAYSCALE_FILL = '#7A7A7A';
  const DEFAULT_BOX_GRAYSCALE_CATEGORICAL = Object.freeze([
    DEFAULT_BOX_GRAYSCALE_FILL, '#4d4d4d', '#a6a6a6', '#000000', '#c9c9c9', '#e0e0e0'
  ]);
  const DEFAULT_HIST_DISTRIBUTION_COLORS = Object.freeze([
    '#ff0000', '#00aa00', '#ff8c00', '#800080', '#00a6d6'
  ]);
  const DEFAULT_HEATMAP_DIVERGING = Object.freeze({
    negative: '#0000ff',
    zero: '#ffffff',
    positive: '#ff0000'
  });
  const DEFAULT_VENN_SCIENTIFIC = Object.freeze({
    colorA: '#0000ff',
    colorB: '#ff0000',
    colorC: '#00aa00',
    borderColor: '#000000',
    upset: Object.freeze({
      barColor: '#000000',
      setBarColor: '#000000',
      dotColor: '#000000',
      inactiveDotColor: '#cfcfcf',
      gridColor: '#e5e7eb',
      axisColor: '#000000'
    })
  });
  const SCIENTIFIC_TYPE_DEFAULTS = Object.freeze({
    box: Object.freeze({
      fill: '#0000ff',
      border: '#000000',
      summaryColor: '#ff0000',
      significanceColor: '#000000',
      categorical: DEFAULT_BOX_CLASSIC_CATEGORICAL
    }),
    scatter: Object.freeze({
      fill: '#0000ff',
      border: '#000000',
      overlayTrend: '#ff0000',
      overlayConfidence: '#ff8c00',
      overlayPrediction: '#00aa00',
      categorical: Object.freeze(DEFAULT_CLASSIC_CATEGORICAL.slice())
    }),
    pca: Object.freeze({
      fill: '#0000ff',
      border: '#000000',
      categorical: Object.freeze(DEFAULT_CLASSIC_CATEGORICAL.slice())
    }),
    line: Object.freeze({
      fill: '#0000ff',
      border: '#0000ff',
      categorical: Object.freeze(DEFAULT_CLASSIC_CATEGORICAL.slice())
    }),
    roc: Object.freeze({
      categorical: Object.freeze(DEFAULT_CLASSIC_CATEGORICAL.slice())
    }),
    survival: Object.freeze({
      categorical: Object.freeze(DEFAULT_CLASSIC_CATEGORICAL.slice())
    }),
    pie: Object.freeze({
      borderColor: '#ffffff',
      categorical: Object.freeze(DEFAULT_CLASSIC_CATEGORICAL.slice())
    }),
    hist: Object.freeze({
      fill: '#0000ff',
      border: '#000000',
      distributionColors: DEFAULT_HIST_DISTRIBUTION_COLORS,
      categorical: Object.freeze(DEFAULT_CLASSIC_CATEGORICAL.slice())
    }),
    heatmap: Object.freeze({
      diverging: DEFAULT_HEATMAP_DIVERGING,
      dendrogramColor: '#3d3d3d'
    }),
    surface: Object.freeze({
      surfaceRamp: 'viridis',
      axisColor: '#3b3b3b',
      textColor: '#000000',
      backgroundColor: '#ffffff'
    }),
    venn: DEFAULT_VENN_SCIENTIFIC
  });
  const SCIENTIFIC_TYPE_CATEGORICAL = Object.freeze({
    box: SCIENTIFIC_TYPE_DEFAULTS.box.categorical,
    scatter: SCIENTIFIC_TYPE_DEFAULTS.scatter.categorical,
    pca: SCIENTIFIC_TYPE_DEFAULTS.pca.categorical,
    line: SCIENTIFIC_TYPE_DEFAULTS.line.categorical,
    roc: SCIENTIFIC_TYPE_DEFAULTS.roc.categorical,
    survival: SCIENTIFIC_TYPE_DEFAULTS.survival.categorical,
    pie: SCIENTIFIC_TYPE_DEFAULTS.pie.categorical,
    hist: SCIENTIFIC_TYPE_DEFAULTS.hist.categorical,
    venn: Object.freeze([
      DEFAULT_VENN_SCIENTIFIC.colorA,
      DEFAULT_VENN_SCIENTIFIC.colorB,
      DEFAULT_VENN_SCIENTIFIC.colorC
    ])
  });

  const SCHEMES = Object.freeze({
    scientific: Object.freeze({
      id: 'scientific',
      label: 'Color (high contrast)',
      categorical: Object.freeze(DEFAULT_CLASSIC_CATEGORICAL),
      sequential: Object.freeze(['#0000ff', '#4f4fff', '#ff0000', '#00aa00', '#ff8c00', '#800080']),
      diverging: DEFAULT_HEATMAP_DIVERGING,
      tokens: DEFAULT_SCIENTIFIC_TOKENS,
      densityPalette: 'viridis',
      surfaceRamp: 'viridis'
    }),
    soft: Object.freeze({
      id: 'soft',
      label: 'Color (soft)',
      categorical: Object.freeze(['#4e79a7', '#e15759', '#59a14f', '#f28e2b', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7', '#9c755f']),
      sequential: Object.freeze(['#2f4b7c', '#4e79a7', '#76b7b2', '#a0cbe8', '#f4b183', '#e15759']),
      diverging: Object.freeze({ negative: '#4e79a7', zero: '#f7f7f7', positive: '#e15759' }),
      tokens: Object.freeze({ axisColor: '#222222', gridColor: '#d8d8d8', borderColor: '#222222', textColor: '#222222', background: '#ffffff' }),
      densityPalette: 'cividis',
      surfaceRamp: 'viridis'
    }),
    normal: Object.freeze({
      id: 'normal',
      label: 'Color (normal)',
      categorical: Object.freeze(['#377eb8', '#e41a1c', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999']),
      sequential: Object.freeze(['#377eb8', '#e41a1c', '#4daf4a', '#984ea3', '#ff7f00', '#a65628']),
      diverging: Object.freeze({ negative: '#377eb8', zero: '#f7f7f7', positive: '#e41a1c' }),
      tokens: Object.freeze({ axisColor: '#111111', gridColor: '#d4d4d4', borderColor: '#111111', textColor: '#111111', background: '#ffffff' }),
      densityPalette: 'viridis',
      surfaceRamp: 'viridis'
    }),
    grayscale: Object.freeze({
      id: 'grayscale',
      label: 'Grayscale',
      categorical: Object.freeze(['#000000', '#333333', '#555555', '#777777', '#999999', '#b3b3b3', '#cccccc', '#e0e0e0', '#f0f0f0']),
      sequential: Object.freeze(['#000000', '#2e2e2e', '#525252', '#737373', '#969696', '#bdbdbd', '#e0e0e0']),
      diverging: Object.freeze({ negative: '#7a7a7a', zero: '#ffffff', positive: '#000000' }),
      tokens: Object.freeze({ axisColor: '#000000', gridColor: '#d0d0d0', borderColor: '#000000', textColor: '#000000', background: '#ffffff' }),
      densityPalette: 'grayscale',
      surfaceRamp: 'grayscale'
    }),
    colorblind: Object.freeze({
      id: 'colorblind',
      label: 'Color Blind Safe',
      categorical: Object.freeze(['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00', '#56b4e9', '#000000', '#999999', '#f0e442']),
      sequential: Object.freeze(['#00204c', '#17355e', '#3d5a73', '#657f88', '#91a79c', '#c1d1af', '#f6fbd1']),
      diverging: Object.freeze({ negative: '#0072b2', zero: '#f7f7f7', positive: '#d55e00' }),
      tokens: Object.freeze({ axisColor: '#111111', gridColor: '#d0d0d0', borderColor: '#111111', textColor: '#111111', background: '#ffffff' }),
      densityPalette: 'cividis',
      surfaceRamp: 'viridis'
    }),
    dark: Object.freeze({
      id: 'dark',
      label: 'Dark Theme',
      categorical: Object.freeze(['#4db6ff', '#ffb74d', '#81c784', '#ef9a9a', '#ba68c8', '#4dd0e1', '#ffd54f', '#f48fb1', '#aed581']),
      sequential: Object.freeze(['#132b43', '#1d4e89', '#2a9d8f', '#52b788', '#95d5b2', '#d8f3dc']),
      diverging: Object.freeze({ negative: '#4f83cc', zero: '#303030', positive: '#ef6f6c' }),
      tokens: Object.freeze({ axisColor: '#e6e6e6', gridColor: '#5b5b5b', borderColor: '#e6e6e6', textColor: '#f2f2f2', background: '#000000' }),
      densityPalette: 'inferno',
      surfaceRamp: 'magma'
    }),
    'surface-viridis': Object.freeze({
      id: 'surface-viridis',
      label: 'Viridis',
      categorical: Object.freeze(['#440154', '#3b528b', '#21908d', '#5dc863', '#fde725']),
      sequential: Object.freeze(['#440154', '#3b528b', '#21908d', '#5dc863', '#fde725']),
      diverging: Object.freeze({ negative: '#440154', zero: '#21908d', positive: '#fde725' }),
      tokens: SURFACE_LIGHT_TOKENS,
      densityPalette: 'viridis',
      surfaceRamp: 'viridis'
    }),
    'surface-plasma': Object.freeze({
      id: 'surface-plasma',
      label: 'Plasma',
      categorical: Object.freeze(['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921']),
      sequential: Object.freeze(['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921']),
      diverging: Object.freeze({ negative: '#0d0887', zero: '#b12a90', positive: '#f0f921' }),
      tokens: SURFACE_LIGHT_TOKENS,
      densityPalette: 'plasma',
      surfaceRamp: 'plasma'
    }),
    'surface-magma': Object.freeze({
      id: 'surface-magma',
      label: 'Magma',
      categorical: Object.freeze(['#0c081b', '#2a115b', '#5c1f78', '#933d6c', '#c75b54', '#f48834', '#fbf671']),
      sequential: Object.freeze(['#0c081b', '#2a115b', '#5c1f78', '#933d6c', '#c75b54', '#f48834', '#fbf671']),
      diverging: Object.freeze({ negative: '#0c081b', zero: '#5c1f78', positive: '#fbf671' }),
      tokens: SURFACE_LIGHT_TOKENS,
      densityPalette: 'magma',
      surfaceRamp: 'magma'
    }),
    'surface-turbo': Object.freeze({
      id: 'surface-turbo',
      label: 'Turbo',
      categorical: Object.freeze(['#30123b', '#4145ab', '#2f9df4', '#43ecb0', '#fde54c', '#f45f2a', '#821529']),
      sequential: Object.freeze(['#30123b', '#4145ab', '#2f9df4', '#43ecb0', '#fde54c', '#f45f2a', '#821529']),
      diverging: Object.freeze({ negative: '#30123b', zero: '#43ecb0', positive: '#f45f2a' }),
      tokens: SURFACE_LIGHT_TOKENS,
      densityPalette: 'turbo',
      surfaceRamp: 'turbo'
    }),
    'surface-bluered': Object.freeze({
      id: 'surface-bluered',
      label: 'Blue-Red',
      categorical: Object.freeze(['#1f77b4', '#6baed6', '#c7e9ff', '#fee0d2', '#fcbba1', '#ef3b2c']),
      sequential: Object.freeze(['#1f77b4', '#6baed6', '#c7e9ff', '#fee0d2', '#fcbba1', '#ef3b2c']),
      diverging: Object.freeze({ negative: '#1f77b4', zero: '#c7e9ff', positive: '#ef3b2c' }),
      tokens: SURFACE_LIGHT_TOKENS,
      densityPalette: 'bluered',
      surfaceRamp: 'bluered'
    }),
    'surface-grayscale': Object.freeze({
      id: 'surface-grayscale',
      label: 'Grayscale',
      categorical: Object.freeze(['#000000', '#2e2e2e', '#525252', '#737373', '#969696', '#bdbdbd', '#e0e0e0', '#ffffff']),
      sequential: Object.freeze(['#000000', '#2e2e2e', '#525252', '#737373', '#969696', '#bdbdbd', '#e0e0e0', '#ffffff']),
      diverging: Object.freeze({ negative: '#000000', zero: '#737373', positive: '#ffffff' }),
      tokens: SURFACE_LIGHT_TOKENS,
      densityPalette: 'grayscale',
      surfaceRamp: 'grayscale'
    })
  });

  const TYPE_TO_PAGE = Object.freeze({
    venn: { pageId: 'vennPage', panelSelector: '.config-panel' },
    box: { pageId: 'boxPage', panelSelector: '.config-panel' },
    scatter: { pageId: 'scatterPage', panelSelector: '.config-panel' },
    pca: { pageId: 'pcaPage', panelSelector: '.config-panel' },
    line: { pageId: 'linePage', panelSelector: '.config-panel' },
    heatmap: { pageId: 'heatmapPage', panelSelector: '.config-panel' },
    surface: { pageId: 'surfacePage', panelSelector: '.config-panel' },
    roc: { pageId: 'rocPage', panelSelector: '.config-panel' },
    survival: { pageId: 'survivalPage', panelSelector: '.config-panel' },
    hist: { pageId: 'histPage', panelSelector: '.config-panel' },
    pie: { pageId: 'piePage', panelSelector: '.config-panel' }
  });

  const state = {
    initialized: false,
    controlsByType: {},
    activeTabObserver: null,
    lastActiveSignature: null,
    pendingSyncTimer: null,
    lifecycleSyncAttached: false,
    controlListenersBound: false,
    darkTextObservers: new WeakMap()
  };
  let openPaletteMenu = null;
  let pendingPaletteChoice = null;

  function getDefaultSchemeIdForType(type){
    return TYPE_DEFAULT_SCHEME_IDS[type] || DEFAULT_SCHEME_ID;
  }

  const colorSchemeAsyncOwners = {};

  function getColorSchemeAsyncOwner(type){
    const key = String(type || 'colorSchemes').trim() || 'colorSchemes';
    colorSchemeAsyncOwners[key] = colorSchemeAsyncOwners[key] || { __componentKey: key };
    return colorSchemeAsyncOwners[key];
  }

  function scheduleColorSchemeTimeout(type, tabId, reason, fn, delay = 0){
    if(typeof fn !== 'function'){
      return null;
    }
    return Shared.componentLifecycle?.scheduleComponentTimeout?.(getColorSchemeAsyncOwner(type), type || 'colorSchemes', {
      tabId,
      reason: reason || 'color-scheme-timeout'
    }, fn, delay) || null;
  }

  function scheduleColorSchemeFrame(type, tabId, reason, fn){
    if(typeof fn !== 'function'){
      return null;
    }
    return Shared.componentLifecycle?.scheduleComponentFrame?.(getColorSchemeAsyncOwner(type), type || 'colorSchemes', {
      tabId,
      reason: reason || 'color-scheme-frame'
    }, fn) || null;
  }

  function isDebugEnabled(){
    try{
      return typeof Shared.isDebugEnabled !== 'function' || Shared.isDebugEnabled();
    }catch(err){
      return true;
    }
  }

  function debugLog(message, payload){
    if(!isDebugEnabled()) return;
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      console.debug(message, payload || {});
    }
  }

  function cloneValue(value){
    if(value === null || value === undefined) return value;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      return value;
    }
  }

  function cloneThemePayload(payload, type){
    const source = payload && typeof payload === 'object' ? payload : {};
    const next = {
      ...source,
      type: source.type || type,
      config: cloneValue(source.config || {}) || {}
    };
    if(source.style && typeof source.style === 'object'){
      next.style = cloneValue(source.style) || {};
    }
    return next;
  }

  function clampHexChannel(numeric){
    const value = Number.isFinite(numeric) ? numeric : 0;
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function hexToRgb(hex){
    if(typeof hex !== 'string') return null;
    const cleaned = hex.trim().replace(/^#/, '');
    if(!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
    return {
      r: parseInt(cleaned.slice(0, 2), 16),
      g: parseInt(cleaned.slice(2, 4), 16),
      b: parseInt(cleaned.slice(4, 6), 16)
    };
  }

  function rgbToHex(rgb){
    if(!rgb) return '#000000';
    const r = clampHexChannel(rgb.r).toString(16).padStart(2, '0');
    const g = clampHexChannel(rgb.g).toString(16).padStart(2, '0');
    const b = clampHexChannel(rgb.b).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function darken(hex, factor){
    const rgb = hexToRgb(hex);
    if(!rgb) return '#000000';
    const f = Number.isFinite(factor) ? factor : 0.22;
    return rgbToHex({
      r: rgb.r * (1 - f),
      g: rgb.g * (1 - f),
      b: rgb.b * (1 - f)
    });
  }



  function relativeLuminance(hex){
    const rgb = hexToRgb(hex);
    if(!rgb) return null;
    const linearize = channel => {
      const srgb = Math.max(0, Math.min(1, channel / 255));
      return srgb <= 0.04045 ? (srgb / 12.92) : Math.pow((srgb + 0.055) / 1.055, 2.4);
    };
    const r = linearize(rgb.r);
    const g = linearize(rgb.g);
    const b = linearize(rgb.b);
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  }



  function deriveDarkerBorderColor(fill, fallback){
    const source = typeof fill === 'string' ? fill : null;
    const luminance = relativeLuminance(source);
    if(luminance === null){
      return typeof fallback === 'string' && fallback ? fallback : '#111111';
    }
    if(luminance > 0.78){
      return darken(source, 0.46);
    }
    return darken(source, 0.34);
  }

  function buildBoxPalette(scheme, categorical, fallback){
    const palette = ensureArray(categorical).slice();
    if(!palette.length){
      if(fallback){
        return [fallback];
      }
      return [];
    }
    return palette;
  }

  function getScheme(id){
    const key = typeof id === 'string' ? id.toLowerCase() : '';
    const catalog = Shared.themeCatalog;
    const fromCatalog = (catalog && typeof catalog.getScheme === 'function')
      ? catalog.getScheme(key, DEFAULT_SCHEME_ID)
      : null;
    return fromCatalog || SCHEMES[key] || SCHEMES[DEFAULT_SCHEME_ID];
  }

  function isKnownSchemeId(id){
    const key = typeof id === 'string' ? id.trim().toLowerCase() : '';
    if(!key) return false;
    const catalog = Shared.themeCatalog;
    if(catalog && typeof catalog.getScheme === 'function'){
      return !!catalog.getScheme(key, null);
    }
    return !!Object.prototype.hasOwnProperty.call(SCHEMES, key);
  }

  function normalizePresetSchemeId(id, type){
    const normalized = typeof id === 'string' ? id.trim().toLowerCase() : '';
    if(normalized === 'highcontrast' || normalized === 'high-contrast' || normalized === 'high_contrast'){
      return 'scientific';
    }
    if(isKnownSchemeId(id)){
      return String(id).trim().toLowerCase();
    }
    return getDefaultSchemeIdForType(type);
  }

  function normalizeSurfaceSchemeId(id){
    const normalized = normalizePresetSchemeId(id, 'surface');
    return SURFACE_SCHEME_OPTION_IDS.includes(normalized) ? normalized : 'surface-viridis';
  }

  function isScientificScheme(scheme){
    return String(scheme?.id || '').toLowerCase() === 'scientific';
  }

  function getScientificDefaults(type){
    return SCIENTIFIC_TYPE_DEFAULTS[type] || null;
  }

  function resolveCategoricalPalette(type, scheme){
    const base = ensureArray(scheme?.categorical);
    if(!base.length){
      return [];
    }
    if(!isScientificScheme(scheme)){
      return base;
    }
    const override = SCIENTIFIC_TYPE_CATEGORICAL[type];
    return Array.isArray(override) && override.length ? override : base;
  }

  function resolveCategoricalPaletteForType(type, options = {}){
    const resolvedType = String(type || '').trim();
    if(!resolvedType){
      return [];
    }
    const payload = options && typeof options.payload === 'object'
      ? options.payload
      : null;
    const payloadScheme = resolvedType === 'venn'
      ? payload?.style?.colorScheme
      : payload?.config?.colorScheme;
    const rawScheme = options.schemeId || payloadScheme || getDefaultSchemeIdForType(resolvedType);
    const normalizedSchemeId = resolvedType === 'surface'
      ? normalizeSurfaceSchemeId(rawScheme)
      : normalizePresetSchemeId(rawScheme, resolvedType);
    const scheme = getScheme(normalizedSchemeId);
    return ensureArray(resolveCategoricalPalette(resolvedType, scheme)).slice();
  }

  function ensureMap(input){
    return input && typeof input === 'object' ? input : {};
  }

  function ensureArray(input){
    return Array.isArray(input) ? input : [];
  }

  function ensureObject(input){
    return input && typeof input === 'object' ? input : {};
  }

  function renderSchemeSwatches(doc, schemeId, options){
    const opts = options || {};
    const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.floor(opts.limit)) : 5;
    const swatches = doc.createElement('span');
    swatches.className = 'color-scheme-picker__swatches';
    if(schemeId === CUSTOM_SCHEME_ID){
      swatches.classList.add('color-scheme-picker__swatches--custom');
      return swatches;
    }
    const scheme = getScheme(schemeId);
    const colors = ensureArray(scheme?.categorical).slice(0, limit);
    colors.forEach(color => {
      const chip = doc.createElement('span');
      chip.className = 'color-scheme-picker__swatch';
      chip.style.background = color;
      chip.title = color;
      swatches.appendChild(chip);
    });
    return swatches;
  }

  function closePaletteMenu(){
    if(!openPaletteMenu) return;
    const menu = openPaletteMenu;
    openPaletteMenu = null;
    menu.hidden = true;
    const owner = menu.__pickerOwner || null;
    if(owner){
      owner.classList.remove('is-open');
      const button = owner.querySelector('.color-scheme-picker__button');
      if(button){
        button.setAttribute('aria-expanded', 'false');
      }
    }
  }

  function syncPickerElement(select, displayedSchemeId){
    if(!select || typeof select.closest !== 'function'){
      return;
    }
    const type = String(select.dataset?.componentType || '').trim();
    if(!type){
      return;
    }
    const safeDisplayed = (type === 'surface')
      ? normalizeSurfaceSchemeId(displayedSchemeId || select.value)
      : String(displayedSchemeId || select.value || '').trim();
    const value = safeDisplayed === CUSTOM_SCHEME_ID ? CUSTOM_SCHEME_ID : getScheme(safeDisplayed).id;
    const picker = select.closest('.config-panel__label')?.querySelector?.('.color-scheme-picker')
      || select.parentElement?.querySelector?.('.color-scheme-picker')
      || null;
    if(!picker){
      return;
    }
    const buttonLabel = picker.querySelector('.color-scheme-picker__label');
    const buttonSwatches = picker.querySelector('.color-scheme-picker__current-swatches');
    const menu = picker.querySelector('.color-scheme-picker__menu');
    const scheme = value === CUSTOM_SCHEME_ID ? null : SCHEMES[value];
    if(buttonLabel){
      buttonLabel.textContent = value === CUSTOM_SCHEME_ID ? 'Custom' : (scheme?.label || 'Color');
    }
    if(buttonSwatches && buttonSwatches.ownerDocument){
      buttonSwatches.className = 'color-scheme-picker__current-swatches';
      if(value === 'dark'){
        buttonSwatches.classList.add('color-scheme-picker__current-swatches--dark-theme');
      }
      buttonSwatches.replaceChildren(renderSchemeSwatches(buttonSwatches.ownerDocument, value, { limit: 4 }));
    }
    if(menu){
      menu.querySelectorAll('.color-scheme-picker__option').forEach(node => {
        const selected = node.dataset?.schemeId === value;
        if(selected){
          node.setAttribute('aria-selected', 'true');
          node.classList.add('is-selected');
        }else{
          node.setAttribute('aria-selected', 'false');
          node.classList.remove('is-selected');
        }
      });
    }
  }

  function openPickerMenu(menu){
    if(!menu){
      return;
    }
    if(openPaletteMenu && openPaletteMenu !== menu){
      closePaletteMenu();
    }
    openPaletteMenu = menu;
    const owner = menu.__pickerOwner || menu.closest?.('.color-scheme-picker') || null;
    if(owner){
      owner.classList.add('is-open');
      const button = owner.querySelector('.color-scheme-picker__button');
      if(button){
        button.setAttribute('aria-expanded', 'true');
      }
    }
    menu.hidden = false;
  }

  function togglePickerMenu(button){
    const picker = button?.closest?.('.color-scheme-picker');
    const menu = picker?.querySelector?.('.color-scheme-picker__menu') || null;
    if(!menu){
      return;
    }
    if(menu.hidden){
      openPickerMenu(menu);
    }else{
      closePaletteMenu();
    }
  }

  function closePaletteChoice(options){
    const pending = pendingPaletteChoice;
    if(!pending){
      return;
    }
    pendingPaletteChoice = null;
    pending.popover.hidden = true;
    if(options?.restore !== false){
      const displayed = resolveDisplayedSchemeIdForType(pending.type, { preferWorkspace: true });
      pending.select.value = displayed;
      syncPickerElement(pending.select, displayed);
    }
    if(options?.focus === true){
      pending.picker.querySelector('.color-scheme-picker__button')?.focus();
    }
  }

  function openPaletteChoice(type, schemeId, select){
    const picker = select?.parentElement?.querySelector?.('.color-scheme-picker') || null;
    const popover = picker?.querySelector?.('[data-color-scheme-choice="1"]') || null;
    if(!picker || !popover){
      return false;
    }
    closePaletteChoice();
    const scheme = getScheme(schemeId);
    const description = popover.querySelector('.color-scheme-picker__choice-description');
    if(description){
      description.textContent = `Apply “${scheme.label}” by:`;
    }
    pendingPaletteChoice = {
      type,
      schemeId: scheme.id,
      select,
      picker,
      popover,
      tabId: getActiveTab()?.id || null
    };
    const displayed = resolveDisplayedSchemeIdForType(type, { preferWorkspace: true });
    select.value = displayed;
    syncPickerElement(select, displayed);
    popover.hidden = false;
    popover.querySelector('[data-color-scheme-choice-action="match"]')?.focus();
    return true;
  }

  function completePaletteChoice(mode){
    const pending = pendingPaletteChoice;
    if(!pending){
      return false;
    }
    const active = getActiveTab();
    if(!active || active.type !== pending.type || String(active.id || '') !== String(pending.tabId || '')){
      closePaletteChoice();
      return false;
    }
    closePaletteChoice({ restore: false });
    const applied = applySchemeToActiveTab(pending.type, pending.schemeId, {
      recordUndo: true,
      colorMode: mode
    });
    const displayed = applied
      ? resolveDisplayedSchemeIdForType(pending.type, { preferWorkspace: true })
      : resolveDisplayedSchemeIdForType(pending.type);
    pending.select.value = displayed;
    syncPickerElement(pending.select, displayed);
    return applied;
  }

  function requestPaletteSelection(type, schemeId, select){
    const scheme = getScheme(schemeId);
    const sourcePayload = getComparisonPayload(type, { preferWorkspace: true });
    const hasCustomDatasetColors = sourcePayload
      ? collectCustomDatasetColorSlots(type, sourcePayload).length > 0
      : false;
    if(hasCustomDatasetColors && type !== 'surface'){
      return openPaletteChoice(type, scheme.id, select);
    }
    const applied = applySchemeToActiveTab(type, scheme.id, {
      recordUndo: true,
      colorMode: 'replace'
    });
    const displayed = resolveDisplayedSchemeIdForType(type, { preferWorkspace: true });
    select.value = displayed;
    syncPickerElement(select, displayed);
    return applied;
  }

  function attachColorSchemeControlListeners(){
    if(state.controlListenersBound){
      return;
    }
    const doc = global.document;
    if(!doc){
      return;
    }
    doc.addEventListener('click', evt => {
      const target = evt.target instanceof global.Element ? evt.target : null;
      if(!target){
        closePaletteMenu();
        closePaletteChoice();
        return;
      }
      const choiceAction = target.closest('[data-color-scheme-choice-action]');
      if(choiceAction){
        const action = String(choiceAction.dataset?.colorSchemeChoiceAction || '');
        if(action === 'cancel'){
          closePaletteChoice({ focus: true });
        }else if(action === 'match' || action === 'replace'){
          completePaletteChoice(action);
        }
        return;
      }
      const optionButton = target.closest('.color-scheme-picker__option');
      if(optionButton){
        if(optionButton.disabled){
          closePaletteMenu();
          return;
        }
        const nextScheme = String(optionButton.dataset?.schemeId || '').trim();
        if(!nextScheme || nextScheme === CUSTOM_SCHEME_ID){
          closePaletteMenu();
          return;
        }
        const menu = optionButton.closest('.color-scheme-picker__menu');
        const owner = menu?.__pickerOwner || menu?.closest?.('.color-scheme-picker') || null;
        const select = owner?.parentElement?.querySelector?.('select[data-color-scheme-select="1"]') || null;
        if(select){
          requestPaletteSelection(String(select.dataset?.componentType || ''), nextScheme, select);
        }
        closePaletteMenu();
        return;
      }
      const toggleButton = target.closest('[data-color-scheme-toggle="1"]');
      if(toggleButton){
        togglePickerMenu(toggleButton);
        return;
      }
      if(openPaletteMenu && (!target.closest || !target.closest('.color-scheme-picker'))){
        closePaletteMenu();
      }
      if(pendingPaletteChoice && !target.closest('[data-color-scheme-choice="1"]')){
        closePaletteChoice();
      }
    });

    doc.addEventListener('keydown', evt => {
      if(evt.key === 'Escape'){
        if(pendingPaletteChoice){
          closePaletteChoice({ focus: true });
        }else if(openPaletteMenu){
          closePaletteMenu();
        }
      }
    });

    doc.addEventListener('change', evt => {
      const select = evt.target instanceof global.Element
        ? evt.target.closest('select[data-color-scheme-select="1"]')
        : null;
      if(!select){
        return;
      }
      const type = String(select.dataset?.componentType || '').trim();
      if(!type){
        return;
      }
      if(type === 'surface'){
        const selectedSurface = normalizeSurfaceSchemeId(select.value);
        requestPaletteSelection(type, selectedSurface, select);
        return;
      }
      if(select.value === CUSTOM_SCHEME_ID){
        const displayed = resolveDisplayedSchemeIdForType(type);
        select.value = displayed;
        syncPickerElement(select, displayed);
        return;
      }
      const selected = getScheme(select.value).id;
      requestPaletteSelection(type, selected, select);
    });

    state.controlListenersBound = true;
  }

  function uniqueStrings(values){
    const out = [];
    const seen = new Set();
    ensureArray(values).forEach(value => {
      if(value === null || value === undefined) return;
      const key = String(value).trim();
      if(!key || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    return out;
  }

  function getMatrixRowCount(matrix){
    return Array.isArray(matrix) ? matrix.length : 0;
  }

  function shouldScanMatrixColorKeys(matrix, options){
    const opts = options || {};
    const rowLimit = Number.isFinite(Number(opts.rowLimit))
      ? Math.max(0, Number(opts.rowLimit))
      : COLOR_SCHEME_DATA_KEY_SCAN_ROW_LIMIT;
    return rowLimit <= 0 || getMatrixRowCount(matrix) <= rowLimit;
  }

  function collectUniqueColumnValues(matrix, colIndex, options){
    const rows = ensureArray(matrix);
    const opts = options || {};
    if(!shouldScanMatrixColorKeys(rows, opts)){
      debugLog('Debug: colorSchemes skipped large matrix key scan', {
        rowCount: rows.length,
        colIndex,
        rowLimit: Number.isFinite(Number(opts.rowLimit)) ? Number(opts.rowLimit) : COLOR_SCHEME_DATA_KEY_SCAN_ROW_LIMIT
      });
      return [];
    }
    const start = Number.isFinite(opts.startRow) ? opts.startRow : 1;
    const out = [];
    const seen = new Set();
    for(let i = start; i < rows.length; i += 1){
      const row = rows[i];
      if(!Array.isArray(row)) continue;
      const raw = row[colIndex];
      if(raw === null || raw === undefined) continue;
      const value = String(raw).trim();
      if(!value) continue;
      if(seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }

  function buildColorMap(keys, palette){
    const out = {};
    const list = uniqueStrings(keys);
    const colors = ensureArray(palette);
    if(!colors.length) return out;
    list.forEach((key, index) => {
      if(!key) return;
      out[key] = colors[index % colors.length];
    });
    return out;
  }

  function inferLineSeriesNames(matrix){
    const rows = ensureArray(matrix);
    if(!rows.length || !Array.isArray(rows[0])) return [];
    const header = rows[0];
    const names = [];
    const seen = new Set();
    for(let i = 1; i < header.length; i += 1){
      const value = header[i] == null ? '' : String(header[i]).trim();
      if(!value) continue;
      if(seen.has(value)) continue;
      seen.add(value);
      names.push(value);
    }
    return names;
  }

  function inferPcaSampleLabelKeys(matrix, config){
    const rows = ensureArray(matrix);
    const cfg = ensureObject(config);
    const configuredKeys = Object.keys(ensureMap(cfg.labelColors));
    if(!rows.length){
      return uniqueStrings(configuredKeys);
    }
    const grouped = String(cfg.tableFormat || '').trim().toLowerCase() === 'grouped';
    if(grouped){
      return uniqueStrings(configuredKeys);
    }
    const headerNames = ['variable', 'sample'];
    let header = null;
    const searchLimit = Math.min(rows.length, 3);
    for(let rowIndex = 0; rowIndex < searchLimit; rowIndex += 1){
      const row = rows[rowIndex];
      if(!Array.isArray(row)){
        continue;
      }
      const firstCell = String(row[0] == null ? '' : row[0]).trim().toLowerCase();
      if(headerNames.includes(firstCell)){
        header = row;
        break;
      }
    }
    if(!header){
      const fallbackIndex = rows[0]?.[0] && String(rows[0][0]).trim().toLowerCase() === 'label point' ? 1 : 0;
      header = Array.isArray(rows[fallbackIndex]) ? rows[fallbackIndex] : null;
    }
    if(!header){
      return uniqueStrings(configuredKeys);
    }
    const inferredKeys = uniqueStrings(header.slice(1));
    return inferredKeys.length ? inferredKeys : uniqueStrings(configuredKeys);
  }

  function inferHistogramSeriesKeys(matrix){
    const rows = ensureArray(matrix);
    if(!rows.length){
      return [];
    }
    let columnCount = 0;
    rows.forEach(row => {
      if(Array.isArray(row) && row.length > columnCount){
        columnCount = row.length;
      }
    });
    const keys = [];
    for(let colIndex = 0; colIndex < columnCount; colIndex += 1){
      let hasNumeric = false;
      for(let rowIndex = 1; rowIndex < rows.length; rowIndex += 1){
        const row = rows[rowIndex];
        if(!Array.isArray(row)) continue;
        const numeric = Number.parseFloat(row[colIndex]);
        if(Number.isFinite(numeric)){
          hasNumeric = true;
          break;
        }
      }
      if(hasNumeric){
        keys.push(`col-${colIndex}`);
      }
    }
    return keys;
  }

  function inferSeriesCountFromHeader(matrix){
    const rows = ensureArray(matrix);
    if(!rows.length || !Array.isArray(rows[0])) return 0;
    const width = rows[0].length;
    if(!Number.isFinite(width) || width <= 1) return 0;
    return Math.max(0, width - 1);
  }

  function patchStyleColorFields(style, options){
    const source = ensureObject(style);
    const opts = ensureObject(options);
    const fillColor = typeof opts.fill === 'string' && opts.fill ? opts.fill : null;
    const strokeColor = typeof opts.stroke === 'string' && opts.stroke ? opts.stroke : null;
    const textColor = typeof opts.text === 'string' && opts.text ? opts.text : null;
    const fillFields = uniqueStrings(opts.fillFields || ['fill', 'color', 'markerFill', 'lineColor']);
    const strokeFields = uniqueStrings(opts.strokeFields || ['stroke', 'borderColor', 'markerStroke', 'lineStroke']);
    const textFields = uniqueStrings(opts.textFields || ['textColor', 'labelColor']);
    const force = opts.force === true;
    const out = { ...source };
    if(fillColor){
      fillFields.forEach(field => {
        if(force || Object.prototype.hasOwnProperty.call(out, field)){
          out[field] = fillColor;
        }
      });
    }
    if(strokeColor){
      strokeFields.forEach(field => {
        if(force || Object.prototype.hasOwnProperty.call(out, field)){
          out[field] = strokeColor;
        }
      });
    }
    if(textColor){
      textFields.forEach(field => {
        if(force || Object.prototype.hasOwnProperty.call(out, field)){
          out[field] = textColor;
        }
      });
    }
    return out;
  }

  function clearStyleColorFields(style, options){
    const source = ensureObject(style);
    const opts = ensureObject(options);
    const fillFields = uniqueStrings(opts.fillFields || ['fill', 'color', 'markerFill', 'lineColor']);
    const strokeFields = uniqueStrings(opts.strokeFields || ['stroke', 'borderColor', 'markerStroke', 'lineStroke']);
    const textFields = uniqueStrings(opts.textFields || ['textColor', 'labelColor']);
    const out = { ...source };
    fillFields.forEach(field => {
      if(Object.prototype.hasOwnProperty.call(out, field)){
        delete out[field];
      }
    });
    strokeFields.forEach(field => {
      if(Object.prototype.hasOwnProperty.call(out, field)){
        delete out[field];
      }
    });
    textFields.forEach(field => {
      if(Object.prototype.hasOwnProperty.call(out, field)){
        delete out[field];
      }
    });
    return out;
  }

  function clearStyleMapColorFields(styleMap, options){
    const map = ensureObject(styleMap);
    const out = {};
    Object.keys(map).forEach(key => {
      const style = clearStyleColorFields(map[key], options);
      if(Object.keys(style).length){
        out[key] = style;
      }
    });
    return out;
  }

  function recolorStyleMap(styleMap, keys, palette, options){
    const map = ensureObject(styleMap);
    const keyList = uniqueStrings(keys);
    const colors = ensureArray(palette);
    const out = {};
    if(!keyList.length || !colors.length){
      keyList.forEach(key => {
        out[key] = { ...ensureObject(map[key]) };
      });
      return out;
    }
    keyList.forEach((key, index) => {
      const fillColor = colors[index % colors.length];
      out[key] = patchStyleColorFields(map[key], { ...options, fill: fillColor });
    });
    return out;
  }

  function recolorIndexedStyleMap(styleMap, palette, options){
    const map = ensureObject(styleMap);
    const keys = Object.keys(map);
    if(!keys.length) return map;
    const colors = ensureArray(palette);
    if(!colors.length) return map;
    const out = {};
    keys.forEach((key, position) => {
      const numericKey = Number(key);
      const paletteIndex = Number.isInteger(numericKey) && numericKey >= 0
        ? numericKey
        : position;
      out[key] = patchStyleColorFields(map[key], {
        ...options,
        fill: colors[paletteIndex % colors.length]
      });
    });
    return out;
  }

  function pickSequentialColor(scheme, index, fallback){
    const seq = ensureArray(scheme?.sequential);
    if(seq.length){
      return seq[index % seq.length];
    }
    return fallback;
  }

  function applyHistogramDistributionPalette(cfg, scheme, categorical){
    const palette = ensureArray(categorical).length ? ensureArray(categorical) : ['#444444'];
    const scientificMode = isScientificScheme(scheme);
    cfg.distributions = ensureObject(cfg.distributions);
    const existingOptions = ensureArray(cfg.distributions.options);
    const optionByKey = {};
    existingOptions.forEach(entry => {
      if(!entry || typeof entry !== 'object') return;
      const key = String(entry.key || '').trim();
      if(!key) return;
      optionByKey[key] = { ...entry };
    });
    const selectedKeys = uniqueStrings(
      Object.keys(ensureObject(cfg.distributions.selections))
        .concat(Object.keys(optionByKey))
    );
    const keys = selectedKeys.length ? selectedKeys : ['normal', 'lognormal', 'exponential'];
    cfg.distributions.options = keys.map((key, index) => {
      const previous = optionByKey[key] || {};
      return {
        ...previous,
        key,
        label: previous.label || key,
        color: palette[index % palette.length]
      };
    });

    cfg.overlayStyles = ensureObject(cfg.overlayStyles);
    const trendBase = ensureObject(cfg.overlayStyles.trend);
    const confidenceBase = ensureObject(cfg.overlayStyles.confidence);
    const predictionBase = ensureObject(cfg.overlayStyles.prediction);
    cfg.overlayStyles.trend = {
      ...trendBase,
      color: palette[0] || trendBase.color
    };
    cfg.overlayStyles.confidence = {
      ...confidenceBase,
      color: scientificMode
        ? (palette[1] || confidenceBase.color)
        : pickSequentialColor(scheme, 2, palette[1] || confidenceBase.color)
    };
    cfg.overlayStyles.prediction = {
      ...predictionBase,
      color: scientificMode
        ? (palette[2] || predictionBase.color)
        : pickSequentialColor(scheme, 4, palette[2] || predictionBase.color)
    };
  }

  function applyAxisTokens(config, scheme){
    const cfg = config && typeof config === 'object' ? config : {};
    const tokens = scheme.tokens || {};
    cfg.axis = cfg.axis && typeof cfg.axis === 'object' ? cfg.axis : {};
    if(tokens.axisColor){
      cfg.axis.color = tokens.axisColor;
    }
    if(cfg.gridStyle && typeof cfg.gridStyle === 'object' && tokens.gridColor){
      cfg.gridStyle.color = tokens.gridColor;
    }
    if(tokens.background){
      cfg.backgroundColor = tokens.background;
    }
    if(tokens.textColor){
      cfg.textColor = tokens.textColor;
    }
    return cfg;
  }

  function removeNode(node){
    if(node && node.parentNode){
      try{ node.parentNode.removeChild(node); }catch(err){}
    }
  }







  const NO_PREVIOUS_FILL = '__none__';

  function applyDarkTextTheme(svg, color){
    const nodes = svg.querySelectorAll('text,tspan');
    nodes.forEach(node => {
      if(node.getAttribute('data-color-scheme-text-themed') !== '1'){
        if(node.hasAttribute('fill')){
          node.setAttribute('data-color-scheme-prev-fill', node.getAttribute('fill') || '');
        }else{
          node.setAttribute('data-color-scheme-prev-fill', NO_PREVIOUS_FILL);
        }
        node.setAttribute('data-color-scheme-text-themed', '1');
      }
      node.setAttribute('fill', color);
    });
  }

  function disconnectDarkTextObserver(svg){
    if(!svg || !state.darkTextObservers) return;
    const entry = state.darkTextObservers.get(svg);
    if(!entry) return;
    try{
      entry.observer?.disconnect?.();
    }catch(_err){ /* no-op */ }
    state.darkTextObservers.delete(svg);
  }

  function ensureDarkTextObserver(svg, color){
    if(!svg || typeof svg.querySelectorAll !== 'function' || typeof global.MutationObserver !== 'function'){
      return;
    }
    const existing = state.darkTextObservers.get(svg);
    if(existing && existing.observer){
      existing.color = color;
      return;
    }
    const observerState = { color };
    const observer = new global.MutationObserver(mutations => {
      const nextColor = observerState.color || color;
      for(let i = 0; i < mutations.length; i += 1){
        const mutation = mutations[i];
        if(mutation.type === 'childList'){
          mutation.addedNodes.forEach(node => {
            if(!node || node.nodeType !== 1){ return; }
            const tag = String(node.nodeName || '').toLowerCase();
            if(tag === 'text' || tag === 'tspan'){
              if(node.getAttribute('data-color-scheme-text-themed') !== '1'){
                if(node.hasAttribute('fill')){
                  node.setAttribute('data-color-scheme-prev-fill', node.getAttribute('fill') || '');
                }else{
                  node.setAttribute('data-color-scheme-prev-fill', NO_PREVIOUS_FILL);
                }
                node.setAttribute('data-color-scheme-text-themed', '1');
              }
              if(node.getAttribute('fill') !== nextColor){
                node.setAttribute('fill', nextColor);
              }
            }
            if(typeof node.querySelectorAll === 'function'){
              const nested = node.querySelectorAll('text,tspan');
              nested.forEach(textNode => {
                if(textNode.getAttribute('data-color-scheme-text-themed') !== '1'){
                  if(textNode.hasAttribute('fill')){
                    textNode.setAttribute('data-color-scheme-prev-fill', textNode.getAttribute('fill') || '');
                  }else{
                    textNode.setAttribute('data-color-scheme-prev-fill', NO_PREVIOUS_FILL);
                  }
                  textNode.setAttribute('data-color-scheme-text-themed', '1');
                }
                if(textNode.getAttribute('fill') !== nextColor){
                  textNode.setAttribute('fill', nextColor);
                }
              });
            }
          });
        }else if(mutation.type === 'attributes'){
          const node = mutation.target;
          if(!node || node.nodeType !== 1){ continue; }
          const tag = String(node.nodeName || '').toLowerCase();
          if(tag !== 'text' && tag !== 'tspan'){ continue; }
          if(node.getAttribute('data-color-scheme-text-themed') !== '1'){
            if(node.hasAttribute('fill')){
              node.setAttribute('data-color-scheme-prev-fill', node.getAttribute('fill') || '');
            }else{
              node.setAttribute('data-color-scheme-prev-fill', NO_PREVIOUS_FILL);
            }
            node.setAttribute('data-color-scheme-text-themed', '1');
          }
          if(node.getAttribute('fill') !== nextColor){
            node.setAttribute('fill', nextColor);
          }
        }
      }
    });
    observer.observe(svg, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['fill']
    });
    observerState.observer = observer;
    state.darkTextObservers.set(svg, observerState);
  }

  function restoreTextTheme(svg){
    const nodes = svg.querySelectorAll('text[data-color-scheme-text-themed="1"],tspan[data-color-scheme-text-themed="1"]');
    nodes.forEach(node => {
      const previous = node.getAttribute('data-color-scheme-prev-fill');
      if(previous === NO_PREVIOUS_FILL || previous === null){
        node.removeAttribute('fill');
      }else{
        node.setAttribute('fill', previous);
      }
      node.removeAttribute('data-color-scheme-prev-fill');
      node.removeAttribute('data-color-scheme-text-themed');
    });
  }



  function applySvgVisualTheme(svg, scheme){
    if(!svg || typeof svg.querySelector !== 'function') return;
    const tokens = scheme.tokens || {};
    const isDark = scheme.id === 'dark';
    const background = tokens.background || '#ffffff';
    svg.setAttribute('data-color-scheme', scheme.id);
    const is3dView = String(svg.dataset?.viewMode || '').toLowerCase() === '3d';
    if(svg.style){
      svg.style.removeProperty('background-color');
      svg.style.removeProperty('color');
    }

    let backgroundRect = svg.querySelector('[data-color-scheme-background="1"]');
    if(is3dView){
      // Keep 3D interaction surfaces untouched; draw code handles interactive backgrounds.
      disconnectDarkTextObserver(svg);
      removeNode(backgroundRect);
      restoreTextTheme(svg);
      const styleNode3d = svg.querySelector('[data-color-scheme-style="1"]');
      removeNode(styleNode3d);
      if(svg.style){
        svg.style.removeProperty('background-color');
      }
      svg.removeAttribute('data-color-scheme-bg-color');
      return;
    }
    removeNode(backgroundRect);
    if(isDark){
      svg.setAttribute('data-color-scheme-bg-color', background);
      if(svg.style){
        svg.style.backgroundColor = background;
      }
      if(Shared.themeRuntime && typeof Shared.themeRuntime.applySvgTheme === 'function'){
        Shared.themeRuntime.applySvgTheme(svg, scheme);
      }else{
        const textColor = tokens.textColor || '#f2f2f2';
        applyDarkTextTheme(svg, textColor);
        ensureDarkTextObserver(svg, textColor);
      }
    }else{
      if(Shared.themeRuntime && typeof Shared.themeRuntime.applySvgTheme === 'function'){
        Shared.themeRuntime.applySvgTheme(svg, scheme);
      }else{
        disconnectDarkTextObserver(svg);
        restoreTextTheme(svg);
      }
      svg.removeAttribute('data-color-scheme-bg-color');
      if(svg.style){
        svg.style.removeProperty('background-color');
      }
    }

    const styleNode = svg.querySelector('[data-color-scheme-style="1"]');
    removeNode(styleNode);
  }

  function resolveTabScopedRoot(type, tabLike, options){
    const opts = options && typeof options === 'object' ? options : {};
    const allowPageFallback = opts.allowPageFallback === true;
    const helper = Shared.workspaceTabs || null;
    const resolvedType = String(type || '').trim();
    if(helper && typeof helper.resolveTabScopedRoot === 'function'){
      const helperRoot = helper.resolveTabScopedRoot(resolvedType, tabLike, {
        allowPageFallback,
        pageId: TYPE_TO_PAGE[resolvedType]?.pageId || null
      });
      if(helperRoot){
        return helperRoot;
      }
    }
    let tab = tabLike && typeof tabLike === 'object' ? tabLike : null;
    if(!tab && helper && typeof helper.resolveTab === 'function'){
      tab = helper.resolveTab(tabLike || null) || null;
    }
    if(!tab && (!tabLike || tabLike === null || tabLike === undefined)){
      tab = getActiveTab();
    }
    if(helper){
      const mounted = typeof helper.getMountedRoot === 'function'
        ? helper.getMountedRoot(tab || tabLike || null, resolvedType)
        : null;
      if(mounted){
        return mounted;
      }
      const sessionRoot = typeof helper.getSessionRecord === 'function'
        ? helper.getSessionRecord(tab || tabLike || null, resolvedType)?.dom?.root
        : null;
      if(sessionRoot){
        return sessionRoot;
      }
      if((tab || tabLike) && !allowPageFallback){
        return null;
      }
    }
    const descriptor = TYPE_TO_PAGE[resolvedType];
    if(!descriptor){
      return null;
    }
    if(!allowPageFallback && (tab || tabLike)){
      return null;
    }
    return global.document?.getElementById(descriptor.pageId) || null;
  }

  function getPrimarySvgBoxes(root){
    if(!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll('.svgbox'));
  }

  function applyRenderedTheme(type, schemeId, options){
    const opts = options || {};
    const descriptor = TYPE_TO_PAGE[type];
    if(!descriptor) return false;
    const root = opts.root || resolveTabScopedRoot(type, opts.tab || opts.tabId || null, { allowPageFallback: false });
    if(!root) return false;
    const scheme = getScheme(schemeId);
    const tokens = scheme.tokens || {};
    const boxes = getPrimarySvgBoxes(root);
    boxes.forEach(box => {
      if(!box || !box.style) return;
      box.setAttribute('data-color-scheme', scheme.id);
      if(scheme.id === 'dark'){
        box.style.backgroundColor = tokens.background || '#000000';
      }else{
        box.style.removeProperty('background-color');
      }
      box.style.removeProperty('color');
      const svgs = box.querySelectorAll ? Array.from(box.querySelectorAll('svg')) : [];
      svgs.forEach(svg => applySvgVisualTheme(svg, scheme));
    });
    return boxes.length > 0;
  }

  function applyRenderedThemeForTab(type, schemeId, tabId, reason){
    const active = getActiveTab();
    if(!active || active.type !== type || String(active.id || '') !== String(tabId || '')){
      debugLog('Debug: colorSchemes rendered theme skipped', {
        reason: reason || 'tab-mismatch',
        type,
        tabId: tabId || null,
        activeTabId: active?.id || null,
        activeType: active?.type || null,
        scheme: schemeId
      });
      return false;
    }
    const activeScheme = readActiveSchemeForType(type) || getDefaultSchemeIdForType(type);
    if(normalizePresetSchemeId(activeScheme, type) !== normalizePresetSchemeId(schemeId, type)){
      debugLog('Debug: colorSchemes rendered theme skipped', {
        reason: reason || 'scheme-mismatch',
        type,
        tabId: tabId || null,
        activeScheme,
        scheme: schemeId
      });
      return false;
    }
    applyRenderedTheme(type, schemeId, { tabId, tab: active });
    return true;
  }

  function syncSharedScatterPalette(type, scheme){
    // Keep shared palette defaults immutable at runtime.
    // Per-tab/theme palette selection must be resolved from payload/theme state.
    return resolveCategoricalPalette(type, scheme);
  }

  function legacyApplySchemeToPayload(type, payload, scheme, options){
    const next = cloneThemePayload(payload, type);
    const cfg = next.config = next.config && typeof next.config === 'object' ? next.config : {};
    const opts = ensureObject(options);
    const forceColors = opts.forceColors === true;
    const categorical = resolveCategoricalPalette(type, scheme);
    const tokens = scheme.tokens || {};
    const scientificDefaults = isScientificScheme(scheme) ? getScientificDefaults(type) : null;

    if(type === 'venn'){
      const style = next.style = next.style && typeof next.style === 'object' ? next.style : {};
      if(scientificDefaults){
        style.colorA = scientificDefaults.colorA || style.colorA;
        style.colorB = scientificDefaults.colorB || style.colorB;
        style.colorC = scientificDefaults.colorC || style.colorC;
        style.borderColor = scientificDefaults.borderColor || style.borderColor;
      }else{
        style.colorA = categorical[0] || style.colorA;
        style.colorB = categorical[1] || style.colorB;
        style.colorC = categorical[2] || style.colorC;
        if(tokens.borderColor){ style.borderColor = tokens.borderColor; }
      }
      style.colorScheme = scheme.id;
      if(style.upset && typeof style.upset === 'object'){
        if(scientificDefaults && scientificDefaults.upset){
          style.upset.barColor = scientificDefaults.upset.barColor || style.upset.barColor;
          style.upset.setBarColor = scientificDefaults.upset.setBarColor || style.upset.setBarColor;
          style.upset.dotColor = scientificDefaults.upset.dotColor || style.upset.dotColor;
          style.upset.inactiveDotColor = scientificDefaults.upset.inactiveDotColor || style.upset.inactiveDotColor;
          style.upset.gridColor = scientificDefaults.upset.gridColor || style.upset.gridColor;
          style.upset.axisColor = scientificDefaults.upset.axisColor || style.upset.axisColor;
        }else{
          style.upset.barColor = categorical[0] || style.upset.barColor;
          style.upset.setBarColor = categorical[1] || style.upset.setBarColor;
          style.upset.dotColor = categorical[2] || style.upset.dotColor;
          style.upset.inactiveDotColor = '#8a8a8a';
          if(tokens.gridColor){ style.upset.gridColor = tokens.gridColor; }
          if(tokens.axisColor){ style.upset.axisColor = tokens.axisColor; }
        }
      }
      return next;
    }

    cfg.colorScheme = scheme.id;

    if(type === 'scatter'){
      cfg.fill = (scientificDefaults && scientificDefaults.fill) || categorical[0] || cfg.fill;
      cfg.border = (scientificDefaults && scientificDefaults.border) || tokens.borderColor || cfg.border;
      const scatterDataLabelKeys = collectUniqueColumnValues(next.data, 0, { startRow: 1 });
      const scatterConfiguredLabelKeys = Object.keys(ensureMap(cfg.labelColors));
      const scatterLabelKeys = uniqueStrings(
        scatterDataLabelKeys.concat(scatterConfiguredLabelKeys)
      );
      cfg.labelColors = buildColorMap(scatterLabelKeys, categorical);
      const scatterStyleKeys = uniqueStrings(
        scatterLabelKeys.concat(Object.keys(ensureObject(cfg.labelStyles)))
      );
      cfg.labelStyles = recolorStyleMap(
        cfg.labelStyles,
        scatterStyleKeys,
        categorical,
        {
          fillFields: ['color', 'fill', 'markerFill'],
          stroke: tokens.borderColor || null,
          strokeFields: ['borderColor', 'stroke', 'markerStroke']
        }
      );
      cfg.overlayStyles = ensureObject(cfg.overlayStyles);
      cfg.overlayStyles.trend = {
        ...ensureObject(cfg.overlayStyles.trend),
        color: (scientificDefaults && scientificDefaults.overlayTrend)
          || categorical[0]
          || ensureObject(cfg.overlayStyles.trend).color
      };
      cfg.overlayStyles.confidence = {
        ...ensureObject(cfg.overlayStyles.confidence),
        color: (scientificDefaults && scientificDefaults.overlayConfidence)
          || pickSequentialColor(scheme, 2, categorical[1] || ensureObject(cfg.overlayStyles.confidence).color)
      };
      cfg.overlayStyles.prediction = {
        ...ensureObject(cfg.overlayStyles.prediction),
        color: (scientificDefaults && scientificDefaults.overlayPrediction)
          || pickSequentialColor(scheme, 4, categorical[2] || ensureObject(cfg.overlayStyles.prediction).color)
      };
      cfg.densityPalette = scheme.densityPalette || cfg.densityPalette;
      applyAxisTokens(cfg, scheme);
      return next;
    }

    if(type === 'pca'){
      cfg.fill = (scientificDefaults && scientificDefaults.fill) || categorical[0] || cfg.fill;
      cfg.border = (scientificDefaults && scientificDefaults.border) || tokens.borderColor || cfg.border;
      const pcaLabelKeys = inferPcaSampleLabelKeys(next.data, cfg);
      cfg.labelColors = buildColorMap(pcaLabelKeys, categorical);
      cfg.labelPointStyles = recolorStyleMap(
        cfg.labelPointStyles,
        Object.keys(ensureObject(cfg.labelPointStyles)),
        categorical,
        {
          force: false,
          fillFields: ['color', 'fill', 'markerFill'],
          stroke: tokens.borderColor || null,
          strokeFields: ['borderColor', 'stroke', 'markerStroke']
        }
      );
      if(cfg.grouped && typeof cfg.grouped === 'object'){
        const groupCount = Math.max(
          ensureArray(cfg.grouped.groups).length,
          ensureArray(cfg.grouped.colors).length
        );
        if(groupCount > 0){
          cfg.grouped.colors = Array.from({ length: groupCount }, (_, i) => categorical[i % categorical.length]);
        }
      }
      if(cfg.pointStyleScopes && typeof cfg.pointStyleScopes === 'object'){
        const scopes = cfg.pointStyleScopes;
        scopes.global = {
          ...ensureObject(scopes.global),
          fill: cfg.fill,
          borderColor: cfg.border
        };
        const groupStyles = ensureObject(scopes.groups);
        const groupKeys = Object.keys(groupStyles);
        scopes.groups = recolorStyleMap(groupStyles, groupKeys, categorical, {
          force: true,
          fillFields: ['fill', 'color'],
          stroke: tokens.borderColor || null,
          strokeFields: ['borderColor', 'stroke']
        });
        const pointStyles = ensureObject(scopes.points);
        const pointKeys = Object.keys(pointStyles);
        scopes.points = recolorStyleMap(pointStyles, pointKeys, categorical, {
          force: true,
          fillFields: ['fill', 'color'],
          stroke: tokens.borderColor || null,
          strokeFields: ['borderColor', 'stroke']
        });
        Object.entries(scopes.points).forEach(([key, style]) => {
          if(!String(key).startsWith('label:')) return;
          const label = String(key).slice('label:'.length);
          const color = cfg.labelColors?.[label];
          if(color) style.fill = color;
        });
      }
      applyAxisTokens(cfg, scheme);
      return next;
    }

    if(type === 'line'){
      cfg.border = (scientificDefaults && scientificDefaults.border) || tokens.borderColor || cfg.border;
      const names = inferLineSeriesNames(next.data);
      const lineKeys = uniqueStrings(Object.keys(ensureMap(cfg.labelColors)).concat(names));
      cfg.labelColors = buildColorMap(lineKeys, categorical);
      const existingSeriesStyles = ensureObject(cfg.seriesStyles);
      const seriesStyleKeys = uniqueStrings(Object.keys(existingSeriesStyles).concat(lineKeys));
      const nextSeriesStyles = {};
      seriesStyleKeys.forEach((key, index) => {
        const fillColor = cfg.labelColors[key] || categorical[index % categorical.length];
        nextSeriesStyles[key] = patchStyleColorFields(existingSeriesStyles[key], {
          fill: fillColor,
          stroke: tokens.borderColor || null,
          force: true,
          fillFields: ['fill', 'markerFill', 'color', 'lineStroke'],
          strokeFields: ['markerStroke', 'borderColor', 'stroke']
        });
      });
      cfg.seriesStyles = nextSeriesStyles;
      applyAxisTokens(cfg, scheme);
      return next;
    }

    if(type === 'box'){
      const grayscaleMode = scheme.id === 'grayscale';
      const darkMode = scheme.id === 'dark';
      const darkContrastColor = '#ffffff';
      const boxScientificPalette = scientificDefaults ? ensureArray(scientificDefaults.categorical).slice() : [];
      const boxPalette = grayscaleMode
        ? DEFAULT_BOX_GRAYSCALE_CATEGORICAL.slice()
        : (boxScientificPalette.length
          ? boxScientificPalette
          : buildBoxPalette(scheme, categorical, cfg.fill));
      const primaryFill = darkMode
        ? darkContrastColor
        : (grayscaleMode
          ? DEFAULT_BOX_GRAYSCALE_FILL
          : ((scientificDefaults && scientificDefaults.fill) || boxPalette[0] || categorical[0] || cfg.fill));
      const resolvedBoxPaletteBase = boxPalette.length
        ? boxPalette
        : (categorical.length ? categorical : [primaryFill || '#666666']);
      const resolvedBoxPalette = darkMode ? [darkContrastColor] : resolvedBoxPaletteBase;
      const unifiedBorder = darkMode
        ? darkContrastColor
        : (grayscaleMode
        ? '#000000'
        : deriveDarkerBorderColor(primaryFill, tokens.borderColor || cfg.border));
      cfg.fill = primaryFill || cfg.fill;
      cfg.border = unifiedBorder || cfg.border;
      const currentLen = Math.max(
        ensureArray(cfg.colors).length,
        ensureArray(cfg.borderColors).length,
        inferSeriesCountFromHeader(next.data),
        1
      );
      cfg.colors = Array.from({ length: currentLen }, (_, i) => resolvedBoxPalette[i % resolvedBoxPalette.length]);
      cfg.borderColors = cfg.colors.map(color => (
        darkMode
          ? darkContrastColor
          : (grayscaleMode
          ? '#000000'
          : deriveDarkerBorderColor(color, tokens.borderColor || darken(color, 0.22)))
      ));
      cfg.shapeGlobalStyle = forceColors
        ? clearStyleColorFields(cfg.shapeGlobalStyle, {
          fillFields: ['fill', 'color'],
          strokeFields: ['stroke', 'borderColor', 'border']
        })
        : patchStyleColorFields(cfg.shapeGlobalStyle, {
          fill: primaryFill || null,
          stroke: unifiedBorder || tokens.borderColor || null,
          force: false,
          fillFields: ['fill', 'color'],
          strokeFields: ['stroke', 'borderColor', 'border']
        });
      cfg.shapeStyles = forceColors
        ? clearStyleMapColorFields(cfg.shapeStyles, {
          fillFields: ['fill', 'color'],
          strokeFields: ['stroke', 'borderColor', 'border']
        })
        : recolorIndexedStyleMap(cfg.shapeStyles, resolvedBoxPalette, {
          fillFields: ['fill', 'color'],
          stroke: unifiedBorder || tokens.borderColor || null,
          strokeFields: ['stroke', 'borderColor', 'border']
        });
      cfg.pointGlobalStyle = forceColors
        ? clearStyleColorFields(cfg.pointGlobalStyle, {
          fillFields: ['fill', 'color', 'markerFill'],
          strokeFields: ['stroke', 'borderColor', 'markerStroke', 'border']
        })
        : patchStyleColorFields(cfg.pointGlobalStyle, {
          fill: primaryFill || null,
          stroke: unifiedBorder || tokens.borderColor || null,
          force: false,
          fillFields: ['fill', 'color', 'markerFill'],
          strokeFields: ['stroke', 'borderColor', 'markerStroke', 'border']
        });
      cfg.pointStyles = forceColors
        ? clearStyleMapColorFields(cfg.pointStyles, {
          fillFields: ['fill', 'color', 'markerFill'],
          strokeFields: ['stroke', 'borderColor', 'markerStroke', 'border']
        })
        : recolorIndexedStyleMap(cfg.pointStyles, resolvedBoxPalette, {
          fillFields: ['fill', 'color', 'markerFill'],
          stroke: unifiedBorder || tokens.borderColor || null,
          strokeFields: ['stroke', 'borderColor', 'markerStroke', 'border']
        });
      cfg.summaryGlobalStyle = forceColors
        ? clearStyleColorFields(cfg.summaryGlobalStyle, {
          fillFields: ['color']
        })
        : patchStyleColorFields(cfg.summaryGlobalStyle, {
          fill: grayscaleMode
            ? '#000000'
            : ((scientificDefaults && scientificDefaults.summaryColor)
              || resolvedBoxPalette[1]
              || resolvedBoxPalette[0]
              || null),
          force: false,
          fillFields: ['color']
        });
      cfg.summaryStyles = forceColors
        ? clearStyleMapColorFields(cfg.summaryStyles, { fillFields: ['color'] })
        : recolorIndexedStyleMap(cfg.summaryStyles, grayscaleMode ? ['#000000'] : resolvedBoxPalette, {
          force: false,
          fillFields: ['color']
        });
      applyAxisTokens(cfg, scheme);
      // Box renders theme surface/text from the scheme itself. These fields are
      // not Box parameters and were previously reintroduced as dead payload state.
      delete cfg.backgroundColor;
      delete cfg.textColor;
      return next;
    }

    if(type === 'hist'){
      cfg.fill = (scientificDefaults && scientificDefaults.fill) || categorical[0] || cfg.fill;
      cfg.border = (scientificDefaults && scientificDefaults.border) || tokens.borderColor || cfg.border;
      const histSeriesKeys = uniqueStrings(
        Object.keys(ensureMap(cfg.seriesColors)).concat(inferHistogramSeriesKeys(next.data))
      );
      cfg.seriesColors = buildColorMap(histSeriesKeys, categorical);
      const histDistributionPalette = (scientificDefaults && scientificDefaults.distributionColors) || categorical;
      applyHistogramDistributionPalette(cfg, scheme, histDistributionPalette);
      applyAxisTokens(cfg, scheme);
      return next;
    }

    if(type === 'pie'){
      cfg.borderColor = (scientificDefaults && scientificDefaults.borderColor) || tokens.borderColor || cfg.borderColor;
      const keys = Object.keys(ensureMap(cfg.colors)).concat(collectUniqueColumnValues(next.data, 0, { startRow: 1 }));
      cfg.colors = buildColorMap(keys, categorical);
      applyAxisTokens(cfg, scheme);
      return next;
    }

    if(type === 'roc' || type === 'survival'){
      const keys = Object.keys(ensureMap(cfg.labelColors)).concat(collectUniqueColumnValues(next.data, 0, { startRow: 1 }));
      cfg.labelColors = buildColorMap(keys, categorical);
      applyAxisTokens(cfg, scheme);
      return next;
    }

    if(type === 'heatmap'){
      cfg.colors = cfg.colors && typeof cfg.colors === 'object' ? cfg.colors : {};
      const heatmapDiverging = (scientificDefaults && scientificDefaults.diverging) || scheme.diverging || {};
      cfg.colors.negative = heatmapDiverging.negative || cfg.colors.negative;
      cfg.colors.zero = heatmapDiverging.zero || cfg.colors.zero;
      cfg.colors.positive = heatmapDiverging.positive || cfg.colors.positive;
      cfg.dendrogram = ensureObject(cfg.dendrogram);
      if(scientificDefaults && scientificDefaults.dendrogramColor){
        cfg.dendrogram.color = scientificDefaults.dendrogramColor;
      }else if(tokens.axisColor){
        cfg.dendrogram.color = tokens.axisColor;
      }
      return next;
    }

    if(type === 'surface'){
      const requestedId = normalizeSurfaceSchemeId(scheme?.id);
      const surfaceScheme = SCHEMES[requestedId] || SCHEMES.dark || scheme;
      const scientificSurface = getScientificDefaults('surface') || {};
      const surfaceTokens = surfaceScheme?.tokens || {};
      cfg.settings = cfg.settings && typeof cfg.settings === 'object' ? cfg.settings : {};
      cfg.settings.colorRamp = surfaceScheme?.surfaceRamp || (scientificDefaults && scientificDefaults.surfaceRamp) || cfg.settings.colorRamp;
      if(surfaceTokens.axisColor){
        cfg.settings.axisColor = surfaceTokens.axisColor;
      }else if(surfaceTokens.borderColor){
        cfg.settings.axisColor = surfaceTokens.borderColor;
      }else if(scientificSurface.axisColor){
        cfg.settings.axisColor = scientificSurface.axisColor;
      }
      if(surfaceTokens.textColor){
        cfg.settings.textColor = surfaceTokens.textColor;
      }else if(scientificSurface.textColor){
        cfg.settings.textColor = scientificSurface.textColor;
      }
      if(surfaceTokens.background){
        cfg.settings.backgroundColor = surfaceTokens.background;
      }else if(scientificSurface.backgroundColor){
        cfg.settings.backgroundColor = scientificSurface.backgroundColor;
      }
      cfg.settings.colorScheme = surfaceScheme.id;
      cfg.colorScheme = surfaceScheme.id;
      if(surfaceTokens.textColor){
        cfg.textColor = surfaceTokens.textColor;
      }else if(scientificSurface.textColor){
        cfg.textColor = scientificSurface.textColor;
      }
      if(surfaceTokens.background){
        cfg.backgroundColor = surfaceTokens.background;
      }else if(scientificSurface.backgroundColor){
        cfg.backgroundColor = scientificSurface.backgroundColor;
      }
      if(cfg.gridStyle && typeof cfg.gridStyle === 'object' && surfaceTokens.gridColor){
        cfg.gridStyle.color = surfaceTokens.gridColor;
      }else if(cfg.gridStyle && typeof cfg.gridStyle === 'object'){
        cfg.gridStyle.color = SURFACE_LIGHT_TOKENS.gridColor;
      }
      return next;
    }

    return next;
  }

  function applySchemeToPayload(type, payload, scheme, options){
    const compiler = Shared.themeCompiler;
    if(compiler && typeof compiler.compilePayload === 'function' && compiler.hasAdapter && compiler.hasAdapter(type)){
      const compiled = compiler.compilePayload(type, payload, scheme, {
        options: ensureObject(options),
        legacyApply: legacyApplySchemeToPayload,
        type
      });
      if(compiled && typeof compiled === 'object'){
        return compiled;
      }
    }
    return legacyApplySchemeToPayload(type, payload, scheme, options);
  }

  const DATASET_STYLE_COLOR_FIELDS = Object.freeze([
    'fill', 'color', 'markerFill', 'lineColor', 'lineStroke',
    'stroke', 'borderColor', 'markerStroke', 'border'
  ]);

  function normalizeHexColor(value){
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    const shortMatch = raw.match(/^#([0-9a-f]{3})$/i);
    if(shortMatch){
      return `#${shortMatch[1].split('').map(char => char + char).join('')}`;
    }
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw : null;
  }

  function addDatasetColorSlot(slots, id, owner, key, paletteKind = 'categorical'){
    if(!owner || typeof owner !== 'object' || !Object.prototype.hasOwnProperty.call(owner, key)){
      return;
    }
    const color = normalizeHexColor(owner[key]);
    if(!color){
      return;
    }
    slots.push({
      id,
      color,
      paletteKind,
      setColor(nextColor){
        owner[key] = nextColor;
      }
    });
  }

  function addDatasetColorMap(slots, prefix, map, paletteKind){
    Object.keys(ensureObject(map)).sort().forEach(key => {
      addDatasetColorSlot(slots, `${prefix}.${key}`, map, key, paletteKind);
    });
  }

  function addDatasetColorArray(slots, prefix, values, paletteKind){
    ensureArray(values).forEach((_value, index) => {
      addDatasetColorSlot(slots, `${prefix}.${index}`, values, index, paletteKind);
    });
  }

  function addDatasetStyleSlots(slots, prefix, style, paletteKind){
    const source = ensureObject(style);
    DATASET_STYLE_COLOR_FIELDS.forEach(field => {
      addDatasetColorSlot(slots, `${prefix}.${field}`, source, field, paletteKind);
    });
  }

  function addDatasetStyleMap(slots, prefix, map, paletteKind){
    Object.keys(ensureObject(map)).sort().forEach(key => {
      addDatasetStyleSlots(slots, `${prefix}.${key}`, map[key], paletteKind);
    });
  }

  function collectDatasetColorSlots(type, payload){
    const slots = [];
    if(type === 'venn'){
      const style = ensureObject(payload?.style);
      ['colorA', 'colorB', 'colorC'].forEach(key => {
        addDatasetColorSlot(slots, `style.${key}`, style, key, 'categorical');
      });
      return slots;
    }

    const cfg = ensureObject(payload?.config);
    if(type === 'scatter'){
      addDatasetColorSlot(slots, 'config.fill', cfg, 'fill');
      addDatasetColorMap(slots, 'config.labelColors', cfg.labelColors);
      addDatasetStyleMap(slots, 'config.labelStyles', cfg.labelStyles);
    }else if(type === 'pca'){
      addDatasetColorSlot(slots, 'config.fill', cfg, 'fill');
      addDatasetColorMap(slots, 'config.labelColors', cfg.labelColors);
      addDatasetStyleMap(slots, 'config.labelPointStyles', cfg.labelPointStyles);
      addDatasetColorArray(slots, 'config.grouped.colors', cfg.grouped?.colors);
      const individualPointStyles = Object.fromEntries(
        Object.entries(ensureObject(cfg.pointStyleScopes?.points))
          .filter(([key]) => String(key).startsWith('column:'))
      );
      addDatasetStyleMap(slots, 'config.pointStyleScopes.points', individualPointStyles);
    }else if(type === 'line'){
      addDatasetColorMap(slots, 'config.labelColors', cfg.labelColors);
      addDatasetStyleMap(slots, 'config.seriesStyles', cfg.seriesStyles);
    }else if(type === 'box'){
      addDatasetColorSlot(slots, 'config.fill', cfg, 'fill');
      addDatasetColorArray(slots, 'config.colors', cfg.colors);
      addDatasetColorArray(slots, 'config.borderColors', cfg.borderColors);
      addDatasetStyleSlots(slots, 'config.shapeGlobalStyle', cfg.shapeGlobalStyle);
      addDatasetStyleMap(slots, 'config.shapeStyles', cfg.shapeStyles);
      addDatasetStyleSlots(slots, 'config.pointGlobalStyle', cfg.pointGlobalStyle);
      addDatasetStyleMap(slots, 'config.pointStyles', cfg.pointStyles);
      addDatasetStyleSlots(slots, 'config.summaryGlobalStyle', cfg.summaryGlobalStyle);
      addDatasetStyleMap(slots, 'config.summaryStyles', cfg.summaryStyles);
    }else if(type === 'hist'){
      addDatasetColorSlot(slots, 'config.fill', cfg, 'fill');
      addDatasetColorMap(slots, 'config.seriesColors', cfg.seriesColors);
      ensureArray(cfg.distributions?.options).forEach(entry => {
        const key = String(entry?.key || '').trim();
        if(key){
          addDatasetColorSlot(slots, `config.distributions.${key}`, entry, 'color', 'categorical');
        }
      });
    }else if(type === 'pie'){
      addDatasetColorMap(slots, 'config.colors', cfg.colors);
    }else if(type === 'roc' || type === 'survival'){
      addDatasetColorMap(slots, 'config.labelColors', cfg.labelColors);
    }else if(type === 'heatmap'){
      ['negative', 'zero', 'positive'].forEach(key => {
        addDatasetColorSlot(slots, `config.colors.${key}`, cfg.colors, key, 'diverging');
      });
    }
    return slots;
  }

  function rgbToLab(hex){
    const normalized = normalizeHexColor(hex);
    if(!normalized){
      return null;
    }
    const channel = offset => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    const linear = value => value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
    const r = linear(channel(1));
    const g = linear(channel(3));
    const b = linear(channel(5));
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const transform = value => value > 0.008856
      ? Math.cbrt(value)
      : (7.787 * value) + (16 / 116);
    const fx = transform(x);
    const fy = transform(y);
    const fz = transform(z);
    return {
      l: (116 * fy) - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz)
    };
  }

  function perceptualColorDistance(first, second){
    const a = rgbToLab(first);
    const b = rgbToLab(second);
    if(!a || !b){
      return Number.POSITIVE_INFINITY;
    }
    return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
  }

  function assignDistinctNearestColors(sourceColors, targetColors){
    const sources = uniqueStrings(sourceColors.map(normalizeHexColor).filter(Boolean));
    const targets = uniqueStrings(targetColors.map(normalizeHexColor).filter(Boolean));
    const assignments = new Map();
    if(!sources.length || !targets.length){
      return assignments;
    }
    if(sources.length > targets.length){
      sources.forEach(source => {
        let best = targets[0];
        let bestDistance = perceptualColorDistance(source, best);
        targets.slice(1).forEach(target => {
          const distance = perceptualColorDistance(source, target);
          if(distance < bestDistance){
            best = target;
            bestDistance = distance;
          }
        });
        assignments.set(source, best);
      });
      return assignments;
    }

    let states = new Map([[0, { cost: 0, colors: [] }]]);
    sources.forEach(source => {
      const nextStates = new Map();
      states.forEach((stateValue, mask) => {
        targets.forEach((target, targetIndex) => {
          const bit = 1 << targetIndex;
          if(mask & bit){
            return;
          }
          const nextMask = mask | bit;
          const nextCost = stateValue.cost + perceptualColorDistance(source, target);
          const existing = nextStates.get(nextMask);
          if(!existing || nextCost < existing.cost){
            nextStates.set(nextMask, {
              cost: nextCost,
              colors: stateValue.colors.concat(target)
            });
          }
        });
      });
      states = nextStates;
    });
    let best = null;
    states.forEach(value => {
      if(!best || value.cost < best.cost){
        best = value;
      }
    });
    sources.forEach((source, index) => assignments.set(source, best.colors[index]));
    return assignments;
  }

  function getSchemePaletteForKind(type, scheme, paletteKind){
    if(paletteKind === 'diverging'){
      const diverging = ensureObject(scheme?.diverging);
      return uniqueStrings([diverging.negative, diverging.zero, diverging.positive]);
    }
    return resolveCategoricalPalette(type, scheme);
  }

  function collectCustomDatasetColorSlots(type, payload){
    const source = cloneThemePayload(payload, type);
    const sourceScheme = getScheme(getPayloadColorSchemeId(type, source));
    const baseline = applySchemeToPayload(type, source, sourceScheme, { forceColors: true });
    const baselineById = new Map(
      collectDatasetColorSlots(type, baseline).map(slot => [slot.id, slot])
    );
    const sourceSlots = collectDatasetColorSlots(type, source);
    const customColorsByKind = new Map();
    sourceSlots.forEach(slot => {
      const baselineSlot = baselineById.get(slot.id);
      if(!baselineSlot || baselineSlot.color !== slot.color){
        if(!customColorsByKind.has(slot.paletteKind)){
          customColorsByKind.set(slot.paletteKind, new Set());
        }
        customColorsByKind.get(slot.paletteKind).add(slot.color);
      }
    });
    return sourceSlots.filter(slot => customColorsByKind.get(slot.paletteKind)?.has(slot.color));
  }

  function applyMatchedDatasetColors(type, sourcePayload, targetPayload, scheme){
    const customSlots = collectCustomDatasetColorSlots(type, sourcePayload);
    if(!customSlots.length){
      return targetPayload;
    }
    const targetSlots = collectDatasetColorSlots(type, targetPayload);
    const targetById = new Map(targetSlots.map(slot => [slot.id, slot]));
    const assignmentsByKind = new Map();
    uniqueStrings(customSlots.map(slot => slot.paletteKind)).forEach(paletteKind => {
      const sourceColors = customSlots
        .filter(slot => slot.paletteKind === paletteKind)
        .map(slot => slot.color);
      assignmentsByKind.set(
        paletteKind,
        assignDistinctNearestColors(sourceColors, getSchemePaletteForKind(type, scheme, paletteKind))
      );
    });
    customSlots.forEach(slot => {
      const targetSlot = targetById.get(slot.id);
      const nextColor = assignmentsByKind.get(slot.paletteKind)?.get(slot.color);
      if(targetSlot && nextColor){
        targetSlot.setColor(nextColor);
      }
    });
    return targetPayload;
  }

  function getActiveTab(){
    const session = global.Main?.session;
    if(!session || typeof session.getActiveTab !== 'function') return null;
    return session.getActiveTab();
  }

  function getWorkspace(type){
    const components = global.Main?.components;
    if(components && typeof components.get === 'function'){
      return components.get(type) || null;
    }
    return global.Components?.[type] || null;
  }

  function normalizeColorSignatureLeaf(value){
    if(value === null || value === undefined) return null;
    if(typeof value === 'string'){
      return value.trim().toLowerCase();
    }
    if(typeof value === 'number'){
      return Number.isFinite(value) ? value : null;
    }
    if(typeof value === 'boolean'){
      return value;
    }
    return String(value).trim().toLowerCase();
  }

  function readProjectedMapKeys(value, reference){
    const source = ensureObject(value);
    const template = ensureObject(reference);
    const hasReference = reference !== null && reference !== undefined;
    const keys = hasReference ? Object.keys(template) : Object.keys(source);
    return uniqueStrings(keys).sort();
  }

  function extractColorArray(values, referenceValues){
    const source = ensureArray(values);
    const ref = Array.isArray(referenceValues) ? referenceValues : source;
    if(!ref.length && !source.length){
      return null;
    }
    return ref.map((_, index) => normalizeColorSignatureLeaf(source[index]));
  }

  function extractColorMap(values, referenceValues){
    const source = ensureObject(values);
    const keys = readProjectedMapKeys(source, referenceValues);
    if(!keys.length){
      return null;
    }
    const out = {};
    keys.forEach(key => {
      out[key] = normalizeColorSignatureLeaf(source[key]);
    });
    return out;
  }

  function extractStyleColorFields(style){
    const source = ensureObject(style);
    const out = {};
    ['fill', 'color', 'markerFill', 'lineColor', 'stroke', 'borderColor', 'markerStroke', 'lineStroke', 'textColor', 'labelColor', 'backgroundColor']
      .forEach(key => {
        if(Object.prototype.hasOwnProperty.call(source, key)){
          out[key] = normalizeColorSignatureLeaf(source[key]);
        }
      });
    return Object.keys(out).length ? out : null;
  }

  function extractStyleMapColorFields(styleMap, referenceMap){
    const source = ensureObject(styleMap);
    const keys = readProjectedMapKeys(source, referenceMap);
    if(!keys.length){
      return null;
    }
    const out = {};
    keys.forEach(key => {
      const extracted = extractStyleColorFields(source[key]);
      if(extracted){
        out[key] = extracted;
      }
    });
    return Object.keys(out).length ? out : null;
  }

  function hasOwnPropertyValue(source, key){
    return !!(source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, key));
  }

  function projectColorScalar(source, key, reference){
    const sourceObj = ensureObject(source);
    const referenceObj = reference && typeof reference === 'object' ? reference : null;
    const shouldInclude = referenceObj ? hasOwnPropertyValue(referenceObj, key) : hasOwnPropertyValue(sourceObj, key);
    if(!shouldInclude){
      return null;
    }
    return normalizeColorSignatureLeaf(sourceObj[key]);
  }

  function extractAxisTokenState(config, referenceConfig){
    const cfg = ensureObject(config);
    const refCfg = referenceConfig && typeof referenceConfig === 'object' ? referenceConfig : null;
    const out = {};
    const axisColor = projectColorScalar(cfg.axis, 'color', refCfg?.axis);
    if(axisColor !== null){
      out.axis = { color: axisColor };
    }
    const gridColor = projectColorScalar(cfg.gridStyle, 'color', refCfg?.gridStyle);
    if(gridColor !== null){
      out.gridStyle = { color: gridColor };
    }
    const backgroundColor = projectColorScalar(cfg, 'backgroundColor', refCfg);
    if(backgroundColor !== null){
      out.backgroundColor = backgroundColor;
    }
    const textColor = projectColorScalar(cfg, 'textColor', refCfg);
    if(textColor !== null){
      out.textColor = textColor;
    }
    return out;
  }

  function assignIfPresent(target, key, value){
    if(value === null || value === undefined){
      return;
    }
    if(typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length){
      return;
    }
    target[key] = value;
  }

  function buildPayloadColorState(type, payload, referencePayload){
    if(type === 'venn'){
      const style = ensureObject(payload?.style);
      const referenceStyle = ensureObject(referencePayload?.style);
      const vennState = {
        colorA: normalizeColorSignatureLeaf(style.colorA),
        colorB: normalizeColorSignatureLeaf(style.colorB),
        colorC: normalizeColorSignatureLeaf(style.colorC),
        borderColor: normalizeColorSignatureLeaf(style.borderColor)
      };
      const upset = {};
      ['barColor', 'setBarColor', 'dotColor', 'inactiveDotColor', 'gridColor', 'axisColor'].forEach(key => {
        if(Object.prototype.hasOwnProperty.call(style.upset || {}, key) || Object.prototype.hasOwnProperty.call(referenceStyle.upset || {}, key)){
          upset[key] = normalizeColorSignatureLeaf(style.upset?.[key]);
        }
      });
      assignIfPresent(vennState, 'upset', Object.keys(upset).length ? upset : null);
      return vennState;
    }

    const cfg = ensureObject(payload?.config);
    const refCfg = ensureObject(referencePayload?.config);
    const out = extractAxisTokenState(cfg, refCfg);

    switch(type){
      case 'scatter':
        assignIfPresent(out, 'fill', projectColorScalar(cfg, 'fill', refCfg));
        assignIfPresent(out, 'border', projectColorScalar(cfg, 'border', refCfg));
        assignIfPresent(out, 'densityPalette', projectColorScalar(cfg, 'densityPalette', refCfg));
        assignIfPresent(out, 'labelColors', extractColorMap(cfg.labelColors, refCfg.labelColors));
        assignIfPresent(out, 'labelStyles', extractStyleMapColorFields(cfg.labelStyles, refCfg.labelStyles));
        assignIfPresent(out, 'overlayStyles', extractStyleMapColorFields(cfg.overlayStyles, refCfg.overlayStyles));
        break;
      case 'pca':
        assignIfPresent(out, 'fill', projectColorScalar(cfg, 'fill', refCfg));
        assignIfPresent(out, 'border', projectColorScalar(cfg, 'border', refCfg));
        assignIfPresent(out, 'labelColors', extractColorMap(cfg.labelColors, refCfg.labelColors));
        assignIfPresent(out, 'labelPointStyles', extractStyleMapColorFields(cfg.labelPointStyles, refCfg.labelPointStyles));
        if(cfg.pointStyleScopes?.points || refCfg.pointStyleScopes?.points){
          const scopedPoints = Object.fromEntries(
            Object.entries(ensureObject(cfg.pointStyleScopes?.points))
              .filter(([key]) => String(key).startsWith('column:'))
          );
          const referencePoints = Object.fromEntries(
            Object.entries(ensureObject(refCfg.pointStyleScopes?.points))
              .filter(([key]) => String(key).startsWith('column:'))
          );
          assignIfPresent(out, 'pointStyleScopes', {
            points: extractStyleMapColorFields(scopedPoints, referencePoints)
          });
        }
        if(cfg.grouped || refCfg.grouped){
          assignIfPresent(out, 'groupedColors', extractColorArray(cfg.grouped?.colors, refCfg.grouped?.colors));
        }
        break;
      case 'line':
        assignIfPresent(out, 'border', projectColorScalar(cfg, 'border', refCfg));
        assignIfPresent(out, 'labelColors', extractColorMap(cfg.labelColors, refCfg.labelColors));
        assignIfPresent(out, 'seriesStyles', extractStyleMapColorFields(cfg.seriesStyles, refCfg.seriesStyles));
        assignIfPresent(out, 'overlayStyles', extractStyleMapColorFields(cfg.overlayStyles, refCfg.overlayStyles));
        break;
      case 'box':
        assignIfPresent(out, 'fill', projectColorScalar(cfg, 'fill', refCfg));
        assignIfPresent(out, 'colors', extractColorArray(cfg.colors, refCfg.colors));
        assignIfPresent(out, 'borderColors', extractColorArray(cfg.borderColors, refCfg.borderColors));
        assignIfPresent(out, 'shapeGlobalStyle', extractStyleColorFields(cfg.shapeGlobalStyle));
        assignIfPresent(out, 'shapeStyles', extractStyleMapColorFields(cfg.shapeStyles, refCfg.shapeStyles));
        assignIfPresent(out, 'pointGlobalStyle', extractStyleColorFields(cfg.pointGlobalStyle));
        assignIfPresent(out, 'pointStyles', extractStyleMapColorFields(cfg.pointStyles, refCfg.pointStyles));
        assignIfPresent(out, 'summaryGlobalStyle', extractStyleColorFields(cfg.summaryGlobalStyle));
        assignIfPresent(out, 'summaryStyles', extractStyleMapColorFields(cfg.summaryStyles, refCfg.summaryStyles));
        break;
      case 'hist': {
        assignIfPresent(out, 'fill', projectColorScalar(cfg, 'fill', refCfg));
        assignIfPresent(out, 'border', projectColorScalar(cfg, 'border', refCfg));
        assignIfPresent(out, 'seriesColors', extractColorMap(cfg.seriesColors, refCfg.seriesColors));
        const sourceOptions = ensureArray(cfg.distributions?.options);
        const referenceOptions = ensureArray(refCfg.distributions?.options);
        const templateOptions = referenceOptions.length ? referenceOptions : sourceOptions;
        const distributionColors = {};
        templateOptions.forEach(entry => {
          const key = String(entry?.key || '').trim();
          if(!key) return;
          const match = sourceOptions.find(option => String(option?.key || '').trim() === key) || {};
          distributionColors[key] = normalizeColorSignatureLeaf(match.color);
        });
        assignIfPresent(out, 'distributions', Object.keys(distributionColors).length ? distributionColors : null);
        break;
      }
      case 'pie':
        assignIfPresent(out, 'borderColor', projectColorScalar(cfg, 'borderColor', refCfg));
        assignIfPresent(out, 'colors', extractColorMap(cfg.colors, refCfg.colors));
        break;
      case 'roc':
      case 'survival':
        assignIfPresent(out, 'labelColors', extractColorMap(cfg.labelColors, refCfg.labelColors));
        break;
      case 'heatmap':
        assignIfPresent(out, 'colors', {
          negative: normalizeColorSignatureLeaf(cfg.colors?.negative),
          zero: normalizeColorSignatureLeaf(cfg.colors?.zero),
          positive: normalizeColorSignatureLeaf(cfg.colors?.positive)
        });
        if(cfg.dendrogram || refCfg.dendrogram){
          assignIfPresent(out, 'dendrogram', { color: normalizeColorSignatureLeaf(cfg.dendrogram?.color) });
        }
        break;
      case 'surface':
        assignIfPresent(out, 'settings', {
          colorRamp: projectColorScalar(cfg.settings, 'colorRamp', refCfg.settings),
          axisColor: projectColorScalar(cfg.settings, 'axisColor', refCfg.settings),
          textColor: projectColorScalar(cfg.settings, 'textColor', refCfg.settings),
          backgroundColor: projectColorScalar(cfg.settings, 'backgroundColor', refCfg.settings)
        });
        assignIfPresent(out, 'textColor', projectColorScalar(cfg, 'textColor', refCfg));
        assignIfPresent(out, 'backgroundColor', projectColorScalar(cfg, 'backgroundColor', refCfg));
        break;
      default:
        break;
    }

    return out;
  }

  function buildPayloadColorSignature(type, payload, referencePayload){
    return JSON.stringify(buildPayloadColorState(type, payload, referencePayload) || {});
  }

  function createColorComparisonPayload(type, payload){
    if(!payload || typeof payload !== 'object'){
      return null;
    }
    const out = {
      type: payload.type || type,
      config: cloneValue(payload.config || {})
    };
    if(payload.style && typeof payload.style === 'object'){
      out.style = cloneValue(payload.style);
    }
    const data = Array.isArray(payload.data) ? payload.data : null;
    if(data){
      if(shouldScanMatrixColorKeys(data)){
        out.data = data;
      }else{
        out.data = Array.isArray(data[0]) ? [data[0].slice()] : [];
      }
    }
    return out;
  }

  function getComparisonPayload(type, options){
    const active = getActiveTab();
    if(!active || active.type !== type){
      return null;
    }
    return createColorComparisonPayload(type, active.payload);
  }

  function payloadMatchesPreset(type, payload, schemeId){
    if(!payload) return true;
    const actualSchemeId = normalizePresetSchemeId(schemeId, type);
    const scheme = getScheme(actualSchemeId);
    const expected = applySchemeToPayload(type, payload, scheme, { forceColors: true });
    if(buildPayloadColorSignature(type, payload, payload) === buildPayloadColorSignature(type, expected, payload)){
      return true;
    }
    const normalized = cloneThemePayload(payload, type);
    const normalizedSlots = collectDatasetColorSlots(type, normalized);
    const expectedById = new Map(
      collectDatasetColorSlots(type, expected).map(slot => [slot.id, slot])
    );
    const paletteByKind = new Map();
    for(const slot of normalizedSlots){
      const expectedSlot = expectedById.get(slot.id);
      if(!expectedSlot || slot.color === expectedSlot.color){
        continue;
      }
      if(!paletteByKind.has(slot.paletteKind)){
        paletteByKind.set(
          slot.paletteKind,
          new Set(getSchemePaletteForKind(type, scheme, slot.paletteKind).map(normalizeHexColor).filter(Boolean))
        );
      }
      if(!paletteByKind.get(slot.paletteKind).has(slot.color)){
        return false;
      }
      slot.setColor(expectedSlot.color);
    }
    return buildPayloadColorSignature(type, normalized, normalized)
      === buildPayloadColorSignature(type, expected, normalized);
  }

  function resolveColorSchemeOwnerTab(tabId, type){
    const expectedId = String(tabId || '').trim();
    const active = getActiveTab();
    if(active && String(active.id || '') === expectedId && active.type === type){
      return active;
    }
    const resolved = Shared.workspaceTabs?.resolveTab?.(expectedId) || null;
    if(resolved && resolved.type === type){
      return resolved;
    }
    const tabs = global.Main?.session?.workspaceState?.tabs;
    return Array.isArray(tabs)
      ? (tabs.find(tab => String(tab?.id || '') === expectedId && tab?.type === type) || null)
      : null;
  }

  function getPayloadColorSchemeId(type, payload){
    return type === 'venn'
      ? normalizePresetSchemeId(payload?.style?.colorScheme, type)
      : (type === 'surface'
        ? normalizeSurfaceSchemeId(payload?.config?.colorScheme)
        : normalizePresetSchemeId(payload?.config?.colorScheme, type));
  }

  function colorSchemePayloadsEqual(type, first, second){
    return getPayloadColorSchemeId(type, first) === getPayloadColorSchemeId(type, second)
      && buildPayloadColorSignature(type, first, first) === buildPayloadColorSignature(type, second, second);
  }

  function commitAndProjectColorSchemePayload(type, tabId, payload, options){
    const opts = ensureObject(options);
    const main = global.Main || {};
    const session = main.session;
    const tab = resolveColorSchemeOwnerTab(tabId, type);
    if(!session || !tab || !payload){
      return false;
    }
    const nextPayload = cloneThemePayload(payload, type);
    if(type === 'scatter'){
      nextPayload.config = ensureObject(nextPayload.config);
      nextPayload.config.colorSchemeUserOverride = true;
    }
    const reason = opts.reason || `color-scheme-${type}`;
    if(typeof session.commitTabPayload === 'function'){
      session.commitTabPayload(tab, nextPayload, { reason, origin: 'user' });
    }else if(typeof session.updateTabPayload === 'function'){
      session.updateTabPayload(tab, () => cloneThemePayload(nextPayload, type), { reason, origin: 'user' });
    }else if(typeof session.assignTabPayload === 'function'){
      session.assignTabPayload(tab, cloneThemePayload(nextPayload, type), { reason });
    }else{
      tab.payload = cloneThemePayload(nextPayload, type);
    }

    const active = getActiveTab();
    if(!active || String(active.id || '') !== String(tab.id || '')){
      return true;
    }
    const workspace = typeof main.components?.get === 'function' ? main.components.get(type) : null;
    if(!workspace){
      return false;
    }
    const projectionMeta = {
      reason,
      source: opts.source || 'color-scheme',
      colorSchemeOnly: true,
      styleOnly: true,
      skipDataLoad: true,
      skipPayloadSizing: true,
      viewOnly: true,
      tabId: tab.id,
      type
    };
    try{
      let projected = false;
      if(typeof workspace.applyColorSchemePayload === 'function'){
        projected = workspace.applyColorSchemePayload(cloneThemePayload(nextPayload, type), projectionMeta) !== false;
      }
      if(!projected && typeof workspace.loadFromPayload === 'function'){
        projected = workspace.loadFromPayload(cloneThemePayload(nextPayload, type), projectionMeta) !== false;
      }
      if(!projected){
        return false;
      }
    }catch(err){
      console.error('colorSchemes style-only projection error', { type, reason, err });
      return false;
    }

    if(typeof session.updateTabPayload !== 'function' && typeof session.markSessionDirty === 'function'){
      session.markSessionDirty(reason, { type, tabId: tab.id, origin: 'user' });
    }
    const appliedSchemeId = getPayloadColorSchemeId(type, nextPayload) || getDefaultSchemeIdForType(type);
    applyRenderedThemeForTab(type, appliedSchemeId, tab.id, `${reason}-immediate`);
    scheduleColorSchemeTimeout(type, tab.id, `${reason}-delayed-40`, () => {
      applyRenderedThemeForTab(type, appliedSchemeId, tab.id, `${reason}-delayed-40`);
    }, 40);
    scheduleColorSchemeTimeout(type, tab.id, `${reason}-delayed-180`, () => {
      applyRenderedThemeForTab(type, appliedSchemeId, tab.id, `${reason}-delayed-180`);
    }, 180);
    syncActiveTabVisuals(reason);
    return true;
  }

  function applySchemeToActiveTab(type, schemeId, options){
    const opts = ensureObject(options);
    const scheme = getScheme(schemeId);
    const main = global.Main || {};
    const session = main.session;
    const components = main.components;
    if(!session || !components){
      debugLog('Debug: colorSchemes apply skipped', { reason: 'missing-main-modules', type });
      return false;
    }
    const tab = getActiveTab();
    if(!tab || tab.type !== type){
      debugLog('Debug: colorSchemes apply skipped', { reason: 'inactive-type-mismatch', type, activeType: tab?.type || null });
      return false;
    }

    const workspace = typeof components.get === 'function' ? components.get(type) : null;
    if(!workspace){
      debugLog('Debug: colorSchemes apply skipped', { reason: 'missing-workspace', type });
      return false;
    }

    const undoManager = Shared.undoManager || null;
    let payloadBeforeScheme = tab.payload;
    if(!payloadBeforeScheme){
      payloadBeforeScheme = typeof workspace.createEmptyPayload === 'function'
        ? workspace.createEmptyPayload()
        : { type, config: {} };
    }
    const sourcePayload = cloneThemePayload(payloadBeforeScheme, type);
    const shouldRecordUndo = opts.recordUndo === true
      && typeof undoManager?.recordStateChange === 'function';
    const colorContext = typeof workspace.getColorSchemeContext === 'function'
      ? workspace.getColorSchemeContext({ tabId: tab.id, type, reason: `color-scheme-context-${type}` })
      : null;
    if(Array.isArray(colorContext?.labelKeys) && colorContext.labelKeys.length){
      const labelColors = ensureObject(sourcePayload.config?.labelColors);
      colorContext.labelKeys.forEach(label => {
        const key = String(label || '').trim();
        if(key && !Object.prototype.hasOwnProperty.call(labelColors, key)){
          labelColors[key] = '';
        }
      });
      sourcePayload.config.labelColors = labelColors;
    }

    let nextPayload = applySchemeToPayload(type, sourcePayload, scheme, {
      forceColors: opts.colorMode !== 'match'
    });
    if(opts.colorMode === 'match'){
      nextPayload = applyMatchedDatasetColors(type, sourcePayload, nextPayload, scheme);
    }
    syncSharedScatterPalette(type, scheme);

    if(!commitAndProjectColorSchemePayload(type, tab.id, nextPayload, {
      reason: `color-scheme-${type}`,
      source: 'color-scheme'
    })){
      return false;
    }

    if(shouldRecordUndo){
      const undoPayload = cloneThemePayload(sourcePayload, type);
      const redoPayload = cloneThemePayload(nextPayload, type);
      undoManager.recordStateChange({
        tabId: tab.id,
        label: `color-scheme:${scheme.id}`,
        scope: type,
        from: undoPayload,
        to: redoPayload,
        equals: (first, second) => colorSchemePayloadsEqual(type, first, second),
        sessionCommit: false,
        apply: (value, phase) => commitAndProjectColorSchemePayload(type, tab.id, value, {
          reason: `${phase || 'apply'}-color-scheme-${type}`,
          source: 'color-scheme-history'
        })
      });
    }

    debugLog('Debug: colorSchemes applied to active tab', { type, tabId: tab.id, scheme: scheme.id });
    return true;
  }

  function findSchemeFieldset(panel){
    if(!panel || typeof panel.querySelector !== 'function') return null;
    return panel.querySelector('[data-color-scheme-fieldset="1"]');
  }

  function findGraphSelectionFieldset(panel){
    if(!panel || !panel.children) return null;
    const children = Array.from(panel.children);
    for(let i = 0; i < children.length; i += 1){
      const fieldset = children[i];
      if(!fieldset || fieldset.tagName !== 'FIELDSET') continue;
      if(fieldset.dataset?.graphSelectionFieldset === '1'){
        return fieldset;
      }
      if(typeof fieldset.querySelector !== 'function'){
        continue;
      }
      if(fieldset.querySelector('select[id$="GraphType"],select[id$="PlotType"],select[id$="ChartType"]')){
        return fieldset;
      }
      if(fieldset.querySelector('#lineDisplayMode,#lineViewMode,#pcaMethod,#pcaViewMode,#heatmapView')){
        return fieldset;
      }
    }
    return null;
  }

  function readActiveSchemeForType(type){
    const active = getActiveTab();
    if(!active || active.type !== type || !active.payload) return getDefaultSchemeIdForType(type);
    if(type === 'venn'){
      return normalizePresetSchemeId(active.payload.style?.colorScheme, type);
    }
    if(type === 'surface'){
      return normalizeSurfaceSchemeId(active.payload.config?.colorScheme);
    }
    return normalizePresetSchemeId(active.payload.config?.colorScheme, type);
  }

  function resolveDisplayedSchemeIdForType(type, options){
    if(type === 'surface'){
      return normalizeSurfaceSchemeId(readActiveSchemeForType(type));
    }
    const actualSchemeId = readActiveSchemeForType(type);
    const payload = getComparisonPayload(type, options);
    if(!payload){
      return actualSchemeId;
    }
    return payloadMatchesPreset(type, payload, actualSchemeId) ? actualSchemeId : CUSTOM_SCHEME_ID;
  }

  function getActiveSignature(){
    const tab = getActiveTab();
    if(!tab || !tab.type || tab.isWelcome) return null;
    const schemeId = readActiveSchemeForType(tab.type) || DEFAULT_SCHEME_ID;
    const displayedSchemeId = resolveDisplayedSchemeIdForType(tab.type) || schemeId;
    return `${tab.id}::${tab.type}::${schemeId}::${displayedSchemeId}`;
  }

  function scheduleActiveVisualSync(reason, options){
    if(state.pendingSyncTimer){
      Shared.componentLifecycle?.clearComponentTimeout?.(getColorSchemeAsyncOwner('colorSchemes'), state.pendingSyncTimer);
    }
    const tab = getActiveTab();
    state.pendingSyncTimer = scheduleColorSchemeTimeout(tab?.type || 'colorSchemes', tab?.id || null, reason || 'color-scheme-active-visual-sync', () => {
      state.pendingSyncTimer = null;
      syncActiveTabVisuals(reason, options);
    }, 60);
  }

  function isManualColorEditTarget(target){
    if(!(target instanceof global.Element)){
      return false;
    }
    if(target.closest('[data-color-scheme-fieldset="1"]')){
      return false;
    }
    if(String(target.getAttribute?.('type') || '').toLowerCase() === 'color'){
      return true;
    }
    const fragments = [
      target.id || '',
      target.getAttribute?.('name') || '',
      typeof target.className === 'string' ? target.className : '',
      target.getAttribute?.('aria-label') || '',
      target.getAttribute?.('data-field') || '',
      target.getAttribute?.('data-style-field') || '',
      target.getAttribute?.('data-color-target') || ''
    ];
    return /color|fill|stroke|border|palette|ramp|background|negative|positive|zero/i.test(fragments.join(' '));
  }

  function attachManualColorListeners(){
    const doc = global.document;
    if(!doc) return;
    const handlePotentialColorEdit = evt => {
      if(!isManualColorEditTarget(evt?.target)){
        return;
      }
      scheduleActiveVisualSync('manual-color-edit', { preferWorkspace: true });
    };
    doc.addEventListener('input', handlePotentialColorEdit, true);
    doc.addEventListener('change', handlePotentialColorEdit, true);
  }

  function syncActiveTabVisuals(reason, options){
    const tab = getActiveTab();
    if(!tab || !tab.type || tab.isWelcome) return;
    const schemeId = readActiveSchemeForType(tab.type) || DEFAULT_SCHEME_ID;
    const displayedSchemeId = resolveDisplayedSchemeIdForType(tab.type, options) || schemeId;
    const scopedRoot = resolveTabScopedRoot(tab.type, tab, { allowPageFallback: false });
    const controls = scopedRoot && typeof scopedRoot.querySelectorAll === 'function'
      ? Array.from(scopedRoot.querySelectorAll(`select[data-color-scheme-select="1"][data-component-type="${tab.type}"]`))
      : [];
    controls.forEach(control => {
      if(control.value !== displayedSchemeId){
        control.value = displayedSchemeId;
      }
      syncPickerElement(control, displayedSchemeId);
    });
    if(!controls.length){
      const controlState = state.controlsByType[tab.type] || {};
      const fallbackControl = controlState.select || null;
      if(fallbackControl){
        if(fallbackControl.value !== displayedSchemeId){
          fallbackControl.value = displayedSchemeId;
        }
        syncPickerElement(fallbackControl, displayedSchemeId);
      }
    }
    syncSharedScatterPalette(tab.type, getScheme(schemeId));
    applyRenderedThemeForTab(tab.type, schemeId, tab.id, reason || 'sync-active-visuals');
    debugLog('Debug: colorSchemes visuals synced', { reason, tabId: tab.id, type: tab.type, scheme: schemeId, displayedScheme: displayedSchemeId });
  }

  function startActiveTabObserver(){
    if(state.activeTabObserver || !global.MutationObserver){
      return;
    }
    const tabList = global.document?.getElementById?.('workspaceTabsList');
    if(!tabList){
      return;
    }
    const syncForActiveTabChange = () => {
      const signature = getActiveSignature();
      if(signature === state.lastActiveSignature){
        return;
      }
      state.lastActiveSignature = signature;
      if(!signature){
        return;
      }
      scheduleActiveVisualSync('tab-change', { preferWorkspace: true });
    };
    state.activeTabObserver = new global.MutationObserver(syncForActiveTabChange);
    state.activeTabObserver.observe(tabList, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-tab-id']
    });
    state.lastActiveSignature = getActiveSignature();
  }


  function attachLifecycleVisualSync(){
    if(state.lifecycleSyncAttached){
      return;
    }
    const shouldSyncAction = action => {
      const normalized = String(action || '').trim().toLowerCase();
      if(!normalized){
        return false;
      }
      return normalized === 'runtime-render-cache-restored'
        || normalized === 'saved-render-cache-restored'
        || normalized === 'draw-executed';
    };
    const handleLifecycleEvent = evt => {
      const detail = evt?.detail || evt || null;
      if(!detail || !shouldSyncAction(detail.action)){
        return;
      }
      const active = getActiveTab();
      if(!active || !active.type || active.isWelcome){
        return;
      }
      if(detail.tabId && String(detail.tabId) !== String(active.id)){
        return;
      }
      if(detail.componentKey && String(detail.componentKey) !== String(active.type)){
        return;
      }
      const expectedTabId = String(active.id);
      const expectedType = String(active.type);
      const runSync = phase => {
        const current = getActiveTab();
        if(!current || current.isWelcome){
          return;
        }
        if(String(current.id) !== expectedTabId || String(current.type || '') !== expectedType){
          return;
        }
        syncActiveTabVisuals(`lifecycle-${detail.action}-${phase}`, { preferWorkspace: true });
      };
      scheduleActiveVisualSync(`lifecycle-${detail.action}-queued`, { preferWorkspace: true });
      scheduleColorSchemeFrame(expectedType, expectedTabId, 'color-scheme-lifecycle-sync-raf', () => runSync('raf'));
      scheduleColorSchemeTimeout(expectedType, expectedTabId, 'color-scheme-lifecycle-sync-delay-90', () => runSync('delay-90'), 90);
      scheduleColorSchemeTimeout(expectedType, expectedTabId, 'color-scheme-lifecycle-sync-delay-220', () => runSync('delay-220'), 220);
    };
    if(Shared.componentLifecycle && typeof Shared.componentLifecycle.onLifecycleEvent === 'function'){
      Shared.componentLifecycle.onLifecycleEvent(handleLifecycleEvent);
      state.lifecycleSyncAttached = true;
      return;
    }
    global.addEventListener?.('graphitix:lifecycle-event', handleLifecycleEvent);
    state.lifecycleSyncAttached = true;
  }

  function renderControlForType(type, descriptor){
    const doc = global.document;
    const page = doc.getElementById(descriptor.pageId);
    if(!page) return;
    const panel = page.querySelector(descriptor.panelSelector);
    if(!panel) return;
    if(findSchemeFieldset(panel)) return;

    const fieldset = doc.createElement('fieldset');
    fieldset.className = 'config-panel__fieldset';
    fieldset.setAttribute('data-color-scheme-fieldset', '1');

    const legend = doc.createElement('legend');
    legend.textContent = 'Color scheme';
    fieldset.appendChild(legend);

    const row = doc.createElement('div');
    row.className = 'control config-panel__line';

    const label = doc.createElement('label');
    label.className = 'config-panel__label';
    label.textContent = 'Palette';

    const select = doc.createElement('select');
    select.id = `${type}ColorSchemeSelect`;
    select.dataset.colorSchemeSelect = '1';
    select.dataset.componentType = type;
    select.setAttribute('data-undo-ignore', '1');
    const schemeIds = (type === 'surface')
      ? SURFACE_SCHEME_OPTION_IDS
      : BASE_SCHEME_OPTION_IDS;
    schemeIds.forEach(id => {
      const option = doc.createElement('option');
      option.value = id;
      option.textContent = SCHEMES[id].label;
      select.appendChild(option);
    });
    if(type !== 'surface'){
      const customOption = doc.createElement('option');
      customOption.value = CUSTOM_SCHEME_ID;
      customOption.textContent = 'Custom';
      customOption.disabled = true;
      select.appendChild(customOption);
    }

    const initialDisplayedSchemeId = resolveDisplayedSchemeIdForType(type);
    select.value = initialDisplayedSchemeId;
    select.classList.add('visually-hidden');

    const picker = doc.createElement('div');
    picker.className = 'color-scheme-picker';

    const pickerButton = doc.createElement('button');
    pickerButton.type = 'button';
    pickerButton.className = 'color-scheme-picker__button';
    pickerButton.dataset.colorSchemeToggle = '1';
    pickerButton.dataset.componentType = type;
    pickerButton.setAttribute('aria-haspopup', 'listbox');
    pickerButton.setAttribute('aria-expanded', 'false');

    const pickerButtonLabel = doc.createElement('span');
    pickerButtonLabel.className = 'color-scheme-picker__label';

    const pickerButtonSwatches = doc.createElement('span');
    pickerButtonSwatches.className = 'color-scheme-picker__current-swatches';

    const pickerButtonCaret = doc.createElement('span');
    pickerButtonCaret.className = 'color-scheme-picker__caret';
    pickerButtonCaret.textContent = '\u25be';

    pickerButton.appendChild(pickerButtonLabel);
    pickerButton.appendChild(pickerButtonSwatches);
    pickerButton.appendChild(pickerButtonCaret);

    const pickerMenu = doc.createElement('div');
    pickerMenu.className = 'color-scheme-picker__menu';
    pickerMenu.setAttribute('role', 'listbox');
    pickerMenu.dataset.colorSchemeMenu = '1';
    pickerMenu.dataset.componentType = type;
    pickerMenu.hidden = true;
    pickerMenu.__pickerOwner = picker;

    schemeIds.forEach(id => {
      const optionButton = doc.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'color-scheme-picker__option';
      if(id === 'dark'){
        optionButton.classList.add('color-scheme-picker__option--dark-theme');
      }
      optionButton.setAttribute('role', 'option');
      optionButton.dataset.schemeId = id;
      optionButton.dataset.componentType = type;
      optionButton.appendChild(renderSchemeSwatches(doc, id, { limit: 4 }));
      const optionLabel = doc.createElement('span');
      optionLabel.className = 'color-scheme-picker__option-label';
      optionLabel.textContent = SCHEMES[id].label;
      optionButton.appendChild(optionLabel);
      pickerMenu.appendChild(optionButton);
    });
    if(type !== 'surface'){
      const customButton = doc.createElement('button');
      customButton.type = 'button';
      customButton.className = 'color-scheme-picker__option';
      customButton.setAttribute('role', 'option');
      customButton.dataset.schemeId = CUSTOM_SCHEME_ID;
      customButton.dataset.componentType = type;
      customButton.disabled = true;
      customButton.appendChild(renderSchemeSwatches(doc, CUSTOM_SCHEME_ID, { limit: 4 }));
      const customLabel = doc.createElement('span');
      customLabel.className = 'color-scheme-picker__option-label';
      customLabel.textContent = 'Custom';
      customButton.appendChild(customLabel);
      pickerMenu.appendChild(customButton);
    }

    const choice = doc.createElement('div');
    choice.className = 'color-scheme-picker__choice';
    choice.dataset.colorSchemeChoice = '1';
    choice.setAttribute('role', 'dialog');
    choice.setAttribute('aria-label', 'Apply color scheme');
    choice.hidden = true;

    const choiceTitle = doc.createElement('div');
    choiceTitle.className = 'color-scheme-picker__choice-title';
    choiceTitle.textContent = 'Custom colors detected';

    const choiceDescription = doc.createElement('div');
    choiceDescription.className = 'color-scheme-picker__choice-description';

    const matchButton = doc.createElement('button');
    matchButton.type = 'button';
    matchButton.className = 'color-scheme-picker__choice-button color-scheme-picker__choice-button--primary';
    matchButton.dataset.colorSchemeChoiceAction = 'match';
    matchButton.textContent = 'Match closest colors';
    const recommended = doc.createElement('span');
    recommended.className = 'color-scheme-picker__choice-recommended';
    recommended.textContent = 'Recommended';
    matchButton.appendChild(recommended);

    const replaceButton = doc.createElement('button');
    replaceButton.type = 'button';
    replaceButton.className = 'color-scheme-picker__choice-button';
    replaceButton.dataset.colorSchemeChoiceAction = 'replace';
    replaceButton.textContent = 'Replace all colors';

    const cancelButton = doc.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'color-scheme-picker__choice-cancel';
    cancelButton.dataset.colorSchemeChoiceAction = 'cancel';
    cancelButton.textContent = 'Cancel';

    choice.appendChild(choiceTitle);
    choice.appendChild(choiceDescription);
    choice.appendChild(matchButton);
    choice.appendChild(replaceButton);
    choice.appendChild(cancelButton);

    picker.appendChild(pickerButton);
    picker.appendChild(pickerMenu);
    picker.appendChild(choice);

    syncPickerElement(select, initialDisplayedSchemeId);

    label.appendChild(select);
    label.appendChild(picker);
    row.appendChild(label);

    const hint = doc.createElement('div');
    hint.className = 'idx-inline-048';

    fieldset.appendChild(row);
    fieldset.appendChild(hint);

    if(type === 'box'){
      const modeRow = doc.createElement('div');
      modeRow.className = 'control config-panel__line';

      const modeLabel = doc.createElement('span');
      modeLabel.className = 'config-panel__label';
      modeLabel.textContent = 'Colors';
      modeRow.appendChild(modeLabel);

      const modeWrap = doc.createElement('span');
      modeWrap.className = 'box-colors__mode';

      const unifiedLabel = doc.createElement('label');
      const unifiedInput = doc.createElement('input');
      unifiedInput.type = 'radio';
      unifiedInput.name = 'boxColorMode';
      unifiedInput.id = 'boxColorUnified';
      unifiedInput.value = 'unified';
      unifiedInput.checked = true;
      unifiedLabel.appendChild(unifiedInput);
      unifiedLabel.appendChild(doc.createTextNode(' Unified'));

      const individualLabel = doc.createElement('label');
      const individualInput = doc.createElement('input');
      individualInput.type = 'radio';
      individualInput.name = 'boxColorMode';
      individualInput.id = 'boxColorIndividual';
      individualInput.value = 'individual';
      individualLabel.appendChild(individualInput);
      individualLabel.appendChild(doc.createTextNode(' Individual'));

      modeWrap.appendChild(unifiedLabel);
      modeWrap.appendChild(individualLabel);
      modeRow.appendChild(modeWrap);
      fieldset.appendChild(modeRow);
    }
    if(type === 'scatter'){
      const colorModeRow = panel.querySelector('#scatterColorModeRow');
      const colorModeLine = colorModeRow
        ? (colorModeRow.closest('.config-panel__line') || colorModeRow.parentElement)
        : null;
      if(colorModeLine && colorModeLine.parentNode !== fieldset){
        fieldset.insertBefore(colorModeLine, hint);
        debugLog('Debug: colorSchemes attached scatter color mode row', { type });
      }
    }

    const graphFieldset = findGraphSelectionFieldset(panel);
    if(graphFieldset && graphFieldset.parentNode === panel){
      let insertionAnchor = graphFieldset;
      if(type === 'heatmap'){
        const clusteringFieldset = panel.querySelector('.heatmap-clustering-panel');
        if(clusteringFieldset && clusteringFieldset.parentNode === panel){
          insertionAnchor = clusteringFieldset;
        }
      }else if(type === 'roc'){
        const classificationFieldset = panel.querySelector('[data-roc-classification-fieldset="1"]');
        if(classificationFieldset && classificationFieldset.parentNode === panel){
          insertionAnchor = classificationFieldset;
        }
      }
      if(insertionAnchor.nextSibling){
        panel.insertBefore(fieldset, insertionAnchor.nextSibling);
      }else{
        panel.appendChild(fieldset);
      }
      debugLog('Debug: colorSchemes inserted after graph selector', { type });
    }else{
      panel.insertBefore(fieldset, panel.firstChild || null);
      debugLog('Debug: colorSchemes inserted at panel start', { type });
    }

    if(Shared.formControls && typeof Shared.formControls.autoSizeSelect === 'function'){
      Shared.formControls.autoSizeSelect(select);
    }

    state.controlsByType[type] = { select };
    debugLog('Debug: colorSchemes control mounted', { type, pageId: descriptor.pageId });
  }

  namespace.getSchemes = function getSchemes(){
    const catalog = Shared.themeCatalog;
    if(catalog && typeof catalog.list === 'function'){
      const out = {};
      catalog.list().forEach(s => { out[s.id] = cloneValue(s); });
      if(Object.keys(out).length){
        return out;
      }
    }
    return cloneValue(SCHEMES);
  };

  namespace.getDefaultSchemeId = function getDefaultSchemeId(type){
    return getDefaultSchemeIdForType(type);
  };

  namespace.getSelectedSchemeId = function getSelectedSchemeId(type){
    return readActiveSchemeForType(type) || getDefaultSchemeIdForType(type);
  };

  namespace.resolveCategoricalPaletteForType = function resolveCategoricalPaletteForTypeExport(type, options){
    return resolveCategoricalPaletteForType(type, options);
  };

  namespace.resolveThemeState = function resolveThemeState(type, payload){
    const safeType = String(type || '').trim();
    const source = payload && typeof payload === 'object' ? payload : null;
    const rawScheme = safeType === 'venn'
      ? source?.style?.colorScheme
      : source?.config?.colorScheme;
    const schemeId = safeType === 'surface'
      ? normalizeSurfaceSchemeId(rawScheme || readActiveSchemeForType(safeType))
      : normalizePresetSchemeId(rawScheme || readActiveSchemeForType(safeType), safeType);
    const scheme = getScheme(schemeId);
    const tokens = ensureObject(scheme?.tokens);
    return {
      type: safeType || null,
      schemeId,
      isDark: schemeId === 'dark',
      textColor: String(tokens.textColor || '#000000'),
      background: String(tokens.background || '#ffffff'),
      axisColor: String(tokens.axisColor || '#000000'),
      gridColor: String(tokens.gridColor || '#dddddd'),
      borderColor: String(tokens.borderColor || '#000000')
    };
  };

  namespace.applyToSvg = function applyToSvg(type, svg, options){
    const safeType = String(type || '').trim();
    if(!safeType || !TYPE_TO_PAGE[safeType] || !svg){
      return false;
    }
    const opts = ensureObject(options);
    const requestedScheme = opts.schemeId || opts.colorScheme || readActiveSchemeForType(safeType) || getDefaultSchemeIdForType(safeType);
    const schemeId = safeType === 'surface'
      ? normalizeSurfaceSchemeId(requestedScheme)
      : normalizePresetSchemeId(requestedScheme, safeType);
    applySvgVisualTheme(svg, getScheme(schemeId));
    return true;
  };

  namespace.applyToActiveTab = function applyToActiveTab(type, schemeId, options){
    return applySchemeToActiveTab(type, schemeId, options);
  };

  namespace.refreshActiveTabVisuals = function refreshActiveTabVisuals(reason, options){
    syncActiveTabVisuals(reason || 'color-scheme-external-state-change', options);
  };

  // Apply a scheme to an arbitrary payload without mutating global defaults.
  // This is used by higher-level features (e.g. publication styles) that want
  // to recolor the current graph while keeping new-tab defaults immutable.
  namespace.applyToPayload = function applyToPayload(type, payload, schemeId){
    const scheme = getScheme(schemeId);
    const src = cloneValue(payload) || { type, config: {} };
    const srcType = type || src.type || null;
    if(!srcType){
      debugLog('Debug: colorSchemes.applyToPayload skipped', { reason: 'missing-type' });
      return src;
    }
    try{
      return applySchemeToPayload(srcType, src, scheme);
    }catch(err){
      console.error('colorSchemes.applyToPayload error', { type: srcType, scheme: scheme?.id || null, err });
      return src;
    }
  };

  namespace.applyDefaultToPayload = function applyDefaultToPayload(type, payload){
    const src = cloneValue(payload) || { type, config: {} };
    const srcType = type || src.type || null;
    if(!srcType){
      debugLog('Debug: colorSchemes.applyDefaultToPayload skipped', { reason: 'missing-type' });
      return src;
    }
    const scheme = getScheme(getDefaultSchemeIdForType(srcType));
    try{
      return applySchemeToPayload(srcType, src, scheme, { forceColors: true });
    }catch(err){
      console.error('colorSchemes.applyDefaultToPayload error', { type: srcType, scheme: scheme?.id || null, err });
      return src;
    }
  };

  namespace.init = function init(){
    if(state.initialized){
      debugLog('Debug: colorSchemes.init skipped - already initialized');
      return namespace;
    }
    try{
      if(Shared.themeCatalog && typeof Shared.themeCatalog.registerAll === 'function'){
        Shared.themeCatalog.registerAll(SCHEMES);
      }
      if(Shared.themeCatalog && typeof Shared.themeCatalog.setTypeDefault === 'function'){
        Object.keys(TYPE_DEFAULT_SCHEME_IDS).forEach(type => {
          Shared.themeCatalog.setTypeDefault(type, TYPE_DEFAULT_SCHEME_IDS[type]);
        });
      }
      if(Shared.themeCatalog && typeof Shared.themeCatalog.setTypeOptions === 'function'){
        Object.keys(TYPE_TO_PAGE).forEach(type => {
          const options = type === 'surface' ? SURFACE_SCHEME_OPTION_IDS : BASE_SCHEME_OPTION_IDS;
          Shared.themeCatalog.setTypeOptions(type, options);
        });
      }
      if(Shared.themeAdapters && typeof Shared.themeAdapters.installDefaultAdapters === 'function'){
        Shared.themeAdapters.installDefaultAdapters();
      }
    }catch(err){
      console.error('colorSchemes theme module init error', err);
    }
    Object.keys(TYPE_TO_PAGE).forEach(type => {
      renderControlForType(type, TYPE_TO_PAGE[type]);
      const initialScheme = getScheme(readActiveSchemeForType(type) || getDefaultSchemeIdForType(type));
      const controlState = state.controlsByType[type] || {};
      if(controlState.select){
        controlState.select.value = initialScheme.id;
        syncPickerElement(controlState.select, initialScheme.id);
      }
    });
    attachColorSchemeControlListeners();
    attachManualColorListeners();
    attachLifecycleVisualSync();
    startActiveTabObserver();
    syncActiveTabVisuals('init');
    state.initialized = true;
    debugLog('Debug: colorSchemes.init complete', {
      types: Object.keys(TYPE_TO_PAGE),
      defaultScheme: DEFAULT_SCHEME_ID
    });
    return namespace;
  };
})(window);
