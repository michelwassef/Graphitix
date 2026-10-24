const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function openBoxWorkspace(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) .workspace-toolbar'));
}

async function showSharedSymbolFixture(page) {
  await page.evaluate(() => {
    const activePage = document.querySelector('#boxPage:not([hidden])');
    const anchor = activePage?.querySelector('#boxFontHost');
    if (!anchor || !window.Shared?.symbolToolbar?.show) {
      throw new Error('Box Format toolbar fixture is unavailable.');
    }
    window.Shared.symbolToolbar.show({
      document,
      anchor,
      scopeId: 'box',
      target: anchor,
      scope: {
        label: 'Scope',
        value: 'global',
        options: [{ value: 'global', label: 'Global' }]
      },
      fillShape: {
        label: 'Fill / shape',
        showShapePicker: false,
        getColor() { return '#808080'; },
        getShape() { return 'circle'; },
        onColorInput() {},
        onColorChange() {},
        onShapeChange() {}
      },
      border: {
        label: 'Border',
        getColor() { return '#000000'; },
        onColorInput() {},
        onColorChange() {},
        getWidth() { return 1.5; },
        onWidthChange() {}
      },
      size: { enabled: false },
      transparency: { enabled: false }
    });
  });
}

test('color picker Escape returns focus without closing its Format toolbar', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  await showSharedSymbolFixture(page);
  const host = page.locator('#boxPage .font-toolbar-host[data-font-toolbar-scope="box"]');
  const trigger = host.locator('.shared-border-style-chip');
  const picker = page.getByRole('dialog', { name: 'Color picker' });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(picker).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(picker.getByRole('spinbutton', { name: 'Border thickness' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(host).toHaveClass(/font-toolbar-host--visible/);
});

test('color picker closes on tab deactivation and ignores an older eyedropper result', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  const activateFormatSection = async () => {
    await page.locator('#boxPage:not([hidden]) .workspace-toolbar__tab').filter({ hasText: /^Format$/ }).click();
  };
  await activateFormatSection();
  await showSharedSymbolFixture(page);
  const component = { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' };
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

  await openComponentFromWelcome(page, component, { loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) .workspace-toolbar'));
  await activateFormatSection();
  await showSharedSymbolFixture(page);
  const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-color-picker-owner-change-open' });
  }, firstTabId);
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) .workspace-toolbar'));
  await activateFormatSection();
  await showSharedSymbolFixture(page);

  await page.evaluate(() => {
    window.__eyeDropperStarted = false;
    window.__eyeDropperResolved = false;
    window.__resolveEyeDropper = color => {
      window.__eyeDropperResolved = true;
      window.__resolveEyeDropperValue({ sRGBHex: color });
    };
    window.EyeDropper = class {
      open(){
        window.__eyeDropperStarted = true;
        return new Promise(resolve => { window.__resolveEyeDropperValue = resolve; });
      }
    };
  });

  const picker = page.getByRole('dialog', { name: 'Color picker' });
  const firstTrigger = page.locator('#boxPage:not([hidden]) .font-toolbar-host[data-font-toolbar-scope="box"] .shared-border-style-chip');
  await firstTrigger.click();
  await expect(picker).toBeVisible();
  await picker.locator('.shared-color-picker__eyedropper').click();
  await page.waitForFunction(() => window.__eyeDropperStarted === true);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-color-picker-owner-change-close' });
  }, secondTabId);
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) .workspace-toolbar'));
  await activateFormatSection();
  await showSharedSymbolFixture(page);
  await expect(picker).toBeHidden();

  const secondTrigger = page.locator('#boxPage:not([hidden]) .font-toolbar-host[data-font-toolbar-scope="box"] .shared-border-style-chip');
  await secondTrigger.click();
  await expect(picker).toBeVisible();
  const hex = picker.getByRole('textbox', { name: 'Enter a hex color' });
  const secondPickerColor = await hex.inputValue();
  await page.evaluate(() => window.__resolveEyeDropper('#FF0000'));
  await page.waitForFunction(() => window.__eyeDropperResolved === true);
  await expect(hex).toHaveValue(secondPickerColor);
});

