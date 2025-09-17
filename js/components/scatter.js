(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const scatter = Components.scatter = Components.scatter || {};
  scatter.__installed = true;
  scatter.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: scatter component awaiting Shared.fileIO helpers');
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
    const makeEditableLocal = global.makeEditable || ((el,onChange)=>{
      if(!el) return;
      el.style.cursor='pointer';
      el.addEventListener('dblclick',()=>{
        const promptFn = global.prompt || prompt;
        const txt = promptFn ? promptFn('Edit text', el.textContent) : null;
        if(txt!==null){
          el.textContent = txt;
          if(typeof onChange === 'function') onChange(txt);
        }
      });
    });
    const attachPicker = (el)=>{ if (typeof global.attachColorPickerNear === 'function') { global.attachColorPickerNear(el); } };
    const serializeSvg = (svgEl)=>{
      if (typeof global.serializeCleanSVG === 'function') return global.serializeCleanSVG(svgEl);
      const clone = svgEl.cloneNode(true);
      if(clone.querySelectorAll){
        clone.querySelectorAll('[contenteditable],[contentEditable]').forEach(el=>{ el.removeAttribute('contenteditable'); el.removeAttribute('contentEditable'); });
      }
      return new (global.XMLSerializer||XMLSerializer)().serializeToString(clone);
    };
    const clipboardAPI = global.navigator && global.navigator.clipboard;
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
          skipSchedule: true
        });
      };
      const scatterTableObserver = ResizeObserverCtor ? new ResizeObserverCtor(()=>{syncScatterPanels();}) : null;
      if(scatterTableObserver) scatterTableObserver.observe(scatterTablePanel);
      syncScatterPanels();
    
      if(global.Shared && global.Shared.ensureHotWrapperStyles){ global.Shared.ensureHotWrapperStyles(scatterHotWrapper); }
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
              if(!global.XLSX){
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
          if(clipboardAPI && clipboardAPI.readText){
            try{
              text=await clipboardAPI.readText();
              console.log('scatter clipboard fallback used');
            }catch(err){
              console.log('scatter clipboard read failed',err);
              return;
            }
          }else{
            console.log('scatter clipboard read unavailable');
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
        if(ResizeObserverCtor){
          const scatterResizeObserver=new ResizeObserverCtor(()=>{console.log('scatter resize observer triggered'); scheduleDrawScatter();});
          scatterResizeObserver.observe(scatterContainer);
        }
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
        const xText=add('text',{x:margin.left+plotW/2,y:H-6,'text-anchor':'middle','font-size':fs+4});xText.textContent=scatterXLabelText;makeEditableLocal(xText,txt=>{scatterXLabelText=txt;});
        const yX=margin.left-(maxYLabelWidth+fs*0.5);
        console.log('scatter y-axis position',yX);
        const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs+4});
        yText.textContent=scatterYLabelText;makeEditableLocal(yText,txt=>{scatterYLabelText=txt;});
        const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs+4});titleText.textContent=scatterTitleText;makeEditableLocal(titleText,txt=>{scatterTitleText=txt;});
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
        const xml=serializeSvg(svgEl);
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
        const xml=serializeSvg(svgEl);
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
