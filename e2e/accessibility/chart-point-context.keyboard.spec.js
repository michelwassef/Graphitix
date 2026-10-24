const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { expectTargetsAtLeast24 } = require('../helpers/targetSizeAssertions');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');

const COMPONENTS = [
  { type: 'pca', pageId: 'pcaPage', plotId: 'pcaPlot', pointSelector: '[data-pca-point-interaction]', menuSelector: '.pca-point-context-menu' },
  { type: 'scatter', pageId: 'scatterPage', plotId: 'scatterPlot', pointSelector: '[data-scatter-point-interaction]', menuSelector: '.scatter-point-context-menu' }
];
const FORMAT_COMPONENTS = [
  { type: 'venn', pageId: 'vennPage', plotId: 'stage', pointSelector: '[data-venn-trace-id]', toolbarSelector: '.venn-upset-trace-controls' },
  { type: 'venn', variant: 'upset', pageId: 'vennPage', plotId: 'stage', pointSelector: '[data-upset-keyboard-mark="true"]', seriesPathSelector: '[data-upset-keyboard-mark="true"]', minimumPointCount: 1, toolbarSelector: '.venn-upset-trace-controls' },
  { type: 'box', pageId: 'boxPage', plotId: 'boxPlot', pointSelector: '[data-box-point-interaction], [data-export-layer="box-points"] circle:not([data-point-proxy="1"]), [data-export-layer="box-points"] rect:not([data-point-proxy="1"]), [data-export-layer="box-points"] path:not([data-point-proxy="1"]), [data-box-shape="body"]:not([data-summary-line="1"]), [data-summary-line="1"], [data-box-overlay-kind], [data-box-point-connections="1"], [data-box-summary="1"]', shapeSelector: '[data-box-shape="body"]:not([data-summary-line="1"])', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="box"]' },
  { type: 'line', pageId: 'linePage', plotId: 'linePlot', pointSelector: ':is([data-line-point-interaction], path[data-line-style-role="line"][data-series]:not([data-plot-point="1"]):not([data-line-overlay]))', seriesPathSelector: 'path[data-line-style-role="line"][data-series]:not([data-plot-point="1"]):not([data-line-overlay])', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="line"]' },
  { type: 'hist', pageId: 'histPage', plotId: 'histPlot', pointSelector: '[data-hist-bar="1"], [data-series-role="hist-border"], [data-overlay-type], .hist-overlay', seriesPathSelector: '[data-hist-bar="1"]', minimumPointCount: 1, toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="hist"]' },
  { type: 'roc', pageId: 'rocPage', plotId: 'rocPlot', pointSelector: 'path[data-series]', seriesPathSelector: 'path[data-series]', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="roc"]' },
  { type: 'survival', pageId: 'survivalPage', plotId: 'survivalPlot', pointSelector: 'path[data-survival-series-color-target="stroke"][data-group]:not([data-survival-censor-mark="1"])', seriesPathSelector: 'path[data-survival-series-color-target="stroke"][data-group]:not([data-survival-censor-mark="1"])', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="survival"]' },
  { type: 'pie', pageId: 'piePage', plotId: 'piePlot', pointSelector: '[data-pie-trace="1"]', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="pie"]' }
];

function captureScrollState(node){
  const containers = [];
  for(let current = node.parentElement; current; current = current.parentElement){
    const style = getComputedStyle(current);
    const scrollable = /(auto|scroll|overlay)/.test(`${style.overflowX} ${style.overflowY}`);
    if(scrollable && (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth)){
      containers.push({ id: current.id, className: String(current.className || ''), top: current.scrollTop, left: current.scrollLeft });
    }
  }
  return { windowX: window.scrollX, windowY: window.scrollY, containers };
}

function findVisiblePointTarget(root, selector){
  const clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  for(let current = root; current; current = current.parentElement){
    const style = getComputedStyle(current);
    const rect = current.getBoundingClientRect();
    const client = {
      left: rect.left + current.clientLeft,
      top: rect.top + current.clientTop,
      right: rect.left + current.clientLeft + current.clientWidth,
      bottom: rect.top + current.clientTop + current.clientHeight
    };
    if(/(auto|scroll|overlay|hidden|clip)/.test(style.overflowX)){
      clip.left = Math.max(clip.left, client.left);
      clip.right = Math.min(clip.right, client.right);
    }
    if(/(auto|scroll|overlay|hidden|clip)/.test(style.overflowY)){
      clip.top = Math.max(clip.top, client.top);
      clip.bottom = Math.min(clip.bottom, client.bottom);
    }
  }

  const points = Array.from(root.querySelectorAll(selector));
  for(let index = 0; index < points.length; index += 1){
    const rect = points[index].getBoundingClientRect();
    const left = Math.max(clip.left, rect.left);
    const right = Math.min(clip.right, rect.right);
    const top = Math.max(clip.top, rect.top);
    const bottom = Math.min(clip.bottom, rect.bottom);
    if(right <= left || bottom <= top){ continue; }
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    if(hit === points[index] || hit?.closest?.(selector) === points[index]){
      return { index, x, y };
    }
  }
  return null;
}

