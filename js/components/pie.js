// Pie/Proportion Graph component module
// Exposes: window.Components.pie = { init(root), draw(), save(), open(), loadFromFile(file) }
(function(global){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const pie = Components.pie = Components.pie || {};
  pie.__installed = true; // signal to legacy code to skip
  pie.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: pie component awaiting Shared.fileIO helpers');
  }

  let state = {
    hot: null,
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'pie.graph',
    titleText: 'Proportion graph',
    legendWidth: 120,
    colors: {}
  };

  // Return a default color palette for slices
  // Prefer globally defined palettes if available; fallback to local palette
  function getDefaultPalette(){
    try{
      const palFromGlobal = (global && Array.isArray(global.DEFAULT_SCATTER_COLORS)) ? global.DEFAULT_SCATTER_COLORS : undefined;
      // Some sections define DEFAULT_SCATTER_COLORS as a global lexical binding
      // eslint-disable-next-line no-undef
      const palFromLexical = (typeof DEFAULT_SCATTER_COLORS !== 'undefined' && Array.isArray(DEFAULT_SCATTER_COLORS)) ? DEFAULT_SCATTER_COLORS : undefined;
      const palette = palFromGlobal || palFromLexical || ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
      return palette;
    }catch(_e){
      return ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
    }
  }

  function ensureWrapperStyles(){
    const wrapper = document.getElementById('pieHotWrapper');
    if(global.Shared && Shared.ensureHotWrapperStyles) Shared.ensureHotWrapperStyles(wrapper);
  }

  function initTableAndResizers(){
    const tablePanel=document.getElementById('pieTablePanel');
    const graphPanel=document.getElementById('pieGraphPanel');
    const panelResizer=document.getElementById('piePanelResizer');
    const svgBox=graphPanel?.querySelector('.svgbox');
    const configPanel=graphPanel?.querySelector('.config-options');
    let minSvgWidth=0;
    const syncPiePanels = () => {
      Shared.syncPanelWidths(tablePanel, graphPanel, configPanel, state.scheduleDraw, {
        svgBox,
        minSvgWidth,
        debugLabel: 'pie'
      });
    };
    const observer=new ResizeObserver(()=>syncPiePanels()); observer.observe(tablePanel); syncPiePanels();

    const plotDiv=document.getElementById('piePlot');
    const container=plotDiv.closest('.svgbox')||plotDiv.parentElement;
    if(global.Shared && Shared.attachResizableBox && container){ Shared.attachResizableBox(container, { onResize: () => { syncPiePanels(); } }); }

    if(panelResizer && tablePanel && graphPanel){
      panelResizer.addEventListener('pointerdown',e=>{
        e.preventDefault();
        const startX=e.clientX;
        const startTable=tablePanel.getBoundingClientRect().width;
        const startGraph=graphPanel.getBoundingClientRect().width;
        const configWidth=configPanel.getBoundingClientRect().width;
        const gap=parseFloat(getComputedStyle(graphPanel.querySelector('.diagram-area')).gap||0);
        minSvgWidth=(svgBox?.getBoundingClientRect().width||0)*0.5;
        const minGraph=configWidth+gap+minSvgWidth;
        const total=startTable+startGraph;
        console.debug('Debug: pie resizer start',{startTable,startGraph,configWidth,gap,minSvgWidth,minGraph,total});
        function onMove(ev){ const dx=ev.clientX-startX; let newTable=Math.max(150, Math.min(total-minGraph, startTable+dx)); let newGraph=total-newTable; tablePanel.style.flex=`0 0 ${newTable}px`; graphPanel.style.flex=`0 0 ${newGraph}px`; syncPiePanels(); console.debug('Debug: pie resizer move',{dx,newTable,newGraph}); }
        function onUp(){ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); console.debug('Debug: pie resizer end'); }
        document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
      });
    }
  }

  function initHot(){
    const DEFAULT_ROWS=100; const PIE_DEFAULT_COLS=6;
    const container=document.getElementById('pieHot');
    state.hot=new global.Handsontable(container,{
      data:global.Handsontable.helper.createEmptySpreadsheetData(DEFAULT_ROWS,PIE_DEFAULT_COLS),
      rowHeaders(index){ return index===0?'':index; },
      colHeaders:true,
      stretchH:'all',
      minSpareRows:10,
      contextMenu:true,
      cells(row,col){ const props={}; if(row===0) props.className='htCenter'; return props; },
      afterChange(changes,source){ if(changes){ console.log('pie afterChange',{count:changes.length,source}); state.scheduleDraw(); }},
      afterUndo:()=>{ console.log('pie undo'); state.scheduleDraw(); },
      afterRedo:()=>{ console.log('pie redo'); state.scheduleDraw(); },
      licenseKey:'non-commercial-and-evaluation'
    });
  }

  function initControls(){
    const pieShowPercents=$('#pieShowPercents');
    const pieStartAngle=$('#pieStartAngle');
    const pieFontSize=$('#pieFontSize');
    const pieFontSizeVal=$('#pieFontSizeVal');
    const pieChartType=$('#pieChartType');
    const valueColumn=$('#pieValueColumn');
    const expectedColumn=$('#pieExpectedColumn');
    pieFontSizeVal.textContent=pieFontSize.value;
    ;[pieShowPercents,pieStartAngle,pieFontSize,pieChartType].forEach(el=>el.addEventListener('input',()=>{ console.log('pie config changed',el.id,el.value); if(el===pieFontSize) pieFontSizeVal.textContent=pieFontSize.value; state.scheduleDraw(); }));
    valueColumn.addEventListener('change',()=>{console.log('pie value column changed',valueColumn.value); state.scheduleDraw();});
    expectedColumn.addEventListener('change',()=>{console.log('pie expected column changed',expectedColumn.value); state.scheduleDraw();});

    const example=[ ['Quarter','Observed','Expected'], ['Q1',120,100], ['Q2',90,100], ['Q3',60,80], ['Q4',130,120] ];
    document.getElementById('pieLoadExample').addEventListener('click',()=>{ state.hot.loadData(example); console.log('pie example loaded with expected values'); state.scheduleDraw(); });
    document.getElementById('pieImport').addEventListener('click',()=>{const f=document.getElementById('pieFile'); f.value=''; f.click();});
    document.getElementById('pieFile').addEventListener('change',e=>{
      const file=e.target.files[0]; if(!file) return; const ext=file.name.split('.').pop().toLowerCase(); const reader=new FileReader();
      if(['csv','tsv','txt'].includes(ext)){
        reader.onload=ev=>{const text=ev.target.result; const delim=ext==='csv'?',' : '\t'; const rows=text.split(/\r?\n/).map(r=>r.split(delim)); processImportedRows(rows);}; reader.readAsText(file);
      }else if(['xls','xlsx','ods','odg'].includes(ext)){
        reader.onload=async ev=>{ try{ if(!global.XLSX){ await new Promise((res,rej)=>{const s=document.createElement('script'); s.src='libs/xlsx.full.min.js'; s.onload=()=>res(); s.onerror=err=>rej(new Error('Failed to load XLSX script')); document.head.appendChild(s);}); } const data=new Uint8Array(ev.target.result); const workbook=global.XLSX.read(data,{type:'array'}); const sheet=workbook.Sheets[workbook.SheetNames[0]]; let rows=global.XLSX.utils.sheet_to_json(sheet,{header:1,defval:''}); processImportedRows(rows);}catch(err){alert('Failed to import spreadsheet: '+err.message);} }; reader.readAsArrayBuffer(file);
      } else { alert('Unsupported file format: '+ext); }
    });

    function processImportedRows(rows,startRow=0,startCol=0){
      if(!rows||!rows.length) return; rows=rows.filter(r=>r&&r.some(c=>String(c).trim()!=='')); if(!rows.length) return;
      const colCount=Math.max(1,...rows.map(r=>r.length)); const rowCount=rows.length; const curRows=state.hot.countRows(); const curCols=state.hot.countCols(); const DEFAULT_ROWS=100; const targetRows=Math.max(DEFAULT_ROWS,curRows,startRow+rowCount); const targetCols=Math.max(curCols,startCol+colCount);
      const data=Array.from({length:targetRows},(_,r)=>Array(targetCols).fill('')); const existing=state.hot.getData(); for(let r=0;r<curRows;r++){ for(let c=0;c<curCols;c++) data[r][c]=existing[r][c]; } for(let r=0;r<rowCount;r++){ const row=rows[r]; for(let c=0;c<row.length;c++) data[startRow+r][startCol+c]=row[c]; }
      state.hot.updateSettings({data,minRows:targetRows,minCols:targetCols}); console.log('pie data imported',{rows:data.length,cols:targetCols}); state.scheduleDraw();
    }

    // Export buttons
    document.getElementById('piePNG').addEventListener('click',async()=>{
      const svgEl=document.getElementById('pieSvg'); if(!svgEl) return; console.log('piePNG export start');
      const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800; const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400; const xml=(global.serializeCleanSVG?global.serializeCleanSVG(svgEl):new XMLSerializer().serializeToString(svgEl)); const img=new Image(); const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml); img.src=url; await img.decode().catch(err=>{console.error('piePNG svg decode',err);}); const outCanvas=document.createElement('canvas'); outCanvas.width=W; outCanvas.height=H; const ctx=outCanvas.getContext('2d'); ctx.drawImage(img,0,0); outCanvas.toBlob(b=>{ const pngUrl=URL.createObjectURL(b); const a=document.createElement('a'); a.href=pngUrl; a.download='pie.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(pngUrl),4000); },'image/png');
    });
    document.getElementById('pieSVG').addEventListener('click',()=>{
      const svgEl=document.getElementById('pieSvg'); if(!svgEl) return; console.log('pieSVG export start'); const xml=(global.serializeCleanSVG?global.serializeCleanSVG(svgEl):new XMLSerializer().serializeToString(svgEl)); const blob=new Blob([xml],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pie.svg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
    });

    // Save/Open
    function getPayload(){ return { type:'pie', data: state.hot.getData(), config: collectConfig() }; }
    function collectConfig(){
      return {
        title: state.titleText,
        chartType: $('#pieChartType').value,
        showPercents: $('#pieShowPercents').checked,
        startAngle: $('#pieStartAngle').value,
        fontSize: $('#pieFontSize').value,
        valueColumn: $('#pieValueColumn').value,
        expectedColumn: $('#pieExpectedColumn').value,
        colors: state.colors
      };
    }
    pie.save = async function(){
      console.debug('Debug: pie.save invoked', { hasHandle: !!state.fileHandle });
      if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
        console.error('pie.save missing fileIO.saveGraphFile');
        return;
      }
      const result = await fileIO.saveGraphFile({
        context: 'pie',
        fileHandle: state.fileHandle,
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      console.debug('Debug: pie.save result', result);
    };
    pie.saveAs = async function(){
      console.debug('Debug: pie.saveAs invoked', { currentName: state.fileName });
      if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
        console.error('pie.saveAs missing fileIO.saveGraphFileAs');
        return;
      }
      const result = await fileIO.saveGraphFileAs({
        context: 'pie',
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      console.debug('Debug: pie.saveAs result', result);
    };
    pie.open = async function(){
      console.debug('Debug: pie.open invoked');
      if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
        console.error('pie.open missing fileIO.openGraphFile');
        return;
      }
      const result = await fileIO.openGraphFile({
        context: 'pie',
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; },
        loadFromFile: file => pie.loadFromFile(file),
        triggerInput: () => {
          const input = document.getElementById('pieGraphFile');
          if(input){
            input.value='';
            input.click();
          }
        }
      });
      console.debug('Debug: pie.open result', result);
    };
    pie.loadFromFile = function(file){ const reader=new FileReader(); reader.onload=e=>{ try{ const obj=JSON.parse(e.target.result); console.log('loadPieGraph',obj); if(obj.type!=='pie') throw new Error('Invalid graph type'); state.hot.loadData(obj.data||[]); const c=obj.config||{}; state.titleText=c.title||state.titleText; $('#pieChartType').value=c.chartType||$('#pieChartType').value; $('#pieShowPercents').checked=!!c.showPercents; $('#pieStartAngle').value=c.startAngle||$('#pieStartAngle').value; $('#pieFontSize').value=c.fontSize||$('#pieFontSize').value; $('#pieFontSizeVal').textContent=$('#pieFontSize').value; $('#pieValueColumn').value=c.valueColumn||$('#pieValueColumn').value; $('#pieExpectedColumn').value=c.expectedColumn||$('#pieExpectedColumn').value; state.colors=c.colors||state.colors; state.scheduleDraw(); }catch(err){console.error('loadPieGraph error',err);} }; reader.readAsText(file); };
    document.getElementById('openPie').addEventListener('click',pie.open);
    document.getElementById('savePie').addEventListener('click',pie.save);
    document.getElementById('saveAsPie').addEventListener('click',pie.saveAs);
    document.getElementById('pieGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; pie.loadFromFile(f); }});
  }

  function updatePieColorPickers(labels){
    const colorPickers=document.getElementById('pieColorPickers');
    colorPickers.innerHTML='';
    const palette = getDefaultPalette();
    console.debug('Debug: pie color palette in use', { palette }); // Debug: palette source and values
    labels.forEach((lab,i)=>{
      if(!state.colors[lab]) state.colors[lab]= palette[i % palette.length];
      const input=document.createElement('input'); input.type='color'; input.value=state.colors[lab]; if(global.attachColorPickerNear) attachColorPickerNear(input); input.addEventListener('input',e=>{ state.colors[lab]=e.target.value; console.log('pie color changed',{lab,color:state.colors[lab]}); state.scheduleDraw(); }); const lbl=document.createElement('label'); lbl.textContent=lab+' '; lbl.appendChild(input); colorPickers.appendChild(lbl);
    });
    console.log('updatePieColorPickers',state.colors); // Debug: resulting color map
  }

  // Compute and render Chi-square statistics for proportion graphs
  function updatePieStats(labels, observed, expected){
    try{
      const out=document.getElementById('pieStatsResults');
      if(!out){ console.warn('Debug: pieStatsResults element not found'); return; }
      console.debug('Debug: updatePieStats start',{labelCount:labels.length,observedCount:observed.length,expectedCount:expected.length});
      if(!observed || !observed.length){ out.textContent='No data'; return; }
      if(!expected || expected.length!==observed.length || expected.some(e=>isNaN(e))){ out.textContent='Expected values required'; return; }
      const chi2=observed.reduce((s,o,i)=>s+Math.pow(o-expected[i],2)/expected[i],0);
      const df=Math.max(1, observed.length-1);
      let p=NaN;
      if(global.jStat && global.jStat.chisquare && typeof global.jStat.chisquare.cdf === 'function'){
        p = 1-global.jStat.chisquare.cdf(chi2,df);
      }
      const formatP=(val)=>{ if(!isFinite(val)) return String(val); if(val<0.0001) return val.toExponential(2); return val.toFixed(4); };
      out.innerHTML=`<table><tr><th>Chi²</th><td>${chi2.toFixed(4)}</td></tr><tr><th>df</th><td>${df}</td></tr><tr><th>p-value</th><td>${isFinite(p)?formatP(p):'N/A'}</td></tr></table>`;
      console.debug('Debug: updatePieStats result',{chi2,df,p});
    }catch(err){ console.error('updatePieStats error',err); }
  }

  function updatePieColumns(header){
    const valueColumn=$('#pieValueColumn'); const expectedColumn=$('#pieExpectedColumn');
    const prevVal=valueColumn.value; const prevExp=expectedColumn.value; valueColumn.innerHTML=''; expectedColumn.innerHTML='';
    console.log('updatePieColumns prev',{prevVal,prevExp});
    for(let c=1;c<header.length;c++){ const txt=header[c]||`Column ${c+1}`; const optVal=document.createElement('option'); optVal.value=String(c); optVal.textContent=txt; if(optVal.value===prevVal) optVal.selected=true; valueColumn.appendChild(optVal); const optExp=document.createElement('option'); optExp.value=String(c); optExp.textContent=txt; if(optExp.value===prevExp) optExp.selected=true; expectedColumn.appendChild(optExp); }
    if(!prevVal && header.length>1) valueColumn.value='1';
    if(!prevExp){ const expIdx=header.findIndex((h,i)=>i>0 && String(h).trim().toLowerCase()==='expected'); if(expIdx>0) expectedColumn.value=String(expIdx); else if(header.length>2) expectedColumn.value='2'; }
    console.log('updatePieColumns',{val:valueColumn.value,exp:expectedColumn.value});
  }

  function draw(){
    const plotEl=document.getElementById('piePlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    const type=$('#pieChartType').value; const fs=Number($('#pieFontSize').value)||16; const showPerc=$('#pieShowPercents').checked; const startDeg=parseFloat($('#pieStartAngle').value)||0;
    const data=state.hot.getData(); updatePieColumns(data[0]||[]); state.legendWidth=120;

    if(type==='stacked'){
      const header=data[0]||[]; const barHeaders=header.slice(1).filter(h=>h!==null&&h!==''); const segmentLabels=[]; const segmentValues=[];
      for(let r=1;r<data.length;r++){ const row=data[r]; const seg=row[0]; if(seg){ const vals=[]; for(let c=1;c<=barHeaders.length;c++){ const v=parseFloat(row[c]); vals.push(isNaN(v)?0:v);} segmentLabels.push(String(seg)); segmentValues.push(vals);} }
      if(!barHeaders.length||!segmentLabels.length){plotEl.innerHTML='<i>No data</i>';return;}
      updatePieColorPickers(segmentLabels);
      plotEl.style.display='flex'; plotEl.style.alignItems='flex-start';
      const svgWidth=Math.max(50,Math.floor(plotEl.clientWidth||50)-state.legendWidth); const svgHeight=Math.max(50,Math.floor(plotEl.clientHeight||50));
      const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','pieSvg'); svg.setAttribute('width',String(svgWidth)); svg.setAttribute('height',String(svgHeight)); svg.setAttribute('viewBox',`0 0 ${svgWidth} ${svgHeight}`); svg.setAttribute('font-family','sans-serif'); plotEl.appendChild(svg);
      const legend=document.createElement('div'); legend.style.width=state.legendWidth+'px'; legend.style.fontSize=fs+'px'; legend.style.marginLeft='8px'; plotEl.appendChild(legend);
      const marginTop=fs+20; const marginBottom=40; const marginLeft=fs*5;
      const chartWidthRaw=svgWidth-marginLeft-20;
      const chartHeightRaw=svgHeight-marginTop-marginBottom;
      const chartWidth=Math.max(0,chartWidthRaw);
      const chartHeight=Math.max(0,chartHeightRaw);
      const axis=document.createElementNS(NS,'g'); const yAxis=document.createElementNS(NS,'line'); yAxis.setAttribute('x1',marginLeft); yAxis.setAttribute('y1',marginTop); yAxis.setAttribute('x2',marginLeft); yAxis.setAttribute('y2',marginTop+chartHeight); yAxis.setAttribute('stroke','#000'); axis.appendChild(yAxis); const xAxis=document.createElementNS(NS,'line'); xAxis.setAttribute('x1',marginLeft); xAxis.setAttribute('y1',marginTop+chartHeight); xAxis.setAttribute('x2',marginLeft+chartWidth); xAxis.setAttribute('y2',marginTop+chartHeight); xAxis.setAttribute('stroke','#000'); axis.appendChild(xAxis);
      for(let t=0;t<=100;t+=25){ const y=marginTop+chartHeight-(chartHeight*t/100); const tick=document.createElementNS(NS,'line'); tick.setAttribute('x1',marginLeft-5); tick.setAttribute('y1',y); tick.setAttribute('x2',marginLeft); tick.setAttribute('y2',y); tick.setAttribute('stroke','#000'); axis.appendChild(tick); const txt=document.createElementNS(NS,'text'); txt.setAttribute('x',marginLeft-10); txt.setAttribute('y',y+4); txt.setAttribute('text-anchor','end'); txt.setAttribute('font-size',fs*0.8); txt.textContent=t+'%'; axis.appendChild(txt);} const yTitle=document.createElementNS(NS,'text'); const yTitleX=fs*1.25; yTitle.setAttribute('x',yTitleX); yTitle.setAttribute('y',marginTop+chartHeight/2); yTitle.setAttribute('text-anchor','middle'); yTitle.setAttribute('transform',`rotate(-90 ${yTitleX} ${marginTop+chartHeight/2})`); yTitle.setAttribute('font-size',fs); yTitle.textContent='Percentage'; axis.appendChild(yTitle); svg.appendChild(axis);
      const barGap=10;
      const availableWidth=Math.max(0,chartWidth-(barHeaders.length+1)*barGap);
      const barWidth=barHeaders.length?Math.max(0,availableWidth/barHeaders.length):0;
      const xLabels=[];
      // Debug: stacked bar chart layout metrics
      console.debug('Debug: stacked bar layout metrics',{svgWidth,svgHeight,chartWidth,chartHeight,barCount:barHeaders.length,barWidth});
      const palette = getDefaultPalette();
      barHeaders.forEach((bh,j)=>{ let y=marginTop+chartHeight; const total=segmentValues.reduce((s,row)=>s+(row[j]||0),0); segmentLabels.forEach((lab,i)=>{ const val=segmentValues[i][j]||0; const frac=total?val/total:0; const h=chartHeight*frac; y-=h; const rect=document.createElementNS(NS,'rect'); rect.setAttribute('x',marginLeft+barGap+j*(barWidth+barGap)); rect.setAttribute('y',y); rect.setAttribute('width',barWidth); rect.setAttribute('height',h); const fillColor = state.colors[lab] || palette[i % palette.length]; rect.setAttribute('fill', fillColor); svg.appendChild(rect); if(showPerc && frac>0){ const txt=document.createElementNS(NS,'text'); txt.setAttribute('x',marginLeft+barGap+j*(barWidth+barGap)+barWidth/2); txt.setAttribute('y',y+h/2); txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size',fs*0.8); txt.textContent=(frac*100).toFixed(1)+'%'; svg.appendChild(txt);} }); const lbl=document.createElementNS(NS,'text'); const lx=marginLeft+barGap+j*(barWidth+barGap)+barWidth/2; const ly=marginTop+chartHeight+fs+4; lbl.setAttribute('x',lx); lbl.setAttribute('y',ly); lbl.setAttribute('text-anchor','middle'); lbl.setAttribute('font-size',fs); lbl.textContent=bh; svg.appendChild(lbl); xLabels.push(lbl); });
      // Title inline (editable)
      const title=document.createElementNS(NS,'text'); title.setAttribute('x',marginLeft+chartWidth/2); title.setAttribute('y',fs); title.setAttribute('text-anchor','middle'); title.setAttribute('font-size',fs+4); title.textContent=state.titleText; if(global.makeEditable) makeEditable(title,txt=>{state.titleText=txt;}); svg.appendChild(title);
      if(global.autoResizeSvg) global.autoResizeSvg(svg);
      // Stats for stacked: use selected value/expected columns across segments
      const vi=(parseInt($('#pieValueColumn').value||'1',10)-1);
      const ei=(parseInt($('#pieExpectedColumn').value||'2',10)-1);
      const observed=segmentValues.map(row=>{ const v=row[vi]; return (typeof v==='number' && isFinite(v))?v:parseFloat(v)||0; });
      const expected=segmentValues.map(row=>{ const v=row[ei]; return (typeof v==='number' && isFinite(v))?v:parseFloat(v); });
      console.debug('Debug: stacked pie stats data',{vi,ei,observed,expected});
      updatePieStats(segmentLabels,observed,expected);
      return;
    }

    // Pie/Donut
    const valueColumn=$('#pieValueColumn'); const expectedColumn=$('#pieExpectedColumn'); const header=data[0]||[]; const values=[]; const expected=[]; const labels=[]; for(let r=1;r<data.length;r++){ const row=data[r]; if(row && row[0]!=null && row[0]!=='' ){ labels.push(String(row[0])); const vi=parseInt(valueColumn.value||'1',10); const ei=parseInt(expectedColumn.value||'2',10); const v=parseFloat(row[vi]); const e=parseFloat(row[ei]); values.push(isNaN(v)?0:v); expected.push(e); }} if(!values.length){ plotEl.innerHTML='<i>No data</i>'; return; } updatePieColorPickers(labels);
    const size=Math.min(Math.max(50,Math.floor(plotEl.clientWidth||50)), Math.max(50,Math.floor(plotEl.clientHeight||50))); const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','pieSvg'); svg.setAttribute('width',String(size)); svg.setAttribute('height',String(size)); svg.setAttribute('viewBox',`0 0 ${size} ${size}`); svg.setAttribute('font-family','sans-serif'); plotEl.appendChild(svg);
    const cx=size/2, cy=size/2; const r=type==='donut' ? size*0.32 : size*0.40; const rInner=type==='donut' ? r*0.6 : 0; const sum=values.reduce((a,b)=>a+b,0) || 1; let startAngle=startDeg*Math.PI/180;
    const palette2 = getDefaultPalette();
    labels.forEach((lab,i)=>{ const v=values[i]; const frac=v/sum; const endAngle=startAngle+2*Math.PI*frac; const x1=cx + r*Math.cos(startAngle); const y1=cy + r*Math.sin(startAngle); const x2=cx + r*Math.cos(endAngle); const y2=cy + r*Math.sin(endAngle); const largeArc = (endAngle-startAngle) > Math.PI ? 1 : 0; const path=document.createElementNS(NS,'path'); if(rInner>0){ const x1i=cx + rInner*Math.cos(startAngle); const y1i=cy + rInner*Math.sin(startAngle); const x2i=cx + rInner*Math.cos(endAngle); const y2i=cy + rInner*Math.sin(endAngle); const d=`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x2i} ${y2i} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x1i} ${y1i} Z`; path.setAttribute('d',d); } else { const d=`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`; path.setAttribute('d',d);} const fillColor = state.colors[lab] || palette2[i % palette2.length]; path.setAttribute('fill', fillColor); svg.appendChild(path); if(showPerc && frac>0){ const mid=(startAngle+endAngle)/2; const tx=cx + (rInner>0?(r+rInner)/2:r*0.65)*Math.cos(mid); const ty=cy + (rInner>0?(r+rInner)/2:r*0.65)*Math.sin(mid); const txt=document.createElementNS(NS,'text'); txt.setAttribute('x',tx); txt.setAttribute('y',ty); txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size',fs*0.8); txt.textContent=(frac*100).toFixed(1)+'%'; svg.appendChild(txt);} startAngle=endAngle; });
    const title=document.createElementNS(NS,'text'); title.setAttribute('x',cx); title.setAttribute('y',fs+2); title.setAttribute('text-anchor','middle'); title.setAttribute('font-size',fs+4); title.textContent=state.titleText; if(global.makeEditable) makeEditable(title,txt=>{state.titleText=txt;}); svg.appendChild(title);
    if(global.autoResizeSvg) global.autoResizeSvg(svg);
    // Stats for single pie/donut
    updatePieStats(labels, values, expected);
  }

  pie.draw = draw;
  pie.init = function init(){
    if (pie.ready) { console.debug('Debug: Components.pie.init skipped (already ready)'); return; }
    console.debug('Debug: Components.pie.init');
    // Placeholder to avoid early resizer callbacks failing
    state.scheduleDraw = ()=>{};
    ensureWrapperStyles();
    initTableAndResizers();
    initHot();
    initControls();
    state.scheduleDraw = Shared.debounceFrame(draw);
    console.debug('Debug: pie scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    pie.ready = true;
  };

  pie.ensure = function ensure(){ if (!pie.ready) pie.init(); };

})(window);
