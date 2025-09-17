(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const pca = Components.pca = Components.pca || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  pca.__installed = true;
  pca.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: pca component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: pca component awaiting Shared.tableImport helpers');
  }

  const NS='http://www.w3.org/2000/svg';
  const DEFAULT_ROWS=100;
  const DEFAULT_COLS=5;

  let scheduleDrawPca = () => {};

  function setup(){
    if(pca.ready){ console.debug('Debug: Components.pca.setup skipped'); return; }
    console.debug('Debug: Components.pca.setup start');
    const $ = global.$;
    const document = global.document;
    const Handsontable = global.Handsontable;
    if(!Handsontable){
      console.error('Handsontable missing for PCA component');
      return;
    }
    const ResizeObserverCtor = global.ResizeObserver;
    const attachPicker = (el)=>{ if (typeof global.attachColorPickerNear === 'function') { global.attachColorPickerNear(el); } };
    const serializeSvg = (svgEl)=>{
      if (typeof global.serializeCleanSVG === 'function') return global.serializeCleanSVG(svgEl);
      const clone = svgEl.cloneNode(true);
      if(clone.querySelectorAll){
        clone.querySelectorAll('[contenteditable],[contentEditable]').forEach(el=>{ el.removeAttribute('contenteditable'); el.removeAttribute('contentEditable'); });
      }
      return new (global.XMLSerializer||XMLSerializer)().serializeToString(clone);
    };
      // PCA plot setup
      const pcaHotContainer=document.getElementById('pcaHot');
      const pcaHotWrapper=document.getElementById('pcaHotWrapper');
      const pcaTablePanel=document.getElementById('pcaTablePanel');
      const pcaGraphPanel=document.getElementById('pcaGraphPanel');
      const pcaPanelResizer=document.getElementById('pcaPanelResizer');
      const pcaSvgBox=pcaGraphPanel?.querySelector('.svgbox');
      const pcaConfigPanel=pcaGraphPanel?.querySelector('.config-options');
      let pcaMinSvgWidth=0;
      const syncPcaWidths=()=>{
        Shared.syncPanelWidths(pcaTablePanel, pcaGraphPanel, pcaConfigPanel, null, {
          svgBox: pcaSvgBox,
          minSvgWidth: pcaMinSvgWidth,
          debugLabel: 'pca',
          skipSchedule: true
        });
      };
      const pcaTableObserver = ResizeObserverCtor ? new ResizeObserverCtor(()=>{syncPcaWidths();}) : null;
      if(pcaTableObserver) pcaTableObserver.observe(pcaTablePanel);
      syncPcaWidths();
      if(Shared && Shared.ensureHotWrapperStyles){ Shared.ensureHotWrapperStyles(pcaHotWrapper); }
      console.debug('pcaHotWrapper style updated', pcaHotWrapper.style.cssText);
      const pcaData=Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,DEFAULT_COLS);
      pcaData[0]=['Label','Var1','Var2','Var3','Var4'];
      const pcaHot=new Handsontable(pcaHotContainer,{
        data:pcaData,
        rowHeaders(index){const label=index===0?'':index; console.debug('pca rowHeader',{index,label}); return label;},
        colHeaders:true,
        minRows:DEFAULT_ROWS,
        minCols:DEFAULT_COLS,
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
      const pcaImportBtn=document.getElementById('pcaImport');
      const pcaFileInput=document.getElementById('pcaFile');
      const tableImport = Shared.tableImport;
      pcaImportBtn.addEventListener('click',()=>{pcaFileInput.value=''; pcaFileInput.click();});
      pcaFileInput.addEventListener('change',()=>{
        if(!tableImport || typeof tableImport.openFile !== 'function'){
          console.warn('pca import skipped: Shared.tableImport.openFile unavailable');
          return;
        }
        tableImport.openFile(pcaFileInput, {
          hot: pcaHot,
          minCols: DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: scheduleDrawPca,
          debugLabel: 'pca',
          onProcessed: info => console.log('pca data imported',{rows: info?.rows, cols: info?.cols})
        });
      });
      if(tableImport && typeof tableImport.handlePaste === 'function'){
        pcaHotContainer.addEventListener('paste',async e=>{
          await tableImport.handlePaste(e, pcaHot, {
            minCols: DEFAULT_COLS,
            minRows: DEFAULT_ROWS,
            scheduleDraw: scheduleDrawPca,
            debugLabel: 'pca',
            onBeforeProcess: meta => console.log('pca fast paste',{rows: meta.rowCount, cols: meta.colCount, startRow: meta.startRow, startCol: meta.startCol}),
            onProcessed: info => console.log('pca data imported',{rows: info?.rows, cols: info?.cols})
          });
        });
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
          const input=document.createElement('input'); input.type='color'; input.value=pcaLabelColors[lab]; attachPicker(input);
          input.addEventListener('input',e=>{ pcaLabelColors[lab]=e.target.value; console.log('pca label color changed',{label:lab,color:pcaLabelColors[lab]}); scheduleDrawPca(); });
          const lbl=document.createElement('label'); lbl.textContent=lab+' '; lbl.appendChild(input); pcaLabelColorsDiv.appendChild(lbl); });
        console.log('updatePcaLabelColorPickers',pcaLabelColors);
      }
      const pcaPlotDiv=document.getElementById('pcaPlot');
      pcaPlotDiv.style.background='none';
      global.DEBUG_PCA=true;
      if(global.DEBUG_PCA) console.log('pcaPlot background set to transparent');
      const pcaContainer=pcaPlotDiv.closest('.svgbox')||pcaPlotDiv.parentElement;
      (function initPcaResizers(){
        if(!pcaContainer) return;
        if(Shared && Shared.attachResizableBox){
          Shared.attachResizableBox(pcaContainer, {
            defaultWidth: 640,
            defaultHeight: 420,
            onResize: phase => {
              console.debug('Debug: pca svgbox resized', { phase }); // Debug: pca svgbox resize callback
              syncPcaWidths();
              scheduleDrawPca();
            }
          });
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
    async function drawPca(){
      const debugStamp = Date.now();
      console.log('drawPca called', {debugStamp}); // Debug: draw invocation marker

      const SVDLib = global.SVDJS;
      const jStatLib = global.jStat;

      if (!SVDLib || !SVDLib.SVD || !jStatLib) {
        console.error('PCA dependencies missing');
        if (pcaPlotDiv) {
          pcaPlotDiv.innerHTML = '<i>PCA dependencies missing.</i>';
        }
        if (pcaStatsResults) {
          pcaStatsResults.textContent = '';
        }
        return;
      }

      const fill = pcaFill.value;
      const alpha = Number(pcaAlpha.value) || 0;
      const borderWidth = Number(pcaBorderWidth.value);
      const borderColor = pcaBorder.value;
      const bw = borderWidth;
      const fs = Number(pcaFontSize.value);
      const showGrid = pcaShowGrid.checked;
      const dotSize = Number(pcaDotSize.value) || 3;
      const xMinManual = parseFloat(pcaXMin.value);
      const xMaxManual = parseFloat(pcaXMax.value);
      const yMinManual = parseFloat(pcaYMin.value);
      const yMaxManual = parseFloat(pcaYMax.value);
      const scaleVars = pcaScale.checked;

      console.log('pca manual range', {
        xMinManual,
        xMaxManual,
        yMinManual,
        yMaxManual,
        scaleVars,
      });

      const data = pcaHot.getData();
      const labels = [];
      const matrix = [];

      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        if (!row) continue;

        const lab = row[0] ? String(row[0]).trim() : '';
        const vals = [];

        for (let c = 1; c < row.length; c++) {
          const v = parseFloat(row[c]);
          if (isNaN(v)) {
            vals.length = 0;
            break;
          }
          vals.push(v);
        }

        if (vals.length) {
          labels.push(lab);
          matrix.push(vals);
        }
      }

      console.log('pca collected', {
        rows: matrix.length,
        cols: matrix[0]?.length,
      });

      if (matrix.length < 2 || matrix[0].length < 2) {
        pcaPlotDiv.innerHTML = '<i>At least two samples and two variables required.</i>';
        pcaStatsResults.textContent = '';
        return;
      }

      const nSamples = matrix.length;
      const nFeatures = matrix[0].length;

      for (let j = 0; j < nFeatures; j++) {
        const col = matrix.map((r) => r[j]);
        const mean = jStatLib.mean(col);
        const sd = jStatLib.stdev(col, true);

        for (let i = 0; i < nSamples; i++) {
          let val = matrix[i][j] - mean;
          if (scaleVars && sd > 0) {
            val /= sd;
          }
          matrix[i][j] = val;
        }
      }

      if (!SVDLib || !SVDLib.SVD) {
        console.error('SVDLib missing');
        pcaPlotDiv.innerHTML = '<i>PCA library not loaded.</i>';
        return;
      }

      const svd = SVDLib.SVD(matrix);
      console.debug('pca svd result', svd);

      const scores = [];
      for (let i = 0; i < nSamples; i++) {
        scores[i] = [];
        for (let k = 0; k < svd.q.length; k++) {
          scores[i][k] = svd.u[i][k] * svd.q[k];
        }
      }
      console.debug('pca scores', scores);

      const variances = svd.q.map((s) => (s * s) / (nSamples - 1));
      const totalVar = variances.reduce((a, b) => a + b, 0);
      const pc1Pct = (variances[0] / totalVar) * 100;
      const pc2Pct = (variances[1] / totalVar) * 100;

      pcaXLabelText = `PC1 (${pc1Pct.toFixed(1)}%)`;
      pcaYLabelText = `PC2 (${pc2Pct.toFixed(1)}%)`;

      const points = scores.map((s, i) => ({
        x: s[0],
        y: s[1],
        label: labels[i],
      }));
      const labelSet = new Set(labels.filter((l) => l));
      updatePcaLabelColorPickers(Array.from(labelSet));

      let xMinRaw = Infinity;
      let xMaxRaw = -Infinity;
      let yMinRaw = Infinity;
      let yMaxRaw = -Infinity;

      points.forEach((p) => {
        if (p.x < xMinRaw) xMinRaw = p.x;
        if (p.x > xMaxRaw) xMaxRaw = p.x;
        if (p.y < yMinRaw) yMinRaw = p.y;
        if (p.y > yMaxRaw) yMaxRaw = p.y;
      });

      const legendLabels = Array.from(labelSet);
      const legendWidth = legendLabels.length ? 120 : 0;

      const plotEl = document.getElementById('pcaPlot');
      plotEl.style.display = 'block';
      while (plotEl.firstChild) {
        plotEl.removeChild(plotEl.firstChild);
      }

      document.getElementById('pcaStatsResults').innerHTML =
        `PC1: ${pc1Pct.toFixed(1)}% variance<br>PC2: ${pc2Pct.toFixed(1)}% variance`;

      if (!points.length) {
        return;
      }

      let xMin = xMinRaw;
      let xMax = xMaxRaw;
      let yMin = yMinRaw;
      let yMax = yMaxRaw;

      if (isFinite(xMinManual)) xMin = xMinManual;
      if (isFinite(xMaxManual)) xMax = xMaxManual;
      if (isFinite(yMinManual)) yMin = yMinManual;
      if (isFinite(yMaxManual)) yMax = yMaxManual;

      if (xMin === xMax) xMax = xMin + 1;
      if (yMin === yMax) yMax = yMin + 1;

      console.log('pca final raw range', {xMin, xMax, yMin, yMax});

      const W = Math.max(50, Math.floor(plotEl.clientWidth || 50));
      const H = Math.max(40, Math.floor(plotEl.clientHeight || 40));

      plotEl.style.position = 'relative';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'pcaSvg');
      svg.setAttribute('width', String(W));
      svg.setAttribute('height', String(H));
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
      chartStyle.applySvgDefaults(svg);
      plotEl.appendChild(svg);

      function niceNum(range, round) {
        const exp = Math.floor(Math.log10(range));
        const f = range / Math.pow(10, exp);
        let nf;
        if (round) {
          if (f < 1.5) nf = 1;
          else if (f < 3) nf = 2;
          else if (f < 7) nf = 5;
          else nf = 10;
        } else {
          if (f <= 1) nf = 1;
          else if (f <= 2) nf = 2;
          else if (f <= 5) nf = 5;
          else nf = 10;
        }
        return nf * Math.pow(10, exp);
      }

      function niceScale(min, max, maxTicks) {
        const range = niceNum(max - min, false);
        const step = niceNum(range / (maxTicks - 1), true);
        const graphMin = Math.floor(min / step) * step;
        const graphMax = Math.ceil(max / step) * step;
        const ticks = [];
        for (let v = graphMin; v <= graphMax + 1e-9; v += step) {
          ticks.push(v);
        }
        return {min: graphMin, max: graphMax, ticks, step};
      }

      const xScale = niceScale(xMin, xMax, 6);
      const yScale = niceScale(yMin, yMax, 6);

      if (isFinite(xMinManual)) xScale.min = xMin;
      if (isFinite(xMaxManual)) xScale.max = xMax;
      if (isFinite(yMinManual)) yScale.min = yMin;
      if (isFinite(yMaxManual)) yScale.max = yMax;

      const formatTick = value => value.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});
      const tickFont = chartStyle.makeFont(fs);
      const xTickLabels = xScale.ticks.map(t => formatTick(t));
      const yTickLabels = yScale.ticks.map(t => formatTick(t));
      const yLabelWidths = yTickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
      const maxYLabelWidth = Math.max(...yLabelWidths, 0);
      const axisLabelFontSize = fs + 4;
      const axisLabelFont = chartStyle.makeFont(axisLabelFontSize);
      const yTitleWidth = chartStyle.measureText(pcaYLabelText, axisLabelFont);
      let margin = chartStyle.computeBaseMargins({fontSize: fs, legendWidth, maxYLabelWidth, yTitleWidth});
      let plotW = Math.max(20, W - margin.left - margin.right);
      let plotH = Math.max(20, H - margin.top - margin.bottom);
      const bottomLayout = chartStyle.computeBottomLayout({labels: xTickLabels, fontSize: fs, plotWidth: plotW, baseBottom: margin.bottom});
      margin.bottom = bottomLayout.bottom;
      plotW = Math.max(20, W - margin.left - margin.right);
      plotH = Math.max(20, H - margin.top - margin.bottom);
      const square = chartStyle.ensureSquarePlot(W, H, margin);
      margin = square.margin;
      plotW = square.plotW;
      plotH = square.plotH;
      console.debug('Debug: pca layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate});
      const x2px = value => margin.left + ((value - xScale.min) * plotW) / (xScale.max - xScale.min);
      const y2px = value => margin.top + plotH - ((value - yScale.min) * plotH) / (yScale.max - yScale.min);

      const add = (tag, attrs, text) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) {
          el.setAttribute(k, String(attrs[k]));
        }
        if (text) {
          el.textContent = text;
        }
        svg.appendChild(el);
        return el;
      };

      add('rect', {x: 0, y: 0, width: W, height: H, fill: '#fff'});

      if (showGrid) {
        xScale.ticks.forEach((t) => {
          const x = x2px(t);
          add('line', {x1: x, y1: margin.top, x2: x, y2: margin.top + plotH, stroke: '#eee'});
        });
        yScale.ticks.forEach((t) => {
          const y = y2px(t);
          add('line', {x1: margin.left, y1: y, x2: margin.left + plotW, y2: y, stroke: '#eee'});
        });
      }

      add('line', {x1: margin.left, y1: margin.top, x2: margin.left, y2: margin.top + plotH, stroke: '#000'});
      add('line', {x1: margin.left, y1: margin.top + plotH, x2: margin.left + plotW, y2: margin.top + plotH, stroke: '#000'});

      const xTickNodes = [];
      xScale.ticks.forEach((t) => {
        const x = x2px(t);
        add('line', {x1: x, y1: margin.top + plotH, x2: x, y2: margin.top + plotH + 6, stroke: '#000'});
        const txt = add('text', {
          x,
          y: margin.top + plotH + fs,
          'font-size': fs,
          'text-anchor': 'middle',
          'dominant-baseline': 'hanging',
          fill: chartStyle.TEXT_COLOR,
        }, formatTick(t));
        xTickNodes.push(txt);
      });
      chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});

      yScale.ticks.forEach((t) => {
        const y = y2px(t);
        add('line', {x1: margin.left - 6, y1: y, x2: margin.left, y2: y, stroke: '#000'});
        add('text', {
          x: margin.left - 8,
          y,
          'font-size': fs,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          fill: chartStyle.TEXT_COLOR,
        }, formatTick(t));
      });

      add('text', {
        x: margin.left + plotW / 2,
        y: margin.top + plotH + axisLabelFontSize + 6,
        'font-size': axisLabelFontSize,
        'font-weight': '600',
        'text-anchor': 'middle',
        fill: chartStyle.TEXT_COLOR,
      }, pcaXLabelText);

      const yLabelX = margin.left - (maxYLabelWidth + fs * 1.6);
      add('text', {
        x: yLabelX,
        y: margin.top + plotH / 2,
        'font-size': axisLabelFontSize,
        'font-weight': '600',
        'text-anchor': 'middle',
        transform: `rotate(-90 ${yLabelX} ${margin.top + plotH / 2})`,
        fill: chartStyle.TEXT_COLOR,
      }, pcaYLabelText);

      points.forEach((pt) => {
        const cx = x2px(pt.x);
        const cy = y2px(pt.y);
        const color = pt.label ? (pcaLabelColors[pt.label] || DEFAULT_SCATTER_COLORS[0]) : fill;
        add('circle', {
          cx,
          cy,
          r: dotSize,
          fill: color,
          stroke: alpha > 0 ? borderColor : 'none',
          'stroke-width': bw,
          opacity: 1 - alpha,
        });
      });

      legendLabels.forEach((lab, i) => {
        const y = margin.top + i * (fs + 6);
        const color = pcaLabelColors[lab] || DEFAULT_SCATTER_COLORS[i % DEFAULT_SCATTER_COLORS.length];
        add('rect', {x: W - legendWidth + 10, y, width: 12, height: 12, fill: color});
        add('text', {
          x: W - legendWidth + 28,
          y: y + fs - 3,
          'font-size': fs,
          fill: chartStyle.TEXT_COLOR,
        }, lab);
      });

      console.debug('pca render complete', {
        pointCount: points.length,
        width: W,
        height: H,
      });
    }
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
      async function savePcaFile(){
        console.debug('Debug: savePcaFile invoked', { hasHandle: !!pcaFileHandle });
        if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
          console.error('savePcaFile missing fileIO.saveGraphFile');
          return;
        }
        const result = await fileIO.saveGraphFile({
          context: 'pca',
          fileHandle: pcaFileHandle,
          getPayload: getPcaGraphPayload,
          fileName: pcaFileName,
          downloadFileName: pcaFileName,
          setFileHandle: handle => { pcaFileHandle = handle; },
          setFileName: name => { pcaFileName = name; }
        });
        console.debug('Debug: savePcaFile result', result);
      }
      async function saveAsPcaFile(){
        console.debug('Debug: saveAsPcaFile invoked', { currentName: pcaFileName });
        if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
          console.error('saveAsPcaFile missing fileIO.saveGraphFileAs');
          return;
        }
        const result = await fileIO.saveGraphFileAs({
          context: 'pca',
          getPayload: getPcaGraphPayload,
          fileName: pcaFileName,
          downloadFileName: pcaFileName,
          setFileHandle: handle => { pcaFileHandle = handle; },
          setFileName: name => { pcaFileName = name; }
        });
        console.debug('Debug: saveAsPcaFile result', result);
      }
      async function openPcaFile(){
        console.debug('Debug: openPcaFile invoked');
        if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
          console.error('openPcaFile missing fileIO.openGraphFile');
          return;
        }
        const result = await fileIO.openGraphFile({
          context: 'pca',
          setFileHandle: handle => { pcaFileHandle = handle; },
          setFileName: name => { pcaFileName = name; },
          loadFromFile: file => loadPcaGraphFile(file),
          triggerInput: () => {
            const input = document.getElementById('pcaGraphFile');
            if(input){
              input.value='';
              input.click();
            }
          }
        });
        console.debug('Debug: openPcaFile result', result);
      }
      function loadPcaGraphFile(file){ const reader=new FileReader(); reader.onload=e=>{ try{ const obj=JSON.parse(e.target.result); console.log('loadPcaGraph',obj); if(obj.type!=='pca') throw new Error('Invalid graph type'); pcaHot.loadData(obj.data||[]); const c=obj.config||{}; pcaDotSize.value=c.dotSize||pcaDotSize.value; pcaFill.value=c.fill||pcaFill.value; pcaBorder.value=c.border||pcaBorder.value; pcaBorderWidth.value=c.borderWidth||pcaBorderWidth.value; pcaMethod.value=c.method||'pca'; pcaAlpha.value=c.alpha||0; pcaAlphaVal.textContent=pcaAlpha.value; pcaLabelColors=c.labelColors||{}; pcaShowGrid.checked=!!c.showGrid; pcaXMin.value=c.xMin||''; pcaXMax.value=c.xMax||''; pcaYMin.value=c.yMin||''; pcaYMax.value=c.yMax||''; pcaScale.checked=!!c.scale; pcaFontSize.value=c.fontSize||pcaFontSize.value; pcaFontSizeVal.textContent=pcaFontSize.value; scheduleDrawPca(); }catch(err){console.error('loadPcaGraph error',err);} }; reader.readAsText(file); }
      document.getElementById('pcaPNG').addEventListener('click',async()=>{ const svgEl=document.getElementById('pcaSvg'); if(!svgEl) return; console.log('pcaPNG export start'); const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800; const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400; const xml=serializeSvg(svgEl); const img=new Image(); const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml); img.src=url; await img.decode().catch(err=>{console.error('pcaPNG svg decode',err);}); const outCanvas=document.createElement('canvas'); outCanvas.width=W; outCanvas.height=H; const ctx=outCanvas.getContext('2d'); ctx.drawImage(img,0,0); outCanvas.toBlob(b=>{ const pngUrl=URL.createObjectURL(b); const a=document.createElement('a'); a.href=pngUrl; a.download='pca.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(pngUrl),4000); },'image/png'); });
      document.getElementById('pcaSVG').addEventListener('click',()=>{ const svgEl=document.getElementById('pcaSvg'); if(!svgEl) return; console.log('pcaSVG export start'); const xml=serializeSvg(svgEl); const blob=new Blob([xml],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pca.svg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000); });
      document.getElementById('openPca').addEventListener('click',openPcaFile);
      document.getElementById('savePca').addEventListener('click',savePcaFile);
      document.getElementById('saveAsPca').addEventListener('click',saveAsPcaFile);
      document.getElementById('pcaGraphFile').addEventListener('change',e=>{ const f=e.target.files[0]; if(f){ pcaFileName=f.name; pcaFileHandle=null; loadPcaGraphFile(f); } });
    
    scheduleDrawPca = Shared.debounceFrame(drawPca);
    console.debug('Debug: pca scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    pca.save = savePcaFile;
    pca.saveAs = saveAsPcaFile;
    pca.open = openPcaFile;
    pca.loadFromFile = loadPcaGraphFile;
    pca.getPayload = getPcaGraphPayload;
    pca.serialize = serializeSvg;
    pca.ready = true;
    console.debug('Debug: Components.pca.setup complete');
  }

  function ensureReady(){ if(!pca.ready) setup(); }

  pca.init = setup;
  pca.ensure = ensureReady;
  pca.draw = function draw(){ ensureReady(); scheduleDrawPca && scheduleDrawPca(); };

})(window);