for (const component of COMPONENTS) {
test(`${component.type} point menu supports keyboard navigation after the point receives focus`, async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 320, height: 400 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    const plot = page.locator(`#${component.pageId}:not([hidden]) #${component.plotId}`);
    const point = page.locator(`#${component.pageId}:not([hidden]) ${component.pointSelector}`).first();
    const menu = page.locator(component.menuSelector);
    const item = menu.getByRole('menuitem');
    await expect(plot).toHaveAttribute('role', 'group');
    await expect(plot).toHaveAttribute('tabindex', '0');
    await expect(plot).toHaveAttribute('aria-label', /\S+/);
    await expect(plot).toHaveAttribute('aria-description', /Arrow keys move between points/);
    await expect(point).toBeVisible({ timeout: 30_000 });
    const chartTabStops = await plot.evaluate((root, selector) => ({
      plotIsFocusable: root.tabIndex === 0,
      pointSemanticsAreLazy: Array.from(root.querySelectorAll(selector))
        .every(node => !node.hasAttribute('tabindex') && !node.hasAttribute('role') && !node.hasAttribute('aria-label')),
      pointCount: root.querySelectorAll(selector).length
    }), component.pointSelector);
    expect(chartTabStops.plotIsFocusable).toBe(true);
    expect(chartTabStops.pointSemanticsAreLazy).toBe(true);
    expect(chartTabStops.pointCount).toBeGreaterThan(1);

    await plot.focus();
    await page.keyboard.press('ArrowRight');
    const firstKeyboardPoint = await page.evaluate(selector => {
      const active = document.activeElement;
      return active?.matches?.(selector) ? active.getAttribute(selector.includes('pca') ? 'data-pca-point-interaction' : 'data-scatter-point-interaction') : null;
    }, component.pointSelector);
    expect(firstKeyboardPoint).toBeTruthy();
    await expect(page.locator(':focus')).toHaveAttribute('role', 'button');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', /\S+/);
    await page.keyboard.press('End');
    const lastKeyboardPoint = await page.evaluate(selector => {
      const active = document.activeElement;
      return active?.matches?.(selector) ? active.getAttribute(selector.includes('pca') ? 'data-pca-point-interaction' : 'data-scatter-point-interaction') : null;
    }, component.pointSelector);
    expect(lastKeyboardPoint).toBeTruthy();
    expect(lastKeyboardPoint).not.toBe(firstKeyboardPoint);
    await page.keyboard.press('Home');
    await page.evaluate(selector => {
      const point = document.activeElement;
      if(!point?.matches?.(selector)) throw new Error('Home did not focus a chart point');
      window.__chartPointKeyboardActivationCount = 0;
      point.addEventListener('click', () => { window.__chartPointKeyboardActivationCount += 1; }, { once: true });
    }, component.pointSelector);
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__chartPointKeyboardActivationCount)).toBe(1);
    await page.evaluate(() => window.Shared?.hideAllFormatControls?.({ force: true }));
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 30_000
    });
    await expect(point).toBeVisible();

    const pointerTarget = await plot.evaluate(findVisiblePointTarget, component.pointSelector);
    expect(pointerTarget, `${component.type} should have a point under the visible pointer area`).not.toBeNull();
    const contextPoint = plot.locator(component.pointSelector).nth(pointerTarget.index);
    const scrollBeforeMenu = await contextPoint.evaluate(captureScrollState);
    await page.mouse.click(pointerTarget.x, pointerTarget.y, { button: 'right' });
    await expect(menu).toBeVisible();
    await expect(item).toBeVisible();
    const scrollAfterMenu = await contextPoint.evaluate(captureScrollState);
    expect(scrollAfterMenu).toEqual(scrollBeforeMenu);
    await expectTargetsAtLeast24(item, `${component.type} point menu`);
    if(component.type === 'scatter'){
      const itemPadding = await item.evaluate(node => getComputedStyle(node).padding);
      expect(itemPadding).toBe('6px 10px');
    }
    const menuBounds = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(menuBounds).not.toBeNull();
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.y).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(item).toBeFocused();
    await page.keyboard.press('Escape');
    const focusReturnedToPoint = await page.evaluate(selector => {
      const active = document.activeElement;
      if(!active?.matches?.(selector) || active.getAttribute('tabindex') !== '-1'){
        return false;
      }
      active.setAttribute('data-e2e-context-menu-focus-return', 'true');
      return true;
    }, `#${component.pageId}:not([hidden]) ${component.pointSelector}`);
    expect(focusReturnedToPoint).toBe(true);
    const focusedPoint = page.locator('[data-e2e-context-menu-focus-return="true"]');
    await expect(focusedPoint).toBeFocused();

    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    await expect(item).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(focusedPoint).toBeFocused();

    await page.keyboard.press('Shift+F10');
    await expect(item).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    await expect.poll(() => page.evaluate(({ pageId, pointSelector }) => {
      const active = document.activeElement;
      return !!active?.isConnected
        && active.matches?.(`#${pageId}:not([hidden]) ${pointSelector}`)
        && active.getAttribute('tabindex') === '-1';
    }, component)).toBe(true);
  });
}

