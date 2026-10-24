'use strict';

const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

async function openReadyExample(page, component, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requireIdle: true });
}

async function expectSvgGeometryToMatch(locator, expected) {
  await expect.poll(async () => {
    const actual = await locator.evaluate(node => ({
      x: node.getAttribute('x'),
      y: node.getAttribute('y'),
      transform: node.getAttribute('transform')
    }));
    const coordinatesMatch = ['x', 'y'].every(key => {
      const actualValue = Number.parseFloat(actual[key] ?? '');
      const expectedValue = Number.parseFloat(expected[key] ?? '');
      return Number.isFinite(actualValue)
        && Number.isFinite(expectedValue)
        && Math.abs(actualValue - expectedValue) <= 1e-9;
    });
    return { coordinatesMatch, transform: actual.transform };
  }).toEqual({ coordinatesMatch: true, transform: expected.transform });
}

async function readPanelWidths(page, component) {
  return page.evaluate(({ pageId, type }) => {
    const tableId = type === 'venn' ? 'vennInputPanel' : `${type}TablePanel`;
    const table = document.querySelector(`#${pageId}:not([hidden]) #${tableId}`);
    const graph = document.querySelector(`#${pageId}:not([hidden]) #${type}GraphPanel`);
    return {
      table: table?.getBoundingClientRect?.().width || 0,
      graph: graph?.getBoundingClientRect?.().width || 0
    };
  }, component);
}

