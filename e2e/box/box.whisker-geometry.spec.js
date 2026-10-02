const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

for (const graphType of ['box', 'notched']) {
  for (const flipAxes of [false, true]) {
    test(`${graphType} whiskers stay outside interpolated quartiles (${flipAxes ? 'horizontal' : 'vertical'})`, async ({ page }) => {
      test.setTimeout(90_000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
      const root = page.locator('#boxPage:not([hidden])');
      await root.locator('#boxGraphType').selectOption(graphType);
      await root.locator('#boxPointMode').selectOption('none');
      await root.locator('#boxWhiskerRule').selectOption('iqr15');
      await root.locator('#boxFlipAxes').setChecked(flipAxes);

      for (const values of [[1, 4, 4, 50], [1, 4, 8, 50], [1, 4, 4, 500], [-50, -4, -4, -1], [1, 4, 200, 500]]) {
        await test.step(`values ${values.join(', ')}`, async () => {
          await page.evaluate(async data => {
            const box = window.Components.box;
            const state = box.__getState();
            const hot = state.ensureHotForActiveTab?.() || state.hot;
            hot.setDataAtCell(data.map((value, index) => [index + 1, 0, value]), 'e2e-whisker-geometry');
            await box.draw({ force: true, reason: 'e2e-whisker-geometry' });
          }, values);

          await expect.poll(() => page.evaluate(() => {
            const traces = window.Components.box.__getState().cachedDrawInput?.traces || [];
            return traces.find(trace => trace.columnIndex === 0)?.rawY;
          })).toEqual(values);

          const svg = root.locator('#boxPlot svg:not([data-box-pending-render="1"]):not([aria-hidden="true"])');
          await expect(svg.locator('[data-box-overlay-kind="box-whiskers"]')).toHaveCount(1);
          const geometry = await svg.evaluate(node => {
            const path = node.querySelector('[data-box-overlay-kind="box-whiskers"]');
            const numbers = path.getAttribute('d').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
            const segments = [];
            for (let i = 0; i < numbers.length; i += 4) segments.push(numbers.slice(i, i + 4));
            const bounds = node.querySelector('[data-box-shape="body"]').getBBox();
            return { segments, body: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
          });
          expect(geometry.segments).toHaveLength(4);
          const lowerIndex = flipAxes ? 0 : 1;
          const upperIndex = flipAxes ? 1 : 0;
          const valueIndex = flipAxes ? 0 : 1;
          const length = segment => Math.abs(segment[valueIndex] - segment[valueIndex + 2]);
          const hasOuterUpperObservation = values[2] === 200;
          const collapsedIndex = values[0] < 0 ? lowerIndex : upperIndex;
          if (hasOuterUpperObservation) {
            expect(length(geometry.segments[upperIndex])).toBeGreaterThan(1);
          } else {
            expect(length(geometry.segments[collapsedIndex])).toBeCloseTo(0, 8);
            const cap = geometry.segments[collapsedIndex + 2];
            expect(cap[valueIndex]).toBeCloseTo(geometry.segments[collapsedIndex][valueIndex], 8);
            if (graphType === 'box') {
              const { body } = geometry;
              const edge = flipAxes
                ? (values[0] < 0 ? body.x : body.x + body.width)
                : (values[0] < 0 ? body.y + body.height : body.y);
              expect(cap[valueIndex]).toBeCloseTo(edge, 3);
            }
          }
        });
      }
      expect(issues.critical).toEqual([]);
    });
  }
}