for (const component of COMPONENTS) {
  test(`${component.type} point menu closes and rejects stale actions after its tab deactivates`, async ({ page }) => {
    test.setTimeout(180_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

    await openComponentFromWelcome(page, component, { loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-point-menu-owner-change-open' });
    }, firstTabId);
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    const point = page.locator(`#${component.pageId}:not([hidden]) ${component.pointSelector}`).first();
    const menu = page.locator(component.menuSelector);
    await expect(point).toBeVisible();
    await point.click({ button: 'right', force: true });
    await expect(menu).toBeVisible();
    const menuState = await menu.evaluate((node, type) => ({
      ownerTabId: node[type === 'pca' ? '__pcaPointOwnerTabId' : '__scatterPointOwnerTabId'] || null,
      pointData: node[type === 'pca' ? '__pcaPointData' : '__scatterPointData'] || null
    }), component.type);
    expect(menuState.ownerTabId).toBe(firstTabId);
    expect(menuState.pointData).toBeTruthy();

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-point-menu-owner-change-close' });
    }, secondTabId);
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    await expect(menu).toBeHidden();
    await expect.poll(() => menu.evaluate((node, type) => ({
      ownerTabId: node[type === 'pca' ? '__pcaPointOwnerTabId' : '__scatterPointOwnerTabId'] || null,
      pointData: node[type === 'pca' ? '__pcaPointData' : '__scatterPointData'] || null
    }), component.type)).toEqual({ ownerTabId: null, pointData: null });

    const activeDataState = async () => page.evaluate(type => {
      const component = window.Components?.[type];
      const hot = component?.__ensureHotForActiveTab?.();
      if(type === 'pca') return JSON.stringify(hot?.getData?.() || []);
      return JSON.stringify((hot?.gridApi?.getSelectedNodes?.() || [])
        .map(node => Number(node?.data?.__rowIndex ?? node?.rowIndex))
        .filter(Number.isFinite)
        .sort((left, right) => left - right));
    }, component.type);
    const before = await activeDataState();
    await menu.evaluate((node, state) => {
      const ownerKey = state.type === 'pca' ? '__pcaPointOwnerTabId' : '__scatterPointOwnerTabId';
      const dataKey = state.type === 'pca' ? '__pcaPointData' : '__scatterPointData';
      node[ownerKey] = state.ownerTabId;
      node[dataKey] = state.pointData;
      node.querySelector('[role="menuitem"]')?.click();
    }, { type: component.type, ownerTabId: firstTabId, pointData: menuState.pointData });
    expect(await activeDataState()).toBe(before);
  });
}

