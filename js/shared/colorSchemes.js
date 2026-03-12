(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.colorSchemes = Shared.colorSchemes || {};

  const DEFAULT_SCHEME_ID = 'scientific';
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
  const DEFAULT_BOX_CLASSIC_CATEGORICAL = Object.freeze([
    '#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#800080', '#00a6d6', '#8b4513', '#ff1493'
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
      label: 'Color',
      categorical: Object.freeze(DEFAULT_CLASSIC_CATEGORICAL),
      sequential: Object.freeze(['#0000ff', '#4f4fff', '#ff0000', '#00aa00', '#ff8c00', '#800080']),
      diverging: DEFAULT_HEATMAP_DIVERGING,
      tokens: DEFAULT_SCIENTIFIC_TOKENS,
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
    highcontrast: Object.freeze({
      id: 'highcontrast',
      label: 'High Contrast',
      categorical: Object.freeze(['#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#7a00cc', '#00b7c7', '#cc007a', '#333333']),
      sequential: Object.freeze(['#000000', '#0022aa', '#0066ff', '#00aa66', '#88cc00', '#ffcc00']),
      diverging: Object.freeze({ negative: '#0033cc', zero: '#ffffff', positive: '#cc0000' }),
      tokens: Object.freeze({ axisColor: '#000000', gridColor: '#bcbcbc', borderColor: '#000000', textColor: '#000000', background: '#ffffff' }),
      densityPalette: 'turbo',
      surfaceRamp: 'turbo'
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
    preferredByType: {},
    monitorTimer: null,
    lastActiveSignature: null
  };

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

  function lighten(hex, factor){
    const rgb = hexToRgb(hex);
    if(!rgb) return '#ffffff';
    const f = Number.isFinite(factor) ? factor : 0.22;
    return rgbToHex({
      r: rgb.r + (255 - rgb.r) * f,
      g: rgb.g + (255 - rgb.g) * f,
      b: rgb.b + (255 - rgb.b) * f
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

  function deriveBorderColor(fill, fallback){
    const source = typeof fill === 'string' ? fill : null;
    const luminance = relativeLuminance(source);
    if(luminance === null){
      return typeof fallback === 'string' && fallback ? fallback : '#111111';
    }
    if(luminance < 0.18){
      return lighten(source, 0.42);
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
    return SCHEMES[key] || SCHEMES[DEFAULT_SCHEME_ID];
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

  function ensureMap(input){
    return input && typeof input === 'object' ? input : {};
  }

  function ensureArray(input){
    return Array.isArray(input) ? input : [];
  }

  function ensureObject(input){
    return input && typeof input === 'object' ? input : {};
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

  function collectUniqueColumnValues(matrix, colIndex, options){
    const rows = ensureArray(matrix);
    const opts = options || {};
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
    return recolorStyleMap(map, keys, palette, options);
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

  function parseNumberLike(value){
    if(value === null || value === undefined) return null;
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function resolveSvgViewport(svg){
    let x = 0;
    let y = 0;
    let width = null;
    let height = null;

    const viewBoxAttr = svg.getAttribute && svg.getAttribute('viewBox');
    if(typeof viewBoxAttr === 'string' && viewBoxAttr.trim()){
      const parts = viewBoxAttr.trim().split(/[,\s]+/).map(parseNumberLike);
      if(parts.length >= 4 && parts.every(Number.isFinite)){
        x = parts[0];
        y = parts[1];
        width = parts[2];
        height = parts[3];
      }
    }

    if(!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)){
      const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
      if(vb && Number.isFinite(vb.width) && vb.width > 0 && Number.isFinite(vb.height) && vb.height > 0){
        x = Number.isFinite(vb.x) ? vb.x : 0;
        y = Number.isFinite(vb.y) ? vb.y : 0;
        width = vb.width;
        height = vb.height;
      }
    }

    if(!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)){
      const attrWidth = parseNumberLike(svg.getAttribute && svg.getAttribute('width'));
      const attrHeight = parseNumberLike(svg.getAttribute && svg.getAttribute('height'));
      if(Number.isFinite(attrWidth) && attrWidth > 0 && Number.isFinite(attrHeight) && attrHeight > 0){
        width = attrWidth;
        height = attrHeight;
      }
    }

    if(!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)){
      const box = typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : null;
      if(box && Number.isFinite(box.width) && box.width > 0 && Number.isFinite(box.height) && box.height > 0){
        width = box.width;
        height = box.height;
      }
    }

    if(!(Number.isFinite(width) && width > 0)){
      width = 100;
    }
    if(!(Number.isFinite(height) && height > 0)){
      height = 100;
    }

    return { x, y, width, height };
  }

  function ensureBackgroundRectPosition(svg, rect){
    const children = Array.from(svg.childNodes || []);
    let reference = null;
    for(let i = 0; i < children.length; i += 1){
      const child = children[i];
      if(!child || child === rect || child.nodeType !== 1) continue;
      const tag = String(child.nodeName || '').toLowerCase();
      if(tag === 'defs' || tag === 'style' || tag === 'title' || tag === 'desc' || tag === 'metadata'){
        continue;
      }
      reference = child;
      break;
    }
    if(reference){
      if(rect.nextSibling !== reference){
        svg.insertBefore(rect, reference);
      }
      return;
    }
    if(svg.firstChild !== rect){
      svg.insertBefore(rect, svg.firstChild || null);
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

  function almostEqual(a, b){
    if(!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= 0.5;
  }

  function isBackgroundRectOutdated(svg, rect){
    if(!svg || !rect) return true;
    const viewport = resolveSvgViewport(svg);
    const rx = parseNumberLike(rect.getAttribute('x'));
    const ry = parseNumberLike(rect.getAttribute('y'));
    const rw = parseNumberLike(rect.getAttribute('width'));
    const rh = parseNumberLike(rect.getAttribute('height'));
    if(!(Number.isFinite(rx) && Number.isFinite(ry) && Number.isFinite(rw) && Number.isFinite(rh))){
      return true;
    }
    if(!almostEqual(rx, viewport.x)) return true;
    if(!almostEqual(ry, viewport.y)) return true;
    if(!almostEqual(rw, viewport.width)) return true;
    if(!almostEqual(rh, viewport.height)) return true;
    return false;
  }

  function hasUnthemedText(svg){
    if(!svg) return false;
    return !!svg.querySelector('text:not([data-color-scheme-text-themed="1"]),tspan:not([data-color-scheme-text-themed="1"])');
  }

  function applySvgVisualTheme(svg, scheme){
    if(!svg || typeof svg.querySelector !== 'function') return;
    const tokens = scheme.tokens || {};
    const isDark = scheme.id === 'dark';
    const background = tokens.background || '#ffffff';
    const textColor = tokens.textColor || '#f2f2f2';
    svg.setAttribute('data-color-scheme', scheme.id);
    const is3dView = String(svg.dataset?.viewMode || '').toLowerCase() === '3d';
    if(svg.style){
      svg.style.removeProperty('background-color');
      svg.style.removeProperty('color');
    }

    let backgroundRect = svg.querySelector('[data-color-scheme-background="1"]');
    if(is3dView){
      // Keep 3D interaction surfaces untouched; draw code handles interactive backgrounds.
      removeNode(backgroundRect);
      restoreTextTheme(svg);
      const styleNode3d = svg.querySelector('[data-color-scheme-style="1"]');
      removeNode(styleNode3d);
      return;
    }
    if(isDark){
      if(!backgroundRect){
        backgroundRect = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
        backgroundRect.setAttribute('data-color-scheme-background', '1');
        backgroundRect.setAttribute('pointer-events', 'none');
      }
      const viewport = resolveSvgViewport(svg);
      backgroundRect.setAttribute('x', String(viewport.x));
      backgroundRect.setAttribute('y', String(viewport.y));
      backgroundRect.setAttribute('width', String(viewport.width));
      backgroundRect.setAttribute('height', String(viewport.height));
      backgroundRect.setAttribute('fill', background);
      ensureBackgroundRectPosition(svg, backgroundRect);
      applyDarkTextTheme(svg, textColor);
    }else{
      removeNode(backgroundRect);
      restoreTextTheme(svg);
    }

    const styleNode = svg.querySelector('[data-color-scheme-style="1"]');
    removeNode(styleNode);
  }

  function getPrimarySvgBoxes(page){
    if(!page || typeof page.querySelectorAll !== 'function') return [];
    return Array.from(page.querySelectorAll('.svgbox'));
  }

  function applyRenderedTheme(type, schemeId){
    const descriptor = TYPE_TO_PAGE[type];
    if(!descriptor) return;
    const page = global.document?.getElementById(descriptor.pageId);
    if(!page) return;
    const scheme = getScheme(schemeId);
    const tokens = scheme.tokens || {};
    const boxes = getPrimarySvgBoxes(page);
    boxes.forEach(box => {
      if(!box || !box.style) return;
      box.setAttribute('data-color-scheme', scheme.id);
      if(scheme.id === 'dark'){
        box.style.backgroundColor = tokens.background || '#000000';
      }else{
        box.style.removeProperty('background-color');
      }
      box.style.removeProperty('color');
      const svg = box.querySelector('svg');
      if(svg){
        applySvgVisualTheme(svg, scheme);
      }
    });
  }

  function syncSharedScatterPalette(type, scheme){
    const categorical = resolveCategoricalPalette(type, scheme);
    if(!categorical.length){
      return;
    }
    const palette = Shared.palette = Shared.palette || {};
    if(typeof palette.setDefaultScatterColors === 'function'){
      palette.setDefaultScatterColors(categorical);
      return;
    }
    const target = Array.isArray(palette.DEFAULT_SCATTER_COLORS)
      ? palette.DEFAULT_SCATTER_COLORS
      : [];
    target.length = 0;
    categorical.forEach(color => target.push(color));
    palette.DEFAULT_SCATTER_COLORS = target;
    global.DEFAULT_SCATTER_COLORS = target;
  }

  function applySchemeToPayload(type, payload, scheme){
    const next = cloneValue(payload) || { type, config: {} };
    const cfg = next.config = next.config && typeof next.config === 'object' ? next.config : {};
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
      const pcaLabelKeys = uniqueStrings(
        Object.keys(ensureMap(cfg.labelColors)).concat(collectUniqueColumnValues(next.data, 0, { startRow: 1 }))
      );
      cfg.labelColors = buildColorMap(pcaLabelKeys, categorical);
      cfg.labelPointStyles = recolorStyleMap(
        cfg.labelPointStyles,
        pcaLabelKeys.concat(Object.keys(ensureObject(cfg.labelPointStyles))),
        categorical,
        {
          force: true,
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
      applyAxisTokens(cfg, scheme);
      return next;
    }

    if(type === 'line'){
      cfg.fill = (scientificDefaults && scientificDefaults.fill) || categorical[0] || cfg.fill;
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
          fillFields: ['fill', 'markerFill', 'color'],
          strokeFields: ['lineStroke', 'markerStroke', 'borderColor', 'stroke']
        });
      });
      cfg.seriesStyles = nextSeriesStyles;
      applyAxisTokens(cfg, scheme);
      return next;
    }

    if(type === 'box'){
      const grayscaleMode = scheme.id === 'grayscale';
      const boxScientificPalette = scientificDefaults ? ensureArray(scientificDefaults.categorical).slice() : [];
      const boxPalette = boxScientificPalette.length
        ? boxScientificPalette
        : buildBoxPalette(scheme, categorical, cfg.fill);
      const primaryFill = (scientificDefaults && scientificDefaults.fill) || boxPalette[0] || categorical[0] || cfg.fill;
      const resolvedBoxPalette = boxPalette.length
        ? boxPalette
        : (categorical.length ? categorical : [primaryFill || '#666666']);
      const unifiedBorder = grayscaleMode
        ? '#000000'
        : ((scientificDefaults && scientificDefaults.border)
          || deriveBorderColor(primaryFill, tokens.borderColor || cfg.border));
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
        grayscaleMode
          ? '#000000'
          : deriveBorderColor(color, tokens.borderColor || darken(color, 0.22))
      ));
      cfg.shapeGlobalStyle = patchStyleColorFields(cfg.shapeGlobalStyle, {
        fill: primaryFill || null,
        stroke: unifiedBorder || tokens.borderColor || null,
        force: false,
        fillFields: ['fill', 'color'],
        strokeFields: ['stroke', 'borderColor', 'border']
      });
      cfg.shapeStyles = recolorIndexedStyleMap(cfg.shapeStyles, resolvedBoxPalette, {
        fillFields: ['fill', 'color'],
        stroke: unifiedBorder || tokens.borderColor || null,
        strokeFields: ['stroke', 'borderColor', 'border']
      });
      cfg.pointGlobalStyle = patchStyleColorFields(cfg.pointGlobalStyle, {
        fill: primaryFill || null,
        stroke: unifiedBorder || tokens.borderColor || null,
        force: false,
        fillFields: ['fill', 'color', 'markerFill'],
        strokeFields: ['stroke', 'borderColor', 'markerStroke', 'border']
      });
      cfg.pointStyles = recolorIndexedStyleMap(cfg.pointStyles, resolvedBoxPalette, {
        fillFields: ['fill', 'color', 'markerFill'],
        stroke: unifiedBorder || tokens.borderColor || null,
        strokeFields: ['stroke', 'borderColor', 'markerStroke', 'border']
      });
      cfg.summaryGlobalStyle = patchStyleColorFields(cfg.summaryGlobalStyle, {
        fill: grayscaleMode
          ? '#000000'
          : ((scientificDefaults && scientificDefaults.summaryColor)
            || resolvedBoxPalette[1]
            || resolvedBoxPalette[0]
            || null),
        force: true,
        fillFields: ['color']
      });
      cfg.summaryStyles = recolorIndexedStyleMap(cfg.summaryStyles, grayscaleMode ? ['#000000'] : resolvedBoxPalette, {
        force: true,
        fillFields: ['color']
      });
      cfg.significance = ensureObject(cfg.significance);
      cfg.significance.color = grayscaleMode
        ? '#000000'
        : ((scientificDefaults && scientificDefaults.significanceColor)
          || resolvedBoxPalette[3]
          || resolvedBoxPalette[0]
          || cfg.significance.color);
      applyAxisTokens(cfg, scheme);
      return next;
    }

    if(type === 'hist'){
      cfg.fill = (scientificDefaults && scientificDefaults.fill) || categorical[0] || cfg.fill;
      cfg.border = (scientificDefaults && scientificDefaults.border) || tokens.borderColor || cfg.border;
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
      cfg.settings = cfg.settings && typeof cfg.settings === 'object' ? cfg.settings : {};
      cfg.settings.colorRamp = (scientificDefaults && scientificDefaults.surfaceRamp) || scheme.surfaceRamp || cfg.settings.colorRamp;
      if(scientificDefaults && scientificDefaults.axisColor){
        cfg.settings.axisColor = scientificDefaults.axisColor;
      }else if(tokens.axisColor){
        cfg.settings.axisColor = tokens.axisColor;
      }else if(tokens.borderColor){
        cfg.settings.axisColor = tokens.borderColor;
      }
      if(scientificDefaults && scientificDefaults.textColor){
        cfg.settings.textColor = scientificDefaults.textColor;
      }else if(tokens.textColor){
        cfg.settings.textColor = tokens.textColor;
      }
      if(scientificDefaults && scientificDefaults.backgroundColor){
        cfg.settings.backgroundColor = scientificDefaults.backgroundColor;
      }else if(tokens.background){
        cfg.settings.backgroundColor = tokens.background;
      }
      cfg.settings.colorScheme = scheme.id;
      cfg.colorScheme = scheme.id;
      if(scientificDefaults && scientificDefaults.textColor){
        cfg.textColor = scientificDefaults.textColor;
      }else if(tokens.textColor){
        cfg.textColor = tokens.textColor;
      }
      if(scientificDefaults && scientificDefaults.backgroundColor){
        cfg.backgroundColor = scientificDefaults.backgroundColor;
      }else if(tokens.background){
        cfg.backgroundColor = tokens.background;
      }
      if(cfg.gridStyle && typeof cfg.gridStyle === 'object' && tokens.gridColor){
        cfg.gridStyle.color = tokens.gridColor;
      }
      return next;
    }

    return next;
  }

  function getActiveTab(){
    const session = global.Main?.session;
    if(!session || typeof session.getActiveTab !== 'function') return null;
    return session.getActiveTab();
  }

  function setDefaultForNewTabs(type, scheme){
    const main = global.Main || {};
    const session = main.session;
    const domControls = main.domControls;
    const components = main.components;
    if(!session || !domControls || typeof domControls.setWorkspaceDefaultPayload !== 'function'){
      debugLog('Debug: colorSchemes default update skipped', { type, reason: 'missing-session-or-domControls' });
      return;
    }
    const workspace = components && typeof components.get === 'function' ? components.get(type) : null;
    if(!workspace || typeof workspace.createEmptyPayload !== 'function'){
      debugLog('Debug: colorSchemes default update skipped', { type, reason: 'missing-workspace-createEmptyPayload' });
      return;
    }
    let emptyPayload = null;
    try{
      emptyPayload = workspace.createEmptyPayload();
    }catch(err){
      console.error('colorSchemes createEmptyPayload error', { type, err });
      return;
    }
    const patched = applySchemeToPayload(type, emptyPayload, scheme);
    domControls.setWorkspaceDefaultPayload(session, type, patched);
  }

  function applySchemeToActiveTab(type, schemeId){
    const scheme = getScheme(schemeId);
    const main = global.Main || {};
    const session = main.session;
    const domControls = main.domControls;
    const components = main.components;
    if(!session || !domControls || !components){
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

    try{
      if(typeof session.persistActiveTabState === 'function'){
        session.persistActiveTabState(tab, { reason: `color-scheme-pre-${type}` });
      }
    }catch(err){
      console.error('colorSchemes pre-persist error', { type, err });
    }

    const sourcePayload = cloneValue(tab.payload)
      || (typeof workspace.getPayload === 'function' ? workspace.getPayload() : null)
      || (typeof workspace.createEmptyPayload === 'function' ? workspace.createEmptyPayload() : { type, config: {} });

    const nextPayload = applySchemeToPayload(type, sourcePayload, scheme);
    syncSharedScatterPalette(type, scheme);

    if(typeof session.assignTabPayload === 'function'){
      session.assignTabPayload(tab, cloneValue(nextPayload), { reason: `color-scheme-${type}` });
    }else{
      tab.payload = cloneValue(nextPayload);
    }

    let appliedViaWorkspaceFastPath = false;
    if(typeof workspace.applyColorSchemePayload === 'function'){
      try{
        const fastResult = workspace.applyColorSchemePayload(cloneValue(nextPayload), {
          reason: `color-scheme-${type}`,
          source: 'color-scheme',
          viewOnly: true
        });
        appliedViaWorkspaceFastPath = fastResult !== false;
      }catch(err){
        console.error('colorSchemes workspace fast-path error', { type, err });
      }
    }

    if(!appliedViaWorkspaceFastPath && typeof domControls.applyWorkspacePayload === 'function'){
      domControls.applyWorkspacePayload(workspace, cloneValue(nextPayload), { reason: `color-scheme-${type}` });
    }

    try{
      if(typeof session.persistActiveTabState === 'function'){
        session.persistActiveTabState(tab, { reason: `color-scheme-post-${type}`, forcePreviewCapture: true });
      }
    }catch(err){
      console.error('colorSchemes post-persist error', { type, err });
    }

    if(typeof session.markSessionDirty === 'function'){
      session.markSessionDirty('color-scheme-applied', { type, tabId: tab.id, scheme: scheme.id });
    }

    state.preferredByType[type] = scheme.id;
    setDefaultForNewTabs(type, scheme);
    applyRenderedTheme(type, scheme.id);
    global.setTimeout(() => applyRenderedTheme(type, scheme.id), 40);
    global.setTimeout(() => applyRenderedTheme(type, scheme.id), 180);
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
    if(!active || active.type !== type || !active.payload) return state.preferredByType[type] || DEFAULT_SCHEME_ID;
    if(type === 'venn'){
      return active.payload.style?.colorScheme || state.preferredByType[type] || DEFAULT_SCHEME_ID;
    }
    return active.payload.config?.colorScheme || state.preferredByType[type] || DEFAULT_SCHEME_ID;
  }

  function getActiveSignature(){
    const tab = getActiveTab();
    if(!tab || !tab.type || tab.isWelcome) return null;
    const schemeId = readActiveSchemeForType(tab.type) || DEFAULT_SCHEME_ID;
    return `${tab.id}::${tab.type}::${schemeId}`;
  }

  function syncActiveTabVisuals(reason){
    const tab = getActiveTab();
    if(!tab || !tab.type || tab.isWelcome) return;
    const schemeId = readActiveSchemeForType(tab.type) || DEFAULT_SCHEME_ID;
    const control = state.controlsByType[tab.type]?.select || null;
    if(control && control.value !== schemeId){
      control.value = schemeId;
    }
    syncSharedScatterPalette(tab.type, getScheme(schemeId));
    applyRenderedTheme(tab.type, schemeId);
    debugLog('Debug: colorSchemes visuals synced', { reason, tabId: tab.id, type: tab.type, scheme: schemeId });
  }

  function startActiveMonitor(){
    if(state.monitorTimer) return;
    state.monitorTimer = global.setInterval(() => {
      const signature = getActiveSignature();
      if(signature !== state.lastActiveSignature){
        state.lastActiveSignature = signature;
        if(signature){
          syncActiveTabVisuals('tab-change');
          global.setTimeout(() => syncActiveTabVisuals('tab-change-delayed'), 120);
        }
        return;
      }
      if(!signature) return;
      const tab = getActiveTab();
      if(!tab || !tab.type) return;
      const schemeId = readActiveSchemeForType(tab.type);
      if(schemeId !== 'dark') return;
      const descriptor = TYPE_TO_PAGE[tab.type];
      if(!descriptor) return;
      const page = global.document?.getElementById(descriptor.pageId);
      const activeSvg = page ? page.querySelector('.svgbox svg') : null;
      if(!activeSvg) return;
      const is3dView = String(activeSvg.dataset?.viewMode || '').toLowerCase() === '3d';
      if(is3dView){
        return;
      }
      const backgroundRect = activeSvg.querySelector('[data-color-scheme-background="1"]');
      const needsBackgroundRepair = !backgroundRect || isBackgroundRectOutdated(activeSvg, backgroundRect);
      const needsTextRepair = hasUnthemedText(activeSvg);
      if(needsBackgroundRepair || needsTextRepair){
        syncActiveTabVisuals('dark-repair');
      }
    }, 350);
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
    Object.keys(SCHEMES).forEach(id => {
      const option = doc.createElement('option');
      option.value = id;
      option.textContent = SCHEMES[id].label;
      select.appendChild(option);
    });

    select.value = readActiveSchemeForType(type);
    label.appendChild(select);
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
      unifiedInput.checked = true;
      unifiedLabel.appendChild(unifiedInput);
      unifiedLabel.appendChild(doc.createTextNode(' Unified'));

      const individualLabel = doc.createElement('label');
      const individualInput = doc.createElement('input');
      individualInput.type = 'radio';
      individualInput.name = 'boxColorMode';
      individualInput.id = 'boxColorIndividual';
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
      if(graphFieldset.nextSibling){
        panel.insertBefore(fieldset, graphFieldset.nextSibling);
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

    select.addEventListener('focus', () => {
      select.value = readActiveSchemeForType(type);
    });

    select.addEventListener('change', () => {
      const selected = getScheme(select.value).id;
      select.value = selected;
      applySchemeToActiveTab(type, selected);
    });

    state.controlsByType[type] = { select };
    debugLog('Debug: colorSchemes control mounted', { type, pageId: descriptor.pageId });
  }

  namespace.getSchemes = function getSchemes(){
    return cloneValue(SCHEMES);
  };

  namespace.applyToActiveTab = function applyToActiveTab(type, schemeId){
    return applySchemeToActiveTab(type, schemeId);
  };

  // Apply a scheme to an arbitrary payload without mutating global defaults.
  // This is used by higher-level features (e.g. publication styles) that want
  // to recolor the current graph while keeping the user's preferred palette
  // for newly created tabs.
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

  namespace.init = function init(){
    if(state.initialized){
      debugLog('Debug: colorSchemes.init skipped - already initialized');
      return namespace;
    }
    Object.keys(TYPE_TO_PAGE).forEach(type => {
      renderControlForType(type, TYPE_TO_PAGE[type]);
      const initialScheme = getScheme(readActiveSchemeForType(type) || state.preferredByType[type] || DEFAULT_SCHEME_ID);
      state.preferredByType[type] = initialScheme.id;
      setDefaultForNewTabs(type, initialScheme);
    });
    startActiveMonitor();
    syncActiveTabVisuals('init');
    state.initialized = true;
    debugLog('Debug: colorSchemes.init complete', {
      types: Object.keys(TYPE_TO_PAGE),
      defaultScheme: DEFAULT_SCHEME_ID
    });
    return namespace;
  };
})(window);
