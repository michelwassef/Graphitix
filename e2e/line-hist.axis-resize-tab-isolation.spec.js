const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const COMPONENTS = COMPONENT_MATRIX.filter(component => component.type === 'line' || component.type === 'hist');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function getActiveRootSelector(page, component) {
  await page.waitForFunction(({ type, pageId }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    if (!active || active.type !== type) {
      return false;
    }
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type)
      || document.querySelector(`#${pageId}:not([hidden])`)
      || null;
    return !!root?.querySelector?.('.svgbox svg');
  }, { type: component.type, pageId: component.pageId }, { timeout: 45_000 });
  return `#${component.pageId}:not([hidden])`;
}

async function waitForGraphSvg(page, component) {
  await page.waitForFunction(({ type, pageId }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === type
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || document.querySelector(`#${pageId}:not([hidden])`))
      : null;
    const svgBox = root?.querySelector?.('.svgbox') || null;
    const svg = svgBox?.querySelector?.('svg') || null;
    const rect = svg?.getBoundingClientRect?.();
    const viewBox = svg?.viewBox?.baseVal;
    return !!(svg && rect && rect.width > 20 && rect.height > 20 && viewBox && viewBox.width > 20 && viewBox.height > 20);
  }, { type: component.type, pageId: component.pageId }, { timeout: 45_000 });
}

async function openComponentTab(page, component, { first = false } = {}) {
  const before = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, component, { first });
  await clickExampleButtonIfPresent(page, component.exampleButtonId);
  await waitForGraphSvg(page, component);
  const after = await getWorkspaceTabIds(page);
  const tabId = after.find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  return tabId;
}

async function activateTabById(page, tabId, component) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  const clicked = await page.waitForFunction(
    id => window.Main?.session?.workspaceState?.activeTabId === id,
    tabId,
    { timeout: 2_000 }
  ).then(() => true).catch(() => false);
  if (!clicked) {
    await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-axis-resize-activate' }), tabId);
    await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  }
  await waitForGraphSvg(page, component);
  await page.waitForTimeout(250);
}

