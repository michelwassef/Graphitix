(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const box = Components.box = Components.box || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  box.__installed = true;
  box.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: box component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: box component awaiting Shared.tableImport helpers');
  }

  // PART: UTILS
  const NS='http://www.w3.org/2000/svg';
  const DEFAULT_BOX_COLORS=['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854','#ffd92f','#e5c494','#b3b3b3'];
  const DEFAULT_ROWS=100, DEFAULT_COLS=10;
  const ANN_BASE_OFFSET=25;
  const ANN_LEVEL_GAP=25;

  function shadeColor(color, percent){
    const num=parseInt(color.slice(1),16);
    const amt=Math.round(2.55*percent);
    const R=(num>>16)+amt; const G=(num>>8&0x00FF)+amt; const B=(num&0x0000FF)+amt;
    const newColor='#'+(0x1000000+(R<255?(R<0?0:R):255)*0x10000+(G<255?(G<0?0:G):255)*0x100+(B<255?(B<0?0:B):255)).toString(16).slice(1);
    console.debug('Debug: shadeColor',{color,percent,newColor}); // Debug
    return newColor;
  }
  const makeEditable = (el,onChange,options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if (typeof fn === 'function') {
      return fn(el,onChange,options);
    }
    console.warn('box component makeEditable fallback missing');
    return undefined;
  };
  const serializeSvg = (svgEl, options) => {
    const fn = Shared.serializeCleanSVG || global.serializeCleanSVG;
    if (typeof fn === 'function') {
      return fn(svgEl, options);
    }
    if (!svgEl) return '';
    const serializer = new (global.XMLSerializer || XMLSerializer)();
    return serializer.serializeToString(svgEl);
  };
  const autoResizeSvg = (svg, opts) => {
    const fn = Shared.autoResizeSvg || global.autoResizeSvg;
    if (typeof fn === 'function') {
      return fn(svg, opts);
    }
    console.warn('box component autoResizeSvg fallback missing');
    return undefined;
  };
  console.debug('Debug: box component DOM helpers resolved', {
    hasSharedEditable: typeof Shared.makeEditable === 'function',
    hasSharedResize: typeof Shared.autoResizeSvg === 'function',
    hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
  }); // Debug: helper resolution summary
  function ensureWrapperStyles(){ const wrapper=global.document.getElementById('hotWrapper'); if(global.Shared && Shared.ensureHotWrapperStyles) Shared.ensureHotWrapperStyles(wrapper); }

  // Local state and element cache
  const state = { hot: null, scheduleDraw: function(){}, fileHandle: null, fileName: 'box.graph', titleText: 'Boxplot', yLabelText: 'Value', lastDefaultFill: '#4472c4', selectedCols: new Set(), statsTest: 'parametric', statsMode: 'all', statsRef: 0, statsPaired: false, statsPairsText: '', statsCustomPairs: [], colOrder: [], fillColors: [], borderColors: [], drawToken: 0, flipAxes: false };
  const els = {};

  // PART: CACHE_ELS
  function cacheEls(){
    els.tablePanel = global.document.getElementById('boxTablePanel');
    els.graphPanel = global.document.getElementById('boxGraphPanel');
    els.panelResizer = global.document.getElementById('boxPanelResizer');
    els.svgBox = els.graphPanel?.querySelector('.svgbox');
    els.configPanel = els.graphPanel?.querySelector('.config-options');
    els.hotContainer = global.document.getElementById('hot');
    els.hotWrapper = global.document.getElementById('hotWrapper');
    els.plotDiv = global.document.getElementById('boxPlot');
    // Controls
    els.boxColorUnified=global.$('#boxColorUnified');
    els.boxColorIndividual=global.$('#boxColorIndividual');
    els.boxUnifiedColors=global.$('#boxUnifiedColors');
    els.boxFill=global.$('#boxFill');
    els.boxBorder=global.$('#boxBorder');
    els.boxBorderWidth=global.$('#boxBorderWidth');
    els.boxFontSize=global.$('#boxFontSize');
    els.boxFontSizeVal=global.$('#boxFontSizeVal');
    if (typeof chartStyle.renderFontSizeLabel === 'function') {
      chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: Number(els.boxFontSize.value) });
    } else {
      console.debug('Debug: box renderFontSizeLabel missing helper'); // Debug: chartStyle guard
    }
    els.boxShowGrid=global.$('#boxShowGrid');
    els.boxShowFrame=global.$('#boxShowFrame');
    els.boxLogScale=global.$('#boxLogScale');
    els.boxLogScaleLabel=global.$('#boxLogScaleLabel');
    els.boxFlipAxes=global.$('#boxFlipAxes');
    els.boxGraphType=global.$('#boxGraphType');
    els.boxPointMode=global.$('#boxPointMode');
    els.boxShowCaps=global.$('#boxShowCaps');
    els.boxErrorMode=global.$('#boxErrorMode');
    els.boxErrorModeCtl=global.$('#boxErrorModeCtl');
    els.boxColorPerBox=global.$('#boxColorPerBox');
    els.boxYMin=global.$('#boxYMin');
    els.boxYMax=global.$('#boxYMax');
  }

  // PART: INIT_TABLE
  function initTableAndResizers(){
    let minSvgWidth=0;
    const syncPanels = () => {
      Shared.syncPanelWidths(els.tablePanel, els.graphPanel, els.configPanel, state.scheduleDraw, {
        svgBox: els.svgBox,
        minSvgWidth,
        debugLabel: 'box',
        panelResizer: els.panelResizer
      });
    };
    const observer=new ResizeObserver(()=>{syncPanels();}); observer.observe(els.tablePanel); syncPanels();
    const container=els.plotDiv.closest('.svgbox')||els.plotDiv.parentElement;
    if(global.Shared && Shared.attachResizableBox && container){
      let graphSizing = chartStyle.getSquareGraphSizing
        ? chartStyle.getSquareGraphSizing({ context: 'box' })
        : (function fallbackSizing(){
            const baseWidth = Number(chartStyle.DEFAULT_WIDTH) || 640;
            const baseHeight = Number(chartStyle.DEFAULT_HEIGHT) || baseWidth;
            const minScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
            const maxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
            const fallback = {
              width: baseWidth,
              height: baseHeight,
              minWidth: Math.max(1, Math.round(baseWidth * minScale)),
              minHeight: Math.max(1, Math.round(baseHeight * minScale)),
              maxWidth: Math.max(baseWidth, Math.round(baseWidth * Math.max(maxScale, minScale))),
              maxHeight: Math.max(baseHeight, Math.round(baseHeight * Math.max(maxScale, minScale))),
              aspectRatio: chartStyle.DEFAULT_ASPECT_RATIO || 1,
              aspectLocked: chartStyle.DEFAULT_ASPECT_LOCKED !== false
            };
            console.debug('Debug: box fallback square sizing',{ context: 'box', fallback }); // Debug: fallback sizing payload
            return fallback;
          })();
      if(graphSizing && typeof graphSizing === 'object'){
        const heightMultiplier = 1.5;
        const adjustDimension = (value, label) => {
          const numeric = Number(value);
          const scaled = Number.isFinite(numeric) ? Math.round(numeric * heightMultiplier) : numeric;
          console.debug('Debug: box height adjust', { label, numeric, scaled, heightMultiplier }); // Debug: height scaling trace
          return scaled;
        };
        const adjustedHeight = adjustDimension(graphSizing.height, 'default');
        const adjustedMinHeight = adjustDimension(graphSizing.minHeight, 'min');
        const adjustedMaxHeight = adjustDimension(graphSizing.maxHeight, 'max');
        const widthForRatio = Number(graphSizing.width);
        const ratioCandidate = Number.isFinite(widthForRatio) && widthForRatio > 0 && Number.isFinite(adjustedHeight) && adjustedHeight > 0
          ? widthForRatio / adjustedHeight
          : Number(graphSizing.aspectRatio);
        graphSizing = {
          ...graphSizing,
          height: adjustedHeight,
          minHeight: adjustedMinHeight,
          maxHeight: adjustedMaxHeight,
          aspectRatio: Number.isFinite(ratioCandidate) && ratioCandidate > 0 ? ratioCandidate : graphSizing.aspectRatio
        };
        console.debug('Debug: box adjusted aspect ratio',{ // Debug: aspect ratio recalculation trace
          widthForRatio,
          adjustedHeight,
          ratioCandidate: graphSizing.aspectRatio
        });
      }
      console.debug('Debug: box resizer sizing config', { graphSizing }); // Debug: box sizing helper output
      Shared.attachResizableBox(container, {
        defaultWidth: graphSizing.width,
        defaultHeight: graphSizing.height,
        minWidth: graphSizing.minWidth,
        minHeight: graphSizing.minHeight,
        maxWidth: graphSizing.maxWidth,
        maxHeight: graphSizing.maxHeight,
        aspectLocked: graphSizing.aspectLocked !== false,
        aspectRatio: Number.isFinite(graphSizing.aspectRatio) ? graphSizing.aspectRatio : 1,
        onResize: phase => {
          console.debug('Debug: box svgbox resized', { phase }); // Debug: box svgbox resize callback
          syncPanels();
        }
      });
    }
    if(els.panelResizer && els.tablePanel && els.graphPanel){
      els.panelResizer.addEventListener('pointerdown',e=>{
        e.preventDefault();
        const startX=e.clientX;
        const startTable=els.tablePanel.getBoundingClientRect().width;
        const startGraph=els.graphPanel.getBoundingClientRect().width;
        const configWidth=els.configPanel.getBoundingClientRect().width;
        const gap=parseFloat(getComputedStyle(els.graphPanel.querySelector('.diagram-area')).gap||0);
        minSvgWidth=(els.svgBox?.getBoundingClientRect().width||0)*0.5;
        const minGraph=configWidth+gap+minSvgWidth;
        const total=startTable+startGraph;
        console.debug('Debug: box resizer start',{startTable,startGraph,configWidth,gap,minSvgWidth,minGraph,total});
        function onMove(ev){ const dx=ev.clientX-startX; let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx)); let newGraph=total-newTable; els.tablePanel.style.flex=`0 0 ${newTable}px`; els.graphPanel.style.flex=`0 0 ${newGraph}px`; syncPanels(); console.debug('Debug: box resizer move',{dx,newTable,newGraph}); }
        function onUp(){ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); console.debug('Debug: box resizer end'); }
        document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
      });
    }
  }

  // PART: INIT_HOT
  function initHot(){
    console.debug('Debug: box initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('box initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
    state.hot = Shared.hot.createStandardTable(els.hotContainer, { rows: DEFAULT_ROWS, cols: DEFAULT_COLS }, state.scheduleDraw, {
      debugLabel: 'box',
      data,
      hotOptions: {
        manualColumnMove: true,
        afterChange(changes, source){
          if(!changes || source === 'loadData') return;
          console.log('boxplot afterChange', { count: changes.length, source });
        },
        afterCreateCol(){
          state.selectedCols.clear();
          console.debug('Debug: box afterCreateCol cleared selection');
        },
        afterRemoveCol(){
          state.selectedCols.clear();
          console.debug('Debug: box afterRemoveCol cleared selection');
        },
        afterUndo(){
          console.log('boxplot undo');
        },
        afterRedo(){
          console.log('boxplot redo');
        },
        afterColumnMove(_moved, _finalIndex, _dropIndex, _possible, orderChanged){
          if(orderChanged){
            console.log('boxplot afterColumnMove');
          }
        }
      }
    });
  
    const loadExampleBtn=global.$('#boxLoadExample'), importBtn=global.$('#boxImport'), fileInput=global.$('#boxFile');
    const exampleData=[['Control','Treatment A','Treatment B'],[12,15,14],[14,17,15],[11,14,13],[13,16,16],[15,18,18],[16,19,17],[14,16,15],[13,15,14],[12,14,13],[15,17,16]];
    if(global.DEBUG_BOX) console.log('boxplot example dataset', exampleData);
    loadExampleBtn.addEventListener('click',()=>{ state.selectedCols.clear(); state.hot.loadData(exampleData); console.log('boxplot example loaded'); state.scheduleDraw(); });
    importBtn.addEventListener('click',()=>{ fileInput.value=''; fileInput.click(); });
    const tableImport = Shared.tableImport;
    fileInput.addEventListener('change',()=>{
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('boxplot import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      tableImport.openFile(fileInput, {
        hot: state.hot,
        minCols: DEFAULT_COLS,
        minRows: DEFAULT_ROWS,
        scheduleDraw: state.scheduleDraw,
        debugLabel: 'box',
        onProcessed: info => console.log('boxplot data imported', {rows: info?.rows, cols: info?.cols})
      });
    });

    if(tableImport && typeof tableImport.handlePaste === 'function'){
      els.hotContainer.addEventListener('paste',async e=>{
        console.time('boxplotPaste');
        try{
          await tableImport.handlePaste(e, state.hot, {
            minCols: DEFAULT_COLS,
            minRows: DEFAULT_ROWS,
            scheduleDraw: state.scheduleDraw,
            debugLabel: 'box',
            onBeforeProcess: meta => console.log('boxplot fast paste',{rows: meta.rowCount, cols: meta.colCount, startRow: meta.startRow, startCol: meta.startCol}),
            onProcessed: info => console.log('boxplot data imported', {rows: info?.rows, cols: info?.cols})
          });
        }finally{
          console.timeEnd('boxplotPaste');
        }
      },true);
    }
  }

  // PART: UI
  function toggleColorMode(){
    const mode=els.boxColorUnified.checked?'unified':'individual';
    els.boxUnifiedColors.style.display=mode==='unified'?'':'none';
    if(mode==='unified'){ els.boxColorPerBox.innerHTML=''; }
    console.log('box color mode toggled',mode);
    state.scheduleDraw();
  }
  function updateBoxColorPickers(labels){
    if(els.boxColorUnified.checked){ els.boxColorPerBox.innerHTML=''; return; }
    els.boxColorPerBox.innerHTML='';
    labels.forEach((lab,i)=>{
      if(!state.fillColors[i]) state.fillColors[i]=DEFAULT_BOX_COLORS[i%DEFAULT_BOX_COLORS.length];
      if(!state.borderColors[i]) state.borderColors[i]=shadeColor(state.fillColors[i],-30);
      const fillInput=document.createElement('input'); fillInput.type='color'; fillInput.value=state.fillColors[i]; if(global.attachColorPickerNear) global.attachColorPickerNear(fillInput); fillInput.addEventListener('input',e=>{ state.fillColors[i]=e.target.value; console.log('box fill color changed',{index:i,color:state.fillColors[i]}); state.scheduleDraw(); });
      const borderInput=document.createElement('input'); borderInput.type='color'; borderInput.value=state.borderColors[i]; if(global.attachColorPickerNear) global.attachColorPickerNear(borderInput); borderInput.addEventListener('input',e=>{ state.borderColors[i]=e.target.value; console.log('box border color changed',{index:i,color:state.borderColors[i]}); state.scheduleDraw(); });
      const lbl=document.createElement('label'); lbl.textContent=lab+' '; lbl.appendChild(fillInput); lbl.appendChild(borderInput); els.boxColorPerBox.appendChild(lbl);
    });
    state.fillColors.length=labels.length; state.borderColors.length=labels.length; console.log('updateBoxColorPickers',{fillColors:state.fillColors,borderColors:state.borderColors});
  }
  function initUI(){
    els.boxColorUnified.addEventListener('change',toggleColorMode);
    els.boxColorIndividual.addEventListener('change',toggleColorMode);
    toggleColorMode();
    els.boxFontSize.addEventListener('input',()=>{ chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: Number(els.boxFontSize.value) }); state.scheduleDraw(); });
    els.boxShowGrid.addEventListener('change',()=>{ console.log('boxShowGrid changed', els.boxShowGrid.checked); state.scheduleDraw(); });
    els.boxShowFrame?.addEventListener('change',()=>{ console.debug('Debug: box showFrame change',{checked:els.boxShowFrame.checked}); state.scheduleDraw(); });
    els.boxLogScale.addEventListener('change',()=>{ console.log('boxLogScale changed', els.boxLogScale.checked); state.scheduleDraw(); });
    els.boxGraphType.addEventListener('change',()=>{ console.log('boxGraphType changed', els.boxGraphType.value); els.boxErrorModeCtl.style.display=els.boxGraphType.value==='bar'?'':'none'; state.scheduleDraw(); });
    els.boxPointMode.addEventListener('change',()=>{ console.log('boxPointMode changed', els.boxPointMode.value); state.scheduleDraw(); });
    els.boxShowCaps.addEventListener('change',()=>{ console.log('boxShowCaps changed', els.boxShowCaps.checked); state.scheduleDraw(); });
    els.boxErrorMode.addEventListener('change',()=>{ console.log('boxErrorMode changed', els.boxErrorMode.value); state.scheduleDraw(); });
    els.boxYMin.addEventListener('input',()=>{ console.log('boxYMin changed', els.boxYMin.value); state.scheduleDraw(); });
    els.boxYMax.addEventListener('input',()=>{ console.log('boxYMax changed', els.boxYMax.value); state.scheduleDraw(); });
    if(els.boxFlipAxes){
      state.flipAxes = !!els.boxFlipAxes.checked;
      els.boxFlipAxes.addEventListener('change',()=>{
        state.flipAxes = !!els.boxFlipAxes.checked;
        console.debug('Debug: box flipAxes toggled',{ flipAxes: state.flipAxes }); // Debug: flip axis change trace
        state.scheduleDraw();
      });
    }
    els.boxErrorModeCtl.style.display=els.boxGraphType.value==='bar'?'':'none';
    els.boxFill.addEventListener('input',()=>{ console.log('boxFill changed',{newColor:els.boxFill.value,oldColor:state.lastDefaultFill}); state.fillColors=state.fillColors.map(c=>c===state.lastDefaultFill?els.boxFill.value:c); state.lastDefaultFill=els.boxFill.value; state.scheduleDraw(); });
    els.boxBorder.addEventListener('input',()=>{ console.log('boxBorder changed', els.boxBorder.value); state.scheduleDraw(); });
    els.boxBorderWidth.addEventListener('input',()=>{ console.log('boxBorderWidth changed', els.boxBorderWidth.value); state.scheduleDraw(); });
    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#boxExportControls',
        svgSelector: '#boxSvg',
        fileName: 'boxplot',
        contextLabel: 'box-export'
      });
      console.debug('Debug: box export controls mounted', { hasExporter: true }); // Debug: box export mount
    } else {
      console.debug('Debug: box export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: box export fallback
    }
    global.$('#openBox').addEventListener('click', box.open);
    global.$('#saveBox').addEventListener('click', box.save);
    global.$('#saveAsBox').addEventListener('click', box.saveAs);
    global.$('#boxGraphFile').addEventListener('change', e=>{ const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; box.loadFromFile(f); } });
  }

  // PART: STATS
  function p2stars(p){ return p<0.0001?'****':p<0.001?'***':p<0.01?'**':p<0.05?'*':'ns'; }
  function formatP(p){ return p.toLocaleString('en-US',{maximumSignificantDigits:6}); }
  const mean=arr=>arr.reduce((s,v)=>s+v,0)/arr.length;
  function tTest(a,b){ const na=a.length, nb=b.length; const ma=mean(a), mb=mean(b); const va=a.reduce((s,v)=>s+Math.pow(v-ma,2),0)/(na-1||1); const vb=b.reduce((s,v)=>s+Math.pow(v-mb,2),0)/(nb-1||1); const se=Math.sqrt(va/na+vb/nb); const t=(ma-mb)/se; const df=Math.pow(va/na+vb/nb,2)/(Math.pow(va/na,2)/(na-1||1)+Math.pow(vb/nb,2)/(nb-1||1)); const p=2*(1-global.jStat.studentt.cdf(Math.abs(t),df)); return {t,df,p}; }
  function tTestPaired(a,b){ const diffs=a.map((v,i)=>v-b[i]).filter(v=>!isNaN(v)); const n=diffs.length; const md=mean(diffs); const sd=Math.sqrt(diffs.reduce((s,v)=>s+Math.pow(v-md,2),0)/(n-1||1)); const t=md/(sd/Math.sqrt(n)); const p=2*(1-global.jStat.studentt.cdf(Math.abs(t),n-1)); return {t,df:n-1,p}; }
  function rankArray(arr){ const sorted=arr.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v); const ranks=new Array(arr.length); let i=0; while(i<sorted.length){ let j=i; while(j<sorted.length && sorted[j].v===sorted[i].v) j++; const avg=(i+j-1)/2+1; for(let k=i;k<j;k++) ranks[sorted[k].i]=avg; i=j; } return ranks; }
  function mannWhitney(a,b){ const all=[...a.map(v=>({v,g:0})),...b.map(v=>({v,g:1}))]; all.sort((x,y)=>x.v-y.v); let rank=1; for(let i=0;i<all.length;i++){ let j=i; while(j<all.length && all[j].v===all[i].v) j++; const avg=(rank+(j-1))/2; for(let k=i;k<j;k++) all[k].rank=avg; rank=j+1; } const Ra=all.filter(o=>o.g===0).reduce((s,o)=>s+o.rank,0); const Rb=all.filter(o=>o.g===1).reduce((s,o)=>s+o.rank,0); const na=a.length, nb=b.length; const Ua=Ra-na*(na+1)/2; const Ub=Rb-nb*(nb+1)/2; const U=Math.min(Ua,Ub); const mu=na*nb/2; const sigma=Math.sqrt(na*nb*(na+nb+1)/12); const z=(U-mu)/sigma; const p=2*(1-global.jStat.normal.cdf(Math.abs(z),0,1)); return {U,z,p}; }
  function wilcoxonSignedRank(a,b){ const diffs=a.map((v,i)=>v-b[i]).filter(v=>v!==0); const abs=diffs.map(Math.abs); const ranks=rankArray(abs); let Wpos=0,Wneg=0; ranks.forEach((rk,i)=>{ if(diffs[i]>0) Wpos+=rk; else Wneg+=rk; }); const W=Math.min(Wpos,Wneg); const nEff=ranks.length; const mu=nEff*(nEff+1)/4; const sigma=Math.sqrt(nEff*(nEff+1)*(2*nEff+1)/24); const z=(W-mu)/sigma; const p=2*(1-global.jStat.normal.cdf(Math.abs(z),0,1)); return {W,z,p}; }
  function anova(groups){ const k=groups.length; const n=groups.reduce((s,g)=>s+g.length,0); const grand=groups.reduce((s,g)=>s+mean(g)*g.length,0)/n; let ssBetween=0, ssWithin=0; groups.forEach(g=>{ const m=mean(g); ssBetween+=g.length*Math.pow(m-grand,2); ssWithin+=g.reduce((s,v)=>s+Math.pow(v-m,2),0); }); const dfBetween=k-1; const dfWithin=n-k; const msBetween=ssBetween/dfBetween; const msWithin=ssWithin/dfWithin; const F=msBetween/msWithin; const p=1-global.jStat.centralF.cdf(F,dfBetween,dfWithin); return {F,p}; }
  function kruskalWallis(groups){ const n=groups.reduce((s,g)=>s+g.length,0); const all=groups.flat(); const ranks=rankArray(all); let idx=0; const R=groups.map(g=>{ const r=ranks.slice(idx, idx+g.length).reduce((a,b)=>a+b,0); idx+=g.length; return r; }); const H=(12/(n*(n+1)))*R.reduce((sum,ri,i)=>sum+Math.pow(ri,2)/groups[i].length,0)-3*(n+1); const df=groups.length-1; const p=1-global.jStat.chisquare.cdf(H,df); return {H,p}; }
  function parsePairString(str,traces){ return str.split(/[\n,]+/).map(p=>p.trim()).filter(p=>p).map(p=>{ const [a,b]=p.split('-').map(s=>s.trim()); const ai=isNaN(parseInt(a))?traces.findIndex(t=>t.name===a):parseInt(a)-1; const bi=isNaN(parseInt(b))?traces.findIndex(t=>t.name===b):parseInt(b)-1; return (ai>=0&&bi>=0)?{ai,bi}:null; }).filter(Boolean); }
