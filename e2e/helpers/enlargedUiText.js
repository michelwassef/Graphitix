'use strict';

async function applyEnlargedUiText(page, factor = 2){
  return page.evaluate(scale => {
    const targets = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while(textNode){
      if(/\S/.test(textNode.nodeValue || '')){
        const element = textNode.parentElement;
        if(element && !element.closest('svg')){
          targets.add(element);
        }
      }
      textNode = walker.nextNode();
    }

    document.body.querySelectorAll('input, textarea, select').forEach(element => {
      if(!element.closest('svg')){
        targets.add(element);
      }
    });

    const activePage = document.querySelector('.workspace-page:not([hidden])')
      || document.querySelector('#welcomeScreen:not([hidden])');
    let updatedCount = 0;
    let targetCount = 0;
    let activePageTargetCount = 0;
    let unscaledActivePageTargets = 0;
    targets.forEach(element => {
      if(element.dataset.roadmapTextScale === String(scale)){
        targetCount += 1;
        if(activePage?.contains(element)){
          activePageTargetCount += 1;
        }
        return;
      }
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
      if(!Number.isFinite(fontSize) || fontSize <= 0){
        return;
      }
      element.style.setProperty('font-size', `${fontSize * scale}px`, 'important');
      element.dataset.roadmapTextScale = String(scale);
      targetCount += 1;
      updatedCount += 1;
      if(activePage?.contains(element)){
        activePageTargetCount += 1;
      }
    });
    if(activePage){
      activePage.querySelectorAll('[data-roadmap-text-scale]').forEach(element => {
        if(element.dataset.roadmapTextScale !== String(scale)){
          unscaledActivePageTargets += 1;
        }
      });
    }
    return { updatedCount, targetCount, activePageTargetCount, unscaledActivePageTargets };
  }, factor);
}

module.exports = { applyEnlargedUiText };
