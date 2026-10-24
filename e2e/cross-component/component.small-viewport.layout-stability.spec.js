const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { observeStableValue, waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

test.describe('small viewport layout stability', () => {
  test.use({ viewport: { width: 709, height: 923 } });

  test('ROC settles after rendering instead of entering a ResizeObserver redraw loop', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await page.addInitScript(() => {
      window.__rocDrawStarts = 0;
      const originalDebug = console.debug.bind(console);
      console.debug = (...args) => {
        if(String(args[0] || '').includes('drawRoc start')){
          window.__rocDrawStarts += 1;
        }
        originalDebug(...args);
      };
    });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { first: true, loadExample: true });
    await page.waitForFunction(() => {
      const svg = document.querySelector('#rocPage:not([hidden]) #rocSvg');
      return !!svg && svg.querySelectorAll('path').length > 0;
    });

    await waitForComponentOwnerReady(page, 'roc', {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 30_000
    });
    const startCount = await page.evaluate(() => window.__rocDrawStarts || 0);
    const observation = await observeStableValue(page,
      () => page.evaluate(() => window.__rocDrawStarts || 0),
      {
        durationMs: 1_000,
        label: 'ROC small-viewport draw count',
        isStable: (initial, current) => current - initial <= 1
      }
    );
    const endCount = observation.latest;

    expect(endCount - startCount).toBeLessThanOrEqual(1);
    await expect(page.locator('#rocPage:not([hidden]) #rocSvg')).toBeVisible();
    expect(issues.critical).toEqual([]);
  });

  test('Surface reporting disclosure remains open after the layout reacts to its height change', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true, loadExample: true });
    await page.waitForFunction(() => (
      document.querySelectorAll('#surfacePage:not([hidden]) #surfaceSvg g.surface-faces polygon').length > 0
    ));

    const report = page.locator('#surfacePage:not([hidden]) #surfaceStatsSummary .stats-report-panel').first();
    await expect(report).toBeVisible();
    await report.locator(':scope > summary').click();
    await expect(report).toHaveJSProperty('open', true);
    await page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await expect(report).toHaveJSProperty('open', true);
    expect(issues.critical).toEqual([]);
  });

  test('All component pages avoid viewport overflow from phone through desktop widths after cross-component activation', async ({ page }) => {
    test.setTimeout(240_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');

    for (const [index, component] of COMPONENT_CATALOG.entries()) {
      await openComponentFromWelcome(page, component, { first: index === 0, loadExample: true });
      await waitForComponentOwnerReady(page, component.type, {
        requireMountedRoot: true,
        requirePublished: true,
        requireIdle: true,
        timeout: 30_000
      });

      for (const { width, height } of [
        { width: 320, height: 568 },
        { width: 360, height: 740 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 640, height: 450 },
        { width: 768, height: 600 },
        { width: 1024, height: 768 },
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 }
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => new Promise(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
        const layout = await page.evaluate(type => {
          const activePage = document.querySelector('.workspace-page:not([hidden])');
          const dataPanelSelector = {
            venn: '#vennInputPanel',
            box: '#boxTablePanel',
            scatter: '#scatterTablePanel',
            pca: '#pcaTablePanel',
            line: '#lineTablePanel',
            heatmap: '#heatmapTablePanel',
            roc: '#rocTablePanel',
            survival: '#survivalTablePanel',
            hist: '#histTablePanel',
            pie: '#pieTablePanel'
          }[type];
          const panel = dataPanelSelector ? activePage?.querySelector(dataPanelSelector) : null;
          const inlinePanelMinWidth = panel?.style.getPropertyValue('min-width') || '';
          const inlinePanelMinWidthPriority = panel?.style.getPropertyPriority('min-width') || '';
          if(panel){
            panel.style.removeProperty('min-width');
          }
          const panelCssMinWidth = panel ? getComputedStyle(panel).minWidth : null;
          if(panel && inlinePanelMinWidth){
            panel.style.setProperty('min-width', inlinePanelMinWidth, inlinePanelMinWidthPriority);
          }
          const wrap = activePage?.querySelector('.wrap');
          const diagramArea = activePage?.querySelector('.diagram-area');
          const plotStack = diagramArea?.querySelector(':scope > .graph-plot-stack');
          const configPanel = diagramArea?.querySelector(':scope > .config-panel');
          const notes = plotStack?.querySelector('.shared-notes');
          const plotBounds = plotStack?.getBoundingClientRect();
          const notesBounds = notes?.getBoundingClientRect();
          const configBounds = configPanel?.getBoundingClientRect();
          const pageStyle = activePage ? getComputedStyle(activePage) : null;
          const plotStackStyle = plotStack ? getComputedStyle(plotStack) : null;
          const graphAndNotesRight = Math.max(plotBounds?.right || 0, notesBounds?.right || 0);
          return {
            viewport: document.documentElement.clientWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
            component: type,
            activePage: activePage?.id || null,
            pageWidth: Math.round(activePage?.getBoundingClientRect().width || 0),
            pageCssWidth: parseFloat(pageStyle?.width || '0'),
            pageMinWidth: pageStyle?.minWidth || null,
            pageMaxWidth: pageStyle?.maxWidth || null,
            plotStackStyle: plotStackStyle ? {
              display: plotStackStyle.display,
              flexDirection: plotStackStyle.flexDirection,
              flexGrow: plotStackStyle.flexGrow,
              flexShrink: plotStackStyle.flexShrink,
              flexBasis: plotStackStyle.flexBasis,
              minWidth: plotStackStyle.minWidth
            } : null,
            panelWidth: Math.round(panel?.getBoundingClientRect().width || 0),
            dataPanelMinWidth: getComputedStyle(document.documentElement)
              .getPropertyValue('--workspace-data-panel-min-width').trim(),
            panelMinWidth: panel ? getComputedStyle(panel).minWidth : null,
            panelCssMinWidth,
            wrapDisplay: getComputedStyle(wrap).display,
            wrapDirection: getComputedStyle(wrap).flexDirection,
            hasNotes: Boolean(notes),
            graphControlsSideBySide: Boolean(plotBounds && configBounds
              && configBounds.left >= graphAndNotesRight - 1)
          };
        }, component.type);
        expect(layout.activePage).toBe(component.pageId);
        expect(layout.pageMinWidth,
          `${component.type} workspace minimum width at ${width}px: ${JSON.stringify(layout)}`)
          .toBe('100%');
        expect(layout.pageMaxWidth,
          `${component.type} workspace maximum width at ${width}px: ${JSON.stringify(layout)}`)
          .toBe('none');
        expect(Math.abs(layout.pageCssWidth - layout.pageWidth),
          `${component.type} workspace CSS width must match its rendered width at ${width}px: ${JSON.stringify(layout)}`)
          .toBeLessThanOrEqual(1);
        expect(layout.plotStackStyle,
          `${component.type} plot-stack sizing at ${width}px: ${JSON.stringify(layout)}`)
          .toEqual({
            display: 'flex',
            flexDirection: 'column',
            flexGrow: '0',
            flexShrink: '0',
            flexBasis: 'auto',
            minWidth: '0px'
          });
        if(component.type === 'scatter'){
          expect(layout.hasNotes,
            `Scatter Notes must be inside the graph stack at ${width}px: ${JSON.stringify(layout)}`)
            .toBe(true);
        }
        // Stacked mobile layouts intentionally release the desktop split minimum.
        if(layout.panelMinWidth !== null && layout.wrapDirection === 'row'){
          expect(layout.panelCssMinWidth,
            `${component.type} CSS data-panel minimum at ${width}px: ${JSON.stringify(layout)}`)
            .toBe(layout.dataPanelMinWidth);
        }
        expect(layout.wrapDisplay,
          `${component.type} workspace wrapper must remain flex at ${width}px: ${JSON.stringify(layout)}`)
          .toBe('flex');
        expect(layout.graphControlsSideBySide,
          `${component.type} controls must remain right of the graph at ${width}px: ${JSON.stringify(layout)}`)
          .toBe(true);
        expect(layout.document, `${component.type} document overflow at ${width}px: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.viewport);
        expect(layout.body, `${component.type} body overflow at ${width}px: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.viewport);
      }
    }

    expect(issues.critical).toEqual([]);
  });
});
