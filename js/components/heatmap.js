(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const heatmap = Components.heatmap = Components.heatmap || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  heatmap.__installed = true;
  heatmap.ready = false;

  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: heatmap component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: heatmap component awaiting Shared.tableImport helpers');
  }

  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 6;
  const NS = 'http://www.w3.org/2000/svg';

  const state = {
    hot: null,
    scheduleDraw: () => {},
    fileHandle: null,
    fileName: 'correlation-heatmap.graph',
    svg: null,
    svgBox: null,
    statsEl: null,
    panelResizer: null
  };

  const refs = {};

  function $(id){
    return global.document.getElementById(id);
  }

  function ensureWrapperStyles(){
    const wrapper = $('heatmapHotWrapper');
    if(Shared.ensureHotWrapperStyles){
      Shared.ensureHotWrapperStyles(wrapper);
    }
  }

  function attachSvgResizer(){
    const svgEl = state.svg;
    if(!svgEl){
      console.debug('Debug: heatmap attachSvgResizer skipped - no svg element');
      return;
    }
    const container = svgEl.closest('.svgbox');
    state.svgBox = container;
    const sizing = chartStyle.getSquareGraphSizing ? chartStyle.getSquareGraphSizing({ context: 'heatmap' }) : null;
    const fallbackSizing = (() => {
      const baseWidth = Number(chartStyle.DEFAULT_WIDTH) || 640;
      const baseHeight = Number(chartStyle.DEFAULT_HEIGHT) || baseWidth;
      const minScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
      const maxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
      return {
        width: baseWidth,
        height: baseHeight,
        minWidth: Math.max(1, Math.round(baseWidth * minScale)),
        minHeight: Math.max(1, Math.round(baseHeight * minScale)),
        maxWidth: Math.max(baseWidth, Math.round(baseWidth * Math.max(maxScale, minScale))),
        maxHeight: Math.max(baseHeight, Math.round(baseHeight * Math.max(maxScale, minScale))),
        aspectRatio: chartStyle.DEFAULT_ASPECT_RATIO || 1,
        aspectLocked: chartStyle.DEFAULT_ASPECT_LOCKED !== false
      };
    })();
    const sizingConfig = sizing || fallbackSizing;
    if(container && Shared.attachResizableBox){
      console.debug('Debug: heatmap attaching resizable box', { sizing: sizingConfig });
      Shared.attachResizableBox(container, {
        defaultWidth: sizingConfig.width,
        defaultHeight: sizingConfig.height,
        minWidth: sizingConfig.minWidth,
        minHeight: sizingConfig.minHeight,
        maxWidth: sizingConfig.maxWidth,
        maxHeight: sizingConfig.maxHeight,
        aspectLocked: sizingConfig.aspectLocked !== false,
        aspectRatio: Number.isFinite(sizingConfig.aspectRatio) ? sizingConfig.aspectRatio : 1,
        onResize: phase => {
          console.debug('Debug: heatmap svgbox resized', { phase });
          syncPanels();
        }
      });
    }else{
      console.debug('Debug: heatmap attachResizableBox unavailable', {
        hasContainer: !!container,
        hasHelper: !!Shared.attachResizableBox
      });
    }
  }

  let syncPanels = () => {};
  function initPanelSync(){
    const tablePanel = $('heatmapTablePanel');
    const graphPanel = $('heatmapGraphPanel');
    const configPanel = graphPanel?.querySelector('.config-options');
    state.panelResizer = $('heatmapPanelResizer');
    let minSvgWidth = 0;
    syncPanels = () => {
      if(!Shared.syncPanelWidths){
        console.debug('Debug: heatmap syncPanels skipped - missing Shared.syncPanelWidths');
        return;
      }
      Shared.syncPanelWidths(tablePanel, graphPanel, configPanel, () => state.scheduleDraw(), {
        svgBox: state.svgBox,
        minSvgWidth,
        debugLabel: 'heatmap',
        panelResizer: state.panelResizer
      });
    };
    if(global.ResizeObserver && tablePanel){
      const observer = new global.ResizeObserver(() => {
        syncPanels();
      });
      observer.observe(tablePanel);
    }
    syncPanels();

    if(state.panelResizer && tablePanel && graphPanel){
      state.panelResizer.addEventListener('pointerdown',event => {
        event.preventDefault();
        const startX = event.clientX;
        const startTable = tablePanel.getBoundingClientRect().width;
        const startGraph = graphPanel.getBoundingClientRect().width;
        const configWidth = configPanel?.getBoundingClientRect().width || 0;
        const gap = parseFloat(getComputedStyle(graphPanel.querySelector('.diagram-area')).gap || 0);
        minSvgWidth = (state.svgBox?.getBoundingClientRect().width || 0) * 0.5;
        const minGraph = configWidth + gap + minSvgWidth;
        const total = startTable + startGraph;
        console.debug('Debug: heatmap panel resize start', { startTable, startGraph, minSvgWidth, configWidth, gap });
        function onMove(ev){
          const dx = ev.clientX - startX;
          let newTable = Math.max(150, Math.min(total - minGraph, startTable + dx));
          let newGraph = total - newTable;
          tablePanel.style.flex = `0 0 ${newTable}px`;
          graphPanel.style.flex = `0 0 ${newGraph}px`;
          syncPanels();
          console.debug('Debug: heatmap panel resize move', { dx, newTable, newGraph });
        }
        function onUp(){
          global.document.removeEventListener('pointermove', onMove);
          global.document.removeEventListener('pointerup', onUp);
          console.debug('Debug: heatmap panel resize end');
        }
        global.document.addEventListener('pointermove', onMove);
        global.document.addEventListener('pointerup', onUp);
      });
    }
  }

  function initHot(){
    const container = $('heatmapHot');
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('heatmap initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData ? Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS) : [];
    console.debug('Debug: heatmap initHot using shared factory', { hasDataHelper: !!Shared.createEmptyData });
    state.hot = Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: DEFAULT_COLS }, () => state.scheduleDraw(), {
      debugLabel: 'heatmap',
      data,
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        minSpareRows: 5,
        afterChange(changes, source){
          if(changes && source !== 'loadData'){
            console.log('heatmap afterChange', { count: changes.length, source });
          }
        },
        afterUndo(){
          console.log('heatmap undo');
        },
        afterRedo(){
          console.log('heatmap redo');
        }
      }
    });
  }

  function clampDecimals(value){
    const num = Number(value);
    if(!Number.isFinite(num)) return 2;
    return Math.min(6, Math.max(0, Math.round(num)));
  }

  function initControls(){
    refs.method = $('heatmapMethod');
    refs.cluster = $('heatmapCluster');
    refs.absValues = $('heatmapAbsValues');
    refs.maskLower = $('heatmapMaskLower');
    refs.showValues = $('heatmapShowValues');
    refs.decimals = $('heatmapDecimals');
    refs.colorNegative = $('heatmapColorNegative');
    refs.colorZero = $('heatmapColorZero');
    refs.colorPositive = $('heatmapColorPositive');
    refs.cellSize = $('heatmapCellSize');
    refs.cellSizeVal = $('heatmapCellSizeVal');
    refs.labelAngle = $('heatmapLabelAngle');
    refs.fontSize = $('heatmapFontSize');
    refs.fontSizeVal = $('heatmapFontSizeVal');
    state.statsEl = $('heatmapStatsContent');

    refs.cellSizeVal.textContent = refs.cellSize.value;
    chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value) });

    const schedule = () => state.scheduleDraw();
    refs.method?.addEventListener('change', () => {
      console.debug('Debug: heatmap method changed', { value: refs.method.value });
      schedule();
    });
    refs.cluster?.addEventListener('change', () => {
      console.debug('Debug: heatmap cluster mode changed', { value: refs.cluster.value });
      schedule();
    });
    [refs.absValues, refs.maskLower, refs.showValues].forEach(el => {
      el?.addEventListener('change', () => {
        console.debug('Debug: heatmap toggle changed', { id: el.id, checked: el.checked });
        schedule();
      });
    });
    refs.decimals?.addEventListener('input', () => {
      refs.decimals.value = String(clampDecimals(refs.decimals.value));
      console.debug('Debug: heatmap decimals changed', { value: refs.decimals.value });
      schedule();
    });
    [refs.colorNegative, refs.colorZero, refs.colorPositive].forEach(el => {
      if(!el) return;
      if(typeof global.attachColorPickerNear === 'function'){
        global.attachColorPickerNear(el);
      }
      el.addEventListener('input', () => {
        console.debug('Debug: heatmap color changed', { id: el.id, value: el.value });
        schedule();
      });
    });
    refs.cellSize?.addEventListener('input', () => {
      refs.cellSizeVal.textContent = refs.cellSize.value;
      console.debug('Debug: heatmap cell size changed', { value: refs.cellSize.value });
      schedule();
    });
    refs.labelAngle?.addEventListener('input', () => {
      console.debug('Debug: heatmap label angle changed', { value: refs.labelAngle.value });
      schedule();
    });
    refs.fontSize?.addEventListener('input', () => {
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value) });
      console.debug('Debug: heatmap font size changed', { value: refs.fontSize.value });
      schedule();
    });

    const example = [
      ['Gene', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
      ['GeneA', 5.1, 4.9, 4.7, 4.6, 5.0, 5.4, 4.6],
      ['GeneB', 3.5, 3.0, 3.2, 3.1, 3.6, 3.9, 3.4],
      ['GeneC', 1.4, 1.4, 1.3, 1.5, 1.4, 1.7, 1.4],
      ['GeneD', 0.2, 0.2, 0.2, 0.2, 0.2, 0.4, 0.3]
    ];
    $('heatmapLoadExample')?.addEventListener('click', () => {
      if(!state.hot){
        console.warn('heatmap example skipped - hot not ready');
        return;
      }
      state.hot.loadData(example);
      console.log('heatmap example loaded');
      schedule();
    });

    const importBtn = $('heatmapImport');
    const fileInput = $('heatmapFile');
    importBtn?.addEventListener('click', () => {
      if(fileInput){
        fileInput.value = '';
        fileInput.click();
      }
    });
    fileInput?.addEventListener('change', async () => {
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('heatmap import skipped - Shared.tableImport.openFile unavailable');
        return;
      }
      await tableImport.openFile(fileInput, {
        hot: state.hot,
        minCols: 2,
        minRows: DEFAULT_ROWS,
        scheduleDraw: () => state.scheduleDraw(),
        debugLabel: 'heatmap',
        onProcessed: info => console.log('heatmap data imported', info)
      });
    });

    const hotContainer = $('heatmapHot');
    if(hotContainer && Shared.tableImport && typeof Shared.tableImport.handlePaste === 'function'){
      hotContainer.addEventListener('paste', async evt => {
        console.debug('Debug: heatmap paste detected');
        try{
          await Shared.tableImport.handlePaste(evt, state.hot, {
            minCols: 2,
            minRows: DEFAULT_ROWS,
            scheduleDraw: () => state.scheduleDraw(),
            debugLabel: 'heatmap',
            onProcessed: info => console.log('heatmap paste processed', info)
          });
        }catch(err){
          console.error('heatmap paste error', err);
        }
      }, true);
    }

    if(Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function'){
      Shared.exporter.mountSvgControls({
        container: '#heatmapExportControls',
        svgSelector: '#heatmapSvg',
        fileName: () => (state.fileName || 'correlation-heatmap.graph').replace(/\.graph$/i, '') || 'correlation-heatmap'
      });
    }
  }

  function initFileButtons(){
    $('openHeatmap')?.addEventListener('click', () => heatmap.open());
    $('saveHeatmap')?.addEventListener('click', () => heatmap.save());
    $('saveAsHeatmap')?.addEventListener('click', () => heatmap.saveAs());
    $('heatmapGraphFile')?.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if(file){
        state.fileName = file.name;
        state.fileHandle = null;
        heatmap.loadFromFile(file);
      }
    });
  }

  function parseNumber(value){
    if(value === null || value === undefined) return NaN;
    if(typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value).trim();
    if(!text) return NaN;
    const normalized = text.replace(/,/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function computePearson(xs, ys){
    const n = xs.length;
    if(n <= 1) return NaN;
    if(global.jStat && typeof global.jStat.corrcoeff === 'function'){
      return global.jStat.corrcoeff(xs, ys);
    }
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for(let i = 0; i < n; i += 1){
      const x = xs[i];
      const y = ys[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if(denominator === 0) return NaN;
    return numerator / denominator;
  }

  function rankValues(values){
    const entries = values.map((value, index) => ({ value, index }));
    entries.sort((a, b) => a.value - b.value);
    const ranks = new Array(values.length);
    let i = 0;
    while(i < entries.length){
      let j = i + 1;
      while(j < entries.length && entries[j].value === entries[i].value){
        j += 1;
      }
      const rank = (i + j + 1) / 2;
      for(let k = i; k < j; k += 1){
        ranks[entries[k].index] = rank;
      }
      i = j;
    }
    return ranks;
  }

  function computeCorrelation(xs, ys, method){
    if(xs.length !== ys.length || xs.length < 2) return NaN;
    if(method === 'spearman'){
      const rankX = rankValues(xs);
      const rankY = rankValues(ys);
      return computePearson(rankX, rankY);
    }
    return computePearson(xs, ys);
  }

  function alignColumnValues(columnA, columnB){
    if(!columnA || !columnB) return { xs: [], ys: [] };
    const mapB = new Map(columnB.values.map(entry => [entry.rowIndex, entry.value]));
    const xs = [];
    const ys = [];
    for(const entry of columnA.values){
      if(mapB.has(entry.rowIndex)){
        xs.push(entry.value);
        ys.push(mapB.get(entry.rowIndex));
      }
    }
    return { xs, ys };
  }

  function calculateColumnCorrelation(columnA, columnB, method){
    const { xs, ys } = alignColumnValues(columnA, columnB);
    const count = xs.length;
    if(count < 2){
      return { corr: NaN, count };
    }
    const corr = computeCorrelation(xs, ys, method);
    if(!Number.isFinite(corr)){
      return { corr: NaN, count };
    }
    const normalized = Math.max(-1, Math.min(1, corr));
    return { corr: normalized, count };
  }

  function buildDistanceMatrix(columns, method){
    const n = columns.length;
    const distances = Array.from({ length: n }, () => Array(n).fill(0));
    for(let i = 0; i < n; i += 1){
      for(let j = i + 1; j < n; j += 1){
        const { corr } = calculateColumnCorrelation(columns[i], columns[j], method);
        const distance = Number.isFinite(corr) ? 1 - corr : 1;
        distances[i][j] = distance;
        distances[j][i] = distance;
      }
    }
    console.debug('Debug: heatmap distance matrix prepared', { method, distances });
    return distances;
  }

  function averageLinkageDistance(clusterA, clusterB, baseDistances){
    let sum = 0;
    let count = 0;
    for(const idxA of clusterA.indices){
      for(const idxB of clusterB.indices){
        if(idxA === idxB) continue;
        const dist = baseDistances[idxA]?.[idxB];
        if(Number.isFinite(dist)){
          sum += dist;
          count += 1;
        }
      }
    }
    if(count === 0){
      return 1;
    }
    return sum / count;
  }

  function hierarchicalClusterOrder(baseDistances){
    const n = baseDistances.length;
    if(n <= 1){
      return n === 1 ? [0] : [];
    }
    let clusters = Array.from({ length: n }, (_, index) => ({
      id: index,
      indices: [index],
      size: 1,
      left: null,
      right: null,
      distance: 0
    }));
    const mergeSteps = [];
    while(clusters.length > 1){
      let bestI = 0;
      let bestJ = 1;
      let bestDistance = Infinity;
      for(let i = 0; i < clusters.length; i += 1){
        for(let j = i + 1; j < clusters.length; j += 1){
          const dist = averageLinkageDistance(clusters[i], clusters[j], baseDistances);
          if(dist < bestDistance){
            bestDistance = dist;
            bestI = i;
            bestJ = j;
          }
        }
      }
      const clusterA = clusters[bestI];
      const clusterB = clusters[bestJ];
      const merged = {
        id: `merge-${mergeSteps.length}`,
        indices: clusterA.indices.concat(clusterB.indices),
        size: clusterA.size + clusterB.size,
        left: clusterA,
        right: clusterB,
        distance: bestDistance
      };
      mergeSteps.push({
        left: clusterA.indices.slice(),
        right: clusterB.indices.slice(),
        distance: bestDistance
      });
      clusters.splice(bestJ, 1);
      clusters.splice(bestI, 1);
      clusters.push(merged);
    }
    const root = clusters[0];
    const flatten = node => {
      if(!node.left || !node.right){
        return node.indices.slice();
      }
      const leftOrder = flatten(node.left);
      const rightOrder = flatten(node.right);
      const leftMin = Math.min(...leftOrder);
      const rightMin = Math.min(...rightOrder);
      return leftMin <= rightMin ? leftOrder.concat(rightOrder) : rightOrder.concat(leftOrder);
    };
    const order = flatten(root);
    console.debug('Debug: heatmap hierarchical clustering merges', { steps: mergeSteps, order });
    return order;
  }

  function clusterColumns(columns, method){
    if(!Array.isArray(columns) || columns.length === 0){
      return [];
    }
    if(columns.length === 1){
      return [0];
    }
    const baseDistances = buildDistanceMatrix(columns, method);
    const order = hierarchicalClusterOrder(baseDistances);
    if(!Array.isArray(order) || order.length !== columns.length){
      console.debug('Debug: heatmap clustering order fallback', {
        requestedColumns: columns.length,
        receivedLength: order?.length,
        method
      });
      return columns.map((_, index) => index);
    }
    console.debug('Debug: heatmap clustering order computed', { method, order });
    return order;
  }

  function hexToRgb(hex){
    const normalized = hex?.toString?.().replace('#', '');
    if(!normalized || normalized.length < 6) return { r: 200, g: 200, b: 200 };
    const bigint = parseInt(normalized.length === 3 ? normalized.split('').map(ch => ch + ch).join('') : normalized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
  }

  function mixColor(a, b, t){
    const clamped = Math.min(1, Math.max(0, t));
    const r = Math.round(a.r + (b.r - a.r) * clamped);
    const g = Math.round(a.g + (b.g - a.g) * clamped);
    const bVal = Math.round(a.b + (b.b - a.b) * clamped);
    return `rgb(${r},${g},${bVal})`;
  }

  function colorForValue(entry, palette, useAbs){
    if(!entry || !Number.isFinite(entry.raw) || !Number.isFinite(entry.value)){
      return '#d0d0d0';
    }
    if(useAbs){
      return mixColor(palette.zero, palette.positive, Math.abs(entry.raw));
    }
    if(entry.raw >= 0){
      return mixColor(palette.zero, palette.positive, entry.raw);
    }
    return mixColor(palette.negative, palette.zero, Math.abs(entry.raw));
  }

  function textColorForBackground(fill){
    const rgb = hexToRgb(fill.startsWith('#') ? fill : (() => {
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(fill);
      if(m){
        return `#${Number(m[1]).toString(16).padStart(2,'0')}${Number(m[2]).toString(16).padStart(2,'0')}${Number(m[3]).toString(16).padStart(2,'0')}`;
      }
      return '#d0d0d0';
    })());
    const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    return luminance > 160 ? '#222' : '#fff';
  }

  function renderEmpty(message){
    if(!state.svg) return;
    while(state.svg.firstChild){
      state.svg.removeChild(state.svg.firstChild);
    }
    state.svg.setAttribute('viewBox', '0 0 400 200');
    const text = global.document.createElementNS(NS, 'text');
    text.setAttribute('x', '200');
    text.setAttribute('y', '100');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '16');
    text.setAttribute('fill', '#555');
    text.textContent = message;
    state.svg.appendChild(text);
    if(typeof global.autoResizeSvg === 'function'){
      global.autoResizeSvg(state.svg);
    }
  }

  function updateStats(stats){
    if(!state.statsEl){
      console.debug('Debug: heatmap stats element missing');
      return;
    }
    if(!stats || !stats.columnCount){
      state.statsEl.textContent = 'Add at least two numeric columns to calculate correlations.';
      return;
    }
    const methodLabel = stats.method === 'spearman' ? 'Spearman (rank)' : 'Pearson (linear)';
    const pieces = [
      `<div>Columns analysed: <strong>${stats.columnCount}</strong></div>`,
      `<div>Pairs evaluated: <strong>${stats.pairCount}</strong></div>`,
      `<div>Method: <strong>${methodLabel}</strong>${stats.useAbs ? ' (absolute values shown)' : ''}</div>`
    ];
    if(stats.clusterMode && stats.clusterMode !== 'none' && stats.clusterMethod){
      const clusterMethodLabel = stats.clusterMethod === 'spearman' ? 'Spearman (rank)' : 'Pearson (linear)';
      pieces.push(`<div>Clustering: <strong>Hierarchical (${clusterMethodLabel})</strong></div>`);
    }
    if(stats.strongest){
      pieces.push(`<div>Strongest |r|: <strong>${stats.strongest.labels.join(' vs ')}</strong> = ${stats.strongest.value.toFixed(stats.decimals)} (n=${stats.strongest.count})</div>`);
    }
    if(stats.mostNegative && !stats.useAbs){
      pieces.push(`<div>Most negative r: <strong>${stats.mostNegative.labels.join(' vs ')}</strong> = ${stats.mostNegative.value.toFixed(stats.decimals)} (n=${stats.mostNegative.count})</div>`);
    }
    state.statsEl.innerHTML = pieces.join('');
  }

  function draw(){
    try{
      if(!state.hot || !state.svg){
        console.debug('Debug: heatmap draw skipped - missing hot or svg');
        return;
      }
      const data = typeof state.hot.getData === 'function' ? state.hot.getData() : [];
      if(!Array.isArray(data) || !data.length){
        renderEmpty('Add numeric data to draw the heatmap');
        updateStats(null);
        return;
      }
      const header = Array.isArray(data[0]) ? data[0] : [];
      const rows = data.slice(1);
      const columns = header.map((label, colIndex) => {
        const cleanLabel = (label && String(label).trim()) || `Column ${colIndex + 1}`;
        const values = [];
        for(let rowIndex = 0; rowIndex < rows.length; rowIndex += 1){
          const raw = rows[rowIndex]?.[colIndex];
          const value = parseNumber(raw);
          if(Number.isFinite(value)){
            values.push({ rowIndex, value });
          }
        }
        return { label: cleanLabel, values, colIndex };
      }).filter(col => col.values.length >= 2);

      console.debug('Debug: heatmap column summary', { totalColumns: header.length, usable: columns.length });
      if(columns.length < 2){
        renderEmpty('Enter at least two numeric columns with multiple values.');
        updateStats(null);
        return;
      }

      const method = refs.method?.value || 'pearson';
      const useAbs = !!refs.absValues?.checked;
      const maskLower = !!refs.maskLower?.checked;
      const showValues = !!refs.showValues?.checked;
      const decimals = clampDecimals(refs.decimals?.value);
      const cellSize = Math.max(12, Number(refs.cellSize?.value) || 60);
      const requestedFontSize = Math.max(8, Number(refs.fontSize?.value) || 12);
      const labelAngle = Math.min(90, Math.max(0, Number(refs.labelAngle?.value) || 0));
      const svgBox = state.svgBox || state.svg.closest('.svgbox');
      if(svgBox && !state.svgBox){
        state.svgBox = svgBox;
      }
      let fontInfo = null;
      let fontSizePx = requestedFontSize;
      if(chartStyle.computeFontInfoForSvg){
        fontInfo = chartStyle.computeFontInfoForSvg({
          svgBox,
          rawSize: requestedFontSize,
          debugLabel: 'heatmap-font-info'
        });
        if(Number.isFinite(fontInfo?.scaledPx)){
          fontSizePx = fontInfo.scaledPx;
        }
      }else if(chartStyle.resolveScaledFontSize){
        const rect = svgBox && typeof svgBox.getBoundingClientRect === 'function' ? svgBox.getBoundingClientRect() : null;
        fontInfo = chartStyle.resolveScaledFontSize({
          rawSize: requestedFontSize,
          width: rect?.width,
          height: rect?.height,
          svgBox
        });
        if(Number.isFinite(fontInfo?.scaledPx)){
          fontSizePx = fontInfo.scaledPx;
        }
      }
      if(chartStyle.renderFontSizeLabel){
        chartStyle.renderFontSizeLabel({
          element: refs.fontSizeVal,
          fontInfo,
          pt: fontInfo?.pt ?? requestedFontSize,
          scaledPx: fontSizePx
        });
      }
      const palette = {
        negative: hexToRgb(refs.colorNegative?.value || '#313695'),
        zero: hexToRgb(refs.colorZero?.value || '#f7f7f7'),
        positive: hexToRgb(refs.colorPositive?.value || '#a50026')
      };

      const matrix = [];
      const stats = {
        columnCount: columns.length,
        pairCount: 0,
        strongest: null,
        mostNegative: null,
        method,
        useAbs,
        decimals,
        clusterMode: 'none',
        clusterMethod: null,
        clusterOrder: []
      };

      for(let i = 0; i < columns.length; i += 1){
        matrix[i] = [];
        for(let j = 0; j < columns.length; j += 1){
          if(i === j){
            matrix[i][j] = { raw: 1, value: 1, count: columns[i].values.length };
            continue;
          }
          const pair = calculateColumnCorrelation(columns[i], columns[j], method);
          const raw = Number.isFinite(pair.corr) ? pair.corr : NaN;
          const display = Number.isFinite(raw) ? (useAbs ? Math.abs(raw) : raw) : NaN;
          matrix[i][j] = { raw, value: display, count: pair.count };
          if(Number.isFinite(raw)){
            const absCorr = Math.abs(raw);
            if(i < j){
              stats.pairCount += 1;
              if(!stats.strongest || absCorr > stats.strongest.abs){
                stats.strongest = {
                  labels: [columns[i].label, columns[j].label],
                  value: useAbs ? display : raw,
                  abs: absCorr,
                  count: pair.count
                };
              }
              if(!stats.mostNegative || raw < stats.mostNegative.value){
                stats.mostNegative = {
                  labels: [columns[i].label, columns[j].label],
                  value: raw,
                  count: pair.count
                };
              }
            }
          }
        }
      }

      const clusterMode = refs.cluster?.value || 'none';
      const identityOrder = columns.map((_, index) => index);
      let order = identityOrder;
      let clusterMethod = null;
      let clusteringApplied = false;
      if(clusterMode && clusterMode !== 'none' && columns.length > 1){
        clusterMethod = clusterMode === 'method' ? method : clusterMode;
        const computedOrder = clusterColumns(columns, clusterMethod);
        if(Array.isArray(computedOrder) && computedOrder.length === columns.length){
          order = computedOrder;
          clusteringApplied = true;
          console.debug('Debug: heatmap clustering applied', { clusterMode, clusterMethod, order });
        }else{
          console.debug('Debug: heatmap clustering skipped due to invalid order', { clusterMode, clusterMethod, computedOrder });
        }
      }
      stats.clusterMode = clusteringApplied ? (clusterMode || 'none') : 'none';
      stats.clusterMethod = clusteringApplied ? clusterMethod : null;
      stats.clusterOrder = order.slice();

      const orderedColumns = order.map(index => columns[index]);
      const orderedMatrix = order.map(i => order.map(j => matrix[i][j]));

      while(state.svg.firstChild){
        state.svg.removeChild(state.svg.firstChild);
      }

      const labelStrings = orderedColumns.map(col => col.label);
      let marginLeft = 140;
      let marginTop = 140;
      let topPaddingInfo = null;
      if(typeof chartStyle.ensureLabelPadding === 'function'){
        const leftSafe = chartStyle.ensureLabelPadding(marginLeft, {
          labels: labelStrings,
          fontSize: fontSizePx,
          units: 'px',
          angle: 0,
          basePadding: Math.max(fontSizePx * 0.6, 16),
          direction: 'horizontal',
          debugLabel: 'heatmap-row-labels'
        });
        marginLeft = leftSafe.margin;
        const topSafe = chartStyle.ensureLabelPadding(marginTop, {
          labels: labelStrings,
          fontSize: fontSizePx,
          units: 'px',
          angle: labelAngle,
          basePadding: Math.max(fontSizePx * 0.6, 16),
          direction: 'vertical',
          debugLabel: 'heatmap-column-labels'
        });
        marginTop = topSafe.margin;
        topPaddingInfo = topSafe.info;
        console.debug('Debug: heatmap margin safeguard applied', {
          marginLeft,
          marginTop,
          rowRequired: leftSafe.required,
          columnRequired: topSafe.required,
          fontSizePx
        });
      }
      let columnLabelOffset = Math.max(12, Math.round(fontSizePx * 0.25));
      if(topPaddingInfo){
        const downward = Math.abs(topPaddingInfo.sin || 0) * (topPaddingInfo.maxLabelWidth || 0);
        const baseDescender = Math.max(fontSizePx * 0.35, 8);
        columnLabelOffset = Math.max(columnLabelOffset, Math.ceil(downward + baseDescender));
      }
      console.debug('Debug: heatmap column label offset computed', {
        columnLabelOffset,
        labelAngle,
        fontSizePx
      });
      const marginRight = 60;
      const marginBottom = 60;
      const totalSize = orderedColumns.length * cellSize;
      const width = marginLeft + totalSize + marginRight;
      const height = marginTop + totalSize + marginBottom;
      state.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

      const viewScaleInfo = chartStyle.computeViewBoxScale ? chartStyle.computeViewBoxScale({
        svgBox: state.svgBox,
        svg: state.svg,
        viewBoxWidth: width,
        viewBoxHeight: height,
        debugLabel: 'heatmap'
      }) : { scale: 1, scaleX: 1, scaleY: 1 };
      let renderFontSizePx = fontSizePx;
      if(chartStyle.adjustFontSizeForViewBox){
        const adjusted = chartStyle.adjustFontSizeForViewBox(fontInfo || { scaledPx: fontSizePx }, viewScaleInfo, { min: 4, debugLabel: 'heatmap' });
        if(adjusted && Number.isFinite(adjusted.fontSizePx)){
          renderFontSizePx = adjusted.fontSizePx;
        }
      }else if(viewScaleInfo && Number.isFinite(viewScaleInfo.scale) && viewScaleInfo.scale > 0){
        renderFontSizePx = fontSizePx / viewScaleInfo.scale;
      }
      console.debug('Debug: heatmap render font size resolved', {
        requested: requestedFontSize,
        scaledPx: fontSizePx,
        renderFontSizePx,
        viewScale: viewScaleInfo?.scale,
        locked: fontInfo?.textLocked
      });

      const doc = global.document;
      const g = doc.createElementNS(NS, 'g');
      state.svg.appendChild(g);

      for(let i = 0; i < orderedColumns.length; i += 1){
        const rowLabel = doc.createElementNS(NS, 'text');
        rowLabel.setAttribute('x', String(marginLeft - 12));
        rowLabel.setAttribute('y', String(marginTop + i * cellSize + cellSize / 2));
        rowLabel.setAttribute('text-anchor', 'end');
        rowLabel.setAttribute('dominant-baseline', 'middle');
        rowLabel.setAttribute('font-size', String(renderFontSizePx));
        rowLabel.textContent = orderedColumns[i].label;
        g.appendChild(rowLabel);
      }

      for(let j = 0; j < orderedColumns.length; j += 1){
        const colLabel = doc.createElementNS(NS, 'text');
        const labelX = marginLeft + j * cellSize + cellSize / 2;
        const labelY = marginTop - columnLabelOffset;
        colLabel.setAttribute('x', String(labelX));
        colLabel.setAttribute('y', String(labelY));
        colLabel.setAttribute('font-size', String(renderFontSizePx));
        colLabel.setAttribute('dominant-baseline', 'alphabetic');
        if(labelAngle > 0){
          colLabel.setAttribute('transform', `rotate(${-labelAngle} ${labelX} ${labelY})`);
          colLabel.setAttribute('text-anchor', 'end');
        }else{
          colLabel.setAttribute('text-anchor', 'middle');
        }
        colLabel.textContent = orderedColumns[j].label;
        g.appendChild(colLabel);
      }

      for(let i = 0; i < orderedColumns.length; i += 1){
        for(let j = 0; j < orderedColumns.length; j += 1){
          if(maskLower && j < i){
            continue;
          }
          const entry = orderedMatrix[i][j];
          const x = marginLeft + j * cellSize;
          const y = marginTop + i * cellSize;
          const rect = doc.createElementNS(NS, 'rect');
          rect.setAttribute('x', String(x));
          rect.setAttribute('y', String(y));
          rect.setAttribute('width', String(cellSize));
          rect.setAttribute('height', String(cellSize));
          rect.setAttribute('stroke', '#fff');
          rect.setAttribute('stroke-width', '1');
          const fill = colorForValue(entry, palette, useAbs);
          rect.setAttribute('fill', fill);
          const title = doc.createElementNS(NS, 'title');
          title.textContent = `${orderedColumns[i].label} vs ${orderedColumns[j].label}: ${Number.isFinite(entry.value) ? entry.value.toFixed(decimals) : 'n/a'} (n=${entry.count})`;
          rect.appendChild(title);
          g.appendChild(rect);

          if(showValues && Number.isFinite(entry.value)){
            const text = doc.createElementNS(NS, 'text');
            text.setAttribute('x', String(x + cellSize / 2));
            text.setAttribute('y', String(y + cellSize / 2));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-size', String(renderFontSizePx));
            text.setAttribute('fill', textColorForBackground(fill));
            text.textContent = entry.value.toFixed(decimals);
            g.appendChild(text);
          }
        }
      }

      updateStats(stats);

      if(typeof global.autoResizeSvg === 'function'){
        global.autoResizeSvg(state.svg);
      }
      syncPanels();
      console.debug('Debug: heatmap draw complete', {
        columns: orderedColumns.length,
        method,
        useAbs,
        maskLower,
        showValues,
        clusterMode: stats.clusterMode,
        clusterMethod: stats.clusterMethod
      });
    }catch(err){
      console.error('heatmap draw error', err);
    }
  }

  function getConfig(){
    return {
      method: refs.method?.value || 'pearson',
      cluster: refs.cluster?.value || 'none',
      abs: !!refs.absValues?.checked,
      maskLower: !!refs.maskLower?.checked,
      showValues: !!refs.showValues?.checked,
      decimals: clampDecimals(refs.decimals?.value),
      colorNegative: refs.colorNegative?.value || '#313695',
      colorZero: refs.colorZero?.value || '#f7f7f7',
      colorPositive: refs.colorPositive?.value || '#a50026',
      cellSize: Number(refs.cellSize?.value) || 60,
      labelAngle: Number(refs.labelAngle?.value) || 0,
      fontSize: Number(refs.fontSize?.value) || 12
    };
  }

  function applyConfig(config){
    if(!config) return;
    if(refs.method) refs.method.value = config.method || 'pearson';
    if(refs.cluster) refs.cluster.value = config.cluster || 'none';
    if(refs.absValues) refs.absValues.checked = !!config.abs;
    if(refs.maskLower) refs.maskLower.checked = !!config.maskLower;
    if(refs.showValues) refs.showValues.checked = config.showValues !== false;
    if(refs.decimals) refs.decimals.value = String(clampDecimals(config.decimals));
    if(refs.colorNegative) refs.colorNegative.value = config.colorNegative || '#313695';
    if(refs.colorZero) refs.colorZero.value = config.colorZero || '#f7f7f7';
    if(refs.colorPositive) refs.colorPositive.value = config.colorPositive || '#a50026';
    if(refs.cellSize){
      refs.cellSize.value = String(config.cellSize || 60);
      refs.cellSizeVal.textContent = refs.cellSize.value;
    }
    if(refs.labelAngle) refs.labelAngle.value = String(config.labelAngle || 0);
    if(refs.fontSize){
      refs.fontSize.value = String(config.fontSize || 12);
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value) });
    }
  }

  function getPayload(){
    if(!state.hot){
      return { type: 'heatmap', data: [], config: getConfig() };
    }
    return {
      type: 'heatmap',
      data: state.hot.getData(),
      config: getConfig()
    };
  }

  heatmap.save = async function saveHeatmap(){
    console.debug('Debug: heatmap.save invoked', { hasHandle: !!state.fileHandle });
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('heatmap.save missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'heatmap',
      fileHandle: state.fileHandle,
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: heatmap.save result', result);
  };

  heatmap.saveAs = async function saveAsHeatmap(){
    console.debug('Debug: heatmap.saveAs invoked', { currentName: state.fileName });
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('heatmap.saveAs missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'heatmap',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: heatmap.saveAs result', result);
  };

  heatmap.open = async function openHeatmap(){
    console.debug('Debug: heatmap.open invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('heatmap.open missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'heatmap',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: file => heatmap.loadFromFile(file),
      triggerInput: () => {
        const input = $('heatmapGraphFile');
        if(input){
          input.value = '';
          input.click();
        }
      }
    });
    console.debug('Debug: heatmap.open result', result);
  };

  heatmap.loadFromFile = function loadHeatmapFromFile(file){
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const obj = JSON.parse(e.target.result);
        console.log('heatmap graph loaded', obj);
        if(obj.type !== 'heatmap'){
          throw new Error('Invalid graph type');
        }
        state.hot?.loadData(obj.data || []);
        applyConfig(obj.config || {});
        state.scheduleDraw();
      }catch(err){
        console.error('heatmap load error', err);
      }
    };
    reader.readAsText(file);
  };

  heatmap.draw = draw;

  heatmap.init = function init(){
    if(heatmap.ready){
      console.debug('Debug: heatmap.init skipped - already ready');
      return;
    }
    console.debug('Debug: heatmap.init start');
    state.svg = $('heatmapSvg');
    ensureWrapperStyles();
    attachSvgResizer();
    initPanelSync();
    initHot();
    initControls();
    initFileButtons();
    state.scheduleDraw = Shared.debounceFrame ? Shared.debounceFrame(draw) : draw;
    console.debug('Debug: heatmap scheduler configured', { hasDebounce: !!Shared.debounceFrame });
    heatmap.ready = true;
    state.scheduleDraw();
  };

  heatmap.ensure = function ensure(){
    if(!heatmap.ready){
      heatmap.init();
    }
  };

})(window);

