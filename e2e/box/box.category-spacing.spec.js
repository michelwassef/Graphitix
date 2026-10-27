const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { selectReplicateMode } = require('../helpers/uiDriver');

for (const flipAxes of [false, true]) {
  test(`Box category proportions survive resize (${flipAxes ? 'horizontal' : 'vertical'})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1800, height: 1200 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
    const root = page.locator('#boxPage:not([hidden])');
    const settle = () => waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requirePublished: true, requireIdle: true });
    await settle();
    await root.locator('#boxGraphType').selectOption('box');
    await root.locator('#boxPointMode').selectOption('none');
    await root.locator('#boxFlipAxes').setChecked(flipAxes);
    await settle();

    const check = async (kind, count, fullWidth = true, equalGaps = false) => {
      await settle();
      const geometry = await root.locator('#boxPlot svg:not([data-box-pending-render="1"]):not([aria-hidden="true"])').evaluate((svg, horizontal) => {
        const axis = horizontal ? 'y' : 'x';
        const coord = horizontal ? 'y' : 'x';
        const line = svg.querySelector(`[data-box-primary-axis="${axis}"]`);
        const ticks = Array.from(svg.querySelectorAll(`[data-box-major-tick-axis="${axis}"]`), node => Number(node.getAttribute(`${coord}1`))).sort((a, b) => a - b);
        const start = Number(line.getAttribute(`${coord}1`));
        const end = Number(line.getAttribute(`${coord}2`));
        const pitch = ticks.length > 1 ? ticks[1] - ticks[0] : (end - start) / (4 / 3);
        const bodies = Array.from(svg.querySelectorAll('[data-box-shape="body"]:not(line):not([data-summary-line="1"]):not([data-box-violin-summary])'), node => {
          const bounds = node.getBBox();
          return { trace: node.getAttribute('data-trace'), start: horizontal ? bounds.y : bounds.x, size: horizontal ? bounds.height : bounds.width };
        }).sort((a, b) => a.start - b.start);
        const caps = Array.from(svg.querySelectorAll('[data-box-overlay-kind="box-whiskers"], [data-box-overlay-kind="bar-error"]')).flatMap(node => {
          const numbers = node.getAttribute('d').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
          const body = bodies.find(body => body.trace === node.getAttribute('data-trace'));
          const lengths = [];
          for (let i = 0; i < numbers.length; i += 4) {
            const cross = horizontal ? Math.abs(numbers[i + 3] - numbers[i + 1]) : Math.abs(numbers[i + 2] - numbers[i]);
            if (cross > 0.001) lengths.push({ width: cross, bodyWidth: body?.size });
          }
          return lengths;
        });
        const summaries = Array.from(svg.querySelectorAll('g[data-summary]')).map(group => {
          const spans = Array.from(group.querySelectorAll('line[data-summary-line="1"]'), line => Math.abs(Number(line.getAttribute(`${coord}2`)) - Number(line.getAttribute(`${coord}1`)))).filter(width => width > 0.001).sort((a, b) => a - b);
          return spans;
        }).filter(spans => spans.length);
        const gaps = bodies.length ? [bodies[0].start - start, ...bodies.slice(1).map((body, i) => body.start - bodies[i].start - bodies[i].size), end - bodies.at(-1).start - bodies.at(-1).size] : [];
        return { ticks, gaps, caps, summaries, pitch, startGap: (ticks[0] - start) / pitch, endGap: (end - ticks.at(-1)) / pitch, widths: bodies.map(body => body.size / pitch), span: end - start };
      }, flipAxes);
      expect(geometry.ticks).toHaveLength(count);
      expect(geometry.startGap).toBeCloseTo(2 / 3, 5);
      expect(geometry.endGap).toBeCloseTo(2 / 3, 5);
      if (kind === 'strip') {
        expect(geometry.summaries.length).toBeGreaterThanOrEqual(count);
        for (const spans of geometry.summaries) {
          expect(spans).toHaveLength(3);
          const width = spans.at(-1);
          expect(spans[0] / width).toBeCloseTo(0.5, 5);
          expect(spans[1] / width).toBeCloseTo(0.5, 5);
          if (fullWidth) expect(width / geometry.pitch).toBeCloseTo(2 / 3, 5);
        }
      } else if (kind !== 'violin') {
        expect(geometry.caps.length).toBeGreaterThanOrEqual(count);
        for (const cap of geometry.caps) {
          // Horizontal bar outlines are inset by half the border stroke.
          expect(Math.abs(cap.width - cap.bodyWidth / 2)).toBeLessThanOrEqual(0.6);
        }
      }
      if (kind !== 'strip') {
        expect(geometry.widths.length).toBeGreaterThanOrEqual(count);
        for (const width of geometry.widths) expect(width).toBeLessThanOrEqual(2 / 3 + 0.00001);
        // Horizontal bars inset their outline by half its stroke width.
        if (fullWidth) expect(Math.max(...geometry.widths)).toBeGreaterThan(2 / 3 - 0.03);
        if (equalGaps) {
          expect(geometry.gaps).toHaveLength(count + 1);
          // Allow the existing horizontal-bar outline inset and SVG rounding.
          expect(Math.max(...geometry.gaps) - Math.min(...geometry.gaps)).toBeLessThanOrEqual(1.5);
        }
      }
      return geometry;
    };

    for (const count of [1, 4]) {
      await page.evaluate(async n => {
        const box = window.Components.box;
        const state = box.__getState();
        const hot = state.ensureHotForActiveTab?.() || state.hot;
        hot.loadData([Array.from({ length: n }, (_, i) => `Group ${i + 1}`), ...Array.from({ length: 12 }, (_, row) => Array.from({ length: n }, (_, col) => row + col + 1))]);
        await box.draw({ force: true, reason: 'category-spacing-contract' });
      }, count);
      for (const [index, kind] of ['strip', 'bar', 'box', 'notched', 'violin'].entries()) {
        await root.locator('#boxGraphType').selectOption(kind);
        if (kind === 'strip') await root.locator('#boxIndividualSummary').selectOption(count === 1 ? 'mean-sd' : 'median-iqr');
        const before = await check(kind, count, true, true);
        const handle = root.locator(flipAxes ? '.svgbox .resizer-horizontal' : '.svgbox .resizer-vertical').first();
        const bounds = await handle.boundingBox();
        expect(bounds).toBeTruthy();
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        const delta = index % 2 ? -60 : 60;
        await page.mouse.move(x + (flipAxes ? 0 : delta), y + (flipAxes ? delta : 0), { steps: 5 });
        await check(kind, count, true, true);
        await page.mouse.up();
        const after = await check(kind, count, true, true);
        expect(Math.abs(after.span - before.span)).toBeGreaterThan(20);
      }
    }
    await selectReplicateMode(page, 'box', 'grouped');
    await root.locator('#boxGroupedReplicates').fill('2');
    await root.locator('#boxGroupedReplicates').press('Enter');
    await page.evaluate(async () => {
      const box = window.Components.box;
      const state = box.__getState();
      const hot = state.ensureHotForActiveTab?.() || state.hot;
      hot.loadData([['A', '', 'B', ''], ['C1', 'C2', 'C1', 'C2'], ...Array.from({ length: 12 }, (_, row) => [row + 1, row + 2, row + 3, row + 4])]);
      await box.draw({ force: true, reason: 'grouped-category-spacing-contract' });
    });
    for (const layout of ['interleaved', 'separated', 'stacked']) {
      for (const kind of layout === 'stacked' ? ['bar'] : ['strip', 'bar', 'box', 'notched', 'violin']) {
        await root.locator('#boxGraphType').selectOption(kind);
        await root.locator('#boxLayoutMode').selectOption(layout);
        await check(kind, layout === 'separated' ? 4 : 2, layout !== 'interleaved');
      }
    }
    await root.locator('#boxGroupedReplicates').fill('1');
    await root.locator('#boxGroupedReplicates').press('Enter');
    await page.evaluate(async () => {
      const box = window.Components.box;
      const state = box.__getState();
      const hot = state.ensureHotForActiveTab?.() || state.hot;
      hot.loadData([['A', 'B'], ['C1', 'C1'], [1, 2], [3, 4], [5, 6]]);
      await box.draw({ force: true, reason: 'single-condition-group-spacing-contract' });
    });
    await root.locator('#boxLayoutMode').selectOption('separated');
    await check('bar', 2, true, true);
    await page.screenshot({ path: `artifacts/box-category-spacing-${flipAxes ? 'horizontal' : 'vertical'}.png` });
  });
}
