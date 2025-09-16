(function(global){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const venn = Components.venn = Components.venn || {};
  venn.__installed = true; // signal to legacy code to skip
  venn.ready = false;

  // Local state scoped to component
  let state = {
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'venn.graph',
    goChart: null,
    lastStringSVG: null,
    lastRegions: null,
    lastCounts: null,
    lastDrawMode: null,
  };

  function initResizers(){
    const stage = document.getElementById('stage');
    const vennContainer = stage?.closest('.svgbox') || stage?.parentElement;
    if (global.Shared && Shared.attachResizableBox && vennContainer) {
      Shared.attachResizableBox(vennContainer);
      console.debug('Debug: venn resizer attached');
    }
  }

  venn.init = function init(){
    if (venn.ready) { console.debug('Debug: Components.venn.init skipped (already ready)'); return; }
    console.debug('Debug: Components.venn.init');

    // Resizers are already handled by legacy main.js for Venn; avoid double-attach
    console.debug('Debug: venn resizer handled by main.js');

    // Defer drawing if Shared debounce is available
    state.scheduleDraw = (Shared && Shared.debounceFrame) ? Shared.debounceFrame(refreshDiagram) : refreshDiagram;

    // Begin migrated logic from main.js (kept as close as possible to preserve behavior)
    try{
      Chart.defaults.locale='en-US';
    }catch(e){ /* Chart may not be loaded until needed */ }

    const $ = global.$;
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
    const goCategoryChecks=Array.from(document.querySelectorAll('.goCategory'));
    const stringOptsBtn=$('#stringOptsBtn'), stringOptions=$('#stringOptions');

    function handlePlainPaste(e){ e.preventDefault(); const text=(e.clipboardData||global.clipboardData).getData('text/plain').replace(/\r/g,'').replace(/\u00A0/g,' '); document.execCommand('insertText', false, text); }
    [inputs.A,inputs.B,inputs.C].forEach(el=>el&&el.addEventListener('paste',handlePlainPaste));

    const STYLE_KEY='vennStylePrefs';
    function loadStylePrefs(){
      try{
        const saved=JSON.parse(localStorage.getItem(STYLE_KEY));
        if(saved){ if(saved.colorA) inputs.colorA.value=saved.colorA; if(saved.colorB) inputs.colorB.value=saved.colorB; if(saved.colorC) inputs.colorC.value=saved.colorC; if(saved.opacity) inputs.opacity.value=saved.opacity; if(saved.fontsize) inputs.fontsize.value=saved.fontsize; if(saved.borderColor) inputs.borderColor.value=saved.borderColor; if(saved.borderWidth) inputs.borderWidth.value=saved.borderWidth; }
        inputs.opacityVal.textContent=inputs.opacity.value; inputs.fontsizeVal.textContent=inputs.fontsize.value; inputs.borderWidthVal.textContent=inputs.borderWidth.value;
      }catch(err){}
    }
    function saveStylePrefs(){ const prefs={ colorA: inputs.colorA.value, colorB: inputs.colorB.value, colorC: inputs.colorC.value, opacity: inputs.opacity.value, fontsize: inputs.fontsize.value, borderColor: inputs.borderColor.value, borderWidth: inputs.borderWidth.value }; try{ localStorage.setItem(STYLE_KEY, JSON.stringify(prefs)); }catch(err){} }
    loadStylePrefs();
    inputs.opacity.addEventListener('input',()=>{ inputs.opacityVal.textContent=inputs.opacity.value; refreshDiagram(); saveStylePrefs(); });
    inputs.fontsize.addEventListener('input',()=>{ inputs.fontsizeVal.textContent=inputs.fontsize.value; refreshDiagram(); saveStylePrefs(); });
    ['colorA','colorB','colorC'].forEach(id=>{ inputs[id].addEventListener('input',()=>{ refreshDiagram(); saveStylePrefs(); }); });
    ['labelA','labelB','labelC'].forEach(id=>{ inputs[id].addEventListener('input',()=>{ const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'}; const API=(global.Components&&global.Components.venn)||{}; (API.updateColorLabels||global.updateColorLabels||(()=>{}))(labels); (API.updateRegionSelect||global.updateRegionSelect||(()=>{}))(labels); (API.updateCountLabels||global.updateCountLabels||(()=>{}))(labels); }); });
    { const labels={A:inputs.labelA.value||'A',B:inputs.labelB.value||'B',C:inputs.labelC.value||'C'}; const API=(global.Components&&global.Components.venn)||{}; (API.updateColorLabels||global.updateColorLabels||(()=>{}))(labels); }
    inputs.borderColor.addEventListener('input',()=>{ refreshDiagram(); saveStylePrefs(); });
    inputs.borderWidth.addEventListener('input',()=>{ inputs.borderWidthVal.textContent=inputs.borderWidth.value; refreshDiagram(); saveStylePrefs(); });

    function splitItems(text, mode){ if(mode==='newline') return text.split(/\r?\n/); if(mode==='comma') return text.split(/,/); if(mode==='tab') return text.split(/\t/); if(mode==='space') return text.split(/\s+/); return text.split(/[\r\n,\t;\s]+/); }
    function parseList(raw, cs, mode){ const arr = splitItems(raw.trim(), mode).map(s=>s.trim()).filter(Boolean); const seen=new Set(), out=[]; for(const x of arr){ const key=cs?x:x.toLowerCase(); if(!seen.has(key)){ seen.add(key); out.push({key,val:x}); } } return out; }
    function setsFromLists(listA, listB, listC){ const mapA=new Map(listA.map(o=>[o.key,o.val])); const mapB=new Map(listB.map(o=>[o.key,o.val])); const mapC=new Map(listC.map(o=>[o.key,o.val])); const keysA=new Set(mapA.keys()), keysB=new Set(mapB.keys()), keysC=new Set(mapC.keys()); const A=new Set(),B=new Set(),C=new Set(),Aonly=new Set(),Bonly=new Set(),Conly=new Set(),AB=new Set(),AC=new Set(),BC=new Set(),ABC=new Set(); keysA.forEach(k=>{ if(keysB.has(k)&&keysC.has(k)) ABC.add(mapA.get(k)); else if(keysB.has(k)) AB.add(mapA.get(k)); else if(keysC.has(k)) AC.add(mapA.get(k)); else Aonly.add(mapA.get(k)); A.add(mapA.get(k)); }); keysB.forEach(k=>{ if(!keysA.has(k)&&!keysC.has(k)){ Bonly.add(mapB.get(k)); } B.add(mapB.get(k)); }); keysC.forEach(k=>{ if(!keysA.has(k)&&!keysB.has(k)){ Conly.add(mapC.get(k)); } C.add(mapC.get(k)); }); keysB.forEach(k=>{ if(keysC.has(k)&&!keysA.has(k)) BC.add(mapB.get(k)); }); return {A,B,C,Aonly,Bonly,Conly,AB,AC,BC,ABC}; }

    const stage = document.getElementById('stage');
    function clearSVG(){ while(stage.firstChild) stage.removeChild(stage.firstChild); }
    function makeEl(tag,attrs={},parent=stage){ const el=document.createElementNS(NS,tag); for(const[k,v] of Object.entries(attrs)) el.setAttribute(k,String(v)); parent.appendChild(el); return el; }
    function enableDrag(el){ let drag=false,start={x:0,y:0},orig={x:0,y:0}; el.addEventListener('mousedown',e=>{drag=true; const pt=stage.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const loc=pt.matrixTransform(stage.getScreenCTM().inverse()); start={x:loc.x,y:loc.y}; orig={x:parseFloat(el.getAttribute('x')||'0'),y:parseFloat(el.getAttribute('y')||'0')}; e.preventDefault();}); global.addEventListener('mousemove',e=>{ if(!drag) return; const pt=stage.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const loc=pt.matrixTransform(stage.getScreenCTM().inverse()); el.setAttribute('x',String(orig.x+(loc.x-start.x))); el.setAttribute('y',String(orig.y+(loc.y-start.y))); }); global.addEventListener('mouseup',()=>{drag=false;}); }

    // Fallbacks wired to legacy globals if present
    function resolveAPI(){
      const A = (global.Components && global.Components.venn) || {};
      return {
        layoutFromCounts: A.layoutFromCounts || global.layoutFromCounts,
        fitAndDraw: A.fitAndDraw || global.fitAndDraw,
        refreshCounts: A.refreshCounts || global.refreshCounts,
        updateColorLabels: A.updateColorLabels || global.updateColorLabels,
        updateRegionSelect: A.updateRegionSelect || global.updateRegionSelect,
        updateCountLabels: A.updateCountLabels || global.updateCountLabels,
        setSpeciesIndicator: A.setSpeciesIndicator || global.setSpeciesIndicator,
        recognizeSpeciesFromInput: A.recognizeSpeciesFromInput || global.recognizeSpeciesFromInput,
        clearAnalysis: A.clearAnalysis || global.clearAnalysis,
        serializeCleanSVG: A.serializeCleanSVG || global.serializeCleanSVG,
        getRegionText: A.getRegionText || global.getRegionText,
        getAllGenes: A.getAllGenes || global.getAllGenes,
        guessSpecies: A.guessSpecies || global.guessSpecies,
        runGOAnalysis: A.runGOAnalysis || global.runGOAnalysis,
        runStringAnalysis: A.runStringAnalysis || global.runStringAnalysis,
        exportGoChart: A.exportGoChart || global.exportGoChart,
        downloadStringPNG: A.downloadStringPNG || global.downloadStringPNG,
        downloadStringSVG: A.downloadStringSVG || global.downloadStringSVG,
        drawFromLists: A.drawFromLists || global.drawFromLists,
        drawFromNumeric: A.drawFromNumeric || global.drawFromNumeric,
      };
    }

    // Minimal bridge draw: call legacy functions to keep behavior identical
    function refreshDiagram(){
      try{
        const api = resolveAPI();
        const hasLists = !!(inputs.A.value || inputs.B.value || inputs.C.value);
        if (hasLists && typeof api.drawFromLists === 'function') {
          api.drawFromLists();
        } else if (typeof api.drawFromNumeric === 'function') {
          api.drawFromNumeric();
        } else {
          console.warn('Debug: venn refreshDiagram fallback missing draw functions');
        }
        console.debug('Debug: venn refreshDiagram done');
      }catch(err){ console.error('venn refreshDiagram error',err); }
    }

    // Exports and bindings
    function getVennGraphPayload(){ return { type:'venn', data:{ labelA:inputs.labelA.value, labelB:inputs.labelB.value, labelC:inputs.labelC.value, listA:inputs.A.value, listB:inputs.B.value, listC:inputs.C.value, nA:inputs.counts.nA.value, nB:inputs.counts.nB.value, nC:inputs.counts.nC.value, nAB:inputs.counts.nAB.value, nAC:inputs.counts.nAC.value, nBC:inputs.counts.nBC.value, nABC:inputs.counts.nABC.value }, style:{ colorA:inputs.colorA.value, colorB:inputs.colorB.value, colorC:inputs.colorC.value, opacity:inputs.opacity.value, borderColor:inputs.borderColor.value, borderWidth:inputs.borderWidth.value, fontsize:inputs.fontsize.value } }; }
    venn.save = async function(){ const payload=getVennGraphPayload(); console.log('saveVennFile',{payload,handle:state.fileHandle}); if(state.fileHandle&&state.fileHandle.createWritable){ try{ const perm=await global.verifyPermission(state.fileHandle,true); if(perm){ const w=await state.fileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close(); } }catch(err){console.error('saveVennFile error',err);} } else if(global.showSaveFilePicker){ await venn.saveAs(); } else { if(global.downloadJSON) global.downloadJSON(payload,state.fileName); } };
    venn.saveAs = async function(){ const payload=getVennGraphPayload(); console.log('saveAsVennFile',payload); if(global.showSaveFilePicker){ try{ state.fileHandle=await global.showSaveFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}],suggestedName:state.fileName}); const w=await state.fileHandle.createWritable(); await w.write(JSON.stringify(payload)); await w.close(); }catch(err){console.error('saveAsVennFile error',err);} } else { if(global.downloadJSON) global.downloadJSON(payload,state.fileName); } };
    venn.open = async function(){ if(global.showOpenFilePicker){ try{ [state.fileHandle]=await global.showOpenFilePicker({types:[{description:'Graph Files',accept:{'application/json':['.graph']}}]}); const file=await state.fileHandle.getFile(); state.fileName=file.name; venn.loadFromFile(file); }catch(err){console.error('openVennFile error',err);} } else { const input=document.getElementById('vennGraphFile'); input.value=''; input.click(); } };
    venn.loadFromFile = function(file){ const reader=new FileReader(); reader.onload=e=>{ try{ const obj=JSON.parse(e.target.result); console.log('loadVennGraph',obj); if(obj.type!=='venn') throw new Error('Invalid graph type'); const d=obj.data||{}; inputs.labelA.value=d.labelA||''; inputs.labelB.value=d.labelB||''; inputs.labelC.value=d.labelC||''; inputs.A.value=d.listA||''; inputs.B.value=d.listB||''; inputs.C.value=d.listC||''; const c=inputs.counts; c.nA.value=d.nA||0; c.nB.value=d.nB||0; c.nC.value=d.nC||0; c.nAB.value=d.nAB||0; c.nAC.value=d.nAC||0; c.nBC.value=d.nBC||0; c.nABC.value=d.nABC||0; const s=obj.style||{}; inputs.colorA.value=s.colorA||inputs.colorA.value; inputs.colorB.value=s.colorB||inputs.colorB.value; inputs.colorC.value=s.colorC||inputs.colorC.value; inputs.opacity.value=s.opacity||inputs.opacity.value; inputs.opacityVal.textContent=inputs.opacity.value; inputs.borderColor.value=s.borderColor||inputs.borderColor.value; inputs.borderWidth.value=s.borderWidth||inputs.borderWidth.value; inputs.borderWidthVal.textContent=inputs.borderWidth.value; inputs.fontsize.value=s.fontsize||inputs.fontsize.value; inputs.fontsizeVal.textContent=inputs.fontsize.value; refreshDiagram(); }catch(err){console.error('loadVennGraph error',err); } }; reader.readAsText(file); };

    $('#draw').addEventListener('click',refreshDiagram);
    $('#useNumeric').addEventListener('click',refreshDiagram);
    $('#exportSVG').addEventListener('click',()=>{ try{ const svgEl=document.getElementById('stage'); const xml=(global.serializeCleanSVG?global.serializeCleanSVG(svgEl):new XMLSerializer().serializeToString(svgEl)); const blob=new Blob([xml],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='venn.svg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000); }catch(err){ console.error('venn exportSVG error',err); } });
    $('#exportPNG').addEventListener('click',async()=>{ try{ const svgEl=document.getElementById('stage'); const W=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800; const H=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400; const xml=(global.serializeCleanSVG?global.serializeCleanSVG(svgEl):new XMLSerializer().serializeToString(svgEl)); const img=new Image(); const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml); img.src=url; await img.decode().catch(err=>{console.error('vennPNG svg decode',err);}); const c=document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d'); ctx.drawImage(img,0,0); c.toBlob(b=>{ const pngUrl=URL.createObjectURL(b); const a=document.createElement('a'); a.href=pngUrl; a.download='venn.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(pngUrl),5000); },'image/png'); }catch(err){ console.error('venn exportPNG error',err); } });
    document.getElementById('openVenn').addEventListener('click',venn.open);
    document.getElementById('saveVenn').addEventListener('click',venn.save);
    document.getElementById('saveAsVenn').addEventListener('click',venn.saveAs);
    document.getElementById('vennGraphFile').addEventListener('change',e=>{ const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; venn.loadFromFile(f); }});

    // GO/STRING and significance buttons hook into existing global implementations
    document.getElementById('goChartPNG').addEventListener('click',()=>{ try{ const api=resolveAPI(); if(api.exportGoChart) api.exportGoChart('png'); }catch(err){ console.error('goChartPNG error',err); } });
    document.getElementById('goChartSVG').addEventListener('click',()=>{ try{ const api=resolveAPI(); if(api.exportGoChart) api.exportGoChart('svg'); }catch(err){ console.error('goChartSVG error',err); } });
    document.getElementById('stringPNG').addEventListener('click',()=>{ try{ const api=resolveAPI(); if(api.downloadStringPNG) api.downloadStringPNG(); }catch(err){ console.error('stringPNG error',err); } });
    document.getElementById('stringSVG').addEventListener('click',()=>{ try{ const api=resolveAPI(); if(api.downloadStringSVG) api.downloadStringSVG(); }catch(err){ console.error('stringSVG error',err); } });
    const calcBtn=document.getElementById('calcSignificance'); if(calcBtn){ calcBtn.addEventListener('click',()=>{ try{ const api=resolveAPI(); if(api.calculateSignificance) api.calculateSignificance(); }catch(err){ console.error('calcSignificance error',err); } }); }

    // Run analyses buttons
    const goBtn=document.getElementById('goBtn');
    const stringBtn=document.getElementById('stringBtn');
    if(goBtn){
      goBtn.addEventListener('click', async ()=>{
        try{
          const regionSelect=document.getElementById('regionSelect');
          const speciesSelect=document.getElementById('speciesSelect');
          const api=resolveAPI();
          const regionGenes=(api.getRegionText?api.getRegionText(regionSelect.value):'').split(/\n/).map(g=>g.trim()).filter(Boolean);
          let organism=speciesSelect.value;
          if(!organism){
            const getAll=api.getAllGenes?api.getAllGenes():[];
            const guess=(getAll.length && api.guessSpecies)?await api.guessSpecies(getAll):null;
            if(guess){ speciesSelect.value=organism=guess; if(api.setSpeciesIndicator) api.setSpeciesIndicator(true); }
            else { if(api.setSpeciesIndicator) api.setSpeciesIndicator(false); alert('Please select a species before running GO analysis.'); return; }
          }
          if(api.runGOAnalysis) api.runGOAnalysis(regionGenes, organism);
        }catch(err){ console.error('goBtn error',err); }
      });
    }
    if(stringBtn){
      stringBtn.addEventListener('click', async ()=>{
        try{
          const regionSelect=document.getElementById('regionSelect');
          const speciesSelect=document.getElementById('speciesSelect');
          const api=resolveAPI();
          const regionGenes=(api.getRegionText?api.getRegionText(regionSelect.value):'').split(/\n/).map(g=>g.trim()).filter(Boolean);
          let organism=speciesSelect.value;
          if(!organism){
            const getAll=api.getAllGenes?api.getAllGenes():[];
            const guess=(getAll.length && api.guessSpecies)?await api.guessSpecies(getAll):null;
            if(guess){ speciesSelect.value=organism=guess; if(api.setSpeciesIndicator) api.setSpeciesIndicator(true); }
            else { if(api.setSpeciesIndicator) api.setSpeciesIndicator(false); alert('Please select a species before running STRING analysis.'); return; }
          }
          if(api.runStringAnalysis) api.runStringAnalysis(regionGenes, organism);
        }catch(err){ console.error('stringBtn error',err); }
      });
    }

    // Sample + reset
    document.getElementById('sample').addEventListener('click',()=>{ inputs.labelA.value='Transcriptomic'; inputs.labelB.value='Proteomic'; inputs.labelC.value='Phospho'; inputs.A.value=`BRCA1\nATM\nBAP1\nEZH2\nSUZ12\nRING1B`; inputs.B.value=`BRCA1\nBAP1\nRING1B\nCBX2\nHDAC1\nPAXIP1\nHUWE1`; inputs.C.value=`BRCA1\nPAXIP1\nCSNK2A1\nRING1B\nKAT7`; refreshDiagram(); });
    document.getElementById('reset').addEventListener('click',()=>{ inputs.A.value=''; inputs.B.value=''; inputs.C.value=''; Object.values(inputs.counts).forEach(x=>x.value=0); clearSVG(); state.lastRegions=null; state.lastDrawMode=null; state.lastCounts=null; const regionList=document.getElementById('regionList'); if(regionList) regionList.textContent=''; ['countA','countB','countC','countAB','countAC','countBC','countABC'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent='0'; }); (fallback.updateCountLabels||global.updateCountLabels)?.({A:'A',B:'B',C:'C'}); (fallback.updateColorLabels||global.updateColorLabels)?.({A:'A',B:'B',C:'C'}); (fallback.updateRegionSelect||global.updateRegionSelect)?.({A:'A',B:'B',C:'C'}); (fallback.clearAnalysis||global.clearAnalysis)?.(); const speciesSelect=$('#speciesSelect'); if(speciesSelect) speciesSelect.value=''; (fallback.setSpeciesIndicator||global.setSpeciesIndicator)?.(null); const totalGenesInput=$('#totalGenes'); if(totalGenesInput) totalGenesInput.value=''; const sigRes=$('#significanceResults'); if(sigRes) sigRes.innerHTML=''; });

    venn.ready = true;
  };

  venn.draw = function draw(){ try{ const fn=refreshDiagram; fn && fn(); } catch(e){ console.error('venn.draw error', e); } };
  venn.ensure = function ensure(){ if (!venn.ready) venn.init(); };

})(window);
