const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const DEFAULT_TICK_SELECTOR = 'text[data-font-role="xTick"]';
const DEFAULT_TITLE_SELECTOR = 'text[data-font-role="xTitle"]';

const STANDARD_COMPONENTS = [
  { type: 'box', pageId: 'boxPage', plotSelector: '#boxPlot', expectTitle: false },
  { type: 'scatter', pageId: 'scatterPage', plotSelector: '#scatterPlot', expectTitle: true },
  { type: 'line', pageId: 'linePage', plotSelector: '#linePlot', expectTitle: true },
  { type: 'hist', pageId: 'histPage', plotSelector: '#histPlot', expectTitle: true },
  { type: 'pca', pageId: 'pcaPage', plotSelector: '#pcaPlot', expectTitle: true },
  { type: 'roc', pageId: 'rocPage', plotSelector: '#rocPlot', expectTitle: true },
  { type: 'survival', pageId: 'survivalPage', plotSelector: '#survivalPlot', expectTitle: true }
];

function tickSelector(component) {
  return component.tickSelector || DEFAULT_TICK_SELECTOR;
}

function titleSelector(component) {
  return component.titleSelector || DEFAULT_TITLE_SELECTOR;
}

async function waitForXAxisTicks(page, component) {
  await page.waitForFunction(({ plotSelector, tickSelector: selector }) => {
    const root = document.querySelector(plotSelector);
    const svg = root?.querySelector('svg') || null;
    return !!svg && svg.querySelectorAll(selector).length > 0;
  }, {
    plotSelector: component.plotSelector,
    tickSelector: tickSelector(component)
  }, { timeout: 45_000 });
}

async function openXAxisControls(page, plotSelector) {
  const clicked = await page.evaluate(selector => {
    const root = document.querySelector(selector);
    const target = root?.querySelector('svg [data-axis-control="1"][data-axis-key="x"]') || null;
    if (!target) {
      return false;
    }
    target.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    return true;
  }, plotSelector);
  expect(clicked).toBe(true);
  await expect(page.locator('.axis-controls-panel')).toBeVisible();
}

async function setXAxisLabelAngle(page, angle) {
  await page.evaluate(nextAngle => {
    const input = document.querySelector('.axis-controls-panel .axis-controls-panel__field--tick-label-angle input[type="number"]');
    if (!input) {
      throw new Error('Tick label angle input not found');
    }
    input.focus();
    input.value = nextAngle == null ? '' : String(nextAngle);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  }, angle);
}

