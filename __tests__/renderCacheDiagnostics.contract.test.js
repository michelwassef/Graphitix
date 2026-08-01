describe('Shared.renderCacheDiagnostics', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/renderCacheDiagnostics.js');
  });

  test('records immutable owner-scoped events and filters by cursor', () => {
    const api = window.Shared.renderCacheDiagnostics;
    const cursor = api.getCursor();
    const first = api.emit({ tabId: 'tab-a', component: 'box', phase: 'hydrate', outcome: 'hit' });
    api.emit({ tabId: 'tab-b', component: 'box', phase: 'hydrate', outcome: 'fallback-redraw' });

    expect(Object.isFrozen(first)).toBe(true);
    expect(api.getEvents({ afterCursor: cursor, tabId: 'tab-a' })).toEqual([first]);
    expect(api.getEvents({ afterCursor: cursor, component: 'box', outcome: 'fallback-redraw' })).toHaveLength(1);
  });

  test('clear removes prior events without rewinding the monotonic cursor', () => {
    const api = window.Shared.renderCacheDiagnostics;
    api.emit({ tabId: 'tab-a', component: 'scatter', phase: 'capture', outcome: 'captured' });
    const cursor = api.clear();
    expect(api.getEvents()).toEqual([]);
    const next = api.emit({ tabId: 'tab-a', component: 'scatter', phase: 'archive-read', outcome: 'eligible' });
    expect(next.index).toBeGreaterThan(cursor);
  });
});
