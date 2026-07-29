(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const visualProjection = Shared.visualProjection = Shared.visualProjection || {};
  const TARGET_ATTR = 'data-graphitix-visual-target';
  const ATTRIBUTE_MAP = Object.freeze({
    fill: 'fill',
    fillOpacity: 'fill-opacity',
    opacity: 'opacity',
    stroke: 'stroke',
    strokeDasharray: 'stroke-dasharray',
    strokeOpacity: 'stroke-opacity',
    strokeWidth: 'stroke-width'
  });

  function normalizeToken(value){
    return String(value == null ? '' : value).trim();
  }

  function normalizeFactor(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 1;
  }

  function normalizeProperties(value){
    const source = Array.isArray(value) ? value : [];
    return source
      .map(normalizeToken)
      .filter(property => Object.prototype.hasOwnProperty.call(ATTRIBUTE_MAP, property));
  }

  function normalizeNodes(nodes){
    if(!nodes){
      return [];
    }
    if(nodes.nodeType === 1){
      return [nodes];
    }
    try{
      return Array.from(nodes).filter(node => node?.nodeType === 1);
    }catch(_err){
      return [];
    }
  }

  function isTargetFor(node, descriptor){
    if(!node || node.getAttribute?.(TARGET_ATTR) !== '1'){
      return false;
    }
    const dataset = node.dataset || {};
    if(dataset.visualComponent !== descriptor.component
      || dataset.visualChannel !== descriptor.channel
      || dataset.visualOwnerTabId !== descriptor.tabId){
      return false;
    }
    return !descriptor.key || dataset.visualKey === descriptor.key;
  }

  visualProjection.bind = function bind(nodes, options = {}){
    const component = normalizeToken(options.component);
    const channel = normalizeToken(options.channel);
    const tabId = normalizeToken(options.tabId);
    const key = normalizeToken(options.key);
    const targets = normalizeNodes(nodes);
    if(!component || !channel || !tabId || !targets.length){
      return false;
    }
    const strokeWidthBase = Number(options.strokeWidthBase);
    const renderedStrokeWidth = Number(options.renderedStrokeWidth);
    const strokeWidthFactor = Number.isFinite(strokeWidthBase)
      && strokeWidthBase > 0
      && Number.isFinite(renderedStrokeWidth)
      ? Math.max(0, renderedStrokeWidth / strokeWidthBase)
      : normalizeFactor(options.strokeWidthFactor);
    const properties = normalizeProperties(options.properties);
    const strokeWidthMinimum = Number(options.strokeWidthMinimum);
    const strokeWidthZeroFallback = Number(options.strokeWidthZeroFallback);
    targets.forEach(node => {
      node.setAttribute(TARGET_ATTR, '1');
      node.dataset.visualComponent = component;
      node.dataset.visualChannel = channel;
      node.dataset.visualOwnerTabId = tabId;
      if(key){
        node.dataset.visualKey = key;
      }else{
        delete node.dataset.visualKey;
      }
      node.dataset.visualStrokeWidthFactor = String(strokeWidthFactor);
      if(Number.isFinite(strokeWidthMinimum) && strokeWidthMinimum >= 0){
        node.dataset.visualStrokeWidthMinimum = String(strokeWidthMinimum);
      }else{
        delete node.dataset.visualStrokeWidthMinimum;
      }
      if(Number.isFinite(strokeWidthZeroFallback) && strokeWidthZeroFallback >= 0){
        node.dataset.visualStrokeWidthZeroFallback = String(strokeWidthZeroFallback);
      }else{
        delete node.dataset.visualStrokeWidthZeroFallback;
      }
      if(properties.length){
        node.dataset.visualProperties = properties.join(',');
      }else{
        delete node.dataset.visualProperties;
      }
    });
    return true;
  };

  visualProjection.collect = function collect(root, options = {}){
    if(!root || typeof root.querySelectorAll !== 'function'){
      return [];
    }
    const descriptor = {
      component: normalizeToken(options.component),
      channel: normalizeToken(options.channel),
      tabId: normalizeToken(options.tabId),
      key: normalizeToken(options.key)
    };
    if(!descriptor.component || !descriptor.channel || !descriptor.tabId){
      return [];
    }
    return Array.from(root.querySelectorAll(`[${TARGET_ATTR}="1"]`))
      .filter(node => isTargetFor(node, descriptor));
  };

  visualProjection.apply = function apply(root, options = {}){
    const targets = visualProjection.collect(root, options);
    if(!targets.length){
      return false;
    }
    const attributes = options.attributes && typeof options.attributes === 'object'
      ? options.attributes
      : {};
    const operations = [];
    for(const [property, rawValue] of Object.entries(attributes)){
      const attribute = ATTRIBUTE_MAP[property];
      if(!attribute){
        return false;
      }
      const propertyOperations = [];
      targets.forEach(node => {
        const allowed = normalizeToken(node.dataset?.visualProperties);
        if(allowed && !allowed.split(',').includes(property)){
          return;
        }
        let value = rawValue;
        if(property === 'strokeWidth' && value != null){
          const numeric = Number(value);
          if(!Number.isFinite(numeric) || numeric < 0){
            propertyOperations.length = 0;
            return;
          }
          const minimum = Number(node.dataset?.visualStrokeWidthMinimum);
          const zeroFallback = Number(node.dataset?.visualStrokeWidthZeroFallback);
          value = numeric === 0 && Number.isFinite(zeroFallback) && zeroFallback >= 0
            ? zeroFallback
            : numeric * normalizeFactor(node.dataset?.visualStrokeWidthFactor);
          if(Number.isFinite(minimum) && minimum >= 0){
            value = Math.max(minimum, value);
          }
        }
        propertyOperations.push({ node, attribute, value });
      });
      if(rawValue != null && !propertyOperations.length){
        return false;
      }
      operations.push(...propertyOperations);
    }
    if(!operations.length){
      return false;
    }
    operations.forEach(operation => {
      if(operation.value === null || operation.value === undefined || operation.value === ''){
        operation.node.removeAttribute(operation.attribute);
      }else{
        operation.node.setAttribute(operation.attribute, String(operation.value));
      }
    });
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
