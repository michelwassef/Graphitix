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
  const COLUMN_LABEL_VERTICAL_ANGLE = 90;

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
      const attachHelper = Shared.resizer?.attachPanelDragResizer;
      console.debug('Debug: heatmap attachPanelDragResizer init', { hasHelper: typeof attachHelper === 'function' }); // Debug: helper availability check
      if(typeof attachHelper === 'function'){
        attachHelper({
          panelResizer: state.panelResizer,
          tablePanel,
          graphPanel,
          configPanel,
          debugLabel: 'heatmap',
          syncPanels: () => syncPanels(),
          computeMinSvgWidth: () => {
            const width = state.svgBox?.getBoundingClientRect().width || 0;
            const computed = Math.max(0, width * 0.5);
            console.debug('Debug: heatmap attachPanelDragResizer computeMinSvgWidth', { width, computed }); // Debug: helper min width calc
            return computed;
          },
          onMinSvgWidth: value => {
            const coerced = Number.isFinite(value) ? value : 0;
            minSvgWidth = Math.max(0, coerced);
            console.debug('Debug: heatmap attachPanelDragResizer onMinSvgWidth', { value, coerced: minSvgWidth }); // Debug: update cached min width
          }
        });
      }
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
    refs.showDendrogram = $('heatmapShowDendrogram');
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
    if(refs.labelAngle){
      refs.labelAngle.value = String(COLUMN_LABEL_VERTICAL_ANGLE);
      refs.labelAngle.setAttribute('disabled', 'disabled');
      refs.labelAngle.setAttribute('title', 'Column labels render vertically to avoid overlap.');
      console.debug('Debug: heatmap label angle control locked vertical', {
        enforced: COLUMN_LABEL_VERTICAL_ANGLE
      });
    }
    state.statsEl = $('heatmapStatsContent');

    refs.cellSizeVal.textContent = refs.cellSize.value;
    if(refs.fontSize?.dataset){
      refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      console.debug('Debug: heatmap font size base initialized',{ value: refs.fontSize.value }); // Debug: initial base size
    }
    chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });

    const schedule = () => state.scheduleDraw();
    refs.method?.addEventListener('change', () => {
      console.debug('Debug: heatmap method changed', { value: refs.method.value });
      schedule();
    });
    refs.cluster?.addEventListener('change', () => {
      console.debug('Debug: heatmap cluster mode changed', { value: refs.cluster.value });
      schedule();
    });
    [refs.showDendrogram, refs.absValues, refs.maskLower, refs.showValues].forEach(el => {
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
      const attempted = Number(refs.labelAngle?.value);
      if(refs.labelAngle){
        if(attempted !== COLUMN_LABEL_VERTICAL_ANGLE){
          console.debug('Debug: heatmap label angle input overridden', {
            attempted,
            enforced: COLUMN_LABEL_VERTICAL_ANGLE
          });
        }else{
          console.debug('Debug: heatmap label angle input confirmed vertical', {
            enforced: COLUMN_LABEL_VERTICAL_ANGLE
          });
        }
        refs.labelAngle.value = String(COLUMN_LABEL_VERTICAL_ANGLE);
      }
      schedule();
    });
    refs.fontSize?.addEventListener('input', () => {
      if(refs.fontSize.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        console.debug('Debug: heatmap font size input manual set',{ value: refs.fontSize.value }); // Debug: manual slider update
      }
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
      console.debug('Debug: heatmap font size changed', { value: refs.fontSize.value });
      schedule();
    });

    const example = [
      ['Gene', 'Baseline_A', 'Baseline_B', 'Treatment_A', 'Treatment_B', 'Stress_A', 'Stress_B', 'Recovery'],
      ['GeneA', 2.1, 2.4, 6.8, 7.1, 9.5, 9.1, 3.2],
      ['GeneB', 5.5, 5.8, 2.2, 2.0, 3.1, 3.5, 6.7],
      ['GeneC', 1.2, 1.0, 7.9, 7.5, 2.6, 2.1, 4.3],
      ['GeneD', 3.8, 3.5, 1.6, 1.8, 8.4, 8.7, 2.4],
      ['GeneE', 4.5, 4.2, 3.1, 3.4, 6.9, 7.2, 5.1]
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

  function performHierarchicalClustering(baseDistances){
    const n = Array.isArray(baseDistances) ? baseDistances.length : 0;
    if(n <= 0){
      console.debug('Debug: heatmap hierarchical clustering skipped - empty distance matrix');
      return { order: [], tree: null, steps: [], maxDistance: 0 };
    }
    const clusters = Array.from({ length: n }, (_, index) => ({
      id: index,
      indices: [index],
      size: 1,
      left: null,
      right: null,
      distance: 0
    }));
    if(n === 1){
      console.debug('Debug: heatmap hierarchical clustering trivial - single column');
      return { order: [0], tree: clusters[0], steps: [], maxDistance: 0 };
    }
    const working = clusters.slice();
    const mergeSteps = [];
    let maxDistance = 0;
    while(working.length > 1){
      let bestI = 0;
      let bestJ = 1;
      let bestDistance = Infinity;
      for(let i = 0; i < working.length; i += 1){
        for(let j = i + 1; j < working.length; j += 1){
          const dist = averageLinkageDistance(working[i], working[j], baseDistances);
          if(dist < bestDistance){
            bestDistance = dist;
            bestI = i;
            bestJ = j;
          }
        }
      }
      const safeDistance = Number.isFinite(bestDistance) ? bestDistance : 0;
      const clusterA = working[bestI];
      const clusterB = working[bestJ];
      const merged = {
        id: `merge-${mergeSteps.length}`,
        indices: clusterA.indices.concat(clusterB.indices),
        size: clusterA.size + clusterB.size,
        left: clusterA,
        right: clusterB,
        distance: safeDistance
      };
      mergeSteps.push({
        left: clusterA.indices.slice(),
        right: clusterB.indices.slice(),
        distance: safeDistance
      });
      maxDistance = Math.max(maxDistance, safeDistance);
      working.splice(bestJ, 1);
      working.splice(bestI, 1);
      working.push(merged);
    }
    const root = working[0];
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
    console.debug('Debug: heatmap hierarchical clustering merges', { steps: mergeSteps, order, maxDistance });
    return { order, tree: root, steps: mergeSteps, maxDistance };
  }

  function clusterColumns(columns, method){
    if(!Array.isArray(columns) || columns.length === 0){
      return { order: [], tree: null, steps: [], maxDistance: 0, baseDistances: [] };
    }
    const baseDistances = buildDistanceMatrix(columns, method);
    const clustering = performHierarchicalClustering(baseDistances);
    if(!Array.isArray(clustering.order) || clustering.order.length !== columns.length){
      console.debug('Debug: heatmap clustering order fallback', {
        requestedColumns: columns.length,
        receivedLength: clustering?.order?.length,
        method
      });
      return {
        order: columns.map((_, index) => index),
        tree: null,
        steps: clustering.steps || [],
        maxDistance: clustering.maxDistance || 0,
        baseDistances
      };
    }
    console.debug('Debug: heatmap clustering order computed', {
      method,
      order: clustering.order,
      maxDistance: clustering.maxDistance
    });
    return Object.assign({ baseDistances }, clustering);
  }

  function renderDendrogram({
    doc,
    parent,
    tree,
    order,
    startX,
    width,
    marginTop,
    cellSize,
    maxDistance
  }){
    const hasBasics = doc && parent && tree && Array.isArray(order) && order.length > 0;
    if(!hasBasics || !Number.isFinite(startX) || !Number.isFinite(width) || width <= 0){
      console.debug('Debug: heatmap renderDendrogram skipped', {
        hasBasics,
        startX,
        width
      });
      return null;
    }
    const orderIndex = new Map();
    order.forEach((colIndex, position) => {
      orderIndex.set(colIndex, position);
    });
    const safeMaxDistance = maxDistance > 0 ? maxDistance : 1;
    const group = doc.createElementNS(NS, 'g');
    group.setAttribute('class', 'heatmap-dendrogram');
    group.setAttribute('fill', 'none');
    group.setAttribute('stroke', '#555');
    group.setAttribute('stroke-width', '1');
    group.setAttribute('stroke-linecap', 'square');
    parent.appendChild(group);

    const visit = node => {
      if(!node){
        return { x: startX, y: marginTop };
      }
      if(!node.left || !node.right){
        const rawIndex = Array.isArray(node.indices) ? node.indices[0] : null;
        const orderPos = orderIndex.has(rawIndex) ? orderIndex.get(rawIndex) : 0;
        if(!orderIndex.has(rawIndex)){
          console.debug('Debug: heatmap dendrogram leaf missing order mapping', { rawIndex });
        }
        const y = marginTop + orderPos * cellSize + cellSize / 2;
        return { x: startX, y };
      }
      const leftPos = visit(node.left);
      const rightPos = visit(node.right);
      const distance = Math.max(0, Number(node.distance) || 0);
      const nodeX = startX + (distance / safeMaxDistance) * width;
      const nodeY = (leftPos.y + rightPos.y) / 2;
      const path = doc.createElementNS(NS, 'path');
      path.setAttribute('d', [
        `M ${leftPos.x} ${leftPos.y} H ${nodeX}`,
        `M ${rightPos.x} ${rightPos.y} H ${nodeX}`,
        `M ${nodeX} ${leftPos.y} V ${rightPos.y}`
      ].join(' '));
      group.appendChild(path);
      return { x: nodeX, y: nodeY };
    };

    const rootPos = visit(tree);
    console.debug('Debug: heatmap renderDendrogram complete', {
      startX,
      width,
      maxDistance,
      rootX: rootPos?.x,
      leafCount: order.length
    });
    return group;
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
        if(refs.showDendrogram){
          refs.showDendrogram.disabled = true;
        }
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
        if(refs.showDendrogram){
          refs.showDendrogram.disabled = true;
        }
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
      const requestedLabelAngleRaw = Number(refs.labelAngle?.value);
      const labelAngle = COLUMN_LABEL_VERTICAL_ANGLE;
      if(refs.labelAngle && requestedLabelAngleRaw !== labelAngle){
        refs.labelAngle.value = String(labelAngle);
      }
      console.debug('Debug: heatmap column label angle enforced', {
        requested: Number.isFinite(requestedLabelAngleRaw) ? requestedLabelAngleRaw : null,
        applied: labelAngle
      });
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
          debugLabel: 'heatmap-font-info',
          input: refs.fontSize
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
          svgBox,
          input: refs.fontSize
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
          scaledPx: fontSizePx,
          input: refs.fontSize
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
      let clusteringDetails = null;
      if(clusterMode && clusterMode !== 'none' && columns.length > 1){
        clusterMethod = clusterMode === 'method' ? method : clusterMode;
        const computed = clusterColumns(columns, clusterMethod);
        if(computed && Array.isArray(computed.order) && computed.order.length === columns.length){
          order = computed.order;
          clusteringApplied = true;
          clusteringDetails = computed;
          console.debug('Debug: heatmap clustering applied', {
            clusterMode,
            clusterMethod,
            order,
            maxDistance: computed.maxDistance
          });
        }else{
          console.debug('Debug: heatmap clustering skipped due to invalid order', {
            clusterMode,
            clusterMethod,
            computed
          });
        }
      }
      if(refs.showDendrogram){
        refs.showDendrogram.disabled = !clusteringApplied;
      }
      const dendrogramRequested = clusteringApplied && (refs.showDendrogram ? refs.showDendrogram.checked !== false : false);
      const shouldRenderDendrogram = dendrogramRequested && clusteringDetails?.tree;
      if(refs.showDendrogram){
        console.debug('Debug: heatmap dendrogram availability', {
          enabled: !refs.showDendrogram.disabled,
          requested: !!dendrogramRequested,
          willRender: !!shouldRenderDendrogram
        });
      }
      stats.clusterMode = clusteringApplied ? (clusterMode || 'none') : 'none';
      stats.clusterMethod = clusteringApplied ? clusterMethod : null;
      stats.clusterOrder = order.slice();
      stats.showDendrogram = !!shouldRenderDendrogram;

      const orderedColumns = order.map(index => columns[index]);
      const orderedMatrix = order.map(i => order.map(j => matrix[i][j]));

      while(state.svg.firstChild){
        state.svg.removeChild(state.svg.firstChild);
      }

      const labelStrings = orderedColumns.map(col => col.label);
      const baseMarginLeft = 140;
      const baseMarginTop = 140;
      let marginLeft = baseMarginLeft;
      let marginTop = baseMarginTop;
      let labelClearance = 0;
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
        labelClearance = Math.max(labelClearance, Math.ceil(topSafe.required || 0));
        console.debug('Debug: heatmap margin safeguard applied', {
          marginLeft,
          marginTop,
          rowRequired: leftSafe.required,
          columnRequired: topSafe.required,
          fontSizePx,
          labelClearance
        });
      }
      const baseTopSpacing = Math.max(fontSizePx, 16);
      const minBaselineGap = Math.max(3, Math.round(fontSizePx * 0.25));
      const baselineAllowance = Math.max(2, Math.round(fontSizePx * 0.15));
      let columnLabelOffset = minBaselineGap + baselineAllowance;
      if(topPaddingInfo){
        const shearComponent = Math.abs(topPaddingInfo.cos || 0) * fontSizePx;
        const downward = Math.abs(topPaddingInfo.sin || 0) * (topPaddingInfo.maxLabelWidth || 0);
        const shearAllowance = Math.ceil(shearComponent * 0.2);
        const tunedOffset = Math.max(columnLabelOffset, minBaselineGap + baselineAllowance + shearAllowance);
        columnLabelOffset = tunedOffset;
        console.debug('Debug: heatmap vertical label clearance tuned', {
          minBaselineGap,
          baselineAllowance,
          shearComponent,
          shearAllowance,
          downward,
          columnLabelOffset
        });
      }else{
        console.debug('Debug: heatmap vertical label clearance default', {
          minBaselineGap,
          baselineAllowance,
          columnLabelOffset
        });
      }
      const columnLabelClearance = columnLabelOffset + baseTopSpacing;
      labelClearance = Math.max(labelClearance, columnLabelClearance);
      console.debug('Debug: heatmap column label offset computed', {
        columnLabelOffset,
        labelAngle,
        fontSizePx,
        baseTopSpacing,
        columnLabelClearance,
        labelClearance
      });
      if(marginTop < columnLabelClearance){
        console.debug('Debug: heatmap top margin increased for labels', {
          previousMarginTop: marginTop,
          columnLabelClearance,
          columnLabelOffset,
          fontSizePx,
          labelClearance
        });
        marginTop = columnLabelClearance;
      }
      const baseColumnLabelOffset = columnLabelOffset;
      const baseLabelClearance = labelClearance;
      const marginBottom = 60;
      let marginRight = 60;
      let dendrogramPadding = 0;
      let dendrogramWidth = 0;
      if(shouldRenderDendrogram){
        dendrogramPadding = Math.min(24, Math.max(6, Math.round(cellSize * 0.2)));
        dendrogramWidth = Math.min(200, Math.max(60, Math.round(cellSize * 1.5)));
        marginRight += dendrogramPadding + dendrogramWidth;
        console.debug('Debug: heatmap dendrogram layout prepared', {
          dendrogramPadding,
          dendrogramWidth
        });
      }
      const totalSize = orderedColumns.length * cellSize;
      const width = marginLeft + totalSize + marginRight;
      let height = marginTop + totalSize + marginBottom;
      const dendrogramStartX = shouldRenderDendrogram ? marginLeft + totalSize + dendrogramPadding : marginLeft + totalSize;
      if(shouldRenderDendrogram){
        console.debug('Debug: heatmap dendrogram coordinates prepared', {
          dendrogramStartX,
          heatmapRight: marginLeft + totalSize
        });
      }
      state.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

      let viewScaleInfo = chartStyle.computeViewBoxScale ? chartStyle.computeViewBoxScale({
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
      const safeBaseFontPx = fontSizePx > 0 ? fontSizePx : (renderFontSizePx > 0 ? renderFontSizePx : 1);
      const computeScaledLabelSpacing = scaleValue => {
        const safeScale = Number.isFinite(scaleValue) && scaleValue > 0 ? scaleValue : 1;
        const scaledOffset = Math.max(Math.ceil(baseColumnLabelOffset * safeScale), Math.ceil(baseColumnLabelOffset));
        const scaledTopSpacing = Math.max(Math.ceil(baseTopSpacing * safeScale), Math.ceil(baseTopSpacing));
        const scaledClearance = Math.max(Math.ceil(baseLabelClearance * safeScale), scaledOffset + scaledTopSpacing);
        return { scale: safeScale, offset: scaledOffset, clearance: scaledClearance, topSpacing: scaledTopSpacing };
      };
      let fontScale = safeBaseFontPx > 0 ? renderFontSizePx / safeBaseFontPx : 1;
      let scaledSpacing = computeScaledLabelSpacing(fontScale);
      if(scaledSpacing.scale !== 1){
        console.debug('Debug: heatmap label clearance scaled', {
          fontScale: scaledSpacing.scale,
          scaledOffset: scaledSpacing.offset,
          scaledClearance: scaledSpacing.clearance,
          scaledTopSpacing: scaledSpacing.topSpacing
        });
      }
      if(marginTop < scaledSpacing.clearance){
        console.debug('Debug: heatmap margin scaled for labels', {
          previousMarginTop: marginTop,
          scaledClearance: scaledSpacing.clearance
        });
        marginTop = scaledSpacing.clearance;
        const previousHeight = height;
        height = marginTop + totalSize + marginBottom;
        if(height !== previousHeight){
          state.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
          if(chartStyle.computeViewBoxScale){
            viewScaleInfo = chartStyle.computeViewBoxScale({
              svgBox: state.svgBox,
              svg: state.svg,
              viewBoxWidth: width,
              viewBoxHeight: height,
              debugLabel: 'heatmap'
            });
          }
          if(chartStyle.adjustFontSizeForViewBox){
            const adjusted = chartStyle.adjustFontSizeForViewBox(fontInfo || { scaledPx: fontSizePx }, viewScaleInfo, { min: 4, debugLabel: 'heatmap' });
            if(adjusted && Number.isFinite(adjusted.fontSizePx)){
              renderFontSizePx = adjusted.fontSizePx;
            }
          }else if(viewScaleInfo && Number.isFinite(viewScaleInfo.scale) && viewScaleInfo.scale > 0){
            renderFontSizePx = fontSizePx / viewScaleInfo.scale;
          }
          fontScale = safeBaseFontPx > 0 ? renderFontSizePx / safeBaseFontPx : 1;
          scaledSpacing = computeScaledLabelSpacing(fontScale);
          console.debug('Debug: heatmap label clearance recomputed', {
            fontScale: scaledSpacing.scale,
            scaledOffset: scaledSpacing.offset,
            scaledClearance: scaledSpacing.clearance,
            scaledTopSpacing: scaledSpacing.topSpacing
          });
          if(marginTop < scaledSpacing.clearance){
            marginTop = scaledSpacing.clearance;
            height = marginTop + totalSize + marginBottom;
            state.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
            console.debug('Debug: heatmap margin secondary scaling applied', {
              marginTop,
              height
            });
          }
        }
      }
      columnLabelOffset = scaledSpacing.offset;
      labelClearance = scaledSpacing.clearance;
      console.debug('Debug: heatmap render font size resolved', {
        requested: requestedFontSize,
        scaledPx: fontSizePx,
        renderFontSizePx,
        viewScale: viewScaleInfo?.scale,
        locked: fontInfo?.textLocked,
        fontScale: scaledSpacing.scale,
        marginTop,
        columnLabelOffset,
        labelClearance
      });

      const doc = global.document;
      const g = doc.createElementNS(NS, 'g');
      state.svg.appendChild(g);

      if(shouldRenderDendrogram && clusteringDetails?.tree){
        renderDendrogram({
          doc,
          parent: g,
          tree: clusteringDetails.tree,
          order,
          startX: dendrogramStartX,
          width: dendrogramWidth,
          marginTop,
          cellSize,
          maxDistance: clusteringDetails.maxDistance
        });
      }

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
        if(labelAngle > 0){
          colLabel.setAttribute('dominant-baseline', 'text-after-edge');
          colLabel.setAttribute('alignment-baseline', 'after-edge');
        }else{
          colLabel.setAttribute('dominant-baseline', 'alphabetic');
        }
        if(labelAngle > 0){
          colLabel.setAttribute('transform', `rotate(${-labelAngle} ${labelX} ${labelY})`);
          colLabel.setAttribute('text-anchor', 'start');
          console.debug('Debug: heatmap vertical column label anchor set', {
            columnIndex: j,
            label: orderedColumns[j].label,
            anchor: 'start',
            labelX,
            labelY,
            columnLabelOffset
          });
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
        clusterMethod: stats.clusterMethod,
        showDendrogram: shouldRenderDendrogram
      });
    }catch(err){
      console.error('heatmap draw error', err);
    }
  }

  function getConfig(){
    return {
      method: refs.method?.value || 'pearson',
      cluster: refs.cluster?.value || 'none',
      showDendrogram: refs.showDendrogram ? !!refs.showDendrogram.checked : false,
      abs: !!refs.absValues?.checked,
      maskLower: !!refs.maskLower?.checked,
      showValues: !!refs.showValues?.checked,
      decimals: clampDecimals(refs.decimals?.value),
      colorNegative: refs.colorNegative?.value || '#313695',
      colorZero: refs.colorZero?.value || '#f7f7f7',
      colorPositive: refs.colorPositive?.value || '#a50026',
      cellSize: Number(refs.cellSize?.value) || 60,
      labelAngle: COLUMN_LABEL_VERTICAL_ANGLE,
      fontSize: Number(refs.fontSize?.value) || 12
    };
  }

  function applyConfig(config){
    if(!config) return;
    if(refs.method) refs.method.value = config.method || 'pearson';
    if(refs.cluster) refs.cluster.value = config.cluster || 'none';
    if(refs.showDendrogram) refs.showDendrogram.checked = config.showDendrogram !== false;
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
    if(refs.labelAngle){
      const incomingAngle = Number(config.labelAngle);
      refs.labelAngle.value = String(COLUMN_LABEL_VERTICAL_ANGLE);
      console.debug('Debug: heatmap label angle config override', {
        incoming: Number.isFinite(incomingAngle) ? incomingAngle : null,
        enforced: COLUMN_LABEL_VERTICAL_ANGLE
      });
    }
    if(refs.fontSize){
      refs.fontSize.value = String(config.fontSize || 12);
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value) });
    }
  }

  function getPayload(){
    const payload = {
      type: 'heatmap',
      data: state.hot ? state.hot.getData() : [],
      config: getConfig()
    };
    console.debug('Debug: heatmap.getPayload captured state', {
      hasHot: !!state.hot,
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      method: payload.config?.method
    });
    return payload;
  }
  heatmap.getPayload = getPayload;

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

