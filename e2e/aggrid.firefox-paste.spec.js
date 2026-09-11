const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, openComponentFromWelcome } = require('./helpers/workspaceHarness');
const { waitForComponentOwnerReady } = require('./helpers/contractWaits');

test('scatter AG Grid accepts a browser paste event in the visible table', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await waitForComponentOwnerReady(page, 'scatter');
  await page.waitForSelector('#scatterHot .ag-root', { timeout: 20000 });

  const targetCell = page.locator('#scatterHot .ag-center-cols-container .ag-row .ag-cell[col-id^=\"c\"]').first();
  await expect(targetCell, 'Expected a visible scatter data cell').toBeVisible();
  const targetBox = await targetCell.boundingBox();
  expect(targetBox).toBeTruthy();
  await page.mouse.click(targetBox.x + (targetBox.width / 2), targetBox.y + (targetBox.height / 2));
  const handled = await page.evaluate(() => {
    const host = document.getElementById('scatterHot');
    if (!host) return false;
    const transfer = new DataTransfer();
    transfer.setData('text/plain', '11\t22');
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    host.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(handled).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const host = document.getElementById('scatterHot');
    const cellTexts = Array.from(host?.querySelectorAll('.ag-center-cols-container .ag-row .ag-cell') || [])
      .map(cell => String(cell.textContent || '').trim());
    const selection = host?.querySelector('.ag-cell-range-selected, .ag-cell-focus') || null;
    return {
      cell00: cellTexts.includes('11') ? '11' : '',
      cell01: cellTexts.includes('22') ? '22' : '',
      selected: !!selection
    };
  }), { timeout: 20_000, intervals: [50, 100, 250, 500] }).toMatchObject({
    cell00: '11',
    cell01: '22',
    selected: true
  });
});

test('AG Grid distinguishes spreadsheet decimal commas from plain CSV', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.waitForSelector('#scatterHot .ag-root', { timeout: 20000 });

  await page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    hot?.setDataAtCell?.(0, 1, '');
    hot?.selectCell?.(0, 0, 0, 0);
    const transfer = new DataTransfer();
    transfer.setData('text/plain', '1,2\n3,4');
    transfer.setData('text/html', '<table><tr><td>1,2</td></tr><tr><td>3,4</td></tr></table>');
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: transfer });
    document.querySelector('#scatterHot')?.dispatchEvent(pasteEvent);
  });

  await expect.poll(() => page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    return [hot?.getDataAtCell?.(0, 0), hot?.getDataAtCell?.(1, 0), hot?.getDataAtCell?.(0, 1)];
  })).toEqual(['1.2', '3.4', '']);

  await page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    hot?.selectCell?.(0, 1, 0, 1);
    const transfer = new DataTransfer();
    transfer.setData('text/plain', '5,6\n7,8');
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: transfer });
    document.querySelector('#scatterHot')?.dispatchEvent(pasteEvent);
  });

  await expect.poll(() => page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    return [
      hot?.getDataAtCell?.(0, 1),
      hot?.getDataAtCell?.(0, 2),
      hot?.getDataAtCell?.(1, 1),
      hot?.getDataAtCell?.(1, 2)
    ];
  })).toEqual(['5', '6', '7', '8']);
});
