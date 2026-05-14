(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.themeRuntime = Shared.themeRuntime || {};

  const NO_PREVIOUS_FILL = '__none__';
  const darkTextObservers = new WeakMap();

  function removeNode(node){
    if(node && node.parentNode){
      try{ node.parentNode.removeChild(node); }catch(_err){}
    }
  }

  function applyDarkTextTheme(svg, color){
    const nodes = svg.querySelectorAll('text,tspan');
    nodes.forEach(node => {
      if(node.getAttribute('data-color-scheme-text-themed') !== '1'){
        if(node.hasAttribute('fill')){
          node.setAttribute('data-color-scheme-prev-fill', node.getAttribute('fill') || '');
        }else{
          node.setAttribute('data-color-scheme-prev-fill', NO_PREVIOUS_FILL);
        }
        node.setAttribute('data-color-scheme-text-themed', '1');
      }
      node.setAttribute('fill', color);
    });
  }

  function restoreTextTheme(svg){
    const nodes = svg.querySelectorAll('text[data-color-scheme-text-themed="1"],tspan[data-color-scheme-text-themed="1"]');
    nodes.forEach(node => {
      const previous = node.getAttribute('data-color-scheme-prev-fill');
      if(previous === NO_PREVIOUS_FILL || previous === null){
        node.removeAttribute('fill');
      }else{
        node.setAttribute('fill', previous);
      }
      node.removeAttribute('data-color-scheme-prev-fill');
      node.removeAttribute('data-color-scheme-text-themed');
    });
  }

  function disconnectDarkTextObserver(svg){
    const entry = darkTextObservers.get(svg);
    if(!entry) return;
    try{ entry.observer?.disconnect?.(); }catch(_err){}
    darkTextObservers.delete(svg);
  }

  function ensureDarkTextObserver(svg, color){
    if(typeof global.MutationObserver !== 'function') return;
    const existing = darkTextObservers.get(svg);
    if(existing && existing.observer){
      existing.color = color;
      return;
    }
    const observerState = { color };
    const observer = new global.MutationObserver(mutations => {
      const nextColor = observerState.color || color;
      for(let i = 0; i < mutations.length; i += 1){
        const mutation = mutations[i];
        if(mutation.type === 'childList'){
          mutation.addedNodes.forEach(node => {
            if(!node || node.nodeType !== 1) return;
            const tags = [];
            const name = String(node.nodeName || '').toLowerCase();
            if(name === 'text' || name === 'tspan'){ tags.push(node); }
            if(typeof node.querySelectorAll === 'function'){
              node.querySelectorAll('text,tspan').forEach(n => tags.push(n));
            }
            tags.forEach(textNode => {
              if(textNode.getAttribute('data-color-scheme-text-themed') !== '1'){
                if(textNode.hasAttribute('fill')){
                  textNode.setAttribute('data-color-scheme-prev-fill', textNode.getAttribute('fill') || '');
                }else{
                  textNode.setAttribute('data-color-scheme-prev-fill', NO_PREVIOUS_FILL);
                }
                textNode.setAttribute('data-color-scheme-text-themed', '1');
              }
              if(textNode.getAttribute('fill') !== nextColor){
                textNode.setAttribute('fill', nextColor);
              }
            });
          });
        }
      }
    });
    observer.observe(svg, { subtree: true, childList: true, attributes: true, attributeFilter: ['fill'] });
    observerState.observer = observer;
    darkTextObservers.set(svg, observerState);
  }

  function applySvgTheme(svg, scheme){
    if(!svg || !scheme) return;
    const tokens = scheme.tokens || {};
    const isDark = scheme.id === 'dark';
    const background = tokens.background || '#ffffff';
    const textColor = tokens.textColor || (isDark ? '#f2f2f2' : '#000000');
    svg.setAttribute('data-color-scheme', scheme.id || 'scientific');

    const staleBg = svg.querySelector('[data-color-scheme-background="1"]');
    removeNode(staleBg);

    if(isDark){
      svg.setAttribute('data-color-scheme-bg-color', background);
      if(svg.style){ svg.style.backgroundColor = background; }
      applyDarkTextTheme(svg, textColor);
      ensureDarkTextObserver(svg, textColor);
    }else{
      disconnectDarkTextObserver(svg);
      svg.removeAttribute('data-color-scheme-bg-color');
      if(svg.style){ svg.style.removeProperty('background-color'); }
      restoreTextTheme(svg);
    }
  }

  namespace.applySvgTheme = applySvgTheme;
  namespace.applyDarkTextTheme = applyDarkTextTheme;
  namespace.restoreTextTheme = restoreTextTheme;
})(window);
