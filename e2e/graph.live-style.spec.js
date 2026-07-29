const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const COMPONENTS = ['hist', 'roc', 'survival', 'line', 'pie'].map(type => {
  const component = COMPONENT_MATRIX.find(entry => entry.type === type);
  if (!component) {
    throw new Error(`Missing workspace harness entry for ${type}`);
  }
  return {
    ...component,
    label: type === 'pie' ? 'stacked bar' : type,
    svgSelector: `#${type}Page:not([hidden]) #${type}Svg`,
    plotSelector: `#${type}Page:not([hidden]) #${type}Plot`
  };
});

for (const component of COMPONENTS) {
  test(`${component.label} applies axis style without replacing or clearing the committed frame`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    if (component.type === 'pie') {
      await page.locator('#piePage:not([hidden]) #pieChartType').selectOption('stacked');
    }

    const axis = page.locator(`${component.svgSelector} [data-axis-control="1"]`).first();
    await expect(axis).toHaveCount(1, { timeout: 30_000 });
    await expect(axis).toHaveAttribute('data-graphitix-visual-target', '1', { timeout: 30_000 });
    await page.waitForTimeout(400);
    await page.evaluate(({ svgSelector, plotSelector }) => {
      const svg = document.querySelector(svgSelector);
      const plot = document.querySelector(plotSelector);
      window.__liveStyleFrame = svg;
      window.__liveStyleMutations = [];
      window.__liveStyleObserver?.disconnect?.();
      window.__liveStyleObserver = new MutationObserver(records => {
        records.forEach(record => {
          if (record.type !== 'childList') return;
          const removedSvg = Array.from(record.removedNodes).some(node =>
            node === svg || node?.contains?.(svg)
          );
          const addedSvg = Array.from(record.addedNodes).some(node =>
            node?.nodeType === 1 && (node.matches?.('svg') || node.querySelector?.('svg'))
          );
          if (removedSvg || addedSvg) {
            window.__liveStyleMutations.push({ removedSvg, addedSvg });
          }
        });
      });
      window.__liveStyleObserver.observe(plot, { childList: true, subtree: true });
    }, component);

    await axis.dispatchEvent('click');
    const thickness = page.locator('.axis-controls-panel[data-open="1"] .axis-controls-panel__field--style input[type="number"]');
    await expect(thickness).toHaveCount(1);
    await thickness.evaluate(input => {
      input.value = '3';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(350);

    const result = await page.evaluate(({ type, svgSelector }) => {
      window.__liveStyleObserver?.disconnect?.();
      const svg = document.querySelector(svgSelector);
      const widths = Array.from(svg?.querySelectorAll?.('[data-graphitix-visual-target="1"][data-visual-channel="axis"]') || [])
        .map(node => Number(node.getAttribute('stroke-width')))
        .filter(Number.isFinite);
      const payload = window.Components?.[type]?.getPayload?.();
      return {
        sameFrame: svg === window.__liveStyleFrame,
        connected: !!svg?.isConnected,
        mutationCount: window.__liveStyleMutations?.length || 0,
        targetCount: widths.length,
        minimumWidth: widths.length ? Math.min(...widths) : 0,
        persistedWidth: Number(payload?.config?.axis?.strokeWidth)
      };
    }, component);
    await testInfo.attach(`${component.type}-live-style.json`, {
      body: Buffer.from(JSON.stringify({ result, issues: issues.all }, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    expect(result.sameFrame).toBe(true);
    expect(result.connected).toBe(true);
    expect(result.mutationCount).toBe(0);
    expect(result.targetCount).toBeGreaterThan(0);
    expect(result.minimumWidth).toBeGreaterThan(0);
    expect(result.persistedWidth).toBe(3);
    expect(issues.critical).toEqual([]);
  });
}

test('histogram applies live trace color without redrawing and persists it to its owner', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = COMPONENTS.find(entry => entry.type === 'hist');
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });

  const bar = page.locator(`${component.svgSelector} [data-hist-bar="1"]`).first();
  await expect(bar).toHaveCount(1, { timeout: 30_000 });
  const seriesKey = await bar.getAttribute('data-series-key');
  await page.evaluate(({ svgSelector, plotSelector }) => {
    const svg = document.querySelector(svgSelector);
    const plot = document.querySelector(plotSelector);
    window.__liveTraceFrame = svg;
    window.__liveTraceReplacementCount = 0;
    window.__liveTraceObserver = new MutationObserver(records => {
      records.forEach(record => {
        const touchedFrame = Array.from(record.removedNodes).some(node => node === svg || node?.contains?.(svg))
          || Array.from(record.addedNodes).some(node => node?.nodeType === 1 && (node.matches?.('svg') || node.querySelector?.('svg')));
        if (touchedFrame) window.__liveTraceReplacementCount += 1;
      });
    });
    window.__liveTraceObserver.observe(plot, { childList: true, subtree: true });
  }, component);

  await bar.dispatchEvent('click');
  const colorInput = page.locator('.hist-bar-controls .shared-shape-color-input');
  await expect(colorInput).toHaveCount(1);
  await colorInput.evaluate(input => {
    input.value = '#2f9d84';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);

  const result = await page.evaluate(({ svgSelector, type, seriesKey: key }) => {
    window.__liveTraceObserver?.disconnect?.();
    const svg = document.querySelector(svgSelector);
    const nodes = Array.from(svg?.querySelectorAll?.(`[data-series-key="${CSS.escape(key)}"]`) || []);
    const payload = window.Components?.[type]?.getPayload?.();
    return {
      sameFrame: svg === window.__liveTraceFrame,
      replacementCount: window.__liveTraceReplacementCount || 0,
      fills: nodes.map(node => node.getAttribute('fill')).filter(Boolean),
      persisted: payload?.config?.seriesColors?.[key] || null
    };
  }, { ...component, seriesKey });

  expect(result.sameFrame).toBe(true);
  expect(result.replacementCount).toBe(0);
  expect(result.fills.map(value => value.toLowerCase())).toContain('#2f9d84');
  expect(result.persisted?.toLowerCase()).toBe('#2f9d84');
});

test('histogram live axis projection remains isolated between same-component tabs', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = COMPONENTS.find(entry => entry.type === 'hist');
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  const tabA = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId);

  const axisA = page.locator(`${component.svgSelector} [data-axis-control="1"]`).first();
  await expect(axisA).toHaveAttribute('data-graphitix-visual-target', '1', { timeout: 30_000 });
  await axisA.dispatchEvent('click');
  await page.locator('.axis-controls-panel[data-open="1"] .axis-controls-panel__field--style input[type="number"]')
    .evaluate(input => {
      input.value = '3';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  expect(await page.evaluate(() => window.Components.hist.getPayload()?.config?.axis?.strokeWidth)).toBe(3);

  await openComponentFromWelcome(page, component, { first: false, loadExample: true });
  const tabB = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId);
  expect(tabB).not.toBe(tabA);
  await expect(page.locator(`${component.svgSelector} [data-axis-control="1"]`).first())
    .toHaveAttribute('data-graphitix-visual-target', '1', { timeout: 30_000 });
  expect(await page.evaluate(() => window.Components.hist.getPayload()?.config?.axis?.strokeWidth)).toBe(1);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabA}"]`).click({ force: true });
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabA);
  await expect(page.locator(`${component.svgSelector} [data-axis-control="1"]`).first())
    .toHaveAttribute('stroke-width', '3', { timeout: 30_000 });
  expect(await page.evaluate(() => window.Components.hist.getPayload()?.config?.axis?.strokeWidth)).toBe(3);
});
