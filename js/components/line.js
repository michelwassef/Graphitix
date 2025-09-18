(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const line = Components.line = Components.line || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  line.__installed = true;
  line.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: line component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: line component awaiting Shared.tableImport helpers'); // Debug: table import helper check
  }

  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_ROWS = 100;
  const LINE_DEFAULT_COLS = 6;
  const DEFAULT_SCATTER_COLORS = global.DEFAULT_SCATTER_COLORS || ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
  global.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;

  let scheduleLineDraw = () => {};
  let lineHot = null;
  let lineTitleText = 'Line graph';
  let lineXLabelText = 'X';
  let lineYLabelText = 'Y';
  let lineLabelColors = {};
  let lineLegendItems = [];
  let lineLegendWidth = 0;
  let lineMinSvgWidth = 0;
  let lineFileHandle = null;
  let lineFileName = 'line.graph';

  const refs = {};

  const makeEditableHelper = (el,onChange,options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if (typeof fn === 'function') {
      return fn(el,onChange,options);
    }
    console.warn('line component makeEditable fallback missing');
    return undefined;
  };
  const autoResizeSvgHelper = (svg, opts) => {
    const fn = Shared.autoResizeSvg || global.autoResizeSvg;
    if (typeof fn === 'function') {
      return fn(svg, opts);
    }
    console.warn('line component autoResizeSvg fallback missing');
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
  console.debug('Debug: line component DOM helpers resolved', {
    hasSharedEditable: typeof Shared.makeEditable === 'function',
    hasSharedResize: typeof Shared.autoResizeSvg === 'function',
    hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
  }); // Debug: helper availability summary

  function formatP(p){
    if(p === undefined || p === null || Number.isNaN(p)) return 'n/a';
    if(!Number.isFinite(p)) return p>0?'Infinity':'-Infinity';
    if(p === 0) return '0';
    const formatted = p.toLocaleString('en-US',{maximumSignificantDigits:6});
    console.debug('Debug: line.formatP',{input:p,formatted}); // Debug: trace formatting
    return formatted;
  }

  function syncLineWidths(){
    Shared.syncPanelWidths(refs.tablePanel, refs.graphPanel, refs.configPanel, scheduleLineDraw, {
      svgBox: refs.svgBox,
      minSvgWidth: lineMinSvgWidth,
      debugLabel: 'line',
      panelResizer: refs.panelResizer
    });
  }

  function updateLineLabelColorPickers(labels){
    if(!refs.labelColorsDiv || !refs.labelColorsFieldset) return;
    refs.labelColorsDiv.innerHTML='';
    Object.keys(lineLabelColors).forEach(k=>{ if(!labels.includes(k)) delete lineLabelColors[k]; });
    labels.forEach((lab,i)=>{
      if(!lineLabelColors[lab]) lineLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
      const input=document.createElement('input');
      input.type='color';
      input.value=lineLabelColors[lab];
      if(typeof global.attachColorPickerNear === 'function') global.attachColorPickerNear(input);
      input.addEventListener('input',e=>{
        lineLabelColors[lab]=e.target.value;
        console.debug('Debug: line label color change',{label:lab,color:e.target.value}); // Debug: label color edit
        scheduleLineDraw();
      });
      const lbl=document.createElement('label');
      lbl.textContent=lab+' ';
      lbl.appendChild(input);
      refs.labelColorsDiv.appendChild(lbl);
    });
    refs.labelColorsFieldset.style.display=labels.length?'':'none';
    console.debug('Debug: updateLineLabelColorPickers',{labels,count:labels.length}); // Debug: label picker update
  }

  function computeLineStats(points,method,jStatLib){
    const x=points.map(p=>p.x);
    const y=points.map(p=>p.y);
    const n=points.length;
    if(n<3) return null;
    const pearson=jStatLib.corrcoeff(x,y);
    let r,label;
    if(method==='pearson'){r=pearson; label='Pearson';}
    else {r=jStatLib.spearmancoeff(x,y); label='Spearman';}
    const t=r*Math.sqrt((n-2)/(1-r*r));
    const p=2*(1-jStatLib.studentt.cdf(Math.abs(t),n-2));
    const slope = (()=>{
      const xMean=jStatLib.mean(x);
      const yMean=jStatLib.mean(y);
      const num=x.reduce((s,xi,i)=>s+(xi-xMean)*(y[i]-yMean),0);
      const den=x.reduce((s,xi)=>s+Math.pow(xi-xMean,2),0);
      return num/den;
    })();
    console.debug('Debug: computeLineStats',{method:label,r,p,slope}); // Debug: stats computation
    return {method:label,r,p,slope};
  }

  function updateLineStats(series){
    if(!refs.statType || !refs.statsResults) return;
    const jStatLib = global.jStat;
    if(!jStatLib){
      refs.statsResults.textContent='Statistics unavailable (jStat missing).';
      return;
    }
    const method=refs.statType.value||'pearson';
    console.debug('Debug: updateLineStats',{seriesCount:series.length,method}); // Debug: stats update entry
    const rows=[];
    series.forEach(s=>{
      const pts=s.points.filter(Boolean);
      if(pts.length>=3){
        const stats=computeLineStats(pts,method,jStatLib);
        if(stats){
          rows.push(`<tr><td>${s.name}</td><td>${stats.r.toFixed(4)}</td><td>${formatP(stats.p)}</td><td>${stats.slope.toFixed(4)}</td></tr>`);
        }
      }
    });
    if(rows.length){
      refs.statsResults.innerHTML='<table><tr><th>Series</th><th>r</th><th>p</th><th>Slope</th></tr>'+rows.join('')+'</table>';
    }else{
      refs.statsResults.textContent='Not enough data for statistics.';
    }
    console.debug('Debug: updateLineStats complete',{rowCount:rows.length}); // Debug: stats update exit
  }

  function getLineGraphPayload(){
    if(!lineHot) return null;
    return {
      type:'line',
      data:lineHot.getData(),
      config:{
        title:lineTitleText,
        xLabel:lineXLabelText,
        yLabel:lineYLabelText,
        dotSize:refs.dotSize?.value,
        fill:refs.fill?.value,
        border:refs.border?.value,
        borderWidth:refs.borderWidth?.value,
        alpha:refs.alpha?.value,
        labelColors:lineLabelColors,
        showGrid:refs.showGrid?.checked,
        logX:refs.logX?.checked,
        logY:refs.logY?.checked,
        xMin:refs.xMin?.value,
        xMax:refs.xMax?.value,
        yMin:refs.yMin?.value,
        yMax:refs.yMax?.value,
        originMode:refs.originMode?.value,
        originX:refs.originX?.value,
        originY:refs.originY?.value,
        fontSize:refs.fontSize?.value
      }
    };
  }

  function loadLineGraphFile(file){
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const obj=JSON.parse(e.target.result);
        console.debug('Debug: loadLineGraphFile payload',obj); // Debug: file load payload
        if(obj.type!=='line') throw new Error('Invalid graph type');
        if(lineHot && obj.data) lineHot.loadData(obj.data);
        const c=obj.config||{};
        lineTitleText=c.title||lineTitleText;
        lineXLabelText=c.xLabel||lineXLabelText;
        lineYLabelText=c.yLabel||lineYLabelText;
        if(refs.dotSize && c.dotSize!=null) refs.dotSize.value=c.dotSize;
        if(refs.fill && c.fill) refs.fill.value=c.fill;
        if(refs.border && c.border) refs.border.value=c.border;
        if(refs.borderWidth && c.borderWidth!=null) refs.borderWidth.value=c.borderWidth;
        if(refs.alpha){ refs.alpha.value=c.alpha||0; refs.alphaVal.textContent=refs.alpha.value; }
        lineLabelColors=c.labelColors||{};
        if(refs.showGrid) refs.showGrid.checked=!!c.showGrid;
        if(refs.logX) refs.logX.checked=!!c.logX;
        if(refs.logY) refs.logY.checked=!!c.logY;
        if(refs.xMin) refs.xMin.value=c.xMin||'';
        if(refs.xMax) refs.xMax.value=c.xMax||'';
        if(refs.yMin) refs.yMin.value=c.yMin||'';
        if(refs.yMax) refs.yMax.value=c.yMax||'';
        if(refs.originMode && c.originMode) refs.originMode.value=c.originMode;
        if(refs.originX) refs.originX.value=c.originX||'';
        if(refs.originY) refs.originY.value=c.originY||'';
        if(refs.fontSize){ refs.fontSize.value=c.fontSize||refs.fontSize.value; refs.fontSizeVal.textContent=refs.fontSize.value; }
        updateLineLabelColorPickers(Object.keys(lineLabelColors));
        scheduleLineDraw();
      }catch(err){ console.error('loadLineGraph error',err); }
    };
    reader.readAsText(file);
  }

  async function saveLineFile(){
    const payload=getLineGraphPayload();
    if(!payload) return;
    console.debug('Debug: saveLineFile',{hasHandle:!!lineFileHandle}); // Debug: save request
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('saveLineFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'line',
      fileHandle: lineFileHandle,
      payload,
      fileName: lineFileName,
      downloadFileName: lineFileName,
      setFileHandle: handle => { lineFileHandle = handle; },
      setFileName: name => { lineFileName = name; }
    });
    console.debug('Debug: saveLineFile result', result);
  }

  async function saveAsLineFile(){
    const payload=getLineGraphPayload();
    if(!payload) return;
    console.debug('Debug: saveAsLineFile invoked'); // Debug: saveAs entry
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('saveAsLineFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'line',
      payload,
      fileName: lineFileName,
      downloadFileName: lineFileName,
      setFileHandle: handle => { lineFileHandle = handle; },
      setFileName: name => { lineFileName = name; }
    });
    console.debug('Debug: saveAsLineFile result', result);
  }

  async function openLineFile(){
    console.debug('Debug: openLineFile start'); // Debug: open entry
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('openLineFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'line',
      setFileHandle: handle => { lineFileHandle = handle; },
      setFileName: name => { lineFileName = name; },
      loadFromFile: file => loadLineGraphFile(file),
      triggerInput: () => {
        if(refs.graphFileInput){
          refs.graphFileInput.value='';
          refs.graphFileInput.click();
        }
      }
    });
    console.debug('Debug: openLineFile result', result);
  }

  function buildLineExportSvg(){
    const svgEl=document.getElementById('lineSvg');
    if(!svgEl) return null;
    const clone=svgEl.cloneNode(true);
    const baseW=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800;
    const baseH=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
    clone.setAttribute('width',String(baseW));
    clone.setAttribute('height',String(baseH));
    clone.setAttribute('viewBox',`0 0 ${baseW} ${baseH}`);
    clone.setAttribute('font-family','sans-serif');
    console.debug('Debug: buildLineExportSvg',{legendCount:lineLegendItems.length}); // Debug: export clone info
    return clone;
  }

  function drawLine(){
    try{
      const debugStamp=Date.now();
      console.debug('Debug: drawLine start',{debugStamp}); // Debug: draw entry
      if(!lineHot || !refs.plot) return;
      const fill=refs.fill?.value;
      const alpha=Number(refs.alpha?.value)||0;
      const borderWidth=Number(refs.borderWidth?.value);
      const borderColor=refs.border?.value;
      const containerRect=refs.svgBox?.getBoundingClientRect?.();
      const fontInfo=chartStyle.resolveScaledFontSize({
        rawSize: refs.fontSize?.value,
        width: containerRect?.width,
        height: containerRect?.height
      });
      const fs=fontInfo.scaledPx;
      console.debug('Debug: line font scaling applied',{
        input: refs.fontSize?.value,
        fontSizePt: fontInfo.pt,
        baseFontPx: fontInfo.px,
        scaledFontPx: fs,
        scale: fontInfo.scaleInfo?.scale,
        containerWidth: containerRect?.width,
        containerHeight: containerRect?.height
      }); // Debug: line font scaling summary
      const axisMetrics=chartStyle.createAxisMetrics(fs);
      console.debug('Debug: line axis metrics',axisMetrics);
      const showGrid=!!refs.showGrid?.checked;
      const logX=!!refs.logX?.checked;
      const logY=!!refs.logY?.checked;
      const dotSize=Number(refs.dotSize?.value)||0;
      const xMinManual=parseFloat(refs.xMin?.value);
      const xMaxManual=parseFloat(refs.xMax?.value);
      const yMinManual=parseFloat(refs.yMin?.value);
      const yMaxManual=parseFloat(refs.yMax?.value);
      const originMode=refs.originMode?.value;
      const originXInput=parseFloat(refs.originX?.value);
      const originYInput=parseFloat(refs.originY?.value);
      const data=lineHot.getData();
      if(!data||!data.length) return;
      const header=data[0]||[];
      let xIndex=header.findIndex(h=>String(h).trim().toLowerCase()==='x');
      if(xIndex<0) xIndex=0;
      lineXLabelText=(header[xIndex]&&String(header[xIndex]).trim())||'X';
      const seriesCols=header.map((_,i)=>i).filter(i=>i!==xIndex && header[i]!=null && String(header[i]).trim()!=='');
      const series=seriesCols.map((ci,i)=>({name:header[ci]||`Series ${i+1}`, points:[]}));
      let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity;
      for(let r=1;r<data.length;r++){
        const row=data[r];
        const xv=parseFloat(row[xIndex]);
        seriesCols.forEach((ci,si)=>{
          const yv=parseFloat(row[ci]);
          if(!isNaN(xv)&&!isNaN(yv)){
            series[si].points.push({x:xv,y:yv});
            if(xv<xMinRaw) xMinRaw=xv;
            if(xv>xMaxRaw) xMaxRaw=xv;
            if(yv<yMinRaw) yMinRaw=yv;
            if(yv>yMaxRaw) yMaxRaw=yv;
          } else {
            series[si].points.push(null);
          }
        });
      }
      const labelsUsed=series.map(s=>s.name);
      updateLineLabelColorPickers(labelsUsed);
      const legendLabels=labelsUsed;
      const legendScale = fontInfo.scaleInfo?.scale || 1;
      const legendWidth=legendLabels.length?Math.max(60, Math.round(120*legendScale)):0;
      console.debug('Debug: line legend width scaling',{legendWidth,legendScale,legendCount:legendLabels.length});
      lineLegendWidth=legendWidth;
      lineLegendItems=[];
      if(series.every(s=>s.points.every(p=>p==null))) return;
      if(logX && xMinRaw<=0){ refs.plot.innerHTML='<i>Log scale requires positive X values.</i>'; return; }
      if(logY && yMinRaw<=0){ refs.plot.innerHTML='<i>Log scale requires positive Y values.</i>'; return; }
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
      const plotEl=refs.plot;
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
      svg.setAttribute('font-family',chartStyle.FONT_FAMILY);
      chartStyle.applySvgDefaults(svg);
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
      if(isFinite(xMinManual)||isFinite(xMaxManual)){
        const ticks=[];
        for(let v=Math.ceil(xScale.min/xScale.step)*xScale.step; v<=xScale.max+1e-9; v+=xScale.step) ticks.push(v);
        xScale.ticks=ticks;
      }
      if(isFinite(yMinManual)||isFinite(yMaxManual)){
        const ticks=[];
        for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step; v<=yScale.max+1e-9; v+=yScale.step) ticks.push(v);
        yScale.ticks=ticks;
      }
      function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
      const tickFont=chartStyle.makeFont(fs);
      const yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
      const xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
      const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
      const maxYLabelWidth=Math.max(...yLabelWidths,0);
      const axisLabelFont=chartStyle.makeFont(fs);
      const yTitleWidth=chartStyle.measureText(lineYLabelText,axisLabelFont);
      let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth,yTitleWidth,axisMetrics});
      let plotW=Math.max(20,W-margin.left-margin.right);
      let plotH=Math.max(20,H-margin.top-margin.bottom);
      const bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
      margin.bottom=bottomLayout.bottom;
      plotW=Math.max(20,W-margin.left-margin.right);
      plotH=Math.max(20,H-margin.top-margin.bottom);
      console.debug('Debug: line layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate});
      const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
      const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
      function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
      const tickLen=axisMetrics.tickLength;
      const tickGap=axisMetrics.tickLabelGap;
      if(showGrid){
        xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':1});});
        yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':1});});
      }
      let originXT,originYT;
      if(originMode==='custom'){
        originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);
        originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);
      }else{
        originXT=xScale.min;
        originYT=yScale.min;
      }
      const clampedXT=Math.min(Math.max(originXT,xScale.min),xScale.max);
      const clampedYT=Math.min(Math.max(originYT,yScale.min),yScale.max);
      const xAxisY=y2px(clampedYT);
      const yAxisX=x2px(clampedXT);
      const xTickPositions=xScale.ticks.map(t=>x2px(t));
      const yTickPositions=yScale.ticks.map(t=>y2px(t));
      let axisXStart=xTickPositions.length?Math.min(...xTickPositions):margin.left;
      let axisXEnd=xTickPositions.length?Math.max(...xTickPositions):margin.left+plotW;
      let axisYStart=yTickPositions.length?Math.min(...yTickPositions):margin.top;
      let axisYEnd=yTickPositions.length?Math.max(...yTickPositions):margin.top+plotH;
      if(axisXStart===axisXEnd){axisXStart=margin.left;axisXEnd=margin.left+plotW;}
      if(axisYStart===axisYEnd){axisYStart=margin.top;axisYEnd=margin.top+plotH;}
      console.debug('Debug: line axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
      add('line',{x1:axisXStart,y1:xAxisY,x2:axisXEnd,y2:xAxisY,stroke:'#000','stroke-width':1,'stroke-linecap':'square'});
      add('line',{x1:yAxisX,y1:axisYStart,x2:yAxisX,y2:axisYEnd,stroke:'#000','stroke-width':1,'stroke-linecap':'square'});
      const xTickNodes=[];
      xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:'#000','stroke-width':1});const txt=add('text',{x,y:xAxisY+tickLen+tickGap,'font-size':fs,'text-anchor':'middle','dominant-baseline':'hanging',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logX?Math.pow(10,t):t);xTickNodes.push(txt);});
      chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
      yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:'#000','stroke-width':1});const txt=add('text',{x:yAxisX-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logY?Math.pow(10,t):t);});
      const colors=series.map((s,i)=>lineLabelColors[s.name]||borderColor||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]);
      const seriesElems=[];
      series.forEach((s,i)=>{
        const color=colors[i];
        let pathStr='';
        let started=false;
        const markerFrag=document.createDocumentFragment();
        s.points.forEach(pt=>{
          if(pt){
            const xv=logX?Math.log10(pt.x):pt.x;
            const yv=logY?Math.log10(pt.y):pt.y;
            const px=x2px(xv);
            const py=y2px(yv);
            if(!started){pathStr+=`M${px} ${py}`; started=true;} else {pathStr+=`L${px} ${py}`;}
            if(dotSize>0){
              const c=document.createElementNS(NS,'circle');
              c.setAttribute('cx',px);
              c.setAttribute('cy',py);
              c.setAttribute('r',dotSize);
              c.setAttribute('fill',lineLabelColors[s.name]||fill);
              c.setAttribute('fill-opacity',1-alpha);
              markerFrag.appendChild(c);
            }
          } else {
            started=false;
          }
        });
        const path=add('path',{d:pathStr,fill:'none',stroke:color,'stroke-width':borderWidth,'stroke-opacity':1-alpha});
        const mGroup=add('g',{});
        mGroup.appendChild(markerFrag);
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
          t.setAttribute('fill',chartStyle.TEXT_COLOR);
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
      }
      const xAxisBase=margin.top+plotH;
      const xText=add('text',{x:margin.left+plotW/2,y:xAxisBase+bottomLayout.titleOffset,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
      xText.textContent=lineXLabelText;
      makeEditableHelper(xText,txt=>{lineXLabelText=txt;});
      const yX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
      const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
      yText.textContent=lineYLabelText;
      makeEditableHelper(yText,txt=>{lineYLabelText=txt;});
      const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
      titleText.textContent=lineTitleText;
      makeEditableHelper(titleText,txt=>{lineTitleText=txt;});
      updateLineStats(series);
      autoResizeSvgHelper(svg);
      console.debug('Debug: drawLine complete',{token}); // Debug: draw exit
    }catch(err){ console.error('drawLine error',err); }
  }

  function setup(){
    if(line.ready){ console.debug('Debug: Components.line.setup skipped'); return; }
    console.debug('Debug: Components.line.setup start'); // Debug: setup entry
    const document = global.document;
    const Handsontable = global.Handsontable;
    if(!document || !Handsontable){ console.error('Line component dependencies missing'); return; }
    const $ = global.$ || (sel=>document.querySelector(sel));
    refs.tablePanel=document.getElementById('lineTablePanel');
    refs.graphPanel=document.getElementById('lineGraphPanel');
    refs.panelResizer=document.getElementById('linePanelResizer');
    refs.svgBox=refs.graphPanel?.querySelector('.svgbox');
    refs.configPanel=refs.graphPanel?.querySelector('.config-options');
    refs.hotContainer=document.getElementById('lineHot');
    refs.hotWrapper=document.getElementById('lineHotWrapper');
    refs.plot=document.getElementById('linePlot');
    refs.statType=document.getElementById('lineStatType');
    refs.statsResults=document.getElementById('lineStatsResults');
    refs.fill=document.getElementById('lineFill');
    refs.border=document.getElementById('lineBorder');
    refs.borderWidth=document.getElementById('lineBorderWidth');
    refs.dotSize=document.getElementById('lineDotSize');
    refs.alpha=document.getElementById('lineAlpha');
    refs.alphaVal=document.getElementById('lineAlphaVal');
    refs.fontSize=document.getElementById('lineFontSize');
    refs.fontSizeVal=document.getElementById('lineFontSizeVal');
    refs.showGrid=document.getElementById('lineShowGrid');
    refs.logX=document.getElementById('lineLogX');
    refs.logY=document.getElementById('lineLogY');
    refs.xMin=document.getElementById('lineXMin');
    refs.xMax=document.getElementById('lineXMax');
    refs.yMin=document.getElementById('lineYMin');
    refs.yMax=document.getElementById('lineYMax');
    refs.originMode=document.getElementById('lineOriginMode');
    refs.originX=document.getElementById('lineOriginX');
    refs.originY=document.getElementById('lineOriginY');
    refs.labelColorsDiv=document.getElementById('lineLabelColors');
    refs.labelColorsFieldset=document.getElementById('lineLabelColorsFieldset');
    refs.loadExample=document.getElementById('lineLoadExample');
    refs.importBtn=document.getElementById('lineImport');
    refs.fileInput=document.getElementById('lineFile');
    refs.pngBtn=document.getElementById('linePNG');
    refs.svgBtn=document.getElementById('lineSVG');
    refs.openBtn=document.getElementById('openLine');
    refs.saveBtn=document.getElementById('saveLine');
    refs.saveAsBtn=document.getElementById('saveAsLine');
    refs.graphFileInput=document.getElementById('lineGraphFile');

    global.lineStatType = refs.statType; // legacy compatibility
    global.lineStatsResults = refs.statsResults; // legacy compatibility

    if(refs.hotWrapper && Shared.ensureHotWrapperStyles){ Shared.ensureHotWrapperStyles(refs.hotWrapper); }
    console.debug('Debug: lineHotWrapper style', refs.hotWrapper?.style?.cssText); // Debug: wrapper styles

    const data=Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,LINE_DEFAULT_COLS);
    data[0]=['X','Series1','Series2','Series3','Series4','Series5'];
    lineHot=new Handsontable(refs.hotContainer,{
      data,
      rowHeaders(index){ const label=index===0?'':index; console.debug('Debug: line rowHeader',{index,label}); return label; },
      colHeaders:true,
      minRows:DEFAULT_ROWS,
      minCols:LINE_DEFAULT_COLS,
      stretchH:'all',
      contextMenu:true,
      cells(row){ const props={}; if(row===0){ props.renderer=function(instance,td){ Handsontable.renderers.TextRenderer.apply(this,arguments); td.style.background='#e9ecef'; td.style.fontWeight='600'; td.title='Header (first row)'; }; } return props; },
      licenseKey:'non-commercial-and-evaluation',
      afterChange:(changes,source)=>{ if(changes && source!=='loadData'){ console.debug('Debug: line afterChange',{count:changes.length,source}); scheduleLineDraw(); } },
      afterCreateRow:()=>{ console.debug('Debug: line row created'); scheduleLineDraw(); },
      afterCreateCol:()=>{ console.debug('Debug: line col created'); scheduleLineDraw(); },
      afterRemoveRow:()=>{ console.debug('Debug: line row removed'); scheduleLineDraw(); },
      afterRemoveCol:()=>{ console.debug('Debug: line col removed'); scheduleLineDraw(); },
      afterUndo:()=>{ console.debug('Debug: line undo'); scheduleLineDraw(); },
      afterRedo:()=>{ console.debug('Debug: line redo'); scheduleLineDraw(); }
    });
    global.DEBUG_LINE=true;
    console.debug('Debug: lineHot initialized',{rows:DEFAULT_ROWS,cols:LINE_DEFAULT_COLS});

    const ResizeObserverCtor = global.ResizeObserver;
    if(ResizeObserverCtor && refs.tablePanel){
      const observer=new ResizeObserverCtor(()=>{ syncLineWidths(); });
      observer.observe(refs.tablePanel);
    }
    syncLineWidths();

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

    refs.loadExample?.addEventListener('click',()=>{ lineHot.loadData(lineExample); console.debug('Debug: line example loaded'); scheduleLineDraw(); });
    refs.importBtn?.addEventListener('click',()=>{ if(refs.fileInput){ refs.fileInput.value=''; refs.fileInput.click(); } });
    refs.fileInput?.addEventListener('change',async e=>{
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('line import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const fileName = e.target.files?.[0]?.name || '';
      console.debug('Debug: line import start',{fileName}); // Debug: import start trace
      try{
        const result = await tableImport.openFile(refs.fileInput,{
          hot: lineHot,
          minCols: LINE_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: scheduleLineDraw,
          debugLabel: 'line',
          onProcessed: info => {
            console.debug('Debug: line tableImport processed', info || {}); // Debug: processed callback
          }
        });
        console.debug('Debug: line import finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
      }catch(err){
        console.error('line import failed',err);
      }
    });

    refs.hotContainer?.addEventListener('paste',async e=>{
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.handlePaste !== 'function'){
        console.warn('line paste skipped: Shared.tableImport.handlePaste unavailable');
        return;
      }
      try{
        const result = await tableImport.handlePaste(e,lineHot,{
          minCols: LINE_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: scheduleLineDraw,
          debugLabel: 'line',
          onProcessed: info => {
            console.debug('Debug: line paste processed', info || {}); // Debug: paste processed callback
          }
        });
        console.debug('Debug: line paste finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: paste finish trace
      }catch(err){
        console.error('line paste failed',err);
      }
    });

    if(refs.plot){
      const container=refs.plot.closest('.svgbox')||refs.plot.parentElement;
      if(container && Shared.attachResizableBox){
        Shared.attachResizableBox(container,{
          defaultWidth: 640,
          defaultHeight: 420,
          onResize: phase => {
            console.debug('Debug: line svgbox resized', { phase }); // Debug: line svgbox resize callback
            syncLineWidths();
          }
        });
      }
    }

    if(refs.panelResizer && refs.tablePanel && refs.graphPanel){
      refs.panelResizer.addEventListener('pointerdown',e=>{
        e.preventDefault();
        const startX=e.clientX;
        const startTable=refs.tablePanel.getBoundingClientRect().width;
        const startGraph=refs.graphPanel.getBoundingClientRect().width;
        const configWidth=refs.configPanel?.getBoundingClientRect().width||0;
        const diagram=refs.graphPanel.querySelector('.diagram-area');
        const gap=parseFloat(getComputedStyle(diagram).gap||0);
        lineMinSvgWidth=refs.svgBox?.getBoundingClientRect().width*0.5||0;
        const minGraph=configWidth+gap+lineMinSvgWidth;
        const total=startTable+startGraph;
        console.debug('Debug: line resizer start',{startTable,startGraph,configWidth,gap,lineMinSvgWidth,minGraph,total}); // Debug: resizer start
        function onMove(ev){
          const dx=ev.clientX-startX;
          let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx));
          let newGraph=total-newTable;
          refs.tablePanel.style.flex=`0 0 ${newTable}px`;
          refs.graphPanel.style.flex=`0 0 ${newGraph}px`;
          syncLineWidths();
          console.debug('Debug: line resizer move',{dx,newTable,newGraph}); // Debug: resizer move
        }
        function onUp(){
          document.removeEventListener('pointermove',onMove);
          document.removeEventListener('pointerup',onUp);
          console.debug('Debug: line resizer end'); // Debug: resizer end
        }
        document.addEventListener('pointermove',onMove);
        document.addEventListener('pointerup',onUp);
      });
    }

    refs.fill?.addEventListener('input',()=>{ scheduleLineDraw(); });
    refs.border?.addEventListener('input',()=>{ scheduleLineDraw(); });
    refs.borderWidth?.addEventListener('input',()=>{ scheduleLineDraw(); });
    refs.dotSize?.addEventListener('input',()=>{ scheduleLineDraw(); });
    refs.alpha?.addEventListener('input',()=>{ if(refs.alphaVal) refs.alphaVal.textContent=refs.alpha.value; scheduleLineDraw(); });
    refs.fontSize?.addEventListener('input',()=>{ if(refs.fontSizeVal) refs.fontSizeVal.textContent=refs.fontSize.value; scheduleLineDraw(); });
    refs.showGrid?.addEventListener('change',()=>{ scheduleLineDraw(); });
    refs.logX?.addEventListener('change',()=>{ scheduleLineDraw(); });
    refs.logY?.addEventListener('change',()=>{ scheduleLineDraw(); });
    [refs.xMin,refs.xMax,refs.yMin,refs.yMax,refs.originMode,refs.originX,refs.originY].forEach(el=>{
      el?.addEventListener('input',()=>{ scheduleLineDraw(); });
    });
    refs.statType?.addEventListener('change',()=>{ scheduleLineDraw(); });

    refs.pngBtn?.addEventListener('click',async()=>{
      const svgEl=buildLineExportSvg();
      if(!svgEl) return;
      const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800;
      const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
      const xml=serializeSvg(svgEl);
      const img=new Image();
      const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
      img.src=url;
      await img.decode().catch(err=>{ console.error('linePNG svg decode',err); });
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

    refs.svgBtn?.addEventListener('click',()=>{
      const svgEl=buildLineExportSvg();
      if(!svgEl) return;
      const xml=serializeSvg(svgEl);
      const blob=new Blob([xml],{type:'image/svg+xml'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download='line.svg';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),4000);
    });

    refs.openBtn?.addEventListener('click',openLineFile);
    refs.saveBtn?.addEventListener('click',saveLineFile);
    refs.saveAsBtn?.addEventListener('click',saveAsLineFile);
    refs.graphFileInput?.addEventListener('change',e=>{
      const f=e.target.files[0];
      if(f){
        lineFileName=f.name;
        lineFileHandle=null;
        loadLineGraphFile(f);
      }
    });

    scheduleLineDraw = Shared.debounceFrame(drawLine);
    console.debug('Debug: line scheduleLineDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    line.ready = true;
    scheduleLineDraw();
    console.debug('Debug: Components.line.setup complete'); // Debug: setup complete
  }

  function ensureReady(){ if(!line.ready) setup(); }

  line.init = setup;
  line.ensure = ensureReady;
  line.draw = function draw(){ ensureReady(); scheduleLineDraw && scheduleLineDraw(); };
  line.save = saveLineFile;
  line.saveAs = saveAsLineFile;
  line.open = openLineFile;
  line.loadFromFile = loadLineGraphFile;
  line.getPayload = getLineGraphPayload;
  line.buildExportSvg = buildLineExportSvg;
  line.getHot = () => lineHot;
  line.updateStats = updateLineStats;

})(window);
