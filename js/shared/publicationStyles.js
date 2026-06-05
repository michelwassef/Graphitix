(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.publicationStyles = Shared.publicationStyles || {};

  const TYPE_TO_PAGE = Object.freeze({
    venn: { pageId: 'vennPage', panelSelector: '.config-panel' },
    box: { pageId: 'boxPage', panelSelector: '.config-panel' },
    scatter: { pageId: 'scatterPage', panelSelector: '.config-panel' },
    pca: { pageId: 'pcaPage', panelSelector: '.config-panel' },
    line: { pageId: 'linePage', panelSelector: '.config-panel' },
    heatmap: { pageId: 'heatmapPage', panelSelector: '.config-panel' },
    surface: { pageId: 'surfacePage', panelSelector: '.config-panel' },
    roc: { pageId: 'rocPage', panelSelector: '.config-panel' },
    survival: { pageId: 'survivalPage', panelSelector: '.config-panel' },
    hist: { pageId: 'histPage', panelSelector: '.config-panel' },
    pie: { pageId: 'piePage', panelSelector: '.config-panel' }
  });

  const PUBLICATION_STYLE_ZOOM_LEVEL = 1.4;

  // Graphitix stores on-screen/export dimensions in CSS pixels. Publisher
  // specifications are stated in print millimetres; 96 CSS px per inch keeps
  // existing Graphitix sizing behavior unchanged while making the presets
  // auditable against publisher documentation.
  const MM_TO_PX = 96 / 25.4;
  const MM_TO_PT = 72 / 25.4;
  const DEFAULT_GRAPH_ASPECT = 300 / 336;
  const DEFAULT_PRESET_ID = 'npg_single';
  const DEFAULT_AXIS_COLOR = '#000000';
  const DEFAULT_FONT_FAMILY = 'Arial';
  const DEFAULT_SINGLE_BOX_FILL = '#666666';
  const DEFAULT_SINGLE_BOX_STROKE = '#000000';

  function roundNumber(value, digits = 3){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return numeric;
    const factor = Math.pow(10, Math.max(0, Number(digits) || 0));
    return Math.round(numeric * factor) / factor;
  }

  function mmToPx(mm){
    const numeric = Number(mm);
    if(!Number.isFinite(numeric) || numeric <= 0){
      return 1;
    }
    return Math.max(1, Math.round(numeric * MM_TO_PX));
  }

  function mmToPt(mm){
    const numeric = Number(mm);
    if(!Number.isFinite(numeric) || numeric <= 0){
      return 0.5;
    }
    return roundNumber(numeric * MM_TO_PT, 3);
  }

  function proportionalHeightPx(widthPx, maxHeightMm){
    const width = Math.max(1, Math.round(Number(widthPx) || 1));
    const proportional = Math.max(1, Math.round(width * DEFAULT_GRAPH_ASPECT));
    const maxHeightPx = Number.isFinite(Number(maxHeightMm)) && Number(maxHeightMm) > 0
      ? mmToPx(maxHeightMm)
      : null;
    return maxHeightPx ? Math.min(proportional, maxHeightPx) : proportional;
  }

  function makePublisherPreset(options){
    const opts = options && typeof options === 'object' ? options : {};
    const id = String(opts.id || '').trim();
    if(!id){
      throw new Error('Publication style preset requires a stable id.');
    }
    const widthPx = Number.isFinite(Number(opts.widthPx)) && Number(opts.widthPx) > 0
      ? Math.round(Number(opts.widthPx))
      : mmToPx(opts.widthMm);
    const heightPx = Number.isFinite(Number(opts.heightPx)) && Number(opts.heightPx) > 0
      ? Math.round(Number(opts.heightPx))
      : (Number.isFinite(Number(opts.heightMm)) && Number(opts.heightMm) > 0
        ? mmToPx(opts.heightMm)
        : proportionalHeightPx(widthPx, opts.maxHeightMm));
    const source = opts.source && typeof opts.source === 'object' ? opts.source : {};
    return Object.freeze({
      id,
      label: String(opts.label || id),
      group: String(opts.group || source.publisher || 'Other publisher presets'),
      styleNote: String(opts.styleNote || ''),
      targetWidthPx: widthPx,
      targetHeightPx: heightPx,
      widthMm: Number.isFinite(Number(opts.widthMm)) ? Number(opts.widthMm) : null,
      heightMm: Number.isFinite(Number(opts.heightMm)) ? Number(opts.heightMm) : null,
      fontFamily: String(opts.fontFamily || DEFAULT_FONT_FAMILY),
      fontSizePt: Number.isFinite(Number(opts.fontSizePt)) && Number(opts.fontSizePt) > 0 ? Number(opts.fontSizePt) : 7,
      axisColor: String(opts.axisColor || DEFAULT_AXIS_COLOR),
      axisStrokeWidth: Number.isFinite(Number(opts.axisStrokeWidth)) && Number(opts.axisStrokeWidth) > 0 ? Number(opts.axisStrokeWidth) : 0.5,
      textSizeLocked: opts.textSizeLocked !== false,
      pointSize: Number.isFinite(Number(opts.pointSize)) && Number(opts.pointSize) > 0 ? Number(opts.pointSize) : 4,
      pointBorderWidth: Number.isFinite(Number(opts.pointBorderWidth)) && Number(opts.pointBorderWidth) >= 0 ? Number(opts.pointBorderWidth) : 1,
      summaryColor: String(opts.summaryColor || DEFAULT_AXIS_COLOR),
      significanceColor: String(opts.significanceColor || DEFAULT_AXIS_COLOR),
      schemeId: String(opts.schemeId || 'colorblind'),
      showGrid: opts.showGrid === true,
      showFrame: opts.showFrame === true,
      singleBoxFill: String(opts.singleBoxFill || DEFAULT_SINGLE_BOX_FILL),
      singleBoxStroke: String(opts.singleBoxStroke || DEFAULT_SINGLE_BOX_STROKE),
      boxDatasetSpacingX: Number.isFinite(Number(opts.boxDatasetSpacingX)) ? Number(opts.boxDatasetSpacingX) : 0.6,
      source: Object.freeze({
        publisher: String(source.publisher || ''),
        sizing: String(source.sizing || ''),
        typography: String(source.typography || ''),
        stroke: String(source.stroke || ''),
        color: String(source.color || '')
      })
    });
  }

  const PRESET_LIST = Object.freeze([
    // Nature/NPG: 89 mm single, 120-136 mm intermediate, 183 mm double;
    // Helvetica/Arial, max 7 pt non-panel text, 0.25-1 pt strokes.
    makePublisherPreset({
      id: 'npg_single',
      label: 'Nature / NPG — single column (89 mm)',
      group: 'Nature / NPG — same style, choose final width',
      widthPx: 336,
      heightPx: 300,
      widthMm: 89,
      fontSizePt: 7,
      axisStrokeWidth: 0.333,
      source: { publisher: 'Nature / NPG', sizing: '89 mm single column', typography: 'Arial/Helvetica, 7 pt', stroke: '0.25-1 pt' }
    }),
    makePublisherPreset({
      id: 'npg_15col_120',
      label: 'Nature / NPG — 1.5 column (120 mm)',
      group: 'Nature / NPG — same style, choose final width',
      widthMm: 120,
      fontSizePt: 7,
      axisStrokeWidth: 0.333,
      source: { publisher: 'Nature / NPG', sizing: '120-136 mm intermediate figure width', typography: 'Arial/Helvetica, 7 pt', stroke: '0.25-1 pt' }
    }),
    makePublisherPreset({
      id: 'npg_15col_136',
      label: 'Nature / NPG — 1.5 column (136 mm)',
      group: 'Nature / NPG — same style, choose final width',
      widthMm: 136,
      fontSizePt: 7,
      axisStrokeWidth: 0.333,
      source: { publisher: 'Nature / NPG', sizing: '120-136 mm intermediate figure width', typography: 'Arial/Helvetica, 7 pt', stroke: '0.25-1 pt' }
    }),
    makePublisherPreset({
      id: 'npg_double',
      label: 'Nature / NPG — double column (183 mm)',
      group: 'Nature / NPG — same style, choose final width',
      widthMm: 183,
      fontSizePt: 7,
      axisStrokeWidth: 0.333,
      source: { publisher: 'Nature / NPG', sizing: '183 mm double column', typography: 'Arial/Helvetica, 7 pt', stroke: '0.25-1 pt' }
    }),

    // Science/AAAS: published figure widths are 5.7, 12.1, and 18.4 cm.
    makePublisherPreset({
      id: 'science_1col',
      label: 'Science / AAAS — 1 column (57 mm)',
      group: 'Science / AAAS',
      widthMm: 57,
      fontSizePt: 7,
      axisStrokeWidth: 0.5,
      source: { publisher: 'Science / AAAS', sizing: '57 mm one column', typography: 'legible after reduction, about 7 pt', stroke: 'sufficient final line weight' }
    }),
    makePublisherPreset({
      id: 'science_2col',
      label: 'Science / AAAS — 2 columns (121 mm)',
      group: 'Science / AAAS',
      widthMm: 121,
      fontSizePt: 7,
      axisStrokeWidth: 0.5,
      source: { publisher: 'Science / AAAS', sizing: '121 mm two columns', typography: 'legible after reduction, about 7 pt', stroke: 'sufficient final line weight' }
    }),
    makePublisherPreset({
      id: 'science_3col',
      label: 'Science / AAAS — 3 columns (184 mm)',
      group: 'Science / AAAS',
      widthMm: 184,
      fontSizePt: 7,
      axisStrokeWidth: 0.5,
      source: { publisher: 'Science / AAAS', sizing: '184 mm three columns', typography: 'legible after reduction, about 7 pt', stroke: 'sufficient final line weight' }
    }),

    // Cell Press specifies figure text around 6-8 pt, but does not provide a
    // single universal graph width; use an NPG-like single-panel width rather
    // than pretending that a precise Cell-wide column geometry exists.
    makePublisherPreset({
      id: 'cell_press_single',
      label: 'Cell Press — typography preset (89 mm working width)',
      group: 'Cell Press / Nature-compatible typography',
      widthMm: 89,
      fontSizePt: 7,
      axisStrokeWidth: 0.5,
      source: { publisher: 'Cell Press', sizing: 'no universal graph width; Graphitix single-panel default 89 mm', typography: '6-8 pt at print size', stroke: 'clean vector line art' }
    }),

    // PLOS SigmaPlot guidance: 132.0 mm text column or 190.5 mm page width,
    // 8 pt text, 0.2 mm lines.
    makePublisherPreset({
      id: 'plos_text',
      label: 'PLOS — text column (132 mm)',
      group: 'PLOS',
      widthMm: 132,
      maxHeightMm: 222.3,
      fontSizePt: 8,
      axisStrokeWidth: mmToPt(0.2),
      pointSize: 4.5,
      source: { publisher: 'PLOS', sizing: '132.0 mm text-column graph width', typography: '8 pt', stroke: '0.2 mm' }
    }),
    makePublisherPreset({
      id: 'plos_full',
      label: 'PLOS — full page (190.5 mm)',
      group: 'PLOS',
      widthMm: 190.5,
      maxHeightMm: 222.3,
      fontSizePt: 8,
      axisStrokeWidth: mmToPt(0.2),
      pointSize: 4.5,
      source: { publisher: 'PLOS', sizing: '190.5 mm full-page graph width', typography: '8 pt', stroke: '0.2 mm' }
    }),

    // JCB: maximum figure size 17.5 x 22.8 cm; 8 pt text; 0.5-1.0 pt strokes.
    makePublisherPreset({
      id: 'jcb_max',
      label: 'JCB / Rockefeller UP — max width (175 mm)',
      group: 'JCB / Rockefeller University Press',
      widthMm: 175,
      maxHeightMm: 228,
      fontSizePt: 8,
      axisStrokeWidth: 0.75,
      pointSize: 4.5,
      source: { publisher: 'Journal of Cell Biology / Rockefeller University Press', sizing: '175 mm max width', typography: '8 pt', stroke: '0.5-1.0 pt' }
    }),

    // Journal of Cell Science / Company of Biologists: max 180 x 210 mm;
    // 8 pt Arial graph labels; preferred graph symbols are the standard
    // circle/triangle/square/diamond family already available in Graphitix.
    makePublisherPreset({
      id: 'jcs_full',
      label: 'Journal of Cell Science / CoB — max width (180 mm)',
      group: 'Journal of Cell Science / Company of Biologists',
      widthMm: 180,
      maxHeightMm: 210,
      fontSizePt: 8,
      axisStrokeWidth: 0.75,
      pointSize: 4.5,
      source: { publisher: 'Journal of Cell Science / Company of Biologists', sizing: '180 mm max width, 210 mm max height', typography: '8 pt Arial labels', stroke: 'sufficient line thickness' }
    }),

    // EMBO Press: 87 mm one-column or 180 mm two-column printed figure widths.
    makePublisherPreset({
      id: 'embo_single',
      label: 'EMBO Press — single column (87 mm)',
      group: 'EMBO Press',
      widthMm: 87,
      fontSizePt: 7,
      axisStrokeWidth: 0.5,
      source: { publisher: 'EMBO Press', sizing: '87 mm one column', typography: 'small readable graph labels', stroke: 'clean vector line art' }
    }),
    makePublisherPreset({
      id: 'embo_double',
      label: 'EMBO Press — double column (180 mm)',
      group: 'EMBO Press',
      widthMm: 180,
      fontSizePt: 7,
      axisStrokeWidth: 0.5,
      source: { publisher: 'EMBO Press', sizing: '180 mm two columns', typography: 'small readable graph labels', stroke: 'clean vector line art' }
    }),

    // JCI: 9-18 cm width, 17.25 cm max height, 8 pt Helvetica/Arial, RGB.
    makePublisherPreset({
      id: 'jci_single',
      label: 'JCI — single column (90 mm)',
      group: 'Journal of Clinical Investigation',
      widthMm: 90,
      maxHeightMm: 172.5,
      fontSizePt: 8,
      axisStrokeWidth: 0.5,
      pointSize: 4.5,
      source: { publisher: 'Journal of Clinical Investigation', sizing: '90 mm within 9-18 cm range', typography: '8 pt Helvetica/Arial', stroke: 'clean vector line art' }
    }),
    makePublisherPreset({
      id: 'jci_double',
      label: 'JCI — double column (180 mm)',
      group: 'Journal of Clinical Investigation',
      widthMm: 180,
      maxHeightMm: 172.5,
      fontSizePt: 8,
      axisStrokeWidth: 0.5,
      pointSize: 4.5,
      source: { publisher: 'Journal of Clinical Investigation', sizing: '180 mm within 9-18 cm range', typography: '8 pt Helvetica/Arial', stroke: 'clean vector line art' }
    })
  ]);

  const PRESETS = Object.freeze(PRESET_LIST.reduce((acc, preset) => {
    acc[preset.id] = preset;
    return acc;
  }, {}));

  const FONT_CONTROL_IDS = Object.freeze({
    venn: Object.freeze({ inputId: 'fontsize', labelId: 'fontsizeVal' }),
    box: Object.freeze({ inputId: 'boxFontSize', labelId: 'boxFontSizeVal' }),
    scatter: Object.freeze({ inputId: 'scatterFontSize', labelId: 'scatterFontSizeVal' }),
    pca: Object.freeze({ inputId: 'pcaFontSize', labelId: 'pcaFontSizeVal' }),
    line: Object.freeze({ inputId: 'lineFontSize', labelId: 'lineFontSizeVal' }),
    heatmap: Object.freeze({ inputId: 'heatmapFontSize', labelId: 'heatmapFontSizeVal' }),
    surface: Object.freeze({ inputId: 'surfaceFontSize', labelId: 'surfaceFontSizeVal' }),
    roc: Object.freeze({ inputId: 'rocFontSize', labelId: 'rocFontSizeVal' }),
    survival: Object.freeze({ inputId: 'survivalFontSize', labelId: 'survivalFontSizeVal' }),
    hist: Object.freeze({ inputId: 'histFontSize', labelId: 'histFontSizeVal' }),
    pie: Object.freeze({ inputId: 'pieFontSize', labelId: 'pieFontSizeVal' })
  });

  const state = {
    initialized: false,
    controlsByType: {},
    monitorTimer: null,
    lastActiveSignature: null,
    controlListenersBound: false,
    lifecycleSyncAttached: false,
    documentStateSyncAttached: false
  };

  const publicationAsyncOwners = {};

  function getPublicationAsyncOwner(type){
    const key = String(type || 'publicationStyles').trim() || 'publicationStyles';
    publicationAsyncOwners[key] = publicationAsyncOwners[key] || { __componentKey: key };
    return publicationAsyncOwners[key];
  }

  function schedulePublicationTimeout(type, tabId, reason, fn, delay = 0){
    if(typeof fn !== 'function'){
      return null;
    }
    return Shared.componentLifecycle?.scheduleComponentTimeout?.(getPublicationAsyncOwner(type), type || 'publicationStyles', {
      tabId,
      reason: reason || 'publication-style-timeout'
    }, fn, delay) || null;
  }

  function schedulePublicationFrame(type, tabId, reason, fn){
    if(typeof fn !== 'function'){
      return null;
    }
    return Shared.componentLifecycle?.scheduleComponentFrame?.(getPublicationAsyncOwner(type), type || 'publicationStyles', {
      tabId,
      reason: reason || 'publication-style-frame'
    }, fn) || null;
  }

  function isDebugEnabled(){
    try{
      return typeof Shared.isDebugEnabled !== 'function' || Shared.isDebugEnabled();
    }catch(err){
      return true;
    }
  }

  function debugLog(message, payload){
    if(!isDebugEnabled()) return;
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      if(typeof payload === 'undefined'){
        console.debug(message);
      }else{
        console.debug(message, payload);
      }
    }
  }

  function cloneValue(value){
    if(value == null) return value;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      return value;
    }
  }

  function ensureObject(value){
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function ptToPxToken(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){
      return '';
    }
    const px = Math.round((numeric * (96 / 72)) * 100) / 100;
    return `${String(px).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')}px`;
  }

  function setDeep(obj, path, value){
    if(!obj || typeof obj !== 'object') return;
    const parts = Array.isArray(path) ? path : String(path).split('.');
    let cur = obj;
    for(let i=0;i<parts.length-1;i++){
      const key = parts[i];
      if(!cur[key] || typeof cur[key] !== 'object'){
        cur[key] = {};
      }
      cur = cur[key];
    }
    cur[parts[parts.length-1]] = value;
  }

  function getActiveTab(){
    const session = global.Main?.session;
    if(!session || typeof session.getActiveTab !== 'function') return null;
    return session.getActiveTab();
  }

  function getActiveSignature(){
    const tab = getActiveTab();
    if(!tab || !tab.type || tab.isWelcome) return null;
    return `${tab.id}::${tab.type}`;
  }

  function resolveTabScopedRoot(type, tabLike, options){
    const opts = options && typeof options === 'object' ? options : {};
    const allowPageFallback = opts.allowPageFallback === true;
    const helper = Shared.workspaceTabs || null;
    const resolvedType = String(type || '').trim();
    if(helper && typeof helper.resolveTabScopedRoot === 'function'){
      const helperRoot = helper.resolveTabScopedRoot(resolvedType, tabLike, {
        allowPageFallback,
        pageId: TYPE_TO_PAGE[resolvedType]?.pageId || null
      });
      if(helperRoot){
        return helperRoot;
      }
    }
    let tab = tabLike && typeof tabLike === 'object' ? tabLike : null;
    if(!tab && helper && typeof helper.resolveTab === 'function'){
      tab = helper.resolveTab(tabLike || null) || null;
    }
    if(!tab && (!tabLike || tabLike === null || tabLike === undefined)){
      tab = getActiveTab();
    }
    if(helper){
      const mounted = typeof helper.getMountedRoot === 'function'
        ? helper.getMountedRoot(tab || tabLike || null, resolvedType)
        : null;
      if(mounted){
        return mounted;
      }
      const sessionRoot = typeof helper.getSessionRecord === 'function'
        ? helper.getSessionRecord(tab || tabLike || null, resolvedType)?.dom?.root
        : null;
      if(sessionRoot){
        return sessionRoot;
      }
      if((tab || tabLike) && !allowPageFallback){
        return null;
      }
    }
    const descriptor = TYPE_TO_PAGE[resolvedType];
    if(!descriptor){
      return null;
    }
    if(!allowPageFallback && (tab || tabLike)){
      return null;
    }
    return global.document?.getElementById(descriptor.pageId) || null;
  }

  function resolvePrimarySvgBox(type, tabLike){
    const scopedRoot = resolveTabScopedRoot(type, tabLike, { allowPageFallback: false });
    if(scopedRoot && typeof scopedRoot.querySelector === 'function'){
      const scopedBox = scopedRoot.querySelector('.svgbox');
      if(scopedBox){
        return scopedBox;
      }
    }
    return null;
  }

  function isActiveTabForType(type, tabId){
    const active = getActiveTab();
    return !!active
      && !active.isWelcome
      && active.type === type
      && String(active.id || '') === String(tabId || '');
  }

  function runForActivePublicationTab(type, tabId, reason, fn){
    if(!isActiveTabForType(type, tabId)){
      const active = getActiveTab();
      debugLog('Debug: publicationStyles deferred mutation skipped', {
        type,
        tabId: tabId || null,
        activeTabId: active?.id || null,
        activeType: active?.type || null,
        reason: reason || 'inactive-tab'
      });
      return false;
    }
    if(typeof fn === 'function'){
      fn();
      return true;
    }
    return false;
  }

  function findPanelForType(type){
    const descriptor = TYPE_TO_PAGE[type];
    if(!descriptor) return null;
    const page = global.document?.getElementById(descriptor.pageId);
    if(!page) return null;
    return page.querySelector(descriptor.panelSelector);
  }

  function findFieldset(panel){
    if(!panel || typeof panel.querySelector !== 'function') return null;
    return panel.querySelector('[data-publication-style-fieldset="1"]');
  }

  function resolveInsertAnchor(panel){
    if(!panel || typeof panel.querySelector !== 'function') return null;
    // Prefer inserting after the color scheme controls if present.
    const schemeFieldset = panel.querySelector('[data-color-scheme-fieldset="1"]');
    return schemeFieldset || panel.firstChild || null;
  }


  function captureDefaultState(type, session, domControls, workspace){
    const snapshot = {
      defaultPayload: null,
      emptyPayloadTemplate: null
    };
    try{
      if(domControls && typeof domControls.ensureDefaultPayload === 'function'){
        snapshot.defaultPayload = cloneValue(domControls.ensureDefaultPayload(session, type, workspace));
      }
    }catch(err){
      console.error('publicationStyles capture default payload error', { type, err });
    }
    try{
      if(workspace && typeof workspace.captureEmptyPayloadTemplate === 'function'){
        snapshot.emptyPayloadTemplate = cloneValue(workspace.captureEmptyPayloadTemplate());
      }
    }catch(err){
      console.error('publicationStyles capture empty payload template error', { type, err });
    }
    debugLog('Debug: publicationStyles captured defaults', {
      type,
      hasDefaultPayload: !!snapshot.defaultPayload,
      hasEmptyPayloadTemplate: !!snapshot.emptyPayloadTemplate
    });
    return snapshot;
  }

  function restoreDefaultState(type, session, domControls, workspace, snapshot, reason){
    const nextSnapshot = snapshot || {};
    try{
      if(nextSnapshot.defaultPayload && domControls && typeof domControls.setWorkspaceDefaultPayload === 'function'){
        domControls.setWorkspaceDefaultPayload(session, type, cloneValue(nextSnapshot.defaultPayload));
      }
    }catch(err){
      console.error('publicationStyles restore default payload error', { type, reason, err });
    }
    try{
      if(nextSnapshot.emptyPayloadTemplate && workspace && typeof workspace.restoreEmptyPayloadTemplate === 'function'){
        workspace.restoreEmptyPayloadTemplate(cloneValue(nextSnapshot.emptyPayloadTemplate), {
          reason: reason || 'publication-style-restore'
        });
      }
    }catch(err){
      console.error('publicationStyles restore empty payload template error', { type, reason, err });
    }
    debugLog('Debug: publicationStyles restored defaults', {
      type,
      reason: reason || 'publication-style-restore',
      hasDefaultPayload: !!nextSnapshot.defaultPayload,
      hasEmptyPayloadTemplate: !!nextSnapshot.emptyPayloadTemplate
    });
  }

  function applySizingToActiveSvgBox(type, payload, sizing){
    const graphSizing = Shared.graphSizing || null;
    if(graphSizing && typeof graphSizing.applyPayloadSizingForType === 'function'){
      graphSizing.applyPayloadSizingForType(type, payload, {
        context: `publication-style-${type}`,
        updateDefaults: true,
        updateAspectRatio: true,
        preserveAspectLock: true,
        forceExact: true
      });
      const appliedSizing = graphSizing.getPayloadSizing(payload, {
        context: `publication-style-${type}-read`
      });
      debugLog('Debug: publicationStyles applied payload sizing', {
        type,
        widthPx: appliedSizing?.display?.widthPx || null,
        heightPx: appliedSizing?.display?.heightPx || null,
        manualLikeResize: true
      });
      return;
    }
    const box = resolvePrimarySvgBox(type, getActiveTab());
    if(!box) return;
    const w = Number(sizing?.targetWidthPx);
    const h = Number(sizing?.targetHeightPx);
    if(typeof Shared.applyResizableBoxSize === 'function'){
      const result = Shared.applyResizableBoxSize(box, {
        width: w,
        height: h,
        axis: 'both',
        reason: `publication-style-${type}-fallback`,
        updateDefaults: true,
        updateAspectRatio: true,
        preserveAspectLock: true,
        forceExact: true
      });
      if(result){
        debugLog('Debug: publicationStyles applied svgbox sizing via resizer helper', { type, widthPx: w, heightPx: h });
        return;
      }
    }
    if(!box.style) return;
    if(Number.isFinite(w) && w > 0){
      box.style.width = `${Math.round(w)}px`;
    }
    if(Number.isFinite(h) && h > 0){
      box.style.height = `${Math.round(h)}px`;
    }
    debugLog('Debug: publicationStyles applied svgbox sizing fallback', { type, widthPx: w, heightPx: h });
  }


  function buildSizingRecordForPreset(type, payload, preset){
    const graphSizing = Shared.graphSizing || null;
    const chartStyle = Shared.chartStyle || {};
    const targetWidthPx = Math.max(1, Math.round(Number(preset?.targetWidthPx) || 1));
    const targetHeightPx = Math.max(1, Math.round(Number(preset?.targetHeightPx) || 1));
    const existing = (graphSizing && typeof graphSizing.getPayloadSizing === 'function'
      ? graphSizing.getPayloadSizing(payload, { context: `publication-style-${type}-existing` })
      : null)
      || (graphSizing && typeof graphSizing.captureSvgBoxForType === 'function'
        ? graphSizing.captureSvgBoxForType(type, { context: `publication-style-${type}-capture` })
        : null);
    const existingDisplay = existing?.display || {};
    const minScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
    const maxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
    const aspectRatio = targetWidthPx > 0 && targetHeightPx > 0 ? (targetWidthPx / targetHeightPx) : 1;
    const minWidthPx = Number.isFinite(existingDisplay.minWidthPx) && existingDisplay.minWidthPx > 0
      ? Math.min(existingDisplay.minWidthPx, targetWidthPx)
      : Math.max(1, Math.round(targetWidthPx * minScale));
    const minHeightPx = Number.isFinite(existingDisplay.minHeightPx) && existingDisplay.minHeightPx > 0
      ? Math.min(existingDisplay.minHeightPx, targetHeightPx)
      : Math.max(1, Math.round(targetHeightPx * minScale));
    const maxWidthPx = Number.isFinite(existingDisplay.maxWidthPx) && existingDisplay.maxWidthPx > 0
      ? Math.max(existingDisplay.maxWidthPx, targetWidthPx)
      : Math.max(targetWidthPx, Math.round(targetWidthPx * maxScale));
    const maxHeightPx = Number.isFinite(existingDisplay.maxHeightPx) && existingDisplay.maxHeightPx > 0
      ? Math.max(existingDisplay.maxHeightPx, targetHeightPx)
      : Math.max(targetHeightPx, Math.round(targetHeightPx * maxScale));
    const sizing = {
      display: {
        widthPx: targetWidthPx,
        heightPx: targetHeightPx,
        minWidthPx,
        minHeightPx,
        maxWidthPx,
        maxHeightPx,
        aspectRatio,
        aspectLocked: existingDisplay.aspectLocked === true,
        allowUnlimitedWidth: existingDisplay.allowUnlimitedWidth !== false
      },
      export: {
        widthPx: targetWidthPx,
        heightPx: targetHeightPx
      }
    };
    debugLog('Debug: publicationStyles computed sizing record', {
      type,
      widthPx: targetWidthPx,
      heightPx: targetHeightPx,
      minWidthPx,
      minHeightPx,
      maxWidthPx,
      maxHeightPx,
      allowUnlimitedWidth: sizing.display.allowUnlimitedWidth,
      aspectLocked: sizing.display.aspectLocked
    });
    return sizing;
  }

  function resolvePresetSchemeId(type, payload, preset){
    const fallback = (typeof preset?.schemeId === 'string' && preset.schemeId.trim())
      ? preset.schemeId.trim()
      : 'colorblind';
    if(type !== 'box'){
      return fallback;
    }
    const cfg = ensureObject(payload?.config);
    const tableFormat = String(cfg.tableFormat || '').trim().toLowerCase();
    // Exact NPG rule for box:
    // - grouped table format => colorblind
    // - otherwise (single) => grayscale
    return tableFormat === 'grouped' ? 'colorblind' : 'grayscale';
  }

  function patchCommonPayload(type, payload, preset){
    let next = cloneValue(payload) || { type, config: {} };
    next.type = type;
    const schemeId = resolvePresetSchemeId(type, next, preset);

    // Recolor first, using existing color scheme logic if available.
    const cs = Shared.colorSchemes;
    if(cs && typeof cs.applyToPayload === 'function'){
      next = cs.applyToPayload(type, next, schemeId);
    }else{
      next.config = ensureObject(next.config);
      next.config.colorScheme = schemeId;
    }

    // Common config knobs.
    next.config = ensureObject(next.config);
    next.config.colorScheme = schemeId;

    if('showGrid' in next.config){
      next.config.showGrid = !!preset.showGrid;
    }
    if('showFrame' in next.config){
      next.config.showFrame = !!preset.showFrame;
    }

    if('fontSize' in next.config){
      next.config.fontSize = preset.fontSizePt;
    }
    if('fontsize' in next.config){
      next.config.fontsize = preset.fontSizePt;
    }

    // Typography: only mutate existing graph-scope styles to avoid creating
    // a new graph-wide font override that can desynchronize toolbar sizing.
    const fontStyles = next.config.fontStyles;
    const graphFont = fontStyles && typeof fontStyles === 'object'
      && fontStyles.__graph__ && typeof fontStyles.__graph__ === 'object'
      ? fontStyles.__graph__
      : null;
    if(graphFont){
      graphFont.fontFamily = preset.fontFamily;
      graphFont.fill = preset.axisColor;
      const fontSizeToken = ptToPxToken(preset.fontSizePt);
      if(fontSizeToken){
        graphFont.fontSize = fontSizeToken;
      }
    }

    // Axis.
    next.config.axis = ensureObject(next.config.axis);
    next.config.axis.strokeWidth = preset.axisStrokeWidth;
    next.config.axis.color = preset.axisColor;

    return next;
  }

  function patchTypeSpecific(type, payload, preset){
    const next = payload;
    const cfg = next.config = ensureObject(next.config);

    if(type === 'box'){
      const tableFormat = String(cfg.tableFormat || '').trim().toLowerCase();
      const isGroupedReplicates = tableFormat === 'grouped';
      // Publication styles must expose the selected palette (grayscale for
      // single, colorblind for grouped), so keep box traces in per-series mode.
      cfg.colorMode = 'individual';

      // Summary overlays and points.
      cfg.summaryGlobalStyle = ensureObject(cfg.summaryGlobalStyle);
      cfg.summaryGlobalStyle.color = preset.summaryColor;

      cfg.significance = ensureObject(cfg.significance);
      cfg.significance.color = preset.significanceColor;
      if('thickness' in cfg.significance){
        cfg.significance.thickness = Math.max(1, Number(cfg.significance.thickness) || 1);
      }

      const graphType = String(cfg.graphType || '').trim().toLowerCase();
      const isIndividualValues = graphType === 'strip';
      cfg.pointGlobalStyle = ensureObject(cfg.pointGlobalStyle);
      cfg.pointGlobalStyle.borderWidth = isIndividualValues ? 0 : preset.pointBorderWidth;
      // For strip plots, keep marker size on the default/manual route so
      // swarm auto-sizing behaves exactly like a user-driven resize.
      if(!isIndividualValues){
        cfg.pointGlobalStyle.size = preset.pointSize;
      }else if(Object.prototype.hasOwnProperty.call(cfg.pointGlobalStyle, 'size')){
        delete cfg.pointGlobalStyle.size;
      }
      if(cfg.pointStyles && typeof cfg.pointStyles === 'object'){
        Object.keys(cfg.pointStyles).forEach(key => {
          const style = cfg.pointStyles[key];
          if(style && typeof style === 'object'){
            style.borderWidth = isIndividualValues ? 0 : preset.pointBorderWidth;
          }
        });
      }

      // Keep publication-style dataset spacing on the same manual-style path
      // for every publisher preset.
      const datasetSpacingX = Number.isFinite(Number(preset.boxDatasetSpacingX))
        ? Number(preset.boxDatasetSpacingX)
        : 0.6;
      cfg.axis = ensureObject(cfg.axis);
      cfg.axis.datasetSpacing = ensureObject(cfg.axis.datasetSpacing);
      cfg.axis.datasetSpacing.x = datasetSpacingX;
      cfg.axis.datasetSpacingX = datasetSpacingX;

      // Single-format Prism/GraphPad-style column plots should stay neutral:
      // one shared fill, black structural elements. Grouped formats keep the
      // selected colorblind-safe categorical palette.
      if(!isGroupedReplicates){
        const singleFill = preset.singleBoxFill || DEFAULT_SINGLE_BOX_FILL;
        const singleStroke = preset.singleBoxStroke || DEFAULT_SINGLE_BOX_STROKE;
        const inferredTraceCount = Math.max(
          Array.isArray(cfg.colors) ? cfg.colors.length : 0,
          Array.isArray(cfg.borderColors) ? cfg.borderColors.length : 0,
          (Array.isArray(next.data) && Array.isArray(next.data[0]))
            ? Math.max(0, next.data[0].length - 1)
            : 0,
          1
        );

        cfg.fill = singleFill;
        cfg.border = singleStroke;
        cfg.colors = Array.from({ length: inferredTraceCount }, () => singleFill);
        cfg.borderColors = Array.from({ length: inferredTraceCount }, () => singleStroke);

        cfg.shapeGlobalStyle = ensureObject(cfg.shapeGlobalStyle);
        cfg.shapeGlobalStyle.fill = singleFill;
        cfg.shapeGlobalStyle.color = singleFill;
        cfg.shapeGlobalStyle.stroke = singleStroke;
        cfg.shapeGlobalStyle.border = singleStroke;
        cfg.shapeGlobalStyle.borderColor = singleStroke;

        if(cfg.shapeStyles && typeof cfg.shapeStyles === 'object'){
          Object.keys(cfg.shapeStyles).forEach(key => {
            const style = cfg.shapeStyles[key];
            if(style && typeof style === 'object'){
              style.fill = singleFill;
              style.color = singleFill;
              style.stroke = singleStroke;
              style.border = singleStroke;
              style.borderColor = singleStroke;
            }
          });
        }

        cfg.pointGlobalStyle = ensureObject(cfg.pointGlobalStyle);
        cfg.pointGlobalStyle.fill = singleFill;
        cfg.pointGlobalStyle.color = singleFill;
        cfg.pointGlobalStyle.stroke = singleStroke;
        cfg.pointGlobalStyle.border = singleStroke;
        cfg.pointGlobalStyle.borderColor = singleStroke;

        if(cfg.pointStyles && typeof cfg.pointStyles === 'object'){
          Object.keys(cfg.pointStyles).forEach(key => {
            const style = cfg.pointStyles[key];
            if(style && typeof style === 'object'){
              style.fill = singleFill;
              style.color = singleFill;
              style.stroke = singleStroke;
              style.border = singleStroke;
              style.borderColor = singleStroke;
            }
          });
        }

        if(cfg.summaryStyles && typeof cfg.summaryStyles === 'object'){
          Object.keys(cfg.summaryStyles).forEach(key => {
            const style = cfg.summaryStyles[key];
            if(style && typeof style === 'object'){
              style.color = singleStroke;
            }
          });
        }
        cfg.summaryGlobalStyle.color = singleStroke;
        cfg.significance.color = singleStroke;
      }
    }

    if(type === 'venn'){
      const style = next.style = ensureObject(next.style);
      style.fontsize = preset.fontSizePt;
      style.upset = ensureObject(style.upset);
      style.upset.axisWidth = preset.axisStrokeWidth;
      style.upset.axisColor = preset.axisColor;
    }

    if(type === 'scatter' || type === 'pca' || type === 'line' || type === 'roc' || type === 'survival'){
      // Many of these graphs have marker styles under labelStyles and/or a global marker.
      // We only apply conservative defaults if the structures exist.
      if(cfg.pointGlobalStyle && typeof cfg.pointGlobalStyle === 'object'){
        cfg.pointGlobalStyle.size = preset.pointSize;
      }
      if(cfg.marker && typeof cfg.marker === 'object'){
        if('size' in cfg.marker){ cfg.marker.size = preset.pointSize; }
        if('strokeWidth' in cfg.marker){ cfg.marker.strokeWidth = preset.pointBorderWidth; }
        if('stroke' in cfg.marker){ cfg.marker.stroke = preset.axisColor; }
      }
    }

    if(type === 'pie'){
      // Ensure slice borders remain visible and neutral.
      if('borderColor' in cfg){
        cfg.borderColor = '#ffffff';
      }
    }

    return next;
  }

  function applyTextSizeLockToActiveGraph(type, locked){
    const chartStyle = Shared.chartStyle || null;
    if(!chartStyle || typeof chartStyle.setTextSizeLock !== 'function'){
      debugLog('Debug: publicationStyles text lock apply skipped', { type, reason: 'missing-chartStyle-setter' });
      return false;
    }
    const svgBox = resolvePrimarySvgBox(type, getActiveTab());
    const scopeId = `${type}GraphPanel`;
    try{
      chartStyle.setTextSizeLock(!!locked, {
        origin: `publication-style-${type}`,
        scopeId,
        svgBox: svgBox || undefined,
        force: true
      });
      debugLog('Debug: publicationStyles text lock applied', { type, scopeId, locked: !!locked, hasSvgBox: !!svgBox });
      return true;
    }catch(err){
      console.error('publicationStyles text lock apply error', { type, err });
      return false;
    }
  }

  function applyManualFontSizeToActiveControl(type, fontSizePt){
    const descriptor = FONT_CONTROL_IDS[type] || null;
    if(!descriptor) {
      debugLog('Debug: publicationStyles manual font apply skipped', { type, reason: 'no-font-control-descriptor' });
      return false;
    }
    const doc = global.document || null;
    const scopedRoot = resolveTabScopedRoot(type, getActiveTab(), { allowPageFallback: false });
    const input = (scopedRoot?.getElementById?.(descriptor.inputId))
      || (scopedRoot?.querySelector?.(`#${descriptor.inputId}`))
      || (doc ? doc.getElementById(descriptor.inputId) : null);
    if(!input){
      debugLog('Debug: publicationStyles manual font apply skipped', { type, reason: 'missing-input', inputId: descriptor.inputId });
      return false;
    }
    const min = Number(input.min);
    const max = Number(input.max);
    let target = Number(fontSizePt);
    if(!Number.isFinite(target) || target <= 0){
      debugLog('Debug: publicationStyles manual font apply skipped', { type, reason: 'invalid-size', fontSizePt });
      return false;
    }
    if(Number.isFinite(min)) target = Math.max(min, target);
    if(Number.isFinite(max)) target = Math.min(max, target);
    const targetValue = String(target);
    input.value = targetValue;
    if(input.dataset){
      input.dataset.fontBasePt = targetValue;
      input.dataset.fontDisplayPt = targetValue;
    }
    const label = descriptor.labelId
      ? ((scopedRoot?.getElementById?.(descriptor.labelId))
        || (scopedRoot?.querySelector?.(`#${descriptor.labelId}`))
        || (doc ? doc.getElementById(descriptor.labelId) : null))
      : null;
    if(label && Shared.chartStyle && typeof Shared.chartStyle.renderFontSizeLabel === 'function'){
      try{
        Shared.chartStyle.renderFontSizeLabel({
          element: label,
          pt: target,
          input,
          manual: true
        });
      }catch(err){
        console.error('publicationStyles manual font label update error', { type, err });
      }
    }
    try{
      input.dispatchEvent(new global.Event('input', { bubbles: true }));
      input.dispatchEvent(new global.Event('change', { bubbles: true }));
    }catch(err){
      console.error('publicationStyles manual font dispatch error', { type, err });
      return false;
    }
    debugLog('Debug: publicationStyles manual font route applied', {
      type,
      inputId: descriptor.inputId,
      fontSizePt: target
    });
    return true;
  }

  function applyPublicationZoomToActiveGraph(type, zoomLevel, options = {}){
    const svgBox = resolvePrimarySvgBox(type, getActiveTab());
    if(!svgBox){
      debugLog('Debug: publicationStyles zoom apply skipped', {
        type,
        reason: 'missing-svgbox',
        deferred: options.deferred === true
      });
      return false;
    }
    if(typeof Shared.applyResizableBoxZoom === 'function'){
      const result = Shared.applyResizableBoxZoom(svgBox, {
        level: zoomLevel,
        reason: options.reason || `publication-style-${type}-zoom`
      });
      if(result != null){
        debugLog('Debug: publicationStyles zoom applied', {
          type,
          zoomLevel,
          deferred: options.deferred === true
        });
        return true;
      }
    }
    debugLog('Debug: publicationStyles zoom apply skipped', {
      type,
      reason: 'missing-resizer-api',
      deferred: options.deferred === true
    });
    return false;
  }

  function suspendPublicationGraphVisibility(type){
    const svgBox = resolvePrimarySvgBox(type, getActiveTab());
    if(!svgBox || !svgBox.style){
      return () => {};
    }
    const previousVisibility = svgBox.style.visibility;
    svgBox.style.visibility = 'hidden';
    debugLog('Debug: publicationStyles graph visibility suspended', { type });
    return () => {
      svgBox.style.visibility = previousVisibility || '';
      debugLog('Debug: publicationStyles graph visibility restored', { type });
    };
  }

  function applyPresetToActiveTab(type, presetId){
    const preset = PRESETS[presetId] || null;
    if(!preset){
      debugLog('Debug: publicationStyles apply skipped', { reason: 'unknown-preset', type, presetId });
      return false;
    }

    const main = global.Main || {};
    const session = main.session;
    const domControls = main.domControls;
    const components = main.components;
    if(!session || !domControls || !components){
      debugLog('Debug: publicationStyles apply skipped', { reason: 'missing-main-modules', type });
      return false;
    }

    const tab = getActiveTab();
    if(!tab || tab.type !== type){
      debugLog('Debug: publicationStyles apply skipped', { reason: 'inactive-type-mismatch', type, activeType: tab?.type || null });
      return false;
    }

    const workspace = typeof components.get === 'function' ? components.get(type) : null;
    if(!workspace){
      debugLog('Debug: publicationStyles apply skipped', { reason: 'missing-workspace', type });
      return false;
    }

    const restoreGraphVisibility = suspendPublicationGraphVisibility(type);
    const preservedDefaults = captureDefaultState(type, session, domControls, workspace);
    const undoManager = Shared.undoManager || null;
    let beforeState = null;
    try{
      try{
        if(typeof session.persistActiveTabState === 'function'){
          session.persistActiveTabState(tab, { reason: `publication-style-pre-${type}`, origin: 'lifecycle' });
        }
      }catch(err){
        console.error('publicationStyles pre-persist error', { type, err });
      }
      if(undoManager && typeof undoManager.captureTabState === 'function'){
        beforeState = undoManager.captureTabState(tab, {
          reason: `publication-style-pre-${type}`,
          persistActive: true,
          forcePreviewCapture: true
        });
      }

      const sourcePayload = cloneValue(tab.payload)
        || (typeof workspace.getPayload === 'function' ? workspace.getPayload({
          tabId: tab.id,
          type,
          reason: `publication-style-source-${type}`,
          origin: 'publicationStyles'
        }) : null)
        || (typeof workspace.createEmptyPayload === 'function' ? workspace.createEmptyPayload() : { type, config: {} });

      let nextPayload = patchCommonPayload(type, sourcePayload, preset);
      nextPayload = patchTypeSpecific(type, nextPayload, preset);
      if(Shared.graphSizing && typeof Shared.graphSizing.setPayloadSizing === 'function'){
        nextPayload = Shared.graphSizing.setPayloadSizing(nextPayload, buildSizingRecordForPreset(type, sourcePayload, preset), {
          type,
          context: `publication-style-payload-${type}`
        });
      }

      // Persist payload and redraw.
      if(typeof session.updateTabPayload === 'function'){
        session.updateTabPayload(tab, () => cloneValue(nextPayload), {
          reason: `publication-style-${type}`,
          origin: 'user'
        });
      }else if(typeof session.assignTabPayload === 'function'){
        session.assignTabPayload(tab, cloneValue(nextPayload), { reason: `publication-style-${type}` });
      }else{
        tab.payload = cloneValue(nextPayload);
      }
      let sizingAppliedViaPayload = false;
      if(typeof domControls.applyWorkspacePayload === 'function'){
        domControls.applyWorkspacePayload(workspace, cloneValue(nextPayload), {
          reason: `publication-style-${type}`,
          payloadSizingOptions: {
            context: `publication-style-${type}`,
            updateDefaults: true,
            updateAspectRatio: true,
            preserveAspectLock: true,
            forceExact: true
          }
        });
        sizingAppliedViaPayload = true;
      }

      applyTextSizeLockToActiveGraph(type, preset.textSizeLocked === true);

      const manualFontApplied = applyManualFontSizeToActiveControl(type, preset.fontSizePt);
      debugLog('Debug: publicationStyles font application route', {
        type,
        preset: presetId,
        manualFontApplied,
        sizingAppliedViaPayload
      });

      // Fallback path when workspace payload helpers are unavailable.
      if(!sizingAppliedViaPayload){
        applySizingToActiveSvgBox(type, nextPayload, preset);
      }

      restoreDefaultState(type, session, domControls, workspace, preservedDefaults, 'publication-style-post-immediate');
      schedulePublicationTimeout(type, tab.id, 'publication-style-post-deferred', () => runForActivePublicationTab(type, tab.id, 'publication-style-post-deferred', () => {
        restoreDefaultState(type, session, domControls, workspace, preservedDefaults, 'publication-style-post-deferred');
      }), 0);
      schedulePublicationTimeout(type, tab.id, 'publication-style-post-stabilize', () => runForActivePublicationTab(type, tab.id, 'publication-style-post-stabilize', () => {
        restoreDefaultState(type, session, domControls, workspace, preservedDefaults, 'publication-style-post-stabilize');
      }), 180);

      try{
        if(typeof session.persistActiveTabState === 'function'){
          session.persistActiveTabState(tab, { reason: `publication-style-post-${type}`, forcePreviewCapture: true, origin: 'lifecycle' });
        }
      }catch(err){
        console.error('publicationStyles post-persist error', { type, err });
      }

      if(typeof session.updateTabPayload !== 'function' && typeof session.markSessionDirty === 'function'){
        session.markSessionDirty('publication-style-applied', { type, tabId: tab.id, preset: presetId, origin: 'user' });
      }

      applyPublicationZoomToActiveGraph(type, PUBLICATION_STYLE_ZOOM_LEVEL, {
        reason: `publication-style-${type}-zoom-final`
      });

      let afterState = null;
      if(undoManager && typeof undoManager.captureTabState === 'function'){
        afterState = undoManager.captureTabState(tab, {
          reason: `publication-style-post-${type}`,
          persistActive: true,
          forcePreviewCapture: true
        });
      }
      if(beforeState && afterState && typeof undoManager?.recordTabStateChange === 'function'){
        undoManager.recordTabStateChange({
          tabId: tab.id,
          label: `publication-style:${presetId}`,
          scope: type,
          from: beforeState,
          to: afterState,
          undoReason: `undo-publication-style-${type}`,
          redoReason: `redo-publication-style-${type}`
        });
      }
      schedulePublicationTimeout(type, tab.id, `publication-style-${type}-zoom-post-final`, () => {
        runForActivePublicationTab(type, tab.id, `publication-style-${type}-zoom-post-final`, () => {
          applyPublicationZoomToActiveGraph(type, PUBLICATION_STYLE_ZOOM_LEVEL, {
            reason: `publication-style-${type}-zoom-post-final`,
            deferred: true
          });
        });
        schedulePublicationFrame(type, tab.id, 'publication-style-restore-graph-visibility', () => restoreGraphVisibility()) || restoreGraphVisibility();
      }, 0);

      debugLog('Debug: publicationStyles applied to active tab', { type, tabId: tab.id, preset: presetId });
      return true;
    }catch(err){
      restoreGraphVisibility();
      throw err;
    }
  }

  function formatPresetHint(preset){
    if(!preset || typeof preset !== 'object'){
      return '';
    }
    const source = preset.source && typeof preset.source === 'object' ? preset.source : {};
    const pieces = [];
    if(preset.styleNote){
      pieces.push(preset.styleNote);
    }
    const specParts = [];
    if(source.sizing) specParts.push(source.sizing);
    if(source.typography) specParts.push(source.typography);
    if(source.stroke) specParts.push(`${source.stroke} strokes`);
    if(source.color) specParts.push(source.color);
    if(specParts.length){
      pieces.push(`Applied specs: ${specParts.join('; ')}.`);
    }
    return pieces.join(' ');
  }

  function updatePresetHint(select, hint){
    if(!select || !hint){
      return;
    }
    const preset = PRESETS[String(select.value || DEFAULT_PRESET_ID)] || PRESETS[DEFAULT_PRESET_ID];
    hint.textContent = formatPresetHint(preset);
  }

  function appendPresetOptions(select){
    if(!select){
      return;
    }
    const groups = [];
    const groupsByName = new Map();
    Object.values(PRESETS).forEach(preset => {
      const groupName = String(preset.group || preset.source?.publisher || 'Other publisher presets');
      let group = groupsByName.get(groupName);
      if(!group){
        group = { name: groupName, presets: [] };
        groupsByName.set(groupName, group);
        groups.push(group);
      }
      group.presets.push(preset);
    });
    groups.forEach(group => {
      const target = group.presets.length > 1
        ? global.document.createElement('optgroup')
        : select;
      if(target.tagName === 'OPTGROUP'){
        target.label = group.name;
      }
      group.presets.forEach(p => {
        const opt = global.document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        opt.title = formatPresetHint(p);
        target.appendChild(opt);
      });
      if(target !== select){
        select.appendChild(target);
      }
    });
  }

  function renderControlForType(type, descriptor){
    const panel = findPanelForType(type);
    if(!panel){
      debugLog('Debug: publicationStyles render skipped', { type, reason: 'missing-panel' });
      return;
    }
    if(findFieldset(panel)){
      return;
    }

    const fieldset = global.document.createElement('fieldset');
    fieldset.className = 'config-panel__fieldset';
    fieldset.dataset.publicationStyleFieldset = '1';

    const legend = global.document.createElement('legend');
    legend.textContent = 'Publication style';
    fieldset.appendChild(legend);

    const row = global.document.createElement('div');
    row.className = 'control config-panel__line';

    const label = global.document.createElement('label');
    label.className = 'config-panel__label';
    label.textContent = 'Preset';

    const select = global.document.createElement('select');
    select.dataset.publicationStyleSelect = '1';
    select.dataset.componentType = type;
    appendPresetOptions(select);

    const applyBtn = global.document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn btn-secondary';
    applyBtn.textContent = 'Apply style';
    applyBtn.dataset.publicationStyleApply = '1';
    applyBtn.dataset.componentType = type;

    label.appendChild(select);
    row.appendChild(label);
    row.appendChild(applyBtn);
    fieldset.appendChild(row);

    const hint = global.document.createElement('div');
    hint.className = 'idx-inline-048';
    hint.dataset.publicationStyleHint = '1';
    updatePresetHint(select, hint);
    select.addEventListener('change', () => updatePresetHint(select, hint));
    fieldset.appendChild(hint);

    panel.appendChild(fieldset);

    if(Shared.formControls && typeof Shared.formControls.autoSizeSelect === 'function'){
      Shared.formControls.autoSizeSelect(select);
    }

    state.controlsByType[type] = { select, applyBtn, hint };
    debugLog('Debug: publicationStyles control mounted', { type, pageId: descriptor.pageId });
  }

  function attachPublicationStyleControlListeners(){
    if(state.controlListenersBound){
      return;
    }
    const doc = global.document;
    if(!doc){
      return;
    }
    doc.addEventListener('click', evt => {
      const button = evt.target instanceof global.Element
        ? evt.target.closest('[data-publication-style-apply="1"]')
        : null;
      if(!button){
        return;
      }
      const type = String(button.dataset?.componentType || '').trim();
      if(!type){
        return;
      }
      const row = button.closest('.config-panel__line');
      const select = row?.querySelector?.('select[data-publication-style-select="1"]') || null;
      const presetId = String(select?.value || DEFAULT_PRESET_ID);
      const ok = applyPresetToActiveTab(type, presetId);
      debugLog('Debug: publicationStyles apply click', { type, presetId, ok });
    });
    state.controlListenersBound = true;
  }

  function syncActiveTabVisuals(reason){
    const tab = getActiveTab();
    if(!tab || !tab.type || tab.isWelcome) return;
    const scopedRoot = resolveTabScopedRoot(tab.type, tab, { allowPageFallback: false });
    const controls = scopedRoot && typeof scopedRoot.querySelectorAll === 'function'
      ? Array.from(scopedRoot.querySelectorAll(`select[data-publication-style-select="1"][data-component-type="${tab.type}"]`))
      : [];
    if(!controls.length){
      const fallback = state.controlsByType[tab.type]?.select || null;
      if(!fallback){
        return;
      }
      if(!fallback.value){
        fallback.value = DEFAULT_PRESET_ID;
      }
      updatePresetHint(fallback, state.controlsByType[tab.type]?.hint || null);
      debugLog('Debug: publicationStyles visuals synced', { reason, tabId: tab.id, type: tab.type });
      return;
    }
    controls.forEach(control => {
      if(!control.value){
        control.value = DEFAULT_PRESET_ID;
      }
      const hint = control.closest('[data-publication-style-fieldset="1"]')?.querySelector?.('[data-publication-style-hint="1"]') || null;
      updatePresetHint(control, hint);
    });
    debugLog('Debug: publicationStyles visuals synced', { reason, tabId: tab.id, type: tab.type });
  }

  function startActiveMonitor(){
    const scheduleActivationSync = reason => {
      const signature = getActiveSignature();
      if(signature !== state.lastActiveSignature){
        state.lastActiveSignature = signature;
      }
      if(signature){
        syncActiveTabVisuals(reason || 'tab-change');
      }
    };
    if(!state.documentStateSyncAttached && typeof global.addEventListener === 'function'){
      global.addEventListener('graphitix:document-state-change', () => {
        scheduleActivationSync('document-state-change');
      });
      state.documentStateSyncAttached = true;
    }
    if(!state.lifecycleSyncAttached){
      const shouldSyncAction = action => {
        const normalized = String(action || '').trim().toLowerCase();
        return normalized === 'runtime-render-cache-restored'
          || normalized === 'saved-render-cache-restored'
          || normalized === 'draw-executed';
      };
      const handleLifecycleEvent = evt => {
        const detail = evt?.detail || evt || null;
        if(!detail || !shouldSyncAction(detail.action)){
          return;
        }
        const active = getActiveTab();
        if(!active || !active.type || active.isWelcome){
          return;
        }
        if(detail.tabId && String(detail.tabId) !== String(active.id)){
          return;
        }
        if(detail.componentKey && String(detail.componentKey) !== String(active.type)){
          return;
        }
        const expectedTabId = String(active.id);
        const expectedType = String(active.type);
        const runSync = phase => {
          const current = getActiveTab();
          if(!current || current.isWelcome){
            return;
          }
          if(String(current.id) !== expectedTabId || String(current.type || '') !== expectedType){
            return;
          }
          syncActiveTabVisuals(`lifecycle-${detail.action}-${phase}`);
        };
        schedulePublicationFrame(expectedType, expectedTabId, 'publication-style-lifecycle-sync-raf', () => runSync('raf'));
        schedulePublicationTimeout(expectedType, expectedTabId, 'publication-style-lifecycle-sync-delay-90', () => runSync('delay-90'), 90);
      };
      if(Shared.componentLifecycle && typeof Shared.componentLifecycle.onLifecycleEvent === 'function'){
        Shared.componentLifecycle.onLifecycleEvent(handleLifecycleEvent);
      }else if(typeof global.addEventListener === 'function'){
        global.addEventListener('graphitix:lifecycle-event', handleLifecycleEvent);
      }
      state.lifecycleSyncAttached = true;
    }
    if(state.monitorTimer) return;
    state.monitorTimer = global.setInterval(() => {
      const signature = getActiveSignature();
      if(signature !== state.lastActiveSignature){
        state.lastActiveSignature = signature;
        if(signature){
          syncActiveTabVisuals('tab-change');
        }
      }
    }, 1200);
  }

  namespace.init = function init(){
    if(state.initialized){
      debugLog('Debug: publicationStyles.init skipped - already initialized');
      return namespace;
    }
    Object.keys(TYPE_TO_PAGE).forEach(type => {
      renderControlForType(type, TYPE_TO_PAGE[type]);
    });
    attachPublicationStyleControlListeners();
    startActiveMonitor();
    syncActiveTabVisuals('init');
    state.initialized = true;
    debugLog('Debug: publicationStyles.init complete', { types: Object.keys(TYPE_TO_PAGE) });
    return namespace;
  };
})(window);
