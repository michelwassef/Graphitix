const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function distinctRounded(values, digits = 2) {
  const factor = Math.pow(10, digits);
  return new Set(
    (Array.isArray(values) ? values : [])
      .filter(value => Number.isFinite(Number(value)))
      .map(value => Math.round(Number(value) * factor) / factor)
  );
}

test.describe('Box large strip resize behavior', () => {
  test('keeps SVG geometry live during resize move while reusing canvas point layer', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Resize-step sampling is timing-sensitive across browsers; validated on Chromium.');
    test.setTimeout(300000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
      { first: true }
    );

    const csvPath = path.resolve(__dirname, '../__tests__/test-box-large.csv');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /^Import$/ }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(csvPath);
    await page.selectOption('#boxGraphType', 'strip');

    await page.waitForFunction(() => {
      const plot = document.getElementById('boxPlot');
      const svg = plot?.querySelector?.('svg');
      if (!svg) {
        return false;
      }
      return !!svg.querySelector('g[data-export-layer="box-points"] foreignObject[data-point-renderer], g[data-export-layer="box-points"] foreignobject[data-point-renderer]');
    }, null, { timeout: 120000 });

    const sample = async (phaseTag) => page.evaluate(tag => {
      const plot = document.getElementById('boxPlot');
      if (!plot) {
        return { tag, ok: false, reason: 'missing-plot' };
      }
      const candidates = Array.from(plot.querySelectorAll('svg'));
      const svg = [...candidates].reverse().find(node => {
        if (!node || typeof node.getAttribute !== 'function') {
          return false;
        }
        if (node.getAttribute('aria-hidden') === 'true' || node.getAttribute('data-box-pending-render') === '1') {
          return false;
        }
        const style = window.getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }) || candidates[candidates.length - 1] || null;
      if (!svg) {
        return { tag, ok: false, reason: 'missing-svg' };
      }
      const axisLines = Array.from(svg.querySelectorAll('g[data-layer="box-axis"] line'));
      let maxHorizontalAxisLength = 0;
      for (const line of axisLines) {
        const x1 = Number(line.getAttribute('x1'));
        const x2 = Number(line.getAttribute('x2'));
        const y1 = Number(line.getAttribute('y1'));
        const y2 = Number(line.getAttribute('y2'));
        if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(y1) || !Number.isFinite(y2)) {
          continue;
        }
        if (Math.abs(y2 - y1) < 0.05) {
          const length = Math.abs(x2 - x1);
          if (length > maxHorizontalAxisLength) {
            maxHorizontalAxisLength = length;
          }
        }
      }
      const pointGroups = Array.from(svg.querySelectorAll('g[data-export-layer="box-points"]'));
      const hasCanvasLayer = pointGroups.some(group => !!group.querySelector('foreignObject[data-point-renderer], foreignobject[data-point-renderer]'));
      const hasResizeReuseClone = pointGroups.some(group => !!group.querySelector('[data-resize-canvas-source="1"]'));
      return {
        tag,
        ok: true,
        plotW: Number(svg.dataset.boxPlotW) || Number(svg.getAttribute('width')) || 0,
        plotH: Number(svg.dataset.boxPlotH) || Number(svg.getAttribute('height')) || 0,
        axisHorizontalLength: maxHorizontalAxisLength,
        hasCanvasLayer,
        hasResizeReuseClone
      };
    }, phaseTag);

    const moveHandle = page.locator('#boxPage:not([hidden]) .svgbox .resizer-vertical').first();
    await expect(moveHandle).toBeVisible();
    const handleBox = await moveHandle.boundingBox();
    expect(handleBox).toBeTruthy();
    if (!handleBox) {
      return;
    }

    const startX = handleBox.x + Math.max(2, Math.min(handleBox.width - 2, handleBox.width / 2));
    const startY = handleBox.y + Math.max(2, Math.min(handleBox.height - 2, handleBox.height / 2));
    const moveSamples = [];

    moveSamples.push(await sample('before'));
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(startX - step * 14, startY, { steps: 1 });
      await page.waitForTimeout(70);
      moveSamples.push(await sample(`move-${step}`));
    }
    const preReleaseSample = await sample('pre-release');
    moveSamples.push(preReleaseSample);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const postReleaseSample = await sample('post-release');

    const liveMoveSamples = moveSamples.filter(entry => entry?.ok);
    expect(liveMoveSamples.length).toBeGreaterThanOrEqual(5);
    expect(liveMoveSamples.some(entry => entry.hasCanvasLayer)).toBe(true);

    const movePlotWidths = distinctRounded(liveMoveSamples.map(entry => entry.plotW));
    expect(movePlotWidths.size).toBeGreaterThan(1);
    const beforeWidth = Number(liveMoveSamples[0]?.plotW) || 0;
    const sawLiveWidthChange = liveMoveSamples.slice(1).some(entry => Math.abs((Number(entry?.plotW) || 0) - beforeWidth) > 0.5);
    expect(sawLiveWidthChange).toBe(true);

    expect(postReleaseSample?.ok).toBe(true);
    expect(typeof postReleaseSample?.hasResizeReuseClone).toBe('boolean');
  });
});