async function setLockRatio(page, component, checked) {
  await page.evaluate(({ type, pageId, checked }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === type
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || document.querySelector(`#${pageId}:not([hidden])`))
      : null;
    const svgBox = root?.querySelector?.('.svgbox') || null;
    const checkbox = svgBox?.querySelector?.('.resizer-aspect-checkbox') || null;
    if (!checkbox) {
      throw new Error(`Lock ratio checkbox not found for ${type}`);
    }
    if (checkbox.disabled) {
      throw new Error(`Lock ratio checkbox unexpectedly disabled for ${type}`);
    }
    const constraintInputs = Array.from(root?.querySelectorAll?.('.resizer-axeslength-checkbox') || []);
    constraintInputs.forEach(input => {
      if (input && input.checked) {
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    if (checkbox.checked !== checked) {
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { type: component.type, pageId: component.pageId, checked });
  await page.waitForTimeout(500);
}

async function dragSvgBoxHandle(page, component, handleSelector, dx, dy) {
  const rootSelector = await getActiveRootSelector(page, component);
  const handle = page.locator(`${rootSelector} .svgbox ${handleSelector}`).first();
  await expect(handle).toHaveCount(1);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error(`Missing handle bounding box for ${component.type} ${handleSelector}`);
  }
  const startX = box.x + Math.max(2, Math.min(box.width - 2, box.width / 2));
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  await waitForGraphSvg(page, component);
}

async function collectViewportMetrics(page, component) {
  return page.evaluate(({ type, pageId }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === type
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || document.querySelector(`#${pageId}:not([hidden])`))
      : null;
    const svgBox = root?.querySelector?.('.svgbox') || null;
    const svg = svgBox?.querySelector?.('svg') || null;
    const checkbox = svgBox?.querySelector?.('.resizer-aspect-checkbox') || null;
    const boxRect = svgBox?.getBoundingClientRect?.() || null;
    const svgRect = svg?.getBoundingClientRect?.() || null;
    const vb = svg?.viewBox?.baseVal || null;
    if (!svgBox || !svg || !boxRect || !svgRect || !vb || vb.width <= 0 || vb.height <= 0) {
      return null;
    }
    const scaleX = svgRect.width / vb.width;
    const scaleY = svgRect.height / vb.height;
    return {
      activeTabId: active?.id || null,
      rootTabId: root?.dataset?.workspaceTabId || null,
      aspectChecked: !!checkbox?.checked,
      aspectLocked: svgBox.dataset.resizerAspectLocked || '',
      lastAxis: svgBox.dataset.resizerLastAxis || '',
      axisLock: svgBox.dataset.resizerAxisViewportLockAxis || '',
      boxWidth: Math.round(boxRect.width),
      boxHeight: Math.round(boxRect.height),
      svgWidth: Math.round(svgRect.width),
      svgHeight: Math.round(svgRect.height),
      viewBox: {
        minX: Number(vb.x),
        minY: Number(vb.y),
        width: Number(vb.width),
        height: Number(vb.height)
      },
      scaleX,
      scaleY
    };
  }, { type: component.type, pageId: component.pageId });
}

function expectClose(actual, expected, tolerance, label) {
  expect(
    Math.abs(Number(actual) - Number(expected)),
    `${label}: expected ${actual} to stay within ${tolerance} of ${expected}`
  ).toBeLessThanOrEqual(tolerance);
}

for (const component of COMPONENTS) {
  test(`axis-only resize state stays isolated across same-component tabs for ${component.type}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    const firstId = await openComponentTab(page, component, { first: true });
    const secondId = await openComponentTab(page, component, { first: false });
    expect(secondId).not.toBe(firstId);

    const snapshots = [];

    await activateTabById(page, firstId, component);
    await setLockRatio(page, component, false);
    const firstBefore = await collectViewportMetrics(page, component);
    await dragSvgBoxHandle(page, component, '.resizer-horizontal', 0, 86);
    const firstAfterVertical = await collectViewportMetrics(page, component);
    snapshots.push({ step: 'first-after-vertical', snapshot: firstAfterVertical });

    await activateTabById(page, secondId, component);
    await setLockRatio(page, component, true);
    await dragSvgBoxHandle(page, component, '.resizer-horizontal', 0, 74);
    const secondLocked = await collectViewportMetrics(page, component);
    snapshots.push({ step: 'second-locked-resized', snapshot: secondLocked });

    await activateTabById(page, firstId, component);
    const firstBeforeHorizontal = await collectViewportMetrics(page, component);
    await dragSvgBoxHandle(page, component, '.resizer-vertical', 94, 0);
    const firstAfterHorizontal = await collectViewportMetrics(page, component);
    snapshots.push({ step: 'first-after-horizontal', snapshot: firstAfterHorizontal });

    await activateTabById(page, secondId, component);
    const secondAfterReturn = await collectViewportMetrics(page, component);
    snapshots.push({ step: 'second-after-return', snapshot: secondAfterReturn });

    await testInfo.attach(`${component.type}-axis-resize-tab-isolation.snapshots.json`, {
      body: Buffer.from(JSON.stringify({
        firstId,
        secondId,
        firstBefore,
        firstAfterVertical,
        secondLocked,
        firstBeforeHorizontal,
        firstAfterHorizontal,
        secondAfterReturn,
        snapshots
      }, null, 2), 'utf8'),
      contentType: 'application/json'
    });
    expect(firstBefore?.activeTabId).toBe(firstId);
    expect(firstAfterVertical?.activeTabId).toBe(firstId);
    expect(firstBeforeHorizontal?.activeTabId).toBe(firstId);
    expect(firstAfterHorizontal?.activeTabId).toBe(firstId);
    expect(secondLocked?.activeTabId).toBe(secondId);
    expect(secondAfterReturn?.activeTabId).toBe(secondId);
    expect(firstAfterVertical?.rootTabId).toBe(firstId);
    expect(secondLocked?.rootTabId).toBe(secondId);

    expect(firstBefore?.aspectLocked).toBe('false');
    expect(firstAfterVertical?.aspectLocked).toBe('false');
    expect(firstBeforeHorizontal?.aspectLocked).toBe('false');
    expect(firstAfterHorizontal?.aspectLocked).toBe('false');
    expect(secondLocked?.aspectLocked).toBe('true');
    expect(secondAfterReturn?.aspectLocked).toBe('true');

    expect(firstAfterVertical.boxHeight).toBeGreaterThan(firstBefore.boxHeight + 20);
    expectClose(firstAfterVertical.scaleX, firstBefore.scaleX, 0.02, `${component.type} first tab x scale after vertical resize`);
    expectClose(firstAfterVertical.viewBox.minX, firstBefore.viewBox.minX, 1, `${component.type} first tab minX after vertical resize`);
    expectClose(firstAfterVertical.viewBox.width, firstBefore.viewBox.width, 1, `${component.type} first tab viewBox width after vertical resize`);

    expect(firstBeforeHorizontal.boxWidth).toBe(firstAfterVertical.boxWidth);
    expect(firstBeforeHorizontal.boxHeight).toBe(firstAfterVertical.boxHeight);
    expectClose(firstBeforeHorizontal.scaleX, firstAfterVertical.scaleX, 0.005, `${component.type} first tab x scale after returning from second tab`);
    expectClose(firstBeforeHorizontal.scaleY, firstAfterVertical.scaleY, 0.005, `${component.type} first tab y scale after returning from second tab`);
    expectClose(firstBeforeHorizontal.viewBox.minX, firstAfterVertical.viewBox.minX, 0.5, `${component.type} first tab minX after returning from second tab`);
    expectClose(firstBeforeHorizontal.viewBox.minY, firstAfterVertical.viewBox.minY, 0.5, `${component.type} first tab minY after returning from second tab`);
    expectClose(firstBeforeHorizontal.viewBox.width, firstAfterVertical.viewBox.width, 0.5, `${component.type} first tab viewBox width after returning from second tab`);
    expectClose(firstBeforeHorizontal.viewBox.height, firstAfterVertical.viewBox.height, 0.5, `${component.type} first tab viewBox height after returning from second tab`);

    expect(firstAfterHorizontal.boxWidth).toBeGreaterThan(firstBeforeHorizontal.boxWidth + 20);
    expectClose(firstAfterHorizontal.scaleY, firstBeforeHorizontal.scaleY, 0.02, `${component.type} first tab y scale after horizontal resize`);
    expectClose(firstAfterHorizontal.viewBox.minY, firstBeforeHorizontal.viewBox.minY, component.type === 'line' ? 4 : 1, `${component.type} first tab minY after horizontal resize`);
    expectClose(firstAfterHorizontal.viewBox.height, firstBeforeHorizontal.viewBox.height, component.type === 'line' ? 6 : 1, `${component.type} first tab viewBox height after horizontal resize`);

    expect(secondAfterReturn.boxWidth).toBe(secondLocked.boxWidth);
    expect(secondAfterReturn.boxHeight).toBe(secondLocked.boxHeight);
    expect(secondAfterReturn.aspectChecked).toBe(true);
    expect(issues.critical).toEqual([]);
  });
}
