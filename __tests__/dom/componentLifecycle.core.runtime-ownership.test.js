'use strict';
const path = require('node:path');
const { findFunctions, findNodes, memberPath, readScriptAst } = require('../../test-support/sourceAst');
let lc;

describe('componentLifecycle — createRuntimeOwner', () => {
  let tabs;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    tabs = [
      { id: 'tab-a', type: 'box' },
      { id: 'tab-b', type: 'box' }
    ];
    window.Main = {
      session: {
        workspaceState: { tabs },
        getActiveTab: () => tabs[0]
      },
      components: { registry: {} }
    };
    require('../../js/shared/componentLifecycle.js');
    require('../../js/shared/workspaceTabs.js');
    lc = window.Shared.componentLifecycle;
  });

  test('capture stores an owned snapshot in workspace and session runtime', () => {
    const owner = lc.createRuntimeOwner('box');
    const stored = owner.capture({ stats: { ready: true } }, { tabId: 'tab-a', reason: 'unit-capture' });
    const runtime = window.Shared.workspaceTabs.getSessionRuntime('tab-a', 'box');

    expect(stored.__runtimeOwner).toMatchObject({ componentKey: 'box', tabId: 'tab-a' });
    expect(runtime.componentRuntimeSnapshot).toBeUndefined();
    expect(runtime.runtimeOwner).toBeUndefined();
    expect(runtime.lifecycle.snapshot).toEqual(stored);
    expect(window.Shared.workspaceTabs.getLifecycleRuntimeSnapshot('tab-a', 'box')).toEqual(stored);
    expect(window.Shared.workspaceTabs.getRuntimeSnapshot('tab-a', '__workspaceTabs__:box')).toEqual(stored);
  });

  test('legacy workspace runtime snapshots are migrated into lifecycle runtime on read', () => {
    const legacy = {
      componentKey: 'box',
      tabId: 'tab-a',
      __runtimeOwner: { componentKey: 'box', tabId: 'tab-a' }
    };
    tabs[0].sharedState = { runtime: { '__workspaceTabs__:box': legacy } };

    expect(window.Shared.workspaceTabs.getRuntimeSnapshot('tab-a', '__workspaceTabs__:box')).toEqual(legacy);
    expect(tabs[0].sharedState.runtime['__workspaceTabs__:box']).toBeUndefined();
    expect(window.Shared.workspaceTabs.getLifecycleRuntimeSnapshot('tab-a', 'box')).toEqual(legacy);
  });

  test('bind rejects snapshots owned by another tab', () => {
    const owner = lc.createRuntimeOwner('box');
    const stored = owner.capture({ stats: { ready: true } }, { tabId: 'tab-a', reason: 'unit-capture' });

    expect(() => owner.bind(stored, {
      tabId: 'tab-b',
      strictRuntimeOwner: true,
      reason: 'cross-tab-bind'
    })).toThrow(/rejected mismatched snapshot/);
  });

  test('missing tab identity is rejected in strict mode', () => {
    const owner = lc.createRuntimeOwner('box');
    expect(() => owner.capture({ stats: { ready: true } }, {
      strictRuntimeOwner: true,
      reason: 'missing-tab'
    })).toThrow(/missing tab id/);
  });

  test('component runtime snapshot helpers do not return unowned raw snapshots', () => {
    const snapshot = { stats: { ready: true } };

    expect(() => lc.rememberComponentRuntimeSnapshot('box', snapshot, {
      strictRuntimeOwner: true,
      reason: 'unit-remember-missing-tab'
    })).toThrow(/missing tab id/);
    expect(() => lc.resolveComponentRuntimeSnapshot('box', snapshot, {
      strictRuntimeOwner: true,
      reason: 'unit-resolve-missing-tab'
    })).toThrow(/requires explicit tab id/);
  });


  test('runtime snapshot helpers honor an explicit component key for unattached component objects', () => {
    const unattachedComponent = {};
    const snapshot = { stats: { ready: true } };
    const stored = lc.rememberComponentRuntimeSnapshot(unattachedComponent, snapshot, {
      componentKey: 'box',
      tabId: 'tab-a',
      reason: 'unit-unattached-component'
    });

    expect(stored.__runtimeOwner).toMatchObject({ componentKey: 'box', tabId: 'tab-a' });
    expect(lc.getComponentRuntimeSnapshot(unattachedComponent, {
      componentKey: 'box',
      tabId: 'tab-a'
    })).toEqual(stored);
  });

  test('dispose removes both normalized snapshots and owned runtime records', () => {
    const owner = lc.createRuntimeOwner('box');
    owner.capture({ stats: { ready: true } }, { tabId: 'tab-a', reason: 'unit-capture' });
    const runtime = window.Shared.workspaceTabs.getSessionRuntime('tab-a', 'box');
    window.Shared.workspaceTabs.setOwnedRuntimeRecord('tab-a', 'box', { hydrated: true });

    expect(owner.dispose('tab-a', { reason: 'unit-dispose' })).toBe(true);
    expect(runtime.componentRuntimeSnapshot).toBeUndefined();
    expect(runtime.runtimeOwner).toBeUndefined();
    expect(window.Shared.workspaceTabs.getOwnedRuntimeRecord('tab-a', 'box')).toBeNull();
    expect(window.Shared.workspaceTabs.getRuntimeSnapshot('tab-a', '__workspaceTabs__:box')).toBeNull();
  });

  test('owned runtime record lookup does not create a default record', () => {
    const runtime = window.Shared.workspaceTabs.getSessionRuntime('tab-a', 'box');

    expect(window.Shared.workspaceTabs.getOwnedRuntimeRecord('tab-a', 'box')).toBeNull();
    expect(runtime.lifecycle?.ownedRecord).toBeUndefined();
  });

  test('runtime owner owns record creation, normalization, and storage', () => {
    const owner = lc.createRuntimeOwner('box', {
      createDefaultRecord: tabId => ({ version: 1, componentKey: 'box', tabId, hydrated: false, controls: {} }),
      normalizeRecord: record => {
        record.controls = record.controls && typeof record.controls === 'object' ? record.controls : {};
        record.normalized = true;
        return record;
      }
    });
    const runtime = window.Shared.workspaceTabs.getSessionRuntime('tab-a', 'box');

    const record = owner.ensureRecord('tab-a', { reason: 'unit-ensure-record' }, { create: true });

    expect(record).toBeTruthy();
    expect(record).toMatchObject({ componentKey: 'box', tabId: 'tab-a', normalized: true });
    expect(record.__runtimeOwner).toMatchObject({ componentKey: 'box', tabId: 'tab-a' });
    expect(runtime.lifecycle.ownedRecord).toBe(record);
  });

  test('runtime owner rejects wrong-tab owned records', () => {
    const owner = lc.createRuntimeOwner('box', {
      createDefaultRecord: tabId => ({ version: 1, componentKey: 'box', tabId, hydrated: true })
    });
    const record = owner.ensureRecord('tab-a', { reason: 'unit-ensure-record' }, { create: true });

    expect(() => owner.setRecord('tab-b', record, {
      strictRuntimeOwner: true,
      reason: 'unit-wrong-tab-record'
    })).toThrow(/record rejected|owner mismatch/);
  });

  test('owned runtime APIs do not fall back to the active tab', () => {
    const owner = lc.createRuntimeOwner('box', {
      createDefaultRecord: tabId => ({ version: 1, componentKey: 'box', tabId, hydrated: true })
    });

    expect(() => owner.ensureRecord(null, {
      strictRuntimeOwner: true,
      reason: 'unit-missing-tab-record'
    }, { create: true })).toThrow(/missing tab id/);
    expect(() => window.Shared.workspaceTabs.getOwnedRuntimeRecord(null, 'box', {
      strictRuntimeOwner: true,
      reason: 'unit-missing-tab-direct-read'
    })).toThrow(/requires explicit tab/);
  });

  test('session and state-model runtime paths do not fall back to the active tab', () => {
    const stateModel = lc.createStateModel('box');

    expect(() => window.Shared.workspaceTabs.getSessionRecord(null, 'box', {
      strictRuntimeOwner: true,
      reason: 'unit-missing-session-record'
    })).toThrow(/requires explicit tab/);
    expect(() => stateModel.set(null, 'runtime', { leaked: true }, {
      strictRuntimeOwner: true,
      reason: 'unit-missing-state-model'
    })).toThrow(/explicit tab id/);
    expect(tabs[0].sharedState).toBeUndefined();
  });

  test('component frame and timeout schedulers require explicit tab identity', () => {
    const component = { __componentKey: 'box', __boundTabId: 'tab-a' };

    expect(() => lc.scheduleComponentFrame(component, 'box', {
      strictRuntimeOwner: true,
      reason: 'unit-frame-missing-tab'
    }, jest.fn())).toThrow(/explicit tab id/);
    expect(() => lc.scheduleComponentTimeout(component, 'box', {
      strictRuntimeOwner: true,
      reason: 'unit-timeout-missing-tab'
    }, jest.fn(), 0)).toThrow(/explicit tab id/);
  });

  test('workspace runtime capture/apply require explicit tab identity', () => {
    const config = {
      type: 'box',
      captureRuntimeState: () => ({ state: { ready: true } }),
      applyRuntimeState: jest.fn()
    };

    expect(() => window.Shared.workspaceTabs.captureRuntimeState(null, 'box', config, {
      strictRuntimeOwner: true,
      reason: 'unit-capture-missing-tab'
    })).toThrow(/requires explicit tab/);
    expect(() => window.Shared.workspaceTabs.applyRuntimeState(null, 'box', config, {
      strictRuntimeOwner: true,
      reason: 'unit-apply-missing-tab'
    })).toThrow(/requires explicit tab/);
    expect(tabs[0].sharedState).toBeUndefined();
  });

  test('tab-scoped schedulers require explicit tab identity by default', () => {
    const scheduler = window.Shared.workspaceTabs.createTabScopedScheduler({
      componentKey: 'box',
      scheduleRaw: jest.fn()
    });

    expect(() => scheduler({
      strictRuntimeOwner: true,
      reason: 'unit-tab-scheduler-missing-tab'
    })).toThrow(/requires explicit tab/);
  });

  test('tab-scoped schedulers may use a component-owned bound tab resolver, not the active tab', () => {
    const scheduleRaw = jest.fn();
    window.Shared.workspaceTabs.ensureActiveSession('tab-b', 'box', { reason: 'unit-tab-b-activate' });
    const scheduler = window.Shared.workspaceTabs.createTabScopedScheduler({
      componentKey: 'box',
      getTabId: () => 'tab-b',
      scheduleRaw
    });

    expect(scheduler({ reason: 'unit-bound-tab-schedule' })).toBe(true);
    expect(scheduleRaw).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'tab-b',
      reason: 'unit-bound-tab-schedule'
    }));
  });

  test('runtime sanitization preserves indexed sparse metadata and repeated durable references', () => {
    const sharedColumn = { key: 'p', label: 'p value' };
    const metaRow = new Array(5);
    metaRow[4] = { pValueRaw: 0.0277, pValueOperator: '=' };
    const source = {
      firstColumn: sharedColumn,
      secondColumn: sharedColumn,
      cellMetaRows: [metaRow]
    };
    source.self = source;

    const sanitized = lc.sanitizeRuntimeSnapshot(source, {
      componentKey: 'roc',
      tabId: 'tab-a',
      reason: 'unit-indexed-runtime-sanitize'
    });

    expect(sanitized.firstColumn).toEqual(sharedColumn);
    expect(sanitized.secondColumn).toEqual(sharedColumn);
    expect(sanitized.firstColumn).not.toBe(sanitized.secondColumn);
    expect(sanitized.cellMetaRows[0]).toEqual([
      null,
      null,
      null,
      null,
      { pValueRaw: 0.0277, pValueOperator: '=' }
    ]);
    expect(sanitized).not.toHaveProperty('self');
  });

  test('internal state bridge preserves sparse indexed models and repeated aliases', () => {
    const shared = { key: 'comparison', label: 'Comparison' };
    const metaRow = new Array(5);
    metaRow[4] = { pValueRaw: 0.01 };
    const state = {
      first: shared,
      second: shared,
      cellMetaRows: [metaRow]
    };
    const component = { __componentKey: 'survival' };
    const bridge = lc.installInternalStateBridge(component, {
      componentKey: 'survival',
      targets: [{ key: 'state', get: () => state }]
    });

    const snapshot = bridge.capture({ tabId: 'tab-a', reason: 'unit-internal-structure-fidelity' });
    expect(snapshot.targets.state.first).toEqual(shared);
    expect(snapshot.targets.state.second).toEqual(shared);
    expect(snapshot.targets.state.cellMetaRows[0]).toEqual([
      null,
      null,
      null,
      null,
      { pValueRaw: 0.01 }
    ]);

    state.first = { key: 'changed' };
    state.second = { key: 'changed-again' };
    state.cellMetaRows = [[{ pValueRaw: 0.99 }]];
    expect(bridge.apply(snapshot, { tabId: 'tab-a', reason: 'unit-internal-structure-fidelity-apply' })).toBe(true);
    expect(state.first).toEqual(shared);
    expect(state.second).toEqual(shared);
    expect(state.cellMetaRows[0]).toEqual([
      null,
      null,
      null,
      null,
      { pValueRaw: 0.01 }
    ]);
  });

  test('runtime owner strips transient in-flight work from durable snapshots', () => {
    const owner = lc.createRuntimeOwner('box');
    const dirtySnapshot = {
      state: {
        axis: { x: 1, y: 2 },
        drawToken: 17,
        rotationPending: true,
        rotationPendingLogged: true,
        statsComputationPending: true,
        pendingDrawOptions: { reason: 'stale-redraw' },
        nested: {
          keep: 'durable',
          pendingWorker: { id: 1 },
          timeoutId: 42
        }
      },
      stats: { pValue: 0.01 },
      controller: { abort: jest.fn() },
      worker: { terminate: jest.fn() },
      pendingPromise: Promise.resolve('late')
    };

    const stored = owner.capture(dirtySnapshot, { tabId: 'tab-a', reason: 'unit-transient-snapshot' });

    expect(stored.state.axis).toEqual({ x: 1, y: 2 });
    expect(stored.state.nested).toEqual({ keep: 'durable' });
    expect(stored.stats).toEqual({ pValue: 0.01 });
    expect(stored.__runtimeOwner).toMatchObject({ componentKey: 'box', tabId: 'tab-a' });
    expect(JSON.stringify(stored)).not.toMatch(/drawToken|rotationPending|statsComputationPending|pendingDrawOptions|pendingWorker|timeoutId|controller|worker|pendingPromise/);
    expect(dirtySnapshot.state.drawToken).toBe(17);
  });

  test('workspace runtime capture stores only sanitized durable state', () => {
    const tab = tabs[0];
    const config = {
      type: 'box',
      captureRuntimeState: () => ({
        state: {
          selectedColumnIds: ['A', 'B'],
          drawInProgress: true,
          drawToken: 9,
          asyncState: { tabId: 'tab-a' }
        },
        cache: {
          summary: { rows: 2 },
          pendingRequests: ['worker-1']
        },
        pendingDrawOpts: { reason: 'hidden-tab' },
        signal: { aborted: false }
      })
    };

    const captured = window.Shared.workspaceTabs.captureRuntimeState(tab, 'box', config, {
      reason: 'unit-workspace-runtime-capture'
    });
    const stored = window.Shared.workspaceTabs.getLifecycleRuntimeSnapshot(tab, 'box');

    expect(captured).toMatchObject({
      state: { selectedColumnIds: ['A', 'B'] },
      cache: { summary: { rows: 2 } }
    });
    expect(stored).toEqual(captured);
    expect(JSON.stringify(stored)).not.toMatch(/drawInProgress|drawToken|asyncState|pendingRequests|pendingDrawOpts|signal/);
  });
});

