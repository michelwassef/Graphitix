'use strict';

const { test, expect } = require('@playwright/test');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer, parseWorkspaceArchive } = require('../helpers/archiveDriver');

async function readFigure(page, component) {
  return page.evaluate(({ type, pageId }) => {
    const tab = window.Main.session.getActiveTab();
    const root = window.Shared.workspaceTabs.getMountedRoot(tab.id, type) || document.getElementById(pageId);
    const box = root.querySelector('.svgbox');
    const frame = box.closest('.graph-frame');
    const header = frame?.querySelector('.graph-controls-header');
    const svg = root.querySelector(`#${type}Svg`) || root.querySelector('#stage');
    const api = box.__sharedResizableBoxApi;
    const layout = window.Shared.componentLayout.captureStateFor(type, { tabId: tab.id });
    const projection = svg ? window.Shared.exportProjection.resolve(svg, { componentName: type }) : null;
    const controls = header?.querySelector('.resizer-control-tray');
    const optionsButton = controls.querySelector('.resizer-options-summary').getBoundingClientRect();
    const zoomControls = controls.querySelector('.resizer-zoom-control').getBoundingClientRect();
    const headerBounds = header.getBoundingClientRect();
    const controlsContained = [optionsButton, zoomControls].every(bounds =>
      bounds.left >= headerBounds.left - 1 && bounds.right <= headerBounds.right + 1
      && bounds.top >= headerBounds.top - 1 && bounds.bottom <= headerBounds.bottom + 1
    ) && headerBounds.bottom <= box.getBoundingClientRect().top + 1;
    return {
      tabId: tab.id,
      base: [Number(box.dataset.graphWidthPx), Number(box.dataset.graphHeightPx)],
      zoom: api.getZoomLevel(),
      view: { ...api.getViewState() },
      displayedWidth: box.getBoundingClientRect().width,
      controlsContained,
      drawable: window.Shared.componentLayout.resolveDrawableFrame({ svgBox: box }).width,
      viewBox: svg?.getAttribute('viewBox'),
      exportSize: projection ? [projection.physical.width, projection.physical.height] : null,
      saved: layout
    };
  }, component);
}

