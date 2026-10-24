'use strict';

const { test, expect } = require('@playwright/test');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');
const { activateTab, selectReplicateMode, clickExampleButton } = require('../helpers/uiDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer, parseWorkspaceArchive } = require('../helpers/archiveDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

const COMPONENTS = COMPONENT_CATALOG.filter(component => ['box', 'scatter', 'line', 'pca'].includes(component.type));

async function readOwner(page, type) {
  return page.evaluate(async componentType => {
    const tab = window.Main.session.getActiveTab();
    const component = window.Components[componentType];
    const ready = await component.awaitReadyForSnapshot({ tab, tabId: tab.id, reason: 'mixed-format-reopen-check', timeoutMs: 20000 });
    if (ready?.ok === false) throw new Error(`${componentType}: owner did not settle (${ready.reason})`);
    const payload = component.getPayload({ tab, tabId: tab.id, reason: 'mixed-format-reopen-check' });
    const root = window.Shared.workspaceTabs.getMountedRoot(tab.id, componentType);
    const config = payload.config;
    const grouped = config.grouped || {};
    // Spare blank grid rows/columns are not observations. Keep every nonempty
    // header and cell, including headers of otherwise empty groups.
    const data = payload.data.map(row => row.map(value => value ?? ''));
    while (data.length && data[data.length - 1].every(value => value === '')) data.pop();
    const width = data.reduce((maximum, row) => Math.max(maximum, row.reduce((last, value, index) => value === '' ? last : index + 1, 0)), 0);
    return {
      data: data.map(row => Array.from({ length: width }, (_, index) => row[index] ?? '')),
      format: config.tableFormat,
      visibleFormat: root.querySelector('[data-replicate-select]').value,
      replicates: config.replicates ?? grouped.replicatesPerGroup,
      xReplicates: config.xReplicates ?? false,
      groups: config.groupLabels || grouped.groups || grouped.names || [],
      conditions: grouped.conditions || [],
      sampleLabels: grouped.sampleLabels || [],
      shapes: config.groupShapes || []
    };
  }, type);
}

for (const component of COMPONENTS) {
  test(`${component.type}: single and grouped owners stay isolated through legacy hydration and archive reopen`, async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const issues = registerIssueCollectors(page);
    const failures = [];
    const observations = [];
    const checkOwner = async (phase, expected) => {
      const actual = await readOwner(page, component.type);
      observations.push({ phase, expected, actual });
      const fields = Object.keys(expected).filter(key => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));
      if (fields.length) failures.push({ phase, format: expected.format, fields });
    };
    await installLocalCdnOverrides(page);
    await page.goto('/index.html');
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    const single = await readOwner(page, component.type);
    expect(single.format).toBe(component.type === 'pca' ? 'standard' : 'single');
    const legacySingle = await page.evaluate(type => {
      const tab = window.Main.session.getActiveTab();
      tab.title = `mixed-${type}-single`;
      const payload = JSON.parse(JSON.stringify(window.Components[type].getPayload({ tab, tabId: tab.id })));
      delete payload.config.groupLabels;
      delete payload.config.groupShapes;
      if (payload.config.grouped) {
        delete payload.config.grouped.groups;
        delete payload.config.grouped.conditions;
        delete payload.config.grouped.names;
        delete payload.config.grouped.sampleLabels;
      }
      return { id: tab.id, payload };
    }, component.type);

    await openComponentFromWelcome(page, component);
    await selectReplicateMode(page, component, 'grouped');
    await clickExampleButton(page, component);
    const grouped = await readOwner(page, component.type);
    expect(grouped.format).toBe('grouped');
    expect(grouped.visibleFormat).toBe('grouped');
    const groupedId = await page.evaluate(type => {
      const tab = window.Main.session.getActiveTab();
      tab.title = `mixed-${type}-grouped`;
      return tab.id;
    }, component.type);

    await activateTab(page, legacySingle.id, component, { requireMountedRoot: true });
    await page.evaluate(async ({ type, payload }) => {
      const tab = window.Main.session.getActiveTab();
      const component = window.Components[type];
      const loaded = await component.loadFromPayload(payload, { tab, tabId: tab.id, source: 'mixed-format-legacy-reopen' });
      if (loaded === false) throw new Error(`${type}: legacy hydration was rejected`);
    }, { type: component.type, payload: legacySingle.payload });
    await checkOwner('legacy-single-hydration', single);

    const assertPair = async (ids, phase) => {
      const sequence = [[ids.grouped, grouped], [ids.single, single], [ids.grouped, grouped], [ids.single, single]];
      for (const [index, [id, expected]] of sequence.entries()) {
        await activateTab(page, id, component, { requireMountedRoot: true });
        await checkOwner(`${phase}-${index + 1}`, expected);
      }
    };
    await assertPair({ single: legacySingle.id, grouped: groupedId }, 'switch');
    await activateTab(page, groupedId, component, { requireMountedRoot: true });
    const archive = await buildWorkspaceArchive(page, { useWorker: false });
    const parsed = await parseWorkspaceArchive(page, archive.base64);
    await testInfo.attach('mixed-format-archive-state.json', {
      body: Buffer.from(JSON.stringify(parsed.session, null, 2)),
      contentType: 'application/json'
    });
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: component.type });
    await waitForDocumentOpenComplete(page);
    const ids = await page.evaluate(type => {
      const tabs = window.Main.session.workspaceState.tabs;
      return {
        single: tabs.find(tab => tab.title === `mixed-${type}-single`)?.id,
        grouped: tabs.find(tab => tab.title === `mixed-${type}-grouped`)?.id
      };
    }, component.type);
    expect(ids.single).toBeTruthy();
    expect(ids.grouped).toBeTruthy();
    expect(ids.single).not.toBe(ids.grouped);
    await assertPair(ids, 'reopen-switch');
    await testInfo.attach('mixed-format-owner-state.json', {
      body: Buffer.from(JSON.stringify({ single, grouped, restoredIds: ids, observations, failures }, null, 2)),
      contentType: 'application/json'
    });
    expect(failures).toEqual([]);
    expect(issues.critical).toEqual([]);
  });

  if (component.type === 'box' || component.type === 'line') {
    test(`${component.type}: a grouped-only archive keeps its original headers and labels`, async ({ page }, testInfo) => {
      test.setTimeout(120000);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html');
      await openComponentFromWelcome(page, component, { first: true });
      await selectReplicateMode(page, component, 'grouped');
      await clickExampleButton(page, component);
      const expected = await readOwner(page, component.type);
      const archive = await buildWorkspaceArchive(page, { useWorker: false });
      const parsed = await parseWorkspaceArchive(page, archive.base64);
      await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: component.type });
      await waitForDocumentOpenComplete(page);
      const actual = await readOwner(page, component.type);
      await testInfo.attach('grouped-only-owner-state.json', {
        body: Buffer.from(JSON.stringify({ expected, actual, archive: parsed.session }, null, 2)),
        contentType: 'application/json'
      });
      const fields = Object.keys(expected).filter(key => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));
      expect(fields).toEqual([]);
    });
  }
}
