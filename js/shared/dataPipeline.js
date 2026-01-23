// Unified data processing pipeline with lazy evaluation
(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const DataPipeline = Shared.DataPipeline = Shared.DataPipeline || {};

  const debugState = Shared.__debugState || { enabled: false };
  Shared.__debugState = debugState;

  if(typeof Shared.setDebugLogging !== 'function'){
    Shared.setDebugLogging = function setDebugLogging(enabled){
      debugState.enabled = !!enabled;
      return debugState.enabled;
    };
  }

  if(typeof Shared.enableDebugLogging !== 'function'){
    Shared.enableDebugLogging = function enableDebugLogging(){
      return Shared.setDebugLogging(true);
    };
  }

  if(typeof Shared.disableDebugLogging !== 'function'){
    Shared.disableDebugLogging = function disableDebugLogging(){
      return Shared.setDebugLogging(false);
    };
  }

  if(typeof Shared.isDebugEnabled !== 'function'){
    Shared.isDebugEnabled = function isDebugEnabled(){
      return !!debugState.enabled;
    };
  }

  function logDebug(message, payload){
    if(Shared.isDebugEnabled && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      if(typeof payload === 'undefined'){
        console.debug(message);
      }else{
        console.debug(message, payload);
      }
    }
  }

  const objectIds = typeof WeakMap === 'function' ? new WeakMap() : null;
  let objectIdCounter = 0;

  function getObjectId(obj){
    if(!objectIds || !obj || (typeof obj !== 'object' && typeof obj !== 'function')){
      objectIdCounter += 1;
      return objectIdCounter;
    }
    if(objectIds.has(obj)){
      return objectIds.get(obj);
    }
    objectIdCounter += 1;
    objectIds.set(obj, objectIdCounter);
    return objectIdCounter;
  }

  function signatureFor(value){
    if(value === null) return 'null';
    if(typeof value === 'undefined') return 'undefined';

    const type = typeof value;
    if(type === 'string'){
      const len = value.length;
      if(len <= 64){
        return `string:${len}:${value}`;
      }
      return `string:${len}:${value.slice(0, 32)}:${value.slice(-16)}`;
    }
    if(type === 'number' || type === 'boolean'){
      return `${type}:${value}`;
    }
    if(type === 'symbol'){
      return `symbol:${value.toString()}`;
    }
    if(type === 'function'){
      return `function:${value.name || 'anonymous'}`;
    }

    if(type === 'object'){
      if(typeof value.signature !== 'undefined'){
        return `signature:${value.signature}`;
      }
      if(typeof value.getSignature === 'function'){
        try{
          return `signature:${value.getSignature()}`;
        }catch(err){
          console.warn('DataPipeline signature provider failed', err);
        }
      }

      if(Array.isArray(value)){
        return `array:${getObjectId(value)}:${value.length}`;
      }
      if(value instanceof Map){
        return `map:${getObjectId(value)}:${value.size}`;
      }
      if(value instanceof Set){
        return `set:${getObjectId(value)}:${value.size}`;
      }
      if(value instanceof Date){
        return `date:${value.getTime()}`;
      }
      if(ArrayBuffer.isView && ArrayBuffer.isView(value)){
        return `typed:${value.constructor?.name || 'typed'}:${value.byteLength}`;
      }
      return `object:${getObjectId(value)}`;
    }

    return `unknown:${String(value)}`;
  }

  DataPipeline.signatureFor = signatureFor;

  function now(){
    if(global.performance && typeof global.performance.now === 'function'){
      return global.performance.now();
    }
    return Date.now();
  }

  const pipelineDefaults = {
    cache: true,
    label: 'pipeline',
    treatStringsAsIterable: false
  };

  function normalizeIterable(data, options){
    if(data === null || typeof data === 'undefined'){
      return [];
    }
    if(Array.isArray(data)){
      return data;
    }
    if(typeof data === 'string'){
      return options.treatStringsAsIterable ? data : [data];
    }
    if(data && typeof data[Symbol.iterator] === 'function'){
      return data;
    }
    if(typeof data === 'object'){
      return Object.values(data);
    }
    return [data];
  }

  function createIterable(iteratorFactory){
    return {
      [Symbol.iterator]: iteratorFactory
    };
  }

  function applyStep(iterable, step){
    switch(step.type){
      case 'map':
        return createIterable(function*(){
          let index = 0;
          for(const item of iterable){
            yield step.fn(item, index, step.meta);
            index += 1;
          }
        });
      case 'filter':
        return createIterable(function*(){
          let index = 0;
          for(const item of iterable){
            if(step.fn(item, index, step.meta)){
              yield item;
            }
            index += 1;
          }
        });
      case 'flatMap':
        return createIterable(function*(){
          let index = 0;
          for(const item of iterable){
            const mapped = step.fn(item, index, step.meta);
            if(mapped === null || typeof mapped === 'undefined'){
              index += 1;
              continue;
            }
            if(typeof mapped === 'string'){
              yield mapped;
            }else if(mapped && typeof mapped[Symbol.iterator] === 'function'){
              for(const inner of mapped){
                yield inner;
              }
            }else{
              yield mapped;
            }
            index += 1;
          }
        });
      case 'tap':
        return createIterable(function*(){
          let index = 0;
          for(const item of iterable){
            step.fn(item, index, step.meta);
            yield item;
            index += 1;
          }
        });
      case 'take':
        return createIterable(function*(){
          let taken = 0;
          const limit = Math.max(0, step.count);
          for(const item of iterable){
            if(taken >= limit){
              break;
            }
            yield item;
            taken += 1;
          }
        });
      case 'skip':
        return createIterable(function*(){
          let skipped = 0;
          const limit = Math.max(0, step.count);
          for(const item of iterable){
            if(skipped < limit){
              skipped += 1;
              continue;
            }
            yield item;
          }
        });
      case 'slice':
        return createIterable(function*(){
          let index = 0;
          const start = Math.max(0, step.start || 0);
          const end = typeof step.end === 'number' ? step.end : Infinity;
          for(const item of iterable){
            if(index >= end){
              break;
            }
            if(index >= start){
              yield item;
            }
            index += 1;
          }
        });
      case 'unique':
        return createIterable(function*(){
          const seen = new Set();
          let index = 0;
          for(const item of iterable){
            const key = step.key ? step.key(item, index, step.meta) : item;
            if(!seen.has(key)){
              seen.add(key);
              yield item;
            }
            index += 1;
          }
        });
      case 'compact':
        return createIterable(function*(){
          let index = 0;
          const includeNull = step.includeNull === true;
          for(const item of iterable){
            if(typeof item !== 'undefined' && (includeNull || item !== null)){
              yield item;
            }
            index += 1;
          }
        });
      case 'pipe':
        return step.transform(iterable, step.meta) || iterable;
      default:
        return iterable;
    }
  }

  function applySteps(iterable, steps){
    let current = iterable;
    for(let i = 0; i < steps.length; i += 1){
      current = applyStep(current, steps[i]);
    }
    return current;
  }

  function resolveSource(source, options){
    let data = source;
    let signature = null;
    let metadata = null;

    if(typeof source === 'function'){
      const result = source();
      if(result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'data')){
        data = result.data;
        signature = result.signature;
        metadata = result.meta || null;
      }else{
        data = result;
      }
    }else if(source && typeof source === 'object'){
      if(typeof source.getData === 'function'){
        data = source.getData();
        if(typeof source.getSignature === 'function'){
          signature = source.getSignature(data);
        }else if(typeof source.signature !== 'undefined'){
          signature = source.signature;
        }
      }else if(Object.prototype.hasOwnProperty.call(source, 'data')){
        data = source.data;
        signature = source.signature;
      }
    }

    if(typeof options.signature === 'function'){
      signature = options.signature(data, source, signature);
    }

    if(signature === null || typeof signature === 'undefined'){
      signature = signatureFor(data);
    }

    return { data, signature, meta: metadata };
  }

  let pipelineCounter = 0;

  DataPipeline.create = function create(source, options = {}){
    const config = Object.assign({}, pipelineDefaults, options);
    pipelineCounter += 1;
    const pipelineId = pipelineCounter;
    const label = config.label || `pipeline-${pipelineId}`;
    const steps = [];
    const cache = {
      signature: null,
      results: new Map()
    };

    function invalidate(reason){
      cache.signature = null;
      cache.results.clear();
      if(reason){
        logDebug('Debug: DataPipeline cache invalidated', { label, reason });
      }
    }

    function addStep(type, fn, meta, extra){
      const step = Object.assign({ type, fn, meta }, extra || {});
      steps.push(step);
      logDebug('Debug: DataPipeline step added', { label, type, stepCount: steps.length });
      return api;
    }

    function evaluate(terminal, cacheKey){
      const startedAt = now();
      const resolved = resolveSource(source, config);
      const signature = resolved.signature;
      const cacheEnabled = config.cache !== false;

      if(cacheEnabled){
        if(cache.signature !== signature){
          cache.signature = signature;
          cache.results.clear();
          logDebug('Debug: DataPipeline cache cleared', { label, signature });
        }
        if(cacheKey && cache.results.has(cacheKey)){
          logDebug('Debug: DataPipeline cache hit', { label, cacheKey, signature });
          return cache.results.get(cacheKey);
        }
      }

      const iterable = applySteps(normalizeIterable(resolved.data, config), steps);
      const result = terminal(iterable, resolved, signature);

      if(cacheEnabled && cacheKey){
        cache.results.set(cacheKey, result);
      }

      const endedAt = now();
      logDebug('Debug: DataPipeline evaluated', {
        label,
        cacheKey,
        signature,
        steps: steps.length,
        duration: endedAt - startedAt
      });
      return result;
    }

    const api = {
      map(fn, meta){
        if(typeof fn !== 'function'){
          console.warn('DataPipeline.map requires a function', { label });
          return api;
        }
        return addStep('map', fn, meta);
      },
      filter(fn, meta){
        if(typeof fn !== 'function'){
          console.warn('DataPipeline.filter requires a function', { label });
          return api;
        }
        return addStep('filter', fn, meta);
      },
      flatMap(fn, meta){
        if(typeof fn !== 'function'){
          console.warn('DataPipeline.flatMap requires a function', { label });
          return api;
        }
        return addStep('flatMap', fn, meta);
      },
      tap(fn, meta){
        if(typeof fn !== 'function'){
          console.warn('DataPipeline.tap requires a function', { label });
          return api;
        }
        return addStep('tap', fn, meta);
      },
      take(count, meta){
        return addStep('take', function noop(){}, meta, { count: Number(count) || 0 });
      },
      skip(count, meta){
        return addStep('skip', function noop(){}, meta, { count: Number(count) || 0 });
      },
      slice(start, end, meta){
        return addStep('slice', function noop(){}, meta, { start, end });
      },
      unique(key, meta){
        return addStep('unique', function noop(){}, meta, { key });
      },
      compact(options, meta){
        const opts = typeof options === 'object' && options ? options : {};
        return addStep('compact', function noop(){}, meta, { includeNull: opts.includeNull === true });
      },
      pipe(transform, meta){
        if(typeof transform !== 'function'){
          console.warn('DataPipeline.pipe requires a function', { label });
          return api;
        }
        steps.push({
          type: 'pipe',
          transform,
          meta
        });
        logDebug('Debug: DataPipeline step added', { label, type: 'pipe', stepCount: steps.length });
        return api;
      },
      toArray(){
        return evaluate(function(iterable){
          return Array.from(iterable);
        }, 'array');
      },
      toSet(){
        return evaluate(function(iterable){
          return new Set(iterable);
        }, 'set');
      },
      forEach(fn){
        if(typeof fn !== 'function'){
          console.warn('DataPipeline.forEach requires a function', { label });
          return undefined;
        }
        return evaluate(function(iterable){
          let index = 0;
          for(const item of iterable){
            fn(item, index);
            index += 1;
          }
        }, null);
      },
      reduce(fn, initial){
        if(typeof fn !== 'function'){
          console.warn('DataPipeline.reduce requires a function', { label });
          return undefined;
        }
        const hasInitial = arguments.length > 1;
        return evaluate(function(iterable){
          let index = 0;
          let acc = initial;
          let hasAcc = hasInitial;
          for(const item of iterable){
            if(!hasAcc){
              acc = item;
              hasAcc = true;
            }else{
              acc = fn(acc, item, index);
            }
            index += 1;
          }
          return acc;
        }, null);
      },
      count(){
        return evaluate(function(iterable){
          let count = 0;
          for(const _ of iterable){
            count += 1;
          }
          return count;
        }, 'count');
      },
      first(){
        return evaluate(function(iterable){
          for(const item of iterable){
            return item;
          }
          return undefined;
        }, 'first');
      },
      last(){
        return evaluate(function(iterable){
          let lastValue = undefined;
          let hasValue = false;
          for(const item of iterable){
            lastValue = item;
            hasValue = true;
          }
          return hasValue ? lastValue : undefined;
        }, 'last');
      },
      some(fn){
        if(typeof fn !== 'function'){
          console.warn('DataPipeline.some requires a function', { label });
          return false;
        }
        return evaluate(function(iterable){
          let index = 0;
          for(const item of iterable){
            if(fn(item, index)){
              return true;
            }
            index += 1;
          }
          return false;
        }, null);
      },
      every(fn){
        if(typeof fn !== 'function'){
          console.warn('DataPipeline.every requires a function', { label });
          return false;
        }
        return evaluate(function(iterable){
          let index = 0;
          for(const item of iterable){
            if(!fn(item, index)){
              return false;
            }
            index += 1;
          }
          return true;
        }, null);
      },
      find(fn){
        if(typeof fn !== 'function'){
          console.warn('DataPipeline.find requires a function', { label });
          return undefined;
        }
        return evaluate(function(iterable){
          let index = 0;
          for(const item of iterable){
            if(fn(item, index)){
              return item;
            }
            index += 1;
          }
          return undefined;
        }, null);
      },
      invalidate(reason){
        invalidate(reason || 'manual');
        return api;
      },
      setSource(nextSource, reason){
        source = nextSource;
        invalidate(reason || 'source-updated');
        return api;
      },
      clearSteps(){
        steps.length = 0;
        invalidate('steps-cleared');
        return api;
      },
      getSteps(){
        return steps.slice();
      },
      getLabel(){
        return label;
      },
      getSignature(){
        return cache.signature;
      },
      isPipeline(){
        return true;
      }
    };

    logDebug('Debug: DataPipeline created', { label, cacheEnabled: config.cache !== false });

    return api;
  };

  DataPipeline.from = DataPipeline.create;
})(window);
