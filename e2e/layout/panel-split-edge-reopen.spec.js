'use strict';

const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

const component = COMPONENT_CATALOG.find(item => item.type === 'scatter');

async function buildArchive(page) {
  return page.evaluate(async () => {
    const session = window.Main?.session;
    const workspace = session?.workspaceState || {};
    const tab = workspace.tabs?.find(item => item?.id === workspace.activeTabId);
    if(!tab?.type) throw new Error('Active graph tab unavailable');
    session.captureUserModifiedTabLayout?.(tab, { reason: 'panel-split-edge-reopen' });
    const clone = value => JSON.parse(JSON.stringify(value ?? null));
    const blob = await window.Shared.graphArchive.buildArchiveBlob({
      scope: 'workspace',
      activeIndex: 0,
      fileName: 'panel-split-edge.graph',
      useWorker: false,
      tabs: [{
        id: tab.id,
        runtimeTabId: tab.id,
        title: tab.title,
        type: tab.type,
        payload: clone(tab.payload),
        layout: clone(tab.layoutState)
      }]
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for(let offset = 0; offset < bytes.length; offset += 0x8000){
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  });
}

async function reopenArchive(page, base64, fraction) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#workspaceSessionInput').setInputFiles({
    name: 'panel-split-edge.graph',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(base64, 'base64')
  });
  const expectedEdge = fraction === 0 ? 'start' : 'end';
  await page.waitForFunction(edge => {
    const workspace = window.Main?.session?.workspaceState || {};
    const tab = workspace.tabs?.find(item => item?.id === workspace.activeTabId);
    const page = document.querySelector('#scatterPage:not([hidden])');
    const divider = page?.querySelector('#scatterPanelResizer');
    return tab?.type === 'scatter' && divider?.dataset?.panelSplitEdge === edge;
  }, expectedEdge, { timeout: 60_000, polling: 'raf' });
  const layout = await page.evaluate(edge => {
    const page = document.getElementById('scatterPage');
    const divider = page?.querySelector('#scatterPanelResizer');
    const table = page?.querySelector('#scatterTablePanel');
    const graph = page?.querySelector('#scatterGraphPanel');
    const wrap = page?.querySelector('.wrap');
    const dividerRect = divider?.getBoundingClientRect();
    const wrapRect = wrap?.getBoundingClientRect();
    const wrapStyle = wrap ? getComputedStyle(wrap) : null;
    const contentLeft = (wrapRect?.left || 0) + (Number.parseFloat(wrapStyle?.paddingLeft) || 0);
    const contentRight = (wrapRect?.right || 0) - (Number.parseFloat(wrapStyle?.paddingRight) || 0);
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === window.Main?.session?.workspaceState?.activeTabId);
    return {
      fraction: Number(tab?.layoutState?.workspace?.tableFraction),
      edge: divider?.dataset?.panelSplitEdge || '',
      now: divider?.getAttribute('aria-valuenow'),
      tableWidth: table?.getBoundingClientRect?.().width || 0,
      graphWidth: graph?.getBoundingClientRect?.().width || 0,
      tableHidden: table?.getAttribute('aria-hidden') === 'true',
      graphHidden: graph?.getAttribute('aria-hidden') === 'true',
      dividerAtEdge: edge === 'start'
        ? Math.abs((dividerRect?.left || 0) - contentLeft) < 1
        : Math.abs((dividerRect?.right || 0) - contentRight) < 1
    };
  }, expectedEdge);
  expect(layout.fraction).toBe(fraction);
  expect(layout.edge).toBe(expectedEdge);
  expect(layout.now).toBe(String(fraction * 100));
  expect(layout.dividerAtEdge).toBe(true);
  if(fraction === 0){
    expect(layout.tableWidth).toBe(0);
    expect(layout.graphWidth).toBeGreaterThan(0);
    expect(layout.tableHidden).toBe(true);
  }else{
    expect(layout.graphWidth).toBe(0);
    expect(layout.tableWidth).toBeGreaterThan(0);
    expect(layout.graphHidden).toBe(true);
  }
}

test('collapsed table and graph panel splits survive archive reopen', async ({ page }) => {
  test.setTimeout(180_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requireIdle: true });

  const divider = page.locator('#scatterPage:not([hidden]) #scatterPanelResizer');
  await divider.focus();
  await page.keyboard.press('Home');
  await expect(divider).toHaveAttribute('aria-valuenow', '0');
  const leftArchive = await buildArchive(page);
  await reopenArchive(page, leftArchive, 0);

  await page.locator('#scatterPage:not([hidden]) #scatterPanelResizer').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#scatterPage:not([hidden]) #scatterPanelResizer')).toHaveAttribute('aria-valuenow', '100');
  const rightArchive = await buildArchive(page);
  await reopenArchive(page, rightArchive, 1);
});

test('pointer dragging moves the divider to either workspace edge', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requireIdle: true });

  const divider = page.locator('#scatterPage:not([hidden]) #scatterPanelResizer');
  const dragToWorkspaceEdge = async edge => {
    const geometry = await page.evaluate(direction => {
      const pageRoot = document.querySelector('#scatterPage:not([hidden])');
      const wrap = pageRoot?.querySelector('.wrap');
      const handle = pageRoot?.querySelector('#scatterPanelResizer');
      if(!wrap || !handle) throw new Error('Workspace divider is not mounted');
      const wrapRect = wrap.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const style = getComputedStyle(wrap);
      const edge = direction === 'left'
        ? wrapRect.left + (Number.parseFloat(style.paddingLeft) || 0)
        : wrapRect.right - (Number.parseFloat(style.paddingRight) || 0);
      return {
        startX: handleRect.left + handleRect.width / 2,
        edge,
        y: handleRect.top + handleRect.height / 2
      };
    }, edge);
    await page.mouse.move(geometry.startX, geometry.y);
    await page.mouse.down();
    await page.mouse.move(geometry.edge, geometry.y, { steps: 12 });
    await page.mouse.up();
    const dividerEdge = await page.evaluate(direction => {
      const pageRoot = document.querySelector('#scatterPage:not([hidden])');
      const wrap = pageRoot?.querySelector('.wrap');
      const handle = pageRoot?.querySelector('#scatterPanelResizer');
      const wrapRect = wrap?.getBoundingClientRect();
      const handleRect = handle?.getBoundingClientRect();
      const style = wrap ? getComputedStyle(wrap) : null;
      const expected = direction === 'left'
        ? (wrapRect?.left || 0) + (Number.parseFloat(style?.paddingLeft) || 0)
        : (wrapRect?.right || 0) - (Number.parseFloat(style?.paddingRight) || 0);
      const actual = direction === 'left' ? handleRect?.left : handleRect?.right;
      return Math.abs((actual || 0) - expected);
    }, edge);
    expect(dividerEdge).toBeLessThan(1);
  };

  await dragToWorkspaceEdge('left');
  await expect(divider).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('#scatterTablePanel')).toHaveAttribute('aria-hidden', 'true');

  await dragToWorkspaceEdge('right');
  await expect(divider).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('#scatterGraphPanel')).toHaveAttribute('aria-hidden', 'true');
});
