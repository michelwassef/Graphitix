const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer, parseWorkspaceArchive } = require('../helpers/archiveDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const ALIGNMENT_CASES = {
  venn: { selects: { vennPlotType: 'upset' }, verifyAxis: 'yTitle' },
  box: { verifyAxis: 'yTitle' },
  scatter: { verifyAxis: 'yTitle' },
  pca: { verifyAxis: 'yTitle' },
  line: { verifyAxis: 'yTitle' },
  heatmap: {},
  surface: { verifyAxis: 'yTitle' },
  roc: { verifyAxis: 'yTitle' },
  survival: { verifyAxis: 'yTitle' },
  hist: { verifyAxis: 'yTitle' },
  pie: { selects: { pieChartType: 'stacked' }, verifyAxis: 'yTitle' }
};

function titleTarget(page, pageId, role){
  return page.locator(`#${pageId}:not([hidden]) .svgbox svg text[data-font-role="${role}"]`).first();
}

async function alignTitle(page, pageId, role, alignment, options = {}){
  const target = titleTarget(page, pageId, role);
  await expect(target, `${pageId}/${role} title`).toBeVisible();
  const initialText = await target.evaluate(node => node.dataset.titleBlockText || node.textContent || '');
  const nextText = `${initialText}\nshort`;
  await target.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  const toolbarFieldOrder = await page.evaluate(() => {
    const color = document.querySelector('.font-controls-panel__field--color');
    const alignment = document.querySelector('.font-controls-panel__field--alignment');
    if(!color || !alignment || color.parentElement !== alignment.parentElement) return null;
    const fields = Array.from(color.parentElement.children);
    return {
      color: fields.indexOf(color),
      alignment: fields.indexOf(alignment),
      colorRight: color.getBoundingClientRect().right,
      alignmentLeft: alignment.getBoundingClientRect().left,
      colorControl: color.querySelector('.font-controls-panel__color-input')
        ?.getBoundingClientRect().toJSON() || null,
      scopeControl: document.querySelector('.font-controls-panel__field--scope .font-controls-panel__select')
        ?.getBoundingClientRect().toJSON() || null,
      fontControl: document.querySelector('.font-controls-panel__field--font .font-controls-panel__combo')
        ?.getBoundingClientRect().toJSON() || null,
      sizeControl: document.querySelector('.font-controls-panel__field--size .font-controls-panel__combo')
        ?.getBoundingClientRect().toJSON() || null,
      comboContents: Array.from(color.parentElement.querySelectorAll('.font-controls-panel__combo')).map(combo => {
        const bounds = combo.getBoundingClientRect();
        const border = getComputedStyle(combo);
        return {
          left: bounds.left + parseFloat(border.borderLeftWidth),
          right: bounds.right - parseFloat(border.borderRightWidth),
          children: Array.from(combo.querySelectorAll('.font-controls-panel__combo-row, .font-controls-panel__input, .font-controls-panel__combo-toggle'))
            .map(child => child.getBoundingClientRect().toJSON())
        };
      }),
      squareButtons: Array.from(color.parentElement.querySelectorAll('.font-controls-panel__format-button'))
        .map(button => button.getBoundingClientRect().toJSON()),
      alignmentButtons: Array.from(alignment.querySelectorAll('.font-controls-panel__alignment-button'))
        .map(button => button.getBoundingClientRect().toJSON())
    };
  });
  expect(toolbarFieldOrder, 'alignment controls share the Font toolbar row with Color').not.toBeNull();
  expect(toolbarFieldOrder.alignment).toBe(toolbarFieldOrder.color + 1);
  expect(toolbarFieldOrder.alignmentLeft).toBeGreaterThanOrEqual(toolbarFieldOrder.colorRight - 0.5);
  expect(toolbarFieldOrder.colorControl, 'Font color selector is visible beside the alignment controls').not.toBeNull();
  expect(toolbarFieldOrder.scopeControl, 'Font scope dropdown is visible beside the alignment controls').not.toBeNull();
  expect(toolbarFieldOrder.fontControl).not.toBeNull();
  expect(toolbarFieldOrder.sizeControl).not.toBeNull();
  expect(toolbarFieldOrder.fontControl.height, 'preserve the Font dropdown outer height').toBe(24);
  for(const combo of toolbarFieldOrder.comboContents){
    for(const child of combo.children){
      expect(child.left, 'combo content stays inside its left border').toBeGreaterThanOrEqual(combo.left - 0.1);
      expect(child.right, 'combo content stays inside its right border').toBeLessThanOrEqual(combo.right + 0.1);
    }
  }
  const controls = [toolbarFieldOrder.scopeControl, toolbarFieldOrder.sizeControl,
    toolbarFieldOrder.colorControl, ...toolbarFieldOrder.squareButtons];
  for(const control of controls){
    expect(Math.abs(control.height - toolbarFieldOrder.fontControl.height), 'all Font toolbar controls match Font height').toBeLessThanOrEqual(0.5);
    expect(Math.abs(control.top - toolbarFieldOrder.fontControl.top), 'all Font toolbar controls share the same top edge').toBeLessThanOrEqual(0.5);
  }
  for(const square of [toolbarFieldOrder.colorControl, ...toolbarFieldOrder.squareButtons]){
    expect(Math.abs(square.width - square.height), 'square toolbar buttons remain square').toBeLessThanOrEqual(0.5);
  }
  for(const button of toolbarFieldOrder.alignmentButtons){
    expect(Math.abs(button.height - toolbarFieldOrder.scopeControl.height), 'alignment button matches dropdown height').toBeLessThanOrEqual(0.5);
    expect(Math.abs((button.top + button.bottom) / 2 - (toolbarFieldOrder.scopeControl.top + toolbarFieldOrder.scopeControl.bottom) / 2),
      'alignment button is vertically centered with dropdown').toBeLessThanOrEqual(0.5);
    expect(Math.abs(button.width - toolbarFieldOrder.colorControl.width), 'color selector matches alignment button width').toBeLessThanOrEqual(0.5);
    expect(Math.abs(button.height - toolbarFieldOrder.colorControl.height), 'color selector matches alignment button height').toBeLessThanOrEqual(0.5);
    expect(Math.abs(button.top - toolbarFieldOrder.colorControl.top), 'color selector aligns with alignment buttons').toBeLessThanOrEqual(0.5);
  }
  await editor.fill(nextText);

  if(options.cycleAlignments){
    for(const candidate of ['left', 'center', 'right']){
      const button = page.getByRole('button', { name: `Align ${candidate}` });
      await expect(button).toBeEnabled();
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      for(const other of ['left', 'center', 'right'].filter(value => value !== candidate)){
        await expect(page.getByRole('button', { name: `Align ${other}` }))
          .toHaveAttribute('aria-pressed', 'false');
      }
      await expect(editor).toBeVisible();
    }
  }else{
    const button = page.getByRole('button', { name: `Align ${alignment}` });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(editor).toBeVisible();
  }

  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await waitForComponentOwnerReady(page, pageId.replace('Page', '').toLowerCase(), {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 45_000
  });

  const result = await target.evaluate(node => ({
    text: node.dataset.titleBlockText || node.textContent || '',
    alignment: node.dataset.titleTextAlign || null,
    anchors: Array.from(node.querySelectorAll('tspan[data-title-line="1"]'))
      .map(row => row.getAttribute('text-anchor'))
  }));
  expect(result.text).toBe(nextText);
  expect(result.alignment).toBe(alignment);
  expect(result.anchors).toEqual(Array(2).fill(alignment === 'left' ? 'start' : (alignment === 'right' ? 'end' : 'middle')));
  return result.text;
}

