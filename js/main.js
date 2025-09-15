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
  const scheduleDrawBoxplot = debounceFrame(drawBoxplot);
  const scheduleDrawScatter = debounceFrame(drawScatter);
  const scheduleDrawPca = debounceFrame(drawPca);
  const scheduleDrawLine = debounceFrame(() => { try { if (typeof drawLinePublic === 'function') drawLinePublic(); } catch (e) { console.error('scheduleDrawLine error', e); } });
  // Define safe defaults for line labels early to avoid TDZ on first draws
  var lineTitleText = typeof lineTitleText !== 'undefined' ? lineTitleText : 'Line graph';
  var lineXLabelText = typeof lineXLabelText !== 'undefined' ? lineXLabelText : 'X';
  var lineYLabelText = typeof lineYLabelText !== 'undefined' ? lineYLabelText : 'Y';
  // Guard for resizer callbacks firing before line init
  var __lineReady = typeof __lineReady !== 'undefined' ? __lineReady : false;
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
  // Public line draw (out of legacy blocks) so scheduleDrawLine can always invoke it
  async function drawLinePublic(){
    try{
      const token=++lineDrawToken; if(window.DEBUG_LINE) console.log('drawLine called',{token});
      const fill=lineFill.value; const alpha=Number(lineAlpha.value)||0; const borderWidth=Number(lineBorderWidth.value); const borderColor=lineBorder.value; const bw=borderWidth; const fs=Number(lineFontSize.value); const showGrid=lineShowGrid.checked; const logX=lineLogX.checked; const logY=lineLogY.checked; const dotSize=Number(lineDotSize.value)||0; const xMinManual=parseFloat(lineXMin.value); const xMaxManual=parseFloat(lineXMax.value); const yMinManual=parseFloat(lineYMin.value); const yMaxManual=parseFloat(lineYMax.value); const originMode=lineOriginMode.value; const originXInput=parseFloat(lineOriginX.value); const originYInput=parseFloat(lineOriginY.value);
      const data=lineHot.getData(); if(!data||!data.length) return; const header=data[0]||[]; let xIndex=header.findIndex(h=>String(h).trim().toLowerCase()==='x'); if(xIndex<0) xIndex=0; lineXLabelText=(header[xIndex]&&String(header[xIndex]).trim())||'X'; if(window.DEBUG_LINE) console.log('line xLabel',lineXLabelText); const seriesCols=header.map((_,i)=>i).filter(i=>i!==xIndex && header[i]!=null && String(header[i]).trim()!==''); if(window.DEBUG_LINE) console.log('line seriesCols',seriesCols);
      const series=seriesCols.map((ci,i)=>({name:header[ci]||`Series ${i+1}`, points:[]}));
      let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity;
      for(let r=1;r<data.length;r++){
        const row=data[r]; const xv=parseFloat(row[xIndex]);
        seriesCols.forEach((ci,si)=>{ const yv=parseFloat(row[ci]); if(!isNaN(xv)&&!isNaN(yv)){ series[si].points.push({x:xv,y:yv}); if(xv<xMinRaw)xMinRaw=xv; if(xv>xMaxRaw)xMaxRaw=xv; if(yv<yMinRaw)yMinRaw=yv; if(yv>yMaxRaw)yMaxRaw=yv; } else { series[si].points.push(null);} });
      }
      const labelsUsed=series.map(s=>s.name); updateLineLabelColorPickers(labelsUsed);
      const legendLabels=labelsUsed; const legendWidth=legendLabels.length?120:0; lineLegendWidth=legendWidth; lineLegendItems=[]; console.log('line legend width',legendWidth,{labels:legendLabels});
      if(series.every(s=>s.points.every(p=>p==null))) return;
      if(logX && xMinRaw<=0){document.getElementById('linePlot').innerHTML='<i>Log scale requires positive X values.</i>'; return;}
      if(logY && yMinRaw<=0){document.getElementById('linePlot').innerHTML='<i>Log scale requires positive Y values.</i>'; return;}
      let xMin=xMinRaw,xMax=xMaxRaw,yMin=yMinRaw,yMax=yMaxRaw; if(isFinite(xMinManual)) xMin=xMinManual; if(isFinite(xMaxManual)) xMax=xMaxManual; if(isFinite(yMinManual)) yMin=yMinManual; if(isFinite(yMaxManual)) yMax=yMaxManual;
      if(originMode==='custom'){
        if(isFinite(originXInput)){ if(!(logX && originXInput<=0)){ if(originXInput<xMin) xMin=originXInput; if(originXInput>xMax) xMax=originXInput; } }
        if(isFinite(originYInput)){ if(!(logY && originYInput<=0)){ if(originYInput<yMin) yMin=originYInput; if(originYInput>yMax) yMax=originYInput; } }
      }
      if(xMin===xMax) xMax=xMin+1; if(yMin===yMax) yMax=yMin+1;
      const plotEl=document.getElementById('linePlot'); plotEl.style.display='block'; while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
      const W=Math.max(50,Math.floor(plotEl.clientWidth||50)); const H=Math.max(40,Math.floor(plotEl.clientHeight||40)); plotEl.style.position='relative';
      const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','lineSvg'); svg.setAttribute('width',String(W)); svg.setAttribute('height',String(H)); svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('font-family','sans-serif'); plotEl.appendChild(svg);
      const xMinT=logX?Math.log10(xMin):xMin; const xMaxT=logX?Math.log10(xMax):xMax; const yMinT=logY?Math.log10(yMin):yMin; const yMaxT=logY?Math.log10(yMax):yMax;
      function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);} function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(maxTicks-1),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};}
      const xScale=niceScale(xMinT,xMaxT,6); const yScale=niceScale(yMinT,yMaxT,6);
      if(isFinite(xMinManual)) xScale.min=xMinT; if(isFinite(xMaxManual)) xScale.max=xMaxT; if(isFinite(yMinManual)) yScale.min=yMinT; if(isFinite(yMaxManual)) yScale.max=yMaxT;
      if(isFinite(xMinManual)||isFinite(xMaxManual)){const ticks=[]; for(let v=Math.ceil(xScale.min/xScale.step)*xScale.step; v<=xScale.max+1e-9; v+=xScale.step) ticks.push(v); xScale.ticks=ticks;}
      if(isFinite(yMinManual)||isFinite(yMaxManual)){const ticks=[]; for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step; v<=yScale.max+1e-9; v+=yScale.step) ticks.push(v); yScale.ticks=ticks;}
      function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
      const measureCanvas=drawLinePublic._canvas||(drawLinePublic._canvas=document.createElement('canvas')); const measureCtx=measureCanvas.getContext('2d'); function measureTextWidth(text,font){measureCtx.font=font;return measureCtx.measureText(text).width;}
      const tickFont=`${fs}px sans-serif`; const xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t)); const yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t)); const yLabelWidths=yTickLabels.map(lbl=>measureTextWidth(lbl,tickFont)); const maxYLabelWidth=Math.max(...yLabelWidths,0);
      const margin={top:Math.max(32,Math.round(fs*2.2)),right:20+legendWidth,bottom:Math.max(32,Math.round(fs*2.2))+fs+6,left:Math.max(48,Math.round(fs*3.0),maxYLabelWidth+fs*2)}; console.log('line margin computed',margin);
      const plotW=Math.max(20,W-margin.left-margin.right); const plotH=Math.max(20,H-margin.top-margin.bottom);
      const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min); const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
      function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
      const tickLen=6; if(showGrid){xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':1});});yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':1});});}
      let originXT,originYT; if(originMode==='custom'){originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);}else{originXT=xScale.min;originYT=yScale.min;}
      const clampedXT=Math.min(Math.max(originXT,xScale.min),xScale.max); const clampedYT=Math.min(Math.max(originYT,yScale.min),yScale.max); const xAxisY=y2px(clampedYT); const yAxisX=x2px(clampedXT);
      add('line',{x1:margin.left - tickLen,y1:xAxisY,x2:margin.left+plotW + tickLen,y2:xAxisY,stroke:'#000','stroke-width':1}); add('line',{x1:yAxisX,y1:margin.top - tickLen,x2:yAxisX,y2:margin.top+plotH + tickLen,stroke:'#000','stroke-width':1});
      xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:'#000','stroke-width':1});const txt=add('text',{x,y:xAxisY+tickLen+fs,'font-size':fs,'text-anchor':'middle',fill:'#000'});txt.textContent=formatTick(logX?Math.pow(10,t):t);});
      yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:'#000','stroke-width':1});const txt=add('text',{x:yAxisX-(tickLen+2),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:'#000'});txt.textContent=formatTick(logY?Math.pow(10,t):t);});
      const colors=series.map((s,i)=>lineLabelColors[s.name]||lineBorder.value||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]); const seriesElems=[];
      series.forEach((s,i)=>{ const color=colors[i]; let pathStr=''; let started=false; const markerFrag=document.createDocumentFragment(); let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity; s.points.forEach(pt=>{ if(pt){ const xv=logX?Math.log10(pt.x):pt.x; const yv=logY?Math.log10(pt.y):pt.y; const px=x2px(xv); const py=y2px(yv); if(px<minX) minX=px; if(px>maxX) maxX=px; if(py<minY) minY=py; if(py>maxY) maxY=py; if(!started){pathStr+=`M${px} ${py}`; started=true;} else {pathStr+=`L${px} ${py}`;} if(dotSize>0){const c=document.createElementNS(NS,'circle'); c.setAttribute('cx',px); c.setAttribute('cy',py); c.setAttribute('r',dotSize); c.setAttribute('fill',lineLabelColors[s.name]||fill); c.setAttribute('fill-opacity',1-alpha); markerFrag.appendChild(c);} } else { started=false; } }); s.bbox={minX:minX-dotSize,maxX:maxX+dotSize,minY:minY-dotSize,maxY:maxY+dotSize}; const path=add('path',{d:pathStr,fill:'none',stroke:color,'stroke-width':bw,'stroke-opacity':1-alpha}); const mGroup=add('g',{}); mGroup.appendChild(markerFrag); seriesElems.push({path,mGroup}); });
      if(legendLabels.length){ const legendGroup=document.createElementNS(NS,'g'); const legendX=W-legendWidth+8; const legendY=margin.top; series.forEach((s,i)=>{ const itemG=document.createElementNS(NS,'g'); itemG.style.cursor='pointer'; const y=legendY+i*(fs+4); const sw=document.createElementNS(NS,'rect'); sw.setAttribute('x',legendX); sw.setAttribute('y',y-fs+4); sw.setAttribute('width',12); sw.setAttribute('height',12); sw.setAttribute('fill',colors[i]); itemG.appendChild(sw); const t=document.createElementNS(NS,'text'); t.setAttribute('x',legendX+16); t.setAttribute('y',y); t.setAttribute('font-size',fs); t.textContent=s.name; itemG.appendChild(t); itemG.addEventListener('click',()=>{ const vis=seriesElems[i].path.style.display!=='none'; seriesElems[i].path.style.display=vis?'none':'inline'; seriesElems[i].mGroup.style.display=vis?'none':'inline'; }); legendGroup.appendChild(itemG); }); svg.appendChild(legendGroup); lineLegendItems=series.map((s,i)=>({label:s.name,color:colors[i]})); if(window.DEBUG_LINE) console.log('legend placed inside',{labels:legendLabels,legendWidth,legendX,legendY}); }
      const xText=add('text',{x:margin.left+plotW/2,y:H-6,'text-anchor':'middle','font-size':fs+4}); xText.textContent=lineXLabelText; makeEditable(xText,txt=>{lineXLabelText=txt;}); const yX=margin.left-(maxYLabelWidth+fs*0.5); console.log('line y-axis position',yX); const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs+4}); yText.textContent=lineYLabelText; makeEditable(yText,txt=>{lineYLabelText=txt;});
      const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs+4}); titleText.textContent=lineTitleText; makeEditable(titleText,txt=>{lineTitleText=txt;}); updateLineStats(series); if(window.autoResizeSvg) autoResizeSvg(svg); if(window.DEBUG_LINE) console.log('line render complete');
    }catch(err){ console.error('drawLinePublic error', err); }
  }
  const scheduleDrawRoc = debounceFrame(drawRoc);
  let boxplotDrawToken=0; // debug: track boxplot render cycles
  let scatterDrawToken=0; // debug: track scatter render cycles
  let pcaDrawToken=0; // debug: track pca render cycles
  let lineDrawToken=0; // debug: track line render cycles
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
  const lineStatType=$('#lineStatType');
  const lineStatsResults=$('#lineStatsResults');
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

  // Scatter plot setup
  const scatterHotContainer=document.getElementById('scatterHot');
  const scatterHotWrapper=document.getElementById('scatterHotWrapper');
  const scatterTablePanel=document.getElementById('scatterTablePanel');
  const scatterGraphPanel=document.getElementById('scatterGraphPanel');
  const scatterPanelResizer=document.getElementById('scatterPanelResizer');
  const scatterSvgBox=scatterGraphPanel?.querySelector('.svgbox');
  const scatterConfigPanel=scatterGraphPanel?.querySelector('.config-options');
  let scatterMinSvgWidth=0;
  function syncScatterWidths(){
    const tableWidth=scatterTablePanel.getBoundingClientRect().width;
    const graphWidth=scatterGraphPanel.getBoundingClientRect().width;
    const configWidth=scatterConfigPanel.getBoundingClientRect().width;
    const gap=parseFloat(getComputedStyle(scatterGraphPanel.querySelector('.diagram-area')).gap||0);
    const available=graphWidth-configWidth-gap;
    const minW=scatterMinSvgWidth||0;
    const newW=Math.max(minW, Math.min(tableWidth, available));
    if(scatterSvgBox) scatterSvgBox.style.width=newW+'px';
    console.debug('syncScatterWidths',{tableWidth,graphWidth,configWidth,gap,available,newW,minW});
  }
  const scatterTableObserver=new ResizeObserver(()=>{syncScatterWidths();});
  scatterTableObserver.observe(scatterTablePanel);
  syncScatterWidths();

  if(window.Shared && window.Shared.ensureHotWrapperStyles){ window.Shared.ensureHotWrapperStyles(scatterHotWrapper); }
  console.debug('scatterHotWrapper style updated', scatterHotWrapper.style.cssText);
  const scatterHot=new Handsontable(scatterHotContainer,{
    data:Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,3),
    rowHeaders(index){
      const label = index === 0 ? '' : index;
      console.debug('scatter rowHeader', {index, label});
      return label;
    },
    colHeaders:true,
    minRows:DEFAULT_ROWS,
    minCols:3,
    contextMenu:true,
    undo:true,
    afterUndo:()=>{console.log('scatter undo'); scheduleDrawScatter();},
    afterRedo:()=>{console.log('scatter redo'); scheduleDrawScatter();},
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
    afterChange(changes,source){
      if(!changes||source==='loadData') return;
      console.log('scatter afterChange', {count:changes.length, source});
      scheduleDrawScatter();
    }
  });

  window.DEBUG_SCATTER=true;
  const scatterExample=[
    ['Species','Weight','Height'],
    ['Cat',4.5,23],
    ['Dog',20,45],
    ['Rabbit',2.5,35],
    ['Cat',5,25],
    ['Dog',22,50],
    ['Rabbit',3,40],
    ['Cat',4.8,24],
    ['Dog',24,55]
  ];
  if(window.DEBUG_SCATTER) console.log('scatter example dataset', scatterExample);
  document.getElementById('scatterLoadExample').addEventListener('click',()=>{
    scatterHot.loadData(scatterExample);
    console.log('scatter example loaded');
    scheduleDrawScatter();
  });
  document.getElementById('scatterImport').addEventListener('click',()=>{
    const f=document.getElementById('scatterFile');
    f.value='';
    f.click();
  });
  document.getElementById('scatterFile').addEventListener('change',e=>{
    const file=e.target.files[0];
    if(!file) return;
    const ext=file.name.split('.').pop().toLowerCase();
    const reader=new FileReader();
    if(['csv','tsv','txt'].includes(ext)){
      reader.onload=ev=>{
        const text=ev.target.result;
        const delim=ext==='csv'?',':'\t';
        let rows=text.split(/\r?\n/).map(r=>r.split(delim));
        scatterProcessImportedRows(rows);
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
          const data=new Uint8Array(ev.target.result);
          const workbook=XLSX.read(data,{type:'array'});
          const sheet=workbook.Sheets[workbook.SheetNames[0]];
          let rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
          scatterProcessImportedRows(rows);
        }catch(err){
          alert('Failed to import spreadsheet: '+err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    }else{
      alert('Unsupported file format: '+ext);
    }
  });

  scatterHotContainer.addEventListener('paste',async e=>{
    e.preventDefault();
    e.stopPropagation();
    let text=e.clipboardData?.getData('text/plain');
    if(!text){
      try{
        text=await navigator.clipboard.readText();
        console.log('scatter clipboard fallback used');
      }catch(err){
        console.log('scatter clipboard read failed',err);
        return;
      }
    }
    const rowArr=text.split(/\r?\n/);
    if(rowArr.length<2 && !text.includes('\t') && !text.includes(',')){
      console.log('scatter paste ignored: insufficient data');
      return;
    }
    const delim=text.includes('\t')?'\t':',';
    const rows=rowArr.map(r=>r.split(delim));
    const sel=scatterHot.getSelectedLast();
    const startRow=sel?sel[0]:0;
    const startCol=sel?sel[1]:0;
    console.log('scatter fast paste',{rows:rows.length,cols:rows[0]?.length,startRow,startCol});
    console.time('scatterPaste');
    scatterProcessImportedRows(rows,startRow,startCol);
    console.timeEnd('scatterPaste');
  },true);

  function scatterProcessImportedRows(rows,startRow=0,startCol=0){
    if(!rows||!rows.length) return;
    rows=rows.filter(r=>r && r.some(c=>String(c).trim()!==''));
    if(!rows.length) return;
    const colCount=Math.max(3,...rows.map(r=>r.length));
    const rowCount=rows.length;
    const curRows=scatterHot.countRows();
    const curCols=scatterHot.countCols();
    const targetRows=Math.max(DEFAULT_ROWS,curRows,startRow+rowCount);
    const targetCols=Math.max(curCols,startCol+colCount,3);
    const data=Array.from({length:targetRows},(_,r)=>Array(targetCols).fill(''));
    const existing=scatterHot.getData();
    for(let r=0;r<curRows;r++){
      for(let c=0;c<curCols;c++) data[r][c]=existing[r][c];
    }
    for(let r=0;r<rowCount;r++){
      const row=rows[r];
      for(let c=0;c<row.length;c++) data[startRow+r][startCol+c]=row[c];
    }
    scatterHot.updateSettings({data,minRows:targetRows,minCols:targetCols});
    console.log('scatter data imported',{rows:data.length,cols:targetCols});
    scheduleDrawScatter();
  }

  const scatterFill=$('#scatterFill'), scatterBorder=$('#scatterBorder'), scatterBorderWidth=$('#scatterBorderWidth'), scatterDotSize=$('#scatterDotSize'), scatterShowLine=$('#scatterShowLine'), scatterAlpha=$('#scatterAlpha');
  const scatterAlphaVal=$('#scatterAlphaVal');
  const scatterFontSize=$('#scatterFontSize'), scatterFontSizeVal=$('#scatterFontSizeVal');
  const scatterShowGrid=$('#scatterShowGrid'), scatterLogX=$('#scatterLogX'), scatterLogY=$('#scatterLogY');
  const scatterXMin=$('#scatterXMin'), scatterXMax=$('#scatterXMax'), scatterYMin=$('#scatterYMin'), scatterYMax=$('#scatterYMax');
  const scatterOriginMode=$('#scatterOriginMode'), scatterOriginX=$('#scatterOriginX'), scatterOriginY=$('#scatterOriginY');
  const scatterStatType=$('#scatterStatType');
  const scatterLabelColorsDiv=$('#scatterLabelColors');
  const scatterLabelColorsFieldset=$('#scatterLabelColorsFieldset');
  let scatterLabelColors={};
  scatterAlphaVal.textContent=scatterAlpha.value;
  scatterFill.addEventListener('input',()=>{console.log('scatterFill changed', scatterFill.value); scheduleDrawScatter();});
  scatterBorder.addEventListener('input',()=>{console.log('scatterBorder changed', scatterBorder.value); scheduleDrawScatter();});
  scatterBorderWidth.addEventListener('input',()=>{console.log('scatterBorderWidth changed', scatterBorderWidth.value); scheduleDrawScatter();});
  scatterDotSize.addEventListener('input',()=>{console.log('scatterDotSize changed', scatterDotSize.value); scheduleDrawScatter();});
  scatterAlpha.addEventListener('input',()=>{scatterAlphaVal.textContent=scatterAlpha.value; console.log('scatterAlpha changed',scatterAlpha.value); scheduleDrawScatter();});
  scatterFontSize.addEventListener('input',()=>{scatterFontSizeVal.textContent=scatterFontSize.value; scheduleDrawScatter();});
  [scatterShowGrid,scatterLogX,scatterLogY,scatterStatType,scatterOriginMode,scatterShowLine].forEach(el=>el.addEventListener('change',()=>{console.log('scatter config changed', el.id); scheduleDrawScatter();}));
  [scatterXMin,scatterXMax,scatterYMin,scatterYMax,scatterOriginX,scatterOriginY].forEach(el=>el.addEventListener('input',()=>{console.log('scatter axis input', el.id, el.value); scheduleDrawScatter();}));

  function updateScatterLabelColorPickers(labels){
    scatterLabelColorsDiv.innerHTML='';
    if(labels.length===0){
      scatterLabelColorsFieldset.style.display='none';
      console.log('updateScatterLabelColorPickers hide');
      return;
    }
    scatterLabelColorsFieldset.style.display='';
    labels.forEach((lab,i)=>{
      if(!scatterLabelColors[lab]){
        scatterLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
        console.log('scatter default label color',{label:lab,color:scatterLabelColors[lab]});
      }
      const input=document.createElement('input');
      input.type='color';
      input.value=scatterLabelColors[lab];
      attachColorPickerNear(input);
      input.addEventListener('input',e=>{
        scatterLabelColors[lab]=e.target.value;
        console.log('scatter label color changed',{label:lab,color:scatterLabelColors[lab]});
        scheduleDrawScatter();
      });
      const lbl=document.createElement('label');
      lbl.textContent=lab+' ';
      lbl.appendChild(input);
      scatterLabelColorsDiv.appendChild(lbl);
    });
    console.log('updateScatterLabelColorPickers',scatterLabelColors);
  }

  const scatterPlotDiv=document.getElementById('scatterPlot');
  const scatterContainer=scatterPlotDiv.closest('.svgbox')||scatterPlotDiv.parentElement;
  (function initScatterResizers(){
    if(!scatterContainer) return;
    console.log('init scatter resizers');
    const MIN_W=50;
    const MIN_H=40;
    function px(n){return Math.round(n)+'px';}
    const vHandle=scatterContainer.querySelector('.resizer-vertical');
    const hHandle=scatterContainer.querySelector('.resizer-horizontal');
    const cHandle=scatterContainer.querySelector('.resizer-corner');
    function attachDrag(handle,axis){
      if(!handle) return;
      let startX=0,startY=0,startW=0,startH=0,pointerId=null;
      const onPointerDown=e=>{
        e.preventDefault();
        console.log('scatter resize start',axis);
        pointerId=e.pointerId;
        try{handle.setPointerCapture(pointerId);}catch(_){ }
        const rect=scatterContainer.getBoundingClientRect();
        startW=Math.round(rect.width);
        startH=Math.round(rect.height);
        startX=e.clientX;
        startY=e.clientY;
        scatterContainer.style.boxSizing='border-box';
        scatterContainer.style.width=px(startW);
        scatterContainer.style.height=px(startH);
        scatterContainer.style.flex='0 0 auto';
        scatterContainer.style.maxWidth='none';
        scatterContainer.style.maxHeight='none';
        document.documentElement.style.userSelect='none';
        document.documentElement.style.touchAction='none';
        const onPointerMove=ev=>{
          ev.preventDefault();
          const dx=ev.clientX-startX;
          const dy=ev.clientY-startY;
          if(axis==='x'||axis==='both'){
            const newW=Math.max(MIN_W,Math.round(startW+dx));
            scatterContainer.style.width=px(newW);
          }
          if(axis==='y'||axis==='both'){
            const newH=Math.max(MIN_H,Math.round(startH+dy));
            scatterContainer.style.height=px(newH);
          }
          scheduleDrawScatter();
        };
        const onPointerUp=ev=>{
          try{handle.releasePointerCapture(pointerId);}catch(_){ }
          document.removeEventListener('pointermove',onPointerMove);
          document.removeEventListener('pointerup',onPointerUp);
          document.documentElement.style.userSelect='';
          document.documentElement.style.touchAction='';
          console.log('scatter drag end');
          scheduleDrawScatter();
        };
        document.addEventListener('pointermove',onPointerMove);
        document.addEventListener('pointerup',onPointerUp);
      };
      handle.addEventListener('pointerdown',onPointerDown);
      handle.addEventListener('dblclick',ev=>{
        ev.preventDefault();
        scatterContainer.style.width='640px';
        scatterContainer.style.height='420px';
        scatterContainer.style.flex='0 0 auto';
        console.log('scatter size reset');
        scheduleDrawScatter();
      });
    }
    attachDrag(vHandle,'x');
    attachDrag(hHandle,'y');
    attachDrag(cHandle,'both');
    const scatterResizeObserver=new ResizeObserver(()=>{console.log('scatter resize observer triggered'); scheduleDrawScatter();});
    scatterResizeObserver.observe(scatterContainer);
  })();

  (function initScatterPanelResizer(){
    if(!scatterPanelResizer||!scatterTablePanel||!scatterGraphPanel) return;
    scatterPanelResizer.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const startX=e.clientX;
      const startTable=scatterTablePanel.getBoundingClientRect().width;
      const startGraph=scatterGraphPanel.getBoundingClientRect().width;
      const configWidth=scatterConfigPanel.getBoundingClientRect().width;
      const gap=parseFloat(getComputedStyle(scatterGraphPanel.querySelector('.diagram-area')).gap||0);
      scatterMinSvgWidth=scatterSvgBox.getBoundingClientRect().width*0.5;
      const minGraph=configWidth+gap+scatterMinSvgWidth;
      const total=startTable+startGraph;
      console.debug('scatter resizer start',{startTable,startGraph,configWidth,gap,scatterMinSvgWidth,minGraph,total});
      function onMove(ev){
        const dx=ev.clientX-startX;
        let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx));
        let newGraph=total-newTable;
        scatterTablePanel.style.flex=`0 0 ${newTable}px`;
        scatterGraphPanel.style.flex=`0 0 ${newGraph}px`;
        syncScatterWidths();
        console.debug('scatter resizer move',{dx,newTable,newGraph});
      }
      function onUp(){
        document.removeEventListener('pointermove',onMove);
        document.removeEventListener('pointerup',onUp);
        console.debug('scatter resizer end');
      }
      document.addEventListener('pointermove',onMove);
      document.addEventListener('pointerup',onUp);
    });
  })();

  let scatterTitleText='Scatter plot';
  let scatterXLabelText='X';
  let scatterYLabelText='Y';
  async function drawScatter(){
    const token=++scatterDrawToken; // debug token for cancellation
    console.log('drawScatter called',{token});
    const fill=scatterFill.value;
    const alpha=Number(scatterAlpha.value)||0;
    const borderWidth=Number(scatterBorderWidth.value);
    const borderColor=scatterBorder.value;
    const bw=borderWidth;
    const fs=Number(scatterFontSize.value);
    const showGrid=scatterShowGrid.checked;
    console.log('scatter showGrid', showGrid);
    const showLine=scatterShowLine.checked;
    console.log('scatter showLine', showLine);
    const logX=scatterLogX.checked;
    const logY=scatterLogY.checked;
    const dotSize=Number(scatterDotSize.value)||3;
    console.log('drawScatter dot size', dotSize);
    const method=scatterStatType.value;
    const xMinManual=parseFloat(scatterXMin.value);
    const xMaxManual=parseFloat(scatterXMax.value);
    const yMinManual=parseFloat(scatterYMin.value);
    const yMaxManual=parseFloat(scatterYMax.value);
    console.log('scatter manual range',{xMinManual,xMaxManual,yMinManual,yMaxManual});
    const originMode=scatterOriginMode.value;
    const originXInput=parseFloat(scatterOriginX.value);
    const originYInput=parseFloat(scatterOriginY.value);
    console.log('scatter origin inputs',{originMode,originXInput,originYInput});
    const labelCol=scatterHot.getDataAtCol(0);
    const xCol=scatterHot.getDataAtCol(1);
    const yCol=scatterHot.getDataAtCol(2);
    console.log('scatter column lengths',{label:labelCol.length,x:xCol.length,y:yCol.length});
    const xLabelRaw=xCol[0];
    const yLabelRaw=yCol[0];
    scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'X';
    scatterYLabelText=(yLabelRaw&&String(yLabelRaw).trim())||'Y';
    const maxLen=Math.max(labelCol.length,xCol.length,yCol.length);
    const points=[];
    const labelSet=new Set();
    let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity;
    console.time(`scatterCollectPoints_${token}`);
    for(let r=1;r<maxLen;r++){
      const xv=parseFloat(xCol[r]);
      const yv=parseFloat(yCol[r]);
      const lab=labelCol[r]?String(labelCol[r]).trim():'';
      if(!isNaN(xv)&&!isNaN(yv)){
        points.push({x:xv,y:yv,label:lab});
        if(lab) labelSet.add(lab);
        if(xv<xMinRaw) xMinRaw=xv;
        if(xv>xMaxRaw) xMaxRaw=xv;
        if(yv<yMinRaw) yMinRaw=yv;
        if(yv>yMaxRaw) yMaxRaw=yv;
      }
      if(r%10000===0){
        console.log('scatter collect progress',{row:r,token});
      }
    }
    console.timeEnd(`scatterCollectPoints_${token}`);
    const labelsUsed=Array.from(labelSet);
    updateScatterLabelColorPickers(labelsUsed);
    console.log('scatter points collected',points.length,{xMinRaw,xMaxRaw,yMinRaw,yMaxRaw});
    // determine legend requirements before sizing plot
    const legendLabels=labelsUsed;
    const legendWidth=legendLabels.length?120:0;
    console.log('scatter legend width',legendWidth,{labels:legendLabels});
    if(token!==scatterDrawToken){console.log('scatter draw cancelled after collect',{token});return;}
    const plotEl=document.getElementById('scatterPlot');
    plotEl.style.display='block';
    while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    document.getElementById('scatterStatsResults').innerHTML='';
    if(!points.length) return;
    if(logX&&points.some(p=>p.x<=0)){plotEl.innerHTML='<i>Log scale requires positive X values.</i>';return;}
    if(logY&&points.some(p=>p.y<=0)){plotEl.innerHTML='<i>Log scale requires positive Y values.</i>';return;}
    let xMin=xMinRaw, xMax=xMaxRaw, yMin=yMinRaw, yMax=yMaxRaw;
    if(isFinite(xMinManual)) xMin=xMinManual;
    if(isFinite(xMaxManual)) xMax=xMaxManual;
    if(isFinite(yMinManual)) yMin=yMinManual;
    if(isFinite(yMaxManual)) yMax=yMaxManual;
    if(originMode==='custom'){
      if(isFinite(originXInput)){
        if(logX && originXInput<=0){
          console.log('scatter custom origin ignored for X in log scale', originXInput);
        }else{
          if(originXInput<xMin) xMin=originXInput;
          if(originXInput>xMax) xMax=originXInput;
        }
      }
      if(isFinite(originYInput)){
        if(logY && originYInput<=0){
          console.log('scatter custom origin ignored for Y in log scale', originYInput);
        }else{
          if(originYInput<yMin) yMin=originYInput;
          if(originYInput>yMax) yMax=originYInput;
        }
      }
      console.log('scatter range adjusted for custom origin',{xMin,xMax,yMin,yMax});
    }
    if(xMin===xMax) xMax=xMin+1;
    if(yMin===yMax) yMax=yMin+1;
    console.log('scatter final raw range',{xMin,xMax,yMin,yMax});
    const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
    const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
    plotEl.style.position='relative';
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('id','scatterSvg');
    svg.setAttribute('width',String(W));
    svg.setAttribute('height',String(H));
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    svg.setAttribute('font-family','sans-serif');
    plotEl.appendChild(svg);
    const xMinT=logX?Math.log10(xMin):xMin;
    const xMaxT=logX?Math.log10(xMax):xMax;
    const yMinT=logY?Math.log10(yMin):yMin;
    const yMaxT=logY?Math.log10(yMax):yMax;
    function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);}
    function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(maxTicks-1),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};}
    const xScale=niceScale(xMinT,xMaxT,6);const yScale=niceScale(yMinT,yMaxT,6);
    if(isFinite(xMinManual)) xScale.min=xMinT;
    if(isFinite(xMaxManual)) xScale.max=xMaxT;
    if(isFinite(yMinManual)) yScale.min=yMinT;
    if(isFinite(yMaxManual)) yScale.max=yMaxT;
    if(isFinite(xMinManual)||isFinite(xMaxManual)){const ticks=[];for(let v=Math.ceil(xScale.min/xScale.step)*xScale.step;v<=xScale.max+1e-9;v+=xScale.step)ticks.push(v);xScale.ticks=ticks;}
    if(isFinite(yMinManual)||isFinite(yMaxManual)){const ticks=[];for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step;v<=yScale.max+1e-9;v+=yScale.step)ticks.push(v);yScale.ticks=ticks;}
    function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
    const measureCanvas=drawScatter._canvas||(drawScatter._canvas=document.createElement('canvas'));
    const measureCtx=measureCanvas.getContext('2d');
    function measureTextWidth(text,font){measureCtx.font=font;return measureCtx.measureText(text).width;}
    const tickFont=`${fs}px sans-serif`;
    const xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
    const yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
    const yLabelWidths=yTickLabels.map(lbl=>measureTextWidth(lbl,tickFont));
    const maxYLabelWidth=Math.max(...yLabelWidths,0);
    const margin={top:Math.max(32,Math.round(fs*2.2)),right:20+legendWidth,bottom:Math.max(32,Math.round(fs*2.2))+fs+6,left:Math.max(48,Math.round(fs*3.0),maxYLabelWidth+fs*2)};
    console.log('scatter margin computed',margin);
    const plotW=Math.max(20,W-margin.left-margin.right);
    const plotH=Math.max(20,H-margin.top-margin.bottom);
    const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
    const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
    function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
    const tickLen=6;
    if(showGrid){xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':1});});yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':1});});}
    let originXT,originYT;
    if(originMode==='custom'){originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);}else{originXT=xScale.min;originYT=yScale.min;}
    const clampedXT=Math.min(Math.max(originXT,xScale.min),xScale.max);
    const clampedYT=Math.min(Math.max(originYT,yScale.min),yScale.max);
    console.log('scatter origin final',{originXT,originYT,clampedXT,clampedYT});
    const xAxisY=y2px(clampedYT);
    const yAxisX=x2px(clampedXT);
    console.log('scatter axes',{tickLen,xAxisY,yAxisX});
    add('line',{x1:margin.left - tickLen,y1:xAxisY,x2:margin.left+plotW + tickLen,y2:xAxisY,stroke:'#000','stroke-width':1});
    add('line',{x1:yAxisX,y1:margin.top - tickLen,x2:yAxisX,y2:margin.top+plotH + tickLen,stroke:'#000','stroke-width':1});
    xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:'#000','stroke-width':1});const txt=add('text',{x,y:xAxisY+tickLen+fs,'font-size':fs,'text-anchor':'middle',fill:'#000'});txt.textContent=formatTick(logX?Math.pow(10,t):t);});
    yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:'#000','stroke-width':1});const txt=add('text',{x:yAxisX-(tickLen+2),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:'#000'});txt.textContent=formatTick(logY?Math.pow(10,t):t);});
    console.time(`scatterSvgDraw_${token}`);
    const frag=document.createDocumentFragment();
    const labelBBox=new Map();
    let pointIndex=0;
    for(const p of points){
      const xv=logX?Math.log10(p.x):p.x;
      const yv=logY?Math.log10(p.y):p.y;
      const c=document.createElementNS(NS,'circle');
      c.setAttribute('cx',x2px(xv));
      c.setAttribute('cy',y2px(yv));
      c.setAttribute('r',dotSize);
      const color=scatterLabelColors[p.label]||fill;
      c.setAttribute('fill',color);
      c.setAttribute('fill-opacity',1-alpha);
      if(bw>0){c.setAttribute('stroke',borderColor);c.setAttribute('stroke-width',bw);c.setAttribute('stroke-opacity',1-alpha);} 
      const cxVal=x2px(xv), cyVal=y2px(yv);
      let bbox=labelBBox.get(p.label||'__none');
      if(!bbox){bbox={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}; labelBBox.set(p.label||'__none',bbox);}
      bbox.minX=Math.min(bbox.minX,cxVal-dotSize);
      bbox.maxX=Math.max(bbox.maxX,cxVal+dotSize);
      bbox.minY=Math.min(bbox.minY,cyVal-dotSize);
      bbox.maxY=Math.max(bbox.maxY,cyVal+dotSize);
      frag.appendChild(c);
      pointIndex++;
      if(pointIndex%10000===0){console.log('scatter svg draw progress',{pointIndex,token});}
    }
    add('g',{}).appendChild(frag);
    console.timeEnd(`scatterSvgDraw_${token}`);
    if(legendLabels.length){
      const legendGroup=document.createElementNS(NS,'g');
      const legendX=W-legendWidth+8;
      const legendY=margin.top;
      legendLabels.forEach((lab,i)=>{
        const y=legendY+i*(fs+4);
        const sw=document.createElementNS(NS,'rect');
        sw.setAttribute('x',legendX);
        sw.setAttribute('y',y-fs+4);
        sw.setAttribute('width',12);
        sw.setAttribute('height',12);
        sw.setAttribute('fill',scatterLabelColors[lab]||fill);
        legendGroup.appendChild(sw);
        const t=document.createElementNS(NS,'text');
        t.setAttribute('x',legendX+16);
        t.setAttribute('y',y);
        t.setAttribute('font-size',fs);
        t.textContent=lab;
        legendGroup.appendChild(t);
      });
      svg.appendChild(legendGroup);
      console.log('scatter legend placed inside',{labels:legendLabels,legendWidth,legendX,legendY});
    }
    const xText=add('text',{x:margin.left+plotW/2,y:H-6,'text-anchor':'middle','font-size':fs+4});xText.textContent=scatterXLabelText;makeEditable(xText,txt=>{scatterXLabelText=txt;});
    const yX=margin.left-(maxYLabelWidth+fs*0.5);
    console.log('scatter y-axis position',yX);
    const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs+4});
    yText.textContent=scatterYLabelText;makeEditable(yText,txt=>{scatterYLabelText=txt;});
    const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs+4});titleText.textContent=scatterTitleText;makeEditable(titleText,txt=>{scatterTitleText=txt;});
    const stats=computeScatterStats(points,method);
    if(token!==scatterDrawToken){console.log('scatter draw cancelled before stats',{token});return;}
    if(showLine && isFinite(stats.m) && isFinite(stats.b)){
      console.log('scatter trend line', stats);
      const x1Raw=logX?Math.pow(10,xScale.min):xScale.min;
      const x2Raw=logX?Math.pow(10,xScale.max):xScale.max;
      const y1Raw=stats.m*x1Raw+stats.b;
      const y2Raw=stats.m*x2Raw+stats.b;
      if(!logY || (y1Raw>0 && y2Raw>0)){
        const x1T=logX?Math.log10(x1Raw):x1Raw;
        const x2T=logX?Math.log10(x2Raw):x2Raw;
        const y1T=logY?Math.log10(y1Raw):y1Raw;
        const y2T=logY?Math.log10(y2Raw):y2Raw;
        add('line',{x1:x2px(x1T),y1:y2px(y1T),x2:x2px(x2T),y2:y2px(y2T),stroke:'#d00','stroke-width':1});
        const infoX=margin.left+plotW-4;
        const infoY=stats.m>=0?margin.top+plotH-(fs*2):margin.top+fs*2;
        const info=add('text',{x:infoX,y:infoY,'text-anchor':'end','font-size':fs,fill:'#000'});
        const eq=`y=${stats.m.toFixed(2)}x${stats.b>=0?'+':'-'}${Math.abs(stats.b).toFixed(2)}`;
        const t1=document.createElementNS(NS,'tspan');t1.setAttribute('x',infoX);t1.setAttribute('dy',0);t1.textContent=eq;info.appendChild(t1);
        const t2=document.createElementNS(NS,'tspan');t2.setAttribute('x',infoX);t2.setAttribute('dy',fs);t2.textContent=`r=${stats.r.toFixed(2)} R²=${stats.r2.toFixed(2)} p=${formatP(stats.p)}`;info.appendChild(t2);
      }else{
        console.log('scatter trend line skipped due to non-positive values',{y1Raw,y2Raw});
      }
    }
    const resDiv=document.getElementById('scatterStatsResults');
    resDiv.innerHTML=`<table><tr><th>r</th><td>${stats.r.toFixed(4)}</td></tr><tr><th>R²</th><td>${stats.r2.toFixed(4)}</td></tr><tr><th>P value</th><td>${formatP(stats.p)}</td></tr></table>`;
    console.log('scatter stats', stats);
    autoResizeSvg(svg);
    console.log('scatter render complete with enhanced styles');
  }


  function computeScatterStats(points,method){
    console.log('computeScatterStats',method,points.length);
    const x=points.map(p=>p.x);
    const y=points.map(p=>p.y);
    const n=points.length;
    if(n<3) return {method, r:NaN, p:NaN, r2:NaN, m:NaN, b:NaN};
    const pearson=jStat.corrcoeff(x,y);
    let r,label;
    if(method==='pearson'){r=pearson; label='Pearson';}
    else {r=jStat.spearmancoeff(x,y); label='Spearman';}
    const t=r*Math.sqrt((n-2)/(1-r*r));
    const p=2*(1-jStat.studentt.cdf(Math.abs(t),n-2));
    const r2=pearson*pearson;
    const xMean=jStat.mean(x);
    const yMean=jStat.mean(y);
    const num=x.reduce((s,xi,i)=>s+(xi-xMean)*(y[i]-yMean),0);
    const den=x.reduce((s,xi)=>s+Math.pow(xi-xMean,2),0);
    const m=num/den;
    const b=yMean-m*xMean;
    console.log('computeScatterStats result',{method:label,r,r2,p,m,b});
    return {method:label, r, p, r2, m, b};
  }
  function updateLineStats(series){
    const method=lineStatType.value;
    console.log('updateLineStats start',{seriesCount:series.length,method});
    const rows=[];
    series.forEach(s=>{
      const pts=s.points.filter(p=>p);
      if(pts.length>=3){
        const stats=computeScatterStats(pts,method);
        rows.push(`<tr><td>${s.name}</td><td>${stats.r.toFixed(4)}</td><td>${formatP(stats.p)}</td><td>${stats.m.toFixed(4)}</td></tr>`);
      }
    });
    if(rows.length){
      lineStatsResults.innerHTML='<table><tr><th>Series</th><th>r</th><th>p</th><th>Slope</th></tr>'+rows.join('')+'</table>';
    }else{
      lineStatsResults.textContent='Not enough data for statistics.';
    }
    console.log('updateLineStats complete',{rows:rows.length});
  }
  function updateHistStats(values){
    console.log('updateHistStats start',values.length);
    if(!values.length){histStatsResults.textContent='No data';return;}
    const mean=jStat.mean(values);
    const median=jStat.median(values);
    const sd=jStat.stdev(values,true);
    histStatsResults.innerHTML=`<table><tr><th>n</th><td>${values.length}</td></tr><tr><th>Mean</th><td>${mean.toFixed(4)}</td></tr><tr><th>Median</th><td>${median.toFixed(4)}</td></tr><tr><th>SD</th><td>${sd.toFixed(4)}</td></tr></table>`;
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
    pieStatsResults.innerHTML=`<table><tr><th>Chi²</th><td>${chi2.toFixed(4)}</td></tr><tr><th>df</th><td>${df}</td></tr><tr><th>p-value</th><td>${formatP(p)}</td></tr></table>`;
    console.log('updatePieStats result',{chi2,df,p});
  }

  function getScatterGraphPayload(){
    return {
      type:'scatter',
      data:scatterHot.getData(),
      config:{
        title:scatterTitleText,
        xLabel:scatterXLabelText,
        yLabel:scatterYLabelText,
        dotSize:scatterDotSize.value,
        fill:scatterFill.value,
        border:scatterBorder.value,
        borderWidth:scatterBorderWidth.value,
        alpha:scatterAlpha.value,
        labelColors:scatterLabelColors,
        showGrid:scatterShowGrid.checked,
        logX:scatterLogX.checked,
        logY:scatterLogY.checked,
        xMin:scatterXMin.value,
        xMax:scatterXMax.value,
        yMin:scatterYMin.value,
        yMax:scatterYMax.value,
        originMode:scatterOriginMode.value,
        originX:scatterOriginX.value,
        originY:scatterOriginY.value,
        showLine:scatterShowLine.checked
      }
    };
  }
  let scatterFileHandle=null, scatterFileName='scatter.graph';
  async function saveScatterFile(){
    const payload=getScatterGraphPayload();
    console.log('saveScatterFile',{payload,scatterFileHandle});
    if(scatterFileHandle&&scatterFileHandle.createWritable){
      try{
        const perm=await verifyPermission(scatterFileHandle,true);
        console.log('saveScatterFile permission',perm);
        if(perm){
          const w=await scatterFileHandle.createWritable();
          await w.write(JSON.stringify(payload));
          await w.close();
        }
      }catch(err){console.error('saveScatterFile error',err);}
    }else if(window.showSaveFilePicker){
      console.log('saveScatterFile no handle - invoking saveAs');
      await saveAsScatterFile();
    }else{
      console.log('saveScatterFile fallback download');
      downloadJSON(payload,scatterFileName);
    }
  }
  async function saveAsScatterFile(){
    const payload=getScatterGraphPayload();
    console.log('saveAsScatterFile',payload);
    if(window.showSaveFilePicker){
      try{
        scatterFileHandle=await window.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:scatterFileName});
        const w=await scatterFileHandle.createWritable();
        await w.write(JSON.stringify(payload));
        await w.close();
      }catch(err){console.error('saveAsScatterFile error',err);}
    }else{
      downloadJSON(payload,scatterFileName);
    }
  }
  async function openScatterFile(){
    console.log('openScatterFile start');
    if(window.showOpenFilePicker){
      try{
        [scatterFileHandle]=await window.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]});
        const file=await scatterFileHandle.getFile();
        scatterFileName=file.name;
        loadScatterGraphFile(file);
      }catch(err){console.error('openScatterFile error',err);}
    }else{
      const input=document.getElementById('scatterGraphFile');
      input.value='';
      input.click();
    }
  }
  function loadScatterGraphFile(file){
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const obj=JSON.parse(e.target.result);
        console.log('loadScatterGraph',obj);
        if(obj.type!=='scatter') throw new Error('Invalid graph type');
        scatterHot.loadData(obj.data||[]);
        const c=obj.config||{};
        scatterTitleText=c.title||scatterTitleText;
        scatterXLabelText=c.xLabel||scatterXLabelText;
        scatterYLabelText=c.yLabel||scatterYLabelText;
        scatterDotSize.value=c.dotSize||scatterDotSize.value;
        scatterFill.value=c.fill||scatterFill.value;
        scatterBorder.value=c.border||scatterBorder.value;
        scatterBorderWidth.value=c.borderWidth||scatterBorderWidth.value;
        scatterAlpha.value=c.alpha||0;
        scatterAlphaVal.textContent=scatterAlpha.value;
        scatterLabelColors=c.labelColors||{};
        scatterShowGrid.checked=!!c.showGrid;
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
        scheduleDrawScatter();
      }catch(err){console.error('loadScatterGraph error',err);}
    };
    reader.readAsText(file);
  }

  document.getElementById('scatterPNG').addEventListener('click',async()=>{
    const svgEl=document.getElementById('scatterSvg');
    if(!svgEl) return;
    console.log('scatterPNG export start');
    const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800;
    const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
    const xml=serializeCleanSVG(svgEl);
    const img=new Image();
    const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
    img.src=url;
    await img.decode().catch(err=>{console.error('scatterPNG svg decode',err);});
    const outCanvas=document.createElement('canvas');
    outCanvas.width=W;
    outCanvas.height=H;
    const ctx=outCanvas.getContext('2d');
    ctx.drawImage(img,0,0);
    outCanvas.toBlob(b=>{
      const pngUrl=URL.createObjectURL(b);
      const a=document.createElement('a');
      a.href=pngUrl; a.download='scatter.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(pngUrl),4000);
    },'image/png');
  });
  document.getElementById('scatterSVG').addEventListener('click',()=>{
    const svgEl=document.getElementById('scatterSvg');
    if(!svgEl) return;
    console.log('scatterSVG export start');
    const xml=serializeCleanSVG(svgEl);
    const blob=new Blob([xml],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='scatter.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  });
  document.getElementById('openScatter').addEventListener('click',openScatterFile);
  document.getElementById('saveScatter').addEventListener('click',saveScatterFile);
  document.getElementById('saveAsScatter').addEventListener('click',saveAsScatterFile);
  document.getElementById('scatterGraphFile').addEventListener('change',e=>{
    const f=e.target.files[0];
    if(f){
      scatterFileName=f.name;
      scatterFileHandle=null;
      loadScatterGraphFile(f);
    }
  });
  
  // PCA plot setup
  const pcaHotContainer=document.getElementById('pcaHot');
  const pcaHotWrapper=document.getElementById('pcaHotWrapper');
  const pcaTablePanel=document.getElementById('pcaTablePanel');
  const pcaGraphPanel=document.getElementById('pcaGraphPanel');
  const pcaPanelResizer=document.getElementById('pcaPanelResizer');
  const pcaSvgBox=pcaGraphPanel?.querySelector('.svgbox');
  const pcaConfigPanel=pcaGraphPanel?.querySelector('.config-options');
  let pcaMinSvgWidth=0;
  function syncPcaWidths(){
    const tableWidth=pcaTablePanel.getBoundingClientRect().width;
    const graphWidth=pcaGraphPanel.getBoundingClientRect().width;
    const configWidth=pcaConfigPanel.getBoundingClientRect().width;
    const gap=parseFloat(getComputedStyle(pcaGraphPanel.querySelector('.diagram-area')).gap||0);
    const available=graphWidth-configWidth-gap;
    const minW=pcaMinSvgWidth||0;
    const newW=Math.max(minW, Math.min(tableWidth, available));
    if(pcaSvgBox) pcaSvgBox.style.width=newW+'px';
    console.debug('syncPcaWidths',{tableWidth,graphWidth,configWidth,gap,available,newW,minW});
  }
  const pcaTableObserver=new ResizeObserver(()=>{syncPcaWidths();});
  pcaTableObserver.observe(pcaTablePanel);
  syncPcaWidths();
  if(window.Shared && window.Shared.ensureHotWrapperStyles){ window.Shared.ensureHotWrapperStyles(pcaHotWrapper); }
  console.debug('pcaHotWrapper style updated', pcaHotWrapper.style.cssText);
  const pcaData=Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,PCA_DEFAULT_COLS);
  pcaData[0]=['Label','Var1','Var2','Var3','Var4'];
  const pcaHot=new Handsontable(pcaHotContainer,{
    data:pcaData,
    rowHeaders(index){const label=index===0?'':index; console.debug('pca rowHeader',{index,label}); return label;},
    colHeaders:true,
    minRows:DEFAULT_ROWS,
    minCols:PCA_DEFAULT_COLS,
    contextMenu:true,
    undo:true,
    afterChange:(changes,source)=>{if(changes){console.log('pca afterChange',{count:changes.length,source}); scheduleDrawPca();}},
    afterUndo:()=>{console.log('pca undo'); scheduleDrawPca();},
    afterRedo:()=>{console.log('pca redo'); scheduleDrawPca();},
    licenseKey:'non-commercial-and-evaluation',
    cells(row,col){const props={}; if(row===0) props.className='htCenter'; return props;}
  });
  document.getElementById('pcaLoadExample').addEventListener('click',()=>{
    const pcaExample=[['Label','Var1','Var2','Var3','Var4'],['A',1,2,3,4],['A',2,1,3,2],['B',5,4,3,2],['B',4,5,6,5]];
    pcaHot.loadData(pcaExample);
    console.log('pca example loaded');
    scheduleDrawPca();
  });
  document.getElementById('pcaImport').addEventListener('click',()=>{const f=document.getElementById('pcaFile'); f.value=''; f.click();});
  document.getElementById('pcaFile').addEventListener('change',e=>{
    const file=e.target.files[0];
    if(!file) return;
    const ext=file.name.split('.').pop().toLowerCase();
    const reader=new FileReader();
    if(['csv','tsv','txt'].includes(ext)){
      reader.onload=ev=>{const text=ev.target.result; const delim=ext==='csv'?',':'\t'; let rows=text.split(/\r?\n/).map(r=>r.split(delim)); pcaProcessImportedRows(rows);};
      reader.readAsText(file);
    }else if(['xls','xlsx','ods','odg'].includes(ext)){
      reader.onload=async ev=>{try{ if(!window.XLSX){ await new Promise((res,rej)=>{const s=document.createElement('script'); s.src='libs/xlsx.full.min.js'; s.onload=()=>res(); s.onerror=err=>rej(new Error('Failed to load XLSX script')); document.head.appendChild(s);}); } const data=new Uint8Array(ev.target.result); const workbook=XLSX.read(data,{type:'array'}); const sheet=workbook.Sheets[workbook.SheetNames[0]]; let rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''}); pcaProcessImportedRows(rows);}catch(err){alert('Failed to import spreadsheet: '+err.message);} };
      reader.readAsArrayBuffer(file);
    }else{ alert('Unsupported file format: '+ext); }
  });
  pcaHotContainer.addEventListener('paste',async e=>{
    e.preventDefault(); e.stopPropagation();
    let text=e.clipboardData?.getData('text/plain');
    if(!text){ try{ text=await navigator.clipboard.readText(); console.log('pca clipboard fallback used'); }catch(err){ console.log('pca clipboard read failed',err); return; } }
    const rowArr=text.split(/\r?\n/);
    if(rowArr.length<2 && !text.includes('\t') && !text.includes(',')){ console.log('pca paste ignored: insufficient data'); return; }
    const delim=text.includes('\t')?'\t':','; const rows=rowArr.map(r=>r.split(delim));
    const sel=pcaHot.getSelectedLast(); const startRow=sel?sel[0]:0; const startCol=sel?sel[1]:0;
    console.log('pca fast paste',{rows:rows.length,cols:rows[0]?.length,startRow,startCol});
    pcaProcessImportedRows(rows,startRow,startCol);
  });
  function pcaProcessImportedRows(rows,startRow=0,startCol=0){
    if(!rows||!rows.length) return;
    rows=rows.filter(r=>r && r.some(c=>String(c).trim()!==''));
    if(!rows.length) return;
    const colCount=Math.max(PCA_DEFAULT_COLS,...rows.map(r=>r.length));
    const rowCount=rows.length;
    const curRows=pcaHot.countRows();
    const curCols=pcaHot.countCols();
    const targetRows=Math.max(DEFAULT_ROWS,curRows,startRow+rowCount);
    const targetCols=Math.max(curCols,startCol+colCount,PCA_DEFAULT_COLS);
    const data=Array.from({length:targetRows},(_,r)=>Array(targetCols).fill(''));
    const existing=pcaHot.getData();
    for(let r=0;r<curRows;r++){ for(let c=0;c<curCols;c++) data[r][c]=existing[r][c]; }
    for(let r=0;r<rowCount;r++){ const row=rows[r]; for(let c=0;c<row.length;c++) data[startRow+r][startCol+c]=row[c]; }
    pcaHot.updateSettings({data,minRows:targetRows,minCols:targetCols});
    console.log('pca data imported',{rows:data.length,cols:targetCols});
    scheduleDrawPca();
  }
  const pcaMethod=$('#pcaMethod'), pcaFill=$('#pcaFill'), pcaBorder=$('#pcaBorder'), pcaBorderWidth=$('#pcaBorderWidth'), pcaDotSize=$('#pcaDotSize'), pcaAlpha=$('#pcaAlpha');
  const pcaAlphaVal=$('#pcaAlphaVal');
  const pcaFontSize=$('#pcaFontSize'), pcaFontSizeVal=$('#pcaFontSizeVal');
  const pcaShowGrid=$('#pcaShowGrid');
  const pcaXMin=$('#pcaXMin'), pcaXMax=$('#pcaXMax'), pcaYMin=$('#pcaYMin'), pcaYMax=$('#pcaYMax');
  const pcaScale=$('#pcaScale');
  const pcaLabelColorsDiv=$('#pcaLabelColors');
  const pcaLabelColorsFieldset=$('#pcaLabelColorsFieldset');
  const pcaStatsResults=document.getElementById('pcaStatsResults');
  let pcaLabelColors={};
  pcaAlphaVal.textContent=pcaAlpha.value;
  pcaMethod.addEventListener('change',()=>{console.log('pcaMethod changed',pcaMethod.value); scheduleDrawPca();});
  pcaFill.addEventListener('input',()=>{console.log('pcaFill changed',pcaFill.value); scheduleDrawPca();});
  pcaBorder.addEventListener('input',()=>{console.log('pcaBorder changed',pcaBorder.value); scheduleDrawPca();});
  pcaBorderWidth.addEventListener('input',()=>{console.log('pcaBorderWidth changed',pcaBorderWidth.value); scheduleDrawPca();});
  pcaDotSize.addEventListener('input',()=>{console.log('pcaDotSize changed',pcaDotSize.value); scheduleDrawPca();});
  pcaAlpha.addEventListener('input',()=>{pcaAlphaVal.textContent=pcaAlpha.value; console.log('pcaAlpha changed',pcaAlpha.value); scheduleDrawPca();});
  pcaFontSize.addEventListener('input',()=>{pcaFontSizeVal.textContent=pcaFontSize.value; scheduleDrawPca();});
  [pcaShowGrid,pcaScale].forEach(el=>el.addEventListener('change',()=>{console.log('pca config changed',el.id); scheduleDrawPca();}));
  [pcaXMin,pcaXMax,pcaYMin,pcaYMax].forEach(el=>el.addEventListener('input',()=>{console.log('pca axis input',el.id,el.value); scheduleDrawPca();}));
  function updatePcaLabelColorPickers(labels){
    pcaLabelColorsDiv.innerHTML='';
    if(labels.length===0){ pcaLabelColorsFieldset.style.display='none'; console.log('updatePcaLabelColorPickers hide'); return; }
    pcaLabelColorsFieldset.style.display='';
    labels.forEach((lab,i)=>{ if(!pcaLabelColors[lab]){ pcaLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]; console.log('pca default label color',{label:lab,color:pcaLabelColors[lab]}); }
      const input=document.createElement('input'); input.type='color'; input.value=pcaLabelColors[lab]; attachColorPickerNear(input);
      input.addEventListener('input',e=>{ pcaLabelColors[lab]=e.target.value; console.log('pca label color changed',{label:lab,color:pcaLabelColors[lab]}); scheduleDrawPca(); });
      const lbl=document.createElement('label'); lbl.textContent=lab+' '; lbl.appendChild(input); pcaLabelColorsDiv.appendChild(lbl); });
    console.log('updatePcaLabelColorPickers',pcaLabelColors);
  }
  const pcaPlotDiv=document.getElementById('pcaPlot');
  pcaPlotDiv.style.background='none';
  window.DEBUG_PCA=true;
  if(window.DEBUG_PCA) console.log('pcaPlot background set to transparent');
  const pcaContainer=pcaPlotDiv.closest('.svgbox')||pcaPlotDiv.parentElement;
  (function initPcaResizers(){
    if(!pcaContainer) return;
    if(window.Shared && window.Shared.attachResizableBox){
      window.Shared.attachResizableBox(pcaContainer, { onResize: () => scheduleDrawPca() });
    }
  })();
  (function initPcaPanelResizer(){
    if(!pcaPanelResizer||!pcaTablePanel||!pcaGraphPanel) return;
    pcaPanelResizer.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const startX=e.clientX;
      const startTable=pcaTablePanel.getBoundingClientRect().width;
      const startGraph=pcaGraphPanel.getBoundingClientRect().width;
      const configWidth=pcaConfigPanel.getBoundingClientRect().width;
      const gap=parseFloat(getComputedStyle(pcaGraphPanel.querySelector('.diagram-area')).gap||0);
      pcaMinSvgWidth=pcaSvgBox.getBoundingClientRect().width*0.5;
      const minGraph=configWidth+gap+pcaMinSvgWidth;
      const total=startTable+startGraph;
      console.debug('pca resizer start',{startTable,startGraph,configWidth,gap,pcaMinSvgWidth,minGraph,total});
      function onMove(ev){
        const dx=ev.clientX-startX;
        let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx));
        let newGraph=total-newTable;
        pcaTablePanel.style.flex=`0 0 ${newTable}px`;
        pcaGraphPanel.style.flex=`0 0 ${newGraph}px`;
        syncPcaWidths();
        console.debug('pca resizer move',{dx,newTable,newGraph});
      }
      function onUp(){
        document.removeEventListener('pointermove',onMove);
        document.removeEventListener('pointerup',onUp);
        console.debug('pca resizer end');
      }
      document.addEventListener('pointermove',onMove);
      document.addEventListener('pointerup',onUp);
    });
  })();
  let pcaXLabelText='PC1'; let pcaYLabelText='PC2';
