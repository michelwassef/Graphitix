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

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

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

  function isLikelyColorString(value) {
    if (typeof value !== 'string') {
      return false;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)
      || /^rgb(a)?\(/i.test(trimmed)
      || /color/i.test(trimmed);
  }

  function proposeMutation(path, value, variant) {
    const key = String(path[path.length - 1] || '').toLowerCase();
    const keyPath = path.map(part => String(part).toLowerCase());
    const blocked = new Set([
      'stats',
      'assumptions',
      'result',
      'contexthtml',
      'contextsignature',
      'lastrunversion',
      'contextversion',
      'rotation',
      'quaternion',
      'segments',
      'dataview',
      'activeviewid',
      'filehandle',
      'filename',
      'savedat'
    ]);
    for (let i = 0; i < keyPath.length; i += 1) {
      if (blocked.has(keyPath[i])) {
        return undefined;
      }
    }

    if (typeof value === 'boolean') {
      return variant === 'A' ? false : true;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (/alpha|opacity|transparen|ratio/.test(key)) {
        return value <= 1 ? (variant === 'A' ? 0.23 : 0.77) : (variant === 'A' ? 23 : 77);
      }
      if (/size|width|thick|stroke|font|radius|line|tick|gap|padding|offset/.test(key)) {
        return variant === 'A' ? 2.5 : 5.5;
      }
      if (/count|bins|iter|samples|replicates|points|rows|cols/.test(key)) {
        return variant === 'A' ? Math.max(1, Math.round((value || 1) + 1)) : Math.max(2, Math.round((value || 1) + 3));
      }
      if (/min|max|threshold|limit|seed/.test(key)) {
        return variant === 'A' ? 1 : 2;
      }
      return variant === 'A' ? 3 : 9;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (isLikelyColorString(value) || /color/.test(key)) {
        return variant === 'A' ? '#1f77b4' : '#d62728';
      }
      if (/pattern|dash/.test(key)) {
        const normalized = trimmed.toLowerCase();
        if (normalized === 'solid' || normalized === 'continuous' || normalized === 'dashed' || normalized === 'dotted') {
          return variant === 'A' ? 'dashed' : 'dotted';
        }
      }
      if (/title|label|name|text/.test(key) && trimmed.length < 80) {
        return `${trimmed || key}-iso-${variant.toLowerCase()}`;
      }
      if (/fontsize|size|width|thick|stroke|alpha|opacity/.test(key) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
        return variant === 'A' ? '2.5' : '5.5';
      }
      return undefined;
    }
    return undefined;
  }

  function collectMutationPaths(configRoot, variant, maxCount = 24) {
    const paths = [];
    if (!isPlainObject(configRoot)) {
      return paths;
    }

    const walk = (node, path) => {
      if (paths.length >= maxCount) {
        return;
      }
      if (Array.isArray(node)) {
        const key = String(path[path.length - 1] || '').toLowerCase();
        if (/color/.test(key) && node.length && node.every(item => typeof item === 'string')) {
          const color = variant === 'A' ? '#1f77b4' : '#d62728';
          if (!valueEquals(node[0], color)) {
            node[0] = color;
            paths.push(path.concat(0));
          }
        }
        return;
      }
      if (isPlainObject(node)) {
        const keys = Object.keys(node).sort();
        keys.forEach(k => walk(node[k], path.concat(k)));
        return;
      }
      const nextValue = proposeMutation(path, node, variant);
      if (nextValue === undefined || valueEquals(nextValue, node)) {
        return;
      }
      if (setAtPath(configRoot, path, nextValue)) {
        paths.push(path.slice());
      }
    };

    walk(configRoot, []);
    return paths;
  }

  function applyFallbackMutations(target, variant) {
    if (!target || typeof target !== 'object') {
      return [];
    }
    const fallbackPaths = [
      ['title'],
      ['subtitle'],
      ['xLabel'],
      ['yLabel'],
      ['zLabel'],
      ['fontSize'],
      ['fill'],
      ['border'],
      ['dotSize'],
      ['lineWidth'],
      ['strokeWidth'],
      ['axis', 'strokeWidth'],
      ['axis', 'color'],
      ['showGrid'],
      ['showFrame'],
      ['showLegend'],
      ['colors', 0],
      ['borderColors', 0]
    ];
    const applied = [];
    fallbackPaths.forEach(path => {
      const current = getAtPath(target, path);
      if (current === undefined) {
        return;
      }
      const keyPath = path.map(part => String(part));
      const next = proposeMutation(keyPath, current, variant);
      if (next === undefined || valueEquals(next, current)) {
        return;
      }
      if (setAtPath(target, path, next)) {
        applied.push(path);
      }
    });
    return applied;
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
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    require('../js/vendor.js');
    require('../js/shared/fileIO.js');
    require('../js/shared/debounce.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
    require('../js/shared/undo.js');
    require('../js/shared/resizer.js');
    require('../js/shared/dom.js');
    require('../js/shared/exporter.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/graphSizing.js');
    require('../js/shared/regression.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/shared/uniprot.js');
    require('../js/shared/goAnalysis.js');
    require('../js/shared/stringAnalysis.js');
    require('../js/main/components.js');
    if (window.Main?.components?.preloadAllBundlesSync) {
      window.Main.components.preloadAllBundlesSync();
    }
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/styleSync.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs.js');
    require('../js/main.js');
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

        const livePayload = (typeof workspace.getPayload === 'function') ? workspace.getPayload() : null;
        const emptyPayload = (typeof workspace.createEmptyPayload === 'function') ? workspace.createEmptyPayload() : null;
        const liveTarget = isPlainObject(livePayload?.config) ? livePayload.config : livePayload;
        const emptyTarget = isPlainObject(emptyPayload?.config) ? emptyPayload.config : emptyPayload;
        const basePayload = (isPlainObject(liveTarget) && Object.keys(liveTarget).length > 0)
          ? livePayload
          : emptyPayload;
        if (!basePayload || typeof basePayload !== 'object') {
          failures.push(`${type}: missing payload for isolation check`);
          continue;
        }
        const targetKey = isPlainObject(basePayload.config) ? 'config' : null;
        const targetBase = targetKey ? basePayload.config : basePayload;
        if (!isPlainObject(targetBase)) {
          failures.push(`${type}: missing mutable payload object for isolation check`);
          continue;
        }

        const payloadA = deepClone(basePayload);
        const payloadB = deepClone(basePayload);
        const targetA = targetKey ? payloadA.config : payloadA;
        const targetB = targetKey ? payloadB.config : payloadB;
        const mutationPathsA = collectMutationPaths(targetA, 'A', 24);
        const mutationPathsB = collectMutationPaths(targetB, 'B', 24);
        if (!mutationPathsA.length) {
          mutationPathsA.push(...applyFallbackMutations(targetA, 'A'));
        }
        if (!mutationPathsB.length) {
          mutationPathsB.push(...applyFallbackMutations(targetB, 'B'));
        }
        const mutationKeys = Array.from(new Set(
          mutationPathsA.concat(mutationPathsB).map(pathToKey)
        ));
        const combinedPaths = mutationKeys.map(key => {
          const parts = [];
          key.split('.').forEach(part => {
            if (!part) {
              return;
            }
            if (/^\[\d+\]$/.test(part)) {
              parts.push(Number(part.slice(1, -1)));
            } else {
              parts.push(part);
            }
          });
          return parts;
        });
        if (!combinedPaths.length) {
          failures.push(`${type}: no mutable paths discovered (keys=${Object.keys(targetBase).slice(0, 20).join(',')})`);
          continue;
        }

        workspace.loadFromPayload?.(payloadA, { source: 'test-isolation-a' });
        await flush();
        session.persistActiveTabState(tabA, {
          workspaces: registry,
          previews: Main.previews,
          reason: `test-isolation-${type}-persist-a`
        });
        await flush();
        const observedA = workspace.getPayload?.();
        const observedATarget = targetKey ? observedA?.config : observedA;
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

        workspace.loadFromPayload?.(payloadB, { source: 'test-isolation-b' });
        await flush();
        session.persistActiveTabState(tabB, {
          workspaces: registry,
          previews: Main.previews,
          reason: `test-isolation-${type}-persist-b`
        });
        await flush();
        const observedB = workspace.getPayload?.();
        const observedBTarget = targetKey ? observedB?.config : observedB;
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
          failures.push(`${type}: no effective divergent config paths after mutation`);
          continue;
        }

        const snapshotA = capturePathValues(observedATarget, diffPaths);
        const snapshotB = capturePathValues(observedBTarget, diffPaths);

        await activateTabById(Main, tabA.id, `test-isolation-${type}-switch-a`);
        const observedA2 = workspace.getPayload?.();
        const observedA2Target = targetKey ? observedA2?.config : observedA2;
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
        const observedB2 = workspace.getPayload?.();
        const observedB2Target = targetKey ? observedB2?.config : observedB2;
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
});
