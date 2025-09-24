(function(global){
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const survival = Components.survival = Components.survival || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fileIO = Shared.fileIO = Shared.fileIO || {};

  survival.__installed = true;
  survival.ready = false;

  const DEFAULT_ROWS = 100;
  const SURVIVAL_DEFAULT_COLS = 3;
  const DEFAULT_COLORS = global.DEFAULT_SCATTER_COLORS || [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
    '#ffff33', '#a65628', '#f781bf', '#999999'
  ];
  global.DEFAULT_SCATTER_COLORS = DEFAULT_COLORS;

  const state = {
    hot: null,
    scheduleDraw: null,
    labelColors: {},
    groupOrder: [],
    minSvgWidth: 0,
    tableObserver: null,
    fileHandle: null,
    fileName: 'survival.graph'
  };

  const refs = {};

  function $(selector){
    return document.querySelector(selector);
  }

  function logDebug(message, payload){
    try {
      console.debug(`Debug: survival ${message}`, payload || {});
    } catch (err) {
      // Avoid throwing inside logging helpers.
    }
  }

  function ensureElements(){
    refs.tablePanel = $('#survivalTablePanel');
    refs.graphPanel = $('#survivalGraphPanel');
    refs.panelResizer = $('#survivalPanelResizer');
    refs.svgBox = refs.graphPanel?.querySelector('.svgbox') || null;
    refs.configPanel = refs.graphPanel?.querySelector('.config-options') || null;
    refs.plotDiv = $('#survivalPlot');
    refs.hotWrapper = $('#survivalHotWrapper');
    refs.hotContainer = $('#survivalHot');
    refs.statsSummary = $('#survivalStatsSummary');
    refs.statsLogRank = $('#survivalStatsLogRank');
    refs.labelColorsDiv = $('#survivalLabelColors');
    refs.labelColorsFieldset = $('#survivalLabelColorsFieldset');
    refs.showCI = $('#survivalShowCI');
    refs.showCensor = $('#survivalShowCensor');
    refs.showGrid = $('#survivalShowGrid');
    refs.showFrame = $('#survivalShowFrame');
    refs.timeMax = $('#survivalTimeMax');
    refs.yMin = $('#survivalYMin');
    refs.yMax = $('#survivalYMax');
    refs.xLabel = $('#survivalXLabel');
    refs.yLabel = $('#survivalYLabel');
    refs.fontSize = $('#survivalFontSize');
    refs.fontSizeVal = $('#survivalFontSizeVal');
    refs.loadExampleBtn = $('#survivalLoadExample');
    refs.importBtn = $('#survivalImport');
    refs.fileInput = $('#survivalFile');
    refs.openBtn = $('#openSurvival');
    refs.saveBtn = $('#saveSurvival');
    refs.saveAsBtn = $('#saveAsSurvival');
    refs.graphFileInput = $('#survivalGraphFile');
    refs.exportContainer = $('#survivalExportControls');
    return !!(refs.tablePanel && refs.graphPanel && refs.hotContainer && refs.plotDiv);
  }

  function ensureWrapperStyles(){
    if(typeof Shared.ensureHotWrapperStyles === 'function' && refs.hotWrapper){
      Shared.ensureHotWrapperStyles(refs.hotWrapper);
      logDebug('wrapper styles applied', { wrapperId: refs.hotWrapper.id });
    }
  }

  function syncPanelWidths(){
    if(!Shared.syncPanelWidths || !refs.tablePanel || !refs.graphPanel || !refs.configPanel){
      logDebug('syncPanelWidths skipped', {
        hasShared: !!Shared.syncPanelWidths,
        hasTable: !!refs.tablePanel,
        hasGraph: !!refs.graphPanel,
        hasConfig: !!refs.configPanel
      });
      return;
    }
    Shared.syncPanelWidths(refs.tablePanel, refs.graphPanel, refs.configPanel, state.scheduleDraw, {
      svgBox: refs.svgBox,
      minSvgWidth: state.minSvgWidth,
      debugLabel: 'survival',
      panelResizer: refs.panelResizer
    });
    logDebug('panel widths synchronized', { minSvgWidth: state.minSvgWidth });
  }

  function initResizers(){
    if(global.ResizeObserver && refs.tablePanel){
      state.tableObserver = new ResizeObserver(() => syncPanelWidths());
      state.tableObserver.observe(refs.tablePanel);
      logDebug('table ResizeObserver attached');
    }
    syncPanelWidths();

    const container = refs.svgBox || refs.graphPanel;
    if(container && Shared.attachResizableBox){
      const sizing = chartStyle.getSquareGraphSizing
        ? chartStyle.getSquareGraphSizing({ context: 'survival' })
        : (function fallbackSizing(){
            const baseWidth = Number(chartStyle.DEFAULT_WIDTH) || 640;
            const baseHeight = Number(chartStyle.DEFAULT_HEIGHT) || baseWidth;
            const minScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
            const maxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
            const fallback = {
              width: baseWidth,
              height: baseHeight,
              minWidth: Math.max(160, Math.round(baseWidth * minScale)),
              minHeight: Math.max(120, Math.round(baseHeight * minScale)),
              maxWidth: Math.max(baseWidth, Math.round(baseWidth * Math.max(maxScale, minScale))),
              maxHeight: Math.max(baseHeight, Math.round(baseHeight * Math.max(maxScale, minScale))),
              aspectRatio: chartStyle.DEFAULT_ASPECT_RATIO || 1,
              aspectLocked: chartStyle.DEFAULT_ASPECT_LOCKED !== false
            };
            logDebug('fallback sizing computed', fallback);
            return fallback;
          })();
      logDebug('attachResizableBox config', sizing);
      Shared.attachResizableBox(container, {
        defaultWidth: sizing.width,
        defaultHeight: sizing.height,
        minWidth: sizing.minWidth,
        minHeight: sizing.minHeight,
        maxWidth: sizing.maxWidth,
        maxHeight: sizing.maxHeight,
        aspectLocked: sizing.aspectLocked !== false,
        aspectRatio: Number.isFinite(sizing.aspectRatio) ? sizing.aspectRatio : 1,
        onResize: phase => {
          logDebug('resizable box resize', { phase });
          syncPanelWidths();
        }
      });
    }

    if(refs.panelResizer && refs.tablePanel && refs.graphPanel){
      refs.panelResizer.addEventListener('pointerdown', event => {
        event.preventDefault();
        const startX = event.clientX;
        const startTable = refs.tablePanel.getBoundingClientRect().width;
        const startGraph = refs.graphPanel.getBoundingClientRect().width;
        const configWidth = refs.configPanel?.getBoundingClientRect().width || 0;
        const gap = parseFloat(getComputedStyle(refs.graphPanel.querySelector('.diagram-area')).gap || 0);
        const svgWidth = refs.svgBox?.getBoundingClientRect().width || 0;
        state.minSvgWidth = Math.max(state.minSvgWidth, svgWidth * 0.5);
        const minGraph = configWidth + gap + state.minSvgWidth;
        const total = startTable + startGraph;
        logDebug('panel drag start', { startTable, startGraph, minGraph, total });
        function onMove(ev){
          const dx = ev.clientX - startX;
          const newTable = Math.max(150, Math.min(total - minGraph, startTable + dx));
          const newGraph = total - newTable;
          refs.tablePanel.style.flex = `0 0 ${newTable}px`;
          refs.graphPanel.style.flex = `0 0 ${newGraph}px`;
          syncPanelWidths();
          logDebug('panel drag move', { dx, newTable, newGraph });
        }
        function onUp(){
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          logDebug('panel drag end');
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    }
  }

  function initHot(){
    if(!refs.hotContainer || !global.Handsontable){
      console.warn('Survival hot container or Handsontable missing');
      return;
    }
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('Shared.hot.createStandardTable unavailable for survival component');
      return;
    }
    const baseData = Shared.createEmptyData(DEFAULT_ROWS, SURVIVAL_DEFAULT_COLS);
    logDebug('initHot table schema', { firstRowIsHeader: false, columns: SURVIVAL_DEFAULT_COLS });
    state.hot = Shared.hot.createStandardTable(refs.hotContainer, { rows: DEFAULT_ROWS, cols: SURVIVAL_DEFAULT_COLS }, () => {
      if(state.scheduleDraw){
        logDebug('table scheduled redraw');
        state.scheduleDraw();
      }
    }, {
      debugLabel: 'survival',
      data: baseData,
      firstRowIsHeader: false,
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        contextMenu: true,
        colHeaders: ['Group', 'Time', 'Event (1=event,0=censored)'],
        afterChange(changes, source){
          if(changes){
            logDebug('table afterChange', { count: changes.length, source });
          }
        }
      }
    });
    logDebug('Handsontable initialized', { hasHot: !!state.hot });
  }

  function updateGroupColorPickers(groupNames){
    if(!refs.labelColorsDiv || !refs.labelColorsFieldset){
      return;
    }
    refs.labelColorsDiv.innerHTML = '';
    const activeNames = Array.isArray(groupNames) ? groupNames : [];
    Object.keys(state.labelColors).forEach(name => {
      if(!activeNames.includes(name)){
        delete state.labelColors[name];
      }
    });
    activeNames.forEach((name, index) => {
      if(!state.labelColors[name]){
        state.labelColors[name] = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      }
      const wrapper = document.createElement('label');
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      wrapper.style.marginRight = '8px';
      wrapper.textContent = `${name}`;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = state.labelColors[name];
      if(typeof global.attachColorPickerNear === 'function'){
        global.attachColorPickerNear(input);
      }
      input.addEventListener('input', ev => {
        state.labelColors[name] = ev.target.value;
        logDebug('group color changed', { group: name, color: ev.target.value });
        if(state.scheduleDraw){
          state.scheduleDraw();
        }
      });
      wrapper.appendChild(input);
      refs.labelColorsDiv.appendChild(wrapper);
    });
    refs.labelColorsFieldset.style.display = activeNames.length ? '' : 'none';
    logDebug('group color pickers updated', { count: activeNames.length });
  }

  function computeKaplanMeier(records){
    const sorted = records.slice().sort((a, b) => {
      if(a.time === b.time){
        if(a.event === b.event) return 0;
        return a.event ? -1 : 1;
      }
      return a.time - b.time;
    });
    const stepPoints = [{ time: 0, survival: 1 }];
    const lowerSteps = [{ time: 0, value: 1 }];
    const upperSteps = [{ time: 0, value: 1 }];
    const censorPoints = [];
    const z = 1.96;
    let atRisk = sorted.length;
    let survivalProb = 1;
    let cumulativeVar = 0;
    let median = null;
    let lastTime = 0;
    let lastLower = 1;
    let lastUpper = 1;

    for(let i = 0; i < sorted.length; ){
      const currentTime = sorted[i].time;
      const group = [];
      while(i < sorted.length && Math.abs(sorted[i].time - currentTime) < 1e-9){
        group.push(sorted[i]);
        i += 1;
      }
      let events = 0;
      let censored = 0;
      group.forEach(item => {
        if(item.event){ events += 1; } else { censored += 1; }
      });

      stepPoints.push({ time: currentTime, survival: survivalProb });
      lowerSteps.push({ time: currentTime, value: lastLower });
      upperSteps.push({ time: currentTime, value: lastUpper });

      if(events > 0 && atRisk > 0){
        const hazard = events / atRisk;
        survivalProb = survivalProb * (1 - hazard);
        if(atRisk - events > 0){
          cumulativeVar += events / (atRisk * (atRisk - events));
        }
        const se = survivalProb * Math.sqrt(Math.max(cumulativeVar, 0));
        lastLower = Math.max(0, survivalProb - z * se);
        lastUpper = Math.min(1, survivalProb + z * se);
        stepPoints.push({ time: currentTime, survival: survivalProb });
        lowerSteps.push({ time: currentTime, value: lastLower });
        upperSteps.push({ time: currentTime, value: lastUpper });
        if(median === null && survivalProb <= 0.5){
          median = currentTime;
        }
      }

      if(censored > 0){
        for(let c = 0; c < censored; c += 1){
          censorPoints.push({ time: currentTime, survival: survivalProb });
        }
      }

      atRisk -= (events + censored);
      if(atRisk < 0){
        atRisk = 0;
      }
      lastTime = currentTime;
    }

    return {
      steps: stepPoints,
      lower: lowerSteps,
      upper: upperSteps,
      censor: censorPoints,
      median,
      lastSurvival: survivalProb,
      maxTime: lastTime
    };
  }

  function invertMatrix(matrix){
    if(!Array.isArray(matrix) || !matrix.length){
      return null;
    }
    const n = matrix.length;
    const augmented = matrix.map((row, rowIndex) => {
      const extended = row.slice();
      for(let j = 0; j < n; j += 1){
        extended.push(rowIndex === j ? 1 : 0);
      }
      return extended;
    });
    for(let i = 0; i < n; i += 1){
      let pivotRow = i;
      let pivotValue = augmented[i][i];
      for(let r = i + 1; r < n; r += 1){
        if(Math.abs(augmented[r][i]) > Math.abs(pivotValue)){
          pivotValue = augmented[r][i];
          pivotRow = r;
        }
      }
      if(!Number.isFinite(pivotValue) || Math.abs(pivotValue) < 1e-12){
        logDebug('invertMatrix singular pivot', { index: i, pivot: pivotValue });
        return null;
      }
      if(pivotRow !== i){
        const temp = augmented[i];
        augmented[i] = augmented[pivotRow];
        augmented[pivotRow] = temp;
      }
      const divisor = augmented[i][i];
      for(let j = 0; j < 2 * n; j += 1){
        augmented[i][j] /= divisor;
      }
      for(let r = 0; r < n; r += 1){
        if(r === i) continue;
        const factor = augmented[r][i];
        for(let c = 0; c < 2 * n; c += 1){
          augmented[r][c] -= factor * augmented[i][c];
        }
      }
    }
    const inverse = augmented.map(row => row.slice(n));
    return inverse;
  }

  function multiplyMatrixVector(matrix, vector){
    return matrix.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));
  }

  function dotProduct(a, b){
    let total = 0;
    for(let i = 0; i < a.length; i += 1){
      total += a[i] * b[i];
    }
    return total;
  }

  function computeLogRank(series){
    if(!Array.isArray(series) || series.length < 2){
      return { available: false, message: 'Log-rank test requires at least two groups.' };
    }
    const eventTimes = new Set();
    series.forEach(group => {
      group.records.forEach(rec => {
        if(rec.event && Number.isFinite(rec.time)){
          eventTimes.add(rec.time);
        }
      });
    });
    const uniqueTimes = Array.from(eventTimes).sort((a, b) => a - b);
    if(!uniqueTimes.length){
      return { available: false, message: 'No events detected for log-rank test.' };
    }
    const k = series.length;
    const atRisk = series.map(group => group.records.length);
    const eventMaps = series.map(group => {
      const map = new Map();
      group.records.forEach(rec => {
        const existing = map.get(rec.time) || { events: 0, censored: 0 };
        if(rec.event){ existing.events += 1; } else { existing.censored += 1; }
        map.set(rec.time, existing);
      });
      return map;
    });
    const diff = new Array(k).fill(0);
    const variance = Array.from({ length: k }, () => new Array(k).fill(0));

    uniqueTimes.forEach(time => {
      const eventsAtTime = eventMaps.map(map => map.get(time)?.events || 0);
      const censoredAtTime = eventMaps.map(map => map.get(time)?.censored || 0);
      const totalEvents = eventsAtTime.reduce((sum, value) => sum + value, 0);
      const totalAtRisk = atRisk.reduce((sum, value) => sum + value, 0);
      if(totalEvents > 0 && totalAtRisk > 0){
        eventsAtTime.forEach((observed, idx) => {
          const expected = (atRisk[idx] / totalAtRisk) * totalEvents;
          diff[idx] += observed - expected;
        });
        if(totalAtRisk > 1){
          const common = totalEvents * (totalAtRisk - totalEvents) / (totalAtRisk * (totalAtRisk - 1));
          for(let g = 0; g < k; g += 1){
            const pg = atRisk[g] / totalAtRisk;
            for(let h = 0; h < k; h += 1){
              const ph = atRisk[h] / totalAtRisk;
              if(g === h){
                variance[g][h] += common * pg * (1 - pg);
              } else {
                variance[g][h] -= common * pg * ph;
              }
            }
          }
        }
      }
      for(let idx = 0; idx < k; idx += 1){
        atRisk[idx] -= (eventsAtTime[idx] + censoredAtTime[idx]);
        if(atRisk[idx] < 0){
          atRisk[idx] = 0;
        }
      }
    });

    const df = k - 1;
    if(df <= 0){
      return { available: false, message: 'Insufficient groups for log-rank statistic.' };
    }
    const reducedMatrix = [];
    for(let i = 0; i < df; i += 1){
      const row = [];
      for(let j = 0; j < df; j += 1){
        row.push(variance[i][j]);
      }
      reducedMatrix.push(row);
    }
    const inverse = invertMatrix(reducedMatrix);
    if(!inverse){
      return { available: false, message: 'Unable to invert log-rank variance matrix.' };
    }
    const diffVec = diff.slice(0, df);
    const invTimesDiff = multiplyMatrixVector(inverse, diffVec);
    const chi2 = dotProduct(diffVec, invTimesDiff);
    let pValue = null;
    if(global.jStat && global.jStat.chisquare && typeof global.jStat.chisquare.cdf === 'function'){
      pValue = 1 - global.jStat.chisquare.cdf(chi2, df);
    }
    logDebug('log-rank summary', { chi2, df, p: pValue });
    return { available: true, chi2, df, p: pValue };
  }

  function collectSeries(){
    if(!state.hot){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false } };
    }
    const data = state.hot.getData() || [];
    if(!Array.isArray(data) || !data.length){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false } };
    }
    const groups = new Map();
    let maxTime = 0;
    let usedRows = 0;
    for(let i = 0; i < data.length; i += 1){
      const row = data[i];
      if(!row){
        continue;
      }
      const groupRaw = row[0];
      const timeRaw = row[1];
      const eventRaw = row[2];
      const groupName = typeof groupRaw === 'string' ? groupRaw.trim() : (groupRaw != null ? String(groupRaw).trim() : '');
      const time = Number.parseFloat(timeRaw);
      const eventFlag = Number(eventRaw);
      if(!groupName || !Number.isFinite(time)){
        continue;
      }
      usedRows += 1;
      const bucket = groups.get(groupName) || { name: groupName, records: [], events: 0, censored: 0 };
      const record = { time, event: eventFlag === 1 };
      bucket.records.push(record);
      if(record.event){ bucket.events += 1; } else { bucket.censored += 1; }
      groups.set(groupName, bucket);
      if(Number.isFinite(time)){
        maxTime = Math.max(maxTime, time);
      }
    }
    const groupNames = Array.from(groups.keys());
    if(!groupNames.length || usedRows === 0){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false } };
    }
    state.groupOrder = state.groupOrder.filter(name => groups.has(name));
    groupNames.forEach(name => {
      if(!state.groupOrder.includes(name)){
        state.groupOrder.push(name);
      }
    });
    const ordered = state.groupOrder.slice();
    const series = ordered.map(name => {
      const entry = groups.get(name);
      if(!entry){
        return null;
      }
      const km = computeKaplanMeier(entry.records);
      maxTime = Math.max(maxTime, km.maxTime);
      return {
        name,
        records: entry.records,
        events: entry.events,
        censored: entry.censored,
        total: entry.records.length,
        km
      };
    }).filter(Boolean);
    const logRank = computeLogRank(series);
    logDebug('series collected', { groupCount: series.length, maxTime, logRankAvailable: !!logRank.available, usedRows });
    return { series, groupNames: ordered, maxTime, logRank };
  }

  function extendSteps(points, axisMax){
    const extended = points.map(pt => ({ time: pt.time, survival: pt.survival, value: pt.value }));
    if(!extended.length){
      return extended;
    }
    if(Number.isFinite(axisMax)){
      const last = extended[extended.length - 1];
      const lastTime = Number.isFinite(last.time) ? last.time : 0;
      if(axisMax > lastTime){
        const value = Number.isFinite(last.survival) ? last.survival : (Number.isFinite(last.value) ? last.value : 0);
        extended.push({ time: axisMax, survival: value, value });
      }
    }
    return extended;
  }

  function buildStepPath(points, axisMax, x2px, y2px, accessor){
    const extended = extendSteps(points, axisMax);
    if(!extended.length){
      return '';
    }
    const coords = extended.map(pt => {
      const time = Number.isFinite(pt.time) ? pt.time : 0;
      const value = Number.isFinite(accessor(pt)) ? accessor(pt) : 0;
      return { x: x2px(time), y: y2px(value) };
    });
    return coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x} ${coord.y}`).join(' ');
  }

  function buildConfidencePath(upper, lower, axisMax, x2px, y2px){
    const up = extendSteps(upper, axisMax);
    const low = extendSteps(lower, axisMax);
    if(!up.length || !low.length){
      return '';
    }
    const parts = [];
    up.forEach((pt, idx) => {
      const x = x2px(Number.isFinite(pt.time) ? pt.time : 0);
      const y = y2px(Number.isFinite(pt.value) ? pt.value : (Number.isFinite(pt.survival) ? pt.survival : 0));
      parts.push(`${idx === 0 ? 'M' : 'L'}${x} ${y}`);
    });
    for(let i = low.length - 1; i >= 0; i -= 1){
      const pt = low[i];
      const x = x2px(Number.isFinite(pt.time) ? pt.time : 0);
      const y = y2px(Number.isFinite(pt.value) ? pt.value : (Number.isFinite(pt.survival) ? pt.survival : 0));
      parts.push(`L${x} ${y}`);
    }
    parts.push('Z');
    return parts.join(' ');
  }

  function formatNumber(value, digits){
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    const precision = Number.isFinite(digits) ? digits : 2;
    return value.toLocaleString('en-US', { maximumFractionDigits: precision });
  }

  function formatP(value){
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    if(value < 1e-4){
      return value.toExponential(2);
    }
    return value.toLocaleString('en-US', { maximumSignificantDigits: 4 });
  }

  function autoResizeSvgHelper(svg){
    const fn = Shared.autoResizeSvg || global.autoResizeSvg;
    if(typeof fn === 'function'){
      fn(svg, { scopeId: 'survivalGraphPanel' });
    }
  }

  function drawSurvival(){
    if(!refs.plotDiv){
      return;
    }
    const debugStamp = Date.now();
    logDebug('draw start', { debugStamp });
    while(refs.plotDiv.firstChild){
      refs.plotDiv.removeChild(refs.plotDiv.firstChild);
    }
    const summary = collectSeries();
    updateGroupColorPickers(summary.groupNames);
    if(!summary.series.length){
      refs.plotDiv.innerHTML = '<i>No data</i>';
      updateStats(summary);
      return;
    }
    const containerRect = refs.svgBox?.getBoundingClientRect?.();
    const width = Math.max(200, Math.floor(refs.plotDiv.clientWidth || containerRect?.width || 400));
    const height = Math.max(200, Math.floor(refs.plotDiv.clientHeight || containerRect?.height || 320));
    logDebug('draw dimensions resolved', { width, height });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'survivalSvg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    chartStyle.applySvgDefaults(svg);
    refs.plotDiv.appendChild(svg);

    const fontInfo = chartStyle.resolveScaledFontSize ? chartStyle.resolveScaledFontSize({
      rawSize: refs.fontSize?.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: refs.svgBox,
      input: refs.fontSize
    }) : { scaledPx: Number(refs.fontSize?.value) || 13, pt: Number(refs.fontSize?.value) || 13, scaleInfo: { styleScale: 1 } };
    chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, fontInfo, input: refs.fontSize });
    const fs = fontInfo.scaledPx || 13;
    const styleScaleInfo = fontInfo.scaleInfo || { styleScale: 1 };
    const axisStrokeWidth = chartStyle.scaleStrokeWidth ? chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'survival-axis', min: 0.5 }) : 1;
    const curveStrokeWidth = chartStyle.scaleStrokeWidth ? chartStyle.scaleStrokeWidth(2, styleScaleInfo, { context: 'survival-curve', min: 0.8 }) : 2;

    const axisMetrics = chartStyle.createAxisMetrics ? chartStyle.createAxisMetrics(fs) : { tickLength: 6, tickLabelGap: 6, axisTitleGap: 8, outerPadding: 8 };
    const tickLen = axisMetrics.tickLength ?? 6;
    const tickGap = axisMetrics.tickLabelGap ?? 6;
    const xLabelText = refs.xLabel?.value?.trim() || 'Time';
    const yLabelText = refs.yLabel?.value?.trim() || 'Survival Probability';
    const axisLabelFont = chartStyle.makeFont ? chartStyle.makeFont(fs) : `${fs}px sans-serif`;
    const yTitleWidthBase = chartStyle.measureText ? chartStyle.measureText(yLabelText, axisLabelFont) : fs * yLabelText.length * 0.6;

    const legendEntries = summary.series.map((group, index) => {
      const color = state.labelColors[group.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      const textWidth = chartStyle.measureText ? chartStyle.measureText(group.name, axisLabelFont) : fs * group.name.length * 0.6;
      return { name: group.name, color, width: textWidth + fs * 2.5 };
    });
    const legendWidth = legendEntries.length ? Math.max(...legendEntries.map(entry => entry.width)) : 0;

    const niceNum = (range, round) => {
      const exponent = Math.floor(Math.log10(range));
      const fraction = range / Math.pow(10, exponent);
      let niceFraction;
      if(round){
        if(fraction < 1.5) niceFraction = 1;
        else if(fraction < 3) niceFraction = 2;
        else if(fraction < 7) niceFraction = 5;
        else niceFraction = 10;
      } else {
        if(fraction <= 1) niceFraction = 1;
        else if(fraction <= 2) niceFraction = 2;
        else if(fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
      }
      return niceFraction * Math.pow(10, exponent);
    };

    const niceScale = (min, max, maxTicks) => {
      if(min === max){
        max = min + 1;
      }
      const range = niceNum(max - min, false);
      const step = niceNum(range / Math.max(maxTicks - 1, 1), true);
      const scaledMin = Math.floor(min / step) * step;
      const scaledMax = Math.ceil(max / step) * step;
      const ticks = [];
      for(let v = scaledMin; v <= scaledMax + 1e-9; v += step){
        ticks.push(Number(v.toFixed(10)));
      }
      return { min: scaledMin, max: scaledMax, step, ticks };
    };

    const autoXMax = summary.maxTime > 0 ? summary.maxTime : 1;
    const manualXMax = Number.parseFloat(refs.timeMax?.value);
    let xMax = Number.isFinite(manualXMax) && manualXMax > 0 ? manualXMax : autoXMax * 1.05;
    xMax = Math.max(xMax, autoXMax || 1);
    const xMin = 0;
    const manualYMin = Number.parseFloat(refs.yMin?.value);
    const manualYMax = Number.parseFloat(refs.yMax?.value);
    let yMin = Number.isFinite(manualYMin) ? manualYMin : 0;
    let yMax = Number.isFinite(manualYMax) ? manualYMax : 1;
    if(yMax <= yMin){
      yMax = yMin + 1;
    }
    yMin = Math.max(Math.min(yMin, yMax - 0.01), -0.2);
    yMax = Math.max(yMax, yMin + 0.01);

    const xTickTarget = chartStyle.estimateTickCount ? chartStyle.estimateTickCount(width, { axis: 'x', fallback: 6 }) : 6;
    const yTickTarget = chartStyle.estimateTickCount ? chartStyle.estimateTickCount(height, { axis: 'y', fallback: 6 }) : 6;

    const tickFont = chartStyle.makeFont ? chartStyle.makeFont(fs) : `${fs}px sans-serif`;
    let margin = chartStyle.computeBaseMargins ? chartStyle.computeBaseMargins({
      fontSize: fs,
      legendWidth,
      maxYLabelWidth: 0,
      yTitleWidth: yTitleWidthBase,
      axisMetrics
    }) : { top: fs * 3, right: legendWidth + 24, bottom: fs * 4, left: fs * 4 };
    let plotW = Math.max(20, width - margin.left - margin.right);
    let plotH = Math.max(20, height - margin.top - margin.bottom);
    let bottomLayout = chartStyle.computeBottomLayout ? chartStyle.computeBottomLayout({
      labels: [],
      fontSize: fs,
      plotWidth: plotW,
      baseBottom: margin.bottom,
      axisMetrics
    }) : { bottom: margin.bottom, shouldRotate: false, titleOffset: fs * 2, labelOffset: fs, tickLength: tickLen, tickLabelGap: tickGap };
    margin.bottom = bottomLayout.bottom;

    let xScale;
    let yScale;
    let xTickLabels = [];
    let yTickLabels = [];

    for(let pass = 0; pass < 2; pass += 1){
      plotW = Math.max(20, width - margin.left - margin.right);
      plotH = Math.max(20, height - margin.top - margin.bottom);
      xScale = niceScale(xMin, xMax, xTickTarget);
      yScale = niceScale(yMin, yMax, yTickTarget);
      xTickLabels = xScale.ticks.map(value => formatNumber(value, 2));
      yTickLabels = yScale.ticks.map(value => formatNumber(value, 2));
      const yLabelWidths = yTickLabels.map(label => chartStyle.measureText ? chartStyle.measureText(label, tickFont) : label.length * fs * 0.6);
      const maxYLabelWidth = yLabelWidths.length ? Math.max(...yLabelWidths) : 0;
      margin = chartStyle.computeBaseMargins ? chartStyle.computeBaseMargins({
        fontSize: fs,
        legendWidth,
        maxYLabelWidth,
        yTitleWidth: yTitleWidthBase,
        axisMetrics
      }) : margin;
      plotW = Math.max(20, width - margin.left - margin.right);
      plotH = Math.max(20, height - margin.top - margin.bottom);
      bottomLayout = chartStyle.computeBottomLayout ? chartStyle.computeBottomLayout({
        labels: xTickLabels,
        fontSize: fs,
        plotWidth: plotW,
        baseBottom: margin.bottom,
        axisMetrics
      }) : bottomLayout;
      margin.bottom = bottomLayout.bottom;
    }

    plotW = Math.max(20, width - margin.left - margin.right);
    plotH = Math.max(20, height - margin.top - margin.bottom);

    const x2px = value => {
      const span = xScale.max - xScale.min || 1;
      return margin.left + (plotW * (value - xScale.min) / span);
    };
    const y2px = value => {
      const span = yScale.max - yScale.min || 1;
      return margin.top + plotH - (plotH * (value - yScale.min) / span);
    };

    function add(tag, attrs, parent){
      const el = document.createElementNS(NS, tag);
      Object.entries(attrs || {}).forEach(([key, value]) => {
        if(value != null){
          el.setAttribute(key, String(value));
        }
      });
      (parent || svg).appendChild(el);
      return el;
    }

    const showGrid = !!refs.showGrid?.checked;
    const showFrame = !!refs.showFrame?.checked;

    if(showGrid){
      xScale.ticks.forEach(val => {
        const x = x2px(val);
        add('line', { x1: x, y1: margin.top, x2: x, y2: margin.top + plotH, stroke: '#ddd', 'stroke-width': axisStrokeWidth });
      });
      yScale.ticks.forEach(val => {
        const y = y2px(val);
        add('line', { x1: margin.left, y1: y, x2: margin.left + plotW, y2: y, stroke: '#ddd', 'stroke-width': axisStrokeWidth });
      });
    }

    const xAxisY = margin.top + plotH;
    const yAxisX = margin.left;
    add('line', { x1: margin.left, y1: xAxisY, x2: margin.left + plotW, y2: xAxisY, stroke: '#000', 'stroke-width': axisStrokeWidth, 'stroke-linecap': 'square' });
    add('line', { x1: yAxisX, y1: margin.top, x2: yAxisX, y2: margin.top + plotH, stroke: '#000', 'stroke-width': axisStrokeWidth, 'stroke-linecap': 'square' });

    if(showFrame){
      chartStyle.drawPlotFrame?.({ svg, margin, plotW, plotH, stroke: '#000', sides: ['top', 'right'] });
    }

    const xTickNodes = [];
    xScale.ticks.forEach(value => {
      const x = x2px(value);
      add('line', { x1: x, y1: xAxisY, x2: x, y2: xAxisY + tickLen, stroke: '#000', 'stroke-width': axisStrokeWidth });
      const text = add('text', {
        x,
        y: xAxisY + tickLen + tickGap,
        'font-size': fs,
        'text-anchor': 'middle',
        'dominant-baseline': 'hanging',
        fill: chartStyle.TEXT_COLOR || '#000'
      });
      text.textContent = formatNumber(value, 2);
      xTickNodes.push(text);
    });
    chartStyle.applyLabelOrientation?.(xTickNodes, { angle: -45, anchor: 'end', dy: '0.35em', force: bottomLayout.shouldRotate });

    yScale.ticks.forEach(value => {
      const y = y2px(value);
      add('line', { x1: yAxisX - tickLen, y1: y, x2: yAxisX, y2: y, stroke: '#000', 'stroke-width': axisStrokeWidth });
      const text = add('text', {
        x: yAxisX - (tickLen + tickGap),
        y,
        'font-size': fs,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        fill: chartStyle.TEXT_COLOR || '#000'
      });
      text.textContent = formatNumber(value, 2);
    });

    const xTitleY = xAxisY + (bottomLayout.titleOffset || fs * 2);
    const xTitle = add('text', {
      x: margin.left + plotW / 2,
      y: xTitleY,
      'font-size': fs,
      'text-anchor': 'middle',
      fill: chartStyle.TEXT_COLOR || '#000'
    });
    xTitle.textContent = xLabelText;

    const yTitleX = margin.left - (yTitleWidthBase + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
    const yTitle = add('text', {
      x: yTitleX,
      y: margin.top + plotH / 2,
      transform: `rotate(-90 ${yTitleX} ${margin.top + plotH / 2})`,
      'font-size': fs,
      'text-anchor': 'middle',
      fill: chartStyle.TEXT_COLOR || '#000'
    });
    yTitle.textContent = yLabelText;

    const showCI = !!refs.showCI?.checked;
    const showCensor = !!refs.showCensor?.checked;

    const groupsForDraw = summary.series.map((group, index) => {
      const color = state.labelColors[group.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      return { ...group, color };
    });

    groupsForDraw.forEach(group => {
      if(showCI){
        const ciPath = buildConfidencePath(group.km.upper, group.km.lower, xScale.max, x2px, y2px);
        if(ciPath){
          add('path', {
            d: ciPath,
            fill: group.color,
            'fill-opacity': 0.15,
            stroke: 'none'
          });
        }
      }
      const stepPath = buildStepPath(group.km.steps, xScale.max, x2px, y2px, pt => pt.survival ?? pt.value ?? 0);
      if(stepPath){
        add('path', {
          d: stepPath,
          fill: 'none',
          stroke: group.color,
          'stroke-width': curveStrokeWidth,
          'stroke-linejoin': 'bevel'
        });
      }
      if(showCensor && group.km.censor.length){
        const markerSize = Math.max(4, fs * 0.6);
        group.km.censor.forEach(marker => {
          const x = x2px(marker.time);
          const y = y2px(marker.survival);
          add('line', {
            x1: x - markerSize / 2,
            y1: y,
            x2: x + markerSize / 2,
            y2: y,
            stroke: group.color,
            'stroke-width': axisStrokeWidth
          });
          add('line', {
            x1: x,
            y1: y - markerSize / 2,
            x2: x,
            y2: y + markerSize / 2,
            stroke: group.color,
            'stroke-width': axisStrokeWidth
          });
        });
      }
    });

    if(legendEntries.length){
      const legendGroup = document.createElementNS(NS, 'g');
      const legendX = margin.left + plotW + 12;
      const legendY = margin.top;
      legendEntries.forEach((entry, index) => {
        const row = document.createElementNS(NS, 'g');
        row.setAttribute('transform', `translate(${legendX} ${legendY + index * (fs + 6)})`);
        const sample = document.createElementNS(NS, 'line');
        sample.setAttribute('x1', '0');
        sample.setAttribute('y1', String(-fs / 4));
        sample.setAttribute('x2', String(fs * 1.2));
        sample.setAttribute('y2', String(-fs / 4));
        sample.setAttribute('stroke', entry.color);
        sample.setAttribute('stroke-width', curveStrokeWidth);
        row.appendChild(sample);
        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', String(fs * 1.4));
        label.setAttribute('y', '0');
        label.setAttribute('font-size', String(fs));
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('fill', chartStyle.TEXT_COLOR || '#000');
        label.textContent = entry.name;
        row.appendChild(label);
        legendGroup.appendChild(row);
      });
      svg.appendChild(legendGroup);
    }

    updateStats({ ...summary, series: groupsForDraw });
    autoResizeSvgHelper(svg);
    logDebug('draw complete', { debugStamp });
  }

  function updateStats(summary){
    if(!refs.statsSummary || !refs.statsLogRank){
      return;
    }
    if(!summary.series.length){
      refs.statsSummary.textContent = 'Enter at least one group with time and event values to compute statistics.';
      refs.statsLogRank.textContent = '';
      return;
    }
    const rows = summary.series.map(group => {
      const medianLabel = group.km.median != null ? formatNumber(group.km.median, 2) : 'Not reached';
      return `<tr><td>${group.name}</td><td style="text-align:right;">${group.total}</td><td style="text-align:right;">${group.events}</td><td style="text-align:right;">${group.censored}</td><td style="text-align:right;">${medianLabel}</td></tr>`;
    }).join('');
    refs.statsSummary.innerHTML = `<table class="stats-table" style="border-collapse:collapse; width:100%;">
      <thead>
        <tr>
          <th style="border:1px solid #ccc; padding:4px; text-align:left;">Group</th>
          <th style="border:1px solid #ccc; padding:4px; text-align:right;">N</th>
          <th style="border:1px solid #ccc; padding:4px; text-align:right;">Events</th>
          <th style="border:1px solid #ccc; padding:4px; text-align:right;">Censored</th>
          <th style="border:1px solid #ccc; padding:4px; text-align:right;">Median</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
    if(summary.logRank?.available){
      const chi2 = formatNumber(summary.logRank.chi2, 3);
      const pLabel = formatP(summary.logRank.p);
      refs.statsLogRank.innerHTML = `<strong>Log-rank test:</strong> χ²(${summary.logRank.df}) = ${chi2}, p = ${pLabel}`;
    } else {
      refs.statsLogRank.textContent = summary.logRank?.message || 'Log-rank test unavailable.';
    }
    logDebug('statistics updated', { groupCount: summary.series.length, logRank: summary.logRank });
  }

  function getGraphPayload(){
    if(!state.hot){
      console.debug('Debug: survival.getPayload skipped - no table instance');
      return null;
    }
    const payload = {
      type: 'survival',
      data: state.hot.getData(),
      config: {
        labelColors: state.labelColors,
        showCI: !!refs.showCI?.checked,
        showCensor: !!refs.showCensor?.checked,
        showGrid: !!refs.showGrid?.checked,
        showFrame: !!refs.showFrame?.checked,
        timeMax: refs.timeMax?.value || '',
        yMin: refs.yMin?.value || '',
        yMax: refs.yMax?.value || '',
        fontSize: refs.fontSize?.value || '13',
        xLabel: refs.xLabel?.value || '',
        yLabel: refs.yLabel?.value || ''
      }
    };
    console.debug('Debug: survival.getPayload captured state', {
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      showCI: payload.config.showCI
    });
    return payload;
  }
  survival.getPayload = getGraphPayload;

  function applyConfig(config){
    if(!config){
      return;
    }
    state.labelColors = Object.assign({}, config.labelColors || {});
    if(refs.showCI) refs.showCI.checked = !!config.showCI;
    if(refs.showCensor) refs.showCensor.checked = !!config.showCensor;
    if(refs.showGrid) refs.showGrid.checked = !!config.showGrid;
    if(refs.showFrame) refs.showFrame.checked = !!config.showFrame;
    if(refs.timeMax) refs.timeMax.value = config.timeMax || '';
    if(refs.yMin) refs.yMin.value = config.yMin || '';
    if(refs.yMax) refs.yMax.value = config.yMax || '';
    if(refs.fontSize) refs.fontSize.value = config.fontSize || '13';
    if(refs.fontSize && refs.fontSize.dataset){
      refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      logDebug('font size base restored', { value: refs.fontSize.value });
    }
    if(refs.fontSizeVal){
      chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: Number(refs.fontSize?.value), input: refs.fontSize, manual: true });
    }
    if(refs.xLabel) refs.xLabel.value = config.xLabel || 'Time';
    if(refs.yLabel) refs.yLabel.value = config.yLabel || 'Survival Probability';
    logDebug('config applied', config);
  }

  function loadFromFile(file){
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const payload = JSON.parse(event.target.result);
        if(payload?.type !== 'survival'){
          throw new Error('Invalid survival graph payload');
        }
        if(Array.isArray(payload.data) && state.hot){
          state.hot.loadData(payload.data);
        }
        applyConfig(payload.config);
        if(state.scheduleDraw){
          state.scheduleDraw();
        }
        logDebug('file loaded', { rows: payload.data?.length });
      } catch (error){
        console.error('Failed to load survival graph', error);
      }
    };
    reader.readAsText(file);
  }
  survival.loadFromFile = loadFromFile;

  async function saveFile(){
    const payload = getGraphPayload();
    if(!payload){
      return;
    }
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('saveSurvivalFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'survival',
      fileHandle: state.fileHandle,
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    logDebug('save result', { success: !!result, hasHandle: !!state.fileHandle });
  }

  async function saveFileAs(){
    const payload = getGraphPayload();
    if(!payload){
      return;
    }
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('saveAsSurvivalFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'survival',
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    logDebug('saveAs result', { success: !!result, fileName: state.fileName });
  }

  async function openFile(){
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('openSurvivalFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'survival',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: file => loadFromFile(file),
      triggerInput: () => {
        if(refs.graphFileInput){
          refs.graphFileInput.value = '';
          refs.graphFileInput.click();
        }
      }
    });
    logDebug('open result', { success: !!result });
  }

  function initControls(){
    const schedule = () => {
      if(state.scheduleDraw){
        state.scheduleDraw();
      }
    };
    [refs.showCI, refs.showCensor, refs.showGrid].forEach(control => {
      control?.addEventListener('change', () => {
        logDebug('control toggled', { id: control.id, checked: control.checked });
        schedule();
      });
    });
    refs.showFrame?.addEventListener('change', () => {
      logDebug('control toggled', { id: refs.showFrame.id, checked: refs.showFrame.checked });
      schedule();
    });
    [refs.timeMax, refs.yMin, refs.yMax, refs.xLabel, refs.yLabel].forEach(input => {
      input?.addEventListener('input', () => {
        logDebug('control input', { id: input.id, value: input.value });
        schedule();
      });
    });
    refs.fontSize?.addEventListener('input', () => {
      if(refs.fontSize?.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        logDebug('font size base updated', { value: refs.fontSize.value });
      }
      chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
      logDebug('font size input', { value: refs.fontSize.value });
      schedule();
    });
    if(refs.fontSize?.dataset){
      refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      logDebug('font size base initialized', { value: refs.fontSize.value });
    }
    chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: Number(refs.fontSize?.value), input: refs.fontSize, manual: true });
  }

  function initExampleAndImport(){
    const example = [
      ['Control', 1.2, 1],
      ['Control', 2.5, 1],
      ['Control', 3.4, 0],
      ['Control', 4.8, 1],
      ['Control', 6.1, 0],
      ['Control', 7.9, 1],
      ['Treatment', 0.8, 1],
      ['Treatment', 1.6, 0],
      ['Treatment', 2.9, 1],
      ['Treatment', 4.2, 1],
      ['Treatment', 5.5, 0],
      ['Treatment', 6.7, 1],
      ['Treatment', 8.4, 0]
    ];
    refs.loadExampleBtn?.addEventListener('click', () => {
      if(state.hot){
        state.hot.loadData(example);
      }
      logDebug('example loaded', { rows: example.length, firstRow: example[0] });
      if(state.scheduleDraw){
        state.scheduleDraw();
      }
    });
    refs.importBtn?.addEventListener('click', () => {
      if(refs.fileInput){
        refs.fileInput.value = '';
        refs.fileInput.click();
      }
    });
    refs.fileInput?.addEventListener('change', () => {
      if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
        console.warn('Survival import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      Shared.tableImport.openFile(refs.fileInput, {
        hot: state.hot,
        minCols: SURVIVAL_DEFAULT_COLS,
        minRows: DEFAULT_ROWS,
        scheduleDraw: state.scheduleDraw,
        debugLabel: 'survival',
        onProcessed: info => logDebug('import processed', info)
      });
    });
  }

  function initExportsAndFiles(){
    if(Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function'){
      Shared.exporter.mountSvgControls({
        container: '#survivalExportControls',
        svgSelector: '#survivalSvg',
        fileName: 'survival',
        contextLabel: 'survival-export'
      });
      logDebug('export controls mounted', { hasExporter: true });
    } else {
      logDebug('export controls unavailable', { hasExporter: !!Shared.exporter });
    }
    refs.saveBtn?.addEventListener('click', () => { void saveFile(); });
    refs.saveAsBtn?.addEventListener('click', () => { void saveFileAs(); });
    refs.openBtn?.addEventListener('click', () => { void openFile(); });
    refs.graphFileInput?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if(file){
        state.fileName = file.name;
        state.fileHandle = null;
        loadFromFile(file);
      }
    });
  }

  function init(){
    if(survival.ready){
      return;
    }
    if(!ensureElements()){
      console.warn('Survival component init skipped: required elements missing');
      return;
    }
    state.scheduleDraw = Shared.debounceFrame ? Shared.debounceFrame(() => drawSurvival()) : (() => drawSurvival());
    logDebug('scheduleDraw configured', { hasDebounce: typeof Shared.debounceFrame === 'function' });
    ensureWrapperStyles();
    initHot();
    initControls();
    initExampleAndImport();
    initResizers();
    initExportsAndFiles();
    survival.ready = true;
    state.scheduleDraw?.();
    logDebug('component initialized', { ready: survival.ready });
    global.scheduleDrawSurvival = () => state.scheduleDraw?.();
  }

  survival.init = init;
  survival.ensure = function ensure(){
    if(!survival.ready){
      init();
    }
  };
  survival.draw = drawSurvival;
})(window);
