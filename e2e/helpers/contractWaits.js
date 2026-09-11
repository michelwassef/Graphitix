'use strict';

const { getComponentByType } = require('../../test-support/componentCatalog.js');
const { waitForOwnerReady } = require('../../test-support/readiness.js');

function resolveComponent(componentOrType) {
  return typeof componentOrType === 'string'
    ? getComponentByType(componentOrType)
    : componentOrType;
}

async function getActiveTabId(page) {
  return page.evaluate(() => String(window.Main?.session?.workspaceState?.activeTabId || '').trim() || null);
}

function selectRenderCacheEvent(events, options = {}) {
  const expectedTabId = options.expectedTabId == null ? '' : String(options.expectedTabId);
  const expectedComponent = options.component == null ? '' : String(options.component);
  const expectedPhase = options.phase == null ? '' : String(options.phase);
  const expectedSource = options.source == null ? '' : String(options.source);
  const expectedPayloadSignature = options.payloadSignature == null ? '' : String(options.payloadSignature);
  const expectedLayoutSignature = options.layoutSignature == null ? '' : String(options.layoutSignature);
  const outcomes = Array.isArray(options.outcomes)
    ? options.outcomes.map(value => String(value))
    : (options.outcome == null ? [] : [String(options.outcome)]);
  return (Array.isArray(events) ? events : []).find(event => (
    (!expectedTabId || String(event?.tabId || '') === expectedTabId)
    && (!expectedComponent || String(event?.component || '') === expectedComponent)
    && (!expectedPhase || String(event?.phase || '') === expectedPhase)
    && (!expectedSource || String(event?.source || '') === expectedSource)
    && (!expectedPayloadSignature || String(event?.payloadSignature || '') === expectedPayloadSignature)
    && (!expectedLayoutSignature || String(event?.layoutSignature || '') === expectedLayoutSignature)
    && (outcomes.length === 0 || outcomes.includes(String(event?.outcome || '')))
  )) || null;
}

async function getRenderCacheCursor(page) {
  return page.evaluate(() => Number(window.Shared?.renderCacheDiagnostics?.getCursor?.() || 0));
}

async function waitForComponentOwnerReady(page, componentOrType, options = {}) {
  const component = resolveComponent(componentOrType);
  if (!component?.type || !component?.pageId) {
    throw new Error('Contract readiness requires a component catalog entry');
  }
  const expectedTabId = options.expectedTabId == null
    ? await getActiveTabId(page)
    : String(options.expectedTabId);
  return waitForOwnerReady(page, {
    type: component.type,
    pageId: component.pageId,
    expectedTabId,
    timeout: options.timeout,
    requireMountedRoot: options.requireMountedRoot === true,
    requirePublished: options.requirePublished === true,
    requireIdle: options.requireIdle === true
  });
}

async function waitForOwnerProjection(page, componentOrType, selector, options = {}) {
  const component = resolveComponent(componentOrType);
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 30_000;
  const expectedTabId = options.expectedTabId == null
    ? await getActiveTabId(page)
    : String(options.expectedTabId);
  await page.waitForFunction(({ tabId, type, pageId, targetSelector, visible }) => {
    const state = window.Main?.session?.workspaceState || null;
    if (String(state?.activeTabId || '') !== String(tabId || '')) return false;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tabId, type)
      || document.querySelector(`#${pageId}:not([hidden])`);
    const target = root?.querySelector?.(targetSelector) || null;
    if (!target || target.isConnected === false) return false;
    return visible !== true || target.getClientRects().length > 0;
  }, {
    tabId: expectedTabId,
    type: component.type,
    pageId: component.pageId,
    targetSelector: selector,
    visible: options.visible === true
  }, { timeout, polling: 'raf' });
  return waitForComponentOwnerReady(page, component, {
    ...options,
    expectedTabId,
    timeout
  });
}

async function waitForOverlayStatus(page, selector, status = 'running', options = {}) {
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 30_000;
  await page.waitForFunction(({ targetSelector, expectedStatus }) => {
    const overlay = document.querySelector(targetSelector);
    return !!overlay
      && overlay.isConnected !== false
      && !overlay.hidden
      && overlay.dataset?.jobStatus === expectedStatus;
  }, {
    targetSelector: selector,
    expectedStatus: status
  }, { timeout, polling: 'raf' });
}

