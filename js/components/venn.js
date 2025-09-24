(function(global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const Components = global.Components = global.Components || {};
  const venn = Components.venn = Components.venn || {};
  venn.__installed = true;
  venn.ready = false;

  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if (!fileIO.saveGraphFile) {
    console.debug('Debug: venn component awaiting Shared.fileIO helpers');
  }

  const debugLog = (label, payload) => {
    console.debug(`Debug: venn ${label}`, payload || {});
  };

  const state = {
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'venn.graph',
    goChart: null,
    lastStringSVG: null,
    lastRegions: null,
    lastCounts: null,
    lastDrawMode: null,
    inputs: null,
    countsUI: null,
    regionSelect: null,
    regionList: null,
    copyRegionBtn: null,
    goBtn: null,
    stringBtn: null,
    goResults: null,
    stringResults: null,
    stringNetwork: null,
    goChartExport: null,
    stringNetworkExport: null,
    tooltip: null,
    speciesSelect: null,
    totalGenesInput: null,
    significanceResults: null,
    calcSignificanceBtn: null,
    goCategoryChecks: [],
    goOptsBtn: null,
    goOptions: null,
    goUseAllBackground: null,
    stringOptsBtn: null,
    stringOptions: null,
    analysisResults: null,
    lastGOResult: null,
    lastGOFormatted: [],
    lastGOOrganism: 'hsapiens',
    stage: null,
    syncPanels: null,
    panelObserver: null,
    panelResizer: null,
    tablePanel: null,
    graphPanel: null,
    svgBox: null,
  };

  const DEFAULT_STAGE_WIDTH = 500;
  const DEFAULT_STAGE_HEIGHT = 340;
  const DEFAULT_STAGE_RATIO = DEFAULT_STAGE_WIDTH / DEFAULT_STAGE_HEIGHT;

  function parsePositiveFloat(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? value : NaN;
    }
    if (typeof value === 'string') {
      const numeric = Number.parseFloat(value);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : NaN;
    }
    return NaN;
  }

  // --- Core Functions ---

  function ensureInputs() {
    if (!state.inputs) throw new Error('Venn inputs not initialized');
    return state.inputs;
  }

  function splitItems(text, mode) {
    switch (mode) {
      case 'newline': return text.split(/\r?\n/);
      case 'comma': return text.split(/,/);
      case 'tab': return text.split(/\t/);
      case 'space': return text.split(/\s+/);
      default: return text.split(/[\r\n,\t;\s]+/);
    }
  }

  function parseList(raw, cs, mode) {
    const source = (raw || '').trim();
    if (!source) {
      debugLog('parseList empty', { rawLength: raw ? raw.length : 0 });
      return [];
    }
    const items = splitItems(source, mode).map(s => s.trim()).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const x of items) {
      const key = cs ? x : x.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ key, val: x });
      }
    }
    debugLog('parseList processed', { rawLength: source.length, unique: out.length });
    return out;
  }

  function setsFromLists(listA, listB, listC) {
    const mapA = new Map(listA.map(o => [o.key, o.val]));
    const mapB = new Map(listB.map(o => [o.key, o.val]));
    const mapC = new Map(listC.map(o => [o.key, o.val]));
    const keysA = new Set(mapA.keys());
    const keysB = new Set(mapB.keys());
    const keysC = new Set(mapC.keys());

    const inter = (S, T) => new Set([...S].filter(x => T.has(x)));
    const diff = (S, T) => new Set([...S].filter(x => !T.has(x)));
    const union = (S, T) => new Set([...S, ...T]);

    const ABCk = inter(inter(keysA, keysB), keysC);
    const ABk = diff(inter(keysA, keysB), keysC);
    const ACk = diff(inter(keysA, keysC), keysB);
    const BCk = diff(inter(keysB, keysC), keysA);
    const Aonlyk = diff(keysA, union(keysB, keysC));
    const Bonlyk = diff(keysB, union(keysA, keysC));
    const Conlyk = diff(keysC, union(keysA, keysB));

    const mapVal = (keys, map) => new Set([...keys].map(k => map.get(k)));

    const res = {
      A: mapVal(keysA, mapA),
      B: mapVal(keysB, mapB),
      C: mapVal(keysC, mapC),
      Aonly: mapVal(Aonlyk, mapA),
      Bonly: mapVal(Bonlyk, mapB),
      Conly: mapVal(Conlyk, mapC),
      AB: mapVal(ABk, mapA),
      AC: mapVal(ACk, mapA),
      BC: mapVal(BCk, mapB),
      ABC: mapVal(ABCk, mapA)
    };

    debugLog('setsFromLists computed', {
      sizes: {
        A: res.A.size,
        B: res.B.size,
        C: res.C.size,
        Aonly: res.Aonly.size,
        Bonly: res.Bonly.size,
        Conly: res.Conly.size,
        AB: res.AB.size,
        AC: res.AC.size,
        BC: res.BC.size,
        ABC: res.ABC.size
      }
    });

    return res;
  }

  function circleIntersectionArea(r1, r2, d) {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
    const a = 2 * Math.acos((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d));
    const b = 2 * Math.acos((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d));
    return 0.5 * r1 * r1 * (a - Math.sin(a)) + 0.5 * r2 * r2 * (b - Math.sin(b));
  }

  function distanceForOverlap(r1, r2, target) {
    const maxA = Math.PI * Math.min(r1, r2) ** 2;
    const t = Math.max(0, Math.min(target, maxA));
    let lo = Math.max(0, Math.abs(r1 - r2));
    let hi = r1 + r2;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      const A = circleIntersectionArea(r1, r2, m);
      if (A > t) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  function trilaterate(dAB, dAC, dBC) {
    const x = (dAB * dAB + dAC * dAC - dBC * dBC) / (2 * (dAB || 1e-6));
    const y2 = dAC * dAC - x * x;
    return { Ax: 0, Ay: 0, Bx: dAB, By: 0, Cx: x, Cy: Math.sqrt(Math.max(0, y2)) };
  }

  function layoutFromCounts(nA, nB, nC, nAB, nAC, nBC) {
    const rA = Math.sqrt(Math.max(nA, 0) / Math.PI);
    const rB = Math.sqrt(Math.max(nB, 0) / Math.PI);
    const rC = Math.sqrt(Math.max(nC, 0) / Math.PI);
    const dAB = distanceForOverlap(rA, rB, Math.max(nAB, 0));
    const dAC = distanceForOverlap(rA, rC, Math.max(nAC, 0));
    const dBC = distanceForOverlap(rB, rC, Math.max(nBC, 0));
    const result = { ...trilaterate(dAB, dAC, dBC), rA, rB, rC, dAB, dAC, dBC };
    debugLog('layoutFromCounts', { nA, nB, nC, nAB, nAC, nBC, radii: { rA, rB, rC }, distances: { dAB, dAC, dBC } });
    return result;
  }

  function clearSVG() {
    const stage = state.stage;
    if (!stage) return;
    while (stage.firstChild) stage.removeChild(stage.firstChild);
  }

  function makeEl(tag, attrs = {}, parent) {
    const stage = state.stage;
    if (!parent) parent = stage;
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    if (tag === 'text') {
      const fontFamily = chartStyle.FONT_FAMILY || 'Arial, Helvetica, sans-serif';
      if (fontFamily && !el.hasAttribute('font-family')) {
        el.setAttribute('font-family', fontFamily);
      }
      if (!el.hasAttribute('fill')) {
        const textColor = chartStyle.TEXT_COLOR || '#000000';
        el.setAttribute('fill', textColor);
      }
    }
    if (parent) parent.appendChild(el);
    return el;
  }

  function resolveFontInfo(rawSize) {
    const stageEl = state.stage;
    const fallbackSvgBox = stageEl?.closest?.('.svgbox') || state.graphPanel?.querySelector?.('.svgbox') || null;
    const svgBox = state.svgBox || fallbackSvgBox || null;
    if (!state.svgBox && svgBox) {
      state.svgBox = svgBox;
      console.debug('Debug: venn resolveFontInfo captured svgBox', { hasSvgBox: true });
    }
    const inputs = ensureInputs?.() || state.inputs || {};
    const fontInput = inputs.fontsize || state.inputs?.fontsize || document.getElementById('fontsize');
    if(fontInput && fontInput.dataset && typeof fontInput.dataset.fontBasePt === 'undefined'){
      fontInput.dataset.fontBasePt = String(fontInput.value || rawSize || '');
      console.debug('Debug: venn font size base ensured', { value: fontInput.value }); // Debug: ensure base dataset
    }
    const rect = svgBox?.getBoundingClientRect?.();
    const dataset = svgBox?.dataset || {};
    const parsedDefaultWidth = parsePositiveFloat(chartStyle.DEFAULT_WIDTH);
    const parsedDefaultHeight = parsePositiveFloat(chartStyle.DEFAULT_HEIGHT);
    const defaultWidth = parsePositiveFloat(dataset.resizerDefaultWidth)
      || (Number.isFinite(parsedDefaultWidth) ? parsedDefaultWidth : DEFAULT_STAGE_WIDTH);
    const defaultHeight = parsePositiveFloat(dataset.resizerDefaultHeight)
      || (Number.isFinite(parsedDefaultHeight) ? parsedDefaultHeight : DEFAULT_STAGE_HEIGHT);
    const width = parsePositiveFloat(rect?.width);
    const height = parsePositiveFloat(rect?.height);
    const storedWidth = parsePositiveFloat(dataset.resizerWidth);
    const storedHeight = parsePositiveFloat(dataset.resizerHeight);
    const effectiveWidth = Number.isFinite(width) ? width : storedWidth;
    const effectiveHeight = Number.isFinite(height) ? height : storedHeight;
    if (typeof chartStyle.resolveScaledFontSize === 'function') {
      const info = chartStyle.resolveScaledFontSize({
        rawSize,
        width: effectiveWidth,
        height: effectiveHeight,
        defaultWidth,
        defaultHeight,
        svgBox,
        input: fontInput
      });
      console.debug('Debug: venn resolveFontInfo scaled', {
        raw: rawSize,
        width: effectiveWidth,
        height: effectiveHeight,
        storedWidth,
        storedHeight,
        defaultWidth,
        defaultHeight,
        hasSvgBox: !!svgBox,
        styleScale: info?.scaleInfo?.styleScale,
        textLocked: info?.scaleInfo?.textLocked
      });
      return info;
    }
    let normalized = null;
    if (typeof chartStyle.normalizeFontSize === 'function') {
      normalized = chartStyle.normalizeFontSize(rawSize);
    } else {
      const basePt = chartStyle.BASE_FONT_SIZE_PT || 13;
      const numeric = Number(rawSize);
      const pt = Number.isFinite(numeric) ? numeric : basePt;
      const factor = chartStyle.PT_TO_PX || (96 / 72);
      const px = Number((pt * factor).toFixed(2));
      normalized = { pt, px };
    }
    const fallbackPx = Number.isFinite(normalized?.px) ? normalized.px : Number(normalized?.scaledPx);
    const safePx = Number.isFinite(fallbackPx) ? fallbackPx : 12;
    const safePt = Number.isFinite(normalized?.pt) ? normalized.pt : 12;
    const safeWidth = Number.isFinite(effectiveWidth) ? effectiveWidth : defaultWidth;
    const safeHeight = Number.isFinite(effectiveHeight) ? effectiveHeight : defaultHeight;
    const scaleX = Number.isFinite(defaultWidth) && defaultWidth > 0 ? safeWidth / defaultWidth : 1;
    const scaleY = Number.isFinite(defaultHeight) && defaultHeight > 0 ? safeHeight / defaultHeight : 1;
    const fallbackScaleInfo = {
      width: safeWidth,
      height: safeHeight,
      defaultWidth,
      defaultHeight,
      scaleX,
      scaleY,
      scaleW: scaleX,
      scaleH: scaleY,
      styleUnclamped: Math.sqrt(Math.max(scaleX * scaleY, 0)),
      styleScale: 1,
      scale: 1,
      radiusScale: 1,
      strokeScale: 1,
      legacyMinScale: Math.min(scaleX, scaleY),
      textScale: 1,
      textLocked: false
    };
    const info = {
      pt: safePt,
      px: normalized?.px ?? safePx,
      scaledPx: safePx,
      scaleInfo: fallbackScaleInfo
    };
    console.debug('Debug: venn resolveFontInfo fallback', {
      raw: rawSize,
      width: effectiveWidth,
      height: effectiveHeight,
      storedWidth,
      storedHeight,
      info
    });
    return info;
  }

  function enableDrag(el) {
    const stage = state.stage;
    if (!stage) return;
    let drag = false, start = { x: 0, y: 0 }, orig = { x: 0, y: 0 };
    el.style.cursor = 'move';
    el.addEventListener('mousedown', e => {
      drag = true;
      const pt = stage.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(stage.getScreenCTM().inverse());
      start = { x: loc.x, y: loc.y };
      orig = { x: parseFloat(el.getAttribute('x') || '0'), y: parseFloat(el.getAttribute('y') || '0') };
      e.preventDefault();
    });
    global.addEventListener('mousemove', e => {
      if (!drag) return;
      const pt = stage.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(stage.getScreenCTM().inverse());
      el.setAttribute('x', String(orig.x + (loc.x - start.x)));
      el.setAttribute('y', String(orig.y + (loc.y - start.y)));
    });
    global.addEventListener('mouseup', () => { drag = false; });
  }

  function _makeRegionSpec(code, cA, rA, cB, rB, cC, rC, hasC) {
    const spec = [];
    const inC = (ctr, r) => spec.push({ ctr, r, type: 'in' });
    const outC = (ctr, r) => spec.push({ ctr, r, type: 'out' });
    if (code === 'A') { inC(cA, rA); outC(cB, rB); if (hasC) outC(cC, rC); }
    if (code === 'B') { inC(cB, rB); outC(cA, rA); if (hasC) outC(cC, rC); }
    if (code === 'C') { inC(cC, rC); outC(cA, rA); outC(cB, rB); }
    if (code === 'AB') { inC(cA, rA); inC(cB, rB); if (hasC) outC(cC, rC); }
    if (code === 'AC') { inC(cA, rA); if (hasC) inC(cC, rC); outC(cB, rB); }
    if (code === 'BC') { inC(cB, rB); if (hasC) inC(cC, rC); outC(cA, rA); }
    if (code === 'ABC') { inC(cA, rA); inC(cB, rB); if (hasC) inC(cC, rC); }
    return spec;
  }

  function _signedDistToRegion(x, y, spec) {
    let minMargin = Infinity;
    for (const c of spec) {
      const dist = Math.hypot(x - c.ctr.x, y - c.ctr.y);
      const margin = (c.type === 'in') ? (c.r - dist) : (dist - c.r);
      if (margin < minMargin) minMargin = margin;
    }
    return minMargin;
  }

  function _bboxForSpec(spec) {
    const ins = spec.filter(c => c.type === 'in');
    if (!ins.length) return null;
    let b = { x1: -Infinity, y1: -Infinity, x2: Infinity, y2: Infinity };
    for (const c of ins) {
      const bb = { x1: c.ctr.x - c.r, y1: c.ctr.y - c.r, x2: c.ctr.x + c.r, y2: c.ctr.y + c.r };
      b = {
        x1: Math.max(b.x1, bb.x1),
        y1: Math.max(b.y1, bb.y1),
        x2: Math.min(b.x2, bb.x2),
        y2: Math.min(b.y2, bb.y2)
      };
    }
    if (b.x1 >= b.x2 || b.y1 >= b.y2) return null;
    return b;
  }

  function _polylabelRegion(spec, bbox, tolerancePx) {
    function makeCell(x, y, h) {
      const d = _signedDistToRegion(x, y, spec);
      return { x, y, h, d, max: d + h * Math.SQRT2 };
    }
    const width = bbox.x2 - bbox.x1;
    const height = bbox.y2 - bbox.y1;
    const size = Math.max(width, height);
    const h0 = size / 2;
    const nInit = 4;
    const step = size / nInit;
    const queue = [];
    function push(c) { queue.push(c); }
    function pop() { queue.sort((a, b) => b.max - a.max); return queue.shift(); }
    for (let x = bbox.x1; x < bbox.x2 + 1e-6; x += step) {
      for (let y = bbox.y1; y < bbox.y2 + 1e-6; y += step) {
        push(makeCell(x + step / 2, y + step / 2, step / 2));
      }
    }
    let best = makeCell((bbox.x1 + bbox.x2) / 2, (bbox.y1 + bbox.y2) / 2, h0);
    if (best.d < 0) {
      for (const c of queue) { if (c.d > best.d) best = c; }
    }
    while (queue.length) {
      const cell = pop();
      if (cell.d > best.d) best = cell;
      if (cell.max - best.d <= tolerancePx) continue;
      const h = cell.h / 2;
      push(makeCell(cell.x - h, cell.y - h, h));
      push(makeCell(cell.x + h, cell.y - h, h));
      push(makeCell(cell.x - h, cell.y + h, h));
      push(makeCell(cell.x + h, cell.y + h, h));
    }
    return { x: best.x, y: best.y };
  }

  function _findRegionLabelPoint(code, cA, rA, cB, rB, cC, rC, hasC, tolerancePx) {
    const spec = _makeRegionSpec(code, cA, rA, cB, rB, cC, rC, hasC);
    const bbox = _bboxForSpec(spec);
    if (!bbox) return null;
    const tol = Math.max(0.25, tolerancePx || 0.5);
    return _polylabelRegion(spec, bbox, tol);
  }

  function getRegionText(code) {
    if (!state.lastRegions) return '';
    const map = {
      A: state.lastRegions.Aonly,
      B: state.lastRegions.Bonly,
      C: state.lastRegions.Conly,
      AB: state.lastRegions.AB,
      AC: state.lastRegions.AC,
      BC: state.lastRegions.BC,
      ABC: state.lastRegions.ABC
    };
    const genes = [...(map[code] || new Set())];
    return genes.join('\n');
  }

  function populateRegion(code) {
    clearAnalysis();
    if (!state.lastRegions || !state.regionList) return;
    const map = {
      A: state.lastRegions.Aonly,
      B: state.lastRegions.Bonly,
      C: state.lastRegions.Conly,
      AB: state.lastRegions.AB,
      AC: state.lastRegions.AC,
      BC: state.lastRegions.BC,
      ABC: state.lastRegions.ABC
    };
    const arr = [...(map[code] || new Set())].sort();
    state.regionList.innerHTML = arr.length ? arr.map(x => `<div class="gene-item">${x}<span class="gene-link" data-gene="${x}">&#128279;</span></div>`).join('') : '(empty)';
    if (state.copyRegionBtn) { state.copyRegionBtn.style.display = arr.length ? 'block' : 'none'; }
  }

  function refreshCounts(c) {
    if (!state.countsUI) return;
    state.countsUI.A.textContent = c.nA;
    state.countsUI.B.textContent = c.nB;
    state.countsUI.C.textContent = c.nC;
    state.countsUI.AB.textContent = c.AB + c.ABC;
    state.countsUI.AC.textContent = c.AC + c.ABC;
    state.countsUI.BC.textContent = c.BC + c.ABC;
    state.countsUI.ABC.textContent = c.ABC;
    debugLog('refreshCounts', c);
  }

  function updateCountLabels(labels) {
    const labelA = document.getElementById('labelAName');
    const labelB = document.getElementById('labelBName');
    const labelC = document.getElementById('labelCName');
    const labelAB = document.getElementById('labelABName');
    const labelAC = document.getElementById('labelACName');
    const labelBC = document.getElementById('labelBCName');
    const labelABC = document.getElementById('labelABCName');
    if (labelA) labelA.textContent = labels.A;
    if (labelB) labelB.textContent = labels.B;
    if (labelC) labelC.textContent = labels.C;
    if (labelAB) labelAB.textContent = labels.A + '∩' + labels.B;
    if (labelAC) labelAC.textContent = labels.A + '∩' + labels.C;
    if (labelBC) labelBC.textContent = labels.B + '∩' + labels.C;
    if (labelABC) labelABC.textContent = labels.A + '∩' + labels.B + '∩' + labels.C;
  }

  function updateRegionSelect(labels, countsOverride) {
    if (!state.regionSelect) return;
    const map = {
      A: labels.A + ' only',
      B: labels.B + ' only',
      C: labels.C + ' only',
      AB: labels.A + '∩' + labels.B + ' only',
      AC: labels.A + '∩' + labels.C + ' only',
      BC: labels.B + '∩' + labels.C + ' only',
      ABC: labels.A + '∩' + labels.B + '∩' + labels.C
    };
    const counts = countsOverride || state.lastCounts;
    const requiredSets = {
      A: ['A'],
      B: ['B'],
      C: ['C'],
      AB: ['A', 'B'],
      AC: ['A', 'C'],
      BC: ['B', 'C'],
      ABC: ['A', 'B', 'C']
    };
    const options = [...state.regionSelect.options];
    const presence = counts ? {
      A: Number(counts.nA || 0) > 0,
      B: Number(counts.nB || 0) > 0,
      C: Number(counts.nC || 0) > 0
    } : { A: true, B: true, C: true };
    const previousValue = state.regionSelect.value;
    let previousValueVisible = false;
    let firstVisibleValue = null;
    options.forEach(option => {
      if (map[option.value]) option.textContent = map[option.value];
      const needed = requiredSets[option.value] || [];
      const shouldShow = needed.every(setKey => presence[setKey]);
      option.hidden = !shouldShow;
      option.disabled = !shouldShow;
      if (shouldShow && !firstVisibleValue) firstVisibleValue = option.value;
      if (shouldShow && option.value === previousValue) previousValueVisible = true;
    });
    if (counts) {
      if (!firstVisibleValue) {
        state.regionSelect.value = '';
        if (state.regionList) state.regionList.textContent = '(empty)';
        if (state.copyRegionBtn) state.copyRegionBtn.style.display = 'none';
        console.debug('Debug: venn regionSelect empty after update', { counts }); // Debug: region select no visible options
      } else if (!previousValueVisible) {
        state.regionSelect.value = firstVisibleValue;
        console.debug('Debug: venn regionSelect fallback applied', { previousValue, next: firstVisibleValue }); // Debug: region select fallback selection
        if (state.lastRegions) {
          populateRegion(firstVisibleValue);
        }
      }
    }
    console.debug('Debug: venn regionSelect visibility updated', {
      countsAvailable: !!counts,
      presence,
      selected: state.regionSelect.value
    }); // Debug: region select visibility state snapshot
  }

  function updateColorLabels(labels) {
    const colorLabelA = document.getElementById('colorLabelA');
    const colorLabelB = document.getElementById('colorLabelB');
    const colorLabelC = document.getElementById('colorLabelC');
    if (colorLabelA) colorLabelA.textContent = labels.A;
    if (colorLabelB) colorLabelB.textContent = labels.B;
    if (colorLabelC) colorLabelC.textContent = labels.C;
  }

  function clearAnalysis() {
    if (state.goResults) state.goResults.innerHTML = '';
    if (state.stringResults) state.stringResults.innerHTML = '';
    if (state.stringNetwork) state.stringNetwork.innerHTML = '';
    if (state.goChart) { state.goChart.destroy(); state.goChart = null; }
    const canvas = document.getElementById('goChart');
    if (canvas) canvas.style.display = 'none';
    if (state.goChartExport) state.goChartExport.style.display = 'none';
    if (state.stringNetworkExport) state.stringNetworkExport.style.display = 'none';
  }

  function renderGOChart(limit = 5) {
    if (!state.goResults) return;
    if (!state.lastGOResult || !state.lastGOResult.length) {
      const canvas = document.getElementById('goChart');
      if (canvas) canvas.style.display = 'none';
      if (state.goChartExport) state.goChartExport.style.display = 'none';
      if (state.goChart) { state.goChart.destroy(); state.goChart = null; }
      return;
    }
    const data = state.lastGOResult.slice(0, limit);
    const labels = data.map(r => r.term_name || r.name || '');
    const values = data.map(r => -Math.log10(r.p_value));
    const barColor = '#64b5f6';
    if (state.goChart) { state.goChart.destroy(); }
    const canvas = document.getElementById('goChart');
    if (!canvas) return;
    canvas.style.display = 'block';
    if (state.goChartExport) state.goChartExport.style.display = 'flex';
    const isAll = limit > 5;
    const baseBarHeight = 25;
    const minBarHeight = 18;
    const barHeight = isAll ? minBarHeight : baseBarHeight;
    const chartHeight = Math.max(300, barHeight * labels.length);
    canvas.style.height = chartHeight + 'px';
    canvas.height = chartHeight;
    canvas.width = canvas.offsetWidth;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const config = {
      type: 'bar',
      data: { labels, datasets: [{ label: '-log10(p)', data: values, backgroundColor: barColor, barThickness: barHeight - 5 }] },
      options: {
        indexAxis: 'y',
        responsive: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            title: { display: true, text: '-log10(p)' },
            grid: { display: false },
            ticks: { callback: v => v.toLocaleString('en-US', { maximumFractionDigits: 2 }) }
          },
          y: { grid: { display: false }, ticks: { autoSkip: false } }
        }
      },
      locale: 'en-US'
    };
    state.goChart = new Chart(ctx, config);
  }

  function renderGOResults(limit = 5) {
    if (!state.goResults) return;
    if (!state.lastGOResult || !state.lastGOResult.length) {
      state.goResults.innerHTML = '<div>No GO results</div>';
      return;
    }
    const items = state.lastGOResult.slice(0, limit).map(r => {
      const term = r.term_name || r.name || 'unknown term';
      const src = r.source || 'unknown source';
      return `<div>${term} [${src}] (p=${Number(r.p_value).toExponential(2)})</div>`;
    }).join('');
    const fullUrl = `https://biit.cs.ut.ee/gprofiler/gost?organism=${state.lastGOOrganism}&query=${encodeURIComponent(state.lastGOFormatted.join('\n'))}`;
    const link = `<div><a href="${fullUrl}" target="_blank" rel="noopener">View full GO analysis</a>${
      state.lastGOResult.length > 5 ? ` | <button class="btn" id="toggleGoResults" data-state="${limit === 5 ? 'top5' : 'all'}">${
        limit === 5 ? 'Show all results' : 'Show top 5'}</button>` : ''}</div>`;
    state.goResults.innerHTML = `<strong>${limit === 5 ? 'Top 5 GO terms' : 'All GO terms'}</strong>` + items + link;
    renderGOChart(limit);
  }

  function positionTooltip(x, y) {
    if (!state.tooltip) return;
    let left = x, top = y;
    state.tooltip.style.left = left + 'px';
    state.tooltip.style.top = top + 'px';
    const rect = state.tooltip.getBoundingClientRect();
    const rightBound = window.scrollX + window.innerWidth - 8;
    const bottomBound = window.scrollY + window.innerHeight - 8;
    if (rect.right > rightBound) { left = Math.max(window.scrollX + 8, rightBound - rect.width); }
    if (rect.bottom > bottomBound) { top = Math.max(window.scrollY + 8, bottomBound - rect.height); }
    state.tooltip.style.left = left + 'px';
    state.tooltip.style.top = top + 'px';
  }

  async function fetchUniProtAnnotation(gene) {
    const service = Shared.uniprot;
    if (!service || typeof service.fetchFunctionAnnotation !== 'function') {
      console.warn('venn: Shared.uniprot.fetchFunctionAnnotation unavailable');
      return null;
    }
    return service.fetchFunctionAnnotation(gene, { fetch });
  }

  function logFact(n) {
    let res = 0;
    for (let i = 2; i <= n; i++) res += Math.log(i);
    return res;
  }

  function logChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    return logFact(n) - logFact(k) - logFact(n - k);
  }

  function hypergeomPval(N, K, n, k) {
    let p = 0;
    for (let i = k; i <= Math.min(K, n); i++) {
      const term = Math.exp(logChoose(K, i) + logChoose(N - K, n - i) - logChoose(N, n));
      p += term;
    }
    return p;
  }

  function calculateSignificance() {
    if (!state.lastCounts || !state.significanceResults) {
      if (state.significanceResults) state.significanceResults.textContent = 'Draw a Venn diagram first.';
      return;
    }
    const total = +state.totalGenesInput.value;
    if (!total || total < Math.max(state.lastCounts.nA, state.lastCounts.nB, state.lastCounts.nC)) {
      state.significanceResults.textContent = 'Please enter a valid total gene count.';
      return;
    }
    const inputs = ensureInputs();
    const labels = { A: inputs.labelA.value || 'A', B: inputs.labelB.value || 'B', C: inputs.labelC.value || 'C' };
    const res = [];
    const pAB = hypergeomPval(total, state.lastCounts.nA, state.lastCounts.nB, state.lastCounts.AB + state.lastCounts.ABC);
    res.push({ name: `${labels.A}∩${labels.B}`, p: pAB });
    if (state.lastCounts.nC > 0) {
      const pAC = hypergeomPval(total, state.lastCounts.nA, state.lastCounts.nC, state.lastCounts.AC + state.lastCounts.ABC);
      res.push({ name: `${labels.A}∩${labels.C}`, p: pAC });
      const pBC = hypergeomPval(total, state.lastCounts.nB, state.lastCounts.nC, state.lastCounts.BC + state.lastCounts.ABC);
      res.push({ name: `${labels.B}∩${labels.C}`, p: pBC });
      const pABC = hypergeomPval(total, state.lastCounts.AB + state.lastCounts.ABC, state.lastCounts.nC, state.lastCounts.ABC);
      res.push({ name: `${labels.A}∩${labels.B}∩${labels.C}`, p: pABC });
    }
    state.significanceResults.innerHTML = '<table><tr><th>Overlap</th><th>p-value</th><th>Significant</th></tr>' +
      res.map(r => `<tr><td>${r.name}</td><td>${r.p.toExponential(2)}</td><td>${r.p < 0.05 ? 'yes' : 'no'}</td></tr>`).join('') +
      '</table>';
    debugLog('calculateSignificance complete', { total, overlaps: res.length });
  }

  async function guessSpecies(genes) {
    const counts = { hsapiens: 0, mmusculus: 0, dmelanogaster: 0, celegans: 0 };
    const taxMap = { '9606': 'hsapiens', '10090': 'mmusculus', '7227': 'dmelanogaster', '6239': 'celegans' };
    const sample = genes.slice(0, 20);
    for (const g of sample) {
      const url = `https://mygene.info/v3/query?q=${encodeURIComponent(g)}&fields=symbol,taxid&species=9606,10090,7227,6239&size=5`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = await resp.json();
        const hit = data.hits?.find(h => h.symbol === g) ||
          data.hits?.find(h => h.symbol?.toLowerCase() === g.toLowerCase()) ||
          data.hits?.[0];
        const tax = hit?.taxid?.toString();
        const sp = taxMap[tax];
        if (sp) counts[sp]++;
      } catch (err) { }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    const [best, bestScore] = Object.entries(counts).reduce((m, e) => e[1] > m[1] ? e : m, ['', 0]);
    if (bestScore / total < 0.6) return null;
    return best;
  }

  function getAllGenes() {
    const inputs = ensureInputs();
    const mode = inputs.delimiter.value, cs = inputs.caseSensitive.checked;
    const A = parseList(inputs.A.value, cs, mode).map(o => o.val);
    const B = parseList(inputs.B.value, cs, mode).map(o => o.val);
    const C = parseList(inputs.C.value, cs, mode).map(o => o.val);
    const unique = [...new Set([...A, ...B, ...C])];
    return unique;
  }

  function setSpeciesIndicator(success) {
    if (!state.speciesSelect) return;
    if (success === null) {
      state.speciesSelect.style.backgroundColor = '';
      return;
    }
    const color = success ? '#b5d99c' : '#f28b82';
    state.speciesSelect.style.backgroundColor = color;
  }

  async function recognizeSpeciesFromInput() {
    const genes = getAllGenes();
    const guess = genes.length ? await guessSpecies(genes) : null;
    if (guess) {
      state.speciesSelect.value = guess;
      setSpeciesIndicator(true);
    } else {
      state.speciesSelect.value = '';
      setSpeciesIndicator(false);
    }
  }

  async function runGOAnalysis(genes, organism) {
    const formatted = genes.map(g => g.trim().toUpperCase()).filter(x => x);
    if (!formatted.length) { if (state.goResults) state.goResults.innerHTML = '<i>No genes for analysis</i>'; return; }
    const org = organism || state.speciesSelect.value;
    if (!org) {
      if (state.goResults) state.goResults.innerHTML = '<div>Please select a species before running GO analysis.</div>';
      return;
    }
    const sources = state.goCategoryChecks.filter(cb => cb.checked).map(cb => cb.value);
    if (!sources.length) {
      if (state.goResults) state.goResults.innerHTML = '<div>Please select at least one GO category.</div>';
      return;
    }
    const service = Shared.goAnalysis;
    if (!service || typeof service.profile !== 'function') {
      console.warn('venn: Shared.goAnalysis.profile unavailable');
      if (state.goResults) state.goResults.innerHTML = '<div>GO analysis service unavailable.</div>';
      return;
    }
    state.lastGOFormatted = formatted;
    state.lastGOOrganism = org;
    state.lastGOResult = null;
    renderGOChart();
    if (state.goResults) state.goResults.innerHTML = '<i>Running GO analysis...</i>';
    let background;
    let domainScope;
    if (state.goUseAllBackground?.checked) {
      const bg = getAllGenes().map(g => g.trim().toUpperCase()).filter(x => x);
      if (bg.length) {
        background = bg;
        domainScope = 'custom';
      }
    }
    try {
      const response = await service.profile({
        genes: formatted,
        organism: org,
        sources,
        background,
        domainScope,
        fetch
      });
      state.lastGOResult = response.result || [];
      if (state.lastGOResult.length) {
        renderGOResults(5);
      } else if (state.goResults) {
        state.goResults.innerHTML = '<div>No GO results</div>';
      }
    } catch (err) {
      console.error('runGOAnalysis error', err);
      if (state.goResults) state.goResults.innerHTML = '<div>Error fetching GO analysis</div>';
    }
    debugLog('runGOAnalysis invoked', { organism: org, geneCount: formatted.length });
  }

  async function runStringAnalysis(genes, organism) {
    const formatted = genes.map(g => g.trim().toUpperCase()).filter(x => x);
    if (!formatted.length) {
      if (state.stringNetwork) state.stringNetwork.innerHTML = '';
      if (state.stringResults) state.stringResults.innerHTML = '<i>No genes for analysis</i>';
      if (state.stringNetworkExport) state.stringNetworkExport.style.display = 'none';
      return;
    }
    const org = organism || state.speciesSelect.value;
    if (!org) {
      if (state.stringNetwork) state.stringNetwork.innerHTML = '';
      if (state.stringResults) state.stringResults.innerHTML = '<div>Please select a species before running STRING analysis.</div>';
      if (state.stringNetworkExport) state.stringNetworkExport.style.display = 'none';
      return;
    }
    const service = Shared.stringAnalysis;
    if (!service || typeof service.fetchNetwork !== 'function' || typeof service.fetchEnrichment !== 'function') {
      console.warn('venn: Shared.stringAnalysis helpers unavailable');
      state.lastStringSVG = null;
      if (state.stringNetwork) state.stringNetwork.innerHTML = '<div>STRING services unavailable.</div>';
      if (state.stringResults) state.stringResults.innerHTML = '<div>STRING services unavailable.</div>';
      if (state.stringNetworkExport) state.stringNetworkExport.style.display = 'none';
      return;
    }
    if (state.stringNetwork) state.stringNetwork.innerHTML = '<i>Loading STRING network...</i>';
    if (state.stringResults) state.stringResults.innerHTML = '<i>Running STRING enrichment...</i>';
    if (state.stringNetworkExport) state.stringNetworkExport.style.display = 'none';
    const networkType = document.querySelector('input[name="stringNetworkType"]:checked')?.value || 'functional';
    const edgeMeaning = document.querySelector('input[name="stringEdgeMeaning"]:checked')?.value || 'evidence';
    const sources = [...document.querySelectorAll('.stringSource:checked')].map(el => el.value);
    const fallbackCode = state.speciesSelect?.selectedOptions[0]?.dataset.string;
    const speciesCode = typeof service.resolveSpeciesCode === 'function'
      ? service.resolveSpeciesCode(org, fallbackCode)
      : (fallbackCode || { hsapiens: '9606', mmusculus: '10090', dmelanogaster: '7227', celegans: '6239' }[org] || '9606');
    const requestOptions = {
      genes: formatted,
      species: speciesCode,
      networkType,
      edgeMeaning,
      sources,
      fetch
    };
    try {
      const network = await service.fetchNetwork(requestOptions);
      state.lastStringSVG = network.svg;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = network.svg;
      const svgEl = wrapper.querySelector('svg');
      if (state.stringNetwork) state.stringNetwork.innerHTML = '';
      if (svgEl) {
        svgEl.style.maxWidth = '150%';
        state.stringNetwork?.appendChild(svgEl);
        if (state.stringNetworkExport) state.stringNetworkExport.style.display = 'flex';
      } else if (state.stringNetwork) {
        state.stringNetwork.innerHTML = '<div>Failed to load STRING network</div>';
      }
    } catch (err) {
      console.error('runStringAnalysis network error', err);
      state.lastStringSVG = null;
      if (state.stringNetwork) state.stringNetwork.innerHTML = '<div>Error loading STRING network</div>';
      if (state.stringNetworkExport) state.stringNetworkExport.style.display = 'none';
    }
    try {
      const enrichment = await service.fetchEnrichment(requestOptions);
      if (enrichment.items.length) {
        const items = enrichment.items.slice(0, 5).map(r => {
          const desc = r.termDescription || r.description || 'unknown term';
          return '<div>' + desc + ' (FDR=' + Number(r.fdr).toExponential(2) + ')</div>';
        }).join('');
        if (state.stringResults) state.stringResults.innerHTML = '<strong>STRING enrichment</strong>' + items;
      } else if (state.stringResults) {
        state.stringResults.innerHTML = '<div>No STRING results</div>';
      }
    } catch (err) {
      console.error('runStringAnalysis enrichment error', err);
      if (state.stringResults) state.stringResults.innerHTML = '<div>Error fetching STRING analysis</div>';
    }
    debugLog('runStringAnalysis invoked', {
      organism: org,
      geneCount: formatted.length,
      networkType,
      edgeMeaning,
      sourceCount: sources.length
    });
  }

  function buildGoChartSvgString() {
    if (!state.goChart) {
      debugLog('buildGoChartSvgString skipped', { reason: 'no chart' });
      return '';
    }
    const canvas = document.getElementById('goChart');
    if (!canvas) {
      debugLog('buildGoChartSvgString skipped', { reason: 'no canvas' });
      return '';
    }
    try {
      const { labels } = state.goChart.data;
      const values = state.goChart.data.datasets[0].data;
      const color = state.goChart.data.datasets[0].backgroundColor;
      const width = canvas.width;
      const height = canvas.height;
      const measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = '12px sans-serif';
      const labelWidths = labels.map(l => measureCtx.measureText(l).width);
      const maxLabelWidth = Math.ceil(Math.max(...labelWidths));
      const padding = { left: maxLabelWidth + 12, right: 20, top: 10, bottom: 30 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const barHeight = chartHeight / labels.length;
      const maxVal = Math.max(...values);
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
      svg += `<rect width="${width}" height="${height}" fill="none"/>`;
      for (let i = 0; i < labels.length; i++) {
        const y = padding.top + i * barHeight;
        const barWidth = (values[i] / maxVal) * chartWidth;
        svg += `<text x="4" y="${y + barHeight / 2}" dominant-baseline="middle" font-size="12">${labels[i]}</text>`;
        svg += `<rect x="${padding.left}" y="${y + barHeight * 0.1}" width="${barWidth}" height="${barHeight * 0.8}" fill="${color}"/>`;
        svg += `<text x="${padding.left + barWidth + 4}" y="${y + barHeight / 2}" dominant-baseline="middle" font-size="12">${values[i].toFixed(2)}</text>`;
      }
      const axisY = padding.top + chartHeight;
      svg += `<line x1="${padding.left}" y1="${axisY}" x2="${width - padding.right}" y2="${axisY}" stroke="black"/>`;
      svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${axisY}" stroke="black"/>`;
      const ticks = 5;
      for (let t = 0; t <= ticks; t++) {
        const v = (maxVal / ticks) * t;
        const x = padding.left + (v / maxVal) * chartWidth;
        svg += `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 5}" stroke="black"/>`;
        svg += `<text x="${x}" y="${axisY + 15}" font-size="12" text-anchor="middle">${v.toFixed(2)}</text>`;
      }
      svg += `<text x="${padding.left + chartWidth / 2}" y="${height - 5}" font-size="12" text-anchor="middle">-log10(p)</text>`;
      svg += '</svg>';
      debugLog('buildGoChartSvgString complete', { width, height, barCount: labels.length });
      return svg;
    } catch (err) {
      console.error('buildGoChartSvgString error', err);
      return '';
    }
  }

  async function exportGoChart(format) {
    if (!state.goChart) return;
    const exporter = Shared.exporter;
    if (!exporter) {
      console.warn('exportGoChart missing exporter');
      return;
    }
    if (format === 'png') {
      const canvas = document.getElementById('goChart');
      if (!canvas) return;
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) return;
      exporter.downloadBlob(blob, 'go_chart.png', 'go-chart');
    } else if (format === 'svg') {
      const svg = buildGoChartSvgString();
      if (!svg) return;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      exporter.downloadBlob(blob, 'go_chart.svg', 'go-chart');
    }
    debugLog('exportGoChart', { format });
  }

  async function downloadStringPNG() {
    if (!state.lastStringSVG) return;
    const exporter = Shared.exporter;
    if (!exporter || typeof exporter.svgStringToPngBlob !== 'function') {
      console.warn('downloadStringPNG missing exporter helpers');
      return;
    }
    try {
      const blob = await exporter.svgStringToPngBlob(state.lastStringSVG, { contextLabel: 'string-export' });
      if (!blob) return;
      exporter.downloadBlob(blob, 'string_network.png', 'string-export');
    } catch (err) {
      console.error('downloadStringPNG error', err);
    }
  }

  function downloadStringSVG() {
    if (!state.lastStringSVG) return;
    const exporter = Shared.exporter;
    if (!exporter) {
      console.warn('downloadStringSVG missing exporter helpers');
      return;
    }
    const blob = new Blob([state.lastStringSVG], { type: 'image/svg+xml' });
    exporter.downloadBlob(blob, 'string_network.svg', 'string-export');
  }

  function fitAndDraw(d, style, labels, counts) {
    clearSVG();
    const stage = state.stage;
    if (!stage) return;
    if (typeof chartStyle.applySvgDefaults === 'function') {
      chartStyle.applySvgDefaults(stage);
    }
    const svgBox = state.svgBox || stage.closest?.('.svgbox') || state.graphPanel?.querySelector?.('.svgbox') || null;
    if (!state.svgBox && svgBox) {
      state.svgBox = svgBox;
      console.debug('Debug: venn fitAndDraw captured svgBox', { hasSvgBox: true });
    }
    const svgBoxRect = svgBox?.getBoundingClientRect?.();
    const dataset = svgBox?.dataset || {};
    const scaleInfo = style.scaleInfo || {};
    let stageWidth = parsePositiveFloat(scaleInfo.width);
    let stageHeight = parsePositiveFloat(scaleInfo.height);
    if (!Number.isFinite(stageWidth)) stageWidth = parsePositiveFloat(svgBoxRect?.width);
    if (!Number.isFinite(stageHeight)) stageHeight = parsePositiveFloat(svgBoxRect?.height);
    if (!Number.isFinite(stageWidth)) stageWidth = parsePositiveFloat(dataset.resizerWidth);
    if (!Number.isFinite(stageHeight)) stageHeight = parsePositiveFloat(dataset.resizerHeight);
    const defaultWidth = parsePositiveFloat(dataset.resizerDefaultWidth)
      || parsePositiveFloat(chartStyle.DEFAULT_WIDTH)
      || DEFAULT_STAGE_WIDTH;
    const defaultHeight = parsePositiveFloat(dataset.resizerDefaultHeight)
      || parsePositiveFloat(chartStyle.DEFAULT_HEIGHT)
      || DEFAULT_STAGE_HEIGHT;
    const aspectRatio = parsePositiveFloat(dataset.resizerAspectRatio)
      || (defaultWidth / (defaultHeight || defaultWidth))
      || DEFAULT_STAGE_RATIO;
    if (!Number.isFinite(stageWidth) || stageWidth <= 0) {
      stageWidth = defaultWidth;
    }
    if ((!Number.isFinite(stageHeight) || stageHeight <= 0) && Number.isFinite(stageWidth) && Number.isFinite(aspectRatio) && aspectRatio > 0) {
      stageHeight = stageWidth / aspectRatio;
    }
    if (!Number.isFinite(stageHeight) || stageHeight <= 0) {
      stageHeight = defaultHeight;
    }
    if (!Number.isFinite(stageWidth) || stageWidth <= 0) {
      stageWidth = DEFAULT_STAGE_WIDTH;
    }
    if (!Number.isFinite(stageHeight) || stageHeight <= 0) {
      stageHeight = DEFAULT_STAGE_HEIGHT;
    }
    stage.setAttribute('viewBox', `0 0 ${stageWidth} ${stageHeight}`);
    stage.setAttribute('width', String(stageWidth));
    stage.setAttribute('height', String(stageHeight));
    console.debug('Debug: venn stage sizing resolved', {
      stageWidth,
      stageHeight,
      scaleWidth: scaleInfo.width,
      scaleHeight: scaleInfo.height,
      svgBoxWidth: svgBoxRect?.width,
      svgBoxHeight: svgBoxRect?.height,
      defaultWidth,
      defaultHeight,
      aspectRatio
    });
    const fontFamily = chartStyle.FONT_FAMILY || stage.getAttribute('font-family') || 'Arial, Helvetica, sans-serif';
    const textColor = chartStyle.TEXT_COLOR || '#000000';
    stage.setAttribute('font-family', fontFamily);
    stage.setAttribute('color', textColor);
    stage.setAttribute('font-size', String(style.fontSizePx));
    console.debug('Debug: venn stage font applied', {
      fontFamily,
      textColor,
      fontSizePx: style.fontSizePx,
      fontSizePt: style.fontPt
    }); // Debug: stage font sync
    const tooltip = state.tooltip;
    const W = stageWidth;
    const H = stageHeight;
    const pad = 20;
    const labelPad = style.fontSizePx * 2;
    const xs = [d.Ax - d.rA, d.Ax + d.rA, d.Bx - d.rB, d.Bx + d.rB];
    const ys = [d.Ay - d.rA, d.Ay + d.rA, d.By - d.rB, d.By + d.rB];
    if (counts.nC > 0) { xs.push(d.Cx - d.rC, d.Cx + d.rC); ys.push(d.Cy - d.rC, d.Cy + d.rC); }
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    const scale = Math.min((W - 2 * pad) / Math.max(1e-6, maxX - minX), (H - 2 * pad - 2 * labelPad) / Math.max(1e-6, maxY - minY));
    const tx = (W - scale * (minX + maxX)) / 2;
    const ty = (H - 2 * labelPad - scale * (minY + maxY)) / 2 + labelPad;
    function toPx(x, y) { return { x: x * scale + tx, y: y * scale + ty }; }
    const circles = [{ id: 'A', x: d.Ax, y: d.Ay, r: d.rA, color: style.colorA }, { id: 'B', x: d.Bx, y: d.By, r: d.rB, color: style.colorB }];
    if (counts.nC > 0) circles.push({ id: 'C', x: d.Cx, y: d.Cy, r: d.rC, color: style.colorC });
    for (const c of circles) {
      const p = toPx(c.x, c.y);
      makeEl('circle', { cx: p.x, cy: p.y, r: c.r * scale, fill: c.color, 'fill-opacity': style.opacity, stroke: style.borderColor, 'stroke-width': style.borderWidth });
    }
    function addText(txt, x, y, regionCode) {
      const t = makeEl('text', {
        x,
        y,
        'font-size': style.fontSizePx,
        'text-anchor': 'middle',
        fill: textColor,
        'font-family': fontFamily
      });
      t.textContent = txt;
      if (regionCode && tooltip) {
        t.addEventListener('mouseenter', e => {
          const genes = getRegionText(regionCode).split(/\n/).filter(g => g);
          tooltip.innerHTML = genes.map(g => '<div>' + g + '</div>').join('');
          tooltip.style.fontSize = '12px';
          tooltip.style.maxHeight = 'none';
          tooltip.style.maxWidth = 'none';
          tooltip.style.overflow = 'visible';
          tooltip.style.width = 'auto';
          tooltip.style.height = 'auto';
          const lineHeight = parseFloat(getComputedStyle(tooltip).lineHeight);
          const tempSpan = document.createElement('span');
          tempSpan.style.visibility = 'hidden';
          tempSpan.style.position = 'absolute';
          tempSpan.style.fontSize = '12px';
          tempSpan.style.whiteSpace = 'pre';
          document.body.appendChild(tempSpan);
          let longestWidth = 0;
          genes.forEach(g => { tempSpan.textContent = g; const w = tempSpan.getBoundingClientRect().width; if (w > longestWidth) longestWidth = w; });
          document.body.removeChild(tempSpan);
          const columnGap = 12;
          const columnWidth = Math.ceil(longestWidth) + 16;
          const maxWidth = window.innerWidth - 16, maxHeight = window.innerHeight - 16;
          const maxCols = Math.max(1, Math.floor((maxWidth + columnGap) / (columnWidth + columnGap)));
          const maxRows = Math.max(1, Math.floor(maxHeight / lineHeight));
          let columns = Math.min(maxCols, Math.ceil(genes.length / maxRows));
          let rowsPerCol = Math.ceil(genes.length / columns);
          const width = columns * columnWidth + (columns - 1) * columnGap;
          const height = rowsPerCol * lineHeight;
          tooltip.style.columnCount = columns;
          tooltip.style.columnWidth = columnWidth + 'px';
          tooltip.style.columnGap = columnGap + 'px';
          tooltip.style.width = width + 'px';
          tooltip.style.height = height + 'px';
          const box = e.target.getBoundingClientRect();
          let left = box.right + window.scrollX + 8;
          let top = box.top + window.scrollY;
          tooltip.style.left = left + 'px';
          tooltip.style.top = top + 'px';
          tooltip.style.display = 'block';
          positionTooltip(left, top);
        });
        t.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });
      }
      enableDrag(t);
      return t;
    }
    const labelBoxes = [];
    function placeCircleLabel(circle, label, count) {
      const center = toPx(circle.x, circle.y);
      const others = circles.filter(c => c.id !== circle.id);
      const isTop = others.every(o => circle.y <= o.y);
      const margin = style.fontSizePx * 0.6;
      let y = center.y + (isTop ? -(circle.r * scale + margin) : (circle.r * scale + margin));
      const t = addText(label + ' (' + count + ')', center.x, y);
      let box = t.getBBox();
      for (const b of labelBoxes) {
        while (!(box.x + box.width < b.x || b.x + b.width < box.x || box.y + box.height < b.y || b.y + b.height < box.y)) {
          y += isTop ? -style.fontSizePx : style.fontSizePx;
          t.setAttribute('y', y);
          box = t.getBBox();
        }
      }
      const minYBound = style.fontSizePx;
      const maxYBound = H - style.fontSizePx;
      if (box.y < minYBound) {
        y += minYBound - box.y;
        t.setAttribute('y', y);
        box = t.getBBox();
      }
      if (box.y + box.height > maxYBound) {
        y -= box.y + box.height - maxYBound;
        t.setAttribute('y', y);
        box = t.getBBox();
      }
      labelBoxes.push(box);
    }
    placeCircleLabel({ id: 'A', x: d.Ax, y: d.Ay, r: d.rA }, labels.A, counts.nA);
    placeCircleLabel({ id: 'B', x: d.Bx, y: d.By, r: d.rB }, labels.B, counts.nB);
    if (counts.nC > 0) placeCircleLabel({ id: 'C', x: d.Cx, y: d.Cy, r: d.rC }, labels.C, counts.nC);
    const cA = toPx(d.Ax, d.Ay), cB = toPx(d.Bx, d.By), cC = toPx(d.Cx, d.Cy);
    const rAp = d.rA * scale, rBp = d.rB * scale, rCp = d.rC * scale;
    const hasC = counts.nC > 0;
    if (counts.Aonly) {
      const p = _findRegionLabelPoint('A', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.Aonly), p.x, p.y, 'A');
    }
    if (counts.Bonly) {
      const p = _findRegionLabelPoint('B', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.Bonly), p.x, p.y, 'B');
    }
    if (hasC && counts.Conly) {
      const p = _findRegionLabelPoint('C', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.Conly), p.x, p.y, 'C');
    }
    if (counts.AB) {
      const p = _findRegionLabelPoint('AB', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.AB), p.x, p.y, 'AB');
    }
    if (hasC && counts.AC) {
      const p = _findRegionLabelPoint('AC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.AC), p.x, p.y, 'AC');
    }
    if (hasC && counts.BC) {
      const p = _findRegionLabelPoint('BC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.BC), p.x, p.y, 'BC');
    }
    if (hasC && counts.ABC) {
      const p = _findRegionLabelPoint('ABC', cA, rAp, cB, rBp, cC, rCp, hasC, 0.6);
      if (p) addText(String(counts.ABC), p.x, p.y, 'ABC');
    }
    stage.onclick = (evt) => {
      const pt = stage.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY; const loc = pt.matrixTransform(stage.getScreenCTM().inverse());
      const inA = Math.hypot(loc.x - cA.x, loc.y - cA.y) <= rAp;
      const inB = Math.hypot(loc.x - cB.x, loc.y - cB.y) <= rBp;
      const inC = (counts.nC > 0) && Math.hypot(loc.x - cC.x, loc.y - cC.y) <= rCp;
      let region = null;
      if (inA && !inB && !inC) region = 'A';
      else if (!inA && inB && !inC) region = 'B';
      else if (!inA && !inB && inC) region = 'C';
      else if (inA && inB && !inC) region = 'AB';
      else if (inA && inC && !inB) region = 'AC';
      else if (inB && inC && !inA) region = 'BC';
      else if (inA && inB && inC) region = 'ABC';
      if (region && state.regionSelect) { state.regionSelect.value = region; populateRegion(region); }
    };
  }

  function drawFromLists() {
    const inputs = ensureInputs();
    const mode = inputs.delimiter.value, cs = inputs.caseSensitive.checked;
    const A = parseList(inputs.A.value, cs, mode), B = parseList(inputs.B.value, cs, mode), C = parseList(inputs.C.value, cs, mode);
    const regions = setsFromLists(A, B, C);
    state.lastRegions = regions;
    state.lastDrawMode = 'lists';
    const counts = {
      nA: regions.A.size, nB: regions.B.size, nC: regions.C.size,
      Aonly: regions.Aonly.size, Bonly: regions.Bonly.size, Conly: regions.Conly.size,
      AB: regions.AB.size, AC: regions.AC.size, BC: regions.BC.size, ABC: regions.ABC.size
    };
    state.lastCounts = counts;
    if (state.significanceResults) state.significanceResults.innerHTML = '';
    refreshCounts(counts);
    const pairs = { nAB: counts.AB + counts.ABC, nAC: counts.AC + counts.ABC, nBC: counts.BC + counts.ABC };
    const L = layoutFromCounts(counts.nA, counts.nB, counts.nC, pairs.nAB, pairs.nAC, pairs.nBC);
    const fontInfo = resolveFontInfo(inputs.fontsize.value);
    const borderWidthRaw = Number(inputs.borderWidth.value);
    const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, fontInfo.scaleInfo, { context: 'venn-border', min: 0 });
    const resolvedFontPx = Number.isFinite(fontInfo?.scaledPx) ? fontInfo.scaledPx : Number(fontInfo?.px);
    const fontSizePx = Number.isFinite(resolvedFontPx) ? resolvedFontPx : 12;
    const style = {
      colorA: inputs.colorA.value, colorB: inputs.colorB.value, colorC: inputs.colorC.value,
      opacity: inputs.opacity.value, fontSizePx, fontPt: Number.isFinite(fontInfo?.pt) ? fontInfo.pt : Number(inputs.fontsize.value) || 12,
      borderColor: inputs.borderColor.value, borderWidth: borderWidthPx, borderWidthRaw,
      scaleInfo: fontInfo.scaleInfo,
      fontInfo
    };
    console.debug('Debug: venn style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      fontScale: fontInfo?.scaleInfo?.styleScale,
      fontSizePx,
      textLocked: fontInfo?.scaleInfo?.textLocked
    });
    chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
    const labels = { A: inputs.labelA.value || 'A', B: inputs.labelB.value || 'B', C: inputs.labelC.value || 'C' };
    updateCountLabels(labels);
    updateRegionSelect(labels, counts);
    updateColorLabels(labels);
    fitAndDraw(L, style, labels, counts);
    if (state.regionSelect) populateRegion(state.regionSelect.value);
    recognizeSpeciesFromInput().catch(err => { });
    debugLog('drawFromLists complete', { mode, caseSensitive: cs, counts });
  }

  function drawFromNumeric() {
    const inputs = ensureInputs();
    const nA = +inputs.counts.nA.value || 0, nB = +inputs.counts.nB.value || 0, nC = +inputs.counts.nC.value || 0;
    const nAB = +inputs.counts.nAB.value || 0, nAC = +inputs.counts.nAC.value || 0, nBC = +inputs.counts.nBC.value || 0, nABC = +inputs.counts.nABC.value || 0;
    const Aonly = Math.max(0, nA - (nAB + nAC - nABC));
    const Bonly = Math.max(0, nB - (nAB + nBC - nABC));
    const Conly = Math.max(0, nC - (nAC + nBC - nABC));
    const counts = {
      nA, nB, nC, Aonly, Bonly, Conly,
      AB: Math.max(0, nAB - nABC), AC: Math.max(0, nAC - nABC), BC: Math.max(0, nBC - nABC), ABC: nABC
    };
    state.lastRegions = {
      A: new Set(), B: new Set(), C: new Set(), Aonly: new Set(), Bonly: new Set(), Conly: new Set(),
      AB: new Set(), AC: new Set(), BC: new Set(), ABC: new Set()
    };
    state.lastDrawMode = 'numeric';
    state.lastCounts = counts;
    if (state.significanceResults) state.significanceResults.innerHTML = '';
    refreshCounts(counts);
    const L = layoutFromCounts(nA, nB, nC, nAB, nAC, nBC);
    const fontInfo = resolveFontInfo(inputs.fontsize.value);
    const borderWidthRaw = Number(inputs.borderWidth.value);
    const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, fontInfo.scaleInfo, { context: 'venn-border', min: 0 });
    const resolvedFontPx = Number.isFinite(fontInfo?.scaledPx) ? fontInfo.scaledPx : Number(fontInfo?.px);
    const fontSizePx = Number.isFinite(resolvedFontPx) ? resolvedFontPx : 12;
    const style = {
      colorA: inputs.colorA.value, colorB: inputs.colorB.value, colorC: inputs.colorC.value,
      opacity: inputs.opacity.value, fontSizePx, fontPt: Number.isFinite(fontInfo?.pt) ? fontInfo.pt : Number(inputs.fontsize.value) || 12,
      borderColor: inputs.borderColor.value, borderWidth: borderWidthPx, borderWidthRaw,
      scaleInfo: fontInfo.scaleInfo,
      fontInfo
    };
    console.debug('Debug: venn style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      fontScale: fontInfo?.scaleInfo?.styleScale,
      fontSizePx,
      textLocked: fontInfo?.scaleInfo?.textLocked
    });
    chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
    const labels = { A: inputs.labelA.value || 'A', B: inputs.labelB.value || 'B', C: inputs.labelC.value || 'C' };
    updateCountLabels(labels);
    updateRegionSelect(labels, counts);
    updateColorLabels(labels);
    fitAndDraw(L, style, labels, counts);
    if (state.regionSelect) populateRegion(state.regionSelect.value);
    debugLog('drawFromNumeric complete', { counts });
  }

  function refreshDiagram() {
    const inputs = state.inputs;
    if (!inputs) {
      console.warn('Debug: venn refreshDiagram called before init');
      return;
    }
    try {
      const mode = state.lastDrawMode || ((inputs.A.value || inputs.B.value || inputs.C.value) ? 'lists' : 'numeric');
      if (mode === 'numeric') {
        drawFromNumeric();
      } else {
        drawFromLists();
      }
      debugLog('refreshDiagram executed', { mode });
    } catch (err) {
      console.error('venn refreshDiagram error', err);
    }
  }

  const STYLE_KEY = 'vennStylePrefs';
  const STYLE_VERSION = 2;
  const LEGACY_DEFAULT_FONT_PT = 17;

  function loadStylePrefs() {
    const inputs = state.inputs;
    if (!inputs) return;
    try {
      const raw = localStorage.getItem(STYLE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      const savedVersion = saved && Number.isFinite(Number(saved.version)) ? Number(saved.version) : 1;
      let migrated = false;
      let savedFontValue = saved && typeof saved.fontsize !== 'undefined' ? saved.fontsize : null;
      if (saved && savedVersion < STYLE_VERSION) {
        const numeric = Number(savedFontValue);
        const basePt = chartStyle.BASE_FONT_SIZE_PT || Number(inputs.fontsize.value) || 13;
        if (!Number.isFinite(numeric) || Math.round(numeric) === Math.round(LEGACY_DEFAULT_FONT_PT)) {
          savedFontValue = basePt;
          migrated = true;
          console.debug('Debug: venn loadStylePrefs font migrated', {
            savedFont: saved.fontsize,
            basePt,
            savedVersion,
            targetVersion: STYLE_VERSION
          }); // Debug: reset legacy default font to new baseline
        }
      }
      if (saved) {
        if (saved.colorA) inputs.colorA.value = saved.colorA;
        if (saved.colorB) inputs.colorB.value = saved.colorB;
        if (saved.colorC) inputs.colorC.value = saved.colorC;
        if (saved.opacity) inputs.opacity.value = saved.opacity;
        if (saved.borderColor) inputs.borderColor.value = saved.borderColor;
        if (saved.borderWidth) inputs.borderWidth.value = saved.borderWidth;
        if (savedFontValue !== null && typeof savedFontValue !== 'undefined') {
          const fontInfo = resolveFontInfo(savedFontValue);
          inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
          chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
          console.debug('Debug: venn loadStylePrefs font applied', { saved: savedFontValue, fontInfo, savedVersion });
        }
      }
      if (!saved || typeof savedFontValue === 'undefined' || savedFontValue === null) {
        const fontInfo = resolveFontInfo(inputs.fontsize.value);
        inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
        chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
        console.debug('Debug: venn loadStylePrefs font default', { fontInfo });
      }
      inputs.opacityVal.textContent = inputs.opacity.value;
      inputs.borderWidthVal.textContent = inputs.borderWidth.value;
      if (saved && (migrated || savedVersion < STYLE_VERSION)) {
        saveStylePrefs();
      }
    } catch (err) {
      console.warn('Debug: venn loadStylePrefs error', err);
    }
  }

  function saveStylePrefs() {
    const inputs = state.inputs;
    if (!inputs) return;
    const prefs = {
      version: STYLE_VERSION,
      colorA: inputs.colorA.value,
      colorB: inputs.colorB.value,
      colorC: inputs.colorC.value,
      opacity: inputs.opacity.value,
      fontsize: inputs.fontsize.value,
      borderColor: inputs.borderColor.value,
      borderWidth: inputs.borderWidth.value
    };
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify(prefs));
    } catch (err) {
      console.warn('Debug: venn saveStylePrefs error', err);
    }
  }

  function initResizers() {
    const stage = document.getElementById('stage');
    const vennContainer = stage?.closest('.svgbox') || stage?.parentElement;
    const tablePanel = document.getElementById('vennInputPanel');
    const graphPanel = document.getElementById('vennGraphPanel');
    const panelResizer = document.getElementById('vennPanelResizer');
    const configPanel = graphPanel?.querySelector('.config-options');
    const svgBox = graphPanel?.querySelector('.svgbox') || vennContainer;
    const diagramArea = graphPanel?.querySelector('.diagram-area');
    let vennMinSvgWidth = 0;
    state.tablePanel = tablePanel;
    state.graphPanel = graphPanel;
    state.panelResizer = panelResizer;
    if (vennContainer) {
      state.svgBox = vennContainer;
      console.debug('Debug: venn initResizers stored svgBox', { hasSvgBox: true });
    } else {
      console.debug('Debug: venn initResizers missing svgBox container');
    }
    console.debug('Debug: venn initResizers setup', {
      hasStage: !!stage,
      hasContainer: !!vennContainer,
      hasTablePanel: !!tablePanel,
      hasGraphPanel: !!graphPanel,
      hasConfigPanel: !!configPanel,
      hasPanelResizer: !!panelResizer
    }); // Debug: venn initResizers setup summary

    const syncPanels = (options = {}) => {
      const skipSchedule = options.skipSchedule || typeof state.scheduleDraw !== 'function';
      console.debug('Debug: venn syncPanels requested', {
        skipSchedule,
        minSvgWidth: vennMinSvgWidth,
        hasTable: !!tablePanel,
        hasGraph: !!graphPanel,
        hasConfig: !!configPanel
      }); // Debug: venn syncPanels invocation
      if (!Shared || typeof Shared.syncPanelWidths !== 'function') {
        console.debug('Debug: venn syncPanels helper missing', {
          hasShared: !!Shared,
          hasSync: Shared && typeof Shared.syncPanelWidths === 'function'
        }); // Debug: venn syncPanels helper check
        return null;
      }
      const result = Shared.syncPanelWidths(
        tablePanel,
        graphPanel,
        configPanel,
        state.scheduleDraw,
        {
          svgBox,
          panelResizer,
          minSvgWidth: vennMinSvgWidth,
          debugLabel: 'venn',
          skipSchedule
        }
      );
      if (result) {
        console.debug('Debug: venn syncPanels metrics', {
          appliedWidth: result.appliedWidth,
          tableWidth: result.tableWidth,
          graphWidth: result.graphWidth
        }); // Debug: venn syncPanels result summary
      }
      return result;
    };

    state.syncPanels = syncPanels;

    if (Shared.attachResizableBox && vennContainer) {
      const graphSizing = chartStyle.getSquareGraphSizing
        ? chartStyle.getSquareGraphSizing({ context: 'venn' })
        : (function fallbackSizing(){
            const baseWidth = Number(chartStyle.DEFAULT_WIDTH) || 640;
            const baseHeight = Number(chartStyle.DEFAULT_HEIGHT) || baseWidth;
            const minScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
            const maxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
            const fallback = {
              width: baseWidth,
              height: baseHeight,
              minWidth: Math.max(1, Math.round(baseWidth * minScale)),
              minHeight: Math.max(1, Math.round(baseHeight * minScale)),
              maxWidth: Math.max(baseWidth, Math.round(baseWidth * Math.max(maxScale, minScale))),
              maxHeight: Math.max(baseHeight, Math.round(baseHeight * Math.max(maxScale, minScale))),
              aspectRatio: chartStyle.DEFAULT_ASPECT_RATIO || 1,
              aspectLocked: chartStyle.DEFAULT_ASPECT_LOCKED !== false
            };
            debugLog('fallback square sizing applied', { context: 'venn', fallback });
            return fallback;
          })();
      debugLog('resizer defaults applied', { graphSizing });
      Shared.attachResizableBox(vennContainer, {
        defaultWidth: graphSizing.width,
        defaultHeight: graphSizing.height,
        minWidth: graphSizing.minWidth,
        minHeight: graphSizing.minHeight,
        maxWidth: graphSizing.maxWidth,
        maxHeight: graphSizing.maxHeight,
        aspectLocked: graphSizing.aspectLocked !== false,
        aspectRatio: Number.isFinite(graphSizing.aspectRatio) ? graphSizing.aspectRatio : 1,
        onResize: phase => {
          debugLog('resizer callback', { phase });
          syncPanels({ skipSchedule: phase === 'observe' });
        }
      });
      debugLog('resizer attached', { hasContainer: true });
    } else {
      debugLog('resizer attach skipped', {
        hasAttach: !!(Shared && Shared.attachResizableBox),
        hasContainer: !!vennContainer
      });
    }

    if (global.ResizeObserver && tablePanel) {
      const observer = new ResizeObserver(entries => {
        console.debug('Debug: venn table ResizeObserver triggered', {
          entries: entries ? entries.length : 0
        }); // Debug: venn table observer trigger
        syncPanels({ skipSchedule: true });
      });
      observer.observe(tablePanel);
      state.panelObserver = observer;
    } else {
      console.debug('Debug: venn table ResizeObserver unavailable', {
        hasObserver: !!global.ResizeObserver,
        hasTablePanel: !!tablePanel
      }); // Debug: venn table observer skipped
    }

    syncPanels({ skipSchedule: true });

    if (panelResizer && tablePanel && graphPanel) {
      panelResizer.addEventListener('pointerdown', e => {
        e.preventDefault();
        const startX = e.clientX;
        const startTable = tablePanel.getBoundingClientRect().width;
        const startGraph = graphPanel.getBoundingClientRect().width;
        const configWidth = configPanel ? configPanel.getBoundingClientRect().width : 0;
        let gap = 0;
        if (diagramArea && global.getComputedStyle) {
          try {
            const style = global.getComputedStyle(diagramArea);
            gap = parseFloat(style.gap || 0) || 0;
          } catch (err) {
            console.error('venn panel gap calculation error', err);
          }
        }
        const svgWidth = svgBox?.getBoundingClientRect().width || 0;
        vennMinSvgWidth = svgWidth * 0.5;
        const minGraph = configWidth + gap + vennMinSvgWidth;
        const total = startTable + startGraph;
        console.debug('Debug: venn panel resizer start', {
          startTable,
          startGraph,
          configWidth,
          gap,
          svgWidth,
          vennMinSvgWidth,
          minGraph,
          total
        }); // Debug: venn panel resizer start
        function onMove(ev) {
          const dx = ev.clientX - startX;
          let newTable = Math.max(150, Math.min(total - minGraph, startTable + dx));
          let newGraph = total - newTable;
          if (!Number.isFinite(newTable)) newTable = startTable;
          if (!Number.isFinite(newGraph)) newGraph = startGraph;
          tablePanel.style.flex = `0 0 ${newTable}px`;
          graphPanel.style.flex = `0 0 ${newGraph}px`;
          syncPanels({ skipSchedule: false });
          console.debug('Debug: venn panel resizer move', {
            dx,
            newTable,
            newGraph
          }); // Debug: venn panel resizer move
        }
        function onUp() {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          console.debug('Debug: venn panel resizer end'); // Debug: venn panel resizer end
          syncPanels({ skipSchedule: false });
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    } else {
      console.debug('Debug: venn panel resizer binding skipped', {
        hasPanelResizer: !!panelResizer,
        hasTablePanel: !!tablePanel,
        hasGraphPanel: !!graphPanel
      }); // Debug: venn panel resizer binding skipped
    }

    if (global.addEventListener) {
      global.addEventListener('resize', () => {
        console.debug('Debug: venn window resize sync'); // Debug: venn window resize handler
        syncPanels({ skipSchedule: true });
      });
    }
  }

  function getVennGraphPayload() {
    const inputs = state.inputs;
    if (!inputs) {
      console.debug('Debug: venn.getPayload skipped - missing inputs reference');
      return null;
    }
    const payload = {
      type: 'venn',
      data: {
        labelA: inputs.labelA.value,
        labelB: inputs.labelB.value,
        labelC: inputs.labelC.value,
        listA: inputs.A.value,
        listB: inputs.B.value,
        listC: inputs.C.value,
        nA: inputs.counts.nA.value,
        nB: inputs.counts.nB.value,
        nC: inputs.counts.nC.value,
        nAB: inputs.counts.nAB.value,
        nAC: inputs.counts.nAC.value,
        nBC: inputs.counts.nBC.value,
        nABC: inputs.counts.nABC.value
      },
      style: {
        colorA: inputs.colorA.value,
        colorB: inputs.colorB.value,
        colorC: inputs.colorC.value,
        opacity: inputs.opacity.value,
        borderColor: inputs.borderColor.value,
        borderWidth: inputs.borderWidth.value,
        fontsize: inputs.fontsize.value
      }
    };
    console.debug('Debug: venn.getPayload captured state', {
      labelA: payload.data.labelA,
      labelB: payload.data.labelB,
      labelC: payload.data.labelC,
      opacity: payload.style.opacity
    });
    return payload;
  }
  venn.getPayload = getVennGraphPayload;

  venn.save = async function () {
    const payload = getVennGraphPayload();
    if (!payload) return;
    console.debug('Debug: saveVennFile invoked', { hasHandle: !!state.fileHandle });
    if (!fileIO || typeof fileIO.saveGraphFile !== 'function') {
      console.error('saveVennFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'venn',
      fileHandle: state.fileHandle,
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: venn.save result', result);
  };

  venn.saveAs = async function () {
    const payload = getVennGraphPayload();
    if (!payload) return;
    console.debug('Debug: saveAsVennFile invoked', { currentName: state.fileName });
    if (!fileIO || typeof fileIO.saveGraphFileAs !== 'function') {
      console.error('saveAsVennFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'venn',
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: venn.saveAs result', result);
  };

  venn.open = async function () {
    console.debug('Debug: venn open invoked');
    if (!fileIO || typeof fileIO.openGraphFile !== 'function') {
      console.error('openVennFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'venn',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: file => venn.loadFromFile(file),
      triggerInput: () => {
        const input = document.getElementById('vennGraphFile');
        if (input) {
          input.value = '';
          input.click();
        }
      }
    });
    console.debug('Debug: venn.open result', result);
  };

  venn.loadFromFile = function (file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result);
        console.log('loadVennGraph', obj);
        if (obj.type !== 'venn') throw new Error('Invalid graph type');
        const inputs = state.inputs;
        if (!inputs) return;
        const d = obj.data || {};
        inputs.labelA.value = d.labelA || '';
        inputs.labelB.value = d.labelB || '';
        inputs.labelC.value = d.labelC || '';
        inputs.A.value = d.listA || '';
        inputs.B.value = d.listB || '';
        inputs.C.value = d.listC || '';
        const c = inputs.counts;
        c.nA.value = d.nA || 0;
        c.nB.value = d.nB || 0;
        c.nC.value = d.nC || 0;
        c.nAB.value = d.nAB || 0;
        c.nAC.value = d.nAC || 0;
        c.nBC.value = d.nBC || 0;
        c.nABC.value = d.nABC || 0;
        const s = obj.style || {};
        inputs.colorA.value = s.colorA || inputs.colorA.value;
        inputs.colorB.value = s.colorB || inputs.colorB.value;
        inputs.colorC.value = s.colorC || inputs.colorC.value;
        inputs.opacity.value = s.opacity || inputs.opacity.value;
        inputs.opacityVal.textContent = inputs.opacity.value;
        inputs.borderColor.value = s.borderColor || inputs.borderColor.value;
        inputs.borderWidth.value = s.borderWidth || inputs.borderWidth.value;
        inputs.borderWidthVal.textContent = inputs.borderWidth.value;
        if (s.fontsize) {
          const fontInfo = resolveFontInfo(s.fontsize);
          inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
          chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
          console.debug('Debug: venn loadFromFile font applied', { saved: s.fontsize, fontInfo });
        } else {
          const fontInfo = resolveFontInfo(inputs.fontsize.value);
          inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : inputs.fontsize.value;
          chartStyle.renderFontSizeLabel({ element: inputs.fontsizeVal, fontInfo, input: inputs.fontsize });
          console.debug('Debug: venn loadFromFile font fallback', { fontInfo });
        }
        refreshDiagram();
      } catch (err) { console.error('loadVennGraph error', err); }
    };
    reader.readAsText(file);
  };

  venn.init = function init() {
    if (venn.ready) { debugLog('init skipped'); return; }
    debugLog('init start');
    initResizers();
    state.scheduleDraw = Shared.debounceFrame(refreshDiagram);
    console.debug('Debug: venn scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    if (typeof state.syncPanels === 'function') {
      console.debug('Debug: venn post-scheduler syncPanels'); // Debug: sync panels after scheduler setup
      state.syncPanels({ skipSchedule: true });
    }
    try { Chart.defaults.locale = 'en-US'; } catch (e) { }
    const $ = global.$;
    state.stage = document.getElementById('stage');
    state.inputs = {
      A: $('#listA'),
      B: $('#listB'),
      C: $('#listC'),
      labelA: $('#labelA'),
      labelB: $('#labelB'),
      labelC: $('#labelC'),
      colorA: $('#colorA'),
      colorB: $('#colorB'),
      colorC: $('#colorC'),
      opacity: $('#opacity'),
      fontsize: $('#fontsize'),
      borderColor: $('#borderColor'),
      borderWidth: $('#borderWidth'),
      opacityVal: $('#opacityVal'),
      fontsizeVal: $('#fontsizeVal'),
      borderWidthVal: $('#borderWidthVal'),
      caseSensitive: $('#caseSensitive'),
      delimiter: $('#delimiter'),
      counts: {
        nA: $('#nA'),
        nB: $('#nB'),
        nC: $('#nC'),
        nAB: $('#nAB'),
        nAC: $('#nAC'),
        nBC: $('#nBC'),
        nABC: $('#nABC')
      }
    };
    state.countsUI = {
      A: $('#countA'),
      B: $('#countB'),
      C: $('#countC'),
      AB: $('#countAB'),
      AC: $('#countAC'),
      BC: $('#countBC'),
      ABC: $('#countABC')
    };
    state.regionSelect = $('#regionSelect');
    state.regionList = $('#regionList');
    state.copyRegionBtn = $('#copyRegionBtn');
    state.goBtn = $('#goBtn');
    state.stringBtn = $('#stringBtn');
    state.goResults = $('#goResults');
    state.stringResults = $('#stringResults');
    state.stringNetwork = $('#stringNetwork');
    state.goChartExport = $('#goChartExport');
    state.stringNetworkExport = $('#stringNetworkExport');
    state.tooltip = $('#tooltip');
    state.speciesSelect = $('#speciesSelect');
    state.totalGenesInput = $('#totalGenes');
    state.calcSignificanceBtn = $('#calcSignificance');
    state.significanceResults = $('#significanceResults');
    state.goCategoryChecks = Array.from(document.querySelectorAll('.goCategory'));
    state.goOptsBtn = $('#goOptsBtn');
    state.goOptions = $('#goOptions');
    state.goUseAllBackground = $('#goUseAllBackground');
    state.stringOptsBtn = $('#stringOptsBtn');
    state.stringOptions = $('#stringOptions');
    const exporter = Shared.exporter;
    if (exporter && typeof exporter.mountSvgControls === 'function') {
      exporter.mountSvgControls({
        container: '#vennExportControls',
        svgSelector: '#stage',
        fileName: 'venn',
        contextLabel: 'venn-export'
      });
      console.debug('Debug: venn export controls mounted', { hasExporter: true }); // Debug: venn export mount
    } else {
      console.debug('Debug: venn export controls unavailable', { hasExporter: !!exporter }); // Debug: venn export fallback
    }
    if (exporter && typeof exporter.mountCanvasControls === 'function') {
      exporter.mountCanvasControls({
        container: '#goChartExport',
        canvasSelector: '#goChart',
        fileName: 'go_chart',
        contextLabel: 'go-chart',
        getSvgString: () => buildGoChartSvgString()
      });
      console.debug('Debug: go chart export controls mounted', { hasExporter: true }); // Debug: go chart export mount
    } else {
      console.debug('Debug: go chart export controls unavailable', { hasExporter: !!exporter }); // Debug: go chart export fallback
    }
    if (exporter && typeof exporter.mountSvgStringControls === 'function') {
      exporter.mountSvgStringControls({
        container: '#stringNetworkExport',
        getSvgString: () => state.lastStringSVG || '',
        fileName: 'string_network',
        contextLabel: 'string-export'
      });
      console.debug('Debug: string export controls mounted', { hasExporter: true }); // Debug: string export mount
    } else {
      console.debug('Debug: string export controls unavailable', { hasExporter: !!exporter }); // Debug: string export fallback
    }
    const handlePlainPaste = e => {
      e.preventDefault();
      const text = (e.clipboardData || global.clipboardData).getData('text/plain').replace(/\r/g, '').replace(/\u00A0/g, ' ');
      document.execCommand('insertText', false, text);
    };
    [state.inputs.A, state.inputs.B, state.inputs.C].forEach(el => el && el.addEventListener('paste', handlePlainPaste));
    loadStylePrefs();
    state.inputs.opacity.addEventListener('input', () => { state.inputs.opacityVal.textContent = state.inputs.opacity.value; refreshDiagram(); saveStylePrefs(); });
    state.inputs.fontsize.addEventListener('input', () => {
      const raw = state.inputs.fontsize.value;
      if(state.inputs.fontsize.dataset){
        state.inputs.fontsize.dataset.fontBasePt = String(raw);
        console.debug('Debug: venn font size base updated', { raw }); // Debug: manual slider update
      }
      const fontInfo = resolveFontInfo(raw);
      state.inputs.fontsize.value = Number.isFinite(fontInfo?.pt) ? fontInfo.pt : state.inputs.fontsize.value;
      chartStyle.renderFontSizeLabel({ element: state.inputs.fontsizeVal, fontInfo, input: state.inputs.fontsize });
      console.debug('Debug: venn fontsize slider change', { raw, fontInfo });
      refreshDiagram();
      saveStylePrefs();
    });
    ['colorA', 'colorB', 'colorC'].forEach(id => { state.inputs[id].addEventListener('input', () => { refreshDiagram(); saveStylePrefs(); }); });
    state.inputs.borderColor.addEventListener('input', () => { refreshDiagram(); saveStylePrefs(); });
    state.inputs.borderWidth.addEventListener('input', () => { state.inputs.borderWidthVal.textContent = state.inputs.borderWidth.value; refreshDiagram(); saveStylePrefs(); });
    ['labelA', 'labelB', 'labelC'].forEach(id => {
      state.inputs[id].addEventListener('input', () => {
        const labels = { A: state.inputs.labelA.value || 'A', B: state.inputs.labelB.value || 'B', C: state.inputs.labelC.value || 'C' };
        updateColorLabels(labels);
        updateRegionSelect(labels, state.lastCounts);
        updateCountLabels(labels);
      });
    });
    {
      const labels = { A: state.inputs.labelA.value || 'A', B: state.inputs.labelB.value || 'B', C: state.inputs.labelC.value || 'C' };
      updateColorLabels(labels);
      updateRegionSelect(labels, state.lastCounts);
      updateCountLabels(labels);
    }
    if (state.regionSelect) {
      state.regionSelect.addEventListener('change', () => { populateRegion(state.regionSelect.value); });
    }
    document.addEventListener('click', e => {
      if (state.tooltip && state.tooltip.style.display === 'block' && !state.tooltip.contains(e.target)) {
        state.tooltip.style.display = 'none';
      }
    });
    if (state.copyRegionBtn) {
      state.copyRegionBtn.addEventListener('click', () => {
        const text = getRegionText(state.regionSelect.value);
        navigator.clipboard.writeText(text).catch(() => { });
      });
    }
    if (state.goOptsBtn && state.goOptions) {
      state.goOptsBtn.addEventListener('click', () => {
        const show = state.goOptions.style.display === 'none';
        state.goOptions.style.display = show ? 'block' : 'none';
      });
    }
    if (state.stringOptsBtn && state.stringOptions) {
      state.stringOptsBtn.addEventListener('click', () => {
        const show = state.stringOptions.style.display === 'none';
        state.stringOptions.style.display = show ? 'block' : 'none';
      });
    }
    ['A', 'B', 'C'].forEach(k => {
      state.inputs[k].addEventListener('input', () => {
        if (state.speciesSelect) { state.speciesSelect.value = ''; }
        setSpeciesIndicator(null);
      });
    });
    if (state.regionList) {
      state.regionList.addEventListener('mouseover', async e => {
        const link = e.target.closest('.gene-link');
        if (link && state.regionList.contains(link)) {
          const gene = link.dataset.gene;
          const fn = await fetchUniProtAnnotation(gene);
          if (state.tooltip) {
            state.tooltip.innerHTML = fn ? `<strong>${gene}</strong><br>${fn}` : `<strong>${gene}</strong><br><i>Function not found</i>`;
            state.tooltip.style.fontSize = '12px';
            state.tooltip.style.maxHeight = 'none';
            state.tooltip.style.overflow = 'visible';
            state.tooltip.style.columnCount = 1;
            state.tooltip.style.columnWidth = 'auto';
            state.tooltip.style.columnGap = '0';
            state.tooltip.style.width = 'auto';
            state.tooltip.style.height = 'auto';
            state.tooltip.style.whiteSpace = 'normal';
            let left = e.pageX + 8;
            let top = e.pageY + 8;
            state.tooltip.style.left = left + 'px';
            state.tooltip.style.top = top + 'px';
            state.tooltip.style.display = 'block';
            requestAnimationFrame(() => {
              const w = state.tooltip.scrollWidth;
              const h = state.tooltip.scrollHeight;
              state.tooltip.style.width = w + 'px';
              state.tooltip.style.height = h + 'px';
              positionTooltip(left, top);
            });
          }
        }
      });
      state.regionList.addEventListener('mouseout', e => {
        const link = e.target.closest('.gene-link');
        if (link && state.regionList.contains(link) && state.tooltip) {
          state.tooltip.style.display = 'none';
        }
      });
      state.regionList.addEventListener('click', async e => {
        const link = e.target.closest('.gene-link');
        if (link && state.regionList.contains(link)) {
          const gene = link.dataset.gene;
          const taxId = state.speciesSelect?.selectedOptions[0]?.dataset.string || '9606';
          const fallbackUrl = `https://www.uniprot.org/uniprotkb?query=gene_exact:${encodeURIComponent(gene)}+AND+reviewed:true`;
          let targetUrl = fallbackUrl;
          const service = Shared.uniprot;
          if (service && typeof service.resolveEntryUrl === 'function') {
            try {
              const lookup = await service.resolveEntryUrl({ gene, organismTaxId: taxId, fetch });
              if (lookup) {
                targetUrl = lookup.entryUrl || lookup.fallbackUrl || fallbackUrl;
                debugLog('geneLink navigate', { gene, taxId, accession: lookup.accession || null, targetUrl }); // Debug: gene link navigation result
              }
            } catch (err) {
              debugLog('geneLink navigateError', { gene, message: err && err.message }); // Debug: gene link navigation error
            }
          }
          window.open(targetUrl, '_blank', 'noopener');
        }
      });
    }
    if (state.goBtn && state.tooltip) {
      const goBtnTip = 'Sends the selected species and gene list to g:Profiler GOSt, returns all GO categories and default sources, and displays the top five terms by significance.';
      state.goBtn.addEventListener('mouseenter', () => {
        state.tooltip.innerHTML = goBtnTip;
        state.tooltip.style.fontSize = '12px';
        state.tooltip.style.maxHeight = 'none';
        state.tooltip.style.overflow = 'visible';
        state.tooltip.style.columnCount = 1;
        state.tooltip.style.columnWidth = 'auto';
        state.tooltip.style.width = 'max-content';
        state.tooltip.style.height = 'auto';
        state.tooltip.style.visibility = 'hidden';
        state.tooltip.style.display = 'block';
        const rect = state.goBtn.getBoundingClientRect();
        let left = rect.right + window.scrollX + 8;
        let top = rect.top + window.scrollY;
        state.tooltip.style.left = left + 'px';
        state.tooltip.style.top = top + 'px';
        positionTooltip(left, top);
        let tRect = state.tooltip.getBoundingClientRect();
        const overlaps = !(tRect.right < rect.left || tRect.left > rect.right || tRect.bottom < rect.top || tRect.top > rect.bottom);
        if (overlaps) {
          left = rect.left + window.scrollX;
          top = rect.bottom + window.scrollY + 8;
          state.tooltip.style.left = left + 'px';
          state.tooltip.style.top = top + 'px';
          positionTooltip(left, top);
          tRect = state.tooltip.getBoundingClientRect();
          const stillOverlap = !(tRect.right < rect.left || tRect.left > rect.right || tRect.bottom < rect.top || tRect.top > rect.bottom);
          if (stillOverlap) {
            top = rect.top + window.scrollY - tRect.height - 8;
            state.tooltip.style.left = left + 'px';
            state.tooltip.style.top = top + 'px';
            positionTooltip(left, top);
          }
        }
        state.tooltip.style.visibility = 'visible';
      });
      state.goBtn.addEventListener('mouseleave', () => {
        state.tooltip.style.display = 'none';
      });
    }
    if (state.goResults) {
      state.goResults.addEventListener('click', e => {
        if (e.target.id === 'toggleGoResults') {
          const stateAttr = e.target.dataset.state;
          if (stateAttr === 'top5') { renderGOResults(state.lastGOResult.length); }
          else { renderGOResults(5); }
        }
      });
    }
    if (state.calcSignificanceBtn) {
      state.calcSignificanceBtn.addEventListener('click', () => {
        console.debug('Debug: venn significance click');
        calculateSignificance();
      });
    }
    if (state.goBtn) {
      state.goBtn.addEventListener('click', async () => {
        try {
          const regionGenes = (getRegionText(state.regionSelect.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
          let organism = state.speciesSelect.value;
          if (!organism) {
            const allGenes = getAllGenes();
            const guess = allGenes.length ? await guessSpecies(allGenes) : null;
            if (guess) {
              state.speciesSelect.value = organism = guess;
              setSpeciesIndicator(true);
            } else {
              setSpeciesIndicator(false);
              alert('Please select a species before running GO analysis.');
              return;
            }
          }
          runGOAnalysis(regionGenes, organism);
        } catch (err) { console.error('goBtn error', err); }
      });
    }
    if (state.stringBtn) {
      state.stringBtn.addEventListener('click', async () => {
        try {
          const regionGenes = (getRegionText(state.regionSelect.value) || '').split(/\n/).map(g => g.trim()).filter(Boolean);
          let organism = state.speciesSelect.value;
          if (!organism) {
            const allGenes = getAllGenes();
            const guess = allGenes.length ? await guessSpecies(allGenes) : null;
            if (guess) {
              state.speciesSelect.value = organism = guess;
              setSpeciesIndicator(true);
            } else {
              setSpeciesIndicator(false);
              alert('Please select a species before running STRING analysis.');
              return;
            }
          }
          runStringAnalysis(regionGenes, organism);
        } catch (err) { console.error('stringBtn error', err); }
      });
    }
    const drawBtn = document.getElementById('draw');
    const useNumericBtn = document.getElementById('useNumeric');
    if (drawBtn) drawBtn.addEventListener('click', () => { state.lastDrawMode = 'lists'; drawFromLists(); });
    if (useNumericBtn) useNumericBtn.addEventListener('click', () => { state.lastDrawMode = 'numeric'; drawFromNumeric(); });
    const openBtn = document.getElementById('openVenn');
    const saveBtn = document.getElementById('saveVenn');
    const saveAsBtn = document.getElementById('saveAsVenn');
    if (openBtn) openBtn.addEventListener('click', venn.open);
    if (saveBtn) saveBtn.addEventListener('click', venn.save);
    if (saveAsBtn) saveAsBtn.addEventListener('click', venn.saveAs);
    const fileInput = document.getElementById('vennGraphFile');
    if (fileInput) {
      fileInput.addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) { state.fileName = f.name; state.fileHandle = null; venn.loadFromFile(f); }
      });
    }
    const sampleBtn = document.getElementById('sample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => {
        state.inputs.labelA.value = 'Transcriptomic';
        state.inputs.labelB.value = 'Proteomic';
        state.inputs.labelC.value = 'Phospho';
        state.inputs.A.value = `BRCA1\nATM\nBAP1\nEZH2\nSUZ12\nRING1B`;
        state.inputs.B.value = `BRCA1\nBAP1\nRING1B\nCBX2\nHDAC1\nPAXIP1\nHUWE1`;
        state.inputs.C.value = `BRCA1\nPAXIP1\nCSNK2A1\nRING1B\nKAT7`;
        state.lastDrawMode = 'lists';
        refreshDiagram();
      });
    }
    const resetBtn = document.getElementById('reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        console.debug('Debug: venn reset handler invoked');
        state.inputs.A.value = '';
        state.inputs.B.value = '';
        state.inputs.C.value = '';
        Object.values(state.inputs.counts).forEach(x => x.value = 0);
        clearSVG();
        state.lastRegions = null;
        state.lastDrawMode = null;
        state.lastCounts = null;
        if (state.regionList) state.regionList.textContent = '';
        Object.values(state.countsUI || {}).forEach(el => { if (el) el.textContent = '0'; });
        const defaultLabels = { A: 'A', B: 'B', C: 'C' };
        updateCountLabels(defaultLabels);
        updateColorLabels(defaultLabels);
        updateRegionSelect(defaultLabels, null);
        clearAnalysis();
        if (state.speciesSelect) state.speciesSelect.value = '';
        setSpeciesIndicator(null);
        if (state.totalGenesInput) state.totalGenesInput.value = '';
        if (state.significanceResults) state.significanceResults.innerHTML = '';
        debugLog('reset handler completed', { defaultLabels });
      });
    }
    venn.ready = true;
    debugLog('init complete');
  };

  Object.assign(venn, {
    parseList,
    setsFromLists,
    layoutFromCounts,
    fitAndDraw,
    refreshCounts,
    updateCountLabels,
    updateRegionSelect,
    updateColorLabels,
    getRegionText,
    getAllGenes,
    guessSpecies,
    setSpeciesIndicator,
    recognizeSpeciesFromInput,
    clearAnalysis,
    runGOAnalysis,
    runStringAnalysis,
    exportGoChart,
    downloadStringPNG,
    downloadStringSVG,
    calculateSignificance,
    drawFromLists,
    drawFromNumeric,
    refreshDiagram
  });

  venn.draw = function draw() {
    try {
      refreshDiagram();
    } catch (e) {
      console.error('venn.draw error', e);
    }
  };

  venn.ensure = function ensure() {
    if (!venn.ready) venn.init();
  };
})(window);


