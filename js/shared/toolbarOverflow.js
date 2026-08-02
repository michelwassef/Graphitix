(function initToolbarOverflow(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const doc = global.document || null;
  const EDGE_EPSILON = 1;
  const SCROLL_PADDING = 8;
  const DEFAULT_POPUP_OFFSET = 6;
  const DEFAULT_POPUP_MARGIN = 6;
  const DEFAULT_POPUP_Z_INDEX = 12050;
  const SECTION_SELECTOR = '.workspace-toolbar__section[data-toolbar-section-id]';
  const SHELL_SELECTOR = '.workspace-toolbar__overflow-shell[data-toolbar-overflow-shell="1"]';
  const VIEWPORT_SELECTOR = '.workspace-toolbar__overflow-viewport[data-toolbar-overflow-viewport="1"]';
  const TRACK_SELECTOR = '.workspace-toolbar__overflow-track[data-toolbar-overflow-track="1"]';

  const toolbarStates = new WeakMap();
  const sectionStates = new WeakMap();
  const floatingRecords = new Map();
  let floatingViewportHandler = null;
  let floatingViewportFrame = null;

  function logDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: toolbarOverflow ' + message, payload || {});
    }
  }

  function scheduleFrame(callback){
    if(typeof global.requestAnimationFrame === 'function'){
      return global.requestAnimationFrame(callback);
    }
    return global.setTimeout(callback, 16);
  }

  function cancelFrame(handle){
    if(handle == null){ return; }
    if(typeof global.cancelAnimationFrame === 'function'){
      global.cancelAnimationFrame(handle);
      return;
    }
    global.clearTimeout?.(handle);
  }

  function createChevronButton(direction){
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `workspace-toolbar__overflow-button workspace-toolbar__overflow-button--${direction}`;
    button.dataset.toolbarOverflowDirection = direction;
    button.dataset.sessionIgnoreDirty = '1';
    button.dataset.sessionAffectsPayload = '0';
    button.setAttribute('aria-label', direction === 'previous' ? 'Scroll toolbar left' : 'Scroll toolbar right');
    button.setAttribute('title', direction === 'previous' ? 'Scroll toolbar left' : 'Scroll toolbar right');
    button.hidden = true;

    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', direction === 'previous'
      ? 'M12.9 3.8 6.7 10l6.2 6.2-1.4 1.4L3.9 10l7.6-7.6 1.4 1.4Z'
      : 'm7.1 3.8 1.4-1.4 7.6 7.6-7.6 7.6-1.4-1.4 6.2-6.2-6.2-6.2Z');
    svg.appendChild(path);
    button.appendChild(svg);
    return button;
  }

  function getSectionState(target){
    if(!target){ return null; }
    if(sectionStates.has(target)){
      return sectionStates.get(target);
    }
    const section = typeof target.closest === 'function' ? target.closest(SECTION_SELECTOR) : null;
    return section ? sectionStates.get(section) || null : null;
  }

  function getToolbarOwnerId(toolbar){
    if(!toolbar){ return null; }
    let cursor = toolbar;
    while(cursor && cursor !== doc){
      const dataset = cursor.dataset || null;
      const value = String(dataset?.workspaceTabId || dataset?.tabId || '').trim();
      if(value){ return value; }
      cursor = cursor.parentElement || null;
    }
    try{
      return String(global.Main?.session?.getActiveTab?.()?.id || '').trim() || null;
    }catch(_err){
      return null;
    }
  }

  function isElementVisible(element){
    if(!element || element.hidden){ return false; }
    if(typeof global.getComputedStyle !== 'function'){ return true; }
    const style = global.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function collectScrollItems(state){
    if(!state?.track){ return []; }
    const visibleHost = state.track.querySelector('.font-toolbar-host.font-toolbar-host--visible');
    if(visibleHost){
      const hostChildren = Array.from(visibleHost.children).filter(isElementVisible);
      if(hostChildren.length){ return hostChildren; }
    }
    const buttons = state.track.querySelector('.workspace-toolbar__buttons');
    if(buttons){
      const buttonChildren = Array.from(buttons.children).filter(isElementVisible);
      if(buttonChildren.length){ return buttonChildren; }
    }
    const form = state.track.querySelector('.workspace-toolbar__form');
    if(form){
      const formChildren = Array.from(form.children).filter(isElementVisible);
      if(formChildren.length){ return formChildren; }
    }
    return Array.from(state.track.children).filter(element => {
      if(!isElementVisible(element)){ return false; }
      if(element.matches('.workspace-toolbar__caption, .workspace-toolbar__transform-custom-dropdown')){
        return false;
      }
      return true;
    });
  }

  function resolveScrollBehavior(requested){
    if(requested === 'auto' || requested === 'instant'){
      return 'auto';
    }
    try{
      if(global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){
        return 'auto';
      }
    }catch(_err){}
    return 'smooth';
  }

  function setScrollPosition(viewport, left, behavior){
    if(!viewport){ return; }
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const next = Math.max(0, Math.min(Number(left) || 0, maxScroll));
    const resolvedBehavior = resolveScrollBehavior(behavior);
    if(resolvedBehavior === 'auto'){
      // Direct assignment is intentionally used for owner/section resets and
      // focus reveal. scrollTo({ behavior: 'auto' }) would still inherit the
      // viewport's CSS scroll-behavior:smooth and leak an animated old offset.
      viewport.scrollLeft = next;
      return;
    }
    if(typeof viewport.scrollTo === 'function'){
      try{
        viewport.scrollTo({ left: next, behavior: resolvedBehavior });
        return;
      }catch(_err){}
    }
    viewport.scrollLeft = next;
  }

  function measureNaturalOverflow(state){
    if(!state?.shell || !state?.track){ return false; }
    const shellRect = state.shell.getBoundingClientRect?.();
    const trackRect = state.track.getBoundingClientRect?.();
    const shellWidth = Math.max(0, Number(state.shell.clientWidth) || Number(shellRect?.width) || 0);
    const contentWidth = Math.max(0, Number(state.track.scrollWidth) || Number(trackRect?.width) || 0);
    if(shellWidth <= 0 || contentWidth <= 0){
      const viewport = state.viewport;
      return Math.max(0, Number(viewport?.scrollWidth) || 0) - Math.max(0, Number(viewport?.clientWidth) || 0) > EDGE_EPSILON;
    }
    return contentWidth - shellWidth > EDGE_EPSILON;
  }

  function setDirectionAvailability(button, available){
    if(!button){ return; }
    button.disabled = !available;
    button.setAttribute('aria-hidden', available ? 'false' : 'true');
    button.classList.toggle('workspace-toolbar__overflow-button--visible', available);
  }

  function updateDirectionalState(state){
    if(!state?.viewport){ return; }
    const viewport = state.viewport;
    const hasOverflow = measureNaturalOverflow(state);

    state.shell.dataset.toolbarOverflow = hasOverflow ? '1' : '0';
    state.previousButton.hidden = !hasOverflow;
    state.nextButton.hidden = !hasOverflow;

    if(!hasOverflow){
      if(viewport.scrollLeft !== 0){ viewport.scrollLeft = 0; }
      setDirectionAvailability(state.previousButton, false);
      setDirectionAvailability(state.nextButton, false);
      return;
    }

    // Reading the scroll range after exposing the arrow slots is intentional:
    // their grid columns reduce the viewport width and therefore define the
    // actual owner-visible range that the controls must traverse.
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const canScrollPrevious = viewport.scrollLeft > EDGE_EPSILON;
    const canScrollNext = viewport.scrollLeft < maxScroll - EDGE_EPSILON;
    setDirectionAvailability(state.previousButton, canScrollPrevious);
    setDirectionAvailability(state.nextButton, canScrollNext);
  }

  function adoptDirectSectionChildren(state){
    if(!state?.section || !state?.track || !state?.shell){ return 0; }
    const additions = Array.from(state.section.children)
      .filter(child => child !== state.shell);
    additions.forEach(child => state.track.appendChild(child));
    return additions.length;
  }

  function refreshSection(state){
    if(!state || state.disposed){ return; }
    state.refreshFrame = null;
    adoptDirectSectionChildren(state);
    updateDirectionalState(state);
  }

  function scheduleSectionRefresh(state){
    if(!state || state.disposed || state.refreshFrame != null){ return; }
    state.refreshFrame = scheduleFrame(() => refreshSection(state));
  }

  function revealElementInState(state, element, options = {}){
    if(!state?.viewport || !element || !state.viewport.contains(element)){ return false; }
    if(element.closest?.('[data-toolbar-floating-overlay="1"]')){ return false; }
    const viewportRect = state.viewport.getBoundingClientRect?.();
    const elementRect = element.getBoundingClientRect?.();
    if(!viewportRect || !elementRect){ return false; }
    let target = state.viewport.scrollLeft;
    if(elementRect.left < viewportRect.left + SCROLL_PADDING){
      target -= (viewportRect.left + SCROLL_PADDING) - elementRect.left;
    }else if(elementRect.right > viewportRect.right - SCROLL_PADDING){
      target += elementRect.right - (viewportRect.right - SCROLL_PADDING);
    }else{
      return false;
    }
    setScrollPosition(state.viewport, target, options.behavior || 'auto');
    scheduleSectionRefresh(state);
    return true;
  }

  function scrollByItem(state, direction){
    if(!state?.viewport){ return; }
    const viewport = state.viewport;
    const viewportRect = viewport.getBoundingClientRect?.();
    const items = collectScrollItems(state);
    let target = viewport.scrollLeft;

    if(viewportRect && items.length){
      if(direction === 'previous'){
        for(let index = items.length - 1; index >= 0; index -= 1){
          const rect = items[index].getBoundingClientRect?.();
          if(rect && rect.left < viewportRect.left - EDGE_EPSILON){
            target -= (viewportRect.left + SCROLL_PADDING) - rect.left;
            break;
          }
        }
      }else{
        for(let index = 0; index < items.length; index += 1){
          const rect = items[index].getBoundingClientRect?.();
          if(rect && rect.right > viewportRect.right + EDGE_EPSILON){
            target += rect.right - (viewportRect.right - SCROLL_PADDING);
            break;
          }
        }
      }
    }

    if(Math.abs(target - viewport.scrollLeft) <= EDGE_EPSILON){
      const page = Math.max(80, viewport.clientWidth * 0.8);
      target = viewport.scrollLeft + (direction === 'previous' ? -page : page);
    }
    setScrollPosition(viewport, target, 'smooth');
    scheduleSectionRefresh(state);
  }

  function handleScrollButtonClick(state, direction, event){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    scrollByItem(state, direction);
  }

  function handleShiftWheel(state, event){
    if(!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey){ return; }
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if(!Number.isFinite(delta) || Math.abs(delta) < 0.5){ return; }
    const maxScroll = Math.max(0, state.viewport.scrollWidth - state.viewport.clientWidth);
    if(maxScroll <= EDGE_EPSILON){ return; }
    event.preventDefault();
    state.viewport.scrollLeft += delta;
    scheduleSectionRefresh(state);
  }

  function unwrapStaleShell(section){
    const shell = Array.from(section?.children || [])
      .find(child => child?.matches?.(SHELL_SELECTOR)) || null;
    if(!shell){ return; }
    const track = shell.querySelector(TRACK_SELECTOR);
    if(track){
      Array.from(track.children).forEach(child => section.insertBefore(child, shell));
    }
    shell.remove();
  }

  function attachSection(section){
    if(!section || sectionStates.has(section)){ return sectionStates.get(section) || null; }
    // A stale wrapper can only remain after a script hot-reload or interrupted
    // teardown. Rebuild it rather than adopting a shell with unknown listeners.
    unwrapStaleShell(section);
    const originalChildren = Array.from(section.children);
    const shell = doc.createElement('div');
    shell.className = 'workspace-toolbar__overflow-shell';
    shell.dataset.toolbarOverflowShell = '1';
    shell.dataset.toolbarOverflow = '0';

    const previousButton = createChevronButton('previous');
    const nextButton = createChevronButton('next');
    const viewport = doc.createElement('div');
    viewport.className = 'workspace-toolbar__overflow-viewport';
    viewport.dataset.toolbarOverflowViewport = '1';
    viewport.tabIndex = -1;
    const sectionLabel = section.getAttribute('aria-label');
    viewport.setAttribute('aria-label', sectionLabel ? `${sectionLabel} overflow` : 'Toolbar overflow');

    const track = doc.createElement('div');
    track.className = 'workspace-toolbar__overflow-track';
    track.dataset.toolbarOverflowTrack = '1';
    originalChildren.forEach(child => track.appendChild(child));
    viewport.appendChild(track);

    shell.appendChild(previousButton);
    shell.appendChild(viewport);
    shell.appendChild(nextButton);
    section.appendChild(shell);

    const state = {
      section,
      shell,
      viewport,
      track,
      previousButton,
      nextButton,
      refreshFrame: null,
      ownerId: null,
      resizeObserver: null,
      disposed: false,
      handlers: Object.create(null)
    };

    state.handlers.previousClick = event => handleScrollButtonClick(state, 'previous', event);
    state.handlers.nextClick = event => handleScrollButtonClick(state, 'next', event);
    state.handlers.scroll = () => scheduleSectionRefresh(state);
    state.handlers.focusin = event => revealElementInState(state, event.target, { behavior: 'auto' });
    state.handlers.wheel = event => handleShiftWheel(state, event);
    previousButton.addEventListener('click', state.handlers.previousClick);
    nextButton.addEventListener('click', state.handlers.nextClick);
    viewport.addEventListener('scroll', state.handlers.scroll, { passive: true });
    section.addEventListener('focusin', state.handlers.focusin);
    viewport.addEventListener('wheel', state.handlers.wheel, { passive: false });

    if(typeof global.ResizeObserver === 'function'){
      state.resizeObserver = new global.ResizeObserver(() => scheduleSectionRefresh(state));
      state.resizeObserver.observe(viewport);
      state.resizeObserver.observe(track);
    }

    sectionStates.set(section, state);
    scheduleSectionRefresh(state);
    return state;
  }

  function detachSection(state){
    if(!state || state.disposed){ return; }
    state.disposed = true;
    cancelFrame(state.refreshFrame);
    state.refreshFrame = null;
    state.resizeObserver?.disconnect?.();
    state.previousButton?.removeEventListener?.('click', state.handlers.previousClick);
    state.nextButton?.removeEventListener?.('click', state.handlers.nextClick);
    state.viewport?.removeEventListener?.('scroll', state.handlers.scroll);
    state.section?.removeEventListener?.('focusin', state.handlers.focusin);
    state.viewport?.removeEventListener?.('wheel', state.handlers.wheel);

    Array.from(floatingRecords.entries()).forEach(([popup, record]) => {
      if(state.section?.contains?.(popup) || state.section?.contains?.(record.anchor)){
        clearPopup(popup);
      }
    });
    if(state.track && state.shell?.parentNode === state.section){
      Array.from(state.track.children).forEach(child => state.section.insertBefore(child, state.shell));
      state.shell.remove();
    }
    sectionStates.delete(state.section);
  }

  function attach(toolbar){
    if(!toolbar || !doc){ return null; }
    let state = toolbarStates.get(toolbar) || null;
    if(!state){
      state = {
        toolbar,
        sections: new Set(),
        resizeHandler: null,
        disposed: false
      };
      state.resizeHandler = () => state.sections.forEach(scheduleSectionRefresh);
      global.addEventListener?.('resize', state.resizeHandler, { passive: true });
      toolbarStates.set(toolbar, state);
    }
    Array.from(state.sections).forEach(sectionState => {
      if(!toolbar.contains(sectionState.section)){
        detachSection(sectionState);
        state.sections.delete(sectionState);
      }
    });
    toolbar.querySelectorAll(SECTION_SELECTOR).forEach(section => {
      const sectionState = attachSection(section);
      if(sectionState){ state.sections.add(sectionState); }
    });
    state.sections.forEach(scheduleSectionRefresh);
    logDebug('toolbar attached', {
      toolbarKey: toolbar.dataset?.toolbarKey || '',
      sectionCount: state.sections.size
    });
    return state;
  }

  function detach(toolbar){
    const state = toolbarStates.get(toolbar);
    if(!state || state.disposed){ return false; }
    state.disposed = true;
    global.removeEventListener?.('resize', state.resizeHandler);
    state.sections.forEach(detachSection);
    state.sections.clear();
    toolbarStates.delete(toolbar);
    return true;
  }

  function refresh(target){
    if(!target){ return false; }
    let toolbarState = toolbarStates.get(target);
    if(!toolbarState && target.matches?.('.workspace-toolbar')){
      toolbarState = attach(target);
    }
    if(toolbarState){
      toolbarState.sections.forEach(scheduleSectionRefresh);
      return true;
    }
    const sectionState = getSectionState(target);
    if(sectionState){
      scheduleSectionRefresh(sectionState);
      return true;
    }
    const toolbar = typeof target.closest === 'function' ? target.closest('.workspace-toolbar') : null;
    if(toolbar && toolbarStates.has(toolbar)){
      toolbarStates.get(toolbar).sections.forEach(scheduleSectionRefresh);
      return true;
    }
    return false;
  }

  function reset(target, options = {}){
    const state = getSectionState(target);
    if(!state?.viewport){ return false; }
    setScrollPosition(state.viewport, 0, options.behavior || 'auto');
    scheduleSectionRefresh(state);
    return true;
  }

  function activateSection(toolbar, section, options = {}){
    if(!toolbar || !section){ return false; }
    attach(toolbar);
    const state = getSectionState(section);
    if(!state){ return false; }
    const ownerId = String(options.ownerId || getToolbarOwnerId(toolbar) || '').trim() || null;
    const ownerChanged = state.ownerId !== ownerId;
    state.ownerId = ownerId;
    if(options.reset === true || ownerChanged){
      reset(section, { behavior: 'auto' });
    }else{
      scheduleSectionRefresh(state);
    }
    return true;
  }

  function revealElement(element, options = {}){
    const state = getSectionState(element);
    return revealElementInState(state, element, options);
  }

  function snapshotInlineStyle(element, properties){
    const snapshot = Object.create(null);
    properties.forEach(property => {
      snapshot[property] = element.style.getPropertyValue(property);
    });
    return snapshot;
  }

  function restoreInlineStyle(element, snapshot){
    if(!element || !snapshot){ return; }
    Object.keys(snapshot).forEach(property => {
      const value = snapshot[property];
      if(value){
        element.style.setProperty(property, value);
      }else{
        element.style.removeProperty(property);
      }
    });
  }

  function readComputedPixelLimit(element, propertyName){
    if(!element || typeof global.getComputedStyle !== 'function'){ return null; }
    const raw = String(global.getComputedStyle(element).getPropertyValue(propertyName) || '').trim();
    if(!raw.endsWith('px')){ return null; }
    const numeric = Number.parseFloat(raw);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  function ensureFloatingViewportWatcher(){
    if(floatingViewportHandler || !global.addEventListener){ return; }
    floatingViewportHandler = () => {
      if(floatingViewportFrame != null){ return; }
      floatingViewportFrame = scheduleFrame(() => {
        floatingViewportFrame = null;
        Array.from(floatingRecords.entries()).forEach(([popup, record]) => {
          if(!popup?.isConnected || !record.anchor?.isConnected || popup.hidden){
            clearPopup(popup);
            return;
          }
          positionPopup(popup, record.anchor, record.options);
        });
      });
    };
    global.addEventListener('resize', floatingViewportHandler, true);
    global.addEventListener('scroll', floatingViewportHandler, true);
  }

  function detachFloatingViewportWatcherIfIdle(){
    if(floatingRecords.size || !floatingViewportHandler){ return; }
    global.removeEventListener?.('resize', floatingViewportHandler, true);
    global.removeEventListener?.('scroll', floatingViewportHandler, true);
    floatingViewportHandler = null;
    cancelFrame(floatingViewportFrame);
    floatingViewportFrame = null;
  }

  function positionPopup(popup, anchor, options = {}){
    if(!popup || !anchor || typeof anchor.getBoundingClientRect !== 'function'){
      return false;
    }
    const anchorRect = anchor.getBoundingClientRect();
    if(!Number.isFinite(anchorRect.left) || !Number.isFinite(anchorRect.top)){
      return false;
    }
    let record = floatingRecords.get(popup);
    if(!record){
      record = {
        anchor,
        options: {},
        inlineStyle: snapshotInlineStyle(popup, [
          'position', 'left', 'top', 'right', 'bottom', 'width', 'min-width',
          'max-width', 'max-height', 'overflow-y', 'z-index'
        ])
      };
      floatingRecords.set(popup, record);
    }
    record.anchor = anchor;
    record.options = Object.assign({}, options);
    restoreInlineStyle(popup, record.inlineStyle);

    popup.classList.add('workspace-toolbar__floating-overlay');
    popup.dataset.toolbarFloatingOverlay = '1';
    popup.style.position = 'fixed';
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';
    popup.style.zIndex = String(Number.isFinite(options.zIndex) ? options.zIndex : DEFAULT_POPUP_Z_INDEX);
    const viewportWidth = Math.max(0, Number(global.innerWidth) || doc?.documentElement?.clientWidth || 0);
    const viewportHeight = Math.max(0, Number(global.innerHeight) || doc?.documentElement?.clientHeight || 0);
    const margin = Math.max(0, Number.isFinite(options.margin) ? options.margin : DEFAULT_POPUP_MARGIN);
    const availableWidth = viewportWidth > 0 ? Math.max(0, viewportWidth - (margin * 2)) : Number.POSITIVE_INFINITY;
    const requestedMinWidth = Math.max(0, Number(options.minWidth) || 0);
    if(requestedMinWidth > 0){
      popup.style.minWidth = `${Math.min(requestedMinWidth, availableWidth)}px`;
    }
    if(options.matchAnchorWidth === true){
      const width = Math.min(availableWidth, Math.max(requestedMinWidth, Math.ceil(anchorRect.width)));
      popup.style.width = `${Math.max(0, width)}px`;
    }

    let popupRect = popup.getBoundingClientRect();
    if(Number.isFinite(availableWidth) && popupRect.width > availableWidth){
      popup.style.maxWidth = `${availableWidth}px`;
      popupRect = popup.getBoundingClientRect();
    }
    const offset = Number.isFinite(options.offset) ? options.offset : DEFAULT_POPUP_OFFSET;
    const measuredPopupWidth = Math.max(popupRect.width, popup.offsetWidth || 0, Math.min(requestedMinWidth, availableWidth));
    const popupWidth = Number.isFinite(availableWidth)
      ? Math.min(measuredPopupWidth, availableWidth)
      : measuredPopupWidth;
    const popupHeight = Math.max(popupRect.height, popup.offsetHeight || 0);

    let left = options.align === 'end'
      ? anchorRect.right - popupWidth
      : anchorRect.left;
    if(viewportWidth > 0){
      left = Math.max(margin, Math.min(left, viewportWidth - popupWidth - margin));
    }

    const belowTop = anchorRect.bottom + offset;
    const belowSpace = viewportHeight > 0 ? viewportHeight - belowTop - margin : Number.POSITIVE_INFINITY;
    const aboveSpace = Math.max(0, anchorRect.top - margin - offset);
    const preferAbove = options.placement === 'top'
      || (options.placement !== 'bottom' && popupHeight > belowSpace && aboveSpace > belowSpace);
    let top = preferAbove
      ? anchorRect.top - offset - popupHeight
      : belowTop;
    if(viewportHeight > 0){
      top = Math.max(margin, Math.min(top, viewportHeight - Math.min(popupHeight, viewportHeight - (margin * 2)) - margin));
    }

    if(options.constrainHeight !== false && viewportHeight > 0){
      const viewportCapacity = Math.max(0, viewportHeight - (margin * 2));
      const minimumUsableHeight = Math.min(80, viewportCapacity);
      const available = Math.min(
        viewportCapacity,
        Math.max(minimumUsableHeight, preferAbove ? aboveSpace : belowSpace)
      );
      const requestedLimit = Number.isFinite(options.maxHeight) ? Math.max(0, options.maxHeight) : null;
      const cssLimit = readComputedPixelLimit(popup, 'max-height');
      const limits = [available, requestedLimit, cssLimit].filter(Number.isFinite);
      const maxHeight = limits.length ? Math.min(...limits) : available;
      popup.style.maxHeight = `${Math.max(0, Math.floor(maxHeight))}px`;
      popup.style.overflowY = 'auto';
    }
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
    ensureFloatingViewportWatcher();
    return true;
  }

  function clearPopup(popup){
    if(!popup){ return false; }
    const record = floatingRecords.get(popup);
    if(record){
      restoreInlineStyle(popup, record.inlineStyle);
      floatingRecords.delete(popup);
    }
    popup.classList.remove('workspace-toolbar__floating-overlay');
    if(popup.dataset?.toolbarFloatingOverlay === '1'){
      delete popup.dataset.toolbarFloatingOverlay;
    }
    detachFloatingViewportWatcherIfIdle();
    return !!record;
  }

  function isOverflowViewport(node){
    return !!node?.closest?.(VIEWPORT_SELECTOR);
  }

  Shared.toolbarOverflow = Object.freeze({
    attach,
    detach,
    refresh,
    reset,
    activateSection,
    revealElement,
    positionPopup,
    clearPopup,
    isOverflowViewport
  });
})(typeof window !== 'undefined' ? window : globalThis);