describe('component async scheduling contract', () => {
  test('components and main registry do not use the legacy global debounceFrame scheduler', () => {
    const fs = require('fs');
    const path = require('path');
    const roots = [
      path.join(__dirname, '..', '..', 'js', 'components'),
      path.join(__dirname, '..', '..', 'js', 'main')
    ];
    const files = [];
    function collect(dir){
      for(const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if(entry.isDirectory()){
          collect(full);
        }else if(entry.isFile() && entry.name.endsWith('.js')){
          files.push(full);
        }
      }
    }
    roots.forEach(collect);
    const offenders = files.filter(file => findNodes(readScriptAst(file), node => (
      node.type === 'MemberExpression' && memberPath(node) === 'Shared.debounceFrame'
    )).length > 0);
    expect(offenders.map(file => path.relative(path.join(__dirname, '..', '..'), file))).toEqual([]);
  });

  test('shared controls do not keep mutable unowned fallback state stores', () => {
    const checked = [
      path.join(__dirname, '..', '..', 'js', 'shared', 'fontControls.js'),
      path.join(__dirname, '..', '..', 'js', 'shared', 'workspaceToolbar.js')
    ];
    checked.forEach(file => {
      const ast = readScriptAst(file);
      expect(findNodes(ast, node => (
        (node.type === 'Identifier' && node.name === 'UNOWNED_STATE')
        || (node.type === 'Literal' && node.value === 'UNOWNED_STATE')
      ))).toHaveLength(0);
    });
  });

  test('componentLayout tab-state control sync does not fall back to the active tab', () => {
    const ast = readScriptAst(path.join(__dirname, '..', '..', 'js', 'shared', 'componentLayout.js'));
    const syncFunction = findFunctions(ast, 'syncTabStateToControlsFor')[0];
    expect(syncFunction).toBeDefined();
    expect(findNodes(syncFunction, node => (
      node.type === 'IfStatement'
      && node.test?.type === 'UnaryExpression'
      && node.test.operator === '!'
      && node.test.argument?.type === 'Identifier'
      && node.test.argument.name === 'tabId'
    ))).not.toHaveLength(0);
    expect(findNodes(syncFunction, node => (
      node.type === 'CallExpression'
      && (memberPath(node.callee) === 'resolveTab' || memberPath(node.callee)?.endsWith('.resolveTab'))
      && node.arguments.some(argument => argument.type === 'Literal' && argument.value === null)
    ))).toHaveLength(0);
  });


  test('component runtime capture helpers do not persist unowned raw snapshots', () => {
    const files = [
      path.join(__dirname, '..', '..', 'js', 'components', 'box.js'),
      path.join(__dirname, '..', '..', 'js', 'components', 'scatter.js'),
      path.join(__dirname, '..', '..', 'js', 'components', 'pca.js'),
      path.join(__dirname, '..', '..', 'js', 'components', 'line.js')
    ];
    files.forEach(file => {
      const ast = readScriptAst(file);
      expect(findNodes(ast, node => (
        node.type === 'LogicalExpression'
        && node.operator === '||'
        && node.right?.type === 'Identifier'
        && node.right.name === 'snapshot'
        && findNodes(node.left, child => child.type === 'CallExpression'
          && memberPath(child.callee)?.endsWith('.rememberComponentRuntimeSnapshot')).length > 0
      ))).toHaveLength(0);
      expect(findNodes(ast, node => (
        node.type === 'ConditionalExpression'
        && node.test?.type === 'UnaryExpression'
        && node.test.operator === '!'
        && memberPath(node.test.argument) === 'Shared.componentLifecycle'
        && node.consequent?.type === 'Identifier'
        && node.consequent.name === 'snapshot'
        && node.alternate?.type === 'Literal'
        && node.alternate.value === null
      ))).not.toHaveLength(0);
    });
  });
});

