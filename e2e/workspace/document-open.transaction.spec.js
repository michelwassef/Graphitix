const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');

for (const saveMode of ['existing', 'first', 'as']) {
  test(`toolbar ${saveMode} save chooses its destination before slow preparation`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, {
      first: true, loadExample: true
    });
    await page.evaluate(async mode => {
      const context = window.Main.tabs.getSessionActionsContext();
      const actions = window.Main.sessionActions;
      const blob = mode === 'first' ? null
        : await actions.buildWorkspaceArchiveBlob(context, { scope: 'workspace', useWorker: false });
      const probe = window.__reopenedSave = { requests: 0, permissionQueries: 0, pickers: 0, writes: 0, closed: 0 };
      let granted = false;
      const handle = {
        name: 'reopened.graph',
        queryPermission: async () => {
          probe.permissionQueries++;
          // A slow browser permission lookup can outlast the Save click's
          // transient activation. Write permission must be requested first.
          await new Promise(resolve => setTimeout(resolve, 5500));
          return granted ? 'granted' : 'prompt';
        },
        requestPermission: async () => {
          probe.requests++;
          probe.permissionActive = navigator.userActivation.isActive;
          granted = probe.permissionActive;
          return granted ? 'granted' : 'prompt';
        },
        createWritable: async () => ({
          write: async data => { probe.writes++; probe.archive = data; },
          close: async () => { probe.closed++; console.debug('E2E graph save written'); }
        })
      };
      if (blob) await actions.loadWorkspaceFile(context, blob, { fileHandle: handle, fileName: handle.name });
      const destination = { name: 'chosen.graph', createWritable: handle.createWritable };
      probe.handle = mode === 'existing' ? handle : destination;
      window.showSaveFilePicker = async () => {
        probe.pickers++;
        probe.pickerActive = navigator.userActivation.isActive;
        if (!probe.pickerActive) throw new DOMException('Activation required', 'SecurityError');
        return destination;
      };
    }, saveMode);
    await page.locator('#scatterPage:not([hidden])').getByRole('tab', { name: 'General', exact: true }).click();
    await page.evaluate(() => {
      const probe = window.__reopenedSave;
      const context = window.Main.tabs.getSessionActionsContext();
      const previews = context.previews;
      const originalAwait = previews.awaitPendingCaptures;
      let delayed = false;
      previews.awaitPendingCaptures = async function(...args) {
        if (!delayed) {
          delayed = true;
          // Preview encoding can outlast the browser's transient click activation.
          await new Promise(resolve => setTimeout(resolve, 5500));
          probe.activationAfterCapture = navigator.userActivation.isActive;
        }
        return originalAwait.apply(this, args);
      };
    });
    // Observe completion outside the page: evaluation polling can grant fresh
    // activation and mask the timeout this regression must exercise.
    const saved = page.waitForEvent('console', {
      predicate: message => message.text() === 'E2E graph save written', timeout: 30_000
    });
    await page.locator(`#scatterPage:not([hidden]) #${saveMode === 'as' ? 'saveAsScatter' : 'saveScatter'}`).click({ noWaitAfter: true });
    await saved;
    const result = await page.evaluate(async () => {
      const probe = window.__reopenedSave;
      const parsed = await window.Shared.graphArchive.parseFile(probe.archive, { fileName: 'reopened.graph' });
      return {
        requests: probe.requests, permissionQueries: probe.permissionQueries,
        pickers: probe.pickers, writes: probe.writes,
        authorizationActive: probe.permissionActive ?? probe.pickerActive, activationAfterCapture: probe.activationAfterCapture,
        sameHandle: window.Main.session.workspaceState.sessionFileHandle === probe.handle,
        types: parsed.session.tabs.map(tab => tab.type)
      };
    });
    expect(result).toEqual({
      requests: saveMode === 'existing' ? 1 : 0, permissionQueries: 0,
      pickers: saveMode === 'existing' ? 0 : 1,
      writes: 1, authorizationActive: true,
      activationAfterCapture: false, sameHandle: true, types: ['scatter']
    });
  });
}

