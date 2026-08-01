describe('Shared.renderCacheSchema', () => {
  let schema;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/renderCacheSchema.js');
    schema = window.Shared.renderCacheSchema;
  });

  afterEach(() => {
    delete window.Shared;
  });

  test('accepts exact version-2 owner/component provenance', () => {
    const cache = {
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: 'workspace-1',
        complete: true
      }
    };

    expect(schema.validate(cache, {
      tabId: 'workspace-1',
      component: 'box'
    }, {
      requireVersion: true,
      requireComplete: true
    })).toEqual(expect.objectContaining({ ok: true }));
  });

  test.each([
    ['owner alias conflict', {
      tabId: 'workspace-2',
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: 'workspace-1',
        complete: true
      }
    }, 'owner-alias-conflict'],
    ['component alias conflict', {
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'scatter',
        tabId: 'workspace-1',
        complete: true
      }
    }, 'component-alias-conflict'],
    ['missing strict version', {
      __graphitixRenderCache: {
        component: 'box',
        type: 'box',
        tabId: 'workspace-1',
        complete: true
      }
    }, 'version-missing'],
    ['missing owner', {
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        complete: true
      }
    }, 'owner-missing'],
    ['missing component', {
      __graphitixRenderCache: {
        version: 2,
        tabId: 'workspace-1',
        complete: true
      }
    }, 'component-missing'],
    ['incomplete cache', {
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: 'workspace-1',
        complete: false
      }
    }, 'incomplete-cache']
  ])('rejects %s', (_label, cache, expectedError) => {
    const result = schema.validate(cache, {
      tabId: 'workspace-1',
      component: 'box'
    }, {
      requireVersion: true,
      requireComplete: true
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(expectedError);
  });

  test('retains legacy version compatibility only when strict versioning is not requested', () => {
    const legacy = {
      __graphitixRenderCache: {
        type: 'box',
        tabId: 'workspace-1',
        complete: true
      }
    };

    expect(schema.matches(legacy, { tabId: 'workspace-1', component: 'box' }, {
      requireComplete: true
    })).toBe(true);
    expect(schema.matches(legacy, { tabId: 'workspace-1', component: 'box' }, {
      requireVersion: true,
      requireComplete: true
    })).toBe(false);
  });

  test('presentation normalization does not mutate component-owned provenance', () => {
    const cache = {
      plot: { count: 1 },
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: 'workspace-1',
        complete: true,
        marker: 'owned'
      }
    };
    const before = JSON.parse(JSON.stringify(cache));

    const normalized = schema.withPresentationMetadata(cache, {
      graphicKey: 'plot',
      reason: 'test-normalize'
    });

    expect(cache).toEqual(before);
    expect(normalized).not.toBe(cache);
    expect(normalized.__graphitixRenderCache).toEqual(expect.objectContaining({
      version: 2,
      component: 'box',
      type: 'box',
      tabId: 'workspace-1',
      complete: true,
      marker: 'owned',
      graphicKey: 'plot',
      previewKey: 'plot',
      reason: 'test-normalize'
    }));
  });

  test('rollback view repairs provenance without mutating the rejected capture', () => {
    const cache = {
      plot: { count: 1 },
      __graphitixRenderCache: {
        version: 2,
        component: 'scatter',
        type: 'scatter',
        tabId: 'workspace-other',
        complete: true
      }
    };
    const before = JSON.parse(JSON.stringify(cache));

    const rollback = schema.createRollbackView(cache, {
      tabId: 'workspace-1',
      component: 'box',
      reason: 'test-rollback'
    });

    expect(cache).toEqual(before);
    expect(rollback).not.toBe(cache);
    expect(rollback.__graphitixRenderCache).toEqual(expect.objectContaining({
      version: 2,
      component: 'box',
      type: 'box',
      tabId: 'workspace-1',
      complete: true,
      rollbackOnly: true,
      reason: 'test-rollback'
    }));
  });
});
