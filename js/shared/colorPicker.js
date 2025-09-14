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
    overlay.addEventListener('blur',()=>{overlay.style.display='none';console.debug('Debug: Color overlay hidden');}); // Debug: color overlay
    console.debug('Debug: Color overlay initialized'); // Debug: color overlay
    return overlay;
  };

  Shared.attachColorPickerNear = function attachColorPickerNear(el){
    if(!overlay) Shared.initColorPickerOverlay();
    el.addEventListener('pointerdown',e=>{
      console.debug('Debug: color input pointerdown'); // Debug: color input open
      e.preventDefault();
      const rect=el.getBoundingClientRect();
      overlay.style.left=`${rect.right+4}px`;
      overlay.style.top=`${rect.top}px`;
      overlay.value=el.value;
      overlay.targetEl=el;
      overlay.style.display='block';
      overlay.focus();
      if(overlay.showPicker){ overlay.showPicker(); }
    });
  };
})(window);

