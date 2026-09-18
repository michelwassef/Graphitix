'use strict';

const {
  getRenderCacheCursor,
  selectRenderCacheEvent,
  waitForArchiveCheckpoint,
  waitForRenderCacheOutcome
} = require('../../e2e/helpers/contractWaits.js');
const {
  summarizeArchiveMetadata
} = require('../../e2e/helpers/archiveDriver.js');
const {
  summarizeLifecycleEvents
} = require('../../e2e/helpers/diagnostics.js');

describe('render-cache contract waits', () => {
  test('selects only the requested owner, phase, signatures, and outcome', () => {
    const events = [
      { tabId: 'tab-b', component: 'box', phase: 'hydrate', outcome: 'hit' },
      {
        tabId: 'tab-a',
        component: 'box',
        phase: 'hydrate',
        outcome: 'hit',
        payloadSignature: 'payload-a',
        layoutSignature: 'layout-a'
      }
    ];

    expect(selectRenderCacheEvent(events, {
      expectedTabId: 'tab-a',
      component: 'box',
      phase: 'hydrate',
      outcome: 'hit',
      payloadSignature: 'payload-a',
      layoutSignature: 'layout-a'
    })).toEqual(events[1]);
    expect(selectRenderCacheEvent(events, { expectedTabId: 'tab-c', outcome: 'hit' })).toBeNull();
  });

  test('reads the diagnostics cursor from the page', async () => {
    const page = {
      evaluate: jest.fn(async () => 42)
    };
    await expect(getRenderCacheCursor(page)).resolves.toBe(42);
  });

  test('passes explicit owner and cursor boundaries to cache waits', async () => {
    const page = {
      waitForFunction: jest.fn(async () => ({ jsonValue: async () => ({ outcome: 'hit' }) }))
    };
    await expect(waitForRenderCacheOutcome(page, 'box', {
      expectedTabId: 'tab-a',
      afterCursor: 19,
      phase: 'hydrate',
      outcome: 'hit',
      timeout: 1234
    })).resolves.toEqual({ outcome: 'hit' });
    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ tabId: 'tab-a', afterCursor: 19, outcomes: ['hit'] }),
      expect.objectContaining({ timeout: 1234, polling: 'raf' })
    );
  });

  test('specializes archive waits to stored checkpoint events', async () => {
    const page = {
      waitForFunction: jest.fn(async () => ({ jsonValue: async () => ({ outcome: 'stored' }) }))
    };
    await expect(waitForArchiveCheckpoint(page, 'box', {
      expectedTabId: 'tab-a',
      afterCursor: 7
    })).resolves.toEqual({ outcome: 'stored' });
    expect(page.waitForFunction.mock.calls[0][1]).toEqual(expect.objectContaining({
      phase: 'archive-checkpoint',
      outcomes: ['stored']
    }));
  });

  test('summarizes bounded owner-scoped lifecycle evidence', () => {
    expect(summarizeLifecycleEvents([
      { componentKey: 'box', tabId: 'tab-a', action: 'activate', details: { secret: true } },
      { componentKey: 'box', tabId: 'tab-b', action: 'activate' },
      { componentKey: 'box', tabId: 'tab-a', action: 'publish', phase: 'graph' }
    ], { componentType: 'box', tabId: 'tab-a', limit: 1 })).toEqual({
      schemaVersion: 1,
      componentType: 'box',
      tabId: 'tab-a',
      eventCount: 2,
      events: [{ componentKey: 'box', tabId: 'tab-a', action: 'publish', reason: null, phase: 'graph' }],
      lastEvent: { componentKey: 'box', tabId: 'tab-a', action: 'publish', reason: null, phase: 'graph' }
    });
  });

  test('summarizes archive metadata without payload contents', () => {
    const metadata = summarizeArchiveMetadata({
      source: 'graph-archive',
      manifest: {
        format: 'graphitix', version: 3, scope: 'workspace', createdAt: 'now',
        tabs: [{ type: 'box', title: 'A', payloadMode: 'lite', runtimeTabId: 'archive-a' }]
      },
      session: {
        activeIndex: 0,
        tabs: [{ title: 'A', type: 'box', payload: { secret: true }, layout: {}, uiState: {} }]
      }
    });
    expect(metadata).toEqual(expect.objectContaining({
      schemaVersion: 1,
      source: 'graph-archive',
      format: 'graphitix',
      archiveVersion: 3,
      tabCount: 1
    }));
    expect(metadata.tabs[0]).toEqual(expect.objectContaining({
      type: 'box', payloadMode: 'lite', runtimeTabIdPresent: true, hasLayout: true, hasUiState: true
    }));
    expect(JSON.stringify(metadata)).not.toContain('secret');
  });
});
