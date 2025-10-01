(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const scatter = Components.scatter = Components.scatter || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
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
  const DEFAULT_COLS=4;
  const SIGNIFICANT_COLOR = '#d62728';
  const DEFAULT_NON_SIG_COLOR = '#808080';
  const GRAPH_TYPE_DEFAULTS = {
    scatter: { title: 'Scatter plot' },
    volcano: { title: 'Volcano plot' },
    ma: { title: 'MA plot' }
  };

  let scheduleDrawScatter=null;
  let scatterCurrentGraphType='scatter';
  let scatterLastGraphType='scatter';

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
    const renderStatsCard=(target,model)=>{
      if(!target) return;
      const hasRenderer=Shared.statsTable && typeof Shared.statsTable.render==='function';
      if(hasRenderer){
        Shared.statsTable.render({ target, ...model });
        console.debug('Debug: scatter renderStatsCard shared',{ caption:model.caption || null, rows:model.rows?.length || 0 });
        return;
      }
      target.innerHTML='';
      if(model.caption){
        const lead=document.createElement('div');
        lead.className='stats-table-lead';
        lead.textContent=model.caption;
        target.appendChild(lead);
      }
      const table=document.createElement('table');
      const thead=document.createElement('thead');
      const headRow=document.createElement('tr');
      (model.columns||[]).forEach(col=>{
        const th=document.createElement('th');
        th.textContent=col.label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody=document.createElement('tbody');
      (model.rows||[]).forEach(row=>{
        const tr=document.createElement('tr');
        (model.columns||[]).forEach(col=>{
          const td=document.createElement('td');
          const value=row?.[col.key];
          td.textContent=value ?? '';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      target.appendChild(table);
      console.debug('Debug: scatter renderStatsCard fallback',{ caption:model.caption || null, rows:model.rows?.length || 0 });
    };
    console.debug('Debug: scatter component DOM helpers resolved', {
      hasSharedEditable: typeof Shared.makeEditable === 'function',
      hasSharedResize: typeof Shared.autoResizeSvg === 'function',
      hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
    }); // Debug: helper availability summary
    const markFontEditable = (node, role, key) => {
      if (!node) { return; }
      const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
      if (fontControls && typeof fontControls.markText === 'function') {
        fontControls.markText(node, { scopeId: 'scatter', role, key });
      } else if (node.dataset) {
        node.dataset.fontEditable = '1';
        node.dataset.fontScope = 'scatter';
        if (role) node.dataset.fontRole = role;
        if (key || role) node.dataset.fontKey = key || role;
      }
      if (!role || role.indexOf('Tick') === -1) {
        console.debug('Debug: scatter markFontEditable', payload); // Debug: font target tagging summary
      }
    };
    let scatterDrawToken=0;
      // Scatter plot setup
      const scatterHotContainer=document.getElementById('scatterHot');
      const scatterHotWrapper=document.getElementById('scatterHotWrapper');
      const scatterTablePanel=document.getElementById('scatterTablePanel');
      const scatterGraphPanel=document.getElementById('scatterGraphPanel');
      const scatterPanelResizer=document.getElementById('scatterPanelResizer');
      let scatterSvgBox=scatterGraphPanel?.querySelector('.svgbox');
      const scatterConfigPanel=scatterGraphPanel?.querySelector('.config-options');
      const scatterLayout = Shared.componentLayout?.createStandardPanels({
        componentName: 'scatter',
        selectors: {
          tablePanel: '#scatterTablePanel',
          graphPanel: '#scatterGraphPanel',
          panelResizer: '#scatterPanelResizer',
          hotWrapper: '#scatterHotWrapper',
          hotContainer: '#scatterHot',
          svgBox: () => scatterGraphPanel?.querySelector('.svgbox'),
          resizeTarget: () => scatterGraphPanel?.querySelector('.svgbox')
        },
        scheduleDraw: () => scheduleDrawScatter(),
        resizableBoxOptions: {
          onResize: () => {
            console.debug('Debug: scatter layout onResize schedule trigger');
            scheduleDrawScatter();
          }
        }
      });
      if(scatterLayout?.elements?.svgBox){
        scatterSvgBox = scatterLayout.elements.svgBox;
      }
      scatterLayout?.setScheduleDraw?.(() => scheduleDrawScatter());
      scatterLayout?.syncPanels?.();
      console.debug('Debug: scatter initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
      if(typeof Shared.hot?.createStandardTable !== 'function'){
        console.error('scatter initHot missing Shared.hot.createStandardTable');
        return;
      }
      const data = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
      let scatterScheduleProxyCount = 0;
      const scheduleDrawScatterProxy = () => {
        scatterScheduleProxyCount += 1;
        if(scatterScheduleProxyCount <= 5){
          console.debug('Debug: scatter scheduleDraw proxy invoked', { count: scatterScheduleProxyCount }); // Debug: table change trigger
          if(scatterScheduleProxyCount === 5){
            console.debug('Debug: scatter scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
          }
        }
        scheduleDrawScatter();
      };

      const scatterHot=Shared.hot.createStandardTable(scatterHotContainer,{ rows: DEFAULT_ROWS, cols: DEFAULT_COLS },scheduleDrawScatterProxy,{
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
      const scatterExamples={
        scatter:[
          ['Label','X Value','Y Value',''],
          ['Cat',4.5,23,''],
          ['Dog',20,45,''],
          ['Rabbit',2.5,35,''],
          ['Cat',5,25,''],
          ['Dog',22,50,''],
          ['Rabbit',3,40,''],
          ['Cat',4.8,24,''],
          ['Dog',24,55,'']
        ],
        volcano:[
          ['Gene','log2FoldChange','pValue',''],
          ['GeneA',1.6,0.0005,''],
          ['GeneB',-1.2,0.002,''],
          ['GeneC',0.2,0.8,''],
          ['GeneD',-2.1,0.0001,''],
          ['GeneE',0.5,0.4,''],
          ['GeneF',1.1,0.03,''],
          ['GeneG',-1.8,0.0008,'']
        ],
        ma:[
          ['Gene','MeanExpression','log2FoldChange','pValue'],
          ['GeneA',8.5,1.4,0.0005],
          ['GeneB',5.3,-1.1,0.002],
          ['GeneC',3.9,0.1,0.4],
          ['GeneD',9.2,-2.0,0.00005],
          ['GeneE',6.1,0.3,0.2],
          ['GeneF',7.4,1.2,0.015],
          ['GeneG',4.8,-1.5,0.0009],
          ['GeneH',2.7,0.0,0.9]
        ]
      };
      if(global.DEBUG_SCATTER) console.log('scatter example dataset map', scatterExamples);
      document.getElementById('scatterLoadExample').addEventListener('click',()=>{
        const type=scatterGraphTypeSelect?.value || 'scatter';
        const dataset=scatterExamples[type] || scatterExamples.scatter;
        scatterHot.loadData(dataset);
        if(type!=='scatter' && scatterFill && scatterFill.value && scatterFill.value.toLowerCase()==='#377eb8'){
          scatterFill.value=DEFAULT_NON_SIG_COLOR;
        }
        console.log('scatter example loaded',{type,rows:dataset.length});
        syncScatterGraphTypeUI();
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
          minCols: 4,
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
              minCols: 4,
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
    
      const scatterGraphTypeSelect=$('#scatterGraphType');
      const scatterThresholdControls=$('#scatterThresholdControls');
      const scatterLog2FCThreshold=$('#scatterLog2FCThreshold');
      const scatterNegLogPThreshold=$('#scatterNegLogPThreshold');
      const scatterFill=$('#scatterFill'), scatterBorder=$('#scatterBorder'), scatterBorderWidth=$('#scatterBorderWidth'), scatterDotSize=$('#scatterDotSize'), scatterShowLine=$('#scatterShowLine'), scatterAlpha=$('#scatterAlpha');
      const scatterAlphaVal=$('#scatterAlphaVal');
      const scatterFontSize=$('#scatterFontSize'), scatterFontSizeVal=$('#scatterFontSizeVal');
      if(scatterFontSize?.dataset){
        scatterFontSize.dataset.fontBasePt = String(scatterFontSize.value);
        console.debug('Debug: scatter font size base initialized',{ value: scatterFontSize.value }); // Debug: initial base
      }
      chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value), input: scatterFontSize, manual: true });
      const scatterShowGrid=$('#scatterShowGrid'), scatterShowFrame=$('#scatterShowFrame'), scatterLogX=$('#scatterLogX'), scatterLogY=$('#scatterLogY');
      const scatterXMin=$('#scatterXMin'), scatterXMax=$('#scatterXMax'), scatterYMin=$('#scatterYMin'), scatterYMax=$('#scatterYMax');
      const scatterOriginMode=$('#scatterOriginMode'), scatterOriginX=$('#scatterOriginX'), scatterOriginY=$('#scatterOriginY');
      const scatterStatType=$('#scatterStatType');
      const scatterLabelColorsDiv=$('#scatterLabelColors');
      const scatterLabelColorsFieldset=$('#scatterLabelColorsFieldset');
      let scatterLabelColors={};
      function syncScatterGraphTypeUI(){
        const type=scatterGraphTypeSelect?.value || 'scatter';
        scatterCurrentGraphType=type;
        const showThresholds=type!=='scatter';
        if(scatterThresholdControls){
          scatterThresholdControls.style.display=showThresholds?'':'none';
        }
        [scatterLogX,scatterLogY].forEach(el=>{
          if(!el) return;
          el.disabled=type!=='scatter';
          if(type!=='scatter' && el.checked){
            el.checked=false;
          }
        });
        if(scatterStatType){
          scatterStatType.disabled=type!=='scatter';
        }
        if(scatterShowLine){
          scatterShowLine.disabled=type!=='scatter';
          if(type!=='scatter' && scatterShowLine.checked){
            scatterShowLine.checked=false;
          }
        }
        if(type!=='scatter' && scatterFill && scatterFill.value && scatterFill.value.toLowerCase()==='#377eb8'){
          scatterFill.value=DEFAULT_NON_SIG_COLOR;
        }
        if(type!==scatterLastGraphType){
          const defaults=GRAPH_TYPE_DEFAULTS[type];
          if(defaults && defaults.title){
            scatterTitleText=defaults.title;
          }
          scatterLastGraphType=type;
        }
        if(type!=='scatter' && scatterLabelColorsFieldset){
          scatterLabelColorsFieldset.style.display='none';
        }
        console.debug('Debug: syncScatterGraphTypeUI complete',{type,showThresholds});
      }
      scatterAlphaVal.textContent=scatterAlpha.value;
      if(scatterGraphTypeSelect){
        scatterGraphTypeSelect.addEventListener('change',()=>{
          console.debug('Debug: scatter graph type change event',{value:scatterGraphTypeSelect.value});
          syncScatterGraphTypeUI();
          scheduleDrawScatter();
        });
      }
      if(scatterLog2FCThreshold){
        scatterLog2FCThreshold.addEventListener('input',()=>{
          console.debug('Debug: scatter log2FC threshold input',{value:scatterLog2FCThreshold.value});
          scheduleDrawScatter();
        });
      }
      if(scatterNegLogPThreshold){
        scatterNegLogPThreshold.addEventListener('input',()=>{
          console.debug('Debug: scatter negLogP threshold input',{value:scatterNegLogPThreshold.value});
          scheduleDrawScatter();
        });
      }
      scatterFill.addEventListener('input',()=>{console.log('scatterFill changed', scatterFill.value); scheduleDrawScatter();});
      scatterBorder.addEventListener('input',()=>{console.log('scatterBorder changed', scatterBorder.value); scheduleDrawScatter();});
      scatterBorderWidth.addEventListener('input',()=>{console.log('scatterBorderWidth changed', scatterBorderWidth.value); scheduleDrawScatter();});
      scatterDotSize.addEventListener('input',()=>{console.log('scatterDotSize changed', scatterDotSize.value); scheduleDrawScatter();});
      scatterAlpha.addEventListener('input',()=>{scatterAlphaVal.textContent=scatterAlpha.value; console.log('scatterAlpha changed',scatterAlpha.value); scheduleDrawScatter();});
      scatterFontSize.addEventListener('input',()=>{
        if(scatterFontSize.dataset){
          scatterFontSize.dataset.fontBasePt = String(scatterFontSize.value);
          console.debug('Debug: scatter font size input manual set',{ value: scatterFontSize.value }); // Debug: manual slider update
        }
        chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value), input: scatterFontSize, manual: true });
        scheduleDrawScatter();
      });
      [scatterShowGrid,scatterLogX,scatterLogY,scatterStatType,scatterOriginMode,scatterShowLine].forEach(el=>el.addEventListener('change',()=>{console.log('scatter config changed', el.id); scheduleDrawScatter();}));
      scatterShowFrame.addEventListener('change',()=>{console.debug('Debug: scatter showFrame change',{checked:scatterShowFrame.checked}); scheduleDrawScatter();});
      [scatterXMin,scatterXMax,scatterYMin,scatterYMax,scatterOriginX,scatterOriginY].forEach(el=>el.addEventListener('input',()=>{console.log('scatter axis input', el.id, el.value); scheduleDrawScatter();}));
      syncScatterGraphTypeUI();

      function updateScatterLabelColorPickers(labels){
        if(scatterCurrentGraphType!=='scatter'){
          scatterLabelColorsDiv.innerHTML='';
          scatterLabelColorsFieldset.style.display='none';
          console.debug('Debug: scatter label colors disabled',{graphType:scatterCurrentGraphType});
          return;
        }
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
      if(!scatterContainer){
        console.debug('Debug: scatter resizer container missing', { hasContainer: !!scatterContainer });
      }

      let scatterTitleText='Scatter plot';
      let scatterXLabelText='X';
      let scatterYLabelText='Y';
      async function drawScatter(){
        const token=++scatterDrawToken; // debug token for cancellation
        console.log('drawScatter called',{token});
        const fill=scatterFill.value||DEFAULT_NON_SIG_COLOR;
        const alpha=Number(scatterAlpha.value)||0;
        const borderWidthRaw=Number(scatterBorderWidth.value);
        const borderColor=scatterBorder.value;
        const containerRect=scatterSvgBox?.getBoundingClientRect?.();
        const fontInfo=chartStyle.resolveScaledFontSize({
          rawSize: scatterFontSize.value,
          width: containerRect?.width,
          height: containerRect?.height,
          svgBox: scatterSvgBox,
          input: scatterFontSize
        });
        const fs=fontInfo.scaledPx;
        const styleScaleInfo=fontInfo.scaleInfo;
        const axisStrokeWidth=chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'scatter-axis', min: 0.5 });
        const dotSizeRaw=Number(scatterDotSize.value)||3;
        const dotSizePx=chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'scatter-point', min: 0 });
        const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'scatter-border', min: 0 });
        console.debug('Debug: scatter style scaling applied',{
          dotSizeRaw,
          dotSizePx,
          borderWidthRaw,
          borderWidthPx,
          axisStrokeWidth,
          styleScale: styleScaleInfo?.styleScale
        }); // Debug: scatter style scaling summary
        chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, fontInfo, input: scatterFontSize });
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
        let showLine=scatterShowLine.checked;
        const graphType=scatterGraphTypeSelect?.value || 'scatter';
        scatterCurrentGraphType=graphType;
        const allowLogAxes=graphType==='scatter';
        if(!allowLogAxes){
          if(scatterLogX?.checked){
            scatterLogX.checked=false;
          }
          if(scatterLogY?.checked){
            scatterLogY.checked=false;
          }
          if(showLine){
            showLine=false;
          }
        }
        const logX=allowLogAxes && scatterLogX ? scatterLogX.checked : false;
        const logY=allowLogAxes && scatterLogY ? scatterLogY.checked : false;
        if(scatterShowLine){
          scatterShowLine.disabled=!allowLogAxes;
          if(!allowLogAxes && scatterShowLine.checked){
            scatterShowLine.checked=false;
          }
        }
        console.debug('Debug: scatter graph type resolved',{graphType,allowLogAxes,logX,logY});
        if(!allowLogAxes){
          console.debug('Debug: scatter forcing trend line off',{graphType});
        }
        console.log('scatter showLine', showLine);
        console.log('drawScatter dot size', dotSizeRaw);
        const log2fcThresholdValue=parseFloat(scatterLog2FCThreshold?.value);
        const negLogPThresholdValue=parseFloat(scatterNegLogPThreshold?.value);
        const log2fcThreshold=Number.isFinite(log2fcThresholdValue)?log2fcThresholdValue:0;
        const negLogPThreshold=Number.isFinite(negLogPThresholdValue)?negLogPThresholdValue:0;
        console.debug('Debug: scatter threshold values',{graphType,log2fcThreshold,negLogPThreshold});
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
        const labelCol=scatterHot.getDataAtCol(0)||[];
        const xCol=scatterHot.getDataAtCol(1)||[];
        const yCol=scatterHot.getDataAtCol(2)||[];
        const extraCol=scatterHot.getDataAtCol(3)||[];
        console.log('scatter column lengths',{label:labelCol.length,x:xCol.length,y:yCol.length,extra:extraCol.length});
        const xLabelRaw=xCol[0];
        const yLabelRaw=yCol[0];
        const extraLabelRaw=extraCol[0];
        if(graphType==='volcano'){
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'log2 Fold Change';
          const basePLabel=(yLabelRaw&&String(yLabelRaw).trim())||'p-value';
          scatterYLabelText=`-log10(${basePLabel})`;
        }else if(graphType==='ma'){
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'Mean Expression';
          scatterYLabelText=(yLabelRaw&&String(yLabelRaw).trim())||'log2 Fold Change';
        }else{
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'X';
          scatterYLabelText=(yLabelRaw&&String(yLabelRaw).trim())||'Y';
        }
        const maxLen=Math.max(labelCol.length,xCol.length,yCol.length,extraCol.length);
        const points=[];
        const labelSet=new Set();
        const labelAnnotations=[];
        let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity;
        let skippedRows=0;
        let significantCount=0;
        let maMissingPCount=0;
        console.time(`scatterCollectPoints_${token}`);
        for(let r=1;r<maxLen;r++){
          const lab=labelCol[r]?String(labelCol[r]).trim():'';
          if(graphType==='scatter'){
            const xv=parseFloat(xCol[r]);
            const yv=parseFloat(yCol[r]);
            if(!Number.isNaN(xv) && !Number.isNaN(yv)){
              points.push({x:xv,y:yv,label:lab});
              if(lab) labelSet.add(lab);
              if(xv<xMinRaw) xMinRaw=xv;
              if(xv>xMaxRaw) xMaxRaw=xv;
              if(yv<yMinRaw) yMinRaw=yv;
              if(yv>yMaxRaw) yMaxRaw=yv;
            }else{
              skippedRows++;
              console.debug('Debug: scatter row skipped',{graphType,row:r,xv,yv});
            }
          }else if(graphType==='volcano'){
            const log2fc=parseFloat(xCol[r]);
            const pRaw=parseFloat(yCol[r]);
            if(Number.isFinite(log2fc) && Number.isFinite(pRaw) && pRaw>0){
              let negLogP=-Math.log10(pRaw);
              if(!Number.isFinite(negLogP)){
                negLogP=-Math.log10(Number.MIN_VALUE);
              }
              const isSignificant=Math.abs(log2fc)>=log2fcThreshold && negLogP>=negLogPThreshold;
              points.push({x:log2fc,y:negLogP,label:lab,isSignificant,meta:{log2fc,pValue:pRaw,negLogP}});
              if(isSignificant) significantCount++;
              if(lab) labelSet.add(lab);
              if(log2fc<xMinRaw) xMinRaw=log2fc;
              if(log2fc>xMaxRaw) xMaxRaw=log2fc;
              if(negLogP<yMinRaw) yMinRaw=negLogP;
              if(negLogP>yMaxRaw) yMaxRaw=negLogP;
            }else{
              skippedRows++;
              console.debug('Debug: volcano row skipped',{row:r,log2fc,pRaw});
            }
          }else{
            const meanExpr=parseFloat(xCol[r]);
            const log2fcVal=parseFloat(yCol[r]);
            const pRaw=parseFloat(extraCol[r]);
            const hasPositiveP=Number.isFinite(pRaw) && pRaw>0;
            if(Number.isFinite(meanExpr) && Number.isFinite(log2fcVal)){
              let negLogP=hasPositiveP?-Math.log10(pRaw):NaN;
              if(hasPositiveP && !Number.isFinite(negLogP)){
                negLogP=-Math.log10(Number.MIN_VALUE);
              }
              const isSignificant=hasPositiveP && Math.abs(log2fcVal)>=log2fcThreshold && Number.isFinite(negLogP) && negLogP>=negLogPThreshold;
              points.push({x:meanExpr,y:log2fcVal,label:lab,isSignificant,meta:{log2fc:log2fcVal,pValue:hasPositiveP?pRaw:NaN,negLogP}});
              if(isSignificant) significantCount++;
              if(!hasPositiveP){
                maMissingPCount++;
                console.debug('Debug: MA missing positive p-value',{row:r,pRaw});
              }
              if(lab) labelSet.add(lab);
              if(meanExpr<xMinRaw) xMinRaw=meanExpr;
              if(meanExpr>xMaxRaw) xMaxRaw=meanExpr;
              if(log2fcVal<yMinRaw) yMinRaw=log2fcVal;
              if(log2fcVal>yMaxRaw) yMaxRaw=log2fcVal;
            }else{
              skippedRows++;
              console.debug('Debug: MA row skipped',{row:r,meanExpr,log2fcVal,pRaw});
            }
          }
          if(r%10000===0){
            console.log('scatter collect progress',{row:r,token});
          }
        }
        console.timeEnd(`scatterCollectPoints_${token}`);
        if(skippedRows>0){
          console.debug('Debug: scatter skipped rows summary',{graphType,skippedRows});
        }
        if(maMissingPCount>0){
          console.debug('Debug: MA missing p-values summary',{count:maMissingPCount});
        }
        const labelsUsed=Array.from(labelSet);
        updateScatterLabelColorPickers(labelsUsed);
        console.log('scatter points collected',points.length,{xMinRaw,xMaxRaw,yMinRaw,yMaxRaw,graphType});
        const legendEntries=[];
        const significanceLegendNeeded=scatterCurrentGraphType!=='scatter';
        if(scatterCurrentGraphType==='scatter'){
          labelsUsed.forEach(labelName=>{
            legendEntries.push({label:labelName,fill:scatterLabelColors[labelName]||fill});
          });
        }else if(significanceLegendNeeded){
          legendEntries.push({label:'Significant',fill:SIGNIFICANT_COLOR});
          legendEntries.push({label:'Not significant',fill});
        }
        const legendRenderer=chartStyle.createLegendRenderer({
          entries:legendEntries,
          fontSize:fs
        });
        const legendGapPx=legendRenderer.entries.length?Math.max(12,Math.round(fs*0.5)):0;
        const legendWidth=legendRenderer.entries.length?legendRenderer.width+legendGapPx:0;
        console.debug('Debug: scatter legend metrics',{legendWidth,legendGapPx,entryCount:legendRenderer.entries.length,graphType:scatterCurrentGraphType});
        if(token!==scatterDrawToken){console.log('scatter draw cancelled after collect',{token});return;}
        const plotEl=document.getElementById('scatterPlot');
        plotEl.style.display='block';
        while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
        document.getElementById('scatterStatsResults').innerHTML='';
        if(!points.length){
          plotEl.innerHTML='<i>No valid data points to plot.</i>';
          console.debug('Debug: scatter plot aborted due to empty dataset',{graphType});
          return;
        }
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
        if(fontControls && typeof fontControls.enableForSvg === 'function'){
          fontControls.enableForSvg(svg,{ scopeId: 'scatter' });
          console.debug('Debug: scatter fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
        } else {
          console.debug('Debug: scatter fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
        }
        const xMinT=logX?Math.log10(xMin):xMin;
        const xMaxT=logX?Math.log10(xMax):xMax;
        const yMinT=logY?Math.log10(yMin):yMin;
        const yMaxT=logY?Math.log10(yMax):yMax;
        function niceNum(range,round){const exp=Math.floor(Math.log10(range));const f=range/Math.pow(10,exp);let nf;if(round){if(f<1.5)nf=1;else if(f<3)nf=2;else if(f<7)nf=5;else nf=10;}else{if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=5)nf=5;else nf=10;}return nf*Math.pow(10,exp);}
        function niceScale(min,max,maxTicks){const range=niceNum(max-min,false);const step=niceNum(range/(Math.max(maxTicks-1,1)),true);const graphMin=Math.floor(min/step)*step;const graphMax=Math.ceil(max/step)*step;const ticks=[];for(let v=graphMin;v<=graphMax+1e-9;v+=step)ticks.push(v);return{min:graphMin,max:graphMax,ticks,step};}
        let xTickTarget=chartStyle.estimateTickCount(W,{axis:'x',fallback:6});
        let yTickTarget=chartStyle.estimateTickCount(H,{axis:'y',fallback:6});
        console.debug('Debug: scatter initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
        function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
        const tickFont=chartStyle.makeFont(fs);
        const axisLabelFont=chartStyle.makeFont(fs);
        const yTitleWidthBase=chartStyle.measureText(scatterYLabelText,axisLabelFont);
        const tickLen=axisMetrics.tickLength;
        const tickGap=axisMetrics.tickLabelGap;
        let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth:0,yTitleWidth:yTitleWidthBase,axisMetrics});
        margin.left=Math.max(margin.left,fs*0.5);
        let plotW=Math.max(20,W-margin.left-margin.right);
        let plotH=Math.max(20,H-margin.top-margin.bottom);
        let bottomLayout=chartStyle.computeBottomLayout({labels:[],fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
        margin.bottom=bottomLayout.bottom;
        plotW=Math.max(20,W-margin.left-margin.right);
        plotH=Math.max(20,H-margin.top-margin.bottom);
        let xScale=niceScale(xMinT,xMaxT,xTickTarget);
        let yScale=niceScale(yMinT,yMaxT,yTickTarget);
        let xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
        let yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
        let maxYLabelWidth=0;
        let maxXLabelWidth=0;
        for(let pass=0;pass<2;pass++){
          xScale=niceScale(xMinT,xMaxT,xTickTarget);
          yScale=niceScale(yMinT,yMaxT,yTickTarget);
          if(isFinite(xMinManual)) xScale.min=xMinT;
          if(isFinite(xMaxManual)) xScale.max=xMaxT;
          if(isFinite(yMinManual)) yScale.min=yMinT;
          if(isFinite(yMaxManual)) yScale.max=yMaxT;
          if(isFinite(xMinManual)||isFinite(xMaxManual)){
            const manualXTicks=[];
            for(let v=Math.ceil(xScale.min/xScale.step)*xScale.step;v<=xScale.max+1e-9;v+=xScale.step){
              manualXTicks.push(v);
            }
            xScale.ticks=manualXTicks;
          }
          if(isFinite(yMinManual)||isFinite(yMaxManual)){
            const manualYTicks=[];
            for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step;v<=yScale.max+1e-9;v+=yScale.step){
              manualYTicks.push(v);
            }
            yScale.ticks=manualYTicks;
          }
          xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
          yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
          const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
          maxYLabelWidth=Math.max(...yLabelWidths,0);
          const xLabelWidths=xTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
          maxXLabelWidth=Math.max(...xLabelWidths,0);
          margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth,yTitleWidth:yTitleWidthBase,axisMetrics});
          margin.left=Math.max(margin.left,maxYLabelWidth+tickLen+tickGap+fs*0.5);
          plotW=Math.max(20,W-margin.left-margin.right);
          plotH=Math.max(20,H-margin.top-margin.bottom);
          bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
          margin.bottom=bottomLayout.bottom;
          plotW=Math.max(20,W-margin.left-margin.right);
          plotH=Math.max(20,H-margin.top-margin.bottom);
          const refinedX=chartStyle.estimateTickCount(plotW,{axis:'x',fallback:xTickTarget});
          const refinedY=chartStyle.estimateTickCount(plotH,{axis:'y',fallback:yTickTarget});
          console.debug('Debug: scatter tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxXLabelWidth,maxYLabelWidth});
          if(refinedX===xTickTarget && refinedY===yTickTarget){
            break;
          }
          xTickTarget=refinedX;
          yTickTarget=refinedY;
        }
        console.debug('Debug: scatter layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate,xTickTarget,yTickTarget,maxXLabelWidth,maxYLabelWidth});
        const aspectData=scatterSvgBox?.dataset;
        const shouldLockAspect=aspectData?.resizerAspectLocked==='true';
        console.debug('Debug: scatter aspect ratio decision',{shouldLockAspect,storedRatio:aspectData?.resizerAspectRatio}); // Debug: scatter aspect toggle decision
        if(shouldLockAspect){
          const square=chartStyle.ensureSquarePlot(W,H,margin);
          margin=square.margin;
          plotW=square.plotW;
          plotH=square.plotH;
          if(aspectData){
            const derivedRatio=plotH>0?plotW/plotH:NaN;
            if(Number.isFinite(derivedRatio)){
              aspectData.resizerAspectRatio=String(derivedRatio);
            }
          }
          console.debug('Debug: scatter layout (locked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: scatter square enforcement branch
        }else{
          console.debug('Debug: scatter layout (unlocked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: scatter free resize branch
        }
        const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
        const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
        function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
        if(showGrid){
          xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':axisStrokeWidth});});
          yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':axisStrokeWidth});});
          console.debug('Debug: scatter grid stroke scaled',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length,axisStrokeWidth});
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
        add('line',{x1:axisXStart,y1:xAxisY,x2:axisXEnd,y2:xAxisY,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
        add('line',{x1:yAxisX,y1:axisYStart,x2:yAxisX,y2:axisYEnd,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
        console.debug('Debug: scatter axes stroke scaled',{axisStrokeWidth});
        if(showFrame){
          console.debug('Debug: scatter frame request',{stroke:axisStroke, showFrame}); // Debug: frame styling inputs
          chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, sides: ['top','right'] });
        }
        // Frame closes scatter plot using axis styling continuity
        const xTickNodes=[];
        let xTickFontCount=0;
        xScale.ticks.forEach((t,i)=>{const x=x2px(t);add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:'#000','stroke-width':axisStrokeWidth});const txt=add('text',{x,y:xAxisY+tickLen+tickGap,'font-size':fs,'text-anchor':'middle','dominant-baseline':'hanging',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logX?Math.pow(10,t):t);markFontEditable(txt,'xTick');xTickFontCount+=1;xTickNodes.push(txt);});
        chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
        let yTickFontCount=0;
        yScale.ticks.forEach((t,i)=>{const y=y2px(t);add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:'#000','stroke-width':axisStrokeWidth});const txt=add('text',{x:yAxisX-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logY?Math.pow(10,t):t);markFontEditable(txt,'yTick');yTickFontCount+=1;});
        console.debug('Debug: scatter font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
        console.debug('Debug: scatter ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
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
          c.setAttribute('r',dotSizePx);
          const color=scatterCurrentGraphType==='scatter'
            ? (scatterLabelColors[p.label]||fill)
            : (p.isSignificant?SIGNIFICANT_COLOR:fill);
          c.setAttribute('fill',color);
          c.setAttribute('fill-opacity',1-alpha);
          if(borderWidthPx>0){c.setAttribute('stroke',borderColor);c.setAttribute('stroke-width',borderWidthPx);c.setAttribute('stroke-opacity',1-alpha);}
          const cxVal=x2px(xv), cyVal=y2px(yv);
          let bbox=labelBBox.get(p.label||'__none');
          if(!bbox){bbox={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}; labelBBox.set(p.label||'__none',bbox);}
          bbox.minX=Math.min(bbox.minX,cxVal-dotSizePx);
          bbox.maxX=Math.max(bbox.maxX,cxVal+dotSizePx);
          bbox.minY=Math.min(bbox.minY,cyVal-dotSizePx);
          bbox.maxY=Math.max(bbox.maxY,cyVal+dotSizePx);
          frag.appendChild(c);
          if(scatterCurrentGraphType!=='scatter' && p.isSignificant && p.label){
            const labelNode=document.createElementNS(NS,'text');
            labelNode.setAttribute('x',cxVal+dotSizePx+2);
            labelNode.setAttribute('y',cyVal-(dotSizePx+2));
            labelNode.setAttribute('font-size',Math.max(fs*0.75,8));
            labelNode.setAttribute('fill',SIGNIFICANT_COLOR);
            labelNode.setAttribute('text-anchor','start');
            labelNode.textContent=p.label;
            markFontEditable(labelNode,'annotation',`annotation-${labelAnnotations.length}`);
            labelAnnotations.push(labelNode);
          }
          pointIndex++;
          if(pointIndex%10000===0){console.log('scatter svg draw progress',{pointIndex,token});}
        }
        add('g',{}).appendChild(frag);
        if(labelAnnotations.length){
          const annotationLayer=document.createElementNS(NS,'g');
          labelAnnotations.forEach(node=>annotationLayer.appendChild(node));
          svg.appendChild(annotationLayer);
          console.debug('Debug: scatter annotations rendered',{count:labelAnnotations.length,graphType:scatterCurrentGraphType});
        }
        console.timeEnd(`scatterSvgDraw_${token}`);
        if(legendRenderer.entries.length){
          const plotRight=margin.left+plotW;
          const legendX=plotRight+legendGapPx;
          legendRenderer.draw(svg,{x:legendX,y:margin.top});
          console.debug('Debug: scatter legend rendered shared helper',{legendX,legendGapPx,entryCount:legendRenderer.entries.length});
        }
        const xAxisBase=margin.top+plotH;
        const xText=add('text',{x:margin.left+plotW/2,y:xAxisBase+bottomLayout.titleOffset,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        xText.textContent=scatterXLabelText;
        markFontEditable(xText,'xTitle','xTitle');
        makeEditableLocal(xText,txt=>{scatterXLabelText=txt;});
        const yX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
        console.log('scatter y-axis position',yX);
        const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        yText.textContent=scatterYLabelText;
        markFontEditable(yText,'yTitle','yTitle');
        makeEditableLocal(yText,txt=>{scatterYLabelText=txt;});
        const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        titleText.textContent=scatterTitleText;
        markFontEditable(titleText,'graphTitle','graphTitle');
        makeEditableLocal(titleText,txt=>{scatterTitleText=txt;});
        if(scatterCurrentGraphType==='scatter'){
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
          renderStatsCard(resDiv,{
            caption:`${stats.method} correlation`,
            columns:[
              {key:'metric',label:'Metric',align:'left'},
              {key:'value',label:'Value',align:'right'}
            ],
            rows:[
              {metric:'r',value:stats.r.toFixed(4)},
              {metric:'R²',value:stats.r2.toFixed(4)},
              {metric:'P value',value:formatP(stats.p)}
            ],
            options:{
              fileName:'scatter-correlation',
              contextLabel:'scatter-correlation'
            }
          });
          console.log('scatter stats', stats);
        }else{
          const resDiv=document.getElementById('scatterStatsResults');
          const nonSigCount=points.length-significantCount;
          const negLabel=scatterCurrentGraphType==='ma' ? (extraLabelRaw && String(extraLabelRaw).trim() ? `-log10(${String(extraLabelRaw).trim()})` : '-log10(p-value)') : scatterYLabelText;
          let summaryRows=`<tr><th>Total points</th><td>${points.length}</td></tr>`+
            `<tr><th>Significant</th><td>${significantCount}</td></tr>`+
            `<tr><th>Not significant</th><td>${nonSigCount}</td></tr>`+
            `<tr><th>|log₂FC| ≥</th><td>${log2fcThreshold.toFixed(2)}</td></tr>`+
            `<tr><th>${negLabel} ≥</th><td>${negLogPThreshold.toFixed(2)}</td></tr>`;
          if(maMissingPCount>0){
            summaryRows+=`<tr><th>Missing p-values</th><td>${maMissingPCount}</td></tr>`;
          }
          renderStatsCard(resDiv,{
            caption: scatterCurrentGraphType==='ma' ? 'Differential expression summary' : 'Significance summary',
            columns:[
              {key:'metric',label:'Metric',align:'left'},
              {key:'value',label:'Value',align:'right'}
            ],
            rows:(()=>{
              const rows=[
                { metric:'Total points', value:String(points.length) },
                { metric:'Significant', value:String(significantCount) },
                { metric:'Not significant', value:String(nonSigCount) },
                { metric:'|log₂FC| ≥', value:log2fcThreshold.toFixed(2) },
                { metric:`${negLabel} ≥`, value:negLogPThreshold.toFixed(2) }
              ];
              if(maMissingPCount>0){
                rows.push({ metric:'Missing p-values', value:String(maMissingPCount) });
              }
              return rows;
            })(),
            options:{
              fileName:'scatter-threshold-summary',
              contextLabel:'scatter-threshold'
            }
          });
          console.debug('Debug: scatter significance summary',{graphType:scatterCurrentGraphType,significantCount,nonSigCount,log2fcThreshold,negLogPThreshold,missingP:maMissingPCount});
        }
        autoResizeSvg(svg);
        scatterLayout?.syncPanels?.();
        console.log('scatter render complete with enhanced styles');
      }
      scheduleDrawScatter = Shared.debounceFrame(drawScatter);
      scatterLayout?.setScheduleDraw?.(() => scheduleDrawScatter());
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
        const tableRows=[];
        let methodLabel='';
        series.forEach(s=>{
          const pts=s.points.filter(p=>p);
          if(pts.length>=3){
            const stats=computeScatterStats(pts,method);
            methodLabel=stats.method;
            tableRows.push({
              series:s.name,
              r:stats.r.toFixed(4),
              p:formatP(stats.p),
              slope:stats.m.toFixed(4)
            });
          }
        });
        if(tableRows.length){
          renderStatsCard(lineStatsResults,{
            caption:methodLabel?`${methodLabel} correlation summary`:'Correlation summary',
            columns:[
              {key:'series',label:'Series',align:'left'},
              {key:'r',label:'r',align:'right'},
              {key:'p',label:'p',align:'right'},
              {key:'slope',label:'Slope',align:'right'}
            ],
            rows:tableRows,
            options:{
              fileName:'scatter-series-correlation',
              contextLabel:'scatter-series-corr'
            }
          });
        }else{
          lineStatsResults.textContent='Not enough data for statistics.';
        }
        console.log('updateLineStats complete',{rows:tableRows.length});
      }
      function updateHistStats(values){
        console.log('updateHistStats start',values.length);
        if(!values.length){histStatsResults.textContent='No data';return;}
        const mean=jStat.mean(values);
        const median=jStat.median(values);
        const sd=jStat.stdev(values,true);
        renderStatsCard(histStatsResults,{
          caption:'Distribution summary',
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
          options:{
            fileName:'histogram-summary',
            contextLabel:'hist-summary'
          }
        });
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
        renderStatsCard(pieStatsResults,{
          caption:'Goodness-of-fit test',
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows:[
            {metric:'Chi²',value:chi2.toFixed(4)},
            {metric:'df',value:String(df)},
            {metric:'p-value',value:isFinite(p)?formatP(p):'N/A'}
          ],
          options:{
            fileName:'pie-chi-square',
            contextLabel:'pie-chi-square'
          }
        });
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
            showLine:scatterShowLine.checked,
            graphType:scatterGraphTypeSelect?.value || 'scatter',
            log2fcThreshold:scatterLog2FCThreshold?.value || '',
            negLogPThreshold:scatterNegLogPThreshold?.value || ''
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
            if(scatterGraphTypeSelect && c.graphType){
              scatterGraphTypeSelect.value=c.graphType;
            }
            if(scatterLog2FCThreshold && c.log2fcThreshold!==undefined){
              scatterLog2FCThreshold.value=c.log2fcThreshold;
            }
            if(scatterNegLogPThreshold && c.negLogPThreshold!==undefined){
              scatterNegLogPThreshold.value=c.negLogPThreshold;
            }
            syncScatterGraphTypeUI();
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

