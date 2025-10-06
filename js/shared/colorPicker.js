// Shared color picker overlay to unify color input UX
// Exposes Shared.initColorPickerOverlay(), Shared.attachColorPickerNear(el), and Shared.openColorPicker(options)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};

  let overlay = null;

  function ensureOverlay(){
    if(overlay){
      return overlay;
    }
    overlay = document.createElement('input');
    overlay.type = 'color';
    overlay.style.position = 'absolute';
    overlay.style.zIndex = '1000';
    overlay.style.display = 'none';
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    overlay.dataset.fontControlsOverlay = '1';
    document.body.appendChild(overlay);
    const dispatchInput = (eventType)=>{
      const handlerName = eventType === 'change' ? 'onOverlayChange' : 'onOverlayInput';
      return (evt)=>{
        if(!overlay?.targetEl){
          return;
        }
        const target = overlay.targetEl;
        if(typeof target[handlerName] === 'function'){
          target[handlerName](overlay.value, evt);
          return;
        }
        if(target instanceof HTMLElement){
          target.value = overlay.value;
          target.dispatchEvent(new Event(eventType === 'change' ? 'change' : 'input', { bubbles: true }));
        }
      };
    };
    overlay.addEventListener('input', dispatchInput('input'));
    overlay.addEventListener('change', dispatchInput('change'));
    overlay.addEventListener('blur',()=>{
      if(overlay?.targetEl && typeof overlay.targetEl.onOverlayClose === 'function'){
        overlay.targetEl.onOverlayClose();
      }
      overlay.style.display = 'none';
      overlay.style.pointerEvents = 'none';
      overlay.targetEl = null;
      console.debug('Debug: Color overlay hidden'); // Debug: color overlay hidden
    });
    console.debug('Debug: Color overlay initialized'); // Debug: color overlay
    return overlay;
  }

  function placeOverlayNear(anchorEl){
    const ov = ensureOverlay();
    if(!ov || !anchorEl || typeof anchorEl.getBoundingClientRect !== 'function'){
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const docEl = document.documentElement;
    const scrollX = window.pageXOffset || docEl?.scrollLeft || 0;
    const scrollY = window.pageYOffset || docEl?.scrollTop || 0;

    const placeAndClamp = (placement, tag) => {
      ov.style.left = `${placement.left}px`;
      ov.style.top = `${placement.top}px`;
      let overlayRect = ov.getBoundingClientRect();
      const viewportWidth = window.innerWidth || docEl?.clientWidth || 0;
      const viewportHeight = window.innerHeight || docEl?.clientHeight || 0;
      const width = overlayRect.width || 0;
      const height = overlayRect.height || 0;
      let left = placement.left;
      let top = placement.top;
      if(viewportWidth){
        const minLeft = scrollX + 8;
        const maxLeft = scrollX + viewportWidth - width - 8;
        left = Math.min(Math.max(left, minLeft), maxLeft);
      }
      if(viewportHeight){
        const minTop = scrollY + 8;
        const maxTop = scrollY + viewportHeight - height - 8;
        top = Math.min(Math.max(top, minTop), maxTop);
      }
      if(left !== placement.left || top !== placement.top){
        ov.style.left = `${left}px`;
        ov.style.top = `${top}px`;
        overlayRect = ov.getBoundingClientRect();
      }
      console.debug('Debug: color overlay placed', { tag, rect: { left: overlayRect.left, top: overlayRect.top } }); // Debug: color overlay placement
      return overlayRect;
    };

    const basePlacement = { left: rect.right + scrollX + 6, top: rect.top + scrollY };
    let overlayRect = placeAndClamp(basePlacement, 'base');
    const avoidRect = anchorEl.__fontControlsAvoidRect;
    if(avoidRect){
      const intersects = (candidateRect) => candidateRect.left < avoidRect.right && candidateRect.right > avoidRect.left && candidateRect.top < avoidRect.bottom && candidateRect.bottom > avoidRect.top;
      if(intersects(overlayRect)){
        const overlayWidth = overlayRect.width || 0;
        const overlayHeight = overlayRect.height || 0;
        const placements = [
          { left: rect.left + scrollX, top: rect.bottom + scrollY + 8 },
          { left: rect.left + scrollX, top: rect.top + scrollY - overlayHeight - 8 },
          { left: rect.left + scrollX - overlayWidth - 8, top: rect.top + scrollY }
        ];
        for(let idx = 0; idx < placements.length; idx += 1){
          overlayRect = placeAndClamp(placements[idx], `avoid-${idx}`);
          if(!intersects(overlayRect)){
            break;
          }
        }
      }
    }
  }

  Shared.openColorPicker = function openColorPicker(options){
    const opts = options || {};
    const anchor = opts.anchor || opts.element || null;
    const ov = ensureOverlay();
    if(!ov){
      console.warn('Shared.openColorPicker skipped: overlay missing');
      return;
    }
    const initialColor = typeof opts.color === 'string' ? opts.color : '#000000';
    ov.value = initialColor;
    ov.targetEl = {
      onOverlayInput(value, evt){
        if(typeof opts.onInput === 'function'){
          opts.onInput(value, evt);
        }
      },
      onOverlayChange(value, evt){
        if(typeof opts.onChange === 'function'){
          opts.onChange(value, evt);
        }
      },
      onOverlayClose(){
        if(typeof opts.onClose === 'function'){
          opts.onClose();
        }
      }
    };
    ov.style.display = 'block';
    ov.style.pointerEvents = 'auto';
    if(anchor && typeof anchor.getBoundingClientRect === 'function'){
      placeOverlayNear(anchor);
    } else if(Number.isFinite(opts.left) && Number.isFinite(opts.top)){
      ov.style.left = `${opts.left}px`;
      ov.style.top = `${opts.top}px`;
    }
    ov.focus({ preventScroll: true });
    try {
      if(typeof ov.showPicker === 'function'){
        ov.showPicker();
      } else {
        ov.click();
      }
    } catch(err){
      console.debug('Debug: color picker showPicker fallback', { message: err?.message || String(err) }); // Debug: color overlay fallback
      ov.click();
    }
    console.debug('Debug: openColorPicker invoked', { hasAnchor: !!anchor, color: initialColor });
  };

  Shared.initColorPickerOverlay = function initColorPickerOverlay(){
    return ensureOverlay();
  };

  Shared.attachColorPickerNear = function attachColorPickerNear(el){
    ensureOverlay();
    if(Shared.chartStyle?.normalizeColorInput){
      try {
        Shared.chartStyle.normalizeColorInput(el, { reason: 'colorPicker.attach' });
      } catch(normalizeErr){
        console.error('colorPicker normalizeColorInput error', normalizeErr);
      }
    }
    el.addEventListener('click',(evt)=>{
      console.debug('Debug: color input click', { id: el.id || null }); // Debug: color input open
      evt.preventDefault();
      Shared.openColorPicker({
        anchor: el,
        color: el.value,
        onInput(value){
          el.value = value;
          el.dispatchEvent(new Event('input',{ bubbles: true }));
        },
        onChange(value){
          el.value = value;
          el.dispatchEvent(new Event('change',{ bubbles: true }));
        }
      });
    });
  };
})(window);