async function waitForRenderedAngle(page, component, angle) {
  await page.waitForFunction(({ plotSelector, tickSelector: selector, expected }) => {
    const ticks = Array.from(document.querySelector(plotSelector)?.querySelectorAll(`svg ${selector}`) || []);
    if (!ticks.length) {
      return false;
    }
    return ticks.every(node => {
      const match = (node.getAttribute('transform') || '').match(/rotate\(([-+0-9.]+)/i);
      const actual = match ? Number(match[1]) : 0;
      return Number.isFinite(actual) && Math.abs(actual - expected) < 0.1;
    });
  }, {
    plotSelector: component.plotSelector,
    tickSelector: tickSelector(component),
    expected: angle
  }, { timeout: 20_000 });
}

async function collectXAxisLayout(page, component) {
  return page.evaluate(({ plotSelector, tickSelector: tickSelectorValue, titleSelector: titleSelectorValue }) => {
    const root = document.querySelector(plotSelector);
    const svg = root?.querySelector('svg') || null;
    if (!svg) {
      return null;
    }
    const svgRect = svg.getBoundingClientRect();
    const tickNodes = Array.from(svg.querySelectorAll(tickSelectorValue));
    const tickRects = tickNodes.map(node => {
      const rect = node.getBoundingClientRect();
      const transform = node.getAttribute('transform') || '';
      const angleMatch = transform.match(/rotate\(([-+0-9.]+)/i);
      return {
        text: (node.textContent || '').trim(),
        transform,
        angle: angleMatch ? Number(angleMatch[1]) : 0,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      };
    });
    const titleNode = titleSelectorValue ? svg.querySelector(titleSelectorValue) : null;
    const titleRect = titleNode ? titleNode.getBoundingClientRect() : null;
    const titleOverlap = titleRect
      ? tickRects.some(rect => !(
          rect.right <= titleRect.left
          || rect.left >= titleRect.right
          || rect.bottom <= titleRect.top
          || rect.top >= titleRect.bottom
        ))
      : false;
    const minLeft = tickRects.length ? Math.min(...tickRects.map(rect => rect.left)) : svgRect.left;
    const maxRight = tickRects.length ? Math.max(...tickRects.map(rect => rect.right)) : svgRect.right;
    const maxBottom = tickRects.length ? Math.max(...tickRects.map(rect => rect.bottom)) : svgRect.bottom;
    return {
      tickCount: tickRects.length,
      tickRects,
      angles: tickRects.map(rect => rect.angle),
      hasXTitle: !!titleNode,
      xTitle: titleNode ? (titleNode.textContent || '').trim() : '',
      titleOverlap,
      svg: {
        left: svgRect.left,
        right: svgRect.right,
        top: svgRect.top,
        bottom: svgRect.bottom,
        width: svgRect.width,
        height: svgRect.height
      },
      overflow: {
        left: Math.max(0, svgRect.left - minLeft),
        right: Math.max(0, maxRight - svgRect.right),
        bottom: Math.max(0, maxBottom - svgRect.bottom)
      }
    };
  }, {
    plotSelector: component.plotSelector,
    tickSelector: tickSelector(component),
    titleSelector: titleSelector(component)
  });
}

async function openStandardComponent(page, component, { first = true } = {}) {
  await openComponentFromWelcome(page, component, { first, loadExample: true });
  await waitForXAxisTicks(page, component);
}

function expectContainedVerticalLayout(layout, angle, { expectTitle = false } = {}) {
  expect(layout).toBeTruthy();
  expect(layout.tickCount).toBeGreaterThan(0);
  expect(layout.angles.every(actual => Math.abs(actual - angle) < 0.1)).toBe(true);
  expect(layout.overflow.left).toBeLessThanOrEqual(2);
  expect(layout.overflow.right).toBeLessThanOrEqual(2);
  expect(layout.overflow.bottom).toBeLessThanOrEqual(2);
  if (expectTitle) {
    expect(layout.hasXTitle).toBe(true);
    expect(layout.titleOverlap).toBe(false);
  }
}

for (const component of STANDARD_COMPONENTS) {
  test(`manual x-axis label angle keeps ${component.type} tick labels inside the SVG`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    await openStandardComponent(page, component, { first: true });
    await openXAxisControls(page, component.plotSelector);
    await setXAxisLabelAngle(page, -90);
    await waitForRenderedAngle(page, component, -90);

    const layout = await collectXAxisLayout(page, component);
    await testInfo.attach(`${component.type}.x-axis-label-angle.layout.json`, {
      body: Buffer.from(JSON.stringify(layout, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    expectContainedVerticalLayout(layout, -90, { expectTitle: component.expectTitle });
    expect(issues.critical).toEqual([]);
  });
}

test('positive vertical angle reserves the opposite Box endpoint without overflow', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = { type: 'box', pageId: 'boxPage', plotSelector: '#boxPlot', expectTitle: false };
  await openStandardComponent(page, component, { first: true });
  await openXAxisControls(page, component.plotSelector);
  await setXAxisLabelAngle(page, 90);
  await waitForRenderedAngle(page, component, 90);
  expectContainedVerticalLayout(await collectXAxisLayout(page, component), 90);
  expect(issues.critical).toEqual([]);
});

test('flipped Box reserves vertical value-axis tick labels below its physical x-axis title', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
  await page.locator('#boxFlipAxes').check();

  const component = {
    type: 'box',
    pageId: 'boxPage',
    plotSelector: '#boxPlot',
    tickSelector: 'text[data-box-axis-tick="x"]',
    titleSelector: 'text[data-box-axis-title="x"]',
    expectTitle: true
  };
  await waitForXAxisTicks(page, component);
  await openXAxisControls(page, component.plotSelector);
  await setXAxisLabelAngle(page, -90);
  await waitForRenderedAngle(page, component, -90);

  const layout = await collectXAxisLayout(page, component);
  await testInfo.attach('box-flipped.x-axis-label-angle.layout.json', {
    body: Buffer.from(JSON.stringify(layout, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  expectContainedVerticalLayout(layout, -90, { expectTitle: true });
  expect(issues.critical).toEqual([]);
});

test('manual x-axis label angle keeps stacked-bar Pie tick labels inside the SVG', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage' }, { first: true, loadExample: true });
  await page.selectOption('#pieChartType', 'stacked');
  const component = { type: 'pie', pageId: 'piePage', plotSelector: '#piePlot', expectTitle: false };
  await waitForXAxisTicks(page, component);
  await openXAxisControls(page, component.plotSelector);
  await setXAxisLabelAngle(page, -90);
  await waitForRenderedAngle(page, component, -90);

  const layout = await collectXAxisLayout(page, component);
  await testInfo.attach('pie-stacked.x-axis-label-angle.layout.json', {
    body: Buffer.from(JSON.stringify(layout, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expectContainedVerticalLayout(layout, -90);
  expect(issues.critical).toEqual([]);
});

test('manual x-axis label angle keeps UpSet set-size tick labels inside the SVG and clear of its title', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true, loadExample: true });
  await page.selectOption('#vennPlotType', 'upset');
  const component = {
    type: 'venn',
    pageId: 'vennPage',
    plotSelector: '#vennGraphPanel',
    tickSelector: 'text[data-upset-axis-tick-label="set-x"]',
    titleSelector: 'text[data-upset-axis-label="set-x"]',
    expectTitle: true
  };
  await waitForXAxisTicks(page, component);
  await openXAxisControls(page, component.plotSelector);
  await setXAxisLabelAngle(page, -90);
  await waitForRenderedAngle(page, component, -90);

  const layout = await collectXAxisLayout(page, component);
  await testInfo.attach('venn-upset.x-axis-label-angle.layout.json', {
    body: Buffer.from(JSON.stringify(layout, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expectContainedVerticalLayout(layout, -90, { expectTitle: true });
  expect(issues.critical).toEqual([]);
});
