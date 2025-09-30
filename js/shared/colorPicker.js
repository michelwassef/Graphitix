// Shared color picker overlay to unify color input UX
// Exposes Shared.initColorPickerOverlay() and Shared.attachColorPickerNear(el)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};

  let overlay = null;

  Shared.initColorPickerOverlay = function initColorPickerOverlay(){
    if(overlay) return overlay;
    overlay = document.createElement('input');
    overlay.type='color';
    overlay.style.position='absolute';
    overlay.style.zIndex='1000';
    overlay.style.display='none';
    overlay.style.opacity='0';
    overlay.style.pointerEvents='none';
    document.body.appendChild(overlay);
    overlay.addEventListener('input',e=>{
      if(overlay.targetEl){
        overlay.targetEl.value=overlay.value;
        overlay.targetEl.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
    overlay.addEventListener('blur',()=>{
      overlay.style.display='none';
      overlay.style.pointerEvents='none';
      overlay.targetEl = null;
      console.debug('Debug: Color overlay hidden'); // Debug: color overlay hidden
    });
    console.debug('Debug: Color overlay initialized'); // Debug: color overlay
    return overlay;
  };

  Shared.attachColorPickerNear = function attachColorPickerNear(el){
    if(!overlay) Shared.initColorPickerOverlay();
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
      const rect = el.getBoundingClientRect();
      const docEl = document.documentElement;
      const scrollX = window.pageXOffset || docEl?.scrollLeft || 0;
      const scrollY = window.pageYOffset || docEl?.scrollTop || 0;
      overlay.value = el.value;
      overlay.targetEl = el;
      overlay.style.display = 'block';
      overlay.style.pointerEvents = 'auto';

      const placeAndClamp = (placement, tag) => {
        overlay.style.left = `${placement.left}px`;
        overlay.style.top = `${placement.top}px`;
        let overlayRect = overlay.getBoundingClientRect();
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
          overlay.style.left = `${left}px`;
          overlay.style.top = `${top}px`;
          overlayRect = overlay.getBoundingClientRect();
        }
        console.debug('Debug: color overlay placed', { tag, rect: { left: overlayRect.left, top: overlayRect.top } }); // Debug: color overlay placement
        return overlayRect;
      };

      const basePlacement = { left: rect.right + scrollX + 6, top: rect.top + scrollY };
      let overlayRect = placeAndClamp(basePlacement, 'base');
      const avoidRect = el.__fontControlsAvoidRect;
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

      overlay.focus({ preventScroll: true });
      try {
        if(typeof overlay.showPicker === 'function'){
          overlay.showPicker();
        } else {
          overlay.click();
        }
      } catch(err){
        console.debug('Debug: color picker showPicker fallback', { message: err?.message || String(err) }); // Debug: color overlay fallback
        overlay.click();
      }
    });
  };
})(window);