describe('workspaceTabs shared-control state contract', () => {
  let tabs;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    tabs = [
      { id: 'tab-a', type: 'box' },
      { id: 'tab-b', type: 'box' }
    ];
    window.Main = {
      session: {
        workspaceState: { tabs },
        getActiveTab: () => tabs[0]
      },
      components: { registry: {} }
    };
    require('../../js/shared/componentLifecycle.js');
    require('../../js/shared/workspaceTabs.js');
  });

  test('shared-control state is tab-owned and isolated', () => {
    const stateA = window.Shared.workspaceTabs.ensureSharedControlState('tab-a', 'fontControls', {
      tabId: 'tab-a',
      strictTabOwnership: true,
      reason: 'unit-shared-control-a'
    });
    stateA.scopeModes = { box: 'graph' };

    const stateB = window.Shared.workspaceTabs.ensureSharedControlState('tab-b', 'fontControls', {
      tabId: 'tab-b',
      strictTabOwnership: true,
      reason: 'unit-shared-control-b'
    });

    expect(stateB.scopeModes).toBeUndefined();
    expect(window.Shared.workspaceTabs.getSharedControlState('tab-a', 'fontControls', {
      tabId: 'tab-a',
      strictTabOwnership: true,
      reason: 'unit-shared-control-read-a'
    }).scopeModes.box).toBe('graph');
  });

  test('shared-control APIs do not fall back to the active tab', () => {
    expect(() => window.Shared.workspaceTabs.ensureSharedControlState(null, 'fontControls', {
      strictTabOwnership: true,
      reason: 'unit-shared-control-missing-tab'
    })).toThrow(/requires explicit tab/);
    expect(tabs[0].sharedState).toBeUndefined();
  });

  test('disposeTab invokes registered shared-control disposers before sharedState is removed', () => {
    const disposer = jest.fn();
    window.Shared.workspaceTabs.registerSharedControlDisposer('fontControls', disposer);
    const tab = tabs[0];
    window.Shared.workspaceTabs.ensureSharedControlState(tab, 'fontControls', {
      tabId: 'tab-a',
      strictTabOwnership: true,
      reason: 'unit-shared-control-before-dispose'
    });

    window.Shared.workspaceTabs.disposeTab(tab, { type: 'box', reason: 'unit-shared-control-dispose' });

    expect(disposer).toHaveBeenCalledWith(tab, expect.objectContaining({
      tabId: 'tab-a',
      controlKey: 'fontControls',
      reason: 'unit-shared-control-dispose'
    }));
    expect(tab.sharedState).toBeUndefined();
  });
});