async function activateAndCaptureZoomFrames(page, tabId) {
  await page.evaluate(targetTabId => {
    window.__fitActivationZoomFrames = [];
    const onTabClick = event => {
      const button = event.target?.closest?.('.workspace-tab[data-tab-id]');
      if (String(button?.dataset?.tabId || '') !== targetTabId) return;
      document.removeEventListener('click', onTabClick, true);
      let frame = 0;
      const sample = () => {
        const state = window.Main?.session?.workspaceState;
        if (String(state?.activeTabId || '') === targetTabId) {
          const tab = (state?.tabs || []).find(item => String(item?.id || '') === targetTabId);
          const root = window.Shared?.workspaceTabs?.getMountedRoot?.(targetTabId, tab?.type);
          const box = root?.querySelector?.('.svgbox');
          const api = box?.__sharedResizableBoxApi;
          if (box && api) {
            window.__fitActivationZoomFrames.push({
              zoom: api.getZoomLevel(),
              width: box.getBoundingClientRect().width,
              view: api.getViewState()
            });
          }
        }
        if (++frame < 8) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    document.addEventListener('click', onTabClick, true);
  }, String(tabId));
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click();
  await page.waitForFunction(() => window.__fitActivationZoomFrames?.length >= 4, null, { polling: 'raf' });
  return page.evaluate(() => window.__fitActivationZoomFrames);
}

async function installInitialFitZoomCapture(page) {
  await page.evaluate(() => {
    window.__initialFitZooms = [];
    const originalAttach = window.Shared?.attachResizableBox;
    if (typeof originalAttach !== 'function') throw new Error('Shared resizer is unavailable');
    window.Shared.attachResizableBox = function captureInitialFitZoom(container, ...args) {
      const result = originalAttach.call(this, container, ...args);
      const api = container?.__sharedResizableBoxApi;
      if (api?.getViewState?.()?.mode === 'fit') {
        window.__initialFitZooms.push({
          component: container.closest?.('.workspace-page')?.id?.replace(/Page$/, '') || '',
          zoom: api.getZoomLevel(),
          width: container.getBoundingClientRect().width
        });
      }
      return result;
    };
  });
}

test('all components use identical default zoom at desktop and narrow browser sizes', async ({ page }) => {
  test.setTimeout(240_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  const references = new Map();
  for(const [index, component] of COMPONENT_CATALOG.entries()){
    await page.setViewportSize({ width: 1440, height: 900 });
    await openComponentFromWelcome(page, component, { first: index === 0, loadExample: true });
    for(const width of [1920, 1280, 1024, 640, 320]){
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(async () => {
        const figure = await readFigure(page, component);
        const browserScale = await page.evaluate(() => window.Shared.chartStyle.getDefaultGraphViewScale());
        const expected = references.get(width) ?? Math.round(Math.max(0.5,
          Math.floor(browserScale * 1000) / 1000) * 100) / 100;
        return figure.zoom === expected && figure.controlsContained;
      }, { message: `${component.type} shares default zoom at ${width}px` }).toBe(true);
      references.set(width, (await readFigure(page, component)).zoom);
    }
  }
});

test('scatter: fit/manual viewing stays isolated and survives archive reopen with legacy compatibility', async ({ page }) => {
  test.setTimeout(180_000);
  const component = COMPONENT_CATALOG.find(entry => entry.type === 'scatter');
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html');
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  const first = await readFigure(page, component);
  await openComponentFromWelcome(page, component, { loadExample: true });
  const root = page.locator('#scatterPage');
  await root.getByRole('button', { name: 'View graph at actual size', exact: true }).click();
  const zoom = root.getByRole('spinbutton', { name: 'Zoom level percent', exact: true });
  await zoom.fill('125');
  await zoom.press('Enter');
  await root.locator('.resizer-options-summary').click();
  const width = root.getByRole('spinbutton', { name: 'Graph width in pixels', exact: true });
  await width.fill('420');
  await width.press('Enter');
  await root.locator('.resizer-options-summary').click();
  await expect.poll(async () => (await readFigure(page, component)).base[0]).toBe(420);
  const second = await readFigure(page, component);
  expect(second.view).toEqual({ version: 1, mode: 'manual', zoomLevel: 1.25 });
  expect(second.displayedWidth).toBeCloseTo(525, 0);

  const activate = async id => {
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${id}"]`).click();
    await expect.poll(async () => (await readFigure(page, component)).tabId).toBe(id);
  };
  await activate(first.tabId);
  expect((await readFigure(page, component)).view.mode).toBe('fit');
  expect((await readFigure(page, component)).base).toEqual([360, 360]);
  await activate(second.tabId);
  expect((await readFigure(page, component)).view).toEqual(second.view);
  const archive = await buildWorkspaceArchive(page, { useWorker: false });
  const parsed = await parseWorkspaceArchive(page, archive.base64);
  const manualSaved = parsed.session.tabs.find(tab => tab.layout?.graphView?.mode === 'manual');
  const fitSaved = parsed.session.tabs.find(tab => tab.type === 'scatter' && tab.layout?.graphView?.mode === 'fit');
  expect(manualSaved.layout.graphView).toEqual(second.view);
  expect(fitSaved).toBeTruthy();
  await page.setViewportSize({ width: 1024, height: 768 });
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'scatter' });
  await waitForComponentOwnerReady(page, component, {
    requireMountedRoot: true, requirePublished: true, requireIdle: true, timeout: 30_000
  });
  await expect.poll(async () => (await readFigure(page, component)).base[0]).toBe(420);
  const reopened = await readFigure(page, component);
  expect(reopened.view).toEqual(second.view);
  expect(reopened.zoom).toBe(1.25);
  expect(reopened.exportSize).toEqual(second.exportSize);

  const reopenedFitTabId = await page.evaluate(title => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item =>
      item?.type === 'scatter' && item?.title === title
    );
    return String(tab?.id || '');
  }, fitSaved.title);
  expect(reopenedFitTabId).not.toBe('');
  const reopenedFitFrames = await activateAndCaptureZoomFrames(page, reopenedFitTabId);
  const reopenedFit = await readFigure(page, component);
  const viewportFitZoom = await page.evaluate(() => Math.round(Math.max(0.5,
    Math.floor(window.Shared.chartStyle.getDefaultGraphViewScale() * 1000) / 1000) * 100) / 100);
  expect(reopenedFit.view).toEqual({ version: 1, mode: 'fit' });
  expect(reopenedFit.base).toEqual([360, 360]);
  expect(reopenedFit.zoom).toBe(viewportFitZoom);
  expect(reopenedFitFrames.every(frame => frame.view?.mode === 'fit'
    && Math.abs(frame.zoom - viewportFitZoom) < 0.002
    && Math.abs(frame.width - reopenedFit.displayedWidth) < 1)).toBe(true);
  const reopenedManualTabId = await page.evaluate(title => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item =>
      item?.type === 'scatter' && item?.title === title
    );
    return String(tab?.id || '');
  }, manualSaved.title);
  await activateAndCaptureZoomFrames(page, reopenedManualTabId);

  // Simulate an archive written before graphView existed, retaining its saved
  // pixel frame and numeric zoom through the production archive loader.
  const legacy = await page.evaluate(async saved => {
    delete saved.layout.graphView;
    const blob = await window.Shared.graphArchive.buildArchiveBlob({ scope: 'workspace', activeIndex: 0, useWorker: false, tabs: [saved] });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, manualSaved);
  await openWorkspaceArchiveBuffer(page, Buffer.from(legacy), { componentType: 'scatter' });
  await expect.poll(async () => (await readFigure(page, component)).base[0]).toBe(420);
  expect((await readFigure(page, component)).view).toEqual(second.view);
  expect((await readFigure(page, component)).zoom).toBe(1.25);
});

