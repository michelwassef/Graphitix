(function(global){
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const roc = Components.roc = Components.roc || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
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
    refs.showFrame = document.getElementById('rocShowFrame');
    refs.fontSize = document.getElementById('rocFontSize');
    refs.fontSizeVal = document.getElementById('rocFontSizeVal');
    refs.graphType = document.getElementById('rocGraphType');
    refs.labelColorsDiv = document.getElementById('rocLabelColors');
    refs.labelColorsFieldset = document.getElementById('rocLabelColorsFieldset');
    refs.loadExampleBtn = document.getElementById('rocLoadExample');
    refs.importBtn = document.getElementById('rocImport');
    refs.fileInput = document.getElementById('rocFile');
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
      debugLabel: 'roc',
      panelResizer: refs.panelResizer
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
      const graphSizing = chartStyle.getSquareGraphSizing
        ? chartStyle.getSquareGraphSizing({ context: 'roc' })
        : (function fallbackSizing(){
            const baseWidth = Number(chartStyle.DEFAULT_WIDTH) || 640;
            const baseHeight = Number(chartStyle.DEFAULT_HEIGHT) || baseWidth;
            const minScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
            const maxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
            const fallback = {
              width: baseWidth,
              height: baseHeight,
              minWidth: Math.max(1, Math.round(baseWidth * minScale)),
              minHeight: Math.max(1, Math.round(baseHeight * minScale)),
              maxWidth: Math.max(baseWidth, Math.round(baseWidth * Math.max(maxScale, minScale))),
              maxHeight: Math.max(baseHeight, Math.round(baseHeight * Math.max(maxScale, minScale))),
              aspectRatio: chartStyle.DEFAULT_ASPECT_RATIO || 1,
              aspectLocked: chartStyle.DEFAULT_ASPECT_LOCKED !== false
            };
            console.debug('Debug: ROC fallback square sizing',{ context: 'roc', fallback }); // Debug: fallback sizing payload
            return fallback;
          })();
      console.debug('Debug: ROC resizer sizing config', { graphSizing }); // Debug: ROC sizing helper output
      Shared.attachResizableBox(container, {
        defaultWidth: graphSizing.width,
        defaultHeight: graphSizing.height,
        minWidth: graphSizing.minWidth,
        minHeight: graphSizing.minHeight,
        maxWidth: graphSizing.maxWidth,
        maxHeight: graphSizing.maxHeight,
        aspectLocked: graphSizing.aspectLocked !== false,
        aspectRatio: Number.isFinite(graphSizing.aspectRatio) ? graphSizing.aspectRatio : 1,
        onResize: phase => {
          console.debug('Debug: ROC box resized', { phase }); // Debug: roc svgbox resize callback
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
    console.debug('Debug: ROC initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('roc initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData(DEFAULT_ROWS, ROC_DEFAULT_COLS);
    state.hot = Shared.hot.createStandardTable(refs.hotContainer, { rows: DEFAULT_ROWS, cols: ROC_DEFAULT_COLS }, state.scheduleDraw, {
      debugLabel: 'roc',
      data,
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        afterChange(changes, source){
          if(changes){
            console.debug('Debug: ROC table change', { count: changes.length, source });
          }
        },
        afterCreateRow(){
          console.debug('Debug: ROC row created');
        },
        afterCreateCol(){
          console.debug('Debug: ROC col created');
        },
        afterRemoveRow(){
          console.debug('Debug: ROC row removed');
        },
        afterRemoveCol(){
          console.debug('Debug: ROC col removed');
        },
        afterUndo(){
          console.debug('Debug: ROC undo');
        },
        afterRedo(){
          console.debug('Debug: ROC redo');
        }
      }
    });
  }

  function updateFontSizeLabel(){
    if(refs.fontSizeVal && refs.fontSize){
      if(refs.fontSize.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        console.debug('Debug: roc font size base synced',{ value: refs.fontSize.value }); // Debug: base sync update
      }
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
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
    const borderWidthRaw = Number(refs.borderWidth?.value) || 2;
    const showGrid = !!refs.showGrid?.checked;
    const showFrame = !!refs.showFrame?.checked;
    console.debug('Debug: roc showFrame state',{showFrame});
    const containerRect=refs.svgBox?.getBoundingClientRect?.();
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: refs.fontSize?.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: refs.svgBox,
      input: refs.fontSize
    });
    const fontSize=fontInfo.scaledPx;
    const styleScaleInfo=fontInfo.scaleInfo;
    const axisStrokeWidth=chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'roc-axis', min: 0.5 });
    const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'roc-curve', min: 0 });
    console.debug('Debug: roc style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      axisStrokeWidth,
      styleScale: styleScaleInfo?.styleScale
    }); // Debug: ROC style scaling summary
    if(refs.fontSizeVal){ chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, fontInfo, input: refs.fontSize }); }
    console.debug('Debug: roc font scaling applied',{
      input:refs.fontSize?.value,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fontSize,
      scale:styleScaleInfo?.styleScale || styleScaleInfo?.scale,
      containerWidth:containerRect?.width,
      containerHeight:containerRect?.height
    });
    const axisMetrics = chartStyle.createAxisMetrics(fontSize);
    console.debug('Debug: roc axis metrics',axisMetrics);
    const fontScale=styleScaleInfo?.styleScale || styleScaleInfo?.scale || 1;
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
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
    chartStyle.applySvgDefaults(svg);
    plotEl.appendChild(svg);

    const legendWidth = legendLabels.length ? Math.max(60, Math.round(120 * fontScale)) : 0;
    console.debug('Debug: roc legend width scaling',{
      legendWidth,
      legendScale:fontScale,
      legendCount:legendLabels.length
    });
    const buildTicks = (count) => {
      const steps = Math.max(count - 1, 1);
      const list = Array.from({ length: steps + 1 }, (_, idx) => {
        if(steps === 0) return 0;
        const value = idx / steps;
        return Number(value.toFixed(4));
      });
      if(list[list.length - 1] !== 1){
        list[list.length - 1] = 1;
      }
      return list;
    };
    let tickCount = chartStyle.estimateTickCount(Math.min(width, height), { axis: graphType, fallback: 6, min: 3, max: 11 });
    const formatTick = value => value.toLocaleString('en-US',{maximumFractionDigits:2, minimumFractionDigits:2});
    const tickFont = chartStyle.makeFont(fontSize);
    const axisLabelFont = chartStyle.makeFont(fontSize);
    const xAxisLabel = graphType === 'roc' ? 'False Positive Rate' : 'Recall';
    const yAxisLabel = graphType === 'roc' ? 'True Positive Rate' : 'Precision';
    const yTitleWidth = chartStyle.measureText(yAxisLabel, axisLabelFont);
    let ticks = buildTicks(tickCount);
    let yTickLabels = ticks.map(formatTick);
    let xTickLabels = ticks.map(formatTick);
    let yLabelWidths = yTickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
    let maxYLabelWidth = Math.max(...yLabelWidths, 0);
    let margin = chartStyle.computeBaseMargins({fontSize, legendWidth, maxYLabelWidth, yTitleWidth, axisMetrics});
    let plotWidth = Math.max(20, width - margin.left - margin.right);
    let plotHeight = Math.max(20, height - margin.top - margin.bottom);
    let bottomLayout = chartStyle.computeBottomLayout({labels: xTickLabels, fontSize, plotWidth, baseBottom: margin.bottom, axisMetrics});
    margin.bottom = bottomLayout.bottom;
    plotWidth = Math.max(20, width - margin.left - margin.right);
    plotHeight = Math.max(20, height - margin.top - margin.bottom);
    for(let pass=0; pass<2; pass++){
      const refinedCount = chartStyle.estimateTickCount(Math.min(plotWidth, plotHeight), { axis: graphType, fallback: tickCount, min: 3, max: 11 });
      console.debug('Debug: roc tick target evaluation',{pass,tickCount,refinedCount,plotWidth,plotHeight});
      if(refinedCount === tickCount){
        break;
      }
      tickCount = refinedCount;
      ticks = buildTicks(tickCount);
      yTickLabels = ticks.map(formatTick);
      xTickLabels = ticks.map(formatTick);
      yLabelWidths = yTickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
      maxYLabelWidth = Math.max(...yLabelWidths, 0);
      margin = chartStyle.computeBaseMargins({fontSize, legendWidth, maxYLabelWidth, yTitleWidth, axisMetrics});
      plotWidth = Math.max(20, width - margin.left - margin.right);
      plotHeight = Math.max(20, height - margin.top - margin.bottom);
      bottomLayout = chartStyle.computeBottomLayout({labels: xTickLabels, fontSize, plotWidth, baseBottom: margin.bottom, axisMetrics});
      margin.bottom = bottomLayout.bottom;
      plotWidth = Math.max(20, width - margin.left - margin.right);
      plotHeight = Math.max(20, height - margin.top - margin.bottom);
    }
    console.debug('Debug: roc tick targets',{tickCount, tickSteps: Math.max(tickCount - 1, 1), ticks}); // Debug: ROC tick density summary
    const aspectData = refs.svgBox?.dataset;
    const shouldLockAspect = aspectData?.resizerAspectLocked === 'true';
    console.debug('Debug: roc aspect ratio decision',{shouldLockAspect,storedRatio:aspectData?.resizerAspectRatio}); // Debug: roc aspect toggle decision
    if(shouldLockAspect){
      const square = chartStyle.ensureSquarePlot(width, height, margin);
      margin = square.margin;
      plotWidth = square.plotW;
      plotHeight = square.plotH;
      if(aspectData){
        const derivedRatio = plotHeight > 0 ? plotWidth / plotHeight : NaN;
        if(Number.isFinite(derivedRatio)){
          aspectData.resizerAspectRatio = String(derivedRatio);
        }
      }
      console.debug('Debug: roc layout (locked)',{margin,plotWidth,plotHeight,rotate:bottomLayout.shouldRotate}); // Debug: roc square enforcement branch
    }else{
      console.debug('Debug: roc layout (unlocked)',{margin,plotWidth,plotHeight,rotate:bottomLayout.shouldRotate}); // Debug: roc free resize branch
    }

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

    if(showGrid){
      ticks.forEach(tick => {
        const x = xToPx(tick);
        add('line', {x1: x, y1: margin.top, x2: x, y2: margin.top + plotHeight, stroke: '#ddd', 'stroke-width': axisStrokeWidth});
      });
      ticks.forEach(tick => {
        const y = yToPx(tick);
        add('line', {x1: margin.left, y1: y, x2: margin.left + plotWidth, y2: y, stroke: '#ddd', 'stroke-width': axisStrokeWidth});
      });
      console.debug('Debug: roc grid stroke scaled',{tickCount:ticks.length,axisStrokeWidth});
    }

    const xTickPositions = ticks.map(tick => xToPx(tick));
    const yTickPositions = ticks.map(tick => yToPx(tick));
    let axisXStart = xTickPositions.length ? Math.min(...xTickPositions) : margin.left;
    let axisXEnd = xTickPositions.length ? Math.max(...xTickPositions) : margin.left + plotWidth;
    let axisYStart = yTickPositions.length ? Math.min(...yTickPositions) : margin.top;
    let axisYEnd = yTickPositions.length ? Math.max(...yTickPositions) : margin.top + plotHeight;
    if(axisXStart === axisXEnd){ axisXStart = margin.left; axisXEnd = margin.left + plotWidth; }
    if(axisYStart === axisYEnd){ axisYStart = margin.top; axisYEnd = margin.top + plotHeight; }
    console.debug('Debug: roc axis span', { axisXStart, axisXEnd, axisYStart, axisYEnd });
    const axisStroke = '#000';
    add('line', {x1: axisXStart, y1: margin.top + plotHeight, x2: axisXEnd, y2: margin.top + plotHeight, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth});
    add('line', {x1: margin.left, y1: axisYStart, x2: margin.left, y2: axisYEnd, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth});
    console.debug('Debug: roc axes stroke scaled',{axisStrokeWidth});
    if(showFrame){
      console.debug('Debug: roc frame request',{stroke:axisStroke, showFrame}); // Debug: frame styling inputs
      chartStyle.drawPlotFrame({ svg, margin, plotW: plotWidth, plotH: plotHeight, stroke: axisStroke, sides: ['top','right'] });
    }
    // Frame closes ROC/PR plot area using axis styling continuity

    if(graphType === 'roc'){
      add('line', {x1: margin.left, y1: margin.top + plotHeight, x2: margin.left + plotWidth, y2: margin.top, stroke: '#888', 'stroke-dasharray': '4,4'});
      console.debug('Debug: roc baseline uses default stroke scaling',{mode:'roc'});
    }else{
      const base = positives / Math.max(1, positives + negatives);
      add('line', {x1: margin.left, y1: yToPx(base), x2: margin.left + plotWidth, y2: yToPx(base), stroke: '#888', 'stroke-dasharray': '4,4'});
      console.debug('Debug: ROC PR baseline',{base});
    }

    const xTickNodes = [];
    const tickLen = axisMetrics.tickLength;
    const tickGap = axisMetrics.tickLabelGap;
    ticks.forEach(tick => {
      const x = xToPx(tick);
      add('line', {x1: x, y1: margin.top + plotHeight, x2: x, y2: margin.top + plotHeight + tickLen, stroke: '#000', 'stroke-width': axisStrokeWidth});
      const txt = add('text', {x, y: margin.top + plotHeight + tickLen + tickGap, 'text-anchor': 'middle', 'font-size': fontSize, 'dominant-baseline': 'hanging', fill: chartStyle.TEXT_COLOR}, formatTick(tick));
      xTickNodes.push(txt);
    });
    chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
    ticks.forEach(tick => {
      const y = yToPx(tick);
      add('line', {x1: margin.left - tickLen, y1: y, x2: margin.left, y2: y, stroke: '#000', 'stroke-width': axisStrokeWidth});
      add('text', {x: margin.left - (tickLen + tickGap), y, 'text-anchor': 'end', 'font-size': fontSize, 'dominant-baseline': 'middle', fill: chartStyle.TEXT_COLOR}, formatTick(tick));
    });
    console.debug('Debug: roc ticks stroke scaled',{tickCount:ticks.length,axisStrokeWidth});

    add('text', {
      x: margin.left + plotWidth / 2,
      y: margin.top + plotHeight + bottomLayout.titleOffset,
      'text-anchor': 'middle',
      'font-size': fontSize,
      fill: chartStyle.TEXT_COLOR
    }, xAxisLabel);

    const yLabelX = margin.left - (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fontSize * 0.5);
    add('text', {
      x: yLabelX,
      y: margin.top + plotHeight / 2,
      'text-anchor': 'middle',
      'font-size': fontSize,
      transform: `rotate(-90 ${yLabelX} ${margin.top + plotHeight / 2})`,
      fill: chartStyle.TEXT_COLOR
    }, yAxisLabel);

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
      add('path', {d: path, fill: 'none', stroke: color, 'stroke-width': borderWidthPx});
    });

    const legendMargin=Math.max(6,Math.round(8*fontScale));
    const legendMarkerSize=Math.max(10,Math.round(12*fontScale));
    const legendSpacing=Math.max(4,Math.round(fontSize*0.5));
    const legendTextOffset=legendMarkerSize+Math.max(6,Math.round(8*fontScale));
    const legendX = width - legendWidth + legendMargin;
    console.debug('Debug: roc legend layout',{
      legendX,
      legendMargin,
      legendMarkerSize,
      legendSpacing,
      legendTextOffset
    });
    legendLabels.forEach((label, index) => {
      const baseY = margin.top + legendMargin + index * (legendMarkerSize + legendSpacing);
      const color = state.labelColors[label] || DEFAULT_SCATTER_COLORS[index % DEFAULT_SCATTER_COLORS.length];
      add('rect', {x: legendX, y: baseY, width: legendMarkerSize, height: legendMarkerSize, fill: color});
      add('text', {
        x: legendX + legendTextOffset,
        y: baseY + legendMarkerSize / 2,
        'font-size': fontSize,
        'dominant-baseline': 'middle',
        fill: chartStyle.TEXT_COLOR
      }, label);
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
    const payload = {
      type: 'roc',
      data: state.hot?.getData() || [],
      config: {
        borderWidth: refs.borderWidth?.value,
        showGrid: !!refs.showGrid?.checked,
        showFrame: !!refs.showFrame?.checked,
        fontSize: refs.fontSize?.value,
        labelColors: state.labelColors,
        graphType: refs.graphType?.value
      }
    };
    console.debug('Debug: roc.getPayload captured state', {
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      graphType: payload.config?.graphType
    });
    return payload;
  }
  roc.getPayload = getPayload;

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
        if(refs.showFrame) refs.showFrame.checked = !!config.showFrame;
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
    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#rocExportControls',
        svgSelector: '#rocSvg',
        fileName: 'roc',
        contextLabel: 'roc-export'
      });
      console.debug('Debug: roc export controls mounted', { hasExporter: true }); // Debug: roc export mount
    } else {
      console.debug('Debug: roc export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: roc export fallback
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
    refs.showFrame?.addEventListener('change', () => { console.debug('Debug: roc showFrame change',{checked:refs.showFrame.checked}); state.scheduleDraw?.(); });
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


