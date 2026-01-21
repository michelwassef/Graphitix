(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const formControls = Shared.formControls = Shared.formControls || {};

  let selectMeasureEl = null;

  function ensureSelectMeasure(doc){
    if(!doc || !doc.body){ return null; }
    if(selectMeasureEl && selectMeasureEl.ownerDocument === doc){
      return selectMeasureEl;
    }
    selectMeasureEl = doc.createElement('span');
    selectMeasureEl.setAttribute('aria-hidden', 'true');
    const style = selectMeasureEl.style;
    style.position = 'absolute';
    style.visibility = 'hidden';
    style.pointerEvents = 'none';
    style.whiteSpace = 'nowrap';
    style.fontSize = '12px';
    style.fontFamily = 'inherit';
    style.fontWeight = '400';
    style.fontStyle = 'normal';
    style.padding = '0';
    style.margin = '0';
    style.maxWidth = 'none';
    doc.body.appendChild(selectMeasureEl);
    return selectMeasureEl;
  }

  function computeSelectWidth(select){
    if(!select){ return 0; }
    const doc = select.ownerDocument || global.document;
    const measure = ensureSelectMeasure(doc);
    const view = doc?.defaultView || global;
    if(!measure || typeof view?.getComputedStyle !== 'function'){ return 0; }
    const computed = view.getComputedStyle(select);
    if(!computed){ return 0; }
    measure.style.fontFamily = computed.fontFamily;
    measure.style.fontSize = computed.fontSize;
    measure.style.fontWeight = computed.fontWeight;
    measure.style.fontStyle = computed.fontStyle;
    measure.style.letterSpacing = computed.letterSpacing;
    measure.style.textTransform = computed.textTransform;
    let maxOptionWidth = 0;
    const options = select.options || [];
    if(options.length === 0){
      measure.textContent = select.value || '';
      maxOptionWidth = measure.offsetWidth;
    } else {
      for(let i = 0; i < options.length; i += 1){
        const opt = options[i];
        measure.textContent = opt.text || opt.label || '';
        const width = measure.offsetWidth;
        if(width > maxOptionWidth){
          maxOptionWidth = width;
        }
      }
    }
    measure.textContent = '';
    const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(computed.paddingRight) || 0;
    const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(computed.borderRightWidth) || 0;
    const requestedMin = Number.parseFloat(select.dataset?.minSelectWidth || '') || 0;
    const totalWidth = maxOptionWidth + paddingLeft + paddingRight + borderLeft + borderRight + 1;
    const resolved = Math.max(Math.ceil(totalWidth), requestedMin);
    return resolved > 0 ? resolved : 0;
  }

  function autoSizeSelect(select){
    if(!select){ return; }
    const preferredWidth = computeSelectWidth(select);
    if(!preferredWidth || !(preferredWidth > 0)){ return; }
    const widthPx = `${preferredWidth}px`;
    if(select.style.width !== widthPx){
      select.style.width = widthPx;
    }
    if(select.style.minWidth !== widthPx){
      select.style.minWidth = widthPx;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    if(debugEnabled){
      console.debug('Debug: Shared.formControls.autoSizeSelect applied', {
        id: select.id || null,
        width: preferredWidth
      });
    }
  }

  function watchSelectAutoSize(select){
    if(!select){ return () => {}; }
    const handler = () => {
      const sharedControls = global.Shared?.formControls;
      const activeAutoSize = sharedControls && typeof sharedControls.autoSizeSelect === 'function'
        ? sharedControls.autoSizeSelect
        : autoSizeSelect;
      activeAutoSize(select);
    };
    handler();
    select.addEventListener('change', handler);
    select.addEventListener('input', handler);
    let observer = null;
    if(global.MutationObserver){
      try{
        observer = new MutationObserver(handler);
        observer.observe(select, { childList: true, subtree: false, characterData: false });
      }catch(err){
        const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
        if(debugEnabled){
          console.debug('Debug: Shared.formControls.autoSizeSelect observer skipped', {
            id: select.id || null,
            error: err?.message || String(err)
          });
        }
      }
    }
    return function cleanupAutoSize(){
      select.removeEventListener('change', handler);
      select.removeEventListener('input', handler);
      if(observer){ observer.disconnect(); }
    };
  }

  function attachSelectAutoSize(select, options = {}){
    if(!select){ return () => {}; }
    const opts = typeof options === 'string' ? { label: options } : (options || {});
    const contextLabel = opts.label || opts.context || null;
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const debug = typeof Shared.debug === 'function'
      ? Shared.debug
      : (message, payload) => {
          if(typeof Shared.isDebugEnabled !== 'function' || !Shared.isDebugEnabled()){
            return;
          }
          if(typeof console !== 'undefined' && typeof console.debug === 'function'){
            if(typeof payload === 'undefined'){
              console.debug(message);
            }else{
              console.debug(message, payload);
            }
          }
        };
    const labelText = contextLabel ? `Debug: ${contextLabel} select auto-size` : 'Debug: select auto-size';
    try{
      if(watcher){
        const cleanup = watcher(select);
        debug(`${labelText} watcher attached`, {
          id: select.id || null,
          label: contextLabel
        });
        return cleanup || (() => {});
      }
      if(autoSizer){
        autoSizer(select);
        debug(`${labelText} applied without watcher`, {
          id: select.id || null,
          label: contextLabel
        });
      }else{
        debug(`${labelText} helper unavailable`, {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      debug(`${labelText} attach error`, {
        id: select.id || null,
        label: contextLabel,
        error: err?.message || String(err)
      });
    }
    return () => {};
  }

  formControls.ensureSelectMeasure = ensureSelectMeasure;
  formControls.computeSelectWidth = computeSelectWidth;
  formControls.autoSizeSelect = autoSizeSelect;
  formControls.watchSelectAutoSize = watchSelectAutoSize;
  formControls.attachSelectAutoSize = attachSelectAutoSize;
})(window);
