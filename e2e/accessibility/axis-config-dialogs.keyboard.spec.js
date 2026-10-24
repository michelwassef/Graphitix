const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { expectTargetsAtLeast24 } = require('../helpers/targetSizeAssertions');

const AXIS_DIALOG_COMPONENTS = ['line', 'box', 'scatter'].map(type => {
  const component = COMPONENT_MATRIX.find(candidate => candidate.type === type);
  if (!component) throw new Error(`The ${type} workspace harness entry is missing.`);
  return component;
});

async function openLineAxisControls(page, component = COMPONENT_MATRIX.find(item => item.type === 'line')){
  if (!component) throw new Error('The requested axis workspace harness entry is missing.');

  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 30_000
  });

  const axis = page.locator(`#${component.pageId}:not([hidden]) [data-axis-control="1"][data-axis-key="y"]`).first();
  await expect(axis).toHaveCount(1, { timeout: 30_000 });
  await axis.dispatchEvent('click');
  const axisPanel = page.locator(`#${component.pageId}:not([hidden]) .axis-controls-panel:visible`);
  await expect(axisPanel).toHaveCount(1);
  expect(await axisPanel.evaluate(node => ({ hidden: node.hidden, inlineDisplay: node.style.display, display: getComputedStyle(node).display })))
    .toEqual({ hidden: false, inlineDisplay: '', display: 'flex' });

  const topLevelActions = page.locator(
    `#${component.pageId}:not([hidden]) .axis-controls-panel__button--additional-ticks, `
      + `#${component.pageId}:not([hidden]) .axis-controls-panel__button--break-axis`
  );
  await expect(topLevelActions).toHaveCount(2);
  const actionMetrics = await topLevelActions.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return {
      height: style.height,
      minHeight: style.minHeight,
      maxHeight: style.maxHeight,
      padding: style.padding,
      lineHeight: style.lineHeight,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight
    };
  }));
  const expectedMetrics = await page.evaluate(pageId => {
    const owner = document.querySelector(`#${pageId}:not([hidden]) .axis-controls-panel__button--additional-ticks`);
    const ownerStyle = getComputedStyle(owner);
    const height = ownerStyle.getPropertyValue('--ui-control-height').trim();
    return {
      height,
      minHeight: height,
      maxHeight: height,
      padding: '2px 10px',
      lineHeight: ownerStyle.getPropertyValue('--ui-control-line-height').trim(),
      fontSize: ownerStyle.getPropertyValue('--ui-control-font-size').trim(),
      fontWeight: '500'
    };
  }, component.pageId);
  expect(actionMetrics).toEqual([expectedMetrics, expectedMetrics]);
}

async function expectDialogWithinViewport(page, dialog){
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(321);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(401);
}

async function expectAxisPopupSurface(dialog){
  const surface = await dialog.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow
    };
  });
  expect(surface.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(surface.borderStyle).toBe('solid');
  expect(surface.borderWidth).toBe('1px');
  expect(surface.borderRadius).not.toBe('0px');
  expect(surface.boxShadow).not.toBe('none');
}

async function openSameTypeAxisOwners(page, component){
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

  await openComponentFromWelcome(page, component, { loadExample: true });
  await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(firstTabId).toBeTruthy();
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-axis-popup-owner-open' });
  }, firstTabId);
  await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const axis = page.locator(`#${component.pageId}:not([hidden]) [data-axis-control="1"][data-axis-key="y"]`).first();
  await expect(axis).toHaveCount(1, { timeout: 30_000 });
  await axis.dispatchEvent('click');
  return { firstTabId, secondTabId };
}