for (const component of FORMAT_COMPONENTS) {
  test(`${component.variant || component.type} point formatting is reachable by arrow keys and Enter`, async ({ page }) => {
    test.setTimeout(60_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    if(component.type === 'box' && component.shapeSelector){
      await page.locator('#boxGraphType').selectOption('box');
    }
    if(component.variant === 'upset'){
      await page.locator('#vennPlotType').selectOption('upset');
    }
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    const plot = page.locator(`#${component.pageId}:not([hidden]) #${component.plotId}`);
    const points = plot.locator(`:is(${component.pointSelector})`);
    await expect(plot).toHaveAttribute('role', 'group');
    await expect(plot).toHaveAttribute('tabindex', '0');
    await expect(plot).toHaveAttribute('aria-label', /\S+/);
    await expect(plot).toHaveAttribute('aria-description', /arrow keys/i);
    await expect(points.first()).toBeVisible();
    expect(await points.count()).toBeGreaterThanOrEqual(component.minimumPointCount || 2);

    const additionalMarkSelector = component.seriesPathSelector || component.shapeSelector;
    if(additionalMarkSelector){
      const additionalMark = page.locator(`#${component.pageId}:not([hidden]) #${component.plotId} ${additionalMarkSelector}`).first();
      await expect(additionalMark).toBeVisible();
      await plot.focus();
      await page.keyboard.press('ArrowRight');
      await expect(additionalMark).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator(component.toolbarSelector).last()).toBeVisible();
      await page.evaluate(() => window.Shared?.hideAllFormatControls?.({ force: true }));
    }

    await plot.focus();
    await page.keyboard.press('ArrowRight');
    await expect(plot.locator(`:is(${component.pointSelector}):focus`)).toHaveCount(1);
    await expect(page.locator(':focus')).toHaveAttribute('role', 'button');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', /\S+/);
    await page.keyboard.press('Enter');
    await expect(page.locator(component.toolbarSelector).last()).toBeVisible();
  });
}

for(const component of FORMAT_COMPONENTS.filter(item => item.type === 'venn')){
  test(`${component.variant || component.type} mark keyboard formatting is rebound after archive reopen`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    if(component.variant === 'upset'){
      await page.locator('#vennPlotType').selectOption('upset');
    }
    await waitForComponentOwnerReady(page, 'venn', {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 60_000
    });
    if(component.variant === 'upset'){
      await page.locator('#vennPage:not([hidden]) #stage [data-upset-keyboard-mark="true"]')
        .evaluateAll(nodes => nodes.forEach(node => node.removeAttribute('data-upset-keyboard-mark')));
    }

    const archive = await buildWorkspaceArchive(page, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: `e2e-${component.variant || component.type}-mark-keyboard-reopen`
    });
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
      fileName: `${component.variant || component.type}-mark-keyboard.graph`,
      componentType: 'venn',
      timeout: 60_000
    });
    await waitForComponentOwnerReady(page, 'venn', {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 60_000
    });

    const plot = page.locator('#vennPage:not([hidden]) #stage');
    const mark = plot.locator(component.pointSelector).first();
    await expect(plot).toHaveAttribute('role', 'group');
    await expect(plot).toHaveAttribute('tabindex', '0');
    await expect(mark).toBeVisible();
    await plot.focus();
    await page.keyboard.press('ArrowRight');
    await expect(mark).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(component.toolbarSelector).last()).toBeVisible();
  });
}

test('Box mark keyboard formatting is rebound after archive reopen', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = FORMAT_COMPONENTS.find(item => item.type === 'box');
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await page.locator('#boxGraphType').selectOption('box');
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 60_000
  });

  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'document-snapshot',
    compression: 'STORE',
    reason: 'e2e-box-mark-keyboard-reopen'
  });
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
    fileName: 'box-mark-keyboard.graph',
    componentType: 'box',
    timeout: 60_000
  });
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 60_000
  });

  const plot = page.locator('#boxPage:not([hidden]) #boxPlot');
  const shape = plot.locator(component.shapeSelector).first();
  await expect(shape).toBeVisible();
  await plot.focus();
  await page.keyboard.press('ArrowRight');
  await expect(shape).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator(component.toolbarSelector).last()).toBeVisible();
});

for(const component of FORMAT_COMPONENTS.filter(item => item.type === 'hist' || item.type === 'roc' || item.type === 'survival')){
  test(`${component.type} mark keyboard formatting is rebound after archive reopen`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 60_000
    });

    const archive = await buildWorkspaceArchive(page, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: `e2e-${component.type}-curve-keyboard-reopen`
    });
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
      fileName: `${component.type}-curve-keyboard.graph`,
      componentType: component.type,
      timeout: 60_000
    });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 60_000
    });

    const plot = page.locator(`#${component.pageId}:not([hidden]) #${component.plotId}`);
    const curve = plot.locator(component.seriesPathSelector).first();
    await expect(curve).toBeVisible();
    await plot.focus();
    await page.keyboard.press('ArrowRight');
    await expect(curve).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(component.toolbarSelector).last()).toBeVisible();
  });
}

