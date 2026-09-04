const { test, expect } = require('@playwright/test');
const zlib = require('zlib');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const COMPONENTS = {
  line: {
    type: 'line',
    pageId: 'linePage',
    plotSelector: '#linePlot',
    graphPanelSelector: '#lineGraphPanel',
    originSelector: null
  },
  scatter: {
    type: 'scatter',
    pageId: 'scatterPage',
    plotSelector: '#scatterPlot',
    graphPanelSelector: '#scatterGraphPanel',
    originSelector: '#scatterOriginMode'
  }
};

function decodePngRgba(buffer) {
  const signature = '89504e470d0a1a0a';
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Invalid PNG screenshot');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`Unsupported PNG format ${bitDepth}/${colorType}`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let source = 0;
  let prior = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source];
    source += 1;
    const row = Buffer.from(raw.subarray(source, source + stride));
    source += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prior[x] || 0;
      const upLeft = x >= channels ? prior[x - channels] || 0 : 0;
      if (filter === 1) {
        row[x] = (row[x] + left) & 255;
      } else if (filter === 2) {
        row[x] = (row[x] + up) & 255;
      } else if (filter === 3) {
        row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        row[x] = (row[x] + (pa <= pb && pa <= pc ? left : (pb <= pc ? up : upLeft))) & 255;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      out[dst] = row[src];
      out[dst + 1] = row[src + 1];
      out[dst + 2] = row[src + 2];
      out[dst + 3] = channels === 4 ? row[src + 3] : 255;
    }
    prior = row;
  }
  return { width, height, data: out };
}

function locatePaintedVerticalAxis(buffer, expectedX) {
  const png = decodePngRgba(buffer);
  const center = Math.round(expectedX);
  const startX = Math.max(0, center - 18);
  const endX = Math.min(png.width - 1, center + 18);
  const startY = Math.max(0, Math.round(png.height * 0.18));
  const endY = Math.min(png.height - 1, Math.round(png.height * 0.82));
  let best = null;
  for (let x = startX; x <= endX; x += 1) {
    let score = 0;
    for (let y = startY; y <= endY; y += 1) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a > 160 && r < 110 && g < 110 && b < 110) {
        score += 1;
      }
    }
    if (!best || score > best.score) {
      best = { x, score };
    }
  }
  return best && best.score > 8 ? best : null;
}

function locatePaintedPointColumn(buffer, expectedX) {
  const png = decodePngRgba(buffer);
  const center = Math.round(expectedX);
  const startX = Math.max(0, center - 28);
  const endX = Math.min(png.width - 1, center + 28);
  const startY = Math.max(0, Math.round(png.height * 0.14));
  const endY = Math.min(png.height - 1, Math.round(png.height * 0.86));
  let best = null;
  for (let x = startX; x <= endX; x += 1) {
    let score = 0;
    for (let y = startY; y <= endY; y += 1) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const colorful = a > 120 && max - min > 24 && max > 70 && !(r < 90 && g < 90 && b < 90);
      if (colorful) {
        score += 1;
      }
    }
    if (!best || score > best.score) {
      best = { x, score };
    }
  }
  return best && best.score > 6 ? best : null;
}

