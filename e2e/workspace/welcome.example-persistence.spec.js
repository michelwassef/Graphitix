const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

test.setTimeout(90_000);

for (const component of COMPONENT_MATRIX) {
  test(`welcome example is persisted before recovery: ${component.type}`, async ({ page }) => {
    const drift = [];
    page.on('console', async message => {
      if (/payload drift observed|payload drift detected/i.test(message.text())) {
        const args = await Promise.all(message.args().map(async arg => {
          try { return await arg.jsonValue(); } catch { return null; }
        }));
        drift.push({ text: message.text(), args });
      }
    });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await page.waitForFunction(type => {
      const session = window.Main?.session;
      const tab = session?.getActiveTab?.();
      return tab?.type === type
        && !!tab.payload
        && session?.tabHasTableData?.(tab) === true
        && tab.payloadDirty === false
        && !!tab.payloadSignature;
    }, component.type, {
      timeout: 30_000,
      polling: 'raf'
    });

    const state = await page.evaluate(() => {
      const session = window.Main?.session;
      const tab = session?.getActiveTab?.();
      return {
        type: tab?.type || null,
        hasPayload: !!tab?.payload,
        hasData: !!(tab && session?.tabHasTableData?.(tab)),
        payloadDirty: !!tab?.payloadDirty,
        payloadSignature: tab?.payloadSignature || null
      };
    });

    expect(state.type).toBe(component.type);
    expect(state.hasPayload).toBe(true);
    expect(state.hasData).toBe(true);
    expect(state.payloadDirty).toBe(false);
    expect(state.payloadSignature).toBeTruthy();
    expect(drift, `${component.type}: ${JSON.stringify(drift)}`).toEqual([]);
  });
}
