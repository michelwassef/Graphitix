'use strict';

function installProductionTestEventTracker(options = {}){
  const targets = [
    options.window || globalThis.window,
    options.document || globalThis.document
  ].filter(Boolean);
  const records = [];
  const originals = new Map();

  const removeRecord = (target, type, listener, capture) => {
    for(let index = records.length - 1; index >= 0; index -= 1){
      const entry = records[index];
      if(entry.target === target
        && entry.type === type
        && entry.listener === listener
        && entry.capture === capture){
        records.splice(index, 1);
      }
    }
  };

  targets.forEach(target => {
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    if(typeof add !== 'function' || typeof remove !== 'function'){
      return;
    }
    originals.set(target, { add, remove });
    target.addEventListener = function trackedAddEventListener(type, listener, optionsArg){
      if(listener){
        records.push({
          target,
          type,
          listener,
          options: optionsArg,
          capture: typeof optionsArg === 'boolean' ? optionsArg : !!optionsArg?.capture
        });
      }
      return add.call(this, type, listener, optionsArg);
    };
    target.removeEventListener = function trackedRemoveEventListener(type, listener, optionsArg){
      removeRecord(target, type, listener, typeof optionsArg === 'boolean' ? optionsArg : !!optionsArg?.capture);
      return remove.call(this, type, listener, optionsArg);
    };
  });

  return {
    reset(){
      records.splice(0).forEach(entry => {
        const methods = originals.get(entry.target);
        methods?.remove?.call(entry.target, entry.type, entry.listener, entry.options);
      });
    },
    restore(){
      this.reset();
      originals.forEach((methods, target) => {
        target.addEventListener = methods.add;
        target.removeEventListener = methods.remove;
      });
      originals.clear();
    }
  };
}

module.exports = {
  installProductionTestEventTracker
};
