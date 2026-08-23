const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const PIE = { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' };

test('stacked Pie unlocked horizontal resize publishes one stable viewport per width', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, PIE, { first: true, loadExample: true });
  await page.locator('#piePage:not([hidden]) #pieChartType').selectOption('stacked');
  await page.waitForFunction(() =>
    document.querySelectorAll('#piePage:not([hidden]) #piePlot [data-pie-trace-mode="stacked"]').length > 0
  );
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const panel = document.querySelector('#piePage:not([hidden]) #pieGraphPanel');
    const sessionTarget = window.Components?.pie?.__internalStateBridge?.targets
      ?.find(target => target.key === 'projectedPieSession');
    let stateRef = sessionTarget?.get?.()?.state || null;
    window.__pieResizeOwnerStateReplacements = 0;
    window.__pieResizeTransientStatePublications = 0;
    window.__pieResizeOwnerStateSampling = true;
    window.__pieResizeGeometrySamples = [];
    const sampleOwnerState = () => {
      if (!window.__pieResizeOwnerStateSampling) return;
      const nextState = sessionTarget?.get?.()?.state || null;
      if (stateRef && nextState && nextState !== stateRef) {
        window.__pieResizeOwnerStateReplacements += 1;
      }
      stateRef = nextState;
      if (nextState?.resizeState?.active === true) {
        window.__pieResizeTransientStatePublications += 1;
      }
      const svg = panel?.querySelector('#piePlot svg#pieSvg');
      const bars = Array.from(svg?.querySelectorAll?.('[data-pie-trace-mode="stacked"]') || []);
      const box = panel?.querySelector('.svgbox');
      if (svg && bars.length) {
        const xs = bars.map(node => Number(node.getAttribute('x'))).filter(Number.isFinite);
        const widths = bars.map(node => Number(node.getAttribute('width'))).filter(Number.isFinite);
        window.__pieResizeGeometrySamples.push({
          boxWidth: box?.getBoundingClientRect?.().width || 0,
          svgWidth: svg.getBoundingClientRect().width,
          viewWidth: Number(svg.viewBox?.baseVal?.width) || 0,
          barX: xs.length ? Math.min(...xs) : 0,
          barWidth: widths[0] || 0,
          renderedBarWidth: bars[0]?.getBoundingClientRect?.().width || 0
        });
      }
      requestAnimationFrame(sampleOwnerState);
    };
    requestAnimationFrame(sampleOwnerState);
    window.__pieResizeOverlayPaints = [];
    const sample = () => {
      const overlay = panel?.querySelector('.venn-loading-overlay');
      if(overlay && !overlay.hidden && overlay.classList.contains('is-visible')) {
        window.__pieResizeOverlayPaints.push(performance.now());
      }
    };
    window.__pieResizeOverlayObserver = new MutationObserver(sample);
    window.__pieResizeOverlayObserver.observe(panel, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-hidden']
    });
  });

  const handle = page.locator('#piePage:not([hidden]) #pieGraphPanel .svgbox .resizer-vertical').first();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Pie graph resize handle is unavailable');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 40; step += 1) {
    await page.mouse.move(startX + step * 2, startY);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(50);
  const ownerState = await page.evaluate(() => {
    window.__pieResizeOwnerStateSampling = false;
    const samples = window.__pieResizeGeometrySamples || [];
    return {
      replacements: window.__pieResizeOwnerStateReplacements || 0,
      transientPublications: window.__pieResizeTransientStatePublications || 0,
      geometry: samples,
      liveGeometry: samples[samples.length - 1] || null
    };
  });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const settled = await page.evaluate(() => {
    window.__pieResizeOverlayObserver?.disconnect();
    const panel = document.querySelector('#piePage:not([hidden]) #pieGraphPanel');
    const box = panel?.querySelector('.svgbox');
    const svg = panel?.querySelector('#piePlot svg#pieSvg');
    const bar = svg?.querySelector('[data-pie-trace-mode="stacked"]');
    return {
      overlayPaints: window.__pieResizeOverlayPaints || [],
      boxWidth: box?.getBoundingClientRect?.().width || 0,
      viewWidth: Number(svg?.viewBox?.baseVal?.width) || 0,
      renderedBarWidth: bar?.getBoundingClientRect?.().width || 0
    };
  });
  const viewWidthsByBoxWidth = new Map();
  ownerState.geometry.forEach(sample => {
    const key = Math.round(sample.boxWidth);
    const widths = viewWidthsByBoxWidth.get(key) || [];
    widths.push(sample.viewWidth);
    viewWidthsByBoxWidth.set(key, widths);
  });
  const viewportSpreads = Array.from(viewWidthsByBoxWidth.values())
    .filter(widths => widths.length > 1)
    .map(widths => Math.max(...widths) - Math.min(...widths));
  expect(ownerState.replacements).toBe(0);
  expect(ownerState.transientPublications).toBe(0);
  expect(Math.max(0, ...viewportSpreads)).toBeLessThanOrEqual(2);
  expect(ownerState.liveGeometry).not.toBeNull();
  expect(Math.abs(ownerState.liveGeometry.boxWidth - settled.boxWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(ownerState.liveGeometry.viewWidth - settled.viewWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(ownerState.liveGeometry.renderedBarWidth - settled.renderedBarWidth)).toBeLessThanOrEqual(2);
  expect(settled.overlayPaints).toEqual([]);
  expect(issues.critical).toEqual([]);
});
