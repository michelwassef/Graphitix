(function(){
  "use strict";
  console.debug("Debug: main.js loaded");// Debug: entry
  // Prefer shared debounce if available
  function debounceFrame(fn){
    if (window.Shared && typeof window.Shared.debounceFrame === 'function') {
      return window.Shared.debounceFrame(fn);
    }
    let frame;
    return (...args)=>{
      if(frame) cancelAnimationFrame(frame);
      console.debug('Debug: debounceFrame scheduled (local)', fn && fn.name, args.length);
      frame=requestAnimationFrame(()=>{
        console.debug('Debug: debounceFrame executing (local)', fn && fn.name);
        frame=null;
        try { fn && fn(...args); } catch(err){ console.error('debounceFrame error', err); }
      });
    };
  }
  // Predeclare to avoid TDZ/ReferenceError if wrapped later or guarded
  const scheduleDrawBoxplot = debounceFrame(() => {
    if (window.Components && window.Components.box && typeof window.Components.box.draw === 'function') {
      window.Components.box.draw();
    }
  });
  const scheduleDrawScatter = debounceFrame(() => {
    if (window.Components && window.Components.scatter && typeof window.Components.scatter.draw === 'function') {
      window.Components.scatter.draw();
    }
  });
  const scheduleDrawPca = debounceFrame(() => {
    if (window.Components && window.Components.pca && typeof window.Components.pca.draw === 'function') {
      window.Components.pca.draw();
    }
  });
  const scheduleDrawLine = debounceFrame(() => {
    try {
      if (window.Components && window.Components.line && typeof window.Components.line.draw === 'function') {
        window.Components.line.draw();
      }
    } catch (e) {
      console.error('scheduleDrawLine error', e);
    }
  });
  // Delegate to components if present
  const scheduleDrawHist = debounceFrame(() => {
    if (window.Components && window.Components.hist && typeof window.Components.hist.draw === 'function') {
      window.Components.hist.draw();
    }
  });
  const scheduleDrawPie = debounceFrame(() => {
    if (window.Components && window.Components.pie && typeof window.Components.pie.draw === 'function') {
      window.Components.pie.draw();
    }
  });
  // Shared default color palette used by Scatter/Line/PCA/ROC/Pie
  // Ensure both a global property and a local binding exist before any draw calls
  var DEFAULT_SCATTER_COLORS = window.DEFAULT_SCATTER_COLORS || ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
  window.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
  // Back-compat shim for color picker overlay used by components
  function attachColorPickerNear(el){
    if (window.Shared && typeof window.Shared.attachColorPickerNear === 'function') {
      window.Shared.attachColorPickerNear(el);
    }
  }
  window.attachColorPickerNear = attachColorPickerNear;
  const scheduleDrawRoc = debounceFrame(drawRoc);
  let boxplotDrawToken=0; // debug: track boxplot render cycles
  let pcaDrawToken=0; // debug: track pca render cycles
  let histDrawToken=0; // debug: track histogram render cycles
  let pieDrawToken=0; // debug: track pie render cycles
  let rocDrawToken=0; // debug: track roc render cycles
  const $ = (s)=>document.querySelector(s);
  const stage = $('#stage');
  const vennPage=$('#vennPage');
  const boxPage=$('#boxPage');
  const scatterPage=$('#scatterPage');
  const pcaPage=$('#pcaPage');
  const linePage=$('#linePage');
  const rocPage=$('#rocPage');
  const histPage=$('#histPage');
  const piePage=$('#piePage');
  const histStatsResults=$('#histStatsResults');
  const pieStatsResults=$('#pieStatsResults');
const rocStatsResults=$('#rocStatsResults');
const rocStatsControls=$('#rocStatsControls');
let rocDiffMethod='delong';
let rocCompareSel=null, rocCompareResult=null, rocCompareLabel=null;
  const tabVenn=$('#tabVenn');
  const tabBox=$('#tabBox');
  const tabScatter=$('#tabScatter');
  const tabPca=$('#tabPca');
  const tabLine=$('#tabLine');
  const tabRoc=$('#tabRoc');
  const tabHist=$('#tabHist');
  const tabPie=$('#tabPie');
  // Shared defaults and SVG namespace used by multiple sections
  const NS='http://www.w3.org/2000/svg';
  const DEFAULT_ROWS=100, DEFAULT_COLS=10, LINE_DEFAULT_COLS=6, HIST_DEFAULT_COLS=1, PIE_DEFAULT_COLS=6, ROC_DEFAULT_COLS=3, PCA_DEFAULT_COLS=5;
  // If componentized box is present, skip legacy box section
  if (!(window.Components && window.Components.box && window.Components.box.__installed)) {
  const hotContainer=document.getElementById('hot');
  const hotWrapper=document.getElementById('hotWrapper');
  const tablePanel=document.getElementById('boxTablePanel');
  const graphPanel=document.getElementById('boxGraphPanel');
  const panelResizer=document.getElementById('boxPanelResizer');
  const boxSvgBox=graphPanel.querySelector('.svgbox');
  const boxConfigPanel=graphPanel.querySelector('.config-options');

  const vennContainer = stage.closest('.svgbox') || stage.parentElement;
  (function initVennResizers(){
    if(!vennContainer) return;
    if (window.Shared && typeof window.Shared.attachResizableBox === 'function') {
      window.Shared.attachResizableBox(vennContainer);
    }
  })();

  // Use shared color picker overlay if present
  (function initColorOverlay(){
    if (window.Shared && typeof window.Shared.initColorPickerOverlay === 'function') {
      const overlay = window.Shared.initColorPickerOverlay();
      document.querySelectorAll('input[type=color]').forEach(el=>{ if(el!==overlay) window.Shared.attachColorPickerNear(el); });
    }
  })();

  // Back-compat shim: many sections call attachColorPickerNear directly.
  // Delegate to Shared implementation to avoid breaking existing calls.
  function attachColorPickerNear(el){
    if (window.Shared && typeof window.Shared.attachColorPickerNear === 'function') {
      window.Shared.attachColorPickerNear(el);
    }
  }

  // Bootstrap extracted components if present
  (function bootstrapComponents(){
    try{
      if (window.Components && window.Components.hist && typeof window.Components.hist.init === 'function') {
        window.Components.hist.init();
      }
      if (window.Components && window.Components.pie && typeof window.Components.pie.init === 'function') {
        window.Components.pie.init();
      }
      if (window.Components && window.Components.box && typeof window.Components.box.init === 'function') {
        window.Components.box.init();
      }
      if (window.Components && window.Components.venn && typeof window.Components.venn.init === 'function') {
        window.Components.venn.init();
      }
    }catch(err){ console.error('Components bootstrap error', err); }
  })();
  let boxMinSvgWidth=0;
  function syncBoxWidths(){
    const tableWidth=tablePanel.getBoundingClientRect().width;
    const graphWidth=graphPanel.getBoundingClientRect().width;
    const configWidth=boxConfigPanel.getBoundingClientRect().width;
    const gap=parseFloat(getComputedStyle(graphPanel.querySelector('.diagram-area')).gap||0);
    const available=graphWidth-configWidth-gap;
    const minW=boxMinSvgWidth||0;
    const newW=Math.max(minW, Math.min(tableWidth, available));
    boxSvgBox.style.width=newW+'px';
    console.debug('Debug: syncBoxWidths',{tableWidth,graphWidth,configWidth,gap,available,newW,minW});
  }

  const tableObserver=new ResizeObserver(entries=>{
    syncBoxWidths();
  });
  tableObserver.observe(tablePanel);
  syncBoxWidths();

  const DEFAULT_ROWS=100, DEFAULT_COLS=10, LINE_DEFAULT_COLS=6, HIST_DEFAULT_COLS=1, PIE_DEFAULT_COLS=6, ROC_DEFAULT_COLS=3, PCA_DEFAULT_COLS=5;
  let colHeaders=Array.from({length:DEFAULT_COLS},(_,i)=>String.fromCharCode(65+i));
  const NS='http://www.w3.org/2000/svg';
  let selectedCols=new Set();
  let boxTitleText='Boxplot';
  let boxYLabelText='Value';
  window.DEBUG_BOX=true;
  let statsTest='parametric';
  let statsMode='all';
  let statsRef=0;
  let statsPaired=false;
  let statsPairsText='';
  let statsCustomPairs=[];
  let boxColOrder=[];
  let boxColors=[];
  let boxBorderColors=[];
  const DEFAULT_BOX_COLORS=['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854','#ffd92f','#e5c494','#b3b3b3'];
  const DEFAULT_SCATTER_COLORS=['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
  let lastBoxDefaultFill='#4472c4';
  const ANN_BASE_OFFSET=25;
  const ANN_LEVEL_GAP=25;

  function shadeColor(color, percent){
    const num=parseInt(color.slice(1),16);
    const amt=Math.round(2.55*percent);
    const R=(num>>16)+amt;
    const G=(num>>8&0x00FF)+amt;
    const B=(num&0x0000FF)+amt;
    const newColor='#'+(
      0x1000000+
      (R<255?(R<0?0:R):255)*0x10000+
      (G<255?(G<0?0:G):255)*0x100+
      (B<255?(B<0?0:B):255)
    ).toString(16).slice(1);
    console.log('shadeColor',{color,percent,newColor});
    return newColor;
  }

  if(window.Shared && window.Shared.ensureHotWrapperStyles){ window.Shared.ensureHotWrapperStyles(hotWrapper); }
  console.debug('hotWrapper style updated', hotWrapper.style.cssText);
  const hot=new Handsontable(hotContainer,{
    data:Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,DEFAULT_COLS),
    rowHeaders(index){
      const label = index === 0 ? '' : index;
      console.debug('box rowHeader', {index, label});
      return label;
    },
    colHeaders:true,
    minRows:DEFAULT_ROWS,
    minCols:DEFAULT_COLS,
    contextMenu:true,
    manualColumnMove:true,
    undo:true,
    afterUndo:()=>{console.log('boxplot undo'); scheduleDrawBoxplot();},
    afterRedo:()=>{console.log('boxplot redo'); scheduleDrawBoxplot();},
    licenseKey:'non-commercial-and-evaluation',
    cells(row,col){
      const props={};
      if(row===0){
        props.renderer=function(instance,td,r,c,prop,value,cellProperties){
          Handsontable.renderers.TextRenderer.apply(this,arguments);
          td.style.background='#e9ecef';
          td.style.fontWeight='600';
          td.title='Header (first row)';
        };
      }
      return props;
    },
    afterCreateCol(index, amount){
      for(let i=0;i<amount;i++){
        colHeaders.splice(index+i,0,String.fromCharCode(65+index+i));
      }
      selectedCols.clear();
      console.log('boxplot afterCreateCol', {index, amount});
      scheduleDrawBoxplot();
    },
    afterRemoveCol(index, amount){
      colHeaders.splice(index,amount);
      selectedCols.clear();
      console.log('boxplot afterRemoveCol', {index, amount});
      scheduleDrawBoxplot();
    },
    afterChange(changes, source){
      if(!changes || source==='loadData') return;
      console.log('boxplot afterChange', {count:changes.length, source});
      scheduleDrawBoxplot();
    },
    afterColumnMove(moved, finalIndex, dropIndex, movePossible, orderChanged){
      if(orderChanged){
        console.log('boxplot afterColumnMove', {finalIndex, dropIndex});
        scheduleDrawBoxplot();
      }
    }
  });

  const loadExampleBtn=$('#boxLoadExample'), importBtn=$('#boxImport'), fileInput=$('#boxFile');
  const exampleData=[
    ['Control','Treatment A','Treatment B'],
    [12,15,14],
    [14,17,15],
    [11,14,13],
    [13,16,16],
    [15,18,18],
    [16,19,17],
    [14,16,15],
    [13,15,14],
    [12,14,13],
    [15,17,16]
  ];
  if(window.DEBUG_BOX) console.log('boxplot example dataset', exampleData);
  loadExampleBtn.addEventListener('click',()=>{
    selectedCols.clear();
    hot.loadData(exampleData);
    console.log('boxplot example loaded');
    scheduleDrawBoxplot();
  });
  importBtn.addEventListener('click',()=>{
    fileInput.value='';
    fileInput.click();
  });
  fileInput.addEventListener('change',e=>{
    const file=e.target.files[0];
    if(!file) return;
    const ext=file.name.split('.').pop().toLowerCase();
    const reader=new FileReader();
    if(['csv','tsv','txt'].includes(ext)){
      reader.onload=ev=>{
        const text=ev.target.result;
        const delim=ext==='csv'?',':'\t';
        let rows=text.split(/\r?\n/).map(r=>r.split(delim));
        processImportedRows(rows);
      };
      reader.readAsText(file);
    }else if(['xls','xlsx','ods','odg'].includes(ext)){
      reader.onload=async ev=>{
        try{
          if(!window.XLSX){
            await new Promise((resolve,reject)=>{
              const s=document.createElement('script');
              s.src='libs/xlsx.full.min.js';
              s.onload=()=>resolve();
              s.onerror=err=>reject(new Error('Failed to load XLSX script'));
              document.head.appendChild(s);
            });
          }
          if(!window.XLSX) throw new Error('XLSX library unavailable');
          const data=new Uint8Array(ev.target.result);
          const workbook=XLSX.read(data,{type:'array'});
          const sheet=workbook.Sheets[workbook.SheetNames[0]];
          let rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
          processImportedRows(rows);
        }catch(err){
          alert('Failed to import spreadsheet: '+err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    }else{
      alert('Unsupported file format: '+ext);
    }
  });

  hotContainer.addEventListener('paste',async e=>{
    e.preventDefault();
    e.stopPropagation();
    let text=e.clipboardData?.getData('text/plain');
    if(!text){
      try{
        text=await navigator.clipboard.readText();
        console.log('boxplot clipboard fallback used');
      }catch(err){
        console.log('boxplot clipboard read failed',err);
        return;
      }
    }
    const rowArr=text.split(/\r?\n/);
    if(rowArr.length<2 && !text.includes('\t') && !text.includes(',')){
      console.log('boxplot paste ignored: insufficient data');
      return;
    }
    const delim=text.includes('\t')?'\t':',';
    const rows=rowArr.map(r=>r.split(delim));
    const sel=hot.getSelectedLast();
    const startRow=sel?sel[0]:0;
    const startCol=sel?sel[1]:0;
    console.log('boxplot fast paste',{rows:rows.length,cols:rows[0]?.length,startRow,startCol});
    console.time('boxplotPaste');
    processImportedRows(rows,startRow,startCol);
    console.timeEnd('boxplotPaste');
  },true);

  function processImportedRows(rows,startRow=0,startCol=0){
    if(!rows || !rows.length) return;
    rows=rows.filter(r=>r && r.some(c=>c!==null && c!==undefined && String(c).trim()!==''));
    if(!rows.length) return;
    const colCount=Math.max(...rows.map(r=>r.length));
    const rowCount=rows.length;
    const curRows=hot.countRows();
    const curCols=hot.countCols();
    const targetRows=Math.max(DEFAULT_ROWS,curRows,startRow+rowCount);
    const targetCols=Math.max(DEFAULT_COLS,curCols,startCol+colCount);
    const data=Array.from({length:targetRows},(_,r)=>Array(targetCols).fill(''));
    const existing=hot.getData();
    for(let r=0;r<curRows;r++){
      for(let c=0;c<curCols;c++) data[r][c]=existing[r][c];
    }
    for(let r=0;r<rowCount;r++){
      const row=rows[r];
      for(let c=0;c<row.length;c++) data[startRow+r][startCol+c]=row[c];
    }
    selectedCols.clear();
    hot.updateSettings({data,minRows:targetRows,minCols:targetCols});
    console.log('boxplot data imported', {rows:data.length, cols:targetCols});
    scheduleDrawBoxplot();
  }

  const boxColorUnified=$('#boxColorUnified'), boxColorIndividual=$('#boxColorIndividual'), boxUnifiedColors=$('#boxUnifiedColors'), boxFill=$('#boxFill'), boxBorder=$('#boxBorder'), boxBorderWidth=$('#boxBorderWidth'), boxFontSize=$('#boxFontSize'), boxFontSizeVal=$('#boxFontSizeVal'), boxShowGrid=$('#boxShowGrid'), boxLogScale=$('#boxLogScale'), boxGraphType=$('#boxGraphType'), boxPointMode=$('#boxPointMode'), boxShowCaps=$('#boxShowCaps'), boxErrorMode=$('#boxErrorMode'), boxErrorModeCtl=$('#boxErrorModeCtl'), boxColorPerBox=$('#boxColorPerBox'), boxYMin=$('#boxYMin'), boxYMax=$('#boxYMax');
  lastBoxDefaultFill=boxFill.value;
  function toggleBoxColorMode(){
    const mode=boxColorUnified.checked?'unified':'individual';
    boxUnifiedColors.style.display=mode==='unified'?'':'none';
    if(mode==='unified'){ boxColorPerBox.innerHTML=''; }
    console.log('box color mode toggled',mode);
    scheduleDrawBoxplot();
  }
  boxColorUnified.addEventListener('change',toggleBoxColorMode);
  boxColorIndividual.addEventListener('change',toggleBoxColorMode);
  toggleBoxColorMode();
  boxFontSize.addEventListener('input',()=>{ boxFontSizeVal.textContent=boxFontSize.value; scheduleDrawBoxplot(); });
  boxShowGrid.addEventListener('change',()=>{ console.log('boxShowGrid changed', boxShowGrid.checked); scheduleDrawBoxplot(); });
  boxLogScale.addEventListener('change',()=>{ console.log('boxLogScale changed', boxLogScale.checked); scheduleDrawBoxplot(); });
  boxGraphType.addEventListener('change',()=>{ console.log('boxGraphType changed', boxGraphType.value); boxErrorModeCtl.style.display=boxGraphType.value==='bar'?'':'none'; scheduleDrawBoxplot(); });
  boxPointMode.addEventListener('change',()=>{ console.log('boxPointMode changed', boxPointMode.value); scheduleDrawBoxplot(); });
  boxShowCaps.addEventListener('change',()=>{ console.log('boxShowCaps changed', boxShowCaps.checked); scheduleDrawBoxplot(); });
  boxErrorMode.addEventListener('change',()=>{ console.log('boxErrorMode changed', boxErrorMode.value); scheduleDrawBoxplot(); });
  boxYMin.addEventListener('input',()=>{ console.log('boxYMin changed', boxYMin.value); scheduleDrawBoxplot(); });
  boxYMax.addEventListener('input',()=>{ console.log('boxYMax changed', boxYMax.value); scheduleDrawBoxplot(); });
  boxErrorModeCtl.style.display=boxGraphType.value==='bar'?'':'none';
  boxFill.addEventListener('input',()=>{
    console.log('boxFill changed',{newColor:boxFill.value,oldColor:lastBoxDefaultFill});
    boxColors=boxColors.map(c=>c===lastBoxDefaultFill?boxFill.value:c);
    lastBoxDefaultFill=boxFill.value;
    scheduleDrawBoxplot();
  });
  boxBorder.addEventListener('input',()=>{ console.log('boxBorder changed', boxBorder.value); scheduleDrawBoxplot(); });
  boxBorderWidth.addEventListener('input',()=>{ console.log('boxBorderWidth changed', boxBorderWidth.value); scheduleDrawBoxplot(); });
  
  function updateBoxColorPickers(labels){
    if(boxColorUnified.checked){ boxColorPerBox.innerHTML=''; return; }
    boxColorPerBox.innerHTML='';
    labels.forEach((lab,i)=>{
      if(!boxColors[i]) boxColors[i]=DEFAULT_BOX_COLORS[i%DEFAULT_BOX_COLORS.length];
      if(!boxBorderColors[i]) boxBorderColors[i]=shadeColor(boxColors[i],-30);
      const fillInput=document.createElement('input');
      fillInput.type='color';
      fillInput.value=boxColors[i];
      attachColorPickerNear(fillInput);
      fillInput.addEventListener('input',e=>{
        boxColors[i]=e.target.value;
        console.log('box fill color changed',{index:i,color:boxColors[i]});
        scheduleDrawBoxplot();
      });
      const borderInput=document.createElement('input');
      borderInput.type='color';
      borderInput.value=boxBorderColors[i];
      attachColorPickerNear(borderInput);
      borderInput.addEventListener('input',e=>{
        boxBorderColors[i]=e.target.value;
        console.log('box border color changed',{index:i,color:boxBorderColors[i]});
        scheduleDrawBoxplot();
      });
      const lbl=document.createElement('label');
      lbl.textContent=lab+' ';
      lbl.appendChild(fillInput);
      lbl.appendChild(borderInput);
      boxColorPerBox.appendChild(lbl);
    });
    boxColors.length=labels.length;
    boxBorderColors.length=labels.length;
    console.log('updateBoxColorPickers',{boxColors,boxBorderColors});
  }

  const boxPlotDiv = document.getElementById('boxPlot');
  const boxContainer = boxPlotDiv.closest('.svgbox') || boxPlotDiv.parentElement;
  (function initBoxResizers(){
    if(!boxContainer) return;
    if(window.Shared && window.Shared.attachResizableBox){
      window.Shared.attachResizableBox(boxContainer, { onResize: () => scheduleDrawBoxplot() });
    }
  })();

  (function initPanelResizer(){
    if(!panelResizer||!tablePanel||!graphPanel) return;
    panelResizer.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const startX=e.clientX;
      const startTable=tablePanel.getBoundingClientRect().width;
      const startGraph=graphPanel.getBoundingClientRect().width;
      const configWidth=boxConfigPanel.getBoundingClientRect().width;
      const gap=parseFloat(getComputedStyle(graphPanel.querySelector('.diagram-area')).gap||0);
      boxMinSvgWidth=boxSvgBox.getBoundingClientRect().width*0.5;
      const minGraph=configWidth+gap+boxMinSvgWidth;
      const total=startTable+startGraph;
      console.debug('box resizer start',{startTable,startGraph,configWidth,gap,boxMinSvgWidth,minGraph,total});
      function onMove(ev){
        const dx=ev.clientX-startX;
        let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx));
        let newGraph=total-newTable;
        tablePanel.style.flex=`0 0 ${newTable}px`;
        graphPanel.style.flex=`0 0 ${newGraph}px`;
        syncBoxWidths();
        console.debug('box resizer move',{dx,newTable,newGraph});
      }
      function onUp(){
        document.removeEventListener('pointermove',onMove);
        document.removeEventListener('pointerup',onUp);
        console.debug('box resizer end');
      }
      document.addEventListener('pointermove',onMove);
      document.addEventListener('pointerup',onUp);
    });
  })();
  } // close legacy box section guard before scatter

  // If Box component is installed (legacy skipped), bootstrap components here
  (function bootstrapComponentsOutside(){
    try{
      const comps = window.Components || {};
      if (comps.scatter && typeof comps.scatter.init === 'function') comps.scatter.init();
      if (comps.pca && typeof comps.pca.init === 'function') comps.pca.init();
      if (comps.box && typeof comps.box.init === 'function') comps.box.init();
      if (comps.hist && typeof comps.hist.init === 'function') comps.hist.init();
      if (comps.pie && typeof comps.pie.init === 'function') comps.pie.init();
      if (comps.line && typeof comps.line.init === 'function') comps.line.init();
      if (comps.roc && typeof comps.roc.init === 'function') comps.roc.init();
      if (comps.venn && typeof comps.venn.init === 'function') comps.venn.init();
    }catch(err){ console.error('Components bootstrap (outside) error', err); }
  })();

  // ROC curve setup
  const rocTablePanel=document.getElementById('rocTablePanel');
  const rocGraphPanel=document.getElementById('rocGraphPanel');
  const rocPanelResizer=document.getElementById('rocPanelResizer');
  const rocSvgBox=rocGraphPanel?.querySelector('.svgbox');
  const rocConfigPanel=rocGraphPanel?.querySelector('.config-options');
  let rocMinSvgWidth=0;
  function syncRocWidths(){
    const tableWidth=rocTablePanel.getBoundingClientRect().width;
    const graphWidth=rocGraphPanel.getBoundingClientRect().width;
    const configWidth=rocConfigPanel.getBoundingClientRect().width;
    const gap=parseFloat(getComputedStyle(rocGraphPanel.querySelector('.diagram-area')).gap||0);
    const available=graphWidth-configWidth-gap;
    const minW=rocMinSvgWidth||0;
    const newW=Math.max(minW, Math.min(tableWidth, available));
    if(rocSvgBox) rocSvgBox.style.width=newW+'px';
    if(window.DEBUG_ROC) console.debug('syncRocWidths',{tableWidth,graphWidth,configWidth,gap,available,newW,minW});
  }
  const rocTableObserver=new ResizeObserver(()=>{syncRocWidths();});
  rocTableObserver.observe(rocTablePanel);
  syncRocWidths();
  const rocHotContainer=document.getElementById('rocHot');
  const rocHotWrapper=document.getElementById('rocHotWrapper');
  if(window.Shared && window.Shared.ensureHotWrapperStyles){ window.Shared.ensureHotWrapperStyles(rocHotWrapper); }
  console.debug('rocHotWrapper style updated', rocHotWrapper.style.cssText);
  const rocData=Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,ROC_DEFAULT_COLS);
  const rocHot=new Handsontable(rocHotContainer,{
    data:rocData,
    rowHeaders(index){const label=index===0?'':index; if(window.DEBUG_ROC) console.debug('roc rowHeader',{index,label}); return label;},
    colHeaders:true,
    minRows:DEFAULT_ROWS,
    minCols:ROC_DEFAULT_COLS,
    stretchH:'all',
    contextMenu:true,
    cells(row,col){const props={}; if(row===0){props.renderer=function(instance,td,r,c,prop,value){Handsontable.renderers.TextRenderer.apply(this,arguments); td.style.background='#e9ecef'; td.style.fontWeight='600'; td.title='Header (first row)';};} return props;},
    licenseKey:'non-commercial-and-evaluation',
    afterChange:(changes,source)=>{if(changes){if(window.DEBUG_ROC) console.log('roc afterChange',{count:changes.length,source}); scheduleDrawRoc();}},
    afterCreateRow:()=>{if(window.DEBUG_ROC) console.log('roc row created'); scheduleDrawRoc();},
    afterCreateCol:()=>{if(window.DEBUG_ROC) console.log('roc col created'); scheduleDrawRoc();},
    afterRemoveRow:()=>{if(window.DEBUG_ROC) console.log('roc row removed'); scheduleDrawRoc();},
    afterRemoveCol:()=>{if(window.DEBUG_ROC) console.log('roc col removed'); scheduleDrawRoc();},
    afterUndo:()=>{if(window.DEBUG_ROC) console.log('roc undo'); scheduleDrawRoc();},
    afterRedo:()=>{if(window.DEBUG_ROC) console.log('roc redo'); scheduleDrawRoc();},
  });
  if(window.DEBUG_ROC) console.log('rocHot initialized',{rows:DEFAULT_ROWS,cols:ROC_DEFAULT_COLS});
  window.DEBUG_ROC=true;
  const rocExample=[
    ['Label','Model1','Model2','Model3'],
    [1,0.98,0.9,0.88],
    [0,0.95,0.4,0.3],
    [1,0.93,0.85,0.76],
    [0,0.9,0.35,0.25],
    [1,0.88,0.8,0.68],
    [0,0.85,0.3,0.2],
    [1,0.82,0.75,0.6],
    [0,0.8,0.25,0.15],
    [1,0.78,0.7,0.55],
    [0,0.75,0.2,0.1],
    [1,0.72,0.65,0.5],
    [0,0.7,0.15,0.08],
    [1,0.68,0.6,0.45],
    [0,0.65,0.1,0.06],
    [1,0.62,0.55,0.4],
    [0,0.6,0.08,0.04],
    [1,0.58,0.5,0.35],
    [0,0.55,0.06,0.03],
    [1,0.52,0.45,0.3],
    [0,0.5,0.04,0.02],
    [1,0.48,0.4,0.25],
    [0,0.45,0.02,0.01]
  ];
  document.getElementById('rocLoadExample').addEventListener('click',()=>{rocHot.loadData(rocExample); if(window.DEBUG_ROC) console.log('roc example loaded'); scheduleDrawRoc();});
  document.getElementById('rocImport').addEventListener('click',()=>{document.getElementById('rocFile').click();});
  document.getElementById('rocFile').addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    if(window.DEBUG_ROC) console.log('roc file selected',file.name);
    const name=file.name.toLowerCase();
    if(name.endsWith('.csv')||name.endsWith('.tsv')||name.endsWith('.txt')){
      const reader=new FileReader();
      reader.onload=ev=>{const text=ev.target.result; const rows=text.split(/\r?\n/).map(r=>r.split(name.endsWith('.tsv')?'\t':',')); rocProcessImportedRows(rows);};
      reader.readAsText(file);
    }else{
      const reader=new FileReader();
      reader.onload=ev=>{try{const data=new Uint8Array(ev.target.result); const wb=XLSX.read(data,{type:'array'}); const sheet=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1}); rocProcessImportedRows(sheet);}catch(err){console.error('roc import error',err);}};
      reader.readAsArrayBuffer(file);
    }
  });
  rocHotContainer.addEventListener('paste',async e=>{
    e.preventDefault();
    e.stopPropagation();
    let text=e.clipboardData?.getData('text/plain');
    if(!text){
      try{ text=await navigator.clipboard.readText(); }
      catch(err){ if(window.DEBUG_ROC) console.log('roc clipboard read failed',err); return; }
    }
    const rowArr=text.split(/\r?\n/);
    if(rowArr.length<2 && !text.includes('\t') && !text.includes(',')) return;
    const delim=text.includes('\t')?'\t':',';
    const rows=rowArr.map(r=>r.split(delim));
    rocProcessImportedRows(rows);
  });
  const rocPlotDiv=document.getElementById('rocPlot');
  const rocContainer=rocPlotDiv.closest('.svgbox')||rocPlotDiv.parentElement;
  (function initRocResizers(){
    if(!rocContainer) return;
    if(window.Shared && window.Shared.attachResizableBox){
      window.Shared.attachResizableBox(rocContainer, { onResize: () => scheduleDrawRoc() });
    }
  })();
  (function initRocPanelResizer(){
    if(!rocPanelResizer||!rocTablePanel||!rocGraphPanel) return;
    rocPanelResizer.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const startX=e.clientX;
      const startTable=rocTablePanel.getBoundingClientRect().width;
      const startGraph=rocGraphPanel.getBoundingClientRect().width;
      const configWidth=rocConfigPanel.getBoundingClientRect().width;
      const gap=parseFloat(getComputedStyle(rocGraphPanel.querySelector('.diagram-area')).gap||0);
      rocMinSvgWidth=rocSvgBox.getBoundingClientRect().width*0.5;
      const minGraph=configWidth+gap+rocMinSvgWidth;
      const total=startTable+startGraph;
      if(window.DEBUG_ROC) console.debug('roc resizer start',{startTable,startGraph,configWidth,gap,rocMinSvgWidth,minGraph,total});
      function onMove(ev){
        const dx=ev.clientX-startX;
        let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx));
        let newGraph=total-newTable;
        rocTablePanel.style.flex=`0 0 ${newTable}px`;
        rocGraphPanel.style.flex=`0 0 ${newGraph}px`;
        syncRocWidths();
        if(window.DEBUG_ROC) console.debug('roc resizer move',{dx,newTable,newGraph});
      }
      function onUp(){
        document.removeEventListener('pointermove',onMove);
        document.removeEventListener('pointerup',onUp);
        if(window.DEBUG_ROC) console.debug('roc resizer end');
      }
      document.addEventListener('pointermove',onMove);
      document.addEventListener('pointerup',onUp);
    });
  })();
  function rocProcessImportedRows(rows,startRow=0,startCol=0){
    if(!rows||!rows.length) return;
    rows=rows.filter(r=>r&&r.some(c=>String(c).trim()!==''));
    if(!rows.length) return;
    const colCount=Math.max(2,...rows.map(r=>r.length));
    const rowCount=rows.length;
    const curRows=rocHot.countRows();
    const curCols=rocHot.countCols();
    const targetRows=Math.max(DEFAULT_ROWS,curRows,startRow+rowCount);
    const targetCols=Math.max(curCols,startCol+colCount,ROC_DEFAULT_COLS);
    if(window.DEBUG_ROC) console.log('rocProcessImportedRows targets',{targetRows,targetCols});
    const data=Array.from({length:targetRows},(_,r)=>Array(targetCols).fill(''));
    const existing=rocHot.getData();
    for(let r=0;r<curRows;r++){
      for(let c=0;c<curCols;c++) data[r][c]=existing[r][c];
    }
    for(let r=0;r<rowCount;r++){
      for(let c=0;c<rows[r].length;c++) data[startRow+r][startCol+c]=rows[r][c];
    }
    rocHot.updateSettings({data,minRows:targetRows,minCols:targetCols});
  }
  const rocBorderWidth=$('#rocBorderWidth');
  const rocShowGrid=$('#rocShowGrid');
  const rocFontSize=$('#rocFontSize'), rocFontSizeVal=$('#rocFontSizeVal');
  const rocLabelColorsDiv=$('#rocLabelColors');
  const rocLabelColorsFieldset=$('#rocLabelColorsFieldset');
  const rocGraphType=$('#rocGraphType');
  let rocLabelColors={};
  rocFontSize.addEventListener('input',()=>{rocFontSizeVal.textContent=rocFontSize.value; scheduleDrawRoc();});
  rocBorderWidth.addEventListener('input',()=>{if(window.DEBUG_ROC) console.log('rocBorderWidth changed',rocBorderWidth.value); scheduleDrawRoc();});
  rocShowGrid.addEventListener('change',()=>{if(window.DEBUG_ROC) console.log('rocShowGrid changed',rocShowGrid.checked); scheduleDrawRoc();});
  rocGraphType.addEventListener('change',()=>{if(window.DEBUG_ROC) console.log('rocGraphType changed',rocGraphType.value); renderRocStatsControls(); scheduleDrawRoc();});
  function renderRocStatsControls(){
    if(!rocStatsControls) return;
    rocStatsControls.innerHTML='';
    const label=document.createElement('label');
    label.textContent='Diff method:';
    rocStatsControls.appendChild(label);
    const sel=document.createElement('select');
    const opts=rocGraphType.value==='roc'?[['delong','DeLong'],['bootstrap','Bootstrap']]:[['bootstrap','Bootstrap'],['permutation','Permutation']];
    if(!opts.some(o=>o[0]===rocDiffMethod)) rocDiffMethod=opts[0][0];
    opts.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;if(v===rocDiffMethod) o.selected=true;sel.appendChild(o);});
    sel.addEventListener('change',()=>{rocDiffMethod=sel.value;if(window.DEBUG_ROC) console.log('rocDiffMethod changed',rocDiffMethod); scheduleDrawRoc();});
    rocStatsControls.appendChild(sel);
    rocCompareLabel=document.createElement('label');
    rocCompareLabel.textContent='Compare:';
    rocStatsControls.appendChild(rocCompareLabel);
    rocCompareSel=document.createElement('select');
    rocCompareSel.addEventListener('change',()=>{if(window.DEBUG_ROC) console.log('rocCompareSel changed',rocCompareSel.value); scheduleDrawRoc();});
    rocStatsControls.appendChild(rocCompareSel);
    rocCompareResult=document.createElement('span');
    rocCompareResult.style.marginLeft='4px';
    rocStatsControls.appendChild(rocCompareResult);
    if(window.DEBUG_ROC) console.log('renderRocStatsControls',{graphType:rocGraphType.value,diffMethod:rocDiffMethod});
  }
  renderRocStatsControls();
  function updateRocLabelColorPickers(labels){
    rocLabelColorsDiv.innerHTML='';
    Object.keys(rocLabelColors).forEach(k=>{if(!labels.includes(k)) delete rocLabelColors[k];});
    labels.forEach((lab,i)=>{
      if(!rocLabelColors[lab]) rocLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
      const input=document.createElement('input');
      input.type='color';
      input.value=rocLabelColors[lab];
      attachColorPickerNear(input);
      input.addEventListener('input',e=>{rocLabelColors[lab]=e.target.value; scheduleDrawRoc();});
      const lbl=document.createElement('label');
      lbl.appendChild(input);
      lbl.appendChild(document.createTextNode(lab));
      rocLabelColorsDiv.appendChild(lbl);
    });
    rocLabelColorsFieldset.style.display=labels.length?'':'none';
    if(window.DEBUG_ROC) console.log('updateRocLabelColorPickers',{labels,colors:rocLabelColors});
  }
  function computeCurveMetric(pairs,graphType){
    const arr=pairs.slice().sort((a,b)=>b.score-a.score);
    let tp=0,fp=0,auc=0,ap=0;
    const P=arr.filter(p=>p.label===1).length;
    const N=arr.length-P;
    let prevRec=0,prevPrec=1,prevFpr=0,prevTpr=0;
    for(const p of arr){
      if(p.label===1) tp++; else fp++;
      if(graphType==='roc'){
        const fpr=fp/Math.max(1,N); const tpr=tp/Math.max(1,P);
        auc+=(fpr-prevFpr)*(tpr+prevTpr)/2; prevFpr=fpr; prevTpr=tpr;
      }else{
        const rec=tp/Math.max(1,P); const prec=tp/Math.max(1,tp+fp);
        auc+=(rec-prevRec)*(prec+prevPrec)/2; ap+=(rec-prevRec)*prec; prevRec=rec; prevPrec=prec;
      }
    }
    if(graphType==='roc') return auc;
    return ap;
  }
  function bootstrapCurveTest(pairs,baseline,graphType,iters=200){
    let count=0; const n=pairs.length;
    for(let b=0;b<iters;b++){
      const sample=Array.from({length:n},()=>pairs[Math.floor(Math.random()*n)]);
      const m=computeCurveMetric(sample,graphType);
      if(m<=baseline) count++;
    }
    const p=(count+1)/(iters+1);
    if(window.DEBUG_ROC) console.debug('bootstrapCurveTest',{baseline,graphType,iters,p});
    return p;
  }
  function bootstrapCurveDiff(pairs1,pairs2,graphType,iters=200){
    const n=pairs1.length; const diffs=[];
    const baseDiff=computeCurveMetric(pairs1,graphType)-computeCurveMetric(pairs2,graphType);
    for(let b=0;b<iters;b++){
      const s1=[],s2=[];
      for(let i=0;i<n;i++){const idx=Math.floor(Math.random()*n); s1.push(pairs1[idx]); s2.push(pairs2[idx]);}
      diffs.push(computeCurveMetric(s1,graphType)-computeCurveMetric(s2,graphType));
    }
    const count=diffs.filter(d=>Math.abs(d)>=Math.abs(baseDiff)).length;
    diffs.sort((a,b)=>a-b);
    const lower=diffs[Math.floor(0.025*iters)] ?? diffs[0];
    const upper=diffs[Math.floor(0.975*iters)] ?? diffs[diffs.length-1];
    const p=(count+1)/(iters+1);
    if(window.DEBUG_ROC) console.debug('bootstrapCurveDiff',{graphType,iters,p,ci:[lower,upper]});
    return {p,ci:[lower,upper],diff:baseDiff};
  }
  function permutationCurveDiff(pairs1,pairs2,graphType,iters=200){
    const n=pairs1.length;
    const baseDiff=computeCurveMetric(pairs1,graphType)-computeCurveMetric(pairs2,graphType);
    let count=0;
    for(let b=0;b<iters;b++){
      const s1=[],s2=[];
      for(let i=0;i<n;i++){
        if(Math.random()<0.5){s1.push(pairs1[i]); s2.push(pairs2[i]);}
        else{s1.push({label:pairs1[i].label,score:pairs2[i].score}); s2.push({label:pairs2[i].label,score:pairs1[i].score});}
      }
      const diff=computeCurveMetric(s1,graphType)-computeCurveMetric(s2,graphType);
      if(Math.abs(diff)>=Math.abs(baseDiff)) count++;
    }
    const p=(count+1)/(iters+1);
    if(window.DEBUG_ROC) console.debug('permutationCurveDiff',{graphType,iters,p});
    return {p,diff:baseDiff};
  }
  function delongCurveDiff(pairs1,pairs2){
    const pos1=pairs1.filter(p=>p.label===1).map(p=>p.score);
    const neg1=pairs1.filter(p=>p.label===0).map(p=>p.score);
    const pos2=pairs2.filter(p=>p.label===1).map(p=>p.score);
    const neg2=pairs2.filter(p=>p.label===0).map(p=>p.score);
    const m=pos1.length, n=neg1.length;
    function calcV(pos,neg){
      const V10=[], V01=[];
      for(const ps of pos){let lt=0,eq=0;for(const ns of neg){if(ps>ns) lt++; else if(ps===ns) eq++;}V10.push((lt+0.5*eq)/neg.length);}
      for(const ns of neg){let gt=0,eq=0;for(const ps of pos){if(ps>ns) gt++; else if(ps===ns) eq++;}V01.push((gt+0.5*eq)/pos.length);}
      const auc=V10.reduce((a,b)=>a+b,0)/pos.length;
      return {V10,V01,auc};
    }
    const a1=calcV(pos1,neg1), a2=calcV(pos2,neg2);
    function cov(a,b){const meanA=jStat.mean(a),meanB=jStat.mean(b);let s=0;for(let i=0;i<a.length;i++){s+=(a[i]-meanA)*(b[i]-meanB);}return s/(a.length-1);}
    const s10=[[cov(a1.V10,a1.V10),cov(a1.V10,a2.V10)],[cov(a2.V10,a1.V10),cov(a2.V10,a2.V10)]];
    const s01=[[cov(a1.V01,a1.V01),cov(a1.V01,a2.V01)],[cov(a2.V01,a1.V01),cov(a2.V01,a2.V01)]];
    const var1=s10[0][0]/m + s01[0][0]/n;
    const var2=s10[1][1]/m + s01[1][1]/n;
    const covar=s10[0][1]/m + s01[0][1]/n;
    const diff=a1.auc-a2.auc;
    const varDiff=var1+var2-2*covar;
    const sd=Math.sqrt(varDiff);
    const z=diff/sd;
    const p=2*(1-jStat.normal.cdf(Math.abs(z),0,1));
    const ci=[diff-1.96*sd,diff+1.96*sd];
    if(window.DEBUG_ROC) console.debug('delongCurveDiff',{diff,p,ci});
    return {p,diff,ci};
  }
  async function drawRoc(){
    const token=++rocDrawToken; if(window.DEBUG_ROC) console.log('drawRoc called',{token});
    const graphType=rocGraphType.value;
    if(window.DEBUG_ROC) console.log('drawRoc graphType',graphType);
    const bw=Number(rocBorderWidth.value)||2;
    const showGrid=rocShowGrid.checked;
    const fs=Number(rocFontSize.value)||16;
    const data=rocHot.getData(); if(!data||!data.length) return;
    const header=data[0]||[];
    let labelIndex=header.findIndex(h=>String(h).trim().toLowerCase()==='label');
    if(labelIndex<0) labelIndex=0;
    const labels=data.slice(1).map(r=>parseFloat(r[labelIndex]));
    const Ptotal=labels.filter(l=>!isNaN(l)&&l>0).length;
    const Ntotal=labels.filter(l=>!isNaN(l)&&l<=0).length;
    if(window.DEBUG_ROC) console.log('label counts',{Ptotal,Ntotal});
    const scoreCols=header.map((_,i)=>i).filter(i=>i!==labelIndex && header[i]!=null && String(header[i]).trim()!=='');
    const series=scoreCols.map((ci,i)=>({name:header[ci]||`Model ${i+1}`, scores:data.slice(1).map(r=>parseFloat(r[ci]))}));
    const legendLabels=series.map(s=>s.name);
    updateRocLabelColorPickers(legendLabels);
    const legendWidth=legendLabels.length?120:0;
    if(rocCompareSel){
      const prevVal=rocCompareSel.value;
      rocCompareSel.innerHTML='';
      const pairOpts=[];
      for(let i=0;i<series.length;i++){
        for(let j=i+1;j<series.length;j++){
          const val=`${i},${j}`;
          const opt=document.createElement('option');
          opt.value=val; opt.textContent=`${series[i].name} vs ${series[j].name}`;
          rocCompareSel.appendChild(opt); pairOpts.push(val);
        }
      }
      if(prevVal && pairOpts.includes(prevVal)) rocCompareSel.value=prevVal;
      else if(pairOpts.length) rocCompareSel.value=pairOpts[0];
      const display=pairOpts.length?'':'none';
      rocCompareSel.style.display=display;
      if(rocCompareLabel) rocCompareLabel.style.display=display;
      if(rocCompareResult) rocCompareResult.style.display=display;
      if(window.DEBUG_ROC) console.log('roc pair options',{pairOpts});
    }
    const plotEl=document.getElementById('rocPlot');
    plotEl.style.display='block';
    while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
    const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
    plotEl.style.position='relative';
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('id','rocSvg');
    svg.setAttribute('width',String(W));
    svg.setAttribute('height',String(H));
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    svg.setAttribute('font-family','sans-serif');
    plotEl.appendChild(svg);
    const margin={top:Math.max(32,Math.round(fs*2.2)),right:20+legendWidth,bottom:Math.max(32,Math.round(fs*2.2))+fs+6,left:Math.max(48,Math.round(fs*3.0))};
    const plotW=Math.max(20,W-margin.left-margin.right);
    const plotH=Math.max(20,H-margin.top-margin.bottom);
    const x2px=v=>margin.left+plotW*v;
    const y2px=v=>margin.top+plotH*(1-v);
    function add(tag,attrs,txt){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(txt!=null)el.textContent=txt;svg.appendChild(el);return el;}
    const ticks=[0,0.2,0.4,0.6,0.8,1];
    if(showGrid){ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':1});});ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':1});});}
    add('line',{x1:margin.left,y1:margin.top+plotH,x2:margin.left+plotW,y2:margin.top+plotH,stroke:'#000','stroke-width':1});
    add('line',{x1:margin.left,y1:margin.top,x2:margin.left,y2:margin.top+plotH,stroke:'#000','stroke-width':1});
    if(graphType==='roc'){
      add('line',{x1:margin.left,y1:margin.top+plotH,x2:margin.left+plotW,y2:margin.top,stroke:'#888','stroke-dasharray':'4,4','stroke-width':1});
    }else{
      const base=Ptotal/Math.max(1,Ptotal+Ntotal);
      add('line',{x1:margin.left,y1:y2px(base),x2:margin.left+plotW,y2:y2px(base),stroke:'#888','stroke-dasharray':'4,4','stroke-width':1});
      if(window.DEBUG_ROC) console.log('pr baseline',base);
    }
    ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top+plotH,x2:x,y2:margin.top+plotH+6,stroke:'#000','stroke-width':1});add('text',{x:x,y:margin.top+plotH+fs+6,'text-anchor':'middle','font-size':fs},t);});
    ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left-6,y1:y,x2:margin.left,y2:y,stroke:'#000','stroke-width':1});add('text',{x:margin.left-8,y:y+fs/2,'text-anchor':'end','font-size':fs},t);});
    add('text',{x:margin.left+plotW/2,y:H-6,'text-anchor':'middle','font-size':fs+2},graphType==='roc'?'False Positive Rate':'Recall');
    add('text',{x:14,y:margin.top+plotH/2,'text-anchor':'middle','font-size':fs+2,transform:`rotate(-90 14 ${margin.top+plotH/2})`},graphType==='roc'?'True Positive Rate':'Precision');
    const rocStats=[]; const allPairs=[];
    series.forEach((s,si)=>{
      const pairs=[];
      for(let i=0;i<labels.length;i++){const lab=labels[i]; const score=s.scores[i]; if(!isNaN(lab)&&!isNaN(score)) pairs.push({label:lab>0?1:0,score});}
      pairs.sort((a,b)=>b.score-a.score);
      let tp=0, fp=0;
      const P=pairs.filter(p=>p.label===1).length;
      const N=pairs.length-P;
      let pts;
      if(graphType==='roc'){
        pts=[{fpr:0,tpr:0}];
        pairs.forEach(p=>{if(p.label===1) tp++; else fp++; pts.push({fpr:fp/Math.max(1,N), tpr:tp/Math.max(1,P)});});
        pts.push({fpr:1,tpr:1});
      }else{
        pts=[{recall:0,precision:1}];
        pairs.forEach(p=>{if(p.label===1) tp++; else fp++; const rec=tp/Math.max(1,P); const prec=tp/Math.max(1,tp+fp); pts.push({recall:rec, precision:prec});});
      }
      let auc=0, ap=0;
      for(let i=1;i<pts.length;i++){
        if(graphType==='roc'){
          const x1=pts[i-1].fpr,y1=pts[i-1].tpr,x2=pts[i].fpr,y2=pts[i].tpr;
          auc+=(x2-x1)*(y1+y2)/2;
        }else{
          const x1=pts[i-1].recall,y1=pts[i-1].precision,x2=pts[i].recall,y2=pts[i].precision;
          auc+=(x2-x1)*(y1+y2)/2;
          ap+=(x2-x1)*y2;
        }
      }
      const avgPrecision=graphType==='pr'?ap:undefined;
      if(window.DEBUG_ROC && graphType==='pr') console.log('average precision computed',{name:s.name,avgPrecision});
      let best={thr:Infinity,accuracy:0,precision:0,recall:0,f1:0};
      let tp2=0,fp2=0,tn2=N,fn2=P;
      for(let i=0;i<pairs.length;){
        const thr=pairs[i].score;
        while(i<pairs.length && pairs[i].score===thr){
          const p=pairs[i++];
          if(p.label===1){tp2++; fn2--;} else {fp2++; tn2--;}
        }
        const accuracy=(tp2+tn2)/Math.max(1,pairs.length);
        const precision=tp2/Math.max(1,tp2+fp2);
        const recall=tp2/Math.max(1,tp2+fn2);
        const f1=precision+recall>0?2*precision*recall/(precision+recall):0;
        if(f1>best.f1) best={thr,accuracy,precision,recall,f1};
      }
      if(window.DEBUG_ROC) console.log('roc metrics computed',{name:s.name,auc,avgPrecision,best});
      const base=graphType==='roc'?0.5:Ptotal/Math.max(1,Ptotal+Ntotal);
      const pVal=bootstrapCurveTest(pairs,base,graphType);
      if(window.DEBUG_ROC) console.log('roc significance',{name:s.name,pVal});
      rocStats.push({name:s.name,auc,thr:best.thr,accuracy:best.accuracy,precision:best.precision,recall:best.recall,f1:best.f1,avgPrecision,pVal});
      allPairs.push(pairs);
      const color=rocLabelColors[s.name]||DEFAULT_SCATTER_COLORS[si%DEFAULT_SCATTER_COLORS.length];
      let d=''; pts.forEach((p,i)=>{const x=x2px(graphType==='roc'?p.fpr:p.recall),y=y2px(graphType==='roc'?p.tpr:p.precision); d+=(i?'L':'M')+x+' '+y;});
      if(window.DEBUG_ROC) console.log('roc points',{name:s.name,pts});
      add('path',{d,fill:'none',stroke:color,'stroke-width':bw});
    });
    const legendX=W-legendWidth+10;
    legendLabels.forEach((lab,i)=>{const y=margin.top+10+i*(fs+6); const color=rocLabelColors[lab]||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]; add('rect',{x:legendX,y:y-10,width:12,height:12,fill:color}); add('text',{x:legendX+16,y:y,'font-size':fs},lab);});
    let html=rocStats.map(a=>`${a.name}: AUC = ${a.auc.toFixed(3)}, ${graphType==='pr'?`AP = ${a.avgPrecision.toFixed(3)}, `:''}p = ${formatP(a.pVal)}, Thr = ${Number.isFinite(a.thr)?a.thr.toFixed(3):'NA'}, Acc = ${(a.accuracy*100).toFixed(1)}%, Prec = ${(a.precision*100).toFixed(1)}%, Recall = ${(a.recall*100).toFixed(1)}%, F1 = ${(a.f1*100).toFixed(1)}%`).join('<br>');
    rocStatsResults.innerHTML=html;
    if(series.length>=2 && rocCompareSel && rocCompareSel.value){
      const [i,j]=rocCompareSel.value.split(',').map(Number);
      let diffRes;
      if(graphType==='roc' && rocDiffMethod==='delong'){
        diffRes=delongCurveDiff(allPairs[i],allPairs[j]);
        rocCompareResult.textContent=`ΔAUC = ${diffRes.diff.toFixed(3)}, p = ${formatP(diffRes.p)}, CI = [${diffRes.ci[0].toFixed(3)}, ${diffRes.ci[1].toFixed(3)}]`;
      }else if(rocDiffMethod==='bootstrap'){
        diffRes=bootstrapCurveDiff(allPairs[i],allPairs[j],graphType);
        const metric=graphType==='roc'? 'ΔAUC':'ΔAP';
        rocCompareResult.textContent=`${metric} = ${diffRes.diff.toFixed(3)}, p = ${formatP(diffRes.p)}, CI = [${diffRes.ci[0].toFixed(3)}, ${diffRes.ci[1].toFixed(3)}]`;
      }else if(rocDiffMethod==='permutation'){
        diffRes=permutationCurveDiff(allPairs[i],allPairs[j],graphType);
        const metric=graphType==='roc'? 'ΔAUC':'ΔAP';
        rocCompareResult.textContent=`${metric} = ${diffRes.diff.toFixed(3)}, p = ${formatP(diffRes.p)}`;
      }
      if(window.DEBUG_ROC) console.log('roc pairwise diff',{pair:[series[i].name,series[j].name],diffRes});
    }else if(rocCompareResult){
      rocCompareResult.textContent='';
    }
  }
  document.getElementById('rocPNG').addEventListener('click',async()=>{
    const svgEl=document.getElementById('rocSvg');
    if(!svgEl) return;
    const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800;
    const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
    const xml=serializeCleanSVG(svgEl);
    const img=new Image();
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
    await img.decode().catch(err=>{console.error('rocPNG svg decode',err);});
    const canvas=document.createElement('canvas');
    canvas.width=W; canvas.height=H;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0);
    canvas.toBlob(b=>{const url=URL.createObjectURL(b); const a=document.createElement('a'); a.href=url; a.download='roc.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);},'image/png');
  });
  document.getElementById('rocSVG').addEventListener('click',()=>{
    const svgEl=document.getElementById('rocSvg');
    if(!svgEl) return;
    const xml=serializeCleanSVG(svgEl);
    const blob=new Blob([xml],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='roc.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  });
  function getRocGraphPayload(){return{type:'roc',data:rocHot.getData(),config:{borderWidth:rocBorderWidth.value,showGrid:rocShowGrid.checked,fontSize:rocFontSize.value,labelColors:rocLabelColors,graphType:rocGraphType.value}};}
  let rocFileHandle=null, rocFileName='roc.graph';
  async function saveRocFile(){const payload=getRocGraphPayload(); if(rocFileHandle&&rocFileHandle.createWritable){try{const perm=await verifyPermission(rocFileHandle,true); if(perm){const w=await rocFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close();}}catch(err){console.error('saveRocFile error',err);}}else if(window.showSaveFilePicker){await saveAsRocFile();}else{downloadJSON(payload,rocFileName);}}
  async function saveAsRocFile(){const payload=getRocGraphPayload(); if(window.showSaveFilePicker){try{rocFileHandle=await window.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:rocFileName}); const w=await rocFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close();}catch(err){console.error('saveAsRocFile error',err);}}else{downloadJSON(payload,rocFileName);}}
  function loadRocGraphFile(file){const reader=new FileReader(); reader.onload=e=>{try{const obj=JSON.parse(e.target.result); if(window.DEBUG_ROC) console.log('loadRocGraph',obj); if(obj.type!=='roc') throw new Error('Invalid graph type'); rocHot.loadData(obj.data||[]); const c=obj.config||{}; rocBorderWidth.value=c.borderWidth||rocBorderWidth.value; rocShowGrid.checked=!!c.showGrid; rocFontSize.value=c.fontSize||rocFontSize.value; rocFontSizeVal.textContent=rocFontSize.value; rocLabelColors=c.labelColors||{}; rocGraphType.value=c.graphType||rocGraphType.value; scheduleDrawRoc();}catch(err){console.error('loadRocGraph error',err);}}; reader.readAsText(file);}
  async function openRocFile(){ if(window.DEBUG_ROC) console.log('openRocFile start'); if(window.showOpenFilePicker){try{[rocFileHandle]=await window.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]}); const file=await rocFileHandle.getFile(); rocFileName=file.name; loadRocGraphFile(file);}catch(err){console.error('openRocFile error',err);}}else{const input=document.getElementById('rocGraphFile'); input.value=''; input.click();}}
  document.getElementById('openRoc').addEventListener('click',openRocFile);
  document.getElementById('saveRoc').addEventListener('click',saveRocFile);
  document.getElementById('saveAsRoc').addEventListener('click',saveAsRocFile);
  document.getElementById('rocGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){rocFileName=f.name; rocFileHandle=null; loadRocGraphFile(f);}});
  // Histogram setup
  if (window.Components && window.Components.hist && window.Components.hist.__installed) {
    console.debug('Debug: skipping legacy histogram init in main.js');
  } else {
  const histHotContainer=document.getElementById('histHot');
  const histHotWrapper=document.getElementById('histHotWrapper');
  if(window.Shared && window.Shared.ensureHotWrapperStyles){ window.Shared.ensureHotWrapperStyles(histHotWrapper); }
  console.debug('histHotWrapper style updated', histHotWrapper.style.cssText);
  const histTablePanel=document.getElementById('histTablePanel');
  const histGraphPanel=document.getElementById('histGraphPanel');
  const histPanelResizer=document.getElementById('histPanelResizer');
  const histSvgBox=histGraphPanel?.querySelector('.svgbox');
  const histConfigPanel=histGraphPanel?.querySelector('.config-options');
  let histMinSvgWidth=0;
  function syncHistWidths(){
    const tableWidth=histTablePanel.getBoundingClientRect().width;
    const graphWidth=histGraphPanel.getBoundingClientRect().width;
    const configWidth=histConfigPanel.getBoundingClientRect().width;
    const gap=parseFloat(getComputedStyle(histGraphPanel.querySelector('.diagram-area')).gap||0);
    const available=graphWidth-configWidth-gap;
    const minW=histMinSvgWidth||0;
    const newW=Math.max(minW, Math.min(tableWidth, available));
    if(histSvgBox) histSvgBox.style.width=newW+'px';
    if(window.DEBUG_HIST) console.log('syncHistWidths',{tableWidth,graphWidth,configWidth,gap,available,newW,minW});
  }
  const histTableObserver=new ResizeObserver(()=>{syncHistWidths();});
  histTableObserver.observe(histTablePanel);
  syncHistWidths();
  const histPlotDiv=document.getElementById('histPlot');
  const histContainer=histPlotDiv.closest('.svgbox')||histPlotDiv.parentElement;
  const histHot=new Handsontable(histHotContainer,{
    data:Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,HIST_DEFAULT_COLS),
    rowHeaders(index){
      const label = index === 0 ? '' : index;
      console.debug('hist rowHeader', {index, label});
      return label;
    },
    colHeaders:true,
    minRows:DEFAULT_ROWS,
    minCols:HIST_DEFAULT_COLS,
    contextMenu:true,
    undo:true,
    cells(row,col){
      const props={};
      if(row===0){
        props.renderer=function(instance,td,r,c,prop,value,cellProperties){
          Handsontable.renderers.TextRenderer.apply(this,arguments);
          td.style.background='#e9ecef';
          td.style.fontWeight='600';
          td.title='Header (first row)';
        };
      }
      return props;
    },
    afterUndo:()=>{ console.log('hist undo'); scheduleDrawHist(); },
    afterRedo:()=>{ console.log('hist redo'); scheduleDrawHist(); },
    licenseKey:'non-commercial-and-evaluation',
  });
  window.DEBUG_HIST=true;
  const histExample=[
    ['Exam Score'],
    [55],
    [60],
    [65],
    [70],
    [75],
    [80],
    [85],
    [90],
    [95],
    [100]
  ];
  if(window.DEBUG_HIST) console.log('hist example dataset', histExample);
  document.getElementById('histLoadExample').addEventListener('click',()=>{
    histHot.loadData(histExample);
    console.log('hist example loaded');
    scheduleDrawHist();
  });
  document.getElementById('histImport').addEventListener('click',()=>{const f=document.getElementById('histFile');f.value='';f.click();});
  document.getElementById('histFile').addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    const ext=file.name.split('.').pop().toLowerCase();
    const reader=new FileReader();
    if(['csv','tsv','txt'].includes(ext)){
      reader.onload=ev=>{const text=ev.target.result; const delim=ext==='csv'?',' : '\\t'; const rows=text.split(/\\r?\\n/).map(r=>r.split(delim)); histProcessImportedRows(rows);};
      reader.readAsText(file);
    }else if(['xls','xlsx','ods','odg'].includes(ext)){
      reader.onload=async ev=>{
        try{
          if(!window.XLSX){
            await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='libs/xlsx.full.min.js';s.onload=()=>resolve();s.onerror=err=>reject(new Error('Failed to load XLSX script'));document.head.appendChild(s);});
          }
          const data=new Uint8Array(ev.target.result);
          const workbook=XLSX.read(data,{type:'array'});
          const sheet=workbook.Sheets[workbook.SheetNames[0]];
          let rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
          histProcessImportedRows(rows);
        }catch(err){alert('Failed to import spreadsheet: '+err.message);}
      };
      reader.readAsArrayBuffer(file);
    }else{
      alert('Unsupported file format: '+ext);
    }
  });
  histHotContainer.addEventListener('paste',async e=>{
    e.preventDefault(); e.stopPropagation();
    let text=e.clipboardData?.getData('text/plain');
    if(!text){
      try{ text=await navigator.clipboard.readText(); console.log('hist clipboard fallback used'); }
      catch(err){ console.log('hist clipboard read failed',err); return; }
    }
    const rowArr=text.split(/\\r?\\n/);
    if(rowArr.length<2 && !text.includes('\\t') && !text.includes(',')){
      console.log('hist paste ignored: insufficient data');
      return;
    }
    const delim=text.includes('\\t')?'\\t':',';
    const rows=rowArr.map(r=>r.split(delim));
    const sel=histHot.getSelectedLast();
    const startRow=sel?sel[0]:0;
    const startCol=sel?sel[1]:0;
    console.log('hist fast paste',{rows:rows.length,cols:rows[0]?.length,startRow,startCol});
    histProcessImportedRows(rows,startRow,startCol);
  },true);
  function histProcessImportedRows(rows,startRow=0,startCol=0){
    if(!rows||!rows.length) return;
    rows=rows.filter(r=>r&&r.some(c=>String(c).trim()!==''));
    if(!rows.length) return;
    const colCount=Math.max(1,...rows.map(r=>r.length));
    const rowCount=rows.length;
    const curRows=histHot.countRows();
    const curCols=histHot.countCols();
    const targetRows=Math.max(DEFAULT_ROWS,curRows,startRow+rowCount);
    const targetCols=Math.max(curCols,startCol+colCount,HIST_DEFAULT_COLS);
    const data=Array.from({length:targetRows},(_,r)=>Array(targetCols).fill(''));
    const existing=histHot.getData();
    for(let r=0;r<curRows;r++){ for(let c=0;c<curCols;c++) data[r][c]=existing[r][c]; }
    for(let r=0;r<rowCount;r++){ const row=rows[r]; for(let c=0;c<row.length;c++) data[startRow+r][startCol+c]=row[c]; }
    histHot.updateSettings({data,minRows:targetRows,minCols:targetCols});
    console.log('hist data imported',{rows:data.length,cols:targetCols});
    scheduleDrawHist();
  }
  (function initHistResizers(){
    if(!histContainer) return;
    if(window.Shared && window.Shared.attachResizableBox){
      window.Shared.attachResizableBox(histContainer, { onResize: () => scheduleDrawHist() });
    }
  })();

  // Scatter resizer on svgbox

  (function initHistPanelResizer(){
    if(!histPanelResizer||!histTablePanel||!histGraphPanel) return;
    histPanelResizer.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const startX=e.clientX;
      const startTable=histTablePanel.getBoundingClientRect().width;
      const startGraph=histGraphPanel.getBoundingClientRect().width;
      const configWidth=histConfigPanel.getBoundingClientRect().width;
      const gap=parseFloat(getComputedStyle(histGraphPanel.querySelector('.diagram-area')).gap||0);
      histMinSvgWidth=histSvgBox.getBoundingClientRect().width*0.5;
      const minGraph=configWidth+gap+histMinSvgWidth;
      const total=startTable+startGraph;
      if(window.DEBUG_HIST) console.debug('hist resizer start',{startTable,startGraph,configWidth,gap,histMinSvgWidth,minGraph,total});
      function onMove(ev){
        const dx=ev.clientX-startX;
        let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx));
        let newGraph=total-newTable;
        histTablePanel.style.flex=`0 0 ${newTable}px`;
        histGraphPanel.style.flex=`0 0 ${newGraph}px`;
        syncHistWidths();
        if(window.DEBUG_HIST) console.debug('hist resizer move',{dx,newTable,newGraph});
      }
      function onUp(){
        document.removeEventListener('pointermove',onMove);
        document.removeEventListener('pointerup',onUp);
        if(window.DEBUG_HIST) console.debug('hist resizer end');
      }
      document.addEventListener('pointermove',onMove);
      document.addEventListener('pointerup',onUp);
    });
  })();
  let histTitleText='Histogram';
  let histXLabelText='Value';
  let histYLabelText='Count';
  const histFill=$('#histFill'), histBorder=$('#histBorder'), histBorderWidth=$('#histBorderWidth'), histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize'), histFontSizeVal=$('#histFontSizeVal'), histYMin=$('#histYMin'), histYMax=$('#histYMax');
  histFontSizeVal.textContent=histFontSize.value;
  [histFill,histBorder,histBorderWidth,histBins,histShowGrid,histLogY,histYMin,histYMax].forEach(el=>el.addEventListener('input',()=>{scheduleDrawHist();}));
  histFontSize.addEventListener('input',()=>{histFontSizeVal.textContent=histFontSize.value; scheduleDrawHist();});
  async function drawHistogram(){
    const token=++histDrawToken; if(window.DEBUG_HIST) console.log('drawHistogram called',{token});
    const fill=histFill.value;
    const borderColor=histBorder.value;
    const borderWidth=Number(histBorderWidth.value)||0;
    const bins=Math.max(1,Math.floor(Number(histBins.value)||10));
    const showGrid=histShowGrid.checked;
    const logY=histLogY.checked;
    const fs=Number(histFontSize.value)||16;
    const yMinManual=parseFloat(histYMin.value);
    const yMaxManual=parseFloat(histYMax.value);
    const data=histHot.getDataAtCol(0);
    const labelRaw=data[0];
    histXLabelText=(labelRaw&&String(labelRaw).trim())||'Value';
    const values=[]; for(let i=1;i<data.length;i++){const v=parseFloat(data[i]);if(!isNaN(v)) values.push(v);}
    const plotEl=document.getElementById('histPlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    if(!values.length){ plotEl.innerHTML='<i>No data</i>'; return; }
    const xMin=Math.min(...values), xMax=Math.max(...values);
    function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);}
    function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(maxTicks-1),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};}
    const xScale=niceScale(xMin,xMax,6);
    const binWidth=(xScale.max-xScale.min)/bins || 1;
    const counts=new Array(bins).fill(0);
    values.forEach(v=>{let idx=Math.floor((v-xScale.min)/binWidth);if(idx<0)idx=0;if(idx>=bins)idx=bins-1;counts[idx]++;});
    if(window.DEBUG_HIST) console.log('hist counts',{counts,binWidth,xScale});
    let yMin=0; let yMax=Math.max(...counts);
    if(isFinite(yMinManual)) yMin=yMinManual;
    if(isFinite(yMaxManual)) yMax=yMaxManual;
    if(logY && yMin<=0) yMin=0.1;
    if(yMax===yMin) yMax=yMin+1;
    const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
    const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
    plotEl.style.position='relative';
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('id','histSvg'); svg.setAttribute('width',String(W)); svg.setAttribute('height',String(H)); svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('font-family','sans-serif');
    plotEl.appendChild(svg);
    const yMinT=logY?Math.log10(yMin):yMin, yMaxT=logY?Math.log10(yMax):yMax;
    const yScale=niceScale(yMinT,yMaxT,6);
    if(isFinite(yMinManual)) yScale.min=yMinT;
    if(isFinite(yMaxManual)) yScale.max=yMaxT;
    if(isFinite(yMinManual)||isFinite(yMaxManual)){const ticks=[];for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step;v<=yScale.max+1e-9;v+=yScale.step)ticks.push(v);yScale.ticks=ticks;}
    function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
    const measureCanvas=drawHistogram._canvas||(drawHistogram._canvas=document.createElement('canvas')); const measureCtx=measureCanvas.getContext('2d'); function measureTextWidth(text,font){measureCtx.font=font;return measureCtx.measureText(text).width;}
    const tickFont=`${fs}px sans-serif`;
    const xTickLabels=xScale.ticks.map(t=>formatTick(t));
    const yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
    const yLabelWidths=yTickLabels.map(lbl=>measureTextWidth(lbl,tickFont));
    const maxYLabelWidth=Math.max(...yLabelWidths,0);
    const yTitleFont=`${fs+4}px sans-serif`;
    const yTitleWidth=measureTextWidth(histYLabelText,yTitleFont);
    if(window.DEBUG_HIST) console.log('hist yTitleWidth',{yTitleWidth});
    const margin={top:Math.max(32,Math.round(fs*2.2)),right:20,bottom:Math.max(32,Math.round(fs*2.2))+fs+6,left:Math.max(48,Math.round(fs*3.0),maxYLabelWidth+fs,maxYLabelWidth+fs*1.5+yTitleWidth/2)};
    if(window.DEBUG_HIST) console.log('hist margin',margin);
    const plotW=Math.max(20,W-margin.left-margin.right); const plotH=Math.max(20,H-margin.top-margin.bottom);
    const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
    const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
    function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
    const tickLen=6;
    if(showGrid){yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':1});});}
    add('line',{x1:margin.left,y1:margin.top+plotH,x2:margin.left+plotW,y2:margin.top+plotH,stroke:'#000','stroke-width':1});
    add('line',{x1:margin.left,y1:margin.top,x2:margin.left,y2:margin.top+plotH,stroke:'#000','stroke-width':1});
    xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top+plotH,x2:x,y2:margin.top+plotH+tickLen,stroke:'#000','stroke-width':1});const txt=add('text',{x,y:margin.top+plotH+tickLen+fs,'font-size':fs,'text-anchor':'middle'});txt.textContent=formatTick(t);});
    yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left-tickLen,y1:y,x2:margin.left,y2:y,stroke:'#000','stroke-width':1});const txt=add('text',{x:margin.left-(tickLen+2),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle'});txt.textContent=formatTick(logY?Math.pow(10,t):t);});
    const edges=Array.from({length:bins+1},(_,i)=>xScale.min+i*binWidth);
    counts.forEach((c,i)=>{const xStart=x2px(edges[i]); const xEnd=x2px(edges[i+1]); const barW=Math.max(0,xEnd-xStart); const val=logY?Math.log10(Math.max(c,yMin)):c; const y=y2px(val); const h=margin.top+plotH-y; const rect=add('rect',{x:xStart,y,width:barW,height:h,fill:fill}); if(borderWidth>0){rect.setAttribute('stroke',borderColor);rect.setAttribute('stroke-width',borderWidth);} });
    const xText=add('text',{x:margin.left+plotW/2,y:H-6,'text-anchor':'middle','font-size':fs+4});xText.textContent=histXLabelText;makeEditable(xText,txt=>{histXLabelText=txt;});
    const yX=margin.left-(maxYLabelWidth+fs*1.5);
    const yText=add('text',{x:yX,y:margin.top+plotH/2,'dominant-baseline':'middle',transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs+4});
    yText.textContent=histYLabelText;makeEditable(yText,txt=>{histYLabelText=txt;});
    if(window.DEBUG_HIST) console.log('hist yLabel',{yX,label:histYLabelText});
    const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs+4});titleText.textContent=histTitleText;makeEditable(titleText,txt=>{histTitleText=txt;});
    updateHistStats(values);
    autoResizeSvg(svg);
    if(window.DEBUG_HIST) console.log('drawHistogram complete',{token});
  }
  document.getElementById('histPNG').addEventListener('click',async()=>{
    const svgEl=document.getElementById('histSvg'); if(!svgEl) return; console.log('histPNG export start');
    const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800; const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
    const xml=serializeCleanSVG(svgEl); const img=new Image(); const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml); img.src=url; await img.decode().catch(err=>{console.error('histPNG svg decode',err);}); const outCanvas=document.createElement('canvas'); outCanvas.width=W; outCanvas.height=H; const ctx=outCanvas.getContext('2d'); ctx.drawImage(img,0,0); outCanvas.toBlob(b=>{const pngUrl=URL.createObjectURL(b); const a=document.createElement('a'); a.href=pngUrl; a.download='histogram.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(pngUrl),4000);},'image/png');
  });
  document.getElementById('histSVG').addEventListener('click',()=>{
    const svgEl=document.getElementById('histSvg'); if(!svgEl) return; console.log('histSVG export start');
    const xml=serializeCleanSVG(svgEl); const blob=new Blob([xml],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='histogram.svg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
  });
  function getHistGraphPayload(){return{type:'hist',data:histHot.getData(),config:{title:histTitleText,xLabel:histXLabelText,yLabel:histYLabelText,fill:histFill.value,border:histBorder.value,borderWidth:histBorderWidth.value,bins:histBins.value,showGrid:histShowGrid.checked,logY:histLogY.checked,fontSize:histFontSize.value,yMin:histYMin.value,yMax:histYMax.value}};}
  let histFileHandle=null,histFileName='histogram.graph';
  async function saveHistFile(){const payload=getHistGraphPayload(); console.log('saveHistFile',{payload,histFileHandle}); if(histFileHandle&&histFileHandle.createWritable){try{const perm=await verifyPermission(histFileHandle,true); console.log('saveHistFile permission',perm); if(perm){const w=await histFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close();}}catch(err){console.error('saveHistFile error',err);}}else if(window.showSaveFilePicker){console.log('saveHistFile no handle - invoking saveAs'); await saveAsHistFile();}else{console.log('saveHistFile fallback download'); downloadJSON(payload,histFileName);} }
  async function saveAsHistFile(){const payload=getHistGraphPayload(); console.log('saveAsHistFile',payload); if(window.showSaveFilePicker){try{histFileHandle=await window.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:histFileName}); const w=await histFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close();}catch(err){console.error('saveAsHistFile error',err);}}else{downloadJSON(payload,'histogram.graph');}}
  async function openHistFile(){console.log('openHistFile start'); if(window.showOpenFilePicker){try{[histFileHandle]=await window.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]}); const file=await histFileHandle.getFile(); histFileName=file.name; loadHistGraphFile(file);}catch(err){console.error('openHistFile error',err);}}else{const input=document.getElementById('histGraphFile'); input.value=''; input.click();}}
  function loadHistGraphFile(file){const reader=new FileReader(); reader.onload=e=>{try{const obj=JSON.parse(e.target.result); console.log('loadHistGraph',obj); if(obj.type!=='hist') throw new Error('Invalid graph type'); histHot.loadData(obj.data||[]); const c=obj.config||{}; histTitleText=c.title||histTitleText; histXLabelText=c.xLabel||histXLabelText; histYLabelText=c.yLabel||histYLabelText; histFill.value=c.fill||histFill.value; histBorder.value=c.border||histBorder.value; histBorderWidth.value=c.borderWidth||histBorderWidth.value; histBins.value=c.bins||histBins.value; histShowGrid.checked=!!c.showGrid; histLogY.checked=!!c.logY; histFontSize.value=c.fontSize||histFontSize.value; histFontSizeVal.textContent=histFontSize.value; histYMin.value=c.yMin||''; histYMax.value=c.yMax||''; scheduleDrawHist();}catch(err){console.error('loadHistGraph error',err);}}; reader.readAsText(file);}
  document.getElementById('openHist').addEventListener('click',openHistFile);
  document.getElementById('saveHist').addEventListener('click',saveHistFile);
  document.getElementById('saveAsHist').addEventListener('click',saveAsHistFile);
  document.getElementById('histGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){histFileName=f.name; histFileHandle=null; loadHistGraphFile(f);}});

  }
  // Proportion graph setup
  if (window.Components && window.Components.pie && window.Components.pie.__installed) {
    console.debug('Debug: skipping legacy pie init in main.js');
  } else {
  const pieHotContainer=document.getElementById('pieHot');
  const pieHotWrapper=document.getElementById('pieHotWrapper');
  if(window.Shared && window.Shared.ensureHotWrapperStyles){ window.Shared.ensureHotWrapperStyles(pieHotWrapper); }
  console.debug('pieHotWrapper style updated', pieHotWrapper.style.cssText);
  const pieTablePanel=document.getElementById('pieTablePanel');
  const pieGraphPanel=document.getElementById('pieGraphPanel');
  const piePanelResizer=document.getElementById('piePanelResizer');
  const pieSvgBox=pieGraphPanel?.querySelector('.svgbox');
  const pieConfigPanel=pieGraphPanel?.querySelector('.config-options');
  let pieMinSvgWidth=0;
  function syncPieWidths(){
    const tableWidth=pieTablePanel.getBoundingClientRect().width;
    const graphWidth=pieGraphPanel.getBoundingClientRect().width;
    const configWidth=pieConfigPanel.getBoundingClientRect().width;
    const gap=parseFloat(getComputedStyle(pieGraphPanel.querySelector('.diagram-area')).gap||0);
    const available=graphWidth-configWidth-gap;
    const minW=pieMinSvgWidth||0;
    const newW=Math.max(minW, Math.min(tableWidth, available));
    if(pieSvgBox) pieSvgBox.style.width=newW+'px';
    console.debug('syncPieWidths',{tableWidth,graphWidth,configWidth,gap,available,newW,minW});
    scheduleDrawPie();
  }
  const pieTableObserver=new ResizeObserver(()=>{syncPieWidths();});
  pieTableObserver.observe(pieTablePanel);
  syncPieWidths();
  const piePlotDiv=document.getElementById('piePlot');
  const pieContainer=piePlotDiv.closest('.svgbox')||piePlotDiv.parentElement;
  (function initPieResizers(){
    if(!pieContainer) return;
    if(window.Shared && window.Shared.attachResizableBox){
      window.Shared.attachResizableBox(pieContainer, { onResize: () => scheduleDrawPie() });
    }
  })();
  const pieHot=new Handsontable(pieHotContainer,{
    data:Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,PIE_DEFAULT_COLS),
    rowHeaders(index){
      const label = index === 0 ? '' : index;
      console.debug('pie rowHeader', {index, label});
      return label;
    },
    colHeaders:true,
    minRows:DEFAULT_ROWS,
    minCols:PIE_DEFAULT_COLS,
    contextMenu:true,
    undo:true,
    cells(row,col){
      const props={};
      if(row===0){
        props.renderer=function(instance,td,r,c,prop,value,cellProperties){
          Handsontable.renderers.TextRenderer.apply(this,arguments);
          td.style.background='#e9ecef';
          td.style.fontWeight='600';
          td.title='Header (first row)';
        };
      }
      return props;
    },
    afterChange(changes,source){ if(changes){ console.log('pie afterChange',{count:changes.length,source}); scheduleDrawPie(); } },
    afterUndo:()=>{ console.log('pie undo'); scheduleDrawPie(); },
    afterRedo:()=>{ console.log('pie redo'); scheduleDrawPie(); },
    licenseKey:'non-commercial-and-evaluation',
  });
  window.DEBUG_PIE=true;
  const pieExample=[
    ['Quarter','Observed','Expected'],
    ['Q1',120,100],
    ['Q2',90,100],
    ['Q3',60,80],
    ['Q4',130,120]
  ];
  if(window.DEBUG_PIE) console.log('pie example dataset', pieExample);
  document.getElementById('pieLoadExample').addEventListener('click',()=>{
    pieHot.loadData(pieExample);
    console.log('pie example loaded with expected values');
    scheduleDrawPie();
  });
  document.getElementById('pieImport').addEventListener('click',()=>{const f=document.getElementById('pieFile');f.value='';f.click();});
  document.getElementById('pieFile').addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    const ext=file.name.split('.').pop().toLowerCase();
    const reader=new FileReader();
    if(['csv','tsv','txt'].includes(ext)){
      reader.onload=ev=>{const text=ev.target.result; const delim=ext==='csv'?',' : '\t'; const rows=text.split(/\r?\n/).map(r=>r.split(delim)); pieProcessImportedRows(rows);};
      reader.readAsText(file);
    }else if(['xls','xlsx','ods','odg'].includes(ext)){
      reader.onload=async ev=>{
        try{
          if(!window.XLSX){
            await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='libs/xlsx.full.min.js';s.onload=()=>resolve();s.onerror=err=>reject(new Error('Failed to load XLSX script'));document.head.appendChild(s);});
          }
          const data=new Uint8Array(ev.target.result);
          const workbook=XLSX.read(data,{type:'array'});
          const sheet=workbook.Sheets[workbook.SheetNames[0]];
          let rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
          pieProcessImportedRows(rows);
        }catch(err){alert('Failed to import spreadsheet: '+err.message);}
      };
      reader.readAsArrayBuffer(file);
    }else{
      alert('Unsupported file format: '+ext);
    }
  });
  function pieProcessImportedRows(rows){
    if(!rows.length) return;
    pieHot.loadData(rows);
    console.log('pie imported rows',rows.length);
    scheduleDrawPie();
  }
  piePanelResizer.addEventListener('pointerdown',e=>{
    e.preventDefault();
    const startX=e.clientX;
    const startTable=pieTablePanel.getBoundingClientRect().width;
    const startGraph=pieGraphPanel.getBoundingClientRect().width;
    const configWidth=pieConfigPanel.getBoundingClientRect().width;
    const gap=parseFloat(getComputedStyle(pieGraphPanel.querySelector('.diagram-area')).gap||0);
    pieMinSvgWidth=pieSvgBox.getBoundingClientRect().width*0.5;
    const minGraph=configWidth+gap+pieMinSvgWidth;
    const total=startTable+startGraph;
    console.debug('pie resizer start',{startTable,startGraph,configWidth,gap,pieMinSvgWidth,minGraph,total});
    function onMove(ev){
      const dx=ev.clientX-startX;
      let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx));
      let newGraph=total-newTable;
      pieTablePanel.style.flex=`0 0 ${newTable}px`;
      pieGraphPanel.style.flex=`0 0 ${newGraph}px`;
      syncPieWidths();
      console.debug('pie resizer move',{dx,newTable,newGraph});
    }
    function onUp(){
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      console.debug('pie resizer end');
    }
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  });
  const pieShowPercents=document.getElementById('pieShowPercents');
  const pieStartAngle=document.getElementById('pieStartAngle');
  const pieFontSize=document.getElementById('pieFontSize');
  const pieFontSizeVal=document.getElementById('pieFontSizeVal');
  const pieChartType=document.getElementById('pieChartType');
  const pieValueColumn=document.getElementById('pieValueColumn');
  const pieValueColumnLabel=pieValueColumn.parentElement;
  const pieExpectedColumn=document.getElementById('pieExpectedColumn');
  const pieExpectedColumnLabel=pieExpectedColumn.parentElement;
  [pieShowPercents,pieStartAngle,pieFontSize].forEach(el=>el.addEventListener('input',()=>{console.log('pie config changed',el.id,el.value); pieFontSizeVal.textContent=pieFontSize.value; scheduleDrawPie();}));
  function updatePieValueColumnVisibility(){
    // Always show observed/expected selectors so statistics section remains consistent
    pieValueColumnLabel.style.display='';
    pieExpectedColumnLabel.style.display='';
    console.log('updatePieValueColumnVisibility',{type:pieChartType.value});
  }
  pieChartType.addEventListener('change',()=>{
    console.log('pie chart type changed',pieChartType.value);
    updatePieValueColumnVisibility();
    scheduleDrawPie();
  });
  updatePieValueColumnVisibility();
  pieValueColumn.addEventListener('change',()=>{console.log('pie value column changed',pieValueColumn.value); scheduleDrawPie();});
  pieExpectedColumn.addEventListener('change',()=>{console.log('pie expected column changed',pieExpectedColumn.value); scheduleDrawPie();});
  const pieColorPickers=document.getElementById('pieColorPickers');
  let pieColors={};
  let pieLegendItems=[];
  let pieLegendWidth=120;
  function updatePieColorPickers(labels){
    pieColorPickers.innerHTML='';
    labels.forEach((lab,i)=>{
      if(!pieColors[lab]) pieColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
      const input=document.createElement('input');
      input.type='color';
      input.value=pieColors[lab];
      attachColorPickerNear(input);
      input.addEventListener('input',e=>{pieColors[lab]=e.target.value; console.log('pie color changed',{lab,color:pieColors[lab]}); scheduleDrawPie();});
      const lbl=document.createElement('label');
      lbl.textContent=lab+' ';
      lbl.appendChild(input);
      pieColorPickers.appendChild(lbl);
    });
    console.log('updatePieColorPickers',pieColors);
  }
  function updatePieColumns(header){
    const prevVal=pieValueColumn.value;
    const prevExp=pieExpectedColumn.value;
    pieValueColumn.innerHTML='';
    pieExpectedColumn.innerHTML='';
    console.log('updatePieColumns prev',{prevVal,prevExp});
    for(let c=1;c<header.length;c++){
      const txt=header[c]||`Column ${c+1}`;
      const optVal=document.createElement('option');
      optVal.value=String(c);
      optVal.textContent=txt;
      if(optVal.value===prevVal) optVal.selected=true;
      pieValueColumn.appendChild(optVal);
      const optExp=document.createElement('option');
      optExp.value=String(c);
      optExp.textContent=txt;
      if(optExp.value===prevExp) optExp.selected=true;
      pieExpectedColumn.appendChild(optExp);
    }
    if(!prevVal && header.length>1) pieValueColumn.value='1';
    if(!prevExp){
      const expIdx=header.findIndex((h,i)=>i>0 && String(h).trim().toLowerCase()==='expected');
      if(expIdx>0) pieExpectedColumn.value=String(expIdx);
      else if(header.length>2) pieExpectedColumn.value='2';
    }
    console.log('updatePieColumns',{val:pieValueColumn.value,exp:pieExpectedColumn.value});
  }
  let pieTitleText='Proportion graph';
  async function drawPie(){
    const type=pieChartType.value;
    const token=++pieDrawToken; console.log('drawPie start',{token,type});
    const showPerc=pieShowPercents.checked;
    const startDeg=parseFloat(pieStartAngle.value)||0;
    const fs=Number(pieFontSize.value)||16;
    const data=pieHot.getData();
    updatePieColumns(data[0]||[]);
    pieLegendItems=[];
    pieLegendWidth=120;
    const plotEl=piePlotDiv;
    while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);

    if(type==='stacked'){
      // parse data for multiple stacked bars
      const header=data[0]||[];
      const barHeaders=header.slice(1).filter(h=>h!==null&&h!=='');
      const segmentLabels=[];
      const segmentValues=[]; // values per segment per bar
      for(let r=1;r<data.length;r++){
        const row=data[r];
        const seg=row[0];
        if(seg){
          const vals=[];
          for(let c=1;c<=barHeaders.length;c++){
            const v=parseFloat(row[c]);
            vals.push(isNaN(v)?0:v);
          }
          segmentLabels.push(String(seg));
          segmentValues.push(vals);
        }
      }
      if(!barHeaders.length||!segmentLabels.length){plotEl.innerHTML='<i>No data</i>';return;}
      updatePieColorPickers(segmentLabels);
      const legendWidth=120;
      plotEl.style.display='flex';
      plotEl.style.alignItems='flex-start';
      const svgWidth=Math.max(50,Math.floor(plotEl.clientWidth||50)-legendWidth);
      const svgHeight=Math.max(50,Math.floor(plotEl.clientHeight||50));
      const svg=document.createElementNS(NS,'svg');
      svg.setAttribute('id','pieSvg');
      svg.setAttribute('width',String(svgWidth));
      svg.setAttribute('height',String(svgHeight));
      svg.setAttribute('viewBox',`0 0 ${svgWidth} ${svgHeight}`);
      svg.setAttribute('font-family','sans-serif');
      plotEl.appendChild(svg);
      const legend=document.createElement('div');
      legend.style.width=legendWidth+'px';
      legend.style.fontSize=fs+'px';
      legend.style.marginLeft='8px';
      plotEl.appendChild(legend);
      console.log('stacked parsed',{barHeaders,segmentLabels});
      const marginTop=fs+20;
      const marginBottom=40;
      const marginLeft=fs*5;
      const chartWidth=svgWidth-marginLeft-20;
      const chartHeight=svgHeight-marginTop-marginBottom;
      // axes
      const axis=document.createElementNS(NS,'g');
      const yAxis=document.createElementNS(NS,'line');
      yAxis.setAttribute('x1',marginLeft);
      yAxis.setAttribute('y1',marginTop);
      yAxis.setAttribute('x2',marginLeft);
      yAxis.setAttribute('y2',marginTop+chartHeight);
      yAxis.setAttribute('stroke','#000');
      axis.appendChild(yAxis);
      const xAxis=document.createElementNS(NS,'line');
      xAxis.setAttribute('x1',marginLeft);
      xAxis.setAttribute('y1',marginTop+chartHeight);
      xAxis.setAttribute('x2',marginLeft+chartWidth);
      xAxis.setAttribute('y2',marginTop+chartHeight);
      xAxis.setAttribute('stroke','#000');
      axis.appendChild(xAxis);
      for(let t=0;t<=100;t+=25){
        const y=marginTop+chartHeight-(chartHeight*t/100);
        const tick=document.createElementNS(NS,'line');
        tick.setAttribute('x1',marginLeft-5);
        tick.setAttribute('y1',y);
        tick.setAttribute('x2',marginLeft);
        tick.setAttribute('y2',y);
        tick.setAttribute('stroke','#000');
        axis.appendChild(tick);
        const txt=document.createElementNS(NS,'text');
        txt.setAttribute('x',marginLeft-10);
        txt.setAttribute('y',y+4);
        txt.setAttribute('text-anchor','end');
        txt.setAttribute('font-size',fs*0.8);
        txt.textContent=t+'%';
        axis.appendChild(txt);
      }
      const yTitle=document.createElementNS(NS,'text');
      const yTitleX=fs*1.25;
      yTitle.setAttribute('x',yTitleX);
      yTitle.setAttribute('y',marginTop+chartHeight/2);
      yTitle.setAttribute('text-anchor','middle');
      yTitle.setAttribute('transform',`rotate(-90 ${yTitleX} ${marginTop+chartHeight/2})`);
      yTitle.setAttribute('font-size',fs);
      yTitle.textContent='Percentage';
      axis.appendChild(yTitle);
      console.log('stacked axis layout',{marginLeft,yTitleX});
      svg.appendChild(axis);
      const barGap=10;
      const barWidth=(chartWidth-(barHeaders.length+1)*barGap)/barHeaders.length;
      const xLabels=[];
      barHeaders.forEach((bh,j)=>{
        let y=marginTop+chartHeight;
        const total=segmentValues.reduce((s,row)=>s+(row[j]||0),0);
        segmentLabels.forEach((lab,i)=>{
          const val=segmentValues[i][j]||0;
          const frac=total?val/total:0;
          const h=chartHeight*frac;
          y-=h;
          const rect=document.createElementNS(NS,'rect');
          rect.setAttribute('x',marginLeft+barGap+j*(barWidth+barGap));
          rect.setAttribute('y',y);
          rect.setAttribute('width',barWidth);
          rect.setAttribute('height',h);
          const color=pieColors[lab]||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
          rect.setAttribute('fill',color);
          svg.appendChild(rect);
          if(showPerc && frac>0){
            const txt=document.createElementNS(NS,'text');
            txt.setAttribute('x',marginLeft+barGap+j*(barWidth+barGap)+barWidth/2);
            txt.setAttribute('y',y+h/2);
            txt.setAttribute('text-anchor','middle');
            txt.setAttribute('font-size',fs*0.8);
            txt.textContent=(frac*100).toFixed(1)+'%';
            svg.appendChild(txt);
            console.log('stacked percent label',{bar:bh,label:lab,percent:frac*100});
          }
        });
        const lbl=document.createElementNS(NS,'text');
        const lx=marginLeft+barGap+j*(barWidth+barGap)+barWidth/2;
        const ly=marginTop+chartHeight+fs+4;
        lbl.setAttribute('x',lx);
        lbl.setAttribute('y',ly);
        lbl.setAttribute('text-anchor','middle');
        lbl.setAttribute('font-size',fs);
        lbl.textContent=bh;
        svg.appendChild(lbl);
        xLabels.push(lbl);
      });
      // Detect overlapping x-axis labels and tilt if needed
      let needsTilt=false;
      const boxes=xLabels.map(l=>l.getBBox());
      for(let i=1;i<boxes.length;i++){
        const prev=boxes[i-1];
        const curr=boxes[i];
        if(prev.x+prev.width>curr.x){needsTilt=true;break;}
      }
      if(needsTilt){
        xLabels.forEach(l=>{
          const x=l.getAttribute('x');
          const y=l.getAttribute('y');
          l.setAttribute('transform',`rotate(-45 ${x} ${y})`);
          l.setAttribute('text-anchor','end');
          l.setAttribute('dy','0.35em');
        });
      }
      console.log('stacked x label tilt check',{needsTilt});
      const title=document.createElementNS(NS,'text');
      title.setAttribute('x',marginLeft+chartWidth/2);
      title.setAttribute('y',fs);
      title.setAttribute('text-anchor','middle');
      title.setAttribute('font-size',fs+4);
      title.textContent=pieTitleText;
      svg.appendChild(title);
      makeEditable(title,txt=>{pieTitleText=txt;});
      segmentLabels.forEach((lab,i)=>{
        const item=document.createElement('div');
        const sw=document.createElement('span');
        sw.style.display='inline-block';
        sw.style.width='12px';
        sw.style.height='12px';
        sw.style.background=pieColors[lab]||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
        sw.style.marginRight='4px';
        const t=document.createElement('span');
        t.textContent=lab;
        item.appendChild(sw);
        item.appendChild(t);
        legend.appendChild(item);
      });
      pieLegendItems=segmentLabels.map((lab,i)=>({label:lab,color:pieColors[lab]||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]}));
      pieLegendWidth=legendWidth;
      autoResizeSvg(svg);
      const valCol=parseInt(pieValueColumn.value)-1;
      const expCol=parseInt(pieExpectedColumn.value)-1;
      const observed=segmentValues.map(row=>row[valCol]||0);
      const expected=segmentValues.map(row=>row[expCol]||0);
      console.log('drawPie stacked stats data',{observed,expected});
      updatePieStats(segmentLabels,observed,expected);
      console.log('drawPie complete stacked',{token});
      return;
      }

    // pie or donut charts with dynamic layout for multiple columns
      const header=data[0]||[];
      const valueCols=[];
      for(let c=1;c<header.length;c++){
        const h=header[c];
        if(h!==null && h!=='') valueCols.push({idx:c,title:String(h)});
      }
      console.log('drawPie columns parsed',valueCols);
      if(!valueCols.length){ plotEl.innerHTML='<i>No data</i>'; pieStatsResults.textContent='No data'; return; }
      const labelSet=new Set();
      for(let r=1;r<data.length;r++){ const lab=data[r][0]; if(lab) labelSet.add(String(lab)); }
      const allLabels=[...labelSet];
      updatePieColorPickers(allLabels);
      const chartCount=valueCols.length;
      let cols=Math.ceil(Math.sqrt(chartCount));
      let rows=Math.ceil(chartCount/cols);
      if(chartCount===3){cols=2;rows=2;}
      plotEl.innerHTML='';
      let legend=null;
      let gridContainer=plotEl;
      let plotWidth=plotEl.clientWidth||400;
      let plotHeight=plotEl.clientHeight||400;
      let cellWidth,cellHeight;
      let legendWidth=120;
      if(chartCount===2){
        const gap=20;
        plotEl.style.display='flex';
        plotEl.style.alignItems='center';
        const chartsWrapper=document.createElement('div');
        chartsWrapper.style.display='grid';
        chartsWrapper.style.gridTemplateColumns='1fr 1fr';
        chartsWrapper.style.gap=gap+'px';
        chartsWrapper.style.flex='1';
        chartsWrapper.style.alignItems='center';
        chartsWrapper.style.justifyItems='center';
        plotEl.appendChild(chartsWrapper);
        legend=document.createElement('div');
        legend.style.fontSize=fs+'px';
        legend.style.marginLeft='20px';
        legend.style.width=legendWidth+'px';
        plotEl.appendChild(legend);
        cellWidth=(plotWidth-legendWidth-gap)/2;
        cellHeight=plotHeight;
        gridContainer=chartsWrapper;
        console.log('drawPie layout two charts',{token,legendWidth,cellWidth,cellHeight});
      }else{
        const gap=10;
        plotEl.style.display='grid';
        plotEl.style.alignItems='center';
        plotEl.style.justifyItems='center';
        plotEl.style.gridTemplateColumns=`repeat(${cols}, 1fr) ${legendWidth}px`;
        plotEl.style.gridAutoRows='auto';
        plotEl.style.gap=gap+'px';
        cellWidth=(plotWidth-legendWidth-gap*(cols-1))/cols;
        cellHeight=(plotHeight-gap*(rows-1))/rows;
        legend=document.createElement('div');
        legend.style.fontSize=fs+'px';
        legend.style.gridColumn=cols+1;
        legend.style.gridRow=`1 / span ${rows}`;
        legend.style.background='rgba(255,255,255,0.8)';
        legend.style.padding='4px';
        legend.style.alignSelf='start';
        plotEl.appendChild(legend);
        console.log('drawPie layout grid',{token,cols,rows,legendWidth,cellWidth,cellHeight});
      }
      valueCols.forEach((col,i)=>{
        const labels=[]; const values=[];
        for(let r=1;r<data.length;r++){
          const lab=data[r][0];
          const val=parseFloat(data[r][col.idx]);
          if(lab && !isNaN(val)){
            labels.push(String(lab));
            values.push(val);
          }
        }
        console.log('drawPie column data',{column:col.idx,title:col.title,labelCount:labels.length});
        const container=document.createElement('div');
        container.style.display='flex';
        container.style.flexDirection='column';
        container.style.alignItems='center';
        if(chartCount===3 && i===2) container.style.gridColumn='1 / span 2';
        const titleDiv=document.createElement('div');
        titleDiv.textContent=col.title||`Column ${col.idx+1}`;
        titleDiv.style.fontSize=(fs+4)+'px';
        titleDiv.style.marginBottom='4px';
        container.appendChild(titleDiv);
        makeEditable(titleDiv,txt=>{col.title=txt;});
        console.log('drawPie title added',{token,index:i,title:titleDiv.textContent});
        const size=Math.min(cellWidth,cellHeight)-(chartCount===2?20:40);
        console.log('drawPie chart size',{index:i,size,cellWidth,cellHeight});
        const svg=document.createElementNS(NS,'svg');
        if(i===0) svg.setAttribute('id','pieSvg');
        svg.setAttribute('width',String(size));
        svg.setAttribute('height',String(size));
        svg.setAttribute('viewBox',`0 0 ${size} ${size}`);
        svg.setAttribute('font-family','sans-serif');
        const radius=(size-20)/2;
        const cx=size/2;
        const cy=size/2;
        let angle=startDeg*Math.PI/180;
        const texts=[];
        const total=values.reduce((s,v)=>s+v,0);
        labels.forEach((lab,j)=>{
          const val=values[j];
          const frac=total?val/total:0;
          const slice=frac*Math.PI*2;
          const x1=cx+radius*Math.cos(angle);
          const y1=cy+radius*Math.sin(angle);
          const x2=cx+radius*Math.cos(angle+slice);
          const y2=cy+radius*Math.sin(angle+slice);
          const large=slice>Math.PI?1:0;
          const pathData=`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
          const color=pieColors[lab]||DEFAULT_SCATTER_COLORS[j%DEFAULT_SCATTER_COLORS.length];
          const p=document.createElementNS(NS,'path');
          p.setAttribute('d',pathData);
          p.setAttribute('fill',color);
          p.setAttribute('stroke','#fff');
          p.setAttribute('stroke-width','1');
          svg.appendChild(p);
          if(showPerc){
            const mid=angle+slice/2;
            const lx=cx+radius*0.7*Math.cos(mid);
            const ly=cy+radius*0.7*Math.sin(mid);
            const txt=document.createElementNS(NS,'text');
            txt.setAttribute('x',lx);
            txt.setAttribute('y',ly);
            txt.setAttribute('font-size',fs);
            txt.setAttribute('text-anchor','middle');
            txt.setAttribute('dominant-baseline','middle');
            txt.textContent=`${(frac*100).toFixed(1)}%`;
            texts.push(txt);
          }
          angle+=slice;
        });
        if(type==='donut'){
          const hole=document.createElementNS(NS,'circle');
          hole.setAttribute('cx',cx);
          hole.setAttribute('cy',cy);
          hole.setAttribute('r',radius*0.5);
          hole.setAttribute('fill','#fff');
          svg.appendChild(hole);
        }
        texts.forEach(t=>svg.appendChild(t));
        container.appendChild(svg);
        autoResizeSvg(svg,{fill:false});
        console.log('drawPie autoResizeSvg called',{index:i});
        gridContainer.appendChild(container);
      });
      allLabels.forEach((lab,i)=>{
        const item=document.createElement('div');
        const sw=document.createElement('span');
        sw.style.display='inline-block';
        sw.style.width='12px';
        sw.style.height='12px';
        sw.style.background=pieColors[lab]||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
        sw.style.marginRight='4px';
        const t=document.createElement('span');
        t.textContent=lab;
        item.appendChild(sw);
        item.appendChild(t);
        legend.appendChild(item);
      });
      pieLegendItems=allLabels.map((lab,i)=>({label:lab,color:pieColors[lab]||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]}));
      pieLegendWidth=legendWidth;
      console.log('drawPie legend built',{token,labelCount:allLabels.length});
      const valCol=parseInt(pieValueColumn.value)||valueCols[0].idx;
      const expCol=parseInt(pieExpectedColumn.value)|| (valueCols[1]?valueCols[1].idx:valueCols[0].idx);
      const statLabels=[]; const statValues=[]; const expected=[];
      for(let r=1;r<data.length;r++){
        const lab=data[r][0];
        const val=parseFloat(data[r][valCol]);
        const expVal=parseFloat(data[r][expCol]);
        if(lab && !isNaN(val)){
          statLabels.push(String(lab));
          statValues.push(val);
          expected.push(expVal);
        }
      }
      updatePieStats(statLabels,statValues,expected);
      console.log('drawPie complete',{token,charts:chartCount});
  }
  function buildPieExportSvg(){
    const plotEl=piePlotDiv;
    const svgs=plotEl.querySelectorAll('svg');
    if(!svgs.length) return null;
    const fs=Number(pieFontSize.value)||16;
    const W=plotEl.clientWidth||800;
    const H=plotEl.clientHeight||400;
    const out=document.createElementNS(NS,'svg');
    out.setAttribute('width',String(W));
    out.setAttribute('height',String(H));
    out.setAttribute('viewBox',`0 0 ${W} ${H}`);
    out.setAttribute('font-family','sans-serif');
    const plotRect=plotEl.getBoundingClientRect();
    svgs.forEach(svg=>{
      const rect=svg.getBoundingClientRect();
      const titleDiv=svg.previousElementSibling;
      const g=document.createElementNS(NS,'g');
      if(titleDiv && titleDiv.tagName==='DIV'){
        const titleRect=titleDiv.getBoundingClientRect();
        g.setAttribute('transform',`translate(${titleRect.left-plotRect.left},${titleRect.top-plotRect.top})`);
        const titleText=document.createElementNS(NS,'text');
        titleText.setAttribute('x',rect.width/2);
        titleText.setAttribute('y',fs);
        titleText.setAttribute('text-anchor','middle');
        titleText.setAttribute('font-size',fs+4);
        titleText.textContent=titleDiv.textContent||'';
        g.appendChild(titleText);
        const chartGroup=document.createElementNS(NS,'g');
        chartGroup.setAttribute('transform',`translate(0,${titleRect.height})`);
        chartGroup.appendChild(svg.cloneNode(true));
        g.appendChild(chartGroup);
        console.log('buildPieExportSvg added title',{text:titleText.textContent});
      }else{
        g.setAttribute('transform',`translate(${rect.left-plotRect.left},${rect.top-plotRect.top})`);
        g.appendChild(svg.cloneNode(true));
      }
      out.appendChild(g);
    });
    if(pieLegendItems.length){
      const g=document.createElementNS(NS,'g');
      pieLegendItems.forEach((item,i)=>{
        const y=20+i*(fs+4);
        const sw=document.createElementNS(NS,'rect');
        sw.setAttribute('x',W-pieLegendWidth+8);
        sw.setAttribute('y',y-fs+4);
        sw.setAttribute('width',12);
        sw.setAttribute('height',12);
        sw.setAttribute('fill',item.color);
        g.appendChild(sw);
        const t=document.createElementNS(NS,'text');
        t.setAttribute('x',W-pieLegendWidth+28);
        t.setAttribute('y',y);
        t.setAttribute('font-size',fs);
        t.textContent=item.label;
        g.appendChild(t);
      });
      out.appendChild(g);
    }
    console.log('buildPieExportSvg',{svgCount:svgs.length,legendCount:pieLegendItems.length});
    return out;
  }
  document.getElementById('piePNG').addEventListener('click',async()=>{
    const svgEl=buildPieExportSvg();
    if(!svgEl) return;
    console.log('piePNG export start');
    const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800;
    const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
    const xml=serializeCleanSVG(svgEl); const img=new Image(); const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
    img.src=url; await img.decode().catch(err=>{console.error('piePNG svg decode',err);});
    const outCanvas=document.createElement('canvas'); outCanvas.width=W; outCanvas.height=H; const ctx=outCanvas.getContext('2d'); ctx.drawImage(img,0,0);
    outCanvas.toBlob(b=>{const pngUrl=URL.createObjectURL(b); const a=document.createElement('a'); a.href=pngUrl; a.download='pie.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(pngUrl),4000);},'image/png');
  });
  document.getElementById('pieSVG').addEventListener('click',()=>{
    const svgEl=buildPieExportSvg();
    if(!svgEl) return;
    console.log('pieSVG export start');
    const xml=serializeCleanSVG(svgEl); const blob=new Blob([xml],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pie.svg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
  });
  function getPieGraphPayload(){return{type:'pie',data:pieHot.getData(),config:{title:pieTitleText,colors:pieColors,showPercents:pieShowPercents.checked,startAngle:pieStartAngle.value,fontSize:pieFontSize.value,chartType:pieChartType.value,valueColumn:pieValueColumn.value,expectedColumn:pieExpectedColumn.value}};}
  let pieFileHandle=null,pieFileName='pie.graph';
  async function savePieFile(){const payload=getPieGraphPayload(); console.log('savePieFile',{payload,pieFileHandle}); if(pieFileHandle&&pieFileHandle.createWritable){try{const perm=await verifyPermission(pieFileHandle,true); if(perm){const w=await pieFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close();}}catch(err){console.error('savePieFile error',err);}}else if(window.showSaveFilePicker){await saveAsPieFile();}else{downloadJSON(payload,pieFileName);}}
  async function saveAsPieFile(){const payload=getPieGraphPayload(); console.log('saveAsPieFile',payload); if(window.showSaveFilePicker){try{pieFileHandle=await window.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:pieFileName}); const w=await pieFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close();}catch(err){console.error('saveAsPieFile error',err);}}else{downloadJSON(payload,pieFileName);}}
  async function openPieFile(){console.log('openPieFile start'); if(window.showOpenFilePicker){try{[pieFileHandle]=await window.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]}); const file=await pieFileHandle.getFile(); pieFileName=file.name; loadPieGraphFile(file);}catch(err){console.error('openPieFile error',err);}}else{const input=document.getElementById('pieGraphFile'); input.value=''; input.click();}}
  function loadPieGraphFile(file){const reader=new FileReader(); reader.onload=e=>{try{const obj=JSON.parse(e.target.result); console.log('loadPieGraph',obj); if(obj.type!=='pie') throw new Error('Invalid graph type'); pieHot.loadData(obj.data||[]); const c=obj.config||{}; pieTitleText=c.title||pieTitleText; pieColors=c.colors||pieColors; pieShowPercents.checked=!!c.showPercents; pieStartAngle.value=c.startAngle||pieStartAngle.value; pieFontSize.value=c.fontSize||pieFontSize.value; pieChartType.value=c.chartType||pieChartType.value; pieFontSizeVal.textContent=pieFontSize.value; pieValueColumn.value=c.valueColumn||pieValueColumn.value; pieExpectedColumn.value=c.expectedColumn||pieExpectedColumn.value; scheduleDrawPie();}catch(err){console.error('loadPieGraph error',err);}}; reader.readAsText(file);}
  document.getElementById('openPie').addEventListener('click',openPieFile);
  document.getElementById('savePie').addEventListener('click',savePieFile);
  document.getElementById('saveAsPie').addEventListener('click',saveAsPieFile);
  document.getElementById('pieGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){pieFileName=f.name; pieFileHandle=null; loadPieGraphFile(f);}});
  scheduleDrawPie();
  }


  Chart.defaults.locale='en-US';
  const inputs = {
    A: $('#listA'), B: $('#listB'), C: $('#listC'),
    labelA: $('#labelA'), labelB: $('#labelB'), labelC: $('#labelC'),
    colorA: $('#colorA'), colorB: $('#colorB'), colorC: $('#colorC'),
    opacity: $('#opacity'), fontsize: $('#fontsize'), borderColor: $('#borderColor'), borderWidth: $('#borderWidth'),
    opacityVal: $('#opacityVal'), fontsizeVal: $('#fontsizeVal'), borderWidthVal: $('#borderWidthVal'),
    caseSensitive: $('#caseSensitive'), delimiter: $('#delimiter'),
    counts: { nA: $('#nA'), nB: $('#nB'), nC: $('#nC'), nAB: $('#nAB'), nAC: $('#nAC'), nBC: $('#nBC'), nABC: $('#nABC') }
  };
  const goOptsBtn=$('#goOptsBtn'), goOptions=$('#goOptions'), goUseAllBackground=$('#goUseAllBackground');
  const goCategoryChecks=[...document.querySelectorAll('.goCategory')];
  const stringOptsBtn=$('#stringOptsBtn'), stringOptions=$('#stringOptions');
  function handlePlainPaste(e){
    e.preventDefault();
    const text=(e.clipboardData||window.clipboardData).getData('text/plain').replace(/\r/g,'').replace(/\u00A0/g,' ');
    document.execCommand('insertText', false, text);
  }
  [inputs.A,inputs.B,inputs.C].forEach(el=>el.addEventListener('paste',handlePlainPaste));
  const STYLE_KEY='vennStylePrefs';
  function loadStylePrefs(){
    try{
      const saved=JSON.parse(localStorage.getItem(STYLE_KEY));
      if(saved){
        if(saved.colorA) inputs.colorA.value=saved.colorA;
        if(saved.colorB) inputs.colorB.value=saved.colorB;
        if(saved.colorC) inputs.colorC.value=saved.colorC;
        if(saved.opacity) inputs.opacity.value=saved.opacity;
        if(saved.fontsize) inputs.fontsize.value=saved.fontsize;
        if(saved.borderColor) inputs.borderColor.value=saved.borderColor;
        if(saved.borderWidth) inputs.borderWidth.value=saved.borderWidth;
      }
      inputs.opacityVal.textContent=inputs.opacity.value;
      inputs.fontsizeVal.textContent=inputs.fontsize.value;
      inputs.borderWidthVal.textContent=inputs.borderWidth.value;
    }catch(err){}
  }
  function saveStylePrefs(){
    const prefs={
      colorA: inputs.colorA.value,
      colorB: inputs.colorB.value,
      colorC: inputs.colorC.value,
      opacity: inputs.opacity.value,
      fontsize: inputs.fontsize.value,
      borderColor: inputs.borderColor.value,
      borderWidth: inputs.borderWidth.value
    };
    try{ localStorage.setItem(STYLE_KEY, JSON.stringify(prefs)); }
    catch(err){}
  }
  loadStylePrefs();
  inputs.opacity.addEventListener('input',()=>{ inputs.opacityVal.textContent=inputs.opacity.value; refreshDiagram(); saveStylePrefs(); });
  inputs.fontsize.addEventListener('input',()=>{ inputs.fontsizeVal.textContent=inputs.fontsize.value; refreshDiagram(); saveStylePrefs(); });
  ['colorA','colorB','colorC'].forEach(id=>{
    inputs[id].addEventListener('input',e=>{ refreshDiagram(); saveStylePrefs(); });
  });
  ['labelA','labelB','labelC'].forEach(id=>{
    inputs[id].addEventListener('input',()=>{
      const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'};
      updateColorLabels(labels);
      updateRegionSelect(labels);
      updateCountLabels(labels);
    });
  });
  updateColorLabels({A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'});
  inputs.borderColor.addEventListener('input',e=>{ refreshDiagram(); saveStylePrefs(); });
  inputs.borderWidth.addEventListener('input',()=>{ inputs.borderWidthVal.textContent=inputs.borderWidth.value; refreshDiagram(); saveStylePrefs(); });
  function splitItems(text, mode){
    if(mode==='newline'){
      return text.split(/\r?\n/);
    }
    if(mode==='comma'){
      return text.split(/,/);
    }
    if(mode==='tab'){
      return text.split(/\t/);
    }
    if(mode==='space'){
      return text.split(/\s+/);
    }
    return text.split(/[\r\n,\t;\s]+/);
  }
  function parseList(raw, cs, mode){
    const arr = splitItems(raw.trim(), mode).map(s=>s.trim()).filter(Boolean);
    const seen=new Set(), out=[];
    for(const x of arr){
      const key=cs?x:x.toLowerCase();
      if(!seen.has(key)){
        seen.add(key);
        out.push({key,val:x});
      }
    }
    return out;
  }
  function setsFromLists(listA, listB, listC){
    const mapA=new Map(listA.map(o=>[o.key,o.val]));
    const mapB=new Map(listB.map(o=>[o.key,o.val]));
    const mapC=new Map(listC.map(o=>[o.key,o.val]));
    const keysA=new Set(mapA.keys()), keysB=new Set(mapB.keys()), keysC=new Set(mapC.keys());
    const inter=(S,T)=>new Set([...S].filter(x=>T.has(x)));
    const diff=(S,T)=>new Set([...S].filter(x=>!T.has(x)));
    const union=(S,T)=>new Set([...S,...T]);
    const ABCk=inter(inter(keysA,keysB),keysC);
    const ABk=diff(inter(keysA,keysB),keysC);
    const ACk=diff(inter(keysA,keysC),keysB);
    const BCk=diff(inter(keysB,keysC),keysA);
    const Aonlyk=diff(keysA,union(keysB,keysC));
    const Bonlyk=diff(keysB,union(keysA,keysC));
    const Conlyk=diff(keysC,union(keysA,keysB));
    const mapVal=(keys,map)=>new Set([...keys].map(k=>map.get(k)));
    const res={
      A:mapVal(keysA,mapA),
      B:mapVal(keysB,mapB),
      C:mapVal(keysC,mapC),
      Aonly:mapVal(Aonlyk,mapA),
      Bonly:mapVal(Bonlyk,mapB),
      Conly:mapVal(Conlyk,mapC),
      AB:mapVal(ABk,mapA),
      AC:mapVal(ACk,mapA),
      BC:mapVal(BCk,mapB),
      ABC:mapVal(ABCk,mapA)
    };
    return res;
  }
  function circleIntersectionArea(r1,r2,d){
    if(d>=r1+r2) return 0;
    if(d<=Math.abs(r1-r2)) return Math.PI*Math.min(r1,r2)**2;
    const a=2*Math.acos((r1*r1+d*d-r2*r2)/(2*r1*d));
    const b=2*Math.acos((r2*r2+d*d-r1*r1)/(2*r2*d));
    return 0.5*r1*r1*(a-Math.sin(a)) + 0.5*r2*r2*(b-Math.sin(b));
  }
  function distanceForOverlap(r1,r2,target){
    const maxA=Math.PI*Math.min(r1,r2)**2;
    const t=Math.max(0,Math.min(target,maxA));
    let lo=Math.max(0,Math.abs(r1-r2)), hi=r1+r2;
    for(let i=0;i<60;i++){ const m=(lo+hi)/2; const A=circleIntersectionArea(r1,r2,m); if(A>t) lo=m; else hi=m; }
    return (lo+hi)/2;
  }
  function trilaterate(dAB,dAC,dBC){
    const x=(dAB*dAB+dAC*dAC-dBC*dBC)/(2*(dAB||1e-6));
    const y2=dAC*dAC-x*x; return {Ax:0,Ay:0,Bx:dAB,By:0,Cx:x,Cy:Math.sqrt(Math.max(0,y2))};
  }
  function layoutFromCounts(nA,nB,nC,nAB,nAC,nBC){
    const rA=Math.sqrt(Math.max(nA,0)/Math.PI);
    const rB=Math.sqrt(Math.max(nB,0)/Math.PI);
    const rC=Math.sqrt(Math.max(nC,0)/Math.PI);
    const dAB=distanceForOverlap(rA,rB,Math.max(nAB,0));
    const dAC=distanceForOverlap(rA,rC,Math.max(nAC,0));
    const dBC=distanceForOverlap(rB,rC,Math.max(nBC,0));
    return {...trilaterate(dAB,dAC,dBC), rA,rB,rC,dAB,dAC,dBC};
  }
  function clearSVG(){ while(stage.firstChild) stage.removeChild(stage.firstChild); }
  function makeEl(tag,attrs={},parent=stage){ const el=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const[k,v] of Object.entries(attrs)) el.setAttribute(k,String(v)); parent.appendChild(el); return el; }
  function enableDrag(el){ let drag=false,start={x:0,y:0},orig={x:0,y:0}; el.style.cursor='move';
    el.addEventListener('mousedown',e=>{drag=true; const pt=stage.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const loc=pt.matrixTransform(stage.getScreenCTM().inverse()); start={x:loc.x,y:loc.y}; orig={x:parseFloat(el.getAttribute('x')||'0'),y:parseFloat(el.getAttribute('y')||'0')}; e.preventDefault();});
    window.addEventListener('mousemove',e=>{ if(!drag) return; const pt=stage.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const loc=pt.matrixTransform(stage.getScreenCTM().inverse()); el.setAttribute('x',String(orig.x+(loc.x-start.x))); el.setAttribute('y',String(orig.y+(loc.y-start.y))); });
    window.addEventListener('mouseup',()=>drag=false);
  }
  function _makeRegionSpec(code, cA, rA, cB, rB, cC, rC, hasC){
    const spec = [];
    const inC  = (ctr,r)=>spec.push({ctr, r, type:'in'});
    const outC = (ctr,r)=>spec.push({ctr, r, type:'out'});
    if(code==='A'){ inC(cA,rA); outC(cB,rB); if(hasC) outC(cC,rC); }
    if(code==='B'){ inC(cB,rB); outC(cA,rA); if(hasC) outC(cC,rC); }
    if(code==='C'){ inC(cC,rC); outC(cA,rA); outC(cB,rB); }
    if(code==='AB'){ inC(cA,rA); inC(cB,rB); if(hasC) outC(cC,rC); }
    if(code==='AC'){ inC(cA,rA); if(hasC) inC(cC,rC); outC(cB,rB); }
    if(code==='BC'){ inC(cB,rB); if(hasC) inC(cC,rC); outC(cA,rA); }
    if(code==='ABC'){ inC(cA,rA); inC(cB,rB); if(hasC) inC(cC,rC); }
    return spec;
  }
  function _signedDistToRegion(x, y, spec){
    let minMargin = Infinity;
    for(const c of spec){
      const dist = Math.hypot(x - c.ctr.x, y - c.ctr.y);
      const margin = (c.type === 'in') ? (c.r - dist) : (dist - c.r);
      if(margin < minMargin) minMargin = margin;
    }
    return minMargin;
  }
  function _bboxForSpec(spec){
    const ins = spec.filter(c => c.type === 'in');
    if(!ins.length) return null;
    let b = {x1: -Infinity, y1: -Infinity, x2: Infinity, y2: Infinity};
    for(const c of ins){
      const bb = {x1: c.ctr.x - c.r, y1: c.ctr.y - c.r, x2: c.ctr.x + c.r, y2: c.ctr.y + c.r};
      b = { x1: Math.max(b.x1, bb.x1), y1: Math.max(b.y1, bb.y1),
            x2: Math.min(b.x2, bb.x2), y2: Math.min(b.y2, bb.y2) };
    }
    if(b.x1 >= b.x2 || b.y1 >= b.y2) return null;
    return b;
  }
  function _polylabelRegion(spec, bbox, tolerancePx){
    function makeCell(x, y, h){
      const d = _signedDistToRegion(x, y, spec);
      return {x, y, h, d, max: d + h*Math.SQRT2};
    }
    const width  = bbox.x2 - bbox.x1;
    const height = bbox.y2 - bbox.y1;
    const size   = Math.max(width, height);
    const h0     = size / 2;
    const nInit  = 4;
    const step   = size / nInit;
    const queue = [];
    function push(c){ queue.push(c); }
    function pop(){ queue.sort((a,b)=>b.max - a.max); return queue.shift(); }
    for(let x = bbox.x1; x < bbox.x2 + 1e-6; x += step){
      for(let y = bbox.y1; y < bbox.y2 + 1e-6; y += step){
        push(makeCell(x + step/2, y + step/2, step/2));
      }
    }
    let best = makeCell((bbox.x1+bbox.x2)/2, (bbox.y1+bbox.y2)/2, h0);
    if(best.d < 0){
      for(const c of queue){ if(c.d > best.d) best = c; }
    }
    while(queue.length){
      const cell = pop();
      if(cell.d > best.d) best = cell;
      if(cell.max - best.d <= tolerancePx) continue;
      const h = cell.h / 2;
      push(makeCell(cell.x - h, cell.y - h, h));
      push(makeCell(cell.x + h, cell.y - h, h));
      push(makeCell(cell.x - h, cell.y + h, h));
      push(makeCell(cell.x + h, cell.y + h, h));
    }
    return {x: best.x, y: best.y};
  }
  function _findRegionLabelPoint(code, cA, rA, cB, rB, cC, rC, hasC, tolerancePx){
    const spec = _makeRegionSpec(code, cA, rA, cB, rB, cC, rC, hasC);
    const bbox = _bboxForSpec(spec);
    if(!bbox) return null;
    const tol = Math.max(0.25, tolerancePx||0.5);
    const pt  = _polylabelRegion(spec, bbox, tol);
    return pt;
  }
  function fitAndDraw(d, style, labels, counts){
    clearSVG();
    const W=500,H=340,pad=20,labelPad=style.fontsize*2;
    const xs=[d.Ax-d.rA,d.Ax+d.rA,d.Bx-d.rB,d.Bx+d.rB]; const ys=[d.Ay-d.rA,d.Ay+d.rA,d.By-d.rB,d.By+d.rB];
    if(counts.nC>0){ xs.push(d.Cx-d.rC,d.Cx+d.rC); ys.push(d.Cy-d.rC,d.Cy+d.rC); }
    const minX=Math.min.apply(null,xs), maxX=Math.max.apply(null,xs);
    const minY=Math.min.apply(null,ys), maxY=Math.max.apply(null,ys);
    const scale=Math.min((W-2*pad)/Math.max(1e-6,maxX-minX),(H-2*pad-2*labelPad)/Math.max(1e-6,maxY-minY));
    const tx=(W-scale*(minX+maxX))/2;
    const ty=(H-2*labelPad-scale*(minY+maxY))/2+labelPad;
    function toPx(x,y){ return {x:x*scale+tx,y:y*scale+ty}; }
    const circles=[{id:'A',x:d.Ax,y:d.Ay,r:d.rA,color:style.colorA},{id:'B',x:d.Bx,y:d.By,r:d.rB,color:style.colorB}];
    if(counts.nC>0) circles.push({id:'C',x:d.Cx,y:d.Cy,r:d.rC,color:style.colorC});
    for(const c of circles){ const p=toPx(c.x,c.y); makeEl('circle',{cx:p.x,cy:p.y,r:c.r*scale,fill:c.color,'fill-opacity':style.opacity,stroke:style.borderColor,'stroke-width':style.borderWidth}); }
    function addText(txt,x,y,regionCode){
      const t=makeEl('text',{x:x,y:y,'font-size':style.fontsize,'text-anchor':'middle',fill:'#333'});
      t.textContent=txt;
      if(regionCode){
        const genes=getRegionText(regionCode).split(/\n/).filter(g=>g);
        t.addEventListener('mouseenter',e=>{
          tooltip.innerHTML=genes.map(g=>'<div>'+g+'</div>').join('');
          tooltip.style.fontSize='12px';
          tooltip.style.maxHeight='none';
          tooltip.style.maxWidth='none';
          tooltip.style.overflow='visible';
          tooltip.style.width='auto';
          tooltip.style.height='auto';
          const lineHeight=parseFloat(getComputedStyle(tooltip).lineHeight);
          const tempSpan=document.createElement('span');
          tempSpan.style.visibility='hidden';
          tempSpan.style.position='absolute';
          tempSpan.style.fontSize='12px';
          tempSpan.style.whiteSpace='pre';
          document.body.appendChild(tempSpan);
          let longestWidth=0;
          genes.forEach(g=>{ tempSpan.textContent=g; const w=tempSpan.getBoundingClientRect().width; if(w>longestWidth) longestWidth=w; });
          document.body.removeChild(tempSpan);
          const columnGap=12;
          const columnWidth=Math.ceil(longestWidth)+16;
          const maxWidth=window.innerWidth-16, maxHeight=window.innerHeight-16;
          const maxCols=Math.max(1,Math.floor((maxWidth+columnGap)/(columnWidth+columnGap)));
          const maxRows=Math.max(1,Math.floor(maxHeight/lineHeight));
          let columns=Math.min(maxCols,Math.ceil(genes.length/maxRows));
          let rowsPerCol=Math.ceil(genes.length/columns);
          const width=columns*columnWidth+(columns-1)*columnGap;
          const height=rowsPerCol*lineHeight;
          tooltip.style.columnCount=columns;
          tooltip.style.columnWidth=columnWidth+'px';
          tooltip.style.columnGap=columnGap+'px';
          tooltip.style.width=width+'px';
          tooltip.style.height=height+'px';
          const box=e.target.getBoundingClientRect();
          let left=box.right+window.scrollX+8;
          let top=box.top+window.scrollY;
          tooltip.style.left=left+'px';
          tooltip.style.top=top+'px';
          tooltip.style.display='block';
          positionTooltip(left, top);
        });
        t.addEventListener('mouseleave',()=>{
          tooltip.style.display='none';
        });
      }
      enableDrag(t);
      return t;
    }
    const labelBoxes=[];
    function placeCircleLabel(circle,label,count){
      const center=toPx(circle.x,circle.y);
      const others=circles.filter(c=>c.id!==circle.id);
      const isTop=others.every(o=>circle.y<=o.y);
      const margin=style.fontsize*0.6;
        let y=center.y+(isTop?-(circle.r*scale+margin):(circle.r*scale+margin));
        const t=addText(label+' ('+count+')',center.x,y);
        let box=t.getBBox();
        for(const b of labelBoxes){
          while(!(box.x+box.width<b.x||b.x+b.width<box.x||box.y+box.height<b.y||b.y+b.height<box.y)){
            y+=isTop?-style.fontsize:style.fontsize;
            t.setAttribute('y',y);
            box=t.getBBox();
          }
        }
        const minYBound=style.fontsize;
        const maxYBound=H-style.fontsize;
        if(box.y<minYBound){
          y+=minYBound-box.y;
          t.setAttribute('y',y);
          box=t.getBBox();
        }
        if(box.y+box.height>maxYBound){
          y-=box.y+box.height-maxYBound;
          t.setAttribute('y',y);
          box=t.getBBox();
        }
        labelBoxes.push(box);
    }
    placeCircleLabel({id:'A',x:d.Ax,y:d.Ay,r:d.rA},labels.A,counts.nA);
    placeCircleLabel({id:'B',x:d.Bx,y:d.By,r:d.rB},labels.B,counts.nB);
    if(counts.nC>0) placeCircleLabel({id:'C',x:d.Cx,y:d.Cy,r:d.rC},labels.C,counts.nC);
    const cA=toPx(d.Ax,d.Ay), cB=toPx(d.Bx,d.By), cC=toPx(d.Cx,d.Cy);
    const rAp=d.rA*scale, rBp=d.rB*scale, rCp=d.rC*scale;
    const hasC = counts.nC > 0;
    if(counts.Aonly){
      const p = _findRegionLabelPoint('A', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if(p) addText(String(counts.Aonly), p.x, p.y, 'A');
    }
    if(counts.Bonly){
      const p = _findRegionLabelPoint('B', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if(p) addText(String(counts.Bonly), p.x, p.y, 'B');
    }
    if(hasC && counts.Conly){
      const p = _findRegionLabelPoint('C', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if(p) addText(String(counts.Conly), p.x, p.y, 'C');
    }
    if(counts.AB){
      const p = _findRegionLabelPoint('AB', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if(p) addText(String(counts.AB), p.x, p.y, 'AB');
    }
    if(hasC && counts.AC){
      const p = _findRegionLabelPoint('AC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if(p) addText(String(counts.AC), p.x, p.y, 'AC');
    }
    if(hasC && counts.BC){
      const p = _findRegionLabelPoint('BC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if(p) addText(String(counts.BC), p.x, p.y, 'BC');
    }
    if(hasC && counts.ABC){
      const p = _findRegionLabelPoint('ABC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if(p) addText(String(counts.ABC), p.x, p.y, 'ABC');
    }
    stage.onclick=(evt)=>{
      const pt=stage.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY; const loc=pt.matrixTransform(stage.getScreenCTM().inverse());
      const inA=Math.hypot(loc.x-cA.x,loc.y-cA.y)<=rAp, inB=Math.hypot(loc.x-cB.x,loc.y-cB.y)<=rBp, inC=(counts.nC>0)&&Math.hypot(loc.x-cC.x,loc.y-cC.y)<=rCp;
      let region=null;
      if(inA&&!inB&&!inC) region='A'; else if(!inA&&inB&&!inC) region='B'; else if(!inA&&!inB&&inC) region='C';
      else if(inA&&inB&&!inC) region='AB'; else if(inA&&inC&&!inB) region='AC'; else if(inB&&inC&&!inA) region='BC'; else if(inA&&inB&&inC) region='ABC';
      if(region){ $('#regionSelect').value=region; populateRegion(region); }
    };
  }
  function exportSVG(){
    const xml=new XMLSerializer().serializeToString(stage);
    const blob=new Blob([xml],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    downloadURL(url,'venn.svg');
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function exportPNG(){
    const xml=new XMLSerializer().serializeToString(stage);
    const img=new Image();
    img.onload=function(){
      const c=document.createElement('canvas');
      c.width=stage.viewBox.baseVal.width; c.height=stage.viewBox.baseVal.height;
      const ctx=c.getContext('2d');
      ctx.drawImage(img,0,0);
      c.toBlob(b=>{ const url=URL.createObjectURL(b); downloadURL(url,'venn.png'); setTimeout(()=>URL.revokeObjectURL(url),5000); },'image/png');
    };
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
  }
  function downloadURL(url,name){ const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
  function downloadJSON(obj,name){
    console.log('downloadJSON', name);
    const blob=new Blob([JSON.stringify(obj)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    downloadURL(url,name);
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  window.downloadJSON = downloadJSON;
  async function verifyPermission(handle,write){
    try{
      console.log('verifyPermission',{handle,write});
      const opts=write?{mode:'readwrite'}:{};
      const q=await handle.queryPermission(opts);
      console.log('verifyPermission query',q);
      if(q==='granted') return true;
      const r=await handle.requestPermission(opts);
      console.log('verifyPermission request',r);
      return r==='granted';
    }catch(err){
      console.error('verifyPermission error',err);
      return false;
    }
  }
  window.verifyPermission = verifyPermission;
  function getVennGraphPayload(){
    return {
      type:'venn',
      data:{
        labelA:inputs.labelA.value,
        labelB:inputs.labelB.value,
        labelC:inputs.labelC.value,
        listA:inputs.A.value,
        listB:inputs.B.value,
        listC:inputs.C.value,
        nA:inputs.counts.nA.value,
        nB:inputs.counts.nB.value,
        nC:inputs.counts.nC.value,
        nAB:inputs.counts.nAB.value,
        nAC:inputs.counts.nAC.value,
        nBC:inputs.counts.nBC.value,
        nABC:inputs.counts.nABC.value
      },
      style:{
        colorA:inputs.colorA.value,
        colorB:inputs.colorB.value,
        colorC:inputs.colorC.value,
        opacity:inputs.opacity.value,
        borderColor:inputs.borderColor.value,
        borderWidth:inputs.borderWidth.value,
        fontsize:inputs.fontsize.value
      }
    };
  }
  let vennFileHandle=null, vennFileName='venn.graph';
  async function saveVennFile(){
    const payload=getVennGraphPayload();
    console.log('saveVennFile',{payload,vennFileHandle});
    if(vennFileHandle&&vennFileHandle.createWritable){
      try{
        const perm=await verifyPermission(vennFileHandle,true);
        console.log('saveVennFile permission',perm);
        if(perm){
          const w=await vennFileHandle.createWritable();
          await w.write(JSON.stringify(payload));
          await w.close();
        }
      }catch(err){console.error('saveVennFile error',err);}
    }else if(window.showSaveFilePicker){
      console.log('saveVennFile no handle - invoking saveAs');
      await saveAsVennFile();
    }else{
      console.log('saveVennFile fallback download');
      downloadJSON(payload,vennFileName);
    }
  }
  async function saveAsVennFile(){
    const payload=getVennGraphPayload();
    console.log('saveAsVennFile',payload);
    if(window.showSaveFilePicker){
      try{
        vennFileHandle=await window.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:vennFileName});
        const w=await vennFileHandle.createWritable();
        await w.write(JSON.stringify(payload));
        await w.close();
      }catch(err){console.error('saveAsVennFile error',err);}
    }else{
      downloadJSON(payload,vennFileName);
    }
  }
  async function openVennFile(){
    console.log('openVennFile start');
    if(window.showOpenFilePicker){
      try{
        [vennFileHandle]=await window.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]});
        const file=await vennFileHandle.getFile();
        vennFileName=file.name;
        loadVennGraphFile(file);
      }catch(err){console.error('openVennFile error',err);}
    }else{
      const input=document.getElementById('vennGraphFile');
      input.value='';
      input.click();
    }
  }
  function loadVennGraphFile(file){
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const obj=JSON.parse(e.target.result);
        console.log('loadVennGraph',obj);
        if(obj.type!=='venn') throw new Error('Invalid graph type');
        const d=obj.data||{};
        inputs.labelA.value=d.labelA||'';
        inputs.labelB.value=d.labelB||'';
        inputs.labelC.value=d.labelC||'';
        inputs.A.value=d.listA||'';
        inputs.B.value=d.listB||'';
        inputs.C.value=d.listC||'';
        const c=inputs.counts;
        c.nA.value=d.nA||0; c.nB.value=d.nB||0; c.nC.value=d.nC||0;
        c.nAB.value=d.nAB||0; c.nAC.value=d.nAC||0; c.nBC.value=d.nBC||0; c.nABC.value=d.nABC||0;
        const s=obj.style||{};
        inputs.colorA.value=s.colorA||inputs.colorA.value;
        inputs.colorB.value=s.colorB||inputs.colorB.value;
        inputs.colorC.value=s.colorC||inputs.colorC.value;
        inputs.opacity.value=s.opacity||inputs.opacity.value; inputs.opacityVal.textContent=inputs.opacity.value;
        inputs.borderColor.value=s.borderColor||inputs.borderColor.value;
        inputs.borderWidth.value=s.borderWidth||inputs.borderWidth.value; inputs.borderWidthVal.textContent=inputs.borderWidth.value;
        inputs.fontsize.value=s.fontsize||inputs.fontsize.value; inputs.fontsizeVal.textContent=inputs.fontsize.value;
        refreshDiagram();
      }catch(err){console.error('loadVennGraph error',err);}
    };
    reader.readAsText(file);
  }
  function exportGoChart(format){
    if(!goChart) return;
    const canvas=document.getElementById('goChart');
    let url;
    if(format==='png'){
      url=canvas.toDataURL('image/png');
    }else if(format==='svg'){
      try{
        const {labels}=goChart.data;
        const values=goChart.data.datasets[0].data;
        const color=goChart.data.datasets[0].backgroundColor;
        const width=canvas.width, height=canvas.height;
        const measureCtx=document.createElement('canvas').getContext('2d');
        measureCtx.font='12px sans-serif';
        const labelWidths=labels.map(l=>measureCtx.measureText(l).width);
        const maxLabelWidth=Math.ceil(Math.max(...labelWidths));
        const padding={left:maxLabelWidth+12,right:20,top:10,bottom:30};
        const chartWidth=width-padding.left-padding.right;
        const chartHeight=height-padding.top-padding.bottom;
        const barHeight=chartHeight/labels.length;
        const maxVal=Math.max(...values);
        let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
        svg+=`<rect width="${width}" height="${height}" fill="white"/>`;
        for(let i=0;i<labels.length;i++){
          const y=padding.top+i*barHeight;
          const barWidth=(values[i]/maxVal)*chartWidth;
          svg+=`<text x="4" y="${y+barHeight/2}" dominant-baseline="middle" font-size="12">${labels[i]}</text>`;
          svg+=`<rect x="${padding.left}" y="${y+barHeight*0.1}" width="${barWidth}" height="${barHeight*0.8}" fill="${color}"/>`;
          svg+=`<text x="${padding.left+barWidth+4}" y="${y+barHeight/2}" dominant-baseline="middle" font-size="12">${values[i].toFixed(2)}</text>`;
        }
        const axisY=padding.top+chartHeight;
        svg+=`<line x1="${padding.left}" y1="${axisY}" x2="${width-padding.right}" y2="${axisY}" stroke="black"/>`;
        svg+=`<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${axisY}" stroke="black"/>`;
        const ticks=5;
        for(let t=0;t<=ticks;t++){
          const v=(maxVal/ticks)*t;
          const x=padding.left+(v/maxVal)*chartWidth;
          svg+=`<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY+5}" stroke="black"/>`;
          svg+=`<text x="${x}" y="${axisY+15}" font-size="12" text-anchor="middle">${v.toFixed(2)}</text>`;
        }
        svg+=`<text x="${padding.left+chartWidth/2}" y="${height-5}" font-size="12" text-anchor="middle">-log10(p)</text>`;
        svg+='</svg>';
        const blob=new Blob([svg],{type:'image/svg+xml'});
        url=URL.createObjectURL(blob);
      }catch(err){
        return;
      }
    }
    downloadURL(url,'go_chart.'+format);
    if(format==='svg'){ setTimeout(()=>URL.revokeObjectURL(url),5000); }
  }
  async function downloadStringPNG(){
    if(!lastStringSVG) return;
    const svgBlob=new Blob([lastStringSVG],{type:'image/svg+xml'});
    const url=URL.createObjectURL(svgBlob);
    const img=new Image();
    img.src=url;
    await img.decode().catch(err=>{});
    const canvas=document.createElement('canvas');
    canvas.width=img.width; canvas.height=img.height;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0);
    URL.revokeObjectURL(url);
    canvas.toBlob(b=>{ const pngUrl=URL.createObjectURL(b); downloadURL(pngUrl,'string_network.png'); setTimeout(()=>URL.revokeObjectURL(pngUrl),5000); },'image/png');
  }
  function downloadStringSVG(){
    if(!lastStringSVG) return;
    const blob=new Blob([lastStringSVG],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    downloadURL(url,'string_network.svg');
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  const countsUI={A:$('#countA'),B:$('#countB'),C:$('#countC'),AB:$('#countAB'),AC:$('#countAC'),BC:$('#countBC'),ABC:$('#countABC')};
  const regionSelect=$('#regionSelect'), regionList=$('#regionList'), copyRegionBtn=$('#copyRegionBtn'), analysisResults=$('#analysisResults'), goBtn=$('#goBtn'), stringBtn=$('#stringBtn'), goResults=$('#goResults'), stringNetwork=$('#stringNetwork'), stringResults=$('#stringResults'), speciesSelect=$('#speciesSelect'), goChartExport=$('#goChartExport'), stringNetworkExport=$('#stringNetworkExport');
  const tooltip=$('#tooltip');
  const totalGenesInput=$('#totalGenes'), calcSignificanceBtn=$('#calcSignificance'), significanceResults=$('#significanceResults');
  let lastGOResult=null, lastGOFormatted=[], lastGOOrganism='hsapiens';
  let goChart=null, lastStringSVG=null;
  document.addEventListener('click',e=>{
    if(tooltip.style.display==='block' && !tooltip.contains(e.target)){
      tooltip.style.display='none';
    }
  });
  copyRegionBtn.addEventListener('click',()=>{
    const text=getRegionText(regionSelect.value);
    navigator.clipboard.writeText(text).then(()=>{}).catch(err=>{});
  });
  goOptsBtn.addEventListener('click',()=>{
    const show=goOptions.style.display==='none';
    goOptions.style.display=show?'block':'none';
  });
  stringOptsBtn.addEventListener('click',()=>{
    const show=stringOptions.style.display==='none';
    stringOptions.style.display=show?'block':'none';
  });
  ['A','B','C'].forEach(k=>{
    inputs[k].addEventListener('input',()=>{
      speciesSelect.value='';
    });
  });
  const uniProtCache={};
  function positionTooltip(x,y){
    let left=x, top=y;
    tooltip.style.left=left+'px';
    tooltip.style.top=top+'px';
    const rect=tooltip.getBoundingClientRect();
    const rightBound=window.scrollX+window.innerWidth-8;
    const bottomBound=window.scrollY+window.innerHeight-8;
    if(rect.right>rightBound){ left=Math.max(window.scrollX+8,rightBound-rect.width); }
    if(rect.bottom>bottomBound){ top=Math.max(window.scrollY+8,bottomBound-rect.height); }
    tooltip.style.left=left+'px';
    tooltip.style.top=top+'px';
  }
  async function fetchUniProtFunction(gene){
    const q=gene.toUpperCase();
    if(uniProtCache[q]) return uniProtCache[q];
    try{
      const url=`https://rest.uniprot.org/uniprotkb/search?query=gene_exact:${encodeURIComponent(q)}+AND+reviewed:true&fields=cc_function&format=json&size=1`;
      const resp=await fetch(url);
      if(!resp.ok) return null;
      const data=await resp.json();
      const value=data.results?.[0]?.comments?.find(c=>c.commentType==='FUNCTION')?.texts?.[0]?.value||null;
      uniProtCache[q]=value;
      return value;
    }catch(err){ return null; }
  }
  regionList.addEventListener('mouseover',async e=>{
    const link=e.target.closest('.gene-link');
    if(link&&regionList.contains(link)){
      const gene=link.dataset.gene;
      const fn=await fetchUniProtFunction(gene);
      tooltip.innerHTML=fn?`<strong>${gene}</strong><br>${fn}`:`<strong>${gene}</strong><br><i>Function not found</i>`;
      tooltip.style.fontSize='12px';
      tooltip.style.maxHeight='none';
      tooltip.style.overflow='visible';
      tooltip.style.columnCount=1;
      tooltip.style.columnWidth='auto';
      tooltip.style.columnGap='0';
      tooltip.style.width='auto';
      tooltip.style.height='auto';
      tooltip.style.whiteSpace='normal';
      let left=e.pageX+8;
      let top=e.pageY+8;
      tooltip.style.left=left+'px';
      tooltip.style.top=top+'px';
      tooltip.style.display='block';
      requestAnimationFrame(()=>{
        const w=tooltip.scrollWidth;
        const h=tooltip.scrollHeight;
        tooltip.style.width=w+'px';
        tooltip.style.height=h+'px';
        positionTooltip(left, top);
      });
    }
  });
  regionList.addEventListener('mouseout',e=>{
    const link=e.target.closest('.gene-link');
    if(link&&regionList.contains(link)){
      tooltip.style.display='none';
    }
  });
  regionList.addEventListener('click',async e=>{
    const link=e.target.closest('.gene-link');
    if(link&&regionList.contains(link)){
      const gene=link.dataset.gene;
      const taxId=speciesSelect.selectedOptions[0].dataset.string||'9606';
      const apiUrl=`https://rest.uniprot.org/uniprotkb/search?query=gene_exact:${encodeURIComponent(gene)}+AND+organism_id:${taxId}+AND+reviewed:true&fields=accession&format=json&size=1`;
      try{
        const resp=await fetch(apiUrl);
        const data=await resp.json();
        const acc=data.results?.[0]?.primaryAccession;
        const url=acc?`https://www.uniprot.org/uniprotkb/${acc}/entry`:`https://www.uniprot.org/uniprotkb?query=gene_exact:${encodeURIComponent(gene)}+AND+reviewed:true`;
        window.open(url,'_blank','noopener');
      }catch(err){
        const url=`https://www.uniprot.org/uniprotkb?query=gene_exact:${encodeURIComponent(gene)}+AND+reviewed:true`;
        window.open(url,'_blank','noopener');
      }
    }
  });
  const goBtnTip='Sends the selected species and gene list to g:Profiler GOSt, returns all GO categories and default sources, and displays the top five terms by significance.';
  goBtn.addEventListener('mouseenter',()=>{
    tooltip.innerHTML=goBtnTip;
    tooltip.style.fontSize='12px';
    tooltip.style.maxHeight='none';
    tooltip.style.overflow='visible';
    tooltip.style.columnCount=1;
    tooltip.style.columnWidth='auto';
    tooltip.style.width='max-content';
    tooltip.style.height='auto';
    tooltip.style.visibility='hidden';
    tooltip.style.display='block';
    const rect=goBtn.getBoundingClientRect();
    let left=rect.right+window.scrollX+8;
    let top=rect.top+window.scrollY;
    tooltip.style.left=left+'px';
    tooltip.style.top=top+'px';
    positionTooltip(left, top);
    let tRect=tooltip.getBoundingClientRect();
    const overlaps=!(tRect.right<rect.left || tRect.left>rect.right || tRect.bottom<rect.top || tRect.top>rect.bottom);
    if(overlaps){
      left=rect.left+window.scrollX;
      top=rect.bottom+window.scrollY+8;
      tooltip.style.left=left+'px';
      tooltip.style.top=top+'px';
      positionTooltip(left, top);
      tRect=tooltip.getBoundingClientRect();
      const stillOverlap=!(tRect.right<rect.left || tRect.left>rect.right || tRect.bottom<rect.top || tRect.top>rect.bottom);
      if(stillOverlap){
        top=rect.top+window.scrollY-tRect.height-8;
        tooltip.style.left=left+'px';
        tooltip.style.top=top+'px';
        positionTooltip(left, top);
      }
    }
    tooltip.style.visibility='visible';
  });
  goBtn.addEventListener('mouseleave',()=>{
    tooltip.style.display='none';
  });
  function renderGOChart(limit=5){
    if(!lastGOResult||!lastGOResult.length){
      document.getElementById('goChart').style.display='none';
      document.getElementById('goChartExport').style.display='none';
      if(goChart){ goChart.destroy(); goChart=null; }
      return;
    }
    const data=lastGOResult.slice(0,limit);
    const labels=data.map(r=>r.term_name||r.name||'');
    const values=data.map(r=>-Math.log10(r.p_value));
    const barColor='#64b5f6';
    if(goChart){ goChart.destroy(); }
    document.getElementById('goChart').style.display='block';
    document.getElementById('goChartExport').style.display='flex';
    const isAll=limit>5;
    const baseBarHeight=25;
    const minBarHeight=18;
    const barHeight=isAll?minBarHeight:baseBarHeight;
    const chartHeight=Math.max(300,barHeight*labels.length);
    const canvas=document.getElementById('goChart');
    canvas.style.height=chartHeight+'px';
    canvas.height=chartHeight;
    canvas.width=canvas.offsetWidth;
    const ctx=canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    const config={
      type:'bar',
      data:{labels,datasets:[{label:'-log10(p)',data:values,backgroundColor:barColor,barThickness:barHeight-5}]},
      options:{
        indexAxis:'y',
        responsive:false,
        maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{
          x:{
            title:{display:true,text:'-log10(p)'},
            grid:{display:false},
            ticks:{callback:v=>v.toLocaleString('en-US',{maximumFractionDigits:2})}
          },
          y:{grid:{display:false},ticks:{autoSkip:false}}
        }
      },
      locale:'en-US'
    };
    goChart=new Chart(ctx,config);
  }
  function renderGOResults(limit=5){
    if(!lastGOResult||!lastGOResult.length){ goResults.innerHTML='<div>No GO results</div>'; return; }
    const items=lastGOResult.slice(0,limit).map(r=>{
      const term=r.term_name||r.name||'unknown term';
      const src=r.source||'unknown source';
      return `<div>${term} [${src}] (p=${Number(r.p_value).toExponential(2)})</div>`;
    }).join('');
    const fullUrl=`https://biit.cs.ut.ee/gprofiler/gost?organism=${lastGOOrganism}&query=${encodeURIComponent(lastGOFormatted.join('\n'))}`;
    const link=`<div><a href="${fullUrl}" target="_blank" rel="noopener">View full GO analysis</a>${lastGOResult.length>5?` | <button class="btn" id="toggleGoResults" data-state="${limit===5?'top5':'all'}">${limit===5?'Show all results':'Show top 5'}</button>`:''}</div>`;
    goResults.innerHTML=`<strong>${limit===5?'Top 5 GO terms':'All GO terms'}</strong>`+items+link;
    renderGOChart(limit);
  }
  goResults.addEventListener('click',e=>{
    if(e.target.id==='toggleGoResults'){
      const state=e.target.dataset.state;
      if(state==='top5'){ renderGOResults(lastGOResult.length); }
      else{ renderGOResults(5); }
    }
  });
  function clearAnalysis(){
    goResults.innerHTML='';
    stringResults.innerHTML='';
    stringNetwork.innerHTML='';
    if(goChart){ goChart.destroy(); goChart=null; }
    const canvas=document.getElementById('goChart');
    canvas.style.display='none';
    goChartExport.style.display='none';
    stringNetworkExport.style.display='none';
  }
  regionSelect.addEventListener('change',()=>{ populateRegion(regionSelect.value); });
  speciesSelect.addEventListener('change',()=>{});
  let lastRegions=null, lastDrawMode=null, lastCounts=null;
  function refreshDiagram(){
    if(!lastDrawMode) return;
    if(lastDrawMode==='lists') drawFromLists(); else drawFromNumeric();
  }
  function populateRegion(code){
    clearAnalysis();
    if(!lastRegions) return;
    const map={A:lastRegions.Aonly,B:lastRegions.Bonly,C:lastRegions.Conly,AB:lastRegions.AB,AC:lastRegions.AC,BC:lastRegions.BC,ABC:lastRegions.ABC};
    const arr=[...(map[code]||new Set())].sort();
    regionList.innerHTML=arr.length?arr.map(x=>`<div class="gene-item">${x}<span class="gene-link" data-gene="${x}">&#128279;</span></div>`).join(''):'(empty)';
    copyRegionBtn.style.display=arr.length?'block':'none';
  }
  function getRegionText(code){
    if(!lastRegions) return '';
    const map={A:lastRegions.Aonly,B:lastRegions.Bonly,C:lastRegions.Conly,AB:lastRegions.AB,AC:lastRegions.AC,BC:lastRegions.BC,ABC:lastRegions.ABC};
    const genes=[...(map[code]||new Set())];
    return genes.join('\n');
  }
  function logFact(n){
    let res=0;
    for(let i=2;i<=n;i++) res+=Math.log(i);
    return res;
  }
  function logChoose(n,k){
    if(k<0||k>n) return -Infinity;
    return logFact(n)-logFact(k)-logFact(n-k);
  }
  function hypergeomPval(N,K,n,k){
    let p=0;
    for(let i=k;i<=Math.min(K,n);i++){
      const term=Math.exp(logChoose(K,i)+logChoose(N-K,n-i)-logChoose(N,n));
      p+=term;
    }
    return p;
  }
  function calculateSignificance(){
    if(!lastCounts){
      significanceResults.textContent='Draw a Venn diagram first.';
      return;
    }
    const total=+totalGenesInput.value;
    if(!total||total<Math.max(lastCounts.nA,lastCounts.nB,lastCounts.nC)){
      significanceResults.textContent='Please enter a valid total gene count.';
      return;
    }
    const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'};
    const res=[];
    const pAB=hypergeomPval(total,lastCounts.nA,lastCounts.nB,lastCounts.AB+lastCounts.ABC);
    res.push({name:`${labels.A}∩${labels.B}`,p:pAB});
    if(lastCounts.nC>0){
      const pAC=hypergeomPval(total,lastCounts.nA,lastCounts.nC,lastCounts.AC+lastCounts.ABC);
      res.push({name:`${labels.A}∩${labels.C}`,p:pAC});
      const pBC=hypergeomPval(total,lastCounts.nB,lastCounts.nC,lastCounts.BC+lastCounts.ABC);
      res.push({name:`${labels.B}∩${labels.C}`,p:pBC});
      const pABC=hypergeomPval(total,lastCounts.AB+lastCounts.ABC,lastCounts.nC,lastCounts.ABC);
      res.push({name:`${labels.A}∩${labels.B}∩${labels.C}`,p:pABC});
    }
    significanceResults.innerHTML='<table><tr><th>Overlap</th><th>p-value</th><th>Significant</th></tr>'+
      res.map(r=>`<tr><td>${r.name}</td><td>${r.p.toExponential(2)}</td><td>${r.p<0.05?'yes':'no'}</td></tr>`).join('')+
      '</table>';
  }
  async function guessSpecies(genes){
    const counts={hsapiens:0,mmusculus:0,dmelanogaster:0,celegans:0};
    const taxMap={'9606':'hsapiens','10090':'mmusculus','7227':'dmelanogaster','6239':'celegans'};
    const sample=genes.slice(0,20);
    for(const g of sample){
      const url=`https://mygene.info/v3/query?q=${encodeURIComponent(g)}&fields=symbol,taxid&species=9606,10090,7227,6239&size=5`;
      try{
        const resp=await fetch(url);
        if(!resp.ok) continue;
        const data=await resp.json();
        const hit=data.hits?.find(h=>h.symbol===g) ||
                  data.hits?.find(h=>h.symbol?.toLowerCase()===g.toLowerCase()) ||
                  data.hits?.[0];
        const tax=hit?.taxid?.toString();
        const sp=taxMap[tax];
        if(sp) counts[sp]++;
      }catch(err){}
    }
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    if(total===0) return null;
    const [best,bestScore]=Object.entries(counts).reduce((m,e)=>e[1]>m[1]?e:m,['',0]);
    if(bestScore/total<0.6) return null;
    return best;
  }
  function getAllGenes(){
    const mode=inputs.delimiter.value, cs=inputs.caseSensitive.checked;
    const A=parseList(inputs.A.value,cs,mode).map(o=>o.val);
    const B=parseList(inputs.B.value,cs,mode).map(o=>o.val);
    const C=parseList(inputs.C.value,cs,mode).map(o=>o.val);
    const unique=[...new Set([...A,...B,...C])];
    return unique;
  }
  function setSpeciesIndicator(success){
    if(success===null){
      speciesSelect.style.backgroundColor='';
      return;
    }
    const color=success?'#b5d99c':'#f28b82';
    speciesSelect.style.backgroundColor=color;
  }
  async function recognizeSpeciesFromInput(){
    const genes=getAllGenes();
    const guess=genes.length?await guessSpecies(genes):null;
    if(guess){
      speciesSelect.value=guess;
      setSpeciesIndicator(true);
    }else{
      speciesSelect.value='';
      setSpeciesIndicator(false);
    }
  }
  function runGOAnalysis(genes, organism){
    const formatted=genes.map(g=>g.trim().toUpperCase()).filter(x=>x);
    if(!formatted.length){ goResults.innerHTML='<i>No genes for analysis</i>'; return; }
    const org=organism || speciesSelect.value;
    if(!org){
      goResults.innerHTML='<div>Please select a species before running GO analysis.</div>';
      return;
    }
    const sources=goCategoryChecks.filter(cb=>cb.checked).map(cb=>cb.value);
    if(!sources.length){
      goResults.innerHTML='<div>Please select at least one GO category.</div>';
      return;
    }
    lastGOFormatted=formatted;
    lastGOOrganism=org;
    lastGOResult=null;
    renderGOChart();
    goResults.innerHTML='<i>Running GO analysis...</i>';
    const body={organism:org,query:formatted,sources:sources};
    if(goUseAllBackground.checked){
      const bg=getAllGenes().map(g=>g.trim().toUpperCase()).filter(x=>x);
      if(bg.length){
        body.background=bg;
        body.domain_scope='custom';
      }
    }
    fetch('https://biit.cs.ut.ee/gprofiler/api/gost/profile/',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    }).then(r=>{
      if(!r.ok) throw new Error('GO API HTTP '+r.status);
      return r.json();
    }).then(d=>{
      lastGOResult=(d.result||[]).filter(r=>sources.includes(r.source));
      if(lastGOResult.length){
        renderGOResults(5);
      }else{
        goResults.innerHTML='<div>No GO results</div>';
      }
    }).catch(err=>{
      goResults.innerHTML='<div>Error fetching GO analysis</div>';
    });
  }
  function runStringAnalysis(genes, organism){
    const formatted=genes.map(g=>g.trim().toUpperCase()).filter(x=>x);
    if(!formatted.length){ stringNetwork.innerHTML=''; stringResults.innerHTML='<i>No genes for analysis</i>'; stringNetworkExport.style.display='none'; return; }
    const org=organism || speciesSelect.value;
    if(!org){
      stringNetwork.innerHTML='';
      stringResults.innerHTML='<div>Please select a species before running STRING analysis.</div>';
      stringNetworkExport.style.display='none';
      return;
    }
    stringNetwork.innerHTML='<i>Loading STRING network...</i>';
    stringResults.innerHTML='<i>Running STRING enrichment...</i>';
    stringNetworkExport.style.display='none';
    const params=new URLSearchParams();
    const joinedIds=formatted.join('\n');
    params.set('identifiers', joinedIds);
    const stringMap={hsapiens:'9606',mmusculus:'10090',dmelanogaster:'7227',celegans:'6239'};
    const stringSpecies=stringMap[org]||speciesSelect.selectedOptions[0]?.dataset.string||'9606';
    params.set('species', stringSpecies);
    const networkType=document.querySelector('input[name="stringNetworkType"]:checked').value;
    const edgeMeaning=document.querySelector('input[name="stringEdgeMeaning"]:checked').value;
    const sources=[...document.querySelectorAll('.stringSource:checked')].map(el=>el.value);
    params.set('network_type', networkType);
    params.set('network_flavor', edgeMeaning);
    if(sources.length) params.set('sources', sources.join('%0d'));
    const networkUrl='https://string-db.org/api/svg/network?'+params.toString();
    fetch(networkUrl)
    .then(r=>{ if(!r.ok) throw new Error('STRING network HTTP '+r.status); return r.text(); })
    .then(svgText=>{
      lastStringSVG=svgText;
      const wrapper=document.createElement('div');
      wrapper.innerHTML=svgText;
      const svgEl=wrapper.querySelector('svg');
      stringNetwork.innerHTML='';
      if(svgEl){
        svgEl.style.maxWidth='150%';
        stringNetwork.appendChild(svgEl);
        stringNetworkExport.style.display='flex';
      }else{
        stringNetwork.innerHTML='<div>Failed to load STRING network</div>';
      }
    })
    .catch(err=>{
      stringNetwork.innerHTML='<div>Error loading STRING network</div>';
      stringNetworkExport.style.display='none';
    });
    fetch('https://string-db.org/api/json/enrichment?'+params.toString())
    .then(r=>{
      if(!r.ok) throw new Error('STRING API HTTP '+r.status);
      return r.json();
    }).then(d=>{
      if(Array.isArray(d)){
        const items=d.slice(0,5).map(r=>{
          const desc=r.termDescription||r.description||'unknown term';
          return '<div>'+desc+' (FDR='+Number(r.fdr).toExponential(2)+')</div>';
        }).join('');
        stringResults.innerHTML='<strong>STRING enrichment</strong>'+items;
      }else{
        stringResults.innerHTML='<div>No STRING results</div>';
      }
    }).catch(err=>{
      stringResults.innerHTML='<div>Error fetching STRING analysis</div>';
    });
  }
  function refreshCounts(c){
    countsUI.A.textContent=c.nA;
    countsUI.B.textContent=c.nB;
    countsUI.C.textContent=c.nC;
    countsUI.AB.textContent=c.AB+c.ABC;
    countsUI.AC.textContent=c.AC+c.ABC;
    countsUI.BC.textContent=c.BC+c.ABC;
    countsUI.ABC.textContent=c.ABC;
  }
  function updateCountLabels(labels){
    $('#labelAName').textContent=labels.A;
    $('#labelBName').textContent=labels.B;
    $('#labelCName').textContent=labels.C;
    $('#labelABName').textContent=labels.A+'∩'+labels.B;
    $('#labelACName').textContent=labels.A+'∩'+labels.C;
    $('#labelBCName').textContent=labels.B+'∩'+labels.C;
    $('#labelABCName').textContent=labels.A+'∩'+labels.B+'∩'+labels.C;
  }
  function updateRegionSelect(labels){
    const map={
      A:labels.A+' only',
      B:labels.B+' only',
      C:labels.C+' only',
      AB:labels.A+'∩'+labels.B+' only',
      AC:labels.A+'∩'+labels.C+' only',
      BC:labels.B+'∩'+labels.C+' only',
      ABC:labels.A+'∩'+labels.B+'∩'+labels.C
    };
    [...regionSelect.options].forEach(o=>{ if(map[o.value]) o.textContent=map[o.value]; });
  }
  function updateColorLabels(labels){
    $('#colorLabelA').textContent=labels.A;
    $('#colorLabelB').textContent=labels.B;
    $('#colorLabelC').textContent=labels.C;
  }
  function drawFromLists(){
    const mode=inputs.delimiter.value, cs=inputs.caseSensitive.checked;
    const A=parseList(inputs.A.value,cs,mode), B=parseList(inputs.B.value,cs,mode), C=parseList(inputs.C.value,cs,mode);
    const regions=setsFromLists(A,B,C); lastRegions=regions; lastDrawMode='lists';
    const counts={nA:regions.A.size,nB:regions.B.size,nC:regions.C.size,Aonly:regions.Aonly.size,Bonly:regions.Bonly.size,Conly:regions.Conly.size,AB:regions.AB.size,AC:regions.AC.size,BC:regions.BC.size,ABC:regions.ABC.size};
    lastCounts=counts;
    significanceResults.innerHTML='';
    refreshCounts(counts);
    const pairs={nAB:counts.AB+counts.ABC,nAC:counts.AC+counts.ABC,nBC:counts.BC+counts.ABC};
    const L=layoutFromCounts(counts.nA,counts.nB,counts.nC,pairs.nAB,pairs.nAC,pairs.nBC);
    const style={colorA:inputs.colorA.value,colorB:inputs.colorB.value,colorC:inputs.colorC.value,opacity:inputs.opacity.value,fontsize:inputs.fontsize.value,borderColor:inputs.borderColor.value,borderWidth:inputs.borderWidth.value};
    const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'};
    updateCountLabels(labels); updateRegionSelect(labels); updateColorLabels(labels);
    fitAndDraw(L,style,labels,counts);
    populateRegion(regionSelect.value);
    recognizeSpeciesFromInput().catch(err=>{});
    console.log('drawFromLists complete with enhanced styles');
  }
  function drawFromNumeric(){
    const nA=+inputs.counts.nA.value||0, nB=+inputs.counts.nB.value||0, nC=+inputs.counts.nC.value||0;
    const nAB=+inputs.counts.nAB.value||0, nAC=+inputs.counts.nAC.value||0, nBC=+inputs.counts.nBC.value||0, nABC=+inputs.counts.nABC.value||0;
    const Aonly=Math.max(0,nA-(nAB+nAC-nABC)), Bonly=Math.max(0,nB-(nAB+nBC-nABC)), Conly=Math.max(0,nC-(nAC+nBC-nABC));
    const counts={nA,nB,nC,Aonly,Bonly,Conly,AB:Math.max(0,nAB-nABC),AC:Math.max(0,nAC-nABC),BC:Math.max(0,nBC-nABC),ABC:nABC};
    lastRegions={A:new Set(),B:new Set(),C:new Set(),Aonly:new Set(),Bonly:new Set(),Conly:new Set(),AB:new Set(),AC:new Set(),BC:new Set(),ABC:new Set()}; lastDrawMode='numeric';
    lastCounts=counts;
    significanceResults.innerHTML='';
    refreshCounts(counts);
    const L=layoutFromCounts(nA,nB,nC,nAB,nAC,nBC);
    const style={colorA:inputs.colorA.value,colorB:inputs.colorB.value,colorC:inputs.colorC.value,opacity:inputs.opacity.value,fontsize:inputs.fontsize.value,borderColor:inputs.borderColor.value,borderWidth:inputs.borderWidth.value};
    const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'};
    updateCountLabels(labels); updateRegionSelect(labels); updateColorLabels(labels);
    fitAndDraw(L,style,labels,counts);
    populateRegion(regionSelect.value);
    console.log('drawFromNumeric complete with enhanced styles');
  }
  if (window.Components && window.Components.venn && window.Components.venn.__installed) {
    console.debug('Debug: skipping legacy Venn event listeners in main.js');
  } else {
    document.getElementById('draw').addEventListener('click',drawFromLists);
    document.getElementById('useNumeric').addEventListener('click',drawFromNumeric);
    document.getElementById('exportSVG').addEventListener('click',exportSVG);
    document.getElementById('exportPNG').addEventListener('click',exportPNG);
    document.getElementById('openVenn').addEventListener('click',openVennFile);
    document.getElementById('saveVenn').addEventListener('click',saveVennFile);
    document.getElementById('saveAsVenn').addEventListener('click',saveAsVennFile);
    document.getElementById('vennGraphFile').addEventListener('change',e=>{
      const f=e.target.files[0];
      if(f){
        vennFileName=f.name;
        vennFileHandle=null;
        loadVennGraphFile(f);
      }
    });
    document.getElementById('goChartPNG').addEventListener('click',()=>{ exportGoChart('png');});
    document.getElementById('goChartSVG').addEventListener('click',()=>{ exportGoChart('svg');});
    document.getElementById('stringPNG').addEventListener('click',()=>{ downloadStringPNG();});
    document.getElementById('stringSVG').addEventListener('click',()=>{ downloadStringSVG();});
    calcSignificanceBtn.addEventListener('click',calculateSignificance);
    document.getElementById('sample').addEventListener('click',()=>{
      inputs.labelA.value='Transcriptomic'; inputs.labelB.value='Proteomic'; inputs.labelC.value='Phospho';
      inputs.A.value=`BRCA1
ATM
BAP1
EZH2
SUZ12
RING1B`;
      inputs.B.value=`BRCA1
BAP1
RING1B
CBX2
HDAC1
PAXIP1
HUWE1`;
      inputs.C.value=`BRCA1
PAXIP1
CSNK2A1
RING1B
KAT7`;
      drawFromLists();
    });
    document.getElementById('reset').addEventListener('click',()=>{
      inputs.A.value=''; inputs.B.value=''; inputs.C.value='';
      Object.values(inputs.counts).forEach(x=>x.value=0);
      clearSVG(); lastRegions=null; lastDrawMode=null; lastCounts=null; regionList.textContent='';
      Object.values({A:1,B:1,C:1,AB:1,AC:1,BC:1,ABC:1}).forEach((_,i)=>{});
      document.getElementById('countA').textContent='0';
      document.getElementById('countB').textContent='0';
      document.getElementById('countC').textContent='0';
      document.getElementById('countAB').textContent='0';
      document.getElementById('countAC').textContent='0';
      document.getElementById('countBC').textContent='0';
      document.getElementById('countABC').textContent='0';
      updateCountLabels({A:'A',B:'B',C:'C'});
      updateColorLabels({A:'A',B:'B',C:'C'});
      updateRegionSelect({A:'A',B:'B',C:'C'});
      clearAnalysis();
      speciesSelect.value='';
      setSpeciesIndicator(null);
      totalGenesInput.value='';
      significanceResults.innerHTML='';
    });
    goBtn.addEventListener('click',async()=>{
      const regionGenes=getRegionText(regionSelect.value).split(/\n/).map(g=>g.trim()).filter(x=>x);
      let organism=speciesSelect.value;
      if(!organism){
        const allGenes=getAllGenes();
        const guess=allGenes.length?await guessSpecies(allGenes):null;
        if(guess){
          speciesSelect.value=organism=guess;
          setSpeciesIndicator(true);
        }else{
          setSpeciesIndicator(false);
          alert('Please select a species before running GO analysis.');
          return;
        }
      }
      runGOAnalysis(regionGenes, organism);
    });
    stringBtn.addEventListener('click',async()=>{
      const regionGenes=getRegionText(regionSelect.value).split(/\n/).map(g=>g.trim()).filter(x=>x);
      let organism=speciesSelect.value;
      if(!organism){
        const allGenes=getAllGenes();
        const guess=allGenes.length?await guessSpecies(allGenes):null;
        if(guess){
          speciesSelect.value=organism=guess;
          setSpeciesIndicator(true);
        }else{
          setSpeciesIndicator(false);
          alert('Please select a species before running STRING analysis.');
          return;
        }
      }
      runStringAnalysis(regionGenes, organism);
    });
  }
  // Expose Venn APIs to component namespace instead of global window
  try {
    if (window.Components && window.Components.venn) {
      const V = window.Components.venn;
      V.layoutFromCounts = layoutFromCounts;
      V.fitAndDraw = fitAndDraw;
      V.refreshCounts = refreshCounts;
      V.updateCountLabels = updateCountLabels;
      V.updateRegionSelect = updateRegionSelect;
      V.updateColorLabels = updateColorLabels;
      V.setSpeciesIndicator = setSpeciesIndicator;
      V.recognizeSpeciesFromInput = recognizeSpeciesFromInput;
      V.clearAnalysis = clearAnalysis;
      V.serializeCleanSVG = serializeCleanSVG;
      V.getRegionText = getRegionText;
      V.getAllGenes = getAllGenes;
      V.guessSpecies = guessSpecies;
      V.runGOAnalysis = runGOAnalysis;
      V.runStringAnalysis = runStringAnalysis;
      V.exportGoChart = exportGoChart;
      V.downloadStringPNG = downloadStringPNG;
      V.downloadStringSVG = downloadStringSVG;
      V.drawFromLists = drawFromLists;
      V.drawFromNumeric = drawFromNumeric;
      console.debug('Debug: Venn API exported to Components.venn');
    }
  } catch (e) { console.error('Venn API export error', e); }
  function showVenn(){
    vennPage.style.display='block';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabVenn.classList.add('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabPca.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.venn && typeof window.Components.venn.ensure === 'function') {
        window.Components.venn.ensure();
      }
    }catch(e){ console.error('showVenn ensure error', e); }
  }
  function showBox(){
    vennPage.style.display='none';
    boxPage.style.display='block';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabBox.classList.add('active');
    tabVenn.classList.remove('active');
    tabScatter.classList.remove('active');
    tabPca.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.hist && typeof window.Components.hist.ensure === 'function') {
        window.Components.hist.ensure();
      }
      scheduleDrawHist();
    }catch(e){ console.error('showHist schedule error', e); }
  }
  function showScatter(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='block';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabScatter.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabPca.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.scatter && typeof window.Components.scatter.ensure === 'function') {
        window.Components.scatter.ensure();
        scheduleDrawScatter();
      }
    }catch(e){ console.error('showScatter ensure error', e); }
  }
  function showPca(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='block';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabPca.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.pca && typeof window.Components.pca.ensure === 'function') {
        window.Components.pca.ensure();
        scheduleDrawPca();
      }
    }catch(e){ console.error('showPca ensure error', e); }
  }
  function showLine(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='block';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabLine.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabPca.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.line && typeof window.Components.line.ensure === 'function') {
        window.Components.line.ensure();
        scheduleDrawLine();
      }
    }catch(e){ console.error('showLine ensure error', e); }
  }
  function showRoc(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='block';
    histPage.style.display='none';
    piePage.style.display='none';
    tabRoc.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabLine.classList.remove('active');
    tabPca.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
  }
  function showHist(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='block';
    piePage.style.display='none';
    tabHist.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabPca.classList.remove('active');
    tabPie.classList.remove('active');
  }
  function showPie(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='block';
    tabPie.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPca.classList.remove('active');
    try{
      if (window.Components && window.Components.pie && typeof window.Components.pie.ensure === 'function') {
        window.Components.pie.ensure();
      }
      scheduleDrawPie();
    }catch(e){ console.error('showPie schedule error', e); }
  }
  tabVenn.addEventListener('click',()=>{ showVenn();});
  tabBox.addEventListener('click',()=>{ showBox();});
  tabScatter.addEventListener('click',()=>{ showScatter();});
  tabPca.addEventListener('click',()=>{ showPca();});
  tabLine.addEventListener('click',()=>{ showLine();});
  tabRoc.addEventListener('click',()=>{ showRoc();});
  tabHist.addEventListener('click',()=>{ showHist();});
  tabPie.addEventListener('click',()=>{ showPie();});
  showVenn();
  function tTest(a,b){
    const meanA=jStat.mean(a), meanB=jStat.mean(b);
    const varA=jStat.variance(a,true), varB=jStat.variance(b,true);
    const nA=a.length, nB=b.length;
    const t=(meanA-meanB)/Math.sqrt(varA/nA+varB/nB);
    const df=Math.pow(varA/nA+varB/nB,2)/(Math.pow(varA/nA,2)/(nA-1)+Math.pow(varB/nB,2)/(nB-1));
    const p=2*(1-jStat.studentt.cdf(Math.abs(t),df));
    return {t,df,p};
  }
  function tTestPaired(a,b){
    const n=Math.min(a.length,b.length);
    const diffs=[];
    for(let i=0;i<n;i++) diffs.push(a[i]-b[i]);
    const mean=jStat.mean(diffs);
    const sd=jStat.stdev(diffs,true);
    const t=mean/(sd/Math.sqrt(n));
    const df=n-1;
    const p=2*(1-jStat.studentt.cdf(Math.abs(t),df));
    return {t,df,p};
  }
  function rank(arr){
    const sorted=arr.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
    const ranks=Array(arr.length);
    for(let i=0;i<sorted.length;i++){
      let j=i;
      while(j<sorted.length && sorted[j].v===sorted[i].v) j++;
      const avg=(i+j-1)/2+1;
      for(let k=i;k<j;k++) ranks[sorted[k].i]=avg;
      i=j-1;
    }
    return ranks;
  }
  function mannWhitney(a,b){
    const all=a.concat(b);
    const ranks=rank(all);
    const ranksA=ranks.slice(0,a.length);
    const R1=ranksA.reduce((s,r)=>s+r,0);
    const n1=a.length, n2=b.length;
    const U1=R1 - n1*(n1+1)/2;
    const U2=n1*n2 - U1;
    const U=Math.min(U1,U2);
    const mu=n1*n2/2;
    const sigma=Math.sqrt(n1*n2*(n1+n2+1)/12);
    const z=(U-mu)/sigma;
    const p=2*(1-jStat.normal.cdf(Math.abs(z),0,1));
    return {U,z,p};
  }
  function wilcoxonSignedRank(a,b){
    const n=Math.min(a.length,b.length);
    const diffs=[];
    for(let i=0;i<n;i++){
      const d=a[i]-b[i];
      if(d!==0) diffs.push(d);
    }
    const absSorted=diffs.map((d,i)=>({d,abs:Math.abs(d),i})).sort((x,y)=>x.abs-y.abs);
    const ranks=new Array(absSorted.length);
    let r=1;
    for(let i=0;i<absSorted.length;i++){
      let j=i;
      while(j<absSorted.length&&absSorted[j].abs===absSorted[i].abs) j++;
      const avg=(r+(r+j-i-1))/2;
      for(let k=i;k<j;k++) ranks[absSorted[k].i]=avg;
      r+=j-i;
      i=j-1;
    }
    let Wpos=0,Wneg=0;
    ranks.forEach((rk,i)=>{ if(diffs[i]>0) Wpos+=rk; else Wneg+=rk; });
    const W=Math.min(Wpos,Wneg);
    const nEff=ranks.length;
    const mu=nEff*(nEff+1)/4;
    const sigma=Math.sqrt(nEff*(nEff+1)*(2*nEff+1)/24);
    const z=(W-mu)/sigma;
    const p=2*(1-jStat.normal.cdf(Math.abs(z),0,1));
    return {W,z,p};
  }
  function p2stars(p){
    const stars=p<0.0001?'****':p<0.001?'***':p<0.01?'**':p<0.05?'*':'ns';
    return stars;
  }
  function formatP(p){
    return p.toLocaleString('en-US',{maximumSignificantDigits:6});
  }
  const mean=arr=>arr.reduce((s,v)=>s+v,0)/arr.length;
  function anova(groups){
    const k=groups.length;
    const n=groups.reduce((s,g)=>s+g.length,0);
    const grand=groups.reduce((s,g)=>s+mean(g)*g.length,0)/n;
    let ssBetween=0, ssWithin=0;
    groups.forEach(g=>{
      const m=mean(g);
      ssBetween+=g.length*Math.pow(m-grand,2);
      ssWithin+=g.reduce((s,v)=>s+Math.pow(v-m,2),0);
    });
    const dfBetween=k-1;
    const dfWithin=n-k;
    const msBetween=ssBetween/dfBetween;
    const msWithin=ssWithin/dfWithin;
    const F=msBetween/msWithin;
    const p=1-jStat.centralF.cdf(F,dfBetween,dfWithin);
    return {F,p};
  }
  function rankArray(arr){
    const sorted=arr.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
    const ranks=new Array(arr.length);
    let i=0;
    while(i<sorted.length){
      let j=i;
      while(j<sorted.length && sorted[j].v===sorted[i].v) j++;
      const avg=(i+j-1)/2+1;
      for(let k=i;k<j;k++) ranks[sorted[k].i]=avg;
      i=j;
    }
    return ranks;
  }
  function kruskalWallis(groups){
    const n=groups.reduce((s,g)=>s+g.length,0);
    const all=groups.flat();
    const ranks=rankArray(all);
    let idx=0;
    const R=groups.map(g=>{
      const r=ranks.slice(idx, idx+g.length).reduce((a,b)=>a+b,0);
      idx+=g.length;
      return r;
    });
    const H=(12/(n*(n+1)))*R.reduce((sum,ri,i)=>sum+Math.pow(ri,2)/groups[i].length,0)-3*(n+1);
    const df=groups.length-1;
    const p=1-jStat.chisquare.cdf(H,df);
    return {H,p};
  }
  function parsePairString(str,traces){
    return str.split(/[\n,]+/).map(p=>p.trim()).filter(p=>p).map(p=>{
      const [a,b]=p.split('-').map(s=>s.trim());
      const ai=isNaN(parseInt(a))?traces.findIndex(t=>t.name===a):parseInt(a)-1;
      const bi=isNaN(parseInt(b))?traces.findIndex(t=>t.name===b):parseInt(b)-1;
      return (ai>=0&&bi>=0)?{ai,bi}:null;
    }).filter(Boolean);
  }
  function renderStatsControls(traces){
    const controls=document.getElementById('statsControls');
    controls.innerHTML='';
    if(selectedCols.size<2 && traces.length>=2){
      selectedCols.clear();
      selectedCols.add(0);
      selectedCols.add(1);
    }
    if(statsMode==='reference' && !selectedCols.has(statsRef)){
      selectedCols.add(statsRef);
    }
    const optionWrap=document.createElement('div');
    const testLabel=document.createElement('label');
    testLabel.textContent='Test:';
    const testSel=document.createElement('select');
    ['parametric','nonparametric'].forEach(v=>{
      const o=document.createElement('option');
      o.value=v; o.textContent=v==='parametric'?'Parametric':'Non-parametric';
      if(statsTest===v) o.selected=true;
      testSel.appendChild(o);
    });
    testSel.addEventListener('change',()=>{
      statsTest=testSel.value;
      console.log('boxplot statsTest changed', statsTest);
      scheduleDrawBoxplot();
    });
    optionWrap.appendChild(testLabel);
    optionWrap.appendChild(testSel);
    const pairedLabel=document.createElement('label');
    pairedLabel.textContent='Pairing:';
    const pairedSel=document.createElement('select');
    [['unpaired','Unpaired'],['paired','Paired']].forEach(([v,t])=>{
      const o=document.createElement('option');
      o.value=v; o.textContent=t;
      if((statsPaired && v==='paired') || (!statsPaired && v==='unpaired')) o.selected=true;
      pairedSel.appendChild(o);
    });
    pairedSel.addEventListener('change',()=>{
      statsPaired=pairedSel.value==='paired';
      console.log('boxplot statsPaired changed', statsPaired);
      scheduleDrawBoxplot();
    });
    optionWrap.appendChild(pairedLabel);
    optionWrap.appendChild(pairedSel);
    const modeLabel=document.createElement('label');
    modeLabel.textContent='Comparison:';
    const modeSel=document.createElement('select');
    [['all','All pairwise'],['reference','Versus reference'],['custom','Custom pairs']].forEach(([v,t])=>{
      const o=document.createElement('option');
      o.value=v; o.textContent=t;
      if(statsMode===v) o.selected=true;
      modeSel.appendChild(o);
    });
    modeSel.addEventListener('change',()=>{
      statsMode=modeSel.value;
      console.log('boxplot statsMode changed', statsMode);
      renderStatsControls(traces);
      scheduleDrawBoxplot();
    });
    optionWrap.appendChild(modeLabel);
    optionWrap.appendChild(modeSel);
    if(statsMode==='reference'){
      const refLabel=document.createElement('label');
      refLabel.textContent='Reference:';
      const refSel=document.createElement('select');
      traces.forEach((t,i)=>{
        const o=document.createElement('option');
        o.value=i; o.textContent=t.name;
        if(i===statsRef) o.selected=true;
        refSel.appendChild(o);
      });
      refSel.addEventListener('change',()=>{
        statsRef=+refSel.value;
        console.log('boxplot statsRef changed', statsRef);
        renderStatsControls(traces);
        scheduleDrawBoxplot();
      });
      optionWrap.appendChild(refLabel);
      optionWrap.appendChild(refSel);
    } else if(statsMode==='custom'){
      const pairLabel=document.createElement('label');
      pairLabel.textContent='Pairs:';
      const pairInput=document.createElement('input');
      pairInput.type='text';
      pairInput.value=statsPairsText;
      pairInput.placeholder='1-3,2-4';
      pairInput.addEventListener('change',()=>{
        statsPairsText=pairInput.value;
        statsCustomPairs=parsePairString(statsPairsText,traces);
        console.log('boxplot custom pairs changed', statsPairsText);
        scheduleDrawBoxplot();
      });
      optionWrap.appendChild(pairLabel);
      optionWrap.appendChild(pairInput);
      statsCustomPairs=parsePairString(statsPairsText,traces);
    }
    controls.appendChild(optionWrap);
    traces.forEach((t,i)=>{
      const id=`statCol${i}`;
      const chk=document.createElement('input');
      chk.type='checkbox'; chk.id=id; chk.dataset.index=i;
      chk.checked=selectedCols.has(i);
      chk.addEventListener('change',()=>{
        if(chk.checked) selectedCols.add(i); else selectedCols.delete(i);
        console.log('boxplot column toggle', {index:i, checked:chk.checked});
        scheduleDrawBoxplot();
      });
      const lab=document.createElement('label');
      lab.setAttribute('for',id);
      lab.textContent=t.name;
      controls.appendChild(chk);
      controls.appendChild(lab);
    });
  }
  function annotatePair(svg,x1,x2,y,p){
    const path=document.createElementNS(NS,'path');
    path.setAttribute('d',`M${x1},${y} L${x1},${y-10} L${x2},${y-10} L${x2},${y}`);
    path.setAttribute('stroke','#000');
    path.setAttribute('fill','none');
    svg.appendChild(path);
    const txt=document.createElementNS(NS,'text');
    txt.setAttribute('x',(x1+x2)/2);
    txt.setAttribute('y',y-12);
    txt.setAttribute('text-anchor','middle');
    txt.textContent=p2stars(p);
    svg.appendChild(txt);
  }
  function annotateOverall(svg,xCenters,y2px,maxVal,p,level=0){
    const y=y2px(maxVal)-ANN_BASE_OFFSET-level*ANN_LEVEL_GAP;
    const txt=document.createElementNS(NS,'text');
    txt.setAttribute('x',(Math.min(...xCenters)+Math.max(...xCenters))/2);
    txt.setAttribute('y',y-12);
    txt.setAttribute('text-anchor','middle');
    txt.textContent=p2stars(p);
    svg.appendChild(txt);
  }
  function computeStats(traces,svg,helpers){
    const statsDiv=document.getElementById('statsResults');
    statsDiv.innerHTML='';
    if(statsMode==='custom'){
      if(!statsCustomPairs.length){
        statsDiv.textContent='Specify pairs for comparison.';
        return;
      }
      const pairTest=statsTest==='parametric'?(statsPaired?tTestPaired:tTest):(statsPaired?wilcoxonSignedRank:mannWhitney);
      const pairs=[];
      statsCustomPairs.forEach(pr=>{
        const aData=traces[pr.ai].rawY;
        const bData=traces[pr.bi].rawY;
        if(statsPaired && aData.length!==bData.length){
          return;
        }
        const r=pairTest(aData,bData);
        const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
        const statVal=r[statName];
        let rangeMax=-Infinity;
        for(let k=Math.min(pr.ai,pr.bi);k<=Math.max(pr.ai,pr.bi);k++){
          rangeMax=Math.max(rangeMax,Math.max(...traces[k].y));
        }
        pairs.push({...pr,p:r.p,rangeMax,labelA:traces[pr.ai].name,labelB:traces[pr.bi].name,stat:statVal,statName,df:r.df});
      });
      const m=pairs.length;
      pairs.forEach(pr=>pr.adjP=Math.min(pr.p*m,1));
      let html='<table><tr><th>Comparison</th><th>Statistic</th><th>df</th><th>P (adj)</th></tr>';
      pairs.forEach(pr=>{html+=`<tr><td>${pr.labelA} vs ${pr.labelB}</td><td>${pr.statName}=${pr.stat.toFixed(4)}</td><td>${pr.df??''}</td><td>${formatP(pr.adjP)}</td></tr>`;});
      html+='</table>';
      statsDiv.innerHTML=html;
      if(pairs.length){
        pairs.sort((a,b)=>(a.bi-a.ai)-(b.bi-b.ai));
        const placed=[];
        pairs.forEach(pr=>{
          let level=0;
          while(placed.some(pl=>!(pl.bi<pr.ai||pl.ai>pr.bi)&&pl.level===level)) level++;
          const y=helpers.y2px(pr.rangeMax)-ANN_BASE_OFFSET-level*ANN_LEVEL_GAP;
          annotatePair(svg,helpers.xCenter(pr.ai),helpers.xCenter(pr.bi),y,pr.p);
          pr.level=level;
          placed.push(pr);
        });
      }
      return;
    }
    const indices=[...selectedCols];
    if(indices.length<2){
      statsDiv.textContent='Select at least two columns for statistical analysis.';
      return;
    }
    const groups=indices.map(i=>traces[i].rawY);
    const labels=indices.map(i=>traces[i].name);
    const param=statsTest==='parametric';
    const pairTest=param?(statsPaired?tTestPaired:tTest):(statsPaired?wilcoxonSignedRank:mannWhitney);
    const overallTest=param?anova:kruskalWallis;
    if(statsPaired && groups.some(g=>g.length!==groups[0].length)){
      statsDiv.textContent='Paired tests require equal group sizes.';
      return;
    }
    if(indices.length===2){
      const res=pairTest(groups[0],groups[1]);
      const statName=res.t!==undefined?'t':res.U!==undefined?'U':res.W!==undefined?'W':'stat';
      const rows=[
        ['Comparison', `${labels[0]} vs ${labels[1]}`],
        ['Test', param?(statsPaired?'Paired t-test':'t-test'):(statsPaired?'Wilcoxon signed-rank':'Mann-Whitney U')],
        [statName, res[statName].toFixed(4)]
      ];
      if(res.df!==undefined) rows.push(['df', res.df.toFixed(4)]);
      rows.push(['P value', formatP(res.p)]);
      statsDiv.innerHTML='<table>'+rows.map(r=>`<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')+'</table>';
      const from=Math.min(indices[0],indices[1]);
      const to=Math.max(indices[0],indices[1]);
      let rangeMax=-Infinity;
      for(let k=from;k<=to;k++) rangeMax=Math.max(rangeMax,Math.max(...traces[k].y));
      const y=helpers.y2px(rangeMax)-ANN_BASE_OFFSET;
      annotatePair(svg,helpers.xCenter(indices[0]),helpers.xCenter(indices[1]),y,res.p);
      return;
    }
    let overall=null;
    if(!statsPaired){
      overall=overallTest(groups);
    }
    const maxVal=Math.max(...indices.map(i=>Math.max(...traces[i].y)));
    const xs=indices.map(i=>helpers.xCenter(i));
    let pairs=[];
    if(statsMode==='all'){
      for(let i=0;i<indices.length;i++){
        for(let j=i+1;j<indices.length;j++){
          const aIdx=indices[i],bIdx=indices[j];
          const r=pairTest(traces[aIdx].rawY,traces[bIdx].rawY);
          const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
          const statVal=r[statName];
          let rangeMax=-Infinity;
          for(let k=Math.min(aIdx,bIdx);k<=Math.max(aIdx,bIdx);k++){
            rangeMax=Math.max(rangeMax,Math.max(...traces[k].y));
          }
          pairs.push({a:i,b:j,ai:aIdx,bi:bIdx,p:r.p,rangeMax,stat:statVal,statName,df:r.df});
        }
      }
      const m=pairs.length;
      pairs.forEach(pr=>pr.adjP=Math.min(pr.p*m,1));
    }else if(statsMode==='reference'){
      const refIdx=indices.indexOf(statsRef);
      if(refIdx===-1){
        statsDiv.innerHTML+='<div>Select reference column among the chosen groups.</div>';
        return;
      }
      const refLabel=labels[refIdx];
      const refData=groups[refIdx];
      indices.forEach((idx,i)=>{
        if(i===refIdx) return;
        const r=pairTest(refData,traces[idx].rawY);
        const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
        const statVal=r[statName];
        let rangeMax=-Infinity;
        for(let k=Math.min(statsRef,idx);k<=Math.max(statsRef,idx);k++){
          rangeMax=Math.max(rangeMax,Math.max(...traces[k].y));
        }
        pairs.push({a:refIdx,b:i,ai:statsRef,bi:idx,p:r.p,rangeMax,label:labels[i],stat:statVal,statName,df:r.df});
      });
      const m=pairs.length;
      pairs.forEach(pr=>pr.adjP=Math.min(pr.p*m,1));
    }
    if(pairs.length){
      let html='';
      if(!statsPaired){
        const overallStatName=param?'F':'H';
        html+=`<table><tr><th>Overall test</th><td>${param?'ANOVA':'Kruskal-Wallis'}</td></tr><tr><th>${overallStatName}</th><td>${overall[overallStatName].toFixed(4)}</td></tr>`;
        if(param) html+=`<tr><th>df</th><td>${groups.length-1},${groups.reduce((s,g)=>s+g.length,0)-groups.length}</td></tr>`;
        else html+=`<tr><th>df</th><td>${groups.length-1}</td></tr>`;
        html+=`<tr><th>P value</th><td>${formatP(overall.p)}</td></tr></table>`;
      }
      html+='<table><tr><th>Comparison</th><th>Statistic</th><th>df</th><th>P (adj)</th></tr>';
      pairs.forEach(pr=>{html+=`<tr><td>${labels[pr.a]} vs ${labels[pr.b]}</td><td>${pr.statName}=${pr.stat.toFixed(4)}</td><td>${pr.df??''}</td><td>${formatP(pr.adjP)}</td></tr>`;});
      html+='</table>';
      statsDiv.innerHTML=html;
      pairs.sort((a,b)=>(a.bi-a.ai)-(b.bi-b.ai));
      const placed=[];
      pairs.forEach(pr=>{
        let level=0;
        while(placed.some(pl=>!(pl.bi<pr.ai||pl.ai>pr.bi)&&pl.level===level)) level++;
        const y=helpers.y2px(pr.rangeMax)-ANN_BASE_OFFSET-level*ANN_LEVEL_GAP;
        annotatePair(svg,helpers.xCenter(pr.ai),helpers.xCenter(pr.bi),y,pr.p);
        pr.level=level;
        placed.push(pr);
      });
    }
    const maxLevel=pairs.length?Math.max(...pairs.map(pr=>pr.level))+1:0;
    if(!statsPaired && pairs.length===0){
      annotateOverall(svg,xs,helpers.y2px,maxVal,overall.p,maxLevel);
    }
  }
  function renderStatsTable(traces){
    const tableDiv=document.getElementById('statsTable');
    if(!traces.length){ tableDiv.innerHTML=''; return; }
    const rows=traces.map(t=>{
      const arr=t.rawY;
      const n=arr.length;
      const mean=jStat.mean(arr);
      const med=jStat.median(arr);
      const sd=jStat.stdev(arr,true);
      const min=Math.min(...arr);
      const q1=jStat.percentile(arr,0.25);
      const q3=jStat.percentile(arr,0.75);
      const max=Math.max(...arr);
      return {name:t.name,n,mean,med,sd,min,q1,q3,max};
    });
    let html='<table style="border-collapse:collapse">';
    html+='<thead><tr>'+['Column','N','Mean','Median','SD','Min','Q1','Q3','Max'].map(h=>`<th style="border:1px solid #ccc;padding:4px">${h}</th>`).join('')+'</tr></thead>';
    html+='<tbody>'+rows.map(r=>`<tr><td style="border:1px solid #ccc;padding:4px">${r.name}</td><td style="border:1px solid #ccc;padding:4px">${r.n}</td><td style="border:1px solid #ccc;padding:4px">${r.mean.toFixed(2)}</td><td style="border:1px solid #ccc;padding:4px">${r.med.toFixed(2)}</td><td style="border:1px solid #ccc;padding:4px">${r.sd.toFixed(2)}</td><td style="border:1px solid #ccc;padding:4px">${r.min}</td><td style="border:1px solid #ccc;padding:4px">${r.q1.toFixed(2)}</td><td style="border:1px solid #ccc;padding:4px">${r.q3.toFixed(2)}</td><td style="border:1px solid #ccc;padding:4px">${r.max}</td></tr>`).join('')+'</tbody></table>';
    tableDiv.innerHTML=html;
  }
  function makeEditable(el,onChange){
    el.style.cursor='pointer';
    el.addEventListener('dblclick',()=>{
      const txt=prompt('Edit text',el.textContent);
      if(txt!==null){
        el.textContent=txt;
        onChange(txt);
      }
    });
  }
  window.makeEditable = makeEditable;
  function autoResizeSvg(svg, opts={}){
    try{
      const {fill=true}=opts;
      const applyResize=()=>{
        const bbox=svg.getBBox();
        const padding=10;
        const minX=Math.min(0,bbox.x-padding);
        const minY=Math.min(0,bbox.y-padding);
        const viewW=bbox.x+bbox.width+padding-minX;
        const viewH=bbox.y+bbox.height+padding-minY;
        svg.setAttribute('viewBox',`${minX} ${minY} ${viewW} ${viewH}`);
        if(fill){
          svg.setAttribute('width','100%');
          svg.setAttribute('height','100%');
        }
        const parent=svg.parentElement;
        if(parent) parent.style.overflow='visible';
        const box=svg.closest('.svgbox');
        if(box) box.style.overflow='visible';
        console.log('autoResizeSvg applied',{bbox,minX,minY,viewW,viewH,fill,parentW:parent?.clientWidth,parentH:parent?.clientHeight});
      };
      applyResize();
      requestAnimationFrame(applyResize);
    }catch(err){console.error('autoResizeSvg error',err);}
  }
  window.autoResizeSvg = autoResizeSvg;
  function serializeCleanSVG(svgEl){
    const clone = svgEl.cloneNode(true);
    clone.querySelectorAll('[contenteditable],[contentEditable]').forEach(el=>{
      el.removeAttribute('contenteditable');
      el.removeAttribute('contentEditable');
    });
    return new XMLSerializer().serializeToString(clone);
  }
  window.serializeCleanSVG = serializeCleanSVG;
  // Re-open legacy box guard for drawBoxplot onwards
  if (!(window.Components && window.Components.box && window.Components.box.__installed)) {
  async function drawBoxplot(){
    const token=++boxplotDrawToken; // debug token for cancellation
    console.log('boxplot draw start',{token});
    const colorMode=boxColorUnified.checked?'unified':'individual';
    const defaultFill=boxFill.value;
    const defaultBorder=boxBorder.value;
    const bw=Number(boxBorderWidth.value);
    const fs=Number(boxFontSize.value);
    const showGrid = $('#boxShowGrid').checked;
    console.log('boxplot showGrid', showGrid);
    const logScale = $('#boxLogScale').checked;
    const graphType = $('#boxGraphType').value;
    const pointMode = $('#boxPointMode').value;
    const showCaps = boxShowCaps.checked;
    const errorMode = $('#boxErrorMode').value;
    const traces = [];
    const labelsUsed = [];
    const nCols = hot.countCols();
    if(boxColOrder.length !== nCols){
      boxColOrder = Array.from({length:nCols}, (_, i) => i);
    }
    for(let orderIdx=0; orderIdx<boxColOrder.length; orderIdx++){
      const i=boxColOrder[orderIdx];
      const headerCell = hot.getDataAtCell(0, i);
      const label = (headerCell && String(headerCell).trim()) || `Col ${i + 1}`;
      const colData = hot.getDataAtCol(i);
      const col = [];
      console.time(`boxColCollect_${i}_${token}`);
      for (let r = 1; r < colData.length; r++) {
        const v = parseFloat(colData[r]);
        if (!isNaN(v)) col.push(v);
        if(r%10000===0){
          console.log('boxplot collect progress',{col:i,row:r,token});
        }
      }
      console.timeEnd(`boxColCollect_${i}_${token}`);
      console.log('boxplot collected column', {index:i, values:col.length});
      if(token!==boxplotDrawToken){console.log('boxplot draw cancelled after collect',{token});return;}
      if (col.length) {
        labelsUsed.push(label);
        traces.push({ name: label, rawY: col });
      }
    }
    if(token!==boxplotDrawToken){console.log('boxplot draw cancelled before traces ready',{token});return;}
    if (!traces.length) {
      boxColorPerBox.innerHTML='';
      document.getElementById('boxPlot').innerHTML='';
      document.getElementById('statsResults').innerHTML='';
      document.getElementById('statsTable').innerHTML='';
      return;
    }
    if(boxColorIndividual.checked){
      updateBoxColorPickers(labelsUsed);
    }else{
      boxColorPerBox.innerHTML='';
    }
    renderStatsControls(traces);
    if(logScale){
      const hasNonPos=traces.some(t=>t.rawY.some(v=>v<=0));
      if(hasNonPos){
        document.getElementById('boxPlot').innerHTML='<i>Log scale requires positive values.</i>';
        document.getElementById('statsResults').innerHTML='';
        document.getElementById('statsTable').innerHTML='';
        return;
      }
      traces.forEach(t=>{ t.y=t.rawY.map(v=>Math.log10(v)); });
    }else{
      traces.forEach(t=>{ t.y=[...t.rawY]; });
    }
    const $box = document.getElementById('boxPlot');
    while ($box.firstChild) $box.removeChild($box.firstChild);
    const W = Math.max(50, Math.floor($box.clientWidth || 50));
    const H = Math.max(40, Math.floor($box.clientHeight || 40));
    $box.style.position='relative';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'boxSvg');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('font-family','sans-serif');
    $box.appendChild(svg);
    let ymin=Infinity; let ymax=-Infinity;
    for(let ti=0; ti<traces.length; ti++){
      const t=traces[ti];
      for(let j=0; j<t.y.length; j++){
        const v=t.y[j];
        if(v<ymin) ymin=v;
        if(v>ymax) ymax=v;
        if(j%10000===0){
          console.log('boxplot range progress',{trace:ti,row:j,token});
        }
      }
    }
    if(token!==boxplotDrawToken){console.log('boxplot draw cancelled after range calc',{token});return;}
    console.log('boxplot ymin/ymax', {ymin, ymax});
    let barErrorMin=Infinity;
    if(graphType==='bar'){
      traces.forEach(t=>{
        const mean=t.y.reduce((a,b)=>a+b,0)/t.y.length;
        const sd=Math.sqrt(t.y.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(t.y.length-1||1));
        t.mean=mean; t.sd=sd;
        if(errorMode==='both'){
          const lower=mean-sd;
          if(lower<barErrorMin) barErrorMin=lower;
        }
      });
      if(errorMode==='both') ymin=Math.min(ymin,barErrorMin);
      ymin=Math.min(ymin, logScale ? Math.log10(1) : 0);
      console.log('boxplot barErrorMin',{barErrorMin});
    }
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    const range = ymax - ymin;
    const padTop = range * 0.15;
    const padBottom = graphType === 'bar' ? 0 : range * 0.05;
    ymax += padTop;
    ymin -= padBottom;
    const userYMin=parseFloat(boxYMin.value);
    const userYMax=parseFloat(boxYMax.value);
    if(isFinite(userYMin)) ymin=logScale?Math.log10(userYMin):userYMin;
    if(isFinite(userYMax)) ymax=logScale?Math.log10(userYMax):userYMax;
    console.log('boxplot axis override',{userYMin,userYMax,ymin,ymax});
    console.log('boxplot range',{ymin,ymax});
    function niceNum(range, round){
      const exp = Math.floor(Math.log10(range));
      const f = range / Math.pow(10, exp);
      let nf;
      if (round){
        if (f < 1.5) nf = 1; else if (f < 3) nf = 2; else if (f < 7) nf = 5; else nf = 10;
      } else {
        if (f <= 1) nf = 1; else if (f <= 2) nf = 2; else if (f <= 5) nf = 5; else nf = 10;
      }
      return nf * Math.pow(10, exp);
    }
    function niceScale(min, max, maxTicks){
      const range = niceNum(max - min, false);
      const step = niceNum(range / (maxTicks - 1), true);
      const graphMin = Math.floor(min / step) * step;
      const graphMax = Math.ceil(max / step) * step;
      const ticks = [];
      for (let v = graphMin; v <= graphMax + 1e-9; v += step) ticks.push(v);
      return { min: graphMin, max: graphMax, ticks, step };
    }
    const yScale = niceScale(ymin, ymax, 6);
    function formatTick(v){
      return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});
    }
    function measureTextWidth(text, font){
      const canvas = measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement('canvas'));
      const ctx = canvas.getContext('2d');
      ctx.font = font;
      return ctx.measureText(text).width;
    }
    const tickFont = `${fs}px sans-serif`;
    const tickLabels = yScale.ticks.map(t=>formatTick(logScale?Math.pow(10,t):t));
    const tickWidths = tickLabels.map(lbl => measureTextWidth(lbl, tickFont));
    const maxTickWidth = Math.max(...tickWidths, 0);
    const yLabelGap = maxTickWidth + fs;
    const baseTop=Math.max(32,Math.round(fs*2.2));
    const maxLevelEstimate=selectedCols.size>1?selectedCols.size:0;
    const topExtra=maxLevelEstimate?(ANN_BASE_OFFSET+maxLevelEstimate*ANN_LEVEL_GAP):0;
    const margin={
      top:baseTop+topExtra,
      right:20,
      bottom:Math.max(32,Math.round(fs*2.2)),
      left:Math.max(48,Math.round(fs*3.0), yLabelGap + fs)
    };
    const plotW = Math.max(20, W - margin.left - margin.right);
    const plotH = Math.max(20, H - margin.top - margin.bottom);
    const y2px = v => margin.top + plotH * (1 - (v - yScale.min) / (yScale.max - yScale.min));
    const bandW = plotW / labelsUsed.length;
    const boxW = Math.max(6, Math.min(60, bandW * 0.6));
    const xCenter = i => margin.left + (i + 0.5) * bandW;
    function percentile(sorted, p){
      if (!sorted.length) return NaN;
      const pos = (sorted.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      return (sorted[base + 1] !== undefined)
        ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
        : sorted[base];
    }
    function add(tag, attrs){
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      svg.appendChild(el);
      return el;
    }
    const tickLen=6;
    if (showGrid) {
      yScale.ticks.forEach(t => {
        const y = y2px(t);
        add('line', { x1: margin.left, y1: y, x2: margin.left + plotW, y2: y, stroke: '#ddd', 'stroke-width': 1 });
      });
    }
    console.log('boxplot axes',{tickLen});
    add('line', { x1: margin.left, y1: margin.top - tickLen, x2: margin.left, y2: margin.top + plotH + tickLen, stroke: '#000', 'stroke-width': 1 });
    yScale.ticks.forEach(t => {
      const y = y2px(t);
      add('line', { x1: margin.left - tickLen, y1: y, x2: margin.left, y2: y, stroke: '#000', 'stroke-width': 1 });
      const txt = add('text', { x: margin.left - (tickLen+2), y, 'font-size': fs, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: '#000' });
      txt.textContent = formatTick(logScale?Math.pow(10,t):t);
    });
    const xAxisY = graphType === 'bar' ? y2px(0) : margin.top + plotH;
    add('line', { x1: margin.left - tickLen, y1: xAxisY, x2: margin.left + plotW + tickLen, y2: xAxisY, stroke: '#000', 'stroke-width': 1 });
    const xLabelOffset = Math.max(14, fs) + tickLen;
    const xLabels=[];
    labelsUsed.forEach((lab, i) => {
      const x = xCenter(i);
      add('line', { x1: x, y1: xAxisY, x2: x, y2: xAxisY + tickLen, stroke: '#000', 'stroke-width': 1 });
      const t = add('text', { x, y: xAxisY + xLabelOffset, 'font-size': fs, 'text-anchor': 'middle', fill: '#000' });
      t.textContent = lab || `Col ${i + 1}`;
      t.style.cursor='ew-resize';
      enableLabelDrag(t,i);
      xLabels.push(t);
    });
    let needsTilt=false;
    const boxes=xLabels.map(l=>l.getBBox());
    for(let i=1;i<boxes.length;i++){
      const prev=boxes[i-1];
      const curr=boxes[i];
      if(prev.x+prev.width>curr.x){needsTilt=true;break;}
    }
    if(needsTilt){
      xLabels.forEach(l=>{
        const x=l.getAttribute('x');
        const y=l.getAttribute('y');
        l.setAttribute('transform',`rotate(-45 ${x} ${y})`);
        l.setAttribute('text-anchor','end');
        l.setAttribute('dy','0.35em');
      });
    }
    console.log('boxplot x label tilt check',{needsTilt});
    function enableLabelDrag(t, idx){
      t.addEventListener('mousedown', e => {
        e.preventDefault();
        const svgRect=svg.getBoundingClientRect();
        const onMove=ev=>{
          const svgX=ev.clientX - svgRect.left;
          t.setAttribute('x', svgX);
        };
        const onUp=ev=>{
          document.removeEventListener('mousemove',onMove);
          document.removeEventListener('mouseup',onUp);
          const svgX=ev.clientX - svgRect.left;
          let targetIdx=Math.floor((svgX - margin.left)/bandW);
          targetIdx=Math.max(0,Math.min(labelsUsed.length-1,targetIdx));
          if(targetIdx!==idx){
            const moved=boxColOrder.splice(idx,1)[0];
            boxColOrder.splice(targetIdx,0,moved);
          }
          console.log('boxplot label drag end',{from:idx,to:targetIdx});
          scheduleDrawBoxplot();
        };
        document.addEventListener('mousemove',onMove);
        document.addEventListener('mouseup',onUp);
      });
    }
    const yX = margin.left - yLabelGap;
    const yText = add('text', {
      x: yX,
      y: margin.top + plotH / 2,
      transform: `rotate(-90 ${yX} ${margin.top + plotH / 2})`,
      'text-anchor': 'middle',
      'font-size': fs + 4
    });
    yText.textContent = boxYLabelText;
    makeEditable(yText,txt=>{boxYLabelText=txt;});
    for(let i=0;i<traces.length;i++){
      if(token!==boxplotDrawToken){console.log('boxplot draw cancelled during render loop',{token});return;}
      const t=traces[i];
      const vals = [...t.y].sort((a, b) => a - b);
      if (!vals.length) continue;
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
      let valIdx=0;
      for(const v of vals){
        if(v < lowerFence || v > upperFence){
          outliers.push(v);
        }else{
          if(v < wMin) wMin = v;
          if(v > wMax) wMax = v;
        }
        valIdx++;
        if(valIdx%10000===0){
          console.log('boxplot fence progress',{index:i,valIdx,token});
        }
      }
      if(wMin === Infinity){
        wMin = vals[0];
        wMax = vals[vals.length - 1];
      }
      console.log('boxplot fences',{index:i,lowerFence,upperFence,outliers:outliers.length});
      const yQ1 = y2px(q1);
      const yMed = y2px(med);
      const yQ3 = y2px(q3);
      const yWMin = y2px(wMin);
      const yWMax = y2px(wMax);
      const fillColor=colorMode==='individual'? (boxColors[i]||DEFAULT_BOX_COLORS[i%DEFAULT_BOX_COLORS.length]) : defaultFill;
      const borderColor=colorMode==='individual'? (boxBorderColors[i]||shadeColor(fillColor,-30)) : defaultBorder;
      console.log('box stats',{index:i,q1,med,q3,wMin,wMax,outliers});
      if (graphType === 'box' || graphType === 'notched') {
        if(graphType === 'box'){
          add('rect', { x: x0, y: yQ3, width: boxW, height: Math.max(1, yQ1 - yQ3), fill: fillColor, stroke: borderColor, 'stroke-width': bw });
          add('line', { x1: x0, y1: yMed, x2: x1, y2: yMed, stroke: borderColor, 'stroke-width': bw });
        } else {
          const notchSpan = 1.57 * iqr / Math.sqrt(vals.length);
          let notchLower = Math.max(q1, med - notchSpan);
          let notchUpper = Math.min(q3, med + notchSpan);
          if (notchLower > notchUpper) {
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
          add('path',{d, fill: fillColor, stroke: borderColor, 'stroke-width': bw});
          console.log('drawing notched box',{index:i,notchLower,notchUpper,notchWidth,xNL,xNR});
          add('line', { x1: xNL, y1: yMed, x2: xNR, y2: yMed, stroke: borderColor, 'stroke-width': bw });
        }
        add('line', { x1: cx, y1: yQ3, x2: cx, y2: yWMax, stroke: borderColor, 'stroke-width': bw });
        add('line', { x1: cx, y1: yQ1, x2: cx, y2: yWMin, stroke: borderColor, 'stroke-width': bw });
        if(showCaps){
          const cap = Math.max(6, boxW * 0.4);
          add('line', { x1: cx - cap / 2, y1: yWMax, x2: cx + cap / 2, y2: yWMax, stroke: borderColor, 'stroke-width': bw });
          add('line', { x1: cx - cap / 2, y1: yWMin, x2: cx + cap / 2, y2: yWMin, stroke: borderColor, 'stroke-width': bw });
        }
      } else {
        const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
        const sd = Math.sqrt(vals.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(vals.length-1||1));
        console.log('bar stats',{mean,sd});
        const yMean = y2px(mean);
        const yZero = y2px(0);
        const rectY = Math.min(yMean, yZero);
        const rectH = Math.abs(yZero - yMean);
        add('rect', { x: x0, y: rectY, width: boxW, height: Math.max(1, rectH), fill: fillColor, stroke: borderColor, 'stroke-width': bw });
        const ySdTop = y2px(mean + sd);
        const cap = Math.max(6, boxW * 0.4);
        if(errorMode==='both'){
          const ySdBottom = y2px(mean - sd);
          add('line',{x1:cx,y1:ySdTop,x2:cx,y2:ySdBottom,stroke:borderColor,'stroke-width':bw});
          add('line',{x1:cx-cap/2,y1:ySdBottom,x2:cx+cap/2,y2:ySdBottom,stroke:borderColor,'stroke-width':bw});
        }else{
          add('line',{x1:cx,y1:ySdTop,x2:cx,y2:yMean,stroke:borderColor,'stroke-width':bw});
        }
        add('line',{x1:cx-cap/2,y1:ySdTop,x2:cx+cap/2,y2:ySdTop,stroke:borderColor,'stroke-width':bw});
      }
      if(pointMode!=='none'){
        console.time(`boxplotPoints_${token}_${i}`);
        const frag=document.createDocumentFragment();
        let ptIdx=0;
        if(pointMode==='outliers'){
          for(const v of outliers){
            const c=document.createElementNS(NS,'circle');
            c.setAttribute('cx',cx);
            c.setAttribute('cy',y2px(v));
            c.setAttribute('r',3);
            c.setAttribute('fill',fillColor);
            c.setAttribute('stroke',borderColor);
            frag.appendChild(c);
            ptIdx++;
            if(ptIdx%10000===0){
              console.log('boxplot outlier progress',{index:i,ptIdx,token});
            }
          }
        }else{
          for(const v of vals){
            const cy=y2px(v);
            let px;
            if(pointMode==='overlay'){
              px = cx + (Math.random() - 0.5) * boxW * 0.6;
            } else {
              px = x0 - boxW * 0.3 + (Math.random() - 0.5) * boxW * 0.2;
              console.log('side point',{px,cy});
            }
            const c=document.createElementNS(NS,'circle');
            c.setAttribute('cx',px);
            c.setAttribute('cy',cy);
            c.setAttribute('r',3);
            c.setAttribute('fill',fillColor);
            c.setAttribute('stroke',borderColor);
            if(pointMode==='overlay'){c.setAttribute('fill-opacity',0.6);}
            frag.appendChild(c);
            ptIdx++;
            if(ptIdx%10000===0){
              console.log('boxplot point progress',{index:i,ptIdx,token});
            }
          }
        }
        add('g',{'data-trace':i}).appendChild(frag);
        console.timeEnd(`boxplotPoints_${token}_${i}`);
      }
    }
    if(token!==boxplotDrawToken){console.log('boxplot draw cancelled before finalize',{token});return;}
    const titleText = add('text', {
      x: margin.left + plotW / 2,
      y: margin.top / 2,
      'text-anchor': 'middle',
      'font-size': fs + 4
    });
    titleText.textContent = boxTitleText;
    makeEditable(titleText,txt=>{boxTitleText=txt;});
    const helpers={xCenter,y2px};
    computeStats(traces,svg,helpers);
    renderStatsTable(traces);
    const otherBoxes=Array.from(svg.children).filter(el=>el!==titleText && el.getBBox).map(el=>el.getBBox());
    const topMost=Math.min(...otherBoxes.map(b=>b.y));
    const spacing=fs+4;
    const newY=Math.max(spacing,topMost-spacing);
    titleText.setAttribute('y',newY);
    autoResizeSvg(svg);
    console.log('boxplot render complete with enhanced styles');
  }
  function getBoxGraphPayload(){
    return {
      type:'box',
      data:hot.getData(),
      config:{
        title:boxTitleText,
        yLabel:boxYLabelText,
        colorMode:boxColorUnified.checked?'unified':'individual',
        fill:boxFill.value,
        border:boxBorder.value,
        borderWidth:boxBorderWidth.value,
        fontSize:boxFontSize.value,
        showGrid:boxShowGrid.checked,
        logScale:boxLogScale.checked,
        graphType:boxGraphType.value,
        pointMode:boxPointMode.value,
        showCaps:boxShowCaps.checked,
        errorMode:boxErrorMode.value,
        colors:[...boxColors],
        borderColors:[...boxBorderColors],
        yMin:boxYMin.value,
        yMax:boxYMax.value
      }
    };
  }
  let boxFileHandle=null, boxFileName='box.graph';
  async function saveBoxFile(){
    const payload=getBoxGraphPayload();
    console.log('saveBoxFile',{payload,boxFileHandle});
    if(boxFileHandle&&boxFileHandle.createWritable){
      try{
        const perm=await verifyPermission(boxFileHandle,true);
        console.log('saveBoxFile permission',perm);
        if(perm){
          const w=await boxFileHandle.createWritable();
          await w.write(JSON.stringify(payload));
          await w.close();
        }
      }catch(err){console.error('saveBoxFile error',err);}
    }else if(window.showSaveFilePicker){
      console.log('saveBoxFile no handle - invoking saveAs');
      await saveAsBoxFile();
    }else{
      console.log('saveBoxFile fallback download');
      downloadJSON(payload,boxFileName);
    }
  }
  async function saveAsBoxFile(){
    const payload=getBoxGraphPayload();
    console.log('saveAsBoxFile',payload);
    if(window.showSaveFilePicker){
      try{
        boxFileHandle=await window.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:boxFileName});
        const w=await boxFileHandle.createWritable();
        await w.write(JSON.stringify(payload));
        await w.close();
      }catch(err){console.error('saveAsBoxFile error',err);}
    }else{
      downloadJSON(payload,boxFileName);
    }
  }
  async function openBoxFile(){
    console.log('openBoxFile start');
    if(window.showOpenFilePicker){
      try{
        [boxFileHandle]=await window.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]});
        const file=await boxFileHandle.getFile();
        boxFileName=file.name;
        loadBoxGraphFile(file);
      }catch(err){console.error('openBoxFile error',err);}
    }else{
      const input=document.getElementById('boxGraphFile');
      input.value='';
      input.click();
    }
  }
  function loadBoxGraphFile(file){
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const obj=JSON.parse(e.target.result);
        console.log('loadBoxGraph',obj);
        if(obj.type!=='box') throw new Error('Invalid graph type');
        hot.loadData(obj.data||[]);
        const c=obj.config||{};
        boxTitleText=c.title||boxTitleText;
        boxYLabelText=c.yLabel||boxYLabelText;
        boxFill.value=c.fill||boxFill.value;
        boxBorder.value=c.border||boxBorder.value;
        boxBorderWidth.value=c.borderWidth||boxBorderWidth.value;
        boxFontSize.value=c.fontSize||boxFontSize.value;
        boxFontSizeVal.textContent=boxFontSize.value;
        boxShowGrid.checked=!!c.showGrid;
        boxLogScale.checked=!!c.logScale;
        boxGraphType.value=c.graphType||boxGraphType.value;
        boxPointMode.value=c.pointMode||boxPointMode.value;
        boxShowCaps.checked=!!c.showCaps;
        boxErrorMode.value=c.errorMode||boxErrorMode.value;
        boxErrorModeCtl.style.display=boxGraphType.value==='bar'?'':'none';
        boxColors=c.colors||[];
        boxBorderColors=c.borderColors||[];
        if(c.colorMode==='individual'){
          boxColorIndividual.checked=true;
        }else{
          boxColorUnified.checked=true;
        }
        toggleBoxColorMode();
        boxYMin.value=c.yMin||'';
        boxYMax.value=c.yMax||'';
        const labels=hot.getDataAtRow(0);
        if(boxColorIndividual.checked){
          updateBoxColorPickers(labels);
        }else{
          boxColorPerBox.innerHTML='';
        }
        scheduleDrawBoxplot();
      }catch(err){console.error('loadBoxGraph error',err);}
    };
    reader.readAsText(file);
  }
  // boxFill, boxBorder, boxBorderWidth, and boxFontSize listeners are handled above.
  $('#boxPNG').addEventListener('click', async () => {
    const svgEl = document.getElementById('boxSvg');
    if (!svgEl) return;
    console.log('boxPNG export start');
    const W = svgEl.viewBox.baseVal.width || svgEl.clientWidth || 800;
    const H = svgEl.viewBox.baseVal.height || svgEl.clientHeight || 400;
    const xml = serializeCleanSVG(svgEl);
    const img = new Image();
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    img.src = url;
    await img.decode().catch(err => {console.error('boxPNG svg decode',err);});
    const outCanvas = document.createElement('canvas');
    outCanvas.width = W;
    outCanvas.height = H;
    const ctx = outCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    outCanvas.toBlob(b => {
      const pngUrl = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = pngUrl; a.download = 'boxplot.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 4000);
    }, 'image/png');
  });
  $('#boxSVG').addEventListener('click', () => {
    const svgEl = document.getElementById('boxSvg');
    if (!svgEl) return;
    console.log('boxSVG export start');
    const xml = serializeCleanSVG(svgEl);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'boxplot.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  $('#openBox').addEventListener('click', openBoxFile);
  $('#saveBox').addEventListener('click', saveBoxFile);
  $('#saveAsBox').addEventListener('click', saveAsBoxFile);
  $('#boxGraphFile').addEventListener('change', e=>{
    const f=e.target.files[0];
    if(f){
      boxFileName=f.name;
      boxFileHandle=null;
      loadBoxGraphFile(f);
    }
  });
  } // end legacy box guard
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      drawFromLists();
    }
  });
})();
