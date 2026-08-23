const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const PCA_FIXTURE = [
  ['Label point', false, false, false, false],
  ['Variable', 'A', 'B', 'C', 'D'],
  ['Var1', 1, 2, 3, 2],
  ['Var2', 2, 3, 2, 3],
  ['Var3', 3, 4, 1, 4],
  ['Var4', 4, 2, 4, 1]
];

async function loadPcaFixture(page) {
  await page.evaluate((matrix) => {
    const hot = window.Components?.pca?.getHotInstance?.();
    if (!hot || typeof hot.loadData !== 'function') {
      throw new Error('PCA hot instance is not ready');
    }
    hot.loadData(matrix);
  }, PCA_FIXTURE);

  await page.waitForFunction(() => {
    const hot = window.Components?.pca?.getHotInstance?.();
    const data = hot?.getData?.() || [];
    return Array.isArray(data[1]) && String(data[1][1] || '').trim() === 'A';
  }, null, { timeout: 30_000 });

  await page.waitForSelector('#pcaSvg', { timeout: 30_000 });
  await page.waitForTimeout(1200);
}

async function readPcaManualLabels(page) {
  return page.evaluate(() => {
    const svg = document.getElementById('pcaSvg');
    if (!svg) {
      return [];
    }
    return Array.from(svg.querySelectorAll("g[data-layer='point-labels'] text"))
      .map(node => String(node.textContent || '').trim())
      .filter(Boolean)
      .sort();
  });
}

async function readPcaLabelRow(page) {
  return page.evaluate(() => {
    const hot = window.Components?.pca?.getHotInstance?.();
    const row = hot?.getData?.()?.[0] || [];
    return row.slice(0, 5);
  });
}

async function clickPcaLabelToggle(page, colId) {
  const cell = page.locator(`#pcaHot .ag-floating-top .ag-cell[col-id="${colId}"]`).first();
  await expect(cell).toBeVisible();
  await cell.click({ force: true });
  await page.waitForTimeout(900);
}

async function waitForPcaDrawStable(page) {
  await page.waitForFunction(() => {
    const timestamp = Number(window.Components?.pca?.__state?.performance?.draw?.timestamp) || 0;
    const now = performance.now();
    const tracker = window.__pcaFontDrawStable || { timestamp, since: now };
    if (tracker.timestamp !== timestamp) {
      tracker.timestamp = timestamp;
      tracker.since = now;
    }
    window.__pcaFontDrawStable = tracker;
    return now - tracker.since >= 300;
  }, null, { timeout: 30_000 });
  await page.evaluate(() => { delete window.__pcaFontDrawStable; });
}

