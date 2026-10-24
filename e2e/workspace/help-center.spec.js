const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

test('Help and About opens from Welcome and a workspace toolbar', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');

  const welcomeTrigger = page.locator('#welcomeHelpAboutButton');
  const welcomePlacement = await welcomeTrigger.evaluate(button => {
    const heading = button.closest('.welcome-hero__heading');
    const buttonRect = button.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return {
      position: getComputedStyle(button).position,
      top: buttonRect.top,
      headingTop: headingRect.top,
      right: buttonRect.right,
      headingRight: headingRect.right
    };
  });
  expect(welcomePlacement.position).toBe('absolute');
  expect(Math.abs(welcomePlacement.top - welcomePlacement.headingTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(welcomePlacement.right - welcomePlacement.headingRight)).toBeLessThanOrEqual(1);

  const dialog = page.getByRole('dialog', { name: 'Help & About' });
  await welcomeTrigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Getting started' })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('tabpanel', { name: 'Getting started' })).toBeVisible();

  await dialog.getByRole('tab', { name: 'Common questions' }).click();
  await expect(dialog.getByRole('tabpanel', { name: 'Common questions' })).toContainText('.xlsx');
  await dialog.getByRole('tab', { name: 'About Graphitix' }).click();
  await expect(dialog.getByRole('tabpanel', { name: 'About Graphitix' })).toContainText('MIT License');
  await dialog.getByRole('tab', { name: 'Send feedback' }).click();
  const feedback = dialog.getByRole('tabpanel', { name: 'Send feedback' });
  await expect(feedback).toBeVisible();
  const issueLink = feedback.getByRole('link', { name: 'file an issue in the Graphitix GitHub repository' });
  await expect(issueLink).toHaveAttribute('href', 'https://github.com/michelwassef/Graphitix/issues');
  await expect(issueLink).toHaveAttribute('target', '_blank');
  const emailLink = feedback.getByRole('link', { name: 'email me directly' });
  await expect(emailLink).toHaveAttribute('href', /^mailto:michel\.wassef@gmail\.com\?subject=Graphitix%20feedback$/);
  await expect(feedback).toContainText('GitHub issues are public');
  await expect(feedback).toContainText('Graphitix does not automatically send or attach your graph or data');

  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'Getting started' })).toBeFocused();
  await expect(dialog.getByRole('tabpanel', { name: 'Getting started' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(welcomeTrigger).toBeFocused();

  const box = COMPONENT_CATALOG.find(component => component.type === 'box');
  await openComponentFromWelcome(page, box, { first: true });
  const toolbarTabs = page.locator('#boxPage .workspace-toolbar__section-tabs');
  await expect(toolbarTabs.getByRole('tab')).toHaveText(['General', 'Data', 'Format', 'Help']);
  await toolbarTabs.getByRole('tab', { name: 'Help' }).click();
  const toolbarTrigger = page.locator('#boxPage [data-help-open]');
  await expect(toolbarTrigger).toBeVisible();
  await expect(toolbarTrigger).toHaveAttribute('aria-haspopup', 'dialog');
  await toolbarTrigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Getting started' })).toBeVisible();
  await page.locator('#helpAboutDialogClose').click();
  await expect(dialog).toBeHidden();
  await expect(toolbarTrigger).toBeFocused();
});

test('Help topics remain reachable in a short phone viewport', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const welcomePlacement = await page.locator('#welcomeHelpAboutButton').evaluate(button => {
    const lede = button.closest('.welcome-hero__heading').querySelector('.welcome-hero__lede');
    const buttonRect = button.getBoundingClientRect();
    return {
      position: getComputedStyle(button).position,
      top: buttonRect.top,
      right: buttonRect.right,
      ledeBottom: lede.getBoundingClientRect().bottom,
      viewportWidth: innerWidth
    };
  });
  expect(welcomePlacement.position).toBe('static');
  expect(welcomePlacement.top).toBeGreaterThanOrEqual(welcomePlacement.ledeBottom);
  expect(welcomePlacement.right).toBeLessThanOrEqual(welcomePlacement.viewportWidth);
  await page.locator('#welcomeHelpAboutButton').click();

  const dialog = page.getByRole('dialog', { name: 'Help & About' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab')).toHaveCount(4);
  for (const tab of await dialog.getByRole('tab').all()) {
    await expect(tab).toBeVisible();
  }
  const layout = await dialog.locator('.help-dialog__panel').evaluate(panel => {
    const panelRect = panel.getBoundingClientRect();
    const content = panel.querySelector('.help-center__content');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      panel: { left: panelRect.left, top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom },
      contentScrollable: content.scrollHeight > content.clientHeight,
      horizontalOverflow: content.scrollWidth > content.clientWidth
    };
  });
  expect(layout.panel.left).toBeGreaterThanOrEqual(0);
  expect(layout.panel.top).toBeGreaterThanOrEqual(0);
  expect(layout.panel.right).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.panel.bottom).toBeLessThanOrEqual(layout.viewport.height);
  expect(layout.contentScrollable).toBe(true);
  expect(layout.horizontalOverflow).toBe(false);
  await expect(page.locator('#helpAboutDialogClose')).toBeVisible();
});