async function readRenderedGraph(page, component) {
  return page.evaluate(({ pageId, type }) => {
    const panel = document.querySelector(`#${pageId}:not([hidden]) #${type}GraphPanel`);
    const svg = Array.from(panel?.querySelectorAll?.('svg') || []).find(node => {
      if(node.closest('.resizer-control-tray, .resizer-bottom-tray')) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 24 && rect.height > 24 && style.display !== 'none'
        && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    });
    const canvas = Array.from(panel?.querySelectorAll?.('canvas') || []).find(node =>
      !node.closest('.resizer-control-tray, .resizer-bottom-tray')
      && node.getBoundingClientRect().width > 24 && node.getBoundingClientRect().height > 24
    );
    const rendered = svg || canvas;
    const marks = svg?.querySelectorAll('path,line,rect,circle,ellipse,polygon,polyline,text').length
      || (canvas?.width > 0 && canvas?.height > 0 ? 1 : 0);
    return { visible: !!rendered, marks };
  }, component);
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} panel divider reaches both edges by keyboard and pointer`, async ({ page }) => {
    test.setTimeout(120_000);
    await openReadyExample(page, component, { width: 1920, height: 900 });
    const handle = page.locator(`#${component.pageId}:not([hidden]) .panel-resizer`);
    const tableId = component.type === 'venn' ? 'vennInputPanel' : `${component.type}TablePanel`;
    const graphId = `${component.type}GraphPanel`;
    await expect(handle).toHaveAttribute('role', 'separator');
    await expect(handle).toHaveAttribute('tabindex', '0');
    await expect(handle).toHaveAttribute('aria-controls', `${tableId} ${graphId}`);
    await expect(handle).toHaveAttribute('aria-valuenow', /\d+/);

    await page.keyboard.press('Tab');
    const before = await readPanelWidths(page, component);
    expect(before.table).toBeGreaterThan(0);
    expect(before.graph).toBeGreaterThan(0);
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await readPanelWidths(page, component)).table).toBeGreaterThan(before.table + 10);
    const after = await readPanelWidths(page, component);
    const rendered = await readRenderedGraph(page, component);
    expect(rendered.visible).toBe(true);
    expect(rendered.marks).toBeGreaterThan(0);
    await expect(handle).toBeFocused();
    const focusOutline = await handle.evaluate(node => ({
      style: getComputedStyle(node).outlineStyle,
      width: getComputedStyle(node).outlineWidth
    }));
    expect(focusOutline.style).not.toBe('none');
    expect(Number.parseFloat(focusOutline.width)).toBeGreaterThan(0);

    const range = await handle.evaluate(node => ({
      min: Number(node.getAttribute('aria-valuemin')),
      max: Number(node.getAttribute('aria-valuemax')),
      now: Number(node.getAttribute('aria-valuenow')),
      text: node.getAttribute('aria-valuetext')
    }));
    expect(range.min).toBe(0);
    expect(range.max).toBe(100);
    expect(range.max).toBeGreaterThan(range.min);
    expect(range.now).toBeGreaterThan(range.min);
    expect(range.text).toMatch(/Table \d+ percent; graph \d+ percent/);

    const activeTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    const savedFraction = await page.evaluate(tabId => {
      const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === tabId);
      return Number(tab?.layoutState?.workspace?.tableFraction);
    }, activeTabId);
    expect(savedFraction).toBeCloseTo(after.table / (after.table + after.graph), 2);

    await page.keyboard.press('Home');
    const homeState = await handle.evaluate(node => {
      const page = node.closest('.workspace-page');
      const tableId = page.id === 'vennPage' ? 'vennInputPanel' : `${page.id.replace('Page', '')}TablePanel`;
      const table = page.querySelector(`#${tableId}`);
      const graph = page.querySelector(`#${page.id.replace('Page', '')}GraphPanel`);
      return {
        min: node.getAttribute('aria-valuemin'),
        now: node.getAttribute('aria-valuenow'),
        tableWidth: table?.getBoundingClientRect?.().width || 0,
        graphWidth: graph?.getBoundingClientRect?.().width || 0,
        tableMin: table ? getComputedStyle(table).minWidth : ''
      };
    });
    expect(homeState.now, JSON.stringify(homeState)).toBe(homeState.min);
    expect(homeState.tableWidth).toBe(0);
    expect(homeState.graphWidth).toBeGreaterThan(0);
    expect(homeState.tableMin).toBe('0px');
    await page.keyboard.press('End');
    const endState = await handle.evaluate(node => {
      const page = node.closest('.workspace-page');
      const type = page.id.replace('Page', '');
      const tableId = type === 'venn' ? 'vennInputPanel' : `${type}TablePanel`;
      const table = page.querySelector(`#${tableId}`);
      const graph = page.querySelector(`#${type}GraphPanel`);
      return {
        min: node.getAttribute('aria-valuemin'),
        max: node.getAttribute('aria-valuemax'),
        now: node.getAttribute('aria-valuenow'),
        tableWidth: table?.getBoundingClientRect?.().width || 0,
        graphWidth: graph?.getBoundingClientRect?.().width || 0,
        tableMax: table ? getComputedStyle(table).maxWidth : '',
        tableStyle: table?.getAttribute('style') || ''
      };
    });
    expect(endState.now, JSON.stringify(endState)).toBe(endState.max);
    expect(endState.max).toBe('100');
    expect(endState.graphWidth).toBe(0);
    expect(endState.tableWidth).toBeGreaterThan(0);
    expect(endState.tableMax).toBe('none');

    const wrap = page.locator(`#${component.pageId}:not([hidden]) .wrap`);
    const dragHandleToEdge = async edge => {
      const handleBox = await handle.boundingBox();
      const wrapBox = await wrap.boundingBox();
      const y = handleBox.y + handleBox.height / 2;
      const targetX = edge === 'start' ? wrapBox.x + 2 : wrapBox.x + wrapBox.width - 2;
      await page.mouse.move(handleBox.x + handleBox.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(targetX, y, { steps: 12 });
      await page.mouse.up();
      await expect.poll(() => handle.getAttribute('aria-valuenow')).toBe(edge === 'start' ? '0' : '100');
      const geometry = await page.evaluate(({ pageId, type, edge }) => {
        const page = document.getElementById(pageId);
        const tableId = type === 'venn' ? 'vennInputPanel' : `${type}TablePanel`;
        const table = page?.querySelector(`#${tableId}`);
        const graph = page?.querySelector(`#${type}GraphPanel`);
        const divider = page?.querySelector('.panel-resizer');
        const wrap = page?.querySelector('.wrap');
        const wrapRect = wrap?.getBoundingClientRect();
        const dividerRect = divider?.getBoundingClientRect();
        const activeTabId = window.Main?.session?.workspaceState?.activeTabId;
        const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === activeTabId);
        const wrapStyle = wrap ? getComputedStyle(wrap) : null;
        const contentLeft = (wrapRect?.left || 0) + (Number.parseFloat(wrapStyle?.paddingLeft) || 0);
        const contentRight = (wrapRect?.right || 0) - (Number.parseFloat(wrapStyle?.paddingRight) || 0);
        return {
          tableWidth: table?.getBoundingClientRect?.().width || 0,
          graphWidth: graph?.getBoundingClientRect?.().width || 0,
          tableHidden: table?.getAttribute('aria-hidden') === 'true',
          graphHidden: graph?.getAttribute('aria-hidden') === 'true',
          edge: divider?.dataset?.panelSplitEdge || '',
          dividerLeft: dividerRect?.left || 0,
          dividerRight: dividerRect?.right || 0,
          wrapLeft: wrapRect?.left || 0,
          wrapRight: wrapRect?.right || 0,
          viewportRight: document.documentElement.clientWidth,
          dividerAtEdge: edge === 'start'
            ? Math.abs((dividerRect?.left || 0) - contentLeft) < 1
            : Math.abs((dividerRect?.right || 0) - contentRight) < 1,
          savedFraction: Number(tab?.layoutState?.workspace?.tableFraction)
        };
      }, { pageId: component.pageId, type: component.type, edge });
      expect(geometry.edge).toBe(edge);
      expect(geometry.dividerAtEdge, JSON.stringify(geometry)).toBe(true);
      if(edge === 'end'){
        expect(Math.abs(geometry.wrapRight - geometry.viewportRight), JSON.stringify(geometry)).toBeLessThan(1);
      }
      if(edge === 'start'){
        expect(geometry.tableWidth).toBe(0);
        expect(geometry.graphWidth).toBeGreaterThan(0);
        expect(geometry.tableHidden).toBe(true);
        expect(geometry.savedFraction).toBe(0);
      }else{
        expect(geometry.graphWidth).toBe(0);
        expect(geometry.tableWidth).toBeGreaterThan(0);
        expect(geometry.graphHidden).toBe(true);
        expect(geometry.savedFraction).toBe(1);
      }
    };
    await dragHandleToEdge('start');
    await dragHandleToEdge('end');
  });
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} graph labels move by keyboard and survive archive reopen`, async ({ page }) => {
    test.setTimeout(180_000);
    await openReadyExample(page, component);
    const labels = page.locator(`#${component.pageId}:not([hidden]) [data-keyboard-movable="label"]`);
    await expect(labels.first()).toBeVisible();
    const title = page.locator(`#${component.pageId}:not([hidden]) [data-keyboard-movable="label"][data-font-role="graphTitle"]`).first();
    const target = await title.count() ? title : labels.first();
    await page.keyboard.press('Tab');
    await target.focus();
    const before = await target.evaluate(node => ({
      x: Number.parseFloat(node.getAttribute('x') || '0'),
      y: Number.parseFloat(node.getAttribute('y') || '0'),
      name: node.getAttribute('aria-label'),
      shortcuts: node.getAttribute('aria-keyshortcuts')
    }));
    expect(before.name).toMatch(/^Move\s/);
    expect(before.shortcuts).toContain('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => target.evaluate(node => Number.parseFloat(node.getAttribute('x') || '0')))
      .not.toBe(before.x);
    const focusAfterMove = await page.evaluate(() => ({
      tag: document.activeElement?.tagName || '',
      id: document.activeElement?.id || '',
      role: document.activeElement?.getAttribute?.('role') || '',
      movable: document.activeElement?.getAttribute?.('data-keyboard-movable') || '',
      svg: document.activeElement?.ownerSVGElement?.id || ''
    }));
    expect(await target.evaluate(node => node === document.activeElement), JSON.stringify(focusAfterMove)).toBe(true);
    const focus = await target.evaluate(node => ({
      outline: getComputedStyle(node).outlineStyle,
      outlineWidth: getComputedStyle(node).outlineWidth
    }));
    expect(focus.outline).not.toBe('none');
    expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThan(0);

    const movedGeometry = await target.evaluate(node => ({
      x: node.getAttribute('x'),
      y: node.getAttribute('y'),
      transform: node.getAttribute('transform')
    }));
    const archive = await buildWorkspaceArchive(page);
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
      componentType: component.type,
      fileName: `${component.type}-keyboard-label.graph`
    });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    await expect(target).toBeVisible();
    await expectSvgGeometryToMatch(target, movedGeometry);
    await expect(target).toHaveAttribute('aria-keyshortcuts', /ArrowRight/);
    await target.focus();
    await expect(target).toBeFocused();
    const restoredX = await target.evaluate(node => Number.parseFloat(node.getAttribute('x') || '0'));
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => target.evaluate(node => Number.parseFloat(node.getAttribute('x') || '0')))
      .not.toBe(restoredX);
  });
}

