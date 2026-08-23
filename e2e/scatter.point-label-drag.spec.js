const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const FIXTURE = [
  ['Sample', 'X', 'Y'],
  ['A', 1, 1],
  ['B', 2, 1.5],
  ['C', 3, 2.2],
  ['D', 4, 3]
];

const FIXTURE_3D = [
  ['Sample', 'X', 'Y', 'Z'],
  ['A', 1, 1, 1],
  ['B', 2, 1.5, 2],
  ['C', 3, 2.2, 1.2],
  ['D', 4, 3, 2.8]
];

async function waitForScatterIdle(page) {
  await page.waitForFunction(() => {
    const state = window.Components?.scatter?.__testGetState?.();
    return state && state.drawInProgress !== true && !state.pendingDrawOpts && !state.pendingDrawReasons;
  }, null, { timeout: 60_000 });
}

async function selectRows(page, rows) {
  await page.evaluate(indices => {
    const scatter = window.Components?.scatter;
    const hot = scatter?.__ensureHotForActiveTab?.();
    const hooks = scatter?.__testHooks;
    indices.forEach(rowIndex => hooks?.setRowSelected?.(hot, rowIndex, true, { preserveExisting: true }));
  }, rows);
  await waitForScatterIdle(page);
}

async function readLabels(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#scatterPlot svg [data-point-label-key]'))
    .map(node => String(node.textContent || '').trim()).filter(Boolean).sort());
}

async function readGeometry(page, text) {
  return page.evaluate(labelText => {
    const node = Array.from(document.querySelectorAll('#scatterPlot svg [data-point-label-key]'))
      .find(label => String(label.textContent || '').trim() === labelText);
    const leader = node?.previousElementSibling;
    if (!node || leader?.tagName?.toLowerCase() !== 'line') return null;
    const box = node.getBBox();
    return {
      x: Number(node.getAttribute('x')),
      y: Number(node.getAttribute('y')),
      relX: (Number(node.getAttribute('x')) - (Number(node.dataset?.pointLabelContainerLeft) || 0)) /
        Math.max(1, Number(node.dataset?.pointLabelContainerRight) - (Number(node.dataset?.pointLabelContainerLeft) || 0)),
      relY: (Number(node.getAttribute('y')) - (Number(node.dataset?.pointLabelContainerTop) || 0)) /
        Math.max(1, Number(node.dataset?.pointLabelContainerBottom) - (Number(node.dataset?.pointLabelContainerTop) || 0)),
      key: node.getAttribute('data-point-label-key'),
      attachmentGap: Math.hypot(
        Number(leader.getAttribute('x2')) - Math.max(box.x, Math.min(Number(leader.getAttribute('x2')), box.x + box.width)),
        Number(leader.getAttribute('y2')) - Math.max(box.y, Math.min(Number(leader.getAttribute('y2')), box.y + box.height))
      ),
      leader: {
        x1: Number(leader.getAttribute('x1')),
        y1: Number(leader.getAttribute('y1')),
        x2: Number(leader.getAttribute('x2')),
        y2: Number(leader.getAttribute('y2'))
      }
    };
  }, text);
}

async function setScatterPointLabelFontSize(page, labelText, scope, sizePt) {
  const label = page.locator('#scatterPlot svg [data-point-label-key]', { hasText: new RegExp(`^${labelText}$`) }).first();
  await label.click({ force: true });
  const scopeSelect = page.locator('select.font-controls-panel__select').first();
  const sizeInput = page.locator('input[aria-label="Font size"]').first();
  await expect(scopeSelect).toBeVisible();
  await scopeSelect.selectOption(scope);
  await sizeInput.fill(String(sizePt));
  await sizeInput.evaluate(node => node.dispatchEvent(new Event('change', { bubbles: true })));
  await sizeInput.blur();
  await waitForScatterIdle(page);
}

async function readScatterLabelFontSizes(page) {
  return page.evaluate(() => Object.fromEntries(Array.from(
    document.querySelectorAll('#scatterPlot svg [data-point-label-key]')
  ).map(node => [String(node.textContent || '').trim(), Number.parseFloat(node.getAttribute('font-size'))])));
}

