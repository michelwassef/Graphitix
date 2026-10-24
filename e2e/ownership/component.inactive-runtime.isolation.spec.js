const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { activateTab } = require('../helpers/uiDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

for(const component of COMPONENT_MATRIX){
  test(`inactive runtime capture and restore preserve ${component.type} owners`, async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    await openComponentFromWelcome(page, component, { first: true });
    const ownerA = await page.evaluate(type => {
      const tabId = window.Main.session.workspaceState.activeTabId;
      const module = window.Components[type];
      const notes = module.__internalStateBridge.targets.find(target => target.key === 'notesState').get({ tabId });
      const editor = notes.control.editor;
      if(editor instanceof HTMLTextAreaElement){ editor.value = 'Owner A restored notes'; }
      else { editor.textContent = 'Owner A restored notes'; }
      notes.control.editor.dispatchEvent(new Event('input', { bubbles: true }));
      const snapshot = module.captureRuntimeState({ tabId });
      window.__inactiveRuntimeOwner = { tabId, snapshot };
      return tabId;
    }, component.type);
    await openComponentFromWelcome(page, component, { first: false });
    const ownerB = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);
    expect(ownerB).not.toBe(ownerA);

    const result = await page.evaluate(async ({ type, ownerB }) => {
      const module = window.Components[type];
      const { tabId, snapshot } = window.__inactiveRuntimeOwner;
      const notesTarget = module.__internalStateBridge.targets.find(target => target.key === 'notesState');
      const readLive = () => {
        const notes = notesTarget.get({ tabId: ownerB });
        return { text: notes.text || '', open: !!notes.open, control: notes.control?.getValue?.() || '' };
      };
      const before = readLive();
      const applied = await module.applyRuntimeState(snapshot, { tabId, reason: 'inactive-runtime-isolation' });
      const after = readLive();
      const capturedA = await module.captureRuntimeState({ tabId, reason: 'inactive-runtime-recapture' });
      return {
        before, after, applied,
        workspaceOwner: window.Main.session.workspaceState.activeTabId,
        boundOwner: module.__boundTabId,
        storedNotes: capturedA?.__internalState?.targets?.notesState?.text
      };
    }, { type: component.type, ownerB });
    expect(result.applied).toBe(true);
    expect(result.workspaceOwner).toBe(ownerB);
    expect(result.boundOwner).toBe(ownerB);
    expect(result.after).toEqual(result.before);
    expect(result.storedNotes).toBe('Owner A restored notes');

    await activateTab(page, ownerA, component);
    expect(await page.evaluate(type => {
      const module = window.Components[type];
      return module.captureRuntimeState({ tabId: window.Main.session.workspaceState.activeTabId })
        .__internalState.targets.notesState.text;
    }, component.type)).toBe('Owner A restored notes');
    await activateTab(page, ownerB, component);
    expect(await page.evaluate(type => {
      const module = window.Components[type];
      return module.captureRuntimeState({ tabId: window.Main.session.workspaceState.activeTabId })
        .__internalState.targets.notesState.text || '';
    }, component.type)).toBe(result.before.text);
    expect(issues.critical).toEqual([]);
  });
}