function renderStatsControls(traces){
  const controls=document.getElementById('statsControls');
  controls.innerHTML='';

  if(state.selectedCols.size<2 && traces.length>=2){
    state.selectedCols.clear();
    state.selectedCols.add(0);
    state.selectedCols.add(1);
  }
  if(state.statsMode==='reference' && !state.selectedCols.has(state.statsRef)){
    state.selectedCols.add(state.statsRef);
  }

  const optionWrap=document.createElement('div');

  const testLabel=document.createElement('label');
  testLabel.textContent='Test:';
  const testSel=document.createElement('select');
  ['parametric','nonparametric'].forEach(v=>{
    const option=document.createElement('option');
    option.value=v;
    option.textContent=v==='parametric'?'Parametric':'Non-parametric';
    if(state.statsTest===v) option.selected=true;
    testSel.appendChild(option);
  });
  testSel.addEventListener('change',()=>{
    state.statsTest=testSel.value;
    console.log('boxplot statsTest changed', state.statsTest);
    state.scheduleDraw();
  });
  optionWrap.appendChild(testLabel);
  optionWrap.appendChild(testSel);

  const pairedLabel=document.createElement('label');
  pairedLabel.textContent='Pairing:';
  const pairedSel=document.createElement('select');
  [['unpaired','Unpaired'],['paired','Paired']].forEach(([value,text])=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=text;
    if((state.statsPaired && value==='paired')||(!state.statsPaired && value==='unpaired')) option.selected=true;
    pairedSel.appendChild(option);
  });
  pairedSel.addEventListener('change',()=>{
    state.statsPaired=pairedSel.value==='paired';
    console.log('boxplot statsPaired changed', state.statsPaired);
    state.scheduleDraw();
  });
  optionWrap.appendChild(pairedLabel);
  optionWrap.appendChild(pairedSel);

  const modeLabel=document.createElement('label');
  modeLabel.textContent='Comparison:';
  const modeSel=document.createElement('select');
  [['all','All pairwise'],['reference','Versus reference'],['custom','Custom pairs']].forEach(([value,text])=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=text;
    if(state.statsMode===value) option.selected=true;
    modeSel.appendChild(option);
  });
  modeSel.addEventListener('change',()=>{
    state.statsMode=modeSel.value;
    console.log('boxplot statsMode changed', state.statsMode);
    renderStatsControls(traces);
    state.scheduleDraw();
  });
  optionWrap.appendChild(modeLabel);
  optionWrap.appendChild(modeSel);

  if(state.statsMode==='reference'){
    const refLabel=document.createElement('label');
    refLabel.textContent='Reference:';
    const refSel=document.createElement('select');
    traces.forEach((trace,index)=>{
      const option=document.createElement('option');
      option.value=index;
      option.textContent=trace.name;
      if(index===state.statsRef) option.selected=true;
      refSel.appendChild(option);
    });
    refSel.addEventListener('change',()=>{
      state.statsRef=+refSel.value;
      console.log('boxplot statsRef changed', state.statsRef);
      renderStatsControls(traces);
      state.scheduleDraw();
    });
    optionWrap.appendChild(refLabel);
    optionWrap.appendChild(refSel);
  }else if(state.statsMode==='custom'){
    const pairLabel=document.createElement('label');
    pairLabel.textContent='Pairs:';
    const pairInput=document.createElement('input');
    pairInput.type='text';
    pairInput.value=state.statsPairsText;
    pairInput.placeholder='1-3,2-4';
    pairInput.addEventListener('change',()=>{
      state.statsPairsText=pairInput.value;
      state.statsCustomPairs=parsePairString(state.statsPairsText,traces);
      console.log('boxplot custom pairs changed', state.statsPairsText);
      state.scheduleDraw();
    });
    optionWrap.appendChild(pairLabel);
    optionWrap.appendChild(pairInput);
    state.statsCustomPairs=parsePairString(state.statsPairsText,traces);
  }

  controls.appendChild(optionWrap);

  traces.forEach((trace,index)=>{
    const id=`statCol${index}`;
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';
    checkbox.id=id;
    checkbox.dataset.index=index;
    checkbox.checked=state.selectedCols.has(index);
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked) state.selectedCols.add(index);
      else state.selectedCols.delete(index);
      console.log('boxplot column toggle',{index,checked:checkbox.checked});
      state.scheduleDraw();
    });
    const label=document.createElement('label');
    label.setAttribute('for',id);
    label.textContent=trace.name;
    controls.appendChild(checkbox);
    controls.appendChild(label);
  });
}
  function annotatePair(svg,x1,x2,valueCoord,p,styleOptions){
    const opts=styleOptions||{};
    const orientation=opts.orientation==='horizontal'?'horizontal':'vertical';
    const strokeWidth=typeof opts.strokeWidth==='number'
      ? opts.strokeWidth
      : chartStyle.scaleStrokeWidth(1, opts.styleScaleInfo, { context: 'box-annotation', min: 0.5 });
    const bracketSize=Number.isFinite(opts.bracketSize)?opts.bracketSize:10;
    const path=document.createElementNS(NS,'path');
    if(orientation==='horizontal'){
      const outerX=valueCoord;
      const innerX=outerX+bracketSize;
      path.setAttribute('d',`M${outerX},${x1} L${innerX},${x1} L${innerX},${x2} L${outerX},${x2}`);
    }else{
      const outerY=valueCoord;
      const innerY=valueCoord-bracketSize;
      path.setAttribute('d',`M${x1},${outerY} L${x1},${innerY} L${x2},${innerY} L${x2},${outerY}`);
    }
    path.setAttribute('stroke','#000');
    if(Number.isFinite(strokeWidth)){
      path.setAttribute('stroke-width',strokeWidth);
    }
    path.setAttribute('fill','none');
    svg.appendChild(path);
    const txt=document.createElementNS(NS,'text');
    if(orientation==='horizontal'){
      txt.setAttribute('x',valueCoord+bracketSize*1.4);
      txt.setAttribute('y',(x1+x2)/2);
      txt.setAttribute('text-anchor','start');
      txt.setAttribute('dominant-baseline','middle');
    }else{
      const textYOffset=Number.isFinite(opts.fontSize)?opts.fontSize*0.2:12;
      txt.setAttribute('x',(x1+x2)/2);
      txt.setAttribute('y',valueCoord-bracketSize-textYOffset);
      txt.setAttribute('text-anchor','middle');
    }
    if(Number.isFinite(opts.fontSize)){
      txt.setAttribute('font-size',opts.fontSize);
    }
    txt.textContent=p2stars(p);
    svg.appendChild(txt);
    console.debug('Debug: box annotatePair scaling',{strokeWidth,fontSize:opts.fontSize,orientation});
  }
  function annotateOverall(svg,xCenters,valueToCoord,maxVal,p,level=0,styleOptions){
    const opts=styleOptions||{};
    const orientation=opts.orientation==='horizontal'?'horizontal':'vertical';
    const baseOffset=Number.isFinite(opts.baseOffset)?opts.baseOffset:ANN_BASE_OFFSET;
    const levelGap=Number.isFinite(opts.levelGap)?opts.levelGap:ANN_LEVEL_GAP;
    const fontSize=opts.fontSize;
    const bracketSize=Number.isFinite(opts.bracketSize)?opts.bracketSize:10;
    const coordFn=typeof valueToCoord==='function'?valueToCoord:v=>v;
    const baseCoord=coordFn(maxVal);
    if(!Number.isFinite(baseCoord)) return;
    const txt=document.createElementNS(NS,'text');
    if(orientation==='horizontal'){
      const x=baseCoord+baseOffset+level*levelGap+bracketSize*0.6;
      const y=(Math.min(...xCenters)+Math.max(...xCenters))/2;
      txt.setAttribute('x',x);
      txt.setAttribute('y',y);
      txt.setAttribute('text-anchor','start');
      txt.setAttribute('dominant-baseline','middle');
    }else{
      const y=baseCoord-baseOffset-level*levelGap;
      txt.setAttribute('x',(Math.min(...xCenters)+Math.max(...xCenters))/2);
      txt.setAttribute('y',y-12);
      txt.setAttribute('text-anchor','middle');
    }
    if(Number.isFinite(fontSize)){
      txt.setAttribute('font-size',fontSize);
    }
    txt.textContent=p2stars(p);
    svg.appendChild(txt);
    console.debug('Debug: box annotateOverall scaling',{baseOffset,levelGap,fontSize,orientation});
  }
  function renderStatsTable(traces){ const tableDiv=document.getElementById('statsTable'); if(!tableDiv) return; const rows=traces.map(t=>{ const arr=t.rawY; const n=arr.length; const mean=arr.reduce((s,v)=>s+v,0)/n; const med=arr.slice().sort((a,b)=>a-b)[Math.floor(n/2)] ?? NaN; const sd=global.jStat.stdev(arr,true); const min=Math.min(...arr); const q1=global.jStat.percentile(arr,0.25); const q3=global.jStat.percentile(arr,0.75); const max=Math.max(...arr); return {name:t.name,n,mean,med,sd,min,q1,q3,max}; }); let html='<table style="border-collapse:collapse">'; html+='<thead><tr>'+['Column','N','Mean','Median','SD','Min','Q1','Q3','Max'].map(h=>`<th style="border:1px solid #ccc;padding:4px">${h}</th>`).join('')+'</tr></thead>'; html+='<tbody>'+rows.map(r=>`<tr><td style=\"border:1px solid #ccc;padding:4px\">${r.name}</td><td style=\"border:1px solid #ccc;padding:4px\">${r.n}</td><td style=\"border:1px solid #ccc;padding:4px\">${r.mean.toFixed(2)}</td><td style=\"border:1px solid #ccc;padding:4px\">${r.med.toFixed(2)}</td><td style=\"border:1px solid #ccc;padding:4px\">${r.sd.toFixed(2)}</td><td style=\"border:1px solid #ccc;padding:4px\">${r.min}</td><td style=\"border:1px solid #ccc;padding:4px\">${r.q1.toFixed(2)}</td><td style=\"border:1px solid #ccc;padding:4px\">${r.q3.toFixed(2)}</td><td style=\"border:1px solid #ccc;padding:4px\">${r.max}</td></tr>`).join('')+'</tbody></table>'; tableDiv.innerHTML=html; }

  // Compute and render statistics and p-value annotations
  function computeStats(traces,svg,helpers){
    const statsDiv=document.getElementById('statsResults');
    if(!statsDiv){ console.warn('Debug: statsResults element not found'); return; }
    statsDiv.innerHTML='';
    const annotationOpts=helpers?.annotationStyle||{};
    const orientation=annotationOpts.orientation==='horizontal'?'horizontal':'vertical';
    const categoryCenter=typeof helpers?.categoryCenter==='function'
      ? helpers.categoryCenter
      : (typeof helpers?.xCenter==='function'?helpers.xCenter:(idx=>idx));
    const valueToCoord=typeof helpers?.valueToCoord==='function'
      ? helpers.valueToCoord
      : (typeof helpers?.y2px==='function'?helpers.y2px:(val=>val));
    const baseOffset=Number.isFinite(annotationOpts.baseOffset)?annotationOpts.baseOffset:ANN_BASE_OFFSET;
    const levelGap=Number.isFinite(annotationOpts.levelGap)?annotationOpts.levelGap:ANN_LEVEL_GAP;
    console.debug('Debug: box annotation offsets',{baseOffset,levelGap,orientation});
    // Custom pairs mode
    if(state.statsMode==='custom'){
      if(!state.statsCustomPairs.length){ statsDiv.textContent='Specify pairs for comparison.'; return; }
      const pairTest=state.statsTest==='parametric'?(state.statsPaired?tTestPaired:tTest):(state.statsPaired?wilcoxonSignedRank:mannWhitney);
      const pairs=[];
      state.statsCustomPairs.forEach(pr=>{
        const aData=traces[pr.ai].rawY; const bData=traces[pr.bi].rawY;
        if(state.statsPaired && aData.length!==bData.length) return;
        const r=pairTest(aData,bData);
        const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
        const statVal=r[statName];
        let rangeMax=-Infinity; for(let k=Math.min(pr.ai,pr.bi);k<=Math.max(pr.ai,pr.bi);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
        pairs.push({...pr,p:r.p,rangeMax,labelA:traces[pr.ai].name,labelB:traces[pr.bi].name,stat:statVal,statName,df:r.df});
      });
      const m=pairs.length; pairs.forEach(pr=>pr.adjP=Math.min(pr.p*m,1));
      let html='<table><tr><th>Comparison</th><th>Statistic</th><th>df</th><th>P (adj)</th></tr>';
      pairs.forEach(pr=>{html+=`<tr><td>${pr.labelA} vs ${pr.labelB}</td><td>${pr.statName}=${pr.stat.toFixed(4)}</td><td>${pr.df??''}</td><td>${formatP(pr.adjP)}</td></tr>`;});
      html+='</table>';
      statsDiv.innerHTML=html;
      if(pairs.length){
        pairs.sort((a,b)=>(a.bi-a.ai)-(b.bi-b.ai));
        const placed=[];
        pairs.forEach(pr=>{
          let level=0; while(placed.some(pl=>!(pl.bi<pr.ai||pl.ai>pr.bi)&&pl.level===level)) level++;
          const baseCoord=valueToCoord(pr.rangeMax);
          const annotationCoord=orientation==='horizontal'
            ? baseCoord+baseOffset+level*levelGap
            : baseCoord-baseOffset-level*levelGap;
          annotatePair(svg,categoryCenter(pr.ai),categoryCenter(pr.bi),annotationCoord,pr.p,helpers.annotationStyle);
          pr.level=level; placed.push(pr);
        });
      }
      return;
    }
    // Prepare groups/labels from selected columns
    const indices=[...state.selectedCols];
    if(indices.length<2){ statsDiv.textContent='Select at least two columns for statistical analysis.'; return; }
    const groups=indices.map(i=>traces[i].rawY);
    const labels=indices.map(i=>traces[i].name);
    const param=state.statsTest==='parametric';
    const pairTest=param?(state.statsPaired?tTestPaired:tTest):(state.statsPaired?wilcoxonSignedRank:mannWhitney);
    const overallTest=param?anova:kruskalWallis;
    if(state.statsPaired && groups.some(g=>g.length!==groups[0].length)){
      statsDiv.textContent='Paired tests require equal group sizes.'; return;
    }
    // Two-group case
    if(indices.length===2){
      const res=pairTest(groups[0],groups[1]);
      const statName=res.t!==undefined?'t':res.U!==undefined?'U':res.W!==undefined?'W':'stat';
      const rows=[ ['Comparison', `${labels[0]} vs ${labels[1]}`], ['Test', param?(state.statsPaired?'Paired t-test':'t-test'):(state.statsPaired?'Wilcoxon signed-rank':'Mann-Whitney U')], [statName, res[statName].toFixed(4)] ]; if(res.df!==undefined) rows.push(['df', res.df.toFixed(4)]); rows.push(['P value', formatP(res.p)]);
      statsDiv.innerHTML='<table>'+rows.map(r=>`<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')+'</table>';
      const from=Math.min(indices[0],indices[1]); const to=Math.max(indices[0],indices[1]); let rangeMax=-Infinity; for(let k=from;k<=to;k++) rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); const baseCoord=valueToCoord(rangeMax); const annotationCoord=orientation==='horizontal'?baseCoord+baseOffset:baseCoord-baseOffset; annotatePair(svg,categoryCenter(indices[0]),categoryCenter(indices[1]),annotationCoord,res.p,helpers.annotationStyle); return;
    }
    // Multi-group
    let overall=null; if(!state.statsPaired){ overall=overallTest(groups); }
    const maxVal=Math.max(...indices.map(i=>Math.max(...traces[i].y)));
    const xs=indices.map(i=>categoryCenter(i));
    let pairs=[];
    if(state.statsMode==='all'){
      for(let i=0;i<indices.length;i++){
        for(let j=i+1;j<indices.length;j++){
          const aIdx=indices[i],bIdx=indices[j];
          const r=pairTest(traces[aIdx].rawY,traces[bIdx].rawY);
          const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
          const statVal=r[statName];
          let rangeMax=-Infinity; for(let k=Math.min(aIdx,bIdx);k<=Math.max(aIdx,bIdx);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
          pairs.push({a:i,b:j,ai:aIdx,bi:bIdx,p:r.p,rangeMax,stat:statVal,statName,df:r.df});
        }
      }
      const m=pairs.length; pairs.forEach(pr=>pr.adjP=Math.min(pr.p*m,1));
    } else if(state.statsMode==='reference'){
      const refIdx=indices.indexOf(state.statsRef); if(refIdx===-1){ statsDiv.innerHTML+='<div>Select reference column among the chosen groups.</div>'; return; }
      const refData=groups[refIdx];
      indices.forEach((idx,i)=>{
        if(i===refIdx) return;
        const r=pairTest(refData,traces[idx].rawY);
        const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
        const statVal=r[statName];
        let rangeMax=-Infinity; for(let k=Math.min(state.statsRef,idx);k<=Math.max(state.statsRef,idx);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
        pairs.push({a:refIdx,b:i,ai:state.statsRef,bi:idx,p:r.p,rangeMax,label:labels[i],stat:statVal,statName,df:r.df});
      });
      const m=pairs.length; pairs.forEach(pr=>pr.adjP=Math.min(pr.p*m,1));
    }
    if(pairs.length){
      let html='';
      if(!state.statsPaired){ const overallStatName=param?'F':'H'; html+=`<table><tr><th>Overall test</th><td>${param?'ANOVA':'Kruskal-Wallis'}</td></tr><tr><th>${overallStatName}</th><td>${overall[overallStatName].toFixed(4)}</td></tr>`; if(param) html+=`<tr><th>df</th><td>${groups.length-1},${groups.reduce((s,g)=>s+g.length,0)-groups.length}</td></tr>`; else html+=`<tr><th>df</th><td>${groups.length-1}</td></tr>`; html+=`<tr><th>P value</th><td>${formatP(overall.p)}</td></tr></table>`; }
      html+='<table><tr><th>Comparison</th><th>Statistic</th><th>df</th><th>P (adj)</th></tr>';
      pairs.forEach(pr=>{html+=`<tr><td>${labels[pr.a]} vs ${labels[pr.b]}</td><td>${pr.statName}=${pr.stat.toFixed(4)}</td><td>${pr.df??''}</td><td>${formatP(pr.adjP)}</td></tr>`;});
      html+='</table>';
      statsDiv.innerHTML=html;
      pairs.sort((a,b)=>(a.bi-a.ai)-(b.bi-b.ai));
      const placed=[];
      pairs.forEach(pr=>{
        let level=0; while(placed.some(pl=>!(pl.bi<pr.ai||pl.ai>pr.bi)&&pl.level===level)) level++;
        const baseCoord=valueToCoord(pr.rangeMax);
        const annotationCoord=orientation==='horizontal'
          ? baseCoord+baseOffset+level*levelGap
          : baseCoord-baseOffset-level*levelGap;
        annotatePair(svg,categoryCenter(pr.ai),categoryCenter(pr.bi),annotationCoord,pr.p,helpers.annotationStyle);
        pr.level=level; placed.push(pr);
      });
      const maxLevel=Math.max(...pairs.map(pr=>pr.level));
      void maxLevel;
    } else {
      // No pairwise; show overall only if available
      if(!state.statsPaired && indices.length>2 && overall){ annotateOverall(svg,xs,valueToCoord,maxVal,overall.p,0,helpers.annotationStyle); }
    }
  }

  // PART: DRAW

  function draw(){
    const token = ++state.drawToken;
    console.log('boxplot draw start',{token});
    const colorMode = els.boxColorUnified.checked ? 'unified' : 'individual';
    const defaultFill = els.boxFill.value;
    const defaultBorder = els.boxBorder.value;
    const borderWidthRaw = Number(els.boxBorderWidth.value);
    const containerRect = els.svgBox?.getBoundingClientRect?.();
    const fontInfo = chartStyle.resolveScaledFontSize({
      rawSize: els.boxFontSize.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: els.svgBox
    });
    const fs = fontInfo.scaledPx;
    const styleScaleInfo = fontInfo.scaleInfo;
    const axisStrokeWidth = chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'box-axis', min: 0.5 });
    const gridStrokeWidth = chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'box-grid', min: 0.25 });
    const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'box-border', min: 0 });
    const pointRadius = chartStyle.scaleRadius(3, styleScaleInfo, { context: 'box-point', min: 0.75 });
    const annotationStrokeWidth = chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'box-annotation', min: 0.5 });
    const annotationBaseOffset = chartStyle.scaleLength(ANN_BASE_OFFSET, styleScaleInfo, { context: 'box-annotation-offset', min: 10 });
    const annotationLevelGap = chartStyle.scaleLength(ANN_LEVEL_GAP, styleScaleInfo, { context: 'box-annotation-gap', min: 8 });
    const annotationBracketSize = chartStyle.scaleLength(12, styleScaleInfo, { context: 'box-annotation-bracket', min: 8 });
    chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, fontInfo });
    console.debug('Debug: box font scaling applied',{
      input: els.boxFontSize.value,
      fontSizePt: fontInfo.pt,
      baseFontPx: fontInfo.px,
      scaledFontPx: fs,
      scale: fontInfo.scaleInfo?.scale,
      containerWidth: containerRect?.width,
      containerHeight: containerRect?.height
    });
    console.debug('Debug: box style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      axisStrokeWidth,
      gridStrokeWidth,
      pointRadius,
      annotationStrokeWidth,
      annotationBaseOffset,
      annotationLevelGap,
      annotationBracketSize,
      styleScale: styleScaleInfo?.styleScale
    });
    const axisMetrics = chartStyle.createAxisMetrics(fs);
    console.debug('Debug: box axis metrics', axisMetrics);
    const showGrid = els.boxShowGrid.checked;
    const showFrame = !!els.boxShowFrame?.checked;
    console.debug('Debug: box showFrame state',{ showFrame });
    const logScale = els.boxLogScale.checked;
    const graphTypeRaw = els.boxGraphType.value;
    const pointMode = els.boxPointMode.value;
    const showCaps = els.boxShowCaps.checked;
    const errorMode = els.boxErrorMode.value;
    const isFlipped = !!els.boxFlipAxes?.checked;
    state.flipAxes = isFlipped;
    if(els.boxLogScaleLabel){
      els.boxLogScaleLabel.textContent = isFlipped ? 'Log Scale (Values)' : 'Log Scale (Y)';
    }
    console.debug('Debug: box draw orientation',{ isFlipped });
    const traces = [];
    const labelsUsed = [];
    const nCols = state.hot.countCols();
    if(state.colOrder.length !== nCols){
      state.colOrder = Array.from({ length: nCols }, (_, i) => i);
    }
    for(let orderIdx = 0; orderIdx < state.colOrder.length; orderIdx++){
      const i = state.colOrder[orderIdx];
      const headerCell = state.hot.getDataAtCell(0, i);
      const label = (headerCell && String(headerCell).trim()) || `Col ${i + 1}`;
      const colData = state.hot.getDataAtCol(i);
      const col = [];
      console.time(`boxColCollect_${i}_${token}`);
      for(let r = 1; r < colData.length; r++){
        const v = parseFloat(colData[r]);
        if(!isNaN(v)) col.push(v);
        if(r % 10000 === 0){
          console.log('boxplot collect progress',{ col: i, row: r, token });
        }
      }
      console.timeEnd(`boxColCollect_${i}_${token}`);
      console.log('boxplot collected column',{ index: i, values: col.length });
      if(token !== state.drawToken){
        console.log('boxplot draw cancelled after collect',{ token });
        return;
      }
      if(col.length){
        labelsUsed.push(label);
        traces.push({ name: label, rawY: col });
      }
    }
    if(token !== state.drawToken){
      console.log('boxplot draw cancelled before traces ready',{ token });
      return;
    }
    if(!traces.length){
      els.boxColorPerBox.innerHTML='';
      global.document.getElementById('boxPlot').innerHTML='';
      global.document.getElementById('statsResults').innerHTML='';
      global.document.getElementById('statsTable').innerHTML='';
      return;
    }
    if(els.boxColorIndividual.checked){
      updateBoxColorPickers(labelsUsed);
    }else{
      els.boxColorPerBox.innerHTML='';
    }
    renderStatsControls(traces);
    if(logScale){
      const hasNonPos = traces.some(t => t.rawY.some(v => v <= 0));
      if(hasNonPos){
        global.document.getElementById('boxPlot').innerHTML='<i>Log scale requires positive values.</i>';
        global.document.getElementById('statsResults').innerHTML='';
        global.document.getElementById('statsTable').innerHTML='';
        return;
      }
      traces.forEach(t => { t.y = t.rawY.map(v => Math.log10(v)); });
    }else{
      traces.forEach(t => { t.y = [...t.rawY]; });
    }
    while (els.plotDiv.firstChild) els.plotDiv.removeChild(els.plotDiv.firstChild);
    const W = Math.max(50, Math.floor(els.plotDiv.clientWidth || 50));
    const H = Math.max(40, Math.floor(els.plotDiv.clientHeight || 40));
    els.plotDiv.style.position = 'relative';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'boxSvg');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
    chartStyle.applySvgDefaults(svg);
    els.plotDiv.appendChild(svg);
    let ymin = Infinity;
    let ymax = -Infinity;
    for(let ti = 0; ti < traces.length; ti++){
      const t = traces[ti];
      for(let j = 0; j < t.y.length; j++){
        const v = t.y[j];
        if(v < ymin) ymin = v;
        if(v > ymax) ymax = v;
        if(j % 10000 === 0){
          console.log('boxplot range progress',{ trace: ti, row: j, token });
        }
      }
    }
    if(token !== state.drawToken){
      console.log('boxplot draw cancelled after range calc',{ token });
      return;
    }
    console.log('boxplot ymin/ymax',{ ymin, ymax });
    let barErrorMin = Infinity;
    if(graphTypeRaw === 'bar'){
      traces.forEach(t => {
        const mean = t.y.reduce((a, b) => a + b, 0) / t.y.length;
        const sd = Math.sqrt(t.y.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (t.y.length - 1 || 1));
        barErrorMin = Math.min(barErrorMin, mean - sd);
      });
      if(isFinite(barErrorMin)) ymin = Math.min(ymin, barErrorMin);
    }
    const userYMin = parseFloat(els.boxYMin.value);
    const userYMax = parseFloat(els.boxYMax.value);
    if(isFinite(userYMin)) ymin = logScale ? Math.log10(userYMin) : userYMin;
    if(isFinite(userYMax)) ymax = logScale ? Math.log10(userYMax) : userYMax;
    console.log('boxplot axis override',{ userYMin, userYMax, ymin, ymax });
    console.log('boxplot range',{ ymin, ymax });
    if(graphTypeRaw === 'bar' && !logScale){
      const beforeYMin = ymin;
      const beforeYMax = ymax;
      ymin = Math.min(ymin, 0);
      ymax = Math.max(ymax, 0);
      console.debug('Debug: box bar axis zero clamp',{ beforeYMin, beforeYMax, ymin, ymax });
    }
    function niceNum(range, round){
      const exp = Math.floor(Math.log10(range));
      const f = range / Math.pow(10, exp);
      let nf;
      if(round){
        if(f < 1.5) nf = 1;
        else if(f < 3) nf = 2;
        else if(f < 7) nf = 5;
        else nf = 10;
      }else{
        if(f <= 1) nf = 1;
        else if(f <= 2) nf = 2;
        else if(f <= 5) nf = 5;
        else nf = 10;
      }
      return nf * Math.pow(10, exp);
    }
    function niceScale(min, max, maxTicks){
      const range = niceNum(max - min || 1, false);
      const step = niceNum(range / (Math.max(maxTicks - 1, 1)), true);
      const graphMin = Math.floor(min / step) * step;
      const graphMax = Math.ceil(max / step) * step;
      const ticks = [];
      for(let v = graphMin; v <= graphMax + 1e-9; v += step) ticks.push(v);
      return { min: graphMin, max: graphMax, ticks, step };
    }
    const labelTexts = labelsUsed.map((lab, i) => lab || `Col ${i + 1}`);
    function formatTick(v){
      return v.toLocaleString('en-US',{ maximumFractionDigits: 2, useGrouping: false });
    }
    function add(tag, attrs){
      const el = document.createElementNS(NS, tag);
      for(const [k, v] of Object.entries(attrs)){
        el.setAttribute(k, String(v));
      }
      svg.appendChild(el);
      return el;
    }
    function percentile(sorted, p){
      if(!sorted.length) return NaN;
      const pos = (sorted.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      return (sorted[base + 1] !== undefined) ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
    }
    const axisStroke = '#000';
    const annotationStyle = {
      styleScaleInfo,
      fontSize: fs,
      strokeWidth: annotationStrokeWidth,
      baseOffset: annotationBaseOffset,
      levelGap: annotationLevelGap,
      bracketSize: annotationBracketSize,
      orientation: isFlipped ? 'horizontal' : 'vertical'
    };
    const maxLevelEstimate = state.selectedCols.size > 1 ? state.selectedCols.size : 0;

    function renderVertical(){
      const tickFont = chartStyle.makeFont(fs);
      const axisLabelFont = chartStyle.makeFont(fs);
      const yTitleWidthBase = chartStyle.measureText(state.yLabelText, axisLabelFont);
      const tickLen = axisMetrics.tickLength;
      const tickGap = axisMetrics.tickLabelGap;
      const topExtra = maxLevelEstimate ? (annotationBaseOffset + maxLevelEstimate * annotationLevelGap) : 0;
      let marginLocal = chartStyle.computeBaseMargins({ fontSize: fs, maxYLabelWidth: 0, yTitleWidth: yTitleWidthBase, axisMetrics });
      marginLocal.top += topExtra;
      marginLocal.left = Math.max(marginLocal.left, fs * 0.5);
      let plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
      let plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
      let bottomLayout = chartStyle.computeBottomLayout({ labels: labelTexts, fontSize: fs, plotWidth: plotWLocal, baseBottom: marginLocal.bottom, axisMetrics });
      marginLocal.bottom = bottomLayout.bottom;
      plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
      plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
      let yTickTarget = chartStyle.estimateTickCount(plotHLocal, { axis: 'y', fallback: 6 });
      let yScale = niceScale(ymin, ymax, yTickTarget);
      let tickLabels = yScale.ticks.map(t => formatTick(logScale ? Math.pow(10, t) : t));
      let tickWidths = tickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
      let maxTickWidth = Math.max(...tickWidths, 0);
      let yLabelGap = maxTickWidth + tickLen + tickGap;
      for(let pass = 0; pass < 2; pass++){
        yScale = niceScale(ymin, ymax, yTickTarget);
        tickLabels = yScale.ticks.map(t => formatTick(logScale ? Math.pow(10, t) : t));
        tickWidths = tickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
        maxTickWidth = Math.max(...tickWidths, 0);
        yLabelGap = maxTickWidth + tickLen + tickGap;
        marginLocal = chartStyle.computeBaseMargins({ fontSize: fs, maxYLabelWidth: maxTickWidth, yTitleWidth: yTitleWidthBase, axisMetrics });
        marginLocal.top += topExtra;
        marginLocal.left = Math.max(marginLocal.left, yLabelGap + fs * 0.5);
        plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
        plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
        bottomLayout = chartStyle.computeBottomLayout({ labels: labelTexts, fontSize: fs, plotWidth: plotWLocal, baseBottom: marginLocal.bottom, axisMetrics });
        marginLocal.bottom = bottomLayout.bottom;
        plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
        plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
        const refinedTickTarget = chartStyle.estimateTickCount(plotHLocal, { axis: 'y', fallback: yTickTarget });
        console.debug('Debug: box tick target evaluation',{ pass, plotH: plotHLocal, yTickTarget, refinedTickTarget });
        if(refinedTickTarget === yTickTarget){
          break;
        }
        yTickTarget = refinedTickTarget;
      }
      console.debug('Debug: box layout',{ margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, rotate: bottomLayout.shouldRotate, yTickTarget });
      const bandW = plotWLocal / labelsUsed.length;
      const valueRange = yScale.max - yScale.min || 1;
      const y2px = v => marginLocal.top + plotHLocal * (1 - (v - yScale.min) / valueRange);
      const boxW = Math.max(6, Math.min(60, bandW * 0.6));
      const xCenter = i => marginLocal.left + (i + 0.5) * bandW;
      const yAxisX = marginLocal.left;
      const xAxisY = graphTypeRaw === 'bar' ? y2px(0) : marginLocal.top + plotHLocal;
      if(showGrid){
        yScale.ticks.forEach(t => {
          const y = y2px(t);
          add('line',{ x1: yAxisX, y1: y, x2: yAxisX + plotWLocal, y2: y, stroke: '#ddd', 'stroke-width': gridStrokeWidth });
        });
        console.debug('Debug: box grid stroke scaled',{ horizontal: yScale.ticks.length, gridStrokeWidth });
      }
      const yTickPositions = yScale.ticks.map(t => y2px(t));
      let axisYStart = yTickPositions.length ? Math.min(...yTickPositions) : marginLocal.top;
      let axisYEnd = yTickPositions.length ? Math.max(...yTickPositions) : marginLocal.top + plotHLocal;
      if(axisYStart === axisYEnd){
        axisYStart = marginLocal.top;
        axisYEnd = marginLocal.top + plotHLocal;
      }
      axisYStart = Math.min(axisYStart, xAxisY);
      axisYEnd = Math.max(axisYEnd, xAxisY);
      console.debug('Debug: box axis join span',{ axisYStart, axisYEnd, xAxisY, yAxisX });
      add('line',{ x1: yAxisX, y1: axisYStart, x2: yAxisX, y2: axisYEnd, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      yScale.ticks.forEach(t => {
        const y = y2px(t);
        add('line',{ x1: yAxisX - tickLen, y1: y, x2: yAxisX, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const txt = add('text',{ x: yAxisX - (tickLen + tickGap), y, 'font-size': fs, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: chartStyle.TEXT_COLOR });
        txt.textContent = formatTick(logScale ? Math.pow(10, t) : t);
      });
      const xTickPositions = labelsUsed.map((_, i) => xCenter(i));
      let axisXStart = xTickPositions.length ? Math.min(...xTickPositions) : yAxisX;
      let axisXEnd = xTickPositions.length ? Math.max(...xTickPositions) : yAxisX + plotWLocal;
      if(xTickPositions.length === 1){
        const halfBand = Math.max(6, bandW * 0.5);
        axisXStart = xTickPositions[0] - halfBand;
        axisXEnd = xTickPositions[0] + halfBand;
      }
      if(axisXStart === axisXEnd){
        axisXStart = yAxisX;
        axisXEnd = yAxisX + plotWLocal;
      }
      axisXStart = Math.min(axisXStart, yAxisX);
      const frameXMax = yAxisX + plotWLocal;
      axisXEnd = Math.max(axisXEnd, frameXMax);
      console.debug('Debug: box x-axis span',{ axisXStart, axisXEnd, yAxisX, frameXMax });
      add('line',{ x1: yAxisX, y1: xAxisY, x2: axisXEnd, y2: xAxisY, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      console.debug('Debug: box axes stroke scaled',{ axisStrokeWidth });
      if(showFrame){
        console.debug('Debug: box frame request',{ stroke: axisStroke, showFrame });
        const doc = svg.ownerDocument || global.document;
        const frameGroup = doc?.createElementNS ? doc.createElementNS(NS, 'g') : null;
        if(frameGroup){
          frameGroup.setAttribute('stroke-width', axisStrokeWidth);
          frameGroup.setAttribute('fill', 'none');
          svg.appendChild(frameGroup);
          chartStyle.drawPlotFrame({ svg, group: frameGroup, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, sides: ['top', 'right'] });
          console.debug('Debug: box frame stroke scaled',{ axisStrokeWidth });
        }else{
          chartStyle.drawPlotFrame({ svg, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, sides: ['top', 'right'] });
          console.debug('Debug: box frame group fallback used');
        }
      }
      const xLabelOffset = tickLen + tickGap;
      const xLabels = [];
      labelsUsed.forEach((lab, i) => {
        const x = xCenter(i);
        add('line',{ x1: x, y1: xAxisY, x2: x, y2: xAxisY + tickLen, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const labelText = lab || `Col ${i + 1}`;
        const t = add('text',{ x, y: xAxisY + xLabelOffset, 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'hanging', fill: chartStyle.TEXT_COLOR });
        t.textContent = labelText;
        t.style.cursor = 'ew-resize';
        enableLabelDrag(t, i);
        xLabels.push(t);
      });
      console.debug('Debug: box ticks stroke scaled',{ yTickCount: yScale.ticks.length, xTickCount: labelsUsed.length, axisStrokeWidth });
      chartStyle.applyLabelOrientation(xLabels,{ angle: -45, anchor: 'end', dy: '0.35em', force: bottomLayout.shouldRotate });
      function enableLabelDrag(t, idx){
        t.addEventListener('mousedown', e => {
          e.preventDefault();
          const svgRect = svg.getBoundingClientRect();
          const onMove = ev => {
            const svgX = ev.clientX - svgRect.left;
            t.setAttribute('x', svgX);
          };
          const onUp = ev => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const svgX = ev.clientX - svgRect.left;
            let targetIdx = Math.floor((svgX - marginLocal.left) / bandW);
            targetIdx = Math.max(0, Math.min(labelsUsed.length - 1, targetIdx));
            if(targetIdx !== idx){
              const moved = state.colOrder.splice(idx, 1)[0];
              state.colOrder.splice(targetIdx, 0, moved);
            }
            console.log('boxplot label drag end',{ from: idx, to: targetIdx, orientation: 'horizontal-axis' });
            state.scheduleDraw();
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
      const yX = marginLocal.left - (maxTickWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
      const yText = add('text',{ x: yX, y: marginLocal.top + plotHLocal / 2, transform: `rotate(-90 ${yX} ${marginLocal.top + plotHLocal / 2})`, 'text-anchor': 'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR });
      yText.textContent = state.yLabelText;
      makeEditable(yText, txt => { state.yLabelText = txt; });
      for(let i = 0; i < traces.length; i++){
        if(token !== state.drawToken){
          console.log('boxplot draw cancelled during render loop',{ token });
          return null;
        }
        const t = traces[i];
        const vals = [...t.y].sort((a, b) => a - b);
        if(!vals.length) continue;
        const cx = xCenter(i);
        const x0 = cx - boxW / 2;
        const x1 = cx + boxW / 2;
        const q1 = percentile(vals, 0.25);
        const med = percentile(vals, 0.5);
        const q3 = percentile(vals, 0.75);
        const iqr = q3 - q1;
        const lowerFence = q1 - 1.5 * iqr;
        const upperFence = q3 + 1.5 * iqr;
        const outliers = [];
        let wMin = Infinity;
        let wMax = -Infinity;
        let valIdx = 0;
        for(const v of vals){
          if(v < lowerFence || v > upperFence){
            outliers.push(v);
          }else{
            if(v < wMin) wMin = v;
            if(v > wMax) wMax = v;
          }
          valIdx++;
          if(valIdx % 10000 === 0){
            console.log('boxplot fence progress',{ index: i, valIdx, token });
          }
        }
        if(wMin === Infinity){
          wMin = vals[0];
          wMax = vals[vals.length - 1];
        }
        const yQ1 = y2px(q1);
        const yMed = y2px(med);
        const yQ3 = y2px(q3);
        const yWMin = y2px(wMin);
        const yWMax = y2px(wMax);
        const fillColor = colorMode === 'individual' ? (state.fillColors[i] || DEFAULT_BOX_COLORS[i % DEFAULT_BOX_COLORS.length]) : defaultFill;
        const borderColor = colorMode === 'individual' ? (state.borderColors[i] || shadeColor(fillColor, -30)) : defaultBorder;
        if(graphTypeRaw === 'box' || graphTypeRaw === 'notched'){
          if(graphTypeRaw === 'box'){
            add('rect',{ x: x0, y: yQ3, width: boxW, height: Math.max(1, yQ1 - yQ3), fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: x0, y1: yMed, x2: x1, y2: yMed, stroke: borderColor, 'stroke-width': borderWidthPx });
          }else{
            const notchSpan = 1.57 * (iqr) / Math.sqrt(vals.length);
            let notchLower = Math.max(q1, med - notchSpan);
            let notchUpper = Math.min(q3, med + notchSpan);
            if(notchLower > notchUpper){
              const mid = (notchLower + notchUpper) / 2;
              notchLower = notchUpper = mid;
            }
            const yNL = y2px(notchLower);
            const yNU = y2px(notchUpper);
            const notchWidth = boxW * 0.4;
            const xNL = cx - notchWidth / 2;
            const xNR = cx + notchWidth / 2;
            const d = [
              `M ${x0} ${yQ3}`,
              `L ${x1} ${yQ3}`,
              `L ${x1} ${yNU}`,
              `L ${xNR} ${yMed}`,
              `L ${x1} ${yNL}`,
              `L ${x1} ${yQ1}`,
              `L ${x0} ${yQ1}`,
              `L ${x0} ${yNL}`,
              `L ${xNL} ${yMed}`,
              `L ${x0} ${yNU}`,
              'Z'
            ].join(' ');
            add('path',{ d, fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: xNL, y1: yMed, x2: xNR, y2: yMed, stroke: borderColor, 'stroke-width': borderWidthPx });
          }
          add('line',{ x1: cx, y1: yQ3, x2: cx, y2: yWMax, stroke: borderColor, 'stroke-width': borderWidthPx });
          add('line',{ x1: cx, y1: yQ1, x2: cx, y2: yWMin, stroke: borderColor, 'stroke-width': borderWidthPx });
          if(showCaps){
            const cap = Math.max(6, boxW * 0.4);
            add('line',{ x1: cx - cap / 2, y1: yWMax, x2: cx + cap / 2, y2: yWMax, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: cx - cap / 2, y1: yWMin, x2: cx + cap / 2, y2: yWMin, stroke: borderColor, 'stroke-width': borderWidthPx });
          }
        }
        if(graphTypeRaw === 'bar'){
          const mean = t.y.reduce((a, b) => a + b, 0) / t.y.length;
          const sd = Math.sqrt(t.y.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (t.y.length - 1 || 1));
          const yMean = y2px(mean);
          const yZero = y2px(0);
          const rectY = Math.min(yMean, yZero);
          const rectH = Math.abs(yZero - yMean);
          add('rect',{ x: x0, y: rectY, width: boxW, height: Math.max(1, rectH), fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
          const ySdTop = y2px(mean + sd);
          const cap = Math.max(6, boxW * 0.4);
          if(errorMode === 'both'){
            const ySdBottom = y2px(mean - sd);
            add('line',{ x1: cx, y1: ySdTop, x2: cx, y2: ySdBottom, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: cx - cap / 2, y1: ySdBottom, x2: cx + cap / 2, y2: ySdBottom, stroke: borderColor, 'stroke-width': borderWidthPx });
          }else{
            add('line',{ x1: cx, y1: ySdTop, x2: cx, y2: yMean, stroke: borderColor, 'stroke-width': borderWidthPx });
          }
          add('line',{ x1: cx - cap / 2, y1: ySdTop, x2: cx + cap / 2, y2: ySdTop, stroke: borderColor, 'stroke-width': borderWidthPx });
        }
        if(pointMode !== 'none'){
          console.time(`boxplotPoints_${token}_${i}`);
          const frag = document.createDocumentFragment();
          let ptIdx = 0;
          if(pointMode === 'outliers'){
            for(const v of outliers){
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', cx);
              c.setAttribute('cy', y2px(v));
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0){
                console.log('boxplot outlier progress',{ index: i, ptIdx, token });
              }
            }
          }else{
            for(const v of vals){
              const cy = y2px(v);
              let px;
              if(pointMode === 'overlay'){
                px = cx + (Math.random() - 0.5) * boxW * 0.6;
              }else{
                px = x0 - boxW * 0.3 + (Math.random() - 0.5) * boxW * 0.2;
              }
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', px);
              c.setAttribute('cy', cy);
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              if(pointMode === 'overlay'){
                c.setAttribute('fill-opacity', 0.6);
              }
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0){
                console.log('boxplot point progress',{ index: i, ptIdx, token });
              }
            }
          }
          add('g',{ 'data-trace': i }).appendChild(frag);
          console.timeEnd(`boxplotPoints_${token}_${i}`);
        }
      }
      return {
        margin: marginLocal,
        plotW: plotWLocal,
        plotH: plotHLocal,
        categoryCenter: xCenter,
        valueToCoord: y2px,
        titleX: marginLocal.left + plotWLocal / 2,
        titleY: marginLocal.top / 2
      };
    }

    function renderHorizontal(){
      const tickFont = chartStyle.makeFont(fs);
      const axisLabelFont = chartStyle.makeFont(fs);
      const categoryWidths = labelTexts.map(lbl => chartStyle.measureText(lbl, axisLabelFont));
      const maxCategoryWidth = Math.max(...categoryWidths, 0);
      const tickLen = axisMetrics.tickLength;
      const tickGap = axisMetrics.tickLabelGap;
      const rightExtra = maxLevelEstimate ? (annotationBaseOffset + maxLevelEstimate * annotationLevelGap) : 0;
      let marginLocal = chartStyle.computeBaseMargins({ fontSize: fs, maxYLabelWidth: maxCategoryWidth, yTitleWidth: 0, axisMetrics });
      marginLocal.top = Math.max(marginLocal.top, fs * 2);
      marginLocal.left = Math.max(marginLocal.left, maxCategoryWidth + tickLen + tickGap + fs * 0.5);
      marginLocal.right = Math.max(marginLocal.right, rightExtra + fs);
      marginLocal.bottom = Math.max(marginLocal.bottom, tickLen + tickGap + fs + axisMetrics.axisTitleGap + fs);
      let plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
      let plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
      const yScale = niceScale(ymin, ymax, chartStyle.estimateTickCount(Math.max(plotWLocal, 40), { axis: 'x', fallback: 6 }));
      const valueRange = yScale.max - yScale.min || 1;
      const valueToX = v => marginLocal.left + ((v - yScale.min) / valueRange) * plotWLocal;
      const bandH = plotHLocal / labelsUsed.length;
      const boxH = Math.max(6, Math.min(60, bandH * 0.6));
      const categoryCenter = i => marginLocal.top + (i + 0.5) * bandH;
      if(showGrid){
        yScale.ticks.forEach(t => {
          const x = valueToX(t);
          add('line',{ x1: x, y1: marginLocal.top, x2: x, y2: marginLocal.top + plotHLocal, stroke: '#ddd', 'stroke-width': gridStrokeWidth });
        });
        console.debug('Debug: box grid stroke scaled',{ vertical: yScale.ticks.length, gridStrokeWidth });
      }
      const yAxisLeft = marginLocal.left;
      const xAxisBottom = marginLocal.top + plotHLocal;
      add('line',{ x1: yAxisLeft, y1: marginLocal.top, x2: yAxisLeft, y2: xAxisBottom, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      labelsUsed.forEach((lab, i) => {
        const y = categoryCenter(i);
        add('line',{ x1: yAxisLeft, y1: y, x2: yAxisLeft - tickLen, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const labelText = lab || `Col ${i + 1}`;
        const t = add('text',{ x: yAxisLeft - (tickLen + tickGap), y, 'font-size': fs, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: chartStyle.TEXT_COLOR });
        t.textContent = labelText;
        t.style.cursor = 'ns-resize';
        enableVerticalLabelDrag(t, i);
      });
      yScale.ticks.forEach(t => {
        const x = valueToX(t);
        add('line',{ x1: x, y1: xAxisBottom, x2: x, y2: xAxisBottom + tickLen, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const txt = add('text',{ x, y: xAxisBottom + tickLen + tickGap, 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'hanging', fill: chartStyle.TEXT_COLOR });
        txt.textContent = formatTick(logScale ? Math.pow(10, t) : t);
      });
      add('line',{ x1: yAxisLeft, y1: xAxisBottom, x2: marginLocal.left + plotWLocal, y2: xAxisBottom, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      if(showFrame){
        chartStyle.drawPlotFrame({ svg, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, sides: ['top', 'right'] });
      }
      const xLabel = add('text',{ x: marginLocal.left + plotWLocal / 2, y: xAxisBottom + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.8, 'text-anchor': 'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR });
      xLabel.textContent = state.yLabelText;
      makeEditable(xLabel, txt => { state.yLabelText = txt; });
      function enableVerticalLabelDrag(t, idx){
        t.addEventListener('mousedown', e => {
          e.preventDefault();
          const svgRect = svg.getBoundingClientRect();
          const onMove = ev => {
            const svgY = ev.clientY - svgRect.top;
            t.setAttribute('y', svgY);
          };
          const onUp = ev => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const svgY = ev.clientY - svgRect.top;
            let targetIdx = Math.floor((svgY - marginLocal.top) / bandH);
            targetIdx = Math.max(0, Math.min(labelsUsed.length - 1, targetIdx));
            if(targetIdx !== idx){
              const moved = state.colOrder.splice(idx, 1)[0];
              state.colOrder.splice(targetIdx, 0, moved);
            }
            console.log('boxplot label drag end',{ from: idx, to: targetIdx, orientation: 'vertical-axis' });
            state.scheduleDraw();
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
      for(let i = 0; i < traces.length; i++){
        if(token !== state.drawToken){
          console.log('boxplot draw cancelled during render loop',{ token });
          return null;
        }
        const t = traces[i];
        const vals = [...t.y].sort((a, b) => a - b);
        if(!vals.length) continue;
        const cy = categoryCenter(i);
        const y0 = cy - boxH / 2;
        const y1 = cy + boxH / 2;
        const q1 = percentile(vals, 0.25);
        const med = percentile(vals, 0.5);
        const q3 = percentile(vals, 0.75);
        const iqr = q3 - q1;
        const lowerFence = q1 - 1.5 * iqr;
        const upperFence = q3 + 1.5 * iqr;
        const outliers = [];
        let wMin = Infinity;
        let wMax = -Infinity;
        let valIdx = 0;
        for(const v of vals){
          if(v < lowerFence || v > upperFence){
            outliers.push(v);
          }else{
            if(v < wMin) wMin = v;
            if(v > wMax) wMax = v;
          }
          valIdx++;
          if(valIdx % 10000 === 0){
            console.log('boxplot fence progress',{ index: i, valIdx, token, orientation: 'horizontal' });
          }
        }
        if(wMin === Infinity){
          wMin = vals[0];
          wMax = vals[vals.length - 1];
        }
        const xQ1 = valueToX(q1);
        const xMed = valueToX(med);
        const xQ3 = valueToX(q3);
        const xWMin = valueToX(wMin);
        const xWMax = valueToX(wMax);
        const fillColor = colorMode === 'individual' ? (state.fillColors[i] || DEFAULT_BOX_COLORS[i % DEFAULT_BOX_COLORS.length]) : defaultFill;
        const borderColor = colorMode === 'individual' ? (state.borderColors[i] || shadeColor(fillColor, -30)) : defaultBorder;
        if(graphTypeRaw === 'box' || graphTypeRaw === 'notched'){
          const left = Math.min(xQ1, xQ3);
          const right = Math.max(xQ1, xQ3);
          if(graphTypeRaw === 'box'){
            add('rect',{ x: left, y: y0, width: Math.max(1, right - left), height: Math.max(1, boxH), fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: xMed, y1: y0, x2: xMed, y2: y1, stroke: borderColor, 'stroke-width': borderWidthPx });
          }else{
            const notchSpan = 1.57 * (iqr) / Math.sqrt(vals.length);
            let notchLower = Math.max(q1, med - notchSpan);
            let notchUpper = Math.min(q3, med + notchSpan);
            if(notchLower > notchUpper){
              const mid = (notchLower + notchUpper) / 2;
              notchLower = notchUpper = mid;
            }
            const xNotchLow = valueToX(notchLower);
            const xNotchHigh = valueToX(notchUpper);
            const notchDepth = boxH * 0.4;
            const notchHalf = notchDepth / 2;
            let yNotchTop = cy - notchHalf;
            let yNotchBottom = cy + notchHalf;
            if(yNotchTop < y0) yNotchTop = y0;
            if(yNotchBottom > y1) yNotchBottom = y1;
            if(yNotchTop > yNotchBottom){
              const mid = (yNotchTop + yNotchBottom) / 2;
              yNotchTop = yNotchBottom = mid;
            }
            const d = [
              `M ${left} ${y0}`,
              `L ${xNotchLow} ${y0}`,
              `L ${xMed} ${yNotchTop}`,
              `L ${xNotchHigh} ${y0}`,
              `L ${right} ${y0}`,
              `L ${right} ${y1}`,
              `L ${xNotchHigh} ${y1}`,
              `L ${xMed} ${yNotchBottom}`,
              `L ${xNotchLow} ${y1}`,
              `L ${left} ${y1}`,
              'Z'
            ].join(' ');
            add('path',{ d, fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: xMed, y1: yNotchTop, x2: xMed, y2: yNotchBottom, stroke: borderColor, 'stroke-width': borderWidthPx });
            // Debug: log the horizontal notch geometry so future tweaks keep parity with vertical boxes.
            console.debug('Debug: box horizontal notch path',{ notchLower, notchUpper, xNotchLow, xNotchHigh, yNotchTop, yNotchBottom, boxHeight: boxH, token });
          }
          add('line',{ x1: xWMin, y1: cy, x2: left, y2: cy, stroke: borderColor, 'stroke-width': borderWidthPx });
          add('line',{ x1: right, y1: cy, x2: xWMax, y2: cy, stroke: borderColor, 'stroke-width': borderWidthPx });
          if(showCaps){
            const cap = Math.max(6, boxH * 0.4);
            add('line',{ x1: xWMin, y1: cy - cap / 2, x2: xWMin, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: xWMax, y1: cy - cap / 2, x2: xWMax, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': borderWidthPx });
          }
        }else if(graphTypeRaw === 'bar'){
          const mean = t.y.reduce((a, b) => a + b, 0) / t.y.length;
          const sd = Math.sqrt(t.y.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (t.y.length - 1 || 1));
          const xMean = valueToX(mean);
          const xZero = valueToX(0);
          const rectX = Math.min(xMean, xZero);
          const rectW = Math.max(1, Math.abs(xZero - xMean));
          add('rect',{ x: rectX, y: y0, width: rectW, height: Math.max(1, boxH), fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
          const xSdPos = valueToX(mean + sd);
          const cap = Math.max(6, boxH * 0.4);
          if(errorMode === 'both'){
            const xSdNeg = valueToX(mean - sd);
            add('line',{ x1: xSdNeg, y1: cy, x2: xSdPos, y2: cy, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: xSdNeg, y1: cy - cap / 2, x2: xSdNeg, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': borderWidthPx });
          }else{
            add('line',{ x1: xMean, y1: cy, x2: xSdPos, y2: cy, stroke: borderColor, 'stroke-width': borderWidthPx });
          }
          add('line',{ x1: xSdPos, y1: cy - cap / 2, x2: xSdPos, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': borderWidthPx });
        }
        if(pointMode !== 'none'){
          console.time(`boxplotPoints_${token}_${i}`);
          const frag = document.createDocumentFragment();
          let ptIdx = 0;
          if(pointMode === 'outliers'){
            for(const v of outliers){
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', valueToX(v));
              c.setAttribute('cy', cy);
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0){
                console.log('boxplot outlier progress',{ index: i, ptIdx, token, orientation: 'horizontal' });
              }
            }
          }else{
            for(const v of vals){
              const px = valueToX(v);
              let py;
              if(pointMode === 'overlay'){
                py = cy + (Math.random() - 0.5) * boxH * 0.6;
              }else{
                py = y0 - boxH * 0.3 + (Math.random() - 0.5) * boxH * 0.2;
              }
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', px);
              c.setAttribute('cy', py);
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              if(pointMode === 'overlay'){
                c.setAttribute('fill-opacity', 0.6);
              }
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0){
                console.log('boxplot point progress',{ index: i, ptIdx, token, orientation: 'horizontal' });
              }
            }
          }
          add('g',{ 'data-trace': i }).appendChild(frag);
          console.timeEnd(`boxplotPoints_${token}_${i}`);
        }
      }
      return {
        margin: marginLocal,
        plotW: plotWLocal,
        plotH: plotHLocal,
        categoryCenter,
        valueToCoord: valueToX,
        titleX: marginLocal.left + plotWLocal / 2,
        titleY: marginLocal.top / 2
      };
    }

    const orientationResult = isFlipped ? renderHorizontal() : renderVertical();
    if(!orientationResult){
      autoResizeSvg(svg);
      return;
    }
    if(token !== state.drawToken){
      console.log('boxplot draw cancelled before finalize',{ token });
      return;
    }
    const titleText = add('text',{ x: orientationResult.titleX, y: orientationResult.titleY, 'text-anchor': 'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR });
    titleText.textContent = state.titleText;
    makeEditable(titleText, txt => { state.titleText = txt; });
    const helpers = {
      xCenter: orientationResult.categoryCenter,
      categoryCenter: orientationResult.categoryCenter,
      y2px: orientationResult.valueToCoord,
      valueToCoord: orientationResult.valueToCoord,
      annotationStyle
    };
    console.debug('Debug: box annotation style forwarded', helpers.annotationStyle);
    computeStats(traces, svg, helpers);
    renderStatsTable(traces);
    const otherBoxes = Array.from(svg.children).filter(el => el !== titleText && el.getBBox).map(el => el.getBBox());
    if(otherBoxes.length){
      const topMost = Math.min(...otherBoxes.map(b => b.y));
      const spacing = fs + 4;
      const newY = Math.max(spacing, topMost - spacing);
      titleText.setAttribute('y', newY);
    }
    autoResizeSvg(svg);
    console.log('boxplot render complete');
  }
  // PART: SAVE_OPEN
  function getPayload(){ return { type:'box', data: state.hot.getData(), config: { title:state.titleText, yLabel:state.yLabelText, colorMode:els.boxColorUnified.checked?'unified':'individual', fill:els.boxFill.value, border:els.boxBorder.value, borderWidth:els.boxBorderWidth.value, fontSize:els.boxFontSize.value, showGrid:els.boxShowGrid.checked, showFrame:!!els.boxShowFrame?.checked, logScale:els.boxLogScale.checked, graphType:els.boxGraphType.value, pointMode:els.boxPointMode.value, showCaps:els.boxShowCaps.checked, errorMode:els.boxErrorMode.value, colors:[...state.fillColors], borderColors:[...state.borderColors], yMin:els.boxYMin.value, yMax:els.boxYMax.value, flipAxes: state.flipAxes } }; }
  box.save = async function(){
    console.debug('Debug: box.save invoked', { hasHandle: !!state.fileHandle });
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('box.save missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'box',
      fileHandle: state.fileHandle,
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: box.save result', result);
  };
  box.saveAs = async function(){
    console.debug('Debug: box.saveAs invoked', { currentName: state.fileName });
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('box.saveAs missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'box',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: box.saveAs result', result);
  };
  box.open = async function(){
    console.debug('Debug: box.open invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('box.open missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'box',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: file => box.loadFromFile(file),
      triggerInput: () => {
        const input = global.document.getElementById('boxGraphFile');
        if(input){
          input.value='';
          input.click();
        }
      }
    });
    console.debug('Debug: box.open result', result);
  };
  box.loadFromFile = function(file){ const reader=new FileReader(); reader.onload=e=>{ try{ const obj=JSON.parse(e.target.result); console.log('loadBoxGraph',obj); if(obj.type!=='box') throw new Error('Invalid graph type'); state.hot.loadData(obj.data||[]); const c=obj.config||{}; state.titleText=c.title||state.titleText; state.yLabelText=c.yLabel||state.yLabelText; els.boxFill.value=c.fill||els.boxFill.value; els.boxBorder.value=c.border||els.boxBorder.value; els.boxBorderWidth.value=c.borderWidth||els.boxBorderWidth.value; els.boxFontSize.value=c.fontSize||els.boxFontSize.value; chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: Number(els.boxFontSize.value) }); els.boxShowGrid.checked=!!c.showGrid; if(els.boxShowFrame) els.boxShowFrame.checked=!!c.showFrame; els.boxLogScale.checked=!!c.logScale; els.boxGraphType.value=c.graphType||els.boxGraphType.value; els.boxPointMode.value=c.pointMode||els.boxPointMode.value; els.boxShowCaps.checked=!!c.showCaps; els.boxErrorMode.value=c.errorMode||els.boxErrorMode.value; els.boxErrorModeCtl.style.display=els.boxGraphType.value==='bar'?'':'none'; state.fillColors=c.colors||[]; state.borderColors=c.borderColors||[]; if(c.colorMode==='individual'){ els.boxColorIndividual.checked=true; } else { els.boxColorUnified.checked=true; } toggleColorMode(); els.boxYMin.value=c.yMin||''; els.boxYMax.value=c.yMax||''; state.flipAxes=!!c.flipAxes; if(els.boxFlipAxes){ els.boxFlipAxes.checked=state.flipAxes; } const labels=state.hot.getDataAtRow(0) || []; if(els.boxColorIndividual.checked){ updateBoxColorPickers(labels); } else { els.boxColorPerBox.innerHTML=''; } state.scheduleDraw(); }catch(err){ console.error('loadBoxGraph error',err); } }; reader.readAsText(file); };

  box.init = function init(){
    if (box.ready) { console.debug('Debug: Components.box.init skipped'); return; }
    console.debug('Debug: Components.box.init');
    // Will be filled by placeholders
    // cache elements, ensure styles, set up resizers, hot, ui, and schedule
    if (typeof cacheEls === 'function') cacheEls();
    if (typeof ensureWrapperStyles === 'function') ensureWrapperStyles();
    if (typeof initTableAndResizers === 'function') initTableAndResizers();
    if (typeof initHot === 'function') initHot();
    if (typeof initUI === 'function') initUI();
    state.scheduleDraw = Shared.debounceFrame(draw);
    console.debug('Debug: box scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    box.ready = true;
    try{ state.scheduleDraw(); } catch(e){ console.error('box init initial draw error', e); }
  };

  box.draw = function(){ try{ if (typeof draw === 'function') draw(); } catch(e){ console.error('box.draw error', e); } };
  box.ensure = function(){ if(!box.ready) box.init(); };
})(window);