test('Scatter point-label drag is local, pinned, persisted, and tab isolated', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

  await page.evaluate(matrix => {
    const scatter = window.Components?.scatter;
    const hot = scatter?.__ensureHotForActiveTab?.();
    hot.loadData(matrix);
    scatter.draw({ reason: 'e2e-point-label-drag' });
  }, FIXTURE);
  await waitForScatterIdle(page);

  const firstPoint = page.locator('#scatterPlot svg [data-scatter-point-interaction]').first();
  await expect(firstPoint).toBeVisible();
  await firstPoint.click({ button: 'right', force: true });
  const pointMenu = page.locator('.scatter-point-context-menu');
  await expect(pointMenu).toBeVisible();
  const menuStyle = await pointMenu.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      gap: style.gap,
      boxShadow: style.boxShadow,
      itemCount: node.querySelectorAll(':scope > button').length
    };
  });
  expect(menuStyle).toEqual({
    padding: ['0px', '0px', '0px', '0px'],
    gap: '0px',
    boxShadow: 'none',
    itemCount: 1
  });
  await page.keyboard.press('Escape');
  await selectRows(page, [1, 2]);
  await expect.poll(() => readLabels(page)).toEqual(['A', 'B']);
  const defaultLabelSizes = await readScatterLabelFontSizes(page);
  expect(defaultLabelSizes.A).toBeCloseTo(10 * (96 / 72), 6);
  expect(defaultLabelSizes.B).toBeCloseTo(10 * (96 / 72), 6);

  await page.locator("#scatterPlot svg [data-layer='point-labels'] text", { hasText: /^A$/ }).first().click({ force: true });
  await expect(page.locator('select.font-controls-panel__select').first()).toBeVisible();
  await waitForScatterIdle(page);
  const beforeFontA = await readGeometry(page, 'A');
  const beforeFontB = await readGeometry(page, 'B');
  await setScatterPointLabelFontSize(page, 'A', 'labels', 16);
  await expect.poll(() => readScatterLabelFontSizes(page)).toEqual({ A: 21.33, B: 21.33 });
  const afterAllFontA = await readGeometry(page, 'A');
  const afterAllFontB = await readGeometry(page, 'B');
  expect(afterAllFontA.relX).toBeCloseTo(beforeFontA.relX, 6);
  expect(afterAllFontA.relY).toBeCloseTo(beforeFontA.relY, 6);
  expect(afterAllFontB.relX).toBeCloseTo(beforeFontB.relX, 6);
  expect(afterAllFontB.relY).toBeCloseTo(beforeFontB.relY, 6);
  await setScatterPointLabelFontSize(page, 'A', 'selection', 12);
  await expect.poll(() => readScatterLabelFontSizes(page)).toEqual({ A: 16, B: 21.33 });
  const scatterFontStyles = await page.evaluate(() => window.Components?.scatter?.getPayload?.()?.config?.fontStyles || null);
  expect(scatterFontStyles?.__labels__?.fontSize).toBe('21.33px');
  const individualLabelKey = Object.keys(scatterFontStyles || {}).find(key => key.startsWith('pointLabel:') && key.endsWith('|A'));
  expect(scatterFontStyles?.[individualLabelKey]?.fontSize).toBe('16px');

  const beforeA = await readGeometry(page, 'A');
  const beforeB = await readGeometry(page, 'B');
  expect(beforeA?.key).toBeTruthy();
  const label = page.locator("#scatterPlot svg [data-layer='point-labels'] text", { hasText: /^A$/ }).first();
  const box = await label.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();

  const movedA = await readGeometry(page, 'A');
  const unmovedB = await readGeometry(page, 'B');
  expect(Math.hypot(movedA.x - beforeA.x, movedA.y - beforeA.y)).toBeGreaterThan(20);
  expect(unmovedB.x).toBeCloseTo(beforeB.x, 6);
  expect(unmovedB.y).toBeCloseTo(beforeB.y, 6);
  expect(Math.hypot(movedA.leader.x2 - beforeA.leader.x2, movedA.leader.y2 - beforeA.leader.y2)).toBeGreaterThan(10);

  const saved = await page.evaluate(() => {
    const activeId = window.Main?.session?.workspaceState?.activeTabId;
    const scatter = window.Components?.scatter;
    return {
      session: scatter?.__testHooks?.getSession?.(activeId)?.state?.labels?.positions?.pointLabels || {},
      payload: scatter?.getPayload?.()?.config?.labelPositions?.pointLabels || {}
    };
  });
  expect(saved.session[movedA.key]).toBeTruthy();
  expect(saved.payload[movedA.key]).toBeTruthy();

  await selectRows(page, [3]);
  await expect.poll(() => readLabels(page)).toEqual(['A', 'B', 'C']);
  const afterAddA = await readGeometry(page, 'A');
  expect(afterAddA.x).toBeCloseTo(movedA.x, 4);
  expect(afterAddA.y).toBeCloseTo(movedA.y, 4);

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' });
  const isolation = await page.evaluate(firstId => {
    const activeId = window.Main?.session?.workspaceState?.activeTabId;
    const hooks = window.Components?.scatter?.__testHooks;
    return {
      activeId,
      first: hooks?.getSession?.(firstId)?.state?.labels?.positions?.pointLabels || {},
      second: hooks?.getSession?.(activeId)?.state?.labels?.positions?.pointLabels || {}
    };
  }, firstTabId);
  expect(isolation.activeId).not.toBe(firstTabId);
  expect(isolation.first[movedA.key]).toBeTruthy();
  expect(Object.keys(isolation.second)).toHaveLength(0);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click({ force: true });
  await expect.poll(() => readLabels(page)).toEqual(['A', 'B', 'C']);
  const restoredA = await readGeometry(page, 'A');
  expect(restoredA.x).toBeCloseTo(movedA.x, 4);
  expect(restoredA.y).toBeCloseTo(movedA.y, 4);
});

