// Pie/Proportion Graph component module
// Exposes: window.Components.pie = { init(root), draw(), save(), open(), loadFromFile(file) }
(function(global){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const pie = Components.pie = Components.pie || {};
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
  pie.__installed = true; // signal to legacy code to skip
  pie.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: pie component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: pie component awaiting Shared.tableImport helpers'); // Debug: table import helper check
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('pie')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'pie', debugLabel: 'pie-viewport-fallback', ...options });
        return;
      }
      console.debug('Debug: pie ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  console.debug('Debug: pie graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const PIE_DEFAULT_ROWS = 100;
  const PIE_DEFAULT_COLS = 6;
  const DEFAULT_AXIS_COLOR = '#000000';

  function attachPieSelectAutoSize(select, label){
    if(!select){ return; }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'pie';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          console.debug('Debug: pie select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          console.debug('Debug: pie select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        console.debug('Debug: pie select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        console.debug('Debug: pie select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
    }
  }

  function createDefaultAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null },
      y: { tickInterval: null }
    };
  }

  function ensureAxisSettings(){
    if(!state.axisSettings || typeof state.axisSettings !== 'object'){
      state.axisSettings = createDefaultAxisSettings();
    }
    if(!state.axisSettings.x || typeof state.axisSettings.x !== 'object'){
      state.axisSettings.x = { tickInterval: null };
    }
    if(!state.axisSettings.y || typeof state.axisSettings.y !== 'object'){
      state.axisSettings.y = { tickInterval: null };
    }
    const numericStroke = Number(state.axisSettings.strokeWidth);
    state.axisSettings.strokeWidth = Number.isFinite(numericStroke) && numericStroke > 0 ? numericStroke : 1;
    if(typeof state.axisSettings.color !== 'string' || !state.axisSettings.color.trim()){
      state.axisSettings.color = DEFAULT_AXIS_COLOR;
    }
    return state.axisSettings;
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
    console.debug('Debug: pie axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
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
    console.debug('Debug: pie axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    state.scheduleDraw?.();
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    console.debug('Debug: pie axis color updated',{ color: settings.color });
    state.scheduleDraw?.();
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
    }
    state.axisSettings = base;
    ensureAxisSettings();
    console.debug('Debug: pie axis settings applied',{ settings: state.axisSettings });
  }

  function buildManualPercentTicks(interval){
    if(!Number.isFinite(interval) || interval <= 0){ return null; }
    const ticks = [];
    let current = 0;
    let guard = 0;
    while(current <= 100 + interval * 0.25 && guard < 1000){
      ticks.push(Number.parseFloat(current.toFixed(6)));
      current += interval;
      guard += 1;
    }
    if(ticks[ticks.length - 1] !== 100){
      ticks.push(100);
    }
    console.debug('Debug: pie manual percent ticks',{ interval, tickCount: ticks.length });
    return ticks;
  }

  let state = {
    hot: null,
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'pie.graph',
    titleText: 'Proportion graph',
    legendWidth: 120,
    colors: {},
    svgBox: null,
    layout: null,
    minSvgWidth: 0,
    axisSettings: createDefaultAxisSettings()
  };

  // Return a default color palette for slices
  // Prefer globally defined palettes if available; fallback to local palette
  function getDefaultPalette(){
    try{
      const palFromGlobal = (global && Array.isArray(global.DEFAULT_SCATTER_COLORS)) ? global.DEFAULT_SCATTER_COLORS : undefined;
      // Some sections define DEFAULT_SCATTER_COLORS as a global lexical binding
      // eslint-disable-next-line no-undef
      const palFromLexical = (typeof DEFAULT_SCATTER_COLORS !== 'undefined' && Array.isArray(DEFAULT_SCATTER_COLORS)) ? DEFAULT_SCATTER_COLORS : undefined;
      const palette = palFromGlobal || palFromLexical || ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
      return palette;
    }catch(_e){
      return ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
    }
  }

  const markFontEditable = (node, role, key) => {
    if (!node) { return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if (fontControls && typeof fontControls.markText === 'function') {
      fontControls.markText(node, { scopeId: 'pie', role, key });
    } else if (node.dataset) {
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'pie';
      if (role) node.dataset.fontRole = role;
      if (key || role) node.dataset.fontKey = key || role;
    }
    if (!role || role.indexOf('Tick') === -1) {
      console.debug('Debug: pie markFontEditable', payload); // Debug: font target tagging summary
    }
  };

  function initHot(){
    const container=document.getElementById('pieHot');
    console.debug('Debug: pie initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('pie initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData(PIE_DEFAULT_ROWS, PIE_DEFAULT_COLS);
    let pieScheduleProxyCount = 0;
    const schedulePieDrawProxy = () => {
      pieScheduleProxyCount += 1;
      if(pieScheduleProxyCount <= 5){
        console.debug('Debug: pie scheduleDraw proxy invoked', { count: pieScheduleProxyCount }); // Debug: table change trigger
        if(pieScheduleProxyCount === 5){
          console.debug('Debug: pie scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
        }
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };

    state.hot = Shared.hot.createStandardTable(container, { rows: PIE_DEFAULT_ROWS, cols: PIE_DEFAULT_COLS }, schedulePieDrawProxy, {
      debugLabel: 'pie',
      data,
      firstRowClassName: 'htCenter',
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        minSpareRows: 10,
        afterChange(changes, source){
          if(changes){
            console.log('pie afterChange', { count: changes.length, source });
          }
        },
        afterUndo(){
          console.log('pie undo');
        },
        afterRedo(){
          console.log('pie redo');
        }
      }
    });
  }

  function initControls(){
    const pieShowPercents=$('#pieShowPercents');
    const pieStartAngle=$('#pieStartAngle');
    const pieFontSize=$('#pieFontSize');
    const pieFontSizeVal=$('#pieFontSizeVal');
    const pieChartType=$('#pieChartType');
    const valueColumn=$('#pieValueColumn');
    const expectedColumn=$('#pieExpectedColumn');
    const pieAutoSizeTargets=[pieChartType,valueColumn,expectedColumn];
    pieAutoSizeTargets.filter(Boolean).forEach(select=>{
      attachPieSelectAutoSize(select, 'pie');
    });
    if(pieFontSize?.dataset){
      pieFontSize.dataset.fontBasePt = String(pieFontSize.value);
      console.debug('Debug: pie font size base initialized',{ value: pieFontSize.value }); // Debug: initial base size
    }
    chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, pt: Number(pieFontSize.value), input: pieFontSize, manual: true });
    ;[pieShowPercents,pieStartAngle,pieFontSize,pieChartType].forEach(el=>el.addEventListener('input',()=>{ console.log('pie config changed',el.id,el.value); if(el===pieFontSize){
        if(pieFontSize.dataset){
          pieFontSize.dataset.fontBasePt = String(pieFontSize.value);
          console.debug('Debug: pie font size input manual set',{ value: pieFontSize.value }); // Debug: manual slider update
        }
        chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, pt: Number(pieFontSize.value), input: pieFontSize, manual: true });
      }
      state.scheduleDraw(); }));
    pieShowFrame.addEventListener('change',()=>{console.debug('Debug: pie showFrame change',{checked:pieShowFrame.checked}); state.scheduleDraw();});
    valueColumn.addEventListener('change',()=>{console.log('pie value column changed',valueColumn.value); state.scheduleDraw();});
    expectedColumn.addEventListener('change',()=>{console.log('pie expected column changed',expectedColumn.value); state.scheduleDraw();});

    const example=[ ['Quarter','Observed','Expected'], ['Q1',120,100], ['Q2',90,100], ['Q3',60,80], ['Q4',130,120] ];
    document.getElementById('pieLoadExample').addEventListener('click',()=>{ state.hot.loadData(example); console.log('pie example loaded with expected values'); state.scheduleDraw(); });
    const pieImportBtn=document.getElementById('pieImport');
    const pieFileInput=document.getElementById('pieFile');
    pieImportBtn.addEventListener('click',()=>{ pieFileInput.value=''; pieFileInput.click(); });
    pieFileInput.addEventListener('change',async ()=>{
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('pie import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const fileName = pieFileInput.files?.[0]?.name || '';
      console.debug('Debug: pie import start',{fileName}); // Debug: import start trace
      try{
        const result = await tableImport.openFile(pieFileInput,{
          hot: state.hot,
          minCols: PIE_DEFAULT_COLS,
          minRows: PIE_DEFAULT_ROWS,
          scheduleDraw: state.scheduleDraw,
          debugLabel: 'pie',
          onProcessed: info => {
            console.debug('Debug: pie tableImport processed', info || {}); // Debug: processed callback
          }
        });
        console.debug('Debug: pie import finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
      }catch(err){
        console.error('pie import failed',err);
      }
    });

    // Export buttons
    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#pieExportControls',
        svgSelector: '#pieSvg',
        fileName: 'pie',
        contextLabel: 'pie-export'
      });
      console.debug('Debug: pie export controls mounted', { hasExporter: true }); // Debug: pie export mount
    } else {
      console.debug('Debug: pie export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: pie export fallback
    }

    // Save/Open
    function getPayload(){
      const payload = {
        type:'pie',
        data: state.hot.getData(),
        exclusions: state.hot?.exportExclusions?.() || Shared.hot.exportExclusions(state.hot),
        config: collectConfig()
      };
      console.debug('Debug: pie.getPayload captured state', {
        rows: payload.data?.length || 0,
        cols: payload.data?.[0]?.length || 0,
        chartType: payload.config?.chartType
      });
      return payload;
    }
    pie.getPayload = getPayload;
    function collectConfig(){
      const axisSettings = ensureAxisSettings();
      return {
        title: state.titleText,
        chartType: $('#pieChartType').value,
        showPercents: $('#pieShowPercents').checked,
        showFrame: $('#pieShowFrame').checked,
        startAngle: $('#pieStartAngle').value,
        fontSize: $('#pieFontSize').value,
        fontStyles: (exportFontStyles('pie') || undefined),
        valueColumn: $('#pieValueColumn').value,
        expectedColumn: $('#pieExpectedColumn').value,
        colors: state.colors,
        axis: {
          strokeWidth: axisSettings.strokeWidth,
          color: axisSettings.color,
          tickIntervalX: axisSettings.x?.tickInterval ?? null,
          tickIntervalY: axisSettings.y?.tickInterval ?? null
        }
      };
    }
    pie.save = async function(){
      console.debug('Debug: pie.save invoked', { hasHandle: !!state.fileHandle });
      if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
        console.error('pie.save missing fileIO.saveGraphFile');
        return;
      }
      const result = await fileIO.saveGraphFile({
        context: 'pie',
        fileHandle: state.fileHandle,
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      console.debug('Debug: pie.save result', result);
    };
    pie.saveAs = async function(){
      console.debug('Debug: pie.saveAs invoked', { currentName: state.fileName });
      if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
        console.error('pie.saveAs missing fileIO.saveGraphFileAs');
        return;
      }
      const result = await fileIO.saveGraphFileAs({
        context: 'pie',
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      console.debug('Debug: pie.saveAs result', result);
    };
    pie.open = async function(){
      console.debug('Debug: pie.open invoked');
      if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
        console.error('pie.open missing fileIO.openGraphFile');
        return;
      }
      const result = await fileIO.openGraphFile({
        context: 'pie',
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; },
        loadFromFile: file => pie.loadFromFile(file),
        triggerInput: () => {
          const input = document.getElementById('pieGraphFile');
          if(input){
            input.value='';
            input.click();
          }
        }
      });
      console.debug('Debug: pie.open result', result);
    };
    pie.loadFromFile = function(file){
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const obj=JSON.parse(e.target.result);
          console.log('loadPieGraph',obj);
          if(obj.type!=='pie') throw new Error('Invalid graph type');
          state.hot.loadData(obj.data||[]);
          if(obj.exclusions){
            state.hot.applyExclusions?.(obj.exclusions);
          }
          const c=obj.config||{};
          importFontStyles('pie', c.fontStyles || null);
          state.titleText=c.title||state.titleText;
          $('#pieChartType').value=c.chartType||$('#pieChartType').value;
          $('#pieShowPercents').checked=!!c.showPercents;
          $('#pieShowFrame').checked=!!c.showFrame;
          $('#pieStartAngle').value=c.startAngle||$('#pieStartAngle').value;
          const pieFontInput=$('#pieFontSize');
          pieFontInput.value=c.fontSize||pieFontInput.value;
          if(pieFontInput.dataset){
            pieFontInput.dataset.fontBasePt = String(pieFontInput.value);
            console.debug('Debug: pie font size base restored',{ value: pieFontInput.value }); // Debug: restore base from file
          }
          chartStyle.renderFontSizeLabel({ element: $('#pieFontSizeVal'), pt: Number(pieFontInput.value), input: pieFontInput, manual: true });
          $('#pieValueColumn').value=c.valueColumn||$('#pieValueColumn').value;
          $('#pieExpectedColumn').value=c.expectedColumn||$('#pieExpectedColumn').value;
          state.colors=c.colors||state.colors;
          applyAxisSettings(c.axis || c.axisSettings);
          state.scheduleDraw();
        }catch(err){
          console.error('loadPieGraph error',err);
        }
      };
      reader.readAsText(file);
    };
    document.getElementById('openPie').addEventListener('click',pie.open);
    document.getElementById('savePie').addEventListener('click',pie.save);
    document.getElementById('saveAsPie').addEventListener('click',pie.saveAs);
    document.getElementById('pieGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; pie.loadFromFile(f); }});
  }

  function ensurePieColors(labels){
    const palette = getDefaultPalette();
    const labelSet = new Set(labels);
    console.debug('Debug: pie color palette in use', { palette }); // Debug: palette source and values
    labels.forEach((lab,i)=>{
      if(!state.colors[lab]){
        state.colors[lab]= palette[i % palette.length];
        console.debug('Debug: pie default color applied',{label:lab,color:state.colors[lab]});
      }
    });
    Object.keys(state.colors).forEach(existing=>{
      if(!labelSet.has(existing)){
        console.debug('Debug: pie color pruned',{label:existing});
        delete state.colors[existing];
      }
    });
    console.log('ensurePieColors sync',state.colors); // Debug: resulting color map
  }

  // Compute and render Chi-square statistics for proportion graphs
  function updatePieStats(labels, observed, expected){
    try{
      const out=document.getElementById('pieStatsResults');
      if(!out){ console.warn('Debug: pieStatsResults element not found'); return; }
      console.debug('Debug: updatePieStats start',{labelCount:labels.length,observedCount:observed.length,expectedCount:expected.length});
      if(!observed || !observed.length){ out.textContent='No data'; return; }
      if(!expected || expected.length!==observed.length || expected.some(e=>isNaN(e))){ out.textContent='Expected values required'; return; }
      const chi2=observed.reduce((s,o,i)=>s+Math.pow(o-expected[i],2)/expected[i],0);
      const df=Math.max(1, observed.length-1);
      let p=NaN;
      if(global.jStat && global.jStat.chisquare && typeof global.jStat.chisquare.cdf === 'function'){
        p = 1-global.jStat.chisquare.cdf(chi2,df);
      }
      const formatP=(val)=>{ if(!isFinite(val)) return String(val); if(val<0.0001) return val.toExponential(2); return val.toFixed(4); };
      const hasRenderer=Shared.statsTable && typeof Shared.statsTable.render==='function';
      const rows=[
        {metric:'Chi²',value:chi2.toFixed(4)},
        {metric:'df',value:String(df)},
        {metric:'p-value',value:isFinite(p)?formatP(p):'N/A'}
      ];
      if(hasRenderer){
        Shared.statsTable.render({
          target:out,
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows,
          caption:'Goodness-of-fit test',
          options:{
            fileName:'pie-chi-square',
            contextLabel:'pie-chi-square'
          }
        });
      }else{
        out.innerHTML=`<table><tr><th>Chi²</th><td>${chi2.toFixed(4)}</td></tr><tr><th>df</th><td>${df}</td></tr><tr><th>p-value</th><td>${isFinite(p)?formatP(p):'N/A'}</td></tr></table>`;
      }
      console.debug('Debug: updatePieStats result',{chi2,df,p});
    }catch(err){ console.error('updatePieStats error',err); }
  }

  function updatePieColumns(header){
    const valueColumn=$('#pieValueColumn'); const expectedColumn=$('#pieExpectedColumn');
    const prevVal=valueColumn.value; const prevExp=expectedColumn.value; valueColumn.innerHTML=''; expectedColumn.innerHTML='';
    console.log('updatePieColumns prev',{prevVal,prevExp});
    for(let c=1;c<header.length;c++){ const txt=header[c]||`Column ${c+1}`; const optVal=document.createElement('option'); optVal.value=String(c); optVal.textContent=txt; if(optVal.value===prevVal) optVal.selected=true; valueColumn.appendChild(optVal); const optExp=document.createElement('option'); optExp.value=String(c); optExp.textContent=txt; if(optExp.value===prevExp) optExp.selected=true; expectedColumn.appendChild(optExp); }
    if(!prevVal && header.length>1) valueColumn.value='1';
    if(!prevExp){ const expIdx=header.findIndex((h,i)=>i>0 && String(h).trim().toLowerCase()==='expected'); if(expIdx>0) expectedColumn.value=String(expIdx); else if(header.length>2) expectedColumn.value='2'; }
    if(typeof formControls.autoSizeSelect === 'function'){
      formControls.autoSizeSelect(valueColumn);
      formControls.autoSizeSelect(expectedColumn);
    }
    console.log('updatePieColumns',{val:valueColumn.value,exp:expectedColumn.value});
  }

  function draw(){
    const plotEl=document.getElementById('piePlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    const type=$('#pieChartType').value;
    const containerRect=state.svgBox?.getBoundingClientRect?.();
    const pieFontInput=$('#pieFontSize');
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: pieFontInput.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: state.svgBox,
      input: pieFontInput
    });
    const fs=fontInfo.scaledPx;
    chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, fontInfo, input: pieFontInput });
    console.debug('Debug: pie font scaling applied',{
      input:$('#pieFontSize').value,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fs,
      scale:fontInfo.scaleInfo?.scale,
      containerWidth:containerRect?.width,
      containerHeight:containerRect?.height
    });
    const axisMetrics=chartStyle.createAxisMetrics(fs);
    console.debug('Debug: pie axis metrics',axisMetrics);
    const styleScaleInfo=fontInfo.scaleInfo;
    const fontScale=styleScaleInfo?.styleScale || styleScaleInfo?.scale || 1;
    const showPerc=$('#pieShowPercents').checked;
    const showFrame=$('#pieShowFrame').checked;
    console.debug('Debug: pie showFrame state',{showFrame, chartType:type});
    const startDeg=parseFloat($('#pieStartAngle').value)||0;
    const data=state.hot.getData();
    updatePieColumns(data[0]||[]);

    if(type==='stacked'){
      const header=data[0]||[]; const barHeaders=header.slice(1).filter(h=>h!==null&&h!==''); const segmentLabels=[]; const segmentValues=[];
      for(let r=1;r<data.length;r++){ const row=data[r]; const seg=row[0]; if(seg){ const vals=[]; for(let c=1;c<=barHeaders.length;c++){ const v=parseFloat(row[c]); vals.push(isNaN(v)?0:v);} segmentLabels.push(String(seg)); segmentValues.push(vals);} }
      if(!barHeaders.length||!segmentLabels.length){plotEl.innerHTML='<i>No data</i>';return;}
      ensurePieColors(segmentLabels);
      const palette = getDefaultPalette();
      const stackedLegendEntries = segmentLabels.map((lab,i)=>({
        label: lab,
        fill: state.colors[lab] || palette[i % palette.length],
        key: lab,
        editable: true
      }));
      const stackedLegendLayout = chartStyle.computeLegendLayout({ entries: stackedLegendEntries, fontSize: fs });
      state.legendWidth = Math.ceil(stackedLegendLayout.renderer.width);
      const stackedLegendMargin = Math.max(stackedLegendLayout.legendGapPx, Math.round(8 * fontScale));
      const stackedLegendGap = stackedLegendLayout.legendGapPx;
      const stackedLegendMarkerSize = stackedLegendLayout.renderer.swatchSize;
      console.debug('Debug: pie stacked legend metrics',{
        legendWidth: state.legendWidth,
        legendGap: stackedLegendGap,
        legendMarkerSize: stackedLegendMarkerSize,
        entryCount: stackedLegendLayout.renderer.entries.length
      });
      plotEl.style.display='flex'; plotEl.style.alignItems='flex-start';
      const svgWidth=Math.max(50,Math.floor(plotEl.clientWidth||50)-state.legendWidth);
      const svgHeight=Math.max(50,Math.floor(plotEl.clientHeight||50));
      const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','pieSvg'); svg.setAttribute('width',String(svgWidth)); svg.setAttribute('height',String(svgHeight)); svg.setAttribute('viewBox',`0 0 ${svgWidth} ${svgHeight}`); svg.setAttribute('font-family',chartStyle.FONT_FAMILY); chartStyle.applySvgDefaults(svg); plotEl.appendChild(svg);
      const doc = svg.ownerDocument || global.document;
      const barLayer = doc?.createElementNS ? doc.createElementNS(NS,'g') : null;
      const axisLayer = doc?.createElementNS ? doc.createElementNS(NS,'g') : null;
      if(barLayer){
        barLayer.dataset.layer = 'pie-data';
        svg.appendChild(barLayer);
      }
      if(axisLayer){
        axisLayer.dataset.layer = 'pie-axis';
        svg.appendChild(axisLayer);
      }
      if(fontControls && typeof fontControls.enableForSvg === 'function'){
        fontControls.enableForSvg(svg,{ scopeId: 'pie' });
        console.debug('Debug: pie fontControls enableForSvg invoked',{ width: svgWidth, height: svgHeight }); // Debug: font panel binding
      } else {
        console.debug('Debug: pie fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
      }
      const axisSettings = ensureAxisSettings();
      const axisStrokeWidthBase = axisSettings.strokeWidth;
      const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'pie-axis', min: 0.25 });
      const axisStroke = axisSettings.color || '#000';
      const manualIntervalY = getAxisTickInterval('y');
      const percentTicks = Number.isFinite(manualIntervalY) && manualIntervalY > 0 ? buildManualPercentTicks(manualIntervalY) : [0,25,50,75,100];
      const legend=document.createElement('div');
      legend.style.width=state.legendWidth+'px';
      legend.style.fontSize=fs+'px';
      legend.style.marginLeft=stackedLegendMargin+'px';
      legend.style.display='flex';
      legend.style.flexDirection='column';
      plotEl.appendChild(legend);
      console.debug('Debug: pie stacked axis stroke',{ axisStrokeWidthBase, axisStrokeWidth, axisStroke, manualIntervalY });
      const yTickLabels=percentTicks.map(v=>`${Number.isInteger(v) ? v : Number(v).toFixed(1)}%`);
      const tickFont=chartStyle.makeFont(fs);
      const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
      const maxYLabelWidth=Math.max(...yLabelWidths,0);
      const axisLabelFont=chartStyle.makeFont(fs);
      const yTitleText='Percentage';
      const yTitleWidth=chartStyle.measureText(yTitleText,axisLabelFont);
      let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth:0,maxYLabelWidth,yTitleWidth,axisMetrics});
      let chartWidth=Math.max(20,svgWidth-margin.left-margin.right);
      let chartHeight=Math.max(20,svgHeight-margin.top-margin.bottom);
      const bottomLayout=chartStyle.computeBottomLayout({labels:barHeaders,fontSize:fs,plotWidth:chartWidth,baseBottom:margin.bottom,axisMetrics});
      margin.bottom=bottomLayout.bottom;
      chartWidth=Math.max(20,svgWidth-margin.left-margin.right);
      chartHeight=Math.max(20,svgHeight-margin.top-margin.bottom);
      const tickLen=axisMetrics.tickLength;
      const tickGap=axisMetrics.tickLabelGap;
      const axis=document.createElementNS(NS,'g');
      const axisHost = axisLayer || svg;
      axisHost.appendChild(axis);
      const yAxis=document.createElementNS(NS,'line'); yAxis.setAttribute('x1',margin.left); yAxis.setAttribute('y1',margin.top); yAxis.setAttribute('x2',margin.left); yAxis.setAttribute('y2',margin.top+chartHeight); yAxis.setAttribute('stroke',axisStroke); yAxis.setAttribute('stroke-width',axisStrokeWidth); axis.appendChild(yAxis);
      const xAxis=document.createElementNS(NS,'line'); xAxis.setAttribute('x1',margin.left); xAxis.setAttribute('y1',margin.top+chartHeight); xAxis.setAttribute('x2',margin.left+chartWidth); xAxis.setAttribute('y2',margin.top+chartHeight); xAxis.setAttribute('stroke',axisStroke); xAxis.setAttribute('stroke-width',axisStrokeWidth); axis.appendChild(xAxis);
      const axisControlConfig = axisName => ({
        axis: axisName,
        scopeId: 'pie',
        getTickInterval: () => getAxisTickInterval(axisName),
        getThickness: () => getAxisStrokeWidthBase(),
        getColor: () => getAxisColor(),
        isTickIntervalEnabled: () => axisName === 'y',
        getTickIntervalDisabledMessage: () => 'Tick interval is managed automatically for categorical axes.',
        tickPlaceholder: 'Auto',
        onTickIntervalChange: value => updateAxisTickInterval(axisName, value),
        onThicknessChange: value => updateAxisStrokeWidth(value),
        onColorChange: value => updateAxisColor(value)
      });
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(xAxis, axisControlConfig('x'));
        axisControls.registerAxisElement(yAxis, axisControlConfig('y'));
      }
      let stackedYTickCount = 0;
      percentTicks.forEach(t=>{ const y=margin.top+chartHeight-(chartHeight*t/100); const tick=document.createElementNS(NS,'line'); tick.setAttribute('x1',margin.left-tickLen); tick.setAttribute('y1',y); tick.setAttribute('x2',margin.left); tick.setAttribute('y2',y); tick.setAttribute('stroke',axisStroke); tick.setAttribute('stroke-width',axisStrokeWidth); axis.appendChild(tick); const txt=document.createElementNS(NS,'text'); txt.setAttribute('x',margin.left-(tickLen+tickGap)); txt.setAttribute('y',y); txt.setAttribute('text-anchor','end'); txt.setAttribute('dominant-baseline','middle'); txt.setAttribute('font-size',fs); txt.textContent=`${Number.isInteger(t)?t:t.toFixed(1)}%`; markFontEditable(txt,'yTick'); stackedYTickCount+=1; axis.appendChild(txt);}); const yTitleX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5); const yTitle=document.createElementNS(NS,'text'); yTitle.setAttribute('x',yTitleX); yTitle.setAttribute('y',margin.top+chartHeight/2); yTitle.setAttribute('text-anchor','middle'); yTitle.setAttribute('transform',`rotate(-90 ${yTitleX} ${margin.top+chartHeight/2})`); yTitle.setAttribute('font-size',fs); yTitle.textContent=yTitleText; markFontEditable(yTitle,'yTitle','yTitle'); axis.appendChild(yTitle);
      if(showFrame){
        console.debug('Debug: pie frame request',{stroke:axisStroke, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
        chartStyle.drawPlotFrame({ svg, margin, plotW: chartWidth, plotH: chartHeight, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'], group: axis });
      }
      // Frame closes stacked bar plot area using axis styling continuity
      const barGapBase=10;
      const barGap=Math.max(6,Math.round(barGapBase*fontScale));
      const availableWidth=Math.max(0,chartWidth-(barHeaders.length+1)*barGap);
      const barWidth=barHeaders.length?Math.max(0,availableWidth/barHeaders.length):0;
      const xLabels=[];
      // Debug: stacked bar chart layout metrics
      console.debug('Debug: stacked bar layout metrics',{svgWidth,svgHeight,chartWidth,chartHeight,barCount:barHeaders.length,barWidth,barGap,fontScale});
      let stackedXTickCount = 0;
      barHeaders.forEach((bh,j)=>{ let y=margin.top+chartHeight; const total=segmentValues.reduce((s,row)=>s+(row[j]||0),0); segmentLabels.forEach((lab,i)=>{ const val=segmentValues[i][j]||0; const frac=total?val/total:0; const h=chartHeight*frac; y-=h; const rect=document.createElementNS(NS,'rect'); rect.setAttribute('x',margin.left+barGap+j*(barWidth+barGap)); rect.setAttribute('y',y); rect.setAttribute('width',barWidth); rect.setAttribute('height',h); const fillColor = state.colors[lab] || palette[i % palette.length]; rect.setAttribute('fill', fillColor); (barLayer||svg).appendChild(rect); if(showPerc && frac>0){ const txt=document.createElementNS(NS,'text'); txt.setAttribute('x',margin.left+barGap+j*(barWidth+barGap)+barWidth/2); txt.setAttribute('y',y+h/2); txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size',fs); txt.textContent=(frac*100).toFixed(1)+'%'; markFontEditable(txt,'annotation',`stacked-annotation-${j}-${i}`); (barLayer||svg).appendChild(txt);} }); const lbl=document.createElementNS(NS,'text'); const lx=margin.left+barGap+j*(barWidth+barGap)+barWidth/2; const ly=margin.top+chartHeight+tickLen+tickGap; lbl.setAttribute('x',lx); lbl.setAttribute('y',ly); lbl.setAttribute('text-anchor','middle'); lbl.setAttribute('font-size',fs); lbl.setAttribute('dominant-baseline','hanging'); lbl.textContent=bh; markFontEditable(lbl,'xTick'); stackedXTickCount+=1; (axisLayer||svg).appendChild(lbl); xLabels.push(lbl); });
      console.debug('Debug: pie stacked font tick binding',{ stackedXTickCount, stackedYTickCount }); // Debug: stacked font binding counts
      chartStyle.applyLabelOrientation(xLabels,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
      legend.style.gap=stackedLegendGap+'px';
      segmentLabels.forEach((lab,i)=>{
        const item=document.createElement('div');
        item.style.display='flex';
        item.style.alignItems='center';
        item.style.gap=stackedLegendGap+'px';
        const swatch=document.createElement('span');
        swatch.style.display='inline-block';
        swatch.style.width=stackedLegendMarkerSize+'px';
        swatch.style.height=stackedLegendMarkerSize+'px';
        swatch.style.borderRadius='2px';
        swatch.style.background=state.colors[lab] || palette[i % palette.length];
        swatch.style.cursor='pointer';
        swatch.addEventListener('click',(evt)=>{
          if(evt){ evt.stopPropagation(); }
          const currentColor=state.colors[lab] || palette[i % palette.length];
          Shared.openColorPicker({
            anchor: swatch,
            color: currentColor,
            onInput(value){
              state.colors[lab]=value;
              console.debug('Debug: pie stacked legend color input',{label:lab,color:value});
              state.scheduleDraw?.();
            }
          });
        });
        const labelSpan=document.createElement('span');
        labelSpan.textContent=lab;
        item.appendChild(swatch);
        item.appendChild(labelSpan);
        legend.appendChild(item);
      });
      console.debug('Debug: pie legend items rendered',{
        legendItemCount:segmentLabels.length,
        legendMarkerSize: stackedLegendMarkerSize,
        legendGap: stackedLegendGap
      });
      if(axis.parentNode !== (axisLayer || svg)){
        (axisLayer || svg).appendChild(axis);
      }
      // Title inline (editable)
      const title=document.createElementNS(NS,'text'); title.setAttribute('x',margin.left+chartWidth/2); title.setAttribute('y',margin.top/2); title.setAttribute('text-anchor','middle'); title.setAttribute('font-size',fs); title.textContent=state.titleText; markFontEditable(title,'graphTitle','graphTitle'); if(global.makeEditable) makeEditable(title,txt=>{state.titleText=txt;}); svg.appendChild(title);
      ensureGraphViewport(svg, { padding: Math.max(fs, 14), debugLabel: 'pie-graph' });
      // Stats for stacked: use selected value/expected columns across segments
      const vi=(parseInt($('#pieValueColumn').value||'1',10)-1);
      const ei=(parseInt($('#pieExpectedColumn').value||'2',10)-1);
      const observed=segmentValues.map(row=>{ const v=row[vi]; return (typeof v==='number' && isFinite(v))?v:parseFloat(v)||0; });
      const expected=segmentValues.map(row=>{ const v=row[ei]; return (typeof v==='number' && isFinite(v))?v:parseFloat(v); });
      console.debug('Debug: stacked pie stats data',{vi,ei,observed,expected});
      updatePieStats(segmentLabels,observed,expected);
      return;
    }

    // Pie/Donut
    const valueColumn=$('#pieValueColumn'); const expectedColumn=$('#pieExpectedColumn'); const header=data[0]||[]; const values=[]; const expected=[]; const labels=[]; for(let r=1;r<data.length;r++){ const row=data[r]; if(row && row[0]!=null && row[0]!=='' ){ labels.push(String(row[0])); const vi=parseInt(valueColumn.value||'1',10); const ei=parseInt(expectedColumn.value||'2',10); const v=parseFloat(row[vi]); const e=parseFloat(row[ei]); values.push(isNaN(v)?0:v); expected.push(e); }} if(!values.length){ plotEl.innerHTML='<i>No data</i>'; return; } ensurePieColors(labels);
    const palette2 = getDefaultPalette();
    const radialLegendEntries = labels.map((lab,i)=>({
      label: lab,
      fill: state.colors[lab] || palette2[i % palette2.length],
      key: lab,
      editable: true
    }));
    const radialLegendLayout = chartStyle.computeLegendLayout({ entries: radialLegendEntries, fontSize: fs });
    state.legendWidth = Math.ceil(radialLegendLayout.renderer.width);
    const radialLegendMargin = Math.max(radialLegendLayout.legendGapPx, Math.round(8 * fontScale));
    const radialLegendGap = radialLegendLayout.legendGapPx;
    const radialLegendMarkerSize = radialLegendLayout.renderer.swatchSize;
    console.debug('Debug: pie radial legend metrics',{
      legendWidth: state.legendWidth,
      legendGap: radialLegendGap,
      legendMarkerSize: radialLegendMarkerSize,
      entryCount: radialLegendLayout.renderer.entries.length
    });
    plotEl.style.display='flex';
    plotEl.style.alignItems='flex-start';
    const legend=document.createElement('div');
    legend.style.width=state.legendWidth+'px';
    legend.style.fontSize=fs+'px';
    legend.style.marginLeft=radialLegendMargin+'px';
    legend.style.display='flex';
    legend.style.flexDirection='column';
    legend.style.flex='0 0 auto';
    const plotWidth=Math.max(50,Math.floor(plotEl.clientWidth||50));
    const plotHeight=Math.max(50,Math.floor(plotEl.clientHeight||50));
    const svgWidth=Math.max(state.minSvgWidth || 50, plotWidth-state.legendWidth-radialLegendMargin);
    const svgHeight=Math.max(50,plotHeight);
    console.debug('Debug: pie radial layout metrics', {
      plotWidth,
      plotHeight,
      svgWidth,
      svgHeight,
      legendWidth: state.legendWidth,
      legendMargin: radialLegendMargin,
      chartType: type
    });
    const size=Math.min(svgWidth,svgHeight);
    const svgWrapper=document.createElement('div');
    svgWrapper.style.flex='0 0 auto';
    svgWrapper.style.display='flex';
    svgWrapper.style.alignItems='center';
    svgWrapper.style.justifyContent='center';
    svgWrapper.style.width=Math.max(svgWidth, state.minSvgWidth || svgWidth)+'px';
    svgWrapper.style.height=svgHeight+'px';
    const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','pieSvg'); svg.setAttribute('width',String(size)); svg.setAttribute('height',String(size)); svg.setAttribute('viewBox',`0 0 ${size} ${size}`); svg.setAttribute('font-family',chartStyle.FONT_FAMILY); chartStyle.applySvgDefaults(svg); svgWrapper.appendChild(svg); plotEl.appendChild(svgWrapper); plotEl.appendChild(legend);
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg,{ scopeId: 'pie' });
      console.debug('Debug: pie fontControls enableForSvg invoked',{ width: size, height: size }); // Debug: font panel binding
    } else {
      console.debug('Debug: pie fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
    }
    const cx=size/2, cy=size/2; const r=type==='donut' ? size*0.32 : size*0.40; const rInner=type==='donut' ? r*0.6 : 0; const sum=values.reduce((a,b)=>a+b,0) || 1; let startAngle=startDeg*Math.PI/180;
    const legendMarkerSize=Math.max(10,Math.round(12*fontScale));
    legend.style.gap=radialLegendGap+'px';
    labels.forEach((lab,i)=>{ const v=values[i]; const frac=v/sum; const endAngle=startAngle+2*Math.PI*frac; const x1=cx + r*Math.cos(startAngle); const y1=cy + r*Math.sin(startAngle); const x2=cx + r*Math.cos(endAngle); const y2=cy + r*Math.sin(endAngle); const largeArc = (endAngle-startAngle) > Math.PI ? 1 : 0; const path=document.createElementNS(NS,'path'); if(rInner>0){ const x1i=cx + rInner*Math.cos(startAngle); const y1i=cy + rInner*Math.sin(startAngle); const x2i=cx + rInner*Math.cos(endAngle); const y2i=cy + rInner*Math.sin(endAngle); const d=`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x2i} ${y2i} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x1i} ${y1i} Z`; path.setAttribute('d',d); } else { const d=`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`; path.setAttribute('d',d);} const fillColor = state.colors[lab] || palette2[i % palette2.length]; path.setAttribute('fill', fillColor); svg.appendChild(path); if(showPerc && frac>0){ const mid=(startAngle+endAngle)/2; const tx=cx + (rInner>0?(r+rInner)/2:r*0.65)*Math.cos(mid); const ty=cy + (rInner>0?(r+rInner)/2:r*0.65)*Math.sin(mid); const txt=document.createElementNS(NS,'text'); txt.setAttribute('x',tx); txt.setAttribute('y',ty); txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size',fs); txt.textContent=(frac*100).toFixed(1)+'%'; markFontEditable(txt,'annotation',`pie-annotation-${i}`); svg.appendChild(txt);} const legendItem=document.createElement('div'); legendItem.style.display='flex'; legendItem.style.alignItems='center'; legendItem.style.gap=radialLegendGap+'px'; const swatch=document.createElement('span'); swatch.style.display='inline-block'; swatch.style.width=radialLegendMarkerSize+'px'; swatch.style.height=radialLegendMarkerSize+'px'; swatch.style.borderRadius='2px'; swatch.style.background=fillColor; swatch.style.cursor='pointer'; swatch.addEventListener('click',(evt)=>{ if(evt){ evt.stopPropagation(); } const currentColor=state.colors[lab] || fillColor; Shared.openColorPicker({ anchor: swatch, color: currentColor, onInput(value){ state.colors[lab]=value; console.debug('Debug: pie legend color input',{label:lab,color:value}); state.scheduleDraw?.(); } }); }); const labelSpan=document.createElement('span'); labelSpan.textContent=lab; legendItem.appendChild(swatch); legendItem.appendChild(labelSpan); legend.appendChild(legendItem); startAngle=endAngle; });
    console.debug('Debug: pie legend items rendered',{ legendItemCount: labels.length, legendMarkerSize: radialLegendMarkerSize, legendGap: radialLegendGap, chartType: type });
    const title=document.createElementNS(NS,'text'); title.setAttribute('x',cx); title.setAttribute('y',fs); title.setAttribute('text-anchor','middle'); title.setAttribute('font-size',fs); title.textContent=state.titleText; markFontEditable(title,'graphTitle','graphTitle'); if(global.makeEditable) makeEditable(title,txt=>{state.titleText=txt;}); svg.appendChild(title);
    const axisStrokeWidthBase = getAxisStrokeWidthBase();
    const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'pie-axis', min: 0.25 });
    const frameStroke = '#000';
    if(showFrame){
      console.debug('Debug: pie circular frame request',{stroke:frameStroke, size, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
      chartStyle.drawPlotFrame({ svg, margin: { top: 0, right: 0, bottom: 0, left: 0 }, plotW: size, plotH: size, stroke: frameStroke, strokeWidth: axisStrokeWidth, sides: ['top','right','bottom','left'] });
    }
    ensureGraphViewport(svg, { padding: Math.max(fs, 14), debugLabel: 'pie-graph' });
    // Stats for single pie/donut
    updatePieStats(labels, values, expected);
  }

  pie.draw = draw;
  pie.init = function init(){
    if (pie.ready) { console.debug('Debug: Components.pie.init skipped (already ready)'); return; }
    console.debug('Debug: Components.pie.init');
    // Placeholder to avoid early resizer callbacks failing
    state.scheduleDraw = ()=>{};
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'pie',
      selectors: {
        tablePanel: '#pieTablePanel',
        graphPanel: '#pieGraphPanel',
        panelResizer: '#piePanelResizer',
        hotWrapper: '#pieHotWrapper',
        hotContainer: '#pieHot',
        svgBox: () => document.querySelector('#pieGraphPanel .svgbox'),
        resizeTarget: () => document.querySelector('#pieGraphPanel .svgbox')
      },
      scheduleDraw: state.scheduleDraw,
      onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        console.debug('Debug: pie layout min width update', { value: state.minSvgWidth });
      }
    });
    state.svgBox = state.layout?.elements?.svgBox || state.svgBox;
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    state.layout?.syncPanels?.();
    initHot();
    initControls();
    state.scheduleDraw = Shared.debounceFrame(draw);
    console.debug('Debug: pie scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    pie.ready = true;
  };

  pie.ensure = function ensure(){ if (!pie.ready) pie.init(); };

})(window);


