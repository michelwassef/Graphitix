const { test, expect } = require('@playwright/test');

test('document open blocks tab mutations and publishes one final state', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    !!window.Main?.tabs?.getSessionActionsContext
    && !!window.Main?.sessionActions?.loadWorkspaceFile
    && !!window.Shared?.graphArchive?.parseFile
  ));

  const initial = await page.evaluate(() => ({
    activeTabId: window.Main.session.workspaceState.activeTabId,
    tabCount: window.Main.session.workspaceState.tabs.length
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
  await expect(overlay.locator('.document-open-overlay__title')).toHaveText('Opening “professional-open.graph”…');
  await expect(page.locator('body')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#workspaceTabsDock')).toHaveAttribute('inert', '');
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
  await expect(page.locator('#workspaceTabsDock')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.workspace-tab').first()).toBeEnabled();
  const activeTabStyle = await page.locator('.workspace-tab.is-active').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      borderLeftColor: style.borderLeftColor,
      borderRightColor: style.borderRightColor,
      borderLeftStyle: style.borderLeftStyle,
      borderRightStyle: style.borderRightStyle
    };
  });
  expect(activeTabStyle).toEqual({
    borderLeftColor: 'rgb(214, 214, 214)',
    borderRightColor: 'rgb(214, 214, 214)',
    borderLeftStyle: 'solid',
    borderRightStyle: 'solid'
  });
  expect(await page.evaluate(() => window.Main.session.workspaceState.documentOperation)).toBeNull();
});
