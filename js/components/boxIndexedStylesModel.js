(function attachBoxIndexedStylesModel(global) {
  'use strict';

  const indexedStyleFields = Object.freeze([
    'fillColors',
    'borderColors',
    'traceShapeStyles',
    'pointStyles',
    'summaryStyles'
  ]);

  function clonePlainValue(value) {
    if (value == null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeIndex(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function reorderValues(source, permutationOldByNew) {
    const permutation = Array.isArray(permutationOldByNew) ? permutationOldByNew : [];
    if (Array.isArray(source)) {
      const output = [];
      permutation.forEach((oldIndex, newIndex) => {
        if (oldIndex < source.length) output[newIndex] = source[oldIndex];
      });
      return output;
    }
    const input = source && typeof source === 'object' ? source : {};
    const output = {};
    Object.keys(input).forEach(key => {
      if (!Number.isInteger(Number(key)) || Number(key) < 0) output[key] = input[key];
    });
    permutation.forEach((oldIndex, newIndex) => {
      if (Object.prototype.hasOwnProperty.call(input, oldIndex)) output[newIndex] = input[oldIndex];
    });
    return output;
  }

  function spliceValues(source, startIndex, deleteCount, insertCount) {
    const start = normalizeIndex(startIndex);
    const removeCount = normalizeIndex(deleteCount);
    const addCount = normalizeIndex(insertCount);
    if (Array.isArray(source)) {
      const output = source.slice();
      while (output.length < start) output.push('');
      output.splice(start, removeCount, ...Array.from({ length: addCount }, () => ''));
      return output;
    }
    const input = source && typeof source === 'object' ? source : {};
    const output = {};
    Object.keys(input).forEach(key => {
      const numericKey = Number(key);
      if (!Number.isInteger(numericKey) || numericKey < 0) {
        output[key] = input[key];
      } else if (numericKey < start) {
        output[numericKey] = input[key];
      } else if (numericKey >= start + removeCount) {
        output[numericKey - removeCount + addCount] = input[key];
      }
    });
    return output;
  }

  function captureValuesSlice(source, startIndex, count) {
    const start = normalizeIndex(startIndex);
    const length = normalizeIndex(count);
    if (Array.isArray(source)) return source.slice(start, start + length);
    const input = source && typeof source === 'object' ? source : {};
    const output = {};
    Object.keys(input).forEach(key => {
      const numericKey = Number(key);
      if (Number.isInteger(numericKey) && numericKey >= start && numericKey < start + length) {
        output[numericKey - start] = clonePlainValue(input[key]);
      }
    });
    return output;
  }

  function restoreValuesSlice(source, startIndex, snapshot) {
    const start = normalizeIndex(startIndex);
    if (Array.isArray(source)) {
      const output = source.slice();
      const values = Array.isArray(snapshot) ? snapshot : [];
      values.forEach((value, offset) => { output[start + offset] = value; });
      return output;
    }
    const output = source && typeof source === 'object' ? { ...source } : {};
    const values = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
    Object.keys(values).forEach(key => {
      const offset = Number(key);
      if (Number.isInteger(offset) && offset >= 0) output[start + offset] = clonePlainValue(values[key]);
    });
    return output;
  }

  function mapBundle(bundle, transform, args) {
    const source = bundle && typeof bundle === 'object' ? bundle : {};
    const result = {};
    indexedStyleFields.forEach(field => {
      const value = source[field];
      const normalized = field === 'fillColors' || field === 'borderColors'
        ? (Array.isArray(value) ? value : [])
        : (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      result[field] = transform(normalized, ...args);
    });
    return result;
  }

  const model = Object.freeze({
    fields: indexedStyleFields,
    reorderValues,
    spliceValues,
    captureValuesSlice,
    restoreValuesSlice,
    reorder(bundle, permutationOldByNew) {
      return mapBundle(bundle, reorderValues, [permutationOldByNew]);
    },
    splice(bundle, startIndex, deleteCount, insertCount) {
      return mapBundle(bundle, spliceValues, [startIndex, deleteCount, insertCount]);
    },
    captureSlice(bundle, startIndex, count) {
      return mapBundle(bundle, captureValuesSlice, [startIndex, count]);
    },
    restoreSlice(bundle, startIndex, snapshot) {
      const source = bundle && typeof bundle === 'object' ? bundle : {};
      const saved = snapshot && typeof snapshot === 'object' ? snapshot : {};
      const result = {};
      indexedStyleFields.forEach(field => {
        const value = source[field];
        const normalized = field === 'fillColors' || field === 'borderColors'
          ? (Array.isArray(value) ? value : [])
          : (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
        result[field] = restoreValuesSlice(normalized, startIndex, saved[field]);
      });
      return result;
    }
  });

  const Components = global.Components = global.Components || {};
  let models = Components.__models;
  if (!models) {
    models = {};
    Object.defineProperty(Components, '__models', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: models
    });
  }
  models.boxIndexedStyles = model;

  if (typeof module === 'object' && module.exports) module.exports = model;
})(typeof window === 'object' ? window : globalThis);
