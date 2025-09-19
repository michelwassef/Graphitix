// Histogram component module
// Exposes: window.Components.hist = { init(root), draw(), save(), open(), loadFromFile(file) }
(function(global){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const HIST_DEFAULT_ROWS=100;
  const HIST_DEFAULT_COLS=1;
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};

  const hist = Components.hist = Components.hist || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  hist.__installed = true; // signal to legacy code to skip
  hist.ready = false; // set true after successful init
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: hist component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: hist component awaiting Shared.tableImport helpers');
  }

  let state = {
    hot: null,
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'histogram.graph',
    titleText: 'Histogram',
    xLabelText: 'Value',
    yLabelText: 'Count'
  };

  function ensureWrapperStyles(){
    const wrapper = document.getElementById('histHotWrapper');
    if(global.Shared && Shared.ensureHotWrapperStyles) Shared.ensureHotWrapperStyles(wrapper);
  }

  function initTableAndResizers(){
    const histTablePanel=document.getElementById('histTablePanel');
    const histGraphPanel=document.getElementById('histGraphPanel');
    const histPanelResizer=document.getElementById('histPanelResizer');
    const histSvgBox=histGraphPanel?.querySelector('.svgbox');
    state.svgBox = histSvgBox;
    console.debug('Debug: hist svgBox reference stored',{hasSvgBox:!!state.svgBox});
    const histConfigPanel=histGraphPanel?.querySelector('.config-options');
    let histMinSvgWidth=0;
    const syncHistPanels = () => {
      Shared.syncPanelWidths(histTablePanel, histGraphPanel, histConfigPanel, state.scheduleDraw, {
        svgBox: histSvgBox,
        minSvgWidth: histMinSvgWidth,
        debugLabel: 'hist',
        panelResizer: histPanelResizer
      });
    };
    const observer=new ResizeObserver(()=>{syncHistPanels();});
    observer.observe(histTablePanel);
    syncHistPanels();

    // svgbox resizer
    const histPlotDiv=document.getElementById('histPlot');
    const histContainer=histPlotDiv.closest('.svgbox')||histPlotDiv.parentElement;
    if(global.Shared && Shared.attachResizableBox && histContainer){
      Shared.attachResizableBox(histContainer, {
        defaultWidth: 640,
        defaultHeight: 420,
        onResize: phase => {
          console.debug('Debug: hist svgbox resized', { phase }); // Debug: hist svgbox resize callback
          syncHistPanels();
        }
      });
    }

    // panel resizer
    if(histPanelResizer && histTablePanel && histGraphPanel){
      histPanelResizer.addEventListener('pointerdown',e=>{
        e.preventDefault();
        const startX=e.clientX;
        const startTable=histTablePanel.getBoundingClientRect().width;
        const startGraph=histGraphPanel.getBoundingClientRect().width;
        const configWidth=histConfigPanel.getBoundingClientRect().width;
        const gap=parseFloat(getComputedStyle(histGraphPanel.querySelector('.diagram-area')).gap||0);
        histMinSvgWidth=(histSvgBox?.getBoundingClientRect().width||0)*0.5;
        const minGraph=configWidth+gap+histMinSvgWidth;
        const total=startTable+startGraph;
        console.debug('Debug: hist resizer start',{startTable,startGraph,configWidth,gap,histMinSvgWidth,minGraph,total});
        function onMove(ev){
          const dx=ev.clientX-startX;
          let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx));
          let newGraph=total-newTable;
          histTablePanel.style.flex=`0 0 ${newTable}px`;
          histGraphPanel.style.flex=`0 0 ${newGraph}px`;
          syncHistPanels();
          console.debug('Debug: hist resizer move',{dx,newTable,newGraph});
        }
        function onUp(){
          document.removeEventListener('pointermove',onMove);
          document.removeEventListener('pointerup',onUp);
          console.debug('Debug: hist resizer end');
        }
        document.addEventListener('pointermove',onMove);
        document.addEventListener('pointerup',onUp);
      });
    }
  }

  function initHot(){
    const hotContainer=document.getElementById('histHot');
    state.hot=new global.Handsontable(hotContainer,{
      data:global.Handsontable.helper.createEmptySpreadsheetData(HIST_DEFAULT_ROWS,HIST_DEFAULT_COLS),
      rowHeaders(index){ return index===0?'':index; },
      colHeaders:true,
      stretchH:'all',
      minSpareRows:10,
      contextMenu:true,
      cells(row,col){ const props={}; if(row===0) props.className='htCenter'; return props; },
      afterChange(changes,source){ if(changes){ console.log('hist afterChange',{count:changes.length,source}); state.scheduleDraw(); }},
      afterUndo:()=>{ console.log('hist undo'); state.scheduleDraw(); },
      afterRedo:()=>{ console.log('hist redo'); state.scheduleDraw(); },
      licenseKey:'non-commercial-and-evaluation'
    });
  }

  function initControls(){
    const histFill=$('#histFill'), histBorder=$('#histBorder'), histBorderWidth=$('#histBorderWidth'), histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize'), histFontSizeVal=$('#histFontSizeVal'), histYMin=$('#histYMin'), histYMax=$('#histYMax');
    chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontSize.value) });
    [histFill,histBorder,histBorderWidth,histBins,histShowGrid,histLogY,histYMin,histYMax].forEach(el=>el.addEventListener('input',()=>state.scheduleDraw()));
    histFontSize.addEventListener('input',()=>{chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontSize.value) }); state.scheduleDraw();});

    // Example + Import
    const example=[['Exam Score'],[55],[60],[65],[70],[75],[80],[85],[90],[95],[100]];
    document.getElementById('histLoadExample').addEventListener('click',()=>{
      state.hot.loadData(example);
      console.log('hist example loaded');
      state.scheduleDraw();
    });
    const histImportBtn=document.getElementById('histImport');
    const histFileInput=document.getElementById('histFile');
    const tableImport = Shared.tableImport;
    histImportBtn.addEventListener('click',()=>{histFileInput.value=''; histFileInput.click();});
    histFileInput.addEventListener('change',()=>{
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('hist import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      tableImport.openFile(histFileInput, {
        hot: state.hot,
        minCols: HIST_DEFAULT_COLS,
        minRows: HIST_DEFAULT_ROWS,
        scheduleDraw: state.scheduleDraw,
        debugLabel: 'hist',
        onProcessed: info => console.log('hist data imported',{rows: info?.rows, cols: info?.cols})
      });
    });

    // Exports
    document.getElementById('histPNG').addEventListener('click', async () => {
      const svgEl = document.getElementById('histSvg'); if(!svgEl) return; console.log('histPNG export start');
      const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800; const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
      const xml=global.serializeCleanSVG?global.serializeCleanSVG(svgEl):new XMLSerializer().serializeToString(svgEl);
      const img=new Image(); const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml); img.src=url; await img.decode().catch(err=>{console.error('histPNG svg decode',err);}); const outCanvas=document.createElement('canvas'); outCanvas.width=W; outCanvas.height=H; const ctx=outCanvas.getContext('2d'); ctx.drawImage(img,0,0); outCanvas.toBlob(b=>{const pngUrl=URL.createObjectURL(b); const a=document.createElement('a'); a.href=pngUrl; a.download='histogram.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(pngUrl),4000);},'image/png');
    });
    document.getElementById('histSVG').addEventListener('click', () => {
      const svgEl=document.getElementById('histSvg'); if(!svgEl) return; console.log('histSVG export start');
      const xml=global.serializeCleanSVG?global.serializeCleanSVG(svgEl):new XMLSerializer().serializeToString(svgEl);
      const blob=new Blob([xml],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='histogram.svg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
    });

    // File Save/Open
    function getPayload(){
      const c={
        title:state.titleText,
        xLabel:state.xLabelText,
        yLabel:state.yLabelText,
        fill:$('#histFill').value,
        border:$('#histBorder').value,
        borderWidth:$('#histBorderWidth').value,
        bins:$('#histBins').value,
        showGrid:$('#histShowGrid').checked,
        logY:$('#histLogY').checked,
        fontSize:$('#histFontSize').value,
        yMin:$('#histYMin').value,
        yMax:$('#histYMax').value
      };
      return {type:'hist', data: state.hot.getData(), config: c};
    }
    hist.save = async function(){
      console.debug('Debug: hist.save invoked', { hasHandle: !!state.fileHandle });
      if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
        console.error('hist.save missing fileIO.saveGraphFile');
        return;
      }
      const result = await fileIO.saveGraphFile({
        context: 'hist',
        fileHandle: state.fileHandle,
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      console.debug('Debug: hist.save result', result);
    };
    hist.saveAs = async function(){
      console.debug('Debug: hist.saveAs invoked', { currentName: state.fileName });
      if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
        console.error('hist.saveAs missing fileIO.saveGraphFileAs');
        return;
      }
      const result = await fileIO.saveGraphFileAs({
        context: 'hist',
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      console.debug('Debug: hist.saveAs result', result);
    };
    hist.open = async function(){
      console.debug('Debug: hist.open invoked');
      if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
        console.error('hist.open missing fileIO.openGraphFile');
        return;
      }
      const result = await fileIO.openGraphFile({
        context: 'hist',
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; },
        loadFromFile: file => hist.loadFromFile(file),
        triggerInput: () => {
          const input = document.getElementById('histGraphFile');
          if(input){
            input.value='';
            input.click();
          }
        }
      });
      console.debug('Debug: hist.open result', result);
    };
    hist.loadFromFile = function(file){
      const reader=new FileReader(); reader.onload=e=>{ try{ const obj=JSON.parse(e.target.result); console.log('loadHistGraph',obj); if(obj.type!=='hist') throw new Error('Invalid graph type'); state.hot.loadData(obj.data||[]); const c=obj.config||{}; state.titleText=c.title||state.titleText; state.xLabelText=c.xLabel||state.xLabelText; state.yLabelText=c.yLabel||state.yLabelText; $('#histFill').value=c.fill||$('#histFill').value; $('#histBorder').value=c.border||$('#histBorder').value; $('#histBorderWidth').value=c.borderWidth||$('#histBorderWidth').value; $('#histBins').value=c.bins||$('#histBins').value; $('#histShowGrid').checked=!!c.showGrid; $('#histLogY').checked=!!c.logY; $('#histFontSize').value=c.fontSize||$('#histFontSize').value; chartStyle.renderFontSizeLabel({ element: $('#histFontSizeVal'), pt: Number($('#histFontSize').value) }); $('#histYMin').value=c.yMin||''; $('#histYMax').value=c.yMax||''; state.scheduleDraw(); }catch(err){console.error('loadHistGraph error',err);} };
      reader.readAsText(file);
    };
    // Wire buttons
    document.getElementById('openHist').addEventListener('click', hist.open);
    document.getElementById('saveHist').addEventListener('click', hist.save);
    document.getElementById('saveAsHist').addEventListener('click', hist.saveAs);
    document.getElementById('histGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; hist.loadFromFile(f); }});
  }

  // Compute and render histogram summary statistics
  function updateHistStats(values){
    try{
      const out=document.getElementById('histStatsResults');
      if(!out){ console.warn('Debug: histStatsResults element not found'); return; }
      console.debug('Debug: updateHistStats start',{n:values?values.length:0});
      if(!values || !values.length){ out.textContent='No data'; return; }
      let mean=NaN, median=NaN, sd=NaN;
      if(global.jStat){
        mean = global.jStat.mean(values);
        median = global.jStat.median(values);
        sd = global.jStat.stdev ? global.jStat.stdev(values, true) : global.jStat.stdev ? global.jStat.stdev(values) : global.jStat.stdev(values, true);
      }else{
        // Fallback simple implementations
        const n=values.length; const mu=values.reduce((s,v)=>s+v,0)/n; mean=mu; const sorted=[...values].sort((a,b)=>a-b); median=(n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2); const variance=values.reduce((s,v)=>s+Math.pow(v-mu,2),0)/(n-1); sd=Math.sqrt(variance);
      }
      out.innerHTML=`<table><tr><th>n</th><td>${values.length}</td></tr><tr><th>Mean</th><td>${mean.toFixed(4)}</td></tr><tr><th>Median</th><td>${median.toFixed(4)}</td></tr><tr><th>SD</th><td>${sd.toFixed(4)}</td></tr></table>`;
      console.debug('Debug: updateHistStats result',{mean,median,sd});
    }catch(err){ console.error('updateHistStats error',err); }
  }

  function draw(){
    // Reuse existing global draw implementation if present? Implement local logic mirroring legacy drawHistogram
    const histFill=$('#histFill'), histBorder=$('#histBorder'), histBorderWidth=$('#histBorderWidth'), histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize'), histYMin=$('#histYMin'), histYMax=$('#histYMax');
    const data=state.hot.getDataAtCol(0);
    const labelRaw=data[0];
    state.xLabelText=(labelRaw&&String(labelRaw).trim())||'Value';
    const values=[]; for(let i=1;i<data.length;i++){const v=parseFloat(data[i]); if(!isNaN(v)) values.push(v);}
    const plotEl=document.getElementById('histPlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    if(!values.length){ plotEl.innerHTML='<i>No data</i>'; updateHistStats(values); return; }
    const xMin=Math.min(...values), xMax=Math.max(...values);
    function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);}
    function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(maxTicks-1),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};}
    const xScale=niceScale(xMin,xMax,6);
    const bins=Math.max(1,Math.floor(Number(histBins.value)||10));
    const binWidth=(xScale.max-xScale.min)/bins || 1;
    const counts=new Array(bins).fill(0);
    values.forEach(v=>{let idx=Math.floor((v-xScale.min)/binWidth); if(idx<0)idx=0; if(idx>=bins)idx=bins-1; counts[idx]++;});
    const yMinManual=parseFloat(histYMin.value), yMaxManual=parseFloat(histYMax.value);
    const logY=histLogY.checked;
    let yMin=0; let yMax=Math.max(...counts);
    if(isFinite(yMinManual)) yMin=yMinManual;
    if(isFinite(yMaxManual)) yMax=yMaxManual;
    if(logY && yMin<=0) yMin=0.1;
    if(yMax===yMin) yMax=yMin+1;
    const W=Math.max(50,Math.floor(plotEl.clientWidth||50)); const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
    plotEl.style.position='relative';
    const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','histSvg'); svg.setAttribute('width',String(W)); svg.setAttribute('height',String(H)); svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('font-family',chartStyle.FONT_FAMILY); chartStyle.applySvgDefaults(svg); plotEl.appendChild(svg);
    const yMinT=logY?Math.log10(yMin):yMin, yMaxT=logY?Math.log10(yMax):yMax;
    const yScale=niceScale(yMinT,yMaxT,6);
    if(isFinite(yMinManual)) yScale.min=yMinT; if(isFinite(yMaxManual)) yScale.max=yMaxT;
    if(isFinite(yMinManual)||isFinite(yMaxManual)){const ticks=[]; for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step; v<=yScale.max+1e-9; v+=yScale.step) ticks.push(v); yScale.ticks=ticks;}
    function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
    const containerRect=state.svgBox?.getBoundingClientRect?.();
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: histFontSize.value,
      width: containerRect?.width,
      height: containerRect?.height
    });
    const fs=fontInfo.scaledPx;
    chartStyle.renderFontSizeLabel({ element: histFontSizeVal, fontInfo });
    console.debug('Debug: hist font scaling applied',{
      input:histFontSize.value,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fs,
      scale:fontInfo.scaleInfo?.scale,
      containerWidth:containerRect?.width,
      containerHeight:containerRect?.height
    });
    const axisMetrics=chartStyle.createAxisMetrics(fs);
    console.debug('Debug: hist axis metrics',axisMetrics);
    const yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
    const xTickLabels=xScale.ticks.map(t=>formatTick(t));
    const tickFont=chartStyle.makeFont(fs);
    const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
    const maxYLabelWidth=Math.max(...yLabelWidths,0);
    const axisLabelFont=chartStyle.makeFont(fs);
    const yTitleWidth=chartStyle.measureText(state.yLabelText,axisLabelFont);
    const showGrid=$('#histShowGrid').checked;
    let margin=chartStyle.computeBaseMargins({fontSize:fs,maxYLabelWidth,yTitleWidth,axisMetrics});
    let plotW=Math.max(20,W-margin.left-margin.right); let plotH=Math.max(20,H-margin.top-margin.bottom);
    const bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
    margin.bottom=bottomLayout.bottom;
    plotW=Math.max(20,W-margin.left-margin.right); plotH=Math.max(20,H-margin.top-margin.bottom);
    console.debug('Debug: hist layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate});
    const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
    const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
    function add(tag,attrs){const el=document.createElementNS(NS,tag); for(const[k,v] of Object.entries(attrs)) el.setAttribute(k,String(v)); svg.appendChild(el); return el;}
    const tickLen=axisMetrics.tickLength;
    const tickGap=axisMetrics.tickLabelGap;
    if(showGrid){ yScale.ticks.forEach(t=>{ const y=y2px(t); add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':1}); }); }
    const xTickPositions=xScale.ticks.map(t=>x2px(t));
    const yTickPositions=yScale.ticks.map(t=>y2px(t));
    let axisXStart=xTickPositions.length?Math.min(...xTickPositions):margin.left;
    let axisXEnd=xTickPositions.length?Math.max(...xTickPositions):margin.left+plotW;
    let axisYStart=yTickPositions.length?Math.min(...yTickPositions):margin.top;
    let axisYEnd=yTickPositions.length?Math.max(...yTickPositions):margin.top+plotH;
    if(axisXStart===axisXEnd){axisXStart=margin.left;axisXEnd=margin.left+plotW;}
    if(axisYStart===axisYEnd){axisYStart=margin.top;axisYEnd=margin.top+plotH;}
    console.debug('Debug: hist axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
    add('line',{x1:axisXStart,y1:margin.top+plotH,x2:axisXEnd,y2:margin.top+plotH,stroke:'#000','stroke-width':1,'stroke-linecap':'square'});
    add('line',{x1:margin.left,y1:axisYStart,x2:margin.left,y2:axisYEnd,stroke:'#000','stroke-width':1,'stroke-linecap':'square'});
    const xTickNodes=[];
    xScale.ticks.forEach(t=>{ const x=x2px(t); add('line',{x1:x,y1:margin.top+plotH,x2:x,y2:margin.top+plotH+tickLen,stroke:'#000','stroke-width':1}); const txt=add('text',{x,y:margin.top+plotH+tickLen+tickGap,'font-size':fs,'text-anchor':'middle','dominant-baseline':'hanging',fill:chartStyle.TEXT_COLOR}); txt.textContent=formatTick(t); xTickNodes.push(txt); });
    chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
    yScale.ticks.forEach(t=>{ const y=y2px(t); add('line',{x1:margin.left-tickLen,y1:y,x2:margin.left,y2:y,stroke:'#000','stroke-width':1}); const txt=add('text',{x:margin.left-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR}); txt.textContent=formatTick(logY?Math.pow(10,t):t); });
    const edges=Array.from({length:bins+1},(_,i)=>xScale.min+i*binWidth);
    const fill=$('#histFill').value; const borderColor=$('#histBorder').value; const borderWidth=Number($('#histBorderWidth').value)||0;
    counts.forEach((c,i)=>{ const xStart=x2px(edges[i]); const xEnd=x2px(edges[i+1]); const barW=Math.max(0,xEnd-xStart); const val=logY?Math.log10(Math.max(c,yMin)):c; const y=y2px(val); const h=margin.top+plotH-y; const rect=add('rect',{x:xStart,y,width:barW,height:h,fill:fill}); if(borderWidth>0){rect.setAttribute('stroke',borderColor); rect.setAttribute('stroke-width',borderWidth);} });
    const xAxisBase=margin.top+plotH;
    const xText=add('text',{x:margin.left+plotW/2,y:xAxisBase+bottomLayout.titleOffset,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR}); xText.textContent=state.xLabelText; if(global.makeEditable) makeEditable(xText,txt=>{state.xLabelText=txt;});
    const yX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
    const yText=add('text',{x:yX,y:margin.top+plotH/2,'dominant-baseline':'middle',transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR}); yText.textContent=state.yLabelText; if(global.makeEditable) makeEditable(yText,txt=>{state.yLabelText=txt;});
    const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR}); titleText.textContent=state.titleText; if(global.makeEditable) makeEditable(titleText,txt=>{state.titleText=txt;});
    if(global.autoResizeSvg) global.autoResizeSvg(svg);
    // Update stats panel
    updateHistStats(values);
    console.debug('Debug: drawHistogram complete');
  }

  // Public API
  hist.draw = draw;
  hist.init = function init(){
    if (hist.ready) { console.debug('Debug: Components.hist.init skipped (already ready)'); return; }
    console.debug('Debug: Components.hist.init');
    // Placeholder to avoid early resizer callbacks failing
    state.scheduleDraw = ()=>{};
    ensureWrapperStyles();
    initTableAndResizers();
    initHot();
    initControls();
    state.scheduleDraw = Shared.debounceFrame(draw);
    console.debug('Debug: hist scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    hist.ready = true;
  };

  hist.ensure = function ensure(){ if (!hist.ready) hist.init(); };

})(window);
