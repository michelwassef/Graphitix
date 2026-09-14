(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const DEFAULT_SIGNIFICANT_DIGITS = 6;
  const DEFAULT_DECIMALS = 4;
  const DEFAULT_THRESHOLD = 0.0001;
  const DEFAULT_SCIENTIFIC = false;
  const MAX_DECIMAL_PLACES = 20;
  const SUPERSCRIPT = Object.freeze({
    '-': '⁻',
    '+': '⁺',
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹'
  });

  function clampSignificantDigits(value){
    const coerced = Math.floor(Number(value));
    return Number.isFinite(coerced) && coerced >= 1 && coerced <= 15
      ? coerced
      : DEFAULT_SIGNIFICANT_DIGITS;
  }

  function normalizeExponentText(value){
    if(typeof value !== 'string') return value;
    return value
      .replace('E', 'e')
      .replace(/e\+/, 'e')
      .replace(/e([+-])0+(\d+)/, (_, sign, digits) => `e${sign}${digits}`);
  }

  function finalizeNumberString(value){
    if(typeof value !== 'string') return value;
    let result = value;
    const exponential = result.match(/^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?\d+$/);
    if(exponential){
      const parts = result.split(/[eE]/);
      let mantissa = parts[0];
      if(mantissa.includes('.')){
        mantissa = mantissa.replace(/0+$/, '').replace(/\.$/, '');
        if(mantissa === '' || mantissa === '+' || mantissa === '-'){
          mantissa = `${mantissa}0`;
        }
      }
      return normalizeExponentText(`${mantissa}e${parts[1]}`);
    }
    if(!/[eE]/.test(result) && result.includes('.')){
      result = result.replace(/0+$/, '').replace(/\.$/, '') || '0';
    }
    return normalizeExponentText(result);
  }

  function formatFixedTrimmed(value, decimals){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return String(value);
    const safeDecimals = Number.isInteger(decimals) && decimals >= 0 ? decimals : DEFAULT_DECIMALS;
    return numeric
      .toFixed(safeDecimals)
      .replace(/(\.\d*?[1-9])0+$/, '$1')
      .replace(/\.0+$/, '')
      .replace(/^-0$/, '0');
  }

  function toNumericValue(value){
    if(value === null || value === undefined || typeof value === 'boolean' || typeof value === 'symbol'){
      return NaN;
    }
    if(typeof value !== 'number' && typeof value !== 'string' && !(value instanceof Number)){
      return NaN;
    }
    if(typeof value === 'string' && value.trim() === ''){
      return NaN;
    }
    try{
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : NaN;
    }catch(_err){
      return NaN;
    }
  }

  function decimalPlacesForPValue(value, minimumDecimals, significantDigits){
    const numeric = Math.abs(Number(value));
    if(!Number.isFinite(numeric) || numeric === 0){
      return minimumDecimals;
    }
    const exponent = Math.floor(Math.log10(numeric));
    const significantPlaces = exponent < 0
      ? -exponent + significantDigits - 1
      : significantDigits - 1 - exponent;
    return Math.max(minimumDecimals, significantPlaces);
  }

  function formatDecimalBoundary(value, minimumDecimals, significantDigits){
    const decimalPlaces = decimalPlacesForPValue(value, minimumDecimals, significantDigits);
    return formatFixedTrimmed(value, Math.min(MAX_DECIMAL_PLACES, decimalPlaces));
  }

  function toSuperscript(value){
    return String(value).split('').map(character => SUPERSCRIPT[character] || character).join('');
  }

  function formatScientific(value, options = {}){
    const numeric = toNumericValue(value);
    if(!Number.isFinite(numeric)) return String(value);
    if(numeric === 0) return '0';
    const fractionalDigits = Number.isInteger(options.fractionalDigits) && options.fractionalDigits >= 0
      ? Math.min(15, options.fractionalDigits)
      : Math.max(0, clampSignificantDigits(options.significantDigits) - 1);
    const chartFormatter = Shared.chartStyle?.formatScientific;
    if(typeof chartFormatter === 'function'){
      return chartFormatter(numeric, {
        forceScientific: true,
        maxDecimals: fractionalDigits,
        mantissaMaxDecimals: fractionalDigits,
        spaceAroundMultiplication: true,
        omitUnitMantissa: false
      });
    }
    const exponential = numeric.toExponential(fractionalDigits);
    const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))e([+-]?\d+)$/i.exec(exponential);
    if(!match) return exponential;
    const rawMantissa = finalizeNumberString(match[1].replace(/^\+/, ''));
    const mantissa = rawMantissa.startsWith('-')
      ? `−${rawMantissa.slice(1)}`
      : rawMantissa;
    return `${mantissa} × 10${toSuperscript(String(Number(match[2])))}`;
  }

  function createDisplayString(text, rawValue, metadata = {}){
    const label = new String(String(text == null ? '' : text));
    const numeric = toNumericValue(rawValue);
    const sourceOperator = typeof metadata.operator === 'string' && metadata.operator ? metadata.operator : '=';
    const displayOperator = typeof metadata.displayOperator === 'string' && metadata.displayOperator
      ? metadata.displayOperator
      : sourceOperator;
    Object.defineProperties(label, {
      __statsPValueRaw: { value: Number.isFinite(numeric) ? numeric : NaN, enumerable: false },
      __statsPValueOperator: { value: sourceOperator, enumerable: false },
      __statsPValueDisplayOperator: { value: displayOperator, enumerable: false },
      __statsPValueScientific: { value: metadata.scientific === true, enumerable: false },
      __statsPValueThresholded: { value: metadata.thresholded === true, enumerable: false }
    });
    return label;
  }

  function format(value, options = {}){
    const numeric = toNumericValue(value);
    if(!Number.isFinite(numeric)){
      return createDisplayString('unavailable (not estimable)', NaN, {
        scientific: options.forceScientific === true || options.scientific === true,
        operator: '=',
        displayOperator: '=',
        thresholded: false
      });
    }
    const digits = clampSignificantDigits(options.significantDigits);
    const decimals = Number.isInteger(options.decimals) && options.decimals >= 0
      ? options.decimals
      : DEFAULT_DECIMALS;
    const threshold = Number.isFinite(options.decimalThreshold) && options.decimalThreshold > 0
      ? options.decimalThreshold
      : DEFAULT_THRESHOLD;
    const scientific = options.forceScientific === true
      || options.scientific === true
      || (options.scientific !== false && DEFAULT_SCIENTIFIC);
    if(numeric < 0 || numeric > 1){
      return createDisplayString('unavailable (invalid probability)', numeric, {
        scientific,
        operator: '=',
        displayOperator: '=',
        thresholded: false
      });
    }
    const bounded = Math.max(0, Math.min(1, numeric));
    let text;
    let thresholded = false;
    let displayOperator = '=';
    if(scientific){
      if(bounded === 0){
        // This is a display floor only; the source value and source operator
        // remain available through the returned String object's metadata.
        text = `<${formatScientific(threshold, { significantDigits: digits })}`;
        thresholded = true;
        displayOperator = '<';
      }else{
        text = formatScientific(bounded, { significantDigits: digits });
      }
    }else if(bounded === 0 || (options.displayFloor === true && bounded < threshold)){
      // A display floor is opt-in for compact projections. Detailed decimal
      // output retains every representable non-zero probability instead of
      // silently replacing it with a threshold.
      text = `<${formatDecimalBoundary(threshold, decimals, digits)}`;
      thresholded = true;
      displayOperator = '<';
    }else{
      const decimalPlaces = decimalPlacesForPValue(bounded, decimals, digits);
      if(decimalPlaces > MAX_DECIMAL_PLACES){
        // Decimal mode remains readable at extreme magnitudes. Scientific
        // mode is available when the exact tiny value must be shown.
        text = `<${formatDecimalBoundary(threshold, decimals, digits)}`;
        thresholded = true;
        displayOperator = '<';
      }else{
        text = formatFixedTrimmed(bounded, decimalPlaces);
      }
    }
    return createDisplayString(scientific ? String(text) : finalizeNumberString(String(text)), bounded, {
      scientific,
      thresholded,
      operator: '=',
      displayOperator
    });
  }

  const api = Shared.pValueFormatter = Shared.pValueFormatter || {};
  api.format = format;
  api.formatScientific = formatScientific;
  api.formatFixedTrimmed = formatFixedTrimmed;
  api.toNumericValue = toNumericValue;
  api.createDisplayString = createDisplayString;
  api.DEFAULT_THRESHOLD = DEFAULT_THRESHOLD;
  api.DEFAULT_SIGNIFICANT_DIGITS = DEFAULT_SIGNIFICANT_DIGITS;

  Shared.formatPValue = format;
  const formatters = Shared.formatters = Shared.formatters || {};
  formatters.formatPValue = format;
  if(typeof formatters.formatScientificNumber !== 'function'){
    formatters.formatScientificNumber = formatScientific;
  }
})(typeof window !== 'undefined' ? window : globalThis);
