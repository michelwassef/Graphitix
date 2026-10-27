/* Binary-only GraphPad PCFFGRA4 reader. No DOM, no tab state, no side effects. */
(function(root){
  'use strict';
  const MAX_BINARY = 32 * 1024 * 1024;
  const MAX_PROPERTIES = 8 * 1024 * 1024;
  const MAX_RECORDS = 250000;
  const MAX_DEPTH = 64;
  const HEADER = 'PCFFGRA4';
  const GRAPHICS_UNITS_PER_INCH = 600;
  const CSS_PIXELS_PER_INCH = 96;
  const decoder = encoding => new TextDecoder(encoding, { fatal: true });
  const text = (bytes, encoding = 'utf-8') => decoder(encoding).decode(bytes);
  const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tagName = (bytes, start, count) => String.fromCharCode(...bytes.subarray(start, start + count));

  function selectGraphForTable(table, graphs, requestedId = ''){
    const yIds = Array.isArray(table?.dataSets)
      ? table.dataSets.filter(id => typeof id === 'string' && id) : [];
    if(!yIds.length || yIds.length !== table.dataSets.length
      || new Set(yIds).size !== yIds.length){
      return null;
    }
    const allIds = new Set([ ...yIds, table?.xDataSet, table?.rowTitlesDataSet ]
      .filter(id => typeof id === 'string' && id));
    const ySet = new Set(yIds);
    // Any graph that includes a Y series from this table is relevant for
    // ambiguity detection, even if it also plots another table's data.
    const references = (Array.isArray(graphs) ? graphs : []).filter(graph =>
      Array.isArray(graph?.inputDataSets)
        && graph.inputDataSets.some(id => ySet.has(id)));
    const eligible = references.filter(graph => {
      const inputs = graph.inputDataSets;
      return inputs.length > 0
        && inputs.every(id => typeof id === 'string' && allIds.has(id))
        && yIds.every(id => inputs.includes(id));
    });
    // An explicit caller selection is permitted only when the graph uses
    // exactly the requested table's datasets. It cannot justify importing a
    // graph which also plots another table.
    if(requestedId){
      return eligible.find(graph => graph.id === requestedId) || null;
    }
    // No implicit 'first graph': a Prism table can have many graphs.
    return references.length === 1 && eligible.length === 1 ? eligible[0] : null;
  }

  function parseOuter(buffer){
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if(bytes.byteLength < 8 || tagName(bytes, 0, 8) !== HEADER){
      return null;
    }
    if(bytes.byteLength > MAX_BINARY){
      throw new Error('Prism graph binary exceeds size limit');
    }
    const data = view(bytes);
    const records = [];
    const parents = [];
    let position = 8;
    let recordCount = 0;
    let legacyUnclosed8003 = false;
    while(position < bytes.length){
      if(++recordCount > MAX_RECORDS){
        throw new Error('Prism graph contains too many records');
      }
      // The parser never searches for a tag in payload bytes: every offset is
      // derived from the previous record's verified, little-endian length.
      if(position + 2 > bytes.length){
        throw new Error('Truncated Prism record type');
      }
      const type = data.getUint16(position, true);
      const kind = type & 0xC000;
      if(kind === 0x4000){
        if(parents.length === 2 && parents[0] === (type & 0x3FFF) && parents[1] === 3){
          // Legacy Prism 6 closes the parent without a 0x4003 close.
          parents.pop();
          legacyUnclosed8003 = true;
        }
        if(parents.length === 0 || parents[parents.length - 1] !== (type & 0x3FFF)){
          throw new Error('Unbalanced Prism record section');
        }
        parents.pop();
        records.push({ type, offset: position, start: position + 2, size: 0, depth: parents.length });
        position += 2;
        continue;
      }
      if(position + 6 > bytes.length){
        throw new Error('Truncated Prism record length');
      }
      const size = data.getUint32(position + 2, true);
      if(size > bytes.length - position - 6){
        throw new Error('Prism record extends beyond the binary');
      }
      records.push({ type, offset: position, start: position + 6, size, depth: parents.length });
      position += 6 + size;
      if(kind === 0x8000){
        if(parents.length >= MAX_DEPTH){
          throw new Error('Excessively nested Prism records');
        }
        parents.push(type & 0x3FFF);
      }
    }
    // A single unclosed 0x8003 at EOF was observed in a Prism 6 PZFX file.
    // It is accepted only as that precise legacy exception, never generically.
    if(parents.length){
      throw new Error('Unclosed Prism record section');
    }
    return { bytes, records, legacyUnclosed8003 };
  }

  function readTextStyle(bytes, rec){
    if(!rec || ![0x002D, 0x102D].includes(rec.type) || rec.size < 8){
      return null;
    }
    const data = view(bytes);
    const start = rec.start;
    const version = data.getUint16(start, true);
    const count = data.getUint16(start + 2, true);
    if(version !== 1 || data.getUint32(start + 4, true) !== 0 || rec.size !== 8 + count * 6){
      return null;
    }
    const values = new Map();
    for(let index = 0; index < count; index += 1){
      const offset = start + 8 + index * 6;
      const key = data.getUint16(offset, true);
      if(values.has(key)){
        return null;
      }
      values.set(key, data.getUint32(offset + 2, true));
    }
    const size = values.get(1);
    const milliSize = values.get(9);
    if(size != null && milliSize != null && milliSize !== size * 1000){
      return null;
    }
    const weight = values.get(2);
    return {
      fontSize: Number.isInteger(size) && size > 0 && size <= 128 ? size : null,
      rotation: values.has(6) ? values.get(6) / 10 : null,
      codePage: values.get(10) || null,
      ...(weight === 0 || weight === 1 ? { bold: weight === 1 } : {})
    };
  }

  function extractTexts(outer){
    const { bytes, records } = outer;
    const found = [];
    for(let i = 0; i < records.length - 1; i += 1){
      const record = records[i];
      if(![0x002C, 0x102C].includes(record.type) || record.size > 8192){
        continue;
      }
      const style = readTextStyle(bytes, records[i + 1]);
      if(!style || records[i + 1].depth !== record.depth){
        continue;
      }
      const raw = bytes.subarray(record.start, record.start + record.size);
      let value = null;
      // A declared but unsupported code page must not be silently read as
      // UTF-8. This is particularly important for non-Western Prism files.
      const encoding = style.codePage === 1252 ? 'windows-1252'
        : (style.codePage == null || style.codePage === 65001 ? 'utf-8' : null);
      if(!encoding){
        continue;
      }
      try{
        value = text(raw, encoding);
      }catch(_err){
        continue;
      }
      found.push({ value, ...style });
    }
    const labels = { title: '', xLabel: '', yLabel: '' };
    const titleSequence = found.slice(0, 4);
    let titleTextObjects = [];
    // Prism may append legend or annotation text after the four graph-title
    // records. Validate that leading sequence rather than requiring it to be
    // the entire graph text list.
    if(titleSequence.length === 4 && (/^Y1Title$/i.test(titleSequence[3].value)
      || (titleSequence[2].rotation === 90 && titleSequence[3].rotation === 270))){
      labels.title = titleSequence[0].value;
      labels.xLabel = titleSequence[1].value;
      labels.yLabel = titleSequence[2].value;
      titleTextObjects = titleSequence.slice(0, 3);
    }
    return { labels, texts: found, titleTextObjects };
  }

  function axisSegmentsByLocalIndex(outer){
    const { bytes, records } = outer;
    const segments = records.filter(record => record.type === 0x8025
      && (record.size === 122 || record.size === 134));
    if(segments.length !== 9){
      return null;
    }
    const data = view(bytes);
    const indexed = segments.map(segment => ({
      index: data.getUint16(segment.start, true),
      segment
    })).sort((a, b) => a.index - b.index);
    const firstIndex = indexed[0].index;
    if(indexed.some((item, index) => item.index !== firstIndex + index)){
      return null;
    }
    return new Map(indexed.map((item, index) => [index, item.segment]));
  }

  function extractAxes(outer){
    const { bytes, records } = outer;
    const summary = records.filter(r => r.type === 0x0017 && r.size === 60);
    const byIndex = axisSegmentsByLocalIndex(outer);
    if(summary.length !== 3 || !byIndex){
      return null;
    }
    const data = view(bytes);
    const axes = {};
    for(let index = 0; index < 3; index += 1){
      const segment = byIndex.get(index * 3);
      if(!segment){
        return null;
      }
      // Compare exact source bytes: duplicated IEEE754 values should not be
      // accepted merely because they round to the same JS Number.
      for(let j = 0; j < 16; j += 1){
        if(bytes[summary[index].start + 16 + j] !== bytes[segment.start + 2 + j]){
          return null;
        }
      }
      const min = data.getFloat64(summary[index].start + 16, true);
      const max = data.getFloat64(summary[index].start + 24, true);
      if(!Number.isFinite(min) || !Number.isFinite(max) || min > max){
        return null;
      }
      axes[['x', 'primaryY', 'secondaryY'][index]] = { min, max };
    }
    // Ranges can be Prism's defaults or cached autoscales. They are metadata,
    // NOT instructions to force user-visible axis bounds in Graphitix.
    return axes;
  }

  function extractAxisRanges(outer){
    const { bytes, records } = outer;
    const summaries = records.filter(record => record.type === 0x0017 && record.size === 60);
    const segments = axisSegmentsByLocalIndex(outer);
    if(summaries.length !== 3 || !segments){
      return null;
    }
    const data = view(bytes);
    const names = ['x', 'primaryY', 'secondaryY'];
    const ranges = {};
    for(let index = 0; index < names.length; index += 1){
      const summary = summaries[index];
      const segment = segments.get(index * 3);
      if(!segment || segment.size < 70){
        return null;
      }
      // Controlled Prism 10.1.2 comparisons show 0x0000 for automatic bounds
      // and 0x000c when that axis has “Automatically determine range and
      // interval” turned off. The flag is stored separately for each axis.
      const rangeMode = data.getUint16(summary.start + 40, true);
      if(rangeMode !== 0 && rangeMode !== 12){
        return null;
      }
      const min = data.getFloat64(segment.start + 2, true);
      const max = data.getFloat64(segment.start + 10, true);
      const majorTickInterval = data.getFloat64(segment.start + 54, true);
      const tickStart = data.getFloat64(segment.start + 62, true);
      if(!Number.isFinite(min) || !Number.isFinite(max) || min >= max
        || !Number.isFinite(majorTickInterval) || majorTickInterval <= 0
        || !Number.isFinite(tickStart)){
        return null;
      }
      ranges[names[index]] = {
        manual: rangeMode === 12,
        min,
        max,
        majorTickInterval,
        tickStart
      };
    }
    return ranges;
  }

  function extractAxisScales(outer){
    const { bytes, records } = outer;
    const axisRecords = records.filter(record => record.type === 0x00A5);
    if(axisRecords.length !== 3 || axisRecords.some(record => record.size !== 68)){
      return null;
    }
    const data = view(bytes);
    const scales = {};
    const names = ['x', 'primaryY', 'secondaryY'];
    for(let index = 0; index < names.length; index += 1){
      const record = axisRecords[index];
      const enabled = bytes[record.start + 7];
      const baseCode = data.getUint16(record.start + 64, true);
      const mirroredBaseCode = data.getUint16(record.start + 66, true);
      if((baseCode !== 0 && baseCode !== 1 && baseCode !== 2)
        || mirroredBaseCode !== baseCode
        || enabled !== (baseCode === 0 ? 0 : 1)){
        return null;
      }
      scales[names[index]] = baseCode === 0
        ? { type: 'linear', code: baseCode }
        : { type: 'log', base: baseCode === 1 ? 10 : 2, code: baseCode };
    }
    return scales;
  }

  function extractAxisNumberFormats(outer){
    const segments = axisSegmentsByLocalIndex(outer);
    if(!segments){
      return null;
    }
    const { bytes } = outer;
    const data = view(bytes);
    const formats = {};
    const names = ['x', 'primaryY', 'secondaryY'];
    for(let index = 0; index < names.length; index += 1){
      const segment = segments.get(index * 3);
      // Prism 10.1.2's 134-byte axis segment stores its number-format flag at
      // +84. Older 122-byte layouts do not have this confirmed field.
      if(!segment || segment.size !== 134){
        return null;
      }
      const code = data.getUint16(segment.start + 84, true);
      if(code !== 0 && code !== 1){
        return null;
      }
      formats[names[index]] = {
        notation: code === 1 ? 'scientific' : 'decimal',
        code
      };
    }
    return formats;
  }

  function extractAxisGeometry(outer){
    const { bytes } = outer;
    const byIndex = axisSegmentsByLocalIndex(outer);
    if(!byIndex){
      return null;
    }
    const data = view(bytes);
    const readLength = index => {
      const segment = byIndex.get(index);
      return segment && segment.size >= 32 ? data.getUint16(segment.start + 30, true) : null;
    };
    const x = readLength(0);
    const y = readLength(3);
    const secondaryY = readLength(6);
    if(!x || !y || !secondaryY){
      return null;
    }
    // Controlled Prism 10.1.2 saves establish 600 stored units per inch.
    const toCm = units => Number((units * 2.54 / GRAPHICS_UNITS_PER_INCH).toFixed(2));
    const toCssPixels = units => Number((units * CSS_PIXELS_PER_INCH / GRAPHICS_UNITS_PER_INCH).toFixed(4));
    return {
      x: { storedUnits: x, approximateCm: toCm(x), cssPixelsAt96Dpi: toCssPixels(x) },
      y: { storedUnits: y, approximateCm: toCm(y), cssPixelsAt96Dpi: toCssPixels(y) },
      secondaryY: { storedUnits: secondaryY, approximateCm: toCm(secondaryY), cssPixelsAt96Dpi: toCssPixels(secondaryY) }
    };
  }

  function extractAxisTextStyles(outer){
    const { bytes } = outer;
    const byIndex = axisSegmentsByLocalIndex(outer);
    if(!byIndex){
      return null;
    }
    const data = view(bytes);
    const readStyle = index => {
      const segment = byIndex.get(index);
      if(!segment || segment.size < 46){
        return null;
      }
      // Controlled Prism 10.1.2 comparisons locate tick-label font size and
      // bold state at segment offsets +38 and +42 respectively.
      const fontSizePt = data.getUint32(segment.start + 38, true);
      const boldCode = data.getUint32(segment.start + 42, true);
      if(fontSizePt < 1 || fontSizePt > 128 || (boldCode !== 0 && boldCode !== 1)){
        return null;
      }
      return { fontSizePt, bold: boldCode === 1 };
    };
    const x = readStyle(0);
    const y = readStyle(3);
    return x && y ? { x, y } : null;
  }

  function findAxisStyleSections(outer){
    const { bytes, records } = outer;
    const data = view(bytes);
    const groups = [];
    for(let index = 0; index < records.length; index += 1){
      const axisRecord = records[index];
      if(axisRecord.type !== 0x8020){
        continue;
      }
      let closeIndex = -1;
      for(let next = index + 1; next < records.length; next += 1){
        if(records[next].type === 0x4020 && records[next].depth === axisRecord.depth){
          closeIndex = next;
          break;
        }
      }
      if(closeIndex < 0){
        return null;
      }
      const children = records.slice(index + 1, closeIndex).filter(record =>
        record.depth === axisRecord.depth + 1);
      const strokeRecords = children.filter(record => record.type === 0x0023 && record.size === 26
        && data.getUint32(record.start + 10, true) === 1
        && data.getUint16(record.start, true) === data.getUint16(record.start + 14, true)
        && [9, 10, 11].includes(data.getUint16(record.start + 14, true))
        && data.getUint32(record.start + 18, true) === 1);
      const tickRecords = children.filter(record => record.type === 0x0022 && record.size === 20);
      // Dataset styles also use 0x8020/0x0023 records for their borders. The
      // X and Y axis sections are the two stroke sections that also carry a
      // tick-length record; count those complete axis records rather than all
      // strokes in the graph. This keeps multi-series box/bar plots from
      // turning series borders into apparent axes.
      if(strokeRecords.length === 1 && tickRecords.length === 1){
        groups.push({ strokeRecord: strokeRecords[0], tickRecord: tickRecords[0] });
      }else if(strokeRecords.length > 1 && tickRecords.length){
        return null;
      }
    }
    return groups.length === 2 ? groups : null;
  }

  function extractAxisTickLengths(outer){
    const { bytes } = outer;
    const data = view(bytes);
    const groups = findAxisStyleSections(outer);
    if(!groups){ return null; }
    const readTick = record => {
      const start = record.start;
      const code = data.getUint16(start, true);
      const mirroredCode = data.getUint16(start + 8, true);
      const flags = data.getUint16(start + 12, true);
      const storedValue = data.getFloat32(start + 16, true);
      if(data.getUint16(start + 2, true) !== 0
        || data.getUint32(start + 4, true) !== 0
        || data.getUint16(start + 10, true) !== 0
        || data.getUint16(start + 14, true) !== 0
        || flags !== 1 || !Number.isFinite(storedValue)){
        return null;
      }
      if(code === 0 && mirroredCode === 0 && storedValue === 0){
        return null;
      }
      if(code !== mirroredCode || Math.abs(storedValue - code) > 0.0001){
        return undefined;
      }
      return {
        code,
        storedValue,
        preset: code === 2 ? 'short' : (code === 3 ? 'normal' : '')
      };
    };
    const x = readTick(groups[0].tickRecord);
    const y = readTick(groups[1].tickRecord);
    if(x === undefined || y === undefined || (!x && !y)){
      return null;
    }
    return { x, y };
  }

  function extractAxisThickness(outer){
    const { bytes } = outer;
    const data = view(bytes);
    const groups = findAxisStyleSections(outer);
    if(!groups){ return null; }
    const values = groups.map(group => data.getFloat32(group.strokeRecord.start + 22, true));
    if(!values.every(Number.isFinite) || Math.abs(values[0] - values[1]) > 0.001){
      return null;
    }
    const encodedValue = values[0];
    const points = [1, 2, 3].find(value => Math.abs(encodedValue - (value + 1) * 6) < 0.001);
    return points ? { encodedValue, points } : null;
  }

  function extractAxisFrameGrid(outer){
    if(!outer?.bytes || !Array.isArray(outer.records)){
      return null;
    }
    const data = view(outer.bytes);
    const frameRecords = outer.records.filter(record => record.type === 0x00A3);
    const gridRecords = outer.records.filter(record => record.type === 0x00A4);
    let showFrame = null;
    let gridAxes = null;
    if(frameRecords.length === 1){
      const record = frameRecords[0];
      const start = record.start;
      if(record.size === 10
        && data.getUint16(start, true) === 1
        && data.getUint16(start + 2, true) === 0
        && data.getUint32(start + 4, true) === 1
        && data.getUint16(start + 8, true) <= 1){
        showFrame = data.getUint16(start + 8, true) === 1;
      }
    }
    if(gridRecords.length === 2){
      const byCode = new Map();
      let valid = true;
      gridRecords.forEach(record => {
        if(record.size !== 28){
          valid = false;
          return;
        }
        const start = record.start;
        const code = data.getUint16(start + 4, true);
        const mirroredCode = data.getUint16(start + 20, true);
        const enabled = data.getUint16(start + 18, true);
        const spacing = data.getFloat32(start + 24, true);
        if(data.getUint16(start, true) !== 3
          || data.getUint16(start + 2, true) !== 0
          || data.getUint16(start + 6, true) !== 0
          || data.getUint32(start + 8, true) !== (code === 8 ? 2 : 0)
          || data.getUint32(start + 12, true) !== 0
          || data.getUint16(start + 16, true) !== 0
          || data.getUint16(start + 22, true) !== 0
          || ![8, 9].includes(code)
          || mirroredCode !== code
          || enabled > 1
          || !Number.isFinite(spacing) || spacing <= 0
          || byCode.has(code)){
          valid = false;
          return;
        }
        byCode.set(code, enabled === 1);
      });
      if(valid && byCode.size === 2 && byCode.has(8) && byCode.has(9)){
        // Controlled Prism 10.1.2 files identify code 9 as Y-axis grid lines
        // and code 8 as X-axis grid lines. Keep the axes separate so consumers
        // with only a combined grid toggle can fail closed on asymmetric styles.
        gridAxes = { x: byCode.get(8), y: byCode.get(9) };
      }
    }
    return showFrame === null && !gridAxes ? null : { showFrame, gridAxes };
  }

  function colorFromRgba(value){
    if(!value || value.type !== 1 || value.bytes?.length !== 4){
      return null;
    }
    const rgba = Array.from(value.bytes);
    return {
      rgba,
      hex: '#' + rgba.slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join(''),
      opacity: Number((rgba[3] / 255).toFixed(4))
    };
  }

  function colorFromRecord(bytes, offset){
    if(!bytes || offset < 0 || offset + 4 > bytes.length){
      return null;
    }
    return colorFromRgba({ type: 1, bytes: bytes.subarray(offset, offset + 4) });
  }

  function decodeColumnBorderThicknessPoints(encodedValue){
    if(!Number.isFinite(encodedValue) || encodedValue < 0){
      return null;
    }
    if(encodedValue === 0){
      return 0;
    }
    const points = encodedValue / 6 - 1;
    return points >= 0 ? Number(points.toFixed(4)) : null;
  }

  function indexedSeriesRecords(records, data){
    if(!Array.isArray(records) || !records.length){
      return null;
    }
    const indices = records.map(record => data.getUint16(record.start, true));
    const minimum = Math.min(...indices);
    const maximum = Math.max(...indices);
    if(new Set(indices).size !== records.length
      || maximum - minimum !== records.length - 1){
      return null;
    }
    // Prism can serialize these identifiers as a contiguous project-level
    // range (for example 18,17) instead of local graph positions (1,0).
    return indices.map(index => index - minimum);
  }

  function extractSeriesStyles(outer, rootTree){
    const objectArray = rootTree instanceof Map ? rootTree.get('SEDObject_Array') : null;
    if(!Array.isArray(objectArray)){
      return null;
    }
    const plottedObjects = objectArray.filter(item => item instanceof Map
      && item.get('XYPlot_Map') instanceof Map);
    const data = view(outer.bytes);
    const styleRecords = outer.records.filter(record => {
      if(record.type !== 0x009C){
        return false;
      }
      if(record.size === 313){
        return true;
      }
      // Prism 10.1 legacy survival graphs append only the owning object ID
      // after the established style body. Do not accept short color-table
      // 0x009C records: those are not per-series graph styles.
      if(record.size === 317){
        return data.getUint32(record.start + 313, true) > 0;
      }
      // Prism 10.1.2 appends an object ID and a reserved word to some
      // per-series style records. The established style fields stay in the
      // same 313-byte prefix; accept only that exact extension shape.
      return record.size === 321
        && data.getUint32(record.start + 313, true) > 0
        && data.getUint32(record.start + 317, true) === 0;
    });
    if(!plottedObjects.length || plottedObjects.length !== styleRecords.length){
      return null;
    }
    const markerRecord = outer.records.find(record => record.type === 0x0081);
    const plotStyleRecords = outer.records.filter(record => record.type === 0x8028 && record.size === 144);
    const plotDataSetIndices = plotStyleRecords.length === plottedObjects.length
      ? indexedSeriesRecords(plotStyleRecords, data) : null;
    const plotStyleByDataSetIndex = plotDataSetIndices
      ? new Map(plotStyleRecords.map((record, index) => [plotDataSetIndices[index], record]))
      : null;
    const lineThicknessRecords = outer.records.filter(record =>
      (record.type === 0x802B || record.type === 0x902B) && record.size === 18);
    const connectedLineRecords = outer.records.filter(record => record.type === 0x8028 && record.size === 144);
    const hasConnectedLineStyles = connectedLineRecords.length === plottedObjects.length
      && connectedLineRecords.every(record => outer.bytes[record.start + 64] === 1)
      && lineThicknessRecords.length >= plottedObjects.length;
    const perSeriesLineRecords = hasConnectedLineStyles
      ? lineThicknessRecords.slice(-plottedObjects.length)
      : [];
    const result = [];
    for(let index = 0; index < plottedObjects.length; index += 1){
      const item = plottedObjects[index];
      const plot = item.get('XYPlot_Map');
      const record = styleRecords[index];
      const start = record.start;
      const shapeA = outer.bytes[start + 34];
      const shapeB = outer.bytes[start + 109];
      const size = outer.bytes[start + 81];
      const borderThicknessEncoded = data.getFloat32(start + 265, true);
      const lineRecord = perSeriesLineRecords[index];
      const lineThicknessCode = lineRecord ? data.getUint16(lineRecord.start + 8, true) : 0;
      const dataSetIndex = plotDataSetIndices?.[index] ?? index;
      const indexedPlotRecord = plotStyleByDataSetIndex?.get(dataSetIndex) || null;
      const plotLineThicknessCode = indexedPlotRecord
        ? outer.bytes[indexedPlotRecord.start + 92] : null;
      const errorBarThicknessCode = indexedPlotRecord
        ? outer.bytes[indexedPlotRecord.start + 122] : null;
      if(shapeA !== shapeB || !Number.isInteger(size) || size < 1 || size > 32){
        return null;
      }
      const shape = shapeA === 5 ? 'circle'
        : (shapeA === 1 ? 'square'
        : (shapeA === 2 ? 'triangle-up'
          : (shapeA === 3 && markerRecord?.size === 6 ? 'triangle-down'
            : (shapeA === 3 && markerRecord?.size === 5 ? 'square' : ''))));
      result.push({
        dataSetIndex,
        symbolSize: size,
        shape,
        shapeCode: shapeA,
        fillColor: colorFromRecord(outer.bytes, start + 209),
        borderColor: colorFromRecord(outer.bytes, start + 217),
        borderThickness: {
          encodedValue: borderThicknessEncoded,
          points: decodeColumnBorderThicknessPoints(borderThicknessEncoded)
        },
        symbolColor: colorFromRgba(plot.get('PCFF_Plot::symbolcolor')),
        errorColor: colorFromRgba(plot.get('PCFF_Plot::errorcolor')),
        lineColor: colorFromRgba(plot.get('PCFF_Plot::connectlinecolor')),
        barBoxBorderColor: colorFromRgba(plot.get('PCFF_Plot::BarBoxBordercolor')),
        plotLineThicknessCode,
        errorBarThicknessCode,
        lineThickness: lineThicknessCode === 0x8000
          ? { encodedValue: lineThicknessCode, points: 1, mode: 'explicit' }
          : (lineRecord ? { encodedValue: lineThicknessCode, points: null, mode: 'automatic' } : null)
      });
    }
    return result;
  }

  function extractPieSlices(rootTree){
    const objectArray = rootTree instanceof Map ? rootTree.get('SEDObject_Array') : null;
    if(!Array.isArray(objectArray)){
      return null;
    }
    const sliceArrays = [];
    objectArray.forEach(item => {
      const plot = item instanceof Map ? item.get('XYPlot_Map') : null;
      const slices = plot instanceof Map ? plot.get('PCFF_PieSlice_Array') : null;
      if(Array.isArray(slices) && slices.length){
        sliceArrays.push(slices);
      }
    });
    if(sliceArrays.length !== 1){
      return null;
    }
    const result = sliceArrays[0].map((slice, index) => ({
      index,
      fillColor: colorFromRgba(slice instanceof Map ? slice.get('PCFF_PieSlice::fillcolor') : null)
    }));
    return result.every(item => item.fillColor) ? result : null;
  }

  function extractPieBorder(outer, rootTree){
    const objectArray = rootTree instanceof Map ? rootTree.get('SEDObject_Array') : null;
    if(!Array.isArray(objectArray)){
      return null;
    }
    const piePlots = objectArray.map(item => item instanceof Map ? item.get('XYPlot_Map') : null)
      .filter(plot => plot instanceof Map && Array.isArray(plot.get('PCFF_PieSlice_Array')));
    const records = outer.records.filter(record => record.type === 0x80D6);
    if(piePlots.length !== 1 || records.length !== 1 || records[0].size < 44){
      return null;
    }
    const record = records[0];
    const data = view(outer.bytes);
    const enabledCode = data.getUint32(record.start + 16, true);
    const thicknessCode = data.getUint32(record.start + 40, true);
    const points = thicknessCode - 8;
    if((enabledCode !== 8 && enabledCode !== 9)
      || !Number.isInteger(points) || points < 0 || points > 128){
      return null;
    }
    const color = colorFromRgba(piePlots[0].get('PCFF_PiePlotData::clOuterBorderColor'));
    if(!color){
      return null;
    }
    return {
      outer: {
        enabled: enabledCode === 9,
        color,
        thickness: { encodedValue: thicknessCode, points }
      }
    };
  }

  function extractSeriesPlotModes(outer){
    const records = outer.records.filter(record => record.type === 0x8028);
    if(!records.length || records.some(record => record.size !== 144)){
      return null;
    }
    const data = view(outer.bytes);
    // Some older/column graph records use the same field for another value.
    // Only treat it as an index when the full record set forms a permutation.
    const indices = indexedSeriesRecords(records, data) || records.map((_, index) => index);
    const result = [];
    for(let index = 0; index < records.length; index += 1){
      const record = records[index];
      const mode = data.getUint16(record.start + 10, true);
      if(mode !== 0 && mode !== 1){
        return null;
      }
      result.push({ dataSetIndex: indices[index], mode });
    }
    return result;
  }

  function extractSeriesConnections(outer){
    const records = outer.records.filter(record => record.type === 0x8028);
    if(!records.length || records.some(record => record.size !== 144)){
      return null;
    }
    const indices = indexedSeriesRecords(records, view(outer.bytes)) || records.map((_, index) => index);
    const result = [];
    for(let index = 0; index < records.length; index += 1){
      // Paired Prism 10.1.2 saves change this byte for each dataset when line
      // connections are toggled, while the XY table and dataset IDs stay fixed.
      const value = outer.bytes[records[index].start + 64];
      if(value !== 0 && value !== 1){
        return null;
      }
      result.push({ dataSetIndex: indices[index], connectLines: value === 1 });
    }
    return result;
  }

  function columnPlotSignature(outer){
    const records = outer.records.filter(record => record.type === 0x0013);
    if(records.length !== 1 || records[0].size !== 48){
      return null;
    }
    const data = view(outer.bytes);
    const record = records[0];
    return [14, 38, 40, 42].map(offset => data.getUint16(record.start + offset, true));
  }

  function extractColumnGraphType(outer){
    const signature = columnPlotSignature(outer);
    if(!signature){
      return '';
    }
    const matches = expected => expected.every((value, index) => signature[index] === value);
    // Controlled Prism saves identify the column plot type in this typed record.
    if(matches([11, 11, 11, 17])) return 'violin';
    if(matches([4, 4, 4, 2])) return 'box';
    if(matches([3, 3, 3, 1])) return 'strip';
    if(matches([3, 3, 3, 13]) || matches([5, 5, 5, 3])) return 'bar';
    return '';
  }

  function extractColumnPointMode(outer){
    const signature = columnPlotSignature(outer);
    return signature && signature[0] === 3 && signature[1] === 3
      && signature[2] === 3 && signature[3] === 13 ? 'overlay' : '';
  }

  function extractZvalFrame(outer){
    const { bytes, records } = outer;
    const items = records.filter(r => r.type === 0x0852);
    if(items.length !== 1){
      return null;
    }
    const r = items[0];
    if(r.size < 16 || tagName(bytes, r.start, 4) !== 'Zval'){
      return null;
    }
    const data = view(bytes);
    const compressed = data.getUint32(r.start + 4, true);
    const expanded = data.getUint32(r.start + 8, true);
    if(compressed > MAX_PROPERTIES || expanded > MAX_PROPERTIES || r.size !== compressed + 16
      || tagName(bytes, r.start + 12 + compressed, 4) !== 'Zend'){
      return null;
    }
    return { payload: bytes.subarray(r.start + 12, r.start + 12 + compressed), expanded };
  }

  function parsePropertyTree(bytes){
    const data = view(bytes);
    let offset = 0;
    let count = 0;
    function need(n){
      if(n < 0 || n > bytes.length - offset){
        throw new Error('Truncated Prism property tree');
      }
      const old = offset;
      offset += n;
      return old;
    }
    function marker(expected){
      const p = need(expected.length);
      if(tagName(bytes, p, expected.length) !== expected){
        throw new Error('Invalid Prism property marker');
      }
    }
    function uint32(){
      return data.getUint32(need(4), true);
    }
    function value(depth){
      if(depth > MAX_DEPTH || ++count > MAX_RECORDS){
        throw new Error('Prism property tree exceeds bounds');
      }
      marker('Mval');
      const type = uint32();
      const size = uint32();
      if(size > bytes.length - offset){
        throw new Error('Invalid Prism property value length');
      }
      const end = offset + size;
      let result;
      if(type === 5){
        result = new Map();
        while(offset < end && tagName(bytes, offset, 4) !== 'Dfin'){
          marker('Dkey');
          const keySize = uint32();
          if(keySize > 8192){
            throw new Error('Oversized Prism property key');
          }
          const key = text(bytes.subarray(need(keySize), offset));
          marker('Dval');
          if(result.has(key)){
            throw new Error('Duplicate Prism property key');
          }
          result.set(key, value(depth + 1));
        }
        marker('Dfin');
      }else if(type === 6){
        marker('Asiz');
        const length = uint32();
        if(length > MAX_RECORDS){
          throw new Error('Oversized Prism property array');
        }
        result = [];
        for(let j = 0; j < length; j += 1){
          marker('Aval');
          result.push(value(depth + 1));
        }
        marker('Afin');
      }else{
        const start = need(size);
        result = { type, bytes: bytes.subarray(start, start + size) };
      }
      if(offset !== end){
        throw new Error('Prism property length does not match its contents');
      }
      marker('Mend');
      return result;
    }
    const result = value(0);
    if(offset !== bytes.length){
      throw new Error('Trailing Prism property bytes');
    }
    return result;
  }

  function colorsFromTree(rootTree){
    const result = { fontColor: '', axisColor: '' };
    const textColors = [];
    const lineColors = [];
    const colors = [];
    function visit(node){
      if(node instanceof Map){
        for(const [key, value] of node){
          if(value && value.type === 1 && value.bytes?.length === 4 && /color$/i.test(key)){
            const rgba = Array.from(value.bytes);
            colors.push({ key, rgba });
            // Red, blue, 25%, and 50% transparency samples confirm RGBA
            // order and alpha scaling for PCFF_Plot::symbolcolor/errorcolor.
            if(rgba[0] === rgba[2] && rgba[3] === 255){
              const hex = '#' + rgba.slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('');
              if(key === 'IPGAxSeg::textcolor') textColors.push(hex);
              if(key === 'PCFF_LineStyle::linecolor') lineColors.push(hex);
            }
          }
          visit(value);
        }
      }else if(Array.isArray(node)){
        node.forEach(visit);
      }
    }
    visit(rootTree);
    // The recipient's style API has one font/axis color, not one per Prism
    // segment. A majority vote would silently destroy intentional variation.
    const uniform = items => items.length && items.every(item => item === items[0]) ? items[0] : '';
    result.fontColor = uniform(textColors);
    result.axisColor = uniform(lineColors);
    result.rawNamedColors = colors;
    return result;
  }

  async function inspect(buffer, inflate){
    const outer = parseOuter(buffer);
    if(!outer){
      return null;
    }
    const titles = extractTexts(outer);
    const axes = extractAxes(outer);
    const axisRanges = extractAxisRanges(outer);
    const axisScales = extractAxisScales(outer);
    const axisNumberFormats = extractAxisNumberFormats(outer);
    const info = {
      labels: titles.labels, textObjects: titles.texts,
      titleTextObjects: titles.titleTextObjects,
      axes, axisRanges, axisScales, axisNumberFormats, recordCount: outer.records.length,
      legacyUnclosed8003: outer.legacyUnclosed8003,
      colors: { fontColor: '', axisColor: '' },
      axisGeometry: extractAxisGeometry(outer),
      axisTextStyles: extractAxisTextStyles(outer),
      axisTickLengths: extractAxisTickLengths(outer),
      axisThickness: extractAxisThickness(outer),
      axisFrameGrid: extractAxisFrameGrid(outer),
      seriesStyles: null,
      seriesPlotModes: extractSeriesPlotModes(outer),
      seriesConnections: extractSeriesConnections(outer),
      columnGraphType: extractColumnGraphType(outer),
      columnPointMode: extractColumnPointMode(outer)
    };
    const frame = extractZvalFrame(outer);
    // Absence is valid for old PCFF files. Presence with malformed framing
    // is corruption: accepting titles in that situation would apply partial
    // metadata from a damaged graph.
    if(!frame && outer.records.some(record => record.type === 0x0852)){
      throw new Error('Invalid Prism Zval record');
    }
    if(frame && typeof inflate === 'function'){
      const data = await inflate(frame.payload, frame.expanded);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      if(bytes.length !== frame.expanded){
        throw new Error('Prism property decompressed size differs from its header');
      }
      const tree = parsePropertyTree(bytes);
      info.colors = colorsFromTree(tree);
      info.seriesStyles = extractSeriesStyles(outer, tree);
      info.pieSlices = extractPieSlices(tree);
      info.pieBorder = extractPieBorder(outer, tree);
    }
    return info;
  }

  async function inspectAll(buffer, inflate){
    const outer = parseOuter(buffer);
    if(!outer){
      return [];
    }
    const sections = outer.records.filter(record => record.type === 0x8012 && record.depth === 1);
    if(sections.length <= 1){
      const info = await inspect(buffer, inflate);
      return info ? [info] : [];
    }
    const root = outer.records[0];
    if(root?.type !== 0x8001){
      return [];
    }
    const rootEnd = root.start + root.size;
    const rootPrefix = outer.bytes.subarray(0, rootEnd);
    const graphInfos = [];
    for(const section of sections){
      const sectionIndex = outer.records.indexOf(section);
      const close = outer.records.slice(sectionIndex + 1).find(record =>
        record.type === 0x4012 && record.depth === section.depth);
      if(!close){
        return [];
      }
      const sectionBytes = outer.bytes.subarray(section.offset, close.offset + 2);
      const isolated = new Uint8Array(rootPrefix.length + sectionBytes.length + 2);
      isolated.set(rootPrefix, 0);
      isolated.set(sectionBytes, rootPrefix.length);
      isolated.set([0x01, 0x40], rootPrefix.length + sectionBytes.length);
      const info = await inspect(isolated, inflate);
      if(info){
        graphInfos.push(info);
      }
    }
    return graphInfos;
  }

  const api = Object.freeze({ parseOuter, extractTexts, extractAxes, extractAxisRanges, extractAxisScales, extractAxisNumberFormats, extractAxisGeometry,
    extractAxisTextStyles, extractAxisTickLengths,
    extractAxisThickness, extractAxisFrameGrid, extractZvalFrame, parsePropertyTree, colorsFromTree,
    extractSeriesStyles, extractPieSlices, extractPieBorder, extractSeriesPlotModes, extractSeriesConnections,
    extractColumnGraphType, extractColumnPointMode, selectGraphForTable, inspect, inspectAll });
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root.Shared){
    root.Shared.prismBinary = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
