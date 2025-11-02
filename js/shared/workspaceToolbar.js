(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const workspaceToolbar = Shared.workspaceToolbar = Shared.workspaceToolbar || {};
  const doc = global.document;

  const ICON_PATHS = Object.freeze({
    open: {
      viewBox: '0 0 24 24',
      elements: [
        {
          tag: 'path',
          attrs: {
            fill: 'currentColor',
            d: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8z'
          }
        }
      ]
    },
    import: 'M5 4a2 2 0 0 0-2 2v3h2V6h14v4h2V6a2 2 0 0 0-2-2H5Zm7 4.75a.75.75 0 0 0-.75.75v4.19l-1.47-1.47-1.06 1.06 3 3a.75.75 0 0 0 1.06 0l3-3-1.06-1.06-1.47 1.47V9.5a.75.75 0 0 0-.75-.75ZM4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1h-2v1H6v-1H4Z',
    save: {
      viewBox: '0 0 24 24',
      elements: [
        {
          tag: 'path',
          attrs: {
            fill: 'currentColor',
            d: 'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V7zm2 16H5V5h11.17L19 7.83zm-7-7c-1.66 0-3 1.34-3 3s1.34 3 3 3s3-1.34 3-3s-1.34-3-3-3M6 6h9v4H6z'
          }
        }
      ]
    },
    saveAs: {
      viewBox: '0 0 24 24',
      elements: [
        {
          tag: 'path',
          attrs: {
            fill: 'currentColor',
            d: 'M21 12.4V7l-4-4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.4l2-2H5V5h11.17L19 7.83v6.57zM15 15c0 1.66-1.34 3-3 3s-3-1.34-3-3s1.34-3 3-3s3 1.34 3 3M6 6h9v4H6zm13.99 10.25l1.77 1.77L16.77 23H15v-1.77zm3.26.26l-.85.85l-1.77-1.77l.85-.85c.2-.2.51-.2.71 0l1.06 1.06c.2.2.2.52 0 .71'
          }
        }
      ]
    },
    example: {
      viewBox: '0 0 32 32',
      elements: [
        {
          tag: 'path',
          attrs: {
            fill: 'none',
            stroke: 'currentColor',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'stroke-width': '2',
            d: 'M16 22V5'
          }
        },
        {
          tag: 'path',
          attrs: {
            fill: 'none',
            stroke: 'currentColor',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'stroke-width': '2',
            d: 'M9 16l7 7l7-7'
          }
        },
        {
          tag: 'path',
          attrs: {
            fill: 'none',
            stroke: 'currentColor',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'stroke-width': '2',
            d: 'M9 27h14'
          }
        }
      ]
    },
    undo: {
      viewBox: '0 0 24 24',
      elements: [
        {
          tag: 'g',
          attrs: {
            fill: 'none',
            stroke: 'currentColor',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'stroke-width': '2'
          },
          children: [
            { tag: 'path', attrs: { d: 'M9 14L4 9l5-5' } },
            {
              tag: 'path',
              attrs: {
                d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11'
              }
            }
          ]
        }
      ]
    },
    redo: {
      viewBox: '0 0 24 24',
      elements: [
        {
          tag: 'g',
          attrs: {
            fill: 'none',
            stroke: 'currentColor',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'stroke-width': '2'
          },
          children: [
            { tag: 'path', attrs: { d: 'm15 14l5-5l-5-5' } },
            {
              tag: 'path',
              attrs: {
                d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13'
              }
            }
          ]
        }
      ]
    },
    matchStyles: {
      viewBox: '0 0 32 32',
      elements: [
        {
          tag: 'path',
          attrs: {
            fill: 'currentColor',
            d: 'M27.87 4.423c.131.284.352.508.644.635l1.215.527a.453.453 0 0 1 0 .83l-1.205.527a1.22 1.22 0 0 0-.643.635l-.954 2.167c-.17.341-.683.341-.854 0l-.954-2.167a1.26 1.26 0 0 0-.643-.635l-1.205-.527a.453.453 0 0 1 0-.83l1.205-.527a1.22 1.22 0 0 0 .643-.635l.954-2.167c.17-.341.683-.341.854 0zm-11.887.742a.9.9 0 0 0 .458.438l.864.36c.26.117.26.457 0 .574l-.864.36a.85.85 0 0 0-.458.438l-.676 1.49c-.125.233-.49.233-.614 0l-.676-1.49a.9.9 0 0 0-.458-.438l-.864-.36a.309.309 0 0 1 0-.574l.864-.36a.85.85 0 0 0 .458-.438l.676-1.49c.125-.233.49-.233.614 0zM4 26l-1.662 1.627a1.146 1.146 0 0 0 0 1.625l.41.41c.44.452 1.17.452 1.61-.01L6 28.007l-.003-.003L20 14l1.674-1.667c.435-.445.435-1.24 0-1.675l-.33-.331C20.9 9.89 20 10 19.5 10.5zm21.95-9.702a.95.95 0 0 1-.46-.48l-.685-1.622c-.128-.261-.492-.261-.61 0l-.685 1.623a.95.95 0 0 1-.46.479l-.857.392c-.257.13-.257.5 0 .62l.856.392a.95.95 0 0 1 .46.48l.686 1.622c.128.261.492.261.61 0l.685-1.622a.95.95 0 0 1 .46-.48l.857-.392c.257-.13.257-.5 0-.62zM12 14a1 1 0 1 0 0-2a1 1 0 0 0 0 2m18-1a1 1 0 1 1-2 0a1 1 0 0 1 2 0M19 4a1 1 0 1 0 0-2a1 1 0 0 0 0 2m1 17a1 1 0 1 1-2 0a1 1 0 0 1 2 0'
          }
        }
      ]
    }
  });

  const DEFAULT_HINT = 'Select chart text or an axis to reveal typography and tick options.';
  const NS = 'http://www.w3.org/2000/svg';
  const toolbarConfigs = new Map();
  const UNDO_BUTTON_SELECTOR = 'button[data-undo-command="undo"]';
  const REDO_BUTTON_SELECTOR = 'button[data-undo-command="redo"]';
  const MENU_WRAPPER_SELECTOR = '.workspace-toolbar__menu';
  const MENU_TRIGGER_SELECTOR = '.workspace-toolbar__button[data-menu-id]';
  const MENU_OPEN_CLASS = 'workspace-toolbar__menu--open';
  let undoSubscriptionCleanup = null;
  let menuHandlersBound = false;

  function logDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: workspaceToolbar ' + message, payload || {});
    }
  }

  function appendSvgChildren(parent, elements){
    if(!Array.isArray(elements)){ return; }
    elements.forEach(elementSpec => {
      if(!elementSpec || typeof elementSpec !== 'object'){ return; }
      const tagName = elementSpec.tag || 'path';
      const child = doc.createElementNS(NS, tagName);
      const attrs = elementSpec.attrs || {};
      Object.keys(attrs).forEach(attr => {
        child.setAttribute(attr, attrs[attr]);
      });
      if(Array.isArray(elementSpec.children) && elementSpec.children.length){
        appendSvgChildren(child, elementSpec.children);
      }
      parent.appendChild(child);
    });
  }

  function createSvgIcon(iconKey){
    if(!doc){ return null; }
    const spec = ICON_PATHS[iconKey];
    if(!spec){
      logDebug('missing icon', { iconKey });
      return null;
    }
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('data-icon', 'toolbar');

    if(typeof spec === 'string'){
      svg.setAttribute('viewBox', '0 0 24 24');
      const path = doc.createElementNS(NS, 'path');
      path.setAttribute('d', spec);
      svg.appendChild(path);
      return svg;
    }

    const viewBox = spec.viewBox || '0 0 24 24';
    svg.setAttribute('viewBox', viewBox);
    const elements = Array.isArray(spec.elements) ? spec.elements : [];
    appendSvgChildren(svg, elements);
    return svg;
  }

  function createButton(config){
    if(!config || !doc){ return null; }
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'workspace-toolbar__button';
    if(Array.isArray(config.classes) && config.classes.length){
      button.className += ' ' + config.classes.filter(Boolean).join(' ');
    }
    if(config.id){ button.id = config.id; }
    const ariaLabel = config.ariaLabel || config.label || null;
    if(ariaLabel){ button.setAttribute('aria-label', ariaLabel); }
    if(config.title){ button.title = config.title; }
    if(config.disabled){ button.disabled = true; }
    if(config.dataset){
      Object.keys(config.dataset).forEach(key => {
        const value = config.dataset[key];
        if(value !== undefined && value !== null){
          button.dataset[key] = String(value);
        }
      });
    }

    const iconWrap = doc.createElement('span');
    iconWrap.className = 'workspace-toolbar__icon';
    const svg = config.icon ? createSvgIcon(config.icon) : null;
    if(svg){ iconWrap.appendChild(svg); }
    button.appendChild(iconWrap);

    const label = doc.createElement('span');
    label.className = 'workspace-toolbar__label';
    label.textContent = config.label || '';
    button.appendChild(label);

    return button;
  }

  function createMenuButton(config){
    if(!config || !doc){ return null; }
    const menuId = config.id || `menu-${Math.random().toString(36).slice(2)}`;
    const wrapper = doc.createElement('div');
    wrapper.className = 'workspace-toolbar__menu';
    wrapper.dataset.menuId = menuId;
    const triggerConfig = Object.assign({}, config, {
      classes: (config.classes || []).concat('workspace-toolbar__button--menu')
    });
    const trigger = createButton(triggerConfig);
    if(trigger){
      trigger.dataset.menuId = menuId;
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('data-menu-id', menuId);
      wrapper.appendChild(trigger);
    }
    const list = doc.createElement('div');
    list.className = 'workspace-toolbar__menu-list';
    list.setAttribute('role', 'menu');
    list.id = `${menuId}Menu`;
    (config.menuItems || []).forEach(item => {
      if(!item){ return; }
      const option = doc.createElement('button');
      option.type = 'button';
      option.className = 'workspace-toolbar__menu-item';
      option.setAttribute('role', 'menuitem');
      if(item.id){ option.id = item.id; }
      if(item.label){ option.textContent = item.label; }
      if(item.title){ option.title = item.title; }
      const itemAria = item.ariaLabel || null;
      if(itemAria){ option.setAttribute('aria-label', itemAria); }
      if(item.dataset){
        Object.keys(item.dataset).forEach(key => {
          const value = item.dataset[key];
          if(value !== undefined && value !== null){
            option.dataset[key] = String(value);
          }
        });
      }
      list.appendChild(option);
    });
    if(list.children.length){
      if(trigger){
        trigger.setAttribute('aria-controls', list.id);
      }
      wrapper.appendChild(list);
    }
    return wrapper;
  }

  function getMenuWrapper(trigger){
    if(!trigger){ return null; }
    return trigger.closest(MENU_WRAPPER_SELECTOR);
  }

  function closeMenu(wrapper){
    if(!wrapper){ return; }
    wrapper.classList.remove(MENU_OPEN_CLASS);
    const trigger = wrapper.querySelector(MENU_TRIGGER_SELECTOR);
    if(trigger){ trigger.setAttribute('aria-expanded', 'false'); }
  }

  function closeAllMenus(except){
    if(!doc){ return; }
    doc.querySelectorAll(`${MENU_WRAPPER_SELECTOR}.${MENU_OPEN_CLASS}`).forEach(wrapper => {
      if(wrapper !== except){
        closeMenu(wrapper);
      }
    });
  }

  function openMenu(trigger){
    if(!trigger){ return; }
    const wrapper = getMenuWrapper(trigger);
    if(!wrapper){ return; }
    closeAllMenus(wrapper);
    wrapper.classList.add(MENU_OPEN_CLASS);
    trigger.setAttribute('aria-expanded', 'true');
  }

  function toggleMenu(trigger){
    if(!trigger){ return; }
    const wrapper = getMenuWrapper(trigger);
    if(!wrapper){ return; }
    if(wrapper.classList.contains(MENU_OPEN_CLASS)){
      closeMenu(wrapper);
    } else {
      openMenu(trigger);
    }
  }

  function handleToolbarMenuClick(event){
    if(!doc){ return; }
    const trigger = event.target.closest('.workspace-toolbar__button--menu');
    if(trigger){
      event.preventDefault();
      toggleMenu(trigger);
      return;
    }
    const menuItem = event.target.closest('.workspace-toolbar__menu-item');
    if(menuItem){
      closeAllMenus();
      return;
    }
    if(!event.target.closest(MENU_WRAPPER_SELECTOR)){
      closeAllMenus();
    }
  }

  function handleToolbarMenuKeydown(event){
    if(!doc){ return; }
    if(event.key === 'Escape'){
      closeAllMenus();
      return;
    }
    const trigger = event.target.closest('.workspace-toolbar__button--menu');
    if(trigger && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')){
      event.preventDefault();
      openMenu(trigger);
    }
    if(event.key === 'Tab'){
      global.setTimeout?.(() => {
        if(!doc.activeElement || !doc.activeElement.closest(MENU_WRAPPER_SELECTOR)){
          closeAllMenus();
        }
      }, 0);
    }
  }

  function handleToolbarMenuFocus(event){
    if(!event?.target){ return; }
    if(!event.target.closest(MENU_WRAPPER_SELECTOR)){
      closeAllMenus();
    }
  }

  function ensureMenuHandlers(){
    if(menuHandlersBound || !doc){ return; }
    doc.addEventListener('click', handleToolbarMenuClick);
    doc.addEventListener('keydown', handleToolbarMenuKeydown, true);
    doc.addEventListener('focusin', handleToolbarMenuFocus);
    menuHandlersBound = true;
  }

  function createFormControl(control){
    if(!control || !doc){ return null; }
    const wrapper = doc.createElement('label');
    let className = 'workspace-toolbar__input';
    if(Array.isArray(control.classes)){
      className += ' ' + control.classes.filter(Boolean).join(' ');
    }
    wrapper.className = className;

    if(control.label){
      const label = doc.createElement('span');
      label.className = 'workspace-toolbar__input-label';
      label.textContent = control.label;
      wrapper.appendChild(label);
    }

    if(control.type === 'select'){
      const select = doc.createElement('select');
      if(control.id){ select.id = control.id; }
      if(control.name){ select.name = control.name; }
      if(control.attributes){
        Object.keys(control.attributes).forEach(key => {
          select.setAttribute(key, control.attributes[key]);
        });
      }
      if(Array.isArray(control.options)){
        control.options.forEach(optionConfig => {
          const option = doc.createElement('option');
          option.value = optionConfig.value;
          option.textContent = optionConfig.label;
          if(optionConfig.selected){ option.selected = true; }
          select.appendChild(option);
        });
      }
      wrapper.appendChild(select);
      return wrapper;
    }

    const input = doc.createElement('input');
    input.type = control.inputType || 'text';
    if(control.id){ input.id = control.id; }
    if(control.name){ input.name = control.name; }
    if(control.value !== undefined){ input.value = control.value; }
    if(control.attributes){
      Object.keys(control.attributes).forEach(key => {
        input.setAttribute(key, control.attributes[key]);
      });
    }
    wrapper.appendChild(input);
    return wrapper;
  }

  function createDockSection(section){
    if(!doc){ return null; }
    const sectionEl = doc.createElement('div');
    sectionEl.className = 'workspace-toolbar__section workspace-toolbar__section--dock';
    sectionEl.setAttribute('role', 'group');
    if(section.ariaLabel){ sectionEl.setAttribute('aria-label', section.ariaLabel); }

    const dock = doc.createElement('div');
    dock.className = 'workspace-toolbar__dock';
    const hint = doc.createElement('p');
    hint.className = 'workspace-toolbar__hint';
    hint.textContent = section.hint || DEFAULT_HINT;
    dock.appendChild(hint);

    const anchor = doc.createElement('div');
    anchor.className = 'workspace-toolbar__dock-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    if(section.hostId){ anchor.id = section.hostId; }
    if(section.scopeId){ anchor.dataset.fontToolbarScope = section.scopeId; }
    dock.appendChild(anchor);

    sectionEl.appendChild(dock);
    const caption = doc.createElement('div');
    caption.className = 'workspace-toolbar__caption';
    caption.textContent = section.caption || 'Font';
    sectionEl.appendChild(caption);
    return sectionEl;
  }

  function createButtonsSection(section){
    if(!doc){ return null; }
    const sectionEl = doc.createElement('div');
    sectionEl.className = 'workspace-toolbar__section';
    sectionEl.setAttribute('role', 'group');
    if(section.ariaLabel){ sectionEl.setAttribute('aria-label', section.ariaLabel); }
    if(section.align === 'end'){
      sectionEl.classList.add('workspace-toolbar__section--align-end');
    }

    const buttonsWrap = doc.createElement('div');
    buttonsWrap.className = 'workspace-toolbar__buttons';
    (section.buttons || []).forEach(buttonConfig => {
      if(!buttonConfig){ return; }
      const isMenu = Array.isArray(buttonConfig.menuItems) && buttonConfig.menuItems.length > 0;
      const button = isMenu ? createMenuButton(buttonConfig) : createButton(buttonConfig);
      if(button){ buttonsWrap.appendChild(button); }
    });
    sectionEl.appendChild(buttonsWrap);

    const caption = doc.createElement('div');
    caption.className = 'workspace-toolbar__caption';
    caption.textContent = section.caption || '';
    sectionEl.appendChild(caption);
    return sectionEl;
  }

  function createFormSection(section){
    if(!doc){ return null; }
    const sectionEl = doc.createElement('div');
    sectionEl.className = 'workspace-toolbar__section workspace-toolbar__section--form';
    sectionEl.setAttribute('role', 'group');
    if(section.ariaLabel){ sectionEl.setAttribute('aria-label', section.ariaLabel); }

    const form = doc.createElement('div');
    let className = 'workspace-toolbar__form';
    if(section.layout === 'checkboxes'){ className += ' workspace-toolbar__form--checkboxes'; }
    if(section.layout === 'single'){ className += ' workspace-toolbar__form--single'; }
    form.className = className;

    (section.controls || []).forEach(control => {
      const controlEl = createFormControl(control);
      if(controlEl){ form.appendChild(controlEl); }
    });
    sectionEl.appendChild(form);

    const caption = doc.createElement('div');
    caption.className = 'workspace-toolbar__caption';
    caption.textContent = section.caption || '';
    sectionEl.appendChild(caption);
    return sectionEl;
  }

  function buildToolbar(config){
    if(!doc){ return null; }
    const toolbar = doc.createElement('div');
    toolbar.className = 'workspace-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', config.ariaLabel || 'Workspace actions');

    (config.sections || []).forEach(section => {
      if(!section){ return; }
      let sectionEl = null;
      if(section.type === 'dock'){
        sectionEl = createDockSection(section);
      } else if(section.type === 'form'){
        sectionEl = createFormSection(section);
      } else {
        sectionEl = createButtonsSection(section);
      }
      if(sectionEl){ toolbar.appendChild(sectionEl); }
    });

    return toolbar;
  }

  function getUndoManager(){
    return Shared.undoManager || null;
  }

  function syncUndoButtonsAvailability(state){
    if(!doc){ return; }
    const manager = getUndoManager();
    let canUndo = false;
    let canRedo = false;
    if(state && typeof state.canUndo === 'boolean' && typeof state.canRedo === 'boolean'){
      canUndo = state.canUndo;
      canRedo = state.canRedo;
    }else if(manager){
      if(typeof manager.canUndo === 'function'){ canUndo = !!manager.canUndo(); }
      if(typeof manager.canRedo === 'function'){ canRedo = !!manager.canRedo(); }
    }
    doc.querySelectorAll(UNDO_BUTTON_SELECTOR).forEach(btn => {
      btn.disabled = !canUndo;
    });
    doc.querySelectorAll(REDO_BUTTON_SELECTOR).forEach(btn => {
      btn.disabled = !canRedo;
    });
  }

  function ensureUndoSubscription(){
    if(undoSubscriptionCleanup){ return; }
    const manager = getUndoManager();
    if(!manager || typeof manager.onChange !== 'function'){ return; }
    undoSubscriptionCleanup = manager.onChange(snapshot => {
      syncUndoButtonsAvailability(snapshot || null);
    });
  }

  function handleUndoCommandClick(event){
    if(!doc){ return; }
    const trigger = event.target.closest('[data-undo-command]');
    if(!trigger){ return; }
    const manager = getUndoManager();
    if(!manager){ return; }
    const command = trigger.dataset.undoCommand;
    let handler = null;
    if(command === 'undo'){ handler = manager.undo; }
    if(command === 'redo'){ handler = manager.redo; }
    if(typeof handler !== 'function'){ return; }
    if(trigger.disabled){ return; }
    event.preventDefault();
    const result = handler.call(manager);
    if(result === false){ return; }
    syncUndoButtonsAvailability();
  }

  function renderToolbarForElement(container){
    if(!container || !doc){ return; }
    const key = container.dataset?.toolbar || '';
    if(!key){ return; }
    const config = toolbarConfigs.get(key);
    if(!config){
      logDebug('missing config', { key });
      return;
    }
    const placeholder = container.querySelector('[data-toolbar-root]');
    if(!placeholder && container.dataset.toolbarRendered === '1'){
      logDebug('render skipped', { key, reason: 'already-rendered' });
      return;
    }
    ensureMenuHandlers();
    const toolbar = buildToolbar(config);
    if(!toolbar){ return; }
    if(placeholder){
      placeholder.replaceWith(toolbar);
    } else {
      const existing = container.querySelector('.workspace-toolbar');
      if(existing){
        existing.replaceWith(toolbar);
      } else {
        container.insertBefore(toolbar, container.firstChild || null);
      }
    }
    container.dataset.toolbarRendered = '1';
    logDebug('rendered toolbar', { key });
    ensureUndoSubscription();
    syncUndoButtonsAvailability();
  }

  function renderAllToolbars(){
    if(!doc){ return; }
    const containers = doc.querySelectorAll('.workspace-page__topbar[data-toolbar]');
    containers.forEach(renderToolbarForElement);
    closeAllMenus();
    ensureUndoSubscription();
    syncUndoButtonsAvailability();
  }

  function registerToolbar(key, config){
    if(!key || !config){ return; }
    const normalized = {
      key,
      ariaLabel: config.ariaLabel || `${key} workspace actions`,
      sections: Array.isArray(config.sections) ? config.sections.slice() : []
    };
    toolbarConfigs.set(key, normalized);
    logDebug('registered toolbar', { key, sectionCount: normalized.sections.length });
  }

  workspaceToolbar.register = registerToolbar;
  workspaceToolbar.renderAll = renderAllToolbars;
  workspaceToolbar.renderForElement = renderToolbarForElement;

  if(doc){
    const button = (id, label, icon, options) => Object.assign({ id, label, icon }, options || {});
    const capitalize = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
    const history = (key) => ({
      type: 'buttons',
      caption: 'History',
      ariaLabel: 'Undo and redo actions',
      buttons: [
        button(`undo${capitalize(key)}`, 'Undo', 'undo', {
          ariaLabel: 'Undo last change',
          title: 'Undo (Ctrl+Z)',
          dataset: { undoCommand: 'undo' },
          disabled: true
        }),
        button(`redo${capitalize(key)}`, 'Redo', 'redo', {
          ariaLabel: 'Redo last change',
          title: 'Redo (Ctrl+Shift+Z or Ctrl+Y)',
          dataset: { undoCommand: 'redo' },
          disabled: true
        })
      ]
    });
    const dock = (scopeId) => ({
      type: 'dock',
      caption: 'Format',
      ariaLabel: 'Format controls',
      scopeId,
      hostId: `${scopeId}FontHost`,
      hint: DEFAULT_HINT
    });

    const openMenuItems = (key) => [
      {
        id: `open${capitalize(key)}Graph`,
        label: 'Open Graph (.graph)'
      },
      {
        id: `open${capitalize(key)}Session`,
        label: 'Load Session (.session)',
        dataset: { sessionAction: 'open', sessionActionNewWindow: 'dirty' },
        ariaLabel: 'Load a saved session in a new window when needed'
      }
    ];

    const saveMenuItems = (key) => [
      {
        id: `save${capitalize(key)}Graph`,
        label: 'Save Graph (.graph)'
      },
      {
        id: `save${capitalize(key)}Session`,
        label: 'Save Session (.session)',
        dataset: { sessionAction: 'save' },
        ariaLabel: 'Save the current workspace session'
      }
    ];

    const buildMatchStylesSection = () => ({
      type: 'buttons',
      ariaLabel: 'Style synchronization',
      align: 'end',
      caption: '',
      buttons: [
        button(null, 'Match Styles', 'matchStyles', {
          ariaLabel: 'Match styles across open graphs',
          dataset: { styleSyncTrigger: '1' }
        })
      ]
    });

    const TOOLBAR_DATA = {
      venn: {
        ariaLabel: 'Venn diagram actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openVenn', 'Open', 'open', { menuItems: openMenuItems('Venn') }),
              button('saveVenn', 'Save', 'save', { menuItems: saveMenuItems('Venn') }),
              button('saveAsVenn', 'Save As', 'saveAs')
            ]
          },
          history('venn'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('sample', 'Load Example', 'example')
            ]
          },
          dock('venn'),
          buildMatchStylesSection()
        ]
      },
      box: {
        ariaLabel: 'Box plot actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openBox', 'Open', 'open', { menuItems: openMenuItems('Box') }),
              button('boxImport', 'Import', 'import'),
              button('saveBox', 'Save', 'save', { menuItems: saveMenuItems('Box') }),
              button('saveAsBox', 'Save As', 'saveAs')
            ]
          },
          history('box'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('boxLoadExample', 'Load Example', 'example')
            ]
          },
          dock('box'),
          buildMatchStylesSection()
        ]
      },
      scatter: {
        ariaLabel: 'Scatter plot actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openScatter', 'Open', 'open', { menuItems: openMenuItems('Scatter') }),
              button('scatterImport', 'Import', 'import'),
              button('saveScatter', 'Save', 'save', { menuItems: saveMenuItems('Scatter') }),
              button('saveAsScatter', 'Save As', 'saveAs')
            ]
          },
          history('scatter'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('scatterLoadExample', 'Load Example', 'example')
            ]
          },
          dock('scatter'),
          buildMatchStylesSection()
        ]
      },
      pca: {
        ariaLabel: 'Dimensionality reduction actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openPca', 'Open', 'open', { menuItems: openMenuItems('Pca') }),
              button('pcaImport', 'Import', 'import'),
              button('savePca', 'Save', 'save', { menuItems: saveMenuItems('Pca') }),
              button('saveAsPca', 'Save As', 'saveAs')
            ]
          },
          history('pca'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('pcaLoadExample', 'Load Example', 'example')
            ]
          },
          dock('pca'),
          buildMatchStylesSection()
        ]
      },
      line: {
        ariaLabel: 'Line graph actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openLine', 'Open', 'open', { menuItems: openMenuItems('Line') }),
              button('lineImport', 'Import', 'import'),
              button('saveLine', 'Save', 'save', { menuItems: saveMenuItems('Line') }),
              button('saveAsLine', 'Save As', 'saveAs')
            ]
          },
          history('line'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('lineLoadExample', 'Load Example', 'example')
            ]
          },
          dock('line'),
          buildMatchStylesSection()
        ]
      },
      heatmap: {
        ariaLabel: 'Heatmap actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openHeatmap', 'Open', 'open', { menuItems: openMenuItems('Heatmap') }),
              button('heatmapImport', 'Import', 'import'),
              button('saveHeatmap', 'Save', 'save', { menuItems: saveMenuItems('Heatmap') }),
              button('saveAsHeatmap', 'Save As', 'saveAs')
            ]
          },
          history('heatmap'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('heatmapLoadExample', 'Load Example', 'example')
            ]
          },
          dock('heatmap'),
          buildMatchStylesSection()
        ]
      },
      surface: {
        ariaLabel: 'Surface plot actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openSurface', 'Open', 'open', { menuItems: openMenuItems('Surface') }),
              button('surfaceImport', 'Import', 'import'),
              button('saveSurface', 'Save', 'save', { menuItems: saveMenuItems('Surface') }),
              button('saveAsSurface', 'Save As', 'saveAs')
            ]
          },
          history('surface'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('surfaceLoadExample', 'Load Example', 'example')
            ]
          },
          dock('surface'),
          buildMatchStylesSection()
        ]
      },
      roc: {
        ariaLabel: 'ROC and PR curve actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openRoc', 'Open', 'open', { menuItems: openMenuItems('Roc') }),
              button('rocImport', 'Import', 'import'),
              button('saveRoc', 'Save', 'save', { menuItems: saveMenuItems('Roc') }),
              button('saveAsRoc', 'Save As', 'saveAs')
            ]
          },
          history('roc'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('rocLoadExample', 'Load Example', 'example')
            ]
          },
          dock('roc'),
          buildMatchStylesSection()
        ]
      },
      survival: {
        ariaLabel: 'Survival analysis actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openSurvival', 'Open', 'open', { menuItems: openMenuItems('Survival') }),
              button('survivalImport', 'Import', 'import'),
              button('saveSurvival', 'Save', 'save', { menuItems: saveMenuItems('Survival') }),
              button('saveAsSurvival', 'Save As', 'saveAs')
            ]
          },
          history('survival'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('survivalLoadExample', 'Load Example', 'example')
            ]
          },
          dock('survival'),
          buildMatchStylesSection()
        ]
      },
      hist: {
        ariaLabel: 'Histogram actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openHist', 'Open', 'open', { menuItems: openMenuItems('Hist') }),
              button('histImport', 'Import', 'import'),
              button('saveHist', 'Save', 'save', { menuItems: saveMenuItems('Hist') }),
              button('saveAsHist', 'Save As', 'saveAs')
            ]
          },
          history('hist'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('histLoadExample', 'Load Example', 'example')
            ]
          },
          dock('hist'),
          buildMatchStylesSection()
        ]
      },
      pie: {
        ariaLabel: 'Proportion graph actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openPie', 'Open', 'open', { menuItems: openMenuItems('Pie') }),
              button('pieImport', 'Import', 'import'),
              button('savePie', 'Save', 'save', { menuItems: saveMenuItems('Pie') }),
              button('saveAsPie', 'Save As', 'saveAs')
            ]
          },
          history('pie'),
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('pieLoadExample', 'Load Example', 'example')
            ]
          },
          dock('pie'),
          buildMatchStylesSection()
        ]
      }
    };

    Object.keys(TOOLBAR_DATA).forEach(key => {
      registerToolbar(key, TOOLBAR_DATA[key]);
    });

    renderAllToolbars();
    ensureUndoSubscription();
    syncUndoButtonsAvailability();
    if(doc.readyState === 'loading'){
      doc.addEventListener('DOMContentLoaded', () => {
        renderAllToolbars();
        ensureUndoSubscription();
        syncUndoButtonsAvailability();
      }, { once: true });
    }

    if(doc){
      doc.addEventListener('click', handleUndoCommandClick, true);
    }
  }
})(window);
