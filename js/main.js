(function(){
  "use strict";
  console.debug("Debug: main.js loaded");// Debug: entry
  // Prefer shared debounce if available
  function debounceFrame(fn){
    if (window.Shared && typeof window.Shared.debounceFrame === 'function') {
      return window.Shared.debounceFrame(fn);
    }
    let frame;
    return (...args)=>{
      if(frame) cancelAnimationFrame(frame);
      console.debug('Debug: debounceFrame scheduled (local)', fn && fn.name, args.length);
      frame=requestAnimationFrame(()=>{
        console.debug('Debug: debounceFrame executing (local)', fn && fn.name);
        frame=null;
        try { fn && fn(...args); } catch(err){ console.error('debounceFrame error', err); }
      });
    };
  }
  // Predeclare to avoid TDZ/ReferenceError if wrapped later or guarded
  const scheduleDrawBoxplot = debounceFrame(() => {
    if (window.Components && window.Components.box && typeof window.Components.box.draw === 'function') {
      window.Components.box.draw();
    }
  });
  const scheduleDrawScatter = debounceFrame(() => {
    if (window.Components && window.Components.scatter && typeof window.Components.scatter.draw === 'function') {
      window.Components.scatter.draw();
    }
  });
  const scheduleDrawPca = debounceFrame(() => {
    if (window.Components && window.Components.pca && typeof window.Components.pca.draw === 'function') {
      window.Components.pca.draw();
    }
  });
  const scheduleDrawLine = debounceFrame(() => {
    try {
      if (window.Components && window.Components.line && typeof window.Components.line.draw === 'function') {
        window.Components.line.draw();
      }
    } catch (e) {
      console.error('scheduleDrawLine error', e);
    }
  });
  // Delegate to components if present
  const scheduleDrawHist = debounceFrame(() => {
    if (window.Components && window.Components.hist && typeof window.Components.hist.draw === 'function') {
      window.Components.hist.draw();
    }
  });
  const scheduleDrawPie = debounceFrame(() => {
    if (window.Components && window.Components.pie && typeof window.Components.pie.draw === 'function') {
      window.Components.pie.draw();
    }
  });
  // Shared default color palette used by Scatter/Line/PCA/ROC/Pie
  // Ensure both a global property and a local binding exist before any draw calls
  var DEFAULT_SCATTER_COLORS = window.DEFAULT_SCATTER_COLORS || ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
  window.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
  // Back-compat shim for color picker overlay used by components
  function attachColorPickerNear(el){
    if (window.Shared && typeof window.Shared.attachColorPickerNear === 'function') {
      window.Shared.attachColorPickerNear(el);
    }
  }
  window.attachColorPickerNear = attachColorPickerNear;
  (function initColorOverlay(){
    if (window.Shared && typeof window.Shared.initColorPickerOverlay === 'function') {
      const overlay = window.Shared.initColorPickerOverlay();
      document.querySelectorAll('input[type="color"]').forEach(el=>{
        if(el!==overlay) attachColorPickerNear(el);
      });
      console.debug('Debug: color overlay initialised', { overlay: !!overlay });
    }
  })();
  let boxplotDrawToken=0; // debug: track boxplot render cycles
  let pcaDrawToken=0; // debug: track pca render cycles
  let histDrawToken=0; // debug: track histogram render cycles
  let pieDrawToken=0; // debug: track pie render cycles
  const fallbackDollar = (selector) => {
    const el = document.querySelector(selector);
    console.debug('Debug: fallback $ helper used', { selector, found: !!el });
    return el;
  };
  const hasCustomDollar = (typeof window.$ === 'function') && !(window.$.fn && window.$.fn.jquery);
  const $ = hasCustomDollar ? window.$ : fallbackDollar;
  if (!hasCustomDollar) {
    window.$ = fallbackDollar;
    console.debug('Debug: window.$ fallback installed');
  }
  const stage = $('#stage');
  const vennPage=$('#vennPage');
  const boxPage=$('#boxPage');
  const scatterPage=$('#scatterPage');
  const pcaPage=$('#pcaPage');
  const linePage=$('#linePage');
  const rocPage=$('#rocPage');
  const histPage=$('#histPage');
  const piePage=$('#piePage');
  const histStatsResults=$('#histStatsResults');
  const pieStatsResults=$('#pieStatsResults');
  const tabVenn=$('#tabVenn');
  const tabBox=$('#tabBox');
  const tabScatter=$('#tabScatter');
  const tabPca=$('#tabPca');
  const tabLine=$('#tabLine');
  const tabRoc=$('#tabRoc');
  const tabHist=$('#tabHist');
  const tabPie=$('#tabPie');
  // Shared defaults and SVG namespace used by multiple sections
  const NS='http://www.w3.org/2000/svg';
  const DEFAULT_ROWS=100, DEFAULT_COLS=10, LINE_DEFAULT_COLS=6, HIST_DEFAULT_COLS=1, PIE_DEFAULT_COLS=6, ROC_DEFAULT_COLS=3, PCA_DEFAULT_COLS=5;
  if (!(window.Components && window.Components.box && window.Components.box.__installed)) {
    console.warn('Debug: Box component missing after fallback removal');
  }

  // If Box component is installed (legacy skipped), bootstrap components here
  (function bootstrapComponentsOutside(){
    try{
      const comps = window.Components || {};
      if (comps.scatter && typeof comps.scatter.init === 'function') comps.scatter.init();
      if (comps.pca && typeof comps.pca.init === 'function') comps.pca.init();
      if (comps.box && typeof comps.box.init === 'function') comps.box.init();
      if (comps.hist && typeof comps.hist.init === 'function') comps.hist.init();
      if (comps.pie && typeof comps.pie.init === 'function') comps.pie.init();
      if (comps.line && typeof comps.line.init === 'function') comps.line.init();
      if (comps.roc && typeof comps.roc.init === 'function') comps.roc.init();
      if (comps.venn && typeof comps.venn.init === 'function') comps.venn.init();
    }catch(err){ console.error('Components bootstrap (outside) error', err); }
  })();

  // Histogram setup
  if (!(window.Components && window.Components.hist && window.Components.hist.__installed)) {
    console.warn('Debug: Histogram component missing after fallback removal');
  }

  if (!(window.Components && window.Components.pie && window.Components.pie.__installed)) {
    console.warn('Debug: Pie component missing after fallback removal');
  }



  Chart.defaults.locale='en-US';

  const sharedNamespace = window.Shared = window.Shared || {};
  const sharedFileIO = sharedNamespace.fileIO = sharedNamespace.fileIO || {};
  if(sharedFileIO.downloadJSON && sharedFileIO.verifyPermission){
    window.downloadJSON = sharedFileIO.downloadJSON;
    window.verifyPermission = sharedFileIO.verifyPermission;
    console.debug('Debug: main.js bound shared fileIO helpers', {
      hasDownload: typeof window.downloadJSON === 'function',
      hasVerify: typeof window.verifyPermission === 'function'
    });
  } else {
    console.debug('Debug: Shared.fileIO helpers not yet registered');
  }

  function showVenn(){
    vennPage.style.display='block';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabVenn.classList.add('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabPca.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.venn && typeof window.Components.venn.ensure === 'function') {
        window.Components.venn.ensure();
      }
    }catch(e){ console.error('showVenn ensure error', e); }
  }
  function showBox(){
    vennPage.style.display='none';
    boxPage.style.display='block';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabBox.classList.add('active');
    tabVenn.classList.remove('active');
    tabScatter.classList.remove('active');
    tabPca.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.box && typeof window.Components.box.ensure === 'function') {
        window.Components.box.ensure();
      }
      console.debug('Debug: showBox scheduling draw');
      scheduleDrawBoxplot();
    }catch(e){ console.error('showBox schedule error', e); }
  }
  function showScatter(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='block';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabScatter.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabPca.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.scatter && typeof window.Components.scatter.ensure === 'function') {
        window.Components.scatter.ensure();
        scheduleDrawScatter();
      }
    }catch(e){ console.error('showScatter ensure error', e); }
  }
  function showPca(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='block';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabPca.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.pca && typeof window.Components.pca.ensure === 'function') {
        window.Components.pca.ensure();
        scheduleDrawPca();
      }
    }catch(e){ console.error('showPca ensure error', e); }
  }
  function showLine(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='block';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='none';
    tabLine.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabPca.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.line && typeof window.Components.line.ensure === 'function') {
        window.Components.line.ensure();
        scheduleDrawLine();
      }
    }catch(e){ console.error('showLine ensure error', e); }
  }
  function showRoc(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='block';
    histPage.style.display='none';
    piePage.style.display='none';
    tabRoc.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabLine.classList.remove('active');
    tabPca.classList.remove('active');
    tabHist.classList.remove('active');
    tabPie.classList.remove('active');
  }
  function showHist(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='block';
    piePage.style.display='none';
    tabHist.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabPca.classList.remove('active');
    tabPie.classList.remove('active');
    try{
      if (window.Components && window.Components.hist && typeof window.Components.hist.ensure === 'function') {
        window.Components.hist.ensure();
      }
      console.debug('Debug: showHist scheduling draw');
      scheduleDrawHist();
    }catch(e){ console.error('showHist schedule error', e); }
  }
  function showPie(){
    vennPage.style.display='none';
    boxPage.style.display='none';
    scatterPage.style.display='none';
    pcaPage.style.display='none';
    linePage.style.display='none';
    rocPage.style.display='none';
    histPage.style.display='none';
    piePage.style.display='block';
    tabPie.classList.add('active');
    tabVenn.classList.remove('active');
    tabBox.classList.remove('active');
    tabScatter.classList.remove('active');
    tabLine.classList.remove('active');
    tabRoc.classList.remove('active');
    tabHist.classList.remove('active');
    tabPca.classList.remove('active');
    try{
      if (window.Components && window.Components.pie && typeof window.Components.pie.ensure === 'function') {
        window.Components.pie.ensure();
      }
      scheduleDrawPie();
    }catch(e){ console.error('showPie schedule error', e); }
  }
  tabVenn.addEventListener('click',()=>{ showVenn();});
  tabBox.addEventListener('click',()=>{ showBox();});
  tabScatter.addEventListener('click',()=>{ showScatter();});
  tabPca.addEventListener('click',()=>{ showPca();});
  tabLine.addEventListener('click',()=>{ showLine();});
  tabRoc.addEventListener('click',()=>{ showRoc();});
  tabHist.addEventListener('click',()=>{ showHist();});
  tabPie.addEventListener('click',()=>{ showPie();});
  showVenn();
  function makeEditable(el,onChange){
    el.style.cursor='pointer';
    el.addEventListener('dblclick',()=>{
      const txt=prompt('Edit text',el.textContent);
      if(txt!==null){
        el.textContent=txt;
        onChange(txt);
      }
    });
  }
  window.makeEditable = makeEditable;
  function autoResizeSvg(svg, opts={}){
    try{
      const {fill=true}=opts;
      const applyResize=()=>{
        const bbox=svg.getBBox();
        const padding=10;
        const minX=Math.min(0,bbox.x-padding);
        const minY=Math.min(0,bbox.y-padding);
        const viewW=bbox.x+bbox.width+padding-minX;
        const viewH=bbox.y+bbox.height+padding-minY;
        svg.setAttribute('viewBox',`${minX} ${minY} ${viewW} ${viewH}`);
        if(fill){
          svg.setAttribute('width','100%');
          svg.setAttribute('height','100%');
        }
        const parent=svg.parentElement;
        if(parent) parent.style.overflow='visible';
        const box=svg.closest('.svgbox');
        if(box) box.style.overflow='visible';
        console.log('autoResizeSvg applied',{bbox,minX,minY,viewW,viewH,fill,parentW:parent?.clientWidth,parentH:parent?.clientHeight});
      };
      applyResize();
      requestAnimationFrame(applyResize);
    }catch(err){console.error('autoResizeSvg error',err);}
  }
  window.autoResizeSvg = autoResizeSvg;
  function serializeCleanSVG(svgEl){
    const clone = svgEl.cloneNode(true);
    clone.querySelectorAll('[contenteditable],[contentEditable]').forEach(el=>{
      el.removeAttribute('contenteditable');
      el.removeAttribute('contentEditable');
    });
    return new XMLSerializer().serializeToString(clone);
  }
  window.serializeCleanSVG = serializeCleanSVG;
  if (!(window.Components && window.Components.box && window.Components.box.__installed)) {
    console.warn('Debug: Box component missing after fallback removal (draw)');
  }
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      drawFromLists();
    }
  });
})();
