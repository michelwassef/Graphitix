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
  const fontControls = Shared.fontControls = Shared.fontControls || {};
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
    yLabelText: 'Count',
    svgBox: null,
    layout: null,
    minSvgWidth: 0
  };

  const markFontEditable = (node, role, key) => {
    if (!node) { return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if (fontControls && typeof fontControls.markText === 'function') {
      fontControls.markText(node, { scopeId: 'hist', role, key });
    } else if (node.dataset) {
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'hist';
      if (role) node.dataset.fontRole = role;
      if (key || role) node.dataset.fontKey = key || role;
    }
    if (!role || role.indexOf('Tick') === -1) {
      console.debug('Debug: hist markFontEditable', payload); // Debug: font target tagging summary
    }
  };

  function initHot(){
    const hotContainer=document.getElementById('histHot');
    console.debug('Debug: hist initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('hist initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData(HIST_DEFAULT_ROWS, HIST_DEFAULT_COLS);
    let histScheduleProxyCount = 0;
    const scheduleHistDrawProxy = () => {
      histScheduleProxyCount += 1;
      if(histScheduleProxyCount <= 5){
        console.debug('Debug: hist scheduleDraw proxy invoked', { count: histScheduleProxyCount }); // Debug: table change trigger
        if(histScheduleProxyCount === 5){
          console.debug('Debug: hist scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
        }
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };

    state.hot = Shared.hot.createStandardTable(hotContainer, { rows: HIST_DEFAULT_ROWS, cols: HIST_DEFAULT_COLS }, scheduleHistDrawProxy, {
      debugLabel: 'hist',
      data,
      firstRowClassName: 'htCenter',
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        minSpareRows: 10,
        afterChange(changes, source){
          if(changes){
            console.log('hist afterChange', { count: changes.length, source });
          }
        },
        afterUndo(){
          console.log('hist undo');
        },
        afterRedo(){
          console.log('hist redo');
        }
      }
    });
  }

  function initControls(){
    const histFill=$('#histFill'), histBorder=$('#histBorder'), histBorderWidth=$('#histBorderWidth'), histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histShowFrame=$('#histShowFrame'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize'), histFontSizeVal=$('#histFontSizeVal'), histYMin=$('#histYMin'), histYMax=$('#histYMax');
    if(histFontSize?.dataset){
      histFontSize.dataset.fontBasePt = String(histFontSize.value);
      console.debug('Debug: hist font size base initialized',{ value: histFontSize.value }); // Debug: initial base size
    }
    chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontSize.value), input: histFontSize, manual: true });
    [histFill,histBorder,histBorderWidth,histBins,histShowGrid,histLogY,histYMin,histYMax].forEach(el=>el.addEventListener('input',()=>state.scheduleDraw()));
    histShowFrame?.addEventListener('change',()=>{ console.debug('Debug: hist showFrame change',{checked:histShowFrame.checked}); state.scheduleDraw(); });
    histFontSize.addEventListener('input',()=>{
      if(histFontSize.dataset){
        histFontSize.dataset.fontBasePt = String(histFontSize.value);
        console.debug('Debug: hist font size input manual set',{ value: histFontSize.value }); // Debug: manual slider update
      }
      chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontSize.value), input: histFontSize, manual: true });
      state.scheduleDraw();
    });

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

    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#histExportControls',
        svgSelector: '#histSvg',
        fileName: 'histogram',
        contextLabel: 'hist-export'
      });
      console.debug('Debug: hist export controls mounted', { hasExporter: true }); // Debug: hist export mount
    } else {
      console.debug('Debug: hist export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: hist export fallback
    }

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
        showFrame:$('#histShowFrame').checked,
        logY:$('#histLogY').checked,
        fontSize:$('#histFontSize').value,
        yMin:$('#histYMin').value,
        yMax:$('#histYMax').value
      };
      const payload = {type:'hist', data: state.hot.getData(), config: c};
      console.debug('Debug: hist.getPayload captured state', {
        rows: payload.data?.length || 0,
        bins: c.bins,
        hasLogY: c.logY
      });
      return payload;
    }
    hist.getPayload = getPayload;
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
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const obj=JSON.parse(e.target.result);
          console.log('loadHistGraph',obj);
          if(obj.type!=='hist') throw new Error('Invalid graph type');
          state.hot.loadData(obj.data||[]);
          const c=obj.config||{};
          state.titleText=c.title||state.titleText;
          state.xLabelText=c.xLabel||state.xLabelText;
          state.yLabelText=c.yLabel||state.yLabelText;
          $('#histFill').value=c.fill||$('#histFill').value;
          $('#histBorder').value=c.border||$('#histBorder').value;
          $('#histBorderWidth').value=c.borderWidth||$('#histBorderWidth').value;
          $('#histBins').value=c.bins||$('#histBins').value;
          $('#histShowGrid').checked=!!c.showGrid;
          $('#histLogY').checked=!!c.logY;
          const histFontInput=$('#histFontSize');
          histFontInput.value=c.fontSize||histFontInput.value;
          if(histFontInput.dataset){
            histFontInput.dataset.fontBasePt = String(histFontInput.value);
            console.debug('Debug: hist font size base restored',{ value: histFontInput.value }); // Debug: restore base from file
          }
          chartStyle.renderFontSizeLabel({ element: $('#histFontSizeVal'), pt: Number(histFontInput.value), input: histFontInput, manual: true });
          $('#histYMin').value=c.yMin||'';
          $('#histYMax').value=c.yMax||'';
          state.scheduleDraw();
        }catch(err){
          console.error('loadHistGraph error',err);
        }
      };
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
      const hasRenderer=Shared.statsTable && typeof Shared.statsTable.render==='function';
      if(hasRenderer){
        Shared.statsTable.render({
          target:out,
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
          caption:'Distribution summary',
          options:{
            fileName:'histogram-summary',
            contextLabel:'hist-summary'
          }
        });
      }else{
        out.innerHTML=`<table><tr><th>n</th><td>${values.length}</td></tr><tr><th>Mean</th><td>${mean.toFixed(4)}</td></tr><tr><th>Median</th><td>${median.toFixed(4)}</td></tr><tr><th>SD</th><td>${sd.toFixed(4)}</td></tr></table>`;
      }
      console.debug('Debug: updateHistStats result',{mean,median,sd});
    }catch(err){ console.error('updateHistStats error',err); }
  }

  function draw(){
    // Reuse existing global draw implementation if present? Implement local logic mirroring legacy drawHistogram
    const histFill=$('#histFill'), histBorder=$('#histBorder'), histBorderWidth=$('#histBorderWidth'), histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histShowFrame=$('#histShowFrame'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize'), histYMin=$('#histYMin'), histYMax=$('#histYMax');
    const data=state.hot.getDataAtCol(0);
    const labelRaw=data[0];
    state.xLabelText=(labelRaw&&String(labelRaw).trim())||'Value';
    const values=[]; for(let i=1;i<data.length;i++){const v=parseFloat(data[i]); if(!isNaN(v)) values.push(v);}
    const plotEl=document.getElementById('histPlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    if(!values.length){ plotEl.innerHTML='<i>No data</i>'; updateHistStats(values); return; }
    const xMin=Math.min(...values), xMax=Math.max(...values);
    const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
    const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
    function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);}
    function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(Math.max(maxTicks-1,1)),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};}
    const bins=Math.max(1,Math.floor(Number(histBins.value)||10));
    const yMinManual=parseFloat(histYMin.value), yMaxManual=parseFloat(histYMax.value);
    const logY=histLogY.checked;
    plotEl.style.position='relative';
    const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','histSvg'); svg.setAttribute('width',String(W)); svg.setAttribute('height',String(H)); svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('font-family',chartStyle.FONT_FAMILY); chartStyle.applySvgDefaults(svg); plotEl.appendChild(svg);
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg,{ scopeId: 'hist' });
      console.debug('Debug: hist fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
    } else {
      console.debug('Debug: hist fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
    }
    function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
    const containerRect=state.svgBox?.getBoundingClientRect?.();
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: histFontSize.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: state.svgBox,
      input: histFontSize
    });
    const fs=fontInfo.scaledPx;
    const styleScaleInfo=fontInfo.scaleInfo;
    const axisStrokeWidth=chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'hist-axis', min: 0.5 });
    const borderWidthRaw=Number(histBorderWidth.value)||0;
    const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'hist-border', min: 0 });
    console.debug('Debug: hist style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      axisStrokeWidth,
      styleScale: styleScaleInfo?.styleScale
    }); // Debug: histogram style scaling summary
    chartStyle.renderFontSizeLabel({ element: histFontSizeVal, fontInfo, input: histFontSize });
    console.debug('Debug: hist font scaling applied',{
      input:histFontSize.value,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fs,
      scale:styleScaleInfo?.styleScale || styleScaleInfo?.scale,
      containerWidth:containerRect?.width,
      containerHeight:containerRect?.height
    });
    const axisMetrics=chartStyle.createAxisMetrics(fs);
    console.debug('Debug: hist axis metrics',axisMetrics);
    let xTickTarget=chartStyle.estimateTickCount(W,{axis:'x',fallback:6});
    let yTickTarget=chartStyle.estimateTickCount(H,{axis:'y',fallback:6});
    console.debug('Debug: hist initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
    const tickFont=chartStyle.makeFont(fs);
    const axisLabelFont=chartStyle.makeFont(fs);
    const yTitleWidthBase=chartStyle.measureText(state.yLabelText,axisLabelFont);
    const tickLen=axisMetrics.tickLength;
    const tickGap=axisMetrics.tickLabelGap;
    let margin=chartStyle.computeBaseMargins({fontSize:fs,maxYLabelWidth:0,yTitleWidth:yTitleWidthBase,axisMetrics});
    let plotW=Math.max(20,W-margin.left-margin.right);
    let plotH=Math.max(20,H-margin.top-margin.bottom);
    let bottomLayout=chartStyle.computeBottomLayout({labels:[],fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
    margin.bottom=bottomLayout.bottom;
    plotW=Math.max(20,W-margin.left-margin.right);
    plotH=Math.max(20,H-margin.top-margin.bottom);
    let xScale=niceScale(xMin,xMax,xTickTarget);
    let yScale=niceScale(0,1,yTickTarget);
    let xTickLabels=[];
    let yTickLabels=[];
    let counts=[];
    let binWidth=0;
    let yMin=0;
    let yMax=0;
    let yMinT=0;
    let yMaxT=0;
    let maxYLabelWidth = 0;
    for(let pass=0;pass<2;pass++){
      xScale=niceScale(xMin,xMax,xTickTarget);
      binWidth=(xScale.max-xScale.min)/bins || 1;
      counts=new Array(bins).fill(0);
      values.forEach(v=>{let idx=Math.floor((v-xScale.min)/binWidth); if(idx<0)idx=0; if(idx>=bins)idx=bins-1; counts[idx]++;});
      yMin=0;
      yMax=Math.max(...counts);
      if(isFinite(yMinManual)) yMin=yMinManual;
      if(isFinite(yMaxManual)) yMax=yMaxManual;
      if(logY && yMin<=0) yMin=0.1;
      if(yMax===yMin) yMax=yMin+1;
      yMinT=logY?Math.log10(yMin):yMin;
      yMaxT=logY?Math.log10(yMax):yMax;
      yScale=niceScale(yMinT,yMaxT,yTickTarget);
      if(isFinite(yMinManual)) yScale.min=yMinT;
      if(isFinite(yMaxManual)) yScale.max=yMaxT;
      if(isFinite(yMinManual)||isFinite(yMaxManual)){
        const manualTicks=[];
        for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step; v<=yScale.max+1e-9; v+=yScale.step) manualTicks.push(v);
        yScale.ticks=manualTicks;
      }
      xTickLabels=xScale.ticks.map(t=>formatTick(t));
      yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
      const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
      maxYLabelWidth=Math.max(...yLabelWidths,0);
      margin=chartStyle.computeBaseMargins({fontSize:fs,maxYLabelWidth,yTitleWidth:yTitleWidthBase,axisMetrics});
      plotW=Math.max(20,W-margin.left-margin.right);
      plotH=Math.max(20,H-margin.top-margin.bottom);
      bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
      margin.bottom=bottomLayout.bottom;
      plotW=Math.max(20,W-margin.left-margin.right);
      plotH=Math.max(20,H-margin.top-margin.bottom);
      const refinedX=chartStyle.estimateTickCount(plotW,{axis:'x',fallback:xTickTarget});
      const refinedY=chartStyle.estimateTickCount(plotH,{axis:'y',fallback:yTickTarget});
      console.debug('Debug: hist tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxYLabelWidth,bins,binWidth});
      if(refinedX===xTickTarget && refinedY===yTickTarget){
        break;
      }
      xTickTarget=refinedX;
      yTickTarget=refinedY;
    }
    console.debug('Debug: hist layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate,xTickTarget,yTickTarget,binWidth});
    const showGrid=$('#histShowGrid').checked;
    const showFrame=$('#histShowFrame').checked;
    console.debug('Debug: hist showFrame state',{showFrame});
    const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
    const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
    function add(tag,attrs){const el=document.createElementNS(NS,tag); for(const[k,v] of Object.entries(attrs)) el.setAttribute(k,String(v)); svg.appendChild(el); return el;}
      if(showGrid){
        yScale.ticks.forEach(t=>{
          const y=y2px(t);
          add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':axisStrokeWidth});
        });
        console.debug('Debug: hist grid stroke scaled',{horizontal:yScale.ticks.length,axisStrokeWidth});
      }
    const xTickPositions=xScale.ticks.map(t=>x2px(t));
    const yTickPositions=yScale.ticks.map(t=>y2px(t));
    let axisXStart=xTickPositions.length?Math.min(...xTickPositions):margin.left;
    let axisXEnd=xTickPositions.length?Math.max(...xTickPositions):margin.left+plotW;
    let axisYStart=yTickPositions.length?Math.min(...yTickPositions):margin.top;
    let axisYEnd=yTickPositions.length?Math.max(...yTickPositions):margin.top+plotH;
    if(axisXStart===axisXEnd){axisXStart=margin.left;axisXEnd=margin.left+plotW;}
    if(axisYStart===axisYEnd){axisYStart=margin.top;axisYEnd=margin.top+plotH;}
    console.debug('Debug: hist axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
      const axisStroke = '#000';
      add('line',{x1:axisXStart,y1:margin.top+plotH,x2:axisXEnd,y2:margin.top+plotH,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
      add('line',{x1:margin.left,y1:axisYStart,x2:margin.left,y2:axisYEnd,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
      console.debug('Debug: hist axes stroke scaled',{axisStrokeWidth});
    if(showFrame){
      console.debug('Debug: hist frame request',{stroke:axisStroke, showFrame}); // Debug: frame styling inputs
      chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, sides: ['top','right'] });
    }
    // Frame closes histogram plot area using axis styling continuity
    const xTickNodes=[];
      let xTickFontCount=0;
      xScale.ticks.forEach((t,i)=>{
        const x=x2px(t);
        add('line',{x1:x,y1:margin.top+plotH,x2:x,y2:margin.top+plotH+tickLen,stroke:'#000','stroke-width':axisStrokeWidth});
        const txt=add('text',{x,y:margin.top+plotH+tickLen+tickGap,'font-size':fs,'text-anchor':'middle','dominant-baseline':'hanging',fill:chartStyle.TEXT_COLOR});
        txt.textContent=formatTick(t);
        markFontEditable(txt,'xTick');
        xTickFontCount+=1;
        xTickNodes.push(txt);
      });
    chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
      let yTickFontCount=0;
      yScale.ticks.forEach((t,i)=>{
        const y=y2px(t);
        add('line',{x1:margin.left-tickLen,y1:y,x2:margin.left,y2:y,stroke:'#000','stroke-width':axisStrokeWidth});
        const txt=add('text',{x:margin.left-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});
        txt.textContent=formatTick(logY?Math.pow(10,t):t);
        markFontEditable(txt,'yTick');
        yTickFontCount+=1;
      });
    console.debug('Debug: hist font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
    console.debug('Debug: hist ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
    const edges=Array.from({length:bins+1},(_,i)=>xScale.min+i*binWidth);
    const fill=histFill.value; const borderColor=histBorder.value;
    counts.forEach((c,i)=>{ const xStart=x2px(edges[i]); const xEnd=x2px(edges[i+1]); const barW=Math.max(0,xEnd-xStart); const val=logY?Math.log10(Math.max(c,yMin)):c; const y=y2px(val); const h=margin.top+plotH-y; const rect=add('rect',{x:xStart,y,width:barW,height:h,fill:fill}); if(borderWidthPx>0){rect.setAttribute('stroke',borderColor); rect.setAttribute('stroke-width',borderWidthPx);} });
    const xAxisBase=margin.top+plotH;
    const xText=add('text',{x:margin.left+plotW/2,y:xAxisBase+bottomLayout.titleOffset,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR}); xText.textContent=state.xLabelText; markFontEditable(xText,'xTitle','xTitle'); if(global.makeEditable) makeEditable(xText,txt=>{state.xLabelText=txt;});
    const yX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
    const yText=add('text',{x:yX,y:margin.top+plotH/2,'dominant-baseline':'middle',transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR}); yText.textContent=state.yLabelText; markFontEditable(yText,'yTitle','yTitle'); if(global.makeEditable) makeEditable(yText,txt=>{state.yLabelText=txt;});
    const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR}); titleText.textContent=state.titleText; markFontEditable(titleText,'graphTitle','graphTitle'); if(global.makeEditable) makeEditable(titleText,txt=>{state.titleText=txt;});
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
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'hist',
      selectors: {
        tablePanel: '#histTablePanel',
        graphPanel: '#histGraphPanel',
        panelResizer: '#histPanelResizer',
        hotWrapper: '#histHotWrapper',
        hotContainer: '#histHot',
        svgBox: () => document.querySelector('#histGraphPanel .svgbox'),
        resizeTarget: () => document.querySelector('#histGraphPanel .svgbox')
      },
      scheduleDraw: state.scheduleDraw,
      onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        console.debug('Debug: hist layout min width update', { value: state.minSvgWidth });
      }
    });
    state.svgBox = state.layout?.elements?.svgBox || state.svgBox;
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    state.layout?.syncPanels?.();
    initHot();
    initControls();
    state.scheduleDraw = Shared.debounceFrame(draw);
    console.debug('Debug: hist scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    hist.ready = true;
  };

  hist.ensure = function ensure(){ if (!hist.ready) hist.init(); };

})(window);


