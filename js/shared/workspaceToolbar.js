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
    }
  });

  const DEFAULT_HINT = 'Select chart text or an axis to reveal typography and tick options.';
  const NS = 'http://www.w3.org/2000/svg';
  const toolbarConfigs = new Map();
  const UNDO_BUTTON_SELECTOR = 'button[data-undo-command="undo"]';
  const REDO_BUTTON_SELECTOR = 'button[data-undo-command="redo"]';
  let undoSubscriptionCleanup = null;

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

    const buttonsWrap = doc.createElement('div');
    buttonsWrap.className = 'workspace-toolbar__buttons';
    (section.buttons || []).forEach(buttonConfig => {
      const button = createButton(buttonConfig);
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

    const TOOLBAR_DATA = {
      venn: {
        ariaLabel: 'Venn diagram actions',
        sections: [
          {
            type: 'buttons',
            caption: 'File',
            ariaLabel: 'File actions',
            buttons: [
              button('openVenn', 'Open', 'open'),
              button('saveVenn', 'Save', 'save'),
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
          dock('venn')
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
              button('openBox', 'Open', 'open'),
              button('boxImport', 'Import', 'import'),
              button('saveBox', 'Save', 'save'),
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
          dock('box')
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
              button('openScatter', 'Open', 'open'),
              button('scatterImport', 'Import', 'import'),
              button('saveScatter', 'Save', 'save'),
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
          dock('scatter')
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
              button('openPca', 'Open', 'open'),
              button('pcaImport', 'Import', 'import'),
              button('savePca', 'Save', 'save'),
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
          dock('pca')
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
              button('openLine', 'Open', 'open'),
              button('lineImport', 'Import', 'import'),
              button('saveLine', 'Save', 'save'),
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
          dock('line')
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
              button('openHeatmap', 'Open', 'open'),
              button('heatmapImport', 'Import', 'import'),
              button('saveHeatmap', 'Save', 'save'),
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
          dock('heatmap')
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
              button('openSurface', 'Open', 'open'),
              button('surfaceImport', 'Import', 'import'),
              button('saveSurface', 'Save', 'save'),
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
          dock('surface')
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
              button('openRoc', 'Open', 'open'),
              button('rocImport', 'Import', 'import'),
              button('saveRoc', 'Save', 'save'),
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
          dock('roc')
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
              button('openSurvival', 'Open', 'open'),
              button('survivalImport', 'Import', 'import'),
              button('saveSurvival', 'Save', 'save'),
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
          dock('survival')
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
              button('openHist', 'Open', 'open'),
              button('histImport', 'Import', 'import'),
              button('saveHist', 'Save', 'save'),
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
          dock('hist')
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
              button('openPie', 'Open', 'open'),
              button('pieImport', 'Import', 'import'),
              button('savePie', 'Save', 'save'),
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
          dock('pie')
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
