const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const CASES = ['scatter', 'pca', 'roc'].map(type => {
  const component = COMPONENT_MATRIX.find(item => item.type === type);
  if (!component) throw new Error(`Missing component matrix entry for ${type}`);
  return component;
});

async function waitForCanonicalExample(page, type) {
  await page.waitForFunction(componentType => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const containsNumericValue = value => {
      if (Array.isArray(value)) return value.some(containsNumericValue);
      if (!value || typeof value !== 'object') {
        return (typeof value === 'number' && Number.isFinite(value))
          || (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim()));
      }
      return Object.values(value).some(containsNumericValue);
    };
    return tab?.type === componentType && containsNumericValue(tab?.payload?.data);
  }, type, { timeout: 120_000 });
}

async function openExample(page, component, first) {
  await openComponentFromWelcome(page, component, { first });
  await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, component.exampleButtonId);
  await waitForCanonicalExample(page, component.type);
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

for (const component of CASES) {
  test(`${component.type}: inactive payload capture returns the canonical owner without reprojecting`, async ({ page }) => {
    test.setTimeout(component.type === 'roc' ? 240_000 : 120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    const firstTabId = await openExample(page, component, true);
    const expectedSignature = await page.evaluate(async ({ type, tabId }) => {
      const session = window.Main.session;
      const tab = session.workspaceState.tabs.find(item => item.id === tabId);
      const config = window.Main.components.registry[type];
      const clone = value => session.clonePayload ? session.clonePayload(value) : structuredClone(value);
      const payload = clone(tab.payload);
      const mutateFirstNumericLeaf = value => {
        if (!value || typeof value !== 'object') return false;
        const keys = Array.isArray(value) ? value.keys() : Object.keys(value);
        for (const key of keys) {
          const current = value[key];
          if (typeof current === 'number' && Number.isFinite(current)) {
            value[key] = current + 0.125;
            return true;
          }
          if (typeof current === 'string' && /^-?\d+(?:\.\d+)?$/.test(current.trim())) {
            value[key] = String(Number(current) + 0.125);
            return true;
          }
          if (current && typeof current === 'object' && mutateFirstNumericLeaf(current)) return true;
        }
        return false;
      };
      if (!mutateFirstNumericLeaf(payload.data)) {
        throw new Error(`Unable to create an owner-specific ${type} payload`);
      }
      session.assignTabPayload(tab, payload, { reason: `e2e-${type}-inactive-owner-marker` });
      const loaded = config.loadFromPayload?.(clone(payload), {
        tab,
        tabId,
        type,
        reason: `e2e-${type}-inactive-owner-marker`
      });
      if (loaded?.then) await loaded;
      return session.serializePayloadSignature(tab.payload);
    }, { type: component.type, tabId: firstTabId });

    const secondTabId = await openExample(page, component, false);
    expect(secondTabId).not.toBe(firstTabId);

    const result = await page.evaluate(({ type, firstId, secondId }) => {
      const session = window.Main.session;
      const config = window.Main.components.registry[type];
      const firstTab = session.workspaceState.tabs.find(item => item.id === firstId);
      const captured = config.getPayload({
        tab: firstTab,
        tabId: firstId,
        type,
        reason: `e2e-${type}-inactive-capture`
      });
      return {
        activeTabId: session.workspaceState.activeTabId,
        capturedSignature: session.serializePayloadSignature(captured),
        canonicalSignature: session.serializePayloadSignature(firstTab.payload),
        secondTabId: secondId
      };
    }, { type: component.type, firstId: firstTabId, secondId: secondTabId });

    expect(result.activeTabId).toBe(secondTabId);
    expect(result.capturedSignature).toBe(expectedSignature);
    expect(result.capturedSignature).toBe(result.canonicalSignature);
  });
}