describe('workspaceTabs teardown contract', () => {
  let tabs;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    delete window.Components;
    tabs = [
      { id: 'tab-a', type: 'pca', sharedState: { runtime: {} } }
    ];
    window.Components = {
      box: {},
      pca: {}
    };
    window.Main = {
      session: {
        workspaceState: { tabs },
        getActiveTab: () => tabs[0]
      },
      components: {
        registry: {
          box: { disposeTab: jest.fn() },
          pca: { disposeTab: jest.fn() }
        }
      }
    };
    require('../../js/shared/componentLifecycle.js');
    require('../../js/shared/workspaceTabs.js');
    lc = window.Shared.componentLifecycle;
  });

  test('disposeTab uses explicit type override before graph replacement', () => {
    const tab = tabs[0];

    window.Shared.workspaceTabs.disposeTab(tab, {
      type: 'box',
      reason: 'graph-selection-reset'
    });

    expect(window.Main.components.registry.box.disposeTab).toHaveBeenCalledTimes(1);
    expect(window.Main.components.registry.pca.disposeTab).not.toHaveBeenCalled();
    expect(tab.sharedState).toBeUndefined();
  });

  test('disposeTab cancels component async scope for the disposed tab', () => {
    const tab = { id: 'tab-a', type: 'box', sharedState: { runtime: {} } };
    tabs[0] = tab;
    const scope = lc.createAsyncScope('box');
    window.Components.box.__asyncScope = scope;
    const token = scope.nextToken({ tabId: 'tab-a', reason: 'worker' });

    expect(scope.isCurrent(token)).toBe(true);

    window.Shared.workspaceTabs.disposeTab(tab, {
      type: 'box',
      reason: 'unit-dispose'
    });

    expect(scope.isCurrent(token)).toBe(false);
  });
});
