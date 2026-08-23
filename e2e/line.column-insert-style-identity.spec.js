const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForLineIdle(page) {
  await page.waitForFunction(() => {
    const line = window.Components?.line;
    return !!document.querySelector('#linePlot #lineSvg')
      && (!line?.isIdleForSnapshot || line.isIdleForSnapshot());
  }, null, { timeout: 20_000 });
}

async function alterLineColumnsAndWait(page, action, index, amount, source) {
  await page.evaluate(async ({ action, index, amount, source }) => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.getHot?.();
    const lifecycle = window.Shared?.componentLifecycle;
    const tabId = window.Main?.session?.getActiveTab?.()?.id || null;
    if(!hot || !lifecycle?.getLifecycleEventCursor || !lifecycle?.waitForLifecycleEvent){
      throw new Error('Line table/lifecycle unavailable');
    }
    const cursor = lifecycle.getLifecycleEventCursor();
    hot.alter(action, index, amount, source);
    await lifecycle.waitForLifecycleEvent({
      componentKey: 'line',
      tabId,
      actions: ['draw-settled'],
      afterCursor: cursor,
      timeoutMs: 20_000
    });
  }, { action, index, amount, source });
}

async function captureLineSeriesIdentity(page) {
  return page.evaluate(() => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.getHot?.();
    const session = line?.__testHooks?.getActiveSession?.();
    if(!hot || !session){
      throw new Error('Line table/session unavailable');
    }

    const header = hot.getDataAtRow?.(0)?.slice() || [];
    const labels = header.slice(1)
      .map(value => String(value ?? '').trim())
      .filter(Boolean);
    const colors = session.state?.labels?.colors || {};
    const shapes = Array.isArray(session.state?.grouped?.shapes)
      ? session.state.grouped.shapes
      : [];
    const root = document.querySelector('#linePlot #lineSvg');

    const inferMarkerShape = marker => {
      const tag = String(marker?.tagName || '').toLowerCase();
      if(tag === 'circle'){
        return 'circle';
      }
      if(tag === 'rect'){
        return 'square';
      }
      if(tag !== 'path'){
        return null;
      }
      const lineCommands = (String(marker.getAttribute('d') || '').match(/\bL\b/g) || []).length;
      if(lineCommands === 2){
        return 'triangle';
      }
      if(lineCommands === 3){
        return 'diamond';
      }
      return lineCommands > 3 ? 'cross' : null;
    };

    const rendered = {};
    labels.forEach(label => {
      const seriesIndex = header.slice(1).findIndex(value => String(value ?? '').trim() === label);
      const markerGroup = Array.from(root?.querySelectorAll?.('g[data-line-style-role="markers"]') || [])
        .find(node => String(node.dataset?.series || '').trim() === label);
      const marker = markerGroup?.querySelector?.('circle, rect, path') || null;
      const linePath = Array.from(root?.querySelectorAll?.('path[data-line-style-role="line"]') || [])
        .find(node => String(node.dataset?.series || '').trim() === label);
      rendered[label] = {
        seriesIndex,
        stateColor: colors[label] || null,
        stateShape: seriesIndex >= 0 ? shapes[seriesIndex] || null : null,
        markerShape: inferMarkerShape(marker),
        markerFill: marker?.getAttribute?.('fill') || null,
        lineStroke: linePath?.getAttribute?.('stroke') || null
      };
    });

    return {
      header,
      labels,
      shapes: shapes.slice(),
      rendered
    };
  });
}

test('Line keeps colors and marker symbols attached to existing series across column insertion and its undo', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });

  await clickExampleButtonIfPresent(page, 'lineLoadExample');
  await waitForLineIdle(page);

  const before = await captureLineSeriesIdentity(page);
  expect(before.labels.length).toBeGreaterThanOrEqual(4);
  const trackedLabels = before.labels.slice(0, 4);
  trackedLabels.forEach(label => {
    expect(before.rendered[label]?.stateColor).toBeTruthy();
    expect(before.rendered[label]?.stateShape).toBeTruthy();
    expect(before.rendered[label]?.markerShape).toBe(before.rendered[label]?.stateShape);
    expect(before.rendered[label]?.lineStroke).toBeTruthy();
  });

  await alterLineColumnsAndWait(page, 'insert_col_left', 3, 1, 'header-menu');

  await expect.poll(async () => page.evaluate(() => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.getHot?.();
    return hot?.getDataAtRow?.(0)?.slice(0, 6) || [];
  }), {
    timeout: 15_000,
    intervals: [100, 200, 400]
  }).toEqual([
    before.header[0],
    before.header[1],
    before.header[2],
    '',
    before.header[3],
    before.header[4]
  ]);
  await waitForLineIdle(page);

  const inserted = await captureLineSeriesIdentity(page);
  trackedLabels.forEach(label => {
    expect(inserted.rendered[label]?.stateColor).toBe(before.rendered[label]?.stateColor);
    expect(inserted.rendered[label]?.stateShape).toBe(before.rendered[label]?.stateShape);
    expect(inserted.rendered[label]?.markerShape).toBe(before.rendered[label]?.markerShape);
    expect(inserted.rendered[label]?.markerFill).toBe(before.rendered[label]?.markerFill);
    expect(inserted.rendered[label]?.lineStroke).toBe(before.rendered[label]?.lineStroke);
  });
  expect(inserted.rendered[trackedLabels[2]]?.seriesIndex).toBe(before.rendered[trackedLabels[2]]?.seriesIndex + 1);
  expect(inserted.rendered[trackedLabels[3]]?.seriesIndex).toBe(before.rendered[trackedLabels[3]]?.seriesIndex + 1);

  await alterLineColumnsAndWait(page, 'remove_col', 3, 1, 'undo:insert-cols');

  await expect.poll(async () => page.evaluate(() => {
    const line = window.Components?.line;
    const hot = line?.__ensureHotForActiveTab?.() || line?.getHot?.();
    return hot?.getDataAtRow?.(0)?.slice(0, 5) || [];
  }), {
    timeout: 15_000,
    intervals: [100, 200, 400]
  }).toEqual(before.header.slice(0, 5));
  await waitForLineIdle(page);

  const restored = await captureLineSeriesIdentity(page);
  trackedLabels.forEach(label => {
    expect(restored.rendered[label]).toEqual(before.rendered[label]);
  });
  expect(restored.shapes).toEqual(before.shapes);
  expect(issues.critical).toEqual([]);
});
