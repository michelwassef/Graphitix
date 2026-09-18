const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const {
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { requestRecoveryCheckpoint } = require('../helpers/recoveryDriver');

const CASES = [
  {
    type: 'line',
    pageId: 'linePage',
    exampleButtonId: 'lineLoadExample',
    viewModeId: 'lineViewMode',
    svgSelector: '#linePage:not([hidden]) #linePlot #lineSvg'
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    exampleButtonId: 'scatterLoadExample',
    viewModeId: 'scatterViewMode',
    select3dBeforeExample: true,
    svgSelector: '#scatterPage:not([hidden]) #scatterPlot #scatterSvg'
  },
  {
    type: 'pca',
    pageId: 'pcaPage',
    exampleButtonId: 'pcaLoadExample',
    viewModeId: 'pcaViewMode',
    svgSelector: '#pcaPage:not([hidden]) #pcaSvg'
  },
  {
    type: 'surface',
    pageId: 'surfacePage',
    exampleButtonId: 'surfaceLoadExample',
    svgSelector: '#surfacePage:not([hidden]) #surfaceSvg'
  }
];

async function open3dExample(page, component) {
  await openComponentFromWelcome(page, component, { first: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    timeout: 30_000
  });
  if (component.select3dBeforeExample && component.viewModeId) {
    await page.locator(`#${component.viewModeId}`).selectOption('3d');
  }
  await clickExampleButtonIfPresent(page, component.exampleButtonId);
  if (!component.select3dBeforeExample && component.viewModeId) {
    await page.locator(`#${component.viewModeId}`).selectOption('3d');
  }
  await page.waitForFunction(selector => {
    const svg = document.querySelector(selector);
    return !!svg
      && svg.dataset?.rotationControlsAttached === 'true'
      && (svg.dataset?.viewMode === '3d' || svg.id === 'surfaceSvg');
  }, component.svgSelector, { timeout: 30_000 });
}

test.describe.configure({ mode: 'parallel' });

async function readRotationControl(page, selector) {
  return page.evaluate(svgSelector => {
    const svg = document.querySelector(svgSelector);
    const state = svg?.__plot3dRotationControl?.state || null;
    return state ? {
      x: Number(state.x) || 0,
      y: Number(state.y) || 0,
      z: Number(state.z) || 0
    } : null;
  }, selector);
}

function maxRotationDelta(before, after) {
  if (!before || !after) return 0;
  return Math.max(
    Math.abs(after.x - before.x),
    Math.abs(after.y - before.y),
    Math.abs(after.z - before.z)
  );
}

for (const component of CASES) {
  test(`${component.type} rotation remains live while recovery capture is due`, async ({ page }) => {
    test.setTimeout(120_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await open3dExample(page, component);

    await page.evaluate(() => {
      const actions = window.Main?.sessionActions;
      if (!actions) return;
      window.__rotationRecoveryBuildCalls = 0;
      if (!actions.__rotationRecoveryOriginalBuild) {
        actions.__rotationRecoveryOriginalBuild = actions.buildWorkspaceArchiveBlob;
      }
      actions.buildWorkspaceArchiveBlob = async () => {
        window.__rotationRecoveryBuildCalls += 1;
        return new Blob(['rotation-recovery-smoke'], { type: 'application/zip' });
      };
    });

    // Complete any checkpoint caused by example loading, then seed a new revision.
    // The later direct request models the scheduled deadline without sleeping.
    await requestRecoveryCheckpoint(page, 'e2e-rotation-recovery-example-drain');
    await page.evaluate(() => {
      window.__rotationRecoveryBuildCalls = 0;
      const session = window.Main?.session;
      const activeTab = session?.getActiveTab?.();
      session?.markTabUserModified?.(activeTab?.id, 'e2e-rotation-recovery-interlock', {
        origin: 'user',
        source: 'e2e',
        affectsPayload: false
      });
    });
    await page.waitForFunction(() => window.Main?.session?.workspaceState?.sessionUserDirty === true, null, {
      timeout: 10_000,
      polling: 'raf'
    });

    const svg = page.locator(component.svgSelector).first();
    const box = await svg.boundingBox();
    expect(box).toBeTruthy();
    const identity = `recovery-interlock-${component.type}-${Date.now()}`;
    await svg.evaluate((node, token) => { node.dataset.e2eRecoveryIdentity = token; }, identity);
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 30, startY + 20, { steps: 10 });
    const beforeDeadline = await readRotationControl(page, component.svgSelector);
    await page.waitForFunction(() => window.Shared?.plot3d?.getActiveRotationGestureCount?.() === 1, null, {
      timeout: 5000,
      polling: 'raf'
    });
    const deferred = await requestRecoveryCheckpoint(page, 'e2e-rotation-recovery-deadline');
    expect(deferred).toMatchObject({ status: 'deferred', reason: 'active-rotation-gesture' });

    const duringDeadline = await page.evaluate(({ selector, token }) => {
      const activeSvg = document.querySelector(selector);
      return {
        buildCalls: window.__rotationRecoveryBuildCalls || 0,
        activeGestureCount: window.Shared?.plot3d?.getActiveRotationGestureCount?.() || 0,
        retainedIdentity: activeSvg?.dataset?.e2eRecoveryIdentity === token
      };
    }, { selector: component.svgSelector, token: identity });
    expect(duringDeadline).toEqual({
      buildCalls: 0,
      activeGestureCount: 1,
      retainedIdentity: true
    });

    await page.mouse.move(startX + 90, startY + 45, { steps: 10 });
    await expect.poll(
      () => readRotationControl(page, component.svgSelector).then(after => maxRotationDelta(beforeDeadline, after)),
      { timeout: 5000, intervals: [50, 100, 250] }
    ).toBeGreaterThan(0.01);
    await page.mouse.up();

    await expect.poll(() => page.evaluate(() => window.__rotationRecoveryBuildCalls || 0), {
      timeout: 7000,
      intervals: [100, 250, 500]
    }).toBe(1);
    await expect.poll(() => page.evaluate(() => window.Shared?.plot3d?.getActiveRotationGestureCount?.() || 0)).toBe(0);
    await expect(svg).toHaveAttribute('data-e2e-recovery-identity', identity);
    expect(issues.critical).toEqual([]);
  });
}
