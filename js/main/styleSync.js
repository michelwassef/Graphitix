(function() {
  "use strict";

  const Main = window.Main = window.Main || {};
  const namespace = Main.styleSync = Main.styleSync || {};

  const state = {
    initialized: false,
    session: null,
    workspaceState: null,
    workspaces: null,
    domControls: null,
    previews: null,
    renderTabs: null,
    dom: {},
    isOpen: false,
    activeSourceId: null,
    defaultPayloadCache: {}
  };
  const DEFAULT_GROUP_SELECTION = Object.freeze({
    appearance: true,
    axes: true,
    axisExtras: true,
    fonts: true,
    traceStyles: true,
    legends: false,
    freeText: false,
    individualStyles: false,
    pairwise: false,
    titles: false,
    layout: true
  });

  function debugLog(label, payload) {
    try {
      const shared = window.Shared;
      if (shared && typeof shared.isDebugEnabled === 'function' && !shared.isDebugEnabled()) {
        return;
      }
    } catch (err) {
      // Ignore debug toggle errors to avoid masking the root issue
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug(label, payload || {});
    }
  }

  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(item => cloneValue(item));
    }
    if (typeof value === 'object') {
      const copy = {};
      Object.keys(value).forEach(key => {
        copy[key] = cloneValue(value[key]);
      });
      return copy;
    }
    return value;
  }

  function deepMerge(target, patch) {
    const base = (target && typeof target === 'object' && !Array.isArray(target))
      ? cloneValue(target)
      : {};
    Object.keys(patch || {}).forEach(key => {
      const patchValue = patch[key];
      if (patchValue && typeof patchValue === 'object' && !Array.isArray(patchValue)) {
        base[key] = deepMerge(base[key], patchValue);
      } else {
        base[key] = cloneValue(patchValue);
      }
    });
    return base;
  }

  function setIfDefined(target, key, value) {
    if (value !== undefined) {
      target[key] = cloneValue(value);
    }
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (typeof a === 'object' || typeof b === 'object') {
      if (typeof a !== 'object' || typeof b !== 'object') return false;
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      for (let i = 0; i < aKeys.length; i += 1) {
        const key = aKeys[i];
        if (!hasOwn(b, key)) return false;
        if (!deepEqual(a[key], b[key])) return false;
      }
      return true;
    }
    return false;
  }

  function getPathValue(obj, path) {
    const parts = String(path || '').split('.').filter(Boolean);
    let cursor = obj;
    for (let i = 0; i < parts.length; i += 1) {
      if (!cursor || typeof cursor !== 'object') return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  function setPathValue(target, path, value) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return;
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
        cursor[key] = {};
      }
      cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = cloneValue(value);
  }

  function unsetPathValue(target, path) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length || !target || typeof target !== 'object') return;
    const stack = [];
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (!cursor || typeof cursor !== 'object' || !hasOwn(cursor, key)) {
        return;
      }
      stack.push({ parent: cursor, key });
      cursor = cursor[key];
    }
    if (!cursor || typeof cursor !== 'object') return;
    delete cursor[parts[parts.length - 1]];
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const { parent, key } = stack[i];
      const child = parent[key];
      if (child && typeof child === 'object' && !Array.isArray(child) && !Object.keys(child).length) {
        delete parent[key];
      }
    }
  }

  function pickPaths(payload, paths) {
    const patch = {};
    (Array.isArray(paths) ? paths : []).forEach(path => {
      const value = getPathValue(payload, path);
      if (value !== undefined) {
        setPathValue(patch, path, value);
      }
    });
    return patch;
  }

  function isNonEmptyObject(value) {
    return !!(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length);
  }

  function hasPayloadPatch(patch) {
    if (!patch || typeof patch !== 'object') return false;
    const hasConfig = isNonEmptyObject(patch.config);
    const hasStyle = isNonEmptyObject(patch.style);
    return !!(hasConfig || hasStyle || patch.layout);
  }

  function deepDiff(source, baseline) {
    if (source === undefined) return undefined;
    if (deepEqual(source, baseline)) return undefined;
    if (Array.isArray(source)) return cloneValue(source);
    if (source && typeof source === 'object' && baseline && typeof baseline === 'object' && !Array.isArray(baseline)) {
      const out = {};
      Object.keys(source).forEach(key => {
        const diffValue = deepDiff(source[key], baseline[key]);
        if (diffValue !== undefined) {
          out[key] = diffValue;
        }
      });
      return Object.keys(out).length ? out : undefined;
    }
    return cloneValue(source);
  }

  function getDefaultPayloadForType(type) {
    if (!type) return null;
    if (state.defaultPayloadCache[type]) {
      return cloneValue(state.defaultPayloadCache[type]);
    }
    const workspace = state.workspaces?.[type] || null;
    let payload = null;
    if (state.domControls && typeof state.domControls.ensureDefaultPayload === 'function') {
      try {
        payload = state.domControls.ensureDefaultPayload(state.session, type, workspace);
      } catch (err) {
        console.error('styleSync ensureDefaultPayload error', { type, err });
      }
    }
    if (!payload && workspace && typeof workspace.createEmptyPayload === 'function') {
      try {
        payload = workspace.createEmptyPayload();
      } catch (err) {
        console.error('styleSync createEmptyPayload fallback error', { type, err });
      }
    }
    if (!payload) {
      payload = { type, config: {} };
    }
    state.defaultPayloadCache[type] = cloneValue(payload);
    return cloneValue(payload);
  }

  const STYLE_SCHEMAS = {
    line: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'dotSize', cfg.dotSize);
          setIfDefined(configPatch, 'fill', cfg.fill);
          setIfDefined(configPatch, 'border', cfg.border);
          setIfDefined(configPatch, 'borderWidth', cfg.borderWidth);
          setIfDefined(configPatch, 'alpha', cfg.alpha);
          if (cfg.labelColors && typeof cfg.labelColors === 'object') {
            configPatch.labelColors = cloneValue(cfg.labelColors);
          }
          setIfDefined(configPatch, 'showGrid', cfg.showGrid);
          setIfDefined(configPatch, 'gridStyle', cfg.gridStyle);
          setIfDefined(configPatch, 'showFrame', cfg.showFrame);
          setIfDefined(configPatch, 'showIntervals', cfg.showIntervals);
          setIfDefined(configPatch, 'showDiagnostics', cfg.showDiagnostics);
          if (cfg.regression && hasOwn(cfg.regression, 'mode')) {
            configPatch.regression = Object.assign({}, configPatch.regression || {}, {
              mode: cfg.regression.mode
            });
          }
          if (cfg.forecast) {
            const forecastPatch = {};
            setIfDefined(forecastPatch, 'horizon', cfg.forecast.horizon);
            setIfDefined(forecastPatch, 'seasonLength', cfg.forecast.seasonLength);
            setIfDefined(forecastPatch, 'autoTune', cfg.forecast.autoTune);
            setIfDefined(forecastPatch, 'criterion', cfg.forecast.criterion);
            if (Object.keys(forecastPatch).length) {
              configPatch.forecast = forecastPatch;
            }
          }
          return { config: configPatch };
        },
        axes: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'logX', cfg.logX);
          setIfDefined(configPatch, 'logY', cfg.logY);
          setIfDefined(configPatch, 'xMin', cfg.xMin);
          setIfDefined(configPatch, 'xMax', cfg.xMax);
          setIfDefined(configPatch, 'yMin', cfg.yMin);
          setIfDefined(configPatch, 'yMax', cfg.yMax);
          setIfDefined(configPatch, 'originMode', cfg.originMode);
          setIfDefined(configPatch, 'originX', cfg.originX);
          setIfDefined(configPatch, 'originY', cfg.originY);
          if (cfg.axis && typeof cfg.axis === 'object') {
            configPatch.axis = cloneValue(cfg.axis);
          }
          return { config: configPatch };
        },
        fonts: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fontSize', cfg.fontSize);
          if (cfg.fontStyles && typeof cfg.fontStyles === 'object') {
            configPatch.fontStyles = cloneValue(cfg.fontStyles);
          }
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          setIfDefined(configPatch, 'xLabel', cfg.xLabel);
          setIfDefined(configPatch, 'yLabel', cfg.yLabel);
          setIfDefined(configPatch, 'zLabel', cfg.zLabel);
          if (cfg.axisLabelModes && typeof cfg.axisLabelModes === 'object') {
            configPatch.axisLabelModes = cloneValue(cfg.axisLabelModes);
          }
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    scatter: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'dotSize', cfg.dotSize);
          setIfDefined(configPatch, 'fill', cfg.fill);
          setIfDefined(configPatch, 'border', cfg.border);
          setIfDefined(configPatch, 'borderWidth', cfg.borderWidth);
          setIfDefined(configPatch, 'alpha', cfg.alpha);
          if (cfg.labelColors && typeof cfg.labelColors === 'object') {
            configPatch.labelColors = cloneValue(cfg.labelColors);
          }
          setIfDefined(configPatch, 'showGrid', cfg.showGrid);
          setIfDefined(configPatch, 'gridStyle', cfg.gridStyle);
          setIfDefined(configPatch, 'showFrame', cfg.showFrame);
          setIfDefined(configPatch, 'showLine', cfg.showLine);
          setIfDefined(configPatch, 'showIntervals', cfg.showIntervals);
          setIfDefined(configPatch, 'showDiagnostics', cfg.showDiagnostics);
          setIfDefined(configPatch, 'graphType', cfg.graphType);
          setIfDefined(configPatch, 'log2fcThreshold', cfg.log2fcThreshold);
          setIfDefined(configPatch, 'negLogPThreshold', cfg.negLogPThreshold);
          if (cfg.regression && hasOwn(cfg.regression, 'mode')) {
            configPatch.regression = Object.assign({}, configPatch.regression || {}, {
              mode: cfg.regression.mode
            });
          }
          return { config: configPatch };
        },
        axes: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'logX', cfg.logX);
          setIfDefined(configPatch, 'logY', cfg.logY);
          setIfDefined(configPatch, 'xMin', cfg.xMin);
          setIfDefined(configPatch, 'xMax', cfg.xMax);
          setIfDefined(configPatch, 'yMin', cfg.yMin);
          setIfDefined(configPatch, 'yMax', cfg.yMax);
          setIfDefined(configPatch, 'originMode', cfg.originMode);
          setIfDefined(configPatch, 'originX', cfg.originX);
          setIfDefined(configPatch, 'originY', cfg.originY);
          if (cfg.axis && typeof cfg.axis === 'object') {
            configPatch.axis = cloneValue(cfg.axis);
          }
          return { config: configPatch };
        },
        fonts: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fontSize', cfg.fontSize);
          if (cfg.fontStyles && typeof cfg.fontStyles === 'object') {
            configPatch.fontStyles = cloneValue(cfg.fontStyles);
          }
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          setIfDefined(configPatch, 'xLabel', cfg.xLabel);
          setIfDefined(configPatch, 'yLabel', cfg.yLabel);
          setIfDefined(configPatch, 'zLabel', cfg.zLabel);
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    hist: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fill', cfg.fill);
          setIfDefined(configPatch, 'border', cfg.border);
          setIfDefined(configPatch, 'borderWidth', cfg.borderWidth);
          setIfDefined(configPatch, 'bins', cfg.bins);
          setIfDefined(configPatch, 'showGrid', cfg.showGrid);
          setIfDefined(configPatch, 'gridStyle', cfg.gridStyle);
          return { config: configPatch };
        },
        axes: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'logY', cfg.logY);
          setIfDefined(configPatch, 'yMin', cfg.yMin);
          setIfDefined(configPatch, 'yMax', cfg.yMax);
          if (cfg.axis && typeof cfg.axis === 'object') {
            configPatch.axis = cloneValue(cfg.axis);
          }
          return { config: configPatch };
        },
        fonts: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fontSize', cfg.fontSize);
          if (cfg.fontStyles && typeof cfg.fontStyles === 'object') {
            configPatch.fontStyles = cloneValue(cfg.fontStyles);
          }
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          setIfDefined(configPatch, 'xLabel', cfg.xLabel);
          setIfDefined(configPatch, 'yLabel', cfg.yLabel);
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    pie: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'chartType', cfg.chartType);
          setIfDefined(configPatch, 'showPercents', cfg.showPercents);
          setIfDefined(configPatch, 'showFrame', cfg.showFrame);
          setIfDefined(configPatch, 'startAngle', cfg.startAngle);
          setIfDefined(configPatch, 'borderColor', cfg.borderColor);
          setIfDefined(configPatch, 'borderWidth', cfg.borderWidth);
          if (cfg.colors) {
            configPatch.colors = cloneValue(cfg.colors);
          }
          return { config: configPatch };
        },
        axes: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          if (cfg.axis && typeof cfg.axis === 'object') {
            configPatch.axis = cloneValue(cfg.axis);
          }
          return { config: configPatch };
        },
        fonts: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fontSize', cfg.fontSize);
          if (cfg.fontStyles && typeof cfg.fontStyles === 'object') {
            configPatch.fontStyles = cloneValue(cfg.fontStyles);
          }
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    box: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'colorMode', cfg.colorMode);
          setIfDefined(configPatch, 'fill', cfg.fill);
          setIfDefined(configPatch, 'border', cfg.border);
          setIfDefined(configPatch, 'borderWidth', cfg.borderWidth);
          setIfDefined(configPatch, 'showGrid', cfg.showGrid);
          setIfDefined(configPatch, 'gridStyle', cfg.gridStyle);
          setIfDefined(configPatch, 'showFrame', cfg.showFrame);
          setIfDefined(configPatch, 'logScale', cfg.logScale);
          setIfDefined(configPatch, 'graphType', cfg.graphType);
          setIfDefined(configPatch, 'individualSummary', cfg.individualSummary);
          setIfDefined(configPatch, 'pointMode', cfg.pointMode);
          setIfDefined(configPatch, 'showCaps', cfg.showCaps);
          setIfDefined(configPatch, 'showSignificanceBars', cfg.showSignificanceBars);
          setIfDefined(configPatch, 'errorMode', cfg.errorMode);
          setIfDefined(configPatch, 'flipAxes', cfg.flipAxes);
          if (Array.isArray(cfg.colors)) {
            configPatch.colors = cfg.colors.map(color => cloneValue(color));
          }
          if (Array.isArray(cfg.borderColors)) {
            configPatch.borderColors = cfg.borderColors.map(color => cloneValue(color));
          }
          return { config: configPatch };
        },
        axes: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'yMin', cfg.yMin);
          setIfDefined(configPatch, 'yMax', cfg.yMax);
          if (cfg.axis && typeof cfg.axis === 'object') {
            configPatch.axis = cloneValue(cfg.axis);
          }
          return { config: configPatch };
        },
        fonts: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fontSize', cfg.fontSize);
          if (cfg.fontStyles && typeof cfg.fontStyles === 'object') {
            configPatch.fontStyles = cloneValue(cfg.fontStyles);
          }
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          setIfDefined(configPatch, 'yLabel', cfg.yLabel);
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    venn: {
      groups: {
        appearance: payload => {
          const style = payload?.style || {};
          const stylePatch = {};
          setIfDefined(stylePatch, 'colorA', style.colorA);
          setIfDefined(stylePatch, 'colorB', style.colorB);
          setIfDefined(stylePatch, 'colorC', style.colorC);
          setIfDefined(stylePatch, 'opacity', style.opacity);
          setIfDefined(stylePatch, 'borderColor', style.borderColor);
          setIfDefined(stylePatch, 'borderWidth', style.borderWidth);
          return { style: stylePatch };
        },
        fonts: payload => {
          const style = payload?.style || {};
          const stylePatch = {};
          setIfDefined(stylePatch, 'fontsize', style.fontsize);
          if (style.fontStyles && typeof style.fontStyles === 'object') {
            stylePatch.fontStyles = cloneValue(style.fontStyles);
          }
          return { style: stylePatch };
        },
        titles: payload => {
          const style = payload?.style || {};
          const stylePatch = {};
          setIfDefined(stylePatch, 'title', style.title);
          return { style: stylePatch };
        },
        layout: () => ({ layout: true })
      }
    },
    pca: {
      groups: {
        appearance: payload => pickPaths(payload || {}, [
          'config.dotSize', 'config.fill', 'config.colorScheme', 'config.textColor', 'config.backgroundColor',
          'config.border', 'config.borderWidth', 'config.alpha',
          'config.labelColors', 'config.labelShapes', 'config.labelPointStyles',
          'config.showGrid', 'config.gridStyle', 'config.showFrame', 'config.showLegend',
          'config.scale', 'config.equalAxes', 'config.equalScaleAxes', 'config.axesVarianceScaled',
          'config.grouped.colors', 'config.grouped.shapes'
        ]),
        axes: payload => pickPaths(payload || {}, ['config.axis', 'config.axisSelection']),
        fonts: payload => pickPaths(payload || {}, ['config.fontSize', 'config.fontStyles']),
        titles: payload => pickPaths(payload || {}, ['config.labels.title', 'config.axisSelection']),
        layout: () => ({ layout: true })
      }
    },
    heatmap: {
      groups: {
        appearance: payload => pickPaths(payload || {}, [
          'config.view', 'config.useAbsolute', 'config.maskLower', 'config.showValues',
          'config.showSignificance', 'config.significanceDisplay', 'config.decimals',
          'config.colors', 'config.cellSize', 'config.dendrogram', 'config.colorScheme'
        ]),
        fonts: payload => pickPaths(payload || {}, ['config.fontSize', 'config.fontStyles']),
        titles: payload => pickPaths(payload || {}, ['config.title']),
        layout: () => ({ layout: true })
      }
    },
    surface: {
      groups: {
        appearance: payload => pickPaths(payload || {}, [
          'config.colorScheme', 'config.textColor', 'config.backgroundColor',
          'config.settings.colorRamp', 'config.settings.colorScheme', 'config.settings.textColor',
          'config.settings.backgroundColor', 'config.settings.axisColor', 'config.settings.axisStroke',
          'config.gridStyle'
        ]),
        axes: payload => pickPaths(payload || {}, ['config.axisMap']),
        fonts: payload => pickPaths(payload || {}, ['config.settings.fontSize', 'config.fontStyles']),
        titles: payload => pickPaths(payload || {}, ['config.labels.title', 'config.labels.x', 'config.labels.y', 'config.labels.z']),
        layout: () => ({ layout: true })
      }
    },
    roc: {
      groups: {
        appearance: payload => pickPaths(payload || {}, [
          'config.colorScheme', 'config.borderWidth',
          'config.showGrid', 'config.gridStyle', 'config.showFrame', 'config.showLegend',
          'config.labelColors', 'config.labelStrokeWidth', 'config.labelOpacity', 'config.labelLinePattern',
          'config.graphType'
        ]),
        axes: payload => pickPaths(payload || {}, ['config.axis']),
        fonts: payload => pickPaths(payload || {}, ['config.fontSize', 'config.fontStyles']),
        titles: payload => pickPaths(payload || {}, ['config.title']),
        layout: () => ({ layout: true })
      }
    },
    survival: {
      groups: {
        appearance: payload => pickPaths(payload || {}, [
          'config.colorScheme',
          'config.labelColors', 'config.labelStrokeWidth', 'config.labelOpacity', 'config.labelLinePattern',
          'config.showCI', 'config.showCensor', 'config.showHazardRatios', 'config.fitCoxModel',
          'config.pairwiseCorrection', 'config.showGrid', 'config.gridStyle', 'config.showFrame', 'config.showLegend',
          'config.timeMax'
        ]),
        axes: payload => pickPaths(payload || {}, ['config.axis']),
        fonts: payload => pickPaths(payload || {}, ['config.fontSize', 'config.fontStyles']),
        titles: payload => pickPaths(payload || {}, ['config.title', 'config.xLabel', 'config.yLabel']),
        layout: () => ({ layout: true })
      }
    }
  };

  const TITLE_SCOPE_PATHS = {
    line: { x: ['config.xLabel'], y: ['config.yLabel'], graph: ['config.title'] },
    scatter: { x: ['config.xLabel'], y: ['config.yLabel'], graph: ['config.title'] },
    hist: { x: ['config.xLabel'], y: ['config.yLabel'], graph: ['config.title'] },
    box: { x: [], y: ['config.yLabel'], graph: ['config.title'] },
    pie: { x: [], y: [], graph: ['config.title'] },
    venn: { x: [], y: [], graph: ['style.title'] },
    pca: { x: [], y: [], graph: ['config.labels.title'] },
    heatmap: { x: [], y: [], graph: ['config.title'] },
    surface: { x: ['config.labels.x'], y: ['config.labels.y', 'config.labels.z'], graph: ['config.labels.title'] },
    roc: { x: [], y: [], graph: ['config.title'] },
    survival: { x: ['config.xLabel'], y: ['config.yLabel'], graph: ['config.title'] }
  };

  function addSupplementalGroups() {
    const axisExtrasPaths = [
      'config.showGrid',
      'config.gridStyle',
      'config.axis.additionalTicks',
      'config.axis.additionalTicksX',
      'config.axis.additionalTicksY',
      'config.axis.x.additionalTicks',
      'config.axis.y.additionalTicks',
      'config.axis.brokenAxis',
      'config.axis.x.brokenAxis',
      'config.axis.y.brokenAxis',
      'config.xTickRotateVertical'
    ];
    const traceStylePaths = [
      'config.seriesStyles',
      'config.overlayStyles',
      'config.shapeStyles',
      'config.pointStyles',
      'config.summaryStyles',
      'config.traceShapeStyles',
      'config.traceShapeGlobalStyle',
      'config.pointGlobalStyle',
      'config.summaryGlobalStyle',
      'config.labelStyles',
      'config.labelShapes',
      'config.labelPointStyles',
      'config.graphTypeBorderWidths'
    ];
    const individualStylePaths = [
      'config.labelColors',
      'config.labelStyles',
      'config.labelShapes',
      'config.labelPointStyles',
      'config.shapeStyles',
      'config.pointStyles',
      'config.summaryStyles',
      'config.seriesStyles',
      'config.traceShapeStyles'
    ];
    const pairwisePaths = [
      'config.showSignificanceBars',
      'config.significanceLabelMode',
      'config.significanceStyle',
      'config.pairwiseCorrection',
      'config.showHazardRatios',
      'config.fitCoxModel'
    ];
    Object.keys(STYLE_SCHEMAS).forEach(type => {
      const groups = STYLE_SCHEMAS[type]?.groups;
      if (!groups) return;
      if (!groups.axisExtras) {
        groups.axisExtras = payload => pickPaths(payload || {}, axisExtrasPaths);
      }
      if (!groups.traceStyles) {
        groups.traceStyles = payload => pickPaths(payload || {}, traceStylePaths);
      }
      if (!groups.legends) {
        groups.legends = payload => pickPaths(payload || {}, ['config.showLegend', 'config.labelPositions.legend', 'config.legendPosition']);
      }
      if (!groups.freeText) {
        groups.freeText = payload => pickPaths(payload || {}, ['config.notes']);
      }
      if (!groups.individualStyles) {
        groups.individualStyles = payload => pickPaths(payload || {}, individualStylePaths);
      }
      if (!groups.pairwise && (type === 'box' || type === 'survival')) {
        groups.pairwise = payload => pickPaths(payload || {}, pairwisePaths);
      }
    });
  }
  addSupplementalGroups();

  function mergeGroupPatch(target, addition) {
    if (!addition) return target;
    const result = target || {};
    if (addition.config) {
      result.config = deepMerge(result.config, addition.config);
    }
    if (addition.style) {
      result.style = deepMerge(result.style, addition.style);
    }
    if (addition.layout) {
      result.layout = true;
    }
    return result;
  }

  function stripUndefinedFromPatch(patch) {
    if (patch === undefined) return undefined;
    if (patch === null) return null;
    if (Array.isArray(patch)) return patch.map(item => stripUndefinedFromPatch(item));
    if (typeof patch !== 'object') return patch;
    const out = {};
    Object.keys(patch).forEach(key => {
      const next = stripUndefinedFromPatch(patch[key]);
      if (next !== undefined) {
        out[key] = next;
      }
    });
    return Object.keys(out).length ? out : undefined;
  }

  function remapPatchMaps(type, patch, sourcePayload, targetPayload) {
    const out = cloneValue(patch) || {};
    const mapPathsByType = {
      line: ['config.labelColors', 'config.seriesStyles', 'config.overlayStyles'],
      scatter: ['config.labelColors', 'config.labelShapes', 'config.labelStyles', 'config.overlayStyles'],
      box: ['config.shapeStyles', 'config.pointStyles', 'config.summaryStyles'],
      pca: ['config.labelColors', 'config.labelShapes', 'config.labelPointStyles'],
      roc: ['config.labelColors', 'config.labelStrokeWidth', 'config.labelOpacity', 'config.labelLinePattern'],
      survival: ['config.labelColors', 'config.labelStrokeWidth', 'config.labelOpacity', 'config.labelLinePattern'],
      pie: ['config.colors'],
      hist: ['config.seriesColors']
    };
    const mapPaths = mapPathsByType[type] || [];
    mapPaths.forEach(path => {
      const patchMap = getPathValue(out, path);
      if (!patchMap || typeof patchMap !== 'object' || Array.isArray(patchMap)) return;
      const sourceMap = getPathValue(sourcePayload, path);
      const targetMap = getPathValue(targetPayload, path);
      if (!targetMap || typeof targetMap !== 'object' || Array.isArray(targetMap)) return;
      const targetKeys = Object.keys(targetMap);
      if (!targetKeys.length) return;
      const sourceKeys = (sourceMap && typeof sourceMap === 'object' && !Array.isArray(sourceMap))
        ? Object.keys(sourceMap)
        : [];
      const mapped = {};
      const used = new Set();
      const pending = [];
      Object.keys(patchMap).forEach(key => {
        if (targetKeys.includes(key)) {
          mapped[key] = cloneValue(patchMap[key]);
          used.add(key);
        } else {
          pending.push(key);
        }
      });
      pending.forEach(sourceKey => {
        let targetKey = null;
        const sourceIndex = sourceKeys.indexOf(sourceKey);
        if (sourceIndex >= 0 && sourceIndex < targetKeys.length) {
          targetKey = targetKeys[sourceIndex];
        }
        if (!targetKey || used.has(targetKey)) {
          targetKey = targetKeys.find(key => !used.has(key)) || null;
        }
        if (targetKey) {
          mapped[targetKey] = cloneValue(patchMap[sourceKey]);
          used.add(targetKey);
        }
      });
      setPathValue(out, path, mapped);
    });
    return out;
  }

  function filterTitlePatchByScope(type, patch, titleScopes) {
    if (!patch || typeof patch !== 'object') return patch;
    const schemaPaths = TITLE_SCOPE_PATHS[type];
    if (!schemaPaths) return patch;
    const selected = Array.isArray(titleScopes) ? titleScopes : [];
    const normalized = selected.filter(scope => scope === 'x' || scope === 'y' || scope === 'graph');
    const scopeSet = new Set(normalized.length ? normalized : ['x', 'y', 'graph']);
    const out = cloneValue(patch);
    if (!scopeSet.has('x')) {
      (schemaPaths.x || []).forEach(path => unsetPathValue(out, path));
    }
    if (!scopeSet.has('y')) {
      (schemaPaths.y || []).forEach(path => unsetPathValue(out, path));
    }
    if (!scopeSet.has('graph')) {
      (schemaPaths.graph || []).forEach(path => unsetPathValue(out, path));
    }
    return out;
  }

  function buildStylePatch(type, payload, groups, options) {
    const schema = STYLE_SCHEMAS[type];
    if (!schema) {
      return null;
    }
    const defaultPayload = getDefaultPayloadForType(type);
    const activeGroups = Array.isArray(groups) ? groups : [];
    let sourcePatch = null;
    let defaultPatch = null;
    let absolutePatch = null;
    const absoluteGroups = new Set(['titles', 'axes']);
    activeGroups.forEach(group => {
      const handler = schema.groups[group];
      if (typeof handler === 'function') {
        const sourceAddition = handler(payload || {}, { group });
        sourcePatch = mergeGroupPatch(sourcePatch, sourceAddition);
        if (absoluteGroups.has(group)) {
          absolutePatch = mergeGroupPatch(absolutePatch, sourceAddition);
        }
        if (group !== 'layout') {
          const defaultAddition = handler(defaultPayload || {}, { group });
          defaultPatch = mergeGroupPatch(defaultPatch, defaultAddition);
        }
      }
    });
    const sourceConfig = sourcePatch?.config || undefined;
    const defaultConfig = defaultPatch?.config || undefined;
    const sourceStyle = sourcePatch?.style || undefined;
    const defaultStyle = defaultPatch?.style || undefined;
    const configDiff = stripUndefinedFromPatch(deepDiff(sourceConfig, defaultConfig));
    const styleDiff = stripUndefinedFromPatch(deepDiff(sourceStyle, defaultStyle));
    const patch = {};
    if (isNonEmptyObject(configDiff)) patch.config = configDiff;
    if (isNonEmptyObject(styleDiff)) patch.style = styleDiff;
    if (sourcePatch?.layout) patch.layout = true;
    if (isNonEmptyObject(absolutePatch?.config)) {
      patch.config = deepMerge(patch.config, absolutePatch.config);
    }
    if (isNonEmptyObject(absolutePatch?.style)) {
      patch.style = deepMerge(patch.style, absolutePatch.style);
    }
    if (activeGroups.includes('titles')) {
      const titleScopes = options?.titleScopes;
      const filtered = filterTitlePatchByScope(type, patch, titleScopes);
      return hasPayloadPatch(filtered) ? filtered : null;
    }
    return hasPayloadPatch(patch) ? patch : null;
  }

  function getGraphTabs() {
    if (!state.workspaceState || !Array.isArray(state.workspaceState.tabs)) {
      return [];
    }
    return state.workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type);
  }

  function getTabById(tabId) {
    return getGraphTabs().find(tab => tab.id === tabId) || null;
  }

  function hidePrompt(reason) {
    const { styleSyncPrompt } = state.dom;
    if (!styleSyncPrompt || styleSyncPrompt.hasAttribute('hidden')) {
      return;
    }
    styleSyncPrompt.setAttribute('hidden', 'hidden');
    styleSyncPrompt.setAttribute('aria-hidden', 'true');
    state.isOpen = false;
    console.debug('Debug: styleSync prompt hidden', { reason: reason || 'unspecified' });
  }

  function setStatus(message, status) {
    const el = state.dom.styleSyncStatus;
    if (!el) return;
    el.textContent = message || '';
    if (status) {
      el.dataset.status = status;
    } else {
      delete el.dataset.status;
    }
  }

  function updateApplyState(schema) {
    const applyBtn = state.dom.styleSyncApply;
    if (!applyBtn) return;
    const groups = collectSelectedGroups(schema);
    const targets = collectSelectedTargets();
    const enabled = !!schema && groups.length > 0;
    applyBtn.disabled = !enabled;
    console.debug('Debug: styleSync apply state evaluated', {
      enabled,
      groupCount: groups.length,
      targetCount: targets.length,
      hasSchema: !!schema
    });
  }

  function collectSelectedGroups(schema) {
    const boxes = state.dom.styleSyncForm
      ? Array.from(state.dom.styleSyncForm.querySelectorAll('[data-style-group]'))
      : [];
    return boxes.filter(box => {
      if (box.disabled) return false;
      const key = box.getAttribute('data-style-group');
      if (!schema?.groups?.[key]) return false;
      return box.checked;
    }).map(box => box.getAttribute('data-style-group'));
  }

  function collectSelectedTargets() {
    if (!state.dom.styleSyncTargets) return [];
    const checked = Array.from(state.dom.styleSyncTargets.querySelectorAll('input[type="checkbox"]:checked'));
    return checked.map(input => input.value);
  }

  function syncSelectAllCheckbox() {
    const selectAll = state.dom.styleSyncSelectAll;
    if (!selectAll) return;
    const total = state.dom.styleSyncTargets
      ? state.dom.styleSyncTargets.querySelectorAll('input[type="checkbox"]').length
      : 0;
    const checked = collectSelectedTargets().length;
    selectAll.checked = total > 0 && checked > 0 && checked === total;
    if ('indeterminate' in selectAll) {
      selectAll.indeterminate = total > 0 && checked > 0 && checked < total;
    }
    selectAll.disabled = total === 0;
  }

  function populateTargetOptions(sourceTab) {
    const container = state.dom.styleSyncTargets;
    if (!container) {
      return;
    }
    container.innerHTML = '';
    if (!sourceTab) {
      container.appendChild(document.createElement('div')).className = 'style-sync-targets__empty';
      container.firstChild.textContent = 'Select an example graph first.';
      return;
    }
    const peers = getGraphTabs().filter(tab => tab.id !== sourceTab.id && tab.type === sourceTab.type);
    if (!peers.length) {
      const empty = document.createElement('div');
      empty.className = 'style-sync-targets__empty';
      empty.textContent = 'No other tabs of this type are open.';
      container.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    peers.forEach(tab => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = tab.id;
      checkbox.dataset.tabType = tab.type;
      checkbox.addEventListener('change', () => {
        syncSelectAllCheckbox();
        updateApplyState(STYLE_SCHEMAS[sourceTab.type]);
      });
      const title = document.createElement('span');
      title.textContent = tab.title || tab.id;
      label.appendChild(checkbox);
      label.appendChild(title);
      fragment.appendChild(label);
    });
    container.appendChild(fragment);
    syncSelectAllCheckbox();
  }

  function populateSourceOptions(sourceId) {
    const select = state.dom.styleSyncSource;
    if (!select) return null;
    select.innerHTML = '';
    const graphTabs = getGraphTabs();
    if (!graphTabs.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No graphs available';
      select.appendChild(opt);
      select.disabled = true;
      return null;
    }
    select.disabled = false;
    graphTabs.forEach(tab => {
      const option = document.createElement('option');
      option.value = tab.id;
      option.textContent = `${tab.title || tab.id} (${tab.type})`;
      if (tab.id === sourceId) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    if (!select.value && graphTabs.length) {
      select.value = graphTabs[0].id;
    }
    return getTabById(select.value);
  }

  function disableUnsupportedGroups(schema) {
    const boxes = state.dom.styleSyncForm
      ? Array.from(state.dom.styleSyncForm.querySelectorAll('[data-style-group]'))
      : [];
    boxes.forEach(box => {
      const key = box.getAttribute('data-style-group');
      const supported = !!schema?.groups?.[key];
      box.disabled = !supported;
      if (!supported) {
        box.checked = false;
      }
    });
  }

  function collectSelectedTitleScopes() {
    const boxes = state.dom.styleSyncForm
      ? Array.from(state.dom.styleSyncForm.querySelectorAll('[data-style-title-scope]'))
      : [];
    const selected = boxes.filter(box => !box.disabled && box.checked)
      .map(box => box.getAttribute('data-style-title-scope'));
    return selected.length ? selected : ['x', 'y', 'graph'];
  }

  function applyDefaultGroupSelection(schema) {
    const boxes = state.dom.styleSyncForm
      ? Array.from(state.dom.styleSyncForm.querySelectorAll('[data-style-group]'))
      : [];
    boxes.forEach(box => {
      const key = box.getAttribute('data-style-group');
      const supported = !!schema?.groups?.[key];
      box.checked = supported && !!DEFAULT_GROUP_SELECTION[key];
    });
    const titleScopeBoxes = state.dom.styleSyncForm
      ? Array.from(state.dom.styleSyncForm.querySelectorAll('[data-style-title-scope]'))
      : [];
    titleScopeBoxes.forEach(box => {
      box.checked = true;
    });
  }

  function syncTitleScopeOptions(schema) {
    const titleMaster = state.dom.styleSyncForm
      ? state.dom.styleSyncForm.querySelector('[data-style-group="titles"]')
      : null;
    const enabled = !!(titleMaster && !titleMaster.disabled && titleMaster.checked && schema?.groups?.titles);
    const boxes = state.dom.styleSyncForm
      ? Array.from(state.dom.styleSyncForm.querySelectorAll('[data-style-title-scope]'))
      : [];
    boxes.forEach(box => {
      box.disabled = !enabled;
    });
  }

  function applyLayoutToTab(tab, layoutClone) {
    if (!tab) return;
    tab.layoutState = layoutClone ? cloneValue(layoutClone) : null;
    if (typeof state.session.serializePayloadSignature === 'function') {
      tab.layoutSignature = state.session.serializePayloadSignature(tab.layoutState);
    }
  }

  function applyPatchToActiveWorkspace(tab, payload, patch, layoutClone) {
    if (!tab || !state.workspaces) return;
    const config = state.workspaces[tab.type];
    if (!config) {
      console.debug('Debug: styleSync active workspace apply skipped', { reason: 'missing-config', type: tab.type });
      return;
    }
    const applyAfterEnsure = () => {
      if (state.domControls && typeof state.domControls.applyWorkspacePayload === 'function') {
        try {
          const cloneFn = state.session?.fastClonePayload || state.session?.clonePayload;
          const payloadClone = cloneFn?.call(state.session, payload) || cloneValue(payload);
          state.domControls.applyWorkspacePayload(config, payloadClone, {
            reason: 'style-sync',
            styleOnly: true,
            skipDataLoad: true,
            viewOnly: true
          });
        } catch (err) {
          console.error('styleSync applyWorkspacePayload error', { type: tab.type, err });
        }
      }
      if (patch?.layout && typeof config.applyLayoutState === 'function') {
        try {
          config.applyLayoutState(layoutClone ? cloneValue(layoutClone) : null, {
            reason: 'style-sync',
            resetStyles: true,
            resetDataset: true
          });
        } catch (err) {
          console.error('styleSync applyLayoutState error', { type: tab.type, err });
        }
      }
      try {
        if (typeof config.draw === 'function') {
          config.draw();
        }
      } catch (err) {
        console.error('styleSync redraw error', { type: tab.type, err });
      }
      if (state.previews && typeof state.previews.updateTabPreviewFromWorkspace === 'function') {
        try {
          state.previews.updateTabPreviewFromWorkspace(tab, config, { reason: 'style-sync', forceCapture: true });
        } catch (err) {
          console.error('styleSync preview update error', { type: tab.type, err });
        }
      }
    };

    let ensurePromise = null;
    if (typeof config.ensure === 'function') {
      try {
        const ensureResult = config.ensure();
        if (ensureResult && typeof ensureResult.then === 'function') {
          ensurePromise = ensureResult;
        }
      } catch (err) {
        console.error('styleSync ensure error', { type: tab.type, err });
      }
    }

    if (ensurePromise && typeof ensurePromise.then === 'function') {
      ensurePromise.then(() => applyAfterEnsure()).catch(err => {
        console.error('styleSync ensure async error', { type: tab.type, err });
        applyAfterEnsure();
      });
    } else {
      applyAfterEnsure();
    }
  }

  function applyStyles() {
    const sourceTab = getTabById(state.activeSourceId);
    if (!sourceTab) {
      setStatus('Select a graph to copy styles from.', 'error');
      return;
    }
    if (!sourceTab.payload) {
      setStatus('Open the example graph at least once before copying its style.', 'error');
      console.debug('Debug: styleSync apply aborted - source missing payload', { tabId: sourceTab.id });
      return;
    }
    const schema = STYLE_SCHEMAS[sourceTab.type];
    if (!schema) {
      setStatus(`Style matching for ${sourceTab.type} graphs is not yet available.`, 'error');
      console.debug('Debug: styleSync apply aborted - unsupported type', { type: sourceTab.type });
      return;
    }
    const selectedGroups = collectSelectedGroups(schema);
    if (!selectedGroups.length) {
      setStatus('Select at least one property group to apply.', 'error');
      return;
    }
    const targetIds = collectSelectedTargets();
    if (!targetIds.length) {
      setStatus('Select at least one target graph before applying styles.', 'error');
      return;
    }
    const titleScopes = collectSelectedTitleScopes();
    const stylePatch = buildStylePatch(sourceTab.type, sourceTab.payload, selectedGroups, { titleScopes });
    if (!stylePatch || (!stylePatch.config && !stylePatch.style && !stylePatch.layout)) {
      setStatus('The selected properties did not produce any style updates.', 'error');
      console.debug('Debug: styleSync apply aborted - empty patch', { groups: selectedGroups });
      return;
    }
    const applied = [];
    const skipped = [];
    const undoManager = window.Shared?.undoManager || null;
    const beforeStates = new Map();
    let copiedLayout = null;
    if (stylePatch.layout) {
      const cloneFn = state.session?.fastClonePayload || state.session?.clonePayload;
      copiedLayout = cloneFn?.call(state.session, sourceTab.layoutState) || cloneValue(sourceTab.layoutState);
      if (!copiedLayout) {
        console.debug('Debug: styleSync layout copy missing - source lacks layout', { tabId: sourceTab.id });
      }
    }
    targetIds.forEach(targetId => {
      const targetTab = getTabById(targetId);
      if (!targetTab) {
        skipped.push({ id: targetId, reason: 'missing-tab' });
        return;
      }
      if (targetTab.type !== sourceTab.type) {
        skipped.push({ id: targetId, reason: 'type-mismatch' });
        return;
      }
      if (!targetTab.payload) {
        skipped.push({ id: targetId, reason: 'no-payload' });
        console.debug('Debug: styleSync target skipped - missing payload', { tabId: targetTab.id });
        return;
      }
      if (undoManager && typeof undoManager.captureTabState === 'function') {
        const beforeState = undoManager.captureTabState(targetTab, {
          reason: 'style-sync-pre',
          persistActive: true,
          forcePreviewCapture: true
        });
        if (beforeState) {
          beforeStates.set(targetTab.id, beforeState);
        }
      }
      const cloneFn = state.session?.fastClonePayload || state.session?.clonePayload;
      const nextPayload = cloneFn?.call(state.session, targetTab.payload) || cloneValue(targetTab.payload);
      const mappedPatch = remapPatchMaps(sourceTab.type, stylePatch, sourceTab.payload, nextPayload);
      if (mappedPatch.config) {
        nextPayload.config = deepMerge(nextPayload.config, mappedPatch.config);
      }
      if (mappedPatch.style) {
        nextPayload.style = deepMerge(nextPayload.style, mappedPatch.style);
      }
      const changed = state.session?.assignTabPayload
        ? state.session.assignTabPayload(targetTab, nextPayload, { reason: 'style-sync' })
        : (() => { targetTab.payload = nextPayload; return true; })();
      if (stylePatch.layout) {
        applyLayoutToTab(targetTab, copiedLayout || null);
      }
      if (changed || stylePatch.layout) {
        applied.push(targetTab);
      }
      if (state.workspaceState?.activeTabId === targetTab.id) {
        applyPatchToActiveWorkspace(targetTab, nextPayload, mappedPatch, copiedLayout || null);
      }
      if (state.previews && typeof state.previews.syncTabPreviewIndicator === 'function') {
        state.previews.syncTabPreviewIndicator(targetTab);
      }
      if ((changed || stylePatch.layout) && undoManager && typeof undoManager.captureTabState === 'function' && typeof undoManager.recordTabStateChange === 'function') {
        const beforeState = beforeStates.get(targetTab.id) || null;
        const afterState = undoManager.captureTabState(targetTab, {
          reason: 'style-sync-post',
          persistActive: true,
          forcePreviewCapture: true
        });
        if (beforeState && afterState) {
          undoManager.recordTabStateChange({
            tabId: targetTab.id,
            label: `style-sync:${selectedGroups.join(',')}`,
            scope: targetTab.type,
            from: beforeState,
            to: afterState,
            undoReason: 'undo-style-sync',
            redoReason: 'redo-style-sync'
          });
        }
      }
    });
    if (applied.length) {
      if (typeof state.session.markSessionDirty === 'function') {
        state.session.markSessionDirty('style-sync-applied', {
          sourceId: sourceTab.id,
          targetCount: applied.length,
          groups: selectedGroups
        });
      }
      if (typeof state.renderTabs === 'function') {
        state.renderTabs();
      }
    }
    const appliedTitles = applied.map(tab => tab.title || tab.id);
    const skippedDetails = skipped.map(item => `${item.id}: ${item.reason}`).join('; ');
    const successMessage = applied.length
      ? `Updated ${applied.length} tab${applied.length === 1 ? '' : 's'} using ${selectedGroups.length} style group${selectedGroups.length === 1 ? '' : 's'}${skipped.length ? `; skipped ${skipped.length}.` : '.'}`
      : 'No tabs were updated.';
    setStatus(applied.length ? successMessage : `${successMessage} ${skipped.length ? 'Verify each target has been opened.' : ''}`, applied.length ? 'success' : 'error');
    console.debug('Debug: styleSync apply summary', {
      sourceId: sourceTab.id,
      appliedIds: applied.map(tab => tab.id),
      skipped,
      groups: selectedGroups,
      copiedLayout: !!copiedLayout,
      titles: appliedTitles,
      skippedDetails
    });
    if (applied.length) {
      hidePrompt('apply-success');
    }
  }

  function handleSelectAllToggle(event) {
    const selectAll = event?.target;
    if (!state.dom.styleSyncTargets || !selectAll) return;
    const checkboxes = state.dom.styleSyncTargets.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(box => {
      box.checked = selectAll.checked;
    });
    updateApplyState(STYLE_SCHEMAS[getTabById(state.activeSourceId)?.type]);
  }

  function handleSourceChange() {
    const select = state.dom.styleSyncSource;
    state.activeSourceId = select ? select.value : null;
    const sourceTab = getTabById(state.activeSourceId);
    populateTargetOptions(sourceTab);
    const schema = sourceTab ? STYLE_SCHEMAS[sourceTab.type] : null;
    disableUnsupportedGroups(schema);
    syncTitleScopeOptions(schema);
    updateApplyState(schema);
    if (!schema) {
      setStatus(sourceTab ? `Style matching for ${sourceTab.type} graphs is not yet available.` : '', sourceTab ? 'error' : null);
    } else if (!sourceTab?.payload) {
      setStatus('Open the example graph first so its styles can be captured.', 'error');
    } else {
      setStatus('');
    }
    console.debug('Debug: styleSync source changed', {
      sourceId: sourceTab?.id || null,
      type: sourceTab?.type || null,
      hasPayload: !!sourceTab?.payload
    });
  }

  function handlePromptKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      hidePrompt('escape');
    }
  }

  function openPrompt(trigger) {
    if (!state.session || !state.workspaceState) {
      console.warn('styleSync open skipped: session or workspace state unavailable');
      return;
    }
    const activeTab = state.session.getActiveTab ? state.session.getActiveTab() : null;
    if (activeTab) {
      try {
        state.session.persistActiveTabState(activeTab, {
          workspaces: state.workspaces,
          previews: state.previews,
          reason: 'style-sync-open'
        });
      } catch (err) {
        console.error('styleSync persist active error', err);
      }
    }
    const prompt = state.dom.styleSyncPrompt;
    if (!prompt) {
      console.warn('styleSync prompt unavailable in DOM');
      return;
    }
    if (!state.dom.styleSyncSource || !state.dom.styleSyncTargets) {
      setStatus('Style matching controls are unavailable in this browser session.', 'error');
      debugLog('Debug: styleSync prompt aborted - missing controls', {
        hasSource: !!state.dom.styleSyncSource,
        hasTargets: !!state.dom.styleSyncTargets
      });
      return;
    }
    prompt.removeAttribute('hidden');
    prompt.setAttribute('aria-hidden', 'false');
    state.isOpen = true;
    const sourceTab = populateSourceOptions(activeTab?.id || state.activeSourceId);
    state.activeSourceId = sourceTab ? sourceTab.id : null;
    populateTargetOptions(sourceTab);
    const schema = sourceTab ? STYLE_SCHEMAS[sourceTab.type] : null;
    applyDefaultGroupSelection(schema);
    disableUnsupportedGroups(schema);
    syncTitleScopeOptions(schema);
    updateApplyState(schema);
    syncSelectAllCheckbox();
    setStatus('');
    if (state.dom.styleSyncSource) {
      try {
        state.dom.styleSyncSource.focus({ preventScroll: true });
      } catch (err) {
        debugLog('Debug: styleSync prompt focus retry', { error: err?.message || String(err) });
        const raf = window.requestAnimationFrame || window.setTimeout;
        raf(() => {
          try {
            state.dom.styleSyncSource?.focus({ preventScroll: true });
          } catch (focusErr) {
            debugLog('Debug: styleSync prompt focus failed', { error: focusErr?.message || String(focusErr) });
          }
        }, 0);
      }
    }
    console.debug('Debug: styleSync prompt shown', {
      trigger: trigger || 'unknown',
      sourceId: state.activeSourceId,
      sourceType: sourceTab?.type || null
    });
  }

  namespace.init = function init(options = {}) {
    if (state.initialized) {
      console.debug('Debug: styleSync.init skipped - already initialized');
      return {
        handleMatchStylesClick: () => openPrompt('repeat'),
        close: hidePrompt
      };
    }
    state.session = options.session || null;
    state.workspaceState = options.workspaceState || null;
    state.workspaces = options.workspaces || null;
    state.domControls = options.domControls || null;
    state.previews = options.previews || null;
    state.renderTabs = typeof options.renderTabs === 'function' ? options.renderTabs : null;
    state.defaultPayloadCache = {};
    state.dom = {
      styleSyncPrompt: options.dom?.styleSyncPrompt || document.getElementById('styleSyncPrompt'),
      styleSyncForm: options.dom?.styleSyncForm || document.querySelector('#styleSyncPrompt [data-style-sync-form]'),
      styleSyncSource: options.dom?.styleSyncSource || document.getElementById('styleSyncSource'),
      styleSyncTargets: options.dom?.styleSyncTargets || document.getElementById('styleSyncTargets'),
      styleSyncSelectAll: options.dom?.styleSyncSelectAll || document.getElementById('styleSyncTargetSelectAll'),
      styleSyncStatus: options.dom?.styleSyncStatus || document.getElementById('styleSyncStatus'),
      styleSyncApply: options.dom?.styleSyncApply || document.querySelector('#styleSyncPrompt [data-style-sync-apply]'),
      styleSyncCancel: options.dom?.styleSyncCancel || document.querySelector('#styleSyncPrompt [data-style-sync-cancel]')
    };
    if (state.dom.styleSyncSource) {
      state.dom.styleSyncSource.addEventListener('change', handleSourceChange);
    }
    if (state.dom.styleSyncSelectAll) {
      state.dom.styleSyncSelectAll.addEventListener('change', handleSelectAllToggle);
    }
    if (state.dom.styleSyncApply) {
      state.dom.styleSyncApply.addEventListener('click', applyStyles);
    }
    if (state.dom.styleSyncCancel) {
      state.dom.styleSyncCancel.addEventListener('click', () => hidePrompt('cancel'));
    }
    if (state.dom.styleSyncForm) {
      state.dom.styleSyncForm.addEventListener('keydown', handlePromptKeydown);
      state.dom.styleSyncForm.addEventListener('change', () => {
        const schema = STYLE_SCHEMAS[getTabById(state.activeSourceId)?.type];
        syncTitleScopeOptions(schema);
        updateApplyState(schema);
      });
    }
    state.initialized = true;
    console.debug('Debug: styleSync.init complete', {
      hasSession: !!state.session,
      hasWorkspaceState: !!state.workspaceState,
      hasDom: !!state.dom.styleSyncPrompt
    });
    return {
      handleMatchStylesClick: () => openPrompt('toolbar'),
      close: hidePrompt
    };
  };
})();
