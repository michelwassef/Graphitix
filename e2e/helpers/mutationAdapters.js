(function(root, factory){
  const api = factory(root);
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.GraphitixMutationAdapters = api;
})(typeof window !== 'undefined' ? window : globalThis, function(global){
  'use strict';

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const pathKey = path => path.map(part => typeof part === 'number' ? `[${part}]` : part).join('.');
  const getAtPath = (object, path) => path.reduce((value, part) => value == null ? undefined : value[part], object);
  const setAtPath = (object, path, value) => {
    if(!object || typeof object !== 'object' || !Array.isArray(path) || !path.length) return false;
    let cursor = object;
    for(let index = 0; index < path.length - 1; index += 1){
      const part = path[index];
      const nextPart = path[index + 1];
      if(!cursor[part] || typeof cursor[part] !== 'object'){
        cursor[part] = typeof nextPart === 'number' ? [] : {};
      }
      cursor = cursor[part];
    }
    cursor[path[path.length - 1]] = clone(value);
    return true;
  };

  function normalizeComparable(value){
    if(value === null || value === undefined) return value;
    if(typeof value === 'boolean') return value;
    if(typeof value === 'number') return Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
    if(typeof value === 'string'){
      const trimmed = value.trim();
      if(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)){
        const numeric = Number(trimmed);
        if(Number.isFinite(numeric)) return Number(numeric.toPrecision(12));
      }
      if(/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed.toLowerCase();
      return value;
    }
    return value;
  }

  function equivalent(actual, expected){
    return same(normalizeComparable(actual), normalizeComparable(expected));
  }

  function applyLogicalParameterMutation(payload, parameter, value){
    setAtPath(payload, parameter.path, value);
    const key = pathKey(parameter.path);
    const isAlternative = !equivalent(value, parameter.before);
    if(/(?:^|\.)colorScheme$/i.test(key) && typeof global.Shared?.colorSchemes?.applyToPayload === 'function'){
      const themed = global.Shared.colorSchemes.applyToPayload(payload.type, payload, value);
      if(themed && typeof themed === 'object'){
        Object.keys(payload).forEach(payloadKey => delete payload[payloadKey]);
        Object.assign(payload, themed);
      }
      if(payload.type === 'scatter' && payload.config){ payload.config.colorSchemeUserOverride = true; }
    }
    if(payload.type === 'box' && /^config\.(?:fill|border|colors(?:\.|$)|borderColors(?:\.|$))/i.test(key)){
      payload.config.colorScheme = 'custom';
    }
    if(payload.type === 'box' && isAlternative && key === 'config.tableFormat' && value === 'grouped'){
      const groupedExample = global.Shared?.exampleDatasets?.get?.('box', 'grouped');
      if(Array.isArray(groupedExample?.data)){
        payload.data = clone(groupedExample.data);
        payload.config.grouped = {
          ...(payload.config.grouped || {}),
          replicatesPerGroup: Number(groupedExample.meta?.replicatesPerGroup) || 3
        };
      }
    }
    if(payload.type === 'scatter'){
      const labelMatch = key.match(/^config\.([xyz])Label$/i);
      if(labelMatch){
        payload.config.axisLabelModes = payload.config.axisLabelModes && typeof payload.config.axisLabelModes === 'object'
          ? payload.config.axisLabelModes
          : {};
        payload.config.axisLabelModes[labelMatch[1].toLowerCase()] = 'manual';
      }
      if(key === 'config.showErrorBars' && value === true){
        payload.config.showGroupedReplicatePoints = false;
      }
      if(key === 'config.dotSizeOverrideEnabled' && value === true){
        const currentSize = Number(payload.config.dotSize);
        payload.config.dotSizeOverrideRaw = Number.isFinite(currentSize) ? currentSize : 3;
      }
    }
    const rotationMatch = key.match(/^(.*\.rotation)\.(x|y|z)$/i);
    if(rotationMatch){
      const rotationPath = rotationMatch[1].split('.');
      const rotation = getAtPath(payload, rotationPath);
      // Quaternion is derived from the user-visible Euler rotation.
      // Removing it lets the component rebuild a coherent quaternion while only
      // the logical x/y/z parameter under test changes.
      if(rotation && typeof rotation === 'object') delete rotation.quaternion;
    }
    if(payload.type === 'line' && key === 'config.tableFormat'){
      payload.config.replicates = String(value).toLowerCase() === 'grouped'
        ? Math.max(2, Number(payload.config.replicates) || 2)
        : 1;
    }
    if(payload.type === 'heatmap' && key === 'config.showValues'){
      payload.config.showValuesUserOverride = true;
    }
    if(payload.type === 'heatmap' && isAlternative && key === 'config.filters.sdEnabled' && value === true){
      payload.config.filters.sdThreshold = 0;
    }
    if(payload.type === 'heatmap' && isAlternative && key === 'config.filters.sdThreshold'){
      payload.config.filters.sdEnabled = true;
    }
    if(payload.type === 'heatmap' && isAlternative && key === 'config.filters.absEnabled' && value === true){
      payload.config.filters.absValue = 0.5;
    }
    if(payload.type === 'heatmap' && isAlternative && /^config\.filters\.abs(?:Count|Value)$/i.test(key)){
      payload.config.filters.absEnabled = true;
    }
    if(payload.type === 'surface'){
      const settingsAlias = key.match(/^config\.settings\.(backgroundColor|colorScheme|textColor)$/i);
      if(settingsAlias){
        const setting = settingsAlias[1];
        payload.config[setting] = clone(value);
        payload.config.settings = {
          ...(payload.config.settings && typeof payload.config.settings === 'object' ? payload.config.settings : {}),
          [setting]: clone(value)
        };
      }
    }
    if(payload.type === 'roc' && isAlternative && key === 'config.positiveClass'){
      payload.config.negativeClass = parameter.before;
    }
    if(payload.type === 'roc' && isAlternative && key === 'config.negativeClass'){
      payload.config.positiveClass = parameter.before;
    }
    return payload;
  }

  function buildParameterVariantPayload(baseline, parameters, valueKey){
    const payload = clone(baseline);
    parameters.forEach(parameter => {
      applyLogicalParameterMutation(payload, parameter, parameter[valueKey]);
    });
    return payload;
  }

  return Object.freeze({
    applyLogicalParameterMutation,
    buildParameterVariantPayload
  });
});
