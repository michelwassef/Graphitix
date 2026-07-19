// Canonical Graphitix debug logging contract.
(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const existingState = Shared.__debugState;
  const debugState = existingState && typeof existingState === 'object'
    ? existingState
    : { enabled: false };

  if(typeof debugState.enabled !== 'boolean'){
    debugState.enabled = false;
  }
  Shared.__debugState = debugState;

  Shared.setDebugLogging = function setDebugLogging(enabled){
    debugState.enabled = enabled === true;
    return debugState.enabled;
  };

  Shared.enableDebugLogging = function enableDebugLogging(){
    return Shared.setDebugLogging(true);
  };

  Shared.disableDebugLogging = function disableDebugLogging(){
    return Shared.setDebugLogging(false);
  };

  Shared.isDebugEnabled = function isDebugEnabled(){
    return debugState.enabled === true;
  };

  Shared.debug = function debug(message, payload){
    if(!Shared.isDebugEnabled()){
      return false;
    }
    if(typeof payload === 'undefined'){
      console.debug(message);
    }else{
      console.debug(message, payload);
    }
    return true;
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = {
      setDebugLogging: Shared.setDebugLogging,
      enableDebugLogging: Shared.enableDebugLogging,
      disableDebugLogging: Shared.disableDebugLogging,
      isDebugEnabled: Shared.isDebugEnabled,
      debug: Shared.debug
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
