(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const statsTable = Shared.statsTable = Shared.statsTable || {};
  const doc = global.document;

  const DEFAULT_FONT_FAMILY = 'Arial, Helvetica, sans-serif';
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

  const normalizeRows = (rows, columns) => {
    const normalizedRows = [];
    (Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
      const normalized = columns.map((col, colIndex) => {
        const raw = getCellValue(row, col, colIndex);
        const formatted = col.formatter ? col.formatter(raw, row, rowIndex) : raw;
        return formatted == null ? '' : String(formatted);
      });
      normalizedRows.push(normalized);
    });
    return normalizedRows;
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
    const columns = normalizeColumns(config.columns);
    const rows = normalizeRows(config.rows, columns);
    const options = mergeOptions(config.options);
    const footnotes = Array.isArray(config.footnotes) ? config.footnotes.map(item => String(item)) : [];
    const caption = config.caption != null ? String(config.caption) : '';
    const model = { columns, rows, caption, footnotes, options };
    logDebug('buildModel', { columnCount: columns.length, rowCount: rows.length, caption: caption || null });
    return model;
  };

  const computeLayout = model => {
    const { columns, rows, options, caption, footnotes } = model;
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
      minColumnWidth,
      fontFamily
    } = options;

    const colWidths = columns.map((col, index) => {
      let maxWidth = measureText(col.label, headerFontSize, fontFamily);
      rows.forEach(row => {
        const candidate = row[index] ?? '';
        const width = measureText(candidate, bodyFontSize, fontFamily);
        if (width > maxWidth) maxWidth = width;
      });
      const padded = Math.ceil(maxWidth + cellPaddingX * 2);
      return Math.max(minColumnWidth, padded);
    });
    const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
    const tableHeight = headerHeight + rows.length * rowHeight;
    let captionOffset = 0;
    if (caption) {
      captionOffset = captionFontSize + captionGap;
    }
    let footnoteBlockHeight = 0;
    if (footnotes.length) {
      footnoteBlockHeight = footnoteGap + footnotes.length * (footnoteFontSize + 4);
    }
    const bodyTop = outerPadding + captionOffset + headerHeight;
    const tableBottom = outerPadding + captionOffset + tableHeight;
    const footnoteStart = footnotes.length ? tableBottom + footnoteGap : tableBottom;
    const height = tableBottom + footnoteBlockHeight + outerPadding;
    const layout = {
      colWidths,
      tableWidth,
      width: tableWidth + outerPadding * 2,
      height,
      captionOffset,
      footnoteBlockHeight,
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
    const { columns, rows, caption, footnotes, options } = model;
    const layout = computeLayout(model);
    const {
      colWidths,
      tableWidth,
      width,
      height,
      captionOffset,
      captionFontSize,
      footnoteFontSize,
      tableTop,
      bodyTop,
      captionY,
      footnoteStart
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

    if (footnotes.length) {
      let y = footnoteStart + footnoteFontSize;
      footnotes.forEach((note, index) => {
        svg.push(`<text x="${outerPadding}" y="${y}" font-family="${escapeXml(fontFamily)}" font-size="${footnoteFontSize}" fill="${textColor}" opacity="0.85">${escapeXml(note)}</text>`);
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

  statsTable.render = function render(config) {
    const target = resolveTarget(config?.target);
    if (!target) {
      logDebug('render skipped', { reason: 'no target' });
      return null;
    }
    const model = buildModel(config);
    if (!config?.append) {
      target.innerHTML = '';
    }
    const wrapper = doc.createElement('div');
    wrapper.className = 'stats-table-card';
    if (config?.className) {
      wrapper.classList.add(config.className);
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
    model.rows.forEach(row => {
      const tr = doc.createElement('tr');
      row.forEach((value, index) => {
        const col = model.columns[index];
        const td = doc.createElement('td');
        td.className = `stats-table__cell stats-table__cell--${col.align}`;
        td.textContent = value;
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
        contextLabel: config?.contextLabel || model.options.contextLabel
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
    logDebug('render complete', { rowCount: model.rows.length, columnCount: model.columns.length });
    return { wrapper, table, model };
  };

  logDebug('module ready', { hasExporter: !!Shared.exporter });
})(typeof window !== 'undefined' ? window : globalThis);
