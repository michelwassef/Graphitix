(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const dataTransforms = Shared.dataTransforms = Shared.dataTransforms || {};

  function debugLog(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: dataTransforms ' + message, payload || {});
    }
  }

  function toFiniteNumber(value){
    if(typeof value === 'number'){
      return Number.isFinite(value) ? value : null;
    }
    if(typeof value === 'string'){
      const trimmed = value.trim();
      if(!trimmed){
        return null;
      }
      const normalized = trimmed.replace(/,/g, '');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function cloneMatrix(matrix){
    if(!Array.isArray(matrix)){
      return [];
    }
    const out = new Array(matrix.length);
    for(let i = 0; i < matrix.length; i += 1){
      out[i] = Array.isArray(matrix[i]) ? matrix[i].slice() : [];
    }
    return out;
  }

  function matrixShape(matrix){
    if(!Array.isArray(matrix)){
      return { rows: 0, cols: 0 };
    }
    const rows = matrix.length;
    let cols = 0;
    for(let i = 0; i < matrix.length; i += 1){
      const row = matrix[i];
      if(Array.isArray(row) && row.length > cols){
        cols = row.length;
      }
    }
    return { rows, cols };
  }

  function normalizeIndex(value, fallback){
    const number = Number(value);
    if(Number.isInteger(number) && number >= 0){
      return number;
    }
    return fallback;
  }

  function normalizeTransformSpec(spec){
    const input = (spec && typeof spec === 'object') ? spec : { type: spec };
    const rawType = String(input.type || '').trim().toLowerCase();
    const normalizedType = rawType || 'identity';

    if(normalizedType === 'log2'){
      return {
        type: 'log',
        base: 2,
        pseudoCount: Number.isFinite(Number(input.pseudoCount)) ? Number(input.pseudoCount) : 0
      };
    }
    if(normalizedType === 'log10'){
      return {
        type: 'log',
        base: 10,
        pseudoCount: Number.isFinite(Number(input.pseudoCount)) ? Number(input.pseudoCount) : 0
      };
    }
    if(normalizedType === 'log'){
      return {
        type: 'log',
        base: Number.isFinite(Number(input.base)) && Number(input.base) > 0 && Number(input.base) !== 1
          ? Number(input.base)
          : 2,
        pseudoCount: Number.isFinite(Number(input.pseudoCount)) ? Number(input.pseudoCount) : 0
      };
    }
    if(normalizedType === 'custom' || normalizedType === 'formula'){
      return {
        type: 'custom',
        expression: String(input.expression || '').trim()
      };
    }
    if(normalizedType === 'multiply'){
      return {
        type: 'scale',
        factor: Number.isFinite(Number(input.factor)) ? Number(input.factor) : 1
      };
    }
    if(normalizedType === 'scale'){
      return {
        type: 'scale',
        factor: Number.isFinite(Number(input.factor)) ? Number(input.factor) : 1
      };
    }
    if(normalizedType === 'divide'){
      return {
        type: 'divide',
        divisor: Number.isFinite(Number(input.divisor)) ? Number(input.divisor) : 1
      };
    }
    if(normalizedType === 'add'){
      return {
        type: 'add',
        value: Number.isFinite(Number(input.value)) ? Number(input.value) : 0
      };
    }
    if(normalizedType === 'subtract'){
      return {
        type: 'subtract',
        value: Number.isFinite(Number(input.value)) ? Number(input.value) : 0
      };
    }
    if(normalizedType === 'cpm'){
      return {
        type: 'cpm',
        scale: Number.isFinite(Number(input.scale)) ? Number(input.scale) : 1000000,
        orientation: String(input.orientation || 'column').toLowerCase() === 'row' ? 'row' : 'column'
      };
    }
    if(normalizedType === 'centerrows'){
      return {
        type: 'centerRows',
        method: String(input.method || 'mean').toLowerCase() === 'median' ? 'median' : 'mean'
      };
    }
    if(normalizedType === 'centercolumns'){
      return {
        type: 'centerColumns',
        method: String(input.method || 'mean').toLowerCase() === 'median' ? 'median' : 'mean'
      };
    }
    if(normalizedType === 'normalizerows'){
      return { type: 'normalizeRows' };
    }
    if(normalizedType === 'normalizecolumns'){
      return { type: 'normalizeColumns' };
    }
    return { type: normalizedType };
  }

  function resolveBounds(matrix, options){
    const shape = matrixShape(matrix);
    const headerRows = normalizeIndex(options?.headerRows, 0);
    const startRow = Math.max(headerRows, normalizeIndex(options?.startRow, headerRows));
    const startCol = normalizeIndex(options?.startCol, 0);
    const endRowFallback = Math.max(0, shape.rows - 1);
    const endColFallback = Math.max(0, shape.cols - 1);
    const endRow = Math.min(
      endRowFallback,
      normalizeIndex(options?.endRow, endRowFallback)
    );
    const endCol = Math.min(
      endColFallback,
      normalizeIndex(options?.endCol, endColFallback)
    );
    const protectedColsSet = new Set(
      Array.isArray(options?.protectedCols)
        ? options.protectedCols.map(idx => normalizeIndex(idx, -1)).filter(idx => idx >= 0)
        : []
    );
    return {
      startRow,
      startCol,
      endRow,
      endCol,
      protectedColsSet,
      hasRange: shape.rows > 0 && shape.cols > 0 && startRow <= endRow && startCol <= endCol
    };
  }

  function shouldSkipCell(row, col, value, bounds, options){
    if(row < bounds.startRow || row > bounds.endRow){
      return true;
    }
    if(col < bounds.startCol || col > bounds.endCol){
      return true;
    }
    if(bounds.protectedColsSet.has(col)){
      return true;
    }
    if(typeof options?.skipCell === 'function'){
      try{
        return !!options.skipCell(row, col, value);
      }catch(err){
        debugLog('skipCell callback error', { message: err?.message || String(err) });
      }
    }
    return false;
  }

  function compileCustomExpression(expression){
    const raw = String(expression || '').trim();
    if(!raw){
      throw new Error('Custom expression cannot be empty.');
    }
    if(raw.length > 180){
      throw new Error('Custom expression is too long.');
    }
    if(!/^[0-9A-Za-z_+\-*/^().,\s]*$/.test(raw)){
      throw new Error('Custom expression contains unsupported characters.');
    }

    const FUNCTIONS = {
      abs: Math.abs,
      sqrt: Math.sqrt,
      exp: Math.exp,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      asin: Math.asin,
      acos: Math.acos,
      atan: Math.atan,
      min: Math.min,
      max: Math.max,
      pow: Math.pow,
      ln: Math.log,
      log: Math.log,
      log10: Math.log10 ? Math.log10.bind(Math) : (x => Math.log(x) / Math.log(10)),
      log2: Math.log2 ? Math.log2.bind(Math) : (x => Math.log(x) / Math.log(2))
    };
    const CONSTANTS = {
      pi: Math.PI,
      e: Math.E
    };
    const allowedIdentifiers = new Set(['x', ...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS)]);
    const PRECEDENCE = {
      '+': 1,
      '-': 1,
      '*': 2,
      '/': 2,
      '^': 3
    };

    function tokenize(input){
      const tokens = [];
      let idx = 0;
      while(idx < input.length){
        const ch = input[idx];
        if(/\s/.test(ch)){
          idx += 1;
          continue;
        }
        if(/[0-9.]/.test(ch)){
          let end = idx;
          let sawDot = false;
          while(end < input.length){
            const c = input[end];
            if(c === '.'){
              if(sawDot){
                break;
              }
              sawDot = true;
              end += 1;
              continue;
            }
            if(/[0-9]/.test(c)){
              end += 1;
              continue;
            }
            break;
          }
          if(end < input.length && /[eE]/.test(input[end])){
            let expEnd = end + 1;
            if(expEnd < input.length && /[+-]/.test(input[expEnd])){
              expEnd += 1;
            }
            let expDigitsStart = expEnd;
            while(expEnd < input.length && /[0-9]/.test(input[expEnd])){
              expEnd += 1;
            }
            if(expEnd > expDigitsStart){
              end = expEnd;
            }
          }
          const numText = input.slice(idx, end);
          if(!numText || numText === '.'){
            throw new Error(`Invalid numeric token near "${numText || ch}".`);
          }
          const numeric = Number(numText);
          if(!Number.isFinite(numeric)){
            throw new Error(`Invalid number "${numText}".`);
          }
          tokens.push({ type: 'number', value: numeric });
          idx = end;
          continue;
        }
        if(/[A-Za-z_]/.test(ch)){
          let end = idx + 1;
          while(end < input.length && /[A-Za-z0-9_]/.test(input[end])){
            end += 1;
          }
          tokens.push({ type: 'identifier', value: input.slice(idx, end) });
          idx = end;
          continue;
        }
        if(ch === '(' || ch === ')' || ch === ','){
          tokens.push({ type: ch, value: ch });
          idx += 1;
          continue;
        }
        if(Object.prototype.hasOwnProperty.call(PRECEDENCE, ch)){
          tokens.push({ type: 'operator', value: ch });
          idx += 1;
          continue;
        }
        throw new Error(`Custom expression contains unsupported characters.`);
      }
      tokens.push({ type: 'eof', value: null });
      return tokens;
    }

    function parseExpressionFromTokens(tokens){
      let cursor = 0;
      const peek = () => tokens[cursor] || { type: 'eof', value: null };
      const consume = () => {
        const token = peek();
        cursor += 1;
        return token;
      };
      const expectType = (type, message) => {
        const token = consume();
        if(token.type !== type){
          throw new Error(message);
        }
        return token;
      };

      const parsePrimary = () => {
        const token = peek();
        if(token.type === 'number'){
          consume();
          return { kind: 'number', value: token.value };
        }
        if(token.type === 'identifier'){
          consume();
          const lowered = String(token.value || '').toLowerCase();
          if(!allowedIdentifiers.has(lowered)){
            throw new Error(`Unknown identifier "${token.value}".`);
          }
          if(peek().type === '('){
            consume(); // (
            if(!Object.prototype.hasOwnProperty.call(FUNCTIONS, lowered)){
              throw new Error(`Unknown function "${token.value}".`);
            }
            const args = [];
            if(peek().type !== ')'){
              while(true){
                args.push(parseBinary(0));
                if(peek().type === ','){
                  consume();
                  continue;
                }
                break;
              }
            }
            expectType(')', 'Missing closing ")" in custom expression.');
            return { kind: 'call', name: lowered, args };
          }
          if(lowered === 'x'){
            return { kind: 'variable' };
          }
          if(Object.prototype.hasOwnProperty.call(CONSTANTS, lowered)){
            return { kind: 'constant', name: lowered };
          }
          throw new Error(`Function "${token.value}" must be called with parentheses.`);
        }
        if(token.type === '('){
          consume();
          const inner = parseBinary(0);
          expectType(')', 'Missing closing ")" in custom expression.');
          return inner;
        }
        throw new Error('Invalid custom expression syntax.');
      };

      const parseUnary = () => {
        const token = peek();
        if(token.type === 'operator' && (token.value === '+' || token.value === '-')){
          consume();
          return {
            kind: 'unary',
            op: token.value,
            expr: parseUnary()
          };
        }
        return parsePrimary();
      };

      const parseBinary = minPrecedence => {
        let left = parseUnary();
        while(true){
          const opToken = peek();
          if(opToken.type !== 'operator'){
            break;
          }
          const precedence = PRECEDENCE[opToken.value];
          if(!precedence || precedence < minPrecedence){
            break;
          }
          consume();
          const nextMin = opToken.value === '^' ? precedence : precedence + 1;
          const right = parseBinary(nextMin);
          left = { kind: 'binary', op: opToken.value, left, right };
        }
        return left;
      };

      const ast = parseBinary(0);
      if(peek().type !== 'eof'){
        throw new Error('Unexpected token in custom expression.');
      }
      return ast;
    }

    function evaluateAst(node, value){
      if(!node || typeof node !== 'object'){
        return null;
      }
      if(node.kind === 'number'){
        return node.value;
      }
      if(node.kind === 'variable'){
        return value;
      }
      if(node.kind === 'constant'){
        return CONSTANTS[node.name];
      }
      if(node.kind === 'unary'){
        const numeric = evaluateAst(node.expr, value);
        if(!Number.isFinite(numeric)){
          return null;
        }
        return node.op === '-' ? -numeric : numeric;
      }
      if(node.kind === 'binary'){
        const left = evaluateAst(node.left, value);
        const right = evaluateAst(node.right, value);
        if(!Number.isFinite(left) || !Number.isFinite(right)){
          return null;
        }
        if(node.op === '+'){ return left + right; }
        if(node.op === '-'){ return left - right; }
        if(node.op === '*'){ return left * right; }
        if(node.op === '/'){ return right === 0 ? null : left / right; }
        if(node.op === '^'){ return Math.pow(left, right); }
        return null;
      }
      if(node.kind === 'call'){
        const fn = FUNCTIONS[node.name];
        if(typeof fn !== 'function'){
          return null;
        }
        const args = [];
        for(let i = 0; i < node.args.length; i += 1){
          const argValue = evaluateAst(node.args[i], value);
          if(!Number.isFinite(argValue)){
            return null;
          }
          args.push(argValue);
        }
        const result = fn.apply(null, args);
        return Number.isFinite(result) ? result : null;
      }
      return null;
    }

    const ast = parseExpressionFromTokens(tokenize(raw));
    return function evaluateExpression(value){
      const computed = evaluateAst(ast, value);
      return Number.isFinite(computed) ? computed : null;
    };
  }

  function summarizeResult(spec, shape, stats, warnings){
    return {
      transform: spec?.type || 'unknown',
      rows: shape.rows,
      cols: shape.cols,
      changedCells: stats.changedCells,
      numericCells: stats.numericCells,
      skippedCells: stats.skippedCells,
      warnings: warnings.slice(0, 8)
    };
  }

  function runPointwiseTransform(matrix, spec, options, mapper){
    const input = Array.isArray(matrix) ? matrix : [];
    const output = cloneMatrix(input);
    const bounds = resolveBounds(input, options);
    const stats = {
      changedCells: 0,
      skippedCells: 0,
      numericCells: 0
    };
    if(!bounds.hasRange){
      return { data: output, stats };
    }
    for(let row = bounds.startRow; row <= bounds.endRow; row += 1){
      const sourceRow = Array.isArray(input[row]) ? input[row] : [];
      const targetRow = Array.isArray(output[row]) ? output[row] : [];
      for(let col = bounds.startCol; col <= bounds.endCol; col += 1){
        const raw = sourceRow[col];
        if(shouldSkipCell(row, col, raw, bounds, options)){
          continue;
        }
        const numeric = toFiniteNumber(raw);
        if(numeric === null){
          stats.skippedCells += 1;
          continue;
        }
        stats.numericCells += 1;
        const next = mapper(numeric, row, col);
        if(next === null || !Number.isFinite(next)){
          stats.skippedCells += 1;
          continue;
        }
        targetRow[col] = next;
        stats.changedCells += 1;
      }
      output[row] = targetRow;
    }
    return { data: output, stats };
  }

  function runCpmTransform(matrix, spec, options){
    const input = Array.isArray(matrix) ? matrix : [];
    const output = cloneMatrix(input);
    const bounds = resolveBounds(input, options);
    const stats = {
      changedCells: 0,
      skippedCells: 0,
      numericCells: 0
    };
    if(!bounds.hasRange){
      return { data: output, stats, warnings: ['No numeric range to transform.'] };
    }
    const warnings = [];
    const scale = Number.isFinite(spec.scale) ? spec.scale : 1000000;
    if(!(scale > 0)){
      warnings.push('CPM scale must be positive.');
      return { data: output, stats, warnings };
    }

    if(spec.orientation === 'row'){
      for(let row = bounds.startRow; row <= bounds.endRow; row += 1){
        const sourceRow = Array.isArray(input[row]) ? input[row] : [];
        const targetRow = Array.isArray(output[row]) ? output[row] : [];
        let total = 0;
        for(let col = bounds.startCol; col <= bounds.endCol; col += 1){
          const raw = sourceRow[col];
          if(shouldSkipCell(row, col, raw, bounds, options)){
            continue;
          }
          const numeric = toFiniteNumber(raw);
          if(numeric === null || numeric < 0){
            continue;
          }
          total += numeric;
        }
        if(total <= 0){
          warnings.push(`Row ${row + 1} has zero CPM denominator.`);
          continue;
        }
        for(let col = bounds.startCol; col <= bounds.endCol; col += 1){
          const raw = sourceRow[col];
          if(shouldSkipCell(row, col, raw, bounds, options)){
            continue;
          }
          const numeric = toFiniteNumber(raw);
          if(numeric === null || numeric < 0){
            stats.skippedCells += 1;
            continue;
          }
          stats.numericCells += 1;
          targetRow[col] = (numeric / total) * scale;
          stats.changedCells += 1;
        }
        output[row] = targetRow;
      }
      return { data: output, stats, warnings };
    }

    const colTotals = new Array(bounds.endCol + 1).fill(0);
    for(let row = bounds.startRow; row <= bounds.endRow; row += 1){
      const sourceRow = Array.isArray(input[row]) ? input[row] : [];
      for(let col = bounds.startCol; col <= bounds.endCol; col += 1){
        const raw = sourceRow[col];
        if(shouldSkipCell(row, col, raw, bounds, options)){
          continue;
        }
        const numeric = toFiniteNumber(raw);
        if(numeric === null || numeric < 0){
          continue;
        }
        colTotals[col] += numeric;
      }
    }
    for(let col = bounds.startCol; col <= bounds.endCol; col += 1){
      if(bounds.protectedColsSet.has(col)){
        continue;
      }
      if(colTotals[col] <= 0){
        warnings.push(`Column ${col + 1} has zero CPM denominator.`);
      }
    }
    for(let row = bounds.startRow; row <= bounds.endRow; row += 1){
      const sourceRow = Array.isArray(input[row]) ? input[row] : [];
      const targetRow = Array.isArray(output[row]) ? output[row] : [];
      for(let col = bounds.startCol; col <= bounds.endCol; col += 1){
        const raw = sourceRow[col];
        if(shouldSkipCell(row, col, raw, bounds, options)){
          continue;
        }
        const numeric = toFiniteNumber(raw);
        if(numeric === null || numeric < 0){
          stats.skippedCells += 1;
          continue;
        }
        const total = colTotals[col];
        if(!(total > 0)){
          stats.skippedCells += 1;
          continue;
        }
        stats.numericCells += 1;
        targetRow[col] = (numeric / total) * scale;
        stats.changedCells += 1;
      }
      output[row] = targetRow;
    }
    return { data: output, stats, warnings };
  }

  function runCenterOrNormalizeTransform(matrix, spec, options){
    const input = Array.isArray(matrix) ? matrix : [];
    const output = cloneMatrix(input);
    const bounds = resolveBounds(input, options);
    const stats = {
      changedCells: 0,
      skippedCells: 0,
      numericCells: 0
    };
    if(!bounds.hasRange){
      return { data: output, stats, warnings: ['No numeric range to transform.'] };
    }

    const warnings = [];
    const axis = (spec.type === 'centerColumns' || spec.type === 'normalizeColumns') ? 'column' : 'row';
    const normalize = (spec.type === 'normalizeRows' || spec.type === 'normalizeColumns');
    const centerMethod = String(spec.method || 'mean').toLowerCase() === 'median' ? 'median' : 'mean';

    const computeCenter = values => {
      if(!Array.isArray(values) || !values.length){
        return NaN;
      }
      if(centerMethod === 'median'){
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if(sorted.length % 2 === 0){
          return (sorted[mid - 1] + sorted[mid]) / 2;
        }
        return sorted[mid];
      }
      let sum = 0;
      for(let i = 0; i < values.length; i += 1){
        sum += values[i];
      }
      return sum / values.length;
    };

    if(axis === 'row'){
      for(let row = bounds.startRow; row <= bounds.endRow; row += 1){
        const sourceRow = Array.isArray(input[row]) ? input[row] : [];
        const targetRow = Array.isArray(output[row]) ? output[row] : [];
        const values = [];
        for(let col = bounds.startCol; col <= bounds.endCol; col += 1){
          const raw = sourceRow[col];
          if(shouldSkipCell(row, col, raw, bounds, options)){
            continue;
          }
          const numeric = toFiniteNumber(raw);
          if(numeric === null){
            continue;
          }
          values.push(numeric);
        }
        if(!values.length){
          continue;
        }
        const center = computeCenter(values);
        if(!Number.isFinite(center)){
          continue;
        }
        let std = 0;
        if(normalize){
          let mean = 0;
          for(let i = 0; i < values.length; i += 1){
            mean += values[i];
          }
          mean /= values.length;
          for(let i = 0; i < values.length; i += 1){
            const delta = values[i] - mean;
            std += delta * delta;
          }
          std = values.length > 1 ? Math.sqrt(std / (values.length - 1)) : 0;
          if(!(std > 0)){
            warnings.push(`Row ${row + 1} has zero variance; skipped normalization.`);
          }
        }
        for(let col = bounds.startCol; col <= bounds.endCol; col += 1){
          const raw = sourceRow[col];
          if(shouldSkipCell(row, col, raw, bounds, options)){
            continue;
          }
          const numeric = toFiniteNumber(raw);
          if(numeric === null){
            stats.skippedCells += 1;
            continue;
          }
          stats.numericCells += 1;
          let next = numeric - center;
          if(normalize){
            if(!(std > 0)){
              stats.skippedCells += 1;
              continue;
            }
            next = next / std;
          }
          targetRow[col] = next;
          stats.changedCells += 1;
        }
        output[row] = targetRow;
      }
      return { data: output, stats, warnings };
    }

    for(let col = bounds.startCol; col <= bounds.endCol; col += 1){
      if(bounds.protectedColsSet.has(col)){
        continue;
      }
      const values = [];
      for(let row = bounds.startRow; row <= bounds.endRow; row += 1){
        const sourceRow = Array.isArray(input[row]) ? input[row] : [];
        const raw = sourceRow[col];
        if(shouldSkipCell(row, col, raw, bounds, options)){
          continue;
        }
        const numeric = toFiniteNumber(raw);
        if(numeric === null){
          continue;
        }
        values.push(numeric);
      }
      if(!values.length){
        continue;
      }
      const center = computeCenter(values);
      if(!Number.isFinite(center)){
        continue;
      }
      let std = 0;
      if(normalize){
        let mean = 0;
        for(let i = 0; i < values.length; i += 1){
          mean += values[i];
        }
        mean /= values.length;
        for(let i = 0; i < values.length; i += 1){
          const delta = values[i] - mean;
          std += delta * delta;
        }
        std = values.length > 1 ? Math.sqrt(std / (values.length - 1)) : 0;
        if(!(std > 0)){
          warnings.push(`Column ${col + 1} has zero variance; skipped normalization.`);
        }
      }
      for(let row = bounds.startRow; row <= bounds.endRow; row += 1){
        const sourceRow = Array.isArray(input[row]) ? input[row] : [];
        const targetRow = Array.isArray(output[row]) ? output[row] : [];
        const raw = sourceRow[col];
        if(shouldSkipCell(row, col, raw, bounds, options)){
          continue;
        }
        const numeric = toFiniteNumber(raw);
        if(numeric === null){
          stats.skippedCells += 1;
          continue;
        }
        stats.numericCells += 1;
        let next = numeric - center;
        if(normalize){
          if(!(std > 0)){
            stats.skippedCells += 1;
            continue;
          }
          next = next / std;
        }
        targetRow[col] = next;
        stats.changedCells += 1;
        output[row] = targetRow;
      }
    }
    return { data: output, stats, warnings };
  }

  function applyTransform(matrix, transformSpec, options){
    const spec = normalizeTransformSpec(transformSpec);
    const shape = matrixShape(matrix);
    const warnings = [];
    let result = null;

    try{
      if(spec.type === 'identity'){
        result = {
          data: cloneMatrix(Array.isArray(matrix) ? matrix : []),
          stats: { changedCells: 0, skippedCells: 0, numericCells: 0 },
          warnings: []
        };
      }else if(spec.type === 'scale'){
        result = runPointwiseTransform(matrix, spec, options, value => value * spec.factor);
      }else if(spec.type === 'divide'){
        if(!(spec.divisor !== 0)){
          throw new Error('Divisor must be non-zero.');
        }
        result = runPointwiseTransform(matrix, spec, options, value => value / spec.divisor);
      }else if(spec.type === 'add'){
        result = runPointwiseTransform(matrix, spec, options, value => value + spec.value);
      }else if(spec.type === 'subtract'){
        result = runPointwiseTransform(matrix, spec, options, value => value - spec.value);
      }else if(spec.type === 'log'){
        result = runPointwiseTransform(matrix, spec, options, value => {
          const adjusted = value + spec.pseudoCount;
          if(!(adjusted > 0)){
            return null;
          }
          return Math.log(adjusted) / Math.log(spec.base);
        });
      }else if(spec.type === 'custom'){
        const evaluator = compileCustomExpression(spec.expression);
        result = runPointwiseTransform(matrix, spec, options, value => evaluator(value));
      }else if(spec.type === 'cpm'){
        result = runCpmTransform(matrix, spec, options);
      }else if(spec.type === 'centerRows'
        || spec.type === 'centerColumns'
        || spec.type === 'normalizeRows'
        || spec.type === 'normalizeColumns'){
        result = runCenterOrNormalizeTransform(matrix, spec, options);
      }else{
        throw new Error(`Unsupported transform type "${spec.type}".`);
      }
    }catch(err){
      const message = err?.message || String(err);
      debugLog('transform failed', { type: spec.type, message });
      return {
        ok: false,
        error: message,
        spec,
        data: cloneMatrix(Array.isArray(matrix) ? matrix : []),
        summary: summarizeResult(spec, shape, { changedCells: 0, skippedCells: 0, numericCells: 0 }, [message])
      };
    }

    if(Array.isArray(result?.warnings) && result.warnings.length){
      warnings.push(...result.warnings);
    }
    const summary = summarizeResult(spec, shape, result?.stats || { changedCells: 0, skippedCells: 0, numericCells: 0 }, warnings);
    debugLog('transform applied', summary);
    return {
      ok: true,
      spec,
      data: result?.data || cloneMatrix(Array.isArray(matrix) ? matrix : []),
      stats: result?.stats || { changedCells: 0, skippedCells: 0, numericCells: 0 },
      warnings,
      summary
    };
  }

  function applyPipeline(matrix, transformSpecs, options){
    const specs = Array.isArray(transformSpecs) ? transformSpecs : [];
    let current = Array.isArray(matrix) ? matrix : [];
    const steps = [];
    for(let i = 0; i < specs.length; i += 1){
      const step = applyTransform(current, specs[i], options);
      steps.push(step);
      if(!step.ok){
        return {
          ok: false,
          data: step.data,
          steps
        };
      }
      current = step.data;
    }
    return {
      ok: true,
      data: cloneMatrix(current),
      steps
    };
  }

  dataTransforms.toFiniteNumber = toFiniteNumber;
  dataTransforms.cloneMatrix = cloneMatrix;
  dataTransforms.matrixShape = matrixShape;
  dataTransforms.normalizeTransformSpec = normalizeTransformSpec;
  dataTransforms.compileCustomExpression = compileCustomExpression;
  dataTransforms.applyTransform = applyTransform;
  dataTransforms.applyPipeline = applyPipeline;
})(window);
