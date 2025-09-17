(function() {
  "use strict";
  console.debug("Debug: main.js loaded");

  const Shared = window.Shared = window.Shared || {};

  // Debounced draw schedulers (Shared.debounceFrame handles fallbacks internally)
  const scheduleDrawBoxplot = Shared.debounceFrame(() => {
    if (window.Components?.box?.draw) window.Components.box.draw();
  });
  const scheduleDrawScatter = Shared.debounceFrame(() => {
    if (window.Components?.scatter?.draw) window.Components.scatter.draw();
  });
  const scheduleDrawPca = Shared.debounceFrame(() => {
    if (window.Components?.pca?.draw) window.Components.pca.draw();
  });
  const scheduleDrawLine = Shared.debounceFrame(() => {
    if (window.Components?.line?.draw) window.Components.line.draw();
  });
  const scheduleDrawHist = Shared.debounceFrame(() => {
    if (window.Components?.hist?.draw) window.Components.hist.draw();
  });
  const scheduleDrawPie = Shared.debounceFrame(() => {
    if (window.Components?.pie?.draw) window.Components.pie.draw();
  });
  console.debug('Debug: main Shared.debounceFrame schedulers ready', { schedulers: ['boxplot','scatter','pca','line','hist','pie'] }); // Debug: scheduler wiring summary

  // Shared color palette
  const DEFAULT_SCATTER_COLORS = window.DEFAULT_SCATTER_COLORS || [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
    '#ffff33', '#a65628', '#f781bf', '#999999'
  ];
  window.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;

  // Color picker fallback
  function attachColorPickerNear(el) {
    if (window.Shared?.attachColorPickerNear) window.Shared.attachColorPickerNear(el);
  }
  window.attachColorPickerNear = attachColorPickerNear;

  // Initialize color overlay
  (function initColorOverlay() {
    if (window.Shared?.initColorPickerOverlay) {
      const overlay = window.Shared.initColorPickerOverlay();
      document.querySelectorAll('input[type="color"]').forEach(el => {
        if (el !== overlay) attachColorPickerNear(el);
      });
      console.debug('Debug: color overlay initialized', { overlay: !!overlay });
    }
  })();

  // Fallback for jQuery-like selector
  const fallbackDollar = (selector) => {
    const el = document.querySelector(selector);
    console.debug('Debug: fallback $ helper used', { selector, found: !!el });
    return el;
  };
  const hasCustomDollar = typeof window.$ === 'function' && !(window.$.fn?.jquery);
  const $ = hasCustomDollar ? window.$ : fallbackDollar;
  if (!hasCustomDollar) {
    window.$ = fallbackDollar;
    console.debug('Debug: window.$ fallback installed');
  }

  // DOM elements
  const stage = $('#stage');
  const vennPage = $('#vennPage');
  const boxPage = $('#boxPage');
  const scatterPage = $('#scatterPage');
  const pcaPage = $('#pcaPage');
  const linePage = $('#linePage');
  const rocPage = $('#rocPage');
  const histPage = $('#histPage');
  const piePage = $('#piePage');
  const histStatsResults = $('#histStatsResults');
  const pieStatsResults = $('#pieStatsResults');

  // Tab elements
  const tabVenn = $('#tabVenn');
  const tabBox = $('#tabBox');
  const tabScatter = $('#tabScatter');
  const tabPca = $('#tabPca');
  const tabLine = $('#tabLine');
  const tabRoc = $('#tabRoc');
  const tabHist = $('#tabHist');
  const tabPie = $('#tabPie');

  // Shared defaults
  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 10;
  const LINE_DEFAULT_COLS = 6;
  const HIST_DEFAULT_COLS = 1;
  const PIE_DEFAULT_COLS = 6;
  const ROC_DEFAULT_COLS = 3;
  const PCA_DEFAULT_COLS = 5;

  // Bootstrap components
  (function bootstrapComponentsOutside() {
    try {
      const comps = window.Components || {};
      if (comps.scatter?.init) comps.scatter.init();
      if (comps.pca?.init) comps.pca.init();
      if (comps.box?.init) comps.box.init();
      if (comps.hist?.init) comps.hist.init();
      if (comps.pie?.init) comps.pie.init();
      if (comps.line?.init) comps.line.init();
      if (comps.roc?.init) comps.roc.init();
      if (comps.venn?.init) comps.venn.init();
    } catch(err) { console.error('Components bootstrap (outside) error', err); }
  })();

  // Tab show functions
  function showPage(page, tab, ensureFn, drawFn) {
    [vennPage, boxPage, scatterPage, pcaPage, linePage, rocPage, histPage, piePage].forEach(p => p.style.display = 'none');
    [tabVenn, tabBox, tabScatter, tabPca, tabLine, tabRoc, tabHist, tabPie].forEach(t => t.classList.remove('active'));
    page.style.display = 'block';
    tab.classList.add('active');
    try {
      if (ensureFn) ensureFn();
      if (drawFn) drawFn();
    } catch(e) { console.error('showPage error', e); }
  }

  function showVenn() { showPage(vennPage, tabVenn, () => window.Components?.venn?.ensure()); }
  function showBox() { showPage(boxPage, tabBox, () => window.Components?.box?.ensure(), scheduleDrawBoxplot); }
  function showScatter() { showPage(scatterPage, tabScatter, () => window.Components?.scatter?.ensure(), scheduleDrawScatter); }
  function showPca() { showPage(pcaPage, tabPca, () => window.Components?.pca?.ensure(), scheduleDrawPca); }
  function showLine() { showPage(linePage, tabLine, () => window.Components?.line?.ensure(), scheduleDrawLine); }
  function showRoc() { showPage(rocPage, tabRoc); }
  function showHist() { showPage(histPage, tabHist, () => window.Components?.hist?.ensure(), scheduleDrawHist); }
  function showPie() { showPage(piePage, tabPie, () => window.Components?.pie?.ensure(), scheduleDrawPie); }

  // Event listeners
  tabVenn.addEventListener('click', showVenn);
  tabBox.addEventListener('click', showBox);
  tabScatter.addEventListener('click', showScatter);
  tabPca.addEventListener('click', showPca);
  tabLine.addEventListener('click', showLine);
  tabRoc.addEventListener('click', showRoc);
  tabHist.addEventListener('click', showHist);
  tabPie.addEventListener('click', showPie);

  // Utility functions
  function makeEditable(el, onChange) {
    el.style.cursor = 'pointer';
    el.addEventListener('dblclick', () => {
      const txt = prompt('Edit text', el.textContent);
      if (txt !== null) {
        el.textContent = txt;
        onChange(txt);
      }
    });
  }
  window.makeEditable = makeEditable;

  function autoResizeSvg(svg, opts = {}) {
    try {
      const { fill = true } = opts;
      const applyResize = () => {
        const bbox = svg.getBBox();
        const padding = 10;
        const minX = Math.min(0, bbox.x - padding);
        const minY = Math.min(0, bbox.y - padding);
        const viewW = bbox.x + bbox.width + padding - minX;
        const viewH = bbox.y + bbox.height + padding - minY;
        svg.setAttribute('viewBox', `${minX} ${minY} ${viewW} ${viewH}`);
        if (fill) {
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
        }
        const parent = svg.parentElement;
        if (parent) parent.style.overflow = 'visible';
        const box = svg.closest('.svgbox');
        if (box) box.style.overflow = 'visible';
        console.log('autoResizeSvg applied', { bbox, minX, minY, viewW, viewH, fill, parentW: parent?.clientWidth, parentH: parent?.clientHeight });
      };
      applyResize();
      requestAnimationFrame(applyResize);
    } catch(err) { console.error('autoResizeSvg error', err); }
  }
  window.autoResizeSvg = autoResizeSvg;

  function serializeCleanSVG(svgEl) {
    const clone = svgEl.cloneNode(true);
    clone.querySelectorAll('[contenteditable],[contentEditable]').forEach(el => {
      el.removeAttribute('contenteditable');
      el.removeAttribute('contentEditable');
    });
    return new XMLSerializer().serializeToString(clone);
  }
  window.serializeCleanSVG = serializeCleanSVG;

  // Initialize
  showVenn();
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      drawFromLists();
    }
  });
})();
