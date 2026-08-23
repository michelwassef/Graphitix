(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const statsTable = Shared.statsTable = Shared.statsTable || {};
  const doc = global.document;

  const DEFAULT_FONT_FAMILY = 'Arial, Helvetica, sans-serif';
  const STATS_ABBREVIATION_DEFINITIONS = Object.freeze([
    { key: 'AD', expansion: 'Anderson–Darling', aliases: ['AD'] },
    { key: 'A²', expansion: 'Anderson–Darling statistic', aliases: ['A²'], symbol: true },
    { key: 'ΔAICc', expansion: 'difference in corrected Akaike information criterion', aliases: ['ΔAICc'], symbol: true },
    { key: 'AICc', expansion: 'corrected Akaike information criterion', aliases: ['AICc'] },
    { key: 'AIC', expansion: 'Akaike information criterion', aliases: ['AIC'] },
    { key: 'ANOVA', expansion: 'analysis of variance', aliases: ['ANOVA'] },
    { key: 'AUC', expansion: 'area under the curve', aliases: ['AUC'] },
    { key: 'BH', expansion: 'Benjamini–Hochberg', aliases: ['BH'] },
    { key: 'BIC', expansion: 'Bayesian information criterion', aliases: ['BIC'] },
    { key: 'CI', expansion: 'confidence interval', aliases: ['CI'] },
    { key: 'CV', expansion: 'coefficient of variation', aliases: ['CV'] },
    { key: 'df', expansion: 'degrees of freedom', aliases: ['df'] },
    { key: 'DFFITS', expansion: 'difference in fits', aliases: ['DFFITS'] },
    { key: 'FDR', expansion: 'false discovery rate', aliases: ['FDR'] },
    { key: 'GLS', expansion: 'generalized least squares', aliases: ['GLS'] },
    { key: 'HR', expansion: 'hazard ratio', aliases: ['HR'] },
    { key: 'IC50', expansion: 'half-maximal inhibitory concentration', aliases: ['IC50'] },
    { key: 'IQR', expansion: 'interquartile range', aliases: ['IQR'] },
    { key: 'JB', expansion: 'Jarque–Bera', aliases: ['JB'] },
    { key: 'KL', expansion: 'Kullback–Leibler', aliases: ['KL'] },
    { key: 'KS', expansion: 'Kolmogorov–Smirnov', aliases: ['KS'] },
    { key: 'LOWESS', expansion: 'locally weighted scatterplot smoothing', aliases: ['LOWESS'] },
    { key: 'log₂FC', expansion: 'log2 fold change', aliases: ['log₂FC', 'log2FC'], symbol: true },
    { key: 'LR+', expansion: 'positive likelihood ratio', aliases: ['LR+'] },
    { key: 'LR−', expansion: 'negative likelihood ratio', aliases: ['LR−', 'LR-'] },
    { key: 'MAE', expansion: 'mean absolute error', aliases: ['MAE'] },
    { key: 'MAD', expansion: 'median absolute deviation', aliases: ['MAD'] },
    { key: 'MAPE', expansion: 'mean absolute percentage error', aliases: ['MAPE'] },
    { key: 'MDS', expansion: 'multidimensional scaling', aliases: ['MDS'] },
    { key: 'MS', expansion: 'mean square', aliases: ['MS'] },
    { key: 'NPV', expansion: 'negative predictive value', aliases: ['NPV'] },
    { key: 'OLS', expansion: 'ordinary least squares', aliases: ['OLS'] },
    { key: 'OR', expansion: 'odds ratio', aliases: ['OR'] },
    { key: 'PC', expansion: 'principal component', aliases: ['PC'], allowNumericSuffix: true },
    { key: 'PCA', expansion: 'principal component analysis', aliases: ['PCA'] },
    { key: 'PI', expansion: 'prediction interval', aliases: ['PI'] },
    { key: 'PPV', expansion: 'positive predictive value', aliases: ['PPV'] },
    { key: 'PR', expansion: 'precision–recall', aliases: ['PR'] },
    { key: 'Q1', expansion: 'first quartile', aliases: ['Q1'], symbol: true },
    { key: 'Q3', expansion: 'third quartile', aliases: ['Q3'], symbol: true },
    { key: 'QQ', expansion: 'quantile–quantile', aliases: ['QQ', 'Q-Q'] },
    { key: 'RESET', expansion: 'Ramsey Regression Equation Specification Error Test', aliases: ['RESET'] },
    { key: 'RMSE', expansion: 'root mean square error', aliases: ['RMSE'] },
    { key: 'ROC', expansion: 'receiver operating characteristic', aliases: ['ROC'] },
    { key: 'SD', expansion: 'standard deviation', aliases: ['SD'] },
    { key: 'SE', expansion: 'standard error', aliases: ['SE'] },
    { key: 'SEM', expansion: 'standard error of the mean', aliases: ['SEM'] },
    { key: 'sMAPE', expansion: 'symmetric mean absolute percentage error', aliases: ['sMAPE'] },
    { key: 'SS', expansion: 'sum of squares', aliases: ['SS'] },
    { key: 'SSE', expansion: 'sum of squared errors', aliases: ['SSE'] },
    { key: 't-SNE', expansion: 't-distributed stochastic neighbor embedding', aliases: ['t-SNE'] },
    { key: 'UMAP', expansion: 'uniform manifold approximation and projection', aliases: ['UMAP'] },
    { key: 'VIF', expansion: 'variance inflation factor', aliases: ['VIF'] },
    { key: 'WLS', expansion: 'weighted least squares', aliases: ['WLS'] },
    { key: '3PL', expansion: 'three-parameter logistic', aliases: ['3PL'] },
    { key: '4PL', expansion: 'four-parameter logistic', aliases: ['4PL'] },
    { key: '5PL', expansion: 'five-parameter logistic', aliases: ['5PL'] },
    { key: 'F1', expansion: 'harmonic mean of precision and recall', aliases: ['F1'] },
    { key: 'R²', expansion: 'coefficient of determination', aliases: ['R²'], symbol: true },
    { key: 'ηp²', expansion: 'partial eta-squared', aliases: ['ηp²'], symbol: true },
    { key: 'χ²', expansion: 'chi-square statistic', aliases: ['χ²', 'Chi²', 'X²'], symbol: true }
  ]);

  const isAsciiWordChar = value => /^[A-Za-z0-9]$/.test(String(value || ''));

  const findAliasOccurrences = (text, alias, definition) => {
    const matches = [];
    if(!text || !alias){
      return matches;
    }
    let cursor = 0;
    while(cursor <= text.length - alias.length){
      const index = text.indexOf(alias, cursor);
      if(index < 0){
        break;
      }
      const before = index > 0 ? text[index - 1] : '';
      const afterIndex = index + alias.length;
      const after = afterIndex < text.length ? text[afterIndex] : '';
      const startsWord = isAsciiWordChar(alias[0]);
      const endsWord = isAsciiWordChar(alias[alias.length - 1]);
      const leftBoundary = !startsWord || !before || !isAsciiWordChar(before);
      const allowsNumericSuffix = definition?.allowNumericSuffix === true && /^[0-9]$/.test(after);
      const rightBoundary = !endsWord || !after || !isAsciiWordChar(after) || allowsNumericSuffix;
      if(leftBoundary && rightBoundary){
        matches.push({ start: index, end: afterIndex, token: text.slice(index, afterIndex) });
      }
      cursor = index + Math.max(alias.length, 1);
    }
    return matches;
  };

  const findAbbreviationMatches = rawText => {
    const text = String(rawText ?? '');
    if(!text){
      return [];
    }
    const matches = [];
    STATS_ABBREVIATION_DEFINITIONS.forEach(definition => {
      (definition.aliases || [definition.key]).forEach(alias => {
        findAliasOccurrences(text, alias, definition).forEach(match => {
          matches.push({ ...match, definition });
        });
      });
    });
    matches.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));
    const accepted = [];
    let lastEnd = -1;
    matches.forEach(match => {
      if(match.start < lastEnd){
        return;
      }
      accepted.push(match);
      lastEnd = match.end;
    });
    return accepted;
  };

  const collectAbbreviationDefinitions = values => {
    const definitions = [];
    const seen = new Set();
    (Array.isArray(values) ? values : [values]).forEach(value => {
      findAbbreviationMatches(value).forEach(match => {
        const key = match.definition.key;
        if(seen.has(key)){
          return;
        }
        seen.add(key);
        definitions.push(match.definition);
      });
    });
    return definitions;
  };

  const formatAbbreviationGlossary = definitions => {
    const source = Array.isArray(definitions) ? definitions : [];
    if(!source.length){
      return '';
    }
    const hasSymbols = source.some(definition => definition.symbol === true);
    const prefix = hasSymbols ? 'Abbreviations and symbols' : 'Abbreviations';
    return `${prefix}: ${source.map(definition => `${definition.key}, ${definition.expansion}`).join('; ')}.`;
  };

  const STATS_SEMANTIC_LABEL_HEADERS = new Set([
    'metric',
    'method',
    'parameter',
    'statistic',
    'term',
    'test'
  ]);

  const isSemanticLabelHeader = value => STATS_SEMANTIC_LABEL_HEADERS.has(String(value || '').trim().toLowerCase());

  const collectModelAbbreviations = model => {
    if(!model || typeof model !== 'object'){
      return [];
    }
    const columns = Array.isArray(model.columns) ? model.columns : [];
    const values = [];
    if(model.caption){
      values.push(model.caption);
    }
    columns.forEach(column => values.push(column?.label || ''));
    (Array.isArray(model.footnotes) ? model.footnotes : []).forEach(note => values.push(note));
    const semanticColumnIndexes = columns
      .map((column, index) => isSemanticLabelHeader(column?.label) ? index : -1)
      .filter(index => index >= 0);
    if(semanticColumnIndexes.length){
      (Array.isArray(model.rows) ? model.rows : []).forEach(row => {
        if(!Array.isArray(row)){
          return;
        }
        semanticColumnIndexes.forEach(index => values.push(row[index]));
      });
    }
    return collectAbbreviationDefinitions(values);
  };

  const getExportFootnotes = model => {
    const footnotes = Array.isArray(model?.footnotes) ? model.footnotes.slice() : [];
    if(footnotes.some(note => /^\s*Abbreviations(?: and symbols)?\s*:/i.test(String(note || '')))){
      return footnotes;
    }
    const glossary = formatAbbreviationGlossary(collectModelAbbreviations(model));
    if(glossary){
      footnotes.push(glossary);
    }
    return footnotes;
  };

  const DEFAULT_OPTIONS = {
    fileName: 'statistics-table',
    contextLabel: 'statistics-table',
    headerFontSize: 14,
    bodyFontSize: 13,
    captionFontSize: 15,
    footnoteFontSize: 12,
    headerHeight: 36,
    rowHeight: 32,
    captionGap: 10,
    footnoteGap: 12,
    outerPadding: 20,
    cellPaddingX: 14,
    // Extra horizontal margin (px) to add on top of `cellPaddingX` for exported SVG tables
    cellExtraMargin: 6,
    zebraFill: '#f8fbff',
    headerFill: '#e7eef7',
    borderColor: '#c5d1e0',
    backgroundFill: '#ffffff',
    textColor: '#1d2735',
    minColumnWidth: 96
  };

  const logDebug = (label, payload) => {
    try {
      console.debug(`Debug: statsTable ${label}`, payload || {}); // Debug: stats table trace
    } catch (err) {
      // Avoid crashing if console is unavailable.
    }
  };

  const resolveFontFamily = () => {
    const sharedFont = Shared?.chartStyle?.FONT_FAMILY;
    const chosen = typeof sharedFont === 'string' && sharedFont.trim() ? sharedFont.trim() : DEFAULT_FONT_FAMILY;
    logDebug('resolveFontFamily', { chosen, sharedFont });
    return chosen;
  };

  const escapeXml = value => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const escapeDelimited = (value, delimiter) => {
    const text = String(value ?? '');
    if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const buildDelimitedText = (model, delimiter) => {
    const header = model.columns.map(col => escapeDelimited(col.label, delimiter)).join(delimiter);
    const body = model.rows.map(row => row.map(cell => escapeDelimited(cell, delimiter)).join(delimiter)).join('\r\n');
    if (body) {
      return `${header}\r\n${body}`;
    }
    return header;
  };

  const buildSheetData = model => {
    const header = model.columns.map(col => col.label);
    const rows = model.rows.map(row => row.map(cell => cell ?? ''));
    return [header, ...rows];
  };

  const ensureXlsx = async () => {
    if (global.XLSX) {
      return global.XLSX;
    }
    if (Shared && typeof Shared.lazyXlsx === 'function') {
      return Shared.lazyXlsx();
    }
    throw new Error('XLSX loader unavailable');
  };

  const buildXlsxBlob = async (model, sheetName) => {
    const XLSX = await ensureXlsx();
    const data = buildSheetData(model);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Statistics');
    const array = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  const downloadBlob = (blob, fileName, contextLabel) => {
    if (Shared.exporter && typeof Shared.exporter.downloadBlob === 'function') {
      Shared.exporter.downloadBlob(blob, fileName, contextLabel);
      return;
    }
    if (!doc || !doc.createElement) {
      return;
    }
    const link = doc.createElement('a');
    const url = global.URL && typeof global.URL.createObjectURL === 'function' ? global.URL.createObjectURL(blob) : '';
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    doc.body.appendChild(link);
    link.click();
    doc.body.removeChild(link);
    if (url && global.URL && typeof global.URL.revokeObjectURL === 'function') {
      global.URL.revokeObjectURL(url);
    }
  };

  const copyTextToClipboard = async text => {
    if (global.navigator?.clipboard?.writeText) {
      await global.navigator.clipboard.writeText(text);
      return true;
    }
    if (!doc || !doc.createElement) {
      return false;
    }
    const textarea = doc.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    doc.body.appendChild(textarea);
    textarea.select();
    const ok = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
    doc.body.removeChild(textarea);
    return ok;
  };

  const copyBlobMap = async (blobMap, contextLabel) => {
    if (Shared.exporter && typeof Shared.exporter.copyBlobMap === 'function') {
      return Shared.exporter.copyBlobMap(blobMap, contextLabel);
    }
    return false;
  };

  const createDataActions = (model, config) => {
    const fileName = model.options.fileName || 'statistics-table';
    const contextLabel = config?.contextLabel || model.options.contextLabel || fileName;
    const debugEnabled = typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const log = (label, payload) => {
      if (!debugEnabled) return;
      try {
        console.debug(`Debug: statsTable ${label}`, payload || {});
      } catch (err) {}
    };
    const csvText = () => buildDelimitedText(model, ',');
    const tsvText = () => buildDelimitedText(model, '\t');
    async function handle(mode, format) {
      try {
        if (format === 'csv') {
          const text = csvText();
          if (mode === 'download') {
            const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
            downloadBlob(blob, `${fileName}.csv`, `${contextLabel}-csv`);
          } else {
            const ok = await copyTextToClipboard(text);
            if (!ok && typeof global.alert === 'function') {
              global.alert('Copying CSV to the clipboard is not supported in this browser.');
            }
          }
          log('data csv handled', { mode, length: text.length });
          return;
        }
        if (format === 'excel') {
          if (mode === 'download') {
            const blob = await buildXlsxBlob(model, 'Statistics');
            downloadBlob(blob, `${fileName}.xlsx`, `${contextLabel}-xlsx`);
            log('data excel downloaded', { mode });
            return;
          }
          const blob = await buildXlsxBlob(model, 'Statistics');
          const copied = await copyBlobMap({
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': blob
          }, `${contextLabel}-xlsx`);
          if (copied) {
            log('data excel copied', { mode });
            return;
          }
          const fallback = tsvText();
          const ok = await copyTextToClipboard(fallback);
          if (!ok && typeof global.alert === 'function') {
            global.alert('Copying Excel data is not supported in this browser.');
          } else if (typeof global.alert === 'function') {
            global.alert('Excel copy is not supported here. TSV data was copied instead.');
          }
          log('data excel fallback copy', { mode, copied: ok });
        }
      } catch (err) {
        log('data export error', { mode, format, message: err?.message });
        if (typeof global.alert === 'function') {
          global.alert('Unable to export the statistics table. Please try again.');
        }
      }
    }
    return [
      {
        key: 'download',
        label: 'Download',
        formats: [
          { key: 'csv', label: 'CSV', handler: () => handle('download', 'csv') },
          { key: 'excel', label: 'Excel', handler: () => handle('download', 'excel') }
        ]
      },
      {
        key: 'copy',
        label: 'Copy',
        formats: [
          { key: 'csv', label: 'CSV', handler: () => handle('copy', 'csv') },
          { key: 'excel', label: 'Excel', handler: () => handle('copy', 'excel') }
        ]
      }
    ];
  };

  const normalizeColumns = columns => {
    return (Array.isArray(columns) ? columns : []).map((col, index) => {
      const key = col && col.key != null ? col.key : index;
      // Always default to left alignment unless explicitly specified.
      const align = (col && col.align) ? String(col.align) : 'left';
      const tooltip = col && col.tooltip != null ? String(col.tooltip) : '';
      const normalized = {
        key,
        label: col && col.label != null ? String(col.label) : '',
        align: align === 'center' ? 'center' : (align === 'right' ? 'right' : 'left'),
        formatter: typeof col?.formatter === 'function' ? col.formatter : null,
        tooltip
      };
      if(tooltip){
        logDebug('normalizeColumns tooltip',{ key, tooltip });
      }
      return normalized;
    });
  };

  const getCellValue = (row, column, index) => {
    if (Array.isArray(row)) {
      return row[index];
    }
    if (row && Object.prototype.hasOwnProperty.call(row, column.key)) {
      return row[column.key];
    }
    return row ? row[column.key] : undefined;
  };

  const isPValueLabel = value => {
    const text = String(value ?? '').trim().toLowerCase();
    return /^(?:p|p[-\s]?value|p[-\s]?val|adjusted p|adj\.? p|padj|fdr|q[-\s]?value)(?:\s*\([^)]*\))?$/.test(text)
      || /(?:^|\b)(?:p[-\s]?value|adjusted p|padj|fdr|q[-\s]?value)(?:\b|$)/.test(text);
  };

  const extractNumericValue = value => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (value instanceof Number && Number.isFinite(Number(value))) {
      return Number(value);
    }
    const text = String(value ?? '').replace(/,/g, '').trim();
    if (!text) {
      return NaN;
    }
    const match = text.match(/^[<>=\s]*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i);
    if (!match) {
      return NaN;
    }
    const numeric = Number(match[1]);
    return Number.isFinite(numeric) ? numeric : NaN;
  };

  const isStructuredPValueObject = value => {
    if (!value || typeof value !== 'object') {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(value, '__statsPValueRaw')) {
      return true;
    }
    const type = typeof value.type === 'string' ? value.type.toLowerCase() : '';
    return type === 'pvalue' || type === 'p-value' || type === 'p_value';
  };

  const extractPValueMetadata = value => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const raw = value.__statsPValueRaw
      ?? value.statsPValueRaw
      ?? value.rawPValue
      ?? value.pValueRaw
      ?? value.pValue
      ?? (isStructuredPValueObject(value) ? value.value : undefined);
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    const operator = typeof value.__statsPValueOperator === 'string' && value.__statsPValueOperator
      ? value.__statsPValueOperator
      : (typeof value.pValueOperator === 'string' && value.pValueOperator
        ? value.pValueOperator
        : (typeof value.operator === 'string' && value.operator ? value.operator : '='));
    return { pValueRaw: numeric, pValueOperator: operator };
  };

  const getPValueScientificForTarget = target => {
    if (Shared.statsReporting && typeof Shared.statsReporting.getPValueFormatScientific === 'function') {
      return Shared.statsReporting.getPValueFormatScientific({ target }) === true;
    }
    return false;
  };

  const resolvePValueScientific = config => {
    if (typeof config?.pValueScientific === 'boolean') {
      return config.pValueScientific;
    }
    if (config?.options && typeof config.options.pValueScientific === 'boolean') {
      return config.options.pValueScientific;
    }
    return getPValueScientificForTarget(config?.target || null);
  };

  const formatPValueMetadata = (metadata, scientific) => {
    if (!metadata || !Number.isFinite(Number(metadata.pValueRaw))) {
      return '';
    }
    const token = {
      type: 'pValue',
      value: Number(metadata.pValueRaw),
      operator: typeof metadata.pValueOperator === 'string' && metadata.pValueOperator ? metadata.pValueOperator : '='
    };
    if (Shared.statsReporting && typeof Shared.statsReporting.renderTextParts === 'function') {
      return Shared.statsReporting.renderTextParts([token], { scientific: scientific === true });
    }
    const formatter = Shared.formatters?.formatPValue || Shared.formatPValue;
    if (typeof formatter === 'function') {
      const formatted = String(formatter(token.value, { scientific: scientific === true, forceScientific: scientific === true }));
      if (scientific === true || token.operator === '=') {
        return formatted;
      }
      return `${token.operator}${formatted.replace(/^[<>=\s]+/, '')}`;
    }
    return String(token.value);
  };

  const resolveTextParts = value => {
    if (Array.isArray(value)) {
      return value;
    }
    if (isStructuredPValueObject(value)) {
      return [value];
    }
    if (value && typeof value === 'object') {
      if (Array.isArray(value.parts)) return value.parts;
      if (Array.isArray(value.textParts)) return value.textParts;
      if (Array.isArray(value.fragments)) return value.fragments;
    }
    return null;
  };

  const renderTextParts = (parts, scientific) => {
    if (Shared.statsReporting && typeof Shared.statsReporting.renderTextParts === 'function') {
      return Shared.statsReporting.renderTextParts(parts, { scientific: scientific === true });
    }
    return (Array.isArray(parts) ? parts : [parts]).map(part => {
      const metadata = extractPValueMetadata(part);
      if (metadata) {
        return formatPValueMetadata(metadata, scientific);
      }
      if (part && typeof part === 'object' && typeof part.text === 'string') {
        return part.text;
      }
      return String(part ?? '');
    }).join('');
  };

  const normalizeFootnotes = (items, scientific) => {
    const source = Array.isArray(items) ? items : [];
    const footnotes = [];
    const footnoteParts = [];
    source.forEach((item, index) => {
      const parts = resolveTextParts(item);
      if (parts) {
        footnotes[index] = renderTextParts(parts, scientific);
        footnoteParts[index] = parts;
        return;
      }
      const text = item && typeof item === 'object' && typeof item.text === 'string'
        ? item.text
        : String(item);
      footnotes[index] = text;
    });
    return { footnotes, footnoteParts };
  };

  const measureText = (text, fontSize, fontFamily) => {
    const value = String(text ?? '');
    const font = `${fontSize}px ${fontFamily}`;
    if (Shared.chartStyle && typeof Shared.chartStyle.measureText === 'function') {
      try {
        const width = Shared.chartStyle.measureText(value, font);
        logDebug('measureTextShared', { value, font, width });
        return width;
      } catch (err) {
        console.warn('statsTable measureText shared error', err);
      }
    }
    const approx = value.length * fontSize * 0.6;
    logDebug('measureTextFallback', { value, font, approx });
    return approx;
  };

  const wrapTextToWidth = (text, maxWidth, fontSize, fontFamily) => {
    const source = String(text ?? '').trim();
    if(!source){
      return [''];
    }
    const widthLimit = Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : Infinity;
    const words = source.split(/\s+/);
    const lines = [];
    let current = '';
    words.forEach(word => {
      const candidate = current ? `${current} ${word}` : word;
      if(current && measureText(candidate, fontSize, fontFamily) > widthLimit){
        lines.push(current);
        current = word;
        return;
      }
      current = candidate;
    });
    if(current){
      lines.push(current);
    }
    return lines.length ? lines : [source];
  };

  const normalizeRows = (rows, columns, options = {}) => {
    const normalizedRows = [];
    const cellMetaRows = [];
    const scientific = options.pValueScientific === true;
    (Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
      const rowMeta = [];
      const firstRawCell = columns.length ? getCellValue(row, columns[0], 0) : '';
      const metricLikePRow = isPValueLabel(firstRawCell);
      const normalized = columns.map((col, colIndex) => {
        const raw = getCellValue(row, col, colIndex);
        const formatted = col.formatter ? col.formatter(raw, row, rowIndex) : raw;
        let pValueMetadata = extractPValueMetadata(formatted) || extractPValueMetadata(raw);
        const pValueContext = isStructuredPValueObject(formatted)
          || isStructuredPValueObject(raw)
          || isPValueLabel(col.label)
          || (colIndex > 0 && metricLikePRow);
        if(!pValueMetadata && pValueContext){
          const numeric = extractNumericValue(raw);
          if(Number.isFinite(numeric)){
            pValueMetadata = { pValueRaw: numeric, pValueOperator: '=' };
          }
        }
        if(pValueMetadata){
          rowMeta[colIndex] = pValueMetadata;
          if(pValueContext){
            return formatPValueMetadata(pValueMetadata, scientific);
          }
        }
        return formatted == null ? '' : String(formatted);
      });
      normalizedRows.push(normalized);
      cellMetaRows.push(rowMeta);
    });
    return { rows: normalizedRows, cellMetaRows };
  };

  const mergeOptions = options => {
    const merged = { ...DEFAULT_OPTIONS, ...(options || {}) };
    if (!merged.fileName) merged.fileName = DEFAULT_OPTIONS.fileName;
    if (!merged.contextLabel) merged.contextLabel = merged.fileName;
    merged.fontFamily = merged.fontFamily || resolveFontFamily();
    logDebug('mergeOptions', merged);
    return merged;
  };

  const buildModel = config => {
    const pValueScientific = resolvePValueScientific(config || {});
    const columns = normalizeColumns(config.columns);
    const normalized = normalizeRows(config.rows, columns, { pValueScientific });
    const rows = normalized.rows;
    const options = mergeOptions(config.options);
    const normalizedFootnotes = normalizeFootnotes(config.footnotes, pValueScientific);
    const footnotes = normalizedFootnotes.footnotes;
    const caption = config.caption != null ? String(config.caption) : '';
    const model = { columns, rows, caption, footnotes, options, pValueScientific };
    if(normalized.cellMetaRows.some(row => Array.isArray(row) && row.some(Boolean))){
      model.cellMetaRows = normalized.cellMetaRows;
    }
    if(normalizedFootnotes.footnoteParts.some(Boolean)){
      model.footnoteParts = normalizedFootnotes.footnoteParts;
    }
    logDebug('buildModel', { columnCount: columns.length, rowCount: rows.length, caption: caption || null });
    return model;
  };

  const computeLayout = model => {
    const { columns, rows, options, caption } = model;
    const footnotes = getExportFootnotes(model);
    const {
      headerFontSize,
      bodyFontSize,
      captionFontSize,
      footnoteFontSize,
      headerHeight,
      rowHeight,
      captionGap,
      footnoteGap,
      outerPadding,
      cellPaddingX,
      fontFamily
    } = options;

    const extraMargin = Number.isFinite(options.cellExtraMargin) ? Math.max(0, options.cellExtraMargin) : 6;
    const colWidths = columns.map((col, index) => {
      let maxWidth = measureText(col.label, headerFontSize, fontFamily);
      rows.forEach(row => {
        const candidate = row[index] ?? '';
        const width = measureText(candidate, bodyFontSize, fontFamily);
        if (width > maxWidth) maxWidth = width;
      });
      // Include horizontal padding on both sides plus a small extra margin for visual breathing room
      const padded = Math.ceil(maxWidth + cellPaddingX * 2 + extraMargin);
      // Allow columns to size exactly to the widest content (can shrink below minColumnWidth)
      return padded;
    });
    const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
    const tableHeight = headerHeight + rows.length * rowHeight;
    let captionOffset = 0;
    if (caption) {
      captionOffset = captionFontSize + captionGap;
    }
    const footnoteWrapWidth = Math.max(tableWidth, 420);
    const footnoteLines = footnotes.flatMap(note => wrapTextToWidth(note, footnoteWrapWidth, footnoteFontSize, fontFamily));
    let footnoteBlockHeight = 0;
    if (footnoteLines.length) {
      footnoteBlockHeight = footnoteGap + footnoteLines.length * (footnoteFontSize + 4);
    }
    const captionWidth = caption ? measureText(caption, captionFontSize, fontFamily) : 0;
    const footnoteTextWidth = footnoteLines.reduce((maxWidth, line) => Math.max(maxWidth, measureText(line, footnoteFontSize, fontFamily)), 0);
    const contentWidth = Math.max(tableWidth, captionWidth, footnoteTextWidth);
    const bodyTop = outerPadding + captionOffset + headerHeight;
    const tableBottom = outerPadding + captionOffset + tableHeight;
    const footnoteStart = footnoteLines.length ? tableBottom + footnoteGap : tableBottom;
    const height = tableBottom + footnoteBlockHeight + outerPadding;
    const layout = {
      colWidths,
      tableWidth,
      width: contentWidth + outerPadding * 2,
      height,
      captionOffset,
      footnoteBlockHeight,
      footnoteLines,
      captionFontSize,
      footnoteFontSize,
      tableTop: outerPadding + captionOffset,
      bodyTop,
      captionY: caption ? outerPadding + captionFontSize : null,
      footnoteStart,
      options
    };
    logDebug('computeLayout', {
      width: layout.width,
      height: layout.height,
      columns: columns.length,
      rows: rows.length,
      caption: caption || null
    });
    return layout;
  };

  statsTable.measureSvgDimensions = function measureSvgDimensions(model) {
    const layout = computeLayout(model);
    return { width: layout.width, height: layout.height };
  };

  statsTable.buildSvgString = function buildSvgString(model) {
    const { columns, rows, caption, options } = model;
    const exportDescription = [caption, ...getExportFootnotes(model)]
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .join('. ');
    const layout = computeLayout(model);
    const {
      colWidths,
      tableWidth,
      width,
      height,
      captionFontSize,
      footnoteFontSize,
      tableTop,
      bodyTop,
      captionY,
      footnoteStart,
      footnoteLines
    } = layout;
    const {
      fontFamily,
      headerHeight,
      rowHeight,
      cellPaddingX,
      outerPadding,
      zebraFill,
      headerFill,
      borderColor,
      backgroundFill,
      textColor,
      headerFontSize,
      bodyFontSize
    } = options;

    const rowAreaHeight = rows.length * rowHeight;
    const svg = [];
    svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    if(exportDescription){
      svg.push(`<desc>${escapeXml(exportDescription)}</desc>`);
    }
    svg.push(`<rect width="${width}" height="${height}" fill="${backgroundFill}" rx="0" ry="0"/>`);
    if (caption) {
      svg.push(`<text x="${outerPadding}" y="${captionY}" font-family="${escapeXml(fontFamily)}" font-size="${captionFontSize}" font-weight="600" fill="${textColor}">${escapeXml(caption)}</text>`);
    }
    svg.push(`<rect x="${outerPadding}" y="${tableTop}" width="${tableWidth}" height="${headerHeight + rowAreaHeight}" fill="none" rx="0" ry="0"/>`);
    svg.push(`<rect x="${outerPadding}" y="${tableTop}" width="${tableWidth}" height="${headerHeight}" fill="${headerFill}"/>`);

    const colPositions = [];
    let cursor = outerPadding;
    columns.forEach((col, index) => {
      colPositions[index] = cursor;
      cursor += colWidths[index];
    });

    // Always left-align header text in exported SVGs to match on-screen tables
    columns.forEach((col, index) => {
      const x = colPositions[index] + cellPaddingX;
      const y = tableTop + headerHeight / 2;
      svg.push(`<text x="${x}" y="${y}" font-family="${escapeXml(fontFamily)}" font-size="${headerFontSize}" font-weight="600" fill="${textColor}" text-anchor="start" dominant-baseline="middle">${escapeXml(col.label)}</text>`);
    });

    rows.forEach((row, rowIndex) => {
      const rowY = bodyTop + rowIndex * rowHeight;
      if (rowIndex % 2 === 1) {
        svg.push(`<rect x="${outerPadding}" y="${rowY}" width="${tableWidth}" height="${rowHeight}" fill="${zebraFill}"/>`);
      }
      columns.forEach((col, colIndex) => {
        // Force left alignment for cell text in exported SVGs
        const x = colPositions[colIndex] + cellPaddingX;
        const y = rowY + rowHeight / 2;
        svg.push(`<text x="${x}" y="${y}" font-family="${escapeXml(fontFamily)}" font-size="${bodyFontSize}" fill="${textColor}" text-anchor="start" dominant-baseline="middle">${escapeXml(row[colIndex])}</text>`);
      });
    });

    // Draw grid lines on the foreground so they are not masked by later elements
    const gridStroke = borderColor;
    const gridStrokeWidth = 1;
    // Horizontal separators: header bottom + each row boundary
    const totalRows = rows.length;
    for (let i = 0; i <= totalRows; i += 1) {
      const y = bodyTop + i * rowHeight;
      svg.push(`<line x1="${outerPadding}" y1="${y}" x2="${outerPadding + tableWidth}" y2="${y}" stroke="${gridStroke}" stroke-width="${gridStrokeWidth}"/>`);
    }
    // Vertical separators between columns (draw inside table bounds)
    for (let ci = 1; ci < colPositions.length; ci += 1) {
      const x = colPositions[ci];
      svg.push(`<line x1="${x}" y1="${tableTop}" x2="${x}" y2="${tableTop + headerHeight + rowAreaHeight}" stroke="${gridStroke}" stroke-width="${gridStrokeWidth}"/>`);
    }
    // Outer border drawn last so it appears on top of table content
    svg.push(`<rect x="${outerPadding}" y="${tableTop}" width="${tableWidth}" height="${headerHeight + rowAreaHeight}" fill="none" stroke="${gridStroke}" stroke-width="${gridStrokeWidth}"/>`);

    if (footnoteLines.length) {
      let y = footnoteStart + footnoteFontSize;
      footnoteLines.forEach(line => {
        svg.push(`<text x="${outerPadding}" y="${y}" font-family="${escapeXml(fontFamily)}" font-size="${footnoteFontSize}" fill="${textColor}" opacity="0.85">${escapeXml(line)}</text>`);
        y += footnoteFontSize + 4;
      });
    }

    svg.push('</svg>');
    const svgString = svg.join('');
    logDebug('buildSvgString complete', { length: svgString.length, rows: rows.length, columns: columns.length });
    return svgString;
  };

  const resolveTarget = target => {
    if (!target) return null;
    if (typeof target === 'string') {
      return doc ? doc.querySelector(target) : null;
    }
    return target;
  };

  const isRenderableStatsTableModel = model => !!(
    model
    && typeof model === 'object'
    && Array.isArray(model.columns)
    && Array.isArray(model.rows)
    && model.rows.every(row => Array.isArray(row))
  );

  const renderAbbreviationsInElement = element => {
    if(!element || element.nodeType !== 1 || !element.ownerDocument){
      return 0;
    }
    const text = String(element.textContent || '');
    const matches = findAbbreviationMatches(text);
    if(!matches.length){
      return 0;
    }
    const documentRef = element.ownerDocument;
    element.textContent = '';
    let cursor = 0;
    matches.forEach(match => {
      if(match.start > cursor){
        element.appendChild(documentRef.createTextNode(text.slice(cursor, match.start)));
      }
      const abbr = documentRef.createElement('abbr');
      abbr.className = 'stats-table-abbr';
      abbr.title = match.definition.expansion;
      abbr.textContent = text.slice(match.start, match.end);
      element.appendChild(abbr);
      cursor = match.end;
    });
    if(cursor < text.length){
      element.appendChild(documentRef.createTextNode(text.slice(cursor)));
    }
    return matches.length;
  };

  const getSemanticLabelCells = table => {
    if(!table || typeof table.querySelectorAll !== 'function'){
      return [];
    }
    const headerCells = Array.from(table.querySelectorAll('thead tr:first-child th'));
    if(!headerCells.length){
      return [];
    }
    const semanticColumnIndexes = headerCells
      .map((header, index) => isSemanticLabelHeader(header.textContent) ? index : -1)
      .filter(index => index >= 0);
    if(!semanticColumnIndexes.length){
      return [];
    }
    const cells = [];
    table.querySelectorAll('tbody tr').forEach(row => {
      const rowCells = Array.from(row.children || []).filter(cell => cell.tagName === 'TD' || cell.tagName === 'TH');
      semanticColumnIndexes.forEach(index => {
        if(rowCells[index]){
          cells.push(rowCells[index]);
        }
      });
    });
    return cells;
  };

  const collectTableAbbreviations = table => {
    if(!table || typeof table.querySelectorAll !== 'function'){
      return [];
    }
    const values = [];
    const caption = table.querySelector('caption');
    if(caption){
      values.push(caption.textContent || '');
    }
    table.querySelectorAll('th').forEach(cell => values.push(cell.textContent || ''));
    getSemanticLabelCells(table).forEach(cell => values.push(cell.textContent || ''));
    const card = table.closest?.('.stats-table-card') || null;
    if(card){
      const cardCaption = card.querySelector(':scope > .stats-table-caption');
      if(cardCaption){
        values.push(cardCaption.textContent || '');
      }
      card.querySelectorAll('.stats-table-footnote:not([data-stats-auto-abbreviations="1"])')
        .forEach(note => values.push(note.textContent || ''));
    }
    return collectAbbreviationDefinitions(values);
  };

  const findExistingAbbreviationFootnote = table => {
    const card = table?.closest?.('.stats-table-card') || null;
    if(card){
      return card.querySelector('.stats-table-abbreviations[data-stats-auto-abbreviations="1"]');
    }
    const sibling = table?.nextElementSibling;
    if(sibling?.classList?.contains('stats-table-footnotes')){
      return sibling.querySelector('.stats-table-abbreviations[data-stats-auto-abbreviations="1"]');
    }
    return sibling?.matches?.('.stats-table-abbreviations[data-stats-auto-abbreviations="1"]') ? sibling : null;
  };

  const removeAutoAbbreviationFootnote = existing => {
    if(!existing){
      return;
    }
    const parent = existing.parentElement;
    existing.remove();
    if(parent?.dataset?.statsAutoAbbreviationsContainer === '1' && !parent.children.length){
      parent.remove();
    }
  };

  const ensureTableAbbreviationFootnote = table => {
    if(!table || !table.ownerDocument){
      return null;
    }
    const definitions = collectTableAbbreviations(table);
    const existing = findExistingAbbreviationFootnote(table);
    if(!definitions.length){
      removeAutoAbbreviationFootnote(existing);
      return null;
    }
    const glossary = formatAbbreviationGlossary(definitions);
    const card = table.closest?.('.stats-table-card') || null;
    const glossaryScope = card || table.parentElement || null;
    const userGlossaryExists = glossaryScope
      ? Array.from(glossaryScope.querySelectorAll('.stats-table-footnote:not([data-stats-auto-abbreviations="1"])'))
        .some(node => /^\s*Abbreviations(?: and symbols)?\s*:/i.test(String(node.textContent || '')))
      : false;
    if(userGlossaryExists){
      removeAutoAbbreviationFootnote(existing);
      return null;
    }
    if(existing){
      existing.textContent = glossary;
      return existing;
    }
    const documentRef = table.ownerDocument;
    const item = documentRef.createElement('div');
    item.className = 'stats-table-footnote stats-table-abbreviations';
    item.dataset.statsAutoAbbreviations = '1';
    item.textContent = glossary;
    if(card){
      let footnoteList = card.querySelector(':scope > .stats-table-footnotes');
      if(!footnoteList){
        footnoteList = documentRef.createElement('div');
        footnoteList.className = 'stats-table-footnotes stats-table-footnotes--auto';
        footnoteList.dataset.statsAutoAbbreviationsContainer = '1';
        const actions = card.querySelector(':scope > .stats-table-actions');
        card.insertBefore(footnoteList, actions || null);
      }
      footnoteList.appendChild(item);
      return item;
    }
    const next = table.nextElementSibling;
    if(next?.classList?.contains('stats-table-footnotes')){
      next.appendChild(item);
      return item;
    }
    const footnoteList = documentRef.createElement('div');
    footnoteList.className = 'stats-table-footnotes stats-table-footnotes--auto';
    footnoteList.dataset.statsAutoAbbreviationsContainer = '1';
    footnoteList.appendChild(item);
    table.insertAdjacentElement('afterend', footnoteList);
    return item;
  };

  const decorateReportAbbreviations = root => {
    if(!root || typeof root.querySelectorAll !== 'function'){
      return 0;
    }
    const elements = root.classList?.contains('stats-report-panel')
      ? Array.from(root.querySelectorAll(':scope > pre'))
      : Array.from(root.querySelectorAll('.stats-report-panel > pre'));
    let count = 0;
    elements.forEach(element => {
      if(element.querySelector?.('.stats-table-abbr')){
        const text = element.textContent || '';
        element.textContent = text;
      }
      count += renderAbbreviationsInElement(element);
    });
    return count;
  };

  statsTable.collectAbbreviations = function collectAbbreviations(values) {
    return collectAbbreviationDefinitions(values).map(definition => ({
      key: definition.key,
      expansion: definition.expansion,
      symbol: definition.symbol === true
    }));
  };

  statsTable.formatAbbreviationGlossary = function formatGlossary(definitions) {
    return formatAbbreviationGlossary(definitions);
  };

  statsTable.enhanceAbbreviations = function enhanceAbbreviations(root) {
    if(!root || typeof root.querySelectorAll !== 'function'){
      return { tables: 0, terms: 0, reportTerms: 0 };
    }
    const tables = root.tagName === 'TABLE' ? [root] : Array.from(root.querySelectorAll('table'));
    let termCount = 0;
    tables.forEach(table => {
      const labelCells = [
        ...Array.from(table.querySelectorAll('th')),
        ...getSemanticLabelCells(table)
      ];
      Array.from(new Set(labelCells)).forEach(cell => {
        if(cell.querySelector?.('.stats-table-abbr')){
          const text = cell.textContent || '';
          cell.textContent = text;
        }
        termCount += renderAbbreviationsInElement(cell);
      });
      ensureTableAbbreviationFootnote(table);
    });
    const reportTerms = decorateReportAbbreviations(root);
    return { tables: tables.length, terms: termCount, reportTerms };
  };

  statsTable.render = function render(config) {
    const target = resolveTarget(config?.target);
    if (!target) {
      logDebug('render skipped', { reason: 'no target' });
      return null;
    }
    // Accept a pre-built model so a restored stats panel can re-render the card (and
    // re-mount live export controls) from the persisted data model instead of replaying
    // serialized DOM, which cannot carry the live Download/Copy export controls.
    const sourceModel = config && config.model && typeof config.model === 'object'
      ? config.model
      : null;
    const model = sourceModel
      ? (isRenderableStatsTableModel(sourceModel) ? sourceModel : buildModel(sourceModel))
      : buildModel(config);
    if (!config?.append) {
      target.innerHTML = '';
    }
    const wrapper = doc.createElement('div');
    wrapper.className = 'stats-table-card';
    // Stash the data model so capturePanelModel can persist it (and restore can re-render
    // this exact card with working export controls). The model is plain, JSON-serializable.
    wrapper.__statsTableModel = model;
    // Persist the export identity as attributes too, so components that restore via a
    // serialized-DOM render cache (where the JS model is lost) can still rebuild faithful
    // export controls from the markup — see rehydrateExportControls.
    wrapper.setAttribute('data-stats-export-filename', model.options.fileName);
    wrapper.setAttribute('data-stats-export-context', model.options.contextLabel || model.options.fileName);
    if (config?.className) {
      wrapper.classList.add(config.className);
    }
    if(model.caption){
      wrapper.setAttribute('data-stats-caption', model.caption);
    }
    if(config && typeof config.section === 'string' && config.section.trim()){
      wrapper.setAttribute('data-stats-section', config.section.trim());
    }
    if (model.caption) {
      const captionEl = doc.createElement('div');
      captionEl.className = 'stats-table-caption';
      captionEl.textContent = model.caption;
      wrapper.appendChild(captionEl);
    }
    const table = doc.createElement('table');
    table.className = 'stats-table';
    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    model.columns.forEach(col => {
      const th = doc.createElement('th');
      th.className = `stats-table__cell stats-table__header stats-table__cell--${col.align}`;
      th.textContent = col.label;
      if(col.tooltip){
        th.title = col.tooltip;
        th.dataset.tooltip = col.tooltip;
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = doc.createElement('tbody');
    model.rows.forEach((row, rowIndex) => {
      const tr = doc.createElement('tr');
      row.forEach((value, index) => {
        const col = model.columns[index];
        const td = doc.createElement('td');
        td.className = `stats-table__cell stats-table__cell--${col.align}`;
        td.textContent = value;
        const metadata = model.cellMetaRows?.[rowIndex]?.[index];
        if(metadata && Number.isFinite(Number(metadata.pValueRaw))){
          td.dataset.statsPvalueRaw = String(Number(metadata.pValueRaw));
          td.dataset.statsPvalueOperator = typeof metadata.pValueOperator === 'string' && metadata.pValueOperator
            ? metadata.pValueOperator
            : '=';
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);

    if (model.footnotes.length) {
      const footnoteList = doc.createElement('div');
      footnoteList.className = 'stats-table-footnotes';
      model.footnotes.forEach((note, index) => {
        const item = doc.createElement('div');
        item.className = 'stats-table-footnote';
        const parts = Array.isArray(model.footnoteParts?.[index]) ? model.footnoteParts[index] : null;
        if(parts){
          item.__statsTextParts = parts;
          item.dataset.statsReportStructured = '1';
        }
        item.textContent = note;
        footnoteList.appendChild(item);
      });
      wrapper.appendChild(footnoteList);
    }

    const actions = doc.createElement('div');
    actions.className = 'stats-table-actions';
    wrapper.appendChild(actions);

    if (Shared.exporter && typeof Shared.exporter.mountSvgStringControls === 'function') {
      Shared.exporter.mountSvgStringControls({
        container: actions,
        getSvgString: () => statsTable.buildSvgString(model),
        getDimensions: () => statsTable.measureSvgDimensions(model),
        fileName: model.options.fileName,
        contextLabel: config?.contextLabel || model.options.contextLabel,
        extraActions: createDataActions(model, config)
      });
      logDebug('render export controls attached', { fileName: model.options.fileName });
    } else {
      const note = doc.createElement('div');
      note.className = 'stats-table-actions__fallback';
      note.textContent = 'Export controls unavailable';
      actions.appendChild(note);
      logDebug('render export controls missing', { hasExporter: !!Shared.exporter });
    }

    target.appendChild(wrapper);
    statsTable.enhanceAbbreviations(wrapper);
    logDebug('render complete', { rowCount: model.rows.length, columnCount: model.columns.length });
    return { wrapper, table, model };
  };

  // Rebuild a table data model from an already-rendered card's DOM. Used when a card is
  // restored from a serialized render cache (which cannot carry the live JS model), so its
  // export controls can be re-mounted with a working data source.
  const reconstructModelFromCard = card => {
    if (!card || typeof card.querySelector !== 'function') {
      return null;
    }
    const table = card.querySelector('.stats-table');
    if (!table) {
      return null;
    }
    const headerCells = Array.from(table.querySelectorAll('thead th'));
    const rawColumns = headerCells.map(th => {
      const cls = th.getAttribute('class') || '';
      const align = cls.includes('stats-table__cell--center')
        ? 'center'
        : (cls.includes('stats-table__cell--right') ? 'right' : 'left');
      return { label: (th.textContent || '').trim(), align, tooltip: th.getAttribute('title') || '' };
    });
    if (!rawColumns.length) {
      return null;
    }
    const cellMetaRows = [];
    const rawRows = Array.from(table.querySelectorAll('tbody tr')).map((tr, rowIndex) => {
      const metaRow = [];
      const values = Array.from(tr.querySelectorAll('td')).map((td, colIndex) => {
        const raw = Number(td.dataset?.statsPvalueRaw);
        if(Number.isFinite(raw)){
          metaRow[colIndex] = {
            pValueRaw: raw,
            pValueOperator: td.dataset.statsPvalueOperator || '='
          };
        }
        return td.textContent != null ? td.textContent : '';
      });
      cellMetaRows[rowIndex] = metaRow;
      return values;
    });
    const caption = card.getAttribute('data-stats-caption')
      || (card.querySelector('.stats-table-caption')?.textContent || '').trim();
    const footnotes = Array.from(card.querySelectorAll('.stats-table-footnote:not([data-stats-auto-abbreviations="1"])'))
      .map(node => (node.textContent || '').trim())
      .filter(Boolean);
    const columns = normalizeColumns(rawColumns);
    const pValueScientific = getPValueScientificForTarget(card);
    const normalized = normalizeRows(rawRows, columns, { pValueScientific });
    const model = {
      columns,
      rows: normalized.rows,
      caption,
      footnotes,
      pValueScientific,
      options: mergeOptions({
        fileName: card.getAttribute('data-stats-export-filename') || undefined,
        contextLabel: card.getAttribute('data-stats-export-context') || undefined
      })
    };
    const mergedMetaRows = cellMetaRows.map((row, rowIndex) => {
      const fallback = normalized.cellMetaRows[rowIndex] || [];
      return row && row.some(Boolean) ? row : fallback;
    });
    if(mergedMetaRows.some(row => Array.isArray(row) && row.some(Boolean))){
      model.cellMetaRows = mergedMetaRows;
    }
    return model;
  };


  const refreshModelPValueFormatting = (model, scientific) => {
    if(!model || typeof model !== 'object'){
      return false;
    }
    let changed = false;
    const pColumnIndexes = [];
    (Array.isArray(model.columns) ? model.columns : []).forEach((column, index) => {
      if(isPValueLabel(column?.label)){
        pColumnIndexes.push(index);
      }
    });
    if(Array.isArray(model.rows) && Array.isArray(model.cellMetaRows)){
      model.rows.forEach((row, rowIndex) => {
        if(!Array.isArray(row)){
          return;
        }
        const metaRow = model.cellMetaRows[rowIndex] || [];
        const metricLikePRow = isPValueLabel(row[0]);
        row.forEach((value, colIndex) => {
          const metadata = metaRow[colIndex];
          if(!metadata || !Number.isFinite(Number(metadata.pValueRaw))){
            return;
          }
          const pValueContext = pColumnIndexes.includes(colIndex) || (colIndex > 0 && metricLikePRow);
          if(!pValueContext){
            return;
          }
          const next = formatPValueMetadata(metadata, scientific);
          if(row[colIndex] !== next){
            row[colIndex] = next;
            changed = true;
          }
        });
      });
    }
    if(Array.isArray(model.footnoteParts) && model.footnoteParts.length){
      model.footnoteParts.forEach((parts, index) => {
        if(!Array.isArray(parts)){
          return;
        }
        const next = renderTextParts(parts, scientific);
        if(!Array.isArray(model.footnotes)){
          model.footnotes = [];
        }
        if(model.footnotes[index] !== next){
          model.footnotes[index] = next;
          changed = true;
        }
      });
    }
    model.pValueScientific = scientific === true;
    return changed;
  };

  statsTable.refreshPValueFormatting = function refreshPValueFormatting(root) {
    if(!root || typeof root.querySelectorAll !== 'function'){
      return 0;
    }
    const cards = root.classList?.contains('stats-table-card')
      ? [root]
      : Array.from(root.querySelectorAll('.stats-table-card'));
    let refreshed = 0;
    cards.forEach(card => {
      const model = card.__statsTableModel && typeof card.__statsTableModel === 'object'
        ? card.__statsTableModel
        : null;
      if(!model){
        return;
      }
      const scientific = getPValueScientificForTarget(card.closest?.('[data-stats-pvalue-scientific]') || root);
      refreshModelPValueFormatting(model, scientific);
      const rows = Array.from(card.querySelectorAll('tbody tr'));
      rows.forEach((tr, rowIndex) => {
        const cells = Array.from(tr.cells || []);
        cells.forEach((td, colIndex) => {
          const metadata = model.cellMetaRows?.[rowIndex]?.[colIndex];
          if(metadata && Number.isFinite(Number(metadata.pValueRaw))){
            td.dataset.statsPvalueRaw = String(Number(metadata.pValueRaw));
            td.dataset.statsPvalueOperator = typeof metadata.pValueOperator === 'string' && metadata.pValueOperator
              ? metadata.pValueOperator
              : '=';
          }
          if(model.rows?.[rowIndex]?.[colIndex] != null){
            td.textContent = String(model.rows[rowIndex][colIndex]);
          }
        });
      });
      const footnotes = Array.from(card.querySelectorAll('.stats-table-footnote'));
      footnotes.forEach((node, index) => {
        const parts = Array.isArray(model.footnoteParts?.[index]) ? model.footnoteParts[index] : null;
        if(parts){
          node.__statsTextParts = parts;
          node.dataset.statsReportStructured = '1';
        }
        if(model.footnotes?.[index] != null){
          node.textContent = String(model.footnotes[index]);
        }
      });
      refreshed += 1;
    });
    logDebug('refresh p-value formatting', { cards: cards.length, refreshed });
    return refreshed;
  };

  // Re-mount the Download/Copy export controls for every stats-table card under `root`.
  // Interactive controls cannot survive DOM serialization, so any restore path that
  // replays a serialized stats panel (render-cache replay) leaves them dead/mangled; this
  // rebuilds them from the card's live model when available, otherwise from its DOM.
  statsTable.rehydrateExportControls = function rehydrateExportControls(root) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return 0;
    }
    if (!Shared.exporter || typeof Shared.exporter.mountSvgStringControls !== 'function') {
      return 0;
    }
    const cards = Array.from(root.querySelectorAll('.stats-table-card'));
    let remounted = 0;
    cards.forEach(card => {
      const actions = card.querySelector('.stats-table-actions');
      if (!actions) {
        return;
      }
      const model = (card.__statsTableModel && typeof card.__statsTableModel === 'object')
        ? card.__statsTableModel
        : reconstructModelFromCard(card);
      if (!model || !Array.isArray(model.columns) || !model.columns.length) {
        return;
      }
      card.__statsTableModel = model;
      actions.innerHTML = '';
      Shared.exporter.mountSvgStringControls({
        container: actions,
        getSvgString: () => statsTable.buildSvgString(model),
        getDimensions: () => statsTable.measureSvgDimensions(model),
        fileName: model.options.fileName,
        contextLabel: model.options.contextLabel,
        extraActions: createDataActions(model, {})
      });
      remounted += 1;
    });
    logDebug('rehydrate export controls', { cards: cards.length, remounted });
    return remounted;
  };

  logDebug('module ready', { hasExporter: !!Shared.exporter });
})(typeof window !== 'undefined' ? window : globalThis);
