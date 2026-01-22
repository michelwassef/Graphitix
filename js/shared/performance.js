// Performance Optimization Framework
// Unified batching, debouncing, and performance monitoring utilities
(function(global) {
  'use strict';
  
  const Shared = global.Shared = global.Shared || {};
  const Performance = Shared.Performance = Shared.Performance || {};
  
  // Debug state for performance utilities
  const debugState = Shared.__debugState || { enabled: false };
  Shared.__debugState = debugState;
  
  function logDebug(message, payload) {
    if (Shared.isDebugEnabled && typeof Shared.isDebugEnabled() === 'function' && Shared.isDebugEnabled()) {
      if (typeof payload === 'undefined') {
        console.debug(message);
      } else {
        console.debug(message, payload);
      }
    }
  }
  
  // Ensure isDebugEnabled exists
  if (typeof Shared.isDebugEnabled !== 'function') {
    Shared.isDebugEnabled = function isDebugEnabled() {
      return !!debugState.enabled;
    };
  }
  
  // Performance timing utilities
  const performance = global.performance || {};
  
  function now() {
    if (typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }
  
  // Mark a performance timestamp
  Performance.mark = function mark(name) {
    if (typeof performance.mark === 'function') {
      performance.mark(name);
    }
    logDebug('Performance mark: ' + name, { timestamp: now() });
  };
  
  // Measure performance between two marks
  Performance.measure = function measure(name, startMark, endMark) {
    if (typeof performance.measure === 'function') {
      performance.measure(name, startMark, endMark);
    }
    logDebug('Performance measure: ' + name, { startMark, endMark, timestamp: now() });
  };
  
  // Standardized debouncing with multiple strategies
  Performance.debounce = function debounce(fn, delay = 16, strategy = 'animationFrame') {
    if (typeof fn !== 'function') {
      console.warn('Performance.debounce requires a function callback', { received: typeof fn });
      return function noopDebounce() {
        logDebug('Debug: Performance.debounce noop invoked');
      };
    }
    
    const label = fn.name || 'anonymous';
    let timeoutId = null;
    let animationFrameId = null;
    let pendingArgs = null;
    let pendingContext = null;
    
    function cancelPending() {
      if (timeoutId !== null) {
        global.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (animationFrameId !== null) {
        if (typeof global.cancelAnimationFrame === 'function') {
          global.cancelAnimationFrame(animationFrameId);
        }
        animationFrameId = null;
      }
      pendingArgs = null;
      pendingContext = null;
    }
    
    function execute() {
      if (pendingArgs === null) return;
      
      const startedAt = now();
      logDebug('Debug: Performance.debounce executing callback', { label, startedAt });
      const args = pendingArgs;
      const context = pendingContext;
      pendingArgs = null;
      pendingContext = null;
      
      try {
        return fn.apply(context, args);
      } catch (err) {
        console.error('Performance.debounce error', err);
      }
    }
    
    return function debounced() {
      cancelPending();
      
      const scheduledAt = now();
      logDebug('Debug: Performance.debounce scheduling callback', { label, strategy, scheduledAt });
      
      pendingContext = this;
      pendingArgs = arguments;
      
      if (strategy === 'animationFrame' && typeof global.requestAnimationFrame === 'function') {
        animationFrameId = global.requestAnimationFrame(function() {
          animationFrameId = null;
          execute();
        });
      } else {
        timeoutId = global.setTimeout(function() {
          timeoutId = null;
          execute();
        }, delay);
      }
    };
  };
  
  // Animation frame debounce (backward compatible with existing Shared.debounceFrame)
  Performance.debounceFrame = function debounceFrame(fn) {
    return Performance.debounce(fn, 16, 'animationFrame');
  };
  
  // Standardized batching utility
  Performance.batch = function batch(fn) {
    if (typeof fn !== 'function') {
      console.warn('Performance.batch requires a function callback', { received: typeof fn });
      return;
    }
    
    const label = fn.name || 'anonymous';
    const startedAt = now();
    logDebug('Debug: Performance.batch starting', { label, startedAt });
    
    try {
      const result = fn();
      const endedAt = now();
      logDebug('Debug: Performance.batch completed', { label, startedAt, endedAt, duration: endedAt - startedAt });
      return result;
    } catch (err) {
      console.error('Performance.batch error', err);
      throw err;
    }
  };
  
  // Nested batching with automatic flush
  (function() {
    let batchDepth = 0;
    const pendingOperations = [];
    
    function flushBatch() {
      if (pendingOperations.length > 0) {
        const startedAt = now();
        logDebug('Debug: Performance.flushBatch starting', { operations: pendingOperations.length, startedAt });
        
        try {
          // Execute all pending operations
          pendingOperations.forEach(function(op) {
            try {
              op.fn.apply(op.context, op.args);
            } catch (err) {
              console.error('Performance.batch operation error', err);
            }
          });
          
          const endedAt = now();
          logDebug('Debug: Performance.flushBatch completed', { 
            operations: pendingOperations.length, 
            startedAt, 
            endedAt, 
            duration: endedAt - startedAt 
          });
        } finally {
          pendingOperations.length = 0;
        }
      }
    }
    
    // Enhanced batch with nested support
    Performance.nestedBatch = function nestedBatch(fn) {
      if (typeof fn !== 'function') {
        return;
      }
      
      batchDepth += 1;
      const startedAt = now();
      logDebug('Debug: Performance.nestedBatch starting', { depth: batchDepth, startedAt });
      
      try {
        fn();
      } finally {
        batchDepth = Math.max(0, batchDepth - 1);
        if (batchDepth === 0) {
          flushBatch();
        }
      }
    };
    
    // Queue an operation for batching
    Performance.queueOperation = function queueOperation(fn, context, args) {
      if (typeof fn !== 'function') {
        return;
      }
      
      pendingOperations.push({
        fn: fn,
        context: context || this,
        args: args || []
      });
      
      logDebug('Debug: Performance.queueOperation enqueued', { 
        operation: fn.name || 'anonymous',
        queueLength: pendingOperations.length
      });
    };
    
    // Expose flush for manual control
    Performance.flushPendingOperations = flushBatch;
  })();
  
  // Throttle utility
  Performance.throttle = function throttle(fn, limit = 100) {
    if (typeof fn !== 'function') {
      console.warn('Performance.throttle requires a function callback', { received: typeof fn });
      return function noopThrottle() {
        logDebug('Debug: Performance.throttle noop invoked');
      };
    }
    
    let lastCall = 0;
    let lastResult;
    const label = fn.name || 'anonymous';
    
    // Use Date.now() instead of performance.now() for better test compatibility
    const getTime = typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
      ? () => global.performance.now()
      : () => Date.now();
    
    return function throttled() {
      const nowTime = getTime();
      const context = this;
      const args = arguments;
      
      if (nowTime - lastCall >= limit) {
        lastCall = nowTime;
        logDebug('Debug: Performance.throttle executing', { label, timestamp: nowTime });
        lastResult = fn.apply(context, args);
        return lastResult;
      } else {
        logDebug('Debug: Performance.throttle skipped (rate limited)', { label, timestamp: nowTime });
        return lastResult;
      }
    };
  };
  
  // Performance monitoring hooks
  Performance.startMonitoring = function startMonitoring() {
    Performance.mark('monitoring-start');
    logDebug('Debug: Performance monitoring started');
  };
  
  Performance.stopMonitoring = function stopMonitoring() {
    Performance.mark('monitoring-end');
    Performance.measure('total-monitoring-time', 'monitoring-start', 'monitoring-end');
    logDebug('Debug: Performance monitoring stopped');
  };
  
  // Backward compatibility: alias to existing Shared.debounceFrame if it exists
  if (typeof Shared.debounceFrame === 'function') {
    Performance.debounceFrame = Shared.debounceFrame;
  }
  
  // Export to global namespace for easy access
  if (typeof global.Performance === 'undefined') {
    global.Performance = Performance;
  }
  
  logDebug('Debug: Performance optimization framework initialized');
})(window);