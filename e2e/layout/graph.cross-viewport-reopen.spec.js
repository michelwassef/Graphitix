'use strict';

const { test, expect } = require('@playwright/test');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog.js');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const {
  parseWorkspaceArchive,
  summarizeArchiveMetadata
} = require('../helpers/archiveDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

test.describe.configure({ timeout: 90_000 });

async function captureGeometry(page, component) {
  return page.evaluate(({ type, pageId }) => {
    const workspace = window.Main?.session?.workspaceState || {};
    const tab = workspace.tabs?.find(candidate => candidate?.id === workspace.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tab?.id, type)
      || document.querySelector(`#${pageId}:not([hidden])`);
    const table = root?.querySelector?.(`#${type}TablePanel`)
      || document.getElementById(`${type}TablePanel`);
    const graph = root?.querySelector?.(`#${type}GraphPanel`)
      || document.getElementById(`${type}GraphPanel`);
    const svgBox = graph?.querySelector?.('.svgbox') || root?.querySelector?.('.svgbox');
    const rect = element => element?.getBoundingClientRect?.() || null;
    const tableRect = rect(table);
    const graphRect = rect(graph);
    const svgRect = rect(svgBox);
    return {
      tableWidth: tableRect?.width || 0,
      graphWidth: graphRect?.width || 0,
      graphFrameWidth: svgRect?.width || 0,
      graphFrameHeight: svgRect?.height || 0,
      tableStyle: table?.getAttribute('style') || '',
      graphStyle: graph?.getAttribute('style') || '',
      layout: tab?.layoutState || null
    };
  }, component);
}

async function waitForGeometry(page, component) {
  await page.waitForFunction(({ type, pageId }) => {
    const workspace = window.Main?.session?.workspaceState || {};
    const activeTab = workspace.tabs?.find(tab => tab?.id === workspace.activeTabId);
    if(activeTab?.type !== type) return false;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(workspace.activeTabId, type)
      || document.querySelector(`#${pageId}:not([hidden])`);
    const table = root?.querySelector?.(`#${type}TablePanel`);
    const graph = root?.querySelector?.(`#${type}GraphPanel`);
    const frame = graph?.querySelector?.('.svgbox') || root?.querySelector?.('.svgbox');
    const tableRect = table?.getBoundingClientRect?.();
    const graphRect = graph?.getBoundingClientRect?.();
    const frameRect = frame?.getBoundingClientRect?.();
    return !!tableRect && !!graphRect && !!frameRect
      && tableRect.width > 0 && graphRect.width > 0
      && frameRect.width > 0 && frameRect.height > 0;
  }, component, { timeout: 60_000, polling: 'raf' });
}

async function buildPortableArchive(page) {
  return page.evaluate(async () => {
    const session = window.Main?.session;
    const workspace = session?.workspaceState || {};
    const tab = workspace.tabs?.find(candidate => candidate?.id === workspace.activeTabId) || null;
    if (!tab?.type) {
      throw new Error('Active graph tab unavailable');
    }
    session.captureUserModifiedTabLayout?.(tab, { reason: 'cross-viewport-layout-capture' });
    const clone = value => JSON.parse(JSON.stringify(value ?? null));
    const blob = await window.Shared.graphArchive.buildArchiveBlob({
      scope: 'workspace',
      activeIndex: 0,
      fileName: 'cross-viewport.graph',
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
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return { base64: btoa(binary) };
  });
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} graph frame and workspace split survive cross-viewport reopen`, async ({ page }, testInfo) => {
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForGeometry(page, component);

    const large = await captureGeometry(page, component);
    expect(large.tableWidth, `${component.type} table panel should be visible`).toBeGreaterThan(0);
    expect(large.graphWidth, `${component.type} graph panel should be visible`).toBeGreaterThan(0);
    expect(large.graphFrameWidth, `${component.type} graph frame should be visible`).toBeGreaterThan(0);

    const archive = await buildPortableArchive(page);
    const parsed = await parseWorkspaceArchive(page, archive.base64, 'cross-viewport.graph');
    await testInfo.attach(`${component.type}-cross-viewport-archive-metadata.json`, {
      body: JSON.stringify(summarizeArchiveMetadata(parsed), null, 2),
      contentType: 'application/json'
    });
    const savedLayout = parsed?.session?.tabs?.[0]?.layout || null;
    expect(savedLayout?.workspace?.tableFraction, `${component.type} should save a relative panel split`).toBeGreaterThan(0);
    expect(savedLayout?.workspace?.tableFraction).toBeLessThan(1);
    expect(savedLayout?.tablePanel?.style || null).toBeNull();
    expect(savedLayout?.graphPanel?.style || null).toBeNull();
    expect(savedLayout?.svgBox?.style?.width, `${component.type} should save graph width in pixels`).toMatch(/px$/);
    expect(savedLayout?.svgBox?.style?.height, `${component.type} should save graph height in pixels`).toMatch(/px$/);

    await page.setViewportSize({ width: 709, height: 923 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#workspaceSessionInput').setInputFiles({
      name: 'cross-viewport.graph',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(archive.base64, 'base64')
    });
    await waitForGeometry(page, component);

    const small = await captureGeometry(page, component);
    expect(small.tableWidth, `${component.type} table panel should remain visible`).toBeGreaterThan(0);
    expect(small.graphWidth, `${component.type} graph panel should remain visible`).toBeGreaterThan(0);
    expect(small.tableWidth, `${component.type} table width should adapt`).toBeLessThan(large.tableWidth - 40);
    expect(small.graphFrameWidth, `${component.type} graph width must remain absolute`).toBeCloseTo(large.graphFrameWidth, 0);
    expect(small.graphFrameHeight, `${component.type} graph height must remain absolute`).toBeCloseTo(large.graphFrameHeight, 0);
    expect(small.tableStyle).not.toMatch(/(?:^|;)\s*(?:width|max-width):\s*\d+(?:\.\d+)?px/);
    expect(small.tableStyle).not.toMatch(/flex:\s*0\s+0\s+\d+(?:\.\d+)?px/);
    expect(small.graphStyle).not.toMatch(/(?:^|;)\s*(?:width|max-width):\s*\d+(?:\.\d+)?px/);
    expect(small.graphStyle).not.toMatch(/flex:\s*0\s+0\s+\d+(?:\.\d+)?px/);
  });
}