async function waitForRenderCacheOutcome(page, componentOrType, options = {}) {
  const component = resolveComponent(componentOrType);
  if (!component?.type) {
    throw new Error('Render-cache readiness requires a component catalog entry');
  }
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 30_000;
  const expectedTabId = options.expectedTabId == null
    ? await getActiveTabId(page)
    : String(options.expectedTabId);
  const afterCursor = options.afterCursor == null
    ? await getRenderCacheCursor(page)
    : Number(options.afterCursor) || 0;
  const request = {
    tabId: expectedTabId,
    component: component.type,
    phase: options.phase == null ? null : String(options.phase),
    source: options.source == null ? null : String(options.source),
    payloadSignature: options.payloadSignature == null ? null : String(options.payloadSignature),
    layoutSignature: options.layoutSignature == null ? null : String(options.layoutSignature),
    outcomes: Array.isArray(options.outcomes)
      ? options.outcomes.map(value => String(value))
      : (options.outcome == null ? [] : [String(options.outcome)]),
    afterCursor
  };
  try {
    const handle = await page.waitForFunction(({ tabId, componentType, phase, source, payloadSignature, layoutSignature, outcomes, cursor }) => {
      const state = window.Main?.session?.workspaceState || null;
      if (tabId && String(state?.activeTabId || '') !== String(tabId)) return false;
      // Read the cursor-bounded stream without pre-filtering. The diagnostic
      // stream is the authority for the emitted owner/component spelling; the
      // predicate below applies the requested boundary without losing evidence
      // when a legacy emitter omits an optional filter field.
      const events = window.Shared?.renderCacheDiagnostics?.getEvents?.({ afterCursor: cursor }) || [];
      const match = events.find(event => (
        String(event?.tabId || '') === String(tabId || '')
        && String(event?.component || '') === String(componentType || '')
        && (!phase || String(event?.phase || '') === phase)
        && (!source || String(event?.source || '') === source)
        && (!payloadSignature || String(event?.payloadSignature || '') === payloadSignature)
        && (!layoutSignature || String(event?.layoutSignature || '') === layoutSignature)
        && (outcomes.length === 0 || outcomes.includes(String(event?.outcome || '')))
      ));
      return match || false;
    }, { ...request, componentType: component.type }, { timeout, polling: 'raf' });
    return await handle.jsonValue();
  } catch (error) {
    let events = [];
    try {
      events = await page.evaluate(cursor => (
        window.Shared?.renderCacheDiagnostics?.getEvents?.({ afterCursor: cursor }) || []
      ), afterCursor);
    } catch (_diagnosticError) {
      events = [];
    }
    throw new Error(`Render-cache readiness timed out for ${component.type}/${expectedTabId || '(active owner)'}: ${JSON.stringify({ request, events })}`, { cause: error });
  }
}

async function waitForArchiveCheckpoint(page, componentOrType, options = {}) {
  return waitForRenderCacheOutcome(page, componentOrType, {
    ...options,
    phase: 'archive-checkpoint',
    outcomes: options.outcomes || ['stored']
  });
}

async function waitForComponentSnapshotReady(page, componentOrType, options = {}) {
  const component = resolveComponent(componentOrType);
  if (!component?.type) {
    throw new Error('Snapshot readiness requires a component catalog entry');
  }
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 30_000;
  return page.evaluate(async ({ type, timeoutMs }) => {
    const state = window.Main?.session?.workspaceState || null;
    const tabId = state?.activeTabId || null;
    const target = window.Components?.[type] || null;
    if (!tabId || !target || typeof target.awaitReadyForSnapshot !== 'function') {
      throw new Error(`Snapshot readiness hook unavailable for ${type}`);
    }
    const result = await target.awaitReadyForSnapshot({
      tabId,
      type,
      componentKey: type,
      reason: 'e2e-snapshot-ready',
      timeoutMs
    });
    if (result?.ok === false) {
      throw new Error(`Snapshot readiness rejected for ${type}: ${result.reason || 'unknown'}`);
    }
    return result || { ok: true };
  }, { type: component.type, timeoutMs: timeout });
}

module.exports = {
  getActiveTabId,
  getRenderCacheCursor,
  selectRenderCacheEvent,
  waitForComponentOwnerReady,
  waitForOwnerProjection,
  waitForOverlayStatus,
  waitForRenderCacheOutcome,
  waitForArchiveCheckpoint,
  waitForComponentSnapshotReady
};