test('native color-picker fallback ignores input from a deactivated owner', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'EyeDropper', { configurable: true, value: undefined });
  });
  await openBoxWorkspace(page);
  const component = { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' };
  const activateFormatSection = async () => {
    await page.locator('#boxPage:not([hidden]) .workspace-toolbar__tab').filter({ hasText: /^Format$/ }).click();
  };
  await activateFormatSection();
  await showSharedSymbolFixture(page);
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

  await openComponentFromWelcome(page, component, { loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) .workspace-toolbar'));
  await activateFormatSection();
  await showSharedSymbolFixture(page);
  const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-native-color-fallback-open' });
  }, firstTabId);
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) .workspace-toolbar'));
  await activateFormatSection();
  await showSharedSymbolFixture(page);
  await page.evaluate(() => {
    window.__nativeColorPickerFallbackOpened = false;
    const originalShowPicker = HTMLInputElement.prototype.showPicker;
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      configurable: true,
      value() {
        if (this.classList.contains('shared-color-picker__hidden-fallback-input')) {
          window.__nativeColorPickerFallbackOpened = true;
          return;
        }
        return originalShowPicker?.call(this);
      }
    });
  });

  const picker = page.getByRole('dialog', { name: 'Color picker' });
  await page.locator('#boxPage:not([hidden]) .font-toolbar-host[data-font-toolbar-scope="box"] .shared-border-style-chip').click();
  await expect(picker).toBeVisible();
  const fallbackTrigger = picker.locator('.shared-color-picker__eyedropper');
  await expect(fallbackTrigger).toHaveAttribute('aria-label', 'Open the system color picker');
  await fallbackTrigger.click();
  await page.waitForFunction(() => window.__nativeColorPickerFallbackOpened === true);
  await page.evaluate(() => {
    window.__pendingFallbackColorInput = document.querySelector('.shared-color-picker__hidden-fallback-input');
    if (!window.__pendingFallbackColorInput) throw new Error('Native color-picker fallback input was not created.');
  });

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-native-color-fallback-close' });
  }, secondTabId);
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) .workspace-toolbar'));
  await activateFormatSection();
  await showSharedSymbolFixture(page);
  await expect(picker).toBeHidden();
  await page.locator('#boxPage:not([hidden]) .font-toolbar-host[data-font-toolbar-scope="box"] .shared-border-style-chip').click();
  await expect(picker).toBeVisible();
  const hex = picker.getByRole('textbox', { name: 'Enter a hex color' });
  const secondPickerColor = await hex.inputValue();

  await page.evaluate(() => {
    const fallback = window.__pendingFallbackColorInput;
    if (!fallback) throw new Error('Native color-picker fallback input was not created.');
    fallback.value = '#ff0000';
    fallback.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(hex).toHaveValue(secondPickerColor);
});

