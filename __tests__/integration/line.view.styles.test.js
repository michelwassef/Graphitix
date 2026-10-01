const { createLineViewTestContext } = require('../../test-support/lineViewTestSuite');

jest.setTimeout(30000);

describe('Line view — style and table edits', () => {
  const {
    flushAll,
    findRenderedLine,
    findRenderedMarker,
    normalizeHeaderCells,
    waitForLineLifecycle,
    loadCurrentLineExample,
    getLatestLineDrawMeta,
  } = createLineViewTestContext();

  test('line marker symbol controls update rendered series style', async () => {
    const hot = await loadCurrentLineExample();
    const seriesName = String(hot.getData()?.[0]?.[1] || '').trim();
    const svg = document.getElementById('lineSvg');
    const primaryMarker = findRenderedMarker(svg, seriesName);
    expect(primaryMarker).toBeTruthy();
    expect(primaryMarker.getAttribute('fill')?.toLowerCase()).not.toBe('#ffaa00');
    const initialRadius = Number(primaryMarker.getAttribute('r')) || 0;

    primaryMarker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    const fillInput = document.querySelector('.line-point-controls .shared-shape-color-input');
    expect(fillInput).toBeTruthy();
    fillInput.value = '#ffaa00';
    fillInput.dispatchEvent(new Event('input', { bubbles: true }));
    fillInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const updatedPrimaryMarker = findRenderedMarker(document.getElementById('lineSvg'), seriesName);
    expect(updatedPrimaryMarker?.getAttribute('fill')?.toLowerCase()).toBe('#ffaa00');

    const lineColorInput = Array.from(document.querySelectorAll('.font-toolbar-host--line-dual .additional-line-controls-panel__color-input')).pop();
    expect(lineColorInput).toBeTruthy();
    lineColorInput.value = '#00aaee';
    lineColorInput.dispatchEvent(new Event('input', { bubbles: true }));
    lineColorInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const updatedPrimaryLine = findRenderedLine(document.getElementById('lineSvg'), seriesName);
    expect(updatedPrimaryLine?.getAttribute('stroke')?.toLowerCase()).toBe('#00aaee');

    const fillSwatch = document.querySelector('.line-point-controls .shared-shape-color-swatch');
    expect(fillSwatch).toBeTruthy();
    fillSwatch.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));
    await flushAll(30);

    const resizedPrimaryMarker = findRenderedMarker(document.getElementById('lineSvg'), seriesName);
    expect(Number(resizedPrimaryMarker?.getAttribute('r'))).toBeGreaterThan(initialRadius);

    fillSwatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushAll(5);
    const squareInput = document.querySelector('.shared-color-picker__shape-input[value="square"]');
    expect(squareInput).toBeTruthy();
    squareInput.checked = true;
    squareInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const reshapedPrimaryMarker = Array.from(document.querySelectorAll('#lineSvg rect'))
      .find(node => node.__linePointData?.seriesName === seriesName);
    expect(reshapedPrimaryMarker).toBeTruthy();
  });

  test('single-series column insertion and undo keep existing colors and marker shapes attached to their datasets', async () => {
    const hot = await loadCurrentLineExample();
    const lineComponent = window.Components?.line;
    const session = lineComponent?.__testHooks?.getActiveSession?.();
    expect(session).toBeTruthy();

    const beforeHeader = normalizeHeaderCells(hot.getDataAtRow(0).slice());
    const namedLabels = beforeHeader.slice(1).filter(value => String(value || '').trim()).map(value => String(value).trim());
    expect(namedLabels.length).toBeGreaterThanOrEqual(4);
    const beforeColors = Object.fromEntries(namedLabels.map(label => [label, session.state.labels.colors[label]]));
    const beforeShapes = session.state.grouped.shapes.slice();

    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    hot.alter('insert_col_left', 3, 1, 'header-menu');
    await waitForLineLifecycle(drawCursor, { timeoutMs: 8000 });
    await flushAll(4);

    const insertedSession = lineComponent.__testHooks.getActiveSession();
    const insertedHeader = hot.getDataAtRow(0).slice();
    expect(insertedHeader[3]).toBe('');
    expect(insertedHeader[4]).toBe(beforeHeader[3]);
    expect(insertedHeader[5]).toBe(beforeHeader[4]);
    namedLabels.forEach(label => {
      expect(insertedSession.state.labels.colors[label]).toBe(beforeColors[label]);
    });
    expect(insertedSession.state.grouped.shapes[0]).toBe(beforeShapes[0]);
    expect(insertedSession.state.grouped.shapes[1]).toBe(beforeShapes[1]);
    expect(insertedSession.state.grouped.shapes[3]).toBe(beforeShapes[2]);
    expect(insertedSession.state.grouped.shapes[4]).toBe(beforeShapes[3]);

    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    hot.alter('remove_col', 3, 1, 'undo:insert-cols');
    await waitForLineLifecycle(drawCursor, { timeoutMs: 8000 });
    await flushAll(4);

    const restoredSession = lineComponent.__testHooks.getActiveSession();
    expect(normalizeHeaderCells(hot.getDataAtRow(0).slice(0, beforeHeader.length))).toEqual(beforeHeader);
    namedLabels.forEach(label => {
      expect(restoredSession.state.labels.colors[label]).toBe(beforeColors[label]);
    });
    expect(restoredSession.state.grouped.shapes).toEqual(beforeShapes);
  });

  test('single-series column deletion undo restores the removed dataset color and marker shape', async () => {
    const hot = await loadCurrentLineExample();
    const lineComponent = window.Components?.line;
    const session = lineComponent?.__testHooks?.getActiveSession?.();
    expect(session).toBeTruthy();

    const beforeHeader = normalizeHeaderCells(hot.getDataAtRow(0).slice());
    const deletedColumn = hot.getData().map(row => row?.[3]);
    const deletedLabel = String(deletedColumn[0] || '').trim();
    expect(deletedLabel).toBeTruthy();
    const beforeColor = session.state.labels.colors[deletedLabel];
    const beforeShape = session.state.grouped.shapes[2];
    expect(beforeColor).toBeTruthy();
    expect(beforeShape).toBeTruthy();

    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    hot.alter('remove_col', 3, 1, 'header-menu');
    await waitForLineLifecycle(drawCursor, { timeoutMs: 8000 });
    await flushAll(4);

    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    hot.alter('insert_col_left', 3, 1, 'undo:delete-cols');
    hot.setDataAtCell(
      deletedColumn.map((value, rowIndex) => [rowIndex, 3, value]),
      'test-line-delete-undo-restore'
    );
    await waitForLineLifecycle(drawCursor, { timeoutMs: 8000 });
    await flushAll(4);

    const restoredSession = lineComponent.__testHooks.getActiveSession();
    expect(normalizeHeaderCells(hot.getDataAtRow(0).slice(0, beforeHeader.length))).toEqual(beforeHeader);
    expect(restoredSession.state.labels.colors[deletedLabel]).toBe(beforeColor);
    expect(restoredSession.state.grouped.shapes[2]).toBe(beforeShape);
  });

  test('line toolbar global line color updates every rendered line', async () => {
    const hot = await loadCurrentLineExample();
    const seriesName = String(hot.getData()?.[0]?.[1] || '').trim();
    const primaryMarker = findRenderedMarker(document.getElementById('lineSvg'), seriesName);
    expect(primaryMarker).toBeTruthy();

    primaryMarker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    document.querySelectorAll('.font-toolbar-host--line-dual select').forEach(select => {
      if(!Array.from(select.options || []).some(option => option.value === 'global')){
        return;
      }
      select.value = 'global';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushAll(5);
    expect(Array.from(document.querySelectorAll('.font-toolbar-host--line-dual select'))
      .filter(select => Array.from(select.options || []).some(option => option.value === 'global'))
      .map(select => select.value)).toEqual(['global', 'global']);

    const lineColorInput = Array.from(document.querySelectorAll('.font-toolbar-host--line-dual .additional-line-controls-panel__color-input')).pop();
    expect(lineColorInput).toBeTruthy();
    lineColorInput.value = '#cc00aa';
    expect(lineColorInput.value).toBe('#cc00aa');
    lineColorInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(lineColorInput.value).toBe('#cc00aa');
    lineColorInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const renderedLines = Array.from(document.querySelectorAll('#lineSvg path[data-render-mode="line"]'));
    expect(renderedLines.length).toBeGreaterThan(1);
    expect(renderedLines.map(node => node.getAttribute('stroke')?.toLowerCase())).toEqual(
      renderedLines.map(() => '#cc00aa')
    );
  });

  test('line draw requests carry explicit impact for style, layout, and data changes', async () => {
    const lineComponent = window.Components?.line;
    const hooks = lineComponent?.__testHooks;
    expect(typeof hooks?.resolveRenderImpact).toBe('function');
    expect(hooks.resolveRenderImpact({ viewOnly: true })).toBe('layout');
    expect(hooks.resolveRenderImpact({ invalidate: 'style' })).toBe('paint');
    expect(hooks.resolveRenderImpact({ invalidate: 'data' })).toBe('analysis');
    expect(hooks.resolveRenderImpact({ structural: true })).toBe('structural');

    await loadCurrentLineExample();
    expect(getLatestLineDrawMeta()?.renderImpact).toBe('structural');

    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    const border = document.getElementById('lineBorder');
    expect(border).toBeTruthy();
    border.dispatchEvent(new window.Event('input', { bubbles: true }));
    await waitForLineLifecycle(drawCursor, { reason: 'line-border-change' });
    expect(getLatestLineDrawMeta()?.renderImpact).toBe('paint');

    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    const fontSize = document.getElementById('lineFontSize');
    expect(fontSize).toBeTruthy();
    fontSize.value = String(Number(fontSize.value || 12) + 1);
    fontSize.dispatchEvent(new window.Event('input', { bubbles: true }));
    await waitForLineLifecycle(drawCursor, { reason: 'line-font-size-change' });
    expect(getLatestLineDrawMeta()?.renderImpact).toBe('layout');

    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    const hot = lineComponent?.getHot?.();
    expect(hot).toBeTruthy();
    const currentValue = hot.getDataAtCell?.(1, 1);
    hot.setDataAtCell(1, 1, String(Number(currentValue) + 1), 'line-impact-data-edit');
    await waitForLineLifecycle(drawCursor, { timeoutMs: 8000 });
    expect(getLatestLineDrawMeta()?.renderImpact).toBe('analysis');
  });

});
