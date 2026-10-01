'use strict';

const { createPayloadTabForSession, registerSessionAssignTabPayloadFixture } = require('../../test-support/sessionAssignTabPayloadTestSetup');

describe('session.assignTabPayload: assignment guards', () => {

  let session;

  registerSessionAssignTabPayloadFixture(value => { session = value; });

  const createTabWithPayload = () => createPayloadTabForSession(session);

  test('refuses to overwrite a populated payload with null when reason is recovery-interval', () => {
    const tab = createTabWithPayload();
    const beforeData = tab.payload.data;
    const beforeSig = tab.payloadSignature;

    const changed = session.assignTabPayload(tab, null, { reason: 'recovery-interval' });

    expect(changed).toBe(false);
    expect(tab.payload?.data).toBe(beforeData);
    expect(tab.payloadSignature).toBe(beforeSig);
  });

  test('refuses to overwrite a populated payload with null when reason is archive-save', () => {
    const tab = createTabWithPayload();
    const before = tab.payload;
    session.assignTabPayload(tab, null, { reason: 'archive-save' });
    expect(tab.payload).toBe(before);
  });

  test('allows null overwrite when reason is graph-selection-reset (user picks a new graph type)', () => {
    const tab = createTabWithPayload();
    const changed = session.assignTabPayload(tab, null, { reason: 'graph-selection-reset' });
    expect(changed).toBe(true);
    expect(tab.payload).toBeNull();
  });

  test('allows null overwrite when meta.allowClear is true', () => {
    const tab = createTabWithPayload();
    session.assignTabPayload(tab, null, { reason: 'something-else', allowClear: true });
    expect(tab.payload).toBeNull();
  });

  test('allows null overwrite when there was no prior payload', () => {
    const tab = session.createTab({ title: 'Empty', type: 'box', payload: null });
    session.workspaceState.tabs.push(tab);
    const changed = session.assignTabPayload(tab, null, { reason: 'recovery-interval' });
    // No change because previous was null and new is null — but the call itself is
    // not refused. The guard only fires when there's something to protect.
    expect(changed).toBe(false);
    expect(tab.payload).toBeNull();
  });

  test('a real payload always replaces the prior payload', () => {
    const tab = createTabWithPayload();
    const next = { type: 'box', data: [['A'], [42]], config: { foo: 'bar' } };
    const changed = session.assignTabPayload(tab, next, { reason: 'recovery-interval' });
    expect(changed).toBe(true);
    expect(tab.payload.data).toEqual([['A'], [42]]);
  });

  test('every component clears a stale preview when its assigned payload is not renderable', () => {
    const componentTypes = ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'];
    window.Main.components = { registry: {} };
    window.Main.previews = { clearTabPreview: jest.fn(tab => {
      tab.previewMarkup = null;
      tab.previewSignature = null;
      tab.previewMeta = null;
      return true;
    }) };
    componentTypes.forEach(type => {
      window.Main.components.registry[type] = { hasRenderablePayload: jest.fn(() => false) };
      const tab = session.createTab({
        title: type,
        type,
        payload: { type, data: [['old'], [1]] },
        previewMarkup: '<svg></svg>',
        previewSignature: 'old',
        previewMeta: { format: 'svg' }
      });
      session.workspaceState.tabs.push(tab);
      session.assignTabPayload(tab, { type, data: [[''], ['']] }, { reason: 'user-cleared-data' });
      expect(tab.previewMarkup).toBeNull();
      expect(tab.previewSignature).toBeNull();
      expect(tab.previewMeta).toBeNull();
      expect(tab.previewSuppressedSignature).toBe(tab.payloadSignature);
    });
    expect(window.Main.previews.clearTabPreview).toHaveBeenCalledTimes(componentTypes.length);
  });

});