test('Venn trace picker preserves its trace toolbar at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' },
    { first: true, loadExample: true }
  );

  const workspace = page.locator('#vennPage:not([hidden])');
  const trace = workspace.locator('[data-venn-trace-id]').first();
  await expect(trace).toBeVisible();
  await trace.click({ force: true });
  const trigger = workspace.locator('.shared-fill-style-chip').first();
  await expect(trigger).toBeVisible();
  await trigger.click();

  const picker = page.getByRole('dialog', { name: 'Color picker' });
  await expect(picker).toBeVisible();
  const layout = await picker.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(320);
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.bottom).toBeLessThanOrEqual(400);
  await expect(picker.getByRole('textbox', { name: 'Enter a hex color' })).toHaveValue(/^#[0-9A-F]{6}$/);

  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('expanded color picker fits a short phone viewport and has adequately spaced targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  await showSharedSymbolFixture(page);
  await page.locator('#boxPage .shared-border-style-chip').click();
  const picker = page.getByRole('dialog', { name: 'Color picker' });
  await picker.getByRole('button', { name: 'Show more', exact: true }).click();
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const layout = await picker.evaluate(async element => {
    const rect = element.getBoundingClientRect();
    const result = await window.axe.run(element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }
    });
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: window.innerWidth, height: window.innerHeight,
      violations: result.violations.map(item => ({ id: item.id, count: item.nodes.length }))
    };
  });
  expect(layout.violations).toEqual([]);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.width);
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.bottom).toBeLessThanOrEqual(layout.height);
  const controlRadii = await picker.locator('.shared-color-picker__scatter-style-input, .shared-color-picker__hex-input, .shared-color-picker__color-input, .shared-color-picker__eyedropper').evaluateAll(elements => elements.map(element => getComputedStyle(element).borderRadius));
  expect(controlRadii.length).toBeGreaterThanOrEqual(3);
  expect(new Set(controlRadii)).toEqual(new Set(['5px']));
  const hex = picker.getByRole('textbox', { name: 'Enter a hex color' });
  await hex.focus();
  const hexBox = await hex.boundingBox();
  expect(hexBox.y + hexBox.height).toBeLessThanOrEqual(layout.height);
  await hex.fill('#13579B');
  await hex.press('Enter');
  await expect(picker.locator('input[type="color"]')).toHaveValue('#13579b');
});

test('portaled hex value field suppresses pointer focus and retains keyboard focus', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  await showSharedSymbolFixture(page);

  const trigger = page.locator('#boxPage .shared-border-style-chip').first();
  await trigger.click();
  const picker = page.getByRole('dialog', { name: 'Color picker' });
  const hex = picker.getByRole('textbox', { name: 'Enter a hex color' });
  await expect(hex).toBeVisible();
  const restingBorder = await hex.evaluate(node => getComputedStyle(node).borderColor);

  await hex.click();
  const pointerFocus = await hex.evaluate(node => ({
    modality: window.Shared.focusModality.getCurrentModality(),
    borderColor: getComputedStyle(node).borderColor,
    outlineStyle: getComputedStyle(node).outlineStyle,
    boxShadow: getComputedStyle(node).boxShadow
  }));
  expect(pointerFocus.modality).toBe('pointer');
  expect(pointerFocus.borderColor).toBe(restingBorder);
  expect(pointerFocus.outlineStyle).toBe('none');
  expect(pointerFocus.boxShadow).toBe('none');

  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(picker).toBeVisible();
  await hex.focus();
  const keyboardFocus = await hex.evaluate(node => ({
    modality: window.Shared.focusModality.getCurrentModality(),
    borderColor: getComputedStyle(node).borderColor,
    boxShadow: getComputedStyle(node).boxShadow
  }));
  expect(keyboardFocus.modality).toBe('keyboard');
  expect(keyboardFocus.borderColor).not.toBe(restingBorder);
  expect(keyboardFocus.boxShadow).not.toBe('none');
});

test('color picker selection remains identifiable in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  await showSharedSymbolFixture(page);
  await page.locator('#boxPage .shared-border-style-chip').click();
  const picker = page.getByRole('dialog', { name: 'Color picker' });
  const selected = picker.getByRole('button', { name: 'Standard colors color #000000', pressed: true });
  await expect(selected).toBeVisible();
  const selectedCue = await selected.evaluate(element => {
    const pseudo = getComputedStyle(element, '::after');
    const style = getComputedStyle(element);
    return { pseudoContent: pseudo.content, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(selectedCue.pseudoContent).toBe('none');
  expect(selectedCue.outlineStyle).toBe('solid');
  expect(selectedCue.outlineWidth).toBe('2px');
  const yellow = picker.getByRole('button', { name: 'Standard colors color #FFFF00', exact: true });
  await yellow.click();
  await expect(yellow).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.getByRole('button', { name: 'Standard colors color #000000' })).toHaveAttribute('aria-pressed', 'false');
  await expect(picker.getByRole('button', { name: 'Recent color #FFFF00' })).toHaveAttribute('aria-pressed', 'true');
  await yellow.focus();
  await yellow.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(yellow).toBeFocused();
  expect(await yellow.evaluate(element => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  })).toBe(true);
});