test('existing toolbar Save never opens Save As when the browser denies write access', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, {
    first: true, loadExample: true
  });
  await page.evaluate(async () => {
    const context = window.Main.tabs.getSessionActionsContext();
    const actions = window.Main.sessionActions;
    const archive = await actions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace', useWorker: false
    });
    const probe = window.__deniedExistingSave = {
      permissionRequests: 0, pickerCalls: 0, writes: 0, alert: ''
    };
    const handle = {
      name: 'existing.graph',
      requestPermission: async () => {
        probe.permissionRequests++;
        return 'denied';
      },
      queryPermission: async () => 'denied',
      createWritable: async () => ({
        write: async () => { probe.writes++; },
        close: async () => {}
      })
    };
    await actions.loadWorkspaceFile(context, archive, {
      fileHandle: handle, fileName: handle.name
    });
    window.Main.session.markSessionDirty('e2e-existing-save-edit', { origin: 'user' });
    window.showSaveFilePicker = async () => {
      probe.pickerCalls++;
      return { name: 'wrong-copy.graph', createWritable: handle.createWritable };
    };
    window.alert = message => { probe.alert = String(message || ''); };
  });

  const scatterWorkspace = page.locator('#scatterPage:not([hidden])');
  await scatterWorkspace.getByRole('tab', { name: 'General' }).click();
  await scatterWorkspace.locator('#saveScatter').click();
  await page.waitForFunction(() => window.__deniedExistingSave?.permissionRequests === 1);
  const result = await page.evaluate(() => ({
    ...window.__deniedExistingSave,
    sameHandle: window.Main.session.workspaceState.sessionFileHandle.name === 'existing.graph',
    targetKind: window.Main.session.workspaceState.sessionFileTargetKind,
    dirty: window.Main.session.workspaceState.sessionUserDirty
  }));
  expect(result).toEqual({
    permissionRequests: 1, pickerCalls: 0, writes: 0,
    alert: expect.stringContaining('changes remain unsaved'),
    sameHandle: true, targetKind: 'existing', dirty: true
  });
});

test('document open blocks tab mutations and publishes one final state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    !!window.Main?.tabs?.getSessionActionsContext
    && !!window.Main?.sessionActions?.loadWorkspaceFile
    && !!window.Shared?.graphArchive?.parseFile
  ));

  const initial = await page.evaluate(() => ({
    activeTabId: window.Main.session.workspaceState.activeTabId,
    tabCount: window.Main.session.workspaceState.tabs.length,
    activeTabBorderColors: (() => {
      const style = getComputedStyle(document.querySelector('.workspace-tab.is-active'));
      return { left: style.borderLeftColor, right: style.borderRightColor };
    })()
  }));

  await page.evaluate(() => {
    const graphArchive = window.Shared.graphArchive;
    window.__originalDocumentOpenParse = graphArchive.parseFile;
    graphArchive.parseFile = () => new Promise(resolve => {
      window.__releaseDocumentOpenParse = () => resolve({
        source: 'e2e-document-open',
        session: {
          scope: 'workspace',
          activeIndex: -1,
          tabs: []
        }
      });
    });
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = new Blob(['deferred'], { type: 'application/zip' });
    blob.name = 'professional-open.graph';
    window.__documentOpenPromise = window.Main.sessionActions.loadWorkspaceFile(context, blob, {
      reason: 'e2e-document-open',
      fileName: blob.name,
      loadMode: 'replace'
    }).finally(() => {
      graphArchive.parseFile = window.__originalDocumentOpenParse;
    });
  });

  const overlay = page.locator('#documentOpenOverlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('role', 'dialog');
  await expect(overlay).toHaveAttribute('aria-modal', 'true');
  await expect(overlay).toHaveAttribute('aria-labelledby', 'documentOpenTitle');
  await expect(page.locator('#documentOpenDetail')).toHaveAttribute('aria-live', 'polite');
  await expect(overlay).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeVisible();
  await expect(overlay).toBeFocused();
  await expect(overlay.locator('.document-open-overlay__title')).toHaveText('Opening “professional-open.graph”…');
  const reducedMotion = await overlay.locator('.document-open-overlay__progress span').evaluate(node => {
    const style = getComputedStyle(node);
    return { animationDuration: style.animationDuration, animationIterationCount: style.animationIterationCount };
  });
  expect(Number.parseFloat(reducedMotion.animationDuration)).toBeLessThan(0.001);
  expect(reducedMotion.animationIterationCount).toBe('1');
  await expect(page.locator('body')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#appShell')).toHaveAttribute('inert', '');
  await expect(page.locator('.workspace-tab').first()).toBeDisabled();

  const blocked = await page.evaluate(() => {
    document.getElementById('addWorkspaceTab')?.click();
    document.querySelector('.workspace-tab')?.click();
    const programmaticActivation = window.Main.tabs.activateTab('missing-tab');
    return {
      activeTabId: window.Main.session.workspaceState.activeTabId,
      tabCount: window.Main.session.workspaceState.tabs.length,
      programmaticActivation
    };
  });
  expect(blocked.activeTabId).toBe(initial.activeTabId);
  expect(blocked.tabCount).toBe(initial.tabCount);
  expect(blocked.programmaticActivation).toBe(false);

  await page.evaluate(async () => {
    window.__releaseDocumentOpenParse();
    await window.__documentOpenPromise;
  });

  await expect(overlay).toBeHidden();
  await expect(page.locator('body')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#appShell')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.workspace-tab').first()).toBeEnabled();
  const activeTabStyle = await page.locator('.workspace-tab.is-active').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      left: style.borderLeftColor,
      right: style.borderRightColor
    };
  });
  expect(activeTabStyle).toEqual(initial.activeTabBorderColors);
  expect(await page.evaluate(() => window.Main.session.workspaceState.documentOperation)).toBeNull();
});

