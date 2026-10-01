'use strict';

const {
  createDiagnosticEnvelope,
  normalizeCacheDiagnosticEvent,
  normalizeLifecycleEvent
} = require('../../e2e/helpers/diagnostics.js');

describe('diagnostic evidence contract', () => {
  test('keeps the diagnostic envelope typed and bounded', () => {
    expect(createDiagnosticEnvelope({
      componentType: 'heatmap',
      capturedAt: 123,
      owner: { ready: true, owner: { activeTabId: 'tab-a', asyncGeneration: 4 } },
      lifecycle: { schemaVersion: 1, eventCount: 1, events: [] },
      cache: { schemaVersion: 1, eventCount: 0, events: [], lastOutcome: null },
      archive: { schemaVersion: 1, tabCount: 1 }
    })).toEqual({
      schemaVersion: 1,
      kind: 'diagnostic-evidence',
      componentType: 'heatmap',
      capturedAt: 123,
      owner: { ready: true, owner: { activeTabId: 'tab-a', asyncGeneration: 4 } },
      lifecycle: { schemaVersion: 1, eventCount: 1, events: [] },
      cache: { schemaVersion: 1, eventCount: 0, events: [], lastOutcome: null },
      archive: { schemaVersion: 1, tabCount: 1 }
    });
  });

  test('redacts unbounded cache event details to owner and signature evidence', () => {
    expect(normalizeCacheDiagnosticEvent({
      tabId: 'tab-a',
      componentType: 'heatmap',
      phase: 'restore',
      source: 'archive',
      outcome: 'hit',
      payloadSignature: 'payload-a',
      layoutSignature: 'layout-a',
      reason: 'reopen',
      payload: { secret: true },
      details: { secret: true }
    })).toEqual({
      tabId: 'tab-a',
      component: 'heatmap',
      phase: 'restore',
      source: 'archive',
      outcome: 'hit',
      payloadSignature: 'payload-a',
      layoutSignature: 'layout-a',
      reason: 'reopen'
    });
  });

  test('normalizes lifecycle evidence to bounded ownership fields', () => {
    expect(normalizeLifecycleEvent({
      componentKey: 'box',
      workspaceTabId: 'tab-b',
      kind: 'publish',
      reason: 'unit',
      phase: 'graph',
      payload: { secret: true }
    })).toEqual({
      componentKey: 'box',
      tabId: 'tab-b',
      action: 'publish',
      reason: 'unit',
      phase: 'graph'
    });
  });
});
