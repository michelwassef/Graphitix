(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const scatter = Components.scatter = Components.scatter || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
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
  const DEFAULT_COLS=3;

  let scheduleDrawScatter=null;

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
    const $ = global.$;
    const document = global.document;
    const Handsontable = global.Handsontable;
    if(!Handsontable){
      console.error('Handsontable missing for scatter component');
      return;
    }
    const ResizeObserverCtor = global.ResizeObserver;
    const makeEditableLocal = (el,onChange,options) => {
      const fn = Shared.makeEditable || global.makeEditable;
      if (typeof fn === 'function') {
        return fn(el,onChange,options);
      }
      console.warn('scatter component makeEditable fallback missing');
      return undefined;
    };
    const autoResizeSvg = (svg, opts) => {
      const fn = Shared.autoResizeSvg || global.autoResizeSvg;
      if (typeof fn === 'function') {
        return fn(svg, opts);
      }
      console.warn('scatter component autoResizeSvg fallback missing');
      return undefined;
    };
    const attachPicker = (el)=>{ if (typeof global.attachColorPickerNear === 'function') { global.attachColorPickerNear(el); } };
    const serializeSvg = (svgEl, options)=>{
      const fn = Shared.serializeCleanSVG || global.serializeCleanSVG;
      if (typeof fn === 'function') {
        return fn(svgEl, options);
      }
      if (!svgEl) return '';
      const serializer = new (global.XMLSerializer||XMLSerializer)();
      return serializer.serializeToString(svgEl);
    };
    console.debug('Debug: scatter component DOM helpers resolved', {
      hasSharedEditable: typeof Shared.makeEditable === 'function',
      hasSharedResize: typeof Shared.autoResizeSvg === 'function',
      hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
    }); // Debug: helper availability summary
    let scatterDrawToken=0;
      // Scatter plot setup
      const scatterHotContainer=document.getElementById('scatterHot');
      const scatterHotWrapper=document.getElementById('scatterHotWrapper');
      const scatterTablePanel=document.getElementById('scatterTablePanel');
      const scatterGraphPanel=document.getElementById('scatterGraphPanel');
      const scatterPanelResizer=document.getElementById('scatterPanelResizer');
      const scatterSvgBox=scatterGraphPanel?.querySelector('.svgbox');
      const scatterConfigPanel=scatterGraphPanel?.querySelector('.config-options');
      let scatterMinSvgWidth=0;
      const syncScatterPanels=()=>{
        Shared.syncPanelWidths(scatterTablePanel, scatterGraphPanel, scatterConfigPanel, null, {
          svgBox: scatterSvgBox,
          minSvgWidth: scatterMinSvgWidth,
          debugLabel: 'scatter',
          skipSchedule: true,
          panelResizer: scatterPanelResizer
        });
      };
      const scatterTableObserver = ResizeObserverCtor ? new ResizeObserverCtor(()=>{syncScatterPanels();}) : null;
      if(scatterTableObserver) scatterTableObserver.observe(scatterTablePanel);
      syncScatterPanels();
    
      if(global.Shared && global.Shared.ensureHotWrapperStyles){ global.Shared.ensureHotWrapperStyles(scatterHotWrapper); }
      console.debug('scatterHotWrapper style updated', scatterHotWrapper.style.cssText);
      console.debug('Debug: scatter initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
      if(typeof Shared.hot?.createStandardTable !== 'function'){
        console.error('scatter initHot missing Shared.hot.createStandardTable');
        return;
      }
      const data = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
      const scatterHot=Shared.hot.createStandardTable(scatterHotContainer,{ rows: DEFAULT_ROWS, cols: DEFAULT_COLS },scheduleDrawScatter,{
        debugLabel: 'scatter',
        data,
        hotOptions: {
          afterChange(changes,source){
            if(!changes||source==='loadData') return;
            console.log('scatter afterChange', {count:changes.length, source});
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
      if(global.DEBUG_SCATTER) console.log('scatter example dataset', scatterExample);
      document.getElementById('scatterLoadExample').addEventListener('click',()=>{
        scatterHot.loadData(scatterExample);
        console.log('scatter example loaded');
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
          minCols: 3,
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
              minCols: 3,
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
    
      const scatterFill=$('#scatterFill'), scatterBorder=$('#scatterBorder'), scatterBorderWidth=$('#scatterBorderWidth'), scatterDotSize=$('#scatterDotSize'), scatterShowLine=$('#scatterShowLine'), scatterAlpha=$('#scatterAlpha');
      const scatterAlphaVal=$('#scatterAlphaVal');
      const scatterFontSize=$('#scatterFontSize'), scatterFontSizeVal=$('#scatterFontSizeVal');
      chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value) });
      const scatterShowGrid=$('#scatterShowGrid'), scatterShowFrame=$('#scatterShowFrame'), scatterLogX=$('#scatterLogX'), scatterLogY=$('#scatterLogY');
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
      scatterFontSize.addEventListener('input',()=>{chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value) }); scheduleDrawScatter();});
      [scatterShowGrid,scatterLogX,scatterLogY,scatterStatType,scatterOriginMode,scatterShowLine].forEach(el=>el.addEventListener('change',()=>{console.log('scatter config changed', el.id); scheduleDrawScatter();}));
      scatterShowFrame.addEventListener('change',()=>{console.debug('Debug: scatter showFrame change',{checked:scatterShowFrame.checked}); scheduleDrawScatter();});
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
          attachPicker(input);
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
      if(global.Shared && Shared.attachResizableBox && scatterContainer){
        Shared.attachResizableBox(scatterContainer, {
          defaultWidth: 640,
          defaultHeight: 420,
          onResize: phase => {
            console.debug('Debug: scatter resizer callback', { phase }); // Debug: scatter resizer callback
            scheduleDrawScatter();
          }
        });
      }else{
        console.debug('Debug: scatter resizer attach skipped', { hasContainer: !!scatterContainer }); // Debug: scatter resizer skipped
      }

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
            syncScatterPanels();
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
        const containerRect=scatterSvgBox?.getBoundingClientRect?.();
        const fontInfo=chartStyle.resolveScaledFontSize({
          rawSize: scatterFontSize.value,
          width: containerRect?.width,
          height: containerRect?.height
        });
        const fs=fontInfo.scaledPx;
        chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, fontInfo });
        console.debug('Debug: scatter font scaling applied',{
          input: scatterFontSize.value,
          fontSizePt: fontInfo.pt,
          baseFontPx: fontInfo.px,
          scaledFontPx: fs,
          scale: fontInfo.scaleInfo?.scale,
          containerWidth: containerRect?.width,
          containerHeight: containerRect?.height
        }); // Debug: scatter font scaling summary
        const axisMetrics=chartStyle.createAxisMetrics(fs);
        console.debug('Debug: scatter axis metrics',axisMetrics);
        const showGrid=scatterShowGrid.checked;
        console.log('scatter showGrid', showGrid);
        const showFrame=scatterShowFrame.checked;
        console.debug('Debug: scatter showFrame state',{showFrame});
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
        const legendScale = fontInfo.scaleInfo?.scale || 1;
        const legendWidth=legendLabels.length?Math.max(60, Math.round(120*legendScale)):0;
        console.debug('Debug: scatter legend width scaling',{legendWidth,legendScale,legendCount:legendLabels.length});
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
        svg.setAttribute('font-family',chartStyle.FONT_FAMILY);
        chartStyle.applySvgDefaults(svg);
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
        const tickFont=chartStyle.makeFont(fs);
        const xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
        const yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
        const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
        const maxYLabelWidth=Math.max(...yLabelWidths,0);
        const axisLabelFont=chartStyle.makeFont(fs);
        const yTitleWidth=chartStyle.measureText(scatterYLabelText,axisLabelFont);
        let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth,yTitleWidth,axisMetrics});
        let plotW=Math.max(20,W-margin.left-margin.right);
        let plotH=Math.max(20,H-margin.top-margin.bottom);
        const bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
        margin.bottom=bottomLayout.bottom;
        plotW=Math.max(20,W-margin.left-margin.right);
        plotH=Math.max(20,H-margin.top-margin.bottom);
        const square=chartStyle.ensureSquarePlot(W,H,margin);
        margin=square.margin;
        plotW=square.plotW;
        plotH=square.plotH;
        console.debug('Debug: scatter layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate});
        const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
        const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
        function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
        const tickLen=axisMetrics.tickLength;
        const tickGap=axisMetrics.tickLabelGap;
        if(showGrid){
          xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd'});});
          yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd'});});
          console.debug('Debug: scatter grid uses default stroke scaling',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length});
        }
        let originXT,originYT;
        if(originMode==='custom'){originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);}else{originXT=xScale.min;originYT=yScale.min;}
        const clampedXT=Math.min(Math.max(originXT,xScale.min),xScale.max);
        const clampedYT=Math.min(Math.max(originYT,yScale.min),yScale.max);
        console.log('scatter origin final',{originXT,originYT,clampedXT,clampedYT});
        const xAxisY=y2px(clampedYT);
        const yAxisX=x2px(clampedXT);
        console.log('scatter axes',{tickLen,xAxisY,yAxisX});
        const xTickPositions=xScale.ticks.map(t=>x2px(t));
        const yTickPositions=yScale.ticks.map(t=>y2px(t));
        let axisXStart=xTickPositions.length?Math.min(...xTickPositions):margin.left;
        let axisXEnd=xTickPositions.length?Math.max(...xTickPositions):margin.left+plotW;
        let axisYStart=yTickPositions.length?Math.min(...yTickPositions):margin.top;
        let axisYEnd=yTickPositions.length?Math.max(...yTickPositions):margin.top+plotH;
        if(axisXStart===axisXEnd){axisXStart=margin.left;axisXEnd=margin.left+plotW;}
        if(axisYStart===axisYEnd){axisYStart=margin.top;axisYEnd=margin.top+plotH;}
        console.debug('Debug: scatter axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
        const axisStroke = '#000';
        add('line',{x1:axisXStart,y1:xAxisY,x2:axisXEnd,y2:xAxisY,stroke:axisStroke,'stroke-linecap':'square'});
        add('line',{x1:yAxisX,y1:axisYStart,x2:yAxisX,y2:axisYEnd,stroke:axisStroke,'stroke-linecap':'square'});
        console.debug('Debug: scatter axes rely on default stroke width',{axisStroke});
        if(showFrame){
          console.debug('Debug: scatter frame request',{stroke:axisStroke, showFrame}); // Debug: frame styling inputs
          chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, sides: ['top','right'] });
        }
        // Frame closes scatter plot using axis styling continuity
        const xTickNodes=[];
        xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:'#000'});const txt=add('text',{x,y:xAxisY+tickLen+tickGap,'font-size':fs,'text-anchor':'middle','dominant-baseline':'hanging',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logX?Math.pow(10,t):t);xTickNodes.push(txt);});
        chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
        yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:'#000'});const txt=add('text',{x:yAxisX-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logY?Math.pow(10,t):t);});
        console.debug('Debug: scatter ticks rely on default stroke width',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length});
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
            t.setAttribute('fill',chartStyle.TEXT_COLOR);
            t.textContent=lab;
            legendGroup.appendChild(t);
          });
          svg.appendChild(legendGroup);
          console.log('scatter legend placed inside',{labels:legendLabels,legendWidth,legendX,legendY});
        }
        const xAxisBase=margin.top+plotH;
        const xText=add('text',{x:margin.left+plotW/2,y:xAxisBase+bottomLayout.titleOffset,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        xText.textContent=scatterXLabelText;
        makeEditableLocal(xText,txt=>{scatterXLabelText=txt;});
        const yX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
        console.log('scatter y-axis position',yX);
        const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        yText.textContent=scatterYLabelText;
        makeEditableLocal(yText,txt=>{scatterYLabelText=txt;});
        const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        titleText.textContent=scatterTitleText;
        makeEditableLocal(titleText,txt=>{scatterTitleText=txt;});
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
            add('line',{x1:x2px(x1T),y1:y2px(y1T),x2:x2px(x2T),y2:y2px(y2T),stroke:'#d00'});
            console.debug('Debug: scatter trend vector effect enforced',{vectorEffect:'non-scaling-stroke'}); // Debug: scatter trend stroke scaling guard
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
      scheduleDrawScatter = Shared.debounceFrame(drawScatter);
      console.debug('Debug: scatter scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    
    
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
            showFrame:scatterShowFrame.checked,
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
            scatterShowFrame.checked=!!c.showFrame;
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
