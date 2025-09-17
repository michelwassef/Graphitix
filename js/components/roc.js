(function(global){
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const roc = Components.roc = Components.roc || {};
  roc.__installed = true;
  roc.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: roc component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: roc component awaiting Shared.tableImport helpers'); // Debug: table import helper check
  }

  const DEFAULT_ROWS = 100;
  const ROC_DEFAULT_COLS = 3;
  const DEFAULT_SCATTER_COLORS = global.DEFAULT_SCATTER_COLORS || ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
  global.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;

  const state = {
    hot: null,
    scheduleDraw: null,
    labelColors: {},
    diffMethod: 'delong',
    compareSel: null,
    compareLabel: null,
    compareResult: null,
    minSvgWidth: 0,
    tableObserver: null,
    fileHandle: null,
    fileName: 'roc.graph'
  };

  const refs = {};

  function $(selector){
    return document.querySelector(selector);
  }

  function ensureElements(){
    refs.tablePanel = document.getElementById('rocTablePanel');
    refs.graphPanel = document.getElementById('rocGraphPanel');
    refs.panelResizer = document.getElementById('rocPanelResizer');
    refs.svgBox = refs.graphPanel?.querySelector('.svgbox');
    refs.configPanel = refs.graphPanel?.querySelector('.config-options');
    refs.hotContainer = document.getElementById('rocHot');
    refs.hotWrapper = document.getElementById('rocHotWrapper');
    refs.plotDiv = document.getElementById('rocPlot');
    refs.statsResults = document.getElementById('rocStatsResults');
    refs.statsControls = document.getElementById('rocStatsControls');
    refs.borderWidth = document.getElementById('rocBorderWidth');
    refs.showGrid = document.getElementById('rocShowGrid');
    refs.fontSize = document.getElementById('rocFontSize');
    refs.fontSizeVal = document.getElementById('rocFontSizeVal');
    refs.graphType = document.getElementById('rocGraphType');
    refs.labelColorsDiv = document.getElementById('rocLabelColors');
    refs.labelColorsFieldset = document.getElementById('rocLabelColorsFieldset');
    refs.loadExampleBtn = document.getElementById('rocLoadExample');
    refs.importBtn = document.getElementById('rocImport');
    refs.fileInput = document.getElementById('rocFile');
    refs.pngBtn = document.getElementById('rocPNG');
    refs.svgBtn = document.getElementById('rocSVG');
    refs.openBtn = document.getElementById('openRoc');
    refs.saveBtn = document.getElementById('saveRoc');
    refs.saveAsBtn = document.getElementById('saveAsRoc');
    refs.graphFileInput = document.getElementById('rocGraphFile');
    return !!(refs.tablePanel && refs.graphPanel && refs.hotContainer && refs.plotDiv);
  }

  function ensureWrapperStyles(){
    if(global.Shared && Shared.ensureHotWrapperStyles && refs.hotWrapper){
      Shared.ensureHotWrapperStyles(refs.hotWrapper);
      console.debug('Debug: ROC hot wrapper styles applied', refs.hotWrapper.style.cssText);
    }
  }

  function syncTableAndGraphWidths(){
    Shared.syncPanelWidths(refs.tablePanel, refs.graphPanel, refs.configPanel, state.scheduleDraw, {
      svgBox: refs.svgBox,
      minSvgWidth: state.minSvgWidth,
      debugLabel: 'roc'
    });
  }

  function initResizers(){
    if(refs.tablePanel){
      state.tableObserver = new ResizeObserver(()=>syncTableAndGraphWidths());
      state.tableObserver.observe(refs.tablePanel);
      syncTableAndGraphWidths();
    }

    const container = refs.plotDiv?.closest('.svgbox') || refs.plotDiv?.parentElement;
    if(container && Shared && typeof Shared.attachResizableBox === 'function'){
      Shared.attachResizableBox(container, {
        onResize: () => {
          console.debug('Debug: ROC box resized');
          syncTableAndGraphWidths();
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
        state.minSvgWidth = (refs.svgBox?.getBoundingClientRect().width || 0) * 0.5;
        const minGraph = configWidth + gap + state.minSvgWidth;
        const total = startTable + startGraph;
        console.debug('Debug: ROC panel drag start', {startTable, startGraph, configWidth, gap, minSvgWidth: state.minSvgWidth});
        function onMove(ev){
          const dx = ev.clientX - startX;
          const newTable = Math.max(150, Math.min(total - minGraph, startTable + dx));
          const newGraph = total - newTable;
          refs.tablePanel.style.flex = `0 0 ${newTable}px`;
          refs.graphPanel.style.flex = `0 0 ${newGraph}px`;
          syncTableAndGraphWidths();
          console.debug('Debug: ROC panel drag move', {dx, newTable, newGraph});
        }
        function onUp(){
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          console.debug('Debug: ROC panel drag end');
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    }
  }

  function initHot(){
    if(!refs.hotContainer || !global.Handsontable){
      console.warn('ROC hot container or Handsontable missing');
      return;
    }
    state.hot = new global.Handsontable(refs.hotContainer, {
      data: global.Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS, ROC_DEFAULT_COLS),
      rowHeaders(index){
        const label = index === 0 ? '' : index;
        if(global.DEBUG_ROC){
          console.debug('Debug: ROC row header', {index, label});
        }
        return label;
      },
      colHeaders: true,
      minRows: DEFAULT_ROWS,
      minCols: ROC_DEFAULT_COLS,
      stretchH: 'all',
      contextMenu: true,
      cells(row, col){
        const props = {};
        if(row === 0){
          props.renderer = function(instance, td){
            global.Handsontable.renderers.TextRenderer.apply(this, arguments);
            td.style.background = '#e9ecef';
            td.style.fontWeight = '600';
            td.title = 'Header (first row)';
          };
        }
        return props;
      },
      licenseKey: 'non-commercial-and-evaluation',
      afterChange(changes, source){
        if(changes){
          console.debug('Debug: ROC table change', {count: changes.length, source});
          state.scheduleDraw?.();
        }
      },
      afterCreateRow(){ state.scheduleDraw?.(); },
      afterCreateCol(){ state.scheduleDraw?.(); },
      afterRemoveRow(){ state.scheduleDraw?.(); },
      afterRemoveCol(){ state.scheduleDraw?.(); },
      afterUndo(){ state.scheduleDraw?.(); },
      afterRedo(){ state.scheduleDraw?.(); }
    });
  }

  function updateFontSizeLabel(){
    if(refs.fontSizeVal && refs.fontSize){
      refs.fontSizeVal.textContent = refs.fontSize.value;
    }
  }

  function renderStatsControls(){
    if(!refs.statsControls){
      return;
    }
    refs.statsControls.innerHTML = '';

    const diffLabel = document.createElement('label');
    diffLabel.textContent = 'Diff method:';
    refs.statsControls.appendChild(diffLabel);

    const select = document.createElement('select');
    const graphType = refs.graphType?.value || 'roc';
    const options = graphType === 'roc'
      ? [['delong', 'DeLong'], ['bootstrap', 'Bootstrap']]
      : [['bootstrap', 'Bootstrap'], ['permutation', 'Permutation']];
    if(!options.some(opt => opt[0] === state.diffMethod)){
      state.diffMethod = options[0][0];
    }
    options.forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if(value === state.diffMethod){
        opt.selected = true;
      }
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      state.diffMethod = select.value;
      console.debug('Debug: ROC diff method change', state.diffMethod);
      state.scheduleDraw?.();
    });
    refs.statsControls.appendChild(select);

    state.compareLabel = document.createElement('label');
    state.compareLabel.textContent = 'Compare:';
    refs.statsControls.appendChild(state.compareLabel);

    state.compareSel = document.createElement('select');
    state.compareSel.addEventListener('change', () => {
      console.debug('Debug: ROC compare pair change', state.compareSel.value);
      state.scheduleDraw?.();
    });
    refs.statsControls.appendChild(state.compareSel);

    state.compareResult = document.createElement('span');
    state.compareResult.style.marginLeft = '4px';
    refs.statsControls.appendChild(state.compareResult);

    console.debug('Debug: ROC stats controls rendered', {graphType, diff: state.diffMethod});
  }

  function updateLabelColorPickers(labels){
    if(!refs.labelColorsDiv || !refs.labelColorsFieldset){
      return;
    }
    refs.labelColorsDiv.innerHTML = '';
    Object.keys(state.labelColors).forEach(key => {
      if(!labels.includes(key)){
        delete state.labelColors[key];
      }
    });
    labels.forEach((label, index) => {
      if(!state.labelColors[label]){
        state.labelColors[label] = DEFAULT_SCATTER_COLORS[index % DEFAULT_SCATTER_COLORS.length];
      }
      const input = document.createElement('input');
      input.type = 'color';
      input.value = state.labelColors[label];
      if(typeof global.attachColorPickerNear === 'function'){
        global.attachColorPickerNear(input);
      }
      input.addEventListener('input', event => {
        state.labelColors[label] = event.target.value;
        console.debug('Debug: ROC label color update', {label, color: event.target.value});
        state.scheduleDraw?.();
      });
      const wrapper = document.createElement('label');
      wrapper.textContent = `${label} `;
      wrapper.appendChild(input);
      refs.labelColorsDiv.appendChild(wrapper);
    });
    refs.labelColorsFieldset.style.display = labels.length ? '' : 'none';
    console.debug('Debug: ROC color pickers refreshed', {labels});
  }

  function initExampleAndImport(){
    const example = [
      ['Label','Model1','Model2','Model3'],
      [1,0.98,0.9,0.88],
      [0,0.95,0.4,0.3],
      [1,0.93,0.85,0.76],
      [0,0.9,0.35,0.25],
      [1,0.88,0.8,0.68],
      [0,0.85,0.3,0.2],
      [1,0.82,0.75,0.6],
      [0,0.8,0.25,0.15],
      [1,0.78,0.7,0.55],
      [0,0.75,0.2,0.1],
      [1,0.72,0.65,0.5],
      [0,0.7,0.15,0.08],
      [1,0.68,0.6,0.45],
      [0,0.65,0.1,0.06],
      [1,0.62,0.55,0.4],
      [0,0.6,0.08,0.04],
      [1,0.58,0.5,0.35],
      [0,0.55,0.06,0.03],
      [1,0.52,0.45,0.3],
      [0,0.5,0.04,0.02],
      [1,0.48,0.4,0.25],
      [0,0.45,0.02,0.01]
    ];

    refs.loadExampleBtn?.addEventListener('click', () => {
      if(state.hot){
        state.hot.loadData(example);
        console.debug('Debug: ROC example loaded');
        state.scheduleDraw?.();
      }
    });

    refs.importBtn?.addEventListener('click', () => {
      if(refs.fileInput){
        refs.fileInput.value = '';
        refs.fileInput.click();
      }
    });

    refs.fileInput?.addEventListener('change', async () => {
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('roc import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const fileName = refs.fileInput?.files?.[0]?.name || '';
      console.debug('Debug: ROC import start', {fileName}); // Debug: import start trace
      try{
        const result = await tableImport.openFile(refs.fileInput, {
          hot: state.hot,
          minCols: ROC_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: state.scheduleDraw,
          debugLabel: 'roc',
          onProcessed: info => {
            console.debug('Debug: ROC tableImport processed', info || {}); // Debug: processed callback
          }
        });
        console.debug('Debug: ROC import finished', {rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
      }catch(err){
        console.error('roc import failed', err);
      }
    });

    refs.hotContainer?.addEventListener('paste', async event => {
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.handlePaste !== 'function'){
        console.warn('roc paste skipped: Shared.tableImport.handlePaste unavailable');
        return;
      }
      try{
        const result = await tableImport.handlePaste(event, state.hot, {
          minCols: ROC_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: state.scheduleDraw,
          debugLabel: 'roc',
          onProcessed: info => {
            console.debug('Debug: ROC paste processed', info || {}); // Debug: paste processed callback
          }
        });
        console.debug('Debug: ROC paste finished', {rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: paste finish trace
      }catch(err){
        console.error('roc paste failed', err);
      }
    }, true);
  }

  function computeCurveMetric(pairs, graphType){
    const arr = pairs.slice().sort((a, b) => b.score - a.score);
    let tp = 0;
    let fp = 0;
    let auc = 0;
    let ap = 0;
    const P = arr.filter(p => p.label === 1).length;
    const N = arr.length - P;
    let prevRec = 0;
    let prevPrec = 1;
    let prevFpr = 0;
    let prevTpr = 0;
    for(const pair of arr){
      if(pair.label === 1){
        tp += 1;
      }else{
        fp += 1;
      }
      if(graphType === 'roc'){
        const fpr = fp / Math.max(1, N);
        const tpr = tp / Math.max(1, P);
        auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
        prevFpr = fpr;
        prevTpr = tpr;
      }else{
        const rec = tp / Math.max(1, P);
        const prec = tp / Math.max(1, tp + fp);
        auc += (rec - prevRec) * (prec + prevPrec) / 2;
        ap += (rec - prevRec) * prec;
        prevRec = rec;
        prevPrec = prec;
      }
    }
    return graphType === 'roc' ? auc : ap;
  }

  function bootstrapCurveTest(pairs, baseline, graphType, iters = 200){
    let count = 0;
    const n = pairs.length;
    for(let b = 0; b < iters; b += 1){
      const sample = Array.from({length: n}, () => pairs[Math.floor(Math.random() * n)]);
      const metric = computeCurveMetric(sample, graphType);
      if(metric <= baseline){
        count += 1;
      }
    }
    const p = (count + 1) / (iters + 1);
    if(global.DEBUG_ROC){
      console.debug('Debug: ROC bootstrap test', {baseline, graphType, iters, p});
    }
    return p;
  }

  function bootstrapCurveDiff(pairs1, pairs2, graphType, iters = 200){
    const n = pairs1.length;
    const diffs = [];
    const baseDiff = computeCurveMetric(pairs1, graphType) - computeCurveMetric(pairs2, graphType);
    for(let b = 0; b < iters; b += 1){
      const sample1 = [];
      const sample2 = [];
      for(let i = 0; i < n; i += 1){
        const idx = Math.floor(Math.random() * n);
        sample1.push(pairs1[idx]);
        sample2.push(pairs2[idx]);
      }
      diffs.push(computeCurveMetric(sample1, graphType) - computeCurveMetric(sample2, graphType));
    }
    const count = diffs.filter(diff => Math.abs(diff) >= Math.abs(baseDiff)).length;
    diffs.sort((a, b) => a - b);
    const lower = diffs[Math.floor(0.025 * iters)] ?? diffs[0];
    const upper = diffs[Math.floor(0.975 * iters)] ?? diffs[diffs.length - 1];
    const p = (count + 1) / (iters + 1);
    if(global.DEBUG_ROC){
      console.debug('Debug: ROC bootstrap diff', {graphType, iters, p, ci: [lower, upper]});
    }
    return {p, ci: [lower, upper], diff: baseDiff};
  }

  function permutationCurveDiff(pairs1, pairs2, graphType, iters = 200){
    const n = pairs1.length;
    const baseDiff = computeCurveMetric(pairs1, graphType) - computeCurveMetric(pairs2, graphType);
    let count = 0;
    for(let b = 0; b < iters; b += 1){
      const sample1 = [];
      const sample2 = [];
      for(let i = 0; i < n; i += 1){
        if(Math.random() < 0.5){
          sample1.push(pairs1[i]);
          sample2.push(pairs2[i]);
        }else{
          sample1.push({label: pairs1[i].label, score: pairs2[i].score});
          sample2.push({label: pairs2[i].label, score: pairs1[i].score});
        }
      }
      const diff = computeCurveMetric(sample1, graphType) - computeCurveMetric(sample2, graphType);
      if(Math.abs(diff) >= Math.abs(baseDiff)){
        count += 1;
      }
    }
    const p = (count + 1) / (iters + 1);
    if(global.DEBUG_ROC){
      console.debug('Debug: ROC permutation diff', {graphType, iters, p});
    }
    return {p, diff: baseDiff};
  }

  function delongCurveDiff(pairs1, pairs2){
    const pos1 = pairs1.filter(p => p.label === 1).map(p => p.score);
    const neg1 = pairs1.filter(p => p.label === 0).map(p => p.score);
    const pos2 = pairs2.filter(p => p.label === 1).map(p => p.score);
    const neg2 = pairs2.filter(p => p.label === 0).map(p => p.score);
    const m = pos1.length;
    const n = neg1.length;

    function calcV(pos, neg){
      const V10 = [];
      const V01 = [];
      for(const ps of pos){
        let lt = 0;
        let eq = 0;
        for(const ns of neg){
          if(ps > ns) lt += 1;
          else if(ps === ns) eq += 1;
        }
        V10.push((lt + 0.5 * eq) / neg.length);
      }
      for(const ns of neg){
        let gt = 0;
        let eq = 0;
        for(const ps of pos){
          if(ps > ns) gt += 1;
          else if(ps === ns) eq += 1;
        }
        V01.push((gt + 0.5 * eq) / pos.length);
      }
      const auc = V10.reduce((sum, val) => sum + val, 0) / pos.length;
      return {V10, V01, auc};
    }

    const a1 = calcV(pos1, neg1);
    const a2 = calcV(pos2, neg2);

    function cov(a, b){
      const meanA = global.jStat.mean(a);
      const meanB = global.jStat.mean(b);
      let sum = 0;
      for(let i = 0; i < a.length; i += 1){
        sum += (a[i] - meanA) * (b[i] - meanB);
      }
      return sum / (a.length - 1);
    }

    const s10 = [
      [cov(a1.V10, a1.V10), cov(a1.V10, a2.V10)],
      [cov(a2.V10, a1.V10), cov(a2.V10, a2.V10)]
    ];
    const s01 = [
      [cov(a1.V01, a1.V01), cov(a1.V01, a2.V01)],
      [cov(a2.V01, a1.V01), cov(a2.V01, a2.V01)]
    ];
    const var1 = s10[0][0] / m + s01[0][0] / n;
    const var2 = s10[1][1] / m + s01[1][1] / n;
    const covar = s10[0][1] / m + s01[0][1] / n;
    const diff = a1.auc - a2.auc;
    const varDiff = var1 + var2 - 2 * covar;
    const sd = Math.sqrt(varDiff);
    const z = diff / sd;
    const p = 2 * (1 - global.jStat.normal.cdf(Math.abs(z), 0, 1));
    const ci = [diff - 1.96 * sd, diff + 1.96 * sd];
    if(global.DEBUG_ROC){
      console.debug('Debug: ROC delong diff', {diff, p, ci});
    }
    return {p, diff, ci};
  }

  function formatPValue(value){
    if(typeof global.formatP === 'function'){
      return global.formatP(value);
    }
    if(value === undefined || value === null || Number.isNaN(value)){
      return 'n/a';
    }
    if(!Number.isFinite(value)){
      return value > 0 ? 'Infinity' : '-Infinity';
    }
    if(value === 0){
      return '0';
    }
    const formatted = value.toLocaleString('en-US', {maximumSignificantDigits: 6});
    console.debug('Debug: ROC formatPValue fallback', {input: value, formatted});
    return formatted;
  }

  async function drawRoc(){
    if(!state.hot || !refs.plotDiv){
      return;
    }
    const debugStamp = Date.now();
    console.debug('Debug: drawRoc start', {debugStamp}); // Debug: draw entry
    const graphType = refs.graphType?.value || 'roc';
    const bw = Number(refs.borderWidth?.value) || 2;
    const showGrid = !!refs.showGrid?.checked;
    const fontSize = Number(refs.fontSize?.value) || 16;
    const data = state.hot.getData();
    if(!data || !data.length){
      return;
    }
    const header = data[0] || [];
    let labelIndex = header.findIndex(h => String(h).trim().toLowerCase() === 'label');
    if(labelIndex < 0){
      labelIndex = 0;
    }
    const labels = data.slice(1).map(row => parseFloat(row[labelIndex]));
    const positives = labels.filter(val => !Number.isNaN(val) && val > 0).length;
    const negatives = labels.filter(val => !Number.isNaN(val) && val <= 0).length;
    const scoreColumns = header
      .map((_, idx) => idx)
      .filter(idx => idx !== labelIndex && header[idx] != null && String(header[idx]).trim() !== '');
    const series = scoreColumns.map((colIdx, index) => ({
      name: header[colIdx] || `Model ${index + 1}`,
      scores: data.slice(1).map(row => parseFloat(row[colIdx]))
    }));

    const legendLabels = series.map(s => s.name);
    updateLabelColorPickers(legendLabels);

    if(state.compareSel){
      const previous = state.compareSel.value;
      state.compareSel.innerHTML = '';
      const options = [];
      for(let i = 0; i < series.length; i += 1){
        for(let j = i + 1; j < series.length; j += 1){
          const value = `${i},${j}`;
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = `${series[i].name} vs ${series[j].name}`;
          state.compareSel.appendChild(opt);
          options.push(value);
        }
      }
      if(previous && options.includes(previous)){
        state.compareSel.value = previous;
      }else if(options.length){
        state.compareSel.value = options[0];
      }
      const display = options.length ? '' : 'none';
      state.compareSel.style.display = display;
      if(state.compareLabel){
        state.compareLabel.style.display = display;
      }
      if(state.compareResult){
        state.compareResult.style.display = display;
      }
    }

    const plotEl = refs.plotDiv;
    plotEl.style.display = 'block';
    while(plotEl.firstChild){
      plotEl.removeChild(plotEl.firstChild);
    }
    const width = Math.max(50, Math.floor(plotEl.clientWidth || 50));
    const height = Math.max(40, Math.floor(plotEl.clientHeight || 40));
    plotEl.style.position = 'relative';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'rocSvg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('font-family', 'sans-serif');
    plotEl.appendChild(svg);

    const legendWidth = legendLabels.length ? 120 : 0;
    const margin = {
      top: Math.max(32, Math.round(fontSize * 2.2)),
      right: 20 + legendWidth,
      bottom: Math.max(32, Math.round(fontSize * 2.2)) + fontSize + 6,
      left: Math.max(48, Math.round(fontSize * 3.0))
    };
    const plotWidth = Math.max(20, width - margin.left - margin.right);
    const plotHeight = Math.max(20, height - margin.top - margin.bottom);

    const xToPx = value => margin.left + plotWidth * value;
    const yToPx = value => margin.top + plotHeight * (1 - value);

    function add(tag, attrs, text){
      const element = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([key, val]) => {
        element.setAttribute(key, String(val));
      });
      if(text != null){
        element.textContent = text;
      }
      svg.appendChild(element);
      return element;
    }

    add('rect', {x: 0, y: 0, width, height, fill: '#fff'});

    const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
    if(showGrid){
      ticks.forEach(tick => {
        const x = xToPx(tick);
        add('line', {x1: x, y1: margin.top, x2: x, y2: margin.top + plotHeight, stroke: '#ddd', 'stroke-width': 1});
      });
      ticks.forEach(tick => {
        const y = yToPx(tick);
        add('line', {x1: margin.left, y1: y, x2: margin.left + plotWidth, y2: y, stroke: '#ddd', 'stroke-width': 1});
      });
    }

    add('line', {x1: margin.left, y1: margin.top + plotHeight, x2: margin.left + plotWidth, y2: margin.top + plotHeight, stroke: '#000', 'stroke-width': 1});
    add('line', {x1: margin.left, y1: margin.top, x2: margin.left, y2: margin.top + plotHeight, stroke: '#000', 'stroke-width': 1});

    if(graphType === 'roc'){
      add('line', {x1: margin.left, y1: margin.top + plotHeight, x2: margin.left + plotWidth, y2: margin.top, stroke: '#888', 'stroke-dasharray': '4,4', 'stroke-width': 1});
    }else{
      const base = positives / Math.max(1, positives + negatives);
      add('line', {x1: margin.left, y1: yToPx(base), x2: margin.left + plotWidth, y2: yToPx(base), stroke: '#888', 'stroke-dasharray': '4,4', 'stroke-width': 1});
      console.debug('Debug: ROC PR baseline', {base});
    }

    ticks.forEach(tick => {
      const x = xToPx(tick);
      add('line', {x1: x, y1: margin.top + plotHeight, x2: x, y2: margin.top + plotHeight + 6, stroke: '#000', 'stroke-width': 1});
      add('text', {x, y: margin.top + plotHeight + fontSize + 6, 'text-anchor': 'middle', 'font-size': fontSize}, tick);
    });
    ticks.forEach(tick => {
      const y = yToPx(tick);
      add('line', {x1: margin.left - 6, y1: y, x2: margin.left, y2: y, stroke: '#000', 'stroke-width': 1});
      add('text', {x: margin.left - 8, y: y + fontSize / 2, 'text-anchor': 'end', 'font-size': fontSize}, tick);
    });

    add('text', {
      x: margin.left + plotWidth / 2,
      y: height - 6,
      'text-anchor': 'middle',
      'font-size': fontSize + 2
    }, graphType === 'roc' ? 'False Positive Rate' : 'Recall');

    add('text', {
      x: 14,
      y: margin.top + plotHeight / 2,
      'text-anchor': 'middle',
      'font-size': fontSize + 2,
      transform: `rotate(-90 14 ${margin.top + plotHeight / 2})`
    }, graphType === 'roc' ? 'True Positive Rate' : 'Precision');

    const stats = [];
    const allPairs = [];

    series.forEach((serie, seriesIndex) => {
      const pairs = [];
      for(let idx = 0; idx < labels.length; idx += 1){
        const label = labels[idx];
        const score = serie.scores[idx];
        if(!Number.isNaN(label) && !Number.isNaN(score)){
          pairs.push({label: label > 0 ? 1 : 0, score});
        }
      }
      pairs.sort((a, b) => b.score - a.score);
      allPairs.push(pairs);

      let tp = 0;
      let fp = 0;
      const P = pairs.filter(p => p.label === 1).length;
      const N = pairs.length - P;
      const points = [];

      if(graphType === 'roc'){
        points.push({x: 0, y: 0});
        pairs.forEach(pair => {
          if(pair.label === 1) tp += 1; else fp += 1;
          points.push({x: fp / Math.max(1, N), y: tp / Math.max(1, P)});
        });
        points.push({x: 1, y: 1});
      }else{
        points.push({x: 0, y: 1});
        pairs.forEach(pair => {
          if(pair.label === 1) tp += 1; else fp += 1;
          const recall = tp / Math.max(1, P);
          const precision = tp / Math.max(1, tp + fp);
          points.push({x: recall, y: precision});
        });
      }

      let auc = 0;
      let avgPrecision = 0;
      for(let i = 1; i < points.length; i += 1){
        const prev = points[i - 1];
        const curr = points[i];
        auc += (curr.x - prev.x) * (curr.y + prev.y) / 2;
        if(graphType !== 'roc'){
          avgPrecision += (curr.x - prev.x) * curr.y;
        }
      }
      if(graphType === 'roc'){
        avgPrecision = undefined;
      }

      let best = {thr: Infinity, accuracy: 0, precision: 0, recall: 0, f1: 0};
      let tpCount = 0;
      let fpCount = 0;
      let tnCount = N;
      let fnCount = P;
      for(let i = 0; i < pairs.length; ){
        const threshold = pairs[i].score;
        while(i < pairs.length && pairs[i].score === threshold){
          const entry = pairs[i];
          if(entry.label === 1){
            tpCount += 1;
            fnCount -= 1;
          }else{
            fpCount += 1;
            tnCount -= 1;
          }
          i += 1;
        }
        const accuracy = (tpCount + tnCount) / Math.max(1, pairs.length);
        const precision = tpCount / Math.max(1, tpCount + fpCount);
        const recall = tpCount / Math.max(1, tpCount + fnCount);
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        if(f1 > best.f1){
          best = {thr: threshold, accuracy, precision, recall, f1};
        }
      }

      const baseline = graphType === 'roc' ? 0.5 : positives / Math.max(1, positives + negatives);
      const pValue = bootstrapCurveTest(pairs, baseline, graphType);
      stats.push({
        name: serie.name,
        auc,
        avgPrecision,
        thr: best.thr,
        accuracy: best.accuracy,
        precision: best.precision,
        recall: best.recall,
        f1: best.f1,
        pVal: pValue
      });

      const color = state.labelColors[serie.name] || DEFAULT_SCATTER_COLORS[seriesIndex % DEFAULT_SCATTER_COLORS.length];
      let path = '';
      points.forEach((point, idx) => {
        const x = xToPx(point.x);
        const y = yToPx(point.y);
        path += `${idx ? 'L' : 'M'}${x} ${y}`;
      });
      add('path', {d: path, fill: 'none', stroke: color, 'stroke-width': bw});
    });

    const legendX = width - legendWidth + 10;
    legendLabels.forEach((label, index) => {
      const y = margin.top + 10 + index * (fontSize + 6);
      const color = state.labelColors[label] || DEFAULT_SCATTER_COLORS[index % DEFAULT_SCATTER_COLORS.length];
      add('rect', {x: legendX, y: y - 10, width: 12, height: 12, fill: color});
      add('text', {x: legendX + 16, y, 'font-size': fontSize}, label);
    });

    if(refs.statsResults){
      const html = stats.map(stat => {
        const aucText = stat.auc.toFixed(3);
        const apText = graphType === 'pr' && stat.avgPrecision !== undefined ? `AP = ${stat.avgPrecision.toFixed(3)}, ` : '';
        const pText = formatPValue(stat.pVal);
        const thrText = Number.isFinite(stat.thr) ? stat.thr.toFixed(3) : 'NA';
        return `${stat.name}: AUC = ${aucText}, ${apText}p = ${pText}, Thr = ${thrText}, Acc = ${(stat.accuracy * 100).toFixed(1)}%, Prec = ${(stat.precision * 100).toFixed(1)}%, Recall = ${(stat.recall * 100).toFixed(1)}%, F1 = ${(stat.f1 * 100).toFixed(1)}%`;
      }).join('<br>');
      refs.statsResults.innerHTML = html;
    }

    if(series.length >= 2 && state.compareSel && state.compareSel.value){
      const [i, j] = state.compareSel.value.split(',').map(Number);
      const pairsA = allPairs[i];
      const pairsB = allPairs[j];
      let diffResult;
      if(graphType === 'roc' && state.diffMethod === 'delong'){
        diffResult = delongCurveDiff(pairsA, pairsB);
        state.compareResult.textContent = `ΔAUC = ${diffResult.diff.toFixed(3)}, p = ${formatPValue(diffResult.p)}, CI = [${diffResult.ci[0].toFixed(3)}, ${diffResult.ci[1].toFixed(3)}]`;
      }else if(state.diffMethod === 'bootstrap'){
        diffResult = bootstrapCurveDiff(pairsA, pairsB, graphType);
        const metric = graphType === 'roc' ? 'ΔAUC' : 'ΔAP';
        state.compareResult.textContent = `${metric} = ${diffResult.diff.toFixed(3)}, p = ${formatPValue(diffResult.p)}, CI = [${diffResult.ci[0].toFixed(3)}, ${diffResult.ci[1].toFixed(3)}]`;
      }else if(state.diffMethod === 'permutation'){
        diffResult = permutationCurveDiff(pairsA, pairsB, graphType);
        const metric = graphType === 'roc' ? 'ΔAUC' : 'ΔAP';
        state.compareResult.textContent = `${metric} = ${diffResult.diff.toFixed(3)}, p = ${formatPValue(diffResult.p)}`;
      }
      if(global.DEBUG_ROC){
        console.debug('Debug: ROC pair diff', {pair: [series[i].name, series[j].name], diffResult});
      }
    }else if(state.compareResult){
      state.compareResult.textContent = '';
    }
  }

  function getPayload(){
    return {
      type: 'roc',
      data: state.hot?.getData() || [],
      config: {
        borderWidth: refs.borderWidth?.value,
        showGrid: !!refs.showGrid?.checked,
        fontSize: refs.fontSize?.value,
        labelColors: state.labelColors,
        graphType: refs.graphType?.value
      }
    };
  }

  async function saveFile(){
    const payload = getPayload();
    console.debug('Debug: saveRocFile invoked', { hasHandle: !!state.fileHandle });
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('saveRocFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'roc',
      fileHandle: state.fileHandle,
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: saveRocFile result', result);
  }

  async function saveFileAs(){
    const payload = getPayload();
    console.debug('Debug: saveAsRocFile invoked', { currentName: state.fileName });
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('saveAsRocFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'roc',
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: saveAsRocFile result', result);
  }

  function loadFromFile(file){
    const reader = new FileReader();
    reader.onload = event => {
      try{
        const obj = JSON.parse(event.target.result);
        if(obj.type !== 'roc'){
          throw new Error('Invalid graph type');
        }
        state.hot?.loadData(obj.data || []);
        const config = obj.config || {};
        if(refs.borderWidth) refs.borderWidth.value = config.borderWidth || refs.borderWidth.value;
        if(refs.showGrid) refs.showGrid.checked = !!config.showGrid;
        if(refs.fontSize) refs.fontSize.value = config.fontSize || refs.fontSize.value;
        updateFontSizeLabel();
        state.labelColors = config.labelColors || {};
        if(refs.graphType) refs.graphType.value = config.graphType || refs.graphType.value;
        renderStatsControls();
        state.scheduleDraw?.();
      }catch(err){
        console.error('loadRocGraph error', err);
      }
    };
    reader.readAsText(file);
  }

  async function openFile(){
    console.debug('Debug: openRocFile invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('openRocFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'roc',
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
    console.debug('Debug: openRocFile result', result);
  }

  function initExportsAndFiles(){
    refs.pngBtn?.addEventListener('click', async () => {
      const svgEl = document.getElementById('rocSvg');
      if(!svgEl){
        return;
      }
      const w = svgEl.viewBox.baseVal.width || svgEl.clientWidth || 800;
      const h = svgEl.viewBox.baseVal.height || svgEl.clientHeight || 400;
      const xml = typeof global.serializeCleanSVG === 'function'
        ? global.serializeCleanSVG(svgEl)
        : new XMLSerializer().serializeToString(svgEl);
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      try{
        await img.decode();
      }catch(err){
        console.error('rocPNG svg decode', err);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if(!blob){
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'roc.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 'image/png');
    });

    refs.svgBtn?.addEventListener('click', () => {
      const svgEl = document.getElementById('rocSvg');
      if(!svgEl){
        return;
      }
      const xml = typeof global.serializeCleanSVG === 'function'
        ? global.serializeCleanSVG(svgEl)
        : new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([xml], {type: 'image/svg+xml'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'roc.svg';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });

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

  function initControls(){
    if(refs.fontSize){
      refs.fontSize.addEventListener('input', () => {
        updateFontSizeLabel();
        state.scheduleDraw?.();
      });
      updateFontSizeLabel();
    }
    refs.borderWidth?.addEventListener('input', () => state.scheduleDraw?.());
    refs.showGrid?.addEventListener('change', () => state.scheduleDraw?.());
    refs.graphType?.addEventListener('change', () => {
      renderStatsControls();
      state.scheduleDraw?.();
    });
    renderStatsControls();
  }

  function init(){
    if(roc.ready){
      return;
    }
    if(!ensureElements()){
      console.warn('ROC component init skipped: required elements missing');
      return;
    }
    state.scheduleDraw = Shared.debounceFrame(drawRoc);
    console.debug('Debug: roc scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    ensureWrapperStyles();
    initHot();
    initControls();
    initResizers();
    initExampleAndImport();
    initExportsAndFiles();
    state.scheduleDraw?.();
    roc.ready = true;
    console.debug('Debug: ROC component initialized');
    global.scheduleDrawRoc = () => state.scheduleDraw?.();
  }

  roc.init = init;
  roc.draw = () => { void drawRoc(); };
  roc.scheduleDraw = () => state.scheduleDraw?.();
  roc.save = saveFile;
  roc.saveAs = saveFileAs;
  roc.open = openFile;
  roc.loadFromFile = loadFromFile;
})(window);