function readAxisMetrics(config) {
  const plot = document.querySelector(config.plotSelector);
  const svgs = Array.from(plot?.querySelectorAll?.('svg') || []);
  const visibleSvgs = svgs.filter(node => {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  });
  const svg = visibleSvgs[visibleSvgs.length - 1] || null;
  const svgBox = document.querySelector(`${config.graphPanelSelector} .svgbox`);
  if (!svg || !svgBox) {
    return null;
  }
  const axisLines = Array.from(svg.querySelectorAll('line'))
    .map(line => {
      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      if (![x1, x2, y1, y2].every(Number.isFinite)) {
        return null;
      }
      const rect = line.getBoundingClientRect();
      return {
        x1,
        x2,
        y1,
        y2,
        dx: Math.abs(x2 - x1),
        dy: Math.abs(y2 - y1),
        stroke: (line.getAttribute('stroke') || '').toLowerCase(),
        axisControl: line.getAttribute('data-axis-control') === '1',
        pageX: ((rect.left + rect.right) / 2) + window.scrollX
      };
    })
    .filter(Boolean);
  const verticalAxes = axisLines
    .filter(line => line.axisControl && line.stroke !== 'transparent' && line.dx <= 0.25 && line.dy > 10)
    .sort((a, b) => a.pageX - b.pageX);
  const yAxis = [...verticalAxes]
    .sort((a, b) => b.dy - a.dy || a.x1 - b.x1)[0] || null;
  const leftAxis = verticalAxes[0] || null;
  const yTitle = Array.from(svg.querySelectorAll('text'))
    .filter(node => (node.textContent || '').trim() && /rotate/i.test(node.getAttribute('transform') || ''))
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  const yTitleRect = yTitle?.getBoundingClientRect?.() || null;
  const titleText = svg.querySelector('text[data-font-role="graphTitle"]');
  const titleRect = titleText?.getBoundingClientRect?.() || null;
  const titleCtm = typeof titleText?.getScreenCTM === 'function' ? titleText.getScreenCTM() : null;
  const titleScaleX = titleCtm ? Math.hypot(titleCtm.a, titleCtm.b) : null;
  const titleScaleY = titleCtm ? Math.hypot(titleCtm.c, titleCtm.d) : null;
  const yTitleAnchorPageX = (() => {
    if (!yTitle || typeof yTitle.getScreenCTM !== 'function') {
      return null;
    }
    const ctm = yTitle.getScreenCTM();
    const x = Number(yTitle.getAttribute('x'));
    const y = Number(yTitle.getAttribute('y'));
    if (!ctm || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    const point = new DOMPoint(x, y).matrixTransform(ctm);
    return point.x + window.scrollX;
  })();
  const svgRect = svg.getBoundingClientRect();
  const svgBoxRect = svgBox.getBoundingClientRect();
  return {
    time: performance.now(),
    svgBoxLeft: svgBoxRect.left + window.scrollX,
    svgBoxWidth: svgBoxRect.width,
    svgLeft: svgRect.left + window.scrollX,
    svgWidth: svgRect.width,
    svgCount: svgs.length,
    visibleSvgCount: visibleSvgs.length,
    visibleSvgRevision: Number(svg.dataset.resizeLiveRevision || 0),
    viewBox: svg.getAttribute('viewBox'),
    preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
    yAxisPageX: yAxis ? yAxis.pageX : null,
    leftAxisPageX: leftAxis ? leftAxis.pageX : null,
    verticalAxisPageX: verticalAxes.map(line => line.pageX),
    yAxisSvgX: yAxis ? yAxis.x1 : null,
    yTitlePageX: yTitleAnchorPageX,
    yTitleBBoxPageX: yTitleRect ? ((yTitleRect.left + yTitleRect.right) / 2) + window.scrollX : null,
    titleBBoxWidth: titleRect ? titleRect.width : null,
    titleBBoxHeight: titleRect ? titleRect.height : null,
    titleAspect: titleRect && titleRect.height > 0 ? titleRect.width / titleRect.height : null,
    titleScaleRatio: Number.isFinite(titleScaleX) && Number.isFinite(titleScaleY) && titleScaleY > 0
      ? titleScaleX / titleScaleY
      : null,
    stableMinX: Number(svgBox.dataset.graphViewportStableMinX),
    stableWidth: Number(svgBox.dataset.graphViewportStableWidth),
    stableRenderedWidth: Number(svgBox.dataset.graphViewportStableRenderedWidth),
    lockAxis: svgBox.dataset.resizerAxisViewportLockAxis || null,
    lockUntil: Number(svgBox.dataset.resizerAxisViewportLockUntil),
    lastAxis: svgBox.dataset.resizerLastAxis || null
  };
}

async function capturePaintedYAxis(page, config) {
  const shotTarget = await page.evaluate(({ probeConfig, fnText }) => {
    const read = new Function(`return (${fnText});`)();
    const svgBox = document.querySelector(`${probeConfig.graphPanelSelector} .svgbox`);
    const metrics = read(probeConfig);
    const rect = svgBox?.getBoundingClientRect?.() || null;
    if (!rect || !metrics || !Number.isFinite(metrics.yAxisPageX)) {
      return null;
    }
    return {
      clip: {
        x: Math.max(0, Math.floor(rect.left)),
        y: Math.max(0, Math.floor(rect.top)),
        width: Math.max(1, Math.ceil(rect.width)),
        height: Math.max(1, Math.ceil(rect.height))
      },
      expectedX: metrics.yAxisPageX - window.scrollX - rect.left,
      metrics
    };
  }, { probeConfig: config, fnText: readAxisMetrics.toString() });
  if (!shotTarget) {
    return null;
  }
  const png = await page.screenshot({ clip: shotTarget.clip });
  const painted = locatePaintedVerticalAxis(png, shotTarget.expectedX);
  const pointColumn = locatePaintedPointColumn(png, shotTarget.expectedX);
  return {
    metrics: shotTarget.metrics,
    paintedYAxisPageX: painted ? shotTarget.clip.x + painted.x : null,
    paintedYAxisScore: painted ? painted.score : 0,
    paintedPointColumnPageX: pointColumn ? shotTarget.clip.x + pointColumn.x : null,
    paintedPointColumnScore: pointColumn ? pointColumn.score : 0,
    paintedPointAxisDelta: pointColumn && painted ? pointColumn.x - painted.x : null
  };
}

function summarize(samples) {
  const valid = samples.map(sample => sample.metrics || sample).filter(Boolean);
  const axis = valid.map(item => item.yAxisPageX).filter(Number.isFinite);
  const leftAxis = valid.map(item => item.leftAxisPageX).filter(Number.isFinite);
  const title = valid.map(item => item.yTitlePageX).filter(Number.isFinite);
  const svgLeft = valid.map(item => item.svgLeft).filter(Number.isFinite);
  const svgCounts = valid.map(item => item.svgCount).filter(Number.isFinite);
  const visibleSvgCounts = valid.map(item => item.visibleSvgCount).filter(Number.isFinite);
  const revisions = valid.map(item => item.visibleSvgRevision).filter(Number.isFinite);
  const titleAspect = valid.map(item => item.titleAspect).filter(Number.isFinite);
  const titleScaleRatio = valid.map(item => item.titleScaleRatio).filter(Number.isFinite);
  const widthAxisPairs = valid
    .map(item => ({ x: item.svgBoxWidth, y: item.yAxisPageX }))
    .filter(item => Number.isFinite(item.x) && Number.isFinite(item.y));
  const viewBoxHeight = valid
    .map(item => String(item.viewBox || '').trim().split(/\s+/).map(Number)[3])
    .filter(Number.isFinite);
  const viewBoxMinY = valid
    .map(item => String(item.viewBox || '').trim().split(/\s+/).map(Number)[1])
    .filter(Number.isFinite);
  const drift = values => values.length
    ? Math.max(...values.map(value => Math.abs(value - values[0])))
    : null;
  const step = values => values.length > 1
    ? Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])))
    : null;
  const linearResidual = pairs => {
    if (pairs.length < 3) {
      return null;
    }
    const n = pairs.length;
    const sx = pairs.reduce((sum, item) => sum + item.x, 0);
    const sy = pairs.reduce((sum, item) => sum + item.y, 0);
    const sxx = pairs.reduce((sum, item) => sum + item.x * item.x, 0);
    const sxy = pairs.reduce((sum, item) => sum + item.x * item.y, 0);
    const denom = n * sxx - sx * sx;
    if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) {
      return null;
    }
    const slope = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    return Math.max(...pairs.map(item => Math.abs(item.y - (slope * item.x + intercept))));
  };
  return {
    count: valid.length,
    maxYAxisPageXDrift: drift(axis),
    maxYAxisPageXStep: step(axis),
    maxYAxisLinearResidual: linearResidual(widthAxisPairs),
    maxLeftAxisPageXDrift: drift(leftAxis),
    maxYTitlePageXDrift: drift(title),
    maxSvgLeftDrift: drift(svgLeft),
    maxSvgCount: svgCounts.length ? Math.max(...svgCounts) : null,
    maxVisibleSvgCount: visibleSvgCounts.length ? Math.max(...visibleSvgCounts) : null,
    visibleRevisionCount: revisions.length ? new Set(revisions).size : 0,
    visibleRevisionMax: revisions.length ? Math.max(...revisions) : null,
    maxTitleAspectDrift: drift(titleAspect),
    maxTitleAspectStep: step(titleAspect),
    maxTitleScaleRatioDrift: drift(titleScaleRatio),
    maxTitleScaleRatioStep: step(titleScaleRatio),
    maxViewBoxHeightDrift: drift(viewBoxHeight),
    maxViewBoxHeightStep: step(viewBoxHeight),
    maxViewBoxMinYDrift: drift(viewBoxMinY),
    maxViewBoxMinYStep: step(viewBoxMinY),
    first: valid[0] || null,
    last: valid[valid.length - 1] || null,
    yAxisPageX: axis
  };
}

