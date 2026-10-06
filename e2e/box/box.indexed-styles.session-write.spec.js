const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');

test('Box indexed style controls write to the owning session before capture', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  const result = await page.evaluate(() => {
    const box = window.Components?.box;
    const activeTab = window.Main?.session?.getActiveTab?.();
    const hooks = box?.__testHooks;
    const owner = activeTab?.id ? hooks?.getSession?.(activeTab.id) : null;
    if (!box || !owner || !hooks?.persistTraceShapeStyle || !hooks?.persistTracePointStyle || !hooks?.persistBoxSummaryStyle || !hooks?.captureSessionState) {
      throw new Error('Box style writers or active owner session are unavailable.');
    }

    hooks.persistTraceShapeStyle(2, { fill: '#123456' });
    hooks.persistTracePointStyle(3, { fill: '#234567', stroke: '#345678' });
    hooks.persistBoxSummaryStyle(4, { color: '#456789' });

    const state = box.__getState();
    owner.state.visual.fillColors = ['#123456'];
    owner.state.visual.borderColors = ['#654321'];
    state.fillColors = ['#abcdef'];
    state.borderColors = ['#fedcba'];
    state.traceShapeStyles = { 2: { fill: '#abcdef' } };
    state.pointStyles = { 3: { fill: '#abcdef' } };
    state.summaryStyles = { 4: { color: '#abcdef' } };
    hooks.captureSessionState(owner, { tabId: owner.tabId, reason: 'indexed-style-canonical-capture' }, { readActiveGlobals: true });
    const payload = box.getPayload();
    const foreignRemapAccepted = hooks.remapBoxSingleDatasetStylesForColumnInsert({
      __boxTabId: 'box-indexed-styles-missing-owner',
      countCols: () => 6
    }, 1, 1, 'foreign-owner-contract');
    box.loadFromPayload(payload, {
      tabId: owner.tabId,
      reason: 'indexed-style-payload-roundtrip',
      skipDraw: true,
      skipInitialDraw: true,
      suppressAutoDraw: true
    });

    return {
      traceShapeStyles: owner.state.styles?.traceShapeStyles,
      pointStyles: owner.state.styles?.pointStyles,
      summaryStyles: owner.state.styles?.summaryStyles,
      fillColors: owner.state.visual?.fillColors,
      borderColors: owner.state.visual?.borderColors,
      payloadStyles: payload?.config?.shapeStyles,
      payloadColors: payload?.config?.colors,
      foreignRemapAccepted,
      payloadDirty: !!activeTab.payloadDirty
    };
  });

  expect(result.traceShapeStyles).toMatchObject({ 2: { fill: '#123456' } });
  expect(result.pointStyles).toMatchObject({ 3: { fill: '#234567', stroke: '#345678' } });
  expect(result.summaryStyles).toMatchObject({ 4: { color: '#456789' } });
  expect(result.fillColors).toEqual(['#123456']);
  expect(result.borderColors).toEqual(['#654321']);
  expect(result.payloadStyles).toMatchObject({ 2: { fill: '#123456' } });
  expect(result.payloadColors).toEqual(['#123456']);
  expect(result.foreignRemapAccepted).toBe(false);
  expect(result.payloadDirty).toBe(true);
});

test('Box indexed styles stay isolated across same-type tab activation', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const readActiveTabId = () => page.evaluate(() => String(window.Main?.session?.getActiveTab?.()?.id || ''));
  const writeActiveStyle = fill => page.evaluate(value => {
    const box = window.Components?.box;
    const tab = window.Main?.session?.getActiveTab?.();
    const owner = tab?.id ? box?.__testHooks?.getSession?.(tab.id) : null;
    if (!owner || !box?.__testHooks?.persistTraceShapeStyle) {
      throw new Error('Active Box owner or style writer is unavailable.');
    }
    box.__testHooks.persistTraceShapeStyle(0, { fill: value });
    return owner.state.styles?.traceShapeStyles?.[0]?.fill || null;
  }, fill);

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  const tabA = await readActiveTabId();
  expect(await writeActiveStyle('#aa0000')).toBe('#aa0000');
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: false });
  const tabB = await readActiveTabId();
  expect(tabB).not.toBe(tabA);
  const ownerA = await page.evaluate(id => window.Components?.box?.__testHooks?.getSession?.(id)?.state?.styles?.traceShapeStyles?.[0]?.fill || null, tabA);
  expect(ownerA).toBe('#aa0000');

  expect(await writeActiveStyle('#00bb00')).toBe('#00bb00');
  const ownersWhileBActive = await page.evaluate(ids => {
    const getStyle = id => window.Components?.box?.__testHooks?.getSession?.(id)?.state?.styles?.traceShapeStyles?.[0]?.fill || null;
    return ids.map(getStyle);
  }, [tabA, tabB]);
  expect(ownersWhileBActive).toEqual(['#aa0000', '#00bb00']);

  await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'box-indexed-style-isolation-revisit' }), tabA);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabA, { timeout: 20_000 });
  const projectedA = await page.evaluate(() => window.Components?.box?.__getState?.()?.traceShapeStyles?.[0]?.fill || null);
  expect(projectedA).toBe('#aa0000');
  expect(await writeActiveStyle('#aa3333')).toBe('#aa3333');

  const finalOwners = await page.evaluate(ids => {
    const getStyle = id => window.Components?.box?.__testHooks?.getSession?.(id)?.state?.styles?.traceShapeStyles?.[0]?.fill || null;
    return ids.map(getStyle);
  }, [tabA, tabB]);
  expect(finalOwners).toEqual(['#aa3333', '#00bb00']);
});
