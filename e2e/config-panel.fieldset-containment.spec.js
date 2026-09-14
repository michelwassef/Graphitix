const { test, expect } = require('@playwright/test');
const { COMPONENT_CATALOG } = require('../test-support/componentCatalog.js');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { openComponentFromWelcome } = require('./helpers/workspaceDriver');

async function readConfigPanelGeometry(page, component) {
  return page.evaluate(type => {
    const root = document.querySelector(`#${type}Page:not([hidden])`);
    const panel = root?.querySelector('.config-panel');
    if (!panel) return null;
    const panelRect = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
    const fieldsets = Array.from(panel.querySelectorAll(':scope > fieldset'))
      .filter(fieldset => fieldset.getClientRects().length > 0)
      .map(fieldset => {
        const rect = fieldset.getBoundingClientRect();
        return {
          legend: fieldset.querySelector(':scope > legend')?.textContent?.trim() || '',
          left: rect.left,
          right: rect.right,
          width: rect.width,
          clientWidth: fieldset.clientWidth,
          scrollWidth: fieldset.scrollWidth
        };
      });
    return {
      panel: {
        left: panelRect.left,
        right: panelRect.right,
        width: panelRect.width,
        clientWidth: panel.clientWidth,
        scrollWidth: panel.scrollWidth,
        borderLeft,
        borderRight
      },
      fieldsets
    };
  }, component.type);
}

async function setLegend(page, component, visible) {
  if (component.type === 'venn') return false;
  await page.evaluate(({ type, checked }) => {
    const root = document.querySelector(`#${type}Page:not([hidden])`);
    const control = root?.querySelector(`#${type}ShowLegend`);
    if (!control) return;
    control.checked = checked;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    const tab = window.Main?.session?.getActiveTab?.();
    window.Components?.[type]?.draw?.({ reason: 'e2e-config-panel-legend-transition', tabId: tab?.id });
  }, { type: component.type, checked: visible });
  try {
    await page.evaluate(async type => {
      const tab = window.Main?.session?.getActiveTab?.();
      await window.Components?.[type]?.awaitReadyForSnapshot?.({
        tab,
        tabId: tab?.id,
        reason: 'e2e-config-panel-legend-transition-readiness',
        settleFrames: 2
      });
    }, component.type);
    await page.waitForFunction(({ type, expected }) => {
      const root = document.querySelector(`#${type}Page:not([hidden])`);
      const control = root?.querySelector(`#${type}ShowLegend`);
      const svg = root?.querySelector('.svgbox svg');
      return control?.checked === expected
        && !!svg
        && svg.getClientRects().length > 0;
    }, { type: component.type, expected: visible }, { timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(type => {
      const root = document.querySelector(`#${type}Page:not([hidden])`);
      const control = root?.querySelector(`#${type}ShowLegend`);
      const svg = root?.querySelector('.svgbox svg');
      return {
        type,
        checked: control?.checked ?? null,
        reserve: svg?.dataset?.legendReserveWidth ?? null,
        svg: !!svg,
        pageHidden: root?.hidden ?? null
      };
    }, component.type);
    throw new Error(`Legend transition did not settle: ${JSON.stringify(state)}`, { cause: error });
  }
  return true;
}

async function assertAllComponentsAtWidth(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const findings = [];
  for (let index = 0; index < COMPONENT_CATALOG.length; index += 1) {
    const component = COMPONENT_CATALOG[index];
    await openComponentFromWelcome(page, component, {
      first: index === 0,
      loadExample: true
    });
    await page.waitForFunction(type => {
      const root = document.querySelector(`#${type}Page:not([hidden])`);
      return !!root?.querySelector('.config-panel > fieldset');
    }, component.type, { timeout: 30_000 });

    const hasLegendControl = await page.evaluate(type => (
      !!document.querySelector(`#${type}Page:not([hidden]) #${type}ShowLegend`)
    ), component.type);
    for (const legendVisible of hasLegendControl ? [false, true] : [null]) {
      if (legendVisible !== null) await setLegend(page, component, legendVisible);
      const geometry = await readConfigPanelGeometry(page, component);
      expect(geometry, `${component.type}: config panel is missing`).toBeTruthy();
      const innerLeft = geometry.panel.left + geometry.panel.borderLeft;
      const innerRight = geometry.panel.right - geometry.panel.borderRight;
      for (const fieldset of geometry.fieldsets) {
        if (fieldset.left < innerLeft - 1
          || fieldset.right > innerRight + 1
          || fieldset.scrollWidth > fieldset.clientWidth + 1) {
          findings.push({
            component: component.type,
            legendVisible,
            fieldsetName: fieldset.legend,
            panel: geometry.panel,
            fieldset
          });
        }
      }
    }
  }

  expect(findings, `Fieldsets outside config-panel border: ${JSON.stringify(findings)}`).toEqual([]);
}

for (const width of [1920, 1280, 1024]) {
  test(`all component graph-control fieldsets stay inside their config-panel border at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await assertAllComponentsAtWidth(page, width);
  });
}