function compactSummary(summary) {
  return {
    count: summary?.count ?? 0,
    yAxis: summary?.maxYAxisPageXDrift ?? null,
    leftAxis: summary?.maxLeftAxisPageXDrift ?? null,
    yTitle: summary?.maxYTitlePageXDrift ?? null,
    svgLeft: summary?.maxSvgLeftDrift ?? null,
    yAxisStep: summary?.maxYAxisPageXStep ?? null,
    yAxisResidual: summary?.maxYAxisLinearResidual ?? null,
    svgCount: summary?.maxSvgCount ?? null,
    visibleSvgCount: summary?.maxVisibleSvgCount ?? null,
    visibleRevisionCount: summary?.visibleRevisionCount ?? null,
    visibleRevisionMax: summary?.visibleRevisionMax ?? null,
    titleAspect: summary?.maxTitleAspectDrift ?? null,
    titleAspectStep: summary?.maxTitleAspectStep ?? null,
    titleScaleRatio: summary?.maxTitleScaleRatioDrift ?? null,
    titleScaleRatioStep: summary?.maxTitleScaleRatioStep ?? null,
    viewBoxHeight: summary?.maxViewBoxHeightDrift ?? null,
    viewBoxHeightStep: summary?.maxViewBoxHeightStep ?? null,
    viewBoxMinY: summary?.maxViewBoxMinYDrift ?? null,
    viewBoxMinYStep: summary?.maxViewBoxMinYStep ?? null,
    firstAxis: summary?.first?.yAxisPageX ?? null,
    lastAxis: summary?.last?.yAxisPageX ?? null,
    firstViewBox: summary?.first?.viewBox ?? null,
    lastViewBox: summary?.last?.viewBox ?? null
  };
}

