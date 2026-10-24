(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const attachedLists = new WeakMap();
  const TAB_SELECTOR = '[role="tab"]';

  function getTabs(tabList){
    return Array.from(tabList.querySelectorAll(TAB_SELECTOR)).filter(tab => (
      tab.closest('[role="tablist"]') === tabList
      && !tab.disabled
      && tab.getAttribute('aria-disabled') !== 'true'
      && !tab.closest('[hidden]')
    ));
  }

  function setRovingTabStop(tabs, activeTab){
    tabs.forEach(tab => {
      tab.tabIndex = tab === activeTab ? 0 : -1;
    });
  }

  function attach(tabList){
    if(!tabList || tabList.nodeType !== 1 || tabList.getAttribute('role') !== 'tablist'){
      return null;
    }
    const existingDetach = attachedLists.get(tabList);
    if(existingDetach){
      return existingDetach;
    }
    const onFocusIn = event => {
      const tab = event.target?.closest?.(TAB_SELECTOR);
      const tabs = getTabs(tabList);
      if(tabs.includes(tab)){
        setRovingTabStop(tabs, tab);
      }
    };

    const onKeyDown = event => {
      if(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey){
        return;
      }
      const tabs = getTabs(tabList);
      if(tabs.length < 2){
        return;
      }
      const currentTab = event.target?.closest?.(TAB_SELECTOR);
      const currentIndex = tabs.indexOf(currentTab);
      if(currentIndex < 0){
        return;
      }

      const vertical = tabList.getAttribute('aria-orientation') === 'vertical';
      const direction = global.getComputedStyle?.(tabList)?.direction
        || tabList.closest('[dir]')?.getAttribute('dir')
        || 'ltr';
      let nextIndex = currentIndex;
      if(event.key === 'Home'){
        nextIndex = 0;
      }else if(event.key === 'End'){
        nextIndex = tabs.length - 1;
      }else if(vertical && event.key === 'ArrowDown'){
        nextIndex = (currentIndex + 1) % tabs.length;
      }else if(vertical && event.key === 'ArrowUp'){
        nextIndex = (currentIndex + tabs.length - 1) % tabs.length;
      }else if(!vertical && event.key === 'ArrowRight'){
        nextIndex = (currentIndex + (direction === 'rtl' ? tabs.length - 1 : 1)) % tabs.length;
      }else if(!vertical && event.key === 'ArrowLeft'){
        nextIndex = (currentIndex + (direction === 'rtl' ? 1 : tabs.length - 1)) % tabs.length;
      }else{
        return;
      }

      event.preventDefault();
      tabs[nextIndex].focus();
    };

    const detach = () => {
      tabList.removeEventListener('focusin', onFocusIn);
      tabList.removeEventListener('keydown', onKeyDown);
      attachedLists.delete(tabList);
    };
    attachedLists.set(tabList, detach);
    tabList.addEventListener('focusin', onFocusIn);
    tabList.addEventListener('keydown', onKeyDown);
    return detach;
  }

  Shared.tabListKeyboard = Object.freeze({ attach });
})(typeof window !== 'undefined' ? window : globalThis);
