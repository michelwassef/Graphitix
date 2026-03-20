(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const pca = Components.pca = Components.pca || {};
  const Main = global.Main = global.Main || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const plot3d = Shared.plot3d = Shared.plot3d || {};
  if(typeof plot3d.createRotationState !== 'function' && typeof require === 'function'){
    try {
      require('../shared/plot3d.js');
    } catch(err) {
      if(typeof console !== 'undefined' && typeof console.debug === 'function'){
        console.debug('Debug: pca component plot3d helper require failed', { message: err?.message || String(err) });
      }
    }
  }
  if(typeof plot3d.createRotationState !== 'function'){
    plot3d.createRotationState = (defaults) => ({
      x: Number.isFinite(defaults?.x) ? defaults.x : 0,
      y: Number.isFinite(defaults?.y) ? defaults.y : 0
    });
  }
  if(typeof plot3d.attachRotationControls !== 'function'){
    plot3d.attachRotationControls = () => {};
  }
  if(typeof plot3d.rotatePoint !== 'function'){
    plot3d.rotatePoint = (pt) => ({ x: Number(pt?.x) || 0, y: Number(pt?.y) || 0, z: Number(pt?.z) || 0 });
  }
  if(typeof plot3d.createProjector !== 'function'){
    plot3d.createProjector = (options) => {
      const width = Math.max(1, Math.floor(options?.width || 1));
      const height = Math.max(1, Math.floor(options?.height || 1));
      const margin = options?.margin || {};
      const shiftX = Number.isFinite(options?.shiftX) ? options.shiftX : 0;
      const baseX = Number(margin.left || 0) + shiftX;
      const baseY = Number(margin.top || 0);
      const project = (pt = {}) => ({
        x: baseX,
        y: baseY,
        depth: Number(pt.z) || 0
      });
      return {
        project,
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
        scale: 1,
        offsets: { x: baseX, y: baseY },
        plotSize: { width, height }
      };
    };
  }
  if(typeof plot3d.renderAxesAndGrid !== 'function'){
    plot3d.renderAxesAndGrid = () => null;
  }
  if(typeof plot3d.applyLegendPointerGuards !== 'function'){
    plot3d.applyLegendPointerGuards = (el) => {
      if(el && typeof el.addEventListener === 'function'){
        el.addEventListener('pointerdown', evt => evt?.stopPropagation?.());
      }
    };
  }
  if(typeof plot3d.isLegendPointerTarget !== 'function'){
    plot3d.isLegendPointerTarget = () => false;
  }
  if(typeof plot3d.isInteractivePointerTarget !== 'function'){
    plot3d.isInteractivePointerTarget = (target) => plot3d.isLegendPointerTarget(target);
  }
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const exportFontStyles = scopeId => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId)
    : null;
  const importFontStyles = (scopeId, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true });
    }
  };
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  const formControls = Shared.formControls = Shared.formControls || {};
  if((typeof gridControls.show !== 'function' || typeof gridControls.registerGraphElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/gridControls.js');
    }catch(err){
      debugLog('Debug: pca component gridControls helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      debugLog('Debug: pca component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesState = { text: '', open: false, control: null };
  const dataTransformsApi = Shared.dataTransforms = Shared.dataTransforms || {};
  if(typeof dataTransformsApi.applyTransform !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataTransforms.js');
    }catch(err){
      debugLog('Debug: pca component dataTransforms helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      debugLog('Debug: pca component dataViews helper require failed', { message: err?.message || String(err) });
    }
  }
  pca.__installed = true;
  pca.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    debugLog('Debug: pca component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    debugLog('Debug: pca component awaiting Shared.tableImport helpers');
  }

  const NS='http://www.w3.org/2000/svg';
  const DEFAULT_ROWS=100;
  const DEFAULT_COLS=9;
  const DEFAULT_VIEW_MODE='2d';
  const PCA_3D_DEFAULTS={ rotationX: 0.24, rotationY: 1.96, aspectRatio: 4 / 3 };
  const MIN_VARIANCE_WEIGHT = 1e-3;
  const DEFAULT_AXIS_COLOR = '#000000';
  const DEFAULT_GRID_COLOR = '#dddddd';
  const MIN_MINOR_TICK_SUBDIVISIONS = 1;
  const MAX_MINOR_TICK_SUBDIVISIONS = 9;
  const DEFAULT_MINOR_TICK_SUBDIVISIONS = Number.isFinite(chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS)
    ? chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS
    : 3;

  function clampMinorTickSubdivisions(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return DEFAULT_MINOR_TICK_SUBDIVISIONS;
    }
    const rounded = Math.round(numeric);
    return Math.max(MIN_MINOR_TICK_SUBDIVISIONS, Math.min(MAX_MINOR_TICK_SUBDIVISIONS, rounded));
  }
  const DEFAULT_TSNE_SETTINGS = Object.freeze({
    perplexity: 30,
    learningRate: 200,
    iterations: 500,
    earlyExaggeration: 12,
    earlyIterationsFraction: 0.25
  });
  const DEFAULT_UMAP_SETTINGS = Object.freeze({
    neighbors: 15,
    minDist: 0.1,
    learningRate: 1,
    epochs: 400,
    negativeSampleRate: 5
  });
  const palette = Shared.palette = Shared.palette || {};
  if(typeof palette.ensureDefaultScatterColors !== 'function' && typeof require === 'function'){
    try{
      require('../shared/palette.js');
    }catch(err){
      // ignore palette preload failures
    }
  }
  const DEFAULT_SCATTER_COLORS = typeof palette.ensureDefaultScatterColors === 'function'
    ? palette.ensureDefaultScatterColors()
    : (Array.isArray(palette.DEFAULT_SCATTER_COLORS) && palette.DEFAULT_SCATTER_COLORS.length
      ? palette.DEFAULT_SCATTER_COLORS
      : global.DEFAULT_SCATTER_COLORS);
  if(Array.isArray(DEFAULT_SCATTER_COLORS) && DEFAULT_SCATTER_COLORS.length){
    palette.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
    global.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
  }
  const GROUP_SHAPE_OPTIONS = Shared.getShapePickerOptions
    ? Shared.getShapePickerOptions()
    : Object.freeze([
        { value: 'circle', label: 'Circle' },
        { value: 'square', label: 'Square' },
        { value: 'triangle', label: 'Triangle' },
        { value: 'diamond', label: 'Diamond' },
        { value: 'cross', label: 'Cross' }
      ]);
  const GROUP_SHAPE_DEFAULTS = GROUP_SHAPE_OPTIONS.map(opt => opt.value);
  const GROUP_SHAPE_VALUES = Shared.getShapePickerValues
    ? Shared.getShapePickerValues()
    : new Set(GROUP_SHAPE_DEFAULTS);
  const PCA_DEFAULT_TITLES = Object.freeze({
    pca: 'PCA Plot',
    mds: 'MDS Plot',
    tsne: 't-SNE Plot',
    umap: 'UMAP Plot'
  });
  const PCA_DATA_VIEW_MAX = 12;
  const PCA_TRANSFORM_SCOPE_DEFAULT = Object.freeze({
    headerRows: 2,
    startCol: 1
  });
  const PCA_FAST_POINT_THRESHOLD = 20000;
  const PCA_LOADINGS_ROW_LIMIT = 100;
  const PCA_DEFAULT_COMPONENT_SELECTION_RULE = 'parallel';
  const PCA_DEFAULT_EIGEN_THRESHOLD = 1;
  const PCA_DEFAULT_PARALLEL_ITERATIONS = 200;
  const PCA_MAX_PARALLEL_ITERATIONS = 500;
  const PCA_PARALLEL_MAX_CELLS = 40000;
  const PCA_BIPLOT_POINT_LIMIT = 120;
  const PCA_BIPLOT_VECTOR_LIMIT = 8;
  const PCA_COMPONENT_SELECTION_RULES = Object.freeze([
    { value: 'parallel', label: 'Parallel analysis' },
    { value: 'kaiser', label: 'Kaiser > 1' },
    { value: 'threshold', label: 'Eigenvalue threshold' },
    { value: 'all', label: 'Show all components' }
  ]);
  const PCA_SVD_WORKER = {
    url: 'js/workers/pca.worker.js',
    minSamples: 50,
    minFeatures: 50,
    minCells: 20000,
    timeoutMs: 30000
  };
  const PCA_EMBED_WORKER = {
    url: 'js/workers/pca-embed.worker.js',
    minSamples: 150,
    minCells: 40000,
    timeoutMs: 60000
  };
  const PCA_POINT_LABEL_ROW_HEADER = 'Label point';
  const PCA_POINT_LABEL_MARK = '✓';
  const PCA_LABEL_ROW_INDEX = 0;
  const PCA_GROUP_ROW_INDEX = 1;
  const PCA_HEADER_ROW_INDEX = 1;
  const PCA_GROUPED_SAMPLE_ROW_INDEX = 2;
  const PCA_GROUP_ROW_HEADER = 'Group';
  const PCA_SAMPLE_ROW_HEADER = 'Sample';

  function resolvePcaMethodNameForUi(methodValue){
    const normalized = String(methodValue || '').trim().toLowerCase();
    if(normalized === 'mds' || normalized === 'tsne' || normalized === 'umap'){
      return normalized;
    }
    return 'pca';
  }

  function applyPcaMethodUiPreActivation(config = {}){
    const methodName = resolvePcaMethodNameForUi(config?.method);
    const supports3d = methodName === 'pca' || methodName === 'mds';
    const requestedView = String(config?.viewMode || DEFAULT_VIEW_MODE).trim().toLowerCase();
    const viewMode = supports3d ? (requestedView === '3d' ? '3d' : '2d') : '2d';

    const tsneControls = global.document?.getElementById?.('pcaTsneControls');
    if(tsneControls){
      const showTsne = methodName === 'tsne';
      tsneControls.hidden = !showTsne;
      tsneControls.style.display = showTsne ? '' : 'none';
    }

    const umapControls = global.document?.getElementById?.('pcaUmapControls');
    if(umapControls){
      const showUmap = methodName === 'umap';
      umapControls.hidden = !showUmap;
      umapControls.style.display = showUmap ? '' : 'none';
    }

    const viewModeSelect = global.document?.getElementById?.('pcaViewMode');
    if(viewModeSelect && viewModeSelect.options){
      Array.from(viewModeSelect.options).forEach(opt => {
        if(opt && opt.value === '3d'){
          opt.disabled = !supports3d;
          opt.hidden = !supports3d;
        }
      });
      viewModeSelect.value = viewMode;
    }

    const axis3dControl = global.document?.getElementById?.('pcaAxis3DControl');
    if(axis3dControl){
      const show3dAxis = viewMode === '3d';
      axis3dControl.hidden = !show3dAxis;
      axis3dControl.style.display = show3dAxis ? '' : 'none';
    }
  }

  function normalizePcaLabelHeader(value){
    return String(value ?? '').trim().toLowerCase();
  }

  function normalizePcaMetaHeader(value){
    return String(value ?? '').trim().toLowerCase();
  }

  function isPcaGroupRowHeader(value){
    const normalized = normalizePcaMetaHeader(value);
    return normalized === 'group' || normalized === 'groups';
  }

  function isPcaSampleRowHeader(value){
    const normalized = normalizePcaMetaHeader(value);
    return normalized === 'sample'
      || normalized === 'samples'
      || normalized === 'variable'
      || normalized === 'variables';
  }

  function isPcaGroupedModeActive(options = {}){
    if(options.forceGrouped === true){
      return true;
    }
    if(options.forceStandard === true){
      return false;
    }
    const format = options.tableFormat ?? pcaState?.tableFormat;
    return format === 'grouped';
  }

  function getPcaHeaderRowIndexForMode(options = {}){
    return isPcaGroupedModeActive(options) ? PCA_GROUPED_SAMPLE_ROW_INDEX : PCA_HEADER_ROW_INDEX;
  }

  function getPcaPinnedMetaRowCountForMode(options = {}){
    return getPcaHeaderRowIndexForMode(options) + 1;
  }

  function isPcaLabelRowHeader(value){
    const normalized = normalizePcaLabelHeader(value);
    const base = normalizePcaLabelHeader(PCA_POINT_LABEL_ROW_HEADER);
    return normalized === base
      || normalized === `${base}s`
      || normalized === 'labelpoint';
  }

  function parsePcaPointLabelFlag(value){
    if(value === null || value === undefined){
      return false;
    }
    if(typeof value === 'boolean'){
      return value;
    }
    if(typeof value === 'number'){
      return Number.isFinite(value) && value !== 0;
    }
    const text = String(value).trim();
    if(!text){
      return false;
    }
    if(text === PCA_POINT_LABEL_MARK){
      return true;
    }
    const normalized = text.toLowerCase();
    return normalized === '1'
      || normalized === 'true'
      || normalized === 'yes'
      || normalized === 'y'
      || normalized === 'x';
  }

  function resolvePcaLabelRowIndex(data, options = {}){
    if(!Array.isArray(data) || !data.length){
      return null;
    }
    const maxMetaRow = getPcaHeaderRowIndexForMode(options);
    for(let rowIndex = 0; rowIndex <= maxMetaRow; rowIndex += 1){
      const row = Array.isArray(data[rowIndex]) ? data[rowIndex] : null;
      if(row && isPcaLabelRowHeader(row[0])){
        return rowIndex;
      }
    }
    return null;
  }

  function resolvePcaHeaderRowIndex(data, labelRowIndex, options = {}){
    const preferredHeader = getPcaHeaderRowIndexForMode(options);
    if(!Array.isArray(data) || !data.length){
      return preferredHeader;
    }
    if(labelRowIndex === preferredHeader){
      return preferredHeader === PCA_GROUPED_SAMPLE_ROW_INDEX
        ? PCA_HEADER_ROW_INDEX
        : PCA_GROUPED_SAMPLE_ROW_INDEX;
    }
    return preferredHeader;
  }

  function resolvePcaDataStartRow(labelRowIndex, headerRowIndex, options = {}){
    const headerIdx = Number.isInteger(headerRowIndex)
      ? headerRowIndex
      : getPcaHeaderRowIndexForMode(options);
    const groupedActive = isPcaGroupedModeActive(options);
    const groupIdx = groupedActive ? PCA_GROUP_ROW_INDEX : -1;
    const labelIdx = Number.isInteger(labelRowIndex) ? labelRowIndex : -1;
    return Math.max(headerIdx, groupIdx, labelIdx) + 1;
  }

  function normalizePcaLabelRowValues(values, colCount){
    const length = Math.max(1, colCount | 0);
    const normalized = new Array(length).fill(false);
    normalized[0] = PCA_POINT_LABEL_ROW_HEADER;
    if(Array.isArray(values)){
      for(let c = 1; c < length; c += 1){
        normalized[c] = parsePcaPointLabelFlag(values[c]);
      }
    }
    return normalized;
  }

  function getPcaPinnedTopRowCount(hot){
    const count = Number.isFinite(hot?.gridApi?.getPinnedTopRowCount?.())
      ? hot.gridApi.getPinnedTopRowCount()
      : getPcaPinnedMetaRowCountForMode();
    return Math.max(0, count | 0);
  }

  function isPcaPinnedRow(hot, rowIndex){
    const count = getPcaPinnedTopRowCount(hot);
    return Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < count;
  }

  function applyPcaRowValues(hot, rowIndex, values, options = {}){
    if(!hot || !Number.isInteger(rowIndex)){
      return false;
    }
    const data = hot.getData?.() || [];
    const colCount = typeof hot.countCols === 'function'
      ? hot.countCols()
      : (Array.isArray(data[0]) ? data[0].length : 0);
    if(colCount <= 0){
      return false;
    }
    const source = options.source || 'pca-row-values';
    const render = options.render !== false;
    if(isPcaPinnedRow(hot, rowIndex)){
      if(!Array.isArray(data[rowIndex])){
        data[rowIndex] = [];
      }
      for(let c = 0; c < colCount; c += 1){
        data[rowIndex][c] = (Array.isArray(values) && c < values.length) ? values[c] : '';
      }
      if(render && typeof hot.render === 'function'){
        hot.render();
      }
      return true;
    }
    if(typeof hot.setDataAtCell !== 'function'){
      return false;
    }
    const changes = [];
    for(let c = 0; c < colCount; c += 1){
      changes.push([rowIndex, c, (Array.isArray(values) && c < values.length) ? values[c] : '']);
    }
    if(changes.length){
      hot.setDataAtCell(changes, source);
      return true;
    }
    return false;
  }

  function applyPcaCellValue(hot, rowIndex, colIndex, value, options = {}){
    if(!hot || !Number.isInteger(rowIndex) || !Number.isInteger(colIndex)){
      return false;
    }
    const data = hot.getData?.() || [];
    const source = options.source || 'pca-cell-value';
    const render = options.render !== false;
    if(isPcaPinnedRow(hot, rowIndex)){
      if(!Array.isArray(data[rowIndex])){
        data[rowIndex] = [];
      }
      data[rowIndex][colIndex] = value;
      if(render && typeof hot.render === 'function'){
        hot.render();
      }
      return true;
    }
    if(typeof hot.setDataAtCell !== 'function'){
      return false;
    }
    hot.setDataAtCell([[rowIndex, colIndex, value]], source);
    return true;
  }

  function isPcaCellEmpty(value){
    if(value === null || value === undefined){
      return true;
    }
    const text = String(value).trim();
    return text === '';
  }

  function pcaRowHasContent(row, startCol = 0){
    if(!Array.isArray(row)){
      return false;
    }
    for(let c = Math.max(0, startCol); c < row.length; c += 1){
      if(!isPcaCellEmpty(row[c])){
        return true;
      }
    }
    return false;
  }

  function ensurePcaEmptyTableDefaults(hot, options = {}){
    if(!hot || typeof hot.getData !== 'function'){
      return false;
    }
    const data = hot.getData() || [];
    const colCount = typeof hot.countCols === 'function'
      ? hot.countCols()
      : (Array.isArray(data[0]) ? data[0].length : 0);
    if(colCount <= 0){
      return false;
    }
    const groupedActive = isPcaGroupedModeActive();
    const labelRowIndex = resolvePcaLabelRowIndex(data, { forceGrouped: groupedActive });
    const headerRowIndex = resolvePcaHeaderRowIndex(data, labelRowIndex, { forceGrouped: groupedActive });
    const dataStartRow = resolvePcaDataStartRow(labelRowIndex, headerRowIndex, { forceGrouped: groupedActive });
    let hasData = false;
    for(let r = dataStartRow; r < data.length; r += 1){
      const row = Array.isArray(data[r]) ? data[r] : [];
      for(let c = 0; c < row.length; c += 1){
        if(!isPcaCellEmpty(row[c])){
          hasData = true;
          break;
        }
      }
      if(hasData){
        break;
      }
    }
    const groupRow = groupedActive && Array.isArray(data[PCA_GROUP_ROW_INDEX]) ? data[PCA_GROUP_ROW_INDEX] : [];
    const sampleRow = Number.isInteger(headerRowIndex) && Array.isArray(data[headerRowIndex]) ? data[headerRowIndex] : [];
    const headerHasValue = groupedActive
      ? (pcaRowHasContent(groupRow, 1) || pcaRowHasContent(sampleRow, 1))
      : pcaRowHasContent(sampleRow, 1);
    if(hasData || headerHasValue){
      return false;
    }
    const labelRowValues = normalizePcaLabelRowValues(null, colCount);
    const headerRowValues = new Array(colCount).fill('');
    headerRowValues[0] = groupedActive ? PCA_SAMPLE_ROW_HEADER : 'Variable';
    const source = options.source || 'pca-empty-defaults';
    const labelApplied = applyPcaRowValues(hot, PCA_LABEL_ROW_INDEX, labelRowValues, { source, render: false });
    let groupApplied = false;
    if(groupedActive){
      const groupRowValues = new Array(colCount).fill('');
      groupRowValues[0] = PCA_GROUP_ROW_HEADER;
      groupApplied = applyPcaRowValues(hot, PCA_GROUP_ROW_INDEX, groupRowValues, { source, render: false });
    }
    const headerApplied = applyPcaRowValues(hot, headerRowIndex, headerRowValues, { source, render: false });
    if((labelApplied || groupApplied || headerApplied) && typeof hot.render === 'function'){
      hot.render();
    }
    return labelApplied || groupApplied || headerApplied;
  }

  function ensurePcaLabelRow(hot, options = {}){
    if(!hot || typeof hot.getData !== 'function'){
      return false;
    }
    const data = hot.getData() || [];
    const colCount = typeof hot.countCols === 'function'
      ? hot.countCols()
      : (Array.isArray(data[0]) ? data[0].length : 0);
    if(colCount <= 0){
      return false;
    }
    const source = options.source || 'pca-label-row';
    const groupedActive = isPcaGroupedModeActive();
    const setRowValues = (rowIndex, values)=>{
      if(!Array.isArray(values)){
        return;
      }
      applyPcaRowValues(hot, rowIndex, values, { source, render: false });
    };
    if(!groupedActive){
      const row0 = Array.isArray(data[PCA_LABEL_ROW_INDEX]) ? data[PCA_LABEL_ROW_INDEX] : null;
      if(row0 && isPcaLabelRowHeader(row0[0])){
        if(row0[0] !== PCA_POINT_LABEL_ROW_HEADER){
          const updated = applyPcaCellValue(hot, PCA_LABEL_ROW_INDEX, 0, PCA_POINT_LABEL_ROW_HEADER, { source, render: true });
          return !!updated;
        }
        return false;
      }
      const row1 = Array.isArray(data[PCA_HEADER_ROW_INDEX]) ? data[PCA_HEADER_ROW_INDEX] : null;
      if(row1 && isPcaLabelRowHeader(row1[0])){
        const headerRow = Array.isArray(data[PCA_LABEL_ROW_INDEX]) ? data[PCA_LABEL_ROW_INDEX] : [];
        const nextLabelRow = normalizePcaLabelRowValues(row1, colCount);
        const nextHeaderRow = new Array(colCount).fill('');
        for(let c = 0; c < colCount; c += 1){
          if(headerRow[c] !== undefined){
            nextHeaderRow[c] = headerRow[c];
          }
        }
        setRowValues(PCA_LABEL_ROW_INDEX, nextLabelRow);
        setRowValues(PCA_HEADER_ROW_INDEX, nextHeaderRow);
        if(typeof hot.render === 'function'){
          hot.render();
        }
        return true;
      }
      if(typeof hot.alter === 'function'){
        hot.alter('insert_row_above', PCA_LABEL_ROW_INDEX, 1, source);
      }
      setRowValues(PCA_LABEL_ROW_INDEX, normalizePcaLabelRowValues(null, colCount));
      if(typeof hot.render === 'function'){
        hot.render();
      }
      return true;
    }

    let changed = false;
    let workingData = data;
    let labelRowIndex = resolvePcaLabelRowIndex(workingData, { forceGrouped: true });
    if(!Number.isInteger(labelRowIndex)){
      if(typeof hot.alter === 'function'){
        hot.alter('insert_row_above', PCA_LABEL_ROW_INDEX, 1, source);
      }
      changed = true;
      workingData = hot.getData() || [];
      labelRowIndex = PCA_LABEL_ROW_INDEX;
    }else if(labelRowIndex !== PCA_LABEL_ROW_INDEX){
      const row0Current = Array.isArray(workingData[PCA_LABEL_ROW_INDEX])
        ? workingData[PCA_LABEL_ROW_INDEX].slice(0, colCount)
        : new Array(colCount).fill('');
      const labelValues = normalizePcaLabelRowValues(workingData[labelRowIndex], colCount);
      setRowValues(PCA_LABEL_ROW_INDEX, labelValues);
      setRowValues(labelRowIndex, row0Current);
      changed = true;
      workingData = hot.getData() || [];
    }

    const normalizedLabelRow = normalizePcaLabelRowValues(workingData[PCA_LABEL_ROW_INDEX], colCount);
    const currentLabelRow = Array.isArray(workingData[PCA_LABEL_ROW_INDEX]) ? workingData[PCA_LABEL_ROW_INDEX] : [];
    const needsLabelNormalize = normalizedLabelRow.some((value, idx) => value !== currentLabelRow[idx]);
    if(needsLabelNormalize){
      setRowValues(PCA_LABEL_ROW_INDEX, normalizedLabelRow);
      changed = true;
      workingData = hot.getData() || [];
    }

    const existingRow1 = Array.isArray(workingData[PCA_GROUP_ROW_INDEX]) ? workingData[PCA_GROUP_ROW_INDEX] : [];
    const row1LooksGroup = isPcaGroupRowHeader(existingRow1[0]);
    const row1LooksSample = isPcaSampleRowHeader(existingRow1[0]);
    const row1HasSampleContent = pcaRowHasContent(existingRow1, 1);
    if(!row1LooksGroup && (row1LooksSample || row1HasSampleContent)){
      if(typeof hot.alter === 'function'){
        hot.alter('insert_row_above', PCA_GROUP_ROW_INDEX, 1, source);
      }
      changed = true;
      workingData = hot.getData() || [];
    }

    if((workingData.length || 0) <= PCA_GROUP_ROW_INDEX && typeof hot.alter === 'function'){
      hot.alter('insert_row_above', PCA_GROUP_ROW_INDEX, 1, source);
      changed = true;
      workingData = hot.getData() || [];
    }
    if((workingData.length || 0) <= PCA_GROUPED_SAMPLE_ROW_INDEX && typeof hot.alter === 'function'){
      hot.alter('insert_row_above', PCA_GROUPED_SAMPLE_ROW_INDEX, 1, source);
      changed = true;
      workingData = hot.getData() || [];
    }

    const groupRow = Array.isArray(workingData[PCA_GROUP_ROW_INDEX])
      ? workingData[PCA_GROUP_ROW_INDEX].slice(0, colCount)
      : new Array(colCount).fill('');
    if(String(groupRow[0] ?? '').trim() !== PCA_GROUP_ROW_HEADER){
      groupRow[0] = PCA_GROUP_ROW_HEADER;
      setRowValues(PCA_GROUP_ROW_INDEX, groupRow);
      changed = true;
      workingData = hot.getData() || [];
    }

    const sampleRow = Array.isArray(workingData[PCA_GROUPED_SAMPLE_ROW_INDEX])
      ? workingData[PCA_GROUPED_SAMPLE_ROW_INDEX].slice(0, colCount)
      : new Array(colCount).fill('');
    if(!isPcaSampleRowHeader(sampleRow[0])){
      sampleRow[0] = PCA_SAMPLE_ROW_HEADER;
      setRowValues(PCA_GROUPED_SAMPLE_ROW_INDEX, sampleRow);
      changed = true;
    }

    if(changed && typeof hot.render === 'function'){
      hot.render();
    }
    return changed;
  }

  function PcaLabelCheckboxRenderer(){}
  PcaLabelCheckboxRenderer.prototype.init = function(params){
    this.params = params;
    const doc = params?.eGridCell?.ownerDocument || global.document;
    const wrapper = doc.createElement('span');
    wrapper.className = 'ag-checkbox-input-wrapper';
    wrapper.style.position = 'relative';
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.className = 'ag-checkbox-input';
    input.tabIndex = -1;
    // Label toggling is driven by table selection (afterSelectionEnd),
    // so the renderer remains visual-only to avoid AG Grid event conflicts.
    input.style.pointerEvents = 'none';
    wrapper.style.pointerEvents = 'none';
    wrapper.appendChild(input);
    this.eGui = wrapper;
    this.input = input;
    this.syncState = value => {
      const checked = parsePcaPointLabelFlag(value);
      input.checked = checked;
      wrapper.classList.toggle('ag-checked', checked);
    };
    this.syncState(params?.value);
  };
  PcaLabelCheckboxRenderer.prototype.getGui = function(){
    return this.eGui;
  };
  PcaLabelCheckboxRenderer.prototype.refresh = function(params){
    this.params = params;
    if(this.syncState){
      this.syncState(params?.value);
      return true;
    }
    return false;
  };

  function parsePcaAgVisualRowIndex(value){
    if(Number.isInteger(value) && value >= 0){
      return value;
    }
    if(typeof value !== 'string'){
      return null;
    }
    const trimmed = value.trim();
    if(!trimmed){
      return null;
    }
    if(/^\d+$/.test(trimmed)){
      const direct = Number(trimmed);
      return Number.isInteger(direct) && direct >= 0 ? direct : null;
    }
    const prefixed = trimmed.match(/^[A-Za-z][A-Za-z0-9_-]*-(\d+)$/);
    if(prefixed){
      const parsed = Number(prefixed[1]);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }
    const suffixed = trimmed.match(/^[A-Za-z][A-Za-z0-9_-]*(\d+)$/);
    if(suffixed){
      const parsed = Number(suffixed[1]);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }
    return null;
  }

  function getDefaultTitleForMethod(method){
    const key = typeof method === 'string' ? method.toLowerCase() : '';
    return PCA_DEFAULT_TITLES[key] || 'Dimension Reduction Plot';
  }

  const pcaRefs = {};
  const pcaOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'pca',
    message: 'Rendering PCA workspace...',
    getHost: () => (
      pcaSvgBoxRef
      || global.document?.getElementById?.('pcaGraphPanel')?.querySelector?.('.svgbox')
      || global.document?.getElementById?.('pcaGraphPanel')
    )
  });

  function markPcaOverlayPending(reason){
    pcaOverlayController?.markPending(reason);
    debugLog('Debug: pca overlay pending flagged',{ reason: reason || 'data-change' });
  }

  function queuePcaOverlay(reason, options = {}){
    return pcaOverlayController?.queue(reason, options) || false;
  }

  function resolvePcaOverlay(reason){
    pcaOverlayController?.resolve(reason);
  }

  function forcePcaOverlay(reason, options = {}){
    return pcaOverlayController?.force(reason, options) || false;
  }
  let pcaTooltipEl = null;
  let pcaShowPointFormatControls = null;
  let pcaLegendControl = null;
  let pcaShowLegendInput = null;
  let pcaEqualAxesInput = null;
  let pcaEqualScaleAxesInput = null;
  let pcaLockRatioInput = null;
  let pcaVarianceAxisScaleInput = null;
  let pcaViewModeInput = null;
  let pcaSvgBoxRef = null;
  let pcaPointContextMenu = null;
  let pcaPointContextMenuGlobalBound = false;
  let pcaRenderRowEl = null;
  let pcaRenderButtonEl = null;
  let pcaAutoDrawNoticeEl = null;
  let syncPcaAutoDrawNoticeWidth = () => {};
  let schedulePcaNoticeWidth = () => {};
  let pcaHotInstance = null;
  let pcaDataViewsManager = null;
  let pcaDataToolbarBound = false;
  let pcaDataToolbarLastActivation = 0;
  let pcaAxesLengthLockRatioPrevious = null;
  let pcaAspectSyncing = false;

  function ensurePcaGroupedDefaults(){
    if(!pcaState.grouped || typeof pcaState.grouped !== 'object'){
      pcaState.grouped = { replicatesPerGroup: 2, colors: [], shapes: [] };
    }
    let replicates = Number(pcaState.grouped.replicatesPerGroup);
    if(!Number.isFinite(replicates) || replicates < 1){
      replicates = 1;
    }
    pcaState.grouped.replicatesPerGroup = Math.max(1, Math.round(replicates));
    if(!Array.isArray(pcaState.grouped.colors)){
      pcaState.grouped.colors = [];
    }
    if(!Array.isArray(pcaState.grouped.shapes)){
      pcaState.grouped.shapes = [];
    }
    debugLog('Debug: pca ensureGroupedDefaults',{ replicates: pcaState.grouped.replicatesPerGroup });
  }

  function inferPcaGroupBaseName(rawValue, fallback){
    const fallbackLabel = typeof fallback === 'string' && fallback.trim() ? fallback.trim() : 'Group 1';
    const source = rawValue == null ? '' : String(rawValue).trim();
    if(!source){
      return fallbackLabel;
    }
    if(/^group\s*\d+\s*$/i.test(source)){
      return source.replace(/\s+/g, ' ').trim();
    }
    let normalized = source.replace(/\s+title\s*$/i, '').trim();
    if(!normalized){
      normalized = source;
    }
    if(/^condition\s*\d+$/i.test(normalized) || /^col(?:umn)?\s*\d+$/i.test(normalized) || /^rep(?:licate)?\s*\d+$/i.test(normalized)){
      return fallbackLabel;
    }
    return normalized;
  }

  function normalizePcaGroupHeaderAnchor(rawValue){
    const source = rawValue == null ? '' : String(rawValue).trim();
    if(!source){
      return '';
    }
    if(/^condition\s*\d+$/i.test(source) || /^col(?:umn)?\s*\d+$/i.test(source) || /^rep(?:licate)?\s*\d+$/i.test(source)){
      return '';
    }
    if(/^group\s*\d+\s*title$/i.test(source)){
      return '';
    }
    const titleMatch = source.match(/^(.*\S)\s+title$/i);
    if(titleMatch){
      const stripped = titleMatch[1].trim();
      if(!stripped || /^group\s*\d+$/i.test(stripped)){
        return '';
      }
      return stripped;
    }
    return source;
  }

  function getPcaGroupedReplicateCount(options = {}){
    const candidate = options.replicates ?? pcaState.grouped?.replicatesPerGroup;
    const raw = Number(candidate);
    if(!Number.isFinite(raw) || raw < 1){
      return 1;
    }
    return Math.max(1, Math.round(raw));
  }

  function getPcaGroupedGroupCount(sampleColCount, replicates){
    const safeSampleCols = Math.max(0, Number(sampleColCount) || 0);
    const safeReplicates = Math.max(1, Number(replicates) || 1);
    if(safeSampleCols <= 0){
      return 1;
    }
    return Math.max(1, Math.ceil(safeSampleCols / safeReplicates));
  }

  function getPcaGroupedHeaderInfo(colIndex, hotInstance, options = {}){
    const col = Number(colIndex);
    if(!Number.isInteger(col) || col < 1){
      return null;
    }
    const groupedActive = options.forceGrouped === true ? true : pcaState.tableFormat === 'grouped';
    if(!groupedActive){
      return null;
    }
    ensurePcaGroupedDefaults();
    const hot = hotInstance || ensurePcaHotForActiveTab();
    const totalCols = hot && typeof hot.countCols === 'function' ? hot.countCols() : 0;
    if(totalCols <= 1 || col >= totalCols){
      return null;
    }
    const replicates = getPcaGroupedReplicateCount(options);
    const sampleColCount = Math.max(0, totalCols - 1);
    const groupCount = getPcaGroupedGroupCount(sampleColCount, replicates);
    const offset = col - 1;
    const groupIndex = Math.floor(offset / replicates);
    if(groupIndex < 0 || groupIndex >= groupCount){
      return null;
    }
    const startCol = 1 + groupIndex * replicates;
    const span = Math.max(1, Math.min(replicates, totalCols - startCol));
    const position = col - startCol;
    if(position < 0 || position >= span){
      return null;
    }
    const role = position === 0 ? 'groupAnchor' : 'groupFollower';
    let segment = 'single';
    if(role === 'groupAnchor'){
      segment = span > 1 ? 'start' : 'single';
    }else{
      segment = position === span - 1 ? 'end' : 'middle';
    }
    return { groupIndex, span, role, segment, startCol };
  }

  function getPcaGroupedHeaderCellRole(colIndex, hotInstance, options = {}){
    const info = getPcaGroupedHeaderInfo(colIndex, hotInstance, options);
    return info ? info.role : null;
  }

  function getPcaGroupedHeaderMergeSegment(colIndex, hotInstance, options = {}){
    const info = getPcaGroupedHeaderInfo(colIndex, hotInstance, options);
    return info ? info.segment : null;
  }

  function getPcaGroupedHeaderEntries(hotInstance, options = {}){
    const hot = hotInstance || ensurePcaHotForActiveTab();
    const replicates = getPcaGroupedReplicateCount(options);
    const data = Array.isArray(options.dataMatrix)
      ? options.dataMatrix
      : (hot?.getData ? (hot.getData() || []) : []);
    const headerRow = Array.isArray(data[PCA_GROUP_ROW_INDEX]) ? data[PCA_GROUP_ROW_INDEX] : [];
    const totalCols = Number.isInteger(options.colCount)
      ? options.colCount
      : (typeof hot?.countCols === 'function' ? hot.countCols() : headerRow.length);
    const sampleCols = Math.max(0, totalCols - 1);
    const minGroupCount = Number(options.minGroupCount);
    const groupCount = Number.isFinite(minGroupCount) && minGroupCount > 0
      ? Math.max(1, Math.floor(minGroupCount))
      : getPcaGroupedGroupCount(sampleCols, replicates);
    const entries = [];
    for(let groupIndex = 0; groupIndex < groupCount; groupIndex += 1){
      const startCol = 1 + groupIndex * replicates;
      if(startCol >= totalCols){
        break;
      }
      const rawTitle = headerRow[startCol] != null ? String(headerRow[startCol]).trim() : '';
      const fallback = `Group ${groupIndex + 1}`;
      const baseLabel = inferPcaGroupBaseName(rawTitle, fallback);
      entries.push({
        groupIndex,
        startCol,
        colspan: Math.max(1, Math.min(replicates, totalCols - startCol)),
        label: baseLabel || fallback
      });
    }
    return entries;
  }

  function normalizePcaGroupedHeaderRow(hotInstance, options = {}){
    const hot = hotInstance || ensurePcaHotForActiveTab();
    if(!hot || typeof hot.getData !== 'function' || typeof hot.setDataAtCell !== 'function'){
      return false;
    }
    const groupedActive = options.forceGrouped === true ? true : pcaState.tableFormat === 'grouped';
    if(!groupedActive){
      return false;
    }
    const data = hot.getData() || [];
    const headerRow = Array.isArray(data[PCA_GROUP_ROW_INDEX]) ? data[PCA_GROUP_ROW_INDEX] : [];
    const replicates = getPcaGroupedReplicateCount(options);
    const colCount = typeof hot.countCols === 'function' ? hot.countCols() : headerRow.length;
    const groupEntries = getPcaGroupedHeaderEntries(hot, {
      replicates,
      colCount,
      dataMatrix: data
    });
    const targetCols = Math.max(colCount, 1 + groupEntries.length * replicates);
    const changes = [];
    for(let col = headerRow.length; col < targetCols; col += 1){
      changes.push([PCA_GROUP_ROW_INDEX, col, '']);
    }
    groupEntries.forEach((entry) => {
      const currentRaw = headerRow[entry.startCol] != null ? String(headerRow[entry.startCol]).trim() : '';
      const nextAnchor = normalizePcaGroupHeaderAnchor(currentRaw);
      if(currentRaw !== nextAnchor){
        changes.push([PCA_GROUP_ROW_INDEX, entry.startCol, nextAnchor]);
      }
      for(let repIndex = 1; repIndex < replicates; repIndex += 1){
        const followerCol = entry.startCol + repIndex;
        if(followerCol >= targetCols){
          break;
        }
        const followerValue = headerRow[followerCol];
        if(followerValue != null && String(followerValue).trim() !== ''){
          changes.push([PCA_GROUP_ROW_INDEX, followerCol, '']);
        }
      }
    });
    if(!changes.length){
      return false;
    }
    hot.setDataAtCell(changes, options.source || 'pca-grouped-header-normalize');
    debugLog('Debug: pca grouped header row normalized', {
      changes: changes.length,
      replicates,
      groupCount: groupEntries.length
    });
    return true;
  }

  function buildPcaGroupedAgColHeaders(hotInstance, options = {}){
    const pcaHot = hotInstance || ensurePcaHotForActiveTab();
    if(!pcaHot || typeof pcaHot.countCols !== 'function'){
      return true;
    }
    const groupedActive = options.forceGrouped === true ? true : pcaState.tableFormat === 'grouped';
    if(!groupedActive){
      return true;
    }
    const totalCols = Math.max(0, pcaHot.countCols());
    if(totalCols <= 0){
      return true;
    }
    const headers = new Array(totalCols).fill('');
    headers[0] = '';
    for(let col = 1; col < totalCols; col += 1){
      const info = getPcaGroupedHeaderInfo(col, pcaHot, { forceGrouped: true, ...options });
      if(!info){
        headers[col] = '';
        continue;
      }
      headers[col] = info.role === 'groupAnchor'
        ? `Group ${info.groupIndex + 1}`
        : ' ';
    }
    return headers;
  }

  function updatePcaGroupedHeaders(hotInstance){
    const pcaHot = hotInstance || ensurePcaHotForActiveTab();
    if(!pcaHot){
      debugLog('Debug: pca updateGroupedHeaders skipped',{ reason: 'no-hot' });
      return;
    }
    const hotRoot = pcaHot.rootElement
      || pcaHot.__pcaHostContainer
      || global.document?.getElementById?.('pcaHot');
    if(hotRoot?.classList){
      hotRoot.classList.remove('pca-grouped-nested-only');
    }
    if(hotRoot?.style){
      if(pcaState.tableFormat === 'grouped'){
        const replicates = getPcaGroupedReplicateCount();
        hotRoot.style.setProperty('--scatter-group-span', String(replicates));
      }else{
        hotRoot.style.removeProperty('--scatter-group-span');
      }
    }
    if(pcaState.tableFormat !== 'grouped'){
      pcaHot.updateSettings({
        nestedHeaders: false,
        colHeaders: true,
        headerRowIndex: PCA_HEADER_ROW_INDEX,
        pinFirstRow: getPcaPinnedMetaRowCountForMode({ forceStandard: true })
      });
      return;
    }
    normalizePcaGroupedHeaderRow(pcaHot, { forceGrouped: true, source: 'pca-grouped-header-normalize' });
    const headers = buildPcaGroupedAgColHeaders(pcaHot, { forceGrouped: true });
    pcaHot.updateSettings({
      nestedHeaders: false,
      colHeaders: headers,
      headerRowIndex: getPcaHeaderRowIndexForMode({ forceGrouped: true }),
      pinFirstRow: getPcaPinnedMetaRowCountForMode({ forceGrouped: true })
    });
    debugLog('Debug: pca grouped headers applied',{ headers, totalCols: pcaHot.countCols() });
  }

  function applyPcaTableFormatToHot(){
    const pcaHot = ensurePcaHotForActiveTab();
    if(!pcaHot){
      return;
    }
    if(pcaState.tableFormat === 'grouped'){
      ensurePcaLabelRow(pcaHot, { source: 'pca-grouped-metadata' });
      normalizePcaGroupedHeaderRow(pcaHot, { forceGrouped: true, source: 'pca-grouped-header-normalize' });
      updatePcaGroupedHeaders(pcaHot);
    }else{
      if(typeof pcaHot.getData === 'function' && typeof pcaHot.alter === 'function'){
        const currentData = pcaHot.getData() || [];
        const row1 = Array.isArray(currentData[PCA_GROUP_ROW_INDEX]) ? currentData[PCA_GROUP_ROW_INDEX] : null;
        const row2 = Array.isArray(currentData[PCA_GROUPED_SAMPLE_ROW_INDEX]) ? currentData[PCA_GROUPED_SAMPLE_ROW_INDEX] : null;
        const shouldCollapseGroupedRows = !!row1
          && isPcaGroupRowHeader(row1[0])
          && !!row2
          && (isPcaSampleRowHeader(row2[0]) || pcaRowHasContent(row2, 1));
        if(shouldCollapseGroupedRows){
          pcaHot.alter('remove_row', PCA_GROUP_ROW_INDEX, 1, 'pca-standard-metadata-normalize');
        }
      }
      ensurePcaLabelRow(pcaHot, { source: 'pca-standard-metadata' });
      const standardHeader = pcaHot.getData?.()?.[PCA_HEADER_ROW_INDEX];
      if(Array.isArray(standardHeader) && String(standardHeader[0] ?? '').trim() !== 'Variable'){
        applyPcaCellValue(pcaHot, PCA_HEADER_ROW_INDEX, 0, 'Variable', { source: 'pca-standard-metadata', render: false });
      }
      pcaHot.updateSettings({
        nestedHeaders: false,
        colHeaders: true,
        headerRowIndex: PCA_HEADER_ROW_INDEX,
        pinFirstRow: getPcaPinnedMetaRowCountForMode({ forceStandard: true })
      });
      debugLog('Debug: pca grouped headers cleared');
    }
  }

  function createPcaTableInstance(container){
    if(!container || typeof Shared.hot?.createStandardTable !== 'function'){
      return null;
    }
    const pcaData = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
    if(Array.isArray(pcaData[0])){
      pcaData[0][0] = PCA_POINT_LABEL_ROW_HEADER;
      for(let c = 1; c < pcaData[0].length; c += 1){
        pcaData[0][c] = false;
      }
    }
    debugLog('Debug: pca default header suppressed - awaiting user paste', {
      rows: pcaData.length, cols: pcaData[0]?.length || 0
    });
    let pcaScheduleProxyCount = 0;
    let lastKeyDownAt = 0;
    let suppressLabelSelectionToggleUntil = 0;
    let pcaHot = null;
    const scheduleDrawPcaProxy = (payload) => {
      pcaScheduleProxyCount += 1;
      if(pcaScheduleProxyCount <= 5){
        debugLog('Debug: pca scheduleDraw proxy invoked', { count: pcaScheduleProxyCount });
        if(pcaScheduleProxyCount === 5){
          debugLog('Debug: pca scheduleDraw proxy suppressing further logs');
        }
      }
      const meta = payload && typeof payload === 'object'
        ? payload
        : (typeof payload === 'string' ? { reason: payload } : {});
      const reason = meta.reason || 'hot-change';
      const source = meta.source || null;
      const invalidate = typeof meta.invalidate === 'string' ? meta.invalidate : 'data';
      const options = { ...meta, reason };
      const shouldSuppressPending = reason === 'afterLoadData'
        || source === 'loadData'
        || source === 'pca-label-row'
        || source === 'pca-empty-defaults'
        || source === 'pca-loadData';
      if(!Object.prototype.hasOwnProperty.call(options, 'markPending') && shouldSuppressPending){
        options.markPending = false;
      }
      if(invalidate === 'data'){
        markPcaDataDirty(reason);
      }else{
        markPcaViewDirty(reason);
      }
      scheduleDrawPca(options);
    };
    pcaHot = Shared.hot.createStandardTable(container,{ rows: DEFAULT_ROWS, cols: DEFAULT_COLS },scheduleDrawPcaProxy,{
      debugLabel: 'pca',
      data: pcaData,
      disablePaste: true,
      pinFirstColumn: true,
      rowSelection: null,
      firstRowClassName: 'htCenter',
      headerRowIndex: PCA_HEADER_ROW_INDEX,
      pinFirstRow: getPcaPinnedMetaRowCountForMode({ forceStandard: true }),
      scheduleOnLoadData: true,
      colDefEnhancer(def, meta){
        const colIndex = meta?.colIndex;
        if(!Number.isInteger(colIndex) || !def || typeof def !== 'object'){
          return def;
        }
        const existingEditable = def.editable;
        def.editable = params => {
          const physicalRow = params?.data?.__rowIndex;
          if(physicalRow === PCA_LABEL_ROW_INDEX){
            return false;
          }
          if(physicalRow === PCA_GROUP_ROW_INDEX && pcaState.tableFormat === 'grouped'){
            const role = getPcaGroupedHeaderCellRole(colIndex, pcaHot);
            if(role === 'groupFollower'){
              return false;
            }
          }
          return typeof existingEditable === 'function'
            ? existingEditable(params)
            : existingEditable !== false;
        };
        const existingCellStyle = def.cellStyle;
        def.cellStyle = params => {
          let baseStyle = {};
          if(typeof existingCellStyle === 'function'){
            const resolved = existingCellStyle(params);
            if(resolved && typeof resolved === 'object'){
              baseStyle = Object.assign({}, resolved);
            }
          }else if(existingCellStyle && typeof existingCellStyle === 'object'){
            baseStyle = Object.assign({}, existingCellStyle);
          }
          const physicalRow = params?.data?.__rowIndex;
          if(
            Number.isInteger(physicalRow)
            && physicalRow >= PCA_LABEL_ROW_INDEX
            && physicalRow <= getPcaHeaderRowIndexForMode()
          ){
            baseStyle.backgroundColor = '#f5f5f5';
          }
          if(physicalRow === PCA_LABEL_ROW_INDEX && colIndex >= 1){
            baseStyle.cursor = 'pointer';
          }
          if(physicalRow === PCA_GROUP_ROW_INDEX && pcaState.tableFormat === 'grouped' && colIndex >= 1){
            const role = getPcaGroupedHeaderCellRole(colIndex, pcaHot);
            if(role === 'groupAnchor'){
              baseStyle.textAlign = 'center';
              baseStyle.justifyContent = 'center';
              baseStyle.fontWeight = '600';
            }else if(role === 'groupFollower'){
              baseStyle.textAlign = 'center';
              baseStyle.justifyContent = 'center';
            }
          }
          return baseStyle;
        };
        const baseRules = def.cellClassRules && typeof def.cellClassRules === 'object'
          ? Object.assign({}, def.cellClassRules)
          : {};
        baseRules['pca-grouped-meta-row'] = params => (
          Number.isInteger(params?.data?.__rowIndex)
          && params.data.__rowIndex >= PCA_LABEL_ROW_INDEX
          && params.data.__rowIndex <= getPcaHeaderRowIndexForMode()
        );
        baseRules['pca-label-row-divider'] = params => (
          Number.isInteger(params?.data?.__rowIndex)
          && params.data.__rowIndex === PCA_LABEL_ROW_INDEX
        );
        baseRules['pca-grouped-header-row-divider'] = params => (
          pcaState.tableFormat === 'grouped'
          && params?.data?.__rowIndex === PCA_GROUP_ROW_INDEX
        );
        def.cellClassRules = baseRules;
        if(colIndex < 1){
          return def;
        }
        const existingColSpan = def.colSpan;
        def.colSpan = params => {
          const physicalRow = params?.data?.__rowIndex;
          if(physicalRow === PCA_GROUP_ROW_INDEX && pcaState.tableFormat === 'grouped'){
            const info = getPcaGroupedHeaderInfo(colIndex, pcaHot, { forceGrouped: true });
            if(info?.role === 'groupAnchor'){
              return info.span;
            }
          }
          if(typeof existingColSpan === 'function'){
            return existingColSpan(params);
          }
          return Number.isFinite(existingColSpan) && existingColSpan > 0
            ? Math.floor(existingColSpan)
            : 1;
        };
        const existingSelector = def.cellRendererSelector;
        def.cellRendererSelector = params => {
          const physicalRow = params?.data?.__rowIndex;
          if(physicalRow === PCA_LABEL_ROW_INDEX && colIndex >= 1){
            return { component: PcaLabelCheckboxRenderer };
          }
          return typeof existingSelector === 'function' ? existingSelector(params) : undefined;
        };
        const existingHeaderClass = def.headerClass;
        def.headerClass = params => {
          const classes = [];
          const pushClass = value => {
            if(!value){
              return;
            }
            if(Array.isArray(value)){
              value.forEach(pushClass);
              return;
            }
            if(typeof value === 'string'){
              value.split(/\s+/).filter(Boolean).forEach(token => classes.push(token));
            }
          };
          if(typeof existingHeaderClass === 'function'){
            pushClass(existingHeaderClass(params));
          }else{
            pushClass(existingHeaderClass);
          }
          if(pcaState.tableFormat === 'grouped'){
            const role = getPcaGroupedHeaderCellRole(colIndex, pcaHot);
            if(role === 'groupAnchor' || role === 'groupFollower'){
              classes.push('pca-group-colheader');
              const segment = getPcaGroupedHeaderMergeSegment(colIndex, pcaHot);
              if(segment === 'start'){
                classes.push('pca-group-colheader-merge-start');
              }else if(segment === 'middle'){
                classes.push('pca-group-colheader-merge-middle');
              }else if(segment === 'end'){
                classes.push('pca-group-colheader-merge-end');
              }
            }
          }
          return classes;
        };
        const existingRules = def.cellClassRules && typeof def.cellClassRules === 'object'
          ? Object.assign({}, def.cellClassRules)
          : {};
        existingRules['pca-grouped-header-anchor'] = params => {
          if(params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX){
            return false;
          }
          return getPcaGroupedHeaderCellRole(colIndex, pcaHot) === 'groupAnchor';
        };
        existingRules['pca-grouped-header-follower'] = params => {
          if(params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX){
            return false;
          }
          return getPcaGroupedHeaderCellRole(colIndex, pcaHot) === 'groupFollower';
        };
        existingRules['pca-grouped-header-merge-start'] = params => {
          if(params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX){
            return false;
          }
          return getPcaGroupedHeaderMergeSegment(colIndex, pcaHot) === 'start';
        };
        existingRules['pca-grouped-header-merge-middle'] = params => {
          if(params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX){
            return false;
          }
          return getPcaGroupedHeaderMergeSegment(colIndex, pcaHot) === 'middle';
        };
        existingRules['pca-grouped-header-merge-end'] = params => {
          if(params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX){
            return false;
          }
          return getPcaGroupedHeaderMergeSegment(colIndex, pcaHot) === 'end';
        };
        def.cellClassRules = existingRules;
        return def;
      },
      hotOptions: {
        contextMenu: true,
        beforeKeyDown(){
          lastKeyDownAt = Date.now();
        },
        afterSelectionEnd(r1, c1, r2, c2){
          activatePcaDataToolbar('table-selection');
          const hot = pcaHot;
          if(!hot || typeof hot.getData !== 'function'){
            return;
          }
          const now = Date.now();
          if(now < suppressLabelSelectionToggleUntil){
            return;
          }
          if(now - lastKeyDownAt < 80){
            return;
          }
          const data = hot.getData() || [];
          const labelRowIndex = resolvePcaLabelRowIndex(data);
          if(!Number.isInteger(labelRowIndex)){
            return;
          }
          const fromRow = Math.min(r1, r2);
          const toRow = Math.max(r1, r2);
          if(fromRow !== labelRowIndex || toRow !== labelRowIndex){
            return;
          }
          const fromCol = Math.min(c1, c2);
          const toCol = Math.max(c1, c2);
          if(toCol < 1){
            return;
          }
          const source = 'pca-point-label-toggle';
          if(isPcaPinnedRow(hot, labelRowIndex)){
            let changed = false;
            for(let c = Math.max(1, fromCol); c <= toCol; c += 1){
              const current = data[labelRowIndex]?.[c];
              const next = !parsePcaPointLabelFlag(current);
              if(applyPcaCellValue(hot, labelRowIndex, c, next, { source, render: false })){
                changed = true;
              }
            }
            if(changed){
              if(typeof hot.render === 'function'){
                hot.render();
              }
              markPcaDataDirty(source);
              scheduleDrawPca({ reason: source });
              debugLog('Debug: pca label row toggled', { row: labelRowIndex, fromCol, toCol });
            }
            return;
          }
          if(typeof hot.setDataAtCell !== 'function'){
            return;
          }
          const changes = [];
          for(let c = Math.max(1, fromCol); c <= toCol; c += 1){
            const current = typeof hot.getDataAtCell === 'function'
              ? hot.getDataAtCell(labelRowIndex, c)
              : (data[labelRowIndex]?.[c]);
            const next = !parsePcaPointLabelFlag(current);
            changes.push([labelRowIndex, c, next]);
          }
          if(changes.length){
            hot.setDataAtCell(changes, source);
            debugLog('Debug: pca label row toggled', { row: labelRowIndex, fromCol, toCol });
          }
        },
        afterChange(changes,source){
          if(Array.isArray(changes) && changes.length && pcaState.tableFormat === 'grouped'){
            const headerTouched = changes.some(change => Number(change?.[0]) === PCA_GROUP_ROW_INDEX);
            if(headerTouched && source !== 'pca-grouped-header-normalize'){
              normalizePcaGroupedHeaderRow(pcaHot, { source: 'pca-grouped-header-normalize' });
            }
            updatePcaGroupedHeaders();
          }
          if(Array.isArray(changes) && changes.length){
            syncPcaActiveDataViewFromHot(pcaHot, 'afterChange');
          }
          const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
          if(!debugEnabled){
            return;
          }
          const changeCount = Array.isArray(changes) ? changes.length : 0;
          debugLog('Debug: pca table afterChange',{ count: changeCount, source });
        },
        afterLoadData(){
          if(pcaState.tableFormat === 'grouped'){
            normalizePcaGroupedHeaderRow(pcaHot, { source: 'pca-grouped-header-normalize' });
            updatePcaGroupedHeaders();
          }
          syncPcaActiveDataViewFromHot(pcaHot, 'afterLoadData');
        },
        afterCreateCol(){
          if(pcaState.tableFormat === 'grouped'){
            normalizePcaGroupedHeaderRow(pcaHot, { source: 'pca-grouped-header-normalize' });
            updatePcaGroupedHeaders();
          }
          syncPcaActiveDataViewFromHot(pcaHot, 'afterChange');
        },
        afterRemoveCol(){
          if(pcaState.tableFormat === 'grouped'){
            normalizePcaGroupedHeaderRow(pcaHot, { source: 'pca-grouped-header-normalize' });
            updatePcaGroupedHeaders();
          }
          syncPcaActiveDataViewFromHot(pcaHot, 'afterChange');
        },
        afterUndo(){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            debugLog('Debug: pca table undo');
          }
        },
        afterRedo(){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            debugLog('Debug: pca table redo');
          }
        }
      }
    });
    if(pcaHot){
      pcaHot.__pcaHostContainer = container || null;
      if(container && typeof container.addEventListener === 'function'){
        if(typeof container.__pcaLabelClickToggleHandler === 'function'){
          container.removeEventListener('pointerdown', container.__pcaLabelClickToggleHandler, true);
          container.__pcaLabelClickToggleHandler = null;
          container.__pcaLabelClickToggleBound = false;
        }
        const clickHandler = evt => {
          if(evt?.button != null && evt.button !== 0){
            return;
          }
          const target = evt?.target;
          const cell = target && typeof target.closest === 'function' ? target.closest('.ag-cell') : null;
          if(!cell){
            return;
          }
          const colId = cell.getAttribute?.('col-id');
          if(typeof colId !== 'string' || !/^c\d+$/.test(colId)){
            return;
          }
          const colIndex = Number(colId.slice(1));
          if(!Number.isInteger(colIndex) || colIndex < 1){
            return;
          }
          const rowAttr = cell.getAttribute?.('row-index')
            || cell.closest?.('.ag-row')?.getAttribute?.('row-index')
            || null;
          const visualRow = parsePcaAgVisualRowIndex(rowAttr);
          if(visualRow !== PCA_LABEL_ROW_INDEX){
            return;
          }
          const hot = pcaHot;
          if(!hot){
            return;
          }
          const data = hot.getData?.() || [];
          const labelRowIndex = resolvePcaLabelRowIndex(data);
          if(!Number.isInteger(labelRowIndex) || labelRowIndex < 0){
            return;
          }
          const current = data[labelRowIndex]?.[colIndex];
          const next = !parsePcaPointLabelFlag(current);
          const source = 'pca-point-label-toggle';
          const applied = applyPcaCellValue(hot, labelRowIndex, colIndex, next, { source, render: false });
          if(!applied){
            return;
          }
          if(isPcaPinnedRow(hot, labelRowIndex) && typeof hot.render === 'function'){
            hot.render();
          }
          syncPcaActiveDataViewFromHot(hot, 'afterChange');
          markPcaDataDirty(source);
          scheduleDrawPca({ reason: source });
          suppressLabelSelectionToggleUntil = Date.now() + 500;
          debugLog('Debug: pca label toggle via cell click', { row: labelRowIndex, col: colIndex, next });
        };
        container.addEventListener('pointerdown', clickHandler, true);
        container.__pcaLabelClickToggleBound = true;
        container.__pcaLabelClickToggleHandler = clickHandler;
      }
      ensurePcaEmptyTableDefaults(pcaHot, { source: 'pca-init' });
    }
    if(pcaHot && typeof pcaHot.loadData === 'function' && !pcaHot.__pcaPatched){
      const originalLoadData = pcaHot.loadData;
      pcaHot.loadData = function patchedPcaLoadData(){
        const dataset = arguments[0];
        let rows = 0;
        let cols = 0;
        if(Array.isArray(dataset)){
          rows = dataset.length;
          cols = Array.isArray(dataset[0]) ? dataset[0].length : 0;
        }
        if(rows || cols){
          updatePcaDataShape({ rows, cols });
        }
        const start = nowMs();
        const result = originalLoadData.apply(this, arguments);
        const labelAdjusted = ensurePcaLabelRow(this, { source: 'pca-loadData' });
        ensurePcaEmptyTableDefaults(this, { source: 'pca-loadData' });
        if(labelAdjusted){
          const nextRows = typeof this.countRows === 'function'
            ? this.countRows()
            : (this.getData?.()?.length || rows);
          const nextCols = typeof this.countCols === 'function'
            ? this.countCols()
            : cols;
          rows = Math.max(rows, nextRows);
          cols = Math.max(cols, nextCols);
          updatePcaDataShape({ rows, cols });
        }
        const afterLoad = nowMs();
        const evaluationStart = afterLoad;
        const evaluationMeta = rows || cols ? { source: 'load-data', shape: { rows, cols } } : { source: 'load-data' };
        evaluateAutoDrawThresholds(evaluationMeta);
        const afterEvaluation = nowMs();
        recordPcaPerformance('loadData', {
          rows,
          cols,
          totalMs: afterEvaluation - start,
          hotMs: afterLoad - start,
          evaluationMs: afterEvaluation - evaluationStart
        });
        return result;
      };
      pcaHot.__pcaPatched = true;
    }
    return pcaHot;
  }
  function ensurePcaHotForActiveTab(){
    const wrapper = document.getElementById('pcaHotWrapper');
    const baseContainer = document.getElementById('pcaHot');
    const tabId = resolveActiveTabId() || 'pca-default';
    if(!Shared.hot?.mountTableForTab || !wrapper){
      if(!pcaHotInstance && baseContainer && typeof Shared.hot?.createStandardTable === 'function'){
        pcaHotInstance = createPcaTableInstance(baseContainer);
        pcaState.hot = pcaHotInstance;
      }
      if(pcaHotInstance){
        pcaHotInstance.__pcaHostContainer = baseContainer || pcaHotInstance.__pcaHostContainer || null;
        pcaHotInstance.__pcaTabId = tabId;
        ensurePcaDataViewsForHot(pcaHotInstance, {
          wrapper,
          container: pcaHotInstance.__pcaHostContainer || baseContainer || null
        });
        syncPcaActiveDataViewFromHot(pcaHotInstance, 'ensure-active-tab');
      }
      return pcaHotInstance;
    }
    const placeholder = wrapper.querySelector('.hot-pool-slot') || wrapper;
    const entry = Shared.hot.mountTableForTab({
      type: 'pca',
      tabId,
      wrapper: wrapper,
      templateContainer: baseContainer,
      createInstance: container => createPcaTableInstance(container)
    });
    if(entry){
      pcaHotInstance = entry.instance;
      pcaState.hot = entry.instance;
    }
    if(pcaHotInstance){
      pcaHotInstance.__pcaHostContainer = entry?.container || baseContainer || pcaHotInstance.__pcaHostContainer || null;
      pcaHotInstance.__pcaTabId = tabId;
      ensurePcaDataViewsForHot(pcaHotInstance, {
        wrapper,
        container: pcaHotInstance.__pcaHostContainer || baseContainer || null
      });
      syncPcaActiveDataViewFromHot(pcaHotInstance, 'ensure-active-tab');
    }
    return pcaHotInstance;
  }
  function resolveActiveTabId(){
    try{
      const tab = Main?.session?.getActiveTab?.();
      return tab?.id || null;
    }catch(err){
      console.error('pca resolveActiveTabId error', err);
      return null;
    }
  }

  function activatePcaDataToolbar(reason){
    const now = Date.now();
    if(now - pcaDataToolbarLastActivation < 80){
      return false;
    }
    pcaDataToolbarLastActivation = now;
    const activated = !!Shared.workspaceToolbar?.activateSection?.('pca', 'Data');
    if(activated){
      debugLog('Debug: pca data toolbar activated', { reason: reason || 'unknown' });
    }
    return activated;
  }

  function ensurePcaDataViewsForHot(hotInstance, options = {}){
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      return null;
    }
    if(typeof Shared.dataViews?.createManager !== 'function'){
      return null;
    }
    if(!hotInstance.__pcaDataViewsManager){
      hotInstance.__pcaDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'pca',
        maxViews: PCA_DATA_VIEW_MAX,
        initialData: hotInstance.getData() || [],
        onActiveViewChanged(view){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          const nextData = Array.isArray(view.data) ? view.data : [];
          hotInstance.loadData(nextData);
          if(view.exclusions){
            hotInstance.applyExclusions?.(view.exclusions);
          }
          markPcaDataDirty('data-view-switch');
          markPcaOverlayPending('data-view-switch');
          scheduleDrawPca({ reason: 'data-view-switch' });
        },
        onInteraction(){
          activatePcaDataToolbar('data-tab-interaction');
        }
      });
      debugLog('Debug: pca data views manager created', {
        tabId: hotInstance.__pcaTabId || null
      });
    }
    const manager = hotInstance.__pcaDataViewsManager;
    const hostWrapper = options.wrapper || global.document?.getElementById?.('pcaHotWrapper') || null;
    const hostContainer = options.container || hotInstance.__pcaHostContainer || global.document?.getElementById?.('pcaHot') || null;
    if(hostWrapper && hostContainer){
      manager.mount({
        wrapper: hostWrapper,
        tableContainer: hostContainer
      });
      manager.refresh?.();
    }
    pcaDataViewsManager = manager;
    return manager;
  }

  function syncPcaActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || pcaHotInstance;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const manager = hot.__pcaDataViewsManager || pcaDataViewsManager;
    if(!manager){
      return;
    }
    manager.updateActiveData(hot.getData() || []);
    manager.updateActiveExclusions(hot?.exportExclusions?.() || null);
    if(reason === 'afterLoadData'){
      manager.refresh?.();
    }
  }

  function applyPcaTransformToNewView(transformSpec, options = {}){
    const hot = ensurePcaHotForActiveTab?.() || pcaHotInstance;
    if(!hot){
      return false;
    }
    const manager = ensurePcaDataViewsForHot(hot, {
      wrapper: global.document?.getElementById?.('pcaHotWrapper') || null,
      container: hot.__pcaHostContainer || global.document?.getElementById?.('pcaHot') || null
    });
    if(!manager || typeof manager.applyTransform !== 'function'){
      console.warn('pca data transform skipped: Shared.dataViews unavailable');
      return false;
    }
    syncPcaActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyTransform(transformSpec, {
      title: options.title,
      reason: options.reason || 'toolbar-transform',
      transformOptions: Object.assign(
        {},
        PCA_TRANSFORM_SCOPE_DEFAULT,
        { headerRows: getPcaPinnedMetaRowCountForMode() },
        options.transformOptions || {}
      )
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      debugLog('Debug: pca transform failed', {
        message,
        transform: transformSpec?.type || null
      });
      return false;
    }
    activatePcaDataToolbar('transform-applied');
    debugLog('Debug: pca transform created view', {
      title: result?.view?.title || null,
      summary: result?.result?.summary || null
    });
    return true;
  }

  const PCA_TRANSFORM_OPTION_MAP = Object.freeze({
    cpm: { spec: { type: 'cpm', orientation: 'column' }, title: 'CPM' },
    log2p1: { spec: { type: 'log', base: 2, pseudoCount: 1 }, title: 'log2(x+1)' },
    centerRowsMean: { spec: { type: 'centerRows', method: 'mean' }, title: 'Center rows (mean)' },
    centerRowsMedian: { spec: { type: 'centerRows', method: 'median' }, title: 'Center rows (median)' },
    centerColsMean: { spec: { type: 'centerColumns', method: 'mean' }, title: 'Center cols (mean)' },
    centerColsMedian: { spec: { type: 'centerColumns', method: 'median' }, title: 'Center cols (median)' },
    normalizeRows: { spec: { type: 'normalizeRows' }, title: 'Normalize rows (z)' },
    normalizeCols: { spec: { type: 'normalizeColumns' }, title: 'Normalize cols (z)' }
  });

  function promptPcaCustomExpression(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const expression = String(toolbarApi?.getCustomTransformExpression?.('pca') || '').trim();
    if(expression){
      return expression;
    }
    toolbarApi?.openCustomTransformEditor?.('pca');
    if(typeof global.alert === 'function'){
      global.alert('Enter a custom transformation formula using x, then click "Apply custom".');
    }
    return null;
  }

  function resolvePcaToolbarTransformOption(optionKey, customExpression){
    const key = String(optionKey || '').trim();
    if(!key){
      return null;
    }
    if(key === 'custom'){
      const normalized = String(customExpression || '').trim();
      if(!normalized){
        return null;
      }
      return {
        spec: { type: 'custom', expression: normalized },
        title: `Custom: ${normalized.slice(0, 24)}${normalized.length > 24 ? '...' : ''}`
      };
    }
    const preset = PCA_TRANSFORM_OPTION_MAP[key];
    if(!preset){
      return null;
    }
    return {
      spec: Object.assign({}, preset.spec),
      title: preset.title
    };
  }

  function applyPcaTransformPipelineToNewView(transformSpecs, options = {}){
    const hot = ensurePcaHotForActiveTab?.() || pcaHotInstance;
    if(!hot){
      return false;
    }
    const manager = ensurePcaDataViewsForHot(hot, {
      wrapper: global.document?.getElementById?.('pcaHotWrapper') || null,
      container: hot.__pcaHostContainer || global.document?.getElementById?.('pcaHot') || null
    });
    if(!manager || typeof manager.applyPipeline !== 'function'){
      console.warn('pca data transform pipeline skipped: Shared.dataViews unavailable');
      return false;
    }
    const specs = Array.isArray(transformSpecs) ? transformSpecs.filter(Boolean) : [];
    if(!specs.length){
      return false;
    }
    syncPcaActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyPipeline(specs, {
      title: options.title,
      reason: options.reason || 'toolbar-transform-pipeline',
      transformOptions: Object.assign(
        {},
        PCA_TRANSFORM_SCOPE_DEFAULT,
        { headerRows: getPcaPinnedMetaRowCountForMode() },
        options.transformOptions || {}
      )
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      debugLog('Debug: pca transform pipeline failed', {
        message,
        stepCount: specs.length
      });
      return false;
    }
    activatePcaDataToolbar('transform-pipeline-applied');
    debugLog('Debug: pca transform pipeline created view', {
      title: result?.view?.title || null,
      stepCount: Array.isArray(result?.result?.steps) ? result.result.steps.length : specs.length
    });
    return true;
  }

  function applyPcaSelectedTransforms(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const selected = toolbarApi?.getSelectedTransforms?.('pca') || [];
    if(!Array.isArray(selected) || !selected.length){
      return false;
    }
    const resolved = [];
    for(let i = 0; i < selected.length; i += 1){
      const optionKey = selected[i];
      if(optionKey === 'custom'){
        const customExpression = promptPcaCustomExpression();
        if(!customExpression){
          return false;
        }
        const customTransform = resolvePcaToolbarTransformOption('custom', customExpression);
        if(customTransform){
          resolved.push(customTransform);
        }
        continue;
      }
      const next = resolvePcaToolbarTransformOption(optionKey);
      if(next){
        resolved.push(next);
      }
    }
    if(!resolved.length){
      return false;
    }
    const ok = resolved.length === 1
      ? applyPcaTransformToNewView(resolved[0].spec, {
        title: resolved[0].title,
        reason: 'toolbar-transform-multi-single'
      })
      : applyPcaTransformPipelineToNewView(
        resolved.map(item => item.spec),
        { reason: 'toolbar-transform-multi' }
      );
    if(ok){
      toolbarApi?.clearSelectedTransforms?.('pca');
    }
    return ok;
  }

  function bindPcaDataToolbar(){
    if(pcaDataToolbarBound || !global.document){
      return;
    }
    global.document.addEventListener('click', event => {
      const button = event.target?.closest?.(
        '#pcaTransformApplySelected, #pcaTransformCustomApply, #pcaTransformCpm, #pcaTransformLog2p1, #pcaTransformCenterRowsMean, #pcaTransformCenterRowsMedian, #pcaTransformCenterColsMean, #pcaTransformCenterColsMedian, #pcaTransformNormalizeRows, #pcaTransformNormalizeCols, #pcaTransformCustom'
      );
      if(!button){
        return;
      }
      const transformSection = button.closest?.('.workspace-toolbar__section[data-transform-section="1"]');
      if(button.id === 'pcaTransformApplySelected'){
        applyPcaSelectedTransforms();
        return;
      }
      if(button.id === 'pcaTransformCustomApply'){
        const customExpression = promptPcaCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolvePcaToolbarTransformOption('custom', customExpression);
        if(!customTransform){
          return;
        }
        if(transformSection?.dataset?.transformMultiMode === '1'){
          const selected = Shared.workspaceToolbar?.getSelectedTransforms?.('pca') || [];
          if(Array.isArray(selected) && selected.includes('custom')){
            applyPcaSelectedTransforms();
          }else{
            applyPcaTransformToNewView(customTransform.spec, { title: customTransform.title });
          }
          return;
        }
        applyPcaTransformToNewView(customTransform.spec, { title: customTransform.title });
        return;
      }
      if(!transformSection){
        return;
      }
      if(transformSection?.dataset?.transformMultiMode === '1'){
        return;
      }
      const optionKey = String(button.dataset?.transformOption || '').trim();
      if(!optionKey){
        return;
      }
      if(optionKey === 'custom'){
        const customExpression = promptPcaCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolvePcaToolbarTransformOption(optionKey, customExpression);
        if(customTransform){
          applyPcaTransformToNewView(customTransform.spec, { title: customTransform.title });
        }
        return;
      }
      const resolved = resolvePcaToolbarTransformOption(optionKey);
      if(resolved){
        applyPcaTransformToNewView(resolved.spec, { title: resolved.title });
      }
    }, true);
    const wrapper = global.document?.getElementById?.('pcaHotWrapper');
    if(wrapper && !wrapper.__pcaDataToolbarFocusBound){
      wrapper.addEventListener('mousedown', () => {
        activatePcaDataToolbar('table-mousedown');
      }, true);
      wrapper.__pcaDataToolbarFocusBound = true;
    }
    pcaDataToolbarBound = true;
  }

  function ensurePcaLegendControlPlacement(){
    if(!pcaLegendControl || !pcaSvgBoxRef){
      return;
    }
    if(Shared.resizer && typeof Shared.resizer.ensureLegendControlPlacement === 'function'){
      Shared.resizer.ensureLegendControlPlacement({
        svgBox: pcaSvgBoxRef,
        control: pcaLegendControl,
        debugLabel: 'pca-legend'
      });
    }
  }

  function getPcaLockRatioCheckbox(){
    if(pcaLockRatioInput && pcaLockRatioInput.isConnected){
      return pcaLockRatioInput;
    }
    const svgBox = pcaSvgBoxRef;
    if(!svgBox){
      return null;
    }
    const checkbox = svgBox.querySelector('.resizer-aspect-checkbox');
    if(checkbox){
      pcaLockRatioInput = checkbox;
    }
    return checkbox;
  }

  function syncPcaAspectControls(reason){
    if(pcaAspectSyncing){
      return;
    }
    pcaAspectSyncing = true;
    try{
      const equalAxesEnabled = !!pcaState.equalAxes;
      const equalScaleEnabled = !!pcaState.equalScaleAxes;
      const varianceAxesEnabled = !!pcaState.axesVarianceScaled;
      const viewMode = pcaViewModeInput?.value || DEFAULT_VIEW_MODE;
      const is3dView = String(viewMode).toLowerCase() === '3d';
      const enforceLockRatio = equalAxesEnabled || equalScaleEnabled || varianceAxesEnabled || is3dView;
      if(pcaEqualAxesInput && pcaEqualAxesInput.checked !== equalAxesEnabled){
        pcaEqualAxesInput.checked = equalAxesEnabled;
      }
      if(pcaEqualScaleAxesInput && pcaEqualScaleAxesInput.checked !== equalScaleEnabled){
        pcaEqualScaleAxesInput.checked = equalScaleEnabled;
      }
      if(pcaVarianceAxisScaleInput && pcaVarianceAxisScaleInput.checked !== varianceAxesEnabled){
        pcaVarianceAxisScaleInput.checked = varianceAxesEnabled;
      }
      const lockRatioCheckbox = getPcaLockRatioCheckbox();
      if(lockRatioCheckbox){
        const lockLabel = lockRatioCheckbox.closest('label');
        if(enforceLockRatio){
          if(pcaAxesLengthLockRatioPrevious === null){
            pcaAxesLengthLockRatioPrevious = !!lockRatioCheckbox.checked;
          }
          if(!lockRatioCheckbox.checked){
            lockRatioCheckbox.checked = true;
            lockRatioCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
          lockRatioCheckbox.disabled = true;
          if(lockLabel){
            if(!lockLabel.__pcaOriginalTitle){
              lockLabel.__pcaOriginalTitle = lockLabel.title || '';
            }
            lockLabel.title = 'Locked while axes length is constrained';
          }
        }else{
          lockRatioCheckbox.disabled = false;
          if(lockLabel && lockLabel.__pcaOriginalTitle !== undefined){
            lockLabel.title = lockLabel.__pcaOriginalTitle;
            delete lockLabel.__pcaOriginalTitle;
          }
          if(pcaAxesLengthLockRatioPrevious !== null){
            const restoreValue = pcaAxesLengthLockRatioPrevious;
            pcaAxesLengthLockRatioPrevious = null;
            if(lockRatioCheckbox.checked !== restoreValue){
              lockRatioCheckbox.checked = restoreValue;
              lockRatioCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      }
      debugLog('Debug: pca axes length sync',{
        equalAxesEnabled,
        equalScaleEnabled,
        varianceAxesEnabled,
        is3dView,
        lockRatioEnabled: lockRatioCheckbox ? !!lockRatioCheckbox.checked : null,
        reason: reason || null
      });
    } finally {
      pcaAspectSyncing = false;
    }
  }

  function ensurePcaAxesLengthControlPlacement(){
    if(!pcaSvgBoxRef){
      return;
    }
    const doc = pcaSvgBoxRef.ownerDocument || global.document;
    if(!doc){
      return;
    }
    let tray = pcaSvgBoxRef.querySelector('.resizer-control-tray');
    if(!tray){
      tray = doc.createElement('div');
      tray.className = 'resizer-control-tray';
      pcaSvgBoxRef.appendChild(tray);
      debugLog('Debug: pca axes length tray created', { trayChildren: tray.childElementCount });
    }
    const legacyEqualAxesControl = tray.querySelector('.resizer-equalaxes-control');
    if(legacyEqualAxesControl){
      legacyEqualAxesControl.remove();
    }
    let axesControl = tray.querySelector('.resizer-axeslength-control');
    if(!axesControl){
      axesControl = doc.createElement('details');
      axesControl.className = 'resizer-axeslength-control';
      const summary = doc.createElement('summary');
      summary.className = 'resizer-axeslength-summary';
      summary.textContent = 'Axes length';
      const menu = doc.createElement('div');
      menu.className = 'resizer-axeslength-menu';
      axesControl.appendChild(summary);
      axesControl.appendChild(menu);
      const aspectControl = tray.querySelector('.resizer-aspect-control');
      if(aspectControl && aspectControl.parentNode === tray){
        tray.insertBefore(axesControl, aspectControl);
      }else{
        tray.appendChild(axesControl);
      }
      debugLog('Debug: pca axes length control created', { trayChildren: tray.childElementCount });
    }
    const menu = axesControl.querySelector('.resizer-axeslength-menu');
    if(menu){
      let equalScaleItem = menu.querySelector('.resizer-axeslength-item--equal-scale');
      if(!equalScaleItem){
        equalScaleItem = doc.createElement('label');
        equalScaleItem.className = 'resizer-axeslength-item resizer-axeslength-item--equal-scale';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-scale';
        const textSpan = doc.createElement('span');
        textSpan.className = 'resizer-axeslength-text';
        equalScaleItem.appendChild(checkbox);
        equalScaleItem.appendChild(textSpan);
        menu.appendChild(equalScaleItem);
      }else{
        equalScaleItem.classList.add('resizer-axeslength-item');
      }
      if(equalScaleItem){
        equalScaleItem.title = 'Equal axis lengths with the same data scale';
        const equalScaleCheckbox = equalScaleItem.querySelector('input[type="checkbox"]');
        if(equalScaleCheckbox){
          equalScaleCheckbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-scale';
          equalScaleCheckbox.setAttribute('aria-label', 'Equal axis lengths with the same data scale');
        }
        const equalScaleText = equalScaleItem.querySelector('.resizer-axeslength-text');
        if(equalScaleText){
          equalScaleText.textContent = 'Equal length / same scale';
        }
      }
      let equalLengthItem = menu.querySelector('.resizer-axeslength-item--equal-length');
      const legacyEqualItem = equalLengthItem ? null : menu.querySelector('.resizer-axeslength-item--equal');
      if(!equalLengthItem && legacyEqualItem){
        equalLengthItem = legacyEqualItem;
        equalLengthItem.classList.remove('resizer-axeslength-item--equal');
        equalLengthItem.classList.add('resizer-axeslength-item--equal-length');
      }
      if(!equalLengthItem){
        equalLengthItem = doc.createElement('label');
        equalLengthItem.className = 'resizer-axeslength-item resizer-axeslength-item--equal-length';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-length';
        const textSpan = doc.createElement('span');
        textSpan.className = 'resizer-axeslength-text';
        equalLengthItem.appendChild(checkbox);
        equalLengthItem.appendChild(textSpan);
      }
      if(equalLengthItem){
        equalLengthItem.title = 'Equal axis lengths with independent scales';
        const equalLengthCheckbox = equalLengthItem.querySelector('input[type="checkbox"]');
        if(equalLengthCheckbox){
          equalLengthCheckbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-length';
          equalLengthCheckbox.setAttribute('aria-label', 'Equal axis lengths with independent scales');
        }
        const equalLengthText = equalLengthItem.querySelector('.resizer-axeslength-text');
        if(equalLengthText){
          equalLengthText.textContent = 'Equal length / different scale';
        }
        if(equalLengthItem.parentNode !== menu){
          menu.appendChild(equalLengthItem);
        }
      }
      const equalScaleCheckbox = equalScaleItem.querySelector('input[type="checkbox"]');
      if(equalScaleCheckbox){
        pcaEqualScaleAxesInput = equalScaleCheckbox;
        if(equalScaleCheckbox.__pcaEqualScaleAxesHandler){
          equalScaleCheckbox.removeEventListener('change', equalScaleCheckbox.__pcaEqualScaleAxesHandler);
        }
        const onChange = () => {
          const enabled = !!equalScaleCheckbox.checked;
          const previous = !!pcaState.equalScaleAxes;
          if(enabled){
            pcaState.equalAxes = false;
            pcaState.axesVarianceScaled = false;
            if(pcaEqualAxesInput){
              pcaEqualAxesInput.checked = false;
            }
            if(pcaVarianceAxisScaleInput){
              pcaVarianceAxisScaleInput.checked = false;
            }
            debugLog('Debug: pca axes length exclusivity enforced',{ disabled: 'equal-length/variance', reason: 'equal-scale-toggle' });
          }
          pcaState.equalScaleAxes = enabled;
          debugLog('Debug: pca equal scale toggled',{ enabled, previous });
          syncPcaAspectControls('equal-scale-toggle');
          requestPcaViewRefresh('equal-scale-toggle');
        };
        equalScaleCheckbox.addEventListener('change', onChange);
        equalScaleCheckbox.__pcaEqualScaleAxesHandler = onChange;
      }
      const equalLengthCheckbox = equalLengthItem ? equalLengthItem.querySelector('input[type="checkbox"]') : null;
      if(equalLengthCheckbox){
        pcaEqualAxesInput = equalLengthCheckbox;
        if(equalLengthCheckbox.__pcaEqualAxesHandler){
          equalLengthCheckbox.removeEventListener('change', equalLengthCheckbox.__pcaEqualAxesHandler);
        }
        const onChange = () => {
          const enabled = !!equalLengthCheckbox.checked;
          const previous = !!pcaState.equalAxes;
          if(enabled){
            pcaState.equalScaleAxes = false;
            pcaState.axesVarianceScaled = false;
            if(pcaEqualScaleAxesInput){
              pcaEqualScaleAxesInput.checked = false;
            }
            if(pcaVarianceAxisScaleInput){
              pcaVarianceAxisScaleInput.checked = false;
            }
            debugLog('Debug: pca axes length exclusivity enforced',{ disabled: 'equal-scale/variance', reason: 'equal-length-toggle' });
          }
          pcaState.equalAxes = enabled;
          debugLog('Debug: pca equal length toggled',{ enabled, previous });
          syncPcaAspectControls('equal-length-toggle');
          requestPcaViewRefresh('equal-length-toggle');
        };
        equalLengthCheckbox.addEventListener('change', onChange);
        equalLengthCheckbox.__pcaEqualAxesHandler = onChange;
      }
      const varianceInput = pcaVarianceAxisScaleInput || doc.getElementById('pcaVarianceAxisScale');
      if(varianceInput){
        pcaVarianceAxisScaleInput = varianceInput;
        const varianceLabel = varianceInput.closest('label');
        if(varianceLabel){
          varianceLabel.title = 'Scale axes by variance';
          varianceLabel.classList.add('resizer-axeslength-item', 'resizer-axeslength-item--variance');
          varianceLabel.classList.remove('config-panel__checkbox', 'config-panel__checkbox--inline');
          varianceLabel.removeAttribute('style');
          varianceInput.classList.add('resizer-axeslength-checkbox', 'resizer-axeslength-checkbox--variance');
          varianceInput.setAttribute('aria-label', 'Scale axes by variance');
          let varianceText = varianceLabel.querySelector('.resizer-axeslength-text');
          if(!varianceText){
            varianceText = doc.createElement('span');
            varianceText.className = 'resizer-axeslength-text';
            varianceLabel.appendChild(varianceText);
          }
          varianceText.textContent = 'Variance-scaled';
          const nodes = Array.from(varianceLabel.childNodes);
          nodes.forEach(node => {
            if(node === varianceInput || node === varianceText){
              return;
            }
            if(node.nodeType === Node.TEXT_NODE){
              varianceLabel.removeChild(node);
            }
          });
          if(varianceLabel.parentNode !== menu){
            menu.appendChild(varianceLabel);
          }
        }
      }
      if(equalScaleItem && equalScaleItem.parentNode === menu){
        menu.appendChild(equalScaleItem);
      }
      if(equalLengthItem && equalLengthItem.parentNode === menu){
        menu.appendChild(equalLengthItem);
      }
      const varianceItem = menu.querySelector('.resizer-axeslength-item--variance');
      if(varianceItem && varianceItem.parentNode === menu){
        menu.appendChild(varianceItem);
      }
    }
    syncPcaAspectControls('axes-length-ensure');
  }

  function ensurePcaResizerControls(){
    ensurePcaLegendControlPlacement();
    ensurePcaAxesLengthControlPlacement();
  }

  function closePcaAxesLengthMenu(reason){
    const svgBox = pcaSvgBoxRef;
    if(!svgBox){
      return;
    }
    const axesControl = svgBox.querySelector('.resizer-axeslength-control');
    if(axesControl && axesControl.hasAttribute('open')){
      axesControl.removeAttribute('open');
      debugLog('Debug: pca axes length menu closed',{ reason: reason || null });
    }
  }

  function pcaTooltipDebug(label, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // ignore toggle errors and log by default
    }
    debugLog(label, payload);
  }

  function ensurePcaTooltipHost(tooltip, doc){
    if(!tooltip){ return null; }
    const documentRef = doc || tooltip.ownerDocument || global.document;
    if(!documentRef){ return tooltip; }
    const parent = tooltip.parentElement;
    if(!parent){ return tooltip; }
    let needsDetach = false;
    if(typeof tooltip.closest === 'function'){
      const hiddenAncestor = tooltip.closest('[hidden]');
      if(hiddenAncestor && hiddenAncestor !== tooltip){
        needsDetach = true;
      }
    }
    if(!needsDetach){
      try{
        const view = documentRef.defaultView;
        if(view && typeof view.getComputedStyle === 'function'){
          const parentDisplay = view.getComputedStyle(parent).display;
          if(parentDisplay === 'none'){
            needsDetach = true;
          }
        }else if(typeof parent.style?.display === 'string' && parent.style.display === 'none'){
          needsDetach = true;
        }
      }catch(err){
        pcaTooltipDebug('Debug: pca tooltip host inspection error',{ error: err?.message || String(err) });
      }
    }
    const host = documentRef.body || documentRef.documentElement;
    if(needsDetach && host && parent !== host){
      host.appendChild(tooltip);
      pcaTooltipDebug('Debug: pca tooltip host realigned',{ previousParent: parent.id || parent.className || parent.tagName || null });
    }
    return tooltip;
  }

  function getPcaTooltipElement(){
    if(pcaTooltipEl && pcaTooltipEl.isConnected){
      return pcaTooltipEl;
    }
    const doc = global.document;
    const tooltip = pcaRefs.tooltip || doc?.getElementById?.('tooltip') || null;
    if(tooltip){
      ensurePcaTooltipHost(tooltip, doc);
      pcaTooltipEl = tooltip;
      pcaRefs.tooltip = tooltip;
    }
    return pcaTooltipEl;
  }

  function formatPcaTooltipNumber(value){
    const formatter = Shared.formatters?.formatShortNumber;
    if(typeof formatter === 'function'){
      return formatter(value, { emptyValue: 'n/a' });
    }
    if(value === null || value === undefined){ return 'n/a'; }
    if(typeof value === 'number'){
      if(!Number.isFinite(value)){ return String(value); }
      return value.toLocaleString('en-US',{ maximumSignificantDigits: 6 });
    }
    const numeric = Number(value);
    if(Number.isFinite(numeric)){
      return numeric.toLocaleString('en-US',{ maximumSignificantDigits: 6 });
    }
    return String(value);
  }

  function updatePcaTooltipContent(tooltip, data){
    if(!tooltip || !data){ return false; }
    const doc = tooltip.ownerDocument || global.document;
    tooltip.textContent = '';
    tooltip.style.fontSize = '12px';
    tooltip.style.columnCount = 1;
    tooltip.style.columnWidth = 'auto';
    tooltip.style.columnGap = '0';
    tooltip.style.maxWidth = '320px';
    tooltip.style.maxHeight = 'none';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    tooltip.style.whiteSpace = 'normal';
    tooltip.style.overflow = 'visible';
    const fragment = doc.createDocumentFragment();
    const appendRow = (text, bold) => {
      if(!text){ return; }
      const row = doc.createElement('div');
      if(bold){ row.style.fontWeight = '600'; }
      row.textContent = text;
      fragment.appendChild(row);
    };
    if(data.label){
      appendRow(data.label, true);
    }
    if(data.groupName){
      appendRow(`Group: ${data.groupName}`);
    }
    if(data.x !== undefined){
      appendRow(`${data.xLabel || 'X'}: ${formatPcaTooltipNumber(data.x)}`);
    }
    if(data.y !== undefined){
      appendRow(`${data.yLabel || 'Y'}: ${formatPcaTooltipNumber(data.y)}`);
    }
    if(data.z !== undefined){
      appendRow(`${data.zLabel || 'Z'}: ${formatPcaTooltipNumber(data.z)}`);
    }
    if(Number.isFinite(data.depth)){
      appendRow(`Depth: ${formatPcaTooltipNumber(data.depth)}`);
    }
    if(Number.isInteger(data.index)){
      appendRow(`Index: ${data.index + 1}`);
    }
    if(!fragment.childNodes.length){
      return false;
    }
    tooltip.appendChild(fragment);
    return true;
  }

  function getPcaEventPagePosition(evt){
    const win = global.window;
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const pageX = typeof evt?.pageX === 'number' ? evt.pageX : ((evt?.clientX || 0) + scrollX);
    const pageY = typeof evt?.pageY === 'number' ? evt.pageY : ((evt?.clientY || 0) + scrollY);
    return { x: pageX, y: pageY };
  }

  function positionPcaTooltipAt(tooltip, pageX, pageY){
    if(!tooltip){ return; }
    const win = global.window;
    const offset = 12;
    let left = pageX + offset;
    let top = pageY + offset;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    const rect = tooltip.getBoundingClientRect();
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const maxX = scrollX + (win?.innerWidth ?? rect.width) - 8;
    const maxY = scrollY + (win?.innerHeight ?? rect.height) - 8;
    if(rect.right > maxX){
      left = Math.max(scrollX + 8, maxX - rect.width);
    }
    if(rect.bottom > maxY){
      top = Math.max(scrollY + 8, maxY - rect.height);
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hidePcaTooltip(reason){
    const tooltip = getPcaTooltipElement();
    if(!tooltip){ return; }
    const wasVisible = tooltip.style.display !== 'none';
    tooltip.style.display = 'none';
    tooltip.textContent = '';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    if(wasVisible){
      pcaTooltipDebug('Debug: pca tooltip hide',{ reason });
    }
  }

  function showPcaTooltip(data, evt){
    const tooltip = getPcaTooltipElement();
    if(!tooltip){ return; }
    if(!updatePcaTooltipContent(tooltip, data)){ return; }
    tooltip.style.display = 'block';
    const pos = getPcaEventPagePosition(evt);
    positionPcaTooltipAt(tooltip, pos.x, pos.y);
    pcaTooltipDebug('Debug: pca tooltip show',{
      label: data?.label || null,
      x: data?.x ?? null,
      y: data?.y ?? null,
      z: data?.z ?? null
    });
  }

  function handlePcaPointEnter(evt){
    const data = evt?.currentTarget?.__pcaPointData;
    if(!data){ return; }
    showPcaTooltip(data, evt);
  }

  function handlePcaPointMove(evt){
    const tooltip = getPcaTooltipElement();
    if(!tooltip || tooltip.style.display === 'none'){ return; }
    const pos = getPcaEventPagePosition(evt);
    positionPcaTooltipAt(tooltip, pos.x, pos.y);
  }

  function handlePcaPointLeave(){
    hidePcaTooltip('point-leave');
  }

  function handlePcaPlotMouseLeave(){
    hidePcaTooltip('plot-leave');
  }

  function isPcaContextMenuEventSuppressed(target){
    if(!target){
      return false;
    }
    if(target === pcaPointContextMenu){
      return true;
    }
    if(typeof target.closest === 'function'){
      return !!target.closest('.pca-point-context-menu');
    }
    return false;
  }

  function ensurePcaPointContextMenu(){
    const doc = global.document;
    if(!doc){
      return null;
    }
    if(pcaPointContextMenu && doc.body && doc.body.contains(pcaPointContextMenu)){
      return pcaPointContextMenu;
    }
    const menu = doc.createElement('div');
    menu.className = 'tab-context-menu pca-point-context-menu';
    menu.hidden = true;
    menu.dataset.pcaContextMenu = '1';
    menu.setAttribute('role', 'menu');
    menu.style.position = 'absolute';
    menu.style.left = '0px';
    menu.style.top = '0px';

    const makeItem = (action, label) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-context-menu__item';
      btn.dataset.action = action;
      btn.textContent = label;
      return btn;
    };

    const labelItem = makeItem('toggle-label', 'Add label');
    menu.appendChild(labelItem);

    menu.addEventListener('contextmenu', evt => {
      try{ evt.preventDefault(); }catch(e){}
      try{ evt.stopPropagation(); }catch(e){}
    }, true);

    const hide = (reason) => hidePcaPointContextMenu(reason);
    labelItem.addEventListener('click', evt => {
      try{ evt.preventDefault(); }catch(e){}
      try{ evt.stopPropagation(); }catch(e){}
      const data = menu.__pcaPointData;
      const hot = pcaState.hot || pcaHotInstance || ensurePcaHotForActiveTab?.();
      let columnIndex = Number.isInteger(data?.columnIndex) ? data.columnIndex : null;
      if(columnIndex === null && hot && data?.label){
        columnIndex = resolvePcaColumnIndexFromLabel(hot, data.label);
      }
      if(columnIndex === null){
        hide('no-column-index');
        return;
      }
      const toggled = togglePcaColumnLabel(hot, columnIndex, { ensureVisible: true });
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        debugLog('Debug: pca context menu label toggle', { columnIndex, toggled });
      }
      scheduleDrawPca({ reason: 'point-context-menu' });
      hide('action-complete');
    });

    if(doc.body){
      doc.body.appendChild(menu);
    }
    pcaPointContextMenu = menu;

    if(!pcaPointContextMenuGlobalBound){
      pcaPointContextMenuGlobalBound = true;
      doc.addEventListener('pointerdown', evt => {
        if(!pcaPointContextMenu || pcaPointContextMenu.hidden){
          return;
        }
        const target = evt?.target;
        if(target && pcaPointContextMenu.contains(target)){
          return;
        }
        hidePcaPointContextMenu('outside-click');
      }, true);
      doc.addEventListener('keydown', evt => {
        if(!pcaPointContextMenu || pcaPointContextMenu.hidden){
          return;
        }
        if(evt?.key === 'Escape'){
          hidePcaPointContextMenu('escape');
        }
      }, true);
      global.addEventListener?.('resize', () => hidePcaPointContextMenu('resize'), true);
      global.addEventListener?.('scroll', () => hidePcaPointContextMenu('scroll'), true);
    }

    return pcaPointContextMenu;
  }

  function hidePcaPointContextMenu(reason){
    if(!pcaPointContextMenu || pcaPointContextMenu.hidden){
      return;
    }
    pcaPointContextMenu.hidden = true;
    pcaPointContextMenu.__pcaPointData = null;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: pca point context menu hidden', { reason: reason || 'unknown' });
    }
  }

  function positionPcaPointContextMenu(menu, pageX, pageY){
    if(!menu){
      return;
    }
    const x = Number(pageX) || 0;
    const y = Number(pageY) || 0;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const rect = menu.getBoundingClientRect?.();
    const docEl = global.document?.documentElement;
    const viewportW = global.innerWidth || docEl?.clientWidth || 0;
    const viewportH = global.innerHeight || docEl?.clientHeight || 0;
    if(rect && viewportW && viewportH){
      let nextLeft = x;
      let nextTop = y;
      if(rect.right > viewportW - 6){
        nextLeft = Math.max(6, viewportW - rect.width - 6);
      }
      if(rect.bottom > viewportH - 6){
        nextTop = Math.max(6, viewportH - rect.height - 6);
      }
      menu.style.left = `${nextLeft}px`;
      menu.style.top = `${nextTop}px`;
    }
  }

  function isPcaColumnLabelSelected(hotInstance, columnIndex){
    if(!hotInstance || !Number.isInteger(columnIndex)){
      return false;
    }
    const data = hotInstance.getData?.() || [];
    const labelRowIndex = resolvePcaLabelRowIndex(data);
    if(!Number.isInteger(labelRowIndex)){
      return false;
    }
    const pinnedTopCount = Number.isFinite(hotInstance?.gridApi?.getPinnedTopRowCount?.())
      ? hotInstance.gridApi.getPinnedTopRowCount()
      : getPcaPinnedMetaRowCountForMode();
    const isPinnedRow = labelRowIndex >= 0 && labelRowIndex < pinnedTopCount;
    const current = isPinnedRow
      ? data[labelRowIndex]?.[columnIndex]
      : (typeof hotInstance.getDataAtCell === 'function'
        ? hotInstance.getDataAtCell(labelRowIndex, columnIndex)
        : data[labelRowIndex]?.[columnIndex]);
    return parsePcaPointLabelFlag(current);
  }

  function togglePcaColumnLabel(hotInstance, columnIndex, options){
    if(!hotInstance || !Number.isInteger(columnIndex)){
      return false;
    }
    const data = hotInstance.getData?.() || [];
    const labelRowIndex = (Array.isArray(data[PCA_LABEL_ROW_INDEX]) && isPcaLabelRowHeader(data[PCA_LABEL_ROW_INDEX]?.[0]))
      ? PCA_LABEL_ROW_INDEX
      : resolvePcaLabelRowIndex(data);
    if(!Number.isInteger(labelRowIndex)){
      return false;
    }
    const pinnedTopCount = Number.isFinite(hotInstance?.gridApi?.getPinnedTopRowCount?.())
      ? hotInstance.gridApi.getPinnedTopRowCount()
      : getPcaPinnedMetaRowCountForMode();
    const isPinnedRow = labelRowIndex >= 0 && labelRowIndex < pinnedTopCount;
    const current = isPinnedRow
      ? data[labelRowIndex]?.[columnIndex]
      : (typeof hotInstance.getDataAtCell === 'function'
        ? hotInstance.getDataAtCell(labelRowIndex, columnIndex)
        : data[labelRowIndex]?.[columnIndex]);
    const next = !parsePcaPointLabelFlag(current);
    if(isPinnedRow){
      if(!Array.isArray(data[labelRowIndex])){
        data[labelRowIndex] = [];
      }
      data[labelRowIndex][columnIndex] = next;
      if(typeof hotInstance.render === 'function'){
        hotInstance.render();
      }
    }else if(typeof hotInstance.setDataAtCell === 'function'){
      hotInstance.setDataAtCell([[labelRowIndex, columnIndex, next]], 'pca-point-label-toggle');
    }
    if(options?.ensureVisible){
      const api = hotInstance.gridApi;
      if(api && typeof api.ensureColumnVisible === 'function'){
        try{ api.ensureColumnVisible(columnIndex); }catch(e){}
      }
      if(api && typeof api.ensureIndexVisible === 'function'){
        try{ api.ensureIndexVisible(labelRowIndex, 'middle'); }catch(e){ api.ensureIndexVisible(labelRowIndex); }
      }
    }
    return next;
  }

  function resolvePcaColumnIndexFromLabel(hotInstance, labelText){
    if(!hotInstance || !labelText){
      return null;
    }
    const data = hotInstance.getData?.() || [];
    const labelRowIndex = resolvePcaLabelRowIndex(data);
    const headerRowIndex = resolvePcaHeaderRowIndex(data, labelRowIndex);
    if(!Number.isInteger(headerRowIndex)){
      return null;
    }
    const headerRow = Array.isArray(data[headerRowIndex]) ? data[headerRowIndex] : [];
    const target = String(labelText).trim();
    if(!target){
      return null;
    }
    for(let c = 1; c < headerRow.length; c += 1){
      const headerText = headerRow[c] == null ? '' : String(headerRow[c]).trim();
      if(headerText === target){
        return c;
      }
    }
    return null;
  }

  function showPcaPointContextMenu(evt, data){
    const menu = ensurePcaPointContextMenu();
    if(!menu){
      return;
    }
    menu.__pcaPointData = data || null;
    const hot = pcaState.hot || pcaHotInstance || ensurePcaHotForActiveTab?.();
    let columnIndex = Number.isInteger(data?.columnIndex) ? data.columnIndex : null;
    if(columnIndex === null && hot && data?.label){
      columnIndex = resolvePcaColumnIndexFromLabel(hot, data.label);
    }
    const alreadySelected = columnIndex !== null && hot ? isPcaColumnLabelSelected(hot, columnIndex) : false;
    const labelItem = menu.querySelector?.('button[data-action="toggle-label"]');
    if(labelItem){
      labelItem.textContent = alreadySelected ? 'Remove label' : 'Add label';
      labelItem.disabled = columnIndex === null || !hot;
    }
    menu.hidden = false;
    const pos = getPcaEventPagePosition(evt);
    positionPcaPointContextMenu(menu, pos.x, pos.y);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: pca point context menu shown', { columnIndex, alreadySelected });
    }
  }

  function handlePcaPointContextMenu(evt){
    const target = evt?.currentTarget;
    const data = target?.__pcaPointData;
    if(!data){
      return;
    }
    try{ evt.preventDefault(); }catch(e){}
    try{ evt.stopPropagation(); }catch(e){}
    hidePcaTooltip('context-menu');
    showPcaPointContextMenu(evt, data);
  }

  function handlePcaPointClick(evt){
    const target = evt?.currentTarget;
    if(!target || typeof pcaShowPointFormatControls !== 'function'){
      return;
    }
    try{ evt.stopPropagation(); }catch(e){}
    hidePcaTooltip('point-click');
    pcaShowPointFormatControls(target);
  }

  function bindPcaPlotContextMenuSuppression(node){
    if(!node || node.__pcaContextMenuSuppressionBound){
      return;
    }
    node.__pcaContextMenuSuppressionBound = true;
    node.addEventListener('contextmenu', evt => {
      const target = evt?.target;
      if(isPcaContextMenuEventSuppressed(target)){
        return;
      }
      try{ evt.preventDefault(); }catch(e){}
    }, true);
  }

  function attachPcaPointTooltip(el, data){
    if(!el || !data){ return; }
    el.__pcaPointData = data;
    el.addEventListener('mouseenter', handlePcaPointEnter);
    el.addEventListener('mousemove', handlePcaPointMove);
    el.addEventListener('mouseleave', handlePcaPointLeave);
    el.addEventListener('click', handlePcaPointClick);
    el.addEventListener('contextmenu', handlePcaPointContextMenu);
  }

  function drawShapeOnCanvas(ctx, shape, options){
    if(!ctx){ return; }
    const radius = Math.max(0, Number(options?.radius) || 0);
    if(radius <= 0){ return; }
    const cx = Number(options?.cx) || 0;
    const cy = Number(options?.cy) || 0;
    const fill = options?.fill;
    const stroke = options?.stroke;
    const strokeWidth = Math.max(0, Number(options?.strokeWidth) || 0);
    const opacityRaw = options?.opacity;
    const opacity = Number.isFinite(opacityRaw) ? Math.min(Math.max(opacityRaw, 0), 1) : 1;
    const normalized = GROUP_SHAPE_VALUES.has(shape) ? shape : 'circle';
    const drawFill = typeof fill === 'string' && fill !== 'none';
    const drawStroke = strokeWidth > 0 && typeof stroke === 'string' && stroke !== 'none';
    if(!drawFill && !drawStroke){
      return;
    }
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = strokeWidth;
    if(drawFill){
      ctx.fillStyle = fill;
    }
    if(drawStroke){
      ctx.strokeStyle = stroke;
    }
    const size = Math.max(radius * 2, 2);
    const half = size / 2;
    ctx.beginPath();
    if(normalized === 'square'){
      ctx.rect(cx - half, cy - half, size, size);
    }else if(normalized === 'triangle'){
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy + half);
      ctx.lineTo(cx - half, cy + half);
      ctx.closePath();
    }else if(normalized === 'diamond'){
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy);
      ctx.lineTo(cx, cy + half);
      ctx.lineTo(cx - half, cy);
      ctx.closePath();
    }else if(normalized === 'cross'){
      const bar = Math.max(size / 3, 2);
      const hb = bar / 2;
      ctx.moveTo(cx - half, cy - half + hb);
      ctx.lineTo(cx - half + hb, cy - half);
      ctx.lineTo(cx, cy - hb);
      ctx.lineTo(cx + half - hb, cy - half);
      ctx.lineTo(cx + half, cy - half + hb);
      ctx.lineTo(cx + hb, cy);
      ctx.lineTo(cx + half, cy + half - hb);
      ctx.lineTo(cx + half - hb, cy + half);
      ctx.lineTo(cx, cy + hb);
      ctx.lineTo(cx - half + hb, cy + half);
      ctx.lineTo(cx - half, cy + half - hb);
      ctx.lineTo(cx - hb, cy);
      ctx.closePath();
    }else if(normalized === 'plus'){
      const bar = Math.max(size / 3, 2);
      const hb = bar / 2;
      ctx.moveTo(cx - hb, cy - half);
      ctx.lineTo(cx + hb, cy - half);
      ctx.lineTo(cx + hb, cy - hb);
      ctx.lineTo(cx + half, cy - hb);
      ctx.lineTo(cx + half, cy + hb);
      ctx.lineTo(cx + hb, cy + hb);
      ctx.lineTo(cx + hb, cy + half);
      ctx.lineTo(cx - hb, cy + half);
      ctx.lineTo(cx - hb, cy + hb);
      ctx.lineTo(cx - half, cy + hb);
      ctx.lineTo(cx - half, cy - hb);
      ctx.lineTo(cx - hb, cy - hb);
      ctx.closePath();
    }else if(normalized === 'star'){
      const outer = Math.max(radius, 1);
      const inner = Math.max(outer * 0.45, 1);
      for(let i = 0; i < 5; i += 1){
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const x1 = cx + Math.cos(a) * outer;
        const y1 = cy + Math.sin(a) * outer;
        if(i === 0){
          ctx.moveTo(x1, y1);
        }else{
          ctx.lineTo(x1, y1);
        }
        const b = a + Math.PI / 5;
        const x2 = cx + Math.cos(b) * inner;
        const y2 = cy + Math.sin(b) * inner;
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
    }else{
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    }
    if(drawFill){
      ctx.fill();
    }
    if(drawStroke){
      ctx.stroke();
    }
    ctx.restore();
  }

  function createNoopCanvasContext(){
    const ctx = {};
    const noop = () => {};
    ctx.save = noop;
    ctx.restore = noop;
    ctx.beginPath = noop;
    ctx.closePath = noop;
    ctx.moveTo = noop;
    ctx.lineTo = noop;
    ctx.rect = noop;
    ctx.arc = noop;
    ctx.fill = noop;
    ctx.stroke = noop;
    ctx.clearRect = noop;
    return ctx;
  }

  function debugLog(){
    if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      console.debug.apply(console, arguments);
    }
  }

  function computePcaLabelBounds3d(corners, project){
    if(!Array.isArray(corners) || typeof project !== 'function'){
      return null;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for(let i = 0; i < corners.length; i += 1){
      const projected = project(corners[i]);
      const x = Number(projected?.x);
      const y = Number(projected?.y);
      if(!Number.isFinite(x) || !Number.isFinite(y)){
        continue;
      }
      if(x < minX){ minX = x; }
      if(x > maxX){ maxX = x; }
      if(y < minY){ minY = y; }
      if(y > maxY){ maxY = y; }
    }
    if(!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)){
      return null;
    }
    if(minX === maxX || minY === maxY){
      return null;
    }
    return { minX, maxX, minY, maxY };
  }

  function attachPcaSelectAutoSize(select, label){
    if(!select){ return; }
    if(typeof formControls.attachSelectAutoSize === 'function'){
      formControls.attachSelectAutoSize(select, label || 'pca');
      return;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'pca';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          debugLog('Debug: pca select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          debugLog('Debug: pca select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        debugLog('Debug: pca select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        debugLog('Debug: pca select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
    }
  }

  function clampNumber(value, min, max, fallback){
    const num = Number(value);
    if(!Number.isFinite(num)){
      return fallback;
    }
    const clamped = Math.min(Math.max(num, min), max);
    return clamped;
  }

  function zeroMeanPoints(points){
    if(!Array.isArray(points) || !points.length){ return; }
    const dims = points[0]?.length || 0;
    if(!dims){ return; }
    const means = new Array(dims).fill(0);
    points.forEach(row => {
      if(!row){ return; }
      for(let d=0; d<dims; d+=1){
        means[d] += row[d] || 0;
      }
    });
    for(let d=0; d<dims; d+=1){
      means[d] /= points.length;
    }
    points.forEach(row => {
      if(!row){ return; }
      for(let d=0; d<dims; d+=1){
        row[d] -= means[d];
      }
    });
    return means;
  }

  function computePairwiseSquaredDistances(matrix){
    const n = Array.isArray(matrix) ? matrix.length : 0;
    if(n === 0){ return []; }
    const squared = new Array(n);
    for(let i=0; i<n; i+=1){
      squared[i] = new Float64Array(n);
    }
    for(let i=0; i<n; i+=1){
      squared[i][i] = 0;
      for(let j=i+1; j<n; j+=1){
        let sum = 0;
        const rowI = matrix[i];
        const rowJ = matrix[j];
        for(let k=0; k<rowI.length; k+=1){
          const diff = (rowI[k] || 0) - (rowJ[k] || 0);
          sum += diff * diff;
        }
        squared[i][j] = sum;
        squared[j][i] = sum;
      }
    }
    console.debug('Debug: pairwise distances computed',{ count: n });
    return squared;
  }

  function computeTsneProbabilities(squaredDistances, perplexity){
    const n = squaredDistances.length;
    const targetEntropy = Math.log(Math.max(perplexity, 1));
    const tolerance = 1e-5;
    const maxTries = 50;
    const conditional = new Array(n);
    for(let i=0; i<n; i+=1){
      const betaStats = { beta: 1, betamin: -Infinity, betamax: Infinity };
      const thisP = new Float64Array(n);
      let done = false;
      let tries = 0;
      while(!done && tries < maxTries){
        let sumP = 0;
        let entropy = 0;
        for(let j=0; j<n; j+=1){
          if(i === j){
            thisP[j] = 0;
            continue;
          }
          const val = Math.exp(-squaredDistances[i][j] * betaStats.beta);
          thisP[j] = val;
          sumP += val;
        }
        if(sumP === 0){ sumP = 1; }
        for(let j=0; j<n; j+=1){
          if(i === j){ continue; }
          const p = thisP[j] / sumP;
          entropy += squaredDistances[i][j] * p;
        }
        entropy = Math.log(sumP) + betaStats.beta * entropy;
        const diff = entropy - targetEntropy;
        if(Math.abs(diff) < tolerance){
          done = true;
        } else {
          if(diff > 0){
            betaStats.betamin = betaStats.beta;
            if(!Number.isFinite(betaStats.betamax)){
              betaStats.beta *= 2;
            } else {
              betaStats.beta = (betaStats.beta + betaStats.betamax) / 2;
            }
          } else {
            betaStats.betamax = betaStats.beta;
            if(!Number.isFinite(betaStats.betamin)){
              betaStats.beta /= 2;
            } else {
              betaStats.beta = (betaStats.beta + betaStats.betamin) / 2;
            }
          }
        }
        tries += 1;
      }
      let sumFinal = 0;
      for(let j=0; j<n; j+=1){
        if(i === j){
          thisP[j] = 0;
        } else {
          const val = Math.exp(-squaredDistances[i][j] * betaStats.beta);
          thisP[j] = val;
          sumFinal += val;
        }
      }
      if(sumFinal === 0){ sumFinal = 1; }
      const normalized = new Float64Array(n);
      for(let j=0; j<n; j+=1){
        normalized[j] = i === j ? 0 : thisP[j] / sumFinal;
      }
      conditional[i] = normalized;
    }
    const symmetrized = new Array(n);
    let sumAll = 0;
    for(let i=0; i<n; i+=1){
      symmetrized[i] = new Float64Array(n);
    }
    for(let i=0; i<n; i+=1){
      for(let j=i+1; j<n; j+=1){
        const value = (conditional[i][j] + conditional[j][i]) / (2 * n);
        symmetrized[i][j] = value;
        symmetrized[j][i] = value;
        sumAll += value * 2;
      }
    }
    const normalization = sumAll > 0 ? sumAll : 1;
    for(let i=0; i<n; i+=1){
      for(let j=0; j<n; j+=1){
        symmetrized[i][j] = symmetrized[i][j] / normalization;
      }
    }
    console.debug('Debug: tsne probabilities computed',{ n, perplexity });
    return symmetrized;
  }

  function computeInitialEmbedding(matrix, outputDims, SVDLib){
    const n = Array.isArray(matrix) ? matrix.length : 0;
    if(n === 0){ return []; }
    const dims = Math.max(2, Math.min(outputDims || 2, matrix[0]?.length || 2));
    if(SVDLib && typeof SVDLib.SVD === 'function'){
      try{
        const copy = matrix.map(row => row.slice());
        const svd = SVDLib.SVD(copy);
        const scores = new Array(n).fill(null).map(()=>new Array(dims).fill(0));
        const useDims = Math.min(dims, svd.q.length);
        for(let i=0; i<n; i+=1){
          for(let d=0; d<useDims; d+=1){
            scores[i][d] = svd.u[i][d] * (svd.q[d] || 1);
          }
        }
        zeroMeanPoints(scores);
        console.debug('Debug: initial embedding via PCA',{ dims: useDims });
        return scores;
      }catch(err){
        console.debug('Debug: initial embedding PCA fallback',{ message: err?.message || err });
      }
    }
    const randomInit = new Array(n).fill(null).map(()=>{
      const row = new Array(dims);
      for(let d=0; d<dims; d+=1){
        row[d] = (Math.random() - 0.5) * 1e-3;
      }
      return row;
    });
    zeroMeanPoints(randomInit);
    console.debug('Debug: initial embedding random',{ dims });
    return randomInit;
  }

  function computeTsneEmbedding(matrix, options){
    const opts = options || {};
    const n = Array.isArray(matrix) ? matrix.length : 0;
    const outputDims = Math.min(Math.max(opts.outputDims || 2, 2), 3);
    if(n === 0){
      return { embedding: [], iterations: 0, perplexity: opts.perplexity || DEFAULT_TSNE_SETTINGS.perplexity, klDivergence: 0, learningRate: opts.learningRate || DEFAULT_TSNE_SETTINGS.learningRate, earlyExaggeration: opts.earlyExaggeration || DEFAULT_TSNE_SETTINGS.earlyExaggeration };
    }
    const perplexity = clampNumber(opts.perplexity ?? DEFAULT_TSNE_SETTINGS.perplexity, 1, Math.max(1, n - 1), DEFAULT_TSNE_SETTINGS.perplexity);
    const learningRate = clampNumber(opts.learningRate ?? DEFAULT_TSNE_SETTINGS.learningRate, 10, 2000, DEFAULT_TSNE_SETTINGS.learningRate);
    const iterations = Math.round(clampNumber(opts.iterations ?? DEFAULT_TSNE_SETTINGS.iterations, 200, 3000, DEFAULT_TSNE_SETTINGS.iterations));
    const earlyFraction = typeof opts.earlyIterations === 'number' ? opts.earlyIterations : Math.max(1, Math.round(iterations * (opts.earlyIterationsFraction || DEFAULT_TSNE_SETTINGS.earlyIterationsFraction)));
    const earlyExaggeration = clampNumber(opts.earlyExaggeration ?? DEFAULT_TSNE_SETTINGS.earlyExaggeration, 1, 50, DEFAULT_TSNE_SETTINGS.earlyExaggeration);
    const squaredDistances = computePairwiseSquaredDistances(matrix);
    const probabilities = computeTsneProbabilities(squaredDistances, perplexity);
    const initial = computeInitialEmbedding(matrix, outputDims, opts.SVDLib);
    const embedding = new Array(n);
    for(let i=0; i<n; i+=1){
      embedding[i] = new Float64Array(outputDims);
      for(let d=0; d<outputDims; d+=1){
        embedding[i][d] = initial[i]?.[d] ?? (Math.random() - 0.5) * 1e-4;
      }
    }
    zeroMeanPoints(embedding);
    const gains = new Array(n).fill(null).map(()=>new Float64Array(outputDims).fill(1));
    const yIncs = new Array(n).fill(null).map(()=>new Float64Array(outputDims));
    const grads = new Array(n).fill(null).map(()=>new Float64Array(outputDims));
    const num = new Array(n).fill(null).map(()=>new Float64Array(n));
    let finalKl = 0;
    for(let iter=0; iter<iterations; iter+=1){
      let sumQ = 0;
      for(let i=0; i<n; i+=1){
        const Yi = embedding[i];
        for(let j=i+1; j<n; j+=1){
          const Yj = embedding[j];
          let distSq = 0;
          for(let d=0; d<outputDims; d+=1){
            const diff = Yi[d] - Yj[d];
            distSq += diff * diff;
          }
          const val = 1 / (1 + distSq);
          num[i][j] = val;
          num[j][i] = val;
          sumQ += 2 * val;
        }
        num[i][i] = 0;
      }
      sumQ = Math.max(sumQ, 1e-12);
      for(let i=0; i<n; i+=1){
        const gradRow = grads[i];
        for(let d=0; d<outputDims; d+=1){ gradRow[d] = 0; }
      }
      let kl = 0;
      for(let i=0; i<n; i+=1){
        for(let j=0; j<n; j+=1){
          if(i === j){ continue; }
          const pij = probabilities[i][j] * (iter < earlyFraction ? earlyExaggeration : 1);
          const qijRaw = num[i][j];
          const qij = qijRaw / sumQ;
          const mult = 4 * (pij - qij) * qijRaw;
          if(pij > 1e-12 && qij > 1e-12){
            kl += pij * Math.log(pij / qij);
          }
          for(let d=0; d<outputDims; d+=1){
            grads[i][d] += mult * (embedding[i][d] - embedding[j][d]);
          }
        }
      }
      finalKl = kl;
      const momentum = iter < earlyFraction ? 0.5 : 0.8;
      for(let i=0; i<n; i+=1){
        for(let d=0; d<outputDims; d+=1){
          const gradVal = grads[i][d];
          const inc = yIncs[i][d];
          const gain = gains[i][d];
          const signChanged = Math.sign(gradVal) !== Math.sign(inc) && inc !== 0;
          const newGain = signChanged ? gain + 0.2 : gain * 0.8;
          gains[i][d] = newGain < 0.01 ? 0.01 : newGain;
          const updatedInc = momentum * inc - learningRate * gains[i][d] * gradVal;
          yIncs[i][d] = updatedInc;
          embedding[i][d] += updatedInc;
        }
      }
      zeroMeanPoints(embedding);
      if(iter % 50 === 0 || iter === iterations - 1){
        console.debug('Debug: tsne iteration',{ iteration: iter + 1, iterations, kl });
      }
    }
    const finalEmbedding = embedding.map(row => Array.from(row));
    return {
      embedding: finalEmbedding,
      iterations,
      perplexity,
      klDivergence: finalKl,
      learningRate,
      earlyExaggeration,
      earlyIterations: earlyFraction
    };
  }

  function computeSimpleUmapEmbedding(matrix, options){
    const opts = options || {};
    const n = Array.isArray(matrix) ? matrix.length : 0;
    const outputDims = Math.min(Math.max(opts.outputDims || 2, 2), 3);
    if(n === 0){
      return { embedding: [], epochs: 0, neighbors: opts.neighbors || DEFAULT_UMAP_SETTINGS.neighbors, minDist: opts.minDist || DEFAULT_UMAP_SETTINGS.minDist, learningRate: opts.learningRate || DEFAULT_UMAP_SETTINGS.learningRate };
    }
    const neighbors = Math.round(clampNumber(opts.neighbors ?? DEFAULT_UMAP_SETTINGS.neighbors, 2, Math.max(2, n - 1), DEFAULT_UMAP_SETTINGS.neighbors));
    const minDist = clampNumber(opts.minDist ?? DEFAULT_UMAP_SETTINGS.minDist, 0, 0.99, DEFAULT_UMAP_SETTINGS.minDist);
    const learningRate = clampNumber(opts.learningRate ?? DEFAULT_UMAP_SETTINGS.learningRate, 0.01, 10, DEFAULT_UMAP_SETTINGS.learningRate);
    const epochs = Math.round(clampNumber(opts.epochs ?? DEFAULT_UMAP_SETTINGS.epochs, 50, 5000, DEFAULT_UMAP_SETTINGS.epochs));
    const negativeSampleRate = Math.round(clampNumber(opts.negativeSampleRate ?? DEFAULT_UMAP_SETTINGS.negativeSampleRate, 1, 50, DEFAULT_UMAP_SETTINGS.negativeSampleRate));
    const squared = computePairwiseSquaredDistances(matrix);
    const neighborGraph = new Array(n).fill(null).map(()=>[]);
    for(let i=0; i<n; i+=1){
      const candidates = [];
      for(let j=0; j<n; j+=1){
        if(i === j){ continue; }
        candidates.push({ index: j, dist: Math.sqrt(Math.max(squared[i][j], 0)) });
      }
      candidates.sort((a,b)=>a.dist-b.dist);
      const limit = Math.min(neighbors, candidates.length);
      let rho = limit > 0 ? candidates[0].dist : 0;
      const target = Math.log2(Math.max(neighbors, 2));
      let sigma = 1;
      let low = 0;
      let high = Infinity;
      for(let attempt=0; attempt<30; attempt+=1){
        let sum = 0;
        for(let k=0; k<limit; k+=1){
          const d = candidates[k].dist;
          const weight = d - rho <= 0 ? 1 : Math.exp(-(d - rho) / sigma);
          sum += weight;
        }
        const diff = sum - target;
        if(Math.abs(diff) < 1e-3){
          break;
        }
        if(diff > 0){
          high = sigma;
          sigma = low === 0 ? sigma / 2 : (sigma + low) / 2;
        } else {
          low = sigma;
          sigma = Number.isFinite(high) ? (sigma + high) / 2 : sigma * 2;
        }
      }
      for(let k=0; k<limit; k+=1){
        const cand = candidates[k];
        const d = cand.dist;
        const weight = d - rho <= 0 ? 1 : Math.exp(-(d - rho) / Math.max(sigma, 1e-6));
        neighborGraph[i].push({ index: cand.index, weight });
      }
    }
    const weightMatrix = new Array(n).fill(null).map(()=>new Map());
    neighborGraph.forEach((list, i)=>{
      list.forEach(entry => {
        weightMatrix[i].set(entry.index, entry.weight);
      });
    });
    const edges = [];
    for(let i=0; i<n; i+=1){
      neighborGraph[i].forEach(entry => {
        const j = entry.index;
        if(i >= j){ return; }
        const rev = weightMatrix[j]?.get(i) || 0;
        const combined = entry.weight + rev - entry.weight * rev;
        if(combined > 1e-6){
          edges.push({ i, j, weight: combined });
          weightMatrix[i].set(j, combined);
          weightMatrix[j]?.set?.(i, combined);
        }
      });
    }
    const initial = computeInitialEmbedding(matrix, outputDims, opts.SVDLib);
    const embedding = initial.map(row => new Float64Array(row));
    zeroMeanPoints(embedding);
    const rand = Math.random;
    for(let epoch=0; epoch<epochs; epoch+=1){
      const lr = learningRate * (1 - epoch / Math.max(1, epochs));
      for(let e=0; e<edges.length; e+=1){
        const edge = edges[e];
        const source = embedding[edge.i];
        const target = embedding[edge.j];
        let distSq = 0;
        for(let d=0; d<outputDims; d+=1){
          const diff = source[d] - target[d];
          distSq += diff * diff;
        }
        const dist = Math.sqrt(distSq) + 1e-9;
        const force = edge.weight * (dist - minDist);
        const step = lr * force / dist;
        for(let d=0; d<outputDims; d+=1){
          const delta = step * (source[d] - target[d]);
          source[d] -= delta;
          target[d] += delta;
        }
        for(let nSample=0; nSample<negativeSampleRate; nSample+=1){
          let negIndex = Math.floor(rand() * n);
          if(negIndex === edge.i || negIndex === edge.j){ continue; }
          const other = embedding[negIndex];
          let negDistSq = 0;
          for(let d=0; d<outputDims; d+=1){
            const diff = source[d] - other[d];
            negDistSq += diff * diff;
          }
          const repel = lr / (1 + negDistSq);
          for(let d=0; d<outputDims; d+=1){
            const diff = source[d] - other[d];
            const adjust = repel * diff;
            source[d] += adjust;
            other[d] -= adjust;
          }
        }
      }
      if((epoch + 1) % 10 === 0){
        zeroMeanPoints(embedding);
      }
      if(epoch % 50 === 0 || epoch === epochs - 1){
        console.debug('Debug: umap epoch',{ epoch: epoch + 1, epochs });
      }
    }
    zeroMeanPoints(embedding);
    const finalEmbedding = embedding.map(row => Array.from(row));
    return {
      embedding: finalEmbedding,
      epochs,
      neighbors,
      minDist,
      learningRate,
      negativeSampleRate
    };
  }

  function shouldUsePcaSvdWorker(nSamples, nFeatures){
    const workerApi = Shared.Workers;
    if(!workerApi || typeof workerApi.isSupported !== 'function' || !workerApi.isSupported()){
      return false;
    }
    const samples = Math.max(0, Number(nSamples) || 0);
    const features = Math.max(0, Number(nFeatures) || 0);
    const cells = samples * features;
    return samples >= PCA_SVD_WORKER.minSamples
      || features >= PCA_SVD_WORKER.minFeatures
      || cells >= PCA_SVD_WORKER.minCells;
  }

  async function runPcaSvdWorker(matrix, nSamples, nFeatures){
    const workerApi = Shared.Workers;
    if(!workerApi || typeof workerApi.runTask !== 'function'){
      return null;
    }
    try{
      const result = await workerApi.runTask({
        name: 'pca-svd',
        url: PCA_SVD_WORKER.url,
        action: 'pca-svd',
        payload: { matrix, nSamples, nFeatures },
        timeoutMs: PCA_SVD_WORKER.timeoutMs
      });
      if(!result || !Array.isArray(result.q)){
        return null;
      }
      return result;
    }catch(err){
      debugLog('Debug: pca worker failed', { message: err?.message || String(err) });
      return null;
    }
  }

  function shouldUsePcaEmbedWorker(method, nSamples, nFeatures){
    const workerApi = Shared.Workers;
    if(!workerApi || typeof workerApi.isSupported !== 'function' || !workerApi.isSupported()){
      return false;
    }
    const samples = Math.max(0, Number(nSamples) || 0);
    const features = Math.max(0, Number(nFeatures) || 0);
    const cells = samples * features;
    if(method === 'mds'){
      return samples >= PCA_EMBED_WORKER.minSamples || cells >= PCA_EMBED_WORKER.minCells;
    }
    return samples >= PCA_EMBED_WORKER.minSamples;
  }

  async function runPcaEmbedWorker(method, payload){
    const workerApi = Shared.Workers;
    if(!workerApi || typeof workerApi.runTask !== 'function'){
      return null;
    }
    const action = method === 'mds' ? 'mds' : (method === 'tsne' ? 'tsne' : (method === 'umap' ? 'umap' : null));
    if(!action){
      return null;
    }
    try{
      const result = await workerApi.runTask({
        name: `pca-${action}`,
        url: PCA_EMBED_WORKER.url,
        action,
        payload,
        timeoutMs: PCA_EMBED_WORKER.timeoutMs
      });
      if(!result){
        return null;
      }
      return result;
    }catch(err){
      debugLog('Debug: pca embed worker failed', { method, message: err?.message || String(err) });
      return null;
    }
  }

  let scheduleDrawPcaRaw = () => {};
  let pcaFontEventBound = false;
  let pendingDrawOptions = {};
  let pcaDataDrawTimer = null;
  const PCA_DATA_DRAW_DEBOUNCE_SMALL_MS = 24;
  const PCA_DATA_DRAW_DEBOUNCE_MEDIUM_MS = 72;
  const PCA_DATA_DRAW_DEBOUNCE_LARGE_MS = 180;
  function normalizeDrawOptions(options){
    if(!options){
      return {};
    }
    if(typeof options === 'string'){
      return { reason: options };
    }
    if(typeof options === 'object'){
      return options;
    }
    return {};
  }
  function updateAutoDrawUi(meta = {}){
    if(pcaRenderRowEl && pcaRenderRowEl.hidden !== true){
      pcaRenderRowEl.hidden = true;
    }
    if(pcaRenderButtonEl && pcaRenderButtonEl.hidden !== true){
      pcaRenderButtonEl.hidden = true;
      pcaRenderButtonEl.disabled = true;
    }
    if(pcaAutoDrawNoticeEl){
      if(pcaAutoDrawNoticeEl.hidden !== true){
        pcaAutoDrawNoticeEl.hidden = true;
      }
      if(pcaAutoDrawNoticeEl.textContent){
        pcaAutoDrawNoticeEl.textContent = '';
      }
      schedulePcaNoticeWidth('ui-update');
    }
    if(meta && meta.reason){
      debugLog('Debug: pca live-update UI normalized', { reason: meta.reason });
    }
  }
  function updatePcaDataShape(shape){
    if(!shape || typeof shape !== 'object'){
      return;
    }
    const rawRows = Number(shape.rows);
    const rawCols = Number(shape.cols);
    const rows = Number.isFinite(rawRows) ? rawRows : pcaState.lastDataShape.rows;
    const cols = Number.isFinite(rawCols) ? rawCols : pcaState.lastDataShape.cols;
    if(rows === pcaState.lastDataShape.rows && cols === pcaState.lastDataShape.cols){
      return;
    }
    pcaState.lastDataShape = { rows, cols };
    debugLog('Debug: pca data shape updated', { rows, cols });
  }
  function evaluateAutoDrawThresholds(meta = {}){
    const hot = ensurePcaHotForActiveTab();
    const perfStart = nowMs();
    let totalRows = 0;
    let totalCols = 0;
    if(hot){
      if(typeof hot.countSourceRows === 'function'){
        totalRows = Number(hot.countSourceRows()) || 0;
      }else if(typeof hot.countRows === 'function'){
        totalRows = Number(hot.countRows()) || 0;
      }
      if(typeof hot.countSourceCols === 'function'){
        totalCols = Number(hot.countSourceCols()) || 0;
      }else if(typeof hot.countCols === 'function'){
        totalCols = Number(hot.countCols()) || 0;
      }
      if(typeof Shared.hot?.estimateFilledShape === 'function'){
        const filled = Shared.hot.estimateFilledShape(hot);
        if(Number.isFinite(filled?.rows) && filled.rows >= 0){
          totalRows = filled.rows;
        }
        if(Number.isFinite(filled?.cols) && filled.cols >= 0){
          totalCols = filled.cols;
        }
      }
    }
    updatePcaDataShape({ rows: totalRows, cols: totalCols });
    recordPcaPerformance('evaluation', {
      source: meta?.source || null,
      rows: totalRows,
      cols: totalCols,
      featureEstimate: Math.max(0, totalRows - 1),
      cellEstimate: totalRows * Math.max(1, totalCols),
      thresholdExceeded: false,
      totalMs: nowMs() - perfStart
    });
    updateAutoDrawUi(meta);
    return { autoDrawEnabled: true, disabledNow: false, reason: null };
  }
  function resolvePcaDataDrawDebounceMs(reason){
    if(global.__PCA_DISABLE_DATA_COALESCE === true){
      return 0;
    }
    const normalizedReason = String(reason || '').trim();
    if(normalizedReason === 'afterLoadData'
      || normalizedReason === 'afterCreateRow'
      || normalizedReason === 'afterCreateCol'){
      return 420;
    }
    const rows = Number.isFinite(pcaState.lastDataShape?.rows) ? Number(pcaState.lastDataShape.rows) : 0;
    const cols = Number.isFinite(pcaState.lastDataShape?.cols) ? Number(pcaState.lastDataShape.cols) : 0;
    const cells = rows * Math.max(1, cols);
    if(rows >= 20000 || cells >= 200000){
      return PCA_DATA_DRAW_DEBOUNCE_LARGE_MS;
    }
    if(rows >= 4000 || cells >= 60000){
      return PCA_DATA_DRAW_DEBOUNCE_MEDIUM_MS;
    }
    return PCA_DATA_DRAW_DEBOUNCE_SMALL_MS;
  }
  function flushCoalescedPcaDataDraw(reason){
    if(pcaDataDrawTimer){
      (global.clearTimeout || clearTimeout)(pcaDataDrawTimer);
      pcaDataDrawTimer = null;
    }
    evaluateAutoDrawThresholds({ reason: reason || 'data-draw' });
    updateAutoDrawUi({ reason: reason || 'data-draw' });
    if(typeof scheduleDrawPcaRaw === 'function'){
      scheduleDrawPcaRaw();
    }
  }
  function mergePendingDrawOptions(opts){
    const previous = pendingDrawOptions || {};
    if(!opts || typeof opts !== 'object'){
      if(previous.viewOnly){
        pendingDrawOptions = { ...previous };
        return;
      }
      pendingDrawOptions = {};
      return;
    }
    const next = { ...previous, ...opts };
    if(opts.force){
      next.viewOnly = false;
    } else if(Object.prototype.hasOwnProperty.call(opts, 'viewOnly')){
      next.viewOnly = !!opts.viewOnly;
    } else if(previous.viewOnly){
      next.viewOnly = true;
    } else {
      next.viewOnly = false;
    }
    if(!Object.prototype.hasOwnProperty.call(opts, 'reason') && previous.viewOnly && next.viewOnly){
      next.reason = previous.reason;
    }
    pendingDrawOptions = next;
  }
  function scheduleDrawPcaWrapper(options){
    const opts = normalizeDrawOptions(options);
    if(!opts.force
      && !Object.prototype.hasOwnProperty.call(opts, 'viewOnly')
      && !pcaState.dataDirty){
      opts.viewOnly = true;
    }
    mergePendingDrawOptions(opts);
    if(opts.viewOnly){
      if(pcaDataDrawTimer){
        (global.clearTimeout || clearTimeout)(pcaDataDrawTimer);
        pcaDataDrawTimer = null;
      }
      if(typeof scheduleDrawPcaRaw === 'function'){
        scheduleDrawPcaRaw();
      }
      return;
    }
    if(opts.force){
      flushCoalescedPcaDataDraw(opts.reason || 'force');
      return;
    }
    const debounceMs = resolvePcaDataDrawDebounceMs(opts.reason);
    if(debounceMs <= 0){
      flushCoalescedPcaDataDraw(opts.reason || 'data-draw');
      return;
    }
    if(pcaDataDrawTimer){
      (global.clearTimeout || clearTimeout)(pcaDataDrawTimer);
    }
    pcaDataDrawTimer = (global.setTimeout || setTimeout)(() => {
      pcaDataDrawTimer = null;
      flushCoalescedPcaDataDraw(opts.reason || 'data-draw');
    }, debounceMs);
  }
  let scheduleDrawPca = scheduleDrawPcaWrapper;
  let lastPcaStats = null;
  const pcaState = {
    axisSelection: { x: 1, y: 2, z: 3 },
    axisMeta: [],
    rotation: plot3d.createRotationState({ x: PCA_3D_DEFAULTS.rotationX, y: PCA_3D_DEFAULTS.rotationY }),
    rotationPending: false,
    rotationPendingLogged: false,
    axesVarianceScaled: false,
    equalScaleAxes: true,
    equalAxes: false,
    axisSettings: createDefaultAxisSettings(),
    gridStyle: null,
      tableFormat: 'standard',
    grouped: {
      replicatesPerGroup: 2,
      colors: [],
      shapes: []
    },
    componentSelection: {
      rule: PCA_DEFAULT_COMPONENT_SELECTION_RULE,
      eigenThreshold: PCA_DEFAULT_EIGEN_THRESHOLD,
      parallelIterations: PCA_DEFAULT_PARALLEL_ITERATIONS
    },
    loadingsLimit: PCA_LOADINGS_ROW_LIMIT,
    labels: { title: getDefaultTitleForMethod('pca') },
    lastMethod: 'pca',
    lastAutoDrawEvaluation: null,
    lastDataShape: { rows: 0, cols: 0 },
    performance: { loadData: null, draw: null, evaluation: null },
    fastPointMode: false,
    cachedRender: null,
    drawToken: 0,
    dataDirty: true,
    viewDirty: true,
    labelPositions: { title: null, xLabel: null, yLabel: null, legend: null },
    theme: {
      colorScheme: 'scientific',
      textColor: chartStyle.TEXT_COLOR || '#000000',
      backgroundColor: '#ffffff'
    }
  };
  pcaState.scheduleDraw = (opts) => scheduleDrawPca(opts);
  let emptyPayloadTemplate = null;

  function normalizePcaThemeColor(value, fallback){
    return (typeof value === 'string' && value.trim()) ? value.trim() : fallback;
  }

  function applyPcaThemeConfig(config){
    const cfg = config && typeof config === 'object' ? config : {};
    const schemeId = typeof cfg.colorScheme === 'string' && cfg.colorScheme.trim()
      ? cfg.colorScheme.trim().toLowerCase()
      : (pcaState.theme?.colorScheme || 'scientific');
    const isDark = schemeId === 'dark';
    if(!pcaState.theme || typeof pcaState.theme !== 'object'){
      pcaState.theme = {};
    }
    pcaState.theme.colorScheme = schemeId || 'scientific';
    pcaState.theme.textColor = normalizePcaThemeColor(
      cfg.textColor,
      isDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000')
    );
    pcaState.theme.backgroundColor = normalizePcaThemeColor(
      cfg.backgroundColor,
      isDark ? '#000000' : '#ffffff'
    );
  }

  function appendPca3dBackground(svg, width, height){
    if(!svg || String(pcaState.theme?.colorScheme || '').toLowerCase() !== 'dark'){
      return;
    }
    const bg = svg.ownerDocument.createElementNS(NS, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(Math.max(1, Number(width) || 0)));
    bg.setAttribute('height', String(Math.max(1, Number(height) || 0)));
    bg.setAttribute('fill', normalizePcaThemeColor(pcaState.theme?.backgroundColor, '#000000'));
    bg.setAttribute('pointer-events', 'none');
    bg.setAttribute('data-color-scheme-background', '1');
    svg.appendChild(bg);
  }

  function resetPcaRotation(reason){
    if(typeof plot3d.createRotationState !== 'function'){
      pcaState.rotation.x = PCA_3D_DEFAULTS.rotationX;
      pcaState.rotation.y = PCA_3D_DEFAULTS.rotationY;
      pcaState.rotation.z = 0;
      pcaState.rotation.quaternion = null;
      debugLog('Debug: pca rotation reset (fallback)', { reason, rotation: { x: pcaState.rotation.x, y: pcaState.rotation.y, z: pcaState.rotation.z } });
      return;
    }
    const defaults = plot3d.createRotationState({
      x: PCA_3D_DEFAULTS.rotationX,
      y: PCA_3D_DEFAULTS.rotationY
    });
    pcaState.rotation.x = defaults.x;
    pcaState.rotation.y = defaults.y;
    pcaState.rotation.z = defaults.z || 0;
    pcaState.rotation.quaternion = defaults.quaternion
      ? { w: defaults.quaternion.w, x: defaults.quaternion.x, y: defaults.quaternion.y, z: defaults.quaternion.z }
      : null;
    if(typeof plot3d.normalizeRotation === 'function'){
      plot3d.normalizeRotation(pcaState.rotation);
    }
    debugLog('Debug: pca rotation reset', { reason, rotation: { x: pcaState.rotation.x, y: pcaState.rotation.y, z: pcaState.rotation.z } });
  }

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('pca cloneSimple error', err);
      return null;
    }
  }

  function sanitizePcaComponentSelectionRule(value){
    const normalized = String(value || '').trim().toLowerCase();
    return PCA_COMPONENT_SELECTION_RULES.some(entry => entry.value === normalized)
      ? normalized
      : PCA_DEFAULT_COMPONENT_SELECTION_RULE;
  }

  function sanitizePcaEigenThreshold(value, fallback = PCA_DEFAULT_EIGEN_THRESHOLD){
    const numeric = Number(value);
    if(Number.isFinite(numeric) && numeric > 0 && numeric <= 100){
      return numeric;
    }
    return fallback;
  }

  function sanitizePcaParallelIterations(value, fallback = PCA_DEFAULT_PARALLEL_ITERATIONS){
    const numeric = Math.round(Number(value));
    if(Number.isFinite(numeric) && numeric >= 25 && numeric <= PCA_MAX_PARALLEL_ITERATIONS){
      return numeric;
    }
    return fallback;
  }

  function getPcaComponentSelectionRuleLabel(value){
    const normalized = sanitizePcaComponentSelectionRule(value);
    const match = PCA_COMPONENT_SELECTION_RULES.find(entry => entry.value === normalized);
    return match?.label || 'Parallel analysis';
  }

  function createPcaSeededRandom(seed){
    let stateValue = (Number(seed) || 1) >>> 0;
    return function nextRandom(){
      stateValue = (stateValue * 1664525 + 1013904223) >>> 0;
      return stateValue / 4294967296;
    };
  }

  function shufflePcaArray(values, random){
    const list = Array.isArray(values) ? values.slice() : [];
    const nextRandom = typeof random === 'function' ? random : Math.random;
    for(let idx = list.length - 1; idx > 0; idx -= 1){
      const swapIndex = Math.floor(nextRandom() * (idx + 1));
      const temp = list[idx];
      list[idx] = list[swapIndex];
      list[swapIndex] = temp;
    }
    return list;
  }

  function quantileFromSortedPca(sortedValues, probability){
    const list = Array.isArray(sortedValues) ? sortedValues : [];
    if(!list.length){
      return NaN;
    }
    if(list.length === 1){
      return Number(list[0]) || 0;
    }
    const bounded = Math.min(1, Math.max(0, Number(probability) || 0));
    const position = (list.length - 1) * bounded;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(list.length - 1, lowerIndex + 1);
    const remainder = position - lowerIndex;
    const lowerValue = Number(list[lowerIndex]) || 0;
    const upperValue = Number(list[upperIndex]) || 0;
    return lowerValue + (upperValue - lowerValue) * remainder;
  }

  function transposePcaMatrix(matrix){
    const rows = Array.isArray(matrix) ? matrix.length : 0;
    const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
    const transposed = Array.from({ length: cols }, () => new Array(rows));
    for(let rowIdx = 0; rowIdx < rows; rowIdx += 1){
      const row = Array.isArray(matrix[rowIdx]) ? matrix[rowIdx] : [];
      for(let colIdx = 0; colIdx < cols; colIdx += 1){
        transposed[colIdx][rowIdx] = row[colIdx];
      }
    }
    return transposed;
  }

  function computePcaParallelAnalysis(matrix, svdLib, options = {}){
    const rows = Array.isArray(matrix) ? matrix.length : 0;
    const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
    if(rows < 3 || cols < 2 || !svdLib || typeof svdLib.SVD !== 'function'){
      return null;
    }
    if((rows * cols) > PCA_PARALLEL_MAX_CELLS){
      return {
        iterations: 0,
        averageEigenvalues: [],
        percentile95Eigenvalues: [],
        skipped: true,
        reason: 'Skipped for large matrices to keep PCA updates responsive.'
      };
    }
    const componentCount = Math.max(1, Math.min(rows, cols));
    const iterationCount = sanitizePcaParallelIterations(options.iterations, PCA_DEFAULT_PARALLEL_ITERATIONS);
    const seedBase = (rows * 73856093) ^ (cols * 19349663) ^ (iterationCount * 83492791);
    const random = createPcaSeededRandom(seedBase);
    const useTransposed = rows < cols;
    const columns = Array.from({ length: cols }, (_, colIdx) =>
      Array.from({ length: rows }, (_, rowIdx) => Number(matrix?.[rowIdx]?.[colIdx]) || 0)
    );
    const averages = new Array(componentCount).fill(0);
    const percentileBuffers = Array.from({ length: componentCount }, () => []);
    for(let iter = 0; iter < iterationCount; iter += 1){
      const permuted = Array.from({ length: rows }, () => Array(cols).fill(0));
      for(let colIdx = 0; colIdx < cols; colIdx += 1){
        const shuffled = shufflePcaArray(columns[colIdx], random);
        for(let rowIdx = 0; rowIdx < rows; rowIdx += 1){
          permuted[rowIdx][colIdx] = shuffled[rowIdx];
        }
      }
      const matrixForSvd = useTransposed ? transposePcaMatrix(permuted) : permuted;
      const svd = svdLib.SVD(matrixForSvd);
      const singularValues = (Array.isArray(svd?.q) ? svd.q : [])
        .map(value => Number(value) || 0)
        .sort((a, b) => b - a);
      for(let componentIdx = 0; componentIdx < componentCount; componentIdx += 1){
        const singularValue = singularValues[componentIdx] || 0;
        const eigenvalue = (singularValue * singularValue) / Math.max(rows - 1, 1);
        averages[componentIdx] += eigenvalue;
        percentileBuffers[componentIdx].push(eigenvalue);
      }
    }
    const averageEigenvalues = averages.map(value => value / Math.max(iterationCount, 1));
    const percentile95Eigenvalues = percentileBuffers.map(values => {
      const sorted = values.slice().sort((a, b) => a - b);
      return quantileFromSortedPca(sorted, 0.95);
    });
    return {
      iterations: iterationCount,
      averageEigenvalues,
      percentile95Eigenvalues
    };
  }

  function computePcaComponentSelectionSummary(eigenSummary, matrix, svdLib, options = {}){
    const entries = Array.isArray(eigenSummary) ? eigenSummary : [];
    if(!entries.length){
      return null;
    }
    const rule = sanitizePcaComponentSelectionRule(options.rule);
    const threshold = sanitizePcaEigenThreshold(options.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD);
    const parallel = computePcaParallelAnalysis(matrix, svdLib, {
      iterations: options.parallelIterations
    });
    const kaiserCount = entries.filter(entry => Number(entry?.eigenvalue) >= 1).length;
    const thresholdCount = entries.filter(entry => Number(entry?.eigenvalue) >= threshold).length;
    const parallelAvailable = !!(parallel && Array.isArray(parallel.percentile95Eigenvalues) && parallel.percentile95Eigenvalues.length);
    const parallelCount = parallelAvailable
      ? entries.filter((entry, idx) => Number(entry?.eigenvalue) > (parallel.percentile95Eigenvalues[idx] || 0)).length
      : 0;
    const ruleLabel = rule === 'parallel' && !parallelAvailable
      ? 'Parallel analysis (Kaiser fallback)'
      : getPcaComponentSelectionRuleLabel(rule);
    const retainedCount = rule === 'kaiser'
      ? kaiserCount
      : rule === 'threshold'
        ? thresholdCount
        : rule === 'all'
          ? entries.length
          : (parallelAvailable ? parallelCount : kaiserCount);
    return {
      rule,
      ruleLabel,
      retainedCount,
      threshold,
      kaiserCount,
      thresholdCount,
      parallelCount,
      parallelIterations: parallel?.iterations || null,
      parallelAnalysis: parallel,
      rows: [
        {
          criterion: 'Selected rule',
          threshold: rule === 'threshold' ? `Eigenvalue >= ${threshold.toFixed(2)}` : '—',
          retained: String(retainedCount),
          detail: ruleLabel
        },
        {
          criterion: 'Kaiser',
          threshold: 'Eigenvalue > 1',
          retained: String(kaiserCount),
          detail: 'Counts components above the classical Kaiser cutoff.'
        },
        {
          criterion: 'Parallel analysis',
          threshold: parallelAvailable ? 'Observed > random 95th percentile' : 'Unavailable',
          retained: parallelAvailable ? String(parallelCount) : '—',
          detail: parallelAvailable
            ? `${parallel.iterations} permutations`
            : (parallel?.reason || 'Requires PCA eigenvalues and SVD support.')
        },
        {
          criterion: 'Custom threshold',
          threshold: `Eigenvalue >= ${threshold.toFixed(2)}`,
          retained: String(thresholdCount),
          detail: 'User-defined eigenvalue cutoff.'
        }
      ]
    };
  }

  function buildPcaBiplotSnapshot(points, loadingsRows, axisLabels = {}){
    const pointList = Array.isArray(points) ? points.slice(0, PCA_BIPLOT_POINT_LIMIT) : [];
    const vectors = (Array.isArray(loadingsRows) ? loadingsRows : [])
      .slice(0, PCA_BIPLOT_VECTOR_LIMIT)
      .map(row => ({
        label: row?.label || 'Variable',
        x: Number(row?.values?.[0]) || 0,
        y: Number(row?.values?.[1]) || 0
      }))
      .filter(vector => Number.isFinite(vector.x) && Number.isFinite(vector.y));
    return {
      points: pointList.map(point => ({
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
        label: point?.label || ''
      })),
      vectors,
      xLabel: axisLabels.x || 'PC1',
      yLabel: axisLabels.y || 'PC2'
    };
  }

  function nowMs(){
    try{
      if(typeof global.performance === 'object' && typeof global.performance.now === 'function'){
        return global.performance.now();
      }
    }catch(err){ /* ignore */ }
    try{
      if(typeof performance === 'object' && typeof performance.now === 'function'){
        return performance.now();
      }
    }catch(err){ /* ignore */ }
    return Date.now();
  }
  function ensurePcaPerformanceState(){
    if(pcaState.performance && typeof pcaState.performance === 'object'){
      return pcaState.performance;
    }
    pcaState.performance = { loadData: null, draw: null, evaluation: null };
    return pcaState.performance;
  }
  function recordPcaPerformance(section, data){
    if(!section){
      return;
    }
    const perfState = ensurePcaPerformanceState();
    const previous = perfState[section] || {};
    const payload = { timestamp: Date.now(), ...(data || {}) };
    if(section === 'draw' && typeof previous.totalMs === 'number' && typeof payload.totalMs === 'number'){
      payload.totalMs = Math.max(previous.totalMs, payload.totalMs);
    }
    perfState[section] = payload;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: pca performance mark', { section, payload });
    }
  }
  function markPcaDataDirty(reason){
    pcaState.dataDirty = true;
    pcaState.viewDirty = true;
    pcaState.cachedRender = null;
    if(reason && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: pca data marked dirty',{ reason });
    }
  }
  function markPcaViewDirty(reason){
    if(!pcaState.viewDirty){
      pcaState.viewDirty = true;
      if(reason && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        debugLog('Debug: pca view marked dirty',{ reason });
      }
    }
  }
  function requestPcaDataRefresh(reason){
    markPcaDataDirty(reason);
    const options = reason ? { reason } : {};
    scheduleDrawPca(options);
  }
  function requestPcaViewRefresh(reason){
    markPcaViewDirty(reason);
    if(!pcaState.cachedRender){
      markPcaDataDirty(reason || 'view-refresh-no-cache');
      const options = reason ? { reason } : {};
      scheduleDrawPca(options);
      return;
    }
    const options = { viewOnly: true };
    if(reason){ options.reason = reason; }
    scheduleDrawPca(options);
  }

  function isPcaFontStyleEvent(detail){
    const scopeId = detail?.scopeId || null;
    const storeKey = typeof detail?.storeKey === 'string' ? detail.storeKey : '';
    return scopeId === 'pca' || storeKey.startsWith('pca::');
  }

  function ensurePcaFontEventListener(){
    if(pcaFontEventBound || !global.document || typeof global.document.addEventListener !== 'function'){
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if(!isPcaFontStyleEvent(detail)){
        return;
      }
      requestPcaViewRefresh('font-style-change');
    });
    pcaFontEventBound = true;
  }

  const pcaUndoManager = Shared.undoManager || null;
  function recordPcaChange(label, previous, next, apply){
    if(!pcaUndoManager || typeof pcaUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    pcaUndoManager.recordStateChange({
      label,
      scope: 'pcaGraphPanel',
      from: previous,
      to: next,
      apply(value){
      apply(value);
      return true;
    }
  });
  }

  function applyPcaTitleValue(node, value){
    const nextValue = value != null ? String(value) : '';
    pcaState.labels = pcaState.labels || {};
    pcaState.labels.title = nextValue;
    if(node && node.textContent !== nextValue){
      node.textContent = nextValue;
    }
    requestPcaViewRefresh('title-change');
  }

  function applyPcaGroupColor(index, value){
    const nextValue = value != null ? String(value) : '';
    const colors = Array.isArray(pcaState.grouped?.colors) ? pcaState.grouped.colors : (pcaState.grouped.colors = []);
    const previousValue = colors[index] || '';
    if(nextValue){
      if(previousValue === nextValue){
        return true;
      }
      colors[index] = nextValue;
    }else if(previousValue){
      colors[index] = '';
    }else{
      return true;
    }
    requestPcaViewRefresh('group-color-change');
    return true;
  }

  function createDefaultAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS },
      y: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS }
    };
  }

  function sanitizeGroupShape(value, index){
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if(GROUP_SHAPE_VALUES.has(raw)){
      return raw;
    }
    const fallbackIndex = Number.isFinite(index) ? index : 0;
    const defaultShape = GROUP_SHAPE_DEFAULTS.length
      ? GROUP_SHAPE_DEFAULTS[Math.abs(fallbackIndex) % GROUP_SHAPE_DEFAULTS.length]
      : 'circle';
    return defaultShape || 'circle';
  }

  function ensureAxisSettings(){
    if(!pcaState.axisSettings || typeof pcaState.axisSettings !== 'object'){
      pcaState.axisSettings = createDefaultAxisSettings();
    }
    if(!pcaState.axisSettings.x || typeof pcaState.axisSettings.x !== 'object'){
      pcaState.axisSettings.x = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS };
    }
    if(!pcaState.axisSettings.y || typeof pcaState.axisSettings.y !== 'object'){
      pcaState.axisSettings.y = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS };
    }
    if(typeof pcaState.axisSettings.x.minorTicks !== 'boolean'){
      pcaState.axisSettings.x.minorTicks = false;
    }
    if(typeof pcaState.axisSettings.y.minorTicks !== 'boolean'){
      pcaState.axisSettings.y.minorTicks = false;
    }
    pcaState.axisSettings.x.minorTickSubdivisions = clampMinorTickSubdivisions(pcaState.axisSettings.x.minorTickSubdivisions);
    pcaState.axisSettings.y.minorTickSubdivisions = clampMinorTickSubdivisions(pcaState.axisSettings.y.minorTickSubdivisions);
    const numericStroke = Number(pcaState.axisSettings.strokeWidth);
    pcaState.axisSettings.strokeWidth = Number.isFinite(numericStroke) && numericStroke > 0 ? numericStroke : 1;
    if(typeof pcaState.axisSettings.color !== 'string' || !pcaState.axisSettings.color.trim()){
      pcaState.axisSettings.color = DEFAULT_AXIS_COLOR;
    }
    return pcaState.axisSettings;
  }

  function createDefaultGridStyle(fallbackThickness){
    const thickness = Number.isFinite(Number(fallbackThickness)) && Number(fallbackThickness) >= 0
      ? Number(fallbackThickness)
      : 1;
    return {
      color: DEFAULT_GRID_COLOR,
      thickness,
      pattern: 'solid',
      transparency: 0
    };
  }

  function sanitizeGridStyle(style, fallbackThickness){
    const fallback = createDefaultGridStyle(fallbackThickness);
    if(gridControls && typeof gridControls.sanitizeStyle === 'function'){
      return gridControls.sanitizeStyle(style, fallback);
    }
    const source = style && typeof style === 'object' ? style : {};
    const color = typeof source.color === 'string' && source.color.trim() ? source.color : fallback.color;
    const thicknessRaw = Number(source.thickness);
    const thickness = Number.isFinite(thicknessRaw) && thicknessRaw >= 0 ? thicknessRaw : fallback.thickness;
    const patternRaw = String(source.pattern || fallback.pattern || 'solid').toLowerCase();
    const pattern = (patternRaw === 'dashed' || patternRaw === 'dotted' || patternRaw === 'solid') ? patternRaw : 'solid';
    const transparencyRaw = Number(source.transparency);
    const transparency = Number.isFinite(transparencyRaw) ? Math.max(0, Math.min(100, transparencyRaw)) : fallback.transparency;
    return { color, thickness, pattern, transparency };
  }

  function ensureGridStyle(fallbackThickness){
    pcaState.gridStyle = sanitizeGridStyle(pcaState.gridStyle, fallbackThickness);
    return pcaState.gridStyle;
  }

  function getGridStyle(fallbackThickness){
    return sanitizeGridStyle(ensureGridStyle(fallbackThickness), fallbackThickness);
  }

  function setGridStyle(style, fallbackThickness){
    pcaState.gridStyle = sanitizeGridStyle(style, fallbackThickness);
  }

  function getAxisTickInterval(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureAxisSettings();
    const raw = settings[axis]?.tickInterval;
    if(raw === null || raw === undefined || raw === ''){
      return null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function updateAxisTickInterval(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings[axis].tickInterval = null;
    } else {
      const numeric = Number(value);
      settings[axis].tickInterval = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }
    debugLog('Debug: pca axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    requestPcaViewRefresh(`axis-ticks-${axis}`);
  }

  function getAxisMinorTicksEnabled(axis){
    if(axis !== 'x' && axis !== 'y'){ return false; }
    const settings = ensureAxisSettings();
    return !!settings[axis]?.minorTicks;
  }

  function updateAxisMinorTicks(axis, enabled){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const nextValue = !!enabled;
    if(settings[axis].minorTicks === nextValue){
      return;
    }
    settings[axis].minorTicks = nextValue;
    debugLog('Debug: pca minor ticks updated',{ axis, enabled: nextValue });
    requestPcaViewRefresh(`axis-minor-ticks-${axis}`);
  }

  function getAxisMinorTickSubdivisions(axis){
    if(axis !== 'x' && axis !== 'y'){ return DEFAULT_MINOR_TICK_SUBDIVISIONS; }
    const settings = ensureAxisSettings();
    return clampMinorTickSubdivisions(settings[axis]?.minorTickSubdivisions);
  }

  function updateAxisMinorTickSubdivisions(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const nextValue = clampMinorTickSubdivisions(value);
    if(settings[axis].minorTickSubdivisions === nextValue){
      return;
    }
    settings[axis].minorTickSubdivisions = nextValue;
    debugLog('Debug: pca minor tick subdivisions updated',{ axis, subdivisions: nextValue });
    requestPcaViewRefresh(`axis-minor-subdivisions-${axis}`);
  }

  function getAxisStrokeWidthBase(){
    return ensureAxisSettings().strokeWidth;
  }

  function updateAxisStrokeWidth(value){
    const settings = ensureAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings.strokeWidth = 1;
    } else {
      const numeric = Number(value);
      settings.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    }
    debugLog('Debug: pca axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    requestPcaViewRefresh('axis-stroke-width');
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    debugLog('Debug: pca axis color updated',{ color: settings.color });
    requestPcaViewRefresh('axis-color');
  }

  function registerPcaGridControlTarget(target, options){
    if(!target || !gridControls || typeof gridControls.registerGraphElement !== 'function'){
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackThickness = Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : getAxisStrokeWidthBase();
    gridControls.registerGraphElement(target, {
      scopeId: 'pca',
      getVisible: () => !!pcaShowGrid?.checked,
      onVisibleChange: value => {
        if(pcaShowGrid){
          pcaShowGrid.checked = !!value;
        }
        requestPcaViewRefresh('grid-visible');
      },
      getStyle: () => getGridStyle(fallbackThickness),
      onStyleChange: style => {
        setGridStyle(style, fallbackThickness);
        requestPcaViewRefresh('grid-style');
      },
      defaults: createDefaultGridStyle(fallbackThickness)
    });
  }

  function applyAxisSettings(settings){
    const base = createDefaultAxisSettings();
    if(settings && typeof settings === 'object'){
      const strokeCandidate = Number(settings.strokeWidth ?? settings.axisThickness);
      if(Number.isFinite(strokeCandidate) && strokeCandidate > 0){
        base.strokeWidth = strokeCandidate;
      }
      if(typeof settings.color === 'string' && settings.color.trim()){
        base.color = settings.color;
      }
      const xInterval = settings.tickIntervalX ?? settings.xTickInterval ?? settings?.x?.tickInterval ?? null;
      const yInterval = settings.tickIntervalY ?? settings.yTickInterval ?? settings?.y?.tickInterval ?? null;
      base.x.tickInterval = xInterval === '' ? null : xInterval;
      base.y.tickInterval = yInterval === '' ? null : yInterval;
      base.x.minorTicks = !!(settings.minorTicksX ?? settings.x?.minorTicks ?? false);
      base.y.minorTicks = !!(settings.minorTicksY ?? settings.y?.minorTicks ?? false);
      const xMinorSubdiv = settings.minorTickSubdivisionsX ?? settings.minorSubdivisionsX ?? settings.x?.minorTickSubdivisions ?? settings.x?.minorSubdivisions ?? null;
      const yMinorSubdiv = settings.minorTickSubdivisionsY ?? settings.minorSubdivisionsY ?? settings.y?.minorTickSubdivisions ?? settings.y?.minorSubdivisions ?? null;
      base.x.minorTickSubdivisions = clampMinorTickSubdivisions(xMinorSubdiv);
      base.y.minorTickSubdivisions = clampMinorTickSubdivisions(yMinorSubdiv);
    }
    pcaState.axisSettings = base;
    ensureAxisSettings();
    debugLog('Debug: pca axis settings applied',{ settings: pcaState.axisSettings });
  }

  function buildManualTicks(min, max, interval){
    if(!Number.isFinite(interval) || interval <= 0){ return null; }
    if(!Number.isFinite(min) || !Number.isFinite(max)){ return null; }
    if(min === max){
      max = min + interval;
    }
    const graphMin = Math.floor(min / interval) * interval;
    const graphMax = Math.ceil(max / interval) * interval;
    const ticks = [];
    let current = graphMin;
    let guard = 0;
    while(current <= graphMax + interval * 0.25 && guard < 1000){
      ticks.push(Number.parseFloat(current.toPrecision(12)));
      current += interval;
      guard += 1;
    }
    if(!ticks.length){
      ticks.push(Number.parseFloat(graphMin.toPrecision(12)));
    }
    debugLog('Debug: pca manual ticks computed',{ interval, tickCount: ticks.length, min: graphMin, max: graphMax });
    return { min: graphMin, max: graphMax, ticks };
  }

  function sanitizeAxisSelection(dimensionCount){
    const axis = pcaState.axisSelection;
    const before = { ...axis };
    const count = Number.isFinite(Number(dimensionCount)) ? Math.max(0, Math.floor(Number(dimensionCount))) : 0;
    if(count <= 0){
      return axis;
    }
    const clampVal = (value, fallback) => {
      const num = Number(value);
      if(!Number.isFinite(num)){ return fallback; }
      const rounded = Math.round(num);
      return Math.min(Math.max(rounded, 1), count);
    };
    axis.x = clampVal(axis.x, 1);
    axis.y = clampVal(axis.y, count >= 2 ? 2 : 1);
    if(count >= 2 && axis.x === axis.y){
      axis.y = axis.x === count ? Math.max(1, axis.x - 1) : Math.min(count, axis.x + 1);
      if(axis.x === axis.y && count > 1){
        axis.y = axis.x === 1 ? 2 : 1;
      }
    }
    if(count >= 3){
      axis.z = clampVal(axis.z, 3);
      if(axis.z === axis.x || axis.z === axis.y){
        let candidate = 1;
        while(candidate <= count && (candidate === axis.x || candidate === axis.y)){
          candidate += 1;
        }
        axis.z = candidate <= count ? candidate : count;
      }
    } else if(count > 0){
      axis.z = clampVal(axis.z, count);
    }
    const changed = before.x !== axis.x || before.y !== axis.y || before.z !== axis.z;
    if(changed){
      debugLog('Debug: pca axis selection sanitized',{ before, after: { ...axis }, dimensionCount: count }); // Debug: axis sanitize summary
    }
    return axis;
  }

  function axisSelectionToIndices(dimensionCount){
    const count = Number.isFinite(Number(dimensionCount)) ? Math.max(0, Math.floor(Number(dimensionCount))) : 0;
    if(count <= 0){
      return { x: 0, y: 0, z: null };
    }
    const toIndex = (value) => {
      const num = Number(value);
      if(!Number.isFinite(num)){ return 0; }
      const idx = Math.round(num) - 1;
      return Math.min(Math.max(idx, 0), count - 1);
    };
    return {
      x: toIndex(pcaState.axisSelection.x),
      y: toIndex(pcaState.axisSelection.y),
      z: count >= 3 ? toIndex(pcaState.axisSelection.z) : null
    };
  }

  function formatAxisLabel(meta){
    if(!meta){ return ''; }
    const base = meta.label || '';
    const pct = typeof meta.variancePercent === 'number' ? meta.variancePercent : null;
    if(pct !== null && !Number.isNaN(pct)){
      return `${base} (${pct.toFixed(1)}%)`;
    }
    return base;
  }

  function resolveAxisVarianceInfo(axisIndices, dimensionMeta){
    const indices = axisIndices || {};
    const metaArray = Array.isArray(dimensionMeta) ? dimensionMeta : [];
    const weights = { x: null, y: null, z: null };
    const normalized = { x: null, y: null, z: null };
    let positiveCount = 0;
    let maxWeight = 0;
    ['x','y','z'].forEach(axisKey => {
      const idx = indices[axisKey];
      if(typeof idx === 'number' && idx >= 0 && idx < metaArray.length){
        const meta = metaArray[idx];
        const pct = Number(meta?.variancePercent);
        if(Number.isFinite(pct)){
          const weight = Math.max(pct, MIN_VARIANCE_WEIGHT);
          weights[axisKey] = weight;
          if(weight > 0){
            positiveCount += 1;
          }
          if(weight > maxWeight){
            maxWeight = weight;
          }
        }
      }
    });
    if(maxWeight <= 0){
      maxWeight = 1;
    }
    ['x','y','z'].forEach(axisKey => {
      const weight = weights[axisKey];
      normalized[axisKey] = Number.isFinite(weight) && weight !== null ? weight / maxWeight : null;
    });
    const info = { weights, normalized, hasAny: positiveCount > 0, maxWeight };
    debugLog('Debug: pca resolveAxisVarianceInfo', info); // Debug: axis variance weighting snapshot
    return info;
  }

  function setup(){
    if(pca.ready){ console.debug('Debug: Components.pca.setup skipped'); return; }
    console.debug('Debug: Components.pca.setup start');
    const $ = global.$;
    const document = global.document;
    if(!document || typeof Shared?.hot?.createStandardTable !== 'function'){
      console.error('Table factory missing for PCA component');
      return;
    }
    const ensureGraphViewport = Shared.graphViewport?.createEnsurer
      ? Shared.graphViewport.createEnsurer('pca')
      : (svg, options = {}) => {
        const helper = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
        if(typeof helper === 'function'){
          helper(svg, { component: 'pca', debugLabel: 'pca-viewport-fallback', ...options });
          return;
        }
        debugLog('Debug: pca ensureGraphViewport helper missing', { hasShared: !!Shared, hasAutoResize: typeof Shared?.autoResizeSvg === 'function' });
      };
    debugLog('Debug: pca graph viewport helper configured', {
      hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
      usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
    });
    const serializeSvg = (svgEl)=>{
      if (typeof global.serializeCleanSVG === 'function') return global.serializeCleanSVG(svgEl);
      const clone = svgEl.cloneNode(true);
      if(clone.querySelectorAll){
        clone.querySelectorAll('[contenteditable],[contentEditable]').forEach(el=>{ el.removeAttribute('contenteditable'); el.removeAttribute('contentEditable'); });
      }
      return new (global.XMLSerializer||XMLSerializer)().serializeToString(clone);
    };
      // PCA plot setup
      const pcaHotContainer=document.getElementById('pcaHot');
      const pcaHotWrapper=document.getElementById('pcaHotWrapper');
      const pcaTablePanel=document.getElementById('pcaTablePanel');
      const pcaGraphPanel=document.getElementById('pcaGraphPanel');
      const pcaPanelResizer=document.getElementById('pcaPanelResizer');
      const pcaPlotDiv=document.getElementById('pcaPlot');
      let pcaSvgBox=pcaGraphPanel?.querySelector('.svgbox');
      const pcaConfigPanel=pcaGraphPanel?.querySelector('.config-panel');
      bindPcaPlotContextMenuSuppression(pcaSvgBox);
        const pcaEls = {
          tableFormat: document.getElementById('pcaTableFormat'),
          groupedControls: document.getElementById('pcaGroupedControls'),
        groupedReplicates: document.getElementById('pcaGroupedReplicates'),
        groupedList: null,
        groupedAdd: null,
        groupedRemove: null
      };
      pcaRenderRowEl = null;
      pcaRenderButtonEl = null;
      pcaAutoDrawNoticeEl = null;
      syncPcaAutoDrawNoticeWidth = () => {};
      schedulePcaNoticeWidth = () => {};
      const pcaLayout = Shared.componentLayout?.createStandardPanels({
        componentName: 'pca',
        selectors: {
          tablePanel: '#pcaTablePanel',
          graphPanel: '#pcaGraphPanel',
          panelResizer: '#pcaPanelResizer',
          hotWrapper: '#pcaHotWrapper',
          hotContainer: '#pcaHot',
          svgBox: () => pcaGraphPanel?.querySelector('.svgbox'),
          resizeTarget: () => pcaGraphPanel?.querySelector('.svgbox')
        },
        scheduleDraw: () => scheduleDrawPca(),
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        onAfterSync: () => syncPcaAutoDrawNoticeWidth('panel-sync'),
        resizableBoxOptions: {
          onResize: () => {
            debugLog('Debug: pca layout onResize schedule trigger');
            schedulePcaNoticeWidth('resize');
            evaluateAutoDrawThresholds();
            requestPcaViewRefresh('resize');
          }
        }
      });
      if(pcaLayout?.elements?.svgBox){
        pcaSvgBox = pcaLayout.elements.svgBox;
      }
      pcaSvgBoxRef = pcaSvgBox;
      bindPcaPlotContextMenuSuppression(pcaSvgBox);
      ensurePcaResizerControls();
      const scheduleLegendPlacement = typeof Shared.debounceFrame === 'function'
        ? Shared.debounceFrame(()=>ensurePcaResizerControls())
        : null;
      if(scheduleLegendPlacement){
        scheduleLegendPlacement();
      }else if(typeof global.requestAnimationFrame === 'function'){
        global.requestAnimationFrame(()=>ensurePcaResizerControls());
      }
      pcaLayout?.setScheduleDraw?.(() => scheduleDrawPca());
      pcaLayout?.syncPanels?.();
      syncPcaAutoDrawNoticeWidth('init');
      debugLog('Debug: pca initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
      if(pcaPlotDiv && !pcaPlotDiv.__pcaAxesLengthCloseHandler){
        const onPlotPointerDown = () => {
          closePcaAxesLengthMenu('plot-pointer');
        };
        pcaPlotDiv.addEventListener('pointerdown', onPlotPointerDown);
        pcaPlotDiv.__pcaAxesLengthCloseHandler = onPlotPointerDown;
      }
      ensurePcaHotForActiveTab();
      ensurePcaHotForActiveTab();
      bindPcaDataToolbar();
      updateAutoDrawUi();
      evaluateAutoDrawThresholds();

      function syncPcaGroupedControls(){
        if(pcaEls.groupedReplicates){
          pcaEls.groupedReplicates.value = String(pcaState.grouped.replicatesPerGroup);
        }
      }

        function updatePcaTableFormatUI(){
          if(pcaEls.tableFormat){
            pcaEls.tableFormat.value = pcaState.tableFormat === 'grouped' ? 'grouped' : 'standard';
          }
          const groupedActive = pcaState.tableFormat === 'grouped';
          const showGroupedControls = groupedActive;
          if(pcaEls.groupedControls){
            pcaEls.groupedControls.style.display = showGroupedControls ? '' : 'none';
            pcaEls.groupedControls.setAttribute('aria-hidden', showGroupedControls ? 'false' : 'true');
          }
          if(groupedActive){
            syncPcaGroupedControls();
          }
        }

      function setPcaTableFormat(format){
        const normalized = format === 'grouped' ? 'grouped' : 'standard';
        if(pcaState.tableFormat !== normalized){
          pcaState.tableFormat = normalized;
          debugLog('Debug: pca table format set',{ format: normalized });
        }
        updatePcaTableFormatUI();
        applyPcaTableFormatToHot();
        requestPcaDataRefresh('table-format-change');
      }

      function updateGroupedColorInput(groupIndex, color){
        if(!pcaEls.groupedList){ return; }
        const selector = `input[type="color"][data-group-index="${groupIndex}"]`;
        const target = pcaEls.groupedList.querySelector(selector);
        if(target && typeof color === 'string'){
          target.value = color;
        }
      }

      function updateGroupedShapeInput(groupIndex, shape){
        if(!pcaEls.groupedList){ return; }
        const selector = `select[data-group-index="${groupIndex}"][data-shape-control="1"]`;
        const target = pcaEls.groupedList.querySelector(selector);
        if(target){
          target.value = shape;
        }
      }

      function resolvePcaGroupMeta(sampleCount, labels, options = {}){
        if(pcaState.tableFormat !== 'grouped' || sampleCount <= 0){
          return null;
        }
        ensurePcaGroupedDefaults();
        const replicates = getPcaGroupedReplicateCount();
        const sampleLabels = Array.isArray(labels) ? labels : [];
        const columnIndices = Array.isArray(options.columnIndices) ? options.columnIndices : [];
        const groupHeaderRow = Array.isArray(options.groupHeaderRow) ? options.groupHeaderRow : [];
        const fallbackGroupCount = getPcaGroupedGroupCount(sampleCount, replicates);
        const assignments = new Array(sampleCount).fill(-1);
        let maxAssignedGroupIndex = -1;
        if(columnIndices.length === sampleCount){
          for(let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx += 1){
            const sourceCol = Number(columnIndices[sampleIdx]);
            if(!Number.isInteger(sourceCol) || sourceCol < 1){
              continue;
            }
            const groupIndex = Math.max(0, Math.floor((sourceCol - 1) / replicates));
            assignments[sampleIdx] = groupIndex;
            if(groupIndex > maxAssignedGroupIndex){
              maxAssignedGroupIndex = groupIndex;
            }
          }
        }
        if(maxAssignedGroupIndex < 0){
          let cursor = 0;
          const groupCountFallback = Math.max(1, fallbackGroupCount);
          for(let groupIdx = 0; groupIdx < groupCountFallback && cursor < sampleCount; groupIdx += 1){
            const groupsLeft = groupCountFallback - groupIdx - 1;
            const remaining = sampleCount - cursor;
            let span = replicates;
            const minReserve = Math.max(0, groupsLeft);
            if(remaining - span < minReserve){
              span = Math.max(1, remaining - minReserve);
            }
            span = Math.max(1, Math.min(span, remaining));
            for(let copy = 0; copy < span && cursor < sampleCount; copy += 1){
              assignments[cursor] = groupIdx;
              cursor += 1;
            }
          }
          for(let idx = 0; idx < sampleCount; idx += 1){
            if(assignments[idx] >= 0){
              maxAssignedGroupIndex = Math.max(maxAssignedGroupIndex, assignments[idx]);
            }
          }
        }else{
          for(let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx += 1){
            if(assignments[sampleIdx] >= 0){
              continue;
            }
            const fallbackIdx = Math.max(0, Math.floor(sampleIdx / replicates));
            assignments[sampleIdx] = fallbackIdx;
            if(fallbackIdx > maxAssignedGroupIndex){
              maxAssignedGroupIndex = fallbackIdx;
            }
          }
        }
        const groupCount = Math.max(1, fallbackGroupCount, maxAssignedGroupIndex + 1);
        const names = Array.from({ length: groupCount }, (_, idx) => {
          const anchorCol = 1 + idx * replicates;
          const groupAnchor = groupHeaderRow[anchorCol];
          const groupText = groupAnchor == null ? '' : String(groupAnchor).trim();
          if(groupText){
            return inferPcaGroupBaseName(groupText, `Group ${idx + 1}`);
          }
          const sampleAnchor = sampleLabels[idx * replicates];
          return inferPcaGroupBaseName(sampleAnchor, `Group ${idx + 1}`);
        });
        const counts = new Array(groupCount).fill(0);
        pcaState.grouped.colors = names.map((_, idx) => {
          const existing = pcaState.grouped.colors[idx];
          return (typeof existing === 'string' && existing.trim())
            ? existing
            : DEFAULT_SCATTER_COLORS[idx % DEFAULT_SCATTER_COLORS.length];
        });
        pcaState.grouped.shapes = names.map((_, idx) => sanitizeGroupShape(pcaState.grouped.shapes[idx], idx));
        for(let sampleIdx = 0; sampleIdx < assignments.length; sampleIdx += 1){
          const groupIndex = assignments[sampleIdx];
          if(Number.isInteger(groupIndex) && groupIndex >= 0 && groupIndex < counts.length){
            counts[groupIndex] += 1;
          }
        }
        const styleByIndex = [];
        const entries = [];
        names.forEach((name, idx)=>{
          if(counts[idx] <= 0){ return; }
          const color = pcaState.grouped.colors[idx] || DEFAULT_SCATTER_COLORS[idx % DEFAULT_SCATTER_COLORS.length];
          const shape = sanitizeGroupShape(pcaState.grouped.shapes[idx], idx);
          pcaState.grouped.shapes[idx] = shape;
          const entry = { index: idx, key: `group-${idx}`, label: name, color, shape, count: counts[idx] };
          entries.push(entry);
          styleByIndex[idx] = entry;
        });
        if(!entries.length){
          return null;
        }
        const labelToGroup = new Map();
        if(sampleLabels.length){
          sampleLabels.forEach((lab, sampleIdx)=>{
            if(!lab){ return; }
            const groupIndex = assignments[sampleIdx];
            if(Number.isInteger(groupIndex) && groupIndex >= 0){
              labelToGroup.set(lab, groupIndex);
            }
          });
        }
        debugLog('Debug: pca resolveGroupMeta',{ sampleCount, groups: entries.length });
        return { assignments, entries, styleByIndex, labelToGroup };
      }

      function drawShape(addFunction, shape, options){
        const radius = Math.max(0, Number(options?.radius) || 0);
        const cx = Number(options?.cx) || 0;
        const cy = Number(options?.cy) || 0;
        const fill = options?.fill ?? 'transparent';
        const stroke = options?.stroke ?? 'none';
        const strokeWidth = options?.strokeWidth ?? 0;
        const opacity = options?.opacity ?? 1;
        const normalized = GROUP_SHAPE_VALUES.has(shape) ? shape : 'circle';
        if(normalized === 'square'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          return addFunction('rect',{ x: cx - half, y: cy - half, width: size, height: size, fill, stroke, 'stroke-width': strokeWidth, opacity });
        }
        if(normalized === 'triangle'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const path = `M ${cx} ${cy - half} L ${cx + half} ${cy + half} L ${cx - half} ${cy + half} Z`;
          return addFunction('path',{ d: path, fill, stroke, 'stroke-width': strokeWidth, opacity });
        }
        if(normalized === 'diamond'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const path = `M ${cx} ${cy - half} L ${cx + half} ${cy} L ${cx} ${cy + half} L ${cx - half} ${cy} Z`;
          return addFunction('path',{ d: path, fill, stroke, 'stroke-width': strokeWidth, opacity });
        }
        if(normalized === 'cross'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const bar = Math.max(size / 3, 2);
          const hb = bar / 2;
          const path = [
            `M ${cx - half} ${cy - half + hb}`,
            `L ${cx - half + hb} ${cy - half}`,
            `L ${cx} ${cy - hb}`,
            `L ${cx + half - hb} ${cy - half}`,
            `L ${cx + half} ${cy - half + hb}`,
            `L ${cx + hb} ${cy}`,
            `L ${cx + half} ${cy + half - hb}`,
            `L ${cx + half - hb} ${cy + half}`,
            `L ${cx} ${cy + hb}`,
            `L ${cx - half + hb} ${cy + half}`,
            `L ${cx - half} ${cy + half - hb}`,
            `L ${cx - hb} ${cy}`,
            'Z'
          ].join(' ');
          return addFunction('path',{ d: path, fill, stroke, 'stroke-width': strokeWidth, opacity });
        }
        if(normalized === 'plus'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const bar = Math.max(size / 3, 2);
          const hb = bar / 2;
          const path = `M ${cx - hb} ${cy - half} H ${cx + hb} V ${cy - hb} H ${cx + half} V ${cy + hb} H ${cx + hb} V ${cy + half} H ${cx - hb} V ${cy + hb} H ${cx - half} V ${cy - hb} H ${cx - hb} Z`;
          return addFunction('path',{ d: path, fill, stroke, 'stroke-width': strokeWidth, opacity });
        }
        if(normalized === 'star'){
          const outer = Math.max(radius, 1);
          const inner = Math.max(outer * 0.45, 1);
          const points = [];
          for(let i = 0; i < 5; i += 1){
            const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
            points.push({ x: cx + Math.cos(a) * outer, y: cy + Math.sin(a) * outer });
            const b = a + Math.PI / 5;
            points.push({ x: cx + Math.cos(b) * inner, y: cy + Math.sin(b) * inner });
          }
          const path = points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') + ' Z';
          return addFunction('path',{ d: path, fill, stroke, 'stroke-width': strokeWidth, opacity });
        }
        return addFunction('circle',{ cx, cy, r: radius, fill, stroke, 'stroke-width': strokeWidth, opacity });
      }

      ensurePcaGroupedDefaults();
      updatePcaTableFormatUI();
      applyPcaTableFormatToHot();

        if(pcaEls.tableFormat){
          pcaEls.tableFormat.addEventListener('change', e=>{
            setPcaTableFormat(e.target.value);
          });
        }
      if(pcaEls.groupedReplicates){
        pcaEls.groupedReplicates.addEventListener('change', e=>{
          const raw = Number(e.target.value);
          const resolved = Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : pcaState.grouped.replicatesPerGroup;
          pcaState.grouped.replicatesPerGroup = resolved;
          e.target.value = String(resolved);
          debugLog('Debug: pca grouped replicates updated',{ raw, resolved });
          updatePcaGroupedHeaders();
          requestPcaViewRefresh('group-replicate-change');
        });
      }
      const makeEditableHelper = (node, onChange, options) => {
        const fn = Shared.makeEditable || global.makeEditable;
        if(typeof fn === 'function'){
          return fn(node, onChange, options);
        }
        console.warn('pca makeEditable unavailable');
        return undefined;
      };

      const markFontEditable = (node, role, key) => {
        if (!node) { return; }
        const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
        if (fontControls && typeof fontControls.markText === 'function') {
          fontControls.markText(node, { scopeId: 'pca', role, key });
        }
        if (node.dataset) {
          node.dataset.fontEditable = '1';
          node.dataset.fontScope = 'pca';
          if (role) node.dataset.fontRole = role;
          if (key || role) node.dataset.fontKey = key || role;
        }
        if (!role || role.indexOf('Tick') === -1) {
          debugLog('Debug: pca markFontEditable', payload); // Debug: font target tagging summary
        }
      };
      document.getElementById('pcaLoadExample').addEventListener('click',()=>{
        const selectedFormat = pcaState.tableFormat === 'grouped' ? 'grouped' : 'standard';
        const pcaExample = selectedFormat === 'grouped'
          ? [
              [PCA_POINT_LABEL_ROW_HEADER,true,false,false,true,false,false,false,false],
              [PCA_GROUP_ROW_HEADER,'Control','','Treatment','','KO','','Rescue',''],
              [PCA_SAMPLE_ROW_HEADER,'A','B','C','D','E','F','G','H'],
              ['Var1',1,2,3,2,10,20,30,20],
              ['Var2',2,3,2,3,20,10,20,30],
              ['Var3',3,4,1,4,30,30,10,40],
              ['Var4',4,2,4,1,40,20,40,10]
            ]
          : [
              [PCA_POINT_LABEL_ROW_HEADER,true,false,false,true,false,false,false,false],
              ['Variable','A','B','C','D','E','F','G','H'],
              ['Var1',1,2,3,2,10,20,30,20],
              ['Var2',2,3,2,3,20,10,20,30],
              ['Var3',3,4,1,4,30,30,10,40],
              ['Var4',4,2,4,1,40,20,40,10]
            ];
        const hot = ensurePcaHotForActiveTab();
        markPcaOverlayPending('example-data');
        hot?.loadData?.(pcaExample, {
          source: 'example-load',
          recordUndo: true,
          undoLabel: 'table:pca:example-load'
        });
        console.log('pca example loaded');
        debugLog('Debug: pca example dataset applied (transposed labels)', { rows: pcaExample.length, cols: pcaExample[0]?.length });
        pcaState.grouped = {
          replicatesPerGroup: 2,
          colors: DEFAULT_SCATTER_COLORS.slice(0,4),
          shapes: GROUP_SHAPE_DEFAULTS.slice(0,4)
        };
        ensurePcaGroupedDefaults();
        setPcaTableFormat(selectedFormat);
        evaluateAutoDrawThresholds();
        scheduleDrawPca({ force: true, reason: 'example-load' });
      });
      const pcaImportBtn=document.getElementById('pcaImport');
      const pcaFileInput=document.getElementById('pcaFile');
      const tableImport = Shared.tableImport;
      pcaImportBtn.addEventListener('click',()=>{pcaFileInput.value=''; pcaFileInput.click();});
      pcaFileInput.addEventListener('change',async ()=>{
        if(!tableImport || typeof tableImport.openFile !== 'function'){
          console.warn('pca import skipped: Shared.tableImport.openFile unavailable');
          return;
        }
        const hasFile = !!(pcaFileInput?.files && pcaFileInput.files[0]);
        let forcedOverlay = false;
        if(hasFile){
          forcedOverlay = !!forcePcaOverlay('file-import', { message: 'Importing table data...' });
          markPcaOverlayPending('file-import');
        }
        try{
          const result = await tableImport.openFile(pcaFileInput, {
            hot: ensurePcaHotForActiveTab(),
            minCols: DEFAULT_COLS,
            minRows: DEFAULT_ROWS,
            scheduleDraw: () => {
              markPcaOverlayPending('file-import');
              evaluateAutoDrawThresholds();
              scheduleDrawPca({ force: true, reason: 'import-load', skipThresholdEvaluation: true });
            },
            debugLabel: 'pca',
            onProcessed: info => {
              console.log('pca data imported',{rows: info?.rows, cols: info?.cols});
              const hot = ensurePcaHotForActiveTab();
              ensurePcaLabelRow(hot, { source: 'pca-import' });
              const nextRows = hot?.getData?.().length || info?.rows;
              const nextCols = hot?.countCols?.() || info?.cols;
              updatePcaDataShape({ rows: nextRows, cols: nextCols });
              evaluateAutoDrawThresholds();
            },
            onCompleted: () => {
              const renderReason = 'import-load';
              markPcaOverlayPending(renderReason);
              forcePcaOverlay(renderReason, { message: 'Rendering PCA view...' });
            }
          });
          if(!result && forcedOverlay){
            resolvePcaOverlay('file-import-empty');
          }
        }catch(err){
          if(forcedOverlay){
            resolvePcaOverlay('file-import-error');
          }
          console.error('pca import failed', err);
        }
      });
      if(tableImport && typeof tableImport.handlePaste === 'function'){
        const pasteTarget = document.getElementById('pcaHot') || pcaHotContainer;
        pasteTarget?.addEventListener('paste',async e=>{
          let forcedOverlay = false;
          try{
            forcedOverlay = !!forcePcaOverlay('table-paste-start', { message: 'Processing pasted data...' });
            const hot = ensurePcaHotForActiveTab();
            const result = await tableImport.handlePaste(e, hot, {
              minCols: DEFAULT_COLS,
              minRows: DEFAULT_ROWS,
              scheduleDraw: () => {
                markPcaOverlayPending('table-paste');
                evaluateAutoDrawThresholds();
                scheduleDrawPca({ force: true, reason: 'paste-load' });
              },
              debugLabel: 'pca',
              onBeforeProcess: meta => console.log('pca fast paste',{rows: meta.rowCount, cols: meta.colCount, startRow: meta.startRow, startCol: meta.startCol}),
              onProcessed: info => {
                console.log('pca data imported',{rows: info?.rows, cols: info?.cols});
                const hot = ensurePcaHotForActiveTab();
                ensurePcaLabelRow(hot, { source: 'pca-paste' });
                const nextRows = hot?.getData?.().length || info?.rows;
                const nextCols = hot?.countCols?.() || info?.cols;
                updatePcaDataShape({ rows: nextRows, cols: nextCols });
                evaluateAutoDrawThresholds();
              }
            });
            if(!result && forcedOverlay){
              resolvePcaOverlay('table-paste-empty');
            }
          }catch(err){
            if(forcedOverlay){
              resolvePcaOverlay('table-paste-error');
            }
            console.error('pca paste failed', err);
          }
        });
      }
      const pcaLoadingsContainer=document.getElementById('pcaLoadingsContainer');
      const pcaLoadingsTable=document.getElementById('pcaLoadingsTable');
      const pcaLoadingsLimitInput=document.getElementById('pcaLoadingsLimit');
      const pcaLoadingsLimitVal=document.getElementById('pcaLoadingsLimitVal');
      const pcaLoadingsActions=document.querySelector('#pcaLoadingsContainer .loadings-card__actions');
      const pcaDefaultLoadingsActionsHost=pcaLoadingsActions?.parentElement || null;
      let lastLoadingsRender = null;
      function clampLoadingsLimitValue(value, maxRows = PCA_LOADINGS_ROW_LIMIT){
        const safeMax = Math.max(1, Math.floor(Number(maxRows) || 1));
        const requested = Math.floor(Number(value) || 0);
        if(!Number.isFinite(requested) || requested <= 0){
          return Math.min(PCA_LOADINGS_ROW_LIMIT, safeMax);
        }
        return Math.min(Math.max(1, requested), safeMax);
      }
      function syncLoadingsLimitUi(maxRows = PCA_LOADINGS_ROW_LIMIT){
        const resolved = clampLoadingsLimitValue(pcaState.loadingsLimit, maxRows);
        pcaState.loadingsLimit = resolved;
        if(pcaLoadingsLimitInput){
          const clampedMax = Math.max(1, Math.floor(Number(maxRows) || 1));
          pcaLoadingsLimitInput.max = String(clampedMax);
          pcaLoadingsLimitInput.value = String(resolved);
          if(pcaLoadingsLimitVal){
            pcaLoadingsLimitVal.textContent = resolved.toLocaleString();
          }
        }
        return resolved;
      }
      syncLoadingsLimitUi(PCA_LOADINGS_ROW_LIMIT);
      function updateLoadingsTable({ rows, components, method, viewMode, totalCount } = {}){
        if(!pcaLoadingsTable){
          debugLog('Debug: pca loadings table skipped',{ reason: 'missing-container' });
          return;
        }
        if(pcaLoadingsContainer){
          pcaLoadingsContainer.hidden = false;
        }
        if(method !== 'pca'){
          lastLoadingsRender = null;
          if(pcaLoadingsContainer){
            delete pcaLoadingsContainer.dataset.sharedStatsTable;
          }
          resetLoadingsActionsHost();
          pcaLoadingsTable.innerHTML = '<i>Loadings available for PCA only.</i>';
          debugLog('Debug: pca loadings unavailable for method',{ method });
          return;
        }
        const rowsToRender = Array.isArray(rows) ? rows : [];
        lastLoadingsRender = { rows: rowsToRender, components, method, viewMode, totalCount };
        const totalRows = rowsToRender.length;
        const totalAvailable = Number.isFinite(totalCount) ? totalCount : totalRows;
        if(!totalRows || !components){
          lastLoadingsRender = null;
          if(pcaLoadingsContainer){
            delete pcaLoadingsContainer.dataset.sharedStatsTable;
          }
          resetLoadingsActionsHost();
          pcaLoadingsTable.innerHTML = '<i>No loadings computed.</i>';
          debugLog('Debug: pca loadings empty',{ rowCount: totalRows, totalAvailable, components });
          return;
        }
        const maxRows = Math.max(1, Math.min(PCA_LOADINGS_ROW_LIMIT, totalAvailable, rowsToRender.length));
        const rowsLimit = syncLoadingsLimitUi(maxRows);
        const columnLimit = viewMode === '3d' ? 3 : 2;
        const columnsToRender = Math.min(columnLimit, components);
        const headerCells = ['Variable'];
        for(let idx=0; idx<columnsToRender; idx+=1){
          headerCells.push(`PC${idx+1}`);
        }
        const rowsToDisplay = rowsToRender.slice(0, rowsLimit);
        const truncated = totalAvailable > rowsToDisplay.length;
        const tableRows = rowsToDisplay.map(row => {
          const entry = { variable: row?.label || '' };
          for(let idx=0; idx<columnsToRender; idx+=1){
            const value = Number(row?.values?.[idx] ?? 0);
            entry[`pc${idx+1}`] = value.toFixed(4);
          }
          return entry;
        });
        const columns = [{ key: 'variable', label: headerCells[0], align: 'left' }];
        for(let idx=0; idx<columnsToRender; idx+=1){
          columns.push({ key: `pc${idx+1}`, label: headerCells[idx + 1], align: 'left' });
        }
        const rendered = renderPcaSharedStatsTable(pcaLoadingsTable, {
          target: pcaLoadingsTable,
          advanced: true,
          columns,
          rows: tableRows,
          caption: 'Component Loadings',
          footnotes: truncated
            ? [`Showing top ${rowsToDisplay.length.toLocaleString()} of ${totalAvailable.toLocaleString()} loadings by absolute weight.`]
            : [],
          options: {
            fileName: 'pca-component-loadings',
            contextLabel: 'pca-component-loadings'
          }
        });
        if(rendered?.wrapper){
          if(pcaLoadingsContainer){
            pcaLoadingsContainer.dataset.sharedStatsTable = '1';
          }
          dockLoadingsActions(rendered.wrapper);
        }else{
          if(pcaLoadingsContainer){
            delete pcaLoadingsContainer.dataset.sharedStatsTable;
          }
          resetLoadingsActionsHost();
          const parts = [];
          parts.push('<table class="stats-table"><thead><tr>');
          parts.push(`<th class="stats-table__cell stats-table__header stats-table__cell--left">${headerCells[0]}</th>`);
          headerCells.slice(1).forEach(h => {
            parts.push(`<th class="stats-table__cell stats-table__header stats-table__cell--left">${h}</th>`);
          });
          parts.push('</tr></thead><tbody>');
          rowsToDisplay.forEach(row => {
            const label = row?.label || '';
            parts.push('<tr>');
            parts.push(`<td class="stats-table__cell stats-table__cell--left">${label}</td>`);
            for(let idx=0; idx<columnsToRender; idx+=1){
              const value = Number(row?.values?.[idx] ?? 0);
              parts.push(`<td class="stats-table__cell stats-table__cell--left">${value.toFixed(4)}</td>`);
            }
            parts.push('</tr>');
          });
          parts.push('</tbody></table>');
          if(truncated){
            parts.push(`<div class="stats-table-footnotes"><div class="stats-table-footnote">Showing top ${rowsToDisplay.length.toLocaleString()} of ${totalAvailable.toLocaleString()} loadings by absolute weight.</div></div>`);
          }
          pcaLoadingsTable.innerHTML = parts.join('');
        }
        debugLog('Debug: pca loadings table rendered',{
          rowCount: rowsToDisplay.length,
          columnsToRender,
          viewMode,
          truncated,
          totalAvailable,
          rowsLimit,
          sliderMax: maxRows
        });
      }
      if(pcaLoadingsLimitInput){
        pcaLoadingsLimitInput.addEventListener('input', () => {
          const maxRows = lastLoadingsRender
            ? Math.max(1, Math.min(
              PCA_LOADINGS_ROW_LIMIT,
              Number(lastLoadingsRender.totalCount) || 0,
              Array.isArray(lastLoadingsRender.rows) ? lastLoadingsRender.rows.length : 0
            ))
            : PCA_LOADINGS_ROW_LIMIT;
          pcaState.loadingsLimit = clampLoadingsLimitValue(pcaLoadingsLimitInput.value, maxRows);
          syncLoadingsLimitUi(maxRows);
          if(lastLoadingsRender){
            updateLoadingsTable(lastLoadingsRender);
          }
        });
      }
      const pcaScreeVarianceRow=document.getElementById('pcaScreeVarianceRow');
      const pcaVarianceSummary=document.getElementById('pcaVarianceSummary');
      const pcaVarianceList=document.getElementById('pcaVarianceList');
      const pcaViewMode=$('#pcaViewMode');
      pcaViewModeInput = pcaViewMode;
      const pcaXAxis=$('#pcaXAxis');
      const pcaYAxis=$('#pcaYAxis');
      const pcaZAxis=$('#pcaZAxis');
      const pcaAxis2DControls=document.getElementById('pcaAxis2DControls');
      const pcaAxis3DControl=document.getElementById('pcaAxis3DControl');
      if(pcaAxis3DControl){
        pcaAxis3DControl.hidden = true;
        pcaAxis3DControl.style.display = 'none';
      }
      const pcaMethod=$('#pcaMethod'), pcaFill=$('#pcaFill'), pcaBorder=$('#pcaBorder'), pcaBorderWidth=$('#pcaBorderWidth'), pcaDotSize=$('#pcaDotSize'), pcaAlpha=$('#pcaAlpha');
      const pcaTsneControls=document.getElementById('pcaTsneControls');
      const pcaTsnePerplexity=document.getElementById('pcaTsnePerplexity');
      const pcaTsneLearningRate=document.getElementById('pcaTsneLearningRate');
      const pcaTsneIterations=document.getElementById('pcaTsneIterations');
      const pcaTsneExaggeration=document.getElementById('pcaTsneExaggeration');
      const pcaUmapControls=document.getElementById('pcaUmapControls');
      const pcaUmapNeighbors=document.getElementById('pcaUmapNeighbors');
      const pcaUmapMinDist=document.getElementById('pcaUmapMinDist');
      const pcaUmapLearningRate=document.getElementById('pcaUmapLearningRate');
      const pcaUmapEpochs=document.getElementById('pcaUmapEpochs');
      const pcaAlphaVal=$('#pcaAlphaVal');
      let pcaComponentRuleInput = null;
      let pcaEigenThresholdInput = null;
      let pcaParallelIterationsInput = null;
      function syncPcaComponentSelectionUi(){
        if(pcaComponentRuleInput){
          pcaComponentRuleInput.value = sanitizePcaComponentSelectionRule(pcaState.componentSelection?.rule);
        }
        if(pcaEigenThresholdInput){
          const threshold = sanitizePcaEigenThreshold(pcaState.componentSelection?.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD);
          pcaEigenThresholdInput.value = String(threshold);
          pcaEigenThresholdInput.disabled = sanitizePcaComponentSelectionRule(pcaState.componentSelection?.rule) !== 'threshold' || (pcaMethod?.value || 'pca').toLowerCase() !== 'pca';
        }
        if(pcaParallelIterationsInput){
          const iterations = sanitizePcaParallelIterations(pcaState.componentSelection?.parallelIterations, PCA_DEFAULT_PARALLEL_ITERATIONS);
          pcaParallelIterationsInput.value = String(iterations);
          pcaParallelIterationsInput.disabled = (pcaMethod?.value || 'pca').toLowerCase() !== 'pca';
        }
      }
      function ensurePcaComponentSelectionControls(){
        const configPanel = document.querySelector('#pcaPage .config-panel');
        const dataFieldset = document.querySelector('#pcaPage .config-panel fieldset:nth-of-type(3)');
        if(!configPanel || !dataFieldset){
          return null;
        }
        let fieldset = document.getElementById('pcaComponentSelectionFieldset');
        if(!fieldset){
          fieldset = document.createElement('fieldset');
          fieldset.id = 'pcaComponentSelectionFieldset';
          const legend = document.createElement('legend');
          legend.textContent = 'Component Selection';
          fieldset.appendChild(legend);
          const controlRow = document.createElement('div');
          controlRow.className = 'control idx-inline-041';
          const ruleLabel = document.createElement('label');
          ruleLabel.className = 'idx-inline-023';
          ruleLabel.textContent = 'Retention rule';
          const ruleSelect = document.createElement('select');
          ruleSelect.id = 'pcaComponentRule';
          PCA_COMPONENT_SELECTION_RULES.forEach(entry => {
            const option = document.createElement('option');
            option.value = entry.value;
            option.textContent = entry.label;
            ruleSelect.appendChild(option);
          });
          ruleLabel.appendChild(ruleSelect);
          const thresholdLabel = document.createElement('label');
          thresholdLabel.className = 'idx-inline-023';
          thresholdLabel.textContent = 'Eigenvalue cutoff';
          const thresholdInput = document.createElement('input');
          thresholdInput.type = 'number';
          thresholdInput.id = 'pcaEigenThreshold';
          thresholdInput.min = '0.1';
          thresholdInput.max = '100';
          thresholdInput.step = '0.1';
          thresholdLabel.appendChild(thresholdInput);
          const iterationsLabel = document.createElement('label');
          iterationsLabel.className = 'idx-inline-023';
          iterationsLabel.textContent = 'Parallel runs';
          const iterationsInput = document.createElement('input');
          iterationsInput.type = 'number';
          iterationsInput.id = 'pcaParallelIterations';
          iterationsInput.min = '25';
          iterationsInput.max = String(PCA_MAX_PARALLEL_ITERATIONS);
          iterationsInput.step = '25';
          iterationsLabel.appendChild(iterationsInput);
          controlRow.appendChild(ruleLabel);
          controlRow.appendChild(thresholdLabel);
          controlRow.appendChild(iterationsLabel);
          const help = document.createElement('div');
          help.className = 'stats-help-text';
          help.id = 'pcaComponentSelectionHelp';
          help.textContent = 'Parallel analysis, Kaiser, and custom eigenvalue thresholds are reported for PCA results and drive the retained-component summary.';
          fieldset.appendChild(controlRow);
          fieldset.appendChild(help);
          dataFieldset.insertAdjacentElement('afterend', fieldset);
          pcaComponentRuleInput = ruleSelect;
          pcaEigenThresholdInput = thresholdInput;
          pcaParallelIterationsInput = iterationsInput;
          attachPcaSelectAutoSize(ruleSelect, 'pca');
          ruleSelect.addEventListener('change', () => {
            pcaState.componentSelection.rule = sanitizePcaComponentSelectionRule(ruleSelect.value);
            syncPcaComponentSelectionUi();
            requestPcaDataRefresh('component-selection-rule');
          });
          thresholdInput.addEventListener('change', () => {
            const nextValue = sanitizePcaEigenThreshold(thresholdInput.value, PCA_DEFAULT_EIGEN_THRESHOLD);
            pcaState.componentSelection.eigenThreshold = nextValue;
            syncPcaComponentSelectionUi();
            requestPcaDataRefresh('component-selection-threshold');
          });
          iterationsInput.addEventListener('change', () => {
            const nextValue = sanitizePcaParallelIterations(iterationsInput.value, PCA_DEFAULT_PARALLEL_ITERATIONS);
            pcaState.componentSelection.parallelIterations = nextValue;
            syncPcaComponentSelectionUi();
            requestPcaDataRefresh('component-selection-parallel');
          });
        }else{
          pcaComponentRuleInput = document.getElementById('pcaComponentRule');
          pcaEigenThresholdInput = document.getElementById('pcaEigenThreshold');
          pcaParallelIterationsInput = document.getElementById('pcaParallelIterations');
        }
        syncPcaComponentSelectionUi();
        return fieldset;
      }
      const pcaAutoSizeTargets=[
        pcaMethod,
        pcaViewMode,
        pcaXAxis,
        pcaYAxis,
        pcaZAxis
      ];
      let lastPcaViewMode = pcaViewMode?.value || DEFAULT_VIEW_MODE;
      pcaAutoSizeTargets.filter(Boolean).forEach(select=>{
        attachPcaSelectAutoSize(select, 'pca');
      });
      ensurePcaComponentSelectionControls();
      const pcaFontSize=$('#pcaFontSize'), pcaFontSizeVal=$('#pcaFontSizeVal');
      if(pcaFontSize?.dataset){
        pcaFontSize.dataset.fontBasePt = String(pcaFontSize.value);
        debugLog('Debug: pca font size base initialized',{ value: pcaFontSize.value }); // Debug: initial base size
      }
      chartStyle.renderFontSizeLabel({ element: pcaFontSizeVal, pt: Number(pcaFontSize.value), input: pcaFontSize, manual: true });
      const pcaShowGrid=$('#pcaShowGrid');
      const pcaShowFrame=$('#pcaShowFrame');
      const pcaShowLegend=document.getElementById('pcaShowLegend');
      if(pcaShowLegend){
        pcaShowLegendInput = pcaShowLegend;
        const legendHost=pcaShowLegend.closest('label');
        if(legendHost){
          pcaLegendControl=legendHost;
          ensurePcaResizerControls();
        }
        pcaShowLegend.addEventListener('change',()=>{
          debugLog('Debug: pca showLegend change',{checked:pcaShowLegend.checked});
          ensurePcaResizerControls();
          requestPcaViewRefresh('legend-toggle');
        });
      }
      const pcaVarianceAxisScale=$('#pcaVarianceAxisScale');
      pcaVarianceAxisScaleInput = pcaVarianceAxisScale;
      const pcaScale=$('#pcaScale');
      const pcaStatsResults=document.getElementById('pcaStatsResults');
      const pcaStatsSummary=document.getElementById('pcaStatsSummary');
      const pcaScreeContainer=document.getElementById('pcaScreeContainer');
      const pcaScreePlot=document.getElementById('pcaScreePlot') || pcaScreeContainer;
      const pcaScreeExportControls=document.getElementById('pcaScreeExportControls');
      const pcaEigenTableContainer=document.getElementById('pcaEigenTableContainer');
      const pcaEigenTableWrapper=document.getElementById('pcaEigenTableWrapper');
      const pcaExportEigenTableBtn=document.getElementById('pcaExportEigenTable');
      const pcaDefaultEigenExportHost = pcaExportEigenTableBtn?.parentElement || null;
      function syncAxisSelectValues(){
        const entries = [
          { key: 'x', element: pcaXAxis },
          { key: 'y', element: pcaYAxis },
          { key: 'z', element: pcaZAxis }
        ];
        entries.forEach(({ key, element }) => {
          if(!element){ return; }
          const desired = String(pcaState.axisSelection[key]);
          const options = Array.from(element.options || []);
          if(options.some(opt => opt.value === desired)){
            element.value = desired;
          }
        });
      }
      function applyAxisVisibility(viewMode){
        if(pcaAxis3DControl){
          const show3d = (viewMode || '').toLowerCase() === '3d' && pcaState.axisMeta.length >= 3;
          pcaAxis3DControl.hidden = !show3d;
          pcaAxis3DControl.style.display = show3d ? '' : 'none';
        }
        if(pcaAxis2DControls){
          pcaAxis2DControls.style.opacity = pcaState.axisMeta.length >= 2 ? '1' : '0.7';
        }
      }
      function applyMethodUiState(methodValue){
        const methodName = (methodValue || '').toLowerCase();
        const supports3d = methodName === 'pca' || methodName === 'mds';
        if(pcaTsneControls){
          const showTsne = methodName === 'tsne';
          pcaTsneControls.hidden = !showTsne;
          pcaTsneControls.style.display = showTsne ? '' : 'none';
        }
        if(pcaUmapControls){
          const showUmap = methodName === 'umap';
          pcaUmapControls.hidden = !showUmap;
          pcaUmapControls.style.display = showUmap ? '' : 'none';
        }
        if(pcaViewMode){
          const options = Array.from(pcaViewMode.options || []);
          options.forEach(opt => {
            if(opt.value === '3d'){
              opt.disabled = !supports3d;
              opt.hidden = !supports3d;
            }
          });
          if(!supports3d && pcaViewMode.value !== '2d'){
            pcaViewMode.value = '2d';
            lastPcaViewMode = '2d';
            debugLog('Debug: pca view mode coerced to 2d',{ method: methodName });
          }
        }
        applyAxisVisibility(pcaViewMode?.value || DEFAULT_VIEW_MODE);
        syncPcaComponentSelectionUi();
        syncPcaAspectControls('method-ui-state');
        debugLog('Debug: pca method UI state',{ method: methodName, supports3d });
      }
      function updateAxisSelectOptions(options){
        const meta = Array.isArray(options?.dimensionMeta) ? options.dimensionMeta : [];
        const dimensionCount = meta.length;
        pcaState.axisMeta = meta;
        sanitizeAxisSelection(dimensionCount);
        const axisEntries = [
          { key: 'x', element: pcaXAxis, required: 1 },
          { key: 'y', element: pcaYAxis, required: 2 },
          { key: 'z', element: pcaZAxis, required: 3 }
        ];
          axisEntries.forEach(({ key, element, required }) => {
            if(!element){ return; }
            element.innerHTML = '';
            if(dimensionCount < required){
              element.disabled = true;
              return;
            }
            meta.forEach(item => {
              const option = document.createElement('option');
              option.value = String(item.value);
              option.textContent = formatAxisLabel(item);
              element.appendChild(option);
            });
            element.disabled = false;
            if(typeof formControls.autoSizeSelect === 'function'){
              formControls.autoSizeSelect(element);
            }
          });
        syncAxisSelectValues();
        applyAxisVisibility(options?.viewMode || (pcaViewMode?.value || DEFAULT_VIEW_MODE));
        debugLog('Debug: pca axis options updated',{ dimensionCount, viewMode: options?.viewMode || null, selection: { ...pcaState.axisSelection } }); // Debug: axis option summary
      }
      function scheduleRotationRedraw(){
        if(pcaState.rotationPending){
          if(!pcaState.rotationPendingLogged){
            debugLog('Debug: pca rotation redraw skipped',{ reason: 'pending' });
            pcaState.rotationPendingLogged = true;
          }
          return;
        }
        pcaState.rotationPending = true;
        pcaState.rotationPendingLogged = false;
        debugLog('Debug: pca rotation redraw scheduled');
        requestPcaViewRefresh('rotation');
      }
      const axisSelectEntries = [
        { axis: 'x', element: pcaXAxis },
        { axis: 'y', element: pcaYAxis },
        { axis: 'z', element: pcaZAxis }
      ];
      axisSelectEntries.forEach(({ axis, element }) => {
        if(!element){ return; }
        element.addEventListener('change', () => {
          const requested = Number(element.value);
          if(!Number.isFinite(requested)){ return; }
          const previous = { ...pcaState.axisSelection };
          pcaState.axisSelection[axis] = requested;
          sanitizeAxisSelection(pcaState.axisMeta.length);
          syncAxisSelectValues();
          const changed = previous[axis] !== pcaState.axisSelection[axis];
          debugLog('Debug: pca axis selection change',{ axis, requested, final: pcaState.axisSelection[axis], changed });
          if(changed){
            requestPcaDataRefresh('axis-selection-change');
          }
        });
      });
      applyAxisVisibility(pcaViewMode?.value || DEFAULT_VIEW_MODE);
      applyMethodUiState(pcaMethod?.value || 'pca');
      if(pcaVarianceAxisScale){
        pcaVarianceAxisScale.checked = !!pcaState.axesVarianceScaled;
        pcaVarianceAxisScale.addEventListener('change', () => {
          const enabled = !!pcaVarianceAxisScale.checked;
          if(enabled && (pcaState.equalAxes || pcaState.equalScaleAxes)){
            pcaState.equalAxes = false;
            pcaState.equalScaleAxes = false;
            if(pcaEqualAxesInput){
              pcaEqualAxesInput.checked = false;
            }
            if(pcaEqualScaleAxesInput){
              pcaEqualScaleAxesInput.checked = false;
            }
            debugLog('Debug: pca axes length exclusivity enforced',{ disabled: 'equal-length/equal-scale', reason: 'variance-axis-toggle' });
          }
          const previous = !!pcaState.axesVarianceScaled;
          pcaState.axesVarianceScaled = enabled;
          debugLog('Debug: pca variance axis scaling toggled',{ enabled, previous });
          syncPcaAspectControls('variance-axis-scale');
          requestPcaViewRefresh('variance-axis-scale');
        });
        debugLog('Debug: pca variance axis toggle ready',{ initial: pcaVarianceAxisScale.checked });
      } else {
        debugLog('Debug: pca variance axis toggle missing');
      }
      function updateEigenExportVisibility(shouldShow){
        if(!pcaExportEigenTableBtn){ return; }
        const visible = !!shouldShow;
        pcaExportEigenTableBtn.style.display = visible ? '' : 'none';
        if(!visible){
          pcaExportEigenTableBtn.disabled = true;
        }
      }
      function dockEigenExportButton(host){
        if(!pcaExportEigenTableBtn || !host || typeof host.appendChild !== 'function'){
          return false;
        }
        host.appendChild(pcaExportEigenTableBtn);
        return true;
      }
      function resetEigenExportButtonHost(){
        if(pcaDefaultEigenExportHost){
          dockEigenExportButton(pcaDefaultEigenExportHost);
        }
      }
      function renderPcaSharedStatsTable(target, config){
        if(!target || !Shared.statsTable || typeof Shared.statsTable.render !== 'function'){
          return null;
        }
        return Shared.statsTable.render(config);
      }
      function dockLoadingsActions(wrapper){
        if(!pcaLoadingsActions || !wrapper || typeof wrapper.insertBefore !== 'function'){
          return false;
        }
        const referenceNode = wrapper.querySelector('.stats-table') || wrapper.firstChild || null;
        wrapper.insertBefore(pcaLoadingsActions, referenceNode);
        return true;
      }
      function resetLoadingsActionsHost(){
        if(pcaDefaultLoadingsActionsHost && pcaLoadingsActions){
          pcaDefaultLoadingsActionsHost.insertBefore(pcaLoadingsActions, pcaLoadingsTable || null);
        }
      }
      function renderPcaSummaryPanel(options = {}){
        if(!pcaStatsSummary){
          return;
        }
        pcaStatsSummary?.setAttribute?.('data-stats-advanced', '0');
        pcaScreeVarianceRow?.setAttribute?.('data-stats-advanced', '0');
        pcaVarianceSummary?.setAttribute?.('data-stats-advanced', '0');
        pcaEigenTableContainer?.setAttribute?.('data-stats-advanced', '0');
        pcaLoadingsContainer?.setAttribute?.('data-stats-advanced', '1');
        const summaryLines = Array.isArray(options.summaryLines) ? options.summaryLines : [];
        const method = String(options.method || '').toLowerCase();
        const savedHtml = typeof options.savedHtml === 'string' ? options.savedHtml : null;
        if(pcaStatsResults){
          pcaStatsResults.querySelectorAll('.stats-report-panel').forEach(node => {
            node.parentNode?.removeChild?.(node);
          });
        }
        if(savedHtml != null){
          pcaStatsSummary.innerHTML = savedHtml;
          if(pcaStatsResults){
            pcaStatsSummary.querySelectorAll('.stats-report-panel').forEach(node => {
              pcaStatsResults.appendChild(node);
            });
          }
          debugLog('Debug: pca summary panel restored from saved html', {
            length: savedHtml.length,
            hasReportPanel: savedHtml.includes('stats-report-panel')
          });
        } else if(summaryLines.length){
          pcaStatsSummary.innerHTML = summaryLines.map(line => `<div class="stats-table-lead">${line}</div>`).join('');
        } else if(method === 'pca'){
          pcaStatsSummary.innerHTML = '<div class="stats-table-message">Component variance summary appears alongside the scree plot.</div>';
        } else {
          pcaStatsSummary.innerHTML = '<div class="stats-table-message">No statistics computed.</div>';
        }
        if(pcaStatsResults && Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function' && (summaryLines.length || lastPcaStats)){
          const statsSnapshot = lastPcaStats || {};
          Shared.statsReporting.appendReportPanel(pcaStatsResults, {
            methodsText: `${(method || statsSnapshot.method || 'pca').toUpperCase()} summary statistics were generated for the current ordination result.`,
            resultsText: [
              summaryLines.length ? summaryLines.join(' ') : null,
              Number.isFinite(statsSnapshot.totalVariance) ? `Total explained variance = ${statsSnapshot.totalVariance.toFixed(2)}%.` : null,
              Number.isFinite(statsSnapshot.stress) ? `Stress = ${statsSnapshot.stress.toFixed(4)}.` : null,
              Number.isFinite(statsSnapshot.selectionSummary?.retainedCount) ? `${statsSnapshot.selectionSummary.ruleLabel || 'Selected rule'} retained ${statsSnapshot.selectionSummary.retainedCount} component${statsSnapshot.selectionSummary.retainedCount === 1 ? '' : 's'}.` : null
            ].filter(Boolean).join(' '),
            analysisSpec: {
              component: 'pca',
              method: method || statsSnapshot.method || null,
              dimensions: statsSnapshot.dimensions || null,
              totalVariance: Number.isFinite(statsSnapshot.totalVariance) ? statsSnapshot.totalVariance : null,
              stress: Number.isFinite(statsSnapshot.stress) ? statsSnapshot.stress : null,
              eigenCount: Array.isArray(statsSnapshot.eigenSummary) ? statsSnapshot.eigenSummary.length : 0,
              retainedComponents: Number.isFinite(statsSnapshot.selectionSummary?.retainedCount) ? statsSnapshot.selectionSummary.retainedCount : null,
              componentSelectionRule: statsSnapshot.selectionSummary?.rule || null
            }
          }, { title: 'Reporting and reproducibility' });
        }
      }
      function ensurePcaDynamicStatsCard(cardId, title, anchor){
        const host = pcaStatsResults || pcaStatsSummary?.parentElement;
        if(!host){
          return { card: null, body: null };
        }
        let card = document.getElementById(cardId);
        if(!card){
          card = document.createElement('div');
          card.id = cardId;
          card.className = 'loadings-card';
          card.hidden = true;
          const heading = document.createElement('div');
          heading.className = 'loadings-card__title';
          heading.textContent = title;
          const body = document.createElement('div');
          body.className = 'loadings-card__table';
          body.id = `${cardId}Body`;
          card.appendChild(heading);
          card.appendChild(body);
          const anchorNode = anchor || pcaLoadingsContainer || null;
          if(anchorNode && anchorNode.parentNode === host){
            anchorNode.insertAdjacentElement('afterend', card);
          }else{
            host.appendChild(card);
          }
        }
        return {
          card,
          body: document.getElementById(`${cardId}Body`)
        };
      }
      function renderPcaComponentSelectionSummary(summary){
        const { card, body } = ensurePcaDynamicStatsCard('pcaComponentSelectionSummaryCard', 'Component Selection', pcaStatsSummary || null);
        if(!card || !body){
          return;
        }
        card.setAttribute('data-stats-advanced', '0');
        if(!summary || !Array.isArray(summary.rows) || !summary.rows.length){
          card.hidden = true;
          body.innerHTML = '';
          return;
        }
        body.innerHTML = '';
        const rendered = renderPcaSharedStatsTable(body, {
          target: body,
          advanced: false,
          columns: [
            { key: 'criterion', label: 'Criterion', align: 'left' },
            { key: 'threshold', label: 'Threshold', align: 'left' },
            { key: 'retained', label: 'Retained', align: 'right' },
            { key: 'detail', label: 'Detail', align: 'left' }
          ],
          rows: summary.rows,
          caption: 'Component retention summary',
          options: {
            fileName: 'pca-component-selection',
            contextLabel: 'pca-component-selection'
          }
        });
        if(!rendered){
          let html = '<table class="stats-table"><thead><tr><th>Criterion</th><th>Threshold</th><th>Retained</th><th>Detail</th></tr></thead><tbody>';
          summary.rows.forEach(row => {
            html += `<tr><td>${row.criterion}</td><td>${row.threshold}</td><td>${row.retained}</td><td>${row.detail}</td></tr>`;
          });
          html += '</tbody></table>';
          body.innerHTML = html;
        }
        card.hidden = false;
      }
      function createPcaMiniScatterSvg(config = {}){
        const width = 360;
        const height = 280;
        const margin = { top: 18, right: 18, bottom: 42, left: 52 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', String(height));
        chartStyle.applySvgDefaults(svg);
        const pointList = Array.isArray(config.points) ? config.points : [];
        const vectorList = Array.isArray(config.vectors) ? config.vectors : [];
        const allX = [];
        const allY = [];
        pointList.forEach(point => {
          allX.push(Number(point?.x) || 0);
          allY.push(Number(point?.y) || 0);
        });
        vectorList.forEach(vector => {
          allX.push(Number(vector?.x) || 0);
          allY.push(Number(vector?.y) || 0);
        });
        const maxAbsX = Math.max(1e-6, ...allX.map(value => Math.abs(value)));
        const maxAbsY = Math.max(1e-6, ...allY.map(value => Math.abs(value)));
        const bound = Math.max(maxAbsX, maxAbsY) * 1.15;
        const xScale = value => margin.left + ((Number(value) || 0) + bound) * (plotWidth / (bound * 2 || 1));
        const yScale = value => margin.top + plotHeight - (((Number(value) || 0) + bound) * (plotHeight / (bound * 2 || 1)));
        const axisColor = chartStyle.TEXT_COLOR || '#333333';
        const zeroX = xScale(0);
        const zeroY = yScale(0);
        const xAxis = document.createElementNS(NS, 'line');
        xAxis.setAttribute('x1', String(margin.left));
        xAxis.setAttribute('x2', String(margin.left + plotWidth));
        xAxis.setAttribute('y1', String(zeroY));
        xAxis.setAttribute('y2', String(zeroY));
        xAxis.setAttribute('stroke', axisColor);
        xAxis.setAttribute('stroke-width', '1');
        svg.appendChild(xAxis);
        const yAxis = document.createElementNS(NS, 'line');
        yAxis.setAttribute('x1', String(zeroX));
        yAxis.setAttribute('x2', String(zeroX));
        yAxis.setAttribute('y1', String(margin.top));
        yAxis.setAttribute('y2', String(margin.top + plotHeight));
        yAxis.setAttribute('stroke', axisColor);
        yAxis.setAttribute('stroke-width', '1');
        svg.appendChild(yAxis);
        pointList.forEach((point, idx) => {
          const circle = document.createElementNS(NS, 'circle');
          circle.setAttribute('cx', String(xScale(point.x)));
          circle.setAttribute('cy', String(yScale(point.y)));
          circle.setAttribute('r', idx < 12 ? '3' : '2.5');
          circle.setAttribute('fill', config.pointColor || '#0000ff');
          circle.setAttribute('fill-opacity', config.pointOpacity != null ? String(config.pointOpacity) : '0.75');
          svg.appendChild(circle);
          if(idx < 10 && point?.label){
            const label = document.createElementNS(NS, 'text');
            label.setAttribute('x', String(xScale(point.x) + 4));
            label.setAttribute('y', String(yScale(point.y) - 4));
            label.setAttribute('font-size', '10');
            label.setAttribute('fill', axisColor);
            label.textContent = String(point.label);
            svg.appendChild(label);
          }
        });
        vectorList.forEach(vector => {
          const line = document.createElementNS(NS, 'line');
          const endX = xScale(vector.x);
          const endY = yScale(vector.y);
          line.setAttribute('x1', String(zeroX));
          line.setAttribute('y1', String(zeroY));
          line.setAttribute('x2', String(endX));
          line.setAttribute('y2', String(endY));
          line.setAttribute('stroke', config.vectorColor || '#c7301f');
          line.setAttribute('stroke-width', '1.5');
          svg.appendChild(line);
          if(vector?.label){
            const label = document.createElementNS(NS, 'text');
            label.setAttribute('x', String(endX + 4));
            label.setAttribute('y', String(endY - 4));
            label.setAttribute('font-size', '10');
            label.setAttribute('fill', config.vectorColor || '#c7301f');
            label.textContent = String(vector.label);
            svg.appendChild(label);
          }
        });
        const xLabel = document.createElementNS(NS, 'text');
        xLabel.setAttribute('x', String(margin.left + plotWidth / 2));
        xLabel.setAttribute('y', String(height - 10));
        xLabel.setAttribute('text-anchor', 'middle');
        xLabel.setAttribute('font-size', '11');
        xLabel.setAttribute('fill', axisColor);
        xLabel.textContent = config.xLabel || 'PC1';
        svg.appendChild(xLabel);
        const yLabel = document.createElementNS(NS, 'text');
        yLabel.setAttribute('x', '16');
        yLabel.setAttribute('y', String(margin.top + plotHeight / 2));
        yLabel.setAttribute('text-anchor', 'middle');
        yLabel.setAttribute('font-size', '11');
        yLabel.setAttribute('fill', axisColor);
        yLabel.setAttribute('transform', `rotate(-90 16 ${margin.top + plotHeight / 2})`);
        yLabel.textContent = config.yLabel || 'PC2';
        svg.appendChild(yLabel);
        return svg;
      }
      function renderPcaSupplementalPlots(options = {}){
        const method = String(options.method || '').toLowerCase();
        const { card: loadingsCard, body: loadingsBody } = ensurePcaDynamicStatsCard('pcaLoadingsPlotCard', 'Loadings Plot', pcaLoadingsContainer || null);
        const { card: biplotCard, body: biplotBody } = ensurePcaDynamicStatsCard('pcaBiplotCard', 'Biplot', loadingsCard || pcaLoadingsContainer || null);
        if(loadingsCard){
          loadingsCard.setAttribute('data-stats-advanced', '1');
        }
        if(biplotCard){
          biplotCard.setAttribute('data-stats-advanced', '0');
        }
        if(loadingsBody){
          loadingsBody.innerHTML = '';
        }
        if(biplotBody){
          biplotBody.innerHTML = '';
        }
        const rows = Array.isArray(options.loadingsRows) ? options.loadingsRows : [];
        const biplot = options.biplot && typeof options.biplot === 'object' ? options.biplot : null;
        const hasLoadingsPlot = method === 'pca' && rows.some(row => Number.isFinite(Number(row?.values?.[0])) && Number.isFinite(Number(row?.values?.[1])));
        if(loadingsCard){
          loadingsCard.hidden = !hasLoadingsPlot;
        }
        if(hasLoadingsPlot && loadingsBody){
          loadingsBody.appendChild(createPcaMiniScatterSvg({
            points: rows.slice(0, PCA_BIPLOT_VECTOR_LIMIT).map(row => ({
              x: Number(row?.values?.[0]) || 0,
              y: Number(row?.values?.[1]) || 0,
              label: row?.label || ''
            })),
            xLabel: 'PC1 loading',
            yLabel: 'PC2 loading',
            pointColor: '#1f78b4',
            pointOpacity: 0.85
          }));
        }
        const hasBiplot = method === 'pca' && biplot && Array.isArray(biplot.points) && biplot.points.length && Array.isArray(biplot.vectors) && biplot.vectors.length;
        if(biplotCard){
          biplotCard.hidden = !hasBiplot;
        }
        if(hasBiplot && biplotBody){
          biplotBody.appendChild(createPcaMiniScatterSvg({
            points: biplot.points,
            vectors: biplot.vectors,
            xLabel: biplot.xLabel || 'PC1',
            yLabel: biplot.yLabel || 'PC2',
            pointColor: '#4daf4a',
            pointOpacity: 0.55,
            vectorColor: '#c7301f'
          }));
        }
      }
      function restorePcaStatsFromPayload(options = {}){
        if(!lastPcaStats || typeof lastPcaStats !== 'object'){
          return false;
        }
        const method = String(lastPcaStats.method || '').toLowerCase();
        const summaryLines = Array.isArray(lastPcaStats.summaryLines) ? lastPcaStats.summaryLines : [];
        const eigenSummary = Array.isArray(lastPcaStats.eigenSummary) ? lastPcaStats.eigenSummary : [];
        const screeData = Array.isArray(lastPcaStats.scree) ? lastPcaStats.scree : [];
        const loadings = lastPcaStats.loadings && typeof lastPcaStats.loadings === 'object'
          ? lastPcaStats.loadings
          : null;
        renderPcaSummaryPanel({
          summaryLines,
          method,
          savedHtml: options.savedSummaryHtml
        });
        renderPcaComponentSelectionSummary(lastPcaStats.selectionSummary || null);
        renderScreeChart({
          show: method === 'pca',
          data: screeData,
          method,
          pointColor: pcaFill?.value || '#0000ff',
          parallelAnalysis: Array.isArray(lastPcaStats.parallelAnalysis) ? lastPcaStats.parallelAnalysis : []
        });
        renderVarianceSummary({
          method,
          data: method === 'pca' ? eigenSummary : []
        });
        renderEigenTable({
          show: method === 'pca' || method === 'mds',
          data: eigenSummary,
          enableExport: eigenSummary.length > 0,
          method
        });
        if(loadings){
          updateLoadingsTable({
            rows: Array.isArray(loadings.rows) ? loadings.rows : [],
            components: Number(loadings.components) || 0,
            method,
            viewMode: pcaViewMode?.value || DEFAULT_VIEW_MODE,
            totalCount: Number.isFinite(loadings.totalCount) ? loadings.totalCount : 0
          });
        }
        renderPcaSupplementalPlots({
          method,
          loadingsRows: Array.isArray(loadings?.rows) ? loadings.rows : [],
          biplot: lastPcaStats.biplot || null
        });
        debugLog('Debug: pca stats restored from persisted payload UI', {
          method,
          summaryLines: summaryLines.length,
          screePoints: screeData.length,
          eigenRows: eigenSummary.length,
          loadingsRows: Array.isArray(loadings?.rows) ? loadings.rows.length : 0,
          hasSavedSummaryHtml: !!options.savedSummaryHtml
        });
        return true;
      }
      function updateScreeVarianceRowVisibility(){
        if(!pcaScreeVarianceRow){ return; }
        const screeVisible = !!pcaScreeContainer && !pcaScreeContainer.hidden;
        const varianceVisible = !!pcaVarianceSummary && !pcaVarianceSummary.hidden;
        pcaScreeVarianceRow.style.display = (screeVisible || varianceVisible) ? 'flex' : 'none';
      }
      function resetStatsPanel(message){
        if(pcaStatsSummary){
          pcaStatsSummary.innerHTML = message ? `<div class="stats-table-message">${message}</div>` : '';
        } else if(pcaStatsResults){
          pcaStatsResults.innerHTML = message ? `<div class="stats-table-message">${message}</div>` : '';
        }
        if(pcaScreePlot){
          pcaScreePlot.innerHTML = '';
        }
        if(pcaScreeExportControls){
          pcaScreeExportControls.style.display = 'none';
        }
        if(pcaScreeContainer){
          pcaScreeContainer.hidden = true;
        }
        if(pcaVarianceSummary){
          pcaVarianceSummary.hidden = true;
          delete pcaVarianceSummary.dataset.sharedStatsTable;
        }
        if(pcaVarianceList){
          pcaVarianceList.innerHTML = '';
        }
        if(pcaEigenTableWrapper){
          pcaEigenTableWrapper.innerHTML = '';
        }
        if(pcaEigenTableContainer){
          pcaEigenTableContainer.hidden = true;
          delete pcaEigenTableContainer.dataset.sharedStatsTable;
        }
        if(pcaLoadingsTable){
          pcaLoadingsTable.innerHTML = '';
        }
        if(pcaLoadingsContainer){
          pcaLoadingsContainer.hidden = true;
          delete pcaLoadingsContainer.dataset.sharedStatsTable;
        }
        ['pcaComponentSelectionSummaryCard','pcaLoadingsPlotCard','pcaBiplotCard'].forEach(cardId => {
          const card = document.getElementById(cardId);
          const body = document.getElementById(`${cardId}Body`);
          if(card){
            card.hidden = true;
          }
          if(body){
            body.innerHTML = '';
          }
        });
        resetLoadingsActionsHost();
        if(pcaExportEigenTableBtn){
          pcaExportEigenTableBtn.disabled = true;
        }
        resetEigenExportButtonHost();
        if(pcaDefaultEigenExportHost?.style){
          pcaDefaultEigenExportHost.style.display = '';
        }
        updateEigenExportVisibility(false);
        updateScreeVarianceRowVisibility();
        debugLog('Debug: pca stats panel reset',{ message: message || null }); // Debug: stats reset helper
      }
      function renderScreeChart(options){
        const opts = options || {};
        const show = !!opts.show;
        const data = Array.isArray(opts.data) ? opts.data : [];
        const parallelAnalysis = Array.isArray(opts.parallelAnalysis) ? opts.parallelAnalysis : [];
        if(!pcaScreeContainer){
          debugLog('Debug: pca scree render skipped',{ reason: 'missing-container' });
          return;
        }
        if(pcaScreePlot){
          pcaScreePlot.innerHTML = '';
        }
        if(pcaScreeExportControls){
          pcaScreeExportControls.style.display = show ? '' : 'none';
        }
        if(!show || opts.method !== 'pca'){
          pcaScreeContainer.hidden = true;
          if(pcaScreeContainer.style){
            pcaScreeContainer.style.removeProperty('max-width');
          }
          debugLog('Debug: pca scree hidden',{ show, count: data.length, method: opts.method }); // Debug: scree visibility
          updateScreeVarianceRowVisibility();
          return;
        }
        if(!data.length){
          pcaScreeContainer.hidden = false;
          if(pcaScreeExportControls){
            pcaScreeExportControls.style.display = 'none';
          }
          if(pcaScreePlot){
            pcaScreePlot.innerHTML = '<div class="stats-table-message">Scree plot will appear after PCA runs.</div>';
          }
          if(pcaScreeContainer.style){
            pcaScreeContainer.style.removeProperty('max-width');
          }
          debugLog('Debug: pca scree placeholder shown');
          updateScreeVarianceRowVisibility();
          return;
        }
        pcaScreeContainer.hidden = false;
        const host = pcaScreePlot || pcaScreeContainer;
        if(pcaScreeExportControls){
          pcaScreeExportControls.style.display = '';
        }
        const containerWidth = host.clientWidth || 0;
        let drawingBoxWidth = 0;
        if(pcaSvgBox){
          const rectWidth = typeof pcaSvgBox.getBoundingClientRect === 'function' ? pcaSvgBox.getBoundingClientRect().width : 0;
          const clientWidth = pcaSvgBox.clientWidth || 0;
          drawingBoxWidth = Math.max(rectWidth || 0, clientWidth || 0);
        }
        let width = containerWidth > 0 ? containerWidth : 360;
        if(drawingBoxWidth > 0){
          width = Math.min(width, drawingBoxWidth);
        }else if(width < 360){
          width = 360;
        }
        if(pcaScreeContainer.style){
          pcaScreeContainer.style.maxWidth = `${Math.max(width, 0)}px`;
        }
        const height = 300;
        const margin = { top: 26, right: 28, bottom: 54, left: 78 };
        const axisTickFontSize = 12;
        const axisTitleFontSize = 13;
        const legendFontSize = 11;
        const plotWidth = Math.max(20, width - margin.left - margin.right);
        const plotHeight = Math.max(20, height - margin.top - margin.bottom);
        const maxPct = Math.max(...data.map(item => Number(item.variancePercent) || 0), 1);
        const cumulativePercents = [];
        let cumulativeTotal = 0;
        data.forEach(item => {
          const pct = Number(item.variancePercent) || 0;
          cumulativeTotal += pct;
          cumulativePercents.push(Math.min(cumulativeTotal, 100));
        });
        const maxCumulative = Math.max(...cumulativePercents, 0);
        const yAxisMax = Math.max(maxPct, maxCumulative, 1);
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'scree-chart');
        svg.setAttribute('id', 'pcaScreeSvg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', String(height));
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Scree plot showing explained variance by component');
        if(svg.style){
          svg.style.maxWidth = `${Math.max(width, 0)}px`;
        }
        chartStyle.applySvgDefaults(svg);
        const axisColor = chartStyle.TEXT_COLOR || '#333333';
        const yAxis = document.createElementNS(NS, 'line');
        yAxis.setAttribute('x1', String(margin.left));
        yAxis.setAttribute('y1', String(margin.top));
        yAxis.setAttribute('x2', String(margin.left));
        yAxis.setAttribute('y2', String(margin.top + plotHeight));
        yAxis.setAttribute('stroke', axisColor);
        yAxis.setAttribute('stroke-width', '1');
        svg.appendChild(yAxis);
        const xAxis = document.createElementNS(NS, 'line');
        xAxis.setAttribute('x1', String(margin.left));
        xAxis.setAttribute('y1', String(margin.top + plotHeight));
        xAxis.setAttribute('x2', String(margin.left + plotWidth));
        xAxis.setAttribute('y2', String(margin.top + plotHeight));
        xAxis.setAttribute('stroke', axisColor);
        xAxis.setAttribute('stroke-width', '1');
        svg.appendChild(xAxis);
        const tickCount = 4;
        for(let i=0;i<=tickCount;i+=1){
          const pct = (yAxisMax / tickCount) * i;
          const y = margin.top + plotHeight - (plotHeight * (pct / yAxisMax));
          if(i !== 0){ // skip drawing over the x-axis
            const grid = document.createElementNS(NS, 'line');
            grid.setAttribute('x1', String(margin.left));
            grid.setAttribute('x2', String(margin.left + plotWidth));
            grid.setAttribute('y1', String(y));
            grid.setAttribute('y2', String(y));
            grid.setAttribute('stroke', '#ddd');
            grid.setAttribute('stroke-width', '1');
            svg.appendChild(grid);
          }
          const label = document.createElementNS(NS, 'text');
          label.setAttribute('x', String(margin.left - 8));
          label.setAttribute('y', String(y));
          label.setAttribute('text-anchor', 'end');
          label.setAttribute('dominant-baseline', 'middle');
          label.setAttribute('fill', axisColor);
          label.setAttribute('font-size', `${axisTickFontSize}px`);
          label.textContent = `${pct.toFixed(1)}%`;
          svg.appendChild(label);
        }
        const xPositions = data.map((item, idx) => {
          const relative = data.length <= 1 ? 0 : idx / (data.length - 1);
          return margin.left + relative * plotWidth;
        });
        const yPositions = data.map(item => {
          const pct = Number(item.variancePercent) || 0;
          const scaled = margin.top + plotHeight - (plotHeight * (pct / yAxisMax));
          return scaled;
        });
        const cumulativePositions = cumulativePercents.map(pct => {
          const scaled = margin.top + plotHeight - (plotHeight * (pct / yAxisMax));
          return scaled;
        });
        const path = document.createElementNS(NS, 'path');
        const pointColor = opts.pointColor || '#0000ff';
        const d = xPositions.map((x, idx) => `${idx===0?'M':'L'}${x} ${yPositions[idx]}`).join(' ');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', pointColor);
        path.setAttribute('stroke-width', '2');
        svg.appendChild(path);
        const cumulativeColor = '#4daf4a';
        if(cumulativePositions.length){
          const cumulativePath = document.createElementNS(NS, 'path');
          const cumulativeD = xPositions.map((x, idx) => `${idx===0?'M':'L'}${x} ${cumulativePositions[idx]}`).join(' ');
          cumulativePath.setAttribute('d', cumulativeD);
          cumulativePath.setAttribute('fill', 'none');
          cumulativePath.setAttribute('stroke', cumulativeColor);
          cumulativePath.setAttribute('stroke-width', '2');
          svg.appendChild(cumulativePath);
        }
        const parallelPositions = parallelAnalysis.length
          ? parallelAnalysis.map(value => {
              const pct = Number(value) || 0;
              return margin.top + plotHeight - (plotHeight * (pct / Math.max(yAxisMax, 1)));
            })
          : [];
        if(parallelPositions.length){
          const parallelPath = document.createElementNS(NS, 'path');
          const parallelD = xPositions
            .slice(0, parallelPositions.length)
            .map((x, idx) => `${idx===0?'M':'L'}${x} ${parallelPositions[idx]}`)
            .join(' ');
          parallelPath.setAttribute('d', parallelD);
          parallelPath.setAttribute('fill', 'none');
          parallelPath.setAttribute('stroke', '#e41a1c');
          parallelPath.setAttribute('stroke-width', '1.75');
          parallelPath.setAttribute('stroke-dasharray', '6 4');
          svg.appendChild(parallelPath);
        }
        const xAxisTickLength = 6;
        data.forEach((item, idx) => {
          const cx = xPositions[idx];
          const cy = yPositions[idx];
          const tick = document.createElementNS(NS, 'line');
          const tickBaseY = margin.top + plotHeight;
          tick.setAttribute('x1', String(cx));
          tick.setAttribute('x2', String(cx));
          tick.setAttribute('y1', String(tickBaseY));
          tick.setAttribute('y2', String(tickBaseY + xAxisTickLength));
          tick.setAttribute('stroke', axisColor);
          tick.setAttribute('stroke-width', '1');
          svg.appendChild(tick);
          const circle = document.createElementNS(NS, 'circle');
          circle.setAttribute('cx', String(cx));
          circle.setAttribute('cy', String(cy));
          circle.setAttribute('r', '4');
          circle.setAttribute('fill', pointColor);
          circle.setAttribute('stroke', '#ffffff');
          circle.setAttribute('stroke-width', '1');
          svg.appendChild(circle);
          const label = document.createElementNS(NS, 'text');
          label.setAttribute('x', String(cx));
          label.setAttribute('y', String(margin.top + plotHeight + 18));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('fill', axisColor);
          label.setAttribute('font-size', `${axisTickFontSize}px`);
          label.textContent = `${Number(item.component) || (idx + 1)}`;
          svg.appendChild(label);
        });
        if(cumulativePositions.length){
          cumulativePositions.forEach((cy, idx) => {
            const cx = xPositions[idx];
            const circle = document.createElementNS(NS, 'circle');
            circle.setAttribute('cx', String(cx));
            circle.setAttribute('cy', String(cy));
            circle.setAttribute('r', '3');
            circle.setAttribute('fill', '#ffffff');
            circle.setAttribute('stroke', cumulativeColor);
            circle.setAttribute('stroke-width', '1.5');
            svg.appendChild(circle);
          });
        }
        const yAxisTitle = document.createElementNS(NS, 'text');
        const yAxisTitleOffset = 52;
        const yAxisTitleX = margin.left - yAxisTitleOffset;
        const yAxisTitleY = margin.top + plotHeight / 2;
        yAxisTitle.setAttribute('x', String(yAxisTitleX));
        yAxisTitle.setAttribute('y', String(yAxisTitleY));
        yAxisTitle.setAttribute('text-anchor', 'middle');
        yAxisTitle.setAttribute('fill', axisColor);
        yAxisTitle.setAttribute('transform', `rotate(-90 ${yAxisTitleX} ${yAxisTitleY})`);
        yAxisTitle.setAttribute('font-size', `${axisTitleFontSize}px`);
        yAxisTitle.textContent = '% of explained variance';
        svg.appendChild(yAxisTitle);
        const xAxisTitle = document.createElementNS(NS, 'text');
        xAxisTitle.setAttribute('x', String(margin.left + (plotWidth / 2)));
        const xAxisTitleOffset = 32;
        xAxisTitle.setAttribute('y', String(margin.top + plotHeight + xAxisTitleOffset));
        xAxisTitle.setAttribute('text-anchor', 'middle');
        xAxisTitle.setAttribute('fill', axisColor);
        xAxisTitle.setAttribute('font-size', `${axisTitleFontSize}px`);
        xAxisTitle.textContent = 'Component number';
        svg.appendChild(xAxisTitle);
        const legendEntries = [
          { label: 'Cumulative variance', color: cumulativeColor, strokeDash: '' },
          { label: 'Explained variance', color: pointColor, strokeDash: '' }
        ];
        if(parallelPositions.length){
          legendEntries.push({ label: 'Parallel analysis', color: '#e41a1c', strokeDash: '6 4' });
        }
        const legendLineHeight = 14;
        const legendHeight = legendEntries.length * legendLineHeight;
        const legendGroup = document.createElementNS(NS, 'g');
        const legendX = Math.max(margin.left + 16, margin.left + plotWidth - 120);
        const legendY = Math.max(margin.top + 8, margin.top + (plotHeight / 2) - (legendHeight / 2));
        legendEntries.forEach((entry, idx) => {
          const lineY = legendY + (idx * legendLineHeight);
          const sampleLine = document.createElementNS(NS, 'line');
          sampleLine.setAttribute('x1', String(legendX));
          sampleLine.setAttribute('x2', String(legendX + 32));
          sampleLine.setAttribute('y1', String(lineY));
          sampleLine.setAttribute('y2', String(lineY));
          sampleLine.setAttribute('stroke', entry.color);
          sampleLine.setAttribute('stroke-width', '2');
          if(entry.strokeDash){
            sampleLine.setAttribute('stroke-dasharray', entry.strokeDash);
          }
          legendGroup.appendChild(sampleLine);
          const legendLabel = document.createElementNS(NS, 'text');
          legendLabel.setAttribute('x', String(legendX + 40));
          legendLabel.setAttribute('y', String(lineY));
          legendLabel.setAttribute('dominant-baseline', 'middle');
          legendLabel.setAttribute('fill', axisColor);
          legendLabel.setAttribute('font-size', `${legendFontSize}px`);
          legendLabel.textContent = entry.label;
          legendGroup.appendChild(legendLabel);
        });
        svg.appendChild(legendGroup);
        host.appendChild(svg);
        debugLog('Debug: pca scree chart rendered',{ count: data.length, maxPct: yAxisMax, width, height, drawingBoxWidth, containerWidth });
        updateScreeVarianceRowVisibility();
      }
      function renderVarianceSummary(options){
        const opts = options || {};
        const method = opts.method || null;
        const data = Array.isArray(opts.data) ? opts.data : [];
        if(!pcaVarianceSummary || !pcaVarianceList){
          debugLog('Debug: pca variance summary skipped',{ reason: 'missing-container' });
          return;
        }
        if(method !== 'pca'){
          pcaVarianceSummary.hidden = true;
          pcaVarianceList.innerHTML = '';
          delete pcaVarianceSummary.dataset.sharedStatsTable;
          updateScreeVarianceRowVisibility();
          debugLog('Debug: pca variance summary hidden',{ method, count: data.length });
          return;
        }
        if(!data.length){
          pcaVarianceSummary.hidden = false;
          delete pcaVarianceSummary.dataset.sharedStatsTable;
          pcaVarianceList.innerHTML = '<div class="variance-card__empty">Variance summary will appear after PCA runs.</div>';
          updateScreeVarianceRowVisibility();
          debugLog('Debug: pca variance summary placeholder shown');
          return;
        }
        let listHtml = '<ul class="variance-card__sr-only">';
        const rows = data.map(entry => {
          const component = Number(entry.component) || 0;
          const pct = Number(entry.variancePercent) || 0;
          const label = entry.componentLabel || `PC${component}`;
          listHtml += `<li>${label}: ${pct.toFixed(2)}%</li>`;
          return {
            component: label,
            variancePercent: `${pct.toFixed(2)}%`
          };
        });
        listHtml += '</ul>';
        const rendered = renderPcaSharedStatsTable(pcaVarianceList, {
          target: pcaVarianceList,
          advanced: false,
          columns: [
            { key: 'component', label: 'Component', align: 'left' },
            { key: 'variancePercent', label: 'Variance %', align: 'left' }
          ],
          rows,
          caption: 'Component Variance',
          options: {
            fileName: 'pca-component-variance',
            contextLabel: 'pca-component-variance'
          }
        });
        if(rendered){
          pcaVarianceSummary.dataset.sharedStatsTable = '1';
          pcaVarianceList.insertAdjacentHTML('beforeend', listHtml);
        }else{
          delete pcaVarianceSummary.dataset.sharedStatsTable;
          let tableHtml = '<table class="variance-card__table"><thead><tr><th>Component</th><th>Variance %</th></tr></thead><tbody>';
          rows.forEach(row => {
            tableHtml += `<tr><td>${row.component}</td><td>${row.variancePercent}</td></tr>`;
          });
          tableHtml += '</tbody></table>';
          pcaVarianceList.innerHTML = tableHtml + listHtml;
        }
        pcaVarianceSummary.hidden = false;
        updateScreeVarianceRowVisibility();
        debugLog('Debug: pca variance summary rendered',{ count: data.length });
      }
      function renderEigenTable(options){
        const opts = options || {};
        const show = !!opts.show;
        const data = Array.isArray(opts.data) ? opts.data : [];
        const method = (opts.method || '').toLowerCase();
        const supportsEigen = method === 'pca' || method === 'mds';
        if(!pcaEigenTableContainer){
          debugLog('Debug: pca eigen table skipped',{ reason: 'missing-container' });
          return;
        }
        if(!show || !supportsEigen){
          if(pcaEigenTableWrapper){
            pcaEigenTableWrapper.innerHTML = '';
          }
          pcaEigenTableContainer.hidden = true;
          delete pcaEigenTableContainer.dataset.sharedStatsTable;
          resetEigenExportButtonHost();
          if(pcaDefaultEigenExportHost?.style){
            pcaDefaultEigenExportHost.style.display = '';
          }
          updateEigenExportVisibility(false);
          debugLog('Debug: pca eigen table hidden',{ show, method: opts.method, count: data.length });
          return;
        }
        pcaEigenTableContainer.hidden = false;
        if(!data.length){
          if(pcaEigenTableWrapper){
            const friendly = method === 'mds' ? 'MDS' : 'PCA';
            pcaEigenTableWrapper.innerHTML = `<div class="stats-table-message">${friendly} eigenvalues will populate after the analysis runs.</div>`;
          }
          delete pcaEigenTableContainer.dataset.sharedStatsTable;
          resetEigenExportButtonHost();
          if(pcaDefaultEigenExportHost?.style){
            pcaDefaultEigenExportHost.style.display = '';
          }
          updateEigenExportVisibility(false);
          if(pcaExportEigenTableBtn){
            pcaExportEigenTableBtn.disabled = true;
          }
          debugLog('Debug: pca eigen table placeholder shown');
          return;
        }
        if(pcaEigenTableWrapper){
          const percentHeader = method === 'mds' ? 'Inertia %' : 'Variance %';
          const cumulativeHeader = method === 'mds' ? 'Cumulative Inertia %' : 'Cumulative %';
          const rows = data.map(entry => {
            const comp = Number(entry.component) || 0;
            const eigen = Number(entry.eigenvalue) || 0;
            const pct = Number(entry.variancePercent) || 0;
            const cumulative = Number(entry.cumulativeVariancePercent) || 0;
            return {
              component: entry.componentLabel || (method === 'mds' ? `Dim${comp}` : `PC${comp}`),
              eigenvalue: eigen.toFixed(4),
              variancePercent: `${pct.toFixed(2)}%`,
              cumulativePercent: `${cumulative.toFixed(2)}%`
            };
          });
          const rendered = renderPcaSharedStatsTable(pcaEigenTableWrapper, {
            target: pcaEigenTableWrapper,
            advanced: false,
            columns: [
              { key: 'component', label: 'Component', align: 'left' },
              { key: 'eigenvalue', label: 'Eigenvalue', align: 'left' },
              { key: 'variancePercent', label: percentHeader, align: 'left' },
              { key: 'cumulativePercent', label: cumulativeHeader, align: 'left' }
            ],
            rows,
            caption: method === 'mds' ? 'MDS Eigen Summary' : 'PCA Eigen Summary',
            options: {
              fileName: method === 'mds' ? 'mds-eigen-summary' : 'pca-eigen-summary',
              contextLabel: method === 'mds' ? 'mds-eigen-summary' : 'pca-eigen-summary'
            }
          });
          if(rendered?.wrapper){
            pcaEigenTableContainer.dataset.sharedStatsTable = '1';
            const actions = rendered.wrapper.querySelector('.stats-table-actions');
            if(actions){
              dockEigenExportButton(actions);
            }
            if(pcaDefaultEigenExportHost?.style){
              pcaDefaultEigenExportHost.style.display = 'none';
            }
          }else{
            delete pcaEigenTableContainer.dataset.sharedStatsTable;
            resetEigenExportButtonHost();
            if(pcaDefaultEigenExportHost?.style){
              pcaDefaultEigenExportHost.style.display = '';
            }
            let html = '<table class="stats-table"><thead><tr>';
            ['Component', 'Eigenvalue', percentHeader, cumulativeHeader].forEach(header => {
              html += `<th class="stats-table__cell stats-table__header stats-table__cell--left">${header}</th>`;
            });
            html += '</tr></thead><tbody>';
            rows.forEach(row => {
              html += '<tr>';
              html += `<td class="stats-table__cell stats-table__cell--left">${row.component}</td>`;
              html += `<td class="stats-table__cell stats-table__cell--left">${row.eigenvalue}</td>`;
              html += `<td class="stats-table__cell stats-table__cell--left">${row.variancePercent}</td>`;
              html += `<td class="stats-table__cell stats-table__cell--left">${row.cumulativePercent}</td>`;
              html += '</tr>';
            });
            html += '</tbody></table>';
            pcaEigenTableWrapper.innerHTML = html;
          }
        }
        const exportEnabled = !!opts.enableExport;
        updateEigenExportVisibility(exportEnabled);
        if(pcaExportEigenTableBtn){
          pcaExportEigenTableBtn.disabled = !exportEnabled;
        }
        debugLog('Debug: pca eigen table rendered',{ rows: data.length, exportEnabled, method });
      }
      function renderStatsPanel(options){
        const opts = options || {};
        const summaryLines = Array.isArray(opts.summaryLines) ? opts.summaryLines : [];
        renderPcaSummaryPanel({
          summaryLines,
          method: opts.method
        });
        renderPcaComponentSelectionSummary(opts.selectionSummary || null);
        if(!pcaStatsSummary && pcaStatsResults){
          pcaStatsResults.innerHTML = summaryLines.length ? summaryLines.join('<br>') : '<i>No statistics computed.</i>';
        }
        renderScreeChart({
          show: opts.showScree,
          data: opts.screeData,
          method: opts.method,
          pointColor: opts.pointColor,
          parallelAnalysis: opts.parallelAnalysis
        });
        renderVarianceSummary({
          method: opts.method,
          data: opts.varianceSummary,
        });
        renderEigenTable({
          show: opts.showEigenTable,
          data: opts.eigenSummary,
          enableExport: opts.enableEigenExport,
          method: opts.method,
        });
        renderPcaSupplementalPlots({
          method: opts.method,
          loadingsRows: opts.loadingsRows,
          biplot: opts.biplot
        });
      }
      function handleEigenExport(){
        if(!lastPcaStats || !['pca','mds'].includes(lastPcaStats.method)){
          debugLog('Debug: pca eigen export blocked',{ reason: 'non-supported-method', method: lastPcaStats?.method || null });
          return;
        }
        if(!Array.isArray(lastPcaStats.eigenSummary) || !lastPcaStats.eigenSummary.length){
          debugLog('Debug: pca eigen export skipped',{ reason: 'no-data' });
          return;
        }
        const method = lastPcaStats.method;
        const percentHeader = method === 'mds' ? 'InertiaPercent' : 'VariancePercent';
        const cumulativeHeader = method === 'mds' ? 'CumulativeInertiaPercent' : 'CumulativePercent';
        const rows = [['Component','Eigenvalue',percentHeader,cumulativeHeader,'SingularValue']];
        lastPcaStats.eigenSummary.forEach(entry => {
          const compLabel = entry.componentLabel || (method === 'mds' ? `Dim${entry.component}` : `PC${entry.component}`);
          rows.push([
            compLabel,
            Number(entry.eigenvalue || 0).toFixed(6),
            Number(entry.variancePercent || 0).toFixed(4),
            Number(entry.cumulativeVariancePercent || 0).toFixed(4),
            Number(entry.singularValue || 0).toFixed(6)
          ]);
        });
        const csvContent = rows.map(row => row.join(',')).join('\n');
        try{
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${method}-eigenvalues.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          debugLog('Debug: pca eigen export generated',{ rows: rows.length - 1, method });
        }catch(err){
          console.error('pca eigen export failed', err);
        }
      }
      let pcaLabelColors={};
      let pcaLabelShapes={};
      let pcaLabelPointStyles={};
      let pcaLabelStyleMode = null;
      let pcaLabelColorsBackup = null;
      let pcaLabelShapesBackup = null;
      const applyPcaLabelColor = (label, value) => {
        const nextValue = value != null ? String(value) : '';
        const previousValue = pcaLabelColors[label] || '';
        if(nextValue){
          if(previousValue === nextValue){
            return true;
          }
          pcaLabelColors[label] = nextValue;
        }else if(previousValue){
          delete pcaLabelColors[label];
        }else{
          return true;
        }
        requestPcaViewRefresh('label-color-change');
        return true;
      };
      const applyPcaLabelShape = (label, value, fallbackIndex = 0) => {
        const previousValue = pcaLabelShapes[label] || '';
        const sanitized = typeof value === 'string' && value
          ? sanitizeGroupShape(value, fallbackIndex)
          : '';
        if(sanitized){
          if(previousValue === sanitized){
            return true;
          }
          pcaLabelShapes[label] = sanitized;
        }else if(previousValue){
          delete pcaLabelShapes[label];
        }else{
          return true;
        }
        requestPcaViewRefresh('label-shape-change');
        return true;
      };
      pcaShowPointFormatControls = function showPcaPointFormatControls(targetNode){
        if(!targetNode || !Shared.symbolToolbar || typeof Shared.symbolToolbar.show !== 'function'){
          return;
        }
        const pointData = targetNode.__pcaPointData || {};
        let labelKey = pointData.label ? String(pointData.label).trim() : '';
        let hasLabelScope = !!labelKey;
        const knownLabelKeys = () => {
          const keys = new Set();
          const addKey = value => {
            const normalized = String(value == null ? '' : value).trim();
            if(normalized){
              keys.add(normalized);
            }
          };
          addKey(labelKey);
          Object.keys(pcaLabelColors || {}).forEach(addKey);
          Object.keys(pcaLabelShapes || {}).forEach(addKey);
          Object.keys(pcaLabelPointStyles || {}).forEach(addKey);
          return Array.from(keys);
        };
        const orderedLabelKeys = () => {
          const keys = knownLabelKeys();
          if(!labelKey){
            return keys;
          }
          return [labelKey].concat(keys.filter(name => name !== labelKey));
        };
        const labelScopeOptions = (() => {
          const options = [{ value: 'global', label: 'Global', disabled: false }];
          const keys = orderedLabelKeys();
          if(keys.length){
            keys.forEach(name => {
              options.push({
                value: 'label',
                label: name,
                datasetLabel: name,
                scopeDataset: name,
                scopeKind: 'label',
                disabled: false
              });
            });
          }else{
            options.push({
              value: 'label',
              label: labelKey || 'Label',
              datasetLabel: labelKey || 'Label',
              scopeDataset: labelKey || '',
              scopeKind: 'label',
              disabled: !hasLabelScope
            });
          }
          return options;
        })();
        const ensureLabelPointStyle = () => {
          if(!hasLabelScope){ return null; }
          const existing = pcaLabelPointStyles[labelKey];
          if(existing && typeof existing === 'object'){
            return existing;
          }
          pcaLabelPointStyles[labelKey] = {};
          return pcaLabelPointStyles[labelKey];
        };
        const applyLabelPointPatch = patch => {
          if(!hasLabelScope){ return; }
          const style = ensureLabelPointStyle();
          Object.assign(style, patch);
          requestPcaViewRefresh('label-point-style');
        };
        const applyGlobalPointPatch = (key, value) => {
          Object.keys(pcaLabelPointStyles).forEach(label => {
            pcaLabelPointStyles[label] = Object.assign({}, pcaLabelPointStyles[label] || {}, { [key]: value });
          });
          requestPcaViewRefresh('global-point-style');
        };
        Shared.symbolToolbar.show({
          document: global.document,
          target: targetNode,
          anchorId: 'pcaFontHost',
          scopeId: 'pca',
          formClass: 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls pca-point-controls',
          scope: {
            label: 'Scope',
            options: labelScopeOptions,
            value: hasLabelScope ? 'label' : 'global',
            onChange(nextScope, ctx){
              if(nextScope === 'label'){
                const scopedLabelKey = String(ctx?.scopeDataset || '').trim();
                if(scopedLabelKey){
                  labelKey = scopedLabelKey;
                  hasLabelScope = true;
                }
              }
            }
          },
          fillShape: {
            label: 'Fill/Shape',
            shapeOptions: GROUP_SHAPE_OPTIONS,
            getColor(ctx){
              if(ctx.scope === 'label' && hasLabelScope){
                return pcaLabelColors[labelKey] || pcaFill.value || '#0000ff';
              }
              return pcaFill.value || '#0000ff';
            },
            getShape(ctx){
              if(ctx.scope === 'label' && hasLabelScope){
                return sanitizeGroupShape(pcaLabelShapes[labelKey] || 'circle', 0);
              }
              const labels = Object.keys(pcaLabelShapes || {});
              if(!labels.length){
                return 'circle';
              }
              const shapes = labels.map((label, idx) => sanitizeGroupShape(pcaLabelShapes[label], idx));
              const unique = new Set(shapes);
              return unique.size === 1 ? shapes[0] : 'circle';
            },
            onColorInput(value, ctx){
              if(ctx.scope === 'label' && hasLabelScope){
                applyPcaLabelColor(labelKey, value);
                return;
              }
              pcaFill.value = value;
              Object.keys(pcaLabelColors).forEach(label => { pcaLabelColors[label] = value; });
              requestPcaViewRefresh('fill-change');
            },
            onColorChange(value, ctx){
              if(ctx.scope === 'label' && hasLabelScope){
                applyPcaLabelColor(labelKey, value);
                return;
              }
              pcaFill.value = value;
              Object.keys(pcaLabelColors).forEach(label => { pcaLabelColors[label] = value; });
              requestPcaViewRefresh('fill-change');
            },
            onShapeChange(value, ctx){
              const sanitized = sanitizeGroupShape(value || 'circle', 0);
              if(ctx.scope === 'label' && hasLabelScope){
                applyPcaLabelShape(labelKey, sanitized, 0);
                return;
              }
              Object.keys(pcaLabelShapes).forEach((label, idx) => {
                pcaLabelShapes[label] = sanitizeGroupShape(sanitized, idx);
              });
              requestPcaViewRefresh('label-shape-change');
            }
          },
          border: {
            label: 'Border',
            getColor(ctx){
              if(ctx.scope === 'label' && hasLabelScope){
                const style = pcaLabelPointStyles[labelKey] || {};
                return style.borderColor || style.stroke || pcaBorder.value || '#000000';
              }
              return pcaBorder.value || '#000000';
            },
            onColorInput(value, ctx){
              if(ctx.scope === 'label' && hasLabelScope){
                applyLabelPointPatch({ borderColor: value, stroke: value });
              }else{
                pcaBorder.value = value;
                applyGlobalPointPatch('borderColor', value);
                applyGlobalPointPatch('stroke', value);
                requestPcaViewRefresh('border-color-change');
              }
            },
            onColorChange(value, ctx){
              if(ctx.scope === 'label' && hasLabelScope){
                applyLabelPointPatch({ borderColor: value, stroke: value });
              }else{
                pcaBorder.value = value;
                applyGlobalPointPatch('borderColor', value);
                applyGlobalPointPatch('stroke', value);
                requestPcaViewRefresh('border-color-change');
              }
            },
            getWidth(ctx){
              if(ctx.scope === 'label' && hasLabelScope && Number.isFinite(Number(pcaLabelPointStyles[labelKey]?.borderWidth))){
                return Number(pcaLabelPointStyles[labelKey].borderWidth);
              }
              if(ctx.scope === 'label' && hasLabelScope && Number.isFinite(Number(pcaLabelPointStyles[labelKey]?.strokeWidth))){
                return Number(pcaLabelPointStyles[labelKey].strokeWidth);
              }
              return Number(pcaBorderWidth.value) || 0;
            },
            onWidthChange(value, ctx){
              const next = Math.max(0, Number(value) || 0);
              if(ctx.scope === 'label' && hasLabelScope){
                applyLabelPointPatch({ borderWidth: next, strokeWidth: next });
              }else{
                pcaBorderWidth.value = String(next);
                applyGlobalPointPatch('borderWidth', next);
                applyGlobalPointPatch('strokeWidth', next);
                requestPcaViewRefresh('border-width-change');
              }
            }
          },
          size: {
            get(ctx){
              if(ctx.scope === 'label' && hasLabelScope && Number.isFinite(Number(pcaLabelPointStyles[labelKey]?.size))){
                return Number(pcaLabelPointStyles[labelKey].size);
              }
              return Number(pcaDotSize.value) || 0;
            },
            onChange(value, ctx){
              const next = Math.max(0, Number(value) || 0);
              if(ctx.scope === 'label' && hasLabelScope){
                applyLabelPointPatch({ size: next });
              }else{
                pcaDotSize.value = String(next);
                applyGlobalPointPatch('size', next);
                requestPcaViewRefresh('dot-size-change');
              }
            }
          },
          transparency: {
            label: 'Transparency',
            get(ctx){
              if(ctx.scope === 'label' && hasLabelScope && Number.isFinite(Number(pcaLabelPointStyles[labelKey]?.alpha))){
                return Number(pcaLabelPointStyles[labelKey].alpha);
              }
              return Number(pcaAlpha.value) || 0;
            },
            onChange(value, ctx){
              const next = Math.min(1, Math.max(0, Number(value) || 0));
              if(ctx.scope === 'label' && hasLabelScope){
                applyLabelPointPatch({ alpha: next });
              }else{
                pcaAlpha.value = String(next);
                pcaAlphaVal.textContent = String(next);
                applyGlobalPointPatch('alpha', next);
                requestPcaViewRefresh('alpha-change');
              }
            }
          }
        });
      };
      pcaAlphaVal.textContent=pcaAlpha.value;
      if(pcaViewMode){
        pcaViewMode.addEventListener('change', event => {
          const mode = (pcaViewMode.value || DEFAULT_VIEW_MODE);
          if(event?.isTrusted && mode === '3d' && lastPcaViewMode !== '3d'){
            resetPcaRotation('view-mode-change');
          }
          lastPcaViewMode = mode;
          debugLog('Debug: pca viewMode change',{ mode }); // Debug: view mode toggle listener
          applyAxisVisibility(mode);
          syncPcaAspectControls('view-mode-change');
          requestPcaViewRefresh('view-mode-change');
        });
      }
      if(pcaExportEigenTableBtn){
        pcaExportEigenTableBtn.addEventListener('click', handleEigenExport);
      }
      updateEigenExportVisibility(false);
      pcaMethod.addEventListener('change',()=>{
        const methodValue = pcaMethod.value;
        debugLog('Debug: pcaMethod changed',{ method: methodValue });
        applyMethodUiState(methodValue);
        markPcaDataDirty('method-change');
        scheduleDrawPca({ force: true, reason: 'method-change' });
      });
      pcaFill.addEventListener('input',()=>{
        debugLog('Debug: pcaFill changed',{ value: pcaFill.value });
        requestPcaViewRefresh('fill-change');
      });
      pcaBorder.addEventListener('input',()=>{
        debugLog('Debug: pcaBorder changed',{ value: pcaBorder.value });
        requestPcaViewRefresh('border-color-change');
      });
      pcaBorderWidth.addEventListener('input',()=>{
        debugLog('Debug: pcaBorderWidth changed',{ value: pcaBorderWidth.value });
        requestPcaViewRefresh('border-width-change');
      });
      pcaDotSize.addEventListener('input',()=>{
        debugLog('Debug: pcaDotSize changed',{ value: pcaDotSize.value });
        requestPcaViewRefresh('dot-size-change');
      });
      pcaAlpha.addEventListener('input',()=>{
        pcaAlphaVal.textContent=pcaAlpha.value;
        debugLog('Debug: pcaAlpha changed',{ value: pcaAlpha.value });
        requestPcaViewRefresh('alpha-change');
      });
      pcaFontSize.addEventListener('input',()=>{
        if(pcaFontSize.dataset){
          pcaFontSize.dataset.fontBasePt = String(pcaFontSize.value);
          debugLog('Debug: pca font size input manual set',{ value: pcaFontSize.value }); // Debug: manual slider update
        }
        chartStyle.renderFontSizeLabel({ element: pcaFontSizeVal, pt: Number(pcaFontSize.value), input: pcaFontSize, manual: true });
        requestPcaViewRefresh('font-size-change');
      });
      [pcaTsnePerplexity,pcaTsneLearningRate,pcaTsneIterations,pcaTsneExaggeration].filter(Boolean).forEach(input => {
        input.addEventListener('input',()=>{
          console.debug('Debug: tsne control change',{ id: input.id, value: input.value });
          requestPcaDataRefresh('tsne-setting-change');
        });
      });
      [pcaUmapNeighbors,pcaUmapMinDist,pcaUmapLearningRate,pcaUmapEpochs].filter(Boolean).forEach(input => {
        input.addEventListener('input',()=>{
          console.debug('Debug: umap control change',{ id: input.id, value: input.value });
          requestPcaDataRefresh('umap-setting-change');
        });
      });
      if(pcaShowGrid){
        pcaShowGrid.addEventListener('change',()=>{
          debugLog('Debug: pca showGrid change',{ checked: pcaShowGrid.checked });
          requestPcaViewRefresh('grid-toggle');
        });
      }
      if(pcaScale){
        pcaScale.addEventListener('change',()=>{
          debugLog('Debug: pca scale toggle',{ checked: pcaScale.checked });
          requestPcaDataRefresh('scale-toggle');
        });
      }
      pcaShowFrame.addEventListener('change',()=>{
        debugLog('Debug: pca showFrame change',{checked:pcaShowFrame.checked});
        requestPcaViewRefresh('frame-toggle');
      });
      function ensurePcaLabelStyles(labels, groupMeta){
        const labelArray = Array.isArray(labels) ? labels : [];
        const targetMode = pcaState.tableFormat === 'grouped' ? 'grouped' : 'standard';
        if(targetMode !== pcaLabelStyleMode){
          if(targetMode === 'grouped'){
            pcaLabelColorsBackup = { ...pcaLabelColors };
            pcaLabelShapesBackup = { ...pcaLabelShapes };
          }else if(pcaLabelStyleMode === 'grouped'){
            pcaLabelColors = pcaLabelColorsBackup ? { ...pcaLabelColorsBackup } : {};
            pcaLabelShapes = pcaLabelShapesBackup ? { ...pcaLabelShapesBackup } : {};
          }
          pcaLabelStyleMode = targetMode;
          debugLog('Debug: pca label style mode updated',{ mode: targetMode });
        }
        if(targetMode === 'grouped'){
          debugLog('Debug: ensurePcaLabelStyles skipped',{ grouped: true, labels: labelArray.length });
          return;
        }
        const labelSet = new Set();
        labelArray.forEach((lab,i)=>{
          if(!lab){ return; }
          labelSet.add(lab);
          if(!pcaLabelColors[lab]){
            pcaLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
            debugLog('Debug: pca default label color applied',{label:lab,color:pcaLabelColors[lab]});
          }
          const currentShape = pcaLabelShapes[lab];
          if(currentShape){
            const sanitized = sanitizeGroupShape(currentShape, i);
            if(sanitized !== currentShape){
              pcaLabelShapes[lab] = sanitized;
            }
          }else{
            const defaultShape = GROUP_SHAPE_DEFAULTS.length
              ? GROUP_SHAPE_DEFAULTS[i%GROUP_SHAPE_DEFAULTS.length]
              : 'circle';
            pcaLabelShapes[lab] = sanitizeGroupShape(defaultShape, i);
            debugLog('Debug: pca default label shape applied',{label:lab,shape:pcaLabelShapes[lab]});
          }
        });
        Object.keys(pcaLabelColors).forEach(existing=>{
          if(!labelSet.has(existing)){
            debugLog('Debug: pca label color pruned',{label:existing});
            delete pcaLabelColors[existing];
          }
        });
        Object.keys(pcaLabelShapes).forEach(existing=>{
          if(!labelSet.has(existing)){
            debugLog('Debug: pca label shape pruned',{label:existing});
            delete pcaLabelShapes[existing];
          }
        });
        Object.keys(pcaLabelPointStyles).forEach(existing=>{
          if(!labelSet.has(existing)){
            debugLog('Debug: pca label point style pruned',{label:existing});
            delete pcaLabelPointStyles[existing];
          }
        });
        debugLog('Debug: ensurePcaLabelStyles sync complete',{
          colors:Object.keys(pcaLabelColors).length,
          shapes:Object.keys(pcaLabelShapes).length,
          grouped:false
        });
      }

      function handleLegendColorChange(entry, anchor){
        if(typeof Shared.openColorPicker !== 'function'){ return; }
        const initialColor = entry.color;
        let shapePicker = null;
        let previousShape = null;
        if(Number.isInteger(entry.groupIndex)){
          const groupIndex = entry.groupIndex;
          ensurePcaGroupedDefaults();
          const currentShape = sanitizeGroupShape(pcaState.grouped.shapes?.[groupIndex], groupIndex);
          pcaState.grouped.shapes[groupIndex] = currentShape;
          previousShape = currentShape;
          const applyGroupShape = (shapeValue) => {
            const sanitized = sanitizeGroupShape(shapeValue, groupIndex);
            if(pcaState.grouped.shapes[groupIndex] === sanitized){
              return true;
            }
            pcaState.grouped.shapes[groupIndex] = sanitized;
            updateGroupedShapeInput(groupIndex, sanitized);
            requestPcaViewRefresh('legend-group-shape');
            return true;
          };
          shapePicker = {
            value: currentShape,
            options: GROUP_SHAPE_OPTIONS,
            onChange(nextShape){
              const sanitized = sanitizeGroupShape(nextShape, groupIndex);
              if(sanitized===previousShape){
                return;
              }
              applyGroupShape(sanitized);
              recordPcaChange(`pca:group-shape:${groupIndex}`, previousShape, sanitized, value => applyGroupShape(value));
              previousShape = sanitized;
              debugLog('Debug: pca legend group shape change',{ groupIndex, shape: sanitized });
            }
          };
        }else if(entry.labelValue){
          const labelKey = entry.labelValue;
          const labelIndex = Number.isInteger(entry.labelIndex) ? entry.labelIndex : 0;
          const currentShape = sanitizeGroupShape(pcaLabelShapes[labelKey] || 'circle', labelIndex);
          pcaLabelShapes[labelKey] = currentShape;
          previousShape = currentShape;
          const applyLabelShape = (shapeValue) => applyPcaLabelShape(labelKey, shapeValue, labelIndex);
          shapePicker = {
            value: currentShape,
            options: GROUP_SHAPE_OPTIONS,
            onChange(nextShape){
              const sanitized = sanitizeGroupShape(nextShape, labelIndex);
              if(sanitized===previousShape){
                return;
              }
              applyLabelShape(sanitized);
              recordPcaChange(`pca:label-shape:${labelKey}`, previousShape, sanitized, value => applyLabelShape(value));
              previousShape = sanitized;
              debugLog('Debug: pca legend label shape change',{ label: labelKey, shape: sanitized });
            }
          };
        }
        const applyLegendColor = (colorValue) => {
          if(Number.isInteger(entry.groupIndex)){
            const resolved = typeof colorValue === 'string' && colorValue ? colorValue : initialColor;
            const index = entry.groupIndex;
            applyPcaGroupColor(index, resolved);
            updateGroupedColorInput(index, resolved);
            debugLog('Debug: pca legend group color input',{ groupIndex: index, color: resolved });
            return resolved;
          }
          if(entry.labelValue){
            const resolved = typeof colorValue === 'string' && colorValue ? colorValue : initialColor;
            applyPcaLabelColor(entry.labelValue, resolved);
            debugLog('Debug: pca legend label color input',{ label: entry.labelValue, color: resolved });
            return resolved;
          }
          requestPcaViewRefresh('legend-color');
          return typeof colorValue === 'string' && colorValue ? colorValue : initialColor;
        };
        let previousColor = initialColor;
        Shared.openColorPicker({
          anchor,
          color: initialColor,
          shapePicker,
          onInput(value){
            previousColor = applyLegendColor(value);
          },
          onChange(value){
            const nextValue = applyLegendColor(value);
            if(nextValue === previousColor){
              return;
            }
            recordPcaChange(`pca:legend-color:${entry.groupIndex != null ? entry.groupIndex : entry.labelValue || 'label'}`, previousColor, nextValue, val => {
              applyLegendColor(val);
              return true;
            });
            previousColor = nextValue;
          }
        });
      }
      if(pcaPlotDiv?.style){
        pcaPlotDiv.style.removeProperty('background');
      }
      const debugEnabled = typeof Shared?.isDebugEnabled === 'function' ? Shared.isDebugEnabled() : global.DEBUG_PCA === true;
      global.DEBUG_PCA = debugEnabled;
      const pcaContainer=pcaPlotDiv.closest('.svgbox')||pcaPlotDiv.parentElement;
      if(!pcaContainer){
        debugLog('Debug: pca resizer container missing', { hasContainer: !!pcaContainer });
      }
    async function drawPca(){
      const drawOpts = pendingDrawOptions || {};
      pendingDrawOptions = {};
      const viewOnly = !!drawOpts.viewOnly;
      const shouldBumpToken = !viewOnly || !!pcaState.dataDirty;
      const drawToken = shouldBumpToken
        ? (pcaState.drawToken || 0) + 1
        : (pcaState.drawToken || 0);
      if(shouldBumpToken){
        pcaState.drawToken = drawToken;
      }
      const totalStart = nowMs();
      let parseEnd = null;
      let computeStart = null;
      let computeEnd = null;
      let sampleCountSnapshot = 0;
      let featureCountSnapshot = 0;
      let methodSnapshot = null;
      let fastPointModeActive = false;
      let points = [];
      let loadingsRows = [];
      let loadingsComponents = 0;
      let loadingsTotalCount = 0;
      let loadingsTruncated = false;
      let statsSummaryLines = [];
      let eigenSummaryData = [];
      let screeData = [];
      let componentSelectionSummary = null;
      let parallelAnalysisPercent = [];
      let statsMethod = null;
      let dimensionMeta = [];
      let labels = [];
      let manualLabelFlags = [];
      let sampleColumnIndices = [];
      let groupedHeaderRowCache = [];
      let points3d = [];
      let axisIndices = { x: 0, y: 1, z: null };
      let pcaXLabelText = 'PC1';
      let pcaYLabelText = 'PC2';
      let pcaZLabelText = 'PC3';
      let groupMeta = null;
      let cachePayload = null;
      let usingCache = false;
      let skipPerfRecord = false;
      try{
      if(viewOnly && !pcaState.viewDirty && !pcaState.dataDirty){
        debugLog('Debug: pca view refresh skipped',{ reason: drawOpts.reason || 'view-clean' });
        skipPerfRecord = true;
        return;
      }
      if(pcaState.rotationPending){
        debugLog('Debug: pca rotation pending reset at draw');
      }
      pcaState.rotationPending = false;
      pcaState.rotationPendingLogged = false;
      const debugStamp = Date.now();
      debugLog('Debug: drawPca invoked', { debugStamp }); // Debug: draw invocation marker
      hidePcaTooltip('draw-start');
      ensurePcaResizerControls();
      const showLegend = !pcaShowLegendInput || !!pcaShowLegendInput.checked;
      debugLog('Debug: pca showLegend state',{ showLegend });

      usingCache = viewOnly && !pcaState.dataDirty && !!pcaState.cachedRender;
      let method = (pcaMethod.value || 'pca').toLowerCase();
      methodSnapshot = method;
      const previousMethod = typeof pcaState.lastMethod === 'string' ? pcaState.lastMethod : 'pca';
      if(!pcaState.labels || typeof pcaState.labels !== 'object'){
        pcaState.labels = { title: getDefaultTitleForMethod(method) };
      }
      const methodChanged = previousMethod !== method;
      if(methodChanged){
        const previousDefaultTitle = getDefaultTitleForMethod(previousMethod);
        const currentTitle = (pcaState.labels.title || '').trim();
        if(!currentTitle || currentTitle === previousDefaultTitle){
          pcaState.labels.title = getDefaultTitleForMethod(method);
          debugLog('Debug: pca title default adjusted',{ previousMethod, method });
        }
      }
      pcaState.lastMethod = method;
      let pcaTitleText = (pcaState.labels.title || '').trim();
      if(!pcaTitleText){
        pcaTitleText = getDefaultTitleForMethod(method);
      }
      const commitTitleChange = (value, reason) => {
        const trimmed = (value || '').trim();
        const fallbackTitle = getDefaultTitleForMethod(method);
        const nextTitle = trimmed || fallbackTitle;
        if(!pcaState.labels || typeof pcaState.labels !== 'object'){
          pcaState.labels = { title: nextTitle };
        }
        const previousTitle = pcaState.labels.title || fallbackTitle;
        if(previousTitle === nextTitle){
          return nextTitle;
        }
        const applyTitle = (titleValue) => {
          applyPcaTitleValue(null, titleValue);
          return true;
        };
        applyTitle(nextTitle);
        debugLog('Debug: pca title updated',{ title: nextTitle, reason: reason || 'inline-edit' });
        recordPcaChange('pca:title', previousTitle, nextTitle, applyTitle);
        return nextTitle;
      };
      const rawViewMode = (pcaViewMode?.value || DEFAULT_VIEW_MODE).toLowerCase();
      const requestedViewMode = (method === 'pca' || method === 'mds') ? rawViewMode : '2d';
      if(rawViewMode !== requestedViewMode){
        debugLog('Debug: pca view mode adjusted for method',{ method, rawViewMode, requestedViewMode });
      }

      let SVDLib = global.SVDJS || globalThis.SVDJS;
      const jStatLib = global.jStat || globalThis.jStat;

      if ((!SVDLib || !SVDLib.SVD) && typeof Shared.lazySvd === 'function') {
        try {
          debugLog('Debug: pca request Shared.lazySvd'); // Debug: request SVD loader
          SVDLib = await Shared.lazySvd();
        } catch (err) {
          console.error('PCA lazy SVD load failed', err);
        }
      }

      if ((!SVDLib || !SVDLib.SVD) && (global.SVDJS?.SVD || globalThis.SVDJS?.SVD)) {
        SVDLib = global.SVDJS || globalThis.SVDJS;
      }

      if (SVDLib && SVDLib.SVD) {
        debugLog('Debug: pca svd available', { viaLazy: typeof Shared.lazySvd === 'function' }); // Debug: SVD ready for computations
      }

      if (!SVDLib || !SVDLib.SVD || !jStatLib) {
        console.error('PCA dependencies missing');
        if (pcaPlotDiv) {
          pcaPlotDiv.innerHTML = '<i>PCA dependencies missing.</i>';
        }
        resetStatsPanel('');
        updateAxisSelectOptions({ dimensionMeta: [], viewMode: requestedViewMode, method });
        return;
      }
      resetStatsPanel();
      lastPcaStats = null;
      statsSummaryLines = [];
      eigenSummaryData = [];
      screeData = [];
      statsMethod = null;
      dimensionMeta = [];

      const fill = pcaFill.value;
      const alpha = Number(pcaAlpha.value) || 0;
      const borderWidthRaw = Number(pcaBorderWidth.value);
      const borderColor = pcaBorder.value;
      const containerRect=pcaSvgBox?.getBoundingClientRect?.();
      const fontInfo=chartStyle.resolveScaledFontSize({
        rawSize: pcaFontSize.value,
        width: containerRect?.width,
        height: containerRect?.height,
        svgBox: pcaSvgBox,
        input: pcaFontSize
      });
      const fs=fontInfo.scaledPx;
      const styleScaleInfo=fontInfo.scaleInfo;
      const axisSettings = ensureAxisSettings();
      const axisStrokeWidthBase = axisSettings.strokeWidth;
      const axisStrokeWidth=chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'pca-axis', min: 0, exact: true });
      const axisStroke = axisSettings.color || '#000';
      const pcaThemeDark = String(pcaState.theme?.colorScheme || '').toLowerCase() === 'dark';
      const pcaThemeTextColor = normalizePcaThemeColor(
        pcaState.theme?.textColor,
        pcaThemeDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000')
      );
      const dotSizeRaw = Number(pcaDotSize.value) || 3;
      const dotSizePx = chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'pca-point', min: 0 });
      const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'pca-border', min: 0 });
      debugLog('Debug: pca style scaling applied',{
        dotSizeRaw,
        dotSizePx,
        borderWidthRaw,
        borderWidthPx,
        axisStrokeWidth,
        styleScale: styleScaleInfo?.styleScale
      }); // Debug: pca style scaling summary
      chartStyle.renderFontSizeLabel({ element: pcaFontSizeVal, fontInfo, input: pcaFontSize });
      debugLog('Debug: pca font scaling applied',{
        input:pcaFontSize.value,
        fontSizePt:fontInfo.pt,
        baseFontPx:fontInfo.px,
        scaledFontPx:fs,
        scale:styleScaleInfo?.styleScale || styleScaleInfo?.scale,
        containerWidth:containerRect?.width,
        containerHeight:containerRect?.height
      });
      const axisMetrics = chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo);
      debugLog('Debug: pca axis metrics',axisMetrics);
      const fontScale=styleScaleInfo?.styleScale || styleScaleInfo?.scale || 1;
      const showGrid = pcaShowGrid.checked;
      const gridStyleBase = getGridStyle(axisStrokeWidthBase);
      const gridStrokeStyle = Object.assign({}, gridStyleBase, {
        thickness: chartStyle.scaleStrokeWidth(gridStyleBase.thickness, styleScaleInfo, { context: 'pca-grid', min: 0 })
      });
      const gridDash = (gridControls && typeof gridControls.patternToDasharray === 'function')
        ? gridControls.patternToDasharray(gridStrokeStyle.pattern, gridStrokeStyle.thickness)
        : null;
      const gridOpacity = (gridControls && typeof gridControls.transparencyToOpacity === 'function')
        ? gridControls.transparencyToOpacity(gridStrokeStyle.transparency)
        : 1;
      const gridStrokeAttrs = (gridControls && typeof gridControls.getStrokeAttributes === 'function')
        ? gridControls.getStrokeAttributes(gridStrokeStyle, { fallbackColor: DEFAULT_GRID_COLOR, fallbackThickness: axisStrokeWidth })
        : { stroke: DEFAULT_GRID_COLOR, 'stroke-width': axisStrokeWidth };
      const showFrame = pcaShowFrame.checked;
      debugLog('Debug: pca showFrame state',{showFrame});
      const dotSize = dotSizeRaw; // retain original reference for downstream logs
      const scaleVars = pcaScale.checked;
      debugLog('Debug: pca axis range auto',{ scaleVars });
      if(usingCache){
        const cached = pcaState.cachedRender;
        if(cached){
          if(typeof cached.method === 'string'){
            method = cached.method;
            methodSnapshot = cached.method;
          }
          statsSummaryLines = Array.isArray(cached.statsSummaryLines) ? cached.statsSummaryLines : [];
          screeData = Array.isArray(cached.screeData) ? cached.screeData : [];
          statsMethod = cached.statsMethod || null;
          eigenSummaryData = Array.isArray(cached.eigenSummaryData) ? cached.eigenSummaryData : [];
          dimensionMeta = Array.isArray(cached.dimensionMeta) ? cached.dimensionMeta : [];
          points = Array.isArray(cached.points) ? cached.points : [];
          points3d = Array.isArray(cached.points3d) ? cached.points3d : [];
          labels = Array.isArray(cached.labels) ? cached.labels : [];
          sampleColumnIndices = Array.isArray(cached.sampleColumnIndices) ? cached.sampleColumnIndices.slice() : [];
          groupedHeaderRowCache = Array.isArray(cached.groupedHeaderRow) ? cached.groupedHeaderRow.slice() : [];
          loadingsRows = Array.isArray(cached.loadingsRows) ? cached.loadingsRows : [];
          loadingsComponents = Number(cached.loadingsComponents) || 0;
          loadingsTotalCount = Number.isFinite(cached.loadingsTotalCount) ? cached.loadingsTotalCount : loadingsRows.length;
          loadingsTruncated = !!cached.loadingsTruncated;
          sampleCountSnapshot = Number(cached.sampleCount) || points.length;
          featureCountSnapshot = Number(cached.featureCount) || 0;
          if(cached.axisIndices && typeof cached.axisIndices === 'object'){
            axisIndices = {
              x: Number.isFinite(cached.axisIndices.x) ? Number(cached.axisIndices.x) : 0,
              y: Number.isFinite(cached.axisIndices.y) ? Number(cached.axisIndices.y) : 1,
              z: Number.isFinite(cached.axisIndices.z) ? Number(cached.axisIndices.z) : null
            };
          }
          if(typeof cached.pcaXLabelText === 'string'){
            pcaXLabelText = cached.pcaXLabelText;
          }
          if(typeof cached.pcaYLabelText === 'string'){
            pcaYLabelText = cached.pcaYLabelText;
          }
          if(typeof cached.pcaZLabelText === 'string'){
            pcaZLabelText = cached.pcaZLabelText;
          }
          if(cached.statsSnapshot){
            lastPcaStats = cached.statsSnapshot;
          }
          if(viewOnly){
            parseEnd = totalStart;
            computeStart = totalStart;
            computeEnd = totalStart;
          }
        }
      } else {
      const hot = ensurePcaHotForActiveTab();
      const data = hot?.getData?.() || [];
      const labelRowIndex = resolvePcaLabelRowIndex(data);
      const headerRowIndex = resolvePcaHeaderRowIndex(data, labelRowIndex);
      const labelRow = Number.isInteger(labelRowIndex) ? (Array.isArray(data[labelRowIndex]) ? data[labelRowIndex] : []) : [];
      const groupHeaderRow = (pcaState.tableFormat === 'grouped' && Array.isArray(data[PCA_GROUP_ROW_INDEX]))
        ? data[PCA_GROUP_ROW_INDEX]
        : [];
      const dataStartRow = resolvePcaDataStartRow(labelRowIndex, headerRowIndex);
      const headerRow = Number.isInteger(headerRowIndex) && Array.isArray(data[headerRowIndex]) ? data[headerRowIndex] : [];
      const candidateColCount = headerRow.length;
      const numericColIndices = [];
      for (let c = 1; c < candidateColCount; c++) {
        const headerRaw = headerRow[c];
        const headerText = typeof headerRaw === 'string' ? headerRaw.trim() : '';
        let hasNumericData = headerText.length > 0;
        if (!hasNumericData) {
          for (let r = dataStartRow; r < data.length; r++) {
            const cell = data[r] ? data[r][c] : undefined;
            if (cell === null || typeof cell === 'undefined') {
              continue;
            }
            if (typeof cell === 'string' && cell.trim() === '') {
              continue;
            }
            const cellVal = parseFloat(cell);
            if (!Number.isNaN(cellVal)) {
              hasNumericData = true;
              break;
            }
            // non-numeric value encountered, treat column as unsuitable
            hasNumericData = false;
            break;
          }
        }
        if (hasNumericData) {
          numericColIndices.push(c);
        }
      }
      debugLog('Debug: pca numeric column scan', {
        candidateColCount,
        numericColIndices,
      });
      sampleColumnIndices = numericColIndices.slice();
      groupedHeaderRowCache = groupHeaderRow.slice();

      const conditionLabels = numericColIndices.map((colIndex, idx) => {
        const headerVal = headerRow[colIndex];
        const headerText = headerVal == null ? '' : String(headerVal).trim();
        return headerText || `Condition ${idx + 1}`;
      });
      labels = conditionLabels.slice();
      if(Number.isInteger(labelRowIndex)){
        manualLabelFlags = numericColIndices.map(colIndex => parsePcaPointLabelFlag(labelRow?.[colIndex]));
        const flaggedCount = manualLabelFlags.filter(Boolean).length;
        debugLog('Debug: pca label row detected', { labelRowIndex, flaggedCount, columns: manualLabelFlags.length });
      }else{
        manualLabelFlags = new Array(numericColIndices.length).fill(false);
      }
      const matrixByCondition = Array.from({ length: conditionLabels.length }, () => []);
      const featureLabelsAccumulator = [];

      for (let r = dataStartRow; r < data.length; r++) {
        const row = data[r];
        if (!row) continue;

        const lab = row[0] ? String(row[0]).trim() : '';
        const featureIndex = featureLabelsAccumulator.length;
        const resolvedFeatureLabel = lab || `Var ${featureIndex + 1}`;
        const vals = [];
        let rowValid = true;

        for (let i = 0; i < numericColIndices.length; i++) {
          const colIndex = numericColIndices[i];
          const cell = row[colIndex];
          if (cell === null || typeof cell === 'undefined' || (typeof cell === 'string' && cell.trim() === '')) {
            rowValid = false;
            debugLog('Debug: pca row skipped due to blank cell', { rowIndex: r, colIndex });
            break;
          }
          const v = parseFloat(cell);
          if (Number.isNaN(v)) {
            rowValid = false;
            debugLog('Debug: pca row skipped due to NaN', { rowIndex: r, colIndex, cell });
            break;
          }
          vals.push(v);
        }

        if (rowValid && vals.length) {
          featureLabelsAccumulator.push(resolvedFeatureLabel);
          for (let i = 0; i < vals.length; i++) {
            matrixByCondition[i].push(vals[i]);
          }
        }
      }

      if (numericColIndices.length < 2) {
        if(typeof Shared.renderPlotNotice === 'function'){
          Shared.renderPlotNotice(pcaPlotDiv, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, { resetAspect: true, show: true });
        }else{
          pcaPlotDiv.innerHTML = '<i>Add data to the input table to generate a plot.</i>';
        }
        resetStatsPanel();
        updateAxisSelectOptions({ dimensionMeta: [], viewMode: requestedViewMode, method });
        return;
      }

      const matrix = matrixByCondition;
      let featureLabels = featureLabelsAccumulator;

      debugLog('Debug: pca dataset summary', {
        conditionCount: labels.length,
        featureCount: featureLabels.length,
      });

      if (labels.length < 2) {
        if(typeof Shared.renderPlotNotice === 'function'){
          Shared.renderPlotNotice(pcaPlotDiv, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, { resetAspect: true, show: true });
        }else{
          pcaPlotDiv.innerHTML = '<i>Add data to the input table to generate a plot.</i>';
        }
        resetStatsPanel();
        updateAxisSelectOptions({ dimensionMeta: [], viewMode: requestedViewMode, method });
        return;
      }

      if (featureLabels.length < 2 || !matrix[0] || matrix[0].length < 2) {
        if(typeof Shared.renderPlotNotice === 'function'){
          Shared.renderPlotNotice(pcaPlotDiv, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, { resetAspect: true, show: true });
        }else{
          pcaPlotDiv.innerHTML = '<i>Add data to the input table to generate a plot.</i>';
        }
        resetStatsPanel();
        updateAxisSelectOptions({ dimensionMeta: [], viewMode: requestedViewMode, method });
        return;
      }

      for (let i = 0; i < matrix.length; i++) {
        if (matrix[i].length !== featureLabels.length) {
          debugLog('Debug: pca condition vector length mismatch', {
            conditionIndex: i,
            expected: featureLabels.length,
            actual: matrix[i].length,
          });
          matrix[i].length = featureLabels.length;
        }
      }
      statsMethod = method;
      const statsOutputsEnabled = method === 'pca';
      debugLog('Debug: pca stats outputs configured',{ method, statsOutputsEnabled });
      const nSamples = matrix.length;
      const nFeatures = matrix[0].length;
      sampleCountSnapshot = nSamples;
      featureCountSnapshot = nFeatures;

      for (let j = 0; j < nFeatures; j++) {
        const col = matrix.map((r) => r[j]);
        const mean = jStatLib.mean(col);
        const sd = jStatLib.stdev(col, true);

        for (let i = 0; i < nSamples; i++) {
          let val = matrix[i][j] - mean;
          if (scaleVars && sd > 0) {
            val /= sd;
          }
          matrix[i][j] = val;
        }
      }

      if(parseEnd === null){
        parseEnd = nowMs();
      }

      if (!SVDLib || !SVDLib.SVD) {
        console.error('SVDLib missing');
        pcaPlotDiv.innerHTML = '<i>PCA library not loaded.</i>';
        return;
      }

      groupMeta = resolvePcaGroupMeta(nSamples, labels, {
        columnIndices: sampleColumnIndices,
        groupHeaderRow: groupedHeaderRowCache
      });
      if(pcaState.tableFormat === 'grouped'){
        updatePcaGroupedHeaders();
      }
      points3d = [];
      axisIndices = { x: 0, y: 1, z: null };

      if (method === 'mds') {
        if(computeStart === null){
          computeStart = nowMs();
        }
        console.debug('Debug: mds branch entered', { method }); // Debug: MDS execution path
        let mdsWorkerResult = null;
        if(shouldUsePcaEmbedWorker('mds', nSamples, nFeatures)){
          mdsWorkerResult = await runPcaEmbedWorker('mds', {
            matrix,
            requestedDims: requestedViewMode === '3d' ? 3 : 2
          });
          if(drawToken !== pcaState.drawToken){
            debugLog('Debug: pca embed worker result ignored', { reason: 'stale-token', drawToken, current: pcaState.drawToken });
            return;
          }
        }
        if(mdsWorkerResult && Array.isArray(mdsWorkerResult.coords)){
          const coords = mdsWorkerResult.coords;
          const dimsToUse = Number(mdsWorkerResult.dimsToUse) || 0;
          const totalPositive = Number(mdsWorkerResult.totalPositive) || 0;
          eigenSummaryData = Array.isArray(mdsWorkerResult.eigenSummary) ? mdsWorkerResult.eigenSummary.slice() : [];
          if(dimsToUse === 0){
            pcaPlotDiv.innerHTML = '<i>MDS could not find positive eigenvalues.</i>';
            resetStatsPanel();
            updateAxisSelectOptions({ dimensionMeta: [], viewMode: requestedViewMode, method });
            return;
          }
          dimensionMeta = eigenSummaryData.map(entry => ({
            value: entry.component,
            label: entry.componentLabel || `Dim${entry.component}`,
            variancePercent: entry.variancePercent
          }));
          updateAxisSelectOptions({ dimensionMeta, viewMode: requestedViewMode, method });
          axisIndices = axisSelectionToIndices(dimensionMeta.length);
          points = coords.map((row, idx) => ({
            x: row[axisIndices.x] || 0,
            y: axisIndices.y != null ? (row[axisIndices.y] || 0) : 0,
            label: labels[idx],
            index: idx,
            columnIndex: Number.isInteger(numericColIndices?.[idx]) ? numericColIndices[idx] : null,
            isManualLabel: !!manualLabelFlags[idx]
          }));
          const xMeta = dimensionMeta[axisIndices.x] || dimensionMeta[0] || null;
          const yMeta = dimensionMeta[axisIndices.y] || dimensionMeta[1] || null;
          const zMeta = typeof axisIndices.z === 'number' ? (dimensionMeta[axisIndices.z] || null) : null;
          const dim1Pct = dimensionMeta[0]?.variancePercent ?? 0;
          const dim2Pct = dimensionMeta[1]?.variancePercent ?? 0;
          const dim3Pct = dimensionMeta[2]?.variancePercent ?? null;
          pcaXLabelText = xMeta ? formatAxisLabel(xMeta) : `MDS${(axisIndices.x || 0) + 1}`;
          pcaYLabelText = yMeta ? formatAxisLabel(yMeta) : (dimensionMeta.length > 1 ? `MDS${(axisIndices.y || 1) + 1}` : 'MDS2');
          if(zMeta || dimensionMeta.length >= 3){
            pcaZLabelText = zMeta ? formatAxisLabel(zMeta) : `MDS${(axisIndices.z ?? 2) + 1}`;
          }
          const stress = Number(mdsWorkerResult.stress) || 0;
          statsSummaryLines = [`Dim1: ${dim1Pct.toFixed(1)}% inertia`];
          if (dimsToUse > 1) {
            statsSummaryLines.push(`Dim2: ${dim2Pct.toFixed(1)}% inertia`);
          }
          if (dimsToUse > 2 && dim3Pct != null) {
            statsSummaryLines.push(`Dim3: ${dim3Pct.toFixed(1)}% inertia`);
          }
          statsSummaryLines.push(`Stress-1: ${stress.toFixed(3)}`);
          lastPcaStats = {
            method: 'mds',
            eigenSummary: eigenSummaryData.map(entry => ({
              component: entry.component,
              componentLabel: entry.componentLabel,
              eigenvalue: Number(entry.eigenvalue),
              varianceRatio: Number(entry.varianceRatio),
              variancePercent: Number(entry.variancePercent),
              cumulativeVarianceRatio: Number(entry.cumulativeVarianceRatio),
              cumulativeVariancePercent: Number(entry.cumulativeVariancePercent),
              singularValue: Number(entry.singularValue)
            })),
            scree: eigenSummaryData.map(entry => ({
              component: entry.component,
              variancePercent: Number(entry.variancePercent)
            })),
            stress: Number(stress.toFixed(6)),
            dimensions: dimsToUse,
            totalVariance: Number(totalPositive),
            summaryLines: statsSummaryLines.slice()
          };
          if (dimensionMeta.length >= 3 && typeof axisIndices.z === 'number') {
            points3d = coords.map((row, idx) => ({
              x: row[axisIndices.x] || 0,
              y: axisIndices.y != null ? (row[axisIndices.y] || 0) : 0,
              z: row[axisIndices.z] || 0,
              label: labels[idx],
              index: idx,
              columnIndex: Number.isInteger(numericColIndices?.[idx]) ? numericColIndices[idx] : null,
              isManualLabel: !!manualLabelFlags[idx]
            }));
          } else {
            points3d = [];
          }
          if(computeEnd === null){
            computeEnd = nowMs();
          }
        } else {
        const distanceMatrix = [];
        const squaredDistances = [];
        for (let i = 0; i < nSamples; i++) {
          distanceMatrix[i] = [];
          squaredDistances[i] = [];
          for (let j = 0; j < nSamples; j++) {
            let sumSq = 0;
            for (let k = 0; k < nFeatures; k++) {
              const diff = matrix[i][k] - matrix[j][k];
              sumSq += diff * diff;
            }
            const dist = Math.sqrt(sumSq);
            distanceMatrix[i][j] = dist;
            squaredDistances[i][j] = sumSq;
          }
        }

        let totalMean = 0;
        const rowMeans = new Array(nSamples).fill(0);
        const colMeans = new Array(nSamples).fill(0);
        for (let i = 0; i < nSamples; i++) {
          let rowSum = 0;
          for (let j = 0; j < nSamples; j++) {
            rowSum += squaredDistances[i][j];
            colMeans[j] += squaredDistances[i][j];
          }
          rowMeans[i] = rowSum / nSamples;
          totalMean += rowSum;
        }
        totalMean /= (nSamples * nSamples);
        for (let j = 0; j < nSamples; j++) {
          colMeans[j] /= nSamples;
        }

        const B = [];
        for (let i = 0; i < nSamples; i++) {
          B[i] = [];
          for (let j = 0; j < nSamples; j++) {
            B[i][j] = -0.5 * (squaredDistances[i][j] - rowMeans[i] - colMeans[j] + totalMean);
          }
        }
        console.debug('Debug: mds double centered matrix ready', { size: B.length });

        const mdsSvd = SVDLib.SVD(B);
        console.debug('Debug: mds svd result', mdsSvd);

        const eigenValues = mdsSvd.q.map((val) => val);
        const positiveEigen = eigenValues
          .map((val, idx) => ({ val, idx }))
          .filter(({ val }) => val > 1e-9);
        const dimsAvailable = positiveEigen.length;
        const requestedDims = (requestedViewMode === '3d') ? 3 : 2;
        const dimsToUse = Math.min(Math.max(requestedDims, 2), dimsAvailable);
        console.debug('Debug: mds eigen summary', { eigenValues, dimsAvailable, dimsToUse, requestedViewMode });

        if (dimsToUse === 0) {
          pcaPlotDiv.innerHTML = '<i>MDS could not find positive eigenvalues.</i>';
          resetStatsPanel();
          updateAxisSelectOptions({ dimensionMeta: [], viewMode: requestedViewMode, method });
          return;
        }

        const coords = [];
        for (let i = 0; i < nSamples; i++) {
          const coordRow = new Array(dimsToUse).fill(0);
          for (let dim = 0; dim < dimsToUse; dim++) {
            const eigenIdx = positiveEigen[dim].idx;
            const scale = Math.sqrt(Math.max(positiveEigen[dim].val, 0));
            coordRow[dim] = mdsSvd.u[i][eigenIdx] * scale;
          }
          coords.push(coordRow);
        }

        const totalPositive = positiveEigen.reduce((sum, { val }) => sum + val, 0);
        dimensionMeta = [];
        let cumulativeRatio = 0;
        eigenSummaryData = [];
        for (let dim = 0; dim < dimsToUse; dim++) {
          const eigenVal = positiveEigen[dim]?.val ?? 0;
          const ratio = totalPositive > 0 ? eigenVal / totalPositive : 0;
          cumulativeRatio += ratio;
          const pct = ratio * 100;
          const cumulativePercent = Math.min(100, cumulativeRatio * 100);
          dimensionMeta.push({ value: dim + 1, label: `MDS${dim + 1}`, variancePercent: pct });
          eigenSummaryData.push({
            component: dim + 1,
            componentLabel: `Dim${dim + 1}`,
            eigenvalue: eigenVal,
            varianceRatio: ratio,
            variancePercent: pct,
            cumulativeVarianceRatio: Math.min(1, cumulativeRatio),
            cumulativeVariancePercent: cumulativePercent,
            singularValue: Math.sqrt(Math.max(eigenVal, 0))
          });
        }
        updateAxisSelectOptions({ dimensionMeta, viewMode: requestedViewMode, method });
        axisIndices = axisSelectionToIndices(dimensionMeta.length);
        points = coords.map((row, idx) => ({
          x: row[axisIndices.x] || 0,
          y: axisIndices.y != null ? (row[axisIndices.y] || 0) : 0,
          label: labels[idx],
          index: idx,
          columnIndex: Number.isInteger(numericColIndices?.[idx]) ? numericColIndices[idx] : null,
          isManualLabel: !!manualLabelFlags[idx]
        }));

        const xMeta = dimensionMeta[axisIndices.x] || dimensionMeta[0] || null;
        const yMeta = dimensionMeta[axisIndices.y] || dimensionMeta[1] || null;
        const zMeta = typeof axisIndices.z === 'number' ? (dimensionMeta[axisIndices.z] || null) : null;
        const dim1Pct = dimensionMeta[0]?.variancePercent ?? 0;
        const dim2Pct = dimensionMeta[1]?.variancePercent ?? 0;
        const dim3Pct = dimensionMeta[2]?.variancePercent ?? null;
        pcaXLabelText = xMeta ? formatAxisLabel(xMeta) : `MDS${(axisIndices.x || 0) + 1}`;
        pcaYLabelText = yMeta ? formatAxisLabel(yMeta) : (dimensionMeta.length > 1 ? `MDS${(axisIndices.y || 1) + 1}` : 'MDS2');
        if(zMeta || dimensionMeta.length >= 3){
          pcaZLabelText = zMeta ? formatAxisLabel(zMeta) : `MDS${(axisIndices.z ?? 2) + 1}`;
        }

        let stressNumerator = 0;
        let stressDenominator = 0;
        for (let i = 0; i < nSamples; i++) {
          for (let j = i + 1; j < nSamples; j++) {
            const fittedDx = (points[i].x - points[j].x);
            const fittedDy = (points[i].y - points[j].y);
            const fittedDist = Math.sqrt(fittedDx * fittedDx + fittedDy * fittedDy);
            const originalDist = distanceMatrix[i][j];
            const diff = originalDist - fittedDist;
            stressNumerator += diff * diff;
            stressDenominator += originalDist * originalDist;
          }
        }
        const stress = stressDenominator > 0 ? Math.sqrt(stressNumerator / stressDenominator) : 0;
        statsSummaryLines = [`Dim1: ${dim1Pct.toFixed(1)}% inertia`];
        if (dimsToUse > 1) {
          statsSummaryLines.push(`Dim2: ${dim2Pct.toFixed(1)}% inertia`);
        }
        if (dimsToUse > 2 && dim3Pct != null) {
          statsSummaryLines.push(`Dim3: ${dim3Pct.toFixed(1)}% inertia`);
        }
        statsSummaryLines.push(`Stress-1: ${stress.toFixed(3)}`);
        lastPcaStats = {
          method: 'mds',
          eigenSummary: eigenSummaryData.map(entry => ({
            component: entry.component,
            componentLabel: entry.componentLabel,
            eigenvalue: Number(entry.eigenvalue),
            varianceRatio: Number(entry.varianceRatio),
            variancePercent: Number(entry.variancePercent),
            cumulativeVarianceRatio: Number(entry.cumulativeVarianceRatio),
            cumulativeVariancePercent: Number(entry.cumulativeVariancePercent),
            singularValue: Number(entry.singularValue)
          })),
          scree: eigenSummaryData.map(entry => ({
            component: entry.component,
            variancePercent: Number(entry.variancePercent)
          })),
          stress: Number(stress.toFixed(6)),
          dimensions: dimsToUse,
          totalVariance: Number(totalPositive),
          summaryLines: statsSummaryLines.slice()
        };
        console.debug('Debug: mds stress computed', { stress, dimsToUse });
        if (dimensionMeta.length >= 3 && typeof axisIndices.z === 'number') {
          points3d = coords.map((row, idx) => ({
            x: row[axisIndices.x] || 0,
            y: axisIndices.y != null ? (row[axisIndices.y] || 0) : 0,
            z: row[axisIndices.z] || 0,
            label: labels[idx],
            index: idx,
            columnIndex: Number.isInteger(numericColIndices?.[idx]) ? numericColIndices[idx] : null,
            isManualLabel: !!manualLabelFlags[idx]
          }));
          console.debug('Debug: mds 3d coordinates prepared', { count: points3d.length, dimsToUse, axisIndices });
        } else {
          points3d = [];
          console.debug('Debug: mds 3d coordinates skipped', { dimsToUse, axisIndices });
        }
        if(computeEnd === null){
          computeEnd = nowMs();
        }
        }
      } else if (method === 'tsne') {
        console.debug('Debug: tsne branch entered',{ nSamples });
        const maxPerplexity = Math.max(2, nSamples - 1);
        const minPerplexity = Math.max(1, Math.min(5, maxPerplexity));
        const tsnePerplexity = clampNumber(pcaTsnePerplexity?.value ?? DEFAULT_TSNE_SETTINGS.perplexity, minPerplexity, maxPerplexity, DEFAULT_TSNE_SETTINGS.perplexity);
        const tsneLearningRate = clampNumber(pcaTsneLearningRate?.value ?? DEFAULT_TSNE_SETTINGS.learningRate, 10, 2000, DEFAULT_TSNE_SETTINGS.learningRate);
        const tsneIterations = Math.round(clampNumber(pcaTsneIterations?.value ?? DEFAULT_TSNE_SETTINGS.iterations, 200, 3000, DEFAULT_TSNE_SETTINGS.iterations));
        const tsneExaggeration = clampNumber(pcaTsneExaggeration?.value ?? DEFAULT_TSNE_SETTINGS.earlyExaggeration, 1, 50, DEFAULT_TSNE_SETTINGS.earlyExaggeration);
        if(computeStart === null){
          computeStart = nowMs();
        }
        let tsneResult = null;
        if(shouldUsePcaEmbedWorker('tsne', nSamples, nFeatures)){
          tsneResult = await runPcaEmbedWorker('tsne', {
            matrix,
            settings: {
              outputDims: 2,
              perplexity: tsnePerplexity,
              learningRate: tsneLearningRate,
              iterations: tsneIterations,
              earlyExaggeration: tsneExaggeration
            }
          });
          if(drawToken !== pcaState.drawToken){
            debugLog('Debug: pca embed worker result ignored', { reason: 'stale-token', drawToken, current: pcaState.drawToken });
            return;
          }
        }
        if(!tsneResult){
          tsneResult = computeTsneEmbedding(matrix, {
            outputDims: 2,
            perplexity: tsnePerplexity,
            learningRate: tsneLearningRate,
            iterations: tsneIterations,
            earlyExaggeration: tsneExaggeration,
            SVDLib
          });
        }
        if(computeEnd === null){
          computeEnd = nowMs();
        }
        dimensionMeta = [
          { value: 1, label: 't-SNE 1', variancePercent: Number.NaN },
          { value: 2, label: 't-SNE 2', variancePercent: Number.NaN }
        ];
        updateAxisSelectOptions({ dimensionMeta, viewMode: '2d', method });
        axisIndices = axisSelectionToIndices(dimensionMeta.length);
        pcaXLabelText = dimensionMeta[axisIndices.x]?.label || 't-SNE 1';
        pcaYLabelText = dimensionMeta[axisIndices.y]?.label || 't-SNE 2';
        pcaZLabelText = 't-SNE 3';
        points = tsneResult.embedding.map((coords, idx) => ({
          x: coords[axisIndices.x] ?? 0,
          y: coords[axisIndices.y] ?? 0,
          label: labels[idx],
          index: idx,
          columnIndex: Number.isInteger(numericColIndices?.[idx]) ? numericColIndices[idx] : null,
          isManualLabel: !!manualLabelFlags[idx]
        }));
        points3d = [];
        eigenSummaryData = [];
        screeData = [];
        statsSummaryLines = [
          `Samples analysed: ${nSamples}`,
          `Perplexity: ${tsneResult.perplexity.toFixed(1)}`,
          `Iterations: ${tsneResult.iterations}`,
          `Final KL divergence: ${tsneResult.klDivergence.toFixed(3)}`
        ];
        lastPcaStats = {
          method: 'tsne',
          perplexity: Number(tsneResult.perplexity),
          iterations: Number(tsneResult.iterations),
          learningRate: Number(tsneResult.learningRate),
          earlyExaggeration: Number(tsneResult.earlyExaggeration),
          klDivergence: Number(tsneResult.klDivergence.toFixed(6)),
          summaryLines: statsSummaryLines.slice()
        };
        console.debug('Debug: tsne embedding complete',{ stats: lastPcaStats, pointCount: points.length });
      } else if (method === 'umap') {
        console.debug('Debug: umap branch entered',{ nSamples });
        if(computeStart === null){
          computeStart = nowMs();
        }
        const umapNeighbors = Math.round(clampNumber(pcaUmapNeighbors?.value ?? DEFAULT_UMAP_SETTINGS.neighbors, 2, Math.max(2, nSamples - 1), DEFAULT_UMAP_SETTINGS.neighbors));
        const umapMinDist = clampNumber(pcaUmapMinDist?.value ?? DEFAULT_UMAP_SETTINGS.minDist, 0, 0.99, DEFAULT_UMAP_SETTINGS.minDist);
        const umapLearningRate = clampNumber(pcaUmapLearningRate?.value ?? DEFAULT_UMAP_SETTINGS.learningRate, 0.01, 10, DEFAULT_UMAP_SETTINGS.learningRate);
        const umapEpochs = Math.round(clampNumber(pcaUmapEpochs?.value ?? DEFAULT_UMAP_SETTINGS.epochs, 50, 5000, DEFAULT_UMAP_SETTINGS.epochs));
        let umapResult = null;
        if(shouldUsePcaEmbedWorker('umap', nSamples, nFeatures)){
          umapResult = await runPcaEmbedWorker('umap', {
            matrix,
            settings: {
              outputDims: 2,
              neighbors: umapNeighbors,
              minDist: umapMinDist,
              learningRate: umapLearningRate,
              epochs: umapEpochs,
              negativeSampleRate: DEFAULT_UMAP_SETTINGS.negativeSampleRate
            }
          });
          if(drawToken !== pcaState.drawToken){
            debugLog('Debug: pca embed worker result ignored', { reason: 'stale-token', drawToken, current: pcaState.drawToken });
            return;
          }
        }
        if(!umapResult){
          umapResult = computeSimpleUmapEmbedding(matrix, {
            outputDims: 2,
            neighbors: umapNeighbors,
            minDist: umapMinDist,
            learningRate: umapLearningRate,
            epochs: umapEpochs,
            negativeSampleRate: DEFAULT_UMAP_SETTINGS.negativeSampleRate,
            SVDLib
          });
        }
        if(computeEnd === null){
          computeEnd = nowMs();
        }
        dimensionMeta = [
          { value: 1, label: 'UMAP 1', variancePercent: Number.NaN },
          { value: 2, label: 'UMAP 2', variancePercent: Number.NaN }
        ];
        updateAxisSelectOptions({ dimensionMeta, viewMode: '2d', method });
        axisIndices = axisSelectionToIndices(dimensionMeta.length);
        pcaXLabelText = dimensionMeta[axisIndices.x]?.label || 'UMAP 1';
        pcaYLabelText = dimensionMeta[axisIndices.y]?.label || 'UMAP 2';
        pcaZLabelText = 'UMAP 3';
        points = umapResult.embedding.map((coords, idx) => ({
          x: coords[axisIndices.x] ?? 0,
          y: coords[axisIndices.y] ?? 0,
          label: labels[idx],
          index: idx,
          columnIndex: Number.isInteger(numericColIndices?.[idx]) ? numericColIndices[idx] : null,
          isManualLabel: !!manualLabelFlags[idx]
        }));
        points3d = [];
        eigenSummaryData = [];
        screeData = [];
        statsSummaryLines = [
          `Samples analysed: ${nSamples}`,
          `Neighbors: ${umapResult.neighbors}`,
          `Epochs: ${umapResult.epochs}`,
          `Min distance: ${umapResult.minDist.toFixed(2)}`
        ];
        lastPcaStats = {
          method: 'umap',
          neighbors: Number(umapResult.neighbors),
          epochs: Number(umapResult.epochs),
          minDist: Number(umapResult.minDist.toFixed(4)),
          learningRate: Number(umapResult.learningRate),
          negativeSampleRate: Number(umapResult.negativeSampleRate),
          summaryLines: statsSummaryLines.slice()
        };
        console.debug('Debug: umap embedding complete',{ stats: lastPcaStats, pointCount: points.length });
      } else {
        // Ensure SVD works even if samples < features
        let useFactor = 'u'; // when SVD is done on X directly, scores = U * S
        const useTransposed = nSamples < nFeatures;
        if (useTransposed) {
          // Use SVD(X^T) so that m >= n for the library
          // For SVD(X^T) = V * S * U^T, the sample scores are V * S
          useFactor = 'v';
          debugLog('Debug: PCA SVD uses transposed matrix to satisfy m>=n', {
            nSamples, nFeatures, svdOn: 'X^T'
          });
        } else {
          debugLog('Debug: PCA SVD uses direct matrix X', { nSamples, nFeatures, svdOn: 'X' });
        }

        let svd = null;
        if(computeStart === null){
          computeStart = nowMs();
        }
        if(shouldUsePcaSvdWorker(nSamples, nFeatures)){
          const workerResult = await runPcaSvdWorker(matrix, nSamples, nFeatures);
          if(drawToken !== pcaState.drawToken){
            debugLog('Debug: pca worker result ignored', { reason: 'stale-token', drawToken, current: pcaState.drawToken });
            return;
          }
          if(workerResult && Array.isArray(workerResult.q) && Array.isArray(workerResult.u) && Array.isArray(workerResult.v)){
            svd = { q: workerResult.q, u: workerResult.u, v: workerResult.v };
            if(typeof workerResult.useFactor === 'string'){
              useFactor = workerResult.useFactor;
            }
            debugLog('Debug: pca worker svd applied', { nSamples, nFeatures });
          }
        }
        if(!svd){
          let matrixForSvd = matrix;
          if(useTransposed){
            matrixForSvd = transposePcaMatrix(matrix);
          }
          svd = SVDLib.SVD(matrixForSvd);
        }
        if(computeEnd === null){
          computeEnd = nowMs();
        }
        console.debug('pca svd result', {
          q: svd?.q,
          u_shape: svd?.u?.length + 'x' + (svd?.u?.[0]?.length || 0),
          v_shape: svd?.v?.length + 'x' + (svd?.v?.[0]?.length || 0)
        });

        // --- Ensure singular values are sorted in descending order ---
        const qRaw = Array.isArray(svd.q) ? svd.q.slice() : [];
        const order = qRaw
          .map((val, idx) => [Number(val) || 0, idx])
          .sort((a, b) => b[0] - a[0])   // descending by singular value
          .map(pair => pair[1]);

        if (order.length && order.some((idx, pos) => idx !== pos)) {
          console.debug('Debug: reordering SVD components by descending singular value', {
            original_q: qRaw,
            sorted_q: order.map(i => qRaw[i]),
            order
          });
        }

        const reorderColumns = (mat, perm) => {
          if (!Array.isArray(mat) || !mat.length) return mat;
          // each row is an array of component coefficients; reorder by column index
          return mat.map(row => perm.map(i => row[i]));
        };

        // Apply reordering consistently to singular values and left/right vectors
        svd.q = order.map(i => qRaw[i]);
        svd.u = reorderColumns(svd.u, order);
        svd.v = reorderColumns(svd.v, order);

        console.debug('pca svd sorted', {
          q_sorted: svd.q,
          u_shape: svd?.u?.length + 'x' + (svd?.u?.[0]?.length || 0),
          v_shape: svd?.v?.length + 'x' + (svd?.v?.[0]?.length || 0)
        });

        // Build sample scores. Basis selection follows existing logic:
        // when we SVD'd X directly use svd.u; when we SVD'd X^T use svd.v (so useFactor stays valid).
        const scores = new Array(nSamples);
        for (let i = 0; i < nSamples; i++) {
          const row = scores[i] = [];
          for (let k = 0; k < svd.q.length; k++) {
            const basis = (useFactor === 'u' ? svd.u : svd.v);
            const coeff = (basis?.[i]?.[k] ?? 0);
            row[k] = coeff * svd.q[k];
          }
        }
        console.debug('pca scores', { n: scores.length, dims: svd.q.length, sample0: scores[0] });

        // Explained variances per component (uses original sample count)
        const variances = svd.q.map((s) => (s * s) / (nSamples - 1));
        const totalVar = variances.reduce((a, b) => a + b, 0);
        const safeTotal = totalVar > 0 ? totalVar : 1;
        let cumulativeRatio = 0;
        eigenSummaryData = variances.map((variance, idx) => {
          const ratio = safeTotal > 0 ? variance / safeTotal : 0;
          cumulativeRatio += ratio;
          const percent = ratio * 100;
          const cumulativePercent = Math.min(100, cumulativeRatio * 100);
          return {
            component: idx + 1,
            eigenvalue: variance,
            varianceRatio: ratio,
            variancePercent: percent,
            cumulativeVarianceRatio: Math.min(1, cumulativeRatio),
            cumulativeVariancePercent: cumulativePercent,
            singularValue: svd.q[idx] || 0
          };
        });
        screeData = eigenSummaryData.map(entry => ({
          component: entry.component,
          variancePercent: entry.variancePercent
        }));
        const firstEigen = eigenSummaryData[0] || null;
        const secondEigen = eigenSummaryData[1] || null;
        const pc1Pct = firstEigen ? firstEigen.variancePercent : 0;
        const pc2Pct = secondEigen ? secondEigen.variancePercent : 0;
        const topTwoCumulative = pc1Pct + pc2Pct;
        componentSelectionSummary = computePcaComponentSelectionSummary(
          eigenSummaryData,
          matrix,
          SVDLib,
          {
            rule: pcaState.componentSelection?.rule,
            eigenThreshold: pcaState.componentSelection?.eigenThreshold,
            parallelIterations: pcaState.componentSelection?.parallelIterations
          }
        );
        parallelAnalysisPercent = Array.isArray(componentSelectionSummary?.parallelAnalysis?.averageEigenvalues)
          ? componentSelectionSummary.parallelAnalysis.averageEigenvalues.map(value => {
              const numeric = Number(value) || 0;
              return safeTotal > 0 ? (numeric / safeTotal) * 100 : 0;
            })
          : [];
        statsSummaryLines = [
          `Samples analysed: ${nSamples}`,
          `Variables analysed: ${nFeatures}`,
          `Top two PCs capture ${topTwoCumulative.toFixed(1)}% of variance`,
          componentSelectionSummary
            ? `${componentSelectionSummary.ruleLabel} retains ${componentSelectionSummary.retainedCount} component${componentSelectionSummary.retainedCount === 1 ? '' : 's'}`
            : null
        ].filter(Boolean);
        dimensionMeta = eigenSummaryData.map(entry => ({
          value: entry.component,
          label: `PC${entry.component}`,
          variancePercent: entry.variancePercent
        }));
        updateAxisSelectOptions({ dimensionMeta, viewMode: requestedViewMode, method });
        axisIndices = axisSelectionToIndices(dimensionMeta.length);
        const xMeta = dimensionMeta[axisIndices.x] || null;
        const yMeta = dimensionMeta[axisIndices.y] || null;
        const zMeta = typeof axisIndices.z === 'number' ? (dimensionMeta[axisIndices.z] || null) : null;
        pcaXLabelText = xMeta ? formatAxisLabel(xMeta) : `PC${axisIndices.x + 1}`;
        pcaYLabelText = yMeta ? formatAxisLabel(yMeta) : `PC${axisIndices.y + 1}`;
        pcaZLabelText = zMeta ? formatAxisLabel(zMeta) : (dimensionMeta.length >= 3 ? `PC${(axisIndices.z ?? 2) + 1}` : 'PC3');

        points = scores.map((s, i) => ({
          x: s[axisIndices.x] ?? 0,
          y: s[axisIndices.y] ?? 0,
          label: labels[i],
          index: i,
          columnIndex: Number.isInteger(numericColIndices?.[i]) ? numericColIndices[i] : null,
          isManualLabel: !!manualLabelFlags[i]
        }));
        if (typeof axisIndices.z === 'number' && dimensionMeta.length >= 3) {
          points3d = scores.map((s, i) => ({
            x: s[axisIndices.x] ?? 0,
            y: s[axisIndices.y] ?? 0,
            z: s[axisIndices.z] ?? 0,
            label: labels[i],
            index: i,
            columnIndex: Number.isInteger(numericColIndices?.[i]) ? numericColIndices[i] : null,
            isManualLabel: !!manualLabelFlags[i]
          }));
          debugLog('Debug: pca 3d scores prepared',{ count: points3d.length, components: svd.q.length, selection: axisIndices });
        } else {
          points3d = [];
          debugLog('Debug: pca 3d scores skipped',{ components: svd.q.length, selection: axisIndices });
        }
        if(svd.v && Array.isArray(svd.v)){
          const componentCount = Array.isArray(svd.v[0]) ? Math.min(svd.v[0].length, svd.q.length) : Math.min(svd.v.length, svd.q.length);
          loadingsComponents = componentCount;
          const safeFeatureLabels = featureLabels.length
            ? featureLabels
            : Array.from({ length: matrix[0]?.length || 0 }, (_, idx) => `Var ${idx + 1}`);
          loadingsTotalCount = safeFeatureLabels.length;
          const loadingsLimit = Math.min(PCA_LOADINGS_ROW_LIMIT, loadingsTotalCount);
          const scoreComponents = Math.min(componentCount, 3);
          const scoredFeatures = [];
          for(let featureIdx = 0; featureIdx < loadingsTotalCount; featureIdx += 1){
            const basis = Array.isArray(svd.v?.[featureIdx]) ? svd.v[featureIdx] : null;
            let score = 0;
            if(basis){
              for(let compIdx = 0; compIdx < scoreComponents; compIdx += 1){
                const raw = basis?.[compIdx] ?? 0;
                const magnitude = Math.abs(raw);
                if(magnitude > score){
                  score = magnitude;
                }
              }
            }
            scoredFeatures.push({ index: featureIdx, score });
          }
          scoredFeatures.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
          const selected = scoredFeatures.slice(0, loadingsLimit);
          loadingsTruncated = loadingsTotalCount > loadingsLimit;
          loadingsRows = selected.map(({ index }) => {
            const label = safeFeatureLabels[index] || `Var ${index + 1}`;
            const values = [];
            for(let compIdx = 0; compIdx < componentCount; compIdx += 1){
              const raw = svd.v?.[index]?.[compIdx] ?? 0;
              values.push(raw);
            }
            return { label, values };
          });
          debugLog('Debug: pca loadings computed',{ featureCount: loadingsRows.length, componentCount, truncated: loadingsTruncated, total: loadingsTotalCount });
        }else{
          debugLog('Debug: pca loadings skipped',{ hasV: !!svd.v });
        }
        const biplotSnapshot = buildPcaBiplotSnapshot(points, loadingsRows, {
          x: pcaXLabelText,
          y: pcaYLabelText
        });
        lastPcaStats = {
          method: 'pca',
          eigenSummary: eigenSummaryData.map(entry => ({
            component: entry.component,
            eigenvalue: Number(entry.eigenvalue),
            varianceRatio: Number(entry.varianceRatio),
            variancePercent: Number(entry.variancePercent),
            cumulativeVarianceRatio: Number(entry.cumulativeVarianceRatio),
            cumulativeVariancePercent: Number(entry.cumulativeVariancePercent),
            singularValue: Number(entry.singularValue)
          })),
          scree: screeData.map(item => ({
            component: item.component,
            variancePercent: Number(item.variancePercent)
          })),
          totalVariance: Number(totalVar),
          summaryLines: statsSummaryLines.slice(),
          selectionSummary: componentSelectionSummary ? cloneSimple(componentSelectionSummary) : null,
          parallelAnalysis: parallelAnalysisPercent.slice(),
          biplot: biplotSnapshot
        };
        debugLog('Debug: pca eigen summary prepared',{
          components: eigenSummaryData.length,
          totalVariance: totalVar,
          screePoints: screeData.length
        });
        cachePayload = {
          method,
          statsSummaryLines,
          screeData,
          componentSelectionSummary,
          parallelAnalysisPercent,
          statsMethod,
          eigenSummaryData,
          dimensionMeta,
          points,
          points3d,
          labels,
          sampleColumnIndices,
          groupedHeaderRow: groupedHeaderRowCache,
          loadingsRows,
          loadingsComponents,
          loadingsTotalCount,
          loadingsTruncated,
          sampleCount: sampleCountSnapshot,
          featureCount: featureCountSnapshot,
          axisIndices,
          pcaXLabelText,
          pcaYLabelText,
          pcaZLabelText,
          biplotSnapshot,
          parseEnd,
          computeStart,
          computeEnd,
          statsSnapshot: lastPcaStats
        };
      }
      }

      if(!cachePayload && !usingCache){
        cachePayload = {
          method,
          statsSummaryLines,
          screeData,
          componentSelectionSummary,
          parallelAnalysisPercent,
          statsMethod,
          eigenSummaryData,
          dimensionMeta,
          points,
          points3d,
          labels,
          sampleColumnIndices,
          groupedHeaderRow: groupedHeaderRowCache,
          loadingsRows,
          loadingsComponents,
          loadingsTotalCount,
          loadingsTruncated,
          sampleCount: sampleCountSnapshot,
          featureCount: featureCountSnapshot,
          axisIndices,
          pcaXLabelText,
          pcaYLabelText,
          pcaZLabelText,
          biplotSnapshot: null,
          parseEnd,
          computeStart,
          computeEnd,
          statsSnapshot: lastPcaStats
        };
      }

      if(usingCache){
        groupMeta = resolvePcaGroupMeta(points.length, labels, {
          columnIndices: sampleColumnIndices,
          groupHeaderRow: groupedHeaderRowCache
        });
      }

      if(usingCache){
        if(parseEnd === null){
          parseEnd = totalStart;
        }
        if(computeStart === null){
          computeStart = totalStart;
        }
        if(computeEnd === null){
          computeEnd = totalStart;
        }
      }

      ensurePcaLabelStyles(labels, groupMeta);

      let effectiveViewMode = requestedViewMode;
      if(effectiveViewMode === '3d' && !points3d.length){
        debugLog('Debug: pca 3d fallback triggered',{ method, pointCount: points3d.length });
        effectiveViewMode = '2d';
      }
      updateLoadingsTable({ rows: loadingsRows, components: loadingsComponents, method, viewMode: effectiveViewMode, totalCount: loadingsTotalCount });

      const axisVarianceInfo = resolveAxisVarianceInfo(axisIndices, dimensionMeta);

      const legendEntries = [];
      if(showLegend){
        if(groupMeta && Array.isArray(groupMeta.entries)){
          groupMeta.entries.forEach(entry => {
            legendEntries.push({
              key: entry.key,
              label: entry.label,
              color: entry.color,
              shape: entry.shape,
              groupIndex: entry.index
            });
          });
        } else {
          const seenLabels = new Set();
          labels.forEach((lab, labelIndex) => {
            if(!lab || seenLabels.has(lab)){ return; }
            seenLabels.add(lab);
            const shape = pcaLabelShapes[lab] || 'circle';
            legendEntries.push({
              key: `label-${lab}`,
              label: lab,
              color: pcaLabelColors[lab] || DEFAULT_SCATTER_COLORS[legendEntries.length % DEFAULT_SCATTER_COLORS.length],
              shape,
              labelValue: lab,
              labelIndex,
              groupIndex: null
            });
          });
        }
      }
      const legendMeasureEntries = legendEntries.map(entry => ({
        label: entry.label,
        fill: entry.color,
        key: entry.key,
        editable: true
      }));
      const legendLayout = chartStyle.computeLegendLayout({
        entries: legendMeasureEntries,
        fontSize: fs,
        strokeWidth: borderWidthPx,
        textColor: pcaThemeTextColor
      });
      const legendRenderer = legendLayout.renderer || { entries: [], rowGap: 0, swatchSize: 0, swatchGap: 0, baselineOffset: 0 };
      const legendVisible = showLegend && legendRenderer.entries.length > 0;
      const legendWidth = legendVisible ? legendLayout.legendWidthForMargin : 0;
      const legendAxisGap = Math.max(fs * 0.9, 18);
      const appliedLegendAxisGap = legendVisible ? legendAxisGap : 0;
      const effectiveLegendWidth = legendWidth + appliedLegendAxisGap;
      debugLog('Debug: pca legend layout metrics',{
        legendWidth,
        legendGap: legendLayout.legendGapPx,
        legendCount: legendRenderer.entries.length,
        legendAxisGap,
        appliedLegendAxisGap,
        legendVisible,
        effectiveLegendWidth
      });

      const plotEl = document.getElementById('pcaPlot');
      plotEl.style.display = 'block';
      const existingSvg = plotEl.querySelector('#pcaSvg');
      const reuse3dSvg = effectiveViewMode === '3d' && existingSvg && existingSvg.dataset.viewMode === '3d';
      while (plotEl.firstChild) {
        plotEl.removeChild(plotEl.firstChild);
      }

      const eigenSummaryForStats = (method === 'pca' || method === 'mds') ? eigenSummaryData : [];
      const allowEigenExport = eigenSummaryForStats.length > 0;
      renderStatsPanel({
        summaryLines: statsSummaryLines,
        showScree: method === 'pca',
        screeData,
        method: statsMethod || method,
        showEigenTable: method === 'pca' || method === 'mds',
        eigenSummary: eigenSummaryForStats,
        enableEigenExport: allowEigenExport,
        varianceSummary: method === 'pca' ? eigenSummaryForStats : [],
        pointColor: fill,
        selectionSummary: method === 'pca' ? componentSelectionSummary : null,
        parallelAnalysis: method === 'pca' ? parallelAnalysisPercent : [],
        loadingsRows,
        biplot: method === 'pca' ? buildPcaBiplotSnapshot(points, loadingsRows, { x: pcaXLabelText, y: pcaYLabelText }) : null
      });

      if (effectiveViewMode === '3d') {
        if (!points3d.length) {
          debugLog('Debug: pca 3d render skipped',{ reason: 'no-points' });
          return;
        }
        const targetAspect = Number.isFinite(PCA_3D_DEFAULTS.aspectRatio) && PCA_3D_DEFAULTS.aspectRatio > 0 ? PCA_3D_DEFAULTS.aspectRatio : (4 / 3);
        const fallbackWidth = 480;
        const fallbackHeight = Math.round(fallbackWidth / targetAspect);
        const bounds = typeof plotEl.getBoundingClientRect === 'function' ? plotEl.getBoundingClientRect() : { width: 0, height: 0 };
        const availableWidth = Math.floor(bounds.width || plotEl.clientWidth || 0);
        const availableHeight = Math.floor(bounds.height || plotEl.clientHeight || 0);
        let W3 = availableWidth > 0 ? availableWidth : fallbackWidth;
        let H3 = Math.round(W3 / targetAspect);
        if(availableHeight > 0 && H3 > availableHeight){
          H3 = Math.max(1, availableHeight);
          W3 = Math.max(1, Math.round(H3 * targetAspect));
          if(availableWidth > 0 && W3 > availableWidth){
            W3 = Math.max(1, availableWidth);
            H3 = Math.max(1, Math.round(W3 / targetAspect));
          }
        }
        if(W3 <= 0 || H3 <= 0){
          W3 = fallbackWidth;
          H3 = fallbackHeight;
        }
        plotEl.style.position = 'relative';
        plotEl.style.minWidth = '';
        plotEl.style.minHeight = '';
        plotEl.style.aspectRatio = `${W3} / ${H3}`;
        plotEl.style.padding = plotEl.style.padding || '12px';
        debugLog('Debug: pca 3d dimensions resolved',{ availableWidth, availableHeight, width: W3, height: H3 }); // Debug: 3d plot sizing diagnostics
        const svg3 = reuse3dSvg && existingSvg ? existingSvg : document.createElementNS(NS, 'svg');
        if(!reuse3dSvg || !existingSvg){
          svg3.setAttribute('id', 'pcaSvg');
        }
        svg3.addEventListener('mouseleave', handlePcaPlotMouseLeave);
        plotEl.appendChild(svg3);
        svg3.setAttribute('width', String(W3));
        svg3.setAttribute('height', String(H3));
        svg3.setAttribute('viewBox', `0 0 ${W3} ${H3}`);
        svg3.setAttribute('font-family', chartStyle.FONT_FAMILY);
        svg3.dataset.viewMode = '3d';
        chartStyle.applySvgDefaults(svg3);
        while (svg3.firstChild) {
          svg3.removeChild(svg3.firstChild);
        }
        svg3.style.backgroundColor = pcaThemeDark
          ? normalizePcaThemeColor(pcaState.theme?.backgroundColor, '#000000')
          : '';
        appendPca3dBackground(svg3, W3, H3);
        plot3d.attachRotationControls(svg3, {
          state: pcaState.rotation,
          onChange: () => scheduleRotationRedraw(),
          shouldIgnorePointer: (event) => {
            if(typeof plot3d.isInteractivePointerTarget === 'function'){
              return plot3d.isInteractivePointerTarget(event?.target);
            }
            return plot3d.isLegendPointerTarget(event?.target);
          },
          debugLabel: 'pca-3d'
        });
        if(fontControls && typeof fontControls.enableForSvg === 'function'){
          fontControls.enableForSvg(svg3,{ scopeId: 'pca' });
          debugLog('Debug: pca fontControls enableForSvg invoked',{ width: W3, height: H3, mode: '3d' });
        } else {
          debugLog('Debug: pca fontControls enableForSvg missing',{ hasFontControls: !!fontControls, mode: '3d' });
        }
        const baseLegendMargin = Math.max(fs * 2.25, 28);
        const legendMargin = legendVisible ? legendWidth + appliedLegendAxisGap + baseLegendMargin : baseLegendMargin;
        const margin3 = {
          top: Math.max(fs * 3.2, 36),
          right: legendMargin,
          bottom: Math.max(fs * 3.2, 40),
          left: Math.max(fs * 3.2, 40)
        };
        const legendShiftX = typeof plot3d.resolveLegendShiftX === 'function'
          ? plot3d.resolveLegendShiftX({ legendVisible, margin: margin3, fontSize: fs, legendWidth })
          : 0;
        const plotW3 = Math.max(20, W3 - margin3.left - margin3.right);
        const plotH3 = Math.max(20, H3 - margin3.top - margin3.bottom);
        const rotatePoint = (pt) => plot3d.rotatePoint(pt, pcaState.rotation);
        let renderPoints3d = points3d;
        const rangeForAxis = (axisKey) => {
          const values = points3d.map(pt => pt[axisKey]);
          let min = Math.min(...values);
          let max = Math.max(...values);
          if(!Number.isFinite(min) || !Number.isFinite(max)){
            min = -1;
            max = 1;
          }
          if(min === max){
            const pad = Math.abs(min) || 1;
            min -= pad;
            max += pad;
          }
          if(min > 0){ min = 0; }
          if(max < 0){ max = 0; }
          return { min, max };
        };
        const axisRanges = {
          x: rangeForAxis('x'),
          y: rangeForAxis('y'),
          z: rangeForAxis('z')
        };
        const axisCenters = {
          x: (axisRanges.x.min + axisRanges.x.max) / 2,
          y: (axisRanges.y.min + axisRanges.y.max) / 2,
          z: (axisRanges.z.min + axisRanges.z.max) / 2
        };
        const originalSpans3d = {
          x: axisRanges.x.max - axisRanges.x.min,
          y: axisRanges.y.max - axisRanges.y.min,
          z: axisRanges.z.max - axisRanges.z.min
        };
        const axisCentersOriginal = { ...axisCenters };
        const axisScaleFactors = { x: 1, y: 1, z: 1 };
        const clampTicks = (ticks, range) => ticks.filter(t => t >= range.min - 1e-9 && t <= range.max + 1e-9);
        const axisScalesOriginal3d = {
          x: niceScale(axisRanges.x.min, axisRanges.x.max, 5),
          y: niceScale(axisRanges.y.min, axisRanges.y.max, 5),
          z: niceScale(axisRanges.z.min, axisRanges.z.max, 5)
        };
        const axisTicksOriginal3d = {
          x: clampTicks(axisScalesOriginal3d.x.ticks, axisRanges.x),
          y: clampTicks(axisScalesOriginal3d.y.ticks, axisRanges.y),
          z: clampTicks(axisScalesOriginal3d.z.ticks, axisRanges.z)
        };
        const variance3dActive = pcaState.axesVarianceScaled && axisVarianceInfo && axisVarianceInfo.normalized.x != null && axisVarianceInfo.normalized.y != null && axisVarianceInfo.normalized.z != null;
        const equalScale3d = !!pcaState.equalScaleAxes;
        const equalLength3d = !!pcaState.equalAxes;
        let renderAxisRanges3d = {
          x: { ...axisRanges.x },
          y: { ...axisRanges.y },
          z: { ...axisRanges.z }
        };
        let axisTickFormatters3d = null;
        let axisTicks3d = null;
        if(variance3dActive){
          const baseSpan = Math.max(originalSpans3d.x, originalSpans3d.y, originalSpans3d.z, 1);
          Object.keys(renderAxisRanges3d).forEach(axisKey => {
            const normalizedWeight = axisVarianceInfo.normalized[axisKey];
            if(normalizedWeight == null){
              return;
            }
            const desiredSpan = baseSpan * Math.max(normalizedWeight, MIN_VARIANCE_WEIGHT);
            const safeOriginalSpan = Math.max(Math.abs(originalSpans3d[axisKey]) || 0, MIN_VARIANCE_WEIGHT);
            axisScaleFactors[axisKey] = desiredSpan / safeOriginalSpan;
            const half = desiredSpan / 2;
            renderAxisRanges3d[axisKey] = {
              min: axisCentersOriginal[axisKey] - half,
              max: axisCentersOriginal[axisKey] + half
            };
          });
          renderPoints3d = points3d.map(pt => ({
            x: axisCentersOriginal.x + (pt.x - axisCentersOriginal.x) * axisScaleFactors.x,
            y: axisCentersOriginal.y + (pt.y - axisCentersOriginal.y) * axisScaleFactors.y,
            z: axisCentersOriginal.z + (pt.z - axisCentersOriginal.z) * axisScaleFactors.z,
            label: pt.label,
            index: pt.index
          }));
          debugLog('Debug: pca variance axis spans applied (3d)', {
            normalized: axisVarianceInfo.normalized,
            baseSpan,
            axisRanges: renderAxisRanges3d,
            scaleFactors: axisScaleFactors
          });
          debugLog('Debug: pca variance point scaling applied (3d)', {
            scaleFactors: axisScaleFactors,
            centers: axisCentersOriginal
          });
        } else if(equalScale3d){
          const maxSpan = Math.max(originalSpans3d.x, originalSpans3d.y, originalSpans3d.z, 1);
          const halfSpan = maxSpan / 2;
          Object.keys(renderAxisRanges3d).forEach(axisKey => {
            renderAxisRanges3d[axisKey] = {
              min: axisCentersOriginal[axisKey] - halfSpan,
              max: axisCentersOriginal[axisKey] + halfSpan
            };
          });
          debugLog('Debug: pca equal scale spans applied (3d)', {
            maxSpan,
            axisRanges: renderAxisRanges3d
          });
        } else if(equalLength3d){
          const maxSpan = Math.max(originalSpans3d.x, originalSpans3d.y, originalSpans3d.z, 1);
          const scaleFactors = {
            x: originalSpans3d.x > 0 ? (maxSpan / originalSpans3d.x) : 1,
            y: originalSpans3d.y > 0 ? (maxSpan / originalSpans3d.y) : 1,
            z: originalSpans3d.z > 0 ? (maxSpan / originalSpans3d.z) : 1
          };
          const scaleValue = (axisKey, value) => axisCentersOriginal[axisKey] + (value - axisCentersOriginal[axisKey]) * scaleFactors[axisKey];
          const unscaleValue = (axisKey, value) => axisCentersOriginal[axisKey] + (value - axisCentersOriginal[axisKey]) / (scaleFactors[axisKey] || 1);
          renderAxisRanges3d = {
            x: { min: scaleValue('x', axisRanges.x.min), max: scaleValue('x', axisRanges.x.max) },
            y: { min: scaleValue('y', axisRanges.y.min), max: scaleValue('y', axisRanges.y.max) },
            z: { min: scaleValue('z', axisRanges.z.min), max: scaleValue('z', axisRanges.z.max) }
          };
          axisTicks3d = {
            x: axisTicksOriginal3d.x.map(value => scaleValue('x', value)),
            y: axisTicksOriginal3d.y.map(value => scaleValue('y', value)),
            z: axisTicksOriginal3d.z.map(value => scaleValue('z', value))
          };
          const formatTick = (axisKey, scaledValue) => {
            const originalValue = unscaleValue(axisKey, scaledValue);
            if(typeof chartStyle.formatAxisValue === 'function'){
              return chartStyle.formatAxisValue(originalValue, { maxDecimals: 2 });
            }
            if(typeof chartStyle.formatScientific === 'function'){
              return chartStyle.formatScientific(originalValue, { maxDecimals: 2 });
            }
            if(!Number.isFinite(originalValue)){
              return '';
            }
            return String(originalValue);
          };
          axisTickFormatters3d = {
            x: value => formatTick('x', value),
            y: value => formatTick('y', value),
            z: value => formatTick('z', value)
          };
          renderPoints3d = points3d.map(pt => ({
            x: scaleValue('x', pt.x),
            y: scaleValue('y', pt.y),
            z: scaleValue('z', pt.z),
            label: pt.label,
            index: pt.index
          }));
          debugLog('Debug: pca equal length spans applied (3d)', {
            maxSpan,
            axisRanges,
            renderAxisRanges: renderAxisRanges3d,
            scaleFactors
          });
        } else {
          debugLog('Debug: pca axes length spans skipped (3d)', {
            reason: variance3dActive ? 'partial-weights' : 'disabled',
            normalized: axisVarianceInfo?.normalized
          });
        }
        if(!axisTicks3d){
          const axisScales = {
            x: niceScale(renderAxisRanges3d.x.min, renderAxisRanges3d.x.max, 5),
            y: niceScale(renderAxisRanges3d.y.min, renderAxisRanges3d.y.max, 5),
            z: niceScale(renderAxisRanges3d.z.min, renderAxisRanges3d.z.max, 5)
          };
          axisTicks3d = {
            x: clampTicks(axisScales.x.ticks, renderAxisRanges3d.x),
            y: clampTicks(axisScales.y.ticks, renderAxisRanges3d.y),
            z: clampTicks(axisScales.z.ticks, renderAxisRanges3d.z)
          };
        }
        Object.keys(renderAxisRanges3d).forEach(axisKey => {
          axisCenters[axisKey] = (renderAxisRanges3d[axisKey].min + renderAxisRanges3d[axisKey].max) / 2;
        });
        const allCorners = [
          { x: renderAxisRanges3d.x.min, y: renderAxisRanges3d.y.min, z: renderAxisRanges3d.z.min },
          { x: renderAxisRanges3d.x.max, y: renderAxisRanges3d.y.min, z: renderAxisRanges3d.z.min },
          { x: renderAxisRanges3d.x.min, y: renderAxisRanges3d.y.max, z: renderAxisRanges3d.z.min },
          { x: renderAxisRanges3d.x.max, y: renderAxisRanges3d.y.max, z: renderAxisRanges3d.z.min },
          { x: renderAxisRanges3d.x.min, y: renderAxisRanges3d.y.min, z: renderAxisRanges3d.z.max },
          { x: renderAxisRanges3d.x.max, y: renderAxisRanges3d.y.min, z: renderAxisRanges3d.z.max },
          { x: renderAxisRanges3d.x.min, y: renderAxisRanges3d.y.max, z: renderAxisRanges3d.z.max },
          { x: renderAxisRanges3d.x.max, y: renderAxisRanges3d.y.max, z: renderAxisRanges3d.z.max }
        ];
        const add3 = (tag, attrs, text, target) => {
          const el = document.createElementNS(NS, tag);
          Object.keys(attrs || {}).forEach(key => el.setAttribute(key, String(attrs[key])));
          if(text){
            el.textContent = text;
          }
          (target || svg3).appendChild(el);
          return el;
        };
        const rotatedCorners = allCorners.map(corner => rotatePoint(corner));
        const rotatedPoints = renderPoints3d.map(pt => rotatePoint(pt));
        const projector = plot3d.createProjector({
          rotatedPoints,
          rotatedCorners,
          width: W3,
          height: H3,
          margin: margin3,
          shiftX: legendShiftX
        });
        const project3 = (pt) => projector.project(pt);
        const labelBounds3d = computePcaLabelBounds3d(rotatedCorners, project3);
        if(labelBounds3d){
          debugLog('Debug: pca 3d label bounds resolved', {
            minX: labelBounds3d.minX,
            maxX: labelBounds3d.maxX,
            minY: labelBounds3d.minY,
            maxY: labelBounds3d.maxY
          });
        }
        const labelHull3d = Shared.labelLayout && typeof Shared.labelLayout.computeConvexHull2d === 'function'
          ? Shared.labelLayout.computeConvexHull2d(rotatedCorners.map(corner => project3(corner)))
          : null;
        if(labelHull3d && labelHull3d.length >= 3){
          debugLog('Debug: pca 3d label hull resolved', { points: labelHull3d.length });
        }
        const axisTicks = axisTicks3d;
        const frontFrameLayer = document.createElementNS(NS, 'g');
        frontFrameLayer.setAttribute('data-layer', 'frame-front');
        svg3.appendChild(frontFrameLayer);
        plot3d.renderAxesAndGrid({
          svg: svg3,
          project: (pt) => project3(pt),
          rotatePoint,
          axisRanges: renderAxisRanges3d,
          axisTicks,
          axisLabels: { x: pcaXLabelText, y: pcaYLabelText, z: pcaZLabelText },
          fontSize: fs,
          axisStrokeWidth,
          chartStyle,
          showGrid,
          showFrame,
          axisTickFormatters: axisTickFormatters3d || undefined,
          showPanes: showFrame,
          paneFill: pcaThemeDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.03)',
          paneOpacityRange: pcaThemeDark ? { min: 0.10, max: 0.22 } : { min: 0.01, max: 0.05 },
          gridColor: gridStrokeStyle.color,
          gridDash: gridDash || undefined,
          gridOpacity,
          gridStrokeWidth: gridStrokeStyle.thickness,
          gridOutlineColors: { primary: gridStrokeStyle.color, secondary: gridStrokeStyle.color },
          frameColor: axisStroke,
          axisColor: axisStroke,
          tickTextColor: pcaThemeTextColor,
          axisLabelColor: pcaThemeTextColor,
          frontFrameTarget: frontFrameLayer,
          debugLabel: 'pca-3d',
          onAxisLabel: (el, axisKey, labelText) => { markFontEditable(el, 'axis3d', labelText); },
          createElement: (tag, attrs, text, target) => add3(tag, attrs, text, target)
        });
        const axisLabelBounds = [];
        let contentRightBound = margin3.left + plotW3;
        if(typeof svg3.querySelectorAll === 'function'){
          const axisLabelNodes = svg3.querySelectorAll('[data-axis-label]');
          for(let idx = 0; idx < axisLabelNodes.length; idx += 1){
            const node = axisLabelNodes[idx];
            if(!node || typeof node.getBBox !== 'function'){ continue; }
            try {
              const bbox = node.getBBox();
              const bboxValid = Number.isFinite(bbox?.x) && Number.isFinite(bbox?.width)
                && Number.isFinite(bbox?.y) && Number.isFinite(bbox?.height);
              if(!bboxValid){ continue; }
              axisLabelBounds.push({
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height
              });
              const right = bbox.x + bbox.width;
              if(Number.isFinite(right)){
                contentRightBound = Math.max(contentRightBound, right);
              }
            } catch(err){
              debugLog('Debug: pca axis label bbox error',{ message: err && err.message });
            }
          }
        }
        const defaultTitleY3 = Math.max(fs, margin3.top * 0.5);
        const defaultTitleX3 = margin3.left + plotW3 / 2;
        const titlePos = pcaState.labelPositions?.title;
        const hasTitlePos = !!titlePos;
        
        // Convert relative positions to absolute if needed for 3D title
        let absoluteTitleX3 = defaultTitleX3;
        let absoluteTitleY3 = defaultTitleY3;
        if (titlePos) {
          if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
            // Use relative positioning
            absoluteTitleX3 = margin3.left + titlePos.relX * plotW3;
            absoluteTitleY3 = margin3.top + titlePos.relY * plotH3;
          } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
            // Use absolute positioning (backward compatibility)
            absoluteTitleX3 = titlePos.x;
            absoluteTitleY3 = titlePos.y;
          }
        }
        
        const title3d = add3('text', {
          x: absoluteTitleX3,
          y: absoluteTitleY3,
          'text-anchor': 'middle',
          'font-size': fs,
          fill: pcaThemeTextColor,
        }, pcaTitleText);
        markFontEditable(title3d, 'graphTitle', 'graphTitle');
        makeEditableHelper(title3d, text => commitTitleChange(text, '3d-title'));
        plot3d.applyLegendPointerGuards(title3d, { label: 'pca-title-3d' });
        if(typeof title3d.setAttribute === 'function'){
          title3d.setAttribute('data-graph-title', '1');
        }
        if(typeof Shared.enableLabelDrag === 'function'){
          Shared.enableLabelDrag(title3d, svg3, {
            onDragEnd: pos => {
              // Store both absolute and relative positions for 3D title
              const relX = (pos.x - margin3.left) / plotW3;
              const relY = (pos.y - margin3.top) / plotH3;
              pcaState.labelPositions.title = { 
                x: pos.x, 
                y: pos.y,
                relX: relX, 
                relY: relY 
              };
              if(Shared.isDebugEnabled?.()){
                console.debug('Debug: pca 3d title position saved', { absolute: pos, relative: { relX, relY } });
              }
            }
          });
        }
        if(!hasTitlePos && typeof title3d.getBBox === 'function' && axisLabelBounds.length){
          try {
            const titlePadding = Math.max(fs * 0.45, 10);
            const minAxisTop = axisLabelBounds.reduce((min, bounds) => (
              Number.isFinite(bounds?.y) ? Math.min(min, bounds.y) : min
            ), Number.POSITIVE_INFINITY);
            if(Number.isFinite(minAxisTop)){
              const baseY = Number(title3d.getAttribute('y')) || defaultTitleY3;
              let titleBox = title3d.getBBox();
              const desiredBottom = minAxisTop - titlePadding;
              if(Number.isFinite(desiredBottom)){
                const currentBottom = titleBox.y + titleBox.height;
                if(currentBottom > desiredBottom){
                  const shift = desiredBottom - currentBottom;
                  const minTitleY = Math.max(fs * 0.5, 0);
                  const nextY = Math.max(minTitleY, baseY + shift);
                  title3d.setAttribute('y', nextY);
                  titleBox = title3d.getBBox();
                  const adjustedBottom = titleBox.y + titleBox.height;
                  if(adjustedBottom > desiredBottom){
                    const correction = desiredBottom - adjustedBottom;
                    const correctedY = Math.max(minTitleY, nextY + correction);
                    if(correctedY !== nextY){
                      title3d.setAttribute('y', correctedY);
                      titleBox = title3d.getBBox();
                    }
                  }
                  debugLog('Debug: pca title vertical adjusted', {
                    mode: '3d',
                    previousY: baseY,
                    adjustedY: Number(title3d.getAttribute('y')) || baseY,
                    desiredBottom,
                    titlePadding,
                    minAxisTop
                  });
                }
              }
            }
          } catch(err){
            debugLog('Debug: pca title bbox adjust error', {
              mode: '3d',
              message: err?.message || String(err)
            });
          }
        }
        debugLog('Debug: pca title rendered', { mode: '3d', text: pcaTitleText });
        debugLog('Debug: pca 3d axis ranges',{ axisRanges: renderAxisRanges3d, ticks: axisTicks });
        const projectedPoints = rotatedPoints.map((rot, idx) => {
          const base = project3(rot);
          return {
            x: base.x,
            y: base.y,
            depth: base.depth,
            label: renderPoints3d[idx].label,
            index: renderPoints3d[idx].index,
            original: points3d[idx]
          };
        }).sort((a,b)=>a.depth-b.depth);
        const labelLayout = Shared.labelLayout;
        const manualLabelEntries3d = [];
        const pointBounds3d = [];
        let maxPointRight = contentRightBound;
        projectedPoints.forEach(pt => {
          const assignment = (groupMeta && Number.isInteger(pt.index)) ? groupMeta.assignments[pt.index] : null;
          const style = (groupMeta && Number.isInteger(assignment)) ? groupMeta.styleByIndex?.[assignment] : null;
          const labelPointStyle = pt.label ? (pcaLabelPointStyles[pt.label] || null) : null;
          const color = style?.color || (pt.label ? (pcaLabelColors[pt.label] || DEFAULT_SCATTER_COLORS[0]) : fill);
          const labelShape = pt.label ? pcaLabelShapes[pt.label] : null;
          const shape = style?.shape || labelShape || 'circle';
          const original = pt.original || {};
          const markerRadiusBase = Number.isFinite(Number(labelPointStyle?.size)) ? Number(labelPointStyle.size) : Number(pcaDotSize.value);
          const markerRadius = chartStyle.scaleStrokeWidth(markerRadiusBase, styleScaleInfo, { context: 'pca-dot-size-label', min: 0.5 });
          const pointTransparency = Number.isFinite(Number(labelPointStyle?.alpha)) ? Number(labelPointStyle.alpha) : alpha;
          const pointOpacity = Math.min(Math.max(1 - pointTransparency, 0), 1);
          const pointBorderWidthBase = Number.isFinite(Number(labelPointStyle?.borderWidth))
            ? Number(labelPointStyle.borderWidth)
            : (Number.isFinite(Number(labelPointStyle?.strokeWidth)) ? Number(labelPointStyle.strokeWidth) : borderWidthRaw);
          const pointBorderWidthPx = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, { context: 'pca-border-label', min: 0 });
          const pointBorderColor = (typeof labelPointStyle?.borderColor === 'string' && labelPointStyle.borderColor)
            ? labelPointStyle.borderColor
            : ((typeof labelPointStyle?.stroke === 'string' && labelPointStyle.stroke) ? labelPointStyle.stroke : borderColor);
          const pointStroke = pointOpacity > 0 && pointBorderWidthPx > 0 ? pointBorderColor : 'none';
          pointBounds3d.push({ cx: pt.x, cy: pt.y, r: markerRadius });
          const manualLabelText = pt.label ? String(pt.label).trim() : '';
          if(original.isManualLabel && manualLabelText){
            manualLabelEntries3d.push({
              text: manualLabelText,
              cx: pt.x,
              cy: pt.y,
              radius: markerRadius
            });
          }
          const pointNode = drawShape(add3, shape, {
            cx: pt.x,
            cy: pt.y,
            radius: markerRadius,
            fill: color,
            stroke: pointStroke,
            strokeWidth: pointBorderWidthPx,
            opacity: pointOpacity
          });
          if(pointNode){
            pointNode.dataset.plotPoint = '1';
            const groupLabel3d = Number.isInteger(assignment)
              ? (style?.label || groupMeta?.entries?.[assignment]?.label || '')
              : (style?.label || '');
            attachPcaPointTooltip(pointNode, {
              label: pt.label || '',
              groupName: groupLabel3d,
              x: original.x,
              y: original.y,
              z: original.z,
              xLabel: pcaXLabelText,
              yLabel: pcaYLabelText,
              zLabel: pcaZLabelText,
              depth: pt.depth,
              index: pt.index,
              columnIndex: Number.isInteger(original.columnIndex) ? original.columnIndex : null
            });
          }
          const approxRight = pt.x + markerRadius + borderWidthPx;
          if(Number.isFinite(approxRight)){
            maxPointRight = Math.max(maxPointRight, approxRight);
          }
        });
        if(manualLabelEntries3d.length && labelLayout?.computePointLabelLayout && labelLayout?.computePointLabelFontSize){
          const labelLayer = document.createElementNS(NS,'g');
          labelLayer.setAttribute('data-layer','point-labels');
          labelLayer.setAttribute('pointer-events','none');
          const baseManualLabelSize = fs * 0.6;
          const labelWidth = labelBounds3d ? Math.max(1, labelBounds3d.maxX - labelBounds3d.minX) : plotW3;
          const labelHeight = labelBounds3d ? Math.max(1, labelBounds3d.maxY - labelBounds3d.minY) : plotH3;
          const tickFontSizeCap = labelLayout?.readFontSizeFromNodes
            ? (labelLayout.readFontSizeFromNodes(svg3.querySelectorAll('[data-axis-tick-label]'))
              || Math.max(9, Math.round(fs * 0.85)))
            : Math.max(9, Math.round(fs * 0.85));
          const labelFontSizeRaw = labelLayout.computePointLabelFontSize(baseManualLabelSize, manualLabelEntries3d.length, labelWidth, labelHeight);
          const labelFontSize = Math.min(labelFontSizeRaw, tickFontSizeCap);
          const labelScale = Math.min(1, labelFontSize / Math.max(1, baseManualLabelSize));
          const leaderStrokeWidth = chartStyle.scaleStrokeWidth(0.75 * labelScale, styleScaleInfo, { context: 'pca-point-label-3d', min: 0.25 });
          const labelColor = pcaThemeTextColor;
          const plotLeft = labelBounds3d ? labelBounds3d.minX : margin3.left;
          const plotRight = labelBounds3d ? labelBounds3d.maxX : margin3.left + plotW3;
          const plotTop = labelBounds3d ? labelBounds3d.minY : margin3.top;
          const plotBottom = labelBounds3d ? labelBounds3d.maxY : margin3.top + plotH3;
          const font = typeof chartStyle?.makeFont === 'function'
            ? chartStyle.makeFont(labelFontSize)
            : null;
          const manualLabelLayout = labelLayout.computePointLabelLayout(manualLabelEntries3d, {
            plotLeft,
            plotRight,
            plotTop,
            plotBottom,
            plotHull: labelHull3d,
            enforceHull: true,
            hullPenalty: 18,
            labelFontSize,
            leaderGap: Math.max(2, Math.round(labelFontSize * 0.2)),
            leaderScale: labelScale,
            pointBounds: pointBounds3d,
            measureText: chartStyle?.measureText,
            font,
            angleSteps: 16,
            maxLeaderScale: 3
          });
          manualLabelLayout.forEach(result => {
            const entry = result.entry;
            const placement = result.placement;
            const cx = Number(entry?.cx) || 0;
            const cy = Number(entry?.cy) || 0;
            const textValue = entry?.text ? String(entry.text) : '';
            if(!textValue || !placement){
              return;
            }
            const textX = placement.textX;
            const textY = placement.textY;
            const anchor = placement.anchor;
            const lineX2 = placement.lineX2;
            const leader = document.createElementNS(NS,'line');
            leader.setAttribute('x1', String(cx));
            leader.setAttribute('y1', String(cy));
            leader.setAttribute('x2', String(lineX2));
            leader.setAttribute('y2', String(textY));
            leader.setAttribute('stroke', labelColor);
            leader.setAttribute('stroke-width', String(leaderStrokeWidth));
            leader.setAttribute('stroke-linecap', 'round');
            labelLayer.appendChild(leader);
            const textNode = document.createElementNS(NS,'text');
            textNode.setAttribute('x', String(textX));
            textNode.setAttribute('y', String(textY));
            textNode.setAttribute('font-size', String(labelFontSize));
            textNode.setAttribute('fill', labelColor);
            textNode.setAttribute('text-anchor', anchor);
            textNode.setAttribute('dominant-baseline', 'middle');
            textNode.textContent = textValue;
            labelLayer.appendChild(textNode);
          });
          svg3.appendChild(labelLayer);
          debugLog('Debug: pca manual labels rendered', { count: manualLabelEntries3d.length, mode: '3d' });
        }else if(manualLabelEntries3d.length){
          debugLog('Debug: pca manual labels skipped', { count: manualLabelEntries3d.length, mode: '3d', reason: 'missing-layout-helper' });
        }
        svg3.appendChild(frontFrameLayer);
        contentRightBound = Math.max(contentRightBound, maxPointRight);
        if(legendVisible){
          const horizontalBase = margin3.left + plotW3 + legendLayout.legendGapPx + appliedLegendAxisGap;
          const legendSpacing3 = Math.max(legendRenderer.rowGap || 0, Math.round(fs*0.35));
          const legendMarkerSize3 = legendRenderer.swatchSize || Math.max(Math.round(fs*0.6), 10);
          const legendTextOffset3 = legendMarkerSize3 + (legendRenderer.swatchGap || Math.max(Math.round(fs*0.2), 6));
          const legendHeight = legendEntries.length
            ? legendEntries.length * legendMarkerSize3 + (legendEntries.length - 1) * legendSpacing3
            : 0;
          const horizontalPadding = Math.max(fs * 0.6, 12) + appliedLegendAxisGap;
          let legendX3 = Math.max(horizontalBase, contentRightBound + horizontalPadding);
          const safeRightPad = Math.max(fs * 0.6, 12);
          const maxLegendX = W3 - safeRightPad - legendWidth;
          if(maxLegendX < horizontalBase){
            debugLog('Debug: pca legend width constraint',{ mode: '3d', horizontalBase, maxLegendX, safeRightPad });
          }
          if(legendX3 > maxLegendX){
            const previousX = legendX3;
            legendX3 = Math.max(horizontalBase, maxLegendX);
            debugLog('Debug: pca legend horizontal clamped',{ mode: '3d', previousX, legendX3, maxLegendX });
          }
          const baseLegendY = margin3.top;
          const legendBottomLimit = Math.max(baseLegendY, H3 - margin3.bottom - legendHeight);
          const verticalPadding = Math.max(fs * 0.45, 8);
          let legendStartY = baseLegendY;
          const storedLegendPos = pcaState.labelPositions?.legend;
          if(storedLegendPos) {
            if (storedLegendPos.relX !== undefined && storedLegendPos.relY !== undefined) {
              // Use relative positioning for 3D legend
              legendX3 = horizontalBase + storedLegendPos.relX * legendGapFor3d;
              legendStartY = baseLegendY + storedLegendPos.relY * plotH3;
            } else if (Number.isFinite(storedLegendPos.x) && Number.isFinite(storedLegendPos.y)) {
              // Use absolute positioning (backward compatibility)
              legendX3 = storedLegendPos.x;
              legendStartY = storedLegendPos.y;
            }
          }
          if(!storedLegendPos || (storedLegendPos.relX === undefined && storedLegendPos.relY === undefined && (isNaN(storedLegendPos?.x) || isNaN(storedLegendPos?.y)))){
            const candidates = [baseLegendY];
            if(axisLabelBounds.length){
              for(let idx = 0; idx < axisLabelBounds.length; idx += 1){
                const bounds = axisLabelBounds[idx];
                const below = bounds.y + bounds.height + verticalPadding;
                const above = bounds.y - legendHeight - verticalPadding;
                if(below <= legendBottomLimit){
                  candidates.push(below);
                }
                if(above >= baseLegendY){
                  candidates.push(above);
                }
              }
            }
            if(legendBottomLimit !== baseLegendY){
              candidates.push(legendBottomLimit);
            }
            const candidatePositions = [];
            for(let idx = 0; idx < candidates.length; idx += 1){
              const candidate = candidates[idx];
              const clamped = Math.min(Math.max(candidate, baseLegendY), legendBottomLimit);
              if(!candidatePositions.some(existing => Math.abs(existing - clamped) < 0.5)){
                candidatePositions.push(clamped);
              }
            }
            candidatePositions.sort((a, b) => Math.abs(a - baseLegendY) - Math.abs(b - baseLegendY));
            const intersectsAxis = (rect) => {
              for(let idx = 0; idx < axisLabelBounds.length; idx += 1){
                const bounds = axisLabelBounds[idx];
                const horizontalOverlap = rect.x < bounds.x + bounds.width + horizontalPadding
                  && rect.x + rect.width > bounds.x - horizontalPadding;
                const verticalOverlap = rect.y < bounds.y + bounds.height + verticalPadding
                  && rect.y + rect.height > bounds.y - verticalPadding;
                if(horizontalOverlap && verticalOverlap){
                  return true;
                }
              }
              return false;
            };
            for(let idx = 0; idx < candidatePositions.length; idx += 1){
              const candidateY = candidatePositions[idx];
              const legendRect = { x: legendX3, y: candidateY, width: legendWidth, height: legendHeight };
              if(!intersectsAxis(legendRect)){
                legendStartY = candidateY;
                break;
              }
            }
          }
          debugLog('Debug: pca legend placement resolved',{
            mode: '3d',
            legendX: legendX3,
            legendY: legendStartY,
            legendHeight,
            axisLabels: axisLabelBounds.length
          });
          const legendGroup = add3('g', {
            'data-role': 'pca-legend',
            transform: `translate(${legendX3},${legendStartY})`
          });
          if(legendGroup){
            plot3d.applyLegendPointerGuards(legendGroup, { label: 'pca-legend-3d' });
          }
          const legendAdd = (tag, attrs, text) => add3(tag, attrs, text, legendGroup);
          legendEntries.forEach((entry, i) => {
            const itemY = i * (legendMarkerSize3 + legendSpacing3);
            const swatch3 = drawShape(legendAdd, entry.shape || 'circle', {
              cx: legendMarkerSize3 / 2,
              cy: itemY + legendMarkerSize3 / 2,
              radius: legendMarkerSize3 / 2,
              fill: entry.color,
              stroke: borderColor,
              strokeWidth: 0,
              opacity: 1
            });
            if(swatch3){
              swatch3.style.cursor = 'pointer';
              swatch3.dataset.legendKey = entry.key;
              if(Number.isInteger(entry.groupIndex)){
                swatch3.dataset.legendGroupIndex = String(entry.groupIndex);
              } else if(entry.labelValue){
                swatch3.dataset.legendLabel = entry.labelValue;
              }
              plot3d.applyLegendPointerGuards(swatch3, { label: entry.label });
              swatch3.addEventListener('click',(evt)=>{
                if(evt){ evt.stopPropagation(); }
                handleLegendColorChange(entry, swatch3);
              });
            }
            const legendText = legendAdd('text', {
              x: legendTextOffset3,
              y: itemY + legendMarkerSize3 / 2,
              'font-size': fs,
              'dominant-baseline': 'middle',
              fill: pcaThemeTextColor,
            }, entry.label);
            markFontEditable(legendText,'legend',`legend-${i}`);
          });
          if(legendGroup && typeof Shared.enableLegendDrag === 'function'){
            Shared.enableLegendDrag(legendGroup, svg3, {
              undoLabel: 'pca-legend-3d',
              onDragEnd: pos => {
                // Store both absolute and relative positions for 3D legend
                const relX = (pos.x - horizontalBase) / legendGapFor3d;
                const relY = (pos.y - baseLegendY) / plotH3;
                pcaState.labelPositions.legend = { 
                  x: pos.x, 
                  y: pos.y,
                  relX: relX, 
                  relY: relY 
                };
                if(Shared.isDebugEnabled?.()){
                  console.debug('Debug: pca 3d legend position saved', { absolute: pos, relative: { relX, relY } });
                }
              }
            });
          }
        } else {
          debugLog('Debug: pca legend skipped',{ mode: '3d', legendVisible, entryCount: legendEntries.length });
        }
        debugLog('Debug: pca 3d render complete',{ pointCount: projectedPoints.length, axisRanges: renderAxisRanges3d });
        registerPcaGridControlTarget(svg3, { fallbackThickness: axisStrokeWidthBase });
        ensureGraphViewport(svg3, { padding: Math.max(fs, 18), debugLabel: 'pca-3d-graph' });
        pcaLayout?.syncPanels?.({ skipSchedule: true });
        syncPcaAutoDrawNoticeWidth('draw');
        return;
      }

      if (!points.length) {
        debugLog('Debug: pca 2d render skipped',{ reason: 'no-points' });
        return;
      }

      let xMinRaw = Infinity;
      let xMaxRaw = -Infinity;
      let yMinRaw = Infinity;
      let yMaxRaw = -Infinity;

      points.forEach((p) => {
        if (p.x < xMinRaw) xMinRaw = p.x;
        if (p.x > xMaxRaw) xMaxRaw = p.x;
        if (p.y < yMinRaw) yMinRaw = p.y;
        if (p.y > yMaxRaw) yMaxRaw = p.y;
      });

      let xMin = xMinRaw;
      let xMax = xMaxRaw;
      let yMin = yMinRaw;
      let yMax = yMaxRaw;

      if (xMin === xMax) xMax = xMin + 1;
      if (yMin === yMax) yMax = yMin + 1;

      const shouldEqualScale = !!pcaState.equalScaleAxes;
      if(shouldEqualScale){
        const spanX = Number.isFinite(xMax) && Number.isFinite(xMin) ? (xMax - xMin) : NaN;
        const spanY = Number.isFinite(yMax) && Number.isFinite(yMin) ? (yMax - yMin) : NaN;
        if(Number.isFinite(spanX) && Number.isFinite(spanY) && spanX > 0 && spanY > 0){
          const maxSpan = Math.max(spanX, spanY);
          const centerX = (xMax + xMin) / 2;
          const centerY = (yMax + yMin) / 2;
          xMin = centerX - maxSpan / 2;
          xMax = centerX + maxSpan / 2;
          yMin = centerY - maxSpan / 2;
          yMax = centerY + maxSpan / 2;
          debugLog('Debug: pca equal scale ranges applied',{ spanX, spanY, maxSpan, xMin, xMax, yMin, yMax });
        }else{
          debugLog('Debug: pca equal scale ranges skipped',{ spanX, spanY });
        }
      }

      debugLog('Debug: pca axis range resolved',{ xMin, xMax, yMin, yMax, equalScaleEnabled: shouldEqualScale });

      const W = Math.max(50, Math.floor(plotEl.clientWidth || 50));
      const H = Math.max(40, Math.floor(plotEl.clientHeight || 40));

      plotEl.style.position = 'relative';
      const layeredRoot = document.createElement('div');
      layeredRoot.className = 'pca-layered-plot';
      layeredRoot.style.position = 'relative';
      layeredRoot.style.width = `${W}px`;
      layeredRoot.style.height = `${H}px`;
      layeredRoot.style.flex = '0 0 auto';
      plotEl.appendChild(layeredRoot);

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'pcaSvg');
      svg.setAttribute('width', String(W));
      svg.setAttribute('height', String(H));
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
      svg.dataset.viewMode = effectiveViewMode;
      chartStyle.applySvgDefaults(svg);
      svg.addEventListener('mouseleave', handlePcaPlotMouseLeave);
      const shouldUseCanvasPoints = points.length >= PCA_FAST_POINT_THRESHOLD;
      let fastPointCanvas = null;
      let fastPointCtx = null;
      if(shouldUseCanvasPoints){
        fastPointCanvas = document.createElement('canvas');
        fastPointCanvas.className = 'pca-fast-points-layer';
        fastPointCanvas.width = W;
        fastPointCanvas.height = H;
        fastPointCanvas.style.position = 'absolute';
        fastPointCanvas.style.left = '0';
        fastPointCanvas.style.top = '0';
        fastPointCanvas.style.width = `${W}px`;
        fastPointCanvas.style.height = `${H}px`;
        fastPointCanvas.style.pointerEvents = 'none';
        layeredRoot.appendChild(fastPointCanvas);
        fastPointCtx = typeof fastPointCanvas.getContext === 'function'
          ? fastPointCanvas.getContext('2d')
          : null;
        if(!fastPointCtx){
          fastPointCtx = createNoopCanvasContext();
        }
        if(fastPointCtx){
          if(typeof fastPointCtx.clearRect === 'function'){
            fastPointCtx.clearRect(0, 0, W, H);
          }
          try {
            fastPointCtx.imageSmoothingEnabled = false;
          } catch(err){ /* ignore */ }
          fastPointModeActive = true;
        }
      }
      layeredRoot.appendChild(svg);
      if(fontControls && typeof fontControls.enableForSvg === 'function'){
        fontControls.enableForSvg(svg,{ scopeId: 'pca' });
        debugLog('Debug: pca fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
      } else {
        debugLog('Debug: pca fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
      }

      function niceNum(range, round) {
        const exp = Math.floor(Math.log10(range));
        const f = range / Math.pow(10, exp);
        let nf;
        if (round) {
          if (f < 1.5) nf = 1;
          else if (f < 3) nf = 2;
          else if (f < 7) nf = 5;
          else nf = 10;
        } else {
          if (f <= 1) nf = 1;
          else if (f <= 2) nf = 2;
          else if (f <= 5) nf = 5;
          else nf = 10;
        }
        return nf * Math.pow(10, exp);
      }

      function niceScale(min, max, maxTicks) {
        const range = niceNum(max - min, false);
        const step = niceNum(range / (Math.max(maxTicks - 1, 1)), true);
        const graphMin = Math.floor(min / step) * step;
        const graphMax = Math.ceil(max / step) * step;
        const ticks = [];
        for (let v = graphMin; v <= graphMax + 1e-9; v += step) {
          ticks.push(v);
        }
        return {min: graphMin, max: graphMax, ticks, step};
      }

      let xTickTarget = chartStyle.estimateTickCount(W, { axis: 'x', fallback: 6 });
      let yTickTarget = chartStyle.estimateTickCount(H, { axis: 'y', fallback: 6 });
      debugLog('Debug: pca initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
      const formatTick = value => chartStyle.formatScientific(value,{maxDecimals:2});
      const pcaFontStyles = exportFontStyles('pca');
      const xTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
        ? chartStyle.resolveScopedLabelMeasureFont({ styles: pcaFontStyles, role: 'xTick', fallbackPx: fs }).fontSpec
        : chartStyle.makeFont(fs);
      const yTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
        ? chartStyle.resolveScopedLabelMeasureFont({ styles: pcaFontStyles, role: 'yTick', fallbackPx: fs }).fontSpec
        : chartStyle.makeFont(fs);
      const tickFont = yTickMeasureFont;
      const axisLabelFont = chartStyle.makeFont(fs);
      const yTitleWidthBase = chartStyle.measureText(pcaYLabelText, axisLabelFont);
      const tickLen = axisMetrics.tickLength;
      const tickGap = axisMetrics.tickLabelGap;
      let margin = chartStyle.computeBaseMargins({fontSize: fs, legendWidth: effectiveLegendWidth, maxYLabelWidth: 0, yTitleWidth: yTitleWidthBase, axisMetrics});
      margin.left = Math.max(margin.left, fs * 0.5);
      let plotW = Math.max(20, W - margin.left - margin.right);
      let plotH = Math.max(20, H - margin.top - margin.bottom);
      let bottomLayout = chartStyle.computeBottomLayout({labels: [], fontSize: fs, labelMeasureFont: xTickMeasureFont, plotWidth: plotW, baseBottom: margin.bottom, axisMetrics});
      margin.bottom = bottomLayout.bottom;
      plotW = Math.max(20, W - margin.left - margin.right);
      plotH = Math.max(20, H - margin.top - margin.bottom);
      const manualIntervalX = getAxisTickInterval('x');
      const manualIntervalY = getAxisTickInterval('y');
      let xScale = niceScale(xMin, xMax, xTickTarget);
      let yScale = niceScale(yMin, yMax, yTickTarget);
      let xTickLabels = xScale.ticks.map(t => formatTick(t));
      let yTickLabels = yScale.ticks.map(t => formatTick(t));
      let maxYLabelWidth = 0;
      let maxXLabelWidth = 0;
      for(let pass=0;pass<2;pass++){
        xScale = niceScale(xMin, xMax, xTickTarget);
        yScale = niceScale(yMin, yMax, yTickTarget);
        if(Number.isFinite(manualIntervalX) && manualIntervalX > 0){
          const manualX = buildManualTicks(xScale.min, xScale.max, manualIntervalX);
          if(manualX){
            xScale.min = manualX.min;
            xScale.max = manualX.max;
            xScale.ticks = manualX.ticks;
            xScale.step = manualIntervalX;
          }
        }
        if(Number.isFinite(manualIntervalY) && manualIntervalY > 0){
          const manualY = buildManualTicks(yScale.min, yScale.max, manualIntervalY);
          if(manualY){
            yScale.min = manualY.min;
            yScale.max = manualY.max;
            yScale.ticks = manualY.ticks;
            yScale.step = manualIntervalY;
          }
        }
        xTickLabels = xScale.ticks.map(t => formatTick(t));
        yTickLabels = yScale.ticks.map(t => formatTick(t));
        const yLabelWidths = yTickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
        maxYLabelWidth = Math.max(...yLabelWidths, 0);
        const xLabelWidths = xTickLabels.map(lbl => chartStyle.measureText(lbl, xTickMeasureFont));
        maxXLabelWidth = Math.max(...xLabelWidths, 0);
        margin = chartStyle.computeBaseMargins({fontSize: fs, legendWidth: effectiveLegendWidth, maxYLabelWidth, yTitleWidth: yTitleWidthBase, axisMetrics});
        margin.left = Math.max(margin.left, maxYLabelWidth + tickLen + tickGap + fs * 0.5);
        plotW = Math.max(20, W - margin.left - margin.right);
        plotH = Math.max(20, H - margin.top - margin.bottom);
        bottomLayout = chartStyle.computeBottomLayout({labels: xTickLabels, fontSize: fs, labelMeasureFont: xTickMeasureFont, plotWidth: plotW, baseBottom: margin.bottom, axisMetrics});
        margin.bottom = bottomLayout.bottom;
        plotW = Math.max(20, W - margin.left - margin.right);
        plotH = Math.max(20, H - margin.top - margin.bottom);
        const refinedX = manualIntervalX ? xTickTarget : chartStyle.estimateTickCount(plotW, { axis: 'x', fallback: xTickTarget });
        const refinedY = manualIntervalY ? yTickTarget : chartStyle.estimateTickCount(plotH, { axis: 'y', fallback: yTickTarget });
        debugLog('Debug: pca tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxXLabelWidth,maxYLabelWidth, manualIntervalX, manualIntervalY});
        const xStable = manualIntervalX || refinedX === xTickTarget;
        const yStable = manualIntervalY || refinedY === yTickTarget;
        if(xStable && yStable){
          break;
        }
        if(!manualIntervalX){
          xTickTarget = refinedX;
        }
        if(!manualIntervalY){
          yTickTarget = refinedY;
        }
      }
      debugLog('Debug: pca tick targets finalized',{xTickTarget,yTickTarget,maxXLabelWidth,maxYLabelWidth, manualIntervalX, manualIntervalY});
      const enforcePlotAspect = (marginInput, totalWidth, totalHeight, aspectValue) => {
        const aspect = Number.isFinite(aspectValue) && aspectValue > 0 ? aspectValue : null;
        const baseMargin = { ...marginInput };
        const innerW = Math.max(20, totalWidth - baseMargin.left - baseMargin.right);
        const innerH = Math.max(20, totalHeight - baseMargin.top - baseMargin.bottom);
        if(!aspect){
          return { margin: baseMargin, plotW: innerW, plotH: innerH };
        }
        const squareSize = Math.min(innerW, innerH);
        let targetW = squareSize;
        let targetH = squareSize;
        if(aspect >= 1){
          targetW = squareSize;
          targetH = squareSize / aspect;
        }else{
          targetH = squareSize;
          targetW = squareSize * aspect;
        }
        if(!Number.isFinite(targetW) || targetW <= 0 || !Number.isFinite(targetH) || targetH <= 0){
          return { margin: baseMargin, plotW: innerW, plotH: innerH };
        }
        const adjusted = { ...baseMargin };
        if(innerW > targetW){
          adjusted.right += innerW - targetW;
        }
        if(innerH > targetH){
          adjusted.bottom += innerH - targetH;
        }
        return {
          margin: adjusted,
          plotW: Math.max(20, targetW),
          plotH: Math.max(20, targetH)
        };
      };
      const aspectData = pcaSvgBox?.dataset;
      const shouldLockAspect = aspectData?.resizerAspectLocked === 'true';
      const shouldEqualAxes = !!pcaState.equalAxes;
      debugLog('Debug: pca aspect ratio decision',{
        shouldEqualAxes,
        shouldEqualScale,
        varianceAxesEnabled: !!pcaState.axesVarianceScaled,
        lockRatioEnabled: shouldLockAspect,
        storedRatio: aspectData?.resizerAspectRatio
      }); // Debug: pca aspect toggle decision
      let varianceAspectApplied = false;
      if(pcaState.axesVarianceScaled){
        const weightX = axisVarianceInfo?.weights?.x;
        const weightY = axisVarianceInfo?.weights?.y;
        if(Number.isFinite(weightX) && weightX > 0 && Number.isFinite(weightY) && weightY > 0){
          const desiredAspect = weightX / weightY;
          const baseInnerW = Math.max(20, W - margin.left - margin.right);
          const baseInnerH = Math.max(20, H - margin.top - margin.bottom);
          const baseSquareSize = Math.min(baseInnerW, baseInnerH);
          const enforced = enforcePlotAspect(margin, W, H, desiredAspect);
          margin = enforced.margin;
          plotW = enforced.plotW;
          plotH = enforced.plotH;
          varianceAspectApplied = true;
          debugLog('Debug: pca layout (variance-enforced)',{
            desiredAspect,
            appliedAspect: plotH > 0 ? plotW / plotH : null,
            squareSize: baseSquareSize,
            margin,
            plotW,
            plotH,
            weights: axisVarianceInfo.weights
          });
        } else {
          debugLog('Debug: pca variance aspect skipped',{ reason: 'insufficient-weights', weights: axisVarianceInfo?.weights });
        }
      }
      if(!varianceAspectApplied){
        if(shouldEqualAxes || shouldEqualScale){
          const square = chartStyle.ensureSquarePlot(W, H, margin);
          margin = square.margin;
          plotW = square.plotW;
          plotH = square.plotH;
          debugLog('Debug: pca layout (equal-length)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: pca square enforcement branch
        }else{
          debugLog('Debug: pca layout (unlocked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: pca free resize branch
        }
      }
      const x2px = value => margin.left + ((value - xScale.min) * plotW) / (xScale.max - xScale.min);
      const y2px = value => margin.top + plotH - ((value - yScale.min) * plotH) / (yScale.max - yScale.min);

      const add = (tag, attrs, text) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) {
          el.setAttribute(k, String(attrs[k]));
        }
        if (text) {
          el.textContent = text;
        }
        svg.appendChild(el);
        return el;
      };


      if (showGrid) {
        xScale.ticks.forEach((t) => {
          const x = x2px(t);
          const gridLine = add('line', Object.assign({x1: x, y1: margin.top, x2: x, y2: margin.top + plotH}, gridStrokeAttrs));
          gridLine.setAttribute('data-grid-control', '1');
        });
        yScale.ticks.forEach((t) => {
          const y = y2px(t);
          const gridLine = add('line', Object.assign({x1: margin.left, y1: y, x2: margin.left + plotW, y2: y}, gridStrokeAttrs));
          gridLine.setAttribute('data-grid-control', '1');
        });
        debugLog('Debug: pca grid stroke scaled',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length,gridStrokeStyle});
      }

      const xTickPositions = xScale.ticks.map(t => x2px(t));
      const yTickPositions = yScale.ticks.map(t => y2px(t));
      let axisXStart = xTickPositions.length ? Math.min(...xTickPositions) : margin.left;
      let axisXEnd = xTickPositions.length ? Math.max(...xTickPositions) : margin.left + plotW;
      let axisYStart = yTickPositions.length ? Math.min(...yTickPositions) : margin.top;
      let axisYEnd = yTickPositions.length ? Math.max(...yTickPositions) : margin.top + plotH;
      if(axisXStart === axisXEnd){ axisXStart = margin.left; axisXEnd = margin.left + plotW; }
      if(axisYStart === axisYEnd){ axisYStart = margin.top; axisYEnd = margin.top + plotH; }
      debugLog('Debug: pca axis span', { axisXStart, axisXEnd, axisYStart, axisYEnd });
      const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
      const minorSubdivisionsX = getAxisMinorTickSubdivisions('x');
      const minorSubdivisionsY = getAxisMinorTickSubdivisions('y');
      const minorTicksX = getAxisMinorTicksEnabled('x')
        ? chartStyle.computeMinorTickPositions({
            majorTicks: xScale.ticks,
            min: Number.isFinite(xScale.min) ? xScale.min : xMin,
            max: Number.isFinite(xScale.max) ? xScale.max : xMax,
            scale: 'linear',
            subdivisions: minorSubdivisionsX
          })
        : [];
      const minorTicksY = getAxisMinorTicksEnabled('y')
        ? chartStyle.computeMinorTickPositions({
            majorTicks: yScale.ticks,
            min: Number.isFinite(yScale.min) ? yScale.min : yMin,
            max: Number.isFinite(yScale.max) ? yScale.max : yMax,
            scale: 'linear',
            subdivisions: minorSubdivisionsY
          })
        : [];
      const axisControlConfig = axis => ({
        axis,
        scopeId: 'pca',
        getTickInterval: () => getAxisTickInterval(axis),
        getThickness: () => getAxisStrokeWidthBase(),
        getColor: () => getAxisColor(),
        isTickIntervalEnabled: () => true,
        getTickIntervalDisabledMessage: () => 'Tick interval available for numeric axes.',
        tickPlaceholder: 'Auto',
        onTickIntervalChange: value => updateAxisTickInterval(axis, value),
        getMinorTicksEnabled: () => getAxisMinorTicksEnabled(axis),
        onMinorTicksChange: value => updateAxisMinorTicks(axis, value),
        isMinorTicksSupported: () => true,
        getMinorTickSubdivisions: () => getAxisMinorTickSubdivisions(axis),
        onMinorTickSubdivisionsChange: value => updateAxisMinorTickSubdivisions(axis, value),
        onThicknessChange: value => updateAxisStrokeWidth(value),
        onColorChange: value => updateAxisColor(value)
      });
      const xAxisLine = add('line', {x1: axisXStart, y1: margin.top + plotH, x2: axisXEnd, y2: margin.top + plotH, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth});
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
      }
      const yAxisLine = add('line', {x1: margin.left, y1: axisYStart, x2: margin.left, y2: axisYEnd, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth});
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
      }
      debugLog('Debug: pca axes stroke scaled',{axisStrokeWidthBase, axisStrokeWidth, axisStroke});
      if(showFrame){
        debugLog('Debug: pca frame request',{stroke:axisStroke, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
        chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'] });
      }
      // Frame closes PCA plot area using axis styling continuity

      const xTickNodes = [];
      let xTickFontCount = 0;
      if(minorTicksX.length){
        minorTicksX.forEach(value => {
          const x = x2px(value);
          add('line',{
            x1: x,
            y1: margin.top + plotH,
            x2: x,
            y2: margin.top + plotH + minorTickStyle.length,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity
          });
        });
      }
      xScale.ticks.forEach((t, i) => {
        const x = x2px(t);
        add('line', {x1: x, y1: margin.top + plotH, x2: x, y2: margin.top + plotH + tickLen, stroke: axisStroke, 'stroke-width': axisStrokeWidth});
        const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
        const txt = add('text', {
          x,
          y: margin.top + plotH + tickLen + tickGap + extra,
          'font-size': fs,
          'text-anchor': 'middle',
          fill: chartStyle.TEXT_COLOR,
        }, formatTick(t));
        Shared.applyTextBaseline && Shared.applyTextBaseline(txt, 'hanging', fs);
        markFontEditable(txt,'xTick');
        xTickFontCount += 1;
        xTickNodes.push(txt);
      });
      chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});

      const yTickNodes = [];
      let yTickFontCount = 0;
      if(minorTicksY.length){
        minorTicksY.forEach(value => {
          const y = y2px(value);
          add('line',{
            x1: margin.left - minorTickStyle.length,
            y1: y,
            x2: margin.left,
            y2: y,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity
          });
        });
      }
      yScale.ticks.forEach((t, i) => {
        const y = y2px(t);
        add('line', {x1: margin.left - tickLen, y1: y, x2: margin.left, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth});
        const txt = add('text', {
          x: margin.left - (tickLen + tickGap),
          y,
          'font-size': fs,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          fill: chartStyle.TEXT_COLOR,
        }, formatTick(t));
        markFontEditable(txt,'yTick');
        yTickFontCount += 1;
        yTickNodes.push(txt);
      });
      debugLog('Debug: pca ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
      debugLog('Debug: pca font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts

      const defaultXLabelX = margin.left + plotW / 2;
      const defaultXLabelY = margin.top + plotH + bottomLayout.titleOffset;
      const xLabelPos = pcaState.labelPositions?.xLabel;
      const hasCustomXLabelPos = !!(
        xLabelPos
        && (
          (xLabelPos.relX !== undefined && xLabelPos.relY !== undefined)
          || (xLabelPos.x !== undefined && xLabelPos.y !== undefined)
        )
      );
      
      // Convert relative positions to absolute if needed for xLabel
      let absoluteXLabelX = defaultXLabelX;
      let absoluteXLabelY = defaultXLabelY;
      if (xLabelPos) {
        if (xLabelPos.relX !== undefined && xLabelPos.relY !== undefined) {
          // Use relative positioning
          absoluteXLabelX = margin.left + xLabelPos.relX * plotW;
          absoluteXLabelY = margin.top + plotH + xLabelPos.relY * bottomLayout.titleOffset;
        } else if (xLabelPos.x !== undefined && xLabelPos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteXLabelX = xLabelPos.x;
          absoluteXLabelY = xLabelPos.y;
        }
      }
      
      const xAxisText = add('text', {
        x: absoluteXLabelX,
        y: absoluteXLabelY,
        'font-size': fs,
        'text-anchor': 'middle',
        fill: chartStyle.TEXT_COLOR,
      }, pcaXLabelText);
      markFontEditable(xAxisText,'xTitle','xTitle');
      // Enable drag for x-axis label
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(xAxisText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for xLabel
            const relX = (pos.x - margin.left) / plotW;
            const relY = (pos.y - (margin.top + plotH)) / bottomLayout.titleOffset;
            pcaState.labelPositions.xLabel = { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            };
            debugLog('pca x-label position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }

      if(xTickNodes.length && !hasCustomXLabelPos){
        const svgRect = typeof svg?.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : null;
        const measureBottom = (node) => {
          if(!node){ return null; }
          if(svgRect && typeof node.getBoundingClientRect === 'function'){
            const rect = node.getBoundingClientRect();
            if(rect && Number.isFinite(rect.bottom)){
              return rect.bottom - (svgRect?.top || 0);
            }
          }
          if(typeof node.getBBox === 'function'){
            const box = node.getBBox();
            return box.y + box.height;
          }
          return null;
        };
        const measureTop = (node) => {
          if(!node){ return null; }
          if(svgRect && typeof node.getBoundingClientRect === 'function'){
            const rect = node.getBoundingClientRect();
            if(rect && Number.isFinite(rect.top)){
              return rect.top - (svgRect?.top || 0);
            }
          }
          if(typeof node.getBBox === 'function'){
            const box = node.getBBox();
            return box.y;
          }
          return null;
        };
        let maxTickBottom = -Infinity;
        xTickNodes.forEach(node => {
          const bottom = measureBottom(node);
          if(Number.isFinite(bottom) && bottom > maxTickBottom){
            maxTickBottom = bottom;
          }
        });
        const titleTop = measureTop(xAxisText);
        const desiredGap = axisMetrics?.axisTitleGap ?? Math.max(4, Math.round(fs * 0.75));
        const requiredTop = Number.isFinite(maxTickBottom) ? maxTickBottom + desiredGap : null;
        if(Number.isFinite(requiredTop) && Number.isFinite(titleTop) && requiredTop > titleTop){
          const currentY = Number(xAxisText.getAttribute('y')) || (margin.top + plotH + bottomLayout.titleOffset);
          const shift = requiredTop - titleTop;
          xAxisText.setAttribute('y', currentY + shift);
          debugLog('Debug: pca x-axis title shifted to avoid tick overlap', { shift, maxTickBottom, titleTop });
        }
      }else if(xTickNodes.length && hasCustomXLabelPos){
        debugLog('Debug: pca x-axis title overlap auto-shift skipped (custom position retained)');
      }

      const yLabelOffsetSpan = (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
      const defaultYLabelX = margin.left - yLabelOffsetSpan;
      const defaultYLabelY = margin.top + plotH / 2;
      const yLabelPos = pcaState.labelPositions?.yLabel;
      
      // Convert relative positions to absolute if needed for yLabel
      let absoluteYTextX = defaultYLabelX;
      let absoluteYTextY = defaultYLabelY;
      if (yLabelPos) {
        if (yLabelPos.relX !== undefined && yLabelPos.relY !== undefined) {
          // Use relative positioning
          absoluteYTextX = margin.left + yLabelPos.relX * yLabelOffsetSpan;
          absoluteYTextY = margin.top + yLabelPos.relY * plotH;
        } else if (yLabelPos.x !== undefined && yLabelPos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteYTextX = yLabelPos.x;
          absoluteYTextY = yLabelPos.y;
        }
      }
      
      const yAxisText = add('text', {
        x: absoluteYTextX,
        y: absoluteYTextY,
        'font-size': fs,
        'text-anchor': 'middle',
        transform: `rotate(-90 ${absoluteYTextX} ${absoluteYTextY})`,
        fill: chartStyle.TEXT_COLOR,
      }, pcaYLabelText);
      markFontEditable(yAxisText,'yTitle','yTitle');
      // Enable drag for y-axis label
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(yAxisText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for yLabel
            const relX = (pos.x - margin.left) / yLabelOffsetSpan;
            const relY = (pos.y - margin.top) / plotH;
            pcaState.labelPositions.yLabel = { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            };
            debugLog('pca y-label position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }

      const defaultTitleX = margin.left + plotW / 2;
      const defaultTitleY = Math.max(fs, margin.top * 0.5);
      const titlePos = pcaState.labelPositions?.title;
      
      // Convert relative positions to absolute if needed
      let absoluteTitleX = defaultTitleX;
      let absoluteTitleY = defaultTitleY;
      if (titlePos) {
        if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
          // Use relative positioning
          absoluteTitleX = margin.left + titlePos.relX * plotW;
          absoluteTitleY = margin.top + titlePos.relY * plotH;
        } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteTitleX = titlePos.x;
          absoluteTitleY = titlePos.y;
        }
      }
      
      const titleText = add('text', {
        x: absoluteTitleX,
        y: absoluteTitleY,
        'font-size': fs,
        'text-anchor': 'middle',
        fill: chartStyle.TEXT_COLOR,
      }, pcaTitleText);
      markFontEditable(titleText,'graphTitle','graphTitle');
      makeEditableHelper(titleText, text => commitTitleChange(text, '2d-title'));
      // Enable drag for title
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(titleText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions
            const relX = (pos.x - margin.left) / plotW;
            const relY = (pos.y - margin.top) / plotH;
            pcaState.labelPositions.title = { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            };
            debugLog('pca title position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }
      debugLog('Debug: pca title rendered', { mode: '2d', text: pcaTitleText });

      if(fastPointModeActive && fastPointCtx){
        points.forEach((pt) => {
          const cx = x2px(pt.x);
          const cy = y2px(pt.y);
          const assignment = (groupMeta && Number.isInteger(pt.index)) ? groupMeta.assignments[pt.index] : null;
          const style = (groupMeta && Number.isInteger(assignment)) ? groupMeta.styleByIndex?.[assignment] : null;
          const labelPointStyle = pt.label ? (pcaLabelPointStyles[pt.label] || null) : null;
          const color = style?.color || (pt.label ? (pcaLabelColors[pt.label] || DEFAULT_SCATTER_COLORS[0]) : fill);
          const labelShape = pt.label ? pcaLabelShapes[pt.label] : null;
          const shape = style?.shape || labelShape || 'circle';
          const pointRadiusBase = Number.isFinite(Number(labelPointStyle?.size)) ? Number(labelPointStyle.size) : Number(pcaDotSize.value);
          const pointRadiusPx = chartStyle.scaleStrokeWidth(pointRadiusBase, styleScaleInfo, { context: 'pca-dot-size-label', min: 0.5 });
          const pointTransparency = Number.isFinite(Number(labelPointStyle?.alpha)) ? Number(labelPointStyle.alpha) : alpha;
          const pointOpacityLocal = Math.min(Math.max(1 - pointTransparency, 0), 1);
          const pointBorderWidthBase = Number.isFinite(Number(labelPointStyle?.borderWidth))
            ? Number(labelPointStyle.borderWidth)
            : (Number.isFinite(Number(labelPointStyle?.strokeWidth)) ? Number(labelPointStyle.strokeWidth) : borderWidthRaw);
          const pointBorderWidthPx = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, { context: 'pca-border-label', min: 0 });
          const pointBorderColor = (typeof labelPointStyle?.borderColor === 'string' && labelPointStyle.borderColor)
            ? labelPointStyle.borderColor
            : ((typeof labelPointStyle?.stroke === 'string' && labelPointStyle.stroke) ? labelPointStyle.stroke : borderColor);
          const pointStroke = pointOpacityLocal > 0 && pointBorderWidthPx > 0 ? pointBorderColor : 'none';
          drawShapeOnCanvas(fastPointCtx, shape, {
            cx,
            cy,
            radius: pointRadiusPx,
            fill: color,
            stroke: pointStroke,
            strokeWidth: pointBorderWidthPx,
            opacity: pointOpacityLocal,
          });
        });
      } else {
        points.forEach((pt) => {
          const cx = x2px(pt.x);
          const cy = y2px(pt.y);
          const assignment = (groupMeta && Number.isInteger(pt.index)) ? groupMeta.assignments[pt.index] : null;
          const style = (groupMeta && Number.isInteger(assignment)) ? groupMeta.styleByIndex?.[assignment] : null;
          const labelPointStyle = pt.label ? (pcaLabelPointStyles[pt.label] || null) : null;
          const color = style?.color || (pt.label ? (pcaLabelColors[pt.label] || DEFAULT_SCATTER_COLORS[0]) : fill);
          const labelShape = pt.label ? pcaLabelShapes[pt.label] : null;
          const shape = style?.shape || labelShape || 'circle';
          const pointRadiusBase = Number.isFinite(Number(labelPointStyle?.size)) ? Number(labelPointStyle.size) : Number(pcaDotSize.value);
          const pointRadiusPx = chartStyle.scaleStrokeWidth(pointRadiusBase, styleScaleInfo, { context: 'pca-dot-size-label', min: 0.5 });
          const pointTransparency = Number.isFinite(Number(labelPointStyle?.alpha)) ? Number(labelPointStyle.alpha) : alpha;
          const pointOpacityLocal = Math.min(Math.max(1 - pointTransparency, 0), 1);
          const pointBorderWidthBase = Number.isFinite(Number(labelPointStyle?.borderWidth))
            ? Number(labelPointStyle.borderWidth)
            : (Number.isFinite(Number(labelPointStyle?.strokeWidth)) ? Number(labelPointStyle.strokeWidth) : borderWidthRaw);
          const pointBorderWidthPx = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, { context: 'pca-border-label', min: 0 });
          const pointBorderColor = (typeof labelPointStyle?.borderColor === 'string' && labelPointStyle.borderColor)
            ? labelPointStyle.borderColor
            : ((typeof labelPointStyle?.stroke === 'string' && labelPointStyle.stroke) ? labelPointStyle.stroke : borderColor);
          const pointStroke = pointOpacityLocal > 0 && pointBorderWidthPx > 0 ? pointBorderColor : 'none';
          const pointNode = drawShape(add, shape, {
            cx,
            cy,
            radius: pointRadiusPx,
            fill: color,
            stroke: pointStroke,
            strokeWidth: pointBorderWidthPx,
            opacity: pointOpacityLocal,
          });
          if(pointNode){
            const groupLabel = Number.isInteger(assignment)
              ? (style?.label || groupMeta?.entries?.[assignment]?.label || '')
              : (style?.label || '');
            attachPcaPointTooltip(pointNode, {
              label: pt.label || '',
              groupName: groupLabel,
              x: pt.x,
              y: pt.y,
              xLabel: pcaXLabelText,
              yLabel: pcaYLabelText,
              index: pt.index,
              columnIndex: Number.isInteger(pt.columnIndex) ? pt.columnIndex : null
            });
          }
        });
      }

      const labelLayout2d = Shared.labelLayout;
      const hasManualLabels = points.some(pt => pt?.isManualLabel && String(pt.label || '').trim());
      if(hasManualLabels && labelLayout2d?.computePointLabelLayout && labelLayout2d?.computePointLabelFontSize){
        const manualLabelEntries = [];
        const pointBounds = [];
        points.forEach(pt => {
          const cx = x2px(pt.x);
          const cy = y2px(pt.y);
          pointBounds.push({ cx, cy, r: dotSizePx });
          const labelText = pt.label ? String(pt.label).trim() : '';
          if(pt.isManualLabel && labelText){
            manualLabelEntries.push({
              text: labelText,
              cx,
              cy,
              radius: dotSizePx
            });
          }
        });
        if(manualLabelEntries.length){
          const labelLayer = document.createElementNS(NS,'g');
          labelLayer.setAttribute('data-layer','point-labels');
          labelLayer.setAttribute('pointer-events','none');
          const baseManualLabelSize = fs * 0.6;
          const xTickFontSize = labelLayout2d.readFontSizeFromNodes ? labelLayout2d.readFontSizeFromNodes(xTickNodes) : null;
          const yTickFontSize = labelLayout2d.readFontSizeFromNodes ? labelLayout2d.readFontSizeFromNodes(yTickNodes) : null;
          const tickFontSizeCap = (Number.isFinite(xTickFontSize) && Number.isFinite(yTickFontSize))
            ? Math.min(xTickFontSize, yTickFontSize)
            : (Number.isFinite(xTickFontSize)
              ? xTickFontSize
              : (Number.isFinite(yTickFontSize) ? yTickFontSize : fs));
          const labelFontSizeRaw = labelLayout2d.computePointLabelFontSize(baseManualLabelSize, manualLabelEntries.length, plotW, plotH);
          const labelFontSize = Math.min(labelFontSizeRaw, tickFontSizeCap);
          const labelScale = Math.min(1, labelFontSize / Math.max(1, baseManualLabelSize));
          const leaderStrokeWidth = chartStyle.scaleStrokeWidth(0.75 * labelScale, styleScaleInfo, { context: 'pca-point-label', min: 0.25 });
          const labelColor = chartStyle.TEXT_COLOR || '#333333';
          const plotLeft = margin.left;
          const plotRight = margin.left + plotW;
          const plotTop = margin.top;
          const plotBottom = margin.top + plotH;
          const font = typeof chartStyle?.makeFont === 'function'
            ? chartStyle.makeFont(labelFontSize)
            : null;
          const manualLabelLayout = labelLayout2d.computePointLabelLayout(manualLabelEntries, {
            plotLeft,
            plotRight,
            plotTop,
            plotBottom,
            labelFontSize,
            leaderGap: Math.max(2, Math.round(labelFontSize * 0.2)),
            leaderScale: labelScale,
            pointBounds,
            measureText: chartStyle?.measureText,
            font,
            angleSteps: 16,
            maxLeaderScale: 3
          });
          manualLabelLayout.forEach(result => {
            const entry = result.entry;
            const placement = result.placement;
            const cx = Number(entry?.cx) || 0;
            const cy = Number(entry?.cy) || 0;
            const textValue = entry?.text ? String(entry.text) : '';
            if(!textValue || !placement){
              return;
            }
            const textX = placement.textX;
            const textY = placement.textY;
            const anchor = placement.anchor;
            const lineX2 = placement.lineX2;
            const leader = document.createElementNS(NS,'line');
            leader.setAttribute('x1', String(cx));
            leader.setAttribute('y1', String(cy));
            leader.setAttribute('x2', String(lineX2));
            leader.setAttribute('y2', String(textY));
            leader.setAttribute('stroke', labelColor);
            leader.setAttribute('stroke-width', String(leaderStrokeWidth));
            leader.setAttribute('stroke-linecap', 'round');
            labelLayer.appendChild(leader);
            const textNode = document.createElementNS(NS,'text');
            textNode.setAttribute('x', String(textX));
            textNode.setAttribute('y', String(textY));
            textNode.setAttribute('font-size', String(labelFontSize));
            textNode.setAttribute('fill', labelColor);
            textNode.setAttribute('text-anchor', anchor);
            textNode.setAttribute('dominant-baseline', 'middle');
            textNode.textContent = textValue;
            labelLayer.appendChild(textNode);
          });
          svg.appendChild(labelLayer);
          debugLog('Debug: pca manual labels rendered', { count: manualLabelEntries.length, mode: '2d' });
        }
      }else if(hasManualLabels){
        debugLog('Debug: pca manual labels skipped', { mode: '2d', reason: 'missing-layout-helper' });
      }

      if(legendVisible){
        const defaultLegendX = margin.left + plotW + legendLayout.legendGapPx + appliedLegendAxisGap;
        const defaultLegendY = margin.top;
        const legendPos = pcaState.labelPositions?.legend;
        
        // Convert relative positions to absolute if needed for 2D legend
        let absoluteLegendX = defaultLegendX;
        let absoluteLegendY = defaultLegendY;
        if (legendPos) {
          if (legendPos.relX !== undefined && legendPos.relY !== undefined) {
            // Use relative positioning
            absoluteLegendX = margin.left + plotW + legendPos.relX * legendLayout.legendGapPx;
            absoluteLegendY = margin.top + legendPos.relY * plotH;
          } else if (legendPos.x !== undefined && legendPos.y !== undefined) {
            // Use absolute positioning (backward compatibility)
            absoluteLegendX = legendPos.x;
            absoluteLegendY = legendPos.y;
          }
        }
        
        const legendOriginX = absoluteLegendX;
        const legendOriginY = absoluteLegendY;
        const legendSpacing=Math.max(legendRenderer.rowGap || 0, Math.round(fs*0.35));
        const legendMarkerSize=legendRenderer.swatchSize || Math.max(Math.round(fs*0.6), 10);
        const legendTextOffset=legendMarkerSize+(legendRenderer.swatchGap || Math.max(Math.round(fs*0.2), 6));
        debugLog('Debug: pca legend layout',{
          legendX: legendOriginX,
          legendY: legendOriginY,
          legendSpacing,
          legendMarkerSize,
          legendTextOffset,
          legendVisible,
          appliedLegendAxisGap
        });
        const legendDoc = svg?.ownerDocument || global.document;
        const legendGroup = add('g', {
          'data-role': 'pca-legend',
          transform: `translate(${legendOriginX},${legendOriginY})`
        });
        const legendAdd = (tag, attrs, text) => {
          if(!legendDoc){ return null; }
          const node = legendDoc.createElementNS(NS, tag);
          Object.keys(attrs || {}).forEach(key => node.setAttribute(key, String(attrs[key])));
          if(text){ node.textContent = text; }
          legendGroup.appendChild(node);
          return node;
        };
        legendEntries.forEach((entry, i) => {
          const itemY = i * (legendMarkerSize + legendSpacing);
          const marker = drawShape(legendAdd, entry.shape || 'circle', {
            cx: legendMarkerSize / 2,
            cy: itemY + legendMarkerSize / 2,
            radius: legendMarkerSize / 2,
            fill: entry.color,
            stroke: borderColor,
            strokeWidth: 0,
            opacity: 1
          });
          if(marker){
            marker.style.cursor = 'pointer';
            marker.dataset.legendKey = entry.key;
            if(Number.isInteger(entry.groupIndex)){
              marker.dataset.legendGroupIndex = String(entry.groupIndex);
            } else if(entry.labelValue){
              marker.dataset.legendLabel = entry.labelValue;
            }
            marker.addEventListener('click',(evt)=>{
              if(evt){ evt.stopPropagation(); }
              handleLegendColorChange(entry, marker);
            });
          }
          const legendText = legendAdd('text', {
            x: legendTextOffset,
            y: itemY + legendMarkerSize / 2,
            'font-size': fs,
            'dominant-baseline': 'middle',
            fill: chartStyle.TEXT_COLOR,
          }, entry.label);
          markFontEditable(legendText,'legend',`legend-${i}`);
        });
        if(typeof Shared.enableLegendDrag === 'function'){
          Shared.enableLegendDrag(legendGroup, svg, {
            undoLabel: 'pca-legend-2d',
            onDragEnd: pos => {
              // Store both absolute and relative positions for 2D legend
              const relX = (pos.x - (margin.left + plotW)) / legendLayout.legendGapPx;
              const relY = (pos.y - margin.top) / plotH;
              pcaState.labelPositions.legend = { 
                x: pos.x, 
                y: pos.y,
                relX: relX, 
                relY: relY 
              };
              if(Shared.isDebugEnabled?.()){
                console.debug('Debug: pca 2d legend position saved', { absolute: pos, relative: { relX, relY } });
              }
            }
          });
        }
      }else{
        debugLog('Debug: pca legend skipped',{ mode: '2d', legendVisible, entryCount: legendEntries.length });
      }

      console.debug('pca render complete', {
        pointCount: points.length,
        width: W,
        height: H,
        fastMode: fastPointModeActive,
        loadingsRendered: Array.isArray(loadingsRows) ? loadingsRows.length : 0,
        loadingsTotal: loadingsTotalCount,
        loadingsTruncated
      });
      registerPcaGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
      ensureGraphViewport(svg, { padding: Math.max(fs, 18), debugLabel: 'pca-2d-graph' });
      pcaLayout?.syncPanels?.({ skipSchedule: true });
      syncPcaAutoDrawNoticeWidth('draw');
    } catch(err){
      debugLog('Error: drawPca failure',{ message: err?.message || err });
      throw err;
    } finally {
      const totalEnd = nowMs();
      const fastModeChanged = pcaState.fastPointMode !== fastPointModeActive;
      pcaState.fastPointMode = fastPointModeActive;
      if(fastModeChanged || fastPointModeActive){
        updateAutoDrawUi({ preserveReason: true });
      }
      const effectiveParseEnd = parseEnd ?? totalEnd;
      if(computeStart != null && computeEnd === null){
        computeEnd = totalEnd;
      }
      const computeMs = (computeStart != null && computeEnd != null && computeEnd >= computeStart)
        ? (computeEnd - computeStart)
        : 0;
      const renderAnchor = computeEnd ?? effectiveParseEnd;
      const renderMs = totalEnd - renderAnchor;
      if(cachePayload){
        pcaState.cachedRender = cachePayload;
        pcaState.dataDirty = false;
      }
      pcaState.viewDirty = false;
      if(!skipPerfRecord){
        recordPcaPerformance('draw', {
          method: methodSnapshot,
          totalMs: totalEnd - totalStart,
          parseMs: effectiveParseEnd - totalStart,
          computeMs,
          renderMs,
          samples: sampleCountSnapshot,
          features: featureCountSnapshot,
          fastMode: fastPointModeActive,
          points: Array.isArray(points) ? points.length : 0,
          loadingsRendered: Array.isArray(loadingsRows) ? loadingsRows.length : 0,
          loadingsTotal: Number.isFinite(loadingsTotalCount) ? loadingsTotalCount : (Array.isArray(loadingsRows) ? loadingsRows.length : 0),
          loadingsTruncated,
          viewOnly,
          cacheReused: usingCache,
          reason: drawOpts.reason || null
        });
      }
    }
    }
    function getPcaGraphPayload(){
      const noteControl = notesState.control || null;
      const notesText = noteControl && typeof noteControl.getValue === 'function'
        ? noteControl.getValue()
        : (notesState.text || '');
      const notesOpen = noteControl && typeof noteControl.isOpen === 'function'
        ? noteControl.isOpen()
        : !!notesState.open;
      notesState.text = notesText;
      notesState.open = notesOpen;
      const axisSettings = ensureAxisSettings();
      const activeHot = ensurePcaHotForActiveTab();
      const activeManager = activeHot
        ? ensurePcaDataViewsForHot(activeHot, {
            wrapper: global.document?.getElementById?.('pcaHotWrapper') || null,
            container: activeHot.__pcaHostContainer || global.document?.getElementById?.('pcaHot') || null
          })
        : (pcaDataViewsManager || null);
      if(activeHot){
        syncPcaActiveDataViewFromHot(activeHot, 'payload');
      }
      const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
      const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
      const cachedStatsRender = pcaState.cachedRender && typeof pcaState.cachedRender === 'object'
        ? pcaState.cachedRender
        : null;
      const savedSummaryHtml = (typeof pcaStatsSummary?.innerHTML === 'string' && pcaStatsSummary.innerHTML)
        ? pcaStatsSummary.innerHTML
        : null;
      return {
        type:'pca',
        data:activeHot?.getData?.() || [],
        exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
        dataViews: includeDataViews ? dataViewsPayload : undefined,
        activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
        config: {
          ...snapshotPcaConfig(axisSettings),
          stats: {
            resultsHtml: savedSummaryHtml
          },
          notes: {
            text: notesText,
            open: notesOpen
          }
        },
        stats:lastPcaStats ? {
          method:lastPcaStats.method || null,
          eigenSummary:Array.isArray(lastPcaStats.eigenSummary) ? lastPcaStats.eigenSummary : [],
          scree:Array.isArray(lastPcaStats.scree) ? lastPcaStats.scree : [],
          stress:lastPcaStats.stress,
          totalVariance:lastPcaStats.totalVariance,
          dimensions:lastPcaStats.dimensions,
          summaryLines: Array.isArray(lastPcaStats.summaryLines)
            ? lastPcaStats.summaryLines
            : (Array.isArray(cachedStatsRender?.statsSummaryLines) ? cachedStatsRender.statsSummaryLines : []),
          selectionSummary: lastPcaStats.selectionSummary ? cloneSimple(lastPcaStats.selectionSummary) : null,
          parallelAnalysis: Array.isArray(lastPcaStats.parallelAnalysis) ? lastPcaStats.parallelAnalysis.slice() : [],
          biplot: lastPcaStats.biplot ? cloneSimple(lastPcaStats.biplot) : null,
          loadings: cachedStatsRender ? {
            rows: Array.isArray(cachedStatsRender.loadingsRows) ? cachedStatsRender.loadingsRows : [],
            components: Number(cachedStatsRender.loadingsComponents) || 0,
            totalCount: Number.isFinite(cachedStatsRender.loadingsTotalCount) ? cachedStatsRender.loadingsTotalCount : 0,
            truncated: !!cachedStatsRender.loadingsTruncated
          } : null
        } : null
      };
    }

    function snapshotPcaConfig(axisSettingsOverride){
      const axisSettings = axisSettingsOverride && typeof axisSettingsOverride === 'object'
        ? axisSettingsOverride
        : ensureAxisSettings();
      return {
        method:pcaMethod.value,
        dotSize:pcaDotSize.value,
        fill:pcaFill.value,
        colorScheme: pcaState.theme?.colorScheme || 'scientific',
        textColor: pcaState.theme?.textColor || (chartStyle.TEXT_COLOR || '#000000'),
        backgroundColor: pcaState.theme?.backgroundColor || '#ffffff',
        border:pcaBorder.value,
        borderWidth:pcaBorderWidth.value,
        tableFormat:pcaState.tableFormat,
        loadingsLimit:pcaState.loadingsLimit,
        grouped:pcaState.grouped ? {
          replicatesPerGroup: pcaState.grouped.replicatesPerGroup,
          colors: Array.isArray(pcaState.grouped.colors) ? [...pcaState.grouped.colors] : [],
          shapes: Array.isArray(pcaState.grouped.shapes) ? [...pcaState.grouped.shapes] : []
        } : null,
        componentSelection: {
          rule: sanitizePcaComponentSelectionRule(pcaState.componentSelection?.rule),
          eigenThreshold: sanitizePcaEigenThreshold(pcaState.componentSelection?.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD),
          parallelIterations: sanitizePcaParallelIterations(pcaState.componentSelection?.parallelIterations, PCA_DEFAULT_PARALLEL_ITERATIONS)
        },
        alpha:pcaAlpha.value,
        labelColors:pcaLabelColors,
        labelShapes:pcaLabelShapes,
        labelPointStyles:pcaLabelPointStyles,
        showGrid:pcaShowGrid.checked,
        gridStyle:getGridStyle(axisSettings?.strokeWidth),
        showFrame:pcaShowFrame.checked,
        showLegend: pcaShowLegendInput ? !!pcaShowLegendInput.checked : true,
        scale:pcaScale.checked,
        axesVarianceScaled:pcaState.axesVarianceScaled,
        equalScaleAxes: pcaState.equalScaleAxes,
        equalAxes: pcaState.equalAxes,
        fontSize:pcaFontSize.value,
        fontStyles: (exportFontStyles('pca') || undefined),
        labels: {
          title: (pcaState.labels && typeof pcaState.labels.title === 'string')
            ? pcaState.labels.title
            : getDefaultTitleForMethod(pcaState.lastMethod || 'pca')
        },
        viewMode:pcaViewMode?.value || DEFAULT_VIEW_MODE,
        axisSelection:{
          x:pcaState.axisSelection.x,
          y:pcaState.axisSelection.y,
          z:pcaState.axisSelection.z
        },
        rotation:{
          x:pcaState.rotation.x,
          y:pcaState.rotation.y,
          z:pcaState.rotation.z,
          quaternion: pcaState.rotation.quaternion ? {
            w: pcaState.rotation.quaternion.w,
            x: pcaState.rotation.quaternion.x,
            y: pcaState.rotation.quaternion.y,
            z: pcaState.rotation.quaternion.z
          } : null
        },
        axis:{
          strokeWidth: axisSettings?.strokeWidth,
          color: axisSettings?.color,
          tickIntervalX: axisSettings?.x?.tickInterval ?? null,
          tickIntervalY: axisSettings?.y?.tickInterval ?? null,
          minorTicksX: axisSettings?.x?.minorTicks ?? false,
          minorTicksY: axisSettings?.y?.minorTicks ?? false,
          minorTickSubdivisionsX: clampMinorTickSubdivisions(axisSettings?.x?.minorTickSubdivisions),
          minorTickSubdivisionsY: clampMinorTickSubdivisions(axisSettings?.y?.minorTickSubdivisions)
        },
        tsne:{
          perplexity:pcaTsnePerplexity?.value ?? DEFAULT_TSNE_SETTINGS.perplexity,
          learningRate:pcaTsneLearningRate?.value ?? DEFAULT_TSNE_SETTINGS.learningRate,
          iterations:pcaTsneIterations?.value ?? DEFAULT_TSNE_SETTINGS.iterations,
          earlyExaggeration:pcaTsneExaggeration?.value ?? DEFAULT_TSNE_SETTINGS.earlyExaggeration
        },
        umap:{
          neighbors:pcaUmapNeighbors?.value ?? DEFAULT_UMAP_SETTINGS.neighbors,
          minDist:pcaUmapMinDist?.value ?? DEFAULT_UMAP_SETTINGS.minDist,
          learningRate:pcaUmapLearningRate?.value ?? DEFAULT_UMAP_SETTINGS.learningRate,
          epochs:pcaUmapEpochs?.value ?? DEFAULT_UMAP_SETTINGS.epochs
        },
        labelPositions: pcaState.labelPositions || null
      };
    }

    function ensureEmptyPayloadTemplate(){
      if(emptyPayloadTemplate){
        return;
      }
      const configSnapshot = snapshotPcaConfig();
      const safeConfig = cloneSimple(configSnapshot) || configSnapshot || {};
      emptyPayloadTemplate = {
        type: 'pca',
        config: safeConfig
      };
    }
      let pcaFileHandle=null, pcaFileName='pca.graph';
      async function savePcaFile(){
        console.debug('Debug: savePcaFile invoked', { hasHandle: !!pcaFileHandle });
        if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
          console.error('savePcaFile missing fileIO.saveGraphFile');
          return;
        }
        const result = await fileIO.saveGraphFile({
          context: 'pca',
          fileHandle: pcaFileHandle,
          getPayload: getPcaGraphPayload,
          fileName: pcaFileName,
          downloadFileName: pcaFileName,
          setFileHandle: handle => { pcaFileHandle = handle; },
          setFileName: name => { pcaFileName = name; }
        });
        console.debug('Debug: savePcaFile result', result);
      }
      async function saveAsPcaFile(){
        console.debug('Debug: saveAsPcaFile invoked', { currentName: pcaFileName });
        if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
          console.error('saveAsPcaFile missing fileIO.saveGraphFileAs');
          return;
        }
        const result = await fileIO.saveGraphFileAs({
          context: 'pca',
          getPayload: getPcaGraphPayload,
          fileName: pcaFileName,
          downloadFileName: pcaFileName,
          setFileHandle: handle => { pcaFileHandle = handle; },
          setFileName: name => { pcaFileName = name; }
        });
        console.debug('Debug: saveAsPcaFile result', result);
      }
      async function openPcaFile(){
        console.debug('Debug: openPcaFile invoked');
        if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
          console.error('openPcaFile missing fileIO.openGraphFile');
          return;
        }
        const result = await fileIO.openGraphFile({
          context: 'pca',
          setFileHandle: handle => { pcaFileHandle = handle; },
          setFileName: name => { pcaFileName = name; },
          loadFromFile: file => loadPcaGraphFile(file),
          triggerInput: () => {
            const input = document.getElementById('pcaGraphFile');
            if(input){
              input.value='';
              input.click();
            }
          }
        });
        console.debug('Debug: openPcaFile result', result);
      }
      function applyPcaPayload(obj, meta = {}){
        if(!obj || typeof obj !== 'object'){
          console.error('pca payload missing or invalid', { meta });
          return false;
        }
        if(obj.type && obj.type !== 'pca'){
          console.error('Invalid graph type for pca payload', { type: obj.type, meta });
          return false;
        }
        if(meta?.flagOverlay){
          const overlayReason = meta?.overlayReason || (typeof meta?.source === 'string' ? `payload-${meta.source}` : 'payload');
          markPcaOverlayPending(overlayReason);
        }
        const skipDraw = meta?.skipDraw === true;
        const styleOnly = meta?.styleOnly === true || meta?.colorSchemeOnly === true;
        const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
        const scheduleOriginal = typeof scheduleDrawPca === 'function' ? scheduleDrawPca : null;
        const shouldSuspendSchedule = !!(scheduleOriginal && (skipDraw || !skipDataLoad));
        if(shouldSuspendSchedule){
          scheduleDrawPca = () => {};
        }
        try{
        const hot = ensurePcaHotForActiveTab();
        const rawDataMatrix = Array.isArray(obj.data) ? obj.data : [];
        const serializedViews = (obj.dataViews && typeof obj.dataViews === 'object') ? obj.dataViews : null;
        const requestedActiveViewId = obj.activeDataViewId || serializedViews?.activeViewId || null;
        const dataManager = hot
          ? ensurePcaDataViewsForHot(hot, {
              wrapper: global.document?.getElementById?.('pcaHotWrapper') || null,
              container: hot.__pcaHostContainer || global.document?.getElementById?.('pcaHot') || null
            })
          : null;
        if(dataManager){
          if(serializedViews){
            dataManager.deserialize(serializedViews, {
              fallbackData: rawDataMatrix,
              activeViewId: requestedActiveViewId,
              silent: true,
              activate: false
            });
          }else{
            dataManager.initialize(rawDataMatrix, { rawTitle: 'Raw' });
          }
        }
        const matrixData = dataManager?.getActiveView?.()?.data;
        const dataToLoad = Array.isArray(matrixData) ? matrixData : rawDataMatrix;
        const exclusionsToApply = obj.exclusions || dataManager?.getActiveView?.()?.exclusions || null;
        if(!skipDataLoad && pcaHotInstance && typeof pcaHotInstance.loadData === 'function'){
          markPcaDataDirty(meta?.reason || 'payload-load');
          pcaHotInstance.loadData(dataToLoad);
          if(exclusionsToApply){
            pcaHotInstance.applyExclusions?.(exclusionsToApply);
          }
          syncPcaActiveDataViewFromHot(pcaHotInstance, 'payload-load');
        }
        const c=obj.config||{};
        applyPcaThemeConfig(c);
        if(c.notes && typeof c.notes === 'object'){
          notesState.text = c.notes.text == null ? '' : String(c.notes.text);
          notesState.open = !!c.notes.open;
        }else if(typeof c.notes === 'string'){
          notesState.text = c.notes;
          notesState.open = !!notesState.open;
        }else{
          notesState.text = '';
          notesState.open = false;
        }
        if(notesState.control){
          notesState.control.setValue(notesState.text);
          notesState.control.setOpen(notesState.open);
        }
        importFontStyles('pca', c.fontStyles || null);
        pcaDotSize.value=c.dotSize||pcaDotSize.value;
        pcaFill.value=c.fill||pcaFill.value;
        pcaBorder.value=c.border||pcaBorder.value;
        pcaBorderWidth.value=c.borderWidth||pcaBorderWidth.value;
        pcaMethod.value=c.method||'pca';
        if(!pcaState.labels || typeof pcaState.labels !== 'object'){
          pcaState.labels = { title: getDefaultTitleForMethod(pcaMethod.value) };
        }
        if(c.labels && typeof c.labels === 'object'){
          const restoredTitle = typeof c.labels.title === 'string' ? c.labels.title : '';
          const fallbackTitle = getDefaultTitleForMethod(pcaMethod.value);
          pcaState.labels.title = restoredTitle && restoredTitle.trim() ? restoredTitle : fallbackTitle;
          debugLog('Debug: pca title restored',{ title: pcaState.labels.title });
        } else if(!pcaState.labels.title || !pcaState.labels.title.trim()){
          pcaState.labels.title = getDefaultTitleForMethod(pcaMethod.value);
        }
        pcaState.lastMethod = (pcaMethod.value || 'pca').toLowerCase();
        applyMethodUiState(pcaMethod.value);
        pcaAlpha.value=c.alpha||0;
        pcaAlphaVal.textContent=pcaAlpha.value;
        pcaLabelColors=c.labelColors||{};
        pcaLabelShapes=c.labelShapes||{};
        pcaLabelPointStyles=c.labelPointStyles||{};
        if(c.grouped && typeof c.grouped === 'object'){
          pcaState.grouped = {
            replicatesPerGroup: c.grouped.replicatesPerGroup,
            colors: Array.isArray(c.grouped.colors) ? [...c.grouped.colors] : [],
            shapes: Array.isArray(c.grouped.shapes) ? [...c.grouped.shapes] : []
          };
        }
        ensurePcaGroupedDefaults();
        const restoredTableFormat = typeof c.tableFormat === 'string' ? c.tableFormat : pcaState.tableFormat;
        setPcaTableFormat(restoredTableFormat);
        if(Number.isFinite(Number(c.loadingsLimit))){
          pcaState.loadingsLimit = clampLoadingsLimitValue(c.loadingsLimit, PCA_LOADINGS_ROW_LIMIT);
        } else {
          pcaState.loadingsLimit = clampLoadingsLimitValue(pcaState.loadingsLimit, PCA_LOADINGS_ROW_LIMIT);
        }
        if(c.componentSelection && typeof c.componentSelection === 'object'){
          pcaState.componentSelection = {
            rule: sanitizePcaComponentSelectionRule(c.componentSelection.rule),
            eigenThreshold: sanitizePcaEigenThreshold(c.componentSelection.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD),
            parallelIterations: sanitizePcaParallelIterations(c.componentSelection.parallelIterations, PCA_DEFAULT_PARALLEL_ITERATIONS)
          };
        }else{
          pcaState.componentSelection = {
            rule: sanitizePcaComponentSelectionRule(pcaState.componentSelection?.rule),
            eigenThreshold: sanitizePcaEigenThreshold(pcaState.componentSelection?.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD),
            parallelIterations: sanitizePcaParallelIterations(pcaState.componentSelection?.parallelIterations, PCA_DEFAULT_PARALLEL_ITERATIONS)
          };
        }
        syncPcaComponentSelectionUi();
        syncLoadingsLimitUi(PCA_LOADINGS_ROW_LIMIT);
        pcaShowGrid.checked=!!c.showGrid;
        setGridStyle(c.gridStyle, c.axis?.strokeWidth);
        pcaShowFrame.checked = c.showFrame !== false;
        if(pcaShowLegendInput){
          pcaShowLegendInput.checked = c.showLegend !== false;
          ensurePcaResizerControls();
        }
        pcaScale.checked=!!c.scale;
        const hasEqualScale = Object.prototype.hasOwnProperty.call(c, 'equalScaleAxes');
        const hasEqualAxes = Object.prototype.hasOwnProperty.call(c, 'equalAxes');
        const hasVariance = Object.prototype.hasOwnProperty.call(c, 'axesVarianceScaled');
        pcaState.axesVarianceScaled = !!c.axesVarianceScaled;
        if(hasEqualScale){
          pcaState.equalScaleAxes = !!c.equalScaleAxes;
        }
        if(hasEqualAxes){
          pcaState.equalAxes = !!c.equalAxes;
        }
        if(!hasEqualScale && (hasEqualAxes || hasVariance)){
          pcaState.equalScaleAxes = false;
        }
        if(pcaState.equalScaleAxes){
          pcaState.equalAxes = false;
          pcaState.axesVarianceScaled = false;
          debugLog('Debug: pca axes length payload exclusivity enforced',{ kept: 'equal-scale' });
        }else if(pcaState.axesVarianceScaled && pcaState.equalAxes){
          pcaState.equalAxes = false;
          debugLog('Debug: pca axes length payload exclusivity enforced',{ kept: 'variance' });
        }
        if(pcaVarianceAxisScale){
          pcaVarianceAxisScale.checked = !!pcaState.axesVarianceScaled;
        }
        ensurePcaAxesLengthControlPlacement();
        pcaFontSize.value=c.fontSize||pcaFontSize.value;
        if(pcaViewMode){
          const restoredView = c.viewMode || DEFAULT_VIEW_MODE;
          pcaViewMode.value = restoredView;
          pcaViewMode.dispatchEvent(new Event('change'));
          debugLog('Debug: pca view mode restored',{ restoredView });
        }
        if(c.axisSelection){
          const sel = c.axisSelection;
          if(sel && typeof sel === 'object'){
            const before = { ...pcaState.axisSelection };
            if(Number.isFinite(Number(sel.x))){ pcaState.axisSelection.x = Number(sel.x); }
            if(Number.isFinite(Number(sel.y))){ pcaState.axisSelection.y = Number(sel.y); }
            if(Number.isFinite(Number(sel.z))){ pcaState.axisSelection.z = Number(sel.z); }
            sanitizeAxisSelection(pcaState.axisMeta.length);
            syncAxisSelectValues();
            debugLog('Debug: pca axis selection restored',{ before, after: { ...pcaState.axisSelection } });
          }
        }
        if(c.rotation){
          const restored = plot3d.createRotationState(c.rotation);
          pcaState.rotation.x = restored.x;
          pcaState.rotation.y = restored.y;
          pcaState.rotation.z = restored.z;
          pcaState.rotation.quaternion = {
            w: restored.quaternion.w,
            x: restored.quaternion.x,
            y: restored.quaternion.y,
            z: restored.quaternion.z
          };
          debugLog('Debug: pca rotation restored', {
            rotation: {
              x: pcaState.rotation.x,
              y: pcaState.rotation.y,
              z: pcaState.rotation.z
            }
          });
        }
        applyAxisSettings(c.axis || c.axisSettings);
        if(c.tsne){
          if(pcaTsnePerplexity){ pcaTsnePerplexity.value = c.tsne.perplexity ?? pcaTsnePerplexity.value; }
          if(pcaTsneLearningRate){ pcaTsneLearningRate.value = c.tsne.learningRate ?? pcaTsneLearningRate.value; }
          if(pcaTsneIterations){ pcaTsneIterations.value = c.tsne.iterations ?? pcaTsneIterations.value; }
          if(pcaTsneExaggeration){ pcaTsneExaggeration.value = c.tsne.earlyExaggeration ?? pcaTsneExaggeration.value; }
          debugLog('Debug: pca tsne settings restored', c.tsne);
        }
        if(c.umap){
          if(pcaUmapNeighbors){ pcaUmapNeighbors.value = c.umap.neighbors ?? pcaUmapNeighbors.value; }
          if(pcaUmapMinDist){ pcaUmapMinDist.value = c.umap.minDist ?? pcaUmapMinDist.value; }
          if(pcaUmapLearningRate){ pcaUmapLearningRate.value = c.umap.learningRate ?? pcaUmapLearningRate.value; }
          if(pcaUmapEpochs){ pcaUmapEpochs.value = c.umap.epochs ?? pcaUmapEpochs.value; }
          debugLog('Debug: pca umap settings restored', c.umap);
        }
        if(pcaFontSize.dataset){
          pcaFontSize.dataset.fontBasePt = String(pcaFontSize.value);
          debugLog('Debug: pca font size base restored',{ value: pcaFontSize.value });
        }
        chartStyle.renderFontSizeLabel({ element: pcaFontSizeVal, pt: Number(pcaFontSize.value), input: pcaFontSize, manual: true });
        const savedStatsHtml = (c.stats && typeof c.stats === 'object' && typeof c.stats.resultsHtml === 'string')
          ? c.stats.resultsHtml
          : null;
        const restoredStats = (obj.stats && typeof obj.stats === 'object')
          ? obj.stats
          : ((c.stats && typeof c.stats === 'object') ? c.stats : null);
        if(restoredStats){
          lastPcaStats = cloneSimple(restoredStats) || restoredStats;
          debugLog('Debug: pca stats restored from payload',{
            hasEigenSummary: Array.isArray(lastPcaStats?.eigenSummary) && lastPcaStats.eigenSummary.length > 0,
            hasScree: Array.isArray(lastPcaStats?.scree) && lastPcaStats.scree.length > 0,
            method: lastPcaStats?.method || null,
            source: (obj.stats && typeof obj.stats === 'object') ? 'payload.stats' : 'config.stats'
          });
          restorePcaStatsFromPayload({ savedSummaryHtml: savedStatsHtml });
        }else{
          resetStatsPanel('');
          lastPcaStats = null;
        }
        // Restore label positions if saved
        if(c.labelPositions){
          pcaState.labelPositions = {
            title: c.labelPositions.title || null,
            xLabel: c.labelPositions.xLabel || null,
            yLabel: c.labelPositions.yLabel || null,
            legend: c.labelPositions.legend || null
          };
        }
        if(styleOnly){
          markPcaViewDirty(meta?.reason || 'pca-style-payload');
        }
        if(!skipDraw && scheduleOriginal){
          if(styleOnly){
            scheduleOriginal({
              viewOnly: true,
              reason: meta?.reason || 'pca-style-payload'
            });
          }else{
            scheduleOriginal({
              reason: meta?.reason || (meta?.source ? `payload-${meta.source}` : 'payload')
            });
          }
        }
        debugLog('Debug: pca payload applied',{ source: meta.source || 'unknown', rows: dataToLoad.length });
        return true;
        }finally{
          if(shouldSuspendSchedule && scheduleOriginal){
            scheduleDrawPca = scheduleOriginal;
          }
        }
      }

    function initNotes(){
      const stack = global.document.querySelector('#pcaGraphPanel .pca-plot-stack')
        || global.document.querySelector('#pcaGraphPanel .diagram-area');
      if(!stack){
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          debugLog('Debug: pca notes mount skipped (missing stack)');
        }
        return;
      }
      const helper = Shared.notes;
      if(!helper || typeof helper.mountFoldable !== 'function'){
        console.warn('pca notes helper unavailable', { hasSharedNotes: !!helper });
        return;
      }
      if(notesState.control?.root && notesState.control.root.isConnected){
        notesState.control.setValue(notesState.text || '');
        notesState.control.setOpen(!!notesState.open);
        return;
      }
      notesState.control = helper.mountFoldable({
        container: stack,
        id: 'pca-notes',
        title: 'Notes',
        placeholder: 'Write notes about the data being analyzed...',
        richText: true,
        scopeId: 'pca',
        fontKey: 'notes',
        value: notesState.text || '',
        open: !!notesState.open,
        onChange: value => {
          notesState.text = value == null ? '' : String(value);
        },
        onToggle: open => {
          notesState.open = !!open;
        }
      });
    }

      function loadPcaGraphFile(file){
        const reader=new FileReader();
        reader.onload=e=>{
          try{
            const obj=JSON.parse(e.target.result);
            if(!applyPcaPayload(obj, { source: 'file', flagOverlay: true, overlayReason: 'graph-file' })){
              console.warn('pca payload rejected from file', { hasType: !!obj?.type });
            }
          }catch(err){
            console.error('loadPcaGraph error',err);
          }
        };
        reader.readAsText(file);
      }
      if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
        Shared.exporter.mountSvgControls({
          container: '#pcaExportControls',
          svgSelector: '#pcaSvg',
          fileName: 'pca',
          contextLabel: 'pca-export'
        });
        Shared.exporter.mountSvgControls({
          container: '#pcaScreeExportControls',
          svgSelector: '#pcaScreeSvg',
          fileName: 'pca-scree',
          contextLabel: 'pca-scree-export'
        });
        debugLog('Debug: pca export controls mounted', { hasExporter: true }); // Debug: pca export mount
      } else {
        debugLog('Debug: pca export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: pca export fallback
      }
      document.getElementById('openPcaGraph')?.addEventListener('click',openPcaFile);
      document.getElementById('savePcaGraph')?.addEventListener('click',savePcaFile);
      document.getElementById('saveAsPca')?.addEventListener('click',saveAsPcaFile);
      document.getElementById('pcaGraphFile').addEventListener('change',e=>{ const f=e.target.files[0]; if(f){ pcaFileName=f.name; pcaFileHandle=null; loadPcaGraphFile(f); } });
    
    const runPcaDrawCycle = async () => {
      let status = 'complete';
      try{
        await drawPca();
      }catch(err){
        status = 'error';
        throw err;
      }finally{
        resolvePcaOverlay(status);
      }
    };
    const schedulePcaBase = Shared.debounceFrame ? Shared.debounceFrame(runPcaDrawCycle) : runPcaDrawCycle;
    const schedulePcaInstrumented = (opts) => {
      const nextOpts = opts || {};
      const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
      if(nextOpts.force){
        markPcaOverlayPending(overlayReason);
        forcePcaOverlay(overlayReason, { message: 'Rendering PCA view...' });
      }else if(!nextOpts.viewOnly){
        queuePcaOverlay(overlayReason);
      }
      const runSchedule = () => schedulePcaBase(nextOpts);
      const shouldDelayForOverlay = pcaOverlayController?.isActive?.() && !nextOpts.viewOnly;
      if(shouldDelayForOverlay){
        const scheduleAfterPaint = () => {
          debugLog('Debug: pca autoDraw deferred for overlay',{ reason: overlayReason });
          runSchedule();
        };
        if(typeof global.requestAnimationFrame === 'function'){
          global.requestAnimationFrame(scheduleAfterPaint);
        }else{
          (global.setTimeout || setTimeout)(scheduleAfterPaint, 0);
        }
        return;
      }
      runSchedule();
    };
    scheduleDrawPcaRaw = schedulePcaInstrumented;
    pcaLayout?.setScheduleDraw?.(() => scheduleDrawPca());
    ensurePcaFontEventListener();
    debugLog('Debug: pca scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    pca.save = savePcaFile;
    pca.saveAs = saveAsPcaFile;
    pca.open = openPcaFile;
    pca.loadFromFile = loadPcaGraphFile;
    pca.loadFromPayload = function loadPcaFromPayload(payload, options = {}){
      if(!applyPcaPayload(payload, { source: 'payload', ...options })){
        console.warn('pca payload application failed', { source: 'payload' });
      }
    };
    pca.applyColorSchemePayload = function applyPcaColorSchemePayload(payload, options = {}){
      return applyPcaPayload(payload, {
        source: 'color-scheme',
        colorSchemeOnly: true,
        ...options
      });
    };
    pca.getPayload = getPcaGraphPayload;
    pca.captureEmptyPayloadTemplate = function capturePcaEmptyPayloadTemplate(){
    ensureEmptyPayloadTemplate();
    const snapshot = cloneSimple(emptyPayloadTemplate);
    console.debug('Debug: pca empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  pca.restoreEmptyPayloadTemplate = function restorePcaEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: pca empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    console.debug('Debug: pca empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  pca.createEmptyPayload = function createEmptyPcaPayload(){
      pca.ensure();
      ensureEmptyPayloadTemplate();
      const payload = cloneSimple(emptyPayloadTemplate) || { type: 'pca', config: {} };
      payload.type = 'pca';
      const createEmpty = Shared.createEmptyData;
      const emptyData = typeof createEmpty === 'function'
        ? createEmpty(DEFAULT_ROWS, DEFAULT_COLS)
        : Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(''));
      if(Array.isArray(emptyData[0])){
        emptyData[0][0] = PCA_POINT_LABEL_ROW_HEADER;
        for(let c = 1; c < emptyData[0].length; c += 1){
          emptyData[0][c] = false;
        }
      }
      payload.data = emptyData;
      payload.exclusions = [];
      payload.stats = null;
      if(payload.config){
        if(typeof payload.config.colorScheme !== 'string' || !payload.config.colorScheme.trim()){
          payload.config.colorScheme = Shared.colorSchemes?.getDefaultSchemeId?.('pca') || 'scientific';
        }
        payload.config.stats = payload.config.stats && typeof payload.config.stats === 'object'
          ? payload.config.stats
          : {};
        payload.config.stats.resultsHtml = null;
        payload.config.labels = { title: getDefaultTitleForMethod('pca') };
        payload.config.axisSelection = { x: 1, y: 2, z: 3 };
        payload.config.rotation = {
          x: 0,
          y: 0,
          z: 0,
          quaternion: { w: 1, x: 0, y: 0, z: 0 }
        };
      }
      return payload;
    };
    pca.serialize = serializeSvg;
    pca.getHotInstance = () => pcaHotInstance;
    pca.prepareForTab = function prepareForTab(tab){
      const payloadConfig = tab && tab.payload && tab.payload.config ? tab.payload.config : null;
      applyPcaMethodUiPreActivation(payloadConfig || {});
      const hot = ensurePcaHotForActiveTab();
      if(hot){
        ensurePcaDataViewsForHot(hot, {
          wrapper: global.document?.getElementById?.('pcaHotWrapper') || null,
          container: hot.__pcaHostContainer || global.document?.getElementById?.('pcaHot') || null
        });
        syncPcaActiveDataViewFromHot(hot, 'prepare-tab');
      }
    };

    function detachChildren(node){
      if(!node){ return null; }
      const doc = node.ownerDocument || global.document;
      const fragment = doc?.createDocumentFragment ? doc.createDocumentFragment() : null;
      if(!fragment){ return null; }
      let count = 0;
      while(node.firstChild){
        fragment.appendChild(node.firstChild);
        count += 1;
      }
      return { fragment, count };
    }

    function restoreChildren(node, payload){
      if(!node || !payload || !payload.fragment){ return false; }
      while(node.firstChild){
        node.removeChild(node.firstChild);
      }
      node.appendChild(payload.fragment);
      return true;
    }

    function captureElementState(node, options = {}){
      if(!node){ return null; }
      const includeMaxWidth = !!options.includeMaxWidth;
      return {
        hidden: !!node.hidden,
        display: node.style?.display || '',
        maxWidth: includeMaxWidth ? (node.style?.maxWidth || '') : undefined
      };
    }

    function restoreElementState(node, state, options = {}){
      if(!node || !state){ return false; }
      const includeMaxWidth = !!options.includeMaxWidth;
      if(Object.prototype.hasOwnProperty.call(state, 'hidden')){
        node.hidden = !!state.hidden;
      }
      if(node.style && Object.prototype.hasOwnProperty.call(state, 'display')){
        if(state.display){
          node.style.display = state.display;
        }else{
          node.style.removeProperty('display');
        }
      }
      if(includeMaxWidth && node.style && Object.prototype.hasOwnProperty.call(state, 'maxWidth')){
        if(state.maxWidth){
          node.style.maxWidth = state.maxWidth;
        }else{
          node.style.removeProperty('max-width');
        }
      }
      return true;
    }

    pca.captureRenderCache = function captureRenderCache(){
      const plot = document.getElementById('pcaPlot');
      const stats = document.getElementById('pcaStatsResults');
      const summary = document.getElementById('pcaStatsSummary');
      const scree = document.getElementById('pcaScreePlot');
      const screeContainer = document.getElementById('pcaScreeContainer');
      const screeExportControls = document.getElementById('pcaScreeExportControls');
      const varianceSummary = document.getElementById('pcaVarianceSummary');
      const eigenTableContainer = document.getElementById('pcaEigenTableContainer');
      const loadingsContainer = document.getElementById('pcaLoadingsContainer');
      const screeVarianceRow = document.getElementById('pcaScreeVarianceRow');
      const plotCache = detachChildren(plot);
      const statsCache = detachChildren(stats);
      const summaryCache = detachChildren(summary);
      const screeCache = detachChildren(scree);
      const uiState = {
        screeContainer: captureElementState(screeContainer, { includeMaxWidth: true }),
        screeExportControls: captureElementState(screeExportControls),
        varianceSummary: captureElementState(varianceSummary),
        eigenTableContainer: captureElementState(eigenTableContainer),
        loadingsContainer: captureElementState(loadingsContainer),
        screeVarianceRow: captureElementState(screeVarianceRow)
      };
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        debugLog('Debug: pca render cache captured', {
          plotNodes: plotCache?.count || 0,
          statsNodes: statsCache?.count || 0,
          summaryNodes: summaryCache?.count || 0,
          screeNodes: screeCache?.count || 0,
          screeHidden: uiState.screeContainer?.hidden ?? null,
          varianceHidden: uiState.varianceSummary?.hidden ?? null
        });
      }
      return { plot: plotCache, stats: statsCache, summary: summaryCache, scree: screeCache, uiState };
    };

    pca.restoreRenderCache = function restoreRenderCache(cache){
      if(!cache){ return false; }
      const plot = document.getElementById('pcaPlot');
      const stats = document.getElementById('pcaStatsResults');
      const summary = document.getElementById('pcaStatsSummary');
      const scree = document.getElementById('pcaScreePlot');
      const screeContainer = document.getElementById('pcaScreeContainer');
      const screeExportControls = document.getElementById('pcaScreeExportControls');
      const varianceSummary = document.getElementById('pcaVarianceSummary');
      const eigenTableContainer = document.getElementById('pcaEigenTableContainer');
      const loadingsContainer = document.getElementById('pcaLoadingsContainer');
      const screeVarianceRow = document.getElementById('pcaScreeVarianceRow');
      const restoredPlot = restoreChildren(plot, cache.plot);
      const restoredStats = restoreChildren(stats, cache.stats);
      const restoredSummary = restoreChildren(summary, cache.summary);
      const restoredScree = restoreChildren(scree, cache.scree);
      restoreElementState(screeContainer, cache.uiState?.screeContainer, { includeMaxWidth: true });
      restoreElementState(screeExportControls, cache.uiState?.screeExportControls);
      restoreElementState(varianceSummary, cache.uiState?.varianceSummary);
      restoreElementState(eigenTableContainer, cache.uiState?.eigenTableContainer);
      restoreElementState(loadingsContainer, cache.uiState?.loadingsContainer);
      restoreElementState(screeVarianceRow, cache.uiState?.screeVarianceRow);
      if(restoredScree && screeContainer && !cache.uiState?.screeContainer){
        screeContainer.hidden = false;
      }
      if(restoredScree && screeExportControls && !cache.uiState?.screeExportControls){
        screeExportControls.style.display = '';
      }
      if(lastPcaStats && (!restoredScree || (screeContainer && screeContainer.hidden) || !restoredSummary)){
        restorePcaStatsFromPayload({
          savedSummaryHtml: null
        });
      }
      updateScreeVarianceRowVisibility();
      const restored = restoredPlot || restoredStats || restoredSummary || restoredScree;
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        debugLog('Debug: pca render cache restored', {
          restored,
          plot: restoredPlot,
          stats: restoredStats,
          summary: restoredSummary,
          scree: restoredScree,
          screeHidden: screeContainer?.hidden ?? null,
          varianceHidden: varianceSummary?.hidden ?? null,
          eigenHidden: eigenTableContainer?.hidden ?? null,
          loadingsHidden: loadingsContainer?.hidden ?? null
        });
      }
      return restored;
    };
    pca.__state = pcaState;
    initNotes();
    ensureEmptyPayloadTemplate();
    pca.ready = true;
    console.debug('Debug: Components.pca.setup complete');
  }

  function ensureReady(){ if(!pca.ready) setup(); }

  pca.init = setup;
  pca.ensure = ensureReady;
  pca.draw = function draw(){ ensureReady(); scheduleDrawPca && scheduleDrawPca(); };

  function benchmarkPcaLoad(config){
    const rows = Math.max(2, Math.floor(Number(config?.rows) || 200));
    const cols = Math.max(2, Math.floor(Number(config?.cols) || 5));
    const generator = typeof config?.generator === 'function'
      ? config.generator
      : ((rowIdx, colIdx) => Math.sin(rowIdx * 0.1 + colIdx * 0.5) * 10 + colIdx);
    const matrix = new Array(rows);
    for(let r = 0; r < rows; r++){
      const row = new Array(cols);
      for(let c = 0; c < cols; c++){
        row[c] = Number(generator(r, c)) || 0;
      }
      matrix[r] = row;
    }
    const perf = global.performance;
    const start = perf?.now ? perf.now() : Date.now();
    const means = new Array(cols).fill(0);
    for(let r = 0; r < rows; r++){
      const row = matrix[r];
      for(let c = 0; c < cols; c++){
        means[c] += row[c];
      }
    }
    for(let c = 0; c < cols; c++){
      means[c] /= rows;
    }
    const centered = new Array(rows);
    for(let r = 0; r < rows; r++){
      const row = new Array(cols);
      for(let c = 0; c < cols; c++){
        row[c] = matrix[r][c] - means[c];
      }
      centered[r] = row;
    }
    const cov = Array.from({ length: cols }, () => new Array(cols).fill(0));
    for(let r = 0; r < rows; r++){
      const row = centered[r];
      for(let i = 0; i < cols; i++){
        for(let j = i; j < cols; j++){
          cov[i][j] += row[i] * row[j];
        }
      }
    }
    const denom = rows - 1 || 1;
    for(let i = 0; i < cols; i++){
      for(let j = i; j < cols; j++){
        const value = cov[i][j] / denom;
        cov[i][j] = value;
        cov[j][i] = value;
      }
    }
    const end = perf?.now ? perf.now() : Date.now();
    return {
      rows,
      cols,
      durationMs: Number((end - start).toFixed(3)),
      varianceTrace: cov.reduce((sum, diagRow, idx) => sum + (diagRow[idx] || 0), 0)
    };
  }

  pca.__testHooks = Object.assign({}, pca.__testHooks, {
    benchmarkLoad: opts => benchmarkPcaLoad(opts),
    getPerformance: () => ({
      performance: cloneSimple(pcaState.performance),
      lastAutoDrawEvaluation: cloneSimple(pcaState.lastAutoDrawEvaluation),
      lastDataShape: cloneSimple(pcaState.lastDataShape),
      state: {
        dataDirty: !!pcaState.dataDirty,
        viewDirty: !!pcaState.viewDirty,
        hasCachedRender: !!pcaState.cachedRender
      }
    })
  });

})(window);
