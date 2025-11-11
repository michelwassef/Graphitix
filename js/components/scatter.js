(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const scatter = Components.scatter = Components.scatter || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const exportFontStyles = scopeId => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId)
    : null;
  const importFontStyles = (scopeId, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true });
    }
  };
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const formControls = Shared.formControls = Shared.formControls || {};
  const plot3d = Shared.plot3d = Shared.plot3d || {};
  if(typeof plot3d.createRotationState !== 'function' && typeof require === 'function'){
    try {
      require('../shared/plot3d.js');
    }catch(err){
      console.debug('Debug: scatter component plot3d helper require failed', { message: err?.message || String(err) });
    }
  }
  if(typeof plot3d.createRotationState !== 'function'){
    plot3d.createRotationState = (defaults) => ({
      x: Number.isFinite(defaults?.x) ? defaults.x : 0,
      y: Number.isFinite(defaults?.y) ? defaults.y : 0,
      z: Number.isFinite(defaults?.z) ? defaults.z : 0,
      quaternion: null
    });
  }
  if(typeof plot3d.rotatePoint !== 'function'){
    plot3d.rotatePoint = (pt) => ({ x: Number(pt?.x) || 0, y: Number(pt?.y) || 0, z: Number(pt?.z) || 0 });
  }
  if(typeof plot3d.attachRotationControls !== 'function'){
    plot3d.attachRotationControls = () => {};
  }
  if(typeof plot3d.renderAxesAndGrid !== 'function'){
    plot3d.renderAxesAndGrid = () => null;
  }
  if(typeof plot3d.createProjector !== 'function'){
    plot3d.createProjector = () => ({ project: () => ({ x: 0, y: 0, depth: 0 }), bounds: {}, scale: 1, offsets: { x: 0, y: 0 }, plotSize: { width: 1, height: 1 } });
  }
  if(typeof plot3d.applyLegendPointerGuards !== 'function'){
    plot3d.applyLegendPointerGuards = () => {};
  }
  if(typeof plot3d.isLegendPointerTarget !== 'function'){
    plot3d.isLegendPointerTarget = () => false;
  }
  if(typeof plot3d.isInteractivePointerTarget !== 'function'){
    plot3d.isInteractivePointerTarget = target => plot3d.isLegendPointerTarget(target);
  }
  scatter.__installed = true;
  scatter.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: scatter component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: scatter component awaiting Shared.tableImport helpers');
  }

  const NS='http://www.w3.org/2000/svg';
  const DEFAULT_ROWS=100;
  const DEFAULT_COLS=4;
  const SIGNIFICANT_COLOR = '#d62728';
  const DEFAULT_NON_SIG_COLOR = '#808080';
  const MAX_SIGNIFICANT_ANNOTATIONS = 250;
  const GRAPH_TYPE_DEFAULTS = {
    scatter: { title: 'Scatter plot' },
    volcano: { title: 'Volcano plot' },
    ma: { title: 'MA plot' }
  };

  const SCATTER_SHAPE_OPTIONS = Object.freeze([
    { value: 'circle', label: 'Circle' },
    { value: 'square', label: 'Square' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'diamond', label: 'Diamond' },
    { value: 'cross', label: 'Cross' }
  ]);
  const SCATTER_SHAPE_DEFAULTS = SCATTER_SHAPE_OPTIONS.map(opt => opt.value);
  const SCATTER_SHAPE_VALUES = new Set(SCATTER_SHAPE_DEFAULTS);
  const SCATTER_3D_DEFAULTS = Object.freeze({ rotationX: -0.31, rotationY: -0.48, aspectRatio: 4 / 3 });

  const scatterState = {
    viewMode: '2d',
    requestedViewMode: '2d',
    rotation: plot3d.createRotationState({ x: SCATTER_3D_DEFAULTS.rotationX, y: SCATTER_3D_DEFAULTS.rotationY }),
    rotationPending: false,
    rotationPendingLogged: false,
    supports3d: false,
    supportsBubble: false
  };
  if(typeof plot3d.normalizeRotation === 'function'){
    plot3d.normalizeRotation(scatterState.rotation);
  }

  const regressionTools = Shared.regressionTools = Shared.regressionTools || {};
  const regressionDebugNamespace = 'scatter-regression';
  const jStatLib = global.jStat;

  const ensureFiniteNumber = typeof regressionTools.ensureFiniteNumber === 'function'
    ? regressionTools.ensureFiniteNumber
    : (value => (Number.isFinite(value) ? value : NaN));

  const DEFAULT_AXIS_COLOR = '#000000';

  const scatterRefs = {};
  let scatterTooltipEl = null;
  const EMPTY_LEGEND_RENDERER = Object.freeze({
    entries: Object.freeze([]),
    width: 0,
    height: 0,
    draw(){ /* noop legend renderer when hidden */ }
  });

  function scatterDebug(label, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // ignore toggle errors and log by default
    }
    console.debug(label, payload);
  }

  function ensureScatterTooltipHost(tooltip, doc){
    if(!tooltip){ return null; }
    const documentRef = doc || tooltip.ownerDocument || global.document;
    if(!documentRef){ return tooltip; }
    const parent = tooltip.parentElement;
    if(!parent){ return tooltip; }
    let needsDetach = false;
    if(typeof tooltip.closest === 'function'){
      const hiddenAncestor = tooltip.closest('[hidden]');
      if(hiddenAncestor && hiddenAncestor !== tooltip){
        needsDetach = true;
      }
    }
    if(!needsDetach){
      try{
        const view = documentRef.defaultView;
        if(view && typeof view.getComputedStyle === 'function'){
          const parentDisplay = view.getComputedStyle(parent).display;
          if(parentDisplay === 'none'){
            needsDetach = true;
          }
        }else if(typeof parent.style?.display === 'string' && parent.style.display === 'none'){
          needsDetach = true;
        }
      }catch(err){
        scatterDebug('Debug: scatter tooltip host inspection error',{ error: err?.message || String(err) });
      }
    }
    const host = documentRef.body || documentRef.documentElement;
    if(needsDetach && host && parent !== host){
      host.appendChild(tooltip);
      scatterDebug('Debug: scatter tooltip host realigned',{ previousParent: parent.id || parent.className || parent.tagName || null });
    }
    return tooltip;
  }

  function getScatterTooltipElement(){
    if(scatterTooltipEl && scatterTooltipEl.isConnected){
      return scatterTooltipEl;
    }
    const doc = global.document;
    const tooltip = scatterRefs.tooltip || doc?.getElementById?.('tooltip') || null;
    if(tooltip){
      ensureScatterTooltipHost(tooltip, doc);
      scatterTooltipEl = tooltip;
      scatterRefs.tooltip = tooltip;
    }
    return scatterTooltipEl;
  }

  function formatScatterTooltipNumber(value){
    if(value === null || value === undefined){ return 'n/a'; }
    if(typeof value === 'number'){
      if(!Number.isFinite(value)){ return String(value); }
      return value.toLocaleString('en-US',{ maximumSignificantDigits: 6 });
    }
    const numeric = Number(value);
    if(Number.isFinite(numeric)){
      return numeric.toLocaleString('en-US',{ maximumSignificantDigits: 6 });
    }
    return String(value);
  }

  function updateScatterTooltipContent(tooltip, data){
    if(!tooltip || !data){ return false; }
    const doc = tooltip.ownerDocument || global.document;
    tooltip.textContent = '';
    tooltip.style.fontSize = '12px';
    tooltip.style.columnCount = 1;
    tooltip.style.columnWidth = 'auto';
    tooltip.style.columnGap = '0';
    tooltip.style.maxWidth = '320px';
    tooltip.style.maxHeight = 'none';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    tooltip.style.whiteSpace = 'normal';
    tooltip.style.overflow = 'visible';
    const fragment = doc.createDocumentFragment();
    const appendRow = (text, bold) => {
      if(!text){ return; }
      const row = doc.createElement('div');
      if(bold){ row.style.fontWeight = '600'; }
      row.textContent = text;
      fragment.appendChild(row);
    };
    if(data.label){
      appendRow(data.label, true);
    }
    appendRow(`X: ${formatScatterTooltipNumber(data.x)}`);
    appendRow(`Y: ${formatScatterTooltipNumber(data.y)}`);
    if(data.z !== undefined){
      appendRow(`Z: ${formatScatterTooltipNumber(data.z)}`);
    }
    if(data.size !== undefined){
      appendRow(`Size: ${formatScatterTooltipNumber(data.size)}`);
    }
    if(data.logXValue !== undefined && data.logXValue !== data.x){
      appendRow(`Log X: ${formatScatterTooltipNumber(data.logXValue)}`);
    }
    if(data.logYValue !== undefined && data.logYValue !== data.y){
      appendRow(`Log Y: ${formatScatterTooltipNumber(data.logYValue)}`);
    }
    if(typeof data.series === 'string' && data.series){
      appendRow(`Series: ${data.series}`);
    }
    if(data.graphType && data.graphType !== 'scatter'){
      appendRow(`Graph: ${data.graphType.toUpperCase()}`);
      if(typeof data.isSignificant === 'boolean'){
        appendRow(`Significant: ${data.isSignificant ? 'Yes' : 'No'}`);
      }
    }
    if(!fragment.childNodes.length){
      return false;
    }
    tooltip.appendChild(fragment);
    return true;
  }

  function getScatterEventPagePosition(evt){
    const win = global.window;
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const pageX = typeof evt?.pageX === 'number' ? evt.pageX : ((evt?.clientX || 0) + scrollX);
    const pageY = typeof evt?.pageY === 'number' ? evt.pageY : ((evt?.clientY || 0) + scrollY);
    return { x: pageX, y: pageY };
  }

  function positionScatterTooltipAt(tooltip, pageX, pageY){
    if(!tooltip){ return; }
    const win = global.window;
    const offset = 12;
    let left = pageX + offset;
    let top = pageY + offset;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    const rect = tooltip.getBoundingClientRect();
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const maxX = scrollX + (win?.innerWidth ?? rect.width) - 8;
    const maxY = scrollY + (win?.innerHeight ?? rect.height) - 8;
    if(rect.right > maxX){
      left = Math.max(scrollX + 8, maxX - rect.width);
    }
    if(rect.bottom > maxY){
      top = Math.max(scrollY + 8, maxY - rect.height);
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideScatterTooltip(reason){
    const tooltip = getScatterTooltipElement();
    if(!tooltip){ return; }
    const wasVisible = tooltip.style.display !== 'none';
    tooltip.style.display = 'none';
    tooltip.textContent = '';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    if(wasVisible){
      scatterDebug('Debug: scatter tooltip hide',{ reason });
    }
  }

  function showScatterTooltip(data, evt){
    const tooltip = getScatterTooltipElement();
    if(!tooltip){ return; }
    if(!updateScatterTooltipContent(tooltip, data)){ return; }
    tooltip.style.display = 'block';
    const pos = getScatterEventPagePosition(evt);
    positionScatterTooltipAt(tooltip, pos.x, pos.y);
    scatterDebug('Debug: scatter tooltip show',{
      label: data?.label || null,
      x: data?.x ?? null,
      y: data?.y ?? null,
      graphType: data?.graphType || null
    });
  }

  function handleScatterPointEnter(evt){
    const data = evt?.currentTarget?.__scatterPointData;
    if(!data){ return; }
    showScatterTooltip(data, evt);
  }

  function handleScatterPointMove(evt){
    const tooltip = getScatterTooltipElement();
    if(!tooltip || tooltip.style.display === 'none'){ return; }
    const pos = getScatterEventPagePosition(evt);
    positionScatterTooltipAt(tooltip, pos.x, pos.y);
  }

  function handleScatterPointLeave(){
    hideScatterTooltip('point-leave');
  }

  function handleScatterPlotMouseLeave(){
    hideScatterTooltip('plot-leave');
  }

  function attachScatterPointTooltip(el, data){
    if(!el || !data){ return; }
    el.__scatterPointData = data;
    el.addEventListener('mouseenter', handleScatterPointEnter);
    el.addEventListener('mousemove', handleScatterPointMove);
    el.addEventListener('mouseleave', handleScatterPointLeave);
  }

  function attachScatterSelectAutoSize(select, label){
    if(!select){ return; }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          console.debug('Debug: scatter select auto-size watcher attached', {
            id: select.id || null,
            label: label || null
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          console.debug('Debug: scatter select auto-size applied without watcher', {
            id: select.id || null,
            label: label || null
          });
        }
      }else if(debugEnabled){
        console.debug('Debug: scatter select auto-size helper unavailable', {
          id: select.id || null,
          label: label || null
        });
      }
    }catch(err){
      if(debugEnabled){
        console.debug('Debug: scatter select auto-size attach error', {
          id: select.id || null,
          label: label || null,
          error: err?.message || String(err)
        });
      }
    }
  }

  function createScatterAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null },
      y: { tickInterval: null }
    };
  }

  let scatterAxisSettings = createScatterAxisSettings();

  function ensureScatterAxisSettings(){
    if(!scatterAxisSettings || typeof scatterAxisSettings !== 'object'){
      scatterAxisSettings = createScatterAxisSettings();
    }
    if(!scatterAxisSettings.x || typeof scatterAxisSettings.x !== 'object'){
      scatterAxisSettings.x = { tickInterval: null };
    }
    if(!scatterAxisSettings.y || typeof scatterAxisSettings.y !== 'object'){
      scatterAxisSettings.y = { tickInterval: null };
    }
    const strokeNumeric = Number(scatterAxisSettings.strokeWidth);
    scatterAxisSettings.strokeWidth = Number.isFinite(strokeNumeric) && strokeNumeric > 0 ? strokeNumeric : 1;
    if(typeof scatterAxisSettings.color !== 'string' || !scatterAxisSettings.color){
      scatterAxisSettings.color = DEFAULT_AXIS_COLOR;
    }
    return scatterAxisSettings;
  }

  function getScatterAxisTickInterval(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureScatterAxisSettings();
    const raw = settings[axis]?.tickInterval;
    if(raw === null || raw === undefined || raw === ''){
      return null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function updateScatterAxisTickInterval(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureScatterAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings[axis].tickInterval = null;
    } else {
      const numeric = Number(value);
      settings[axis].tickInterval = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }
    console.debug('Debug: scatter axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function getScatterAxisStrokeWidth(){
    const settings = ensureScatterAxisSettings();
    return settings.strokeWidth;
  }

  function updateScatterAxisStrokeWidth(value){
    const settings = ensureScatterAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings.strokeWidth = 1;
    } else {
      const numeric = Number(value);
      settings.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    }
    console.debug('Debug: scatter axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function getScatterAxisColor(){
    const settings = ensureScatterAxisSettings();
    return settings.color || DEFAULT_AXIS_COLOR;
  }

  function updateScatterAxisColor(value){
    const settings = ensureScatterAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    console.debug('Debug: scatter axis color updated',{ color: settings.color });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function applyScatterAxisSettings(settings){
    const base = createScatterAxisSettings();
    if(settings && typeof settings === 'object'){
      const strokeCandidate = Number(settings.strokeWidth);
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
    }
    scatterAxisSettings = base;
    ensureScatterAxisSettings();
    console.debug('Debug: scatter axis settings applied',{ settings: scatterAxisSettings });
  }

  function clampScatterTickTarget(value){
    const axisTicks = chartStyle.axisTicks;
    if(axisTicks && typeof axisTicks.clampTickTarget === 'function'){
      return axisTicks.clampTickTarget(value);
    }
    if(!Number.isFinite(value)){
      return 6;
    }
    const rounded = Math.round(value);
    return Math.max(5, Math.min(8, rounded));
  }

  function buildScatterScale(options){
    const axisTicks = chartStyle.axisTicks;
    if(axisTicks && typeof axisTicks.buildScale === 'function'){
      const scale = axisTicks.buildScale(options);
      scatterDebug('Debug: scatter scale computed', {
        ...options,
        tickCount: Array.isArray(scale?.ticks) ? scale.ticks.length : null,
        step: scale?.step,
        min: scale?.min,
        max: scale?.max
      });
      return scale;
    }
    scatterDebug('Debug: scatter scale fallback invoked', { reason: 'missing axis tick helpers' });
    return {
      min: Number.isFinite(options?.manualMin) ? options.manualMin : Number(options?.dataMin) || 0,
      max: Number.isFinite(options?.manualMax) ? options.manualMax : Number(options?.dataMax) || 1,
      ticks: [Number(options?.manualMin) || 0, Number(options?.manualMax) || 1],
      step: Number(options?.fixedStep) || 1
    };
  }

  let scheduleDrawScatter=null;
  let scatterCurrentGraphType='scatter';
  let scatterLastGraphType='scatter';
  let scatterLastRegressionSummary=null;
  const scatterAdvisorState={
    open:false,
    answers:{},
    lastApplied:null,
    context:null
  };

  function formatP(p){
    if(p === undefined || p === null || Number.isNaN(p)) return 'n/a';
    if(!Number.isFinite(p)) return p > 0 ? 'Infinity' : '-Infinity';
    if(p === 0) return '0';
    const formatted = p.toLocaleString('en-US',{maximumSignificantDigits:6});
    console.debug('Debug: formatP value', {input:p, formatted}); // Debug: remove when stable
    return formatted;
  }
  function setup(){
    if(scatter.ready){ console.debug('Debug: Components.scatter.setup skipped'); return; }
    console.debug('Debug: Components.scatter.setup start');
    scheduleDrawScatter = () => {};
    ensureScatterAxisSettings();
    const $ = global.$;
    const document = global.document;
    const Handsontable = global.Handsontable;
    if(!Handsontable){
      console.error('Handsontable missing for scatter component');
      return;
    }
    const makeEditableLocal = (el,onChange,options) => {
      const fn = Shared.makeEditable || global.makeEditable;
      if (typeof fn === 'function') {
        return fn(el,onChange,options);
      }
      console.warn('scatter component makeEditable fallback missing');
      return undefined;
    };
    const ensureGraphViewport = Shared.graphViewport?.createEnsurer
      ? Shared.graphViewport.createEnsurer('scatter')
      : (svg, options = {}) => {
        const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
        if(typeof fn === 'function'){
          fn(svg, { component: 'scatter', debugLabel: 'scatter-viewport-fallback', ...options });
          return;
        }
        console.debug('Debug: scatter ensureGraphViewport helper missing', {
          hasShared: !!Shared,
          hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
        });
      };
    console.debug('Debug: scatter graph viewport helper configured', {
      hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
      usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
    });
    const serializeSvg = (svgEl, options)=>{
      const fn = Shared.serializeCleanSVG || global.serializeCleanSVG;
      if (typeof fn === 'function') {
        return fn(svgEl, options);
      }
      if (!svgEl) return '';
      const serializer = new (global.XMLSerializer||XMLSerializer)();
      return serializer.serializeToString(svgEl);
    };
    const renderStatsCard=(target,model)=>{
      if(!target) return;
      const hasRenderer=Shared.statsTable && typeof Shared.statsTable.render==='function';
      if(hasRenderer){
        Shared.statsTable.render({ target, ...model });
        console.debug('Debug: scatter renderStatsCard shared',{ caption:model.caption || null, rows:model.rows?.length || 0 });
        return;
      }
      target.innerHTML='';
      if(model.caption){
        const lead=document.createElement('div');
        lead.className='stats-table-lead';
        lead.textContent=model.caption;
        target.appendChild(lead);
      }
      const table=document.createElement('table');
      const thead=document.createElement('thead');
      const headRow=document.createElement('tr');
      (model.columns||[]).forEach(col=>{
        const th=document.createElement('th');
        th.textContent=col.label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody=document.createElement('tbody');
      (model.rows||[]).forEach(row=>{
        const tr=document.createElement('tr');
        (model.columns||[]).forEach(col=>{
          const td=document.createElement('td');
          const value=row?.[col.key];
          td.textContent=value ?? '';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      target.appendChild(table);
      console.debug('Debug: scatter renderStatsCard fallback',{ caption:model.caption || null, rows:model.rows?.length || 0 });
    };
    const formatMetricValue = (value, digits = 4) => Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
    console.debug('Debug: scatter component DOM helpers resolved', {
      hasSharedEditable: typeof Shared.makeEditable === 'function',
      hasSharedResize: typeof Shared.autoResizeSvg === 'function',
      hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
    }); // Debug: helper availability summary
    const markFontEditable = (node, role, key) => {
      if (!node) { return; }
      const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
      if (fontControls && typeof fontControls.markText === 'function') {
        fontControls.markText(node, { scopeId: 'scatter', role, key });
      } else if (node.dataset) {
        node.dataset.fontEditable = '1';
        node.dataset.fontScope = 'scatter';
        if (role) node.dataset.fontRole = role;
        if (key || role) node.dataset.fontKey = key || role;
      }
      if (!role || role.indexOf('Tick') === -1) {
        console.debug('Debug: scatter markFontEditable', payload); // Debug: font target tagging summary
      }
    };
    let scatterDrawToken=0;
      // Scatter plot setup
      const scatterHotContainer=document.getElementById('scatterHot');
      const scatterHotWrapper=document.getElementById('scatterHotWrapper');
      const scatterTablePanel=document.getElementById('scatterTablePanel');
      const scatterGraphPanel=document.getElementById('scatterGraphPanel');
      const scatterPanelResizer=document.getElementById('scatterPanelResizer');
      let scatterSvgBox=scatterGraphPanel?.querySelector('.svgbox');
      const scatterConfigPanel=scatterGraphPanel?.querySelector('.config-options');
      const scatterShowLegend=$('#scatterShowLegend');
      const scatterLegendControl=scatterShowLegend?.closest('label')||null;
      const ensureScatterLegendTrayPlacement=()=>{
        if(!scatterLegendControl){
          return;
        }
        const hostBox=scatterSvgBox||scatterGraphPanel?.querySelector?.('.svgbox');
        if(!hostBox){
          return;
        }
        let tray=hostBox.querySelector('.resizer-control-tray');
        if(!tray){
          const doc=hostBox.ownerDocument||global.document;
          if(doc){
            tray=doc.createElement('div');
            tray.className='resizer-control-tray';
            hostBox.appendChild(tray);
            console.debug('Debug: scatter legend tray fallback created',{ trayChildren: tray.childElementCount });
          }
        }
        if(!tray){
          return;
        }
        if(scatterLegendControl.parentNode!==tray){
          tray.appendChild(scatterLegendControl);
          console.debug('Debug: scatter legend control moved',{ trayChildren: tray.childElementCount });
        }
        scatterLegendControl.classList.remove('config-panel__checkbox','config-panel__checkbox--inline');
        scatterLegendControl.classList.add('resizer-legend-control');
        if(!scatterLegendControl.title){
          scatterLegendControl.title='Toggle legend visibility';
        }
        if(scatterLegendControl.dataset){
          scatterLegendControl.dataset.scatterLegendTray='true';
        }
      };
      const scatterLayout = Shared.componentLayout?.createStandardPanels({
        componentName: 'scatter',
        selectors: {
          tablePanel: '#scatterTablePanel',
          graphPanel: '#scatterGraphPanel',
          panelResizer: '#scatterPanelResizer',
          hotWrapper: '#scatterHotWrapper',
          hotContainer: '#scatterHot',
          svgBox: () => scatterGraphPanel?.querySelector('.svgbox'),
          resizeTarget: () => scatterGraphPanel?.querySelector('.svgbox')
        },
        scheduleDraw: () => scheduleDrawScatter(),
        resizableBoxOptions: {
          onResize: () => {
            console.debug('Debug: scatter layout onResize schedule trigger');
            scheduleDrawScatter();
          }
        }
      });
      if(scatterLayout?.elements?.svgBox){
        scatterSvgBox = scatterLayout.elements.svgBox;
      }
      scatterLayout?.setScheduleDraw?.(() => scheduleDrawScatter());
      scatterLayout?.syncPanels?.();
      if(scatterLegendControl){
        ensureScatterLegendTrayPlacement();
        const scheduleLegendPlacement=typeof Shared.debounceFrame==='function'
          ? Shared.debounceFrame(()=>ensureScatterLegendTrayPlacement())
          : null;
        if(scheduleLegendPlacement){
          scheduleLegendPlacement();
        }else if(typeof global.requestAnimationFrame==='function'){
          global.requestAnimationFrame(()=>ensureScatterLegendTrayPlacement());
        }
        if(scatterLayout && typeof scatterLayout.updateSvgBox==='function'){
          const originalUpdateSvgBox=scatterLayout.updateSvgBox.bind(scatterLayout);
          scatterLayout.updateSvgBox=node=>{
            originalUpdateSvgBox(node);
            if(node){
              scatterSvgBox=node;
            }else if(scatterLayout.elements?.svgBox){
              scatterSvgBox=scatterLayout.elements.svgBox;
            }
            ensureScatterLegendTrayPlacement();
          };
        }
      }
      console.debug('Debug: scatter initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
      if(typeof Shared.hot?.createStandardTable !== 'function'){
        console.error('scatter initHot missing Shared.hot.createStandardTable');
        return;
      }
      const data = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
      let scatterScheduleProxyCount = 0;
      const scheduleDrawScatterProxy = () => {
        scatterScheduleProxyCount += 1;
        if(scatterScheduleProxyCount <= 5){
          console.debug('Debug: scatter scheduleDraw proxy invoked', { count: scatterScheduleProxyCount }); // Debug: table change trigger
          if(scatterScheduleProxyCount === 5){
            console.debug('Debug: scatter scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
          }
        }
        scheduleDrawScatter();
      };

      const scatterHot=Shared.hot.createStandardTable(scatterHotContainer,{ rows: DEFAULT_ROWS, cols: DEFAULT_COLS },scheduleDrawScatterProxy,{
        debugLabel: 'scatter',
        data,
        hotOptions: {
          afterChange(changes,source){
            if(!changes||source==='loadData') return;
            console.log('scatter afterChange', {count:changes.length, source});
            revalidateActiveScatterLogAxis('x','data-edit');
            revalidateActiveScatterLogAxis('y','data-edit');
          },
          afterUndo(){
            console.log('scatter undo');
          },
          afterRedo(){
            console.log('scatter redo');
          }
        }
      });
    
      global.DEBUG_SCATTER=true;
      const scatterExamples={
        scatter:[
          ['Label','X Value','Y Value',''],
          ['Cat',4.5,23,''],
          ['Dog',20,45,''],
          ['Rabbit',2.5,35,''],
          ['Cat',5,25,''],
          ['Dog',22,50,''],
          ['Rabbit',3,40,''],
          ['Cat',4.8,24,''],
          ['Dog',24,55,'']
        ],
        scatter3d:[
          ['Label','X Value','Y Value','Z Value'],
          ['Orion',2.5,18,4.5],
          ['Lyra',6.2,25,9.1],
          ['Cygnus',4.1,14,6.8],
          ['Andromeda',8.6,32,12.4],
          ['Cassiopeia',5.4,28,10.2],
          ['Phoenix',7.9,20,7.3],
          ['Delphinus',3.2,12,3.9],
          ['Vela',9.4,36,13.6]
        ],
        scatterBubble:[
          ['Label','X Value','Y Value','Bubble Size'],
          ['Comet A',1.8,12,25],
          ['Comet B',4.2,18,40],
          ['Comet C',2.5,22,55],
          ['Comet D',5.7,28,70],
          ['Comet E',3.9,16,35],
          ['Comet F',6.4,24,90],
          ['Comet G',4.8,30,65],
          ['Comet H',7.1,26,80]
        ],
        volcano:[
          ['Gene','log2FoldChange','pValue',''],
          ['GeneA',1.6,0.0005,''],
          ['GeneB',-1.2,0.002,''],
          ['GeneC',0.2,0.8,''],
          ['GeneD',-2.1,0.0001,''],
          ['GeneE',0.5,0.4,''],
          ['GeneF',1.1,0.03,''],
          ['GeneG',-1.8,0.0008,'']
        ],
        ma:[
          ['Gene','MeanExpression','log2FoldChange','pValue'],
          ['GeneA',8.5,1.4,0.0005],
          ['GeneB',5.3,-1.1,0.002],
          ['GeneC',3.9,0.1,0.4],
          ['GeneD',9.2,-2.0,0.00005],
          ['GeneE',6.1,0.3,0.2],
          ['GeneF',7.4,1.2,0.015],
          ['GeneG',4.8,-1.5,0.0009],
          ['GeneH',2.7,0.0,0.9]
        ]
      };
      if(global.DEBUG_SCATTER) console.log('scatter example dataset map', scatterExamples);
      document.getElementById('scatterLoadExample').addEventListener('click',()=>{
        const type=scatterGraphTypeSelect?.value || 'scatter';
        const rawViewMode = type==='scatter' ? (scatterViewMode && typeof scatterViewMode.value === 'string' ? scatterViewMode.value : null) : null;
        const viewMode = type==='scatter'
          ? (rawViewMode || scatterState.requestedViewMode || scatterState.viewMode || '2d')
          : '2d';
        const normalizedMode = typeof viewMode === 'string' ? viewMode.toLowerCase() : '2d';
        let dataset;
        if(type==='scatter' && normalizedMode==='3d'){
          dataset = scatterExamples.scatter3d;
        }else if(type==='scatter' && normalizedMode==='bubble'){
          dataset = scatterExamples.scatterBubble;
        }else{
          dataset = scatterExamples[type] || scatterExamples.scatter;
        }
        scatterHot.loadData(dataset);
        if(type!=='scatter' && scatterFill && scatterFill.value && scatterFill.value.toLowerCase()==='#377eb8'){
          scatterFill.value=DEFAULT_NON_SIG_COLOR;
        }
        console.log('scatter example loaded',{type,viewMode,rows:dataset.length});
        syncScatterGraphTypeUI();
        scheduleDrawScatter();
      });
      const scatterImportBtn=document.getElementById('scatterImport');
      const scatterFileInput=document.getElementById('scatterFile');
      const tableImport = Shared.tableImport;
      scatterImportBtn.addEventListener('click',()=>{ scatterFileInput.value=''; scatterFileInput.click(); });
      scatterFileInput.addEventListener('change',()=>{
        if(!tableImport || typeof tableImport.openFile !== 'function'){
          console.warn('scatter import skipped: Shared.tableImport.openFile unavailable');
          return;
        }
        tableImport.openFile(scatterFileInput, {
          hot: scatterHot,
          minCols: 4,
          minRows: DEFAULT_ROWS,
          scheduleDraw: scheduleDrawScatter,
          debugLabel: 'scatter',
          onProcessed: info => console.log('scatter data imported',{rows: info?.rows, cols: info?.cols})
        });
      });

      if(tableImport && typeof tableImport.handlePaste === 'function'){
        scatterHotContainer.addEventListener('paste',async e=>{
          console.time('scatterPaste');
          try{
            await tableImport.handlePaste(e, scatterHot, {
              minCols: 4,
              minRows: DEFAULT_ROWS,
              scheduleDraw: scheduleDrawScatter,
              debugLabel: 'scatter',
              onBeforeProcess: meta => console.log('scatter fast paste',{rows: meta.rowCount, cols: meta.colCount, startRow: meta.startRow, startCol: meta.startCol}),
              onProcessed: info => console.log('scatter data imported',{rows: info?.rows, cols: info?.cols})
            });
          }finally{
            console.timeEnd('scatterPaste');
          }
        },true);
      }
    
      const scatterGraphTypeSelect=$('#scatterGraphType');
      const scatterThresholdControls=$('#scatterThresholdControls');
      const scatterLog2FCThreshold=$('#scatterLog2FCThreshold');
      const scatterNegLogPThreshold=$('#scatterNegLogPThreshold');
      const scatterFill=$('#scatterFill'), scatterBorder=$('#scatterBorder'), scatterBorderWidth=$('#scatterBorderWidth'), scatterDotSize=$('#scatterDotSize'), scatterShowLine=$('#scatterShowLine'), scatterAlpha=$('#scatterAlpha');
      const scatterShowIntervals=$('#scatterShowIntervals');
      const scatterShowDiagnostics=$('#scatterShowDiagnostics');
      const scatterAlphaVal=$('#scatterAlphaVal');
      const scatterFontSize=$('#scatterFontSize'), scatterFontSizeVal=$('#scatterFontSizeVal');
      if(scatterFontSize?.dataset){
        scatterFontSize.dataset.fontBasePt = String(scatterFontSize.value);
        console.debug('Debug: scatter font size base initialized',{ value: scatterFontSize.value }); // Debug: initial base
      }
      chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value), input: scatterFontSize, manual: true });
      const scatterShowGrid=$('#scatterShowGrid'), scatterShowFrame=$('#scatterShowFrame'), scatterLogX=$('#scatterLogX'), scatterLogY=$('#scatterLogY');
      const scatterXMin=$('#scatterXMin'), scatterXMax=$('#scatterXMax'), scatterYMin=$('#scatterYMin'), scatterYMax=$('#scatterYMax');
      const scatterOriginMode=$('#scatterOriginMode'), scatterOriginX=$('#scatterOriginX'), scatterOriginY=$('#scatterOriginY');
      const scatterStatType=$('#scatterStatType');
      const scatterRegressionMode=$('#scatterRegressionMode');
      const scatterViewMode=$('#scatterViewMode');
      const scatterViewControls=$('#scatterViewControls');
      const scatterSelects=[
        scatterGraphTypeSelect,
        scatterViewMode,
        scatterOriginMode,
        scatterStatType,
        scatterRegressionMode
      ].filter(Boolean);
      scatterSelects.forEach(select=>{
        attachScatterSelectAutoSize(select, 'scatter');
      });
      function updateScatterViewModeOptionVisibility(){
        if(!scatterViewMode){
          return;
        }
        const option3d = scatterViewMode.querySelector('option[value="3d"]');
        if(option3d){
          option3d.disabled = false;
        }
        const optionBubble = scatterViewMode.querySelector('option[value="bubble"]');
        if(optionBubble){
          optionBubble.disabled = false;
        }
        scatterViewMode.disabled = scatterCurrentGraphType !== 'scatter';
      }
      function applyScatterViewMode(mode, options = {}){
        const graphAllowsAdvanced = scatterCurrentGraphType === 'scatter';
        const allow3d = options.allow3d !== false && graphAllowsAdvanced;
        const allowBubble = options.allowBubble !== false && graphAllowsAdvanced;
        const forceUpdate = options.forceUpdate === true;
        const skipSchedule = options.skipSchedule === true;
        const persistRequest = options.persistRequest === true;
        let requested = typeof mode === 'string'
          ? mode.toLowerCase()
          : (scatterState.requestedViewMode || scatterState.viewMode || '2d');
        if(requested !== '3d' && requested !== 'bubble'){
          requested = '2d';
        }
        if(persistRequest || !scatterState.requestedViewMode){
          scatterState.requestedViewMode = requested;
        }
        let normalized = requested;
        if(normalized === '3d' && !allow3d){
          normalized = '2d';
        }else if(normalized === 'bubble' && !allowBubble){
          normalized = '2d';
        }
        const changed = forceUpdate || scatterState.viewMode !== normalized;
        scatterState.viewMode = normalized;
        if(scatterViewMode){
          const displayValue = scatterState.requestedViewMode || normalized;
          if(scatterViewMode.value !== displayValue){
            scatterViewMode.value = displayValue;
          }
        }
        const disableLog = normalized === '3d' || scatterCurrentGraphType !== 'scatter';
        [scatterLogX, scatterLogY].forEach(cb => {
          if(!cb){ return; }
          cb.disabled = disableLog;
          if(disableLog && cb.checked){
            cb.checked = false;
          }
        });
        const disableRegression = normalized === '3d' || scatterCurrentGraphType !== 'scatter';
        if(scatterShowLine){
          scatterShowLine.disabled = disableRegression;
          if(disableRegression && scatterShowLine.checked){
            scatterShowLine.checked = false;
          }
        }
        if(scatterShowIntervals){
          scatterShowIntervals.disabled = disableRegression;
          if(disableRegression && scatterShowIntervals.checked){
            scatterShowIntervals.checked = false;
          }
        }
        if(scatterShowDiagnostics){
          scatterShowDiagnostics.disabled = disableRegression;
          if(disableRegression && scatterShowDiagnostics.checked){
            scatterShowDiagnostics.checked = false;
          }
        }
        if(normalized === '3d' && scatterShowFrame && !scatterShowFrame.checked){
          scatterShowFrame.checked = true;
        }
        updateScatterViewModeOptionVisibility();
        if(changed && !skipSchedule){
          scheduleDrawScatter();
        }
        return normalized;
      }
      function scheduleScatterRotationRedraw(){
        if(scatterState.rotationPending){
          if(!scatterState.rotationPendingLogged && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: scatter rotation redraw skipped',{ reason: 'pending' });
          }
          scatterState.rotationPendingLogged = true;
          return;
        }
        scatterState.rotationPending = true;
        scatterState.rotationPendingLogged = false;
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: scatter rotation redraw scheduled');
        }
        scheduleDrawScatter();
      }
      if(scatterViewMode){
        scatterViewMode.value = scatterState.viewMode;
        scatterViewMode.addEventListener('change', () => {
          const requested = scatterViewMode.value;
          const next = requested === '3d' ? '3d' : (requested === 'bubble' ? 'bubble' : '2d');
          const applied = applyScatterViewMode(next, {
            allow3d: scatterCurrentGraphType === 'scatter',
            allowBubble: scatterCurrentGraphType === 'scatter',
            persistRequest: true
          });
          if(applied !== next){
            scatterViewMode.value = applied;
          }
        });
      }
      let scatterLogWarningEl=null;
      const scatterDebugEnabled=()=>typeof Shared.isDebugEnabled==='function'&&Shared.isDebugEnabled();
      function ensureScatterLogWarningElement(){
        if(scatterLogWarningEl&&scatterLogWarningEl.isConnected){
          return scatterLogWarningEl;
        }
        const host=(scatterLogY?.closest('.config-panel__fieldset'))||(scatterLogX?.closest('fieldset'));
        if(!host){
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log warning host unavailable');
          }
          return null;
        }
        const el=global.document.createElement('div');
        el.className='config-panel__warning';
        el.setAttribute('role','alert');
        el.setAttribute('aria-live','polite');
        el.hidden=true;
        host.appendChild(el);
        scatterLogWarningEl=el;
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log warning element created');
        }
        return scatterLogWarningEl;
      }
      function showScatterLogWarning(message){
        const el=ensureScatterLogWarningElement();
        if(!el){
          return;
        }
        el.textContent=message;
        el.hidden=false;
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log warning shown',{ message });
        }
      }
      function clearScatterLogWarning(){
        if(!scatterLogWarningEl){
          return;
        }
        scatterLogWarningEl.textContent='';
        scatterLogWarningEl.hidden=true;
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log warning cleared');
        }
      }
      function applyScatterLogValidationFailure(axis, validation, context){
        if(!validation || validation.allowed !== false){
          return;
        }
        const checkbox = axis === 'x' ? scatterLogX : scatterLogY;
        if(checkbox){
          checkbox.checked = false;
        }
        const warningMessage = validation.message || `Cannot enable log scale on the ${axis === 'x' ? 'X' : 'Y'} axis while non-positive values are present.`;
        showScatterLogWarning(warningMessage);
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log axis auto-disabled',{ axis, context, reason: validation.reason, value: validation.value });
        }
        scheduleDrawScatter();
      }
      function revalidateActiveScatterLogAxis(axis, context){
        const checkbox = axis === 'x' ? scatterLogX : scatterLogY;
        if(!checkbox?.checked){
          return true;
        }
        const validation = validateScatterLogAxis(axis);
        if(!validation.allowed){
          applyScatterLogValidationFailure(axis, validation, context);
          console.warn('scatter log axis disabled',{ axis, context, reason: validation.reason, value: validation.value });
          return false;
        }
        clearScatterLogWarning();
        return true;
      }
      function validateScatterLogAxis(axis){
        const axisLabel=axis==='x'?'X':'Y';
        const minInput=axis==='x'?scatterXMin:scatterYMin;
        const maxInput=axis==='x'?scatterXMax:scatterYMax;
        const originInput=axis==='x'?scatterOriginX:scatterOriginY;
        const manualMin=parseFloat(minInput?.value);
        if(Number.isFinite(manualMin)&&manualMin<=0){
          const message=`Cannot enable log scale on the ${axisLabel} axis because the minimum value (${manualMin}) is not positive.`;
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis blocked by manual minimum',{ axis, value: manualMin });
          }
          return{allowed:false,reason:'axis-limit',value:manualMin,message};
        }
        const manualMax=parseFloat(maxInput?.value);
        if(Number.isFinite(manualMax)&&manualMax<=0){
          const message=`Cannot enable log scale on the ${axisLabel} axis because the maximum value (${manualMax}) is not positive.`;
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis blocked by manual maximum',{ axis, value: manualMax });
          }
          return{allowed:false,reason:'axis-limit',value:manualMax,message};
        }
        const originModeValue=scatterOriginMode?.value;
        if(originModeValue==='custom'){
          const originVal=parseFloat(originInput?.value);
          if(Number.isFinite(originVal)&&originVal<=0){
            const message=`Cannot enable log scale on the ${axisLabel} axis because the custom origin (${originVal}) is not positive.`;
            if(scatterDebugEnabled()){
              console.debug('Debug: scatter log axis blocked by custom origin',{ axis, value: originVal });
            }
            return{allowed:false,reason:'origin',value:originVal,message};
          }
        }
        const analysis=scatterHot?.getAnalysisData?.()||Shared.hot.getAnalysisData(scatterHot);
        const colIndex=axis==='x'?1:2;
        const rowCount=analysis?.rowCount||0;
        const colCount=analysis?.colCount||0;
        if(!analysis||colIndex>=colCount){
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis validation skipped due to missing analysis',{ axis, hasAnalysis:!!analysis,colIndex,colCount });
          }
          return{allowed:true};
        }
        if(analysis.isColumnExcluded?.(colIndex)){
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis validation skipped because column is excluded',{ axis, colIndex });
          }
          return{allowed:false,reason:'excluded',message:`Restore the ${axisLabel} axis column before enabling log scale.`};
        }
        for(let r=1;r<rowCount;r+=1){
          if(analysis.isRowExcluded?.(r)){
            continue;
          }
          const raw=analysis.data?.[r]?.[colIndex];
          if(raw===null||typeof raw==='undefined'||raw===''){
            continue;
          }
          const value=parseFloat(raw);
          if(Number.isFinite(value)&&value<=0){
            const formatted=value===0?'0':value.toPrecision(4);
            const message=`Cannot enable log scale on the ${axisLabel} axis because data includes ${formatted} at row ${r+1}.`;
            if(scatterDebugEnabled()){
              console.debug('Debug: scatter log axis blocked by data',{ axis, row:r, value });
            }
            return{allowed:false,reason:'data',value,message};
          }
        }
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log axis validation passed',{ axis });
        }
        return{allowed:true};
      }
      let scatterLabelColors={};
      let scatterLabelShapes={};
      const scatterUndoManager = Shared.undoManager || null;
      function recordScatterChange(label, previous, next, apply){
        if(!scatterUndoManager || typeof scatterUndoManager.recordStateChange !== 'function'){
          return;
        }
        if(typeof apply !== 'function'){
          return;
        }
        scatterUndoManager.recordStateChange({
          label,
          scope: 'scatterGraphPanel',
          from: previous,
          to: next,
          apply(value){
            apply(value);
            return true;
          }
        });
      }
      function syncScatterGraphTypeUI(){
        const type=scatterGraphTypeSelect?.value || 'scatter';
        scatterCurrentGraphType=type;
        const showThresholds=type!=='scatter';
        if(showThresholds){
          clearScatterLogWarning();
        }
        if(scatterThresholdControls){
          scatterThresholdControls.style.display=showThresholds?'':'none';
        }
        if(scatterViewControls){
          scatterViewControls.style.display = type === 'scatter' ? '' : 'none';
        }
        [scatterLogX,scatterLogY].forEach(el=>{
          if(!el) return;
          el.disabled=type!=='scatter';
          if(type!=='scatter' && el.checked){
            el.checked=false;
          }
        });
        if(scatterStatType){
          scatterStatType.disabled=type!=='scatter';
        }
        if(scatterRegressionMode){
          scatterRegressionMode.disabled=type!=='scatter';
        }
        const disableRegressionControls = type !== 'scatter';
        if(scatterShowLine){
          scatterShowLine.disabled=disableRegressionControls;
          if(disableRegressionControls && scatterShowLine.checked){
            scatterShowLine.checked=false;
          }
        }
        if(scatterShowIntervals){
          scatterShowIntervals.disabled=disableRegressionControls;
        }
        if(scatterShowDiagnostics){
          scatterShowDiagnostics.disabled=disableRegressionControls;
        }
        if(type!=='scatter' && scatterFill && scatterFill.value && scatterFill.value.toLowerCase()==='#377eb8'){
          scatterFill.value=DEFAULT_NON_SIG_COLOR;
        }
        if(type!==scatterLastGraphType){
          const defaults=GRAPH_TYPE_DEFAULTS[type];
          if(defaults && defaults.title){
            scatterTitleText=defaults.title;
          }
          scatterLastGraphType=type;
      }
      renderScatterStatsAdvisor(null, buildScatterAdvisorContext([]));
      console.debug('Debug: syncScatterGraphTypeUI complete',{type,showThresholds});
        if(scatterViewMode){
          if(type !== 'scatter'){
            scatterState.supports3d = false;
            scatterState.supportsBubble = false;
            applyScatterViewMode('2d', { allow3d: false, allowBubble: false, skipSchedule: true, forceUpdate: true });
          } else {
            updateScatterViewModeOptionVisibility();
            const targetMode = scatterState.requestedViewMode || scatterState.viewMode || '2d';
            applyScatterViewMode(targetMode, {
              skipSchedule: true,
              forceUpdate: true,
              allow3d: true,
              allowBubble: true,
              persistRequest: true
            });
          }
        }
    }

      function buildScatterAdvisorContext(points, overrides){
        const context={
          graphType: scatterCurrentGraphType,
          statsMethod: scatterStatType?.value || 'pearson',
          regressionMode: scatterRegressionMode?.value || 'linear',
          showLine: !!scatterShowLine?.checked,
          showIntervals: !!scatterShowIntervals?.checked,
          showDiagnostics: !!scatterShowDiagnostics?.checked,
          logX: !!scatterLogX?.checked,
          logY: !!scatterLogY?.checked
        };
        const finitePoints=Array.isArray(points)?points.filter(pt=>Number.isFinite(pt?.x)&&Number.isFinite(pt?.y)):[];
        context.pointCount=finitePoints.length;
        const xUnique=new Set();
        const yUnique=new Set();
        const monotonicSigns=new Set();
        let approxBinary=true;
        let bounded01=true;
        let prevPoint=null;
        const yValues=[];
        const xValues=[];
        let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity;
        finitePoints.forEach(pt=>{
          const x=pt.x;
          const y=pt.y;
          if(x<xMin) xMin=x;
          if(x>xMax) xMax=x;
          if(y<yMin) yMin=y;
          if(y>yMax) yMax=y;
          if(xUnique.size<400 && Number.isFinite(x)){
            xUnique.add(Number(x.toFixed(6)));
          }
          if(yUnique.size<400 && Number.isFinite(y)){
            yUnique.add(Number(y.toFixed(6)));
          }
          if(!(y===0 || y===1)){
            approxBinary=false;
          }
          if(y<0 || y>1){
            bounded01=false;
          }
          if(prevPoint){
            const dx=x-prevPoint.x;
            const dy=y-prevPoint.y;
            if(Number.isFinite(dx) && dx!==0 && Number.isFinite(dy)){
              if(dy>0){ monotonicSigns.add('pos'); }
              else if(dy<0){ monotonicSigns.add('neg'); }
            }
          }
          prevPoint=pt;
          xValues.push(x);
          yValues.push(y);
        });
        if(finitePoints.length){
          context.xMin=xMin;
          context.xMax=xMax;
          context.yMin=yMin;
          context.yMax=yMax;
        }
        context.xUniqueCount=xUnique.size;
        context.yUniqueCount=yUnique.size;
        context.approxBinaryY=approxBinary && yUnique.size<=2;
        context.yWithinZeroOne=bounded01;
        context.monotonicSigns=monotonicSigns;
        if(yValues.length>3){
          const yMean=yValues.reduce((sum,val)=>sum+val,0)/yValues.length;
          const yVar=yValues.reduce((sum,val)=>sum+Math.pow(val-yMean,2),0)/Math.max(1,yValues.length-1);
          const yStd=Math.sqrt(Math.max(yVar,0));
          context.yStd=yStd;
          if(yStd>0){
            context.yOutlierCount=yValues.reduce((count,val)=>count+(Math.abs((val-yMean)/yStd)>3?1:0),0);
          }else{
            context.yOutlierCount=0;
          }
        }else{
          context.yStd=NaN;
          context.yOutlierCount=0;
        }
        if(xValues.length>3){
          const xMean=xValues.reduce((sum,val)=>sum+val,0)/xValues.length;
          const xVar=xValues.reduce((sum,val)=>sum+Math.pow(val-xMean,2),0)/Math.max(1,xValues.length-1);
          context.xStd=Math.sqrt(Math.max(xVar,0));
        }else{
          context.xStd=NaN;
        }
        return overrides ? { ...context, ...overrides } : context;
      }

      function ensureScatterAdvisorDefaults(context){
        const answers=scatterAdvisorState.answers || {};
        if(!answers.measurement){
          if(context.approxBinaryY){
            answers.measurement='binaryOutcome';
          }else if(context.pointCount>=6 && (context.yOutlierCount>0 || !Number.isFinite(context.yStd) || context.yStd===0)){
            answers.measurement='continuousNonNormal';
          }else{
            answers.measurement='continuousNormal';
          }
        }
        if(!answers.trend){
          if(context.graphType!=='scatter'){
            answers.trend='linear';
          }else if(context.monotonicSigns && context.monotonicSigns.size>1){
            answers.trend='multiple';
          }else{
            answers.trend='linear';
          }
        }
        if(!answers.lineDetail){
          if(context.showDiagnostics){
            answers.lineDetail='diagnostics';
          }else if(context.showIntervals){
            answers.lineDetail='intervals';
          }else if(context.showLine){
            answers.lineDetail='minimal';
          }else{
            answers.lineDetail='hide';
          }
        }
        scatterAdvisorState.answers=answers;
        return answers;
      }

      function buildScatterAdvisorQuestions(context){
        if(context.graphType!=='scatter'){
          return [];
        }
        return [
          {
            id:'measurement',
            prompt:'How are X and Y measured?',
            help:'This determines whether Pearson or Spearman correlation fits best.',
            options:[
              { value:'continuousNormal', label:'Continuous and roughly symmetric' },
              { value:'continuousNonNormal', label:'Continuous with skew/outliers' },
              { value:'ordinal', label:'Ordinal or ranked values' },
              { value:'binaryOutcome', label:'Binary or 0–1 response vs. predictor' }
            ]
          },
          {
            id:'trend',
            prompt:'Which pattern best describes the relationship?',
            help:'Choose a trend to fit when drawing the optional line.',
            options:[
              { value:'linear', label:'Straight-line trend' },
              { value:'curved', label:'Single curve (U- or inverted-U)' },
              { value:'sShape', label:'S-shaped / bounded response' },
              { value:'exponential', label:'Exponential growth or decay' },
              { value:'power', label:'Power-law scaling (y ∝ xᵏ)' },
              { value:'multiple', label:'Irregular with multiple bends' }
            ]
          },
          {
            id:'lineDetail',
            prompt:'How much detail should accompany the fitted line?',
            help:'Controls the fitted line, interval shading, and diagnostics on the plot.',
            options:[
              { value:'minimal', label:'Show fitted line only' },
              { value:'intervals', label:'Include confidence/prediction intervals' },
              { value:'diagnostics', label:'Include intervals and diagnostics summary' },
              { value:'hide', label:'Do not draw a trend line' }
            ]
          }
        ];
      }

      function computeScatterAdvisorRecommendation(answers, context){
        const recommendation={
          ready:false,
          message:'',
          summary:'',
          rationale:[],
          warnings:[],
          statsMethod:context.statsMethod || 'pearson',
          regression:context.regressionMode || 'linear',
          showLine:context.showLine,
          showIntervals:context.showIntervals,
          showDiagnostics:context.showDiagnostics
        };
        if(context.graphType!=='scatter'){
          recommendation.message='Switch the graph type to “Scatter Plot” to access correlation and regression guidance.';
          return recommendation;
        }
        if(!answers.measurement || !answers.trend || !answers.lineDetail){
          recommendation.message='Answer the advisor questions to receive a recommendation.';
          return recommendation;
        }
        switch(answers.measurement){
          case 'continuousNormal':
            recommendation.statsMethod='pearson';
            recommendation.rationale.push('Pearson correlation is appropriate for roughly normal, continuous variables.');
            break;
          case 'continuousNonNormal':
            recommendation.statsMethod='spearman';
            recommendation.rationale.push('Spearman correlation is robust to skewed distributions and outliers by ranking the data.');
            break;
          case 'ordinal':
            recommendation.statsMethod='spearman';
            recommendation.rationale.push('Ordinal scales break Pearson assumptions; Spearman works with ranked measurements.');
            break;
          case 'binaryOutcome':
            recommendation.statsMethod='spearman';
            recommendation.rationale.push('Binary responses violate Pearson’s normality assumption, so Spearman is safer.');
            break;
          default:
            break;
        }
        const trendLabels={
          linear:'linear regression line',
          curved:'quadratic regression curve',
          sShape:'logistic regression curve',
          exponential:'exponential regression curve',
          power:'power-law regression curve',
          multiple:'spline smoother'
        };
        switch(answers.trend){
          case 'linear':
            recommendation.regression='linear';
            recommendation.rationale.push('A straight-line model captures linear relationships.');
            break;
          case 'curved':
            recommendation.regression='quadratic';
            recommendation.rationale.push('A quadratic polynomial captures a single bend in the trend.');
            break;
          case 'sShape':
            recommendation.regression='logistic';
            recommendation.rationale.push('Logistic regression models S-shaped responses bounded between 0 and 1.');
            break;
          case 'exponential':
            recommendation.regression='exponential';
            recommendation.rationale.push('Exponential regression fits rapid growth or decay patterns.');
            break;
          case 'power':
            recommendation.regression='power';
            recommendation.rationale.push('Power regression suits scaling relationships where y varies with xᵏ.');
            break;
          case 'multiple':
            recommendation.regression='spline';
            recommendation.rationale.push('A spline smoother adapts to multiple bends without a high-order polynomial.');
            break;
          default:
            break;
        }
        switch(answers.lineDetail){
          case 'minimal':
            recommendation.showLine=true;
            recommendation.showIntervals=false;
            recommendation.showDiagnostics=false;
            recommendation.rationale.push('Showing only the fitted line keeps the scatter uncluttered.');
            break;
          case 'intervals':
            recommendation.showLine=true;
            recommendation.showIntervals=recommendation.regression!=='spline' && recommendation.regression!=='logistic';
            recommendation.showDiagnostics=false;
            recommendation.rationale.push('Confidence/prediction intervals highlight model uncertainty.');
            if(recommendation.regression==='spline' || recommendation.regression==='logistic'){
              recommendation.warnings.push('Interval shading is unavailable for spline or logistic fits and will remain hidden.');
            }
            break;
          case 'diagnostics':
            recommendation.showLine=true;
            recommendation.showIntervals=recommendation.regression!=='spline' && recommendation.regression!=='logistic';
            recommendation.showDiagnostics=true;
            recommendation.rationale.push('Diagnostics summarize residuals to check model assumptions.');
            if(recommendation.regression==='spline' || recommendation.regression==='logistic'){
              recommendation.warnings.push('Interval shading is unavailable for spline or logistic fits and will remain hidden.');
            }
            break;
          case 'hide':
            recommendation.showLine=false;
            recommendation.showIntervals=false;
            recommendation.showDiagnostics=false;
            recommendation.rationale.push('Disabling the trend line keeps the scatter free of model overlays.');
            break;
          default:
            break;
        }
        if(recommendation.regression==='logistic' && !context.approxBinaryY && !context.yWithinZeroOne){
          recommendation.warnings.push('Logistic regression expects a binary or 0–1 bounded response; verify that Y meets this condition.');
        }
        if(context.pointCount>0 && context.pointCount<6){
          recommendation.warnings.push('With fewer than six paired observations the fitted model may be unstable.');
        }
        const methodLabel=recommendation.statsMethod==='pearson'?'Pearson correlation':'Spearman correlation';
        if(recommendation.showLine){
          const regLabel=trendLabels[answers.trend] || `${recommendation.regression} fit`;
          recommendation.summary=`${methodLabel} with a ${regLabel}.`;
        }else{
          recommendation.summary=`${methodLabel} without a fitted trend line.`;
        }
        recommendation.ready=true;
        return recommendation;
      }

      function renderScatterStatsAdvisor(points, providedContext){
        const container=document.getElementById('scatterStatsAdvisor');
        if(!container){
          return;
        }
        const context=providedContext || buildScatterAdvisorContext(points||[]);
        scatterAdvisorState.context=context;
        const answers=ensureScatterAdvisorDefaults(context);
        const recommendation=computeScatterAdvisorRecommendation(answers, context);
        container.innerHTML='';
        const wrapper=document.createElement('div');
        wrapper.className='stats-advisor';
        wrapper.dataset.open=scatterAdvisorState.open?'1':'0';
        const header=document.createElement('div');
        header.className='stats-advisor__header';
        const title=document.createElement('strong');
        title.textContent='Test advisor';
        header.appendChild(title);
        const toggle=document.createElement('button');
        toggle.type='button';
        toggle.className='stats-advisor__toggle';
        toggle.textContent=scatterAdvisorState.open?'Hide advisor':'Guide me';
        toggle.addEventListener('click',()=>{
          scatterAdvisorState.open=!scatterAdvisorState.open;
          console.debug('Debug: scatter statsAdvisor toggled',{ open:scatterAdvisorState.open });
          renderScatterStatsAdvisor(null, scatterAdvisorState.context);
        });
        header.appendChild(toggle);
        wrapper.appendChild(header);
        const summary=document.createElement('div');
        summary.className='stats-advisor__summary';
        if(recommendation.ready){
          const summaryLine=document.createElement('div');
          summaryLine.className='stats-advisor__summary-line';
          summaryLine.textContent=`Recommendation: ${recommendation.summary}`;
          summary.appendChild(summaryLine);
          if(Array.isArray(recommendation.rationale) && recommendation.rationale.length){
            const list=document.createElement('ul');
            list.className='stats-advisor__rationale';
            recommendation.rationale.forEach(item=>{
              const li=document.createElement('li');
              li.textContent=item;
              list.appendChild(li);
            });
            summary.appendChild(list);
          }
          if(Array.isArray(recommendation.warnings) && recommendation.warnings.length){
            const warnTitle=document.createElement('div');
            warnTitle.className='stats-advisor__warnings-title';
            warnTitle.textContent='Cautions:';
            summary.appendChild(warnTitle);
            const warnList=document.createElement('ul');
            warnList.className='stats-advisor__warnings';
            recommendation.warnings.forEach(item=>{
              const li=document.createElement('li');
              li.textContent=item;
              warnList.appendChild(li);
            });
            summary.appendChild(warnList);
          }
        }else{
          const message=document.createElement('div');
          message.textContent=recommendation.message || 'Answer the advisor questions to receive a recommendation.';
          summary.appendChild(message);
        }
        wrapper.appendChild(summary);
        if(scatterAdvisorState.open){
          if(context.graphType==='scatter'){
            const questionsWrap=document.createElement('div');
            questionsWrap.className='stats-advisor__questions';
            const questions=buildScatterAdvisorQuestions(context);
            questions.forEach(question=>{
              const fieldset=document.createElement('fieldset');
              fieldset.className='stats-advisor__question';
              const legend=document.createElement('legend');
              legend.textContent=question.prompt;
              fieldset.appendChild(legend);
              if(question.help){
                const hint=document.createElement('p');
                hint.className='stats-advisor__hint';
                hint.textContent=question.help;
                fieldset.appendChild(hint);
              }
              (question.options||[]).forEach(option=>{
                const label=document.createElement('label');
                label.className='stats-advisor__option';
                const input=document.createElement('input');
                input.type='radio';
                input.name=`scatter-advisor-${question.id}`;
                input.value=option.value;
                input.checked=answers[question.id]===option.value;
                input.addEventListener('change',()=>{
                  answers[question.id]=option.value;
                  scatterAdvisorState.answers=answers;
                  console.debug('Debug: scatter statsAdvisor answer change',{ question:question.id, value:option.value });
                  renderScatterStatsAdvisor(null, scatterAdvisorState.context);
                });
                const span=document.createElement('span');
                span.textContent=option.label;
                label.appendChild(input);
                label.appendChild(span);
                fieldset.appendChild(label);
              });
              questionsWrap.appendChild(fieldset);
            });
            wrapper.appendChild(questionsWrap);
            const actions=document.createElement('div');
            actions.className='stats-advisor__actions';
            const applyBtn=document.createElement('button');
            applyBtn.type='button';
            applyBtn.textContent='Apply recommendation';
            applyBtn.disabled=!recommendation.ready;
            applyBtn.addEventListener('click',()=>{
              if(!recommendation.ready){
                return;
              }
              if(scatterStatType){
                scatterStatType.value=recommendation.statsMethod;
              }
              if(scatterRegressionMode){
                scatterRegressionMode.value=recommendation.regression;
              }
              if(scatterShowLine){
                scatterShowLine.checked=!!recommendation.showLine;
              }
              if(scatterShowIntervals){
                scatterShowIntervals.checked=!!recommendation.showIntervals;
              }
              if(scatterShowDiagnostics){
                scatterShowDiagnostics.checked=!!recommendation.showDiagnostics;
              }
              scatterAdvisorState.lastApplied={ ...recommendation };
              console.debug('Debug: scatter statsAdvisor applied',{
                statsMethod:recommendation.statsMethod,
                regression:recommendation.regression,
                showLine:recommendation.showLine,
                showIntervals:recommendation.showIntervals,
                showDiagnostics:recommendation.showDiagnostics,
                answers:{ ...answers }
              });
              scheduleDrawScatter();
              renderScatterStatsAdvisor(null, scatterAdvisorState.context);
            });
            actions.appendChild(applyBtn);
            const resetBtn=document.createElement('button');
            resetBtn.type='button';
            resetBtn.className='stats-advisor__reset';
            resetBtn.textContent='Reset answers';
            resetBtn.addEventListener('click',()=>{
              scatterAdvisorState.answers={};
              console.debug('Debug: scatter statsAdvisor reset');
              renderScatterStatsAdvisor(null, scatterAdvisorState.context);
            });
            actions.appendChild(resetBtn);
            wrapper.appendChild(actions);
          }else{
            const hint=document.createElement('div');
            hint.className='stats-advisor__hint';
            hint.textContent='Switch to the scatter plot type to receive correlation and regression recommendations.';
            wrapper.appendChild(hint);
          }
        }
        container.appendChild(wrapper);
      }
      scatterAlphaVal.textContent=scatterAlpha.value;
      renderScatterStatsAdvisor([], buildScatterAdvisorContext([]));
      if(scatterGraphTypeSelect){
        scatterGraphTypeSelect.addEventListener('change',()=>{
          console.debug('Debug: scatter graph type change event',{value:scatterGraphTypeSelect.value});
          syncScatterGraphTypeUI();
          scheduleDrawScatter();
        });
      }
      if(scatterLog2FCThreshold){
        scatterLog2FCThreshold.addEventListener('input',()=>{
          console.debug('Debug: scatter log2FC threshold input',{value:scatterLog2FCThreshold.value});
          scheduleDrawScatter();
        });
      }
      if(scatterNegLogPThreshold){
        scatterNegLogPThreshold.addEventListener('input',()=>{
          console.debug('Debug: scatter negLogP threshold input',{value:scatterNegLogPThreshold.value});
          scheduleDrawScatter();
        });
      }
      scatterFill.addEventListener('input',()=>{console.log('scatterFill changed', scatterFill.value); scheduleDrawScatter();});
      scatterBorder.addEventListener('input',()=>{console.log('scatterBorder changed', scatterBorder.value); scheduleDrawScatter();});
      scatterBorderWidth.addEventListener('input',()=>{console.log('scatterBorderWidth changed', scatterBorderWidth.value); scheduleDrawScatter();});
      scatterDotSize.addEventListener('input',()=>{console.log('scatterDotSize changed', scatterDotSize.value); scheduleDrawScatter();});
      scatterAlpha.addEventListener('input',()=>{scatterAlphaVal.textContent=scatterAlpha.value; console.log('scatterAlpha changed',scatterAlpha.value); scheduleDrawScatter();});
      scatterFontSize.addEventListener('input',()=>{
        if(scatterFontSize.dataset){
          scatterFontSize.dataset.fontBasePt = String(scatterFontSize.value);
          console.debug('Debug: scatter font size input manual set',{ value: scatterFontSize.value }); // Debug: manual slider update
        }
        chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value), input: scatterFontSize, manual: true });
        scheduleDrawScatter();
      });
      [scatterShowGrid,scatterStatType,scatterOriginMode,scatterShowLine,scatterShowIntervals,scatterShowDiagnostics]
        .forEach(el=>el&&el.addEventListener('change',()=>{
          console.debug('Debug: scatter config changed', { id: el.id, checked: el.checked, value: el.value });
          if(el===scatterOriginMode){
            const xOk=revalidateActiveScatterLogAxis('x','origin-mode-change');
            const yOk=revalidateActiveScatterLogAxis('y','origin-mode-change');
            if(!xOk||!yOk){
              return;
            }
          }
          scheduleDrawScatter();
        }));
      const handleScatterLogToggle=(axis,checkbox)=>{
        checkbox?.addEventListener('change',()=>{
          const enabling=!!checkbox.checked;
          if(enabling){
            const validation=validateScatterLogAxis(axis);
            if(!validation.allowed){
              checkbox.checked=false;
              const warningMessage=validation.message||`Cannot enable log scale on the ${axis==='x'?'X':'Y'} axis while non-positive values are present.`;
              showScatterLogWarning(warningMessage);
              console.warn('scatter log axis blocked',{ axis, reason: validation.reason, value: validation.value });
              return;
            }
            clearScatterLogWarning();
          }else{
            clearScatterLogWarning();
          }
          console.debug('Debug: scatter log toggle change',{ id: checkbox.id, checked: checkbox.checked });
          scheduleDrawScatter();
        });
      };
      handleScatterLogToggle('x',scatterLogX);
      handleScatterLogToggle('y',scatterLogY);
      if(scatterRegressionMode){
        scatterRegressionMode.addEventListener('change',()=>{
          console.debug('Debug: scatter regression mode change',{ value: scatterRegressionMode.value });
          scheduleDrawScatter();
        });
      }
      scatterShowFrame.addEventListener('change',()=>{console.debug('Debug: scatter showFrame change',{checked:scatterShowFrame.checked}); scheduleDrawScatter();});
      if(scatterShowLegend){
        scatterShowLegend.addEventListener('change',()=>{
          console.debug('Debug: scatter showLegend change',{checked:scatterShowLegend.checked});
          scheduleDrawScatter();
        });
      }
      const scatterAxisInputs=[
        { el: scatterXMin, axis: 'x', context: 'axis-min-input', logLabel: 'scatterXMin changed' },
        { el: scatterXMax, axis: 'x', context: 'axis-max-input', logLabel: 'scatterXMax changed' },
        { el: scatterYMin, axis: 'y', context: 'axis-min-input', logLabel: 'scatterYMin changed' },
        { el: scatterYMax, axis: 'y', context: 'axis-max-input', logLabel: 'scatterYMax changed' },
        { el: scatterOriginX, axis: 'x', context: 'origin-input', logLabel: 'scatterOriginX changed' },
        { el: scatterOriginY, axis: 'y', context: 'origin-input', logLabel: 'scatterOriginY changed' }
      ];
      scatterAxisInputs.forEach(({el,axis,context,logLabel})=>{
        if(!el){
          return;
        }
        el.addEventListener('input',()=>{
          console.log(logLabel, el.value);
          if(!revalidateActiveScatterLogAxis(axis,context)){
            return;
          }
          if(!scatterLogX?.checked && !scatterLogY?.checked){
            clearScatterLogWarning();
          }
          scheduleDrawScatter();
        });
      });
      syncScatterGraphTypeUI();

      function ensureScatterLabelColors(labels){
        if(scatterCurrentGraphType!=='scatter'){
          return;
        }
        const labelSet=new Set(labels);
        labels.forEach((lab,i)=>{
          if(!scatterLabelColors[lab]){
            scatterLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
            console.debug('Debug: scatter default label color applied',{label:lab,color:scatterLabelColors[lab]});
          }
        });
        Object.keys(scatterLabelColors).forEach(existing=>{
          if(!labelSet.has(existing)){
            console.debug('Debug: scatter label color pruned',{label:existing});
            delete scatterLabelColors[existing];
          }
        });
        console.debug('Debug: ensureScatterLabelColors sync complete',{count:Object.keys(scatterLabelColors).length});
      }

      function sanitizeScatterLabelShape(value, index){
        if(SCATTER_SHAPE_VALUES.has(value)){
          return value;
        }
        const safeIndex = Number.isInteger(index) ? index : 0;
        return SCATTER_SHAPE_DEFAULTS[safeIndex % SCATTER_SHAPE_DEFAULTS.length];
      }

      function ensureScatterLabelShapes(labels){
        if(scatterCurrentGraphType!=='scatter'){
          scatterLabelShapes = {};
          return;
        }
        const labelSet = new Set(labels);
        labels.forEach((lab, idx)=>{
          if(!lab){ return; }
          const sanitized = sanitizeScatterLabelShape(scatterLabelShapes[lab], idx);
          scatterLabelShapes[lab] = sanitized;
        });
        Object.keys(scatterLabelShapes).forEach(existing=>{
          if(!labelSet.has(existing)){
            delete scatterLabelShapes[existing];
          }
        });
        scatterDebug('Debug: ensureScatterLabelShapes sync complete',{count:Object.keys(scatterLabelShapes).length});
      }

      function createScatterMarkerElement(shape, options){
        const doc = global.document;
        if(!doc){ return null; }
        const normalized = SCATTER_SHAPE_VALUES.has(shape) ? shape : 'circle';
        const radius = Math.max(0, Number(options?.radius) || 0);
        const cx = Number(options?.cx) || 0;
        const cy = Number(options?.cy) || 0;
        const fill = options?.fill ?? '#000000';
        const stroke = options?.stroke ?? null;
        const strokeWidthRaw = Number(options?.strokeWidth);
        const strokeWidth = Number.isFinite(strokeWidthRaw) && strokeWidthRaw > 0 ? strokeWidthRaw : 0;
        const fillOpacityRaw = Number(options?.fillOpacity);
        const fillOpacity = Number.isFinite(fillOpacityRaw) ? Math.min(Math.max(fillOpacityRaw, 0), 1) : 1;
        const strokeOpacityRaw = Number(options?.strokeOpacity);
        const strokeOpacity = Number.isFinite(strokeOpacityRaw) ? Math.min(Math.max(strokeOpacityRaw, 0), 1) : fillOpacity;
        const applyCommonAttributes = (node) => {
          if(!node){ return null; }
          node.setAttribute('fill', fill);
          if(fillOpacity !== 1){
            node.setAttribute('fill-opacity', String(fillOpacity));
          }
          if(stroke && strokeWidth > 0){
            node.setAttribute('stroke', stroke);
            node.setAttribute('stroke-width', String(strokeWidth));
            if(strokeOpacity !== 1){
              node.setAttribute('stroke-opacity', String(strokeOpacity));
            }
          }else if(stroke){
            node.setAttribute('stroke', stroke);
            node.setAttribute('stroke-width', '0');
            if(strokeOpacity !== 1){
              node.setAttribute('stroke-opacity', String(strokeOpacity));
            }
          }
          return node;
        };
        if(normalized === 'square'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const rect = doc.createElementNS(NS, 'rect');
          rect.setAttribute('x', String(cx - half));
          rect.setAttribute('y', String(cy - half));
          rect.setAttribute('width', String(size));
          rect.setAttribute('height', String(size));
          return applyCommonAttributes(rect);
        }
        if(normalized === 'triangle'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const path = doc.createElementNS(NS, 'path');
          const d = `M ${cx} ${cy - half} L ${cx + half} ${cy + half} L ${cx - half} ${cy + half} Z`;
          path.setAttribute('d', d);
          return applyCommonAttributes(path);
        }
        if(normalized === 'diamond'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const path = doc.createElementNS(NS, 'path');
          const d = `M ${cx} ${cy - half} L ${cx + half} ${cy} L ${cx} ${cy + half} L ${cx - half} ${cy} Z`;
          path.setAttribute('d', d);
          return applyCommonAttributes(path);
        }
        if(normalized === 'cross'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const bar = Math.max(size / 3, 2);
          const halfBar = bar / 2;
          const top = cy - half;
          const bottom = cy + half;
          const left = cx - half;
          const right = cx + half;
          const path = doc.createElementNS(NS, 'path');
          const d = `M ${cx - halfBar} ${top} H ${cx + halfBar} V ${cy - halfBar} H ${right} V ${cy + halfBar} H ${cx + halfBar} V ${bottom} H ${cx - halfBar} V ${cy + halfBar} H ${left} V ${cy - halfBar} H ${cx - halfBar} Z`;
          path.setAttribute('d', d);
          return applyCommonAttributes(path);
        }
        const circle = doc.createElementNS(NS, 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', String(radius));
        return applyCommonAttributes(circle);
      }

      function createBubbleRadiusScaler(points, baseRadius){
        const safeBase = Math.max(1, Number(baseRadius) || 1);
        let minValue = Infinity;
        let maxValue = -Infinity;
        let count = 0;
        if(Array.isArray(points)){
          for(let i = 0; i < points.length; i += 1){
            const point = points[i];
            if(!point){ continue; }
            const raw = point.bubbleValue;
            const magnitude = Math.abs(Number(raw));
            if(!Number.isFinite(magnitude)){ continue; }
            if(magnitude < minValue){ minValue = magnitude; }
            if(magnitude > maxValue){ maxValue = magnitude; }
            count += 1;
          }
        }
        const minRadius = Math.max(1, safeBase * 0.6);
        const maxRadius = Math.max(minRadius + 1, safeBase * 2.8);
        if(count === 0){
          const fallback = Math.max(minRadius, Math.min(maxRadius, safeBase));
          return () => fallback;
        }
        if(maxValue <= minValue){
          const radius = Math.max(minRadius, Math.min(maxRadius, safeBase));
          return () => radius;
        }
        return point => {
          const value = Math.abs(Number(point?.bubbleValue));
          if(!Number.isFinite(value)){
            return minRadius;
          }
          const ratio = (value - minValue) / (maxValue - minValue);
          const clamped = Math.min(Math.max(ratio, 0), 1);
          return minRadius + (maxRadius - minRadius) * clamped;
        };
      }
    
      const scatterPlotDiv=document.getElementById('scatterPlot');
      const scatterContainer=scatterPlotDiv.closest('.svgbox')||scatterPlotDiv.parentElement;
      if(!scatterContainer){
        console.debug('Debug: scatter resizer container missing', { hasContainer: !!scatterContainer });
      }

      let scatterTitleText='Scatter plot';
      let scatterXLabelText='X';
      let scatterYLabelText='Y';
      let scatterZLabelText='Z';
      async function drawScatter(){
        const debugEnabled = typeof Shared.isDebugEnabled === 'function' ? Shared.isDebugEnabled() : false;
        const debug = debugEnabled ? console.debug.bind(console) : () => {};
        const info = debugEnabled ? console.log.bind(console) : () => {};
        const time = debugEnabled ? console.time.bind(console) : () => {};
        const timeEnd = debugEnabled ? console.timeEnd.bind(console) : () => {};
        const rowSkipCounts = debugEnabled ? Object.create(null) : null;
        const recordRowSkip = debugEnabled
          ? (reason => {
              rowSkipCounts[reason] = (rowSkipCounts[reason] || 0) + 1;
            })
          : () => {};
        const collectProgressInterval = 5000;
        let nextCollectProgressRow = debugEnabled ? collectProgressInterval : Number.POSITIVE_INFINITY;
        const pointProgressInterval = 5000;
        let nextPointProgress = debugEnabled ? pointProgressInterval : Number.POSITIVE_INFINITY;
        const token=++scatterDrawToken; // debug token for cancellation
        info('drawScatter called',{token});
        scatterState.rotationPending = false;
        scatterState.rotationPendingLogged = false;
        hideScatterTooltip('draw-start');
        const fill=scatterFill.value||DEFAULT_NON_SIG_COLOR;
        const alpha=Number(scatterAlpha.value)||0;
        const borderWidthRaw=Number(scatterBorderWidth.value);
        const borderColor=scatterBorder.value;
        const containerRect=scatterSvgBox?.getBoundingClientRect?.();
        const fontInfo=chartStyle.resolveScaledFontSize({
          rawSize: scatterFontSize.value,
          width: containerRect?.width,
          height: containerRect?.height,
          svgBox: scatterSvgBox,
          input: scatterFontSize
        });
        const fs=fontInfo.scaledPx;
        const styleScaleInfo=fontInfo.scaleInfo;
        const axisStrokeWidthBase = getScatterAxisStrokeWidth();
        const axisStrokeWidth=chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'scatter-axis', min: 0.25 });
        const axisStroke = getScatterAxisColor();
        const dotSizeRaw=Number(scatterDotSize.value)||3;
        const dotSizePx=chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'scatter-point', min: 0 });
        const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'scatter-border', min: 0 });
        debug('Debug: scatter style scaling applied',{
          dotSizeRaw,
          dotSizePx,
          borderWidthRaw,
          borderWidthPx,
          axisStrokeWidth,
          axisStrokeWidthBase,
          axisStroke,
          styleScale: styleScaleInfo?.styleScale
        }); // Debug: scatter style scaling summary
        chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, fontInfo, input: scatterFontSize });
        debug('Debug: scatter font scaling applied',{
          input: scatterFontSize.value,
          fontSizePt: fontInfo.pt,
          baseFontPx: fontInfo.px,
          scaledFontPx: fs,
          scale: fontInfo.scaleInfo?.scale,
          containerWidth: containerRect?.width,
          containerHeight: containerRect?.height
        }); // Debug: scatter font scaling summary
        const axisMetrics=chartStyle.createAxisMetrics(fs);
        debug('Debug: scatter axis metrics',axisMetrics);
        const showGrid=scatterShowGrid.checked;
        info('scatter showGrid', showGrid);
        const showFrame=scatterShowFrame.checked;
        debug('Debug: scatter showFrame state',{showFrame});
        const showLegend = scatterShowLegend ? scatterShowLegend.checked : true;
        debug('Debug: scatter legend toggle state',{ showLegend });
        let showLine=scatterShowLine.checked;
        const showIntervals = !!(scatterShowIntervals && scatterShowIntervals.checked);
        const showDiagnostics = !!(scatterShowDiagnostics && scatterShowDiagnostics.checked);
        const graphType=scatterGraphTypeSelect?.value || 'scatter';
        scatterCurrentGraphType=graphType;
        const allowLogAxes=graphType==='scatter';
        if(!allowLogAxes){
          if(scatterLogX?.checked){
            scatterLogX.checked=false;
          }
          if(scatterLogY?.checked){
            scatterLogY.checked=false;
          }
          if(showLine){
            showLine=false;
          }
        }
        const logX=allowLogAxes && scatterLogX ? scatterLogX.checked : false;
        const logY=allowLogAxes && scatterLogY ? scatterLogY.checked : false;
        if(scatterShowLine){
          scatterShowLine.disabled=!allowLogAxes;
          if(!allowLogAxes && scatterShowLine.checked){
            scatterShowLine.checked=false;
          }
        }
        debug('Debug: scatter graph type resolved',{graphType,allowLogAxes,logX,logY});
        if(!allowLogAxes){
          debug('Debug: scatter forcing trend line off',{graphType});
        }
        debug('Debug: scatter regression toggles', { showLine, showIntervals, showDiagnostics });
        info('drawScatter dot size', dotSizeRaw);
        const log2fcThresholdValue=parseFloat(scatterLog2FCThreshold?.value);
        const negLogPThresholdValue=parseFloat(scatterNegLogPThreshold?.value);
        const log2fcThreshold=Number.isFinite(log2fcThresholdValue)?log2fcThresholdValue:0;
        const negLogPThreshold=Number.isFinite(negLogPThresholdValue)?negLogPThresholdValue:0;
        debug('Debug: scatter threshold values',{graphType,log2fcThreshold,negLogPThreshold});
        const method=scatterStatType.value;
        const xMinManual=parseFloat(scatterXMin.value);
        const xMaxManual=parseFloat(scatterXMax.value);
        const yMinManual=parseFloat(scatterYMin.value);
        const yMaxManual=parseFloat(scatterYMax.value);
        info('scatter manual range',{xMinManual,xMaxManual,yMinManual,yMaxManual});
        const originMode=scatterOriginMode.value;
        const originXInput=parseFloat(scatterOriginX.value);
        const originYInput=parseFloat(scatterOriginY.value);
        info('scatter origin inputs',{originMode,originXInput,originYInput});
        const analysis = scatterHot?.getAnalysisData?.() || Shared.hot.getAnalysisData(scatterHot);
        const rowCount = analysis.rowCount || 0;
        const colCount = analysis.colCount || 0;
        const extractColumn = (colIndex)=>{
          if(colIndex >= colCount){
            return [];
          }
          const values = [];
          for(let r = 0; r < rowCount; r++){
            values.push(analysis.data?.[r]?.[colIndex]);
          }
          return values;
        };
        if(analysis.isColumnExcluded?.(1) || analysis.isColumnExcluded?.(2)){
          console.warn('Scatter draw cancelled - axis column excluded',{ excludeX: analysis.isColumnExcluded?.(1), excludeY: analysis.isColumnExcluded?.(2) });
          chartStyle.clearSvg(scatterSvg);
          return;
        }
        const labelCol = extractColumn(0);
        const xCol = extractColumn(1);
        const yCol = extractColumn(2);
        const extraCol = extractColumn(3);
        info('scatter column lengths',{label:labelCol.length,x:xCol.length,y:yCol.length,extra:extraCol.length});
        const xLabelRaw=xCol[0];
        const yLabelRaw=yCol[0];
        const extraLabelRaw=extraCol[0];
        if(graphType==='volcano'){
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'log2 Fold Change';
          const basePLabel=(yLabelRaw&&String(yLabelRaw).trim())||'p-value';
          scatterYLabelText=`-log10(${basePLabel})`;
        }else if(graphType==='ma'){
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'Mean Expression';
          scatterYLabelText=(yLabelRaw&&String(yLabelRaw).trim())||'log2 Fold Change';
        }else{
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'X';
          scatterYLabelText=(yLabelRaw&&String(yLabelRaw).trim())||'Y';
          const zHeader = extraLabelRaw && String(extraLabelRaw).trim();
          scatterZLabelText = zHeader || 'Z';
        }
        const maxLen=rowCount;
        let points=[];
        const shouldCollectLabelSet = scatterCurrentGraphType === 'scatter';
        const labelSet=shouldCollectLabelSet ? new Set() : null;
        const labelAnnotations=[];
        let legendLayout=null;
        let legendRenderer=EMPTY_LEGEND_RENDERER;
        let legendGapPx=0;
        let legendWidth=0;
        let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity;
        let skippedRows=0;
        let significantCount=0;
        let maMissingPCount=0;
        const hasZColumn = colCount > 3;
        const scatter3dCandidates = [];
        let scatter3dEligible = graphType === 'scatter' && hasZColumn;
        let scatter3dMissingZ = 0;
        let scatter3dInvalidZ = 0;
        let zMinRaw=Infinity, zMaxRaw=-Infinity;
        let bubbleEligible = graphType === 'scatter' && hasZColumn;
        let bubbleValidCount = 0;
        let bubbleInvalidCount = 0;
        let bubbleMissingCount = 0;
        let bubbleMinRaw = Infinity;
        let bubbleMaxRaw = -Infinity;
        time(`scatterCollectPoints_${token}`);
        for(let r=1;r<maxLen;r++){
          const labelValue = labelCol[r];
          const lab=labelValue ? String(labelValue).trim() : '';
          const rawX=xCol[r];
          const rawY=yCol[r];
          if(graphType==='scatter'){
            if(rawX === null || rawY === null || typeof rawX === 'undefined' || typeof rawY === 'undefined'){
              skippedRows++;
              recordRowSkip('scatter:missingValue');
              continue;
            }
            const xv=parseFloat(rawX);
            const yv=parseFloat(rawY);
            const rawZ = hasZColumn ? extraCol[r] : undefined;
            const hasZValue = hasZColumn && rawZ !== null && typeof rawZ !== 'undefined' && rawZ !== '';
            const zv = hasZValue ? Number(rawZ) : NaN;
            if(!Number.isNaN(xv) && Number.isFinite(xv) && !Number.isNaN(yv) && Number.isFinite(yv)){
              const pointRecord = {x:xv,y:yv,label:lab};
              if(hasZValue && Number.isFinite(zv)){
                pointRecord.z = zv;
                pointRecord.bubbleValue = zv;
                scatter3dCandidates.push({ x: xv, y: yv, z: zv, label: lab, index: scatter3dCandidates.length });
                if(zv<zMinRaw) zMinRaw=zv;
                if(zv>zMaxRaw) zMaxRaw=zv;
                if(zv<bubbleMinRaw) bubbleMinRaw = zv;
                if(zv>bubbleMaxRaw) bubbleMaxRaw = zv;
                bubbleValidCount += 1;
              }else if(hasZValue){
                scatter3dEligible = false;
                scatter3dInvalidZ += 1;
                recordRowSkip('scatter3d:nonNumericZ');
                bubbleEligible = false;
                bubbleInvalidCount += 1;
              }else{
                scatter3dEligible = false;
                scatter3dMissingZ += 1;
                if(hasZColumn){
                  bubbleEligible = false;
                  bubbleMissingCount += 1;
                }
              }
              if(!hasZValue && hasZColumn){
                pointRecord.bubbleValue = NaN;
              }
              points.push(pointRecord);
              if(labelSet && lab) labelSet.add(lab);
              if(xv<xMinRaw) xMinRaw=xv;
              if(xv>xMaxRaw) xMaxRaw=xv;
              if(yv<yMinRaw) yMinRaw=yv;
              if(yv>yMaxRaw) yMaxRaw=yv;
            }else{
              skippedRows++;
              recordRowSkip('scatter:nonNumeric');
            }
          }else if(graphType==='volcano'){
            if(rawX === null || rawY === null || typeof rawX === 'undefined' || typeof rawY === 'undefined'){
              skippedRows++;
              recordRowSkip('volcano:missingValue');
              continue;
            }
            const log2fc=parseFloat(rawX);
            const pRaw=parseFloat(rawY);
            if(Number.isFinite(log2fc) && Number.isFinite(pRaw) && pRaw>0){
              let negLogP=-Math.log10(pRaw);
              if(!Number.isFinite(negLogP)){
                negLogP=-Math.log10(Number.MIN_VALUE);
              }
              const isSignificant=Math.abs(log2fc)>=log2fcThreshold && negLogP>=negLogPThreshold;
              const labelValueFinal = lab && (shouldCollectLabelSet || isSignificant) ? lab : '';
              points.push({x:log2fc,y:negLogP,label:labelValueFinal,isSignificant});
              if(isSignificant) significantCount++;
              if(labelSet && lab) labelSet.add(lab);
              if(log2fc<xMinRaw) xMinRaw=log2fc;
              if(log2fc>xMaxRaw) xMaxRaw=log2fc;
              if(negLogP<yMinRaw) yMinRaw=negLogP;
              if(negLogP>yMaxRaw) yMaxRaw=negLogP;
            }else{
              skippedRows++;
              recordRowSkip('volcano:invalid');
            }
          }else{
            if(rawX === null || rawY === null || typeof rawX === 'undefined' || typeof rawY === 'undefined'){
              skippedRows++;
              recordRowSkip('ma:missingValue');
              continue;
            }
            const meanExpr=parseFloat(rawX);
            const log2fcVal=parseFloat(rawY);
            const rawExtra = extraCol[r];
            const pRaw = rawExtra === null || typeof rawExtra === 'undefined' ? NaN : parseFloat(rawExtra);
            const hasPositiveP=Number.isFinite(pRaw) && pRaw>0;
            if(Number.isFinite(meanExpr) && Number.isFinite(log2fcVal)){
              let negLogP=hasPositiveP?-Math.log10(pRaw):NaN;
              if(hasPositiveP && !Number.isFinite(negLogP)){
                negLogP=-Math.log10(Number.MIN_VALUE);
              }
              const isSignificant=hasPositiveP && Math.abs(log2fcVal)>=log2fcThreshold && Number.isFinite(negLogP) && negLogP>=negLogPThreshold;
              const labelValueFinal = lab && (shouldCollectLabelSet || isSignificant) ? lab : '';
              points.push({x:meanExpr,y:log2fcVal,label:labelValueFinal,isSignificant});
              if(isSignificant) significantCount++;
              if(!hasPositiveP){
                maMissingPCount++;
                recordRowSkip('ma:missingPositiveP');
              }
              if(labelSet && lab) labelSet.add(lab);
              if(meanExpr<xMinRaw) xMinRaw=meanExpr;
              if(meanExpr>xMaxRaw) xMaxRaw=meanExpr;
              if(log2fcVal<yMinRaw) yMinRaw=log2fcVal;
              if(log2fcVal>yMaxRaw) yMaxRaw=log2fcVal;
            }else{
              skippedRows++;
              recordRowSkip('ma:nonNumeric');
            }
          }
          if(r >= nextCollectProgressRow){
            info('scatter collect progress',{row:r,token});
            nextCollectProgressRow += collectProgressInterval;
          }
        }
        timeEnd(`scatterCollectPoints_${token}`);
        if(debugEnabled && rowSkipCounts && Object.keys(rowSkipCounts).length){
          debug('Debug: scatter row skip summary',{graphType,skippedRows,reasons:rowSkipCounts});
        }else if(skippedRows>0){
          debug('Debug: scatter skipped rows summary',{graphType,skippedRows});
        }
        if(debugEnabled && maMissingPCount>0){
          debug('Debug: MA missing p-values summary',{count:maMissingPCount});
        }
        if(scatterCurrentGraphType==='scatter'){
          debug('Debug: scatter 3d candidate summary',{
            hasZColumn,
            eligible: scatter3dEligible,
            candidateCount: scatter3dCandidates.length,
            missingZ: scatter3dMissingZ,
            invalidZ: scatter3dInvalidZ
          });
          debug('Debug: scatter bubble candidate summary',{
            hasZColumn,
            eligible: bubbleEligible,
            validCount: bubbleValidCount,
            invalidCount: bubbleInvalidCount,
            missingCount: bubbleMissingCount,
            min: bubbleMinRaw,
            max: bubbleMaxRaw
          });
        }
        const labelsUsed=labelSet?Array.from(labelSet):[];
        debug('Debug: scatter label summary',{graphType:scatterCurrentGraphType,labelCount:labelsUsed.length,tracked:shouldCollectLabelSet}); // Debug: label usage summary
        if(scatterCurrentGraphType!=='scatter'){
          renderScatterStatsAdvisor([], buildScatterAdvisorContext([]));
        }
        ensureScatterLabelColors(labelsUsed);
        ensureScatterLabelShapes(labelsUsed);
        const labelShapeLookup=new Map();
        labelsUsed.forEach((lab, idx)=>{
          if(!lab){ return; }
          const sanitized = sanitizeScatterLabelShape(scatterLabelShapes[lab], idx);
          scatterLabelShapes[lab] = sanitized;
          labelShapeLookup.set(lab, sanitized);
        });
        info('scatter points collected',points.length,{xMinRaw,xMaxRaw,yMinRaw,yMaxRaw,graphType});
        const significanceLegendNeeded=scatterCurrentGraphType!=='scatter';
        if(token!==scatterDrawToken){info('scatter draw cancelled after collect',{token});return;}
        const plotEl=document.getElementById('scatterPlot');
        plotEl.style.display='block';
        const clearScatterPlot=()=>{
          if(!plotEl){
            return;
          }
          while(plotEl.firstChild){
            plotEl.removeChild(plotEl.firstChild);
          }
        };
        const renderScatterNotice=(message)=>{
          plotEl.style.aspectRatio='';
          plotEl.style.padding='';
          clearScatterPlot();
          const notice=document.createElement('i');
          notice.textContent=message;
          plotEl.appendChild(notice);
        };
        document.getElementById('scatterStatsResults').innerHTML='';
        if(!points.length){
          renderScatterNotice('No valid data points to plot.');
          debug('Debug: scatter plot aborted due to empty dataset',{graphType});
          return;
        }
        if(logX&&points.some(p=>p.x<=0)){
          renderScatterNotice('Log scale requires positive X values.');
          return;
        }
        if(logY&&points.some(p=>p.y<=0)){
          renderScatterNotice('Log scale requires positive Y values.');
          return;
        }
        let xMin=xMinRaw, xMax=xMaxRaw, yMin=yMinRaw, yMax=yMaxRaw;
        if(isFinite(xMinManual)) xMin=xMinManual;
        if(isFinite(xMaxManual)) xMax=xMaxManual;
        if(isFinite(yMinManual)) yMin=yMinManual;
        if(isFinite(yMaxManual)) yMax=yMaxManual;
        if(originMode==='custom'){
          if(isFinite(originXInput)){
            if(logX && originXInput<=0){
              info('scatter custom origin ignored for X in log scale', originXInput);
            }else{
              if(originXInput<xMin) xMin=originXInput;
              if(originXInput>xMax) xMax=originXInput;
            }
          }
          if(isFinite(originYInput)){
            if(logY && originYInput<=0){
              info('scatter custom origin ignored for Y in log scale', originYInput);
            }else{
              if(originYInput<yMin) yMin=originYInput;
              if(originYInput>yMax) yMax=originYInput;
            }
          }
          info('scatter range adjusted for custom origin',{xMin,xMax,yMin,yMax});
        }
        const pointsInRange=points.filter(p=>p.x>=xMin&&p.x<=xMax&&p.y>=yMin&&p.y<=yMax);
        const removedForRange=points.length-pointsInRange.length;
        if(removedForRange>0){
          debug('Debug: scatter filtered points outside axis',{removed:removedForRange,xMin,xMax,yMin,yMax});
        }
        if(!pointsInRange.length){
          if(scatterCurrentGraphType==='scatter'){
            renderScatterStatsAdvisor([], buildScatterAdvisorContext([]));
          }
          renderScatterNotice('No points fall within the specified axis range.');
          debug('Debug: scatter plot aborted due to range filter',{range:{xMin,xMax,yMin,yMax}});
          return;
        }
        if(scatterCurrentGraphType==='scatter'){
          renderScatterStatsAdvisor(pointsInRange);
        }else{
          significantCount=pointsInRange.reduce((acc,p)=>acc+(p.isSignificant?1:0),0);
        }
        const visibleLabels = shouldCollectLabelSet
          ? Array.from(new Set(pointsInRange.map(p=>p.label).filter(Boolean)))
          : [];
        legendLayout = null;
        if(showLegend){
          const legendEntries=[];
          if(scatterCurrentGraphType==='scatter'){
            visibleLabels.forEach((labelName, labelIndex)=>{
              const shapeValue = sanitizeScatterLabelShape(scatterLabelShapes[labelName], labelIndex);
              scatterLabelShapes[labelName] = shapeValue;
              legendEntries.push({
                label:labelName,
                fill:scatterLabelColors[labelName]||fill,
                key:labelName,
                editable:true,
                shape: shapeValue,
                labelIndex
              });
            });
          }else if(significanceLegendNeeded){
            legendEntries.push({label:'Significant',fill:SIGNIFICANT_COLOR});
            legendEntries.push({label:'Not significant',fill});
          }
          legendLayout = chartStyle.computeLegendLayout({
            entries:legendEntries,
            fontSize:fs,
            strokeWidth:borderWidthPx,
            onSwatchClick:({ entry, event, swatch, index })=>{
              const labelKey=entry?.key;
              if(!labelKey){
                return;
              }
              if(event){ event.stopPropagation(); }
              const currentColor=scatterLabelColors[labelKey]||entry.fill;
              const labelIndex = Number.isInteger(entry?.labelIndex) ? entry.labelIndex : (Number.isInteger(index) ? index : visibleLabels.indexOf(labelKey));
              const currentShape = sanitizeScatterLabelShape(scatterLabelShapes[labelKey], labelIndex);
              scatterLabelShapes[labelKey] = currentShape;
              const applyLegendColor=value=>{
                const nextValue=value!=null?String(value):'';
                const previousValue=scatterLabelColors[labelKey] || '';
                if(nextValue){
                  if(previousValue===nextValue){
                    return true;
                  }
                  scatterLabelColors[labelKey]=nextValue;
                }else if(previousValue){
                  delete scatterLabelColors[labelKey];
                }else{
                  return true;
                }
                scheduleDrawScatter();
                return true;
              };
              const applyLegendShape=value=>{
                const sanitizedValue=sanitizeScatterLabelShape(value, labelIndex);
                if(sanitizeScatterLabelShape(scatterLabelShapes[labelKey], labelIndex)===sanitizedValue){
                  return true;
                }
                scatterLabelShapes[labelKey]=sanitizedValue;
                scheduleDrawScatter();
                return true;
              };
              let previousColor=currentColor;
              let previousShape=currentShape;
              Shared.openColorPicker({
                anchor:swatch,
                color:currentColor,
                shapePicker: scatterCurrentGraphType==='scatter' && scatterState.viewMode !== 'bubble' ? {
                  value: currentShape,
                  options: SCATTER_SHAPE_OPTIONS,
                  onChange(nextShape){
                    const sanitized = sanitizeScatterLabelShape(nextShape, labelIndex);
                    if(sanitized===previousShape){
                      return;
                    }
                    applyLegendShape(sanitized);
                    recordScatterChange(`scatter:legend-shape:${labelKey}`,previousShape,sanitized,applyLegendShape);
                    previousShape=sanitized;
                    debug('Debug: scatter legend shape change',{ label: labelKey, shape: sanitized, index: labelIndex });
                  }
                } : null,
                onInput(value){
                  applyLegendColor(value);
                  debug('Debug: scatter legend color input',{label:labelKey,color:value});
                },
                onChange(value){
                  const nextValue=value!=null?String(value):'';
                  if(nextValue===previousColor){
                    return;
                  }
                  applyLegendColor(nextValue);
                  recordScatterChange(`scatter:legend-color:${labelKey}`,previousColor,nextValue,applyLegendColor);
                  previousColor=nextValue;
                }
              });
            }
          });
          legendRenderer=legendLayout.renderer || EMPTY_LEGEND_RENDERER;
          legendGapPx=legendLayout.legendGapPx || 0;
          legendWidth=legendLayout.legendWidthForMargin || 0;
        }else{
          legendLayout = null;
          legendRenderer=EMPTY_LEGEND_RENDERER;
          legendGapPx=0;
          legendWidth=0;
          debug('Debug: scatter legend hidden via toggle',{graphType:scatterCurrentGraphType});
        }
        const legendVisible = showLegend && legendRenderer.entries.length > 0;
        debug('Debug: scatter legend metrics',{legendWidth,legendGapPx,entryCount:legendRenderer.entries.length,graphType:scatterCurrentGraphType,showLegend,legendVisible});
        points = pointsInRange;
        if(xMin===xMax) xMax=xMin+1;
        if(yMin===yMax) yMax=yMin+1;
        info('scatter final raw range',{xMin,xMax,yMin,yMax});
        let points3dInRange = [];
        if(scatterCurrentGraphType==='scatter' && scatter3dCandidates.length){
          points3dInRange = scatter3dCandidates.filter(pt => pt.x>=xMin && pt.x<=xMax && pt.y>=yMin && pt.y<=yMax);
        }
        let supports3d = scatterCurrentGraphType==='scatter' && scatter3dEligible && scatter3dCandidates.length>=3 && points3dInRange.length>=3;
        let supportsBubble = false;
        if(scatterCurrentGraphType==='scatter' && bubbleEligible){
          let bubbleValidInRange = 0;
          let bubbleMissingInRange = 0;
          for(let i = 0; i < pointsInRange.length; i += 1){
            const candidate = pointsInRange[i];
            if(Number.isFinite(candidate?.bubbleValue)){
              bubbleValidInRange += 1;
            }else{
              bubbleMissingInRange += 1;
            }
          }
          supportsBubble = bubbleValidInRange > 0 && bubbleMissingInRange === 0;
        }
        scatterState.supports3d = supports3d;
        scatterState.supportsBubble = supportsBubble;
        updateScatterViewModeOptionVisibility();
        const desiredViewMode = scatterState.requestedViewMode || scatterState.viewMode || '2d';
        const allowAdvanced = scatterCurrentGraphType === 'scatter';
        const effectiveViewMode = applyScatterViewMode(desiredViewMode, {
          allow3d: allowAdvanced,
          allowBubble: allowAdvanced,
          skipSchedule: true,
          forceUpdate: true
        });
        if(effectiveViewMode === '3d' && !supports3d){
          renderScatterNotice('3D scatter view requires numeric X, Y, and Z values (with at least three complete rows). Add a Z column to continue.');
          debug('Debug: scatter 3d view pending dataset',{ supports3d, candidateCount: scatter3dCandidates.length, pointsInRange: points3dInRange.length });
          return;
        }
        if(effectiveViewMode === 'bubble' && !supportsBubble){
          renderScatterNotice('Bubble view requires numeric X, Y, and bubble columns with non-missing values for every visible row.');
          debug('Debug: scatter bubble view pending dataset',{ supportsBubble, bubbleEligible, bubbleCandidates: pointsInRange.length });
          return;
        }
        const existingScatterSvg = plotEl.querySelector('#scatterSvg');
        const reuse3dSvg = supports3d && effectiveViewMode === '3d' && existingScatterSvg && existingScatterSvg.dataset.viewMode === '3d';
        if(!reuse3dSvg){
          clearScatterPlot();
        }
        if(supports3d && effectiveViewMode === '3d'){
          scatterState.rotationPending = false;
          scatterState.rotationPendingLogged = false;
          if(typeof plot3d.normalizeRotation === 'function'){
            plot3d.normalizeRotation(scatterState.rotation);
          }
          const targetAspect = Number.isFinite(SCATTER_3D_DEFAULTS.aspectRatio) && SCATTER_3D_DEFAULTS.aspectRatio > 0 ? SCATTER_3D_DEFAULTS.aspectRatio : (4/3);
          const fallbackWidth = 420;
          const fallbackHeight = Math.round(fallbackWidth / targetAspect);
          const bounds = typeof plotEl.getBoundingClientRect === 'function' ? plotEl.getBoundingClientRect() : { width: 0, height: 0 };
          const availableWidth = Math.floor(bounds.width || plotEl.clientWidth || 0);
          const availableHeight = Math.floor(bounds.height || plotEl.clientHeight || 0);
          let W3 = availableWidth > 0 ? availableWidth : fallbackWidth;
          let H3 = Math.round(W3 / targetAspect);
          if(availableHeight > 0 && H3 > availableHeight){
            H3 = Math.max(1, availableHeight);
            W3 = Math.max(1, Math.round(H3 * targetAspect));
            if(availableWidth > 0 && W3 > availableWidth){
              W3 = Math.max(1, availableWidth);
              H3 = Math.max(1, Math.round(W3 / targetAspect));
            }
          }
          if(W3 <= 0 || H3 <= 0){
            W3 = fallbackWidth;
            H3 = fallbackHeight;
          }
          plotEl.style.position='relative';
          plotEl.style.aspectRatio = `${W3} / ${H3}`;
          plotEl.style.padding = plotEl.style.padding || '12px';
          const svg3 = reuse3dSvg ? existingScatterSvg : document.createElementNS(NS,'svg');
          if(!svg3){
            return;
          }
          if(!reuse3dSvg){
            svg3.setAttribute('id','scatterSvg');
            plotEl.appendChild(svg3);
          }
          svg3.setAttribute('width',String(W3));
          svg3.setAttribute('height',String(H3));
          svg3.setAttribute('viewBox',`0 0 ${W3} ${H3}`);
          svg3.setAttribute('font-family',chartStyle.FONT_FAMILY);
          svg3.dataset.viewMode = '3d';
          chartStyle.applySvgDefaults(svg3);
          while(svg3.firstChild){
            svg3.removeChild(svg3.firstChild);
          }
          svg3.addEventListener('mouseleave', handleScatterPlotMouseLeave);
          plot3d.attachRotationControls(svg3, {
            state: scatterState.rotation,
            onChange: () => scheduleScatterRotationRedraw(),
            shouldIgnorePointer: (event) => {
              if(typeof plot3d.isInteractivePointerTarget === 'function'){
                return plot3d.isInteractivePointerTarget(event?.target);
              }
              return plot3d.isLegendPointerTarget(event?.target);
            },
            debugLabel: 'scatter-3d'
          });
          if(fontControls && typeof fontControls.enableForSvg === 'function'){
            fontControls.enableForSvg(svg3,{ scopeId: 'scatter' });
          }
          const legendAxisGap = Math.max(fs * 0.9, 18);
          const appliedLegendAxisGap = legendVisible ? legendAxisGap : 0;
          const legendGapFor3d = legendLayout?.legendGapPx ?? legendGapPx;
          const baseLegendMargin = Math.max(fs * 2.25, 28);
          const legendMargin = legendVisible ? legendWidth + appliedLegendAxisGap + baseLegendMargin : baseLegendMargin;
          const margin3 = {
            top: Math.max(fs * 3.2, 36),
            right: legendMargin,
            bottom: Math.max(fs * 3.2, 40),
            left: Math.max(fs * 3.2, 40)
          };
          const plotW3 = Math.max(20, W3 - margin3.left - margin3.right);
          const plotH3 = Math.max(20, H3 - margin3.top - margin3.bottom);
          const dataBounds = { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity, zMin: Infinity, zMax: -Infinity };
          points3dInRange.forEach(pt => {
            if(pt.x<dataBounds.xMin) dataBounds.xMin=pt.x;
            if(pt.x>dataBounds.xMax) dataBounds.xMax=pt.x;
            if(pt.y<dataBounds.yMin) dataBounds.yMin=pt.y;
            if(pt.y>dataBounds.yMax) dataBounds.yMax=pt.y;
            if(pt.z<dataBounds.zMin) dataBounds.zMin=pt.z;
            if(pt.z>dataBounds.zMax) dataBounds.zMax=pt.z;
          });
          if(!Number.isFinite(dataBounds.xMin)){ dataBounds.xMin = xMin; }
          if(!Number.isFinite(dataBounds.xMax)){ dataBounds.xMax = xMax; }
          if(!Number.isFinite(dataBounds.yMin)){ dataBounds.yMin = yMin; }
          if(!Number.isFinite(dataBounds.yMax)){ dataBounds.yMax = yMax; }
          if(!Number.isFinite(dataBounds.zMin) || !Number.isFinite(dataBounds.zMax)){
            dataBounds.zMin = Math.min(-1, zMinRaw);
            dataBounds.zMax = Math.max(1, zMaxRaw);
          }
          if(dataBounds.zMin === dataBounds.zMax){
            const pad = Math.abs(dataBounds.zMin) || 1;
            dataBounds.zMin -= pad;
            dataBounds.zMax += pad;
          }
          const baseTickEstimate3d = chartStyle.estimateTickCount ? chartStyle.estimateTickCount(Math.max(plotW3, plotH3), { fallback: 6 }) : 6;
          const tickTarget3d = clampScatterTickTarget(baseTickEstimate3d || 6);
          const xScale3d = buildScatterScale({
            dataMin: dataBounds.xMin,
            dataMax: dataBounds.xMax,
            manualMin: Number.isFinite(xMinManual) ? xMinManual : NaN,
            manualMax: Number.isFinite(xMaxManual) ? xMaxManual : NaN,
            targetTickCount: tickTarget3d
          });
          const yScale3d = buildScatterScale({
            dataMin: dataBounds.yMin,
            dataMax: dataBounds.yMax,
            manualMin: Number.isFinite(yMinManual) ? yMinManual : NaN,
            manualMax: Number.isFinite(yMaxManual) ? yMaxManual : NaN,
            targetTickCount: tickTarget3d
          });
          const zScale3d = buildScatterScale({
            dataMin: dataBounds.zMin,
            dataMax: dataBounds.zMax,
            targetTickCount: tickTarget3d
          });
          const axisRanges3d = {
            x: { min: Number.isFinite(xScale3d.min) ? xScale3d.min : dataBounds.xMin, max: Number.isFinite(xScale3d.max) ? xScale3d.max : dataBounds.xMax },
            y: { min: Number.isFinite(yScale3d.min) ? yScale3d.min : dataBounds.yMin, max: Number.isFinite(yScale3d.max) ? yScale3d.max : dataBounds.yMax },
            z: { min: Number.isFinite(zScale3d.min) ? zScale3d.min : dataBounds.zMin, max: Number.isFinite(zScale3d.max) ? zScale3d.max : dataBounds.zMax }
          };
          const allCorners = [
            { x: axisRanges3d.x.min, y: axisRanges3d.y.min, z: axisRanges3d.z.min },
            { x: axisRanges3d.x.max, y: axisRanges3d.y.min, z: axisRanges3d.z.min },
            { x: axisRanges3d.x.min, y: axisRanges3d.y.max, z: axisRanges3d.z.min },
            { x: axisRanges3d.x.max, y: axisRanges3d.y.max, z: axisRanges3d.z.min },
            { x: axisRanges3d.x.min, y: axisRanges3d.y.min, z: axisRanges3d.z.max },
            { x: axisRanges3d.x.max, y: axisRanges3d.y.min, z: axisRanges3d.z.max },
            { x: axisRanges3d.x.min, y: axisRanges3d.y.max, z: axisRanges3d.z.max },
            { x: axisRanges3d.x.max, y: axisRanges3d.y.max, z: axisRanges3d.z.max }
          ];
          const rotatePoint = (pt) => plot3d.rotatePoint(pt, scatterState.rotation);
          const rotatedCorners = allCorners.map(corner => rotatePoint(corner));
          const rotatedPoints = points3dInRange.map(pt => rotatePoint(pt));
          const projector = plot3d.createProjector({
            rotatedPoints,
            rotatedCorners,
            width: W3,
            height: H3,
            margin: margin3
          });
          const projectedPoints = points3dInRange.map((pt, idx) => {
            const rotated = rotatedPoints[idx];
            const projected = projector.project(rotated);
            return { original: pt, rotated, projected };
          });
          const sortedPoints = projectedPoints.map((entry, idx) => {
            const pt = entry.original;
            const projected = entry.projected;
            return {
              index: idx,
              projected,
              label: pt.label,
              color: scatterLabelColors[pt.label] || fill,
              shape: labelShapeLookup.get(pt.label) || 'circle',
              data: pt
            };
          }).sort((a, b) => (a.projected.depth || 0) - (b.projected.depth || 0));
          const add3 = (tag, attrs, text) => {
            const el = document.createElementNS(NS, tag);
            Object.keys(attrs || {}).forEach(key => el.setAttribute(key, String(attrs[key])));
            if(text){ el.textContent = text; }
            svg3.appendChild(el);
            return el;
          };
          const axisTicks3d = {
            x: Array.isArray(xScale3d.ticks) ? xScale3d.ticks : [],
            y: Array.isArray(yScale3d.ticks) ? yScale3d.ticks : [],
            z: Array.isArray(zScale3d.ticks) ? zScale3d.ticks : []
          };
          plot3d.renderAxesAndGrid({
            svg: svg3,
            project: projector.project,
            rotatePoint,
            axisRanges: axisRanges3d,
            axisTicks: axisTicks3d,
            axisLabels: { x: scatterXLabelText, y: scatterYLabelText, z: scatterZLabelText },
            fontSize: fs,
            axisStrokeWidth,
            chartStyle,
            showGrid,
            showFrame,
            debugLabel: 'scatter-3d',
            onAxisLabel: (node, axisKey) => {
              if(!node){ return; }
              const role = axisKey === 'z' ? 'zTitle' : (axisKey === 'y' ? 'yTitle' : 'xTitle');
              const changeLabel = (value) => {
                const nextValue = value != null ? String(value) : '';
                if(axisKey === 'x'){ scatterXLabelText = nextValue; }
                else if(axisKey === 'y'){ scatterYLabelText = nextValue; }
                else { scatterZLabelText = nextValue; }
                if(node.textContent !== nextValue){ node.textContent = nextValue; }
                scheduleDrawScatter();
              };
              markFontEditable(node, role, role);
              makeEditableLocal(node, text => {
                const previous = axisKey === 'x' ? (scatterXLabelText ?? '') : (axisKey === 'y' ? (scatterYLabelText ?? '') : (scatterZLabelText ?? ''));
                const nextValue = text != null ? String(text) : '';
                if(previous === nextValue){
                  return;
                }
                changeLabel(nextValue);
                recordScatterChange(`scatter:${axisKey}-label`, previous, nextValue, changeLabel);
              });
            }
          });
          const axisLabelBounds=[];
          let contentRightBound=margin3.left+plotW3;
          if(typeof svg3.querySelectorAll === 'function'){
            const axisLabelNodes=svg3.querySelectorAll('[data-axis-label]');
            axisLabelNodes.forEach(node=>{
              if(!node || typeof node.getBBox !== 'function'){ return; }
              try{
                const bbox=node.getBBox();
                const valid=Number.isFinite(bbox?.x) && Number.isFinite(bbox?.y) && Number.isFinite(bbox?.width) && Number.isFinite(bbox?.height);
                if(!valid){ return; }
                axisLabelBounds.push({ x:bbox.x, y:bbox.y, width:bbox.width, height:bbox.height });
                const rightEdge=bbox.x + bbox.width;
                if(Number.isFinite(rightEdge)){
                  contentRightBound=Math.max(contentRightBound,rightEdge);
                }
              }catch(err){
                scatterDebug('Debug: scatter axis label bbox error',{ message: err?.message || String(err) });
              }
            });
          }
          const pointLayer = document.createElementNS(NS,'g');
          svg3.appendChild(pointLayer);
          let maxPointRight=contentRightBound;
          sortedPoints.forEach(entry => {
            const marker = createScatterMarkerElement(entry.shape, {
              cx: entry.projected.x,
              cy: entry.projected.y,
              radius: dotSizePx,
              fill: entry.color,
              stroke: borderWidthPx>0 ? borderColor : null,
              strokeWidth: borderWidthPx>0 ? borderWidthPx : 0,
              fillOpacity: 1 - alpha,
              strokeOpacity: 1 - alpha
            });
            if(!marker){ return; }
            pointLayer.appendChild(marker);
            attachScatterPointTooltip(marker, {
              label: entry.data.label || '',
              x: entry.data.x,
              y: entry.data.y,
              z: entry.data.z,
              graphType: 'scatter'
            });
            const approxRight = entry.projected?.x + dotSizePx + (borderWidthPx>0 ? borderWidthPx : 0);
            if(Number.isFinite(approxRight)){
              maxPointRight = Math.max(maxPointRight, approxRight);
            }
          });
          contentRightBound=Math.max(contentRightBound,maxPointRight);
          if(legendVisible){
            const legendContentWidth=Math.max(legendRenderer.width || 0,0);
            const legendContentHeight=Math.max(legendRenderer.height || 0,0);
            const horizontalBase=margin3.left+plotW3+legendGapFor3d+appliedLegendAxisGap;
            const horizontalPadding=Math.max(fs*0.6,12)+appliedLegendAxisGap;
            let legendX3=Math.max(horizontalBase,contentRightBound+horizontalPadding);
            const safeRightPad=Math.max(fs*0.6,12);
            const widthForClamp=Math.max(legendContentWidth,legendWidth);
            const maxLegendX=W3-safeRightPad-widthForClamp;
            if(widthForClamp>0 && legendX3>maxLegendX){
              const previousX=legendX3;
              legendX3=Math.max(horizontalBase,maxLegendX);
              scatterDebug('Debug: scatter legend horizontal clamped',{ previousX, legendX3, maxLegendX });
            }
            const baseLegendY=margin3.top;
            const legendHeight=legendContentHeight;
            const legendBottomLimit=Math.max(baseLegendY,H3-margin3.bottom-legendHeight);
            const verticalPadding=Math.max(fs*0.45,8);
            const candidates=[baseLegendY];
            axisLabelBounds.forEach(bounds=>{
              const below=bounds.y + bounds.height + verticalPadding;
              const above=bounds.y - legendHeight - verticalPadding;
              if(below<=legendBottomLimit){ candidates.push(below); }
              if(above>=baseLegendY){ candidates.push(above); }
            });
            if(legendBottomLimit!==baseLegendY){
              candidates.push(legendBottomLimit);
            }
            const candidatePositions=[];
            candidates.forEach(candidate=>{
              const clamped=Math.min(Math.max(candidate,baseLegendY),legendBottomLimit);
              if(!candidatePositions.some(existing=>Math.abs(existing-clamped)<0.5)){
                candidatePositions.push(clamped);
              }
            });
            candidatePositions.sort((a,b)=>Math.abs(a-baseLegendY)-Math.abs(b-baseLegendY));
            const intersectsAxis=(rect)=>{
              for(let idx=0;idx<axisLabelBounds.length;idx+=1){
                const bounds=axisLabelBounds[idx];
                const horizontalOverlap=rect.x < bounds.x + bounds.width + horizontalPadding
                  && rect.x + rect.width > bounds.x - horizontalPadding;
                const verticalOverlap=rect.y < bounds.y + bounds.height + verticalPadding
                  && rect.y + rect.height > bounds.y - verticalPadding;
                if(horizontalOverlap && verticalOverlap){
                  return true;
                }
              }
              return false;
            };
            let legendStartY=baseLegendY;
            for(let idx=0;idx<candidatePositions.length;idx+=1){
              const candidateY=candidatePositions[idx];
              const legendRect={ x:legendX3, y:candidateY, width:legendContentWidth || widthForClamp, height:legendHeight };
              if(!intersectsAxis(legendRect)){
                legendStartY=candidateY;
                break;
              }
            }
            scatterDebug('Debug: scatter legend placement resolved',{ legendX: legendX3, legendY: legendStartY, legendHeight, axisLabels: axisLabelBounds.length });
            const legendGroup=legendRenderer.draw(svg3,{ x:legendX3, y:legendStartY });
            if(legendGroup && typeof legendGroup.querySelectorAll === 'function'){
              const interactiveNodes=legendGroup.querySelectorAll('[data-legend-key]');
              interactiveNodes.forEach(node=>{
                plot3d.applyLegendPointerGuards(node,{ label: node.dataset.legendKey || null });
              });
            }
          }
          const title3d = add3('text',{ x: margin3.left + plotW3 / 2, y: Math.max(margin3.top * 0.4, fs * 1.6), 'text-anchor':'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR }, scatterTitleText);
          markFontEditable(title3d,'graphTitle','graphTitle');
          const applyScatterTitle3d=value=>{
            const nextValue=value!=null?String(value):'';
            scatterTitleText=nextValue;
            if(title3d.textContent!==nextValue){
              title3d.textContent=nextValue;
            }
            scheduleDrawScatter();
          };
          makeEditableLocal(title3d,txt=>{
            const previous=scatterTitleText!=null?String(scatterTitleText):'';
            const nextValue=txt!=null?String(txt):'';
            if(previous===nextValue){
              return;
            }
            applyScatterTitle3d(nextValue);
            recordScatterChange('scatter:title',previous,nextValue,applyScatterTitle3d);
          });
          ensureGraphViewport(svg3,{ padding: Math.max(fs, 18), debugLabel: 'scatter-3d-graph' });
          return;
        }
        clearScatterPlot();
        plotEl.style.aspectRatio='';
        plotEl.style.padding='';
        const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
        const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
        plotEl.style.position='relative';
        const svg=document.createElementNS(NS,'svg');
        svg.setAttribute('id','scatterSvg');
        svg.setAttribute('width',String(W));
        svg.setAttribute('height',String(H));
        svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
        svg.setAttribute('font-family',chartStyle.FONT_FAMILY);
        svg.dataset.viewMode='2d';
        chartStyle.applySvgDefaults(svg);
        svg.addEventListener('mouseleave', handleScatterPlotMouseLeave);
        plotEl.appendChild(svg);
        if(fontControls && typeof fontControls.enableForSvg === 'function'){
          fontControls.enableForSvg(svg,{ scopeId: 'scatter' });
          debug('Debug: scatter fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
        } else {
          debug('Debug: scatter fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
        }
        const xMinT=logX?Math.log10(xMin):xMin;
        const xMaxT=logX?Math.log10(xMax):xMax;
        const yMinT=logY?Math.log10(yMin):yMin;
        const yMaxT=logY?Math.log10(yMax):yMax;
        const tickBaseSpacing=Math.max(48,Math.round(fs*3.2));
        const xTickEstimateOptions={axis:'x',fallback:6,baseSpacing:tickBaseSpacing,min:4};
        const yTickEstimateOptions={axis:'y',fallback:6,baseSpacing:tickBaseSpacing,min:4};
        let xTickTarget=clampScatterTickTarget(chartStyle.estimateTickCount(W,xTickEstimateOptions));
        let yTickTarget=clampScatterTickTarget(chartStyle.estimateTickCount(H,yTickEstimateOptions));
        debug('Debug: scatter initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
        function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
        const tickFont=chartStyle.makeFont(fs);
        const axisLabelFont=chartStyle.makeFont(fs);
        const yTitleWidthBase=chartStyle.measureText(scatterYLabelText,axisLabelFont);
        const tickLen=axisMetrics.tickLength;
        const tickGap=axisMetrics.tickLabelGap;
        let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth:0,yTitleWidth:yTitleWidthBase,axisMetrics});
        margin.left=Math.max(margin.left,fs*0.5);
        let plotW=Math.max(20,W-margin.left-margin.right);
        let plotH=Math.max(20,H-margin.top-margin.bottom);
        let bottomLayout=chartStyle.computeBottomLayout({labels:[],fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
        margin.bottom=bottomLayout.bottom;
        plotW=Math.max(20,W-margin.left-margin.right);
        plotH=Math.max(20,H-margin.top-margin.bottom);
        const storedManualIntervalX = getScatterAxisTickInterval('x');
        const storedManualIntervalY = getScatterAxisTickInterval('y');
        const manualIntervalX = !logX ? storedManualIntervalX : null;
        const manualIntervalY = !logY ? storedManualIntervalY : null;
        if(logX && storedManualIntervalX){
          debug('Debug: scatter manual interval suppressed',{ axis: 'x', reason: 'log-scale', stored: storedManualIntervalX });
        }
        if(logY && storedManualIntervalY){
          debug('Debug: scatter manual interval suppressed',{ axis: 'y', reason: 'log-scale', stored: storedManualIntervalY });
        }
        let xScale=buildScatterScale({
          dataMin:xMinT,
          dataMax:xMaxT,
          manualMin:Number.isFinite(xMinManual)?xMinT:NaN,
          manualMax:Number.isFinite(xMaxManual)?xMaxT:NaN,
          targetTickCount:xTickTarget,
          fixedStep:Number.isFinite(manualIntervalX)&&manualIntervalX>0?manualIntervalX:null
        });
        let yScale=buildScatterScale({
          dataMin:yMinT,
          dataMax:yMaxT,
          manualMin:Number.isFinite(yMinManual)?yMinT:NaN,
          manualMax:Number.isFinite(yMaxManual)?yMaxT:NaN,
          targetTickCount:yTickTarget,
          fixedStep:Number.isFinite(manualIntervalY)&&manualIntervalY>0?manualIntervalY:null
        });
        let xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
        let yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
        let maxYLabelWidth=0;
        let maxXLabelWidth=0;
        for(let pass=0;pass<2;pass++){
          xScale=buildScatterScale({
            dataMin:xMinT,
            dataMax:xMaxT,
            manualMin:Number.isFinite(xMinManual)?xMinT:NaN,
            manualMax:Number.isFinite(xMaxManual)?xMaxT:NaN,
            targetTickCount:xTickTarget,
            fixedStep:Number.isFinite(manualIntervalX)&&manualIntervalX>0?manualIntervalX:null
          });
          yScale=buildScatterScale({
            dataMin:yMinT,
            dataMax:yMaxT,
            manualMin:Number.isFinite(yMinManual)?yMinT:NaN,
            manualMax:Number.isFinite(yMaxManual)?yMaxT:NaN,
            targetTickCount:yTickTarget,
            fixedStep:Number.isFinite(manualIntervalY)&&manualIntervalY>0?manualIntervalY:null
          });
          xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
          yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
          const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
          maxYLabelWidth=Math.max(...yLabelWidths,0);
          const xLabelWidths=xTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
          maxXLabelWidth=Math.max(...xLabelWidths,0);
          margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth,yTitleWidth:yTitleWidthBase,axisMetrics});
          margin.left=Math.max(margin.left,maxYLabelWidth+tickLen+tickGap+fs*0.5);
          plotW=Math.max(20,W-margin.left-margin.right);
          plotH=Math.max(20,H-margin.top-margin.bottom);
          bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
          margin.bottom=bottomLayout.bottom;
          plotW=Math.max(20,W-margin.left-margin.right);
          plotH=Math.max(20,H-margin.top-margin.bottom);
          const refinedX=clampScatterTickTarget(chartStyle.estimateTickCount(plotW,{...xTickEstimateOptions,fallback:xTickTarget}));
          const refinedY=clampScatterTickTarget(chartStyle.estimateTickCount(plotH,{...yTickEstimateOptions,fallback:yTickTarget}));
          debug('Debug: scatter tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxXLabelWidth,maxYLabelWidth});
          if(refinedX===xTickTarget && refinedY===yTickTarget){
            break;
          }
          xTickTarget=refinedX;
          yTickTarget=refinedY;
        }
        debug('Debug: scatter layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate,xTickTarget,yTickTarget,maxXLabelWidth,maxYLabelWidth});
        const aspectData=scatterSvgBox?.dataset;
        const shouldLockAspect=aspectData?.resizerAspectLocked==='true';
        debug('Debug: scatter aspect ratio decision',{shouldLockAspect,storedRatio:aspectData?.resizerAspectRatio}); // Debug: scatter aspect toggle decision
        if(shouldLockAspect){
          const square=chartStyle.ensureSquarePlot(W,H,margin);
          margin=square.margin;
          plotW=square.plotW;
          plotH=square.plotH;
          if(aspectData){
            const derivedRatio=plotH>0?plotW/plotH:NaN;
            if(Number.isFinite(derivedRatio)){
              aspectData.resizerAspectRatio=String(derivedRatio);
            }
          }
          debug('Debug: scatter layout (locked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: scatter square enforcement branch
        }else{
          debug('Debug: scatter layout (unlocked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: scatter free resize branch
        }
        const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
        const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
        function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
        if(showGrid){
          xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':axisStrokeWidth});});
          yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':axisStrokeWidth});});
          debug('Debug: scatter grid stroke scaled',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length,axisStrokeWidth});
        }
        let originXT,originYT;
        if(originMode==='custom'){originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);}else{originXT=xScale.min;originYT=yScale.min;}
        const clampedXT=Math.min(Math.max(originXT,xScale.min),xScale.max);
        const clampedYT=Math.min(Math.max(originYT,yScale.min),yScale.max);
        info('scatter origin final',{originXT,originYT,clampedXT,clampedYT});
        const xAxisY=y2px(clampedYT);
        const yAxisX=x2px(clampedXT);
        info('scatter axes',{tickLen,xAxisY,yAxisX});
        const xTickPositions=xScale.ticks.map(t=>x2px(t));
        const yTickPositions=yScale.ticks.map(t=>y2px(t));
        const axisXMinPos=x2px(Number.isFinite(xScale.min)?xScale.min:xMinT);
        const axisXMaxPos=x2px(Number.isFinite(xScale.max)?xScale.max:xMaxT);
        const axisYMinPos=y2px(Number.isFinite(yScale.min)?yScale.min:yMinT);
        const axisYMaxPos=y2px(Number.isFinite(yScale.max)?yScale.max:yMaxT);
        let axisXStart=xTickPositions.length?Math.min(...xTickPositions,axisXMinPos):axisXMinPos;
        let axisXEnd=xTickPositions.length?Math.max(...xTickPositions,axisXMaxPos):axisXMaxPos;
        let axisYStart=yTickPositions.length?Math.min(...yTickPositions,axisYMinPos):axisYMinPos;
        let axisYEnd=yTickPositions.length?Math.max(...yTickPositions,axisYMaxPos):axisYMaxPos;
        if(axisXStart===axisXEnd){axisXStart=axisXMinPos;axisXEnd=axisXMaxPos;}
        if(axisYStart===axisYEnd){axisYStart=axisYMinPos;axisYEnd=axisYMaxPos;}
        debug('Debug: scatter axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
        const axisControlConfig = axis => ({
          axis,
          scopeId: 'scatter',
          getTickInterval: () => getScatterAxisTickInterval(axis),
          getThickness: () => getScatterAxisStrokeWidth(),
          getColor: () => getScatterAxisColor(),
          isTickIntervalEnabled: () => axis === 'x' ? !logX : !logY,
          getTickIntervalDisabledMessage: () => axis === 'x'
            ? 'Tick interval is disabled while the X axis uses a logarithmic scale.'
            : 'Tick interval is disabled while the Y axis uses a logarithmic scale.',
          tickPlaceholder: 'Auto',
          onTickIntervalChange: value => updateScatterAxisTickInterval(axis, value),
          onThicknessChange: value => updateScatterAxisStrokeWidth(value),
          onColorChange: value => updateScatterAxisColor(value)
        });
        const xAxisLine = add('line',{x1:axisXStart,y1:xAxisY,x2:axisXEnd,y2:xAxisY,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
        if(axisControls && typeof axisControls.registerAxisElement === 'function'){
          axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
        }
        const yAxisLine = add('line',{x1:yAxisX,y1:axisYStart,x2:yAxisX,y2:axisYEnd,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
        if(axisControls && typeof axisControls.registerAxisElement === 'function'){
          axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
        }
        debug('Debug: scatter axes stroke scaled',{ axisStrokeWidth, axisStrokeWidthBase, axisStroke });
        if(showFrame){
          debug('Debug: scatter frame request',{stroke:axisStroke, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
          chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'] });
        }
        // Frame closes scatter plot using axis styling continuity
        const xTickNodes=[];
        let xTickFontCount=0;
        xScale.ticks.forEach((t,i)=>{const x=x2px(t);add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:axisStroke,'stroke-width':axisStrokeWidth});const txt=add('text',{x,y:xAxisY+tickLen+tickGap,'font-size':fs,'text-anchor':'middle','dominant-baseline':'hanging',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logX?Math.pow(10,t):t);markFontEditable(txt,'xTick');xTickFontCount+=1;xTickNodes.push(txt);});
        chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
        let yTickFontCount=0;
        yScale.ticks.forEach((t,i)=>{const y=y2px(t);add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:axisStroke,'stroke-width':axisStrokeWidth});const txt=add('text',{x:yAxisX-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logY?Math.pow(10,t):t);markFontEditable(txt,'yTick');yTickFontCount+=1;});
        debug('Debug: scatter font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
        debug('Debug: scatter ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
        time(`scatterSvgDraw_${token}`);
        const frag=document.createDocumentFragment();
        const labelBBox=new Map();
        let pointIndex=0;
        const isBubbleView = scatterCurrentGraphType==='scatter' && scatterState.viewMode === 'bubble';
        const resolveBubbleRadius = isBubbleView ? createBubbleRadiusScaler(points, dotSizePx) : null;
        for(const p of points){
          const xv=logX?Math.log10(p.x):p.x;
          const yv=logY?Math.log10(p.y):p.y;
          const cxVal=x2px(xv);
          const cyVal=y2px(yv);
          const color=scatterCurrentGraphType==='scatter'
            ? (scatterLabelColors[p.label]||fill)
            : (p.isSignificant?SIGNIFICANT_COLOR:fill);
          const markerShape = isBubbleView ? 'circle' : (scatterCurrentGraphType==='scatter'
            ? (labelShapeLookup.get(p.label) || 'circle')
            : 'circle');
          const markerRadius = isBubbleView && resolveBubbleRadius
            ? resolveBubbleRadius(p)
            : dotSizePx;
          const marker = createScatterMarkerElement(markerShape, {
            cx: cxVal,
            cy: cyVal,
            radius: markerRadius,
            fill: color,
            stroke: borderWidthPx>0 ? borderColor : null,
            strokeWidth: borderWidthPx>0 ? borderWidthPx : 0,
            fillOpacity: 1 - alpha,
            strokeOpacity: 1 - alpha
          });
          if(!marker){
            continue;
          }
          let bbox=labelBBox.get(p.label||'__none');
          if(!bbox){bbox={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}; labelBBox.set(p.label||'__none',bbox);}
          const bboxRadius = markerRadius;
          bbox.minX=Math.min(bbox.minX,cxVal-bboxRadius);
          bbox.maxX=Math.max(bbox.maxX,cxVal+bboxRadius);
          bbox.minY=Math.min(bbox.minY,cyVal-bboxRadius);
          bbox.maxY=Math.max(bbox.maxY,cyVal+bboxRadius);
          attachScatterPointTooltip(marker, {
            label: p.label || '',
            x: p.x,
            y: p.y,
            logXValue: logX ? xv : undefined,
            logYValue: logY ? yv : undefined,
            graphType: scatterCurrentGraphType,
            isSignificant: typeof p.isSignificant === 'boolean' ? p.isSignificant : undefined,
            size: isBubbleView ? p.bubbleValue : undefined
          });
          frag.appendChild(marker);
          if(scatterCurrentGraphType!=='scatter' && p.isSignificant && p.label){
            if(labelAnnotations.length < MAX_SIGNIFICANT_ANNOTATIONS){
              const labelNode=document.createElementNS(NS,'text');
              labelNode.setAttribute('x',cxVal+dotSizePx+2);
              labelNode.setAttribute('y',cyVal-(dotSizePx+2));
              labelNode.setAttribute('font-size',Math.max(fs*0.75,8));
              labelNode.setAttribute('fill',SIGNIFICANT_COLOR);
              labelNode.setAttribute('text-anchor','start');
              labelNode.textContent=p.label;
              markFontEditable(labelNode,'annotation',`annotation-${labelAnnotations.length}`);
              labelAnnotations.push(labelNode);
            }else if(labelAnnotations.length === MAX_SIGNIFICANT_ANNOTATIONS){
              debug('Debug: scatter annotation cap reached',{graphType:scatterCurrentGraphType,cap:MAX_SIGNIFICANT_ANNOTATIONS}); // Debug: annotation cap notice
            }
          }
          pointIndex++;
          if(pointIndex >= nextPointProgress){info('scatter svg draw progress',{pointIndex,token});nextPointProgress += pointProgressInterval;}
        }
        add('g',{}).appendChild(frag);
        if(labelAnnotations.length){
          const annotationLayer=document.createElementNS(NS,'g');
          labelAnnotations.forEach(node=>annotationLayer.appendChild(node));
          svg.appendChild(annotationLayer);
          debug('Debug: scatter annotations rendered',{count:labelAnnotations.length,graphType:scatterCurrentGraphType});
        }
        timeEnd(`scatterSvgDraw_${token}`);
        if(legendVisible){
          const plotRight=margin.left+plotW;
          const legendX=plotRight+legendGapPx;
          legendRenderer.draw(svg,{x:legendX,y:margin.top});
          debug('Debug: scatter legend rendered shared helper',{legendX,legendGapPx,entryCount:legendRenderer.entries.length});
        }
        const xAxisBase=margin.top+plotH;
        const xText=add('text',{x:margin.left+plotW/2,y:xAxisBase+bottomLayout.titleOffset,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        xText.textContent=scatterXLabelText;
        markFontEditable(xText,'xTitle','xTitle');
        const applyScatterXLabel=value=>{
          const nextValue=value!=null?String(value):'';
          scatterXLabelText=nextValue;
          if(xText.textContent!==nextValue){
            xText.textContent=nextValue;
          }
          scheduleDrawScatter();
        };
        makeEditableLocal(xText,txt=>{
          const previous=scatterXLabelText!=null?String(scatterXLabelText):'';
          const nextValue=txt!=null?String(txt):'';
          if(previous===nextValue){
            return;
          }
          applyScatterXLabel(nextValue);
          recordScatterChange('scatter:x-label',previous,nextValue,applyScatterXLabel);
        });
        const yX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
        info('scatter y-axis position',yX);
        const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        yText.textContent=scatterYLabelText;
        markFontEditable(yText,'yTitle','yTitle');
        const applyScatterYLabel=value=>{
          const nextValue=value!=null?String(value):'';
          scatterYLabelText=nextValue;
          if(yText.textContent!==nextValue){
            yText.textContent=nextValue;
          }
          scheduleDrawScatter();
        };
        makeEditableLocal(yText,txt=>{
          const previous=scatterYLabelText!=null?String(scatterYLabelText):'';
          const nextValue=txt!=null?String(txt):'';
          if(previous===nextValue){
            return;
          }
          applyScatterYLabel(nextValue);
          recordScatterChange('scatter:y-label',previous,nextValue,applyScatterYLabel);
        });
        const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        titleText.textContent=scatterTitleText;
        markFontEditable(titleText,'graphTitle','graphTitle');
        const applyScatterTitle=value=>{
          const nextValue=value!=null?String(value):'';
          scatterTitleText=nextValue;
          if(titleText.textContent!==nextValue){
            titleText.textContent=nextValue;
          }
          scheduleDrawScatter();
        };
        makeEditableLocal(titleText,txt=>{
          const previous=scatterTitleText!=null?String(scatterTitleText):'';
          const nextValue=txt!=null?String(txt):'';
          if(previous===nextValue){
            return;
          }
          applyScatterTitle(nextValue);
          recordScatterChange('scatter:title',previous,nextValue,applyScatterTitle);
        });
        if(scatterCurrentGraphType==='scatter'){
          const regressionModeValue = scatterRegressionMode ? (scatterRegressionMode.value || 'linear') : 'linear';
          const stats=computeScatterStats(points,method,{ regressionMode: regressionModeValue, domain: { minX: xMin, maxX: xMax } });
          if(token!==scatterDrawToken){info('scatter draw cancelled before stats',{token});return;}
          const regressionModel = stats.regression;
          scatterLastRegressionSummary = typeof regressionTools.createSummary === 'function' ? regressionTools.createSummary(regressionModel) : null;
          if(showLine && regressionModel){
            const intervalSamplesRaw = Array.isArray(regressionModel.intervals?.samples) ? regressionModel.intervals.samples.slice() : [];
            const intervalSamples = intervalSamplesRaw.sort((a,b)=> (a?.x ?? 0) - (b?.x ?? 0));
            const intervalLayer = (showIntervals && intervalSamples.length >= 2) ? document.createElementNS(NS,'g') : null;
            if(intervalLayer){
              intervalLayer.setAttribute('data-layer','interval-bands');
              svg.appendChild(intervalLayer);
              const buildIntervalPath = (lowerKey, upperKey) => {
                const upperPoints=[];
                const lowerPoints=[];
                intervalSamples.forEach(sample => {
                  const xRaw = sample?.x;
                  const upperRaw = sample?.[upperKey];
                  const lowerRaw = sample?.[lowerKey];
                  if(!Number.isFinite(xRaw) || !Number.isFinite(upperRaw) || !Number.isFinite(lowerRaw)){
                    return;
                  }
                  if(logX && xRaw <= 0){
                    return;
                  }
                  if(logY && (upperRaw <= 0 || lowerRaw <= 0)){
                    return;
                  }
                  const xVal = logX ? Math.log10(xRaw) : xRaw;
                  const upperVal = logY ? Math.log10(upperRaw) : upperRaw;
                  const lowerVal = logY ? Math.log10(lowerRaw) : lowerRaw;
                  if(!Number.isFinite(xVal) || !Number.isFinite(upperVal) || !Number.isFinite(lowerVal)){
                    return;
                  }
                  upperPoints.push({ x: x2px(xVal), y: y2px(upperVal) });
                  lowerPoints.push({ x: x2px(xVal), y: y2px(lowerVal) });
                });
                if(upperPoints.length < 2 || lowerPoints.length < 2){
                  return null;
                }
                const commands=[];
                upperPoints.forEach((pt, idx)=>{
                  commands.push(`${idx?'L':'M'}${pt.x},${pt.y}`);
                });
                lowerPoints.slice().reverse().forEach(pt=>{
                  commands.push(`L${pt.x},${pt.y}`);
                });
                commands.push('Z');
                return commands.join(' ');
              };
              const confidencePath = buildIntervalPath('ciLow','ciHigh');
              const predictionPath = buildIntervalPath('piLow','piHigh');
              if(confidencePath){
                const confEl=document.createElementNS(NS,'path');
                confEl.setAttribute('d',confidencePath);
                confEl.setAttribute('fill','#d62728');
                confEl.setAttribute('fill-opacity','0.15');
                confEl.setAttribute('stroke','none');
                confEl.dataset.band='confidence';
                intervalLayer.appendChild(confEl);
              }
              if(predictionPath){
                const predEl=document.createElementNS(NS,'path');
                predEl.setAttribute('d',predictionPath);
                predEl.setAttribute('fill','#d62728');
                predEl.setAttribute('fill-opacity','0.08');
                predEl.setAttribute('stroke','none');
                predEl.dataset.band='prediction';
                intervalLayer.appendChild(predEl);
              }
              debug('Debug: scatter interval shading rendered', {
                sampleCount: intervalSamples.length,
                hasConfidence: !!confidencePath,
                hasPrediction: !!predictionPath
              });
            }
            const sampleCount = regressionModel.mode === 'linear' ? 60 : 160;
            const samples = typeof regressionTools.sampleCurve === 'function'
              ? regressionTools.sampleCurve(regressionModel,{ minX: xMin, maxX: xMax, sampleCount })
              : [];
            const pathCommands = [];
            samples.forEach((sample, idx) => {
              if(!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return;
              if(logX && sample.x <= 0) return;
              if(logY && sample.y <= 0) return;
              const xVal = logX ? Math.log10(sample.x) : sample.x;
              const yVal = logY ? Math.log10(sample.y) : sample.y;
              if(!Number.isFinite(xVal) || !Number.isFinite(yVal)) return;
              const command = `${pathCommands.length?'L':'M'}${x2px(xVal)},${y2px(yVal)}`;
              pathCommands.push(command);
            });
            if(pathCommands.length>1){
              const strokeWidth=chartStyle.scaleStrokeWidth(1.5, styleScaleInfo, { context: 'scatter-trend', min: 0.75 });
              const path=add('path',{d:pathCommands.join(' '),fill:'none',stroke:'#d00','stroke-width':strokeWidth});
              path.setAttribute('vector-effect','non-scaling-stroke');
              debug('Debug: scatter regression path drawn',{ mode: regressionModel.mode, commandCount: pathCommands.length, strokeWidth });
            }else{
              debug('Debug: scatter regression path skipped',{ mode: regressionModel.mode, pathCommands: pathCommands.length });
            }
            const infoLines=[];
            if(regressionModel?.summary?.equation){
              infoLines.push(regressionModel.summary.equation);
            }else if(Number.isFinite(stats.m) && Number.isFinite(stats.b)){
              const eq=`y=${stats.m.toFixed(2)}x${stats.b>=0?'+':'-'}${Math.abs(stats.b).toFixed(2)}`;
              infoLines.push(eq);
            }
            infoLines.push(`r=${formatMetricValue(stats.r,2)} R²=${formatMetricValue(stats.r2,2)} p=${formatP(stats.p)}`);
            if(regressionModel?.metrics){
              if(Number.isFinite(regressionModel.metrics.rmse) || Number.isFinite(regressionModel.metrics.mae)){
                infoLines.push(`RMSE=${formatMetricValue(regressionModel.metrics.rmse,3)} MAE=${formatMetricValue(regressionModel.metrics.mae,3)}`);
              }
            }
            const infoX=margin.left+plotW-4;
            const infoY=stats.m>=0?margin.top+plotH-(fs*2):margin.top+fs*2;
            const info=add('text',{x:infoX,y:infoY,'text-anchor':'end','font-size':fs,fill:'#000'});
            infoLines.forEach((line,lineIdx)=>{
              const t=document.createElementNS(NS,'tspan');
              t.setAttribute('x',infoX);
              t.setAttribute('dy',lineIdx===0?0:fs);
              t.textContent=line;
              info.appendChild(t);
            });
          }else{
            debug('Debug: scatter regression trend omitted',{ showLine, hasModel: !!regressionModel });
          }
          const resDiv=document.getElementById('scatterStatsResults');
          const rows=[];
          rows.push({ metric:'r', value: formatMetricValue(stats.r) });
          rows.push({ metric:'P value', value: formatP(stats.p) });
          if(regressionModel?.metrics){
            rows.push({ metric:'R²', value: formatMetricValue(regressionModel.metrics.r2) });
            if(Number.isFinite(regressionModel.metrics.adjR2)){
              rows.push({ metric:'Adjusted R²', value: formatMetricValue(regressionModel.metrics.adjR2) });
            }
            rows.push({ metric:'RMSE', value: formatMetricValue(regressionModel.metrics.rmse) });
            rows.push({ metric:'MAE', value: formatMetricValue(regressionModel.metrics.mae) });
            if(Number.isFinite(regressionModel.metrics.logLoss)){
              rows.push({ metric:'Log loss', value: formatMetricValue(regressionModel.metrics.logLoss,6) });
            }
          }else{
            rows.push({ metric:'R²', value: formatMetricValue(stats.r2) });
          }
          if(regressionModel?.summary){
            const summary = regressionModel.summary;
            let parametersRendered = false;
            if(summary.parameters && typeof summary.parameters === 'object'){
              Object.entries(summary.parameters).forEach(([label, value]) => {
                parametersRendered = true;
                if(Number.isFinite(value)){
                  rows.push({ metric: label, value: formatMetricValue(value) });
                }else if(value != null && value !== ''){
                  rows.push({ metric: label, value: String(value) });
                }
              });
            }
            if(summary.primaryParameter && summary.primaryParameter.label && Number.isFinite(summary.primaryParameter.value)){
              const duplicate = summary.parameters && Object.prototype.hasOwnProperty.call(summary.parameters, summary.primaryParameter.label);
              if(!duplicate){
                rows.push({ metric: summary.primaryParameter.label, value: formatMetricValue(summary.primaryParameter.value) });
              }
            }
            if(!parametersRendered){
              if(Number.isFinite(summary.slope)){
                rows.push({ metric:'Slope', value: formatMetricValue(summary.slope) });
              }
              if(Number.isFinite(summary.intercept)){
                rows.push({ metric:'Intercept', value: formatMetricValue(summary.intercept) });
              }
            }
            if(summary.equation){
              rows.push({ metric:'Equation', value: summary.equation });
            }
          }else{
            rows.push({ metric:'Slope', value: formatMetricValue(stats.m) });
            rows.push({ metric:'Intercept', value: formatMetricValue(stats.b) });
          }
          if(regressionModel?.residuals){
            rows.push({ metric:'Residual mean', value: formatMetricValue(regressionModel.residuals.mean) });
            rows.push({ metric:'Residual SD', value: formatMetricValue(regressionModel.residuals.sd) });
          }
          if(showIntervals && regressionModel?.intervals?.summary){
            const summary = regressionModel.intervals.summary;
            if(Number.isFinite(summary.ciMin) && Number.isFinite(summary.ciMax)){
              rows.push({ metric:'Confidence interval (y)', value: `${formatMetricValue(summary.ciMin)} – ${formatMetricValue(summary.ciMax)}` });
            }
            if(Number.isFinite(summary.piMin) && Number.isFinite(summary.piMax)){
              rows.push({ metric:'Prediction interval (y)', value: `${formatMetricValue(summary.piMin)} – ${formatMetricValue(summary.piMax)}` });
            }
          }
          if(showDiagnostics && regressionModel?.diagnostics){
            rows.push({ metric:'Residual skewness', value: formatMetricValue(regressionModel.diagnostics.skewness,3) });
            rows.push({ metric:'Residual kurtosis', value: formatMetricValue(regressionModel.diagnostics.kurtosis,3) });
            if(Number.isFinite(regressionModel.diagnostics.jarqueBera)){
              rows.push({ metric:'Jarque-Bera', value: formatMetricValue(regressionModel.diagnostics.jarqueBera,3) });
            }
            if(Number.isFinite(regressionModel.diagnostics.jarqueBeraP)){
              rows.push({ metric:'Jarque-Bera p', value: formatP(regressionModel.diagnostics.jarqueBeraP) });
            }
          }
          if(regressionModel?.warnings?.length){
            rows.push({ metric:'Warnings', value: regressionModel.warnings.join('; ') });
          }
          renderStatsCard(resDiv,{
            caption:`${stats.method} correlation (${regressionModeValue} regression)`,
            columns:[
              {key:'metric',label:'Metric',align:'left'},
              {key:'value',label:'Value',align:'right'}
            ],
            rows,
            options:{
              fileName:'scatter-correlation',
              contextLabel:'scatter-correlation'
            }
          });
          info('scatter stats',{ stats, regressionSummary: scatterLastRegressionSummary });
        }else{
          scatterLastRegressionSummary=null;
          const resDiv=document.getElementById('scatterStatsResults');
          const nonSigCount=points.length-significantCount;
          const negLabel=scatterCurrentGraphType==='ma' ? (extraLabelRaw && String(extraLabelRaw).trim() ? `-log10(${String(extraLabelRaw).trim()})` : '-log10(p-value)') : scatterYLabelText;
          let summaryRows=`<tr><th>Total points</th><td>${points.length}</td></tr>`+
            `<tr><th>Significant</th><td>${significantCount}</td></tr>`+
            `<tr><th>Not significant</th><td>${nonSigCount}</td></tr>`+
            `<tr><th>|log₂FC| ≥</th><td>${log2fcThreshold.toFixed(2)}</td></tr>`+
            `<tr><th>${negLabel} ≥</th><td>${negLogPThreshold.toFixed(2)}</td></tr>`;
          if(maMissingPCount>0){
            summaryRows+=`<tr><th>Missing p-values</th><td>${maMissingPCount}</td></tr>`;
          }
          renderStatsCard(resDiv,{
            caption: scatterCurrentGraphType==='ma' ? 'Differential expression summary' : 'Significance summary',
            columns:[
              {key:'metric',label:'Metric',align:'left'},
              {key:'value',label:'Value',align:'right'}
            ],
            rows:(()=>{
              const rows=[
                { metric:'Total points', value:String(points.length) },
                { metric:'Significant', value:String(significantCount) },
                { metric:'Not significant', value:String(nonSigCount) },
                { metric:'|log₂FC| ≥', value:log2fcThreshold.toFixed(2) },
                { metric:`${negLabel} ≥`, value:negLogPThreshold.toFixed(2) }
              ];
              if(maMissingPCount>0){
                rows.push({ metric:'Missing p-values', value:String(maMissingPCount) });
              }
              return rows;
            })(),
            options:{
              fileName:'scatter-threshold-summary',
              contextLabel:'scatter-threshold'
            }
          });
          debug('Debug: scatter significance summary',{graphType:scatterCurrentGraphType,significantCount,nonSigCount,log2fcThreshold,negLogPThreshold,missingP:maMissingPCount});
        }
        ensureGraphViewport(svg, { padding: Math.max(fs, 16), debugLabel: 'scatter-graph' });
        scatterLayout?.syncPanels?.({ skipSchedule: true });
        info('scatter render complete with enhanced styles');
      }
      scheduleDrawScatter = Shared.debounceFrame(drawScatter);
      scatterLayout?.setScheduleDraw?.(() => scheduleDrawScatter());
      console.debug('Debug: scatter scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    
    
      function computeScatterStats(points,method,options={}){
        console.log('computeScatterStats',method,points.length,options);
        const regressionMode = options.regressionMode || 'linear';
        const domainOption = options.domain || null;
        const x=points.map(p=>p.x);
        const y=points.map(p=>p.y);
        const n=points.length;
        if(n<3){
          return {method, r:NaN, p:NaN, r2:NaN, m:NaN, b:NaN, regression:null};
        }
        const pearson=jStat.corrcoeff(x,y);
        let r,label;
        if(method==='pearson'){r=pearson; label='Pearson';}
        else {r=jStat.spearmancoeff(x,y); label='Spearman';}
        const t=r*Math.sqrt((n-2)/(1-r*r));
        const p=2*(1-jStat.studentt.cdf(Math.abs(t),n-2));
        const xMean=jStat.mean(x);
        const yMean=jStat.mean(y);
        const num=x.reduce((s,xi,i)=>s+(xi-xMean)*(y[i]-yMean),0);
        const den=x.reduce((s,xi)=>s+Math.pow(xi-xMean,2),0);
        const linearSlope=den!==0?num/den:NaN;
        const linearIntercept=yMean-linearSlope*xMean;
        let regression=null;
        if(typeof regressionTools.fitRegression==='function'){
          try{
            regression=regressionTools.fitRegression(points,{ mode: regressionMode });
            if(regression && domainOption){
              const minCandidate = Number.isFinite(domainOption.minX) ? domainOption.minX : Number.isFinite(domainOption.min) ? domainOption.min : undefined;
              const maxCandidate = Number.isFinite(domainOption.maxX) ? domainOption.maxX : Number.isFinite(domainOption.max) ? domainOption.max : undefined;
              if(Number.isFinite(minCandidate) && Number.isFinite(maxCandidate)){
                regression.domain = { minX: minCandidate, maxX: maxCandidate };
              }
            }
          }catch(err){
            console.error('Regression fit error', err);
          }
        }
        const summaryForRegression = regression?.summary;
        const regressionSlope = summaryForRegression?.slope;
        const regressionIntercept = summaryForRegression?.intercept;
        let resolvedSlope = Number.isFinite(regressionSlope) ? regressionSlope : linearSlope;
        if(summaryForRegression?.primaryParameter && Number.isFinite(summaryForRegression.primaryParameter.value)){
          resolvedSlope = summaryForRegression.primaryParameter.value;
        }
        const resolvedIntercept = Number.isFinite(regressionIntercept) ? regressionIntercept : linearIntercept;
        const regressionR2 = regression?.metrics?.r2;
        const r2 = Number.isFinite(regressionR2) ? regressionR2 : pearson*pearson;
        const stats={method:label, r, p, r2, m:resolvedSlope, b:resolvedIntercept, regression};
        console.log('computeScatterStats result',{method:label,r,r2,p,m:resolvedSlope,b:resolvedIntercept,mode:regressionMode});
        return stats;
      }
      function updateLineStats(series){
        const method=lineStatType.value;
        const regressionEl=global.lineRegressionMode || document.getElementById('lineRegressionMode');
        const regressionMode=(regressionEl&&regressionEl.value)||'linear';
        console.log('updateLineStats start',{seriesCount:series.length,method,regressionMode});
        const tableRows=[];
        let methodLabel='';
        series.forEach(s=>{
          const pts=s.points.filter(p=>p);
          if(pts.length>=3){
            const stats=computeScatterStats(pts,method,{ regressionMode });
            methodLabel=stats.method;
            tableRows.push({
              series:s.name,
              r:formatMetricValue(stats.r),
              p:formatP(stats.p),
              slope:formatMetricValue(stats.regression?.summary?.slope ?? stats.m),
              r2:formatMetricValue(stats.regression?.metrics?.r2 ?? stats.r2),
              rmse:formatMetricValue(stats.regression?.metrics?.rmse)
            });
          }
        });
        if(tableRows.length){
          renderStatsCard(lineStatsResults,{
            caption:methodLabel?`${methodLabel} correlation summary (${regressionMode} regression)`:'Correlation summary',
            columns:[
              {key:'series',label:'Series',align:'left'},
              {key:'r',label:'r',align:'right'},
              {key:'p',label:'p',align:'right'},
              {key:'slope',label:'Slope',align:'right'},
              {key:'r2',label:'R²',align:'right'},
              {key:'rmse',label:'RMSE',align:'right'}
            ],
            rows:tableRows,
            options:{
              fileName:'scatter-series-correlation',
              contextLabel:'scatter-series-corr'
            }
          });
        }else{
          lineStatsResults.textContent='Not enough data for statistics.';
        }
        console.log('updateLineStats complete',{rows:tableRows.length,regressionMode});
      }
      function updateHistStats(values){
        console.log('updateHistStats start',values.length);
        if(!values.length){histStatsResults.textContent='No data';return;}
        const mean=jStat.mean(values);
        const median=jStat.median(values);
        const sd=jStat.stdev(values,true);
        renderStatsCard(histStatsResults,{
          caption:'Distribution summary',
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows:[
            {metric:'n',value:String(values.length)},
            {metric:'Mean',value:mean.toFixed(4)},
            {metric:'Median',value:median.toFixed(4)},
            {metric:'SD',value:sd.toFixed(4)}
          ],
          options:{
            fileName:'histogram-summary',
            contextLabel:'hist-summary'
          }
        });
        console.log('updateHistStats result',{mean,median,sd});
      }
      function updatePieStats(labels,observed,expected){
        console.log('updatePieStats start',{labels:labels.length,observed:observed.length,expected:expected.length});
        if(!observed.length){pieStatsResults.textContent='No data';return;}
        if(expected.length!==observed.length || expected.some(e=>isNaN(e))){
          pieStatsResults.textContent='Expected values required';
          return;
        }
        const chi2=observed.reduce((s,o,i)=>s+Math.pow(o-expected[i],2)/expected[i],0);
        const df=observed.length-1;
        const p=1-jStat.chisquare.cdf(chi2,df);
        renderStatsCard(pieStatsResults,{
          caption:'Goodness-of-fit test',
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows:[
            {metric:'Chi²',value:chi2.toFixed(4)},
            {metric:'df',value:String(df)},
            {metric:'p-value',value:isFinite(p)?formatP(p):'N/A'}
          ],
          options:{
            fileName:'pie-chi-square',
            contextLabel:'pie-chi-square'
          }
        });
        console.log('updatePieStats result',{chi2,df,p});
      }
    
      function getScatterGraphPayload(){
      const axisSettings = ensureScatterAxisSettings();
      const fontStyles = exportFontStyles('scatter');
      return {
        type:'scatter',
        data:scatterHot.getData(),
        exclusions: scatterHot?.exportExclusions?.() || Shared.hot.exportExclusions(scatterHot),
        config:{
          title:scatterTitleText,
            xLabel:scatterXLabelText,
            yLabel:scatterYLabelText,
            zLabel:scatterZLabelText,
            dotSize:scatterDotSize.value,
            fill:scatterFill.value,
            border:scatterBorder.value,
            borderWidth:scatterBorderWidth.value,
            alpha:scatterAlpha.value,
            labelColors:scatterLabelColors,
            labelShapes:scatterLabelShapes,
            showGrid:scatterShowGrid.checked,
            showFrame:scatterShowFrame.checked,
            showLegend:scatterShowLegend ? scatterShowLegend.checked : true,
            logX:scatterLogX.checked,
            logY:scatterLogY.checked,
            xMin:scatterXMin.value,
            xMax:scatterXMax.value,
            yMin:scatterYMin.value,
            yMax:scatterYMax.value,
            originMode:scatterOriginMode.value,
            originX:scatterOriginX.value,
            originY:scatterOriginY.value,
            showLine:scatterShowLine.checked,
            showIntervals:scatterShowIntervals ? scatterShowIntervals.checked : false,
            showDiagnostics:scatterShowDiagnostics ? scatterShowDiagnostics.checked : false,
            graphType:scatterGraphTypeSelect?.value || 'scatter',
            log2fcThreshold:scatterLog2FCThreshold?.value || '',
            negLogPThreshold:scatterNegLogPThreshold?.value || '',
            regression:{
              mode: scatterRegressionMode ? (scatterRegressionMode.value || 'linear') : 'linear',
              summary: scatterLastRegressionSummary
            },
            axis:{
              strokeWidth: axisSettings.strokeWidth,
              color: axisSettings.color,
              tickIntervalX: axisSettings.x?.tickInterval ?? null,
              tickIntervalY: axisSettings.y?.tickInterval ?? null
            },
            fontStyles: fontStyles || undefined,
            viewMode: scatterState.requestedViewMode || scatterState.viewMode,
            rotation: scatterState.rotation ? {
              x: scatterState.rotation.x,
              y: scatterState.rotation.y,
              z: scatterState.rotation.z,
              quaternion: scatterState.rotation.quaternion ? {
                w: scatterState.rotation.quaternion.w,
                x: scatterState.rotation.quaternion.x,
                y: scatterState.rotation.quaternion.y,
                z: scatterState.rotation.quaternion.z
              } : null
            } : null
          }
        };
      }
      let scatterFileHandle=null, scatterFileName='scatter.graph';
      async function saveScatterFile(){
        console.debug('Debug: saveScatterFile invoked', { hasHandle: !!scatterFileHandle });
        if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
          console.error('saveScatterFile missing fileIO.saveGraphFile');
          return;
        }
        const result = await fileIO.saveGraphFile({
          context: 'scatter',
          fileHandle: scatterFileHandle,
          getPayload: getScatterGraphPayload,
          fileName: scatterFileName,
          downloadFileName: scatterFileName,
          setFileHandle: handle => { scatterFileHandle = handle; },
          setFileName: name => { scatterFileName = name; }
        });
        console.debug('Debug: saveScatterFile result', result);
      }
      async function saveAsScatterFile(){
        console.debug('Debug: saveAsScatterFile invoked', { currentName: scatterFileName });
        if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
          console.error('saveAsScatterFile missing fileIO.saveGraphFileAs');
          return;
        }
        const result = await fileIO.saveGraphFileAs({
          context: 'scatter',
          getPayload: getScatterGraphPayload,
          fileName: scatterFileName,
          downloadFileName: scatterFileName,
          setFileHandle: handle => { scatterFileHandle = handle; },
          setFileName: name => { scatterFileName = name; }
        });
        console.debug('Debug: saveAsScatterFile result', result);
      }
      async function openScatterFile(){
        console.debug('Debug: openScatterFile invoked');
        if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
          console.error('openScatterFile missing fileIO.openGraphFile');
          return;
        }
        const result = await fileIO.openGraphFile({
          context: 'scatter',
          setFileHandle: handle => { scatterFileHandle = handle; },
          setFileName: name => { scatterFileName = name; },
          loadFromFile: file => loadScatterGraphFile(file),
          triggerInput: () => {
            const input = document.getElementById('scatterGraphFile');
            if(input){
              input.value='';
              input.click();
            }
          }
        });
        console.debug('Debug: openScatterFile result', result);
      }
      function loadScatterGraphFile(file){
        const reader=new FileReader();
        reader.onload=e=>{
          try{
            const obj=JSON.parse(e.target.result);
            console.log('loadScatterGraph',obj);
            if(obj.type!=='scatter') throw new Error('Invalid graph type');
            scatterHot.loadData(obj.data||[]);
            if(obj.exclusions){
              scatterHot.applyExclusions?.(obj.exclusions);
            }
            const c=obj.config||{};
            importFontStyles('scatter', c.fontStyles || null);
            scatterTitleText=c.title||scatterTitleText;
            scatterXLabelText=c.xLabel||scatterXLabelText;
            scatterYLabelText=c.yLabel||scatterYLabelText;
            scatterZLabelText=c.zLabel||scatterZLabelText;
            scatterDotSize.value=c.dotSize||scatterDotSize.value;
            scatterFill.value=c.fill||scatterFill.value;
            scatterBorder.value=c.border||scatterBorder.value;
            scatterBorderWidth.value=c.borderWidth||scatterBorderWidth.value;
            scatterAlpha.value=c.alpha||0;
            scatterAlphaVal.textContent=scatterAlpha.value;
            scatterLabelColors=c.labelColors||{};
            scatterLabelShapes=c.labelShapes||{};
            scatterShowGrid.checked=!!c.showGrid;
            scatterShowFrame.checked=!!c.showFrame;
            if(scatterShowLegend){
              scatterShowLegend.checked = c.showLegend !== false;
            }
            scatterLogX.checked=!!c.logX;
            scatterLogY.checked=!!c.logY;
            scatterXMin.value=c.xMin||'';
            scatterXMax.value=c.xMax||'';
            scatterYMin.value=c.yMin||'';
            scatterYMax.value=c.yMax||'';
            scatterOriginMode.value=c.originMode||scatterOriginMode.value;
            scatterOriginX.value=c.originX||'';
            scatterOriginY.value=c.originY||'';
            scatterShowLine.checked=!!c.showLine;
            if(scatterShowIntervals){
              scatterShowIntervals.checked=!!c.showIntervals;
            }
            if(scatterShowDiagnostics){
              scatterShowDiagnostics.checked=!!c.showDiagnostics;
            }
            if(scatterGraphTypeSelect && c.graphType){
              scatterGraphTypeSelect.value=c.graphType;
            }
            if(scatterLog2FCThreshold && c.log2fcThreshold!==undefined){
              scatterLog2FCThreshold.value=c.log2fcThreshold;
            }
            if(scatterNegLogPThreshold && c.negLogPThreshold!==undefined){
              scatterNegLogPThreshold.value=c.negLogPThreshold;
            }
            if(scatterRegressionMode && c.regression?.mode){
              scatterRegressionMode.value=c.regression.mode;
            }
            scatterLastRegressionSummary = c.regression?.summary || null;
            if(c.rotation){
              scatterState.rotation = plot3d.createRotationState(c.rotation);
              if(typeof plot3d.normalizeRotation === 'function'){
                plot3d.normalizeRotation(scatterState.rotation);
              }
            } else {
              scatterState.rotation = plot3d.createRotationState({ x: SCATTER_3D_DEFAULTS.rotationX, y: SCATTER_3D_DEFAULTS.rotationY });
              if(typeof plot3d.normalizeRotation === 'function'){
                plot3d.normalizeRotation(scatterState.rotation);
              }
            }
            scatterState.supports3d = false;
            if(typeof c.viewMode === 'string'){
              const normalizedMode = String(c.viewMode).toLowerCase();
              let storedMode = '2d';
              if(normalizedMode === '3d'){
                storedMode = '3d';
              }else if(normalizedMode === 'bubble'){
                storedMode = 'bubble';
              }
              scatterState.supportsBubble = false;
              applyScatterViewMode(storedMode, {
                allow3d: true,
                allowBubble: true,
                skipSchedule: true,
                forceUpdate: true,
                persistRequest: true
              });
            }
            if(c.axis){
              applyScatterAxisSettings({
                strokeWidth: c.axis.strokeWidth,
                color: c.axis.color,
                tickIntervalX: c.axis.tickIntervalX ?? c.axis.xTickInterval ?? c.axis?.x?.tickInterval ?? null,
                tickIntervalY: c.axis.tickIntervalY ?? c.axis.yTickInterval ?? c.axis?.y?.tickInterval ?? null
              });
              console.debug('Debug: scatter axis settings restored',{ axis: ensureScatterAxisSettings() });
            }
            syncScatterGraphTypeUI();
            scheduleDrawScatter();
          }catch(err){console.error('loadScatterGraph error',err);}
        };
        reader.readAsText(file);
      }
    
      if(Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function'){
        Shared.exporter.mountSvgControls({
          container: '#scatterExportControls',
          svgSelector: '#scatterSvg',
          fileName: 'scatter',
          contextLabel: 'scatter-export'
        });
        console.debug('Debug: scatter export controls mounted', { hasExporter: true }); // Debug: scatter export mount
      }else{
        console.debug('Debug: scatter export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: scatter export fallback
      }
      document.getElementById('openScatterGraph')?.addEventListener('click',openScatterFile);
      document.getElementById('saveScatterGraph')?.addEventListener('click',saveScatterFile);
      document.getElementById('saveAsScatter').addEventListener('click',saveAsScatterFile);
      document.getElementById('scatterGraphFile').addEventListener('change',e=>{
        const f=e.target.files[0];
        if(f){
          scatterFileName=f.name;
          scatterFileHandle=null;
          loadScatterGraphFile(f);
        }
      });
      
    scatter.save = saveScatterFile;
    scatter.saveAs = saveAsScatterFile;
    scatter.open = openScatterFile;
    scatter.loadFromFile = loadScatterGraphFile;
    scatter.getPayload = getScatterGraphPayload;
    scatter.serialize = serializeSvg;
    scatter.ready = true;
    console.debug('Debug: Components.scatter.setup complete');
  }

  function ensureReady(){ if(!scatter.ready) setup(); }

  scatter.init = setup;
  scatter.ensure = ensureReady;
  scatter.draw = function draw(){ ensureReady(); scheduleDrawScatter && scheduleDrawScatter(); };

})(window);

