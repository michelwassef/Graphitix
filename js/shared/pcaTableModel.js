(function initPcaTableModel(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.pcaTableModel = Shared.pcaTableModel || {};
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

  function isPcaGroupedModeActive(options = {}, fallbackTableFormat = null) {
    if (options.forceGrouped === true) {
      return true;
    }
    if (options.forceStandard === true) {
      return false;
    }
    const format = options.tableFormat ?? fallbackTableFormat;
    return format === 'grouped';
  }

  function getPcaHeaderRowIndexForMode(options = {}, fallbackTableFormat = null) {
    return isPcaGroupedModeActive(options, fallbackTableFormat) ? PCA_GROUPED_SAMPLE_ROW_INDEX : PCA_HEADER_ROW_INDEX;
  }

  function getPcaPinnedMetaRowCountForMode(options = {}, fallbackTableFormat = null) {
    return getPcaHeaderRowIndexForMode(options, fallbackTableFormat) + 1;
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

  function resolvePcaLabelRowIndex(data, options = {}, fallbackTableFormat = null) {
    if (!Array.isArray(data) || !data.length) {
      return null;
    }
    const maxMetaRow = getPcaHeaderRowIndexForMode(options, fallbackTableFormat);
    for (let rowIndex = 0; rowIndex <= maxMetaRow; rowIndex += 1) {
      const row = Array.isArray(data[rowIndex]) ? data[rowIndex] : null;
      if (row && isPcaLabelRowHeader(row[0])) {
        return rowIndex;
      }
    }
    return null;
  }

  function resolvePcaHeaderRowIndex(data, labelRowIndex, options = {}, fallbackTableFormat = null) {
    const preferredHeader = getPcaHeaderRowIndexForMode(options, fallbackTableFormat);
    if (!Array.isArray(data) || !data.length) {
      return preferredHeader;
    }
    if (labelRowIndex === preferredHeader) {
      return preferredHeader === PCA_GROUPED_SAMPLE_ROW_INDEX ? PCA_HEADER_ROW_INDEX : PCA_GROUPED_SAMPLE_ROW_INDEX;
    }
    return preferredHeader;
  }

  function resolvePcaDataStartRow(labelRowIndex, headerRowIndex, options = {}, fallbackTableFormat = null) {
    const headerIdx = Number.isInteger(headerRowIndex)
      ? headerRowIndex
      : getPcaHeaderRowIndexForMode(options, fallbackTableFormat);
    const groupedActive = isPcaGroupedModeActive(options, fallbackTableFormat);
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

  function isPcaCellEmpty(value) {
    if (value === null || value === undefined) {
      return true;
    }
    return String(value).trim() === '';
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

  Object.assign(namespace, {
    PCA_POINT_LABEL_ROW_HEADER,
    PCA_POINT_LABEL_MARK,
    PCA_LABEL_ROW_INDEX,
    PCA_GROUP_ROW_INDEX,
    PCA_HEADER_ROW_INDEX,
    PCA_GROUPED_SAMPLE_ROW_INDEX,
    PCA_GROUP_ROW_HEADER,
    PCA_SAMPLE_ROW_HEADER,
    resolvePcaMethodNameForUi,
    normalizePcaLabelHeader,
    normalizePcaMetaHeader,
    isPcaGroupRowHeader,
    isPcaSampleRowHeader,
    isPcaGroupedModeActive,
    getPcaHeaderRowIndexForMode,
    getPcaPinnedMetaRowCountForMode,
    isPcaLabelRowHeader,
    parsePcaPointLabelFlag,
    resolvePcaLabelRowIndex,
    resolvePcaHeaderRowIndex,
    resolvePcaDataStartRow,
    normalizePcaLabelRowValues,
    isPcaCellEmpty,
    pcaRowHasContent
  });

  if(typeof module !== 'undefined' && module.exports){
    module.exports = namespace;
  }
})(typeof window !== 'undefined' ? window : globalThis);