test('light-only browser metadata keeps the shared picker consistent with OS color preference', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  await showSharedSymbolFixture(page);
  await page.locator('#boxPage .shared-border-style-chip').click();
  const picker = page.getByRole('dialog', { name: 'Color picker' });
  await expect(picker).toBeVisible();

  const readPickerStyles = () => page.evaluate(() => {
    const snapshot = selector => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Color picker style target is missing: ${selector}`);
      }
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        color: style.color,
        fontSize: style.fontSize,
        padding: style.padding,
        transitionProperty: style.transitionProperty
      };
    };
    return {
      declaredScheme: document.querySelector('meta[name="color-scheme"]')?.content || null,
      picker: snapshot('.shared-color-picker'),
      title: snapshot('.shared-color-picker__section-title'),
      documentTitle: snapshot('.workspace-toolbar__document-title'),
      welcomeBody: snapshot('.welcome-screen'),
      swatch: snapshot('.shared-color-picker__swatch'),
      hexInput: snapshot('.shared-color-picker__hex-input'),
      eyedropper: snapshot('.shared-color-picker__eyedropper'),
      moreToggle: snapshot('.shared-color-picker__more-toggle')
    };
  });

  await page.emulateMedia({ colorScheme: 'light' });
  const lightPreference = await readPickerStyles();
  await page.emulateMedia({ colorScheme: 'dark' });
  const darkPreference = await readPickerStyles();

  expect(lightPreference.declaredScheme).toBe('light');
  expect(lightPreference.picker.fontSize).toBe('11px');
  expect(lightPreference.title.fontSize).toBe('11px');
  expect(lightPreference.documentTitle.fontSize).toBe('13px');
  expect(lightPreference.welcomeBody.fontSize).toBe('14px');
  expect(darkPreference).toEqual(lightPreference);
});

test('thickness text-selection drag keeps its owning Format toolbar visible', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  await showSharedSymbolFixture(page);

  const activePage = page.locator('#boxPage:not([hidden])');
  const toolbar = activePage.locator('.workspace-toolbar');
  const host = activePage.locator('.font-toolbar-host[data-font-toolbar-scope="box"]');
  const borderChip = host.locator('.shared-border-style-chip');

  await expect(host).toHaveClass(/font-toolbar-host--visible/);
  await borderChip.click();

  const picker = page.locator('.shared-color-picker[data-visible="1"]');
  const thickness = picker.locator('input[aria-label="Border thickness"]');
  await expect(picker).toBeVisible();
  await expect(thickness).toBeVisible();

  const box = await thickness.boundingBox();
  expect(box).toBeTruthy();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + Math.max(2, box.width - 3), y);
  await page.mouse.down();
  await page.mouse.move(Math.max(1, box.x - 80), y, { steps: 6 });
  await page.mouse.up();

  await expect(picker).toBeVisible();
  await expect(host).toHaveClass(/font-toolbar-host--visible/);
  await expect.poll(async () => toolbar.getAttribute('data-toolbar-active-section')).toMatch(/-format$/);

  await page.evaluate(() => {
    const outside = document.createElement('button');
    outside.id = 'colorPickerOwnershipOutside';
    outside.type = 'button';
    outside.textContent = 'outside';
    outside.style.position = 'fixed';
    outside.style.right = '4px';
    outside.style.bottom = '4px';
    outside.style.zIndex = '99999';
    document.body.appendChild(outside);
  });
  await page.locator('#colorPickerOwnershipOutside').click();
  await expect(page.locator('.shared-color-picker')).toHaveAttribute('data-visible', '0');
  await expect(host).not.toHaveClass(/font-toolbar-host--visible/);

  expect(issues.critical).toEqual([]);
});
