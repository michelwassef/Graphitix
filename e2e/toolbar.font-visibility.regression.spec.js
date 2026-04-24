const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

function isFontControlDebug(msgText) {
  const text = String(msgText || '');
  return text.includes('fontControls') || text.includes('grid-open') || text.includes('hideAll');
}

test('format toolbar stays visible when clicking graph text (line + scatter)', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  const fontLog = [];
  page.on('console', msg => {
    const text = msg.text();
    if (isFontControlDebug(text)) {
      fontLog.push({ type: msg.type(), text });
    }
  });

  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const cases = [
    { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample', graphSelector: '#linePlot svg' },
    { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', graphSelector: '#scatterPlot svg' }
  ];

  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i];
    await openComponentFromWelcome(page, c, { first: i === 0 });
    await clickExampleButtonIfPresent(page, c.exampleButtonId);
    await page.waitForFunction(
      selector => !!document.querySelector(selector + ' text[data-font-editable="1"]'),
      c.graphSelector,
      { timeout: 30_000 }
    );

    const textTarget = page.locator(`${c.graphSelector} text[data-font-editable="1"]`).first();
    await textTarget.click({ force: true });
    await page.waitForTimeout(350);

    const hostState = await page.evaluate((scopeId) => {
      const key = scopeId || '__global__';
      const host = document.querySelector(`.font-toolbar-host[data-font-toolbar-scope="${key}"]`);
      const panel = host ? host.querySelector('.font-controls-panel') : document.querySelector('.font-controls-panel');
      const hostStyle = host ? window.getComputedStyle(host) : null;
      const panelStyle = panel ? window.getComputedStyle(panel) : null;
      return {
        scopeId,
        hasHost: !!host,
        hostDisplay: hostStyle ? hostStyle.display : null,
        hostVisibility: hostStyle ? hostStyle.visibility : null,
        hostRect: host ? host.getBoundingClientRect().width : 0,
        hasPanel: !!panel,
        panelOpen: panel ? panel.dataset.open : null,
        panelDisplay: panelStyle ? panelStyle.display : null,
        panelVisibility: panelStyle ? panelStyle.visibility : null
      };
    }, c.type);

    await testInfo.attach(`font-host-state-${c.type}.json`, {
      body: Buffer.from(JSON.stringify(hostState, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    const panel = page.locator('.font-controls-panel[data-open="1"]');
    await expect(panel, `font panel should be visible for ${c.type}`).toBeVisible();
  }

  await testInfo.attach('font-toolbar-debug-log.json', {
    body: Buffer.from(JSON.stringify(fontLog.slice(-300), null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(issues.critical).toEqual([]);
});

