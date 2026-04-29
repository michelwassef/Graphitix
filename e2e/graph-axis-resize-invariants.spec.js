const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function waitForGraphSvg(page, pageId) {
  await page.waitForFunction(
    ({ pageId }) => {
      const root = document.querySelector(`#${pageId}:not([hidden])`);
      const svg = root?.querySelector?.('.svgbox svg');
      const rect = svg?.getBoundingClientRect?.();
      const viewBox = svg?.viewBox?.baseVal;
      return !!(
        svg
        && rect
        && rect.width > 20
        && rect.height > 20
        && viewBox
        && viewBox.width > 20
        && viewBox.height > 20
      );
    },
    { pageId },
    { timeout: 45_000 }
  );
}

async function unlockRatio(page, pageId) {
  await page.waitForSelector(`#${pageId}:not([hidden]) .svgbox .resizer-aspect-checkbox`, { timeout: 30_000, state: 'attached' });
  await page.evaluate(({ pageId }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const constraintInputs = [
      ...Array.from(root?.querySelectorAll?.('.resizer-axeslength-checkbox') || []),
      ...Array.from(root?.querySelectorAll?.('#pcaVarianceAxisScale') || [])
    ];
    constraintInputs.forEach(input => {
      if(input && input.checked){
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, { pageId });
  await page.waitForTimeout(300);
  await page.evaluate(({ pageId }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const checkbox = root?.querySelector?.('.svgbox .resizer-aspect-checkbox');
    if(checkbox && checkbox.checked){
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { pageId });
  await page.waitForTimeout(500);
}

async function collectViewportMetrics(page, pageId) {
  return page.evaluate(({ pageId }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const svgBox = root?.querySelector?.('.svgbox') || null;
    const svg = svgBox?.querySelector?.('svg') || null;
    const boxRect = svgBox?.getBoundingClientRect?.() || null;
    const svgRect = svg?.getBoundingClientRect?.() || null;
    const vb = svg?.viewBox?.baseVal || null;
    if(!svgBox || !svg || !boxRect || !svgRect || !vb || vb.width <= 0 || vb.height <= 0){
      return null;
    }
    return {
      boxWidth: boxRect.width,
      boxHeight: boxRect.height,
      svgWidth: svgRect.width,
      svgHeight: svgRect.height,
      viewBox: {
        minX: vb.x,
        minY: vb.y,
        width: vb.width,
        height: vb.height
      },
      stableViewBox: {
        minX: Number(svgBox.dataset.graphViewportStableMinX),
        minY: Number(svgBox.dataset.graphViewportStableMinY),
        width: Number(svgBox.dataset.graphViewportStableWidth),
        height: Number(svgBox.dataset.graphViewportStableHeight),
        renderedWidth: Number(svgBox.dataset.graphViewportStableRenderedWidth),
        renderedHeight: Number(svgBox.dataset.graphViewportStableRenderedHeight),
        reason: svgBox.dataset.graphViewportStableReason || ''
      },
      lock: {
        axis: svgBox.dataset.resizerAxisViewportLockAxis || '',
        until: Number(svgBox.dataset.resizerAxisViewportLockUntil),
        lastAxis: svgBox.dataset.resizerLastAxis || '',
        aspectLocked: svgBox.dataset.resizerAspectLocked || ''
      },
      scaleX: svgRect.width / vb.width,
      scaleY: svgRect.height / vb.height,
      preserveAspectRatio: svg.getAttribute('preserveAspectRatio') || ''
    };
  }, { pageId });
}

async function dragSvgBoxHandle(page, pageId, handleSelector, dx, dy) {
  const handle = page.locator(`#${pageId}:not([hidden]) .svgbox ${handleSelector}`).first();
  await expect(handle).toHaveCount(1);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if(!box){
    throw new Error(`Missing handle bounding box for ${pageId} ${handleSelector}`);
  }
  const startX = box.x + Math.max(2, Math.min(box.width - 2, box.width / 2));
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(900);
}

function expectClose(actual, expected, tolerance, label) {
  expect(
    Math.abs(Number(actual) - Number(expected)),
    `${label}: expected ${actual} to stay within ${tolerance} of ${expected}`
  ).toBeLessThanOrEqual(tolerance);
}

test('unlocked one-axis graph resize preserves the orthogonal SVG axis scale in every component', async ({ page }, testInfo) => {
  test.setTimeout(8 * 60 * 1000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const report = [];
  for(let index = 0; index < COMPONENT_MATRIX.length; index += 1){
    const component = COMPONENT_MATRIX[index];
    await test.step(`axis resize invariants: ${component.type}`, async () => {
      await openComponentFromWelcome(page, component, { first: index === 0 });
      await clickExampleButtonIfPresent(page, component.exampleButtonId);
      await waitForGraphSvg(page, component.pageId);
      await unlockRatio(page, component.pageId);
      await waitForGraphSvg(page, component.pageId);

      const before = await collectViewportMetrics(page, component.pageId);
      expect(before, `${component.type} should expose an SVG graph`).not.toBeNull();
      expect(before.lock.aspectLocked, `${component.type} should be in unlocked ratio mode`).toBe('false');

      await dragSvgBoxHandle(page, component.pageId, '.resizer-horizontal', 0, 84);
      await waitForGraphSvg(page, component.pageId);
      const afterVertical = await collectViewportMetrics(page, component.pageId);
      expect(afterVertical, `${component.type} should still expose an SVG graph after vertical resize`).not.toBeNull();
      expect(afterVertical.boxHeight, `${component.type} vertical drag should change graph height`).toBeGreaterThan(before.boxHeight + 20);
      expectClose(afterVertical.scaleX, before.scaleX, 0.015, `${component.type} x scale after vertical resize`);
      expectClose(afterVertical.viewBox.minX, before.viewBox.minX, 1, `${component.type} viewBox minX after vertical resize`);
      expectClose(afterVertical.viewBox.width, before.viewBox.width, 1, `${component.type} viewBox width after vertical resize`);

      await dragSvgBoxHandle(page, component.pageId, '.resizer-vertical', 96, 0);
      await waitForGraphSvg(page, component.pageId);
      const afterHorizontal = await collectViewportMetrics(page, component.pageId);
      expect(afterHorizontal, `${component.type} should still expose an SVG graph after horizontal resize`).not.toBeNull();
      expect(afterHorizontal.boxWidth, `${component.type} horizontal drag should change graph width`).toBeGreaterThan(afterVertical.boxWidth + 20);
      expectClose(afterHorizontal.scaleY, afterVertical.scaleY, 0.015, `${component.type} y scale after horizontal resize`);
      expectClose(afterHorizontal.viewBox.minY, afterVertical.viewBox.minY, 1, `${component.type} viewBox minY after horizontal resize`);
      expectClose(afterHorizontal.viewBox.height, afterVertical.viewBox.height, 1, `${component.type} viewBox height after horizontal resize`);

      report.push({
        component: component.type,
        before,
        afterVertical,
        afterHorizontal
      });
    });
  }

  await testInfo.attach('graph-axis-resize-invariants.json', {
    body: Buffer.from(JSON.stringify(report, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  expect(issues.critical, `Critical browser issues found: ${JSON.stringify(issues.critical.slice(0, 5), null, 2)}`).toEqual([]);
});
