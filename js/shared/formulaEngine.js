(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const formulaNS = Shared.formulaEngine = Shared.formulaEngine || {};

  const CELL_REF_RE = /^(\$?[A-Z]+)(\$?\d+)$/;
  const NUMBER_TOKEN_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;

  const toCellKey = (row, col)=>`${row}:${col}`;

  function colToLabel(col){
    let n = Number(col);
    if(!Number.isInteger(n) || n < 0){
      return 'A';
    }
    let out = '';
    while(n >= 0){
      out = String.fromCharCode((n % 26) + 65) + out;
      n = Math.floor(n / 26) - 1;
    }
    return out;
  }

  function labelToCol(label){
    const source = String(label || '').trim().toUpperCase();
    if(!source || !/^[A-Z]+$/.test(source)){
      return null;
    }
    let col = 0;
    for(let i = 0; i < source.length; i += 1){
      col = (col * 26) + (source.charCodeAt(i) - 64);
    }
    return col - 1;
  }

  function parseA1(ref){
    const match = String(ref || '').trim().toUpperCase().match(CELL_REF_RE);
    if(!match){
      return null;
    }
    const col = labelToCol(match[1].replace(/\$/g, ''));
    const row = Number(match[2].replace(/\$/g, '')) - 1;
    if(!Number.isInteger(col) || !Number.isInteger(row) || row < 0){
      return null;
    }
    return { row, col };
  }

  function toA1(row, col, options = {}){
    const r = Number(row);
    const c = Number(col);
    if(!Number.isInteger(r) || r < 0 || !Number.isInteger(c) || c < 0){
      return null;
    }
    const a1RowOffset = Math.max(0, Number(options.a1RowOffset) || 0);
    const a1Row = r - a1RowOffset + 1;
    if(!Number.isInteger(a1Row) || a1Row < 1){
      return null;
    }
    return `${colToLabel(c)}${a1Row}`;
  }

  function shiftFormulaReferences(rawFormula, options = {}){
    const source = String(rawFormula == null ? '' : rawFormula);
    const rowDelta = Number.isInteger(Number(options.rowDelta)) ? Number(options.rowDelta) : 0;
    const colDelta = Number.isInteger(Number(options.colDelta)) ? Number(options.colDelta) : 0;
    if(!rowDelta && !colDelta){
      return source;
    }
    const clampToBounds = options.clampToBounds !== false;
    const leadingWhitespaceMatch = source.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : '';
    const trimmedStart = source.slice(leadingWhitespace.length);
    if(!trimmedStart.startsWith('=')){
      return source;
    }
    const body = trimmedStart.slice(1);
    const isAlphaNumUnderscore = ch => /[A-Za-z0-9_]/.test(ch || '');
    const isLetter = ch => /[A-Za-z]/.test(ch || '');
    const isDigit = ch => /[0-9]/.test(ch || '');

    const readRefAt = (text, index)=>{
      let i = index;
      const tokenStart = i;
      let absCol = false;
      if(text[i] === '$'){
        absCol = true;
        i += 1;
      }
      const colStart = i;
      while(i < text.length && isLetter(text[i])){
        i += 1;
      }
      if(i === colStart){
        return null;
      }
      let absRow = false;
      if(text[i] === '$'){
        absRow = true;
        i += 1;
      }
      const rowStart = i;
      while(i < text.length && isDigit(text[i])){
        i += 1;
      }
      if(i === rowStart){
        return null;
      }
      const prev = tokenStart > 0 ? text[tokenStart - 1] : '';
      const next = i < text.length ? text[i] : '';
      if(isAlphaNumUnderscore(prev) || isAlphaNumUnderscore(next)){
        return null;
      }
      const colLabel = text.slice(colStart, absRow ? (rowStart - 1) : rowStart).toUpperCase();
      const parsedCol = labelToCol(colLabel);
      const parsedRow = Number(text.slice(rowStart, i)) - 1;
      if(!Number.isInteger(parsedCol) || parsedCol < 0 || !Number.isInteger(parsedRow) || parsedRow < 0){
        return null;
      }
      let shiftedCol = absCol ? parsedCol : (parsedCol + colDelta);
      let shiftedRow = absRow ? parsedRow : (parsedRow + rowDelta);
      if(clampToBounds){
        shiftedCol = Math.max(0, shiftedCol);
        shiftedRow = Math.max(0, shiftedRow);
      }else if(shiftedCol < 0 || shiftedRow < 0){
        return null;
      }
      const nextToken = `${absCol ? '$' : ''}${colToLabel(shiftedCol)}${absRow ? '$' : ''}${shiftedRow + 1}`;
      return { end: i, token: nextToken };
    };

    let out = '';
    for(let i = 0; i < body.length;){
      const shifted = readRefAt(body, i);
      if(shifted){
        out += shifted.token;
        i = shifted.end;
      }else{
        out += body[i];
        i += 1;
      }
    }
    return `${leadingWhitespace}=${out}`;
  }

  function parseNumberLike(value){
    if(typeof value === 'number'){
      return Number.isFinite(value) ? value : null;
    }
    if(typeof value !== 'string'){
      return null;
    }
    const trimmed = value.trim();
    if(!trimmed){
      return null;
    }
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeNumericResult(value){
    if(typeof value !== 'number' || !Number.isFinite(value)){
      return value;
    }
    // Collapse binary floating-point artifacts (for example 33.900000000000006)
    // while preserving normal scientific magnitudes.
    const normalized = Number(value.toPrecision(15));
    if(!Number.isFinite(normalized)){
      return value;
    }
    return Object.is(normalized, -0) ? 0 : normalized;
  }

  function createTokenizer(expr){
    const tokens = [];
    const source = String(expr || '');
    const isAlphaNumUnderscore = ch => /[A-Za-z0-9_]/.test(ch || '');
    let i = 0;
    while(i < source.length){
      const ch = source[i];
      if(/\s/.test(ch)){
        i += 1;
        continue;
      }
      if(/[()+\-*/,:;]/.test(ch)){
        tokens.push({ type: ch === ';' ? ',' : ch, value: ch });
        i += 1;
        continue;
      }
      if(/\d|\./.test(ch)){
        const numberMatch = source.slice(i).match(NUMBER_TOKEN_RE);
        if(!numberMatch || !numberMatch[0]){
          throw new Error('Invalid number literal');
        }
        const numericText = numberMatch[0];
        const parsed = Number(numericText);
        if(!Number.isFinite(parsed)){
          throw new Error('Invalid number literal');
        }
        tokens.push({ type: 'number', value: numericText });
        i += numericText.length;
        continue;
      }
      if(ch === '$' || /[A-Za-z_]/.test(ch)){
        if(ch !== '_'){
          const refMatch = source.slice(i).match(/^\$?[A-Za-z]+\$?\d+/);
          if(refMatch && refMatch[0]){
            const tokenValue = refMatch[0];
            const prev = i > 0 ? source[i - 1] : '';
            const next = source[i + tokenValue.length] || '';
            if(!isAlphaNumUnderscore(prev) && !isAlphaNumUnderscore(next)){
              tokens.push({ type: 'ident', value: tokenValue.toUpperCase() });
              i += tokenValue.length;
              continue;
            }
          }
        }
        if(ch === '$'){
          throw new Error(`Unexpected token '${ch}'`);
        }
        const start = i;
        i += 1;
        while(i < source.length && /[A-Za-z0-9_]/.test(source[i])){
          i += 1;
        }
        tokens.push({ type: 'ident', value: source.slice(start, i).toUpperCase() });
        continue;
      }
      throw new Error(`Unexpected token '${ch}'`);
    }
    return tokens;
  }

  function createParser(tokens, options = {}){
    const parseRef = typeof options.parseRef === 'function' ? options.parseRef : parseA1;
    let index = 0;
    const peek = ()=>tokens[index] || null;
    const consume = ()=>tokens[index++] || null;
    const expect = (type)=>{
      const token = consume();
      if(!token || token.type !== type){
        throw new Error(`Expected '${type}'`);
      }
      return token;
    };

    const parseExpression = ()=>parseAddSub();

    const parseAddSub = ()=>{
      let node = parseMulDiv();
      while(true){
        const token = peek();
        if(!token || (token.type !== '+' && token.type !== '-')){
          break;
        }
        consume();
        node = { type: 'binary', op: token.type, left: node, right: parseMulDiv() };
      }
      return node;
    };

    const parseMulDiv = ()=>{
      let node = parseUnary();
      while(true){
        const token = peek();
        if(!token || (token.type !== '*' && token.type !== '/')){
          break;
        }
        consume();
        node = { type: 'binary', op: token.type, left: node, right: parseUnary() };
      }
      return node;
    };

    const parseUnary = ()=>{
      const token = peek();
      if(token && (token.type === '+' || token.type === '-')){
        consume();
        return { type: 'unary', op: token.type, value: parseUnary() };
      }
      return parsePrimary();
    };

    const parseArgs = ()=>{
      const args = [];
      if(peek()?.type === ')'){
        consume();
        return args;
      }
      while(true){
        const argExpr = parseExpression();
        args.push(argExpr);
        const token = peek();
        if(!token){
          throw new Error('Expected )');
        }
        if(token.type === ')'){
          consume();
          break;
        }
        if(token.type !== ','){
          throw new Error('Expected , or )');
        }
        consume();
      }
      return args;
    };

    const parsePrimary = ()=>{
      const token = consume();
      if(!token){
        throw new Error('Unexpected end of expression');
      }
      if(token.type === 'number'){
        const parsed = Number(token.value);
        if(!Number.isFinite(parsed)){
          throw new Error('Invalid number literal');
        }
        return { type: 'number', value: parsed };
      }
      if(token.type === '('){
        const expr = parseExpression();
        expect(')');
        return expr;
      }
      if(token.type === 'ident'){
        if(peek()?.type === '('){
          consume();
          return { type: 'function', name: token.value, args: parseArgs() };
        }
        const asCell = parseRef(token.value);
        if(asCell){
          if(peek()?.type === ':'){
            consume();
            const endToken = consume();
            if(!endToken || endToken.type !== 'ident'){
              throw new Error('Expected range end');
            }
            const endCell = parseRef(endToken.value);
            if(!endCell){
              throw new Error('Invalid range end');
            }
            return { type: 'range', start: asCell, end: endCell };
          }
          return { type: 'cell', ref: asCell };
        }
        throw new Error(`Unknown identifier ${token.value}`);
      }
      throw new Error(`Unexpected token ${token.type}`);
    };

    const root = parseExpression();
    if(index < tokens.length){
      throw new Error('Unexpected trailing expression');
    }
    return root;
  }

  function enumerateRange(start, end){
    const out = [];
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    for(let row = minRow; row <= maxRow; row += 1){
      for(let col = minCol; col <= maxCol; col += 1){
        out.push({ row, col });
      }
    }
    return out;
  }

  function collectRefsOrdered(node, out){
    if(!node || !Array.isArray(out)){
      return;
    }
    if(node.type === 'cell'){
      out.push({ start: node.ref, end: node.ref });
      return;
    }
    if(node.type === 'range'){
      out.push({ start: node.start, end: node.end });
      return;
    }
    if(node.type === 'binary'){
      collectRefsOrdered(node.left, out);
      collectRefsOrdered(node.right, out);
      return;
    }
    if(node.type === 'unary'){
      collectRefsOrdered(node.value, out);
      return;
    }
    if(node.type === 'function'){
      (node.args || []).forEach(arg=>collectRefsOrdered(arg, out));
    }
  }

  function extractReferences(rawFormula, options = {}){
    const source = String(rawFormula == null ? '' : rawFormula).trim();
    if(!source.startsWith('=')){
      return [];
    }
    const body = source.slice(1);
    if(!body){
      return [];
    }
    const a1RowOffset = Math.max(0, Number(options.a1RowOffset) || 0);
    const parseRef = (ref)=>{
      const parsed = parseA1(ref);
      if(!parsed){
        return null;
      }
      return {
        row: parsed.row + a1RowOffset,
        col: parsed.col
      };
    };
    try{
      const ast = createParser(createTokenizer(body), { parseRef });
      const refs = [];
      collectRefsOrdered(ast, refs);
      return refs;
    }catch(err){
      return [];
    }
  }

  function createModel(options = {}){
    const debugLog = typeof options.debugLog === 'function' ? options.debugLog : null;
    const onRecalc = typeof options.onRecalculate === 'function' ? options.onRecalculate : null;
    const headerRows = Math.max(0, Number(options.headerRows) || 0);
    const a1RowOffset = Math.max(0, Number(options.a1RowOffset) || 0);

    const raw = new Map();
    const resolved = new Map();
    const formulas = new Map();
    const dependencies = new Map();
    const dependents = new Map();

    let rowCount = 0;
    let colCount = 0;

    const isFormulaValue = value=>typeof value === 'string' && value.trim().startsWith('=');
    const normalizeRaw = value=>{
      if(value === null || typeof value === 'undefined') return '';
      if(typeof value === 'number') return Number.isFinite(value) ? value : '';
      return String(value);
    };
    const addDependentEdge = (fromKey, toKey)=>{
      if(!dependents.has(fromKey)){
        dependents.set(fromKey, new Set());
      }
      dependents.get(fromKey).add(toKey);
    };
    const removeDependencyEdges = (cellKey)=>{
      const previous = dependencies.get(cellKey);
      if(!previous){
        return;
      }
      previous.forEach(depKey=>{
        const set = dependents.get(depKey);
        if(set){
          set.delete(cellKey);
          if(!set.size){
            dependents.delete(depKey);
          }
        }
      });
      dependencies.delete(cellKey);
    };

    const numericValue = value=>{
      const parsed = parseNumberLike(value);
      return parsed == null ? 0 : parsed;
    };

    const collectRefs = (node, out)=>{
      if(!node || !out) return;
      if(node.type === 'cell'){
        out.add(toCellKey(node.ref.row, node.ref.col));
        return;
      }
      if(node.type === 'range'){
        enumerateRange(node.start, node.end).forEach(cell=>out.add(toCellKey(cell.row, cell.col)));
        return;
      }
      if(node.type === 'binary'){
        collectRefs(node.left, out);
        collectRefs(node.right, out);
        return;
      }
      if(node.type === 'unary'){
        collectRefs(node.value, out);
        return;
      }
      if(node.type === 'function'){
        (node.args || []).forEach(arg=>collectRefs(arg, out));
      }
    };

    const evaluateNode = (node, readCell)=>{
      if(!node){ return 0; }
      if(node.type === 'number'){ return node.value; }
      if(node.type === 'cell'){ return readCell(node.ref.row, node.ref.col); }
      if(node.type === 'range'){
        return enumerateRange(node.start, node.end).map(cell=>readCell(cell.row, cell.col));
      }
      if(node.type === 'unary'){
        const value = numericValue(evaluateNode(node.value, readCell));
        return normalizeNumericResult(node.op === '-' ? -value : value);
      }
      if(node.type === 'binary'){
        const left = numericValue(evaluateNode(node.left, readCell));
        const right = numericValue(evaluateNode(node.right, readCell));
        if(node.op === '+') return normalizeNumericResult(left + right);
        if(node.op === '-') return normalizeNumericResult(left - right);
        if(node.op === '*') return normalizeNumericResult(left * right);
        if(node.op === '/') return right === 0 ? '#DIV/0!' : normalizeNumericResult(left / right);
      }
      if(node.type === 'function'){
        const values = [];
        (node.args || []).forEach(arg=>{
          const value = evaluateNode(arg, readCell);
          if(Array.isArray(value)){
            values.push(...value);
          }else{
            values.push(value);
          }
        });
        const nums = values.map(v=>parseNumberLike(v)).filter(v=>v != null);
        switch(node.name){
          case 'SUM': return normalizeNumericResult(nums.reduce((acc, n)=>acc + n, 0));
          case 'AVG':
          case 'AVERAGE': return nums.length ? normalizeNumericResult(nums.reduce((acc, n)=>acc + n, 0) / nums.length) : 0;
          case 'MIN': return nums.length ? normalizeNumericResult(Math.min(...nums)) : 0;
          case 'MAX': return nums.length ? normalizeNumericResult(Math.max(...nums)) : 0;
          case 'COUNT': return nums.length;
          default: return '#NAME?';
        }
      }
      return 0;
    };

    const evaluateCell = (cellKey, stack, cache = null)=>{
      if(cache && cache.has(cellKey)){
        return cache.get(cellKey);
      }
      if(stack.has(cellKey)){
        return '#CYCLE!';
      }
      const cacheValue = value=>{
        if(cache){
          cache.set(cellKey, value);
        }
        return value;
      };
      if(!formulas.has(cellKey)){
        return cacheValue(normalizeRaw(raw.get(cellKey)));
      }
      const formula = formulas.get(cellKey);
      if(!formula || !formula.ast){
        return cacheValue(formula?.error || '#ERROR!');
      }
      stack.add(cellKey);
      try{
        const out = evaluateNode(formula.ast, (row, col)=>{
          if(row < headerRows){
            const headerKey = toCellKey(row, col);
            return normalizeRaw(raw.get(headerKey));
          }
          const refKey = toCellKey(row, col);
          return evaluateCell(refKey, stack, cache);
        });
        return cacheValue(out);
      }finally{
        stack.delete(cellKey);
      }
    };

    const recalculate = (changedKeys)=>{
      const queue = [...(changedKeys || [])];
      const affected = new Set(queue);
      while(queue.length){
        const key = queue.shift();
        const next = dependents.get(key);
        if(!next){
          continue;
        }
        next.forEach(dep=>{
          if(!affected.has(dep)){
            affected.add(dep);
            queue.push(dep);
          }
        });
      }
      if(!affected.size){
        return;
      }
      const evalCache = new Map();
      affected.forEach(key=>{
        const value = evaluateCell(key, new Set(), evalCache);
        resolved.set(key, value);
      });
      if(debugLog){
        debugLog('formula recalculation complete', {
          affected: affected.size,
          seeds: changedKeys?.length || 0
        });
      }
      if(onRecalc){
        onRecalc({ affected: Array.from(affected) });
      }
    };

    const parseFormula = (rawValue)=>{
      const body = String(rawValue || '').trim().slice(1);
      if(!body){
        if(debugLog){
          debugLog('formula parse failed (empty body)', { rawValue });
        }
        return { ast: null, error: '#ERROR!' };
      }
      try{
        const parseRefForModel = (ref)=>{
          const parsed = parseA1(ref);
          if(!parsed){
            return null;
          }
          return {
            row: parsed.row + a1RowOffset,
            col: parsed.col
          };
        };
        const ast = createParser(createTokenizer(body), { parseRef: parseRefForModel });
        return { ast, error: null };
      }catch(err){
        if(debugLog){
          debugLog('formula parse failed', {
            rawValue,
            message: err?.message || String(err)
          });
        }
        return { ast: null, error: '#ERROR!' };
      }
    };

    const setCellRawInternal = (row, col, input, options = {})=>{
      const key = toCellKey(row, col);
      const normalized = normalizeRaw(input);
      const previousRaw = normalizeRaw(raw.get(key));
      rowCount = Math.max(rowCount, Number.isInteger(row) ? row + 1 : rowCount);
      colCount = Math.max(colCount, Number.isInteger(col) ? col + 1 : colCount);
      if(previousRaw === normalized && !formulas.has(key)){
        if(debugLog){
          debugLog('formula setCellRaw no-op', {
            row,
            col,
            value: normalized
          });
        }
        return null;
      }
      raw.set(key, normalized);
      removeDependencyEdges(key);
      if(row >= headerRows && isFormulaValue(normalized)){
        const parsed = parseFormula(normalized);
        formulas.set(key, parsed);
        const refs = new Set();
        if(parsed.ast){
          collectRefs(parsed.ast, refs);
        }
        dependencies.set(key, refs);
        refs.forEach(refKey=>addDependentEdge(refKey, key));
        if(debugLog){
          debugLog('formula parsed', {
            cell: `${colToLabel(col)}${row + 1}`,
            refs: refs.size,
            valid: !!parsed.ast,
            rawValue: normalized
          });
        }
      }else{
        formulas.delete(key);
        if(debugLog){
          debugLog('formula cleared', {
            cell: `${colToLabel(col)}${row + 1}`,
            value: normalized
          });
        }
      }
      if(options.recalculate !== false){
        recalculate([key]);
      }
      return key;
    };

    const setCellRaw = (row, col, input)=>{
      setCellRawInternal(row, col, input, { recalculate: true });
    };

    const setCellsRaw = (entries)=>{
      if(!Array.isArray(entries) || !entries.length){
        return;
      }
      const changedKeys = [];
      const seen = new Set();
      for(let i = 0; i < entries.length; i += 1){
        const entry = entries[i];
        const row = Number(entry?.row);
        const col = Number(entry?.col);
        if(!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0){
          continue;
        }
        const key = setCellRawInternal(row, col, entry?.value, { recalculate: false });
        if(!key || seen.has(key)){
          continue;
        }
        seen.add(key);
        changedKeys.push(key);
      }
      if(changedKeys.length){
        recalculate(changedKeys);
      }
    };

    const rebuildFromMatrix = (matrix)=>{
      raw.clear();
      resolved.clear();
      formulas.clear();
      dependencies.clear();
      dependents.clear();
      rowCount = Array.isArray(matrix) ? matrix.length : 0;
      colCount = 0;
      const changed = [];
      for(let row = 0; row < rowCount; row += 1){
        const rowData = Array.isArray(matrix[row]) ? matrix[row] : [];
        if(rowData.length > colCount){
          colCount = rowData.length;
        }
        for(let col = 0; col < rowData.length; col += 1){
          const key = toCellKey(row, col);
          const value = normalizeRaw(rowData[col]);
          raw.set(key, value);
          changed.push(key);
        }
      }
      for(let i = 0; i < changed.length; i += 1){
        const key = changed[i];
        const [rowStr, colStr] = key.split(':');
        const row = Number(rowStr);
        const col = Number(colStr);
        const value = raw.get(key);
        if(row >= headerRows && isFormulaValue(value)){
          const parsed = parseFormula(value);
          formulas.set(key, parsed);
          const refs = new Set();
          if(parsed.ast){
            collectRefs(parsed.ast, refs);
          }
          dependencies.set(key, refs);
          refs.forEach(refKey=>addDependentEdge(refKey, key));
        }
      }
      const evalCache = new Map();
      changed.forEach(key=>{
        resolved.set(key, evaluateCell(key, new Set(), evalCache));
      });
      if(debugLog){
        debugLog('formula model rebuilt', { rowCount, colCount, formulas: formulas.size });
      }
    };

    const getRawAt = (row, col)=>normalizeRaw(raw.get(toCellKey(row, col)));
    const getResolvedAt = (row, col)=>resolved.get(toCellKey(row, col)) ?? getRawAt(row, col);

    return {
      setCellRaw,
      setCellsRaw,
      rebuildFromMatrix,
      getRawAt,
      getResolvedAt,
      hasFormulas(){
        return formulas.size > 0;
      },
      isFormulaAt(row, col){
        return formulas.has(toCellKey(row, col));
      }
    };
  }

  formulaNS.createModel = createModel;
  formulaNS.extractReferences = extractReferences;
  formulaNS.parseA1 = parseA1;
  formulaNS.toA1 = toA1;
  formulaNS.shiftFormulaReferences = shiftFormulaReferences;
  formulaNS.colToLabel = colToLabel;
})(typeof window !== 'undefined' ? window : globalThis);