async function setTitleAlignment(page, target, alignment){
  await target.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  const button = page.getByRole('button', { name: `Align ${alignment}` });
  await expect(button).toBeEnabled();
  await button.click();
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
}

async function readPayloadAlignment(page, componentType, role){
  const fontKey = await page.evaluate(({ pageId, titleRole }) => {
    const node = document.querySelector(`#${pageId}:not([hidden]) .svgbox svg text[data-font-role="${titleRole}"]`);
    return node?.dataset?.fontKey || titleRole;
  }, { pageId: `${componentType}Page`, titleRole: role });
  return page.evaluate(async ({ type, titleRole, key }) => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const payload = await Promise.resolve(window.Components?.[type]?.getPayload?.({ tabId }));
    const styles = payload?.config?.fontStyles || payload?.style?.fontStyles || payload?.fontStyles || {};
    return styles?.[key]?.textAlign || styles?.[titleRole]?.textAlign || styles?.__graph__?.textAlign || null;
  }, { type: componentType, titleRole: role, key: fontKey });
}

test.setTimeout(180_000);

for(const component of COMPONENT_MATRIX){
  test(`${component.type} graph and axis title alignment survives archive reopen`, async ({ page }) => {
    const config = ALIGNMENT_CASES[component.type];
    expect(config, `${component.type}: explicit alignment coverage`).toBeTruthy();
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 45_000
    });

    for(const [controlId, value] of Object.entries(config.selects || {})){
      await page.locator(`#${controlId}`).selectOption(value);
    }
    if(config.selects){
      await waitForComponentOwnerReady(page, component.type, {
        requireMountedRoot: true,
        requireIdle: true,
        timeout: 45_000
      });
    }

    const graphText = await alignTitle(page, component.pageId, 'graphTitle', 'right', { cycleAlignments: true });
    let axisText = null;
    if(config.verifyAxis){
      axisText = await alignTitle(page, component.pageId, config.verifyAxis, 'right');
    }
    await expect.poll(() => readPayloadAlignment(page, component.type, 'graphTitle')).toBe('right');
    if(config.verifyAxis){
      await expect.poll(() => readPayloadAlignment(page, component.type, config.verifyAxis)).toBe('right');
    }

    const archive = await buildWorkspaceArchive(page);
    const parsedArchive = await parseWorkspaceArchive(page, archive.base64, `${component.type}-title-alignment.graph`);
    const archivedTab = parsedArchive.session?.tabs?.find(tab => tab?.type === component.type);
    expect(archivedTab?.archiveRenderCache, `${component.type}: archive contains its render cache`).toBeTruthy();
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
      componentType: component.type,
      fileName: `${component.type}-title-alignment.graph`
    });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    const restoredGraph = titleTarget(page, component.pageId, 'graphTitle');
    await expect.poll(() => restoredGraph.evaluate(node => ({
      text: node.dataset.titleBlockText || node.textContent || '',
      alignment: node.dataset.titleTextAlign || null,
      anchors: Array.from(node.querySelectorAll('tspan[data-title-line="1"]'))
        .map(row => row.getAttribute('text-anchor'))
    }))).toEqual({ text: graphText, alignment: 'right', anchors: ['end', 'end'] });
    await expect.poll(() => readPayloadAlignment(page, component.type, 'graphTitle')).toBe('right');

    await expect(restoredGraph).toHaveAttribute('data-inline-editable', '1');
    await restoredGraph.dblclick();
    const restoredEditor = page.locator('.inline-edit-input').last();
    await expect(restoredEditor, `${component.type}: restored cached title has a live editor`).toBeVisible();
    const restoredButton = page.getByRole('button', { name: 'Align right' });
    await expect(restoredButton).toHaveAttribute('aria-pressed', 'true');
    await restoredEditor.press('End');
    await restoredEditor.type('!');
    await page.mouse.click(3, 3);
    await expect(restoredEditor).toBeHidden();
    await expect.poll(() => restoredGraph.evaluate(node => node.dataset.titleBlockText || node.textContent || ''))
      .toBe(`${graphText}!`);

    if(config.verifyAxis){
      const restoredAxis = titleTarget(page, component.pageId, config.verifyAxis);
      await expect.poll(() => restoredAxis.evaluate(node => ({
        text: node.dataset.titleBlockText || node.textContent || '',
        alignment: node.dataset.titleTextAlign || null,
        anchors: Array.from(node.querySelectorAll('tspan[data-title-line="1"]'))
          .map(row => row.getAttribute('text-anchor'))
      }))).toEqual({ text: axisText, alignment: 'right', anchors: ['end', 'end'] });
      await expect.poll(() => readPayloadAlignment(page, component.type, config.verifyAxis)).toBe('right');
      await expect(restoredAxis).toHaveAttribute('data-inline-editable', '1');
      await restoredAxis.dblclick();
      await expect(page.locator('.inline-edit-input').last(), `${component.type}: restored axis has a live editor`).toBeVisible();
      await page.mouse.click(3, 3);
      await expect(page.locator('.inline-edit-input')).toBeHidden();
    }
  });
}