test('Scatter 3D rotation keeps resized point-label leaders attached', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.evaluate(matrix => {
    const scatter = window.Components?.scatter;
    scatter?.__ensureHotForActiveTab?.()?.loadData(matrix);
    scatter?.draw?.({ reason: 'e2e-point-label-3d-rotation' });
  }, FIXTURE_3D);
  await waitForScatterIdle(page);
  await page.locator('#scatterViewMode').selectOption('3d');
  await page.waitForFunction(() => document.querySelector('#scatterPlot #scatterSvg')?.dataset?.viewMode === '3d', null, {
    timeout: 30_000
  });
  await selectRows(page, [1, 2]);
  await expect.poll(() => readLabels(page)).toEqual(['A', 'B']);
  await setScatterPointLabelFontSize(page, 'A', 'labels', 16);

  const before = await readGeometry(page, 'A');
  expect(before?.attachmentGap).toBeLessThan(2);
  const rotationBefore = await page.evaluate(() => ({ ...window.Components?.scatter?.getPayload?.()?.config?.rotation }));
  const svgBox = await page.locator('#scatterPlot #scatterSvg').boundingBox();
  expect(svgBox).toBeTruthy();
  const startX = svgBox.x + svgBox.width * 0.5;
  const startY = svgBox.y + svgBox.height * 0.7;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY + 45, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const after = await readGeometry(page, 'A');
  const rotationAfter = await page.evaluate(() => ({ ...window.Components?.scatter?.getPayload?.()?.config?.rotation }));
  expect(Math.max(
    Math.abs(Number(rotationAfter.x) - Number(rotationBefore.x)),
    Math.abs(Number(rotationAfter.y) - Number(rotationBefore.y)),
    Math.abs(Number(rotationAfter.z) - Number(rotationBefore.z))
  )).toBeGreaterThan(0.1);
  expect(Math.hypot(after.leader.x1 - before.leader.x1, after.leader.y1 - before.leader.y1)).toBeGreaterThan(2);
  expect(after.attachmentGap).toBeLessThan(2);

  const capture = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const tab = (state.tabs || []).find(item => item?.id === state.activeTabId) || null;
    const svg = document.querySelector('#scatterPage:not([hidden]) #scatterPlot #scatterSvg');
    const legendCount = svg?.querySelectorAll?.('[data-layer="scatter-3d-legend"], [data-legend-viewport-content="true"]').length || 0;
    const persisted = window.Main?.session?.persistActiveTabState?.(tab, {
      reason: 'e2e-scatter-3d-label-cache-capture',
      origin: 'lifecycle',
      captureLivePayload: true,
      allowSkipLivePayloadCapture: false,
      captureRenderCache: true
    });
    return {
      persisted: persisted !== false,
      legendCount,
      svgRestored: !!document.querySelector('#scatterPage:not([hidden]) #scatterPlot #scatterSvg')
    };
  });
  expect(capture).toEqual({ persisted: true, legendCount: 0, svgRestored: true });
  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
