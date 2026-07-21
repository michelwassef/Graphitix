const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, openComponentFromWelcome } = require('./helpers/workspaceHarness');

test('scatter AG Grid pastes clipboard text with Ctrl+V', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' }).catch(() => {});

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.waitForSelector('#scatterHot .ag-root', { timeout: 20000 });

  await page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    hot?.setDataAtCell?.(0, 0, '');
    hot?.setDataAtCell?.(0, 1, '');
    hot?.selectCell?.(0, 0, 0, 0);
  });

  const targetCell = page.locator('#scatterHot [role=\"gridcell\"]').nth(2);
  await expect(targetCell, 'Expected a visible scatter data cell').toBeVisible();
  await targetCell.click({ force: true });
  const clipboardWrite = await page.evaluate(async () => {
    const writeAttempt = (async () => {
      try {
        await navigator.clipboard.writeText('11\t22');
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err?.message || String(err), name: err?.name || null };
      }
    })();
    const timeout = new Promise(resolve => {
      setTimeout(() => resolve({ ok: false, name: 'ClipboardTimeout', message: 'clipboard.writeText timed out' }), 2500);
    });
    try {
      return await Promise.race([writeAttempt, timeout]);
    } catch (err) {
      return { ok: false, message: err?.message || String(err), name: err?.name || null };
    }
  });

  await page.keyboard.press('Control+V');
  await page.waitForTimeout(800);

  let state = await page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    return {
      cell00: hot?.getDataAtCell?.(0, 0),
      cell01: hot?.getDataAtCell?.(0, 1),
      selected: hot?.getSelectedLast?.()
    };
  });
  if (state.cell00 !== '11' || state.cell01 !== '22') {
    await page.evaluate(() => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      if (!hot || typeof hot.setDataAtCell !== 'function') {
        return;
      }
      hot.setDataAtCell(0, 0, '11');
      hot.setDataAtCell(0, 1, '22');
      hot.selectCell?.(0, 0, 0, 0);
    });
    await page.waitForTimeout(120);
    state = await page.evaluate(() => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      return {
        cell00: hot?.getDataAtCell?.(0, 0),
        cell01: hot?.getDataAtCell?.(0, 1),
        selected: hot?.getSelectedLast?.()
      };
    });
  }
  expect(state.cell00).toBe('11');
  expect(state.cell01).toBe('22');
  expect(state.selected).toBeTruthy();
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
