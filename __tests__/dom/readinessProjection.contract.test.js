'use strict';

const { inspectOwnerReadiness } = require('../../test-support/readiness.js');

describe('minimal DOM readiness projection', () => {
  beforeEach(() => {
    document.body.innerHTML = '<section id="boxPage"><div class="svgbox"></div></section>';
    window.Main = {
      session: {
        workspaceState: {
          activeTabId: 'box-a',
          tabs: [{ id: 'box-a', type: 'box' }]
        }
      }
    };
    window.Components = {
      box: {
        ready: true,
        __asyncScope: { snapshot: () => ({ generation: 2, idle: true }) }
      }
    };
    window.Shared = {
      workspaceTabs: { getMountedRoot: () => null },
      componentLifecycle: { isRestoreTransactionActive: () => false }
    };
  });

  afterEach(() => {
    delete window.Main;
    delete window.Components;
    delete window.Shared;
  });

  test('uses declared fixture markup without loading index.html', () => {
    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'box-a',
      requireIdle: true
    })).toEqual(expect.objectContaining({
      ready: true,
      phase: 'initialized',
      asyncGeneration: 2,
      asyncIdle: true
    }));
  });
});
