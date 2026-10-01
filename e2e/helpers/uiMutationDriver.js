'use strict';

const { getComponentByType } = require('../../test-support/componentCatalog.js');
const { waitForComponentOwnerReady } = require('./contractWaits');

function resolveComponent(componentOrType) {
  return typeof componentOrType === 'string'
    ? getComponentByType(componentOrType)
    : componentOrType;
}

function readControlValue(control, action) {
  return action === 'toggle' ? control.isChecked() : control.inputValue();
}

async function chooseAlternative(control, values, before, component, mutation) {
  const candidates = Array.isArray(values) ? values.map(value => String(value)) : [];
  const available = await control.locator('option').evaluateAll(options => options
    .filter(option => !option.disabled)
    .map(option => String(option.value)));
  const next = candidates.find(value => value !== String(before) && available.includes(value));
  if (!next) {
    throw new Error(`${component.type}/${mutation.id}: no enabled UI alternative for ${String(before)}`);
  }
  await control.selectOption(next);
  return next;
}

async function readActivePayloadPath(page, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  return page.evaluate(pathParts => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => String(tab?.id || '') === String(workspace?.activeTabId || '')) || null;
    let value = active?.payload;
    for (const part of pathParts) value = value == null ? undefined : value[part];
    return value;
  }, parts);
}

async function readActiveDurableValue(page, mutation) {
  const parts = String(mutation?.path || '').split('.').filter(Boolean);
  if (mutation?.authority !== 'layout') return readActivePayloadPath(page, mutation?.path);
  return page.evaluate(pathParts => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => String(tab?.id || '') === String(workspace?.activeTabId || '')) || null;
    const sizing = window.Shared?.graphSizing?.captureLayoutSizing?.(active?.layoutState || null, {
      context: 'test-ui-layout-read'
    }) || null;
    let value = sizing;
    for (const part of pathParts) value = value == null ? undefined : value[part];
    return value;
  }, parts);
}

async function waitForDurableValue(page, mutation, expected, options = {}) {
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 30_000;
  const pathParts = String(mutation?.path || '').split('.').filter(Boolean);
  const authority = mutation?.authority || 'payload';
  await page.waitForFunction(({ pathParts: expectedPath, expectedValue, expectedAuthority }) => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => String(tab?.id || '') === String(workspace?.activeTabId || '')) || null;
    let value;
    if (expectedAuthority === 'layout') {
      const sizing = window.Shared?.graphSizing?.captureLayoutSizing?.(active?.layoutState || null, {
        context: 'test-ui-layout-wait'
      }) || null;
      value = sizing;
    } else {
      value = active?.payload;
    }
    for (const part of expectedPath) value = value == null ? undefined : value[part];
    return JSON.stringify(value) === JSON.stringify(expectedValue);
  }, { pathParts, expectedValue: expected, expectedAuthority: authority }, { timeout, polling: 'raf' });
}

async function applyHorizontalDrag(page, control, component, mutation, options, timeout) {
  const before = await readActiveDurableValue(page, mutation);
  const beforeNumber = Number(before);
  if (!Number.isFinite(beforeNumber)) {
    throw new Error(`${component.type}/${mutation.id}: layout path is not numeric before the drag`);
  }
  const box = await control.boundingBox();
  if (!box) {
    throw new Error(`${component.type}/${mutation.id}: UI resizer has no bounding box`);
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const delta = Number(mutation.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error(`${component.type}/${mutation.id}: horizontal drag has no valid delta`);
  }
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  try {
    await page.mouse.move(startX + delta, startY, { steps: mutation.steps || 12 });
  } finally {
    await page.mouse.up();
  }

  const readiness = await waitForComponentOwnerReady(page, component, {
    expectedTabId: options.expectedTabId,
    requireMountedRoot: true,
    requirePublished: options.requirePublished !== false,
    requireIdle: options.requireIdle !== false,
    timeout
  });

  const after = await readActiveDurableValue(page, mutation);
  const afterNumber = Number(after);
  const minDelta = Number.isFinite(Number(mutation.minDelta)) ? Number(mutation.minDelta) : 1;
  if (!Number.isFinite(afterNumber) || Math.abs(afterNumber - beforeNumber) < minDelta) {
    throw new Error(`${component.type}/${mutation.id}: UI resize did not change the owner layout`);
  }
  return { before: beforeNumber, after: afterNumber, expected: afterNumber, readiness };
}

async function applyUiMutation(page, componentOrType, mutation, options = {}) {
  const component = resolveComponent(componentOrType);
  if (!component?.type || !component.pageId) {
    throw new Error('UI mutation requires a complete component catalog entry');
  }
  if (!mutation?.selector || !mutation.action) {
    throw new Error(`${component.type}: incomplete UI mutation metadata`);
  }
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 30_000;
  const root = page.locator(`#${component.pageId}:not([hidden])`).first();
  await root.waitFor({ state: 'visible', timeout });
  const control = root.locator(mutation.selector).first();
  await control.waitFor({ state: mutation.action === 'drag-horizontal' ? 'visible' : 'attached', timeout });
  if (!(await control.isEnabled())) {
    throw new Error(`${component.type}/${mutation.id}: UI control is disabled`);
  }

  if (mutation.action === 'drag-horizontal') {
    await control.scrollIntoViewIfNeeded();
    return applyHorizontalDrag(page, control, component, mutation, options, timeout);
  }

  const before = await readControlValue(control, mutation.action);
  let expected;
  if (mutation.action === 'toggle') {
    expected = !before;
    await control.setChecked(expected);
  } else if (mutation.action === 'select-alternative') {
    expected = await chooseAlternative(control, mutation.values, before, component, mutation);
  } else {
    throw new Error(`${component.type}/${mutation.id}: unsupported UI action ${mutation.action}`);
  }

  const readiness = await waitForComponentOwnerReady(page, component, {
    expectedTabId: options.expectedTabId,
    requireMountedRoot: true,
    requirePublished: options.requirePublished !== false,
    requireIdle: options.requireIdle !== false,
    timeout
  });

  const after = await readControlValue(control, mutation.action);
  if (String(after) !== String(expected)) {
    throw new Error(`${component.type}/${mutation.id}: UI control did not retain the selected value`);
  }
  return { before, after, expected, readiness };
}

async function readActivePayload(page) {
  return page.evaluate(() => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => String(tab?.id || '') === String(workspace?.activeTabId || '')) || null;
    return active?.payload ? JSON.parse(JSON.stringify(active.payload)) : null;
  });
}

async function waitForPayloadValue(page, path, expected, options = {}) {
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 30_000;
  const parts = String(path || '').split('.').filter(Boolean);
  await page.waitForFunction(({ pathParts, expectedValue }) => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => String(tab?.id || '') === String(workspace?.activeTabId || '')) || null;
    let value = active?.payload;
    for (const part of pathParts) value = value == null ? undefined : value[part];
    return JSON.stringify(value) === JSON.stringify(expectedValue);
  }, { pathParts: parts, expectedValue: expected }, { timeout, polling: 'raf' });
}

module.exports = {
  applyUiMutation,
  readActivePayload,
  waitForPayloadValue,
  readActiveDurableValue,
  waitForDurableValue
};
