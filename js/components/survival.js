(function(global){
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const survival = Components.survival = Components.survival || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      console.debug('Debug: survival component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesState = { text: '', open: false, control: null };
  const exportFontStyles = scopeId => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId)
    : null;
  const importFontStyles = (scopeId, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true });
    }
  };
  const additionalLineControls = Shared.additionalLineControls = Shared.additionalLineControls || {};
  if((typeof additionalLineControls.show !== 'function' || typeof additionalLineControls.registerAdditionalLineElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/additionalLineControls.js');
    }catch(err){
      console.debug('Debug: survival component additionalLineControls helper require failed', { message: err?.message || String(err) });
    }
  }

  function sanitizeSurvivalLinePattern(value){
    const patternRaw = String(value || 'solid').toLowerCase();
    return (patternRaw === 'dashed' || patternRaw === 'dotted' || patternRaw === 'solid') ? patternRaw : 'solid';
  }

  function survivalPatternToDasharray(pattern){
    const normalized = sanitizeSurvivalLinePattern(pattern);
    if(normalized === 'dashed'){ return '6 3'; }
    if(normalized === 'dotted'){ return '2 3'; }
    return '';
  }

  function inferSurvivalPatternFromElement(el){
    const dash = String(el?.getAttribute?.('stroke-dasharray') || '').trim();
    if(!dash){ return 'solid'; }
    const compact = dash.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if(compact === '6 3' || compact === '4 4'){ return 'dashed'; }
    return 'dotted';
  }

  function applySurvivalPatternToElement(el, pattern){
    if(!el || !el.setAttribute){ return; }
    const dash = survivalPatternToDasharray(pattern);
    if(dash){
      el.setAttribute('stroke-dasharray', dash);
    }else{
      el.removeAttribute('stroke-dasharray');
    }
  }

  function showSurvivalStrokeFormatControls(target){
    if(target && additionalLineControls && typeof additionalLineControls.show === 'function'){
      let seriesKey = target.getAttribute('data-group') || null;
      const knownSeriesKeys = () => {
        const keys = new Set();
        const addKey = value => {
          const normalized = String(value == null ? '' : value).trim();
          if(normalized){
            keys.add(normalized);
          }
        };
        addKey(seriesKey);
        Object.keys(state.labelColors || {}).forEach(addKey);
        Object.keys(state.labelStrokeWidth || {}).forEach(addKey);
        Object.keys(state.labelOpacity || {}).forEach(addKey);
        Object.keys(state.labelLinePattern || {}).forEach(addKey);
        const doc = global.document;
        const svg = doc ? doc.getElementById('survivalSvg') : null;
        if(svg && svg.querySelectorAll){
          svg.querySelectorAll('path[data-group]').forEach(node => addKey(node.getAttribute('data-group')));
        }
        return Array.from(keys);
      };
      const orderedSeriesKeys = () => {
        const keys = knownSeriesKeys();
        if(!seriesKey){
          return keys;
        }
        return [seriesKey].concat(keys.filter(key => key !== seriesKey));
      };
      const scopeOptions = (() => {
        const options = [{ value: 'global', label: 'Global', disabled: false }];
        const keys = orderedSeriesKeys();
        if(keys.length){
          keys.forEach(name => {
            options.push({
              value: 'series',
              label: name,
              datasetLabel: name,
              scopeDataset: name,
              scopeKind: 'series',
              disabled: false
            });
          });
        }else{
          options.push({
            value: 'series',
            label: seriesKey || 'Series',
            datasetLabel: seriesKey || 'Series',
            scopeDataset: seriesKey || '',
            scopeKind: 'series',
            disabled: !seriesKey
          });
        }
        return options;
      })();
      const resolveTargets = scopeValue => {
        const doc = global.document;
        const svg = doc ? doc.getElementById('survivalSvg') : null;
        if(!svg){ return target ? [target] : []; }
        if(scopeValue === 'series' && seriesKey){
          return Array.from(svg.querySelectorAll(`path[data-group="${seriesKey.replace(/"/g, '\\"')}"]`));
        }
        return Array.from(svg.querySelectorAll('path[data-group]'));
      };
      additionalLineControls.show({
        scopeId: 'survival',
        target,
        panelTitle: 'Curve',
        controls: {
          showSummary: false,
          showScope: true,
          showPattern: true,
          scopeLabel: 'Scope',
          colorLabel: 'Line',
          thicknessLabel: 'Line width',
          patternLabel: 'Line pattern',
          transparencyLabel: 'Line transparency',
          thicknessMin: 0.2,
          thicknessStep: 0.1,
          thicknessMax: 20
        },
        scope: {
          label: 'Scope',
          options: scopeOptions,
          value: seriesKey ? 'series' : 'global',
          onChange(nextScope, ctx){
            if(nextScope === 'series'){
              const scopedSeriesKey = String(ctx?.scopeDataset || '').trim();
              if(scopedSeriesKey){
                seriesKey = scopedSeriesKey;
              }
            }
          }
        },
        getSummary: ctx => (ctx?.scope === 'series' && seriesKey) ? seriesKey : 'Global',
        getColor: ctx => {
          if(ctx?.scope === 'series' && seriesKey){
            return state.labelColors[seriesKey] || target.getAttribute('stroke') || '#377eb8';
          }
          const keys = Object.keys(state.labelColors || {});
          return (keys.length ? state.labelColors[keys[0]] : null) || target.getAttribute('stroke') || '#377eb8';
        },
        getThickness: ctx => {
          if(ctx?.scope === 'series' && seriesKey){
            const byState = Number(state.labelStrokeWidth?.[seriesKey]);
            if(Number.isFinite(byState)){ return byState; }
          }
          const byAttr = Number(target.getAttribute('stroke-width'));
          if(Number.isFinite(byAttr)){ return byAttr; }
          return 2;
        },
        getPattern: ctx => {
          if(ctx?.scope === 'series' && seriesKey){
            const persisted = state.labelLinePattern?.[seriesKey];
            if(persisted){ return sanitizeSurvivalLinePattern(persisted); }
          }
          return inferSurvivalPatternFromElement(target);
        },
        getTransparency: ctx => {
          let opacity = null;
          if(ctx?.scope === 'series' && seriesKey && state.labelOpacity && typeof state.labelOpacity[seriesKey] !== 'undefined'){
            opacity = Number(state.labelOpacity[seriesKey]);
          }else{
            const attrOpacity = Number(target.getAttribute('stroke-opacity'));
            opacity = Number.isFinite(attrOpacity) ? attrOpacity : 1;
          }
          const bounded = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
          return Math.round((1 - bounded) * 100);
        },
        onColorInput: (value, ctx) => {
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke', value); }catch(e){} });
          if(scopeValue === 'series' && seriesKey){
            state.labelColors[seriesKey] = value;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-group');
              if(key){ state.labelColors[key] = value; }
            });
          }
          state.scheduleDraw?.();
        },
        onColorChange: (value, ctx) => {
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke', value); }catch(e){} });
          if(scopeValue === 'series' && seriesKey){
            state.labelColors[seriesKey] = value;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-group');
              if(key){ state.labelColors[key] = value; }
            });
          }
          state.scheduleDraw?.();
        },
        onThicknessChange: (value, ctx) => {
          const next = Number(value);
          if(!Number.isFinite(next)){ return; }
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke-width', String(next)); }catch(e){} });
          if(scopeValue === 'series' && seriesKey){
            state.labelStrokeWidth[seriesKey] = next;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-group');
              if(key){ state.labelStrokeWidth[key] = next; }
            });
          }
          state.scheduleDraw?.();
        },
        onPatternChange: (value, ctx) => {
          const pattern = sanitizeSurvivalLinePattern(value);
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => applySurvivalPatternToElement(node, pattern));
          if(scopeValue === 'series' && seriesKey){
            state.labelLinePattern[seriesKey] = pattern;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-group');
              if(key){ state.labelLinePattern[key] = pattern; }
            });
          }
          state.scheduleDraw?.();
        },
        onTransparencyChange: (value, ctx) => {
          const pct = Number(value);
          const bounded = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
          const opacity = 1 - (bounded / 100);
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke-opacity', String(opacity)); }catch(e){} });
          if(scopeValue === 'series' && seriesKey){
            state.labelOpacity[seriesKey] = opacity;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-group');
              if(key){ state.labelOpacity[key] = opacity; }
            });
          }
          state.scheduleDraw?.();
        }
      });
      return;
    }
    const doc = global.document;
    if(!doc) return;
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
    const anchor = doc.getElementById('survivalFontHost');
    if(!anchor) return;
    let toolbarHost = anchor.nextElementSibling && anchor.nextElementSibling.classList && anchor.nextElementSibling.classList.contains('font-toolbar-host')
      ? anchor.nextElementSibling
      : null;
    if(!toolbarHost){
      toolbarHost = doc.createElement('div');
      toolbarHost.className = 'font-toolbar-host';
      toolbarHost.dataset.fontToolbarScope = 'survival';
      toolbarHost.style.display = 'none';
      anchor.insertAdjacentElement('afterend', toolbarHost);
    }
    doc.querySelectorAll('.font-toolbar-host.font-toolbar-host--visible').forEach(h => { if(h !== toolbarHost){ h.classList.remove('font-toolbar-host--visible'); h.style.display = 'none'; } });
    toolbarHost.innerHTML = '';
    const wrap = doc.createElement('div'); wrap.className = 'workspace-toolbar__form workspace-toolbar__form--single survival-stroke-controls';
    const makeInput = (labelText, inputEl) => { const lbl = doc.createElement('label'); lbl.className='workspace-toolbar__input workspace-toolbar__input--compact'; const span = doc.createElement('span'); span.className='workspace-toolbar__input-label'; span.textContent = labelText; lbl.appendChild(span); lbl.appendChild(inputEl); return lbl; };

    let seriesKey = target.getAttribute('data-group') || null;
    const knownSeriesKeys = () => {
      const keys = new Set();
      const addKey = value => {
        const normalized = String(value == null ? '' : value).trim();
        if(normalized){
          keys.add(normalized);
        }
      };
      addKey(seriesKey);
      Object.keys(state.labelColors || {}).forEach(addKey);
      Object.keys(state.labelStrokeWidth || {}).forEach(addKey);
      Object.keys(state.labelOpacity || {}).forEach(addKey);
      Object.keys(state.labelLinePattern || {}).forEach(addKey);
      const svg = doc.getElementById('survivalSvg');
      if(svg && svg.querySelectorAll){
        svg.querySelectorAll('path[data-group]').forEach(node => addKey(node.getAttribute('data-group')));
      }
      return Array.from(keys);
    };
    const orderedSeriesKeys = () => {
      const keys = knownSeriesKeys();
      if(!seriesKey){
        return keys;
      }
      return [seriesKey].concat(keys.filter(key => key !== seriesKey));
    };
    const scopeField = doc.createElement('label'); scopeField.className='workspace-toolbar__input workspace-toolbar__input--compact workspace-toolbar__input--scope';
    const scopeLabel = doc.createElement('span'); scopeLabel.className='workspace-toolbar__input-label'; scopeLabel.textContent='Scope';
    const scopeSelect = doc.createElement('select'); scopeSelect.className='workspace-toolbar__select';
    const optGlobal = doc.createElement('option'); optGlobal.value='global'; optGlobal.textContent='Global'; scopeSelect.appendChild(optGlobal);
    const scopeSeriesKeys = orderedSeriesKeys();
    if(scopeSeriesKeys.length){
      scopeSeriesKeys.forEach(name => {
        const optSeries = doc.createElement('option');
        optSeries.value='series';
        optSeries.textContent=name;
        optSeries.dataset.scopeDataset = name;
        scopeSelect.appendChild(optSeries);
      });
    }else{
      const optSeries = doc.createElement('option');
      optSeries.value='series';
      optSeries.textContent=seriesKey || 'Series';
      optSeries.disabled = !seriesKey;
      if(seriesKey){ optSeries.dataset.scopeDataset = seriesKey; }
      scopeSelect.appendChild(optSeries);
    }
    scopeSelect.value = seriesKey ? 'series' : 'global';
    scopeSelect.addEventListener('change', () => {
      if(scopeSelect.value === 'series'){
        const selected = scopeSelect.selectedOptions && scopeSelect.selectedOptions.length ? scopeSelect.selectedOptions[0] : null;
        const scopedSeriesKey = String(selected?.dataset?.scopeDataset || '').trim();
        if(scopedSeriesKey){
          seriesKey = scopedSeriesKey;
        }
      }
    });
    scopeField.appendChild(scopeLabel); scopeField.appendChild(scopeSelect); wrap.appendChild(scopeField);

    const colorInput = doc.createElement('input'); colorInput.type='color'; try{ colorInput.value = target.getAttribute('stroke') || '#377eb8'; }catch(e){}
    colorInput.addEventListener('input', ()=>{
      const v = colorInput.value;
      if(scopeSelect.value==='series' && seriesKey){ state.labelColors[seriesKey] = v; }
      else { Object.keys(state.labelColors).forEach(k=>{ state.labelColors[k]=v; }); }
      // immediate reflect
      try{ target.setAttribute('stroke', v); }catch(e){}
      state.scheduleDraw?.();
    });
    if(typeof Shared.attachColorPickerNear === 'function'){
      try{ Shared.attachColorPickerNear(colorInput); }catch(e){}
    }
    wrap.appendChild(makeInput('Line', colorInput));

    // Transparency (alpha): slider indicates transparency (0 = opaque, 100 = fully transparent)
    const alphaInput = doc.createElement('input'); alphaInput.type='range'; alphaInput.min='0'; alphaInput.max='100'; alphaInput.step='1';
    const existingAlpha = Number(target.getAttribute('stroke-opacity'));
    const resolvedTransparencyPct = Number.isFinite(existingAlpha) ? Math.round((1 - existingAlpha) * 100) : 0;
    alphaInput.value = String(resolvedTransparencyPct);
    const alphaValue = doc.createElement('span'); alphaValue.className = 'workspace-toolbar__input-value'; alphaValue.textContent = `${alphaInput.value}%`;
    alphaInput.addEventListener('input', ()=>{
      const pct = Number(alphaInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const transparency = bounded / 100;
      const opacity = 1 - transparency;
      alphaValue.textContent = `${Math.round(bounded)}%`;
      try{ target.setAttribute('stroke-opacity', String(opacity)); }catch(e){}
      state.scheduleDraw?.();
    });
    const alphaWrap = doc.createElement('div'); alphaWrap.style.display='inline-flex'; alphaWrap.style.alignItems='center'; alphaWrap.appendChild(alphaInput); alphaWrap.appendChild(alphaValue);
    wrap.appendChild(makeInput('Transparency', alphaWrap));

    const widthInput = doc.createElement('input'); widthInput.type='number'; widthInput.min='0'; widthInput.step='0.5'; try{ widthInput.value = String(target.getAttribute('stroke-width') || 2); }catch(e){}
    widthInput.addEventListener('input', ()=>{
      const next = Number(widthInput.value);
      if(!Number.isFinite(next)) return;
      // update immediate element
      try{ target.setAttribute('stroke-width', String(next)); }catch(e){}
      state.scheduleDraw?.();
    });
    wrap.appendChild(makeInput('Thickness', widthInput));

    toolbarHost.appendChild(wrap); toolbarHost.style.display='block'; toolbarHost.classList.add('font-toolbar-host--visible');
    const dock = toolbarHost.closest('.workspace-toolbar__dock'); if(dock){ dock.classList.add('workspace-toolbar__dock--active'); }
    try{ if(toolbarHost.__survivalDocClickHandler){ document.removeEventListener('click', toolbarHost.__survivalDocClickHandler); toolbarHost.__survivalDocClickHandler=null; } const onDocClick = function(evt){ try{ const tgt=evt && evt.target?evt.target:null; if(!tgt) return; if(toolbarHost.contains(tgt)) return; if(tgt.closest && tgt.closest('.shared-color-picker')) return; toolbarHost.classList.remove('font-toolbar-host--visible'); toolbarHost.style.display='none'; try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){} const d = toolbarHost.closest('.workspace-toolbar__dock'); if(d) d.classList.remove('workspace-toolbar__dock--active'); document.removeEventListener('click', onDocClick); toolbarHost.__survivalDocClickHandler=null; }catch(err){ console.warn('survival.stroke format docClick error', err); } }; document.addEventListener('click', onDocClick); toolbarHost.__survivalDocClickHandler = onDocClick; }catch(err){ console.warn('attach doc click for survival stroke controls failed', err); }
  }
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  if((typeof gridControls.show !== 'function' || typeof gridControls.registerGraphElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/gridControls.js');
    }catch(err){
      console.debug('Debug: survival component gridControls helper require failed', { message: err?.message || String(err) });
    }
  }
  const formControls = Shared.formControls = Shared.formControls || {};
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  const survivalUndoManager = Shared.undoManager || null;

  survival.__installed = true;
  survival.ready = false;

  const DEFAULT_ROWS = 100;
  const SURVIVAL_DEFAULT_COLS = 7;
  let emptyPayloadTemplate = null;

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('survival cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate || typeof getPayload !== 'function'){
      return;
    }
    const snapshot = getPayload();
    if(snapshot){
      emptyPayloadTemplate = cloneSimple(snapshot);
    }
  }
  const BASE_COLUMN_COUNT = 4; // group, time, event, entry time
  const SURVIVAL_COL_HEADERS = [
    'Group',
    'Time',
    'Event (1=event,0=censored)',
    'Entry Time (optional)',
    'Covariate 1',
    'Covariate 2',
    'Covariate 3'
  ];

  function hasMeaningfulCellValue(value){
    if(value == null){
      return false;
    }
    if(typeof value === 'number'){
      return Number.isFinite(value);
    }
    if(typeof value === 'boolean'){
      return true;
    }
    return String(value).trim().length > 0;
  }

  function normalizeHeaderLabel(value, fallback){
    const str = value == null ? '' : String(value).trim();
    return str || fallback;
  }

  function columnHasData(data, columnIndex){
    if(!Array.isArray(data) || !data.length){
      return false;
    }
    for(let rowIndex = 0; rowIndex < data.length; rowIndex += 1){
      const row = data[rowIndex];
      if(Array.isArray(row) && hasMeaningfulCellValue(row[columnIndex])){
        return true;
      }
    }
    return false;
  }

  function detectTimeDependentSupport(data){
    if(!Array.isArray(data) || !data.length){
      return false;
    }
    for(let rowIndex = 0; rowIndex < data.length; rowIndex += 1){
      const row = data[rowIndex];
      if(!Array.isArray(row)){
        continue;
      }
      const entry = Number.parseFloat(row[3]);
      const time = Number.parseFloat(row[1]);
      if(Number.isFinite(entry) && Number.isFinite(time) && entry > 0 && entry < time){
        return true;
      }
    }
    return false;
  }

  function collectMeaningfulCovariateColumns(data, headerLookup, columnCount){
    const covariateColumns = [];
    const debugEnabled = typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    let skippedNoData = 0;
    let skippedBlank = 0;

    for(let col = BASE_COLUMN_COUNT; col < columnCount; col += 1){
      const rawHeader = Array.isArray(headerLookup) ? headerLookup[col] : '';
      let trimmedHeader = rawHeader == null ? '' : String(rawHeader).trim();

      const hasData = columnHasData(data, col);

      // Do NOT offer empty columns as covariates, even if the grid auto-generated a header like "Column 8".
      if(!hasData){
        skippedNoData += 1;
        continue;
      }

      // Treat auto-generated placeholders as blank so we show "Covariate N" instead of "Column 8".
      if(/^column\s+\d+$/i.test(trimmedHeader)){
        trimmedHeader = '';
      }

      if(!trimmedHeader){
        skippedBlank += 1;
      }

      covariateColumns.push({
        index: col,
        header: trimmedHeader || `Covariate ${covariateColumns.length + 1}`,
        key: `col${col}`,
        derivedHeader: !trimmedHeader
      });
    }

    if(debugEnabled){
      try{
        console.debug('Debug: survival covariate column scan', {
          baseColumnCount: BASE_COLUMN_COUNT,
          columnCount,
          covariateCount: covariateColumns.length,
          skippedNoData,
          unnamedCovariates: skippedBlank
        });
      }catch(_e){}
    }

    return covariateColumns;
  }
  function attachSurvivalSelectAutoSize(select, label){
    if(!select){ return; }
    if(typeof formControls.attachSelectAutoSize === 'function'){
      formControls.attachSelectAutoSize(select, label || 'survival');
      return;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'survival';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          console.debug('Debug: survival select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          console.debug('Debug: survival select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        console.debug('Debug: survival select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        console.debug('Debug: survival select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
    }
  }
  const COX_MAX_OBSERVATIONS = 20000;
  const palette = Shared.palette = Shared.palette || {};
  if(typeof palette.ensureDefaultScatterColors !== 'function' && typeof require === 'function'){
    try{
      require('../shared/palette.js');
    }catch(err){
      // ignore palette preload failures
    }
  }
  const DEFAULT_COLORS = typeof palette.ensureDefaultScatterColors === 'function'
    ? palette.ensureDefaultScatterColors()
    : (Array.isArray(palette.DEFAULT_SCATTER_COLORS) && palette.DEFAULT_SCATTER_COLORS.length
      ? palette.DEFAULT_SCATTER_COLORS
      : global.DEFAULT_SCATTER_COLORS);
  if(Array.isArray(DEFAULT_COLORS) && DEFAULT_COLORS.length){
    palette.DEFAULT_SCATTER_COLORS = DEFAULT_COLORS;
    global.DEFAULT_SCATTER_COLORS = DEFAULT_COLORS;
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('survival')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'survival', debugLabel: 'survival-viewport-fallback', ...options });
        return;
      }
      logDebug('ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  logDebug('graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const makeEditable = (el, onChange, options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if(typeof fn === 'function'){
      return fn(el, onChange, options);
    }
    console.warn('survival component makeEditable fallback missing');
    return undefined;
  };

  const DEFAULT_AXIS_COLOR = '#000000';
  const DEFAULT_GRID_COLOR = '#dddddd';
  const MIN_MINOR_TICK_SUBDIVISIONS = 1;
  const MAX_MINOR_TICK_SUBDIVISIONS = 9;
  const DEFAULT_MINOR_TICK_SUBDIVISIONS = Number.isFinite(chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS)
    ? chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS
    : 3;

  function clampMinorTickSubdivisions(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return DEFAULT_MINOR_TICK_SUBDIVISIONS;
    }
    const rounded = Math.round(numeric);
    return Math.max(MIN_MINOR_TICK_SUBDIVISIONS, Math.min(MAX_MINOR_TICK_SUBDIVISIONS, rounded));
  }

  function createDefaultAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS },
      y: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS }
    };
  }

  const state = {
    hot: null,
    scheduleDraw: null,
    labelColors: {},
    labelStrokeWidth: {},
    labelOpacity: {},
    labelLinePattern: {},
    groupOrder: [],
    minSvgWidth: 0,
    layout: null,
    fileHandle: null,
    fileName: 'survival.graph',
    titleText: 'Survival curve',
    lastSummary: null,
    lastStats: null,
    covariateSettings: {},
    covariateColumns: [],
    axisSettings: createDefaultAxisSettings(),
    gridStyle: null,
    labelPositions: { title: null, xLabel: null, yLabel: null, legend: null }
  };

  function recordSurvivalChange(label, previous, next, apply){
    if(!survivalUndoManager || typeof survivalUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    survivalUndoManager.recordStateChange({
      label,
      scope: 'survivalGraphPanel',
      from: previous,
      to: next,
      apply(value){
        apply(value);
        return true;
      }
    });
  }

  function ensureAxisSettings(){
    if(!state.axisSettings || typeof state.axisSettings !== 'object'){
      state.axisSettings = createDefaultAxisSettings();
    }
    if(!state.axisSettings.x || typeof state.axisSettings.x !== 'object'){
      state.axisSettings.x = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS };
    }
    if(!state.axisSettings.y || typeof state.axisSettings.y !== 'object'){
      state.axisSettings.y = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS };
    }
    if(typeof state.axisSettings.x.minorTicks !== 'boolean'){
      state.axisSettings.x.minorTicks = false;
    }
    if(typeof state.axisSettings.y.minorTicks !== 'boolean'){
      state.axisSettings.y.minorTicks = false;
    }
    state.axisSettings.x.minorTickSubdivisions = clampMinorTickSubdivisions(state.axisSettings.x.minorTickSubdivisions);
    state.axisSettings.y.minorTickSubdivisions = clampMinorTickSubdivisions(state.axisSettings.y.minorTickSubdivisions);
    const numericStroke = Number(state.axisSettings.strokeWidth);
    state.axisSettings.strokeWidth = Number.isFinite(numericStroke) && numericStroke > 0 ? numericStroke : 1;
    if(typeof state.axisSettings.color !== 'string' || !state.axisSettings.color.trim()){
      state.axisSettings.color = DEFAULT_AXIS_COLOR;
    }
    return state.axisSettings;
  }

  function createDefaultGridStyle(fallbackThickness){
    const thickness = Number.isFinite(Number(fallbackThickness)) && Number(fallbackThickness) >= 0
      ? Number(fallbackThickness)
      : 1;
    return {
      color: DEFAULT_GRID_COLOR,
      thickness,
      pattern: 'solid',
      transparency: 0
    };
  }

  function sanitizeGridStyle(style, fallbackThickness){
    const fallback = createDefaultGridStyle(fallbackThickness);
    if(gridControls && typeof gridControls.sanitizeStyle === 'function'){
      return gridControls.sanitizeStyle(style, fallback);
    }
    const source = style && typeof style === 'object' ? style : {};
    const color = typeof source.color === 'string' && source.color.trim() ? source.color : fallback.color;
    const thicknessRaw = Number(source.thickness);
    const thickness = Number.isFinite(thicknessRaw) && thicknessRaw >= 0 ? thicknessRaw : fallback.thickness;
    const patternRaw = String(source.pattern || fallback.pattern || 'solid').toLowerCase();
    const pattern = (patternRaw === 'dashed' || patternRaw === 'dotted' || patternRaw === 'solid') ? patternRaw : 'solid';
    const transparencyRaw = Number(source.transparency);
    const transparency = Number.isFinite(transparencyRaw) ? Math.max(0, Math.min(100, transparencyRaw)) : fallback.transparency;
    return { color, thickness, pattern, transparency };
  }

  function ensureGridStyle(fallbackThickness){
    state.gridStyle = sanitizeGridStyle(state.gridStyle, fallbackThickness);
    return state.gridStyle;
  }

  function getGridStyle(fallbackThickness){
    return sanitizeGridStyle(ensureGridStyle(fallbackThickness), fallbackThickness);
  }

  function setGridStyle(style, fallbackThickness){
    state.gridStyle = sanitizeGridStyle(style, fallbackThickness);
  }

  function getAxisTickInterval(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureAxisSettings();
    const raw = settings[axis]?.tickInterval;
    if(raw === null || raw === undefined || raw === ''){
      return null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function updateAxisTickInterval(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings[axis].tickInterval = null;
    } else {
      const numeric = Number(value);
      settings[axis].tickInterval = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }
    logDebug('axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    state.scheduleDraw?.();
  }

  function getAxisMinorTicksEnabled(axis){
    if(axis !== 'x' && axis !== 'y'){ return false; }
    const settings = ensureAxisSettings();
    return !!settings[axis]?.minorTicks;
  }

  function updateAxisMinorTicks(axis, enabled){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const nextValue = !!enabled;
    if(settings[axis].minorTicks === nextValue){
      return;
    }
    settings[axis].minorTicks = nextValue;
    logDebug('axis minor ticks updated',{ axis, enabled: nextValue });
    state.scheduleDraw?.();
  }

  function getAxisMinorTickSubdivisions(axis){
    if(axis !== 'x' && axis !== 'y'){ return DEFAULT_MINOR_TICK_SUBDIVISIONS; }
    const settings = ensureAxisSettings();
    return clampMinorTickSubdivisions(settings[axis]?.minorTickSubdivisions);
  }

  function updateAxisMinorTickSubdivisions(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const nextValue = clampMinorTickSubdivisions(value);
    if(settings[axis].minorTickSubdivisions === nextValue){
      return;
    }
    settings[axis].minorTickSubdivisions = nextValue;
    logDebug('axis minor tick subdivisions updated',{ axis, subdivisions: nextValue });
    state.scheduleDraw?.();
  }

  function getAxisStrokeWidthBase(){
    return ensureAxisSettings().strokeWidth;
  }

  function updateAxisStrokeWidth(value){
    const settings = ensureAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings.strokeWidth = 1;
    } else {
      const numeric = Number(value);
      settings.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    }
    logDebug('axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    state.scheduleDraw?.();
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    logDebug('axis color updated',{ color: settings.color });
    state.scheduleDraw?.();
  }

  function registerSurvivalGridControlTarget(target, options){
    if(!target || !gridControls || typeof gridControls.registerGraphElement !== 'function'){
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackThickness = Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : getAxisStrokeWidthBase();
    gridControls.registerGraphElement(target, {
      scopeId: 'survival',
      getVisible: () => !!refs.showGrid?.checked,
      onVisibleChange: value => {
        if(refs.showGrid){
          refs.showGrid.checked = !!value;
        }
        state.scheduleDraw?.();
      },
      getStyle: () => getGridStyle(fallbackThickness),
      onStyleChange: style => {
        setGridStyle(style, fallbackThickness);
        state.scheduleDraw?.();
      },
      defaults: createDefaultGridStyle(fallbackThickness)
    });
  }

  function applyAxisSettings(settings){
    const base = createDefaultAxisSettings();
    if(settings && typeof settings === 'object'){
      const strokeCandidate = Number(settings.strokeWidth ?? settings.axisThickness);
      if(Number.isFinite(strokeCandidate) && strokeCandidate > 0){
        base.strokeWidth = strokeCandidate;
      }
      if(typeof settings.color === 'string' && settings.color.trim()){
        base.color = settings.color;
      }
      const xInterval = settings.tickIntervalX ?? settings.xTickInterval ?? settings?.x?.tickInterval ?? null;
      const yInterval = settings.tickIntervalY ?? settings.yTickInterval ?? settings?.y?.tickInterval ?? null;
      base.x.tickInterval = xInterval === '' ? null : xInterval;
      base.y.tickInterval = yInterval === '' ? null : yInterval;
      base.x.minorTicks = !!(settings.minorTicksX ?? settings.x?.minorTicks ?? false);
      base.y.minorTicks = !!(settings.minorTicksY ?? settings.y?.minorTicks ?? false);
      const xMinorSubdiv = settings.minorTickSubdivisionsX ?? settings.minorSubdivisionsX ?? settings.x?.minorTickSubdivisions ?? settings.x?.minorSubdivisions ?? null;
      const yMinorSubdiv = settings.minorTickSubdivisionsY ?? settings.minorSubdivisionsY ?? settings.y?.minorTickSubdivisions ?? settings.y?.minorSubdivisions ?? null;
      base.x.minorTickSubdivisions = clampMinorTickSubdivisions(xMinorSubdiv);
      base.y.minorTickSubdivisions = clampMinorTickSubdivisions(yMinorSubdiv);
    }
    state.axisSettings = base;
    ensureAxisSettings();
    logDebug('axis settings applied',{ settings: state.axisSettings });
  }

  function buildManualTicks(min, max, interval){
    if(!Number.isFinite(interval) || interval <= 0){ return null; }
    if(!Number.isFinite(min) || !Number.isFinite(max)){ return null; }
    if(min === max){
      max = min + interval;
    }
    const graphMin = Math.floor(min / interval) * interval;
    const graphMax = Math.ceil(max / interval) * interval;
    const ticks = [];
    let current = graphMin;
    let guard = 0;
    while(current <= graphMax + interval * 0.25 && guard < 1000){
      ticks.push(Number.parseFloat(current.toPrecision(12)));
      current += interval;
      guard += 1;
    }
    if(!ticks.length){
      ticks.push(Number.parseFloat(graphMin.toPrecision(12)));
    }
    logDebug('manual ticks computed',{ interval, tickCount: ticks.length, min: graphMin, max: graphMax });
    return { min: graphMin, max: graphMax, ticks };
  }

  const refs = {};
  let survivalLegendControl = null;

  function ensureSurvivalLegendControlPlacement(){
    if(!survivalLegendControl || !refs.svgBox){
      return;
    }
    if(Shared.resizer && typeof Shared.resizer.ensureLegendControlPlacement === 'function'){
      Shared.resizer.ensureLegendControlPlacement({
        svgBox: refs.svgBox,
        control: survivalLegendControl,
        debugLabel: 'survival-legend'
      });
    }
  }

  let parseDebugCounter = 0;

  const survivalAdvisorState = {
    open: false,
    activated: false,
    answers: {},
    lastApplied: null,
    context: null
  };

  function $(selector){
    return document.querySelector(selector);
  }

  function logDebug(message, payload){
    try {
      console.debug(`Debug: survival ${message}`, payload || {});
    } catch (err) {
      // Avoid throwing inside logging helpers.
    }
  }

  function ensureElements(){
    refs.tablePanel = $('#survivalTablePanel');
    refs.graphPanel = $('#survivalGraphPanel');
    refs.panelResizer = $('#survivalPanelResizer');
    refs.svgBox = refs.graphPanel?.querySelector('.svgbox') || null;
    refs.configPanel = refs.graphPanel?.querySelector('.config-panel') || null;
    refs.plotDiv = $('#survivalPlot');
    refs.hotWrapper = $('#survivalHotWrapper');
    refs.hotContainer = $('#survivalHot');
    refs.statsSummary = $('#survivalStatsSummary');
    refs.statsLogRank = $('#survivalStatsLogRank');
    refs.statsHazardRatios = $('#survivalStatsHazardRatios');
    refs.statsCox = $('#survivalStatsCox');
    refs.labelColorsDiv = $('#survivalLabelColors');
    refs.labelColorsFieldset = $('#survivalLabelColorsFieldset');
    refs.showCI = $('#survivalShowCI');
    refs.showCensor = $('#survivalShowCensor');
    refs.showHazardRatios = $('#survivalShowHazardRatios');
    refs.fitCoxModel = $('#survivalFitCox');
    refs.covariateControls = $('#survivalCovariateControls');
    refs.covariateHint = $('#survivalCovariateHint');
    refs.showGrid = $('#survivalShowGrid');
    refs.showFrame = $('#survivalShowFrame');
    refs.timeMax = $('#survivalTimeMax');
    refs.xLabel = $('#survivalXLabel');
    refs.yLabel = $('#survivalYLabel');
    refs.fontSize = $('#survivalFontSize');
    refs.fontSizeVal = $('#survivalFontSizeVal');
    refs.showLegend = $('#survivalShowLegend');
    if(refs.showLegend){
      const legendHost = refs.showLegend.closest('label');
      if(legendHost){
        survivalLegendControl = legendHost;
        ensureSurvivalLegendControlPlacement();
      }
    }
    refs.loadExampleBtn = $('#survivalLoadExample');
    refs.importBtn = $('#survivalImport');
    refs.fileInput = $('#survivalFile');
    refs.openBtn = $('#openSurvivalGraph');
    refs.saveBtn = $('#saveSurvivalGraph');
    refs.saveAsBtn = $('#saveAsSurvival');
    refs.graphFileInput = $('#survivalGraphFile');
    refs.exportContainer = $('#survivalExportControls');
    return !!(refs.tablePanel && refs.graphPanel && refs.hotContainer && refs.plotDiv);
  }

  const markFontEditable = (node, role, key) => {
    if(!node){ return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'survival', role, key });
    } else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'survival';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    if(role && role.includes('Tick')){ return; }
    logDebug('font mark applied', payload);
  };

  function initHot(){
    const createSurvivalTable = (container) => {
      const baseData = Shared.createEmptyData(DEFAULT_ROWS, SURVIVAL_DEFAULT_COLS);
      logDebug('initHot table schema', { firstRowIsHeader: false, columns: SURVIVAL_DEFAULT_COLS, headers: SURVIVAL_COL_HEADERS });
      return Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: SURVIVAL_DEFAULT_COLS }, () => {
        if(state.scheduleDraw){
          logDebug('table scheduled redraw');
          state.scheduleDraw();
        }
      }, {
        debugLabel: 'survival',
        data: baseData,
        firstRowIsHeader: false,
        scheduleOnLoadData: true,
        hotOptions: {
          stretchH: 'all',
          contextMenu: true,
          colHeaders: SURVIVAL_COL_HEADERS.slice(),
          afterChange(changes, source){
            if(changes){
              logDebug('table afterChange', { count: changes.length, source });
            }
            if(source !== 'loadData'){
              refreshCovariateControls();
            }
          }
        }
      });
    };
    const ensureSurvivalHotForActiveTab = () => {
      const wrapper = $('#survivalHotWrapper');
      const baseContainer = refs.hotContainer || $('#survivalHot');
      if(!baseContainer || typeof Shared.hot?.ensureTableForTab !== 'function'){
        if(!state.hot && baseContainer){
          state.hot = createSurvivalTable(baseContainer);
        }
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'survival',
        tabId: Shared.hot.resolveActiveTabId?.() || 'survival-default',
        wrapper,
        container: baseContainer,
        createInstance: createSurvivalTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
        refs.hotContainer = entry.container || baseContainer;
      }
      return state.hot;
    };
    state.hot = ensureSurvivalHotForActiveTab();
    state.ensureHotForActiveTab = ensureSurvivalHotForActiveTab;
    logDebug('Grid initialized', { hasHot: !!state.hot });
    refreshCovariateControls();
  }

  function buildSurvivalAdvisorContext(summary, overrides){
    const safeSummary = summary && typeof summary === 'object' ? summary : {};
    const series = Array.isArray(safeSummary.series) ? safeSummary.series : [];
    const covariateColumns = Array.isArray(safeSummary.covariateColumns)
      ? safeSummary.covariateColumns
      : (Array.isArray(state.covariateColumns) ? state.covariateColumns : []);
    const totals = series.map(group => Number.isFinite(group.total) ? group.total : 0);
    const events = series.map(group => Number.isFinite(group.events) ? group.events : 0);
    const censored = series.map(group => Number.isFinite(group.censored) ? group.censored : 0);
    const totalParticipants = totals.reduce((acc, value) => acc + value, 0);
    const totalEvents = events.reduce((acc, value) => acc + value, 0);
    const zeroEventGroups = series.filter(group => (group.events || 0) === 0).map(group => group.name);
    const enabledCovariates = Object.entries(state.covariateSettings || {}).filter(([, cfg]) => cfg && cfg.enabled);
    const enabledBaseline = enabledCovariates.filter(([, cfg]) => (cfg.type || 'baseline') !== 'time').length;
    const enabledTime = enabledCovariates.filter(([, cfg]) => cfg.type === 'time').length;
    const context = {
      summary: safeSummary,
      groupCount: series.length,
      totals,
      events,
      censored,
      totalParticipants,
      totalEvents,
      zeroEventGroups,
      hasCensoring: censored.some(value => value > 0),
      medianReachedCount: series.filter(group => group?.km?.median != null).length,
      covariateCount: covariateColumns.length,
      enabledCovariateCount: enabledCovariates.length,
      enabledBaselineCovariates: enabledBaseline,
      enabledTimeCovariates: enabledTime,
      hazardRatiosEnabled: !!refs.showHazardRatios?.checked,
      coxEnabled: !!refs.fitCoxModel?.checked,
      coxAnalysisActive: !!refs.showHazardRatios?.checked || !!refs.fitCoxModel?.checked,
      hasLogRank: !!safeSummary?.logRank?.available,
      maxTime: Number.isFinite(safeSummary?.maxTime) ? safeSummary.maxTime : 0,
      supportsTimeDependent: !!safeSummary?.supportsTimeDependent,
      ...overrides
    };
    logDebug('advisor context built', {
      groupCount: context.groupCount,
      covariateCount: context.covariateCount,
      enabledCovariateCount: context.enabledCovariateCount,
      hazardRatiosEnabled: context.hazardRatiosEnabled,
      coxEnabled: context.coxEnabled,
      totalParticipants: context.totalParticipants
    });
    return context;
  }

  function ensureSurvivalAdvisorDefaults(context){
    if(!survivalAdvisorState.answers || typeof survivalAdvisorState.answers !== 'object'){
      survivalAdvisorState.answers = {};
    }
    const answers = survivalAdvisorState.answers;
    if(!answers.analysisFocus){
      answers.analysisFocus = context.groupCount >= 2 ? 'compare' : 'describe';
    }
    if(answers.analysisFocus === 'compare' && !answers.comparisonDetail){
      answers.comparisonDetail = context.groupCount >= 2 ? 'hazardRatios' : 'logRankOnly';
    }
    if(answers.analysisFocus === 'adjust' && !answers.covariateStrategy){
      if(context.supportsTimeDependent && context.enabledTimeCovariates > 0){
        answers.covariateStrategy = 'timeDependent';
      } else if(context.enabledBaselineCovariates > 0 || context.covariateCount > 0){
        answers.covariateStrategy = 'baseline';
      } else {
        answers.covariateStrategy = 'none';
      }
    }
    if(answers.covariateStrategy === 'timeDependent' && !context.supportsTimeDependent){
      answers.covariateStrategy = context.covariateCount > 0 ? 'baseline' : 'none';
    }
    return answers;
  }

  function buildSurvivalAdvisorQuestions(context){
    const answers = ensureSurvivalAdvisorDefaults(context);
    const questions = [
      {
        id: 'analysisFocus',
        prompt: 'What is your primary survival analysis goal?',
        help: 'Choose whether you want to describe a single curve, compare groups, or adjust for covariates.',
        options: [
          { value: 'describe', label: 'Describe Kaplan–Meier survival for the groups' },
          { value: 'compare', label: 'Compare survival between groups' },
          { value: 'adjust', label: 'Adjust for covariates with a Cox model' }
        ]
      }
    ];
    if(answers.analysisFocus === 'compare'){
      questions.push({
        id: 'comparisonDetail',
        prompt: 'How much detail do you need when comparing groups?',
        help: 'Pairwise hazard ratios complement the overall log-rank test.',
        options: [
          { value: 'logRankOnly', label: 'Use the overall log-rank test only' },
          { value: 'hazardRatios', label: 'Add pairwise hazard ratios between groups' }
        ]
      });
    }
    if(answers.analysisFocus === 'adjust'){
      const covariateOptions = [
        { value: 'baseline', label: 'Baseline predictors only' }
      ];
      if(context.supportsTimeDependent){
        covariateOptions.push({ value: 'timeDependent', label: 'Include time-dependent covariates' });
      }
      covariateOptions.push({ value: 'none', label: 'No covariates yet—fit the Cox model for groups only' });
      questions.push({
        id: 'covariateStrategy',
        prompt: 'How will you model covariates?',
        help: context.supportsTimeDependent
          ? 'Check covariate columns below to include them in the Cox model. Use time-dependent covariates only when Entry Time defines interval starts.'
          : 'Check covariate columns below to include them in the Cox model. Time-dependent covariates become available when Entry Time contains interval starts.',
        options: covariateOptions
      });
    }
    return questions;
  }

  function computeSurvivalAdvisorRecommendation(answers, context){
    const recommendation = {
      ready: false,
      message: '',
      summary: '',
      rationale: [],
      warnings: [],
      showHazardRatios: context.hazardRatiosEnabled,
      fitCoxModel: context.coxEnabled
    };
    if(context.groupCount === 0){
      recommendation.message = 'Enter at least one group with follow-up times to enable recommendations.';
      return recommendation;
    }
    if(!answers.analysisFocus ||
      (answers.analysisFocus === 'compare' && !answers.comparisonDetail) ||
      (answers.analysisFocus === 'adjust' && !answers.covariateStrategy)){
      recommendation.message = 'Answer the advisor questions to receive a recommendation.';
      return recommendation;
    }
    if(context.groupCount < 2 && answers.analysisFocus === 'compare'){
      recommendation.message = 'Provide at least two groups to compare survival.';
      return recommendation;
    }
    if(context.groupCount < 2 && answers.analysisFocus === 'adjust' && context.enabledCovariateCount === 0 && context.covariateCount === 0){
      recommendation.message = 'Provide at least two groups or add covariates before fitting a Cox model.';
      return recommendation;
    }
    switch(answers.analysisFocus){
      case 'describe':
        recommendation.showHazardRatios = false;
        recommendation.fitCoxModel = false;
        recommendation.summary = 'Focus on Kaplan–Meier curves with the log-rank test for overall differences.';
        recommendation.rationale.push('Disabling hazard ratios and Cox modeling keeps the emphasis on visual survival patterns.');
        if(context.groupCount >= 2 && !context.hasLogRank){
          recommendation.warnings.push('Provide more complete data to enable the log-rank comparison between groups.');
        }
        break;
      case 'compare':
        if(answers.comparisonDetail === 'hazardRatios'){
          recommendation.showHazardRatios = true;
          recommendation.fitCoxModel = false;
          recommendation.summary = 'Use the log-rank test and display pairwise hazard ratios between groups.';
          recommendation.rationale.push('Hazard ratios quantify the magnitude of survival differences between every pair of groups.');
        } else {
          recommendation.showHazardRatios = false;
          recommendation.fitCoxModel = false;
          recommendation.summary = 'Rely on the log-rank test without the hazard ratio table.';
          recommendation.rationale.push('The log-rank test compares survival curves without estimating pairwise hazard ratios.');
        }
        if(context.zeroEventGroups.length){
          recommendation.warnings.push(`Group${context.zeroEventGroups.length > 1 ? 's' : ''} ${context.zeroEventGroups.join(', ')} ha${context.zeroEventGroups.length > 1 ? 've' : 's'} zero events; hazard ratios may be unstable.`);
        }
        if(context.totalEvents < context.groupCount){
          recommendation.warnings.push('Few observed events relative to group count can weaken both log-rank and hazard ratio estimates.');
        }
        break;
      case 'adjust':
        recommendation.fitCoxModel = true;
        recommendation.showHazardRatios = context.groupCount >= 2 && answers.covariateStrategy !== 'none';
        if(answers.covariateStrategy === 'timeDependent'){
          recommendation.summary = 'Fit a Cox model with time-dependent covariates and report adjusted hazard ratios.';
          recommendation.rationale.push('Cox regression handles varying predictors over follow-up when covariates are marked time-dependent.');
          if(context.enabledTimeCovariates === 0){
            recommendation.warnings.push('Mark at least one covariate as time-dependent in the controls to follow this plan.');
          }
        } else if(answers.covariateStrategy === 'baseline'){
          recommendation.summary = 'Fit a Cox model with baseline covariates and show adjusted hazard ratios.';
          recommendation.rationale.push('Baseline Cox regression adjusts survival comparisons for fixed covariates.');
          if(context.enabledBaselineCovariates === 0 && context.covariateCount > 0){
            recommendation.warnings.push('Enable at least one baseline covariate in the selection panel to include it in the Cox model.');
          }
        } else {
          recommendation.summary = 'Fit a Cox model using group indicators only; omit additional covariates.';
          recommendation.rationale.push('A group-only Cox model yields adjusted hazard ratios when no covariates are selected.');
          recommendation.showHazardRatios = context.groupCount >= 2;
        }
        if(context.enabledCovariateCount === 0 && context.covariateCount === 0){
          recommendation.warnings.push('Add extra columns for covariates if you plan to adjust beyond group membership.');
        }
        if(context.totalEvents < 10){
          recommendation.warnings.push('Cox regression is unreliable with very few events; confirm that event counts support the model.');
        }
        break;
      default:
        recommendation.message = 'Select an analysis goal to generate a recommendation.';
        return recommendation;
    }
    recommendation.ready = true;
    return recommendation;
  }

  function renderSurvivalStatsAdvisor(summary, providedContext){
    const container = document.getElementById('survivalStatsAdvisor');
    if(!container){
      return;
    }
    const context = providedContext || buildSurvivalAdvisorContext(summary || state.lastSummary || {});
    survivalAdvisorState.context = context;
    const answers = ensureSurvivalAdvisorDefaults(context);
    const recommendation = computeSurvivalAdvisorRecommendation(answers, context);
    const sharedAdvisorUi = Shared.statsUi;
    if(sharedAdvisorUi && typeof sharedAdvisorUi.renderAdvisorPanel === 'function'){
      sharedAdvisorUi.renderAdvisorPanel({
        container,
        state: survivalAdvisorState,
        title: 'Statistics advisor',
        inactiveMessage: 'Press the "Guide me" button to view advisor recommendations.',
        recommendation,
        answers,
        questions: survivalAdvisorState.open ? buildSurvivalAdvisorQuestions(context) : [],
        namePrefix: 'survival-advisor',
        onToggle: (nextOpen)=>{
          survivalAdvisorState.open = !!nextOpen;
          if(survivalAdvisorState.open && !survivalAdvisorState.activated){
            survivalAdvisorState.activated = true;
            logDebug('stats advisor activated');
          }
          logDebug('stats advisor toggled', { open: survivalAdvisorState.open });
          renderSurvivalStatsAdvisor(null, survivalAdvisorState.context);
        },
        onAnswerChange: (question, value)=>{
          answers[question.id] = value;
          survivalAdvisorState.answers = answers;
          logDebug('stats advisor answer change', { question: question.id, value });
          renderSurvivalStatsAdvisor(null, survivalAdvisorState.context);
        },
        onApply: ()=>{
          if(!recommendation.ready){
            return;
          }
          if(refs.showHazardRatios){
            refs.showHazardRatios.checked = !!recommendation.showHazardRatios;
          }
          if(refs.fitCoxModel){
            refs.fitCoxModel.checked = !!recommendation.fitCoxModel;
          }
          survivalAdvisorState.lastApplied = { ...recommendation, answers: { ...answers } };
          logDebug('stats advisor recommendation applied', {
            showHazardRatios: recommendation.showHazardRatios,
            fitCoxModel: recommendation.fitCoxModel,
            answers: { ...answers }
          });
          if(typeof state.scheduleDraw === 'function'){
            state.scheduleDraw();
          }
          renderSurvivalStatsAdvisor(null, survivalAdvisorState.context);
        },
        onReset: ()=>{
          survivalAdvisorState.answers = {};
          logDebug('stats advisor answers reset');
          renderSurvivalStatsAdvisor(null, survivalAdvisorState.context);
        }
      });
      return;
    }
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'stats-advisor';
    wrapper.dataset.open = survivalAdvisorState.open ? '1' : '0';
    const header = document.createElement('div');
    header.className = 'stats-advisor__header';
    const title = document.createElement('strong');
    title.textContent = 'Test advisor';
    header.appendChild(title);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'stats-advisor__toggle';
    toggle.textContent = survivalAdvisorState.open ? 'Hide advisor' : 'Guide me';
    toggle.addEventListener('click', () => {
      survivalAdvisorState.open = !survivalAdvisorState.open;
      if(survivalAdvisorState.open && !survivalAdvisorState.activated){
        survivalAdvisorState.activated = true;
        logDebug('stats advisor activated');
      }
      logDebug('stats advisor toggled', { open: survivalAdvisorState.open });
      renderSurvivalStatsAdvisor(null, survivalAdvisorState.context);
    });
    header.appendChild(toggle);
    wrapper.appendChild(header);
    const summaryBlock = document.createElement('div');
    summaryBlock.className = 'stats-advisor__summary';
    if(!survivalAdvisorState.activated){
      const message = document.createElement('div');
      message.textContent = 'Press the "Guide me" button to view advisor recommendations.';
      summaryBlock.appendChild(message);
    }else if(recommendation.ready){
      const summaryLine = document.createElement('div');
      summaryLine.className = 'stats-advisor__summary-line';
      summaryLine.textContent = `Recommendation: ${recommendation.summary}`;
      summaryBlock.appendChild(summaryLine);
      if(Array.isArray(recommendation.rationale) && recommendation.rationale.length){
        const rationaleList = document.createElement('ul');
        rationaleList.className = 'stats-advisor__rationale';
        recommendation.rationale.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          rationaleList.appendChild(li);
        });
        summaryBlock.appendChild(rationaleList);
      }
      if(Array.isArray(recommendation.warnings) && recommendation.warnings.length){
        const warnTitle = document.createElement('div');
        warnTitle.className = 'stats-advisor__warnings-title';
        warnTitle.textContent = 'Cautions:';
        summaryBlock.appendChild(warnTitle);
        const warnList = document.createElement('ul');
        warnList.className = 'stats-advisor__warnings';
        recommendation.warnings.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          warnList.appendChild(li);
        });
        summaryBlock.appendChild(warnList);
      }
    } else {
      const message = document.createElement('div');
      message.textContent = recommendation.message || 'Answer the advisor questions to receive a recommendation.';
      summaryBlock.appendChild(message);
    }
    wrapper.appendChild(summaryBlock);
    if(survivalAdvisorState.open){
      const questionsWrap = document.createElement('div');
      questionsWrap.className = 'stats-advisor__questions';
      const questions = buildSurvivalAdvisorQuestions(context);
      questions.forEach(question => {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'stats-advisor__question';
        const legend = document.createElement('legend');
        legend.textContent = question.prompt;
        fieldset.appendChild(legend);
        if(question.help){
          const hint = document.createElement('p');
          hint.className = 'stats-advisor__hint';
          hint.textContent = question.help;
          fieldset.appendChild(hint);
        }
        (question.options || []).forEach(option => {
          const label = document.createElement('label');
          label.className = 'stats-advisor__option';
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = `survival-advisor-${question.id}`;
          input.value = option.value;
          input.checked = answers[question.id] === option.value;
          input.addEventListener('change', () => {
            answers[question.id] = option.value;
            survivalAdvisorState.answers = answers;
            logDebug('stats advisor answer change', { question: question.id, value: option.value });
            renderSurvivalStatsAdvisor(null, survivalAdvisorState.context);
          });
          const span = document.createElement('span');
          span.textContent = option.label;
          label.appendChild(input);
          label.appendChild(span);
          fieldset.appendChild(label);
        });
        questionsWrap.appendChild(fieldset);
      });
      wrapper.appendChild(questionsWrap);
      const actions = document.createElement('div');
      actions.className = 'stats-advisor__actions';
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.textContent = 'Apply recommendation';
      applyBtn.disabled = !recommendation.ready;
      applyBtn.addEventListener('click', () => {
        if(!recommendation.ready){
          return;
        }
        if(refs.showHazardRatios){
          refs.showHazardRatios.checked = !!recommendation.showHazardRatios;
        }
        if(refs.fitCoxModel){
          refs.fitCoxModel.checked = !!recommendation.fitCoxModel;
        }
        survivalAdvisorState.lastApplied = { ...recommendation, answers: { ...answers } };
        logDebug('stats advisor recommendation applied', {
          showHazardRatios: recommendation.showHazardRatios,
          fitCoxModel: recommendation.fitCoxModel,
          answers: { ...answers }
        });
        if(typeof state.scheduleDraw === 'function'){
          state.scheduleDraw();
        }
        renderSurvivalStatsAdvisor(null, survivalAdvisorState.context);
      });
      actions.appendChild(applyBtn);
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'stats-advisor__reset';
      resetBtn.textContent = 'Reset answers';
      resetBtn.addEventListener('click', () => {
        survivalAdvisorState.answers = {};
        logDebug('stats advisor answers reset');
        renderSurvivalStatsAdvisor(null, survivalAdvisorState.context);
      });
      actions.appendChild(resetBtn);
      wrapper.appendChild(actions);
    }
    container.appendChild(wrapper);
  }

  function updateGroupColorPickers(groupNames){
    const activeNames = Array.isArray(groupNames) ? groupNames : [];
    if(refs.labelColorsDiv){
      refs.labelColorsDiv.innerHTML = '';
    }
    Object.keys(state.labelColors).forEach(name => {
      if(!activeNames.includes(name)){
        delete state.labelColors[name];
      }
    });
    if(!refs.labelColorsDiv || !refs.labelColorsFieldset){
      activeNames.forEach((name, index) => {
        if(!state.labelColors[name]){
          state.labelColors[name] = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
        }
      });
      logDebug('group colors synced without control panel', { count: activeNames.length });
      return;
    }
    activeNames.forEach((name, index) => {
      if(!state.labelColors[name]){
        state.labelColors[name] = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      }
      const wrapper = document.createElement('label');
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      wrapper.style.marginRight = '8px';
      wrapper.textContent = `${name}`;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = state.labelColors[name];
      if(typeof global.attachColorPickerNear === 'function'){
        global.attachColorPickerNear(input);
      }
      input.addEventListener('input', ev => {
        applySurvivalColorValue(name, ev.target.value, { source: 'control' });
      });
      wrapper.appendChild(input);
      refs.labelColorsDiv.appendChild(wrapper);
    });
    refs.labelColorsFieldset.style.display = activeNames.length ? '' : 'none';
    logDebug('group color pickers updated', { count: activeNames.length });
  }

  function applySurvivalColorValue(groupName, value, options = {}){
    if(!groupName){
      return false;
    }
    if(!state.labelColors || typeof state.labelColors !== 'object'){
      state.labelColors = {};
    }
    const nextValue = value != null ? String(value) : '';
    const previousValue = state.labelColors[groupName] || '';
    const force = options.force === true;
    if(nextValue){
      if(!force && previousValue === nextValue){
        return false;
      }
      state.labelColors[groupName] = nextValue;
    } else {
      if(!force && !previousValue){
        return false;
      }
      delete state.labelColors[groupName];
    }
    logDebug('group color changed', {
      group: groupName,
      color: nextValue || null,
      source: options.source || 'apply',
      forced: force
    });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
    return true;
  }

  function handleSurvivalLegendSwatchClick(payload){
    const entry = payload?.entry;
    const swatch = payload?.swatch;
    const event = payload?.event;
    if(!entry || !swatch || typeof Shared.openColorPicker !== 'function'){
      return;
    }
    event?.stopPropagation?.();
    const labelKey = entry.key || entry.label || entry.raw?.name || '';
    if(!labelKey){
      return;
    }
    const currentColor = state.labelColors[labelKey] || entry.fill || entry.color || '#888888';
    let previousColor = currentColor;
    Shared.openColorPicker({
      anchor: swatch,
      color: currentColor,
      onInput(value){
        applySurvivalColorValue(labelKey, value, { source: 'legend' });
      },
      onChange(value){
        const normalized = value != null ? String(value) : '';
        if(normalized === previousColor){
          return;
        }
        applySurvivalColorValue(labelKey, normalized, { source: 'legend' });
        recordSurvivalChange(`survival:legend-color:${labelKey}`, previousColor, normalized, next => {
          applySurvivalColorValue(labelKey, next, { source: 'undo', force: true });
        });
        previousColor = normalized;
      }
    });
  }

  function drawSurvivalLegend(svg, legendLayout, defaults = {}, svgDimensions = {}){
    const renderer = legendLayout?.renderer;
    if(!svg || !renderer || !renderer.entries.length){
      return null;
    }
    const stored = state.labelPositions || {};
    const storedLegend = stored.legend || {};
    
    // Get SVG dimensions for relative positioning
    const svgWidth = svgDimensions.width || (svg.getAttribute('width') ? parseFloat(svg.getAttribute('width')) : 500);
    const svgHeight = svgDimensions.height || (svg.getAttribute('height') ? parseFloat(svg.getAttribute('height')) : 400);
    
    let resolvedX = Number.isFinite(defaults.x) ? Number(defaults.x) : 0;
    let resolvedY = Number.isFinite(defaults.y) ? Number(defaults.y) : 0;
    
    // Convert relative positions to absolute if needed
    if (storedLegend) {
      if (storedLegend.relX !== undefined && storedLegend.relY !== undefined) {
        // Use relative positioning
        resolvedX = storedLegend.relX * svgWidth;
        resolvedY = storedLegend.relY * svgHeight;
      } else if (storedLegend.x !== undefined && storedLegend.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        resolvedX = storedLegend.x;
        resolvedY = storedLegend.y;
      }
    }
    
    const legendGroup = renderer.draw(svg, { x: resolvedX, y: resolvedY });
    if(!legendGroup){
      return null;
    }
    const textNodes = legendGroup.querySelectorAll('text');
    textNodes.forEach((node, index) => {
      markFontEditable(node, 'legend', `legend-${index}`);
    });
    if(typeof Shared.enableLegendDrag === 'function'){
      Shared.enableLegendDrag(legendGroup, svg, {
        undoLabel: 'survival-legend',
        onDragEnd: pos => {
          state.labelPositions = state.labelPositions || { title: null, xLabel: null, yLabel: null, legend: null };
          // Store both absolute and relative positions
          const relX = pos.x / svgWidth;
          const relY = pos.y / svgHeight;
          state.labelPositions.legend = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
          logDebug('legend position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    return legendGroup;
  }

  function refreshCovariateControls(){
    if(!refs.covariateControls){
      return;
    }
    const columns = Array.isArray(state.covariateColumns) ? state.covariateColumns : [];
    const availableIndices = columns.map(col => col.index);
    Object.keys(state.covariateSettings).forEach(key => {
      if(!availableIndices.includes(Number(key))){
        delete state.covariateSettings[key];
      }
    });
    refs.covariateControls.innerHTML = '';

    const coxAnalysisActive = !!refs.showHazardRatios?.checked || !!refs.fitCoxModel?.checked;
    const supportsTimeDependent = detectTimeDependentSupport(state.hot?.getData?.() || []);

    if(refs.covariateHint){
      refs.covariateHint.style.display = 'none';
    }

    const hint = document.createElement('div');
    hint.className = 'survival-covariate-hint-text';
    hint.style.fontSize = '12px';
    hint.style.color = '#4a5568';
    hint.style.marginBottom = '8px';

    if(!columns.length){
      hint.textContent = 'Add named or populated columns after Entry Time to make them available as Cox covariates.';
      refs.covariateControls.appendChild(hint);
      logDebug('covariate controls hidden - no meaningful covariate columns');
      return;
    }

    if(!coxAnalysisActive){
      hint.textContent = 'Enable "Fit Cox Model" or "Show Hazard Ratios" to include covariates in model-based survival analyses.';
    } else if(supportsTimeDependent){
      hint.textContent = 'Check a column to include it in the Cox model. Unchecked covariates are ignored. Time-dependent covariates require Entry Time to mark interval starts.';
    } else {
      hint.textContent = 'Check a column to include it in the Cox model. Unchecked covariates are ignored. Time-dependent covariates become available when Entry Time contains interval starts.';
    }
    refs.covariateControls.appendChild(hint);

    columns.forEach((col) => {
      const key = String(col.index);
      if(!state.covariateSettings[key]){
        state.covariateSettings[key] = { enabled: false, type: 'baseline' };
      }
      const settings = state.covariateSettings[key];
      if(settings.type === 'time' && !supportsTimeDependent){
        settings.type = 'baseline';
      }

      const row = document.createElement('div');
      row.className = 'survival-covariate-option';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.flexWrap = 'wrap';
      row.style.marginBottom = '6px';
      row.style.opacity = coxAnalysisActive ? '1' : '0.65';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `survivalCovariateToggle-${col.index}`;
      checkbox.dataset.columnIndex = key;
      checkbox.checked = !!settings.enabled;
      checkbox.disabled = !coxAnalysisActive;
      checkbox.title = coxAnalysisActive
        ? `Include ${col.header} in the Cox model`
        : 'Enable Cox modelling or hazard ratios to include covariates';

      const label = document.createElement('label');
      label.setAttribute('for', checkbox.id);
      label.textContent = col.header;
      label.style.fontWeight = '500';
      label.style.minWidth = '140px';
      label.title = col.derivedHeader
        ? `${col.header} (generated because the column header was blank)`
        : col.header;

      const select = document.createElement('select');
      select.dataset.columnIndex = key;
      select.style.minWidth = '140px';
      const optionBaseline = document.createElement('option');
      optionBaseline.value = 'baseline';
      optionBaseline.textContent = 'Baseline';
      const optionTime = document.createElement('option');
      optionTime.value = 'time';
      optionTime.textContent = 'Time-dependent';
      optionTime.disabled = !supportsTimeDependent;
      select.appendChild(optionBaseline);
      select.appendChild(optionTime);
      select.value = settings.type === 'time' && supportsTimeDependent ? 'time' : 'baseline';
      select.disabled = !coxAnalysisActive || !checkbox.checked;
      select.title = !coxAnalysisActive
        ? 'Enable Cox modelling or hazard ratios first'
        : (!checkbox.checked
          ? 'Check the covariate to include it in the model'
          : (supportsTimeDependent
            ? 'Choose whether the covariate is fixed at baseline or varies across intervals'
            : 'Time-dependent covariates require interval starts in Entry Time'));
      attachSurvivalSelectAutoSize(select, 'survival-covariate');

      checkbox.addEventListener('change', ev => {
        const idx = ev.target.dataset.columnIndex;
        state.covariateSettings[idx] = state.covariateSettings[idx] || { type: select.value };
        state.covariateSettings[idx].enabled = ev.target.checked;
        select.disabled = !coxAnalysisActive || !ev.target.checked;
        logDebug('covariate toggle changed', { columnIndex: Number(idx), enabled: ev.target.checked });
        if(state.scheduleDraw){
          state.scheduleDraw();
        }
      });

      select.addEventListener('change', ev => {
        const idx = ev.target.dataset.columnIndex;
        state.covariateSettings[idx] = state.covariateSettings[idx] || { enabled: checkbox.checked };
        state.covariateSettings[idx].type = ev.target.value === 'time' && supportsTimeDependent ? 'time' : 'baseline';
        logDebug('covariate type changed', { columnIndex: Number(idx), type: state.covariateSettings[idx].type });
        if(state.scheduleDraw){
          state.scheduleDraw();
        }
      });

      row.appendChild(checkbox);
      row.appendChild(label);
      row.appendChild(select);
      refs.covariateControls.appendChild(row);
    });
    logDebug('covariate controls refreshed', {
      available: columns.map(col => ({ index: col.index, header: col.header })),
      enabled: Object.keys(state.covariateSettings).filter(key => state.covariateSettings[key]?.enabled),
      coxAnalysisActive,
      supportsTimeDependent
    });
  }

  function computeKaplanMeier(records){
    const sorted = records.slice().sort((a, b) => {
      if(a.time === b.time){
        if(a.event === b.event) return 0;
        return a.event ? -1 : 1;
      }
      return a.time - b.time;
    });
    const stepPoints = [{ time: 0, survival: 1 }];
    const lowerSteps = [{ time: 0, value: 1 }];
    const upperSteps = [{ time: 0, value: 1 }];
    const censorPoints = [];
    const z = 1.96;
    let atRisk = sorted.length;
    let survivalProb = 1;
    let cumulativeVar = 0;
    let median = null;
    let lastTime = 0;
    let lastLower = 1;
    let lastUpper = 1;

    for(let i = 0; i < sorted.length; ){
      const currentTime = sorted[i].time;
      const group = [];
      while(i < sorted.length && Math.abs(sorted[i].time - currentTime) < 1e-9){
        group.push(sorted[i]);
        i += 1;
      }
      let events = 0;
      let censored = 0;
      group.forEach(item => {
        if(item.event){ events += 1; } else { censored += 1; }
      });

      stepPoints.push({ time: currentTime, survival: survivalProb });
      lowerSteps.push({ time: currentTime, value: lastLower });
      upperSteps.push({ time: currentTime, value: lastUpper });

      if(events > 0 && atRisk > 0){
        const hazard = events / atRisk;
        survivalProb = survivalProb * (1 - hazard);
        if(atRisk - events > 0){
          cumulativeVar += events / (atRisk * (atRisk - events));
        }
        const se = survivalProb * Math.sqrt(Math.max(cumulativeVar, 0));
        lastLower = Math.max(0, survivalProb - z * se);
        lastUpper = Math.min(1, survivalProb + z * se);
        stepPoints.push({ time: currentTime, survival: survivalProb });
        lowerSteps.push({ time: currentTime, value: lastLower });
        upperSteps.push({ time: currentTime, value: lastUpper });
        if(median === null && survivalProb <= 0.5){
          median = currentTime;
        }
      }

      if(censored > 0){
        for(let c = 0; c < censored; c += 1){
          censorPoints.push({ time: currentTime, survival: survivalProb });
        }
      }

      atRisk -= (events + censored);
      if(atRisk < 0){
        atRisk = 0;
      }
      lastTime = currentTime;
    }

    return {
      steps: stepPoints,
      lower: lowerSteps,
      upper: upperSteps,
      censor: censorPoints,
      median,
      lastSurvival: survivalProb,
      maxTime: lastTime
    };
  }

  function invertMatrix(matrix){
    if(!Array.isArray(matrix) || !matrix.length){
      return null;
    }
    const n = matrix.length;
    const augmented = matrix.map((row, rowIndex) => {
      const extended = row.slice();
      for(let j = 0; j < n; j += 1){
        extended.push(rowIndex === j ? 1 : 0);
      }
      return extended;
    });
    for(let i = 0; i < n; i += 1){
      let pivotRow = i;
      let pivotValue = augmented[i][i];
      for(let r = i + 1; r < n; r += 1){
        if(Math.abs(augmented[r][i]) > Math.abs(pivotValue)){
          pivotValue = augmented[r][i];
          pivotRow = r;
        }
      }
      if(!Number.isFinite(pivotValue) || Math.abs(pivotValue) < 1e-12){
        logDebug('invertMatrix singular pivot', { index: i, pivot: pivotValue });
        return null;
      }
      if(pivotRow !== i){
        const temp = augmented[i];
        augmented[i] = augmented[pivotRow];
        augmented[pivotRow] = temp;
      }
      const divisor = augmented[i][i];
      for(let j = 0; j < 2 * n; j += 1){
        augmented[i][j] /= divisor;
      }
      for(let r = 0; r < n; r += 1){
        if(r === i) continue;
        const factor = augmented[r][i];
        for(let c = 0; c < 2 * n; c += 1){
          augmented[r][c] -= factor * augmented[i][c];
        }
      }
    }
    const inverse = augmented.map(row => row.slice(n));
    return inverse;
  }

  function addDiagonal(matrix, epsilon){
    return matrix.map((row, rowIndex) => row.map((value, colIndex) => value + (rowIndex === colIndex ? epsilon : 0)));
  }

  function tryInvertMatrix(matrix, options){
    if(!Array.isArray(matrix) || !matrix.length){
      return null;
    }
    const epsilons = Array.isArray(options?.epsilons) && options.epsilons.length ? options.epsilons : [0, 1e-8, 1e-6, 1e-4];
    for(let attempt = 0; attempt < epsilons.length; attempt += 1){
      const epsilon = epsilons[attempt];
      const adjusted = epsilon !== 0 ? addDiagonal(matrix, epsilon) : matrix.map(row => row.slice());
      const inverse = invertMatrix(adjusted);
      if(inverse){
        if(epsilon !== 0){
          inverse.__ridgeEpsilon = epsilon;
          logDebug('matrix inversion regularized', {
            context: options?.context || 'matrix',
            epsilon,
            attempt,
            iteration: options?.iteration ?? null
          });
        }
        return inverse;
      }
    }
    logDebug('matrix inversion failed after retries', {
      context: options?.context || 'matrix',
      epsilons
    });
    return null;
  }

  function multiplyMatrixVector(matrix, vector){
    return matrix.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));
  }

  function dotProduct(a, b){
    let total = 0;
    for(let i = 0; i < a.length; i += 1){
      total += a[i] * b[i];
    }
    return total;
  }

  function computeLogRank(series){
    if(!Array.isArray(series) || series.length < 2){
      return { available: false, message: 'Log-rank test requires at least two groups.' };
    }
    const eventTimes = new Set();
    series.forEach(group => {
      group.records.forEach(rec => {
        if(rec.event && Number.isFinite(rec.time)){
          eventTimes.add(rec.time);
        }
      });
    });
    const uniqueTimes = Array.from(eventTimes).sort((a, b) => a - b);
    if(!uniqueTimes.length){
      return { available: false, message: 'No events detected for log-rank test.' };
    }
    const k = series.length;
    const atRisk = series.map(group => group.records.length);
    const eventMaps = series.map(group => {
      const map = new Map();
      group.records.forEach(rec => {
        const existing = map.get(rec.time) || { events: 0, censored: 0 };
        if(rec.event){ existing.events += 1; } else { existing.censored += 1; }
        map.set(rec.time, existing);
      });
      return map;
    });
    const diff = new Array(k).fill(0);
    const variance = Array.from({ length: k }, () => new Array(k).fill(0));

    uniqueTimes.forEach(time => {
      const eventsAtTime = eventMaps.map(map => map.get(time)?.events || 0);
      const censoredAtTime = eventMaps.map(map => map.get(time)?.censored || 0);
      const totalEvents = eventsAtTime.reduce((sum, value) => sum + value, 0);
      const totalAtRisk = atRisk.reduce((sum, value) => sum + value, 0);
      if(totalEvents > 0 && totalAtRisk > 0){
        eventsAtTime.forEach((observed, idx) => {
          const expected = (atRisk[idx] / totalAtRisk) * totalEvents;
          diff[idx] += observed - expected;
        });
        if(totalAtRisk > 1){
          const common = totalEvents * (totalAtRisk - totalEvents) / (totalAtRisk * (totalAtRisk - 1));
          for(let g = 0; g < k; g += 1){
            const pg = atRisk[g] / totalAtRisk;
            for(let h = 0; h < k; h += 1){
              const ph = atRisk[h] / totalAtRisk;
              if(g === h){
                variance[g][h] += common * pg * (1 - pg);
              } else {
                variance[g][h] -= common * pg * ph;
              }
            }
          }
        }
      }
      for(let idx = 0; idx < k; idx += 1){
        atRisk[idx] -= (eventsAtTime[idx] + censoredAtTime[idx]);
        if(atRisk[idx] < 0){
          atRisk[idx] = 0;
        }
      }
    });

    const df = k - 1;
    if(df <= 0){
      return { available: false, message: 'Insufficient groups for log-rank statistic.' };
    }
    const reducedMatrix = [];
    for(let i = 0; i < df; i += 1){
      const row = [];
      for(let j = 0; j < df; j += 1){
        row.push(variance[i][j]);
      }
      reducedMatrix.push(row);
    }
    const inverse = tryInvertMatrix(reducedMatrix, { context: 'log-rank variance' });
    if(!inverse){
      return { available: false, message: 'Unable to invert log-rank variance matrix.' };
    }
    const diffVec = diff.slice(0, df);
    const invTimesDiff = multiplyMatrixVector(inverse, diffVec);
    const chi2 = dotProduct(diffVec, invTimesDiff);
    let pValue = null;
    if(global.jStat && global.jStat.chisquare && typeof global.jStat.chisquare.cdf === 'function'){
      pValue = 1 - global.jStat.chisquare.cdf(chi2, df);
    }
    logDebug('log-rank summary', { chi2, df, p: pValue });
    return { available: true, chi2, df, p: pValue };
  }

  function collectSeries(){
    if(!state.hot){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false }, covariateColumns: [] };
    }
    const data = state.hot.getData() || [];
    const columnCount = typeof state.hot.countCols === 'function' ? state.hot.countCols() : (Array.isArray(data?.[0]) ? data[0].length : SURVIVAL_DEFAULT_COLS);
    const headersRaw = typeof state.hot.getColHeader === 'function' ? state.hot.getColHeader() : SURVIVAL_COL_HEADERS;
    const headerLookup = [];
    for(let col = 0; col < columnCount; col += 1){
      const headerValue = Array.isArray(headersRaw) ? headersRaw[col] : null;
      headerLookup[col] = normalizeHeaderLabel(headerValue, SURVIVAL_COL_HEADERS[col] || `Column ${col + 1}`);
    }
    const covariateColumns = collectMeaningfulCovariateColumns(data, headerLookup, columnCount);
    const supportsTimeDependent = detectTimeDependentSupport(data);
    state.covariateColumns = covariateColumns;
    if(!Array.isArray(data) || !data.length){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false }, covariateColumns, headers: headerLookup, supportsTimeDependent };
    }
    const groups = new Map();
    let maxTime = 0;
    let usedRows = 0;
    for(let i = 0; i < data.length; i += 1){
      const row = data[i];
      if(!row){
        continue;
      }
      const groupRaw = row[0];
      const timeRaw = row[1];
      const eventRaw = row[2];
      const entryRaw = row[3];
      const groupName = typeof groupRaw === 'string' ? groupRaw.trim() : (groupRaw != null ? String(groupRaw).trim() : '');
      const time = Number.parseFloat(timeRaw);
      const eventFlag = Number(eventRaw);
      const entry = Number.parseFloat(entryRaw);
      if(!groupName || !Number.isFinite(time)){
        continue;
      }
      usedRows += 1;
      const bucket = groups.get(groupName) || { name: groupName, records: [], events: 0, censored: 0 };
      const record = {
        time,
        event: eventFlag === 1,
        entry: Number.isFinite(entry) ? entry : 0,
        extras: Array.isArray(row) ? row.slice(BASE_COLUMN_COUNT) : [],
        rowIndex: i
      };
      if(Number.isFinite(record.entry) && record.entry > record.time){
        logDebug('entry greater than event time encountered', { rowIndex: i, entry: record.entry, time: record.time });
      }
      bucket.records.push(record);
      if(record.event){ bucket.events += 1; } else { bucket.censored += 1; }
      groups.set(groupName, bucket);
      if(Number.isFinite(time)){
        maxTime = Math.max(maxTime, time);
      }
    }
    const groupNames = Array.from(groups.keys());
    if(!groupNames.length || usedRows === 0){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false }, covariateColumns, headers: headerLookup, supportsTimeDependent };
    }
    state.groupOrder = state.groupOrder.filter(name => groups.has(name));
    groupNames.forEach(name => {
      if(!state.groupOrder.includes(name)){
        state.groupOrder.push(name);
      }
    });
    const ordered = state.groupOrder.slice();
    const series = ordered.map(name => {
      const entry = groups.get(name);
      if(!entry){
        return null;
      }
      const km = computeKaplanMeier(entry.records);
      maxTime = Math.max(maxTime, km.maxTime);
      return {
        name,
        records: entry.records,
        events: entry.events,
        censored: entry.censored,
        total: entry.records.length,
        km
      };
    }).filter(Boolean);
    const logRank = computeLogRank(series);
    logDebug('series collected', {
      groupCount: series.length,
      maxTime,
      logRankAvailable: !!logRank.available,
      usedRows,
      covariateColumnCount: covariateColumns.length
    });
    return { series, groupNames: ordered, maxTime, logRank, covariateColumns, headers: headerLookup, supportsTimeDependent };
  }

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, match => {
      switch(match){
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return match;
      }
    });
  }

  function safeExp(value){
    if(!Number.isFinite(value)){
      return 1;
    }
    const clipped = Math.max(Math.min(value, 50), -50);
    return Math.exp(clipped);
  }

  function parseCovariateValue(raw, predictor){
    let value = 0;
    let handled = false;
    if(typeof raw === 'number'){
      if(Number.isFinite(raw)){
        value = raw;
        handled = true;
      }
    } else if(typeof raw === 'boolean'){
      value = raw ? 1 : 0;
      handled = true;
    } else if(raw != null){
      const str = String(raw).trim();
      if(str.length){
        const numeric = Number.parseFloat(str);
        if(Number.isFinite(numeric)){
          value = numeric;
          handled = true;
        } else {
          const lowered = str.toLowerCase();
          if(['true', 'yes', 'y', 't', 'active', 'on'].includes(lowered)){
            value = 1;
            handled = true;
          } else if(['false', 'no', 'n', 'f', 'inactive', 'off'].includes(lowered)){
            value = 0;
            handled = true;
          } else if(predictor?.type === 'time'){
            const matches = str.match(/-?\d+(?:\.\d+)?/g);
            if(Array.isArray(matches) && matches.length){
              const lastToken = matches[matches.length - 1];
              const parsed = Number.parseFloat(lastToken);
              if(Number.isFinite(parsed)){
                value = parsed;
                handled = true;
              }
            }
          }
        }
      }
    }
    if(!handled){
      value = 0;
    }
    if(parseDebugCounter < 5){
      logDebug('covariate parsed', {
        raw,
        value,
        predictorType: predictor?.type || 'baseline',
        handled
      });
      parseDebugCounter += 1;
    }
    return value;
  }

  function normalCDF(value){
    if(!Number.isFinite(value)){
      return Number.NaN;
    }
    if(global.jStat?.normal?.cdf){
      return global.jStat.normal.cdf(value, 0, 1);
    }
    if(typeof Math.erfc === 'function'){
      return 0.5 * Math.erfc(-value / Math.SQRT2);
    }
    const absZ = Math.abs(value);
    const t = 1 / (1 + 0.2316419 * absZ);
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const approx = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absZ * absZ) * poly;
    return value >= 0 ? approx : 1 - approx;
  }

  function pValueFromZ(z){
    if(!Number.isFinite(z)){
      return null;
    }
    const absZ = Math.abs(z);
    const tail = 1 - normalCDF(absZ);
    if(!Number.isFinite(tail)){
      return null;
    }
    return 2 * tail;
  }

  function pValueFromChiSquare(statistic, df){
    if(!Number.isFinite(statistic) || !Number.isFinite(df) || df <= 0){
      return null;
    }
    if(global.jStat?.chisquare?.cdf){
      const cdf = global.jStat.chisquare.cdf(statistic, df);
      return Number.isFinite(cdf) ? 1 - cdf : null;
    }
    return null;
  }

  function createZeroMatrix(size){
    return Array.from({ length: size }, () => new Array(size).fill(0));
  }

  function getSelectedCovariates(columns){
    const selected = [];
    const list = Array.isArray(columns) ? columns : [];
    list.forEach(col => {
      const settings = state.covariateSettings[String(col.index)];
      if(settings?.enabled){
        selected.push({
          columnIndex: col.index,
          header: col.header,
          type: settings.type === 'time' ? 'time' : 'baseline'
        });
      }
    });
    logDebug('selected covariates resolved', { count: selected.length });
    return selected;
  }

  function prepareCoxData(summary){
    if(!summary || !Array.isArray(summary.series) || !summary.series.length){
      return { available: false, message: 'No series available for Cox model.' };
    }
    const series = summary.series;
    const baselineGroup = series[0]?.name || 'Group 1';
    const covariateSelections = getSelectedCovariates(summary.covariateColumns);
    const designPredictors = [];
    for(let idx = 1; idx < series.length; idx += 1){
      const group = series[idx];
      designPredictors.push({
        key: `group:${group?.name ?? idx}`,
        label: `${group?.name ?? `Group ${idx + 1}`} vs ${baselineGroup}`,
        type: 'group',
        groupName: group?.name ?? `Group ${idx + 1}`,
        groupIndex: idx
      });
    }
    covariateSelections.forEach(selection => {
      designPredictors.push({
        key: `cov:${selection.columnIndex}`,
        label: selection.header,
        type: selection.type,
        columnIndex: selection.columnIndex
      });
    });
    const predictors = designPredictors.length;
    if(predictors <= 0){
      return { available: false, message: 'Cox model requires at least one predictor.' };
    }
    const data = [];
    series.forEach((group, groupIndex) => {
      if(!group || !Array.isArray(group.records)){
        return;
      }
      group.records.forEach((rec, recordIndex) => {
        if(!Number.isFinite(rec.time)){
          return;
        }
        const covariates = designPredictors.map(predictor => {
          if(predictor.type === 'group'){
            return predictor.groupIndex === groupIndex ? 1 : 0;
          }
          const offset = predictor.columnIndex - BASE_COLUMN_COUNT;
          const raw = Array.isArray(rec.extras) ? rec.extras[offset] : undefined;
          return parseCovariateValue(raw, predictor);
        });
        data.push({
          time: rec.time,
          entry: Number.isFinite(rec.entry) ? rec.entry : 0,
          event: rec.event ? 1 : 0,
          covariates,
          group: group.name,
          rowIndex: rec.rowIndex ?? recordIndex,
          extras: rec.extras
        });
      });
    });
    if(!data.length){
      return { available: false, message: 'No valid observations to fit Cox model.' };
    }
    const originalCount = data.length;
    let truncated = false;
    if(data.length > COX_MAX_OBSERVATIONS){
      data.length = COX_MAX_OBSERVATIONS;
      truncated = true;
      logDebug('cox observation cap applied', { originalCount, cappedAt: COX_MAX_OBSERVATIONS });
    }
    data.sort((a, b) => a.time - b.time);
    const eventCount = data.reduce((sum, rec) => sum + (rec.event ? 1 : 0), 0);
    if(eventCount === 0){
      return { available: false, message: 'Cox model requires at least one observed event.' };
    }
    const groupedEvents = new Map();
    data.forEach((obs, idx) => {
      if(!obs.event){
        return;
      }
      const timeKey = Number.isFinite(obs.time) ? obs.time : 0;
      if(!groupedEvents.has(timeKey)){
        groupedEvents.set(timeKey, []);
      }
      groupedEvents.get(timeKey).push(idx);
    });
    const eventsByTime = [];
    const sortedTimes = Array.from(groupedEvents.keys()).sort((a, b) => a - b);
    sortedTimes.forEach(timeValue => {
      const eventIndices = groupedEvents.get(timeValue) || [];
      eventsByTime.push({
        time: timeValue,
        eventIndices,
        eventCount: eventIndices.length,
        atRiskCount: 0
      });
    });
    const entryOrder = data
      .map((obs, idx) => ({ idx, entry: Number.isFinite(obs.entry) ? obs.entry : 0, time: Number.isFinite(obs.time) ? obs.time : 0 }))
      .sort((a, b) => {
        if(a.entry === b.entry){
          if(a.time === b.time){
            return a.idx - b.idx;
          }
          return a.time - b.time;
        }
        return a.entry - b.entry;
      })
      .map(item => item.idx);
    const exitOrder = data.map((_, idx) => idx);
    let entryPointer = 0;
    let exitPointer = 0;
    let atRiskCount = 0;
    let maxRiskCount = 0;
    const epsilon = 1e-9;
    eventsByTime.forEach(group => {
      const timeValue = group.time;
      while(entryPointer < entryOrder.length){
        const candidate = data[entryOrder[entryPointer]];
        if(!candidate){
          entryPointer += 1;
          continue;
        }
        const entryTime = Number.isFinite(candidate.entry) ? candidate.entry : 0;
        if(entryTime <= timeValue + epsilon){
          atRiskCount += 1;
          entryPointer += 1;
        } else {
          break;
        }
      }
      while(exitPointer < exitOrder.length){
        const candidate = data[exitOrder[exitPointer]];
        if(!candidate){
          exitPointer += 1;
          continue;
        }
        if(candidate.time < timeValue - epsilon){
          atRiskCount = Math.max(0, atRiskCount - 1);
          exitPointer += 1;
          continue;
        }
        break;
      }
      group.atRiskCount = atRiskCount;
      maxRiskCount = Math.max(maxRiskCount, atRiskCount);
    });
    logDebug('cox design prepared', {
      predictors,
      baselineGroup,
      totalRecords: data.length,
      events: eventCount,
      extraCovariates: covariateSelections.length,
      tieGroups: eventsByTime.length,
      maxRiskCount,
      truncated
    });
    if(data.length && parseDebugCounter < 5){
      logDebug('cox design sample row', {
        sample: Object.assign({}, data[0], { covariates: data[0].covariates.slice() })
      });
    }
    return {
      available: true,
      baselineGroup,
      predictors,
      data,
      eventCount,
      design: { predictors: designPredictors, covariateSelections },
      eventsByTime,
      entryOrder,
      exitOrder,
      maxRiskCount,
      truncated
    };
  }

  function evaluateCoxAt(beta, prepared){
    const { data, predictors, eventsByTime } = prepared;
    const gradient = new Array(predictors).fill(0);
    const fisher = Array.from({ length: predictors }, () => new Array(predictors).fill(0));
    let logLik = 0;
    if(!Array.isArray(eventsByTime) || !eventsByTime.length){
      return { gradient, fisher, logLik };
    }
    const entryOrder = Array.isArray(prepared.entryOrder) && prepared.entryOrder.length === data.length
      ? prepared.entryOrder
      : data.map((_, idx) => idx);
    const exitOrder = Array.isArray(prepared.exitOrder) && prepared.exitOrder.length === data.length
      ? prepared.exitOrder
      : data.map((_, idx) => idx);
    const weights = new Array(data.length);
    const xbValues = new Array(data.length);
    for(let i = 0; i < data.length; i += 1){
      const obs = data[i];
      const xb = dotProduct(obs.covariates, beta);
      xbValues[i] = xb;
      weights[i] = safeExp(xb);
    }
    let denom = 0;
    const weightedX = new Array(predictors).fill(0);
    const weightedXX = createZeroMatrix(predictors);
    let entryPointer = 0;
    let exitPointer = 0;
    const epsilon = 1e-9;
    eventsByTime.forEach((group, idx) => {
      const eventIndices = Array.isArray(group.eventIndices) ? group.eventIndices : [];
      if(!eventIndices.length){
        return;
      }
      const timeValue = Number.isFinite(group.time) ? group.time : 0;
      while(entryPointer < entryOrder.length){
        const candidateIndex = entryOrder[entryPointer];
        const obs = data[candidateIndex];
        if(!obs){
          entryPointer += 1;
          continue;
        }
        const entryTime = Number.isFinite(obs.entry) ? obs.entry : 0;
        if(entryTime <= timeValue + epsilon){
          const weight = weights[candidateIndex];
          denom += weight;
          for(let r = 0; r < predictors; r += 1){
            const vr = obs.covariates[r] ?? 0;
            weightedX[r] += vr * weight;
            for(let c = 0; c < predictors; c += 1){
              const vc = obs.covariates[c] ?? 0;
              weightedXX[r][c] += vr * vc * weight;
            }
          }
          entryPointer += 1;
        } else {
          break;
        }
      }
      while(exitPointer < exitOrder.length){
        const candidateIndex = exitOrder[exitPointer];
        const obs = data[candidateIndex];
        if(!obs){
          exitPointer += 1;
          continue;
        }
        if(obs.time < timeValue - epsilon){
          const weight = weights[candidateIndex];
          denom -= weight;
          for(let r = 0; r < predictors; r += 1){
            const vr = obs.covariates[r] ?? 0;
            weightedX[r] -= vr * weight;
            for(let c = 0; c < predictors; c += 1){
              const vc = obs.covariates[c] ?? 0;
              weightedXX[r][c] -= vr * vc * weight;
            }
          }
          exitPointer += 1;
          continue;
        }
        break;
      }
      const denomSafe = Math.max(denom, 1e-12);
      const expectedX = weightedX.map(val => val / denomSafe);
      const eventCount = group.eventCount || eventIndices.length;
      const observedSum = new Array(predictors).fill(0);
      eventIndices.forEach(eventIndex => {
        const obs = data[eventIndex];
        if(!obs){
          return;
        }
        logLik += xbValues[eventIndex] - Math.log(denomSafe);
        for(let r = 0; r < predictors; r += 1){
          observedSum[r] += obs.covariates[r] ?? 0;
        }
      });
      for(let r = 0; r < predictors; r += 1){
        gradient[r] += observedSum[r] - eventCount * expectedX[r];
      }
      for(let r = 0; r < predictors; r += 1){
        for(let c = 0; c < predictors; c += 1){
          const expectedXX = weightedXX[r][c] / denomSafe;
          const varTerm = expectedXX - expectedX[r] * expectedX[c];
          fisher[r][c] += eventCount * varTerm;
        }
      }
      while(exitPointer < exitOrder.length){
        const candidateIndex = exitOrder[exitPointer];
        const obs = data[candidateIndex];
        if(!obs){
          exitPointer += 1;
          continue;
        }
        if(obs.time <= timeValue + epsilon){
          const weight = weights[candidateIndex];
          denom -= weight;
          for(let r = 0; r < predictors; r += 1){
            const vr = obs.covariates[r] ?? 0;
            weightedX[r] -= vr * weight;
            for(let c = 0; c < predictors; c += 1){
              const vc = obs.covariates[c] ?? 0;
              weightedXX[r][c] -= vr * vc * weight;
            }
          }
          exitPointer += 1;
          continue;
        }
        break;
      }
      if(idx < 5){
        logDebug('cox risk window evaluated', {
          time: group.time,
          riskCount: group.atRiskCount,
          activeDenom: denomSafe,
          eventCount
        });
      }
    });
    return { gradient, fisher, logLik };
  }

  function fitCoxModel(summary, options){
    const enabled = options?.enabled !== false;
    if(!enabled){
      return { available: false, message: 'Cox model fitting disabled.' };
    }
    const prepared = prepareCoxData(summary);
    if(!prepared.available){
      logDebug('cox preparation failed', { message: prepared.message });
      return { available: false, message: prepared.message };
    }
    const { predictors, baselineGroup } = prepared;
    let beta = new Array(predictors).fill(0);
    let covariance = null;
    let converged = false;
    let iterations = 0;
    for(iterations = 0; iterations < 25; iterations += 1){
      const evaluation = evaluateCoxAt(beta, prepared);
      const fisherInv = tryInvertMatrix(evaluation.fisher, { context: 'cox fisher', iteration: iterations });
      if(!fisherInv){
        logDebug('cox iteration inversion failed', { iteration: iterations });
        return { available: false, message: 'Failed to invert Fisher information matrix.' };
      }
      if(fisherInv.__ridgeEpsilon){
        logDebug('cox fisher ridge applied', { iteration: iterations, epsilon: fisherInv.__ridgeEpsilon });
      }
      const step = multiplyMatrixVector(fisherInv, evaluation.gradient);
      let maxChange = 0;
      beta = beta.map((value, idx) => {
        const limited = Math.max(Math.min(step[idx], 2), -2);
        maxChange = Math.max(maxChange, Math.abs(limited));
        return value + limited;
      });
      logDebug('cox iteration step', { iteration: iterations, maxChange });
      if(maxChange < 1e-6){
        converged = true;
        covariance = fisherInv;
        break;
      }
      covariance = fisherInv;
    }
    if(!covariance){
      const fallbackEval = evaluateCoxAt(beta, prepared);
      covariance = tryInvertMatrix(fallbackEval.fisher, { context: 'cox fisher fallback' });
      if(!covariance){
        logDebug('cox covariance fallback failed');
        return { available: false, message: 'Unable to compute covariance for Cox model.' };
      }
      if(covariance.__ridgeEpsilon){
        logDebug('cox covariance ridge applied', { epsilon: covariance.__ridgeEpsilon });
      }
    }
    const finalEval = evaluateCoxAt(beta, prepared);
    const nullEval = evaluateCoxAt(new Array(predictors).fill(0), prepared);
    const designPredictors = Array.isArray(prepared.design?.predictors) ? prepared.design.predictors : [];
    const coefficients = designPredictors.map((predictor, idx) => {
      const coef = beta[idx];
      const variance = Math.max(covariance[idx]?.[idx] ?? 0, 0);
      const se = Math.sqrt(variance);
      const hr = Math.exp(coef);
      const ciLow = se > 0 ? Math.exp(coef - 1.96 * se) : hr;
      const ciHigh = se > 0 ? Math.exp(coef + 1.96 * se) : hr;
      const z = se > 0 ? coef / se : null;
      const p = pValueFromZ(z);
      const label = predictor.label || predictor.groupName || `Predictor ${idx + 1}`;
      const entry = {
        key: predictor.key || `predictor:${idx}`,
        label,
        type: predictor.type || 'baseline',
        beta: coef,
        se,
        hazardRatio: hr,
        ciLow,
        ciHigh,
        z,
        p
      };
      if(predictor.type === 'group'){
        entry.group = predictor.groupName;
      } else if(Number.isFinite(predictor.columnIndex)){
        entry.columnIndex = predictor.columnIndex;
      }
      return entry;
    });
    const coefficientIndex = {};
    coefficients.forEach((coef, idx) => {
      coefficientIndex[coef.key] = idx;
      if(coef.type === 'group' && coef.group){
        coefficientIndex[coef.group] = idx;
      }
    });
    const likelihoodRatio = {
      statistic: 2 * (finalEval.logLik - nullEval.logLik),
      df: predictors,
      p: pValueFromChiSquare(2 * (finalEval.logLik - nullEval.logLik), predictors)
    };
    const diagnostics = {
      logLikelihood: finalEval.logLik,
      logLikelihoodNull: nullEval.logLik,
      aic: -2 * finalEval.logLik + 2 * predictors,
      bic: -2 * finalEval.logLik + predictors * Math.log(prepared.data.length),
      likelihoodRatio,
      iterations: iterations + 1,
      converged
    };
    const debugMetrics = {
      recordCount: prepared.data.length,
      eventGroupCount: Array.isArray(prepared.eventsByTime) ? prepared.eventsByTime.length : 0,
      maxRiskCount: prepared.maxRiskCount || 0,
      truncated: !!prepared.truncated
    };
    const result = {
      available: true,
      baselineGroup,
      coefficients,
      covariance,
      coefficientIndex,
      design: prepared.design,
      diagnostics,
      converged,
      message: converged ? 'Cox model converged.' : 'Cox model reached iteration limit.',
      debug: debugMetrics
    };
    logDebug('cox model fitted', {
      converged,
      iterations: diagnostics.iterations,
      coefficientCount: coefficients.length,
      logLik: diagnostics.logLikelihood,
      predictorLabels: coefficients.map(coef => coef.label),
      recordCount: debugMetrics.recordCount,
      eventGroupCount: debugMetrics.eventGroupCount,
      truncated: debugMetrics.truncated
    });
    return result;
  }

  function computeHazardRatios(series, coxModel, options){
    const enabled = options?.enabled !== false;
    if(!enabled){
      return { available: false, message: 'Hazard ratio table disabled.' };
    }
    if(!coxModel || !coxModel.available){
      const message = coxModel?.message || 'Hazard ratios unavailable.';
      logDebug('hazard ratios skipped', { message });
      return { available: false, message };
    }
    if(!Array.isArray(series) || series.length < 2){
      return { available: false, message: 'At least two groups required for hazard ratios.' };
    }
    const rows = [];
    const cov = coxModel.covariance;
    const indexMap = coxModel.coefficientIndex || {};
    for(let i = 0; i < series.length; i += 1){
      for(let j = i + 1; j < series.length; j += 1){
        const groupA = series[i];
        const groupB = series[j];
        const idxA = indexMap[groupA.name];
        const idxB = indexMap[groupB.name];
        const betaA = Number.isFinite(idxA) ? coxModel.coefficients[idxA]?.beta ?? 0 : 0;
        const betaB = Number.isFinite(idxB) ? coxModel.coefficients[idxB]?.beta ?? 0 : 0;
        const diff = betaB - betaA;
        const hr = Math.exp(diff);
        let ciLow = null;
        let ciHigh = null;
        let z = null;
        let p = null;
        if(Array.isArray(cov)){
          const varA = Number.isFinite(idxA) ? cov[idxA]?.[idxA] ?? 0 : 0;
          const varB = Number.isFinite(idxB) ? cov[idxB]?.[idxB] ?? 0 : 0;
          const covAB = Number.isFinite(idxA) && Number.isFinite(idxB) ? cov[idxA]?.[idxB] ?? 0 : 0;
          const variance = Math.max(varA + varB - 2 * covAB, 0);
          const se = Math.sqrt(variance);
          if(se > 0){
            ciLow = Math.exp(diff - 1.96 * se);
            ciHigh = Math.exp(diff + 1.96 * se);
            z = diff / se;
            p = pValueFromZ(z);
          } else {
            ciLow = hr;
            ciHigh = hr;
          }
        }
        rows.push({
          groupA: groupA.name,
          groupB: groupB.name,
          hazardRatio: hr,
          ciLow,
          ciHigh,
          z,
          p
        });
      }
    }
    logDebug('hazard ratios computed', { pairCount: rows.length });
    return { available: rows.length > 0, rows, baselineGroup: coxModel.baselineGroup, message: rows.length ? null : 'No comparisons available.' };
  }

  function extendSteps(points, axisMax){
    const extended = points.map(pt => ({ time: pt.time, survival: pt.survival, value: pt.value }));
    if(!extended.length){
      return extended;
    }
    if(Number.isFinite(axisMax)){
      const last = extended[extended.length - 1];
      const lastTime = Number.isFinite(last.time) ? last.time : 0;
      if(axisMax > lastTime){
        const value = Number.isFinite(last.survival) ? last.survival : (Number.isFinite(last.value) ? last.value : 0);
        extended.push({ time: axisMax, survival: value, value });
      }
    }
    return extended;
  }

  function buildStepPath(points, axisMax, x2px, y2px, accessor){
    const extended = extendSteps(points, axisMax);
    if(!extended.length){
      return '';
    }
    const coords = extended.map(pt => {
      const time = Number.isFinite(pt.time) ? pt.time : 0;
      const value = Number.isFinite(accessor(pt)) ? accessor(pt) : 0;
      return { x: x2px(time), y: y2px(value) };
    });
    return coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x} ${coord.y}`).join(' ');
  }

  function buildConfidencePath(upper, lower, axisMax, x2px, y2px){
    const up = extendSteps(upper, axisMax);
    const low = extendSteps(lower, axisMax);
    if(!up.length || !low.length){
      return '';
    }
    const parts = [];
    up.forEach((pt, idx) => {
      const x = x2px(Number.isFinite(pt.time) ? pt.time : 0);
      const y = y2px(Number.isFinite(pt.value) ? pt.value : (Number.isFinite(pt.survival) ? pt.survival : 0));
      parts.push(`${idx === 0 ? 'M' : 'L'}${x} ${y}`);
    });
    for(let i = low.length - 1; i >= 0; i -= 1){
      const pt = low[i];
      const x = x2px(Number.isFinite(pt.time) ? pt.time : 0);
      const y = y2px(Number.isFinite(pt.value) ? pt.value : (Number.isFinite(pt.survival) ? pt.survival : 0));
      parts.push(`L${x} ${y}`);
    }
    parts.push('Z');
    return parts.join(' ');
  }

  function formatNumber(value, digits){
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    const precision = Number.isFinite(digits) ? digits : 2;
    return chartStyle.formatScientific(value, { maxDecimals: precision });
  }

  function formatP(value){
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    const formatter = Shared.formatters?.formatPValue || Shared.formatPValue;
    if(typeof formatter === 'function'){
      return formatter(value);
    }
    return value.toExponential(5);
  }

  function formatInterval(low, high){
    if(Number.isFinite(low) && Number.isFinite(high)){
      return `${formatNumber(low, 3)} – ${formatNumber(high, 3)}`;
    }
    return 'n/a';
  }

  function renderStatsLead(target, text){
    if(!target){
      return;
    }
    target.innerHTML = '';
    const lead = document.createElement('div');
    lead.className = 'stats-table-lead';
    lead.textContent = text;
    target.appendChild(lead);
  }

  function renderStatsTableCard(target, model){
    if(!target){
      return false;
    }
    const statsRenderer = Shared.statsTable?.render;
    if(typeof statsRenderer === 'function'){
      statsRenderer({ target, ...model });
      return true;
    }
    target.innerHTML = '';
    if(model.caption){
      const caption = document.createElement('div');
      caption.className = 'stats-table-lead';
      caption.textContent = model.caption;
      target.appendChild(caption);
    }
    if(Array.isArray(model.columns) && model.columns.length){
      const table = document.createElement('table');
      table.className = 'stats-table stats-table--fallback';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      model.columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.style.textAlign = col.align === 'right' ? 'right' : (col.align === 'center' ? 'center' : 'left');
        if(col.tooltip){
          th.title = col.tooltip;
        }
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      (model.rows || []).forEach(row => {
        const tr = document.createElement('tr');
        model.columns.forEach(col => {
          const td = document.createElement('td');
          td.style.textAlign = col.align === 'right' ? 'right' : (col.align === 'center' ? 'center' : 'left');
          const value = row?.[col.key];
          td.textContent = value != null ? String(value) : '';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      target.appendChild(table);
    }
    if(Array.isArray(model.footnotes) && model.footnotes.length){
      const footnoteList = document.createElement('div');
      footnoteList.className = 'stats-table-footnotes';
      model.footnotes.forEach(note => {
        const entry = document.createElement('div');
        entry.className = 'stats-table-footnote';
        entry.textContent = note;
        footnoteList.appendChild(entry);
      });
      target.appendChild(footnoteList);
    }
    return false;
  }

  function autoResizeSvgHelper(svg){
    if(!svg){
      logDebug('autoResizeSvgHelper skipped', { hasSvg: false });
      return;
    }
    ensureGraphViewport(svg, { padding: 18, debugLabel: 'survival-graph', component: 'survival' });
  }

  function drawSurvival(){
    if(!refs.plotDiv){
      return;
    }
    const debugStamp = Date.now();
    logDebug('draw start', { debugStamp });
    while(refs.plotDiv.firstChild){
      refs.plotDiv.removeChild(refs.plotDiv.firstChild);
    }
    const summary = collectSeries();
    refreshCovariateControls();
    const hazardRatiosEnabled = !!refs.showHazardRatios?.checked;
    const coxEnabled = !!refs.fitCoxModel?.checked;
    let coxModelSummary = { available: false, message: coxEnabled ? 'Cox model unavailable.' : 'Cox model fitting disabled.' };
    let hazardSummary = { available: false, message: hazardRatiosEnabled ? 'Hazard ratios unavailable.' : 'Hazard ratio table hidden.' };
    if(summary.series.length){
      const shouldFitCox = hazardRatiosEnabled || coxEnabled;
      if(shouldFitCox){
        coxModelSummary = fitCoxModel(summary, { enabled: shouldFitCox });
      }
      if(hazardRatiosEnabled){
        hazardSummary = computeHazardRatios(summary.series, coxModelSummary, { enabled: hazardRatiosEnabled });
      }
    }
    summary.coxModel = coxModelSummary;
    summary.hazardRatios = hazardSummary;
    summary.flags = { hazardRatiosEnabled, coxEnabled };
    state.lastSummary = summary;
    renderSurvivalStatsAdvisor(summary);
    logDebug('stat toggles resolved', { hazardRatiosEnabled, coxEnabled, coxAvailable: coxModelSummary.available });
    updateGroupColorPickers(summary.groupNames);
    if(!summary.series.length){
      refs.plotDiv.innerHTML = '<i>No data</i>';
      updateStats(summary);
      return;
    }
    const containerRect = refs.svgBox?.getBoundingClientRect?.();
    const width = Math.max(200, Math.floor(refs.plotDiv.clientWidth || containerRect?.width || 400));
    const height = Math.max(200, Math.floor(refs.plotDiv.clientHeight || containerRect?.height || 320));
    logDebug('draw dimensions resolved', { width, height });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'survivalSvg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    chartStyle.applySvgDefaults(svg);
    if(svg.dataset){
      svg.dataset.fontScope = 'survival';
    }
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg, { scopeId: 'survival' });
      logDebug('fontControls enableForSvg invoked', { width, height });
    } else {
      logDebug('fontControls enableForSvg missing', { hasFontControls: !!fontControls });
    }
    refs.plotDiv.appendChild(svg);

    const fontInfo = chartStyle.resolveScaledFontSize ? chartStyle.resolveScaledFontSize({
      rawSize: refs.fontSize?.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: refs.svgBox,
      input: refs.fontSize
    }) : { scaledPx: Number(refs.fontSize?.value) || 13, pt: Number(refs.fontSize?.value) || 13, scaleInfo: { styleScale: 1 } };
    chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, fontInfo, input: refs.fontSize });
    const fs = fontInfo.scaledPx || 13;
    const styleScaleInfo = fontInfo.scaleInfo || { styleScale: 1 };
    const axisSettings = ensureAxisSettings();
    const axisStrokeWidthBase = axisSettings.strokeWidth;
    const axisStrokeWidth = chartStyle.scaleStrokeWidth ? chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'survival-axis', min: 0, exact: true }) : axisStrokeWidthBase;
    const axisStroke = axisSettings.color || '#000';
    const gridStyleBase = getGridStyle(axisStrokeWidthBase);
    const gridStrokeStyle = Object.assign({}, gridStyleBase, {
      thickness: chartStyle.scaleStrokeWidth ? chartStyle.scaleStrokeWidth(gridStyleBase.thickness, styleScaleInfo, { context: 'survival-grid', min: 0 }) : gridStyleBase.thickness
    });
    const gridStrokeAttrs = (gridControls && typeof gridControls.getStrokeAttributes === 'function')
      ? gridControls.getStrokeAttributes(gridStrokeStyle, { fallbackColor: DEFAULT_GRID_COLOR, fallbackThickness: axisStrokeWidth })
      : { stroke: DEFAULT_GRID_COLOR, 'stroke-width': axisStrokeWidth };
    const curveStrokeWidth = chartStyle.scaleStrokeWidth ? chartStyle.scaleStrokeWidth(2, styleScaleInfo, { context: 'survival-curve', min: 0.8 }) : 2;

    const axisMetrics = chartStyle.createAxisMetrics ? chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo) : { tickLength: 6, tickLabelGap: 6, axisTitleGap: 8, outerPadding: 8 };
    const tickLen = axisMetrics.tickLength ?? 6;
    const tickGap = axisMetrics.tickLabelGap ?? 6;
    const xLabelText = refs.xLabel?.value?.trim() || 'Time';
    const yLabelText = refs.yLabel?.value?.trim() || 'Survival Probability';
    const axisLabelFont = chartStyle.makeFont ? chartStyle.makeFont(fs) : `${fs}px sans-serif`;
    const yTitleWidthBase = chartStyle.measureText ? chartStyle.measureText(yLabelText, axisLabelFont) : fs * yLabelText.length * 0.6;

    ensureSurvivalLegendControlPlacement();
    const showLegend = !refs.showLegend || !!refs.showLegend.checked;
    logDebug('legend state resolved', { showLegend, groupCount: summary.series.length });
    const legendStrokeWidth = curveStrokeWidth;
    const groupsForDraw = summary.series.map((group, index) => {
      const color = state.labelColors[group.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      const configuredStrokeWidth = Number(state.labelStrokeWidth?.[group.name]);
      const configuredOpacity = Number(state.labelOpacity?.[group.name]);
      const configuredPattern = sanitizeSurvivalLinePattern(state.labelLinePattern?.[group.name] || 'solid');
      return {
        ...group,
        color,
        strokeWidth: Number.isFinite(configuredStrokeWidth) ? configuredStrokeWidth : curveStrokeWidth,
        strokeOpacity: Number.isFinite(configuredOpacity) ? Math.max(0, Math.min(1, configuredOpacity)) : 1,
        strokePattern: configuredPattern
      };
    });
    const legendEditable = typeof Shared.openColorPicker === 'function';
    const legendEntries = showLegend ? groupsForDraw.map(group => ({
      label: group.name,
      key: group.name,
      fill: group.color,
      stroke: group.color,
      strokeWidth: legendStrokeWidth,
      editable: legendEditable
    })) : [];
    const legendLayout = chartStyle.computeLegendLayout({
      entries: legendEntries,
      fontSize: fs,
      strokeWidth: legendStrokeWidth,
      onSwatchClick: legendEditable ? handleSurvivalLegendSwatchClick : undefined
    });
    const legendRenderer = legendLayout.renderer;
    const legendVisible = showLegend && legendRenderer.entries.length > 0;
    const legendWidth = legendVisible ? Math.ceil(legendLayout.legendWidthForMargin) : 0;

    const axisTickTools = chartStyle.axisTicks || null;
    const buildAxisScale = opts => {
      if(axisTickTools && typeof axisTickTools.buildScale === 'function'){
        return axisTickTools.buildScale(opts);
      }
      const min = Number.isFinite(opts?.manualMin) ? opts.manualMin : Number(opts?.dataMin) || 0;
      const max = Number.isFinite(opts?.manualMax) ? opts.manualMax : Number(opts?.dataMax) || min + 1;
      return { min, max, ticks: [min, max], step: Math.max((max - min) || 1, 1) };
    };

    const autoXMax = summary.maxTime > 0 ? summary.maxTime : 1;
    const manualXMax = Number.parseFloat(refs.timeMax?.value);
    let xMax = Number.isFinite(manualXMax) && manualXMax > 0 ? manualXMax : autoXMax;
    xMax = Math.max(xMax, autoXMax || 1);
    if(Shared.isDebugEnabled?.()){
      console.debug('Debug: survival x-axis max resolved', { autoXMax, manualXMax, xMax });
    }
    const xMin = 0;
    const yMin = 0;
    const yMax = 1;
    logDebug('axis range auto',{ yMin, yMax });

    const xTickTarget = chartStyle.estimateTickCount ? chartStyle.estimateTickCount(width, { axis: 'x', fallback: 6 }) : 6;
    const yTickTarget = chartStyle.estimateTickCount ? chartStyle.estimateTickCount(height, { axis: 'y', fallback: 6 }) : 6;

    const tickFont = chartStyle.makeFont ? chartStyle.makeFont(fs) : `${fs}px sans-serif`;
    let margin = chartStyle.computeBaseMargins ? chartStyle.computeBaseMargins({
      fontSize: fs,
      legendWidth,
      maxYLabelWidth: 0,
      yTitleWidth: yTitleWidthBase,
      axisMetrics
    }) : { top: fs * 3, right: legendWidth + 24, bottom: fs * 4, left: fs * 4 };
    let plotW = Math.max(20, width - margin.left - margin.right);
    let plotH = Math.max(20, height - margin.top - margin.bottom);
    let bottomLayout = chartStyle.computeBottomLayout ? chartStyle.computeBottomLayout({
      labels: [],
      fontSize: fs,
      plotWidth: plotW,
      baseBottom: margin.bottom,
      axisMetrics
    }) : { bottom: margin.bottom, shouldRotate: false, titleOffset: fs * 2, labelOffset: fs, tickLength: tickLen, tickLabelGap: tickGap };
    margin.bottom = bottomLayout.bottom;

    let xScale;
    let yScale;
    let xTickLabels = [];
    let yTickLabels = [];

    let maxYLabelWidth = 0;
    const manualIntervalX = getAxisTickInterval('x');
    const manualIntervalY = getAxisTickInterval('y');
    for(let pass = 0; pass < 2; pass += 1){
      plotW = Math.max(20, width - margin.left - margin.right);
      plotH = Math.max(20, height - margin.top - margin.bottom);
      xScale = buildAxisScale({
        dataMin: xMin,
        dataMax: xMax,
        manualMin: 0,
        manualMax: Number.isFinite(manualXMax) && manualXMax > 0 ? manualXMax : null,
        targetTickCount: xTickTarget
      });
      yScale = buildAxisScale({
        dataMin: yMin,
        dataMax: yMax,
        manualMin: 0,
        manualMax: 1,
        targetTickCount: yTickTarget
      });
      if(Number.isFinite(manualIntervalX) && manualIntervalX > 0){
        const manualX = buildManualTicks(xScale.min, xScale.max, manualIntervalX);
        if(manualX){
          xScale.min = manualX.min;
          xScale.max = manualX.max;
          xScale.ticks = manualX.ticks;
          xScale.step = manualIntervalX;
        }
      }
      if(Number.isFinite(manualIntervalY) && manualIntervalY > 0){
        const manualY = buildManualTicks(yScale.min, yScale.max, manualIntervalY);
        if(manualY){
          yScale.min = manualY.min;
          yScale.max = manualY.max;
          yScale.ticks = manualY.ticks;
          yScale.step = manualIntervalY;
        }
      }
      xTickLabels = xScale.ticks.map(value => formatNumber(value, 2));
      yTickLabels = yScale.ticks.map(value => formatNumber(value, 2));
      const yLabelWidths = yTickLabels.map(label => chartStyle.measureText ? chartStyle.measureText(label, tickFont) : label.length * fs * 0.6);
      maxYLabelWidth = yLabelWidths.length ? Math.max(...yLabelWidths) : 0;
      margin = chartStyle.computeBaseMargins ? chartStyle.computeBaseMargins({
        fontSize: fs,
        legendWidth,
        maxYLabelWidth,
        yTitleWidth: yTitleWidthBase,
        axisMetrics
      }) : margin;
      plotW = Math.max(20, width - margin.left - margin.right);
      plotH = Math.max(20, height - margin.top - margin.bottom);
      bottomLayout = chartStyle.computeBottomLayout ? chartStyle.computeBottomLayout({
        labels: xTickLabels,
        fontSize: fs,
        plotWidth: plotW,
        baseBottom: margin.bottom,
        axisMetrics
      }) : bottomLayout;
      margin.bottom = bottomLayout.bottom;
    }
    logDebug('tick targets finalized', { manualIntervalX, manualIntervalY, xTickCount: xScale?.ticks?.length, yTickCount: yScale?.ticks?.length });

    plotW = Math.max(20, width - margin.left - margin.right);
    plotH = Math.max(20, height - margin.top - margin.bottom);

    const x2px = value => {
      const span = xScale.max - xScale.min || 1;
      return margin.left + (plotW * (value - xScale.min) / span);
    };
    const y2px = value => {
      const span = yScale.max - yScale.min || 1;
      return margin.top + plotH - (plotH * (value - yScale.min) / span);
    };

    function add(tag, attrs, parent){
      const el = document.createElementNS(NS, tag);
      Object.entries(attrs || {}).forEach(([key, value]) => {
        if(value != null){
          el.setAttribute(key, String(value));
        }
      });
      (parent || svg).appendChild(el);
      return el;
    }

    const showGrid = !!refs.showGrid?.checked;
    const showFrame = !!refs.showFrame?.checked;

    if(showGrid){
      xScale.ticks.forEach(val => {
        const x = x2px(val);
        const gridLine = add('line', Object.assign({ x1: x, y1: margin.top, x2: x, y2: margin.top + plotH }, gridStrokeAttrs));
        gridLine.setAttribute('data-grid-control', '1');
      });
      yScale.ticks.forEach(val => {
        const y = y2px(val);
        const gridLine = add('line', Object.assign({ x1: margin.left, y1: y, x2: margin.left + plotW, y2: y }, gridStrokeAttrs));
        gridLine.setAttribute('data-grid-control', '1');
      });
    }

    const xAxisY = margin.top + plotH;
    const yAxisX = margin.left;
    const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
    const minorSubdivisionsX = getAxisMinorTickSubdivisions('x');
    const minorSubdivisionsY = getAxisMinorTickSubdivisions('y');
    const minorTicksX = getAxisMinorTicksEnabled('x')
      ? chartStyle.computeMinorTickPositions({
          majorTicks: xScale.ticks,
          min: Number.isFinite(xScale.min) ? xScale.min : 0,
          max: Number.isFinite(xScale.max) ? xScale.max : 1,
          scale: 'linear',
          subdivisions: minorSubdivisionsX
        })
      : [];
    const minorTicksY = getAxisMinorTicksEnabled('y')
      ? chartStyle.computeMinorTickPositions({
          majorTicks: yScale.ticks,
          min: Number.isFinite(yScale.min) ? yScale.min : 0,
          max: Number.isFinite(yScale.max) ? yScale.max : 1,
          scale: 'linear',
          subdivisions: minorSubdivisionsY
        })
      : [];
    const axisControlConfig = axis => ({
      axis,
      scopeId: 'survival',
      getTickInterval: () => getAxisTickInterval(axis),
      getThickness: () => getAxisStrokeWidthBase(),
      getColor: () => getAxisColor(),
      isTickIntervalEnabled: () => true,
      getTickIntervalDisabledMessage: () => 'Tick interval available for numeric axes.',
      tickPlaceholder: 'Auto',
      onTickIntervalChange: value => updateAxisTickInterval(axis, value),
      getMinorTicksEnabled: () => getAxisMinorTicksEnabled(axis),
      onMinorTicksChange: value => updateAxisMinorTicks(axis, value),
      isMinorTicksSupported: () => true,
      getMinorTickSubdivisions: () => getAxisMinorTickSubdivisions(axis),
      onMinorTickSubdivisionsChange: value => updateAxisMinorTickSubdivisions(axis, value),
      onThicknessChange: value => updateAxisStrokeWidth(value),
      onColorChange: value => updateAxisColor(value)
    });
    const xAxisLine = add('line', { x1: margin.left, y1: xAxisY, x2: margin.left + plotW, y2: xAxisY, stroke: axisStroke, 'stroke-width': axisStrokeWidth, 'stroke-linecap': 'square' });
    if(axisControls && typeof axisControls.registerAxisElement === 'function'){
      axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
    }
    const yAxisLine = add('line', { x1: yAxisX, y1: margin.top, x2: yAxisX, y2: margin.top + plotH, stroke: axisStroke, 'stroke-width': axisStrokeWidth, 'stroke-linecap': 'square' });
    if(axisControls && typeof axisControls.registerAxisElement === 'function'){
      axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
    }
    logDebug('axes stroke scaled',{ axisStrokeWidthBase, axisStrokeWidth, axisStroke });

    if(showFrame){
      logDebug('frame request',{ stroke: axisStroke, showFrame, axisStrokeWidth });
      chartStyle.drawPlotFrame?.({ svg, margin, plotW, plotH, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top', 'right'] });
    }

    const xTickNodes = [];
    if(minorTicksX.length){
      minorTicksX.forEach(value => {
        const x = x2px(value);
        add('line', {
          x1: x,
          y1: xAxisY,
          x2: x,
          y2: xAxisY + minorTickStyle.length,
          stroke: axisStroke,
          'stroke-width': minorTickStyle.strokeWidth,
          'stroke-linecap': 'round',
          opacity: minorTickStyle.opacity
        });
      });
    }
    xScale.ticks.forEach(value => {
      const x = x2px(value);
      add('line', { x1: x, y1: xAxisY, x2: x, y2: xAxisY + tickLen, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
      const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
      const text = add('text', {
        x,
        y: xAxisY + tickLen + tickGap + extra,
        'font-size': fs,
        'text-anchor': 'middle',
        fill: chartStyle.TEXT_COLOR || '#000'
      });
      Shared.applyTextBaseline && Shared.applyTextBaseline(text, 'hanging', fs);
      text.textContent = formatNumber(value, 2);
      markFontEditable(text, 'xTick');
      xTickNodes.push(text);
    });
    chartStyle.applyLabelOrientation?.(xTickNodes, { angle: -45, anchor: 'end', dy: '0.35em', force: bottomLayout.shouldRotate });

    if(minorTicksY.length){
      minorTicksY.forEach(value => {
        const y = y2px(value);
        add('line', {
          x1: yAxisX - minorTickStyle.length,
          y1: y,
          x2: yAxisX,
          y2: y,
          stroke: axisStroke,
          'stroke-width': minorTickStyle.strokeWidth,
          'stroke-linecap': 'round',
          opacity: minorTickStyle.opacity
        });
      });
    }
    yScale.ticks.forEach(value => {
      const y = y2px(value);
      add('line', { x1: yAxisX - tickLen, y1: y, x2: yAxisX, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
      const text = add('text', {
        x: yAxisX - (tickLen + tickGap),
        y,
        'font-size': fs,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        fill: chartStyle.TEXT_COLOR || '#000'
      });
      text.textContent = formatNumber(value, 2);
      markFontEditable(text, 'yTick');
    });

    const xTitleY = xAxisY + (bottomLayout.titleOffset || fs * 2);
    const defaultXLabelX = margin.left + plotW / 2;
    const defaultXLabelY = xTitleY;
    const xLabelPos = state.labelPositions?.xLabel;
    
    // Convert relative positions to absolute if needed for xLabel
    let absoluteXLabelX = defaultXLabelX;
    let absoluteXLabelY = defaultXLabelY;
    if (xLabelPos) {
      if (xLabelPos.relX !== undefined && xLabelPos.relY !== undefined) {
        // Use relative positioning
        absoluteXLabelX = margin.left + xLabelPos.relX * plotW;
        absoluteXLabelY = xAxisY + xLabelPos.relY * (plotH + margin.top);
      } else if (xLabelPos.x !== undefined && xLabelPos.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        absoluteXLabelX = xLabelPos.x;
        absoluteXLabelY = xLabelPos.y;
      }
    }
    
    const xTitle = add('text', {
      x: absoluteXLabelX,
      y: absoluteXLabelY,
      'font-size': fs,
      'text-anchor': 'middle',
      fill: chartStyle.TEXT_COLOR || '#000'
    });
    xTitle.textContent = xLabelText;
    markFontEditable(xTitle, 'xTitle', 'xTitle');
    // Enable drag for x-axis label
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(xTitle, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions for xLabel
          const relX = (pos.x - margin.left) / plotW;
          const relY = (pos.y - xAxisY) / (plotH + margin.top);
          state.labelPositions.xLabel = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
          logDebug('x-label position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }

    const yLabelOffsetSpan = (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
    const defaultYTitleX = margin.left - yLabelOffsetSpan;
    const defaultYTitleY = margin.top + plotH / 2;
    const yLabelPos = state.labelPositions?.yLabel;
    
    // Convert relative positions to absolute if needed for yLabel
    let yTitleX = defaultYTitleX;
    let yTitleY = defaultYTitleY;
    if (yLabelPos) {
      if (yLabelPos.relX !== undefined && yLabelPos.relY !== undefined) {
        // Use relative positioning
        yTitleX = margin.left + yLabelPos.relX * yLabelOffsetSpan;
        yTitleY = margin.top + yLabelPos.relY * plotH;
      } else if (yLabelPos.x !== undefined && yLabelPos.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        yTitleX = yLabelPos.x;
        yTitleY = yLabelPos.y;
      }
    }
    
    logDebug('y-axis title placement', { yTitleX, maxYLabelWidth }); // Debug: axis label alignment
    const yTitle = add('text', {
      x: yTitleX,
      y: yTitleY,
      transform: `rotate(-90 ${yTitleX} ${yTitleY})`,
      'font-size': fs,
      'text-anchor': 'middle',
      fill: chartStyle.TEXT_COLOR || '#000'
    });
    yTitle.textContent = yLabelText;
    markFontEditable(yTitle, 'yTitle', 'yTitle');
    // Enable drag for y-axis label
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(yTitle, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions for yLabel
          const relX = (pos.x - margin.left) / yLabelOffsetSpan;
          const relY = (pos.y - margin.top) / plotH;
          state.labelPositions.yLabel = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
          logDebug('y-label position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }

    const titleY = Math.max(fs * 1.6, margin.top * 0.5);
    const defaultTitleX = margin.left + plotW / 2;
    const defaultTitleY = titleY;
    const titlePos = state.labelPositions?.title;
    
    // Convert relative positions to absolute if needed
    let absoluteTitleX = defaultTitleX;
    let absoluteTitleY = defaultTitleY;
    if (titlePos) {
      if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
        // Use relative positioning
        absoluteTitleX = margin.left + titlePos.relX * plotW;
        absoluteTitleY = margin.top + titlePos.relY * plotH;
      } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        absoluteTitleX = titlePos.x;
        absoluteTitleY = titlePos.y;
      }
    }
    
    const titleText = add('text', {
      x: absoluteTitleX,
      y: absoluteTitleY,
      'font-size': fs,
      'text-anchor': 'middle',
      fill: chartStyle.TEXT_COLOR || '#000'
    });
    titleText.textContent = state.titleText != null ? String(state.titleText) : 'Survival curve';
    markFontEditable(titleText, 'graphTitle', 'graphTitle');
    const applySurvivalTitle = value => {
      const nextValue = value != null ? String(value) : '';
      state.titleText = nextValue;
      if(titleText.textContent !== nextValue){
        titleText.textContent = nextValue;
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };
    makeEditable(titleText, txt => {
      const previous = state.titleText != null ? String(state.titleText) : '';
      const nextValue = txt != null ? String(txt) : '';
      if(previous === nextValue){
        return;
      }
      applySurvivalTitle(nextValue);
      recordSurvivalChange('survival:title', previous, nextValue, applySurvivalTitle);
    });
    // Enable drag for title
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(titleText, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions
          const relX = (pos.x - margin.left) / plotW;
          const relY = (pos.y - margin.top) / plotH;
          state.labelPositions.title = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
          logDebug('title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }

    const showCI = !!refs.showCI?.checked;
    const showCensor = !!refs.showCensor?.checked;
    groupsForDraw.forEach(group => {
      const groupMaxTime = Number.isFinite(group.km?.maxTime) ? group.km.maxTime : xScale.max;
      if(Shared.isDebugEnabled?.() && Number.isFinite(groupMaxTime) && Number.isFinite(xScale.max) && groupMaxTime < xScale.max){
        console.debug('Debug: survival step extent clamped', { group: group.name, groupMaxTime, axisMax: xScale.max });
      }
      if(showCI){
        const ciPath = buildConfidencePath(group.km.upper, group.km.lower, groupMaxTime, x2px, y2px);
        if(ciPath){
          add('path', {
            d: ciPath,
            fill: group.color,
            'fill-opacity': 0.15,
            stroke: 'none'
          });
        }
      }
      const stepPath = buildStepPath(group.km.steps, groupMaxTime, x2px, y2px, pt => pt.survival ?? pt.value ?? 0);
      if(stepPath){
        const curveEl = add('path', {
          d: stepPath,
          fill: 'none',
          stroke: group.color,
          'stroke-width': group.strokeWidth,
          'stroke-opacity': group.strokeOpacity,
          'stroke-dasharray': survivalPatternToDasharray(group.strokePattern) || null,
          'stroke-linejoin': 'bevel',
          'data-group': group.name
        });
        try{ curveEl.style.cursor = 'pointer'; curveEl.addEventListener('click', evt=>{ try{ evt.stopPropagation(); }catch(e){} showSurvivalStrokeFormatControls(evt.currentTarget); }); }catch(e){}
      }
      if(showCensor && group.km.censor.length){
        const markerSize = Math.max(4, fs * 0.6);
        group.km.censor.forEach(marker => {
          const x = x2px(marker.time);
          const y = y2px(marker.survival);
          add('line', {
            x1: x - markerSize / 2,
            y1: y,
            x2: x + markerSize / 2,
            y2: y,
            stroke: group.color,
            'stroke-width': axisStrokeWidth
          });
          add('line', {
            x1: x,
            y1: y - markerSize / 2,
            x2: x,
            y2: y + markerSize / 2,
            stroke: group.color,
            'stroke-width': axisStrokeWidth
          });
        });
      }
    });

    if(legendVisible){
      const legendGapPx = Number.isFinite(legendLayout.legendGapPx) ? legendLayout.legendGapPx : 12;
      const defaultLegendX = margin.left + plotW + legendGapPx;
      const defaultLegendY = margin.top + (legendRenderer.baselineOffset || 0);
      const legendGroup = drawSurvivalLegend(svg, legendLayout, { x: defaultLegendX, y: defaultLegendY }, { width: width, height: height });
      if(!legendGroup){
        logDebug('legend draw skipped', { reason: 'render-failed', legendVisible, entryCount: legendRenderer.entries.length });
      }
    }else{
      logDebug('legend skipped', { showLegend, entryCount: legendRenderer.entries.length });
    }

    updateStats({ ...summary, series: groupsForDraw });
    registerSurvivalGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
    autoResizeSvgHelper(svg);
    state.layout?.syncPanels?.({ skipSchedule: true });
    logDebug('draw complete', { debugStamp });
  }

  function updateStats(summary){
    if(!refs.statsSummary || !refs.statsLogRank){
      return;
    }
    if(!summary.series.length){
      renderStatsLead(refs.statsSummary, 'Enter at least one group with time and event values to compute statistics.');
      renderStatsLead(refs.statsLogRank, 'Log-rank test results will appear after statistics are calculated.');
      if(refs.statsHazardRatios) refs.statsHazardRatios.innerHTML = '';
      if(refs.statsCox) refs.statsCox.innerHTML = '';
      state.lastStats = null;
      return;
    }

    renderSurvivalGroupSummary(summary);
    renderSurvivalLogRank(summary);
    renderSurvivalHazardRatios(summary);
    renderSurvivalCoxModel(summary);
    const statsPayload = {
      groups: summary.series.map(group => ({
        name: group.name,
        total: group.total,
        events: group.events,
        censored: group.censored,
        median: group.km?.median ?? null,
        color: group.color || null
      })),
      logRank: summary.logRank,
      hazardRatios: summary.hazardRatios,
      coxModel: summary.coxModel,
      flags: summary.flags
    };
    state.lastStats = statsPayload;
    if(refs.statsCox && Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
      const logRankText = summary.logRank?.available
        ? `Log-rank χ²(${summary.logRank.df ?? 'n/a'}) = ${formatNumber(summary.logRank.chi2, 3)}, p = ${formatP(summary.logRank.p)}.`
        : (summary.logRank?.message || 'Log-rank test unavailable.');
      const hazardText = summary.hazardRatios?.available && Array.isArray(summary.hazardRatios.rows)
        ? `${summary.hazardRatios.rows.length} hazard-ratio comparison(s) were available.`
        : null;
      const coxText = summary.coxModel?.available && Array.isArray(summary.coxModel.coefficients)
        ? `${summary.coxModel.coefficients.length} Cox coefficient estimate(s) were reported.`
        : null;
      Shared.statsReporting.appendReportPanel(refs.statsCox, {
        methodsText: `Kaplan–Meier group summaries were generated for ${summary.series.length} group(s). ${summary.flags?.hazardRatiosEnabled ? 'Pairwise hazard ratios were requested.' : 'Pairwise hazard ratios were not requested.'} ${summary.flags?.coxEnabled ? 'A Cox proportional-hazards model was fit when estimable.' : 'Cox modelling was disabled.'}`,
        resultsText: [
          `${summary.series.length} group(s) contributed survival data.`,
          logRankText,
          hazardText,
          coxText
        ].filter(Boolean).join(' '),
        analysisSpec: {
          component: 'survival',
          groupCount: summary.series.length,
          showHazardRatios: !!summary.flags?.hazardRatiosEnabled,
          fitCox: !!summary.flags?.coxEnabled,
          hazardRatioRows: Array.isArray(summary.hazardRatios?.rows) ? summary.hazardRatios.rows.length : 0,
          coxCoefficientCount: Array.isArray(summary.coxModel?.coefficients) ? summary.coxModel.coefficients.length : 0,
          logRankAvailable: !!summary.logRank?.available,
          covariates: getSelectedCovariates(summary.covariateColumns),
          availableCovariates: Array.isArray(summary.covariateColumns) ? summary.covariateColumns.slice() : [],
          supportsTimeDependent: !!summary.supportsTimeDependent
        }
      }, { title: 'Reporting and reproducibility' });
    }
    logDebug('statistics updated', {
      groupCount: summary.series.length,
      logRank: summary.logRank,
      hazardRatiosAvailable: summary.hazardRatios?.available,
      coxAvailable: summary.coxModel?.available
    });
  }

  function renderSurvivalGroupSummary(summary){
    if(!refs.statsSummary){
      return;
    }
    if(!summary.series.length){
      renderStatsLead(refs.statsSummary, 'Enter at least one group with time and event values to compute statistics.');
      return;
    }
    const rows = summary.series.map(group => ({
      group: group.name || '(unnamed)',
      total: Number.isFinite(group.total) ? String(group.total) : String(group.total ?? '0'),
      events: Number.isFinite(group.events) ? String(group.events) : String(group.events ?? '0'),
      censored: Number.isFinite(group.censored) ? String(group.censored) : String(group.censored ?? '0'),
      median: Number.isFinite(group.km?.median) ? formatNumber(group.km.median, 2) : 'Not reached'
    }));
    const footnotes = [
      'Counts and medians derive from the filtered grid input.',
      '"Not reached" indicates survival remained above 50% at the final timepoint.'
    ];
    renderStatsTableCard(refs.statsSummary, {
      caption: 'Group Summary',
      columns: [
        { key: 'group', label: 'Group', align: 'left' },
        { key: 'total', label: 'N', align: 'right' },
        { key: 'events', label: 'Events', align: 'right' },
        { key: 'censored', label: 'Censored', align: 'right' },
        { key: 'median', label: 'Median survival', align: 'right' }
      ],
      rows,
      footnotes,
      options: {
        fileName: 'survival-group-summary',
        contextLabel: 'survival-group-summary'
      }
    });
  }

  function renderSurvivalLogRank(summary){
    if(!refs.statsLogRank){
      return;
    }
    if(summary.logRank?.available){
      const rows = [{
        test: 'Log-rank',
        statistic: formatNumber(summary.logRank.chi2, 3),
        df: Number.isFinite(summary.logRank.df) ? String(summary.logRank.df) : 'n/a',
        p: formatP(summary.logRank.p)
      }];
      renderStatsTableCard(refs.statsLogRank, {
        caption: 'Log-rank Test',
        columns: [
          { key: 'test', label: 'Test', align: 'left' },
          { key: 'statistic', label: 'Statistic', align: 'right' },
          { key: 'df', label: 'df', align: 'right' },
          { key: 'p', label: 'p value', align: 'right' }
        ],
        rows,
        footnotes: ['H0: survival curves are identical across groups.'],
        options: {
          fileName: 'survival-log-rank',
          contextLabel: 'survival-log-rank'
        }
      });
      return;
    }
    renderStatsLead(refs.statsLogRank, summary.logRank?.message || 'Log-rank test unavailable.');
  }

  function renderSurvivalHazardRatios(summary){
    if(!refs.statsHazardRatios){
      return;
    }
    if(!summary.flags?.hazardRatiosEnabled){
      renderStatsLead(refs.statsHazardRatios, 'Enable "Show Hazard Ratios" above to compute pairwise comparisons.');
      return;
    }
    if(!(summary.hazardRatios?.available) || !Array.isArray(summary.hazardRatios.rows) || !summary.hazardRatios.rows.length){
      renderStatsLead(refs.statsHazardRatios, summary.hazardRatios?.message || 'Hazard ratios unavailable.');
      return;
    }
    const rows = summary.hazardRatios.rows.map(row => ({
      comparison: `${row.groupB} vs ${row.groupA}`,
      hazardRatio: formatNumber(row.hazardRatio, 3),
      ci: formatInterval(row.ciLow, row.ciHigh),
      z: Number.isFinite(row.z) ? formatNumber(row.z, 3) : 'n/a',
      p: formatP(row.p)
    }));
    renderStatsTableCard(refs.statsHazardRatios, {
      caption: 'Hazard Ratios',
      columns: [
        { key: 'comparison', label: 'Comparison', align: 'left' },
        { key: 'hazardRatio', label: 'Hazard Ratio', align: 'right' },
        { key: 'ci', label: '95% CI', align: 'right' },
        { key: 'z', label: 'z', align: 'right' },
        { key: 'p', label: 'p value', align: 'right' }
      ],
      rows,
      footnotes: [
        'Ratios > 1 indicate increased hazard for the numerator group.',
        'Confidence intervals derive from the Cox variance–covariance matrix.'
      ],
      options: {
        fileName: 'survival-hazard-ratios',
        contextLabel: 'survival-hazard-ratios'
      }
    });
    logDebug('hazard ratio stats rendered', { rowCount: rows.length });
  }

  function renderSurvivalCoxModel(summary){
    if(!refs.statsCox){
      return;
    }
    if(!summary.flags?.coxEnabled){
      renderStatsLead(refs.statsCox, 'Enable "Fit Cox Model" above to review coefficient estimates.');
      return;
    }
    if(!(summary.coxModel?.available) || !Array.isArray(summary.coxModel.coefficients) || !summary.coxModel.coefficients.length){
      renderStatsLead(refs.statsCox, summary.coxModel?.message || 'Cox model unavailable.');
      return;
    }
    const rows = summary.coxModel.coefficients.map(coef => ({
      predictor: coef.label || coef.group || '',
      type: coef.type === 'group' ? 'Group' : (coef.type === 'time' ? 'Time-dependent' : 'Baseline'),
      beta: formatNumber(coef.beta, 3),
      hazardRatio: formatNumber(coef.hazardRatio, 3),
      ci: formatInterval(coef.ciLow, coef.ciHigh),
      z: Number.isFinite(coef.z) ? formatNumber(coef.z, 3) : 'n/a',
      p: formatP(coef.p)
    }));
    const diag = summary.coxModel.diagnostics || {};
    const lr = diag.likelihoodRatio || {};
    const footnotes = [
      `Baseline group: ${summary.coxModel.baselineGroup || 'Reference'}`,
      `Log-likelihood = ${formatNumber(diag.logLikelihood, 3)} | Null = ${formatNumber(diag.logLikelihoodNull, 3)}`,
      `Likelihood ratio χ²(${lr.df ?? 'n/a'}) = ${formatNumber(lr.statistic, 3)}, p = ${formatP(lr.p)}`,
      `AIC = ${formatNumber(diag.aic, 3)} | BIC = ${formatNumber(diag.bic, 3)}`,
      `Iterations = ${diag.iterations ?? 'n/a'} | Converged: ${diag.converged ? 'Yes' : 'No'}`
    ].filter(Boolean);
    renderStatsTableCard(refs.statsCox, {
      caption: 'Cox Model Coefficients',
      columns: [
        { key: 'predictor', label: 'Predictor', align: 'left' },
        { key: 'type', label: 'Type', align: 'left' },
        { key: 'beta', label: 'β', align: 'right' },
        { key: 'hazardRatio', label: 'Hazard Ratio', align: 'right' },
        { key: 'ci', label: '95% CI', align: 'right' },
        { key: 'z', label: 'z', align: 'right' },
        { key: 'p', label: 'p value', align: 'right' }
      ],
      rows,
      footnotes,
      options: {
        fileName: 'survival-cox-model',
        contextLabel: 'survival-cox-model'
      }
    });
    logDebug('cox stats rendered', {
      rowCount: rows.length,
      baseline: summary.coxModel.baselineGroup
    });
  }

  function getGraphPayload(){
    if(!state.hot){
      console.debug('Debug: survival.getPayload skipped - no table instance');
      return null;
    }
    const axisSettings = ensureAxisSettings();
    const noteControl = notesState.control || null;
    const notesText = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : (notesState.text || '');
    const notesOpen = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : !!notesState.open;
    notesState.text = notesText;
    notesState.open = notesOpen;
    const payload = {
      type: 'survival',
      data: state.hot.getData(),
      exclusions: state.hot?.exportExclusions?.() || Shared.hot.exportExclusions(state.hot),
      config: {
        labelColors: state.labelColors,
        labelStrokeWidth: state.labelStrokeWidth,
        labelOpacity: state.labelOpacity,
        labelLinePattern: state.labelLinePattern,
        showCI: !!refs.showCI?.checked,
        showCensor: !!refs.showCensor?.checked,
        showHazardRatios: !!refs.showHazardRatios?.checked,
        fitCoxModel: !!refs.fitCoxModel?.checked,
        showGrid: !!refs.showGrid?.checked,
        gridStyle: getGridStyle(axisSettings.strokeWidth),
        showFrame: !!refs.showFrame?.checked,
        showLegend: refs.showLegend ? !!refs.showLegend.checked : true,
        timeMax: refs.timeMax?.value || '',
        fontSize: refs.fontSize?.value || '13',
        fontStyles: (exportFontStyles('survival') || undefined),
        xLabel: refs.xLabel?.value || '',
        yLabel: refs.yLabel?.value || '',
        title: state.titleText,
        covariateSettings: state.covariateSettings,
        axis: {
          strokeWidth: axisSettings.strokeWidth,
          color: axisSettings.color,
          tickIntervalX: axisSettings.x?.tickInterval ?? null,
          tickIntervalY: axisSettings.y?.tickInterval ?? null,
          minorTicksX: axisSettings.x?.minorTicks ?? false,
          minorTicksY: axisSettings.y?.minorTicks ?? false,
          minorTickSubdivisionsX: clampMinorTickSubdivisions(axisSettings.x?.minorTickSubdivisions),
          minorTickSubdivisionsY: clampMinorTickSubdivisions(axisSettings.y?.minorTickSubdivisions)
        },
        notes: {
          text: notesText,
          open: notesOpen
        },
        labelPositions: state.labelPositions || null
      },
      stats: state.lastStats || null
    };
    console.debug('Debug: survival.getPayload captured state', {
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      showCI: payload.config.showCI,
      hazardRatios: payload.config.showHazardRatios,
      fitCoxModel: payload.config.fitCoxModel,
      hasStats: !!payload.stats,
      covariateSettingKeys: Object.keys(state.covariateSettings || {})
    });
    return payload;
  }
  survival.getPayload = getGraphPayload;
  survival.captureEmptyPayloadTemplate = function captureSurvivalEmptyPayloadTemplate(){
    ensureEmptyPayloadTemplate();
    const snapshot = cloneSimple(emptyPayloadTemplate);
    console.debug('Debug: survival empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  survival.restoreEmptyPayloadTemplate = function restoreSurvivalEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: survival empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    console.debug('Debug: survival empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  survival.createEmptyPayload = function createEmptySurvivalPayload(){
    survival.ensure();
    ensureEmptyPayloadTemplate();
    const payload = cloneSimple(emptyPayloadTemplate) || { type: 'survival', config: {} };
    payload.type = 'survival';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, SURVIVAL_DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(SURVIVAL_DEFAULT_COLS).fill(''));
    payload.data = emptyData;
    payload.exclusions = [];
    payload.stats = null;
    return payload;
  };

  function applySurvivalPayload(payload, meta){
    const source = meta?.source || 'unknown';
    if(!payload || payload.type !== 'survival'){
      logDebug('payload rejected', { source, hasType: !!payload?.type });
      return false;
    }
    const skipDraw = meta?.skipDraw === true;
    let scheduleBackup = null;
    if(skipDraw && typeof state.scheduleDraw === 'function'){
      scheduleBackup = state.scheduleDraw;
      state.scheduleDraw = () => {};
    }
    if(Array.isArray(payload.data) && state.hot){
      state.hot.loadData(payload.data);
      if(payload.exclusions){
        state.hot.applyExclusions?.(payload.exclusions);
      }
    }
    applyConfig(payload.config);
    state.lastStats = payload.stats || null;
    if(!payload.stats){
      renderStatsLead(refs.statsSummary, 'Enter at least one group with time and event values to compute statistics.');
      renderStatsLead(refs.statsLogRank, 'Log-rank test results will appear after statistics are calculated.');
      if(refs.statsHazardRatios){
        renderStatsLead(refs.statsHazardRatios, 'Enable "Show Hazard Ratios" above to compute pairwise comparisons.');
      }
      if(refs.statsCox){
        renderStatsLead(refs.statsCox, 'Enable "Fit Cox Model" above to review coefficient estimates.');
      }
    }
    if(!skipDraw && typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
    if(scheduleBackup){
      state.scheduleDraw = scheduleBackup;
    }
    logDebug('payload applied', { source, rows: payload.data?.length || 0, hasStats: !!payload.stats });
    return true;
  }

  function applyConfig(config){
    if(!config){
      return;
    }
    if(config.notes && typeof config.notes === 'object'){
      notesState.text = config.notes.text == null ? '' : String(config.notes.text);
      notesState.open = !!config.notes.open;
    }else if(typeof config.notes === 'string'){
      notesState.text = config.notes;
      notesState.open = !!notesState.open;
    }else{
      notesState.text = '';
      notesState.open = false;
    }
    if(notesState.control){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    state.labelColors = Object.assign({}, config.labelColors || {});
    state.labelStrokeWidth = Object.assign({}, config.labelStrokeWidth || {});
    state.labelOpacity = Object.assign({}, config.labelOpacity || {});
    state.labelLinePattern = Object.assign({}, config.labelLinePattern || {});
    if(config.covariateSettings && typeof config.covariateSettings === 'object'){
      state.covariateSettings = Object.assign({}, config.covariateSettings);
      logDebug('covariate settings restored', { keys: Object.keys(state.covariateSettings) });
    } else {
      if(Object.keys(state.covariateSettings || {}).length){
        logDebug('covariate settings reset due to missing config (legacy payload)');
      }
      state.covariateSettings = {};
    }
    if(refs.showCI) refs.showCI.checked = !!config.showCI;
    if(refs.showCensor) refs.showCensor.checked = !!config.showCensor;
    if(refs.showHazardRatios) refs.showHazardRatios.checked = config.showHazardRatios !== false;
    if(refs.fitCoxModel) refs.fitCoxModel.checked = config.fitCoxModel !== false;
    if(refs.showGrid) refs.showGrid.checked = !!config.showGrid;
    setGridStyle(config.gridStyle, config.axis?.strokeWidth);
    if(refs.showFrame) refs.showFrame.checked = !!config.showFrame;
    if(refs.showLegend){
      refs.showLegend.checked = config.showLegend !== false;
      ensureSurvivalLegendControlPlacement();
    }
    if(refs.timeMax) refs.timeMax.value = config.timeMax || '';
    if(refs.fontSize) refs.fontSize.value = config.fontSize || '13';
    if(refs.fontSize && refs.fontSize.dataset){
      refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      logDebug('font size base restored', { value: refs.fontSize.value });
    }
    importFontStyles('survival', config.fontStyles || null);
    if(refs.fontSizeVal){
      chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: Number(refs.fontSize?.value), input: refs.fontSize, manual: true });
    }
    if(refs.xLabel) refs.xLabel.value = config.xLabel || 'Time';
    if(refs.yLabel) refs.yLabel.value = config.yLabel || 'Survival Probability';
    if(config.title !== undefined){
      state.titleText = config.title != null ? String(config.title) : '';
    }else if(state.titleText == null){
      state.titleText = 'Survival curve';
    }
    // Restore label positions if saved
    if(config.labelPositions){
      state.labelPositions = {
        title: config.labelPositions.title || null,
        xLabel: config.labelPositions.xLabel || null,
        yLabel: config.labelPositions.yLabel || null,
        legend: config.labelPositions.legend || null
      };
    } else if(!state.labelPositions || typeof state.labelPositions !== 'object'){
      state.labelPositions = { title: null, xLabel: null, yLabel: null, legend: null };
    } else if(!('legend' in state.labelPositions)){
      state.labelPositions.legend = null;
    }
    applyAxisSettings(config.axis || config.axisSettings);
    refreshCovariateControls();
    renderSurvivalStatsAdvisor(state.lastSummary || {
      series: [],
      covariateColumns: state.covariateColumns || [],
      logRank: { available: false }
    });
    logDebug('config applied', config);
  }

  function loadFromFile(file){
    const apply = payload => applySurvivalPayload(payload, { source: 'file' });
    if(file instanceof Blob){
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const parsed = JSON.parse(event.target.result);
          if(!apply(parsed)){
            logDebug('payload rejected from file', { source: 'file', hasType: !!parsed?.type });
          }
        } catch (error){
          console.error('Failed to load survival graph', error);
        }
      };
      reader.readAsText(file);
      return;
    }
    if(typeof file === 'string'){
      try {
        const parsed = JSON.parse(file);
        if(!apply(parsed)){
          logDebug('payload rejected from string', { source: 'string' });
        }
      } catch (error){
        console.error('Failed to load survival graph from string', error);
      }
      return;
    }
    if(file && typeof file === 'object'){
      apply(file);
    }
  }
  survival.loadFromFile = loadFromFile;
  survival.loadFromPayload = function loadFromPayload(payload, options = {}){
    if(!applySurvivalPayload(payload, { source: 'payload', ...options })){
      logDebug('payload rejected from Main payload', { source: 'payload' });
    }
  };

  async function saveFile(){
    const payload = getGraphPayload();
    if(!payload){
      return;
    }
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('saveSurvivalFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'survival',
      fileHandle: state.fileHandle,
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    logDebug('save result', { success: !!result, hasHandle: !!state.fileHandle });
  }

  async function saveFileAs(){
    const payload = getGraphPayload();
    if(!payload){
      return;
    }
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('saveAsSurvivalFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'survival',
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    logDebug('saveAs result', { success: !!result, fileName: state.fileName });
  }

  async function openFile(){
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('openSurvivalFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'survival',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: file => loadFromFile(file),
      triggerInput: () => {
        if(refs.graphFileInput){
          refs.graphFileInput.value = '';
          refs.graphFileInput.click();
        }
      }
    });
    logDebug('open result', { success: !!result });
  }

  function initControls(){
    const schedule = () => {
      if(state.scheduleDraw){
        state.scheduleDraw();
      }
    };
    [refs.showCI, refs.showCensor, refs.showGrid, refs.showHazardRatios, refs.fitCoxModel].forEach(control => {
      control?.addEventListener('change', () => {
        console.debug('Debug: survival control toggle', { id: control.id, checked: control.checked });
        logDebug('control toggled', { id: control.id, checked: control.checked });
        if(control === refs.showHazardRatios || control === refs.fitCoxModel){
          refreshCovariateControls();
        }
        renderSurvivalStatsAdvisor(state.lastSummary || { series: [], covariateColumns: state.covariateColumns, supportsTimeDependent: detectTimeDependentSupport(state.hot?.getData?.() || []) });
        schedule();
      });
    });
    refs.showFrame?.addEventListener('change', () => {
      console.debug('Debug: survival control toggle', { id: refs.showFrame.id, checked: refs.showFrame.checked });
      logDebug('control toggled', { id: refs.showFrame.id, checked: refs.showFrame.checked });
      renderSurvivalStatsAdvisor(state.lastSummary || { series: [], covariateColumns: state.covariateColumns, supportsTimeDependent: detectTimeDependentSupport(state.hot?.getData?.() || []) });
      schedule();
    });
    refs.showLegend?.addEventListener('change', () => {
      console.debug('Debug: survival control toggle', { id: refs.showLegend.id, checked: refs.showLegend.checked });
      logDebug('control toggled', { id: refs.showLegend.id, checked: refs.showLegend.checked });
      ensureSurvivalLegendControlPlacement();
      schedule();
    });
    [refs.timeMax, refs.xLabel, refs.yLabel].forEach(input => {
      input?.addEventListener('input', () => {
        logDebug('control input', { id: input.id, value: input.value });
        schedule();
      });
    });
    refs.fontSize?.addEventListener('input', () => {
      if(refs.fontSize?.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        logDebug('font size base updated', { value: refs.fontSize.value });
      }
      chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
      logDebug('font size input', { value: refs.fontSize.value });
      schedule();
    });
    if(refs.fontSize?.dataset){
      refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      logDebug('font size base initialized', { value: refs.fontSize.value });
    }
    chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: Number(refs.fontSize?.value), input: refs.fontSize, manual: true });
  }

  function initNotes(){
    const stack = global.document.querySelector('#survivalGraphPanel .diagram-area')
      || global.document.querySelector('#survivalGraphPanel');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        logDebug('notes mount skipped', { reason: 'missing-stack' });
      }
      return;
    }
    const helper = Shared.notes;
    if(!helper || typeof helper.mountFoldable !== 'function'){
      console.warn('survival notes helper unavailable', { hasSharedNotes: !!helper });
      return;
    }
    if(notesState.control?.root && notesState.control.root.isConnected){
      notesState.control.setValue(notesState.text || '');
      notesState.control.setOpen(!!notesState.open);
      return;
    }
    notesState.control = helper.mountFoldable({
      container: stack,
      id: 'survival-notes',
      title: 'Notes',
      placeholder: 'Write notes about the data being analyzed...',
      richText: true,
      scopeId: 'survival',
      fontKey: 'notes',
      value: notesState.text || '',
      open: !!notesState.open,
      onChange: value => {
        notesState.text = value == null ? '' : String(value);
      },
      onToggle: open => {
        notesState.open = !!open;
      }
    });
  }

  function initExampleAndImport(){
    const example = [
      ['Control', 1.2, 1],
      ['Control', 2.5, 1],
      ['Control', 3.4, 0],
      ['Control', 4.8, 1],
      ['Control', 6.1, 0],
      ['Control', 7.9, 1],
      ['Treatment', 0.8, 1],
      ['Treatment', 1.6, 0],
      ['Treatment', 2.9, 1],
      ['Treatment', 4.2, 1],
      ['Treatment', 5.5, 0],
      ['Treatment', 6.7, 1],
      ['Treatment', 8.4, 0]
    ];
    refs.loadExampleBtn?.addEventListener('click', () => {
      if(state.hot){
        state.hot.loadData(example, {
          source: 'example-load',
          recordUndo: true,
          undoLabel: 'table:survival:example-load'
        });
      }
      logDebug('example loaded', { rows: example.length, firstRow: example[0] });
      if(state.scheduleDraw){
        state.scheduleDraw();
      }
    });
    refs.importBtn?.addEventListener('click', () => {
      if(refs.fileInput){
        refs.fileInput.value = '';
        refs.fileInput.click();
      }
    });
    refs.fileInput?.addEventListener('change', () => {
      if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
        console.warn('Survival import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      Shared.tableImport.openFile(refs.fileInput, {
        hot: state.hot,
        minCols: SURVIVAL_DEFAULT_COLS,
        minRows: DEFAULT_ROWS,
        scheduleDraw: state.scheduleDraw,
        debugLabel: 'survival',
        onProcessed: info => logDebug('import processed', info)
      });
    });
  }

  function initExportsAndFiles(){
    if(Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function'){
      Shared.exporter.mountSvgControls({
        container: '#survivalExportControls',
        svgSelector: '#survivalSvg',
        fileName: 'survival',
        contextLabel: 'survival-export'
      });
      logDebug('export controls mounted', { hasExporter: true });
    } else {
      logDebug('export controls unavailable', { hasExporter: !!Shared.exporter });
    }
    refs.saveBtn?.addEventListener('click', () => { void saveFile(); });
    refs.saveAsBtn?.addEventListener('click', () => { void saveFileAs(); });
    refs.openBtn?.addEventListener('click', () => { void openFile(); });
    refs.graphFileInput?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if(file){
        state.fileName = file.name;
        state.fileHandle = null;
        loadFromFile(file);
      }
    });
  }

  function init(){
    if(survival.ready){
      return;
    }
    if(!ensureElements()){
      console.warn('Survival component init skipped: required elements missing');
      return;
    }
    state.scheduleDraw = Shared.debounceFrame ? Shared.debounceFrame(() => drawSurvival()) : (() => drawSurvival());
    logDebug('scheduleDraw configured', { hasDebounce: typeof Shared.debounceFrame === 'function' });
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'survival',
        selectors: {
          tablePanel: '#survivalTablePanel',
          graphPanel: '#survivalGraphPanel',
          panelResizer: '#survivalPanelResizer',
          hotWrapper: '#survivalHotWrapper',
          hotContainer: '#survivalHot',
          svgBox: () => refs.graphPanel?.querySelector('.svgbox'),
          resizeTarget: () => refs.graphPanel?.querySelector('.svgbox')
        },
        scheduleDraw: state.scheduleDraw,
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        logDebug('layout onMinSvgWidth', { value: state.minSvgWidth });
      }
    });
    if(state.layout?.elements?.svgBox){
      refs.svgBox = state.layout.elements.svgBox;
      ensureSurvivalLegendControlPlacement();
    }
    const scheduleLegendPlacement = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(() => ensureSurvivalLegendControlPlacement())
      : null;
    if(scheduleLegendPlacement){
      scheduleLegendPlacement();
    }else if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(() => ensureSurvivalLegendControlPlacement());
    }
    initHot();
    initControls();
    initNotes();
    initExampleAndImport();
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    state.layout?.syncPanels?.();
    initExportsAndFiles();
    renderSurvivalStatsAdvisor({
      series: [],
      covariateColumns: state.covariateColumns || [],
      logRank: { available: false }
    });
    ensureEmptyPayloadTemplate();
    survival.ready = true;
    state.scheduleDraw?.();
    logDebug('component initialized', { ready: survival.ready });
    global.scheduleDrawSurvival = () => state.scheduleDraw?.();
  }

  survival.init = init;
  survival.ensure = function ensure(){
    if(!survival.ready){
      init();
    }
  };
  survival.prepareForTab = function prepareForTab(){
    if(!survival.ready){
      init();
      return;
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      state.ensureHotForActiveTab();
    }
  };

  function detachChildren(node){
    if(!node){ return null; }
    const doc = node.ownerDocument || global.document;
    const fragment = doc?.createDocumentFragment ? doc.createDocumentFragment() : null;
    if(!fragment){ return null; }
    let count = 0;
    while(node.firstChild){
      fragment.appendChild(node.firstChild);
      count += 1;
    }
    return { fragment, count };
  }

  function restoreChildren(node, payload){
    if(!node || !payload || !payload.fragment){ return false; }
    while(node.firstChild){
      node.removeChild(node.firstChild);
    }
    node.appendChild(payload.fragment);
    return true;
  }

  survival.captureRenderCache = function captureRenderCache(){
    const plot = document.getElementById('survivalPlot');
    const summary = document.getElementById('survivalStatsSummary');
    const logRank = document.getElementById('survivalStatsLogRank');
    const hazard = document.getElementById('survivalStatsHazardRatios');
    const cox = document.getElementById('survivalStatsCox');
    const plotCache = detachChildren(plot);
    const summaryCache = detachChildren(summary);
    const logRankCache = detachChildren(logRank);
    const hazardCache = detachChildren(hazard);
    const coxCache = detachChildren(cox);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: survival render cache captured', {
        plotNodes: plotCache?.count || 0,
        summaryNodes: summaryCache?.count || 0,
        logRankNodes: logRankCache?.count || 0,
        hazardNodes: hazardCache?.count || 0,
        coxNodes: coxCache?.count || 0
      });
    }
    return {
      plot: plotCache,
      summary: summaryCache,
      logRank: logRankCache,
      hazard: hazardCache,
      cox: coxCache
    };
  };

  survival.restoreRenderCache = function restoreRenderCache(cache){
    if(!cache){ return false; }
    const plot = document.getElementById('survivalPlot');
    const summary = document.getElementById('survivalStatsSummary');
    const logRank = document.getElementById('survivalStatsLogRank');
    const hazard = document.getElementById('survivalStatsHazardRatios');
    const cox = document.getElementById('survivalStatsCox');
    const restoredPlot = restoreChildren(plot, cache.plot);
    const restoredSummary = restoreChildren(summary, cache.summary);
    const restoredLogRank = restoreChildren(logRank, cache.logRank);
    const restoredHazard = restoreChildren(hazard, cache.hazard);
    const restoredCox = restoreChildren(cox, cache.cox);
    const restored = restoredPlot || restoredSummary || restoredLogRank || restoredHazard || restoredCox;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: survival render cache restored', {
        restored,
        plot: restoredPlot,
        summary: restoredSummary,
        logRank: restoredLogRank,
        hazard: restoredHazard,
        cox: restoredCox
      });
    }
    return restored;
  };
  survival.draw = drawSurvival;
  survival.__getState = function(){
    console.debug('Debug: survival.__getState invoked');
    return state;
  };
  survival.__testHooks = Object.assign({}, survival.__testHooks, {
    collectSeries: () => collectSeries(),
    prepareCoxData: summary => prepareCoxData(summary),
    evaluateCoxAt: (beta, prepared) => evaluateCoxAt(beta, prepared)
  });
})(window);
