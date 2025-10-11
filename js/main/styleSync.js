(function() {
  "use strict";

  const Main = window.Main = window.Main || {};
  const namespace = Main.styleSync = Main.styleSync || {};

  const state = {
    initialized: false,
    session: null,
    workspaceState: null,
    workspaces: null,
    domControls: null,
    previews: null,
    renderTabs: null,
    dom: {},
    isOpen: false,
    activeSourceId: null
  };

  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(item => cloneValue(item));
    }
    if (typeof value === 'object') {
      const copy = {};
      Object.keys(value).forEach(key => {
        copy[key] = cloneValue(value[key]);
      });
      return copy;
    }
    return value;
  }

  function deepMerge(target, patch) {
    const base = (target && typeof target === 'object' && !Array.isArray(target))
      ? cloneValue(target)
      : {};
    Object.keys(patch || {}).forEach(key => {
      const patchValue = patch[key];
      if (patchValue && typeof patchValue === 'object' && !Array.isArray(patchValue)) {
        base[key] = deepMerge(base[key], patchValue);
      } else {
        base[key] = cloneValue(patchValue);
      }
    });
    return base;
  }

  function setIfDefined(target, key, value) {
    if (value !== undefined) {
      target[key] = cloneValue(value);
    }
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  const STYLE_SCHEMAS = {
    line: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'dotSize', cfg.dotSize);
          setIfDefined(configPatch, 'fill', cfg.fill);
          setIfDefined(configPatch, 'border', cfg.border);
          setIfDefined(configPatch, 'borderWidth', cfg.borderWidth);
          setIfDefined(configPatch, 'alpha', cfg.alpha);
          if (cfg.labelColors && typeof cfg.labelColors === 'object') {
            configPatch.labelColors = cloneValue(cfg.labelColors);
          }
          setIfDefined(configPatch, 'showGrid', cfg.showGrid);
          setIfDefined(configPatch, 'showFrame', cfg.showFrame);
          setIfDefined(configPatch, 'showIntervals', cfg.showIntervals);
          setIfDefined(configPatch, 'showDiagnostics', cfg.showDiagnostics);
          if (cfg.regression && hasOwn(cfg.regression, 'mode')) {
            configPatch.regression = Object.assign({}, configPatch.regression || {}, {
              mode: cfg.regression.mode
            });
          }
          if (cfg.forecast) {
            const forecastPatch = {};
            setIfDefined(forecastPatch, 'horizon', cfg.forecast.horizon);
            setIfDefined(forecastPatch, 'seasonLength', cfg.forecast.seasonLength);
            setIfDefined(forecastPatch, 'autoTune', cfg.forecast.autoTune);
            setIfDefined(forecastPatch, 'criterion', cfg.forecast.criterion);
            if (Object.keys(forecastPatch).length) {
              configPatch.forecast = forecastPatch;
            }
          }
          return { config: configPatch };
        },
        axes: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'logX', cfg.logX);
          setIfDefined(configPatch, 'logY', cfg.logY);
          setIfDefined(configPatch, 'xMin', cfg.xMin);
          setIfDefined(configPatch, 'xMax', cfg.xMax);
          setIfDefined(configPatch, 'yMin', cfg.yMin);
          setIfDefined(configPatch, 'yMax', cfg.yMax);
          setIfDefined(configPatch, 'originMode', cfg.originMode);
          setIfDefined(configPatch, 'originX', cfg.originX);
          setIfDefined(configPatch, 'originY', cfg.originY);
          return { config: configPatch };
        },
        fonts: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fontSize', cfg.fontSize);
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          setIfDefined(configPatch, 'xLabel', cfg.xLabel);
          setIfDefined(configPatch, 'yLabel', cfg.yLabel);
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    scatter: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'dotSize', cfg.dotSize);
          setIfDefined(configPatch, 'fill', cfg.fill);
          setIfDefined(configPatch, 'border', cfg.border);
          setIfDefined(configPatch, 'borderWidth', cfg.borderWidth);
          setIfDefined(configPatch, 'alpha', cfg.alpha);
          if (cfg.labelColors && typeof cfg.labelColors === 'object') {
            configPatch.labelColors = cloneValue(cfg.labelColors);
          }
          setIfDefined(configPatch, 'showGrid', cfg.showGrid);
          setIfDefined(configPatch, 'showFrame', cfg.showFrame);
          setIfDefined(configPatch, 'showLine', cfg.showLine);
          setIfDefined(configPatch, 'showIntervals', cfg.showIntervals);
          setIfDefined(configPatch, 'showDiagnostics', cfg.showDiagnostics);
          setIfDefined(configPatch, 'graphType', cfg.graphType);
          setIfDefined(configPatch, 'log2fcThreshold', cfg.log2fcThreshold);
          setIfDefined(configPatch, 'negLogPThreshold', cfg.negLogPThreshold);
          if (cfg.regression && hasOwn(cfg.regression, 'mode')) {
            configPatch.regression = Object.assign({}, configPatch.regression || {}, {
              mode: cfg.regression.mode
            });
          }
          return { config: configPatch };
        },
        axes: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'logX', cfg.logX);
          setIfDefined(configPatch, 'logY', cfg.logY);
          setIfDefined(configPatch, 'xMin', cfg.xMin);
          setIfDefined(configPatch, 'xMax', cfg.xMax);
          setIfDefined(configPatch, 'yMin', cfg.yMin);
          setIfDefined(configPatch, 'yMax', cfg.yMax);
          setIfDefined(configPatch, 'originMode', cfg.originMode);
          setIfDefined(configPatch, 'originX', cfg.originX);
          setIfDefined(configPatch, 'originY', cfg.originY);
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          setIfDefined(configPatch, 'xLabel', cfg.xLabel);
          setIfDefined(configPatch, 'yLabel', cfg.yLabel);
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    hist: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fill', cfg.fill);
          setIfDefined(configPatch, 'border', cfg.border);
          setIfDefined(configPatch, 'borderWidth', cfg.borderWidth);
          setIfDefined(configPatch, 'bins', cfg.bins);
          setIfDefined(configPatch, 'showGrid', cfg.showGrid);
          return { config: configPatch };
        },
        axes: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'logY', cfg.logY);
          setIfDefined(configPatch, 'yMin', cfg.yMin);
          setIfDefined(configPatch, 'yMax', cfg.yMax);
          return { config: configPatch };
        },
        fonts: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fontSize', cfg.fontSize);
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          setIfDefined(configPatch, 'xLabel', cfg.xLabel);
          setIfDefined(configPatch, 'yLabel', cfg.yLabel);
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    pie: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'chartType', cfg.chartType);
          setIfDefined(configPatch, 'showPercents', cfg.showPercents);
          setIfDefined(configPatch, 'showFrame', cfg.showFrame);
          setIfDefined(configPatch, 'startAngle', cfg.startAngle);
          if (cfg.colors) {
            configPatch.colors = cloneValue(cfg.colors);
          }
          return { config: configPatch };
        },
        fonts: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fontSize', cfg.fontSize);
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    box: {
      groups: {
        appearance: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'colorMode', cfg.colorMode);
          setIfDefined(configPatch, 'fill', cfg.fill);
          setIfDefined(configPatch, 'border', cfg.border);
          setIfDefined(configPatch, 'borderWidth', cfg.borderWidth);
          setIfDefined(configPatch, 'showGrid', cfg.showGrid);
          setIfDefined(configPatch, 'showFrame', cfg.showFrame);
          setIfDefined(configPatch, 'logScale', cfg.logScale);
          setIfDefined(configPatch, 'graphType', cfg.graphType);
          setIfDefined(configPatch, 'individualSummary', cfg.individualSummary);
          setIfDefined(configPatch, 'pointMode', cfg.pointMode);
          setIfDefined(configPatch, 'showCaps', cfg.showCaps);
          setIfDefined(configPatch, 'showSignificanceBars', cfg.showSignificanceBars);
          setIfDefined(configPatch, 'errorMode', cfg.errorMode);
          setIfDefined(configPatch, 'flipAxes', cfg.flipAxes);
          if (Array.isArray(cfg.colors)) {
            configPatch.colors = cfg.colors.map(color => cloneValue(color));
          }
          if (Array.isArray(cfg.borderColors)) {
            configPatch.borderColors = cfg.borderColors.map(color => cloneValue(color));
          }
          return { config: configPatch };
        },
        axes: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'yMin', cfg.yMin);
          setIfDefined(configPatch, 'yMax', cfg.yMax);
          if (cfg.axis && typeof cfg.axis === 'object') {
            const axisPatch = {};
            setIfDefined(axisPatch, 'strokeWidth', cfg.axis.strokeWidth);
            setIfDefined(axisPatch, 'color', cfg.axis.color);
            if (cfg.axis.tickInterval && typeof cfg.axis.tickInterval === 'object') {
              const tickPatch = {};
              setIfDefined(tickPatch, 'x', cfg.axis.tickInterval.x);
              setIfDefined(tickPatch, 'y', cfg.axis.tickInterval.y);
              if (Object.keys(tickPatch).length) {
                axisPatch.tickInterval = tickPatch;
              }
            }
            if (Object.keys(axisPatch).length) {
              configPatch.axis = axisPatch;
            }
          }
          return { config: configPatch };
        },
        fonts: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'fontSize', cfg.fontSize);
          return { config: configPatch };
        },
        titles: payload => {
          const cfg = payload?.config || {};
          const configPatch = {};
          setIfDefined(configPatch, 'title', cfg.title);
          setIfDefined(configPatch, 'yLabel', cfg.yLabel);
          return { config: configPatch };
        },
        layout: () => ({ layout: true })
      }
    },
    venn: {
      groups: {
        appearance: payload => {
          const style = payload?.style || {};
          const stylePatch = {};
          setIfDefined(stylePatch, 'colorA', style.colorA);
          setIfDefined(stylePatch, 'colorB', style.colorB);
          setIfDefined(stylePatch, 'colorC', style.colorC);
          setIfDefined(stylePatch, 'opacity', style.opacity);
          setIfDefined(stylePatch, 'borderColor', style.borderColor);
          setIfDefined(stylePatch, 'borderWidth', style.borderWidth);
          return { style: stylePatch };
        },
        fonts: payload => {
          const style = payload?.style || {};
          const stylePatch = {};
          setIfDefined(stylePatch, 'fontsize', style.fontsize);
          return { style: stylePatch };
        },
        layout: () => ({ layout: true })
      }
    }
  };

  function mergeGroupPatch(target, addition) {
    if (!addition) return target;
    const result = target || {};
    if (addition.config) {
      result.config = deepMerge(result.config, addition.config);
    }
    if (addition.style) {
      result.style = deepMerge(result.style, addition.style);
    }
    if (addition.layout) {
      result.layout = true;
    }
    return result;
  }

  function buildStylePatch(type, payload, groups) {
    const schema = STYLE_SCHEMAS[type];
    if (!schema) {
      return null;
    }
    const activeGroups = Array.isArray(groups) ? groups : [];
    let patch = null;
    activeGroups.forEach(group => {
      const handler = schema.groups[group];
      if (typeof handler === 'function') {
        const addition = handler(payload || {}, { group });
        patch = mergeGroupPatch(patch, addition);
      }
    });
    return patch;
  }

  function getGraphTabs() {
    if (!state.workspaceState || !Array.isArray(state.workspaceState.tabs)) {
      return [];
    }
    return state.workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type);
  }

  function getTabById(tabId) {
    return getGraphTabs().find(tab => tab.id === tabId) || null;
  }

  function hidePrompt(reason) {
    const { styleSyncPrompt } = state.dom;
    if (!styleSyncPrompt || styleSyncPrompt.hasAttribute('hidden')) {
      return;
    }
    styleSyncPrompt.setAttribute('hidden', 'hidden');
    styleSyncPrompt.setAttribute('aria-hidden', 'true');
    state.isOpen = false;
    console.debug('Debug: styleSync prompt hidden', { reason: reason || 'unspecified' });
  }

  function setStatus(message, status) {
    const el = state.dom.styleSyncStatus;
    if (!el) return;
    el.textContent = message || '';
    if (status) {
      el.dataset.status = status;
    } else {
      delete el.dataset.status;
    }
  }

  function updateApplyState(schema) {
    const applyBtn = state.dom.styleSyncApply;
    if (!applyBtn) return;
    const groups = collectSelectedGroups(schema);
    const targets = collectSelectedTargets();
    const enabled = !!schema && groups.length > 0 && targets.length > 0;
    applyBtn.disabled = !enabled;
    console.debug('Debug: styleSync apply state evaluated', {
      enabled,
      groupCount: groups.length,
      targetCount: targets.length,
      hasSchema: !!schema
    });
  }

  function collectSelectedGroups(schema) {
    const boxes = state.dom.styleSyncForm
      ? Array.from(state.dom.styleSyncForm.querySelectorAll('[data-style-group]'))
      : [];
    return boxes.filter(box => {
      if (box.disabled) return false;
      const key = box.getAttribute('data-style-group');
      if (!schema?.groups?.[key]) return false;
      return box.checked;
    }).map(box => box.getAttribute('data-style-group'));
  }

  function collectSelectedTargets() {
    if (!state.dom.styleSyncTargets) return [];
    const checked = Array.from(state.dom.styleSyncTargets.querySelectorAll('input[type="checkbox"]:checked'));
    return checked.map(input => input.value);
  }

  function syncSelectAllCheckbox() {
    const selectAll = state.dom.styleSyncSelectAll;
    if (!selectAll) return;
    const total = state.dom.styleSyncTargets
      ? state.dom.styleSyncTargets.querySelectorAll('input[type="checkbox"]').length
      : 0;
    const checked = collectSelectedTargets().length;
    selectAll.checked = total > 0 && checked > 0 && checked === total;
    selectAll.indeterminate = total > 0 && checked > 0 && checked < total;
    selectAll.disabled = total === 0;
  }

  function populateTargetOptions(sourceTab) {
    const container = state.dom.styleSyncTargets;
    if (!container) {
      return;
    }
    container.innerHTML = '';
    if (!sourceTab) {
      container.appendChild(document.createElement('div')).className = 'style-sync-targets__empty';
      container.firstChild.textContent = 'Select an example graph first.';
      return;
    }
    const peers = getGraphTabs().filter(tab => tab.id !== sourceTab.id && tab.type === sourceTab.type);
    if (!peers.length) {
      const empty = document.createElement('div');
      empty.className = 'style-sync-targets__empty';
      empty.textContent = 'No other tabs of this type are open.';
      container.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    peers.forEach(tab => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = tab.id;
      checkbox.dataset.tabType = tab.type;
      checkbox.addEventListener('change', () => {
        syncSelectAllCheckbox();
        updateApplyState(STYLE_SCHEMAS[sourceTab.type]);
      });
      const title = document.createElement('span');
      title.textContent = tab.title || tab.id;
      label.appendChild(checkbox);
      label.appendChild(title);
      fragment.appendChild(label);
    });
    container.appendChild(fragment);
    syncSelectAllCheckbox();
  }

  function populateSourceOptions(sourceId) {
    const select = state.dom.styleSyncSource;
    if (!select) return null;
    select.innerHTML = '';
    const graphTabs = getGraphTabs();
    if (!graphTabs.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No graphs available';
      select.appendChild(opt);
      select.disabled = true;
      return null;
    }
    select.disabled = false;
    graphTabs.forEach(tab => {
      const option = document.createElement('option');
      option.value = tab.id;
      option.textContent = `${tab.title || tab.id} (${tab.type})`;
      if (tab.id === sourceId) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    if (!select.value && graphTabs.length) {
      select.value = graphTabs[0].id;
    }
    return getTabById(select.value);
  }

  function disableUnsupportedGroups(schema) {
    const boxes = state.dom.styleSyncForm
      ? Array.from(state.dom.styleSyncForm.querySelectorAll('[data-style-group]'))
      : [];
    boxes.forEach(box => {
      const key = box.getAttribute('data-style-group');
      const supported = !!schema?.groups?.[key];
      box.disabled = !supported;
      if (!supported) {
        box.checked = false;
      }
    });
  }

  function applyLayoutToTab(tab, layoutClone) {
    if (!tab) return;
    tab.layoutState = layoutClone ? cloneValue(layoutClone) : null;
    if (typeof state.session.serializePayloadSignature === 'function') {
      tab.layoutSignature = state.session.serializePayloadSignature(tab.layoutState);
    }
  }

  function applyPatchToActiveWorkspace(tab, payload, patch, layoutClone) {
    if (!tab || !state.workspaces) return;
    const config = state.workspaces[tab.type];
    if (!config) {
      console.debug('Debug: styleSync active workspace apply skipped', { reason: 'missing-config', type: tab.type });
      return;
    }
    const applyAfterEnsure = () => {
      if (state.domControls && typeof state.domControls.applyWorkspacePayload === 'function') {
        try {
          const cloneFn = state.session?.fastClonePayload || state.session?.clonePayload;
          const payloadClone = cloneFn?.call(state.session, payload) || cloneValue(payload);
          state.domControls.applyWorkspacePayload(config, payloadClone);
        } catch (err) {
          console.error('styleSync applyWorkspacePayload error', { type: tab.type, err });
        }
      }
      if (patch?.layout && typeof config.applyLayoutState === 'function') {
        try {
          config.applyLayoutState(layoutClone ? cloneValue(layoutClone) : tab.layoutState, { reason: 'style-sync' });
        } catch (err) {
          console.error('styleSync applyLayoutState error', { type: tab.type, err });
        }
      }
      try {
        if (typeof config.draw === 'function') {
          config.draw();
        }
      } catch (err) {
        console.error('styleSync redraw error', { type: tab.type, err });
      }
      if (state.previews && typeof state.previews.updateTabPreviewFromWorkspace === 'function') {
        try {
          state.previews.updateTabPreviewFromWorkspace(tab, config, { reason: 'style-sync', forceCapture: true });
        } catch (err) {
          console.error('styleSync preview update error', { type: tab.type, err });
        }
      }
    };

    let ensurePromise = null;
    if (typeof config.ensure === 'function') {
      try {
        const ensureResult = config.ensure();
        if (ensureResult && typeof ensureResult.then === 'function') {
          ensurePromise = ensureResult;
        }
      } catch (err) {
        console.error('styleSync ensure error', { type: tab.type, err });
      }
    }

    if (ensurePromise && typeof ensurePromise.then === 'function') {
      ensurePromise.then(() => applyAfterEnsure()).catch(err => {
        console.error('styleSync ensure async error', { type: tab.type, err });
        applyAfterEnsure();
      });
    } else {
      applyAfterEnsure();
    }
  }

  function applyStyles() {
    const sourceTab = getTabById(state.activeSourceId);
    if (!sourceTab) {
      setStatus('Select a graph to copy styles from.', 'error');
      return;
    }
    if (!sourceTab.payload) {
      setStatus('Open the example graph at least once before copying its style.', 'error');
      console.debug('Debug: styleSync apply aborted - source missing payload', { tabId: sourceTab.id });
      return;
    }
    const schema = STYLE_SCHEMAS[sourceTab.type];
    if (!schema) {
      setStatus(`Style matching for ${sourceTab.type} graphs is not yet available.`, 'error');
      console.debug('Debug: styleSync apply aborted - unsupported type', { type: sourceTab.type });
      return;
    }
    const selectedGroups = collectSelectedGroups(schema);
    if (!selectedGroups.length) {
      setStatus('Select at least one property group to apply.', 'error');
      return;
    }
    const targetIds = collectSelectedTargets();
    if (!targetIds.length) {
      setStatus('Choose at least one target tab to update.', 'error');
      return;
    }
    const stylePatch = buildStylePatch(sourceTab.type, sourceTab.payload, selectedGroups);
    if (!stylePatch || (!stylePatch.config && !stylePatch.style && !stylePatch.layout)) {
      setStatus('The selected properties did not produce any style updates.', 'error');
      console.debug('Debug: styleSync apply aborted - empty patch', { groups: selectedGroups });
      return;
    }
    const applied = [];
    const skipped = [];
    let copiedLayout = null;
    if (stylePatch.layout) {
      const cloneFn = state.session?.fastClonePayload || state.session?.clonePayload;
      copiedLayout = cloneFn?.call(state.session, sourceTab.layoutState) || cloneValue(sourceTab.layoutState);
      if (!copiedLayout) {
        console.debug('Debug: styleSync layout copy missing - source lacks layout', { tabId: sourceTab.id });
      }
    }
    targetIds.forEach(targetId => {
      const targetTab = getTabById(targetId);
      if (!targetTab) {
        skipped.push({ id: targetId, reason: 'missing-tab' });
        return;
      }
      if (targetTab.type !== sourceTab.type) {
        skipped.push({ id: targetId, reason: 'type-mismatch' });
        return;
      }
      if (!targetTab.payload) {
        skipped.push({ id: targetId, reason: 'no-payload' });
        console.debug('Debug: styleSync target skipped - missing payload', { tabId: targetTab.id });
        return;
      }
      const cloneFn = state.session?.fastClonePayload || state.session?.clonePayload;
      const nextPayload = cloneFn?.call(state.session, targetTab.payload) || cloneValue(targetTab.payload);
      if (stylePatch.config) {
        nextPayload.config = deepMerge(nextPayload.config, stylePatch.config);
      }
      if (stylePatch.style) {
        nextPayload.style = deepMerge(nextPayload.style, stylePatch.style);
      }
      const changed = state.session?.assignTabPayload
        ? state.session.assignTabPayload(targetTab, nextPayload, { reason: 'style-sync' })
        : (() => { targetTab.payload = nextPayload; return true; })();
      if (stylePatch.layout && copiedLayout) {
        applyLayoutToTab(targetTab, copiedLayout);
      }
      if (changed) {
        applied.push(targetTab);
      }
      if (state.workspaceState?.activeTabId === targetTab.id) {
        applyPatchToActiveWorkspace(targetTab, nextPayload, stylePatch, copiedLayout);
      } else if (stylePatch.layout && !copiedLayout) {
        applyLayoutToTab(targetTab, null);
      }
      if (state.previews && typeof state.previews.syncTabPreviewIndicator === 'function') {
        state.previews.syncTabPreviewIndicator(targetTab);
      }
    });
    if (applied.length) {
      if (typeof state.session.markSessionDirty === 'function') {
        state.session.markSessionDirty('style-sync-applied', {
          sourceId: sourceTab.id,
          targetCount: applied.length,
          groups: selectedGroups
        });
      }
      if (typeof state.renderTabs === 'function') {
        state.renderTabs();
      }
    }
    const appliedTitles = applied.map(tab => tab.title || tab.id);
    const skippedDetails = skipped.map(item => `${item.id}: ${item.reason}`).join('; ');
    const successMessage = applied.length
      ? `Updated ${applied.length} tab${applied.length === 1 ? '' : 's'} using ${selectedGroups.length} style group${selectedGroups.length === 1 ? '' : 's'}.`
      : 'No tabs were updated.';
    setStatus(applied.length ? successMessage : `${successMessage} ${skipped.length ? 'Verify each target has been opened.' : ''}`, applied.length ? 'success' : 'error');
    console.debug('Debug: styleSync apply summary', {
      sourceId: sourceTab.id,
      appliedIds: applied.map(tab => tab.id),
      skipped,
      groups: selectedGroups,
      copiedLayout: !!copiedLayout,
      titles: appliedTitles,
      skippedDetails
    });
  }

  function handleSelectAllToggle(event) {
    const selectAll = event?.target;
    if (!state.dom.styleSyncTargets || !selectAll) return;
    const checkboxes = state.dom.styleSyncTargets.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(box => {
      box.checked = selectAll.checked;
    });
    updateApplyState(STYLE_SCHEMAS[getTabById(state.activeSourceId)?.type]);
  }

  function handleSourceChange() {
    const select = state.dom.styleSyncSource;
    state.activeSourceId = select ? select.value : null;
    const sourceTab = getTabById(state.activeSourceId);
    populateTargetOptions(sourceTab);
    const schema = sourceTab ? STYLE_SCHEMAS[sourceTab.type] : null;
    disableUnsupportedGroups(schema);
    updateApplyState(schema);
    if (!schema) {
      setStatus(sourceTab ? `Style matching for ${sourceTab.type} graphs is not yet available.` : '', sourceTab ? 'error' : null);
    } else if (!sourceTab?.payload) {
      setStatus('Open the example graph first so its styles can be captured.', 'error');
    } else {
      setStatus('');
    }
    console.debug('Debug: styleSync source changed', {
      sourceId: sourceTab?.id || null,
      type: sourceTab?.type || null,
      hasPayload: !!sourceTab?.payload
    });
  }

  function handlePromptKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      hidePrompt('escape');
    }
  }

  function openPrompt(trigger) {
    if (!state.session || !state.workspaceState) {
      console.warn('styleSync open skipped: session or workspace state unavailable');
      return;
    }
    const activeTab = state.session.getActiveTab ? state.session.getActiveTab() : null;
    if (activeTab) {
      try {
        state.session.persistActiveTabState(activeTab, {
          workspaces: state.workspaces,
          previews: state.previews,
          reason: 'style-sync-open'
        });
      } catch (err) {
        console.error('styleSync persist active error', err);
      }
    }
    const prompt = state.dom.styleSyncPrompt;
    if (!prompt) {
      console.warn('styleSync prompt unavailable in DOM');
      return;
    }
    prompt.removeAttribute('hidden');
    prompt.setAttribute('aria-hidden', 'false');
    state.isOpen = true;
    const sourceTab = populateSourceOptions(activeTab?.id || state.activeSourceId);
    state.activeSourceId = sourceTab ? sourceTab.id : null;
    populateTargetOptions(sourceTab);
    const schema = sourceTab ? STYLE_SCHEMAS[sourceTab.type] : null;
    disableUnsupportedGroups(schema);
    updateApplyState(schema);
    syncSelectAllCheckbox();
    setStatus('');
    if (state.dom.styleSyncSource) {
      state.dom.styleSyncSource.focus();
    }
    console.debug('Debug: styleSync prompt shown', {
      trigger: trigger || 'unknown',
      sourceId: state.activeSourceId,
      sourceType: sourceTab?.type || null
    });
  }

  namespace.init = function init(options = {}) {
    if (state.initialized) {
      console.debug('Debug: styleSync.init skipped - already initialized');
      return {
        handleMatchStylesClick: () => openPrompt('repeat'),
        close: hidePrompt
      };
    }
    state.session = options.session || null;
    state.workspaceState = options.workspaceState || null;
    state.workspaces = options.workspaces || null;
    state.domControls = options.domControls || null;
    state.previews = options.previews || null;
    state.renderTabs = typeof options.renderTabs === 'function' ? options.renderTabs : null;
    state.dom = {
      styleSyncPrompt: options.dom?.styleSyncPrompt || document.getElementById('styleSyncPrompt'),
      styleSyncForm: options.dom?.styleSyncForm || document.querySelector('#styleSyncPrompt [data-style-sync-form]'),
      styleSyncSource: options.dom?.styleSyncSource || document.getElementById('styleSyncSource'),
      styleSyncTargets: options.dom?.styleSyncTargets || document.getElementById('styleSyncTargets'),
      styleSyncSelectAll: options.dom?.styleSyncSelectAll || document.getElementById('styleSyncTargetSelectAll'),
      styleSyncStatus: options.dom?.styleSyncStatus || document.getElementById('styleSyncStatus'),
      styleSyncApply: options.dom?.styleSyncApply || document.querySelector('#styleSyncPrompt [data-style-sync-apply]'),
      styleSyncCancel: options.dom?.styleSyncCancel || document.querySelector('#styleSyncPrompt [data-style-sync-cancel]')
    };
    if (state.dom.styleSyncSource) {
      state.dom.styleSyncSource.addEventListener('change', handleSourceChange);
    }
    if (state.dom.styleSyncSelectAll) {
      state.dom.styleSyncSelectAll.addEventListener('change', handleSelectAllToggle);
    }
    if (state.dom.styleSyncApply) {
      state.dom.styleSyncApply.addEventListener('click', applyStyles);
    }
    if (state.dom.styleSyncCancel) {
      state.dom.styleSyncCancel.addEventListener('click', () => hidePrompt('cancel'));
    }
    if (state.dom.styleSyncForm) {
      state.dom.styleSyncForm.addEventListener('keydown', handlePromptKeydown);
    }
    state.initialized = true;
    console.debug('Debug: styleSync.init complete', {
      hasSession: !!state.session,
      hasWorkspaceState: !!state.workspaceState,
      hasDom: !!state.dom.styleSyncPrompt
    });
    return {
      handleMatchStylesClick: () => openPrompt('toolbar'),
      close: hidePrompt
    };
  };
})();
