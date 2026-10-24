(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const attachedMenus = new WeakMap();
  const DEFAULT_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

  function getItems(menu, selector){
    return Array.from(menu.querySelectorAll(selector)).filter(item => (
      item.closest('[role="menu"]') === menu
      && !item.disabled
      && item.getAttribute('aria-disabled') !== 'true'
      && !item.closest('[hidden]')
      && item.getAttribute('aria-hidden') !== 'true'
    ));
  }

  function focusItem(items, index){
    if(!items.length){
      return false;
    }
    items.forEach((item, itemIndex) => {
      item.tabIndex = itemIndex === index ? 0 : -1;
    });
    items[index].focus();
    return true;
  }

  function attach(menu, options = {}){
    if(!menu || menu.nodeType !== 1 || menu.getAttribute('role') !== 'menu'){
      return null;
    }
    const existing = attachedMenus.get(menu);
    if(existing){
      return existing;
    }

    const itemSelector = typeof options.itemSelector === 'string' && options.itemSelector.trim()
      ? options.itemSelector
      : DEFAULT_ITEM_SELECTOR;
    let trigger = null;
    let destroyed = false;

    const setExpanded = (target, expanded) => {
      if(options.manageTriggerState === false || !target || typeof target.setAttribute !== 'function'){
        return;
      }
      target.setAttribute('aria-haspopup', 'menu');
      target.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if(menu.id){
        target.setAttribute('aria-controls', menu.id);
      }
    };

    const close = (closeOptions = {}) => {
      const previousTrigger = trigger;
      const wasOpen = !menu.hidden;
      menu.hidden = true;
      if(previousTrigger){
        setExpanded(previousTrigger, false);
      }
      trigger = null;
      if(typeof options.onClose === 'function' && wasOpen){
        options.onClose({ reason: closeOptions.reason || 'close', trigger: previousTrigger, menu });
      }
      if(closeOptions.restoreFocus){
        const focusTarget = typeof options.getFocusTarget === 'function'
          ? options.getFocusTarget(previousTrigger) || previousTrigger
          : previousTrigger;
        if(focusTarget?.isConnected && !focusTarget.disabled){
          focusTarget.focus();
        }
      }
      return wasOpen;
    };

    const open = (nextTrigger, openOptions = {}) => {
      if(destroyed){
        return false;
      }
      if(trigger && trigger !== nextTrigger){
        setExpanded(trigger, false);
      }
      trigger = nextTrigger || null;
      menu.hidden = false;
      if(trigger){
        setExpanded(trigger, true);
      }
      const items = getItems(menu, itemSelector);
      if(!items.length){
        return false;
      }
      const index = openOptions.focus === 'last' ? items.length - 1 : 0;
      return focusItem(items, index);
    };

    const onKeyDown = event => {
      if(event.altKey || event.ctrlKey || event.metaKey){
        return;
      }
      const items = getItems(menu, itemSelector);
      if(!items.length){
        return;
      }
      const current = event.target?.closest?.(itemSelector);
      const currentIndex = items.indexOf(current);
      if(currentIndex < 0){
        return;
      }
      let nextIndex = currentIndex;
      if(event.key === 'ArrowDown'){
        nextIndex = (currentIndex + 1) % items.length;
      }else if(event.key === 'ArrowUp'){
        nextIndex = (currentIndex + items.length - 1) % items.length;
      }else if(event.key === 'Home'){
        nextIndex = 0;
      }else if(event.key === 'End'){
        nextIndex = items.length - 1;
      }else if(event.key === 'Escape'){
        event.preventDefault();
        close({ reason: 'escape', restoreFocus: true });
        return;
      }else if(event.key === 'Tab'){
        close({ reason: 'tab', restoreFocus: true });
        return;
      }else{
        return;
      }
      event.preventDefault();
      focusItem(items, nextIndex);
    };

    menu.addEventListener('keydown', onKeyDown);
    const controller = Object.freeze({
      open,
      close,
      destroy(){
        if(destroyed){
          return;
        }
        close({ reason: 'destroy', restoreFocus: false });
        destroyed = true;
        menu.removeEventListener('keydown', onKeyDown);
        attachedMenus.delete(menu);
      }
    });
    attachedMenus.set(menu, controller);
    return controller;
  }

  Shared.menuKeyboard = Object.freeze({ attach });
})(typeof window !== 'undefined' ? window : globalThis);
