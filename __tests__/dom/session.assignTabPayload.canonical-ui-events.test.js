'use strict';

const { createPayloadTabForSession, makeTrustedEvent, registerSessionAssignTabPayloadFixture } = require('../../test-support/sessionAssignTabPayloadTestSetup');

describe('session.assignTabPayload: canonical UI events', () => {

  let session;

  registerSessionAssignTabPayloadFixture(value => { session = value; });

  const createTabWithPayload = () => createPayloadTabForSession(session);

  test('global user-input listener promotes trusted change events on workspace controls into markActiveTabUserModified', () => {
    // Architectural guarantee: a single document-level listener catches every
    // user-trusted input/change inside a workspace component DOM root and marks
    // the active tab dirty. This obviates per-component-per-control wiring.
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    // Build a workspace container with an input inside.
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    const input = document.createElement('input');
    input.id = 'someBoxControl';
    root.appendChild(input);
    document.body.appendChild(root);
    try {
      // Construct a trusted change event. JSDOM marks dispatched events as
      // isTrusted=false, so we override with a getter that returns true to
      // simulate a real user input.
      input.dispatchEvent(makeTrustedEvent('change', input));
      expect(tab.userModified).toBe(true);
      expect(tab.payloadDirty).toBe(true);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('global user-input listener does not treat focusout as a content edit', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    const input = document.createElement('input');
    root.appendChild(input);
    document.body.appendChild(root);
    try {
      input.dispatchEvent(makeTrustedEvent('focusout', input));
      expect(tab.userModified).toBe(false);
      expect(tab.payloadDirty).toBe(false);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('canonical capture runs after change, input, and click handlers', async () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const select = document.createElement('select');
    ['strip', 'box', 'violin'].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      select.appendChild(option);
    });
    const input = document.createElement('input');
    const button = document.createElement('button');
    button.type = 'button';
    root.append(select, input, button);
    document.body.appendChild(root);
    let canonicalValue = 'strip';
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({
            type: 'box',
            data: [['A'], [1]],
            config: { graphType: canonicalValue }
          }))
        }
      }
    };
    window.Main.documentState = {
      persistCanonicalJournalNow: jest.fn(() => true)
    };
    select.value = 'strip';
    input.value = '2d';
    select.addEventListener('change', () => { canonicalValue = 'box'; });
    input.addEventListener('input', () => { canonicalValue = '3d'; });
    button.addEventListener('click', () => { canonicalValue = 'violin'; });
    try {
      select.dispatchEvent(makeTrustedEvent('change', select));
      await session.flushCanonicalUserMutationState();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(window.Main.documentState.persistCanonicalJournalNow).toHaveBeenCalledWith(
        expect.objectContaining({ tabId: tab.id, reason: 'control-change' })
      );
      expect(tab.payload.config.graphType).toBe('box');

      input.dispatchEvent(makeTrustedEvent('input', input));
      await session.flushCanonicalUserMutationState();
      expect(tab.payload.config.graphType).toBe('3d');

      button.dispatchEvent(makeTrustedEvent('click', button));
      await session.flushCanonicalUserMutationState();
      expect(tab.payload.config.graphType).toBe('violin');
    } finally {
      document.body.removeChild(root);
    }
  });

  test('select input cannot project the old value before its following change event', async () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const select = document.createElement('select');
    ['strip', 'box'].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      select.appendChild(option);
    });
    root.appendChild(select);
    document.body.appendChild(root);
    let canonicalValue = 'strip';
    const getPayload = jest.fn(() => {
      // A real component projects its canonical session value while taking
      // a capture. This exposes a stale capture that runs between input and
      // change: it puts the select back on the old option.
      select.value = canonicalValue;
      return {
        type: 'box',
        data: [['A'], [1]],
        config: { graphType: canonicalValue }
      };
    });
    window.Main.components = {
      registry: {
        box: { getPayload }
      }
    };
    select.value = 'strip';
    select.addEventListener('change', () => {
      canonicalValue = select.value;
    });
    try {
      select.value = 'box';
      select.dispatchEvent(makeTrustedEvent('input', select));
      await Promise.resolve();
      expect(getPayload).not.toHaveBeenCalled();
      select.dispatchEvent(makeTrustedEvent('change', select));
      expect(select.value).toBe('box');
      expect(canonicalValue).toBe('box');
      await session.flushCanonicalUserMutationState();
      expect(getPayload).toHaveBeenCalled();
      expect(select.value).toBe('box');
      expect(tab.payload.config.graphType).toBe('box');
    } finally {
      document.body.removeChild(root);
    }
  });

  test('checkbox input cannot restore the old value before its following change event', async () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    root.appendChild(checkbox);
    document.body.appendChild(root);
    let canonicalChecked = true;
    const getPayload = jest.fn(() => {
      // Components project canonical state while capturing. If this runs after
      // input but before change, it changes a real unchecked checkbox back to
      // checked and the component never receives the requested value.
      checkbox.checked = canonicalChecked;
      return {
        type: 'box',
        data: [['A'], [1]],
        config: { showLegend: canonicalChecked }
      };
    });
    window.Main.components = { registry: { box: { getPayload } } };
    checkbox.addEventListener('change', () => {
      canonicalChecked = checkbox.checked;
    });
    try {
      checkbox.checked = false;
      checkbox.dispatchEvent(makeTrustedEvent('input', checkbox));
      await Promise.resolve();
      expect(getPayload).not.toHaveBeenCalled();
      expect(checkbox.checked).toBe(false);

      checkbox.dispatchEvent(makeTrustedEvent('change', checkbox));
      expect(canonicalChecked).toBe(false);
      await session.flushCanonicalUserMutationState();
      expect(getPayload).toHaveBeenCalled();
      expect(checkbox.checked).toBe(false);
      expect(tab.payload.config.showLegend).toBe(false);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('canonical capture still runs when a control stops event propagation', async () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const select = document.createElement('select');
    ['strip', 'box'].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      select.appendChild(option);
    });
    root.appendChild(select);
    document.body.appendChild(root);
    let canonicalValue = 'strip';
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({
            type: 'box',
            data: [['A'], [1]],
            config: { graphType: canonicalValue }
          }))
        }
      }
    };
    select.addEventListener('change', event => {
      canonicalValue = 'box';
      event.stopPropagation();
    });
    try {
      select.dispatchEvent(makeTrustedEvent('change', select));
      await session.flushCanonicalUserMutationState();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(tab.payload.config.graphType).toBe('box');
    } finally {
      document.body.removeChild(root);
    }
  });

  test('global user-input listener ignores untrusted (programmatic) events', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    const input = document.createElement('input');
    root.appendChild(input);
    document.body.appendChild(root);
    try {
      // Default-dispatched event has isTrusted=false in jsdom — exactly the case
      // we must NOT mark dirty (lifecycle/setup code synthetically dispatches these).
      input.dispatchEvent(new Event('change', { bubbles: true }));
      expect(tab.userModified).toBe(false);
      expect(tab.payloadDirty).toBe(false);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('global user-input listener releases restore-time draw/layout suppressions for the owning component tab', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    window.Shared.componentLifecycle = window.Shared.componentLifecycle || {};
    window.Shared.componentLayout = window.Shared.componentLayout || {};
    window.Shared.componentLifecycle.clearPostRestoreDrawSuppression = jest.fn();
    window.Shared.componentLayout.releaseSuppressedSchedulesFor = jest.fn();
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'boxActionButton';
    root.appendChild(button);
    document.body.appendChild(root);
    try {
      button.dispatchEvent(makeTrustedEvent('click', button));
      expect(tab.userModified).toBe(true);
      expect(tab.payloadDirty).toBe(true);
      expect(window.Shared.componentLifecycle.clearPostRestoreDrawSuppression)
        .toHaveBeenCalledWith('box', expect.objectContaining({ tabId: tab.id }));
      expect(window.Shared.componentLayout.releaseSuppressedSchedulesFor)
        .toHaveBeenCalledWith('box', expect.objectContaining({ tabId: tab.id }));
    } finally {
      document.body.removeChild(root);
    }
  });

  test('global user-input listener ignores events outside workspace component roots', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    // Put the input OUTSIDE any [data-workspace-component] container.
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      input.dispatchEvent(makeTrustedEvent('change', input));
      expect(tab.userModified).toBe(false);
      expect(tab.payloadDirty).toBe(false);
    } finally {
      document.body.removeChild(input);
    }
  });

  test('global user-input listener ignores autosave document control events inside workspace roots', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'line');
    const autosave = document.createElement('input');
    autosave.type = 'checkbox';
    autosave.setAttribute('data-document-autosave', '1');
    root.appendChild(autosave);
    document.body.appendChild(root);
    try {
      autosave.dispatchEvent(makeTrustedEvent('change', autosave));
      expect(tab.userModified).toBe(false);
      expect(tab.payloadDirty).toBe(false);
      expect(session.workspaceState.sessionUserDirty).toBe(false);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('undo state-change records mark the active payload dirty for recovery', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.sessionUserDirty = false;
    require('../../js/shared/undo.js');

    const recorded = window.Shared.undoManager.recordStateChange({
      label: 'box:shape-style:0',
      scope: 'boxGraphPanel',
      from: '#000000',
      to: '#ff0000',
      apply: () => true
    });

    expect(recorded).toBe(true);
    expect(tab.userModified).toBe(true);
    expect(tab.payloadDirty).toBe(true);
    expect(tab.payloadDirtyReason).toBe('box:shape-style:0');
    expect(session.workspaceState.sessionUserDirty).toBe(true);
  });

  test('shared color picker overlay marks the source workspace target dirty even with synthetic events', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.sessionUserDirty = false;
    require('../../js/shared/colorPicker.js');
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'heatmap');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#000000';
    root.appendChild(input);
    document.body.appendChild(root);
    try {
      const overlay = window.Shared.openColorPicker({
        anchor: input,
        element: input
      });
      expect(overlay).toBeTruthy();
      overlay.targetEl.onOverlayInput('#ff0000', {});
      expect(tab.userModified).toBe(true);
      expect(tab.payloadDirty).toBe(true);
      expect(tab.payloadDirtyReason).toBe('color-picker-input');
      expect(session.workspaceState.sessionUserDirty).toBe(true);
    } finally {
      document.body.removeChild(root);
    }
  });

});