test('Heatmap cells navigate by keyboard and open formatting after archive reopen', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'heatmap', pageId: 'heatmapPage' }, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'heatmap', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 60_000
  });

  const matrix = page.locator('#heatmapPage:not([hidden]) #heatmapSvg [data-heatmap-cell-hit-layer="1"]');
  const toolbar = page.locator('.font-toolbar-host[data-font-toolbar-scope="heatmap"]');
  await expect(matrix).toHaveAttribute('role', 'button');
  await expect(matrix).toHaveAttribute('tabindex', '0');
  await matrix.focus();
  const firstCell = await matrix.getAttribute('aria-label');
  await page.keyboard.press('ArrowRight');
  const nextCell = await matrix.getAttribute('aria-label');
  expect(nextCell).not.toBe(firstCell);
  const focusCue = await matrix.evaluate(node => {
    const style = getComputedStyle(node);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) || 0 };
  });
  expect(focusCue.outlineStyle).not.toBe('none');
  expect(focusCue.outlineWidth).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(toolbar).toBeVisible();
  await page.evaluate(() => window.Shared?.hideAllFormatControls?.({ force: true }));

  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'document-snapshot',
    compression: 'STORE',
    reason: 'e2e-heatmap-cell-keyboard-reopen'
  });
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
    fileName: 'heatmap-cell-keyboard.graph',
    componentType: 'heatmap',
    timeout: 60_000
  });
  await waitForComponentOwnerReady(page, 'heatmap', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 60_000
  });

  const restoredMatrix = page.locator('#heatmapPage:not([hidden]) #heatmapSvg [data-heatmap-cell-hit-layer="1"]');
  await expect(restoredMatrix).toHaveAttribute('role', 'button');
  await restoredMatrix.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(toolbar).toBeVisible();
});