test('Font Selection and Graph scopes align title blocks, show mixed state, and undo as a unit', async ({ page }) => {
  const component = COMPONENT_MATRIX.find(entry => entry.type === 'line');
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 45_000
  });

  const graph = titleTarget(page, component.pageId, 'graphTitle');
  const axis = titleTarget(page, component.pageId, 'yTitle');
  const tick = page.locator('#linePage:not([hidden]) .svgbox svg text[data-font-role="yTick"]').first();
  await expect(tick).toBeVisible();
  const tickAnchor = await tick.getAttribute('text-anchor');

  await setTitleAlignment(page, graph, 'left');
  await setTitleAlignment(page, axis, 'center');
  await tick.dblclick();

  const alignmentField = page.locator('.font-controls-panel__field--alignment');
  const left = page.getByRole('button', { name: 'Align left' });
  const right = page.getByRole('button', { name: 'Align right' });
  await expect(left).toBeDisabled();

  const scope = page.locator('select.font-controls-panel__select');
  await expect(scope).toBeVisible();
  await scope.selectOption('graph');
  await expect(left).toBeEnabled();
  await expect(alignmentField).toHaveAttribute('data-mixed', 'true');
  await right.click();
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => graph.getAttribute('data-title-text-align')).toBe('right');
  await expect.poll(() => axis.getAttribute('data-title-text-align')).toBe('right');
  await expect(tick).not.toHaveAttribute('data-title-text-align', 'right');
  await expect(tick).toHaveAttribute('text-anchor', tickAnchor);

  const tabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  const undone = await page.evaluate(id => window.Shared?.undoManager?.undo?.({ tabId: id }) === true, tabId);
  expect(undone).toBe(true);
  await waitForComponentOwnerReady(page, component.type, {
    expectedTabId: tabId,
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 45_000
  });
  await expect.poll(() => titleTarget(page, component.pageId, 'graphTitle').getAttribute('data-title-text-align'))
    .toBe('left');
  await expect.poll(() => titleTarget(page, component.pageId, 'yTitle').getAttribute('data-title-text-align'))
    .toBe('center');
  await expect(tick).toHaveAttribute('text-anchor', tickAnchor);
});

