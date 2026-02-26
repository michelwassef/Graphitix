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

  function encodeScopeValueInternal(kind, dataset){
    const scopeKind = String(kind == null ? '' : kind).trim();
    if(!scopeKind){ return ''; }
    const datasetValue = dataset == null ? '' : String(dataset).trim();
    if(!datasetValue){
      return scopeKind;
    }
    return `${scopeKind}::${encodeURIComponent(datasetValue)}`;
  }

  function decodeScopeValueInternal(value){
    const raw = String(value == null ? '' : value).trim();
    if(!raw){
      return { raw: '', kind: '', dataset: '' };
    }
    const tokenIndex = raw.indexOf('::');
    if(tokenIndex <= 0){
      return { raw, kind: raw, dataset: '' };
    }
    const kind = String(raw.slice(0, tokenIndex) || '').trim();
    const encodedDataset = raw.slice(tokenIndex + 2);
    let dataset = encodedDataset;
    try{
      dataset = decodeURIComponent(encodedDataset);
    }catch(err){}
    const normalizedDataset = String(dataset == null ? '' : dataset).trim();
    return {
      raw,
      kind: kind || raw,
      dataset: normalizedDataset
    };
  }

  Shared.encodeScopeValue = function encodeScopeValue(kind, dataset){
    return encodeScopeValueInternal(kind, dataset);
  };
  Shared.decodeScopeValue = function decodeScopeValue(value){
    return decodeScopeValueInternal(value);
  };

  function readFirstNonEmpty(values){
    if(!Array.isArray(values)){ return ''; }
    for(let i = 0; i < values.length; i += 1){
      const value = values[i];
      if(value == null){ continue; }
      const text = String(value).trim();
      if(text){ return text; }
    }
    return '';
  }

  function toDataAttrName(value){
    const raw = String(value == null ? '' : value).trim();
    if(!raw){ return ''; }
    return raw
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
  }

  function inferScopeDatasetLabel(optionValue, target){
    if(!target){ return ''; }
    const ds = target.dataset || {};
    const getAttr = name => {
      if(!name || typeof target.getAttribute !== 'function'){ return ''; }
      const value = target.getAttribute(name);
      return value == null ? '' : String(value).trim();
    };
    const normalized = String(optionValue == null ? '' : optionValue).trim().toLowerCase();
    if(!normalized){ return ''; }
    if(normalized === 'series'){
      return readFirstNonEmpty([
        ds.series,
        getAttr('data-series'),
        ds.group,
        getAttr('data-group'),
        ds.dist,
        getAttr('data-dist')
      ]);
    }
    if(normalized === 'trace'){
      return readFirstNonEmpty([
        ds.upsetTraceId,
        getAttr('data-upset-trace-id'),
        ds.vennTraceId,
        getAttr('data-venn-trace-id'),
        ds.traceId,
        getAttr('data-trace-id'),
        ds.trace,
        getAttr('data-trace')
      ]);
    }
    if(normalized === 'label'){
      return readFirstNonEmpty([
        target.__scatterPointData?.label,
        target.__pcaPointData?.label,
        ds.label,
        getAttr('data-label')
      ]);
    }
    const dataAttr = toDataAttrName(optionValue);
    return readFirstNonEmpty([
      ds[optionValue],
      dataAttr ? getAttr(`data-${dataAttr}`) : ''
    ]);
  }

  function normalizeScopeOptionsInternal(options, context, scopeCfg){
    const list = Array.isArray(options) ? options : [];
    const ctx = context || {};
    const cfg = scopeCfg && typeof scopeCfg === 'object' ? scopeCfg : {};
    const target = ctx.target || null;
    const datasetLabels = cfg.datasetLabels && typeof cfg.datasetLabels === 'object'
      ? cfg.datasetLabels
      : {};
    const genericLabels = new Set(['trace', 'series', 'label', 'dataset', 'scope']);
    const mapped = list.map(option => {
      const source = option && typeof option === 'object' ? option : {};
      const value = source.value == null ? '' : String(source.value);
      const lowerValue = value.trim().toLowerCase();
      const rawLabel = source.label == null ? value : String(source.label);
      const trimmedLabel = rawLabel.trim();
      const lowerLabel = trimmedLabel.toLowerCase();
      const isGlobal = lowerValue === 'global';
      const explicitDataset = source.datasetLabel == null ? '' : String(source.datasetLabel).trim();
      const mappedDataset = datasetLabels[value] == null ? '' : String(datasetLabels[value]).trim();
      const inferredDataset = inferScopeDatasetLabel(value, target);
      const isGeneric = !trimmedLabel || genericLabels.has(lowerLabel) || lowerLabel === lowerValue;
      let nextLabel = trimmedLabel || value;
      if(isGlobal){
        nextLabel = 'Global';
      }else if(explicitDataset){
        nextLabel = explicitDataset;
      }else if(mappedDataset){
        nextLabel = mappedDataset;
      }else if(isGeneric && inferredDataset){
        nextLabel = inferredDataset;
      }
      return {
        ...source,
        value,
        label: nextLabel,
        __isGlobal: isGlobal
      };
    });
    const globals = [];
    const others = [];
    mapped.forEach(option => {
      if(option.__isGlobal){
        globals.push(option);
      }else{
        others.push(option);
      }
    });
    return globals.length ? globals.concat(others) : mapped;
  }

  Shared.normalizeScopeOptions = function normalizeScopeOptions(options, context, scopeCfg){
    return normalizeScopeOptionsInternal(options, context, scopeCfg);
  };

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

  function resetHostPresentation(host, options){
    if(!host){ return; }
    const opts = options || {};
    const keepVisible = !!opts.keepVisible;
    try{
      Array.from(host.classList || []).forEach(cls => {
        if(typeof cls !== 'string' || cls.indexOf('font-toolbar-host--') !== 0){ return; }
        if(keepVisible && cls === 'font-toolbar-host--visible'){ return; }
        host.classList.remove(cls);
      });
    }catch(e){
      if(!keepVisible){
        host.classList.remove('font-toolbar-host--visible');
      }
    }
    host.style.removeProperty('grid-auto-flow');
    host.style.removeProperty('grid-auto-columns');
    host.style.removeProperty('column-gap');
    host.style.removeProperty('row-gap');
    host.style.removeProperty('align-items');
    host.style.removeProperty('justify-content');
    host.style.removeProperty('overflow-x');
    host.style.removeProperty('overflow-y');
    host.style.removeProperty('min-width');
    host.style.removeProperty('max-width');
    host.style.removeProperty('width');
    const dock = host.closest('.workspace-toolbar__dock');
    if(dock){
      dock.style.removeProperty('min-width');
      dock.style.removeProperty('max-width');
      dock.style.removeProperty('width');
      if(!keepVisible){
        dock.classList.remove('workspace-toolbar__dock--active');
      }
    }
  }

  function hideOtherVisibleHosts(currentHost, doc){
    doc.querySelectorAll('.font-toolbar-host.font-toolbar-host--visible').forEach(host => {
      if(host !== currentHost){
        hideHost(host);
      }
    });
  }

  function hideHost(host){
    if(!host){ return; }
    resetHostPresentation(host, { keepVisible: false });
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

    resetHostPresentation(host, { keepVisible: false });
    hideOtherVisibleHosts(host, doc);
    host.innerHTML = '';

    const panel = doc.createElement('div');
    panel.className = 'workspace-toolbar__panel workspace-toolbar__panel--symbol';

    const panelTitleText = typeof cfg.panelTitle === 'string' && cfg.panelTitle.trim()
      ? cfg.panelTitle.trim()
      : 'Symbol';
    const panelTitleEl = doc.createElement('div');
    panelTitleEl.className = 'workspace-toolbar__panel-title';
    panelTitleEl.textContent = panelTitleText;
    panel.appendChild(panelTitleEl);

    const wrap = doc.createElement('div');
    const className = cfg.formClass || 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls';
    const normalizedClassName = /\badditional-line-controls-panel__row\b/.test(className)
      ? className
      : `${className} additional-line-controls-panel__row`;
    wrap.className = normalizedClassName;
    if(cfg.formDataKey){
      wrap.dataset[cfg.formDataKey] = '1';
    }

    const makeInput = (labelText, inputEl, extraClass) => {
      const lbl = doc.createElement('label');
      lbl.className = 'additional-line-controls-panel__field';
      if(extraClass){
        String(extraClass)
          .split(/\s+/)
          .filter(Boolean)
          .forEach(cls => lbl.classList.add(cls));
      }
      const span = doc.createElement('span');
      span.className = 'additional-line-controls-panel__field-label';
      span.textContent = labelText;
      if(inputEl && inputEl.classList){
        inputEl.classList.add('workspace-toolbar__input-control');
        const tagName = String(inputEl.tagName || '').toUpperCase();
        if(tagName === 'SELECT'){
          inputEl.classList.add('additional-line-controls-panel__input', 'additional-line-controls-panel__input--select');
        }else if(tagName === 'INPUT' && inputEl.type === 'number'){
          inputEl.classList.add('additional-line-controls-panel__input', 'additional-line-controls-panel__input--small');
        }
      }
      lbl.appendChild(span);
      lbl.appendChild(inputEl);
      return lbl;
    };

    const scopeCfg = cfg.scope || {};
    const scopeSelect = doc.createElement('select');
    scopeSelect.className = 'workspace-toolbar__select';
    const scopeOptions = Shared.normalizeScopeOptions(Array.isArray(scopeCfg.options) ? scopeCfg.options : [], { target: cfg.target }, scopeCfg);
    scopeOptions.forEach(option => {
      const opt = doc.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label || option.value;
      opt.disabled = !!option.disabled;
      if(option.scopeDataset != null){
        opt.dataset.scopeDataset = String(option.scopeDataset);
      }
      if(option.scopeKind != null){
        opt.dataset.scopeKind = String(option.scopeKind);
      }
      scopeSelect.appendChild(opt);
    });
    if(scopeSelect.options.length){
      const desiredRaw = typeof scopeCfg.value === 'string' ? scopeCfg.value : scopeSelect.options[0].value;
      const desired = Array.from(scopeSelect.options).some(opt => opt.value === desiredRaw && !opt.disabled)
        ? desiredRaw
        : (Array.from(scopeSelect.options).find(opt => !opt.disabled)?.value || scopeSelect.options[0].value);
      scopeSelect.value = desired;
    }
    wrap.appendChild(makeInput(scopeCfg.label || 'Scope', scopeSelect, 'additional-line-controls-panel__field--scope'));

    const getContext = () => {
      const rawScopeValue = String(scopeSelect.value == null ? '' : scopeSelect.value).trim();
      const parsedScope = Shared.decodeScopeValue(rawScopeValue);
      const selectedOption = scopeSelect.selectedOptions && scopeSelect.selectedOptions.length
        ? scopeSelect.selectedOptions[0]
        : null;
      const optionDataset = String(selectedOption?.dataset?.scopeDataset || '').trim();
      const optionKind = String(selectedOption?.dataset?.scopeKind || '').trim();
      const scopeKind = String(parsedScope.kind || optionKind || rawScopeValue || '').trim();
      const scopeDataset = String(parsedScope.dataset || optionDataset || '').trim();
      return {
        scope: scopeKind || null,
        scopeValue: parsedScope.raw || rawScopeValue || null,
        scopeDataset: scopeDataset || null,
        target: cfg.target || null
      };
    };

    const fillCfg = cfg.fillShape || {};
    const borderCfg = cfg.border || {};
    const sizeCfg = cfg.size || {};
    const transparencyCfg = cfg.transparency || {};
    const sizeEnabled = sizeCfg.enabled !== false;
    const shapePickerEnabled = fillCfg.showShapePicker !== false;
    const transparencyEnabled = transparencyCfg.enabled !== false;

    let currentSize = clampNumeric(typeof sizeCfg.get === 'function' ? sizeCfg.get(getContext()) : 0, 0, 0);
    let currentBorderWidth = clampNumeric(typeof borderCfg.getWidth === 'function' ? borderCfg.getWidth(getContext()) : 0, 0, 0);
    let currentBorderColor = typeof borderCfg.getColor === 'function' ? borderCfg.getColor(getContext()) : '#000000';

    const applySize = (nextValue) => {
      if(!sizeEnabled){ return; }
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
      if(!sizeEnabled){
        return () => {};
      }
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
          showShapePicker: shapePickerEnabled,
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
        if(!sizeEnabled){
          delete fillShapeSwatch.swatch.dataset.sizeText;
          return;
        }
        const text = Number.isFinite(currentSize) ? (Math.round(currentSize * 10) / 10).toString() : '0';
        fillShapeSwatch.swatch.dataset.sizeText = `${text}px`;
      };
      syncFillChipUi();
      fillShapeSwatch.swatch.title = sizeEnabled
        ? 'Click to edit fill/shape. Wheel or Alt+drag to adjust marker size.'
        : 'Click to edit fill.';
      if(sizeEnabled){
        fillShapeSwatch.swatch.addEventListener('wheel', evt => {
          evt.preventDefault();
          const step = evt.deltaY < 0 ? 0.5 : -0.5;
          applySize(currentSize + step);
        }, { passive: false });
      }
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
      if(sizeEnabled){
        fillShapeSwatch.swatch.addEventListener('mousedown', evt => {
          if(!evt.altKey || evt.button !== 0){ return; }
          evt.preventDefault();
          suppressClick = true;
          fillDragState = { startX: evt.clientX, startValue: currentSize };
          global.addEventListener('mousemove', onMove);
          global.addEventListener('mouseup', onUp);
        });
      }
      fillShapeSwatch.swatch.addEventListener('click', evt => {
        if(!suppressClick){ return; }
        suppressClick = false;
        evt.preventDefault();
        evt.stopPropagation();
      }, true);
    }
    const fillLabel = makeInput(fillCfg.label || 'Fill/Shape', fillControlElement, 'additional-line-controls-panel__field--style additional-line-controls-panel__field--symbol-fill');
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

    const borderLabel = makeInput(borderCfg.label || 'Border', borderControl, 'additional-line-controls-panel__field--style additional-line-controls-panel__field--symbol-border');
    wrap.appendChild(borderLabel);

    let syncTransparency = () => {};
    if(transparencyEnabled){
      const transparencyField = doc.createElement('label');
      transparencyField.className = 'additional-line-controls-panel__field additional-line-controls-panel__field--transparency';
      transparencyField.dataset.symbolTransparencyControl = '1';
      const transparencyLabel = doc.createElement('span');
      transparencyLabel.className = 'additional-line-controls-panel__field-label';
      transparencyLabel.textContent = transparencyCfg.label || 'Transparency';
      const transparencyWrap = doc.createElement('div');
      transparencyWrap.className = 'additional-line-controls-panel__range';
      const transparencyInput = doc.createElement('input');
      transparencyInput.type = 'range';
      transparencyInput.min = '0';
      transparencyInput.max = '100';
      transparencyInput.step = '1';
      transparencyInput.className = 'additional-line-controls-panel__transparency-input';
      const transparencyValue = doc.createElement('span');
      transparencyValue.className = 'additional-line-controls-panel__range-value';
      const resolveTransparencyPercent = () => {
        const raw = typeof transparencyCfg.get === 'function' ? transparencyCfg.get(getContext()) : 0;
        const numeric = Number(raw);
        if(!Number.isFinite(numeric)){
          return 0;
        }
        const scale = typeof transparencyCfg.scale === 'string' ? transparencyCfg.scale.trim().toLowerCase() : '';
        const asPercent = scale === 'percent' || (scale !== 'fraction' && numeric > 1);
        return asPercent
          ? Math.min(100, Math.max(0, numeric))
          : (Math.min(1, Math.max(0, numeric)) * 100);
      };
      const quantizeTransparencyPercent = value => {
        const bounded = Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : 0;
        let display = Math.round(bounded);
        if(display === 0 && bounded > 0){
          display = 1;
        }else if(display === 100 && bounded < 100){
          display = 99;
        }
        return display;
      };
      syncTransparency = () => {
        const display = quantizeTransparencyPercent(resolveTransparencyPercent());
        transparencyInput.value = String(display);
        transparencyValue.textContent = `${display}%`;
      };
      syncTransparency();
      transparencyInput.addEventListener('input', () => {
        const pct = Number(transparencyInput.value);
        const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
        const scale = typeof transparencyCfg.scale === 'string' ? transparencyCfg.scale.trim().toLowerCase() : '';
        const outgoing = scale === 'percent' ? bounded : (bounded / 100);
        if(typeof transparencyCfg.onChange === 'function'){
          transparencyCfg.onChange(outgoing, getContext());
        }
        const display = quantizeTransparencyPercent(bounded);
        transparencyValue.textContent = `${display}%`;
      });
      transparencyWrap.appendChild(transparencyInput);
      transparencyWrap.appendChild(transparencyValue);
      transparencyField.appendChild(transparencyLabel);
      transparencyField.appendChild(transparencyWrap);
      wrap.appendChild(transparencyField);
    }

    scopeSelect.addEventListener('change', () => {
      if(typeof scopeCfg.onChange === 'function'){
        scopeCfg.onChange(scopeSelect.value, getContext());
      }
      if(sizeEnabled){
        currentSize = clampNumeric(typeof sizeCfg.get === 'function' ? sizeCfg.get(getContext()) : currentSize, 0, currentSize);
      }
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

    panel.appendChild(wrap);
    host.appendChild(panel);
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

    return { host, panel, wrap, scopeSelect };
  };
})(window);
