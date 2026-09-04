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
    const ownerMarker = `Owner marker ${component.type}`;
    await page.evaluate(async ({ type, tabId, marker }) => {
      const session = window.Main.session;
      const tab = session.workspaceState.tabs.find(item => item.id === tabId);
      const config = window.Main.components.registry[type];
      const clone = value => session.clonePayload ? session.clonePayload(value) : structuredClone(value);
      const payload = clone(tab.payload);
      payload.config = { ...(payload.config || {}) };
      if (payload.config.labels && typeof payload.config.labels === 'object') {
        payload.config.labels = { ...payload.config.labels, title: marker };
      } else {
        payload.config.title = marker;
      }
      session.assignTabPayload(tab, payload, { reason: `e2e-${type}-inactive-owner-marker` });
      const loaded = config.loadFromPayload?.(clone(payload), {
        tab,
        tabId,
        type,
        reason: `e2e-${type}-inactive-owner-marker`
      });
      if (loaded?.then) await loaded;
    }, { type: component.type, tabId: firstTabId, marker: ownerMarker });

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
      const secondTab = session.workspaceState.tabs.find(item => item.id === secondId);
      const markerFrom = payload => payload?.config?.labels?.title || payload?.config?.title || null;
      return {
        activeTabId: session.workspaceState.activeTabId,
        capturedSignature: session.serializePayloadSignature(captured),
        canonicalSignature: session.serializePayloadSignature(firstTab.payload),
        capturedMarker: markerFrom(captured),
        canonicalMarker: markerFrom(firstTab?.payload),
        secondMarker: markerFrom(secondTab?.payload),
        secondTabId: secondId
      };
    }, { type: component.type, firstId: firstTabId, secondId: secondTabId });

    expect(result.activeTabId).toBe(secondTabId);
    expect(result.capturedMarker).toBe(ownerMarker);
    expect(result.canonicalMarker).toBe(ownerMarker);
    expect(result.secondMarker).not.toBe(ownerMarker);
    expect(result.capturedSignature).toBe(result.canonicalSignature);
  });
}
