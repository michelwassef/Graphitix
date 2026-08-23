const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

const PRIMARY_SVG_BY_COMPONENT = {
  venn: '#stage',
  box: '#boxSvg',
  scatter: '#scatterSvg',
  pca: '#pcaSvg',
  line: '#lineSvg',
  heatmap: '#heatmapSvg',
  surface: '#surfaceSvg',
  roc: '#rocSvg',
  survival: '#survivalSvg',
  hist: '#histSvg',
  pie: '#pieSvg'
};

test('all components export their primary graph through the shared physical projection', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  for (let index = 0; index < COMPONENT_MATRIX.length; index += 1) {
    const component = COMPONENT_MATRIX[index];
    await test.step(component.type, async () => {
      await openComponentFromWelcome(page, component, {
        first: index === 0,
        loadExample: true
      });
      await page.waitForFunction(({ type, selector }) => {
        const state = window.Main?.session?.workspaceState;
        const active = state?.tabs?.find(tab => tab?.id === state?.activeTabId) || null;
        const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id, type)
          || document.querySelector(`#${type}Page:not([hidden])`);
        const svg = root?.querySelector?.(selector) || null;
        return !!svg && !!svg.firstElementChild;
      }, { type: component.type, selector: PRIMARY_SVG_BY_COMPONENT[component.type] }, { timeout: 30_000 });

      const result = await page.evaluate(({ type, selector }) => {
        const workspace = window.Main?.session?.workspaceState;
        const active = workspace?.tabs?.find(tab => tab?.id === workspace?.activeTabId) || null;
        const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id, type)
          || document.querySelector(`#${type}Page:not([hidden])`);
        const svg = root?.querySelector?.(selector) || null;
        if (!svg) return { ok: false, reason: 'missing-svg' };
        const projectionApi = window.Shared?.exportProjection;
        const exporter = window.Shared?.exporter;
        const projection = projectionApi?.resolve?.(svg, {
          componentName: type,
          contextLabel: `e2e-${type}-projection`
        });
        if (!projection) return { ok: false, reason: 'missing-projection' };
        const xml = exporter?.svgElementToXml?.(svg, `e2e-${type}-export`, {
          componentName: type
        });
        if (!xml) return { ok: false, reason: 'missing-xml' };
        const exported = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
        const exportedViewBox = projectionApi.parseViewBox(exported.getAttribute('viewBox'));
        const logicalViewBox = projectionApi.parseViewBox(exported.getAttribute('data-export-logical-view-box'));
        const expected = projectionApi.resolveForViewBox(projection, logicalViewBox || projection.logicalViewBox);
        return {
          ok: true,
          ownerWidth: projection.ownerFrame.width,
          ownerHeight: projection.ownerFrame.height,
          ownerAuthority: projection.ownerFrame.authority || null,
          exportedWidth: Number.parseFloat(exported.getAttribute('width')),
          exportedHeight: Number.parseFloat(exported.getAttribute('height')),
          expectedWidth: expected?.physical?.width,
          expectedHeight: expected?.physical?.height,
          viewBox: exported.getAttribute('viewBox') || null,
          viewBoxWidth: exportedViewBox?.width,
          viewBoxHeight: exportedViewBox?.height,
          logicalViewBox: exported.getAttribute('data-export-logical-view-box') || null,
          pasteTransform: exported.querySelector('g#export-group')?.getAttribute('transform') || null
        };
      }, { type: component.type, selector: PRIMARY_SVG_BY_COMPONENT[component.type] });

      expect(result.ok, `${component.type}: ${result.reason || 'projection failed'}`).toBe(true);
      expect(result.ownerWidth, `${component.type}: owner width`).toBeGreaterThan(0);
      expect(result.ownerHeight, `${component.type}: owner height`).toBeGreaterThan(0);
      expect(result.exportedWidth, `${component.type}: exported width`).toBeCloseTo(result.expectedWidth, 3);
      expect(result.exportedHeight, `${component.type}: exported height`).toBeCloseTo(result.expectedHeight, 3);
      expect(result.viewBox, `${component.type}: exported viewBox`).toBeTruthy();
      expect(result.viewBoxWidth, `${component.type}: physical viewBox width`).toBeCloseTo(result.exportedWidth, 3);
      expect(result.viewBoxHeight, `${component.type}: physical viewBox height`).toBeCloseTo(result.exportedHeight, 3);
      expect(result.logicalViewBox, `${component.type}: logical viewBox provenance`).toBeTruthy();
      expect(result.pasteTransform, `${component.type}: paste projection`).toMatch(/^matrix\(/);
    });
  }

  expect(issues.critical).toEqual([]);
});