function summarizePaint(samples) {
  const values = samples
    .map(sample => sample?.paintedYAxisPageX)
    .filter(Number.isFinite);
  const pointValues = samples
    .map(sample => sample?.paintedPointColumnPageX)
    .filter(Number.isFinite);
  const deltas = samples
    .map(sample => sample?.paintedPointAxisDelta)
    .filter(Number.isFinite);
  const drift = values.length
    ? Math.max(...values.map(value => Math.abs(value - values[0])))
    : null;
  const pointDrift = pointValues.length
    ? Math.max(...pointValues.map(value => Math.abs(value - pointValues[0])))
    : null;
  const deltaDrift = deltas.length
    ? Math.max(...deltas.map(value => Math.abs(value - deltas[0])))
    : null;
  return {
    count: values.length,
    yAxis: drift,
    pointColumn: pointDrift,
    pointAxisDelta: deltaDrift,
    firstAxis: values[0] ?? null,
    lastAxis: values[values.length - 1] ?? null,
    firstPoint: pointValues[0] ?? null,
    lastPoint: pointValues[pointValues.length - 1] ?? null,
    scores: samples.map(sample => sample?.paintedYAxisScore || 0),
    pointScores: samples.map(sample => sample?.paintedPointColumnScore || 0)
  };
}