const AXIS_LABEL_COMPONENTS = COMPONENT_CATALOG.filter(component =>
  ['box', 'scatter', 'pca', 'line', 'roc', 'survival', 'hist'].includes(component.type)
);

for (const component of AXIS_LABEL_COMPONENTS) {
  test(`${component.type} axis-label keyboard position survives archive reopen`, async ({ page }) => {
    test.setTimeout(180_000);
    await openReadyExample(page, component);
    const selector = `#${component.pageId}:not([hidden]) [data-keyboard-movable="label"][data-font-role="xTitle"], #${component.pageId}:not([hidden]) [data-keyboard-movable="label"][data-font-role="yTitle"]`;
    const target = page.locator(selector).first();
    await expect(target).toBeVisible();
    await target.focus();
    const before = await target.evaluate(node => ({
      x: Number.parseFloat(node.getAttribute('x') || '0'),
      y: Number.parseFloat(node.getAttribute('y') || '0')
    }));
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => target.evaluate(node => Number.parseFloat(node.getAttribute('x') || '0')))
      .not.toBe(before.x);
    const moved = await target.evaluate(node => ({
      x: node.getAttribute('x'),
      y: node.getAttribute('y'),
      transform: node.getAttribute('transform')
    }));
    const archive = await buildWorkspaceArchive(page);
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
      componentType: component.type,
      fileName: `${component.type}-axis-label-keyboard.graph`
    });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    const restored = page.locator(selector).first();
    await expect(restored).toBeVisible();
    await expectSvgGeometryToMatch(restored, moved);
    await restored.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => restored.evaluate(node => Number.parseFloat(node.getAttribute('x') || '0')))
      .not.toBe(Number.parseFloat(moved.x));
  });
}

