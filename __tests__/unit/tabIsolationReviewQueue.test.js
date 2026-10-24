'use strict';

const { buildReviewQueue } = require('../../scripts/sort-tab-isolation-review-queue.cjs');

function candidate(id, overrides = {}){
  return {
    id,
    review: { status: 'pending source trace' },
    source: {
      file: 'js/components/box.js',
      line: 10,
      callback: `handler${id}`,
      registeredBy: 'bindBoxControlHandler',
      ownerWrapperPresent: true,
      ownerCheckPresent: false,
      registrationSites: [{ target: 'local or scoped target' }],
      capturedWrites: [],
      helperWrites: [{ name: 'state.value', kind: 'property assignment', scopeDepth: 1, via: ['updateOwnerState'] }],
      externalSinks: [],
      ...overrides.source
    },
    cues: {
      awaitCount: 0,
      activeLookupAfterAwait: [],
      ...overrides.cues
    }
  };
}

describe('tab-isolation review queue', () => {
  test('keeps candidate dispositions separate while batching identical source routes', () => {
    const ledger = {
      candidates: [
        candidate('a', { source: { line: 10 } }),
        candidate('b', { source: { line: 20 } }),
        candidate('c', { source: { registeredBy: 'addEventListener' } }),
        { ...candidate('already-reviewed'), review: { status: 'safe by owner trace' } }
      ]
    };

    const queue = buildReviewQueue(ledger);
    expect(queue.candidates.map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(queue.routes).toHaveLength(2);
    expect(queue.routes.find(route => route.members.length === 2).members.map(item => item.id)).toEqual(['a', 'b']);
    expect(queue.candidates.map(item => item.review.status)).toEqual(Array(3).fill('pending source trace'));
  });

  test('puts delayed durable writes ahead of synchronous owner-wrapper review routes', () => {
    const synchronous = candidate('sync');
    const delayed = candidate('delayed', {
      source: {
        ownerWrapperPresent: false,
        registeredBy: 'addEventListener',
        capturedWrites: [{ name: 'payload', kind: 'property assignment', scopeDepth: 1 }]
      },
      cues: { awaitCount: 1 }
    });
    const queue = buildReviewQueue({ candidates: [synchronous, delayed] });

    expect(queue.riskCandidates[0].id).toBe('delayed');
    expect(queue.fastTraceRoutes.flatMap(route => route.members.map(item => item.id))).toEqual(['sync']);
    expect(queue.riskCandidates).toHaveLength(2);
  });
});