async function drawPcaOld(){ const token=++pcaDrawToken; console.log('drawPca called',{token});
    const fill=pcaFill.value; const alpha=Number(pcaAlpha.value)||0; const borderWidth=Number(pcaBorderWidth.value); const borderColor=pcaBorder.value; const bw=borderWidth; const fs=Number(pcaFontSize.value); const showGrid=pcaShowGrid.checked; const dotSize=Number(pcaDotSize.value)||3; const xMinManual=parseFloat(pcaXMin.value); const xMaxManual=parseFloat(pcaXMax.value); const yMinManual=parseFloat(pcaYMin.value); const yMaxManual=parseFloat(pcaYMax.value); const scaleVars=pcaScale.checked; console.log('pca manual range',{xMinManual,xMaxManual,yMinManual,yMaxManual,scaleVars}); const data=pcaHot.getData(); const labels=[]; const matrix=[]; for(let r=1;r<data.length;r++){ const row=data[r]; if(!row) continue; const lab=row[0]?String(row[0]).trim():''; const vals=[]; for(let c=1;c<row.length;c++){ const v=parseFloat(row[c]); if(isNaN(v)){ vals.length=0; break;} vals.push(v); } if(vals.length){ labels.push(lab); matrix.push(vals);} } console.log('pca collected',{rows:matrix.length,cols:matrix[0]?.length}); if(matrix.length<2 || matrix[0].length<2){ pcaPlotDiv.innerHTML='<i>At least two samples and two variables required.</i>'; pcaStatsResults.textContent=''; return; } const nSamples=matrix.length; const nFeatures=matrix[0].length; for(let j=0;j<nFeatures;j++){ const col=matrix.map(r=>r[j]); const mean=jStat.mean(col); const sd=jStat.stdev(col,true); for(let i=0;i<nSamples;i++){ let val=matrix[i][j]-mean; if(scaleVars && sd>0) val/=sd; matrix[i][j]=val; } }
    if(!SVDJS||!SVDJS.SVD){console.error("SVDJS missing");pcaPlotDiv.innerHTML="<i>PCA library not loaded.</i>";return;} const svd=SVDJS.SVD(matrix); console.debug("pca svd result",svd); const scores=[]; for(let i=0;i<nSamples;i++){ scores[i]=[]; for(let k=0;k<svd.q.length;k++){ scores[i][k]=svd.u[i][k]*svd.q[k]; } } console.debug("pca scores",scores); const variances=svd.q.map(s=>s*s/(nSamples-1)); const totalVar=variances.reduce((a,b)=>a+b,0); const pc1Pct=variances[0]/totalVar*100; const pc2Pct=variances[1]/totalVar*100; pcaXLabelText=`PC1 (${pc1Pct.toFixed(1)}%)`; pcaYLabelText=`PC2 (${pc2Pct.toFixed(1)}%)`; const points=scores.map((s,i)=>({x:s[0],y:s[1],label:labels[i]})); const labelSet=new Set(labels.filter(l=>l)); updatePcaLabelColorPickers(Array.from(labelSet)); let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity; points.forEach(p=>{ if(p.x<xMinRaw) xMinRaw=p.x; if(p.x>xMaxRaw) xMaxRaw=p.x; if(p.y<yMinRaw) yMinRaw=p.y; if(p.y>yMaxRaw) yMaxRaw=p.y; }); const legendLabels=Array.from(labelSet); const legendWidth=legendLabels.length?120:0; if(token!==pcaDrawToken){console.log('pca draw cancelled after collect',{token});return;} const plotEl=document.getElementById('pcaPlot'); plotEl.style.display='block'; while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild); document.getElementById('pcaStatsResults').innerHTML=`PC1: ${pc1Pct.toFixed(1)}% variance<br>PC2: ${pc2Pct.toFixed(1)}% variance`; if(!points.length) return; let xMin=xMinRaw,xMax=xMaxRaw,yMin=yMinRaw,yMax=yMaxRaw; if(isFinite(xMinManual)) xMin=xMinManual; if(isFinite(xMaxManual)) xMax=xMaxManual; if(isFinite(yMinManual)) yMin=yMinManual; if(isFinite(yMaxManual)) yMax=yMaxManual; if(xMin===xMax) xMax=xMin+1; if(yMin===yMax) yMax=yMin+1; console.log('pca final raw range',{xMin,xMax,yMin,yMax}); const W=Math.max(50,Math.floor(plotEl.clientWidth||50)); const H=Math.max(40,Math.floor(plotEl.clientHeight||40)); plotEl.style.position='relative'; const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','pcaSvg'); svg.setAttribute('width',String(W)); svg.setAttribute('height',String(H)); svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('font-family','sans-serif'); plotEl.appendChild(svg); function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);} function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(maxTicks-1),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};} const xScale=niceScale(xMin,xMax,6); const yScale=niceScale(yMin,yMax,6); if(isFinite(xMinManual)) xScale.min=xMin; if(isFinite(xMaxManual)) xScale.max=xMax; if(isFinite(yMinManual)) yScale.min=yMin; if(isFinite(yMaxManual)) yScale.max=yMax; const margin={left:60,right:20+legendWidth,top:20,bottom:50}; const innerW=W-margin.left-margin.right; const innerH=H-margin.top-margin.bottom; const add=(tag,attrs,text)=>{const el=document.createElementNS(NS,tag); for(const k in attrs) el.setAttribute(k,String(attrs[k])); if(text) el.textContent=text; svg.appendChild(el); return el;}; add('rect',{x:0,y:0,width:W,height:H,fill:'#fff'}); if(showGrid){ xScale.ticks.forEach(t=>{const x=margin.left+(t-xScale.min)*(innerW)/(xScale.max-xScale.min); add('line',{x1:x,y1:margin.top,x2:x,y2:H-margin.bottom,stroke:'#eee'});}); yScale.ticks.forEach(t=>{const y=H-margin.bottom-(t-yScale.min)*innerH/(yScale.max-yScale.min); add('line',{x1:margin.left,y1:y,x2:W-margin.right,y2:y,stroke:'#eee'});}); } add('line',{x1:margin.left,y1:margin.top,x2:margin.left,y2:H-margin.bottom,stroke:'#000'}); add('line',{x1:margin.left,y1:H-margin.bottom,x2:W-margin.right,y2:H-margin.bottom,stroke:'#000'}); xScale.ticks.forEach(t=>{const x=margin.left+(t-xScale.min)*innerW/(xScale.max-xScale.min); add('line',{x1:x,y1:H-margin.bottom,x2:x,y2:H-margin.bottom+6,stroke:'#000'}); add('text',{x:x,y:H-margin.bottom+fs,'font-size':fs,'text-anchor':'middle'},String(t));}); yScale.ticks.forEach(t=>{const y=H-margin.bottom-(t-yScale.min)*innerH/(yScale.max-yScale.min); add('line',{x1:margin.left-6,y1:y,x2:margin.left,y2:y,stroke:'#000'}); add('text',{x:margin.left-8,y:y+fs/3,'font-size':fs,'text-anchor':'end'},String(t));}); add('text',{x:margin.left+innerW/2,y:H-10,'font-size':fs,'text-anchor':'middle'},pcaXLabelText); add('text',{x:20,y:margin.top+innerH/2,'font-size':fs,'text-anchor':'middle',transform:`rotate(-90 20 ${margin.top+innerH/2})`},pcaYLabelText); points.forEach(pt=>{ const cx=margin.left+(pt.x-xScale.min)*innerW/(xScale.max-xScale.min); const cy=H-margin.bottom-(pt.y-yScale.min)*innerH/(yScale.max-yScale.min); const col=pt.label? (pcaLabelColors[pt.label]||DEFAULT_SCATTER_COLORS[0]):pcaFill.value; add('circle',{cx,cy,r:dotSize,fill:col,stroke:alpha>0?borderColor:'none','stroke-width':bw,opacity:1-alpha});}); legendLabels.forEach((lab,i)=>{const y=margin.top+i*(fs+6); const color=pcaLabelColors[lab]||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]; add('rect',{x:W-legendWidth+10,y:y,width:12,height:12,fill:color}); add('text',{x:W-legendWidth+28,y:y+fs-3,'font-size':fs},lab);}); }
