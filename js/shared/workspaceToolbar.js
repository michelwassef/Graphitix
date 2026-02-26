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
    },
    transform: {
      viewBox: '0 0 24 24',
      elements: [
        {
          tag: 'path',
          attrs: {
            fill: 'currentColor',
            d: 'M3 5h12v2H3V5zm14 0h4v6h-4V5zM3 11h8v2H3v-2zm10 0h4v8h-4v-8zM3 17h14v2H3v-2zm16 0h2v4h-2v-4z'
          }
        }
      ]
    }
  });

  const DEFAULT_HINT = 'Select any element of the graph to configure.';
  const NS = 'http://www.w3.org/2000/svg';
  const toolbarConfigs = new Map();
  const UNDO_BUTTON_SELECTOR = 'button[data-undo-command="undo"]';
  const REDO_BUTTON_SELECTOR = 'button[data-undo-command="redo"]';
  const MENU_WRAPPER_SELECTOR = '.workspace-toolbar__menu';
  const MENU_TRIGGER_SELECTOR = '.workspace-toolbar__button[data-menu-id]';
  const MENU_OPEN_CLASS = 'workspace-toolbar__menu--open';
  const TRANSFORM_SECTION_SELECTOR = '.workspace-toolbar__section[data-transform-section="1"]';
  const TRANSFORM_MODE_TOGGLE_SELECTOR = 'input[data-transform-multi-toggle="1"]';
  const TRANSFORM_OPTION_SELECTOR = '.workspace-toolbar__button[data-transform-option]';
  const TRANSFORM_APPLY_SELECTOR = '.workspace-toolbar__button[data-transform-apply="1"]';
  const TRANSFORM_CLEAR_SELECTOR = '.workspace-toolbar__button[data-transform-clear="1"]';
  const TRANSFORM_CUSTOM_TRIGGER_SELECTOR = `${TRANSFORM_OPTION_SELECTOR}[data-transform-option="custom"]`;
  const TRANSFORM_CUSTOM_DROPDOWN_SELECTOR = '.workspace-toolbar__transform-custom-dropdown[data-transform-custom-dropdown="1"]';
  const TRANSFORM_CUSTOM_INPUT_SELECTOR = 'input[data-transform-custom-input="1"]';
  const TRANSFORM_CUSTOM_APPLY_SELECTOR = '.workspace-toolbar__button[data-transform-custom-apply="1"]';
  const TRANSFORM_CUSTOM_CLOSE_SELECTOR = '.workspace-toolbar__button[data-transform-custom-close="1"]';
  let undoSubscriptionCleanup = null;
  let menuHandlersBound = false;
  let transformHandlersBound = false;
  const contextObservers = new WeakMap();
  const transformCustomExpressionByKey = new Map();

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
    const importTooltip = config.icon === 'import' ? 'Import CSV, TSV, TXT, XLS, XLSX, ODS, ODG, or PRISM files' : null;
    const tooltip = config.tooltip;
    if(config.title || tooltip || importTooltip){ button.title = config.title || tooltip || importTooltip; }
    if(config.disabled){ button.disabled = true; }
    if(config.hidden){ button.hidden = true; }
    if(config.dataset){
      Object.keys(config.dataset).forEach(key => {
        const value = config.dataset[key];
        if(value !== undefined && value !== null){
          button.dataset[key] = String(value);
        }
      });
    }
    if(tooltip){
      button.dataset.tooltip = tooltip;
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

    if(config.dataset && config.dataset.transformOption){
      button.dataset.transformOption = String(config.dataset.transformOption);
      button.dataset.transformSelected = '0';
      const check = doc.createElement('input');
      check.type = 'checkbox';
      check.className = 'workspace-toolbar__transform-option-check';
      check.tabIndex = -1;
      check.setAttribute('aria-hidden', 'true');
      check.disabled = true;
      button.appendChild(check);
    }

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

  function createCheckboxItem(config){
    if(!config || !doc){ return null; }
    const wrap = doc.createElement('label');
    wrap.className = 'workspace-toolbar__checkbox workspace-toolbar__checkbox--toolbar';
    if(Array.isArray(config.classes) && config.classes.length){
      wrap.className += ' ' + config.classes.filter(Boolean).join(' ');
    }
    if(config.title){
      wrap.title = config.title;
    }

    const input = doc.createElement('input');
    input.type = 'checkbox';
    if(config.id){ input.id = config.id; }
    if(config.name){ input.name = config.name; }
    if(config.checked){ input.checked = true; }
    if(config.dataset){
      Object.keys(config.dataset).forEach(key => {
        const value = config.dataset[key];
        if(value !== undefined && value !== null){
          input.dataset[key] = String(value);
        }
      });
    }
    wrap.appendChild(input);

    const label = doc.createElement('span');
    label.className = 'workspace-toolbar__checkbox-label';
    label.textContent = config.label || '';
    wrap.appendChild(label);
    return wrap;
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

  function ensureTransformHandlers(){
    if(transformHandlersBound || !doc){ return; }
    doc.addEventListener('click', handleTransformToolbarClick, true);
    doc.addEventListener('change', handleTransformToolbarChange, true);
    doc.addEventListener('keydown', handleTransformToolbarKeydown, true);
    transformHandlersBound = true;
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

  function toKebab(value){
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function resolveSectionTabLabel(section, index){
    const explicit = section && typeof section.tabLabel === 'string' ? section.tabLabel.trim() : '';
    if(explicit){ return explicit; }
    const caption = section && typeof section.caption === 'string' ? section.caption.trim() : '';
    if(caption){ return caption; }
    if(section && section.type === 'dock'){ return 'Format'; }
    if(section && section.align === 'end'){ return 'Styles'; }
    return `Section ${index + 1}`;
  }

  function resolveSectionId(config, section, index){
    const explicit = section && section.id ? String(section.id) : '';
    if(explicit){ return explicit; }
    const label = resolveSectionTabLabel(section, index);
    const slug = toKebab(label) || `section-${index + 1}`;
    return `${config.key}-${index + 1}-${slug}`;
  }

  function cloneSectionForToolbar(section){
    if(!section || typeof section !== 'object'){ return null; }
    const cloned = Object.assign({}, section);
    if(Array.isArray(section.buttons)){
      cloned.buttons = section.buttons.slice();
    }
    if(Array.isArray(section.controls)){
      cloned.controls = section.controls.slice();
    }
    return cloned;
  }

  function normalizeToolbarSections(sections){
    const source = Array.isArray(sections) ? sections : [];
    const normalized = source.map(cloneSectionForToolbar).filter(Boolean);
    const primaryIndex = normalized.findIndex(section => section.type === 'buttons');
    if(primaryIndex < 0){
      return normalized;
    }

    const primary = normalized[primaryIndex];
    const primaryCaption = String(primary.caption || '').trim().toLowerCase();
    if(primaryCaption === 'file'){
      primary.caption = 'General';
      primary.tabLabel = 'General';
      primary.ariaLabel = 'General actions';
    }

    const mergedButtons = Array.isArray(primary.buttons) ? primary.buttons.slice() : [];
    const kept = [];
    normalized.forEach((section, index) => {
      if(index === primaryIndex){
        kept.push(section);
        return;
      }
      const caption = String(section.caption || '').trim().toLowerCase();
      const isHistory = section.type === 'buttons' && caption === 'history';
      const isStyleSyncSection = section.type === 'buttons' && Array.isArray(section.buttons)
        && section.buttons.some(btn => btn && btn.dataset && btn.dataset.styleSyncTrigger === '1');
      if(isHistory || isStyleSyncSection){
        if(Array.isArray(section.buttons)){
          section.buttons.forEach(btn => {
            if(btn){ mergedButtons.push(btn); }
          });
        }
        return;
      }
      kept.push(section);
    });
    primary.buttons = mergedButtons;
    return kept;
  }

  function setToolbarActiveSection(toolbar, sectionId, opts){
    if(!toolbar || !sectionId){ return; }
    const options = opts || {};
    const sectionSelector = '.workspace-toolbar__section[data-toolbar-section-id]';
    const tabSelector = '.workspace-toolbar__tab[data-toolbar-section-target]';
    let found = false;
    toolbar.querySelectorAll(sectionSelector).forEach(section => {
      const isActive = section.dataset.toolbarSectionId === sectionId;
      section.classList.toggle('workspace-toolbar__section--active', isActive);
      section.toggleAttribute('hidden', !isActive);
      if(isActive){ found = true; }
    });
    if(!found){ return; }
    toolbar.querySelectorAll(tabSelector).forEach(tab => {
      const isActive = tab.dataset.toolbarSectionTarget === sectionId;
      tab.classList.toggle('workspace-toolbar__tab--active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.tabIndex = isActive ? 0 : -1;
    });
    toolbar.dataset.toolbarActiveSection = sectionId;
    if(options.manual){
      toolbar.dataset.toolbarManualSection = sectionId;
    }
    if(options.context){
      toolbar.dataset.toolbarContextSection = sectionId;
    } else if(options.clearContext){
      delete toolbar.dataset.toolbarContextSection;
    }
  }

  function findContextSectionId(toolbar){
    if(!toolbar){ return ''; }
    const dockSections = toolbar.querySelectorAll('.workspace-toolbar__section--dock[data-toolbar-section-id]');
    for(let i = 0; i < dockSections.length; i += 1){
      const section = dockSections[i];
      if(section.querySelector('.workspace-toolbar__dock--active')){
        return section.dataset.toolbarSectionId || '';
      }
    }
    const visibleHost = toolbar.querySelector('.workspace-toolbar__section--dock .font-toolbar-host.font-toolbar-host--visible');
    if(visibleHost){
      const hostSection = visibleHost.closest('.workspace-toolbar__section[data-toolbar-section-id]');
      if(hostSection?.dataset?.toolbarSectionId){
        return hostSection.dataset.toolbarSectionId;
      }
    }
    return '';
  }

  function syncToolbarContextSection(toolbar){
    if(!toolbar){ return; }
    const contextSectionId = findContextSectionId(toolbar);
    if(contextSectionId){
      setToolbarActiveSection(toolbar, contextSectionId, { context: true });
      return;
    }
    const activeSectionId = toolbar.dataset.toolbarActiveSection || '';
    const previousContext = toolbar.dataset.toolbarContextSection || '';
    if(activeSectionId && previousContext && activeSectionId === previousContext){
      const fallback = toolbar.dataset.toolbarManualSection || activeSectionId;
      setToolbarActiveSection(toolbar, fallback, { clearContext: true });
      return;
    }
    if(previousContext){
      delete toolbar.dataset.toolbarContextSection;
    }
  }

  function getTransformSection(node){
    if(!node || typeof node.closest !== 'function'){
      return null;
    }
    return node.closest(TRANSFORM_SECTION_SELECTOR);
  }

  function getTransformSectionToolbarKey(section){
    if(!section || typeof section.closest !== 'function'){
      return '';
    }
    const toolbar = section.closest('.workspace-toolbar');
    return String(toolbar?.dataset?.toolbarKey || '').trim();
  }

  function findTransformSectionByToolbarKey(toolbarKey){
    if(!doc){ return null; }
    const key = String(toolbarKey || '').trim();
    if(!key){ return null; }
    const toolbar = doc.querySelector(`.workspace-page__topbar[data-toolbar="${key}"] .workspace-toolbar`);
    return toolbar?.querySelector?.(TRANSFORM_SECTION_SELECTOR) || null;
  }

  function getTransformCustomDropdown(section){
    return section?.querySelector?.(TRANSFORM_CUSTOM_DROPDOWN_SELECTOR) || null;
  }

  function getTransformCustomInput(section){
    return section?.querySelector?.(TRANSFORM_CUSTOM_INPUT_SELECTOR) || null;
  }

  function alignTransformCustomDropdown(section){
    const trigger = section?.querySelector?.(TRANSFORM_CUSTOM_TRIGGER_SELECTOR);
    const dropdown = getTransformCustomDropdown(section);
    if(!trigger || !dropdown){
      return;
    }
    const left = Number(trigger.offsetLeft) || 0;
    const top = (Number(trigger.offsetTop) || 0) + (Number(trigger.offsetHeight) || 0) + 6;
    dropdown.style.left = `${left}px`;
    dropdown.style.top = `${top}px`;
    dropdown.style.right = 'auto';
  }

  function setTransformCustomDropdownOpen(section, expanded, options){
    if(!section){ return; }
    const dropdown = getTransformCustomDropdown(section);
    if(!dropdown){ return; }
    const next = !!expanded;
    dropdown.hidden = !next;
    dropdown.dataset.open = next ? '1' : '0';
    const trigger = section.querySelector(TRANSFORM_CUSTOM_TRIGGER_SELECTOR);
    if(trigger){
      trigger.setAttribute('aria-expanded', next ? 'true' : 'false');
    }
    if(!next){
      return;
    }
    const opts = options || {};
    alignTransformCustomDropdown(section);
    const input = getTransformCustomInput(section);
    if(input && opts.focusInput){
      const focusInput = () => {
        try{
          input.focus();
          const length = input.value.length;
          input.setSelectionRange?.(length, length);
        }catch(err){
          // no-op
        }
      };
      if(typeof global.requestAnimationFrame === 'function'){
        global.requestAnimationFrame(focusInput);
      }else{
        global.setTimeout(focusInput, 0);
      }
    }
  }

  function closeAllTransformCustomDropdowns(exceptSection){
    if(!doc){ return; }
    doc.querySelectorAll(`${TRANSFORM_SECTION_SELECTOR} ${TRANSFORM_CUSTOM_DROPDOWN_SELECTOR}[data-open="1"]`).forEach(dropdown => {
      const section = dropdown.closest(TRANSFORM_SECTION_SELECTOR);
      if(section && section !== exceptSection){
        setTransformCustomDropdownOpen(section, false);
      }
    });
  }

  function syncTransformCustomExpressionFromInput(section){
    const key = getTransformSectionToolbarKey(section);
    if(!key){ return; }
    const input = getTransformCustomInput(section);
    if(!input){ return; }
    transformCustomExpressionByKey.set(key, String(input.value || '').trim());
  }

  function syncTransformCustomInputFromStore(section){
    const key = getTransformSectionToolbarKey(section);
    if(!key){ return; }
    const input = getTransformCustomInput(section);
    if(!input){ return; }
    if(transformCustomExpressionByKey.has(key) && input.value !== transformCustomExpressionByKey.get(key)){
      input.value = transformCustomExpressionByKey.get(key);
    }
  }

  function setTransformButtonSelected(button, selected){
    if(!button){ return; }
    const next = !!selected;
    button.dataset.transformSelected = next ? '1' : '0';
    button.classList.toggle('workspace-toolbar__button--selected', next);
    const check = button.querySelector('.workspace-toolbar__transform-option-check');
    if(check && check.checked !== next){
      check.checked = next;
    }
  }

  function clearTransformSelections(section){
    if(!section){ return; }
    section.querySelectorAll(TRANSFORM_OPTION_SELECTOR).forEach(button => {
      setTransformButtonSelected(button, false);
    });
  }

  function updateTransformSectionState(section, options){
    if(!section){ return; }
    const opts = options || {};
    const modeInput = section.querySelector(TRANSFORM_MODE_TOGGLE_SELECTOR);
    const multiMode = !!modeInput?.checked;
    section.dataset.transformMultiMode = multiMode ? '1' : '0';
    if(!multiMode && opts.preserveSelection !== true){
      clearTransformSelections(section);
    }
    const selectedCount = section.querySelectorAll(`${TRANSFORM_OPTION_SELECTOR}[data-transform-selected="1"]`).length;
    section.querySelectorAll(TRANSFORM_APPLY_SELECTOR).forEach(button => {
      button.hidden = !multiMode;
      button.disabled = !multiMode || selectedCount === 0;
    });
    section.querySelectorAll(TRANSFORM_CLEAR_SELECTOR).forEach(button => {
      button.hidden = !multiMode;
      button.disabled = !multiMode || selectedCount === 0;
    });
    if(!multiMode){
      setTransformCustomDropdownOpen(section, false);
    }
    syncTransformCustomInputFromStore(section);
  }

  function syncTransformSections(root){
    const scope = root || doc;
    if(!scope || typeof scope.querySelectorAll !== 'function'){ return; }
    scope.querySelectorAll(TRANSFORM_SECTION_SELECTOR).forEach(section => {
      updateTransformSectionState(section);
    });
  }

  function handleTransformToolbarChange(event){
    const target = event?.target;
    if(!target || typeof target.closest !== 'function'){ return; }
    const customInput = target.closest(TRANSFORM_CUSTOM_INPUT_SELECTOR);
    if(customInput){
      const section = getTransformSection(customInput);
      if(!section){ return; }
      syncTransformCustomExpressionFromInput(section);
      return;
    }
    const modeToggle = target.closest(TRANSFORM_MODE_TOGGLE_SELECTOR);
    if(!modeToggle){ return; }
    const section = getTransformSection(modeToggle);
    if(!section){ return; }
    updateTransformSectionState(section);
  }

  function handleTransformToolbarClick(event){
    const target = event?.target;
    if(!target || typeof target.closest !== 'function'){ return; }
    const customClose = target.closest(TRANSFORM_CUSTOM_CLOSE_SELECTOR);
    if(customClose){
      const section = getTransformSection(customClose);
      if(!section){ return; }
      setTransformCustomDropdownOpen(section, false);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const customApply = target.closest(TRANSFORM_CUSTOM_APPLY_SELECTOR);
    if(customApply){
      const section = getTransformSection(customApply);
      if(!section){ return; }
      syncTransformCustomExpressionFromInput(section);
      closeAllTransformCustomDropdowns(section);
      setTransformCustomDropdownOpen(section, false);
      return;
    }
    const clearButton = target.closest(TRANSFORM_CLEAR_SELECTOR);
    if(clearButton){
      const section = getTransformSection(clearButton);
      if(!section){ return; }
      clearTransformSelections(section);
      updateTransformSectionState(section, { preserveSelection: true });
      closeAllTransformCustomDropdowns();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const optionButton = target.closest(TRANSFORM_OPTION_SELECTOR);
    if(optionButton){
      const section = getTransformSection(optionButton);
      if(!section){
        return;
      }
      const optionKey = String(optionButton.dataset.transformOption || '').trim();
      if(optionKey === 'custom'){
        if(section.dataset.transformMultiMode === '1'){
          const currentlySelected = optionButton.dataset.transformSelected === '1';
          setTransformButtonSelected(optionButton, !currentlySelected);
          updateTransformSectionState(section, { preserveSelection: true });
        }
        closeAllTransformCustomDropdowns(section);
        setTransformCustomDropdownOpen(section, true, { focusInput: true });
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if(section.dataset.transformMultiMode !== '1'){
        closeAllTransformCustomDropdowns();
        return;
      }
      const currentlySelected = optionButton.dataset.transformSelected === '1';
      setTransformButtonSelected(optionButton, !currentlySelected);
      updateTransformSectionState(section, { preserveSelection: true });
      closeAllTransformCustomDropdowns();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if(!target.closest(TRANSFORM_CUSTOM_DROPDOWN_SELECTOR)){
      closeAllTransformCustomDropdowns();
    }
  }

  function handleTransformToolbarKeydown(event){
    const target = event?.target;
    if(!target || typeof target.closest !== 'function'){
      return;
    }
    if(event.key === 'Escape'){
      const section = getTransformSection(target);
      if(!section){
        return;
      }
      const dropdown = getTransformCustomDropdown(section);
      if(dropdown?.dataset?.open === '1'){
        setTransformCustomDropdownOpen(section, false);
        const trigger = section.querySelector(TRANSFORM_CUSTOM_TRIGGER_SELECTOR);
        trigger?.focus?.();
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if(event.key !== 'Enter'){
      return;
    }
    const input = target.closest(TRANSFORM_CUSTOM_INPUT_SELECTOR);
    if(!input){
      return;
    }
    const section = getTransformSection(input);
    if(!section){
      return;
    }
    const applyButton = section.querySelector(TRANSFORM_CUSTOM_APPLY_SELECTOR);
    if(!applyButton || applyButton.disabled){
      return;
    }
    syncTransformCustomExpressionFromInput(section);
    event.preventDefault();
    applyButton.click();
  }

  function createTransformCustomDropdown(section){
    if(!doc || !section?.transformKey){
      return null;
    }
    const transformKey = String(section.transformKey || '').trim();
    if(!transformKey){
      return null;
    }
    const wrap = doc.createElement('div');
    wrap.className = 'workspace-toolbar__transform-custom-dropdown';
    wrap.dataset.transformCustomDropdown = '1';
    wrap.dataset.open = '0';
    wrap.hidden = true;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Custom transformation');

    const field = doc.createElement('label');
    field.className = 'workspace-toolbar__transform-custom-field';
    const fieldLabel = doc.createElement('span');
    fieldLabel.className = 'workspace-toolbar__transform-custom-label';
    fieldLabel.textContent = 'Formula (use x)';
    field.appendChild(fieldLabel);
    const input = doc.createElement('input');
    input.type = 'text';
    input.id = `${transformKey}TransformCustomExpr`;
    input.className = 'workspace-toolbar__transform-custom-input';
    input.placeholder = 'log2(x+1)';
    input.dataset.transformCustomInput = '1';
    field.appendChild(input);
    wrap.appendChild(field);

    const helper = doc.createElement('p');
    helper.className = 'workspace-toolbar__transform-custom-helper';
    helper.textContent = 'Examples: log2(x+1), x*1000, x/3.5';
    wrap.appendChild(helper);

    const actions = doc.createElement('div');
    actions.className = 'workspace-toolbar__transform-custom-actions';
    const applyButton = createButton({
      id: `${transformKey}TransformCustomApply`,
      label: 'Apply custom',
      classes: ['workspace-toolbar__button--text-only'],
      dataset: { transformCustomApply: '1' }
    });
    if(applyButton){ actions.appendChild(applyButton); }
    const closeButton = createButton({
      id: `${transformKey}TransformCustomClose`,
      label: 'Close',
      classes: ['workspace-toolbar__button--text-only'],
      dataset: { transformCustomClose: '1' }
    });
    if(closeButton){ actions.appendChild(closeButton); }
    wrap.appendChild(actions);
    return wrap;
  }

  function detachContextObserver(toolbar){
    if(!toolbar){ return; }
    const observer = contextObservers.get(toolbar);
    if(observer && typeof observer.disconnect === 'function'){
      observer.disconnect();
    }
    contextObservers.delete(toolbar);
  }

  function attachContextObserver(toolbar){
    if(!toolbar || typeof MutationObserver !== 'function'){ return; }
    detachContextObserver(toolbar);
    let scheduled = false;
    const scheduleSync = () => {
      if(scheduled){ return; }
      scheduled = true;
      const run = () => {
        scheduled = false;
        syncToolbarContextSection(toolbar);
      };
      if(typeof global.requestAnimationFrame === 'function'){
        global.requestAnimationFrame(run);
      } else {
        global.setTimeout(run, 0);
      }
    };
    const observer = new MutationObserver(mutations => {
      for(let i = 0; i < mutations.length; i += 1){
        const mutation = mutations[i];
        if(mutation.type === 'attributes' && mutation.attributeName === 'class'){
          scheduleSync();
          return;
        }
        if(mutation.type === 'childList'){
          scheduleSync();
          return;
        }
      }
    });
    observer.observe(toolbar, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
      childList: true
    });
    contextObservers.set(toolbar, observer);
    syncToolbarContextSection(toolbar);
  }

  function createButtonsSection(section){
    if(!doc){ return null; }
    const sectionEl = doc.createElement('div');
    sectionEl.className = 'workspace-toolbar__section';
    if(section.transformSection){
      sectionEl.dataset.transformSection = '1';
      sectionEl.dataset.transformKey = String(section.transformKey || '').trim();
    }
    sectionEl.setAttribute('role', 'group');
    if(section.ariaLabel){ sectionEl.setAttribute('aria-label', section.ariaLabel); }
    if(section.align === 'end'){
      sectionEl.classList.add('workspace-toolbar__section--align-end');
    }

    const buttonsWrap = doc.createElement('div');
    buttonsWrap.className = 'workspace-toolbar__buttons';
    (section.buttons || []).forEach(buttonConfig => {
      if(!buttonConfig){ return; }
      if(buttonConfig.type === 'checkbox'){
        const control = createCheckboxItem(buttonConfig);
        if(control){ buttonsWrap.appendChild(control); }
        return;
      }
      const isMenu = Array.isArray(buttonConfig.menuItems) && buttonConfig.menuItems.length > 0;
      const button = isMenu ? createMenuButton(buttonConfig) : createButton(buttonConfig);
      if(button && button?.dataset?.transformOption === 'custom'){
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
      }
      if(button){ buttonsWrap.appendChild(button); }
    });
    sectionEl.appendChild(buttonsWrap);
    if(section.transformSection){
      const customDropdown = createTransformCustomDropdown(section);
      if(customDropdown){
        sectionEl.appendChild(customDropdown);
      }
    }

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
    toolbar.dataset.toolbarKey = config.key || '';

    const tabs = doc.createElement('div');
    tabs.className = 'workspace-toolbar__tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Toolbar sections');

    const content = doc.createElement('div');
    content.className = 'workspace-toolbar__content';

    const entries = [];
    const sections = normalizeToolbarSections(config.sections);
    sections.forEach((section, index) => {
      if(!section){ return; }
      let sectionEl = null;
      if(section.type === 'dock'){
        sectionEl = createDockSection(section);
      } else if(section.type === 'form'){
        sectionEl = createFormSection(section);
      } else {
        sectionEl = createButtonsSection(section);
      }
      if(!sectionEl){ return; }
      const sectionId = resolveSectionId(config, section, index);
      const tabLabel = resolveSectionTabLabel(section, index);
      sectionEl.dataset.toolbarSectionId = sectionId;
      sectionEl.setAttribute('hidden', 'hidden');
      content.appendChild(sectionEl);
      entries.push({ sectionId, tabLabel });

      const tab = doc.createElement('button');
      tab.type = 'button';
      tab.className = 'workspace-toolbar__tab';
      tab.textContent = tabLabel;
      tab.dataset.toolbarSectionTarget = sectionId;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'false');
      tab.tabIndex = -1;
      tabs.appendChild(tab);
    });

    tabs.addEventListener('click', event => {
      const tab = event.target.closest('.workspace-toolbar__tab[data-toolbar-section-target]');
      if(!tab || tab.disabled){ return; }
      const targetId = tab.dataset.toolbarSectionTarget || '';
      if(!targetId){ return; }
      setToolbarActiveSection(toolbar, targetId, { manual: true, clearContext: true });
    });

    tabs.addEventListener('keydown', event => {
      const key = event.key;
      if(key !== 'ArrowRight' && key !== 'ArrowLeft'){ return; }
      const allTabs = Array.from(tabs.querySelectorAll('.workspace-toolbar__tab[data-toolbar-section-target]'));
      if(!allTabs.length){ return; }
      const currentIndex = allTabs.indexOf(doc.activeElement);
      if(currentIndex < 0){ return; }
      event.preventDefault();
      const nextIndex = key === 'ArrowRight'
        ? (currentIndex + 1) % allTabs.length
        : (currentIndex - 1 + allTabs.length) % allTabs.length;
      const nextTab = allTabs[nextIndex];
      if(!nextTab){ return; }
      nextTab.focus();
      const targetId = nextTab.dataset.toolbarSectionTarget || '';
      if(targetId){
        setToolbarActiveSection(toolbar, targetId, { manual: true, clearContext: true });
      }
    });

    toolbar.appendChild(tabs);
    toolbar.appendChild(content);

    let defaultSectionId = '';
    const fileEntry = entries.find(entry => entry.tabLabel.toLowerCase() === 'file');
    if(fileEntry){
      defaultSectionId = fileEntry.sectionId;
    } else if(entries.length){
      defaultSectionId = entries[0].sectionId;
    }
    if(defaultSectionId){
      setToolbarActiveSection(toolbar, defaultSectionId, { manual: true, clearContext: true });
    }

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
    ensureTransformHandlers();
    const toolbar = buildToolbar(config);
    if(!toolbar){ return; }
    if(placeholder){
      placeholder.replaceWith(toolbar);
    } else {
      const existing = container.querySelector('.workspace-toolbar');
      if(existing){
        detachContextObserver(existing);
        existing.replaceWith(toolbar);
      } else {
        container.insertBefore(toolbar, container.firstChild || null);
      }
    }
    attachContextObserver(toolbar);
    syncTransformSections(toolbar);
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
  workspaceToolbar.activateSection = function activateSection(toolbarKey, sectionLabel){
    if(!doc){ return false; }
    const key = String(toolbarKey || '').trim();
    const label = String(sectionLabel || '').trim().toLowerCase();
    if(!key || !label){ return false; }
    const toolbar = doc.querySelector(`.workspace-page__topbar[data-toolbar="${key}"] .workspace-toolbar`);
    if(!toolbar){ return false; }
    const tab = Array.from(toolbar.querySelectorAll('.workspace-toolbar__tab[data-toolbar-section-target]'))
      .find(node => String(node.textContent || '').trim().toLowerCase() === label);
    const sectionId = tab?.dataset?.toolbarSectionTarget || '';
    if(!sectionId){ return false; }
    setToolbarActiveSection(toolbar, sectionId, { manual: true, clearContext: true });
    return true;
  };
  workspaceToolbar.isTransformMultiMode = function isTransformMultiMode(toolbarKey){
    if(!doc){ return false; }
    const key = String(toolbarKey || '').trim();
    if(!key){ return false; }
    const toolbar = doc.querySelector(`.workspace-page__topbar[data-toolbar="${key}"] .workspace-toolbar`);
    const section = toolbar?.querySelector?.(TRANSFORM_SECTION_SELECTOR);
    const modeToggle = section?.querySelector?.(TRANSFORM_MODE_TOGGLE_SELECTOR);
    return !!modeToggle?.checked;
  };
  workspaceToolbar.getSelectedTransforms = function getSelectedTransforms(toolbarKey){
    if(!doc){ return []; }
    const key = String(toolbarKey || '').trim();
    if(!key){ return []; }
    const toolbar = doc.querySelector(`.workspace-page__topbar[data-toolbar="${key}"] .workspace-toolbar`);
    const section = toolbar?.querySelector?.(TRANSFORM_SECTION_SELECTOR);
    if(!section){
      return [];
    }
    return Array.from(section.querySelectorAll(`${TRANSFORM_OPTION_SELECTOR}[data-transform-selected="1"]`))
      .map(button => String(button?.dataset?.transformOption || '').trim())
      .filter(Boolean);
  };
  workspaceToolbar.clearSelectedTransforms = function clearSelectedTransforms(toolbarKey){
    if(!doc){ return false; }
    const key = String(toolbarKey || '').trim();
    if(!key){ return false; }
    const toolbar = doc.querySelector(`.workspace-page__topbar[data-toolbar="${key}"] .workspace-toolbar`);
    const section = toolbar?.querySelector?.(TRANSFORM_SECTION_SELECTOR);
    if(!section){
      return false;
    }
    clearTransformSelections(section);
    updateTransformSectionState(section, { preserveSelection: true });
    return true;
  };
  workspaceToolbar.getCustomTransformExpression = function getCustomTransformExpression(toolbarKey){
    const key = String(toolbarKey || '').trim();
    if(!key){
      return '';
    }
    const section = findTransformSectionByToolbarKey(key);
    if(section){
      syncTransformCustomExpressionFromInput(section);
      const input = getTransformCustomInput(section);
      if(input){
        const normalized = String(input.value || '').trim();
        transformCustomExpressionByKey.set(key, normalized);
        return normalized;
      }
    }
    const stored = transformCustomExpressionByKey.get(key);
    return typeof stored === 'string' ? stored : '';
  };
  workspaceToolbar.setCustomTransformExpression = function setCustomTransformExpression(toolbarKey, expression){
    const key = String(toolbarKey || '').trim();
    if(!key){
      return false;
    }
    const normalized = String(expression || '').trim();
    transformCustomExpressionByKey.set(key, normalized);
    const section = findTransformSectionByToolbarKey(key);
    const input = getTransformCustomInput(section);
    if(input){
      input.value = normalized;
    }
    return true;
  };
  workspaceToolbar.openCustomTransformEditor = function openCustomTransformEditor(toolbarKey){
    const key = String(toolbarKey || '').trim();
    if(!key){
      return false;
    }
    workspaceToolbar.activateSection(key, 'Data');
    const section = findTransformSectionByToolbarKey(key);
    if(!section){
      return false;
    }
    closeAllTransformCustomDropdowns(section);
    setTransformCustomDropdownOpen(section, true, { focusInput: true });
    return true;
  };
  workspaceToolbar.closeCustomTransformEditor = function closeCustomTransformEditor(toolbarKey){
    const key = String(toolbarKey || '').trim();
    if(!key){
      return false;
    }
    const section = findTransformSectionByToolbarKey(key);
    if(!section){
      return false;
    }
    setTransformCustomDropdownOpen(section, false);
    return true;
  };

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
    const dataTransformsSection = (key) => ({
      type: 'buttons',
      caption: 'Data',
      ariaLabel: 'Input data transforms',
      transformSection: true,
      transformKey: key,
      buttons: [
        {
          type: 'checkbox',
          id: `${key}TransformMultiMode`,
          label: 'Multiple',
          title: 'Enable multiple transform selection mode',
          dataset: { transformMultiToggle: '1' }
        },
        button(`${key}TransformApplySelected`, 'Apply selected', null, {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Apply all selected transforms to create one data tab',
          hidden: true,
          dataset: { transformApply: '1' }
        }),
        button(`${key}TransformClearSelected`, 'Clear', null, {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Clear selected transforms',
          hidden: true,
          dataset: { transformClear: '1' }
        }),
        button(`${key}TransformCpm`, 'CPM', 'transform', {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Create a CPM-normalized data tab',
          dataset: { transformOption: 'cpm' }
        }),
        button(`${key}TransformLog2p1`, 'Log2+1', 'transform', {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Create a log2(x+1) transformed data tab',
          dataset: { transformOption: 'log2p1' }
        }),
        button(`${key}TransformCenterRowsMean`, 'Center rows (mean)', 'transform', {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Center rows by subtracting row mean',
          dataset: { transformOption: 'centerRowsMean' }
        }),
        button(`${key}TransformCenterRowsMedian`, 'Center rows (median)', 'transform', {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Center rows by subtracting row median',
          dataset: { transformOption: 'centerRowsMedian' }
        }),
        button(`${key}TransformCenterColsMean`, 'Center cols (mean)', 'transform', {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Center columns by subtracting column mean',
          dataset: { transformOption: 'centerColsMean' }
        }),
        button(`${key}TransformCenterColsMedian`, 'Center cols (median)', 'transform', {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Center columns by subtracting column median',
          dataset: { transformOption: 'centerColsMedian' }
        }),
        button(`${key}TransformNormalizeRows`, 'Normalize rows (z)', 'transform', {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Normalize rows to z-score',
          dataset: { transformOption: 'normalizeRows' }
        }),
        button(`${key}TransformNormalizeCols`, 'Normalize cols (z)', 'transform', {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Normalize columns to z-score',
          dataset: { transformOption: 'normalizeCols' }
        }),
        button(`${key}TransformCustom`, 'Custom', 'transform', {
          classes: ['workspace-toolbar__button--text-only'],
          title: 'Create a transformed data tab from a custom expression',
          dataset: { transformOption: 'custom', transformCustomTrigger: '1' }
        })
      ]
    });

    const openMenuItems = (key) => [
      {
        id: `open${capitalize(key)}Graph`,
        label: 'Open (.graph)',
        dataset: { fileAction: 'open' }
      }
    ];

    const saveMenuItems = (key) => [
      {
        id: `save${capitalize(key)}Graph`,
        label: 'Save (.graph)',
        dataset: { fileAction: 'save' },
        ariaLabel: 'Save to a .graph archive'
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
              button('saveAsVenn', 'Save As', 'saveAs'),
              button('sample', 'Load Example', 'example')
            ]
          },
          history('venn'),
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
              button('saveAsBox', 'Save As', 'saveAs'),
              button('boxLoadExample', 'Load Example', 'example')
            ]
          },
          history('box'),
          dataTransformsSection('box'),
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
              button('saveAsScatter', 'Save As', 'saveAs'),
              button('scatterLoadExample', 'Load Example', 'example')
            ]
          },
          history('scatter'),
          dataTransformsSection('scatter'),
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
              button('saveAsPca', 'Save As', 'saveAs'),
              button('pcaLoadExample', 'Load Example', 'example')
            ]
          },
          history('pca'),
          dataTransformsSection('pca'),
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
              button('saveAsLine', 'Save As', 'saveAs'),
              button('lineLoadExample', 'Load Example', 'example')
            ]
          },
          history('line'),
          dataTransformsSection('line'),
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
              button('saveAsHeatmap', 'Save As', 'saveAs'),
              button('heatmapLoadExample', 'Load Example', 'example')
            ]
          },
          history('heatmap'),
          dataTransformsSection('heatmap'),
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
              button('saveAsSurface', 'Save As', 'saveAs'),
              button('surfaceLoadExample', 'Load Example', 'example')
            ]
          },
          history('surface'),
          dataTransformsSection('surface'),
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
              button('saveAsRoc', 'Save As', 'saveAs'),
              button('rocLoadExample', 'Load Example', 'example')
            ]
          },
          history('roc'),
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
              button('saveAsSurvival', 'Save As', 'saveAs'),
              button('survivalLoadExample', 'Load Example', 'example')
            ]
          },
          history('survival'),
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
              button('saveAsHist', 'Save As', 'saveAs'),
              button('histLoadExample', 'Load Example', 'example')
            ]
          },
          history('hist'),
          dataTransformsSection('hist'),
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
              button('saveAsPie', 'Save As', 'saveAs'),
              button('pieLoadExample', 'Load Example', 'example')
            ]
          },
          history('pie'),
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
