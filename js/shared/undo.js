(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const undoNamespace = Shared.undoManager = Shared.undoManager || {};
  if(undoNamespace.__installed){
    undoDebug('Debug: Shared.undoManager already installed');
    return;
  }
  undoNamespace.__installed = true;

  function undoDebug(message, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // ignore toggle errors and log by default
    }
    if(arguments.length === 1){
      console.debug(message);
    }else{
      console.debug(message, payload);
    }
  }

  const STACK_LIMIT = 60;
  let stack = [];
  let pointer = -1;
  let applying = false;
  const listeners = new Set();
  const handledKeyEvents = new WeakSet();

  const lastStates = new WeakMap();

  const TEXT_INPUT_TYPES = new Set(['text','search','email','url','tel','password']);

  function readState(el){
    if(!el) return null;
    if(el.type === 'checkbox' || el.type === 'radio'){
      return { kind: 'checked', value: !!el.checked };
    }
    if(el.tagName === 'SELECT'){
      if(el.multiple){
        const selected = Array.from(el.options).filter(opt => opt.selected).map(opt => opt.value);
        return { kind: 'options', value: selected };
      }
      return { kind: 'value', value: el.value };
    }
    return { kind: 'value', value: el.value };
  }

  function statesEqual(a,b){
    if(a === b) return true;
    if(!a || !b) return false;
    if(a.kind !== b.kind) return false;
    if(a.kind === 'checked'){
      return !!a.value === !!b.value;
    }
    if(a.kind === 'options'){
      if(!Array.isArray(a.value) || !Array.isArray(b.value)) return false;
      if(a.value.length !== b.value.length) return false;
      for(let i=0;i<a.value.length;i+=1){
        if(a.value[i] !== b.value[i]) return false;
      }
      return true;
    }
    return String(a.value) === String(b.value);
  }

  function inferScope(el){
    if(!el) return null;
    if(typeof el.getAttribute === 'function'){
      const explicit = el.getAttribute('data-undo-scope');
      if(explicit) return explicit;
    }
    const panel = el.closest ? el.closest('.panel') : null;
    if(panel && panel.id) return panel.id;
    const svgBox = el.closest ? el.closest('.svgbox') : null;
    if(svgBox && svgBox.id) return svgBox.id;
    return null;
  }

  function describeElement(el){
    if(!el) return 'unknown-element';
    const explicit = el.getAttribute && el.getAttribute('data-undo-label');
    if(explicit) return explicit;
    if(el.id) return `#${el.id}`;
    if(el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    if(el.classList && el.classList.length){
      return `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}`;
    }
    return el.tagName ? el.tagName.toLowerCase() : el.nodeName || 'node';
  }

  function dispatchSyntheticEvent(el){
    if(!el) return;
    const type = (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') ? 'change' : 'input';
    const evt = new Event(type, { bubbles: true });
    evt.__undoGenerated = true;
    el.dispatchEvent(evt);
  }

  function applyState(el, state, reason){
    if(!el || !state) return;
    applying = true;
    try{
      if(state.kind === 'checked'){
        el.checked = !!state.value;
      }else if(state.kind === 'options' && el.tagName === 'SELECT' && el.options){
        const values = Array.isArray(state.value) ? state.value : [];
        Array.from(el.options).forEach(opt => {
          opt.selected = values.includes(opt.value);
        });
      }else{
        el.value = state.value != null ? state.value : '';
      }
      undoDebug('Debug: undo applyState', { label: describeElement(el), reason, state });
      dispatchSyntheticEvent(el);
    }catch(err){
      console.error('Shared.undoManager applyState error', err);
    }finally{
      lastStates.set(el, readState(el));
      applying = false;
    }
  }

  function getStateSnapshot(reason){
    return {
      canUndo: pointer >= 0,
      canRedo: pointer + 1 < stack.length,
      reason: reason || 'state'
    };
  }

  function notifyChange(reason){
    if(!listeners.size){
      return;
    }
    const snapshot = getStateSnapshot(reason);
    listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch(err){
        console.error('Shared.undoManager listener error', err);
      }
    });
  }

  function recordAction(entry){
    if(!entry || typeof entry.undo !== 'function'){
      return false;
    }
    stack = stack.slice(0, pointer + 1);
    stack.push(entry);
    pointer = stack.length - 1;
    if(STACK_LIMIT > 0 && stack.length > STACK_LIMIT){
      const removeCount = stack.length - STACK_LIMIT;
      stack.splice(0, removeCount);
      pointer = Math.max(-1, pointer - removeCount);
    }
    undoDebug('Debug: undo stack record', {
      label: entry.label,
      scope: entry.scope || null,
      length: stack.length,
      pointer
    });
    notifyChange('record');
    return true;
  }

  undoNamespace.record = function record(entry){
    return recordAction(entry);
  };

  undoNamespace.recordStateChange = function recordStateChange(opts){
    if(!opts){
      return false;
    }
    const apply = typeof opts.apply === 'function' ? opts.apply : null;
    if(!apply){
      return false;
    }
    const equals = typeof opts.equals === 'function' ? opts.equals : ((a, b) => a === b);
    const before = opts.from;
    const after = opts.to;
    if(equals(before, after)){
      return false;
    }
    const element = opts.element || null;
    const label = opts.label || (element ? `state:${describeElement(element)}` : 'state-change');
    const scope = opts.scope || (element ? inferScope(element) : null);
    const entry = {
      label,
      scope,
      undo: () => apply(before, 'undo'),
      redo: () => apply(after, 'redo')
    };
    return recordAction(entry);
  };

  undoNamespace.undo = function undo(){
    if(pointer < 0){
      undoDebug('Debug: undo stack empty on undo');
      return false;
    }
    const currentIndex = pointer;
    const entry = stack[currentIndex];
    pointer -= 1;
    let result = true;
    try{
      undoDebug('Debug: undo executing', { label: entry.label, pointer });
      result = entry.undo();
    }catch(err){
      console.error('Shared.undoManager undo error', err);
      result = false;
    }
    if(result === false){
      pointer = currentIndex;
      undoDebug('Debug: undo entry reported failure', { label: entry.label, pointer });
      return false;
    }
    notifyChange('undo');
    return true;
  };

  undoNamespace.redo = function redo(){
    if(pointer + 1 >= stack.length){
      undoDebug('Debug: undo stack empty on redo');
      return false;
    }
    const previousPointer = pointer;
    pointer += 1;
    const entry = stack[pointer];
    let result = true;
    try{
      if(typeof entry.redo === 'function'){
        undoDebug('Debug: undo executing redo', { label: entry.label, pointer });
        result = entry.redo();
      }else if(typeof entry.undo === 'function'){
        undoDebug('Debug: undo fallback redo using undo()', { label: entry.label, pointer });
        result = entry.undo();
      }
    }catch(err){
      console.error('Shared.undoManager redo error', err);
      result = false;
    }
    if(result === false){
      pointer = previousPointer;
      undoDebug('Debug: redo entry reported failure', { label: entry.label, pointer });
      return false;
    }
    notifyChange('redo');
    return true;
  };

  undoNamespace.clear = function clear(){
    stack = [];
    pointer = -1;
    undoDebug('Debug: undo stack cleared');
    notifyChange('clear');
  };

  function shouldTrackElement(el){
    if(!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if(tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return false;
    if(el.type === 'file') return false;
    if(el.closest && el.closest('.handsontable')) return false;
    if(el.hasAttribute && el.hasAttribute('data-undo-ignore')) return false;
    return true;
  }

  function storeInitialState(el){
    if(!shouldTrackElement(el)) return;
    const state = readState(el);
    lastStates.set(el, state);
    undoDebug('Debug: undo stored initial state', { label: describeElement(el), state });
  }

  function onFocusIn(event){
    storeInitialState(event.target);
  }

  function handleChange(event){
    if(applying) return;
    const el = event.target;
    if(!shouldTrackElement(el)) return;
    if(event.__undoGenerated) return;
    const prevState = lastStates.has(el) ? lastStates.get(el) : readState(el);
    const nextState = readState(el);
    if(statesEqual(prevState, nextState)){
      lastStates.set(el, nextState);
      return;
    }
    const label = describeElement(el);
    const scope = inferScope(el);
    const undoState = prevState;
    const redoState = nextState;
    recordAction({
      label: `input:${label}`,
      scope,
      undo: () => applyState(el, undoState, 'undo'),
      redo: () => applyState(el, redoState, 'redo')
    });
    lastStates.set(el, nextState);
  }

  function allowNativeUndo(target){
    if(!target) return true;
    if(target.isContentEditable) return true;
    if(target.tagName === 'TEXTAREA') return true;
    if(target.tagName === 'INPUT'){
      if(TEXT_INPUT_TYPES.has(target.type || '')) return true;
    }
    return false;
  }

  function handleKeydown(event){
    if(!event){
      return;
    }
    if(handledKeyEvents.has(event)){
      return;
    }
    handledKeyEvents.add(event);
    const isModifier = event.ctrlKey || event.metaKey;
    if(!isModifier || event.altKey) return;
    const key = event.key ? event.key.toLowerCase() : '';
    undoDebug('Debug: undo keydown received', {
      key,
      ctrlKey: !!event.ctrlKey,
      metaKey: !!event.metaKey,
      shiftKey: !!event.shiftKey,
      defaultPrevented: !!event.defaultPrevented,
      targetTag: event?.target?.tagName || null,
      targetClass: event?.target?.className || null
    });
    if(key !== 'z' && key !== 'y'){
      if(event.defaultPrevented){
        undoDebug('Debug: undo keydown ignored (non-undo key, defaultPrevented)', { key });
        return;
      }
      return;
    }
    let handled = false;
    if(key === 'z'){
      if(event.shiftKey){
        handled = undoNamespace.redo();
      }else{
        handled = undoNamespace.undo();
      }
    }else if(key === 'y'){
      handled = undoNamespace.redo();
    }
    if(handled){
      undoDebug('Debug: undo keydown handled', {
        key,
        pointer,
        stackLength: stack.length
      });
      event.preventDefault();
    }else if(key === 'z' && allowNativeUndo(event.target)){
      undoDebug('Debug: native undo allowed to proceed');
    }else{
      undoDebug('Debug: undo keydown not handled by undo manager', {
        key,
        pointer,
        stackLength: stack.length
      });
    }
  }

  if(global.document){
    const doc = global.document;
    if(typeof global.addEventListener === 'function'){
      global.addEventListener('keydown', handleKeydown, true);
    }
    doc.addEventListener('focusin', onFocusIn, true);
    doc.addEventListener('change', handleChange, true);
    doc.addEventListener('keydown', handleKeydown, true);
    undoNamespace.__globalKeydownAttached = true;
    undoDebug('Debug: Shared.undoManager listeners attached');
  }

  undoNamespace.canUndo = function canUndo(){
    return pointer >= 0;
  };

  undoNamespace.canRedo = function canRedo(){
    return pointer + 1 < stack.length;
  };

  undoNamespace.onChange = function onChange(listener){
    if(typeof listener !== 'function'){
      return function noop(){ };
    }
    listeners.add(listener);
    try {
      listener(getStateSnapshot('subscribe'));
    } catch(err){
      console.error('Shared.undoManager listener error', err);
    }
    return function unsubscribe(){
      listeners.delete(listener);
    };
  };

})(typeof window !== 'undefined' ? window : globalThis);