test('Line title text and alignment undo in the order the user changed them', async ({ page }) => {
  const component = COMPONENT_MATRIX.find(entry => entry.type === 'line');
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 45_000
  });

  const graph = titleTarget(page, component.pageId, 'graphTitle');
  const originalText = await graph.evaluate(node => node.dataset.titleBlockText || node.textContent || '');
  const originalAlignment = await graph.getAttribute('data-title-text-align');
  await graph.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  const firstEdit = `${originalText}\nBeta`;
  await editor.press('End');
  await editor.press('Enter');
  await editor.type('Beta');
  await expect(editor).toHaveValue(firstEdit);
  await page.getByRole('button', { name: 'Align right' }).click();
  await expect(editor, 'alignment keeps the title editor open').toBeVisible();
  await expect(editor).toHaveValue(firstEdit);
  await editor.press('End');
  await editor.press('Enter');
  await editor.type('Gamma');
  await expect(editor).toHaveValue(`${firstEdit}\nGamma`);
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await expect.poll(() => graph.evaluate(node => node.dataset.titleBlockText || node.textContent || ''))
    .toBe(`${firstEdit}\nGamma`);
  await expect.poll(() => graph.getAttribute('data-title-text-align')).toBe('right');

  const tabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  const recordedHistory = await page.evaluate(id => window.Shared?.undoManager?.getTabHistoryInfo?.({ tabId: id }), tabId);
  expect(recordedHistory.labels.slice(-3)).toEqual([
    'line:title',
    'font-controls:text-align-right',
    'line:title'
  ]);
  const undo = async () => {
    expect(await page.evaluate(id => window.Shared?.undoManager?.undo?.({ tabId: id }) === true, tabId)).toBe(true);
    await waitForComponentOwnerReady(page, component.type, {
      expectedTabId: tabId,
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 45_000
    });
  };
  const readTitleState = () => graph.evaluate(node => ({
    text: node.dataset.titleBlockText || node.textContent || '',
    alignment: node.dataset.titleTextAlign || null
  }));

  await undo();
  await expect.poll(readTitleState).toEqual({ text: firstEdit, alignment: 'right' });
  await undo();
  await expect.poll(readTitleState).toEqual({ text: firstEdit, alignment: originalAlignment });
  await undo();
  await expect.poll(readTitleState).toEqual({ text: originalText, alignment: originalAlignment });

  const redo = async () => {
    expect(await page.evaluate(id => window.Shared?.undoManager?.redo?.({ tabId: id }) === true, tabId)).toBe(true);
    await waitForComponentOwnerReady(page, component.type, {
      expectedTabId: tabId,
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 45_000
    });
  };
  await redo();
  await expect.poll(readTitleState).toEqual({ text: firstEdit, alignment: originalAlignment });
  await redo();
  await expect.poll(readTitleState).toEqual({ text: firstEdit, alignment: 'right' });
  await redo();
  await expect.poll(readTitleState).toEqual({ text: `${firstEdit}\nGamma`, alignment: 'right' });
});