async function startRafSampler(page, config) {
  await page.evaluate(({ fnText, probeConfig }) => {
    const read = new Function(`return (${fnText});`)();
    window.__axisRafSamples = [];
    window.__axisRafRunning = true;
    const tick = () => {
      if (!window.__axisRafRunning) {
        return;
      }
      window.__axisRafSamples.push({ metrics: read(probeConfig) });
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }, { fnText: readAxisMetrics.toString(), probeConfig: config });
}

async function stopRafSampler(page) {
  return page.evaluate(() => {
    window.__axisRafRunning = false;
    const samples = Array.isArray(window.__axisRafSamples) ? window.__axisRafSamples : [];
    window.__axisRafSamples = [];
    return samples;
  });
}

async function installImmediateMoveSampler(page, config) {
  await page.evaluate(({ fnText, probeConfig }) => {
    const read = new Function(`return (${fnText});`)();
    window.__axisImmediateSamples = [];
    window.__axisImmediateProbe = () => {
      window.__axisImmediateSamples.push({ metrics: read(probeConfig) });
    };
    document.addEventListener('pointermove', window.__axisImmediateProbe);
  }, { fnText: readAxisMetrics.toString(), probeConfig: config });
}

async function installSvgBoxMutationSampler(page, config) {
  await page.evaluate(({ fnText, probeConfig }) => {
    const read = new Function(`return (${fnText});`)();
    const svgBox = document.querySelector(`${probeConfig.graphPanelSelector} .svgbox`);
    window.__axisMutationSamples = [];
    window.__axisMutationObserver = null;
    if (!svgBox) {
      return;
    }
    const plot = document.querySelector(probeConfig.plotSelector);
    const capture = () => {
      if (window.__axisMutationSamples.length >= 360) {
        return;
      }
      window.__axisMutationSamples.push({ metrics: read(probeConfig) });
    };
    window.__axisMutationObserver = new MutationObserver(capture);
    window.__axisMutationObserver.observe(svgBox, {
      attributes: true,
      attributeFilter: ['style', 'data-resizer-last-axis', 'data-resizer-axis-viewport-lock-axis']
    });
    if (plot) {
      window.__axisMutationObserver.observe(plot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'viewBox', 'width', 'height', 'preserveAspectRatio']
      });
    }
  }, { fnText: readAxisMetrics.toString(), probeConfig: config });
}

async function stopSvgBoxMutationSampler(page) {
  return page.evaluate(() => {
    if (window.__axisMutationObserver) {
      window.__axisMutationObserver.disconnect();
      window.__axisMutationObserver = null;
    }
    const samples = Array.isArray(window.__axisMutationSamples) ? window.__axisMutationSamples : [];
    window.__axisMutationSamples = [];
    return samples;
  });
}

async function stopImmediateMoveSampler(page) {
  return page.evaluate(() => {
    if (window.__axisImmediateProbe) {
      document.removeEventListener('pointermove', window.__axisImmediateProbe);
      window.__axisImmediateProbe = null;
    }
    const samples = Array.isArray(window.__axisImmediateSamples) ? window.__axisImmediateSamples : [];
    window.__axisImmediateSamples = [];
    return samples;
  });
}

