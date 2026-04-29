const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function waitForGraphSvg(page, pageId) {
  await page.waitForFunction(
    ({ pageId }) => {
      const root = document.querySelector(`#${pageId}:not([hidden])`);
      const svgBox = root?.querySelector?.('.svgbox');
      const svg = svgBox?.querySelector?.('svg');
      const boxRect = svgBox?.getBoundingClientRect?.();
      const svgRect = svg?.getBoundingClientRect?.();
      return !!(
        svgBox
        && svg
        && boxRect
        && svgRect
        && boxRect.width > 20
        && boxRect.height > 20
        && svgRect.width > 20
        && svgRect.height > 20
      );
    },
    { pageId },
    { timeout: 45_000 }
  );
}

async function disableAxisLengthConstraints(page, pageId) {
  await page.evaluate(({ pageId }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const inputs = [
      ...Array.from(root?.querySelectorAll?.('.resizer-axeslength-checkbox') || []),
      ...Array.from(root?.querySelectorAll?.('#pcaVarianceAxisScale') || [])
    ];
    inputs.forEach(input => {
      if(input?.checked){
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, { pageId });
}

async function setLockRatio(page, pageId, checked) {
  await page.waitForSelector(`#${pageId}:not([hidden]) .svgbox .resizer-aspect-checkbox`, {
    timeout: 30_000,
    state: 'attached'
  });
  await disableAxisLengthConstraints(page, pageId);
  await page.evaluate(({ pageId, checked }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const checkbox = root?.querySelector?.('.svgbox .resizer-aspect-checkbox');
    if(checkbox && checkbox.checked !== checked){
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { pageId, checked });
  await page.waitForTimeout(600);
}

async function clearActiveUndoHistory(page) {
  await page.evaluate(() => {
    window.Shared?.undoManager?.clear?.({ all: false, reason: 'e2e-resize-undo-reset' });
  });
}

async function collectResizeState(page, pageId) {
  return page.evaluate(({ pageId }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const svgBox = root?.querySelector?.('.svgbox');
    const checkbox = svgBox?.querySelector?.('.resizer-aspect-checkbox');
    const rect = svgBox?.getBoundingClientRect?.();
    if(!svgBox || !rect){
      return null;
    }
    return {
      width: rect.width,
      height: rect.height,
      styleWidth: svgBox.style.width || '',
      styleHeight: svgBox.style.height || '',
      aspectLocked: svgBox.dataset.resizerAspectLocked || '',
      checkboxChecked: !!checkbox?.checked,
      canUndo: !!window.Shared?.undoManager?.canUndo?.({ target: svgBox }),
      canRedo: !!window.Shared?.undoManager?.canRedo?.({ target: svgBox })
    };
  }, { pageId });
}

async function dragSvgBoxHandle(page, pageId, handleSelector, dx, dy) {
  const handle = page.locator(`#${pageId}:not([hidden]) .svgbox ${handleSelector}`).first();
  await expect(handle).toHaveCount(1);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if(!box){
    throw new Error(`Missing handle bounding box for ${pageId} ${handleSelector}`);
  }
  const startX = box.x + Math.max(2, Math.min(box.width - 2, box.width / 2));
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
}

async function pressUndo(page) {
  await page.locator('body').click({ position: { x: 5, y: 5 }, force: true });
  await page.keyboard.press('Control+z');
}

async function pressRedo(page) {
  await page.locator('body').click({ position: { x: 5, y: 5 }, force: true });
  await page.keyboard.press('Control+y');
}

function expectNear(actual, expected, tolerance, label) {
  expect(
    Math.abs(Number(actual) - Number(expected)),
    `${label}: expected ${actual} within ${tolerance}px of ${expected}`
  ).toBeLessThanOrEqual(tolerance);
}

test('svgbox drag resize undo and redo restore dimensions in every component', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  for(let index = 0; index < COMPONENT_MATRIX.length; index += 1){
    const component = COMPONENT_MATRIX[index];
    await test.step(`resize undo: ${component.type}`, async () => {
      await openComponentFromWelcome(page, component, { first: index === 0 });
      await clickExampleButtonIfPresent(page, component.exampleButtonId);
      await waitForGraphSvg(page, component.pageId);
      await setLockRatio(page, component.pageId, false);
      await waitForGraphSvg(page, component.pageId);
      await clearActiveUndoHistory(page);

      const before = await collectResizeState(page, component.pageId);
      expect(before, `${component.type} should expose a resize state`).not.toBeNull();
      expect(before.aspectLocked, `${component.type} should be unlocked before drag`).toBe('false');

      await dragSvgBoxHandle(page, component.pageId, '.resizer-horizontal', 0, 76);
      const resized = await collectResizeState(page, component.pageId);
      expect(resized.height, `${component.type} drag should change height`).toBeGreaterThan(before.height + 20);
      expect(resized.canUndo, `${component.type} drag should record an undo entry`).toBeTruthy();

      await pressUndo(page);
      await expect.poll(async () => collectResizeState(page, component.pageId), {
        timeout: 12_000,
        intervals: [150, 300, 600]
      }).toMatchObject({ aspectLocked: 'false', checkboxChecked: false });
      const undone = await collectResizeState(page, component.pageId);
      expectNear(undone.width, before.width, 2, `${component.type} width after drag undo`);
      expectNear(undone.height, before.height, 2, `${component.type} height after drag undo`);
      expect(undone.canRedo, `${component.type} drag undo should expose redo`).toBeTruthy();

      await pressRedo(page);
      await expect.poll(async () => collectResizeState(page, component.pageId), {
        timeout: 12_000,
        intervals: [150, 300, 600]
      }).toMatchObject({ aspectLocked: 'false', checkboxChecked: false });
      const redone = await collectResizeState(page, component.pageId);
      expectNear(redone.width, resized.width, 2, `${component.type} width after drag redo`);
      expectNear(redone.height, resized.height, 2, `${component.type} height after drag redo`);
    });
  }

  expect(issues.critical, `Critical browser issues found: ${JSON.stringify(issues.critical.slice(0, 5), null, 2)}`).toEqual([]);
});

test('lock ratio toggle undo and redo restore scatter dimensions and aspect state', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' }, { first: true });
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await waitForGraphSvg(page, 'scatterPage');
  await setLockRatio(page, 'scatterPage', false);
  await clearActiveUndoHistory(page);

  const before = await collectResizeState(page, 'scatterPage');
  expect(before.aspectLocked).toBe('false');

  await setLockRatio(page, 'scatterPage', true);
  const locked = await collectResizeState(page, 'scatterPage');
  expect(locked.aspectLocked).toBe('true');
  expect(locked.checkboxChecked).toBe(true);
  expect(locked.canUndo).toBeTruthy();

  await pressUndo(page);
  await expect.poll(async () => collectResizeState(page, 'scatterPage'), {
    timeout: 12_000,
    intervals: [150, 300, 600]
  }).toMatchObject({ aspectLocked: 'false', checkboxChecked: false });
  const undone = await collectResizeState(page, 'scatterPage');
  expectNear(undone.width, before.width, 2, 'scatter width after aspect undo');
  expectNear(undone.height, before.height, 2, 'scatter height after aspect undo');

  await pressRedo(page);
  await expect.poll(async () => collectResizeState(page, 'scatterPage'), {
    timeout: 12_000,
    intervals: [150, 300, 600]
  }).toMatchObject({ aspectLocked: 'true', checkboxChecked: true });
  const redone = await collectResizeState(page, 'scatterPage');
  expectNear(redone.width, locked.width, 2, 'scatter width after aspect redo');
  expectNear(redone.height, locked.height, 2, 'scatter height after aspect redo');

  expect(issues.critical, `Critical browser issues found: ${JSON.stringify(issues.critical.slice(0, 5), null, 2)}`).toEqual([]);
});
