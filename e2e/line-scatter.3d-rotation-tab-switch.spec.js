const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const CASES = [
  {
    type: 'line',
    pageId: 'linePage',
    viewModeId: 'lineViewMode',
    exampleButtonId: 'lineLoadExample',
    svgSelector: '#linePage:not([hidden]) #linePlot #lineSvg'
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    viewModeId: 'scatterViewMode',
    exampleButtonId: 'scatterLoadExample',
    svgSelector: '#scatterPage:not([hidden]) #scatterPlot #scatterSvg'
  }
];

async function open3dComponent(page, component) {
  await openComponentFromWelcome(page, component, { first: true });
  await page.waitForFunction(type => !!window.Components?.[type]?.ready, component.type, { timeout: 30_000 });
  if (component.type === 'scatter') {
    await page.locator(`#${component.viewModeId}`).selectOption('3d');
    await page.waitForTimeout(300);
  }
  await clickExampleButtonIfPresent(page, component.exampleButtonId);
  await page.waitForFunction((selector) => !!document.querySelector(selector), component.svgSelector, { timeout: 30_000 });
  if (component.type !== 'scatter') {
    await page.locator(`#${component.viewModeId}`).selectOption('3d');
  }
  await page.waitForFunction((selector) => {
    const svg = document.querySelector(selector);
    return !!svg && svg.dataset?.viewMode === '3d';
  }, component.svgSelector, { timeout: 30_000 });
  await page.waitForTimeout(800);
  return page.evaluate(type => {
    const state = window.Main?.session?.workspaceState;
    return state?.tabs?.find(tab => tab && tab.type === type)?.id || null;
  }, component.type);
}

async function switchAwayAndBack(page, awayComponent, tabId) {
  if (awayComponent.sameTypeBlank) {
    await page.evaluate(async (type) => {
      window.Main?.tabs?.handleAddTabClick?.();
      await new Promise(resolve => setTimeout(resolve, 50));
      const result = window.Main?.tabs?.handleGraphSelection?.(type, {
        reason: 'e2e-same-component-3d-rotation-switch',
        forceBlankWorkspace: true,
        disableDuplicatePrompt: true
      });
      if (result && typeof result.then === 'function') {
        await result;
      }
    }, awayComponent.type);
  } else {
    await openComponentFromWelcome(page, awayComponent, { first: false });
  }
  await page.waitForSelector(`#${awayComponent.pageId}:not([hidden])`, { timeout: 20_000 });
  await page.evaluate(async (id) => {
    const result = window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-3d-rotation-tab-switch-return' });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, tabId);
}

async function readPayloadRotation(page, type) {
  return page.evaluate(componentType => {
    const rotation = window.Components?.[componentType]?.getPayload?.()?.config?.rotation || null;
    if (!rotation) {
      return null;
    }
    return {
      x: Number(rotation.x) || 0,
      y: Number(rotation.y) || 0,
      z: Number(rotation.z) || 0
    };
  }, type);
}

async function readSvgSignature(page, selector) {
  return page.evaluate((svgSelector) => {
    const svg = document.querySelector(svgSelector);
    if (!svg) {
      return null;
    }
    const texts = Array.from(svg.querySelectorAll('text')).slice(0, 20).map(node => [
      node.textContent || '',
      node.getAttribute('x') || '',
      node.getAttribute('y') || '',
      node.getAttribute('transform') || ''
    ]);
    const points = Array.from(svg.querySelectorAll('circle,path,line,polyline,polygon')).slice(0, 80).map(node => [
      node.tagName,
      node.getAttribute('cx') || '',
      node.getAttribute('cy') || '',
      node.getAttribute('x1') || '',
      node.getAttribute('y1') || '',
      node.getAttribute('x2') || '',
      node.getAttribute('y2') || '',
      node.getAttribute('d') || '',
      node.getAttribute('points') || '',
      node.getAttribute('transform') || ''
    ]);
    return JSON.stringify({ viewBox: svg.getAttribute('viewBox') || '', texts, points });
  }, selector);
}

function maxRotationDelta(before, after) {
  if (!before || !after) {
    return 0;
  }
  return Math.max(
    Math.abs(after.x - before.x),
    Math.abs(after.y - before.y),
    Math.abs(after.z - before.z)
  );
}

async function dragSvg(page, selector) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} should have a bounding box`).toBeTruthy();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(800);
}

async function expectRotationAfterTabSwitch(page, component, tabId, awayComponent, label) {
  await switchAwayAndBack(page, awayComponent, tabId);
  await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
  await page.waitForFunction((selector) => {
    const svg = document.querySelector(selector);
    return !!svg && svg.dataset?.viewMode === '3d' && svg.dataset?.rotationControlsAttached === 'true';
  }, component.svgSelector, { timeout: 20_000 });

  const before = await readPayloadRotation(page, component.type);
  const beforeSvg = await readSvgSignature(page, component.svgSelector);
  await dragSvg(page, component.svgSelector);
  const after = await readPayloadRotation(page, component.type);
  const afterSvg = await readSvgSignature(page, component.svgSelector);

  expect(
    maxRotationDelta(before, after),
    `${component.type} payload rotation should change after dragging restored 3D graph (${label})`
  ).toBeGreaterThan(1e-4);
  expect(afterSvg, `${component.type} SVG should visually redraw after restored 3D drag (${label})`).not.toBe(beforeSvg);
}

for (const component of CASES) {
  test(`${component.type} 3D rotation remains live after switching tabs`, async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    const tabId = await open3dComponent(page, component);
    expect(tabId, `${component.type} tab id should be available`).toBeTruthy();

    await expectRotationAfterTabSwitch(
      page,
      component,
      tabId,
      { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' },
      'different component'
    );
    await expectRotationAfterTabSwitch(
      page,
      component,
      tabId,
      { ...component, sameTypeBlank: true },
      'same component'
    );
    expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
  });
}
