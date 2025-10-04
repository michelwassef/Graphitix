(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const pca = Components.pca = Components.pca || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
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
  const DEFAULT_COLS=9;
  const DEFAULT_VIEW_MODE='2d';
  const PCA_3D_DEFAULTS={ rotationX: -0.6, rotationY: 0.9 };

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
      let pcaSvgBox=pcaGraphPanel?.querySelector('.svgbox');
      const pcaConfigPanel=pcaGraphPanel?.querySelector('.config-options');
      const pcaLayout = Shared.componentLayout?.createStandardPanels({
        componentName: 'pca',
        selectors: {
          tablePanel: '#pcaTablePanel',
          graphPanel: '#pcaGraphPanel',
          panelResizer: '#pcaPanelResizer',
          hotWrapper: '#pcaHotWrapper',
          hotContainer: '#pcaHot',
          svgBox: () => pcaGraphPanel?.querySelector('.svgbox'),
          resizeTarget: () => pcaGraphPanel?.querySelector('.svgbox')
        },
        scheduleDraw: () => scheduleDrawPca(),
        resizableBoxOptions: {
          onResize: () => {
            console.debug('Debug: pca layout onResize schedule trigger');
            scheduleDrawPca();
          }
        }
      });
      if(pcaLayout?.elements?.svgBox){
        pcaSvgBox = pcaLayout.elements.svgBox;
      }
      pcaLayout?.setScheduleDraw?.(() => scheduleDrawPca());
      pcaLayout?.syncPanels?.();
      console.debug('Debug: pca initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
      if(typeof Shared.hot?.createStandardTable !== 'function'){
        console.error('pca initHot missing Shared.hot.createStandardTable');
        return;
      }
      const pcaData=Shared.createEmptyData(DEFAULT_ROWS,DEFAULT_COLS);
      if(pcaData.length){
        pcaData[0]=['Variable','A','B','C','D','E','F','G','H'];
        console.debug('Debug: pca default header initialized for label columns', { header: pcaData[0] });
      }
      let pcaScheduleProxyCount = 0;
      const scheduleDrawPcaProxy = () => {
        pcaScheduleProxyCount += 1;
        if(pcaScheduleProxyCount <= 5){
          console.debug('Debug: pca scheduleDraw proxy invoked', { count: pcaScheduleProxyCount }); // Debug: table change trigger
          if(pcaScheduleProxyCount === 5){
            console.debug('Debug: pca scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
          }
        }
        scheduleDrawPca();
      };

      const pcaHot=Shared.hot.createStandardTable(pcaHotContainer,{ rows: DEFAULT_ROWS, cols: DEFAULT_COLS },scheduleDrawPcaProxy,{
        debugLabel: 'pca',
        data: pcaData,
        firstRowClassName: 'htCenter',
        scheduleOnLoadData: true,
        hotOptions: {
          contextMenu: true,
          afterChange(changes,source){
            if(changes){
              console.log('pca afterChange',{count:changes.length,source});
            }
          },
          afterUndo(){
            console.log('pca undo');
          },
          afterRedo(){
            console.log('pca redo');
          }
        }
      });
      const markFontEditable = (node, role, key) => {
        if (!node) { return; }
        const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
        if (fontControls && typeof fontControls.markText === 'function') {
          fontControls.markText(node, { scopeId: 'pca', role, key });
        } else if (node.dataset) {
          node.dataset.fontEditable = '1';
          node.dataset.fontScope = 'pca';
          if (role) node.dataset.fontRole = role;
          if (key || role) node.dataset.fontKey = key || role;
        }
        if (!role || role.indexOf('Tick') === -1) {
          console.debug('Debug: pca markFontEditable', payload); // Debug: font target tagging summary
        }
      };
      document.getElementById('pcaLoadExample').addEventListener('click',()=>{
        const pcaExample=[
          ['Variable','A','B','C','D','E','F','G','H'],
          ['Var1',1,2,3,2,10,20,30,20],
          ['Var2',2,3,2,3,20,10,20,30],
          ['Var3',3,4,1,4,30,30,10,40],
          ['Var4',4,2,4,1,40,20,40,10]
        ];
        pcaHot.loadData(pcaExample);
        console.log('pca example loaded');
        console.debug('Debug: pca example dataset applied (transposed labels)', { rows: pcaExample.length, cols: pcaExample[0]?.length });
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
      const pcaLoadingsPanel=document.getElementById('pcaLoadingsPanel');
      const pcaLoadingsTable=document.getElementById('pcaLoadingsTable');
      if(pcaLoadingsPanel){
        pcaLoadingsPanel.style.display='none';
      }
      const pcaShowLoadings=$('#pcaShowLoadings');
      const pcaViewMode=$('#pcaViewMode');
      const pcaMethod=$('#pcaMethod'), pcaFill=$('#pcaFill'), pcaBorder=$('#pcaBorder'), pcaBorderWidth=$('#pcaBorderWidth'), pcaDotSize=$('#pcaDotSize'), pcaAlpha=$('#pcaAlpha');
      const pcaAlphaVal=$('#pcaAlphaVal');
      const pcaFontSize=$('#pcaFontSize'), pcaFontSizeVal=$('#pcaFontSizeVal');
      if(pcaFontSize?.dataset){
        pcaFontSize.dataset.fontBasePt = String(pcaFontSize.value);
        console.debug('Debug: pca font size base initialized',{ value: pcaFontSize.value }); // Debug: initial base size
      }
      chartStyle.renderFontSizeLabel({ element: pcaFontSizeVal, pt: Number(pcaFontSize.value), input: pcaFontSize, manual: true });
      const pcaShowGrid=$('#pcaShowGrid');
      const pcaXMin=$('#pcaXMin'), pcaXMax=$('#pcaXMax'), pcaYMin=$('#pcaYMin'), pcaYMax=$('#pcaYMax');
      const pcaShowFrame=$('#pcaShowFrame');
      const pcaScale=$('#pcaScale');
      const pcaLabelColorsDiv=$('#pcaLabelColors');
      const pcaLabelColorsFieldset=$('#pcaLabelColorsFieldset');
      const pcaStatsResults=document.getElementById('pcaStatsResults');
      let pcaLabelColors={};
      pcaAlphaVal.textContent=pcaAlpha.value;
      if(pcaViewMode){
        pcaViewMode.addEventListener('change',()=>{
          const mode = (pcaViewMode.value || DEFAULT_VIEW_MODE);
          console.debug('Debug: pca viewMode change',{ mode }); // Debug: view mode toggle listener
          scheduleDrawPca();
        });
      }
      if(pcaShowLoadings){
        pcaShowLoadings.addEventListener('change',()=>{
          const checked = !!pcaShowLoadings.checked;
          console.debug('Debug: pca showLoadings toggled',{ checked }); // Debug: loadings visibility listener
          if(pcaLoadingsPanel){
            pcaLoadingsPanel.style.display = checked ? '' : 'none';
          }
          scheduleDrawPca();
        });
      }
      pcaMethod.addEventListener('change',()=>{console.log('pcaMethod changed',pcaMethod.value); scheduleDrawPca();});
      pcaFill.addEventListener('input',()=>{console.log('pcaFill changed',pcaFill.value); scheduleDrawPca();});
      pcaBorder.addEventListener('input',()=>{console.log('pcaBorder changed',pcaBorder.value); scheduleDrawPca();});
      pcaBorderWidth.addEventListener('input',()=>{console.log('pcaBorderWidth changed',pcaBorderWidth.value); scheduleDrawPca();});
      pcaDotSize.addEventListener('input',()=>{console.log('pcaDotSize changed',pcaDotSize.value); scheduleDrawPca();});
      pcaAlpha.addEventListener('input',()=>{pcaAlphaVal.textContent=pcaAlpha.value; console.log('pcaAlpha changed',pcaAlpha.value); scheduleDrawPca();});
      pcaFontSize.addEventListener('input',()=>{
        if(pcaFontSize.dataset){
          pcaFontSize.dataset.fontBasePt = String(pcaFontSize.value);
          console.debug('Debug: pca font size input manual set',{ value: pcaFontSize.value }); // Debug: manual slider update
        }
        chartStyle.renderFontSizeLabel({ element: pcaFontSizeVal, pt: Number(pcaFontSize.value), input: pcaFontSize, manual: true });
        scheduleDrawPca();
      });
      [pcaShowGrid,pcaScale].forEach(el=>el.addEventListener('change',()=>{console.log('pca config changed',el.id); scheduleDrawPca();}));
      pcaShowFrame.addEventListener('change',()=>{console.debug('Debug: pca showFrame change',{checked:pcaShowFrame.checked}); scheduleDrawPca();});
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
      if(!pcaContainer){
        console.debug('Debug: pca resizer container missing', { hasContainer: !!pcaContainer });
      }
      let pcaXLabelText='PC1'; let pcaYLabelText='PC2'; let pcaZLabelText='PC3';
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

      const requestedViewMode = (pcaViewMode?.value || DEFAULT_VIEW_MODE).toLowerCase();
      const showLoadings = !!pcaShowLoadings?.checked;
      if(pcaLoadingsPanel){
        pcaLoadingsPanel.style.display = showLoadings ? '' : 'none';
      }
      const fill = pcaFill.value;
      const alpha = Number(pcaAlpha.value) || 0;
      const borderWidthRaw = Number(pcaBorderWidth.value);
      const borderColor = pcaBorder.value;
      const containerRect=pcaSvgBox?.getBoundingClientRect?.();
      const fontInfo=chartStyle.resolveScaledFontSize({
        rawSize: pcaFontSize.value,
        width: containerRect?.width,
        height: containerRect?.height,
        svgBox: pcaSvgBox,
        input: pcaFontSize
      });
      const fs=fontInfo.scaledPx;
      const styleScaleInfo=fontInfo.scaleInfo;
      const axisStrokeWidth=chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'pca-axis', min: 0.5 });
      const dotSizeRaw = Number(pcaDotSize.value) || 3;
      const dotSizePx = chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'pca-point', min: 0 });
      const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'pca-border', min: 0 });
      console.debug('Debug: pca style scaling applied',{
        dotSizeRaw,
        dotSizePx,
        borderWidthRaw,
        borderWidthPx,
        axisStrokeWidth,
        styleScale: styleScaleInfo?.styleScale
      }); // Debug: pca style scaling summary
      chartStyle.renderFontSizeLabel({ element: pcaFontSizeVal, fontInfo, input: pcaFontSize });
      console.debug('Debug: pca font scaling applied',{
        input:pcaFontSize.value,
        fontSizePt:fontInfo.pt,
        baseFontPx:fontInfo.px,
        scaledFontPx:fs,
        scale:styleScaleInfo?.styleScale || styleScaleInfo?.scale,
        containerWidth:containerRect?.width,
        containerHeight:containerRect?.height
      });
      const axisMetrics = chartStyle.createAxisMetrics(fs);
      console.debug('Debug: pca axis metrics',axisMetrics);
      const updateLoadingsTable = ({ rows, components, method, viewMode }) => {
        if(!pcaLoadingsTable){
          console.debug('Debug: pca loadings table skipped',{ reason: 'missing-container' });
          return;
        }
        if(!showLoadings){
          pcaLoadingsTable.innerHTML = '<i>Loadings hidden.</i>';
          console.debug('Debug: pca loadings hidden',{ showLoadings });
          return;
        }
        if(method !== 'pca'){
          pcaLoadingsTable.innerHTML = '<i>Loadings available for PCA only.</i>';
          console.debug('Debug: pca loadings unavailable for method',{ method });
          return;
        }
        if(!rows || !rows.length || !components){
          pcaLoadingsTable.innerHTML = '<i>No loadings computed.</i>';
          console.debug('Debug: pca loadings empty',{ rowCount: rows?.length || 0, components });
          return;
        }
        const columnLimit = viewMode === '3d' ? 3 : 2;
        const columnsToRender = Math.min(columnLimit, components);
        const headerCells = ['Variable'];
        for(let idx=0; idx<columnsToRender; idx+=1){
          headerCells.push(`PC${idx+1}`);
        }
        let html = '<table class="table table-compact"><thead><tr>' + headerCells.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
        rows.forEach(row => {
          const label = row?.label || '';
          html += `<tr><th scope="row">${label}</th>`;
          for(let idx=0; idx<columnsToRender; idx+=1){
            const value = Number(row?.values?.[idx] ?? 0);
            html += `<td>${value.toFixed(4)}</td>`;
          }
          html += '</tr>';
        });
        html += '</tbody></table>';
        pcaLoadingsTable.innerHTML = html;
        console.debug('Debug: pca loadings table rendered',{ rowCount: rows.length, columnsToRender, viewMode });
      };
      const fontScale=styleScaleInfo?.styleScale || styleScaleInfo?.scale || 1;
      const showGrid = pcaShowGrid.checked;
      const showFrame = pcaShowFrame.checked;
      console.debug('Debug: pca showFrame state',{showFrame});
      const dotSize = dotSizeRaw; // retain original reference for downstream logs
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
      const headerRow = Array.isArray(data[0]) ? data[0] : [];
      const candidateColCount = headerRow.length;
      const numericColIndices = [];
      for (let c = 1; c < candidateColCount; c++) {
        const headerRaw = headerRow[c];
        const headerText = typeof headerRaw === 'string' ? headerRaw.trim() : '';
        let hasNumericData = headerText.length > 0;
        if (!hasNumericData) {
          for (let r = 1; r < data.length; r++) {
            const cell = data[r] ? data[r][c] : undefined;
            if (cell === null || typeof cell === 'undefined') {
              continue;
            }
            if (typeof cell === 'string' && cell.trim() === '') {
              continue;
            }
            const cellVal = parseFloat(cell);
            if (!Number.isNaN(cellVal)) {
              hasNumericData = true;
              break;
            }
            // non-numeric value encountered, treat column as unsuitable
            hasNumericData = false;
            break;
          }
        }
        if (hasNumericData) {
          numericColIndices.push(c);
        }
      }
      console.debug('Debug: pca numeric column scan', {
        candidateColCount,
        numericColIndices,
      });

      const featureHeaderLabels = numericColIndices.map((colIndex, idx) => {
        const headerVal = headerRow[colIndex];
        const headerText = headerVal == null ? '' : String(headerVal).trim();
        return headerText || `Var ${idx + 1}`;
      });
      let featureLabels = featureHeaderLabels.slice();

      const labels = [];
      const matrixRaw = [];
      const rowLabelsOriginal = [];

      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        if (!row) continue;

        const lab = row[0] ? String(row[0]).trim() : '';
        const vals = [];
        let rowValid = true;

        for (let i = 0; i < numericColIndices.length; i++) {
          const colIndex = numericColIndices[i];
          const cell = row[colIndex];
          if (cell === null || typeof cell === 'undefined' || (typeof cell === 'string' && cell.trim() === '')) {
            rowValid = false;
            console.debug('Debug: pca row skipped due to blank cell', { rowIndex: r, colIndex });
            break;
          }
          const v = parseFloat(cell);
          if (Number.isNaN(v)) {
            rowValid = false;
            console.debug('Debug: pca row skipped due to NaN', { rowIndex: r, colIndex, cell });
            break;
          }
          vals.push(v);
        }

        if (rowValid && vals.length) {
          labels.push(lab);
          matrixRaw.push(vals);
          rowLabelsOriginal.push(lab || `Row ${rowLabelsOriginal.length + 1}`);
        }
      }

      console.log('pca collected', {
        rows: matrixRaw.length,
        cols: matrixRaw[0]?.length,
      });

      if (matrixRaw.length && matrixRaw[0]?.length !== numericColIndices.length) {
        console.debug('Debug: pca matrix width mismatch', {
          expected: numericColIndices.length,
          actual: matrixRaw[0]?.length,
        });
      }

      if (numericColIndices.length < 2) {
        pcaPlotDiv.innerHTML = '<i>At least two numeric variable columns required.</i>';
        if (pcaStatsResults) {
          pcaStatsResults.textContent = '';
        }
        return;
      }

      if (matrixRaw.length < 2 || matrixRaw[0].length < 2) {
        pcaPlotDiv.innerHTML = '<i>At least two samples and two variables required.</i>';
        pcaStatsResults.textContent = '';
        return;
      }

      let matrix = matrixRaw.map(row => row.slice());
      if (matrix.length && matrix[0]) {
        if (matrix.length < matrix[0].length) {
          const columnLabels = numericColIndices.map((colIndex, idx) => {
            const headerVal = headerRow[colIndex];
            const headerText = headerVal == null ? '' : String(headerVal).trim();
            return headerText || `Sample ${idx + 1}`;
          });
          if (matrix[0].length === columnLabels.length) {
            const transposed = matrix[0].map((_, colIdx) => matrix.map((row) => row[colIdx]));
            console.debug('Debug: pca auto transpose applied for column headers as labels', {
              originalSamples: matrix.length,
              originalFeatures: matrix[0].length,
              columnLabels,
            });
            matrix = transposed;
            labels.length = 0;
            for (let i = 0; i < columnLabels.length; i++) {
              labels.push(columnLabels[i]);
            }
            if(rowLabelsOriginal.length === matrix[0]?.length){
              featureLabels = rowLabelsOriginal.map((lab, idx) => lab || `Var ${idx + 1}`);
              console.debug('Debug: pca feature labels derived from rows',{ featureLabels });
            }else{
              console.debug('Debug: pca feature label row mismatch',{ rowLabelCount: rowLabelsOriginal.length, featureCount: matrix[0]?.length });
            }
            console.debug('Debug: pca matrix dimensions after transpose', {
              newSamples: matrix.length,
              newFeatures: matrix[0]?.length,
            });
          } else {
            console.debug('Debug: pca transpose skipped due to mismatch', {
              matrixCols: matrix[0]?.length,
              columnLabelCount: columnLabels.length,
            });
          }
        }
      }
      const method = (pcaMethod.value || 'pca').toLowerCase();
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

      let points = [];
      let statsHtml = '';
      const labelSet = new Set(labels.filter((l) => l));
      let points3d = [];
      let loadingsRows = [];
      let loadingsComponents = 0;
      let pc3Pct = 0;

      if (method === 'mds') {
        console.debug('Debug: mds branch entered', { method }); // Debug: MDS execution path
        const distanceMatrix = [];
        const squaredDistances = [];
        for (let i = 0; i < nSamples; i++) {
          distanceMatrix[i] = [];
          squaredDistances[i] = [];
          for (let j = 0; j < nSamples; j++) {
            let sumSq = 0;
            for (let k = 0; k < nFeatures; k++) {
              const diff = matrix[i][k] - matrix[j][k];
              sumSq += diff * diff;
            }
            const dist = Math.sqrt(sumSq);
            distanceMatrix[i][j] = dist;
            squaredDistances[i][j] = sumSq;
          }
        }

        let totalMean = 0;
        const rowMeans = new Array(nSamples).fill(0);
        const colMeans = new Array(nSamples).fill(0);
        for (let i = 0; i < nSamples; i++) {
          let rowSum = 0;
          for (let j = 0; j < nSamples; j++) {
            rowSum += squaredDistances[i][j];
            colMeans[j] += squaredDistances[i][j];
          }
          rowMeans[i] = rowSum / nSamples;
          totalMean += rowSum;
        }
        totalMean /= (nSamples * nSamples);
        for (let j = 0; j < nSamples; j++) {
          colMeans[j] /= nSamples;
        }

        const B = [];
        for (let i = 0; i < nSamples; i++) {
          B[i] = [];
          for (let j = 0; j < nSamples; j++) {
            B[i][j] = -0.5 * (squaredDistances[i][j] - rowMeans[i] - colMeans[j] + totalMean);
          }
        }
        console.debug('Debug: mds double centered matrix ready', { size: B.length });

        const mdsSvd = SVDLib.SVD(B);
        console.debug('Debug: mds svd result', mdsSvd);

        const eigenValues = mdsSvd.q.map((val) => val);
        const positiveEigen = eigenValues
          .map((val, idx) => ({ val, idx }))
          .filter(({ val }) => val > 1e-9);
        const dimsToUse = Math.min(2, positiveEigen.length);
        console.debug('Debug: mds eigen summary', { eigenValues, dimsToUse });

        if (dimsToUse === 0) {
          pcaPlotDiv.innerHTML = '<i>MDS could not find positive eigenvalues.</i>';
          if (pcaStatsResults) {
            pcaStatsResults.textContent = '';
          }
          return;
        }

        const coords = [];
        for (let i = 0; i < nSamples; i++) {
          const coordRow = new Array(dimsToUse).fill(0);
          for (let dim = 0; dim < dimsToUse; dim++) {
            const eigenIdx = positiveEigen[dim].idx;
            const scale = Math.sqrt(Math.max(positiveEigen[dim].val, 0));
            coordRow[dim] = mdsSvd.u[i][eigenIdx] * scale;
          }
          coords.push(coordRow);
        }

        points = coords.map((row, idx) => ({
          x: row[0] || 0,
          y: dimsToUse > 1 ? row[1] : 0,
          label: labels[idx],
        }));

        const totalPositive = positiveEigen.reduce((sum, { val }) => sum + val, 0);
        const dim1Pct = (positiveEigen[0].val / totalPositive) * 100;
        const dim2Pct = dimsToUse > 1 ? (positiveEigen[1].val / totalPositive) * 100 : 0;
        pcaXLabelText = `MDS1 (${dim1Pct.toFixed(1)}%)`;
        pcaYLabelText = dimsToUse > 1 ? `MDS2 (${dim2Pct.toFixed(1)}%)` : 'MDS2';

        let stressNumerator = 0;
        let stressDenominator = 0;
        for (let i = 0; i < nSamples; i++) {
          for (let j = i + 1; j < nSamples; j++) {
            const fittedDx = (points[i].x - points[j].x);
            const fittedDy = (points[i].y - points[j].y);
            const fittedDist = Math.sqrt(fittedDx * fittedDx + fittedDy * fittedDy);
            const originalDist = distanceMatrix[i][j];
            const diff = originalDist - fittedDist;
            stressNumerator += diff * diff;
            stressDenominator += originalDist * originalDist;
          }
        }
        const stress = stressDenominator > 0 ? Math.sqrt(stressNumerator / stressDenominator) : 0;
        statsHtml = `Dim1: ${dim1Pct.toFixed(1)}% inertia`;
        if (dimsToUse > 1) {
          statsHtml += `<br>Dim2: ${dim2Pct.toFixed(1)}% inertia`;
        }
        statsHtml += `<br>Stress-1: ${stress.toFixed(3)}`;
        console.debug('Debug: mds stress computed', { stress, dimsToUse });
      } else {
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
        pc3Pct = variances[2] != null ? (variances[2] / totalVar) * 100 : 0;

        pcaXLabelText = `PC1 (${pc1Pct.toFixed(1)}%)`;
        pcaYLabelText = `PC2 (${pc2Pct.toFixed(1)}%)`;
        if(svd.q.length >= 3 && variances[2] != null){
          pcaZLabelText = `PC3 (${pc3Pct.toFixed(1)}%)`;
        }else{
          pcaZLabelText = 'PC3';
        }

        points = scores.map((s, i) => ({
          x: s[0],
          y: s[1],
          label: labels[i],
        }));
        if (svd.q.length >= 3) {
          points3d = scores.map((s, i) => ({
            x: s[0],
            y: s[1],
            z: s[2],
            label: labels[i],
          }));
          console.debug('Debug: pca 3d scores prepared',{ count: points3d.length, components: svd.q.length });
        } else {
          points3d = [];
          console.debug('Debug: pca 3d scores skipped',{ components: svd.q.length });
        }
        statsHtml = `PC1: ${pc1Pct.toFixed(1)}% variance`;
        statsHtml += `<br>PC2: ${pc2Pct.toFixed(1)}% variance`;
        if(svd.q.length >= 3){
          statsHtml += `<br>PC3: ${pc3Pct.toFixed(1)}% variance`;
        }
        if(svd.v && Array.isArray(svd.v)){
          const componentCount = Array.isArray(svd.v[0]) ? Math.min(svd.v[0].length, svd.q.length) : Math.min(svd.v.length, svd.q.length);
          loadingsComponents = componentCount;
          const safeFeatureLabels = featureLabels.length ? featureLabels : featureHeaderLabels;
          loadingsRows = safeFeatureLabels.map((label, featureIdx) => {
            const values = [];
            for(let compIdx = 0; compIdx < componentCount; compIdx += 1){
              const raw = svd.v?.[featureIdx]?.[compIdx] ?? 0;
              values.push(raw);
            }
            return { label: label || `Var ${featureIdx + 1}`, values };
          });
          console.debug('Debug: pca loadings computed',{ featureCount: loadingsRows.length, componentCount });
        }else{
          console.debug('Debug: pca loadings skipped',{ hasV: !!svd.v });
        }
      }

      updatePcaLabelColorPickers(Array.from(labelSet));

      let effectiveViewMode = requestedViewMode;
      if(effectiveViewMode === '3d' && (method !== 'pca' || !points3d.length)){
        console.debug('Debug: pca 3d fallback triggered',{ method, pointCount: points3d.length });
        effectiveViewMode = '2d';
      }
      updateLoadingsTable({ rows: loadingsRows, components: loadingsComponents, method, viewMode: effectiveViewMode });

      const legendLabels = Array.from(labelSet);
      const legendWidth = legendLabels.length ? Math.max(60, Math.round(120 * fontScale)) : 0;
      console.debug('Debug: pca legend width scaling',{
        legendWidth,
        legendScale:fontScale,
        legendCount:legendLabels.length
      });

      const plotEl = document.getElementById('pcaPlot');
      plotEl.style.display = 'block';
      while (plotEl.firstChild) {
        plotEl.removeChild(plotEl.firstChild);
      }

      document.getElementById('pcaStatsResults').innerHTML = statsHtml;

      if (effectiveViewMode === '3d') {
        if (!points3d.length) {
          console.debug('Debug: pca 3d render skipped',{ reason: 'no-points' });
          return;
        }
        const W3 = Math.max(50, Math.floor(plotEl.clientWidth || 50));
        const H3 = Math.max(40, Math.floor(plotEl.clientHeight || 40));
        plotEl.style.position = 'relative';
        const svg3 = document.createElementNS(NS, 'svg');
        svg3.setAttribute('id', 'pcaSvg');
        svg3.setAttribute('width', String(W3));
        svg3.setAttribute('height', String(H3));
        svg3.setAttribute('viewBox', `0 0 ${W3} ${H3}`);
        svg3.setAttribute('font-family', chartStyle.FONT_FAMILY);
        svg3.dataset.viewMode = '3d';
        chartStyle.applySvgDefaults(svg3);
        plotEl.appendChild(svg3);
        if(fontControls && typeof fontControls.enableForSvg === 'function'){
          fontControls.enableForSvg(svg3,{ scopeId: 'pca' });
          console.debug('Debug: pca fontControls enableForSvg invoked',{ width: W3, height: H3, mode: '3d' });
        } else {
          console.debug('Debug: pca fontControls enableForSvg missing',{ hasFontControls: !!fontControls, mode: '3d' });
        }
        const margin3 = {
          top: Math.max(fs * 2.5, 20),
          right: legendWidth + Math.max(fs * 1.5, 20),
          bottom: Math.max(fs * 2.5, 24),
          left: Math.max(fs * 2.5, 24)
        };
        const plotW3 = Math.max(20, W3 - margin3.left - margin3.right);
        const plotH3 = Math.max(20, H3 - margin3.top - margin3.bottom);
        const rotatePoint = (pt) => {
          const rx = PCA_3D_DEFAULTS.rotationX;
          const ry = PCA_3D_DEFAULTS.rotationY;
          const cosY = Math.cos(ry);
          const sinY = Math.sin(ry);
          let x1 = pt.x * cosY + pt.z * sinY;
          let z1 = -pt.x * sinY + pt.z * cosY;
          const cosX = Math.cos(rx);
          const sinX = Math.sin(rx);
          const y1 = pt.y * cosX - z1 * sinX;
          const z2 = pt.y * sinX + z1 * cosX;
          return { x: x1, y: y1, z: z2 };
        };
        const rotatedPoints = points3d.map(pt => rotatePoint(pt));
        const axisMagnitude = points3d.reduce((max, pt) => {
          const candidate = Math.max(Math.abs(pt.x), Math.abs(pt.y), Math.abs(pt.z));
          return Math.max(max, candidate);
        }, 1);
        const axisLength = axisMagnitude || 1;
        const axes = [
          { label: pcaXLabelText, vector: { x: axisLength, y: 0, z: 0 }, color: '#e41a1c' },
          { label: pcaYLabelText, vector: { x: 0, y: axisLength, z: 0 }, color: '#377eb8' },
          { label: pcaZLabelText, vector: { x: 0, y: 0, z: axisLength }, color: '#4daf4a' }
        ];
        const axisPoints = axes.map(axis => {
          const rotated = rotatePoint(axis.vector);
          return { ...rotated, axis };
        });
        const allProjected = rotatedPoints.concat(axisPoints, [{ x: 0, y: 0, z: 0 }]);
        const minX3 = Math.min(...allProjected.map(p => p.x));
        const maxX3 = Math.max(...allProjected.map(p => p.x));
        const minY3 = Math.min(...allProjected.map(p => p.y));
        const maxY3 = Math.max(...allProjected.map(p => p.y));
        const rangeX3 = (maxX3 - minX3) || 1;
        const rangeY3 = (maxY3 - minY3) || 1;
        const scaleX3 = plotW3 / rangeX3;
        const scaleY3 = plotH3 / rangeY3;
        const project3 = (pt) => ({
          x: margin3.left + (pt.x - minX3) * scaleX3,
          y: margin3.top + plotH3 - (pt.y - minY3) * scaleY3,
          depth: pt.z
        });
        const origin3 = project3({ x: 0, y: 0, z: 0 });
        const add3 = (tag, attrs, text) => {
          const el = document.createElementNS(NS, tag);
          for (const k in attrs) {
            el.setAttribute(k, String(attrs[k]));
          }
          if (text) {
            el.textContent = text;
          }
          svg3.appendChild(el);
          return el;
        };
        axisPoints.forEach(axisPt => {
          const projected = project3(axisPt);
          add3('line', {
            x1: origin3.x,
            y1: origin3.y,
            x2: projected.x,
            y2: projected.y,
            stroke: axisPt.axis.color,
            'stroke-width': axisStrokeWidth
          });
          const axisLabel = add3('text', {
            x: projected.x,
            y: projected.y,
            'font-size': fs,
            'text-anchor': 'middle',
            fill: chartStyle.TEXT_COLOR,
            dy: '-0.35em'
          }, axisPt.axis.label);
          markFontEditable(axisLabel,'axis3d',axisPt.axis.label);
        });
        const projectedPoints = rotatedPoints.map((rot, idx) => {
          const base = project3(rot);
          return {
            x: base.x,
            y: base.y,
            depth: base.depth,
            label: points3d[idx].label
          };
        }).sort((a,b)=>a.depth-b.depth);
        projectedPoints.forEach(pt => {
          const color = pt.label ? (pcaLabelColors[pt.label] || DEFAULT_SCATTER_COLORS[0]) : fill;
          add3('circle', {
            cx: pt.x,
            cy: pt.y,
            r: dotSizePx,
            fill: color,
            stroke: alpha > 0 && borderWidthPx > 0 ? borderColor : 'none',
            'stroke-width': borderWidthPx,
            opacity: 1 - alpha
          });
        });
        const legendX3=W3-legendWidth+Math.max(6,Math.round(8*fontScale));
        const legendSpacing3=Math.max(4,Math.round(fs*0.5));
        const legendMarkerSize3=Math.max(10,Math.round(12*fontScale));
        const legendTextOffset3=legendMarkerSize3+Math.max(6,Math.round(8*fontScale));
        legendLabels.forEach((lab, i) => {
          const itemY = margin3.top + i * (legendMarkerSize3 + legendSpacing3);
          const color = pcaLabelColors[lab] || DEFAULT_SCATTER_COLORS[i % DEFAULT_SCATTER_COLORS.length];
          add3('rect', {x: legendX3, y: itemY, width: legendMarkerSize3, height: legendMarkerSize3, fill: color});
          const legendText = add3('text', {
            x: legendX3 + legendTextOffset3,
            y: itemY + legendMarkerSize3 / 2,
            'font-size': fs,
            'dominant-baseline': 'middle',
            fill: chartStyle.TEXT_COLOR,
          }, lab);
          markFontEditable(legendText,'legend',`legend-${i}`);
        });
        console.debug('Debug: pca 3d render complete',{ pointCount: projectedPoints.length, axisLength });
        pcaLayout?.syncPanels?.({ skipSchedule: true });
        return;
      }

      if (!points.length) {
        console.debug('Debug: pca 2d render skipped',{ reason: 'no-points' });
        return;
      }

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
      svg.dataset.viewMode = effectiveViewMode;
      chartStyle.applySvgDefaults(svg);
      plotEl.appendChild(svg);
      if(fontControls && typeof fontControls.enableForSvg === 'function'){
        fontControls.enableForSvg(svg,{ scopeId: 'pca' });
        console.debug('Debug: pca fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
      } else {
        console.debug('Debug: pca fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
      }

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
        const step = niceNum(range / (Math.max(maxTicks - 1, 1)), true);
        const graphMin = Math.floor(min / step) * step;
        const graphMax = Math.ceil(max / step) * step;
        const ticks = [];
        for (let v = graphMin; v <= graphMax + 1e-9; v += step) {
          ticks.push(v);
        }
        return {min: graphMin, max: graphMax, ticks, step};
      }

      let xTickTarget = chartStyle.estimateTickCount(W, { axis: 'x', fallback: 6 });
      let yTickTarget = chartStyle.estimateTickCount(H, { axis: 'y', fallback: 6 });
      console.debug('Debug: pca initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
      const formatTick = value => value.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});
      const tickFont = chartStyle.makeFont(fs);
      const axisLabelFont = chartStyle.makeFont(fs);
      const yTitleWidthBase = chartStyle.measureText(pcaYLabelText, axisLabelFont);
      const tickLen = axisMetrics.tickLength;
      const tickGap = axisMetrics.tickLabelGap;
      let margin = chartStyle.computeBaseMargins({fontSize: fs, legendWidth, maxYLabelWidth: 0, yTitleWidth: yTitleWidthBase, axisMetrics});
      margin.left = Math.max(margin.left, fs * 0.5);
      let plotW = Math.max(20, W - margin.left - margin.right);
      let plotH = Math.max(20, H - margin.top - margin.bottom);
      let bottomLayout = chartStyle.computeBottomLayout({labels: [], fontSize: fs, plotWidth: plotW, baseBottom: margin.bottom, axisMetrics});
      margin.bottom = bottomLayout.bottom;
      plotW = Math.max(20, W - margin.left - margin.right);
      plotH = Math.max(20, H - margin.top - margin.bottom);
      let xScale = niceScale(xMin, xMax, xTickTarget);
      let yScale = niceScale(yMin, yMax, yTickTarget);
      let xTickLabels = xScale.ticks.map(t => formatTick(t));
      let yTickLabels = yScale.ticks.map(t => formatTick(t));
      let maxYLabelWidth = 0;
      let maxXLabelWidth = 0;
      for(let pass=0;pass<2;pass++){
        xScale = niceScale(xMin, xMax, xTickTarget);
        yScale = niceScale(yMin, yMax, yTickTarget);
        if (isFinite(xMinManual)) xScale.min = xMin;
        if (isFinite(xMaxManual)) xScale.max = xMax;
        if (isFinite(yMinManual)) yScale.min = yMin;
        if (isFinite(yMaxManual)) yScale.max = yMax;
        xTickLabels = xScale.ticks.map(t => formatTick(t));
        yTickLabels = yScale.ticks.map(t => formatTick(t));
        const yLabelWidths = yTickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
        maxYLabelWidth = Math.max(...yLabelWidths, 0);
        const xLabelWidths = xTickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
        maxXLabelWidth = Math.max(...xLabelWidths, 0);
        margin = chartStyle.computeBaseMargins({fontSize: fs, legendWidth, maxYLabelWidth, yTitleWidth: yTitleWidthBase, axisMetrics});
        margin.left = Math.max(margin.left, maxYLabelWidth + tickLen + tickGap + fs * 0.5);
        plotW = Math.max(20, W - margin.left - margin.right);
        plotH = Math.max(20, H - margin.top - margin.bottom);
        bottomLayout = chartStyle.computeBottomLayout({labels: xTickLabels, fontSize: fs, plotWidth: plotW, baseBottom: margin.bottom, axisMetrics});
        margin.bottom = bottomLayout.bottom;
        plotW = Math.max(20, W - margin.left - margin.right);
        plotH = Math.max(20, H - margin.top - margin.bottom);
        const refinedX = chartStyle.estimateTickCount(plotW, { axis: 'x', fallback: xTickTarget });
        const refinedY = chartStyle.estimateTickCount(plotH, { axis: 'y', fallback: yTickTarget });
        console.debug('Debug: pca tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxXLabelWidth,maxYLabelWidth});
        if(refinedX === xTickTarget && refinedY === yTickTarget){
          break;
        }
        xTickTarget = refinedX;
        yTickTarget = refinedY;
      }
      console.debug('Debug: pca tick targets finalized',{xTickTarget,yTickTarget,maxXLabelWidth,maxYLabelWidth});
      const aspectData = pcaSvgBox?.dataset;
      const shouldLockAspect = aspectData?.resizerAspectLocked === 'true';
      console.debug('Debug: pca aspect ratio decision',{shouldLockAspect,storedRatio:aspectData?.resizerAspectRatio}); // Debug: pca aspect toggle decision
      if(shouldLockAspect){
        const square = chartStyle.ensureSquarePlot(W, H, margin);
        margin = square.margin;
        plotW = square.plotW;
        plotH = square.plotH;
        if(aspectData){
          const derivedRatio = plotH > 0 ? plotW / plotH : NaN;
          if(Number.isFinite(derivedRatio)){
            aspectData.resizerAspectRatio = String(derivedRatio);
          }
        }
        console.debug('Debug: pca layout (locked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: pca square enforcement branch
      }else{
        console.debug('Debug: pca layout (unlocked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: pca free resize branch
      }
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


      if (showGrid) {
        xScale.ticks.forEach((t) => {
          const x = x2px(t);
          add('line', {x1: x, y1: margin.top, x2: x, y2: margin.top + plotH, stroke: '#eee', 'stroke-width': axisStrokeWidth});
        });
        yScale.ticks.forEach((t) => {
          const y = y2px(t);
          add('line', {x1: margin.left, y1: y, x2: margin.left + plotW, y2: y, stroke: '#eee', 'stroke-width': axisStrokeWidth});
        });
        console.debug('Debug: pca grid stroke scaled',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length,axisStrokeWidth});
      }

      const xTickPositions = xScale.ticks.map(t => x2px(t));
      const yTickPositions = yScale.ticks.map(t => y2px(t));
      let axisXStart = xTickPositions.length ? Math.min(...xTickPositions) : margin.left;
      let axisXEnd = xTickPositions.length ? Math.max(...xTickPositions) : margin.left + plotW;
      let axisYStart = yTickPositions.length ? Math.min(...yTickPositions) : margin.top;
      let axisYEnd = yTickPositions.length ? Math.max(...yTickPositions) : margin.top + plotH;
      if(axisXStart === axisXEnd){ axisXStart = margin.left; axisXEnd = margin.left + plotW; }
      if(axisYStart === axisYEnd){ axisYStart = margin.top; axisYEnd = margin.top + plotH; }
      console.debug('Debug: pca axis span', { axisXStart, axisXEnd, axisYStart, axisYEnd });
      const axisStroke = '#000';
      add('line', {x1: axisXStart, y1: margin.top + plotH, x2: axisXEnd, y2: margin.top + plotH, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth});
      add('line', {x1: margin.left, y1: axisYStart, x2: margin.left, y2: axisYEnd, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth});
      console.debug('Debug: pca axes stroke scaled',{axisStrokeWidth});
      if(showFrame){
        console.debug('Debug: pca frame request',{stroke:axisStroke, showFrame}); // Debug: frame styling inputs
        chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, sides: ['top','right'] });
      }
      // Frame closes PCA plot area using axis styling continuity

      const xTickNodes = [];
      let xTickFontCount = 0;
      xScale.ticks.forEach((t, i) => {
        const x = x2px(t);
        add('line', {x1: x, y1: margin.top + plotH, x2: x, y2: margin.top + plotH + tickLen, stroke: '#000', 'stroke-width': axisStrokeWidth});
        const txt = add('text', {
          x,
          y: margin.top + plotH + tickLen + tickGap,
          'font-size': fs,
          'text-anchor': 'middle',
          'dominant-baseline': 'hanging',
          fill: chartStyle.TEXT_COLOR,
        }, formatTick(t));
        markFontEditable(txt,'xTick');
        xTickFontCount += 1;
        xTickNodes.push(txt);
      });
      chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});

      let yTickFontCount = 0;
      yScale.ticks.forEach((t, i) => {
        const y = y2px(t);
        add('line', {x1: margin.left - tickLen, y1: y, x2: margin.left, y2: y, stroke: '#000', 'stroke-width': axisStrokeWidth});
        const txt = add('text', {
          x: margin.left - (tickLen + tickGap),
          y,
          'font-size': fs,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          fill: chartStyle.TEXT_COLOR,
        }, formatTick(t));
        markFontEditable(txt,'yTick');
        yTickFontCount += 1;
      });
      console.debug('Debug: pca ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
      console.debug('Debug: pca font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts

      const xAxisText = add('text', {
        x: margin.left + plotW / 2,
        y: margin.top + plotH + bottomLayout.titleOffset,
        'font-size': fs,
        'text-anchor': 'middle',
        fill: chartStyle.TEXT_COLOR,
      }, pcaXLabelText);
      markFontEditable(xAxisText,'xTitle','xTitle');

      const yLabelX = margin.left - (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
      const yAxisText = add('text', {
        x: yLabelX,
        y: margin.top + plotH / 2,
        'font-size': fs,
        'text-anchor': 'middle',
        transform: `rotate(-90 ${yLabelX} ${margin.top + plotH / 2})`,
        fill: chartStyle.TEXT_COLOR,
      }, pcaYLabelText);
      markFontEditable(yAxisText,'yTitle','yTitle');

      points.forEach((pt) => {
        const cx = x2px(pt.x);
        const cy = y2px(pt.y);
        const color = pt.label ? (pcaLabelColors[pt.label] || DEFAULT_SCATTER_COLORS[0]) : fill;
        add('circle', {
          cx,
          cy,
          r: dotSizePx,
          fill: color,
          stroke: alpha > 0 && borderWidthPx > 0 ? borderColor : 'none',
          'stroke-width': borderWidthPx,
          opacity: 1 - alpha,
        });
      });

      const legendX=W-legendWidth+Math.max(6,Math.round(8*fontScale));
      const legendSpacing=Math.max(4,Math.round(fs*0.5));
      const legendMarkerSize=Math.max(10,Math.round(12*fontScale));
      const legendTextOffset=legendMarkerSize+Math.max(6,Math.round(8*fontScale));
      console.debug('Debug: pca legend layout',{
        legendX,
        legendSpacing,
        legendMarkerSize,
        legendTextOffset
      });
      legendLabels.forEach((lab, i) => {
        const itemY = margin.top + i * (legendMarkerSize + legendSpacing);
        const color = pcaLabelColors[lab] || DEFAULT_SCATTER_COLORS[i % DEFAULT_SCATTER_COLORS.length];
        add('rect', {x: legendX, y: itemY, width: legendMarkerSize, height: legendMarkerSize, fill: color});
        const legendText = add('text', {
          x: legendX + legendTextOffset,
          y: itemY + legendMarkerSize / 2,
          'font-size': fs,
          'dominant-baseline': 'middle',
          fill: chartStyle.TEXT_COLOR,
        }, lab);
        markFontEditable(legendText,'legend',`legend-${i}`);
      });

      console.debug('pca render complete', {
        pointCount: points.length,
        width: W,
        height: H,
      });
      pcaLayout?.syncPanels?.({ skipSchedule: true });
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
          showFrame:pcaShowFrame.checked,
          xMin:pcaXMin.value,
          xMax:pcaXMax.value,
          yMin:pcaYMin.value,
          yMax:pcaYMax.value,
          scale:pcaScale.checked,
          fontSize:pcaFontSize.value,
          viewMode:pcaViewMode?.value || DEFAULT_VIEW_MODE,
          showLoadings:!!pcaShowLoadings?.checked
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
      function loadPcaGraphFile(file){
        const reader=new FileReader();
        reader.onload=e=>{
          try{
            const obj=JSON.parse(e.target.result);
            console.log('loadPcaGraph',obj);
            if(obj.type!=='pca') throw new Error('Invalid graph type');
            pcaHot.loadData(obj.data||[]);
            const c=obj.config||{};
            pcaDotSize.value=c.dotSize||pcaDotSize.value;
            pcaFill.value=c.fill||pcaFill.value;
            pcaBorder.value=c.border||pcaBorder.value;
            pcaBorderWidth.value=c.borderWidth||pcaBorderWidth.value;
            pcaMethod.value=c.method||'pca';
            pcaAlpha.value=c.alpha||0;
            pcaAlphaVal.textContent=pcaAlpha.value;
            pcaLabelColors=c.labelColors||{};
            pcaShowGrid.checked=!!c.showGrid;
            pcaShowFrame.checked=!!c.showFrame;
            pcaXMin.value=c.xMin||'';
            pcaXMax.value=c.xMax||'';
            pcaYMin.value=c.yMin||'';
            pcaYMax.value=c.yMax||'';
            pcaScale.checked=!!c.scale;
            pcaFontSize.value=c.fontSize||pcaFontSize.value;
            if(pcaViewMode){
              const restoredView = (c.viewMode || DEFAULT_VIEW_MODE);
              pcaViewMode.value = restoredView;
              pcaViewMode.dispatchEvent(new Event('change'));
              console.debug('Debug: pca view mode restored',{ restoredView });
            }
            if(pcaShowLoadings){
              const restoredLoadings = !!c.showLoadings;
              pcaShowLoadings.checked = restoredLoadings;
              pcaShowLoadings.dispatchEvent(new Event('change'));
              console.debug('Debug: pca showLoadings restored',{ restoredLoadings });
            }
            if(pcaFontSize.dataset){
              pcaFontSize.dataset.fontBasePt = String(pcaFontSize.value);
              console.debug('Debug: pca font size base restored',{ value: pcaFontSize.value }); // Debug: restore base from file
            }
            chartStyle.renderFontSizeLabel({ element: pcaFontSizeVal, pt: Number(pcaFontSize.value), input: pcaFontSize, manual: true });
            scheduleDrawPca();
          }catch(err){
            console.error('loadPcaGraph error',err);
          }
        };
        reader.readAsText(file);
      }
      if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
        Shared.exporter.mountSvgControls({
          container: '#pcaExportControls',
          svgSelector: '#pcaSvg',
          fileName: 'pca',
          contextLabel: 'pca-export'
        });
        console.debug('Debug: pca export controls mounted', { hasExporter: true }); // Debug: pca export mount
      } else {
        console.debug('Debug: pca export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: pca export fallback
      }
      document.getElementById('openPca').addEventListener('click',openPcaFile);
      document.getElementById('savePca').addEventListener('click',savePcaFile);
      document.getElementById('saveAsPca').addEventListener('click',saveAsPcaFile);
      document.getElementById('pcaGraphFile').addEventListener('change',e=>{ const f=e.target.files[0]; if(f){ pcaFileName=f.name; pcaFileHandle=null; loadPcaGraphFile(f); } });
    
    scheduleDrawPca = Shared.debounceFrame(drawPca);
    pcaLayout?.setScheduleDraw?.(() => scheduleDrawPca());
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