test('Venn text-label keyboard position survives archive reopen', async ({ page }) => {
  test.setTimeout(180_000);
  const component = COMPONENT_CATALOG.find(item => item.type === 'venn');
  await openReadyExample(page, component);
  const selector = `#${component.pageId}:not([hidden]) [data-keyboard-movable="label"]:not([data-font-role="graphTitle"])`;
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  await target.focus();
  const beforeX = await target.evaluate(node => Number.parseFloat(node.getAttribute('x') || '0'));
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => target.evaluate(node => Number.parseFloat(node.getAttribute('x') || '0')))
    .not.toBe(beforeX);
  const moved = await target.evaluate(node => ({
    x: node.getAttribute('x'),
    y: node.getAttribute('y'),
    transform: node.getAttribute('transform')
  }));
  const archive = await buildWorkspaceArchive(page);
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
    componentType: component.type,
    fileName: 'venn-text-label-keyboard.graph'
  });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const restored = page.locator(selector).first();
  await expect(restored).toBeVisible();
  await expect.poll(() => restored.evaluate(node => ({
    x: node.getAttribute('x'),
    y: node.getAttribute('y'),
    transform: node.getAttribute('transform')
  }))).toEqual(moved);
  await restored.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => restored.evaluate(node => Number.parseFloat(node.getAttribute('x') || '0')))
    .not.toBe(Number.parseFloat(moved.x));
});

