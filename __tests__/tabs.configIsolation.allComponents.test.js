const { loadProductionBootstrap } = require('../test-support/productionLoader');
const { COMPONENT_MUTATION_CATALOG } = require('../test-support/componentMutationCatalog');

describe('Cross-tab graph config isolation (all components)', () => {
  jest.setTimeout(240000);

  const WORKSPACE_TYPES = [
    'venn',
    'box',
    'scatter',
    'pca',
    'line',
    'heatmap',
    'surface',
    'roc',
    'survival',
    'hist',
    'pie'
  ];

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function pathToKey(path) {
    return path.map(part => (typeof part === 'number' ? `[${part}]` : String(part))).join('.');
  }

  function getAtPath(obj, path) {
    let cursor = obj;
    for (let i = 0; i < path.length; i += 1) {
      if (cursor == null) {
        return undefined;
      }
      cursor = cursor[path[i]];
    }
    return cursor;
  }

  function setAtPath(obj, path, value) {
    if (!obj || !path.length) {
      return false;
    }
    let cursor = obj;
    for (let i = 0; i < path.length - 1; i += 1) {
      const key = path[i];
      if (cursor[key] == null || typeof cursor[key] !== 'object') {
        return false;
      }
      cursor = cursor[key];
    }
    cursor[path[path.length - 1]] = value;
    return true;
  }

  function valueEquals(a, b) {
    if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
      return Math.abs(a - b) < 1e-9;
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function resolveMutationPath(mutation) {
    return String(mutation?.path || '')
      .split('.')
      .filter(Boolean)
      .map(part => /^\d+$/.test(part) ? Number(part) : part);
  }

  function resolveCatalogMutationValue(mutation, current, variant) {
    const operation = String(mutation?.operation || '');
    if (operation === 'boolean-toggle') {
      return variant === 'A' ? false : true;
    }
    if (operation === 'enum-cycle' || operation === 'scheme-cycle') {
      const values = Array.isArray(mutation.values) ? mutation.values : [];
      if (values.length < 2) {
        throw new Error(`Mutation ${mutation.id} needs at least two explicit values`);
      }
      return values[variant === 'A' ? 0 : 1];
    }
    if (operation === 'number-delta') {
      const base = Number(current);
      const delta = Number(mutation.delta);
      if (!Number.isFinite(base) || !Number.isFinite(delta)) {
        throw new Error(`Mutation ${mutation.id} needs a finite numeric baseline`);
      }
      return base + (variant === 'A' ? delta : delta * 2);
    }
    if (operation === 'color-alternative') {
      return variant === 'A' ? '#e8eef7' : String(mutation.value || '#f2f5fa');
    }
    if (operation === 'text-suffix') {
      return `${String(current || '')}${String(mutation.suffix || '')} ${variant}`;
    }
    throw new Error(`Unsupported catalog mutation operation ${operation}`);
  }

  function applyCatalogSideEffects(payload, mutation) {
    (mutation.sideEffects || []).forEach(effect => {
      const path = resolveMutationPath(effect);
      if (getAtPath(payload, path) === undefined) {
        throw new Error(`Catalog side-effect path ${effect.path} is absent from payload`);
      }
      if (!setAtPath(payload, path, deepClone(effect.value))) {
        throw new Error(`Catalog side-effect path ${effect.path} could not be written`);
      }
    });
  }

  function buildCatalogVariantPayload(basePayload, type, variant, options = {}) {
    const plan = COMPONENT_MUTATION_CATALOG[type];
    if (!plan) {
      throw new Error(`No explicit component mutation plan for ${type}`);
    }
    const payload = deepClone(basePayload);
    const paths = [];
    const unavailable = [];
    (plan.mutations || []).forEach(mutation => {
      const path = resolveMutationPath(mutation);
      const current = getAtPath(payload, path);
      if (current === undefined) {
        if (options.skipUnavailable === true) {
          unavailable.push(mutation.path);
          return;
        }
        throw new Error(`Catalog path ${mutation.path} is absent from ${type} payload`);
      }
      const next = resolveCatalogMutationValue(mutation, current, variant);
      if (!setAtPath(payload, path, next)) {
        throw new Error(`Catalog path ${mutation.path} could not be written for ${type}`);
      }
      applyCatalogSideEffects(payload, mutation);
      paths.push(path);
    });
    return { payload, paths, unavailable };
  }

  function applyPayloadToOwner(workspace, session, tab, payload, source) {
    workspace.loadFromPayload?.(payload, {
      source,
      tab,
      tabId: tab.id
    });
    session.updateTabPayload(tab, () => deepClone(payload), {
      reason: source,
      origin: 'test'
    });
  }

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  async function activateTabById(Main, tabId, reason) {
    const maybe = Main.tabs.activateTab(tabId, { reason: reason || 'test-activate' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    await flush();
  }

  async function handleGraphSelection(Main, type) {
    const maybe = Main.tabs.handleGraphSelection(type, { reason: 'test-selection' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    const prompt = document.getElementById('duplicatePrompt');
    if (prompt && !prompt.hasAttribute('hidden')) {
      const emptyBtn = document.getElementById('duplicateEmpty');
      if (emptyBtn && typeof emptyBtn.click === 'function') {
        emptyBtn.click();
      }
    }
    await flush();
  }

  function capturePathValues(config, paths) {
    const snapshot = new Map();
    paths.forEach(path => {
      snapshot.set(pathToKey(path), deepClone(getAtPath(config, path)));
    });
    return snapshot;
  }

  beforeEach(() => {
    jest.resetModules();
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    delete global.Main;
    delete global.Components;
    delete global.Shared;
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: WORKSPACE_TYPES
    });
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('switching tabs does not leak component config across all workspaces', async () => {
    const Main = window.Main;
    const session = Main.session;
    const registry = Main.components.registry;
    const failures = [];

    for (let i = 0; i < WORKSPACE_TYPES.length; i += 1) {
      const type = WORKSPACE_TYPES[i];
      const workspace = registry[type];
      if (!workspace) {
        failures.push(`${type}: workspace registry entry missing`);
        continue;
      }

      try {
        if (i > 0) {
          Main.tabs.handleAddTabClick();
          await flush();
        }
        await handleGraphSelection(Main, type);
        const tabA = Main.tabs.getActiveTab();
        if (!tabA || tabA.type !== type) {
          failures.push(`${type}: failed to activate first tab`);
          continue;
        }
        session.persistActiveTabState(tabA, {
          workspaces: registry,
          previews: Main.previews,
          reason: `test-isolation-${type}-capture-baseline`
        });
        await flush();

        const livePayload = (typeof workspace.getPayload === 'function')
          ? workspace.getPayload({ tab: tabA, tabId: tabA.id, reason: 'test-config-isolation-live-payload' })
          : null;
        const emptyPayload = (typeof workspace.createEmptyPayload === 'function') ? workspace.createEmptyPayload() : null;
        const canonicalPayload = tabA.payload || livePayload;
        const basePayload = (canonicalPayload && typeof canonicalPayload === 'object' && Object.keys(canonicalPayload).length > 0)
          ? canonicalPayload
          : emptyPayload;
        if (!basePayload || typeof basePayload !== 'object') {
          failures.push(`${type}: missing payload for isolation check`);
          continue;
        }
        const variantA = buildCatalogVariantPayload(basePayload, type, 'A', { skipUnavailable: true });
        const variantB = buildCatalogVariantPayload(basePayload, type, 'B', { skipUnavailable: true });
        const payloadA = variantA.payload;
        const payloadB = variantB.payload;
        const combinedPaths = Array.from(new Map(
          variantA.paths.concat(variantB.paths).map(path => [pathToKey(path), path])
        ).values());
        if (!combinedPaths.length) {
          failures.push(`${type}: no catalog mutation paths declared`);
          continue;
        }

        applyPayloadToOwner(workspace, session, tabA, payloadA, 'test-isolation-a');
        await flush();
        session.persistActiveTabState(tabA, {
          workspaces: registry,
          previews: Main.previews,
          reason: `test-isolation-${type}-persist-a`
        });
        await flush();
        const observedA = tabA.payload || workspace.getPayload?.({ tab: tabA, tabId: tabA.id, reason: 'test-isolation-observed-a' });
        const observedATarget = observedA;
        if (!observedATarget || typeof observedATarget !== 'object') {
          failures.push(`${type}: could not capture observed payload A`);
          continue;
        }

        Main.tabs.handleAddTabClick();
        await flush();
        await handleGraphSelection(Main, type);
        const tabB = Main.tabs.getActiveTab();
        if (!tabB || tabB.id === tabA.id || tabB.type !== type) {
          failures.push(`${type}: failed to activate second tab`);
          continue;
        }

        applyPayloadToOwner(workspace, session, tabB, payloadB, 'test-isolation-b');
        await flush();
        session.persistActiveTabState(tabB, {
          workspaces: registry,
          previews: Main.previews,
          reason: `test-isolation-${type}-persist-b`
        });
        await flush();
        const observedB = tabB.payload || workspace.getPayload?.({ tab: tabB, tabId: tabB.id, reason: 'test-isolation-observed-b' });
        const observedBTarget = observedB;
        if (!observedBTarget || typeof observedBTarget !== 'object') {
          failures.push(`${type}: could not capture observed payload B`);
          continue;
        }

        const diffPaths = combinedPaths.filter(path => {
          const aValue = getAtPath(observedATarget, path);
          const bValue = getAtPath(observedBTarget, path);
          return !valueEquals(aValue, bValue);
        });
        if (!diffPaths.length) {
          const attempted = combinedPaths.map(path => `${pathToKey(path)}=${JSON.stringify({
            a: getAtPath(observedATarget, path),
            b: getAtPath(observedBTarget, path)
          })}`).join(', ');
          failures.push(`${type}: no effective divergent config paths after mutation (${attempted})`);
          continue;
        }

        const snapshotA = capturePathValues(observedATarget, diffPaths);
        const snapshotB = capturePathValues(observedBTarget, diffPaths);

        await activateTabById(Main, tabA.id, `test-isolation-${type}-switch-a`);
        const observedA2 = tabA.payload || workspace.getPayload?.({ tab: tabA, tabId: tabA.id, reason: 'test-isolation-observed-a2' });
        const observedA2Target = observedA2;
        if (!observedA2Target || typeof observedA2Target !== 'object') {
          failures.push(`${type}: could not capture observed payload A after switch`);
          continue;
        }

        diffPaths.forEach(path => {
          const key = pathToKey(path);
          const expected = snapshotA.get(key);
          const actual = getAtPath(observedA2Target, path);
          if (!valueEquals(actual, expected)) {
            failures.push(`${type}: tab A mismatch on ${key} (expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)})`);
          }
        });

        await activateTabById(Main, tabB.id, `test-isolation-${type}-switch-b`);
        const observedB2 = tabB.payload || workspace.getPayload?.({ tab: tabB, tabId: tabB.id, reason: 'test-isolation-observed-b2' });
        const observedB2Target = observedB2;
        if (!observedB2Target || typeof observedB2Target !== 'object') {
          failures.push(`${type}: could not capture observed payload B after switch`);
          continue;
        }

        diffPaths.forEach(path => {
          const key = pathToKey(path);
          const expected = snapshotB.get(key);
          const actual = getAtPath(observedB2Target, path);
          if (!valueEquals(actual, expected)) {
            failures.push(`${type}: tab B mismatch on ${key} (expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)})`);
          }
        });
      } catch (err) {
        failures.push(`${type}: ${err?.message || String(err)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  test('empty payload factories are not derived from live component state', async () => {
    const Main = window.Main;
    const session = Main.session;
    const registry = Main.components.registry;
    const failures = [];

    for (let i = 0; i < WORKSPACE_TYPES.length; i += 1) {
      const type = WORKSPACE_TYPES[i];
      const workspace = registry[type];
      if (!workspace || typeof workspace.createEmptyPayload !== 'function') {
        failures.push(`${type}: missing createEmptyPayload`);
        continue;
      }

      try {
        if (i > 0) {
          Main.tabs.handleAddTabClick();
          await flush();
        }
        await handleGraphSelection(Main, type);
        const activeTab = Main.tabs.getActiveTab();
        if (!activeTab || activeTab.type !== type) {
          failures.push(`${type}: failed to activate tab for default factory check`);
          continue;
        }
        const baseline = workspace.createEmptyPayload();
        const variant = buildCatalogVariantPayload(baseline, type, 'B', { skipUnavailable: true });
        const contaminated = variant.payload;
        const paths = variant.paths;
        if (!paths.length) {
          failures.push(`${type}: no catalog mutation paths to contaminate`);
          continue;
        }

        applyPayloadToOwner(workspace, session, activeTab, contaminated, 'test-default-factory-contamination');
        await flush();

        const afterLiveMutation = workspace.createEmptyPayload();
        if (!valueEquals(afterLiveMutation, baseline)) {
          failures.push(`${type}: createEmptyPayload changed after live payload mutation`);
        }

        const captured = workspace.captureEmptyPayloadTemplate?.();
        if (captured && !valueEquals(captured, baseline)) {
          failures.push(`${type}: captureEmptyPayloadTemplate returned live-derived defaults`);
        }
      } catch (err) {
        failures.push(`${type}: ${err?.message || String(err)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  test('new empty tabs do not inherit live parameters from previous tabs', async () => {
    const Main = window.Main;
    const session = Main.session;
    const registry = Main.components.registry;
    const failures = [];

    for (let i = 0; i < WORKSPACE_TYPES.length; i += 1) {
      const type = WORKSPACE_TYPES[i];
      const workspace = registry[type];
      if (!workspace || typeof workspace.createEmptyPayload !== 'function') {
        failures.push(`${type}: missing createEmptyPayload`);
        continue;
      }

      try {
        if (i > 0) {
          Main.tabs.handleAddTabClick();
          await flush();
        }
        await handleGraphSelection(Main, type);
        const tabA = Main.tabs.getActiveTab();
        const baseline = workspace.createEmptyPayload();
        const variant = buildCatalogVariantPayload(baseline, type, 'B', { skipUnavailable: true });
        const contaminated = variant.payload;
        const mutationPaths = variant.paths;
        if (!mutationPaths.length) {
          failures.push(`${type}: no catalog mutation paths to contaminate`);
          continue;
        }

        applyPayloadToOwner(workspace, session, tabA, contaminated, 'test-new-empty-contaminated');
        await flush();
        Main.session.persistActiveTabState(tabA, {
          workspaces: registry,
          previews: Main.previews,
          reason: `test-new-empty-${type}-persist-contaminated`
        });
        await flush();

        Main.tabs.handleAddTabClick();
        await flush();
        await handleGraphSelection(Main, type);
        const tabB = Main.tabs.getActiveTab();
        if (!tabB || tabB.id === tabA.id || tabB.type !== type) {
          failures.push(`${type}: failed to create second empty tab`);
          continue;
        }

        const observed = workspace.getPayload?.({
          tab: tabB,
          tabId: tabB.id,
          reason: 'test-new-empty-observed'
        });
        const observedTarget = observed;
        const baselineTarget = workspace.getPayload?.({
          tab: tabB,
          tabId: tabB.id,
          reason: 'test-new-empty-clean-baseline'
        }) || baseline;
        const contaminatedTarget = contaminated;
        mutationPaths.forEach(path => {
          const actual = getAtPath(observedTarget, path);
          const clean = getAtPath(baselineTarget, path);
          const dirty = getAtPath(contaminatedTarget, path);
          if (!valueEquals(actual, clean) && valueEquals(actual, dirty)) {
            failures.push(`${type}: new empty tab inherited ${pathToKey(path)}=${JSON.stringify(actual)}`);
          }
        });
      } catch (err) {
        failures.push(`${type}: ${err?.message || String(err)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  test('new empty histogram tab is not seeded from a previous density-fit histogram tab', async () => {
    const Main = window.Main;
    const session = Main.session;
    const registry = Main.components.registry;
    const workspace = registry.hist;
    expect(workspace).toBeTruthy();

    await handleGraphSelection(Main, 'hist');
    const tabA = Main.tabs.getActiveTab();
    expect(tabA?.type).toBe('hist');

    const densityPayload = workspace.createEmptyPayload();
    densityPayload.data = [
      ['Values'],
      [38],
      [42],
      [45],
      [50],
      [52],
      [55],
      [57],
      [60],
      [62],
      [65],
      [70]
    ];
    densityPayload.config = {
      ...densityPayload.config,
      plotMode: 'density',
      title: 'Density plot',
      yLabel: 'Density',
      distributions: {
        ...(densityPayload.config?.distributions || {}),
        selected: ['normal'],
        showPdf: true,
        showCdf: false
      }
    };

    applyPayloadToOwner(workspace, session, tabA, densityPayload, 'test-hist-density-fit');
    await flush();
    await window.Components?.hist?.draw?.({
      tab: tabA,
      tabId: tabA.id,
      force: true,
      reason: 'test-hist-density-fit-draw'
    });

    expect(document.querySelector('#histSvg .hist-overlay--pdf')).toBeTruthy();

    session.persistActiveTabState(tabA, {
      workspaces: registry,
      previews: Main.previews,
      reason: 'test-hist-density-fit-persist'
    });
    await flush();

    const directEmpty = workspace.createEmptyPayload();
    expect(directEmpty?.config?.plotMode).toBe('histogram');
    expect(directEmpty?.config?.title).toBe('Histogram');
    expect(directEmpty?.config?.distributions?.showPdf).toBe(false);
    expect(directEmpty?.config?.distributions?.showCdf).toBe(false);
    expect(directEmpty?.config?.distributions?.selected).toEqual([]);

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'hist');

    const tabB = Main.tabs.getActiveTab();
    expect(tabB?.type).toBe('hist');
    expect(tabB?.id).not.toBe(tabA.id);
    expect(tabB?.payload?.config?.plotMode).toBe('histogram');
    expect(tabB?.payload?.config?.title).toBe('Histogram');
    expect(tabB?.payload?.config?.distributions?.showPdf).toBe(false);
    expect(tabB?.payload?.config?.distributions?.showCdf).toBe(false);
    expect(tabB?.payload?.config?.distributions?.selected).toEqual([]);
  });
});