for(const component of COMPONENT_MATRIX){
  test(`${component.type} graph and axis title undo works while editing`, async ({ page }) => {
    const config = ALIGNMENT_CASES[component.type] || {};
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 45_000
    });
    for(const [controlId, value] of Object.entries(config.selects || {})){
      await page.locator(`#${controlId}`).selectOption(value);
    }
    if(config.selects){
      await waitForComponentOwnerReady(page, component.type, {
        requireMountedRoot: true,
        requireIdle: true,
        timeout: 45_000
      });
    }

    for(const role of ['graphTitle', config.verifyAxis].filter(Boolean)){
      const target = titleTarget(page, component.pageId, role);
      await expect(target, `${component.type}/${role}`).toBeVisible();
      const originalText = await target.evaluate(node => node.dataset.titleBlockText || node.textContent || '');
      const editedText = `${originalText}\nDraft`;
      await target.dblclick();
      const editor = page.locator('.inline-edit-input').last();
      await expect(editor).toBeVisible();
      await editor.fill(editedText);

      await editor.press('Control+z');
      await expect(editor, 'undo keeps inline editing open').toBeVisible();
      await expect(editor).toHaveValue(originalText);
      await expect.poll(() => target.evaluate(node => node.dataset.titleBlockText || node.textContent || ''))
        .toBe(originalText);

      await editor.press('Control+y');
      await expect(editor, 'redo keeps inline editing open').toBeVisible();
      await expect(editor).toHaveValue(editedText);
      await expect.poll(() => target.evaluate(node => node.dataset.titleBlockText || node.textContent || ''))
        .toBe(editedText);

      await page.mouse.click(3, 3);
      await expect(editor).toBeHidden();
      await waitForComponentOwnerReady(page, component.type, {
        requireMountedRoot: true,
        requireIdle: true,
        timeout: 45_000
      });
    }
  });
}

test('the title editor allocates and keeps a visible row for an empty final line', async ({ page }) => {
  const component = COMPONENT_MATRIX.find(entry => entry.type === 'line');
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 45_000
  });

  const graph = titleTarget(page, component.pageId, 'graphTitle');
  const originalText = await graph.evaluate(node => node.dataset.titleBlockText || node.textContent || '');
  await graph.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  const getEditorMetrics = () => editor.evaluate(input => {
    const overlay = input.closest('.inline-edit-overlay');
    const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight);
    return {
      overlayHeight: overlay.getBoundingClientRect().height,
      clientHeight: input.clientHeight,
      scrollHeight: input.scrollHeight,
      scrollTop: input.scrollTop,
      lineHeight
    };
  });

  await editor.press('End');
  await editor.press('Enter');
  await expect(editor).toHaveValue(`${originalText}\n`);
  const emptyRow = await getEditorMetrics();
  expect(emptyRow.overlayHeight).toBeGreaterThanOrEqual(emptyRow.lineHeight * 2);
  expect(emptyRow.clientHeight + 2).toBeGreaterThanOrEqual(emptyRow.lineHeight * 2);

  await editor.type('temporary');
  const populatedRow = await getEditorMetrics();
  expect(populatedRow.overlayHeight).toBeGreaterThanOrEqual(populatedRow.lineHeight * 2);
  await editor.press('End');
  await editor.press('Shift+Home');
  await editor.press('Backspace');
  await expect(editor).toHaveValue(`${originalText}\n`);
  const clearedRow = await getEditorMetrics();
  expect(clearedRow.overlayHeight).toBeGreaterThanOrEqual(clearedRow.lineHeight * 2);
  expect(clearedRow.clientHeight + 2).toBeGreaterThanOrEqual(clearedRow.lineHeight * 2);
  expect(clearedRow.scrollTop).toBe(0);
  await expect(editor).toBeVisible();
});
