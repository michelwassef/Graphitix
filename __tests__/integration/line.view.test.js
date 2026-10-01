const { createLineViewTestContext } = require('../../test-support/lineViewTestSuite');

jest.setTimeout(30000);

describe('Line view — legend, 3D, and cache rendering', () => {
  const {
    flushAll,
    pointerEvent,
    findLineLegendSwatch,
    findLineLegendLabel,
    findRenderedLine,
    findRenderedMarker,
    waitForLineLifecycle,
    loadCurrentLineExample,
  } = createLineViewTestContext();

  test('legend labels follow editable header row titles', async () => {
    const hot = await loadCurrentLineExample();
    const originalHeader = Array.isArray(hot?.getData?.()) ? hot.getData()[0].slice() : null;
    expect(originalHeader?.length).toBeGreaterThan(2);

    hot.setDataAtCell([
      [0, 1, 'North renamed'],
      [0, 2, 'South renamed']
    ], 'test-line-header-edit');
    await flushAll(20);

    const headerRow = Array.isArray(hot?.getData?.()) ? hot.getData()[0] : null;
    const expectedHeader = originalHeader.slice();
    expectedHeader[1] = 'North renamed';
    expectedHeader[2] = 'South renamed';
    expect(headerRow?.slice(0, expectedHeader.length)).toEqual(expectedHeader);

    const lineState = window.Components?.line?.__getState?.();
    expect(lineState?.legendItems?.map(item => item.label)).toEqual(
      expectedHeader.slice(1).filter(value => String(value || '').trim())
    );
  });

  test('legend represents each line with a centered marker and exports it', async () => {
    const hot = await loadCurrentLineExample();
    const seriesName = String(hot.getData()?.[0]?.[1] || '').trim();
    expect(seriesName).toBeTruthy();
    const svg = document.getElementById('lineSvg');
    const swatch = findLineLegendSwatch(svg, seriesName);
    const lineSegment = swatch?.querySelector('[data-legend-line="1"]');
    const marker = swatch?.querySelector('[data-legend-marker="1"]');

    expect(swatch).toBeTruthy();
    expect(lineSegment).toBeTruthy();
    expect(marker).toBeTruthy();
    expect(Number(lineSegment.getAttribute('x1'))).toBeLessThan(Number(marker.getAttribute('cx')));
    expect(Number(lineSegment.getAttribute('x2'))).toBeGreaterThan(Number(marker.getAttribute('cx')));
    expect(Number(lineSegment.getAttribute('y1'))).toBe(Number(marker.getAttribute('cy')));
    expect(Number(lineSegment.getAttribute('y2'))).toBe(Number(marker.getAttribute('cy')));
    const renderedLine = findRenderedLine(svg, seriesName);
    const renderedMarker = findRenderedMarker(svg, seriesName);
    expect(lineSegment.getAttribute('stroke')).toBe(renderedLine?.getAttribute('stroke'));
    expect(lineSegment.getAttribute('stroke-width')).toBe(renderedLine?.getAttribute('stroke-width'));
    expect(marker.getAttribute('fill')).toBe(renderedMarker?.getAttribute('fill'));

    const exported = window.Components?.line?.buildExportSvg?.();
    const exportedSwatch = findLineLegendSwatch(exported, seriesName);
    expect(exportedSwatch?.querySelector('[data-legend-line="1"]')).toBeTruthy();
    expect(exportedSwatch?.querySelector('[data-legend-marker="1"]')).toBeTruthy();
  });

  test('3D legend uses the shared line and centered-marker representation', async () => {
    const tableFormat = document.getElementById('lineTableFormat');
    const viewMode = document.getElementById('lineViewMode');
    expect(tableFormat).toBeTruthy();
    expect(viewMode).toBeTruthy();

    tableFormat.value = '3d';
    tableFormat.dispatchEvent(new Event('change', { bubbles: true }));
    viewMode.value = '3d';
    viewMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);

    const exampleDrawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    document.getElementById('lineLoadExample').click();
    await waitForLineLifecycle(exampleDrawCursor, { reason: 'line-3d-example-load', timeoutMs: 8000 });
    await flushAll(4);

    const svg = document.querySelector('#linePlot svg[data-view-mode="3d"]');
    const swatch = svg?.querySelector('[data-legend-swatch="1"]');
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    const ownerSession = window.Components?.line?.__testHooks?.getSessionForTab?.(activeTabId) || null;
    expect(svg).toBeTruthy();
    expect(ownerSession).toBeTruthy();
    expect(svg?.dataset?.rotationControlsAttached).toBe('true');
    expect(svg?.__plot3dRotationControl).toBeTruthy();
    expect(svg?.__plot3dRotationControl?.ownerSession).toBe(ownerSession);
    expect(svg?.__plot3dRotationControl?.componentKey).toBe('line');
    expect(ownerSession?.refs?.rotationSvg).toBe(svg);
    expect(typeof ownerSession?.refs?.rotationRenderer).toBe('function');
    const dynamicLayer = svg.querySelector('[data-layer="line-3d-rotation-dynamic"]');
    const titleLayer = svg.querySelector('[data-layer="line-3d-title"]');
    const legendLayer = svg.querySelector('[data-layer="line-3d-legend"]');
    const linePath = dynamicLayer?.querySelector('[data-line-style-role="line"]');
    const beforePath = linePath?.getAttribute('d') || '';
    expect(dynamicLayer).toBeTruthy();
    expect(titleLayer).toBeTruthy();
    expect(legendLayer).toBeTruthy();
    if(typeof svg.setPointerCapture !== 'function'){
      svg.setPointerCapture = jest.fn();
    }
    if(typeof svg.releasePointerCapture !== 'function'){
      svg.releasePointerCapture = jest.fn();
    }
    svg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 91, clientX: 20, clientY: 20 }));
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 91, clientX: 55, clientY: 30 }));
    expect(ownerSession.state.viewState.rotationPending).toBe(true);
    expect(ownerSession.state.viewState.rotationPendingLogged).toBe(false);
    await flushAll(1);
    expect(ownerSession.state.viewState.rotationPending).toBe(false);
    expect(ownerSession.state.viewState.rotationPendingLogged).toBe(false);
    // End the transaction before assertions so a failing expectation cannot leak
    // an active shared gesture into a later test.
    svg.dispatchEvent(pointerEvent('pointerup', { pointerId: 91, clientX: 55, clientY: 30 }));
    expect(svg.querySelector('[data-layer="line-3d-rotation-dynamic"]')).toBe(dynamicLayer);
    expect(svg.querySelector('[data-layer="line-3d-title"]')).toBe(titleLayer);
    expect(svg.querySelector('[data-layer="line-3d-legend"]')).toBe(legendLayer);
    expect(linePath?.getAttribute('d') || '').not.toBe(beforePath);
    expect(swatch?.querySelector('[data-legend-line="1"]')).toBeTruthy();
    expect(swatch?.querySelector('[data-legend-marker="1"]')).toBeTruthy();
  });

  test('render-cache restore keeps 3D rotation controls bound to the canonical Line tab session', async () => {
    const tableFormat = document.getElementById('lineTableFormat');
    const viewMode = document.getElementById('lineViewMode');
    expect(tableFormat).toBeTruthy();
    expect(viewMode).toBeTruthy();

    tableFormat.value = '3d';
    tableFormat.dispatchEvent(new Event('change', { bubbles: true }));
    viewMode.value = '3d';
    viewMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);

    const exampleDrawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    document.getElementById('lineLoadExample').click();
    await waitForLineLifecycle(exampleDrawCursor, { reason: 'line-3d-example-load', timeoutMs: 8000 });
    await flushAll(4);

    const lineComponent = window.Components?.line;
    const tab = window.Main?.session?.getActiveTab?.() || null;
    const ownerSession = lineComponent?.__testHooks?.getSessionForTab?.(tab?.id) || null;
    const originalSvg = document.querySelector('#linePlot svg[data-view-mode="3d"]');
    expect(tab).toBeTruthy();
    expect(ownerSession?.tabId).toBe(tab.id);
    expect(originalSvg?.__plot3dRotationControl?.ownerSession).toBe(ownerSession);
    const tabHadRefs = Object.prototype.hasOwnProperty.call(tab, 'refs');

    const cache = lineComponent.captureRenderCache?.({
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-3d-owner-cache-capture'
    });
    expect(cache).toBeTruthy();
    expect(document.querySelector('#linePlot svg')).toBe(originalSvg);

    const restoreMeta = {
      tab,
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-3d-owner-cache-restore'
    };
    expect(lineComponent.restoreRenderCache?.(cache, restoreMeta)).toBe(true);
    lineComponent.rehydrateGraphInteractions?.(restoreMeta);

    const restoredSvg = document.querySelector('#linePlot svg[data-view-mode="3d"]');
    expect(restoredSvg).not.toBe(originalSvg);
    expect(restoredSvg?.__plot3dRotationControl?.ownerSession).toBe(ownerSession);
    expect(restoredSvg?.__plot3dRotationControl?.ownerSession?.tabId).toBe(tab.id);
    expect(Object.prototype.hasOwnProperty.call(tab, 'refs')).toBe(tabHadRefs);

    if(typeof restoredSvg.setPointerCapture !== 'function'){
      restoredSvg.setPointerCapture = jest.fn();
    }
    if(typeof restoredSvg.releasePointerCapture !== 'function'){
      restoredSvg.releasePointerCapture = jest.fn();
    }
    restoredSvg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 92, clientX: 20, clientY: 20 }));
    restoredSvg.dispatchEvent(pointerEvent('pointermove', { pointerId: 92, clientX: 55, clientY: 30 }));
    expect(ownerSession.state.viewState.rotationPending).toBe(true);
    await flushAll(1);
    expect(ownerSession.state.viewState.rotationPending).toBe(false);
    restoredSvg.dispatchEvent(pointerEvent('pointerup', { pointerId: 92, clientX: 55, clientY: 30 }));
  });

  test('cancelCurrentDraw clears transient 3D rotation frame state', () => {
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    const ownerSession = window.Components?.line?.__testHooks?.getSessionForTab?.(activeTabId) || null;
    expect(ownerSession).toBeTruthy();

    ownerSession.state.viewState.rotationPending = true;
    ownerSession.state.viewState.rotationPendingLogged = true;
    window.Components.line.cancelCurrentDraw({ tabId: activeTabId, reason: 'line-rotation-test-cancel' });

    expect(ownerSession.state.viewState.rotationPending).toBe(false);
    expect(ownerSession.state.viewState.rotationPendingLogged).toBe(false);
  });

  test('legend label clicks do not hide rendered line series', async () => {
    const hot = await loadCurrentLineExample();
    const seriesName = String(hot.getData()?.[0]?.[1] || '').trim();
    const svg = document.getElementById('lineSvg');
    const legendLabel = findLineLegendLabel(svg, seriesName);
    const seriesPath = findRenderedLine(svg, seriesName);

    expect(legendLabel).toBeTruthy();
    expect(seriesPath).toBeTruthy();
    expect(seriesPath.style.display).not.toBe('none');

    legendLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    expect(seriesPath.style.display).not.toBe('none');
  });

});
