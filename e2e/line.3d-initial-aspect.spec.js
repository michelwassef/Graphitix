const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

// Regression guard for 3D plot distortion.
//
// A 3D plot lays its content (projected cube, axis ticks/labels, title, legend, and
// every glyph) out in fixed viewBox coordinates. It must NEVER be scaled
// non-uniformly to fill a container whose aspect differs from the content's — doing
// so vertically/horizontally stretches the whole plot AND its fonts. The symptom was
// a freshly loaded 3D line plot rendering vertically stretched until a manual resize,
// and 3D titles/legend text stretching on rotate/resize.
//
// Root cause: the shared viewport helper (autoResizeSvg) defaults to
// preserveAspectRatio="none" (2D fill-distort). The fix is that 3D SVGs request
// "xMidYMid meet" so scaling is always uniform. This invariant is general to all 3D
// views (line/scatter/pca all received the same one-line fix; surface was already
// correct). Line is asserted here because it exhibited the worst distortion and is
// the most reliably driven 3D view in the harness.
test('line 3D plot scales uniformly on initial load (no stretch/distortion)', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line') || document.querySelector('#linePage:not([hidden])'))
      : null;
    return !!(window.Components?.line?.ready && root?.querySelector?.('#lineHot .ag-root, #lineHot .ag-root-wrapper'));
  }, null, { timeout: 45_000 });

  await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line') || document.querySelector('#linePage:not([hidden])'))
      : null;
    const tableFormat = root?.querySelector?.('#lineTableFormat');
    const viewMode = root?.querySelector?.('#lineViewMode');
    if (!tableFormat || !viewMode) {
      throw new Error('Active Line 3D controls not found');
    }
    tableFormat.value = '3d';
    tableFormat.dispatchEvent(new Event('change', { bubbles: true }));
    viewMode.value = '3d';
    viewMode.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line') || document.querySelector('#linePage:not([hidden])'))
      : null;
    const loadExample = root?.querySelector?.('#lineLoadExample');
    if (!loadExample) {
      throw new Error('Active Line example button not found');
    }
    loadExample.click();
  });

  // Wait for the live plot SVG to be in 3D mode AND for the viewport helper to have
  // stamped a preserveAspectRatio (applied via requestAnimationFrame inside
  // autoResizeSvg) — no manual resize anywhere.
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line') || document.querySelector('#linePage:not([hidden])'))
      : null;
    const svg = root?.querySelector?.('#linePlot svg');
    const mode = svg && (svg.dataset?.viewMode || svg.getAttribute('data-view-mode'));
    return !!(svg && mode === '3d' && svg.getAttribute('preserveAspectRatio'));
  }, null, { timeout: 40_000 });
  await page.waitForTimeout(300);

  const par = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line') || document.querySelector('#linePage:not([hidden])'))
      : null;
    const svg = root?.querySelector?.('#linePlot svg');
    return svg.getAttribute('preserveAspectRatio') || null;
  });

  // Must be a uniform-scaling mode ("...meet" or "...slice"), never "none".
  expect(par, 'line 3D plot must scale uniformly (not "none")').not.toBe('none');
  expect(par, 'line 3D plot must preserve aspect ratio').toMatch(/meet|slice/);

  expect(issues.critical).toEqual([]);
});
