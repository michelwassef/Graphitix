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
  const exportFontStyles = scopeId => (fontControls && typeof fontControls.exportScopeStyles === 'function') ?
    fontControls.exportScopeStyles(scopeId) :
    null;
  const importFontStyles = (scopeId, styles) => {
    if (fontControls && typeof fontControls.importScopeStyles === 'function') {
      fontControls.importScopeStyles(scopeId, styles, {
        prune: true
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
  const MIN_VARIANCE_WEIGHT = 1e-3;
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

  function getPcaPinnedTopRowCount(hot) {
    const count = Number.isFinite(hot?.gridApi?.getPinnedTopRowCount?.()) ?
      hot.gridApi.getPinnedTopRowCount() :
      getPcaPinnedMetaRowCountForMode();
    return Math.max(0, count | 0);
  }

  function isPcaPinnedRow(hot, rowIndex) {
    const count = getPcaPinnedTopRowCount(hot);
    return Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < count;
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
  let pcaRoot = null;
  let pcaDataToolbarBound = false;
  const pcaDataToolbarLastActivationByTabId = new Map();
  let pcaAxesLengthLockRatioPrevious = null;
  let pcaAspectSyncing = false;
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
  let pcaVarianceAxisScale = null;
  let pcaScale = null;
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
        replicatesPerGroup: 2,
        colors: [],
        shapes: []
      };
    }
    let replicates = Number(pcaState.grouped.replicatesPerGroup);
    if (!Number.isFinite(replicates) || replicates < 1) {
      replicates = 1;
    }
    pcaState.grouped.replicatesPerGroup = Math.max(1, Math.round(replicates));
    if (!Array.isArray(pcaState.grouped.colors)) {
      pcaState.grouped.colors = [];
    }
    if (!Array.isArray(pcaState.grouped.shapes)) {
      pcaState.grouped.shapes = [];
    }
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

  function buildPcaGroupedColumnDragGroups(hotInstance, options = {}) {
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
        columnDragGroups: null,
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
      columnDragGroups: buildPcaGroupedColumnDragGroups(pcaHot, {
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
        columnDragGroups: null,
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
    let lastKeyDownAt = 0;
    let suppressLabelSelectionToggleUntil = 0;
    let pcaHot = null;
    const scheduleDrawPcaProxy = (payload) => {
      const meta = payload && typeof payload === 'object' ?
        payload :
        (typeof payload === 'string' ? {
          reason: payload
        } : {});
      const reason = meta.reason || 'hot-change';
      const source = meta.source || null;
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
      rowSelection: { mode: 'multiRow', headerCheckbox: false },
      firstRowClassName: 'hot-header-row htCenter',
      headerRowIndex: PCA_HEADER_ROW_INDEX,
      pinFirstRow: getPcaPinnedMetaRowCountForMode({
        forceStandard: true
      }),
      scheduleOnLoadData: true,
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
        beforeKeyDown() {
          lastKeyDownAt = Date.now();
        },
        afterSelectionEnd(r1, c1, r2, c2) {
          activatePcaDataToolbar('table-selection');
          const hot = pcaHot;
          if (!hot || typeof hot.getData !== 'function') {
            return;
          }
          const now = Date.now();
          if (now < suppressLabelSelectionToggleUntil) {
            return;
          }
          if (now - lastKeyDownAt < 80) {
            return;
          }
          const data = hot.getData() || [];
          const labelRowIndex = resolvePcaLabelRowIndex(data);
          if (!Number.isInteger(labelRowIndex)) {
            return;
          }
          const fromRow = Math.min(r1, r2);
          const toRow = Math.max(r1, r2);
          if (fromRow !== labelRowIndex || toRow !== labelRowIndex) {
            return;
          }
          const fromCol = Math.min(c1, c2);
          const toCol = Math.max(c1, c2);
          if (toCol < 1) {
            return;
          }
          const source = 'pca-point-label-toggle';
          if (isPcaPinnedRow(hot, labelRowIndex)) {
            let changed = false;
            for (let c = Math.max(1, fromCol); c <= toCol; c += 1) {
              const current = data[labelRowIndex]?.[c];
              const next = !parsePcaPointLabelFlag(current);
              if (applyPcaCellValue(hot, labelRowIndex, c, next, {
                  source,
                  render: false
                })) {
                changed = true;
              }
            }
            if (changed) {
              if (typeof hot.render === 'function') {
                hot.render();
              }
              markPcaDataDirty(source);
              schedulePcaDrawForSession(getPcaSessionForHot(pcaHot, {
                reason: source
              }, {
                create: false
              }) || getActivePcaSessionForState(), {
                reason: source
              });
              debugLog('Debug: pca label row toggled', {
                row: labelRowIndex,
                fromCol,
                toCol
              });
            }
            return;
          }
          if (typeof hot.setDataAtCell !== 'function') {
            return;
          }
          const changes = [];
          for (let c = Math.max(1, fromCol); c <= toCol; c += 1) {
            const current = typeof hot.getDataAtCell === 'function' ?
              hot.getDataAtCell(labelRowIndex, c) :
              (data[labelRowIndex]?.[c]);
            const next = !parsePcaPointLabelFlag(current);
            changes.push([labelRowIndex, c, next]);
          }
          if (changes.length) {
            hot.setDataAtCell(changes, source);
            debugLog('Debug: pca label row toggled', {
              row: labelRowIndex,
              fromCol,
              toCol
            });
          }
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
            const skipSchedule = sourceText === 'loadData' ||
              sourceText === 'pca-loadData' ||
              sourceText === 'pca-grouped-header-normalize' ||
              sourceText === 'pca-label-row' ||
              sourceText === 'pca-empty-defaults';
            if (!skipSchedule) {
              markPcaDataDirty(sourceText || 'afterChange');
              schedulePcaDrawForSession(getPcaSessionForHot(pcaHot, {
                reason: sourceText || 'afterChange'
              }, {
                create: false
              }) || getActivePcaSessionForState(), {
                force: true,
                reason: sourceText || 'afterChange'
              });
            }
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
          syncPcaActiveDataViewFromHot(pcaHot, 'afterLoadData');
          markPcaDataDirty('afterLoadData');
          schedulePcaDrawForSession(getPcaSessionForHot(pcaHot, {
            reason: 'afterLoadData'
          }, {
            create: false
          }) || getActivePcaSessionForState(), {
            force: true,
            reason: 'afterLoadData'
          });
        },
        afterCreateCol() {
          if (pcaState.tableFormat === 'grouped') {
            normalizePcaGroupedHeaderRow(pcaHot, {
              source: 'pca-grouped-header-normalize'
            });
            updatePcaGroupedHeaders(pcaHot);
          }
          syncPcaActiveDataViewFromHot(pcaHot, 'afterChange');
          markPcaDataDirty('afterCreateCol');
          schedulePcaDrawForSession(getPcaSessionForHot(pcaHot, {
            reason: 'afterCreateCol'
          }, {
            create: false
          }) || getActivePcaSessionForState(), {
            force: true,
            reason: 'afterCreateCol'
          });
        },
        afterRemoveCol() {
          if (pcaState.tableFormat === 'grouped') {
            normalizePcaGroupedHeaderRow(pcaHot, {
              source: 'pca-grouped-header-normalize'
            });
            updatePcaGroupedHeaders(pcaHot);
          }
          syncPcaActiveDataViewFromHot(pcaHot, 'afterChange');
          markPcaDataDirty('afterRemoveCol');
          schedulePcaDrawForSession(getPcaSessionForHot(pcaHot, {
            reason: 'afterRemoveCol'
          }, {
            create: false
          }) || getActivePcaSessionForState(), {
            force: true,
            reason: 'afterRemoveCol'
          });
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
          if (isPcaPinnedRow(hot, labelRowIndex) && typeof hot.render === 'function') {
            hot.render();
          }
          syncPcaActiveDataViewFromHot(hot, 'afterChange');
          markPcaDataDirty(source);
          schedulePcaDrawForSession(getPcaSessionForHot(hot, {
            reason: source
          }, {
            create: false
          }) || getActivePcaSessionForState(), {
            reason: source
          });
          suppressLabelSelectionToggleUntil = Date.now() + 500;
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
        const loadOptions = arguments[1] && typeof arguments[1] === 'object' ? arguments[1] : null;
        const loadSource = String(loadOptions?.source || '').trim();
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
        // Normalize redraw triggering across table backends: some paths may not
        // emit afterLoadData/afterChange hooks for direct loadData calls.
        // Marking data dirty + scheduling here keeps automatic redraw behavior
        // deterministic for loadData callers (tests and runtime alike).
        markPcaDataDirty(loadSource || 'afterLoadData');
        schedulePcaDrawForSession(getPcaSessionForHot(this, {
          reason: loadSource || 'afterLoadData'
        }, {
          create: false
        }) || getActivePcaSessionForState(), {
          force: true,
          reason: loadSource || 'afterLoadData'
        });
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
        onActiveViewChanged(view, meta) {
          if (!view || !hotInstance || typeof hotInstance.loadData !== 'function') {
            return;
          }
          const nextData = Array.isArray(view.data) ? view.data : [];
          hotInstance.loadData(nextData);
          if (view.exclusions) {
            hotInstance.applyExclusions?.(view.exclusions);
          }
          if (view.filters) {
            hotInstance.applyFilters?.(view.filters, {
              schedule: false
            });
          }
          const viewSession = getPcaSessionForHot(hotInstance, {
              reason: 'pca-data-view-switch'
            }, {
              create: false
            }) ||
            getActivePcaSessionForState();
          markPcaDataDirty('data-view-switch');
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
    const varianceInput = getPcaNodeById('pcaVarianceAxisScale');
    if (varianceInput) {
      pcaVarianceAxisScaleInput = varianceInput;
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

  function getPcaLockRatioCheckbox() {
    if (pcaLockRatioInput && pcaLockRatioInput.isConnected) {
      return pcaLockRatioInput;
    }
    const svgBox = pcaSvgBoxRef;
    if (!svgBox) {
      return null;
    }
    const checkbox = svgBox.querySelector('.resizer-aspect-checkbox');
    if (checkbox) {
      pcaLockRatioInput = checkbox;
    }
    return checkbox;
  }

  function getPcaForcedLockRatioPrevious() {
    const value = pcaState?.forcedLockRatioPrevious;
    if (value === true || value === false) {
      return !!value;
    }
    return (pcaAxesLengthLockRatioPrevious === true || pcaAxesLengthLockRatioPrevious === false) ?
      !!pcaAxesLengthLockRatioPrevious :
      null;
  }

  function setPcaForcedLockRatioPrevious(value) {
    const normalized = (value === true || value === false) ? !!value : null;
    pcaAxesLengthLockRatioPrevious = normalized;
    pcaState.forcedLockRatioPrevious = normalized;
    const session = getActivePcaSessionForState?.();
    if (session?.state) {
      session.state.forcedLockRatioPrevious = normalized;
      session.updatedAt = Date.now();
    }
    return normalized;
  }

  function syncPcaAspectControls(reason) {
    if (pcaAspectSyncing) {
      return;
    }
    pcaAspectSyncing = true;
    try {
      const equalAxesEnabled = !!pcaState.equalAxes;
      const equalScaleEnabled = !!pcaState.equalScaleAxes;
      const varianceAxesEnabled = !!pcaState.axesVarianceScaled;
      const viewMode = pcaViewModeInput?.value || DEFAULT_VIEW_MODE;
      const is3dView = String(viewMode).toLowerCase() === '3d';
      const enforceLockRatio = true;
      if (pcaEqualAxesInput && pcaEqualAxesInput.checked !== equalAxesEnabled) {
        pcaEqualAxesInput.checked = equalAxesEnabled;
      }
      if (pcaEqualScaleAxesInput && pcaEqualScaleAxesInput.checked !== equalScaleEnabled) {
        pcaEqualScaleAxesInput.checked = equalScaleEnabled;
      }
      if (pcaVarianceAxisScaleInput && pcaVarianceAxisScaleInput.checked !== varianceAxesEnabled) {
        pcaVarianceAxisScaleInput.checked = varianceAxesEnabled;
      }
      const lockRatioCheckbox = getPcaLockRatioCheckbox();
      if (lockRatioCheckbox) {
        const lockLabel = lockRatioCheckbox.closest('label');
        if (enforceLockRatio) {
          if (getPcaForcedLockRatioPrevious() === null) {
            setPcaForcedLockRatioPrevious(!!lockRatioCheckbox.checked);
          }
          if (!lockRatioCheckbox.checked) {
            lockRatioCheckbox.checked = true;
            lockRatioCheckbox.dispatchEvent(new Event('change', {
              bubbles: true
            }));
          }
          lockRatioCheckbox.disabled = true;
          if (lockLabel) {
            if (!lockLabel.__pcaOriginalTitle) {
              lockLabel.__pcaOriginalTitle = lockLabel.title || '';
            }
            lockLabel.title = 'Locked while axes length is constrained';
          }
        } else {
          lockRatioCheckbox.disabled = false;
          if (lockLabel && lockLabel.__pcaOriginalTitle !== undefined) {
            lockLabel.title = lockLabel.__pcaOriginalTitle;
            delete lockLabel.__pcaOriginalTitle;
          }
          const restoreValue = getPcaForcedLockRatioPrevious();
          if (restoreValue !== null) {
            setPcaForcedLockRatioPrevious(null);
            if (lockRatioCheckbox.checked !== restoreValue) {
              lockRatioCheckbox.checked = restoreValue;
              lockRatioCheckbox.dispatchEvent(new Event('change', {
                bubbles: true
              }));
            }
          }
        }
      }
      debugLog('Debug: pca axes length sync', {
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

  function ensurePcaAxesLengthControlPlacement() {
    refreshPcaResizerControlBindings();
    if (!pcaSvgBoxRef) {
      return;
    }
    const doc = pcaSvgBoxRef.ownerDocument || global.document;
    if (!doc) {
      return;
    }
    let tray = pcaSvgBoxRef.querySelector('.resizer-control-tray');
    if (!tray) {
      tray = doc.createElement('div');
      tray.className = 'resizer-control-tray';
      pcaSvgBoxRef.appendChild(tray);
      debugLog('Debug: pca axes length tray created', {
        trayChildren: tray.childElementCount
      });
    }
    let axesControl = tray.querySelector('.resizer-axeslength-control');
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
      const aspectControl = tray.querySelector('.resizer-aspect-control');
      if (aspectControl && aspectControl.parentNode === tray) {
        tray.insertBefore(axesControl, aspectControl);
      } else {
        tray.appendChild(axesControl);
      }
      debugLog('Debug: pca axes length control created', {
        trayChildren: tray.childElementCount
      });
    }
    const menu = axesControl.querySelector('.resizer-axeslength-menu');
    if (menu) {
      let equalScaleItem = menu.querySelector('.resizer-axeslength-item--equal-scale');
      if (!equalScaleItem) {
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
      } else {
        equalScaleItem.classList.add('resizer-axeslength-item');
      }
      if (equalScaleItem) {
        equalScaleItem.title = 'Equal axis lengths with the same data scale';
        const equalScaleCheckbox = equalScaleItem.querySelector('input[type="checkbox"]');
        if (equalScaleCheckbox) {
          equalScaleCheckbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-scale';
          equalScaleCheckbox.setAttribute('aria-label', 'Equal axis lengths with the same data scale');
        }
        const equalScaleText = equalScaleItem.querySelector('.resizer-axeslength-text');
        if (equalScaleText) {
          equalScaleText.textContent = 'Equal length / same scale';
        }
      }
      let equalLengthItem = menu.querySelector('.resizer-axeslength-item--equal-length');
      if (!equalLengthItem) {
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
      if (equalLengthItem) {
        equalLengthItem.title = 'Equal axis lengths with independent scales';
        const equalLengthCheckbox = equalLengthItem.querySelector('input[type="checkbox"]');
        if (equalLengthCheckbox) {
          equalLengthCheckbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-length';
          equalLengthCheckbox.setAttribute('aria-label', 'Equal axis lengths with independent scales');
        }
        const equalLengthText = equalLengthItem.querySelector('.resizer-axeslength-text');
        if (equalLengthText) {
          equalLengthText.textContent = 'Equal length / different scale';
        }
        if (equalLengthItem.parentNode !== menu) {
          menu.appendChild(equalLengthItem);
        }
      }
      const equalScaleCheckbox = equalScaleItem.querySelector('input[type="checkbox"]');
      if (equalScaleCheckbox) {
        pcaEqualScaleAxesInput = equalScaleCheckbox;
        if (equalScaleCheckbox.__pcaEqualScaleAxesHandler) {
          equalScaleCheckbox.removeEventListener('change', equalScaleCheckbox.__pcaEqualScaleAxesHandler);
        }
        const onChange = () => {
          const enabled = !!equalScaleCheckbox.checked;
          const previous = !!pcaState.equalScaleAxes;
          if (enabled) {
            pcaState.equalAxes = false;
            pcaState.axesVarianceScaled = false;
            if (pcaEqualAxesInput) {
              pcaEqualAxesInput.checked = false;
            }
            if (pcaVarianceAxisScaleInput) {
              pcaVarianceAxisScaleInput.checked = false;
            }
            debugLog('Debug: pca axes length exclusivity enforced', {
              disabled: 'equal-length/variance',
              reason: 'equal-scale-toggle'
            });
          }
          pcaState.equalScaleAxes = enabled;
          debugLog('Debug: pca equal scale toggled', {
            enabled,
            previous
          });
          syncPcaAspectControls('equal-scale-toggle');
          requestPcaViewRefresh('equal-scale-toggle');
        };
        equalScaleCheckbox.addEventListener('change', onChange);
        equalScaleCheckbox.__pcaEqualScaleAxesHandler = onChange;
      }
      const equalLengthCheckbox = equalLengthItem ? equalLengthItem.querySelector('input[type="checkbox"]') : null;
      if (equalLengthCheckbox) {
        pcaEqualAxesInput = equalLengthCheckbox;
        if (equalLengthCheckbox.__pcaEqualAxesHandler) {
          equalLengthCheckbox.removeEventListener('change', equalLengthCheckbox.__pcaEqualAxesHandler);
        }
        const onChange = () => {
          const enabled = !!equalLengthCheckbox.checked;
          const previous = !!pcaState.equalAxes;
          if (enabled) {
            pcaState.equalScaleAxes = false;
            pcaState.axesVarianceScaled = false;
            if (pcaEqualScaleAxesInput) {
              pcaEqualScaleAxesInput.checked = false;
            }
            if (pcaVarianceAxisScaleInput) {
              pcaVarianceAxisScaleInput.checked = false;
            }
            debugLog('Debug: pca axes length exclusivity enforced', {
              disabled: 'equal-scale/variance',
              reason: 'equal-length-toggle'
            });
          }
          pcaState.equalAxes = enabled;
          debugLog('Debug: pca equal length toggled', {
            enabled,
            previous
          });
          syncPcaAspectControls('equal-length-toggle');
          requestPcaViewRefresh('equal-length-toggle');
        };
        equalLengthCheckbox.addEventListener('change', onChange);
        equalLengthCheckbox.__pcaEqualAxesHandler = onChange;
      }
      const varianceInput = pcaVarianceAxisScaleInput || getPcaNodeById('pcaVarianceAxisScale');
      if (varianceInput) {
        pcaVarianceAxisScaleInput = varianceInput;
        const varianceLabel = varianceInput.closest('label');
        if (varianceLabel) {
          varianceLabel.title = 'Scale axes by variance';
          varianceLabel.classList.add('resizer-axeslength-item', 'resizer-axeslength-item--variance');
          varianceLabel.classList.remove('config-panel__checkbox', 'config-panel__checkbox--inline');
          varianceLabel.removeAttribute('style');
          varianceInput.classList.add('resizer-axeslength-checkbox', 'resizer-axeslength-checkbox--variance');
          varianceInput.setAttribute('aria-label', 'Scale axes by variance');
          let varianceText = varianceLabel.querySelector('.resizer-axeslength-text');
          if (!varianceText) {
            varianceText = doc.createElement('span');
            varianceText.className = 'resizer-axeslength-text';
            varianceLabel.appendChild(varianceText);
          }
          varianceText.textContent = 'Variance-scaled';
          const nodes = Array.from(varianceLabel.childNodes);
          nodes.forEach(node => {
            if (node === varianceInput || node === varianceText) {
              return;
            }
            if (node.nodeType === Node.TEXT_NODE) {
              varianceLabel.removeChild(node);
            }
          });
          if (varianceLabel.parentNode !== menu) {
            menu.appendChild(varianceLabel);
          }
        }
      }
      if (equalScaleItem && equalScaleItem.parentNode === menu) {
        menu.appendChild(equalScaleItem);
      }
      if (equalLengthItem && equalLengthItem.parentNode === menu) {
        menu.appendChild(equalLengthItem);
      }
      const varianceItem = menu.querySelector('.resizer-axeslength-item--variance');
      if (varianceItem && varianceItem.parentNode === menu) {
        menu.appendChild(varianceItem);
      }
    }
    syncPcaAspectControls('axes-length-ensure');
  }

  function ensurePcaResizerControls() {
    refreshPcaResizerControlBindings();
    ensurePcaLegendControlPlacement();
    ensurePcaAxesLengthControlPlacement();
  }

  function closePcaAxesLengthMenu(reason) {
    const svgBox = pcaSvgBoxRef;
    if (!svgBox) {
      return;
    }
    const axesControl = svgBox.querySelector('.resizer-axeslength-control');
    if (axesControl && axesControl.hasAttribute('open')) {
      axesControl.removeAttribute('open');
      debugLog('Debug: pca axes length menu closed', {
        reason: reason || null
      });
    }
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
      if (api && typeof api.ensureIndexVisible === 'function') {
        try {
          api.ensureIndexVisible(labelRowIndex, 'middle');
        } catch (e) {
          api.ensureIndexVisible(labelRowIndex);
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
    el.addEventListener('mouseenter', handlePcaPointEnter);
    el.addEventListener('mousemove', handlePcaPointMove);
    el.addEventListener('mouseleave', handlePcaPointLeave);
    el.addEventListener('click', handlePcaPointClick);
    el.addEventListener('contextmenu', handlePcaPointContextMenu);
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
    try {
      const result = await workerApi.runTask({
        name: 'pca-svd',
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
    try {
      const result = await workerApi.runTask({
        name: `pca-${action}`,
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
    if (opts.viewOnly === true && pcaState.rotationPending === true && session && isPcaSessionActiveForModuleState(session)) {
      if (typeof plot3d.createRotationState === 'function') {
        pcaState.rotation = plot3d.createRotationState({
          x: Number(pcaState.rotation?.x) || 0,
          y: Number(pcaState.rotation?.y) || 0,
          z: Number(pcaState.rotation?.z) || 0
        });
      }
      commitPcaRotationState(pcaState.rotation, session, 'pca-scheduler-rotation-mirror');
      updatePcaDrawRuntime(session, runtime => {
        runtime.rotationPending = true;
        runtime.rotationPendingLogged = !!pcaState.rotationPendingLogged;
      }, {
        seedFromActive: true
      });
    }
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

  function capturePcaStatsPanelState(fallback = null) {
    const previous = normalizePcaStatsPanelState(fallback || getPcaResultsState(getActivePcaSessionForState())?.statsPanel || {});
    const summaryTarget = getPcaNodeById('pcaStatsSummary');
    const resultsTarget = getPcaNodeById('pcaStatsResults');
    const summarySnapshot = Shared.statsReporting && typeof Shared.statsReporting.capturePanelModel === 'function' && summaryTarget ?
      Shared.statsReporting.capturePanelModel(summaryTarget) :
      null;
    const resultsSnapshot = Shared.statsReporting && typeof Shared.statsReporting.capturePanelModel === 'function' && resultsTarget ?
      Shared.statsReporting.capturePanelModel(resultsTarget) :
      null;
    return normalizePcaStatsPanelState({
      summaryModel: summarySnapshot?.resultsModel || previous.summaryModel || null,
      resultsModel: resultsSnapshot?.resultsModel || previous.resultsModel || null,
      reportModel: resultsSnapshot?.reportModel || previous.reportModel || null
    });
  }

  function pcaStatsPanelSnapshotHasContent(source) {
    const normalized = normalizePcaStatsPanelState(source);
    return !!(normalized.summaryModel || normalized.resultsModel || normalized.reportModel);
  }

  function restorePcaStatsPanelState(panelState, options = {}) {
    const normalized = normalizePcaStatsPanelState(panelState);
    let restored = false;
    const summaryTarget = getPcaNodeById('pcaStatsSummary');
    const resultsTarget = getPcaNodeById('pcaStatsResults');
    if (summaryTarget && normalized.summaryModel && Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function') {
      Shared.statsReporting.restorePanelModel(summaryTarget, {
        resultsModel: normalized.summaryModel,
        reportModel: null
      }, {
        clearMainWhenMissing: options.clearWhenMissing !== false
      });
      restored = true;
    }
    if (resultsTarget && (normalized.resultsModel || normalized.reportModel) && Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function') {
      const reportHost = Shared.statsReporting && typeof Shared.statsReporting.ensureReportHost === 'function' ?
        Shared.statsReporting.ensureReportHost(resultsTarget, {
          id: 'pcaStatsReportHost',
          className: 'stats-report-host',
          attachToTarget: true,
          position: 'last',
          migrateReportPanels: true
        }) :
        null;
      Shared.statsReporting.restorePanelModel(resultsTarget, {
        resultsModel: normalized.resultsModel,
        reportModel: normalized.reportModel
      }, {
        ensureReportHost: reportHost ? () => reportHost : undefined,
        clearMainWhenMissing: false
      });
      restored = true;
    }
    if (restored) {
      setPcaStatsPanelResultsState(normalized, getPcaProjectionSession({
        reason: 'pca-projection-mutation'
      }), {
        mirrorActive: true
      });
    }
    return restored;
  }

  function rememberPcaStatsPanelState(panelState = null) {
    const normalized = normalizePcaStatsPanelState(panelState || capturePcaStatsPanelState());
    setPcaStatsPanelResultsState(normalized, getPcaProjectionSession({
      reason: 'pca-projection-mutation'
    }), {
      mirrorActive: true
    });
    return getPcaStatsPanelSnapshot(getActivePcaSessionForState());
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
    viewMode,
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
      viewMode || controls?.viewMode || '',
      controls?.scale ? 'scale' : 'center',
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

  function syncPcaAnalysisRuntimeMirror(runtime, session = null) {
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
    const shouldMirror = !shaped || shaped === getActivePcaSessionForState() || isPcaSessionActiveForModuleState(shaped);
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
      return syncPcaAnalysisRuntimeMirror(shaped.cache.analysisRuntime, shaped);
    }
    return createDefaultPcaAnalysisRuntime({
      cache: pcaState.cachedRender || null
    });
  }

  function getPcaAnalysisCache(session = null) {
    return getPcaAnalysisRuntime(session, {
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
      return syncPcaAnalysisRuntimeMirror(shaped.cache.analysisRuntime, shaped)?.cache || null;
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

  function getPcaStatsSnapshot(session = null) {
    const results = getPcaResultsState(session || getActivePcaSessionForState());
    return cloneSimple(results?.stats) || null;
  }

  function getPcaStatsPanelSnapshot(session = null) {
    const results = getPcaResultsState(session || getActivePcaSessionForState());
    return normalizePcaStatsPanelState(results?.statsPanel || {});
  }

  function createDefaultPcaRuntimeControls() {
    return {
      method: 'pca',
      viewMode: DEFAULT_VIEW_MODE,
      showGrid: false,
      showFrame: true,
      showLegend: true,
      scale: false,
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
      scale: !!src.scale,
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

  function readPcaInputValue(input, fallback = '') {
    if (input && Object.prototype.hasOwnProperty.call(input, 'value') && input.value != null) {
      return String(input.value);
    }
    return fallback != null ? String(fallback) : '';
  }

  function setPcaInputValue(input, value) {
    const resolved = value != null ? String(value) : '';
    if (input && Object.prototype.hasOwnProperty.call(input, 'value')) {
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
    const scaleInput = getPcaNodeById('pcaScale');
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
      scale: scaleInput ? !!scaleInput.checked : pcaState.controls?.scale,
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
    return pcaState.controls;
  }

  function createDefaultPcaOwnedState() {
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
      axesVarianceScaled: false,
      equalScaleAxes: true,
      equalAxes: false,
      forcedLockRatioPrevious: null,
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
        parallelIterations: PCA_DEFAULT_PARALLEL_ITERATIONS,
        includeNonRetainedAxes: false
      },
      biplotShowSampleScores: true,
      screeShowParallel: true,
      loadingsLimit: PCA_LOADINGS_ROW_LIMIT,
      labels: {
        title: getDefaultTitleForMethod('pca')
      },
      labelColors: {},
      labelShapes: {},
      labelPointStyles: {},
      labelStyleMode: null,
      labelColorsBackup: null,
      labelShapesBackup: null,
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
      controls: createDefaultPcaRuntimeControls()
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
      svgBox: null,
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
    if (!session || typeof session !== 'object') {
      return false;
    }
    const tabId = String(session.tabId || '').trim();
    const boundTabId = String(getPcaProjectionTabId() || '').trim();
    const activeTabId = String(Shared.workspaceTabs?.getActiveSessionInfo?.('pca')?.tabId || '').trim();
    return !!tabId && (boundTabId === tabId || activeTabId === tabId);
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
      updatedAt: Date.now()
    };
  }

  function normalizePcaDrawRuntime(runtime) {
    return createDefaultPcaDrawRuntime(runtime && typeof runtime === 'object' ? runtime : {});
  }

  function syncPcaDrawRuntimeMirror(runtime, session = null) {
    if (!runtime) {
      return null;
    }
    const shouldMirror = !session || session === getActivePcaSessionForState() || isPcaSessionActiveForModuleState(session);
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
      return syncPcaDrawRuntimeMirror(shaped.timers.drawRuntime, shaped);
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
      seedFromActive: options.seedFromActive === true
    });
    if (typeof mutator === 'function') {
      mutator(runtime);
    }
    runtime.updatedAt = Date.now();
    if (shaped) {
      shaped.timers.drawRuntime = runtime;
      shaped.updatedAt = Date.now();
    }
    return syncPcaDrawRuntimeMirror(runtime, shaped);
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

  function syncPcaRenderRuntimeMirror(runtime, session = null) {
    if (!runtime) {
      return null;
    }
    const shouldMirror = !session || session === getActivePcaSessionForState() || isPcaSessionActiveForModuleState(session);
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
      return syncPcaRenderRuntimeMirror(shaped.cache.renderRuntime, shaped);
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
      seedFromActive: options.seedFromActive === true
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
    return syncPcaRenderRuntimeMirror(runtime, shaped);
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
      return true;
    }
    const workspaceActiveTabId = String(Shared.workspaceTabs?.getActiveSessionInfo?.('pca')?.tabId || '').trim();
    const boundTabId = String(getPcaProjectionTabId()).trim();
    return ownerTabId === workspaceActiveTabId || ownerTabId === boundTabId;
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
    return schedulePcaDrawForSession(getActivePcaSessionForState(), options);
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
      notesState.text = record.notes.text == null ? '' : String(record.notes.text);
      notesState.open = !!record.notes.open;
      if (notesState.control) {
        notesState.control.setValue(notesState.text);
        notesState.control.setOpen(notesState.open);
      }
    }
    syncPcaSessionRefsFromActive(shaped);
    syncPcaSessionManagersFromActive(shaped);
    return true;
  }

  function capturePcaSessionStateFromActive(session = null, meta = {}) {
    const shaped = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    if (!shaped) {
      return null;
    }
    const noteControl = notesState.control || null;
    if (noteControl && typeof noteControl.getValue === 'function') {
      notesState.text = noteControl.getValue();
    }
    if (noteControl && typeof noteControl.isOpen === 'function') {
      notesState.open = noteControl.isOpen();
    }
    getPcaRenderRuntime(shaped, {
      seedFromActive: true
    });
    getPcaDrawRuntime(shaped, {
      seedFromActive: true
    });
    getPcaAnalysisRuntime(shaped, {
      seedFromRenderRuntime: true
    });
    const statsSnapshot = getPcaStatsSnapshot(shaped);
    const panelSnapshot = capturePcaStatsPanelState(shaped.state?.results?.statsPanel || shaped.state?.statsPanel || getPcaStatsPanelSnapshot(shaped));
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
      notes: {
        text: notesState.text || '',
        open: !!notesState.open
      }
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

  function schedulePcaScopedFrame(meta = {}, fn) {
    const tabId = resolvePcaAsyncTabId(meta);
    const scope = tabId ? resolvePcaAsyncScope() : null;
    if (scope && typeof scope.requestAnimationFrame === 'function') {
      return scope.requestAnimationFrame({
        ...meta,
        tabId,
        componentKey: 'pca',
        reason: meta.reason || 'pca-frame'
      }, fn);
    }
    return null;
  }

  function schedulePcaScopedTimeout(meta = {}, fn, delay = 0) {
    const tabId = resolvePcaAsyncTabId(meta);
    const scope = tabId ? resolvePcaAsyncScope() : null;
    if (scope && typeof scope.setTimeout === 'function') {
      return scope.setTimeout({
        ...meta,
        tabId,
        componentKey: 'pca',
        reason: meta.reason || 'pca-timeout'
      }, fn, delay);
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
      axesVarianceScaled: !!pcaState.axesVarianceScaled,
      equalScaleAxes: pcaState.equalScaleAxes !== false,
      equalAxes: !!pcaState.equalAxes,
      forcedLockRatioPrevious: (pcaState.forcedLockRatioPrevious === true || pcaState.forcedLockRatioPrevious === false) ?
        !!pcaState.forcedLockRatioPrevious :
        null,
      axisSettings: cloneSimple(pcaState.axisSettings) || createDefaultAxisSettings(),
      gridStyle: cloneSimple(pcaState.gridStyle) || null,
      tableFormat: pcaState.tableFormat || 'standard',
      grouped: cloneSimple(pcaState.grouped) || {
        replicatesPerGroup: 2,
        colors: [],
        shapes: []
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
      labelColors: cloneSimple(pcaState.labelColors) || {},
      labelShapes: cloneSimple(pcaState.labelShapes) || {},
      labelPointStyles: cloneSimple(pcaState.labelPointStyles) || {},
      labelStyleMode: pcaState.labelStyleMode || null,
      labelColorsBackup: cloneSimple(pcaState.labelColorsBackup) || null,
      labelShapesBackup: cloneSimple(pcaState.labelShapesBackup) || null,
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
    record.notes = record.notes && typeof record.notes === 'object' ?
      {
        text: record.notes.text == null ? '' : String(record.notes.text),
        open: !!record.notes.open
      } :
      {
        text: '',
        open: false
      };
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
    pcaState.axesVarianceScaled = !!state.axesVarianceScaled;
    pcaState.equalScaleAxes = state.equalScaleAxes !== false;
    pcaState.equalAxes = !!state.equalAxes;
    pcaState.forcedLockRatioPrevious = (state.forcedLockRatioPrevious === true || state.forcedLockRatioPrevious === false) ?
      !!state.forcedLockRatioPrevious :
      null;
    pcaAxesLengthLockRatioPrevious = pcaState.forcedLockRatioPrevious;
    if (Object.prototype.hasOwnProperty.call(state, 'axisSettings')) {
      pcaState.axisSettings = cloneSimple(state.axisSettings) || pcaState.axisSettings || createDefaultAxisSettings();
    }
    if (Object.prototype.hasOwnProperty.call(state, 'gridStyle')) {
      pcaState.gridStyle = cloneSimple(state.gridStyle) || null;
    }
    pcaState.tableFormat = typeof state.tableFormat === 'string' && state.tableFormat ? state.tableFormat : (pcaState.tableFormat || 'standard');
    pcaState.grouped = cloneSimple(state.grouped) || pcaState.grouped || {
      replicatesPerGroup: 2,
      colors: [],
      shapes: []
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
    pcaState.labelColors = cloneSimple(state.labelColors) || {};
    pcaState.labelShapes = cloneSimple(state.labelShapes) || {};
    pcaState.labelPointStyles = cloneSimple(state.labelPointStyles) || {};
    pcaState.labelStyleMode = state.labelStyleMode || null;
    pcaState.labelColorsBackup = cloneSimple(state.labelColorsBackup) || null;
    pcaState.labelShapesBackup = cloneSimple(state.labelShapesBackup) || null;
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
      return Object.keys(out).length ? out : null;
    };
    return {
      title: normalizePoint(src.title),
      xLabel: normalizePoint(src.xLabel),
      yLabel: normalizePoint(src.yLabel),
      legend: normalizePoint(src.legend)
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
      target.state.state.labelColors = target.state.state.labelColors && typeof target.state.state.labelColors === 'object' ? target.state.state.labelColors : {};
      target.state.state.labelShapes = target.state.state.labelShapes && typeof target.state.state.labelShapes === 'object' ? target.state.state.labelShapes : {};
      target.state.state.labelPointStyles = target.state.state.labelPointStyles && typeof target.state.state.labelPointStyles === 'object' ? target.state.state.labelPointStyles : {};
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
    return !session || session === getActivePcaSessionForState() || isPcaSessionActiveForModuleState(session);
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
    if (rotation && typeof rotation === 'object') {
      pcaState.rotation = rotation;
    } else if (!pcaState.rotation || typeof pcaState.rotation !== 'object') {
      pcaState.rotation = plot3d.createRotationState({
        x: PCA_3D_DEFAULTS.rotationX,
        y: PCA_3D_DEFAULTS.rotationY
      });
    }
    if (typeof plot3d.normalizeRotation === 'function') {
      try {
        plot3d.normalizeRotation(pcaState.rotation);
      } catch (_err) {}
    }
    if (target?.state) {
      target.state = normalizePcaSessionRecord(target.state, target.tabId);
      target.state.state = target.state.state && typeof target.state.state === 'object' ?
        target.state.state :
        createDefaultPcaOwnedState();
      target.state.state.rotation = pcaState.rotation;
      target.state.state.rotationPending = !!pcaState.rotationPending;
      target.state.state.rotationPendingLogged = !!pcaState.rotationPendingLogged;
      target.updatedAt = Date.now();
    }
    debugLog('Debug: pca rotation state committed', {
      reason,
      tabId: target?.tabId || getPcaProjectionTabId() || null,
      rotation: {
        x: pcaState.rotation?.x,
        y: pcaState.rotation?.y,
        z: pcaState.rotation?.z
      }
    });
    return pcaState.rotation;
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
    pca.__pcaOwnedRuntimeTabId = record.tabId;
    pca.__pcaSessionTabId = record.tabId;
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
    if (!value) return null;
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
    const kaiserCount = entries.filter(entry => Number(entry?.eigenvalue) >= 1).length;
    const thresholdCount = entries.filter(entry => Number(entry?.eigenvalue) >= threshold).length;
    const parallelAvailable = !!(parallel && Array.isArray(parallel.percentile95Eigenvalues) && parallel.percentile95Eigenvalues.length);
    const parallelCount = parallelAvailable ?
      entries.filter((entry, idx) => Number(entry?.eigenvalue) > (parallel.percentile95Eigenvalues[idx] || 0)).length :
      0;
    const ruleLabel = rule === 'parallel' && !parallelAvailable ?
      'Parallel analysis (Kaiser fallback)' :
      getPcaComponentSelectionRuleLabel(rule);
    const retainedCount = rule === 'kaiser' ?
      kaiserCount :
      rule === 'threshold' ?
      thresholdCount :
      rule === 'all' ?
      entries.length :
      (parallelAvailable ? parallelCount : kaiserCount);
    const selectedThreshold = rule === 'kaiser' ?
      'Eigenvalue > 1' :
      rule === 'threshold' ?
      `Eigenvalue >= ${threshold.toFixed(2)}` :
      rule === 'parallel' ?
      (parallelAvailable ? 'Observed > random 95th percentile' : 'Unavailable') :
      '—';
    const selectedDetail = rule === 'kaiser' ?
      'Counts components above the classical Kaiser cutoff.' :
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

  function buildPcaBiplotSnapshot(points, loadingsRows, axisLabels = {}) {
    const pointList = Array.isArray(points) ? points.slice(0, PCA_BIPLOT_POINT_LIMIT) : [];
    const rawVectors = (Array.isArray(loadingsRows) ? loadingsRows : [])
      .slice(0, PCA_BIPLOT_VECTOR_LIMIT)
      .map(row => ({
        label: row?.label || 'Variable',
        x: Number(row?.values?.[0]) || 0,
        y: Number(row?.values?.[1]) || 0
      }))
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

  function markActivePcaPayloadDirty(reason) {
    const tabId = pcaControlOwnerContext?.tabId || pcaControlOwnerContext?.session?.tabId || getPcaProjectionTabId() || getActivePcaSessionForState()?.tabId || null;
    const mainSession = global.Main?.session || null;
    if (tabId && typeof mainSession?.markTabUserModified === 'function') {
      mainSession.markTabUserModified(tabId, reason || 'pca-payload-dirty', {
        origin: 'user',
        type: 'pca',
        affectsPayload: true
      });
    }
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

  function ensurePcaFontEventListener() {
    if (pcaFontEventBound || !global.document || typeof global.document.addEventListener !== 'function') {
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if (!isPcaFontStyleEvent(detail)) {
        return;
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

  function applyPcaTitleValue(node, value, session = null) {
    const nextValue = value != null ? String(value) : '';
    patchPcaLabelsState(session || getPcaProjectionSession({
      reason: 'pca-projection-mutation'
    }), {
      title: nextValue
    }, {
      reason: 'pca-title-change'
    });
    if (node && node.textContent !== nextValue) {
      node.textContent = nextValue;
    }
    requestPcaViewRefresh('title-change');
  }

  function applyPcaGroupColor(index, value) {
    const nextValue = value != null ? String(value) : '';
    const colors = Array.isArray(pcaState.grouped?.colors) ? pcaState.grouped.colors : (pcaState.grouped.colors = []);
    const previousValue = colors[index] || '';
    if (nextValue) {
      if (previousValue === nextValue) {
        return true;
      }
      colors[index] = nextValue;
    } else if (previousValue) {
      colors[index] = '';
    } else {
      return true;
    }
    requestPcaViewRefresh('group-color-change');
    return true;
  }

  function createDefaultAxisSettings() {
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: {
        tickInterval: null,
        minorTicks: false,
        minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS
      },
      y: {
        tickInterval: null,
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

  function ensureAxisSettings() {
    if (!pcaState.axisSettings || typeof pcaState.axisSettings !== 'object') {
      pcaState.axisSettings = createDefaultAxisSettings();
    }
    if (!pcaState.axisSettings.x || typeof pcaState.axisSettings.x !== 'object') {
      pcaState.axisSettings.x = {
        tickInterval: null,
        minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS
      };
    }
    if (!pcaState.axisSettings.y || typeof pcaState.axisSettings.y !== 'object') {
      pcaState.axisSettings.y = {
        tickInterval: null,
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

  function sanitizeAxisSelection(dimensionCount) {
    const axis = pcaState.axisSelection;
    const before = {
      ...axis
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
    } else if (count > 0) {
      axis.z = clampVal(axis.z, count);
    }
    const changed = before.x !== axis.x || before.y !== axis.y || before.z !== axis.z;
    if (changed) {
      debugLog('Debug: pca axis selection sanitized', {
        before,
        after: {
          ...axis
        },
        dimensionCount: count
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

  function resolveAxisVarianceInfo(axisIndices, dimensionMeta) {
    const indices = axisIndices || {};
    const metaArray = Array.isArray(dimensionMeta) ? dimensionMeta : [];
    const weights = {
      x: null,
      y: null,
      z: null
    };
    const normalized = {
      x: null,
      y: null,
      z: null
    };
    let positiveCount = 0;
    let maxWeight = 0;
    ['x', 'y', 'z'].forEach(axisKey => {
      const idx = indices[axisKey];
      if (typeof idx === 'number' && idx >= 0 && idx < metaArray.length) {
        const meta = metaArray[idx];
        const pct = Number(meta?.variancePercent);
        if (Number.isFinite(pct)) {
          const weight = Math.max(pct, MIN_VARIANCE_WEIGHT);
          weights[axisKey] = weight;
          if (weight > 0) {
            positiveCount += 1;
          }
          if (weight > maxWeight) {
            maxWeight = weight;
          }
        }
      }
    });
    if (maxWeight <= 0) {
      maxWeight = 1;
    }
    ['x', 'y', 'z'].forEach(axisKey => {
      const weight = weights[axisKey];
      normalized[axisKey] = Number.isFinite(weight) && weight !== null ? weight / maxWeight : null;
    });
    const info = {
      weights,
      normalized,
      hasAny: positiveCount > 0,
      maxWeight
    };
    debugLog('Debug: pca resolveAxisVarianceInfo', info); // Debug: axis variance weighting snapshot
    return info;
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
    capturePcaSessionStateFromActive(getPcaProjectionSession({
      reason: 'pca-projection-mutation'
    }), {
      reason
    });
    if (restoreMode || options.skipDirty === true) {
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
    pcaState.grouped.colors = names.map((_, idx) => {
      const existing = pcaState.grouped.colors[idx];
      return (typeof existing === 'string' && existing.trim()) ?
        existing :
        DEFAULT_SCATTER_COLORS[idx % DEFAULT_SCATTER_COLORS.length];
    });
    pcaState.grouped.shapes = names.map((_, idx) => sanitizeGroupShape(pcaState.grouped.shapes[idx], idx));
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
      const color = pcaState.grouped.colors[idx] || DEFAULT_SCATTER_COLORS[idx % DEFAULT_SCATTER_COLORS.length];
      const shape = sanitizeGroupShape(pcaState.grouped.shapes[idx], idx);
      pcaState.grouped.shapes[idx] = shape;
      const entry = {
        index: idx,
        key: `group-${idx}`,
        label: name,
        color,
        shape,
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
      labelToGroup
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

  const markFontEditable = (node, role, key) => {
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
        key
      });
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
    applyAxisVisibility(pcaViewMode?.value || DEFAULT_VIEW_MODE);
    syncPcaComponentSelectionUi();
    syncPcaAspectControls('method-ui-state');
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
      ensurePcaResizerControls();
    }
    if (Object.prototype.hasOwnProperty.call(controls, 'scale') && pcaScale) {
      pcaScale.checked = !!controls.scale;
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
    if (pcaVarianceAxisScale) {
      pcaVarianceAxisScale.checked = !!pcaState.axesVarianceScaled;
    }
    if (pcaEqualScaleAxesInput) {
      pcaEqualScaleAxesInput.checked = pcaState.equalScaleAxes !== false;
    }
    if (pcaEqualAxesInput) {
      pcaEqualAxesInput.checked = !!pcaState.equalAxes;
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
    syncPcaAspectControls('runtime-controls');
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

  function scheduleRotationRedraw(rotation = null, session = null) {
    const target = ensurePcaSessionOwnershipShape(session || getActivePcaSessionForState());
    commitPcaRotationState(rotation || pcaState.rotation, target, 'pca-rotation-change');
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
        });
      }
      return;
    }
    updatePcaDrawRuntime(target, runtime => {
      runtime.rotationPending = true;
      runtime.rotationPendingLogged = false;
    });
    pcaState.rotationPending = true;
    pcaState.rotationPendingLogged = false;
    commitPcaRotationState(pcaState.rotation, target, 'pca-rotation-pending');
    debugLog('Debug: pca rotation redraw scheduled', {
      tabId: target?.tabId || null
    });
    requestPcaViewRefresh('rotation', {
      tabId: target?.tabId || null,
      force: true,
      userInitiated: true,
      silentOverlay: true
    });
  }

  function bindPca3dRotationControls(svg, debugLabel) {
    if (!svg || !svg.dataset || svg.dataset.viewMode !== '3d') {
      return false;
    }
    const rotationSession = ensurePcaSessionOwnershipShape(getActivePcaSessionForState());
    const rotationState = commitPcaRotationState(pcaState.rotation, rotationSession, 'pca-rotation-bind');
    if (typeof plot3d.ensureRotationHitSurface === 'function') {
      plot3d.ensureRotationHitSurface(svg, {
        debugLabel: debugLabel || 'pca-3d'
      });
    }
    plot3d.attachRotationControls(svg, {
      state: rotationState,
      onStart: (_event, state) => commitPcaRotationState(state, rotationSession, 'pca-rotation-start'),
      onChange: (_event, state) => scheduleRotationRedraw(state, rotationSession),
      onEnd: (_event, state) => commitPcaRotationState(state, rotationSession, 'pca-rotation-end'),
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

  function ensurePcaReportHost() {
    if (!pcaStatsResults) {
      return null;
    }
    const reporting = Shared.statsReporting;
    if (reporting && typeof reporting.ensureReportHost === 'function') {
      return reporting.ensureReportHost(pcaStatsResults, {
        id: 'pcaStatsReportHost',
        className: 'stats-report-host',
        attachToTarget: true,
        position: 'last',
        migrateReportPanels: true
      });
    }
    let host = getPcaNodeById('pcaStatsReportHost');
    if (host && host.parentNode !== pcaStatsResults) {
      host.parentNode?.removeChild?.(host);
      host = null;
    }
    if (!host) {
      host = document.createElement('div');
      host.id = 'pcaStatsReportHost';
      host.className = 'stats-report-host';
      pcaStatsResults.appendChild(host);
    }
    pcaStatsResults.__statsReportHost = host;
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
        'PCA used centered/scaled numeric variables according to the active preprocessing options and reports eigenvalue, variance, cumulative-variance, component-selection, and optional biplot-loading summaries.' :
        reportMethod === 'mds' ?
        'MDS reports dimension inertia/eigen summaries and stress where available for the displayed distance-based ordination.' :
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
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
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
    xLabel.setAttribute('x', String(margin.left + plotWidth / 2));
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
          contextLabel: 'pca-biplot-export'
        });
      }
    }
  }

  function restorePcaStatsFromPayload(options = {}) {
    const session = getActivePcaSessionForState();
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
    }), getActivePcaSessionForState(), {
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

  function finalizePcaStatsPayloadRestore(savedStatsModels, reason) {
    if (!getPcaStatsSnapshot(getActivePcaSessionForState()) || !savedStatsModels || typeof savedStatsModels !== 'object') {
      return;
    }
    const restore = () => {
      restorePcaStatsFromPayload(savedStatsModels);
    };
    const ownerTabId = getPcaProjectionTabId() || getActivePcaSessionForState()?.tabId || null;
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
    for (let i = 0; i <= tickCount; i += 1) {
      const pct = (yAxisMax / tickCount) * i;
      const y = margin.top + plotHeight - (plotHeight * (pct / yAxisMax));
      if (i !== 0) { // skip drawing over the x-axis
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
    const previousValue = pcaState.labelColors[label] || '';
    if (nextValue) {
      if (previousValue === nextValue) {
        return true;
      }
      pcaState.labelColors[label] = nextValue;
    } else if (previousValue) {
      delete pcaState.labelColors[label];
    } else {
      return true;
    }
    requestPcaViewRefresh('label-color-change');
    return true;
  };

  const applyPcaLabelShape = (label, value, fallbackIndex = 0) => {
    const previousValue = pcaState.labelShapes[label] || '';
    const sanitized = typeof value === 'string' && value ?
      sanitizeGroupShape(value, fallbackIndex) :
      '';
    if (sanitized) {
      if (previousValue === sanitized) {
        return true;
      }
      pcaState.labelShapes[label] = sanitized;
    } else if (previousValue) {
      delete pcaState.labelShapes[label];
    } else {
      return true;
    }
    requestPcaViewRefresh('label-shape-change');
    return true;
  };

  function ensurePcaLabelStyles(labels, groupMeta) {
    const labelArray = Array.isArray(labels) ? labels : [];
    const targetMode = pcaState.tableFormat === 'grouped' ? 'grouped' : 'standard';
    if (targetMode !== pcaState.labelStyleMode) {
      if (targetMode === 'grouped') {
        pcaState.labelColorsBackup = {
          ...pcaState.labelColors
        };
        pcaState.labelShapesBackup = {
          ...pcaState.labelShapes
        };
      } else if (pcaState.labelStyleMode === 'grouped') {
        pcaState.labelColors = pcaState.labelColorsBackup ? {
          ...pcaState.labelColorsBackup
        } : {};
        pcaState.labelShapes = pcaState.labelShapesBackup ? {
          ...pcaState.labelShapesBackup
        } : {};
      }
      pcaState.labelStyleMode = targetMode;
      debugLog('Debug: pca label style mode updated', {
        mode: targetMode
      });
    }
    if (targetMode === 'grouped') {
      debugLog('Debug: ensurePcaLabelStyles skipped', {
        grouped: true,
        labels: labelArray.length
      });
      return;
    }
    const labelSet = new Set();
    labelArray.forEach((lab, i) => {
      if (!lab) {
        return;
      }
      labelSet.add(lab);
      if (!pcaState.labelColors[lab]) {
        pcaState.labelColors[lab] = DEFAULT_SCATTER_COLORS[i % DEFAULT_SCATTER_COLORS.length];
        debugLog('Debug: pca default label color applied', {
          label: lab,
          color: pcaState.labelColors[lab]
        });
      }
      const currentShape = pcaState.labelShapes[lab];
      if (currentShape) {
        const sanitized = sanitizeGroupShape(currentShape, i);
        if (sanitized !== currentShape) {
          pcaState.labelShapes[lab] = sanitized;
        }
      } else {
        const defaultShape = GROUP_SHAPE_DEFAULTS.length ?
          GROUP_SHAPE_DEFAULTS[i % GROUP_SHAPE_DEFAULTS.length] :
          'circle';
        pcaState.labelShapes[lab] = sanitizeGroupShape(defaultShape, i);
        debugLog('Debug: pca default label shape applied', {
          label: lab,
          shape: pcaState.labelShapes[lab]
        });
      }
    });
    Object.keys(pcaState.labelColors).forEach(existing => {
      if (!labelSet.has(existing)) {
        debugLog('Debug: pca label color pruned', {
          label: existing
        });
        delete pcaState.labelColors[existing];
      }
    });
    Object.keys(pcaState.labelShapes).forEach(existing => {
      if (!labelSet.has(existing)) {
        debugLog('Debug: pca label shape pruned', {
          label: existing
        });
        delete pcaState.labelShapes[existing];
      }
    });
    Object.keys(pcaState.labelPointStyles).forEach(existing => {
      if (!labelSet.has(existing)) {
        debugLog('Debug: pca label point style pruned', {
          label: existing
        });
        delete pcaState.labelPointStyles[existing];
      }
    });
    debugLog('Debug: ensurePcaLabelStyles sync complete', {
      colors: Object.keys(pcaState.labelColors).length,
      shapes: Object.keys(pcaState.labelShapes).length,
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
      ensurePcaGroupedDefaults();
      const currentShape = sanitizeGroupShape(pcaState.grouped.shapes?.[groupIndex], groupIndex);
      pcaState.grouped.shapes[groupIndex] = currentShape;
      previousShape = currentShape;
      const applyGroupShape = (shapeValue) => {
        const sanitized = sanitizeGroupShape(shapeValue, groupIndex);
        if (pcaState.grouped.shapes[groupIndex] === sanitized) {
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
      const currentShape = sanitizeGroupShape(pcaState.labelShapes[labelKey] || 'circle', labelIndex);
      pcaState.labelShapes[labelKey] = currentShape;
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
    const shouldBumpToken = !viewOnly || !!renderRuntime.dataDirty;
    const drawToken = shouldBumpToken ?
      (Number(drawRuntime.token) || 0) + 1 :
      (Number(drawRuntime.token) || 0);
    if (shouldBumpToken) {
      updatePcaDrawRuntime(drawSession, runtime => {
        runtime.token = drawToken;
      });
    }
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
      if (drawRuntime.rotationPending) {
        debugLog('Debug: pca rotation pending reset at draw', {
          tabId: drawSession?.tabId || null
        });
      }
      updatePcaDrawRuntime(drawSession, runtime => {
        runtime.rotationPending = false;
        runtime.rotationPendingLogged = false;
      });
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
      const commitTitleChange = (value, reason) => {
        const trimmed = (value || '').trim();
        const fallbackTitle = getDefaultTitleForMethod(method);
        const nextTitle = trimmed || fallbackTitle;
        const currentLabels = getPcaLabelsState(drawSession, method);
        const previousTitle = currentLabels.title || fallbackTitle;
        if (previousTitle === nextTitle) {
          return nextTitle;
        }
        const applyTitle = (titleValue) => {
          applyPcaTitleValue(null, titleValue, drawSession);
          pcaLabelsState = getPcaLabelsState(drawSession, method);
          return true;
        };
        applyTitle(nextTitle);
        pcaTitleText = nextTitle;
        debugLog('Debug: pca title updated', {
          title: nextTitle,
          reason: reason || 'inline-edit',
          tabId: drawSession?.tabId || null
        });
        recordPcaChange('pca:title', previousTitle, nextTitle, applyTitle);
        return nextTitle;
      };
      const rawViewMode = (controls.viewMode || DEFAULT_VIEW_MODE).toLowerCase();
      const requestedViewMode = (method === 'pca' || method === 'mds') ? rawViewMode : '2d';
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
      resetStatsPanel();
      clearPcaResultsState(drawSession, {
        mirrorActive: true
      });
      statsSummaryLines = [];
      eigenSummaryData = [];
      screeData = [];
      statsMethod = null;
      dimensionMeta = [];

      const fill = controls.fill;
      const alpha = Number(controls.alpha) || 0;
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
      const scaleVars = !!controls.scale;
      debugLog('Debug: pca axis range auto', {
        scaleVars
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
            if (Number.isNaN(v)) {
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
        const nSamples = matrix.length;
        const nFeatures = matrix[0].length;
        sampleCountSnapshot = nSamples;
        featureCountSnapshot = nFeatures;
        analysisSignatures = buildPcaAnalysisSignatures({
          method,
          matrix,
          labels,
          controls,
          viewMode: requestedViewMode,
          nSamples,
          nFeatures
        });

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
              matrix,
              requestedDims: requestedViewMode === '3d' ? 3 : 2
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
            const requestedDims = (requestedViewMode === '3d') ? 3 : 2;
            const dimsToUse = Math.min(Math.max(requestedDims, 2), dimsAvailable);
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
              parallelIterations: pcaState.componentSelection?.parallelIterations
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
            const scoreComponents = Math.min(componentCount, 3);
            const scoredFeatures = [];
            for (let featureIdx = 0; featureIdx < loadingsTotalCount; featureIdx += 1) {
              const basis = Array.isArray(svd.v?.[featureIdx]) ? svd.v[featureIdx] : null;
              let score = 0;
              if (basis) {
                for (let compIdx = 0; compIdx < scoreComponents; compIdx += 1) {
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
          });
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
      updateLoadingsTable({
        rows: loadingsRows,
        components: loadingsComponents,
        method,
        viewMode: effectiveViewMode,
        totalCount: loadingsTotalCount
      });

      const axisVarianceInfo = resolveAxisVarianceInfo(axisIndices, dimensionMeta);

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
            const shape = pcaState.labelShapes[lab] || 'circle';
            legendEntries.push({
              key: `label-${lab}`,
              label: lab,
              color: pcaState.labelColors[lab] || DEFAULT_SCATTER_COLORS[legendEntries.length % DEFAULT_SCATTER_COLORS.length],
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
        biplot: method === 'pca' ? buildPcaBiplotSnapshot(points, loadingsRows, {
          x: pcaXLabelText,
          y: pcaYLabelText
        }) : null
      });

      if (effectiveViewMode === '3d') {
        if (!points3d.length) {
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
        plotEl.style.position = 'relative';
        plotEl.style.minWidth = '';
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
        plotEl.appendChild(svg3);
        svg3.setAttribute('width', String(W3));
        svg3.setAttribute('height', String(H3));
        svg3.setAttribute('viewBox', `0 0 ${W3} ${H3}`);
        svg3.setAttribute('font-family', chartStyle.FONT_FAMILY);
        svg3.dataset.viewMode = '3d';
        chartStyle.prepareSvg(svg3, { scopeId: 'pca' });
        while (svg3.firstChild) {
          svg3.removeChild(svg3.firstChild);
        }
        svg3.style.backgroundColor = pcaThemeDark ?
          normalizePcaThemeColor(pcaState.theme?.backgroundColor, '#000000') :
          '';
        appendPca3dBackground(svg3, W3, H3);
        bindPca3dRotationControls(svg3, 'pca-3d');
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
        let renderPoints3d = points3d;
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
        const originalSpans3d = {
          x: axisRanges.x.max - axisRanges.x.min,
          y: axisRanges.y.max - axisRanges.y.min,
          z: axisRanges.z.max - axisRanges.z.min
        };
        const axisCentersOriginal = {
          ...axisCenters
        };
        const axisScaleFactors = {
          x: 1,
          y: 1,
          z: 1
        };
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
          x: {
            ...axisRanges.x
          },
          y: {
            ...axisRanges.y
          },
          z: {
            ...axisRanges.z
          }
        };
        let axisTickFormatters3d = null;
        let axisTicks3d = null;
        if (variance3dActive) {
          const baseSpan = Math.max(originalSpans3d.x, originalSpans3d.y, originalSpans3d.z, 1);
          Object.keys(renderAxisRanges3d).forEach(axisKey => {
            const normalizedWeight = axisVarianceInfo.normalized[axisKey];
            if (normalizedWeight == null) {
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
        } else if (equalScale3d) {
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
        } else if (equalLength3d) {
          const maxSpan = Math.max(originalSpans3d.x, originalSpans3d.y, originalSpans3d.z, 1);
          const scaleFactors = {
            x: originalSpans3d.x > 0 ? (maxSpan / originalSpans3d.x) : 1,
            y: originalSpans3d.y > 0 ? (maxSpan / originalSpans3d.y) : 1,
            z: originalSpans3d.z > 0 ? (maxSpan / originalSpans3d.z) : 1
          };
          const scaleValue = (axisKey, value) => axisCentersOriginal[axisKey] + (value - axisCentersOriginal[axisKey]) * scaleFactors[axisKey];
          const unscaleValue = (axisKey, value) => axisCentersOriginal[axisKey] + (value - axisCentersOriginal[axisKey]) / (scaleFactors[axisKey] || 1);
          renderAxisRanges3d = {
            x: {
              min: scaleValue('x', axisRanges.x.min),
              max: scaleValue('x', axisRanges.x.max)
            },
            y: {
              min: scaleValue('y', axisRanges.y.min),
              max: scaleValue('y', axisRanges.y.max)
            },
            z: {
              min: scaleValue('z', axisRanges.z.min),
              max: scaleValue('z', axisRanges.z.max)
            }
          };
          axisTicks3d = {
            x: axisTicksOriginal3d.x.map(value => scaleValue('x', value)),
            y: axisTicksOriginal3d.y.map(value => scaleValue('y', value)),
            z: axisTicksOriginal3d.z.map(value => scaleValue('z', value))
          };
          const formatTick = (axisKey, scaledValue) => {
            const originalValue = unscaleValue(axisKey, scaledValue);
            if (typeof chartStyle.formatAxisValue === 'function') {
              return chartStyle.formatAxisValue(originalValue, {
                maxDecimals: 2
              });
            }
            if (typeof chartStyle.formatScientific === 'function') {
              return chartStyle.formatScientific(originalValue, {
                maxDecimals: 2
              });
            }
            if (!Number.isFinite(originalValue)) {
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
        if (!axisTicks3d) {
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
        const pca3dFontStyles = exportFontStyles('pca');
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
        const markPca3dAxisTickLabel = (node, axisKey) => {
          if (!node) {
            return;
          }
          const role = axisKey === 'z' ? 'zTick' : (axisKey === 'y' ? 'yTick' : 'xTick');
          markFontEditable(node, role, role);
        };
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
        makeEditableHelper(title3d, text => commitTitleChange(text, '3d-title'));
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
          const style = (groupMeta && Number.isInteger(assignment)) ? groupMeta.styleByIndex?.[assignment] : null;
          const labelPointStyle = pt.label ? (pcaState.labelPointStyles[pt.label] || null) : null;
          const color = style?.color || (pt.label ? (pcaState.labelColors[pt.label] || DEFAULT_SCATTER_COLORS[0]) : fill);
          const labelShape = pt.label ? pcaState.labelShapes[pt.label] : null;
          const shape = style?.shape || labelShape || 'circle';
          const original = pt.original || {};
          const markerRadiusBase = Number.isFinite(Number(labelPointStyle?.size)) ? Number(labelPointStyle.size) : Number(pcaDotSize.value);
          const markerRadius = chartStyle.scaleStrokeWidth(markerRadiusBase, styleScaleInfo, {
            context: 'pca-dot-size-label',
            min: 0.5
          });
          const pointTransparency = Number.isFinite(Number(labelPointStyle?.alpha)) ? Number(labelPointStyle.alpha) : alpha;
          const pointOpacity = Math.min(Math.max(1 - pointTransparency, 0), 1);
          const pointBorderWidthBase = Number.isFinite(Number(labelPointStyle?.borderWidth)) ?
            Number(labelPointStyle.borderWidth) :
            (Number.isFinite(Number(labelPointStyle?.strokeWidth)) ? Number(labelPointStyle.strokeWidth) : borderWidthRaw);
          const pointBorderWidthPx = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, {
            context: 'pca-border-label',
            min: 0
          });
          const pointBorderColor = (typeof labelPointStyle?.borderColor === 'string' && labelPointStyle.borderColor) ?
            labelPointStyle.borderColor :
            ((typeof labelPointStyle?.stroke === 'string' && labelPointStyle.stroke) ? labelPointStyle.stroke : borderColor);
          const pointStroke = pointOpacity > 0 && pointBorderWidthPx > 0 ? pointBorderColor : 'none';
          pointBounds3d.push({
            cx: pt.x,
            cy: pt.y,
            r: markerRadius
          });
          const manualLabelText = pt.label ? String(pt.label).trim() : '';
          if (original.isManualLabel && manualLabelText) {
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
          if (pointNode) {
            pointNode.dataset.plotPoint = '1';
            const groupLabel3d = Number.isInteger(assignment) ?
              (style?.label || groupMeta?.entries?.[assignment]?.label || '') :
              (style?.label || '');
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
          if (Number.isFinite(approxRight)) {
            maxPointRight = Math.max(maxPointRight, approxRight);
          }
        });
        if (manualLabelEntries3d.length && labelLayout?.computePointLabelLayout && labelLayout?.computePointLabelFontSize) {
          const labelLayer = document.createElementNS(NS, 'g');
          labelLayer.setAttribute('data-layer', 'point-labels');
          labelLayer.setAttribute('pointer-events', 'none');
          const baseManualLabelSize = fs * 0.6;
          const labelWidth = labelBounds3d ? Math.max(1, labelBounds3d.maxX - labelBounds3d.minX) : plotW3;
          const labelHeight = labelBounds3d ? Math.max(1, labelBounds3d.maxY - labelBounds3d.minY) : plotH3;
          const tickFontSizeCap = labelLayout?.readFontSizeFromNodes ?
            (labelLayout.readFontSizeFromNodes(svg3.querySelectorAll('[data-axis-tick-label]')) ||
              Math.max(9, Math.round(fs * 0.85))) :
            Math.max(9, Math.round(fs * 0.85));
          const labelFontSizeRaw = labelLayout.computePointLabelFontSize(baseManualLabelSize, manualLabelEntries3d.length, labelWidth, labelHeight);
          const labelFontSize = Math.min(labelFontSizeRaw, tickFontSizeCap);
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
            if (!textValue || !placement) {
              return;
            }
            const textX = placement.textX;
            const textY = placement.textY;
            const anchor = placement.anchor;
            const lineX2 = placement.lineX2;
            const leader = document.createElementNS(NS, 'line');
            leader.setAttribute('x1', String(cx));
            leader.setAttribute('y1', String(cy));
            leader.setAttribute('x2', String(lineX2));
            leader.setAttribute('y2', String(textY));
            leader.setAttribute('stroke', labelColor);
            leader.setAttribute('stroke-width', String(leaderStrokeWidth));
            leader.setAttribute('stroke-linecap', 'round');
            labelLayer.appendChild(leader);
            const textNode = document.createElementNS(NS, 'text');
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
        if (legendVisible) {
          const horizontalBase = margin3.left + plotW3 + legendLayout.legendGapPx + appliedLegendAxisGap;
          const legendGapFor3d = legendLayout.legendGapPx;
          const legendSpacing3 = Math.max(legendRenderer.rowGap || 0, Math.round(fs * 0.35));
          const legendMarkerSize3 = legendRenderer.swatchSize || Math.max(Math.round(fs * 0.6), 10);
          const legendTextOffset3 = legendMarkerSize3 + (legendRenderer.swatchGap || Math.max(Math.round(fs * 0.2), 6));
          const legendHeight = legendEntries.length ?
            legendEntries.length * legendMarkerSize3 + (legendEntries.length - 1) * legendSpacing3 :
            0;
          const horizontalPadding = Math.max(fs * 0.6, 12) + appliedLegendAxisGap;
          let legendX3 = Math.max(horizontalBase, contentRightBound + horizontalPadding);
          const safeRightPad = Math.max(fs * 0.6, 12);
          const maxLegendX = W3 - safeRightPad - legendWidth;
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
          const legendBottomLimit = Math.max(baseLegendY, H3 - margin3.bottom - legendHeight);
          const verticalPadding = Math.max(fs * 0.45, 8);
          let legendStartY = baseLegendY;
          const storedLegendPos = pcaLabelPositionsState?.legend;
          if (storedLegendPos) {
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
                width: legendWidth,
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
          const legendGroup = add3('g', {
            'data-role': 'pca-legend',
            transform: `translate(${legendX3},${legendStartY})`
          });
          if (legendGroup) {
            plot3d.applyLegendPointerGuards(legendGroup, {
              label: 'pca-legend-3d'
            });
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
            if (swatch3) {
              swatch3.style.cursor = 'pointer';
              swatch3.dataset.legendKey = entry.key;
              if (Number.isInteger(entry.groupIndex)) {
                swatch3.dataset.legendGroupIndex = String(entry.groupIndex);
              } else if (entry.labelValue) {
                swatch3.dataset.legendLabel = entry.labelValue;
              }
              swatch3.addEventListener('click', (evt) => {
                if (evt) {
                  evt.stopPropagation();
                }
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
            markFontEditable(legendText, 'legend', `legend-${i}`);
          });
          if (legendGroup && typeof Shared.enableLegendDrag === 'function') {
            Shared.enableLegendDrag(legendGroup, svg3, {
              undoLabel: 'pca-legend-3d',
              onDragEnd: pos => {
                // Store both absolute and relative positions for 3D legend
                const relX = (pos.x - horizontalBase) / legendGapFor3d;
                const relY = (pos.y - baseLegendY) / plotH3;
                pcaLabelPositionsState = patchPcaLabelPositionsState(drawSession, {
                  legend: {
                    x: pos.x,
                    y: pos.y,
                    relX,
                    relY
                  }
                }, {
                  reason: 'pca-3d-legend-position'
                });
                if (Shared.isDebugEnabled?.()) {
                  console.debug('Debug: pca 3d legend position saved', {
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
        registerPcaGridControlTarget(svg3, {
          fallbackThickness: axisStrokeWidthBase
        });
        // 3D plots must scale uniformly so the projected cube, axis labels, title,
        // legend, and every glyph keep their proportions. preserveAspectRatio
        // "xMidYMid meet" (vs the 2D "none"/fill-distort default) prevents the SVG
        // from being non-uniformly stretched when the rendered box aspect differs
        // from the content aspect, on initial render, rotation, and resize.
        ensureGraphViewport(svg3, {
          padding: Math.max(fs, 18),
          debugLabel: 'pca-3d-graph',
          preserveAspectRatio: 'xMidYMid meet'
        });
        pcaLayout?.syncPanels?.({
          skipSchedule: true
        });
        syncPcaAutoDrawNoticeWidth('draw');
        return;
      }

      if (!points.length) {
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

      const shouldEqualScale = !!pcaState.equalScaleAxes;
      if (shouldEqualScale) {
        const spanX = Number.isFinite(xMax) && Number.isFinite(xMin) ? (xMax - xMin) : NaN;
        const spanY = Number.isFinite(yMax) && Number.isFinite(yMin) ? (yMax - yMin) : NaN;
        if (Number.isFinite(spanX) && Number.isFinite(spanY) && spanX > 0 && spanY > 0) {
          const maxSpan = Math.max(spanX, spanY);
          const centerX = (xMax + xMin) / 2;
          const centerY = (yMax + yMin) / 2;
          xMin = centerX - maxSpan / 2;
          xMax = centerX + maxSpan / 2;
          yMin = centerY - maxSpan / 2;
          yMax = centerY + maxSpan / 2;
          debugLog('Debug: pca equal scale ranges applied', {
            spanX,
            spanY,
            maxSpan,
            xMin,
            xMax,
            yMin,
            yMax
          });
        } else {
          debugLog('Debug: pca equal scale ranges skipped', {
            spanX,
            spanY
          });
        }
      }

      debugLog('Debug: pca axis range resolved', {
        xMin,
        xMax,
        yMin,
        yMax,
        equalScaleEnabled: shouldEqualScale
      });

      plotEl.style.aspectRatio = '';
      plotEl.style.padding = '';
      const baseDrawableWidth = Math.max(50, Math.floor(drawableFrame.width || 50));
      let W = baseDrawableWidth;
      const H = Math.max(40, Math.floor(drawableFrame.height || 40));

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

      let xTickTarget = chartStyle.estimateTickCount(W, {
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
      const pcaFontStyles = exportFontStyles('pca');
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
      const tickGap = axisMetrics.tickLabelGap;
      let margin = chartStyle.computeBaseMargins({
        fontSize: fs,
        legendWidth: effectiveLegendWidth,
        maxYLabelWidth: 0,
        hasYTitle,
        axisMetrics
      });
      margin.left = Math.max(margin.left, fs * 0.5);
      let plotW = Math.max(20, W - margin.left - margin.right);
      let plotH = Math.max(20, H - margin.top - margin.bottom);
      let bottomLayout = chartStyle.computeBottomLayout({
        labels: [],
        fontSize: fs,
        labelMeasureFont: xTickMeasureFont,
        plotWidth: plotW,
        baseBottom: margin.bottom,
        axisMetrics
      });
      margin.bottom = bottomLayout.bottom;
      margin = chartStyle.stabilizeAxisResizeMargins ?
        chartStyle.stabilizeAxisResizeMargins(margin, {
          svgBox: pcaSvgBox,
          scopeId: 'pca'
        }) :
        margin;
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
      for (let pass = 0; pass < 2; pass++) {
        xScale = niceScale(xMin, xMax, xTickTarget);
        yScale = niceScale(yMin, yMax, yTickTarget);
        if (Number.isFinite(manualIntervalX) && manualIntervalX > 0) {
          const manualX = buildManualTicks(xScale.min, xScale.max, manualIntervalX);
          if (manualX) {
            xScale.min = manualX.min;
            xScale.max = manualX.max;
            xScale.ticks = manualX.ticks;
            xScale.step = manualIntervalX;
          }
        }
        if (Number.isFinite(manualIntervalY) && manualIntervalY > 0) {
          const manualY = buildManualTicks(yScale.min, yScale.max, manualIntervalY);
          if (manualY) {
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
        margin = chartStyle.computeBaseMargins({
          fontSize: fs,
          legendWidth: effectiveLegendWidth,
          maxYLabelWidth,
          hasYTitle,
          axisMetrics
        });
        margin.left = Math.max(margin.left, maxYLabelWidth + tickLen + tickGap + fs * 0.5);
        plotW = Math.max(20, W - margin.left - margin.right);
        plotH = Math.max(20, H - margin.top - margin.bottom);
        bottomLayout = chartStyle.computeBottomLayout({
          labels: xTickLabels,
          fontSize: fs,
          labelMeasureFont: xTickMeasureFont,
          plotWidth: plotW,
          baseBottom: margin.bottom,
          axisMetrics
        });
        margin.bottom = bottomLayout.bottom;
        margin = chartStyle.stabilizeAxisResizeMargins ?
          chartStyle.stabilizeAxisResizeMargins(margin, {
            svgBox: pcaSvgBox,
            scopeId: 'pca'
          }) :
          margin;
        plotW = Math.max(20, W - margin.left - margin.right);
        plotH = Math.max(20, H - margin.top - margin.bottom);
        const refinedX = manualIntervalX ? xTickTarget : chartStyle.estimateTickCount(plotW, {
          axis: 'x',
          fallback: xTickTarget
        });
        const refinedY = manualIntervalY ? yTickTarget : chartStyle.estimateTickCount(plotH, {
          axis: 'y',
          fallback: yTickTarget
        });
        debugLog('Debug: pca tick target evaluation', {
          pass,
          plotW,
          plotH,
          xTickTarget,
          refinedX,
          yTickTarget,
          refinedY,
          maxXLabelWidth,
          maxYLabelWidth,
          manualIntervalX,
          manualIntervalY
        });
        const xStable = manualIntervalX || refinedX === xTickTarget;
        const yStable = manualIntervalY || refinedY === yTickTarget;
        if (xStable && yStable) {
          break;
        }
        if (!manualIntervalX) {
          xTickTarget = refinedX;
        }
        if (!manualIntervalY) {
          yTickTarget = refinedY;
        }
      }
      debugLog('Debug: pca tick targets finalized', {
        xTickTarget,
        yTickTarget,
        maxXLabelWidth,
        maxYLabelWidth,
        manualIntervalX,
        manualIntervalY
      });
      const enforcePlotAspect = (marginInput, totalWidth, totalHeight, aspectValue) => {
        const aspect = Number.isFinite(aspectValue) && aspectValue > 0 ? aspectValue : null;
        const baseMargin = {
          ...marginInput
        };
        const innerW = Math.max(20, totalWidth - baseMargin.left - baseMargin.right);
        const innerH = Math.max(20, totalHeight - baseMargin.top - baseMargin.bottom);
        if (!aspect) {
          return {
            margin: baseMargin,
            plotW: innerW,
            plotH: innerH
          };
        }
        const squareSize = Math.min(innerW, innerH);
        let targetW = squareSize;
        let targetH = squareSize;
        if (aspect >= 1) {
          targetW = squareSize;
          targetH = squareSize / aspect;
        } else {
          targetH = squareSize;
          targetW = squareSize * aspect;
        }
        if (!Number.isFinite(targetW) || targetW <= 0 || !Number.isFinite(targetH) || targetH <= 0) {
          return {
            margin: baseMargin,
            plotW: innerW,
            plotH: innerH
          };
        }
        const adjusted = {
          ...baseMargin
        };
        if (innerW > targetW) {
          adjusted.right += innerW - targetW;
        }
        if (innerH > targetH) {
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
      debugLog('Debug: pca aspect ratio decision', {
        shouldEqualAxes,
        shouldEqualScale,
        varianceAxesEnabled: !!pcaState.axesVarianceScaled,
        lockRatioEnabled: shouldLockAspect,
        storedRatio: aspectData?.resizerAspectRatio
      }); // Debug: pca aspect toggle decision
      let varianceAspectApplied = false;
      if (pcaState.axesVarianceScaled) {
        const weightX = axisVarianceInfo?.weights?.x;
        const weightY = axisVarianceInfo?.weights?.y;
        if (Number.isFinite(weightX) && weightX > 0 && Number.isFinite(weightY) && weightY > 0) {
          const desiredAspect = weightX / weightY;
          const baseInnerW = Math.max(20, W - margin.left - margin.right);
          const baseInnerH = Math.max(20, H - margin.top - margin.bottom);
          const baseSquareSize = Math.min(baseInnerW, baseInnerH);
          const enforced = enforcePlotAspect(margin, W, H, desiredAspect);
          margin = enforced.margin;
          plotW = enforced.plotW;
          plotH = enforced.plotH;
          varianceAspectApplied = true;
          debugLog('Debug: pca layout (variance-enforced)', {
            desiredAspect,
            appliedAspect: plotH > 0 ? plotW / plotH : null,
            squareSize: baseSquareSize,
            margin,
            plotW,
            plotH,
            weights: axisVarianceInfo.weights
          });
        } else {
          debugLog('Debug: pca variance aspect skipped', {
            reason: 'insufficient-weights',
            weights: axisVarianceInfo?.weights
          });
        }
      }
      if (!varianceAspectApplied) {
        if (shouldEqualAxes || shouldEqualScale) {
          const square = chartStyle.ensureSquarePlot(W, H, margin);
          margin = square.margin;
          plotW = square.plotW;
          plotH = square.plotH;
          debugLog('Debug: pca layout (equal-length)', {
            margin,
            plotW,
            plotH,
            rotate: bottomLayout.shouldRotate
          }); // Debug: pca square enforcement branch
        } else {
          debugLog('Debug: pca layout (unlocked)', {
            margin,
            plotW,
            plotH,
            rotate: bottomLayout.shouldRotate
          }); // Debug: pca free resize branch
        }
      }
      let legendOrigin2d = null;
      if (legendVisible) {
        const defaultLegendX = margin.left + plotW + legendLayout.legendGapPx + appliedLegendAxisGap;
        const defaultLegendY = margin.top;
        const legendPos = pcaLabelPositionsState?.legend;
        let absoluteLegendX = defaultLegendX;
        let absoluteLegendY = defaultLegendY;
        if (legendPos) {
          if (legendPos.relX !== undefined && legendPos.relY !== undefined) {
            absoluteLegendX = margin.left + plotW + legendPos.relX * legendLayout.legendGapPx;
            absoluteLegendY = margin.top + legendPos.relY * plotH;
          } else if (legendPos.x !== undefined && legendPos.y !== undefined) {
            absoluteLegendX = legendPos.x;
            absoluteLegendY = legendPos.y;
          }
        }
        legendOrigin2d = {
          defaultLegendX,
          defaultLegendY,
          absoluteLegendX,
          absoluteLegendY
        };
        const legendOuterPadding = Math.max(Math.round(fs * 0.75), 12);
        const legendContentWidth = Math.max(legendRenderer.width || 0, 0);
        const minimumRenderWidth = Math.max(W, Math.ceil(absoluteLegendX + legendContentWidth + legendOuterPadding));
        if (minimumRenderWidth > W) {
          debugLog('Debug: pca 2d legend width extended render area', {
            plotWidth: W,
            minimumRenderWidth,
            legendX: absoluteLegendX,
            legendContentWidth,
            legendOuterPadding
          });
          W = minimumRenderWidth;
        }
      }
      plotEl.style.position = 'relative';
      plotEl.style.minWidth = W > baseDrawableWidth ? `${W}px` : '';
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
      chartStyle.prepareSvg(svg, { scopeId: 'pca' });
      svg.addEventListener('mouseleave', handlePcaPlotMouseLeave);
      const shouldUseCanvasPoints = points.length >= PCA_FAST_POINT_THRESHOLD;
      let fastPointCanvas = null;
      let fastPointCtx = null;
      if (shouldUseCanvasPoints) {
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
        fastPointCtx = typeof fastPointCanvas.getContext === 'function' ?
          fastPointCanvas.getContext('2d') :
          null;
        if (!fastPointCtx) {
          fastPointCtx = createNoopCanvasContext();
        }
        if (fastPointCtx) {
          if (typeof fastPointCtx.clearRect === 'function') {
            fastPointCtx.clearRect(0, 0, W, H);
          }
          try {
            fastPointCtx.imageSmoothingEnabled = false;
          } catch (err) {
            /* ignore */ }
          fastPointModeActive = true;
        }
      }
      layeredRoot.appendChild(svg);
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
          const gridLine = add('line', Object.assign({
            x1: x,
            y1: margin.top,
            x2: x,
            y2: margin.top + plotH
          }, gridStrokeAttrs));
          gridLine.setAttribute('data-grid-control', '1');
        });
        yScale.ticks.forEach((t) => {
          const y = y2px(t);
          const gridLine = add('line', Object.assign({
            x1: margin.left,
            y1: y,
            x2: margin.left + plotW,
            y2: y
          }, gridStrokeAttrs));
          gridLine.setAttribute('data-grid-control', '1');
        });
        debugLog('Debug: pca grid stroke scaled', {
          vertical: xScale.ticks.length,
          horizontal: yScale.ticks.length,
          gridStrokeStyle
        });
      }

      const xTickPositions = xScale.ticks.map(t => x2px(t));
      const yTickPositions = yScale.ticks.map(t => y2px(t));
      let axisXStart = xTickPositions.length ? Math.min(...xTickPositions) : margin.left;
      let axisXEnd = xTickPositions.length ? Math.max(...xTickPositions) : margin.left + plotW;
      let axisYStart = yTickPositions.length ? Math.min(...yTickPositions) : margin.top;
      let axisYEnd = yTickPositions.length ? Math.max(...yTickPositions) : margin.top + plotH;
      if (axisXStart === axisXEnd) {
        axisXStart = margin.left;
        axisXEnd = margin.left + plotW;
      }
      if (axisYStart === axisYEnd) {
        axisYStart = margin.top;
        axisYEnd = margin.top + plotH;
      }
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
      const xAxisLine = add('line', {
        x1: axisXStart,
        y1: margin.top + plotH,
        x2: axisXEnd,
        y2: margin.top + plotH,
        stroke: axisStroke,
        'stroke-linecap': 'square',
        'stroke-width': axisStrokeWidth
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
        'stroke-width': axisStrokeWidth
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
          y2: margin.top + plotH + tickLen,
          stroke: axisStroke,
          'stroke-width': axisStrokeWidth
        });
        const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
        const txt = add('text', {
          x,
          y: margin.top + plotH + tickLen + tickGap + extra,
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
            opacity: minorTickStyle.opacity
          });
        });
      }
      yScale.ticks.forEach((t, i) => {
        const y = y2px(t);
        add('line', {
          x1: margin.left - tickLen,
          y1: y,
          x2: margin.left,
          y2: y,
          stroke: axisStroke,
          'stroke-width': axisStrokeWidth
        });
        const txt = add('text', {
          x: margin.left - (tickLen + tickGap),
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

      const yLabelOffsetSpan = (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
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
      makeEditableHelper(titleText, text => commitTitleChange(text, '2d-title'));
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
          const style = (groupMeta && Number.isInteger(assignment)) ? groupMeta.styleByIndex?.[assignment] : null;
          const labelPointStyle = pt.label ? (pcaState.labelPointStyles[pt.label] || null) : null;
          const color = style?.color || (pt.label ? (pcaState.labelColors[pt.label] || DEFAULT_SCATTER_COLORS[0]) : fill);
          const labelShape = pt.label ? pcaState.labelShapes[pt.label] : null;
          const shape = style?.shape || labelShape || 'circle';
          const pointRadiusBase = Number.isFinite(Number(labelPointStyle?.size)) ? Number(labelPointStyle.size) : Number(pcaDotSize.value);
          const pointRadiusPx = chartStyle.scaleStrokeWidth(pointRadiusBase, styleScaleInfo, {
            context: 'pca-dot-size-label',
            min: 0.5
          });
          const pointTransparency = Number.isFinite(Number(labelPointStyle?.alpha)) ? Number(labelPointStyle.alpha) : alpha;
          const pointOpacityLocal = Math.min(Math.max(1 - pointTransparency, 0), 1);
          const pointBorderWidthBase = Number.isFinite(Number(labelPointStyle?.borderWidth)) ?
            Number(labelPointStyle.borderWidth) :
            (Number.isFinite(Number(labelPointStyle?.strokeWidth)) ? Number(labelPointStyle.strokeWidth) : borderWidthRaw);
          const pointBorderWidthPx = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, {
            context: 'pca-border-label',
            min: 0
          });
          const pointBorderColor = (typeof labelPointStyle?.borderColor === 'string' && labelPointStyle.borderColor) ?
            labelPointStyle.borderColor :
            ((typeof labelPointStyle?.stroke === 'string' && labelPointStyle.stroke) ? labelPointStyle.stroke : borderColor);
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
          const labelPointStyle = pt.label ? (pcaState.labelPointStyles[pt.label] || null) : null;
          const color = style?.color || (pt.label ? (pcaState.labelColors[pt.label] || DEFAULT_SCATTER_COLORS[0]) : fill);
          const labelShape = pt.label ? pcaState.labelShapes[pt.label] : null;
          const shape = style?.shape || labelShape || 'circle';
          const pointRadiusBase = Number.isFinite(Number(labelPointStyle?.size)) ? Number(labelPointStyle.size) : Number(pcaDotSize.value);
          const pointRadiusPx = chartStyle.scaleStrokeWidth(pointRadiusBase, styleScaleInfo, {
            context: 'pca-dot-size-label',
            min: 0.5
          });
          const pointTransparency = Number.isFinite(Number(labelPointStyle?.alpha)) ? Number(labelPointStyle.alpha) : alpha;
          const pointOpacityLocal = Math.min(Math.max(1 - pointTransparency, 0), 1);
          const pointBorderWidthBase = Number.isFinite(Number(labelPointStyle?.borderWidth)) ?
            Number(labelPointStyle.borderWidth) :
            (Number.isFinite(Number(labelPointStyle?.strokeWidth)) ? Number(labelPointStyle.strokeWidth) : borderWidthRaw);
          const pointBorderWidthPx = chartStyle.scaleStrokeWidth(pointBorderWidthBase, styleScaleInfo, {
            context: 'pca-border-label',
            min: 0
          });
          const pointBorderColor = (typeof labelPointStyle?.borderColor === 'string' && labelPointStyle.borderColor) ?
            labelPointStyle.borderColor :
            ((typeof labelPointStyle?.stroke === 'string' && labelPointStyle.stroke) ? labelPointStyle.stroke : borderColor);
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
            const groupLabel = Number.isInteger(assignment) ?
              (style?.label || groupMeta?.entries?.[assignment]?.label || '') :
              (style?.label || '');
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
      if (hasManualLabels && labelLayout2d?.computePointLabelLayout && labelLayout2d?.computePointLabelFontSize) {
        const manualLabelEntries = [];
        const pointBounds = [];
        points.forEach(pt => {
          const cx = x2px(pt.x);
          const cy = y2px(pt.y);
          pointBounds.push({
            cx,
            cy,
            r: dotSizePx
          });
          const labelText = pt.label ? String(pt.label).trim() : '';
          if (pt.isManualLabel && labelText) {
            manualLabelEntries.push({
              text: labelText,
              cx,
              cy,
              radius: dotSizePx
            });
          }
        });
        if (manualLabelEntries.length) {
          const labelLayer = document.createElementNS(NS, 'g');
          labelLayer.setAttribute('data-layer', 'point-labels');
          labelLayer.setAttribute('pointer-events', 'none');
          const baseManualLabelSize = fs * 0.6;
          const xTickFontSize = labelLayout2d.readFontSizeFromNodes ? labelLayout2d.readFontSizeFromNodes(xTickNodes) : null;
          const yTickFontSize = labelLayout2d.readFontSizeFromNodes ? labelLayout2d.readFontSizeFromNodes(yTickNodes) : null;
          const tickFontSizeCap = (Number.isFinite(xTickFontSize) && Number.isFinite(yTickFontSize)) ?
            Math.min(xTickFontSize, yTickFontSize) :
            (Number.isFinite(xTickFontSize) ?
              xTickFontSize :
              (Number.isFinite(yTickFontSize) ? yTickFontSize : fs));
          const labelFontSizeRaw = labelLayout2d.computePointLabelFontSize(baseManualLabelSize, manualLabelEntries.length, plotW, plotH);
          const labelFontSize = Math.min(labelFontSizeRaw, tickFontSizeCap);
          const labelScale = Math.min(1, labelFontSize / Math.max(1, baseManualLabelSize));
          const leaderStrokeWidth = chartStyle.scaleStrokeWidth(0.75 * labelScale, styleScaleInfo, {
            context: 'pca-point-label',
            min: 0.25
          });
          const labelColor = chartStyle.TEXT_COLOR || '#333333';
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
            if (!textValue || !placement) {
              return;
            }
            const textX = placement.textX;
            const textY = placement.textY;
            const anchor = placement.anchor;
            const lineX2 = placement.lineX2;
            const leader = document.createElementNS(NS, 'line');
            leader.setAttribute('x1', String(cx));
            leader.setAttribute('y1', String(cy));
            leader.setAttribute('x2', String(lineX2));
            leader.setAttribute('y2', String(textY));
            leader.setAttribute('stroke', labelColor);
            leader.setAttribute('stroke-width', String(leaderStrokeWidth));
            leader.setAttribute('stroke-linecap', 'round');
            labelLayer.appendChild(leader);
            const textNode = document.createElementNS(NS, 'text');
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
          y: legendOriginY
        });
        if (legendGroup && typeof legendGroup.querySelectorAll === 'function') {
          const textNodes = legendGroup.querySelectorAll('text');
          Array.from(textNodes).forEach((node, idx) => {
            try {
              markFontEditable(node, 'legend', `legend-${idx}`);
            } catch (err) {}
          });
        }
        if (typeof Shared.enableLegendDrag === 'function') {
          Shared.enableLegendDrag(legendGroup, svg, {
            undoLabel: 'pca-legend-2d',
            onDragEnd: pos => {
              // Store both absolute and relative positions for 2D legend
              const relX = (pos.x - (margin.left + plotW)) / legendLayout.legendGapPx;
              const relY = (pos.y - margin.top) / plotH;
              pcaLabelPositionsState = patchPcaLabelPositionsState(drawSession, {
                legend: {
                  x: pos.x,
                  y: pos.y,
                  relX,
                  relY
                }
              }, {
                reason: 'pca-2d-legend-position'
              });
              if (Shared.isDebugEnabled?.()) {
                console.debug('Debug: pca 2d legend position saved', {
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
        height: H,
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
          width: W,
          height: H
        }
      });
      pcaLayout?.syncPanels?.({
        skipSchedule: true
      });
      syncPcaAutoDrawNoticeWidth('draw');
    } catch (err) {
      debugLog('Error: drawPca failure', {
        message: err?.message || err
      });
      throw err;
    } finally {
      const totalEnd = nowMs();
      const fastModeChanged = pcaState.fastPointMode !== fastPointModeActive;
      pcaState.fastPointMode = fastPointModeActive;
      if (fastModeChanged || fastPointModeActive) {
        updateAutoDrawUi({
          preserveReason: true
        });
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
          mirrorActive: true
        });
      }
      updatePcaRenderRuntime(drawSession, runtime => {
        if (cachePayload) {
          runtime.cachedRender = getPcaAnalysisCache(drawSession);
          runtime.dataDirty = false;
        }
        runtime.viewDirty = false;
      });
      updatePcaDrawRuntime(drawSession, runtime => {
        runtime.resizeWarmupPending = false;
      });
      try {
        capturePcaSessionStateFromActive(drawSession || getPcaProjectionSession({
          reason: 'pca-projection-mutation'
        }), {
          reason: drawOpts.reason || 'pca-draw-complete'
        });
      } catch (captureErr) {
        debugLog('Debug: pca session capture after draw failed', {
          message: captureErr?.message || String(captureErr)
        });
      }
      if (!skipPerfRecord) {
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

  function getPcaGraphPayload() {
    syncPcaRuntimeControlsFromDom();
    const noteControl = notesState.control || null;
    const notesText = noteControl && typeof noteControl.getValue === 'function' ?
      noteControl.getValue() :
      (notesState.text || '');
    const notesOpen = noteControl && typeof noteControl.isOpen === 'function' ?
      noteControl.isOpen() :
      !!notesState.open;
    notesState.text = notesText;
    notesState.open = notesOpen;
    const axisSettings = ensureAxisSettings();
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
    const payloadSession = getActivePcaSessionForState();
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
      data: Shared.hot.trimTrailingEmptyCols(activeHot?.getData?.() || []),
      exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
      filters: activeHot?.exportFilters?.() || Shared.hot.exportFilters(activeHot),
      dataViews: includeDataViews ? dataViewsPayload : undefined,
      activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
      config: {
        ...snapshotPcaConfig(axisSettings),
        stats: {
          resultsModel: statsPanelSnapshot.resultsModel || null,
          reportModel: statsPanelSnapshot.reportModel || null,
          summaryModel: statsPanelSnapshot.summaryModel || null
        },
        notes: {
          text: notesText,
          open: notesOpen
        }
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

  function snapshotPcaConfig(axisSettingsOverride) {
    const axisSettings = axisSettingsOverride && typeof axisSettingsOverride === 'object' ?
      axisSettingsOverride :
      ensureAxisSettings();
    const controls = normalizePcaRuntimeControls(pcaState.controls || {});
    return {
      method: controls.method,
      dotSize: controls.dotSize,
      fill: controls.fill,
      colorScheme: pcaState.theme?.colorScheme || 'scientific',
      textColor: pcaState.theme?.textColor || (chartStyle.TEXT_COLOR || '#000000'),
      backgroundColor: pcaState.theme?.backgroundColor || '#ffffff',
      border: controls.border,
      borderWidth: controls.borderWidth,
      tableFormat: pcaState.tableFormat,
      loadingsLimit: pcaState.loadingsLimit,
      biplotShowSampleScores: sanitizePcaBiplotShowSampleScores(pcaState.biplotShowSampleScores),
      screeShowParallel: sanitizePcaScreeShowParallel(pcaState.screeShowParallel),
      grouped: pcaState.grouped ? {
        replicatesPerGroup: pcaState.grouped.replicatesPerGroup,
        names: getPcaGroupedNamesFromHot(pcaHotInstance),
        sampleLabels: getPcaGroupedSampleLabelsFromHot(pcaHotInstance),
        colors: Array.isArray(pcaState.grouped.colors) ? [...pcaState.grouped.colors] : [],
        shapes: Array.isArray(pcaState.grouped.shapes) ? [...pcaState.grouped.shapes] : []
      } : null,
      componentSelection: {
        rule: sanitizePcaComponentSelectionRule(pcaState.componentSelection?.rule),
        eigenThreshold: sanitizePcaEigenThreshold(pcaState.componentSelection?.eigenThreshold, PCA_DEFAULT_EIGEN_THRESHOLD),
        parallelIterations: sanitizePcaParallelIterations(pcaState.componentSelection?.parallelIterations, PCA_DEFAULT_PARALLEL_ITERATIONS),
        includeNonRetainedAxes: sanitizePcaIncludeNonRetainedAxes(pcaState.componentSelection?.includeNonRetainedAxes)
      },
      alpha: controls.alpha,
      labelColors: pcaState.labelColors,
      labelShapes: pcaState.labelShapes,
      labelPointStyles: pcaState.labelPointStyles,
      showGrid: !!controls.showGrid,
      gridStyle: getGridStyle(axisSettings?.strokeWidth),
      showFrame: !!controls.showFrame,
      showLegend: controls.showLegend !== false,
      scale: !!controls.scale,
      axesVarianceScaled: pcaState.axesVarianceScaled,
      equalScaleAxes: pcaState.equalScaleAxes,
      equalAxes: pcaState.equalAxes,
      fontSize: controls.fontSize,
      fontStyles: (exportFontStyles('pca') || undefined),
      labels: {
        title: (pcaState.labels && typeof pcaState.labels.title === 'string') ?
          pcaState.labels.title :
          getDefaultTitleForMethod(pcaState.lastMethod || 'pca')
      },
      viewMode: controls.viewMode,
      axisSelection: {
        x: pcaState.axisSelection.x,
        y: pcaState.axisSelection.y,
        z: pcaState.axisSelection.z
      },
      rotation: {
        x: pcaState.rotation.x,
        y: pcaState.rotation.y,
        z: pcaState.rotation.z,
        quaternion: pcaState.rotation.quaternion ? {
          w: pcaState.rotation.quaternion.w,
          x: pcaState.rotation.quaternion.x,
          y: pcaState.rotation.quaternion.y,
          z: pcaState.rotation.quaternion.z
        } : null
      },
      axis: {
        strokeWidth: axisSettings?.strokeWidth,
        color: axisSettings?.color,
        tickIntervalX: axisSettings?.x?.tickInterval ?? null,
        tickIntervalY: axisSettings?.y?.tickInterval ?? null,
        minorTicksX: axisSettings?.x?.minorTicks ?? false,
        minorTicksY: axisSettings?.y?.minorTicks ?? false,
        minorTickSubdivisionsX: clampMinorTickSubdivisions(axisSettings?.x?.minorTickSubdivisions),
        minorTickSubdivisionsY: clampMinorTickSubdivisions(axisSettings?.y?.minorTickSubdivisions)
      },
      tsne: {
        perplexity: pcaTsnePerplexity?.value ?? DEFAULT_TSNE_SETTINGS.perplexity,
        learningRate: pcaTsneLearningRate?.value ?? DEFAULT_TSNE_SETTINGS.learningRate,
        iterations: pcaTsneIterations?.value ?? DEFAULT_TSNE_SETTINGS.iterations,
        earlyExaggeration: pcaTsneExaggeration?.value ?? DEFAULT_TSNE_SETTINGS.earlyExaggeration
      },
      umap: {
        neighbors: pcaUmapNeighbors?.value ?? DEFAULT_UMAP_SETTINGS.neighbors,
        minDist: pcaUmapMinDist?.value ?? DEFAULT_UMAP_SETTINGS.minDist,
        learningRate: pcaUmapLearningRate?.value ?? DEFAULT_UMAP_SETTINGS.learningRate,
        epochs: pcaUmapEpochs?.value ?? DEFAULT_UMAP_SETTINGS.epochs
      },
      labelPositions: normalizePcaLabelPositionsState(pcaState.labelPositions || {})
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
    const result = await fileIO.openGraphFile({
      context: 'pca',
      setFileHandle: handle => setPcaFileHandleForSession(handle, operationSession),
      setFileName: name => setPcaFileNameForSession(name, operationSession),
      loadFromFile: file => loadPcaGraphFile(file),
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
    const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
    const scheduleOriginal = typeof scheduleDrawPca === 'function' ? scheduleDrawPca : null;
    const shouldSuspendSchedule = !!(scheduleOriginal && (skipDraw || !skipDataLoad));
    const payloadSession = getActivePcaSessionForState();
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
      if (c.grouped && typeof c.grouped === 'object') {
        pcaState.grouped = {
          replicatesPerGroup: c.grouped.replicatesPerGroup,
          names: Array.isArray(c.grouped.names) ? c.grouped.names.slice() : [],
          sampleLabels: Array.isArray(c.grouped.sampleLabels) ? c.grouped.sampleLabels.slice() : [],
          colors: Array.isArray(c.grouped.colors) ? [...c.grouped.colors] : [],
          shapes: Array.isArray(c.grouped.shapes) ? [...c.grouped.shapes] : []
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
      if (c.notes && typeof c.notes === 'object') {
        notesState.text = c.notes.text == null ? '' : String(c.notes.text);
        notesState.open = !!c.notes.open;
      } else if (typeof c.notes === 'string') {
        notesState.text = c.notes;
        notesState.open = !!notesState.open;
      } else {
        notesState.text = '';
        notesState.open = false;
      }
      if (notesState.control) {
        notesState.control.setValue(notesState.text);
        notesState.control.setOpen(notesState.open);
      }
      importFontStyles('pca', c.fontStyles || null);
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
      pcaState.labelColors = c.labelColors || {};
      pcaState.labelShapes = c.labelShapes || {};
      pcaState.labelPointStyles = c.labelPointStyles || {};
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
      pcaScale.checked = !!c.scale;
      const hasEqualScale = Object.prototype.hasOwnProperty.call(c, 'equalScaleAxes');
      const hasEqualAxes = Object.prototype.hasOwnProperty.call(c, 'equalAxes');
      const hasVariance = Object.prototype.hasOwnProperty.call(c, 'axesVarianceScaled');
      pcaState.axesVarianceScaled = !!c.axesVarianceScaled;
      if (hasEqualScale) {
        pcaState.equalScaleAxes = !!c.equalScaleAxes;
      }
      if (hasEqualAxes) {
        pcaState.equalAxes = !!c.equalAxes;
      }
      if (!hasEqualScale && (hasEqualAxes || hasVariance)) {
        pcaState.equalScaleAxes = false;
      }
      if (pcaState.equalScaleAxes) {
        pcaState.equalAxes = false;
        pcaState.axesVarianceScaled = false;
        debugLog('Debug: pca axes length payload exclusivity enforced', {
          kept: 'equal-scale'
        });
      } else if (pcaState.axesVarianceScaled && pcaState.equalAxes) {
        pcaState.equalAxes = false;
        debugLog('Debug: pca axes length payload exclusivity enforced', {
          kept: 'variance'
        });
      }
      if (pcaVarianceAxisScale) {
        pcaVarianceAxisScale.checked = !!pcaState.axesVarianceScaled;
      }
      ensurePcaAxesLengthControlPlacement();
      const restoredFontSize = syncPcaFontSizeControl(
        pcaFontSize,
        pcaFontSizeVal,
        c.fontSize || readPcaInputValue(pcaFontSize, pcaState.controls?.fontSize ?? createDefaultPcaRuntimeControls().fontSize), {
          manual: true
        }
      );
      pcaState.controls = normalizePcaRuntimeControls({
        ...(pcaState.controls || {}),
        fontSize: restoredFontSize
      });
      if (pcaViewMode) {
        const restoredView = c.viewMode || DEFAULT_VIEW_MODE;
        pcaViewMode.value = restoredView;
        pcaViewMode.dispatchEvent(new Event('change'));
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
      syncPcaFontSizeControl(pcaFontSize, pcaFontSizeVal, restoredFontSize, {
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
      setPcaStatsPanelResultsState(restoredPanelState, getPcaProjectionSession({
        reason: 'pca-projection-mutation'
      }), {
        mirrorActive: true
      });
      const restoredStats = (obj.stats && typeof obj.stats === 'object') ?
        obj.stats :
        ((c.stats && typeof c.stats === 'object') ? c.stats : null);
      if (restoredStats) {
        setPcaStatsSnapshot(restoredStats, getPcaProjectionSession({
          reason: 'pca-projection-mutation'
        }), {
          statsPanel: restoredPanelState,
          mirrorActive: true
        });
        const restoredStatsSnapshot = getPcaStatsSnapshot(getActivePcaSessionForState());
        debugLog('Debug: pca stats restored from payload', {
          hasEigenSummary: Array.isArray(restoredStatsSnapshot?.eigenSummary) && restoredStatsSnapshot.eigenSummary.length > 0,
          hasScree: Array.isArray(restoredStatsSnapshot?.scree) && restoredStatsSnapshot.scree.length > 0,
          method: restoredStatsSnapshot?.method || null,
          hasSavedReportModel: !!savedStatsModels.savedReportModel,
          hasSavedSummaryModel: !!savedStatsModels.savedSummaryModel,
          source: (obj.stats && typeof obj.stats === 'object') ? 'payload.stats' : 'config.stats'
        });
        restorePcaStatsFromPayload(savedStatsModels);
        if (skipDraw && !skipDataLoad) {
          finalizePcaStatsPayloadRestore(savedStatsModels, 'pca-stats-payload-restore-after-data-load');
        }
      } else {
        resetStatsPanel('');
        clearPcaResultsState(getActivePcaSessionForState(), {
          mirrorActive: true
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
      syncPcaRuntimeControlsFromDom();
      const payloadOwnerSession = getPcaProjectionSession({
        reason: 'pca-payload-owner-sync'
      });
      capturePcaSessionStateFromActive(payloadOwnerSession, {
        tabId: payloadOwnerSession?.tabId || meta?.tabId || getPcaProjectionTabId() || null,
        reason: meta?.reason || 'pca-payload-owner-sync'
      });
      if (styleOnly) {
        markPcaViewDirty(meta?.reason || 'pca-style-payload');
      }
      if (!skipDraw && scheduleOriginal) {
        if (styleOnly) {
          scheduleOriginal({
            viewOnly: true,
            reason: meta?.reason || 'pca-style-payload'
          });
        } else {
          scheduleOriginal({
            reason: meta?.reason || (meta?.source ? `payload-${meta.source}` : 'payload')
          });
        }
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
    notesState.control = Shared.componentLifecycle?.ensureOwnedNotesControl?.({
      componentKey: 'pca',
      ownerTabId: getPcaProjectionTabId() || null,
      container: stack,
      notesState,
      control: notesState.control,
      id: 'pca-notes',
      scopeId: 'pca',
      fontKey: 'notes',
      unavailableMessage: 'pca notes helper unavailable',
      debugLog,
      applyToControl: control => {
        control.setValue(notesState.text || '');
        control.setOpen(!!notesState.open);
      },
      onChange: value => {
        notesState.text = value == null ? '' : String(value);
      },
      onToggle: open => {
        notesState.open = !!open;
      }
    }) || notesState.control || null;
  }

  function loadPcaGraphFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result);
        if (!applyPcaPayload(obj, {
            source: 'file',
            flagOverlay: true,
            overlayReason: 'graph-file'
          })) {
          console.warn('pca payload rejected from file', {
            hasType: !!obj?.type
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
    try {
      await drawPca(drawOpts);
    } catch (err) {
      status = 'error';
      throw err;
    } finally {
      resolvePcaOverlay(status);
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
    const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
    const suppressOverlay = nextOpts.viewOnly === true || nextOpts.silentOverlay === true;
    if (nextOpts.force && !suppressOverlay) {
      markPcaOverlayPending(overlayReason);
      forcePcaOverlay(overlayReason, {
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
        delayForOverlay: !suppressOverlay && nextOpts.force !== true,
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

  function schedulePcaActivationRecoveryDraw(tabLike, reason, attempt = 0) {
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
      userInitiated: true
    });
    if (attempt < 2) {
      const retryDelay = 80 * (attempt + 1);
      schedulePcaScopedTimeout({
        tabId: tabId || null,
        reason: `${reason || 'activate-tab'}-blank-graph-retry`
      }, () => {
        if (!hasPcaPrimaryGraphContent(tabLike)) {
          schedulePcaActivationRecoveryDraw(tabLike, reason, attempt + 1);
        }
      }, retryDelay);
    }
    return true;
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
    if (!node) {
      return null;
    }
    const doc = node.ownerDocument || global.document;
    const fragment = doc?.createDocumentFragment ? doc.createDocumentFragment() : null;
    if (!fragment) {
      return null;
    }
    let count = 0;
    while (node.firstChild) {
      fragment.appendChild(node.firstChild);
      count += 1;
    }
    return {
      fragment,
      count
    };
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
    let labelKey = pointData.label ? String(pointData.label).trim() : '';
    let hasLabelScope = !!labelKey;
    const knownLabelKeys = () => {
      const keys = new Set();
      const addKey = value => {
        const normalized = String(value == null ? '' : value).trim();
        if (normalized) {
          keys.add(normalized);
        }
      };
      addKey(labelKey);
      Object.keys(pcaState.labelColors || {}).forEach(addKey);
      Object.keys(pcaState.labelShapes || {}).forEach(addKey);
      Object.keys(pcaState.labelPointStyles || {}).forEach(addKey);
      return Array.from(keys);
    };
    const orderedLabelKeys = () => {
      const keys = knownLabelKeys();
      if (!labelKey) {
        return keys;
      }
      return [labelKey].concat(keys.filter(name => name !== labelKey));
    };
    const labelScopeOptions = (() => {
      const options = [{
        value: 'global',
        label: 'Global',
        disabled: false
      }];
      const keys = orderedLabelKeys();
      if (keys.length) {
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
      } else {
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
      if (!hasLabelScope) {
        return null;
      }
      const existing = pcaState.labelPointStyles[labelKey];
      if (existing && typeof existing === 'object') {
        return existing;
      }
      pcaState.labelPointStyles[labelKey] = {};
      return pcaState.labelPointStyles[labelKey];
    };
    const applyLabelPointPatch = patch => {
      if (!hasLabelScope) {
        return;
      }
      const style = ensureLabelPointStyle();
      Object.assign(style, patch);
      requestPcaViewRefresh('label-point-style');
    };
    const applyGlobalPointPatch = (key, value) => {
      Object.keys(pcaState.labelPointStyles).forEach(label => {
        pcaState.labelPointStyles[label] = Object.assign({}, pcaState.labelPointStyles[label] || {}, {
          [key]: value
        });
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
        onChange(nextScope, ctx) {
          if (nextScope === 'label') {
            const scopedLabelKey = String(ctx?.scopeDataset || '').trim();
            if (scopedLabelKey) {
              labelKey = scopedLabelKey;
              hasLabelScope = true;
            }
          }
        }
      },
      fillShape: {
        label: 'Fill/Shape',
        shapeOptions: GROUP_SHAPE_OPTIONS,
        getColor(ctx) {
          if (ctx.scope === 'label' && hasLabelScope) {
            return pcaState.labelColors[labelKey] || pcaFill.value || '#0000ff';
          }
          return pcaFill.value || '#0000ff';
        },
        getShape(ctx) {
          if (ctx.scope === 'label' && hasLabelScope) {
            return sanitizeGroupShape(pcaState.labelShapes[labelKey] || 'circle', 0);
          }
          const labels = Object.keys(pcaState.labelShapes || {});
          if (!labels.length) {
            return 'circle';
          }
          const shapes = labels.map((label, idx) => sanitizeGroupShape(pcaState.labelShapes[label], idx));
          const unique = new Set(shapes);
          return unique.size === 1 ? shapes[0] : 'circle';
        },
        onColorInput(value, ctx) {
          if (ctx.scope === 'label' && hasLabelScope) {
            applyPcaLabelColor(labelKey, value);
            return;
          }
          pcaFill.value = value;
          Object.keys(pcaState.labelColors).forEach(label => {
            pcaState.labelColors[label] = value;
          });
          requestPcaViewRefresh('fill-change');
        },
        onColorChange(value, ctx) {
          if (ctx.scope === 'label' && hasLabelScope) {
            applyPcaLabelColor(labelKey, value);
            return;
          }
          pcaFill.value = value;
          Object.keys(pcaState.labelColors).forEach(label => {
            pcaState.labelColors[label] = value;
          });
          requestPcaViewRefresh('fill-change');
        },
        onShapeChange(value, ctx) {
          const sanitized = sanitizeGroupShape(value || 'circle', 0);
          if (ctx.scope === 'label' && hasLabelScope) {
            applyPcaLabelShape(labelKey, sanitized, 0);
            return;
          }
          Object.keys(pcaState.labelShapes).forEach((label, idx) => {
            pcaState.labelShapes[label] = sanitizeGroupShape(sanitized, idx);
          });
          requestPcaViewRefresh('label-shape-change');
        }
      },
      border: {
        label: 'Border',
        getColor(ctx) {
          if (ctx.scope === 'label' && hasLabelScope) {
            const style = pcaState.labelPointStyles[labelKey] || {};
            return style.borderColor || style.stroke || pcaBorder.value || '#000000';
          }
          return pcaBorder.value || '#000000';
        },
        onColorInput(value, ctx) {
          if (ctx.scope === 'label' && hasLabelScope) {
            applyLabelPointPatch({
              borderColor: value,
              stroke: value
            });
          } else {
            pcaBorder.value = value;
            applyGlobalPointPatch('borderColor', value);
            applyGlobalPointPatch('stroke', value);
            requestPcaViewRefresh('border-color-change');
          }
        },
        onColorChange(value, ctx) {
          if (ctx.scope === 'label' && hasLabelScope) {
            applyLabelPointPatch({
              borderColor: value,
              stroke: value
            });
          } else {
            pcaBorder.value = value;
            applyGlobalPointPatch('borderColor', value);
            applyGlobalPointPatch('stroke', value);
            requestPcaViewRefresh('border-color-change');
          }
        },
        getWidth(ctx) {
          if (ctx.scope === 'label' && hasLabelScope && Number.isFinite(Number(pcaState.labelPointStyles[labelKey]?.borderWidth))) {
            return Number(pcaState.labelPointStyles[labelKey].borderWidth);
          }
          if (ctx.scope === 'label' && hasLabelScope && Number.isFinite(Number(pcaState.labelPointStyles[labelKey]?.strokeWidth))) {
            return Number(pcaState.labelPointStyles[labelKey].strokeWidth);
          }
          return Number(pcaBorderWidth.value) || 0;
        },
        onWidthChange(value, ctx) {
          const next = Math.max(0, Number(value) || 0);
          if (ctx.scope === 'label' && hasLabelScope) {
            applyLabelPointPatch({
              borderWidth: next,
              strokeWidth: next
            });
          } else {
            pcaBorderWidth.value = String(next);
            applyGlobalPointPatch('borderWidth', next);
            applyGlobalPointPatch('strokeWidth', next);
            requestPcaViewRefresh('border-width-change');
          }
        }
      },
      size: {
        get(ctx) {
          if (ctx.scope === 'label' && hasLabelScope && Number.isFinite(Number(pcaState.labelPointStyles[labelKey]?.size))) {
            return Number(pcaState.labelPointStyles[labelKey].size);
          }
          return Number(pcaDotSize.value) || 0;
        },
        onChange(value, ctx) {
          const next = Math.max(0, Number(value) || 0);
          if (ctx.scope === 'label' && hasLabelScope) {
            applyLabelPointPatch({
              size: next
            });
          } else {
            pcaDotSize.value = String(next);
            applyGlobalPointPatch('size', next);
            requestPcaViewRefresh('dot-size-change');
          }
        }
      },
      transparency: {
        label: 'Transparency',
        get(ctx) {
          if (ctx.scope === 'label' && hasLabelScope && Number.isFinite(Number(pcaState.labelPointStyles[labelKey]?.alpha))) {
            return Number(pcaState.labelPointStyles[labelKey].alpha);
          }
          return Number(pcaAlpha.value) || 0;
        },
        onChange(value, ctx) {
          const next = Math.min(1, Math.max(0, Number(value) || 0));
          if (ctx.scope === 'label' && hasLabelScope) {
            applyLabelPointPatch({
              alpha: next
            });
          } else {
            pcaAlpha.value = String(next);
            pcaAlphaVal.textContent = String(next);
            applyGlobalPointPatch('alpha', next);
            requestPcaViewRefresh('alpha-change');
          }
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
    syncPcaRuntimeControlsFromDom();
    const noteControl = notesState.control || null;
    const notesText = noteControl && typeof noteControl.getValue === 'function' ?
      noteControl.getValue() :
      (notesState.text || '');
    const notesOpen = noteControl && typeof noteControl.isOpen === 'function' ?
      noteControl.isOpen() :
      !!notesState.open;
    notesState.text = notesText;
    notesState.open = notesOpen;
    const statsPanelSnapshot = capturePcaStatsPanelState();
    const captureSession = getActivePcaSessionForState();
    const captureRenderRuntime = getPcaRenderRuntime(captureSession, {
      seedFromActive: true
    });
    const statsSnapshot = getPcaStatsSnapshot(captureSession);
    const snapshot = {
      state: {
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
        rotationPending: false,
        rotationPendingLogged: false,
        axesVarianceScaled: !!pcaState.axesVarianceScaled,
        equalScaleAxes: pcaState.equalScaleAxes !== false,
        equalAxes: !!pcaState.equalAxes,
        axisSettings: cloneSimple(pcaState.axisSettings) || null,
        gridStyle: cloneSimple(pcaState.gridStyle) || null,
        tableFormat: pcaState.tableFormat || 'standard',
        grouped: cloneSimple(pcaState.grouped) || null,
        componentSelection: cloneSimple(pcaState.componentSelection) || null,
        biplotShowSampleScores: sanitizePcaBiplotShowSampleScores(pcaState.biplotShowSampleScores),
        screeShowParallel: sanitizePcaScreeShowParallel(pcaState.screeShowParallel),
        loadingsLimit: pcaState.loadingsLimit,
        labels: cloneSimple(pcaState.labels) || {
          title: getDefaultTitleForMethod('pca')
        },
        lastMethod: pcaState.lastMethod || 'pca',
        lastAutoDrawEvaluation: cloneSimple(pcaState.lastAutoDrawEvaluation) || null,
        lastDataShape: cloneSimple(pcaState.lastDataShape) || {
          rows: 0,
          cols: 0
        },
        performance: cloneSimple(pcaState.performance) || null,
        fastPointMode: !!pcaState.fastPointMode,
        dataDirty: captureRenderRuntime.dataDirty !== false,
        viewDirty: captureRenderRuntime.viewDirty !== false,
        labelPositions: normalizePcaLabelPositionsState(cloneSimple(pcaState.labelPositions) || {}),
        theme: cloneSimple(pcaState.theme) || null,
        controls: cloneSimple(pcaState.controls) || createDefaultPcaRuntimeControls(),
        // Per-tab resolved colors. The snapshot must carry the actual color values,
        // not just theme.colorScheme: on a same-component tab switch the activation
        // path restores this runtime snapshot instead of re-applying the payload, so
        // omitting these left the redraw using the previously rendered tab's colors
        // (scheme id said grayscale while the graph kept the sibling's palette).
        colors: {
          labelColors: cloneSimple(pcaState.labelColors) || {},
          labelShapes: cloneSimple(pcaState.labelShapes) || {},
          labelPointStyles: cloneSimple(pcaState.labelPointStyles) || {},
          fill: pcaState.controls?.fill,
          border: pcaState.controls?.border,
          borderWidth: pcaState.controls?.borderWidth,
          dotSize: pcaState.controls?.dotSize,
          alpha: pcaState.controls?.alpha
        }
      },
      results: normalizePcaResultsState({
        ...getPcaResultsState(captureSession),
        stats: cloneSimple(statsSnapshot) || null,
        statsPanel: statsPanelSnapshot
      }),
      stats: cloneSimple(statsSnapshot) || null,
      statsPanel: statsPanelSnapshot,
      notes: {
        text: notesText,
        open: notesOpen
      },
      pendingDrawOptions: {},
      reason: meta?.reason || 'pca-runtime-capture'
    };
    const effectiveMeta = {
      ...(meta || {}),
      tabId: meta.tabId || meta.workspaceTabId || meta.tab?.id || getPcaProjectionTabId() || null,
      reason: snapshot.reason || meta?.reason || 'pca-runtime-capture'
    };
    const ownedRecord = rememberPcaOwnedRuntimeRecord(effectiveMeta.tab || effectiveMeta.tabId || null, effectiveMeta);
    debugLog('Debug: pca runtime snapshot captured', {
      tabId: effectiveMeta.tabId || null,
      ownedRuntimeTabId: ownedRecord?.tabId || pca.__pcaOwnedRuntimeTabId || null,
      viewMode: pcaViewMode?.value || pcaViewModeInput?.value || null,
      notesOpen,
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
    applyPcaOwnedRuntimeSlicesFromSnapshot(snapshot, effectiveMeta.tab || effectiveMeta.tabId || null, {
      ...effectiveMeta,
      reason: effectiveMeta.reason || 'pca-runtime-apply-owned-slices'
    });
    if (snapshot.state && typeof snapshot.state === 'object') {
      const nextState = snapshot.state;
      pcaState.axisSelection = cloneSimple(nextState.axisSelection) || pcaState.axisSelection;
      pcaState.axisMeta = cloneSimple(nextState.axisMeta) || pcaState.axisMeta || [];
      pcaState.rotation = cloneSimple(nextState.rotation) || pcaState.rotation;
      pcaState.rotationPending = false;
      pcaState.rotationPendingLogged = false;
      pcaState.axesVarianceScaled = !!nextState.axesVarianceScaled;
      pcaState.equalScaleAxes = nextState.equalScaleAxes !== false;
      pcaState.equalAxes = !!nextState.equalAxes;
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
      if (nextState.colors && typeof nextState.colors === 'object') {
        const restoredColors = nextState.colors;
        if (Object.prototype.hasOwnProperty.call(restoredColors, 'labelColors')) {
          pcaState.labelColors = cloneSimple(restoredColors.labelColors) || {};
        }
        if (Object.prototype.hasOwnProperty.call(restoredColors, 'labelShapes')) {
          pcaState.labelShapes = cloneSimple(restoredColors.labelShapes) || {};
        }
        if (Object.prototype.hasOwnProperty.call(restoredColors, 'labelPointStyles')) {
          pcaState.labelPointStyles = cloneSimple(restoredColors.labelPointStyles) || {};
        }
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
      setPcaResultsState(snapshot.results, getPcaProjectionSession({
        reason: 'pca-projection-mutation'
      }), {
        mirrorActive: true
      });
    } else {
      if (Object.prototype.hasOwnProperty.call(snapshot, 'stats')) {
        setPcaStatsSnapshot(snapshot.stats, getPcaProjectionSession({
          reason: 'pca-projection-mutation'
        }), {
          mirrorActive: true
        });
      }
      if (Object.prototype.hasOwnProperty.call(snapshot, 'statsPanel')) {
        setPcaStatsPanelResultsState(snapshot.statsPanel, getPcaProjectionSession({
          reason: 'pca-projection-mutation'
        }), {
          mirrorActive: true
        });
      } else {
        const statsSnapshot = getPcaStatsSnapshot(getActivePcaSessionForState());
        if (statsSnapshot?.statsPanel) {
          setPcaStatsPanelResultsState(statsSnapshot.statsPanel, getPcaProjectionSession({
            reason: 'pca-projection-mutation'
          }), {
            mirrorActive: true
          });
        }
      }
    }
    const restoredStatsSnapshot = getPcaStatsSnapshot(getActivePcaSessionForState());
    const restoredPanelSnapshot = getPcaStatsPanelSnapshot(getActivePcaSessionForState());
    if (restoredStatsSnapshot && typeof restorePcaStatsFromPayload === 'function') {
      restorePcaStatsFromPayload(normalizePcaSavedStatsModels(restoredPanelSnapshot));
    } else if (pcaStatsPanelSnapshotHasContent(restoredPanelSnapshot)) {
      restorePcaStatsPanelState(restoredPanelSnapshot, {
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
        const passiveRebind = meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true;
        if (passiveRebind) {
          pca.__boundTabId = nextTabId || getPcaProjectionTabId() || null;
          bindPcaSessionForTab(nextTabId || getPcaProjectionTabId() || null, {
            ...(meta || {}),
            root: pcaRoot || null,
            reason: meta?.reason || 'pca-passive-dom-rebind'
          });
          pcaSvgBoxRef = pcaRoot?.querySelector?.('#pcaGraphPanel .svgbox') || pcaSvgBoxRef || null;
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

  pca.captureRenderCache = function captureRenderCache() {
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
    return {
      plot: plotCache,
      runtimeCache: cloneSimple(getPcaAnalysisCache(session)) || null
    };
  };

  pca.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}) {
    return Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'pca',
      graph: {
        selectors: ['#pcaSvg', 'svg', 'canvas'],
        markupPattern: /(<svg\b|id=["']pcaSvg["']|<canvas\b)/i
      },
      requireGraph: true
    }) ?? !!cache;
  };

  pca.isIdleForSnapshot = function isIdleForSnapshot() {
    const runtime = getPcaDrawRuntime(getActivePcaSessionForState(), {
      seedFromActive: true
    });
    return !runtime.rotationPending;
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
    restorePcaStatsFromPayload();
    const session = getActivePcaSessionForState();
    if (restoredRuntimeCache) {
      setPcaAnalysisCache(restoredRuntimeCache, session, {
        mirrorActive: true
      });
    }
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
    const rebound3dRotation = restoredPlot ? bindPca3dRotationControls(svg, 'pca-3d-restore') : false;
    if (typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()) {
      debugLog('Debug: pca render cache restored', {
        plot: restoredPlot,
        runtimeCache: !!restoredRuntimeCache,
        rebound3dRotation
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
    if (setupSession?.state?.hydrated) {
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
    if (pcaPlotDiv && !pcaPlotDiv.__pcaAxesLengthCloseHandler) {
      const onPlotPointerDown = () => {
        closePcaAxesLengthMenu('plot-pointer');
      };
      pcaPlotDiv.addEventListener('pointerdown', onPlotPointerDown);
      pcaPlotDiv.__pcaAxesLengthCloseHandler = onPlotPointerDown;
    }
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
        const selectedFormat = pcaState.tableFormat === 'grouped' ? 'grouped' : 'standard';
        const pcaExample = selectedFormat === 'grouped' ?
          [
            [PCA_POINT_LABEL_ROW_HEADER, true, false, false, true, false, false, false, false],
            [PCA_GROUP_ROW_HEADER, 'Control', '', 'Treatment', '', 'KO', '', 'Rescue', ''],
            [PCA_SAMPLE_ROW_HEADER, 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
            ['Var1', 1, 2, 3, 2, 10, 20, 30, 20],
            ['Var2', 2, 3, 2, 3, 20, 10, 20, 30],
            ['Var3', 3, 4, 1, 4, 30, 30, 10, 40],
            ['Var4', 4, 2, 4, 1, 40, 20, 40, 10]
          ] :
          [
            [PCA_POINT_LABEL_ROW_HEADER, true, false, false, true, false, false, false, false],
            ['Variable', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
            ['Var1', 1, 2, 3, 2, 10, 20, 30, 20],
            ['Var2', 2, 3, 2, 3, 20, 10, 20, 30],
            ['Var3', 3, 4, 1, 4, 30, 30, 10, 40],
            ['Var4', 4, 2, 4, 1, 40, 20, 40, 10]
          ];
        const hot = ensurePcaHotForActiveTab();
        markPcaOverlayPending('example-data');
        hot?.loadData?.(pcaExample, {
          source: 'example-load',
          recordUndo: true,
          undoLabel: 'table:pca:example-load'
        });
        pcaDebug('pca example loaded');
        debugLog('Debug: pca example dataset applied (transposed labels)', {
          rows: pcaExample.length,
          cols: pcaExample[0]?.length
        });
        pcaState.grouped = {
          replicatesPerGroup: 2,
          colors: DEFAULT_SCATTER_COLORS.slice(0, 4),
          shapes: GROUP_SHAPE_DEFAULTS.slice(0, 4)
        };
        ensurePcaGroupedDefaults();
        setPcaTableFormat(selectedFormat);
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
      pcaShowLegend.addEventListener('change', () => {
        debugLog('Debug: pca showLegend change', {
          checked: pcaShowLegend.checked
        });
        ensurePcaResizerControls();
        requestPcaViewRefresh('legend-toggle');
      });
    }
    pcaVarianceAxisScale = $('#pcaVarianceAxisScale');
    pcaVarianceAxisScaleInput = pcaVarianceAxisScale;
    pcaScale = $('#pcaScale');
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
      element.addEventListener('change', () => {
        const requested = Number(element.value);
        if (!Number.isFinite(requested)) {
          return;
        }
        const previous = {
          ...pcaState.axisSelection
        };
        pcaState.axisSelection[axis] = requested;
        sanitizeAxisSelection(pcaState.axisMeta.length);
        syncAxisSelectValues();
        const changed = previous[axis] !== pcaState.axisSelection[axis];
        debugLog('Debug: pca axis selection change', {
          axis,
          requested,
          final: pcaState.axisSelection[axis],
          changed
        });
        if (changed) {
          requestPcaDataRefresh('axis-selection-change');
        }
      });
    });
    applyAxisVisibility(pcaViewMode?.value || DEFAULT_VIEW_MODE);
    applyMethodUiState(pcaMethod?.value || 'pca');
    if (pcaVarianceAxisScale) {
      pcaVarianceAxisScale.checked = !!pcaState.axesVarianceScaled;
      pcaVarianceAxisScale.addEventListener('change', () => {
        const enabled = !!pcaVarianceAxisScale.checked;
        if (enabled && (pcaState.equalAxes || pcaState.equalScaleAxes)) {
          pcaState.equalAxes = false;
          pcaState.equalScaleAxes = false;
          if (pcaEqualAxesInput) {
            pcaEqualAxesInput.checked = false;
          }
          if (pcaEqualScaleAxesInput) {
            pcaEqualScaleAxesInput.checked = false;
          }
          debugLog('Debug: pca axes length exclusivity enforced', {
            disabled: 'equal-length/equal-scale',
            reason: 'variance-axis-toggle'
          });
        }
        const previous = !!pcaState.axesVarianceScaled;
        pcaState.axesVarianceScaled = enabled;
        debugLog('Debug: pca variance axis scaling toggled', {
          enabled,
          previous
        });
        syncPcaAspectControls('variance-axis-scale');
        requestPcaViewRefresh('variance-axis-scale');
      });
      debugLog('Debug: pca variance axis toggle ready', {
        initial: pcaVarianceAxisScale.checked
      });
    } else {
      debugLog('Debug: pca variance axis toggle missing');
    }
    pcaAlphaVal.textContent = pcaAlpha.value;
    if (pcaViewMode) {
      bindPcaControlHandler(pcaViewMode, 'change', 'view-mode', event => {
        const mode = (pcaViewMode.value || DEFAULT_VIEW_MODE);
        if (event?.isTrusted && mode === '3d' && lastPcaViewMode !== '3d') {
          resetPcaRotation('view-mode-change');
        }
        lastPcaViewMode = mode;
        debugLog('Debug: pca viewMode change', {
          mode
        }); // Debug: view mode toggle listener
        applyAxisVisibility(mode);
        syncPcaAspectControls('view-mode-change');
        requestPcaViewRefresh('view-mode-change');
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
      requestPcaViewRefresh('fill-change');
    });
    bindPcaControlHandler(pcaBorder, 'input', 'border', () => {
      debugLog('Debug: pcaBorder changed', {
        value: pcaBorder.value
      });
      requestPcaViewRefresh('border-color-change');
    });
    bindPcaControlHandler(pcaBorderWidth, 'input', 'border-width', () => {
      debugLog('Debug: pcaBorderWidth changed', {
        value: pcaBorderWidth.value
      });
      requestPcaViewRefresh('border-width-change');
    });
    bindPcaControlHandler(pcaDotSize, 'input', 'dot-size', () => {
      debugLog('Debug: pcaDotSize changed', {
        value: pcaDotSize.value
      });
      requestPcaViewRefresh('dot-size-change');
    });
    bindPcaControlHandler(pcaAlpha, 'input', 'alpha', () => {
      const alphaValue = readPcaInputValue(pcaAlpha, pcaState.controls?.alpha ?? createDefaultPcaRuntimeControls().alpha);
      setPcaTextContent(pcaAlphaVal, alphaValue);
      debugLog('Debug: pcaAlpha changed', {
        value: alphaValue
      });
      requestPcaViewRefresh('alpha-change');
    });
    bindPcaControlHandler(pcaFontSize, 'input', 'font-size', () => {
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
    if (pcaScale) {
      bindPcaControlHandler(pcaScale, 'change', 'scale', () => {
        debugLog('Debug: pca scale toggle', {
          checked: pcaScale.checked
        });
        requestPcaDataRefresh('scale-toggle');
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
        const operationSession = getActivePcaSessionForState();
        setPcaFileNameForSession(f.name, operationSession);
        setPcaFileHandleForSession(null, operationSession);
        loadPcaGraphFile(f);
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
    resolvePcaOverlay(meta?.reason || 'cancelled');
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