async function readPcaLabelGeometry(page, text) {
  return page.evaluate(labelText => {
    const svg = document.getElementById('pcaSvg');
    const node = Array.from(document.querySelectorAll('#pcaSvg [data-point-label-key]'))
      .find(label => String(label.textContent || '').trim() === labelText);
    const leader = node?.previousElementSibling;
    if (!node || leader?.tagName?.toLowerCase() !== 'line') {
      return null;
    }
    const box = node.getBBox();
    const containerLeft = Number(node.dataset?.pointLabelContainerLeft) || 0;
    const containerRight = Number(node.dataset?.pointLabelContainerRight);
    const containerTop = Number(node.dataset?.pointLabelContainerTop) || 0;
    const containerBottom = Number(node.dataset?.pointLabelContainerBottom);
    return {
      x: Number(node.getAttribute('x')),
      y: Number(node.getAttribute('y')),
      relX: (Number(node.getAttribute('x')) - containerLeft) / Math.max(1, containerRight - containerLeft),
      relY: (Number(node.getAttribute('y')) - containerTop) / Math.max(1, containerBottom - containerTop),
      key: node.getAttribute('data-point-label-key'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
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

async function setPcaPointLabelFontSize(page, labelText, scope, sizePt) {
  const previousDrawTimestamp = await page.evaluate(() => Number(window.Components?.pca?.__state?.performance?.draw?.timestamp) || 0);
  const label = page.locator('#pcaSvg [data-point-label-key]', { hasText: new RegExp(`^${labelText}$`) }).first();
  await label.click({ force: true });
  const scopeSelect = page.locator('select.font-controls-panel__select').first();
  const sizeInput = page.locator('input[aria-label="Font size"]').first();
  await expect(scopeSelect).toBeVisible();
  await scopeSelect.selectOption(scope);
  await sizeInput.fill(String(sizePt));
  await sizeInput.evaluate(node => node.dispatchEvent(new Event('change', { bubbles: true })));
  await sizeInput.blur();
  await page.waitForFunction(previous => {
    const current = Number(window.Components?.pca?.__state?.performance?.draw?.timestamp) || 0;
    return current > previous;
  }, previousDrawTimestamp, { timeout: 30_000 });
  await waitForPcaDrawStable(page);
}

async function readPcaLabelFontSizes(page) {
  return page.evaluate(() => Object.fromEntries(Array.from(
    document.querySelectorAll('#pcaSvg [data-point-label-key]')
  ).map(node => [String(node.textContent || '').trim(), Number.parseFloat(node.getAttribute('font-size'))])));
}

test.describe('PCA label toggle regression', () => {
  test('label row checkboxes keep plotted point labels in sync', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage' }, { first: true });
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    await loadPcaFixture(page);

    const labelCell = page.locator('#pcaHot .ag-floating-top .ag-cell[col-id="c1"]').first();
    const labelCheckbox = labelCell.locator('.ag-checkbox-input-wrapper');
    const [cellBox, checkboxBox] = await Promise.all([
      labelCell.boundingBox(),
      labelCheckbox.boundingBox()
    ]);
    expect(cellBox).toBeTruthy();
    expect(checkboxBox).toBeTruthy();
    const cellCenterX = cellBox.x + (cellBox.width / 2);
    const checkboxCenterX = checkboxBox.x + (checkboxBox.width / 2);
    const cellCenterY = cellBox.y + (cellBox.height / 2);
    const checkboxCenterY = checkboxBox.y + (checkboxBox.height / 2);
    expect(Math.abs(cellCenterX - checkboxCenterX)).toBeLessThanOrEqual(1);
    expect(Math.abs(cellCenterY - checkboxCenterY)).toBeLessThanOrEqual(1);

    await expect.poll(() => readPcaManualLabels(page)).toEqual([]);

    await clickPcaLabelToggle(page, 'c1');
    await expect.poll(() => readPcaManualLabels(page)).toEqual(['A']);
    await expect.poll(() => readPcaLabelRow(page)).toEqual(['Label point', true, false, false, false]);
    const labelDraw = await page.evaluate(() => window.Components?.pca?.__state?.performance?.draw || null);
    expect(labelDraw?.viewOnly).toBe(true);
    expect(labelDraw?.cacheReused).toBe(true);
    expect(Number(labelDraw?.computeMs || 0)).toBeLessThan(15);

    await clickPcaLabelToggle(page, 'c4');
    await expect.poll(() => readPcaManualLabels(page)).toEqual(['A', 'D']);
    await expect.poll(() => readPcaLabelRow(page)).toEqual(['Label point', true, false, false, true]);
    const defaultLabelSizes = await readPcaLabelFontSizes(page);
    expect(defaultLabelSizes.A).toBeCloseTo(10 * (96 / 72), 6);
    expect(defaultLabelSizes.D).toBeCloseTo(10 * (96 / 72), 6);

    await page.locator("#pcaSvg [data-layer='point-labels'] text", { hasText: /^A$/ }).first().click({ force: true });
    await expect(page.locator('select.font-controls-panel__select').first()).toBeVisible();
    await waitForPcaDrawStable(page);
    const beforeFontA = await readPcaLabelGeometry(page, 'A');
    const beforeFontD = await readPcaLabelGeometry(page, 'D');
    await setPcaPointLabelFontSize(page, 'A', 'labels', 16);
    await expect.poll(() => readPcaLabelFontSizes(page)).toEqual({ A: 21.33, D: 21.33 });
    const afterAllLabelsFontA = await readPcaLabelGeometry(page, 'A');
    const afterAllLabelsFontD = await readPcaLabelGeometry(page, 'D');
    expect(afterAllLabelsFontA.relX).toBeCloseTo(beforeFontA.relX, 6);
    expect(afterAllLabelsFontA.relY).toBeCloseTo(beforeFontA.relY, 6);
    expect(afterAllLabelsFontD.relX).toBeCloseTo(beforeFontD.relX, 6);
    expect(afterAllLabelsFontD.relY).toBeCloseTo(beforeFontD.relY, 6);
    await setPcaPointLabelFontSize(page, 'A', 'selection', 12);
    await expect.poll(() => readPcaLabelFontSizes(page)).toEqual({ A: 16, D: 21.33 });
    const afterIndividualFontA = await readPcaLabelGeometry(page, 'A');
    const afterIndividualFontD = await readPcaLabelGeometry(page, 'D');
    expect(afterIndividualFontA.relX).toBeCloseTo(beforeFontA.relX, 6);
    expect(afterIndividualFontA.relY).toBeCloseTo(beforeFontA.relY, 6);
    expect(afterIndividualFontD.relX).toBeCloseTo(beforeFontD.relX, 6);
    expect(afterIndividualFontD.relY).toBeCloseTo(beforeFontD.relY, 6);
    const savedFontStyles = await page.evaluate(() => window.Components?.pca?.getPayload?.()?.config?.fontStyles || null);
    expect(savedFontStyles?.__labels__?.fontSize).toBe('21.33px');
    const individualLabelKey = Object.keys(savedFontStyles || {}).find(key => key.startsWith('pointLabel:') && key.endsWith('|A'));
    expect(savedFontStyles?.[individualLabelKey]?.fontSize).toBe('16px');

    const beforeA = await readPcaLabelGeometry(page, 'A');
    const beforeD = await readPcaLabelGeometry(page, 'D');
    expect(beforeA?.key).toBeTruthy();
    expect(beforeD?.key).toBeTruthy();
    const aLabel = page.locator("#pcaSvg [data-layer='point-labels'] text", { hasText: /^A$/ }).first();
    const aBox = await aLabel.boundingBox();
    expect(aBox).toBeTruthy();
    await page.mouse.move(aBox.x + aBox.width / 2, aBox.y + aBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(aBox.x + aBox.width / 2 + 55, aBox.y + aBox.height / 2 + 35, { steps: 6 });
    await page.mouse.up();

    const movedA = await readPcaLabelGeometry(page, 'A');
    const unmovedD = await readPcaLabelGeometry(page, 'D');
    expect(Math.hypot(movedA.x - beforeA.x, movedA.y - beforeA.y)).toBeGreaterThan(20);
    expect(unmovedD.x).toBeCloseTo(beforeD.x, 6);
    expect(unmovedD.y).toBeCloseTo(beforeD.y, 6);
    expect(Math.hypot(movedA.leader.x2 - beforeA.leader.x2, movedA.leader.y2 - beforeA.leader.y2)).toBeGreaterThan(10);

    const saved = await page.evaluate(() => {
      const activeId = window.Main?.session?.workspaceState?.activeTabId;
      const session = window.Components?.pca?.__testHooks?.getSession?.(activeId);
      const payload = window.Components?.pca?.getPayload?.();
      return {
        sessionPositions: session?.state?.state?.labelPositions?.pointLabels || {},
        payloadPositions: payload?.config?.labelPositions?.pointLabels || {}
      };
    });
    expect(saved.sessionPositions[movedA.key]).toBeTruthy();
    expect(saved.payloadPositions[movedA.key]).toBeTruthy();

    await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage' });
    const isolation = await page.evaluate(firstId => {
      const activeId = window.Main?.session?.workspaceState?.activeTabId;
      const hooks = window.Components?.pca?.__testHooks;
      return {
        activeId,
        first: hooks?.getSession?.(firstId)?.state?.state?.labelPositions?.pointLabels || {},
        second: hooks?.getSession?.(activeId)?.state?.state?.labelPositions?.pointLabels || {}
      };
    }, firstTabId);
    expect(isolation.activeId).not.toBe(firstTabId);
    expect(isolation.first[movedA.key]).toBeTruthy();
    expect(Object.keys(isolation.second)).toHaveLength(0);
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click({ force: true });
    await expect.poll(() => readPcaManualLabels(page)).toEqual(['A', 'D']);
    const restoredA = await readPcaLabelGeometry(page, 'A');
    expect(restoredA.x).toBeCloseTo(movedA.x, 4);
    expect(restoredA.y).toBeCloseTo(movedA.y, 4);

    await clickPcaLabelToggle(page, 'c3');
    await expect.poll(() => readPcaManualLabels(page)).toEqual(['A', 'C', 'D']);
    const afterAddA = await readPcaLabelGeometry(page, 'A');
    expect(afterAddA.x).toBeCloseTo(movedA.x, 4);
    expect(afterAddA.y).toBeCloseTo(movedA.y, 4);

    await clickPcaLabelToggle(page, 'c1');
    await expect.poll(() => readPcaManualLabels(page)).toEqual(['C', 'D']);
    await expect.poll(() => readPcaLabelRow(page)).toEqual(['Label point', false, false, true, true]);
  });

  test('3D rotation keeps resized point-label leaders attached', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage' }, { first: true });
    await loadPcaFixture(page);
    await clickPcaLabelToggle(page, 'c1');
    await clickPcaLabelToggle(page, 'c4');
    await page.locator('#pcaViewMode').selectOption('3d');
    await page.waitForFunction(() => {
      const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
      return svg?.dataset?.viewMode === '3d'
        && svg.querySelectorAll('[data-point-label-key]').length === 2;
    }, null, { timeout: 30_000 });
    await page.waitForTimeout(500);

    await setPcaPointLabelFontSize(page, 'A', 'labels', 16);
    const before = await readPcaLabelGeometry(page, 'A');
    expect(before?.attachmentGap).toBeLessThan(2);
    const rotationBefore = await page.evaluate(() => ({ ...window.Components?.pca?.getPayload?.()?.config?.rotation }));
    const svgBox = await page.locator('#pcaPage:not([hidden]) #pcaSvg').boundingBox();
    expect(svgBox).toBeTruthy();
    const startX = svgBox.x + svgBox.width * 0.5;
    const startY = svgBox.y + svgBox.height * 0.7;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 90, startY + 45, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await readPcaLabelGeometry(page, 'A');
    const rotationAfter = await page.evaluate(() => ({ ...window.Components?.pca?.getPayload?.()?.config?.rotation }));
    expect(Math.max(
      Math.abs(Number(rotationAfter.x) - Number(rotationBefore.x)),
      Math.abs(Number(rotationAfter.y) - Number(rotationBefore.y)),
      Math.abs(Number(rotationAfter.z) - Number(rotationBefore.z))
    )).toBeGreaterThan(0.1);
    expect(Math.hypot(after.leader.x1 - before.leader.x1, after.leader.y1 - before.leader.y1)).toBeGreaterThan(2);
    expect(after.attachmentGap).toBeLessThan(2);
  });
});
