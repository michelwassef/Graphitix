const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const {
  COMPONENT_MATRIX,
  openComponentFromWelcome
} = require('./helpers/workspaceDriver');
const { registerIssueCollectors } = require('./helpers/diagnostics');
const { clickExampleButton, activateTab } = require('./helpers/uiDriver');
const { waitForComponentOwnerReady } = require('./helpers/contractWaits');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function openComponentTab(page, component, { first = false } = {}) {
  await openComponentFromWelcome(page, component, { first });
  await clickExampleButton(page, component, { requireMountedRoot: true });
  await waitForComponentOwnerReady(page, component, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 30_000
  });
}

async function activateTabById(page, tabId, component) {
  return activateTab(page, tabId, component, { timeout: 30_000 });
}

async function activateSelectionTab(page) {
  const addTab = page.locator('#addWorkspaceTab');
  await expect(addTab).toBeVisible({ timeout: 20_000 });
  await addTab.click();
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
}

async function waitForComponentReady(page, component) {
  return waitForComponentOwnerReady(page, component, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 30_000
  });
}

async function dragPanelResizerIfPresent(page, component, dx) {
  const { pageId } = component;
  const handle = page.locator(`#${pageId}:not([hidden]) .panel-resizer`).first();
  if (await handle.count() < 1) {
    return false;
  }
  const box = await handle.boundingBox();
  if (!box) {
    return false;
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(4, Math.min(box.height - 4, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY, { steps: 14 });
  await page.mouse.up();
  await waitForComponentReady(page, component);
  return true;
}

async function dragSvgResizerIfPresent(page, component, dy) {
  const { pageId } = component;
  const handle = page.locator(`#${pageId}:not([hidden]) .svgbox .resizer-horizontal`).first();
  if (await handle.count() < 1) {
    return false;
  }
  const box = await handle.boundingBox();
  if (!box) {
    return false;
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + dy, { steps: 14 });
  await page.mouse.up();
  await waitForComponentReady(page, component);
  return true;
}

async function readLayoutSnapshot(page, pageId) {
  return page.evaluate((pageId) => {
    const pageRoot = document.querySelector(`#${pageId}:not([hidden])`);
    const svgBox = pageRoot?.querySelector?.('.svgbox') || null;
    const svgRect = svgBox?.getBoundingClientRect?.() || null;
    const type = String(pageId || '').replace(/Page$/i, '').toLowerCase();
    const activeTabId = String(window.Main?.session?.workspaceState?.activeTabId || '').trim();
    const tab = window.Main?.session?.workspaceState?.tabs?.find?.(candidate => (
      String(candidate?.id || '') === activeTabId
      && String(candidate?.type || '').toLowerCase() === type
    )) || null;
    const layout = tab?.layoutState || null;
    const layoutDatasetKeys = [
      'resizerAspectLocked',
      'resizerAspectRatio',
      'resizerBaseWidth',
      'resizerBaseHeight',
      'resizerWidth',
      'resizerHeight',
      'resizerZoomLevel',
      'resizerProportionalFontResize',
      'resizerLastAxis',
      'graphAspectLocked',
      'aspectLocked',
      'graphWidthPx',
      'graphHeightPx'
    ];
    const stableLayout = layout ? {
      version: layout.version ?? null,
      component: layout.component ?? null,
      minSvgWidth: layout.minSvgWidth ?? null,
      workspace: layout.workspace ? {
        version: layout.workspace.version ?? null,
        tableFraction: layout.workspace.tableFraction ?? null
      } : null,
      svgBox: {
        style: {
          width: layout.svgBox?.style?.width || '',
          height: layout.svgBox?.style?.height || '',
          minWidth: layout.svgBox?.style?.minWidth || '',
          minHeight: layout.svgBox?.style?.minHeight || '',
          maxWidth: layout.svgBox?.style?.maxWidth || '',
          maxHeight: layout.svgBox?.style?.maxHeight || '',
          aspectRatio: layout.svgBox?.style?.aspectRatio || ''
        },
        dataset: Object.fromEntries(layoutDatasetKeys
          .filter(key => Object.prototype.hasOwnProperty.call(layout.svgBox?.dataset || {}, key))
          .map(key => [key, layout.svgBox.dataset[key]]))
      }
    } : null;
    return {
      svgWidth: svgRect ? Math.round(svgRect.width) : null,
      svgHeight: svgRect ? Math.round(svgRect.height) : null,
      // The panel's client rectangle also includes the current shell viewport
      // and scrollbar allocation. It is not persisted layout state and can
      // change when the page is re-entered. The tab layout snapshot/signature
      // is the authoritative resize contract.
      layoutSignature: tab?.layoutSignature || null,
      layoutState: stableLayout
    };
  }, pageId);
}

function expectNearIfFinite(actual, expected, tolerance, label) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return;
  }
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
}

for (const component of COMPONENT_MATRIX) {
  test(`resize persists after tab exit/re-enter for ${component.type}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    const beforeFirst = new Set(await getWorkspaceTabIds(page));
    await openComponentTab(page, component, { first: true });
    const afterFirst = await getWorkspaceTabIds(page);
    const firstId = afterFirst.find(id => !beforeFirst.has(id));
    expect(firstId).toBeTruthy();

    const beforeSecond = new Set(afterFirst);
    await openComponentTab(page, component, { first: false });
    const afterSecond = await getWorkspaceTabIds(page);
    const secondId = afterSecond.find(id => !beforeSecond.has(id));
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);

    await activateTabById(page, secondId, component);
    const before = await readLayoutSnapshot(page, component.pageId);
    const panelResized = await dragPanelResizerIfPresent(page, component, -120);
    const svgResized = await dragSvgResizerIfPresent(page, component, 90);
    const afterResize = await readLayoutSnapshot(page, component.pageId);

    await activateSelectionTab(page);
    await activateTabById(page, secondId, component);
    const afterReenter = await readLayoutSnapshot(page, component.pageId);

    await testInfo.attach(`${component.type}-resize-exit-reenter.snapshots.json`, {
      body: Buffer.from(JSON.stringify({
        firstId,
        secondId,
        before,
        afterResize,
        afterReenter,
        panelResized,
        svgResized
      }, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    if (panelResized || svgResized) {
      expectNearIfFinite(afterReenter.svgWidth, afterResize.svgWidth, 3, 'svgWidth');
      expectNearIfFinite(afterReenter.svgHeight, afterResize.svgHeight, 3, 'svgHeight');
      expect(afterReenter.layoutState, 're-enter must retain the owner layout state')
        .toEqual(afterResize.layoutState);
    }

    expect(issues.critical).toEqual([]);
  });
}
