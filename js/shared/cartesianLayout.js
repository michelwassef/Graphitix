(function initCartesianLayout(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.cartesianLayout = Shared.cartesianLayout || {};
  const SIDES = Object.freeze(['top', 'right', 'bottom', 'left']);
  const PLAN_VERSION = 1;

  function finite(value, fallback = 0){
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function positive(value, fallback = 1){
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function nonNegative(value, fallback = 0){
    return Math.max(0, finite(value, fallback));
  }

  function deepFreeze(value){
    if(!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function normalizeOwner(value){
    const source = value && typeof value === 'object' ? value : {};
    const generation = Number(source.generation ?? source.renderGeneration ?? source.sessionGeneration);
    return {
      tabId: source.tabId == null ? null : String(source.tabId),
      component: source.component == null ? null : String(source.component),
      generation: Number.isFinite(generation) ? generation : null
    };
  }

  function normalizeFrame(value){
    const source = value && typeof value === 'object' ? value : {};
    return {
      width: positive(source.width, 1),
      height: positive(source.height, 1)
    };
  }

  function normalizeMargins(value){
    const source = value && typeof value === 'object' ? value : {};
    return {
      top: nonNegative(source.top),
      right: nonNegative(source.right),
      bottom: nonNegative(source.bottom),
      left: nonNegative(source.left)
    };
  }

  function normalizeMinimumPlot(value){
    const source = value && typeof value === 'object' ? value : {};
    return {
      width: positive(source.width, 1),
      height: positive(source.height, 1)
    };
  }

  function normalizeRounding(value){
    const source = value && typeof value === 'object' ? value : {};
    const mode = typeof value === 'string' ? value : source.mode;
    const precision = Number(source.precision);
    return {
      mode: mode === 'floor' || mode === 'ceil' || mode === 'round' ? mode : 'none',
      precision: Number.isInteger(precision) && precision >= 0 && precision <= 8 ? precision : 6
    };
  }

  function roundValue(value, rounding){
    if(!Number.isFinite(value)) return value;
    const scale = 10 ** rounding.precision;
    const scaled = value * scale;
    if(rounding.mode === 'floor') return Math.floor(scaled) / scale;
    if(rounding.mode === 'ceil') return Math.ceil(scaled) / scale;
    if(rounding.mode === 'round') return Math.round(scaled) / scale;
    return Math.round(scaled) / scale;
  }

  function roundObject(value, rounding){
    return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, roundValue(number, rounding)]));
  }

  function normalizeOrientation(value){
    if(value === 'flipped' || value === 'horizontal' || value?.flipped === true) return 'flipped';
    return 'normal';
  }

  function transposeSide(side){
    if(side === 'top') return 'right';
    if(side === 'right') return 'bottom';
    if(side === 'bottom') return 'left';
    return 'top';
  }

  function transposeMargins(margins){
    return {
      top: margins.left,
      right: margins.top,
      bottom: margins.right,
      left: margins.bottom
    };
  }

  function normalizeReserveSource(name, value){
    if(value == null) return null;
    if(Number.isFinite(Number(value))){
      return { name, side: 'bottom', amount: nonNegative(value), behavior: 'stack', group: null };
    }
    if(typeof value !== 'object' || !SIDES.includes(value.side)) return null;
    const behavior = ['stack', 'max', 'external', 'metric'].includes(value.behavior) ? value.behavior : 'stack';
    return {
      name,
      side: value.side,
      amount: nonNegative(value.amount ?? value.value),
      behavior,
      group: value.group == null ? null : String(value.group)
    };
  }

  function normalizeReserveList(value){
    const output = [];
    if(Array.isArray(value)){
      value.forEach((entry, index) => {
        const normalized = normalizeReserveSource(entry?.name || `reserve-${index + 1}`, entry);
        if(normalized) output.push(normalized);
      });
    }else if(value && typeof value === 'object'){
      Object.entries(value).forEach(([name, entry]) => {
        const normalized = normalizeReserveSource(name, entry);
        if(normalized) output.push(normalized);
      });
    }
    return output;
  }

  function normalizeTitleBlock(value, fallbackFontSize, defaultSide){
    const source = value && typeof value === 'object' ? value : { text: value };
    const text = String(source.text ?? '').replace(/\r\n?/g, '\n');
    const lineCount = text.split('\n').length;
    const fontSize = positive(source.fontSize, fallbackFontSize);
    const lineHeight = positive(
      source.lineHeight,
      fontSize * (Number(Shared.textBlock?.DEFAULT_LINE_HEIGHT_EM) || 1)
    );
    const side = SIDES.includes(source.side) ? source.side : defaultSide;
    return { text, lineCount, fontSize, lineHeight, side, additionalExtent: Math.max(0, lineCount - 1) * lineHeight };
  }

  function normalizeTitleBlocks(value, fallbackFontSize, orientation){
    const source = value && typeof value === 'object' ? value : {};
    const flipped = orientation === 'flipped';
    return {
      graphTitle: normalizeTitleBlock(source.graphTitle, fallbackFontSize, 'top'),
      xTitle: normalizeTitleBlock(source.xTitle, fallbackFontSize, flipped ? 'left' : 'bottom'),
      yTitle: normalizeTitleBlock(source.yTitle, fallbackFontSize, flipped ? 'bottom' : 'left')
    };
  }

  function resolveTitleLineExtensions(titleBlocks){
    const extensions = { top: 0, right: 0, bottom: 0, left: 0 };
    const add = (role, block) => {
      const amount = Math.max(0, Number(block?.additionalExtent) || 0);
      if(!(amount > 0)) return;
      if(role === 'graphTitle'){
        extensions.bottom += amount;
        return;
      }
      const side = block?.side;
      if(side === 'left') extensions.right += amount;
      else if(side === 'right') extensions.left += amount;
      else if(side === 'top' || side === 'bottom') extensions.bottom += amount;
    };
    add('graphTitle', titleBlocks?.graphTitle);
    add('xTitle', titleBlocks?.xTitle);
    add('yTitle', titleBlocks?.yTitle);
    return extensions;
  }

  namespace.resolveMultilineTitleOverflowSides = function resolveMultilineTitleOverflowSides(value, orientation = 'normal'){
    const source = value && typeof value === 'object' ? value : {};
    const flipped = normalizeOrientation(orientation) === 'flipped';
    const sides = new Set();
    const add = (role, defaultSide) => {
      const block = source[role] && typeof source[role] === 'object' ? source[role] : {};
      if(!String(block.text ?? '').replace(/\r\n?/g, '\n').includes('\n')) return;
      if(role === 'graphTitle'){
        sides.add('bottom');
        return;
      }
      const side = SIDES.includes(block.side) ? block.side : defaultSide;
      // Titles on the left/right move the plot horizontally; titles on the
      // top/bottom either move the plot down or grow into the bottom rail.
      if(side === 'left') sides.add('right');
      else if(side === 'right') sides.add('left');
      else if(side === 'top' || side === 'bottom') sides.add('bottom');
    };
    add('graphTitle', 'top');
    add('xTitle', flipped ? 'left' : 'bottom');
    add('yTitle', flipped ? 'bottom' : 'left');
    return ['left', 'right', 'top', 'bottom'].filter(side => sides.has(side));
  };

  function ownerMatchesContext(ownerValue, contextValue, options = {}){
    const owner = normalizeOwner(ownerValue);
    const context = normalizeOwner(contextValue);
    if(context.tabId !== null && owner.tabId !== context.tabId) return false;
    if(context.component !== null && owner.component !== context.component) return false;
    if(context.generation !== null && owner.generation !== context.generation) return false;
    if(options.requireOwnerIdentity === true && (owner.tabId === null || owner.component === null)) return false;
    if(options.requireContextIdentity === true && (context.tabId === null || context.component === null)) return false;
    if(options.requireOwnerGeneration === true && owner.generation === null) return false;
    if(options.requireContextGeneration === true && context.generation === null) return false;
    return true;
  }

  function sameOwnerIdentity(leftValue, rightValue){
    const left = normalizeOwner(leftValue);
    const right = normalizeOwner(rightValue);
    if(left.tabId !== null && right.tabId !== null && left.tabId !== right.tabId) return false;
    if(left.component !== null && right.component !== null && left.component !== right.component) return false;
    return true;
  }

  namespace.transposeCartesianLayout = function transposeCartesianLayout(input = {}){
    const output = {
      ...input,
      userFrame: { width: normalizeFrame(input.userFrame).height, height: normalizeFrame(input.userFrame).width },
      baselineMargins: transposeMargins(normalizeMargins(input.baselineMargins)),
      requiredMargins: transposeMargins(normalizeMargins(input.requiredMargins || input.baselineMargins)),
      externalExtensions: transposeMargins(normalizeMargins(input.externalExtensions)),
      orientation: normalizeOrientation(input.orientation) === 'flipped' ? 'normal' : 'flipped'
    };
    if(input.minimumPlot){
      const minimum = normalizeMinimumPlot(input.minimumPlot);
      output.minimumPlot = { width: minimum.height, height: minimum.width };
    }
    if(input.lock && typeof input.lock === 'object'){
      const ratio = finite(input.lock.targetRatio ?? input.lock.ratio);
      output.lock = {
        ...input.lock,
        drive: input.lock.drive === 'width' ? 'height' : (input.lock.drive === 'height' ? 'width' : input.lock.drive),
        targetRatio: ratio > 0 ? 1 / ratio : input.lock.targetRatio
      };
    }
    if(input.plotConstraint && typeof input.plotConstraint === 'object'){
      const ratio = finite(input.plotConstraint.ratio ?? input.plotConstraint.targetRatio);
      const fitMap = {
        width: 'height',
        height: 'width',
        'width-extend': 'height-extend',
        'height-extend': 'width-extend'
      };
      output.plotConstraint = {
        ...input.plotConstraint,
        ...(ratio > 0 ? { ratio: 1 / ratio } : {}),
        ...(input.plotConstraint.targetRatio != null && ratio > 0 ? { targetRatio: 1 / ratio } : {}),
        fit: fitMap[input.plotConstraint.fit] || input.plotConstraint.fit
      };
    }
    if(input.axisFrameModel && typeof input.axisFrameModel === 'object'){
      output.axisFrameModel = {
        x: input.axisFrameModel.y ? { ...input.axisFrameModel.y } : undefined,
        y: input.axisFrameModel.x ? { ...input.axisFrameModel.x } : undefined
      };
    }
    if(input.axisLengths && typeof input.axisLengths === 'object'){
      output.axisLengths = { x: input.axisLengths.y, y: input.axisLengths.x };
    }
    output.auxiliaryReserves = normalizeReserveList(input.auxiliaryReserves).map(reserve => ({
      ...reserve,
      side: transposeSide(reserve.side)
    }));
    return deepFreeze(output);
  };

  namespace.composeAutomaticReserves = function composeAutomaticReserves(input = {}){
    const baselineMargins = normalizeMargins(input.baselineMargins);
    const requiredMargins = normalizeMargins(input.requiredMargins || baselineMargins);
    const bySource = {};
    const outwardBySide = { top: 0, right: 0, bottom: 0, left: 0 };
    const externalBySide = { top: 0, right: 0, bottom: 0, left: 0 };
    const metricBySide = { top: 0, right: 0, bottom: 0, left: 0 };
    const maxGroups = new Map();

    SIDES.forEach(side => {
      const amount = Math.max(0, requiredMargins[side] - baselineMargins[side]);
      if(amount <= 0) return;
      const name = `measured-${side}`;
      const reserve = { name, side, amount, behavior: 'stack', group: null, measured: true };
      bySource[name] = deepFreeze(reserve);
      outwardBySide[side] += amount;
    });

    normalizeReserveList(input.auxiliaryReserves).forEach(reserve => {
      bySource[reserve.name] = deepFreeze({ ...reserve, measured: false });
      if(reserve.behavior === 'external'){
        externalBySide[reserve.side] += reserve.amount;
        return;
      }
      if(reserve.behavior === 'max'){
        const key = `${reserve.side}:${reserve.group || 'default'}`;
        const previous = maxGroups.get(key);
        if(!previous || reserve.amount > previous.amount) maxGroups.set(key, reserve);
        return;
      }
      outwardBySide[reserve.side] += reserve.amount;
      if(reserve.behavior === 'metric') metricBySide[reserve.side] += reserve.amount;
    });

    maxGroups.forEach(reserve => {
      outwardBySide[reserve.side] += reserve.amount;
    });

    const explicitExternal = normalizeMargins(input.externalExtensions);
    SIDES.forEach(side => {
      externalBySide[side] += explicitExternal[side];
    });

    return deepFreeze({
      baselineMargins,
      requiredMargins,
      bySource,
      outwardBySide,
      externalBySide,
      metricBySide,
      totalBySide: {
        top: outwardBySide.top + externalBySide.top,
        right: outwardBySide.right + externalBySide.right,
        bottom: outwardBySide.bottom + externalBySide.bottom,
        left: outwardBySide.left + externalBySide.left
      }
    });
  };

  function resolvePlotConstraint(baseRect, constraint, minimumPlot){
    if(!constraint || typeof constraint !== 'object'){
      return { rect: baseRect, applied: false, reason: null };
    }
    const type = constraint.type || (finite(constraint.ratio ?? constraint.targetRatio) > 0 ? 'ratio' : null);
    const ratio = finite(constraint.ratio ?? constraint.targetRatio);
    if(type !== 'ratio' || !(ratio > 0)){
      return { rect: baseRect, applied: false, reason: type ? 'unsupported-plot-constraint' : null };
    }
    const fit = ['contain', 'width', 'height', 'width-extend', 'height-extend'].includes(constraint.fit)
      ? constraint.fit
      : 'contain';
    const anchor = constraint.anchor === 'center' ? 'center' : 'top-left';
    let width = baseRect.width;
    let height = baseRect.height;

    if(fit === 'height-extend'){
      height = Math.max(minimumPlot.height, baseRect.height);
      width = Math.max(minimumPlot.width, height * ratio);
    }else if(fit === 'width-extend'){
      width = Math.max(minimumPlot.width, baseRect.width);
      height = Math.max(minimumPlot.height, width / ratio);
    }else if(fit === 'width'){
      width = baseRect.width;
      height = width / ratio;
      if(height > baseRect.height){
        height = baseRect.height;
        width = height * ratio;
      }
    }else if(fit === 'height'){
      height = baseRect.height;
      width = height * ratio;
      if(width > baseRect.width){
        width = baseRect.width;
        height = width / ratio;
      }
    }else if(baseRect.width / baseRect.height > ratio){
      width = baseRect.height * ratio;
    }else{
      height = baseRect.width / ratio;
    }

    if(fit !== 'height-extend') width = Math.max(minimumPlot.width, Math.min(baseRect.width, width));
    if(fit !== 'width-extend') height = Math.max(minimumPlot.height, Math.min(baseRect.height, height));

    return {
      rect: {
        x: anchor === 'center' ? baseRect.x + (baseRect.width - width) / 2 : baseRect.x,
        y: anchor === 'center' ? baseRect.y + (baseRect.height - height) / 2 : baseRect.y,
        width,
        height
      },
      applied: true,
      reason: null
    };
  }

  function normalizeLock(lock){
    const source = lock && typeof lock === 'object' ? lock : {};
    const ratio = finite(source.targetRatio ?? source.ratio);
    return {
      enabled: source.enabled === true,
      targetRatio: ratio > 0 ? ratio : null,
      drive: source.drive === 'width' || source.drive === 'height' ? source.drive : 'both'
    };
  }

  function buildBasePlot(userFrame, baselineMargins){
    return {
      x: baselineMargins.left,
      y: baselineMargins.top,
      width: Math.max(1, userFrame.width - baselineMargins.left - baselineMargins.right),
      height: Math.max(1, userFrame.height - baselineMargins.top - baselineMargins.bottom)
    };
  }

  function deriveFrameInsets(userFrame, plotRect){
    return {
      horizontal: userFrame.width - plotRect.width,
      vertical: userFrame.height - plotRect.height,
      left: plotRect.x,
      top: plotRect.y,
      right: userFrame.width - plotRect.x - plotRect.width,
      bottom: userFrame.height - plotRect.y - plotRect.height
    };
  }

  function normalizeAxisFrameModel(value, userFrame, plotRect, minimumPlot){
    const source = value && typeof value === 'object' ? value : {};
    const normalizeAxis = (axis, frameLength, plotLength, minimumLength) => {
      const entry = source[axis] && typeof source[axis] === 'object' ? source[axis] : {};
      const count = positive(entry.count, 1);
      const fixedCandidate = Number(entry.fixed);
      const fixed = Number.isFinite(fixedCandidate) ? fixedCandidate : (frameLength - (count * plotLength));
      const minimum = positive(entry.minimum ?? entry.min, minimumLength);
      return { count, fixed, minimum };
    };
    return {
      x: normalizeAxis('x', userFrame.width, plotRect.width, minimumPlot.width),
      y: normalizeAxis('y', userFrame.height, plotRect.height, minimumPlot.height)
    };
  }

  function resolveAxisLength(frameLength, model){
    return Math.max(model.minimum, (frameLength - model.fixed) / model.count);
  }

  function resolveFrameLength(axisLength, model){
    return model.fixed + (model.count * Math.max(model.minimum, axisLength));
  }

  function deriveEnvelope(userFrame, basePlotRect, solvedPlotRect, reserves, contentBounds, titleLineExtensions){
    const bounds = contentBounds && typeof contentBounds === 'object' ? contentBounds : {};
    const hasMeasuredBounds = ['minX', 'minY', 'maxX', 'maxY']
      .every(key => Number.isFinite(Number(bounds[key])));
    const basePlotRight = basePlotRect.x + basePlotRect.width;
    const basePlotBottom = basePlotRect.y + basePlotRect.height;
    const plotRight = solvedPlotRect.x + solvedPlotRect.width;
    const plotBottom = solvedPlotRect.y + solvedPlotRect.height;
    // Plot constraints may extend the metric/data rectangle beyond its canonical
    // rail. Preserve the opposite baseline rail while doing so: extending a PCA
    // or equal-scale plot by 30 px must extend the outer graph by 30 px, not by
    // only the amount that happens to cross the user-frame edge after consuming
    // the existing right/bottom margin. Exact title line advances are applied
    // after this existing envelope below; measured bounds can extend it further.
    const plotOverflowLeft = Math.max(0, basePlotRect.x - solvedPlotRect.x);
    const plotOverflowTop = Math.max(0, basePlotRect.y - solvedPlotRect.y);
    const plotOverflowRight = Math.max(0, plotRight - basePlotRight);
    const plotOverflowBottom = Math.max(0, plotBottom - basePlotBottom);
    const baseMinX = -plotOverflowLeft;
    const baseMinY = -plotOverflowTop;
    const baseMaxX = userFrame.width + plotOverflowRight;
    const baseMaxY = userFrame.height + plotOverflowBottom;
    const plannedMinX = Math.min(
      -reserves.outwardBySide.left,
      baseMinX - reserves.externalBySide.left
    );
    const plannedMinY = Math.min(
      -reserves.outwardBySide.top,
      baseMinY - reserves.externalBySide.top
    );
    const plannedMaxX = Math.max(
      userFrame.width + reserves.outwardBySide.right,
      baseMaxX + reserves.externalBySide.right
    );
    const plannedMaxY = Math.max(
      userFrame.height + reserves.outwardBySide.bottom,
      baseMaxY + reserves.externalBySide.bottom
    );
    // The first plan reserves the full title advances before text is rendered,
    // so drag bounds cannot clip new lines. Once rendered bounds are available,
    // they become the exact outer-envelope authority: existing whitespace can
    // absorb part of the shifted title, and only real overflow grows the SVG.
    const minX = hasMeasuredBounds
      ? Math.min(plannedMinX, finite(bounds.minX, 0))
      : plannedMinX - titleLineExtensions.left;
    const minY = hasMeasuredBounds
      ? Math.min(plannedMinY, finite(bounds.minY, 0))
      : plannedMinY - titleLineExtensions.top;
    const maxX = hasMeasuredBounds
      ? Math.max(plannedMaxX, finite(bounds.maxX, userFrame.width))
      : plannedMaxX + titleLineExtensions.right;
    const maxY = hasMeasuredBounds
      ? Math.max(plannedMaxY, finite(bounds.maxY, userFrame.height))
      : plannedMaxY + titleLineExtensions.bottom;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      baseOffsetX: -minX,
      baseOffsetY: -minY,
      extensionTop: Math.max(0, -minY),
      extensionRight: Math.max(0, maxX - userFrame.width),
      extensionBottom: Math.max(0, maxY - userFrame.height),
      extensionLeft: Math.max(0, -minX),
      extensionWidth: Math.max(0, -minX) + Math.max(0, maxX - userFrame.width),
      extensionHeight: Math.max(0, -minY) + Math.max(0, maxY - userFrame.height)
    };
  }

  namespace.planCartesianLayout = function planCartesianLayout(input = {}){
    const owner = normalizeOwner(input.owner);
    const userFrame = normalizeFrame(input.userFrame || input.userBox);
    const baselineMargins = normalizeMargins(input.baselineMargins || input.coreInsets);
    const requiredMargins = normalizeMargins(input.requiredMargins || baselineMargins);
    const minimumPlot = normalizeMinimumPlot(input.minimumPlot);
    const rounding = normalizeRounding(input.rounding);
    const orientation = normalizeOrientation(input.orientation);
    const titleBlocks = normalizeTitleBlocks(input.titleBlocks, positive(input.fontSize, 14), orientation);
    const titleLineExtensions = resolveTitleLineExtensions(titleBlocks);
    const plotTranslation = {
      x: finite(input.plotTranslation?.x)
        + (titleBlocks.xTitle.side === 'left' ? titleBlocks.xTitle.additionalExtent : 0)
        + (titleBlocks.yTitle.side === 'left' ? titleBlocks.yTitle.additionalExtent : 0)
        - (titleBlocks.xTitle.side === 'right' ? titleBlocks.xTitle.additionalExtent : 0)
        - (titleBlocks.yTitle.side === 'right' ? titleBlocks.yTitle.additionalExtent : 0),
      // Each extra graph-title baseline consumes one line-height of vertical
      // space. The renderers keep the title's original top-rail anchor fixed,
      // so reserve exactly that same amount for the plot and outer envelope.
      y: finite(input.plotTranslation?.y)
        + titleBlocks.graphTitle.additionalExtent
        + (titleBlocks.xTitle.side === 'top' ? titleBlocks.xTitle.additionalExtent : 0)
        + (titleBlocks.yTitle.side === 'top' ? titleBlocks.yTitle.additionalExtent : 0)
    };
    const auxiliaryReserves = normalizeReserveList(input.auxiliaryReserves);
    const reserves = namespace.composeAutomaticReserves({
      baselineMargins,
      requiredMargins,
      auxiliaryReserves,
      externalExtensions: input.externalExtensions
    });
    const basePlotRect = buildBasePlot(userFrame, baselineMargins);
    const constrained = resolvePlotConstraint(basePlotRect, input.plotConstraint, minimumPlot);
    const unshiftedPlotRect = roundObject(constrained.rect, rounding);
    const plotRect = roundObject({
      ...constrained.rect,
      x: constrained.rect.x + plotTranslation.x,
      y: constrained.rect.y + plotTranslation.y
    }, rounding);
    const contentEnvelope = roundObject(deriveEnvelope(
      userFrame,
      basePlotRect,
      unshiftedPlotRect,
      reserves,
      input.contentBounds,
      titleLineExtensions
    ), rounding);
    const lock = normalizeLock(input.lock);
    const axisFrameModel = normalizeAxisFrameModel(input.axisFrameModel, userFrame, plotRect, minimumPlot);
    const axisLengths = {
      x: Number.isFinite(Number(input.axisLengths?.x)) && Number(input.axisLengths.x) > 0
        ? Number(input.axisLengths.x)
        : resolveAxisLength(userFrame.width, axisFrameModel.x),
      y: Number.isFinite(Number(input.axisLengths?.y)) && Number(input.axisLengths.y) > 0
        ? Number(input.axisLengths.y)
        : resolveAxisLength(userFrame.height, axisFrameModel.y)
    };
    const renderedRatio = axisLengths.y > 0 ? axisLengths.x / axisLengths.y : null;
    const lockFrameInsets = roundObject(deriveFrameInsets(userFrame, unshiftedPlotRect), rounding);
    const minimumPlotSatisfied = plotRect.width >= minimumPlot.width && plotRect.height >= minimumPlot.height;
    const diagnostics = [];
    if(!minimumPlotSatisfied) diagnostics.push('minimum-plot-not-satisfied');
    if(constrained.reason) diagnostics.push(constrained.reason);
    if(lock.enabled && !(lock.targetRatio > 0)) diagnostics.push('lock-target-missing');

    return deepFreeze({
      version: PLAN_VERSION,
      owner,
      orientation,
      userFrame: roundObject(userFrame, rounding),
      baselineMargins: roundObject(baselineMargins, rounding),
      requiredMargins: roundObject(requiredMargins, rounding),
      resolvedMargins: roundObject({
        top: Math.max(baselineMargins.top, requiredMargins.top),
        right: Math.max(baselineMargins.right, requiredMargins.right),
        bottom: Math.max(baselineMargins.bottom, requiredMargins.bottom),
        left: Math.max(baselineMargins.left, requiredMargins.left)
      }, rounding),
      automaticReserves: reserves,
      titleBlocks: deepFreeze(titleBlocks),
      titleLineExtensions: roundObject(titleLineExtensions, rounding),
      plotTranslation: roundObject(plotTranslation, rounding),
      basePlotRect: roundObject(basePlotRect, rounding),
      plotRect,
      axisLengths: roundObject(axisLengths, rounding),
      axisFrameModel: deepFreeze({
        x: roundObject(axisFrameModel.x, rounding),
        y: roundObject(axisFrameModel.y, rounding)
      }),
      contentEnvelope,
      lock: {
        enabled: lock.enabled,
        targetRatio: lock.enabled ? (lock.targetRatio || renderedRatio) : null,
        renderedRatio,
        drive: lock.drive,
        frameInsets: lockFrameInsets
      },
      plotConstraint: {
        applied: constrained.applied,
        type: constrained.applied ? 'ratio' : null,
        ratio: constrained.applied ? finite(input.plotConstraint?.ratio ?? input.plotConstraint?.targetRatio) : null,
        fit: constrained.applied ? (input.plotConstraint?.fit || 'contain') : null
      },
      minimumPlot,
      minimumPlotSatisfied,
      publication: {
        owner,
        generation: owner.generation,
        complete: true,
        planVersion: PLAN_VERSION
      },
      diagnostics
    });
  };

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  }

  namespace.solveLockedUserFrame = function solveLockedUserFrame(input = {}){
    const current = normalizeFrame(input.userFrame || input.userBox);
    const proposal = input.proposal && typeof input.proposal === 'object' ? input.proposal : {};
    const minimum = normalizeMinimumPlot(input.minimumPlot);
    const ratio = finite(input.targetRatio ?? input.ratio);
    const drive = input.drive === 'width' || input.drive === 'height'
      ? input.drive
      : (input.axis === 'x' ? 'width' : (input.axis === 'y' ? 'height' : 'both'));
    if(!(ratio > 0)) return deepFreeze({ valid: false, reason: 'invalid-ratio', userFrame: current, plotRatio: null });

    const suppliedInsets = input.frameInsets && typeof input.frameInsets === 'object' ? input.frameInsets : null;
    const baseline = normalizeMargins(input.baselineMargins || input.coreInsets);
    const fallbackPlotRect = {
      width: Math.max(minimum.width, current.width - (Number.isFinite(Number(suppliedInsets?.horizontal)) ? Number(suppliedInsets.horizontal) : baseline.left + baseline.right)),
      height: Math.max(minimum.height, current.height - (Number.isFinite(Number(suppliedInsets?.vertical)) ? Number(suppliedInsets.vertical) : baseline.top + baseline.bottom))
    };
    const model = normalizeAxisFrameModel(input.axisFrameModel, current, fallbackPlotRect, minimum);
    if(![model.x.count, model.x.fixed, model.y.count, model.y.fixed].every(Number.isFinite)){
      return deepFreeze({ valid: false, reason: 'invalid-axis-frame-model', userFrame: current, plotRatio: null });
    }

    const bounds = input.bounds && typeof input.bounds === 'object' ? input.bounds : {};
    const minWidth = Math.max(1, nonNegative(bounds.minWidth, 1), resolveFrameLength(model.x.minimum, model.x));
    const minHeight = Math.max(1, nonNegative(bounds.minHeight, 1), resolveFrameLength(model.y.minimum, model.y));
    const maxWidth = Number.isFinite(Number(bounds.maxWidth)) ? Math.max(minWidth, Number(bounds.maxWidth)) : Infinity;
    const maxHeight = Number.isFinite(Number(bounds.maxHeight)) ? Math.max(minHeight, Number(bounds.maxHeight)) : Infinity;
    const requestedWidth = Number.isFinite(Number(proposal.width)) ? Number(proposal.width) : current.width;
    const requestedHeight = Number.isFinite(Number(proposal.height)) ? Number(proposal.height) : current.height;

    const widthDriven = () => {
      let width = clamp(requestedWidth, minWidth, maxWidth);
      let axisWidth = resolveAxisLength(width, model.x);
      let axisHeight = Math.max(model.y.minimum, axisWidth / ratio);
      let height = clamp(resolveFrameLength(axisHeight, model.y), minHeight, maxHeight);
      axisHeight = resolveAxisLength(height, model.y);
      axisWidth = Math.max(model.x.minimum, axisHeight * ratio);
      width = clamp(resolveFrameLength(axisWidth, model.x), minWidth, maxWidth);
      axisWidth = resolveAxisLength(width, model.x);
      height = clamp(resolveFrameLength(axisWidth / ratio, model.y), minHeight, maxHeight);
      return { width, height };
    };
    const heightDriven = () => {
      let height = clamp(requestedHeight, minHeight, maxHeight);
      let axisHeight = resolveAxisLength(height, model.y);
      let axisWidth = Math.max(model.x.minimum, axisHeight * ratio);
      let width = clamp(resolveFrameLength(axisWidth, model.x), minWidth, maxWidth);
      axisWidth = resolveAxisLength(width, model.x);
      axisHeight = Math.max(model.y.minimum, axisWidth / ratio);
      height = clamp(resolveFrameLength(axisHeight, model.y), minHeight, maxHeight);
      axisHeight = resolveAxisLength(height, model.y);
      width = clamp(resolveFrameLength(axisHeight * ratio, model.x), minWidth, maxWidth);
      return { width, height };
    };
    const widthCandidate = widthDriven();
    const heightCandidate = heightDriven();
    const distance = candidate => ((candidate.width - requestedWidth) ** 2) + ((candidate.height - requestedHeight) ** 2);
    const chosen = drive === 'width'
      ? widthCandidate
      : (drive === 'height' ? heightCandidate : (distance(widthCandidate) <= distance(heightCandidate) ? widthCandidate : heightCandidate));
    const axisWidth = resolveAxisLength(chosen.width, model.x);
    const axisHeight = resolveAxisLength(chosen.height, model.y);
    const renderedRatio = axisHeight > 0 ? axisWidth / axisHeight : NaN;
    const ratioError = Number.isFinite(renderedRatio) ? Math.abs(renderedRatio - ratio) / ratio : Infinity;
    const valid = Number.isFinite(chosen.width) && Number.isFinite(chosen.height)
      && axisWidth >= model.x.minimum && axisHeight >= model.y.minimum
      && ratioError <= 1e-6;
    const rounding = normalizeRounding(input.rounding);
    return deepFreeze({
      valid,
      reason: valid ? null : 'bounds-conflict',
      userFrame: {
        width: roundValue(chosen.width, rounding),
        height: roundValue(chosen.height, rounding)
      },
      axisLengths: { x: roundValue(axisWidth, rounding), y: roundValue(axisHeight, rounding) },
      plotRatio: valid ? roundValue(renderedRatio, rounding) : null,
      ratioError: Number.isFinite(ratioError) ? ratioError : null,
      targetRatio: ratio,
      drive,
      axisFrameModel: {
        x: roundObject(model.x, rounding),
        y: roundObject(model.y, rounding)
      }
    });
  };

  // Renderers must use the same fixed axis-frame model that solved a locked
  // resize. Re-measuring scaled fonts here would create a second geometry
  // authority and change the rendered axis ratio after the resizer commits.
  namespace.resolveLockedRenderGeometry = function resolveLockedRenderGeometry(input = {}){
    const transaction = input.transaction && typeof input.transaction === 'object' ? input.transaction : null;
    const plan = transaction?.plan || input.plan || null;
    const transactionHasRatio = Number(transaction?.plotRatio) > 0;
    if(!plan || (plan.lock?.enabled !== true && !transactionHasRatio)) return null;
    const frame = normalizeFrame(input.userFrame || input.frame);
    const minimumPlot = normalizeMinimumPlot(plan.minimumPlot);
    const model = normalizeAxisFrameModel(plan.axisFrameModel, plan.userFrame, plan.plotRect, minimumPlot);
    const fixedX = Number(model.x.fixed);
    const fixedY = Number(model.y.fixed);
    if(!Number.isFinite(fixedX) || !Number.isFinite(fixedY)
      || fixedX < 0 || fixedY < 0
      || !(model.x.count > 0) || !(model.y.count > 0)){
      return deepFreeze({ valid: false, reason: 'invalid-axis-frame-model' });
    }
    const totalPlotWidth = frame.width - fixedX;
    const totalPlotHeight = frame.height - fixedY;
    const axisWidth = totalPlotWidth / model.x.count;
    const axisHeight = totalPlotHeight / model.y.count;
    const targetRatio = finite(input.targetRatio ?? transaction?.plotRatio ?? plan.lock.targetRatio);
    const renderedRatio = axisHeight > 0 ? axisWidth / axisHeight : NaN;
    const ratioError = targetRatio > 0 && Number.isFinite(renderedRatio)
      ? Math.abs(renderedRatio - targetRatio) / targetRatio
      : Infinity;
    const sourceInsets = plan.lock?.frameInsets || {};
    const left = finite(sourceInsets.left, plan.plotRect?.x);
    const top = finite(sourceInsets.top, plan.plotRect?.y);
    const right = fixedX - left;
    const bottom = fixedY - top;
    const valid = totalPlotWidth >= model.x.minimum * model.x.count
      && totalPlotHeight >= model.y.minimum * model.y.count
      && [left, top, right, bottom, axisWidth, axisHeight].every(value => Number.isFinite(value) && value >= 0)
      && Number.isFinite(targetRatio) && targetRatio > 0
      && Number.isFinite(renderedRatio);
    return deepFreeze({
      valid,
      reason: valid ? null : 'frame-bounds-conflict',
      userFrame: frame,
      margins: { top, right, bottom, left },
      plotRect: {
        x: left,
        y: top,
        width: totalPlotWidth,
        height: totalPlotHeight
      },
      axisLengths: { x: axisWidth, y: axisHeight },
      axisFrameModel: model,
      targetRatio: targetRatio > 0 ? targetRatio : null,
      renderedRatio: Number.isFinite(renderedRatio) ? renderedRatio : null,
      ratioError: Number.isFinite(ratioError) ? ratioError : null
    });
  };

  const DATASET_KEYS = Object.freeze([
    'cartesianLayoutVersion', 'cartesianLayoutTabId', 'cartesianLayoutComponent',
    'cartesianLayoutGeneration', 'cartesianPublicationGeneration', 'cartesianOrientation',
    'cartesianPayloadSignature', 'cartesianLayoutSignature',
    'cartesianPlotX', 'cartesianPlotY', 'cartesianPlotWidth', 'cartesianPlotHeight',
    'cartesianPlotTranslationX', 'cartesianPlotTranslationY',
    'cartesianUserWidth', 'cartesianUserHeight',
    'cartesianBaselineTop', 'cartesianBaselineRight', 'cartesianBaselineBottom', 'cartesianBaselineLeft',
    'cartesianRequiredTop', 'cartesianRequiredRight', 'cartesianRequiredBottom', 'cartesianRequiredLeft',
    'cartesianMinimumPlotWidth', 'cartesianMinimumPlotHeight',
    'cartesianAxisXCount', 'cartesianAxisXFixed', 'cartesianAxisXMinimum',
    'cartesianAxisYCount', 'cartesianAxisYFixed', 'cartesianAxisYMinimum',
    'cartesianAxisLengthX', 'cartesianAxisLengthY',
    'cartesianPlotConstraintApplied', 'cartesianPlotConstraintType', 'cartesianPlotConstraintRatio', 'cartesianPlotConstraintFit',
    'cartesianLockEnabled', 'cartesianLockTargetRatio', 'cartesianLockRenderedRatio', 'cartesianLockDrive',
    'cartesianLockInsetHorizontal', 'cartesianLockInsetVertical',
    'cartesianLockInsetLeft', 'cartesianLockInsetTop',
    'cartesianEnvelopeMinX', 'cartesianEnvelopeMinY', 'cartesianEnvelopeMaxX', 'cartesianEnvelopeMaxY',
    'cartesianLayoutComplete'
  ]);

  function writeDataset(target, plan, ownerContext = {}){
    if(!target?.dataset) return;
    const dataset = target.dataset;
    dataset.cartesianLayoutVersion = String(plan.version);
    if(plan.owner?.tabId) dataset.cartesianLayoutTabId = String(plan.owner.tabId);
    else delete dataset.cartesianLayoutTabId;
    if(plan.owner?.component) dataset.cartesianLayoutComponent = String(plan.owner.component);
    else delete dataset.cartesianLayoutComponent;
    if(plan.owner?.generation != null){
      dataset.cartesianLayoutGeneration = String(plan.owner.generation);
      dataset.cartesianPublicationGeneration = String(plan.owner.generation);
    }else{
      delete dataset.cartesianLayoutGeneration;
      delete dataset.cartesianPublicationGeneration;
    }
    dataset.cartesianOrientation = plan.orientation === 'flipped' ? 'flipped' : 'normal';
    const payloadSignature = ownerContext.payloadSignature ?? null;
    const layoutSignature = ownerContext.layoutSignature ?? null;
    if(payloadSignature != null) dataset.cartesianPayloadSignature = String(payloadSignature);
    else delete dataset.cartesianPayloadSignature;
    if(layoutSignature != null) dataset.cartesianLayoutSignature = String(layoutSignature);
    else delete dataset.cartesianLayoutSignature;
    dataset.cartesianPlotX = String(plan.plotRect.x);
    dataset.cartesianPlotY = String(plan.plotRect.y);
    dataset.cartesianPlotWidth = String(plan.plotRect.width);
    dataset.cartesianPlotHeight = String(plan.plotRect.height);
    dataset.cartesianPlotTranslationX = String(plan.plotTranslation?.x || 0);
    dataset.cartesianPlotTranslationY = String(plan.plotTranslation?.y || 0);
    dataset.cartesianUserWidth = String(plan.userFrame.width);
    dataset.cartesianUserHeight = String(plan.userFrame.height);
    SIDES.forEach(side => {
      dataset[`cartesianBaseline${side[0].toUpperCase()}${side.slice(1)}`] = String(plan.baselineMargins[side]);
      dataset[`cartesianRequired${side[0].toUpperCase()}${side.slice(1)}`] = String(plan.requiredMargins[side]);
    });
    dataset.cartesianMinimumPlotWidth = String(plan.minimumPlot.width);
    dataset.cartesianMinimumPlotHeight = String(plan.minimumPlot.height);
    dataset.cartesianAxisXCount = String(plan.axisFrameModel?.x?.count ?? 1);
    dataset.cartesianAxisXFixed = String(plan.axisFrameModel?.x?.fixed ?? (plan.userFrame.width - plan.axisLengths.x));
    dataset.cartesianAxisXMinimum = String(plan.axisFrameModel?.x?.minimum ?? plan.minimumPlot.width);
    dataset.cartesianAxisYCount = String(plan.axisFrameModel?.y?.count ?? 1);
    dataset.cartesianAxisYFixed = String(plan.axisFrameModel?.y?.fixed ?? (plan.userFrame.height - plan.axisLengths.y));
    dataset.cartesianAxisYMinimum = String(plan.axisFrameModel?.y?.minimum ?? plan.minimumPlot.height);
    dataset.cartesianAxisLengthX = String(plan.axisLengths?.x ?? plan.plotRect.width);
    dataset.cartesianAxisLengthY = String(plan.axisLengths?.y ?? plan.plotRect.height);
    dataset.cartesianPlotConstraintApplied = plan.plotConstraint?.applied === true ? 'true' : 'false';
    if(plan.plotConstraint?.type) dataset.cartesianPlotConstraintType = String(plan.plotConstraint.type);
    else delete dataset.cartesianPlotConstraintType;
    if(Number.isFinite(Number(plan.plotConstraint?.ratio)) && Number(plan.plotConstraint.ratio) > 0) dataset.cartesianPlotConstraintRatio = String(plan.plotConstraint.ratio);
    else delete dataset.cartesianPlotConstraintRatio;
    if(plan.plotConstraint?.fit) dataset.cartesianPlotConstraintFit = String(plan.plotConstraint.fit);
    else delete dataset.cartesianPlotConstraintFit;
    dataset.cartesianLockEnabled = plan.lock?.enabled === true ? 'true' : 'false';
    dataset.cartesianLockDrive = plan.lock?.drive === 'width' || plan.lock?.drive === 'height' ? plan.lock.drive : 'both';
    if(plan.lock?.targetRatio > 0) dataset.cartesianLockTargetRatio = String(plan.lock.targetRatio);
    else delete dataset.cartesianLockTargetRatio;
    if(plan.lock?.renderedRatio > 0) dataset.cartesianLockRenderedRatio = String(plan.lock.renderedRatio);
    else delete dataset.cartesianLockRenderedRatio;
    if(Number.isFinite(Number(plan.lock?.frameInsets?.horizontal))) dataset.cartesianLockInsetHorizontal = String(plan.lock.frameInsets.horizontal);
    else delete dataset.cartesianLockInsetHorizontal;
    if(Number.isFinite(Number(plan.lock?.frameInsets?.vertical))) dataset.cartesianLockInsetVertical = String(plan.lock.frameInsets.vertical);
    else delete dataset.cartesianLockInsetVertical;
    if(Number.isFinite(Number(plan.lock?.frameInsets?.left))) dataset.cartesianLockInsetLeft = String(plan.lock.frameInsets.left);
    else delete dataset.cartesianLockInsetLeft;
    if(Number.isFinite(Number(plan.lock?.frameInsets?.top))) dataset.cartesianLockInsetTop = String(plan.lock.frameInsets.top);
    else delete dataset.cartesianLockInsetTop;
    dataset.cartesianEnvelopeMinX = String(plan.contentEnvelope.minX);
    dataset.cartesianEnvelopeMinY = String(plan.contentEnvelope.minY);
    dataset.cartesianEnvelopeMaxX = String(plan.contentEnvelope.maxX);
    dataset.cartesianEnvelopeMaxY = String(plan.contentEnvelope.maxY);
    dataset.cartesianLayoutComplete = 'true';
  }

  function clearDataset(target){
    if(!target?.dataset) return;
    DATASET_KEYS.forEach(key => { delete target.dataset[key]; });
  }

  function preservePublishedTitleEnvelope(previousPlan, nextPlan){
    const previous = previousPlan && typeof previousPlan === 'object' ? previousPlan : null;
    if(!previous?.publication?.complete || !nextPlan?.contentEnvelope || !nextPlan?.titleLineExtensions) return nextPlan;
    if(!sameOwnerIdentity(previous.owner, nextPlan.owner)) return nextPlan;
    const previousFrame = previous.userFrame || {};
    const nextFrame = nextPlan.userFrame || {};
    if(Math.abs(finite(previousFrame.width) - finite(nextFrame.width)) > 0.5
      || Math.abs(finite(previousFrame.height) - finite(nextFrame.height)) > 0.5) return nextPlan;

    const sideConfig = {
      top: { envelope: 'extensionTop', edge: 'minY', frame: 'height', direction: -1 },
      right: { envelope: 'extensionRight', edge: 'maxX', frame: 'width', direction: 1 },
      bottom: { envelope: 'extensionBottom', edge: 'maxY', frame: 'height', direction: 1 },
      left: { envelope: 'extensionLeft', edge: 'minX', frame: 'width', direction: -1 }
    };
    const nextEnvelope = { ...nextPlan.contentEnvelope };
    let changed = false;
    Object.entries(sideConfig).forEach(([side, config]) => {
      if(!(finite(nextPlan.titleLineExtensions[side]) > 0)) return;
      const previousExternal = Number(previous.automaticReserves?.externalBySide?.[side]);
      const nextExternal = Number(nextPlan.automaticReserves?.externalBySide?.[side]);
      if(!Number.isFinite(previousExternal) || !Number.isFinite(nextExternal)
        || Math.abs(previousExternal - nextExternal) > 0.5) return;
      const priorReserve = Math.max(0, finite(previous.contentEnvelope?.[config.envelope]));
      const nextReserve = Math.max(0, finite(nextEnvelope[config.envelope]));
      if(priorReserve <= nextReserve + 0.001) return;
      nextEnvelope[config.envelope] = priorReserve;
      nextEnvelope[config.edge] = config.direction > 0
        ? finite(nextFrame[config.frame]) + priorReserve
        : -priorReserve;
      changed = true;
    });
    if(!changed) return nextPlan;
    nextEnvelope.width = finite(nextEnvelope.maxX) - finite(nextEnvelope.minX);
    nextEnvelope.height = finite(nextEnvelope.maxY) - finite(nextEnvelope.minY);
    nextEnvelope.baseOffsetX = -finite(nextEnvelope.minX);
    nextEnvelope.baseOffsetY = -finite(nextEnvelope.minY);
    nextEnvelope.extensionWidth = Math.max(0, -finite(nextEnvelope.minX))
      + Math.max(0, finite(nextEnvelope.maxX) - finite(nextFrame.width));
    nextEnvelope.extensionHeight = Math.max(0, -finite(nextEnvelope.minY))
      + Math.max(0, finite(nextEnvelope.maxY) - finite(nextFrame.height));
    return deepFreeze({ ...nextPlan, contentEnvelope: nextEnvelope });
  }

  function mergeViewportReservesIntoPlan(plan, projectionTargets){
    const target = (projectionTargets || []).find(node => node?.dataset?.graphContentBaseWidth != null);
    if(!target) return plan;
    const data = target.dataset;
    const reserveBySide = {
      left: Math.max(0, finite(data.graphContentReserveLeft)),
      top: Math.max(0, finite(data.graphContentReserveTop)),
      right: Math.max(0, finite(data.graphContentReserveRight)),
      bottom: Math.max(0, finite(data.graphContentReserveBottom)
        - (data.statsFigureSummaryCarried === '1' ? finite(data.statsFigureSummaryCarryReserveBottom) : 0))
    };
    const envelope = { ...plan.contentEnvelope };
    const frame = plan.userFrame || {};
    const sideConfig = {
      left: ['extensionLeft', 'minX', 'width'],
      top: ['extensionTop', 'minY', 'height'],
      right: ['extensionRight', 'maxX', 'width'],
      bottom: ['extensionBottom', 'maxY', 'height']
    };
    let changed = false;
    Object.entries(sideConfig).forEach(([side, [extensionKey, edgeKey, frameKey]]) => {
      const reserve = reserveBySide[side];
      if(reserve <= finite(envelope[extensionKey]) + 0.001) return;
      envelope[extensionKey] = reserve;
      envelope[edgeKey] = side === 'left' || side === 'top'
        ? -reserve
        : finite(frame[frameKey]) + reserve;
      changed = true;
    });
    if(!changed) return plan;
    envelope.width = finite(envelope.maxX) - finite(envelope.minX);
    envelope.height = finite(envelope.maxY) - finite(envelope.minY);
    envelope.baseOffsetX = -finite(envelope.minX);
    envelope.baseOffsetY = -finite(envelope.minY);
    envelope.extensionWidth = Math.max(0, -finite(envelope.minX))
      + Math.max(0, finite(envelope.maxX) - finite(frame.width));
    envelope.extensionHeight = Math.max(0, -finite(envelope.minY))
      + Math.max(0, finite(envelope.maxY) - finite(frame.height));
    return deepFreeze({ ...plan, contentEnvelope: envelope });
  }

  namespace.publishCartesianLayout = function publishCartesianLayout(target, plan, ownerContext = {}){
    if(!target || !plan || plan.publication?.complete !== true) return false;
    let publicationPlan = preservePublishedTitleEnvelope(target.__cartesianLayoutPlan, plan);
    if(!ownerMatchesContext(publicationPlan.owner, ownerContext, {
      requireOwnerIdentity: true,
      requireContextIdentity: true,
      requireContextGeneration: publicationPlan.owner?.generation != null
    })) return false;
    if(typeof ownerContext.canCommit === 'function' && ownerContext.canCommit() === false) return false;
    const resizerApi = target.__sharedResizableBoxApi || null;
    if(typeof resizerApi?.canCommitCartesianLayout === 'function'
      && resizerApi.canCommitCartesianLayout(publicationPlan, ownerContext) === false){
      return false;
    }
    if(typeof ownerContext.canCommit === 'function' && ownerContext.canCommit() === false) return false;
    const projectionTargets = [ownerContext.projectionTarget]
      .concat(Array.isArray(ownerContext.projectionTargets) ? ownerContext.projectionTargets : [])
      .filter(Boolean);
    try{
      // The renderer stages both graph content and presentation. Commit the
      // owner frame only after owner + resizer preflight, then publish the
      // presentation synchronously in the same owner turn. This prevents a
      // stale measurement from exposing a new frame without its matching plan.
      if(typeof ownerContext.commitFrame === 'function'
        && ownerContext.commitFrame(publicationPlan) === false){
        return false;
      }
      if(typeof ownerContext.commitPresentation === 'function'
        && ownerContext.commitPresentation(publicationPlan) === false){
        return false;
      }
      publicationPlan = mergeViewportReservesIntoPlan(publicationPlan, projectionTargets);
      if(typeof resizerApi?.commitCartesianLayout === 'function'
        && resizerApi.commitCartesianLayout(publicationPlan, { ...ownerContext, __cartesianPreflightPlan: publicationPlan }) === false){
        return false;
      }
      target.__cartesianLayoutPlan = publicationPlan;
      writeDataset(target, publicationPlan, ownerContext);
      Array.from(new Set(projectionTargets)).forEach(node => {
        node.__cartesianLayoutPlan = publicationPlan;
        writeDataset(node, publicationPlan, ownerContext);
      });
      ownerContext.onPublished?.({
        version: publicationPlan.version,
        owner: publicationPlan.owner,
        userFrame: publicationPlan.userFrame,
        plotRect: publicationPlan.plotRect,
        contentEnvelope: publicationPlan.contentEnvelope,
        generation: publicationPlan.publication.generation
      });
      return true;
    }catch(_err){
      return false;
    }
  };

  namespace.readPublishedPlan = function readPublishedPlan(target, ownerContext = {}){
    const plan = target?.__cartesianLayoutPlan || null;
    if(!plan || plan.publication?.complete !== true) return null;
    return ownerMatchesContext(plan.owner, ownerContext, { requireOwnerIdentity: true }) ? plan : null;
  };

  function datasetNumber(dataset, key){
    const number = Number(dataset?.[key]);
    return Number.isFinite(number) ? number : null;
  }

  function findPublishedSource(root){
    if(root?.dataset?.cartesianLayoutComplete === 'true') return root;
    return root?.querySelector?.('[data-cartesian-layout-complete="true"]') || null;
  }

  namespace.capturePublicationProvenance = function capturePublicationProvenance(root, ownerContext = {}){
    const source = findPublishedSource(root);
    const dataset = source?.dataset;
    if(!dataset) return null;
    const owner = {
      tabId: dataset.cartesianLayoutTabId || null,
      component: dataset.cartesianLayoutComponent || null,
      generation: datasetNumber(dataset, 'cartesianPublicationGeneration') ?? datasetNumber(dataset, 'cartesianLayoutGeneration')
    };
    if(!ownerMatchesContext(owner, ownerContext, { requireOwnerIdentity: true })) return null;
    const expectedPayload = ownerContext.payloadSignature ?? null;
    const expectedLayout = ownerContext.layoutSignature ?? null;
    if(expectedPayload != null && dataset.cartesianPayloadSignature != null && String(expectedPayload) !== String(dataset.cartesianPayloadSignature)) return null;
    if(expectedLayout != null && dataset.cartesianLayoutSignature != null && String(expectedLayout) !== String(dataset.cartesianLayoutSignature)) return null;
    return deepFreeze({
      version: datasetNumber(dataset, 'cartesianLayoutVersion') || PLAN_VERSION,
      owner,
      payloadSignature: dataset.cartesianPayloadSignature || null,
      layoutSignature: dataset.cartesianLayoutSignature || null,
      publicationGeneration: owner.generation,
      complete: true
    });
  };

  namespace.attachRenderCacheProvenance = function attachRenderCacheProvenance(metadata, root, ownerContext = {}){
    if(!metadata || typeof metadata !== 'object') return metadata;
    const provenance = namespace.capturePublicationProvenance(root, ownerContext);
    return provenance ? { ...metadata, cartesianLayout: provenance } : metadata;
  };

  namespace.rehydratePublishedLayout = function rehydratePublishedLayout(target, sourceRoot, ownerContext = {}){
    const source = findPublishedSource(sourceRoot);
    const dataset = source?.dataset;
    if(!target || !dataset) return false;
    const sourceOwner = {
      tabId: dataset.cartesianLayoutTabId || null,
      component: dataset.cartesianLayoutComponent || null,
      generation: datasetNumber(dataset, 'cartesianPublicationGeneration') ?? datasetNumber(dataset, 'cartesianLayoutGeneration')
    };
    const requestedOwner = normalizeOwner(ownerContext);
    if(sourceOwner.tabId && requestedOwner.tabId && sourceOwner.tabId !== requestedOwner.tabId) return false;
    if(sourceOwner.component && requestedOwner.component && sourceOwner.component !== requestedOwner.component) return false;
    if(typeof ownerContext.canCommit === 'function' && ownerContext.canCommit() === false) return false;
    const expectedPayload = ownerContext.payloadSignature ?? null;
    const expectedLayout = ownerContext.layoutSignature ?? null;
    if(expectedPayload != null && dataset.cartesianPayloadSignature != null && String(expectedPayload) !== String(dataset.cartesianPayloadSignature)) return false;
    if(expectedLayout != null && dataset.cartesianLayoutSignature != null && String(expectedLayout) !== String(dataset.cartesianLayoutSignature)) return false;

    const userFrame = {
      width: datasetNumber(dataset, 'cartesianUserWidth'),
      height: datasetNumber(dataset, 'cartesianUserHeight')
    };
    const baselineMargins = {
      top: datasetNumber(dataset, 'cartesianBaselineTop'),
      right: datasetNumber(dataset, 'cartesianBaselineRight'),
      bottom: datasetNumber(dataset, 'cartesianBaselineBottom'),
      left: datasetNumber(dataset, 'cartesianBaselineLeft')
    };
    const requiredMargins = {
      top: datasetNumber(dataset, 'cartesianRequiredTop') ?? baselineMargins.top,
      right: datasetNumber(dataset, 'cartesianRequiredRight') ?? baselineMargins.right,
      bottom: datasetNumber(dataset, 'cartesianRequiredBottom') ?? baselineMargins.bottom,
      left: datasetNumber(dataset, 'cartesianRequiredLeft') ?? baselineMargins.left
    };
    const plotRect = {
      x: datasetNumber(dataset, 'cartesianPlotX'),
      y: datasetNumber(dataset, 'cartesianPlotY'),
      width: datasetNumber(dataset, 'cartesianPlotWidth'),
      height: datasetNumber(dataset, 'cartesianPlotHeight')
    };
    const plotTranslation = {
      x: datasetNumber(dataset, 'cartesianPlotTranslationX') || 0,
      y: datasetNumber(dataset, 'cartesianPlotTranslationY') || 0
    };
    const envelope = {
      minX: datasetNumber(dataset, 'cartesianEnvelopeMinX'),
      minY: datasetNumber(dataset, 'cartesianEnvelopeMinY'),
      maxX: datasetNumber(dataset, 'cartesianEnvelopeMaxX'),
      maxY: datasetNumber(dataset, 'cartesianEnvelopeMaxY')
    };
    if(!(userFrame.width > 0) || !(userFrame.height > 0) || !(plotRect.width > 0) || !(plotRect.height > 0)
      || SIDES.some(side => !(baselineMargins[side] >= 0)) || !Object.values(envelope).every(Number.isFinite)){
      return false;
    }

    const reboundOwner = {
      tabId: requestedOwner.tabId || sourceOwner.tabId,
      component: requestedOwner.component || sourceOwner.component,
      generation: requestedOwner.generation
    };
    const minimumPlot = {
      width: datasetNumber(dataset, 'cartesianMinimumPlotWidth') || 1,
      height: datasetNumber(dataset, 'cartesianMinimumPlotHeight') || 1
    };
    const axisFrameModel = {
      x: {
        count: datasetNumber(dataset, 'cartesianAxisXCount') || 1,
        fixed: datasetNumber(dataset, 'cartesianAxisXFixed') ?? (userFrame.width - plotRect.width),
        minimum: datasetNumber(dataset, 'cartesianAxisXMinimum') || minimumPlot.width
      },
      y: {
        count: datasetNumber(dataset, 'cartesianAxisYCount') || 1,
        fixed: datasetNumber(dataset, 'cartesianAxisYFixed') ?? (userFrame.height - plotRect.height),
        minimum: datasetNumber(dataset, 'cartesianAxisYMinimum') || minimumPlot.height
      }
    };
    const axisLengths = {
      x: datasetNumber(dataset, 'cartesianAxisLengthX') || plotRect.width,
      y: datasetNumber(dataset, 'cartesianAxisLengthY') || plotRect.height
    };
    const renderedRatio = datasetNumber(dataset, 'cartesianLockRenderedRatio') || (axisLengths.x / axisLengths.y);
    const frameInsets = {
      horizontal: datasetNumber(dataset, 'cartesianLockInsetHorizontal') ?? (userFrame.width - plotRect.width),
      vertical: datasetNumber(dataset, 'cartesianLockInsetVertical') ?? (userFrame.height - plotRect.height),
      left: datasetNumber(dataset, 'cartesianLockInsetLeft') ?? plotRect.x,
      top: datasetNumber(dataset, 'cartesianLockInsetTop') ?? plotRect.y,
      right: (datasetNumber(dataset, 'cartesianLockInsetHorizontal') ?? (userFrame.width - plotRect.width))
        - (datasetNumber(dataset, 'cartesianLockInsetLeft') ?? plotRect.x),
      bottom: (datasetNumber(dataset, 'cartesianLockInsetVertical') ?? (userFrame.height - plotRect.height))
        - (datasetNumber(dataset, 'cartesianLockInsetTop') ?? plotRect.y)
    };
    const reserves = namespace.composeAutomaticReserves({ baselineMargins, requiredMargins });
    const plan = deepFreeze({
      version: datasetNumber(dataset, 'cartesianLayoutVersion') || PLAN_VERSION,
      owner: reboundOwner,
      orientation: dataset.cartesianOrientation === 'flipped' ? 'flipped' : 'normal',
      userFrame,
      baselineMargins,
      requiredMargins,
      resolvedMargins: {
        top: Math.max(baselineMargins.top, requiredMargins.top),
        right: Math.max(baselineMargins.right, requiredMargins.right),
        bottom: Math.max(baselineMargins.bottom, requiredMargins.bottom),
        left: Math.max(baselineMargins.left, requiredMargins.left)
      },
      automaticReserves: reserves,
      basePlotRect: buildBasePlot(userFrame, baselineMargins),
      plotRect,
      plotTranslation,
      axisLengths,
      axisFrameModel,
      contentEnvelope: {
        ...envelope,
        width: envelope.maxX - envelope.minX,
        height: envelope.maxY - envelope.minY,
        baseOffsetX: -envelope.minX,
        baseOffsetY: -envelope.minY,
        extensionTop: Math.max(0, -envelope.minY),
        extensionRight: Math.max(0, envelope.maxX - userFrame.width),
        extensionBottom: Math.max(0, envelope.maxY - userFrame.height),
        extensionLeft: Math.max(0, -envelope.minX),
        extensionWidth: Math.max(0, -envelope.minX) + Math.max(0, envelope.maxX - userFrame.width),
        extensionHeight: Math.max(0, -envelope.minY) + Math.max(0, envelope.maxY - userFrame.height)
      },
      lock: {
        enabled: dataset.cartesianLockEnabled === 'true',
        targetRatio: datasetNumber(dataset, 'cartesianLockTargetRatio') || renderedRatio,
        renderedRatio,
        drive: dataset.cartesianLockDrive === 'width' || dataset.cartesianLockDrive === 'height' ? dataset.cartesianLockDrive : 'both',
        frameInsets
      },
      plotConstraint: {
        applied: dataset.cartesianPlotConstraintApplied === 'true',
        type: dataset.cartesianPlotConstraintType || null,
        ratio: datasetNumber(dataset, 'cartesianPlotConstraintRatio'),
        fit: dataset.cartesianPlotConstraintFit || null
      },
      minimumPlot,
      minimumPlotSatisfied: plotRect.width >= minimumPlot.width && plotRect.height >= minimumPlot.height,
      publication: {
        owner: reboundOwner,
        generation: reboundOwner.generation,
        sourceGeneration: sourceOwner.generation,
        complete: true,
        planVersion: datasetNumber(dataset, 'cartesianLayoutVersion') || PLAN_VERSION,
        rehydrated: true
      },
      diagnostics: ['rehydrated-derived-layout']
    });
    return namespace.publishCartesianLayout(target, plan, {
      ...ownerContext,
      tabId: reboundOwner.tabId,
      component: reboundOwner.component,
      generation: reboundOwner.generation
    });
  };

  namespace.clearPublishedLayout = function clearPublishedLayout(target, ownerContext = {}){
    if(!target) return false;
    const requestedOwner = normalizeOwner(ownerContext);
    const nodes = [target].concat(Array.from(target.querySelectorAll?.('[data-cartesian-layout-complete="true"]') || []));
    const ownedNodes = nodes.filter(node => {
      const planOwner = node?.__cartesianLayoutPlan?.owner || null;
      const datasetOwner = node?.dataset ? {
        tabId: node.dataset.cartesianLayoutTabId || null,
        component: node.dataset.cartesianLayoutComponent || null,
        generation: datasetNumber(node.dataset, 'cartesianPublicationGeneration') ?? datasetNumber(node.dataset, 'cartesianLayoutGeneration')
      } : null;
      const publishedOwner = planOwner || datasetOwner;
      if(!publishedOwner) return node === target;
      return sameOwnerIdentity(publishedOwner, requestedOwner);
    });
    const foreignPublication = nodes.some(node => {
      const publishedOwner = node?.__cartesianLayoutPlan?.owner || (node?.dataset ? {
        tabId: node.dataset.cartesianLayoutTabId || null,
        component: node.dataset.cartesianLayoutComponent || null
      } : null);
      return publishedOwner && !sameOwnerIdentity(publishedOwner, requestedOwner);
    });
    if(foreignPublication) return false;
    try{
      ownedNodes.forEach(node => {
        delete node.__cartesianLayoutPlan;
        clearDataset(node);
      });
      const resizerApi = target.__sharedResizableBoxApi || null;
      if(typeof resizerApi?.clearCartesianLayout === 'function'
        && resizerApi.clearCartesianLayout(ownerContext) === false){
        return false;
      }
      return true;
    }catch(_err){
      return false;
    }
  };

  namespace.DATASET_KEYS = DATASET_KEYS;
  namespace.PLAN_VERSION = PLAN_VERSION;
})(window);