for (const component of AXIS_DIALOG_COMPONENTS) {
test(`${component.type} Additional ticks popup is a named dialog with entry and Escape focus return`, async ({ page }) => {
  test.setTimeout(60_000);
  await openLineAxisControls(page, component);
  const trigger = page.getByRole('button', { name: 'Additional ticks/lines' });
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Additional ticks and lines settings' });
  await expect(dialog).toBeVisible();
  await expectAxisPopupSurface(dialog);
  await expectTargetsAtLeast24(dialog.getByRole('button'), 'additional-ticks dialog');
  const dialogId = await dialog.getAttribute('id');
  expect(dialogId).toBeTruthy();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(trigger).toHaveAttribute('aria-controls', dialogId);
  const addMarkButton = dialog.getByRole('button', { name: '+ Add Mark' });
  await expect(addMarkButton).toBeVisible();
  await expect(addMarkButton).toBeFocused();
  expect(await addMarkButton.evaluate(node => ({ hidden: node.hidden, inlineDisplay: node.style.display, display: getComputedStyle(node).display })))
    .toEqual({ hidden: false, inlineDisplay: '', display: 'flex' });
  await expectDialogWithinViewport(page, dialog);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(addMarkButton).toBeHidden();
});

test(`${component.type} Break axis popup is a named dialog with entry and Escape focus return`, async ({ page }) => {
  test.setTimeout(60_000);
  await openLineAxisControls(page, component);
  const trigger = page.getByRole('button', { name: 'Break axis' });
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Broken axis settings' });
  await expect(dialog).toBeVisible();
  await expectAxisPopupSurface(dialog);
  await expectTargetsAtLeast24(dialog.locator('.axis-controls-panel__checkbox-label'), 'broken-axis dialog checkbox');
  const dialogId = await dialog.getAttribute('id');
  expect(dialogId).toBeTruthy();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(trigger).toHaveAttribute('aria-controls', dialogId);
  await expect(dialog.getByRole('checkbox', { name: 'Enable Broken Axis' })).toBeFocused();
  const segments = dialog.locator('.axis-controls-panel__segments-container');
  const addBreakButton = dialog.getByRole('button', { name: '+ Add Break' });
  await expect(segments).toBeHidden();
  await expect(addBreakButton).toBeHidden();
  await dialog.getByRole('checkbox', { name: 'Enable Broken Axis' }).check();
  await expect(segments).toBeVisible();
  await expect(addBreakButton).toBeVisible();
  expect(await addBreakButton.evaluate(node => ({ hidden: node.hidden, inlineDisplay: node.style.display, display: getComputedStyle(node).display })))
    .toEqual({ hidden: false, inlineDisplay: '', display: 'flex' });
  const controlRadii = await dialog.evaluate(node => {
    const field = node.closest('.axis-controls-panel__field--broken-axis');
    return Array.from(field.querySelectorAll(
      '.axis-controls-panel__checkbox-label, .axis-controls-panel__checkbox, .axis-controls-panel__button--add-segment'
    )).map(control => getComputedStyle(control).borderRadius);
  });
  expect(controlRadii).toEqual(['0px', '0px', '0px']);
  const subdivision = page.locator(`#${component.pageId}:not([hidden]) .axis-controls-panel__input--subdivision`);
  await expect(subdivision).toBeVisible();
  expect(await subdivision.evaluate(node => getComputedStyle(node).borderRadius)).toBe('0px');
  const compactNumericRadii = await page.locator(
    `#${component.pageId}:not([hidden]) .axis-controls-panel__field--numeric .axis-controls-panel__input--small:visible`
  ).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderRadius));
  expect(compactNumericRadii.length).toBeGreaterThan(0);
  expect(new Set(compactNumericRadii)).toEqual(new Set(['0px']));
  await expectDialogWithinViewport(page, dialog);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(addBreakButton).toBeHidden();
});
}

for (const component of AXIS_DIALOG_COMPONENTS) {
  for (const popup of [
    { triggerName: 'Additional ticks/lines', dialogName: 'Additional ticks and lines settings', triggerSelector: '.axis-controls-panel__button--additional-ticks' },
    { triggerName: 'Break axis', dialogName: 'Broken axis settings', triggerSelector: '.axis-controls-panel__button--break-axis' }
  ]) {
    test(`${component.type} ${popup.triggerName} dialog closes when its owner deactivates`, async ({ page }) => {
      test.setTimeout(120_000);
      const { firstTabId, secondTabId } = await openSameTypeAxisOwners(page, component);
      const trigger = page.getByRole('button', { name: popup.triggerName });
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeEnabled();
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: popup.dialogName });
      await expect(dialog).toBeVisible();

      await page.evaluate(async tabId => {
        await window.Main.tabs.activateTab(tabId, { reason: 'e2e-axis-popup-owner-deactivate' });
      }, secondTabId);
      await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
      await expect(dialog).toBeHidden();

      await page.evaluate(async tabId => {
        await window.Main.tabs.activateTab(tabId, { reason: 'e2e-axis-popup-owner-restore' });
      }, firstTabId);
      await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
      await expect(dialog).toBeHidden();
      const restoredTrigger = page.locator(`#${component.pageId}:not([hidden]) ${popup.triggerSelector}`);
      if (!await restoredTrigger.isVisible()) {
        const axis = page.locator(`#${component.pageId}:not([hidden]) [data-axis-control="1"][data-axis-key="y"]`).first();
        await axis.dispatchEvent('click');
        await expect(restoredTrigger).toBeVisible();
      }
      await expect(restoredTrigger).toHaveAttribute('aria-expanded', 'false');
    });
  }
}

test('pointer focus does not highlight shared numeric controls', async ({ page }) => {
  test.setTimeout(60_000);
  await openLineAxisControls(page);
  const field = page.locator('#linePage:not([hidden]) .axis-controls-panel__field--tick-interval input');
  await expect(field).toBeVisible();
  await expect(field).toBeEnabled();

  const resting = await field.evaluate(node => {
    node.blur();
    const style = getComputedStyle(node);
    return {
      outline: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      borderColor: style.borderColor,
      borderWidth: style.borderWidth
    };
  });
  await field.click();
  const focused = await field.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      modality: window.Shared.focusModality.getCurrentModality(),
      outline: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      borderColor: style.borderColor,
      borderWidth: style.borderWidth
    };
  });

  expect(focused.modality).toBe('pointer');
  expect({
    outline: focused.outline,
    outlineWidth: focused.outlineWidth,
    boxShadow: focused.boxShadow,
    borderColor: focused.borderColor,
    borderWidth: focused.borderWidth
  }).toEqual(resting);

  await page.keyboard.press('Tab');
  await field.focus();
  const keyboardFocus = await field.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      modality: window.Shared.focusModality.getCurrentModality(),
      focusVisible: node.matches(':focus-visible'),
      outline: style.outlineStyle,
      outlineWidth: style.outlineWidth
    };
  });
  expect(keyboardFocus.modality).toBe('keyboard');
  expect(keyboardFocus.focusVisible).toBe(true);
  expect(keyboardFocus.outline).toBe('solid');
  expect(Number.parseFloat(keyboardFocus.outlineWidth)).toBeGreaterThan(0);
});
