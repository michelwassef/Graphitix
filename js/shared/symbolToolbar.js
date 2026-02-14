(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};

  function clampNumeric(value, min, fallback){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return fallback;
    }
    return Math.max(min, numeric);
  }

  function resolveShapeOptions(options){
    if(Array.isArray(options) && options.length){
      return options;
    }
    if(typeof Shared.getShapePickerOptions === 'function'){
      const resolved = Shared.getShapePickerOptions();
      if(Array.isArray(resolved) && resolved.length){
        return resolved;
      }
    }
    return [{ value: 'circle', label: 'Circle' }];
  }

  function ensureToolbarHost(anchor, scopeId, doc){
    if(!anchor){ return null; }
    let host = anchor.nextElementSibling && anchor.nextElementSibling.classList && anchor.nextElementSibling.classList.contains('font-toolbar-host')
      ? anchor.nextElementSibling
      : null;
    if(!host){
      host = doc.createElement('div');
      host.className = 'font-toolbar-host';
      host.dataset.fontToolbarScope = scopeId || 'symbol';
      host.style.display = 'none';
      anchor.insertAdjacentElement('afterend', host);
    }
    return host;
  }

  function hideOtherVisibleHosts(currentHost, doc){
    doc.querySelectorAll('.font-toolbar-host.font-toolbar-host--visible').forEach(host => {
      if(host !== currentHost){
        host.classList.remove('font-toolbar-host--visible');
        host.style.display = 'none';
      }
    });
  }

  function hideHost(host){
    if(!host){ return; }
    host.classList.remove('font-toolbar-host--visible');
    host.style.display = 'none';
    const dock = host.closest('.workspace-toolbar__dock');
    if(dock){
      dock.classList.remove('workspace-toolbar__dock--active');
    }
  }

  Shared.symbolToolbar = Shared.symbolToolbar || {};

  Shared.symbolToolbar.show = function showSymbolToolbar(config){
    const cfg = config || {};
    const doc = cfg.document || global.document;
    if(!doc){ return null; }
    const anchor = typeof cfg.anchorId === 'string' ? doc.getElementById(cfg.anchorId) : cfg.anchor;
    if(!anchor){ return null; }
    const host = ensureToolbarHost(anchor, cfg.scopeId, doc);
    if(!host){ return null; }

    hideOtherVisibleHosts(host, doc);
    host.innerHTML = '';

    const wrap = doc.createElement('div');
    const className = cfg.formClass || 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls';
    wrap.className = className;
    if(cfg.formDataKey){
      wrap.dataset[cfg.formDataKey] = '1';
    }

    const makeInput = (labelText, inputEl, extraClass) => {
      const lbl = doc.createElement('label');
      lbl.className = 'workspace-toolbar__input workspace-toolbar__input--compact';
      if(extraClass){
        lbl.classList.add(extraClass);
      }
      const span = doc.createElement('span');
      span.className = 'workspace-toolbar__input-label';
      span.textContent = labelText;
      if(inputEl && inputEl.classList){
        inputEl.classList.add('workspace-toolbar__input-control');
      }
      lbl.appendChild(span);
      lbl.appendChild(inputEl);
      return lbl;
    };

    const scopeCfg = cfg.scope || {};
    const scopeSelect = doc.createElement('select');
    scopeSelect.className = 'workspace-toolbar__select';
    const scopeOptions = Array.isArray(scopeCfg.options) ? scopeCfg.options : [];
    scopeOptions.forEach(option => {
      const opt = doc.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label || option.value;
      opt.disabled = !!option.disabled;
      scopeSelect.appendChild(opt);
    });
    if(scopeSelect.options.length){
      const desired = typeof scopeCfg.value === 'string' ? scopeCfg.value : scopeSelect.options[0].value;
      scopeSelect.value = desired;
    }
    wrap.appendChild(makeInput(scopeCfg.label || 'Scope', scopeSelect, 'workspace-toolbar__input--scope'));

    const getContext = () => ({
      scope: scopeSelect.value,
      target: cfg.target || null
    });

    const fillCfg = cfg.fillShape || {};
    const borderCfg = cfg.border || {};
    const sizeCfg = cfg.size || {};
    const transparencyCfg = cfg.transparency || {};

    let currentSize = clampNumeric(typeof sizeCfg.get === 'function' ? sizeCfg.get(getContext()) : 0, 0, 0);
    let currentBorderWidth = clampNumeric(typeof borderCfg.getWidth === 'function' ? borderCfg.getWidth(getContext()) : 0, 0, 0);
    let currentBorderColor = typeof borderCfg.getColor === 'function' ? borderCfg.getColor(getContext()) : '#000000';

    const applySize = (nextValue) => {
      const next = clampNumeric(nextValue, 0, 0);
      currentSize = next;
      if(typeof sizeCfg.onChange === 'function'){
        sizeCfg.onChange(next, getContext());
      }
      syncFillChipUi();
    };

    const applyBorderWidth = (nextValue) => {
      const next = clampNumeric(nextValue, 0, 0);
      currentBorderWidth = next;
      if(typeof borderCfg.onWidthChange === 'function'){
        borderCfg.onWidthChange(next, getContext());
      }
      syncBorderChipUi();
    };

    const clearStyleSection = overlayEl => {
      if(!overlayEl){ return; }
      overlayEl.querySelectorAll('.shared-color-picker__section--scatter-style').forEach(node => node.remove());
    };

    const createStyleSection = (titleText, value, onInput) => {
      const section = doc.createElement('section');
      section.className = 'shared-color-picker__section shared-color-picker__section--scatter-style';
      const title = doc.createElement('div');
      title.className = 'shared-color-picker__section-title';
      title.textContent = titleText;
      section.appendChild(title);
      const row = doc.createElement('div');
      row.className = 'shared-color-picker__scatter-style-row shared-color-picker__scatter-style-row--single';
      const field = doc.createElement('label');
      field.className = 'shared-color-picker__scatter-style-field';
      const input = doc.createElement('input');
      input.className = 'shared-color-picker__scatter-style-input';
      input.type = 'number';
      input.min = '0';
      input.step = '0.5';
      input.value = String(Math.round(value * 10) / 10);
      input.setAttribute('aria-label', titleText);
      input.addEventListener('input', () => onInput(input.value));
      field.appendChild(input);
      row.appendChild(field);
      section.appendChild(row);
      return section;
    };

    const attachSizeSection = overlayEl => {
      if(!overlayEl){ return () => {}; }
      clearStyleSection(overlayEl);
      const section = createStyleSection('Size', currentSize, applySize);
      const shapeSection = overlayEl.querySelector('.shared-color-picker__section--shapes');
      if(shapeSection && shapeSection.parentNode){
        shapeSection.insertAdjacentElement('afterend', section);
      }else{
        overlayEl.appendChild(section);
      }
      return () => section.parentNode && section.parentNode.removeChild(section);
    };

    const attachBorderSection = overlayEl => {
      if(!overlayEl){ return () => {}; }
      clearStyleSection(overlayEl);
      const section = createStyleSection('Border thickness', currentBorderWidth, applyBorderWidth);
      overlayEl.insertBefore(section, overlayEl.firstChild || null);
      return () => section.parentNode && section.parentNode.removeChild(section);
    };

    let syncFillChipUi = () => {};
    let syncBorderChipUi = () => {};

    const fillShapeSwatch = typeof Shared.createShapeColorSwatch === 'function'
      ? Shared.createShapeColorSwatch({
          document: doc,
          label: fillCfg.label || 'Fill/Shape',
          color: typeof fillCfg.getColor === 'function' ? fillCfg.getColor(getContext()) : '#377eb8',
          shape: typeof fillCfg.getShape === 'function' ? fillCfg.getShape(getContext()) : 'circle',
          shapeOptions: resolveShapeOptions(fillCfg.shapeOptions),
          onColorInput(value){
            if(typeof fillCfg.onColorInput === 'function'){
              fillCfg.onColorInput(value, getContext());
            }
          },
          onColorChange(value){
            if(typeof fillCfg.onColorChange === 'function'){
              fillCfg.onColorChange(value, getContext());
            }
          },
          onShapeChange(value){
            if(typeof fillCfg.onShapeChange === 'function'){
              fillCfg.onShapeChange(value, getContext());
            }
          },
          onPickerOpen(payload){
            fillPickerCleanup = attachSizeSection(payload?.overlay || null);
          },
          onPickerClose(){
            if(typeof fillPickerCleanup === 'function'){
              fillPickerCleanup();
              fillPickerCleanup = null;
            }
          }
        })
      : null;

    let fillPickerCleanup = null;
    const fillControlElement = fillShapeSwatch?.element || (() => {
      const fallback = doc.createElement('input');
      fallback.type = 'color';
      fallback.value = typeof fillCfg.getColor === 'function' ? fillCfg.getColor(getContext()) : '#377eb8';
      fallback.addEventListener('input', () => {
        if(typeof fillCfg.onColorInput === 'function'){
          fillCfg.onColorInput(fallback.value, getContext());
        }
      });
      return fallback;
    })();

    if(fillShapeSwatch?.swatch){
      fillShapeSwatch.swatch.classList.add('shared-fill-style-chip');
      syncFillChipUi = () => {
        const text = Number.isFinite(currentSize) ? (Math.round(currentSize * 10) / 10).toString() : '0';
        fillShapeSwatch.swatch.dataset.sizeText = `${text}px`;
      };
      syncFillChipUi();
      fillShapeSwatch.swatch.title = 'Click to edit fill/shape. Wheel or Alt+drag to adjust marker size.';
      fillShapeSwatch.swatch.addEventListener('wheel', evt => {
        evt.preventDefault();
        const step = evt.deltaY < 0 ? 0.5 : -0.5;
        applySize(currentSize + step);
      }, { passive: false });
      let fillDragState = null;
      let suppressClick = false;
      const onMove = evt => {
        if(!fillDragState){ return; }
        const deltaX = evt.clientX - fillDragState.startX;
        const steps = Math.round(deltaX / 8);
        applySize(fillDragState.startValue + (steps * 0.5));
      };
      const onUp = () => {
        if(!fillDragState){ return; }
        fillDragState = null;
        global.removeEventListener('mousemove', onMove);
        global.removeEventListener('mouseup', onUp);
      };
      fillShapeSwatch.swatch.addEventListener('mousedown', evt => {
        if(!evt.altKey || evt.button !== 0){ return; }
        evt.preventDefault();
        suppressClick = true;
        fillDragState = { startX: evt.clientX, startValue: currentSize };
        global.addEventListener('mousemove', onMove);
        global.addEventListener('mouseup', onUp);
      });
      fillShapeSwatch.swatch.addEventListener('click', evt => {
        if(!suppressClick){ return; }
        suppressClick = false;
        evt.preventDefault();
        evt.stopPropagation();
      }, true);
    }
    const fillLabel = makeInput(fillCfg.label || 'Fill/Shape', fillControlElement);
    fillLabel.classList.add('workspace-toolbar__input--color');
    wrap.appendChild(fillLabel);

    const borderInput = doc.createElement('input');
    borderInput.type = 'color';
    borderInput.value = currentBorderColor || '#000000';
    const borderControl = doc.createElement('div');
    borderControl.className = 'shared-border-style-control';
    const borderChip = doc.createElement('button');
    borderChip.type = 'button';
    borderChip.className = 'shared-border-style-chip';
    borderChip.title = 'Click to edit border color. Wheel or Alt+drag to adjust border thickness.';
    const borderPreview = doc.createElement('span');
    borderPreview.className = 'shared-border-style-chip-preview';
    const borderValue = doc.createElement('span');
    borderValue.className = 'shared-border-style-chip-value';
    borderChip.appendChild(borderPreview);
    borderChip.appendChild(borderValue);
    borderInput.className = 'shared-border-style-input';
    borderControl.appendChild(borderChip);
    borderControl.appendChild(borderInput);

    syncBorderChipUi = () => {
      const widthText = Number.isFinite(currentBorderWidth) ? (Math.round(currentBorderWidth * 10) / 10).toString() : '0';
      borderValue.textContent = `${widthText}px`;
      borderPreview.style.background = currentBorderColor || '#000000';
      borderChip.dataset.noBorder = currentBorderWidth <= 0 ? '1' : '0';
    };
    syncBorderChipUi();

    borderInput.addEventListener('input', () => {
      currentBorderColor = borderInput.value;
      if(typeof borderCfg.onColorInput === 'function'){
        borderCfg.onColorInput(currentBorderColor, getContext());
      }
      syncBorderChipUi();
    });
    borderInput.addEventListener('change', () => {
      currentBorderColor = borderInput.value;
      if(typeof borderCfg.onColorChange === 'function'){
        borderCfg.onColorChange(currentBorderColor, getContext());
      }
      syncBorderChipUi();
    });

    borderChip.addEventListener('wheel', evt => {
      evt.preventDefault();
      const step = evt.deltaY < 0 ? 0.5 : -0.5;
      applyBorderWidth(currentBorderWidth + step);
    }, { passive: false });
    let borderDragState = null;
    const onBorderMove = evt => {
      if(!borderDragState){ return; }
      const deltaX = evt.clientX - borderDragState.startX;
      const steps = Math.round(deltaX / 8);
      applyBorderWidth(borderDragState.startValue + (steps * 0.5));
    };
    const onBorderUp = () => {
      if(!borderDragState){ return; }
      borderDragState = null;
      global.removeEventListener('mousemove', onBorderMove);
      global.removeEventListener('mouseup', onBorderUp);
    };
    borderChip.addEventListener('mousedown', evt => {
      if(!evt.altKey || evt.button !== 0){ return; }
      evt.preventDefault();
      borderDragState = { startX: evt.clientX, startValue: currentBorderWidth };
      global.addEventListener('mousemove', onBorderMove);
      global.addEventListener('mouseup', onBorderUp);
    });

    let borderPickerCleanup = null;
    if(typeof Shared.openColorPicker === 'function'){
      borderChip.addEventListener('click', evt => {
        evt.preventDefault();
        evt.stopPropagation();
        const overlayEl = Shared.openColorPicker({
          anchor: borderChip,
          color: borderInput.value,
          element: borderInput,
          onInput(value){
            borderInput.value = value;
            borderInput.dispatchEvent(new Event('input', { bubbles: true }));
          },
          onChange(value){
            borderInput.value = value;
            borderInput.dispatchEvent(new Event('change', { bubbles: true }));
          },
          onClose(){
            if(typeof borderPickerCleanup === 'function'){
              borderPickerCleanup();
              borderPickerCleanup = null;
            }
          }
        });
        borderPickerCleanup = attachBorderSection(overlayEl);
      });
    }else if(typeof Shared.attachColorPickerNear === 'function'){
      Shared.attachColorPickerNear(borderInput);
      borderChip.addEventListener('click', evt => {
        evt.preventDefault();
        borderInput.click();
      });
    }

    const borderLabel = makeInput(borderCfg.label || 'Border', borderControl);
    borderLabel.classList.add('workspace-toolbar__input--color');
    wrap.appendChild(borderLabel);

    const transparencyInput = doc.createElement('input');
    transparencyInput.type = 'range';
    transparencyInput.min = '0';
    transparencyInput.max = '100';
    transparencyInput.step = '1';
    const transparencyValue = doc.createElement('span');
    transparencyValue.className = 'workspace-toolbar__input-value';
    const syncTransparency = () => {
      const t = clampNumeric(typeof transparencyCfg.get === 'function' ? transparencyCfg.get(getContext()) : 0, 0, 0);
      const pct = Math.round(Math.min(1, Math.max(0, t)) * 100);
      transparencyInput.value = String(pct);
      transparencyValue.textContent = `${pct}%`;
    };
    syncTransparency();
    transparencyInput.addEventListener('input', () => {
      const pct = Number(transparencyInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const normalized = bounded / 100;
      if(typeof transparencyCfg.onChange === 'function'){
        transparencyCfg.onChange(normalized, getContext());
      }
      transparencyValue.textContent = `${Math.round(bounded)}%`;
    });
    const transparencyWrap = doc.createElement('div');
    transparencyWrap.className = 'workspace-toolbar__range';
    transparencyWrap.appendChild(transparencyInput);
    transparencyWrap.appendChild(transparencyValue);
    wrap.appendChild(makeInput(transparencyCfg.label || 'Transparency', transparencyWrap));

    scopeSelect.addEventListener('change', () => {
      if(typeof scopeCfg.onChange === 'function'){
        scopeCfg.onChange(scopeSelect.value);
      }
      currentSize = clampNumeric(typeof sizeCfg.get === 'function' ? sizeCfg.get(getContext()) : currentSize, 0, currentSize);
      currentBorderWidth = clampNumeric(typeof borderCfg.getWidth === 'function' ? borderCfg.getWidth(getContext()) : currentBorderWidth, 0, currentBorderWidth);
      currentBorderColor = typeof borderCfg.getColor === 'function' ? (borderCfg.getColor(getContext()) || currentBorderColor) : currentBorderColor;
      syncFillChipUi();
      borderInput.value = currentBorderColor || borderInput.value;
      syncBorderChipUi();
      syncTransparency();
      if(fillShapeSwatch && typeof fillShapeSwatch.update === 'function'){
        const nextColor = typeof fillCfg.getColor === 'function' ? fillCfg.getColor(getContext()) : null;
        const nextShape = typeof fillCfg.getShape === 'function' ? fillCfg.getShape(getContext()) : null;
        fillShapeSwatch.update(nextColor, nextShape);
      }
    });

    host.appendChild(wrap);
    host.style.display = 'block';
    host.classList.add('font-toolbar-host--visible');
    const dock = host.closest('.workspace-toolbar__dock');
    if(dock){
      dock.classList.add('workspace-toolbar__dock--active');
    }

    try{
      if(host.__symbolToolbarDocClickHandler){
        doc.removeEventListener('click', host.__symbolToolbarDocClickHandler);
        host.__symbolToolbarDocClickHandler = null;
      }
      const onDocClick = evt => {
        const target = evt?.target;
        if(!target){ return; }
        if(host.contains(target)){ return; }
        if(target.closest && target.closest('.shared-color-picker')){ return; }
        hideHost(host);
        if(typeof Shared.hideAllFormatControls === 'function'){
          try{ Shared.hideAllFormatControls(); }catch(e){}
        }
        doc.removeEventListener('click', onDocClick);
        host.__symbolToolbarDocClickHandler = null;
        if(typeof cfg.onClose === 'function'){
          cfg.onClose();
        }
      };
      doc.addEventListener('click', onDocClick);
      host.__symbolToolbarDocClickHandler = onDocClick;
    }catch(e){}

    return { host, wrap, scopeSelect };
  };
})(window);