function getPcaGraphPayload(){
  return {
    type:'pca',
    data:pcaHot.getData(),
    config:{
      method:pcaMethod.value,
      dotSize:pcaDotSize.value,
      fill:pcaFill.value,
      border:pcaBorder.value,
      borderWidth:pcaBorderWidth.value,
      alpha:pcaAlpha.value,
      labelColors:pcaLabelColors,
      showGrid:pcaShowGrid.checked,
      xMin:pcaXMin.value,
      xMax:pcaXMax.value,
      yMin:pcaYMin.value,
      yMax:pcaYMax.value,
      scale:pcaScale.checked,
      fontSize:pcaFontSize.value
    }
  };
}
  let pcaFileHandle=null, pcaFileName='pca.graph';
  async function savePcaFile(){ const payload=getPcaGraphPayload(); console.log('savePcaFile',{payload,pcaFileHandle}); if(pcaFileHandle&&pcaFileHandle.createWritable){ try{ const perm=await verifyPermission(pcaFileHandle,true); if(perm){ const w=await pcaFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close(); } }catch(err){console.error('savePcaFile error',err);} }else if(window.showSaveFilePicker){ console.log('savePcaFile no handle - invoking saveAs'); await saveAsPcaFile(); }else{ console.log('savePcaFile fallback download'); downloadJSON(payload,pcaFileName); } }
  async function saveAsPcaFile(){ const payload=getPcaGraphPayload(); console.log('saveAsPcaFile',payload); if(window.showSaveFilePicker){ try{ pcaFileHandle=await window.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:pcaFileName}); const w=await pcaFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close(); }catch(err){console.error('saveAsPcaFile error',err);} }else{ downloadJSON(payload,pcaFileName); } }
  async function openPcaFile(){ console.log('openPcaFile start'); if(window.showOpenFilePicker){ try{ [pcaFileHandle]=await window.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]}); const file=await pcaFileHandle.getFile(); pcaFileName=file.name; loadPcaGraphFile(file); }catch(err){console.error('openPcaFile error',err);} }else{ const input=document.getElementById('pcaGraphFile'); input.value=''; input.click(); } }
  function loadPcaGraphFile(file){ const reader=new FileReader(); reader.onload=e=>{ try{ const obj=JSON.parse(e.target.result); console.log('loadPcaGraph',obj); if(obj.type!=='pca') throw new Error('Invalid graph type'); pcaHot.loadData(obj.data||[]); const c=obj.config||{}; pcaDotSize.value=c.dotSize||pcaDotSize.value; pcaFill.value=c.fill||pcaFill.value; pcaBorder.value=c.border||pcaBorder.value; pcaBorderWidth.value=c.borderWidth||pcaBorderWidth.value; pcaMethod.value=c.method||'pca'; pcaAlpha.value=c.alpha||0; pcaAlphaVal.textContent=pcaAlpha.value; pcaLabelColors=c.labelColors||{}; pcaShowGrid.checked=!!c.showGrid; pcaXMin.value=c.xMin||''; pcaXMax.value=c.xMax||''; pcaYMin.value=c.yMin||''; pcaYMax.value=c.yMax||''; pcaScale.checked=!!c.scale; pcaFontSize.value=c.fontSize||pcaFontSize.value; pcaFontSizeVal.textContent=pcaFontSize.value; scheduleDrawPca(); }catch(err){console.error('loadPcaGraph error',err);} }; reader.readAsText(file); }
  document.getElementById('pcaPNG').addEventListener('click',async()=>{ const svgEl=document.getElementById('pcaSvg'); if(!svgEl) return; console.log('pcaPNG export start'); const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800; const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400; const xml=serializeCleanSVG(svgEl); const img=new Image(); const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml); img.src=url; await img.decode().catch(err=>{console.error('pcaPNG svg decode',err);}); const outCanvas=document.createElement('canvas'); outCanvas.width=W; outCanvas.height=H; const ctx=outCanvas.getContext('2d'); ctx.drawImage(img,0,0); outCanvas.toBlob(b=>{ const pngUrl=URL.createObjectURL(b); const a=document.createElement('a'); a.href=pngUrl; a.download='pca.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(pngUrl),4000); },'image/png'); });
  document.getElementById('pcaSVG').addEventListener('click',()=>{ const svgEl=document.getElementById('pcaSvg'); if(!svgEl) return; console.log('pcaSVG export start'); const xml=serializeCleanSVG(svgEl); const blob=new Blob([xml],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pca.svg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000); });
  document.getElementById('openPca').addEventListener('click',openPcaFile);
  document.getElementById('savePca').addEventListener('click',savePcaFile);
  document.getElementById('saveAsPca').addEventListener('click',saveAsPcaFile);
  document.getElementById('pcaGraphFile').addEventListener('change',e=>{ const f=e.target.files[0]; if(f){ pcaFileName=f.name; pcaFileHandle=null; loadPcaGraphFile(f); } });

  // Line graph setup
  const lineHotContainer=document.getElementById('lineHot');
  const lineHotWrapper=document.getElementById('lineHotWrapper');
  const lineTablePanel=document.getElementById('lineTablePanel');
  const lineGraphPanel=document.getElementById('lineGraphPanel');
  const linePanelResizer=document.getElementById('linePanelResizer');
  const lineSvgBox=lineGraphPanel?.querySelector('.svgbox');
  const lineConfigPanel=lineGraphPanel?.querySelector('.config-options');
  let lineMinSvgWidth=0;
  function syncLineWidths(){
  const tableWidth=lineTablePanel.getBoundingClientRect().width;
  const graphWidth=lineGraphPanel.getBoundingClientRect().width;
  const configWidth=lineConfigPanel.getBoundingClientRect().width;
  const gap=parseFloat(getComputedStyle(lineGraphPanel.querySelector('.diagram-area')).gap||0);
  const available=graphWidth-configWidth-gap;
  const minW=lineMinSvgWidth||0;
  const newW=Math.max(minW, Math.min(tableWidth, available));
  if(lineSvgBox) lineSvgBox.style.width=newW+'px';
  if(window.DEBUG_LINE) console.log('syncLineWidths',{tableWidth,graphWidth,configWidth,gap,available,newW,minW});
}

async function drawPca(){
  console.log('drawPca wrapper start',{method:pcaMethod.value});
  if(pcaMethod.value==='pca'){
    return drawPcaOld();
  }
  const token=++pcaDrawToken;
  const fill=pcaFill.value; const alpha=Number(pcaAlpha.value)||0; const borderWidth=Number(pcaBorderWidth.value); const borderColor=pcaBorder.value; const bw=borderWidth; const fs=Number(pcaFontSize.value); const showGrid=pcaShowGrid.checked; const dotSize=Number(pcaDotSize.value)||3; const xMinManual=parseFloat(pcaXMin.value); const xMaxManual=parseFloat(pcaXMax.value); const yMinManual=parseFloat(pcaYMin.value); const yMaxManual=parseFloat(pcaYMax.value); const scaleVars=pcaScale.checked;
  console.log('mds manual range',{xMinManual,xMaxManual,yMinManual,yMaxManual,scaleVars});
  const data=pcaHot.getData(); const labels=[]; const matrix=[];
  for(let r=1;r<data.length;r++){ const row=data[r]; if(!row) continue; const lab=row[0]?String(row[0]).trim():''; const vals=[]; for(let c=1;c<row.length;c++){ const v=parseFloat(row[c]); if(isNaN(v)){ vals.length=0; break;} vals.push(v);} if(vals.length){ labels.push(lab); matrix.push(vals);} }
  console.log('mds collected',{rows:matrix.length,cols:matrix[0]?.length});
  if(matrix.length<2 || matrix[0].length<2){ pcaPlotDiv.innerHTML='<i>At least two samples and two variables required.</i>'; pcaStatsResults.textContent=''; return; }
  const nSamples=matrix.length; const nFeatures=matrix[0].length;
  for(let j=0;j<nFeatures;j++){ const col=matrix.map(r=>r[j]); const mean=jStat.mean(col); const sd=jStat.stdev(col,true); for(let i=0;i<nSamples;i++){ let val=matrix[i][j]-mean; if(scaleVars && sd>0) val/=sd; matrix[i][j]=val; } }
  if(!SVDJS||!SVDJS.SVD){console.error('SVDJS missing');pcaPlotDiv.innerHTML="<i>PCA library not loaded.</i>";return;}
  const dist=Array.from({length:nSamples},()=>Array(nSamples).fill(0));
  for(let i=0;i<nSamples;i++){
    for(let j=i+1;j<nSamples;j++){
      let sum=0; for(let k=0;k<nFeatures;k++){ const diff=matrix[i][k]-matrix[j][k]; sum+=diff*diff; }
      const d=Math.sqrt(sum); dist[i][j]=dist[j][i]=d;
    }
  }
  console.debug('mds distance',dist);
  const D2=dist.map(r=>r.map(v=>v*v));
  const rowMeans=D2.map(r=>r.reduce((a,b)=>a+b,0)/nSamples);
  const colMeans=Array.from({length:nSamples},(_,j)=>D2.reduce((a,row)=>a+row[j],0)/nSamples);
  const totalMean=rowMeans.reduce((a,b)=>a+b,0)/nSamples;
  const B=Array.from({length:nSamples},()=>Array(nSamples).fill(0));
  for(let i=0;i<nSamples;i++){
    for(let j=0;j<nSamples;j++){
      B[i][j]=-0.5*(D2[i][j]-rowMeans[i]-colMeans[j]+totalMean);
    }
  }
  console.debug('mds B',B);
  const svd=SVDJS.SVD(B); console.debug('mds svd',svd);
  const eigenVals=svd.q.map(s=>s*s); const totalEig=eigenVals.reduce((a,b)=>a+b,0);
  const pc1Pct=eigenVals[0]/totalEig*100; const pc2Pct=eigenVals[1]/totalEig*100;
  pcaXLabelText=`Dim1 (${pc1Pct.toFixed(1)}%)`; pcaYLabelText=`Dim2 (${pc2Pct.toFixed(1)}%)`;
  const points=Array.from({length:nSamples},(_,i)=>({x:svd.u[i][0]*svd.q[0],y:svd.u[i][1]*svd.q[1],label:labels[i]}));
  const labelSet=new Set(labels.filter(l=>l)); updatePcaLabelColorPickers(Array.from(labelSet));
  document.getElementById('pcaStatsResults').innerHTML=`Dim1: ${pc1Pct.toFixed(1)}% variance<br>Dim2: ${pc2Pct.toFixed(1)}% variance`;
  let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity; points.forEach(p=>{ if(p.x<xMinRaw) xMinRaw=p.x; if(p.x>xMaxRaw) xMaxRaw=p.x; if(p.y<yMinRaw) yMinRaw=p.y; if(p.y>yMaxRaw) yMaxRaw=p.y; });
  const legendLabels=Array.from(labelSet); const legendWidth=legendLabels.length?120:0;
  if(token!==pcaDrawToken){console.log('mds draw cancelled',{token});return;}
  const plotEl=document.getElementById('pcaPlot'); plotEl.style.display='block'; while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
  if(!points.length) return;
  let xMin=xMinRaw,xMax=xMaxRaw,yMin=yMinRaw,yMax=yMaxRaw;
  if(isFinite(xMinManual)) xMin=xMinManual; if(isFinite(xMaxManual)) xMax=xMaxManual; if(isFinite(yMinManual)) yMin=yMinManual; if(isFinite(yMaxManual)) yMax=yMaxManual; if(xMin===xMax) xMax=xMin+1; if(yMin===yMax) yMax=yMin+1;
  console.log('mds final raw range',{xMin,xMax,yMin,yMax});
  const W=Math.max(50,Math.floor(plotEl.clientWidth||50)); const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
  plotEl.style.position='relative'; const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','pcaSvg'); svg.setAttribute('width',String(W)); svg.setAttribute('height',String(H)); svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('font-family','sans-serif'); plotEl.appendChild(svg);
  function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);}
  function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(maxTicks-1),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};}
  const xScale=niceScale(xMin,xMax,6); const yScale=niceScale(yMin,yMax,6); if(isFinite(xMinManual)) xScale.min=xMin; if(isFinite(xMaxManual)) xScale.max=xMax; if(isFinite(yMinManual)) yScale.min=yMin; if(isFinite(yMaxManual)) yScale.max=yMax;
  const margin={left:60,right:20+legendWidth,top:20,bottom:50}; const innerW=W-margin.left-margin.right; const innerH=H-margin.top-margin.bottom;
  const add=(tag,attrs,text)=>{const el=document.createElementNS(NS,tag); for(const k in attrs) el.setAttribute(k,String(attrs[k])); if(text) el.textContent=text; svg.appendChild(el); return el;};
  add('rect',{x:0,y:0,width:W,height:H,fill:'#fff'});
  if(showGrid){ xScale.ticks.forEach(t=>{const x=margin.left+(t-xScale.min)*innerW/(xScale.max-xScale.min); add('line',{x1:x,y1:margin.top,x2:x,y2:H-margin.bottom,stroke:'#eee'});}); yScale.ticks.forEach(t=>{const y=H-margin.bottom-(t-yScale.min)*innerH/(yScale.max-yScale.min); add('line',{x1:margin.left,y1:y,x2:W-margin.right,y2:y,stroke:'#eee'});}); }
  add('line',{x1:margin.left,y1:margin.top,x2:margin.left,y2:H-margin.bottom,stroke:'#000'}); add('line',{x1:margin.left,y1:H-margin.bottom,x2:W-margin.right,y2:H-margin.bottom,stroke:'#000'});
  xScale.ticks.forEach(t=>{const x=margin.left+(t-xScale.min)*innerW/(xScale.max-xScale.min); add('line',{x1:x,y1:H-margin.bottom,x2:x,y2:H-margin.bottom+6,stroke:'#000'}); add('text',{x:x,y:H-margin.bottom+fs,'font-size':fs,'text-anchor':'middle'},String(t));});
  yScale.ticks.forEach(t=>{const y=H-margin.bottom-(t-yScale.min)*innerH/(yScale.max-yScale.min); add('line',{x1:margin.left-6,y1:y,x2:margin.left,y2:y,stroke:'#000'}); add('text',{x:margin.left-8,y:y+fs/3,'font-size':fs,'text-anchor':'end'},String(t));});
  add('text',{x:margin.left+innerW/2,y:H-10,'font-size':fs,'text-anchor':'middle'},pcaXLabelText); add('text',{x:20,y:margin.top+innerH/2,'font-size':fs,'text-anchor':'middle',transform:`rotate(-90 20 ${margin.top+innerH/2})`},pcaYLabelText);
  points.forEach(pt=>{ const cx=margin.left+(pt.x-xScale.min)*innerW/(xScale.max-xScale.min); const cy=H-margin.bottom-(pt.y-yScale.min)*innerH/(yScale.max-yScale.min); const col=pt.label?(pcaLabelColors[pt.label]||DEFAULT_SCATTER_COLORS[0]):pcaFill.value; add('circle',{cx,cy,r:dotSize,fill:col,stroke:alpha>0?borderColor:'none','stroke-width':bw,opacity:1-alpha});});
  legendLabels.forEach((lab,i)=>{const y=margin.top+i*(fs+6); const color=pcaLabelColors[lab]||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]; add('rect',{x:W-legendWidth+10,y:y,width:12,height:12,fill:color}); add('text',{x:W-legendWidth+28,y:y+fs-3,'font-size':fs},lab);});
}
  const lineTableObserver=new ResizeObserver(()=>{syncLineWidths();});
  lineTableObserver.observe(lineTablePanel);
  if(window.Shared && window.Shared.ensureHotWrapperStyles){ window.Shared.ensureHotWrapperStyles(lineHotWrapper); }
  console.debug('lineHotWrapper style updated', lineHotWrapper.style.cssText);
  const lineData=Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,LINE_DEFAULT_COLS);
  lineData[0]=['X','Series1','Series2','Series3','Series4','Series5'];
  const lineHot=new Handsontable(lineHotContainer,{
    data:lineData,
    rowHeaders(index){
      const label = index === 0 ? '' : index;
      console.debug('line rowHeader', {index, label});
      return label;
    },
    colHeaders:true,
    minRows:DEFAULT_ROWS,
    minCols:LINE_DEFAULT_COLS,
    stretchH:'all',
    contextMenu:true,
    cells(row,col){
      const props={};
      if(row===0){
        props.renderer=function(instance,td,r,c,prop,value){
          Handsontable.renderers.TextRenderer.apply(this,arguments);
          td.style.background='#e9ecef';
          td.style.fontWeight='600';
          td.title='Header (first row)';
        };
      }
      return props;
    },
    licenseKey:'non-commercial-and-evaluation',
    afterChange:(changes,source)=>{if(changes){if(window.DEBUG_LINE) console.log('line afterChange',{count:changes.length,source}); scheduleDrawLine();}},
    afterCreateRow:()=>{if(window.DEBUG_LINE) console.log('line row created'); scheduleDrawLine();},
    afterCreateCol:()=>{if(window.DEBUG_LINE) console.log('line col created'); scheduleDrawLine();},
    afterRemoveRow:()=>{if(window.DEBUG_LINE) console.log('line row removed'); scheduleDrawLine();},
    afterRemoveCol:()=>{if(window.DEBUG_LINE) console.log('line col removed'); scheduleDrawLine();},
    afterUndo:()=>{if(window.DEBUG_LINE) console.log('line undo'); scheduleDrawLine();},
    afterRedo:()=>{if(window.DEBUG_LINE) console.log('line redo'); scheduleDrawLine();},
  });
  if(window.DEBUG_LINE) console.log('lineHot initialized',{rows:DEFAULT_ROWS,cols:LINE_DEFAULT_COLS});
  __lineReady=true;
  window.DEBUG_LINE=true;
  const lineExample=[
    ['Month','North','South','East','West','Central'],
    [1,120,110,95,80,105],
    [2,130,115,92,85,112],
    [3,125,118,99,90,115],
    [4,150,112,105,95,120],
    [5,155,125,108,102,128],
    [6,160,130,112,108,132],
    [7,165,128,118,112,138],
    [8,170,135,120,118,142],
    [9,175,138,125,120,146],
    [10,180,142,130,125,150],
    [11,185,145,128,130,152],
    [12,190,150,135,132,158]
  ];
  if(window.DEBUG_LINE) console.log('line example dataset', lineExample);
  document.getElementById('lineLoadExample').addEventListener('click',()=>{lineHot.loadData(lineExample); if(window.DEBUG_LINE) console.log('line example loaded'); scheduleDrawLine();});
  document.getElementById('lineImport').addEventListener('click',()=>{document.getElementById('lineFile').click();});
  document.getElementById('lineFile').addEventListener('change',e=>{
    const file=e.target.files[0];
    if(!file) return;
    const ext=file.name.split('.').pop().toLowerCase();
    const reader=new FileReader();
    if(['csv','tsv','txt'].includes(ext)){
      reader.onload=ev=>{
        const text=ev.target.result;
        const delim=ext==='csv'?',' : '\t';
        let rows=text.split(/\r?\n/).map(r=>r.split(delim));
        lineProcessImportedRows(rows);
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
          const data=new Uint8Array(ev.target.result);
          const workbook=XLSX.read(data,{type:'array'});
          const sheet=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1});
          lineProcessImportedRows(sheet);
        }catch(err){console.error('line import error',err);}
      };
      reader.readAsArrayBuffer(file);
    }
  });
  lineHotContainer.addEventListener('paste',async e=>{
    e.preventDefault();
    e.stopPropagation();
    let text=e.clipboardData?.getData('text/plain');
    if(!text){
      try{ text=await navigator.clipboard.readText(); }
      catch(err){ if(window.DEBUG_LINE) console.log('line clipboard read failed',err); return; }
    }
    const rowArr=text.split(/\r?\n/);
    if(rowArr.length<2 && !text.includes('\t') && !text.includes(',')) return;
    const delim=text.includes('\t')?'\t':',';
    const rows=rowArr.map(r=>r.split(delim));
    lineProcessImportedRows(rows);
  });

  const linePlotDiv=document.getElementById('linePlot');
  const lineContainer=linePlotDiv.closest('.svgbox')||linePlotDiv.parentElement;
  // __lineReady is declared near the top; do not redeclare here.
  (function initLineResizers(){
    if(!lineContainer) return;
    if(window.Shared && window.Shared.attachResizableBox){
      window.Shared.attachResizableBox(lineContainer, { onResize: () => { if(__lineReady) scheduleDrawLine(); } });
    }
  })();

  (function initLinePanelResizer(){
    if(!linePanelResizer||!lineTablePanel||!lineGraphPanel) return;
    linePanelResizer.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const startX=e.clientX;
      const startTable=lineTablePanel.getBoundingClientRect().width;
      const startGraph=lineGraphPanel.getBoundingClientRect().width;
      const configWidth=lineConfigPanel.getBoundingClientRect().width;
      const gap=parseFloat(getComputedStyle(lineGraphPanel.querySelector('.diagram-area')).gap||0);
      lineMinSvgWidth=lineSvgBox.getBoundingClientRect().width*0.5;
      const minGraph=configWidth+gap+lineMinSvgWidth;
      const total=startTable+startGraph;
      if(window.DEBUG_LINE) console.debug('line resizer start',{startTable,startGraph,configWidth,gap,lineMinSvgWidth,minGraph,total});
      function onMove(ev){
        const dx=ev.clientX-startX;
        let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx));
        let newGraph=total-newTable;
        lineTablePanel.style.flex=`0 0 ${newTable}px`;
        lineGraphPanel.style.flex=`0 0 ${newGraph}px`;
        syncLineWidths();
        if(window.DEBUG_LINE) console.debug('line resizer move',{dx,newTable,newGraph});
      }
      function onUp(){
        document.removeEventListener('pointermove',onMove);
        document.removeEventListener('pointerup',onUp);
        if(window.DEBUG_LINE) console.debug('line resizer end');
      }
      document.addEventListener('pointermove',onMove);
      document.addEventListener('pointerup',onUp);
    });
  })();

  function lineProcessImportedRows(rows,startRow=0,startCol=0){
    if(!rows||!rows.length) return;
    rows=rows.filter(r=>r&&r.some(c=>String(c).trim()!==''));
    if(!rows.length) return;
    const colCount=Math.max(2,...rows.map(r=>r.length));
    const rowCount=rows.length;
    const curRows=lineHot.countRows();
    const curCols=lineHot.countCols();
    const targetRows=Math.max(DEFAULT_ROWS,curRows,startRow+rowCount);
    const targetCols=Math.max(curCols,startCol+colCount,LINE_DEFAULT_COLS);
    if(window.DEBUG_LINE) console.log('lineProcessImportedRows targets',{targetRows,targetCols});
    const data=Array.from({length:targetRows},(_,r)=>Array(targetCols).fill(''));
    const existing=lineHot.getData();
    for(let r=0;r<curRows;r++){
      for(let c=0;c<curCols;c++) data[r][c]=existing[r][c];
    }
    for(let r=0;r<rowCount;r++){
      const row=rows[r];
      for(let c=0;c<row.length;c++) data[startRow+r][startCol+c]=row[c];
    }
    lineHot.updateSettings({data,minRows:targetRows,minCols:targetCols});
    if(window.DEBUG_LINE) console.log('line data imported',{rows:data.length,cols:targetCols});
    scheduleDrawLine();
  }

  const lineFill=$('#lineFill'), lineBorder=$('#lineBorder'), lineBorderWidth=$('#lineBorderWidth'), lineDotSize=$('#lineDotSize'), lineAlpha=$('#lineAlpha');
  const lineAlphaVal=$('#lineAlphaVal');
  const lineFontSize=$('#lineFontSize'), lineFontSizeVal=$('#lineFontSizeVal');
  const lineShowGrid=$('#lineShowGrid'), lineLogX=$('#lineLogX'), lineLogY=$('#lineLogY');
  const lineXMin=$('#lineXMin'), lineXMax=$('#lineXMax'), lineYMin=$('#lineYMin'), lineYMax=$('#lineYMax');
  const lineOriginMode=$('#lineOriginMode'), lineOriginX=$('#lineOriginX'), lineOriginY=$('#lineOriginY');
  const lineLabelColorsDiv=$('#lineLabelColors');
  const lineLabelColorsFieldset=$('#lineLabelColorsFieldset');
  let lineLabelColors={};
  let lineLegendItems=[];
  let lineLegendWidth=0;
  lineAlphaVal.textContent=lineAlpha.value;
  lineFill.addEventListener('input',()=>{if(window.DEBUG_LINE) console.log('lineFill changed',lineFill.value); scheduleDrawLine();});
  lineBorder.addEventListener('input',()=>{if(window.DEBUG_LINE) console.log('lineBorder changed',lineBorder.value); scheduleDrawLine();});
  lineBorderWidth.addEventListener('input',()=>{if(window.DEBUG_LINE) console.log('lineBorderWidth changed',lineBorderWidth.value); scheduleDrawLine();});
  lineDotSize.addEventListener('input',()=>{if(window.DEBUG_LINE) console.log('lineDotSize changed',lineDotSize.value); scheduleDrawLine();});
  lineAlpha.addEventListener('input',()=>{lineAlphaVal.textContent=lineAlpha.value; if(window.DEBUG_LINE) console.log('lineAlpha changed',lineAlpha.value); scheduleDrawLine();});
  lineFontSize.addEventListener('input',()=>{lineFontSizeVal.textContent=lineFontSize.value; scheduleDrawLine();});
  lineShowGrid.addEventListener('change',()=>{if(window.DEBUG_LINE) console.log('lineShowGrid changed',lineShowGrid.checked); scheduleDrawLine();});
  lineLogX.addEventListener('change',()=>{if(window.DEBUG_LINE) console.log('lineLogX changed',lineLogX.checked); scheduleDrawLine();});
  lineLogY.addEventListener('change',()=>{if(window.DEBUG_LINE) console.log('lineLogY changed',lineLogY.checked); scheduleDrawLine();});
  [lineXMin,lineXMax,lineYMin,lineYMax,lineOriginMode,lineOriginX,lineOriginY].forEach(el=>el.addEventListener('input',()=>{scheduleDrawLine();}));
  lineStatType.addEventListener('change',()=>{console.log('lineStatType changed',lineStatType.value); scheduleDrawLine();});
  function updateLineLabelColorPickers(labels){
    lineLabelColorsDiv.innerHTML='';
    Object.keys(lineLabelColors).forEach(k=>{if(!labels.includes(k)) delete lineLabelColors[k];});
    labels.forEach((lab,i)=>{
      if(!lineLabelColors[lab]) lineLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
      const input=document.createElement('input');
      input.type='color';
      input.value=lineLabelColors[lab];
      attachColorPickerNear(input);
      input.addEventListener('input',e=>{lineLabelColors[lab]=e.target.value; scheduleDrawLine();});
      const lbl=document.createElement('label');
      lbl.textContent=lab+' ';
      lbl.appendChild(input);
      lineLabelColorsDiv.appendChild(lbl);
    });
  lineLabelColorsFieldset.style.display=labels.length?'':'none';
  if(window.DEBUG_LINE) console.log('updateLineLabelColorPickers',{labels,colors:lineLabelColors});
  }
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
  (function initScatterResizers(){
    const scatterPlotDiv = document.getElementById('scatterPlot');
    const scatterContainer = scatterPlotDiv?.closest('.svgbox') || scatterPlotDiv?.parentElement;
    if(!scatterContainer) return;
    if(window.Shared && window.Shared.attachResizableBox){
      window.Shared.attachResizableBox(scatterContainer, { onResize: () => scheduleDrawScatter() });
    }
  })();

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
  lineTitleText = lineTitleText || 'Line graph';
  lineXLabelText = lineXLabelText || 'X';
  lineYLabelText = lineYLabelText || 'Y';
  async function drawLine(){
    const token=++lineDrawToken; if(window.DEBUG_LINE) console.log('drawLine called',{token});
    const fill=lineFill.value; const alpha=Number(lineAlpha.value)||0; const borderWidth=Number(lineBorderWidth.value); const borderColor=lineBorder.value; const bw=borderWidth; const fs=Number(lineFontSize.value); const showGrid=lineShowGrid.checked; const logX=lineLogX.checked; const logY=lineLogY.checked; const dotSize=Number(lineDotSize.value)||0; const xMinManual=parseFloat(lineXMin.value); const xMaxManual=parseFloat(lineXMax.value); const yMinManual=parseFloat(lineYMin.value); const yMaxManual=parseFloat(lineYMax.value); const originMode=lineOriginMode.value; const originXInput=parseFloat(lineOriginX.value); const originYInput=parseFloat(lineOriginY.value);
    const data=lineHot.getData(); if(!data||!data.length) return; const header=data[0]||[]; let xIndex=header.findIndex(h=>String(h).trim().toLowerCase()==='x'); if(xIndex<0) xIndex=0; lineXLabelText=(header[xIndex]&&String(header[xIndex]).trim())||'X'; if(window.DEBUG_LINE) console.log('line xLabel',lineXLabelText); const seriesCols=header.map((_,i)=>i).filter(i=>i!==xIndex && header[i]!=null && String(header[i]).trim()!==''); if(window.DEBUG_LINE) console.log('line seriesCols',seriesCols);
    const series=seriesCols.map((ci,i)=>({name:header[ci]||`Series ${i+1}`, points:[]}));
    let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity;
    for(let r=1;r<data.length;r++){
      const row=data[r];
      const xv=parseFloat(row[xIndex]);
      seriesCols.forEach((ci,si)=>{
        const yv=parseFloat(row[ci]);
        if(!isNaN(xv)&&!isNaN(yv)){
          series[si].points.push({x:xv,y:yv});
          if(xv<xMinRaw)xMinRaw=xv; if(xv>xMaxRaw)xMaxRaw=xv;
          if(yv<yMinRaw)yMinRaw=yv; if(yv>yMaxRaw)yMaxRaw=yv;
        }else{
          series[si].points.push(null);
        }
      });
    }
    const labelsUsed=series.map(s=>s.name); updateLineLabelColorPickers(labelsUsed);
    const legendLabels=labelsUsed;
    const legendWidth=legendLabels.length?120:0;
    lineLegendWidth=legendWidth;
    lineLegendItems=[];
    console.log('line legend width',legendWidth,{labels:legendLabels});
    if(series.every(s=>s.points.every(p=>p==null))) return;
    if(logX && xMinRaw<=0){document.getElementById('linePlot').innerHTML='<i>Log scale requires positive X values.</i>'; return;}
    if(logY && yMinRaw<=0){document.getElementById('linePlot').innerHTML='<i>Log scale requires positive Y values.</i>'; return;}
    let xMin=xMinRaw,xMax=xMaxRaw,yMin=yMinRaw,yMax=yMaxRaw;
    if(isFinite(xMinManual)) xMin=xMinManual;
    if(isFinite(xMaxManual)) xMax=xMaxManual;
    if(isFinite(yMinManual)) yMin=yMinManual;
    if(isFinite(yMaxManual)) yMax=yMaxManual;
    if(originMode==='custom'){
      if(isFinite(originXInput)){
        if(!(logX && originXInput<=0)){
          if(originXInput<xMin) xMin=originXInput;
          if(originXInput>xMax) xMax=originXInput;
        }
      }
      if(isFinite(originYInput)){
        if(!(logY && originYInput<=0)){
          if(originYInput<yMin) yMin=originYInput;
          if(originYInput>yMax) yMax=originYInput;
        }
      }
    }
    if(xMin===xMax) xMax=xMin+1;
    if(yMin===yMax) yMax=yMin+1;
    const plotEl=document.getElementById('linePlot');
    plotEl.style.display='block';
    while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
    const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
    plotEl.style.position='relative';
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('id','lineSvg');
    svg.setAttribute('width',String(W));
    svg.setAttribute('height',String(H));
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    svg.setAttribute('font-family','sans-serif');
    plotEl.appendChild(svg);
    const xMinT=logX?Math.log10(xMin):xMin;
    const xMaxT=logX?Math.log10(xMax):xMax;
    const yMinT=logY?Math.log10(yMin):yMin;
    const yMaxT=logY?Math.log10(yMax):yMax;
    function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);}
    function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(maxTicks-1),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};}
    const xScale=niceScale(xMinT,xMaxT,6);
    const yScale=niceScale(yMinT,yMaxT,6);
    if(isFinite(xMinManual)) xScale.min=xMinT;
    if(isFinite(xMaxManual)) xScale.max=xMaxT;
    if(isFinite(yMinManual)) yScale.min=yMinT;
    if(isFinite(yMaxManual)) yScale.max=yMaxT;
    if(isFinite(xMinManual)||isFinite(xMaxManual)){const ticks=[];for(let v=Math.ceil(xScale.min/xScale.step)*xScale.step;v<=xScale.max+1e-9;v+=xScale.step)ticks.push(v);xScale.ticks=ticks;}
    if(isFinite(yMinManual)||isFinite(yMaxManual)){const ticks=[];for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step;v<=yScale.max+1e-9;v+=yScale.step)ticks.push(v);yScale.ticks=ticks;}
    function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
    const measureCanvas=drawLine._canvas||(drawLine._canvas=document.createElement('canvas'));
    const measureCtx=measureCanvas.getContext('2d');
    function measureTextWidth(text,font){measureCtx.font=font;return measureCtx.measureText(text).width;}
    const tickFont=`${fs}px sans-serif`;
    const xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
    const yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
    const yLabelWidths=yTickLabels.map(lbl=>measureTextWidth(lbl,tickFont));
    const maxYLabelWidth=Math.max(...yLabelWidths,0);
    const margin={top:Math.max(32,Math.round(fs*2.2)),right:20+legendWidth,bottom:Math.max(32,Math.round(fs*2.2))+fs+6,left:Math.max(48,Math.round(fs*3.0),maxYLabelWidth+fs*2)};
    console.log('line margin computed',margin);
    const plotW=Math.max(20,W-margin.left-margin.right);
    const plotH=Math.max(20,H-margin.top-margin.bottom);
    const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
    const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
    function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
    const tickLen=6;
    if(showGrid){xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':1});});yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':1});});}
    let originXT,originYT;
    if(originMode==='custom'){originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);}else{originXT=xScale.min;originYT=yScale.min;}
    const clampedXT=Math.min(Math.max(originXT,xScale.min),xScale.max);
    const clampedYT=Math.min(Math.max(originYT,yScale.min),yScale.max);
    const xAxisY=y2px(clampedYT);
    const yAxisX=x2px(clampedXT);
    add('line',{x1:margin.left - tickLen,y1:xAxisY,x2:margin.left+plotW + tickLen,y2:xAxisY,stroke:'#000','stroke-width':1});
    add('line',{x1:yAxisX,y1:margin.top - tickLen,x2:yAxisX,y2:margin.top+plotH + tickLen,stroke:'#000','stroke-width':1});
    xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:'#000','stroke-width':1});const txt=add('text',{x,y:xAxisY+tickLen+fs,'font-size':fs,'text-anchor':'middle',fill:'#000'});txt.textContent=formatTick(logX?Math.pow(10,t):t);});
    yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:'#000','stroke-width':1});const txt=add('text',{x:yAxisX-(tickLen+2),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:'#000'});txt.textContent=formatTick(logY?Math.pow(10,t):t);});
    const colors=series.map((s,i)=>lineLabelColors[s.name]||lineBorder.value||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]);
    const seriesElems=[];
    series.forEach((s,i)=>{
      const color=colors[i];
      let pathStr='';
      let started=false;
      const markerFrag=document.createDocumentFragment();
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      s.points.forEach(pt=>{
        if(pt){
          const xv=logX?Math.log10(pt.x):pt.x;
          const yv=logY?Math.log10(pt.y):pt.y;
          const px=x2px(xv);
          const py=y2px(yv);
          if(px<minX) minX=px; if(px>maxX) maxX=px;
          if(py<minY) minY=py; if(py>maxY) maxY=py;
          if(!started){pathStr+=`M${px} ${py}`; started=true;} else {pathStr+=`L${px} ${py}`;}
          if(dotSize>0){const c=document.createElementNS(NS,'circle'); c.setAttribute('cx',px); c.setAttribute('cy',py); c.setAttribute('r',dotSize); c.setAttribute('fill',lineLabelColors[s.name]||fill); c.setAttribute('fill-opacity',1-alpha); markerFrag.appendChild(c);}
        }else{
          started=false;
        }
      });
      s.bbox={minX:minX-dotSize,maxX:maxX+dotSize,minY:minY-dotSize,maxY:maxY+dotSize};
      const path=add('path',{d:pathStr,fill:'none',stroke:color,'stroke-width':bw,'stroke-opacity':1-alpha});
      const mGroup=add('g',{}); mGroup.appendChild(markerFrag);
      seriesElems.push({path,mGroup});
    });
    if(legendLabels.length){
      const legendGroup=document.createElementNS(NS,'g');
      const legendX=W-legendWidth+8;
      const legendY=margin.top;
      series.forEach((s,i)=>{
        const itemG=document.createElementNS(NS,'g');
        itemG.style.cursor='pointer';
        const y=legendY+i*(fs+4);
        const sw=document.createElementNS(NS,'rect');
        sw.setAttribute('x',legendX);
        sw.setAttribute('y',y-fs+4);
        sw.setAttribute('width',12);
        sw.setAttribute('height',12);
        sw.setAttribute('fill',colors[i]);
        itemG.appendChild(sw);
        const t=document.createElementNS(NS,'text');
        t.setAttribute('x',legendX+16);
        t.setAttribute('y',y);
        t.setAttribute('font-size',fs);
        t.textContent=s.name;
        itemG.appendChild(t);
        itemG.addEventListener('click',()=>{
          const vis=seriesElems[i].path.style.display!=='none';
          seriesElems[i].path.style.display=vis?'none':'inline';
          seriesElems[i].mGroup.style.display=vis?'none':'inline';
        });
        legendGroup.appendChild(itemG);
      });
      svg.appendChild(legendGroup);
      lineLegendItems=series.map((s,i)=>({label:s.name,color:colors[i]}));
      if(window.DEBUG_LINE) console.log('legend placed inside',{labels:legendLabels,legendWidth,legendX,legendY});
    }
    const xText=add('text',{x:margin.left+plotW/2,y:H-6,'text-anchor':'middle','font-size':fs+4});
    xText.textContent=lineXLabelText; makeEditable(xText,txt=>{lineXLabelText=txt;});
    const yX=margin.left-(maxYLabelWidth+fs*0.5);
    console.log('line y-axis position',yX);
    const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs+4});
    yText.textContent=lineYLabelText; makeEditable(yText,txt=>{lineYLabelText=txt;});
  const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs+4});
  titleText.textContent=lineTitleText; makeEditable(titleText,txt=>{lineTitleText=txt;});
  updateLineStats(series);
  autoResizeSvg(svg);
  if(window.DEBUG_LINE) console.log('line render complete');
  }
  function buildLineExportSvg(){
    const svgEl=document.getElementById('lineSvg');
    if(!svgEl) return null;
    const fs=Number(lineFontSize.value)||16;
    const baseW=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800;
    const baseH=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
    const out=svgEl.cloneNode(true);
    out.setAttribute('width',String(baseW));
    out.setAttribute('height',String(baseH));
    out.setAttribute('viewBox',`0 0 ${baseW} ${baseH}`);
    out.setAttribute('font-family','sans-serif');
    console.log('buildLineExportSvg',{legendCount:lineLegendItems.length,baseW});
    return out;
  }
  document.getElementById('linePNG').addEventListener('click',async()=>{
    const svgEl=buildLineExportSvg();
    if(!svgEl) return;
    if(window.DEBUG_LINE) console.log('linePNG export start with legend');
    const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800;
    const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
    const xml=serializeCleanSVG(svgEl);
    const img=new Image();
    const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
    img.src=url;
    await img.decode().catch(err=>{console.error('linePNG svg decode',err);});
    const outCanvas=document.createElement('canvas');
    outCanvas.width=W; outCanvas.height=H;
    const ctx=outCanvas.getContext('2d');
    ctx.drawImage(img,0,0);
    outCanvas.toBlob(b=>{
      const pngUrl=URL.createObjectURL(b);
      const a=document.createElement('a');
      a.href=pngUrl; a.download='line.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(pngUrl),4000);
    },'image/png');
  });
  document.getElementById('lineSVG').addEventListener('click',()=>{
    const svgEl=buildLineExportSvg();
    if(!svgEl) return;
    if(window.DEBUG_LINE) console.log('lineSVG export start with legend');
    const xml=serializeCleanSVG(svgEl);
    const blob=new Blob([xml],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='line.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  });
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
  function getLineGraphPayload(){return{type:'line',data:lineHot.getData(),config:{title:lineTitleText,xLabel:lineXLabelText,yLabel:lineYLabelText,dotSize:lineDotSize.value,fill:lineFill.value,border:lineBorder.value,borderWidth:lineBorderWidth.value,alpha:lineAlpha.value,labelColors:lineLabelColors,showGrid:lineShowGrid.checked,logX:lineLogX.checked,logY:lineLogY.checked,xMin:lineXMin.value,xMax:lineXMax.value,yMin:lineYMin.value,yMax:lineYMax.value,originMode:lineOriginMode.value,originX:lineOriginX.value,originY:lineOriginY.value}};}
  let lineFileHandle=null,lineFileName='line.graph';
  async function saveLineFile(){const payload=getLineGraphPayload(); if(window.DEBUG_LINE) console.log('saveLineFile',{payload,lineFileHandle}); if(lineFileHandle&&lineFileHandle.createWritable){try{const perm=await verifyPermission(lineFileHandle,true); if(perm){const w=await lineFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close();}}catch(err){console.error('saveLineFile error',err);}}else if(window.showSaveFilePicker){await saveAsLineFile();}else{downloadJSON(payload,lineFileName);}}
  async function saveAsLineFile(){const payload=getLineGraphPayload(); if(window.DEBUG_LINE) console.log('saveAsLineFile',payload); if(window.showSaveFilePicker){try{lineFileHandle=await window.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:lineFileName}); const w=await lineFileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close();}catch(err){console.error('saveAsLineFile error',err);}}else{downloadJSON(payload,lineFileName);}}
  async function openLineFile(){if(window.DEBUG_LINE) console.log('openLineFile start'); if(window.showOpenFilePicker){try{[lineFileHandle]=await window.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]}); const file=await lineFileHandle.getFile(); lineFileName=file.name; loadLineGraphFile(file);}catch(err){console.error('openLineFile error',err);}}else{const input=document.getElementById('lineGraphFile'); input.value=''; input.click();}}
  function loadLineGraphFile(file){const reader=new FileReader(); reader.onload=e=>{try{const obj=JSON.parse(e.target.result); if(window.DEBUG_LINE) console.log('loadLineGraph',obj); if(obj.type!=='line') throw new Error('Invalid graph type'); lineHot.loadData(obj.data||[]); const c=obj.config||{}; lineTitleText=c.title||lineTitleText; lineXLabelText=c.xLabel||lineXLabelText; lineYLabelText=c.yLabel||lineYLabelText; lineDotSize.value=c.dotSize||lineDotSize.value; lineFill.value=c.fill||lineFill.value; lineBorder.value=c.border||lineBorder.value; lineBorderWidth.value=c.borderWidth||lineBorderWidth.value; lineAlpha.value=c.alpha||0; lineAlphaVal.textContent=lineAlpha.value; lineLabelColors=c.labelColors||{}; lineShowGrid.checked=!!c.showGrid; lineLogX.checked=!!c.logX; lineLogY.checked=!!c.logY; lineXMin.value=c.xMin||''; lineXMax.value=c.xMax||''; lineYMin.value=c.yMin||''; lineYMax.value=c.yMax||''; lineOriginMode.value=c.originMode||lineOriginMode.value; lineOriginX.value=c.originX||''; lineOriginY.value=c.originY||''; scheduleDrawLine();}catch(err){console.error('loadLineGraph error',err);}}; reader.readAsText(file);}
  document.getElementById('openLine').addEventListener('click',openLineFile);
  document.getElementById('saveLine').addEventListener('click',saveLineFile);
  document.getElementById('saveAsLine').addEventListener('click',saveAsLineFile);
  document.getElementById('lineGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){lineFileName=f.name; lineFileHandle=null; loadLineGraphFile(f);}});

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
    try{ scheduleDrawLine(); }catch(e){ console.error('showLine schedule error', e); }
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
  function serializeCleanSVG(svgEl){
    const clone = svgEl.cloneNode(true);
    clone.querySelectorAll('[contenteditable],[contentEditable]').forEach(el=>{
      el.removeAttribute('contenteditable');
      el.removeAttribute('contentEditable');
    });
    return new XMLSerializer().serializeToString(clone);
  }
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
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      drawFromLists();
    }
  });
})();