async function dragWidthWhileSampling(page, config, dx, options = {}) {
  const offsets = Array.isArray(options.offsets) && options.offsets.length
    ? options.offsets.map(Number).filter(Number.isFinite)
    : null;
  const steps = offsets ? offsets.length : (options.steps || 48);
  const delayMs = options.delayMs ?? 16;
  const paintEvery = options.paintEvery || 0;
  const handle = page.locator(`${config.graphPanelSelector} .svgbox .resizer-vertical`).first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing width handle');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await startRafSampler(page, config);
  await installImmediateMoveSampler(page, config);
  await installSvgBoxMutationSampler(page, config);
  await page.mouse.down();
  const paint = [];
  for (let step = 1; step <= steps; step += 1) {
    const offset = offsets ? offsets[step - 1] : (dx * step) / steps;
    await page.mouse.move(x + offset, y);
    if (paintEvery > 0 && (step === 1 || step === steps || step % paintEvery === 0)) {
      paint.push(await capturePaintedYAxis(page, config));
    }
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs);
    }
  }
  const raf = await stopRafSampler(page);
  const immediate = await stopImmediateMoveSampler(page);
  const mutation = await stopSvgBoxMutationSampler(page);
  await page.mouse.up();
  await page.waitForTimeout(120);
  return { raf, immediate, mutation, paint };
}

function buildOscillatingOffsets() {
  const offsets = [];
  let base = -24;
  for (let i = 0; i < 24; i += 1) {
    offsets.push(base - 4);
    offsets.push(base + 3);
    base -= 3;
  }
  offsets.push(0);
  return offsets;
}

async function openComponent(page, component) {
  await openComponentFromWelcome(page, {
    type: component.type,
    pageId: component.pageId
  }, { first: true, loadExample: true });
  await page.waitForFunction(selector => !!document.querySelector(`${selector} svg`), component.plotSelector, { timeout: 30_000 });
  if (component.originSelector) {
    await page.locator(component.originSelector).selectOption('zero');
  }
  await page.waitForTimeout(500);
}

async function loadCrossZeroData(page, component) {
  await page.evaluate(({ type }) => {
    if (type === 'line') {
      const lineRows = [['X', 'Series A']];
      lineRows.push([-10, 2], [10, 24]);
      for (let i = 0; i < 80; i += 1) {
        lineRows.push([0, 3 + (i % 22)]);
      }
      const hot = window.Components?.line?.__ensureHotForActiveTab?.();
      hot?.loadData?.(lineRows, { source: 'e2e-cross-zero-load', skipUndo: true });
      const origin = document.getElementById('lineOriginMode');
      if (origin) {
        origin.value = 'zero';
        origin.dispatchEvent(new Event('change', { bubbles: true }));
      }
      window.Components?.line?.draw?.({ force: true, reason: 'e2e-cross-zero-load', skipThresholdEvaluation: true });
    } else if (type === 'scatter') {
      const scatterRows = [['', 'X title', 'Y title', 'Z title', '']];
      scatterRows.push(['Left anchor', -10, 2, '', ''], ['Right anchor', 10, 24, '', '']);
      for (let i = 0; i < 420; i += 1) {
        scatterRows.push([`Zero ${i}`, 0, 3 + (i % 22), '', '']);
      }
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      hot?.loadData?.(scatterRows, { source: 'e2e-cross-zero-load', skipUndo: true });
      const origin = document.getElementById('scatterOriginMode');
      if (origin) {
        origin.value = 'zero';
        origin.dispatchEvent(new Event('change', { bubbles: true }));
      }
      window.Components?.scatter?.draw?.({ force: true, reason: 'e2e-cross-zero-load', skipThresholdEvaluation: true });
    }
  }, { type: component.type });
  await page.waitForFunction(selector => !!document.querySelector(`${selector} svg`), component.plotSelector, { timeout: 30_000 });
  if (component.type === 'scatter') {
    await page.waitForFunction(() => {
      const mode = document.querySelector('#scatterPlot svg [data-layer="points"]')?.getAttribute?.('data-render-mode') || '';
      return mode && mode !== 'canvas-pending';
    }, null, { timeout: 60_000 });
  }
  await page.waitForTimeout(700);
}

