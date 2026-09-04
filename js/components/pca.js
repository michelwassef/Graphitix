(function(global) {
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};

  function pcaDebug(message, ...rest) {
    if (typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      if (rest.length) {
        console.debug(message, ...rest);
      } else {
        console.debug(message);
      }
    }
  }
  const pca = Components.pca = Components.pca || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const svgGeometry = Shared.svgGeometry = Shared.svgGeometry || {};
  if(typeof svgGeometry.buildCompoundLinePath !== 'function' && typeof require === 'function'){
    try{
      require('../shared/svgGeometry.js');
    }catch(err){
      pcaDebug('Debug: pca component svgGeometry helper require failed', { message: err?.message || String(err) });
    }
  }
  const plot3d = Shared.plot3d = Shared.plot3d || {};
  if (typeof plot3d.createRotationState !== 'function' && typeof require === 'function') {
    try {
      require('../shared/plot3d.js');
    } catch (err) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('Debug: pca component plot3d helper require failed', {
          message: err?.message || String(err)
        });
      }
    }
  }
  if (typeof plot3d.createRotationState !== 'function') {
    plot3d.createRotationState = (defaults) => ({
      x: Number.isFinite(defaults?.x) ? defaults.x : 0,
      y: Number.isFinite(defaults?.y) ? defaults.y : 0
    });
  }
  if (typeof plot3d.attachRotationControls !== 'function') {
    plot3d.attachRotationControls = () => {};
  }
  if (typeof plot3d.rotatePoint !== 'function') {
    plot3d.rotatePoint = (pt) => ({
      x: Number(pt?.x) || 0,
      y: Number(pt?.y) || 0,
      z: Number(pt?.z) || 0
    });
  }
  if (typeof plot3d.createProjector !== 'function') {
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
        bounds: {
          minX: 0,
          maxX: 0,
          minY: 0,
          maxY: 0
        },
        scale: 1,
        offsets: {
          x: baseX,
          y: baseY
        },
        plotSize: {
          width,
          height
        }
      };
    };
  }
  if (typeof plot3d.renderAxesAndGrid !== 'function') {
    plot3d.renderAxesAndGrid = () => null;
  }
  if (typeof plot3d.applyLegendPointerGuards !== 'function') {
    plot3d.applyLegendPointerGuards = (el) => {
      if (el && typeof el.addEventListener === 'function') {
        el.addEventListener('pointerdown', evt => evt?.stopPropagation?.());
      }
    };
  }
  if (typeof plot3d.isLegendPointerTarget !== 'function') {
    plot3d.isLegendPointerTarget = () => false;
  }
  if (typeof plot3d.isInteractivePointerTarget !== 'function') {
    plot3d.isInteractivePointerTarget = (target) => plot3d.isLegendPointerTarget(target);
  }
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const exportFontStyles = (scopeId, options) => (fontControls && typeof fontControls.exportScopeStyles === 'function') ?
    fontControls.exportScopeStyles(scopeId, options) :
    null;
  const importFontStyles = (scopeId, styles, options) => {
    if (fontControls && typeof fontControls.importScopeStyles === 'function') {
      fontControls.importScopeStyles(scopeId, styles, {
        prune: true,
        ...(options || {})
      });
    }
  };
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  const formControls = Shared.formControls = Shared.formControls || {};
  if ((typeof gridControls.show !== 'function' || typeof gridControls.registerGraphElement !== 'function') && typeof require === 'function') {
    try {
      require('../shared/gridControls.js');
    } catch (err) {
      debugLog('Debug: pca component gridControls helper require failed', {
        message: err?.message || String(err)
      });
    }
  }
  const notesHelper = Shared.notes = Shared.notes || {};
  if (typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function') {
    try {
      require('../shared/notes.js');
    } catch (err) {
      debugLog('Debug: pca component notes helper require failed', {
        message: err?.message || String(err)
      });
    }
  }
  const notesState = {
    text: '',
    open: false,
    control: null
  };
  const dataTransformsApi = Shared.dataTransforms = Shared.dataTransforms || {};
  if (typeof dataTransformsApi.applyTransform !== 'function' && typeof require === 'function') {
    try {
      require('../shared/dataTransforms.js');
    } catch (err) {
      debugLog('Debug: pca component dataTransforms helper require failed', {
        message: err?.message || String(err)
      });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if (typeof dataViewsApi.createManager !== 'function' && typeof require === 'function') {
    try {
      require('../shared/dataViews.js');
    } catch (err) {
      debugLog('Debug: pca component dataViews helper require failed', {
        message: err?.message || String(err)
      });
    }
  }
  pca.__installed = true;
  pca.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if (!fileIO.saveGraphFile) {
    debugLog('Debug: pca component awaiting Shared.fileIO helpers');
  }
  if (!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function') {
    debugLog('Debug: pca component awaiting Shared.tableImport helpers');
  }

  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 9;
  const DEFAULT_VIEW_MODE = '2d';
  const PCA_3D_DEFAULTS = {
    rotationX: 0.24,
    rotationY: 1.96,
    aspectRatio: 4 / 3
  };
  const DEFAULT_AXIS_COLOR = '#000000';
  const DEFAULT_GRID_COLOR = '#dddddd';
  const MIN_MINOR_TICK_SUBDIVISIONS = 1;
  const MAX_MINOR_TICK_SUBDIVISIONS = 9;
  const DEFAULT_MINOR_TICK_SUBDIVISIONS = Number.isFinite(chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS) ?
    chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS :
    3;

  function clampMinorTickSubdivisions(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
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
  if (typeof palette.ensureDefaultScatterColors !== 'function' && typeof require === 'function') {
    try {
      require('../shared/palette.js');
    } catch (err) {
      // ignore palette preload failures
    }
  }
  const DEFAULT_SCATTER_COLORS = typeof palette.ensureDefaultScatterColors === 'function' ?
    palette.ensureDefaultScatterColors() :
    (Array.isArray(palette.DEFAULT_SCATTER_COLORS) && palette.DEFAULT_SCATTER_COLORS.length ?
      palette.DEFAULT_SCATTER_COLORS :
      global.DEFAULT_SCATTER_COLORS);
  if (Array.isArray(DEFAULT_SCATTER_COLORS) && DEFAULT_SCATTER_COLORS.length) {
    palette.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
    global.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
  }
  const GROUP_SHAPE_OPTIONS = Shared.getShapePickerOptions ?
    Shared.getShapePickerOptions() :
    Object.freeze([{
      value: 'circle',
      label: 'Circle'
    }, {
      value: 'square',
      label: 'Square'
    }, {
      value: 'triangle',
      label: 'Triangle'
    }, {
      value: 'diamond',
      label: 'Diamond'
    }, {
      value: 'cross',
      label: 'Cross'
    }]);
  const GROUP_SHAPE_DEFAULTS = GROUP_SHAPE_OPTIONS.map(opt => opt.value);
  const GROUP_SHAPE_VALUES = Shared.getShapePickerValues ?
    Shared.getShapePickerValues() :
    new Set(GROUP_SHAPE_DEFAULTS);
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
  const PCA_DEFAULT_COMPONENT_SELECTION_RULE = 'all';
  const PCA_DEFAULT_EIGEN_THRESHOLD = 1;
  const PCA_DEFAULT_PARALLEL_ITERATIONS = 200;
  const PCA_MAX_PARALLEL_ITERATIONS = 500;
  const PCA_PARALLEL_MAX_CELLS = 40000;
  const PCA_BIPLOT_POINT_LIMIT = 120;
  const PCA_BIPLOT_VECTOR_LIMIT = 8;
  const MDS_CACHED_DIMENSIONS = 3;
  const PCA_PREPROCESSING_NONE = 'none';
  const PCA_PREPROCESSING_RNASEQ_LOG = 'rna-seq-normalized-log';
  const PCA_RNASEQ_TRANSFORM_TYPE = 'rnaSeqNormalizedLog';
  const PCA_RNASEQ_VIEW_TITLE = 'RNA-seq log (filtered genes)';
  const PCA_RNASEQ_TOP_VARIABLE_FEATURES = 500;
  const PCA_COMPONENT_SELECTION_RULES = Object.freeze([{
    value: 'parallel',
    label: 'Parallel analysis'
  }, {
    value: 'kaiser',
    label: 'Kaiser > 1'
  }, {
    value: 'threshold',
    label: 'Eigenvalue threshold'
  }, {
    value: 'all',
    label: 'Show all components'
  }]);
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

  function resolvePcaMethodNameForUi(methodValue) {
    const normalized = String(methodValue || '').trim().toLowerCase();
    if (normalized === 'mds' || normalized === 'tsne' || normalized === 'umap') {
      return normalized;
    }
    return 'pca';
  }

  function applyPcaMethodUiPreActivation(config = {}) {
    const methodName = resolvePcaMethodNameForUi(config?.method);
    const supports3d = methodName === 'pca' || methodName === 'mds';
    const requestedView = String(config?.viewMode || DEFAULT_VIEW_MODE).trim().toLowerCase();
    const viewMode = supports3d ? (requestedView === '3d' ? '3d' : '2d') : '2d';

    const tsneControls = getPcaNodeById('pcaTsneControls');
    if (tsneControls) {
      const showTsne = methodName === 'tsne';
      tsneControls.hidden = !showTsne;
      tsneControls.style.display = showTsne ? '' : 'none';
    }

    const umapControls = getPcaNodeById('pcaUmapControls');
    if (umapControls) {
      const showUmap = methodName === 'umap';
      umapControls.hidden = !showUmap;
      umapControls.style.display = showUmap ? '' : 'none';
    }

    const viewModeSelect = getPcaNodeById('pcaViewMode');
    if (viewModeSelect && viewModeSelect.options) {
      Array.from(viewModeSelect.options).forEach(opt => {
        if (opt && opt.value === '3d') {
          opt.disabled = !supports3d;
          opt.hidden = !supports3d;
        }
      });
      viewModeSelect.value = viewMode;
    }

    const axis3dControl = getPcaNodeById('pcaAxis3DControl');
    if (axis3dControl) {
      const show3dAxis = viewMode === '3d';
      axis3dControl.hidden = !show3dAxis;
      axis3dControl.style.display = show3dAxis ? '' : 'none';
    }
    const methodAdvanced = getPcaNodeById('pcaMethodAdvancedSection');
    if (methodAdvanced) {
      const showAdvanced = methodName === 'pca';
      methodAdvanced.hidden = !showAdvanced;
      methodAdvanced.style.display = showAdvanced ? '' : 'none';
    }
  }

  function normalizePcaLabelHeader(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function normalizePcaMetaHeader(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function isPcaGroupRowHeader(value) {
    const normalized = normalizePcaMetaHeader(value);
    return normalized === 'group' || normalized === 'groups';
  }

  function isPcaSampleRowHeader(value) {
    const normalized = normalizePcaMetaHeader(value);
    return normalized === 'sample' ||
      normalized === 'samples' ||
      normalized === 'variable' ||
      normalized === 'variables';
  }

  function isPcaGroupedModeActive(options = {}) {
    if (options.forceGrouped === true) {
      return true;
    }
    if (options.forceStandard === true) {
      return false;
    }
    const format = options.tableFormat ?? pcaState?.tableFormat;
    return format === 'grouped';
  }

  function getPcaHeaderRowIndexForMode(options = {}) {
    return isPcaGroupedModeActive(options) ? PCA_GROUPED_SAMPLE_ROW_INDEX : PCA_HEADER_ROW_INDEX;
  }

  function getPcaPinnedMetaRowCountForMode(options = {}) {
    return getPcaHeaderRowIndexForMode(options) + 1;
  }

  function isPcaLabelRowHeader(value) {
    const normalized = normalizePcaLabelHeader(value);
    const base = normalizePcaLabelHeader(PCA_POINT_LABEL_ROW_HEADER);
    return normalized === base ||
      normalized === `${base}s` ||
      normalized === 'labelpoint';
  }

  function parsePcaPointLabelFlag(value) {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) && value !== 0;
    }
    const text = String(value).trim();
    if (!text) {
      return false;
    }
    if (text === PCA_POINT_LABEL_MARK) {
      return true;
    }
    const normalized = text.toLowerCase();
    return normalized === '1' ||
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'y' ||
      normalized === 'x';
  }

  function resolvePcaLabelRowIndex(data, options = {}) {
    if (!Array.isArray(data) || !data.length) {
      return null;
    }
    const maxMetaRow = getPcaHeaderRowIndexForMode(options);
    for (let rowIndex = 0; rowIndex <= maxMetaRow; rowIndex += 1) {
      const row = Array.isArray(data[rowIndex]) ? data[rowIndex] : null;
      if (row && isPcaLabelRowHeader(row[0])) {
        return rowIndex;
      }
    }
    return null;
  }

  function resolvePcaHeaderRowIndex(data, labelRowIndex, options = {}) {
    const preferredHeader = getPcaHeaderRowIndexForMode(options);
    if (!Array.isArray(data) || !data.length) {
      return preferredHeader;
    }
    if (labelRowIndex === preferredHeader) {
      return preferredHeader === PCA_GROUPED_SAMPLE_ROW_INDEX ?
        PCA_HEADER_ROW_INDEX :
        PCA_GROUPED_SAMPLE_ROW_INDEX;
    }
    return preferredHeader;
  }

  function resolvePcaDataStartRow(labelRowIndex, headerRowIndex, options = {}) {
    const headerIdx = Number.isInteger(headerRowIndex) ?
      headerRowIndex :
      getPcaHeaderRowIndexForMode(options);
    const groupedActive = isPcaGroupedModeActive(options);
    const groupIdx = groupedActive ? PCA_GROUP_ROW_INDEX : -1;
    const labelIdx = Number.isInteger(labelRowIndex) ? labelRowIndex : -1;
    return Math.max(headerIdx, groupIdx, labelIdx) + 1;
  }

  function normalizePcaLabelRowValues(values, colCount) {
    const length = Math.max(1, colCount | 0);
    const normalized = new Array(length).fill(false);
    normalized[0] = PCA_POINT_LABEL_ROW_HEADER;
    if (Array.isArray(values)) {
      for (let c = 1; c < length; c += 1) {
        normalized[c] = parsePcaPointLabelFlag(values[c]);
      }
    }
    return normalized;
  }

  function applyPcaRowValues(hot, rowIndex, values, options = {}) {
    if (!hot || !Number.isInteger(rowIndex)) {
      return false;
    }
    const data = hot.getData?.() || [];
    const colCount = typeof hot.countCols === 'function' ?
      hot.countCols() :
      (Array.isArray(data[0]) ? data[0].length : 0);
    if (colCount <= 0) {
      return false;
    }
    const source = options.source || 'pca-row-values';
    if (typeof hot.setDataAtCell !== 'function') {
      return false;
    }
    const changes = [];
    for (let c = 0; c < colCount; c += 1) {
      changes.push([rowIndex, c, (Array.isArray(values) && c < values.length) ? values[c] : '']);
    }
    if (changes.length) {
      hot.setDataAtCell(changes, source);
      return true;
    }
    return false;
  }

  function applyPcaCellValue(hot, rowIndex, colIndex, value, options = {}) {
    if (!hot || !Number.isInteger(rowIndex) || !Number.isInteger(colIndex)) {
      return false;
    }
    const source = options.source || 'pca-cell-value';
    if (typeof hot.setDataAtCell !== 'function') {
      return false;
    }
    hot.setDataAtCell([
      [rowIndex, colIndex, value]
    ], source);
    return true;
  }

  function isPcaCellEmpty(value) {
    if (value === null || value === undefined) {
      return true;
    }
    const text = String(value).trim();
    return text === '';
  }

  function pcaRowHasContent(row, startCol = 0) {
    if (!Array.isArray(row)) {
      return false;
    }
    for (let c = Math.max(0, startCol); c < row.length; c += 1) {
      if (!isPcaCellEmpty(row[c])) {
        return true;
      }
    }
    return false;
  }

  function ensurePcaEmptyTableDefaults(hot, options = {}) {
    if (!hot || typeof hot.getData !== 'function') {
      return false;
    }
    const data = hot.getData() || [];
    const colCount = typeof hot.countCols === 'function' ?
      hot.countCols() :
      (Array.isArray(data[0]) ? data[0].length : 0);
    if (colCount <= 0) {
      return false;
    }
    const groupedActive = isPcaGroupedModeActive();
    const labelRowIndex = resolvePcaLabelRowIndex(data, {
      forceGrouped: groupedActive
    });
    const headerRowIndex = resolvePcaHeaderRowIndex(data, labelRowIndex, {
      forceGrouped: groupedActive
    });
    const dataStartRow = resolvePcaDataStartRow(labelRowIndex, headerRowIndex, {
      forceGrouped: groupedActive
    });
    let hasData = false;
    for (let r = dataStartRow; r < data.length; r += 1) {
      const row = Array.isArray(data[r]) ? data[r] : [];
      for (let c = 0; c < row.length; c += 1) {
        if (!isPcaCellEmpty(row[c])) {
          hasData = true;
          break;
        }
      }
      if (hasData) {
        break;
      }
    }
    const groupRow = groupedActive && Array.isArray(data[PCA_GROUP_ROW_INDEX]) ? data[PCA_GROUP_ROW_INDEX] : [];
    const sampleRow = Number.isInteger(headerRowIndex) && Array.isArray(data[headerRowIndex]) ? data[headerRowIndex] : [];
    const headerHasValue = groupedActive ?
      (pcaRowHasContent(groupRow, 1) || pcaRowHasContent(sampleRow, 1)) :
      pcaRowHasContent(sampleRow, 1);
    if (hasData || headerHasValue) {
      return false;
    }
    const labelRowValues = normalizePcaLabelRowValues(null, colCount);
    const headerRowValues = new Array(colCount).fill('');
    headerRowValues[0] = groupedActive ? PCA_SAMPLE_ROW_HEADER : 'Variable';
    const source = options.source || 'pca-empty-defaults';
    const labelApplied = applyPcaRowValues(hot, PCA_LABEL_ROW_INDEX, labelRowValues, {
      source,
      render: false
    });
    let groupApplied = false;
    if (groupedActive) {
      const groupRowValues = new Array(colCount).fill('');
      groupRowValues[0] = PCA_GROUP_ROW_HEADER;
      groupApplied = applyPcaRowValues(hot, PCA_GROUP_ROW_INDEX, groupRowValues, {
        source,
        render: false
      });
    }
    const headerApplied = applyPcaRowValues(hot, headerRowIndex, headerRowValues, {
      source,
      render: false
    });
    if ((labelApplied || groupApplied || headerApplied) && typeof hot.render === 'function') {
      hot.render();
    }
    return labelApplied || groupApplied || headerApplied;
  }

  function ensurePcaLabelRow(hot, options = {}) {
    if (!hot || typeof hot.getData !== 'function') {
      return false;
    }
    const data = hot.getData() || [];
    const colCount = typeof hot.countCols === 'function' ?
      hot.countCols() :
      (Array.isArray(data[0]) ? data[0].length : 0);
    if (colCount <= 0) {
      return false;
    }
    const source = options.source || 'pca-label-row';
    const groupedActive = isPcaGroupedModeActive();
    const setRowValues = (rowIndex, values) => {
      if (!Array.isArray(values)) {
        return;
      }
      applyPcaRowValues(hot, rowIndex, values, {
        source,
        render: false
      });
    };
    if (!groupedActive) {
      const row0 = Array.isArray(data[PCA_LABEL_ROW_INDEX]) ? data[PCA_LABEL_ROW_INDEX] : null;
      if (row0 && isPcaLabelRowHeader(row0[0])) {
        if (row0[0] !== PCA_POINT_LABEL_ROW_HEADER) {
          const updated = applyPcaCellValue(hot, PCA_LABEL_ROW_INDEX, 0, PCA_POINT_LABEL_ROW_HEADER, {
            source,
            render: true
          });
          return !!updated;
        }
        return false;
      }
      const row1 = Array.isArray(data[PCA_HEADER_ROW_INDEX]) ? data[PCA_HEADER_ROW_INDEX] : null;
      if (row1 && isPcaLabelRowHeader(row1[0])) {
        const headerRow = Array.isArray(data[PCA_LABEL_ROW_INDEX]) ? data[PCA_LABEL_ROW_INDEX] : [];
        const nextLabelRow = normalizePcaLabelRowValues(row1, colCount);
        const nextHeaderRow = new Array(colCount).fill('');
        for (let c = 0; c < colCount; c += 1) {
          if (headerRow[c] !== undefined) {
            nextHeaderRow[c] = headerRow[c];
          }
        }
        setRowValues(PCA_LABEL_ROW_INDEX, nextLabelRow);
        setRowValues(PCA_HEADER_ROW_INDEX, nextHeaderRow);
        if (typeof hot.render === 'function') {
          hot.render();
        }
        return true;
      }
      if (typeof hot.alter === 'function') {
        hot.alter('insert_row_above', PCA_LABEL_ROW_INDEX, 1, source);
      }
      setRowValues(PCA_LABEL_ROW_INDEX, normalizePcaLabelRowValues(null, colCount));
      if (typeof hot.render === 'function') {
        hot.render();
      }
      return true;
    }

    let changed = false;
    let workingData = data;
    let labelRowIndex = resolvePcaLabelRowIndex(workingData, {
      forceGrouped: true
    });
    if (!Number.isInteger(labelRowIndex)) {
      if (typeof hot.alter === 'function') {
        hot.alter('insert_row_above', PCA_LABEL_ROW_INDEX, 1, source);
      }
      changed = true;
      workingData = hot.getData() || [];
      labelRowIndex = PCA_LABEL_ROW_INDEX;
    } else if (labelRowIndex !== PCA_LABEL_ROW_INDEX) {
      const row0Current = Array.isArray(workingData[PCA_LABEL_ROW_INDEX]) ?
        workingData[PCA_LABEL_ROW_INDEX].slice(0, colCount) :
        new Array(colCount).fill('');
      const labelValues = normalizePcaLabelRowValues(workingData[labelRowIndex], colCount);
      setRowValues(PCA_LABEL_ROW_INDEX, labelValues);
      setRowValues(labelRowIndex, row0Current);
      changed = true;
      workingData = hot.getData() || [];
    }

    const normalizedLabelRow = normalizePcaLabelRowValues(workingData[PCA_LABEL_ROW_INDEX], colCount);
    const currentLabelRow = Array.isArray(workingData[PCA_LABEL_ROW_INDEX]) ? workingData[PCA_LABEL_ROW_INDEX] : [];
    const needsLabelNormalize = normalizedLabelRow.some((value, idx) => value !== currentLabelRow[idx]);
    if (needsLabelNormalize) {
      setRowValues(PCA_LABEL_ROW_INDEX, normalizedLabelRow);
      changed = true;
      workingData = hot.getData() || [];
    }

    const existingRow1 = Array.isArray(workingData[PCA_GROUP_ROW_INDEX]) ? workingData[PCA_GROUP_ROW_INDEX] : [];
    const row1LooksGroup = isPcaGroupRowHeader(existingRow1[0]);
    const row1LooksSample = isPcaSampleRowHeader(existingRow1[0]);
    const row1HasSampleContent = pcaRowHasContent(existingRow1, 1);
    if (!row1LooksGroup && (row1LooksSample || row1HasSampleContent)) {
      if (typeof hot.alter === 'function') {
        hot.alter('insert_row_above', PCA_GROUP_ROW_INDEX, 1, source);
      }
      changed = true;
      workingData = hot.getData() || [];
    }

    if ((workingData.length || 0) <= PCA_GROUP_ROW_INDEX && typeof hot.alter === 'function') {
      hot.alter('insert_row_above', PCA_GROUP_ROW_INDEX, 1, source);
      changed = true;
      workingData = hot.getData() || [];
    }
    if ((workingData.length || 0) <= PCA_GROUPED_SAMPLE_ROW_INDEX && typeof hot.alter === 'function') {
      hot.alter('insert_row_above', PCA_GROUPED_SAMPLE_ROW_INDEX, 1, source);
      changed = true;
      workingData = hot.getData() || [];
    }

    const groupRow = Array.isArray(workingData[PCA_GROUP_ROW_INDEX]) ?
      workingData[PCA_GROUP_ROW_INDEX].slice(0, colCount) :
      new Array(colCount).fill('');
    if (String(groupRow[0] ?? '').trim() !== PCA_GROUP_ROW_HEADER) {
      groupRow[0] = PCA_GROUP_ROW_HEADER;
      setRowValues(PCA_GROUP_ROW_INDEX, groupRow);
      changed = true;
      workingData = hot.getData() || [];
    }

    const sampleRow = Array.isArray(workingData[PCA_GROUPED_SAMPLE_ROW_INDEX]) ?
      workingData[PCA_GROUPED_SAMPLE_ROW_INDEX].slice(0, colCount) :
      new Array(colCount).fill('');
    if (!isPcaSampleRowHeader(sampleRow[0])) {
      sampleRow[0] = PCA_SAMPLE_ROW_HEADER;
      setRowValues(PCA_GROUPED_SAMPLE_ROW_INDEX, sampleRow);
      changed = true;
    }

    if (changed && typeof hot.render === 'function') {
      hot.render();
    }
    return changed;
  }

  function PcaLabelCheckboxRenderer() {}
  PcaLabelCheckboxRenderer.prototype.init = function(params) {
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
  PcaLabelCheckboxRenderer.prototype.getGui = function() {
    return this.eGui;
  };
  PcaLabelCheckboxRenderer.prototype.refresh = function(params) {
    this.params = params;
    if (this.syncState) {
      this.syncState(params?.value);
      return true;
    }
    return false;
  };

  function parsePcaAgVisualRowIndex(value) {
    if (Number.isInteger(value) && value >= 0) {
      return value;
    }
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      const direct = Number(trimmed);
      return Number.isInteger(direct) && direct >= 0 ? direct : null;
    }
    const prefixed = trimmed.match(/^[A-Za-z][A-Za-z0-9_-]*-(\d+)$/);
    if (prefixed) {
      const parsed = Number(prefixed[1]);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }
    const suffixed = trimmed.match(/^[A-Za-z][A-Za-z0-9_-]*(\d+)$/);
    if (suffixed) {
      const parsed = Number(suffixed[1]);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }
    return null;
  }

  function getDefaultTitleForMethod(method) {
    const key = typeof method === 'string' ? method.toLowerCase() : '';
    return PCA_DEFAULT_TITLES[key] || 'Dimension Reduction Plot';
  }

  const pcaRefs = {};
  const pcaOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'pca',
    message: 'Rendering PCA workspace...',
    isHeavy: Shared.loadingOverlay?.createTableHeavyPredicate?.({
      getHot: () => ensurePcaHotForActiveTab(),
      startRow: 1,
      startCol: 1,
      rowThreshold: 1000,
      cellThreshold: 5000
    }),
    getTabId: () => getPcaProjectionTabId() || null,
    getHost: () => (
      pcaSvgBoxRef ||
      getPcaNodeById('pcaGraphPanel')?.querySelector?.('.svgbox') ||
      getPcaNodeById('pcaGraphPanel')
    )
  });

  function markPcaOverlayPending(reason) {
    pcaOverlayController?.markPending(reason);
    debugLog('Debug: pca overlay pending flagged', {
      reason: reason || 'data-change'
    });
  }

  function queuePcaOverlay(reason, options = {}) {
    return pcaOverlayController?.queue(reason, options) || false;
  }

  function resolvePcaOverlay(reason) {
    pcaOverlayController?.resolve(reason);
  }

  function forcePcaOverlay(reason, options = {}) {
    return pcaOverlayController?.force(reason, options) || false;
  }
  let pcaTooltipEl = null;
  let pcaShowPointFormatControls = null;
  let pcaLegendControl = null;
  let pcaShowLegendInput = null;
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
  let pcaRoot = null;
  let pcaDataToolbarBound = false;
  const pcaDataToolbarLastActivationByTabId = new Map();
  let ensurePcaDomBindings = () => false;

  // Transient active-tab DOM projection. Durable values remain in the owning PCA session.
  let pcaPlotDiv = null;
  let pcaSvgBox = null;
  let pcaEls = {
    tableFormat: null,
    groupedControls: null,
    groupedReplicates: null,
    groupedList: null,
    groupedAdd: null,
    groupedRemove: null
  };
  let pcaLayout = null;
  let pcaLoadingsContainer = null;
  let pcaLoadingsTable = null;
  let pcaLoadingsLimitInput = null;
  let pcaLoadingsLimitVal = null;
  let pcaLoadingsActions = null;
  let pcaDefaultLoadingsActionsHost = null;
  let lastLoadingsRender = null;
  let pcaScreeVarianceRow = null;
  let pcaVarianceSummary = null;
  let pcaVarianceList = null;
  let pcaViewMode = null;
  let pcaXAxis = null;
  let pcaYAxis = null;
  let pcaZAxis = null;
  let pcaAxis2DControls = null;
  let pcaAxis3DControl = null;
  let pcaMethod = null;
  let pcaFill = null;
  let pcaBorder = null;
  let pcaBorderWidth = null;
  let pcaDotSize = null;
  let pcaAlpha = null;
  let pcaTsneControls = null;
  let pcaTsnePerplexity = null;
  let pcaTsneLearningRate = null;
  let pcaTsneIterations = null;
  let pcaTsneExaggeration = null;
  let pcaUmapControls = null;
  let pcaUmapNeighbors = null;
  let pcaUmapMinDist = null;
  let pcaUmapLearningRate = null;
  let pcaUmapEpochs = null;
  let pcaAlphaVal = null;
  let pcaComponentRuleInput = null;
  let pcaEigenThresholdInput = null;
  let pcaParallelIterationsInput = null;
  let pcaIncludeNonRetainedAxesInput = null;
  let pcaIncludeNonRetainedAxesLabel = null;
  let pcaEigenThresholdLabel = null;
  let pcaParallelIterationsLabel = null;
  let pcaMethodAdvancedSection = null;
  let lastPcaViewMode = DEFAULT_VIEW_MODE;
  let pcaFontSize = null;
  let pcaFontSizeVal = null;
  let pcaShowGrid = null;
  let pcaShowFrame = null;
  let pcaShowLegend = null;
  let pcaStandardizeVariables = null;
  let pcaEqualAxisLengthsInput = null;
  let pcaPreprocessing = null;
  let pcaStatsResults = null;
  let pcaStatsSummary = null;
  let pcaScreeContainer = null;
  let pcaScreePlot = null;
  let pcaScreeExportControls = null;
  let pcaScreeShowParallelInput = null;
  let pcaEigenTableContainer = null;
  let pcaEigenTableWrapper = null;
  let pcaExportEigenTableBtn = null;
  let pcaDefaultEigenExportHost = null;

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer ?
    Shared.graphViewport.createEnsurer('pca') :
    (svg, options = {}) => {
      const helper = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if (typeof helper === 'function') {
        helper(svg, {
          component: 'pca',
          debugLabel: 'pca-viewport-fallback',
          ...options
        });
        return;
      }
      debugLog('Debug: pca ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };

  function resolvePcaRoot(tabLike) {
    return Shared.workspaceTabs?.resolveComponentRoot?.({
      tabLike: tabLike || null,
      componentKey: 'pca',
      currentRoot: pcaRoot,
      staticRootId: 'pcaPage'
    }) || null;
  }

  function queryPcaRoot(selector, tabLike) {
    const root = resolvePcaRoot(tabLike);
    if (!root || !selector) {
      return null;
    }
    return root.querySelector?.(selector) || null;
  }

  function getPcaNodeById(id, tabLike) {
    if (!id) {
      return null;
    }
    const root = resolvePcaRoot(tabLike);
    if (root?.getElementById) {
      const byId = root.getElementById(id);
      if (byId) {
        return byId;
      }
    }
    return root?.querySelector?.(`#${id}`) || null;
  }

  function resolvePcaDrawableFrame(plotEl) {
    const plot = plotEl || getPcaNodeById('pcaPlot');
    const svgBox = pcaSvgBoxRef ||
      plot?.closest?.('.svgbox') ||
      queryPcaRoot('#pcaGraphPanel .svgbox') ||
      null;
    const frame = Shared.componentLayout?.resolveDrawableFrame?.({
      componentName: 'pca',
      plot,
      svgBox,
      graphPanel: queryPcaRoot('#pcaGraphPanel')
    });
    if (frame) {
      return frame;
    }
    return {
      width: Math.max(0, Number(plot?.clientWidth) || 0),
      height: Math.max(0, Number(plot?.clientHeight) || 0),
      rawWidth: Math.max(0, Number(plot?.clientWidth) || 0),
      rawHeight: Math.max(0, Number(plot?.clientHeight) || 0),
      constrained: false,
      source: 'plot-fallback',
      authority: 'plot-fallback',
      svgBox,
      viewport: null,
      zoomScale: 1
    };
  }

  function ensurePcaGroupedDefaults() {
    if (!pcaState.grouped || typeof pcaState.grouped !== 'object') {
      pcaState.grouped = {
        replicatesPerGroup: 2
      };
    }
    let replicates = Number(pcaState.grouped.replicatesPerGroup);
    if (!Number.isFinite(replicates) || replicates < 1) {
      replicates = 1;
    }
    pcaState.grouped.replicatesPerGroup = Math.max(1, Math.round(replicates));
    debugLog('Debug: pca ensureGroupedDefaults', {
      replicates: pcaState.grouped.replicatesPerGroup
    });
  }

  function inferPcaGroupBaseName(rawValue, fallback) {
    const fallbackLabel = typeof fallback === 'string' && fallback.trim() ? fallback.trim() : 'Group 1';
    const source = rawValue == null ? '' : String(rawValue).trim();
    if (!source) {
      return fallbackLabel;
    }
    if (/^group\s*\d+\s*$/i.test(source)) {
      return source.replace(/\s+/g, ' ').trim();
    }
    let normalized = source.replace(/\s+title\s*$/i, '').trim();
    if (!normalized) {
      normalized = source;
    }
    if (/^condition\s*\d+$/i.test(normalized) || /^col(?:umn)?\s*\d+$/i.test(normalized) || /^rep(?:licate)?\s*\d+$/i.test(normalized)) {
      return fallbackLabel;
    }
    return normalized;
  }

  function normalizePcaGroupHeaderAnchor(rawValue) {
    const source = rawValue == null ? '' : String(rawValue).trim();
    if (!source) {
      return '';
    }
    if (/^condition\s*\d+$/i.test(source) || /^col(?:umn)?\s*\d+$/i.test(source) || /^rep(?:licate)?\s*\d+$/i.test(source)) {
      return '';
    }
    if (/^group\s*\d+\s*title$/i.test(source)) {
      return '';
    }
    const titleMatch = source.match(/^(.*\S)\s+title$/i);
    if (titleMatch) {
      const stripped = titleMatch[1].trim();
      if (!stripped || /^group\s*\d+$/i.test(stripped)) {
        return '';
      }
      return stripped;
    }
    return source;
  }

  function getPcaGroupedReplicateCount(options = {}) {
    const candidate = options.replicates ?? pcaState.grouped?.replicatesPerGroup;
    const raw = Number(candidate);
    if (!Number.isFinite(raw) || raw < 1) {
      return 1;
    }
    return Math.max(1, Math.round(raw));
  }

  function getPcaGroupedGroupCount(sampleColCount, replicates) {
    const safeSampleCols = Math.max(0, Number(sampleColCount) || 0);
    const safeReplicates = Math.max(1, Number(replicates) || 1);
    if (safeSampleCols <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(safeSampleCols / safeReplicates));
  }

  function getPcaGroupedHeaderInfo(colIndex, hotInstance, options = {}) {
    const col = Number(colIndex);
    if (!Number.isInteger(col) || col < 1) {
      return null;
    }
    const groupedActive = options.forceGrouped === true ? true : pcaState.tableFormat === 'grouped';
    if (!groupedActive) {
      return null;
    }
    ensurePcaGroupedDefaults();
    const hot = hotInstance || ensurePcaHotForActiveTab();
    const totalCols = hot && typeof hot.countCols === 'function' ? hot.countCols() : 0;
    if (totalCols <= 1 || col >= totalCols) {
      return null;
    }
    const replicates = getPcaGroupedReplicateCount(options);
    const sampleColCount = Math.max(0, totalCols - 1);
    const groupCount = getPcaGroupedGroupCount(sampleColCount, replicates);
    const offset = col - 1;
    const groupIndex = Math.floor(offset / replicates);
    if (groupIndex < 0 || groupIndex >= groupCount) {
      return null;
    }
    const startCol = 1 + groupIndex * replicates;
    const span = Math.max(1, Math.min(replicates, totalCols - startCol));
    const position = col - startCol;
    if (position < 0 || position >= span) {
      return null;
    }
    const role = position === 0 ? 'groupAnchor' : 'groupFollower';
    let segment = 'single';
    if (role === 'groupAnchor') {
      segment = span > 1 ? 'start' : 'single';
    } else {
      segment = position === span - 1 ? 'end' : 'middle';
    }
    return {
      groupIndex,
      span,
      role,
      segment,
      startCol
    };
  }

  function getPcaGroupedHeaderCellRole(colIndex, hotInstance, options = {}) {
    const info = getPcaGroupedHeaderInfo(colIndex, hotInstance, options);
    return info ? info.role : null;
  }

  function getPcaGroupedHeaderMergeSegment(colIndex, hotInstance, options = {}) {
    const info = getPcaGroupedHeaderInfo(colIndex, hotInstance, options);
    return info ? info.segment : null;
  }

  function getPcaGroupedHeaderEntries(hotInstance, options = {}) {
    const hot = hotInstance || ensurePcaHotForActiveTab();
    const replicates = getPcaGroupedReplicateCount(options);
    const data = Array.isArray(options.dataMatrix) ?
      options.dataMatrix :
      (hot?.getData ? (hot.getData() || []) : []);
    const headerRow = Array.isArray(data[PCA_GROUP_ROW_INDEX]) ? data[PCA_GROUP_ROW_INDEX] : [];
    const totalCols = Number.isInteger(options.colCount) ?
      options.colCount :
      (typeof hot?.countCols === 'function' ? hot.countCols() : headerRow.length);
    const sampleCols = Math.max(0, totalCols - 1);
    const minGroupCount = Number(options.minGroupCount);
    const groupCount = Number.isFinite(minGroupCount) && minGroupCount > 0 ?
      Math.max(1, Math.floor(minGroupCount)) :
      getPcaGroupedGroupCount(sampleCols, replicates);
    const entries = [];
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const startCol = 1 + groupIndex * replicates;
      if (startCol >= totalCols) {
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

  function getPcaGroupedNamesFromHot(hotInstance) {
    if (pcaState.tableFormat !== 'grouped') {
      return [];
    }
    return getPcaGroupedHeaderEntries(hotInstance || pcaHotInstance, {
        forceGrouped: true
      })
      .map(entry => entry.label || `Group ${entry.groupIndex + 1}`);
  }

  function getPcaGroupedSampleLabelsFromHot(hotInstance) {
    if (pcaState.tableFormat !== 'grouped') {
      return [];
    }
    const data = hotInstance?.getData?.() || pcaHotInstance?.getData?.() || [];
    const sampleRow = Array.isArray(data[PCA_GROUPED_SAMPLE_ROW_INDEX]) ? data[PCA_GROUPED_SAMPLE_ROW_INDEX] : [];
    return sampleRow.slice();
  }

  function applyPcaGroupedNamesToHot(hotInstance, names, options = {}) {
    const hot = hotInstance || pcaHotInstance;
    if (!hot || !Array.isArray(names) || !names.length) {
      return false;
    }
    const replicates = getPcaGroupedReplicateCount();
    const changes = [
      [PCA_GROUP_ROW_INDEX, 0, PCA_GROUP_ROW_HEADER]
    ];
    names.forEach((name, idx) => {
      const col = 1 + idx * replicates;
      const label = typeof name === 'string' && name.trim() ? name.trim() : `Group ${idx + 1}`;
      changes.push([PCA_GROUP_ROW_INDEX, col, label]);
      for (let rep = 1; rep < replicates; rep += 1) {
        changes.push([PCA_GROUP_ROW_INDEX, col + rep, '']);
      }
    });
    hot.setDataAtCell(changes, options.source || 'pca-grouped-name-restore');
    return true;
  }

  function applyPcaGroupedSampleLabelsToHot(hotInstance, labels, options = {}) {
    const hot = hotInstance || pcaHotInstance;
    if (!hot || !Array.isArray(labels) || !labels.length) {
      return false;
    }
    const next = labels.slice();
    next[0] = PCA_SAMPLE_ROW_HEADER;
    applyPcaRowValues(hot, PCA_GROUPED_SAMPLE_ROW_INDEX, next, {
      source: options.source || 'pca-grouped-sample-label-restore',
      render: false
    });
    return true;
  }

  function normalizePcaGroupedHeaderRow(hotInstance, options = {}) {
    const hot = hotInstance || ensurePcaHotForActiveTab();
    if (!hot || typeof hot.getData !== 'function' || typeof hot.setDataAtCell !== 'function') {
      return false;
    }
    const groupedActive = options.forceGrouped === true ? true : pcaState.tableFormat === 'grouped';
    if (!groupedActive) {
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
    for (let col = headerRow.length; col < targetCols; col += 1) {
      changes.push([PCA_GROUP_ROW_INDEX, col, '']);
    }
    groupEntries.forEach((entry) => {
      const currentRaw = headerRow[entry.startCol] != null ? String(headerRow[entry.startCol]).trim() : '';
      const normalizedAnchor = normalizePcaGroupHeaderAnchor(currentRaw);
      const nextAnchor = normalizedAnchor || entry.label || `Group ${entry.groupIndex + 1}`;
      if (currentRaw !== nextAnchor) {
        changes.push([PCA_GROUP_ROW_INDEX, entry.startCol, nextAnchor]);
      }
      for (let repIndex = 1; repIndex < replicates; repIndex += 1) {
        const followerCol = entry.startCol + repIndex;
        if (followerCol >= targetCols) {
          break;
        }
        const followerValue = headerRow[followerCol];
        if (followerValue != null && String(followerValue).trim() !== '') {
          changes.push([PCA_GROUP_ROW_INDEX, followerCol, '']);
        }
      }
    });
    if (!changes.length) {
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

  function buildPcaGroupedAgColHeaders(hotInstance, options = {}) {
    const pcaHot = hotInstance || ensurePcaHotForActiveTab();
    if (!pcaHot || typeof pcaHot.countCols !== 'function') {
      return true;
    }
    const groupedActive = options.forceGrouped === true ? true : pcaState.tableFormat === 'grouped';
    if (!groupedActive) {
      return true;
    }
    const totalCols = Math.max(0, pcaHot.countCols());
    if (totalCols <= 0) {
      return true;
    }
    const headers = new Array(totalCols).fill('');
    headers[0] = '';
    for (let col = 1; col < totalCols; col += 1) {
      const info = getPcaGroupedHeaderInfo(col, pcaHot, {
        forceGrouped: true,
        ...options
      });
      if (!info) {
        headers[col] = '';
        continue;
      }
      headers[col] = info.role === 'groupAnchor' ?
        `Group ${info.groupIndex + 1}` :
        ' ';
    }
    return headers;
  }

  function buildPcaGroupedColumnGroups(hotInstance, options = {}) {
    const pcaHot = hotInstance || ensurePcaHotForActiveTab();
    if (!pcaHot || typeof pcaHot.countCols !== 'function') {
      return null;
    }
    const groupedActive = options.forceGrouped === true ? true : pcaState.tableFormat === 'grouped';
    if (!groupedActive) {
      return null;
    }
    const groups = getPcaGroupedHeaderEntries(pcaHot, {
        forceGrouped: true,
        ...options
      })
      .map(entry => ({
        startCol: entry.startCol,
        span: entry.colspan
      }))
      .filter(entry => Number.isInteger(entry.startCol) && entry.startCol >= 1 && Number(entry.span) > 1);
    return groups.length ? groups : null;
  }

  function buildPcaTableFormatSignature(hotInstance, options = {}) {
    const pcaHot = hotInstance || ensurePcaHotForActiveTab();
    const tableFormat = options.tableFormat || pcaState.tableFormat || 'standard';
    const colCount = typeof pcaHot?.countCols === 'function' ? pcaHot.countCols() : '';
    if (tableFormat !== 'grouped') {
      return `standard:${colCount}`;
    }
    return `grouped:${getPcaGroupedReplicateCount({ ...options, hotInstance: pcaHot })}:${colCount}`;
  }

  function updatePcaGroupedHeaders(hotInstance) {
    const pcaHot = hotInstance || ensurePcaHotForActiveTab();
    if (!pcaHot) {
      debugLog('Debug: pca updateGroupedHeaders skipped', {
        reason: 'no-hot'
      });
      return;
    }
    const hotRoot = pcaHot.rootElement ||
      pcaHot.__pcaHostContainer ||
      getPcaNodeById('pcaHot');
    if (hotRoot?.classList) {
      hotRoot.classList.remove('pca-grouped-nested-only');
    }
    if (hotRoot?.style) {
      if (pcaState.tableFormat === 'grouped') {
        const replicates = getPcaGroupedReplicateCount();
        hotRoot.style.setProperty('--scatter-group-span', String(replicates));
      } else {
        hotRoot.style.removeProperty('--scatter-group-span');
      }
    }
    if (pcaState.tableFormat !== 'grouped') {
      const signature = buildPcaTableFormatSignature(pcaHot, {
        tableFormat: 'standard'
      });
      if (pcaHot.__pcaAppliedTableFormatSignature === signature) {
        return;
      }
      pcaHot.updateSettings({
        nestedHeaders: false,
        colHeaders: true,
        columnGroups: null,
        headerRowIndex: PCA_HEADER_ROW_INDEX,
        pinFirstRow: getPcaPinnedMetaRowCountForMode({
          forceStandard: true
        })
      });
      pcaHot.__pcaAppliedTableFormatSignature = signature;
      return;
    }
    const signature = buildPcaTableFormatSignature(pcaHot, {
      tableFormat: 'grouped',
      forceGrouped: true
    });
    if (pcaHot.__pcaAppliedTableFormatSignature === signature) {
      return;
    }
    normalizePcaGroupedHeaderRow(pcaHot, {
      forceGrouped: true,
      source: 'pca-grouped-header-normalize'
    });
    const headers = buildPcaGroupedAgColHeaders(pcaHot, {
      forceGrouped: true
    });
    pcaHot.updateSettings({
      nestedHeaders: false,
      colHeaders: headers,
      columnGroups: buildPcaGroupedColumnGroups(pcaHot, {
        forceGrouped: true
      }),
      headerRowIndex: getPcaHeaderRowIndexForMode({
        forceGrouped: true
      }),
      pinFirstRow: getPcaPinnedMetaRowCountForMode({
        forceGrouped: true
      })
    });
    pcaHot.__pcaAppliedTableFormatSignature = signature;
    debugLog('Debug: pca grouped headers applied', {
      headers,
      totalCols: pcaHot.countCols()
    });
  }

  function applyPcaTableFormatToHot(hotInstance) {
    const pcaHot = hotInstance || ensurePcaHotForActiveTab();
    if (!pcaHot) {
      return;
    }
    if (pcaState.tableFormat === 'grouped') {
      ensurePcaLabelRow(pcaHot, {
        source: 'pca-grouped-metadata'
      });
      normalizePcaGroupedHeaderRow(pcaHot, {
        forceGrouped: true,
        source: 'pca-grouped-header-normalize'
      });
      updatePcaGroupedHeaders(pcaHot);
    } else {
      if (typeof pcaHot.getData === 'function' && typeof pcaHot.alter === 'function') {
        const currentData = pcaHot.getData() || [];
        const row1 = Array.isArray(currentData[PCA_GROUP_ROW_INDEX]) ? currentData[PCA_GROUP_ROW_INDEX] : null;
        const row2 = Array.isArray(currentData[PCA_GROUPED_SAMPLE_ROW_INDEX]) ? currentData[PCA_GROUPED_SAMPLE_ROW_INDEX] : null;
        const shouldCollapseGroupedRows = !!row1 &&
          isPcaGroupRowHeader(row1[0]) &&
          !!row2 &&
          (isPcaSampleRowHeader(row2[0]) || pcaRowHasContent(row2, 1));
        if (shouldCollapseGroupedRows) {
          pcaHot.alter('remove_row', PCA_GROUP_ROW_INDEX, 1, 'pca-standard-metadata-normalize');
        }
      }
      ensurePcaLabelRow(pcaHot, {
        source: 'pca-standard-metadata'
      });
      const standardHeader = pcaHot.getData?.()?.[PCA_HEADER_ROW_INDEX];
      if (Array.isArray(standardHeader) && String(standardHeader[0] ?? '').trim() !== 'Variable') {
        applyPcaCellValue(pcaHot, PCA_HEADER_ROW_INDEX, 0, 'Variable', {
          source: 'pca-standard-metadata',
          render: false
        });
      }
      pcaHot.updateSettings({
        nestedHeaders: false,
        colHeaders: true,
        columnGroups: null,
        headerRowIndex: PCA_HEADER_ROW_INDEX,
        pinFirstRow: getPcaPinnedMetaRowCountForMode({
          forceStandard: true
        })
      });
      debugLog('Debug: pca grouped headers cleared');
    }
  }

  function createPcaTableInstance(container, ownerMeta = {}) {
    if (!container || typeof Shared.hot?.createStandardTable !== 'function') {
      return null;
    }
    const pcaData = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
    if (Array.isArray(pcaData[0])) {
      pcaData[0][0] = PCA_POINT_LABEL_ROW_HEADER;
      for (let c = 1; c < pcaData[0].length; c += 1) {
        pcaData[0][c] = false;
      }
    }
    debugLog('Debug: pca default header suppressed - awaiting user paste', {
      rows: pcaData.length,
      cols: pcaData[0]?.length || 0
    });
    let pcaHot = null;
    const scheduleDrawPcaProxy = (payload) => {
      const meta = payload && typeof payload === 'object' ?
        payload :
        (typeof payload === 'string' ? {
          reason: payload
        } : {});
      const reason = meta.reason || 'hot-change';
      const source = meta.source || null;
      if (source === 'pca-point-label-toggle') {
        return;
      }
      const invalidate = typeof meta.invalidate === 'string' ? meta.invalidate : 'data';
      const options = {
        ...meta,
        reason
      };
      const shouldSuppressPending = reason === 'afterLoadData' ||
        source === 'loadData' ||
        source === 'pca-label-row' ||
        source === 'pca-empty-defaults' ||
        source === 'pca-loadData';
      if (!Object.prototype.hasOwnProperty.call(options, 'markPending') && shouldSuppressPending) {
        options.markPending = false;
      }
      if (invalidate === 'data') {
        markPcaDataDirty(reason);
      } else {
        markPcaViewDirty(reason);
      }
      schedulePcaDrawForSession(getPcaSessionForHot(pcaHot, options, {
        create: false
      }) || getActivePcaSessionForState(), options);
    };
    pcaHot = Shared.hot.createStandardTable(container, {
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS
    }, scheduleDrawPcaProxy, {
      debugLabel: 'pca',
      data: pcaData,
      pinFirstColumn: true,
      firstRowClassName: 'hot-header-row htCenter',
      headerRowIndex: PCA_HEADER_ROW_INDEX,
      pinFirstRow: getPcaPinnedMetaRowCountForMode({
        forceStandard: true
      }),
      scheduleOnLoadData: true,
      suppressScheduleForSource(source) {
        return /^(pca-grouped-header-normalize|pca-label-row|pca-empty-defaults|pca-loadData)$/i.test(String(source || ''));
      },
      colDefEnhancer(def, meta) {
        const colIndex = meta?.colIndex;
        if (!Number.isInteger(colIndex) || !def || typeof def !== 'object') {
          return def;
        }
        const existingEditable = def.editable;
        def.editable = params => {
          const physicalRow = params?.data?.__rowIndex;
          if (physicalRow === PCA_LABEL_ROW_INDEX) {
            return false;
          }
          if (physicalRow === PCA_GROUP_ROW_INDEX && pcaState.tableFormat === 'grouped') {
            const role = getPcaGroupedHeaderCellRole(colIndex, pcaHot);
            if (role === 'groupFollower') {
              return false;
            }
          }
          return typeof existingEditable === 'function' ?
            existingEditable(params) :
            existingEditable !== false;
        };
        const existingCellStyle = def.cellStyle;
        def.cellStyle = params => {
          let baseStyle = {};
          if (typeof existingCellStyle === 'function') {
            const resolved = existingCellStyle(params);
            if (resolved && typeof resolved === 'object') {
              baseStyle = Object.assign({}, resolved);
            }
          } else if (existingCellStyle && typeof existingCellStyle === 'object') {
            baseStyle = Object.assign({}, existingCellStyle);
          }
          const physicalRow = params?.data?.__rowIndex;
          if (
            Number.isInteger(physicalRow) &&
            physicalRow >= PCA_LABEL_ROW_INDEX &&
            physicalRow <= getPcaHeaderRowIndexForMode()
          ) {
            baseStyle.backgroundColor = '#f5f5f5';
          }
          if (physicalRow === PCA_LABEL_ROW_INDEX && colIndex >= 1) {
            baseStyle.cursor = 'pointer';
          }
          if (physicalRow === PCA_GROUP_ROW_INDEX && pcaState.tableFormat === 'grouped' && colIndex >= 1) {
            const role = getPcaGroupedHeaderCellRole(colIndex, pcaHot);
            if (role === 'groupAnchor') {
              baseStyle.textAlign = 'center';
              baseStyle.justifyContent = 'center';
              baseStyle.fontWeight = '600';
            } else if (role === 'groupFollower') {
              baseStyle.textAlign = 'center';
              baseStyle.justifyContent = 'center';
            }
          }
          return baseStyle;
        };
        const baseRules = def.cellClassRules && typeof def.cellClassRules === 'object' ?
          Object.assign({}, def.cellClassRules) :
          {};
        baseRules['pca-grouped-meta-row'] = params => (
          Number.isInteger(params?.data?.__rowIndex) &&
          params.data.__rowIndex >= PCA_LABEL_ROW_INDEX &&
          params.data.__rowIndex <= getPcaHeaderRowIndexForMode()
        );
        baseRules['pca-label-row-divider'] = params => (
          Number.isInteger(params?.data?.__rowIndex) &&
          params.data.__rowIndex === PCA_LABEL_ROW_INDEX
        );
        baseRules['pca-label-checkbox-cell'] = params => (
          params?.data?.__rowIndex === PCA_LABEL_ROW_INDEX &&
          colIndex >= 1
        );
        baseRules['pca-grouped-header-row-divider'] = params => (
          pcaState.tableFormat === 'grouped' &&
          params?.data?.__rowIndex === PCA_GROUP_ROW_INDEX
        );
        def.cellClassRules = baseRules;
        if (colIndex < 1) {
          return def;
        }
        const existingColSpan = def.colSpan;
        def.colSpan = params => {
          const physicalRow = params?.data?.__rowIndex;
          if (physicalRow === PCA_GROUP_ROW_INDEX && pcaState.tableFormat === 'grouped') {
            const info = getPcaGroupedHeaderInfo(colIndex, pcaHot, {
              forceGrouped: true
            });
            if (info?.role === 'groupAnchor') {
              return info.span;
            }
          }
          if (typeof existingColSpan === 'function') {
            return existingColSpan(params);
          }
          return Number.isFinite(existingColSpan) && existingColSpan > 0 ?
            Math.floor(existingColSpan) :
            1;
        };
        const existingSelector = def.cellRendererSelector;
        def.cellRendererSelector = params => {
          const physicalRow = params?.data?.__rowIndex;
          if (physicalRow === PCA_LABEL_ROW_INDEX && colIndex >= 1) {
            return {
              component: PcaLabelCheckboxRenderer
            };
          }
          return typeof existingSelector === 'function' ? existingSelector(params) : undefined;
        };
        const existingHeaderClass = def.headerClass;
        def.headerClass = params => {
          const classes = [];
          const pushClass = value => {
            if (!value) {
              return;
            }
            if (Array.isArray(value)) {
              value.forEach(pushClass);
              return;
            }
            if (typeof value === 'string') {
              value.split(/\s+/).filter(Boolean).forEach(token => classes.push(token));
            }
          };
          if (typeof existingHeaderClass === 'function') {
            pushClass(existingHeaderClass(params));
          } else {
            pushClass(existingHeaderClass);
          }
          if (pcaState.tableFormat === 'grouped') {
            const role = getPcaGroupedHeaderCellRole(colIndex, pcaHot);
            if (role === 'groupAnchor' || role === 'groupFollower') {
              classes.push('pca-group-colheader');
              const segment = getPcaGroupedHeaderMergeSegment(colIndex, pcaHot);
              if (segment === 'start') {
                classes.push('pca-group-colheader-merge-start');
              } else if (segment === 'middle') {
                classes.push('pca-group-colheader-merge-middle');
              } else if (segment === 'end') {
                classes.push('pca-group-colheader-merge-end');
              }
            }
          }
          return classes;
        };
        const existingRules = def.cellClassRules && typeof def.cellClassRules === 'object' ?
          Object.assign({}, def.cellClassRules) :
          {};
        existingRules['pca-grouped-header-anchor'] = params => {
          if (params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX) {
            return false;
          }
          return getPcaGroupedHeaderCellRole(colIndex, pcaHot) === 'groupAnchor';
        };
        existingRules['pca-grouped-header-follower'] = params => {
          if (params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX) {
            return false;
          }
          return getPcaGroupedHeaderCellRole(colIndex, pcaHot) === 'groupFollower';
        };
        existingRules['pca-grouped-header-merge-start'] = params => {
          if (params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX) {
            return false;
          }
          return getPcaGroupedHeaderMergeSegment(colIndex, pcaHot) === 'start';
        };
        existingRules['pca-grouped-header-merge-middle'] = params => {
          if (params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX) {
            return false;
          }
          return getPcaGroupedHeaderMergeSegment(colIndex, pcaHot) === 'middle';
        };
        existingRules['pca-grouped-header-merge-end'] = params => {
          if (params?.data?.__rowIndex !== PCA_GROUP_ROW_INDEX) {
            return false;
          }
          return getPcaGroupedHeaderMergeSegment(colIndex, pcaHot) === 'end';
        };
        def.cellClassRules = existingRules;
        return def;
      },
      hotOptions: {
        contextMenu: true,
        afterSelectionEnd() {
          activatePcaDataToolbar('table-selection');
        },
        afterPaste(data) {
          const activeHot = ensurePcaHotForActiveTab();
          ensurePcaLabelRow(activeHot, {
            source: 'pca-paste'
          });
          const nextRows = activeHot?.getData?.().length || pcaData.length;
          const nextCols = activeHot?.countCols?.() || (Array.isArray(data?.[0]) ? data[0].length : DEFAULT_COLS);
          updatePcaDataShape({
            rows: nextRows,
            cols: nextCols
          });
          evaluateAutoDrawThresholds();
        },
        afterChange(changes, source) {
          if (Array.isArray(changes) && changes.length && pcaState.tableFormat === 'grouped') {
            const headerTouched = changes.some(change => Number(change?.[0]) === PCA_GROUP_ROW_INDEX);
            if (headerTouched && source !== 'pca-grouped-header-normalize') {
              normalizePcaGroupedHeaderRow(pcaHot, {
                source: 'pca-grouped-header-normalize'
              });
            }
            if (headerTouched || source === 'pca-grouped-header-normalize') {
              updatePcaGroupedHeaders(pcaHot);
            }
          }
          if (Array.isArray(changes) && changes.length) {
            syncPcaActiveDataViewFromHot(pcaHot, 'afterChange');
            const sourceText = String(source || '').trim();
            if (sourceText === 'pca-point-label-toggle' && changes.every(change => (
                Number(change?.[0]) === PCA_LABEL_ROW_INDEX && Number(change?.[1]) >= 1
              ))) {
              refreshPcaManualLabelsFromChanges(pcaHot, changes, sourceText);
            }
            // All ordinary analysis invalidation and drawing is owned by the shared
            // table schedule proxy. Keeping a second component-local scheduler here
            // caused duplicate PCA draws and bypassed analysis-inert edit filtering.
          }
          const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
          if (!debugEnabled) {
            return;
          }
          const changeCount = Array.isArray(changes) ? changes.length : 0;
          debugLog('Debug: pca table afterChange', {
            count: changeCount,
            source
          });
        },
        afterLoadData() {
          if (pcaHot) {
            pcaHot.__pcaAppliedTableFormatSignature = null;
          }
          if (pcaState.tableFormat === 'grouped') {
            normalizePcaGroupedHeaderRow(pcaHot, {
              source: 'pca-grouped-header-normalize'
            });
            updatePcaGroupedHeaders(pcaHot);
          }
          // Shared.hot emits the single load schedule after this projection hook.
          syncPcaActiveDataViewFromHot(pcaHot, 'afterLoadData');
        },
        afterCreateCol() {
          if (pcaState.tableFormat === 'grouped') {
            normalizePcaGroupedHeaderRow(pcaHot, {
              source: 'pca-grouped-header-normalize'
            });
            updatePcaGroupedHeaders(pcaHot);
          }
          // Shared.hot classifies the insertion and schedules only when its
          // position changes the active analysis schema.
          syncPcaActiveDataViewFromHot(pcaHot, 'afterChange');
        },
        afterRemoveCol() {
          if (pcaState.tableFormat === 'grouped') {
            normalizePcaGroupedHeaderRow(pcaHot, {
              source: 'pca-grouped-header-normalize'
            });
            updatePcaGroupedHeaders(pcaHot);
          }
          syncPcaActiveDataViewFromHot(pcaHot, 'afterChange');
          // Shared.hot owns the structural invalidation and draw schedule.
        },
        afterUndo() {
          if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
            debugLog('Debug: pca table undo');
          }
        },
        afterRedo() {
          if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
            debugLog('Debug: pca table redo');
          }
        }
      }
    });
    if (pcaHot) {
      Shared.hot?.stampTableOwner?.(pcaHot, {
        tabId: ownerMeta?.tabId || Shared.hot?.resolveTableTabId?.({
          type: 'pca',
          container,
          component: pca,
          reason: 'pca-create-table-owner'
        }) || null,
        type: 'pca',
        container,
        wrapper: ownerMeta?.wrapper || container?.parentElement || null
      });
      pcaHot.__pcaHostContainer = container || null;
      if (container && typeof container.addEventListener === 'function') {
        if (typeof container.__pcaLabelClickToggleHandler === 'function') {
          container.removeEventListener('pointerdown', container.__pcaLabelClickToggleHandler, true);
          container.__pcaLabelClickToggleHandler = null;
          container.__pcaLabelClickToggleBound = false;
        }
        const clickHandler = evt => {
          if (evt?.button != null && evt.button !== 0) {
            return;
          }
          const target = evt?.target;
          const cell = target && typeof target.closest === 'function' ? target.closest('.ag-cell') : null;
          if (!cell) {
            return;
          }
          const colId = cell.getAttribute?.('col-id');
          if (typeof colId !== 'string' || !/^c\d+$/.test(colId)) {
            return;
          }
          const colIndex = Number(colId.slice(1));
          if (!Number.isInteger(colIndex) || colIndex < 1) {
            return;
          }
          const rowAttr = cell.getAttribute?.('row-index') ||
            cell.closest?.('.ag-row')?.getAttribute?.('row-index') ||
            null;
          const visualRow = parsePcaAgVisualRowIndex(rowAttr);
          if (visualRow !== PCA_LABEL_ROW_INDEX) {
            return;
          }
          const hot = pcaHot;
          if (!hot) {
            return;
          }
          const data = hot.getData?.() || [];
          const labelRowIndex = resolvePcaLabelRowIndex(data);
          if (!Number.isInteger(labelRowIndex) || labelRowIndex < 0) {
            return;
          }
          const current = data[labelRowIndex]?.[colIndex];
          const next = !parsePcaPointLabelFlag(current);
          const source = 'pca-point-label-toggle';
          const applied = applyPcaCellValue(hot, labelRowIndex, colIndex, next, {
            source,
            render: false
          });
          if (!applied) {
            return;
          }
          debugLog('Debug: pca label toggle via cell click', {
            row: labelRowIndex,
            col: colIndex,
            next
          });
        };
        container.addEventListener('pointerdown', clickHandler, true);
        container.__pcaLabelClickToggleBound = true;
        container.__pcaLabelClickToggleHandler = clickHandler;
      }
      Shared.hot?.withPayloadSyncSuppressed ?
        Shared.hot.withPayloadSyncSuppressed(pcaHot, () => ensurePcaEmptyTableDefaults(pcaHot, {
          source: 'pca-init'
        })) :
        ensurePcaEmptyTableDefaults(pcaHot, {
          source: 'pca-init'
        });
    }
    if (pcaHot && typeof pcaHot.loadData === 'function' && !pcaHot.__pcaPatched) {
      const originalLoadData = pcaHot.loadData;
      pcaHot.loadData = function patchedPcaLoadData() {
        const dataset = arguments[0];
        let rows = 0;
        let cols = 0;
        if (Array.isArray(dataset)) {
          rows = dataset.length;
          cols = Array.isArray(dataset[0]) ? dataset[0].length : 0;
        }
        if (rows || cols) {
          updatePcaDataShape({
            rows,
            cols
          });
        }
        const start = nowMs();
        const result = originalLoadData.apply(this, arguments);
        const labelAdjusted = Shared.hot?.withPayloadSyncSuppressed ?
          Shared.hot.withPayloadSyncSuppressed(this, () => ensurePcaLabelRow(this, {
            source: 'pca-loadData'
          })) :
          ensurePcaLabelRow(this, {
            source: 'pca-loadData'
          });
        if (Shared.hot?.withPayloadSyncSuppressed) {
          Shared.hot.withPayloadSyncSuppressed(this, () => ensurePcaEmptyTableDefaults(this, {
            source: 'pca-loadData'
          }));
        } else {
          ensurePcaEmptyTableDefaults(this, {
            source: 'pca-loadData'
          });
        }
        if (labelAdjusted) {
          const nextRows = typeof this.countRows === 'function' ?
            this.countRows() :
            (this.getData?.()?.length || rows);
          const nextCols = typeof this.countCols === 'function' ?
            this.countCols() :
            cols;
          rows = Math.max(rows, nextRows);
          cols = Math.max(cols, nextCols);
          updatePcaDataShape({
            rows,
            cols
          });
        }
        const afterLoad = nowMs();
        const evaluationStart = afterLoad;
        const evaluationMeta = rows || cols ? {
          source: 'load-data',
          shape: {
            rows,
            cols
          }
        } : {
          source: 'load-data'
        };
        evaluateAutoDrawThresholds(evaluationMeta);
        const afterEvaluation = nowMs();
        recordPcaPerformance('loadData', {
          rows,
          cols,
          totalMs: afterEvaluation - start,
          hotMs: afterLoad - start,
          evaluationMs: afterEvaluation - evaluationStart
        });
        // Shared.hot owns load scheduling, including suppression during atomic
        // DataView projection. This wrapper records PCA-specific shape/performance only.
        return result;
      };
      pcaHot.__pcaPatched = true;
    }
    return pcaHot;
  }

  function ensurePcaHotForActiveTab() {
    const candidateTabId = getPcaProjectionTabId() ||
      resolvePcaOwnedRuntimeTabId(null, {}) ||
      Shared.workspaceTabs?.getActiveSessionInfo?.('pca')?.tabId ||
      global.Main?.session?.workspaceState?.activeTabId ||
      null;
    const wrapper = getPcaNodeById('pcaHotWrapper', candidateTabId) || getPcaNodeById('pcaHotWrapper');
    const baseContainer = getPcaNodeById('pcaHot', candidateTabId) || getPcaNodeById('pcaHot');
    const activeTabId = (wrapper || baseContainer) ?
      (Shared.hot?.resolveTableTabId?.({
        type: 'pca',
        tabId: candidateTabId || null,
        component: pca,
        wrapper,
        container: baseContainer,
        reason: 'pca-ensure-hot'
      }) || candidateTabId || null) :
      (candidateTabId || null);
    if (typeof Shared.hot?.ensureTableForTab !== 'function') {
      if (!pcaHotInstance && baseContainer && typeof Shared.hot?.createStandardTable === 'function') {
        pcaHotInstance = createPcaTableInstance(baseContainer);
        pcaState.hot = pcaHotInstance;
      }
      if (pcaHotInstance) {
        pcaHotInstance.__pcaHostContainer = baseContainer || pcaHotInstance.__pcaHostContainer || null;
        pcaHotInstance.__pcaTabId = activeTabId;
        ensurePcaDataViewsForHot(pcaHotInstance, {
          wrapper,
          container: pcaHotInstance.__pcaHostContainer || baseContainer || null
        });
        syncPcaActiveDataViewFromHot(pcaHotInstance, 'ensure-active-tab');
        syncPcaSessionManagersFromActive(getPcaProjectionSession({
          reason: 'pca-projection-mutation'
        }));
      }
      return pcaHotInstance;
    }
    if (!wrapper || !baseContainer) {
      const poolEntry = activeTabId ?
        Shared.hot?.__tabTablePools?.pca?.byTab?.[activeTabId] :
        null;
      return poolEntry?.instance || pcaHotInstance || null;
    }
    const entry = Shared.hot.ensureTableForTab({
      type: 'pca',
      tabId: activeTabId || null,
      wrapper,
      container: baseContainer,
      createInstance: createPcaTableInstance
    });
    if (entry?.instance) {
      pcaHotInstance = entry.instance;
      pcaState.hot = entry.instance;
    }
    if (pcaHotInstance) {
      pcaHotInstance.__pcaHostContainer = entry?.container || baseContainer || pcaHotInstance.__pcaHostContainer || null;
      pcaHotInstance.__pcaTabId = entry?.tabId || activeTabId;
      ensurePcaDataViewsForHot(pcaHotInstance, {
        wrapper,
        container: pcaHotInstance.__pcaHostContainer || baseContainer || null
      });
      syncPcaActiveDataViewFromHot(pcaHotInstance, 'ensure-active-tab');
      syncPcaSessionManagersFromActive(getPcaProjectionSession({
        reason: 'pca-projection-mutation'
      }));
    }
    return pcaHotInstance;
  }

  function activatePcaDataToolbar(reason) {
    const now = Date.now();
    const tabId = String(getPcaProjectionTabId() || Shared.workspaceTabs?.getActiveSessionInfo?.('pca')?.tabId || 'global');
    const lastActivation = Number(pcaDataToolbarLastActivationByTabId.get(tabId)) || 0;
    if (now - lastActivation < 80) {
      return false;
    }
    pcaDataToolbarLastActivationByTabId.set(tabId, now);
    const activated = !!Shared.workspaceToolbar?.activateSection?.('pca', 'Data');
    if (activated) {
      debugLog('Debug: pca data toolbar activated', {
        reason: reason || 'unknown'
      });
    }
    return activated;
  }

  function ensurePcaDataViewsForHot(hotInstance, options = {}) {
    if (!hotInstance || typeof hotInstance.getData !== 'function') {
      return null;
    }
    if (typeof Shared.dataViews?.createManager !== 'function') {
      return null;
    }
    if (!hotInstance.__pcaDataViewsManager) {
      hotInstance.__pcaDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'pca',
        maxViews: PCA_DATA_VIEW_MAX,
        initialData: hotInstance.getData() || [],
        onViewsChanged(meta) {
          const reason = String(meta?.reason || '').trim().toLowerCase();
          if (pcaState.applyingPayload || !reason || reason === 'initialize' || reason === 'deserialize') {
            return;
          }
          const ownerSession = getPcaSessionForHot(hotInstance, {
            reason: 'pca-data-view-persistence'
          }, {
            create: false,
            fallbackActive: false
          });
          if (ownerSession) {
            markPcaPayloadDirtyForSession(ownerSession, `pca-data-view-${reason}`);
          }
        },
        onActiveViewChanged(view, meta) {
          if (!view || !hotInstance || typeof hotInstance.loadData !== 'function') {
            return;
          }
          Shared.dataViews.applyViewToTable(hotInstance, view, {
            exclusionSource: 'pca-data-view-switch',
            filterReason: 'pca-data-view-switch'
          });
          const viewSession = getPcaSessionForHot(hotInstance, {
              reason: 'pca-data-view-switch'
            }, {
              create: false
            }) ||
            getActivePcaSessionForState();
          syncPcaPreprocessingModeForDataView(view, viewSession);
          markPcaDataDirty('data-view-switch', viewSession);
          markPcaOverlayPending('data-view-switch');
          schedulePcaDrawForSession(viewSession, {
            reason: 'data-view-switch',
            userInitiated: String(meta?.reason || '').trim().toLowerCase() === 'tab-click'
          });
        },
        onInteraction() {
          activatePcaDataToolbar('data-tab-interaction');
        }
      });
      debugLog('Debug: pca data views manager created', {
        tabId: hotInstance.__pcaTabId || null
      });
    }
    const manager = hotInstance.__pcaDataViewsManager;
    const hostWrapper = options.wrapper || getPcaNodeById('pcaHotWrapper');
    const hostContainer = options.container || hotInstance.__pcaHostContainer || getPcaNodeById('pcaHot');
    if (hostWrapper && hostContainer) {
      manager.mount({
        wrapper: hostWrapper,
        tableContainer: hostContainer
      });
      manager.refresh?.();
    }
    const managerOwnerSession = getPcaSessionForHot(hotInstance, {
        reason: 'pca-dataview-manager'
      }, {
        create: false
      }) ||
      getActivePcaSessionForState();
    if (managerOwnerSession) {
      managerOwnerSession.managers.hot = hotInstance;
      managerOwnerSession.managers.dataViews = manager;
      managerOwnerSession.updatedAt = Date.now();
    }
    syncPcaSessionManagersFromActive(getPcaProjectionSession({
      reason: 'pca-projection-mutation'
    }));
    return manager;
  }

  function syncPcaActiveDataViewFromHot(hotInstance, reason) {
    const hot = hotInstance || pcaHotInstance;
    if (!hot || typeof hot.getData !== 'function') {
      return;
    }
    if(Shared.dataViews?.isTableProjectionActive?.(hot)){
      return;
    }
    const manager = hot.__pcaDataViewsManager || null;
    if (!manager) {
      return;
    }
    manager.updateActiveData(hot.getData() || []);
    manager.updateActiveExclusions(hot?.exportExclusions?.() || null);
    manager.updateActiveFilters?.(hot?.exportFilters?.() || null);
    if (reason === 'afterLoadData') {
      manager.refresh?.();
    }
  }

  function isPcaRnaSeqDataView(view) {
    return String(view?.transformSpec?.type || '').trim().toLowerCase() ===
      PCA_RNASEQ_TRANSFORM_TYPE.toLowerCase();
  }

  function syncPcaPreprocessingModeForDataView(view, session = null) {
    const mode = isPcaRnaSeqDataView(view) ?
      PCA_PREPROCESSING_RNASEQ_LOG :
      PCA_PREPROCESSING_NONE;
    const owner = getPcaSessionOwnedState(session);
    owner.state.controls = normalizePcaRuntimeControls({
      ...(owner.state.controls || {}),
      preprocessing: mode,
      standardizeVariables: mode === PCA_PREPROCESSING_RNASEQ_LOG ? false : owner.state.controls?.standardizeVariables
    });
    persistPcaSessionOwnedState(owner.session, 'pca-data-view-preprocessing');
    if (shouldMirrorPcaSessionToActive(owner.session)) {
      pcaState.controls = normalizePcaRuntimeControls({
        ...(pcaState.controls || {}),
        preprocessing: mode,
        standardizeVariables: mode === PCA_PREPROCESSING_RNASEQ_LOG ? false : pcaState.controls?.standardizeVariables
      });
      const preprocessingInput = getPcaNodeById('pcaPreprocessing');
      if (preprocessingInput) {
        preprocessingInput.value = mode;
      }
      if (mode === PCA_PREPROCESSING_RNASEQ_LOG && pcaStandardizeVariables) {
        pcaStandardizeVariables.checked = false;
      }
      syncPcaPreprocessingUiState();
    }
    return mode;
  }

  function buildPcaRnaSeqTransformSpec(hot) {
    const exclusions = hot?.exportExclusions?.() || Shared.hot.exportExclusions?.(hot) || {};
    return {
      type: PCA_RNASEQ_TRANSFORM_TYPE,
      headerRows: getPcaPinnedMetaRowCountForMode(),
      startCol: 1,
      labelCol: 0,
      topFeatureLimit: PCA_RNASEQ_TOP_VARIABLE_FEATURES,
      excludedRows: Array.isArray(exclusions.rows) ? exclusions.rows : [],
      excludedCols: Array.isArray(exclusions.cols) ? exclusions.cols : [],
      excludedCells: Array.isArray(exclusions.cells) ? exclusions.cells : []
    };
  }

  function materializePcaRnaSeqDataView(options = {}) {
    const hot = options.hot || ensurePcaHotForActiveTab?.() || pcaHotInstance;
    if (!hot) {
      return false;
    }
    const manager = ensurePcaDataViewsForHot(hot, {
      wrapper: getPcaNodeById('pcaHotWrapper'),
      container: hot.__pcaHostContainer || getPcaNodeById('pcaHot')
    });
    if (!manager || typeof manager.applyTransform !== 'function') {
      return false;
    }
    const activeView = manager.getActiveView?.() || null;
    if (isPcaRnaSeqDataView(activeView)) {
      syncPcaPreprocessingModeForDataView(activeView, getPcaSessionForHot(hot, {}, { create: false }));
      return true;
    }
    syncPcaActiveDataViewFromHot(hot, 'rna-seq-transform-before');
    const transformSpec = buildPcaRnaSeqTransformSpec(hot);
    const result = manager.applyTransform(transformSpec, {
      title: PCA_RNASEQ_VIEW_TITLE,
      reason: options.reason || 'pca-rna-seq-transform',
      shareExclusions: false,
      exclusions: {
        rows: [],
        cols: transformSpec.excludedCols,
        cells: []
      }
    });
    if (!result?.ok) {
      syncPcaPreprocessingModeForDataView(activeView, getPcaSessionForHot(hot, {}, { create: false }));
      if (options.alertOnError !== false && typeof global.alert === 'function') {
        global.alert(`Unable to transform data: ${result?.error || 'RNA-seq normalization failed.'}`);
      }
      return false;
    }
    activatePcaDataToolbar('rna-seq-transform-applied');
    return true;
  }

  function applyPcaTransformToNewView(transformSpec, options = {}) {
    const hot = ensurePcaHotForActiveTab?.() || pcaHotInstance;
    if (!hot) {
      return false;
    }
    const manager = ensurePcaDataViewsForHot(hot, {
      wrapper: getPcaNodeById('pcaHotWrapper'),
      container: hot.__pcaHostContainer || getPcaNodeById('pcaHot')
    });
    if (!manager || typeof manager.applyTransform !== 'function') {
      console.warn('pca data transform skipped: Shared.dataViews unavailable');
      return false;
    }
    syncPcaActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyTransform(transformSpec, {
      title: options.title,
      reason: options.reason || 'toolbar-transform',
      transformOptions: Object.assign({},
        PCA_TRANSFORM_SCOPE_DEFAULT, {
          headerRows: getPcaPinnedMetaRowCountForMode()
        },
        options.transformOptions || {}
      )
    });
    if (!result?.ok) {
      const message = result?.error || 'Transformation failed.';
      if (typeof global.alert === 'function') {
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
    cpm: {
      spec: {
        type: 'cpm',
        orientation: 'column'
      },
      title: 'CPM'
    },
    log2p1: {
      spec: {
        type: 'log',
        base: 2,
        pseudoCount: 1
      },
      title: 'log2(x+1)'
    },
    centerRowsMean: {
      spec: {
        type: 'centerRows',
        method: 'mean'
      },
      title: 'Center rows (mean)'
    },
    centerRowsMedian: {
      spec: {
        type: 'centerRows',
        method: 'median'
      },
      title: 'Center rows (median)'
    },
    centerColsMean: {
      spec: {
        type: 'centerColumns',
        method: 'mean'
      },
      title: 'Center cols (mean)'
    },
    centerColsMedian: {
      spec: {
        type: 'centerColumns',
        method: 'median'
      },
      title: 'Center cols (median)'
    },
    normalizeRows: {
      spec: {
        type: 'normalizeRows'
      },
      title: 'Normalize rows (z)'
    },
    normalizeCols: {
      spec: {
        type: 'normalizeColumns'
      },
      title: 'Normalize cols (z)'
    }
  });

  function promptPcaCustomExpression() {
    const toolbarApi = Shared.workspaceToolbar || null;
    const expression = String(toolbarApi?.getCustomTransformExpression?.('pca') || '').trim();
    if (expression) {
      return expression;
    }
    toolbarApi?.openCustomTransformEditor?.('pca');
    if (typeof global.alert === 'function') {
      global.alert('Enter a custom transformation formula using x, then click "Apply custom".');
    }
    return null;
  }

  function resolvePcaToolbarTransformOption(optionKey, customExpression) {
    const key = String(optionKey || '').trim();
    if (!key) {
      return null;
    }
    if (key === 'custom') {
      const normalized = String(customExpression || '').trim();
      if (!normalized) {
        return null;
      }
      return {
        spec: {
          type: 'custom',
          expression: normalized
        },
        title: `Custom: ${normalized.slice(0, 24)}${normalized.length > 24 ? '...' : ''}`
      };
    }
    const preset = PCA_TRANSFORM_OPTION_MAP[key];
    if (!preset) {
      return null;
    }
    return {
      spec: Object.assign({}, preset.spec),
      title: preset.title
    };
  }

  function applyPcaTransformPipelineToNewView(transformSpecs, options = {}) {
    const hot = ensurePcaHotForActiveTab?.() || pcaHotInstance;
    if (!hot) {
      return false;
    }
    const manager = ensurePcaDataViewsForHot(hot, {
      wrapper: getPcaNodeById('pcaHotWrapper'),
      container: hot.__pcaHostContainer || getPcaNodeById('pcaHot')
    });
    if (!manager || typeof manager.applyPipeline !== 'function') {
      console.warn('pca data transform pipeline skipped: Shared.dataViews unavailable');
      return false;
    }
    const specs = Array.isArray(transformSpecs) ? transformSpecs.filter(Boolean) : [];
    if (!specs.length) {
      return false;
    }
    syncPcaActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyPipeline(specs, {
      title: options.title,
      reason: options.reason || 'toolbar-transform-pipeline',
      transformOptions: Object.assign({},
        PCA_TRANSFORM_SCOPE_DEFAULT, {
          headerRows: getPcaPinnedMetaRowCountForMode()
        },
        options.transformOptions || {}
      )
    });
    if (!result?.ok) {
      const message = result?.error || 'Transformation failed.';
      if (typeof global.alert === 'function') {
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

  function applyPcaSelectedTransforms() {
    const toolbarApi = Shared.workspaceToolbar || null;
    const selected = toolbarApi?.getSelectedTransforms?.('pca') || [];
    if (!Array.isArray(selected) || !selected.length) {
      return false;
    }
    const resolved = [];
    for (let i = 0; i < selected.length; i += 1) {
      const optionKey = selected[i];
      if (optionKey === 'custom') {
        const customExpression = promptPcaCustomExpression();
        if (!customExpression) {
          return false;
        }
        const customTransform = resolvePcaToolbarTransformOption('custom', customExpression);
        if (customTransform) {
          resolved.push(customTransform);
        }
        continue;
      }
      const next = resolvePcaToolbarTransformOption(optionKey);
      if (next) {
        resolved.push(next);
      }
    }
    if (!resolved.length) {
      return false;
    }
    const ok = resolved.length === 1 ?
      applyPcaTransformToNewView(resolved[0].spec, {
        title: resolved[0].title,
        reason: 'toolbar-transform-multi-single'
      }) :
      applyPcaTransformPipelineToNewView(
        resolved.map(item => item.spec), {
          reason: 'toolbar-transform-multi'
        }
      );
    if (ok) {
      toolbarApi?.clearSelectedTransforms?.('pca');
    }
    return ok;
  }

  function bindPcaControlHandler(node, eventName, key, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') {
      return false;
    }
    const eventKey = String(eventName || '').trim();
    if (!eventKey) {
      return false;
    }
    const storeKey = `${eventKey}:${String(key || 'handler')}`;
    const store = node.__pcaControlHandlers || (node.__pcaControlHandlers = {});
    const previous = store[storeKey];
    if (previous && typeof node.removeEventListener === 'function') {
      node.removeEventListener(eventKey, previous);
    }
    const wrapped = event => runPcaEventOwnerCallback(event, `pca-control-${String(key || 'handler')}`, owner => handler.call(node, event, owner));
    node.addEventListener(eventKey, wrapped);
    store[storeKey] = wrapped;
    return true;
  }

  function bindPcaDataToolbar() {
    if (pcaDataToolbarBound || !global.document) {
      return;
    }
    global.document.addEventListener('click', event => {
      const button = event.target?.closest?.(
        '#pcaTransformApplySelected, #pcaTransformCustomApply, #pcaTransformCpm, #pcaTransformLog2p1, #pcaTransformCenterRowsMean, #pcaTransformCenterRowsMedian, #pcaTransformCenterColsMean, #pcaTransformCenterColsMedian, #pcaTransformNormalizeRows, #pcaTransformNormalizeCols, #pcaTransformCustom'
      );
      if (!button) {
        return;
      }
      const transformSection = button.closest?.('.workspace-toolbar__section[data-transform-section="1"]');
      if (button.id === 'pcaTransformApplySelected') {
        applyPcaSelectedTransforms();
        return;
      }
      if (button.id === 'pcaTransformCustomApply') {
        const customExpression = promptPcaCustomExpression();
        if (!customExpression) {
          return;
        }
        const customTransform = resolvePcaToolbarTransformOption('custom', customExpression);
        if (!customTransform) {
          return;
        }
        if (transformSection?.dataset?.transformMultiMode === '1') {
          const selected = Shared.workspaceToolbar?.getSelectedTransforms?.('pca') || [];
          if (Array.isArray(selected) && selected.includes('custom')) {
            applyPcaSelectedTransforms();
          } else {
            applyPcaTransformToNewView(customTransform.spec, {
              title: customTransform.title
            });
          }
          return;
        }
        applyPcaTransformToNewView(customTransform.spec, {
          title: customTransform.title
        });
        return;
      }
      if (!transformSection) {
        return;
      }
      if (transformSection?.dataset?.transformMultiMode === '1') {
        return;
      }
      const optionKey = String(button.dataset?.transformOption || '').trim();
      if (!optionKey) {
        return;
      }
      if (optionKey === 'custom') {
        const customExpression = promptPcaCustomExpression();
        if (!customExpression) {
          return;
        }
        const customTransform = resolvePcaToolbarTransformOption(optionKey, customExpression);
        if (customTransform) {
          applyPcaTransformToNewView(customTransform.spec, {
            title: customTransform.title
          });
        }
        return;
      }
      const resolved = resolvePcaToolbarTransformOption(optionKey);
      if (resolved) {
        applyPcaTransformToNewView(resolved.spec, {
          title: resolved.title
        });
      }
    }, true);
    const wrapper = getPcaNodeById('pcaHotWrapper');
    if (wrapper && !wrapper.__pcaDataToolbarFocusBound) {
      wrapper.addEventListener('mousedown', () => {
        activatePcaDataToolbar('table-mousedown');
      }, true);
      wrapper.__pcaDataToolbarFocusBound = true;
    }
    pcaDataToolbarBound = true;
  }

  function refreshPcaResizerControlBindings() {
    const legendInput = getPcaNodeById('pcaShowLegend');
    if (legendInput) {
      pcaShowLegendInput = legendInput;
      const legendHost = legendInput.closest('label');
      if (legendHost) {
        pcaLegendControl = legendHost;
      }
    }
    if (!pcaSvgBoxRef || !pcaSvgBoxRef.isConnected) {
      const activeSvgBox = queryPcaRoot('#pcaGraphPanel .svgbox');
      if (activeSvgBox) {
        pcaSvgBoxRef = activeSvgBox;
      }
    }
  }

  function ensurePcaLegendControlPlacement() {
    refreshPcaResizerControlBindings();
    if (!pcaLegendControl || !pcaSvgBoxRef) {
      return;
    }
    if (Shared.resizer && typeof Shared.resizer.ensureLegendControlPlacement === 'function') {
      Shared.resizer.ensureLegendControlPlacement({
        svgBox: pcaSvgBoxRef,
        control: pcaLegendControl,
        debugLabel: 'pca-legend'
      });
    }
  }

  function ensurePcaMetricResizePolicy(reason = 'metric-resize-policy') {
    refreshPcaResizerControlBindings();
    const resizerApi = pcaSvgBoxRef?.__sharedResizableBoxApi || null;
    resizerApi?.setAspectLocked?.(true, {
      reason: `pca-${reason}`,
      preserveGeometry: true
    });
    debugLog('Debug: pca metric resize policy ensured', {
      reason,
      aspectLocked: pcaSvgBoxRef?.dataset?.resizerAspectLocked === 'true'
    });
  }

  function ensurePcaAxisLengthControlPlacement() {
    refreshPcaResizerControlBindings();
    if (!pcaSvgBoxRef) {
      return;
    }
    const doc = pcaSvgBoxRef.ownerDocument || global.document;
    if (!doc) {
      return;
    }
    let axesControl = pcaSvgBoxRef.querySelector('.resizer-axeslength-control');
    if (!axesControl) {
      axesControl = doc.createElement('details');
      axesControl.className = 'resizer-axeslength-control';
      const summary = doc.createElement('summary');
      summary.className = 'resizer-axeslength-summary';
      summary.textContent = 'Axes length';
      const menu = doc.createElement('div');
      menu.className = 'resizer-axeslength-menu';
      axesControl.appendChild(summary);
      axesControl.appendChild(menu);
    }

    const menu = axesControl.querySelector('.resizer-axeslength-menu');
    if (!menu) {
      return;
    }
    let equalAxisLengthsItem = menu.querySelector('.resizer-axeslength-item--equal-scale');
    if (!equalAxisLengthsItem) {
      equalAxisLengthsItem = doc.createElement('label');
      equalAxisLengthsItem.className = 'resizer-axeslength-item resizer-axeslength-item--equal-scale';
      const checkbox = doc.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-scale';
      const text = doc.createElement('span');
      text.className = 'resizer-axeslength-text';
      text.textContent = 'Equal axis lengths / same scale';
      equalAxisLengthsItem.appendChild(checkbox);
      equalAxisLengthsItem.appendChild(text);
      menu.appendChild(equalAxisLengthsItem);
    }
    equalAxisLengthsItem.title = 'Makes the plotting frame square in 2D (cubic in 3D) by padding shorter coordinate ranges. One unit keeps the same physical size on every axis, so distances, angles and clustering remain undistorted. Point coordinates are not rescaled.';
    const equalAxisLengthsCheckbox = equalAxisLengthsItem.querySelector('input[type="checkbox"]');
    if (equalAxisLengthsCheckbox) {
      equalAxisLengthsCheckbox.setAttribute('aria-label', 'Equal axis lengths with the same coordinate scale');
      equalAxisLengthsCheckbox.checked = !!pcaState.controls?.equalAxisLengths;
      pcaEqualAxisLengthsInput = equalAxisLengthsCheckbox;
      bindPcaControlHandler(equalAxisLengthsCheckbox, 'change', 'equal-axis-lengths', (_event, owner) => {
        const enabled = !!equalAxisLengthsCheckbox.checked;
        patchPcaRuntimeControlsForOwner(owner, {
          equalAxisLengths: enabled
        }, 'pca-equal-axis-lengths-change');
        debugLog('Debug: pca equal axis lengths toggled', {
          enabled,
          tabId: owner?.tabId || null
        });
        requestPcaViewRefresh('equal-axis-lengths-toggle', {
          tabId: owner?.tabId || undefined,
          userInitiated: true,
          viewOnly: true
        });
      });
    }

    Shared.resizer?.ensureGraphOptionsMenu?.({
      svgBox: pcaSvgBoxRef,
      controls: [axesControl],
      debugLabel: 'pca-axes-length',
      title: 'Graph options'
    });
  }

  function ensurePcaResizerControls() {
    refreshPcaResizerControlBindings();
    ensurePcaLegendControlPlacement();
    ensurePcaAxisLengthControlPlacement();
    ensurePcaMetricResizePolicy('resizer-controls');
  }

  function pcaTooltipDebug(label, payload) {
    try {
      if (typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()) {
        return;
      }
    } catch (err) {
      // ignore toggle errors and log by default
    }
    debugLog(label, payload);
  }

  function ensurePcaTooltipHost(tooltip, doc) {
    if (!tooltip) {
      return null;
    }
    const documentRef = doc || tooltip.ownerDocument || global.document;
    if (!documentRef) {
      return tooltip;
    }
    const parent = tooltip.parentElement;
    if (!parent) {
      return tooltip;
    }
    let needsDetach = false;
    if (typeof tooltip.closest === 'function') {
      const hiddenAncestor = tooltip.closest('[hidden]');
      if (hiddenAncestor && hiddenAncestor !== tooltip) {
        needsDetach = true;
      }
    }
    if (!needsDetach) {
      try {
        const view = documentRef.defaultView;
        if (view && typeof view.getComputedStyle === 'function') {
          const parentDisplay = view.getComputedStyle(parent).display;
          if (parentDisplay === 'none') {
            needsDetach = true;
          }
        } else if (typeof parent.style?.display === 'string' && parent.style.display === 'none') {
          needsDetach = true;
        }
      } catch (err) {
        pcaTooltipDebug('Debug: pca tooltip host inspection error', {
          error: err?.message || String(err)
        });
      }
    }
    const host = documentRef.body || documentRef.documentElement;
    if (needsDetach && host && parent !== host) {
      host.appendChild(tooltip);
      pcaTooltipDebug('Debug: pca tooltip host realigned', {
        previousParent: parent.id || parent.className || parent.tagName || null
      });
    }
    return tooltip;
  }

  function getPcaTooltipElement() {
    if (pcaTooltipEl && pcaTooltipEl.isConnected) {
      return pcaTooltipEl;
    }
    const doc = global.document;
    const tooltip = pcaRefs.tooltip || doc?.getElementById?.('tooltip') || null;
    if (tooltip) {
      ensurePcaTooltipHost(tooltip, doc);
      pcaTooltipEl = tooltip;
      pcaRefs.tooltip = tooltip;
    }
    return pcaTooltipEl;
  }

  function formatPcaTooltipNumber(value) {
    const formatter = Shared.formatters?.formatShortNumber;
    if (typeof formatter === 'function') {
      return formatter(value, {
        emptyValue: 'n/a'
      });
    }
    if (value === null || value === undefined) {
      return 'n/a';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return String(value);
      }
      return value.toLocaleString('en-US', {
        maximumSignificantDigits: 6
      });
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString('en-US', {
        maximumSignificantDigits: 6
      });
    }
    return String(value);
  }

  function updatePcaTooltipContent(tooltip, data) {
    if (!tooltip || !data) {
      return false;
    }
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
      if (!text) {
        return;
      }
      const row = doc.createElement('div');
      if (bold) {
        row.style.fontWeight = '600';
      }
      row.textContent = text;
      fragment.appendChild(row);
    };
    if (data.label) {
      appendRow(data.label, true);
    }
    if (data.groupName) {
      appendRow(`Group: ${data.groupName}`);
    }
    if (data.x !== undefined) {
      appendRow(`${data.xLabel || 'X'}: ${formatPcaTooltipNumber(data.x)}`);
    }
    if (data.y !== undefined) {
      appendRow(`${data.yLabel || 'Y'}: ${formatPcaTooltipNumber(data.y)}`);
    }
    if (data.z !== undefined) {
      appendRow(`${data.zLabel || 'Z'}: ${formatPcaTooltipNumber(data.z)}`);
    }
    if (Number.isFinite(data.depth)) {
      appendRow(`Depth: ${formatPcaTooltipNumber(data.depth)}`);
    }
    if (Number.isInteger(data.index)) {
      appendRow(`Index: ${data.index + 1}`);
    }
    if (!fragment.childNodes.length) {
      return false;
    }
    tooltip.appendChild(fragment);
    return true;
  }

  function getPcaEventPagePosition(evt) {
    const win = global.window;
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const pageX = typeof evt?.pageX === 'number' ? evt.pageX : ((evt?.clientX || 0) + scrollX);
    const pageY = typeof evt?.pageY === 'number' ? evt.pageY : ((evt?.clientY || 0) + scrollY);
    return {
      x: pageX,
      y: pageY
    };
  }

  function positionPcaTooltipAt(tooltip, pageX, pageY) {
    if (!tooltip) {
      return;
    }
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
    if (rect.right > maxX) {
      left = Math.max(scrollX + 8, maxX - rect.width);
    }
    if (rect.bottom > maxY) {
      top = Math.max(scrollY + 8, maxY - rect.height);
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hidePcaTooltip(reason) {
    const tooltip = getPcaTooltipElement();
    if (!tooltip) {
      return;
    }
    const wasVisible = tooltip.style.display !== 'none';
    tooltip.style.display = 'none';
    tooltip.textContent = '';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    if (wasVisible) {
      pcaTooltipDebug('Debug: pca tooltip hide', {
        reason
      });
    }
  }

  function showPcaTooltip(data, evt) {
    const tooltip = getPcaTooltipElement();
    if (!tooltip) {
      return;
    }
    if (!updatePcaTooltipContent(tooltip, data)) {
      return;
    }
    tooltip.style.display = 'block';
    const pos = getPcaEventPagePosition(evt);
    positionPcaTooltipAt(tooltip, pos.x, pos.y);
    pcaTooltipDebug('Debug: pca tooltip show', {
      label: data?.label || null,
      x: data?.x ?? null,
      y: data?.y ?? null,
      z: data?.z ?? null
    });
  }

  function handlePcaPointEnter(evt) {
    const data = evt?.currentTarget?.__pcaPointData;
    if (!data) {
      return;
    }
    showPcaTooltip(data, evt);
  }

  function handlePcaPointMove(evt) {
    const tooltip = getPcaTooltipElement();
    if (!tooltip || tooltip.style.display === 'none') {
      return;
    }
    const pos = getPcaEventPagePosition(evt);
    positionPcaTooltipAt(tooltip, pos.x, pos.y);
  }

  function handlePcaPointLeave() {
    hidePcaTooltip('point-leave');
  }

  function handlePcaPlotMouseLeave() {
    hidePcaTooltip('plot-leave');
  }

  function isPcaContextMenuEventSuppressed(target) {
    if (!target) {
      return false;
    }
    if (target === pcaPointContextMenu) {
      return true;
    }
    if (typeof target.closest === 'function') {
      return !!target.closest('.pca-point-context-menu');
    }
    return false;
  }

  function ensurePcaPointContextMenu() {
    const doc = global.document;
    if (!doc) {
      return null;
    }
    if (pcaPointContextMenu && doc.body && doc.body.contains(pcaPointContextMenu)) {
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
      try {
        evt.preventDefault();
      } catch (e) {}
      try {
        evt.stopPropagation();
      } catch (e) {}
    }, true);

    const hide = (reason) => hidePcaPointContextMenu(reason);
    labelItem.addEventListener('click', evt => {
      try {
        evt.preventDefault();
      } catch (e) {}
      try {
        evt.stopPropagation();
      } catch (e) {}
      const data = menu.__pcaPointData;
      const hot = pcaState.hot || pcaHotInstance || ensurePcaHotForActiveTab?.();
      let columnIndex = Number.isInteger(data?.columnIndex) ? data.columnIndex : null;
      if (columnIndex === null && hot && data?.label) {
        columnIndex = resolvePcaColumnIndexFromLabel(hot, data.label);
      }
      if (columnIndex === null) {
        hide('no-column-index');
        return;
      }
      const toggled = togglePcaColumnLabel(hot, columnIndex, {
        ensureVisible: true
      });
      if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
        debugLog('Debug: pca context menu label toggle', {
          columnIndex,
          toggled
        });
      }
      scheduleActivePcaDraw({
        reason: 'point-context-menu'
      });
      hide('action-complete');
    });

    if (doc.body) {
      doc.body.appendChild(menu);
    }
    pcaPointContextMenu = menu;

    if (!pcaPointContextMenuGlobalBound) {
      pcaPointContextMenuGlobalBound = true;
      doc.addEventListener('pointerdown', evt => {
        if (!pcaPointContextMenu || pcaPointContextMenu.hidden) {
          return;
        }
        const target = evt?.target;
        if (target && pcaPointContextMenu.contains(target)) {
          return;
        }
        hidePcaPointContextMenu('outside-click');
      }, true);
      doc.addEventListener('keydown', evt => {
        if (!pcaPointContextMenu || pcaPointContextMenu.hidden) {
          return;
        }
        if (evt?.key === 'Escape') {
          hidePcaPointContextMenu('escape');
        }
      }, true);
      global.addEventListener?.('resize', () => hidePcaPointContextMenu('resize'), true);
      global.addEventListener?.('scroll', () => hidePcaPointContextMenu('scroll'), true);
    }

    return pcaPointContextMenu;
  }

  function hidePcaPointContextMenu(reason) {
    if (!pcaPointContextMenu || pcaPointContextMenu.hidden) {
      return;
    }
    pcaPointContextMenu.hidden = true;
    pcaPointContextMenu.__pcaPointData = null;
    if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      debugLog('Debug: pca point context menu hidden', {
        reason: reason || 'unknown'
      });
    }
  }

  function positionPcaPointContextMenu(menu, pageX, pageY) {
    if (!menu) {
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
    if (rect && viewportW && viewportH) {
      let nextLeft = x;
      let nextTop = y;
      if (rect.right > viewportW - 6) {
        nextLeft = Math.max(6, viewportW - rect.width - 6);
      }
      if (rect.bottom > viewportH - 6) {
        nextTop = Math.max(6, viewportH - rect.height - 6);
      }
      menu.style.left = `${nextLeft}px`;
      menu.style.top = `${nextTop}px`;
    }
  }

  function isPcaColumnLabelSelected(hotInstance, columnIndex) {
    if (!hotInstance || !Number.isInteger(columnIndex)) {
      return false;
    }
    const data = hotInstance.getData?.() || [];
    const labelRowIndex = resolvePcaLabelRowIndex(data);
    if (!Number.isInteger(labelRowIndex)) {
      return false;
    }
    const pinnedTopCount = Number.isFinite(hotInstance?.gridApi?.getPinnedTopRowCount?.()) ?
      hotInstance.gridApi.getPinnedTopRowCount() :
      getPcaPinnedMetaRowCountForMode();
    const isPinnedRow = labelRowIndex >= 0 && labelRowIndex < pinnedTopCount;
    const current = isPinnedRow ?
      data[labelRowIndex]?.[columnIndex] :
      (typeof hotInstance.getDataAtCell === 'function' ?
        hotInstance.getDataAtCell(labelRowIndex, columnIndex) :
        data[labelRowIndex]?.[columnIndex]);
    return parsePcaPointLabelFlag(current);
  }

  function togglePcaColumnLabel(hotInstance, columnIndex, options) {
    if (!hotInstance || !Number.isInteger(columnIndex)) {
      return false;
    }
    const data = hotInstance.getData?.() || [];
    const labelRowIndex = (Array.isArray(data[PCA_LABEL_ROW_INDEX]) && isPcaLabelRowHeader(data[PCA_LABEL_ROW_INDEX]?.[0])) ?
      PCA_LABEL_ROW_INDEX :
      resolvePcaLabelRowIndex(data);
    if (!Number.isInteger(labelRowIndex)) {
      return false;
    }
    const pinnedTopCount = Number.isFinite(hotInstance?.gridApi?.getPinnedTopRowCount?.()) ?
      hotInstance.gridApi.getPinnedTopRowCount() :
      getPcaPinnedMetaRowCountForMode();
    const isPinnedRow = labelRowIndex >= 0 && labelRowIndex < pinnedTopCount;
    const current = isPinnedRow ?
      data[labelRowIndex]?.[columnIndex] :
      (typeof hotInstance.getDataAtCell === 'function' ?
        hotInstance.getDataAtCell(labelRowIndex, columnIndex) :
        data[labelRowIndex]?.[columnIndex]);
    const next = !parsePcaPointLabelFlag(current);
    if (typeof hotInstance.setDataAtCell === 'function') {
      hotInstance.setDataAtCell([
        [labelRowIndex, columnIndex, next]
      ], 'pca-point-label-toggle');
    }
    if (options?.ensureVisible) {
      const api = hotInstance.gridApi;
      if (api && typeof api.ensureColumnVisible === 'function') {
        try {
          api.ensureColumnVisible(columnIndex);
        } catch (e) {}
      }
      if (!isPinnedRow && api) {
        let targetNode = null;
        api.forEachNode?.(node => {
          if (!targetNode && Number(node?.data?.__rowIndex) === labelRowIndex) {
            targetNode = node;
          }
        });
        if (targetNode && typeof api.ensureNodeVisible === 'function') {
          try { api.ensureNodeVisible(targetNode, 'middle'); } catch (e) { api.ensureNodeVisible(targetNode); }
        } else if (targetNode && typeof api.ensureIndexVisible === 'function') {
          try { api.ensureIndexVisible(targetNode.rowIndex, 'middle'); } catch (e) { api.ensureIndexVisible(targetNode.rowIndex); }
        }
      }
    }
    return next;
  }

  function resolvePcaColumnIndexFromLabel(hotInstance, labelText) {
    if (!hotInstance || !labelText) {
      return null;
    }
    const data = hotInstance.getData?.() || [];
    const labelRowIndex = resolvePcaLabelRowIndex(data);
    const headerRowIndex = resolvePcaHeaderRowIndex(data, labelRowIndex);
    if (!Number.isInteger(headerRowIndex)) {
      return null;
    }
    const headerRow = Array.isArray(data[headerRowIndex]) ? data[headerRowIndex] : [];
    const target = String(labelText).trim();
    if (!target) {
      return null;
    }
    for (let c = 1; c < headerRow.length; c += 1) {
      const headerText = headerRow[c] == null ? '' : String(headerRow[c]).trim();
      if (headerText === target) {
        return c;
      }
    }
    return null;
  }

  function showPcaPointContextMenu(evt, data) {
    const menu = ensurePcaPointContextMenu();
    if (!menu) {
      return;
    }
    menu.__pcaPointData = data || null;
    const hot = pcaState.hot || pcaHotInstance || ensurePcaHotForActiveTab?.();
    let columnIndex = Number.isInteger(data?.columnIndex) ? data.columnIndex : null;
    if (columnIndex === null && hot && data?.label) {
      columnIndex = resolvePcaColumnIndexFromLabel(hot, data.label);
    }
    const alreadySelected = columnIndex !== null && hot ? isPcaColumnLabelSelected(hot, columnIndex) : false;
    const labelItem = menu.querySelector?.('button[data-action="toggle-label"]');
    if (labelItem) {
      labelItem.textContent = alreadySelected ? 'Remove label' : 'Add label';
      labelItem.disabled = columnIndex === null || !hot;
    }
    menu.hidden = false;
    const pos = getPcaEventPagePosition(evt);
    positionPcaPointContextMenu(menu, pos.x, pos.y);
    if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      debugLog('Debug: pca point context menu shown', {
        columnIndex,
        alreadySelected
      });
    }
  }

  function handlePcaPointContextMenu(evt) {
    const target = evt?.currentTarget;
    const data = target?.__pcaPointData;
    if (!data) {
      return;
    }
    try {
      evt.preventDefault();
    } catch (e) {}
    try {
      evt.stopPropagation();
    } catch (e) {}
    hidePcaTooltip('context-menu');
    showPcaPointContextMenu(evt, data);
  }

  function handlePcaPointClick(evt) {
    const target = evt?.currentTarget;
    if (!target || typeof pcaShowPointFormatControls !== 'function') {
      return;
    }
    try {
      evt.stopPropagation();
    } catch (e) {}
    hidePcaTooltip('point-click');
    pcaShowPointFormatControls(target);
  }

  function bindPcaPlotContextMenuSuppression(node) {
    if (!node || node.__pcaContextMenuSuppressionBound) {
      return;
    }
    node.__pcaContextMenuSuppressionBound = true;
    node.addEventListener('contextmenu', evt => {
      const target = evt?.target;
      if (isPcaContextMenuEventSuppressed(target)) {
        return;
      }
      try {
        evt.preventDefault();
      } catch (e) {}
    }, true);
  }

  function attachPcaPointTooltip(el, data) {
    if (!el || !data) {
      return;
    }
    el.__pcaPointData = data;
    try { el.setAttribute('data-pca-point-interaction', JSON.stringify(data)); } catch (_err) {}
    if (el.__graphitixPcaPointTooltipBound === true) {
      bindPcaPointFormatInteraction(el);
      return;
    }
    el.addEventListener('mouseenter', handlePcaPointEnter);
    el.addEventListener('mousemove', handlePcaPointMove);
    el.addEventListener('mouseleave', handlePcaPointLeave);
    bindPcaPointFormatInteraction(el);
    el.addEventListener('contextmenu', handlePcaPointContextMenu);
    el.__graphitixPcaPointTooltipBound = true;
  }

  function bindPcaPointFormatInteraction(el) {
    if (!el || el.__graphitixPcaPointFormatBound === true) {
      return false;
    }
    el.addEventListener('click', handlePcaPointClick);
    el.__graphitixPcaPointFormatBound = true;
    return true;
  }

  function drawShapeOnCanvas(ctx, shape, options) {
    if (!ctx) {
      return;
    }
    const radius = Math.max(0, Number(options?.radius) || 0);
    if (radius <= 0) {
      return;
    }
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
    if (!drawFill && !drawStroke) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = strokeWidth;
    if (drawFill) {
      ctx.fillStyle = fill;
    }
    if (drawStroke) {
      ctx.strokeStyle = stroke;
    }
    const size = Math.max(radius * 2, 2);
    const half = size / 2;
    ctx.beginPath();
    if (normalized === 'square') {
      ctx.rect(cx - half, cy - half, size, size);
    } else if (normalized === 'triangle') {
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy + half);
      ctx.lineTo(cx - half, cy + half);
      ctx.closePath();
    } else if (normalized === 'diamond') {
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy);
      ctx.lineTo(cx, cy + half);
      ctx.lineTo(cx - half, cy);
      ctx.closePath();
    } else if (normalized === 'cross') {
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
    } else if (normalized === 'plus') {
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
    } else if (normalized === 'star') {
      const outer = Math.max(radius, 1);
      const inner = Math.max(outer * 0.45, 1);
      for (let i = 0; i < 5; i += 1) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const x1 = cx + Math.cos(a) * outer;
        const y1 = cy + Math.sin(a) * outer;
        if (i === 0) {
          ctx.moveTo(x1, y1);
        } else {
          ctx.lineTo(x1, y1);
        }
        const b = a + Math.PI / 5;
        const x2 = cx + Math.cos(b) * inner;
        const y2 = cy + Math.sin(b) * inner;
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    }
    if (drawFill) {
      ctx.fill();
    }
    if (drawStroke) {
      ctx.stroke();
    }
    ctx.restore();
  }

  function createNoopCanvasContext() {
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

  function debugLog() {
    if (typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug.apply(console, arguments);
    }
  }

  function computePcaLabelBounds3d(corners, project) {
    if (!Array.isArray(corners) || typeof project !== 'function') {
      return null;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < corners.length; i += 1) {
      const projected = project(corners[i]);
      const x = Number(projected?.x);
      const y = Number(projected?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      if (x < minX) {
        minX = x;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return null;
    }
    if (minX === maxX || minY === maxY) {
      return null;
    }
    return {
      minX,
      maxX,
      minY,
      maxY
    };
  }

  function attachPcaSelectAutoSize(select, label) {
    if (!select) {
      return;
    }
    if (typeof formControls.attachSelectAutoSize === 'function') {
      formControls.attachSelectAutoSize(select, label || 'pca');
      return;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'pca';
    try {
      if (watcher) {
        watcher(select);
        if (debugEnabled) {
          debugLog('Debug: pca select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      } else if (autoSizer) {
        autoSizer(select);
        if (debugEnabled) {
          debugLog('Debug: pca select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      } else if (debugEnabled) {
        debugLog('Debug: pca select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    } catch (err) {
      if (debugEnabled) {
        debugLog('Debug: pca select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
    }
  }

  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return fallback;
    }
    const clamped = Math.min(Math.max(num, min), max);
    return clamped;
  }

  function zeroMeanPoints(points) {
    if (!Array.isArray(points) || !points.length) {
      return;
    }
    const dims = points[0]?.length || 0;
    if (!dims) {
      return;
    }
    const means = new Array(dims).fill(0);
    points.forEach(row => {
      if (!row) {
        return;
      }
      for (let d = 0; d < dims; d += 1) {
        means[d] += row[d] || 0;
      }
    });
    for (let d = 0; d < dims; d += 1) {
      means[d] /= points.length;
    }
    points.forEach(row => {
      if (!row) {
        return;
      }
      for (let d = 0; d < dims; d += 1) {
        row[d] -= means[d];
      }
    });
    return means;
  }

  function computePairwiseSquaredDistances(matrix) {
    const n = Array.isArray(matrix) ? matrix.length : 0;
    if (n === 0) {
      return [];
    }
    const squared = new Array(n);
    for (let i = 0; i < n; i += 1) {
      squared[i] = new Float64Array(n);
    }
    for (let i = 0; i < n; i += 1) {
      squared[i][i] = 0;
      for (let j = i + 1; j < n; j += 1) {
        let sum = 0;
        const rowI = matrix[i];
        const rowJ = matrix[j];
        for (let k = 0; k < rowI.length; k += 1) {
          const diff = (rowI[k] || 0) - (rowJ[k] || 0);
          sum += diff * diff;
        }
        squared[i][j] = sum;
        squared[j][i] = sum;
      }
    }
    console.debug('Debug: pairwise distances computed', {
      count: n
    });
    return squared;
  }

  function computeTsneProbabilities(squaredDistances, perplexity) {
    const n = squaredDistances.length;
    const targetEntropy = Math.log(Math.max(perplexity, 1));
    const tolerance = 1e-5;
    const maxTries = 50;
    const conditional = new Array(n);
    for (let i = 0; i < n; i += 1) {
      const betaStats = {
        beta: 1,
        betamin: -Infinity,
        betamax: Infinity
      };
      const thisP = new Float64Array(n);
      let done = false;
      let tries = 0;
      while (!done && tries < maxTries) {
        let sumP = 0;
        let entropy = 0;
        for (let j = 0; j < n; j += 1) {
          if (i === j) {
            thisP[j] = 0;
            continue;
          }
          const val = Math.exp(-squaredDistances[i][j] * betaStats.beta);
          thisP[j] = val;
          sumP += val;
        }
        if (sumP === 0) {
          sumP = 1;
        }
        for (let j = 0; j < n; j += 1) {
          if (i === j) {
            continue;
          }
          const p = thisP[j] / sumP;
          entropy += squaredDistances[i][j] * p;
        }
        entropy = Math.log(sumP) + betaStats.beta * entropy;
        const diff = entropy - targetEntropy;
        if (Math.abs(diff) < tolerance) {
          done = true;
        } else {
          if (diff > 0) {
            betaStats.betamin = betaStats.beta;
            if (!Number.isFinite(betaStats.betamax)) {
              betaStats.beta *= 2;
            } else {
              betaStats.beta = (betaStats.beta + betaStats.betamax) / 2;
            }
          } else {
            betaStats.betamax = betaStats.beta;
            if (!Number.isFinite(betaStats.betamin)) {
              betaStats.beta /= 2;
            } else {
              betaStats.beta = (betaStats.beta + betaStats.betamin) / 2;
            }
          }
        }
        tries += 1;
      }
      let sumFinal = 0;
      for (let j = 0; j < n; j += 1) {
        if (i === j) {
          thisP[j] = 0;
        } else {
          const val = Math.exp(-squaredDistances[i][j] * betaStats.beta);
          thisP[j] = val;
          sumFinal += val;
        }
      }
      if (sumFinal === 0) {
        sumFinal = 1;
      }
      const normalized = new Float64Array(n);
      for (let j = 0; j < n; j += 1) {
        normalized[j] = i === j ? 0 : thisP[j] / sumFinal;
      }
      conditional[i] = normalized;
    }
    const symmetrized = new Array(n);
    let sumAll = 0;
    for (let i = 0; i < n; i += 1) {
      symmetrized[i] = new Float64Array(n);
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const value = (conditional[i][j] + conditional[j][i]) / (2 * n);
        symmetrized[i][j] = value;
        symmetrized[j][i] = value;
        sumAll += value * 2;
      }
    }
    const normalization = sumAll > 0 ? sumAll : 1;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        symmetrized[i][j] = symmetrized[i][j] / normalization;
      }
    }
    console.debug('Debug: tsne probabilities computed', {
      n,
      perplexity
    });
    return symmetrized;
  }

  function computeInitialEmbedding(matrix, outputDims, SVDLib) {
    const n = Array.isArray(matrix) ? matrix.length : 0;
    if (n === 0) {
      return [];
    }
    const dims = Math.max(2, Math.min(outputDims || 2, matrix[0]?.length || 2));
    if (SVDLib && typeof SVDLib.SVD === 'function') {
      try {
        const copy = matrix.map(row => row.slice());
        const svd = SVDLib.SVD(copy);
        const scores = new Array(n).fill(null).map(() => new Array(dims).fill(0));
        const useDims = Math.min(dims, svd.q.length);
        for (let i = 0; i < n; i += 1) {
          for (let d = 0; d < useDims; d += 1) {
            scores[i][d] = svd.u[i][d] * (svd.q[d] || 1);
          }
        }
        zeroMeanPoints(scores);
        console.debug('Debug: initial embedding via PCA', {
          dims: useDims
        });
        return scores;
      } catch (err) {
        console.debug('Debug: initial embedding PCA fallback', {
          message: err?.message || err
        });
      }
    }
    const randomInit = new Array(n).fill(null).map(() => {
      const row = new Array(dims);
      for (let d = 0; d < dims; d += 1) {
        row[d] = (Math.random() - 0.5) * 1e-3;
      }
      return row;
    });
    zeroMeanPoints(randomInit);
    console.debug('Debug: initial embedding random', {
      dims
    });
    return randomInit;
  }

  function computeTsneEmbedding(matrix, options) {
    const opts = options || {};
    const n = Array.isArray(matrix) ? matrix.length : 0;
    const outputDims = Math.min(Math.max(opts.outputDims || 2, 2), 3);
    if (n === 0) {
      return {
        embedding: [],
        iterations: 0,
        perplexity: opts.perplexity || DEFAULT_TSNE_SETTINGS.perplexity,
        klDivergence: 0,
        learningRate: opts.learningRate || DEFAULT_TSNE_SETTINGS.learningRate,
        earlyExaggeration: opts.earlyExaggeration || DEFAULT_TSNE_SETTINGS.earlyExaggeration
      };
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
    for (let i = 0; i < n; i += 1) {
      embedding[i] = new Float64Array(outputDims);
      for (let d = 0; d < outputDims; d += 1) {
        embedding[i][d] = initial[i]?.[d] ?? (Math.random() - 0.5) * 1e-4;
      }
    }
    zeroMeanPoints(embedding);
    const gains = new Array(n).fill(null).map(() => new Float64Array(outputDims).fill(1));
    const yIncs = new Array(n).fill(null).map(() => new Float64Array(outputDims));
    const grads = new Array(n).fill(null).map(() => new Float64Array(outputDims));
    const num = new Array(n).fill(null).map(() => new Float64Array(n));
    let finalKl = 0;
    for (let iter = 0; iter < iterations; iter += 1) {
      let sumQ = 0;
      for (let i = 0; i < n; i += 1) {
        const Yi = embedding[i];
        for (let j = i + 1; j < n; j += 1) {
          const Yj = embedding[j];
          let distSq = 0;
          for (let d = 0; d < outputDims; d += 1) {
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
      for (let i = 0; i < n; i += 1) {
        const gradRow = grads[i];
        for (let d = 0; d < outputDims; d += 1) {
          gradRow[d] = 0;
        }
      }
      let kl = 0;
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          if (i === j) {
            continue;
          }
          const pij = probabilities[i][j] * (iter < earlyFraction ? earlyExaggeration : 1);
          const qijRaw = num[i][j];
          const qij = qijRaw / sumQ;
          const mult = 4 * (pij - qij) * qijRaw;
          if (pij > 1e-12 && qij > 1e-12) {
            kl += pij * Math.log(pij / qij);
          }
          for (let d = 0; d < outputDims; d += 1) {
            grads[i][d] += mult * (embedding[i][d] - embedding[j][d]);
          }
        }
      }
      finalKl = kl;
      const momentum = iter < earlyFraction ? 0.5 : 0.8;
      for (let i = 0; i < n; i += 1) {
        for (let d = 0; d < outputDims; d += 1) {
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
      if (iter % 50 === 0 || iter === iterations - 1) {
        console.debug('Debug: tsne iteration', {
          iteration: iter + 1,
          iterations,
          kl
        });
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

  function computeSimpleUmapEmbedding(matrix, options) {
    const opts = options || {};
    const n = Array.isArray(matrix) ? matrix.length : 0;
    const outputDims = Math.min(Math.max(opts.outputDims || 2, 2), 3);
    if (n === 0) {
      return {
        embedding: [],
        epochs: 0,
        neighbors: opts.neighbors || DEFAULT_UMAP_SETTINGS.neighbors,
        minDist: opts.minDist || DEFAULT_UMAP_SETTINGS.minDist,
        learningRate: opts.learningRate || DEFAULT_UMAP_SETTINGS.learningRate
      };
    }
    const neighbors = Math.round(clampNumber(opts.neighbors ?? DEFAULT_UMAP_SETTINGS.neighbors, 2, Math.max(2, n - 1), DEFAULT_UMAP_SETTINGS.neighbors));
    const minDist = clampNumber(opts.minDist ?? DEFAULT_UMAP_SETTINGS.minDist, 0, 0.99, DEFAULT_UMAP_SETTINGS.minDist);
    const learningRate = clampNumber(opts.learningRate ?? DEFAULT_UMAP_SETTINGS.learningRate, 0.01, 10, DEFAULT_UMAP_SETTINGS.learningRate);
    const epochs = Math.round(clampNumber(opts.epochs ?? DEFAULT_UMAP_SETTINGS.epochs, 50, 5000, DEFAULT_UMAP_SETTINGS.epochs));
    const negativeSampleRate = Math.round(clampNumber(opts.negativeSampleRate ?? DEFAULT_UMAP_SETTINGS.negativeSampleRate, 1, 50, DEFAULT_UMAP_SETTINGS.negativeSampleRate));
    const squared = computePairwiseSquaredDistances(matrix);
    const neighborGraph = new Array(n).fill(null).map(() => []);
    for (let i = 0; i < n; i += 1) {
      const candidates = [];
      for (let j = 0; j < n; j += 1) {
        if (i === j) {
          continue;
        }
        candidates.push({
          index: j,
          dist: Math.sqrt(Math.max(squared[i][j], 0))
        });
      }
      candidates.sort((a, b) => a.dist - b.dist);
      const limit = Math.min(neighbors, candidates.length);
      let rho = limit > 0 ? candidates[0].dist : 0;
      const target = Math.log2(Math.max(neighbors, 2));
      let sigma = 1;
      let low = 0;
      let high = Infinity;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        let sum = 0;
        for (let k = 0; k < limit; k += 1) {
          const d = candidates[k].dist;
          const weight = d - rho <= 0 ? 1 : Math.exp(-(d - rho) / sigma);
          sum += weight;
        }
        const diff = sum - target;
        if (Math.abs(diff) < 1e-3) {
          break;
        }
        if (diff > 0) {
          high = sigma;
          sigma = low === 0 ? sigma / 2 : (sigma + low) / 2;
        } else {
          low = sigma;
          sigma = Number.isFinite(high) ? (sigma + high) / 2 : sigma * 2;
        }
      }
      for (let k = 0; k < limit; k += 1) {
        const cand = candidates[k];
        const d = cand.dist;
        const weight = d - rho <= 0 ? 1 : Math.exp(-(d - rho) / Math.max(sigma, 1e-6));
        neighborGraph[i].push({
          index: cand.index,
          weight
        });
      }
    }
    const weightMatrix = new Array(n).fill(null).map(() => new Map());
    neighborGraph.forEach((list, i) => {
      list.forEach(entry => {
        weightMatrix[i].set(entry.index, entry.weight);
      });
    });
    const edges = [];
    for (let i = 0; i < n; i += 1) {
      neighborGraph[i].forEach(entry => {
        const j = entry.index;
        if (i >= j) {
          return;
        }
        const rev = weightMatrix[j]?.get(i) || 0;
        const combined = entry.weight + rev - entry.weight * rev;
        if (combined > 1e-6) {
          edges.push({
            i,
            j,
            weight: combined
          });
          weightMatrix[i].set(j, combined);
          weightMatrix[j]?.set?.(i, combined);
        }
      });
    }
    const initial = computeInitialEmbedding(matrix, outputDims, opts.SVDLib);
    const embedding = initial.map(row => new Float64Array(row));
    zeroMeanPoints(embedding);
    const rand = Math.random;
    for (let epoch = 0; epoch < epochs; epoch += 1) {
      const lr = learningRate * (1 - epoch / Math.max(1, epochs));
      for (let e = 0; e < edges.length; e += 1) {
        const edge = edges[e];
        const source = embedding[edge.i];
        const target = embedding[edge.j];
        let distSq = 0;
        for (let d = 0; d < outputDims; d += 1) {
          const diff = source[d] - target[d];
          distSq += diff * diff;
        }
        const dist = Math.sqrt(distSq) + 1e-9;
        const force = edge.weight * (dist - minDist);
        const step = lr * force / dist;
        for (let d = 0; d < outputDims; d += 1) {
          const delta = step * (source[d] - target[d]);
          source[d] -= delta;
          target[d] += delta;
        }
        for (let nSample = 0; nSample < negativeSampleRate; nSample += 1) {
          let negIndex = Math.floor(rand() * n);
          if (negIndex === edge.i || negIndex === edge.j) {
            continue;
          }
          const other = embedding[negIndex];
          let negDistSq = 0;
          for (let d = 0; d < outputDims; d += 1) {
            const diff = source[d] - other[d];
            negDistSq += diff * diff;
          }
          const repel = lr / (1 + negDistSq);
          for (let d = 0; d < outputDims; d += 1) {
            const diff = source[d] - other[d];
            const adjust = repel * diff;
            source[d] += adjust;
            other[d] -= adjust;
          }
        }
      }
      if ((epoch + 1) % 10 === 0) {
        zeroMeanPoints(embedding);
      }
      if (epoch % 50 === 0 || epoch === epochs - 1) {
        console.debug('Debug: umap epoch', {
          epoch: epoch + 1,
          epochs
        });
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

  function beginPcaWorkerInvocation(kind, options = {}) {
    const workerKind = String(kind || 'worker');
    const session = options.session || getPcaSessionForDrawOptions(options, {
      create: true
    }) || getActivePcaSessionForState();
    const shaped = ensurePcaSessionOwnershipShape(session);
    if (!shaped?.workers) {
      return null;
    }
    const invocationId = `${workerKind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id: invocationId,
      kind: workerKind,
      status: 'pending',
      drawToken: Number(options.drawToken) || null,
      tabId: shaped.tabId || options.tabId || null,
      signatures: {
        data: typeof options.dataSignature === 'string' ? options.dataSignature : null,
        settings: typeof options.settingsSignature === 'string' ? options.settingsSignature : null
      },
      startedAt: Date.now(),
      completedAt: null,
      error: null
    };
    shaped.workers.set(workerKind, record);
    shaped.workers.set(invocationId, record);
    shaped.updatedAt = Date.now();
    return {
      session: shaped,
      kind: workerKind,
      id: invocationId
    };
  }

  function isPcaWorkerInvocationCurrent(invocation) {
    if (!invocation?.session?.workers) {
      return false;
    }
    const current = invocation.session.workers.get(invocation.kind) || null;
    return current?.id === invocation.id;
  }

  function completePcaWorkerInvocation(invocation, patch = {}) {
    if (!invocation?.session?.workers) {
      return null;
    }
    const existing = invocation.session.workers.get(invocation.id) || null;
    if (!existing) {
      return null;
    }
    const isCurrent = isPcaWorkerInvocationCurrent(invocation);
    const next = {
      ...existing,
      ...(patch || {}),
      superseded: !isCurrent,
      completedAt: Date.now()
    };
    invocation.session.workers.set(invocation.id, next);
    if (isCurrent) {
      invocation.session.workers.set(invocation.kind, next);
    }
    invocation.session.updatedAt = Date.now();
    return next;
  }

  function shouldUsePcaSvdWorker(nSamples, nFeatures) {
    const workerApi = Shared.Workers;
    if (!workerApi || typeof workerApi.isSupported !== 'function' || !workerApi.isSupported()) {
      return false;
    }
    const samples = Math.max(0, Number(nSamples) || 0);
    const features = Math.max(0, Number(nFeatures) || 0);
    const cells = samples * features;
    return samples >= PCA_SVD_WORKER.minSamples ||
      features >= PCA_SVD_WORKER.minFeatures ||
      cells >= PCA_SVD_WORKER.minCells;
  }

  async function runPcaSvdWorker(matrix, nSamples, nFeatures, options = {}) {
    const workerApi = Shared.Workers;
    if (!workerApi || typeof workerApi.runTask !== 'function') {
      return null;
    }
    const invocation = beginPcaWorkerInvocation('svd', options);
    const execution = Shared.jobs?.createExecutionContext?.({
      component: 'pca',
      tabId: invocation?.session?.tabId || options?.tabId || getPcaProjectionTabId() || null,
      kind: 'graph'
    }) || null;
    try {
      const result = await workerApi.runTask({
        ...(execution?.workerOptions?.('svd') || { name: `pca:${invocation?.session?.tabId || 'unowned'}:svd` }),
        url: PCA_SVD_WORKER.url,
        action: 'pca-svd',
        payload: {
          matrix,
          nSamples,
          nFeatures
        },
        timeoutMs: PCA_SVD_WORKER.timeoutMs
      });
      if (!isPcaWorkerInvocationCurrent(invocation)) {
        completePcaWorkerInvocation(invocation, { status: 'superseded' });
        debugLog('Debug: stale pca SVD worker result ignored', { invocationId: invocation?.id || null });
        return null;
      }
      if (!result || !Array.isArray(result.q)) {
        completePcaWorkerInvocation(invocation, {
          status: 'empty-result'
        });
        return null;
      }
      completePcaWorkerInvocation(invocation, {
        status: 'done',
        resultSummary: {
          singularValues: Array.isArray(result.q) ? result.q.length : 0
        }
      });
      return result;
    } catch (err) {
      completePcaWorkerInvocation(invocation, {
        status: 'error',
        error: err?.message || String(err)
      });
      debugLog('Debug: pca worker failed', {
        message: err?.message || String(err)
      });
      return null;
    }
  }

  function shouldUsePcaEmbedWorker(method, nSamples, nFeatures) {
    const workerApi = Shared.Workers;
    if (!workerApi || typeof workerApi.isSupported !== 'function' || !workerApi.isSupported()) {
      return false;
    }
    const samples = Math.max(0, Number(nSamples) || 0);
    const features = Math.max(0, Number(nFeatures) || 0);
    const cells = samples * features;
    if (method === 'mds') {
      return samples >= PCA_EMBED_WORKER.minSamples || cells >= PCA_EMBED_WORKER.minCells;
    }
    return samples >= PCA_EMBED_WORKER.minSamples;
  }

  async function runPcaEmbedWorker(method, payload, options = {}) {
    const workerApi = Shared.Workers;
    if (!workerApi || typeof workerApi.runTask !== 'function') {
      return null;
    }
    const action = method === 'mds' ? 'mds' : (method === 'tsne' ? 'tsne' : (method === 'umap' ? 'umap' : null));
    if (!action) {
      return null;
    }
    const invocation = beginPcaWorkerInvocation(action, {
      ...options,
      method: action
    });
    const execution = Shared.jobs?.createExecutionContext?.({
      component: 'pca',
      tabId: invocation?.session?.tabId || options?.tabId || getPcaProjectionTabId() || null,
      kind: 'graph'
    }) || null;
    try {
      const result = await workerApi.runTask({
        ...(execution?.workerOptions?.(action) || { name: `pca:${invocation?.session?.tabId || 'unowned'}:${action}` }),
        url: PCA_EMBED_WORKER.url,
        action,
        payload,
        timeoutMs: PCA_EMBED_WORKER.timeoutMs
      });
      if (!isPcaWorkerInvocationCurrent(invocation)) {
        completePcaWorkerInvocation(invocation, { status: 'superseded' });
        debugLog('Debug: stale pca embedding worker result ignored', {
          method: action,
          invocationId: invocation?.id || null
        });
        return null;
      }
      if (!result) {
        completePcaWorkerInvocation(invocation, {
          status: 'empty-result'
        });
        return null;
      }
      completePcaWorkerInvocation(invocation, {
        status: 'done',
        resultSummary: {
          rows: Array.isArray(result.coords) ? result.coords.length : (Array.isArray(result.embedding) ? result.embedding.length : null),
          method: action
        }
      });
      return result;
    } catch (err) {
      completePcaWorkerInvocation(invocation, {
        status: 'error',
        error: err?.message || String(err)
      });
      debugLog('Debug: pca embed worker failed', {
        method,
        message: err?.message || String(err)
      });
      return null;
    }
  }

  let scheduleDrawPcaRaw = () => {};
  let pcaFontEventBound = false;
  let pendingDrawOptions = {};
  let pcaDataDrawTimer = null;
  let pcaDataDrawFrame = null;
  const PCA_DATA_DRAW_DEBOUNCE_SMALL_MS = 24;
  const PCA_DATA_DRAW_DEBOUNCE_MEDIUM_MS = 72;
  const PCA_DATA_DRAW_DEBOUNCE_LARGE_MS = 180;

  function buildPcaDrawLifecycleMeta(options = {}, source = 'pca-scheduler') {
    const reason = String(options?.reason || options?.source || 'pca-draw').trim() || 'pca-draw';
    const normalizedReason = reason.toLowerCase();
    const passiveReason = normalizedReason.includes('restore') ||
      normalizedReason.includes('payload') ||
      normalizedReason.includes('programmatic') ||
      normalizedReason.includes('auto') ||
      normalizedReason.includes('init') ||
      normalizedReason.includes('observer') ||
      normalizedReason.includes('layout') ||
      normalizedReason.includes('sync');
    return {
      tabId: resolvePcaAsyncTabId(options) || getPcaProjectionTabId() || null,
      reason,
      source,
      forceDraw: options?.force === true || options?.forceDraw === true,
      userInitiated: options?.userInitiated === true || (options?.userInitiated !== false && !passiveReason)
    };
  }

  function normalizeDrawOptions(options) {
    let normalized = {};
    if (!options) {
      normalized = {};
    } else if (typeof options === 'string') {
      normalized = {
        reason: options
      };
    } else if (typeof options === 'object') {
      normalized = {
        ...options
      };
    }
    const tabId = resolvePcaAsyncTabId(normalized);
    if (tabId && !normalized.tabId) {
      normalized.tabId = tabId;
    }
    if (!normalized.__workspaceSessionMeta && typeof Shared.workspaceTabs?.buildSessionMeta === 'function') {
      normalized.__workspaceSessionMeta = Shared.workspaceTabs.buildSessionMeta('pca', {
        ...normalized,
        tabId: normalized.tabId || tabId || null
      });
    }
    const safe = Shared.componentLifecycle?.sanitizeDrawOptions ?
      Shared.componentLifecycle.sanitizeDrawOptions(normalized, {
        tabId: normalized.tabId || tabId || null,
        reason: normalized.reason || 'pca-draw'
      }) :
      normalized;
    if (normalized.__workspaceSessionMeta && safe && typeof safe === 'object') {
      safe.__workspaceSessionMeta = normalized.__workspaceSessionMeta;
    }
    return safe;
  }

  function updateAutoDrawUi(meta = {}) {
    if (pcaRenderRowEl && pcaRenderRowEl.hidden !== true) {
      pcaRenderRowEl.hidden = true;
    }
    if (pcaRenderButtonEl && pcaRenderButtonEl.hidden !== true) {
      pcaRenderButtonEl.hidden = true;
      pcaRenderButtonEl.disabled = true;
    }
    if (pcaAutoDrawNoticeEl) {
      if (pcaAutoDrawNoticeEl.hidden !== true) {
        pcaAutoDrawNoticeEl.hidden = true;
      }
      if (pcaAutoDrawNoticeEl.textContent) {
        pcaAutoDrawNoticeEl.textContent = '';
      }
      schedulePcaNoticeWidth('ui-update');
    }
    if (meta && meta.reason) {
      debugLog('Debug: pca live-update UI normalized', {
        reason: meta.reason
      });
    }
  }

  function updatePcaDataShape(shape) {
    if (!shape || typeof shape !== 'object') {
      return;
    }
    const rawRows = Number(shape.rows);
    const rawCols = Number(shape.cols);
    const rows = Number.isFinite(rawRows) ? rawRows : pcaState.lastDataShape.rows;
    const cols = Number.isFinite(rawCols) ? rawCols : pcaState.lastDataShape.cols;
    if (rows === pcaState.lastDataShape.rows && cols === pcaState.lastDataShape.cols) {
      return;
    }
    pcaState.lastDataShape = {
      rows,
      cols
    };
    debugLog('Debug: pca data shape updated', {
      rows,
      cols
    });
  }

  function evaluateAutoDrawThresholds(meta = {}) {
    const hot = ensurePcaHotForActiveTab();
    const perfStart = nowMs();
    let totalRows = 0;
    let totalCols = 0;
    if (hot) {
      if (typeof hot.countSourceRows === 'function') {
        totalRows = Number(hot.countSourceRows()) || 0;
      } else if (typeof hot.countRows === 'function') {
        totalRows = Number(hot.countRows()) || 0;
      }
      if (typeof hot.countSourceCols === 'function') {
        totalCols = Number(hot.countSourceCols()) || 0;
      } else if (typeof hot.countCols === 'function') {
        totalCols = Number(hot.countCols()) || 0;
      }
      if (typeof Shared.hot?.estimateFilledShape === 'function') {
        const filled = Shared.hot.estimateFilledShape(hot);
        if (Number.isFinite(filled?.rows) && filled.rows >= 0) {
          totalRows = filled.rows;
        }
        if (Number.isFinite(filled?.cols) && filled.cols >= 0) {
          totalCols = filled.cols;
        }
      }
    }
    updatePcaDataShape({
      rows: totalRows,
      cols: totalCols
    });
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
    return {
      autoDrawEnabled: true,
      disabledNow: false,
      reason: null
    };
  }

  function resolvePcaDataDrawDebounceMs(reason) {
    if (global.__PCA_DISABLE_DATA_COALESCE === true) {
      return 0;
    }
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason === 'afterChange' ||
      normalizedReason === 'edit' ||
      normalizedReason === 'setDataAtCell' ||
      normalizedReason === 'Autofill.fill') {
      return PCA_DATA_DRAW_DEBOUNCE_SMALL_MS;
    }
    if (normalizedReason === 'afterLoadData' ||
      normalizedReason === 'afterCreateRow' ||
      normalizedReason === 'afterCreateCol') {
      return 120;
    }
    const rows = Number.isFinite(pcaState.lastDataShape?.rows) ? Number(pcaState.lastDataShape.rows) : 0;
    const cols = Number.isFinite(pcaState.lastDataShape?.cols) ? Number(pcaState.lastDataShape.cols) : 0;
    const cells = rows * Math.max(1, cols);
    if (rows >= 20000 || cells >= 200000) {
      return PCA_DATA_DRAW_DEBOUNCE_LARGE_MS;
    }
    if (rows >= 4000 || cells >= 60000) {
      return PCA_DATA_DRAW_DEBOUNCE_MEDIUM_MS;
    }
    return PCA_DATA_DRAW_DEBOUNCE_SMALL_MS;
  }

  function flushCoalescedPcaDataDraw(reason, session = null) {
    const drawSession = session || getPcaSessionForDrawOptions({
      reason
    }, {
      create: true
    });
    const drawRuntime = getPcaDrawRuntime(drawSession, {
      seedFromActive: true
    });
    const nextReason = reason || 'data-draw';
    const lifecycleMeta = buildPcaDrawLifecycleMeta({
      ...(drawRuntime.pendingDrawOptions || {}),
      tabId: drawSession?.tabId || null,
      reason: nextReason
    }, 'pca-flush');
    if (Shared.componentLifecycle?.shouldSuppressDraw?.('pca', lifecycleMeta)) {
      debugLog('Debug: pca coalesced draw suppressed by lifecycle', {
        reason: lifecycleMeta.reason,
        tabId: lifecycleMeta.tabId || null
      });
      Shared.componentLifecycle?.emitLifecycleEvent?.({
        componentKey: 'pca',
        tabId: lifecycleMeta.tabId || null,
        action: 'draw-suppressed',
        reason: lifecycleMeta.reason,
        details: {
          source: 'pca-flush'
        }
      });
      if (drawRuntime.dataDrawTimer) {
        Shared.componentLifecycle?.clearComponentTimeout?.(pca, drawRuntime.dataDrawTimer);
      }
      updatePcaDrawRuntime(drawSession, runtime => {
        runtime.dataDrawTimer = null;
      });
      return;
    }
    if (drawRuntime.dataDrawTimer) {
      Shared.componentLifecycle?.clearComponentTimeout?.(pca, drawRuntime.dataDrawTimer);
    }
    if (drawRuntime.dataDrawFrame) {
      Shared.componentLifecycle?.cancelComponentFrame?.(pca, drawRuntime.dataDrawFrame);
    }
    updatePcaDrawRuntime(drawSession, runtime => {
      runtime.dataDrawTimer = null;
      runtime.dataDrawFrame = null;
    });
    evaluateAutoDrawThresholds({
      reason: nextReason
    });
    updateAutoDrawUi({
      reason: nextReason
    });
    if (typeof scheduleDrawPcaRaw === 'function') {
      scheduleDrawPcaRaw({
        ...(drawRuntime.pendingDrawOptions || {}),
        tabId: drawSession?.tabId || null,
        reason: nextReason
      });
    }
  }

  function mergePendingDrawOptions(opts, session = null) {
    const drawSession = session || getPcaSessionForDrawOptions(opts || {}, {
      create: true
    });
    const drawRuntime = getPcaDrawRuntime(drawSession, {
      seedFromActive: true
    });
    const previous = drawRuntime.pendingDrawOptions || {};
    if (!opts || typeof opts !== 'object') {
      updatePcaDrawRuntime(drawSession, runtime => {
        runtime.pendingDrawOptions = previous.viewOnly ? {
          ...previous
        } : {};
      });
      return;
    }
    const next = {
      ...previous,
      ...opts,
      tabId: opts.tabId || drawSession?.tabId || previous.tabId || null
    };
    // Keep `force` orthogonal to `viewOnly` so forced resize/view refreshes can
    // stay lightweight and avoid unnecessary full recomputation.
    if (Object.prototype.hasOwnProperty.call(opts, 'viewOnly')) {
      next.viewOnly = !!opts.viewOnly;
    } else if (opts.force) {
      next.viewOnly = false;
    } else if (previous.viewOnly) {
      next.viewOnly = true;
    } else {
      next.viewOnly = false;
    }
    if (!Object.prototype.hasOwnProperty.call(opts, 'reason') && previous.viewOnly && next.viewOnly) {
      next.reason = previous.reason;
    }
    updatePcaDrawRuntime(drawSession, runtime => {
      runtime.pendingDrawOptions = next;
    });
  }

  function scheduleDrawPcaWrapper(options) {
    syncPcaRuntimeControlsFromDom();
    const opts = normalizeDrawOptions(options);
    const session = getPcaSessionForDrawOptions(opts, {
      create: true
    });
    const lifecycleMeta = buildPcaDrawLifecycleMeta({
      ...opts,
      tabId: opts.tabId || session?.tabId || null
    }, 'pca-scheduler');
    if (Shared.componentLifecycle?.shouldSuppressDraw?.('pca', lifecycleMeta)) {
      debugLog('Debug: pca draw suppressed by lifecycle', {
        reason: lifecycleMeta.reason,
        tabId: lifecycleMeta.tabId || null
      });
      Shared.componentLifecycle?.emitLifecycleEvent?.({
        componentKey: 'pca',
        tabId: lifecycleMeta.tabId || null,
        action: 'draw-suppressed',
        reason: lifecycleMeta.reason,
        details: {
          source: 'pca-scheduler'
        }
      });
      return;
    }
    Shared.componentLifecycle?.emitLifecycleEvent?.({
      componentKey: 'pca',
      tabId: lifecycleMeta.tabId || null,
      action: 'draw-executed',
      reason: lifecycleMeta.reason,
      details: {
        source: 'pca-scheduler'
      }
    });
    opts.forceDraw = lifecycleMeta.forceDraw === true;
    opts.userInitiated = lifecycleMeta.userInitiated === true;
    opts.tabId = opts.tabId || session?.tabId || null;
    opts.__workspaceSessionMeta = opts.__workspaceSessionMeta || Shared.workspaceTabs?.buildSessionMeta?.('pca', opts) || null;
    const renderRuntime = getPcaRenderRuntime(session, {
      seedFromActive: true
    });
    if (!opts.force &&
      !Object.prototype.hasOwnProperty.call(opts, 'viewOnly') &&
      !renderRuntime.dataDirty) {
      opts.viewOnly = true;
    }
    mergePendingDrawOptions(opts, session);
    const drawRuntime = getPcaDrawRuntime(session, {
      seedFromActive: true
    });
    if (opts.viewOnly) {
      if (drawRuntime.dataDrawTimer) {
        Shared.componentLifecycle?.clearComponentTimeout?.(pca, drawRuntime.dataDrawTimer);
      }
      if (drawRuntime.dataDrawFrame) {
        Shared.componentLifecycle?.cancelComponentFrame?.(pca, drawRuntime.dataDrawFrame);
      }
      updatePcaDrawRuntime(session, runtime => {
        runtime.dataDrawTimer = null;
        runtime.dataDrawFrame = null;
      });
      if (typeof scheduleDrawPcaRaw === 'function') {
        scheduleDrawPcaRaw(getPcaDrawRuntime(session)?.pendingDrawOptions || opts);
      }
      return;
    }
    if (opts.force) {
      flushCoalescedPcaDataDraw(opts.reason || 'force', session);
      return;
    }
    const debounceMs = resolvePcaDataDrawDebounceMs(opts.reason);
    if (debounceMs <= 0) {
      flushCoalescedPcaDataDraw(opts.reason || 'data-draw', session);
      return;
    }
    if (drawRuntime.dataDrawTimer) {
      Shared.componentLifecycle?.clearComponentTimeout?.(pca, drawRuntime.dataDrawTimer);
    }
    if (drawRuntime.dataDrawFrame) {
      Shared.componentLifecycle?.cancelComponentFrame?.(pca, drawRuntime.dataDrawFrame);
    }
    // Coalesce redraw to the next owned frame instead of wall-clock timers.
    // This keeps scheduler behavior deterministic under RAF-based test flushing
    // while still collapsing bursty edit/import event storms into one draw.
    const nextFrame = schedulePcaScopedFrame({
      ...opts,
      tabId: opts.tabId || session?.tabId || getPcaProjectionTabId() || null,
      reason: opts.reason || 'pca-data-draw-debounce'
    }, () => {
      updatePcaDrawRuntime(session, runtime => {
        runtime.dataDrawFrame = null;
      });
      flushCoalescedPcaDataDraw(opts.reason || 'data-draw', session);
    });
    updatePcaDrawRuntime(session, runtime => {
      runtime.dataDrawTimer = null;
      runtime.dataDrawFrame = nextFrame || null;
    });
  }
  let scheduleDrawPca = Shared.workspaceTabs?.createTabScopedScheduler ?
    Shared.workspaceTabs.createTabScopedScheduler({
      componentKey: 'pca',
      debugLabel: 'pca',
      getTabId: () => resolvePcaAsyncTabId({}) || resolvePcaOwnedRuntimeTabId(null, {}) || null,
      scheduleRaw: scheduleDrawPcaWrapper
    }) :
    scheduleDrawPcaWrapper;

  function normalizePcaStatsPanelState(source = {}) {
    const src = source && typeof source === 'object' ? source : {};
    const normalizedPanel = Shared.statsReporting && typeof Shared.statsReporting.normalizeSavedPanelModel === 'function' ?
      Shared.statsReporting.normalizeSavedPanelModel(src) :
      {
        resultsModel: src.resultsModel || null,
        reportModel: src.reportModel || null
      };
    return {
      summaryModel: cloneSimple(src.summaryModel) || null,
      resultsModel: cloneSimple(normalizedPanel.resultsModel) || null,
      reportModel: cloneSimple(normalizedPanel.reportModel) || null
    };
  }

  function resolvePcaStatsPanelContext(options = {}) {
    const session = ensurePcaSessionOwnershipShape(options.session || getActivePcaSessionForState());
    const canUseLiveProjection = !session || isPcaSessionActiveForModuleState(session);
    const root = session?.root || null;
    const belongsToOwner = node => !!node && (!root || node === root || root.contains?.(node));
    const resolveTarget = (refKey, id) => {
      if(!canUseLiveProjection){ return null; }
      const ownedRef = session?.refs?.[refKey] || null;
      if(belongsToOwner(ownedRef)){ return ownedRef; }
      const resolved = getPcaNodeById(id, session?.tabId || null);
      if(belongsToOwner(resolved)){
        if(session?.refs){
          session.refs[refKey] = resolved;
        }
        return resolved;
      }
      return null;
    };
    return {
      session,
      canUseLiveProjection,
      summaryTarget: resolveTarget('statsSummary', 'pcaStatsSummary'),
      resultsTarget: resolveTarget('statsResults', 'pcaStatsResults')
    };
  }

  function capturePcaStatsPanelState(fallback = null, options = {}) {
    const context = resolvePcaStatsPanelContext(options);
    const previous = normalizePcaStatsPanelState(
      fallback || getPcaResultsState(context.session)?.statsPanel || {}
    );
    if(!context.canUseLiveProjection){
      return previous;
    }
    const summarySnapshot = Shared.statsReporting && typeof Shared.statsReporting.capturePanelModel === 'function' && context.summaryTarget ?
      Shared.statsReporting.capturePanelModel(context.summaryTarget) :
      null;
    const resultsSnapshot = Shared.statsReporting && typeof Shared.statsReporting.capturePanelModel === 'function' && context.resultsTarget ?
      Shared.statsReporting.capturePanelModel(context.resultsTarget) :
      null;
    const summaryCandidate = normalizePcaStatsPanelState({ summaryModel: summarySnapshot?.resultsModel || null });
    const reportCandidate = normalizePcaStatsPanelState({ reportModel: resultsSnapshot?.reportModel || null });
    // pcaStatsResults is a structural host containing the summary, scree plot, eigen
    // table and loadings. A generic stats-panel model cannot preserve those nodes'
    // identities/controls, so it must never become durable restore authority. PCA's
    // calculated result surfaces are rebuilt from owner-local results state; only the
    // independent summary model and owner-local reporting model are persisted here.
    return normalizePcaStatsPanelState({
      summaryModel: pcaStatsPanelSnapshotHasContent(summaryCandidate) ? summaryCandidate.summaryModel : previous.summaryModel,
      resultsModel: null,
      reportModel: pcaStatsPanelSnapshotHasContent(reportCandidate) ? reportCandidate.reportModel : previous.reportModel
    });
  }

  function pcaStatsPanelSnapshotHasContent(source) {
    const normalized = normalizePcaStatsPanelState(source);
    const placeholder = /^(?:no statistics computed\.?|component variance summary appears alongside the scree plot\.?|statistics will appear|statistics ready)/i;
    const modelHasContent = model => {
      if(!model || typeof model !== 'object'){ return false; }
      if(model.kind === 'stats-report' || model.type === 'stats-table'){ return true; }
      if(Array.isArray(model.sections) && model.sections.length){ return true; }
      const className = String(model.className || '');
      if(/(?:stats-table-card|stats-table-lead|stats-assumption|stats-report)/.test(className)){ return true; }
      if(model.type === 'text'){
        const text = String(model.text || '').trim();
        return !!text && !placeholder.test(text);
      }
      return Array.isArray(model.children) && model.children.some(modelHasContent);
    };
    return modelHasContent(normalized.summaryModel)
      || modelHasContent(normalized.resultsModel)
      || modelHasContent(normalized.reportModel);
  }

  function restorePcaStatsPanelState(panelState, options = {}) {
    const context = resolvePcaStatsPanelContext(options);
    const normalized = normalizePcaStatsPanelState(panelState);
    const durable = normalizePcaStatsPanelState({
      summaryModel: normalized.summaryModel,
      resultsModel: null,
      reportModel: normalized.reportModel
    });
    if(context.session && !context.canUseLiveProjection){
      setPcaStatsPanelResultsState(durable, context.session, { mirrorActive: false });
      return false;
    }
    let restored = false;
    const summaryPart = normalizePcaStatsPanelState({ summaryModel: durable.summaryModel });
    if (context.summaryTarget && pcaStatsPanelSnapshotHasContent(summaryPart) && Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function') {
      Shared.statsReporting.restorePanelModel(context.summaryTarget, {
        resultsModel: durable.summaryModel,
        reportModel: null
      }, {
        clearMainWhenMissing: options.clearWhenMissing !== false
      });
      restored = true;
    }
    // pcaStatsResults is a structural container, not a replaceable stats-output
    // body. Restore only its owner-local report host; replacing the parent would
    // destroy the live summary/scree/eigen/loadings nodes and stale session refs.
    if (context.resultsTarget && durable.reportModel && Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function') {
      const reportHost = ensurePcaReportHost(context.session);
      Shared.statsReporting.restorePanelModel(context.resultsTarget, {
        resultsModel: null,
        reportModel: durable.reportModel
      }, {
        ensureReportHost: reportHost ? () => reportHost : undefined,
        clearMainWhenMissing: false
      });
      restored = true;
    }
    if(context.session){
      setPcaStatsPanelResultsState(durable, context.session, { mirrorActive: context.canUseLiveProjection });
      if(context.canUseLiveProjection){
        syncPcaSessionRefsFromActive(context.session);
      }
    }
    return restored;
  }

  function rememberPcaStatsPanelState(panelState = null, options = {}) {
    const context = resolvePcaStatsPanelContext(options);
    const normalized = normalizePcaStatsPanelState(
      panelState || capturePcaStatsPanelState(null, { ...options, session: context.session })
    );
    if(context.session){
      setPcaStatsPanelResultsState(normalized, context.session, { mirrorActive: context.canUseLiveProjection });
      return getPcaStatsPanelSnapshot(context.session);
    }
    return normalized;
  }

  function normalizePcaResultsMethod(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || null;
  }

  function normalizePcaResultArray(value) {
    return Array.isArray(value) ? (cloneSimple(value) || value.slice()) : [];
  }

  function normalizePcaLoadingsResults(source = {}) {
    const src = source && typeof source === 'object' ? source : {};
    const rows = normalizePcaResultArray(src.rows || src.loadingsRows || []);
    const componentsRaw = Number(src.components ?? src.loadingsComponents);
    const totalRaw = Number(src.totalCount ?? src.loadingsTotalCount);
    return {
      rows,
      components: Number.isFinite(componentsRaw) && componentsRaw > 0 ? componentsRaw : 0,
      totalCount: Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : rows.length,
      truncated: !!(src.truncated || src.loadingsTruncated)
    };
  }

  function createDefaultPcaResultsState(source = {}) {
    const src = source && typeof source === 'object' ? source : {};
    const statsSource = src.stats || src.statsSnapshot || src.lastStats || null;
    const stats = cloneSimple(statsSource) || null;
    const supplementalSource = src.supplemental && typeof src.supplemental === 'object' ? src.supplemental : {};
    const loadingsSource = supplementalSource.loadings || src.loadings || stats?.loadings || {};
    const signaturesSource = src.signatures && typeof src.signatures === 'object' ? src.signatures : {};
    const method = normalizePcaResultsMethod(src.method || stats?.method);
    return {
      method,
      stats,
      statsPanel: normalizePcaStatsPanelState(src.statsPanel || src.panel || stats?.statsPanel || {}),
      summaryLines: normalizePcaResultArray(src.summaryLines || stats?.summaryLines || []),
      eigenSummary: normalizePcaResultArray(src.eigenSummary || stats?.eigenSummary || []),
      scree: normalizePcaResultArray(src.scree || stats?.scree || []),
      selectionSummary: cloneSimple(src.selectionSummary || stats?.selectionSummary || null) || null,
      parallelAnalysis: normalizePcaResultArray(src.parallelAnalysis || stats?.parallelAnalysis || []),
      supplemental: {
        biplot: cloneSimple(supplementalSource.biplot || src.biplot || stats?.biplot || null) || null,
        loadings: normalizePcaLoadingsResults(loadingsSource)
      },
      signatures: {
        data: typeof signaturesSource.data === 'string' && signaturesSource.data ? signaturesSource.data : (typeof src.dataSignature === 'string' ? src.dataSignature : null),
        settings: typeof signaturesSource.settings === 'string' && signaturesSource.settings ? signaturesSource.settings : (typeof src.settingsSignature === 'string' ? src.settingsSignature : null)
      },
      updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : Date.now()
    };
  }

  function normalizePcaResultsState(value) {
    return createDefaultPcaResultsState(value && typeof value === 'object' ? value : {});
  }

  let pcaFallbackResultsState = createDefaultPcaResultsState();

  function syncPcaResultsMirrors(resultsState, session = null, options = {}) {
    const normalized = normalizePcaResultsState(resultsState);
    return normalized;
  }

  function getPcaResultsState(session = null) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (shaped?.state) {
      shaped.state.results = normalizePcaResultsState(shaped.state.results || {
        stats: shaped.state.stats || null,
        statsPanel: shaped.state.statsPanel || shaped.state.stats?.statsPanel || {}
      });
      return shaped.state.results;
    }
    pcaFallbackResultsState = normalizePcaResultsState(pcaFallbackResultsState);
    return pcaFallbackResultsState;
  }

  function setPcaResultsState(value, session = null, options = {}) {
    const normalized = normalizePcaResultsState(value);
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (shaped?.state) {
      shaped.state.results = normalized;
      shaped.state.stats = cloneSimple(normalized.stats) || null;
      shaped.state.statsPanel = normalizePcaStatsPanelState(normalized.statsPanel);
      shaped.updatedAt = Date.now();
      syncPcaResultsMirrors(normalized, shaped, options);
      return shaped.state.results;
    }
    pcaFallbackResultsState = normalized;
    syncPcaResultsMirrors(pcaFallbackResultsState, null, options);
    return pcaFallbackResultsState;
  }

  function setPcaStatsSnapshot(stats, session = null, options = {}) {
    const previous = getPcaResultsState(session);
    const nextStats = cloneSimple(stats) || null;
    const nextPanel = options.statsPanel ?
      normalizePcaStatsPanelState(options.statsPanel) :
      normalizePcaStatsPanelState(previous.statsPanel || nextStats?.statsPanel || {});
    const nextSignatures = {
      data: typeof options.dataSignature === 'string' && options.dataSignature ? options.dataSignature : previous.signatures?.data || null,
      settings: typeof options.settingsSignature === 'string' && options.settingsSignature ? options.settingsSignature : previous.signatures?.settings || null
    };
    return setPcaResultsState({
      ...previous,
      method: normalizePcaResultsMethod(nextStats?.method || previous.method),
      stats: nextStats,
      statsPanel: nextPanel,
      signatures: nextSignatures
    }, session, options);
  }

  function setPcaStatsPanelResultsState(panelState = null, session = null, options = {}) {
    const previous = getPcaResultsState(session);
    return setPcaResultsState({
      ...previous,
      statsPanel: normalizePcaStatsPanelState(panelState || {})
    }, session, options);
  }

  function clearPcaResultsState(session = null, options = {}) {
    return setPcaResultsState(createDefaultPcaResultsState(), session, options);
  }

  function buildPcaStableHash(parts) {
    const text = parts.map(part => String(part ?? '')).join('|');
    let hash = 2166136261;
    for (let idx = 0; idx < text.length; idx += 1) {
      hash ^= text.charCodeAt(idx);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(36);
  }

  function buildPcaAnalysisSignatures({
    method,
    matrix,
    labels,
    controls,
    nSamples,
    nFeatures
  } = {}) {
    const sampleCount = Number.isFinite(Number(nSamples)) ? Number(nSamples) : (Array.isArray(matrix) ? matrix.length : 0);
    const featureCount = Number.isFinite(Number(nFeatures)) ? Number(nFeatures) : (Array.isArray(matrix?.[0]) ? matrix[0].length : 0);
    const labelList = Array.isArray(labels) ? labels : [];
    const matrixShapeSeed = [
      sampleCount,
      featureCount,
      labelList.length,
      labelList[0] || '',
      labelList[labelList.length - 1] || ''
    ];
    const settingsSeed = [
      normalizePcaResultsMethod(method) || '',
      controls?.standardizeVariables ? 'standardize' : 'center',
      sanitizePcaPreprocessingMode(controls?.preprocessing),
      JSON.stringify(pcaState.axisSelection || {}),
      JSON.stringify(pcaState.componentSelection || {}),
      JSON.stringify(controls?.tsne || {}),
      JSON.stringify(controls?.umap || {})
    ];
    return {
      data: `pca-data:${buildPcaStableHash(matrixShapeSeed)}`,
      settings: `pca-settings:${buildPcaStableHash(settingsSeed)}`
    };
  }

  function normalizePcaAnalysisCachePayload(payload = null, options = {}) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const cached = options.clone === false ? payload : (cloneSimple(payload) || payload);
    cached.method = normalizePcaResultsMethod(cached.method) || null;
    cached.statsSummaryLines = normalizePcaResultArray(cached.statsSummaryLines || []);
    cached.screeData = normalizePcaResultArray(cached.screeData || []);
    cached.parallelAnalysisPercent = normalizePcaResultArray(cached.parallelAnalysisPercent || []);
    cached.eigenSummaryData = normalizePcaResultArray(cached.eigenSummaryData || []);
    cached.dimensionMeta = normalizePcaResultArray(cached.dimensionMeta || []);
    cached.points = normalizePcaResultArray(cached.points || []);
    cached.points3d = normalizePcaResultArray(cached.points3d || []);
    cached.labels = normalizePcaResultArray(cached.labels || []);
    cached.sampleColumnIndices = normalizePcaResultArray(cached.sampleColumnIndices || []);
    cached.groupedHeaderRow = normalizePcaResultArray(cached.groupedHeaderRow || []);
    cached.loadingsRows = normalizePcaResultArray(cached.loadingsRows || []);
    cached.loadingsComponents = Number(cached.loadingsComponents) || 0;
    cached.loadingsTotalCount = Number.isFinite(Number(cached.loadingsTotalCount)) ? Number(cached.loadingsTotalCount) : cached.loadingsRows.length;
    cached.loadingsTruncated = !!cached.loadingsTruncated;
    cached.sampleCount = Number(cached.sampleCount) || cached.points.length;
    cached.featureCount = Number(cached.featureCount) || 0;
    cached.axisIndices = cached.axisIndices && typeof cached.axisIndices === 'object' ?
      {
        x: Number.isFinite(Number(cached.axisIndices.x)) ? Number(cached.axisIndices.x) : 0,
        y: Number.isFinite(Number(cached.axisIndices.y)) ? Number(cached.axisIndices.y) : 1,
        z: Number.isFinite(Number(cached.axisIndices.z)) ? Number(cached.axisIndices.z) : null
      } :
      {
        x: 0,
        y: 1,
        z: null
      };
    cached.pcaXLabelText = typeof cached.pcaXLabelText === 'string' ? cached.pcaXLabelText : 'PC1';
    cached.pcaYLabelText = typeof cached.pcaYLabelText === 'string' ? cached.pcaYLabelText : 'PC2';
    cached.pcaZLabelText = typeof cached.pcaZLabelText === 'string' ? cached.pcaZLabelText : 'PC3';
    cached.signatures = cached.signatures && typeof cached.signatures === 'object' ?
      {
        data: typeof cached.signatures.data === 'string' ? cached.signatures.data : null,
        settings: typeof cached.signatures.settings === 'string' ? cached.signatures.settings : null
      } :
      {
        data: null,
        settings: null
      };
    cached.statsSnapshot = cloneSimple(cached.statsSnapshot || null) || null;
    cached.biplotSnapshot = cloneSimple(cached.biplotSnapshot || null) || null;
    return cached;
  }

  function createDefaultPcaAnalysisRuntime(source = {}) {
    const src = source && typeof source === 'object' ? source : {};
    const cache = normalizePcaAnalysisCachePayload(src.cache || src.cachedAnalysis || src.cachedRender || src.runtimeCache || null);
    return {
      cache,
      signatures: {
        data: typeof src.signatures?.data === 'string' ? src.signatures.data : (cache?.signatures?.data || null),
        settings: typeof src.signatures?.settings === 'string' ? src.signatures.settings : (cache?.signatures?.settings || null)
      },
      updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : Date.now()
    };
  }

  function normalizePcaAnalysisRuntime(runtime) {
    if (!runtime || typeof runtime !== 'object') {
      return createDefaultPcaAnalysisRuntime({});
    }
    runtime.cache = normalizePcaAnalysisCachePayload(runtime.cache || runtime.cachedAnalysis || runtime.cachedRender || runtime.runtimeCache || null, {
      clone: false
    });
    runtime.signatures = runtime.signatures && typeof runtime.signatures === 'object' ?
      runtime.signatures :
      {
        data: null,
        settings: null
      };
    runtime.signatures.data = typeof runtime.signatures.data === 'string' ?
      runtime.signatures.data :
      (runtime.cache?.signatures?.data || null);
    runtime.signatures.settings = typeof runtime.signatures.settings === 'string' ?
      runtime.signatures.settings :
      (runtime.cache?.signatures?.settings || null);
    runtime.updatedAt = Number.isFinite(Number(runtime.updatedAt)) ? runtime.updatedAt : Date.now();
    return runtime;
  }

  function syncPcaAnalysisRuntimeMirror(runtime, session = null, options = {}) {
    if (!runtime) {
      return null;
    }
    const normalizedCache = normalizePcaAnalysisCachePayload(runtime.cache || null, {
      clone: false
    });
    runtime.cache = normalizedCache;
    runtime.signatures = runtime.signatures && typeof runtime.signatures === 'object' ?
      runtime.signatures :
      {
        data: null,
        settings: null
      };
    runtime.signatures.data = typeof runtime.signatures.data === 'string' && runtime.signatures.data ?
      runtime.signatures.data :
      (normalizedCache?.signatures?.data || null);
    runtime.signatures.settings = typeof runtime.signatures.settings === 'string' && runtime.signatures.settings ?
      runtime.signatures.settings :
      (normalizedCache?.signatures?.settings || null);
    const shaped = session ? ensurePcaSessionOwnershipShape(session) : null;
    if (shaped?.cache?.renderRuntime) {
      shaped.cache.renderRuntime.cachedRender = normalizedCache;
    }
    const shouldMirror = options.mirrorActive !== false
      && (!shaped || isPcaSessionActiveForModuleState(shaped));
    if (shouldMirror) {
      pcaState.cachedRender = normalizedCache;
    }
    return runtime;
  }

  function getPcaAnalysisRuntime(session = null, options = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (shaped?.cache) {
      if (!shaped.cache.analysisRuntime) {
        shaped.cache.analysisRuntime = createDefaultPcaAnalysisRuntime({
          cache: shaped.cache.renderRuntime?.cachedRender || pcaState.cachedRender || null
        });
      }
      shaped.cache.analysisRuntime = normalizePcaAnalysisRuntime(shaped.cache.analysisRuntime);
      if (!shaped.cache.analysisRuntime.cache && options.seedFromRenderRuntime !== false) {
        shaped.cache.analysisRuntime.cache = normalizePcaAnalysisCachePayload(shaped.cache.renderRuntime?.cachedRender || pcaState.cachedRender || null, {
          clone: false
        });
      }
      return syncPcaAnalysisRuntimeMirror(shaped.cache.analysisRuntime, shaped, options);
    }
    return createDefaultPcaAnalysisRuntime({
      cache: pcaState.cachedRender || null
    });
  }

  function getPcaAnalysisCache(session = null, options = {}) {
    return getPcaAnalysisRuntime(session, {
      ...options,
      seedFromRenderRuntime: true
    })?.cache || null;
  }

  function setPcaAnalysisCache(cachePayload, session = null, options = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const normalizedCache = normalizePcaAnalysisCachePayload(cachePayload);
    if (shaped?.cache) {
      shaped.cache.analysisRuntime = createDefaultPcaAnalysisRuntime({
        cache: normalizedCache,
        signatures: normalizedCache?.signatures || null,
        updatedAt: Date.now()
      });
      if (shaped.cache.renderRuntime) {
        shaped.cache.renderRuntime.cachedRender = normalizedCache;
      }
      shaped.updatedAt = Date.now();
      return syncPcaAnalysisRuntimeMirror(shaped.cache.analysisRuntime, shaped, options)?.cache || null;
    }
    if (options.mirrorActive !== false) {
      pcaState.cachedRender = normalizedCache;
    }
    return normalizedCache;
  }

  function clearPcaAnalysisCache(session = null) {
    return setPcaAnalysisCache(null, session, {
      mirrorActive: true
    });
  }

  function refreshPcaManualLabelsFromChanges(hotInstance, changes, reason = 'pca-point-label-toggle') {
    const session = getPcaSessionForHot(hotInstance, {
      reason
    }, {
      create: false
    }) || getActivePcaSessionForState();
    const updates = new Map();
    (Array.isArray(changes) ? changes : []).forEach(change => {
      const columnIndex = Number(change?.[1]);
      if (Number.isInteger(columnIndex) && columnIndex >= 1) {
        updates.set(columnIndex, parsePcaPointLabelFlag(change?.[3]));
      }
    });
    const cache = getPcaAnalysisCache(session);
    if (cache && updates.size) {
      const patchPoints = points => (Array.isArray(points) ? points.map((point, index) => {
        const fallbackColumnIndex = Number(cache.sampleColumnIndices?.[index]);
        const columnIndex = Number.isInteger(point?.columnIndex) ? point.columnIndex : fallbackColumnIndex;
        if (!updates.has(columnIndex)) {
          return point;
        }
        return {
          ...point,
          isManualLabel: updates.get(columnIndex)
        };
      }) : []);
      setPcaAnalysisCache({
        ...cache,
        points: patchPoints(cache.points),
        points3d: patchPoints(cache.points3d)
      }, session);
    }
    markPcaViewDirty(reason, session);
    requestPcaViewRefresh(reason, {
      tabId: session?.tabId || null,
      force: true,
      userInitiated: true,
      viewOnly: true,
      silentOverlay: true
    });
  }

  function getPcaStatsSnapshot(session = null) {
    const results = getPcaResultsState(session || getActivePcaSessionForState());
    return cloneSimple(results?.stats) || null;
  }

  function getPcaStatsPanelSnapshot(session = null) {
    const results = getPcaResultsState(session || getActivePcaSessionForState());
    return normalizePcaStatsPanelState(results?.statsPanel || {});
  }

  function sanitizePcaPreprocessingMode(value) {
    return String(value || '').trim().toLowerCase() === PCA_PREPROCESSING_RNASEQ_LOG ?
      PCA_PREPROCESSING_RNASEQ_LOG :
      PCA_PREPROCESSING_NONE;
  }

  function createDefaultPcaRuntimeControls() {
    return {
      method: 'pca',
      viewMode: DEFAULT_VIEW_MODE,
      showGrid: false,
      showFrame: true,
      showLegend: true,
      standardizeVariables: false,
      equalAxisLengths: true,
      preprocessing: PCA_PREPROCESSING_NONE,
      dotSize: '3',
      fill: '#0000ff',
      border: '#000000',
      borderWidth: '0',
      alpha: '0',
      fontSize: '12',
      tsne: {
        perplexity: '',
        learningRate: '',
        iterations: '',
        exaggeration: ''
      },
      umap: {
        neighbors: '',
        minDist: '',
        learningRate: '',
        epochs: ''
      }
    };
  }

  function normalizePcaRuntimeControls(source = {}) {
    const defaults = createDefaultPcaRuntimeControls();
    const src = source && typeof source === 'object' ? source : {};
    const tsne = src.tsne && typeof src.tsne === 'object' ? src.tsne : {};
    const umap = src.umap && typeof src.umap === 'object' ? src.umap : {};
    const method = String(src.method || defaults.method).trim().toLowerCase() || defaults.method;
    const view = String(src.viewMode || defaults.viewMode).trim().toLowerCase() === '3d' ? '3d' : '2d';
    return {
      method,
      viewMode: view,
      showGrid: !!src.showGrid,
      showFrame: !!src.showFrame,
      showLegend: src.showLegend !== false,
      standardizeVariables: Object.prototype.hasOwnProperty.call(src, 'standardizeVariables') ?
        !!src.standardizeVariables :
        !!src.scale,
      equalAxisLengths: Object.prototype.hasOwnProperty.call(src, 'equalAxisLengths') ?
        !!src.equalAxisLengths :
        (Object.prototype.hasOwnProperty.call(src, 'equalScaleAxes') ? !!src.equalScaleAxes : defaults.equalAxisLengths),
      preprocessing: sanitizePcaPreprocessingMode(src.preprocessing),
      dotSize: src.dotSize != null ? String(src.dotSize) : defaults.dotSize,
      fill: src.fill != null ? String(src.fill) : defaults.fill,
      border: src.border != null ? String(src.border) : defaults.border,
      borderWidth: src.borderWidth != null ? String(src.borderWidth) : defaults.borderWidth,
      alpha: src.alpha != null ? String(src.alpha) : defaults.alpha,
      fontSize: src.fontSize != null ? String(src.fontSize) : defaults.fontSize,
      tsne: {
        perplexity: tsne.perplexity != null ? String(tsne.perplexity) : defaults.tsne.perplexity,
        learningRate: tsne.learningRate != null ? String(tsne.learningRate) : defaults.tsne.learningRate,
        iterations: tsne.iterations != null ? String(tsne.iterations) : defaults.tsne.iterations,
        exaggeration: tsne.exaggeration != null ? String(tsne.exaggeration) : defaults.tsne.exaggeration
      },
      umap: {
        neighbors: umap.neighbors != null ? String(umap.neighbors) : defaults.umap.neighbors,
        minDist: umap.minDist != null ? String(umap.minDist) : defaults.umap.minDist,
        learningRate: umap.learningRate != null ? String(umap.learningRate) : defaults.umap.learningRate,
        epochs: umap.epochs != null ? String(umap.epochs) : defaults.umap.epochs
      }
    };
  }

  const PCA_POINT_STYLE_SCOPES_VERSION = 1;

  function normalizePcaPointStyle(source = {}, options = {}) {
    const src = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const out = {};
    const fill = src.fill ?? src.color;
    const borderColor = src.borderColor ?? src.stroke;
    const borderWidth = src.borderWidth ?? src.strokeWidth;
    if (typeof fill === 'string' && fill.trim()) {
      out.fill = fill.trim();
    }
    if (typeof src.shape === 'string' && src.shape.trim()) {
      out.shape = sanitizeGroupShape(src.shape, Number(options.fallbackIndex) || 0);
    }
    if (typeof borderColor === 'string' && borderColor.trim()) {
      out.borderColor = borderColor.trim();
    }
    if (Number.isFinite(Number(borderWidth))) {
      out.borderWidth = Math.max(0, Number(borderWidth));
    }
    if (Number.isFinite(Number(src.size))) {
      out.size = Math.max(0, Number(src.size));
    }
    if (Number.isFinite(Number(src.alpha))) {
      out.alpha = Math.min(1, Math.max(0, Number(src.alpha)));
    }
    return out;
  }

  function createPcaGlobalPointStyle(controls = {}) {
    const normalized = normalizePcaRuntimeControls(controls || {});
    return {
      fill: normalized.fill,
      shape: 'circle',
      borderColor: normalized.border,
      borderWidth: Math.max(0, Number(normalized.borderWidth) || 0),
      size: Math.max(0, Number(normalized.dotSize) || 0),
      alpha: Math.min(1, Math.max(0, Number(normalized.alpha) || 0))
    };
  }

  function pcaLabelPointStyleKey(label) {
    const normalized = String(label == null ? '' : label).trim();
    return normalized ? `label:${normalized}` : '';
  }

  function pcaColumnPointStyleKey(columnIndex) {
    const index = Number(columnIndex);
    return Number.isInteger(index) && index >= 1 ? `column:${index}` : '';
  }

  function resolvePcaPointStyleKey(point = {}) {
    return pcaColumnPointStyleKey(point.columnIndex) || pcaLabelPointStyleKey(point.label);
  }

  function normalizePcaPointStyleMap(source = {}, keyPrefix = '') {
    const src = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const out = {};
    Object.keys(src).forEach((rawKey, index) => {
      const style = normalizePcaPointStyle(src[rawKey], { fallbackIndex: index });
      if (!Object.keys(style).length) {
        return;
      }
      const normalizedKey = keyPrefix && !String(rawKey).startsWith(keyPrefix) ? `${keyPrefix}${rawKey}` : String(rawKey);
      out[normalizedKey] = style;
    });
    return out;
  }

  function normalizePcaPointStyleScopes(source = {}, options = {}) {
    const src = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const controls = options.controls || pcaState?.controls || createDefaultPcaRuntimeControls();
    const globalStyle = {
      ...createPcaGlobalPointStyle(controls),
      ...normalizePcaPointStyle(src.global || {})
    };
    const groups = normalizePcaPointStyleMap(src.groups || {});
    const points = normalizePcaPointStyleMap(src.points || {});
    const legacyGrouped = options.grouped && typeof options.grouped === 'object' ? options.grouped : {};
    const legacyColors = Array.isArray(legacyGrouped.colors) ? legacyGrouped.colors : [];
    const legacyShapes = Array.isArray(legacyGrouped.shapes) ? legacyGrouped.shapes : [];
    const legacyGroupCount = Math.max(legacyColors.length, legacyShapes.length);
    for (let index = 0; index < legacyGroupCount; index += 1) {
      groups[String(index)] = {
        ...normalizePcaPointStyle({
          color: legacyColors[index],
          shape: legacyShapes[index]
        }, { fallbackIndex: index }),
        ...(groups[String(index)] || {})
      };
    }
    const legacyColorsByLabel = options.labelColors && typeof options.labelColors === 'object' ? options.labelColors : {};
    const legacyShapesByLabel = options.labelShapes && typeof options.labelShapes === 'object' ? options.labelShapes : {};
    const legacyPointStyles = options.labelPointStyles && typeof options.labelPointStyles === 'object' ? options.labelPointStyles : {};
    const legacyLabels = new Set([
      ...Object.keys(legacyColorsByLabel),
      ...Object.keys(legacyShapesByLabel),
      ...Object.keys(legacyPointStyles)
    ]);
    legacyLabels.forEach((label, index) => {
      const key = pcaLabelPointStyleKey(label);
      if (!key) {
        return;
      }
      points[key] = {
        ...normalizePcaPointStyle({
          fill: legacyColorsByLabel[label],
          shape: legacyShapesByLabel[label],
          ...(legacyPointStyles[label] || {})
        }, { fallbackIndex: index }),
        ...(points[key] || {})
      };
    });
    return {
      version: PCA_POINT_STYLE_SCOPES_VERSION,
      global: globalStyle,
      groups,
      points
    };
  }

  function ensurePcaPointStyleScopes() {
    pcaState.pointStyleScopes = normalizePcaPointStyleScopes(pcaState.pointStyleScopes || {}, {
      controls: pcaState.controls
    });
    return pcaState.pointStyleScopes;
  }

  function exportLegacyPcaPointStyles(scopes = null) {
    const normalized = normalizePcaPointStyleScopes(scopes || ensurePcaPointStyleScopes(), {
      controls: pcaState.controls
    });
    const labelColors = {};
    const labelShapes = {};
    const labelPointStyles = {};
    Object.entries(normalized.points).forEach(([key, style]) => {
      if (!key.startsWith('label:')) {
        return;
      }
      const label = key.slice('label:'.length);
      if (style.fill) {
        labelColors[label] = style.fill;
      }
      if (style.shape) {
        labelShapes[label] = style.shape;
      }
      const legacyStyle = {};
      if (style.borderColor) legacyStyle.borderColor = style.borderColor;
      if (Number.isFinite(Number(style.borderWidth))) legacyStyle.borderWidth = Number(style.borderWidth);
      if (Number.isFinite(Number(style.size))) legacyStyle.size = Number(style.size);
      if (Number.isFinite(Number(style.alpha))) legacyStyle.alpha = Number(style.alpha);
      if (Object.keys(legacyStyle).length) {
        labelPointStyles[label] = legacyStyle;
      }
    });
    const groupIndices = Object.keys(normalized.groups)
      .map(key => Number(key))
      .filter(index => Number.isInteger(index) && index >= 0);
    const groupCount = groupIndices.length ? Math.max(...groupIndices) + 1 : 0;
    const colors = new Array(groupCount).fill('');
    const shapes = new Array(groupCount).fill('');
    groupIndices.forEach(index => {
      colors[index] = normalized.groups[String(index)]?.fill || '';
      shapes[index] = normalized.groups[String(index)]?.shape || '';
    });
    return { labelColors, labelShapes, labelPointStyles, colors, shapes };
  }

  function readPcaInputValue(input, fallback = '') {
    if (input && 'value' in input && input.value != null) {
      return String(input.value);
    }
    return fallback != null ? String(fallback) : '';
  }

  function setPcaInputValue(input, value) {
    const resolved = value != null ? String(value) : '';
    if (input && 'value' in input) {
      input.value = resolved;
    }
    return resolved;
  }

  function setPcaTextContent(node, value) {
    if (node) {
      node.textContent = value != null ? String(value) : '';
      return true;
    }
    return false;
  }

  function syncPcaFontSizeControl(input, label, value, options = {}) {
    const defaults = createDefaultPcaRuntimeControls();
    const fallback = pcaState.controls?.fontSize ?? defaults.fontSize;
    const resolved = value != null ? String(value) : readPcaInputValue(input, fallback);
    setPcaInputValue(input, resolved);
    if (input?.dataset) {
      input.dataset.fontBasePt = resolved;
    }
    if (input || label) {
      chartStyle.renderFontSizeLabel({
        element: label || null,
        pt: Number(resolved),
        input: input || null,
        manual: options.manual !== false
      });
    }
    return resolved;
  }

  function syncPcaRuntimeControlsFromDom() {
    const methodInput = getPcaNodeById('pcaMethod');
    const viewModeInput = getPcaNodeById('pcaViewMode') || pcaViewModeInput;
    const showGridInput = getPcaNodeById('pcaShowGrid');
    const showFrameInput = getPcaNodeById('pcaShowFrame');
    const showLegendInput = getPcaNodeById('pcaShowLegend') || pcaShowLegendInput;
    const standardizeInput = getPcaNodeById('pcaStandardizeVariables');
    const equalAxisLengthsInput = pcaSvgBoxRef?.querySelector?.('.resizer-axeslength-checkbox--equal-scale') || pcaEqualAxisLengthsInput;
    const preprocessingInput = getPcaNodeById('pcaPreprocessing');
    const dotSizeInput = getPcaNodeById('pcaDotSize');
    const fillInput = getPcaNodeById('pcaFill');
    const borderInput = getPcaNodeById('pcaBorder');
    const borderWidthInput = getPcaNodeById('pcaBorderWidth');
    const alphaInput = getPcaNodeById('pcaAlpha');
    const fontSizeInput = getPcaNodeById('pcaFontSize');
    const tsnePerplexityInput = getPcaNodeById('pcaTsnePerplexity');
    const tsneLearningRateInput = getPcaNodeById('pcaTsneLearningRate');
    const tsneIterationsInput = getPcaNodeById('pcaTsneIterations');
    const tsneExaggerationInput = getPcaNodeById('pcaTsneExaggeration');
    const umapNeighborsInput = getPcaNodeById('pcaUmapNeighbors');
    const umapMinDistInput = getPcaNodeById('pcaUmapMinDist');
    const umapLearningRateInput = getPcaNodeById('pcaUmapLearningRate');
    const umapEpochsInput = getPcaNodeById('pcaUmapEpochs');
    pcaState.controls = normalizePcaRuntimeControls({
      ...(pcaState.controls || {}),
      method: methodInput?.value || pcaState.lastMethod || 'pca',
      viewMode: viewModeInput?.value || DEFAULT_VIEW_MODE,
      showGrid: showGridInput ? !!showGridInput.checked : pcaState.controls?.showGrid,
      showFrame: showFrameInput ? !!showFrameInput.checked : pcaState.controls?.showFrame,
      showLegend: showLegendInput ? !!showLegendInput.checked : pcaState.controls?.showLegend,
      standardizeVariables: standardizeInput ? !!standardizeInput.checked : pcaState.controls?.standardizeVariables,
      equalAxisLengths: equalAxisLengthsInput ? !!equalAxisLengthsInput.checked : pcaState.controls?.equalAxisLengths,
      preprocessing: preprocessingInput?.value ?? pcaState.controls?.preprocessing,
      dotSize: dotSizeInput?.value ?? pcaState.controls?.dotSize,
      fill: fillInput?.value ?? pcaState.controls?.fill,
      border: borderInput?.value ?? pcaState.controls?.border,
      borderWidth: borderWidthInput?.value ?? pcaState.controls?.borderWidth,
      alpha: alphaInput?.value ?? pcaState.controls?.alpha,
      fontSize: fontSizeInput?.value ?? pcaState.controls?.fontSize,
      tsne: {
        perplexity: tsnePerplexityInput?.value ?? pcaState.controls?.tsne?.perplexity,
        learningRate: tsneLearningRateInput?.value ?? pcaState.controls?.tsne?.learningRate,
        iterations: tsneIterationsInput?.value ?? pcaState.controls?.tsne?.iterations,
        exaggeration: tsneExaggerationInput?.value ?? pcaState.controls?.tsne?.exaggeration
      },
      umap: {
        neighbors: umapNeighborsInput?.value ?? pcaState.controls?.umap?.neighbors,
        minDist: umapMinDistInput?.value ?? pcaState.controls?.umap?.minDist,
        learningRate: umapLearningRateInput?.value ?? pcaState.controls?.umap?.learningRate,
        epochs: umapEpochsInput?.value ?? pcaState.controls?.umap?.epochs
      }
    });
    if (pcaState.pointStyleScopes) {
      const scopes = ensurePcaPointStyleScopes();
      Object.assign(scopes.global, createPcaGlobalPointStyle(pcaState.controls));
    }
    return pcaState.controls;
  }

  function createDefaultPcaOwnedState() {
    const controls = createDefaultPcaRuntimeControls();
    return {
      axisSelection: {
        x: 1,
        y: 2,
        z: 3
      },
      axisMeta: [],
      rotation: plot3d.createRotationState({
        x: PCA_3D_DEFAULTS.rotationX,
        y: PCA_3D_DEFAULTS.rotationY
      }),
      rotationPending: false,
      rotationPendingLogged: false,
      axisSettings: createDefaultAxisSettings(),
      gridStyle: null,
      tableFormat: 'standard',
      grouped: {
        replicatesPerGroup: 2
      },
      componentSelection: {
        rule: PCA_DEFAULT_COMPONENT_SELECTION_RULE,
        eigenThreshold: PCA_DEFAULT_EIGEN_THRESHOLD,
        parallelIterations: PCA_DEFAULT_PARALLEL_ITERATIONS,
        includeNonRetainedAxes: false
      },
      biplotShowSampleScores: true,
      screeShowParallel: true,
      loadingsLimit: PCA_LOADINGS_ROW_LIMIT,
      labels: {
        title: getDefaultTitleForMethod('pca')
      },
      pointStyleScopes: normalizePcaPointStyleScopes({}, { controls }),
      lastMethod: 'pca',
      lastAutoDrawEvaluation: null,
      lastDataShape: {
        rows: 0,
        cols: 0
      },
      performance: {
        loadData: null,
        draw: null,
        evaluation: null
      },
      applyingPayload: false,
      fastPointMode: false,
      cachedRender: null,
      resizeWarmupPending: false,
      drawPending: false,
      drawToken: 0,
      dataDirty: true,
      viewDirty: true,
      labelPositions: {
        title: null,
        xLabel: null,
        yLabel: null,
        legend: null
      },
      theme: {
        colorScheme: 'scientific',
        textColor: chartStyle.TEXT_COLOR || '#000000',
        backgroundColor: '#ffffff'
      },
      controls
    };
  }

  const pcaState = createDefaultPcaOwnedState();
  pcaState.scheduleDraw = (opts) => scheduleActivePcaDraw(opts);

  const pcaDrawRuntimeFallback = createDefaultPcaDrawRuntime({
    token: pcaState.drawToken,
    pendingDrawOptions,
    dataDrawTimer: pcaDataDrawTimer,
    dataDrawFrame: pcaDataDrawFrame,
    resizeWarmupPending: pcaState.resizeWarmupPending,
    rotationPending: pcaState.rotationPending,
    rotationPendingLogged: pcaState.rotationPendingLogged
  });
  const pcaRenderRuntimeFallback = createDefaultPcaRenderRuntime({
    cachedRender: pcaState.cachedRender,
    dataDirty: pcaState.dataDirty,
    viewDirty: pcaState.viewDirty
  });

  const pcaSessionsByTabId = new Map();
  // Transient visible-DOM projection bridge. Durable state belongs to the owner session map.
  let projectedPcaSession = null;

  // Compatibility bridge: visible-DOM projection tab id. Delete after every projection entrypoint receives explicit owner tab metadata.
  function getPcaProjectionTabId() {
    return Shared.componentLifecycle?.resolveProjectionTabId?.(pca, projectedPcaSession) || String(pca.__boundTabId || projectedPcaSession?.tabId || '').trim();
  }

  function getPcaProjectionSession(meta = {}, options = {}) {
    const tabId = getPcaProjectionTabId();
    if (!tabId) {
      return null;
    }
    return getPcaSession(tabId, {
      ...(meta || {}),
      tabId,
      reason: meta?.reason || 'pca-projection-session'
    }, {
      create: options.create !== false
    });
  }
  let pcaControlOwnerContext = null;

  function createDefaultPcaRefs(root = null) {
    return {
      root: root || null,
      svg: null,
      svgBox: null,
      rotationRenderer: null,
      tooltip: null,
      pointContextMenu: null,
      renderRow: null,
      renderButton: null,
      autoDrawNotice: null,
      statsSummary: null,
      statsResults: null,
      screeContainer: null,
      screeVarianceRow: null,
      loadingsContainer: null,
      loadingsTable: null,
      dynamicPanels: {}
    };
  }

  function normalizePcaSessionTabId(tabLike = null, meta = {}) {
    const resolved = resolvePcaOwnedRuntimeTabId(tabLike, meta);
    return resolved ? String(resolved).trim() : '';
  }

  function normalizePcaSessionRecord(source = null, tabId = '') {
    const normalizedTabId = String(tabId || '').trim();
    let record = null;
    if (source && typeof source === 'object') {
      if (source.componentKey === 'pca' || Object.prototype.hasOwnProperty.call(source, 'state')) {
        record = cloneSimple(source) || source;
      } else {
        record = {
          version: 1,
          componentKey: 'pca',
          tabId: normalizedTabId,
          hydrated: true,
          state: cloneSimple(source) || {},
          stats: null,
          statsPanel: null,
          notes: {
            text: '',
            open: false
          }
        };
      }
    } else {
      record = createPcaOwnedRuntimeRecord(normalizedTabId);
    }
    record = normalizePcaOwnedRuntimeRecord(record) || createPcaOwnedRuntimeRecord(normalizedTabId);
    record.version = Number(record.version) || 1;
    record.componentKey = 'pca';
    record.tabId = normalizedTabId || String(record.tabId || '').trim();
    record.hydrated = !!record.hydrated;
    return record;
  }

  function createPcaSession({
    tabId,
    root = null,
    initialState = null
  } = {}) {
    const normalizedTabId = String(tabId || '').trim();
    const session = {
      componentKey: 'pca',
      tabId: normalizedTabId,
      root: root || null,
      state: normalizePcaSessionRecord(initialState, normalizedTabId),
      refs: createDefaultPcaRefs(root || null),
      cache: {
        renderRuntime: createDefaultPcaRenderRuntime(),
        analysisRuntime: createDefaultPcaAnalysisRuntime(),
        statsRuntime: null
      },
      listeners: new Map(),
      timers: {
        drawRuntime: createDefaultPcaDrawRuntime()
      },
      workers: new Map(),
      managers: {
        hot: null,
        dataViews: null,
        layout: null
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    return ensurePcaSessionOwnershipShape(session);
  }

  function ensurePcaSessionOwnershipShape(session) {
    if (!session || typeof session !== 'object') {
      return null;
    }
    session.componentKey = 'pca';
    session.tabId = String(session.tabId || '').trim();
    session.root = session.root || null;
    session.state = normalizePcaSessionRecord(session.state, session.tabId);
    session.refs = session.refs && typeof session.refs === 'object' ? session.refs : createDefaultPcaRefs(session.root || null);
    session.refs.root = session.refs.root || session.root || null;
    session.refs.dynamicPanels = session.refs.dynamicPanels && typeof session.refs.dynamicPanels === 'object' ? session.refs.dynamicPanels : {};
    session.cache = session.cache && typeof session.cache === 'object' ? session.cache : {};
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'renderRuntime')) {
      session.cache.renderRuntime = createDefaultPcaRenderRuntime();
    }
    session.cache.renderRuntime = normalizePcaRenderRuntime(session.cache.renderRuntime);
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'analysisRuntime')) {
      session.cache.analysisRuntime = createDefaultPcaAnalysisRuntime({
        cache: session.cache.renderRuntime.cachedRender || null
      });
    }
    session.cache.analysisRuntime = normalizePcaAnalysisRuntime(session.cache.analysisRuntime);
    if (!session.cache.analysisRuntime.cache && session.cache.renderRuntime.cachedRender) {
      session.cache.analysisRuntime.cache = normalizePcaAnalysisCachePayload(session.cache.renderRuntime.cachedRender);
    }
    if (session.cache.analysisRuntime.cache) {
      session.cache.renderRuntime.cachedRender = session.cache.analysisRuntime.cache;
    }
    if (!Object.prototype.hasOwnProperty.call(session.cache, 'statsRuntime')) {
      session.cache.statsRuntime = null;
    }
    session.listeners = session.listeners instanceof Map ? session.listeners : new Map();
    session.timers = session.timers && typeof session.timers === 'object' ? session.timers : {};
    if (Object.prototype.hasOwnProperty.call(session.timers, 'dataDrawTimer') || Object.prototype.hasOwnProperty.call(session.timers, 'dataDrawFrame')) {
      session.timers.drawRuntime = createDefaultPcaDrawRuntime({
        ...(session.timers.drawRuntime || {}),
        dataDrawTimer: session.timers.dataDrawTimer || null,
        dataDrawFrame: session.timers.dataDrawFrame || null
      });
      delete session.timers.dataDrawTimer;
      delete session.timers.dataDrawFrame;
    }
    if (!Object.prototype.hasOwnProperty.call(session.timers, 'drawRuntime')) {
      session.timers.drawRuntime = createDefaultPcaDrawRuntime();
    }
    session.timers.drawRuntime = normalizePcaDrawRuntime(session.timers.drawRuntime);
    session.workers = session.workers instanceof Map ? session.workers : new Map();
    session.managers = session.managers && typeof session.managers === 'object' ? session.managers : {};
    if (!Object.prototype.hasOwnProperty.call(session.managers, 'hot')) {
      session.managers.hot = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session.managers, 'dataViews')) {
      session.managers.dataViews = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session.managers, 'layout')) {
      session.managers.layout = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session.managers, 'fileHandle')) {
      session.managers.fileHandle = null;
    }
    session.updatedAt = Number.isFinite(Number(session.updatedAt)) ? Number(session.updatedAt) : Date.now();
    return session;
  }

  function isPcaSessionActiveForModuleState(session) {
    if (!session || typeof session !== 'object' || !String(session.tabId || '').trim()) {
      return false;
    }
    return Shared.componentLifecycle?.canOwnerUseLiveProjection?.('pca', session, {
      component: pca,
      projectedSession: projectedPcaSession,
      session,
      root: pcaRoot || null
    }) === true;
  }

  function createDefaultPcaDrawRuntime(source = {}) {
    const src = source && typeof source === 'object' ? source : {};
    const rawToken = Number(src.token ?? src.drawToken);
    return {
      token: Number.isFinite(rawToken) && rawToken >= 0 ? rawToken : 0,
      pendingDrawOptions: cloneSimple(src.pendingDrawOptions || src.pendingOptions || null) || {},
      dataDrawTimer: src.dataDrawTimer || null,
      dataDrawFrame: src.dataDrawFrame || null,
      resizeWarmupPending: !!src.resizeWarmupPending,
      rotationPending: !!src.rotationPending,
      rotationPendingLogged: !!src.rotationPendingLogged,
      rotationActive: !!src.rotationActive,
      rotationQueued: !!src.rotationQueued,
      rotationViewport: cloneSimple(src.rotationViewport) || null,
      inFlight: Math.max(0, Number(src.inFlight ?? (src.inProgress ? 1 : 0)) || 0),
      updatedAt: Date.now()
    };
  }

  function normalizePcaDrawRuntime(runtime) {
    return createDefaultPcaDrawRuntime(runtime && typeof runtime === 'object' ? runtime : {});
  }

  function syncPcaDrawRuntimeMirror(runtime, session = null, options = {}) {
    if (!runtime) {
      return null;
    }
    const shouldMirror = options.mirrorActive !== false
      && (!session || isPcaSessionActiveForModuleState(session));
    if (shouldMirror) {
      pcaState.drawToken = Number(runtime.token) || 0;
      pendingDrawOptions = cloneSimple(runtime.pendingDrawOptions || null) || {};
      pcaDataDrawTimer = runtime.dataDrawTimer || null;
      pcaDataDrawFrame = runtime.dataDrawFrame || null;
      pcaState.resizeWarmupPending = !!runtime.resizeWarmupPending;
      pcaState.rotationPending = !!runtime.rotationPending;
      pcaState.rotationPendingLogged = !!runtime.rotationPendingLogged;
    }
    return runtime;
  }

  function getPcaDrawRuntime(session = null, options = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (shaped?.timers) {
      if (options.seedFromActive === true && !shaped.timers.drawRuntime) {
        shaped.timers.drawRuntime = createDefaultPcaDrawRuntime({
          token: pcaState.drawToken,
          pendingDrawOptions,
          dataDrawTimer: pcaDataDrawTimer,
          dataDrawFrame: pcaDataDrawFrame,
          resizeWarmupPending: pcaState.resizeWarmupPending,
          rotationPending: pcaState.rotationPending,
          rotationPendingLogged: pcaState.rotationPendingLogged
        });
      }
      shaped.timers.drawRuntime = normalizePcaDrawRuntime(shaped.timers.drawRuntime);
      return syncPcaDrawRuntimeMirror(shaped.timers.drawRuntime, shaped, options);
    }
    if (options.syncFallbackFromState === true) {
      Object.assign(pcaDrawRuntimeFallback, createDefaultPcaDrawRuntime({
        token: pcaState.drawToken,
        pendingDrawOptions,
        dataDrawTimer: pcaDataDrawTimer,
        dataDrawFrame: pcaDataDrawFrame,
        resizeWarmupPending: pcaState.resizeWarmupPending,
        rotationPending: pcaState.rotationPending,
        rotationPendingLogged: pcaState.rotationPendingLogged
      }));
    }
    return syncPcaDrawRuntimeMirror(pcaDrawRuntimeFallback, null);
  }

  function updatePcaDrawRuntime(session = null, mutator = null, options = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const runtime = getPcaDrawRuntime(shaped, {
      syncFallbackFromState: !shaped,
      seedFromActive: options.seedFromActive === true,
      mirrorActive: options.mirrorActive !== false
    });
    if (typeof mutator === 'function') {
      mutator(runtime);
    }
    runtime.updatedAt = Date.now();
    if (shaped) {
      shaped.timers.drawRuntime = runtime;
      shaped.updatedAt = Date.now();
    }
    return syncPcaDrawRuntimeMirror(runtime, shaped, options);
  }

  function createDefaultPcaRenderRuntime(source = {}) {
    const src = source && typeof source === 'object' ? source : {};
    return {
      cachedRender: src.cachedRender || src.runtimeCache || null,
      dataDirty: src.dataDirty !== false,
      viewDirty: src.viewDirty !== false,
      updatedAt: Date.now()
    };
  }

  function normalizePcaRenderRuntime(runtime) {
    if (!runtime || typeof runtime !== 'object') {
      return createDefaultPcaRenderRuntime({});
    }
    runtime.cachedRender = runtime.cachedRender || runtime.runtimeCache || null;
    runtime.dataDirty = runtime.dataDirty !== false;
    runtime.viewDirty = runtime.viewDirty !== false;
    runtime.updatedAt = Number.isFinite(Number(runtime.updatedAt)) ? runtime.updatedAt : Date.now();
    return runtime;
  }

  function syncPcaRenderRuntimeMirror(runtime, session = null, options = {}) {
    if (!runtime) {
      return null;
    }
    const shouldMirror = options.mirrorActive !== false
      && (!session || isPcaSessionActiveForModuleState(session));
    if (shouldMirror) {
      pcaState.cachedRender = runtime.cachedRender || null;
      pcaState.dataDirty = runtime.dataDirty !== false;
      pcaState.viewDirty = runtime.viewDirty !== false;
    }
    return runtime;
  }

  function getPcaRenderRuntime(session = null, options = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (shaped?.cache) {
      if (options.seedFromActive === true && !shaped.cache.renderRuntime) {
        shaped.cache.renderRuntime = createDefaultPcaRenderRuntime({
          cachedRender: pcaState.cachedRender,
          dataDirty: pcaState.dataDirty,
          viewDirty: pcaState.viewDirty
        });
      }
      shaped.cache.renderRuntime = normalizePcaRenderRuntime(shaped.cache.renderRuntime);
      if (options.seedFromActive === true && isPcaSessionActiveForModuleState(shaped)) {
        if (pcaState.dataDirty === true) {
          shaped.cache.renderRuntime.dataDirty = true;
          shaped.cache.renderRuntime.viewDirty = true;
          shaped.cache.renderRuntime.cachedRender = pcaState.cachedRender || shaped.cache.renderRuntime.cachedRender || null;
        } else if (pcaState.viewDirty === true) {
          shaped.cache.renderRuntime.viewDirty = true;
          shaped.cache.renderRuntime.cachedRender = pcaState.cachedRender || shaped.cache.renderRuntime.cachedRender || null;
        }
      }
      return syncPcaRenderRuntimeMirror(shaped.cache.renderRuntime, shaped, options);
    }
    if (options.syncFallbackFromState === true) {
      Object.assign(pcaRenderRuntimeFallback, createDefaultPcaRenderRuntime({
        cachedRender: pcaState.cachedRender,
        dataDirty: pcaState.dataDirty,
        viewDirty: pcaState.viewDirty
      }));
    }
    return syncPcaRenderRuntimeMirror(pcaRenderRuntimeFallback, null);
  }

  function updatePcaRenderRuntime(session = null, mutator = null, options = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const runtime = getPcaRenderRuntime(shaped, {
      syncFallbackFromState: !shaped,
      seedFromActive: options.seedFromActive === true,
      mirrorActive: options.mirrorActive !== false
    });
    if (typeof mutator === 'function') {
      mutator(runtime);
    }
    runtime.updatedAt = Date.now();
    if (shaped) {
      shaped.cache.renderRuntime = runtime;
      if (shaped.state?.state) {
        shaped.state.state.dataDirty = runtime.dataDirty !== false;
        shaped.state.state.viewDirty = runtime.viewDirty !== false;
      }
      shaped.updatedAt = Date.now();
    }
    return syncPcaRenderRuntimeMirror(runtime, shaped, options);
  }

  function getPcaSessionForDrawOptions(options = {}, {
    create = true
  } = {}) {
    const tabId = resolvePcaAsyncTabId(options) || resolvePcaOwnedRuntimeTabId(null, options || {}) || getPcaProjectionTabId() || null;
    return tabId ?
      getPcaSession(tabId, {
        ...(options || {}),
        tabId,
        reason: options?.reason || 'pca-session-for-draw-options'
      }, {
        create
      }) :
      getActivePcaSessionForState();
  }

  function rebindPcaProjectionDomRefs(tabLike = null) {
    const root = resolvePcaRoot(tabLike || getPcaProjectionTabId() || null);
    if (!root) {
      return false;
    }
    pcaRoot = root;
    pcaSvgBoxRef = root.querySelector?.('#pcaGraphPanel .svgbox') || null;
    const byId = id => root.querySelector?.(`#${id}`) || null;
    pcaViewMode = byId('pcaViewMode');
    pcaViewModeInput = pcaViewMode;
    pcaXAxis = byId('pcaXAxis');
    pcaYAxis = byId('pcaYAxis');
    pcaZAxis = byId('pcaZAxis');
    pcaAxis2DControls = byId('pcaAxis2DControls');
    pcaAxis3DControl = byId('pcaAxis3DControl');
    pcaMethod = byId('pcaMethod');
    pcaFill = byId('pcaFill');
    pcaBorder = byId('pcaBorder');
    pcaBorderWidth = byId('pcaBorderWidth');
    pcaDotSize = byId('pcaDotSize');
    pcaAlpha = byId('pcaAlpha');
    pcaAlphaVal = byId('pcaAlphaVal');
    pcaFontSize = byId('pcaFontSize');
    pcaFontSizeVal = byId('pcaFontSizeVal');
    pcaShowGrid = byId('pcaShowGrid');
    pcaShowFrame = byId('pcaShowFrame');
    pcaShowLegend = byId('pcaShowLegend');
    pcaShowLegendInput = pcaShowLegend;
    pcaStandardizeVariables = byId('pcaStandardizeVariables');
    pcaPreprocessing = byId('pcaPreprocessing');
    pcaTsneControls = byId('pcaTsneControls');
    pcaTsnePerplexity = byId('pcaTsnePerplexity');
    pcaTsneLearningRate = byId('pcaTsneLearningRate');
    pcaTsneIterations = byId('pcaTsneIterations');
    pcaTsneExaggeration = byId('pcaTsneExaggeration');
    pcaUmapControls = byId('pcaUmapControls');
    pcaUmapNeighbors = byId('pcaUmapNeighbors');
    pcaUmapMinDist = byId('pcaUmapMinDist');
    pcaUmapLearningRate = byId('pcaUmapLearningRate');
    pcaUmapEpochs = byId('pcaUmapEpochs');
    pcaEls = {
      ...(pcaEls || {}),
      tableFormat: byId('pcaTableFormat'),
      groupedControls: byId('pcaGroupedControls'),
      groupedReplicates: byId('pcaGroupedReplicates')
    };
    pcaStatsSummary = root.querySelector?.('#pcaStatsSummary') || null;
    pcaStatsResults = root.querySelector?.('#pcaStatsResults') || null;
    pcaScreeVarianceRow = root.querySelector?.('#pcaScreeVarianceRow') || null;
    pcaScreeContainer = root.querySelector?.('#pcaScreeContainer') || null;
    pcaScreePlot = root.querySelector?.('#pcaScreePlot') || pcaScreeContainer || null;
    pcaScreeExportControls = root.querySelector?.('#pcaScreeExportControls') || null;
    pcaScreeShowParallelInput = root.querySelector?.('#pcaScreeShowParallel') || null;
    pcaVarianceSummary = root.querySelector?.('#pcaVarianceSummary') || null;
    pcaVarianceList = root.querySelector?.('#pcaVarianceList') || null;
    pcaEigenTableContainer = root.querySelector?.('#pcaEigenTableContainer') || null;
    pcaEigenTableWrapper = root.querySelector?.('#pcaEigenTableWrapper') || null;
    pcaExportEigenTableBtn = root.querySelector?.('#pcaExportEigenTable') || null;
    pcaDefaultEigenExportHost = pcaExportEigenTableBtn?.parentElement || null;
    pcaLoadingsContainer = root.querySelector?.('#pcaLoadingsContainer') || null;
    pcaLoadingsTable = root.querySelector?.('#pcaLoadingsTable') || null;
    pcaLoadingsActions = root.querySelector?.('#pcaLoadingsContainer .loadings-card__actions') || null;
    pcaDefaultLoadingsActionsHost = pcaLoadingsActions?.parentElement || null;
    return true;
  }

  function syncPcaSessionRefsFromActive(session = null) {
    const shaped = ensurePcaSessionOwnershipShape(session || projectedPcaSession);
    if (!shaped) {
      return null;
    }
    if (shaped.tabId && !isPcaSessionActiveForModuleState(shaped)) {
      return shaped;
    }
    shaped.root = pcaRoot || shaped.root || null;
    shaped.refs.root = shaped.root || shaped.refs.root || null;
    shaped.refs.svgBox = pcaSvgBoxRef || shaped.refs.svgBox || null;
    shaped.refs.tooltip = pcaTooltipEl || shaped.refs.tooltip || null;
    shaped.refs.pointContextMenu = pcaPointContextMenu || shaped.refs.pointContextMenu || null;
    shaped.refs.renderRow = pcaRenderRowEl || shaped.refs.renderRow || null;
    shaped.refs.renderButton = pcaRenderButtonEl || shaped.refs.renderButton || null;
    shaped.refs.autoDrawNotice = pcaAutoDrawNoticeEl || shaped.refs.autoDrawNotice || null;
    shaped.refs.statsSummary = getPcaNodeById('pcaStatsSummary', shaped.tabId) || shaped.refs.statsSummary || null;
    shaped.refs.statsResults = getPcaNodeById('pcaStatsResults', shaped.tabId) || shaped.refs.statsResults || null;
    shaped.refs.screeContainer = getPcaNodeById('pcaScreeContainer', shaped.tabId) || shaped.refs.screeContainer || null;
    shaped.refs.screeVarianceRow = getPcaNodeById('pcaScreeVarianceRow', shaped.tabId) || shaped.refs.screeVarianceRow || null;
    shaped.refs.loadingsContainer = getPcaNodeById('pcaLoadingsContainer', shaped.tabId) || shaped.refs.loadingsContainer || null;
    shaped.refs.loadingsTable = getPcaNodeById('pcaLoadingsTable', shaped.tabId) || shaped.refs.loadingsTable || null;
    shaped.refs.dynamicPanels = shaped.refs.dynamicPanels && typeof shaped.refs.dynamicPanels === 'object' ? shaped.refs.dynamicPanels : {};
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function syncPcaSessionManagersFromActive(session = null) {
    const shaped = ensurePcaSessionOwnershipShape(session || projectedPcaSession);
    if (!shaped) {
      return null;
    }
    const sessionIsActive = !shaped.tabId || isPcaSessionActiveForModuleState(shaped);
    const activeHot = pcaState.hot || pcaHotInstance || null;
    const activeHotOwner = getPcaHotOwnerTabId(activeHot);
    if (activeHot && (!shaped.tabId || !activeHotOwner || activeHotOwner === shaped.tabId)) {
      shaped.managers.hot = activeHot;
      shaped.managers.dataViews = activeHot.__pcaDataViewsManager || shaped.managers.dataViews || null;
    }
    if (!sessionIsActive && (!activeHot || activeHotOwner !== shaped.tabId)) {
      return shaped;
    }
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function getActivePcaSessionForState() {
    if (projectedPcaSession && (!pca.__boundTabId || String(projectedPcaSession.tabId || '') === String(pca.__boundTabId || ''))) {
      return ensurePcaSessionOwnershipShape(projectedPcaSession);
    }
    const tabId = getPcaProjectionTabId() || resolvePcaOwnedRuntimeTabId(null, {}) || null;
    return tabId ? getPcaSession(tabId, {
      tabId,
      reason: 'active-pca-session'
    }, {
      create: true
    }) : null;
  }

  function getPcaHotOwnerTabId(hotInstance = null) {
    return String(Shared.componentLifecycle?.resolveOwnedObjectTabId?.(hotInstance, 'pca') || '').trim();
  }

  function getPcaActiveTabId() {
    return String(Shared.componentLifecycle?.resolveActiveComponentTabId?.('pca', pca, projectedPcaSession) || '').trim();
  }

  function getPcaCallbackOwner(meta = {}) {
    const target = meta?.target || meta?.event?.currentTarget || meta?.event?.target || null;
    const hot = meta?.hot || meta?.hotInstance || null;
    const tabId = String(
      meta?.tabId ||
      meta?.workspaceTabId ||
      getPcaHotOwnerTabId(hot) ||
      resolvePcaTabIdFromNode(target) ||
      getPcaActiveTabId() ||
      ''
    ).trim();
    const session = tabId ?
      getPcaSession(tabId, {
        ...(meta || {}),
        tabId,
        reason: meta?.reason || 'pca-callback-owner'
      }, {
        create: true
      }) :
      getActivePcaSessionForState();
    return {
      tabId,
      session,
      hot: hot || null
    };
  }

  function isPcaCallbackOwnerActive(owner = null) {
    const ownerTabId = String(owner?.tabId || owner?.session?.tabId || '').trim();
    if (!ownerTabId) {
      return false;
    }
    return !!owner?.session && isPcaSessionActiveForModuleState(owner.session);
  }

  function runPcaOwnedCallback(owner = null, callback = null, meta = {}) {
    if (typeof callback !== 'function') {
      return undefined;
    }
    const resolvedOwner = owner?.session || owner?.tabId ? owner : getPcaCallbackOwner(meta);
    const ownerTabId = String(resolvedOwner?.tabId || resolvedOwner?.session?.tabId || '').trim();
    if (!isPcaCallbackOwnerActive(resolvedOwner)) {
      debugLog('Debug: pca callback skipped for inactive owner', {
        ownerTabId: ownerTabId || null,
        activeTabId: getPcaActiveTabId() || null,
        reason: meta?.reason || 'pca-owned-callback'
      });
      return undefined;
    }
    const previousOwner = pcaControlOwnerContext;
    pcaControlOwnerContext = resolvedOwner;
    if (ownerTabId) {
      bindPcaSessionForTab(ownerTabId, {
        ...(meta || {}),
        tabId: ownerTabId,
        reason: meta?.reason || 'pca-owned-callback-bind'
      });
    }
    try {
      return callback(resolvedOwner);
    } finally {
      if (resolvedOwner?.session && isPcaSessionActiveForModuleState(resolvedOwner.session)) {
        capturePcaSessionStateFromActive(resolvedOwner.session, {
          ...(meta || {}),
          tabId: ownerTabId || null,
          reason: meta?.reason || 'pca-owned-callback-final-sync'
        });
      }
      pcaControlOwnerContext = previousOwner;
    }
  }

  function runPcaEventOwnerCallback(event, reason, callback) {
    const owner = getPcaCallbackOwner({
      event,
      target: event?.currentTarget || event?.target || null,
      reason
    });
    return runPcaOwnedCallback(owner, callback, {
      event,
      reason
    });
  }

  function getPcaSessionForHot(hotInstance = null, meta = {}, options = {}) {
    const tabId = getPcaHotOwnerTabId(hotInstance);
    if (tabId) {
      return getPcaSession(tabId, {
        ...(meta || {}),
        tabId
      }, {
        create: options.create === true
      });
    }
    return options.fallbackActive === false ? null : getActivePcaSessionForState();
  }

  function schedulePcaDrawForSession(session = null, options = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (!shaped) {
      return false;
    }
    if (Shared.hot?.shouldDeferOwnerProjectionDraw?.(shaped, options)) {
      return false;
    }
    const sourceOptions = options && typeof options === 'object' ? options : {};
    const scheduleOptions = Shared.componentLifecycle?.sanitizeDrawOptions ?
      Shared.componentLifecycle.sanitizeDrawOptions(sourceOptions, {
        tabId: shaped.tabId || null,
        reason: 'pca-session-draw'
      }) :
      {
        ...sourceOptions,
        tabId: shaped.tabId || sourceOptions.tabId || undefined,
        reason: sourceOptions.reason || 'pca-session-draw'
      };
    updatePcaDrawRuntime(shaped, runtime => {
      runtime.pendingDrawOptions = scheduleOptions;
    }, {
      mirrorActive: isPcaSessionActiveForModuleState(shaped)
    });
    if (!isPcaSessionActiveForModuleState(shaped)) {
      shaped.state.drawPending = true;
      shaped.updatedAt = Date.now();
      return false;
    }
    if (typeof scheduleDrawPca !== 'function') {
      return false;
    }
    shaped.state.drawPending = false;
    shaped.updatedAt = Date.now();
    scheduleDrawPca(scheduleOptions);
    return true;
  }

  function scheduleActivePcaDraw(options = {}) {
    const session = getActivePcaSessionForState();
    let scheduleOptions = options;
    if (options?.viewOnly === true && pcaState.rotationPending === true && session) {
      const rotation = typeof plot3d.createRotationState === 'function'
        ? plot3d.createRotationState({
          x: Number(pcaState.rotation?.x) || 0,
          y: Number(pcaState.rotation?.y) || 0,
          z: Number(pcaState.rotation?.z) || 0
        })
        : pcaState.rotation;
      commitPcaRotationState(rotation, session, 'pca-active-scheduler-rotation');
      updatePcaDrawRuntime(session, runtime => {
        runtime.rotationPending = true;
        runtime.rotationPendingLogged = !!pcaState.rotationPendingLogged;
      });
      scheduleOptions = { ...options, rotationUpdate: true };
    }
    return schedulePcaDrawForSession(session, scheduleOptions);
  }

  function getPcaSession(tabLike = null, meta = {}, options = {}) {
    const tabId = normalizePcaSessionTabId(tabLike, meta);
    if (!tabId) {
      return options.fallbackActive === true ? ensurePcaSessionOwnershipShape(projectedPcaSession) : null;
    }
    let session = pcaSessionsByTabId.get(tabId) || null;
    if (!session && options.create === true) {
      session = createPcaSession({
        tabId,
        root: resolvePcaRoot(tabLike || tabId || null) || (String(getPcaProjectionTabId() || '') === tabId ? pcaRoot : null),
        initialState: options.initialState || null
      });
      pcaSessionsByTabId.set(tabId, session);
    }
    return ensurePcaSessionOwnershipShape(session);
  }

  function bindPcaSessionForTab(tabLike = null, meta = {}) {
    const tabId = normalizePcaSessionTabId(tabLike, meta);
    if (!tabId) {
      return null;
    }
    const session = getPcaSession(tabId, {
      ...(meta || {}),
      tabId,
      reason: meta?.reason || 'pca-session-bind'
    }, {
      create: true
    });
    if (!session) {
      return null;
    }
    projectedPcaSession = session;
    pca.__pcaSessionTabId = session.tabId;
    if (!pca.__boundTabId) {
      pca.__boundTabId = session.tabId;
    }
    session.root = resolvePcaRoot(tabLike || tabId || null) || pcaRoot || session.root || null;
    if (session.root) {
      pcaRoot = session.root;
    }
    syncPcaSessionRefsFromActive(session);
    syncPcaSessionManagersFromActive(session);
    session.updatedAt = Date.now();
    return session;
  }

  function setPcaSessionStateFromRuntimeRecord(record, meta = {}) {
    if (!record || typeof record !== 'object') {
      return null;
    }
    const tabId = String(record.tabId || meta?.tabId || getPcaProjectionTabId() || '').trim();
    if (!tabId) {
      return null;
    }
    const session = getPcaSession(tabId, {
      ...(meta || {}),
      tabId,
      reason: meta?.reason || 'pca-session-state-from-runtime'
    }, {
      create: true
    });
    if (!session) {
      return null;
    }
    session.state = normalizePcaSessionRecord(record, tabId);
    session.state.hydrated = true;
    if (session.state.state && typeof session.state.state === 'object') {
      updatePcaRenderRuntime(session, renderRuntime => {
        renderRuntime.dataDirty = session.state.state.dataDirty !== false;
        renderRuntime.viewDirty = session.state.state.viewDirty !== false;
      });
    }
    session.updatedAt = Date.now();
    return session;
  }

  function normalizePcaNotesState(value = null) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      text: source.text == null ? '' : String(source.text),
      open: !!source.open
    };
  }

  function canUsePcaNotesControl(control = null, session = null) {
    if (!control || typeof control !== 'object' || !control.root || !control.root.isConnected) {
      return false;
    }
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const ownerTabId = String(owner?.tabId || getPcaProjectionTabId() || '').trim();
    const root = owner?.root || resolvePcaRoot(ownerTabId || null) || pcaRoot || null;
    if (root && control.root !== root && !root.contains?.(control.root)) {
      return false;
    }
    const controlOwnerTabId = String(Shared.componentLifecycle?.resolveOwnedObjectTabId?.(control, 'pca') || '').trim();
    return !(ownerTabId && controlOwnerTabId && ownerTabId !== controlOwnerTabId);
  }

  function capturePcaNotesForSession(session = null) {
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const stored = normalizePcaNotesState(owner?.state?.notes || notesState);
    if (!owner || !shouldMirrorPcaSessionToActive(owner)) {
      return stored;
    }
    const control = canUsePcaNotesControl(notesState.control, owner) ? notesState.control : null;
    const captured = {
      text: control && typeof control.getValue === 'function' ? String(control.getValue() ?? '') : stored.text,
      open: control && typeof control.isOpen === 'function' ? !!control.isOpen() : stored.open
    };
    owner.state.notes = normalizePcaNotesState(captured);
    notesState.text = captured.text;
    notesState.open = captured.open;
    return normalizePcaNotesState(captured);
  }

  function patchPcaNotesForOwner(owner = null, patch = {}, reason = 'pca-notes-change') {
    const ownerSession = ensurePcaSessionOwnershipShape(owner?.session || owner || getActivePcaSessionForState());
    if (!ownerSession?.state) {
      return null;
    }
    const next = normalizePcaNotesState({
      ...normalizePcaNotesState(ownerSession.state.notes),
      ...(patch || {})
    });
    ownerSession.state.notes = next;
    ownerSession.updatedAt = Date.now();
    if (shouldMirrorPcaSessionToActive(ownerSession)) {
      notesState.text = next.text;
      notesState.open = next.open;
    }
    persistPcaSessionOwnedState(ownerSession, reason);
    if (!writePcaOwnerConfigThrough(ownerSession, reason, ['notes'])) {
      markPcaPayloadDirtyForSession(ownerSession, reason);
    }
    return next;
  }

  function applyPcaSessionStateToActive(session = null, meta = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (!shaped) {
      return false;
    }
    projectedPcaSession = shaped;
    pca.__pcaSessionTabId = shaped.tabId;
    pca.__pcaOwnedRuntimeTabId = shaped.tabId;
    const record = shaped.state;
    applyPcaOwnedStateToActive(record.state, {
      ...(meta || {}),
      tabId: shaped.tabId,
      reason: meta?.reason || 'pca-session-apply-state'
    });
    updatePcaRenderRuntime(shaped, renderRuntime => {
      renderRuntime.dataDirty = pcaState.dataDirty !== false;
      renderRuntime.viewDirty = pcaState.viewDirty !== false;
      renderRuntime.cachedRender = renderRuntime.cachedRender || pcaState.cachedRender || null;
    }, {
      seedFromActive: true
    });
    updatePcaDrawRuntime(shaped, drawRuntime => {
      drawRuntime.rotationPending = false;
      drawRuntime.rotationPendingLogged = false;
      drawRuntime.resizeWarmupPending = false;
    }, {
      seedFromActive: true
    });
    setPcaResultsState(record.results || {
      stats: record.stats || null,
      statsPanel: record.statsPanel || record.stats?.statsPanel || {}
    }, shaped, {
      mirrorActive: true
    });
    if (record.notes && typeof record.notes === 'object') {
      const projectedNotes = normalizePcaNotesState(record.notes);
      notesState.text = projectedNotes.text;
      notesState.open = projectedNotes.open;
      if (canUsePcaNotesControl(notesState.control, shaped)) {
        notesState.control.setValue(projectedNotes.text);
        notesState.control.setOpen(projectedNotes.open);
      }
    }
    syncPcaSessionRefsFromActive(shaped);
    syncPcaSessionManagersFromActive(shaped);
    const durableStatsPanel = getPcaStatsPanelSnapshot(shaped);
    if(pcaStatsPanelSnapshotHasContent(durableStatsPanel)){
      restorePcaStatsPanelState(durableStatsPanel, { session: shaped, clearWhenMissing: false });
    }
    return true;
  }

  function capturePcaSessionStateFromActive(session = null, meta = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (!shaped) {
      return null;
    }
    const captureContext = Shared.componentLifecycle?.resolveOwnerCaptureContext?.('pca', {
      ...(meta || {}),
      tabId: shaped.tabId
    }, {
      component: pca,
      projectedSession: projectedPcaSession,
      session: shaped,
      root: shaped.root || null,
      allowMissingWorkspaceOwner: true
    }) || null;
    const canCaptureLive = captureContext
      ? captureContext.canCaptureLive === true
      : isPcaSessionActiveForModuleState(shaped);
    if (!canCaptureLive) {
      // Inactive owners are already canonical in their session. Reading module globals,
      // visible controls, refs, or managers here would capture the active sibling tab.
      return normalizePcaSessionRecord(shaped.state, shaped.tabId);
    }
    const capturedNotes = capturePcaNotesForSession(shaped);
    getPcaRenderRuntime(shaped, { seedFromActive: true });
    getPcaDrawRuntime(shaped, { seedFromActive: true });
    getPcaAnalysisRuntime(shaped, { seedFromRenderRuntime: true });
    const statsSnapshot = getPcaStatsSnapshot(shaped);
    const panelSnapshot = capturePcaStatsPanelState(shaped.state?.results?.statsPanel || shaped.state?.statsPanel || getPcaStatsPanelSnapshot(shaped), { session: shaped });
    shaped.state = normalizePcaSessionRecord({
      ...(shaped.state || {}),
      componentKey: 'pca',
      tabId: shaped.tabId,
      hydrated: true,
      state: snapshotPcaOwnedStateFromActive(),
      results: normalizePcaResultsState({
        ...getPcaResultsState(shaped),
        stats: cloneSimple(statsSnapshot) || null,
        statsPanel: panelSnapshot
      }),
      stats: cloneSimple(statsSnapshot) || null,
      statsPanel: panelSnapshot,
      notes: capturedNotes
    }, shaped.tabId);
    shaped.updatedAt = Date.now();
    syncPcaSessionRefsFromActive(shaped);
    syncPcaSessionManagersFromActive(shaped);
    return shaped.state;
  }
  let emptyPayloadTemplate = null;

  function resolvePcaAsyncScope() {
    const scope = pca.__asyncScope || Shared.componentLifecycle?.createAsyncScope?.('pca') || null;
    if (scope) {
      pca.__asyncScope = scope;
    }
    return scope;
  }

  function resolvePcaTabIdFromNode(node) {
    return Shared.componentLifecycle?.resolveTabIdFromTarget?.(node) || null;
  }

  function resolvePcaAsyncTabId(meta = {}) {
    return meta?.tabId ||
      meta?.workspaceTabId ||
      meta?.tab?.id ||
      meta?.__workspaceSessionMeta?.tabId ||
      getPcaProjectionTabId() ||
      pcaHotInstance?.__pcaTabId ||
      resolvePcaTabIdFromNode(pcaRoot) ||
      Shared.workspaceTabs?.getActiveSessionInfo?.('pca')?.tabId ||
      global.Main?.session?.workspaceState?.activeTabId ||
      null;
  }

  function createPcaDrawAsyncState(drawOpts = {}, drawToken = 0) {
    const sessionMeta = drawOpts.__workspaceSessionMeta && typeof drawOpts.__workspaceSessionMeta === 'object' ?
      drawOpts.__workspaceSessionMeta :
      null;
    const tabId = resolvePcaAsyncTabId({
      ...drawOpts,
      __workspaceSessionMeta: sessionMeta
    });
    if (!tabId) {
      debugLog('Debug: pca draw async scope skipped without tab ownership', {
        reason: drawOpts.reason || drawOpts.source || 'pca-draw'
      });
      return null;
    }
    const scope = resolvePcaAsyncScope();
    if (!scope || typeof scope.nextToken !== 'function') {
      return null;
    }
    const meta = scope.nextToken({
      ...(sessionMeta || {}),
      tabId,
      componentKey: 'pca',
      reason: drawOpts.reason || drawOpts.source || 'pca-draw',
      drawToken
    });
    return meta ? {
      scope,
      meta
    } : null;
  }

  function isPcaDrawAsyncCurrent(drawToken, asyncState = null) {
    const tabId = asyncState?.meta?.tabId || null;
    const session = tabId ? getPcaSession(tabId, {
      tabId,
      reason: 'pca-async-current'
    }, {
      create: false
    }) : getActivePcaSessionForState();
    const runtime = getPcaDrawRuntime(session, {
      syncFallbackFromState: !session
    });
    if (drawToken !== runtime.token) {
      return false;
    }
    if (!asyncState) {
      return true;
    }
    return typeof asyncState.scope?.isCurrent === 'function' ?
      asyncState.scope.isCurrent(asyncState.meta) :
      false;
  }

  function logPcaStaleAsyncResult(kind, drawToken, asyncState = null) {
    const asyncCurrent = asyncState && typeof asyncState.scope?.isCurrent === 'function' ?
      asyncState.scope.isCurrent(asyncState.meta) :
      null;
    const tabId = asyncState?.meta?.tabId || null;
    const session = tabId ? getPcaSession(tabId, {
      tabId,
      reason: 'pca-stale-async-log'
    }, {
      create: false
    }) : getActivePcaSessionForState();
    const runtime = getPcaDrawRuntime(session, {
      syncFallbackFromState: !session
    });
    debugLog(`Debug: pca ${kind} result ignored`, {
      reason: asyncCurrent === false ? 'stale-async-scope' : 'stale-token',
      drawToken,
      current: runtime?.token || 0,
      tabId,
      asyncGeneration: asyncState?.meta?.asyncGeneration || null
    });
  }

  function schedulePcaScopedFrame(meta = {}, fn, onStale = null) {
    const tabId = resolvePcaAsyncTabId(meta);
    const scope = tabId ? resolvePcaAsyncScope() : null;
    if (scope && typeof scope.requestAnimationFrame === 'function') {
      return scope.requestAnimationFrame({
        ...meta,
        tabId,
        componentKey: 'pca',
        reason: meta.reason || 'pca-frame'
      }, fn, onStale);
    }
    return null;
  }

  function resolvePcaOwnedRuntimeTabId(tabLike = null, meta = {}) {
    if (tabLike && typeof tabLike === 'object' && tabLike.id != null) {
      return String(tabLike.id || '').trim();
    }
    if (typeof tabLike === 'string' && tabLike.trim()) {
      return tabLike.trim();
    }
    const explicit = meta?.tabId || meta?.workspaceTabId || meta?.tab?.id || null;
    if (explicit) {
      return String(explicit || '').trim();
    }
    const inferred = getPcaProjectionTabId() ||
      pcaHotInstance?.__pcaTabId ||
      resolvePcaTabIdFromNode(pcaRoot) ||
      Shared.workspaceTabs?.getActiveSessionInfo?.('pca')?.tabId ||
      global.Main?.session?.workspaceState?.activeTabId ||
      null;
    if (inferred) {
      return String(inferred || '').trim();
    }
    return '';
  }

  function snapshotPcaOwnedStateFromActive() {
    const activeSession = projectedPcaSession && isPcaSessionActiveForModuleState(projectedPcaSession) ?
      projectedPcaSession :
      null;
    const renderRuntime = activeSession?.cache?.renderRuntime ?
      normalizePcaRenderRuntime(activeSession.cache.renderRuntime) :
      createDefaultPcaRenderRuntime({
        cachedRender: pcaState.cachedRender,
        dataDirty: pcaState.dataDirty,
        viewDirty: pcaState.viewDirty
      });
    return {
      axisSelection: cloneSimple(pcaState.axisSelection) || {
        x: 1,
        y: 2,
        z: 3
      },
      axisMeta: cloneSimple(pcaState.axisMeta) || [],
      rotation: cloneSimple(pcaState.rotation) || plot3d.createRotationState({
        x: PCA_3D_DEFAULTS.rotationX,
        y: PCA_3D_DEFAULTS.rotationY
      }),
      axisSettings: cloneSimple(pcaState.axisSettings) || createDefaultAxisSettings(),
      gridStyle: cloneSimple(pcaState.gridStyle) || null,
      tableFormat: pcaState.tableFormat || 'standard',
      grouped: cloneSimple(pcaState.grouped) || {
        replicatesPerGroup: 2
      },
      componentSelection: cloneSimple(pcaState.componentSelection) || {
        rule: PCA_DEFAULT_COMPONENT_SELECTION_RULE,
        eigenThreshold: PCA_DEFAULT_EIGEN_THRESHOLD,
        parallelIterations: PCA_DEFAULT_PARALLEL_ITERATIONS,
        includeNonRetainedAxes: false
      },
      biplotShowSampleScores: sanitizePcaBiplotShowSampleScores(pcaState.biplotShowSampleScores),
      screeShowParallel: sanitizePcaScreeShowParallel(pcaState.screeShowParallel),
      loadingsLimit: Number.isFinite(Number(pcaState.loadingsLimit)) ? Number(pcaState.loadingsLimit) : PCA_LOADINGS_ROW_LIMIT,
      labels: cloneSimple(pcaState.labels) || {
        title: getDefaultTitleForMethod('pca')
      },
      pointStyleScopes: cloneSimple(ensurePcaPointStyleScopes()),
      lastMethod: pcaState.lastMethod || 'pca',
      lastAutoDrawEvaluation: cloneSimple(pcaState.lastAutoDrawEvaluation) || null,
      lastDataShape: cloneSimple(pcaState.lastDataShape) || {
        rows: 0,
        cols: 0
      },
      performance: cloneSimple(pcaState.performance) || {
        loadData: null,
        draw: null,
        evaluation: null
      },
      fastPointMode: !!pcaState.fastPointMode,
      dataDirty: renderRuntime.dataDirty !== false,
      viewDirty: renderRuntime.viewDirty !== false,
      labelPositions: cloneSimple(pcaState.labelPositions) || {
        title: null,
        xLabel: null,
        yLabel: null,
        legend: null
      },
      theme: cloneSimple(pcaState.theme) || {
        colorScheme: 'scientific',
        textColor: chartStyle.TEXT_COLOR || '#000000',
        backgroundColor: '#ffffff'
      },
      controls: cloneSimple(pcaState.controls) || createDefaultPcaRuntimeControls()
    };
  }

  function createPcaOwnedRuntimeRecord(tabId, options = {}) {
    const seedFromActive = options && options.seedFromActive === true;
    const results = seedFromActive
      ? normalizePcaResultsState(pcaFallbackResultsState)
      : createDefaultPcaResultsState();
    return {
      version: 1,
      componentKey: 'pca',
      tabId: tabId || '',
      hydrated: false,
      state: seedFromActive ? snapshotPcaOwnedStateFromActive() : createDefaultPcaOwnedState(),
      results,
      stats: cloneSimple(results.stats) || null,
      statsPanel: normalizePcaStatsPanelState(results.statsPanel),
      notes: seedFromActive ?
        {
          text: notesState.text || '',
          open: !!notesState.open
        } :
        {
          text: '',
          open: false
        }
    };
  }

  function normalizePcaOwnedRuntimeRecord(record) {
    if (!record || typeof record !== 'object') {
      return null;
    }
    record.state = record.state && typeof record.state === 'object' ? record.state : createDefaultPcaOwnedState();
    record.results = normalizePcaResultsState(record.results || {
      stats: record.stats || null,
      statsPanel: record.statsPanel || record.stats?.statsPanel || {}
    });
    record.stats = cloneSimple(record.results.stats) || null;
    record.statsPanel = normalizePcaStatsPanelState(record.results.statsPanel || record.stats?.statsPanel || {});
    record.notes = normalizePcaNotesState(record.notes);
    return record;
  }

  function getPcaRuntimeOwner() {
    return Shared.componentLifecycle?.createRuntimeOwner?.(pca, {
      componentKey: 'pca',
      createDefaultRecord: createPcaOwnedRuntimeRecord,
      normalizeRecord: normalizePcaOwnedRuntimeRecord,
      requireSessionRuntime: true
    }) || null;
  }

  function getPcaOwnedRuntimeRecord(tabLike = null, meta = {}, options = {}) {
    const tabId = resolvePcaOwnedRuntimeTabId(tabLike, meta);
    if (!tabId) {
      console.warn('Debug: pca owned runtime missing tab id', {
        reason: meta?.reason || 'pca-owned-runtime'
      });
      return null;
    }
    return getPcaRuntimeOwner()?.ensureRecord?.(tabId, {
      ...(meta || {}),
      tabId,
      reason: meta?.reason || 'pca-owned-runtime'
    }, {
      create: options.create === true,
      requireHydrated: options.create !== true
    }) || null;
  }

  function ensurePcaOwnedRuntimeRecord(tabLike = null, meta = {}) {
    return getPcaOwnedRuntimeRecord(tabLike, meta, {
      create: true
    });
  }

  function applyPcaOwnedStateToActive(state, meta = {}) {
    if (!state || typeof state !== 'object') {
      return false;
    }
    pcaState.axisSelection = cloneSimple(state.axisSelection) || pcaState.axisSelection || {
      x: 1,
      y: 2,
      z: 3
    };
    pcaState.axisMeta = cloneSimple(state.axisMeta) || pcaState.axisMeta || [];
    pcaState.rotation = cloneSimple(state.rotation) || pcaState.rotation || plot3d.createRotationState({
      x: PCA_3D_DEFAULTS.rotationX,
      y: PCA_3D_DEFAULTS.rotationY
    });
    if (typeof plot3d.normalizeRotation === 'function') {
      try {
        plot3d.normalizeRotation(pcaState.rotation);
      } catch (_err) {}
    }
    pcaState.rotationPending = false;
    pcaState.rotationPendingLogged = false;
    if (Object.prototype.hasOwnProperty.call(state, 'axisSettings')) {
      pcaState.axisSettings = cloneSimple(state.axisSettings) || pcaState.axisSettings || createDefaultAxisSettings();
    }
    if (Object.prototype.hasOwnProperty.call(state, 'gridStyle')) {
      pcaState.gridStyle = cloneSimple(state.gridStyle) || null;
    }
    pcaState.tableFormat = typeof state.tableFormat === 'string' && state.tableFormat ? state.tableFormat : (pcaState.tableFormat || 'standard');
    pcaState.grouped = cloneSimple(state.grouped) || pcaState.grouped || {
      replicatesPerGroup: 2
    };
    pcaState.componentSelection = cloneSimple(state.componentSelection) || pcaState.componentSelection || {
      rule: PCA_DEFAULT_COMPONENT_SELECTION_RULE,
      eigenThreshold: PCA_DEFAULT_EIGEN_THRESHOLD,
      parallelIterations: PCA_DEFAULT_PARALLEL_ITERATIONS,
      includeNonRetainedAxes: false
    };
    pcaState.biplotShowSampleScores = sanitizePcaBiplotShowSampleScores(state.biplotShowSampleScores);
    pcaState.screeShowParallel = sanitizePcaScreeShowParallel(state.screeShowParallel);
    pcaState.loadingsLimit = Number.isFinite(Number(state.loadingsLimit)) ? Number(state.loadingsLimit) : (pcaState.loadingsLimit || PCA_LOADINGS_ROW_LIMIT);
    pcaState.labels = cloneSimple(state.labels) || pcaState.labels || {
      title: getDefaultTitleForMethod('pca')
    };
    pcaState.pointStyleScopes = normalizePcaPointStyleScopes(state.pointStyleScopes || {}, {
      controls: state.controls || pcaState.controls,
      grouped: state.grouped,
      labelColors: state.labelColors,
      labelShapes: state.labelShapes,
      labelPointStyles: state.labelPointStyles
    });
    pcaState.lastMethod = typeof state.lastMethod === 'string' && state.lastMethod ? state.lastMethod : (pcaState.lastMethod || 'pca');
    pcaState.fastPointMode = !!state.fastPointMode;
    pcaState.dataDirty = !!state.dataDirty;
    pcaState.viewDirty = !!state.viewDirty;
    pcaState.labelPositions = normalizePcaLabelPositionsState(cloneSimple(state.labelPositions) || pcaState.labelPositions || {});
    pcaState.theme = cloneSimple(state.theme) || pcaState.theme || {
      colorScheme: 'scientific',
      textColor: chartStyle.TEXT_COLOR || '#000000',
      backgroundColor: '#ffffff'
    };
    pcaState.controls = normalizePcaRuntimeControls(state.controls || pcaState.controls || {});
    pcaState.cachedRender = pcaState.cachedRender || null;
    debugLog('Debug: pca owned runtime state bound', {
      tabId: meta?.tabId || getPcaProjectionTabId() || null,
      tableFormat: pcaState.tableFormat,
      viewDirty: pcaState.viewDirty,
      reason: meta?.reason || 'pca-owned-runtime-bind'
    });
    return true;
  }

  function bindPcaOwnedRuntimeRecord(tabLike = null, meta = {}) {
    const record = getPcaOwnedRuntimeRecord(tabLike, meta, {
      create: false
    });
    if (!record) {
      return false;
    }
    const session = setPcaSessionStateFromRuntimeRecord(record, {
      ...(meta || {}),
      tabId: record.tabId,
      reason: meta?.reason || 'pca-bind-owned-runtime-session'
    }) || bindPcaSessionForTab(record.tabId, {
      ...(meta || {}),
      tabId: record.tabId,
      reason: meta?.reason || 'pca-bind-owned-runtime-session'
    });
    return applyPcaSessionStateToActive(session, {
      ...(meta || {}),
      tabId: record.tabId,
      reason: meta?.reason || 'pca-bind-owned-runtime'
    });
  }

  function bindExistingPcaOwnedRuntimeRecord(tabLike = null, meta = {}) {
    const record = getPcaOwnedRuntimeRecord(tabLike, meta, {
      create: false
    });
    if (!record) {
      return false;
    }
    return bindPcaOwnedRuntimeRecord(record.tabId, {
      ...(meta || {}),
      tabId: record.tabId
    });
  }

  function normalizePcaLabelPositionsState(source = {}) {
    const src = source && typeof source === 'object' ? source : {};
    const normalizePoint = value => {
      if (!value || typeof value !== 'object') {
        return null;
      }
      const out = {};
      ['x', 'y', 'relX', 'relY'].forEach(key => {
        const numeric = Number(value[key]);
        if (Number.isFinite(numeric)) {
          out[key] = numeric;
        }
      });
      if (value.anchor === chartStyle.LEGEND_POSITION_ANCHOR
        || value.anchor === 'start' || value.anchor === 'end' || value.anchor === 'middle') {
        out.anchor = value.anchor;
      }
      return Object.keys(out).length ? out : null;
    };
    const normalizePointLabels = value => {
      const labels = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      const out = {};
      Object.keys(labels).forEach(key => {
        const point = normalizePoint(labels[key]);
        if(!point){ return; }
        const anchor = labels[key]?.anchor;
        if(anchor === 'start' || anchor === 'end' || anchor === 'middle'){
          point.anchor = anchor;
        }
        out[String(key)] = point;
      });
      return out;
    };
    return {
      title: normalizePoint(src.title),
      xLabel: normalizePoint(src.xLabel),
      yLabel: normalizePoint(src.yLabel),
      legend: normalizePoint(src.legend),
      pointLabels: normalizePointLabels(src.pointLabels)
    };
  }

  function getPcaSessionOwnedState(session = null) {
    const target = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (target?.state) {
      target.state = normalizePcaSessionRecord(target.state, target.tabId);
      target.state.state = target.state.state && typeof target.state.state === 'object' ?
        target.state.state :
        createDefaultPcaOwnedState();
      target.state.state.labelPositions = normalizePcaLabelPositionsState(target.state.state.labelPositions);
      target.state.state.labels = target.state.state.labels && typeof target.state.state.labels === 'object' ?
        target.state.state.labels :
        {
          title: getDefaultTitleForMethod(target.state.state.lastMethod || pcaState.lastMethod || 'pca')
        };
      target.state.state.pointStyleScopes = normalizePcaPointStyleScopes(target.state.state.pointStyleScopes || {}, {
        controls: target.state.state.controls,
        grouped: target.state.state.grouped,
        labelColors: target.state.state.labelColors,
        labelShapes: target.state.state.labelShapes,
        labelPointStyles: target.state.state.labelPointStyles
      });
      return {
        session: target,
        state: target.state.state
      };
    }
    pcaState.labelPositions = normalizePcaLabelPositionsState(pcaState.labelPositions);
    pcaState.labels = pcaState.labels && typeof pcaState.labels === 'object' ?
      pcaState.labels :
      {
        title: getDefaultTitleForMethod(pcaState.lastMethod || 'pca')
      };
    return {
      session: null,
      state: pcaState
    };
  }

  function persistPcaSessionOwnedState(session = null, reason = 'pca-owned-state') {
    const target = ensurePcaSessionOwnershipShape(session);
    if (!target?.state) {
      return null;
    }
    target.updatedAt = Date.now();
    target.state.updatedAt = Date.now();
    target.state.reason = reason;
    if (target.tabId) {
      getPcaRuntimeOwner()?.rememberRecord?.(target.tabId, target.state, {
        tabId: target.tabId,
        reason
      });
    }
    return target.state;
  }

  function shouldMirrorPcaSessionToActive(session = null) {
    return !session || isPcaSessionActiveForModuleState(session);
  }

  function resolvePcaWorkspaceTabForSession(session = null) {
    const owner = ensurePcaSessionOwnershipShape(session);
    const tabId = String(owner?.tabId || '').trim();
    if (!tabId) {
      return null;
    }
    const tabs = global.Main?.session?.workspaceState?.tabs;
    return Array.isArray(tabs) ? (tabs.find(tab => tab && String(tab.id || '').trim() === tabId) || null) : null;
  }

  function writePcaOwnerConfigThrough(session = null, reason = 'pca-config-write-through', configKeys = null) {
    const owner = ensurePcaSessionOwnershipShape(session);
    const tab = resolvePcaWorkspaceTabForSession(owner);
    if (!owner || !tab || tab.type !== 'pca' || !tab.payload || typeof tab.payload !== 'object') {
      return false;
    }
    const sessionApi = global.Main?.session || null;
    if (typeof sessionApi?.updateTabPayload !== 'function') {
      return false;
    }
    const configSnapshot = snapshotPcaConfig(null, owner);
    const requestedKeys = Array.isArray(configKeys) ? configKeys.filter(key => typeof key === 'string' && key) : null;
    const configPatch = requestedKeys?.length ? requestedKeys.reduce((patch, key) => {
      if (Object.prototype.hasOwnProperty.call(configSnapshot, key)) {
        const value = configSnapshot[key];
        patch[key] = value && typeof value === 'object' ? cloneSimple(value) : value;
      }
      return patch;
    }, {}) : cloneSimple(configSnapshot);
    sessionApi.updateTabPayload(tab, draft => {
      if (!draft || typeof draft !== 'object') {
        return draft;
      }
      draft.type = 'pca';
      draft.config = {
        ...(draft.config && typeof draft.config === 'object' ? draft.config : {}),
        ...configPatch
      };
      return draft;
    }, {
      reason,
      origin: 'user'
    });
    const committed = tab.payload?.config;
    if (!committed || typeof committed !== 'object') {
      return false;
    }
    return Object.keys(configPatch).every(key => {
      try {
        return JSON.stringify(committed[key]) === JSON.stringify(configPatch[key]);
      } catch (_err) {
        return committed[key] === configPatch[key];
      }
    });
  }

  function patchPcaRuntimeControlsForOwner(owner = null, patch = {}, reason = 'pca-control-change') {
    const ownerSession = ensurePcaSessionOwnershipShape(owner?.session || getActivePcaSessionForState());
    const owned = getPcaSessionOwnedState(ownerSession);
    const nextControls = normalizePcaRuntimeControls({
      ...(owned.state.controls || {}),
      ...(patch || {})
    });
    owned.state.controls = nextControls;
    if (shouldMirrorPcaSessionToActive(owned.session)) {
      pcaState.controls = normalizePcaRuntimeControls(nextControls);
    }
    persistPcaSessionOwnedState(owned.session, reason);
    if (!writePcaOwnerConfigThrough(owned.session, reason, Object.keys(patch || {}))) {
      markPcaPayloadDirtyForSession(owned.session, reason);
    }
    return nextControls;
  }

  function patchPcaAxisSelectionForOwner(owner = null, axisKey, requestedValue, reason = 'pca-axis-selection-change') {
    if (!['x', 'y', 'z'].includes(axisKey)) {
      return null;
    }
    const ownerSession = ensurePcaSessionOwnershipShape(owner?.session || getActivePcaSessionForState());
    const owned = getPcaSessionOwnedState(ownerSession);
    const current = owned.state.axisSelection && typeof owned.state.axisSelection === 'object' ?
      owned.state.axisSelection :
      { x: 1, y: 2, z: 3 };
    const dimensionCount = Array.isArray(owned.state.axisMeta) && owned.state.axisMeta.length ?
      owned.state.axisMeta.length :
      (shouldMirrorPcaSessionToActive(owned.session) && Array.isArray(pcaState.axisMeta) ? pcaState.axisMeta.length : 0);
    const next = normalizePcaAxisSelection({
      ...current,
      [axisKey]: requestedValue
    }, dimensionCount);
    owned.state.axisSelection = next;
    if (shouldMirrorPcaSessionToActive(owned.session)) {
      pcaState.axisSelection = {
        ...next
      };
    }
    persistPcaSessionOwnedState(owned.session, reason);
    if (!writePcaOwnerConfigThrough(owned.session, reason, ['axisSelection'])) {
      markPcaPayloadDirtyForSession(owned.session, reason);
    }
    return next;
  }

  function getPcaLabelPositionsState(session = null) {
    const {
      state
    } = getPcaSessionOwnedState(session);
    state.labelPositions = normalizePcaLabelPositionsState(state.labelPositions);
    return state.labelPositions;
  }

  function patchPcaLabelPositionsState(session = null, patch = {}, meta = {}) {
    const owned = getPcaSessionOwnedState(session);
    const current = normalizePcaLabelPositionsState(owned.state.labelPositions);
    const next = normalizePcaLabelPositionsState({
      ...current,
      ...(patch || {})
    });
    owned.state.labelPositions = next;
    if (shouldMirrorPcaSessionToActive(owned.session)) {
      pcaState.labelPositions = cloneSimple(next) || normalizePcaLabelPositionsState(next);
    }
    persistPcaSessionOwnedState(owned.session, meta?.reason || 'pca-label-position-state');
    return next;
  }

  function bindPcaLegendInteractions(legend, svg, ownerSession = null, options = {}) {
    if (!legend || !svg || typeof Shared.bindLegendDragInteraction !== 'function') {
      return false;
    }
    const owner = ensurePcaSessionOwnershipShape(ownerSession || getActivePcaSessionForState());
    const mode = options.mode || legend.dataset?.pcaLegendMode || svg.dataset?.viewMode || '2d';
    const writeMetric = (key, value) => {
      if (Number.isFinite(Number(value))) {
        legend.dataset[key] = String(Number(value));
      }
    };
    legend.dataset.pcaLegendMode = mode === '3d' ? '3d' : '2d';
    writeMetric('pcaLegendOriginX', options.originX);
    writeMetric('pcaLegendOriginY', options.originY);
    writeMetric('pcaLegendScaleX', options.scaleX);
    writeMetric('pcaLegendScaleY', options.scaleY);
    return Shared.bindLegendDragInteraction?.(legend, svg, {
      owner,
      originX: Number.isFinite(Number(options.originX)) ? options.originX : Number(legend.dataset.pcaLegendOriginX),
      originY: Number.isFinite(Number(options.originY)) ? options.originY : Number(legend.dataset.pcaLegendOriginY),
      scaleX: Number.isFinite(Number(options.scaleX)) ? options.scaleX : Number(legend.dataset.pcaLegendScaleX),
      scaleY: Number.isFinite(Number(options.scaleY)) ? options.scaleY : Number(legend.dataset.pcaLegendScaleY),
      positionAnchor: chartStyle.LEGEND_POSITION_ANCHOR,
      undoLabel: `pca-legend-${legend.dataset.pcaLegendMode}`,
      onCommit: (position, boundOwner) => {
        const dragOwner = ensurePcaSessionOwnershipShape(boundOwner || getActivePcaSessionForState());
        if (!dragOwner) {
          return;
        }
        patchPcaLabelPositionsState(dragOwner, { legend: position }, {
          reason: `pca-${legend.dataset.pcaLegendMode}-legend-position`
        });
      }
    }) === true;
  }

  function createPcaPointLabelKey(point, method, viewMode, fallbackIndex = 0) {
    const columnIndex = Number.isInteger(point?.columnIndex) ? point.columnIndex : null;
    const sourceIndex = Number.isInteger(point?.sourceIndex) ? point.sourceIndex : (Number.isInteger(point?.index) ? point.index : null);
    const identity = columnIndex != null ? `column:${columnIndex}` : (sourceIndex != null ? `source:${sourceIndex}` : `index:${fallbackIndex}`);
    const text = String(point?.label || '').trim();
    return `${String(method || 'pca').toLowerCase()}|${viewMode}|${identity}|${text}`;
  }

  function savePcaPointLabelPosition(session, labelKey, position, reason = 'pca-point-label-position') {
    const ownerSession = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (!ownerSession || !labelKey) {
      return null;
    }
    const current = getPcaLabelPositionsState(ownerSession);
    const pointLabels = {
      ...(current.pointLabels || {}),
      [labelKey]: position
    };
    const next = patchPcaLabelPositionsState(ownerSession, { pointLabels }, { reason });
    markPcaPayloadDirtyForSession(ownerSession, reason);
    return next;
  }

  function bindPcaPointLabelDrag(options = {}) {
    const labelKey = options.entry?.labelKey;
    if (!labelKey || !Shared.labelLayout?.enablePointLabelDrag) {
      return false;
    }
    return Shared.labelLayout.enablePointLabelDrag({
      ...options,
      onPositionChange(position) {
        savePcaPointLabelPosition(options.session, labelKey, position);
      }
    });
  }

  function preserveRenderedPcaPointLabelPositions(session, reason = 'pca-point-label-font-position') {
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const root = owner?.refs?.root || owner?.root || null;
    const svg = root?.querySelector?.('#pcaSvg') || null;
    const nodes = svg ? Array.from(svg.querySelectorAll("[data-layer='point-labels'] text[data-point-label-key]")) : [];
    if (!owner || !svg || !nodes.length) {
      return false;
    }
    const current = getPcaLabelPositionsState(owner);
    const pointLabels = { ...(current.pointLabels || {}) };
    let captured = 0;
    nodes.forEach(node => {
      const labelKey = String(node.dataset?.pointLabelKey || '').trim();
      const x = Number(node.getAttribute('x'));
      const y = Number(node.getAttribute('y'));
      const left = Number(node.dataset?.pointLabelContainerLeft) || 0;
      const right = Number(node.dataset?.pointLabelContainerRight);
      const top = Number(node.dataset?.pointLabelContainerTop) || 0;
      const bottom = Number(node.dataset?.pointLabelContainerBottom);
      if (!labelKey || !Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      pointLabels[labelKey] = {
        x,
        y,
        relX: (x - left) / Math.max(1, right - left),
        relY: (y - top) / Math.max(1, bottom - top),
        anchor: node.getAttribute('text-anchor') || 'start'
      };
      captured += 1;
    });
    if (!captured) {
      return false;
    }
    patchPcaLabelPositionsState(owner, { pointLabels }, { reason });
    return true;
  }

  function getPcaLabelsState(session = null, methodHint = '') {
    const {
      state
    } = getPcaSessionOwnedState(session);
    const method = methodHint || state.lastMethod || pcaState.lastMethod || 'pca';
    state.labels = state.labels && typeof state.labels === 'object' ?
      state.labels :
      {
        title: getDefaultTitleForMethod(method)
      };
    if (typeof state.labels.title !== 'string') {
      state.labels.title = getDefaultTitleForMethod(method);
    }
    return state.labels;
  }

  function patchPcaLabelsState(session = null, patch = {}, meta = {}) {
    const owned = getPcaSessionOwnedState(session);
    const current = getPcaLabelsState(owned.session, owned.state.lastMethod || pcaState.lastMethod || 'pca');
    const next = {
      ...current,
      ...(patch || {})
    };
    owned.state.labels = next;
    if (shouldMirrorPcaSessionToActive(owned.session)) {
      pcaState.labels = cloneSimple(next) || {
        ...next
      };
    }
    persistPcaSessionOwnedState(owned.session, meta?.reason || 'pca-labels-state');
    return next;
  }

  function syncPcaTableFormatFromOwnedRuntime(tabLike = null, meta = {}) {
    const record = getPcaOwnedRuntimeRecord(tabLike, meta, {
      create: false
    });
    const tableFormat = record?.state?.tableFormat;
    if (typeof tableFormat !== 'string' || !tableFormat) {
      return false;
    }
    pcaState.tableFormat = tableFormat === 'grouped' ? 'grouped' : 'standard';
    debugLog('Debug: pca table format restored before grid bind', {
      tabId: record.tabId || null,
      tableFormat: pcaState.tableFormat,
      reason: meta?.reason || 'sync-pca-table-format-owned-runtime'
    });
    return true;
  }

  function commitPcaRotationState(rotation, session = null, reason = 'pca-rotation-state') {
    const target = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (target?.state) {
      target.state = normalizePcaSessionRecord(target.state, target.tabId);
      target.state.state = target.state.state && typeof target.state.state === 'object' ?
        target.state.state :
        createDefaultPcaOwnedState();
    }
    const current = target?.state?.state?.rotation || pcaState.rotation;
    const nextRotation = rotation && typeof rotation === 'object' ?
      rotation :
      (current && typeof current === 'object' ? current : plot3d.createRotationState({
        x: PCA_3D_DEFAULTS.rotationX,
        y: PCA_3D_DEFAULTS.rotationY
      }));
    if (typeof plot3d.normalizeRotation === 'function') {
      try {
        plot3d.normalizeRotation(nextRotation);
      } catch (_err) {}
    }
    const drawRuntime = getPcaDrawRuntime(target, { syncFallbackFromState: !target });
    if (target?.state?.state) {
      target.state.state.rotation = nextRotation;
      target.state.state.rotationPending = !!drawRuntime?.rotationPending;
      target.state.state.rotationPendingLogged = !!drawRuntime?.rotationPendingLogged;
      target.updatedAt = Date.now();
    }
    const shouldMirror = !target || (typeof plot3d.isRotationOwnerTabActive === 'function'
      ? plot3d.isRotationOwnerTabActive(target, 'pca')
      : isPcaSessionActiveForModuleState(target));
    if (shouldMirror) {
      pcaState.rotation = nextRotation;
      pcaState.rotationPending = !!drawRuntime?.rotationPending;
      pcaState.rotationPendingLogged = !!drawRuntime?.rotationPendingLogged;
    }
    debugLog('Debug: pca rotation state committed', {
      reason,
      tabId: target?.tabId || getPcaProjectionTabId() || null,
      rotation: {
        x: nextRotation?.x,
        y: nextRotation?.y,
        z: nextRotation?.z
      }
    });
    return nextRotation;
  }

  function rememberPcaOwnedRuntimeRecord(tabLike = null, meta = {}) {
    const session = getPcaSession(tabLike || meta?.tab || meta?.tabId || getPcaProjectionTabId() || null, {
      ...(meta || {}),
      reason: meta?.reason || 'pca-owned-runtime-remember'
    }, {
      create: true
    }) || getActivePcaSessionForState();
    const record = session && isPcaSessionActiveForModuleState(session) ?
      capturePcaSessionStateFromActive(session, {
        ...(meta || {}),
        reason: meta?.reason || 'pca-owned-runtime-remember'
      }) :
      (session?.state || null);
    if (!record) {
      return null;
    }
    record.updatedAt = Date.now();
    record.reason = meta?.reason || 'pca-owned-runtime-remember';
    getPcaRuntimeOwner()?.rememberRecord?.(record.tabId, record, {
      ...(meta || {}),
      tabId: record.tabId,
      reason: meta?.reason || 'pca-owned-runtime-remember'
    });
    const projectionContext = session
      ? Shared.componentLifecycle?.resolveOwnerCaptureContext?.('pca', { tabId: session.tabId }, {
          component: pca,
          projectedSession: projectedPcaSession,
          session,
          root: session.root || null,
          allowMissingWorkspaceOwner: true
        })
      : null;
    if (session && (projectionContext ? projectionContext.canCaptureLive === true : isPcaSessionActiveForModuleState(session))) {
      pca.__pcaOwnedRuntimeTabId = record.tabId;
      pca.__pcaSessionTabId = record.tabId;
    }
    debugLog('Debug: pca owned runtime remembered', {
      tabId: record.tabId,
      tableFormat: record.state?.tableFormat || null,
      reason: record.reason
    });
    return record;
  }

  function applyPcaOwnedRuntimeSlicesFromSnapshot(snapshot, tabLike = null, meta = {}) {
    if (!snapshot || typeof snapshot !== 'object') {
      return false;
    }
    const record = ensurePcaOwnedRuntimeRecord(tabLike, meta);
    if (!record) {
      return false;
    }
    record.hydrated = true;
    if (snapshot.state && typeof snapshot.state === 'object') {
      record.state = {
        ...record.state,
        ...(cloneSimple(snapshot.state) || {})
      };
      record.state.rotationPending = false;
      record.state.rotationPendingLogged = false;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'results')) {
      record.results = normalizePcaResultsState(snapshot.results);
      record.stats = cloneSimple(record.results.stats) || null;
      record.statsPanel = normalizePcaStatsPanelState(record.results.statsPanel);
    } else {
      if (Object.prototype.hasOwnProperty.call(snapshot, 'stats')) {
        record.stats = cloneSimple(snapshot.stats) || null;
      }
      if (Object.prototype.hasOwnProperty.call(snapshot, 'statsPanel')) {
        record.statsPanel = normalizePcaStatsPanelState(snapshot.statsPanel);
      }
      record.results = normalizePcaResultsState({
        ...(record.results || {}),
        stats: record.stats || null,
        statsPanel: record.statsPanel || record.stats?.statsPanel || {}
      });
    }
    if (snapshot.notes && typeof snapshot.notes === 'object') {
      record.notes = {
        text: snapshot.notes.text == null ? '' : String(snapshot.notes.text),
        open: !!snapshot.notes.open
      };
    }
    record.updatedAt = Date.now();
    record.reason = meta?.reason || 'pca-owned-runtime-apply-snapshot';
    getPcaRuntimeOwner()?.setRecord?.(record.tabId, record, {
      ...(meta || {}),
      tabId: record.tabId,
      reason: meta?.reason || 'pca-owned-runtime-apply-snapshot'
    });
    setPcaSessionStateFromRuntimeRecord(record, {
      ...(meta || {}),
      tabId: record.tabId,
      reason: meta?.reason || 'pca-owned-runtime-apply-snapshot'
    });
    return bindPcaOwnedRuntimeRecord(record.tabId, {
      ...(meta || {}),
      tabId: record.tabId
    });
  }

  function normalizePcaThemeColor(value, fallback) {
    return (typeof value === 'string' && value.trim()) ? value.trim() : fallback;
  }

  function applyPcaThemeConfig(config) {
    const cfg = config && typeof config === 'object' ? config : {};
    const resolved = Shared.colorSchemes?.resolveThemeState?.('pca', {
      config: cfg
    }) || null;
    const schemeId = resolved?.schemeId ||
      (typeof cfg.colorScheme === 'string' && cfg.colorScheme.trim() ?
        cfg.colorScheme.trim().toLowerCase() :
        (pcaState.theme?.colorScheme || 'scientific'));
    const isDark = resolved ? resolved.isDark === true : schemeId === 'dark';
    if (!pcaState.theme || typeof pcaState.theme !== 'object') {
      pcaState.theme = {};
    }
    pcaState.theme.colorScheme = schemeId || 'scientific';
    pcaState.theme.textColor = normalizePcaThemeColor(
      cfg.textColor,
      resolved?.textColor || (isDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000'))
    );
    pcaState.theme.backgroundColor = normalizePcaThemeColor(
      cfg.backgroundColor,
      resolved?.background || (isDark ? '#000000' : '#ffffff')
    );
  }

  function appendPca3dBackground(svg, width, height) {
    if (!svg) {
      return;
    }
    const staleBackgrounds = svg.querySelectorAll('[data-color-scheme-background="1"]');
    staleBackgrounds.forEach(node => {
      try {
        node.remove();
      } catch (_err) {}
    });
    const resolved = Shared.colorSchemes?.resolveThemeState?.('pca', {
      config: {
        colorScheme: pcaState.theme?.colorScheme
      }
    });
    if (!(resolved ? resolved.isDark === true : (String(pcaState.theme?.colorScheme || '').toLowerCase() === 'dark'))) {
      if (svg.style) {
        svg.style.removeProperty('background-color');
      }
      svg.removeAttribute('data-color-scheme-bg-color');
      return;
    }
    const backgroundColor = normalizePcaThemeColor(pcaState.theme?.backgroundColor, '#000000');
    if (svg.style) {
      svg.style.backgroundColor = backgroundColor;
    }
    svg.setAttribute('data-color-scheme-bg-color', backgroundColor);
  }

  function applyPcaColorSchemeInPlace(session = null) {
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const ownerState = getPcaSessionOwnedState(owner).state || pcaState;
    const ownerControls = normalizePcaRuntimeControls(ownerState.controls || {});
    const ownerScopes = normalizePcaPointStyleScopes(ownerState.pointStyleScopes || {}, {
      controls: ownerControls,
      grouped: ownerState.grouped,
      labelColors: ownerState.labelColors,
      labelShapes: ownerState.labelShapes,
      labelPointStyles: ownerState.labelPointStyles
    });
    const tabId = owner?.tabId || getPcaProjectionTabId() || null;
    const plotRoot = getPcaNodeById('pcaPlot', tabId) || getPcaNodeById('pcaPlot');
    const svg = plotRoot?.querySelector?.('#pcaSvg') || null;
    if (!svg || plotRoot?.querySelector?.('.pca-fast-points-layer')) {
      return false;
    }
    const cache = getPcaAnalysisCache(owner) || {};
    const pointNodes = Array.from(svg.querySelectorAll('[data-plot-point="1"]'));
    const points = svg.dataset?.viewMode === '3d' ? cache.points3d : cache.points;
    const renderedLabels = pointNodes.map(node => String(node.__pcaPointData?.label || ''));
    const labels = Array.isArray(cache.labels) && cache.labels.length ? cache.labels : renderedLabels;
    const groupMeta = resolvePcaGroupMeta(cache.sampleCount || points?.length || pointNodes.length, labels, {
      columnIndices: cache.sampleColumnIndices || [],
      groupHeaderRow: cache.groupedHeaderRow || []
    });
    const borderColor = ownerControls.border || '#000000';
    const fill = ownerControls.fill || DEFAULT_SCATTER_COLORS[0];
    const colorForPoint = data => {
      const index = Number(data?.index);
      const assignment = groupMeta && Number.isInteger(index) ? groupMeta.assignments?.[index] : null;
      const pointStyle = resolvePcaPointStyle(data, Number.isInteger(assignment) ? assignment : null, index, {
        controls: ownerControls,
        scopes: ownerScopes,
        tableFormat: ownerState.tableFormat
      });
      return {
        fill: pointStyle.fill || fill,
        stroke: pointStyle.borderColor || borderColor
      };
    };
    pointNodes.forEach(node => {
      const colors = colorForPoint(node.__pcaPointData || {});
      node.setAttribute('fill', colors.fill);
      const strokeWidth = Number(node.getAttribute('stroke-width')) || 0;
      node.setAttribute('stroke', strokeWidth > 0 ? colors.stroke : 'none');
    });

    const legendColors = new Map();
    groupMeta?.entries?.forEach(entry => legendColors.set(String(entry.key), entry.color));
    const seenLabels = new Set();
    labels.forEach(label => {
      const key = String(label || '');
      if (!key || seenLabels.has(key)) {
        return;
      }
      seenLabels.add(key);
      legendColors.set(`label-${key}`, ownerScopes.points?.[pcaLabelPointStyleKey(key)]?.fill || DEFAULT_SCATTER_COLORS[legendColors.size % DEFAULT_SCATTER_COLORS.length]);
    });
    svg.querySelectorAll('[data-legend-swatch="1"]').forEach(node => {
      const color = legendColors.get(String(node.dataset?.legendKey || ''));
      if (color) {
        node.setAttribute('fill', color);
      }
    });

    const axisColor = getAxisColor();
    const gridColor = getGridStyle(getAxisStrokeWidthBase()).color || DEFAULT_GRID_COLOR;
    const textColor = normalizePcaThemeColor(pcaState.theme?.textColor, chartStyle.TEXT_COLOR || '#000000');
    svg.querySelectorAll('[data-grid-control="1"]').forEach(node => node.setAttribute('stroke', gridColor));
    svg.querySelectorAll('[data-axis-line="1"], [data-axis-tick="1"], [data-frame-edge]').forEach(node => node.setAttribute('stroke', axisColor));
    svg.querySelectorAll('[data-label-leader="1"]').forEach(node => node.setAttribute('stroke', textColor));
    if (svg.dataset?.viewMode === '3d') {
      const width = Number(svg.getAttribute('width')) || 0;
      const height = Number(svg.getAttribute('height')) || 0;
      appendPca3dBackground(svg, width, height);
      svg.querySelectorAll('text,tspan').forEach(node => node.setAttribute('fill', textColor));
      const dark = String(pcaState.theme?.colorScheme || '').toLowerCase() === 'dark';
      const panes = Array.from(svg.querySelectorAll('[data-plot3d-panes="1"] polygon'));
      panes.forEach((node, index) => {
        const ratio = panes.length > 1 ? index / (panes.length - 1) : 0;
        node.setAttribute('fill', dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.03)');
        node.setAttribute('opacity', String((dark ? 0.10 : 0.01) + ratio * (dark ? 0.12 : 0.04)));
      });
    }
    updatePcaRenderRuntime(owner, runtime => {
      runtime.viewDirty = false;
    });
    return true;
  }

  function resetPcaRotation(reason) {
    if (typeof plot3d.createRotationState !== 'function') {
      pcaState.rotation.x = PCA_3D_DEFAULTS.rotationX;
      pcaState.rotation.y = PCA_3D_DEFAULTS.rotationY;
      pcaState.rotation.z = 0;
      pcaState.rotation.quaternion = null;
      debugLog('Debug: pca rotation reset (fallback)', {
        reason,
        rotation: {
          x: pcaState.rotation.x,
          y: pcaState.rotation.y,
          z: pcaState.rotation.z
        }
      });
      return;
    }
    const defaults = plot3d.createRotationState({
      x: PCA_3D_DEFAULTS.rotationX,
      y: PCA_3D_DEFAULTS.rotationY
    });
    pcaState.rotation.x = defaults.x;
    pcaState.rotation.y = defaults.y;
    pcaState.rotation.z = defaults.z || 0;
    pcaState.rotation.quaternion = defaults.quaternion ?
      {
        w: defaults.quaternion.w,
        x: defaults.quaternion.x,
        y: defaults.quaternion.y,
        z: defaults.quaternion.z
      } :
      null;
    if (typeof plot3d.normalizeRotation === 'function') {
      plot3d.normalizeRotation(pcaState.rotation);
    }
    debugLog('Debug: pca rotation reset', {
      reason,
      rotation: {
        x: pcaState.rotation.x,
        y: pcaState.rotation.y,
        z: pcaState.rotation.z
      }
    });
  }

  function cloneSimple(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      console.error('pca cloneSimple error', err);
      return null;
    }
  }

  function sanitizePcaComponentSelectionRule(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return PCA_COMPONENT_SELECTION_RULES.some(entry => entry.value === normalized) ?
      normalized :
      PCA_DEFAULT_COMPONENT_SELECTION_RULE;
  }

  function sanitizePcaEigenThreshold(value, fallback = PCA_DEFAULT_EIGEN_THRESHOLD) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0 && numeric <= 100) {
      return numeric;
    }
    return fallback;
  }

  function sanitizePcaParallelIterations(value, fallback = PCA_DEFAULT_PARALLEL_ITERATIONS) {
    const numeric = Math.round(Number(value));
    if (Number.isFinite(numeric) && numeric >= 25 && numeric <= PCA_MAX_PARALLEL_ITERATIONS) {
      return numeric;
    }
    return fallback;
  }

  function sanitizePcaIncludeNonRetainedAxes(value) {
    return value === true;
  }

  function sanitizePcaBiplotShowSampleScores(value) {
    return value !== false;
  }

  function sanitizePcaScreeShowParallel(value) {
    return value !== false;
  }

  function getPcaComponentSelectionRuleLabel(value) {
    const normalized = sanitizePcaComponentSelectionRule(value);
    const match = PCA_COMPONENT_SELECTION_RULES.find(entry => entry.value === normalized);
    return match?.label || 'Show all components';
  }

  function createPcaSeededRandom(seed) {
    let stateValue = (Number(seed) || 1) >>> 0;
    return function nextRandom() {
      stateValue = (stateValue * 1664525 + 1013904223) >>> 0;
      return stateValue / 4294967296;
    };
  }

  function shufflePcaArray(values, random) {
    const list = Array.isArray(values) ? values.slice() : [];
    const nextRandom = typeof random === 'function' ? random : Math.random;
    for (let idx = list.length - 1; idx > 0; idx -= 1) {
      const swapIndex = Math.floor(nextRandom() * (idx + 1));
      const temp = list[idx];
      list[idx] = list[swapIndex];
      list[swapIndex] = temp;
    }
    return list;
  }

  function quantileFromSortedPca(sortedValues, probability) {
    const list = Array.isArray(sortedValues) ? sortedValues : [];
    if (!list.length) {
      return NaN;
    }
    if (list.length === 1) {
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

  function transposePcaMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix.length : 0;
    const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
    const transposed = Array.from({
      length: cols
    }, () => new Array(rows));
    for (let rowIdx = 0; rowIdx < rows; rowIdx += 1) {
      const row = Array.isArray(matrix[rowIdx]) ? matrix[rowIdx] : [];
      for (let colIdx = 0; colIdx < cols; colIdx += 1) {
        transposed[colIdx][rowIdx] = row[colIdx];
      }
    }
    return transposed;
  }

  function computePcaParallelAnalysis(matrix, svdLib, options = {}) {
    const rows = Array.isArray(matrix) ? matrix.length : 0;
    const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
    if (rows < 3 || cols < 2 || !svdLib || typeof svdLib.SVD !== 'function') {
      return null;
    }
    if ((rows * cols) > PCA_PARALLEL_MAX_CELLS) {
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
    const columns = Array.from({
        length: cols
      }, (_, colIdx) =>
      Array.from({
        length: rows
      }, (_, rowIdx) => Number(matrix?.[rowIdx]?.[colIdx]) || 0)
    );
    const averages = new Array(componentCount).fill(0);
    const percentileBuffers = Array.from({
      length: componentCount
    }, () => []);
    for (let iter = 0; iter < iterationCount; iter += 1) {
      const permuted = Array.from({
        length: rows
      }, () => Array(cols).fill(0));
      for (let colIdx = 0; colIdx < cols; colIdx += 1) {
        const shuffled = shufflePcaArray(columns[colIdx], random);
        for (let rowIdx = 0; rowIdx < rows; rowIdx += 1) {
          permuted[rowIdx][colIdx] = shuffled[rowIdx];
        }
      }
      const matrixForSvd = useTransposed ? transposePcaMatrix(permuted) : permuted;
      const svd = svdLib.SVD(matrixForSvd);
      const singularValues = (Array.isArray(svd?.q) ? svd.q : [])
        .map(value => Number(value) || 0)
        .sort((a, b) => b - a);
      for (let componentIdx = 0; componentIdx < componentCount; componentIdx += 1) {
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

  function computePcaComponentSelectionSummary(eigenSummary, matrix, svdLib, options = {}) {
    const entries = Array.isArray(eigenSummary) ? eigenSummary : [];
    if (!entries.length) {
      return null;
    }
    const rule = sanitizePcaComponentSelectionRule(options.rule);
    const threshold = sanitizePcaEigenThreshold(options.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD);
    const parallel = computePcaParallelAnalysis(matrix, svdLib, {
      iterations: options.parallelIterations
    });
    const standardized = options.standardized === true;
    const kaiserAvailable = standardized;
    const kaiserCount = kaiserAvailable ? entries.filter(entry => Number(entry?.eigenvalue) >= 1).length : 0;
    const thresholdCount = entries.filter(entry => Number(entry?.eigenvalue) >= threshold).length;
    const parallelAvailable = !!(parallel && Array.isArray(parallel.percentile95Eigenvalues) && parallel.percentile95Eigenvalues.length);
    const parallelCount = parallelAvailable ?
      entries.filter((entry, idx) => Number(entry?.eigenvalue) > (parallel.percentile95Eigenvalues[idx] || 0)).length :
      0;
    const ruleAvailable = (rule !== 'parallel' || parallelAvailable) && (rule !== 'kaiser' || kaiserAvailable);
    const ruleLabel = ruleAvailable ? getPcaComponentSelectionRuleLabel(rule) : `${getPcaComponentSelectionRuleLabel(rule)} (unavailable)`;
    const retainedCount = rule === 'kaiser' ?
      (kaiserAvailable ? kaiserCount : 0) :
      rule === 'threshold' ?
      thresholdCount :
      rule === 'all' ?
      entries.length :
      (parallelAvailable ? parallelCount : 0);
    const selectedThreshold = rule === 'kaiser' ?
      (kaiserAvailable ? 'Eigenvalue > 1' : 'Unavailable without standardization') :
      rule === 'threshold' ?
      `Eigenvalue ≥ ${threshold.toFixed(2)}` :
      rule === 'parallel' ?
      (parallelAvailable ? 'Observed > random 95th percentile' : 'Unavailable; no fallback applied') :
      '—';
    const selectedDetail = rule === 'kaiser' ?
      (kaiserAvailable ? 'Counts components with eigenvalue > 1 in standardized (correlation) PCA.' : 'Kaiser selection is unavailable because variables were not standardized.') :
      rule === 'threshold' ?
      'User-defined eigenvalue cutoff.' :
      rule === 'parallel' ?
      (parallelAvailable ?
        `${parallel.iterations} permutations` :
        (parallel?.reason || 'Requires PCA eigenvalues and SVD support.')) :
      ruleLabel;
    return {
      rule,
      ruleLabel,
      ruleAvailable,
      kaiserAvailable,
      retainedCount,
      threshold,
      kaiserCount,
      thresholdCount,
      parallelCount,
      parallelIterations: parallel?.iterations || null,
      parallelAnalysis: parallel,
      rows: [{
        criterion: 'Selected rule',
        threshold: selectedThreshold,
        retained: String(retainedCount),
        detail: selectedDetail
      }]
    };
  }

  function resolvePcaAxisDimensionMeta(allMeta, selectionSummary) {
    const fullMeta = Array.isArray(allMeta) ? allMeta : [];
    if (!fullMeta.length) {
      return [];
    }
    const includeNonRetained = sanitizePcaIncludeNonRetainedAxes(pcaState.componentSelection?.includeNonRetainedAxes);
    if (includeNonRetained) {
      return fullMeta.slice();
    }
    const retainedRaw = Number(selectionSummary?.retainedCount);
    if (!Number.isFinite(retainedRaw)) {
      return fullMeta.slice();
    }
    const retainedCount = Math.max(1, Math.min(fullMeta.length, Math.floor(retainedRaw)));
    return fullMeta.slice(0, retainedCount);
  }

  function buildPcaBiplotSnapshot(points, loadingsRows, axisLabels = {}, selectedAxes = {}) {
    const pointList = Array.isArray(points) ? points.slice(0, PCA_BIPLOT_POINT_LIMIT) : [];
    const xIndex = Number.isInteger(selectedAxes?.x) ? selectedAxes.x : 0;
    const yIndex = Number.isInteger(selectedAxes?.y) ? selectedAxes.y : 1;
    const rawVectors = (Array.isArray(loadingsRows) ? loadingsRows : [])
      .map(row => ({
        label: row?.label || 'Variable',
        x: Number(row?.values?.[xIndex]) || 0,
        y: Number(row?.values?.[yIndex]) || 0
      }))
      .sort((a, b) => Math.max(Math.abs(b.x), Math.abs(b.y)) - Math.max(Math.abs(a.x), Math.abs(a.y)))
      .slice(0, PCA_BIPLOT_VECTOR_LIMIT)
      .filter(vector => Number.isFinite(vector.x) && Number.isFinite(vector.y));
    const pointMaxAbs = pointList.reduce((acc, point) => {
      const xAbs = Math.abs(Number(point?.x) || 0);
      const yAbs = Math.abs(Number(point?.y) || 0);
      return Math.max(acc, xAbs, yAbs);
    }, 0);
    const vectorMaxAbs = rawVectors.reduce((acc, vector) => {
      return Math.max(acc, Math.abs(vector.x), Math.abs(vector.y));
    }, 0);
    const vectorScale = vectorMaxAbs > 0 ?
      Math.max(1, (Math.max(pointMaxAbs, 1) * 0.85) / vectorMaxAbs) :
      1;
    const vectors = rawVectors.map(vector => ({
      label: vector.label,
      x: vector.x * vectorScale,
      y: vector.y * vectorScale
    }));
    return {
      points: pointList.map(point => ({
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
        label: point?.label || ''
      })),
      vectors,
      vectorScale,
      vectorScaleNote: 'Loading vectors are uniformly rescaled for visibility.',
      selectedAxes: { x: xIndex, y: yIndex },
      xLabel: axisLabels.x || 'PC1',
      yLabel: axisLabels.y || 'PC2'
    };
  }

  function nowMs() {
    try {
      if (typeof global.performance === 'object' && typeof global.performance.now === 'function') {
        return global.performance.now();
      }
    } catch (err) {
      /* ignore */ }
    try {
      if (typeof performance === 'object' && typeof performance.now === 'function') {
        return performance.now();
      }
    } catch (err) {
      /* ignore */ }
    return Date.now();
  }

  function ensurePcaPerformanceState() {
    if (pcaState.performance && typeof pcaState.performance === 'object') {
      return pcaState.performance;
    }
    pcaState.performance = {
      loadData: null,
      draw: null,
      evaluation: null
    };
    return pcaState.performance;
  }

  function recordPcaPerformance(section, data) {
    if (!section) {
      return;
    }
    const perfState = ensurePcaPerformanceState();
    const previous = perfState[section] || {};
    const payload = {
      timestamp: Date.now(),
      ...(data || {})
    };
    if (section === 'draw' && typeof previous.totalMs === 'number' && typeof payload.totalMs === 'number') {
      payload.totalMs = Math.max(previous.totalMs, payload.totalMs);
    }
    perfState[section] = payload;
    if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      debugLog('Debug: pca performance mark', {
        section,
        payload
      });
    }
  }

  function markPcaDataDirty(reason, sessionOverride = null) {
    const session = ensurePcaSessionOwnershipShape(sessionOverride || pcaControlOwnerContext?.session) || getActivePcaSessionForState();
    updatePcaRenderRuntime(session, renderRuntime => {
      renderRuntime.dataDirty = true;
      renderRuntime.viewDirty = true;
      renderRuntime.cachedRender = null;
    }, {
      seedFromActive: true
    });
    clearPcaAnalysisCache(session);
    updatePcaDrawRuntime(session, drawRuntime => {
      drawRuntime.resizeWarmupPending = false;
    }, {
      seedFromActive: true
    });
    if (reason && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      debugLog('Debug: pca data marked dirty', {
        reason,
        tabId: session?.tabId || null
      });
    }
  }

  function markPcaPayloadDirtyForSession(session = null, reason = 'pca-payload-dirty') {
    const ownerSession = ensurePcaSessionOwnershipShape(session);
    const tabId = ownerSession?.tabId
      || pcaControlOwnerContext?.tabId
      || pcaControlOwnerContext?.session?.tabId
      || getPcaProjectionTabId()
      || getActivePcaSessionForState()?.tabId
      || null;
    const mainSession = global.Main?.session || null;
    if (tabId && typeof mainSession?.markTabUserModified === 'function') {
      return !!mainSession.markTabUserModified(tabId, reason, {
        origin: 'user',
        type: 'pca',
        source: reason === 'pca-rotation-change' ? 'pca-rotation' : 'pca-payload',
        affectsPayload: true
      });
    }
    return false;
  }

  function markActivePcaPayloadDirty(reason) {
    return markPcaPayloadDirtyForSession(null, reason || 'pca-payload-dirty');
  }

  function markPcaViewDirty(reason, sessionOverride = null) {
    const session = ensurePcaSessionOwnershipShape(sessionOverride) || getActivePcaSessionForState();
    const renderRuntime = getPcaRenderRuntime(session, {
      seedFromActive: true
    });
    if (!renderRuntime.viewDirty) {
      updatePcaRenderRuntime(session, nextRuntime => {
        nextRuntime.viewDirty = true;
      });
      if (reason && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
        debugLog('Debug: pca view marked dirty', {
          reason,
          tabId: session?.tabId || null
        });
      }
    }
  }

  function requestPcaDataRefresh(reason, options = {}) {
    const ownerSession = pcaControlOwnerContext?.session || null;
    markPcaDataDirty(reason, ownerSession);
    const nextOptions = (options && typeof options === 'object') ? {
      ...options
    } : {};
    if (!nextOptions.tabId && (pcaControlOwnerContext?.tabId || ownerSession?.tabId)) {
      nextOptions.tabId = pcaControlOwnerContext?.tabId || ownerSession?.tabId;
    }
    if (reason && !Object.prototype.hasOwnProperty.call(nextOptions, 'reason')) {
      nextOptions.reason = reason;
    }
    scheduleActivePcaDraw(nextOptions);
  }

  function requestPcaViewRefresh(reason, drawOptions) {
    const options = (drawOptions && typeof drawOptions === 'object') ?
      {
        ...drawOptions
      } :
      {};
    const nextReason = reason || options.reason || 'pca-view-refresh';
    if (!Object.prototype.hasOwnProperty.call(options, 'reason')) {
      options.reason = nextReason;
    }
    const ownerTabId = resolvePcaAsyncTabId(options) || pcaControlOwnerContext?.tabId || pcaControlOwnerContext?.session?.tabId || getPcaProjectionTabId() || null;
    const ownerSession = ownerTabId ?
      getPcaSession(ownerTabId, {
        tabId: ownerTabId,
        reason: nextReason
      }, {
        create: false
      }) :
      getActivePcaSessionForState();
    // Mirror line.js (scheduleLineViewRefresh) / scatter.js (scheduleScatterViewRefresh):
    // derive interaction intent from the reason and propagate userInitiated/forceDraw so
    // user-driven refreshes (resize, style edits) are never dropped by the
    // post-render-cache-restore draw suppression that guards the tab-scoped scheduler.
    const normalizedReason = String(nextReason).trim().toLowerCase();
    const passiveReason = normalizedReason.includes('restore') ||
      normalizedReason.includes('payload') ||
      normalizedReason.includes('programmatic') ||
      normalizedReason.includes('auto') ||
      normalizedReason.includes('init') ||
      normalizedReason.includes('observer') ||
      normalizedReason.includes('layout') ||
      normalizedReason.includes('sync');
    const lifecycleMeta = {
      tabId: ownerTabId || getPcaProjectionTabId() || null,
      reason: nextReason,
      source: 'pca-view-refresh',
      forceDraw: options.force === true || options.forceDraw === true,
      userInitiated: options.userInitiated === true || (options.userInitiated !== false && !passiveReason)
    };
    if (Shared.componentLifecycle?.shouldSuppressDraw?.('pca', lifecycleMeta)) {
      debugLog('Debug: pca view refresh suppressed by lifecycle', {
        reason: nextReason,
        tabId: lifecycleMeta.tabId
      });
      Shared.componentLifecycle?.emitLifecycleEvent?.({
        componentKey: 'pca',
        tabId: lifecycleMeta.tabId,
        action: 'draw-suppressed',
        reason: nextReason,
        details: {
          source: 'pca-view-refresh'
        }
      });
      return;
    }
    options.forceDraw = lifecycleMeta.forceDraw === true;
    options.userInitiated = lifecycleMeta.userInitiated === true;
    const session = ownerSession || getActivePcaSessionForState();
    markPcaViewDirty(nextReason, session);
    getPcaRenderRuntime(session, {
      seedFromActive: true
    });
    const drawRuntime = getPcaDrawRuntime(session, {
      seedFromActive: true
    });
    if (!getPcaAnalysisCache(session)) {
      const resizeRefresh = normalizedReason.includes('resize');
      if (resizeRefresh && drawRuntime.resizeWarmupPending) {
        debugLog('Debug: pca resize warmup draw already pending', {
          reason: nextReason,
          tabId: session?.tabId || null
        });
        return;
      }
      markPcaDataDirty(nextReason || 'view-refresh-no-cache', session);
      if (resizeRefresh) {
        updatePcaDrawRuntime(session, nextRuntime => {
          nextRuntime.resizeWarmupPending = true;
        });
      }
      schedulePcaDrawForSession(session, options);
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(options, 'viewOnly')) {
      options.viewOnly = true;
    }
    schedulePcaDrawForSession(session, options);
  }

  function isPcaFontStyleEvent(detail) {
    const scopeId = detail?.scopeId || null;
    const storeKey = typeof detail?.storeKey === 'string' ? detail.storeKey : '';
    return scopeId === 'pca' || storeKey.startsWith('pca::');
  }

  function projectPcaRenderedParameterMetadata(svg, session = null, configOverride = null) {
    if (!svg) return;
    svg.querySelectorAll?.('metadata[data-parameter-observable="pca"]').forEach(node => node.remove());
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const tabConfig = resolvePcaWorkspaceTabForSession(owner)?.payload?.config || null;
    const config = {
      ...snapshotPcaConfig(null, owner),
      ...(tabConfig && typeof tabConfig === 'object' ? tabConfig : {}),
      ...(configOverride && typeof configOverride === 'object' ? configOverride : {})
    };
    const paths = [
      'axis.strokeWidth', 'axis.minorTickSubdivisionsX', 'axis.minorTickSubdivisionsY',
      'backgroundColor', 'textColor',
      'gridStyle.color', 'gridStyle.pattern', 'gridStyle.thickness', 'gridStyle.transparency'
    ];
    const visitStyles = (value, path) => {
      if (!value || typeof value !== 'object') return;
      Object.keys(value).forEach(key => {
        const nextPath = `${path}.${key}`;
        const child = value[key];
        if (child && typeof child === 'object') visitStyles(child, nextPath);
        else paths.push(nextPath);
      });
    };
    visitStyles(config.pointStyleScopes?.groups, 'pointStyleScopes.groups');
    visitStyles(config.pointStyleScopes?.points, 'pointStyleScopes.points');
    paths.forEach(path => {
      const value = path.split('.').reduce((current, key) => current?.[key], config);
      if (value === undefined || value === null) return;
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
      node.setAttribute('data-parameter-observable', 'pca');
      node.setAttribute('data-parameter-key', `config.${path}`);
      node.setAttribute('data-parameter-value', String(value));
      svg.appendChild(node);
    });
  }

  function isPcaPointLabelFontStyleEvent(detail) {
    const token = String(detail?.storeKey || '').split('::').filter(Boolean).pop() || '';
    return token === '__labels__' || token.startsWith('pointLabel:');
  }

  function ensurePcaFontEventListener() {
    if (pcaFontEventBound || !global.document || typeof global.document.addEventListener !== 'function') {
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if (!isPcaFontStyleEvent(detail)) {
        return;
      }
      if (isPcaPointLabelFontStyleEvent(detail)) {
        const tabId = detail.tabId || getPcaProjectionTabId() || null;
        const owner = getPcaSession(tabId, {
          tabId,
          reason: 'pca-point-label-font-owner'
        }, { create: false });
        preserveRenderedPcaPointLabelPositions(owner, 'pca-point-label-font-position');
      }
      requestPcaViewRefresh('font-style-change', {
        tabId: detail.tabId || null
      });
    });
    pcaFontEventBound = true;
  }

  const pcaUndoManager = Shared.undoManager || null;

  function recordPcaChange(label, previous, next, apply) {
    if (!pcaUndoManager || typeof pcaUndoManager.recordStateChange !== 'function') {
      return;
    }
    if (typeof apply !== 'function') {
      return;
    }
    const recorder = Shared.styleUndo?.recordStateChange || (opts => pcaUndoManager.recordStateChange(opts));
    recorder({
      manager: pcaUndoManager,
      label,
      scope: 'pcaGraphPanel',
      from: previous,
      to: next,
      apply(value) {
        apply(value);
        return true;
      }
    });
  }

  function bindPcaTitleInlineInteraction(node, ownerSession = null) {
    const owner = ensurePcaSessionOwnershipShape(ownerSession || getActivePcaSessionForState());
    if (!node || !owner || typeof makeEditableHelper !== 'function') { return false; }
    makeEditableHelper(node, value => {
      const method = owner.state?.lastMethod || pcaState.lastMethod || 'pca';
      const fallbackTitle = getDefaultTitleForMethod(method);
      const currentLabels = getPcaLabelsState(owner, method);
      const previous = currentLabels.title || fallbackTitle;
      const nextValue = String(value || '').trim() || fallbackTitle;
      if (previous === nextValue) { return; }
      const apply = titleValue => {
        const normalized = String(titleValue || '').trim() || fallbackTitle;
        patchPcaLabelsState(owner, { title: normalized }, { reason: 'pca-title-change' });
        if (node.textContent !== normalized) { node.textContent = normalized; }
        schedulePcaDrawForSession(owner, { reason: 'pca-title-change' });
        return true;
      };
      apply(nextValue);
      recordPcaChange('pca:title', previous, nextValue, apply);
    });
    return true;
  }

  function rehydratePcaInlineTextInteractions(svg, ownerSession = null) {
    const title = svg?.querySelector?.('[data-font-role="graphTitle"]') || null;
    return title ? bindPcaTitleInlineInteraction(title, ownerSession) : true;
  }

  function applyPcaGroupColor(index, value) {
    const nextValue = value != null ? String(value) : '';
    if (!nextValue) {
      return true;
    }
    const scopes = ensurePcaPointStyleScopes();
    const previousValue = scopes.groups?.[String(index)]?.fill || '';
    if (previousValue === nextValue) {
      return true;
    }
    applyPcaScopedPointStylePatch('group', String(index), { fill: nextValue }, {
      reason: 'group-color-change'
    });
    requestPcaViewRefresh('group-color-change');
    return true;
  }

  function createDefaultAxisSettings() {
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: {
        tickInterval: null, majorTickLength: null,
        minorTicks: false,
        minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS
      },
      y: {
        tickInterval: null, majorTickLength: null,
        minorTicks: false,
        minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS
      }
    };
  }

  function sanitizeGroupShape(value, index) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (GROUP_SHAPE_VALUES.has(raw)) {
      return raw;
    }
    const fallbackIndex = Number.isFinite(index) ? index : 0;
    const defaultShape = GROUP_SHAPE_DEFAULTS.length ?
      GROUP_SHAPE_DEFAULTS[Math.abs(fallbackIndex) % GROUP_SHAPE_DEFAULTS.length] :
      'circle';
    return defaultShape || 'circle';
  }

  function resolveCurrentPcaGroupMeta() {
    const session = getActivePcaSessionForState();
    const cache = getPcaAnalysisCache(session) || {};
    const labels = Array.isArray(cache.labels) ? cache.labels : [];
    const sampleCount = Number(cache.sampleCount) || labels.length || 0;
    return resolvePcaGroupMeta(sampleCount, labels, {
      columnIndices: cache.sampleColumnIndices || [],
      groupHeaderRow: cache.groupedHeaderRow || []
    });
  }

  function commitPcaPointStyleScopes(reason = 'point-style-change') {
    const scopes = ensurePcaPointStyleScopes();
    const ownerSession = ensurePcaSessionOwnershipShape(pcaControlOwnerContext?.session || getActivePcaSessionForState());
    if (ownerSession?.state) {
      ownerSession.state = normalizePcaSessionRecord(ownerSession.state, ownerSession.tabId);
      ownerSession.state.state = ownerSession.state.state && typeof ownerSession.state.state === 'object' ?
        ownerSession.state.state :
        createDefaultPcaOwnedState();
      ownerSession.state.state.pointStyleScopes = cloneSimple(scopes);
      ownerSession.updatedAt = Date.now();
    }
    markPcaPayloadDirtyForSession(ownerSession, reason);
    return scopes;
  }

  function applyPcaScopedPointStylePatch(scopeKind, scopeDataset, patch, options = {}) {
    const normalizedPatch = normalizePcaPointStyle(patch || {});
    const keys = Object.keys(normalizedPatch);
    if (!keys.length) {
      return false;
    }
    const scopes = ensurePcaPointStyleScopes();
    const kind = String(scopeKind || '').trim().toLowerCase();
    const dataset = String(scopeDataset == null ? '' : scopeDataset).trim();
    if (kind === 'global') {
      Object.assign(scopes.global, normalizedPatch);
      Object.values(scopes.groups).forEach(style => Object.assign(style, normalizedPatch));
      Object.values(scopes.points).forEach(style => Object.assign(style, normalizedPatch));
    } else if (kind === 'group') {
      const groupIndex = Number(dataset);
      if (!Number.isInteger(groupIndex) || groupIndex < 0) {
        return false;
      }
      const key = String(groupIndex);
      scopes.groups[key] = {
        ...(scopes.groups[key] || {}),
        ...normalizedPatch
      };
      const groupMeta = options.groupMeta || resolveCurrentPcaGroupMeta();
      const assignments = Array.isArray(groupMeta?.assignments) ? groupMeta.assignments : [];
      const columnIndices = Array.isArray(groupMeta?.columnIndices) ? groupMeta.columnIndices : [];
      assignments.forEach((assignment, sampleIndex) => {
        if (assignment !== groupIndex) {
          return;
        }
        const pointKey = pcaColumnPointStyleKey(columnIndices[sampleIndex]);
        if (pointKey && scopes.points[pointKey]) {
          Object.assign(scopes.points[pointKey], normalizedPatch);
        }
      });
    } else if (kind === 'point') {
      if (!dataset) {
        return false;
      }
      scopes.points[dataset] = {
        ...(scopes.points[dataset] || {}),
        ...normalizedPatch
      };
    } else {
      return false;
    }
    commitPcaPointStyleScopes(options.reason || `${kind}-point-style-change`);
    return true;
  }

  function resolvePcaPointStyle(point = {}, groupIndex = null, fallbackIndex = 0, options = {}) {
    const controls = options.controls || pcaState.controls;
    const scopes = options.scopes
      ? normalizePcaPointStyleScopes(options.scopes, { controls })
      : ensurePcaPointStyleScopes();
    const style = { ...scopes.global };
    const tableFormat = options.tableFormat || pcaState.tableFormat;
    if (tableFormat === 'grouped' && Number.isInteger(groupIndex)) {
      Object.assign(style, scopes.groups[String(groupIndex)] || {});
    } else {
      const labelKey = pcaLabelPointStyleKey(point.label);
      if (labelKey) {
        Object.assign(style, scopes.points[labelKey] || {});
      }
    }
    const pointKey = pcaColumnPointStyleKey(point.columnIndex);
    if (pointKey) {
      Object.assign(style, scopes.points[pointKey] || {});
    }
    return {
      ...createPcaGlobalPointStyle(controls),
      ...normalizePcaPointStyle(style, { fallbackIndex })
    };
  }

  function resolvePcaScopedPointStyle(scopeKind, scopeDataset, pointData = {}, groupMeta = null) {
    const scopes = ensurePcaPointStyleScopes();
    const kind = String(scopeKind || '').trim().toLowerCase();
    if (kind === 'global') {
      return { ...scopes.global };
    }
    if (kind === 'group') {
      return {
        ...scopes.global,
        ...(scopes.groups[String(scopeDataset)] || {})
      };
    }
    const assignment = Number.isInteger(pointData.groupIndex) ?
      pointData.groupIndex :
      (Number.isInteger(pointData.index) ? groupMeta?.assignments?.[pointData.index] : null);
    return resolvePcaPointStyle(pointData, Number.isInteger(assignment) ? assignment : null, Number(pointData.index) || 0);
  }

  function ensureAxisSettings() {
    if (!pcaState.axisSettings || typeof pcaState.axisSettings !== 'object') {
      pcaState.axisSettings = createDefaultAxisSettings();
    }
    if (!pcaState.axisSettings.x || typeof pcaState.axisSettings.x !== 'object') {
      pcaState.axisSettings.x = {
        tickInterval: null, majorTickLength: null,
        minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS
      };
    }
    if (!pcaState.axisSettings.y || typeof pcaState.axisSettings.y !== 'object') {
      pcaState.axisSettings.y = {
        tickInterval: null, majorTickLength: null,
        minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS
      };
    }
    if (typeof pcaState.axisSettings.x.minorTicks !== 'boolean') {
      pcaState.axisSettings.x.minorTicks = false;
    }
    if (typeof pcaState.axisSettings.y.minorTicks !== 'boolean') {
      pcaState.axisSettings.y.minorTicks = false;
    }
    pcaState.axisSettings.x.minorTickSubdivisions = clampMinorTickSubdivisions(pcaState.axisSettings.x.minorTickSubdivisions);
    pcaState.axisSettings.y.minorTickSubdivisions = clampMinorTickSubdivisions(pcaState.axisSettings.y.minorTickSubdivisions);
    const numericStroke = Number(pcaState.axisSettings.strokeWidth);
    pcaState.axisSettings.strokeWidth = Number.isFinite(numericStroke) && numericStroke > 0 ? numericStroke : 1;
    if (typeof pcaState.axisSettings.color !== 'string' || !pcaState.axisSettings.color.trim()) {
      pcaState.axisSettings.color = DEFAULT_AXIS_COLOR;
    }
    return pcaState.axisSettings;
  }

  function createDefaultGridStyle(fallbackThickness) {
    const thickness = Number.isFinite(Number(fallbackThickness)) && Number(fallbackThickness) >= 0 ?
      Number(fallbackThickness) :
      1;
    return {
      color: DEFAULT_GRID_COLOR,
      thickness,
      pattern: 'solid',
      transparency: 0
    };
  }

  function sanitizeGridStyle(style, fallbackThickness) {
    const fallback = createDefaultGridStyle(fallbackThickness);
    if (gridControls && typeof gridControls.sanitizeStyle === 'function') {
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
    return {
      color,
      thickness,
      pattern,
      transparency
    };
  }

  function ensureGridStyle(fallbackThickness) {
    pcaState.gridStyle = sanitizeGridStyle(pcaState.gridStyle, fallbackThickness);
    return pcaState.gridStyle;
  }

  function getGridStyle(fallbackThickness) {
    return sanitizeGridStyle(ensureGridStyle(fallbackThickness), fallbackThickness);
  }

  function setGridStyle(style, fallbackThickness) {
    pcaState.gridStyle = sanitizeGridStyle(style, fallbackThickness);
  }

  function getAxisTickInterval(axis) {
    if (axis !== 'x' && axis !== 'y') {
      return null;
    }
    const settings = ensureAxisSettings();
    const raw = settings[axis]?.tickInterval;
    if (raw === null || raw === undefined || raw === '') {
      return null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function updateAxisTickInterval(axis, value) {
    if (axis !== 'x' && axis !== 'y') {
      return;
    }
    const settings = ensureAxisSettings();
    if (value === null || value === undefined || value === '') {
      settings[axis].tickInterval = null;
    } else {
      const numeric = Number(value);
      settings[axis].tickInterval = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }
    debugLog('Debug: pca axis tick interval updated', {
      axis,
      tickInterval: settings[axis].tickInterval
    });
    requestPcaViewRefresh(`axis-ticks-${axis}`);
  }

  function getAxisMajorTickLength(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureAxisSettings();
    const storedValue = settings[axis]?.majorTickLength;
    if(storedValue === null || storedValue === undefined || storedValue === ''){ return null; }
    const numeric = Number(storedValue);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null;
  }

  function updateAxisMajorTickLength(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const numeric = Number(value);
    const nextValue = value === null || value === undefined || value === ''
      ? null
      : (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null);
    if(settings[axis].majorTickLength === nextValue){ return; }
    settings[axis].majorTickLength = nextValue;
    debugLog('Debug: pca major tick length updated',{ axis, majorTickLength: nextValue });
    requestPcaViewRefresh(`axis-major-tick-length-${axis}`);
  }

  function getAxisMinorTicksEnabled(axis) {
    if (axis !== 'x' && axis !== 'y') {
      return false;
    }
    const settings = ensureAxisSettings();
    return !!settings[axis]?.minorTicks;
  }

  function updateAxisMinorTicks(axis, enabled) {
    if (axis !== 'x' && axis !== 'y') {
      return;
    }
    const settings = ensureAxisSettings();
    const nextValue = !!enabled;
    if (settings[axis].minorTicks === nextValue) {
      return;
    }
    settings[axis].minorTicks = nextValue;
    debugLog('Debug: pca minor ticks updated', {
      axis,
      enabled: nextValue
    });
    requestPcaViewRefresh(`axis-minor-ticks-${axis}`);
  }

  function getAxisMinorTickSubdivisions(axis) {
    if (axis !== 'x' && axis !== 'y') {
      return DEFAULT_MINOR_TICK_SUBDIVISIONS;
    }
    const settings = ensureAxisSettings();
    return clampMinorTickSubdivisions(settings[axis]?.minorTickSubdivisions);
  }

  function updateAxisMinorTickSubdivisions(axis, value) {
    if (axis !== 'x' && axis !== 'y') {
      return;
    }
    const settings = ensureAxisSettings();
    const nextValue = clampMinorTickSubdivisions(value);
    if (settings[axis].minorTickSubdivisions === nextValue) {
      return;
    }
    settings[axis].minorTickSubdivisions = nextValue;
    debugLog('Debug: pca minor tick subdivisions updated', {
      axis,
      subdivisions: nextValue
    });
    requestPcaViewRefresh(`axis-minor-subdivisions-${axis}`);
  }

  function getAxisStrokeWidthBase() {
    return ensureAxisSettings().strokeWidth;
  }

  function updateAxisStrokeWidth(value) {
    const settings = ensureAxisSettings();
    if (value === null || value === undefined || value === '') {
      settings.strokeWidth = 1;
    } else {
      const numeric = Number(value);
      settings.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    }
    debugLog('Debug: pca axis stroke width updated', {
      strokeWidth: settings.strokeWidth
    });
    requestPcaViewRefresh('axis-stroke-width');
  }

  function getAxisColor() {
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value) {
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    debugLog('Debug: pca axis color updated', {
      color: settings.color
    });
    requestPcaViewRefresh('axis-color');
  }

  function resolvePcaAxisResizeTarget(ownerSession = null) {
    const owner = ensurePcaSessionOwnershipShape(ownerSession || getActivePcaSessionForState());
    const root = owner?.refs?.root || owner?.root || resolvePcaRoot(owner?.tabId || null) || null;
    return owner?.refs?.svgBox || root?.querySelector?.('#pcaGraphPanel .svgbox') || null;
  }

  function clonePcaAxisScaleForResize(scale) {
    if (!scale || typeof scale !== 'object') {
      return null;
    }
    const min = Number(scale.min);
    const max = Number(scale.max);
    const ticks = Array.isArray(scale.ticks) ? scale.ticks.map(Number).filter(Number.isFinite) : [];
    const step = Number(scale.step);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min) || !ticks.length) {
      return null;
    }
    return {
      min,
      max,
      ticks,
      step: Number.isFinite(step) && step > 0 ? step : null
    };
  }

  function readPcaRenderedAxisScale(svg, axis) {
    if (!svg) {
      return null;
    }
    const axisKey = axis === 'y' ? 'y' : 'x';
    const line = svg.querySelector?.(`[data-axis-line="1"][data-axis-key="${axisKey}"]`) || null;
    if (!line) {
      return null;
    }
    const min = Number(line.getAttribute('data-axis-min'));
    const max = Number(line.getAttribute('data-axis-max'));
    const ticks = Array.from(svg.querySelectorAll?.(`[data-axis-tick="1"][data-axis-key="${axisKey}"][data-axis-value]`) || [])
      .map(node => Number(node.getAttribute('data-axis-value')))
      .filter(Number.isFinite);
    const explicitStep = Number(line.dataset?.axisEffectiveTickInterval);
    let step = Number.isFinite(explicitStep) && explicitStep > 0 ? explicitStep : null;
    if (!(step > 0) && ticks.length >= 2) {
      const diffs = [];
      for (let index = 1; index < ticks.length; index += 1) {
        const diff = Math.abs(ticks[index] - ticks[index - 1]);
        if (Number.isFinite(diff) && diff > 0) {
          diffs.push(diff);
        }
      }
      if (diffs.length) {
        step = Math.min(...diffs);
      }
    }
    return clonePcaAxisScaleForResize({ min, max, ticks, step });
  }

  function computePca2dAxisLengthResizePlan(input = {}) {
    const axis = input.axis === 'y' ? 'y' : 'x';
    const requestedLength = Number(input.requestedLength);
    const currentX = Number(input.currentX);
    const currentY = Number(input.currentY);
    const boxHeight = Number(input.boxHeight);
    const svgHeight = Number(input.svgHeight);
    const baseHeight = Number(input.baseHeight);
    const plotHeight = Number(input.plotHeight);
    const marginTop = Number(input.marginTop);
    const marginBottom = Number(input.marginBottom);
    const frameAspect = Number(input.frameAspect);
    const values = [requestedLength, currentX, currentY, boxHeight, svgHeight, baseHeight, plotHeight, frameAspect];
    if (!values.every(value => Number.isFinite(value) && value > 0)
      || !Number.isFinite(marginTop) || marginTop < 0
      || !Number.isFinite(marginBottom) || marginBottom < 0) {
      return null;
    }
    const metricAspect = currentX / currentY;
    const svgScaleY = svgHeight / baseHeight;
    const plotProjectionScale = currentY / plotHeight;
    if (!(metricAspect > 0) || !(svgScaleY > 0) || !(plotProjectionScale > 0)) {
      return null;
    }

    // Explicit PCA axis-length editing is a physical-size transaction. Keep the
    // displayed numerical scales and top/bottom plot margins fixed for this draw,
    // then solve the outer frame directly. With those renderer-owned quantities
    // frozen, Y length is affine in frame height and X is metricAspect * Y.
    const targetPhysicalY = axis === 'x' ? requestedLength / metricAspect : requestedLength;
    const targetInternalPlotHeight = targetPhysicalY / plotProjectionScale;
    const targetBaseHeight = marginTop + targetInternalPlotHeight + marginBottom;
    const outerInset = boxHeight - svgHeight;
    const targetSvgHeight = targetBaseHeight * svgScaleY;
    const targetHeight = targetSvgHeight + outerInset;
    const targetWidth = targetHeight * frameAspect;
    if (!(targetWidth > 0) || !(targetHeight > 0)) {
      return null;
    }
    return {
      axis,
      requestedLength,
      metricAspect,
      targetPhysicalY,
      targetInternalPlotHeight,
      targetBaseHeight,
      width: targetWidth,
      height: targetHeight
    };
  }

  function capturePca2dAxisLengthTransaction(ownerSession, target, axis, requestedLength) {
    const owner = ensurePcaSessionOwnershipShape(ownerSession || getActivePcaSessionForState());
    const svg = target?.querySelector?.('#pcaSvg') || null;
    if (!owner || !target || !svg || svg.dataset?.viewMode !== '2d' || !axisControls?.measureRenderedAxes) {
      return null;
    }
    const measurement = axisControls.measureRenderedAxes(target);
    const boxRect = target.getBoundingClientRect?.();
    const svgRect = svg.getBoundingClientRect?.();
    const yAxis = measurement?.yElement || svg.querySelector?.('[data-axis-line="1"][data-axis-key="y"]') || null;
    const baseHeight = Number(svg.dataset?.legendBaseHeight) || Number(svg.viewBox?.baseVal?.height) || Number(svg.getAttribute('height'));
    const plotHeight = Number(svg.dataset?.pcaMetricPlotHeight);
    const marginTop = Number(yAxis?.getAttribute?.('y1'));
    const marginBottom = baseHeight - marginTop - plotHeight;
    const state = target.__sharedResizableBoxApi?.getState?.() || null;
    const configuredAspect = Number(state?.aspectRatio);
    const measuredAspect = Number(boxRect?.width) / Number(boxRect?.height);
    const frameAspect = Number.isFinite(configuredAspect) && configuredAspect > 0
      ? configuredAspect
      : measuredAspect;
    const plan = computePca2dAxisLengthResizePlan({
      axis,
      requestedLength,
      currentX: measurement?.x,
      currentY: measurement?.y,
      boxHeight: boxRect?.height,
      svgHeight: svgRect?.height,
      baseHeight,
      plotHeight,
      marginTop,
      marginBottom,
      frameAspect
    });
    const xScale = readPcaRenderedAxisScale(svg, 'x');
    const yScale = readPcaRenderedAxisScale(svg, 'y');
    if (!plan || !xScale || !yScale) {
      return null;
    }
    const currentLength = axis === 'y' ? Number(measurement.y) : Number(measurement.x);
    if (Number.isFinite(currentLength) && Math.abs(currentLength - Number(requestedLength)) <= 0.5) {
      return { plan, transaction: null, settled: true, currentLength };
    }
    const runtime = getPcaRenderRuntime(owner, { seedFromActive: true });
    const generation = (Number(runtime?.axisLengthTransaction?.generation) || 0) + 1;
    const transaction = {
      generation,
      expiresAt: Date.now() + 5000,
      axis: axis === 'y' ? 'y' : 'x',
      requestedLength: Number(requestedLength),
      marginTop,
      marginBottom,
      xScale,
      yScale
    };
    updatePcaRenderRuntime(owner, nextRuntime => {
      nextRuntime.axisLengthTransaction = transaction;
    });
    return { plan, transaction };
  }

  function updatePca2dAxisLength(valuePx, axis, ownerSession = null, options = {}) {
    const requestedLength = Number(valuePx);
    const owner = ensurePcaSessionOwnershipShape(ownerSession || getActivePcaSessionForState());
    const target = resolvePcaAxisResizeTarget(owner);
    if (!owner || !target || !Number.isFinite(requestedLength) || requestedLength <= 0
      || typeof Shared.applyResizableBoxSize !== 'function') {
      return null;
    }
    const transaction = capturePca2dAxisLengthTransaction(owner, target, axis, requestedLength);
    if (!transaction) {
      debugLog('Debug: pca single-pass axis resize unavailable', {
        axis,
        requestedLength,
        tabId: owner.tabId || null,
        reason: options.reason || null
      });
      return null;
    }
    const axisKey = axis === 'y' ? 'y' : 'x';
    const desiredDatasetKey = axisKey === 'y' ? 'axisDesiredLengthY' : 'axisDesiredLengthX';
    const desiredTimestampKey = axisKey === 'y' ? 'axisDesiredLengthYTs' : 'axisDesiredLengthXTs';
    if (target.dataset) {
      target.dataset[desiredDatasetKey] = String(requestedLength);
      target.dataset[desiredTimestampKey] = String(Date.now());
    }
    if (transaction.settled === true) {
      return true;
    }
    debugLog('Debug: pca single-pass axis resize', {
      axis: axisKey,
      requestedLength,
      targetWidth: transaction.plan.width,
      targetHeight: transaction.plan.height,
      metricAspect: transaction.plan.metricAspect,
      tabId: owner.tabId || null,
      reason: options.reason || null
    });
    const applied = Shared.applyResizableBoxSize(target, {
      axis: 'both',
      width: transaction.plan.width,
      height: transaction.plan.height,
      reason: options.reason || `pca-axis-length-${axisKey}`,
      updateDefaults: false,
      updateAspectRatio: false,
      preserveAspectLock: true,
      forceExact: true,
      simulateAspectLock: true,
      resizePhase: options.refine === false ? 'move' : 'programmatic'
    });
    if (applied == null || applied === false) {
      updatePcaRenderRuntime(owner, runtime => {
        if (Number(runtime.axisLengthTransaction?.generation) === Number(transaction.transaction?.generation)) {
          runtime.axisLengthTransaction = null;
        }
      });
    }
    return applied;
  }

  function buildPcaAxisControlConfig(axis, ownerSession = null, axisMeta = {}) {
    const owner = ensurePcaSessionOwnershipShape(ownerSession || getActivePcaSessionForState());
    return {
      axis,
      scopeId: 'pca',
      tabId: owner?.tabId || null,
      getResizeTarget: () => resolvePcaAxisResizeTarget(owner),
      ...(axisMeta?.viewMode === '2d' ? {
        // PCA 2D has a metric-derived X length. Solve its physical-size request in
        // one renderer-aware transaction so a toolbar commit causes one visible
        // frame resize instead of a delayed resize/refine sequence.
        onAxisLengthChange: (value, axisName, options) => updatePca2dAxisLength(value, axisName, owner, options)
      } : {}),
      isAxisLengthProportionLocked: () => true,
      getTickInterval: () => getAxisTickInterval(axis),
      getEffectiveTickInterval: () => axisMeta?.effectiveTickInterval ?? null,
      getMajorTickLength: () => getAxisMajorTickLength(axis),
      onMajorTickLengthChange: value => updateAxisMajorTickLength(axis, value),
      isMajorTickLengthSupported: () => true,
      majorTickLengthPlaceholder: 'Auto',
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
    };
  }

  function registerPcaGridControlTarget(target, options) {
    if (!target || !gridControls || typeof gridControls.registerGraphElement !== 'function') {
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackThickness = Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : getAxisStrokeWidthBase();
    gridControls.registerGraphElement(target, {
      scopeId: 'pca',
      getVisible: () => !!pcaShowGrid?.checked,
      onVisibleChange: value => {
        if (pcaShowGrid) {
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

  function applyAxisSettings(settings) {
    const base = createDefaultAxisSettings();
    if (settings && typeof settings === 'object') {
      const strokeCandidate = Number(settings.strokeWidth ?? settings.axisThickness);
      if (Number.isFinite(strokeCandidate) && strokeCandidate > 0) {
        base.strokeWidth = strokeCandidate;
      }
      if (typeof settings.color === 'string' && settings.color.trim()) {
        base.color = settings.color;
      }
      const xInterval = settings.tickIntervalX ?? settings.xTickInterval ?? settings?.x?.tickInterval ?? null;
      const yInterval = settings.tickIntervalY ?? settings.yTickInterval ?? settings?.y?.tickInterval ?? null;
      base.x.tickInterval = xInterval === '' ? null : xInterval;
      base.y.tickInterval = yInterval === '' ? null : yInterval;
      const xMajorTickLength = settings.majorTickLengthX ?? settings.xMajorTickLength ?? settings?.x?.majorTickLength ?? null;
      const yMajorTickLength = settings.majorTickLengthY ?? settings.yMajorTickLength ?? settings?.y?.majorTickLength ?? null;
      base.x.majorTickLength = chartStyle.normalizeOptionalMajorTickLength(xMajorTickLength);
      base.y.majorTickLength = chartStyle.normalizeOptionalMajorTickLength(yMajorTickLength);
      base.x.minorTicks = !!(settings.minorTicksX ?? settings.x?.minorTicks ?? false);
      base.y.minorTicks = !!(settings.minorTicksY ?? settings.y?.minorTicks ?? false);
      const xMinorSubdiv = settings.minorTickSubdivisionsX ?? settings.minorSubdivisionsX ?? settings.x?.minorTickSubdivisions ?? settings.x?.minorSubdivisions ?? null;
      const yMinorSubdiv = settings.minorTickSubdivisionsY ?? settings.minorSubdivisionsY ?? settings.y?.minorTickSubdivisions ?? settings.y?.minorSubdivisions ?? null;
      base.x.minorTickSubdivisions = clampMinorTickSubdivisions(xMinorSubdiv);
      base.y.minorTickSubdivisions = clampMinorTickSubdivisions(yMinorSubdiv);
    }
    pcaState.axisSettings = base;
    ensureAxisSettings();
    debugLog('Debug: pca axis settings applied', {
      settings: pcaState.axisSettings
    });
  }

  function buildManualTicks(min, max, interval) {
    if (!Number.isFinite(interval) || interval <= 0) {
      return null;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return null;
    }
    if (min === max) {
      max = min + interval;
    }
    const graphMin = Math.floor(min / interval) * interval;
    const graphMax = Math.ceil(max / interval) * interval;
    const ticks = [];
    let current = graphMin;
    let guard = 0;
    while (current <= graphMax + interval * 0.25 && guard < 1000) {
      ticks.push(Number.parseFloat(current.toPrecision(12)));
      current += interval;
      guard += 1;
    }
    if (!ticks.length) {
      ticks.push(Number.parseFloat(graphMin.toPrecision(12)));
    }
    debugLog('Debug: pca manual ticks computed', {
      interval,
      tickCount: ticks.length,
      min: graphMin,
      max: graphMax
    });
    return {
      min: graphMin,
      max: graphMax,
      ticks
    };
  }

  function resolvePca2dMetricScales(xScale, yScale, equalAxisLengths) {
    const cloneScale = scale => ({
      ...(scale || {}),
      ticks: Array.isArray(scale?.ticks) ? scale.ticks.slice() : []
    });
    const x = cloneScale(xScale);
    const y = cloneScale(yScale);
    const spanX = Number(x.max) - Number(x.min);
    const spanY = Number(y.max) - Number(y.min);
    if (!equalAxisLengths || !(spanX > 0) || !(spanY > 0)) {
      return { x, y };
    }
    const targetSpan = Math.max(spanX, spanY);
    const expand = (scale, span) => {
      if (Math.abs(span - targetSpan) <= Math.max(1, targetSpan) * 1e-12) {
        return scale;
      }
      const center = (Number(scale.min) + Number(scale.max)) / 2;
      return {
        ...scale,
        min: center - targetSpan / 2,
        max: center + targetSpan / 2
      };
    };
    return {
      x: expand(x, spanX),
      y: expand(y, spanY)
    };
  }

  function resolvePca2dMetricLayout(totalWidth, totalHeight, margin, xScale, yScale, equalAxisLengths, options = {}) {
    const metricScales = resolvePca2dMetricScales(xScale, yScale, equalAxisLengths);
    const spanX = Math.max(1e-12, Number(metricScales.x.max) - Number(metricScales.x.min));
    const spanY = Math.max(1e-12, Number(metricScales.y.max) - Number(metricScales.y.min));
    const desiredAspect = spanX / spanY;
    const baselineMargin = {
      top: Math.max(0, Number(margin?.top) || 0),
      right: Math.max(0, Number(margin?.right) || 0),
      bottom: Math.max(0, Number(margin?.bottom) || 0),
      left: Math.max(0, Number(margin?.left) || 0)
    };
    const cartesian = Shared.cartesianLayout;
    if(cartesian && typeof cartesian.planCartesianLayout === 'function'){
      const requiredMargins = options.requiredMargins && typeof options.requiredMargins === 'object'
        ? options.requiredMargins
        : baselineMargin;
      const requestedExternalExtensions = options.externalExtensions && typeof options.externalExtensions === 'object'
        ? options.externalExtensions
        : {};
      const buildPlan = externalExtensions => cartesian.planCartesianLayout({
        owner: options.owner || null,
        userFrame: { width: totalWidth, height: totalHeight },
        baselineMargins: baselineMargin,
        requiredMargins,
        auxiliaryReserves: options.auxiliaryReserves || [],
        externalExtensions,
        orientation: 'normal',
        // PCA's metric is component-owned. The transaction receives the final
        // coordinate-span ratio and resolves that plot before any legend or
        // measured label extension is published.
        plotConstraint: {
          type: 'ratio',
          ratio: desiredAspect,
          fit: 'height-extend',
          anchor: 'top-left'
        },
        lock: {
          enabled: options.resizeMetricLocked === true,
          targetRatio: desiredAspect,
          drive: options.resizeDrive || 'both'
        },
        minimumPlot: options.minimumPlot || { width: 20, height: 20 },
        contentBounds: options.contentBounds || null,
        rounding: { mode: 'none', precision: 6 }
      });
      let plan = buildPlan({});
      const plotRight = plan.plotRect.x + plan.plotRect.width;
      const availableRightRail = Math.max(0, Number(totalWidth) - plotRight);
      const resolvedExternalExtensions = {
        ...requestedExternalExtensions,
        right: Math.max(0, (Number(requestedExternalExtensions.right) || 0) - availableRightRail)
      };
      if(Object.values(resolvedExternalExtensions).some(value => Number(value) > 0)){
        plan = buildPlan(resolvedExternalExtensions);
      }
      const plotRect = plan.plotRect;
      const basePlotRect = plan.basePlotRect;
      const plotRightOverflow = Math.max(
        0,
        (plotRect.x + plotRect.width) - (basePlotRect.x + basePlotRect.width)
      );
      const plotBottomOverflow = Math.max(
        0,
        (plotRect.y + plotRect.height) - (basePlotRect.y + basePlotRect.height)
      );
      // Preserve the canonical opposite rails exactly as the pre-transaction
      // metric helper did. A plot that is narrower/taller can add slack to the
      // corresponding margin; a plot that extends outward must not expose a
      // negative margin to downstream axis/legend code. Its overflow lives in
      // the derived content envelope instead.
      const resolvedMargin = {
        left: plotRect.x,
        top: plotRect.y,
        right: Math.max(
          baselineMargin.right,
          baselineMargin.right + Math.max(0, basePlotRect.width - plotRect.width)
        ),
        bottom: Math.max(
          baselineMargin.bottom,
          baselineMargin.bottom + Math.max(0, basePlotRect.height - plotRect.height)
        )
      };
      return {
        xScale: metricScales.x,
        yScale: metricScales.y,
        spanX,
        spanY,
        desiredAspect,
        margin: resolvedMargin,
        plotW: plotRect.width,
        plotH: plotRect.height,
        rightExtension: plotRightOverflow,
        bottomExtension: plotBottomOverflow,
        renderWidth: Math.max(Number(totalWidth) || 1, Number(totalWidth || 0) + plotRightOverflow),
        renderHeight: Math.max(Number(totalHeight) || 1, Number(totalHeight || 0) + plotBottomOverflow),
        cartesianPlan: plan
      };
    }
    const layout = chartStyle.fitPlotAspectPreservingHeight(
      totalWidth,
      totalHeight,
      baselineMargin,
      desiredAspect
    );
    return {
      xScale: metricScales.x,
      yScale: metricScales.y,
      spanX,
      spanY,
      desiredAspect,
      margin: layout.margin,
      plotW: layout.plotW,
      plotH: layout.plotH,
      rightExtension: layout.rightExtension,
      renderWidth: layout.renderWidth,
      cartesianPlan: null
    };
  }

  function resolvePca3dMetricRanges(axisRanges, equalAxisLengths) {
    const source = axisRanges && typeof axisRanges === 'object' ? axisRanges : {};
    const ranges = {};
    for (const axisKey of ['x', 'y', 'z']) {
      const min = Number(source[axisKey]?.min);
      const max = Number(source[axisKey]?.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) {
        return null;
      }
      ranges[axisKey] = { min, max };
    }
    if (!equalAxisLengths) {
      return ranges;
    }
    const targetSpan = Math.max(
      ranges.x.max - ranges.x.min,
      ranges.y.max - ranges.y.min,
      ranges.z.max - ranges.z.min
    );
    for (const axisKey of ['x', 'y', 'z']) {
      const center = (ranges[axisKey].min + ranges[axisKey].max) / 2;
      ranges[axisKey] = {
        min: center - targetSpan / 2,
        max: center + targetSpan / 2
      };
    }
    return ranges;
  }

  function normalizePcaAxisSelection(source = {}, dimensionCount = 0) {
    const axis = source && typeof source === 'object' ? {
      x: source.x,
      y: source.y,
      z: source.z
    } : {
      x: 1,
      y: 2,
      z: 3
    };
    const count = Number.isFinite(Number(dimensionCount)) ? Math.max(0, Math.floor(Number(dimensionCount))) : 0;
    if (count <= 0) {
      return axis;
    }
    const clampVal = (value, fallback) => {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        return fallback;
      }
      const rounded = Math.round(num);
      return Math.min(Math.max(rounded, 1), count);
    };
    axis.x = clampVal(axis.x, 1);
    axis.y = clampVal(axis.y, count >= 2 ? 2 : 1);
    if (count >= 2 && axis.x === axis.y) {
      axis.y = axis.x === count ? Math.max(1, axis.x - 1) : Math.min(count, axis.x + 1);
      if (axis.x === axis.y && count > 1) {
        axis.y = axis.x === 1 ? 2 : 1;
      }
    }
    if (count >= 3) {
      axis.z = clampVal(axis.z, 3);
      if (axis.z === axis.x || axis.z === axis.y) {
        let candidate = 1;
        while (candidate <= count && (candidate === axis.x || candidate === axis.y)) {
          candidate += 1;
        }
        axis.z = candidate <= count ? candidate : count;
      }
    } else {
      axis.z = clampVal(axis.z, count);
    }
    return axis;
  }

  function sanitizeAxisSelection(dimensionCount) {
    const axis = pcaState.axisSelection;
    const before = {
      ...axis
    };
    const normalized = normalizePcaAxisSelection(axis, dimensionCount);
    axis.x = normalized.x;
    axis.y = normalized.y;
    axis.z = normalized.z;
    const changed = before.x !== axis.x || before.y !== axis.y || before.z !== axis.z;
    if (changed) {
      debugLog('Debug: pca axis selection sanitized', {
        before,
        after: {
          ...axis
        },
        dimensionCount: Number.isFinite(Number(dimensionCount)) ? Math.max(0, Math.floor(Number(dimensionCount))) : 0
      }); // Debug: axis sanitize summary
    }
    return axis;
  }

  function axisSelectionToIndices(dimensionCount) {
    const count = Number.isFinite(Number(dimensionCount)) ? Math.max(0, Math.floor(Number(dimensionCount))) : 0;
    if (count <= 0) {
      return {
        x: 0,
        y: 0,
        z: null
      };
    }
    const toIndex = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        return 0;
      }
      const idx = Math.round(num) - 1;
      return Math.min(Math.max(idx, 0), count - 1);
    };
    return {
      x: toIndex(pcaState.axisSelection.x),
      y: toIndex(pcaState.axisSelection.y),
      z: count >= 3 ? toIndex(pcaState.axisSelection.z) : null
    };
  }

  function formatAxisLabel(meta) {
    if (!meta) {
      return '';
    }
    const base = meta.label || '';
    const pct = typeof meta.variancePercent === 'number' ? meta.variancePercent : null;
    if (pct !== null && !Number.isNaN(pct)) {
      return `${base} (${pct.toFixed(1)}%)`;
    }
    return base;
  }


  const serializeSvg = (svgEl) => {
    if (typeof global.serializeCleanSVG === 'function') return global.serializeCleanSVG(svgEl);
    const clone = svgEl.cloneNode(true);
    if (clone.querySelectorAll) {
      clone.querySelectorAll('[contenteditable],[contentEditable]').forEach(el => {
        el.removeAttribute('contenteditable');
        el.removeAttribute('contentEditable');
      });
    }
    return new(global.XMLSerializer || XMLSerializer)().serializeToString(clone);
  };

  function syncPcaGroupedControls() {
    if (pcaEls.groupedReplicates) {
      pcaEls.groupedReplicates.value = String(pcaState.grouped.replicatesPerGroup);
    }
  }

  function updatePcaTableFormatUI() {
    if (pcaEls.tableFormat) {
      pcaEls.tableFormat.value = pcaState.tableFormat === 'grouped' ? 'grouped' : 'standard';
    }
    const groupedActive = pcaState.tableFormat === 'grouped';
    const showGroupedControls = groupedActive;
    if (pcaEls.groupedControls) {
      pcaEls.groupedControls.style.display = showGroupedControls ? '' : 'none';
      pcaEls.groupedControls.setAttribute('aria-hidden', showGroupedControls ? 'false' : 'true');
    }
    if (groupedActive) {
      syncPcaGroupedControls();
    }
  }

  function setPcaTableFormat(format, options = {}) {
    const normalized = format === 'grouped' ? 'grouped' : 'standard';
    const reason = options.reason || 'pca-table-format-change';
    const restoreMode = options.restore === true || options.system === true || pcaState.applyingPayload === true;
    const changed = pcaState.tableFormat !== normalized;
    if (changed) {
      pcaState.tableFormat = normalized;
      debugLog('Debug: pca table format set', {
        format: normalized,
        reason,
        restoreMode
      });
    }
    updatePcaTableFormatUI();
    applyPcaTableFormatToHot(ensurePcaHotForActiveTab());
    if (restoreMode) {
      const owner = getPcaSessionOwnedState(getPcaProjectionSession({
        reason: 'pca-table-format-restore-owner'
      }));
      owner.state.tableFormat = normalized;
      persistPcaSessionOwnedState(owner.session, reason);
      return;
    }
    capturePcaSessionStateFromActive(getPcaProjectionSession({
      reason: 'pca-projection-mutation'
    }), {
      reason
    });
    if (options.skipDirty === true || !changed) {
      return;
    }
    markActivePcaPayloadDirty(reason);
    requestPcaDataRefresh(options.refreshReason || 'table-format-change');
  }

  function updateGroupedColorInput(groupIndex, color) {
    if (!pcaEls.groupedList) {
      return;
    }
    const selector = `input[type="color"][data-group-index="${groupIndex}"]`;
    const target = pcaEls.groupedList.querySelector(selector);
    if (target && typeof color === 'string') {
      target.value = color;
    }
  }

  function updateGroupedShapeInput(groupIndex, shape) {
    if (!pcaEls.groupedList) {
      return;
    }
    const selector = `select[data-group-index="${groupIndex}"][data-shape-control="1"]`;
    const target = pcaEls.groupedList.querySelector(selector);
    if (target) {
      target.value = shape;
    }
  }

  function resolvePcaGroupMeta(sampleCount, labels, options = {}) {
    if (pcaState.tableFormat !== 'grouped' || sampleCount <= 0) {
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
    if (columnIndices.length === sampleCount) {
      for (let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx += 1) {
        const sourceCol = Number(columnIndices[sampleIdx]);
        if (!Number.isInteger(sourceCol) || sourceCol < 1) {
          continue;
        }
        const groupIndex = Math.max(0, Math.floor((sourceCol - 1) / replicates));
        assignments[sampleIdx] = groupIndex;
        if (groupIndex > maxAssignedGroupIndex) {
          maxAssignedGroupIndex = groupIndex;
        }
      }
    }
    if (maxAssignedGroupIndex < 0) {
      let cursor = 0;
      const groupCountFallback = Math.max(1, fallbackGroupCount);
      for (let groupIdx = 0; groupIdx < groupCountFallback && cursor < sampleCount; groupIdx += 1) {
        const groupsLeft = groupCountFallback - groupIdx - 1;
        const remaining = sampleCount - cursor;
        let span = replicates;
        const minReserve = Math.max(0, groupsLeft);
        if (remaining - span < minReserve) {
          span = Math.max(1, remaining - minReserve);
        }
        span = Math.max(1, Math.min(span, remaining));
        for (let copy = 0; copy < span && cursor < sampleCount; copy += 1) {
          assignments[cursor] = groupIdx;
          cursor += 1;
        }
      }
      for (let idx = 0; idx < sampleCount; idx += 1) {
        if (assignments[idx] >= 0) {
          maxAssignedGroupIndex = Math.max(maxAssignedGroupIndex, assignments[idx]);
        }
      }
    } else {
      for (let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx += 1) {
        if (assignments[sampleIdx] >= 0) {
          continue;
        }
        const fallbackIdx = Math.max(0, Math.floor(sampleIdx / replicates));
        assignments[sampleIdx] = fallbackIdx;
        if (fallbackIdx > maxAssignedGroupIndex) {
          maxAssignedGroupIndex = fallbackIdx;
        }
      }
    }
    const groupCount = Math.max(1, fallbackGroupCount, maxAssignedGroupIndex + 1);
    const names = Array.from({
      length: groupCount
    }, (_, idx) => {
      const anchorCol = 1 + idx * replicates;
      const groupAnchor = groupHeaderRow[anchorCol];
      const groupText = groupAnchor == null ? '' : String(groupAnchor).trim();
      if (groupText) {
        return inferPcaGroupBaseName(groupText, `Group ${idx + 1}`);
      }
      const sampleAnchor = sampleLabels[idx * replicates];
      return inferPcaGroupBaseName(sampleAnchor, `Group ${idx + 1}`);
    });
    const counts = new Array(groupCount).fill(0);
    const styleScopes = ensurePcaPointStyleScopes();
    names.forEach((_, idx) => {
      const key = String(idx);
      styleScopes.groups[key] = {
        fill: DEFAULT_SCATTER_COLORS[idx % DEFAULT_SCATTER_COLORS.length],
        shape: sanitizeGroupShape(null, idx),
        ...(styleScopes.groups[key] || {})
      };
    });
    for (let sampleIdx = 0; sampleIdx < assignments.length; sampleIdx += 1) {
      const groupIndex = assignments[sampleIdx];
      if (Number.isInteger(groupIndex) && groupIndex >= 0 && groupIndex < counts.length) {
        counts[groupIndex] += 1;
      }
    }
    const styleByIndex = [];
    const entries = [];
    names.forEach((name, idx) => {
      if (counts[idx] <= 0) {
        return;
      }
      const scopedStyle = styleScopes.groups[String(idx)] || {};
      const color = scopedStyle.fill || DEFAULT_SCATTER_COLORS[idx % DEFAULT_SCATTER_COLORS.length];
      const shape = sanitizeGroupShape(scopedStyle.shape, idx);
      styleScopes.groups[String(idx)] = {
        ...scopedStyle,
        fill: color,
        shape
      };
      const entry = {
        index: idx,
        key: `group-${idx}`,
        label: name,
        color,
        shape,
        style: styleScopes.groups[String(idx)],
        count: counts[idx]
      };
      entries.push(entry);
      styleByIndex[idx] = entry;
    });
    if (!entries.length) {
      return null;
    }
    const labelToGroup = new Map();
    if (sampleLabels.length) {
      sampleLabels.forEach((lab, sampleIdx) => {
        if (!lab) {
          return;
        }
        const groupIndex = assignments[sampleIdx];
        if (Number.isInteger(groupIndex) && groupIndex >= 0) {
          labelToGroup.set(lab, groupIndex);
        }
      });
    }
    debugLog('Debug: pca resolveGroupMeta', {
      sampleCount,
      groups: entries.length
    });
    return {
      assignments,
      entries,
      styleByIndex,
      labelToGroup,
      columnIndices: columnIndices.slice(),
      labels: sampleLabels.slice()
    };
  }

  function drawShape(addFunction, shape, options) {
    const radius = Math.max(0, Number(options?.radius) || 0);
    const cx = Number(options?.cx) || 0;
    const cy = Number(options?.cy) || 0;
    const fill = options?.fill ?? 'transparent';
    const stroke = options?.stroke ?? 'none';
    const strokeWidth = options?.strokeWidth ?? 0;
    const opacity = options?.opacity ?? 1;
    const normalized = GROUP_SHAPE_VALUES.has(shape) ? shape : 'circle';
    if (normalized === 'square') {
      const size = Math.max(radius * 2, 2);
      const half = size / 2;
      return addFunction('rect', {
        x: cx - half,
        y: cy - half,
        width: size,
        height: size,
        fill,
        stroke,
        'stroke-width': strokeWidth,
        opacity
      });
    }
    if (normalized === 'triangle') {
      const size = Math.max(radius * 2, 2);
      const half = size / 2;
      const path = `M ${cx} ${cy - half} L ${cx + half} ${cy + half} L ${cx - half} ${cy + half} Z`;
      return addFunction('path', {
        d: path,
        fill,
        stroke,
        'stroke-width': strokeWidth,
        opacity
      });
    }
    if (normalized === 'diamond') {
      const size = Math.max(radius * 2, 2);
      const half = size / 2;
      const path = `M ${cx} ${cy - half} L ${cx + half} ${cy} L ${cx} ${cy + half} L ${cx - half} ${cy} Z`;
      return addFunction('path', {
        d: path,
        fill,
        stroke,
        'stroke-width': strokeWidth,
        opacity
      });
    }
    if (normalized === 'cross') {
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
      return addFunction('path', {
        d: path,
        fill,
        stroke,
        'stroke-width': strokeWidth,
        opacity
      });
    }
    if (normalized === 'plus') {
      const size = Math.max(radius * 2, 2);
      const half = size / 2;
      const bar = Math.max(size / 3, 2);
      const hb = bar / 2;
      const path = `M ${cx - hb} ${cy - half} H ${cx + hb} V ${cy - hb} H ${cx + half} V ${cy + hb} H ${cx + hb} V ${cy + half} H ${cx - hb} V ${cy + hb} H ${cx - half} V ${cy - hb} H ${cx - hb} Z`;
      return addFunction('path', {
        d: path,
        fill,
        stroke,
        'stroke-width': strokeWidth,
        opacity
      });
    }
    if (normalized === 'star') {
      const outer = Math.max(radius, 1);
      const inner = Math.max(outer * 0.45, 1);
      const points = [];
      for (let i = 0; i < 5; i += 1) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        points.push({
          x: cx + Math.cos(a) * outer,
          y: cy + Math.sin(a) * outer
        });
        const b = a + Math.PI / 5;
        points.push({
          x: cx + Math.cos(b) * inner,
          y: cy + Math.sin(b) * inner
        });
      }
      const path = points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') + ' Z';
      return addFunction('path', {
        d: path,
        fill,
        stroke,
        'stroke-width': strokeWidth,
        opacity
      });
    }
    return addFunction('circle', {
      cx,
      cy,
      r: radius,
      fill,
      stroke,
      'stroke-width': strokeWidth,
      opacity
    });
  }

  const makeEditableHelper = (node, onChange, options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if (typeof fn === 'function') {
      return fn(node, onChange, options);
    }
    console.warn('pca makeEditable unavailable');
    return undefined;
  };

  const markFontEditable = (node, role, key, options = {}) => {
    if (!node) {
      return;
    }
    const payload = {
      role: role || null,
      key: key || role || null,
      text: node?.textContent || null
    };
    if (fontControls && typeof fontControls.markText === 'function') {
      fontControls.markText(node, {
        scopeId: 'pca',
        role,
        key,
        collection: options.collection
      });
    }
    if (node.dataset) {
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'pca';
      if (role) node.dataset.fontRole = role;
      if (key || role) node.dataset.fontKey = key || role;
      if (options.collection) node.dataset.fontCollection = options.collection;
    }
    if (!role || role.indexOf('Tick') === -1) {
      debugLog('Debug: pca markFontEditable', payload); // Debug: font target tagging summary
    }
  };

  const markPca3dAxisTickLabel = (node, axisKey) => {
    if (!node) {
      return;
    }
    const role = axisKey === 'z' ? 'zTick' : (axisKey === 'y' ? 'yTick' : 'xTick');
    markFontEditable(node, role, role);
  };

  function clampLoadingsLimitValue(value, maxRows = PCA_LOADINGS_ROW_LIMIT) {
    const safeMax = Math.max(1, Math.floor(Number(maxRows) || 1));
    const requested = Math.floor(Number(value) || 0);
    if (!Number.isFinite(requested) || requested <= 0) {
      return Math.min(PCA_LOADINGS_ROW_LIMIT, safeMax);
    }
    return Math.min(Math.max(1, requested), safeMax);
  }

  function syncLoadingsLimitUi(maxRows = PCA_LOADINGS_ROW_LIMIT) {
    const resolved = clampLoadingsLimitValue(pcaState.loadingsLimit, maxRows);
    pcaState.loadingsLimit = resolved;
    if (pcaLoadingsLimitInput) {
      const clampedMax = Math.max(1, Math.floor(Number(maxRows) || 1));
      pcaLoadingsLimitInput.max = String(clampedMax);
      pcaLoadingsLimitInput.value = String(resolved);
      if (pcaLoadingsLimitVal) {
        pcaLoadingsLimitVal.textContent = resolved.toLocaleString();
      }
    }
    return resolved;
  }

  function updateLoadingsTable({
    rows,
    components,
    method,
    viewMode,
    totalCount
  } = {}) {
    if (!pcaLoadingsTable) {
      debugLog('Debug: pca loadings table skipped', {
        reason: 'missing-container'
      });
      return;
    }
    if (pcaLoadingsContainer) {
      pcaLoadingsContainer.hidden = false;
    }
    if (method !== 'pca') {
      lastLoadingsRender = null;
      if (pcaLoadingsContainer) {
        delete pcaLoadingsContainer.dataset.sharedStatsTable;
      }
      resetLoadingsActionsHost();
      pcaLoadingsTable.innerHTML = '<i>Loadings available for PCA only.</i>';
      debugLog('Debug: pca loadings unavailable for method', {
        method
      });
      return;
    }
    const rowsToRender = Array.isArray(rows) ? rows : [];
    lastLoadingsRender = {
      rows: rowsToRender,
      components,
      method,
      viewMode,
      totalCount
    };
    const totalRows = rowsToRender.length;
    const totalAvailable = Number.isFinite(totalCount) ? totalCount : totalRows;
    if (!totalRows || !components) {
      lastLoadingsRender = null;
      if (pcaLoadingsContainer) {
        delete pcaLoadingsContainer.dataset.sharedStatsTable;
      }
      resetLoadingsActionsHost();
      pcaLoadingsTable.innerHTML = '<i>No loadings computed.</i>';
      debugLog('Debug: pca loadings empty', {
        rowCount: totalRows,
        totalAvailable,
        components
      });
      return;
    }
    const maxRows = Math.max(1, Math.min(PCA_LOADINGS_ROW_LIMIT, totalAvailable, rowsToRender.length));
    const rowsLimit = syncLoadingsLimitUi(maxRows);
    const columnLimit = viewMode === '3d' ? 3 : 2;
    const columnsToRender = Math.min(columnLimit, components);
    const headerCells = ['Variable'];
    for (let idx = 0; idx < columnsToRender; idx += 1) {
      headerCells.push(`PC${idx+1}`);
    }
    const rowsToDisplay = rowsToRender.slice(0, rowsLimit);
    const truncated = totalAvailable > rowsToDisplay.length;
    const tableRows = rowsToDisplay.map(row => {
      const entry = {
        variable: row?.label || ''
      };
      for (let idx = 0; idx < columnsToRender; idx += 1) {
        const value = Number(row?.values?.[idx] ?? 0);
        entry[`pc${idx+1}`] = value.toFixed(4);
      }
      return entry;
    });
    const columns = [{
      key: 'variable',
      label: headerCells[0],
      align: 'left'
    }];
    for (let idx = 0; idx < columnsToRender; idx += 1) {
      columns.push({
        key: `pc${idx+1}`,
        label: headerCells[idx + 1],
        align: 'left'
      });
    }
    const rendered = renderPcaSharedStatsTable(pcaLoadingsTable, {
      target: pcaLoadingsTable,
      section: 'supplementary',
      columns,
      rows: tableRows,
      caption: 'Component Loadings',
      footnotes: truncated ?
        [`Showing top ${rowsToDisplay.length.toLocaleString()} of ${totalAvailable.toLocaleString()} loadings by absolute weight.`] :
        [],
      options: {
        fileName: 'pca-component-loadings',
        contextLabel: 'pca-component-loadings'
      }
    });
    if (rendered?.wrapper) {
      if (pcaLoadingsContainer) {
        pcaLoadingsContainer.dataset.sharedStatsTable = '1';
      }
      dockLoadingsActions(rendered.wrapper);
    } else {
      if (pcaLoadingsContainer) {
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
        for (let idx = 0; idx < columnsToRender; idx += 1) {
          const value = Number(row?.values?.[idx] ?? 0);
          parts.push(`<td class="stats-table__cell stats-table__cell--left">${value.toFixed(4)}</td>`);
        }
        parts.push('</tr>');
      });
      parts.push('</tbody></table>');
      if (truncated) {
        parts.push(`<div class="stats-table-footnotes"><div class="stats-table-footnote">Showing top ${rowsToDisplay.length.toLocaleString()} of ${totalAvailable.toLocaleString()} loadings by absolute weight.</div></div>`);
      }
      pcaLoadingsTable.innerHTML = parts.join('');
    }
    debugLog('Debug: pca loadings table rendered', {
      rowCount: rowsToDisplay.length,
      columnsToRender,
      viewMode,
      truncated,
      totalAvailable,
      rowsLimit,
      sliderMax: maxRows
    });
  }

  function setPcaControlVisibility(control, visible) {
    if (!control) {
      return;
    }
    control.hidden = !visible;
    control.style.display = visible ? '' : 'none';
  }

  function syncPcaComponentSelectionUi() {
    const activeRule = sanitizePcaComponentSelectionRule(pcaState.componentSelection?.rule);
    const isPcaMethod = (pcaMethod?.value || 'pca').toLowerCase() === 'pca';
    if (pcaComponentRuleInput) {
      pcaComponentRuleInput.value = activeRule;
      pcaComponentRuleInput.disabled = !isPcaMethod;
    }
    const showThreshold = isPcaMethod && activeRule === 'threshold';
    const showParallelRuns = isPcaMethod && activeRule === 'parallel';
    setPcaControlVisibility(pcaEigenThresholdLabel, showThreshold);
    setPcaControlVisibility(pcaParallelIterationsLabel, showParallelRuns);
    setPcaControlVisibility(pcaIncludeNonRetainedAxesLabel, isPcaMethod);
    if (pcaEigenThresholdInput) {
      const threshold = sanitizePcaEigenThreshold(pcaState.componentSelection?.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD);
      pcaEigenThresholdInput.value = String(threshold);
      pcaEigenThresholdInput.disabled = !showThreshold;
    }
    if (pcaParallelIterationsInput) {
      const iterations = sanitizePcaParallelIterations(pcaState.componentSelection?.parallelIterations, PCA_DEFAULT_PARALLEL_ITERATIONS);
      pcaParallelIterationsInput.value = String(iterations);
      pcaParallelIterationsInput.disabled = !showParallelRuns;
    }
    if (pcaIncludeNonRetainedAxesInput) {
      pcaIncludeNonRetainedAxesInput.checked = sanitizePcaIncludeNonRetainedAxes(pcaState.componentSelection?.includeNonRetainedAxes);
      pcaIncludeNonRetainedAxesInput.disabled = !isPcaMethod;
    }
    setPcaControlVisibility(pcaMethodAdvancedSection, isPcaMethod);
  }

  function ensurePcaComponentSelectionControls() {
    const methodFieldset = queryPcaRoot('#pcaPage .config-panel fieldset[data-graph-selection-fieldset="1"]');
    if (!methodFieldset) {
      return null;
    }
    let section = getPcaNodeById('pcaMethodAdvancedSection');
    if (!section) {
      section = document.createElement('details');
      section.id = 'pcaMethodAdvancedSection';
      section.className = 'pca-method-advanced';
      section.open = false;
      const summary = document.createElement('summary');
      summary.className = 'pca-method-advanced__summary';
      summary.textContent = 'Advanced';
      section.appendChild(summary);
      const body = document.createElement('div');
      body.className = 'pca-method-advanced__body';
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
      const toggleRow = document.createElement('div');
      toggleRow.className = 'control idx-inline-032';
      const includeNonRetainedLabel = document.createElement('label');
      includeNonRetainedLabel.className = 'idx-inline-023';
      const includeNonRetainedInput = document.createElement('input');
      includeNonRetainedInput.type = 'checkbox';
      includeNonRetainedInput.id = 'pcaIncludeNonRetainedAxes';
      includeNonRetainedLabel.appendChild(includeNonRetainedInput);
      includeNonRetainedLabel.appendChild(document.createTextNode(' Include non-retained PCs in axis selectors'));
      toggleRow.appendChild(includeNonRetainedLabel);
      const help = document.createElement('div');
      help.className = 'stats-help-text';
      help.id = 'pcaComponentSelectionHelp';
      help.textContent = 'These settings control component retention and update the summary.';
      body.appendChild(controlRow);
      body.appendChild(toggleRow);
      body.appendChild(help);
      section.appendChild(body);
      methodFieldset.appendChild(section);
      pcaComponentRuleInput = ruleSelect;
      pcaEigenThresholdInput = thresholdInput;
      pcaParallelIterationsInput = iterationsInput;
      pcaIncludeNonRetainedAxesInput = includeNonRetainedInput;
      pcaIncludeNonRetainedAxesLabel = includeNonRetainedLabel;
      pcaEigenThresholdLabel = thresholdLabel;
      pcaParallelIterationsLabel = iterationsLabel;
      attachPcaSelectAutoSize(ruleSelect, 'pca');
      ruleSelect.addEventListener('change', () => {
        pcaState.componentSelection.rule = sanitizePcaComponentSelectionRule(ruleSelect.value);
        syncPcaComponentSelectionUi();
        requestPcaDataRefresh('component-selection-rule');
      });
      const handleThresholdUpdate = () => {
        const nextValue = sanitizePcaEigenThreshold(thresholdInput.value, PCA_DEFAULT_EIGEN_THRESHOLD);
        if (nextValue === pcaState.componentSelection.eigenThreshold) {
          syncPcaComponentSelectionUi();
          return;
        }
        pcaState.componentSelection.eigenThreshold = nextValue;
        syncPcaComponentSelectionUi();
        requestPcaDataRefresh('component-selection-threshold');
      };
      thresholdInput.addEventListener('change', handleThresholdUpdate);
      thresholdInput.addEventListener('input', handleThresholdUpdate);
      const handleParallelUpdate = () => {
        const nextValue = sanitizePcaParallelIterations(iterationsInput.value, PCA_DEFAULT_PARALLEL_ITERATIONS);
        if (nextValue === pcaState.componentSelection.parallelIterations) {
          syncPcaComponentSelectionUi();
          return;
        }
        pcaState.componentSelection.parallelIterations = nextValue;
        syncPcaComponentSelectionUi();
        requestPcaDataRefresh('component-selection-parallel');
      };
      iterationsInput.addEventListener('change', handleParallelUpdate);
      iterationsInput.addEventListener('input', handleParallelUpdate);
      includeNonRetainedInput.addEventListener('change', () => {
        const nextValue = !!includeNonRetainedInput.checked;
        if (nextValue === sanitizePcaIncludeNonRetainedAxes(pcaState.componentSelection?.includeNonRetainedAxes)) {
          syncPcaComponentSelectionUi();
          return;
        }
        pcaState.componentSelection.includeNonRetainedAxes = nextValue;
        syncPcaComponentSelectionUi();
        requestPcaDataRefresh('component-selection-axis-retention', {
          force: true,
          userInitiated: true
        });
      });
    } else {
      pcaComponentRuleInput = getPcaNodeById('pcaComponentRule');
      pcaEigenThresholdInput = getPcaNodeById('pcaEigenThreshold');
      pcaParallelIterationsInput = getPcaNodeById('pcaParallelIterations');
      pcaIncludeNonRetainedAxesInput = getPcaNodeById('pcaIncludeNonRetainedAxes');
      pcaEigenThresholdLabel = pcaEigenThresholdInput?.closest('label') || null;
      pcaParallelIterationsLabel = pcaParallelIterationsInput?.closest('label') || null;
      pcaIncludeNonRetainedAxesLabel = pcaIncludeNonRetainedAxesInput?.closest('label') || null;
    }
    pcaMethodAdvancedSection = section;
    syncPcaComponentSelectionUi();
    return section;
  }

  function preservePcaScrollPosition(run) {
    const docScroll = global.document?.scrollingElement || global.document?.documentElement || global.document?.body || null;
    const docTop = docScroll ? docScroll.scrollTop : null;
    const docLeft = docScroll ? docScroll.scrollLeft : null;
    const panelTop = Number.isFinite(pcaStatsResults?.scrollTop) ? pcaStatsResults.scrollTop : null;
    const panelLeft = Number.isFinite(pcaStatsResults?.scrollLeft) ? pcaStatsResults.scrollLeft : null;
    let result;
    if (typeof run === 'function') {
      result = run();
    }
    const restore = () => {
      if (docScroll && docTop != null) {
        docScroll.scrollTop = docTop;
        if (docLeft != null) {
          docScroll.scrollLeft = docLeft;
        }
      }
      if (pcaStatsResults && panelTop != null) {
        pcaStatsResults.scrollTop = panelTop;
        if (panelLeft != null) {
          pcaStatsResults.scrollLeft = panelLeft;
        }
      }
    };
    restore();
    Shared.componentLifecycle?.scheduleComponentFrame?.(pca, 'pca', {
      tabId: getPcaProjectionTabId() || null,
      reason: 'pca-stats-scroll-restore'
    }, restore);
    return result;
  }

  function syncAxisSelectValues() {
    const entries = [{
      key: 'x',
      element: pcaXAxis
    }, {
      key: 'y',
      element: pcaYAxis
    }, {
      key: 'z',
      element: pcaZAxis
    }];
    entries.forEach(({
      key,
      element
    }) => {
      if (!element) {
        return;
      }
      const desired = String(pcaState.axisSelection[key]);
      const options = Array.from(element.options || []);
      if (options.some(opt => opt.value === desired)) {
        element.value = desired;
      }
    });
  }

  function applyAxisVisibility(viewMode) {
    if (pcaAxis3DControl) {
      const show3d = (viewMode || '').toLowerCase() === '3d' && pcaState.axisMeta.length >= 3;
      pcaAxis3DControl.hidden = !show3d;
      pcaAxis3DControl.style.display = show3d ? '' : 'none';
    }
    if (pcaAxis2DControls) {
      pcaAxis2DControls.style.opacity = pcaState.axisMeta.length >= 2 ? '1' : '0.7';
    }
  }

  function projectPcaViewMode(viewMode, reason = 'view-mode-projection') {
    const mode = String(viewMode || DEFAULT_VIEW_MODE).trim().toLowerCase() === '3d' ? '3d' : '2d';
    if (pcaViewMode) {
      pcaViewMode.value = mode;
    }
    lastPcaViewMode = mode;
    applyAxisVisibility(mode);
    ensurePcaMetricResizePolicy(reason);
    return mode;
  }

  function syncPcaPreprocessingUiState() {
    const preprocessingInput = getPcaNodeById('pcaPreprocessing');
    const mode = sanitizePcaPreprocessingMode(preprocessingInput?.value || pcaState.controls?.preprocessing);
    if (pcaStandardizeVariables) {
      const normalizedLog = mode === PCA_PREPROCESSING_RNASEQ_LOG;
      pcaStandardizeVariables.disabled = normalizedLog;
      if (normalizedLog) {
        pcaStandardizeVariables.checked = false;
      }
      const label = pcaStandardizeVariables.closest?.('label');
      if (label) {
        label.title = normalizedLog ?
          'Standardization is disabled because RNA-seq normalized log PCA uses the transformed values without additional unit-variance scaling.' :
          'Centers each input variable and divides it by its standard deviation before dimensionality reduction. For PCA, this is unit-variance (correlation-based) PCA. It changes the analysis, not graph axis geometry.';
      }
    }
  }

  function applyMethodUiState(methodValue) {
    const methodName = (methodValue || '').toLowerCase();
    const supports3d = methodName === 'pca' || methodName === 'mds';
    if (pcaTsneControls) {
      const showTsne = methodName === 'tsne';
      pcaTsneControls.hidden = !showTsne;
      pcaTsneControls.style.display = showTsne ? '' : 'none';
    }
    if (pcaUmapControls) {
      const showUmap = methodName === 'umap';
      pcaUmapControls.hidden = !showUmap;
      pcaUmapControls.style.display = showUmap ? '' : 'none';
    }
    if (pcaViewMode) {
      const options = Array.from(pcaViewMode.options || []);
      options.forEach(opt => {
        if (opt.value === '3d') {
          opt.disabled = !supports3d;
          opt.hidden = !supports3d;
        }
      });
      if (!supports3d && pcaViewMode.value !== '2d') {
        pcaViewMode.value = '2d';
        lastPcaViewMode = '2d';
        debugLog('Debug: pca view mode coerced to 2d', {
          method: methodName
        });
      }
    }
    const preprocessingControl = getPcaNodeById('pcaPreprocessingControl');
    if (preprocessingControl) {
      const showPreprocessing = methodName === 'pca';
      preprocessingControl.hidden = !showPreprocessing;
      preprocessingControl.style.display = showPreprocessing ? '' : 'none';
    }
    applyAxisVisibility(pcaViewMode?.value || DEFAULT_VIEW_MODE);
    syncPcaComponentSelectionUi();
    syncPcaPreprocessingUiState();
    ensurePcaMetricResizePolicy('method-ui-state');
    debugLog('Debug: pca method UI state', {
      method: methodName,
      supports3d
    });
  }

  function syncPcaRuntimeControlsFromState(controlSnapshot = {}) {
    pcaState.controls = normalizePcaRuntimeControls(controlSnapshot || pcaState.controls || {});
    const controls = pcaState.controls;
    const requestedMethod = String(controls.method || pcaState.lastMethod || pcaMethod?.value || 'pca').trim().toLowerCase() || 'pca';
    const methodOptions = pcaMethod ? Array.from(pcaMethod.options || []) : [];
    const method = methodOptions.some(option => option.value === requestedMethod) ? requestedMethod : 'pca';
    pcaState.lastMethod = method;
    if (pcaMethod) {
      pcaMethod.value = method;
    }
    applyMethodUiState(method);

    const supports3d = method === 'pca' || method === 'mds';
    const requestedView = String(controls.viewMode || pcaViewMode?.value || DEFAULT_VIEW_MODE).trim().toLowerCase();
    const restoredView = supports3d && requestedView === '3d' ? '3d' : '2d';
    if (pcaViewMode) {
      pcaViewMode.value = restoredView;
      lastPcaViewMode = restoredView;
    }
    applyAxisVisibility(restoredView);
    syncAxisSelectValues();

    if (Object.prototype.hasOwnProperty.call(controls, 'showGrid') && pcaShowGrid) {
      pcaShowGrid.checked = !!controls.showGrid;
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'showFrame') && pcaShowFrame) {
      pcaShowFrame.checked = !!controls.showFrame;
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'showLegend') && pcaShowLegendInput) {
      pcaShowLegendInput.checked = controls.showLegend !== false;
    }
    ensurePcaResizerControls();
    if (pcaEqualAxisLengthsInput) {
      pcaEqualAxisLengthsInput.checked = !!controls.equalAxisLengths;
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'standardizeVariables') && pcaStandardizeVariables) {
      pcaStandardizeVariables.checked = !!controls.standardizeVariables;
    }
    const preprocessingInput = getPcaNodeById('pcaPreprocessing');
    if (preprocessingInput) {
      preprocessingInput.value = sanitizePcaPreprocessingMode(controls.preprocessing);
    }
    if (pcaDotSize && Object.prototype.hasOwnProperty.call(controls, 'dotSize') && controls.dotSize != null) {
      pcaDotSize.value = String(controls.dotSize);
    }
    if (pcaFill && Object.prototype.hasOwnProperty.call(controls, 'fill') && controls.fill != null) {
      pcaFill.value = String(controls.fill);
    }
    if (pcaBorder && Object.prototype.hasOwnProperty.call(controls, 'border') && controls.border != null) {
      pcaBorder.value = String(controls.border);
    }
    if (pcaBorderWidth && Object.prototype.hasOwnProperty.call(controls, 'borderWidth') && controls.borderWidth != null) {
      pcaBorderWidth.value = String(controls.borderWidth);
    }
    if (pcaAlpha && Object.prototype.hasOwnProperty.call(controls, 'alpha') && controls.alpha != null) {
      pcaAlpha.value = String(controls.alpha);
      if (pcaAlphaVal) {
        pcaAlphaVal.textContent = pcaAlpha.value;
      }
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'fontSize') && controls.fontSize != null) {
      syncPcaFontSizeControl(pcaFontSize, pcaFontSizeVal, controls.fontSize, {
        manual: true
      });
    }
    if (pcaScreeShowParallelInput) {
      pcaScreeShowParallelInput.checked = sanitizePcaScreeShowParallel(pcaState.screeShowParallel);
    }
    const biplotScoresInput = getPcaNodeById('pcaBiplotShowScores');
    if (biplotScoresInput) {
      biplotScoresInput.checked = sanitizePcaBiplotShowSampleScores(pcaState.biplotShowSampleScores);
    }
    if (controls.tsne && typeof controls.tsne === 'object') {
      if (pcaTsnePerplexity && controls.tsne.perplexity != null) {
        pcaTsnePerplexity.value = String(controls.tsne.perplexity);
      }
      if (pcaTsneLearningRate && controls.tsne.learningRate != null) {
        pcaTsneLearningRate.value = String(controls.tsne.learningRate);
      }
      if (pcaTsneIterations && controls.tsne.iterations != null) {
        pcaTsneIterations.value = String(controls.tsne.iterations);
      }
      if (pcaTsneExaggeration && controls.tsne.exaggeration != null) {
        pcaTsneExaggeration.value = String(controls.tsne.exaggeration);
      }
    }
    if (controls.umap && typeof controls.umap === 'object') {
      if (pcaUmapNeighbors && controls.umap.neighbors != null) {
        pcaUmapNeighbors.value = String(controls.umap.neighbors);
      }
      if (pcaUmapMinDist && controls.umap.minDist != null) {
        pcaUmapMinDist.value = String(controls.umap.minDist);
      }
      if (pcaUmapLearningRate && controls.umap.learningRate != null) {
        pcaUmapLearningRate.value = String(controls.umap.learningRate);
      }
      if (pcaUmapEpochs && controls.umap.epochs != null) {
        pcaUmapEpochs.value = String(controls.umap.epochs);
      }
    }
    syncPcaComponentSelectionUi();
    syncLoadingsLimitUi(PCA_LOADINGS_ROW_LIMIT);
    ensurePcaMetricResizePolicy('runtime-controls');
  }

  function updateAxisSelectOptions(options) {
    const meta = Array.isArray(options?.dimensionMeta) ? options.dimensionMeta : [];
    const dimensionCount = meta.length;
    pcaState.axisMeta = meta;
    sanitizeAxisSelection(dimensionCount);
    const axisEntries = [{
      key: 'x',
      element: pcaXAxis,
      required: 1
    }, {
      key: 'y',
      element: pcaYAxis,
      required: 2
    }, {
      key: 'z',
      element: pcaZAxis,
      required: 3
    }];
    axisEntries.forEach(({
      key,
      element,
      required
    }) => {
      if (!element) {
        return;
      }
      element.innerHTML = '';
      if (dimensionCount < required) {
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
      if (typeof formControls.autoSizeSelect === 'function') {
        formControls.autoSizeSelect(element);
      }
    });
    syncAxisSelectValues();
    applyAxisVisibility(options?.viewMode || (pcaViewMode?.value || DEFAULT_VIEW_MODE));
    debugLog('Debug: pca axis options updated', {
      dimensionCount,
      viewMode: options?.viewMode || null,
      selection: {
        ...pcaState.axisSelection
      }
    }); // Debug: axis option summary
  }

  function rehydratePcaAxisControlsFromAnalysisCache(session = null, reason = 'pca-axis-controls-rehydrate') {
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const cached = normalizePcaAnalysisCachePayload(getPcaAnalysisCache(owner), { clone: false });
    const dimensionMeta = Array.isArray(cached?.dimensionMeta) ? cached.dimensionMeta : [];
    if (!owner || !dimensionMeta.length) {
      return false;
    }
    const owned = getPcaSessionOwnedState(owner);
    owned.state.axisMeta = cloneSimple(dimensionMeta) || [];
    const nextSelection = normalizePcaAxisSelection(
      owned.state.axisSelection || {
        x: Number(cached?.axisIndices?.x) + 1 || 1,
        y: Number(cached?.axisIndices?.y) + 1 || 2,
        z: Number.isFinite(Number(cached?.axisIndices?.z)) ? Number(cached.axisIndices.z) + 1 : 3
      },
      dimensionMeta.length
    );
    owned.state.axisSelection = nextSelection;
    pcaState.axisSelection = { ...nextSelection };
    pcaState.axisMeta = cloneSimple(dimensionMeta) || [];
    updateAxisSelectOptions({
      dimensionMeta,
      viewMode: owned.state.controls?.viewMode || pcaViewMode?.value || DEFAULT_VIEW_MODE
    });
    owned.state.axisSelection = { ...pcaState.axisSelection };
    owned.state.axisMeta = cloneSimple(pcaState.axisMeta) || [];
    persistPcaSessionOwnedState(owner, reason);
    debugLog('Debug: pca axis controls rehydrated from analysis cache', {
      tabId: owner.tabId || null,
      dimensionCount: dimensionMeta.length,
      selection: { ...owned.state.axisSelection },
      reason
    });
    return true;
  }

  function hydratePcaControlsFromCanonicalTab(tabLike, session = null, reason = 'pca-canonical-controls'){
    const tabId = typeof tabLike === 'string' ? tabLike : tabLike?.id;
    const tab = global.Main?.session?.workspaceState?.tabs?.find?.(item => String(item?.id || '') === String(tabId || '')) || null;
    const config = tab?.type === 'pca' ? tab.payload?.config : null;
    if(!config) return pcaState.controls;
    const patch = {};
    [
      'method', 'viewMode', 'showGrid', 'showFrame', 'showLegend',
      'standardizeVariables', 'equalAxisLengths', 'preprocessing', 'dotSize',
      'fill', 'border', 'borderWidth', 'alpha', 'fontSize', 'tsne', 'umap'
    ].forEach(key => {
      if(Object.prototype.hasOwnProperty.call(config, key)) patch[key] = cloneSimple(config[key]);
    });
    const next = normalizePcaRuntimeControls({ ...(pcaState.controls || {}), ...patch });
    pcaState.controls = next;
    const owner = ensurePcaSessionOwnershipShape(session || getPcaSession(tabId, { tabId, reason }, { create: false }));
    if(owner?.state?.state){
      owner.state.state.controls = normalizePcaRuntimeControls({ ...(owner.state.state.controls || {}), ...patch });
      persistPcaSessionOwnedState(owner, reason);
    }
    return next;
  }

  const PCA_3D_ROTATION_MODEL_VERSION = 1;

  function normalizePca3dRotationModel(value) {
    if (!value || typeof value !== 'object' || Number(value.version) !== PCA_3D_ROTATION_MODEL_VERSION) {
      return null;
    }
    const width = Number(value.width);
    const height = Number(value.height);
    const margin = value.margin && typeof value.margin === 'object' ? value.margin : null;
    const axisRanges = value.axisRanges && typeof value.axisRanges === 'object' ? value.axisRanges : null;
    const axisTicks = value.axisTicks && typeof value.axisTicks === 'object' ? value.axisTicks : null;
    if (!(width > 0) || !(height > 0) || !margin || !axisRanges || !axisTicks || !Array.isArray(value.points)) {
      return null;
    }
    const normalizeRange = axisKey => {
      const min = Number(axisRanges[axisKey]?.min);
      const max = Number(axisRanges[axisKey]?.max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return null;
      }
      return { min, max };
    };
    const ranges = {
      x: normalizeRange('x'),
      y: normalizeRange('y'),
      z: normalizeRange('z')
    };
    if (!ranges.x || !ranges.y || !ranges.z) {
      return null;
    }
    const ticks = {};
    const tickLabels = {};
    for (const axisKey of ['x', 'y', 'z']) {
      ticks[axisKey] = Array.isArray(axisTicks[axisKey])
        ? axisTicks[axisKey].map(Number).filter(Number.isFinite)
        : [];
      tickLabels[axisKey] = Array.isArray(value.axisTickLabels?.[axisKey])
        ? value.axisTickLabels[axisKey].map(String)
        : [];
    }
    const points = value.points.map(entry => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const point = entry.point && typeof entry.point === 'object' ? entry.point : null;
      const x = Number(point?.x);
      const y = Number(point?.y);
      const z = Number(point?.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
      }
      const opacity = Number(entry.opacity);
      return {
        point: { x, y, z },
        shape: typeof entry.shape === 'string' && entry.shape ? entry.shape : 'circle',
        radius: Math.max(0.5, Number(entry.radius) || 1),
        fill: entry.fill || '#000000',
        stroke: entry.stroke || 'none',
        strokeWidth: Math.max(0, Number(entry.strokeWidth) || 0),
        opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
        label: entry.label != null ? String(entry.label) : '',
        sourceIndex: Number.isInteger(Number(entry.sourceIndex)) ? Number(entry.sourceIndex) : null,
        tooltip: entry.tooltip && typeof entry.tooltip === 'object'
          ? cloneSimple(entry.tooltip)
          : null
      };
    }).filter(Boolean);
    if (!points.length) {
      return null;
    }
    const normalizeOpacity = (raw, fallback) => {
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : fallback;
    };
    return {
      version: PCA_3D_ROTATION_MODEL_VERSION,
      width,
      height,
      margin: {
        top: Number(margin.top) || 0,
        right: Number(margin.right) || 0,
        bottom: Number(margin.bottom) || 0,
        left: Number(margin.left) || 0
      },
      legendShiftX: Number(value.legendShiftX) || 0,
      axisRanges: ranges,
      axisTicks: ticks,
      axisTickLabels: tickLabels,
      axisLabels: {
        x: value.axisLabels?.x != null ? String(value.axisLabels.x) : 'PC1',
        y: value.axisLabels?.y != null ? String(value.axisLabels.y) : 'PC2',
        z: value.axisLabels?.z != null ? String(value.axisLabels.z) : 'PC3'
      },
      fontSize: Math.max(1, Number(value.fontSize) || 12),
      tickFontSize: Math.max(1, Number(value.tickFontSize) || Number(value.fontSize) || 12),
      axisStrokeWidth: Math.max(0, Number(value.axisStrokeWidth) || 0),
      axisColor: value.axisColor || '#000000',
      textColor: value.textColor || '#000000',
      showGrid: value.showGrid === true,
      showFrame: value.showFrame !== false,
      paneFill: value.paneFill || 'rgba(0,0,0,0.03)',
      paneOpacityRange: {
        min: normalizeOpacity(value.paneOpacityRange?.min, 0.01),
        max: normalizeOpacity(value.paneOpacityRange?.max, 0.05)
      },
      grid: {
        color: value.grid?.color || '#dddddd',
        dash: value.grid?.dash || null,
        opacity: normalizeOpacity(value.grid?.opacity, 1),
        strokeWidth: Math.max(0, Number(value.grid?.strokeWidth) || 0)
      },
      points
    };
  }

  function createPca3dTickFormatters(model) {
    const formatters = {};
    for (const axisKey of ['x', 'y', 'z']) {
      const ticks = model.axisTicks[axisKey] || [];
      const labels = model.axisTickLabels[axisKey] || [];
      formatters[axisKey] = value => {
        const numeric = Number(value);
        let nearestIndex = -1;
        let nearestDistance = Infinity;
        ticks.forEach((tick, index) => {
          const distance = Math.abs(tick - numeric);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });
        if (nearestIndex >= 0 && labels[nearestIndex] != null) {
          return labels[nearestIndex];
        }
        return typeof chartStyle.formatAxisValue === 'function'
          ? chartStyle.formatAxisValue(numeric, { maxDecimals: 2 })
          : (Number.isFinite(numeric) ? String(numeric) : '');
      };
    }
    return formatters;
  }

  function clearPca3dRotationRenderer(session = null, options = {}) {
    const target = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (!target) {
      return false;
    }
    target.refs.rotationRenderer = null;
    if (options.clearModel === true && target.cache) {
      delete target.cache.pca3dRotationModel;
    }
    return true;
  }

  function bindPca3dRotationRenderer(session = null, svg = null, modelOverride = null) {
    const target = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const model = normalizePca3dRotationModel(modelOverride || target?.cache?.pca3dRotationModel || null);
    if (!target || !svg || svg.dataset?.viewMode !== '3d' || !model) {
      if (target) {
        target.refs.rotationRenderer = null;
      }
      return false;
    }
    target.cache.pca3dRotationModel = cloneSimple(model) || model;
    target.refs.svg = svg;

    let dynamicGroup = svg.querySelector('[data-layer="pca-3d-rotation-dynamic"]');
    const staticSelector = '[data-layer="pca-3d-title"], [data-layer="pca-3d-legend"]';
    const staticInsertBefore = svg.querySelector(staticSelector);
    if (!dynamicGroup) {
      dynamicGroup = document.createElementNS(NS, 'g');
      dynamicGroup.setAttribute('data-layer', 'pca-3d-rotation-dynamic');
      const movableChildren = Array.from(svg.children).filter(node => (
        !node.matches?.(staticSelector)
        && node.getAttribute?.('data-plot3d-rotation-hit-surface') !== '1'
      ));
      svg.insertBefore(dynamicGroup, staticInsertBefore || null);
      movableChildren.forEach(node => dynamicGroup.appendChild(node));
    }

    const allCorners = [
      { x: model.axisRanges.x.min, y: model.axisRanges.y.min, z: model.axisRanges.z.min },
      { x: model.axisRanges.x.max, y: model.axisRanges.y.min, z: model.axisRanges.z.min },
      { x: model.axisRanges.x.min, y: model.axisRanges.y.max, z: model.axisRanges.z.min },
      { x: model.axisRanges.x.max, y: model.axisRanges.y.max, z: model.axisRanges.z.min },
      { x: model.axisRanges.x.min, y: model.axisRanges.y.min, z: model.axisRanges.z.max },
      { x: model.axisRanges.x.max, y: model.axisRanges.y.min, z: model.axisRanges.z.max },
      { x: model.axisRanges.x.min, y: model.axisRanges.y.max, z: model.axisRanges.z.max },
      { x: model.axisRanges.x.max, y: model.axisRanges.y.max, z: model.axisRanges.z.max }
    ];
    const axisTickFormatters = createPca3dTickFormatters(model);
    const render = rotation => {
      if (!dynamicGroup.isConnected
        || svg.dataset.viewMode !== '3d'
        || target.refs?.svg !== svg
        || (typeof plot3d.isRotationOwnerActive === 'function'
          && !plot3d.isRotationOwnerActive(target, 'pca', svg))) {
        return false;
      }
      dynamicGroup.replaceChildren();
      const rotate = point => plot3d.rotatePoint(point, rotation);
      const rotatedCorners = allCorners.map(rotate);
      const rotatedPoints = model.points.map(entry => rotate(entry.point));
      const projector = plot3d.createProjector({
        rotatedPoints,
        rotatedCorners,
        width: model.width,
        height: model.height,
        margin: model.margin,
        shiftX: model.legendShiftX
      });
      const project = point => projector.project(point);
      const add = (tag, attrs, text, parent) => {
        const node = document.createElementNS(NS, tag);
        Object.keys(attrs || {}).forEach(key => node.setAttribute(key, String(attrs[key])));
        if (text) {
          node.textContent = text;
        }
        (parent || dynamicGroup).appendChild(node);
        return node;
      };
      const frontFrame = add('g', { 'data-layer': 'frame-front' });
      plot3d.renderAxesAndGrid({
        svg,
        project,
        rotatePoint: rotate,
        axisRanges: model.axisRanges,
        axisTicks: model.axisTicks,
        axisLabels: model.axisLabels,
        fontSize: model.fontSize,
        tickFontSize: model.tickFontSize,
        axisStrokeWidth: model.axisStrokeWidth,
        chartStyle,
        showGrid: model.showGrid,
        showFrame: model.showFrame,
        axisTickFormatters,
        showPanes: model.showFrame,
        paneFill: model.paneFill,
        paneOpacityRange: model.paneOpacityRange,
        gridColor: model.grid.color,
        gridDash: model.grid.dash || undefined,
        gridOpacity: model.grid.opacity,
        gridStrokeWidth: model.grid.strokeWidth,
        gridOutlineColors: {
          primary: model.grid.color,
          secondary: model.grid.color
        },
        frameColor: model.axisColor,
        axisColor: model.axisColor,
        tickTextColor: model.textColor,
        axisLabelColor: model.textColor,
        paneTarget: dynamicGroup,
        gridTarget: dynamicGroup,
        axisTarget: dynamicGroup,
        frontFrameTarget: frontFrame,
        debugLabel: 'pca-3d-rotation',
        onAxisTickLabel: markPca3dAxisTickLabel,
        onAxisLabel: (node, _axisKey, labelText) => {
          markFontEditable(node, 'axis3d', labelText);
        },
        createElement: add
      });
      const projectedPoints = rotatedPoints.map((rotated, index) => ({
        ...project(rotated),
        descriptor: model.points[index]
      })).sort((a, b) => a.depth - b.depth);
      const pointBounds = [];
      const manualLabelEntries = [];
      const method = target.state?.state?.lastMethod || pcaState.lastMethod || 'pca';
      const pointLabelPositions = getPcaLabelPositionsState(target).pointLabels || {};
      projectedPoints.forEach(projected => {
        const descriptor = projected.descriptor;
        const layoutPointId = pointBounds.length;
        pointBounds.push({
          cx: projected.x,
          cy: projected.y,
          r: descriptor.radius,
          pointId: layoutPointId
        });
        const marker = drawShape(add, descriptor.shape, {
          cx: projected.x,
          cy: projected.y,
          radius: descriptor.radius,
          fill: descriptor.fill,
          stroke: descriptor.stroke,
          strokeWidth: descriptor.strokeWidth,
          opacity: descriptor.opacity
        });
        if (marker) {
          marker.setAttribute('data-plot-point', '1');
          if (Number.isInteger(descriptor.sourceIndex)) {
            marker.dataset.pcaRotationPointIndex = String(descriptor.sourceIndex);
          }
          attachPcaPointTooltip(marker, descriptor.tooltip || {});
        }
        if (descriptor.label) {
          const labelKey = createPcaPointLabelKey({
            ...(descriptor.tooltip || {}),
            label: descriptor.label,
            sourceIndex: descriptor.sourceIndex
          }, method, '3d', layoutPointId);
          manualLabelEntries.push({
            text: descriptor.label,
            cx: projected.x,
            cy: projected.y,
            radius: descriptor.radius,
            pointId: layoutPointId,
            labelKey,
            pinnedPosition: pointLabelPositions[labelKey] || null
          });
        }
      });
      if(manualLabelEntries.length && Shared.labelLayout?.computePointLabelLayout){
        const baseLabelFontSize = Shared.labelLayout.resolvePointLabelBaseFontSize?.() ||
          (chartStyle.ptToPx?.(10) || 13.3333333333);
        const labelFontSize = Shared.labelLayout.computePointLabelFontSize(
          baseLabelFontSize,
          manualLabelEntries.length,
          Math.max(1, model.width - model.margin.left - model.margin.right),
          Math.max(1, model.height - model.margin.top - model.margin.bottom),
          { maxFontSize: Math.min(baseLabelFontSize, Math.max(9, model.tickFontSize)) }
        );
        const leaderGap = Math.max(2, Math.round(labelFontSize * 0.2));
        const labelHull = Shared.labelLayout.computeConvexHull2d(rotatedCorners.map(project));
        const font = typeof chartStyle.makeFont === 'function' ? chartStyle.makeFont(labelFontSize) : null;
        const pointLabelFontStyles = exportFontStyles('pca', { tabId: target?.tabId || null });
        const placements = Shared.labelLayout.computePointLabelLayout(manualLabelEntries, {
          plotLeft: model.margin.left,
          plotRight: model.width - model.margin.right,
          plotTop: model.margin.top,
          plotBottom: model.height - model.margin.bottom,
          containerLeft: 0,
          containerRight: model.width,
          containerTop: 0,
          containerBottom: model.height,
          plotHull: labelHull,
          enforceHull: true,
          hullPenalty: 18,
          labelFontSize,
          leaderGap,
          pointBounds,
          measureText: chartStyle.measureText,
          font,
          fontStyles: pointLabelFontStyles,
          angleSteps: 16,
          maxLeaderScale: 3
        });
        placements.forEach(result => {
          const placement = result.placement;
          const entry = result.entry;
          if(!placement || !entry?.text){ return; }
          const start = placement.leaderPoints[0];
          const end = placement.leaderPoints[1];
          const leader = add('line', {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            stroke: model.textColor,
            'stroke-width': 0.75,
            'stroke-linecap': 'round',
            'data-label-leader': '1'
          });
          const textNode = add('text', {
            x: placement.textX,
            y: placement.textY,
            'font-size': placement.fontSize || labelFontSize,
            'dominant-baseline': 'middle',
            'text-anchor': placement.anchor,
            fill: model.textColor
          }, entry.text);
          markFontEditable(textNode, 'pointLabel', `pointLabel:${entry.labelKey}`, { collection: 'labels' });
          bindPcaPointLabelDrag({
            textNode,
            leaderNode: leader,
            svg,
            entry,
            placement,
            session: target,
            leaderGap: placement.leaderGap || leaderGap,
            containerLeft: 0,
            containerRight: model.width,
            containerTop: 0,
            containerBottom: model.height
          });
        });
      }
      dynamicGroup.appendChild(frontFrame);
      return true;
    };

    target.refs.rotationRenderer = render;
    return render(target.state?.state?.rotation || pcaState.rotation);
  }

  function scheduleRotationRedraw(rotation = null, session = null, svg = null) {
    const target = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const ownerSvg = svg || target?.refs?.svg || null;
    if (!target || (typeof plot3d.isRotationOwnerActive === 'function'
      && !plot3d.isRotationOwnerActive(target, 'pca', ownerSvg))) {
      return false;
    }
    const nextRotation = commitPcaRotationState(rotation, target, 'pca-rotation-change');
    const drawRuntime = getPcaDrawRuntime(target, {
      seedFromActive: true
    });
    if (drawRuntime.rotationPending) {
      if (!drawRuntime.rotationPendingLogged) {
        debugLog('Debug: pca rotation redraw skipped', {
          reason: 'pending',
          tabId: target?.tabId || null
        });
        updatePcaDrawRuntime(target, runtime => {
          runtime.rotationPendingLogged = true;
          runtime.rotationQueued = true;
        });
      }
      return true;
    }
    updatePcaDrawRuntime(target, runtime => {
      runtime.rotationPending = true;
      runtime.rotationPendingLogged = false;
      runtime.rotationQueued = false;
    });
    commitPcaRotationState(nextRotation, target, 'pca-rotation-pending');
    debugLog('Debug: pca rotation redraw scheduled', {
      tabId: target?.tabId || null
    });
    const clearPendingRotationFrame = () => {
      updatePcaDrawRuntime(target, nextRuntime => {
        nextRuntime.rotationPending = false;
        nextRuntime.rotationPendingLogged = false;
        nextRuntime.rotationQueued = false;
        if (!nextRuntime.rotationActive) {
          nextRuntime.rotationViewport = null;
        }
      });
    };
    const frameId = schedulePcaScopedFrame({
      tabId: target?.tabId || null,
      reason: 'pca-rotation-frame'
    }, () => {
      const renderer = target?.refs?.rotationRenderer;
      const ownerSvg = target?.refs?.svg || null;
      clearPendingRotationFrame();
      if (typeof plot3d.isRotationOwnerActive === 'function'
        && !plot3d.isRotationOwnerActive(target, 'pca', ownerSvg)) {
        return;
      }
      const ownerRotation = target?.state?.state?.rotation || nextRotation;
      if (typeof renderer === 'function' && renderer(ownerRotation) === true) {
        return;
      }
      requestPcaViewRefresh('rotation', {
        tabId: target?.tabId || null,
        force: true,
        userInitiated: true,
        silentOverlay: true,
        rotationOnly: true
      });
    }, clearPendingRotationFrame);
    if (frameId == null) {
      clearPendingRotationFrame();
      return false;
    }
    return true;
  }

  function capturePcaRotationViewport(svg) {
    if (!svg) {
      return null;
    }
    const viewBox = svg.viewBox?.baseVal;
    if (viewBox && Number.isFinite(viewBox.width) && viewBox.width > 0 && Number.isFinite(viewBox.height) && viewBox.height > 0) {
      return {
        x: Number(viewBox.x) || 0,
        y: Number(viewBox.y) || 0,
        width: viewBox.width,
        height: viewBox.height
      };
    }
    const raw = String(svg.getAttribute?.('viewBox') || '').trim().split(/\s+/).map(Number);
    if (raw.length !== 4 || !raw.every(Number.isFinite) || raw[2] <= 0 || raw[3] <= 0) {
      return null;
    }
    return {
      x: raw[0],
      y: raw[1],
      width: raw[2],
      height: raw[3]
    };
  }

  function applyPcaRotationViewport(svg, viewport) {
    if (!svg || !viewport) {
      return false;
    }
    svg.setAttribute('viewBox', `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return true;
  }

  function bindPca3dRotationControls(svg, debugLabel, ownerSession = null) {
    if (!svg || !svg.dataset || svg.dataset.viewMode !== '3d') {
      return false;
    }
    const rotationSession = ensurePcaSessionOwnershipShape(ownerSession || getActivePcaSessionForState());
    if (!rotationSession) {
      return false;
    }
    rotationSession.refs.svg = svg;
    const rotationState = commitPcaRotationState(rotationSession?.state?.state?.rotation || null, rotationSession, 'pca-rotation-bind');
    if (typeof plot3d.ensureRotationHitSurface === 'function') {
      plot3d.ensureRotationHitSurface(svg, {
        debugLabel: debugLabel || 'pca-3d'
      });
    }
    plot3d.attachRotationControls(svg, {
      state: rotationState,
      managesGraphEditGesture: true,
      ownerSession: rotationSession,
      componentKey: 'pca',
      onStart: (_event, state) => {
        updatePcaDrawRuntime(rotationSession, runtime => {
          runtime.rotationActive = true;
          runtime.rotationViewport = capturePcaRotationViewport(svg);
        });
        commitPcaRotationState(state, rotationSession, 'pca-rotation-start');
      },
      onChange: (_event, state) => scheduleRotationRedraw(state, rotationSession, svg),
      onEnd: (_event, state, gesture) => {
        commitPcaRotationState(state, rotationSession, 'pca-rotation-end');
        if (gesture?.didMove && gesture?.canceled !== true) {
          persistPcaSessionOwnedState(rotationSession, 'pca-rotation-end');
          markPcaPayloadDirtyForSession(rotationSession, 'pca-rotation-change');
        }
        updatePcaDrawRuntime(rotationSession, runtime => {
          runtime.rotationActive = false;
          if (!runtime.rotationPending) {
            runtime.rotationViewport = null;
          }
        });
      },
      shouldIgnorePointer: (event) => {
        if (typeof plot3d.isInteractivePointerTarget === 'function') {
          return plot3d.isInteractivePointerTarget(event?.target);
        }
        return plot3d.isLegendPointerTarget(event?.target);
      },
      debugLabel: debugLabel || 'pca-3d'
    });
    debugLog('Debug: pca 3d rotation handlers bound', {
      label: debugLabel || 'pca-3d'
    });
    return true;
  }

  function rehydrateActivePca3dInteraction(ownerSession = null, debugLabel = 'pca-3d-rehydrate') {
    const session = ensurePcaSessionOwnershipShape(ownerSession || getActivePcaSessionForState());
    const root = session?.refs?.root || session?.root || resolvePcaRoot(session?.tabId || null) || null;
    const referencedSvg = session?.refs?.svg || null;
    const svg = referencedSvg && root?.contains?.(referencedSvg)
      ? referencedSvg
      : root?.querySelector?.('#pcaSvg');
    if (!session || !svg || svg.dataset?.viewMode !== '3d') {
      return false;
    }
    session.refs.svg = svg;
    const rendererBound = bindPca3dRotationRenderer(session, svg, session?.cache?.pca3dRotationModel || null);
    const controlsBound = rendererBound ? bindPca3dRotationControls(svg, debugLabel, session) : false;
    return rendererBound && controlsBound;
  }

  function updateEigenExportVisibility(shouldShow) {
    if (!pcaExportEigenTableBtn) {
      return;
    }
    const visible = !!shouldShow;
    pcaExportEigenTableBtn.style.display = visible ? '' : 'none';
    if (!visible) {
      pcaExportEigenTableBtn.disabled = true;
    }
  }

  function dockEigenExportButton(host) {
    if (!pcaExportEigenTableBtn || !host || typeof host.appendChild !== 'function') {
      return false;
    }
    host.appendChild(pcaExportEigenTableBtn);
    return true;
  }

  function resetEigenExportButtonHost() {
    if (pcaDefaultEigenExportHost) {
      dockEigenExportButton(pcaDefaultEigenExportHost);
    }
  }

  function ensurePcaReportHost(session = null) {
    const context = resolvePcaStatsPanelContext({ session });
    const target = context.resultsTarget;
    if (!target) {
      return null;
    }
    const reporting = Shared.statsReporting;
    if (reporting && typeof reporting.ensureReportHost === 'function') {
      return reporting.ensureReportHost(target, {
        id: 'pcaStatsReportHost',
        className: 'stats-report-host',
        attachToTarget: true,
        position: 'last',
        migrateReportPanels: true
      });
    }
    let host = target.querySelector?.(':scope > #pcaStatsReportHost') || null;
    if (!host) {
      host = document.createElement('div');
      host.id = 'pcaStatsReportHost';
      host.className = 'stats-report-host';
      target.appendChild(host);
    }
    target.__statsReportHost = host;
    return host;
  }

  function renderPcaSharedStatsTable(target, config) {
    if (!target || !Shared.statsTable || typeof Shared.statsTable.render !== 'function') {
      return null;
    }
    return Shared.statsTable.render(config);
  }

  function insertBeforeIfOwned(parent, node, referenceNode) {
    if (!parent || !node || typeof parent.insertBefore !== 'function') {
      return false;
    }
    const safeReference = referenceNode && referenceNode.parentNode === parent ? referenceNode : null;
    try {
      parent.insertBefore(node, safeReference);
      return true;
    } catch (err) {
      try {
        parent.appendChild(node);
        console.debug('Debug: pca insertBefore fallback appendChild', {
          message: err?.message || String(err)
        });
        return true;
      } catch (appendErr) {
        console.error('pca insertBefore fallback failed', {
          err: appendErr
        });
        return false;
      }
    }
  }

  function dockLoadingsActions(wrapper) {
    if (!pcaLoadingsActions || !wrapper) {
      return false;
    }
    const referenceNode = wrapper.querySelector?.('.stats-table') || wrapper.firstChild || null;
    return insertBeforeIfOwned(wrapper, pcaLoadingsActions, referenceNode);
  }

  function resetLoadingsActionsHost() {
    if (pcaDefaultLoadingsActionsHost && pcaLoadingsActions) {
      insertBeforeIfOwned(pcaDefaultLoadingsActionsHost, pcaLoadingsActions, pcaLoadingsTable || null);
    }
  }

  function renderPcaSummaryPanel(options = {}) {
    pcaStatsSummary?.setAttribute?.('data-stats-section', 'summary');
    pcaScreeVarianceRow?.setAttribute?.('data-stats-section', 'summary');
    pcaVarianceSummary?.setAttribute?.('data-stats-section', 'summary');
    pcaEigenTableContainer?.setAttribute?.('data-stats-section', 'summary');
    pcaLoadingsContainer?.setAttribute?.('data-stats-section', 'supplementary');
    const summaryLines = Array.isArray(options.summaryLines) ? options.summaryLines : [];
    const method = String(options.method || '').toLowerCase();
    const savedSummaryModel = options.savedSummaryModel && typeof options.savedSummaryModel === 'object' ?
      options.savedSummaryModel :
      null;
    const savedReportModel = options.savedReportModel && typeof options.savedReportModel === 'object' ?
      options.savedReportModel :
      null;
    const reportHost = ensurePcaReportHost();
    if (reportHost) {
      reportHost.innerHTML = '';
    }
    if (pcaStatsSummary) {
      if (savedSummaryModel && Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function') {
        Shared.statsReporting.restorePanelModel(pcaStatsSummary, {
          resultsModel: savedSummaryModel,
          reportModel: null
        });
        debugLog('Debug: pca summary panel restored from saved model', {
          hasChildren: Array.isArray(savedSummaryModel.children) && savedSummaryModel.children.length > 0
        });
      } else if (summaryLines.length) {
        pcaStatsSummary.innerHTML = summaryLines.map(line => `<div class="stats-table-lead">${line}</div>`).join('');
      } else if (method === 'pca') {
        pcaStatsSummary.innerHTML = '<div class="stats-table-message">Component variance summary appears alongside the scree plot.</div>';
      } else {
        pcaStatsSummary.innerHTML = '<div class="stats-table-message">No statistics computed.</div>';
      }
    } else if (!reportHost) {
      return;
    }
    if (reportHost && savedReportModel && Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function') {
      Shared.statsReporting.restorePanelModel(pcaStatsResults || reportHost, {
        resultsModel: null,
        reportModel: savedReportModel
      }, {
        ensureReportHost: () => reportHost,
        clearMainWhenMissing: false
      });
    }
    const activeStatsSnapshot = getPcaStatsSnapshot(getActivePcaSessionForState());
    if (reportHost && !savedReportModel && Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function' && (summaryLines.length || activeStatsSnapshot)) {
      const statsSnapshot = activeStatsSnapshot || {};
      const reportMethod = String(method || statsSnapshot.method || 'pca').toLowerCase();
      const reportMethodLabel = reportMethod === 'mds' ? 'MDS' : reportMethod === 'tsne' ? 't-SNE' : reportMethod === 'umap' ? 'UMAP' : 'PCA';
      const reportMethods = [
        `${reportMethodLabel} summary statistics were generated from the current numeric ordination input after applying the active table-format and transformation settings.`,
        reportMethod === 'pca' ?
        sanitizePcaPreprocessingMode(pcaState.controls?.preprocessing) === PCA_PREPROCESSING_RNASEQ_LOG ?
        'PCA used DESeq2 median-ratio size factors, log2(normalized count + 1), up to the 500 most variable genes, gene centering, and no unit-variance scaling.' :
        'PCA used centered numeric variables with optional unit-variance scaling and reports eigenvalue, variance, cumulative-variance, component-selection, and optional biplot-loading summaries.' :
        reportMethod === 'mds' ?
        'MDS reports inertia/eigen summaries for the reusable cached coordinate solution and stress where available.' :
        reportMethod === 'tsne' ?
        't-SNE reports embedding settings and stress/KL-type optimization summaries where available; axes are embedding coordinates rather than variance-explained components.' :
        reportMethod === 'umap' ?
        'UMAP reports neighborhood embedding settings where available; axes are embedding coordinates rather than variance-explained components.' :
        'Dimension-reduction summaries reflect the selected ordination method.',
        'Rows or columns that could not be parsed as finite numeric observations were excluded by the component preprocessing pipeline before ordination.'
      ].filter(Boolean).join(' ');
      Shared.statsReporting.appendReportPanel(reportHost, {
        methodsText: reportMethods,
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
      }, {
        title: 'Reporting and reproducibility'
      });
    }
    ensurePcaReportHost();
  }

  function getPcaRootNodesById(id) {
    const root = resolvePcaRoot(getPcaProjectionTabId() || null);
    if (!root || !id || typeof root.querySelectorAll !== 'function') {
      return [];
    }
    const escapedId = global.CSS && typeof global.CSS.escape === 'function' ?
      global.CSS.escape(String(id)) :
      String(id).replace(/[^A-Za-z0-9_-]/g, '\\$&');
    return Array.from(root.querySelectorAll(`#${escapedId}`));
  }

  function removePcaDuplicateRootNodes(id, preferred, reason) {
    const nodes = getPcaRootNodesById(id);
    let removed = 0;
    nodes.forEach(node => {
      if (node && node !== preferred && node.parentNode) {
        node.parentNode.removeChild(node);
        removed += 1;
      }
    });
    if (removed) {
      debugLog('Debug: pca duplicate dynamic node removed', {
        id,
        removed,
        tabId: getPcaProjectionTabId() || null,
        reason: reason || 'pca-dynamic-node-reconcile'
      });
    }
    return removed;
  }

  function markPcaDynamicStatsNode(node, panelKey) {
    if (!node) {
      return node;
    }
    node.dataset.component = 'pca';
    node.dataset.tabId = getPcaProjectionTabId() || '';
    node.dataset.panelKey = panelKey || '';
    const session = getActivePcaSessionForState();
    if (session?.refs) {
      session.refs.dynamicPanels = session.refs.dynamicPanels && typeof session.refs.dynamicPanels === 'object' ? session.refs.dynamicPanels : {};
      if (panelKey) {
        session.refs.dynamicPanels[panelKey] = node;
      }
      session.updatedAt = Date.now();
    }
    return node;
  }

  function ensurePcaDynamicStatsCard(cardId, title, anchor) {
    const host = pcaStatsResults || pcaStatsSummary?.parentElement;
    if (!host) {
      return {
        card: null,
        body: null
      };
    }
    const reportHost = host === pcaStatsResults ? ensurePcaReportHost() : null;
    const rootCards = getPcaRootNodesById(cardId);
    let card = rootCards.find(node => node?.closest?.('#pcaStatsResults') === host) ||
      rootCards.find(node => node?.parentNode === host) ||
      rootCards[0] ||
      null;
    if (card) {
      removePcaDuplicateRootNodes(cardId, card, 'ensure-dynamic-stats-card');
    } else {
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
    }
    markPcaDynamicStatsNode(card, cardId);
    const anchorNode = anchor || pcaLoadingsContainer || null;
    if (card.parentNode !== host && card.parentNode !== pcaScreeVarianceRow) {
      if (anchorNode && anchorNode.parentNode === host) {
        anchorNode.insertAdjacentElement('afterend', card);
      } else if (reportHost && reportHost.parentNode === host) {
        host.insertBefore(card, reportHost);
      } else {
        host.appendChild(card);
      }
    }
    let body = Array.from(card.querySelectorAll?.(`[id="${cardId}Body"]`) || [])[0] || null;
    if (!body) {
      body = document.createElement('div');
      body.className = 'loadings-card__table';
      body.id = `${cardId}Body`;
      card.appendChild(body);
    }
    markPcaDynamicStatsNode(body, `${cardId}Body`);
    Array.from(card.querySelectorAll?.(`[id="${cardId}Body"]`) || []).forEach(node => {
      if (node !== body && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
    removePcaDuplicateRootNodes(`${cardId}Body`, body, 'ensure-dynamic-stats-card-body');
    return {
      card,
      body
    };
  }



  function createPcaMiniScatterSvg(config = {}) {
    const width = 360;
    const height = 280;
    const margin = {
      top: 18,
      right: 18,
      bottom: 42,
      left: 52
    };
    const availablePlotWidth = width - margin.left - margin.right;
    const availablePlotHeight = height - margin.top - margin.bottom;
    const metricPlotSize = Math.min(availablePlotWidth, availablePlotHeight);
    const plotWidth = metricPlotSize;
    const plotHeight = metricPlotSize;
    const plotLeft = margin.left + (availablePlotWidth - metricPlotSize) / 2;
    const plotTop = margin.top + (availablePlotHeight - metricPlotSize) / 2;
    const svg = document.createElementNS(NS, 'svg');
    if (config.svgId) {
      svg.setAttribute('id', String(config.svgId));
    }
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(height));
    chartStyle.applySvgDefaults(svg);
    const pointList = Array.isArray(config.points) ? config.points : [];
    const scalePointList = Array.isArray(config.scalePoints) ? config.scalePoints : pointList;
    const vectorList = Array.isArray(config.vectors) ? config.vectors : [];
    const allX = [];
    const allY = [];
    scalePointList.forEach(point => {
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
    const xScale = value => plotLeft + ((Number(value) || 0) + bound) * (plotWidth / (bound * 2 || 1));
    const yScale = value => plotTop + plotHeight - (((Number(value) || 0) + bound) * (plotHeight / (bound * 2 || 1)));
    const axisColor = chartStyle.TEXT_COLOR || '#333333';
    const zeroX = xScale(0);
    const zeroY = yScale(0);
    const xAxis = document.createElementNS(NS, 'line');
    xAxis.setAttribute('x1', String(plotLeft));
    xAxis.setAttribute('x2', String(plotLeft + plotWidth));
    xAxis.setAttribute('y1', String(zeroY));
    xAxis.setAttribute('y2', String(zeroY));
    xAxis.setAttribute('stroke', axisColor);
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);
    const yAxis = document.createElementNS(NS, 'line');
    yAxis.setAttribute('x1', String(zeroX));
    yAxis.setAttribute('x2', String(zeroX));
    yAxis.setAttribute('y1', String(plotTop));
    yAxis.setAttribute('y2', String(plotTop + plotHeight));
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
      if (idx < 10 && point?.label) {
        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', String(xScale(point.x) + 4));
        label.setAttribute('y', String(yScale(point.y) - 4));
        label.setAttribute('font-size', '12');
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
      if (vector?.label) {
        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', String(endX + 4));
        label.setAttribute('y', String(endY - 4));
        label.setAttribute('font-size', '12');
        label.setAttribute('fill', config.vectorColor || '#c7301f');
        label.textContent = String(vector.label);
        svg.appendChild(label);
      }
    });
    const xLabel = document.createElementNS(NS, 'text');
    xLabel.setAttribute('x', String(plotLeft + plotWidth / 2));
    xLabel.setAttribute('y', String(height - 10));
    xLabel.setAttribute('text-anchor', 'middle');
    xLabel.setAttribute('font-size', '12');
    xLabel.setAttribute('fill', axisColor);
    xLabel.textContent = config.xLabel || 'PC1';
    svg.appendChild(xLabel);
    const yLabel = document.createElementNS(NS, 'text');
    yLabel.setAttribute('x', '16');
    yLabel.setAttribute('y', String(margin.top + plotHeight / 2));
    yLabel.setAttribute('text-anchor', 'middle');
    yLabel.setAttribute('font-size', '12');
    yLabel.setAttribute('fill', axisColor);
    yLabel.setAttribute('transform', `rotate(-90 16 ${margin.top + plotHeight / 2})`);
    yLabel.textContent = config.yLabel || 'PC2';
    svg.appendChild(yLabel);
    return svg;
  }

  function renderPcaSupplementalPlots(options = {}) {
    const method = String(options.method || '').toLowerCase();
    const staleComponentSelectionCard = getPcaNodeById('pcaComponentSelectionSummaryCard');
    if (staleComponentSelectionCard?.parentNode) {
      staleComponentSelectionCard.parentNode.removeChild(staleComponentSelectionCard);
    }
    const staleLoadingsPlotCard = getPcaNodeById('pcaLoadingsPlotCard');
    if (staleLoadingsPlotCard?.parentNode) {
      staleLoadingsPlotCard.parentNode.removeChild(staleLoadingsPlotCard);
    }
    const {
      card: biplotCard,
      body: biplotBody
    } = ensurePcaDynamicStatsCard('pcaBiplotCard', 'Biplot', pcaScreeContainer || pcaLoadingsContainer || null);
    if (biplotCard) {
      biplotCard.setAttribute('data-stats-section', 'summary');
      biplotCard.classList.add('pca-scree-row-biplot');
      if (pcaScreeVarianceRow && biplotCard.parentNode !== pcaScreeVarianceRow) {
        pcaScreeVarianceRow.appendChild(biplotCard);
      }
    }
    if (biplotBody) {
      biplotBody.innerHTML = '';
    }
    const biplot = options.biplot && typeof options.biplot === 'object' ? options.biplot : null;
    const hasBiplot = method === 'pca' && biplot && Array.isArray(biplot.vectors) && biplot.vectors.length;
    if (biplotCard) {
      biplotCard.hidden = !hasBiplot;
      const titleNode = biplotCard.querySelector('.loadings-card__title');
      if (titleNode) {
        titleNode.classList.add('pca-biplot-title');
        titleNode.innerHTML = '';
        const titleLabel = document.createElement('span');
        titleLabel.className = 'pca-biplot-title__label';
        titleLabel.textContent = 'Biplot';
        const scoresToggleLabel = document.createElement('label');
        scoresToggleLabel.className = 'pca-biplot-title__toggle';
        const scoresToggleInput = document.createElement('input');
        scoresToggleInput.type = 'checkbox';
        scoresToggleInput.id = 'pcaBiplotShowScores';
        scoresToggleInput.checked = sanitizePcaBiplotShowSampleScores(pcaState.biplotShowSampleScores);
        scoresToggleInput.addEventListener('change', () => {
          const nextValue = sanitizePcaBiplotShowSampleScores(scoresToggleInput.checked);
          if (nextValue === sanitizePcaBiplotShowSampleScores(pcaState.biplotShowSampleScores)) {
            return;
          }
          pcaState.biplotShowSampleScores = nextValue;
          const resultsSnapshot = getPcaResultsState(getActivePcaSessionForState());
          const statsSnapshot = resultsSnapshot?.stats || null;
          const methodValue = String(statsSnapshot?.method || options.method || '').toLowerCase();
          const cachedBiplot = (resultsSnapshot?.supplemental?.biplot && typeof resultsSnapshot.supplemental.biplot === 'object') ?
            resultsSnapshot.supplemental.biplot :
            ((statsSnapshot && typeof statsSnapshot === 'object' && statsSnapshot.biplot && typeof statsSnapshot.biplot === 'object') ?
              statsSnapshot.biplot :
              (options.biplot && typeof options.biplot === 'object' ? options.biplot : null));
          if (cachedBiplot) {
            preservePcaScrollPosition(() => {
              renderPcaSupplementalPlots({
                method: methodValue || 'pca',
                biplot: cachedBiplot
              });
            });
          } else {
            requestPcaViewRefresh('biplot-show-scores-toggle');
          }
        });
        scoresToggleLabel.appendChild(scoresToggleInput);
        scoresToggleLabel.appendChild(document.createTextNode(' Show sample scores'));
        titleNode.appendChild(titleLabel);
        titleNode.appendChild(scoresToggleLabel);
      }
    }
    if (hasBiplot && biplotBody) {
      const scorePoints = sanitizePcaBiplotShowSampleScores(pcaState.biplotShowSampleScores) ?
        (Array.isArray(biplot.points) ? biplot.points : []) :
        [];
      removePcaDuplicateRootNodes('pcaBiplotSvg', null, 'render-biplot-before-append');
      removePcaDuplicateRootNodes('pcaBiplotExportControls', null, 'render-biplot-before-append');
      const biplotSvg = createPcaMiniScatterSvg({
        svgId: 'pcaBiplotSvg',
        points: scorePoints,
        scalePoints: Array.isArray(biplot.points) ? biplot.points : [],
        vectors: biplot.vectors,
        xLabel: biplot.xLabel || 'PC1',
        yLabel: biplot.yLabel || 'PC2',
        pointColor: '#4daf4a',
        pointOpacity: 0.55,
        vectorColor: '#c7301f'
      });
      markPcaDynamicStatsNode(biplotSvg, 'biplot-svg');
      biplotBody.appendChild(biplotSvg);
      const biplotScaleNote = document.createElement('div');
      biplotScaleNote.className = 'stats-note pca-biplot-scale-note';
      biplotScaleNote.textContent = biplot.vectorScaleNote || 'Loading vectors are uniformly rescaled for visibility.';
      markPcaDynamicStatsNode(biplotScaleNote, 'biplot-scale-note');
      biplotBody.appendChild(biplotScaleNote);
      const biplotExportControls = document.createElement('div');
      biplotExportControls.className = 'row idx-inline-043';
      biplotExportControls.id = 'pcaBiplotExportControls';
      markPcaDynamicStatsNode(biplotExportControls, 'biplot-export-controls');
      biplotBody.appendChild(biplotExportControls);
      if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
        Shared.exporter.mountSvgControls({
          container: biplotExportControls,
          getSvg: () => biplotBody.querySelector?.('#pcaBiplotSvg') || null,
          fileName: 'pca-biplot',
          contextLabel: 'pca-biplot-export',
          componentName: 'pca-biplot'
        });
      }
    }
  }

  function restorePcaStatsFromPayload(options = {}) {
    const requestedSession = options.session && typeof options.session === 'object'
      ? ensurePcaSessionOwnershipShape(options.session)
      : null;
    const session = requestedSession || getActivePcaSessionForState();
    const projectionTabId = String(getPcaProjectionTabId() || '').trim();
    const ownerTabId = String(session?.tabId || '').trim();
    if (!session || (ownerTabId && projectionTabId && ownerTabId !== projectionTabId)) {
      debugLog('Debug: pca stats projection skipped for non-owner DOM', {
        ownerTabId: ownerTabId || null,
        projectionTabId: projectionTabId || null,
        reason: options.reason || 'pca-stats-restore'
      });
      return false;
    }
    const resultsSnapshot = getPcaResultsState(session);
    const statsSnapshot = resultsSnapshot?.stats || null;
    if (!statsSnapshot || typeof statsSnapshot !== 'object') {
      return false;
    }
    const method = String(statsSnapshot.method || resultsSnapshot?.method || '').toLowerCase();
    const summaryLines = Array.isArray(resultsSnapshot?.summaryLines) && resultsSnapshot.summaryLines.length ?
      resultsSnapshot.summaryLines :
      (Array.isArray(statsSnapshot.summaryLines) ? statsSnapshot.summaryLines : []);
    const eigenSummary = Array.isArray(resultsSnapshot?.eigenSummary) && resultsSnapshot.eigenSummary.length ?
      resultsSnapshot.eigenSummary :
      (Array.isArray(statsSnapshot.eigenSummary) ? statsSnapshot.eigenSummary : []);
    const screeData = Array.isArray(resultsSnapshot?.scree) && resultsSnapshot.scree.length ?
      resultsSnapshot.scree :
      (Array.isArray(statsSnapshot.scree) ? statsSnapshot.scree : []);
    const resultsLoadings = resultsSnapshot?.supplemental?.loadings || null;
    const loadings = resultsLoadings && Array.isArray(resultsLoadings.rows) ?
      resultsLoadings :
      (statsSnapshot.loadings && typeof statsSnapshot.loadings === 'object' ? statsSnapshot.loadings : null);
    renderPcaSummaryPanel({
      summaryLines,
      method,
      savedSummaryModel: options.savedSummaryModel,
      savedReportModel: options.savedReportModel
    });
    renderScreeChart({
      show: method === 'pca',
      data: screeData,
      method,
      pointColor: pcaFill?.value || '#0000ff',
      parallelAnalysis: Array.isArray(resultsSnapshot?.parallelAnalysis) && resultsSnapshot.parallelAnalysis.length ?
        resultsSnapshot.parallelAnalysis :
        (Array.isArray(statsSnapshot.parallelAnalysis) ? statsSnapshot.parallelAnalysis : [])
    });
    renderEigenTable({
      show: method === 'pca' || method === 'mds',
      data: eigenSummary,
      enableExport: eigenSummary.length > 0,
      method
    });
    if (loadings) {
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
      biplot: resultsSnapshot?.supplemental?.biplot || statsSnapshot.biplot || null
    });
    setPcaStatsPanelResultsState(capturePcaStatsPanelState({
      summaryModel: options.savedSummaryModel || getPcaStatsPanelSnapshot(session).summaryModel || null,
      resultsModel: options.savedResultsModel || getPcaStatsPanelSnapshot(session).resultsModel || null,
      reportModel: options.savedReportModel || getPcaStatsPanelSnapshot(session).reportModel || null
    }, { session }), session, {
      mirrorActive: true
    });
    debugLog('Debug: pca stats restored from persisted payload UI', {
      method,
      summaryLines: summaryLines.length,
      screePoints: screeData.length,
      eigenRows: eigenSummary.length,
      loadingsRows: Array.isArray(loadings?.rows) ? loadings.rows.length : 0,
      hasSavedSummaryModel: !!options.savedSummaryModel,
      hasSavedResultsModel: !!options.savedResultsModel,
      hasSavedReportModel: !!options.savedReportModel
    });
    return true;
  }

  function normalizePcaSavedStatsModels(statsConfig) {
    const stats = statsConfig && typeof statsConfig === 'object' ? statsConfig : {};
    const saved = normalizePcaStatsPanelState(stats);
    return {
      savedSummaryModel: saved.summaryModel,
      savedResultsModel: saved.resultsModel,
      savedReportModel: saved.reportModel
    };
  }

  function finalizePcaStatsPayloadRestore(savedStatsModels, reason, session = null) {
    const ownerSession = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (!getPcaStatsSnapshot(ownerSession) || !savedStatsModels || typeof savedStatsModels !== 'object') {
      return;
    }
    const restore = () => {
      restorePcaStatsFromPayload({
        ...savedStatsModels,
        session: ownerSession,
        reason: reason || 'pca-stats-payload-restore'
      });
    };
    const ownerTabId = ownerSession?.tabId || null;
    if (ownerTabId && Shared.componentLifecycle?.scheduleComponentTimeout) {
      Shared.componentLifecycle.scheduleComponentTimeout(pca, 'pca', {
        tabId: ownerTabId,
        reason: reason || 'pca-stats-payload-restore'
      }, restore, 0);
    } else {
      restore();
    }
  }

  function updateScreeVarianceRowVisibility() {
    if (!pcaScreeVarianceRow) {
      return;
    }
    const screeVisible = !!pcaScreeContainer && !pcaScreeContainer.hidden;
    const biplotCard = getPcaNodeById('pcaBiplotCard');
    const biplotVisible = !!biplotCard && !biplotCard.hidden;
    pcaScreeVarianceRow.style.display = (screeVisible || biplotVisible) ? 'flex' : 'none';
  }

  function resetStatsPanel(message) {
    const reportHost = ensurePcaReportHost();
    if (pcaStatsSummary) {
      pcaStatsSummary.innerHTML = message ? `<div class="stats-table-message">${message}</div>` : '';
    }
    if (reportHost) {
      reportHost.innerHTML = '';
    }
    if (pcaScreePlot) {
      pcaScreePlot.innerHTML = '';
    }
    if (pcaScreeExportControls) {
      pcaScreeExportControls.style.display = 'none';
    }
    if (pcaScreeContainer) {
      pcaScreeContainer.hidden = true;
    }
    if (pcaVarianceSummary) {
      pcaVarianceSummary.hidden = true;
      delete pcaVarianceSummary.dataset.sharedStatsTable;
    }
    if (pcaVarianceList) {
      pcaVarianceList.innerHTML = '';
    }
    if (pcaEigenTableWrapper) {
      pcaEigenTableWrapper.innerHTML = '';
    }
    if (pcaEigenTableContainer) {
      pcaEigenTableContainer.hidden = true;
      delete pcaEigenTableContainer.dataset.sharedStatsTable;
    }
    if (pcaLoadingsTable) {
      pcaLoadingsTable.innerHTML = '';
    }
    if (pcaLoadingsContainer) {
      pcaLoadingsContainer.hidden = true;
      delete pcaLoadingsContainer.dataset.sharedStatsTable;
    }
    ['pcaBiplotCard'].forEach(cardId => {
      const card = getPcaNodeById(cardId);
      const body = getPcaNodeById(`${cardId}Body`);
      if (card) {
        card.hidden = true;
      }
      if (body) {
        body.innerHTML = '';
      }
    });
    const staleComponentSelectionCard = getPcaNodeById('pcaComponentSelectionSummaryCard');
    if (staleComponentSelectionCard?.parentNode) {
      staleComponentSelectionCard.parentNode.removeChild(staleComponentSelectionCard);
    }
    resetLoadingsActionsHost();
    if (pcaExportEigenTableBtn) {
      pcaExportEigenTableBtn.disabled = true;
    }
    resetEigenExportButtonHost();
    if (pcaDefaultEigenExportHost?.style) {
      pcaDefaultEigenExportHost.style.display = '';
    }
    updateEigenExportVisibility(false);
    updateScreeVarianceRowVisibility();
    debugLog('Debug: pca stats panel reset', {
      message: message || null
    }); // Debug: stats reset helper
  }

  function togglePcaScreeParallelVisibility(showParallel) {
    const svg = pcaScreePlot?.querySelector?.('svg#pcaScreeSvg');
    if (!svg) {
      return false;
    }
    const shouldShow = showParallel !== false;
    svg.setAttribute('data-show-parallel', shouldShow ? '1' : '0');
    const nodes = svg.querySelectorAll('[data-scree-parallel]');
    nodes.forEach(node => {
      node.style.display = shouldShow ? '' : 'none';
    });
    return nodes.length > 0;
  }

  function renderScreeChart(options) {
    const opts = options || {};
    const show = !!opts.show;
    const data = Array.isArray(opts.data) ? opts.data : [];
    const parallelAnalysis = Array.isArray(opts.parallelAnalysis) ? opts.parallelAnalysis : [];
    const showParallelToggle = sanitizePcaScreeShowParallel(pcaState.screeShowParallel);
    if (pcaScreeShowParallelInput) {
      pcaScreeShowParallelInput.checked = showParallelToggle;
      pcaScreeShowParallelInput.disabled = !parallelAnalysis.length;
      const toggleLabel = pcaScreeShowParallelInput.closest('label');
      if (toggleLabel) {
        toggleLabel.style.opacity = parallelAnalysis.length ? '' : '0.6';
      }
    }
    if (!pcaScreeContainer) {
      debugLog('Debug: pca scree render skipped', {
        reason: 'missing-container'
      });
      return;
    }
    if (pcaScreePlot) {
      pcaScreePlot.innerHTML = '';
    }
    if (pcaScreeExportControls) {
      pcaScreeExportControls.style.display = show ? '' : 'none';
    }
    if (!show || opts.method !== 'pca') {
      pcaScreeContainer.hidden = true;
      if (pcaScreeContainer.style) {
        pcaScreeContainer.style.removeProperty('max-width');
      }
      debugLog('Debug: pca scree hidden', {
        show,
        count: data.length,
        method: opts.method
      }); // Debug: scree visibility
      updateScreeVarianceRowVisibility();
      return;
    }
    if (!data.length) {
      pcaScreeContainer.hidden = false;
      if (pcaScreeExportControls) {
        pcaScreeExportControls.style.display = 'none';
      }
      if (pcaScreePlot) {
        pcaScreePlot.innerHTML = '<div class="stats-table-message">Scree plot will appear after PCA runs.</div>';
      }
      if (pcaScreeContainer.style) {
        pcaScreeContainer.style.removeProperty('max-width');
      }
      debugLog('Debug: pca scree placeholder shown');
      updateScreeVarianceRowVisibility();
      return;
    }
    pcaScreeContainer.hidden = false;
    const host = pcaScreePlot || pcaScreeContainer;
    if (pcaScreeExportControls) {
      pcaScreeExportControls.style.display = '';
    }
    const containerWidth = host.clientWidth || 0;
    let drawingBoxWidth = 0;
    if (pcaSvgBox) {
      const rectWidth = typeof pcaSvgBox.getBoundingClientRect === 'function' ? pcaSvgBox.getBoundingClientRect().width : 0;
      const clientWidth = pcaSvgBox.clientWidth || 0;
      drawingBoxWidth = Math.max(rectWidth || 0, clientWidth || 0);
    }
    let width = containerWidth > 0 ? containerWidth : 360;
    if (drawingBoxWidth > 0) {
      width = Math.min(width, drawingBoxWidth);
    } else if (width < 360) {
      width = 360;
    }
    if (pcaScreeContainer.style) {
      pcaScreeContainer.style.maxWidth = `${Math.max(width, 0)}px`;
    }
    const height = 300;
    const margin = {
      top: 26,
      right: 28,
      bottom: 54,
      left: 78
    };
    const axisTickFontSize = 12;
    const axisTitleFontSize = 12;
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
    if (svg.style) {
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
    const screeGridSegments = [];
    for (let i = 1; i <= tickCount; i += 1) {
      const pct = (yAxisMax / tickCount) * i;
      const y = margin.top + plotHeight - (plotHeight * (pct / yAxisMax));
      screeGridSegments.push({
        x1: margin.left,
        y1: y,
        x2: margin.left + plotWidth,
        y2: y
      });
    }
    const screeGridPathData = svgGeometry.buildCompoundLinePath(screeGridSegments);
    if(screeGridPathData){
      const grid = document.createElementNS(NS, 'path');
      grid.setAttribute('d', screeGridPathData);
      grid.setAttribute('fill', 'none');
      grid.setAttribute('stroke', '#ddd');
      grid.setAttribute('stroke-width', '1');
      grid.setAttribute('data-pca-scree-grid', '1');
      grid.setAttribute('data-pca-scree-grid-segment-count', String(screeGridSegments.length));
      svg.appendChild(grid);
    }
    for (let i = 0; i <= tickCount; i += 1) {
      const pct = (yAxisMax / tickCount) * i;
      const y = margin.top + plotHeight - (plotHeight * (pct / yAxisMax));
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
    if (cumulativePositions.length) {
      const cumulativePath = document.createElementNS(NS, 'path');
      const cumulativeD = xPositions.map((x, idx) => `${idx===0?'M':'L'}${x} ${cumulativePositions[idx]}`).join(' ');
      cumulativePath.setAttribute('d', cumulativeD);
      cumulativePath.setAttribute('fill', 'none');
      cumulativePath.setAttribute('stroke', cumulativeColor);
      cumulativePath.setAttribute('stroke-width', '2');
      svg.appendChild(cumulativePath);
    }
    const parallelPositions = parallelAnalysis.length ?
      parallelAnalysis.map(value => {
        const pct = Number(value) || 0;
        return margin.top + plotHeight - (plotHeight * (pct / Math.max(yAxisMax, 1)));
      }) :
      [];
    if (parallelPositions.length) {
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
      parallelPath.setAttribute('data-scree-parallel', 'line');
      svg.appendChild(parallelPath);
    }
    const xAxisTickLength = 6;
    const xAxisTickLabelGap = typeof chartStyle.resolveTickLabelGap === 'function'
      ? chartStyle.resolveTickLabelGap(axisTickFontSize)
      : Math.max(2, Math.round(axisTickFontSize * 0.2));
    const xAxisTickLabelBaselineOffset = xAxisTickLength + xAxisTickLabelGap + axisTickFontSize * 0.75;
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
      label.setAttribute('y', String(margin.top + plotHeight + xAxisTickLabelBaselineOffset));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', axisColor);
      label.setAttribute('font-size', `${axisTickFontSize}px`);
      label.textContent = `${Number(item.component) || (idx + 1)}`;
      svg.appendChild(label);
    });
    if (cumulativePositions.length) {
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
    const legendEntries = [{
      label: 'Cumulative variance',
      color: cumulativeColor,
      strokeDash: '',
      parallel: false
    }, {
      label: 'Explained variance',
      color: pointColor,
      strokeDash: '',
      parallel: false
    }];
    if (parallelPositions.length) {
      legendEntries.push({
        label: 'Parallel analysis',
        color: '#e41a1c',
        strokeDash: '6 4',
        parallel: true
      });
    }
    const legendLineHeight = 14;
    const legendHeight = legendEntries.length * legendLineHeight;
    const legendGroup = document.createElementNS(NS, 'g');
    const legendX = Math.max(margin.left + 16, margin.left + plotWidth - 120);
    const legendY = Math.max(margin.top + 8, margin.top + (plotHeight / 2) - (legendHeight / 2));
    legendEntries.forEach((entry, idx) => {
      const lineY = legendY + (idx * legendLineHeight);
      const entryGroup = document.createElementNS(NS, 'g');
      if (entry.parallel) {
        entryGroup.setAttribute('data-scree-parallel', 'legend');
      }
      const sampleLine = document.createElementNS(NS, 'line');
      sampleLine.setAttribute('x1', String(legendX));
      sampleLine.setAttribute('x2', String(legendX + 32));
      sampleLine.setAttribute('y1', String(lineY));
      sampleLine.setAttribute('y2', String(lineY));
      sampleLine.setAttribute('stroke', entry.color);
      sampleLine.setAttribute('stroke-width', '2');
      if (entry.strokeDash) {
        sampleLine.setAttribute('stroke-dasharray', entry.strokeDash);
      }
      entryGroup.appendChild(sampleLine);
      const legendLabel = document.createElementNS(NS, 'text');
      legendLabel.setAttribute('x', String(legendX + 40));
      legendLabel.setAttribute('y', String(lineY));
      legendLabel.setAttribute('dominant-baseline', 'middle');
      legendLabel.setAttribute('fill', axisColor);
      legendLabel.setAttribute('font-size', `${legendFontSize}px`);
      legendLabel.textContent = entry.label;
      entryGroup.appendChild(legendLabel);
      legendGroup.appendChild(entryGroup);
    });
    svg.appendChild(legendGroup);
    host.appendChild(svg);
    togglePcaScreeParallelVisibility(showParallelToggle);
    debugLog('Debug: pca scree chart rendered', {
      count: data.length,
      maxPct: yAxisMax,
      width,
      height,
      drawingBoxWidth,
      containerWidth
    });
    updateScreeVarianceRowVisibility();
  }



  function renderEigenTable(options) {
    const opts = options || {};
    const show = !!opts.show;
    const data = Array.isArray(opts.data) ? opts.data : [];
    const method = (opts.method || '').toLowerCase();
    const supportsEigen = method === 'pca' || method === 'mds';
    if (!pcaEigenTableContainer) {
      debugLog('Debug: pca eigen table skipped', {
        reason: 'missing-container'
      });
      return;
    }
    if (!show || !supportsEigen) {
      if (pcaEigenTableWrapper) {
        pcaEigenTableWrapper.innerHTML = '';
      }
      pcaEigenTableContainer.hidden = true;
      delete pcaEigenTableContainer.dataset.sharedStatsTable;
      resetEigenExportButtonHost();
      if (pcaDefaultEigenExportHost?.style) {
        pcaDefaultEigenExportHost.style.display = '';
      }
      updateEigenExportVisibility(false);
      debugLog('Debug: pca eigen table hidden', {
        show,
        method: opts.method,
        count: data.length
      });
      return;
    }
    pcaEigenTableContainer.hidden = false;
    if (!data.length) {
      if (pcaEigenTableWrapper) {
        const friendly = method === 'mds' ? 'MDS' : 'PCA';
        pcaEigenTableWrapper.innerHTML = `<div class="stats-table-message">${friendly} eigenvalues will populate after the analysis runs.</div>`;
      }
      delete pcaEigenTableContainer.dataset.sharedStatsTable;
      resetEigenExportButtonHost();
      if (pcaDefaultEigenExportHost?.style) {
        pcaDefaultEigenExportHost.style.display = '';
      }
      updateEigenExportVisibility(false);
      if (pcaExportEigenTableBtn) {
        pcaExportEigenTableBtn.disabled = true;
      }
      debugLog('Debug: pca eigen table placeholder shown');
      return;
    }
    if (pcaEigenTableWrapper) {
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
        section: 'summary',
        columns: [{
          key: 'component',
          label: 'Component',
          align: 'left'
        }, {
          key: 'eigenvalue',
          label: 'Eigenvalue',
          align: 'left'
        }, {
          key: 'variancePercent',
          label: percentHeader,
          align: 'left'
        }, {
          key: 'cumulativePercent',
          label: cumulativeHeader,
          align: 'left'
        }],
        rows,
        caption: method === 'mds' ? 'MDS Eigen Summary' : 'PCA Eigen Summary',
        options: {
          fileName: method === 'mds' ? 'mds-eigen-summary' : 'pca-eigen-summary',
          contextLabel: method === 'mds' ? 'mds-eigen-summary' : 'pca-eigen-summary'
        }
      });
      if (rendered?.wrapper) {
        pcaEigenTableContainer.dataset.sharedStatsTable = '1';
        const actions = rendered.wrapper.querySelector('.stats-table-actions');
        if (actions) {
          dockEigenExportButton(actions);
        }
        if (pcaDefaultEigenExportHost?.style) {
          pcaDefaultEigenExportHost.style.display = 'none';
        }
      } else {
        delete pcaEigenTableContainer.dataset.sharedStatsTable;
        resetEigenExportButtonHost();
        if (pcaDefaultEigenExportHost?.style) {
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
    if (pcaExportEigenTableBtn) {
      pcaExportEigenTableBtn.disabled = !exportEnabled;
    }
    debugLog('Debug: pca eigen table rendered', {
      rows: data.length,
      exportEnabled,
      method
    });
  }

  function renderStatsPanel(options) {
    const opts = options || {};
    const summaryLines = Array.isArray(opts.summaryLines) ? opts.summaryLines : [];
    renderPcaSummaryPanel({
      summaryLines,
      method: opts.method
    });
    if (!pcaStatsSummary && pcaStatsResults) {
      pcaStatsResults.innerHTML = summaryLines.length ? summaryLines.join('<br>') : '<i>No statistics computed.</i>';
    }
    renderScreeChart({
      show: opts.showScree,
      data: opts.screeData,
      method: opts.method,
      pointColor: opts.pointColor,
      parallelAnalysis: opts.parallelAnalysis
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
    ensurePcaReportHost();
    syncPcaSessionRefsFromActive(getActivePcaSessionForState());
  }

  function handleEigenExport() {
    const statsSnapshot = getPcaStatsSnapshot(getActivePcaSessionForState());
    if (!statsSnapshot || !['pca', 'mds'].includes(statsSnapshot.method)) {
      debugLog('Debug: pca eigen export blocked', {
        reason: 'non-supported-method',
        method: statsSnapshot?.method || null
      });
      return;
    }
    if (!Array.isArray(statsSnapshot.eigenSummary) || !statsSnapshot.eigenSummary.length) {
      debugLog('Debug: pca eigen export skipped', {
        reason: 'no-data'
      });
      return;
    }
    const method = statsSnapshot.method;
    const percentHeader = method === 'mds' ? 'InertiaPercent' : 'VariancePercent';
    const cumulativeHeader = method === 'mds' ? 'CumulativeInertiaPercent' : 'CumulativePercent';
    const rows = [
      ['Component', 'Eigenvalue', percentHeader, cumulativeHeader, 'SingularValue']
    ];
    statsSnapshot.eigenSummary.forEach(entry => {
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
    try {
      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${method}-eigenvalues.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (getPcaProjectionTabId() && Shared.componentLifecycle?.scheduleComponentTimeout) {
        Shared.componentLifecycle.scheduleComponentTimeout(pca, 'pca', {
          tabId: getPcaProjectionTabId(),
          reason: 'pca-eigen-export-url-revoke'
        }, () => URL.revokeObjectURL(url), 1000);
      } else {
        URL.revokeObjectURL(url);
      }
      debugLog('Debug: pca eigen export generated', {
        rows: rows.length - 1,
        method
      });
    } catch (err) {
      console.error('pca eigen export failed', err);
    }
  }

  const applyPcaLabelColor = (label, value) => {
    const nextValue = value != null ? String(value) : '';
    const key = pcaLabelPointStyleKey(label);
    const scopes = ensurePcaPointStyleScopes();
    const previousValue = scopes.points[key]?.fill || '';
    if (!key || !nextValue || previousValue === nextValue) {
      return true;
    }
    scopes.points[key] = { ...(scopes.points[key] || {}), fill: nextValue };
    commitPcaPointStyleScopes('label-color-change');
    requestPcaViewRefresh('label-color-change');
    return true;
  };

  const applyPcaLabelShape = (label, value, fallbackIndex = 0) => {
    const key = pcaLabelPointStyleKey(label);
    const scopes = ensurePcaPointStyleScopes();
    const previousValue = scopes.points[key]?.shape || '';
    const sanitized = typeof value === 'string' && value ?
      sanitizeGroupShape(value, fallbackIndex) :
      '';
    if (!key || !sanitized || previousValue === sanitized) {
      return true;
    }
    scopes.points[key] = { ...(scopes.points[key] || {}), shape: sanitized };
    commitPcaPointStyleScopes('label-shape-change');
    requestPcaViewRefresh('label-shape-change');
    return true;
  };

  function ensurePcaLabelStyles(labels, groupMeta) {
    const labelArray = Array.isArray(labels) ? labels : [];
    if (pcaState.tableFormat === 'grouped') {
      debugLog('Debug: ensurePcaLabelStyles skipped', {
        grouped: true,
        labels: labelArray.length
      });
      return;
    }
    const scopes = ensurePcaPointStyleScopes();
    const labelSet = new Set();
    labelArray.forEach((lab, i) => {
      if (!lab) {
        return;
      }
      labelSet.add(lab);
      const key = pcaLabelPointStyleKey(lab);
      const current = scopes.points[key] || {};
      if (!current.fill) {
        current.fill = DEFAULT_SCATTER_COLORS[i % DEFAULT_SCATTER_COLORS.length];
        debugLog('Debug: pca default label color applied', {
          label: lab,
          color: current.fill
        });
      }
      const currentShape = current.shape;
      if (currentShape) {
        const sanitized = sanitizeGroupShape(currentShape, i);
        if (sanitized !== currentShape) {
          current.shape = sanitized;
        }
      } else {
        const defaultShape = GROUP_SHAPE_DEFAULTS.length ?
          GROUP_SHAPE_DEFAULTS[i % GROUP_SHAPE_DEFAULTS.length] :
          'circle';
        current.shape = sanitizeGroupShape(defaultShape, i);
        debugLog('Debug: pca default label shape applied', {
          label: lab,
          shape: current.shape
        });
      }
      scopes.points[key] = current;
    });
    Object.keys(scopes.points).forEach(existingKey => {
      if (!existingKey.startsWith('label:')) {
        return;
      }
      const existing = existingKey.slice('label:'.length);
      if (!labelSet.has(existing)) {
        debugLog('Debug: pca label point style pruned', { label: existing });
        delete scopes.points[existingKey];
      }
    });
    debugLog('Debug: ensurePcaLabelStyles sync complete', {
      labels: labelSet.size,
      grouped: false
    });
  }

  function handleLegendColorChange(entry, anchor) {
    if (typeof Shared.openColorPicker !== 'function') {
      return;
    }
    const initialColor = entry.color;
    let shapePicker = null;
    let previousShape = null;
    if (Number.isInteger(entry.groupIndex)) {
      const groupIndex = entry.groupIndex;
      const currentShape = sanitizeGroupShape(ensurePcaPointStyleScopes().groups?.[String(groupIndex)]?.shape, groupIndex);
      previousShape = currentShape;
      const applyGroupShape = (shapeValue) => {
        const sanitized = sanitizeGroupShape(shapeValue, groupIndex);
        if (ensurePcaPointStyleScopes().groups?.[String(groupIndex)]?.shape === sanitized) {
          return true;
        }
        applyPcaScopedPointStylePatch('group', String(groupIndex), { shape: sanitized }, {
          reason: 'legend-group-shape'
        });
        updateGroupedShapeInput(groupIndex, sanitized);
        requestPcaViewRefresh('legend-group-shape');
        return true;
      };
      shapePicker = {
        value: currentShape,
        options: GROUP_SHAPE_OPTIONS,
        onChange(nextShape) {
          const sanitized = sanitizeGroupShape(nextShape, groupIndex);
          if (sanitized === previousShape) {
            return;
          }
          applyGroupShape(sanitized);
          recordPcaChange(`pca:group-shape:${groupIndex}`, previousShape, sanitized, value => applyGroupShape(value));
          previousShape = sanitized;
          debugLog('Debug: pca legend group shape change', {
            groupIndex,
            shape: sanitized
          });
        }
      };
    } else if (entry.labelValue) {
      const labelKey = entry.labelValue;
      const labelIndex = Number.isInteger(entry.labelIndex) ? entry.labelIndex : 0;
      const currentShape = sanitizeGroupShape(ensurePcaPointStyleScopes().points?.[pcaLabelPointStyleKey(labelKey)]?.shape || 'circle', labelIndex);
      previousShape = currentShape;
      const applyLabelShape = (shapeValue) => applyPcaLabelShape(labelKey, shapeValue, labelIndex);
      shapePicker = {
        value: currentShape,
        options: GROUP_SHAPE_OPTIONS,
        onChange(nextShape) {
          const sanitized = sanitizeGroupShape(nextShape, labelIndex);
          if (sanitized === previousShape) {
            return;
          }
          applyLabelShape(sanitized);
          recordPcaChange(`pca:label-shape:${labelKey}`, previousShape, sanitized, value => applyLabelShape(value));
          previousShape = sanitized;
          debugLog('Debug: pca legend label shape change', {
            label: labelKey,
            shape: sanitized
          });
        }
      };
    }
    const applyLegendColor = (colorValue) => {
      if (Number.isInteger(entry.groupIndex)) {
        const resolved = typeof colorValue === 'string' && colorValue ? colorValue : initialColor;
        const index = entry.groupIndex;
        applyPcaGroupColor(index, resolved);
        updateGroupedColorInput(index, resolved);
        debugLog('Debug: pca legend group color input', {
          groupIndex: index,
          color: resolved
        });
        return resolved;
      }
      if (entry.labelValue) {
        const resolved = typeof colorValue === 'string' && colorValue ? colorValue : initialColor;
        applyPcaLabelColor(entry.labelValue, resolved);
        debugLog('Debug: pca legend label color input', {
          label: entry.labelValue,
          color: resolved
        });
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
      onInput(value) {
        previousColor = applyLegendColor(value);
      },
      onChange(value) {
        const nextValue = applyLegendColor(value);
        if (nextValue === previousColor) {
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

  async function drawPca(explicitDrawOptions = {}) {
    const explicitOpts = normalizeDrawOptions(explicitDrawOptions || {});
    const scheduledSession = getPcaSessionForDrawOptions(explicitOpts, {
        create: true
      }) ||
      getPcaSessionForDrawOptions(pendingDrawOptions || {}, {
        create: true
      });
    const scheduledDrawRuntime = getPcaDrawRuntime(scheduledSession, {
      seedFromActive: true
    });
    const runtimePending = scheduledDrawRuntime.pendingDrawOptions || {};
    const drawOpts = {
      ...(pendingDrawOptions || {}),
      ...(runtimePending || {}),
      ...(explicitOpts || {}),
      tabId: explicitOpts.tabId || runtimePending.tabId || pendingDrawOptions.tabId || scheduledSession?.tabId || null
    };
    const drawSession = bindPcaSessionForTab(drawOpts.tabId || drawOpts.__workspaceSessionMeta?.tabId || scheduledSession?.tabId || getPcaProjectionTabId() || null, {
      ...(drawOpts || {}),
      reason: drawOpts.reason || 'pca-draw-session'
    }) || scheduledSession;
    const drawRuntime = getPcaDrawRuntime(drawSession, {
      seedFromActive: true
    });
    const renderRuntime = getPcaRenderRuntime(drawSession, {
      seedFromActive: true
    });
    const drawTabId = drawSession?.tabId || drawOpts.tabId || getPcaProjectionTabId() || null;
    // Keep PCA aligned with line.js: draw-critical DOM refs are resolved from
    // the draw tab, never from the tab that originally ran setup().
    const pcaPlotDiv = getPcaNodeById('pcaPlot', drawTabId) || getPcaNodeById('pcaPlot') || null;
    const pcaSvgBox = pcaPlotDiv?.closest?.('.svgbox') ||
      queryPcaRoot('#pcaGraphPanel .svgbox', drawTabId) ||
      pcaSvgBoxRef ||
      null;
    const pcaFontSize = getPcaNodeById('pcaFontSize', drawTabId) || getPcaNodeById('pcaFontSize') || null;
    const pcaFontSizeVal = getPcaNodeById('pcaFontSizeVal', drawTabId) || getPcaNodeById('pcaFontSizeVal') || null;
    updatePcaDrawRuntime(drawSession, runtime => {
      runtime.pendingDrawOptions = {};
    });
    const viewOnly = !!drawOpts.viewOnly;
    // Statistics are analysis-owned output. A view-only redraw (rotation, resize,
    // graph styling, preview refresh) must never rebuild them from a partial
    // render cache. Only a data draw or an explicitly requested statistics
    // refresh may mutate the statistics DOM.
    const refreshStats = !viewOnly || drawOpts.refreshStats === true;
    const shouldBumpToken = !viewOnly || !!renderRuntime.dataDirty;
    const drawToken = shouldBumpToken ?
      (Number(drawRuntime.token) || 0) + 1 :
      (Number(drawRuntime.token) || 0);
    if (shouldBumpToken) {
      updatePcaDrawRuntime(drawSession, runtime => {
        runtime.token = drawToken;
      });
    }
    const pcaCartesianGeneration = (Number(renderRuntime?.cartesianLayoutGeneration) || 0) + 1;
    updatePcaRenderRuntime(drawSession, runtime => {
      runtime.cartesianLayoutGeneration = pcaCartesianGeneration;
    }, {
      mirrorActive: isPcaSessionActiveForModuleState(drawSession)
    });
    const pcaCartesianOwner = {
      tabId: drawTabId || null,
      component: 'pca',
      generation: pcaCartesianGeneration
    };
    const drawAsyncState = shouldBumpToken ?
      createPcaDrawAsyncState({
        ...drawOpts,
        tabId: drawSession?.tabId || drawOpts.tabId || null
      }, drawToken) :
      null;
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
    let preprocessingMetadata = null;
    let statsSummaryLines = [];
    let eigenSummaryData = [];
    let screeData = [];
    let componentSelectionSummary = null;
    let parallelAnalysisPercent = [];
    let statsMethod = null;
    let currentPcaStats = null;
    let dimensionMeta = [];
    let labels = [];
    let manualLabelFlags = [];
    let sampleColumnIndices = [];
    let groupedHeaderRowCache = [];
    let points3d = [];
    let axisIndices = {
      x: 0,
      y: 1,
      z: null
    };
    let pcaXLabelText = 'PC1';
    let pcaYLabelText = 'PC2';
    let pcaZLabelText = 'PC3';
    let groupMeta = null;
    let cachePayload = null;
    let analysisSignatures = null;
    let usingCache = false;
    let skipPerfRecord = false;
    let framePublication = null;
    try {
      if (viewOnly && !renderRuntime.viewDirty && !renderRuntime.dataDirty) {
        const plotRoot = pcaPlotDiv || getPcaNodeById('pcaPlot');
        const hasRenderedGraph = typeof Shared.componentLifecycle?.hasRenderableGraphContent === 'function' ?
          !!Shared.componentLifecycle.hasRenderableGraphContent(plotRoot) :
          !!plotRoot?.querySelector?.('#pcaSvg, svg, canvas');
        if (!hasRenderedGraph) {
          updatePcaRenderRuntime(drawSession, runtime => {
            runtime.viewDirty = true;
          });
          renderRuntime.viewDirty = true;
          debugLog('Debug: pca clean view refresh promoted to redraw (blank graph root)', {
            reason: drawOpts.reason || 'view-clean',
            tabId: drawSession?.tabId || null
          });
        } else {
          debugLog('Debug: pca view refresh skipped', {
            reason: drawOpts.reason || 'view-clean',
            tabId: drawSession?.tabId || null
          });
          skipPerfRecord = true;
          return;
        }
      }
      const debugStamp = Date.now();
      debugLog('Debug: drawPca invoked', {
        debugStamp
      }); // Debug: draw invocation marker
      hidePcaTooltip('draw-start');
      ensurePcaResizerControls();
      const controls = normalizePcaRuntimeControls(pcaState.controls || {});
      const showLegend = controls.showLegend !== false;
      debugLog('Debug: pca showLegend state', {
        showLegend
      });

      const cachedAnalysisPayload = getPcaAnalysisCache(drawSession);
      usingCache = viewOnly && !renderRuntime.dataDirty && !!cachedAnalysisPayload;
      let method = (controls.method || 'pca').toLowerCase();
      methodSnapshot = method;
      const previousMethod = typeof pcaState.lastMethod === 'string' ? pcaState.lastMethod : 'pca';
      const methodChanged = previousMethod !== method;
      pcaState.lastMethod = method;
      const pcaOwnedState = getPcaSessionOwnedState(drawSession);
      pcaOwnedState.state.lastMethod = method;
      let pcaLabelsState = getPcaLabelsState(drawSession, method);
      if (methodChanged) {
        const previousDefaultTitle = getDefaultTitleForMethod(previousMethod);
        const currentTitle = (pcaLabelsState.title || '').trim();
        if (!currentTitle || currentTitle === previousDefaultTitle) {
          pcaLabelsState = patchPcaLabelsState(drawSession, {
            title: getDefaultTitleForMethod(method)
          }, {
            reason: 'pca-method-title-default'
          });
          debugLog('Debug: pca title default adjusted', {
            previousMethod,
            method
          });
        }
      }
      if (shouldMirrorPcaSessionToActive(drawSession)) {
        pcaState.lastMethod = method;
      }
      let pcaTitleText = (pcaLabelsState.title || '').trim();
      if (!pcaTitleText) {
        pcaTitleText = getDefaultTitleForMethod(method);
      }
      let pcaLabelPositionsState = getPcaLabelPositionsState(drawSession);
      const rawViewMode = (controls.viewMode || DEFAULT_VIEW_MODE).toLowerCase();
      const requestedViewMode = (method === 'pca' || method === 'mds') ? rawViewMode : '2d';
      if (requestedViewMode !== '3d') {
        clearPca3dRotationRenderer(drawSession, { clearModel: true });
      }
      if (rawViewMode !== requestedViewMode) {
        debugLog('Debug: pca view mode adjusted for method', {
          method,
          rawViewMode,
          requestedViewMode
        });
      }

      let SVDLib = global.SVDJS || globalThis.SVDJS;
      const jStatLib = global.jStat || globalThis.jStat;

      if ((!SVDLib || !SVDLib.SVD) && typeof Shared.lazySvd === 'function') {
        try {
          debugLog('Debug: pca request Shared.lazySvd'); // Debug: request SVD loader
          SVDLib = await Shared.lazySvd();
          if (!isPcaDrawAsyncCurrent(drawToken, drawAsyncState)) {
            logPcaStaleAsyncResult('lazy-svd', drawToken, drawAsyncState);
            return;
          }
        } catch (err) {
          console.error('PCA lazy SVD load failed', err);
        }
      }

      if ((!SVDLib || !SVDLib.SVD) && (global.SVDJS?.SVD || globalThis.SVDJS?.SVD)) {
        SVDLib = global.SVDJS || globalThis.SVDJS;
      }

      if (SVDLib && SVDLib.SVD) {
        debugLog('Debug: pca svd available', {
          viaLazy: typeof Shared.lazySvd === 'function'
        }); // Debug: SVD ready for computations
      }

      if (!SVDLib || !SVDLib.SVD || !jStatLib) {
        console.error('PCA dependencies missing');
        if (pcaPlotDiv) {
          pcaPlotDiv.innerHTML = '<i>PCA dependencies missing.</i>';
        }
        resetStatsPanel('');
        updateAxisSelectOptions({
          dimensionMeta: [],
          viewMode: requestedViewMode,
          method
        });
        return;
      }
      // Statistics are analysis-owned state. View-only redraws (including
      // switching between 2D and 3D, rotating, resizing, and styling) reuse the
      // existing analysis and must not clear either its DOM projection or its
      // owner-session results state. The previous unconditional reset happened
      // before the later refreshStats guard, so the guard could not preserve the
      // statistics panel.
      if (refreshStats) {
        resetStatsPanel();
        clearPcaResultsState(drawSession, {
          mirrorActive: true
        });
      }
      statsSummaryLines = [];
      eigenSummaryData = [];
      screeData = [];
      statsMethod = null;
      dimensionMeta = [];

      const fill = controls.fill;
      const borderWidthRaw = Number(controls.borderWidth);
      const borderColor = controls.border;
      const drawableFrame = resolvePcaDrawableFrame(pcaPlotDiv);
      const fontInfo = chartStyle.resolveScaledFontSize({
        rawSize: controls.fontSize,
        width: drawableFrame.width,
        height: drawableFrame.height,
        svgBox: pcaSvgBox,
        input: pcaFontSize
      });
      const fs = fontInfo.scaledPx;
      const styleScaleInfo = fontInfo.scaleInfo;
      const axisSettings = ensureAxisSettings();
      const axisStrokeWidthBase = axisSettings.strokeWidth;
      const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, {
        context: 'pca-axis',
        min: 0,
        exact: true
      });
      const axisStroke = axisSettings.color || '#000';
      const pcaThemeDark = String(pcaState.theme?.colorScheme || '').toLowerCase() === 'dark';
      const pcaThemeTextColor = normalizePcaThemeColor(
        pcaState.theme?.textColor,
        pcaThemeDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000')
      );
      const dotSizeRaw = Number(controls.dotSize) || 3;
      const dotSizePx = chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, {
        context: 'pca-point',
        min: 0
      });
      const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, {
        context: 'pca-border',
        min: 0
      });
      debugLog('Debug: pca style scaling applied', {
        dotSizeRaw,
        dotSizePx,
        borderWidthRaw,
        borderWidthPx,
        axisStrokeWidth,
        styleScale: styleScaleInfo?.styleScale
      }); // Debug: pca style scaling summary
      chartStyle.renderFontSizeLabel({
        element: pcaFontSizeVal,
        fontInfo,
        input: pcaFontSize
      });
      debugLog('Debug: pca font scaling applied', {
        input: controls.fontSize,
        fontSizePt: fontInfo.pt,
        baseFontPx: fontInfo.px,
        scaledFontPx: fs,
        scale: styleScaleInfo?.styleScale || styleScaleInfo?.scale,
        containerWidth: drawableFrame.width,
        containerHeight: drawableFrame.height
      });
      const axisMetrics = chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo);
      debugLog('Debug: pca axis metrics', axisMetrics);

      const showGrid = !!controls.showGrid;
      const gridStyleBase = getGridStyle(axisStrokeWidthBase);
      const gridStrokeStyle = Object.assign({}, gridStyleBase, {
        thickness: chartStyle.scaleStrokeWidth(gridStyleBase.thickness, styleScaleInfo, {
          context: 'pca-grid',
          min: 0
        })
      });
      const gridDash = (gridControls && typeof gridControls.patternToDasharray === 'function') ?
        gridControls.patternToDasharray(gridStrokeStyle.pattern, gridStrokeStyle.thickness) :
        null;
      const gridOpacity = (gridControls && typeof gridControls.transparencyToOpacity === 'function') ?
        gridControls.transparencyToOpacity(gridStrokeStyle.transparency) :
        1;
      const gridStrokeAttrs = (gridControls && typeof gridControls.getStrokeAttributes === 'function') ?
        gridControls.getStrokeAttributes(gridStrokeStyle, {
          fallbackColor: DEFAULT_GRID_COLOR,
          fallbackThickness: axisStrokeWidth
        }) :
        {
          stroke: DEFAULT_GRID_COLOR,
          'stroke-width': axisStrokeWidth
        };
      const showFrame = !!controls.showFrame;
      debugLog('Debug: pca showFrame state', {
        showFrame
      });
       // retain original reference for downstream logs
      const preprocessingModeForDraw = sanitizePcaPreprocessingMode(controls.preprocessing);
      const standardizeVariables = preprocessingModeForDraw === PCA_PREPROCESSING_RNASEQ_LOG ? false : !!controls.standardizeVariables;
      debugLog('Debug: pca preprocessing standardization state', {
        standardizeVariables
      });
      if (usingCache) {
        const cached = cachedAnalysisPayload || getPcaAnalysisCache(drawSession);
        if (cached) {
          if (typeof cached.method === 'string') {
            method = cached.method;
            methodSnapshot = cached.method;
          }
          statsSummaryLines = Array.isArray(cached.statsSummaryLines) ? cached.statsSummaryLines : [];
          screeData = Array.isArray(cached.screeData) ? cached.screeData : [];
          componentSelectionSummary = cloneSimple(cached.componentSelectionSummary) || null;
          parallelAnalysisPercent = Array.isArray(cached.parallelAnalysisPercent) ? cached.parallelAnalysisPercent : [];
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
          preprocessingMetadata = cloneSimple(cached.preprocessingMetadata) || null;
          sampleCountSnapshot = Number(cached.sampleCount) || points.length;
          featureCountSnapshot = Number(cached.featureCount) || 0;
          if (cached.axisIndices && typeof cached.axisIndices === 'object') {
            axisIndices = {
              x: Number.isFinite(cached.axisIndices.x) ? Number(cached.axisIndices.x) : 0,
              y: Number.isFinite(cached.axisIndices.y) ? Number(cached.axisIndices.y) : 1,
              z: Number.isFinite(cached.axisIndices.z) ? Number(cached.axisIndices.z) : null
            };
          }
          if (typeof cached.pcaXLabelText === 'string') {
            pcaXLabelText = cached.pcaXLabelText;
          }
          if (typeof cached.pcaYLabelText === 'string') {
            pcaYLabelText = cached.pcaYLabelText;
          }
          if (typeof cached.pcaZLabelText === 'string') {
            pcaZLabelText = cached.pcaZLabelText;
          }
          if (cached.signatures && typeof cached.signatures === 'object') {
            analysisSignatures = {
              data: typeof cached.signatures.data === 'string' ? cached.signatures.data : null,
              settings: typeof cached.signatures.settings === 'string' ? cached.signatures.settings : null
            };
          }
          if (cached.statsSnapshot) {
            currentPcaStats = cloneSimple(cached.statsSnapshot) || null;
            setPcaStatsSnapshot(cached.statsSnapshot, drawSession, {
              dataSignature: analysisSignatures?.data || null,
              settingsSignature: analysisSignatures?.settings || null,
              mirrorActive: true
            });
          }
          if (viewOnly) {
            parseEnd = totalStart;
            computeStart = totalStart;
            computeEnd = totalStart;
          }
        }
      } else {
        const hot = ensurePcaHotForActiveTab();
        const activeDataView = hot?.__pcaDataViewsManager?.getActiveView?.() || null;
        const analysis = hot?.getAnalysisData?.() || Shared.hot.getAnalysisData(hot);
        const data = Array.isArray(analysis?.data) ? analysis.data : (hot?.getData?.() || []);
        const labelRowIndex = resolvePcaLabelRowIndex(data);
        const headerRowIndex = resolvePcaHeaderRowIndex(data, labelRowIndex);
        const labelRow = Number.isInteger(labelRowIndex) ? (Array.isArray(data[labelRowIndex]) ? data[labelRowIndex] : []) : [];
        const groupHeaderRow = (pcaState.tableFormat === 'grouped' && Array.isArray(data[PCA_GROUP_ROW_INDEX])) ?
          data[PCA_GROUP_ROW_INDEX] :
          [];
        const dataStartRow = resolvePcaDataStartRow(labelRowIndex, headerRowIndex);
        const headerRow = Number.isInteger(headerRowIndex) && Array.isArray(data[headerRowIndex]) ? data[headerRowIndex] : [];
        const candidateColCount = Math.max(Number(analysis?.colCount) || 0, headerRow.length);
        const numericColIndices = [];
        debugLog('Debug: pca analysis snapshot', {
          rowCount: Number(analysis?.rowCount) || data.length,
          colCount: candidateColCount,
          excludedRows: analysis?.excluded?.rows?.length || 0,
          excludedCols: analysis?.excluded?.cols?.length || 0,
          excludedCells: analysis?.excluded?.cells?.length || 0
        });
        for (let c = 1; c < candidateColCount; c++) {
          if (analysis.isColumnExcluded?.(c)) {
            debugLog('Debug: pca numeric column skipped due to exclusion', {
              colIndex: c
            });
            continue;
          }
          const headerRaw = headerRow[c];
          const headerText = typeof headerRaw === 'string' ? headerRaw.trim() : '';
          let hasNumericData = headerText.length > 0;
          if (!hasNumericData) {
            for (let r = dataStartRow; r < data.length; r++) {
              if (analysis.isRowExcluded?.(r)) {
                continue;
              }
              if (analysis.isCellExcluded?.(r, c)) {
                continue;
              }
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
        if (Number.isInteger(labelRowIndex)) {
          manualLabelFlags = numericColIndices.map(colIndex => parsePcaPointLabelFlag(labelRow?.[colIndex]));
          const flaggedCount = manualLabelFlags.filter(Boolean).length;
          debugLog('Debug: pca label row detected', {
            labelRowIndex,
            flaggedCount,
            columns: manualLabelFlags.length
          });
        } else {
          manualLabelFlags = new Array(numericColIndices.length).fill(false);
        }
        const matrixByCondition = Array.from({
          length: conditionLabels.length
        }, () => []);
        const featureLabelsAccumulator = [];

        for (let r = dataStartRow; r < data.length; r++) {
          if (analysis.isRowExcluded?.(r)) {
            debugLog('Debug: pca row skipped due to exclusion', {
              rowIndex: r
            });
            continue;
          }
          const row = data[r];
          if (!row) continue;
          const rowHasContent = row.some(cell => cell !== null && typeof cell !== 'undefined' && String(cell).trim() !== '');
          if (!rowHasContent) {
            continue;
          }

          const lab = row[0] ? String(row[0]).trim() : '';
          const featureIndex = featureLabelsAccumulator.length;
          const resolvedFeatureLabel = lab || `Var ${featureIndex + 1}`;
          const vals = [];
          let rowValid = true;

          for (let i = 0; i < numericColIndices.length; i++) {
            const colIndex = numericColIndices[i];
            if (analysis.isCellExcluded?.(r, colIndex)) {
              rowValid = false;
              debugLog('Debug: pca row skipped due to excluded cell', {
                rowIndex: r,
                colIndex
              });
              break;
            }
            const cell = row[colIndex];
            if (cell === null || typeof cell === 'undefined' || (typeof cell === 'string' && cell.trim() === '')) {
              rowValid = false;
              debugLog('Debug: pca row skipped due to blank cell', {
                rowIndex: r,
                colIndex
              });
              break;
            }
            const v = parseFloat(cell);
            if (!Number.isFinite(v)) {
              rowValid = false;
              debugLog('Debug: pca row skipped due to NaN', {
                rowIndex: r,
                colIndex,
                cell
              });
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
          if (typeof Shared.renderPlotNotice === 'function') {
            Shared.renderPlotNotice(pcaPlotDiv, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, {
              resetAspect: true,
              show: true
            });
          } else {
            pcaPlotDiv.innerHTML = '<i>Add data to the input table to generate a plot.</i>';
          }
          resetStatsPanel();
          updateAxisSelectOptions({
            dimensionMeta: [],
            viewMode: requestedViewMode,
            method
          });
          return;
        }

        const matrix = matrixByCondition;
        let featureLabels = featureLabelsAccumulator;

        debugLog('Debug: pca dataset summary', {
          conditionCount: labels.length,
          featureCount: featureLabels.length,
        });

        if (labels.length < 2) {
          if (typeof Shared.renderPlotNotice === 'function') {
            Shared.renderPlotNotice(pcaPlotDiv, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, {
              resetAspect: true,
              show: true
            });
          } else {
            pcaPlotDiv.innerHTML = '<i>Add data to the input table to generate a plot.</i>';
          }
          resetStatsPanel();
          updateAxisSelectOptions({
            dimensionMeta: [],
            viewMode: requestedViewMode,
            method
          });
          return;
        }

        if (featureLabels.length < 2 || !matrix[0] || matrix[0].length < 2) {
          if (typeof Shared.renderPlotNotice === 'function') {
            Shared.renderPlotNotice(pcaPlotDiv, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, {
              resetAspect: true,
              show: true
            });
          } else {
            pcaPlotDiv.innerHTML = '<i>Add data to the input table to generate a plot.</i>';
          }
          resetStatsPanel();
          updateAxisSelectOptions({
            dimensionMeta: [],
            viewMode: requestedViewMode,
            method
          });
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
        debugLog('Debug: pca stats outputs configured', {
          method,
          statsOutputsEnabled
        });
        if (isPcaRnaSeqDataView(activeDataView)) {
          preprocessingMetadata = cloneSimple(activeDataView?.summary?.preprocessingMetadata) || null;
        }
        const nSamples = matrix.length;
        const nFeatures = matrix[0].length;
        sampleCountSnapshot = nSamples;
        featureCountSnapshot = nFeatures;
        analysisSignatures = buildPcaAnalysisSignatures({
          method,
          matrix,
          labels,
          controls,
          nSamples,
          nFeatures
        });

        for (let j = 0; j < nFeatures; j++) {
          const col = matrix.map((r) => r[j]);
          const mean = jStatLib.mean(col);
          const sd = jStatLib.stdev(col, true);

          for (let i = 0; i < nSamples; i++) {
            let val = matrix[i][j] - mean;
            if (standardizeVariables && sd > 0) {
              val /= sd;
            }
            matrix[i][j] = val;
          }
        }

        if (parseEnd === null) {
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
        if (pcaState.tableFormat === 'grouped') {
          updatePcaGroupedHeaders(hot);
        }
        points3d = [];
        axisIndices = {
          x: 0,
          y: 1,
          z: null
        };

        if (method === 'mds') {
          if (computeStart === null) {
            computeStart = nowMs();
          }
          console.debug('Debug: mds branch entered', {
            method
          }); // Debug: MDS execution path
          let mdsWorkerResult = null;
          if (shouldUsePcaEmbedWorker('mds', nSamples, nFeatures)) {
            mdsWorkerResult = await runPcaEmbedWorker('mds', {
              matrix
            }, {
              session: drawSession,
              drawToken,
              tabId: drawSession?.tabId || null,
              dataSignature: analysisSignatures?.data || null,
              settingsSignature: analysisSignatures?.settings || null
            });
            if (!isPcaDrawAsyncCurrent(drawToken, drawAsyncState)) {
              logPcaStaleAsyncResult('embed-worker', drawToken, drawAsyncState);
              return;
            }
          }
          if (mdsWorkerResult && Array.isArray(mdsWorkerResult.coords)) {
            const coords = mdsWorkerResult.coords;
            const dimsToUse = Number(mdsWorkerResult.dimsToUse) || 0;
            const totalPositive = Number(mdsWorkerResult.totalPositive) || 0;
            eigenSummaryData = Array.isArray(mdsWorkerResult.eigenSummary) ? mdsWorkerResult.eigenSummary.slice() : [];
            if (dimsToUse === 0) {
              pcaPlotDiv.innerHTML = '<i>MDS could not find positive eigenvalues.</i>';
              resetStatsPanel();
              updateAxisSelectOptions({
                dimensionMeta: [],
                viewMode: requestedViewMode,
                method
              });
              return;
            }
            dimensionMeta = eigenSummaryData.map(entry => ({
              value: entry.component,
              label: entry.componentLabel || `Dim${entry.component}`,
              variancePercent: entry.variancePercent
            }));
            updateAxisSelectOptions({
              dimensionMeta,
              viewMode: requestedViewMode,
              method
            });
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
            if (zMeta || dimensionMeta.length >= 3) {
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
            currentPcaStats = {
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
            if (computeEnd === null) {
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
            console.debug('Debug: mds double centered matrix ready', {
              size: B.length
            });

            const mdsSvd = SVDLib.SVD(B);
            console.debug('Debug: mds svd result', mdsSvd);

            const eigenValues = mdsSvd.q.map((val) => val);
            const positiveEigen = eigenValues
              .map((val, idx) => ({
                val,
                idx
              }))
              .filter(({
                val
              }) => val > 1e-9);
            const dimsAvailable = positiveEigen.length;
            // Classical MDS already pays the full eigendecomposition cost here.
            // Retain enough coordinates for every supported view so 2D <-> 3D is
            // a projection-only change, matching PCA's cached-score contract.
            const dimsToUse = Math.min(MDS_CACHED_DIMENSIONS, dimsAvailable);
            console.debug('Debug: mds eigen summary', {
              eigenValues,
              dimsAvailable,
              dimsToUse,
              requestedViewMode
            });

            if (dimsToUse === 0) {
              pcaPlotDiv.innerHTML = '<i>MDS could not find positive eigenvalues.</i>';
              resetStatsPanel();
              updateAxisSelectOptions({
                dimensionMeta: [],
                viewMode: requestedViewMode,
                method
              });
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

            const totalPositive = positiveEigen.reduce((sum, {
              val
            }) => sum + val, 0);
            dimensionMeta = [];
            let cumulativeRatio = 0;
            eigenSummaryData = [];
            for (let dim = 0; dim < dimsToUse; dim++) {
              const eigenVal = positiveEigen[dim]?.val ?? 0;
              const ratio = totalPositive > 0 ? eigenVal / totalPositive : 0;
              cumulativeRatio += ratio;
              const pct = ratio * 100;
              const cumulativePercent = Math.min(100, cumulativeRatio * 100);
              dimensionMeta.push({
                value: dim + 1,
                label: `MDS${dim + 1}`,
                variancePercent: pct
              });
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
            updateAxisSelectOptions({
              dimensionMeta,
              viewMode: requestedViewMode,
              method
            });
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
            if (zMeta || dimensionMeta.length >= 3) {
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
            currentPcaStats = {
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
            console.debug('Debug: mds stress computed', {
              stress,
              dimsToUse
            });
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
              console.debug('Debug: mds 3d coordinates prepared', {
                count: points3d.length,
                dimsToUse,
                axisIndices
              });
            } else {
              points3d = [];
              console.debug('Debug: mds 3d coordinates skipped', {
                dimsToUse,
                axisIndices
              });
            }
            if (computeEnd === null) {
              computeEnd = nowMs();
            }
          }
        } else if (method === 'tsne') {
          console.debug('Debug: tsne branch entered', {
            nSamples
          });
          const maxPerplexity = Math.max(2, nSamples - 1);
          const minPerplexity = Math.max(1, Math.min(5, maxPerplexity));
          const tsnePerplexity = clampNumber(pcaTsnePerplexity?.value ?? DEFAULT_TSNE_SETTINGS.perplexity, minPerplexity, maxPerplexity, DEFAULT_TSNE_SETTINGS.perplexity);
          const tsneLearningRate = clampNumber(pcaTsneLearningRate?.value ?? DEFAULT_TSNE_SETTINGS.learningRate, 10, 2000, DEFAULT_TSNE_SETTINGS.learningRate);
          const tsneIterations = Math.round(clampNumber(pcaTsneIterations?.value ?? DEFAULT_TSNE_SETTINGS.iterations, 200, 3000, DEFAULT_TSNE_SETTINGS.iterations));
          const tsneExaggeration = clampNumber(pcaTsneExaggeration?.value ?? DEFAULT_TSNE_SETTINGS.earlyExaggeration, 1, 50, DEFAULT_TSNE_SETTINGS.earlyExaggeration);
          if (computeStart === null) {
            computeStart = nowMs();
          }
          let tsneResult = null;
          if (shouldUsePcaEmbedWorker('tsne', nSamples, nFeatures)) {
            tsneResult = await runPcaEmbedWorker('tsne', {
              matrix,
              settings: {
                outputDims: 2,
                perplexity: tsnePerplexity,
                learningRate: tsneLearningRate,
                iterations: tsneIterations,
                earlyExaggeration: tsneExaggeration
              }
            }, {
              session: drawSession,
              drawToken,
              tabId: drawSession?.tabId || null,
              dataSignature: analysisSignatures?.data || null,
              settingsSignature: analysisSignatures?.settings || null
            });
            if (!isPcaDrawAsyncCurrent(drawToken, drawAsyncState)) {
              logPcaStaleAsyncResult('embed-worker', drawToken, drawAsyncState);
              return;
            }
          }
          if (!tsneResult) {
            tsneResult = computeTsneEmbedding(matrix, {
              outputDims: 2,
              perplexity: tsnePerplexity,
              learningRate: tsneLearningRate,
              iterations: tsneIterations,
              earlyExaggeration: tsneExaggeration,
              SVDLib
            });
          }
          if (computeEnd === null) {
            computeEnd = nowMs();
          }
          dimensionMeta = [{
            value: 1,
            label: 't-SNE 1',
            variancePercent: Number.NaN
          }, {
            value: 2,
            label: 't-SNE 2',
            variancePercent: Number.NaN
          }];
          updateAxisSelectOptions({
            dimensionMeta,
            viewMode: '2d',
            method
          });
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
          currentPcaStats = {
            method: 'tsne',
            perplexity: Number(tsneResult.perplexity),
            iterations: Number(tsneResult.iterations),
            learningRate: Number(tsneResult.learningRate),
            earlyExaggeration: Number(tsneResult.earlyExaggeration),
            klDivergence: Number(tsneResult.klDivergence.toFixed(6)),
            summaryLines: statsSummaryLines.slice()
          };
          console.debug('Debug: tsne embedding complete', {
            stats: currentPcaStats,
            pointCount: points.length
          });
        } else if (method === 'umap') {
          console.debug('Debug: umap branch entered', {
            nSamples
          });
          if (computeStart === null) {
            computeStart = nowMs();
          }
          const umapNeighbors = Math.round(clampNumber(pcaUmapNeighbors?.value ?? DEFAULT_UMAP_SETTINGS.neighbors, 2, Math.max(2, nSamples - 1), DEFAULT_UMAP_SETTINGS.neighbors));
          const umapMinDist = clampNumber(pcaUmapMinDist?.value ?? DEFAULT_UMAP_SETTINGS.minDist, 0, 0.99, DEFAULT_UMAP_SETTINGS.minDist);
          const umapLearningRate = clampNumber(pcaUmapLearningRate?.value ?? DEFAULT_UMAP_SETTINGS.learningRate, 0.01, 10, DEFAULT_UMAP_SETTINGS.learningRate);
          const umapEpochs = Math.round(clampNumber(pcaUmapEpochs?.value ?? DEFAULT_UMAP_SETTINGS.epochs, 50, 5000, DEFAULT_UMAP_SETTINGS.epochs));
          let umapResult = null;
          if (shouldUsePcaEmbedWorker('umap', nSamples, nFeatures)) {
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
            }, {
              session: drawSession,
              drawToken,
              tabId: drawSession?.tabId || null,
              dataSignature: analysisSignatures?.data || null,
              settingsSignature: analysisSignatures?.settings || null
            });
            if (!isPcaDrawAsyncCurrent(drawToken, drawAsyncState)) {
              logPcaStaleAsyncResult('embed-worker', drawToken, drawAsyncState);
              return;
            }
          }
          if (!umapResult) {
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
          if (computeEnd === null) {
            computeEnd = nowMs();
          }
          dimensionMeta = [{
            value: 1,
            label: 'UMAP 1',
            variancePercent: Number.NaN
          }, {
            value: 2,
            label: 'UMAP 2',
            variancePercent: Number.NaN
          }];
          updateAxisSelectOptions({
            dimensionMeta,
            viewMode: '2d',
            method
          });
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
          currentPcaStats = {
            method: 'umap',
            neighbors: Number(umapResult.neighbors),
            epochs: Number(umapResult.epochs),
            minDist: Number(umapResult.minDist.toFixed(4)),
            learningRate: Number(umapResult.learningRate),
            negativeSampleRate: Number(umapResult.negativeSampleRate),
            summaryLines: statsSummaryLines.slice()
          };
          console.debug('Debug: umap embedding complete', {
            stats: currentPcaStats,
            pointCount: points.length
          });
        } else {
          // Ensure SVD works even if samples < features
          let useFactor = 'u'; // when SVD is done on X directly, scores = U * S
          const useTransposed = nSamples < nFeatures;
          if (useTransposed) {
            // Use SVD(X^T) so that m >= n for the library
            // For SVD(X^T) = V * S * U^T, the sample scores are V * S
            useFactor = 'v';
            debugLog('Debug: PCA SVD uses transposed matrix to satisfy m>=n', {
              nSamples,
              nFeatures,
              svdOn: 'X^T'
            });
          } else {
            debugLog('Debug: PCA SVD uses direct matrix X', {
              nSamples,
              nFeatures,
              svdOn: 'X'
            });
          }

          let svd = null;
          if (computeStart === null) {
            computeStart = nowMs();
          }
          if (shouldUsePcaSvdWorker(nSamples, nFeatures)) {
            const workerResult = await runPcaSvdWorker(matrix, nSamples, nFeatures, {
              session: drawSession,
              drawToken,
              tabId: drawSession?.tabId || null,
              dataSignature: analysisSignatures?.data || null,
              settingsSignature: analysisSignatures?.settings || null
            });
            if (!isPcaDrawAsyncCurrent(drawToken, drawAsyncState)) {
              logPcaStaleAsyncResult('svd-worker', drawToken, drawAsyncState);
              return;
            }
            if (workerResult && Array.isArray(workerResult.q) && Array.isArray(workerResult.u) && Array.isArray(workerResult.v)) {
              svd = {
                q: workerResult.q,
                u: workerResult.u,
                v: workerResult.v
              };
              if (typeof workerResult.useFactor === 'string') {
                useFactor = workerResult.useFactor;
              }
              debugLog('Debug: pca worker svd applied', {
                nSamples,
                nFeatures
              });
            }
          }
          if (!svd) {
            let matrixForSvd = matrix;
            if (useTransposed) {
              matrixForSvd = transposePcaMatrix(matrix);
            }
            svd = SVDLib.SVD(matrixForSvd);
          }
          if (computeEnd === null) {
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
            .sort((a, b) => b[0] - a[0]) // descending by singular value
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
          console.debug('pca scores', {
            n: scores.length,
            dims: svd.q.length,
            sample0: scores[0]
          });

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
            SVDLib, {
              rule: pcaState.componentSelection?.rule,
              eigenThreshold: pcaState.componentSelection?.eigenThreshold,
              parallelIterations: pcaState.componentSelection?.parallelIterations,
              standardized: standardizeVariables
            }
          );
          parallelAnalysisPercent = Array.isArray(componentSelectionSummary?.parallelAnalysis?.averageEigenvalues) ?
            componentSelectionSummary.parallelAnalysis.averageEigenvalues.map(value => {
              const numeric = Number(value) || 0;
              return safeTotal > 0 ? (numeric / safeTotal) * 100 : 0;
            }) :
            [];
          statsSummaryLines = [
            `Samples analysed: ${nSamples}`,
            `Variables analysed: ${nFeatures}`,
            `Top two PCs capture ${topTwoCumulative.toFixed(1)}% of variance`,
            componentSelectionSummary ?
            `${componentSelectionSummary.ruleLabel} retains ${componentSelectionSummary.retainedCount} component${componentSelectionSummary.retainedCount === 1 ? '' : 's'}` :
            null
          ].filter(Boolean);
          const fullDimensionMeta = eigenSummaryData.map(entry => ({
            value: entry.component,
            label: `PC${entry.component}`,
            variancePercent: entry.variancePercent
          }));
          dimensionMeta = resolvePcaAxisDimensionMeta(fullDimensionMeta, componentSelectionSummary);
          debugLog('Debug: pca axis dimension retention applied', {
            includeNonRetained: sanitizePcaIncludeNonRetainedAxes(pcaState.componentSelection?.includeNonRetainedAxes),
            retainedCount: Number.isFinite(Number(componentSelectionSummary?.retainedCount)) ? Number(componentSelectionSummary.retainedCount) : null,
            available: fullDimensionMeta.length,
            axisOptions: dimensionMeta.length
          });
          updateAxisSelectOptions({
            dimensionMeta,
            viewMode: requestedViewMode,
            method
          });
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
            debugLog('Debug: pca 3d scores prepared', {
              count: points3d.length,
              components: svd.q.length,
              selection: axisIndices
            });
          } else {
            points3d = [];
            debugLog('Debug: pca 3d scores skipped', {
              components: svd.q.length,
              selection: axisIndices
            });
          }
          if (svd.v && Array.isArray(svd.v)) {
            const componentCount = Array.isArray(svd.v[0]) ? Math.min(svd.v[0].length, svd.q.length) : Math.min(svd.v.length, svd.q.length);
            loadingsComponents = componentCount;
            const safeFeatureLabels = featureLabels.length ?
              featureLabels :
              Array.from({
                length: matrix[0]?.length || 0
              }, (_, idx) => `Var ${idx + 1}`);
            loadingsTotalCount = safeFeatureLabels.length;
            const loadingsLimit = Math.min(PCA_LOADINGS_ROW_LIMIT, loadingsTotalCount);
            const loadingRankAxes = [axisIndices.x, axisIndices.y]
              .filter(compIdx => Number.isInteger(compIdx) && compIdx >= 0 && compIdx < componentCount);
            const scoredFeatures = [];
            for (let featureIdx = 0; featureIdx < loadingsTotalCount; featureIdx += 1) {
              const basis = Array.isArray(svd.v?.[featureIdx]) ? svd.v[featureIdx] : null;
              let score = 0;
              if (basis) {
                for (const compIdx of loadingRankAxes) {
                  const raw = basis?.[compIdx] ?? 0;
                  const magnitude = Math.abs(raw);
                  if (magnitude > score) {
                    score = magnitude;
                  }
                }
              }
              scoredFeatures.push({
                index: featureIdx,
                score
              });
            }
            scoredFeatures.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
            const selected = scoredFeatures.slice(0, loadingsLimit);
            loadingsTruncated = loadingsTotalCount > loadingsLimit;
            loadingsRows = selected.map(({
              index
            }) => {
              const label = safeFeatureLabels[index] || `Var ${index + 1}`;
              const values = [];
              for (let compIdx = 0; compIdx < componentCount; compIdx += 1) {
                const raw = svd.v?.[index]?.[compIdx] ?? 0;
                values.push(raw);
              }
              return {
                label,
                values
              };
            });
            debugLog('Debug: pca loadings computed', {
              featureCount: loadingsRows.length,
              componentCount,
              truncated: loadingsTruncated,
              total: loadingsTotalCount
            });
          } else {
            debugLog('Debug: pca loadings skipped', {
              hasV: !!svd.v
            });
          }
          const biplotSnapshot = buildPcaBiplotSnapshot(points, loadingsRows, {
            x: pcaXLabelText,
            y: pcaYLabelText
          }, axisIndices);
          currentPcaStats = {
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
          debugLog('Debug: pca eigen summary prepared', {
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
            preprocessingMetadata,
            axisIndices,
            pcaXLabelText,
            pcaYLabelText,
            pcaZLabelText,
            biplotSnapshot,
            parseEnd,
            computeStart,
            computeEnd,
            signatures: analysisSignatures,
            statsSnapshot: currentPcaStats
          };
        }
      }

      if (!cachePayload && !usingCache) {
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
          preprocessingMetadata,
          axisIndices,
          pcaXLabelText,
          pcaYLabelText,
          pcaZLabelText,
          biplotSnapshot: null,
          parseEnd,
          computeStart,
          computeEnd,
          signatures: analysisSignatures,
          statsSnapshot: currentPcaStats
        };
      }

      if (usingCache) {
        groupMeta = resolvePcaGroupMeta(points.length, labels, {
          columnIndices: sampleColumnIndices,
          groupHeaderRow: groupedHeaderRowCache
        });
      }

      if (usingCache) {
        if (parseEnd === null) {
          parseEnd = totalStart;
        }
        if (computeStart === null) {
          computeStart = totalStart;
        }
        if (computeEnd === null) {
          computeEnd = totalStart;
        }
      }

      if (currentPcaStats) {
        setPcaResultsState({
          method: normalizePcaResultsMethod(currentPcaStats.method || method),
          stats: currentPcaStats,
          statsPanel: getPcaResultsState(drawSession).statsPanel || {},
          summaryLines: statsSummaryLines,
          eigenSummary: eigenSummaryData,
          scree: screeData,
          selectionSummary: componentSelectionSummary,
          parallelAnalysis: parallelAnalysisPercent,
          supplemental: {
            biplot: cachePayload?.biplotSnapshot || currentPcaStats.biplot || null,
            loadings: {
              rows: loadingsRows,
              components: loadingsComponents,
              totalCount: loadingsTotalCount,
              truncated: loadingsTruncated
            }
          },
          signatures: analysisSignatures
        }, drawSession, {
          mirrorActive: true
        });
      }

      ensurePcaLabelStyles(labels, groupMeta);

      let effectiveViewMode = requestedViewMode;
      if (effectiveViewMode === '3d' && !points3d.length) {
        debugLog('Debug: pca 3d fallback triggered', {
          method,
          pointCount: points3d.length
        });
        effectiveViewMode = '2d';
      }
      if (refreshStats) {
        updateLoadingsTable({
          rows: loadingsRows,
          components: loadingsComponents,
          method,
          viewMode: effectiveViewMode,
          totalCount: loadingsTotalCount
        });
      }

      const legendEntries = [];
      if (showLegend) {
        if (groupMeta && Array.isArray(groupMeta.entries)) {
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
            if (!lab || seenLabels.has(lab)) {
              return;
            }
            seenLabels.add(lab);
            const labelStyle = ensurePcaPointStyleScopes().points?.[pcaLabelPointStyleKey(lab)] || {};
            const shape = labelStyle.shape || 'circle';
            legendEntries.push({
              key: `label-${lab}`,
              label: lab,
              color: labelStyle.fill || DEFAULT_SCATTER_COLORS[legendEntries.length % DEFAULT_SCATTER_COLORS.length],
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
        shape: entry.shape,
        editable: true
      }));
      const legendLayout = chartStyle.computeLegendLayout({
        entries: legendMeasureEntries,
        fontSize: fs,
        viewportHeight: drawableFrame.height,
        scaleInfo: styleScaleInfo,
        strokeWidth: borderWidthPx,
        textColor: pcaThemeTextColor,
        onSwatchClick: ({
          event,
          swatch,
          index
        }) => {
          const legendEntry = Number.isInteger(index) ? legendEntries[index] : null;
          if (!legendEntry || !swatch) {
            return;
          }
          if (event) {
            event.stopPropagation();
          }
          handleLegendColorChange(legendEntry, swatch);
        }
      });
      const legendRenderer = legendLayout.renderer || {
        entries: [],
        rowGap: 0,
        swatchSize: 0,
        swatchGap: 0,
        baselineOffset: 0
      };
      const legendVisible = showLegend && legendRenderer.entries.length > 0;
      const legendWidth = legendVisible ? legendLayout.legendWidthForMargin : 0;
      const legendAxisGap = Math.max(fs * 0.9, 18);
      const appliedLegendAxisGap = legendVisible ? legendAxisGap : 0;
      const effectiveLegendWidth = legendWidth + appliedLegendAxisGap;
      debugLog('Debug: pca legend layout metrics', {
        legendWidth,
        legendGap: legendLayout.legendGapPx,
        legendCount: legendRenderer.entries.length,
        legendAxisGap,
        appliedLegendAxisGap,
        legendVisible,
        effectiveLegendWidth
      });

      const plotEl = getPcaNodeById('pcaPlot');
      if (!plotEl) {
        updatePcaRenderRuntime(drawSession, runtime => {
          runtime.viewDirty = true;
        });
        debugLog('Debug: pca draw skipped because plot root is not mounted', {
          reason: drawOpts.reason || 'draw',
          tabId: drawSession?.tabId || null
        });
        return;
      }
      plotEl.style.display = 'block';
      const existingSvg = plotEl.querySelector('#pcaSvg');
      const reuse3dSvg = drawOpts.reason === 'rotation'
        && effectiveViewMode === '3d'
        && existingSvg
        && existingSvg.dataset.viewMode === '3d';

      if (refreshStats) {
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
          biplot: method === 'pca' ? buildPcaBiplotSnapshot(points, loadingsRows, {
            x: pcaXLabelText,
            y: pcaYLabelText
          }, axisIndices) : null
        });
      }

      if (effectiveViewMode === '3d') {
        Shared.cartesianLayout?.clearPublishedLayout?.(pcaSvgBox, {
          tabId: drawTabId || null,
          component: 'pca'
        });
        if (!points3d.length) {
          plotEl.replaceChildren();
          debugLog('Debug: pca 3d render skipped', {
            reason: 'no-points'
          });
          return;
        }
        const targetAspect = Number.isFinite(PCA_3D_DEFAULTS.aspectRatio) && PCA_3D_DEFAULTS.aspectRatio > 0 ? PCA_3D_DEFAULTS.aspectRatio : (4 / 3);
        const fallbackWidth = 480;
        const fallbackHeight = Math.round(fallbackWidth / targetAspect);
        const availableWidth = Math.floor(drawableFrame.width || 0);
        const availableHeight = Math.floor(drawableFrame.height || 0);
        let W3 = availableWidth > 0 ? availableWidth : fallbackWidth;
        let H3 = Math.round(W3 / targetAspect);
        if (availableHeight > 0 && H3 > availableHeight) {
          H3 = Math.max(1, availableHeight);
          W3 = Math.max(1, Math.round(H3 * targetAspect));
          if (availableWidth > 0 && W3 > availableWidth) {
            W3 = Math.max(1, availableWidth);
            H3 = Math.max(1, Math.round(W3 / targetAspect));
          }
        }
        if (W3 <= 0 || H3 <= 0) {
          W3 = fallbackWidth;
          H3 = fallbackHeight;
        }
        const baseW3 = W3;
        const legendViewport3d = chartStyle.computeLegendViewport({
          baseWidth: baseW3,
          baseHeight: H3,
          legendWidth: legendVisible ? effectiveLegendWidth : 0
        });
        W3 = legendViewport3d.width;
        plotEl.style.position = 'relative';
        plotEl.style.minHeight = '';
        plotEl.style.aspectRatio = `${W3} / ${H3}`;
        plotEl.style.padding = plotEl.style.padding || '12px';
        debugLog('Debug: pca 3d dimensions resolved', {
          availableWidth,
          availableHeight,
          width: W3,
          height: H3
        }); // Debug: 3d plot sizing diagnostics
        const svg3 = reuse3dSvg && existingSvg ? existingSvg : document.createElementNS(NS, 'svg');
        if (!reuse3dSvg || !existingSvg) {
          svg3.setAttribute('id', 'pcaSvg');
        }
        svg3.addEventListener('mouseleave', handlePcaPlotMouseLeave);
        svg3.setAttribute('width', String(W3));
        svg3.setAttribute('height', String(H3));
        svg3.setAttribute('viewBox', `0 0 ${W3} ${H3}`);
        svg3.setAttribute('font-family', chartStyle.FONT_FAMILY);
      svg3.dataset.viewMode = '3d';
      svg3.dataset.pcaMethod = method;
        chartStyle.prepareSvg(svg3, { scopeId: 'pca' });
        const legendProjection = chartStyle.stageLegendViewport({
          svgBox: pcaSvgBox,
          plot: plotEl,
          svg: svg3,
          baseWidth: baseW3,
          baseHeight: H3,
          legendWidth: legendVisible ? effectiveLegendWidth : 0
        });
        if (!reuse3dSvg) {
          framePublication = Shared.framePublication.stage({
            container: plotEl,
            frame: svg3,
            publishedId: 'pcaSvg',
            component: 'pca',
            tabId: drawTabId,
            canCommit: () => (!drawAsyncState || isPcaDrawAsyncCurrent(drawToken, drawAsyncState))
              && (!drawSession || isPcaSessionActiveForModuleState(drawSession))
          });
        }
        while (svg3.firstChild) {
          svg3.removeChild(svg3.firstChild);
        }
        svg3.style.backgroundColor = pcaThemeDark ?
          normalizePcaThemeColor(pcaState.theme?.backgroundColor, '#000000') :
          '';
        appendPca3dBackground(svg3, W3, H3);
        bindPca3dRotationControls(svg3, 'pca-3d', drawSession);
        const baseLegendMargin = Math.max(fs * 2.25, 28);
        const legendMargin = legendVisible ? legendWidth + appliedLegendAxisGap + baseLegendMargin : baseLegendMargin;
        const margin3 = {
          top: Math.max(fs * 3.2, 36),
          right: legendMargin,
          bottom: Math.max(fs * 3.2, 40),
          left: Math.max(fs * 3.2, 40)
        };
        const legendShiftX = typeof plot3d.resolveLegendShiftX === 'function' ?
          plot3d.resolveLegendShiftX({
            legendVisible,
            margin: margin3,
            fontSize: fs,
            legendWidth
          }) :
          0;
        const plotW3 = Math.max(20, W3 - margin3.left - margin3.right);
        const plotH3 = Math.max(20, H3 - margin3.top - margin3.bottom);
        const rotatePoint = (pt) => plot3d.rotatePoint(pt, pcaState.rotation);
        const rangeForAxis = (axisKey) => {
          const values = points3d.map(pt => pt[axisKey]);
          let min = Math.min(...values);
          let max = Math.max(...values);
          if (!Number.isFinite(min) || !Number.isFinite(max)) {
            min = -1;
            max = 1;
          }
          if (min === max) {
            const pad = Math.abs(min) || 1;
            min -= pad;
            max += pad;
          }
          if (min > 0) {
            min = 0;
          }
          if (max < 0) {
            max = 0;
          }
          return {
            min,
            max
          };
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
        const clampTicks = (ticks, range) => ticks.filter(t => t >= range.min - 1e-9 && t <= range.max + 1e-9);
        const equalAxisLengths3d = !!controls.equalAxisLengths;
        const renderAxisRanges3d = resolvePca3dMetricRanges(axisRanges, equalAxisLengths3d) || axisRanges;
        svg3.dataset.pcaEqualAxisLengths = String(equalAxisLengths3d);
        const renderPoints3d = points3d;
        const axisTickFormatters3d = null;
        const axisScales3d = {
          x: niceScale(renderAxisRanges3d.x.min, renderAxisRanges3d.x.max, 5),
          y: niceScale(renderAxisRanges3d.y.min, renderAxisRanges3d.y.max, 5),
          z: niceScale(renderAxisRanges3d.z.min, renderAxisRanges3d.z.max, 5)
        };
        const axisTicks3d = {
          x: clampTicks(axisScales3d.x.ticks, renderAxisRanges3d.x),
          y: clampTicks(axisScales3d.y.ticks, renderAxisRanges3d.y),
          z: clampTicks(axisScales3d.z.ticks, renderAxisRanges3d.z)
        };
        debugLog('Debug: pca metric axis spans applied (3d)', {
          equalAxisLengths: equalAxisLengths3d,
          axisRanges: renderAxisRanges3d
        });
        Object.keys(renderAxisRanges3d).forEach(axisKey => {
          axisCenters[axisKey] = (renderAxisRanges3d[axisKey].min + renderAxisRanges3d[axisKey].max) / 2;
        });
        const allCorners = [{
          x: renderAxisRanges3d.x.min,
          y: renderAxisRanges3d.y.min,
          z: renderAxisRanges3d.z.min
        }, {
          x: renderAxisRanges3d.x.max,
          y: renderAxisRanges3d.y.min,
          z: renderAxisRanges3d.z.min
        }, {
          x: renderAxisRanges3d.x.min,
          y: renderAxisRanges3d.y.max,
          z: renderAxisRanges3d.z.min
        }, {
          x: renderAxisRanges3d.x.max,
          y: renderAxisRanges3d.y.max,
          z: renderAxisRanges3d.z.min
        }, {
          x: renderAxisRanges3d.x.min,
          y: renderAxisRanges3d.y.min,
          z: renderAxisRanges3d.z.max
        }, {
          x: renderAxisRanges3d.x.max,
          y: renderAxisRanges3d.y.min,
          z: renderAxisRanges3d.z.max
        }, {
          x: renderAxisRanges3d.x.min,
          y: renderAxisRanges3d.y.max,
          z: renderAxisRanges3d.z.max
        }, {
          x: renderAxisRanges3d.x.max,
          y: renderAxisRanges3d.y.max,
          z: renderAxisRanges3d.z.max
        }];
        const add3 = (tag, attrs, text, target) => {
          const el = document.createElementNS(NS, tag);
          Object.keys(attrs || {}).forEach(key => el.setAttribute(key, String(attrs[key])));
          if (text) {
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
        if (labelBounds3d) {
          debugLog('Debug: pca 3d label bounds resolved', {
            minX: labelBounds3d.minX,
            maxX: labelBounds3d.maxX,
            minY: labelBounds3d.minY,
            maxY: labelBounds3d.maxY
          });
        }
        const labelHull3d = Shared.labelLayout && typeof Shared.labelLayout.computeConvexHull2d === 'function' ?
          Shared.labelLayout.computeConvexHull2d(rotatedCorners.map(corner => project3(corner))) :
          null;
        if (labelHull3d && labelHull3d.length >= 3) {
          debugLog('Debug: pca 3d label hull resolved', {
            points: labelHull3d.length
          });
        }
        const axisTicks = axisTicks3d;
        const frontFrameLayer = document.createElementNS(NS, 'g');
        frontFrameLayer.setAttribute('data-layer', 'frame-front');
        svg3.appendChild(frontFrameLayer);
        const pca3dFontStyles = exportFontStyles('pca', { tabId: drawTabId });
        const pca3dTickFontSize = (() => {
          if (!chartStyle || typeof chartStyle.resolveScopedLabelMeasureFont !== 'function') {
            return fs;
          }
          const roles = ['xTick', 'yTick', 'zTick'];
          const sizes = roles.map(role => Number(chartStyle.resolveScopedLabelMeasureFont({
            styles: pca3dFontStyles,
            role,
            fallbackPx: fs
          }).fontSizePx)).filter(size => Number.isFinite(size) && size > 0);
          return sizes.length ? Math.max(...sizes) : fs;
        })();
        plot3d.renderAxesAndGrid({
          svg: svg3,
          project: (pt) => project3(pt),
          rotatePoint,
          axisRanges: renderAxisRanges3d,
          axisTicks,
          axisLabels: {
            x: pcaXLabelText,
            y: pcaYLabelText,
            z: pcaZLabelText
          },
          fontSize: fs,
          tickFontSize: pca3dTickFontSize,
          axisStrokeWidth,
          chartStyle,
          showGrid,
          showFrame,
          axisTickFormatters: axisTickFormatters3d || undefined,
          showPanes: showFrame,
          paneFill: pcaThemeDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.03)',
          paneOpacityRange: pcaThemeDark ? {
            min: 0.10,
            max: 0.22
          } : {
            min: 0.01,
            max: 0.05
          },
          gridColor: gridStrokeStyle.color,
          gridDash: gridDash || undefined,
          gridOpacity,
          gridStrokeWidth: gridStrokeStyle.thickness,
          gridOutlineColors: {
            primary: gridStrokeStyle.color,
            secondary: gridStrokeStyle.color
          },
          frameColor: axisStroke,
          axisColor: axisStroke,
          tickTextColor: pcaThemeTextColor,
          axisLabelColor: pcaThemeTextColor,
          frontFrameTarget: frontFrameLayer,
          debugLabel: 'pca-3d',
          onAxisTickLabel: markPca3dAxisTickLabel,
          onAxisLabel: (el, axisKey, labelText) => {
            markFontEditable(el, 'axis3d', labelText);
          },
          createElement: (tag, attrs, text, target) => add3(tag, attrs, text, target)
        });
        const axisLabelBounds = [];
        let contentRightBound = margin3.left + plotW3;
        if (typeof svg3.querySelectorAll === 'function') {
          const axisLabelNodes = svg3.querySelectorAll('[data-axis-label]');
          for (let idx = 0; idx < axisLabelNodes.length; idx += 1) {
            const node = axisLabelNodes[idx];
            if (!node || typeof node.getBBox !== 'function') {
              continue;
            }
            try {
              const bbox = node.getBBox();
              const bboxValid = Number.isFinite(bbox?.x) && Number.isFinite(bbox?.width) &&
                Number.isFinite(bbox?.y) && Number.isFinite(bbox?.height);
              if (!bboxValid) {
                continue;
              }
              axisLabelBounds.push({
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height
              });
              const right = bbox.x + bbox.width;
              if (Number.isFinite(right)) {
                contentRightBound = Math.max(contentRightBound, right);
              }
            } catch (err) {
              debugLog('Debug: pca axis label bbox error', {
                message: err && err.message
              });
            }
          }
        }
        const defaultTitleY3 = Math.max(fs, margin3.top * 0.5);
        const defaultTitleX3 = margin3.left + plotW3 / 2;
        const titlePos = pcaLabelPositionsState?.title;
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
        bindPcaTitleInlineInteraction(title3d, drawSession);
        plot3d.applyLegendPointerGuards(title3d, {
          label: 'pca-title-3d'
        });
        if (typeof title3d.setAttribute === 'function') {
          title3d.setAttribute('data-graph-title', '1');
        }
        if (typeof Shared.enableLabelDrag === 'function') {
          Shared.enableLabelDrag(title3d, svg3, {
            onDragEnd: pos => {
              // Store both absolute and relative positions for 3D title
              const relX = (pos.x - margin3.left) / plotW3;
              const relY = (pos.y - margin3.top) / plotH3;
              pcaLabelPositionsState = patchPcaLabelPositionsState(drawSession, {
                title: {
                  x: pos.x,
                  y: pos.y,
                  relX,
                  relY
                }
              }, {
                reason: 'pca-3d-title-position'
              });
              if (Shared.isDebugEnabled?.()) {
                console.debug('Debug: pca 3d title position saved', {
                  absolute: pos,
                  relative: {
                    relX,
                    relY
                  }
                });
              }
            }
          });
        }
        if (!hasTitlePos && typeof title3d.getBBox === 'function' && axisLabelBounds.length) {
          try {
            const titlePadding = Math.max(fs * 0.45, 10);
            const minAxisTop = axisLabelBounds.reduce((min, bounds) => (
              Number.isFinite(bounds?.y) ? Math.min(min, bounds.y) : min
            ), Number.POSITIVE_INFINITY);
            if (Number.isFinite(minAxisTop)) {
              const baseY = Number(title3d.getAttribute('y')) || defaultTitleY3;
              let titleBox = title3d.getBBox();
              const desiredBottom = minAxisTop - titlePadding;
              if (Number.isFinite(desiredBottom)) {
                const currentBottom = titleBox.y + titleBox.height;
                if (currentBottom > desiredBottom) {
                  const shift = desiredBottom - currentBottom;
                  const minTitleY = Math.max(fs * 0.5, 0);
                  const nextY = Math.max(minTitleY, baseY + shift);
                  title3d.setAttribute('y', nextY);
                  titleBox = title3d.getBBox();
                  const adjustedBottom = titleBox.y + titleBox.height;
                  if (adjustedBottom > desiredBottom) {
                    const correction = desiredBottom - adjustedBottom;
                    const correctedY = Math.max(minTitleY, nextY + correction);
                    if (correctedY !== nextY) {
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
          } catch (err) {
            debugLog('Debug: pca title bbox adjust error', {
              mode: '3d',
              message: err?.message || String(err)
            });
          }
        }
        debugLog('Debug: pca title rendered', {
          mode: '3d',
          text: pcaTitleText
        });
        debugLog('Debug: pca 3d axis ranges', {
          axisRanges: renderAxisRanges3d,
          ticks: axisTicks
        });
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
        }).sort((a, b) => a.depth - b.depth);
        const labelLayout = Shared.labelLayout;
        const manualLabelEntries3d = [];
        const pointBounds3d = [];
        let maxPointRight = contentRightBound;
        projectedPoints.forEach(pt => {
          const assignment = (groupMeta && Number.isInteger(pt.index)) ? groupMeta.assignments[pt.index] : null;
          const original = pt.original || {};
          const pointStyle = resolvePcaPointStyle({ ...original, label: pt.label }, Number.isInteger(assignment) ? assignment : null, pt.index);
          const color = pointStyle.fill || fill;
          const shape = pointStyle.shape || 'circle';
          const markerRadiusBase = Number(pointStyle.size);
          const markerRadius = chartStyle.scaleStrokeWidth(markerRadiusBase, styleScaleInfo, {
            context: 'pca-dot-size-label',
            min: 0.5
          });
          const pointTransparency = Number(pointStyle.alpha);
          const pointOpacity = Math.min(Math.max(1 - pointTransparency, 0), 1);
          const pointBorderWidthBase = Number(pointStyle.borderWidth);
          const pointBorderWidthPx = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, {
            context: 'pca-border-label',
            min: 0
          });
          const pointBorderColor = pointStyle.borderColor || borderColor;
          const pointStroke = pointOpacity > 0 && pointBorderWidthPx > 0 ? pointBorderColor : 'none';
          const layoutPointId = pointBounds3d.length;
          pointBounds3d.push({
            cx: pt.x,
            cy: pt.y,
            r: markerRadius,
            pointId: layoutPointId
          });
          const manualLabelText = pt.label ? String(pt.label).trim() : '';
          if (original.isManualLabel && manualLabelText) {
            const labelKey = createPcaPointLabelKey({
              ...original,
              label: manualLabelText,
              sourceIndex: pt.index
            }, method, '3d', layoutPointId);
            manualLabelEntries3d.push({
              text: manualLabelText,
              cx: pt.x,
              cy: pt.y,
              radius: markerRadius,
              pointId: layoutPointId,
              labelKey,
              pinnedPosition: pcaLabelPositionsState?.pointLabels?.[labelKey] || null
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
          if (pointNode) {
            pointNode.dataset.plotPoint = '1';
            const groupLabel3d = Number.isInteger(assignment) ?
              (groupMeta?.entries?.[assignment]?.label || '') :
              '';
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
              groupIndex: Number.isInteger(assignment) ? assignment : null,
              columnIndex: Number.isInteger(original.columnIndex) ? original.columnIndex : null
            });
          }
          const approxRight = pt.x + markerRadius + borderWidthPx;
          if (Number.isFinite(approxRight)) {
            maxPointRight = Math.max(maxPointRight, approxRight);
          }
        });
        if (manualLabelEntries3d.length && labelLayout?.computePointLabelLayout && labelLayout?.computePointLabelFontSize) {
          const labelLayer = document.createElementNS(NS, 'g');
          labelLayer.setAttribute('data-layer', 'point-labels');
          labelLayer.setAttribute('pointer-events', 'none');
          const baseManualLabelSize = labelLayout.resolvePointLabelBaseFontSize?.(styleScaleInfo) ||
            (chartStyle.ptToPx?.(10) || 13.3333333333);
          const labelWidth = labelBounds3d ? Math.max(1, labelBounds3d.maxX - labelBounds3d.minX) : plotW3;
          const labelHeight = labelBounds3d ? Math.max(1, labelBounds3d.maxY - labelBounds3d.minY) : plotH3;
          const tickFontSizeCap = labelLayout?.readFontSizeFromNodes ?
            (labelLayout.readFontSizeFromNodes(svg3.querySelectorAll('[data-axis-tick-label]')) ||
              Math.max(9, Math.round(fs * 0.85))) :
            Math.max(9, Math.round(fs * 0.85));
          const labelFontSize = labelLayout.computePointLabelFontSize(baseManualLabelSize, manualLabelEntries3d.length, labelWidth, labelHeight, {
            maxFontSize: Math.min(baseManualLabelSize, tickFontSizeCap)
          });
          const labelScale = Math.min(1, labelFontSize / Math.max(1, baseManualLabelSize));
          const leaderStrokeWidth = chartStyle.scaleStrokeWidth(0.75 * labelScale, styleScaleInfo, {
            context: 'pca-point-label-3d',
            min: 0.25
          });
          const labelColor = pcaThemeTextColor;
          const plotLeft = labelBounds3d ? labelBounds3d.minX : margin3.left;
          const plotRight = labelBounds3d ? labelBounds3d.maxX : margin3.left + plotW3;
          const plotTop = labelBounds3d ? labelBounds3d.minY : margin3.top;
          const plotBottom = labelBounds3d ? labelBounds3d.maxY : margin3.top + plotH3;
          const font = typeof chartStyle?.makeFont === 'function' ?
            chartStyle.makeFont(labelFontSize) :
            null;
          const manualLabelLayout = labelLayout.computePointLabelLayout(manualLabelEntries3d, {
            plotLeft,
            plotRight,
            plotTop,
            plotBottom,
            containerLeft: 0,
            containerRight: W3,
            containerTop: 0,
            containerBottom: H3,
            plotHull: labelHull3d,
            enforceHull: true,
            hullPenalty: 18,
            labelFontSize,
            leaderGap: Math.max(2, Math.round(labelFontSize * 0.2)),
            leaderScale: labelScale,
            pointBounds: pointBounds3d,
            measureText: chartStyle?.measureText,
            font,
            fontStyles: pca3dFontStyles,
            angleSteps: 16,
            maxLeaderScale: 3
          });
          manualLabelLayout.forEach(result => {
            const entry = result.entry;
            const placement = result.placement;
            const textValue = entry?.text ? String(entry.text) : '';
            if (!textValue || !placement) {
              return;
            }
            const textX = placement.textX;
            const textY = placement.textY;
            const anchor = placement.anchor;
            const leaderStart = placement.leaderPoints[0];
            const leaderEnd = placement.leaderPoints[1];
            const leader = document.createElementNS(NS, 'line');
            leader.setAttribute('x1', String(leaderStart.x));
            leader.setAttribute('y1', String(leaderStart.y));
            leader.setAttribute('x2', String(leaderEnd.x));
            leader.setAttribute('y2', String(leaderEnd.y));
            leader.setAttribute('stroke', labelColor);
            leader.setAttribute('stroke-width', String(leaderStrokeWidth));
            leader.setAttribute('stroke-linecap', 'round');
            leader.setAttribute('data-label-leader', '1');
            labelLayer.appendChild(leader);
            const textNode = document.createElementNS(NS, 'text');
            textNode.setAttribute('x', String(textX));
            textNode.setAttribute('y', String(textY));
            textNode.setAttribute('font-size', String(placement.fontSize || labelFontSize));
            textNode.setAttribute('fill', labelColor);
            textNode.setAttribute('text-anchor', anchor);
            textNode.setAttribute('dominant-baseline', 'middle');
            textNode.textContent = textValue;
            labelLayer.appendChild(textNode);
            markFontEditable(textNode, 'pointLabel', `pointLabel:${entry.labelKey}`, { collection: 'labels' });
            bindPcaPointLabelDrag({
              textNode,
              leaderNode: leader,
              svg: svg3,
              entry,
              placement,
              session: drawSession,
              leaderGap: placement.leaderGap || Math.max(2, Math.round(labelFontSize * 0.2)),
              containerLeft: 0,
              containerRight: W3,
              containerTop: 0,
              containerBottom: H3
            });
          });
          svg3.appendChild(labelLayer);
          debugLog('Debug: pca manual labels rendered', {
            count: manualLabelEntries3d.length,
            mode: '3d'
          });
        } else if (manualLabelEntries3d.length) {
          debugLog('Debug: pca manual labels skipped', {
            count: manualLabelEntries3d.length,
            mode: '3d',
            reason: 'missing-layout-helper'
          });
        }
        svg3.appendChild(frontFrameLayer);
        contentRightBound = Math.max(contentRightBound, maxPointRight);
        let legendGroup3d = null;
        if (legendVisible) {
          const legendGapFor3d = legendLayout.legendGapPx;
          const legacyHorizontalBase = margin3.left + plotW3 + legendGapFor3d + appliedLegendAxisGap;
          const reserveOriginX = baseW3 + appliedLegendAxisGap;
          const horizontalBase = reserveOriginX + legendGapFor3d;
          const legendHeight = legendRenderer.height || 0;
          const legendContentWidth = legendRenderer.width || 0;
          const horizontalPadding = Math.max(fs * 0.6, 12) + appliedLegendAxisGap;
          const storedLegendPos = pcaLabelPositionsState?.legend;
          const legendPosition = chartStyle.resolveLegendPosition(storedLegendPos, {
            defaultX: horizontalBase,
            defaultY: margin3.top,
            reserveOriginX,
            reserveOriginY: margin3.top,
            reserveScaleX: legendGapFor3d,
            reserveScaleY: plotH3,
            legacyOriginX: legacyHorizontalBase,
            legacyOriginY: margin3.top,
            legacyScaleX: legendGapFor3d,
            legacyScaleY: plotH3
          });
          let legendX3 = legendPosition.x;
          const safeRightPad = Math.max(fs * 0.6, 12);
          const maxLegendX = W3 - safeRightPad - legendContentWidth;
          if (maxLegendX < horizontalBase) {
            debugLog('Debug: pca legend width constraint', {
              mode: '3d',
              horizontalBase,
              maxLegendX,
              safeRightPad
            });
          }
          if (legendX3 > maxLegendX) {
            const previousX = legendX3;
            legendX3 = Math.max(horizontalBase, maxLegendX);
            debugLog('Debug: pca legend horizontal clamped', {
              mode: '3d',
              previousX,
              legendX3,
              maxLegendX
            });
          }
          const baseLegendY = margin3.top;
          const canonicalLegendX3 = legendPosition.canonicalX;
          const canonicalLegendY3 = legendPosition.canonicalY;
          const legendBottomLimit = Math.max(baseLegendY, H3 - margin3.bottom - legendHeight);
          const verticalPadding = Math.max(fs * 0.45, 8);
          let legendStartY = storedLegendPos ? legendPosition.y : baseLegendY;
          if (!storedLegendPos || (storedLegendPos.relX === undefined && storedLegendPos.relY === undefined && (isNaN(storedLegendPos?.x) || isNaN(storedLegendPos?.y)))) {
            const candidates = [baseLegendY];
            if (axisLabelBounds.length) {
              for (let idx = 0; idx < axisLabelBounds.length; idx += 1) {
                const bounds = axisLabelBounds[idx];
                const below = bounds.y + bounds.height + verticalPadding;
                const above = bounds.y - legendHeight - verticalPadding;
                if (below <= legendBottomLimit) {
                  candidates.push(below);
                }
                if (above >= baseLegendY) {
                  candidates.push(above);
                }
              }
            }
            if (legendBottomLimit !== baseLegendY) {
              candidates.push(legendBottomLimit);
            }
            const candidatePositions = [];
            for (let idx = 0; idx < candidates.length; idx += 1) {
              const candidate = candidates[idx];
              const clamped = Math.min(Math.max(candidate, baseLegendY), legendBottomLimit);
              if (!candidatePositions.some(existing => Math.abs(existing - clamped) < 0.5)) {
                candidatePositions.push(clamped);
              }
            }
            candidatePositions.sort((a, b) => Math.abs(a - baseLegendY) - Math.abs(b - baseLegendY));
            const intersectsAxis = (rect) => {
              for (let idx = 0; idx < axisLabelBounds.length; idx += 1) {
                const bounds = axisLabelBounds[idx];
                const horizontalOverlap = rect.x < bounds.x + bounds.width + horizontalPadding &&
                  rect.x + rect.width > bounds.x - horizontalPadding;
                const verticalOverlap = rect.y < bounds.y + bounds.height + verticalPadding &&
                  rect.y + rect.height > bounds.y - verticalPadding;
                if (horizontalOverlap && verticalOverlap) {
                  return true;
                }
              }
              return false;
            };
            for (let idx = 0; idx < candidatePositions.length; idx += 1) {
              const candidateY = candidatePositions[idx];
              const legendRect = {
                x: legendX3,
                y: candidateY,
                width: legendContentWidth,
                height: legendHeight
              };
              if (!intersectsAxis(legendRect)) {
                legendStartY = candidateY;
                break;
              }
            }
          }
          debugLog('Debug: pca legend placement resolved', {
            mode: '3d',
            legendX: legendX3,
            legendY: legendStartY,
            legendHeight,
            axisLabels: axisLabelBounds.length
          });
          const legendGroup = legendRenderer.draw(svg3, {
            x: legendX3,
            y: legendStartY,
            canonicalX: canonicalLegendX3,
            canonicalY: canonicalLegendY3
          });
          legendGroup?.setAttribute?.('data-role', 'pca-legend');
          legendGroup3d = legendGroup;
          if (legendGroup) {
            plot3d.applyLegendPointerGuards(legendGroup, {
              label: 'pca-legend-3d'
            });
          }
          Array.from(legendGroup?.querySelectorAll?.('text') || []).forEach((legendText, index) => {
            markFontEditable(legendText, 'legend', `legend-${index}`);
          });
          bindPcaLegendInteractions(legendGroup, svg3, drawSession, {
            mode: '3d',
            originX: legendPosition.originX,
            originY: legendPosition.originY,
            scaleX: legendPosition.scaleX,
            scaleY: legendPosition.scaleY
          });
        } else {
          debugLog('Debug: pca legend skipped', {
            mode: '3d',
            legendVisible,
            entryCount: legendEntries.length
          });
        }
        debugLog('Debug: pca 3d render complete', {
          pointCount: projectedPoints.length,
          axisRanges: renderAxisRanges3d
        });
        const rotationDynamicGroup = document.createElementNS(NS, 'g');
        rotationDynamicGroup.setAttribute('data-layer', 'pca-3d-rotation-dynamic');
        const rotationStaticNodes = new Set([title3d, legendGroup3d].filter(Boolean));
        const rotationChildren = Array.from(svg3.children).filter(node => (
          !rotationStaticNodes.has(node) &&
          node.getAttribute?.('data-plot3d-rotation-hit-surface') !== '1'
        ));
        const rotationInsertBefore = title3d || legendGroup3d || null;
        svg3.insertBefore(rotationDynamicGroup, rotationInsertBefore);
        rotationChildren.forEach(node => rotationDynamicGroup.appendChild(node));
        const fastPointDescriptors = renderPoints3d.map((point, idx) => {
          const original = points3d[idx] || {};
          const assignment = (groupMeta && Number.isInteger(point.index)) ? groupMeta.assignments[point.index] : null;
          const label = point.label ? String(point.label) : '';
          const pointStyle = resolvePcaPointStyle({ ...original, label }, Number.isInteger(assignment) ? assignment : null, point.index);
          const pointRadiusBase = Number(pointStyle.size);
          const pointTransparency = Number(pointStyle.alpha);
          const pointBorderWidthBase = Number(pointStyle.borderWidth);
          const pointBorderWidth = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, {
            context: 'pca-border-label',
            min: 0
          });
          const groupLabel = Number.isInteger(assignment)
            ? (groupMeta?.entries?.[assignment]?.label || '')
            : '';
          return {
            point,
            original,
            shape: pointStyle.shape || 'circle',
            radius: chartStyle.scaleStrokeWidth(pointRadiusBase, styleScaleInfo, {
              context: 'pca-dot-size-label',
              min: 0.5
            }),
            fill: pointStyle.fill || fill,
            stroke: pointBorderWidth > 0 ?
              (pointStyle.borderColor || borderColor) :
              'none',
            strokeWidth: pointBorderWidth,
            opacity: Math.min(Math.max(1 - pointTransparency, 0), 1),
            label: original.isManualLabel ? label : '',
            sourceIndex: Number.isInteger(point.index) ? point.index : null,
            tooltip: {
              label,
              groupName: groupLabel,
              x: original.x,
              y: original.y,
              z: original.z,
              xLabel: pcaXLabelText,
              yLabel: pcaYLabelText,
              zLabel: pcaZLabelText,
              index: point.index,
              groupIndex: Number.isInteger(assignment) ? assignment : null,
              columnIndex: Number.isInteger(original.columnIndex) ? original.columnIndex : null
            }
          };
        });
        const formatPca3dAxisTick = (axisKey, value) => {
          const formatter = axisTickFormatters3d?.[axisKey];
          if (typeof formatter === 'function') {
            return String(formatter(value));
          }
          return typeof chartStyle.formatAxisValue === 'function'
            ? String(chartStyle.formatAxisValue(value, { maxDecimals: 2 }))
            : String(value);
        };
        const pca3dRotationModel = normalizePca3dRotationModel({
          version: PCA_3D_ROTATION_MODEL_VERSION,
          width: W3,
          height: H3,
          margin: margin3,
          legendShiftX,
          axisRanges: renderAxisRanges3d,
          axisTicks,
          axisTickLabels: {
            x: axisTicks.x.map(value => formatPca3dAxisTick('x', value)),
            y: axisTicks.y.map(value => formatPca3dAxisTick('y', value)),
            z: axisTicks.z.map(value => formatPca3dAxisTick('z', value))
          },
          axisLabels: {
            x: pcaXLabelText,
            y: pcaYLabelText,
            z: pcaZLabelText
          },
          fontSize: fs,
          tickFontSize: pca3dTickFontSize,
          axisStrokeWidth,
          axisColor: axisStroke,
          textColor: pcaThemeTextColor,
          showGrid,
          showFrame,
          paneFill: pcaThemeDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.03)',
          paneOpacityRange: pcaThemeDark ? { min: 0.10, max: 0.22 } : { min: 0.01, max: 0.05 },
          grid: {
            color: gridStrokeStyle.color,
            dash: gridDash || null,
            opacity: gridOpacity,
            strokeWidth: gridStrokeStyle.thickness
          },
          points: fastPointDescriptors.map(descriptor => ({
            point: descriptor.point,
            shape: descriptor.shape,
            radius: descriptor.radius,
            fill: descriptor.fill,
            stroke: descriptor.stroke,
            strokeWidth: descriptor.strokeWidth,
            opacity: descriptor.opacity,
            label: descriptor.label,
            sourceIndex: descriptor.sourceIndex,
            tooltip: descriptor.tooltip
          }))
        });
        if (pca3dRotationModel) {
          drawSession.cache.pca3dRotationModel = cloneSimple(pca3dRotationModel) || pca3dRotationModel;
          bindPca3dRotationRenderer(drawSession, svg3, pca3dRotationModel);
        } else {
          clearPca3dRotationRenderer(drawSession, { clearModel: true });
        }
        registerPcaGridControlTarget(svg3, {
          fallbackThickness: axisStrokeWidthBase
        });
        // 3D plots must scale uniformly so the projected cube, axis labels, title,
        // legend, and every glyph keep their proportions. preserveAspectRatio
        // "xMidYMid meet" (vs the 2D "none"/fill-distort default) prevents the SVG
        // from being non-uniformly stretched when the rendered box aspect differs
        // from the content aspect, on initial render, rotation, and resize.
        const rotationViewport = drawOpts.reason === 'rotation' ?
          getPcaDrawRuntime(drawSession)?.rotationViewport || null :
          null;
        if (!applyPcaRotationViewport(svg3, rotationViewport)) {
          ensureGraphViewport(svg3, {
            padding: Math.max(fs, 18),
            debugLabel: 'pca-3d-graph',
            baseViewport: { width: W3, height: H3 },
            preserveAspectRatio: 'xMidYMid meet',
            fitContent: false
          });
          pcaLayout?.syncPanels?.({
            skipSchedule: true
          });
          syncPcaAutoDrawNoticeWidth('draw');
        }
        projectPcaRenderedParameterMetadata(svg3, drawSession);
        if (framePublication && !framePublication.commit()) {
          return false;
        }
        plotEl.style.removeProperty('min-width');
        legendProjection.commit();
        return;
      }

      if (!points.length) {
        plotEl.replaceChildren();
        debugLog('Debug: pca 2d render skipped', {
          reason: 'no-points'
        });
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

      debugLog('Debug: pca axis range resolved', {
        xMin,
        xMax,
        yMin,
        yMax
      });

      plotEl.style.aspectRatio = '';
      plotEl.style.padding = '';
      const baseDrawableWidth = Math.max(50, Math.floor(drawableFrame.width || 50));
      const H = Math.max(40, Math.floor(drawableFrame.height || 40));
      // The canonical Cartesian user frame is the drawable graph frame.
      // Legend width is derived presentation geometry and is added only through
      // the transaction's external content envelope below.
      const W = baseDrawableWidth;

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
        return {
          min: graphMin,
          max: graphMax,
          ticks,
          step
        };
      }

      const equalAxisLengths2d = !!controls.equalAxisLengths;
      let xTickTarget = chartStyle.estimateTickCount(baseDrawableWidth, {
        axis: 'x',
        fallback: 6
      });
      let yTickTarget = chartStyle.estimateTickCount(H, {
        axis: 'y',
        fallback: 6
      });
      debugLog('Debug: pca initial tick targets', {
        xTickTarget,
        yTickTarget,
        width: W,
        height: H
      });
      const formatTick = value => chartStyle.formatScientific(value, {
        maxDecimals: 2
      });
      const pcaFontStyles = exportFontStyles('pca', { tabId: drawTabId });
      const xTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function') ?
        chartStyle.resolveScopedLabelMeasureFont({
          styles: pcaFontStyles,
          role: 'xTick',
          fallbackPx: fs
        }).fontSpec :
        chartStyle.makeFont(fs);
      const yTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function') ?
        chartStyle.resolveScopedLabelMeasureFont({
          styles: pcaFontStyles,
          role: 'yTick',
          fallbackPx: fs
        }).fontSpec :
        chartStyle.makeFont(fs);
      const tickFont = yTickMeasureFont;
      const hasYTitle = String(pcaYLabelText == null ? '' : pcaYLabelText).trim().length > 0;
      const tickLen = axisMetrics.tickLength;
      const xMajorTickLength = getAxisMajorTickLength('x') ?? tickLen;
      const yMajorTickLength = getAxisMajorTickLength('y') ?? tickLen;
      const tickGap = axisMetrics.tickLabelGap;
      const manualIntervalX = getAxisTickInterval('x');
      const manualIntervalY = getAxisTickInterval('y');
      // Do not redeclare `renderRuntime` inside drawPca's try block: a lexical
      // declaration here would shadow the draw-scoped runtime for the entire try
      // block and place earlier view-only reads in the temporal dead zone.
      const axisLengthRuntime = getPcaRenderRuntime(drawSession);
      const pendingAxisLengthTransaction = axisLengthRuntime?.axisLengthTransaction;
      const axisLengthTransaction = pendingAxisLengthTransaction
        && Number(pendingAxisLengthTransaction.expiresAt) >= Date.now()
        && clonePcaAxisScaleForResize(pendingAxisLengthTransaction.xScale)
        && clonePcaAxisScaleForResize(pendingAxisLengthTransaction.yScale)
        ? pendingAxisLengthTransaction
        : null;
      if (pendingAxisLengthTransaction && !axisLengthTransaction) {
        updatePcaRenderRuntime(drawSession, runtime => {
          if (runtime.axisLengthTransaction === pendingAxisLengthTransaction) {
            runtime.axisLengthTransaction = null;
          }
        });
      }

      const applyManualTickInterval = (scale, interval) => {
        if (!(Number.isFinite(interval) && interval > 0)) {
          return scale;
        }
        const manual = buildManualTicks(scale.min, scale.max, interval);
        if (!manual) {
          return scale;
        }
        return {
          ...scale,
          min: manual.min,
          max: manual.max,
          ticks: manual.ticks,
          step: interval
        };
      };

      const evaluatePca2dTickLayout = (targetX, targetY) => {
        const candidateXScale = axisLengthTransaction
          ? clonePcaAxisScaleForResize(axisLengthTransaction.xScale)
          : applyManualTickInterval(
              niceScale(xMin, xMax, targetX),
              manualIntervalX
            );
        const candidateYScale = axisLengthTransaction
          ? clonePcaAxisScaleForResize(axisLengthTransaction.yScale)
          : applyManualTickInterval(
              niceScale(yMin, yMax, targetY),
              manualIntervalY
            );
        const candidateXLabels = candidateXScale.ticks.map(t => formatTick(t));
        const candidateYLabels = candidateYScale.ticks.map(t => formatTick(t));
        const yLabelWidths = candidateYLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
        const xLabelWidths = candidateXLabels.map(lbl => chartStyle.measureText(lbl, xTickMeasureFont));
        const candidateMaxYLabelWidth = Math.max(...yLabelWidths, 0);
        const candidateMaxXLabelWidth = Math.max(...xLabelWidths, 0);

        const cartesianMarginRequirements = chartStyle.computeCartesianMarginRequirements({
          fontSize: fs,
          maxYLabelWidth: candidateMaxYLabelWidth,
          hasYTitle,
          axisMetrics,
          xTickLabels: candidateXLabels,
          xTickMeasureFont,
          yTickFontSize: fs,
          xTickFontSize: fs
        });
        let candidateMargin = { ...cartesianMarginRequirements.baselineMargins };
        candidateMargin.left = Math.max(candidateMargin.left, fs * 0.5);
        let candidateRequiredMargins = {
          ...cartesianMarginRequirements.requiredMargins,
          left: Math.max(
            cartesianMarginRequirements.requiredMargins.left,
            candidateMaxYLabelWidth + yMajorTickLength + tickGap + fs * 0.5
          )
        };
        if (axisLengthTransaction) {
          candidateMargin.top = Number(axisLengthTransaction.marginTop);
          candidateMargin.bottom = Number(axisLengthTransaction.marginBottom);
          candidateRequiredMargins.top = Math.max(candidateRequiredMargins.top, candidateMargin.top);
          candidateRequiredMargins.bottom = Math.max(candidateRequiredMargins.bottom, candidateMargin.bottom);
        }

        // PCA's displayed X width is metric-owned: it is derived from plot
        // height and the final coordinate spans. Tick density and label
        // orientation must use that width, not the outer square frame width.
        // Measured labels are outward reserves; they must not feed back into the
        // physical px/unit metric.
        let metricLayout = resolvePca2dMetricLayout(
          W,
          H,
          candidateMargin,
          candidateXScale,
          candidateYScale,
          equalAxisLengths2d,
          {
            owner: pcaCartesianOwner,
            requiredMargins: candidateRequiredMargins,
            externalExtensions: { right: legendVisible ? effectiveLegendWidth : 0 },
            resizeMetricLocked: true,
            resizeDrive: pcaSvgBox?.dataset?.resizerLastAxis === 'x'
              ? 'width'
              : (pcaSvgBox?.dataset?.resizerLastAxis === 'y' ? 'height' : 'both')
          }
        );
        const candidateBottomLayout = chartStyle.computeBottomLayout({
          labels: candidateXLabels,
          fontSize: fs,
          labelMeasureFont: xTickMeasureFont,
          plotWidth: metricLayout.plotW,
          baseBottom: candidateMargin.bottom,
          axisMetrics,
          preservePlotRail: true
        });
        candidateRequiredMargins = {
          ...candidateRequiredMargins,
          bottom: Math.max(candidateRequiredMargins.bottom, candidateBottomLayout.requiredBottom || candidateMargin.bottom)
        };
        metricLayout = resolvePca2dMetricLayout(
          W,
          H,
          candidateMargin,
          candidateXScale,
          candidateYScale,
          equalAxisLengths2d,
          {
            owner: pcaCartesianOwner,
            requiredMargins: candidateRequiredMargins,
            externalExtensions: { right: legendVisible ? effectiveLegendWidth : 0 },
            resizeMetricLocked: true,
            resizeDrive: pcaSvgBox?.dataset?.resizerLastAxis === 'x'
              ? 'width'
              : (pcaSvgBox?.dataset?.resizerLastAxis === 'y' ? 'height' : 'both')
          }
        );

        return {
          xScale: metricLayout.xScale,
          yScale: metricLayout.yScale,
          xTickLabels: candidateXLabels,
          yTickLabels: candidateYLabels,
          maxXLabelWidth: candidateMaxXLabelWidth,
          maxYLabelWidth: candidateMaxYLabelWidth,
          margin: metricLayout.margin,
          plotW: metricLayout.plotW,
          plotH: metricLayout.plotH,
          bottomLayout: candidateBottomLayout,
          finalSpanX: metricLayout.spanX,
          finalSpanY: metricLayout.spanY,
          desiredMetricAspect: metricLayout.desiredAspect,
          aspectRightExtension: metricLayout.rightExtension,
          requiredMargins: candidateRequiredMargins,
          cartesianPlan: metricLayout.cartesianPlan
        };
      };

      let tickLayout = null;
      if (axisLengthTransaction) {
        // Axis-length editing changes physical size only. Reuse the already
        // displayed numerical scales for exactly one draw so the explicit size
        // transaction cannot trigger a second, visibly corrective layout.
        tickLayout = evaluatePca2dTickLayout(xTickTarget, yTickTarget);
        debugLog('Debug: pca axis-length transaction layout locked', {
          generation: axisLengthTransaction.generation,
          axis: axisLengthTransaction.axis,
          requestedLength: axisLengthTransaction.requestedLength,
          plotW: tickLayout.plotW,
          plotH: tickLayout.plotH
        });
      } else {
        const maxTickLayoutPasses = 4;
        for (let pass = 0; pass < maxTickLayoutPasses; pass += 1) {
          tickLayout = evaluatePca2dTickLayout(xTickTarget, yTickTarget);
          const refinedX = Number.isFinite(manualIntervalX) && manualIntervalX > 0 ?
            xTickTarget :
            chartStyle.estimateTickCount(tickLayout.plotW, {
              axis: 'x',
              fallback: xTickTarget
            });
          const refinedY = Number.isFinite(manualIntervalY) && manualIntervalY > 0 ?
            yTickTarget :
            chartStyle.estimateTickCount(tickLayout.plotH, {
              axis: 'y',
              fallback: yTickTarget
            });
          debugLog('Debug: pca metric tick target evaluation', {
            pass,
            plotW: tickLayout.plotW,
            plotH: tickLayout.plotH,
            xTickTarget,
            refinedX,
            yTickTarget,
            refinedY,
            maxXLabelWidth: tickLayout.maxXLabelWidth,
            maxYLabelWidth: tickLayout.maxYLabelWidth,
            manualIntervalX,
            manualIntervalY
          });
          const xStable = (Number.isFinite(manualIntervalX) && manualIntervalX > 0) || refinedX === xTickTarget;
          const yStable = (Number.isFinite(manualIntervalY) && manualIntervalY > 0) || refinedY === yTickTarget;
          if (xStable && yStable) {
            break;
          }
          if (!xStable) {
            xTickTarget = refinedX;
          }
          if (!yStable) {
            yTickTarget = refinedY;
          }
        }

        // Publish one self-consistent final layout even if the bounded tick loop
        // used its last pass to update a target.
        tickLayout = evaluatePca2dTickLayout(xTickTarget, yTickTarget);
      }
      let xScale = tickLayout.xScale;
      let yScale = tickLayout.yScale;
      const maxXLabelWidth = tickLayout.maxXLabelWidth;
      const maxYLabelWidth = tickLayout.maxYLabelWidth;
      let margin = tickLayout.margin;
      let plotW = tickLayout.plotW;
      let plotH = tickLayout.plotH;
      const bottomLayout = tickLayout.bottomLayout;
      const finalSpanX = tickLayout.finalSpanX;
      const finalSpanY = tickLayout.finalSpanY;
      const desiredMetricAspect = tickLayout.desiredMetricAspect;
      const aspectRightExtension = tickLayout.aspectRightExtension;
      const pcaRequiredMargins = tickLayout.requiredMargins || margin;
      let pcaCartesianPlan = tickLayout.cartesianPlan || null;

      debugLog('Debug: pca tick targets finalized', {
        xTickTarget,
        yTickTarget,
        maxXLabelWidth,
        maxYLabelWidth,
        manualIntervalX,
        manualIntervalY,
        metricPlotW: plotW,
        metricPlotH: plotH
      });
      debugLog('Debug: pca metric-preserving 2d layout', {
        equalAxisLengths: equalAxisLengths2d,
        finalSpanX,
        finalSpanY,
        desiredMetricAspect,
        appliedAspect: plotH > 0 ? plotW / plotH : null,
        pixelsPerXUnit: plotW / finalSpanX,
        pixelsPerYUnit: plotH / finalSpanY
      });

      let legendOrigin2d = null;
      if (legendVisible) {
        const defaultLegendY = margin.top;
        const legendPos = pcaLabelPositionsState?.legend;
        const plotRight = margin.left + plotW;
        const legendPosition = chartStyle.resolveLegendPosition(legendPos, {
          defaultX: baseDrawableWidth + appliedLegendAxisGap + legendLayout.legendGapPx,
          defaultY: defaultLegendY,
          reserveOriginX: baseDrawableWidth + appliedLegendAxisGap,
          reserveOriginY: margin.top,
          reserveScaleX: legendLayout.legendGapPx,
          reserveScaleY: plotH,
          legacyOriginX: plotRight,
          legacyOriginY: margin.top,
          legacyScaleX: legendLayout.legendGapPx,
          legacyScaleY: plotH
        });
        legendOrigin2d = {
          defaultLegendX: legendPosition.canonicalX,
          defaultLegendY: legendPosition.canonicalY,
          absoluteLegendX: legendPosition.x,
          absoluteLegendY: legendPosition.y,
          originX: legendPosition.originX,
          originY: legendPosition.originY,
          scaleX: legendPosition.scaleX,
          scaleY: legendPosition.scaleY
        };
      }
      const renderW = Math.max(W, pcaCartesianPlan?.contentEnvelope?.maxX || (W + aspectRightExtension));
      const renderH = Math.max(H, pcaCartesianPlan?.contentEnvelope?.maxY || H);
      plotEl.style.position = 'relative';
      const layeredRoot = document.createElement('div');
      layeredRoot.className = 'pca-layered-plot';
      layeredRoot.style.position = 'relative';
      layeredRoot.style.width = `${renderW}px`;
      layeredRoot.style.height = `${renderH}px`;
      layeredRoot.style.flex = '0 0 auto';

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'pcaSvg');
      svg.setAttribute('width', String(renderW));
      svg.setAttribute('height', String(renderH));
      svg.setAttribute('viewBox', `0 0 ${renderW} ${renderH}`);
      svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
      svg.dataset.viewMode = effectiveViewMode;
      svg.dataset.pcaMethod = method;
      svg.dataset.pcaEqualAxisLengths = String(equalAxisLengths2d);
      svg.dataset.pcaMetricPlotWidth = String(plotW);
      svg.dataset.pcaMetricPlotHeight = String(plotH);
      svg.dataset.pcaMetricXSpan = String(finalSpanX);
      svg.dataset.pcaMetricYSpan = String(finalSpanY);
      svg.dataset.pcaPixelsPerXUnit = String(plotW / finalSpanX);
      svg.dataset.pcaPixelsPerYUnit = String(plotH / finalSpanY);
      chartStyle.prepareSvg(svg, { scopeId: 'pca' });
      let legendProjection = chartStyle.stageGraphContentViewport({
        svgBox: pcaSvgBox,
        plot: plotEl,
        svg,
        baseWidth: baseDrawableWidth,
        baseHeight: H,
        rightWidth: pcaCartesianPlan?.contentEnvelope?.extensionRight
          ?? ((legendVisible ? effectiveLegendWidth : 0) + aspectRightExtension),
        leftWidth: pcaCartesianPlan?.contentEnvelope?.extensionLeft || 0,
        topHeight: pcaCartesianPlan?.contentEnvelope?.extensionTop || 0,
        bottomHeight: pcaCartesianPlan?.contentEnvelope?.extensionBottom || 0,
        legendWidth: legendVisible ? effectiveLegendWidth : 0
      });
      svg.addEventListener('mouseleave', handlePcaPlotMouseLeave);
      const shouldUseCanvasPoints = points.length >= PCA_FAST_POINT_THRESHOLD;
      let fastPointCanvas = null;
      let fastPointCtx = null;
      if (shouldUseCanvasPoints) {
        fastPointCanvas = document.createElement('canvas');
        fastPointCanvas.className = 'pca-fast-points-layer';
        fastPointCanvas.width = renderW;
        fastPointCanvas.height = renderH;
        fastPointCanvas.style.position = 'absolute';
        fastPointCanvas.style.left = '0';
        fastPointCanvas.style.top = '0';
        fastPointCanvas.style.width = `${renderW}px`;
        fastPointCanvas.style.height = `${renderH}px`;
        fastPointCanvas.style.pointerEvents = 'none';
        layeredRoot.appendChild(fastPointCanvas);
        fastPointCtx = typeof fastPointCanvas.getContext === 'function' ?
          fastPointCanvas.getContext('2d') :
          null;
        if (!fastPointCtx) {
          fastPointCtx = createNoopCanvasContext();
        }
        if (fastPointCtx) {
          if (typeof fastPointCtx.clearRect === 'function') {
            fastPointCtx.clearRect(0, 0, renderW, renderH);
          }
          try {
            fastPointCtx.imageSmoothingEnabled = false;
          } catch (err) {
            /* ignore */ }
          fastPointModeActive = true;
        }
      }
      layeredRoot.appendChild(svg);
      framePublication = Shared.framePublication.stage({
        container: plotEl,
        frame: layeredRoot,
        publishedNode: svg,
        publishedId: 'pcaSvg',
        component: 'pca',
        tabId: drawTabId,
        canCommit: () => (!drawAsyncState || isPcaDrawAsyncCurrent(drawToken, drawAsyncState))
          && (!drawSession || isPcaSessionActiveForModuleState(drawSession))
      });
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
        const gridSegments = [];
        xScale.ticks.forEach((t) => {
          const x = x2px(t);
          gridSegments.push({
            x1: x,
            y1: margin.top,
            x2: x,
            y2: margin.top + plotH
          });
        });
        yScale.ticks.forEach((t) => {
          const y = y2px(t);
          gridSegments.push({
            x1: margin.left,
            y1: y,
            x2: margin.left + plotW,
            y2: y
          });
        });
        const gridPathData = svgGeometry.buildCompoundLinePath?.(gridSegments) || '';
        if(gridPathData){
          add('path', Object.assign({
            d: gridPathData,
            fill: 'none',
            'data-grid-control': '1'
          }, gridStrokeAttrs));
        }
        debugLog('Debug: pca grid stroke scaled', {
          vertical: xScale.ticks.length,
          horizontal: yScale.ticks.length,
          gridStrokeStyle
        });
      }

      const axisXStart = margin.left;
      const axisXEnd = margin.left + plotW;
      const axisYStart = margin.top;
      const axisYEnd = margin.top + plotH;
      debugLog('Debug: pca axis span', {
        axisXStart,
        axisXEnd,
        axisYStart,
        axisYEnd
      });
      const minorTickStyle = chartStyle.resolveMinorTickStyle({
        tickLength: tickLen,
        strokeWidth: axisStrokeWidth
      });
      const minorSubdivisionsX = getAxisMinorTickSubdivisions('x');
      const minorSubdivisionsY = getAxisMinorTickSubdivisions('y');
      const minorTicksX = getAxisMinorTicksEnabled('x') ?
        chartStyle.computeMinorTickPositions({
          majorTicks: xScale.ticks,
          min: Number.isFinite(xScale.min) ? xScale.min : xMin,
          max: Number.isFinite(xScale.max) ? xScale.max : xMax,
          scale: 'linear',
          subdivisions: minorSubdivisionsX
        }) :
        [];
      const minorTicksY = getAxisMinorTicksEnabled('y') ?
        chartStyle.computeMinorTickPositions({
          majorTicks: yScale.ticks,
          min: Number.isFinite(yScale.min) ? yScale.min : yMin,
          max: Number.isFinite(yScale.max) ? yScale.max : yMax,
          scale: 'linear',
          subdivisions: minorSubdivisionsY
        }) :
        [];
      const axisControlConfig = axis => buildPcaAxisControlConfig(axis, drawSession, {
        effectiveTickInterval: axis === 'x' ? xScale.step : yScale.step,
        viewMode: '2d'
      });
      const xAxisLine = add('line', {
        x1: axisXStart,
        y1: margin.top + plotH,
        x2: axisXEnd,
        y2: margin.top + plotH,
        stroke: axisStroke,
        'stroke-linecap': 'square',
        'stroke-width': axisStrokeWidth,
        'data-axis-line': '1',
        'data-axis-key': 'x',
        'data-axis-min': xScale.min,
        'data-axis-max': xScale.max
      });
      if (axisControls && typeof axisControls.registerAxisElement === 'function') {
        axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
      }
      const yAxisLine = add('line', {
        x1: margin.left,
        y1: axisYStart,
        x2: margin.left,
        y2: axisYEnd,
        stroke: axisStroke,
        'stroke-linecap': 'square',
        'stroke-width': axisStrokeWidth,
        'data-axis-line': '1',
        'data-axis-key': 'y',
        'data-axis-min': yScale.min,
        'data-axis-max': yScale.max
      });
      if (axisControls && typeof axisControls.registerAxisElement === 'function') {
        axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
      }
      debugLog('Debug: pca axes stroke scaled', {
        axisStrokeWidthBase,
        axisStrokeWidth,
        axisStroke
      });
      if (showFrame) {
        debugLog('Debug: pca frame request', {
          stroke: axisStroke,
          showFrame,
          axisStrokeWidth
        }); // Debug: frame styling inputs
        chartStyle.drawPlotFrame({
          svg,
          margin,
          plotW,
          plotH,
          stroke: axisStroke,
          strokeWidth: axisStrokeWidth,
          sides: ['top', 'right']
        });
      }
      // Frame closes PCA plot area using axis styling continuity

      const xTickNodes = [];
      let xTickFontCount = 0;
      if (minorTicksX.length) {
        minorTicksX.forEach(value => {
          const x = x2px(value);
          add('line', {
            x1: x,
            y1: margin.top + plotH,
            x2: x,
            y2: margin.top + plotH + minorTickStyle.length,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            'data-axis-tick': '1',
            'data-axis-key': 'x',
            opacity: minorTickStyle.opacity
          });
        });
      }
      xScale.ticks.forEach((t, i) => {
        const x = x2px(t);
        add('line', {
          x1: x,
          y1: margin.top + plotH,
          x2: x,
          y2: margin.top + plotH + xMajorTickLength,
          stroke: axisStroke,
          'stroke-width': axisStrokeWidth,
          'data-axis-tick': '1',
          'data-axis-key': 'x',
          'data-axis-value': t
        });
        const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, xMajorTickLength, tickGap) : 0;
        const txt = add('text', {
          x,
          y: margin.top + plotH + xMajorTickLength + tickGap + extra,
          'font-size': fs,
          'text-anchor': 'middle',
          fill: chartStyle.TEXT_COLOR,
        }, formatTick(t));
        Shared.applyTextBaseline && Shared.applyTextBaseline(txt, 'hanging', fs);
        markFontEditable(txt, 'xTick');
        xTickFontCount += 1;
        xTickNodes.push(txt);
      });
      chartStyle.applyLabelOrientation(xTickNodes, {
        angle: -45,
        anchor: 'end',
        dy: '0.35em',
        force: bottomLayout.shouldRotate
      });

      const yTickNodes = [];
      let yTickFontCount = 0;
      if (minorTicksY.length) {
        minorTicksY.forEach(value => {
          const y = y2px(value);
          add('line', {
            x1: margin.left - minorTickStyle.length,
            y1: y,
            x2: margin.left,
            y2: y,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            'data-axis-tick': '1',
            'data-axis-key': 'y',
            opacity: minorTickStyle.opacity
          });
        });
      }
      yScale.ticks.forEach((t, i) => {
        const y = y2px(t);
        add('line', {
          x1: margin.left - yMajorTickLength,
          y1: y,
          x2: margin.left,
          y2: y,
          stroke: axisStroke,
          'stroke-width': axisStrokeWidth,
          'data-axis-tick': '1',
          'data-axis-key': 'y',
          'data-axis-value': t
        });
        const txt = add('text', {
          x: margin.left - (yMajorTickLength + tickGap),
          y,
          'font-size': fs,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          fill: chartStyle.TEXT_COLOR,
        }, formatTick(t));
        markFontEditable(txt, 'yTick');
        yTickFontCount += 1;
        yTickNodes.push(txt);
      });
      debugLog('Debug: pca ticks stroke scaled', {
        xTickCount: xScale.ticks.length,
        yTickCount: yScale.ticks.length,
        axisStrokeWidth
      });
      debugLog('Debug: pca font tick binding', {
        xTickFontCount,
        yTickFontCount
      }); // Debug: tick font binding counts

      const defaultXLabelX = margin.left + plotW / 2;
      const defaultXLabelY = margin.top + plotH + bottomLayout.titleOffset;
      const xLabelPos = pcaLabelPositionsState?.xLabel;
      const hasCustomXLabelPos = !!(
        xLabelPos &&
        (
          (xLabelPos.relX !== undefined && xLabelPos.relY !== undefined) ||
          (xLabelPos.x !== undefined && xLabelPos.y !== undefined)
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
      markFontEditable(xAxisText, 'xTitle', 'xTitle');
      // Enable drag for x-axis label
      if (typeof Shared.enableLabelDrag === 'function') {
        Shared.enableLabelDrag(xAxisText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for xLabel
            const relX = (pos.x - margin.left) / plotW;
            const relY = (pos.y - (margin.top + plotH)) / bottomLayout.titleOffset;
            pcaLabelPositionsState = patchPcaLabelPositionsState(drawSession, {
              xLabel: {
                x: pos.x,
                y: pos.y,
                relX,
                relY
              }
            }, {
              reason: 'pca-2d-x-label-position'
            });
            debugLog('pca x-label position saved', {
              absolute: pos,
              relative: {
                relX,
                relY
              }
            });
          }
        });
      }

      if (xTickNodes.length && !hasCustomXLabelPos) {
        const svgRect = typeof svg?.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : null;
        const measureBottom = (node) => {
          if (!node) {
            return null;
          }
          if (svgRect && typeof node.getBoundingClientRect === 'function') {
            const rect = node.getBoundingClientRect();
            if (rect && Number.isFinite(rect.bottom)) {
              return rect.bottom - (svgRect?.top || 0);
            }
          }
          if (typeof node.getBBox === 'function') {
            const box = node.getBBox();
            return box.y + box.height;
          }
          return null;
        };
        const measureTop = (node) => {
          if (!node) {
            return null;
          }
          if (svgRect && typeof node.getBoundingClientRect === 'function') {
            const rect = node.getBoundingClientRect();
            if (rect && Number.isFinite(rect.top)) {
              return rect.top - (svgRect?.top || 0);
            }
          }
          if (typeof node.getBBox === 'function') {
            const box = node.getBBox();
            return box.y;
          }
          return null;
        };
        let maxTickBottom = -Infinity;
        xTickNodes.forEach(node => {
          const bottom = measureBottom(node);
          if (Number.isFinite(bottom) && bottom > maxTickBottom) {
            maxTickBottom = bottom;
          }
        });
        const titleTop = measureTop(xAxisText);
        const desiredGap = axisMetrics?.axisTitleGap ?? Math.max(4, Math.round(fs * 0.75));
        const requiredTop = Number.isFinite(maxTickBottom) ? maxTickBottom + desiredGap : null;
        if (Number.isFinite(requiredTop) && Number.isFinite(titleTop) && requiredTop > titleTop) {
          const currentY = Number(xAxisText.getAttribute('y')) || (margin.top + plotH + bottomLayout.titleOffset);
          const shift = requiredTop - titleTop;
          xAxisText.setAttribute('y', currentY + shift);
          debugLog('Debug: pca x-axis title shifted to avoid tick overlap', {
            shift,
            maxTickBottom,
            titleTop
          });
        }
      } else if (xTickNodes.length && hasCustomXLabelPos) {
        debugLog('Debug: pca x-axis title overlap auto-shift skipped (custom position retained)');
      }

      const yLabelOffsetSpan = (maxYLabelWidth + yMajorTickLength + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
      const defaultYLabelX = margin.left - yLabelOffsetSpan;
      const defaultYLabelY = margin.top + plotH / 2;
      const yLabelPos = pcaLabelPositionsState?.yLabel;

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
      markFontEditable(yAxisText, 'yTitle', 'yTitle');
      // Enable drag for y-axis label
      if (typeof Shared.enableLabelDrag === 'function') {
        Shared.enableLabelDrag(yAxisText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for yLabel
            const relX = (pos.x - margin.left) / yLabelOffsetSpan;
            const relY = (pos.y - margin.top) / plotH;
            pcaLabelPositionsState = patchPcaLabelPositionsState(drawSession, {
              yLabel: {
                x: pos.x,
                y: pos.y,
                relX,
                relY
              }
            }, {
              reason: 'pca-2d-y-label-position'
            });
            debugLog('pca y-label position saved', {
              absolute: pos,
              relative: {
                relX,
                relY
              }
            });
          }
        });
      }

      const defaultTitleX = margin.left + plotW / 2;
      const defaultTitleY = Math.max(fs, margin.top * 0.5);
      const titlePos = pcaLabelPositionsState?.title;

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
      markFontEditable(titleText, 'graphTitle', 'graphTitle');
      bindPcaTitleInlineInteraction(titleText, drawSession);
      // Enable drag for title
      if (typeof Shared.enableLabelDrag === 'function') {
        Shared.enableLabelDrag(titleText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions
            const relX = (pos.x - margin.left) / plotW;
            const relY = (pos.y - margin.top) / plotH;
            pcaLabelPositionsState = patchPcaLabelPositionsState(drawSession, {
              title: {
                x: pos.x,
                y: pos.y,
                relX,
                relY
              }
            }, {
              reason: 'pca-2d-title-position'
            });
            debugLog('pca title position saved', {
              absolute: pos,
              relative: {
                relX,
                relY
              }
            });
          }
        });
      }
      debugLog('Debug: pca title rendered', {
        mode: '2d',
        text: pcaTitleText
      });

      if (fastPointModeActive && fastPointCtx) {
        points.forEach((pt) => {
          const cx = x2px(pt.x);
          const cy = y2px(pt.y);
          const assignment = (groupMeta && Number.isInteger(pt.index)) ? groupMeta.assignments[pt.index] : null;
          const pointStyle = resolvePcaPointStyle(pt, Number.isInteger(assignment) ? assignment : null, pt.index);
          const color = pointStyle.fill || fill;
          const shape = pointStyle.shape || 'circle';
          const pointRadiusBase = Number(pointStyle.size);
          const pointRadiusPx = chartStyle.scaleStrokeWidth(pointRadiusBase, styleScaleInfo, {
            context: 'pca-dot-size-label',
            min: 0.5
          });
          const pointTransparency = Number(pointStyle.alpha);
          const pointOpacityLocal = Math.min(Math.max(1 - pointTransparency, 0), 1);
          const pointBorderWidthBase = Number(pointStyle.borderWidth);
          const pointBorderWidthPx = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, {
            context: 'pca-border-label',
            min: 0
          });
          const pointBorderColor = pointStyle.borderColor || borderColor;
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
          const pointStyle = resolvePcaPointStyle(pt, Number.isInteger(assignment) ? assignment : null, pt.index);
          const color = pointStyle.fill || fill;
          const shape = pointStyle.shape || 'circle';
          const pointRadiusBase = Number(pointStyle.size);
          const pointRadiusPx = chartStyle.scaleStrokeWidth(pointRadiusBase, styleScaleInfo, {
            context: 'pca-dot-size-label',
            min: 0.5
          });
          const pointTransparency = Number(pointStyle.alpha);
          const pointOpacityLocal = Math.min(Math.max(1 - pointTransparency, 0), 1);
          const pointBorderWidthBase = Number(pointStyle.borderWidth);
          const pointBorderWidthPx = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, {
            context: 'pca-border-label',
            min: 0
          });
          const pointBorderColor = pointStyle.borderColor || borderColor;
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
          if (pointNode) {
            pointNode.dataset.plotPoint = '1';
            const groupLabel = Number.isInteger(assignment) ?
              (groupMeta?.entries?.[assignment]?.label || '') :
              '';
            attachPcaPointTooltip(pointNode, {
              label: pt.label || '',
              groupName: groupLabel,
              x: pt.x,
              y: pt.y,
              xLabel: pcaXLabelText,
              yLabel: pcaYLabelText,
              index: pt.index,
              groupIndex: Number.isInteger(assignment) ? assignment : null,
              columnIndex: Number.isInteger(pt.columnIndex) ? pt.columnIndex : null
            });
          }
        });
      }

      const labelLayout2d = Shared.labelLayout;
      const hasManualLabels = points.some(pt => pt?.isManualLabel && String(pt.label || '').trim());
      if (hasManualLabels && labelLayout2d?.computePointLabelLayout && labelLayout2d?.computePointLabelFontSize) {
        const manualLabelEntries = [];
        const pointBounds = [];
        points.forEach(pt => {
          const cx = x2px(pt.x);
          const cy = y2px(pt.y);
          const layoutPointId = pointBounds.length;
          pointBounds.push({
            cx,
            cy,
            r: dotSizePx,
            pointId: layoutPointId
          });
          const labelText = pt.label ? String(pt.label).trim() : '';
          if (pt.isManualLabel && labelText) {
            const labelKey = createPcaPointLabelKey(pt, method, '2d', layoutPointId);
            manualLabelEntries.push({
              text: labelText,
              cx,
              cy,
              radius: dotSizePx,
              pointId: layoutPointId,
              labelKey,
              pinnedPosition: pcaLabelPositionsState?.pointLabels?.[labelKey] || null
            });
          }
        });
        if (manualLabelEntries.length) {
          const labelLayer = document.createElementNS(NS, 'g');
          labelLayer.setAttribute('data-layer', 'point-labels');
          labelLayer.setAttribute('pointer-events', 'none');
          const baseManualLabelSize = labelLayout2d.resolvePointLabelBaseFontSize?.(styleScaleInfo) ||
            (chartStyle.ptToPx?.(10) || 13.3333333333);
          const xTickFontSize = labelLayout2d.readFontSizeFromNodes ? labelLayout2d.readFontSizeFromNodes(xTickNodes) : null;
          const yTickFontSize = labelLayout2d.readFontSizeFromNodes ? labelLayout2d.readFontSizeFromNodes(yTickNodes) : null;
          const tickFontSizeCap = (Number.isFinite(xTickFontSize) && Number.isFinite(yTickFontSize)) ?
            Math.min(xTickFontSize, yTickFontSize) :
            (Number.isFinite(xTickFontSize) ?
              xTickFontSize :
              (Number.isFinite(yTickFontSize) ? yTickFontSize : fs));
          const labelFontSize = labelLayout2d.computePointLabelFontSize(baseManualLabelSize, manualLabelEntries.length, plotW, plotH, {
            maxFontSize: Math.min(baseManualLabelSize, tickFontSizeCap)
          });
          const labelScale = Math.min(1, labelFontSize / Math.max(1, baseManualLabelSize));
          const leaderStrokeWidth = chartStyle.scaleStrokeWidth(0.75 * labelScale, styleScaleInfo, {
            context: 'pca-point-label',
            min: 0.25
          });
          const labelColor = pcaThemeTextColor;
          const plotLeft = margin.left;
          const plotRight = margin.left + plotW;
          const plotTop = margin.top;
          const plotBottom = margin.top + plotH;
          const font = typeof chartStyle?.makeFont === 'function' ?
            chartStyle.makeFont(labelFontSize) :
            null;
          const manualLabelLayout = labelLayout2d.computePointLabelLayout(manualLabelEntries, {
            plotLeft,
            plotRight,
            plotTop,
            plotBottom,
            containerLeft: 0,
            containerRight: Math.max(W, ...pointBounds.map(point => point.cx + 4)),
            containerTop: 0,
            containerBottom: Math.max(H, ...pointBounds.map(point => point.cy + 4)),
            labelFontSize,
            leaderGap: Math.max(2, Math.round(labelFontSize * 0.2)),
            leaderScale: labelScale,
            pointBounds,
            measureText: chartStyle?.measureText,
            font,
            fontStyles: pcaFontStyles,
            angleSteps: 16,
            maxLeaderScale: 3
          });
          manualLabelLayout.forEach(result => {
            const entry = result.entry;
            const placement = result.placement;
            const textValue = entry?.text ? String(entry.text) : '';
            if (!textValue || !placement) {
              return;
            }
            const textX = placement.textX;
            const textY = placement.textY;
            const anchor = placement.anchor;
            const leaderStart = placement.leaderPoints[0];
            const leaderEnd = placement.leaderPoints[1];
            const leader = document.createElementNS(NS, 'line');
            leader.setAttribute('x1', String(leaderStart.x));
            leader.setAttribute('y1', String(leaderStart.y));
            leader.setAttribute('x2', String(leaderEnd.x));
            leader.setAttribute('y2', String(leaderEnd.y));
            leader.setAttribute('stroke', labelColor);
            leader.setAttribute('stroke-width', String(leaderStrokeWidth));
            leader.setAttribute('stroke-linecap', 'round');
            leader.setAttribute('data-label-leader', '1');
            labelLayer.appendChild(leader);
            const textNode = document.createElementNS(NS, 'text');
            textNode.setAttribute('x', String(textX));
            textNode.setAttribute('y', String(textY));
            textNode.setAttribute('font-size', String(placement.fontSize || labelFontSize));
            textNode.setAttribute('fill', labelColor);
            textNode.setAttribute('text-anchor', anchor);
            textNode.setAttribute('dominant-baseline', 'middle');
            textNode.textContent = textValue;
            labelLayer.appendChild(textNode);
            markFontEditable(textNode, 'pointLabel', `pointLabel:${entry.labelKey}`, { collection: 'labels' });
            bindPcaPointLabelDrag({
              textNode,
              leaderNode: leader,
              svg,
              entry,
              placement,
              session: drawSession,
              leaderGap: placement.leaderGap || Math.max(2, Math.round(labelFontSize * 0.2)),
              containerLeft: 0,
              containerRight: W,
              containerTop: 0,
              containerBottom: H
            });
          });
          svg.appendChild(labelLayer);
          debugLog('Debug: pca manual labels rendered', {
            count: manualLabelEntries.length,
            mode: '2d'
          });
        }
      } else if (hasManualLabels) {
        debugLog('Debug: pca manual labels skipped', {
          mode: '2d',
          reason: 'missing-layout-helper'
        });
      }

      if (legendVisible) {
        const legendOriginX = legendOrigin2d?.absoluteLegendX ?? (margin.left + plotW + legendLayout.legendGapPx + appliedLegendAxisGap);
        const legendOriginY = legendOrigin2d?.absoluteLegendY ?? margin.top;
        debugLog('Debug: pca legend layout', {
          legendX: legendOriginX,
          legendY: legendOriginY,
          legendWidth: legendRenderer.width || 0,
          legendHeight: legendRenderer.height || 0,
          legendVisible,
          appliedLegendAxisGap
        });
        const legendGroup = legendRenderer.draw(svg, {
          x: legendOriginX,
          y: legendOriginY,
          canonicalX: legendOrigin2d?.defaultLegendX ?? legendOriginX,
          canonicalY: legendOrigin2d?.defaultLegendY ?? legendOriginY
        });
        if (legendGroup && typeof legendGroup.querySelectorAll === 'function') {
          const textNodes = legendGroup.querySelectorAll('text');
          Array.from(textNodes).forEach((node, idx) => {
            try {
              markFontEditable(node, 'legend', `legend-${idx}`);
            } catch (err) {}
          });
        }
        bindPcaLegendInteractions(legendGroup, svg, drawSession, {
          mode: '2d',
          originX: legendOrigin2d?.originX ?? baseDrawableWidth,
          originY: legendOrigin2d?.originY ?? margin.top,
          scaleX: legendOrigin2d?.scaleX ?? legendLayout.legendGapPx,
          scaleY: legendOrigin2d?.scaleY ?? plotH
        });
      } else {
        debugLog('Debug: pca legend skipped', {
          mode: '2d',
          legendVisible,
          entryCount: legendEntries.length
        });
      }

      console.debug('pca render complete', {
        pointCount: points.length,
        width: W,
        height: renderH,
        fastMode: fastPointModeActive,
        loadingsRendered: Array.isArray(loadingsRows) ? loadingsRows.length : 0,
        loadingsTotal: loadingsTotalCount,
        loadingsTruncated
      });
      registerPcaGridControlTarget(svg, {
        fallbackThickness: axisStrokeWidthBase
      });
      ensureGraphViewport(svg, {
        padding: Math.max(fs, 18),
        debugLabel: 'pca-2d-graph',
        baseViewport: {
          width: renderW,
          height: renderH
        },
        fitContent: false
      });
      projectPcaRenderedParameterMetadata(svg, drawSession);
      const measuredPcaViewport = legendProjection.measure?.() || legendProjection.getViewport?.() || null;
      if(pcaCartesianPlan && measuredPcaViewport){
        const replannedMetric = resolvePca2dMetricLayout(
          W,
          H,
          pcaCartesianPlan.baselineMargins,
          xScale,
          yScale,
          equalAxisLengths2d,
          {
            owner: pcaCartesianOwner,
            requiredMargins: pcaRequiredMargins,
            externalExtensions: { right: legendVisible ? effectiveLegendWidth : 0 },
            resizeMetricLocked: true,
            resizeDrive: pcaSvgBox?.dataset?.resizerLastAxis === 'x'
              ? 'width'
              : (pcaSvgBox?.dataset?.resizerLastAxis === 'y' ? 'height' : 'both'),
            contentBounds: {
              minX: measuredPcaViewport.minX,
              minY: measuredPcaViewport.minY,
              maxX: measuredPcaViewport.maxX,
              maxY: measuredPcaViewport.maxY
            }
          }
        );
        pcaCartesianPlan = replannedMetric.cartesianPlan;
        // Measurement may enlarge the metric/content envelope. Re-stage from
        // that final plan so the SVG, outer border, and published transaction
        // commit the same bounds instead of retaining the provisional legend.
        legendProjection = chartStyle.stageGraphContentViewport({
          svgBox: pcaSvgBox,
          plot: plotEl,
          svg,
          baseWidth: baseDrawableWidth,
          baseHeight: H,
          rightWidth: pcaCartesianPlan?.contentEnvelope?.extensionRight || 0,
          leftWidth: pcaCartesianPlan?.contentEnvelope?.extensionLeft || 0,
          topHeight: pcaCartesianPlan?.contentEnvelope?.extensionTop || 0,
          bottomHeight: pcaCartesianPlan?.contentEnvelope?.extensionBottom || 0,
          legendWidth: legendVisible ? effectiveLegendWidth : 0,
          refineLegendReserve: false,
          refineContentBounds: false
        });
      }
      plotEl.style.removeProperty('min-width');
      const pcaLayoutPublished = pcaCartesianPlan
        ? Shared.cartesianLayout?.publishCartesianLayout?.(pcaSvgBox, pcaCartesianPlan, {
            tabId: pcaCartesianOwner.tabId,
            component: 'pca',
            generation: pcaCartesianOwner.generation,
            resizePhase: explicitDrawOptions?.resizePhase || null,
            canCommit: () => (!drawAsyncState || isPcaDrawAsyncCurrent(drawToken, drawAsyncState))
              && (!drawSession || getPcaSession(drawSession.tabId, {}, { create: false }) === drawSession),
            projectionTarget: svg,
            commitFrame: () => framePublication.commit(),
            commitPresentation: () => legendProjection.commit()
          })
        : false;
      if(pcaCartesianPlan && !pcaLayoutPublished){
        return false;
      }
      if(!pcaCartesianPlan){
        if(!framePublication.commit()) return false;
        legendProjection.commit();
      }
      const finalizedEnvelopeWidth = Number(pcaCartesianPlan?.contentEnvelope?.width);
      if(Number.isFinite(finalizedEnvelopeWidth) && finalizedEnvelopeWidth > 0){
        layeredRoot.style.width = `${finalizedEnvelopeWidth}px`;
      }else{
        const finalizedRightReserve = Number(svg.dataset?.graphContentReserveRight);
        if(Number.isFinite(finalizedRightReserve) && finalizedRightReserve >= 0){
          layeredRoot.style.width = `${baseDrawableWidth + finalizedRightReserve}px`;
        }
      }
      pcaLayout?.syncPanels?.({
        skipSchedule: true
      });
      if (axisLengthTransaction) {
        updatePcaRenderRuntime(drawSession, runtime => {
          if (Number(runtime.axisLengthTransaction?.generation) === Number(axisLengthTransaction.generation)) {
            runtime.axisLengthTransaction = null;
          }
        });
      }
      syncPcaAutoDrawNoticeWidth('draw');
    } catch (err) {
      debugLog('Error: drawPca failure', {
        message: err?.message || err
      });
      throw err;
    } finally {
      framePublication?.cleanup();
      const totalEnd = nowMs();
      const finalOwnerContext = drawSession
        ? Shared.componentLifecycle?.resolveOwnerCaptureContext?.('pca', {
            tabId: drawSession.tabId
          }, {
            component: pca,
            projectedSession: projectedPcaSession,
            session: drawSession,
            root: drawSession.root || null,
            allowMissingWorkspaceOwner: true
          })
        : null;
      const drawOwnerStillProjected = drawSession
        ? (finalOwnerContext
            ? finalOwnerContext.canCaptureLive === true
            : isPcaSessionActiveForModuleState(drawSession))
        : true;
      if (drawSession?.state) {
        drawSession.state = normalizePcaSessionRecord(drawSession.state, drawSession.tabId);
        drawSession.state.state.fastPointMode = !!fastPointModeActive;
        drawSession.updatedAt = Date.now();
      }
      if (drawOwnerStillProjected) {
        const fastModeChanged = pcaState.fastPointMode !== fastPointModeActive;
        pcaState.fastPointMode = fastPointModeActive;
        if (fastModeChanged || fastPointModeActive) {
          updateAutoDrawUi({
            preserveReason: true
          });
        }
      }
      const effectiveParseEnd = parseEnd ?? totalEnd;
      if (computeStart != null && computeEnd === null) {
        computeEnd = totalEnd;
      }
      const computeMs = (computeStart != null && computeEnd != null && computeEnd >= computeStart) ?
        (computeEnd - computeStart) :
        0;
      const renderAnchor = computeEnd ?? effectiveParseEnd;
      const renderMs = totalEnd - renderAnchor;
      if (cachePayload) {
        setPcaAnalysisCache(cachePayload, drawSession, {
          mirrorActive: drawOwnerStillProjected
        });
      }
      updatePcaRenderRuntime(drawSession, runtime => {
        if (cachePayload) {
          runtime.cachedRender = getPcaAnalysisCache(drawSession, {
            mirrorActive: drawOwnerStillProjected
          });
          runtime.dataDirty = false;
        }
        runtime.viewDirty = false;
      }, {
        mirrorActive: drawOwnerStillProjected
      });
      updatePcaDrawRuntime(drawSession, runtime => {
        runtime.resizeWarmupPending = false;
      }, {
        mirrorActive: drawOwnerStillProjected
      });
      try {
        capturePcaSessionStateFromActive(drawSession || getPcaProjectionSession({
          reason: 'pca-projection-mutation'
        }), {
          tabId: drawSession?.tabId || null,
          reason: drawOpts.reason || 'pca-draw-complete'
        });
      } catch (captureErr) {
        debugLog('Debug: pca session capture after draw failed', {
          message: captureErr?.message || String(captureErr)
        });
      }
      if (drawOpts.restoreOwnerStatsAfterDraw === true && drawOwnerStillProjected && drawSession?.tabId) {
        projectPcaStatsForOwner(drawSession.tabId, `${drawOpts.reason || 'pca-recovery-draw'}:post-draw`);
      }
      if (!skipPerfRecord && drawOwnerStillProjected) {
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
      } else if (!skipPerfRecord) {
        debugLog('Debug: pca stale draw performance projection skipped', {
          tabId: drawSession?.tabId || null,
          activeTabId: getPcaActiveTabId() || null,
          reason: drawOpts.reason || null
        });
      }
    }
  }

  function getPcaGraphPayload(context = {}) {
    const captureContext = Shared.componentLifecycle?.resolvePayloadCaptureContext?.('pca', context, {
      component: pca,
      projectedSession: projectedPcaSession,
      root: pcaRoot
    }) || null;
    const requestedTabId = captureContext?.requestedTabId
      || (typeof context?.tabId === 'string' && context.tabId.trim() ? context.tabId.trim() : null);
    if(requestedTabId && captureContext?.canCaptureLive !== true){
      const requestedTab = captureContext?.requestedTab || context?.tab || null;
      const canonicalPayload = cloneSimple(requestedTab?.payload);
      if(canonicalPayload && typeof canonicalPayload === 'object'){
        canonicalPayload.type = 'pca';
        return canonicalPayload;
      }
      return null;
    }
    const activeHot = ensurePcaHotForActiveTab();
    const activeManager = activeHot ?
      ensurePcaDataViewsForHot(activeHot, {
        wrapper: getPcaNodeById('pcaHotWrapper'),
        container: activeHot.__pcaHostContainer || getPcaNodeById('pcaHot')
      }) :
      (getActivePcaSessionForState()?.managers?.dataViews || null);
    if (activeHot) {
      syncPcaActiveDataViewFromHot(activeHot, 'payload');
    }
    const dataViewsPayload = activeManager?.serialize?.({
      includeData: true
    }) || null;
    const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
    const liveTableData = activeHot?.getData?.() || [];
    const payloadSourceData = Shared.dataViews?.resolveRawDataForPersistence?.(dataViewsPayload, liveTableData)
      || liveTableData;
    const payloadSession = requestedTabId ?
      getPcaSession(requestedTabId, {
        tabId: requestedTabId,
        reason: 'pca-payload-owner-session'
      }, { create: false }) :
      getActivePcaSessionForState();

    const payloadNotes = capturePcaNotesForSession(payloadSession);

    const payloadRenderRuntime = getPcaRenderRuntime(payloadSession, {
      seedFromActive: true
    });
    const statsSnapshot = getPcaStatsSnapshot(payloadSession);
    const cachedStatsRender = getPcaAnalysisCache(payloadSession) ||
      (payloadRenderRuntime.cachedRender && typeof payloadRenderRuntime.cachedRender === 'object' ?
        payloadRenderRuntime.cachedRender :
        null);
    ensurePcaReportHost();
    const statsPanelSnapshot = rememberPcaStatsPanelState();
    const resultsSnapshot = normalizePcaResultsState({
      ...getPcaResultsState(payloadSession),
      stats: cloneSimple(statsSnapshot) || null,
      statsPanel: statsPanelSnapshot
    });
    return {
      type: 'pca',
      data: Shared.hot.trimTrailingEmptyCols(payloadSourceData),
      exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
      filters: activeHot?.exportFilters?.() || Shared.hot.exportFilters(activeHot),
      dataViews: includeDataViews ? dataViewsPayload : undefined,
      activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
      config: {
        ...snapshotPcaConfig(null, payloadSession),
        stats: {
          resultsModel: statsPanelSnapshot.resultsModel || null,
          reportModel: statsPanelSnapshot.reportModel || null,
          summaryModel: statsPanelSnapshot.summaryModel || null
        },
        notes: payloadNotes
      },
      results: resultsSnapshot,
      stats: statsSnapshot ? {
        method: statsSnapshot.method || null,
        eigenSummary: Array.isArray(statsSnapshot.eigenSummary) ? statsSnapshot.eigenSummary : [],
        scree: Array.isArray(statsSnapshot.scree) ? statsSnapshot.scree : [],
        stress: statsSnapshot.stress,
        totalVariance: statsSnapshot.totalVariance,
        dimensions: statsSnapshot.dimensions,
        summaryLines: Array.isArray(statsSnapshot.summaryLines) ?
          statsSnapshot.summaryLines :
          (Array.isArray(cachedStatsRender?.statsSummaryLines) ? cachedStatsRender.statsSummaryLines : []),
        selectionSummary: statsSnapshot.selectionSummary ? cloneSimple(statsSnapshot.selectionSummary) : null,
        parallelAnalysis: Array.isArray(statsSnapshot.parallelAnalysis) ? statsSnapshot.parallelAnalysis.slice() : [],
        biplot: statsSnapshot.biplot ? cloneSimple(statsSnapshot.biplot) : null,
        loadings: cachedStatsRender ? {
          rows: Array.isArray(cachedStatsRender.loadingsRows) ? cachedStatsRender.loadingsRows : [],
          components: Number(cachedStatsRender.loadingsComponents) || 0,
          totalCount: Number.isFinite(cachedStatsRender.loadingsTotalCount) ? cachedStatsRender.loadingsTotalCount : 0,
          truncated: !!cachedStatsRender.loadingsTruncated
        } : null
      } : null
    };
  }

  function snapshotPcaConfig(axisSettingsOverride, ownerSession = null) {
    const owner = ensurePcaSessionOwnershipShape(ownerSession || getActivePcaSessionForState());
    const owned = owner ? getPcaSessionOwnedState(owner) : { session: null, state: pcaState };
    const state = owned.state || pcaState;
    const controls = normalizePcaRuntimeControls(state.controls || {});
    const axisSettings = axisSettingsOverride && typeof axisSettingsOverride === 'object' ?
      cloneSimple(axisSettingsOverride) :
      (cloneSimple(state.axisSettings) || createDefaultAxisSettings());
    const pointStyleScopes = normalizePcaPointStyleScopes(cloneSimple(state.pointStyleScopes) || {}, {
      controls,
      grouped: state.grouped,
      labelColors: state.labelColors,
      labelShapes: state.labelShapes,
      labelPointStyles: state.labelPointStyles
    });
    pointStyleScopes.global = {
      ...(pointStyleScopes.global || {}),
      ...createPcaGlobalPointStyle(controls)
    };
    const legacyPointStyles = exportLegacyPcaPointStyles(pointStyleScopes);
    const ownerHot = owner?.managers?.hot || (shouldMirrorPcaSessionToActive(owner) ? pcaHotInstance : null);
    const groupedState = state.grouped && typeof state.grouped === 'object' ? state.grouped : null;
    const groupedNames = ownerHot ? getPcaGroupedNamesFromHot(ownerHot) : (Array.isArray(groupedState?.names) ? groupedState.names.slice() : []);
    const groupedSampleLabels = ownerHot ? getPcaGroupedSampleLabelsFromHot(ownerHot) : (Array.isArray(groupedState?.sampleLabels) ? groupedState.sampleLabels.slice() : []);
    const componentSelection = state.componentSelection && typeof state.componentSelection === 'object' ? state.componentSelection : {};
    const theme = state.theme && typeof state.theme === 'object' ? state.theme : {};
    const labels = state.labels && typeof state.labels === 'object' ? state.labels : {};
    const axisSelection = normalizePcaAxisSelection(state.axisSelection || { x: 1, y: 2, z: 3 }, Array.isArray(state.axisMeta) ? state.axisMeta.length : 0);
    const rotation = cloneSimple(state.rotation) || plot3d.createRotationState({
      x: PCA_3D_DEFAULTS.rotationX,
      y: PCA_3D_DEFAULTS.rotationY
    });
    const gridStyle = sanitizeGridStyle(state.gridStyle, axisSettings?.strokeWidth);
    return {
      method: controls.method,
      dotSize: controls.dotSize,
      fill: controls.fill,
      colorScheme: theme.colorScheme || 'scientific',
      textColor: theme.textColor || (chartStyle.TEXT_COLOR || '#000000'),
      backgroundColor: theme.backgroundColor || '#ffffff',
      border: controls.border,
      borderWidth: controls.borderWidth,
      tableFormat: state.tableFormat === 'grouped' ? 'grouped' : 'standard',
      loadingsLimit: Number.isFinite(Number(state.loadingsLimit)) ? Number(state.loadingsLimit) : PCA_LOADINGS_ROW_LIMIT,
      biplotShowSampleScores: sanitizePcaBiplotShowSampleScores(state.biplotShowSampleScores),
      screeShowParallel: sanitizePcaScreeShowParallel(state.screeShowParallel),
      grouped: groupedState ? {
        replicatesPerGroup: Math.max(1, Math.round(Number(groupedState.replicatesPerGroup) || 1)),
        names: groupedNames,
        sampleLabels: groupedSampleLabels,
        colors: legacyPointStyles.colors,
        shapes: legacyPointStyles.shapes
      } : null,
      componentSelection: {
        rule: sanitizePcaComponentSelectionRule(componentSelection.rule),
        eigenThreshold: sanitizePcaEigenThreshold(componentSelection.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD),
        parallelIterations: sanitizePcaParallelIterations(componentSelection.parallelIterations, PCA_DEFAULT_PARALLEL_ITERATIONS),
        includeNonRetainedAxes: sanitizePcaIncludeNonRetainedAxes(componentSelection.includeNonRetainedAxes)
      },
      alpha: controls.alpha,
      pointStyleScopes: cloneSimple(pointStyleScopes),
      labelColors: legacyPointStyles.labelColors,
      labelShapes: legacyPointStyles.labelShapes,
      labelPointStyles: legacyPointStyles.labelPointStyles,
      showGrid: !!controls.showGrid,
      gridStyle,
      showFrame: !!controls.showFrame,
      showLegend: controls.showLegend !== false,
      equalAxisLengths: !!controls.equalAxisLengths,
      standardizeVariables: !!controls.standardizeVariables,
      preprocessing: sanitizePcaPreprocessingMode(controls.preprocessing),
      fontSize: controls.fontSize,
      fontStyles: (exportFontStyles('pca', { tabId: owner?.tabId || getPcaProjectionTabId() || null }) || undefined),
      labels: {
        title: typeof labels.title === 'string' ? labels.title : getDefaultTitleForMethod(state.lastMethod || controls.method || 'pca')
      },
      viewMode: controls.viewMode,
      axisSelection: {
        x: axisSelection.x,
        y: axisSelection.y,
        z: axisSelection.z
      },
      rotation: {
        x: Number(rotation.x) || 0,
        y: Number(rotation.y) || 0,
        z: Number(rotation.z) || 0,
        quaternion: rotation.quaternion ? {
          w: rotation.quaternion.w,
          x: rotation.quaternion.x,
          y: rotation.quaternion.y,
          z: rotation.quaternion.z
        } : null
      },
      axis: {
        strokeWidth: axisSettings?.strokeWidth,
        color: axisSettings?.color,
        tickIntervalX: axisSettings?.x?.tickInterval ?? null,
        tickIntervalY: axisSettings?.y?.tickInterval ?? null,
        majorTickLengthX: axisSettings?.x?.majorTickLength ?? null,
        majorTickLengthY: axisSettings?.y?.majorTickLength ?? null,
        minorTicksX: axisSettings?.x?.minorTicks ?? false,
        minorTicksY: axisSettings?.y?.minorTicks ?? false,
        minorTickSubdivisionsX: clampMinorTickSubdivisions(axisSettings?.x?.minorTickSubdivisions),
        minorTickSubdivisionsY: clampMinorTickSubdivisions(axisSettings?.y?.minorTickSubdivisions)
      },
      tsne: {
        perplexity: controls.tsne?.perplexity ?? DEFAULT_TSNE_SETTINGS.perplexity,
        learningRate: controls.tsne?.learningRate ?? DEFAULT_TSNE_SETTINGS.learningRate,
        iterations: controls.tsne?.iterations ?? DEFAULT_TSNE_SETTINGS.iterations,
        earlyExaggeration: controls.tsne?.exaggeration ?? DEFAULT_TSNE_SETTINGS.earlyExaggeration
      },
      umap: {
        neighbors: controls.umap?.neighbors ?? DEFAULT_UMAP_SETTINGS.neighbors,
        minDist: controls.umap?.minDist ?? DEFAULT_UMAP_SETTINGS.minDist,
        learningRate: controls.umap?.learningRate ?? DEFAULT_UMAP_SETTINGS.learningRate,
        epochs: controls.umap?.epochs ?? DEFAULT_UMAP_SETTINGS.epochs
      },
      notes: normalizePcaNotesState(owner?.state?.notes || notesState),
      labelPositions: normalizePcaLabelPositionsState(state.labelPositions || {})
    };
  }

  function ensureEmptyPayloadTemplate() {
    if (emptyPayloadTemplate) {
      return;
    }
    emptyPayloadTemplate = {
      type: 'pca',
      config: {}
    };
  }

  function getPcaFileHandleForSession(session = null) {
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    return owner?.managers?.fileHandle || null;
  }

  function getPcaFileNameForSession(session = null) {
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    const storedName = owner?.state?.fileName;
    return (typeof storedName === 'string' && storedName.trim()) ? storedName.trim() : 'pca.graph';
  }

  function setPcaFileHandleForSession(handle, session = null) {
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (!owner) {
      return null;
    }
    owner.managers.fileHandle = handle || null;
    owner.updatedAt = Date.now();
    return owner.managers.fileHandle;
  }

  function setPcaFileNameForSession(name, session = null) {
    const normalized = (typeof name === 'string' && name.trim()) ? name.trim() : 'pca.graph';
    const owner = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (!owner) {
      return normalized;
    }
    owner.state.fileName = normalized;
    owner.updatedAt = Date.now();
    return normalized;
  }

  async function savePcaFile() {
    const operationSession = getActivePcaSessionForState();
    const fileHandle = getPcaFileHandleForSession(operationSession);
    const fileName = getPcaFileNameForSession(operationSession);
    console.debug('Debug: savePcaFile invoked', {
      hasHandle: !!fileHandle,
      tabId: operationSession?.tabId || null
    });
    if (!fileIO || typeof fileIO.saveGraphFile !== 'function') {
      console.error('savePcaFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'pca',
      owner: { component: 'pca', tabId: operationSession?.tabId || getPcaProjectionTabId() || null },
      fileHandle,
      getPayload: getPcaGraphPayload,
      fileName,
      downloadFileName: fileName,
      setFileHandle: handle => setPcaFileHandleForSession(handle, operationSession),
      setFileName: name => setPcaFileNameForSession(name, operationSession)
    });
    console.debug('Debug: savePcaFile result', result);
  }

  async function saveAsPcaFile() {
    const operationSession = getActivePcaSessionForState();
    const fileName = getPcaFileNameForSession(operationSession);
    console.debug('Debug: saveAsPcaFile invoked', {
      currentName: fileName,
      tabId: operationSession?.tabId || null
    });
    if (!fileIO || typeof fileIO.saveGraphFileAs !== 'function') {
      console.error('saveAsPcaFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'pca',
      owner: { component: 'pca', tabId: operationSession?.tabId || getPcaProjectionTabId() || null },
      getPayload: getPcaGraphPayload,
      fileName,
      downloadFileName: fileName,
      setFileHandle: handle => setPcaFileHandleForSession(handle, operationSession),
      setFileName: name => setPcaFileNameForSession(name, operationSession)
    });
    console.debug('Debug: saveAsPcaFile result', result);
  }

  async function openPcaFile() {
    console.debug('Debug: openPcaFile invoked');
    if (!fileIO || typeof fileIO.openGraphFile !== 'function') {
      console.error('openPcaFile missing fileIO.openGraphFile');
      return;
    }
    const operationSession = getActivePcaSessionForState();
    const operationTabId = operationSession?.tabId || getPcaProjectionTabId() || null;
    const result = await fileIO.openGraphFile({
      context: 'pca',
      owner: { component: 'pca', tabId: operationTabId },
      setFileHandle: handle => setPcaFileHandleForSession(handle, operationSession),
      setFileName: name => setPcaFileNameForSession(name, operationSession),
      loadFromFile: (file, operation) => loadPcaGraphFile(file, { operation, tabId: operationTabId }),
      triggerInput: () => {
        const input = getPcaNodeById('pcaGraphFile');
        if (input) {
          input.value = '';
          input.click();
        }
      }
    });
    console.debug('Debug: openPcaFile result', result);
  }

  function applyPcaPayload(obj, meta = {}) {
    if (!obj || typeof obj !== 'object') {
      console.error('pca payload missing or invalid', {
        meta
      });
      return false;
    }
    if (obj.type && obj.type !== 'pca') {
      console.error('Invalid graph type for pca payload', {
        type: obj.type,
        meta
      });
      return false;
    }
    if (meta?.flagOverlay) {
      const overlayReason = meta?.overlayReason || (typeof meta?.source === 'string' ? `payload-${meta.source}` : 'payload');
      markPcaOverlayPending(overlayReason);
    }
    const skipDraw = meta?.skipDraw === true;
    const styleOnly = meta?.styleOnly === true || meta?.colorSchemeOnly === true;
    let colorSchemeAppliedInPlace = false;
    const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
    const scheduleOriginal = typeof scheduleDrawPca === 'function' ? scheduleDrawPca : null;
    const shouldSuspendSchedule = !!(scheduleOriginal && (skipDraw || !skipDataLoad || styleOnly));
    const payloadSession = getPcaSession(meta?.tab || meta?.tabId || getPcaProjectionTabId() || null, meta, {
      create: true
    }) || getActivePcaSessionForState();
    const workspaceState = global.Main?.session?.workspaceState;
    const workspaceOwner = workspaceState?.tabs?.find?.(tab => String(tab?.id || '') === String(payloadSession?.tabId || '')) || null;
    const payloadOwnerIsActive = !!(payloadSession && workspaceOwner?.type === 'pca'
      && String(workspaceState?.activeTabId || '') === String(payloadSession.tabId || ''));
    if(payloadOwnerIsActive){
      projectedPcaSession = payloadSession;
      pca.__boundTabId = payloadSession.tabId;
      rebindPcaProjectionDomRefs(payloadSession.tabId);
      applyPcaSessionStateToActive(payloadSession, {
        ...(meta || {}),
        tabId: payloadSession.tabId,
        reason: meta?.reason || 'pca-payload-owner-bind'
      });
    }
    const payloadDrawRuntime = getPcaDrawRuntime(payloadSession, {
      seedFromActive: true
    });
    if (payloadDrawRuntime.dataDrawTimer) {
      try {
        Shared.componentLifecycle?.clearComponentTimeout?.(pca, payloadDrawRuntime.dataDrawTimer);
      } catch (err) {}
    }
    if (payloadDrawRuntime.dataDrawFrame) {
      try {
        Shared.componentLifecycle?.cancelComponentFrame?.(pca, payloadDrawRuntime.dataDrawFrame);
      } catch (err) {}
    }
    updatePcaDrawRuntime(payloadSession, runtime => {
      runtime.token = (Number(runtime.token) || 0) + 1;
      runtime.dataDrawTimer = null;
      runtime.dataDrawFrame = null;
    });
    if (shouldSuspendSchedule) {
      scheduleDrawPca = () => {};
    }
    const previousApplyingPayload = pcaState.applyingPayload === true;
    pcaState.applyingPayload = true;
    try {
      const c = obj.config || {};
      const payloadStandardizeVariables = Object.prototype.hasOwnProperty.call(c, 'standardizeVariables') ?
        !!c.standardizeVariables :
        !!c.scale;
      const payloadEqualAxisLengths = Object.prototype.hasOwnProperty.call(c, 'equalAxisLengths') ?
        !!c.equalAxisLengths :
        (Object.prototype.hasOwnProperty.call(c, 'equalScaleAxes') ?
          !!c.equalScaleAxes :
          createDefaultPcaRuntimeControls().equalAxisLengths);
      const payloadOwnedState = getPcaSessionOwnedState(payloadSession).state;
      const controlPatch = {};
      [
        'method', 'viewMode', 'showGrid', 'showFrame', 'showLegend',
        'standardizeVariables', 'equalAxisLengths', 'preprocessing', 'dotSize',
        'fill', 'border', 'borderWidth', 'alpha', 'fontSize', 'tsne', 'umap'
      ].forEach(key => {
        if(Object.prototype.hasOwnProperty.call(c, key)) controlPatch[key] = cloneSimple(c[key]);
      });
      controlPatch.standardizeVariables = payloadStandardizeVariables;
      controlPatch.equalAxisLengths = payloadEqualAxisLengths;
      payloadOwnedState.controls = normalizePcaRuntimeControls({
        ...(payloadOwnedState.controls || {}),
        ...controlPatch
      });
      if(c.axisSelection) payloadOwnedState.axisSelection = cloneSimple(c.axisSelection);
      if(c.rotation) payloadOwnedState.rotation = cloneSimple(c.rotation);
      if(c.labels) payloadOwnedState.labels = cloneSimple(c.labels);
      if(c.grouped) payloadOwnedState.grouped = cloneSimple(c.grouped);
      if(c.pointStyleScopes) payloadOwnedState.pointStyleScopes = cloneSimple(c.pointStyleScopes);
      payloadOwnedState.theme = {
        ...(payloadOwnedState.theme || {}),
        ...(typeof c.colorScheme === 'string' ? { colorScheme: c.colorScheme } : {}),
        ...(typeof c.textColor === 'string' ? { textColor: c.textColor } : {}),
        ...(typeof c.backgroundColor === 'string' ? { backgroundColor: c.backgroundColor } : {})
      };
      persistPcaSessionOwnedState(payloadSession, meta?.reason || 'pca-payload-owner-hydration');
      if(payloadOwnerIsActive){
        applyPcaOwnedStateToActive(payloadOwnedState, {
          ...(meta || {}),
          tabId: payloadSession?.tabId || null,
          reason: meta?.reason || 'pca-payload-owner-project'
        });
      }
      if (c.grouped && typeof c.grouped === 'object') {
        pcaState.grouped = {
          replicatesPerGroup: c.grouped.replicatesPerGroup,
          names: Array.isArray(c.grouped.names) ? c.grouped.names.slice() : [],
          sampleLabels: Array.isArray(c.grouped.sampleLabels) ? c.grouped.sampleLabels.slice() : []
        };
      }
      ensurePcaGroupedDefaults();
      const restoredTableFormat = typeof c.tableFormat === 'string' ? c.tableFormat : pcaState.tableFormat;
      pcaState.tableFormat = restoredTableFormat === 'grouped' ? 'grouped' : 'standard';
      const hot = ensurePcaHotForActiveTab();
      const rawDataMatrix = Array.isArray(obj.data) ? obj.data : [];
      const serializedViews = (obj.dataViews && typeof obj.dataViews === 'object') ? obj.dataViews : null;
      const requestedActiveViewId = obj.activeDataViewId || serializedViews?.activeViewId || null;
      const dataManager = hot ?
        ensurePcaDataViewsForHot(hot, {
          wrapper: getPcaNodeById('pcaHotWrapper'),
          container: hot.__pcaHostContainer || getPcaNodeById('pcaHot')
        }) :
        null;
      if (dataManager) {
        if (serializedViews) {
          dataManager.deserialize(serializedViews, {
            fallbackData: rawDataMatrix,
            activeViewId: requestedActiveViewId,
            silent: true,
            activate: false
          });
        } else {
          dataManager.initialize(rawDataMatrix, {
            rawTitle: 'Raw'
          });
        }
      }
      const matrixData = dataManager?.getActiveView?.()?.data;
      const dataToLoad = Array.isArray(matrixData) ? matrixData : rawDataMatrix;
      const exclusionsToApply = obj.exclusions || dataManager?.getActiveView?.()?.exclusions || null;
      const filtersToApply = obj.filters || dataManager?.getActiveView?.()?.filters || null;
      if (!skipDataLoad && pcaHotInstance && typeof pcaHotInstance.loadData === 'function') {
        markPcaDataDirty(meta?.reason || 'payload-load');
        pcaHotInstance.loadData(dataToLoad);
        if (exclusionsToApply) {
          pcaHotInstance.applyExclusions?.(exclusionsToApply);
        }
        if (filtersToApply) {
          pcaHotInstance.applyFilters?.(filtersToApply, {
            schedule: false
          });
        }
        syncPcaActiveDataViewFromHot(pcaHotInstance, 'payload-load');
      }
      applyPcaThemeConfig(c);
      const restoredNotes = normalizePcaNotesState(
        c.notes && typeof c.notes === 'object' ? c.notes :
          (typeof c.notes === 'string' ? { text: c.notes, open: false } : null)
      );
      if (payloadSession?.state) {
        payloadSession.state.notes = restoredNotes;
        payloadSession.updatedAt = Date.now();
      }
      if (shouldMirrorPcaSessionToActive(payloadSession)) {
        notesState.text = restoredNotes.text;
        notesState.open = restoredNotes.open;
        if (canUsePcaNotesControl(notesState.control, payloadSession)) {
          notesState.control.setValue(restoredNotes.text);
          notesState.control.setOpen(restoredNotes.open);
        }
      }
      importFontStyles('pca', c.fontStyles || null, { tabId: payloadSession?.tabId || meta?.tabId || null });
      pcaDotSize.value = c.dotSize || pcaDotSize.value;
      pcaFill.value = c.fill || pcaFill.value;
      pcaBorder.value = c.border || pcaBorder.value;
      pcaBorderWidth.value = c.borderWidth || pcaBorderWidth.value;
      pcaMethod.value = c.method || 'pca';
      const restoredMethod = pcaMethod.value || 'pca';
      const fallbackTitle = getDefaultTitleForMethod(restoredMethod);
      const restoredTitle = c.labels && typeof c.labels === 'object' && typeof c.labels.title === 'string' ?
        c.labels.title.trim() :
        '';
      const nextTitle = restoredTitle || getPcaLabelsState(getActivePcaSessionForState(), restoredMethod).title || fallbackTitle;
      patchPcaLabelsState(getPcaProjectionSession({
        reason: 'pca-projection-mutation'
      }), {
        title: nextTitle || fallbackTitle
      }, {
        reason: 'pca-payload-labels'
      });
      debugLog('Debug: pca title restored', {
        title: getPcaLabelsState(getActivePcaSessionForState(), restoredMethod).title
      });
      pcaState.lastMethod = (pcaMethod.value || 'pca').toLowerCase();
      applyMethodUiState(pcaMethod.value);
      pcaAlpha.value = c.alpha || 0;
      pcaAlphaVal.textContent = pcaAlpha.value;
      pcaState.pointStyleScopes = normalizePcaPointStyleScopes(c.pointStyleScopes || {}, {
        controls: {
          ...pcaState.controls,
          fill: pcaFill.value,
          border: pcaBorder.value,
          borderWidth: pcaBorderWidth.value,
          dotSize: pcaDotSize.value,
          alpha: pcaAlpha.value
        },
        grouped: c.grouped,
        labelColors: c.labelColors,
        labelShapes: c.labelShapes,
        labelPointStyles: c.labelPointStyles
      });
      setPcaTableFormat(restoredTableFormat, {
        reason: 'pca-payload-table-format-restore',
        restore: true,
        skipDirty: true,
        refreshReason: 'payload-table-format-restore'
      });
      if (restoredTableFormat === 'grouped' && Array.isArray(pcaState.grouped?.names) && pcaState.grouped.names.length) {
        const activeHot = ensurePcaHotForActiveTab();
        applyPcaGroupedNamesToHot(activeHot, pcaState.grouped.names, {
          source: 'pca-payload-grouped-names-restore'
        });
        applyPcaGroupedSampleLabelsToHot(activeHot, pcaState.grouped.sampleLabels, {
          source: 'pca-payload-grouped-sample-labels-restore'
        });
        normalizePcaGroupedHeaderRow(activeHot, {
          forceGrouped: true,
          source: 'pca-grouped-header-normalize'
        });
        updatePcaGroupedHeaders(activeHot);
      }
      if (Number.isFinite(Number(c.loadingsLimit))) {
        pcaState.loadingsLimit = clampLoadingsLimitValue(c.loadingsLimit, PCA_LOADINGS_ROW_LIMIT);
      } else {
        pcaState.loadingsLimit = clampLoadingsLimitValue(pcaState.loadingsLimit, PCA_LOADINGS_ROW_LIMIT);
      }
      pcaState.biplotShowSampleScores = sanitizePcaBiplotShowSampleScores(c.biplotShowSampleScores);
      pcaState.screeShowParallel = sanitizePcaScreeShowParallel(c.screeShowParallel);
      if (pcaScreeShowParallelInput) {
        pcaScreeShowParallelInput.checked = sanitizePcaScreeShowParallel(pcaState.screeShowParallel);
      }
      if (c.componentSelection && typeof c.componentSelection === 'object') {
        pcaState.componentSelection = {
          rule: sanitizePcaComponentSelectionRule(c.componentSelection.rule),
          eigenThreshold: sanitizePcaEigenThreshold(c.componentSelection.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD),
          parallelIterations: sanitizePcaParallelIterations(c.componentSelection.parallelIterations, PCA_DEFAULT_PARALLEL_ITERATIONS),
          includeNonRetainedAxes: sanitizePcaIncludeNonRetainedAxes(c.componentSelection.includeNonRetainedAxes)
        };
      } else {
        pcaState.componentSelection = {
          rule: sanitizePcaComponentSelectionRule(pcaState.componentSelection?.rule),
          eigenThreshold: sanitizePcaEigenThreshold(pcaState.componentSelection?.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD),
          parallelIterations: sanitizePcaParallelIterations(pcaState.componentSelection?.parallelIterations, PCA_DEFAULT_PARALLEL_ITERATIONS),
          includeNonRetainedAxes: sanitizePcaIncludeNonRetainedAxes(pcaState.componentSelection?.includeNonRetainedAxes)
        };
      }
      syncPcaComponentSelectionUi();
      syncLoadingsLimitUi(PCA_LOADINGS_ROW_LIMIT);
      pcaShowGrid.checked = !!c.showGrid;
      setGridStyle(c.gridStyle, c.axis?.strokeWidth);
      pcaShowFrame.checked = c.showFrame !== false;
      if (pcaShowLegendInput) {
        pcaShowLegendInput.checked = c.showLegend !== false;
        ensurePcaResizerControls();
      }
      const restoredStandardizeVariables = payloadStandardizeVariables;
      const restoredEqualAxisLengths = payloadEqualAxisLengths;
      pcaState.controls = normalizePcaRuntimeControls({
        ...(pcaState.controls || {}),
        standardizeVariables: restoredStandardizeVariables,
        equalAxisLengths: restoredEqualAxisLengths
      });
      if (pcaStandardizeVariables) {
        pcaStandardizeVariables.checked = restoredStandardizeVariables;
      }
      ensurePcaResizerControls();
      if (pcaEqualAxisLengthsInput) {
        pcaEqualAxisLengthsInput.checked = restoredEqualAxisLengths;
      }
      const preprocessingInput = getPcaNodeById('pcaPreprocessing');
      if (preprocessingInput) {
        preprocessingInput.value = sanitizePcaPreprocessingMode(c.preprocessing);
      }
      syncPcaPreprocessingUiState();
      // Legacy unequal-scale and variance-scaled geometry modes remain retired.
      // A legacy equalScaleAxes value migrates to the valid equal-axis-lengths
      // presentation choice; all rendering paths still preserve one unit equally.
      ensurePcaMetricResizePolicy('payload-restore');
      const restoredFontSizeInput = getPcaNodeById('pcaFontSize') || pcaFontSize;
      const restoredFontSizeLabel = getPcaNodeById('pcaFontSizeVal') || pcaFontSizeVal;
      const restoredFontSize = syncPcaFontSizeControl(
        restoredFontSizeInput,
        restoredFontSizeLabel,
        c.fontSize || readPcaInputValue(restoredFontSizeInput, pcaState.controls?.fontSize ?? createDefaultPcaRuntimeControls().fontSize), {
          manual: true
        }
      );
      pcaState.controls = normalizePcaRuntimeControls({
        ...(pcaState.controls || {}),
        fontSize: restoredFontSize
      });
      if (pcaViewMode) {
        const restoredView = projectPcaViewMode(c.viewMode || DEFAULT_VIEW_MODE, 'payload-view-mode');
        debugLog('Debug: pca view mode restored', {
          restoredView
        });
      }
      if (c.axisSelection) {
        const sel = c.axisSelection;
        if (sel && typeof sel === 'object') {
          const before = {
            ...pcaState.axisSelection
          };
          if (Number.isFinite(Number(sel.x))) {
            pcaState.axisSelection.x = Number(sel.x);
          }
          if (Number.isFinite(Number(sel.y))) {
            pcaState.axisSelection.y = Number(sel.y);
          }
          if (Number.isFinite(Number(sel.z))) {
            pcaState.axisSelection.z = Number(sel.z);
          }
          sanitizeAxisSelection(pcaState.axisMeta.length);
          syncAxisSelectValues();
          debugLog('Debug: pca axis selection restored', {
            before,
            after: {
              ...pcaState.axisSelection
            }
          });
        }
      }
      if (c.rotation) {
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
      if (c.tsne) {
        if (pcaTsnePerplexity) {
          pcaTsnePerplexity.value = c.tsne.perplexity ?? pcaTsnePerplexity.value;
        }
        if (pcaTsneLearningRate) {
          pcaTsneLearningRate.value = c.tsne.learningRate ?? pcaTsneLearningRate.value;
        }
        if (pcaTsneIterations) {
          pcaTsneIterations.value = c.tsne.iterations ?? pcaTsneIterations.value;
        }
        if (pcaTsneExaggeration) {
          pcaTsneExaggeration.value = c.tsne.earlyExaggeration ?? pcaTsneExaggeration.value;
        }
        debugLog('Debug: pca tsne settings restored', c.tsne);
      }
      if (c.umap) {
        if (pcaUmapNeighbors) {
          pcaUmapNeighbors.value = c.umap.neighbors ?? pcaUmapNeighbors.value;
        }
        if (pcaUmapMinDist) {
          pcaUmapMinDist.value = c.umap.minDist ?? pcaUmapMinDist.value;
        }
        if (pcaUmapLearningRate) {
          pcaUmapLearningRate.value = c.umap.learningRate ?? pcaUmapLearningRate.value;
        }
        if (pcaUmapEpochs) {
          pcaUmapEpochs.value = c.umap.epochs ?? pcaUmapEpochs.value;
        }
        debugLog('Debug: pca umap settings restored', c.umap);
      }
      syncPcaFontSizeControl(restoredFontSizeInput, restoredFontSizeLabel, restoredFontSize, {
        manual: true
      });
      debugLog('Debug: pca font size base restored', {
        value: restoredFontSize
      });
      const savedStatsModels = normalizePcaSavedStatsModels(c.stats);
      const restoredPanelState = normalizePcaStatsPanelState({
        summaryModel: savedStatsModels.savedSummaryModel,
        resultsModel: savedStatsModels.savedResultsModel,
        reportModel: savedStatsModels.savedReportModel
      });
      setPcaStatsPanelResultsState(restoredPanelState, payloadSession, {
        mirrorActive: payloadOwnerIsActive
      });
      const restoredStats = (obj.stats && typeof obj.stats === 'object') ?
        obj.stats :
        ((c.stats && typeof c.stats === 'object') ? c.stats : null);
      if (restoredStats) {
        setPcaStatsSnapshot(restoredStats, payloadSession, {
          statsPanel: restoredPanelState,
          mirrorActive: payloadOwnerIsActive
        });
        const restoredStatsSnapshot = getPcaStatsSnapshot(payloadSession);
        debugLog('Debug: pca stats restored from payload', {
          hasEigenSummary: Array.isArray(restoredStatsSnapshot?.eigenSummary) && restoredStatsSnapshot.eigenSummary.length > 0,
          hasScree: Array.isArray(restoredStatsSnapshot?.scree) && restoredStatsSnapshot.scree.length > 0,
          method: restoredStatsSnapshot?.method || null,
          hasSavedReportModel: !!savedStatsModels.savedReportModel,
          hasSavedSummaryModel: !!savedStatsModels.savedSummaryModel,
          source: (obj.stats && typeof obj.stats === 'object') ? 'payload.stats' : 'config.stats'
        });
        restorePcaStatsFromPayload({
          ...savedStatsModels,
          session: payloadSession,
          reason: 'pca-payload-stats-restore'
        });
        if (skipDraw && !skipDataLoad) {
          finalizePcaStatsPayloadRestore(savedStatsModels, 'pca-stats-payload-restore-after-data-load', payloadSession);
        }
      } else {
        resetStatsPanel('');
        clearPcaResultsState(payloadSession, {
          mirrorActive: payloadOwnerIsActive
        });
      }
      // Restore label positions through the owner session so same-component
      // activation/reopen paths do not depend on the active PCA mirror.
      if (c.labelPositions) {
        patchPcaLabelPositionsState(getPcaProjectionSession({
          reason: 'pca-projection-mutation'
        }), c.labelPositions, {
          reason: 'pca-payload-label-positions'
        });
      }
      const activeRestoredDataView = dataManager?.getActiveView?.() || null;
      if (!skipDataLoad &&
        sanitizePcaPreprocessingMode(c.preprocessing) === PCA_PREPROCESSING_RNASEQ_LOG &&
        !isPcaRnaSeqDataView(activeRestoredDataView)) {
        materializePcaRnaSeqDataView({
          hot,
          reason: 'pca-payload-rna-seq-migration',
          userInitiated: false,
          alertOnError: false
        });
      }
      if(payloadOwnerIsActive) {
        // Payload is canonical during hydration. Project its owner state first;
        // never let template DOM defaults overwrite the just-loaded session.
        payloadOwnedState.controls = normalizePcaRuntimeControls({
          ...(payloadOwnedState.controls || {}),
          ...controlPatch
        });
        syncPcaRuntimeControlsFromState(payloadOwnedState.controls);
      }
      const payloadOwnerSession = getPcaProjectionSession({
        reason: 'pca-payload-owner-sync'
      });
      if(payloadOwnerIsActive){
        capturePcaSessionStateFromActive(payloadOwnerSession, {
          tabId: payloadOwnerSession?.tabId || meta?.tabId || getPcaProjectionTabId() || null,
          reason: meta?.reason || 'pca-payload-owner-sync'
        });
        const hydratedOwner = getPcaSessionOwnedState(payloadOwnerSession);
        hydratedOwner.state.controls = normalizePcaRuntimeControls({
          ...(hydratedOwner.state.controls || {}),
          ...controlPatch
        });
        syncPcaRuntimeControlsFromState(hydratedOwner.state.controls);
        persistPcaSessionOwnedState(payloadOwnerSession, meta?.reason || 'pca-payload-owner-controls');
      }
      if (styleOnly) {
        if (meta?.colorSchemeOnly === true) {
          const recolorStart = nowMs();
          colorSchemeAppliedInPlace = applyPcaColorSchemeInPlace(payloadOwnerSession);
          if (colorSchemeAppliedInPlace) {
            const recolorMs = nowMs() - recolorStart;
            recordPcaPerformance('draw', {
              totalMs: recolorMs,
              parseMs: 0,
              computeMs: 0,
              renderMs: recolorMs,
              sampleCount: getPcaAnalysisCache(payloadOwnerSession)?.sampleCount || 0,
              featureCount: getPcaAnalysisCache(payloadOwnerSession)?.featureCount || 0,
              method: pcaMethod?.value || 'pca',
              viewOnly: true,
              cacheReused: true,
              inPlace: true,
              reason: meta?.reason || 'pca-style-payload'
            });
          }
        }
        if (!colorSchemeAppliedInPlace) {
          markPcaViewDirty(meta?.reason || 'pca-style-payload', payloadOwnerSession);
        }
      }
      if (!skipDraw && scheduleOriginal) {
        if (styleOnly) {
          if (!colorSchemeAppliedInPlace) {
            scheduleOriginal({
              viewOnly: true,
              reason: meta?.reason || 'pca-style-payload'
            });
          }
        } else {
          scheduleOriginal({
            reason: meta?.reason || (meta?.source ? `payload-${meta.source}` : 'payload')
          });
        }
      }
      if (payloadOwnerIsActive) {
        const activeSvg = getPcaNodeById('pcaPlot', payloadSession?.tabId)?.querySelector?.('#pcaSvg, svg') || null;
        projectPcaRenderedParameterMetadata(activeSvg, payloadSession, c);
      }
      debugLog('Debug: pca payload applied', {
        source: meta.source || 'unknown',
        rows: dataToLoad.length
      });
      return true;
    } finally {
      pcaState.applyingPayload = previousApplyingPayload;
      if (shouldSuspendSchedule && scheduleOriginal) {
        scheduleDrawPca = scheduleOriginal;
      }
    }
  }

  function initNotes() {
    const stack = queryPcaRoot('#pcaGraphPanel .pca-plot-stack') ||
      queryPcaRoot('#pcaGraphPanel .diagram-area');
    if (!stack) {
      if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
        debugLog('Debug: pca notes mount skipped (missing stack)');
      }
      return;
    }
    const ownerTabId = getPcaProjectionTabId() || null;
    const ownerSession = getPcaSession(ownerTabId, {
      tabId: ownerTabId,
      reason: 'pca-notes-init'
    }, { create: true }) || getActivePcaSessionForState();
    const ownerNotes = normalizePcaNotesState(ownerSession?.state?.notes || notesState);
    notesState.text = ownerNotes.text;
    notesState.open = ownerNotes.open;
    notesState.control = Shared.componentLifecycle?.ensureOwnedNotesControl?.({
      componentKey: 'pca',
      ownerTabId,
      container: stack,
      notesState,
      control: notesState.control,
      id: 'pca-notes',
      scopeId: 'pca',
      fontKey: 'notes',
      canUseControl: control => canUsePcaNotesControl(control, ownerSession),
      unavailableMessage: 'pca notes helper unavailable',
      debugLog,
      applyToControl: control => {
        control.setValue(ownerNotes.text);
        control.setOpen(ownerNotes.open);
      },
      onChange: value => {
        patchPcaNotesForOwner(ownerSession, {
          text: value == null ? '' : String(value)
        }, 'pca-notes-change');
      },
      onToggle: open => {
        patchPcaNotesForOwner(ownerSession, {
          open: !!open
        }, 'pca-notes-toggle');
      }
    }) || null;
  }

  function loadPcaGraphFile(file, options = {}) {
    const ownerTabId = String(options?.tabId || options?.operation?.tabId || getPcaProjectionTabId() || '').trim() || null;
    const operation = fileIO?.createGraphOpenOperation?.({
      context: 'pca',
      operation: options?.operation,
      owner: { component: 'pca', tabId: ownerTabId }
    }) || options?.operation || null;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result);
        const routed = fileIO?.routeGraphOpenPayload?.({
          context: 'pca',
          component: 'pca',
          operation,
          payload: obj,
          reason: 'pca-graph-file-open',
          apply: (payload, owner) => applyPcaPayload(payload, {
            source: 'file',
            flagOverlay: true,
            overlayReason: 'graph-file',
            tabId: owner?.tabId || ownerTabId || undefined
          })
        });
        const fallbackOwnerIsCurrent = !ownerTabId || String(getPcaProjectionTabId() || '') === ownerTabId;
        const accepted = routed ? routed.value !== false : (fallbackOwnerIsCurrent && applyPcaPayload(obj, {
          source: 'file',
          flagOverlay: true,
          overlayReason: 'graph-file',
          tabId: ownerTabId || undefined
        }));
        if (!accepted) {
          console.warn('pca payload rejected from file', {
            hasType: !!obj?.type,
            routeStatus: routed?.status || null
          });
        }
      } catch (err) {
        console.error('loadPcaGraph error', err);
      }
    };
    reader.readAsText(file);
  }

  const runPcaDrawCycle = async (drawOpts = {}) => {
    let status = 'complete';
    const drawSession = getPcaSessionForDrawOptions(drawOpts, {
      create: true
    });
    if(drawSession){
      updatePcaDrawRuntime(drawSession, runtime => {
        runtime.inFlight = Math.max(0, Number(runtime.inFlight) || 0) + 1;
      });
    }
    try {
      const result = await drawPca(drawOpts);
      if(result === false){
        status = 'cancelled';
      }
    } catch (err) {
      status = 'error';
      throw err;
    } finally {
      if(drawSession){
        updatePcaDrawRuntime(drawSession, runtime => {
          runtime.inFlight = Math.max(0, (Number(runtime.inFlight) || 1) - 1);
        });
      }
      if ((drawOpts?.reason === 'rotation' || drawOpts?.rotationUpdate === true) && drawSession) {
        const drawRuntime = getPcaDrawRuntime(drawSession);
        const rotationQueued = !!drawRuntime.rotationQueued;
        updatePcaDrawRuntime(drawSession, runtime => {
          runtime.rotationPending = false;
          runtime.rotationPendingLogged = false;
          runtime.rotationQueued = false;
          if (!runtime.rotationActive) {
            runtime.rotationViewport = null;
          }
        });
        commitPcaRotationState(drawSession.state?.state?.rotation, drawSession, 'pca-rotation-settled');
        if (rotationQueued && status === 'complete') {
          scheduleRotationRedraw(pcaState.rotation, drawSession);
        }
      }
      resolvePcaOverlay({ reason: status, status, tabId: drawOpts?.tabId || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({
        componentKey: 'pca',
        tabId: drawSession?.tabId || drawOpts?.tabId || getPcaProjectionTabId() || null,
        action: 'draw-settled',
        reason: drawOpts?.reason || 'pca-draw',
        phase: status
      });
    }
  };

  let pcaScheduleBase = null;

  function getPcaScheduleBase() {
    if (!pcaScheduleBase) {
      pcaScheduleBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer ?
        Shared.componentLifecycle.createTabScopedFrameDebouncer(pca, 'pca', runPcaDrawCycle, {
          reason: 'pca-draw-frame'
        }) :
        runPcaDrawCycle;
    }
    return pcaScheduleBase;
  }

  const schedulePcaInstrumented = (opts) => {
    const nextOpts = opts || {};
    const overlayReason = nextOpts.reason || (nextOpts.force || nextOpts.forceOverlay ? 'manual-render' : 'schedule');
    const suppressOverlay = nextOpts.silentOverlay === true || (nextOpts.viewOnly === true && nextOpts.forceOverlay !== true);
    if ((nextOpts.force || nextOpts.forceOverlay) && !suppressOverlay) {
      markPcaOverlayPending({ reason: overlayReason, tabId: nextOpts.tabId || resolvePcaAsyncTabId(nextOpts) || getPcaProjectionTabId() || null });
      forcePcaOverlay(overlayReason, {
        tabId: nextOpts.tabId || resolvePcaAsyncTabId(nextOpts) || getPcaProjectionTabId() || null,
        message: 'Rendering PCA view...'
      });
    } else if (!suppressOverlay) {
      queuePcaOverlay(overlayReason);
    }
    const runSchedule = () => getPcaScheduleBase()(nextOpts);
    if (Shared.componentLifecycle?.runDrawWithOverlayPaintGate?.({
        component: pca,
        componentKey: 'pca',
        options: nextOpts,
        tabId: nextOpts.tabId || resolvePcaAsyncTabId(nextOpts) || getPcaProjectionTabId() || null,
        reason: overlayReason,
        overlayController: pcaOverlayController,
        delayForOverlay: !suppressOverlay,
        debugLog,
        scheduleFrame: callback => schedulePcaScopedFrame({
          ...(nextOpts || {}),
          reason: `${overlayReason}-overlay-frame`
        }, callback),
        run: runSchedule
      })) {
      return;
    }
    runSchedule();
  };

  function resolvePcaActivationTab(tabLike) {
    if (tabLike && typeof tabLike === 'object') {
      return tabLike;
    }
    const tabId = (typeof tabLike === 'string' ? tabLike : null) ||
      getPcaProjectionTabId() ||
      null;
    if (!tabId) {
      return null;
    }
    try {
      const tabs = Array.isArray(global.Main?.session?.workspaceState?.tabs) ?
        global.Main.session.workspaceState.tabs :
        [];
      return tabs.find(entry => entry && String(entry.id || '') === String(tabId)) || null;
    } catch (_err) {
      return null;
    }
  }

  function hasPcaPlottableData(hot) {
    const matrix = hot?.getData?.();
    if (!Array.isArray(matrix) || matrix.length < 2) {
      return false;
    }
    for (let r = 1; r < matrix.length; r += 1) {
      const row = matrix[r];
      if (!Array.isArray(row)) {
        continue;
      }
      for (let c = 1; c < row.length; c += 1) {
        const value = row[c];
        if (value == null) {
          continue;
        }
        if (typeof value === 'number') {
          if (Number.isFinite(value)) {
            return true;
          }
          continue;
        }
        if (typeof value === 'string') {
          if (value.trim()) {
            return true;
          }
          continue;
        }
        return true;
      }
    }
    return false;
  }

  function hasPcaPrimaryGraphContent(tabLike) {
    const tabId = (typeof tabLike === 'string' ? tabLike : tabLike?.id) ||
      getPcaProjectionTabId() ||
      null;
    const plotRoot = getPcaNodeById('pcaPlot', tabId) || getPcaNodeById('pcaPlot');
    if (typeof Shared.componentLifecycle?.hasRenderableGraphContent === 'function') {
      return !!Shared.componentLifecycle.hasRenderableGraphContent(plotRoot);
    }
    return !!plotRoot?.querySelector?.('#pcaSvg,svg,canvas');
  }

  function schedulePcaActivationRecoveryDraw(tabLike, reason) {
    const tabId = (typeof tabLike === 'string' ? tabLike : tabLike?.id) ||
      getPcaProjectionTabId() ||
      null;
    if (hasPcaPrimaryGraphContent(tabLike)) {
      return false;
    }
    const activeHot = ensurePcaHotForActiveTab();
    if (!hasPcaPlottableData(activeHot)) {
      return false;
    }
    markPcaViewDirty(`${reason || 'activate-tab'}-blank-graph`);
    schedulePcaDrawForSession(getPcaSession(tabId || null, {
      tabId: tabId || null,
      reason: `${reason || 'activate-tab'}-blank-graph`
    }, {
      create: false
    }) || getActivePcaSessionForState(), {
      tabId: tabId || null,
      reason: `${reason || 'activate-tab'}-blank-graph`,
      viewOnly: true,
      force: true,
      forceDraw: true,
      userInitiated: true,
      restoreOwnerStatsAfterDraw: true
    });
    return true;
  }

  function projectPcaStatsForOwner(tabLike, reason = 'activate-tab') {
    const resolvedTab = resolvePcaActivationTab(tabLike);
    const ownerTabId = String(resolvedTab?.id || getPcaProjectionTabId() || '').trim();
    if (!ownerTabId || String(getPcaProjectionTabId() || '').trim() !== ownerTabId) {
      return false;
    }
    const ownerSession = getPcaSession(ownerTabId, {
      tabId: ownerTabId,
      reason: `${reason}:project-stats`
    }, {
      create: false
    });
    if (!ownerSession || !getPcaStatsSnapshot(ownerSession)) {
      return false;
    }
    rebindPcaProjectionDomRefs(ownerTabId);
    return restorePcaStatsFromPayload({
      ...normalizePcaSavedStatsModels(getPcaStatsPanelSnapshot(ownerSession)),
      session: ownerSession,
      reason: `${reason}:project-stats`
    });
  }

  function finalizePcaActivation(tabLike, reason = 'activate-tab') {
    const resolvedTab = resolvePcaActivationTab(tabLike);
    const payloadConfig = resolvedTab?.payload?.config || {};
    applyPcaMethodUiPreActivation(payloadConfig);
    ensurePcaResizerControls();
    const hot = ensurePcaHotForActiveTab();
    if (hot) {
      ensurePcaDataViewsForHot(hot, {
        wrapper: getPcaNodeById('pcaHotWrapper'),
        container: hot.__pcaHostContainer || getPcaNodeById('pcaHot')
      });
      syncPcaActiveDataViewFromHot(hot, `${reason || 'activate-tab'}:prepare-tab`);
    }
    const activationSession = getPcaSession(resolvedTab || resolvedTab?.id || getPcaProjectionTabId() || null, {
      tabId: resolvedTab?.id || getPcaProjectionTabId() || null,
      reason: `${reason || 'activate-tab'}:rehydrate-controls`
    }, { create: false }) || getActivePcaSessionForState();
    const activationControls = hydratePcaControlsFromCanonicalTab(resolvedTab || resolvedTab?.id || null, activationSession, `${reason || 'pca-activate'}:canonical-controls`);
    syncPcaRuntimeControlsFromState(activationControls || activationSession?.state?.state?.controls || {});
    initNotes();
    rehydratePcaAxisControlsFromAnalysisCache(activationSession, `${reason || 'activate-tab'}:axis-controls`);

    // Same-component DOM reuse is projection-only. Rebuild every statistics subpanel
    // from the newly bound owner session so dynamic panels (notably the biplot) never
    // inherit or lose state through the previously visible PCA tab's DOM.
    projectPcaStatsForOwner(resolvedTab, reason || 'activate-tab');
    rehydrateActivePca3dInteraction(getActivePcaSessionForState(), 'pca-3d-activate');

    if (!hasPcaPrimaryGraphContent(resolvedTab)) {
      const requested = schedulePcaActivationRecoveryDraw(resolvedTab, reason || 'activate-tab');
      debugLog('Debug: pca activation graph probe', {
        tabId: resolvedTab?.id || getPcaProjectionTabId() || null,
        reason: reason || 'activate-tab',
        hasGraph: false,
        scheduledRecoveryDraw: !!requested
      });
    }
  }

  function detachChildren(node) {
    return Shared.componentLifecycle?.detachCacheableChildren?.(node) || null;
  }

  function restoreChildren(node, payload) {
    if (!node || !payload || !payload.fragment) {
      return false;
    }
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
    node.appendChild(payload.fragment);
    return true;
  }

  pcaShowPointFormatControls = function showPcaPointFormatControls(targetNode) {
    if (!targetNode || !Shared.symbolToolbar || typeof Shared.symbolToolbar.show !== 'function') {
      return;
    }
    const pointData = targetNode.__pcaPointData || {};
    const pointLabel = String(pointData.label || '').trim() || 'Selected point';
    const pointKey = resolvePcaPointStyleKey(pointData);
    const groupMeta = resolveCurrentPcaGroupMeta();
    const groupIndex = Number.isInteger(pointData.groupIndex) ?
      pointData.groupIndex :
      (Number.isInteger(pointData.index) ? groupMeta?.assignments?.[pointData.index] : null);
    const encodeScope = (kind, dataset = '') => typeof Shared.encodeScopeValue === 'function' ?
      Shared.encodeScopeValue(kind, dataset) :
      (dataset ? `${kind}::${encodeURIComponent(dataset)}` : kind);
    const pointScopeValue = pointKey ? encodeScope('point', pointKey) : '';
    const scopeOptions = [{ value: 'global', label: 'All points', disabled: false }];
    if (pcaState.tableFormat === 'grouped' && Array.isArray(groupMeta?.entries)) {
      groupMeta.entries.forEach(entry => {
        scopeOptions.push({
          value: encodeScope('group', String(entry.index)),
          label: `Group · ${entry.label}`,
          scopeDataset: String(entry.index),
          scopeKind: 'group',
          disabled: false
        });
      });
    }
    if (pointKey) {
      scopeOptions.push({
        value: pointScopeValue,
        label: `Point · ${pointLabel}`,
        scopeDataset: pointKey,
        scopeKind: 'point',
        disabled: false
      });
    }
    const initialScopeValue = pointScopeValue || (Number.isInteger(groupIndex) ? encodeScope('group', String(groupIndex)) : 'global');
    const resolveToolbarScope = ctx => ({
      kind: String(ctx?.scope || 'global').trim().toLowerCase(),
      dataset: String(ctx?.scopeDataset || '').trim()
    });
    const getScopedStyle = ctx => {
      const scope = resolveToolbarScope(ctx);
      return resolvePcaScopedPointStyle(scope.kind, scope.dataset, pointData, groupMeta);
    };
    const applyScopedPatch = (patch, ctx, reason) => {
      const scope = resolveToolbarScope(ctx);
      if (!applyPcaScopedPointStylePatch(scope.kind, scope.dataset, patch, {
        groupMeta,
        reason
      })) {
        return;
      }
      if (scope.kind === 'global') {
        if (patch.fill != null) {
          pcaFill.value = patch.fill;
          pcaState.controls.fill = String(patch.fill);
        }
        if (patch.borderColor != null) {
          pcaBorder.value = patch.borderColor;
          pcaState.controls.border = String(patch.borderColor);
        }
        if (patch.borderWidth != null) {
          pcaBorderWidth.value = String(patch.borderWidth);
          pcaState.controls.borderWidth = String(patch.borderWidth);
        }
        if (patch.size != null) {
          pcaDotSize.value = String(patch.size);
          pcaState.controls.dotSize = String(patch.size);
        }
        if (patch.alpha != null) {
          pcaAlpha.value = String(patch.alpha);
          pcaAlphaVal.textContent = String(patch.alpha);
          pcaState.controls.alpha = String(patch.alpha);
        }
      } else if (scope.kind === 'group') {
        const index = Number(scope.dataset);
        if (patch.fill != null) updateGroupedColorInput(index, patch.fill);
        if (patch.shape != null) updateGroupedShapeInput(index, patch.shape);
      }
      requestPcaViewRefresh(reason || 'point-style-change');
    };
    Shared.symbolToolbar.show({
      document: global.document,
      target: targetNode,
      anchorId: 'pcaFontHost',
      scopeId: 'pca',
      formClass: 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls pca-point-controls',
      scope: {
        label: 'Scope',
        options: scopeOptions,
        value: initialScopeValue
      },
      fillShape: {
        label: 'Fill/Shape',
        shapeOptions: GROUP_SHAPE_OPTIONS,
        getColor(ctx) {
          return getScopedStyle(ctx).fill || pcaFill.value || '#0000ff';
        },
        getShape(ctx) {
          return sanitizeGroupShape(getScopedStyle(ctx).shape || 'circle', 0);
        },
        onColorInput(value, ctx) {
          applyScopedPatch({ fill: value }, ctx, 'fill-change');
        },
        onColorChange(value, ctx) {
          applyScopedPatch({ fill: value }, ctx, 'fill-change');
        },
        onShapeChange(value, ctx) {
          const sanitized = sanitizeGroupShape(value || 'circle', 0);
          applyScopedPatch({ shape: sanitized }, ctx, 'shape-change');
        }
      },
      border: {
        label: 'Border',
        getColor(ctx) {
          return getScopedStyle(ctx).borderColor || pcaBorder.value || '#000000';
        },
        onColorInput(value, ctx) {
          applyScopedPatch({ borderColor: value }, ctx, 'border-color-change');
        },
        onColorChange(value, ctx) {
          applyScopedPatch({ borderColor: value }, ctx, 'border-color-change');
        },
        getWidth(ctx) {
          return Number(getScopedStyle(ctx).borderWidth) || 0;
        },
        onWidthChange(value, ctx) {
          const next = Math.max(0, Number(value) || 0);
          applyScopedPatch({ borderWidth: next }, ctx, 'border-width-change');
        }
      },
      size: {
        get(ctx) {
          return Number(getScopedStyle(ctx).size) || 0;
        },
        onChange(value, ctx) {
          const next = Math.max(0, Number(value) || 0);
          applyScopedPatch({ size: next }, ctx, 'dot-size-change');
        }
      },
      transparency: {
        label: 'Transparency',
        get(ctx) {
          return Number(getScopedStyle(ctx).alpha) || 0;
        },
        onChange(value, ctx) {
          const next = Math.min(1, Math.max(0, Number(value) || 0));
          applyScopedPatch({ alpha: next }, ctx, 'alpha-change');
        }
      }
    });
  };

  pca.save = savePcaFile;

  pca.saveAs = saveAsPcaFile;

  pca.open = openPcaFile;

  pca.loadFromFile = loadPcaGraphFile;

  pca.loadFromPayload = function loadPcaFromPayload(payload, options = {}) {
    if (!applyPcaPayload(payload, {
        source: 'payload',
        ...options
      })) {
      console.warn('pca payload application failed', {
        source: 'payload'
      });
    }
  };

  pca.applyColorSchemePayload = function applyPcaColorSchemePayload(payload, options = {}) {
    return applyPcaPayload(payload, {
      source: 'color-scheme',
      colorSchemeOnly: true,
      ...options
    });
  };

  pca.getColorSchemeContext = function getPcaColorSchemeContext(meta = {}) {
    const tabId = meta?.tabId || getPcaProjectionTabId() || null;
    const session = tabId ? getPcaSession(tabId, meta, {
      create: false
    }) : getActivePcaSessionForState();
    const cachedLabels = getPcaAnalysisCache(session)?.labels;
    if (Array.isArray(cachedLabels) && cachedLabels.length) {
      return {
        labelKeys: Array.from(new Set(cachedLabels.map(label => String(label || '').trim()).filter(Boolean)))
      };
    }
    if (String(tabId || '') !== String(getPcaProjectionTabId() || '')) {
      return {
        labelKeys: []
      };
    }
    const data = ensurePcaHotForActiveTab()?.getData?.() || [];
    const sampleRowIndex = getPcaHeaderRowIndexForMode();
    return {
      labelKeys: Array.from(new Set((data[sampleRowIndex] || []).slice(1).map(label => String(label || '').trim()).filter(Boolean)))
    };
  };

  pca.getPayload = getPcaGraphPayload;

  {
    const tableUiHooks = Shared.hot?.makeTableUiStateHooks?.(
      () => (typeof ensurePcaHotForActiveTab === 'function' ? ensurePcaHotForActiveTab() : null) || pcaHotInstance,
      'pca'
    );
    pca.captureUiState = tableUiHooks ? tableUiHooks.capture : () => null;
    pca.applyUiState = tableUiHooks ? tableUiHooks.apply : () => false;
  }

  pca.captureRuntimeState = function capturePcaRuntimeState(meta = {}) {
    const requestedTabId = String(meta?.tabId || meta?.workspaceTabId || meta?.tab?.id || getPcaProjectionTabId() || '').trim();
    const requestedSession = requestedTabId
      ? getPcaSession(requestedTabId, { ...(meta || {}), tabId: requestedTabId, reason: meta?.reason || 'pca-runtime-capture-owner' }, { create: false })
      : getActivePcaSessionForState();
    const captureSession = ensurePcaSessionOwnershipShape(requestedSession);
    if (!captureSession) {
      return null;
    }
    const captureContext = Shared.componentLifecycle?.resolveOwnerCaptureContext?.('pca', {
      ...(meta || {}),
      tabId: captureSession.tabId
    }, {
      component: pca,
      projectedSession: projectedPcaSession,
      session: captureSession,
      root: captureSession.root || null,
      allowMissingWorkspaceOwner: true
    }) || null;
    const workspaceState = global.Main?.session?.workspaceState;
    const exactActiveOwner = String(workspaceState?.activeTabId || '') === String(captureSession.tabId || '')
      && workspaceState?.tabs?.some?.(tab => String(tab?.id || '') === String(captureSession.tabId || '') && tab?.type === 'pca');
    const captureLive = (captureContext
      ? captureContext.canCaptureLive === true
      : isPcaSessionActiveForModuleState(captureSession)) || exactActiveOwner;

    if (captureLive) {
      syncPcaRuntimeControlsFromDom();
      capturePcaSessionStateFromActive(captureSession, {
        ...(meta || {}),
        tabId: captureSession.tabId,
        reason: meta?.reason || 'pca-runtime-capture-live'
      });
    }

    const record = normalizePcaSessionRecord(captureSession.state, captureSession.tabId);
    const ownedState = cloneSimple(record.state) || createDefaultPcaOwnedState();
    const renderRuntime = getPcaRenderRuntime(captureSession, { seedFromActive: captureLive, mirrorActive: captureLive });
    ownedState.rotationPending = false;
    ownedState.rotationPendingLogged = false;
    ownedState.dataDirty = renderRuntime.dataDirty !== false;
    ownedState.viewDirty = renderRuntime.viewDirty !== false;
    ownedState.labelPositions = normalizePcaLabelPositionsState(ownedState.labelPositions || {});
    ownedState.pointStyleScopes = normalizePcaPointStyleScopes(ownedState.pointStyleScopes || {}, {
      controls: ownedState.controls,
      grouped: ownedState.grouped
    });
    ownedState.controls = normalizePcaRuntimeControls(ownedState.controls || createDefaultPcaRuntimeControls());

    const results = normalizePcaResultsState(record.results || {
      stats: record.stats || null,
      statsPanel: record.statsPanel || {}
    });
    const snapshot = {
      state: ownedState,
      results: cloneSimple(results) || createDefaultPcaResultsState(),
      stats: cloneSimple(results.stats) || null,
      statsPanel: normalizePcaStatsPanelState(results.statsPanel || {}),
      notes: normalizePcaNotesState(record.notes),
      pendingDrawOptions: {},
      reason: meta?.reason || 'pca-runtime-capture'
    };
    const effectiveMeta = {
      ...(meta || {}),
      tabId: captureSession.tabId,
      reason: snapshot.reason
    };
    rememberPcaOwnedRuntimeRecord(captureSession.tabId, {
      ...effectiveMeta,
      reason: `${snapshot.reason}-owned-record`
    });
    debugLog('Debug: pca runtime snapshot captured', {
      tabId: captureSession.tabId || null,
      fromLiveProjection: captureLive,
      viewMode: ownedState.controls?.viewMode || null,
      notesOpen: !!snapshot.notes?.open,
      reason: snapshot.reason
    });
    const remembered = Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(pca, snapshot, effectiveMeta);
    return remembered || (!Shared.componentLifecycle ? snapshot : null);
  };

  pca.applyRuntimeState = function applyPcaRuntimeState(snapshot, meta = {}) {
    const effectiveMeta = {
      ...(meta || {}),
      tabId: meta.tabId || meta.workspaceTabId || meta.tab?.id || getPcaProjectionTabId() || null,
      reason: meta?.reason || 'pca-runtime-apply'
    };
    snapshot = Shared.componentLifecycle?.resolveComponentRuntimeSnapshot?.(pca, snapshot, effectiveMeta) || (!Shared.componentLifecycle ? snapshot : null);
    if (!snapshot || typeof snapshot !== 'object') {
      debugLog('Debug: pca runtime snapshot apply skipped', {
        tabId: meta?.tabId || null,
        reason: 'missing-snapshot'
      });
      bindExistingPcaOwnedRuntimeRecord(effectiveMeta.tab || effectiveMeta.tabId || null, {
        ...effectiveMeta,
        reason: effectiveMeta.reason || 'pca-runtime-apply-missing-snapshot-bind-owned-runtime'
      });
      return false;
    }
    const runtimeWorkspace = global.Main?.session?.workspaceState;
    const explicitCanonicalTab = meta?.tab?.type === 'pca' ? meta.tab : null;
    const canonicalTab = explicitCanonicalTab || runtimeWorkspace?.tabs?.find?.(
      tab => String(tab?.id || '') === String(effectiveMeta.tabId || '') && tab?.type === 'pca'
    ) || runtimeWorkspace?.tabs?.find?.(
      tab => String(tab?.id || '') === String(runtimeWorkspace?.activeTabId || '') && tab?.type === 'pca'
    ) || null;
    applyPcaOwnedRuntimeSlicesFromSnapshot(snapshot, effectiveMeta.tab || effectiveMeta.tabId || null, {
      ...effectiveMeta,
      reason: effectiveMeta.reason || 'pca-runtime-apply-owned-slices'
    });
    const applySession = getPcaSession(effectiveMeta.tab || effectiveMeta.tabId || null, {
      ...effectiveMeta,
      reason: effectiveMeta.reason || 'pca-runtime-apply-owner'
    }, { create: false }) || getActivePcaSessionForState();
    if (snapshot.state && typeof snapshot.state === 'object') {
      const nextState = snapshot.state;
      pcaState.axisSelection = cloneSimple(nextState.axisSelection) || pcaState.axisSelection;
      pcaState.axisMeta = cloneSimple(nextState.axisMeta) || pcaState.axisMeta || [];
      pcaState.rotation = cloneSimple(nextState.rotation) || pcaState.rotation;
      pcaState.rotationPending = false;
      pcaState.rotationPendingLogged = false;
      if (Object.prototype.hasOwnProperty.call(nextState, 'axisSettings')) {
        pcaState.axisSettings = cloneSimple(nextState.axisSettings) || pcaState.axisSettings;
      }
      if (Object.prototype.hasOwnProperty.call(nextState, 'gridStyle')) {
        pcaState.gridStyle = cloneSimple(nextState.gridStyle);
      }
      pcaState.tableFormat = typeof nextState.tableFormat === 'string' ? nextState.tableFormat : pcaState.tableFormat;
      pcaState.grouped = cloneSimple(nextState.grouped) || pcaState.grouped;
      pcaState.componentSelection = cloneSimple(nextState.componentSelection) || pcaState.componentSelection;
      pcaState.biplotShowSampleScores = sanitizePcaBiplotShowSampleScores(nextState.biplotShowSampleScores);
      pcaState.screeShowParallel = sanitizePcaScreeShowParallel(nextState.screeShowParallel);
      pcaState.loadingsLimit = Number.isFinite(Number(nextState.loadingsLimit)) ? Number(nextState.loadingsLimit) : pcaState.loadingsLimit;
      pcaState.labels = cloneSimple(nextState.labels) || pcaState.labels;
      pcaState.lastMethod = typeof nextState.lastMethod === 'string' ? nextState.lastMethod : pcaState.lastMethod;
      pcaState.lastAutoDrawEvaluation = cloneSimple(nextState.lastAutoDrawEvaluation) || pcaState.lastAutoDrawEvaluation;
      pcaState.lastDataShape = cloneSimple(nextState.lastDataShape) || pcaState.lastDataShape;
      if (Object.prototype.hasOwnProperty.call(nextState, 'performance')) {
        pcaState.performance = cloneSimple(nextState.performance) || {
          loadData: null,
          draw: null,
          evaluation: null
        };
      }
      pcaState.fastPointMode = !!nextState.fastPointMode;
      updatePcaRenderRuntime(getPcaProjectionSession({
        reason: 'pca-projection-mutation'
      }), renderRuntime => {
        renderRuntime.dataDirty = nextState.dataDirty !== false;
        renderRuntime.viewDirty = nextState.viewDirty !== false;
      }, {
        seedFromActive: true
      });
      pcaState.labelPositions = normalizePcaLabelPositionsState(cloneSimple(nextState.labelPositions) || pcaState.labelPositions);
      pcaState.theme = cloneSimple(nextState.theme) || pcaState.theme;
      pcaState.pointStyleScopes = normalizePcaPointStyleScopes(nextState.pointStyleScopes || {}, {
        controls: nextState.controls || pcaState.controls,
        grouped: nextState.grouped,
        labelColors: nextState.colors?.labelColors,
        labelShapes: nextState.colors?.labelShapes,
        labelPointStyles: nextState.colors?.labelPointStyles
      });
      if (nextState.colors && typeof nextState.colors === 'object') {
        const restoredColors = nextState.colors;
        if (pcaFill && typeof restoredColors.fill === 'string' && restoredColors.fill) {
          pcaFill.value = restoredColors.fill;
        }
        if (pcaBorder && typeof restoredColors.border === 'string' && restoredColors.border) {
          pcaBorder.value = restoredColors.border;
        }
        if (pcaBorderWidth && restoredColors.borderWidth != null && restoredColors.borderWidth !== '') {
          pcaBorderWidth.value = restoredColors.borderWidth;
        }
        if (pcaDotSize && restoredColors.dotSize != null && restoredColors.dotSize !== '') {
          pcaDotSize.value = restoredColors.dotSize;
        }
        if (pcaAlpha && restoredColors.alpha != null && restoredColors.alpha !== '') {
          pcaAlpha.value = restoredColors.alpha;
          if (pcaAlphaVal) {
            pcaAlphaVal.textContent = pcaAlpha.value;
          }
        }
      }
    }
    if (snapshot.state && typeof snapshot.state === 'object') {
      syncPcaRuntimeControlsFromState(snapshot.state.controls || {});
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'results')) {
      setPcaResultsState(snapshot.results, applySession, {
        mirrorActive: isPcaSessionActiveForModuleState(applySession)
      });
    } else {
      if (Object.prototype.hasOwnProperty.call(snapshot, 'stats')) {
        setPcaStatsSnapshot(snapshot.stats, applySession, {
          mirrorActive: isPcaSessionActiveForModuleState(applySession)
        });
      }
      if (Object.prototype.hasOwnProperty.call(snapshot, 'statsPanel')) {
        setPcaStatsPanelResultsState(snapshot.statsPanel, applySession, {
          mirrorActive: isPcaSessionActiveForModuleState(applySession)
        });
      } else {
        const statsSnapshot = getPcaStatsSnapshot(applySession);
        if (statsSnapshot?.statsPanel) {
          setPcaStatsPanelResultsState(statsSnapshot.statsPanel, applySession, {
            mirrorActive: isPcaSessionActiveForModuleState(applySession)
          });
        }
      }
    }
    const restoredStatsSnapshot = getPcaStatsSnapshot(applySession);
    const restoredPanelSnapshot = getPcaStatsPanelSnapshot(applySession);
    if (restoredStatsSnapshot && typeof restorePcaStatsFromPayload === 'function') {
      restorePcaStatsFromPayload({
        ...normalizePcaSavedStatsModels(restoredPanelSnapshot),
        session: applySession,
        reason: 'pca-runtime-apply-stats'
      });
    } else if (pcaStatsPanelSnapshotHasContent(restoredPanelSnapshot)) {
      restorePcaStatsPanelState(restoredPanelSnapshot, {
        session: applySession,
        clearWhenMissing: false
      });
    }
    if (snapshot.notes && typeof snapshot.notes === 'object') {
      notesState.text = snapshot.notes.text == null ? '' : String(snapshot.notes.text);
      notesState.open = !!snapshot.notes.open;
      if (notesState.control) {
        notesState.control.setValue(notesState.text);
        notesState.control.setOpen(notesState.open);
      }
    }
    updatePcaDrawRuntime(getPcaProjectionSession({
      reason: 'pca-projection-mutation'
    }), runtime => {
      runtime.pendingDrawOptions = {};
    }, {
      seedFromActive: true
    });
    const ownedRecord = rememberPcaOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, {
      ...(meta || {}),
      reason: meta?.reason || 'pca-runtime-apply'
    });
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(pca, snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'pca-runtime-apply'
    });
    debugLog('Debug: pca runtime snapshot applied', {
      tabId: meta?.tabId || getPcaProjectionTabId() || null,
      ownedRuntimeTabId: ownedRecord?.tabId || pca.__pcaOwnedRuntimeTabId || null,
      tableFormat: pcaState.tableFormat,
      reason: meta?.reason || 'pca-runtime-apply'
    });
    return true;
  };

  pca.deactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
    component: pca,
    componentKey: 'pca',
    cancel: (tab, meta = {}) => {
      const record = rememberPcaOwnedRuntimeRecord(tab || meta?.tabId || null, {
        ...(meta || {}),
        reason: meta?.reason || 'pca-deactivate-remember-owned-runtime'
      });
      const session = getPcaSession(tab || meta?.tabId || record?.tabId || null, {
        ...(meta || {}),
        reason: 'pca-deactivate-session'
      }, {
        create: false
      }) || getActivePcaSessionForState();
      const runtime = getPcaDrawRuntime(session, {
        seedFromActive: true
      });
      if (runtime.dataDrawTimer) {
        try {
          Shared.componentLifecycle?.clearComponentTimeout?.(pca, runtime.dataDrawTimer);
        } catch (err) {}
      }
      if (runtime.dataDrawFrame) {
        try {
          Shared.componentLifecycle?.cancelComponentFrame?.(pca, runtime.dataDrawFrame);
        } catch (err) {}
      }
      updatePcaDrawRuntime(session, drawRuntime => {
        drawRuntime.token = (Number(drawRuntime.token) || 0) + 1;
        drawRuntime.rotationPending = false;
        drawRuntime.rotationPendingLogged = false;
        drawRuntime.dataDrawTimer = null;
        drawRuntime.dataDrawFrame = null;
      });
    }
  }) || function deactivatePcaTab(tab, meta = {}) {
    const record = rememberPcaOwnedRuntimeRecord(tab || meta?.tabId || null, {
      ...(meta || {}),
      reason: meta?.reason || 'pca-deactivate-remember-owned-runtime'
    });
    const session = getPcaSession(tab || meta?.tabId || record?.tabId || null, {
      ...(meta || {}),
      reason: 'pca-deactivate-session'
    }, {
      create: false
    }) || getActivePcaSessionForState();
    const runtime = getPcaDrawRuntime(session, {
      seedFromActive: true
    });
    if (runtime.dataDrawTimer) {
      try {
        Shared.componentLifecycle?.clearComponentTimeout?.(pca, runtime.dataDrawTimer);
      } catch (err) {}
    }
    if (runtime.dataDrawFrame) {
      try {
        Shared.componentLifecycle?.cancelComponentFrame?.(pca, runtime.dataDrawFrame);
      } catch (err) {}
    }
    const updatedRuntime = updatePcaDrawRuntime(session, drawRuntime => {
      drawRuntime.token = (Number(drawRuntime.token) || 0) + 1;
      drawRuntime.rotationPending = false;
      drawRuntime.rotationPendingLogged = false;
      drawRuntime.dataDrawTimer = null;
      drawRuntime.dataDrawFrame = null;
    });
    pca.__runtimeGeneration = (Number(pca.__runtimeGeneration) || 0) + 1;
    debugLog('Debug: pca tab deactivated', {
      tabId: (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null,
      drawToken: updatedRuntime?.token || 0,
      generation: pca.__runtimeGeneration,
      reason: meta?.reason || 'deactivate-tab'
    });
    return true;
  };

  pca.captureEmptyPayloadTemplate = function capturePcaEmptyPayloadTemplate() {
    const snapshot = pca.createEmptyPayload();
    console.debug('Debug: pca empty payload template captured', {
      hasTemplate: !!snapshot
    });
    return snapshot;
  };

  pca.restoreEmptyPayloadTemplate = function restorePcaEmptyPayloadTemplate(template, options = {}) {
    if (!template || typeof template !== 'object') {
      console.debug('Debug: pca empty payload template restore skipped', {
        reason: 'invalid-template',
        options
      });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    console.debug('Debug: pca empty payload template restored', {
      hasTemplate: !!emptyPayloadTemplate,
      reason: options.reason || 'unspecified'
    });
    return !!emptyPayloadTemplate;
  };

  pca.createEmptyPayload = function createEmptyPcaPayload() {
    console.debug('Debug: pca.createEmptyPayload pure factory invoked', {
      ready: !!pca.ready,
      boundTabId: getPcaProjectionTabId() || null
    });
    const payload = {
      type: 'pca',
      config: {}
    };
    payload.type = 'pca';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function' ?
      createEmpty(DEFAULT_ROWS, DEFAULT_COLS) :
      Array.from({
        length: DEFAULT_ROWS
      }, () => Array(DEFAULT_COLS).fill(''));
    if (Array.isArray(emptyData[0])) {
      emptyData[0][0] = PCA_POINT_LABEL_ROW_HEADER;
      for (let c = 1; c < emptyData[0].length; c += 1) {
        emptyData[0][c] = false;
      }
    }
    payload.data = emptyData;
    payload.exclusions = [];
    payload.filters = null;
    payload.stats = null;
    if (payload.config) {
      if (typeof payload.config.colorScheme !== 'string' || !payload.config.colorScheme.trim()) {
        payload.config.colorScheme = Shared.colorSchemes?.getDefaultSchemeId?.('pca') || 'scientific';
      }
      payload.config.stats = payload.config.stats && typeof payload.config.stats === 'object' ?
        payload.config.stats :
        {};
      payload.config.stats.summaryModel = null;
      payload.config.labels = {
        title: getDefaultTitleForMethod('pca')
      };
      payload.config.axisSelection = {
        x: 1,
        y: 2,
        z: 3
      };
      payload.config.rotation = {
        x: 0,
        y: 0,
        z: 0,
        quaternion: {
          w: 1,
          x: 0,
          y: 0,
          z: 0
        }
      };
    }
    return payload;
  };

  pca.serialize = serializeSvg;

  pca.getHotInstance = () => getActivePcaSessionForState()?.managers?.hot || pcaHotInstance;

  ensurePcaDomBindings = function ensurePcaDomBindingsForTab(tabLike, meta = {}) {
    if (typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function') {
      return false;
    }
    const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
      componentKey: 'pca',
      tabLike: tabLike || null,
      meta,
      sentinelSelector: '#pcaHot',
      getCurrentRoot: () => pcaRoot || null,
      getCurrentSentinel: () => pca.__domSentinel || null,
      rebind: info => {
        pcaRoot = info?.root || resolvePcaRoot(tabLike || info?.tabId || null);
        const nextTabId = info?.tab?.id || info?.tabId || meta?.tabId || (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || null;
        const coreControl = pcaRoot?.querySelector?.('#pcaMethod');
        const hasLiveControlBindings = !!(coreControl?.__pcaControlHandlers
          && Object.keys(coreControl.__pcaControlHandlers).length);
        const passiveRebind = (meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true)
          && hasLiveControlBindings;
        if (passiveRebind) {
          pca.__boundTabId = nextTabId || getPcaProjectionTabId() || null;
          bindPcaSessionForTab(nextTabId || getPcaProjectionTabId() || null, {
            ...(meta || {}),
            root: pcaRoot || null,
            reason: meta?.reason || 'pca-passive-dom-rebind'
          });
          rebindPcaProjectionDomRefs(nextTabId || getPcaProjectionTabId() || null);
          syncPcaSessionRefsFromActive();
          syncPcaSessionManagersFromActive();
          pca.__domSentinel = info?.mountedSentinel || getPcaNodeById('pcaHot');
          pca.ready = true;
          console.debug('Debug: Components.pca.setup passive DOM rebind', {
            tabId: getPcaProjectionTabId() || null
          });
          return;
        }
        console.debug('Debug: Components.pca.setup refreshing stale DOM bindings');
        pca.ready = false;
        setup({
          root: pcaRoot,
          tabId: nextTabId,
          reason: 'workspace-dom-rebind'
        });
        finalizePcaActivation(info?.tab || tabLike || info?.tabId || null, 'workspace-dom-rebind');
      }
    });
    return !!rebound?.rebound;
  };

  pca.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: pca,
    componentKey: 'pca',
    resolveRoot: tabLike => resolvePcaRoot(tabLike || null),
    setRoot: root => {
      pcaRoot = root || pcaRoot || null;
    },
    ensureBindings: (tabLike, meta = {}) => {
      const rebound = ensurePcaDomBindings(tabLike, meta);
      bindExistingPcaOwnedRuntimeRecord(tabLike || meta?.tabId || null, {
        ...(meta || {}),
        reason: meta?.reason || 'pca-activate-bind-existing-owned-runtime'
      });
      const activeOwnerSession = getPcaSession(tabLike || meta?.tabId || getPcaProjectionTabId() || null, meta, { create: false }) || getActivePcaSessionForState();
      const activeControls = hydratePcaControlsFromCanonicalTab(tabLike || meta?.tabId || null, activeOwnerSession, `${meta?.reason || 'pca-activate'}:canonical-controls`);
      syncPcaRuntimeControlsFromState(activeControls || createDefaultPcaRuntimeControls());
      initNotes();
      rehydratePcaAxisControlsFromAnalysisCache(activeOwnerSession, `${meta?.reason || 'pca-activate-bindings'}:axis-controls`);
      // The live-DOM fast path can complete without invoking afterReady. Project the
      // newly active owner's derived panels here after its runtime record is bound.
      projectPcaStatsForOwner(tabLike || meta?.tabId || null, meta?.reason || 'pca-activate-bindings');
      return rebound;
    },
    init: options => setup(options),
    afterReady: (tabLike, meta = {}) => {
      bindExistingPcaOwnedRuntimeRecord(tabLike || meta?.tabId || null, {
        ...(meta || {}),
        reason: meta?.reason || 'pca-activate-bind-owned-runtime'
      });
      finalizePcaActivation(tabLike || null, 'activate-tab');
    },
    getSentinel: () => getPcaNodeById('pcaHot')
  }) || function activateTab(tab, meta = {}) {
    const targetTabId = (typeof tab === 'string' ? tab : tab?.id) ||
      getPcaProjectionTabId() ||
      null;
    if (targetTabId && getPcaProjectionTabId() && getPcaProjectionTabId() !== targetTabId) {
      pcaRoot = resolvePcaRoot(tab || null);
      pca.ready = false;
      setup({
        root: pcaRoot,
        tabId: targetTabId,
        reason: 'activate-tab-rebind'
      });
    }
    pca.__boundTabId = targetTabId || getPcaProjectionTabId() || null;
    pcaRoot = resolvePcaRoot(tab || targetTabId || null);
    bindExistingPcaOwnedRuntimeRecord(tab || targetTabId || null, {
      ...(meta || {}),
      tabId: targetTabId,
      reason: meta.reason || 'pca-activate-bind-owned-runtime'
    });
    if (ensurePcaDomBindings(tab || targetTabId || null)) {
      return;
    }
    finalizePcaActivation(tab || targetTabId || null, meta.reason || 'activate-tab');
    pca.__domSentinel = getPcaNodeById('pcaHot');
  };

  pca.captureRenderCache = function captureRenderCache(meta = {}) {
    let plot = getPcaNodeById('pcaPlot');
    const activeHot = ensurePcaHotForActiveTab();
    const hasGraphBeforeCapture = hasPcaPrimaryGraphContent(getPcaProjectionTabId() || null);
    if (!hasGraphBeforeCapture && hasPcaPlottableData(activeHot)) {
      const session = getActivePcaSessionForState();
      updatePcaRenderRuntime(session, runtime => {
        runtime.viewDirty = true;
      }, {
        seedFromActive: true
      });
      debugLog('Debug: pca render cache capture found plottable data without mounted graph', {
        tabId: session?.tabId || getPcaProjectionTabId() || null
      });
      plot = plot || getPcaNodeById('pcaPlot');
    }
    // Only the (expensive) graph is snapshotted. The stats panel is derived from
    // the active session results and is rebuilt on restore (see restoreRenderCache);
    // snapshotting its DOM orphaned the component's cached node refs and dropped
    // scree/biplot/summary.
    const plotCache = detachChildren(plot);
    const session = getActivePcaSessionForState();
    getPcaRenderRuntime(session, {
      seedFromActive: true
    });
    if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      debugLog('Debug: pca render cache captured', {
        plotNodes: plotCache?.count || 0,
        hasRuntimeCache: !!getPcaAnalysisCache(session),
        tabId: session?.tabId || null
      });
    }
    const complete = Shared.componentLifecycle?.payloadHasRenderableContent?.(plotCache, {
      selectors: ['#pcaSvg', 'svg', 'canvas'],
      markupPattern: /(<svg\b|id=["']pcaSvg["']|<canvas\b)/i
    }) ?? (Number(plotCache?.count || 0) > 0);
    const ownerTabId = session?.tabId || getPcaProjectionTabId() || meta?.tabId || null;
    const cacheMeta = Shared.renderCacheSchema?.createMetadata?.({ component: 'pca', tabId: ownerTabId, complete })
      || { version: 2, component: 'pca', type: 'pca', tabId: ownerTabId, complete };
    const rotationModel = normalizePca3dRotationModel(session?.cache?.pca3dRotationModel || null);
    return {
      plot: plotCache,
      runtimeCache: cloneSimple(getPcaAnalysisCache(session)) || null,
      rotationModel: rotationModel ? (cloneSimple(rotationModel) || rotationModel) : null,
      __graphitixRenderCache: cacheMeta
    };
  };

  pca.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}) {
    const valid = Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'pca',
      graph: {
        selectors: ['#pcaSvg', 'svg', 'canvas'],
        markupPattern: /(<svg\b|id=["']pcaSvg["']|<canvas\b)/i
      },
      requireGraph: true
    }) ?? !!cache;
    if(!valid){
      return false;
    }
    const graphCachePayload = cache?.[cache?.__graphitixRenderCache?.graphicKey] || cache?.plot || cache?.preview || cache?.graph || cache?.svg || cache?.stage;
    return chartStyle.hasCurrentLegendViewportContract?.(graphCachePayload?.fragment || null) !== false;
  };

  pca.isIdleForSnapshot = function isIdleForSnapshot() {
    const session = getActivePcaSessionForState();
    const runtime = getPcaDrawRuntime(session, {
      seedFromActive: true
    });
    const rotationActive = !!(session?.tabId && plot3d.isRotationGestureActiveForTab?.(session.tabId, 'pca'));
    return Math.max(0, Number(runtime.inFlight) || 0) === 0
      && !runtime.rotationPending
      && !runtime.rotationActive
      && !rotationActive;
  };

  pca.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}) {
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(pca, {
        ...meta,
        componentKey: 'pca'
      }) ||
      Promise.resolve({
        ok: true,
        skipped: true,
        reason: 'missing-componentLifecycle'
      });
  };

  pca.rehydrateGraphInteractions = function rehydrateGraphInteractions(meta = {}) {
    const session = getPcaSession(meta.session || meta.tab || meta.tabId || null, meta, { create: false }) || getActivePcaSessionForState();
    const root = meta.root || resolvePcaRoot(session?.tabId || meta.tab || meta.tabId || null);
    const plot = root?.querySelector?.('#pcaPlot') || getPcaNodeById('pcaPlot');
    const svg = plot?.querySelector?.('#pcaSvg') || meta.svgs?.find?.(node => node?.id === 'pcaSvg') || null;
    if (!session || !svg) { return false; }
    const axesReady = axisControls?.rehydrateAxisElements?.(svg, (axis, element, metadata) =>
      buildPcaAxisControlConfig(axis, session, {
        ...(metadata || {}),
        viewMode: element?.ownerSVGElement?.dataset?.viewMode || null
      })
    ) !== false;
    const textReady = rehydratePcaInlineTextInteractions(svg, session);
    svg.querySelectorAll?.('[data-pca-point-interaction]').forEach(node => {
      try { attachPcaPointTooltip(node, JSON.parse(node.getAttribute('data-pca-point-interaction'))); } catch (_err) {}
    });
    svg.querySelectorAll?.('[data-plot-point="1"]').forEach(bindPcaPointFormatInteraction);
    bindPcaLegendInteractions(
      svg.querySelector?.('[data-legend-viewport-content="true"]') || null,
      svg,
      session
    );
    if (svg.dataset?.viewMode === '3d') {
      if (session?.refs?.rotationSvg !== svg || typeof session?.refs?.rotationRenderer !== 'function') {
        if (!bindPca3dRotationRenderer(session, svg, session?.cache?.pca3dRotationModel || null)) { return false; }
      }
      if (!bindPca3dRotationControls(svg, 'pca-3d-cache-rehydrate', session)) { return false; }
    }
    return axesReady && textReady;
  };

  pca.restoreRenderCache = function restoreRenderCache(cache, _meta = {}) {
    if (!cache) {
      return false;
    }
    const graphCachePayload = cache?.[cache?.__graphitixRenderCache?.graphicKey] || cache?.plot || cache?.preview || cache?.graph || cache?.svg || cache?.stage;
    const plot = getPcaNodeById('pcaPlot');
    const restoredPlot = restoreChildren(plot, graphCachePayload);
    const restoredRuntimeCache = cache.runtimeCache && typeof cache.runtimeCache === 'object' ?
      (cloneSimple(cache.runtimeCache) || null) :
      null;
    // Rebuild the stats panel from the target session's results instead of replaying
    // snapshotted DOM: this reattaches the scree/biplot controls and keeps
    // scree/summary/biplot/eigen/loadings in sync on every restore path (file reopen,
    // recovery, tab switch). The active-session mirror is refreshed before this runs,
    // so older payloads remain compatible without making the mirror authoritative.
    const ownerTabId = _meta?.tab?.id || _meta?.tabId || getPcaProjectionTabId() || null;
    const session = getPcaSession(_meta?.tab || ownerTabId || null, {
      ...(_meta || {}),
      reason: 'pca-render-cache-restore-owner'
    }, { create: false }) || getActivePcaSessionForState();
    restorePcaStatsFromPayload({ session, reason: 'pca-render-cache-restore-stats' });
    rebindPcaProjectionDomRefs(ownerTabId);
    const canonicalControls = hydratePcaControlsFromCanonicalTab(ownerTabId, session, 'pca-render-cache-canonical-controls');
    syncPcaRuntimeControlsFromState(canonicalControls || createDefaultPcaRuntimeControls());
    if (restoredRuntimeCache) {
      setPcaAnalysisCache(restoredRuntimeCache, session, {
        mirrorActive: true
      });
    }
    initNotes();
    const axisControlsRehydrated = rehydratePcaAxisControlsFromAnalysisCache(session, 'pca-render-cache-restore-axis-controls');
    updatePcaRenderRuntime(session, renderRuntime => {
      if (restoredRuntimeCache) {
        renderRuntime.cachedRender = getPcaAnalysisCache(session);
        renderRuntime.dataDirty = false;
        renderRuntime.viewDirty = false;
      } else if (restoredPlot) {
        // The restored DOM graph already matches the payload/layout snapshot.
        // Keep resize/view refreshes lightweight instead of forcing an eager
        // full data recompute on the first interaction after reopen.
        renderRuntime.dataDirty = false;
        renderRuntime.viewDirty = false;
      }
    }, {
      seedFromActive: true
    });
    updatePcaDrawRuntime(session, drawRuntime => {
      drawRuntime.resizeWarmupPending = false;
    }, {
      seedFromActive: true
    });
    const svg = plot ? (plot.querySelector('#pcaSvg') || plot.querySelector('svg')) : null;
    projectPcaRenderedParameterMetadata(svg, session);
    if(restoredPlot){
      chartStyle.rehydrateLegendViewports?.(plot);
      bindPcaLegendInteractions(
        svg?.querySelector?.('[data-legend-viewport-content="true"]') || null,
        svg,
        session
      );
    }
    const restoredRotationModel = normalizePca3dRotationModel(cache.rotationModel || session?.cache?.pca3dRotationModel || null);
    if (restoredRotationModel && session?.cache) {
      session.cache.pca3dRotationModel = cloneSimple(restoredRotationModel) || restoredRotationModel;
    }
    const isRestored3d = restoredPlot && svg?.dataset?.viewMode === '3d';
    const rebound3dRenderer = isRestored3d
      ? bindPca3dRotationRenderer(session, svg, restoredRotationModel)
      : false;
    const rebound3dRotation = rebound3dRenderer
      ? bindPca3dRotationControls(svg, 'pca-3d-restore', session)
      : false;
    let scheduled3dRebuild = false;
    if (isRestored3d && !rebound3dRenderer) {
      // Legacy render caches predate the plain-data rotation model. Keep their
      // restored pixels visible, but do not advertise a live drag controller
      // until a cached view-only redraw has rebuilt the non-serializable renderer.
      clearPca3dRotationRenderer(session);
      updatePcaRenderRuntime(session, renderRuntime => {
        renderRuntime.viewDirty = true;
      }, {
        seedFromActive: true
      });
      schedulePcaDrawForSession(session, {
        tabId: session?.tabId || getPcaProjectionTabId() || null,
        reason: 'pca-3d-restore-rehydrate',
        viewOnly: true,
        force: true,
        forceDraw: true,
        userInitiated: false,
        silentOverlay: true
      });
      scheduled3dRebuild = true;
    }
    if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      debugLog('Debug: pca render cache restored', {
        plot: restoredPlot,
        runtimeCache: !!restoredRuntimeCache,
        axisControlsRehydrated,
        rotationModel: !!restoredRotationModel,
        rebound3dRenderer,
        rebound3dRotation,
        scheduled3dRebuild
      });
    }
    return restoredPlot;
  };

  pca.__state = pcaState;

  function setup(options = {}) {
    const targetTabId = resolvePcaAsyncTabId(options || {}) || null;
    const targetRoot = options?.root || Shared.workspaceTabs?.getMountedRoot?.(targetTabId || null, 'pca') || pcaRoot || resolvePcaRoot(targetTabId || null);
    if (pca.ready && (!targetTabId || pca.__boundTabId === targetTabId) && (!targetRoot || pcaRoot === targetRoot)) {
      console.debug('Debug: Components.pca.setup skipped', {
        tabId: getPcaProjectionTabId() || null
      });
      return;
    }
    if (pca.ready) {
      console.debug('Debug: Components.pca.setup rebinding', {
        previousTabId: getPcaProjectionTabId() || null,
        targetTabId,
        reason: options?.reason || 'setup'
      });
      pca.ready = false;
    }
    pca.__boundTabId = targetTabId || null;
    console.debug('Debug: Components.pca.setup start', {
      tabId: getPcaProjectionTabId() || null
    });
    pcaRoot = targetRoot || resolvePcaRoot(targetTabId || null);
    const setupSession = bindPcaSessionForTab(targetTabId || getPcaProjectionTabId() || null, {
      tabId: targetTabId || getPcaProjectionTabId() || null,
      reason: options?.reason || 'pca-setup-session'
    });
    if (setupSession) {
      applyPcaSessionStateToActive(setupSession, {
        tabId: setupSession.tabId,
        reason: options?.reason || 'pca-setup-session-project'
      });
    }
    syncPcaTableFormatFromOwnedRuntime(targetTabId || getPcaProjectionTabId() || null, {
      ...(options || {}),
      tabId: targetTabId || getPcaProjectionTabId() || null,
      reason: options?.reason || 'pca-setup-table-format'
    });
    const $ = global.$;
    const document = global.document;
    if (!document || typeof Shared?.hot?.createStandardTable !== 'function') {
      console.error('Table factory missing for PCA component');
      return;
    }
    debugLog('Debug: pca graph viewport helper configured', {
      hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
      usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
    });
    // PCA plot setup



    const pcaGraphPanel = getPcaNodeById('pcaGraphPanel');

    pcaPlotDiv = getPcaNodeById('pcaPlot');
    pcaSvgBox = pcaGraphPanel?.querySelector('.svgbox') || null;

    bindPcaPlotContextMenuSuppression(pcaSvgBox);
    pcaEls = {
      tableFormat: getPcaNodeById('pcaTableFormat'),
      groupedControls: getPcaNodeById('pcaGroupedControls'),
      groupedReplicates: getPcaNodeById('pcaGroupedReplicates'),
      groupedList: null,
      groupedAdd: null,
      groupedRemove: null
    };
    pcaRenderRowEl = null;
    pcaRenderButtonEl = null;
    pcaAutoDrawNoticeEl = null;
    syncPcaAutoDrawNoticeWidth = () => {};
    schedulePcaNoticeWidth = () => {};
    pcaLayout = Shared.componentLayout?.createStandardPanels({
      componentName: 'pca',
      tabId: targetTabId || undefined,
      root: pcaRoot || undefined,
      reason: options?.reason || 'pca-setup',
      selectors: {
        tablePanel: '#pcaTablePanel',
        graphPanel: '#pcaGraphPanel',
        panelResizer: '#pcaPanelResizer',
        hotWrapper: '#pcaHotWrapper',
        hotContainer: '#pcaHot',
        svgBox: () => queryPcaRoot('#pcaGraphPanel .svgbox'),
        resizeTarget: () => queryPcaRoot('#pcaGraphPanel .svgbox')
      },
      scheduleDraw: (...args) => scheduleActivePcaDraw(...args),
      preserveGraphContent: false,
      panelSyncOptions: {
        disableAutoWidthClamp: true,
        lockGraphPanelWidth: false
      },
      onAfterSync: () => syncPcaAutoDrawNoticeWidth('panel-sync'),
      resizableBoxOptions: {
        forceAspectLocked: true,
        showAspectControl: false,
        cartesianLayoutTransactionEnabled: context => {
          const ownerTabId = String(context?.tabId || targetTabId || '').trim() || null;
          const ownerSession = ownerTabId
            ? getPcaSession(ownerTabId, { tabId: ownerTabId }, { create: false })
            : null;
          if(!ownerSession) return false;
          const ownerState = getPcaSessionOwnedState(ownerSession).state;
          return String(ownerState?.controls?.viewMode || DEFAULT_VIEW_MODE).trim().toLowerCase() !== '3d';
        },
        onResize: (phase) => {
          const resizePhase = typeof phase === 'string' ? phase : '';
          const aspectLocked = pcaSvgBox?.dataset?.resizerAspectLocked === 'true';
          debugLog('Debug: pca layout onResize schedule trigger', {
            phase: resizePhase || null,
            aspectLocked
          });
          schedulePcaNoticeWidth('resize');
          evaluateAutoDrawThresholds({
            source: 'resize',
            phase: resizePhase || null
          });
          requestPcaViewRefresh('resize', {
            force: true,
            silentOverlay: true,
            resizePhase: resizePhase || null
          });
        }
      }
    });
    if (pcaLayout?.elements?.svgBox) {
      pcaSvgBox = pcaLayout.elements.svgBox;
    }
    pcaSvgBoxRef = pcaSvgBox;
    if (projectedPcaSession) {
      projectedPcaSession.managers.layout = pcaLayout || projectedPcaSession.managers.layout || null;
      syncPcaSessionRefsFromActive(projectedPcaSession);
    }
    bindPcaPlotContextMenuSuppression(pcaSvgBox);
    ensurePcaResizerControls();
    Shared.componentLifecycle?.scheduleComponentFrame?.(pca, 'pca', {
      tabId: getPcaProjectionTabId() || null,
      reason: 'pca-resizer-controls'
    }, () => ensurePcaResizerControls());
    pcaLayout?.setScheduleDraw?.((...args) => scheduleActivePcaDraw(...args));
    pcaLayout?.syncPanels?.();
    syncPcaAutoDrawNoticeWidth('init');
    debugLog('Debug: pca initHot using shared factory', {
      hasFactory: typeof Shared.hot?.createStandardTable === 'function'
    });
    ensurePcaHotForActiveTab();
    bindPcaDataToolbar();
    updateAutoDrawUi();
    evaluateAutoDrawThresholds();

    ensurePcaGroupedDefaults();
    updatePcaTableFormatUI();
    applyPcaTableFormatToHot(ensurePcaHotForActiveTab());

    if (pcaEls.tableFormat) {
      bindPcaControlHandler(pcaEls.tableFormat, 'change', 'table-format', e => {
        setPcaTableFormat(e.target.value);
      });
    }
    if (pcaEls.groupedReplicates) {
      bindPcaControlHandler(pcaEls.groupedReplicates, 'change', 'grouped-replicates', e => {
        const raw = Number(e.target.value);
        const resolved = Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : pcaState.grouped.replicatesPerGroup;
        pcaState.grouped.replicatesPerGroup = resolved;
        e.target.value = String(resolved);
        debugLog('Debug: pca grouped replicates updated', {
          raw,
          resolved
        });
        updatePcaGroupedHeaders(ensurePcaHotForActiveTab());
        capturePcaSessionStateFromActive(getPcaProjectionSession({
          reason: 'pca-projection-mutation'
        }), {
          reason: 'pca-grouped-replicates-change'
        });
        markActivePcaPayloadDirty('pca-grouped-replicates-change');
        requestPcaViewRefresh('group-replicate-change');
      });
    }
    const pcaLoadExampleButton = getPcaNodeById('pcaLoadExample');
    if (pcaLoadExampleButton) {
      pcaLoadExampleButton.addEventListener('click', () => {
        const requestedFormat = pcaState.tableFormat === 'grouped' ? 'grouped' : 'standard';
        let selectedFormat = requestedFormat;
        let exampleRecord = Shared.exampleDatasets?.get?.('pca', selectedFormat);
        const preferredFormat = exampleRecord?.meta?.preferredTableFormat;
        if ((preferredFormat === 'standard' || preferredFormat === 'grouped')
          && preferredFormat !== selectedFormat
          && Shared.exampleDatasets?.has?.('pca', preferredFormat)) {
          selectedFormat = preferredFormat;
          exampleRecord = Shared.exampleDatasets.get('pca', selectedFormat);
        }
        const pcaExample = exampleRecord?.data;
        if(!Array.isArray(pcaExample)){
          console.warn('pca example load skipped: biomedical example registry unavailable', {
            requestedFormat,
            selectedFormat
          });
          return;
        }
        const hot = ensurePcaHotForActiveTab();
        markPcaOverlayPending('example-data');
        hot?.loadData?.(pcaExample, {
          source: 'example-load',
          recordUndo: true,
          undoLabel: 'table:pca:example-load'
        });
        pcaDebug('pca example loaded');
        debugLog('Debug: pca example dataset applied (transposed labels)', {
          requestedFormat,
          selectedFormat,
          rows: pcaExample.length,
          cols: pcaExample[0]?.length
        });
        const groupCount = Math.max(1, Number(exampleRecord.meta?.groupCount) || 2);
        pcaState.grouped = {
          replicatesPerGroup: Math.max(1, Number(exampleRecord.meta?.replicatesPerGroup) || 1),
          colors: DEFAULT_SCATTER_COLORS.slice(0, groupCount),
          shapes: GROUP_SHAPE_DEFAULTS.slice(0, groupCount)
        };
        ensurePcaGroupedDefaults();
        setPcaTableFormat(selectedFormat);
        Shared.exampleDatasets?.applyNotesState?.(notesState, exampleRecord);
        capturePcaSessionStateFromActive(getPcaProjectionSession({
          reason: 'pca-projection-mutation'
        }), {
          reason: 'pca-example-load'
        });
        const ownerTabId = hot?.__pcaTabId || getPcaProjectionTabId() || null;
        Shared.hot?.syncOwnerTabPayloadFullData?.(pcaExample, 'pca-example-load', {
          source: 'example-load',
          hotInstance: hot,
          tabId: ownerTabId,
          affectsAnalysis: true,
          updatePayload: () => getPcaGraphPayload({ tabId: ownerTabId })
        });
        evaluateAutoDrawThresholds();
        scheduleActivePcaDraw({
          force: true,
          reason: 'example-load'
        });
      });
    } else {
      debugLog('Debug: pca load example control unavailable during setup');
    }
    const pcaImportBtn = getPcaNodeById('pcaImport');
    const pcaFileInput = getPcaNodeById('pcaFile');
    const tableImport = Shared.tableImport;
    bindPcaControlHandler(pcaImportBtn, 'click', 'import-table', () => {
      if (!pcaFileInput || typeof pcaFileInput.click !== 'function') {
        console.warn('pca import skipped: file input unavailable');
        return;
      }
      setPcaInputValue(pcaFileInput, '');
      pcaFileInput.click();
    });
    bindPcaControlHandler(pcaFileInput, 'change', 'import-file', async () => {
      if (!tableImport || typeof tableImport.openFile !== 'function') {
        console.warn('pca import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const hasFile = !!(pcaFileInput?.files && pcaFileInput.files[0]);
      let forcedOverlay = false;
      if (hasFile) {
        forcedOverlay = !!forcePcaOverlay('file-import', {
          message: 'Importing table data...'
        });
        markPcaOverlayPending('file-import');
      }
      try {
        const result = await tableImport.openFile(pcaFileInput, {
          hot: ensurePcaHotForActiveTab(),
          minCols: DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: () => {
            markPcaOverlayPending('file-import');
            evaluateAutoDrawThresholds();
            scheduleActivePcaDraw({
              force: true,
              reason: 'import-load',
              skipThresholdEvaluation: true
            });
          },
          debugLabel: 'pca',
          onProcessed: info => {
            pcaDebug('pca data imported', {
              rows: info?.rows,
              cols: info?.cols
            });
            const hot = ensurePcaHotForActiveTab();
            ensurePcaLabelRow(hot, {
              source: 'pca-import'
            });
            const nextRows = hot?.getData?.().length || info?.rows;
            const nextCols = hot?.countCols?.() || info?.cols;
            updatePcaDataShape({
              rows: nextRows,
              cols: nextCols
            });
            evaluateAutoDrawThresholds();
          },
          onCompleted: () => {
            const renderReason = 'import-load';
            markPcaOverlayPending(renderReason);
            forcePcaOverlay(renderReason, {
              message: 'Rendering PCA view...'
            });
          },
          onOwnerInactive: (_result, meta) => {
            resolvePcaOverlay({ reason: 'file-import-owner-inactive', tabId: meta?.tabId || null });
          }
        });
        if (!result && forcedOverlay) {
          resolvePcaOverlay('file-import-empty');
        }
      } catch (err) {
        if (forcedOverlay) {
          resolvePcaOverlay('file-import-error');
        }
        console.error('pca import failed', err);
      }
    });
    pcaLoadingsContainer = getPcaNodeById('pcaLoadingsContainer');
    pcaLoadingsTable = getPcaNodeById('pcaLoadingsTable');
    pcaLoadingsLimitInput = getPcaNodeById('pcaLoadingsLimit');
    pcaLoadingsLimitVal = getPcaNodeById('pcaLoadingsLimitVal');
    pcaLoadingsActions = queryPcaRoot('#pcaLoadingsContainer .loadings-card__actions');
    pcaDefaultLoadingsActionsHost = pcaLoadingsActions?.parentElement || null;
    lastLoadingsRender = null;
    syncLoadingsLimitUi(PCA_LOADINGS_ROW_LIMIT);
    if (pcaLoadingsLimitInput) {
      pcaLoadingsLimitInput.addEventListener('input', () => {
        const maxRows = lastLoadingsRender ?
          Math.max(1, Math.min(
            PCA_LOADINGS_ROW_LIMIT,
            Number(lastLoadingsRender.totalCount) || 0,
            Array.isArray(lastLoadingsRender.rows) ? lastLoadingsRender.rows.length : 0
          )) :
          PCA_LOADINGS_ROW_LIMIT;
        pcaState.loadingsLimit = clampLoadingsLimitValue(pcaLoadingsLimitInput.value, maxRows);
        syncLoadingsLimitUi(maxRows);
        if (lastLoadingsRender) {
          updateLoadingsTable(lastLoadingsRender);
        }
      });
    }
    pcaScreeVarianceRow = getPcaNodeById('pcaScreeVarianceRow');
    pcaVarianceSummary = getPcaNodeById('pcaVarianceSummary');
    pcaVarianceList = getPcaNodeById('pcaVarianceList');
    pcaViewMode = $('#pcaViewMode');
    pcaViewModeInput = pcaViewMode;
    pcaXAxis = $('#pcaXAxis');
    pcaYAxis = $('#pcaYAxis');
    pcaZAxis = $('#pcaZAxis');
    pcaAxis2DControls = getPcaNodeById('pcaAxis2DControls');
    pcaAxis3DControl = getPcaNodeById('pcaAxis3DControl');
    if (pcaAxis3DControl) {
      pcaAxis3DControl.hidden = true;
      pcaAxis3DControl.style.display = 'none';
    }
    pcaMethod = $('#pcaMethod');
    pcaFill = $('#pcaFill');
    pcaBorder = $('#pcaBorder');
    pcaBorderWidth = $('#pcaBorderWidth');
    pcaDotSize = $('#pcaDotSize');
    pcaAlpha = $('#pcaAlpha');
    pcaTsneControls = getPcaNodeById('pcaTsneControls');
    pcaTsnePerplexity = getPcaNodeById('pcaTsnePerplexity');
    pcaTsneLearningRate = getPcaNodeById('pcaTsneLearningRate');
    pcaTsneIterations = getPcaNodeById('pcaTsneIterations');
    pcaTsneExaggeration = getPcaNodeById('pcaTsneExaggeration');
    pcaUmapControls = getPcaNodeById('pcaUmapControls');
    pcaUmapNeighbors = getPcaNodeById('pcaUmapNeighbors');
    pcaUmapMinDist = getPcaNodeById('pcaUmapMinDist');
    pcaUmapLearningRate = getPcaNodeById('pcaUmapLearningRate');
    pcaUmapEpochs = getPcaNodeById('pcaUmapEpochs');
    pcaAlphaVal = $('#pcaAlphaVal');
    pcaComponentRuleInput = null;
    pcaEigenThresholdInput = null;
    pcaParallelIterationsInput = null;
    pcaIncludeNonRetainedAxesInput = null;
    pcaIncludeNonRetainedAxesLabel = null;
    pcaEigenThresholdLabel = null;
    pcaParallelIterationsLabel = null;
    pcaMethodAdvancedSection = null;
    const pcaAutoSizeTargets = [
      pcaMethod,
      pcaViewMode,
      pcaXAxis,
      pcaYAxis,
      pcaZAxis
    ];
    lastPcaViewMode = pcaViewMode?.value || DEFAULT_VIEW_MODE;
    pcaAutoSizeTargets.filter(Boolean).forEach(select => {
      attachPcaSelectAutoSize(select, 'pca');
    });
    ensurePcaComponentSelectionControls();
    pcaFontSize = $('#pcaFontSize') || getPcaNodeById('pcaFontSize');
    pcaFontSizeVal = $('#pcaFontSizeVal') || getPcaNodeById('pcaFontSizeVal');
    const initialPcaFontSize = syncPcaFontSizeControl(
      pcaFontSize,
      pcaFontSizeVal,
      readPcaInputValue(pcaFontSize, pcaState.controls?.fontSize ?? createDefaultPcaRuntimeControls().fontSize), {
        manual: true
      }
    );
    debugLog('Debug: pca font size base initialized', {
      value: initialPcaFontSize
    }); // Debug: initial base size
    pcaShowGrid = $('#pcaShowGrid');
    pcaShowFrame = $('#pcaShowFrame');
    pcaShowLegend = getPcaNodeById('pcaShowLegend');
    if (pcaShowLegend) {
      pcaShowLegendInput = pcaShowLegend;
      const legendHost = pcaShowLegend.closest('label');
      if (legendHost) {
        pcaLegendControl = legendHost;
        ensurePcaResizerControls();
      }
      pcaShowLegend.addEventListener('change', event => {
        runPcaEventOwnerCallback(event, 'pca-legend-toggle', owner => {
          debugLog('Debug: pca showLegend change', {
            checked: pcaShowLegend.checked,
            tabId: owner?.tabId || null
          });
          ensurePcaResizerControls();
          syncPcaRuntimeControlsFromDom();
          const ownerSession = ensurePcaSessionOwnershipShape(owner?.session || null);
          if(ownerSession){
            capturePcaSessionStateFromActive(ownerSession, {
              tabId: owner?.tabId || ownerSession.tabId || null,
              reason: 'pca-legend-toggle'
            });
          }
          Shared.componentLifecycle?.persistOwnedUserState?.('pca', owner, { reason: 'pca-legend-toggle' });
          requestPcaViewRefresh('legend-toggle', { tabId: owner?.tabId || ownerSession?.tabId || undefined, userInitiated: true });
        });
      });
    }
    pcaStandardizeVariables = $('#pcaStandardizeVariables');
    pcaPreprocessing = $('#pcaPreprocessing');
    pcaStatsResults = getPcaNodeById('pcaStatsResults');
    pcaStatsSummary = getPcaNodeById('pcaStatsSummary');
    pcaScreeContainer = getPcaNodeById('pcaScreeContainer');
    pcaScreePlot = getPcaNodeById('pcaScreePlot') || pcaScreeContainer;
    pcaScreeExportControls = getPcaNodeById('pcaScreeExportControls');
    pcaScreeShowParallelInput = getPcaNodeById('pcaScreeShowParallel');
    pcaEigenTableContainer = getPcaNodeById('pcaEigenTableContainer');
    pcaEigenTableWrapper = getPcaNodeById('pcaEigenTableWrapper');
    pcaExportEigenTableBtn = getPcaNodeById('pcaExportEigenTable');
    pcaDefaultEigenExportHost = pcaExportEigenTableBtn?.parentElement || null;
    syncPcaRuntimeControlsFromState(pcaState.controls || createDefaultPcaRuntimeControls());
    updatePcaTableFormatUI();
    syncPcaGroupedControls();
    syncPcaComponentSelectionUi();
    syncLoadingsLimitUi(PCA_LOADINGS_ROW_LIMIT);
    const axisSelectEntries = [{
      axis: 'x',
      element: pcaXAxis
    }, {
      axis: 'y',
      element: pcaYAxis
    }, {
      axis: 'z',
      element: pcaZAxis
    }];
    axisSelectEntries.forEach(({
      axis,
      element
    }) => {
      if (!element) {
        return;
      }
      bindPcaControlHandler(element, 'change', `axis-${axis}`, (_event, owner) => {
        const requested = Number(element.value);
        if (!Number.isFinite(requested)) {
          return;
        }
        const previous = {
          ...pcaState.axisSelection
        };
        const next = patchPcaAxisSelectionForOwner(owner, axis, requested, 'pca-axis-selection-change');
        if (!next) {
          return;
        }
        syncAxisSelectValues();
        const changed = previous.x !== next.x || previous.y !== next.y || previous.z !== next.z;
        debugLog('Debug: pca axis selection change', {
          axis,
          requested,
          final: next[axis],
          changed,
          tabId: owner?.tabId || null
        });
        if (changed) {
          requestPcaDataRefresh('axis-selection-change', {
            tabId: owner?.tabId || undefined,
            userInitiated: true
          });
        }
      });
    });
    applyAxisVisibility(pcaViewMode?.value || DEFAULT_VIEW_MODE);
    applyMethodUiState(pcaMethod?.value || 'pca');
    pcaAlphaVal.textContent = pcaAlpha.value;
    if (pcaViewMode) {
      bindPcaControlHandler(pcaViewMode, 'change', 'view-mode', event => {
        const mode = (pcaViewMode.value || DEFAULT_VIEW_MODE);
        if (event?.isTrusted && mode === '3d' && lastPcaViewMode !== '3d') {
          resetPcaRotation('view-mode-change');
        }
        debugLog('Debug: pca viewMode change', {
          mode
        }); // Debug: view mode toggle listener
        projectPcaViewMode(mode, 'view-mode-change');
        requestPcaViewRefresh('view-mode-change', Shared.componentLifecycle.createStructuralDrawOptions('view-mode-change', { viewOnly: true }));
      });
    }
    if (pcaExportEigenTableBtn) {
      bindPcaControlHandler(pcaExportEigenTableBtn, 'click', 'export-eigen-table', handleEigenExport);
    }
    updateEigenExportVisibility(false);
    bindPcaControlHandler(pcaMethod, 'change', 'method', () => {
      const methodValue = pcaMethod.value;
      debugLog('Debug: pcaMethod changed', {
        method: methodValue
      });
      applyMethodUiState(methodValue);
      markPcaDataDirty('method-change');
      scheduleActivePcaDraw({
        force: true,
        reason: 'method-change'
      });
    });
    bindPcaControlHandler(pcaFill, 'input', 'fill', () => {
      debugLog('Debug: pcaFill changed', {
        value: pcaFill.value
      });
      applyPcaScopedPointStylePatch('global', '', { fill: pcaFill.value }, { reason: 'fill-change' });
      requestPcaViewRefresh('fill-change');
    });
    bindPcaControlHandler(pcaBorder, 'input', 'border', () => {
      debugLog('Debug: pcaBorder changed', {
        value: pcaBorder.value
      });
      applyPcaScopedPointStylePatch('global', '', { borderColor: pcaBorder.value }, { reason: 'border-color-change' });
      requestPcaViewRefresh('border-color-change');
    });
    bindPcaControlHandler(pcaBorderWidth, 'input', 'border-width', () => {
      debugLog('Debug: pcaBorderWidth changed', {
        value: pcaBorderWidth.value
      });
      applyPcaScopedPointStylePatch('global', '', { borderWidth: pcaBorderWidth.value }, { reason: 'border-width-change' });
      requestPcaViewRefresh('border-width-change');
    });
    bindPcaControlHandler(pcaDotSize, 'input', 'dot-size', () => {
      debugLog('Debug: pcaDotSize changed', {
        value: pcaDotSize.value
      });
      applyPcaScopedPointStylePatch('global', '', { size: pcaDotSize.value }, { reason: 'dot-size-change' });
      requestPcaViewRefresh('dot-size-change');
    });
    bindPcaControlHandler(pcaAlpha, 'input', 'alpha', () => {
      const alphaValue = readPcaInputValue(pcaAlpha, pcaState.controls?.alpha ?? createDefaultPcaRuntimeControls().alpha);
      setPcaTextContent(pcaAlphaVal, alphaValue);
      debugLog('Debug: pcaAlpha changed', {
        value: alphaValue
      });
      applyPcaScopedPointStylePatch('global', '', { alpha: alphaValue }, { reason: 'alpha-change' });
      requestPcaViewRefresh('alpha-change');
    });
    bindPcaControlHandler(pcaFontSize, 'input', 'font-size', (_event, owner) => {
      const fontSizeValue = syncPcaFontSizeControl(
        pcaFontSize,
        pcaFontSizeVal,
        readPcaInputValue(pcaFontSize, pcaState.controls?.fontSize ?? createDefaultPcaRuntimeControls().fontSize), {
          manual: true
        }
      );
      debugLog('Debug: pca font size input manual set', {
        value: fontSizeValue
      }); // Debug: manual slider update
      patchPcaRuntimeControlsForOwner(owner, {
        fontSize: fontSizeValue
      }, 'pca-font-size-change');
      requestPcaViewRefresh('font-size-change');
    });
    [pcaTsnePerplexity, pcaTsneLearningRate, pcaTsneIterations, pcaTsneExaggeration].filter(Boolean).forEach(input => {
      bindPcaControlHandler(input, 'input', `tsne-${input.id || 'control'}`, () => {
        console.debug('Debug: tsne control change', {
          id: input.id,
          value: input.value
        });
        requestPcaDataRefresh('tsne-setting-change');
      });
    });
    [pcaUmapNeighbors, pcaUmapMinDist, pcaUmapLearningRate, pcaUmapEpochs].filter(Boolean).forEach(input => {
      bindPcaControlHandler(input, 'input', `umap-${input.id || 'control'}`, () => {
        console.debug('Debug: umap control change', {
          id: input.id,
          value: input.value
        });
        requestPcaDataRefresh('umap-setting-change');
      });
    });
    if (pcaShowGrid) {
      bindPcaControlHandler(pcaShowGrid, 'change', 'show-grid', () => {
        debugLog('Debug: pca showGrid change', {
          checked: pcaShowGrid.checked
        });
        requestPcaViewRefresh('grid-toggle');
      });
    }
    if (pcaPreprocessing) {
      bindPcaControlHandler(pcaPreprocessing, 'change', 'preprocessing', () => {
        const mode = sanitizePcaPreprocessingMode(pcaPreprocessing.value);
        pcaPreprocessing.value = mode;
        const hot = ensurePcaHotForActiveTab?.() || pcaHotInstance;
        const manager = hot?.__pcaDataViewsManager || null;
        const activeView = manager?.getActiveView?.() || null;
        if (mode === PCA_PREPROCESSING_RNASEQ_LOG) {
          if (pcaStandardizeVariables) {
            pcaStandardizeVariables.checked = false;
          }
          if (!materializePcaRnaSeqDataView({
            hot,
            reason: 'preprocessing-change',
            userInitiated: true
          })) {
            pcaPreprocessing.value = PCA_PREPROCESSING_NONE;
          }
        } else if (isPcaRnaSeqDataView(activeView)) {
          manager.activateView(activeView.sourceViewId || 'raw', {
            reason: 'preprocessing-none'
          });
        } else {
          syncPcaPreprocessingModeForDataView(activeView, getPcaSessionForHot(hot, {}, { create: false }));
          requestPcaDataRefresh('preprocessing-change');
        }
        syncPcaPreprocessingUiState();
        debugLog('Debug: pca preprocessing changed', { mode });
      });
    }
    if (pcaStandardizeVariables) {
      bindPcaControlHandler(pcaStandardizeVariables, 'change', 'standardize-variables', (_event, owner) => {
        const enabled = !!pcaStandardizeVariables.checked;
        patchPcaRuntimeControlsForOwner(owner, {
          standardizeVariables: enabled
        }, 'pca-standardize-variables-change');
        debugLog('Debug: pca standardize variables toggle', {
          checked: enabled,
          tabId: owner?.tabId || null
        });
        requestPcaDataRefresh('standardize-variables-toggle', {
          tabId: owner?.tabId || undefined,
          userInitiated: true
        });
      });
    }
    if (pcaScreeShowParallelInput) {
      pcaScreeShowParallelInput.checked = sanitizePcaScreeShowParallel(pcaState.screeShowParallel);
      bindPcaControlHandler(pcaScreeShowParallelInput, 'change', 'scree-show-parallel', () => {
        pcaState.screeShowParallel = sanitizePcaScreeShowParallel(pcaScreeShowParallelInput.checked);
        const toggledInPlace = preservePcaScrollPosition(() => togglePcaScreeParallelVisibility(pcaState.screeShowParallel));
        const statsSnapshot = getPcaStatsSnapshot(getActivePcaSessionForState());
        if (!toggledInPlace && statsSnapshot && typeof statsSnapshot === 'object') {
          preservePcaScrollPosition(() => {
            renderScreeChart({
              show: String(statsSnapshot.method || '').toLowerCase() === 'pca',
              data: Array.isArray(statsSnapshot.scree) ? statsSnapshot.scree : [],
              method: statsSnapshot.method || 'pca',
              pointColor: pcaFill?.value || '#0000ff',
              parallelAnalysis: Array.isArray(statsSnapshot.parallelAnalysis) ? statsSnapshot.parallelAnalysis : []
            });
          });
        }
      });
    }
    bindPcaControlHandler(pcaShowFrame, 'change', 'show-frame', () => {
      debugLog('Debug: pca showFrame change', {
        checked: pcaShowFrame.checked
      });
      requestPcaViewRefresh('frame-toggle');
    });
    if (pcaPlotDiv?.style) {
      pcaPlotDiv.style.removeProperty('background');
    }
    const debugEnabled = typeof Shared?.isDebugEnabled === 'function' ? Shared.isDebugEnabled() : global.DEBUG_PCA === true;
    global.DEBUG_PCA = debugEnabled;
    const pcaContainer = pcaPlotDiv.closest('.svgbox') || pcaPlotDiv.parentElement;
    if (!pcaContainer) {
      debugLog('Debug: pca resizer container missing', {
        hasContainer: !!pcaContainer
      });
    }

    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: getPcaNodeById('pcaExportControls'),
        getSvg: () => getPcaNodeById('pcaSvg'),
        fileName: 'pca',
        contextLabel: 'pca-export',
        componentName: 'pca'
      });
      Shared.exporter.mountSvgControls({
        container: getPcaNodeById('pcaScreeExportControls'),
        getSvg: () => getPcaNodeById('pcaScreeSvg'),
        fileName: 'pca-scree',
        contextLabel: 'pca-scree-export',
        componentName: 'pca-scree'
      });
      debugLog('Debug: pca export controls mounted', {
        hasExporter: true
      }); // Debug: pca export mount
    } else {
      debugLog('Debug: pca export controls unavailable', {
        hasExporter: !!Shared.exporter
      }); // Debug: pca export fallback
    }
    getPcaNodeById('openPcaGraph')?.addEventListener('click', openPcaFile);
    getPcaNodeById('savePcaGraph')?.addEventListener('click', savePcaFile);
    getPcaNodeById('saveAsPca')?.addEventListener('click', saveAsPcaFile);
    getPcaNodeById('pcaGraphFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) {
        const owner = getPcaCallbackOwner({ event: e, reason: 'pca-graph-file-input' });
        const operationSession = owner.session || getActivePcaSessionForState();
        const operationTabId = operationSession?.tabId || owner.tabId || getPcaProjectionTabId() || null;
        setPcaFileNameForSession(f.name, operationSession);
        setPcaFileHandleForSession(null, operationSession);
        loadPcaGraphFile(f, { tabId: operationTabId });
      }
    });

    scheduleDrawPcaRaw = Shared.workspaceTabs?.createTabScopedScheduler ?
      Shared.workspaceTabs.createTabScopedScheduler({
        componentKey: 'pca',
        debugLabel: 'pca-draw-raw',
        getTabId: () => resolvePcaAsyncTabId({}) || resolvePcaOwnedRuntimeTabId(null, {}) || null,
        scheduleRaw: schedulePcaInstrumented
      }) :
      schedulePcaInstrumented;
    pcaLayout?.setScheduleDraw?.((...args) => scheduleActivePcaDraw(...args));
    ensurePcaFontEventListener();
    debugLog('Debug: pca scheduleDraw configured via tab-scoped lifecycle frame'); // Debug: scheduler setup
    initNotes();
    // Setup binds a fresh tab root after the owner state was selected above.
    // Project that owner only after every control reference exists; otherwise
    // template DOM defaults become the visible state on first activation/reopen.
    const setupControls = hydratePcaControlsFromCanonicalTab(
      targetTabId || getPcaProjectionTabId() || null,
      setupSession,
      options?.reason || 'pca-setup-final-control-projection'
    );
    syncPcaRuntimeControlsFromState(
      setupControls || setupSession?.state?.state?.controls || createDefaultPcaRuntimeControls()
    );
    ensureEmptyPayloadTemplate();
    pca.__domSentinel = getPcaNodeById('pcaHot');
    pca.ready = true;
    console.debug('Debug: Components.pca.setup complete');
  }

  function ensureReady(options = {}) {
    pcaRoot = resolvePcaRoot(options.tab || options.tabId || null) || pcaRoot;
    if (ensurePcaDomBindings(options.tab || options.tabId || null, options || {})) {
      return;
    }
    if (!pca.ready) setup({
      ...options,
      tabId: options.tabId || options.tab?.id || getPcaProjectionTabId() || null,
      reason: options.reason || 'ensure-ready'
    });
  }

  pca.init = setup;
  pca.ensure = ensureReady;
  pca.cancelCurrentDraw = function cancelCurrentDraw(meta = {}) {
    const tabId = meta?.tabId || getPcaProjectionTabId() || null;
    const session = getPcaSession(tabId, {
      ...(meta || {}),
      tabId,
      reason: 'pca-cancel-current-draw'
    }, {
      create: false
    }) || getActivePcaSessionForState();
    const runtime = updatePcaDrawRuntime(session, drawRuntime => {
      drawRuntime.token = (Number(drawRuntime.token) || 0) + 1;
      drawRuntime.pendingDrawOptions = {};
      drawRuntime.rotationPending = false;
      drawRuntime.rotationPendingLogged = false;
    }, {
      seedFromActive: true
    });
    try {
      pca.__asyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'pca-draw-cancel');
    } catch (_err) {}
    try {
      pca.__drawAsyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'pca-draw-cancel');
    } catch (_err) {}
    resolvePcaOverlay({ reason: meta?.reason || 'cancelled', tabId });
    Shared.componentLifecycle?.emitLifecycleEvent?.({
      componentKey: 'pca',
      tabId,
      action: 'draw-cancelled',
      reason: meta?.reason || 'pca-draw-cancel',
      details: {
        drawToken: runtime?.token || 0
      }
    });
    return true;
  };
  pca.draw = function draw(options = {}) {
    ensureReady(options || {});
    schedulePcaDrawForSession(getPcaSessionForDrawOptions(options || {}, {
      create: true
    }), options || {});
  };

  function benchmarkPcaLoad(config) {
    const rows = Math.max(2, Math.floor(Number(config?.rows) || 200));
    const cols = Math.max(2, Math.floor(Number(config?.cols) || 5));
    const generator = typeof config?.generator === 'function' ?
      config.generator :
      ((rowIdx, colIdx) => Math.sin(rowIdx * 0.1 + colIdx * 0.5) * 10 + colIdx);
    const matrix = new Array(rows);
    for (let r = 0; r < rows; r++) {
      const row = new Array(cols);
      for (let c = 0; c < cols; c++) {
        row[c] = Number(generator(r, c)) || 0;
      }
      matrix[r] = row;
    }
    const perf = global.performance;
    const start = perf?.now ? perf.now() : Date.now();
    const means = new Array(cols).fill(0);
    for (let r = 0; r < rows; r++) {
      const row = matrix[r];
      for (let c = 0; c < cols; c++) {
        means[c] += row[c];
      }
    }
    for (let c = 0; c < cols; c++) {
      means[c] /= rows;
    }
    const centered = new Array(rows);
    for (let r = 0; r < rows; r++) {
      const row = new Array(cols);
      for (let c = 0; c < cols; c++) {
        row[c] = matrix[r][c] - means[c];
      }
      centered[r] = row;
    }
    const cov = Array.from({
      length: cols
    }, () => new Array(cols).fill(0));
    for (let r = 0; r < rows; r++) {
      const row = centered[r];
      for (let i = 0; i < cols; i++) {
        for (let j = i; j < cols; j++) {
          cov[i][j] += row[i] * row[j];
        }
      }
    }
    const denom = rows - 1 || 1;
    for (let i = 0; i < cols; i++) {
      for (let j = i; j < cols; j++) {
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
    resolveDrawableFrame: plotEl => resolvePcaDrawableFrame(plotEl),
    buildBiplotSnapshot: (points, loadingsRows, axisLabels, selectedAxes) => buildPcaBiplotSnapshot(points, loadingsRows, axisLabels, selectedAxes),
    createMiniScatterSvg: config => createPcaMiniScatterSvg(config),
    resolve2dMetricScales: (xScale, yScale, equalAxisLengths) => resolvePca2dMetricScales(xScale, yScale, equalAxisLengths),
    resolve2dMetricLayout: (width, height, margin, xScale, yScale, equalAxisLengths) =>
      resolvePca2dMetricLayout(width, height, margin, xScale, yScale, equalAxisLengths),
    compute2dAxisLengthResizePlan: input => computePca2dAxisLengthResizePlan(input),
    resolve3dMetricRanges: (axisRanges, equalAxisLengths) => resolvePca3dMetricRanges(axisRanges, equalAxisLengths),
    getSession: tabLike => getPcaSession(tabLike || getPcaProjectionTabId() || null, { reason: 'pca-test-session' }, { create: false }),
    captureStatsPanelForOwner: tabLike => {
      const session = getPcaSession(tabLike || getPcaProjectionTabId() || null, { reason: 'pca-test-stats-capture' }, { create: false });
      return session ? cloneSimple(rememberPcaStatsPanelState(null, { session })) : null;
    },
    restoreStatsPanelForOwner: tabLike => {
      const session = getPcaSession(tabLike || getPcaProjectionTabId() || null, { reason: 'pca-test-stats-restore' }, { create: false });
      return session ? restorePcaStatsPanelState(getPcaStatsPanelSnapshot(session), { session, clearWhenMissing: false }) : false;
    },
    snapshotConfig: session => cloneSimple(snapshotPcaConfig(null, session || getActivePcaSessionForState())),
    calculateMedianRatioSizeFactors: matrix => dataTransformsApi.calculateMedianRatioSizeFactors(matrix),
    preprocessRnaSeqCounts: (matrix, labels, options) => dataTransformsApi.preprocessRnaSeqCounts(matrix, labels, options),
    materializeRnaSeqDataView: options => materializePcaRnaSeqDataView(options),
    normalizePointStyleScopes: (source, options) => normalizePcaPointStyleScopes(source, options),
    getPointStyleScopes: () => cloneSimple(ensurePcaPointStyleScopes()),
    resolvePointStyle: (point, groupIndex, fallbackIndex) => resolvePcaPointStyle(point, groupIndex, fallbackIndex),
    applyPointStylePatch: (scopeKind, scopeDataset, patch, options) => applyPcaScopedPointStylePatch(scopeKind, scopeDataset, patch, options),
    resolveGroupMeta: (sampleCount, labels, options) => resolvePcaGroupMeta(sampleCount, labels, options),
    showPointFormatControls: target => pcaShowPointFormatControls(target),
    getPerformance: () => ({
      performance: cloneSimple(pcaState.performance),
      lastAutoDrawEvaluation: cloneSimple(pcaState.lastAutoDrawEvaluation),
      lastDataShape: cloneSimple(pcaState.lastDataShape),
      state: (() => {
        const runtime = getPcaRenderRuntime(getActivePcaSessionForState(), {
          seedFromActive: true
        });
        return {
          dataDirty: runtime.dataDirty !== false,
          viewDirty: runtime.viewDirty !== false,
          hasCachedRender: !!getPcaAnalysisCache(getActivePcaSessionForState())
        };
      })()
    })
  });

  Shared.componentLifecycle?.installInternalStateBridge?.(pca, {
    componentKey: 'pca',
    targets: [{
      key: 'pcaState',
      get: () => pcaState,
      excludeKeys: ['hot', 'root', 'cachedRender', 'drawToken', 'rotationPending', 'rotationPendingLogged', 'lastAutoDrawEvaluation', 'performance']
    }, {
      key: 'notesState',
      get: () => notesState,
      excludeKeys: ['control']
    }]
  });
})(window);
