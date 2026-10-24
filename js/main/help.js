(function(global){
  'use strict';

  const doc = global.document;
  if(!doc){ return; }

  const dialog = doc.getElementById('helpAboutDialog');
  const closeButton = doc.getElementById('helpAboutDialogClose');
  const tabs = Array.from(doc.querySelectorAll('#helpAboutDialog [data-help-section-target]'));
  const panels = Array.from(doc.querySelectorAll('#helpAboutDialog [data-help-section]'));

  function setActiveSection(sectionId, options = {}){
    const selectedTab = tabs.find(tab => tab.dataset.helpSectionTarget === sectionId);
    if(!selectedTab){ return false; }
    tabs.forEach(tab => {
      const selected = tab === selectedTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => {
      panel.hidden = panel.dataset.helpSection !== sectionId;
    });
    if(options.focus){ selectedTab.focus(); }
    return true;
  }

  function closeDialog(options = {}){
    if(!dialog || dialog.hidden){ return false; }
    const modal = global.Shared?.modalLifecycle;
    if(modal?.isOpen?.(dialog)){
      return modal.close(dialog, { restoreFocus: options.restoreFocus !== false });
    }
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
    if(options.restoreFocus !== false){ options.returnFocus?.focus?.(); }
    return true;
  }

  function openDialog(trigger){
    if(!dialog || !dialog.hidden){ return false; }
    setActiveSection('getting-started');
    const modal = global.Shared?.modalLifecycle;
    if(typeof modal?.open === 'function'){
      return !!modal.open(dialog, {
        initialFocus: '#helpAboutDialogClose',
        returnFocus: trigger || doc.activeElement,
        onEscape: () => closeDialog({ reason: 'escape' })
      });
    }
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    closeButton?.focus?.();
    return true;
  }

  function handleClick(event){
    const target = event.target;
    if(!target || typeof target.closest !== 'function'){ return; }
    const openTrigger = target.closest('[data-help-open]');
    if(openTrigger){
      event.preventDefault();
      openDialog(openTrigger);
      return;
    }
    const tab = target.closest('#helpAboutDialog [data-help-section-target]');
    if(tab){
      event.preventDefault();
      setActiveSection(tab.dataset.helpSectionTarget);
      return;
    }
    if(target === closeButton || target.hasAttribute('data-help-dialog-close')){
      event.preventDefault();
      closeDialog({ reason: target === closeButton ? 'close-button' : 'backdrop' });
    }
  }

  function handleTabKeydown(event){
    const currentTab = event.target?.closest?.('#helpAboutDialog [data-help-section-target]');
    if(!currentTab){ return; }
    const currentIndex = tabs.indexOf(currentTab);
    let nextIndex = currentIndex;
    if(event.key === 'ArrowRight'){
      nextIndex = (currentIndex + 1) % tabs.length;
    }else if(event.key === 'ArrowLeft'){
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }else if(event.key === 'Home'){
      nextIndex = 0;
    }else if(event.key === 'End'){
      nextIndex = tabs.length - 1;
    }else{
      return;
    }
    event.preventDefault();
    setActiveSection(tabs[nextIndex]?.dataset?.helpSectionTarget, { focus: true });
  }

  if(dialog){
    doc.addEventListener('click', handleClick);
    dialog.addEventListener('keydown', handleTabKeydown);
    setActiveSection('getting-started');
  }

  global.GraphitixHelp = Object.freeze({
    open: openDialog,
    close: closeDialog,
    setActiveSection
  });
})(window);
