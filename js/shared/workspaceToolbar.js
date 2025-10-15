(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const workspaceToolbar = Shared.workspaceToolbar = Shared.workspaceToolbar || {};
  const doc = global.document;

  const ICON_PATHS = Object.freeze({
    open: 'M4.75 5a1.75 1.75 0 0 0-1.75 1.75v11.5A1.75 1.75 0 0 0 4.75 20h14.5A1.75 1.75 0 0 0 21 18.25v-7.5A1.75 1.75 0 0 0 19.25 9h-6.69l-1.72-2.29A1.5 1.5 0 0 0 9.86 6H4.75Z',
    import: 'M5 4a2 2 0 0 0-2 2v3h2V6h14v4h2V6a2 2 0 0 0-2-2H5Zm7 4.75a.75.75 0 0 0-.75.75v4.19l-1.47-1.47-1.06 1.06 3 3a.75.75 0 0 0 1.06 0l3-3-1.06-1.06-1.47 1.47V9.5a.75.75 0 0 0-.75-.75ZM4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1h-2v1H6v-1H4Z',
    save: 'M5.75 3A1.75 1.75 0 0 0 4 4.75v14.5A1.75 1.75 0 0 0 5.75 21h12.5A1.75 1.75 0 0 0 20 19.25V8.06a1.75 1.75 0 0 0-.51-1.24l-2.31-2.31A1.75 1.75 0 0 0 15.94 4H5.75Zm1.75 1.5h8.19l2.06 2.06V8H14a1 1 0 0 1-1-1V4.5H7.5V7a.5.5 0 0 1-.5.5H5.5V4.75A.75.75 0 0 1 6.25 4h1.25v.5ZM6 9.5h12v9.75a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75V9.5Zm3 3.25v4.5h6v-4.5H9Z',
    saveAs: 'M5.75 3A1.75 1.75 0 0 0 4 4.75v14.5A1.75 1.75 0 0 0 5.75 21h12.5A1.75 1.75 0 0 0 20 19.25V8.06a1.75 1.75 0 0 0-.51-1.24l-2.31-2.31A1.75 1.75 0 0 0 15.94 4H5.75ZM6 9.5h12v9.75a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75V9.5Zm9-5v3a1 1 0 0 0 1 1h3v-.44a.75.75 0 0 0-.22-.53L16.47 4.22a.75.75 0 0 0-.53-.22H15Zm-3.75 8a.75.75 0 0 1 .75.75V14h1.75a.75.75 0 0 1 0 1.5H12V17.25a.75.75 0 0 1-1.5 0V15.5H8.75a.75.75 0 0 1 0-1.5H10V12.25a.75.75 0 0 1 .75-.75Z',
    example: 'M12 4a4 4 0 0 0-4 4H5.5a.5.5 0 0 0-.35.85l3 3a.5.5 0 0 0 .7 0l3-3A.5.5 0 0 0 11.5 8H9.5a2.5 2.5 0 1 1 2.5 2.5h-.5v2h.5a4.5 4.5 0 1 0-4.36-6H9a3 3 0 1 1 3 3h-.5v2.5a.5.5 0 0 0 .85.35l3-3a.5.5 0 0 0 0-.7l-3-3a.5.5 0 0 0-.85.35V8A4 4 0 0 0 12 4Zm-6 12h12v2H6v-2Z'
  });

  const DEFAULT_HINT = 'Select chart text or an axis to reveal typography and tick options.';
  const NS = 'http://www.w3.org/2000/svg';
  const toolbarConfigs = new Map();

  function logDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: workspaceToolbar ' + message, payload || {});
    }
  }

  function createSvgIcon(iconKey){
    if(!doc){ return null; }
    const pathDef = ICON_PATHS[iconKey];
    if(!pathDef){
      logDebug('missing icon', { iconKey });
      return null;
    }
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('data-icon', 'toolbar');
    const path = doc.createElementNS(NS, 'path');
    path.setAttribute('d', pathDef);
    svg.appendChild(path);
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
  }

  function renderAllToolbars(){
    if(!doc){ return; }
    const containers = doc.querySelectorAll('.workspace-page__topbar[data-toolbar]');
    containers.forEach(renderToolbarForElement);
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
    const button = (id, label, icon) => ({ id, label, icon });
    const dock = (scopeId) => ({
      type: 'dock',
      caption: 'Font',
      ariaLabel: 'Font controls',
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
          {
            type: 'buttons',
            caption: 'Data',
            ariaLabel: 'Dataset helpers',
            buttons: [
              button('lineLoadExample', 'Load Example', 'example')
            ]
          },
          {
            type: 'form',
            caption: 'Series',
            ariaLabel: 'Series configuration',
            controls: [
              {
                type: 'input',
                inputType: 'number',
                id: 'lineReplicates',
                label: 'Y replicates',
                value: '1',
                classes: ['workspace-toolbar__input--compact'],
                attributes: { min: '1', max: '10', step: '1' }
              },
              {
                type: 'select',
                id: 'lineExampleSelect',
                label: 'Example data',
                classes: ['workspace-toolbar__input--select'],
                options: [
                  { value: 'standard', label: 'Standard (single replicate)', selected: true },
                  { value: 'replicates2', label: 'Two replicates (Control vs Treated)' },
                  { value: 'replicates3', label: 'Three replicates (Dose response)' }
                ]
              }
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
    if(doc.readyState === 'loading'){
      doc.addEventListener('DOMContentLoaded', () => {
        renderAllToolbars();
      }, { once: true });
    }
  }
})(window);
