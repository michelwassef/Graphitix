const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

for (const type of ['box', 'scatter', 'line', 'pie', 'roc', 'survival']) {
  test(`${type} advisor closes completely and preserves answers`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type, pageId: `${type}Page` }, { first: true, loadExample: true });
    const advisor = page.locator(`#${type}Page:not([hidden]) .stats-advisor`).first();
    const toggle = advisor.locator('.stats-advisor__toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText('Help me choose');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(advisor.locator('.stats-advisor__summary')).toBeHidden();
    const initialHeight = await advisor.evaluate(node => node.getBoundingClientRect().height);
    await toggle.click();
    await expect(advisor.locator('.stats-advisor__summary')).toBeVisible();
    await expect(toggle).toHaveText('Help me choose');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    if (type === 'scatter') {
      await expect(advisor.locator('.stats-advisor__summary')).toContainText('Suggested regression model:');
      await expect(advisor.locator('.stats-advisor__summary')).not.toContainText('set to');
    }
    await toggle.click();
    await expect(advisor.locator('.stats-advisor__summary')).toBeHidden();
    expect(await advisor.evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(initialHeight, 0);
    await toggle.click();
    const radios = advisor.locator('input[type="radio"]');
    // Choose an unchecked answer, then compare the resulting answers after reopening.
    const unchecked = advisor.locator('input[type="radio"]:not(:checked)').last();
    if (await unchecked.count()) {
      const answer = await unchecked.evaluate(node => ({ name: node.name, question: node.dataset.advisorQuestion, value: node.value }));
      await advisor.locator(`input[data-advisor-question="${answer.question}"][value="${answer.value}"]`).check();
    }
    const answers = await radios.evaluateAll(nodes => nodes.filter(node => node.checked).map(node => [node.name, node.value]));
    await toggle.click();
    await expect(advisor.locator('.stats-advisor__summary')).toBeHidden();
    await expect(advisor.locator('.stats-advisor__questions')).toHaveCount(0);
    expect(await advisor.evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(initialHeight, 0);
    await toggle.click();
    await expect(advisor.locator('.stats-advisor__summary')).toBeVisible();
    expect(await radios.evaluateAll(nodes => nodes.filter(node => node.checked).map(node => [node.name, node.value]))).toEqual(answers);
  });
}

for (const type of ['box', 'scatter', 'line', 'pie', 'roc', 'survival']) {
  test(`${type} advisor owns edits through capture, sibling tabs and file reopen`, async ({ page }) => {
    test.setTimeout(180_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type, pageId: `${type}Page` }, { first: true, loadExample: true });
    const firstId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);
    const advisor = page.locator(`#${type}Page:not([hidden]) .stats-advisor`).first();
    const toggle = advisor.locator('.stats-advisor__toggle');
    await toggle.click();
    const unchecked = advisor.locator('input[type="radio"]:not(:checked)').last();
    const answer = await unchecked.evaluate(node => ({ name: node.name, question: node.dataset.advisorQuestion, value: node.value }));
    const choice = advisor.locator(`input[data-advisor-question="${answer.question}"][value="${answer.value}"]`);
    await choice.check();

    // Snapshotting must not detach the state held by the still-mounted controls.
    expect(await page.evaluate(type => {
      const component = window.Components[type];
      const id = window.Main.session.workspaceState.activeTabId;
      const owner = type==='line' ? component.__testHooks.getActiveSession() : component.__testHooks.getSession(id);
      const read = () => type==='box' ? owner.state.stats.statsAdvisor : type==='line' ? owner.state.advisorState : owner.advisor;
      const live = read();
      const answers = live.answers;
      component.captureRuntimeState({ tabId: id });
      const payload = component.getPayload({ tabId: id });
      const saved = type==='line' ? payload.config.advisorState : type==='roc' ? payload.stats.advisor : type==='survival' ? payload.config.advisor : payload.config.stats.advisor;
      return read() === live && read().answers === answers
        && saved !== live && saved.answers !== answers
        && !Object.hasOwn(live, 'context') && !Object.hasOwn(saved, 'context');
    }, type)).toBe(true);
    await expect(choice).toBeChecked();
    await toggle.click();
    await expect(toggle).toHaveText('Help me choose');
    await toggle.click();
    await expect(choice).toBeChecked();

    await openComponentFromWelcome(page, { type, pageId: `${type}Page` }, { loadExample: true });
    const secondId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);
    await expect(toggle).toHaveText('Help me choose');
    await toggle.click();
    await expect(choice).not.toBeChecked();
    await toggle.click();
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstId}"]`).click();
    await waitForComponentOwnerReady(page, type, { expectedTabId: firstId });
    await expect(toggle).toHaveText('Help me choose');
    await expect(choice).toBeChecked();

    const archive = await buildWorkspaceArchive(page, {
      scope: 'workspace', snapshotKind: 'save', policyMode: 'manual-save',
      reason: 'advisor-owner-regression', compression: 'STORE', useWorker: false
    });
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: type });
    await waitForDocumentOpenComplete(page);
    await waitForComponentOwnerReady(page, type);
    await expect(toggle).toHaveText('Help me choose');
    await expect(choice).toBeChecked();
    // Archive ids may be remapped; find the second component tab from workspace state.
    const reopenedSecondId = await page.evaluate(type => window.Main.session.workspaceState.tabs.filter(tab => tab.type === type)[1].id, type);
    expect(secondId).not.toBe(firstId);
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${reopenedSecondId}"]`).click();
    await waitForComponentOwnerReady(page, type, { expectedTabId: reopenedSecondId });
    await expect(toggle).toHaveText('Help me choose');
    await expect(advisor.locator('.stats-advisor__summary')).toBeHidden();
    await toggle.click();
    await expect(choice).not.toBeChecked();
  });
}