for (const component of COMPONENT_CATALOG) {
  test(`${component.type}: fixed figure and fit viewing preserve export geometry across windows`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/index.html');
    await installInitialFitZoomCapture(page);
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await expect.poll(async () => (await readFigure(page, component)).base).toEqual([360, 360]);
    await waitForComponentOwnerReady(page, component, {
      requireMountedRoot: true, requirePublished: true, requireIdle: true, timeout: 30_000
    });
    const initial = await readFigure(page, component);
    const commonZoom = await page.evaluate(() => Math.round(Math.floor(window.Shared.chartStyle.getDefaultGraphViewScale() * 1000) / 10) / 100);
    expect(initial.zoom, 'default zoom uses the common browser-size rule').toBe(commonZoom);
    const initialFitProjection = await page.evaluate(type => window.__initialFitZooms
      .find(item => item.component === type), component.type);
    expect(initialFitProjection?.zoom, 'new tabs start at the viewport Fit zoom').toBe(initial.zoom);
    expect(initialFitProjection?.width, 'new tabs draw at their Fit size immediately')
      .toBeCloseTo(initial.displayedWidth, 0);
    expect(initial.exportSize).not.toBeNull();
    expect(initial.view).toEqual({ version: 1, mode: 'fit' });
    expect(initial.saved.graphView).toEqual(initial.view);
    expect(initial.saved.svgBox.style.width).toBe('360px');
    expect(initial.saved.svgBox.dataset.resizerZoomLevel).toBe('1');

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect.poll(async () => (await readFigure(page, component)).zoom).toBe(1);
    const large = await readFigure(page, component);
    expect(large.base).toEqual(initial.base);
    expect(large.drawable).toBeCloseTo(initial.drawable, 5);
    expect(large.exportSize).toEqual(initial.exportSize);
    expect(large.viewBox).toBe(initial.viewBox);

    const root = page.locator(`#${component.pageId}`);
    await root.getByRole('button', { name: 'View graph at actual size', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(async () => (await readFigure(page, component)).view.mode).toBe('manual');
    const manual = await readFigure(page, component);
    expect(manual.zoom).toBe(1);
    expect(manual.exportSize).toEqual(initial.exportSize);
    await root.getByRole('button', { name: 'Fit graph to window', exact: true }).click();
    await expect.poll(async () => (await readFigure(page, component)).view.mode).toBe('fit');
    const fitted = await readFigure(page, component);
    expect(fitted.zoom).toBe(initial.zoom);
    expect(fitted.base).toEqual(initial.base);
    expect(fitted.exportSize).toEqual(initial.exportSize);
    expect(fitted.saved.svgBox.style.width).toBe('360px');
    await page.setViewportSize({ width: 640, height: 450 });
    await expect.poll(async () => {
      const narrow = await readFigure(page, component);
      return narrow.controlsContained;
    }).toBe(true);
    expect((await readFigure(page, component)).base).toEqual([360, 360]);
  });
}