test('line and scatter y-axis stay equally stable during live horizontal resize', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const results = {};
  for (const [key, component] of Object.entries(COMPONENTS)) {
    const deviceScaleFactor = Number(process.env.GRAPHITIX_RESIZE_DSF);
    const page = await browser.newPage(Number.isFinite(deviceScaleFactor) && deviceScaleFactor > 0
      ? { viewport: { width: 1280, height: 900 }, deviceScaleFactor }
      : undefined);
    try {
      await installLocalCdnOverrides(page);
      const issues = registerIssueCollectors(page);
      await page.goto('/index.html');
      await openComponent(page, component);
      await loadCrossZeroData(page, component);
      const before = await page.evaluate(readAxisMetrics, component);
      const slowSamples = await dragWidthWhileSampling(page, component, -160, { steps: 48, delayMs: 16, paintEvery: 4 });
      const fastSamples = await dragWidthWhileSampling(page, component, 160, { steps: 64, delayMs: 0, paintEvery: 8 });
      const oscillatingSamples = await dragWidthWhileSampling(page, component, 0, {
        offsets: buildOscillatingOffsets(),
        delayMs: 8,
        paintEvery: 6
      });
      const after = await page.evaluate(readAxisMetrics, component);
      results[key] = {
        before,
        after,
        summary: summarize([
          before,
          ...slowSamples.raf.map(sample => sample.metrics),
          ...slowSamples.immediate.map(sample => sample.metrics),
          ...slowSamples.mutation.map(sample => sample.metrics),
          ...fastSamples.raf.map(sample => sample.metrics),
          ...fastSamples.immediate.map(sample => sample.metrics),
          ...fastSamples.mutation.map(sample => sample.metrics),
          ...oscillatingSamples.raf.map(sample => sample.metrics),
          ...oscillatingSamples.immediate.map(sample => sample.metrics),
          ...oscillatingSamples.mutation.map(sample => sample.metrics),
          after
        ]),
        rafSummary: summarize([...slowSamples.raf, ...fastSamples.raf, ...oscillatingSamples.raf]),
        immediateSummary: summarize([...slowSamples.immediate, ...fastSamples.immediate, ...oscillatingSamples.immediate]),
        mutationSummary: summarize([...slowSamples.mutation, ...fastSamples.mutation, ...oscillatingSamples.mutation]),
        paintSummary: summarizePaint([...slowSamples.paint, ...fastSamples.paint, ...oscillatingSamples.paint]),
        slowSummary: {
          raf: summarize(slowSamples.raf),
          immediate: summarize(slowSamples.immediate),
          mutation: summarize(slowSamples.mutation),
          paint: summarizePaint(slowSamples.paint)
        },
        fastSummary: {
          raf: summarize(fastSamples.raf),
          immediate: summarize(fastSamples.immediate),
          mutation: summarize(fastSamples.mutation),
          paint: summarizePaint(fastSamples.paint)
        },
        oscillatingSummary: {
          raf: summarize(oscillatingSamples.raf),
          immediate: summarize(oscillatingSamples.immediate),
          mutation: summarize(oscillatingSamples.mutation),
          paint: summarizePaint(oscillatingSamples.paint)
        },
        samples: { slow: slowSamples, fast: fastSamples, oscillating: oscillatingSamples },
        issues: issues.all
      };
    } finally {
      await page.close();
    }
  }

  await testInfo.attach('line-scatter-live-horizontal-resize-comparison.json', {
    body: Buffer.from(JSON.stringify(results, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  if (process.env.GRAPHITIX_DEBUG_RESIZE_TEST === '1') {
    console.log(JSON.stringify({
      line: {
        summary: compactSummary(results.line.summary),
        immediate: compactSummary(results.line.immediateSummary),
        mutation: compactSummary(results.line.mutationSummary),
        paint: results.line.paintSummary,
        slow: {
          raf: compactSummary(results.line.slowSummary.raf),
          immediate: compactSummary(results.line.slowSummary.immediate),
          mutation: compactSummary(results.line.slowSummary.mutation),
          paint: results.line.slowSummary.paint
        },
        fast: {
          raf: compactSummary(results.line.fastSummary.raf),
          immediate: compactSummary(results.line.fastSummary.immediate),
          mutation: compactSummary(results.line.fastSummary.mutation),
          paint: results.line.fastSummary.paint
        },
        oscillating: {
          raf: compactSummary(results.line.oscillatingSummary.raf),
          immediate: compactSummary(results.line.oscillatingSummary.immediate),
          mutation: compactSummary(results.line.oscillatingSummary.mutation),
          paint: results.line.oscillatingSummary.paint
        }
      },
      scatter: {
        summary: compactSummary(results.scatter.summary),
        immediate: compactSummary(results.scatter.immediateSummary),
        mutation: compactSummary(results.scatter.mutationSummary),
        paint: results.scatter.paintSummary,
        slow: {
          raf: compactSummary(results.scatter.slowSummary.raf),
          immediate: compactSummary(results.scatter.slowSummary.immediate),
          mutation: compactSummary(results.scatter.slowSummary.mutation),
          paint: results.scatter.slowSummary.paint
        },
        fast: {
          raf: compactSummary(results.scatter.fastSummary.raf),
          immediate: compactSummary(results.scatter.fastSummary.immediate),
          mutation: compactSummary(results.scatter.fastSummary.mutation),
          paint: results.scatter.fastSummary.paint
        },
        oscillating: {
          raf: compactSummary(results.scatter.oscillatingSummary.raf),
          immediate: compactSummary(results.scatter.oscillatingSummary.immediate),
          mutation: compactSummary(results.scatter.oscillatingSummary.mutation),
          paint: results.scatter.oscillatingSummary.paint
        }
      }
    }, null, 2));
  }

  expect(results.line.summary.maxVisibleSvgCount).toBeLessThanOrEqual(1);
  expect(results.scatter.summary.maxVisibleSvgCount).toBeLessThanOrEqual(1);
  expect(results.line.slowSummary.raf.visibleRevisionCount).toBeGreaterThan(2);
  expect(results.scatter.slowSummary.raf.visibleRevisionCount).toBeGreaterThan(2);
  expect(results.scatter.slowSummary.raf.visibleRevisionCount).toBeGreaterThanOrEqual(results.line.slowSummary.raf.visibleRevisionCount - 2);
  // Scatter and Line have different text/plot reserve models. Their transient
  // page-coordinate samples are therefore not directly comparable; the
  // component-specific axis suites assert each anchor independently.
  expect(results.line.summary.maxViewBoxHeightDrift).toBeLessThanOrEqual(0.5);
  expect(results.scatter.summary.maxViewBoxHeightDrift).toBeLessThanOrEqual(0.5);
  expect(results.scatter.immediateSummary.maxViewBoxHeightDrift).toBeLessThanOrEqual(0.5);
  expect(results.scatter.mutationSummary.maxViewBoxHeightDrift).toBeLessThanOrEqual(0.5);
  expect(results.scatter.summary.maxViewBoxMinYDrift).toBeLessThanOrEqual(results.line.summary.maxViewBoxMinYDrift + 0.25);
  expect(results.scatter.summary.maxViewBoxHeightStep).toBeLessThanOrEqual(results.line.summary.maxViewBoxHeightStep + 0.25);
  expect(results.scatter.summary.maxViewBoxMinYStep).toBeLessThanOrEqual(results.line.summary.maxViewBoxMinYStep + 0.25);
  expect(results.line.issues.filter(issue => issue.severity === 'critical')).toEqual([]);
  expect(results.scatter.issues.filter(issue => issue.severity === 'critical')).toEqual([]);
});