test('document-open error closes on Escape and restores the workspace', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    !!window.Main?.tabs?.getSessionActionsContext
    && !!window.Main?.sessionActions?.loadWorkspaceFile
    && !!window.Shared?.graphArchive?.parseFile
  ));

  await page.evaluate(() => {
    const graphArchive = window.Shared.graphArchive;
    window.__originalDocumentOpenParse = graphArchive.parseFile;
    graphArchive.parseFile = async () => { throw new Error('intentional modal error contract'); };
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = new Blob(['invalid'], { type: 'application/zip' });
    blob.name = 'broken-modal-contract.graph';
    window.__documentOpenPromise = window.Main.sessionActions
      .loadWorkspaceFile(context, blob, { reason: 'e2e-document-open-error', fileName: blob.name })
      .catch(error => error.message);
  });

  const overlay = page.locator('#documentOpenOverlay');
  await expect(overlay).toHaveAttribute('data-state', 'error');
  await expect(overlay.locator('[data-document-open-action="close"]')).toBeVisible();
  await expect(page.locator('#appShell')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  await expect(page.locator('#appShell')).not.toHaveAttribute('inert', '');
  await expect(page.locator('body')).not.toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(async () => {
    const error = await window.__documentOpenPromise;
    window.Shared.graphArchive.parseFile = window.__originalDocumentOpenParse;
    return error;
  })).toBe('intentional modal error contract');
  expect(await page.evaluate(() => window.Main.session.workspaceState.documentOperation)).toBeNull();
});

test('document-open retry releases the modal before opening the file picker', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    !!window.Main?.tabs?.getSessionActionsContext
    && !!window.Main?.sessionActions?.loadWorkspaceFile
    && !!window.Shared?.graphArchive?.parseFile
  ));

  await page.evaluate(() => {
    const graphArchive = window.Shared.graphArchive;
    window.__originalDocumentOpenParse = graphArchive.parseFile;
    graphArchive.parseFile = async () => { throw new Error('intentional retry contract'); };
    const context = window.Main.tabs.getSessionActionsContext();
    context.dom.sessionFileInput.click = () => { window.__documentOpenRetryRequested = true; };
    const blob = new Blob(['invalid'], { type: 'application/zip' });
    blob.name = 'retry-modal-contract.graph';
    window.__documentOpenPromise = window.Main.sessionActions
      .loadWorkspaceFile(context, blob, { reason: 'e2e-document-open-retry', fileName: blob.name })
      .catch(error => error.message);
  });

  const overlay = page.locator('#documentOpenOverlay');
  await expect(overlay).toHaveAttribute('data-state', 'error');
  await overlay.locator('[data-document-open-action="retry"]').click();
  await expect(overlay).toBeHidden();
  await expect(page.locator('#appShell')).not.toHaveAttribute('inert', '');
  await expect(page.locator('body')).not.toHaveAttribute('aria-busy', 'true');
  await page.waitForFunction(() => window.__documentOpenRetryRequested === true);
  expect(await page.evaluate(async () => {
    const error = await window.__documentOpenPromise;
    window.Shared.graphArchive.parseFile = window.__originalDocumentOpenParse;
    return error;
  })).toBe('intentional retry contract');
});