test('Scatter graph-title keyboard position survives archive reopen', async ({ page }) => {
  test.setTimeout(150_000);
  const component = COMPONENT_CATALOG.find(entry => entry.type === 'scatter');
  await openReadyExample(page, component);
  const title = page.locator('#scatterPage:not([hidden]) [data-keyboard-movable="label"][data-font-role="graphTitle"]').first();
  await expect(title).toBeVisible();
  await title.focus();
  const readGeometry = () => title.evaluate(node => ({
    x: node.getAttribute('x'),
    y: node.getAttribute('y'),
    transform: node.getAttribute('transform')
  }));
  const before = await readGeometry();
  await page.keyboard.press('ArrowRight');
  await expect.poll(readGeometry).not.toEqual(before);
  const movedGeometry = await readGeometry();
  const ownerTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  const saved = await page.evaluate(tabId => {
    const session = window.Components?.scatter?.__testHooks?.getSession?.(tabId);
    return session?.state?.labels?.positions?.title || null;
  }, ownerTabId);
  expect(saved).toBeTruthy();

  const archive = await buildWorkspaceArchive(page);
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
    componentType: 'scatter',
    fileName: 'scatter-keyboard-title.graph'
  });
  await waitForComponentOwnerReady(page, 'scatter', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });

  const restoredTitle = page.locator('#scatterPage:not([hidden]) [data-keyboard-movable="label"][data-font-role="graphTitle"]').first();
  await expect(restoredTitle).toBeVisible();
  await expectSvgGeometryToMatch(restoredTitle, movedGeometry);
  await expect(restoredTitle).toHaveAttribute('aria-keyshortcuts', /ArrowRight/);
  const restoredTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  const restored = await page.evaluate(tabId => {
    const session = window.Components?.scatter?.__testHooks?.getSession?.(tabId);
    return session?.state?.labels?.positions?.title || null;
  }, restoredTabId);
  expect(restored).toEqual(saved);
});

test('Pie legend keyboard movement survives owner update and archive reopen', async ({ page }) => {
  test.setTimeout(120_000);
  const component = COMPONENT_CATALOG.find(entry => entry.type === 'pie');
  await openReadyExample(page, component);
  const legend = page.locator('#piePage:not([hidden]) [data-keyboard-movable="legend"]').first();
  await expect(legend).toBeVisible();
  await expect(legend).toHaveAttribute('aria-label', /^Move\s/);
  await page.keyboard.press('Tab');
  await legend.focus();
  const before = await legend.getAttribute('transform');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => legend.getAttribute('transform')).not.toBe(before);
  await expect(legend).toBeFocused();
  const movedTransform = await legend.getAttribute('transform');
  const ownerTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  const saved = await page.evaluate(tabId => {
    const session = window.Components?.pie?.__testHooks?.getSession?.(tabId);
    return session?.state?.labelPositions?.legend || null;
  }, ownerTabId);
  expect(saved).toBeTruthy();

  const archive = await buildWorkspaceArchive(page);
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
    componentType: 'pie',
    fileName: 'pie-keyboard-legend.graph'
  });
  await waitForComponentOwnerReady(page, 'pie', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });

  const restoredLegend = page.locator('#piePage:not([hidden]) [data-keyboard-movable="legend"]').first();
  await expect(restoredLegend).toBeVisible();
  await expect.poll(() => restoredLegend.getAttribute('transform')).toBe(movedTransform);
  await expect(restoredLegend).toHaveAttribute('aria-keyshortcuts', /ArrowRight/);
  const restoredTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  const restored = await page.evaluate(tabId => {
    const session = window.Components?.pie?.__testHooks?.getSession?.(tabId);
    return session?.state?.labelPositions?.legend || null;
  }, restoredTabId);
  expect(restored).toEqual(saved);
});
