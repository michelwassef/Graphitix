const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { openComponentFromWelcome } = require('./helpers/workspaceDriver');

async function assertZoomPresentation(page, component, readyExpression, options = {}) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: component, pageId: `${component}Page` }, {
    first: true,
    loadExample: true
  });
  await page.waitForFunction(readyExpression);
  await page.waitForTimeout(250);
  if(component === 'line'){
    await page.evaluate(() => {
      const toggle = document.querySelector('#linePage:not([hidden]) #lineShowLegend');
      if(toggle && !toggle.checked){
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForSelector('#linePage:not([hidden]) #lineSvg [data-legend-viewport-content="true"]');
    await page.waitForTimeout(250);
  }

  const before = await page.evaluate((componentKey) => {
    const root = document.querySelector('[id$="Page"]:not([hidden])');
    const svgBox = root?.querySelector('.svgbox');
    const content = svgBox?.querySelector('.resizer-zoom-content');
    const svg = svgBox?.querySelector('svg');
    const readZoomGeometry = (box, zoomContent, graphSvg) => ({
      box: box?.getBoundingClientRect?.().toJSON?.() || null,
      boxStyle: { width: box?.style?.width || '', height: box?.style?.height || '' },
      viewport: box?.querySelector('.resizer-zoom-viewport')?.getBoundingClientRect?.().toJSON?.() || null,
      content: zoomContent?.getBoundingClientRect?.().toJSON?.() || null,
      svg: graphSvg?.getBoundingClientRect?.().toJSON?.() || null,
      svgAttrs: { width: graphSvg?.getAttribute?.('width') || '', height: graphSvg?.getAttribute?.('height') || '' },
      envelope: box ? {
        extraRight: box.style.getPropertyValue('--graph-content-extra-right'),
        extraBottom: box.style.getPropertyValue('--graph-content-extra-bottom'),
        marginRight: getComputedStyle(box).marginRight,
        marginBottom: getComputedStyle(box).marginBottom,
        pseudoWidth: getComputedStyle(box, '::after').width,
        pseudoHeight: getComputedStyle(box, '::after').height
      } : null,
      scroll: { boxWidth: box?.scrollWidth || 0, boxHeight: box?.scrollHeight || 0, viewportWidth: box?.querySelector('.resizer-zoom-viewport')?.scrollWidth || 0, viewportHeight: box?.querySelector('.resizer-zoom-viewport')?.scrollHeight || 0 }
    });
    window.__zoomLifecycleEvents = [];
    window.__zoomMutations = [];
    window.__zoomMutationObserver?.disconnect?.();
    window.__zoomMutationObserver = new MutationObserver(records => {
      window.__zoomMutations.push(...records.map(record => ({
        type: record.type,
        target: record.target?.id || record.target?.className || record.target?.tagName || '',
        added: record.addedNodes?.length || 0,
        removed: record.removedNodes?.length || 0
      })));
    });
    window.__zoomMutationObserver.observe(svgBox, { childList: true, subtree: true, attributes: true });
    window.__zoomLifecycleUnsubscribe = window.Shared.componentLifecycle?.onLifecycleEvent?.(event => {
      if(event.componentKey === componentKey){
        const root = document.querySelector('[id$="Page"]:not([hidden])');
        const svgBox = root?.querySelector('.svgbox');
        window.__zoomLifecycleEvents.push({
          action: event.action,
          phase: event.phase,
          reason: event.reason,
          boxWidth: svgBox?.getBoundingClientRect?.().width || 0
        });
      }
    });
    return {
      width: svgBox?.getBoundingClientRect?.().width || 0,
      zoomContent: content?.style?.getPropertyValue('--resizer-content-zoom') || '',
      viewBox: svg?.getAttribute?.('viewBox') || '',
      geometry: readZoomGeometry(svgBox, content, svg)
    };
  }, component);

  await page.evaluate(() => {
    const button = document.querySelector('[id$="Page"]:not([hidden]) button[aria-label="Zoom in graph view"]');
    button?.click();
  });
  await page.waitForFunction(() => Number(
    document.querySelector('[id$="Page"]:not([hidden]) .svgbox')?.dataset?.resizerZoomLevel
  ) === 1.1);
  await page.waitForTimeout(Number(options.settleMs) || 1800);

  const after = await page.evaluate(() => {
    window.__zoomLifecycleUnsubscribe?.();
    window.__zoomMutationObserver?.disconnect?.();
    const root = document.querySelector('[id$="Page"]:not([hidden])');
    const svgBox = root?.querySelector('.svgbox');
    const content = svgBox?.querySelector('.resizer-zoom-content');
    const svg = svgBox?.querySelector('svg');
    const readZoomGeometry = (box, zoomContent, graphSvg) => ({
      box: box?.getBoundingClientRect?.().toJSON?.() || null,
      boxStyle: { width: box?.style?.width || '', height: box?.style?.height || '' },
      viewport: box?.querySelector('.resizer-zoom-viewport')?.getBoundingClientRect?.().toJSON?.() || null,
      content: zoomContent?.getBoundingClientRect?.().toJSON?.() || null,
      svg: graphSvg?.getBoundingClientRect?.().toJSON?.() || null,
      svgAttrs: { width: graphSvg?.getAttribute?.('width') || '', height: graphSvg?.getAttribute?.('height') || '' },
      envelope: box ? {
        extraRight: box.style.getPropertyValue('--graph-content-extra-right'),
        extraBottom: box.style.getPropertyValue('--graph-content-extra-bottom'),
        marginRight: getComputedStyle(box).marginRight,
        marginBottom: getComputedStyle(box).marginBottom,
        pseudoWidth: getComputedStyle(box, '::after').width,
        pseudoHeight: getComputedStyle(box, '::after').height
      } : null,
      scroll: { boxWidth: box?.scrollWidth || 0, boxHeight: box?.scrollHeight || 0, viewportWidth: box?.querySelector('.resizer-zoom-viewport')?.scrollWidth || 0, viewportHeight: box?.querySelector('.resizer-zoom-viewport')?.scrollHeight || 0 }
    });
    return {
      width: svgBox?.getBoundingClientRect?.().width || 0,
      zoomContent: content?.style?.getPropertyValue('--resizer-content-zoom') || '',
      viewBox: svg?.getAttribute?.('viewBox') || '',
      geometry: readZoomGeometry(svgBox, content, svg),
      events: window.__zoomLifecycleEvents || [],
      mutations: window.__zoomMutations || []
    };
  });

  expect(after.width).toBeGreaterThan(before.width * 1.05);
  expect(after.zoomContent).toBe('1.1');
  expect(after.viewBox).toBe(before.viewBox);
  const resizePhase = after.events.find(event => event.action === 'resize-phase' && event.phase === 'zoom');
  expect(resizePhase?.boxWidth).toBe(after.width);
  expect(after.events.filter(event => event.action === 'draw-request' || event.action === 'draw-executed')).toHaveLength(0);
  expect(after.mutations.filter(mutation => mutation.type === 'childList')).toHaveLength(0);
  const beforeExtraRight = Number.parseFloat(before.geometry.envelope?.extraRight || '');
  const afterExtraRight = Number.parseFloat(after.geometry.envelope?.extraRight || '');
  if(Number.isFinite(beforeExtraRight) && beforeExtraRight > 0){
    expect(afterExtraRight).toBeCloseTo(beforeExtraRight * 1.1, 0);
    expect(after.geometry.svg.right).toBeLessThanOrEqual(
      after.geometry.box.right + afterExtraRight + 2
    );
  }
}

test('Scatter zoom magnifies the published frame without redrawing', async ({ page }) => {
  test.setTimeout(60_000);
  await assertZoomPresentation(page, 'scatter', () => !!document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg'));
});

test('Heatmap zoom magnifies the published frame without redrawing', async ({ page }) => {
  test.setTimeout(60_000);
  await assertZoomPresentation(page, 'heatmap', () => document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg')?.childElementCount > 0);
});

test('Venn zoom magnifies the published frame without redrawing', async ({ page }) => {
  test.setTimeout(60_000);
  await assertZoomPresentation(page, 'venn', () => document.querySelector('#vennPage:not([hidden]) #stage')?.childElementCount > 0);
});

test('Line legend zoom magnifies the complete envelope without redrawing', async ({ page }) => {
  test.setTimeout(60_000);
  await assertZoomPresentation(page, 'line', () => !!document.querySelector('#linePage:not([hidden]) #linePlot svg'));
});

test('Scatter zoom has no delayed render-cache redraw', async ({ page }) => {
  test.setTimeout(60_000);
  await assertZoomPresentation(page, 'scatter', () => !!document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg'), { settleMs: 7000 });
});