test('large aggregated Scatter avoids per-point tab stops and keeps its data grid available', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, COMPONENTS.find(component => component.type === 'scatter'), { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true });

  await page.evaluate(() => {
    const scatter = window.Components?.scatter;
    const hot = scatter?.__ensureHotForActiveTab?.();
    if(!hot?.loadData || !scatter?.draw){
      throw new Error('Scatter table and draw APIs are unavailable');
    }
    const rows = [['Sample', 'X', 'Y']];
    for(let index = 0; index < 7001; index += 1){
      rows.push([`Sample ${index + 1}`, index + 1, Math.sin(index / 25)]);
    }
    hot.loadData(rows);
    scatter.draw({ reason: 'chart-point-keyboard-dense-e2e', userInitiated: true });
  });
  await page.waitForFunction(() => {
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot [data-layer="points"]');
    const state = window.Components?.scatter?.isIdleForSnapshot?.({ tabId: window.Main?.session?.workspaceState?.activeTabId });
    return !!layer && state === true && !['canvas-pending'].includes(layer.getAttribute('data-render-mode'));
  }, null, { timeout: 90_000 });

  const plot = page.locator('#scatterPage:not([hidden]) #scatterPlot');
  await expect(plot).toHaveAttribute('role', 'group');
  await expect(plot).toHaveAttribute('tabindex', '0');
  await expect(plot).toHaveAttribute('aria-label', 'Scatter chart');
  await expect(plot).toHaveAttribute('aria-description', /Use the data table for points rendered in aggregate/);
  const denseSemantics = await plot.evaluate(root => {
    const grid = document.querySelector('#scatterPage:not([hidden]) #scatterHot [role="grid"], #scatterPage:not([hidden]) #scatterHot [role="treegrid"]');
    const layer = root.querySelector('[data-layer="points"]');
    root.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    return {
      pointCount: root.querySelectorAll('[data-scatter-point-interaction]').length,
      renderMode: layer?.getAttribute('data-render-mode') || '',
      pointMarkTabStops: root.querySelectorAll('[data-scatter-point-interaction][tabindex="0"]').length,
      focusRemainsOnPlot: document.activeElement === root,
      gridRole: grid?.getAttribute('role') || '',
      gridName: grid?.getAttribute('aria-label')
        || (grid?.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || '').filter(Boolean).join(' '),
      gridFocusable: !!grid && (grid.tabIndex >= 0 || !!grid.querySelector('[tabindex="0"]')),
      gridViewportEntryStops: grid
        ? Array.from(grid.querySelectorAll('.ag-floating-top-viewport, .ag-body-viewport, .ag-center-cols-viewport'))
          .filter(node => node.tabIndex >= 0).length
        : 0,
      pinnedScrollName: grid?.querySelector('.hot-pinned-row-scroll-region')?.getAttribute('aria-label') || '',
      scrollRegionTitles: Array.from(grid?.querySelectorAll('.hot-grid-scroll-region, .hot-pinned-row-scroll-region') || [])
        .map(node => node.getAttribute('title') || '')
    };
  });
  expect(denseSemantics.renderMode).toMatch(/^(canvas|batched-circles)$/);
  expect(denseSemantics.pointCount).toBe(0);
  expect(denseSemantics.pointMarkTabStops).toBe(0);
  expect(denseSemantics.focusRemainsOnPlot).toBe(true);
  expect(denseSemantics.gridRole).toMatch(/^(grid|treegrid)$/);
  expect(denseSemantics.gridName).toBeTruthy();
  expect(denseSemantics.gridFocusable).toBe(true);
  expect(denseSemantics.gridViewportEntryStops).toBe(2);
  expect(denseSemantics.pinnedScrollName).toMatch(/Scatter data table pinned rows horizontal scroll area/);
  expect(denseSemantics.scrollRegionTitles.every(title => !title)).toBe(true);

  const grid = page.locator('#scatterPage:not([hidden]) #scatterHot [role="grid"]');
  const rawTab = page.locator('#scatterPage:not([hidden]) .data-view-tabs__tab[data-view-id="raw"]').first();
  await expect(rawTab).toBeVisible();
  const rawTabRadii = await rawTab.evaluate(node => {
    const style = getComputedStyle(node);
    return [style.borderTopLeftRadius, style.borderTopRightRadius,
      style.borderBottomRightRadius, style.borderBottomLeftRadius];
  });
  expect(rawTabRadii).toEqual(['5px', '5px', '0px', '0px']);
  const rawSaveButton = page.locator('#scatterPage:not([hidden]) .data-view-tabs__save[data-view-id="raw"]').first();
  await expect(rawSaveButton).toBeVisible();
  await rawSaveButton.focus();
  let enteredGridByKeyboard = false;
  const tabTrail = [];
  for(let attempt = 0; attempt < 20; attempt += 1){
    await page.keyboard.press('Tab');
    const focusState = await grid.evaluate(root => ({
      insideGrid: root.contains(document.activeElement),
      activeClass: String(document.activeElement?.className || ''),
      activeLabel: document.activeElement?.getAttribute?.('aria-label') || ''
    }));
    tabTrail.push(focusState);
    if(focusState.insideGrid && !focusState.activeClass.includes('hot-pinned-row-scroll-region')){
      enteredGridByKeyboard = true;
      break;
    }
  }
  expect(enteredGridByKeyboard, JSON.stringify(tabTrail)).toBe(true);
  await page.keyboard.press('ArrowDown');
  await expect(grid.locator('.ag-cell-focus, .ag-header-cell-focus').first()).toBeVisible();
  const gridFocusStyle = await grid.evaluate(root => {
    const active = document.activeElement;
    const focusTarget = active?.closest?.('.ag-cell, .ag-header-cell') || active;
    const style = focusTarget ? getComputedStyle(focusTarget) : null;
    return {
      withinGrid: !!active && root.contains(active),
      focusVisible: !!focusTarget?.matches?.(':focus-visible'),
      outlineStyle: style?.outlineStyle || 'none',
      outlineWidth: style?.outlineWidth || '0px'
    };
  });
  expect(gridFocusStyle.withinGrid).toBe(true);
  expect(gridFocusStyle.focusVisible).toBe(true);
  expect(gridFocusStyle.outlineStyle).not.toBe('none');

  const headerCell = page.locator('#scatterPage:not([hidden]) #scatterHot .ag-header-cell').first();
  await headerCell.focus();
  const headerFocusStyles = await headerCell.evaluate(node => {
    const style = getComputedStyle(node);
    const before = getComputedStyle(node, '::before');
    const after = getComputedStyle(node, '::after');
    return {
      focusVisible: node.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      beforeContent: before.content,
      beforeDisplay: before.display,
      afterContent: after.content,
      afterDisplay: after.display
    };
  });
  expect(headerFocusStyles.focusVisible).toBe(true);
  expect(headerFocusStyles.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(headerFocusStyles.outlineWidth)).toBeGreaterThan(0);
  expect(headerFocusStyles.outlineColor).not.toBe('transparent');
  expect(headerFocusStyles.beforeContent).toBe('none');
  expect(headerFocusStyles.beforeDisplay).toBe('none');
  expect(headerFocusStyles.afterContent).toBe('none');
  expect(headerFocusStyles.afterDisplay).toBe('none');
});
