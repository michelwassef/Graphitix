'use strict';

const {
  getRenderCacheCursor,
  selectRenderCacheEvent,
  waitForArchiveCheckpoint,
  waitForRenderCacheOutcome
} = require('../../e2e/helpers/contractWaits.js');

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
});
