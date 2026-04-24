// Shared resizer utility for .svgbox containers
// Usage: Shared.attachResizableBox(container)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  let resizerScopeCounter = 0;

  function clampDimension(value, min, max){
    if(!Number.isFinite(value)) return NaN;
    let result = Math.round(value);
    if(Number.isFinite(min)){
      result = Math.max(min, result);
    }
    if(Number.isFinite(max)){
      result = Math.min(max, result);
    }
    return result;
  }

  function parsePositive(value){
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : NaN;
  }

  const undoManager = Shared.undoManager;
  const resizerNamespace = Shared.resizer = Shared.resizer || {};

  resizerNamespace.attachPanelDragResizer = function attachPanelDragResizer(opts = {}){
    const {
      panelResizer,
      tablePanel,
      graphPanel,
      configPanel,
      debugLabel,
      syncPanels,
      computeMinSvgWidth,
      onMinSvgWidth,
      minTableWidth = 0,
      diagramSelector = '.diagram-area'
    } = opts || {};
    const label = debugLabel || panelResizer?.id || tablePanel?.id || 'panel';
    if(!panelResizer || !tablePanel || !graphPanel){
      console.debug('Debug: Shared.resizer.attachPanelDragResizer skipped', {
        label,
        hasPanelResizer: !!panelResizer,
        hasTable: !!tablePanel,
        hasGraph: !!graphPanel
      }); // Debug: guard invalid wiring inputs
      return { detach(){ /* no-op */ } };
    }
    const doc = global.document;
    if(!doc){
      console.debug('Debug: Shared.resizer.attachPanelDragResizer skipped (no document)', { label });
      return { detach(){ /* no-op */ } };
    }
    const handlePointerDown = (event) => {
      try{
        if(event?.preventDefault){ event.preventDefault(); }
      }catch(err){
        console.error('Shared.resizer.attachPanelDragResizer preventDefault error', err);
      }
      const rectTable = tablePanel.getBoundingClientRect?.();
      const rectGraph = graphPanel.getBoundingClientRect?.();
      const startTable = rectTable?.width;
      const startGraph = rectGraph?.width;
      if(!Number.isFinite(startTable) || !Number.isFinite(startGraph)){
        console.debug('Debug: Shared.resizer.attachPanelDragResizer invalid start sizes', {
          label,
          startTable,
          startGraph
        }); // Debug: abort when DOM widths are missing
        return;
      }
      const startX = Number(event?.clientX) || 0;
      const activeTabId = undoManager?.getActiveTabId?.() || null;
      const beforeTabState = (undoManager && typeof undoManager.captureTabState === 'function' && activeTabId)
        ? undoManager.captureTabState(activeTabId, {
            reason: `${label}-panel-drag-pre`,
            persistActive: true,
            forcePreviewCapture: true
          })
        : null;
      let gap = 0;
      if(diagramSelector){
        const diagramArea = graphPanel.querySelector?.(diagramSelector);
        if(diagramArea && global.getComputedStyle){
          try{
            const style = global.getComputedStyle(diagramArea);
            gap = Number.parseFloat(style?.gap || 0) || 0;
          }catch(err){
            console.error('Shared.resizer.attachPanelDragResizer gap error', err);
          }
        }
      }
      let minSvgWidth = 0;
      if(typeof computeMinSvgWidth === 'function'){
        try{
          const computed = computeMinSvgWidth({ tablePanel, graphPanel, configPanel, debugLabel: label });
          if(Number.isFinite(computed) && computed > 0){
            minSvgWidth = computed;
          }
        }catch(err){
          console.error('Shared.resizer.attachPanelDragResizer computeMinSvgWidth error', err);
        }
      }
      if(typeof onMinSvgWidth === 'function'){
        try{
          onMinSvgWidth(minSvgWidth);
        }catch(err){
          console.error('Shared.resizer.attachPanelDragResizer onMinSvgWidth error', err);
        }
      }
      const total = startTable + startGraph;
      const tableDataset = tablePanel.dataset || {};
      const baseMinTable = Number.isFinite(minTableWidth) && minTableWidth >= 0 ? Math.round(minTableWidth) : 0;
      if(!Number.isFinite(Number.parseFloat(tableDataset.panelDefaultWidth)) || Number.parseFloat(tableDataset.panelDefaultWidth) <= 0){
        tableDataset.panelDefaultWidth = String(Math.round(startTable));
        console.debug('Debug: Shared.resizer.attachPanelDragResizer stored default', { label, defaultTableWidth: tableDataset.panelDefaultWidth }); // Debug: capture default width
      }
      const minTable = baseMinTable;
      tableDataset.panelMinWidth = String(minTable);
      if(tablePanel?.style){
        const existingMin = Number.parseFloat(tablePanel.style.minWidth) || 0;
        const enforcedMin = Math.max(existingMin, minTable);
        if(Number.isFinite(enforcedMin) && enforcedMin > 0 && enforcedMin !== existingMin){
          tablePanel.style.minWidth = `${Math.round(enforcedMin)}px`;
          console.debug('Debug: Shared.resizer.attachPanelDragResizer enforced table min', { label, enforcedMin, existingMin }); // Debug: align style minimum
        }
      }
      console.debug('Debug: Shared.resizer.attachPanelDragResizer drag start', {
        label,
        startTable,
        startGraph,
        gap,
        minSvgWidth,
        total
      });
      const onMove = (ev) => {
        const clientX = Number(ev?.clientX) || 0;
        const dx = clientX - startX;
        const growRight = dx >= 0;
        const proposedTable = startTable + dx;
        const clampedBase = Number.isFinite(total) ? Math.min(total, proposedTable) : proposedTable;
        const newTable = Math.max(minTable, clampedBase);
        const newGraph = Number.isFinite(total)
          ? Math.max(0, total - newTable)
          : Math.max(0, startGraph - dx);
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled() && Number.isFinite(total) && clampedBase !== proposedTable){
          console.debug('Debug: Shared.resizer.attachPanelDragResizer table clamp', {
            label,
            proposedTable,
            clampedTable: clampedBase,
            total,
            newTable,
            newGraph
          });
        }
        if(tablePanel?.style){
          const tablePx = `${Math.round(newTable)}px`;
          tablePanel.style.flex = `0 0 ${tablePx}`;
          tablePanel.style.flexBasis = tablePx;
          tablePanel.style.width = tablePx;
          tablePanel.style.minWidth = `${Math.round(minTable)}px`;
          tablePanel.style.maxWidth = 'none';
        }
        if(graphPanel?.style){
          const graphPx = `${Math.max(0, Math.round(newGraph))}px`;
          graphPanel.style.flex = `0 0 ${graphPx}`;
          graphPanel.style.flexBasis = graphPx;
          graphPanel.style.width = graphPx;
          graphPanel.style.minWidth = graphPx;
          graphPanel.style.maxWidth = 'none';
        }
        if(tablePanel?.dataset){
          tablePanel.dataset.panelManualWidth = 'true';
        }
        if(graphPanel?.dataset){
          graphPanel.dataset.panelManualWidth = 'true';
        }
        if(typeof syncPanels === 'function'){
          try{
            syncPanels({ phase: 'drag', minSvgWidth, newTable, newGraph, minTable });
          }catch(err){
            console.error('Shared.resizer.attachPanelDragResizer syncPanels error', err);
          }
        }
        console.debug('Debug: Shared.resizer.attachPanelDragResizer drag move', {
          label,
          dx,
          proposedTable,
          newTable,
          newGraph,
          growRight,
          minTable,
          minSvgWidth
        });
      };
      const onUp = () => {
        doc.removeEventListener('pointermove', onMove);
        doc.removeEventListener('pointerup', onUp);
        if(typeof syncPanels === 'function'){
          try{
            syncPanels({ phase: 'end', minSvgWidth });
          }catch(err){
            console.error('Shared.resizer.attachPanelDragResizer syncPanels end error', err);
          }
        }
        if(undoManager && typeof undoManager.captureTabState === 'function' && typeof undoManager.recordTabStateChange === 'function' && activeTabId && beforeTabState){
          const afterTabState = undoManager.captureTabState(activeTabId, {
            reason: `${label}-panel-drag-post`,
            persistActive: true,
            forcePreviewCapture: true
          });
          if(afterTabState){
            undoManager.recordTabStateChange({
              tabId: activeTabId,
              label: `panel-layout:${label}`,
              scope: label,
              from: beforeTabState,
              to: afterTabState,
              undoReason: `${label}-panel-drag-undo`,
              redoReason: `${label}-panel-drag-redo`
            });
          }
        }
        console.debug('Debug: Shared.resizer.attachPanelDragResizer drag end', { label, tabId: activeTabId || null });
      };
      doc.addEventListener('pointermove', onMove);
      doc.addEventListener('pointerup', onUp);
    };
    panelResizer.addEventListener('pointerdown', handlePointerDown);
    console.debug('Debug: Shared.resizer.attachPanelDragResizer attached', {
      label,
      hasSync: typeof syncPanels === 'function'
    }); // Debug: confirm helper wiring
    return {
      detach(){
        panelResizer.removeEventListener('pointerdown', handlePointerDown);
        console.debug('Debug: Shared.resizer.attachPanelDragResizer detached', { label }); // Debug: helper detach
      }
    };
  };

  function closeSiblingOptionsMenus(control){
    const tray = control?.parentElement;
    if(!tray){
      return;
    }
    Array.from(tray.querySelectorAll('.resizer-options-control[open]')).forEach(openControl => {
      if(openControl !== control){
        openControl.removeAttribute('open');
      }
    });
  }

  function createGraphOptionsIcon(doc){
    if(!doc){
      return null;
    }
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'resizer-options-icon');
    svg.setAttribute('viewBox', '0 0 1280 1280');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const group = doc.createElementNS(svgNs, 'g');
    group.setAttribute('transform', 'translate(0,1280) scale(0.1,-0.1)');
    group.setAttribute('fill', 'currentColor');
    group.setAttribute('stroke', 'none');
    const path = doc.createElementNS(svgNs, 'path');
    path.setAttribute('d', 'M5860 12792 c0 -4 -29 -174 -65 -377 -36 -204 -95 -541 -131 -750 -37 -209 -68 -381 -69 -383 -1 -1 -61 -14 -133 -27 -233 -45 -467 -108 -691 -187 -110 -38 -114 -39 -131 -21 -9 10 -225 268 -480 573 -255 305 -470 563 -480 573 -16 17 -38 5 -476 -248 -252 -146 -460 -269 -462 -274 -2 -5 115 -332 259 -727 l262 -717 -40 -36 c-289 -261 -333 -304 -614 -615 l-36 -39 -704 257 c-387 142 -714 258 -726 259 -19 2 -58 -61 -288 -457 -253 -438 -265 -460 -248 -476 10 -10 270 -228 578 -485 308 -257 566 -473 573 -479 10 -10 5 -35 -27 -127 -85 -249 -141 -456 -185 -688 -14 -74 -27 -135 -28 -136 -2 -1 -174 -32 -383 -69 -209 -36 -546 -95 -750 -131 -203 -36 -373 -65 -377 -65 -4 0 -8 -243 -8 -540 0 -297 4 -540 8 -540 4 0 174 -29 377 -65 204 -36 541 -95 750 -131 209 -37 381 -68 383 -69 1 -1 14 -62 28 -136 44 -232 100 -439 185 -688 32 -92 37 -117 27 -127 -7 -6 -265 -222 -573 -479 -308 -257 -568 -475 -578 -485 -17 -16 -5 -38 248 -476 230 -396 269 -459 288 -457 12 1 339 117 726 259 l704 257 36 -39 c281 -311 325 -354 614 -615 l40 -36 -262 -717 c-144 -395 -261 -722 -259 -727 2 -5 210 -128 462 -274 438 -253 460 -265 476 -248 10 10 225 268 480 573 255 305 471 563 480 573 17 18 21 17 131 -21 224 -79 458 -142 691 -187 72 -13 132 -26 133 -27 1 -2 32 -174 69 -383 36 -209 95 -546 131 -750 36 -203 65 -373 65 -377 0 -4 242 -8 538 -8 l538 0 52 292 c28 161 88 502 133 758 44 256 82 466 84 468 1 1 69 16 151 32 254 50 420 94 673 181 92 32 117 37 127 27 6 -7 222 -265 479 -573 257 -308 475 -568 485 -578 16 -17 38 -5 476 248 252 146 460 269 462 274 2 7 -163 465 -465 1290 l-57 154 65 56 c217 190 384 356 570 570 l55 64 185 -67 c708 -260 1250 -456 1257 -456 5 0 94 147 198 327 103 181 223 388 266 462 63 108 76 137 66 146 -7 7 -267 225 -578 485 -311 260 -571 478 -578 484 -10 10 -5 35 27 127 84 246 150 491 191 712 12 64 26 117 30 117 4 0 227 38 496 85 269 47 604 106 744 130 140 25 258 45 262 45 5 0 8 243 8 540 0 297 -4 540 -8 540 -4 0 -172 29 -372 64 -201 35 -539 95 -752 132 l-387 68 -21 115 c-41 219 -107 465 -191 710 -32 92 -37 117 -27 127 7 6 267 224 578 484 311 260 571 478 578 485 10 9 -3 38 -66 146 -43 74 -163 281 -266 462 -104 180 -193 327 -198 327 -7 0 -549 -196 -1257 -456 l-185 -67 -55 64 c-186 214 -353 380 -570 570 l-65 56 57 154 c302 825 467 1283 465 1290 -2 5 -210 128 -462 274 -438 253 -460 265 -476 248 -10 -10 -228 -270 -485 -578 -257 -308 -473 -566 -479 -573 -10 -10 -35 -5 -127 27 -253 87 -419 131 -673 181 -82 16 -150 31 -151 32 -2 2 -40 212 -84 468 -45 256 -105 597 -133 758 l-52 292 -538 0 c-296 0 -538 -4 -538 -8z m745 -2616 c678 -24 1405 -277 1985 -690 358 -254 675 -576 924 -936 373 -538 598 -1161 657 -1820 14 -161 14 -499 0 -660 -94 -1039 -601 -1983 -1416 -2632 -493 -393 -1095 -662 -1715 -767 -246 -42 -300 -46 -640 -46 -340 0 -394 4 -640 46 -1177 199 -2203 959 -2740 2030 -295 587 -425 1198 -398 1870 48 1199 680 2316 1688 2983 502 332 1046 531 1658 606 96 12 405 28 457 23 17 -1 98 -5 180 -7z');
    group.appendChild(path);
    svg.appendChild(group);
    return svg;
  }

  function openAxesLengthOptionsInMenu(menu){
    if(!menu){
      return;
    }
    Array.from(menu.querySelectorAll('.resizer-axeslength-control')).forEach(control => {
      control.setAttribute('open', '');
    });
  }

  function ensureGraphOptionsMenu(svgBox, doc, opts = {}){
    if(!svgBox || !doc){
      return null;
    }
    let tray = svgBox.querySelector('.resizer-control-tray');
    if(!tray){
      tray = doc.createElement('div');
      tray.className = 'resizer-control-tray';
      svgBox.appendChild(tray);
      console.debug('Debug: resizer options tray created', {
        label: opts.debugLabel || null,
        trayChildren: tray.childElementCount
      });
    }
    let control = tray.querySelector(':scope > .resizer-options-control');
    if(!control){
      control = doc.createElement('details');
      control.className = 'resizer-options-control';
      const summary = doc.createElement('summary');
      summary.className = 'resizer-options-summary';
      summary.title = opts.title || 'Graph options';
      summary.setAttribute('aria-label', opts.title || 'Graph options');
      const icon = createGraphOptionsIcon(doc);
      if(icon){
        summary.appendChild(icon);
      }
      const menu = doc.createElement('div');
      menu.className = 'resizer-options-menu';
      control.appendChild(summary);
      control.appendChild(menu);
      tray.insertBefore(control, tray.firstChild || null);
      console.debug('Debug: resizer options menu created', {
        label: opts.debugLabel || null,
        trayChildren: tray.childElementCount
      });
    }else if(control.parentNode !== tray){
      tray.insertBefore(control, tray.firstChild || null);
    }else if(tray.firstChild !== control){
      tray.insertBefore(control, tray.firstChild || null);
    }
    const menu = control.querySelector('.resizer-options-menu');
    if(!menu){
      const newMenu = doc.createElement('div');
      newMenu.className = 'resizer-options-menu';
      control.appendChild(newMenu);
    }
    if(!control.__resizerOptionsToggleHandler){
      const onToggle = () => {
        if(control.hasAttribute('open')){
          closeSiblingOptionsMenus(control);
          openAxesLengthOptionsInMenu(control.querySelector('.resizer-options-menu'));
        }
      };
      control.addEventListener('toggle', onToggle);
      control.__resizerOptionsToggleHandler = onToggle;
    }
    if(!control.__resizerOptionsKeyHandler){
      const onKeyDown = (event) => {
        if(event?.key === 'Escape' && control.hasAttribute('open')){
          control.removeAttribute('open');
          const summary = control.querySelector('.resizer-options-summary');
          if(summary && typeof summary.focus === 'function'){
            summary.focus();
          }
        }
      };
      control.addEventListener('keydown', onKeyDown);
      control.__resizerOptionsKeyHandler = onKeyDown;
    }
    if(!control.__resizerOptionsOutsideHandler){
      const onOutsidePointerDown = (event) => {
        if(!control.hasAttribute('open')){
          return;
        }
        const target = event?.target || null;
        if(target && control.contains(target)){
          return;
        }
        control.removeAttribute('open');
      };
      doc.addEventListener('pointerdown', onOutsidePointerDown, true);
      control.__resizerOptionsOutsideHandler = onOutsidePointerDown;
    }
    const setup = {
      tray,
      control,
      summary: control.querySelector('.resizer-options-summary'),
      menu: control.querySelector('.resizer-options-menu')
    };
    moveKnownGraphOptionsIntoMenu(svgBox, setup, opts);
    if(!tray.__resizerOptionsObserver && global.MutationObserver){
      const observer = new global.MutationObserver(() => {
        moveKnownGraphOptionsIntoMenu(svgBox, setup, opts);
      });
      observer.observe(tray, { childList: true });
      tray.__resizerOptionsObserver = observer;
    }
    return setup;
  }

  function moveGraphOptionIntoMenu(svgBox, optionControl, opts = {}){
    if(!svgBox || !optionControl){
      return null;
    }
    const doc = svgBox.ownerDocument || global.document;
    const setup = ensureGraphOptionsMenu(svgBox, doc, opts);
    if(!setup?.menu){
      return null;
    }
    if(optionControl.parentNode !== setup.menu){
      setup.menu.appendChild(optionControl);
      if(optionControl.classList?.contains('resizer-axeslength-control')){
        optionControl.setAttribute('open', '');
      }
      console.debug('Debug: resizer option moved into menu', {
        label: opts.debugLabel || null,
        className: optionControl.className || null,
        menuChildren: setup.menu.childElementCount
      });
    }
    return setup;
  }

  function moveKnownGraphOptionsIntoMenu(svgBox, setup, opts = {}){
    const menu = setup?.menu;
    if(!svgBox || !menu){
      return;
    }
    const tray = setup.tray || svgBox.querySelector('.resizer-control-tray');
    if(!tray){
      return;
    }
    [
      '.resizer-aspect-control',
      '.resizer-textlock-control',
      '.resizer-axeslength-control',
      '.resizer-legend-control'
    ].forEach(selector => {
      Array.from(tray.querySelectorAll(selector)).forEach(control => {
        if(control.closest('.resizer-options-control') === setup.control){
          return;
        }
        menu.appendChild(control);
        if(control.classList?.contains('resizer-axeslength-control')){
          openAxesLengthOptionsInMenu(menu);
        }
        console.debug('Debug: resizer known option moved into menu', {
          label: opts.debugLabel || null,
          selector,
          menuChildren: menu.childElementCount
        });
      });
    });
  }

  resizerNamespace.ensureGraphOptionsMenu = function ensureGraphOptionsMenuPublic(options){
    const opts = options || {};
    const svgBox = opts.svgBox;
    const doc = svgBox?.ownerDocument || global.document;
    const setup = ensureGraphOptionsMenu(svgBox, doc, opts);
    const controls = Array.isArray(opts.controls) ? opts.controls : [];
    controls.forEach(control => {
      moveGraphOptionIntoMenu(svgBox, control, opts);
    });
    return setup;
  };

  resizerNamespace.ensureLegendControlPlacement = function ensureLegendControlPlacement(options){
    const opts = options || {};
    const svgBox = opts.svgBox;
    const control = opts.control;
    if(!svgBox || !control){
      return null;
    }
    const setup = moveGraphOptionIntoMenu(svgBox, control, {
      debugLabel: opts.debugLabel || 'legend-option',
      title: 'Graph options'
    });
    if(!setup){
      return null;
    }
    control.classList.remove('config-panel__checkbox', 'config-panel__checkbox--inline');
    control.classList.add('resizer-legend-control');
    if(!control.title){
      control.title = opts.title || 'Toggle legend visibility';
    }
    const legacyTray = svgBox.querySelector('.resizer-bottom-tray');
    if(legacyTray && legacyTray.childElementCount === 0){
      legacyTray.remove();
    }
    return setup.menu;
  };

  function resolveSquareSize(label){
    const style = Shared.chartStyle || {};
    const widthCandidate = Number(style.DEFAULT_WIDTH);
    if(Number.isFinite(widthCandidate) && widthCandidate > 0){
      console.debug('Debug: resizer resolveSquareSize using chartStyle', { label, widthCandidate }); // Debug: use chartStyle width
      return widthCandidate;
    }
    const doc = global.document || null;
    const winWidth = Number(global.innerWidth) || 0;
    const docWidth = doc?.documentElement?.clientWidth || 0;
    const bodyWidth = doc?.body?.clientWidth || 0;
    let reference = Math.max(winWidth, docWidth, bodyWidth);
    if(!Number.isFinite(reference) || reference <= 0){
      reference = 960;
    }
    const normalized = Math.max(320, Math.round(reference / 3));
    console.debug('Debug: resizer resolveSquareSize fallback', { label, reference, normalized }); // Debug: fallback width calc
    return normalized;
  }

  function enforceAspectRatio(opts){
    const {
      width,
      height,
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      ratio,
      axis,
      fallbackWidth,
      fallbackHeight,
      label
    } = opts || {};
    const debugLabel = label || 'resizer';
    if(!Number.isFinite(ratio) || ratio <= 0){
      console.debug('Debug: enforceAspectRatio skipped', { debugLabel, ratio }); // Debug: invalid ratio guard
      return {
        width: clampDimension(width, minWidth, maxWidth),
        height: clampDimension(height, minHeight, maxHeight)
      };
    }
    const clampWidth = (val) => clampDimension(val, minWidth, maxWidth);
    const clampHeight = (val) => clampDimension(val, minHeight, maxHeight);
    let widthCandidate = Number.isFinite(width) ? clampWidth(width) : NaN;
    let heightCandidate = Number.isFinite(height) ? clampHeight(height) : NaN;

    if(axis === 'y' && Number.isFinite(heightCandidate)){
      widthCandidate = clampWidth(heightCandidate * ratio);
    }else if(axis === 'x' && Number.isFinite(widthCandidate)){
      heightCandidate = clampHeight(widthCandidate / ratio);
    }else{
      if(!Number.isFinite(widthCandidate) && Number.isFinite(heightCandidate)){
        widthCandidate = clampWidth(heightCandidate * ratio);
      }
      if(!Number.isFinite(heightCandidate) && Number.isFinite(widthCandidate)){
        heightCandidate = clampHeight(widthCandidate / ratio);
      }
      if(Number.isFinite(widthCandidate) && Number.isFinite(heightCandidate)){
        const widthDrivenHeight = clampHeight(widthCandidate / ratio);
        const heightDrivenWidth = clampWidth(heightCandidate * ratio);
        const widthError = Math.abs(widthDrivenHeight - heightCandidate);
        const heightError = Math.abs(heightDrivenWidth - widthCandidate);
        if(heightError < widthError){
          widthCandidate = heightDrivenWidth;
          heightCandidate = clampHeight(widthCandidate / ratio);
        }else{
          heightCandidate = widthDrivenHeight;
          widthCandidate = clampWidth(heightCandidate * ratio);
        }
      }
    }

    if(!Number.isFinite(widthCandidate) && Number.isFinite(heightCandidate)){
      widthCandidate = clampWidth(heightCandidate * ratio);
    }
    if(!Number.isFinite(heightCandidate) && Number.isFinite(widthCandidate)){
      heightCandidate = clampHeight(widthCandidate / ratio);
    }
    if(!Number.isFinite(widthCandidate) && !Number.isFinite(heightCandidate)){
      if(Number.isFinite(fallbackWidth)){
        widthCandidate = clampWidth(fallbackWidth);
        heightCandidate = clampHeight(widthCandidate / ratio);
      }else if(Number.isFinite(fallbackHeight)){
        heightCandidate = clampHeight(fallbackHeight);
        widthCandidate = clampWidth(heightCandidate * ratio);
      }
    }
    if(!Number.isFinite(widthCandidate) || !Number.isFinite(heightCandidate)){
      console.debug('Debug: enforceAspectRatio fallback insufficient', {
        debugLabel,
        width,
        height,
        fallbackWidth,
        fallbackHeight,
        ratio
      }); // Debug: insufficient data to enforce
      return { width: widthCandidate, height: heightCandidate };
    }

    for(let i = 0; i < 3; i += 1){
      const idealHeight = clampHeight(widthCandidate / ratio);
      const idealWidth = clampWidth(idealHeight * ratio);
      const adjustedHeight = clampHeight(idealWidth / ratio);
      if(Math.abs(idealWidth - widthCandidate) <= 1 && Math.abs(adjustedHeight - idealHeight) <= 1){
        widthCandidate = idealWidth;
        heightCandidate = adjustedHeight;
        break;
      }
      widthCandidate = idealWidth;
      heightCandidate = adjustedHeight;
    }

    console.debug('Debug: enforceAspectRatio result', {
      debugLabel,
      axis,
      output: { width: widthCandidate, height: heightCandidate },
      ratio,
      bounds: { minWidth, maxWidth, minHeight, maxHeight }
    }); // Debug: aspect ratio enforcement result

    return { width: widthCandidate, height: heightCandidate };
  }

  function px(n){ return Math.round(n) + 'px'; }

  // Zoom is intentionally "display-only": it scales the svgbox footprint on screen
  // without entering the manual geometry redraw path. Manual drag handles remain the
  // only mechanism that changes chart geometry.
  const RESIZER_ZOOM_MIN = 0.5;
  const RESIZER_ZOOM_MAX = 3;
  const RESIZER_ZOOM_STEP = 0.1;
  const RESIZER_ZOOM_EPSILON = 0.0001;

  function normalizeZoomLevel(value, bounds = {}){
    const min = Number.isFinite(bounds.min) && bounds.min > 0 ? bounds.min : RESIZER_ZOOM_MIN;
    const maxCandidate = Number.isFinite(bounds.max) && bounds.max > 0 ? bounds.max : RESIZER_ZOOM_MAX;
    const max = Math.max(min, maxCandidate);
    const fallbackCandidate = Number.isFinite(bounds.fallback) && bounds.fallback > 0 ? bounds.fallback : 1;
    const fallback = Math.min(max, Math.max(min, fallbackCandidate));
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
    const clamped = Math.min(max, Math.max(min, resolved));
    return Math.round(clamped * 100) / 100;
  }

  function formatZoomLevel(level){
    const percent = Math.round((Number(level) || 1) * 100);
    return `${percent}%`;
  }

  function shouldSkipZoomTargetElement(element){
    if(!element || element.nodeType !== 1){
      return true;
    }
    const classList = element.classList;
    if(classList && (
      classList.contains('resizer')
      || classList.contains('resizer-control-tray')
      || classList.contains('resizer-bottom-tray')
      || classList.contains('resizer-options-control')
      || classList.contains('resizer-zoom-control')
      || classList.contains('resizer-zoom-viewport')
    )){
      return true;
    }
    const id = typeof element.id === 'string' ? element.id : '';
    if(id && /ExportControls$/i.test(id)){
      return true;
    }
    return false;
  }

  function resolveZoomTargetElement(container){
    if(!container || !container.children){
      return null;
    }
    const children = Array.from(container.children);
    const existingViewport = children.find(child => child.classList && child.classList.contains('resizer-zoom-viewport')) || null;
    if(existingViewport){
      const existingContent = Array.from(existingViewport.children).find(child => child.classList && child.classList.contains('resizer-zoom-content')) || null;
      const existingTarget = existingContent
        ? (Array.from(existingContent.children).find(child => child?.dataset?.resizerZoomTarget === 'true')
          || Array.from(existingContent.children).find(child => child.nodeType === 1)
          || null)
        : null;
      if(existingContent && existingTarget){
        return {
          viewport: existingViewport,
          content: existingContent,
          target: existingTarget,
          wrapped: true,
          created: false
        };
      }
    }
    const target = children.find(child => !shouldSkipZoomTargetElement(child)) || null;
    if(!target){
      return null;
    }
    return {
      viewport: null,
      content: null,
      target,
      wrapped: false,
      created: false
    };
  }

  function ensureZoomViewport(container, doc){
    if(!container || !doc){
      return null;
    }
    const resolved = resolveZoomTargetElement(container);
    if(!resolved || !resolved.target){
      return null;
    }
    if(resolved.viewport && resolved.content){
      return resolved;
    }
    const viewport = doc.createElement('div');
    viewport.className = 'resizer-zoom-viewport';
    const content = doc.createElement('div');
    content.className = 'resizer-zoom-content';
    if(resolved.target.dataset){
      resolved.target.dataset.resizerZoomTarget = 'true';
    }
    const parent = resolved.target.parentNode;
    if(!parent){
      return null;
    }
    parent.insertBefore(viewport, resolved.target);
    content.appendChild(resolved.target);
    viewport.appendChild(content);
    return {
      viewport,
      content,
      target: resolved.target,
      wrapped: true,
      created: true
    };
  }

  Shared.attachResizableBox = function attachResizableBox(container, opts={}){
    if(!container) return;
    const rect = container.getBoundingClientRect();
    const data = container.dataset || {};
    const chartStyle = Shared.chartStyle || {};
    const graphSizing = Shared.graphSizing || null;
    const resizeMinScale = Number(chartStyle.RESIZE_MIN_SCALE) || 0.3;
    const resizeMaxScale = Number(chartStyle.RESIZE_MAX_SCALE) || 3;
    const helperContext = opts.debugLabel || container?.id || container?.className || 'resizer';
    if(graphSizing && typeof graphSizing.ensureCssVariables === 'function'){
      graphSizing.ensureCssVariables({ context: helperContext });
    }
    let helperSizing = null;
    if(graphSizing && typeof graphSizing.getSizing === 'function'){
      try{
        helperSizing = graphSizing.getSizing({ context: helperContext });
      }catch(err){
        console.error('Shared.attachResizableBox graphSizing error', err);
      }
    }
    if(helperSizing){
      console.debug('Debug: attachResizableBox helper sizing applied', { context: helperContext, helperSizing });
    }
    const fallbackLabel = helperContext;
    const squareFallback = Number.isFinite(helperSizing?.width) && helperSizing.width > 0
      ? helperSizing.width
      : resolveSquareSize(fallbackLabel);
    const defaultWidthRaw = Number(chartStyle.DEFAULT_WIDTH);
    const defaultHeightRaw = Number(chartStyle.DEFAULT_HEIGHT);
    const defaultWidthFallback = Number.isFinite(defaultWidthRaw) && defaultWidthRaw > 0
      ? defaultWidthRaw
      : (Number.isFinite(helperSizing?.width) && helperSizing.width > 0 ? helperSizing.width : squareFallback);
    const defaultHeightFallback = Number.isFinite(defaultHeightRaw) && defaultHeightRaw > 0
      ? defaultHeightRaw
      : (Number.isFinite(helperSizing?.height) && helperSizing.height > 0 ? helperSizing.height : defaultWidthFallback);
    const parsedDefaultWidth = Number(opts.defaultWidth);
    const parsedDefaultHeight = Number(opts.defaultHeight);
    let defaultWidth = Number.isFinite(parsedDefaultWidth) && parsedDefaultWidth > 0
      ? parsedDefaultWidth
      : Number(data.resizerDefaultWidth);
    if(!Number.isFinite(defaultWidth) || defaultWidth <= 0){
      const rectWidth = Math.round(rect.width);
      defaultWidth = rectWidth > 0 ? rectWidth : defaultWidthFallback;
    }
    let defaultHeight = Number.isFinite(parsedDefaultHeight) && parsedDefaultHeight > 0
      ? parsedDefaultHeight
      : Number(data.resizerDefaultHeight);
    if(!Number.isFinite(defaultHeight) || defaultHeight <= 0){
      const rectHeight = Math.round(rect.height);
      defaultHeight = rectHeight > 0 ? rectHeight : defaultHeightFallback;
    }
    const minFromDefaultWidth = Number.isFinite(helperSizing?.minWidth) && helperSizing.minWidth > 0
      ? Math.round(helperSizing.minWidth)
      : Math.max(1, Math.round(defaultWidth * resizeMinScale));
    const minFromDefaultHeight = Number.isFinite(helperSizing?.minHeight) && helperSizing.minHeight > 0
      ? Math.round(helperSizing.minHeight)
      : Math.max(1, Math.round(defaultHeight * resizeMinScale));
    const maxFromDefaultWidth = Number.isFinite(helperSizing?.maxWidth) && helperSizing.maxWidth > 0
      ? Math.round(Math.max(helperSizing.maxWidth, defaultWidth))
      : Math.max(defaultWidth, Math.round(defaultWidth * resizeMaxScale));
    const maxFromDefaultHeight = Number.isFinite(helperSizing?.maxHeight) && helperSizing.maxHeight > 0
      ? Math.round(Math.max(helperSizing.maxHeight, defaultHeight))
      : Math.max(defaultHeight, Math.round(defaultHeight * resizeMaxScale));
    const parsedMinWidth = Number(opts.minWidth);
    const parsedMinHeight = Number(opts.minHeight);
    const labelFromOpts = typeof opts.debugLabel === 'string' ? opts.debugLabel : null;
    const closestPanel = typeof container.closest === 'function' ? container.closest('.panel') : null;
    const panelId = closestPanel && closestPanel.id ? closestPanel.id : null;
    const containerLabel = labelFromOpts || container.id || panelId || container.className || 'svgbox';
    let MIN_W = Number.isFinite(parsedMinWidth) && parsedMinWidth > 0 ? parsedMinWidth : Number(data.resizerMinWidth);
    if(!Number.isFinite(MIN_W) || MIN_W <= 0){
      MIN_W = minFromDefaultWidth;
    }
    MIN_W = Math.max(MIN_W, minFromDefaultWidth);
    let MIN_H = Number.isFinite(parsedMinHeight) && parsedMinHeight > 0 ? parsedMinHeight : Number(data.resizerMinHeight);
    if(!Number.isFinite(MIN_H) || MIN_H <= 0){
      MIN_H = minFromDefaultHeight;
    }
    MIN_H = Math.max(MIN_H, minFromDefaultHeight);
    const parsedMaxWidth = Number(opts.maxWidth);
    const parsedMaxHeight = Number(opts.maxHeight);
    const helperMaxWidth = Number.isFinite(helperSizing?.maxWidth) && helperSizing.maxWidth > 0;
    const helperMaxHeight = Number.isFinite(helperSizing?.maxHeight) && helperSizing.maxHeight > 0;
    const hasExplicitMaxWidth = Number.isFinite(parsedMaxWidth) && parsedMaxWidth > 0;
    const hasExplicitMaxHeight = Number.isFinite(parsedMaxHeight) && parsedMaxHeight > 0;
    const allowUnlimitedOverride = opts.allowUnlimitedWidth === true;
    const allowUnlimitedWidth = allowUnlimitedOverride || (!hasExplicitMaxWidth && opts.allowUnlimitedWidth !== false);
    const allowUnlimitedHeightOverride = opts.allowUnlimitedHeight === true;
    const allowUnlimitedHeight = allowUnlimitedHeightOverride
      || (!hasExplicitMaxHeight && opts.allowUnlimitedHeight !== false && allowUnlimitedWidth);
    let MAX_W;
    if(allowUnlimitedWidth){
      MAX_W = Number.POSITIVE_INFINITY;
      console.debug('Debug: attachResizableBox unlimited width enabled', {
        container: containerLabel,
        helperMaxWidth,
        hasExplicitMaxWidth,
        ignoringHelperMaxWidth: helperMaxWidth,
        allowUnlimitedOverride
      }); // Debug: trace unlimited width flag
    }else{
      const storedMaxWidthRaw = data.resizerMaxWidth;
      const storedMaxWidth = Number(storedMaxWidthRaw);
      MAX_W = hasExplicitMaxWidth
        ? parsedMaxWidth
        : (Number.isFinite(storedMaxWidth) && storedMaxWidth > 0 ? storedMaxWidth : NaN);
      if(!Number.isFinite(MAX_W) || MAX_W <= 0){
        MAX_W = maxFromDefaultWidth;
      }
      MAX_W = Math.max(MAX_W, defaultWidth);
      MAX_W = Math.min(MAX_W, Math.max(defaultWidth, maxFromDefaultWidth));
    }
    let MAX_H;
    if(allowUnlimitedHeight){
      MAX_H = Number.POSITIVE_INFINITY;
      console.debug('Debug: attachResizableBox unlimited height enabled', {
        container: containerLabel,
        helperMaxHeight,
        hasExplicitMaxHeight,
        ignoringHelperMaxHeight: helperMaxHeight,
        allowUnlimitedHeightOverride
      }); // Debug: trace unlimited height flag
    }else{
      MAX_H = hasExplicitMaxHeight ? parsedMaxHeight : Number(data.resizerMaxHeight);
      if(!Number.isFinite(MAX_H) || MAX_H <= 0){
        MAX_H = maxFromDefaultHeight;
      }
      MAX_H = Math.max(MAX_H, defaultHeight);
      MAX_H = Math.min(MAX_H, Math.max(defaultHeight, maxFromDefaultHeight));
    }
    data.resizerDefaultWidth = String(defaultWidth);
    data.resizerDefaultHeight = String(defaultHeight);
    data.resizerMinWidth = String(MIN_W);
    data.resizerMinHeight = String(MIN_H);
    data.resizerUnlimitedWidth = allowUnlimitedWidth ? 'true' : 'false';
    data.resizerUnlimitedHeight = allowUnlimitedHeight ? 'true' : 'false';
    data.resizerMaxWidth = Number.isFinite(MAX_W) ? String(MAX_W) : 'Infinity';
    data.resizerMaxHeight = Number.isFinite(MAX_H) ? String(MAX_H) : 'Infinity';
    data.resizerResized = data.resizerResized || 'false';
    const parsedZoomMin = Number(opts.zoomMin);
    const parsedZoomMax = Number(opts.zoomMax);
    const parsedZoomStep = Number(opts.zoomStep);
    const zoomBounds = {
      min: Number.isFinite(parsedZoomMin) && parsedZoomMin > 0 ? parsedZoomMin : RESIZER_ZOOM_MIN,
      max: Number.isFinite(parsedZoomMax) && parsedZoomMax > 0 ? parsedZoomMax : RESIZER_ZOOM_MAX,
      step: Number.isFinite(parsedZoomStep) && parsedZoomStep > 0 ? parsedZoomStep : RESIZER_ZOOM_STEP,
      fallback: 1
    };
    zoomBounds.max = Math.max(zoomBounds.min, zoomBounds.max);
    let zoomLevel = normalizeZoomLevel(data.resizerZoomLevel || data.resizerZoom, zoomBounds);
    data.resizerZoom = String(zoomLevel);
    data.resizerZoomLevel = String(zoomLevel);
    const zoomScaleForBase = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
    const initialBaseWidth = (parsePositive(rect.width) || defaultWidth) / zoomScaleForBase;
    const initialBaseHeight = (parsePositive(rect.height) || defaultHeight) / zoomScaleForBase;
    if(!parsePositive(data.resizerBaseWidth)){
      data.resizerBaseWidth = String(Math.round(initialBaseWidth));
    }
    if(!parsePositive(data.resizerBaseHeight)){
      data.resizerBaseHeight = String(Math.round(initialBaseHeight));
    }
    const isZoomDebugEnabled = () => typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const logZoom = (message, payload = {}) => {
      if(!isZoomDebugEnabled()){
        return;
      }
      console.debug(`Debug: resizer zoom ${message}`, Object.assign({
        container: containerLabel,
        zoomLevel
      }, payload));
    };
    let zoomViewport = null;
    let zoomContent = null;
    let zoomTarget = null;
    let zoomControl = null;
    let zoomOutButton = null;
    let zoomInButton = null;
    let zoomValue = null;
    let suppressObserveResizeUntil = 0;

    const existingScope = data.resizerTextLockScope || null;
    const optionScope = typeof opts.scopeId === 'string' && opts.scopeId.trim() ? opts.scopeId.trim()
      : (typeof opts.textLockScope === 'string' && opts.textLockScope.trim() ? opts.textLockScope.trim() : null);
    let textLockScope = existingScope || optionScope || panelId || container.id || (labelFromOpts ? `${labelFromOpts}-scope` : null);
    if(!textLockScope){
      resizerScopeCounter += 1;
      textLockScope = `svgbox-scope-${resizerScopeCounter}`;
    }
    data.resizerTextLockScope = textLockScope;
    if(typeof data.resizerTextLock !== 'string'){
      let initialLock = false;
      if(chartStyle && typeof chartStyle.isTextSizeLocked === 'function'){
        try {
          initialLock = !!chartStyle.isTextSizeLocked({ scopeId: textLockScope, svgBox: container });
        } catch(scopeErr){
          console.error('resizer text lock initial state error', scopeErr);
        }
      }
      data.resizerTextLock = initialLock ? 'true' : 'false';
    }
    console.debug('Debug: resizer text lock scope resolved', {
      container: containerLabel,
      scope: textLockScope,
      existingScope,
      fromOption: optionScope,
      fromPanel: panelId,
      labelFromOpts
    }); // Debug: resizer scope trace
    const ratioFromDefaults = (Number.isFinite(defaultWidth) && defaultWidth > 0 && Number.isFinite(defaultHeight) && defaultHeight > 0)
      ? (defaultWidth / defaultHeight)
      : (Number.isFinite(helperSizing?.aspectRatio) && helperSizing.aspectRatio > 0 ? helperSizing.aspectRatio : NaN);
    const rectWidthVal = parsePositive(rect.width);
    const rectHeightVal = parsePositive(rect.height);
    const ratioFromRect = (Number.isFinite(rectWidthVal) && Number.isFinite(rectHeightVal) && rectHeightVal > 0)
      ? (rectWidthVal / rectHeightVal)
      : NaN;
    let aspectRatio = parsePositive(data.resizerAspectRatio);
    const overrideAspectRatio = parsePositive(opts.aspectRatio);
    if(Number.isFinite(overrideAspectRatio) && overrideAspectRatio > 0){
      aspectRatio = overrideAspectRatio;
      console.debug('Debug: resizer aspect ratio override', { container: containerLabel, overrideAspectRatio }); // Debug: aspect ratio override applied
    }
    if(!Number.isFinite(aspectRatio)){
      aspectRatio = Number.isFinite(ratioFromRect) ? ratioFromRect : ratioFromDefaults;
    }
    if(!Number.isFinite(aspectRatio) || aspectRatio <= 0){
      aspectRatio = Number.isFinite(ratioFromDefaults) ? ratioFromDefaults : 1;
    }
    let aspectLocked = data.resizerAspectLocked === 'true';
    if(helperSizing && helperSizing.aspectLocked === false){
      aspectLocked = false;
    }
    if(typeof opts.aspectLocked === 'boolean'){
      aspectLocked = opts.aspectLocked;
      console.debug('Debug: resizer aspect lock override', { container: containerLabel, aspectLocked }); // Debug: aspect lock override applied
    }
    if(aspectLocked && (!Number.isFinite(aspectRatio) || aspectRatio <= 0)){
      aspectLocked = false;
    }
    data.resizerAspectLocked = aspectLocked ? 'true' : 'false';
    function setAspectRatio(nextRatio){
      if(!Number.isFinite(nextRatio) || nextRatio <= 0) return;
      aspectRatio = nextRatio;
      data.resizerAspectRatio = String(nextRatio);
      console.debug('Debug: resizer aspect ratio set', { container: containerLabel, aspectRatio }); // Debug: aspect ratio set
    }

    function getActiveRatio(){
      if(Number.isFinite(aspectRatio) && aspectRatio > 0){
        return aspectRatio;
      }
      const fallback = Number.isFinite(ratioFromDefaults) && ratioFromDefaults > 0 ? ratioFromDefaults : 1;
      setAspectRatio(fallback);
      console.debug('Debug: resizer aspect ratio fallback', { container: containerLabel, fallback }); // Debug: aspect ratio fallback
      return aspectRatio;
    }

    function readRectRatio(){
      const liveRect = container.getBoundingClientRect();
      const liveWidth = parsePositive(liveRect.width);
      const liveHeight = parsePositive(liveRect.height);
      if(Number.isFinite(liveWidth) && Number.isFinite(liveHeight) && liveHeight > 0){
        const ratio = liveWidth / liveHeight;
        setAspectRatio(ratio);
        console.debug('Debug: resizer aspect ratio from rect', { container: containerLabel, ratio }); // Debug: aspect ratio from rect
        return ratio;
      }
      return getActiveRatio();
    }

    function syncZoomPresentation(baseWidth, baseHeight){
      const zoomSetup = ensureZoomElements();
      if(!zoomSetup){
        return;
      }
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      if(zoomSetup.viewport){
        zoomSetup.viewport.style.flex = '1 1 auto';
        zoomSetup.viewport.style.width = '100%';
        zoomSetup.viewport.style.height = '100%';
        zoomSetup.viewport.style.minWidth = '0';
        zoomSetup.viewport.style.minHeight = '0';
      }
      if(zoomSetup.content){
        zoomSetup.content.style.flex = '';
        zoomSetup.content.style.width = '';
        zoomSetup.content.style.height = '';
        zoomSetup.content.style.minWidth = '';
        zoomSetup.content.style.minHeight = '';
        // Keep chart geometry anchored at base dimensions; only visual footprint
        // changes via wrapper transform. This is what keeps zoom independent from
        // manual geometry resize.
        zoomSetup.content.style.setProperty('--resizer-content-zoom', String(zoomScale));
      }
    }

    function suppressObserverResize(ms){
      const duration = Number.isFinite(ms) && ms > 0 ? ms : 220;
      suppressObserveResizeUntil = Math.max(suppressObserveResizeUntil, Date.now() + duration);
      logZoom('observer-suppress', { until: suppressObserveResizeUntil, duration });
    }

    function applyResize({ width, height, axis, fallbackWidth, fallbackHeight, reason, aspectLockedOverride }){
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const requestedBaseWidth = Number.isFinite(width) ? (width / zoomScale) : NaN;
      const requestedBaseHeight = Number.isFinite(height) ? (height / zoomScale) : NaN;
      const fallbackBaseWidth = Number.isFinite(fallbackWidth) ? (fallbackWidth / zoomScale) : NaN;
      const fallbackBaseHeight = Number.isFinite(fallbackHeight) ? (fallbackHeight / zoomScale) : NaN;
      let finalBaseWidth = NaN;
      let finalBaseHeight = NaN;
      const effectiveAspectLocked = typeof aspectLockedOverride === 'boolean'
        ? aspectLockedOverride
        : aspectLocked;
      if(effectiveAspectLocked){
        const ratio = getActiveRatio();
        const enforced = enforceAspectRatio({
          width: requestedBaseWidth,
          height: requestedBaseHeight,
          minWidth: MIN_W,
          maxWidth: MAX_W,
          minHeight: MIN_H,
          maxHeight: MAX_H,
          ratio,
          axis,
          fallbackWidth: fallbackBaseWidth,
          fallbackHeight: fallbackBaseHeight,
          label: containerLabel
        });
        finalBaseWidth = enforced.width;
        finalBaseHeight = enforced.height;
      }
      if(!Number.isFinite(finalBaseWidth) && axis !== 'y'){
        finalBaseWidth = clampDimension(requestedBaseWidth, MIN_W, MAX_W);
      }
      if(!Number.isFinite(finalBaseHeight) && axis !== 'x'){
        finalBaseHeight = clampDimension(requestedBaseHeight, MIN_H, MAX_H);
      }
      const finalWidth = Number.isFinite(finalBaseWidth) ? finalBaseWidth * zoomScale : NaN;
      const finalHeight = Number.isFinite(finalBaseHeight) ? finalBaseHeight * zoomScale : NaN;
      if(Number.isFinite(finalWidth)){
        container.style.width = px(finalWidth);
        container.dataset.resizerWidth = container.style.width;
        container.dataset.resizerBaseWidth = String(Math.round(finalBaseWidth));
      }
      if(Number.isFinite(finalHeight)){
        container.style.height = px(finalHeight);
        container.dataset.resizerHeight = container.style.height;
        container.dataset.resizerBaseHeight = String(Math.round(finalBaseHeight));
      }
      container.dataset.resizerLastAxis = (axis === 'x' || axis === 'y') ? axis : 'both';
      // Aspect-lock flows can temporarily impose tight max-size constraints.
      // When unlocked, always restore the configured bounds so axis-length edits
      // are not blocked by stale maxHeight/maxWidth values.
      if(!effectiveAspectLocked){
        container.style.maxWidth = Number.isFinite(MAX_W) ? px(MAX_W * zoomScale) : 'none';
        container.style.maxHeight = Number.isFinite(MAX_H) ? px(MAX_H * zoomScale) : 'none';
      }
      syncZoomPresentation(finalBaseWidth, finalBaseHeight);
      console.debug('Debug: resizer applyResize helper', {
        container: containerLabel,
        reason,
        axis,
        zoomScale,
        aspectLocked: effectiveAspectLocked,
        aspectLockedBase: aspectLocked,
        finalBaseWidth,
        finalBaseHeight,
        finalWidth,
        finalHeight
      }); // Debug: apply resize helper
      return {
        width: finalWidth,
        height: finalHeight,
        baseWidth: finalBaseWidth,
        baseHeight: finalBaseHeight
      };
    }

    if(Number.isFinite(aspectRatio) && aspectRatio > 0){
      setAspectRatio(aspectRatio);
    }else{
      data.resizerAspectRatio = '';
    }

    function syncAspectCheckboxState(){
      if(aspectCheckbox){
        aspectCheckbox.checked = !!aspectLocked;
      }
    }

    function syncUnlockedStyleScaleBase(reason){
      if(aspectLocked){
        delete data.resizerUnlockedStyleScaleBase;
        return;
      }
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const rect = container.getBoundingClientRect();
      const baseWidth = parsePositive(rect.width) ? (rect.width / zoomScale) : parsePositive(data.resizerBaseWidth) || defaultWidth;
      const baseHeight = parsePositive(rect.height) ? (rect.height / zoomScale) : parsePositive(data.resizerBaseHeight) || defaultHeight;
      const scaleX = baseWidth / (defaultWidth || 1);
      const scaleY = baseHeight / (defaultHeight || 1);
      const styleScaleBase = Math.sqrt(Math.max(scaleX * scaleY, 0));
      if(Number.isFinite(styleScaleBase) && styleScaleBase > 0){
        data.resizerUnlockedStyleScaleBase = String(styleScaleBase);
        console.debug('Debug: resizer unlocked style scale base synced', {
          container: containerLabel,
          reason: reason || 'sync',
          styleScaleBase,
          baseWidth,
          baseHeight
        });
      }
    }

    function applyProgrammaticResize(options = {}){
      const requestedWidth = parsePositive(options.width);
      const requestedHeight = parsePositive(options.height);
      const requestedAxis = typeof options.axis === 'string' && options.axis ? options.axis : 'both';
      const simulateAspectLock = typeof options.simulateAspectLock === 'boolean'
        ? options.simulateAspectLock
        : null;
      const hasSimulatedAspectLock = typeof simulateAspectLock === 'boolean';
      const updateDefaults = options.updateDefaults === true;
      const updateAspectRatio = options.updateAspectRatio !== false;
      const preserveAspectLock = options.preserveAspectLock !== false;
      const forceExact = options.forceExact !== false;
      const reason = options.reason || 'programmatic';
      const authorityMode = options.authorityMode === 'transient' ? 'transient' : 'authoritative';
      const originalAspectLocked = aspectLocked;
      const hadAspectLock = aspectLocked;
      if(hasSimulatedAspectLock){
        aspectLocked = !!simulateAspectLock;
        data.resizerAspectLocked = aspectLocked ? 'true' : 'false';
        if(aspectLocked){
          delete data.resizerUnlockedStyleScaleBase;
        }else{
          syncUnlockedStyleScaleBase('programmatic-simulated-unlock');
        }
        syncAspectCheckboxState();
        console.debug('Debug: resizer programmatic simulated aspect lock', {
          container: containerLabel,
          reason,
          simulateAspectLock,
          previousAspectLocked: originalAspectLocked
        });
      }
      const nextRatio = (Number.isFinite(requestedWidth) && requestedWidth > 0 && Number.isFinite(requestedHeight) && requestedHeight > 0)
        ? (requestedWidth / requestedHeight)
        : NaN;
      if(updateAspectRatio && Number.isFinite(nextRatio) && nextRatio > 0){
        setAspectRatio(nextRatio);
      }
      if(!hasSimulatedAspectLock && forceExact && hadAspectLock && requestedAxis === 'both' && Number.isFinite(requestedWidth) && Number.isFinite(requestedHeight)){
        aspectLocked = false;
        data.resizerAspectLocked = 'false';
      }
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const liveRect = container.getBoundingClientRect();
      const fallbackWidth = parsePositive(liveRect.width) || (defaultWidth * zoomScale);
      const fallbackHeight = parsePositive(liveRect.height) || (defaultHeight * zoomScale);
      container.style.flex = '0 0 auto';
      container.dataset.resizerResized = 'true';
      const applied = applyResize({
        axis: requestedAxis,
        width: Number.isFinite(requestedWidth) ? (requestedWidth * zoomScale) : fallbackWidth,
        height: Number.isFinite(requestedHeight) ? (requestedHeight * zoomScale) : fallbackHeight,
        fallbackWidth,
        fallbackHeight,
        reason,
        aspectLockedOverride: hasSimulatedAspectLock ? simulateAspectLock : null
      });
      if(updateDefaults){
        if(Number.isFinite(requestedWidth) && requestedWidth > 0){
          defaultWidth = Math.round(requestedWidth);
          data.resizerDefaultWidth = String(defaultWidth);
        }
        if(Number.isFinite(requestedHeight) && requestedHeight > 0){
          defaultHeight = Math.round(requestedHeight);
          data.resizerDefaultHeight = String(defaultHeight);
        }
      }
      if(!hasSimulatedAspectLock && forceExact && preserveAspectLock && hadAspectLock){
        aspectLocked = true;
        data.resizerAspectLocked = 'true';
        delete data.resizerUnlockedStyleScaleBase;
      }
      syncAspectCheckboxState();
      console.debug('Debug: resizer applyProgrammaticResize', {
        container: containerLabel,
        reason,
        authorityMode,
        requestedAxis,
        requestedWidth,
        requestedHeight,
        simulateAspectLock,
        hasSimulatedAspectLock,
        originalAspectLocked,
        applied,
        updateDefaults,
        preserveAspectLock,
        finalAspectLocked: aspectLocked
      });
      if(typeof opts.onResize === 'function'){
        try { opts.onResize('programmatic'); } catch(err) { console.error('resizer onResize programmatic error', err); }
      }
      return applied;
    }

    const doc = global.document;
    function resolveZoomScale(candidate){
      const numeric = Number(candidate);
      if(Number.isFinite(numeric) && numeric > 0){
        return numeric;
      }
      return Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
    }

    function toBaseDimension(displayValue, scaleOverride){
      const numeric = Number(displayValue);
      if(!Number.isFinite(numeric)){
        return NaN;
      }
      return numeric / resolveZoomScale(scaleOverride);
    }

    function toDisplayDimension(baseValue, scaleOverride){
      const numeric = Number(baseValue);
      if(!Number.isFinite(numeric)){
        return NaN;
      }
      return numeric * resolveZoomScale(scaleOverride);
    }

    function applyZoomBoundsStyles(){
      const scale = resolveZoomScale();
      container.style.minWidth = px(MIN_W * scale);
      container.style.minHeight = px(MIN_H * scale);
      container.style.maxWidth = Number.isFinite(MAX_W) ? px(MAX_W * scale) : 'none';
      container.style.maxHeight = Number.isFinite(MAX_H) ? px(MAX_H * scale) : 'none';
    }

    function ensureZoomElements(){
      const zoomSetup = ensureZoomViewport(container, doc);
      if(!zoomSetup){
        return null;
      }
      zoomViewport = zoomSetup.viewport;
      zoomContent = zoomSetup.content;
      zoomTarget = zoomSetup.target;
      if(zoomSetup.created){
        logZoom('viewport-created', {
          target: zoomTarget?.id || zoomTarget?.tagName || null
        });
      }
      return zoomSetup;
    }

    function syncZoomControls(){
      const canZoomOut = zoomLevel > zoomBounds.min + RESIZER_ZOOM_EPSILON;
      const canZoomIn = zoomLevel < zoomBounds.max - RESIZER_ZOOM_EPSILON;
      if(zoomOutButton){
        zoomOutButton.disabled = !canZoomOut;
      }
      if(zoomInButton){
        zoomInButton.disabled = !canZoomIn;
      }
      if(zoomValue){
        const displayPercent = String(Math.round(zoomLevel * 100));
        if(zoomValue.tagName === 'INPUT'){
          if(doc.activeElement !== zoomValue){
            zoomValue.value = displayPercent;
          }
        }else{
          zoomValue.textContent = formatZoomLevel(zoomLevel);
        }
      }
      if(zoomControl){
        zoomControl.setAttribute('aria-label', `Graph zoom ${formatZoomLevel(zoomLevel)}`);
      }
    }

    function applyDisplayOnlyZoomResize(baseWidth, baseHeight, options = {}){
      const reason = options.reason || 'zoom';
      const changed = options.changed === true;
      const forceLayout = options.forceLayout === true;
      const shouldApplySize = changed || forceLayout || Math.abs(zoomLevel - 1) > RESIZER_ZOOM_EPSILON;
      if(!shouldApplySize){
        return null;
      }
      // Give ResizeObserver enough time to settle after css size updates so zoom does
      // not bounce into resize redraw callbacks.
      const observerSuppressMs = Number.isFinite(options.suppressObserverMs) ? options.suppressObserverMs : 450;
      suppressObserverResize(observerSuppressMs);
      container.style.flex = '0 0 auto';
      if(changed || Math.abs(zoomLevel - 1) > RESIZER_ZOOM_EPSILON){
        container.dataset.resizerResized = 'true';
      }
      const nextDisplayWidth = toDisplayDimension(baseWidth);
      const nextDisplayHeight = toDisplayDimension(baseHeight);
      return applyResize({
        axis: 'both',
        width: nextDisplayWidth,
        height: nextDisplayHeight,
        fallbackWidth: nextDisplayWidth,
        fallbackHeight: nextDisplayHeight,
        reason: `zoom-${reason}`
      });
    }

    function applyZoomLevel(nextLevel, options = {}){
      const reason = options.reason || 'zoom';
      const previousZoom = resolveZoomScale();
      const currentRect = container.getBoundingClientRect();
      const baseWidth = parsePositive(data.resizerBaseWidth) || toBaseDimension(parsePositive(currentRect.width), previousZoom) || defaultWidth;
      const baseHeight = parsePositive(data.resizerBaseHeight) || toBaseDimension(parsePositive(currentRect.height), previousZoom) || defaultHeight;
      const normalized = normalizeZoomLevel(nextLevel, zoomBounds);
      const changed = Math.abs(normalized - zoomLevel) > RESIZER_ZOOM_EPSILON;
      zoomLevel = normalized;
      data.resizerZoom = String(zoomLevel);
      data.resizerZoomLevel = String(zoomLevel);
      const applied = applyDisplayOnlyZoomResize(baseWidth, baseHeight, {
        reason,
        changed,
        forceLayout: options.forceLayout === true,
        suppressObserverMs: options.suppressObserverMs
      });
      syncZoomPresentation(baseWidth, baseHeight);
      applyZoomBoundsStyles();
      syncZoomControls();
      if((changed || options.forceLayout === true) && typeof opts.onResize === 'function'){
        try {
          // This callback is layout-sync only; componentLayout suppresses redraw work
          // for the "zoom" phase so zoom remains a pure magnifier.
          opts.onResize('zoom');
        } catch (resizeErr){
          console.error('resizer onResize zoom error', resizeErr);
        }
      }
      if(changed || options.logUnchanged){
        logZoom(changed ? 'applied' : 'unchanged', {
          reason,
          previousZoom,
          nextZoom: zoomLevel,
          appliedWidth: applied?.width || null,
          appliedHeight: applied?.height || null
        });
      }
      return zoomLevel;
    }

    function adjustZoom(direction){
      const delta = direction > 0 ? zoomBounds.step : -zoomBounds.step;
      return applyZoomLevel(zoomLevel + delta, {
        reason: direction > 0 ? 'button-plus' : 'button-minus'
      });
    }

    function commitZoomFromInput(rawValue){
      const numeric = Number.parseFloat(String(rawValue ?? '').replace('%', '').trim());
      if(!Number.isFinite(numeric) || numeric <= 0){
        syncZoomControls();
        return zoomLevel;
      }
      return applyZoomLevel(numeric / 100, { reason: 'input' });
    }

    container.__sharedResizableBoxApi = {
      applySize: applyProgrammaticResize,
      setZoomLevel: (level, options = {}) => applyZoomLevel(level, options),
      getZoomLevel: () => zoomLevel,
      getState: () => ({
        defaultWidth,
        defaultHeight,
        minWidth: MIN_W,
        minHeight: MIN_H,
        maxWidth: MAX_W,
        maxHeight: MAX_H,
        aspectRatio,
        aspectLocked,
        allowUnlimitedWidth,
        allowUnlimitedHeight,
        zoomLevel
      })
    };
    Shared.applyResizableBoxSize = function applyResizableBoxSize(target, options = {}){
      const api = target && target.__sharedResizableBoxApi;
      if(!api || typeof api.applySize !== 'function'){
        console.debug('Debug: Shared.applyResizableBoxSize skipped', {
          hasTarget: !!target,
          hasApi: !!api
        });
        return null;
      }
      return api.applySize(options);
    };
    Shared.applyResizableBoxZoom = function applyResizableBoxZoom(target, options = {}){
      const api = target && target.__sharedResizableBoxApi;
      const requestedLevel = options.level;
      if(!api || typeof api.setZoomLevel !== 'function'){
        if(isZoomDebugEnabled()){
          console.debug('Debug: Shared.applyResizableBoxZoom skipped', {
            hasTarget: !!target,
            hasApi: !!api
          });
        }
        return null;
      }
      return api.setZoomLevel(requestedLevel, options);
    };

    console.debug('Debug: attachResizableBox defaults', {
      defaultWidth,
      defaultHeight,
      MIN_W,
      MIN_H,
      MAX_W,
      MAX_H,
      resizeMinScale,
      resizeMaxScale,
      aspectLocked,
      aspectRatio
    }); // Debug: resizer defaults

    let aspectCheckbox = null;
    if(doc){
      let controlTray = container.querySelector('.resizer-control-tray');
      if(!controlTray){
        controlTray = doc.createElement('div');
        controlTray.className = 'resizer-control-tray';
        container.appendChild(controlTray);
        console.debug('Debug: resizer control tray created', { container: containerLabel }); // Debug: tray creation trace
      }
      let aspectControl = controlTray.querySelector('.resizer-aspect-control');
      if(!aspectControl){
        aspectControl = doc.createElement('label');
        aspectControl.className = 'resizer-aspect-control';
        aspectControl.title = 'Lock width/height ratio';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'resizer-aspect-checkbox';
        checkbox.setAttribute('aria-label', 'Lock width and height ratio');
        const textSpan = doc.createElement('span');
        textSpan.className = 'resizer-aspect-text';
        textSpan.textContent = 'Lock ratio';
        aspectControl.appendChild(checkbox);
        aspectControl.appendChild(textSpan);
        controlTray.appendChild(aspectControl);
        console.debug('Debug: resizer aspect control created', { container: containerLabel }); // Debug: control creation
        aspectCheckbox = checkbox;
      }else{
        if(aspectControl.parentNode !== controlTray){
          controlTray.appendChild(aspectControl);
        }
        aspectCheckbox = aspectControl.querySelector('input[type="checkbox"]');
      }
      if(aspectCheckbox){
        aspectCheckbox.checked = aspectLocked;
        if(aspectCheckbox.__resizerAspectHandler){
          aspectCheckbox.removeEventListener('change', aspectCheckbox.__resizerAspectHandler);
        }
        const onAspectChange = () => {
          aspectLocked = !!aspectCheckbox.checked;
          data.resizerAspectLocked = aspectLocked ? 'true' : 'false';
          console.debug('Debug: resizer aspect toggled', { container: containerLabel, aspectLocked }); // Debug: aspect toggle
          if(aspectLocked){
            delete data.resizerUnlockedStyleScaleBase;
            const updatedRatio = readRectRatio();
            setAspectRatio(updatedRatio);
            const liveRect = container.getBoundingClientRect();
            const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
            applyResize({
              axis: 'both',
              width: liveRect.width,
              height: liveRect.height,
              fallbackWidth: defaultWidth * zoomScale,
              fallbackHeight: defaultHeight * zoomScale,
              reason: 'aspect-toggle'
            });
          }else{
            syncUnlockedStyleScaleBase('aspect-toggle-unlock');
          }
          if(typeof opts.onResize === 'function'){
            try { opts.onResize('aspect-toggle'); } catch(e){ console.error('resizer onResize error', e); }
          }
        };
        aspectCheckbox.addEventListener('change', onAspectChange);
        aspectCheckbox.__resizerAspectHandler = onAspectChange;
      }

      let textLockControl = controlTray.querySelector('.resizer-textlock-control');
      let textLockCheckbox = textLockControl ? textLockControl.querySelector('input[type="checkbox"]') : null;
      if(!textLockControl){
        textLockControl = doc.createElement('label');
        textLockControl.className = 'resizer-textlock-control';
        textLockControl.title = 'Lock text size while resizing';
        const fontCheckbox = doc.createElement('input');
        fontCheckbox.type = 'checkbox';
        fontCheckbox.className = 'resizer-textlock-checkbox';
        fontCheckbox.setAttribute('aria-label', 'Lock text size while resizing');
        const textSpan = doc.createElement('span');
        textSpan.className = 'resizer-textlock-text';
        textSpan.textContent = 'Lock text size';
        textLockControl.appendChild(fontCheckbox);
        textLockControl.appendChild(textSpan);
        controlTray.appendChild(textLockControl);
        textLockCheckbox = fontCheckbox;
        console.debug('Debug: resizer text lock control created', { container: containerLabel }); // Debug: text lock control creation
      }else{
        if(textLockControl.parentNode !== controlTray){
          controlTray.appendChild(textLockControl);
        }
        textLockCheckbox = textLockControl.querySelector('input[type="checkbox"]');
      }
      if(textLockCheckbox){
        if(textLockCheckbox.dataset){
          textLockCheckbox.dataset.textLockScope = textLockScope;
        }
        if(typeof chartStyle.registerTextSizeLockControl === 'function'){
          chartStyle.registerTextSizeLockControl(textLockCheckbox, {
            origin: `${containerLabel}-resizer`,
            scopeId: textLockScope,
            svgBox: container
          });
          console.debug('Debug: resizer text lock registered', { container: containerLabel, scope: textLockScope }); // Debug: text lock registration
        }else{
          if(typeof chartStyle.isTextSizeLocked === 'function'){
            try {
              textLockCheckbox.checked = !!chartStyle.isTextSizeLocked({ scopeId: textLockScope, svgBox: container });
            } catch(stateErr){
              console.error('resizer text lock state sync error', stateErr);
            }
          }
          if(textLockCheckbox.__resizerTextLockHandler){
            textLockCheckbox.removeEventListener('change', textLockCheckbox.__resizerTextLockHandler);
          }
          const onTextLockChange = () => {
            const locked = !!textLockCheckbox.checked;
            container.dataset.resizerTextLock = locked ? 'true' : 'false';
            console.debug('Debug: resizer text lock fallback change', { container: containerLabel, locked, scope: textLockScope }); // Debug: fallback handler
            if(typeof chartStyle.setTextSizeLock === 'function'){
              chartStyle.setTextSizeLock(locked, { origin: `${containerLabel}-fallback`, scopeId: textLockScope, svgBox: container });
            }
          };
          textLockCheckbox.addEventListener('change', onTextLockChange);
          textLockCheckbox.__resizerTextLockHandler = onTextLockChange;
          if(typeof chartStyle.onTextSizeLockChange === 'function'){
            chartStyle.onTextSizeLockChange((lockedValue, eventOrigin) => {
              if(eventOrigin === `${containerLabel}-fallback`) return;
              const scoped = !!lockedValue;
              textLockCheckbox.checked = scoped;
              container.dataset.resizerTextLock = scoped ? 'true' : 'false';
              console.debug('Debug: resizer text lock fallback sync', {
                container: containerLabel,
                origin: eventOrigin,
                scope: textLockScope,
                locked: scoped
              }); // Debug: fallback sync listener
            }, { origin: `${containerLabel}-fallback-listener`, scopeId: textLockScope });
          }
        }
      }

      const optionsSetup = ensureGraphOptionsMenu(container, doc, {
        debugLabel: `${containerLabel}-options`,
        title: 'Graph options'
      });
      if(aspectControl){
        moveGraphOptionIntoMenu(container, aspectControl, { debugLabel: `${containerLabel}-aspect-option` });
      }
      if(textLockControl){
        moveGraphOptionIntoMenu(container, textLockControl, { debugLabel: `${containerLabel}-text-lock-option` });
      }

      const zoomSetup = ensureZoomElements();
      if(zoomSetup){
        zoomControl = container.querySelector('.resizer-zoom-control');
        if(!zoomControl){
          zoomControl = doc.createElement('div');
          zoomControl.className = 'resizer-zoom-control';
          zoomControl.setAttribute('role', 'group');
          zoomControl.setAttribute('aria-label', 'Graph zoom controls');
          if(controlTray){
            controlTray.insertBefore(
              zoomControl,
              optionsSetup?.control ? optionsSetup.control.nextSibling : (controlTray.firstChild || null)
            );
          }else{
            container.appendChild(zoomControl);
          }
          logZoom('control-created');
        }else if(controlTray){
          if(zoomControl.parentNode !== controlTray){
            controlTray.insertBefore(
              zoomControl,
              optionsSetup?.control ? optionsSetup.control.nextSibling : (controlTray.firstChild || null)
            );
          }else if(optionsSetup?.control && zoomControl.previousSibling !== optionsSetup.control){
            controlTray.insertBefore(zoomControl, optionsSetup.control.nextSibling);
          }else if(!optionsSetup?.control && controlTray.firstChild !== zoomControl){
            controlTray.insertBefore(zoomControl, controlTray.firstChild || null);
          }
        }
        let decreaseButton = zoomControl.querySelector('.resizer-zoom-button--decrease');
        if(!decreaseButton){
          decreaseButton = doc.createElement('button');
          decreaseButton.type = 'button';
          decreaseButton.className = 'resizer-zoom-button resizer-zoom-button--decrease';
          decreaseButton.textContent = '-';
          decreaseButton.setAttribute('aria-label', 'Zoom out graph view');
          zoomControl.appendChild(decreaseButton);
        }
        let zoomValueNode = zoomControl.querySelector('input.resizer-zoom-value');
        if(!zoomValueNode){
          const legacyNode = zoomControl.querySelector('.resizer-zoom-value');
          if(legacyNode){
            legacyNode.remove();
          }
          zoomValueNode = doc.createElement('input');
          zoomValueNode.type = 'number';
          zoomValueNode.className = 'resizer-zoom-value resizer-zoom-input';
          zoomValueNode.setAttribute('inputmode', 'decimal');
          zoomValueNode.setAttribute('aria-label', 'Zoom level percent');
          zoomValueNode.min = String(Math.round(zoomBounds.min * 100));
          zoomValueNode.max = String(Math.round(zoomBounds.max * 100));
          zoomValueNode.step = '10';
          zoomControl.appendChild(zoomValueNode);
        }
        let zoomUnitNode = zoomControl.querySelector('.resizer-zoom-unit');
        if(!zoomUnitNode){
          zoomUnitNode = doc.createElement('span');
          zoomUnitNode.className = 'resizer-zoom-unit';
          zoomUnitNode.textContent = '%';
          zoomControl.appendChild(zoomUnitNode);
        }
        let increaseButton = zoomControl.querySelector('.resizer-zoom-button--increase');
        if(!increaseButton){
          increaseButton = doc.createElement('button');
          increaseButton.type = 'button';
          increaseButton.className = 'resizer-zoom-button resizer-zoom-button--increase';
          increaseButton.textContent = '+';
          increaseButton.setAttribute('aria-label', 'Zoom in graph view');
          zoomControl.appendChild(increaseButton);
        }
        if(decreaseButton && zoomValueNode && zoomUnitNode && increaseButton){
          if(zoomControl.firstChild !== decreaseButton){
            zoomControl.insertBefore(decreaseButton, zoomControl.firstChild || null);
          }
          if(zoomValueNode.previousSibling !== decreaseButton){
            zoomControl.insertBefore(zoomValueNode, decreaseButton.nextSibling);
          }
          if(zoomUnitNode.previousSibling !== zoomValueNode){
            zoomControl.insertBefore(zoomUnitNode, zoomValueNode.nextSibling);
          }
          if(increaseButton.previousSibling !== zoomUnitNode){
            zoomControl.appendChild(increaseButton);
          }
          if(decreaseButton.__resizerZoomHandler){
            decreaseButton.removeEventListener('click', decreaseButton.__resizerZoomHandler);
          }
          if(increaseButton.__resizerZoomHandler){
            increaseButton.removeEventListener('click', increaseButton.__resizerZoomHandler);
          }
          if(zoomValueNode.__resizerZoomCommitHandler){
            zoomValueNode.removeEventListener('change', zoomValueNode.__resizerZoomCommitHandler);
            zoomValueNode.removeEventListener('blur', zoomValueNode.__resizerZoomCommitHandler);
          }
          if(zoomValueNode.__resizerZoomKeyHandler){
            zoomValueNode.removeEventListener('keydown', zoomValueNode.__resizerZoomKeyHandler);
          }
          const onDecrease = (event) => {
            if(event?.preventDefault){ event.preventDefault(); }
            adjustZoom(-1);
          };
          const onIncrease = (event) => {
            if(event?.preventDefault){ event.preventDefault(); }
            adjustZoom(1);
          };
          const onZoomCommit = () => {
            commitZoomFromInput(zoomValueNode.value);
          };
          const onZoomKeyDown = (event) => {
            if(event?.key === 'Enter'){
              if(event?.preventDefault){ event.preventDefault(); }
              commitZoomFromInput(zoomValueNode.value);
              zoomValueNode.blur();
            }else if(event?.key === 'Escape'){
              syncZoomControls();
              zoomValueNode.blur();
            }
          };
          decreaseButton.addEventListener('click', onDecrease);
          increaseButton.addEventListener('click', onIncrease);
          zoomValueNode.addEventListener('change', onZoomCommit);
          zoomValueNode.addEventListener('blur', onZoomCommit);
          zoomValueNode.addEventListener('keydown', onZoomKeyDown);
          decreaseButton.__resizerZoomHandler = onDecrease;
          increaseButton.__resizerZoomHandler = onIncrease;
          zoomValueNode.__resizerZoomCommitHandler = onZoomCommit;
          zoomValueNode.__resizerZoomKeyHandler = onZoomKeyDown;
          zoomOutButton = decreaseButton;
          zoomInButton = increaseButton;
          zoomValue = zoomValueNode;
          applyZoomLevel(zoomLevel, { reason: 'init', logUnchanged: true });
        }
      }else{
        logZoom('target-missing', { reason: 'init' });
      }
    }

    if(!aspectLocked){
      syncUnlockedStyleScaleBase('init-unlocked');
    }

    if(aspectLocked){
      const liveRect = container.getBoundingClientRect();
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      applyResize({
        axis: 'both',
        width: liveRect.width,
        height: liveRect.height,
        fallbackWidth: defaultWidth * zoomScale,
        fallbackHeight: defaultHeight * zoomScale,
        reason: 'initial-lock'
      });
    }

    const vHandle = container.querySelector('.resizer-vertical');
    const hHandle = container.querySelector('.resizer-horizontal');
    const cHandle = container.querySelector('.resizer-corner');
    console.debug('Debug: attachResizableBox on', containerLabel); // Debug: resizer attach
    applyZoomBoundsStyles();

    const hasUndo = undoManager && typeof undoManager.record === 'function';

    const parseStylePx = (value) => {
      if(typeof value !== 'string') return NaN;
      const num = Number.parseFloat(value);
      return Number.isFinite(num) ? num : NaN;
    };

    const makeResizeSnapshot = (tag) => {
      const liveRect = container.getBoundingClientRect();
      const rectWidth = parsePositive(liveRect.width);
      const rectHeight = parsePositive(liveRect.height);
      const snapshot = {
        tag,
        width: Number.isFinite(rectWidth) ? Math.round(rectWidth) : parseStylePx(container.style.width),
        height: Number.isFinite(rectHeight) ? Math.round(rectHeight) : parseStylePx(container.style.height),
        styleWidth: container.style.width,
        styleHeight: container.style.height,
        minWidthStyle: container.style.minWidth,
        minHeightStyle: container.style.minHeight,
        maxWidthStyle: container.style.maxWidth,
        maxHeightStyle: container.style.maxHeight,
        flexStyle: container.style.flex
      };
      console.debug('Debug: resizer snapshot captured', {
        container: containerLabel,
        tag,
        width: snapshot.width,
        height: snapshot.height
      });
      return snapshot;
    };

    const notifyUndoableResize = (mode, before, after, trigger) => {
      if(!hasUndo) return;
      if(!before || !after) return;
      const widthChanged = (() => {
        if(Number.isFinite(before.width) && Number.isFinite(after.width)){
          return Math.round(before.width) !== Math.round(after.width);
        }
        if(before.styleWidth && after.styleWidth){
          return before.styleWidth !== after.styleWidth;
        }
        return false;
      })();
      const heightChanged = (() => {
        if(Number.isFinite(before.height) && Number.isFinite(after.height)){
          return Math.round(before.height) !== Math.round(after.height);
        }
        if(before.styleHeight && after.styleHeight){
          return before.styleHeight !== after.styleHeight;
        }
        return false;
      })();
      if(!widthChanged && !heightChanged) return;
      undoManager.record({
        label: `resize:${containerLabel}:${mode}`,
        scope: containerLabel,
        undo: () => {
          console.debug('Debug: resizer undo snapshot apply', { container: containerLabel, mode, trigger });
          applySnapshot(before, 'undo');
          if(typeof opts.onResize === 'function'){
            try { opts.onResize('undo'); } catch(err){ console.error('resizer onResize undo error', err); }
          }
        },
        redo: () => {
          console.debug('Debug: resizer redo snapshot apply', { container: containerLabel, mode, trigger });
          applySnapshot(after, 'redo');
          if(typeof opts.onResize === 'function'){
            try { opts.onResize('redo'); } catch(err){ console.error('resizer onResize redo error', err); }
          }
        }
      });
    };

    function applySnapshot(snapshot, reason){
      if(!snapshot) return;
      const widthTarget = Number.isFinite(snapshot.width) ? snapshot.width : parseStylePx(snapshot.styleWidth);
      const heightTarget = Number.isFinite(snapshot.height) ? snapshot.height : parseStylePx(snapshot.styleHeight);
      const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
      const applied = applyResize({
        axis: 'both',
        width: widthTarget,
        height: heightTarget,
        fallbackWidth: Number.isFinite(widthTarget) ? widthTarget : (defaultWidth * zoomScale),
        fallbackHeight: Number.isFinite(heightTarget) ? heightTarget : (defaultHeight * zoomScale),
        reason: reason || 'snapshot'
      });
      if(typeof snapshot.flexStyle === 'string' && snapshot.flexStyle.length){
        container.style.flex = snapshot.flexStyle;
      }
      if(typeof snapshot.maxWidthStyle === 'string' && snapshot.maxWidthStyle.length){
        container.style.maxWidth = snapshot.maxWidthStyle;
      }
      if(typeof snapshot.maxHeightStyle === 'string' && snapshot.maxHeightStyle.length){
        container.style.maxHeight = snapshot.maxHeightStyle;
      }
      if(typeof snapshot.minWidthStyle === 'string' && snapshot.minWidthStyle.length){
        container.style.minWidth = snapshot.minWidthStyle;
      }
      if(typeof snapshot.minHeightStyle === 'string' && snapshot.minHeightStyle.length){
        container.style.minHeight = snapshot.minHeightStyle;
      }
      container.dataset.resizerResized = 'true';
      console.debug('Debug: resizer applySnapshot complete', {
        container: containerLabel,
        reason,
        widthApplied: applied.width,
        heightApplied: applied.height
      });
    }

    function attachDrag(handle, axis){
      if(!handle) return;
      const dragBindingStore = handle.__resizerDragBindings || (handle.__resizerDragBindings = {});
      const existingBinding = dragBindingStore[axis];
      if(existingBinding){
        if(typeof existingBinding.pointerdown === 'function'){
          handle.removeEventListener('pointerdown', existingBinding.pointerdown);
        }
        if(typeof existingBinding.dblclick === 'function'){
          handle.removeEventListener('dblclick', existingBinding.dblclick);
        }
      }
      let startX=0, startY=0, startW=0, startH=0, pointerId=null;
      let startSnapshot = null;
      const onPointerDown = (e) => {
        e.preventDefault();
        pointerId = e.pointerId;
        try { handle.setPointerCapture(pointerId); } catch(_) {}
        const rect = container.getBoundingClientRect();
        const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
        const startBaseWidth = Math.min(MAX_W, Math.max(MIN_W, Math.round(rect.width / zoomScale)));
        const startBaseHeight = Math.min(MAX_H, Math.max(MIN_H, Math.round(rect.height / zoomScale)));
        startW = Math.round(startBaseWidth * zoomScale);
        startH = Math.round(startBaseHeight * zoomScale);
        startX = e.clientX;
        startY = e.clientY;
        startSnapshot = makeResizeSnapshot('pointer-start');
        container.style.boxSizing = 'border-box';
        container.style.width = px(startW);
        container.style.height = px(startH);
        container.style.flex = '0 0 auto';
        container.style.maxWidth = 'none';
        container.style.maxHeight = 'none';
        container.dataset.resizerResized = 'true';
        container.dataset.resizerWidth = container.style.width;
        container.dataset.resizerHeight = container.style.height;
        console.debug('Debug: resizer drag start', { axis, startW, startH, MIN_W, MIN_H }); // Debug: resizer drag start
        document.documentElement.style.userSelect = 'none';
        document.documentElement.style.touchAction = 'none';
        const onPointerMove = (ev) => {
          ev.preventDefault();
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          const tentativeWidth = startW + dx;
          const tentativeHeight = startH + dy;
          applyResize({
            axis,
            width: axis === 'y' ? startW : tentativeWidth,
            height: axis === 'x' ? startH : tentativeHeight,
            fallbackWidth: startW,
            fallbackHeight: startH,
            reason: 'pointer-move'
          });
          console.debug('Debug: resizer drag move', {
            axis,
            dx,
            dy,
            aspectLocked,
            width: container.style.width,
            height: container.style.height,
            limits: { MIN_W, MAX_W, MIN_H, MAX_H }
          }); // Debug: resizer drag move
          if (typeof opts.onResize === 'function') {
            try { opts.onResize('move'); } catch(e) { console.error('resizer onResize error', e); }
          }
        };
        const onPointerUp = () => {
          try { handle.releasePointerCapture(pointerId); } catch(_) {}
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
          document.documentElement.style.userSelect = '';
          document.documentElement.style.touchAction = '';
          console.debug('Debug: resizer drag end'); // Debug: resizer drag end
          if(startSnapshot){
            const endSnapshot = makeResizeSnapshot('pointer-end');
            notifyUndoableResize(`drag-${axis}`, startSnapshot, endSnapshot, 'pointer');
            startSnapshot = null;
          }
          if (typeof opts.onResize === 'function') {
            try { opts.onResize('end'); } catch(e) { console.error('resizer onResize error', e); }
          }
        };
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
      };
      handle.addEventListener('pointerdown', onPointerDown);
      const onDoubleClick = (ev) => {
        ev.preventDefault();
        const beforeReset = makeResizeSnapshot('dblclick-before');
        container.style.flex = '0 0 auto';
        container.dataset.resizerResized = 'true';
        const zoomScale = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
        const resetWidth = defaultWidth * zoomScale;
        const resetHeight = defaultHeight * zoomScale;
        const applied = applyResize({
          axis: 'both',
          width: resetWidth,
          height: resetHeight,
          fallbackWidth: resetWidth,
          fallbackHeight: resetHeight,
          reason: 'dblclick-reset'
        });
        applyZoomBoundsStyles();
        if(aspectLocked){
          readRectRatio();
        }
        const afterReset = makeResizeSnapshot('dblclick-after');
        notifyUndoableResize('reset', beforeReset, afterReset, 'dblclick');
        console.debug('Debug: resizer size reset', { width: container.style.width, height: container.style.height, applied }); // Debug: resizer reset
        if (typeof opts.onResize === 'function') {
          try { opts.onResize('reset'); } catch(e) { console.error('resizer onResize error', e); }
        }
      };
      handle.addEventListener('dblclick', onDoubleClick);
      dragBindingStore[axis] = {
        pointerdown: onPointerDown,
        dblclick: onDoubleClick
      };
    }

    attachDrag(vHandle, 'x');
    attachDrag(hHandle, 'y');
    attachDrag(cHandle, 'both');
    if (global.ResizeObserver) {
      const obs = new ResizeObserver(() => {
        if(Date.now() <= suppressObserveResizeUntil){
          logZoom('observer-skipped', { suppressObserveResizeUntil });
          return;
        }
        console.debug('Debug: resizer observer triggered'); // Debug: resize observer
        if (typeof opts.onResize === 'function') {
          try { opts.onResize('observe'); } catch(e) { console.error('resizer onResize error', e); }
        }
      });
      obs.observe(container);
    }
  };

  Shared.syncPanelWidths = function syncPanelWidths(tablePanel, graphPanel, configPanel, scheduleDraw, opts={}){
    const debugLabel = opts.debugLabel || 'panel';
    const preserveGraphContent = opts.preserveGraphContent === true;
    const disableAutoWidthClamp = opts.disableAutoWidthClamp === true;
    const forceDefaultWidth = opts.forceDefaultWidth === true;
    const lockGraphPanelWidth = opts.lockGraphPanelWidth !== false;
    if(!tablePanel || !graphPanel || !configPanel){
      console.debug('Debug: Shared.syncPanelWidths skipped', {
        label: debugLabel,
        hasTable: !!tablePanel,
        hasGraph: !!graphPanel,
        hasConfig: !!configPanel
      });
      return null;
    }
    const docBody = global.document && global.document.body;
    const STYLE_EPSILON = 0.5;
    let layoutMutated = false;
    const isFiniteNumber = value => Number.isFinite(value);
    const nearlyEqual = (a, b, epsilon = STYLE_EPSILON) => isFiniteNumber(a) && isFiniteNumber(b) && Math.abs(a - b) <= epsilon;
    const parseInlinePx = value => {
      if(value == null || value === '') return NaN;
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : NaN;
    };
    const setStyleValueIfChanged = (style, prop, value) => {
      if(!style) return false;
      const next = value == null ? '' : String(value);
      const current = style[prop] == null ? '' : String(style[prop]);
      if(current === next) return false;
      style[prop] = next;
      layoutMutated = true;
      return true;
    };
    const setStylePxIfChanged = (style, prop, value, epsilon = STYLE_EPSILON) => {
      if(!style || !Number.isFinite(value)) return false;
      const rounded = Math.round(value);
      const currentInline = parseInlinePx(style[prop]);
      if(nearlyEqual(currentInline, rounded, epsilon) && style[prop]){
        return false;
      }
      style[prop] = rounded + 'px';
      layoutMutated = true;
      return true;
    };
    const tableManualPanel = tablePanel?.dataset?.panelManualWidth === 'true';
    const graphManualPanel = graphPanel?.dataset?.panelManualWidth === 'true';
    const hasManualPanelSizing = tableManualPanel || graphManualPanel;
    if(!lockGraphPanelWidth && !hasManualPanelSizing && graphPanel?.style){
      const needsReset = graphPanel.style.width || graphPanel.style.minWidth || graphPanel.style.flexBasis || graphPanel.style.flex;
      if(needsReset){
        setStyleValueIfChanged(graphPanel.style, 'width', '');
        setStyleValueIfChanged(graphPanel.style, 'minWidth', '');
        setStyleValueIfChanged(graphPanel.style, 'flexBasis', '');
        setStyleValueIfChanged(graphPanel.style, 'flex', '');
      }
    }
    if(!lockGraphPanelWidth && !hasManualPanelSizing){
      const wrapEl = graphPanel?.parentElement || null;
      if(wrapEl?.style && wrapEl?.dataset?.panelMinWidthLocked === 'true'){
        if(wrapEl.style.minWidth){
          setStyleValueIfChanged(wrapEl.style, 'minWidth', '');
        }
        delete wrapEl.dataset.panelMinWidthLocked;
      }
    }
    const svgBox = opts.svgBox || graphPanel.querySelector(opts.svgSelector || '.svgbox');
    const diagramSelector = opts.diagramSelector || '.diagram-area';
    const diagramArea = graphPanel.querySelector(diagramSelector);
    const isElementHidden = (el) => {
      if (!el) return true;
      if (typeof el.offsetParent === 'undefined') {
        try {
          const style = global.getComputedStyle ? global.getComputedStyle(el) : null;
          return style ? style.display === 'none' : false;
        } catch (err) {
          console.error('Shared.syncPanelWidths hidden detection error', err);
          return false;
        }
      }
      return el.offsetParent === null && el !== docBody;
    };
    const tableHidden = isElementHidden(tablePanel);
    const graphHidden = isElementHidden(graphPanel);
    if (tableHidden || graphHidden) {
      console.debug('Debug: Shared.syncPanelWidths skipped (hidden)', {
        label: debugLabel,
        tableHidden,
        graphHidden
      }); // Debug: skip adjustments for hidden panels
      return null;
    }
    let gap = 0;
    if(diagramArea){
      try{
        const style = (global.getComputedStyle ? global.getComputedStyle(diagramArea) : null) || {};
        gap = parseFloat(style.gap || 0) || 0;
      }catch(err){
        console.error('Shared.syncPanelWidths gap error', err);
      }
    }
    const svgDataset = svgBox && svgBox.dataset ? svgBox.dataset : null;
    const isUnlimitedToken = value => typeof value === 'string' && /^(infinity|none)$/i.test(value.trim());
    const unlimitedWidth = !!(svgDataset && (svgDataset.resizerUnlimitedWidth === 'true' || isUnlimitedToken(svgDataset.resizerMaxWidth)));
    const unlimitedHeight = !!(svgDataset && (svgDataset.resizerUnlimitedHeight === 'true' || isUnlimitedToken(svgDataset.resizerMaxHeight)));
    const storedTableWidth = svgDataset ? Number(svgDataset.resizerTableWidth) : NaN;
    const isManualResize = svgDataset ? svgDataset.resizerResized === 'true' : false;
    const zoomScale = svgDataset ? (parsePositive(svgDataset.resizerZoomLevel || svgDataset.resizerZoom) || 1) : 1;
    const toDisplayDimension = (value) => (Number.isFinite(value) ? value * zoomScale : NaN);
    const datasetMinWidthRaw = svgDataset ? parsePositive(svgDataset.resizerMinWidth) : NaN;
    const datasetMaxWidthRaw = (svgDataset && !unlimitedWidth) ? parsePositive(svgDataset.resizerMaxWidth) : NaN;
    const datasetMinHeightRaw = svgDataset ? parsePositive(svgDataset.resizerMinHeight) : NaN;
    const datasetMaxHeightRaw = (svgDataset && !unlimitedHeight) ? parsePositive(svgDataset.resizerMaxHeight) : NaN;
    const datasetDefaultWidthRaw = svgDataset ? parsePositive(svgDataset.resizerDefaultWidth) : NaN;
    const datasetDefaultHeightRaw = svgDataset ? parsePositive(svgDataset.resizerDefaultHeight) : NaN;
    const datasetMinWidth = toDisplayDimension(datasetMinWidthRaw);
    const datasetMaxWidth = toDisplayDimension(datasetMaxWidthRaw);
    const datasetMinHeight = toDisplayDimension(datasetMinHeightRaw);
    const datasetMaxHeight = toDisplayDimension(datasetMaxHeightRaw);
    const datasetDefaultWidth = toDisplayDimension(datasetDefaultWidthRaw);
    const datasetDefaultHeight = toDisplayDimension(datasetDefaultHeightRaw);
    const storedAutoWidth = (!isManualResize && svgDataset)
      ? parsePositive(svgDataset.resizerWidth)
      : NaN;
    const aspectLocked = svgDataset ? svgDataset.resizerAspectLocked === 'true' : false;
    const storedAspectRatio = svgDataset ? parsePositive(svgDataset.resizerAspectRatio) : NaN;
    const svgRect = svgBox ? svgBox.getBoundingClientRect() : null;
    const svgCurrentWidth = svgRect ? svgRect.width : NaN;
    const svgCurrentHeight = svgRect ? svgRect.height : NaN;
    let cssDefaultWidth = NaN;
    if(!Number.isFinite(datasetDefaultWidth) && svgBox && global.getComputedStyle){
      try {
        const computed = global.getComputedStyle(svgBox);
        cssDefaultWidth = parsePositive(computed.getPropertyValue('--graph-default-width'));
        if(Number.isFinite(cssDefaultWidth)){
          cssDefaultWidth = cssDefaultWidth * zoomScale;
        }
      } catch(defaultErr){
        console.error('Shared.syncPanelWidths default width css error', defaultErr);
      }
    }
    const autoDefaultWidth = Number.isFinite(datasetDefaultWidth) && datasetDefaultWidth > 0
      ? datasetDefaultWidth
      : cssDefaultWidth;
    const preferredAutoWidth = Number.isFinite(autoDefaultWidth) && autoDefaultWidth > 0
      ? autoDefaultWidth
      : (Number.isFinite(storedAutoWidth) && storedAutoWidth > 0 ? storedAutoWidth : NaN);
    const shouldForceDefaultWidth = forceDefaultWidth && !isManualResize && Number.isFinite(preferredAutoWidth) && preferredAutoWidth > 0;
    const tableWidth = tablePanel.getBoundingClientRect().width;
    const tableDataset = tablePanel.dataset || {};
    let defaultTableWidth = parsePositive(tableDataset.panelDefaultWidth);
    if(!Number.isFinite(defaultTableWidth) || defaultTableWidth <= 0){
      const measuredDefault = Number.isFinite(tableWidth) && tableWidth > 0 ? Math.round(tableWidth) : NaN;
      if(Number.isFinite(measuredDefault)){
        defaultTableWidth = measuredDefault;
        tableDataset.panelDefaultWidth = String(defaultTableWidth);
        console.debug('Debug: Shared.syncPanelWidths default width captured', {
          label: debugLabel,
          defaultTableWidth
        }); // Debug: capture table default width during sync
      }
    }
    const minTableHint = parsePositive(opts.minTableWidth);
    const sanitizedMinTableHint = Number.isFinite(minTableHint) && minTableHint >= 0 ? minTableHint : NaN;
    let computedTableMin = NaN;
    if((!Number.isFinite(sanitizedMinTableHint) || sanitizedMinTableHint < 0) && tablePanel && typeof global.getComputedStyle === 'function'){
      try{
        computedTableMin = parsePositive(global.getComputedStyle(tablePanel).minWidth);
      }catch(err){
        console.error('Shared.syncPanelWidths table min compute error', err);
      }
    }
    const baseMinTable = Number.isFinite(sanitizedMinTableHint) && sanitizedMinTableHint >= 0
      ? sanitizedMinTableHint
      : (Number.isFinite(computedTableMin) && computedTableMin >= 0 ? computedTableMin : 0);
    let storedMinTableWidth = parsePositive(tableDataset.panelMinWidth);
    if(!Number.isFinite(storedMinTableWidth)){
      storedMinTableWidth = baseMinTable;
      tableDataset.panelMinWidth = String(storedMinTableWidth);
      console.debug('Debug: Shared.syncPanelWidths table min stored', {
        label: debugLabel,
        storedMinTableWidth,
        minTableHint: sanitizedMinTableHint
      }); // Debug: persist computed min width baseline
    }else if(Number.isFinite(baseMinTable) && storedMinTableWidth < baseMinTable){
      storedMinTableWidth = baseMinTable;
      tableDataset.panelMinWidth = String(storedMinTableWidth);
      console.debug('Debug: Shared.syncPanelWidths table min normalized', {
        label: debugLabel,
        storedMinTableWidth,
        minTableHint: sanitizedMinTableHint
      }); // Debug: normalize stored min width to hint
    }
    const effectiveMinTable = Number.isFinite(storedMinTableWidth) ? storedMinTableWidth : baseMinTable;
    const minPx = Math.max(0, Math.round(effectiveMinTable));
    if(setStylePxIfChanged(tablePanel.style, 'minWidth', minPx)){
      console.debug('Debug: Shared.syncPanelWidths table min enforced', {
        label: debugLabel,
        minPx
      }); // Debug: enforce locked min width style
    }
    if(minPx > 0 && Number.isFinite(tableWidth) && tableWidth > 0 && tableWidth < minPx - 0.5){
      setStyleValueIfChanged(tablePanel.style, 'flex', '0 0 ' + minPx + 'px');
      setStylePxIfChanged(tablePanel.style, 'flexBasis', minPx);
      setStylePxIfChanged(tablePanel.style, 'width', minPx);
      console.debug('Debug: Shared.syncPanelWidths table width corrected', {
        label: debugLabel,
        minPx,
        tableWidth
      }); // Debug: bump table width back to min when compressed
    }
    const graphRect = graphPanel.getBoundingClientRect();
    const graphWidth = graphRect.width;
    const configWidth = configPanel.getBoundingClientRect().width;
    let graphInset = 0;
    let graphContentWidth = Number.isFinite(graphWidth) ? graphWidth : NaN;
    const readNumeric = (val) => {
      const num = Number.parseFloat(val);
      return Number.isFinite(num) ? num : 0;
    };
    if(Number.isFinite(graphWidth) && global.getComputedStyle){
      try{
        const graphStyle = global.getComputedStyle(graphPanel);
        const pad = readNumeric(graphStyle.paddingLeft) + readNumeric(graphStyle.paddingRight);
        const border = readNumeric(graphStyle.borderLeftWidth) + readNumeric(graphStyle.borderRightWidth);
        graphInset = pad + border;
        graphContentWidth = Math.max(0, graphWidth - graphInset);
        console.debug('Debug: Shared.syncPanelWidths graph inset', {
          label: debugLabel,
          graphWidth,
          graphContentWidth,
          graphInset,
          pad,
          border
        }); // Debug: layout inset calculation
      }catch(insetErr){
        console.error('Shared.syncPanelWidths inset error', insetErr);
      }
    }
    const resizerEl = opts.panelResizer || (graphPanel.parentElement ? Array.from(graphPanel.parentElement.children).find(el => el.classList && el.classList.contains('panel-resizer')) : null);
    const resizerWidth = resizerEl ? resizerEl.getBoundingClientRect().width : 0;
    let resizerMargin = 0;
    if(resizerEl && global.getComputedStyle){
      try{
        const resizerStyle = global.getComputedStyle(resizerEl);
        resizerMargin = readNumeric(resizerStyle.marginLeft) + readNumeric(resizerStyle.marginRight);
      }catch(resizerErr){
        console.error('Shared.syncPanelWidths resizer margin error', resizerErr);
      }
    }
    const resizerSpace = (Number.isFinite(resizerWidth) ? resizerWidth : 0) + (Number.isFinite(resizerMargin) ? resizerMargin : 0);
    const baseContentWidth = Number.isFinite(graphContentWidth) ? graphContentWidth : NaN;
    const baseAvailableWidth = Number.isFinite(baseContentWidth) ? baseContentWidth - gap : NaN;
    let availableRaw = Number.isFinite(baseContentWidth) ? baseContentWidth - configWidth - gap : NaN;
    const preserveAutoWidth = preserveGraphContent && !hasManualPanelSizing && !isManualResize;
    if(preserveAutoWidth && Number.isFinite(baseAvailableWidth)){
      availableRaw = baseAvailableWidth;
    }
    const manualWidth = isManualResize && Number.isFinite(svgCurrentWidth) ? svgCurrentWidth : NaN;
    if(isManualResize && Number.isFinite(manualWidth)){
      if(!Number.isFinite(availableRaw) || manualWidth > availableRaw){
        availableRaw = manualWidth;
      }
    }
    let maxAvailable = Number.isFinite(availableRaw) ? Math.max(0, availableRaw) : NaN;
    if(isManualResize && Number.isFinite(manualWidth)){
      maxAvailable = Math.max(manualWidth, maxAvailable || 0);
    }
    if((!Number.isFinite(availableRaw) || maxAvailable <= 0) && !(isManualResize && Number.isFinite(manualWidth) && manualWidth > 0) && !shouldForceDefaultWidth){
      console.debug('Debug: Shared.syncPanelWidths skipped (no width available)', {
        label: debugLabel,
        available: availableRaw,
        maxAvailable,
        manualWidth
      }); // Debug: guard against zero-width calculations
      return null;
    }
    if(isManualResize && Number.isFinite(manualWidth) && manualWidth > 0){
      availableRaw = Math.max(manualWidth, availableRaw || 0);
      maxAvailable = Math.max(manualWidth, maxAvailable || 0);
    }
    let minSvgWidth = Number.isFinite(opts.minSvgWidth) ? Math.max(0, opts.minSvgWidth) : 0;
    if(Number.isFinite(datasetMinWidth) && datasetMinWidth > 0){
      minSvgWidth = Math.max(minSvgWidth, datasetMinWidth);
    }
    let baseWidth;
    if(isManualResize && Number.isFinite(svgCurrentWidth) && svgCurrentWidth > 0){
      baseWidth = svgCurrentWidth;
    }else{
      const fallbackWidth = Number.isFinite(tableWidth) && tableWidth > 0 ? tableWidth : svgCurrentWidth;
      if(shouldForceDefaultWidth){
        baseWidth = preferredAutoWidth;
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.syncPanelWidths force default width', {
            label: debugLabel,
            preferredAutoWidth,
            baseWidth
          });
        }
      }else if(Number.isFinite(maxAvailable) && maxAvailable > 0){
        baseWidth = maxAvailable;
        if(!disableAutoWidthClamp && !isManualResize && Number.isFinite(preferredAutoWidth) && preferredAutoWidth > 0){
          baseWidth = Math.min(baseWidth, preferredAutoWidth);
          console.debug('Debug: Shared.syncPanelWidths auto default clamp', {
            label: debugLabel,
            preferredAutoWidth,
            maxAvailable,
            clampedWidth: baseWidth
          });
        }
        console.debug('Debug: Shared.syncPanelWidths baseWidth auto-fill', {
          label: debugLabel,
          baseWidth,
          maxAvailable,
          availableRaw,
          fallbackWidth
        }); // Debug: initial auto width uses full graph space
      }else if(Number.isFinite(availableRaw)){
        if(Number.isFinite(fallbackWidth) && fallbackWidth > 0){
          baseWidth = Math.min(fallbackWidth, availableRaw);
        }else{
          baseWidth = availableRaw;
        }
        if(!disableAutoWidthClamp && !isManualResize && Number.isFinite(preferredAutoWidth) && preferredAutoWidth > 0){
          baseWidth = Math.min(baseWidth, preferredAutoWidth);
          console.debug('Debug: Shared.syncPanelWidths auto fallback clamp', {
            label: debugLabel,
            preferredAutoWidth,
            availableRaw,
            fallbackWidth,
            clampedWidth: baseWidth
          });
        }
      }else{
        baseWidth = fallbackWidth;
      }
    }
    if(!Number.isFinite(baseWidth) || baseWidth <= 0){
      if(Number.isFinite(svgCurrentWidth) && svgCurrentWidth > 0){
        baseWidth = svgCurrentWidth;
      }else if(!isManualResize && Number.isFinite(preferredAutoWidth) && preferredAutoWidth > 0){
        baseWidth = preferredAutoWidth;
      }else if(Number.isFinite(datasetDefaultWidth) && datasetDefaultWidth > 0){
        baseWidth = datasetDefaultWidth;
      }else if(Number.isFinite(minSvgWidth) && minSvgWidth > 0){
        baseWidth = minSvgWidth;
      }else if(Number.isFinite(maxAvailable) && maxAvailable > 0){
        baseWidth = maxAvailable;
      }else{
        baseWidth = 0;
      }
    }
    const allowOverflow = unlimitedWidth || shouldForceDefaultWidth;
    let appliedWidth = baseWidth;
    if(!allowOverflow && Number.isFinite(maxAvailable)){
      appliedWidth = Math.min(appliedWidth, maxAvailable);
    }
    const minTarget = Number.isFinite(minSvgWidth) && minSvgWidth > 0 ? minSvgWidth : 0;
    if(!allowOverflow && Number.isFinite(maxAvailable) && maxAvailable >= 0 && maxAvailable < minTarget){
      appliedWidth = maxAvailable;
    }else if(appliedWidth < minTarget){
      appliedWidth = minTarget;
    }
    if(svgBox && Number.isFinite(appliedWidth) && appliedWidth > 0){
      let minWidthConstraint = Number.isFinite(datasetMinWidth) ? datasetMinWidth : NaN;
      if(Number.isFinite(minSvgWidth) && minSvgWidth > 0){
        minWidthConstraint = Number.isFinite(minWidthConstraint) ? Math.max(minWidthConstraint, minSvgWidth) : minSvgWidth;
      }
      let maxWidthConstraint = Number.isFinite(datasetMaxWidth) ? datasetMaxWidth : NaN;
      if(!allowOverflow && Number.isFinite(maxAvailable) && maxAvailable > 0){
        maxWidthConstraint = Number.isFinite(maxWidthConstraint) ? Math.min(maxWidthConstraint, maxAvailable) : maxAvailable;
      }
      if(Number.isFinite(minWidthConstraint) && Number.isFinite(maxWidthConstraint) && maxWidthConstraint < minWidthConstraint){
        maxWidthConstraint = minWidthConstraint;
      }
      let widthToApply = Math.round(appliedWidth);
      let heightToApply = NaN;
      let activeRatio = storedAspectRatio;
      if(aspectLocked){
        const ratioFromDefaults = (Number.isFinite(datasetDefaultWidth) && Number.isFinite(datasetDefaultHeight) && datasetDefaultHeight > 0)
          ? (datasetDefaultWidth / datasetDefaultHeight)
          : NaN;
        const ratioFromCurrent = (Number.isFinite(svgCurrentWidth) && Number.isFinite(svgCurrentHeight) && svgCurrentHeight > 0)
          ? (svgCurrentWidth / svgCurrentHeight)
          : NaN;
        activeRatio = Number.isFinite(activeRatio) ? activeRatio : (Number.isFinite(ratioFromCurrent) ? ratioFromCurrent : ratioFromDefaults);
        if(!Number.isFinite(activeRatio) || activeRatio <= 0){
          activeRatio = Number.isFinite(ratioFromDefaults) && ratioFromDefaults > 0 ? ratioFromDefaults : 1;
        }
        const enforced = enforceAspectRatio({
          width: widthToApply,
          height: svgCurrentHeight,
          minWidth: minWidthConstraint,
          maxWidth: maxWidthConstraint,
          minHeight: datasetMinHeight,
          maxHeight: datasetMaxHeight,
          ratio: activeRatio,
          axis: 'x',
          fallbackWidth: widthToApply,
          fallbackHeight: datasetDefaultHeight,
          label: debugLabel + ' sync'
        });
        if(Number.isFinite(enforced.width)){
          widthToApply = enforced.width;
        }
        if(Number.isFinite(enforced.height)){
          heightToApply = enforced.height;
        }
        if(Number.isFinite(enforced.width) && Number.isFinite(enforced.height) && enforced.height > 0){
          activeRatio = enforced.width / enforced.height;
        }
      }
      if(Number.isFinite(minWidthConstraint)){
        widthToApply = Math.max(widthToApply, Math.round(minWidthConstraint));
      }
      if(!unlimitedWidth && Number.isFinite(maxWidthConstraint)){
        widthToApply = Math.min(widthToApply, Math.round(maxWidthConstraint));
      }
      setStylePxIfChanged(svgBox.style, 'width', widthToApply);
      if(allowOverflow){
        setStyleValueIfChanged(svgBox.style, 'maxWidth', 'none');
      }else{
        setStylePxIfChanged(svgBox.style, 'maxWidth', Math.max(widthToApply, Number.isFinite(datasetDefaultWidth) ? datasetDefaultWidth : widthToApply));
      }
      if(svgDataset){
        svgDataset.resizerWidth = svgBox.style.width;
      }
      if(aspectLocked){
        let ratioForHeight = Number.isFinite(activeRatio) && activeRatio > 0 ? activeRatio : NaN;
        if(!Number.isFinite(ratioForHeight) || ratioForHeight <= 0){
          ratioForHeight = Number.isFinite(storedAspectRatio) && storedAspectRatio > 0 ? storedAspectRatio : NaN;
        }
        if(!Number.isFinite(heightToApply) && Number.isFinite(ratioForHeight) && ratioForHeight > 0){
          heightToApply = Math.round(widthToApply / ratioForHeight);
        }
        if(Number.isFinite(heightToApply)){
          if(Number.isFinite(datasetMinHeight)){
            heightToApply = Math.max(heightToApply, Math.round(datasetMinHeight));
          }
          if(Number.isFinite(datasetMaxHeight)){
            heightToApply = Math.min(heightToApply, Math.round(datasetMaxHeight));
          }
          setStylePxIfChanged(svgBox.style, 'height', heightToApply);
          setStylePxIfChanged(svgBox.style, 'maxHeight', Math.max(heightToApply, Number.isFinite(datasetDefaultHeight) ? datasetDefaultHeight : heightToApply));
          if(svgDataset){
            svgDataset.resizerHeight = svgBox.style.height;
          }
          console.debug('Debug: Shared.syncPanelWidths aspect enforcement', {
            label: debugLabel,
            aspectLocked,
            widthToApply,
            heightToApply,
            ratio: ratioForHeight,
            minWidthConstraint,
            maxWidthConstraint
          }); // Debug: aspect lock enforcement in sync
        }
        appliedWidth = widthToApply;
      }
    }
    if(isManualResize){
      const safeAppliedWidth = Number.isFinite(appliedWidth) && appliedWidth > 0 ? appliedWidth : manualWidth;
      const liveTableWidth = Number.isFinite(tableWidth) && tableWidth > 0 ? tableWidth : (tablePanel.getBoundingClientRect().width || 0);
      const lockedTableWidth = Number.isFinite(liveTableWidth) && liveTableWidth > 0
        ? liveTableWidth
        : (Number.isFinite(storedTableWidth) && storedTableWidth > 0 ? storedTableWidth : liveTableWidth);
      const minTablePx = Math.max(0, Math.round(minPx));
      const finalTableWidth = Math.max(minTablePx, Math.round(lockedTableWidth));
      if(svgDataset && finalTableWidth > 0){
        svgDataset.resizerTableWidth = String(finalTableWidth);
      }
      if(tablePanel && finalTableWidth > 0){
        setStyleValueIfChanged(tablePanel.style, 'flex', '0 0 ' + finalTableWidth + 'px');
        setStylePxIfChanged(tablePanel.style, 'width', finalTableWidth);
        setStylePxIfChanged(tablePanel.style, 'minWidth', minTablePx);
        setStyleValueIfChanged(tablePanel.style, 'maxWidth', 'none');
      }
      const targetGraphWidth = Number.isFinite(configWidth) ? safeAppliedWidth + configWidth + gap : safeAppliedWidth;
      const finalGraphWidth = Math.max(0, Math.round(targetGraphWidth));
      if(lockGraphPanelWidth && graphPanel && finalGraphWidth > 0){
        setStyleValueIfChanged(graphPanel.style, 'flex', '0 0 auto');
        setStyleValueIfChanged(graphPanel.style, 'maxWidth', 'none');
        setStylePxIfChanged(graphPanel.style, 'minWidth', finalGraphWidth);
        setStylePxIfChanged(graphPanel.style, 'width', finalGraphWidth);
      }
      if(configPanel){
        setStyleValueIfChanged(configPanel.style, 'flex', '0 0 auto');
      }
      const wrap = graphPanel?.parentElement || null;
      if(lockGraphPanelWidth && wrap && wrap.style){
        const wrapMin = Math.max(0, finalTableWidth + finalGraphWidth + graphInset + resizerSpace);
        if(wrapMin > 0){
          setStylePxIfChanged(wrap.style, 'minWidth', wrapMin);
        }else{
          setStyleValueIfChanged(wrap.style, 'minWidth', '');
        }
        if(wrap.dataset){
          wrap.dataset.panelMinWidthLocked = 'true';
        }
      }
      const latestGraphWidth = graphPanel?.getBoundingClientRect()?.width || finalGraphWidth;
      console.debug('Debug: Shared.syncPanelWidths manual lock', {
        label: debugLabel,
        appliedWidth: safeAppliedWidth,
        tableWidth: finalTableWidth,
        graphWidth: latestGraphWidth,
        configWidth,
        gap
      });
      if(typeof opts.onWidthApplied === 'function'){
        try{ opts.onWidthApplied(safeAppliedWidth); }catch(err){ console.error('Shared.syncPanelWidths onWidthApplied error', err); }
      }
      const shouldSchedule = opts.forceSchedule === true || layoutMutated;
      if(!opts.skipSchedule && shouldSchedule && typeof scheduleDraw === 'function'){
        try{ scheduleDraw(); }catch(err){ console.error(debugLabel + ' sync schedule error', err); }
      }
      return {
        layoutChanged: layoutMutated,
        tableWidth: finalTableWidth,
        graphWidth: latestGraphWidth,
        configWidth,
        gap,
        available: availableRaw,
        minSvgWidth,
        appliedWidth: safeAppliedWidth,
        graphInset,
        graphContentWidth,
        isManualResize,
        manualWidth: safeAppliedWidth
      };
    }
    const targetGraphWidth = Number.isFinite(appliedWidth) && Number.isFinite(configWidth)
      ? appliedWidth + configWidth + gap
      : null;
    if(lockGraphPanelWidth && graphPanel && Number.isFinite(targetGraphWidth) && targetGraphWidth > 0){
      setStyleValueIfChanged(graphPanel.style, 'flex', '0 0 auto');
      setStyleValueIfChanged(graphPanel.style, 'maxWidth', 'none');
      setStylePxIfChanged(graphPanel.style, 'minWidth', targetGraphWidth);
      let contentDiff = Number.isFinite(graphContentWidth)
        ? Math.abs(graphContentWidth - targetGraphWidth)
        : Infinity;
      if(isManualResize){
        contentDiff = Infinity;
      }
      if(!Number.isFinite(graphContentWidth) || contentDiff > 1){
        setStylePxIfChanged(graphPanel.style, 'width', targetGraphWidth);
        console.debug('Debug: Shared.syncPanelWidths graph width applied', {
          label: debugLabel,
          targetGraphWidth,
          existingGraphWidth: graphWidth,
          graphContentWidth,
          contentDiff
        }); // Debug: graph width adjustment
      }
    }
    const wrap = graphPanel?.parentElement || null;
      if(lockGraphPanelWidth && wrap && Number.isFinite(tableWidth) && Number.isFinite(targetGraphWidth)){
        const wrapMin = tableWidth + targetGraphWidth + graphInset + resizerSpace;
        if(Number.isFinite(wrapMin) && wrapMin > 0){
          setStylePxIfChanged(wrap.style, 'minWidth', wrapMin);
          if(wrap.dataset){
            wrap.dataset.panelMinWidthLocked = 'true';
          }
          console.debug('Debug: Shared.syncPanelWidths wrap minWidth', {
            label: debugLabel,
            wrapMin,
          tableWidth,
          targetGraphWidth,
          graphInset,
          resizerWidth,
          resizerMargin,
          resizerSpace
        }); // Debug: wrap width enforcement
      }
    }
    console.debug('Debug: Shared.syncPanelWidths manual state', {
      label: debugLabel,
      isManualResize,
      datasetMinWidth,
      datasetDefaultWidth,
      svgCurrentWidth,
      baseWidth,
      appliedWidth,
      maxAvailable,
      graphInset,
      graphContentWidth,
      available: availableRaw,
      manualWidth,
      minTarget
    }); // Debug: resizer manual state
    if(typeof opts.onWidthApplied === 'function'){
      try{
        opts.onWidthApplied(appliedWidth);
      }catch(err){
        console.error('Shared.syncPanelWidths onWidthApplied error', err);
      }
    }
    const shouldSchedule = opts.forceSchedule === true || layoutMutated;
    if(!opts.skipSchedule && shouldSchedule && typeof scheduleDraw === 'function'){
      try{
        scheduleDraw();
      }catch(err){
        console.error(debugLabel + ' sync schedule error', err);
      }
    }
    console.debug('Debug: Shared.syncPanelWidths applied', {
      label: debugLabel,
      tableWidth,
      graphWidth,
      configWidth,
      gap,
      available: availableRaw,
      minSvgWidth,
      appliedWidth,
      graphInset,
      graphContentWidth,
      isManualResize,
      manualWidth
    });
    return {
      layoutChanged: layoutMutated,
      tableWidth,
      graphWidth,
      configWidth,
      gap,
      available: availableRaw,
      minSvgWidth,
      appliedWidth,
      graphInset,
      graphContentWidth,
      isManualResize
    };
  };
})(window);
