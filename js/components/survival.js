(function(global){
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const survival = Components.survival = Components.survival || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const fileIO = Shared.fileIO = Shared.fileIO || {};

  survival.__installed = true;
  survival.ready = false;

  const DEFAULT_ROWS = 100;
  const SURVIVAL_DEFAULT_COLS = 7;
  const BASE_COLUMN_COUNT = 4; // group, time, event, entry time
  const SURVIVAL_COL_HEADERS = [
    'Group',
    'Time',
    'Event (1=event,0=censored)',
    'Entry Time (optional)',
    'Covariate 1',
    'Covariate 2',
    'Covariate 3'
  ];
  const DEFAULT_COLORS = global.DEFAULT_SCATTER_COLORS || [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
    '#ffff33', '#a65628', '#f781bf', '#999999'
  ];
  global.DEFAULT_SCATTER_COLORS = DEFAULT_COLORS;

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('survival')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'survival', debugLabel: 'survival-viewport-fallback', ...options });
        return;
      }
      logDebug('ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  logDebug('graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const state = {
    hot: null,
    scheduleDraw: null,
    labelColors: {},
    groupOrder: [],
    minSvgWidth: 0,
    layout: null,
    fileHandle: null,
    fileName: 'survival.graph',
    lastSummary: null,
    lastStats: null,
    covariateSettings: {},
    covariateColumns: []
  };

  const refs = {};

  let parseDebugCounter = 0;

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
    refs.statsHazardRatios = $('#survivalStatsHazardRatios');
    refs.statsCox = $('#survivalStatsCox');
    refs.labelColorsDiv = $('#survivalLabelColors');
    refs.labelColorsFieldset = $('#survivalLabelColorsFieldset');
    refs.showCI = $('#survivalShowCI');
    refs.showCensor = $('#survivalShowCensor');
    refs.showHazardRatios = $('#survivalShowHazardRatios');
    refs.fitCoxModel = $('#survivalFitCox');
    refs.covariateControls = $('#survivalCovariateControls');
    refs.covariateHint = $('#survivalCovariateHint');
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

  const markFontEditable = (node, role, key) => {
    if(!node){ return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'survival', role, key });
    } else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'survival';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    if(role && role.includes('Tick')){ return; }
    logDebug('font mark applied', payload);
  };

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
    logDebug('initHot table schema', { firstRowIsHeader: false, columns: SURVIVAL_DEFAULT_COLS, headers: SURVIVAL_COL_HEADERS });
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
        colHeaders: SURVIVAL_COL_HEADERS.slice(),
        afterChange(changes, source){
          if(changes){
            logDebug('table afterChange', { count: changes.length, source });
          }
          if(source !== 'loadData'){
            refreshCovariateControls();
          }
        }
      }
    });
    logDebug('Handsontable initialized', { hasHot: !!state.hot });
    refreshCovariateControls();
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

  function refreshCovariateControls(){
    if(!refs.covariateControls){
      return;
    }
    const columns = Array.isArray(state.covariateColumns) ? state.covariateColumns : [];
    const availableIndices = columns.map(col => col.index);
    Object.keys(state.covariateSettings).forEach(key => {
      if(!availableIndices.includes(Number(key))){
        delete state.covariateSettings[key];
      }
    });
    refs.covariateControls.innerHTML = '';
    if(!columns.length){
      if(refs.covariateHint){
        refs.covariateHint.style.display = '';
      }
      logDebug('covariate controls hidden - no extra columns');
      return;
    }
    if(refs.covariateHint){
      refs.covariateHint.style.display = 'none';
    }
    columns.forEach((col, index) => {
      const key = String(col.index);
      if(!state.covariateSettings[key]){
        state.covariateSettings[key] = { enabled: false, type: 'baseline' };
      }
      const settings = state.covariateSettings[key];
      const row = document.createElement('div');
      row.className = 'survival-covariate-option';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.flexWrap = 'wrap';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `survivalCovariateToggle-${col.index}`;
      checkbox.dataset.columnIndex = key;
      checkbox.checked = !!settings.enabled;

      const label = document.createElement('label');
      label.setAttribute('for', checkbox.id);
      label.textContent = col.header;
      label.style.fontWeight = '500';
      label.style.minWidth = '140px';

      const select = document.createElement('select');
      select.dataset.columnIndex = key;
      select.style.minWidth = '140px';
      const optionBaseline = document.createElement('option');
      optionBaseline.value = 'baseline';
      optionBaseline.textContent = 'Baseline';
      const optionTime = document.createElement('option');
      optionTime.value = 'time';
      optionTime.textContent = 'Time-dependent';
      select.appendChild(optionBaseline);
      select.appendChild(optionTime);
      select.value = settings.type === 'time' ? 'time' : 'baseline';

      checkbox.addEventListener('change', ev => {
        const idx = ev.target.dataset.columnIndex;
        state.covariateSettings[idx] = state.covariateSettings[idx] || { type: select.value };
        state.covariateSettings[idx].enabled = ev.target.checked;
        logDebug('covariate toggle changed', { columnIndex: Number(idx), enabled: ev.target.checked });
        if(state.scheduleDraw){
          state.scheduleDraw();
        }
      });

      select.addEventListener('change', ev => {
        const idx = ev.target.dataset.columnIndex;
        state.covariateSettings[idx] = state.covariateSettings[idx] || { enabled: checkbox.checked };
        state.covariateSettings[idx].type = ev.target.value === 'time' ? 'time' : 'baseline';
        logDebug('covariate type changed', { columnIndex: Number(idx), type: state.covariateSettings[idx].type });
        if(state.scheduleDraw){
          state.scheduleDraw();
        }
      });

      row.appendChild(checkbox);
      row.appendChild(label);
      row.appendChild(select);
      refs.covariateControls.appendChild(row);
    });
    logDebug('covariate controls refreshed', {
      available: columns.map(col => ({ index: col.index, header: col.header })),
      enabled: Object.keys(state.covariateSettings).filter(key => state.covariateSettings[key]?.enabled)
    });
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

  function addDiagonal(matrix, epsilon){
    return matrix.map((row, rowIndex) => row.map((value, colIndex) => value + (rowIndex === colIndex ? epsilon : 0)));
  }

  function tryInvertMatrix(matrix, options){
    if(!Array.isArray(matrix) || !matrix.length){
      return null;
    }
    const epsilons = Array.isArray(options?.epsilons) && options.epsilons.length ? options.epsilons : [0, 1e-8, 1e-6, 1e-4];
    for(let attempt = 0; attempt < epsilons.length; attempt += 1){
      const epsilon = epsilons[attempt];
      const adjusted = epsilon !== 0 ? addDiagonal(matrix, epsilon) : matrix.map(row => row.slice());
      const inverse = invertMatrix(adjusted);
      if(inverse){
        if(epsilon !== 0){
          inverse.__ridgeEpsilon = epsilon;
          logDebug('matrix inversion regularized', {
            context: options?.context || 'matrix',
            epsilon,
            attempt,
            iteration: options?.iteration ?? null
          });
        }
        return inverse;
      }
    }
    logDebug('matrix inversion failed after retries', {
      context: options?.context || 'matrix',
      epsilons
    });
    return null;
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
    const inverse = tryInvertMatrix(reducedMatrix, { context: 'log-rank variance' });
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
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false }, covariateColumns: [] };
    }
    const data = state.hot.getData() || [];
    const columnCount = typeof state.hot.countCols === 'function' ? state.hot.countCols() : (Array.isArray(data?.[0]) ? data[0].length : SURVIVAL_DEFAULT_COLS);
    const headersRaw = typeof state.hot.getColHeader === 'function' ? state.hot.getColHeader() : SURVIVAL_COL_HEADERS;
    const headerLookup = [];
    for(let col = 0; col < columnCount; col += 1){
      const headerValue = Array.isArray(headersRaw) ? headersRaw[col] : null;
      headerLookup[col] = headerValue != null ? String(headerValue) : (SURVIVAL_COL_HEADERS[col] || `Column ${col + 1}`);
    }
    const covariateColumns = [];
    for(let col = BASE_COLUMN_COUNT; col < columnCount; col += 1){
      covariateColumns.push({ index: col, header: headerLookup[col], key: `col${col}` });
    }
    state.covariateColumns = covariateColumns;
    if(!Array.isArray(data) || !data.length){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false }, covariateColumns, headers: headerLookup };
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
      const entryRaw = row[3];
      const groupName = typeof groupRaw === 'string' ? groupRaw.trim() : (groupRaw != null ? String(groupRaw).trim() : '');
      const time = Number.parseFloat(timeRaw);
      const eventFlag = Number(eventRaw);
      const entry = Number.parseFloat(entryRaw);
      if(!groupName || !Number.isFinite(time)){
        continue;
      }
      usedRows += 1;
      const bucket = groups.get(groupName) || { name: groupName, records: [], events: 0, censored: 0 };
      const record = {
        time,
        event: eventFlag === 1,
        entry: Number.isFinite(entry) ? entry : 0,
        extras: Array.isArray(row) ? row.slice(BASE_COLUMN_COUNT) : [],
        rowIndex: i
      };
      if(Number.isFinite(record.entry) && record.entry > record.time){
        logDebug('entry greater than event time encountered', { rowIndex: i, entry: record.entry, time: record.time });
      }
      bucket.records.push(record);
      if(record.event){ bucket.events += 1; } else { bucket.censored += 1; }
      groups.set(groupName, bucket);
      if(Number.isFinite(time)){
        maxTime = Math.max(maxTime, time);
      }
    }
    const groupNames = Array.from(groups.keys());
    if(!groupNames.length || usedRows === 0){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false }, covariateColumns, headers: headerLookup };
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
    logDebug('series collected', {
      groupCount: series.length,
      maxTime,
      logRankAvailable: !!logRank.available,
      usedRows,
      covariateColumnCount: covariateColumns.length
    });
    return { series, groupNames: ordered, maxTime, logRank, covariateColumns, headers: headerLookup };
  }

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, match => {
      switch(match){
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return match;
      }
    });
  }

  function safeExp(value){
    if(!Number.isFinite(value)){
      return 1;
    }
    const clipped = Math.max(Math.min(value, 50), -50);
    return Math.exp(clipped);
  }

  function parseCovariateValue(raw, predictor){
    let value = 0;
    let handled = false;
    if(typeof raw === 'number'){
      if(Number.isFinite(raw)){
        value = raw;
        handled = true;
      }
    } else if(typeof raw === 'boolean'){
      value = raw ? 1 : 0;
      handled = true;
    } else if(raw != null){
      const str = String(raw).trim();
      if(str.length){
        const numeric = Number.parseFloat(str);
        if(Number.isFinite(numeric)){
          value = numeric;
          handled = true;
        } else {
          const lowered = str.toLowerCase();
          if(['true', 'yes', 'y', 't', 'active', 'on'].includes(lowered)){
            value = 1;
            handled = true;
          } else if(['false', 'no', 'n', 'f', 'inactive', 'off'].includes(lowered)){
            value = 0;
            handled = true;
          } else if(predictor?.type === 'time'){
            const matches = str.match(/-?\d+(?:\.\d+)?/g);
            if(Array.isArray(matches) && matches.length){
              const lastToken = matches[matches.length - 1];
              const parsed = Number.parseFloat(lastToken);
              if(Number.isFinite(parsed)){
                value = parsed;
                handled = true;
              }
            }
          }
        }
      }
    }
    if(!handled){
      value = 0;
    }
    if(parseDebugCounter < 5){
      logDebug('covariate parsed', {
        raw,
        value,
        predictorType: predictor?.type || 'baseline',
        handled
      });
      parseDebugCounter += 1;
    }
    return value;
  }

  function normalCDF(value){
    if(!Number.isFinite(value)){
      return Number.NaN;
    }
    if(global.jStat?.normal?.cdf){
      return global.jStat.normal.cdf(value, 0, 1);
    }
    if(typeof Math.erfc === 'function'){
      return 0.5 * Math.erfc(-value / Math.SQRT2);
    }
    const absZ = Math.abs(value);
    const t = 1 / (1 + 0.2316419 * absZ);
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const approx = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absZ * absZ) * poly;
    return value >= 0 ? approx : 1 - approx;
  }

  function pValueFromZ(z){
    if(!Number.isFinite(z)){
      return null;
    }
    const absZ = Math.abs(z);
    const tail = 1 - normalCDF(absZ);
    if(!Number.isFinite(tail)){
      return null;
    }
    return 2 * tail;
  }

  function pValueFromChiSquare(statistic, df){
    if(!Number.isFinite(statistic) || !Number.isFinite(df) || df <= 0){
      return null;
    }
    if(global.jStat?.chisquare?.cdf){
      const cdf = global.jStat.chisquare.cdf(statistic, df);
      return Number.isFinite(cdf) ? 1 - cdf : null;
    }
    return null;
  }

  function createZeroMatrix(size){
    return Array.from({ length: size }, () => new Array(size).fill(0));
  }

  function getSelectedCovariates(columns){
    const selected = [];
    const list = Array.isArray(columns) ? columns : [];
    list.forEach(col => {
      const settings = state.covariateSettings[String(col.index)];
      if(settings?.enabled){
        selected.push({
          columnIndex: col.index,
          header: col.header,
          type: settings.type === 'time' ? 'time' : 'baseline'
        });
      }
    });
    logDebug('selected covariates resolved', { count: selected.length });
    return selected;
  }

  function prepareCoxData(summary){
    if(!summary || !Array.isArray(summary.series) || !summary.series.length){
      return { available: false, message: 'No series available for Cox model.' };
    }
    const series = summary.series;
    const baselineGroup = series[0]?.name || 'Group 1';
    const covariateSelections = getSelectedCovariates(summary.covariateColumns);
    const designPredictors = [];
    for(let idx = 1; idx < series.length; idx += 1){
      const group = series[idx];
      designPredictors.push({
        key: `group:${group?.name ?? idx}`,
        label: `${group?.name ?? `Group ${idx + 1}`} vs ${baselineGroup}`,
        type: 'group',
        groupName: group?.name ?? `Group ${idx + 1}`,
        groupIndex: idx
      });
    }
    covariateSelections.forEach(selection => {
      designPredictors.push({
        key: `cov:${selection.columnIndex}`,
        label: selection.header,
        type: selection.type,
        columnIndex: selection.columnIndex
      });
    });
    const predictors = designPredictors.length;
    if(predictors <= 0){
      return { available: false, message: 'Cox model requires at least one predictor.' };
    }
    const data = [];
    series.forEach((group, groupIndex) => {
      if(!group || !Array.isArray(group.records)){
        return;
      }
      group.records.forEach((rec, recordIndex) => {
        if(!Number.isFinite(rec.time)){
          return;
        }
        const covariates = designPredictors.map(predictor => {
          if(predictor.type === 'group'){
            return predictor.groupIndex === groupIndex ? 1 : 0;
          }
          const offset = predictor.columnIndex - BASE_COLUMN_COUNT;
          const raw = Array.isArray(rec.extras) ? rec.extras[offset] : undefined;
          return parseCovariateValue(raw, predictor);
        });
        data.push({
          time: rec.time,
          entry: Number.isFinite(rec.entry) ? rec.entry : 0,
          event: rec.event ? 1 : 0,
          covariates,
          group: group.name,
          rowIndex: rec.rowIndex ?? recordIndex,
          extras: rec.extras
        });
      });
    });
    if(!data.length){
      return { available: false, message: 'No valid observations to fit Cox model.' };
    }
    data.sort((a, b) => a.time - b.time);
    const eventCount = data.reduce((sum, rec) => sum + (rec.event ? 1 : 0), 0);
    if(eventCount === 0){
      return { available: false, message: 'Cox model requires at least one observed event.' };
    }
    const groupedEvents = new Map();
    data.forEach((obs, idx) => {
      if(!obs.event){
        return;
      }
      const timeKey = Number.isFinite(obs.time) ? obs.time : 0;
      if(!groupedEvents.has(timeKey)){
        groupedEvents.set(timeKey, []);
      }
      groupedEvents.get(timeKey).push(idx);
    });
    const eventsByTime = [];
    const sortedTimes = Array.from(groupedEvents.keys()).sort((a, b) => a - b);
    sortedTimes.forEach(timeValue => {
      const eventIndices = groupedEvents.get(timeValue) || [];
      const riskSet = [];
      data.forEach((candidate, candidateIndex) => {
        if(!Number.isFinite(candidate.time)){
          return;
        }
        const entryTime = Number.isFinite(candidate.entry) ? candidate.entry : 0;
        if(entryTime <= timeValue + 1e-9 && candidate.time >= timeValue - 1e-9){
          riskSet.push(candidateIndex);
        }
      });
      eventsByTime.push({
        time: timeValue,
        eventIndices,
        riskSet,
        eventCount: eventIndices.length
      });
    });
    logDebug('cox design prepared', {
      predictors,
      baselineGroup,
      totalRecords: data.length,
      events: eventCount,
      extraCovariates: covariateSelections.length,
      tieGroups: eventsByTime.length
    });
    if(data.length && parseDebugCounter < 5){
      logDebug('cox design sample row', {
        sample: Object.assign({}, data[0], { covariates: data[0].covariates.slice() })
      });
    }
    return {
      available: true,
      baselineGroup,
      predictors,
      data,
      eventCount,
      design: { predictors: designPredictors, covariateSelections },
      eventsByTime
    };
  }

  function evaluateCoxAt(beta, prepared){
    const { data, predictors, eventsByTime } = prepared;
    const gradient = new Array(predictors).fill(0);
    const fisher = Array.from({ length: predictors }, () => new Array(predictors).fill(0));
    let logLik = 0;
    if(!Array.isArray(eventsByTime) || !eventsByTime.length){
      return { gradient, fisher, logLik };
    }
    eventsByTime.forEach((group, idx) => {
      const riskSet = Array.isArray(group.riskSet) ? group.riskSet : [];
      const eventIndices = Array.isArray(group.eventIndices) ? group.eventIndices : [];
      if(!riskSet.length || !eventIndices.length){
        return;
      }
      let denom = 0;
      const weightedX = new Array(predictors).fill(0);
      const weightedXX = createZeroMatrix(predictors);
      riskSet.forEach(candidateIndex => {
        const obs = data[candidateIndex];
        if(!obs){
          return;
        }
        const xb = dotProduct(obs.covariates, beta);
        const weight = safeExp(xb);
        denom += weight;
        for(let r = 0; r < predictors; r += 1){
          const vr = obs.covariates[r] ?? 0;
          weightedX[r] += vr * weight;
          for(let c = 0; c < predictors; c += 1){
            const vc = obs.covariates[c] ?? 0;
            weightedXX[r][c] += vr * vc * weight;
          }
        }
      });
      const denomSafe = Math.max(denom, 1e-12);
      const expectedX = weightedX.map(val => val / denomSafe);
      const eventCount = group.eventCount || eventIndices.length;
      const observedSum = new Array(predictors).fill(0);
      eventIndices.forEach(eventIndex => {
        const obs = data[eventIndex];
        if(!obs){
          return;
        }
        logLik += dotProduct(obs.covariates, beta) - Math.log(denomSafe);
        for(let r = 0; r < predictors; r += 1){
          observedSum[r] += obs.covariates[r] ?? 0;
        }
      });
      for(let r = 0; r < predictors; r += 1){
        gradient[r] += observedSum[r] - eventCount * expectedX[r];
      }
      for(let r = 0; r < predictors; r += 1){
        for(let c = 0; c < predictors; c += 1){
          const expectedXX = weightedXX[r][c] / denomSafe;
          const varTerm = expectedXX - expectedX[r] * expectedX[c];
          fisher[r][c] += eventCount * varTerm;
        }
      }
      if(idx < 5){
        logDebug('cox risk set evaluated', {
          time: group.time,
          riskSize: riskSet.length,
          eventCount,
          denom: denomSafe
        });
      }
    });
    return { gradient, fisher, logLik };
  }

  function fitCoxModel(summary, options){
    const enabled = options?.enabled !== false;
    if(!enabled){
      return { available: false, message: 'Cox model fitting disabled.' };
    }
    const prepared = prepareCoxData(summary);
    if(!prepared.available){
      logDebug('cox preparation failed', { message: prepared.message });
      return { available: false, message: prepared.message };
    }
    const { predictors, baselineGroup } = prepared;
    let beta = new Array(predictors).fill(0);
    let covariance = null;
    let converged = false;
    let iterations = 0;
    for(iterations = 0; iterations < 25; iterations += 1){
      const evaluation = evaluateCoxAt(beta, prepared);
      const fisherInv = tryInvertMatrix(evaluation.fisher, { context: 'cox fisher', iteration: iterations });
      if(!fisherInv){
        logDebug('cox iteration inversion failed', { iteration: iterations });
        return { available: false, message: 'Failed to invert Fisher information matrix.' };
      }
      if(fisherInv.__ridgeEpsilon){
        logDebug('cox fisher ridge applied', { iteration: iterations, epsilon: fisherInv.__ridgeEpsilon });
      }
      const step = multiplyMatrixVector(fisherInv, evaluation.gradient);
      let maxChange = 0;
      beta = beta.map((value, idx) => {
        const limited = Math.max(Math.min(step[idx], 2), -2);
        maxChange = Math.max(maxChange, Math.abs(limited));
        return value + limited;
      });
      logDebug('cox iteration step', { iteration: iterations, maxChange });
      if(maxChange < 1e-6){
        converged = true;
        covariance = fisherInv;
        break;
      }
      covariance = fisherInv;
    }
    if(!covariance){
      const fallbackEval = evaluateCoxAt(beta, prepared);
      covariance = tryInvertMatrix(fallbackEval.fisher, { context: 'cox fisher fallback' });
      if(!covariance){
        logDebug('cox covariance fallback failed');
        return { available: false, message: 'Unable to compute covariance for Cox model.' };
      }
      if(covariance.__ridgeEpsilon){
        logDebug('cox covariance ridge applied', { epsilon: covariance.__ridgeEpsilon });
      }
    }
    const finalEval = evaluateCoxAt(beta, prepared);
    const nullEval = evaluateCoxAt(new Array(predictors).fill(0), prepared);
    const designPredictors = Array.isArray(prepared.design?.predictors) ? prepared.design.predictors : [];
    const coefficients = designPredictors.map((predictor, idx) => {
      const coef = beta[idx];
      const variance = Math.max(covariance[idx]?.[idx] ?? 0, 0);
      const se = Math.sqrt(variance);
      const hr = Math.exp(coef);
      const ciLow = se > 0 ? Math.exp(coef - 1.96 * se) : hr;
      const ciHigh = se > 0 ? Math.exp(coef + 1.96 * se) : hr;
      const z = se > 0 ? coef / se : null;
      const p = pValueFromZ(z);
      const label = predictor.label || predictor.groupName || `Predictor ${idx + 1}`;
      const entry = {
        key: predictor.key || `predictor:${idx}`,
        label,
        type: predictor.type || 'baseline',
        beta: coef,
        se,
        hazardRatio: hr,
        ciLow,
        ciHigh,
        z,
        p
      };
      if(predictor.type === 'group'){
        entry.group = predictor.groupName;
      } else if(Number.isFinite(predictor.columnIndex)){
        entry.columnIndex = predictor.columnIndex;
      }
      return entry;
    });
    const coefficientIndex = {};
    coefficients.forEach((coef, idx) => {
      coefficientIndex[coef.key] = idx;
      if(coef.type === 'group' && coef.group){
        coefficientIndex[coef.group] = idx;
      }
    });
    const likelihoodRatio = {
      statistic: 2 * (finalEval.logLik - nullEval.logLik),
      df: predictors,
      p: pValueFromChiSquare(2 * (finalEval.logLik - nullEval.logLik), predictors)
    };
    const diagnostics = {
      logLikelihood: finalEval.logLik,
      logLikelihoodNull: nullEval.logLik,
      aic: -2 * finalEval.logLik + 2 * predictors,
      bic: -2 * finalEval.logLik + predictors * Math.log(prepared.data.length),
      likelihoodRatio,
      iterations: iterations + 1,
      converged
    };
    const result = {
      available: true,
      baselineGroup,
      coefficients,
      covariance,
      coefficientIndex,
      design: prepared.design,
      diagnostics,
      converged,
      message: converged ? 'Cox model converged.' : 'Cox model reached iteration limit.'
    };
    logDebug('cox model fitted', {
      converged,
      iterations: diagnostics.iterations,
      coefficientCount: coefficients.length,
      logLik: diagnostics.logLikelihood,
      predictorLabels: coefficients.map(coef => coef.label)
    });
    return result;
  }

  function computeHazardRatios(series, coxModel, options){
    const enabled = options?.enabled !== false;
    if(!enabled){
      return { available: false, message: 'Hazard ratio table disabled.' };
    }
    if(!coxModel || !coxModel.available){
      const message = coxModel?.message || 'Hazard ratios unavailable.';
      logDebug('hazard ratios skipped', { message });
      return { available: false, message };
    }
    if(!Array.isArray(series) || series.length < 2){
      return { available: false, message: 'At least two groups required for hazard ratios.' };
    }
    const rows = [];
    const cov = coxModel.covariance;
    const indexMap = coxModel.coefficientIndex || {};
    for(let i = 0; i < series.length; i += 1){
      for(let j = i + 1; j < series.length; j += 1){
        const groupA = series[i];
        const groupB = series[j];
        const idxA = indexMap[groupA.name];
        const idxB = indexMap[groupB.name];
        const betaA = Number.isFinite(idxA) ? coxModel.coefficients[idxA]?.beta ?? 0 : 0;
        const betaB = Number.isFinite(idxB) ? coxModel.coefficients[idxB]?.beta ?? 0 : 0;
        const diff = betaB - betaA;
        const hr = Math.exp(diff);
        let ciLow = null;
        let ciHigh = null;
        let z = null;
        let p = null;
        if(Array.isArray(cov)){
          const varA = Number.isFinite(idxA) ? cov[idxA]?.[idxA] ?? 0 : 0;
          const varB = Number.isFinite(idxB) ? cov[idxB]?.[idxB] ?? 0 : 0;
          const covAB = Number.isFinite(idxA) && Number.isFinite(idxB) ? cov[idxA]?.[idxB] ?? 0 : 0;
          const variance = Math.max(varA + varB - 2 * covAB, 0);
          const se = Math.sqrt(variance);
          if(se > 0){
            ciLow = Math.exp(diff - 1.96 * se);
            ciHigh = Math.exp(diff + 1.96 * se);
            z = diff / se;
            p = pValueFromZ(z);
          } else {
            ciLow = hr;
            ciHigh = hr;
          }
        }
        rows.push({
          groupA: groupA.name,
          groupB: groupB.name,
          hazardRatio: hr,
          ciLow,
          ciHigh,
          z,
          p
        });
      }
    }
    logDebug('hazard ratios computed', { pairCount: rows.length });
    return { available: rows.length > 0, rows, baselineGroup: coxModel.baselineGroup, message: rows.length ? null : 'No comparisons available.' };
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
    if(!svg){
      logDebug('autoResizeSvgHelper skipped', { hasSvg: false });
      return;
    }
    ensureGraphViewport(svg, { padding: 18, debugLabel: 'survival-graph', component: 'survival' });
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
    refreshCovariateControls();
    const hazardRatiosEnabled = !!refs.showHazardRatios?.checked;
    const coxEnabled = !!refs.fitCoxModel?.checked;
    let coxModelSummary = { available: false, message: coxEnabled ? 'Cox model unavailable.' : 'Cox model fitting disabled.' };
    let hazardSummary = { available: false, message: hazardRatiosEnabled ? 'Hazard ratios unavailable.' : 'Hazard ratio table hidden.' };
    if(summary.series.length){
      const shouldFitCox = hazardRatiosEnabled || coxEnabled;
      if(shouldFitCox){
        coxModelSummary = fitCoxModel(summary, { enabled: shouldFitCox });
      }
      if(hazardRatiosEnabled){
        hazardSummary = computeHazardRatios(summary.series, coxModelSummary, { enabled: hazardRatiosEnabled });
      }
    }
    summary.coxModel = coxModelSummary;
    summary.hazardRatios = hazardSummary;
    summary.flags = { hazardRatiosEnabled, coxEnabled };
    state.lastSummary = summary;
    logDebug('stat toggles resolved', { hazardRatiosEnabled, coxEnabled, coxAvailable: coxModelSummary.available });
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
    if(svg.dataset){
      svg.dataset.fontScope = 'survival';
    }
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg, { scopeId: 'survival' });
      logDebug('fontControls enableForSvg invoked', { width, height });
    } else {
      logDebug('fontControls enableForSvg missing', { hasFontControls: !!fontControls });
    }
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

    let maxYLabelWidth = 0;
    for(let pass = 0; pass < 2; pass += 1){
      plotW = Math.max(20, width - margin.left - margin.right);
      plotH = Math.max(20, height - margin.top - margin.bottom);
      xScale = niceScale(xMin, xMax, xTickTarget);
      yScale = niceScale(yMin, yMax, yTickTarget);
      xTickLabels = xScale.ticks.map(value => formatNumber(value, 2));
      yTickLabels = yScale.ticks.map(value => formatNumber(value, 2));
      const yLabelWidths = yTickLabels.map(label => chartStyle.measureText ? chartStyle.measureText(label, tickFont) : label.length * fs * 0.6);
      maxYLabelWidth = yLabelWidths.length ? Math.max(...yLabelWidths) : 0;
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
      markFontEditable(text, 'xTick');
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
      markFontEditable(text, 'yTick');
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
    markFontEditable(xTitle, 'xTitle', 'xTitle');

    const yTitleX = margin.left - (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
    logDebug('y-axis title placement', { yTitleX, maxYLabelWidth }); // Debug: axis label alignment
    const yTitle = add('text', {
      x: yTitleX,
      y: margin.top + plotH / 2,
      transform: `rotate(-90 ${yTitleX} ${margin.top + plotH / 2})`,
      'font-size': fs,
      'text-anchor': 'middle',
      fill: chartStyle.TEXT_COLOR || '#000'
    });
    yTitle.textContent = yLabelText;
    markFontEditable(yTitle, 'yTitle', 'yTitle');

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
        markFontEditable(label, 'legend', `legend-${index}`);
        row.appendChild(label);
        legendGroup.appendChild(row);
      });
      svg.appendChild(legendGroup);
    }

    updateStats({ ...summary, series: groupsForDraw });
    autoResizeSvgHelper(svg);
    state.layout?.syncPanels?.({ skipSchedule: true });
    logDebug('draw complete', { debugStamp });
  }

  function updateStats(summary){
    if(!refs.statsSummary || !refs.statsLogRank){
      return;
    }
    if(!summary.series.length){
      refs.statsSummary.textContent = 'Enter at least one group with time and event values to compute statistics.';
      refs.statsLogRank.textContent = '';
      if(refs.statsHazardRatios) refs.statsHazardRatios.textContent = '';
      if(refs.statsCox) refs.statsCox.textContent = '';
      state.lastStats = null;
      return;
    }
    const rows = summary.series.map(group => {
      const medianLabel = group.km?.median != null ? formatNumber(group.km.median, 2) : 'Not reached';
      const safeName = escapeHtml(group.name);
      return `<tr><td>${safeName}</td><td style="text-align:right;">${group.total}</td><td style="text-align:right;">${group.events}</td><td style="text-align:right;">${group.censored}</td><td style="text-align:right;">${medianLabel}</td></tr>`;
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
    if(refs.statsHazardRatios){
      if(summary.flags?.hazardRatiosEnabled){
        if(summary.hazardRatios?.available && Array.isArray(summary.hazardRatios.rows) && summary.hazardRatios.rows.length){
          const hazardRows = summary.hazardRatios.rows.map(row => {
            const comparison = `${escapeHtml(row.groupB)} vs ${escapeHtml(row.groupA)}`;
            const hr = formatNumber(row.hazardRatio, 3);
            const ci = row.ciLow != null && row.ciHigh != null ? `${formatNumber(row.ciLow, 3)} – ${formatNumber(row.ciHigh, 3)}` : 'n/a';
            const zLabel = row.z != null ? formatNumber(row.z, 3) : 'n/a';
            const pLabel = formatP(row.p);
            return `<tr><td>${comparison}</td><td style="text-align:right;">${hr}</td><td style="text-align:right;">${ci}</td><td style="text-align:right;">${zLabel}</td><td style="text-align:right;">${pLabel}</td></tr>`;
          }).join('');
          refs.statsHazardRatios.innerHTML = `<div style="font-weight:bold; margin-bottom:4px;">Hazard Ratios</div>
            <table class="stats-table" style="border-collapse:collapse; width:100%;">
              <thead>
                <tr>
                  <th style="border:1px solid #ccc; padding:4px; text-align:left;">Comparison</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:right;">Hazard Ratio</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:right;">95% CI</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:right;">z</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:right;">p</th>
                </tr>
              </thead>
              <tbody>${hazardRows}</tbody>
            </table>`;
          logDebug('hazard ratio stats rendered', { rowCount: summary.hazardRatios.rows.length });
        } else {
          refs.statsHazardRatios.textContent = summary.hazardRatios?.message || 'Hazard ratios unavailable.';
        }
      } else {
        refs.statsHazardRatios.textContent = 'Enable "Show Hazard Ratios" above to compute pairwise comparisons.';
      }
    }
    if(refs.statsCox){
      if(summary.flags?.coxEnabled){
        if(summary.coxModel?.available){
          const baseline = escapeHtml(summary.coxModel.baselineGroup || 'Reference');
          const coefRows = (summary.coxModel.coefficients || []).map(coef => {
            const safeLabel = escapeHtml(coef.label || coef.group || '');
            const typeLabel = coef.type === 'group' ? 'Group' : (coef.type === 'time' ? 'Time-dependent' : 'Baseline');
            const betaLabel = formatNumber(coef.beta, 3);
            const hr = formatNumber(coef.hazardRatio, 3);
            const ci = coef.ciLow != null && coef.ciHigh != null ? `${formatNumber(coef.ciLow, 3)} – ${formatNumber(coef.ciHigh, 3)}` : 'n/a';
            const zLabel = coef.z != null ? formatNumber(coef.z, 3) : 'n/a';
            const pLabel = formatP(coef.p);
            return `<tr><td>${safeLabel}</td><td>${escapeHtml(typeLabel)}</td><td style="text-align:right;">${betaLabel}</td><td style="text-align:right;">${hr}</td><td style="text-align:right;">${ci}</td><td style="text-align:right;">${zLabel}</td><td style="text-align:right;">${pLabel}</td></tr>`;
          }).join('');
          const diag = summary.coxModel.diagnostics || {};
          const lr = diag.likelihoodRatio || {};
          const diagLines = [
            `Log-likelihood: ${formatNumber(diag.logLikelihood, 3)}`,
            `Null log-likelihood: ${formatNumber(diag.logLikelihoodNull, 3)}`,
            `Likelihood ratio χ²(${lr.df ?? 'n/a'}) = ${formatNumber(lr.statistic, 3)}, p = ${formatP(lr.p)}`,
            `AIC: ${formatNumber(diag.aic, 3)}`,
            `BIC: ${formatNumber(diag.bic, 3)}`,
            `Iterations: ${diag.iterations ?? 'n/a'}`,
            `Converged: ${diag.converged ? 'Yes' : 'No'}`
          ];
          refs.statsCox.innerHTML = `<div style="font-weight:bold; margin-bottom:4px;">Cox Model (baseline: ${baseline})</div>
            <table class="stats-table" style="border-collapse:collapse; width:100%; margin-bottom:6px;">
              <thead>
                <tr>
                  <th style="border:1px solid #ccc; padding:4px; text-align:left;">Predictor</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:left;">Type</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:right;">β</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:right;">Hazard Ratio</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:right;">95% CI</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:right;">z</th>
                  <th style="border:1px solid #ccc; padding:4px; text-align:right;">p</th>
                </tr>
              </thead>
              <tbody>${coefRows}</tbody>
            </table>
            <div>${diagLines.map(line => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
          logDebug('cox stats rendered', {
            rowCount: summary.coxModel.coefficients?.length || 0,
            baseline: summary.coxModel.baselineGroup
          });
        } else {
          refs.statsCox.textContent = summary.coxModel?.message || 'Cox model unavailable.';
        }
      } else {
        refs.statsCox.textContent = 'Enable "Fit Cox Model" above to review coefficient estimates.';
      }
    }
    const statsPayload = {
      groups: summary.series.map(group => ({
        name: group.name,
        total: group.total,
        events: group.events,
        censored: group.censored,
        median: group.km?.median ?? null,
        color: group.color || null
      })),
      logRank: summary.logRank,
      hazardRatios: summary.hazardRatios,
      coxModel: summary.coxModel,
      flags: summary.flags
    };
    state.lastStats = statsPayload;
    logDebug('statistics updated', {
      groupCount: summary.series.length,
      logRank: summary.logRank,
      hazardRatiosAvailable: summary.hazardRatios?.available,
      coxAvailable: summary.coxModel?.available
    });
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
        showHazardRatios: !!refs.showHazardRatios?.checked,
        fitCoxModel: !!refs.fitCoxModel?.checked,
        showGrid: !!refs.showGrid?.checked,
        showFrame: !!refs.showFrame?.checked,
        timeMax: refs.timeMax?.value || '',
        yMin: refs.yMin?.value || '',
        yMax: refs.yMax?.value || '',
        fontSize: refs.fontSize?.value || '13',
        xLabel: refs.xLabel?.value || '',
        yLabel: refs.yLabel?.value || '',
        covariateSettings: state.covariateSettings
      },
      stats: state.lastStats || null
    };
    console.debug('Debug: survival.getPayload captured state', {
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      showCI: payload.config.showCI,
      hazardRatios: payload.config.showHazardRatios,
      fitCoxModel: payload.config.fitCoxModel,
      hasStats: !!payload.stats,
      covariateSettingKeys: Object.keys(state.covariateSettings || {})
    });
    return payload;
  }
  survival.getPayload = getGraphPayload;

  function applyConfig(config){
    if(!config){
      return;
    }
    state.labelColors = Object.assign({}, config.labelColors || {});
    if(config.covariateSettings && typeof config.covariateSettings === 'object'){
      state.covariateSettings = Object.assign({}, config.covariateSettings);
      logDebug('covariate settings restored', { keys: Object.keys(state.covariateSettings) });
    } else {
      if(Object.keys(state.covariateSettings || {}).length){
        logDebug('covariate settings reset due to missing config (legacy payload)');
      }
      state.covariateSettings = {};
    }
    if(refs.showCI) refs.showCI.checked = !!config.showCI;
    if(refs.showCensor) refs.showCensor.checked = !!config.showCensor;
    if(refs.showHazardRatios) refs.showHazardRatios.checked = config.showHazardRatios !== false;
    if(refs.fitCoxModel) refs.fitCoxModel.checked = config.fitCoxModel !== false;
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
    refreshCovariateControls();
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
        state.lastStats = payload.stats || null;
        logDebug('stats restored from file', { hasStats: !!payload.stats });
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
    [refs.showCI, refs.showCensor, refs.showGrid, refs.showHazardRatios, refs.fitCoxModel].forEach(control => {
      control?.addEventListener('change', () => {
        console.debug('Debug: survival control toggle', { id: control.id, checked: control.checked });
        logDebug('control toggled', { id: control.id, checked: control.checked });
        schedule();
      });
    });
    refs.showFrame?.addEventListener('change', () => {
      console.debug('Debug: survival control toggle', { id: refs.showFrame.id, checked: refs.showFrame.checked });
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
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'survival',
      selectors: {
        tablePanel: '#survivalTablePanel',
        graphPanel: '#survivalGraphPanel',
        panelResizer: '#survivalPanelResizer',
        hotWrapper: '#survivalHotWrapper',
        hotContainer: '#survivalHot',
        svgBox: () => refs.graphPanel?.querySelector('.svgbox'),
        resizeTarget: () => refs.graphPanel?.querySelector('.svgbox')
      },
      scheduleDraw: state.scheduleDraw,
      onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        logDebug('layout onMinSvgWidth', { value: state.minSvgWidth });
      }
    });
    if(state.layout?.elements?.svgBox){
      refs.svgBox = state.layout.elements.svgBox;
    }
    initHot();
    initControls();
    initExampleAndImport();
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    state.layout?.syncPanels?.();
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
