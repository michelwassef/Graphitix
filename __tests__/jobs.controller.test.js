describe('Shared.jobs and loading overlay integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    require('../js/shared/jobs.js');
    require('../js/shared/loadingOverlay.js');
    window.Shared.jobs.__resetForTests();
  });

  test('toolbar activity shows the primary active job and cancels it', () => {
    const host = document.createElement('div');
    host.dataset.jobActivity = '1';
    document.body.appendChild(host);

    const cancelled = [];
    const job = window.Shared.jobs.start({
      kind: 'stats',
      component: 'scatter',
      tabId: 'tab-a',
      tabTitle: 'XY Plots',
      message: 'Computing statistics...',
      activityDelayMs: 0,
      onCancel: meta => cancelled.push(meta.reason)
    });

    window.Shared.jobs.bindStatusUi();
    expect(host.hidden).toBe(false);
    expect(host.textContent).toContain('Computing statistics...');

    host.querySelector('[data-job-action="cancel"]').click();
    expect(cancelled).toEqual(['user-stop']);
    expect(window.Shared.jobs.get(job.id).status).toBe('cancelled');
    expect(host.hidden).toBe(true);
  });

  test('owner-scoped execution context propagates graph cancellation to yields and workers', async () => {
    const job = window.Shared.jobs.start({
      kind: 'graph',
      component: 'box',
      tabId: 'tab-box'
    });
    const execution = window.Shared.jobs.createExecutionContext({
      component: 'box',
      tabId: 'tab-box',
      kind: 'graph',
      budgetMs: 4
    });

    expect(execution.job.id).toBe(job.id);
    expect(execution.workerOptions('swarm')).toEqual(expect.objectContaining({
      name: 'box:tab-box:swarm',
      signal: job.signal,
      cancelStrategy: 'terminate'
    }));

    window.Shared.jobs.cancel(job.id, 'test-stop');
    await expect(execution.checkpoint()).rejects.toThrow('Task cancelled');
  });

  test('execution context becomes stale after a same-component tab switch even when no job exists', async () => {
    const previousMain = window.Main;
    const previousWorkspaceTabs = window.Shared.workspaceTabs;
    const tabs = [
      { id: 'tab-a', type: 'box', title: 'Box A' },
      { id: 'tab-b', type: 'box', title: 'Box B' }
    ];
    const workspaceState = { tabs, activeTabId: 'tab-a' };
    try {
      window.Main = {
        ...(previousMain || {}),
        session: {
          ...(previousMain?.session || {}),
          workspaceState,
          getActiveTab: () => tabs.find(tab => tab.id === workspaceState.activeTabId) || null
        }
      };
      window.Shared.workspaceTabs = {
        ...(previousWorkspaceTabs || {}),
        buildSessionMeta: () => ({ tabId: 'tab-a', sessionGeneration: 4, componentKey: 'box' }),
        isSessionMetaCurrent: (_component, meta) => workspaceState.activeTabId === meta.tabId && meta.sessionGeneration === 4
      };

      const execution = window.Shared.jobs.createExecutionContext({
        component: 'box',
        tabId: 'tab-a',
        kind: 'graph',
        budgetMs: 1
      });

      expect(execution.job).toBeNull();
      expect(execution.isCurrent()).toBe(true);
      workspaceState.activeTabId = 'tab-b';
      expect(execution.isCurrent()).toBe(false);
      await expect(execution.checkpoint()).rejects.toMatchObject({
        name: 'StaleExecutionOwnerError',
        code: 'STALE_EXECUTION_OWNER',
        component: 'box',
        tabId: 'tab-a'
      });
    } finally {
      window.Main = previousMain;
      window.Shared.workspaceTabs = previousWorkspaceTabs;
    }
  });

  test('execution context revalidates ownership after an actual cooperative yield', async () => {
    const previousMain = window.Main;
    const previousWorkspaceTabs = window.Shared.workspaceTabs;
    const tabs = [
      { id: 'tab-a', type: 'line', title: 'Line A' },
      { id: 'tab-b', type: 'line', title: 'Line B' }
    ];
    const workspaceState = { tabs, activeTabId: 'tab-a' };
    let releaseYield = null;
    const yieldSpy = jest.spyOn(window.Shared.jobs, 'createYieldController').mockReturnValue({
      checkpoint: jest.fn(() => new Promise(resolve => { releaseYield = resolve; }))
    });
    try {
      window.Main = {
        ...(previousMain || {}),
        session: {
          ...(previousMain?.session || {}),
          workspaceState,
          getActiveTab: () => tabs.find(tab => tab.id === workspaceState.activeTabId) || null
        }
      };
      window.Shared.workspaceTabs = {
        ...(previousWorkspaceTabs || {}),
        buildSessionMeta: () => ({ tabId: 'tab-a', sessionGeneration: 3, componentKey: 'line' }),
        isSessionMetaCurrent: (_component, meta) => workspaceState.activeTabId === meta.tabId && meta.sessionGeneration === 3
      };

      const execution = window.Shared.jobs.createExecutionContext({
        component: 'line',
        tabId: 'tab-a',
        kind: 'graph',
        budgetMs: 1
      });
      const pending = execution.checkpoint();
      await Promise.resolve();
      expect(releaseYield).toEqual(expect.any(Function));

      workspaceState.activeTabId = 'tab-b';
      releaseYield(true);

      await expect(pending).rejects.toMatchObject({
        name: 'StaleExecutionOwnerError',
        code: 'STALE_EXECUTION_OWNER',
        component: 'line',
        tabId: 'tab-a'
      });
    } finally {
      yieldSpy.mockRestore();
      window.Main = previousMain;
      window.Shared.workspaceTabs = previousWorkspaceTabs;
    }
  });

  test('execution context generation rejects ABA tab reactivation', () => {
    const previousMain = window.Main;
    const previousWorkspaceTabs = window.Shared.workspaceTabs;
    const tabs = [
      { id: 'tab-a', type: 'line', title: 'Line A' },
      { id: 'tab-b', type: 'line', title: 'Line B' }
    ];
    const workspaceState = { tabs, activeTabId: 'tab-a' };
    let activeGeneration = 7;
    try {
      window.Main = {
        ...(previousMain || {}),
        session: {
          ...(previousMain?.session || {}),
          workspaceState,
          getActiveTab: () => tabs.find(tab => tab.id === workspaceState.activeTabId) || null
        }
      };
      window.Shared.workspaceTabs = {
        ...(previousWorkspaceTabs || {}),
        buildSessionMeta: () => ({ tabId: 'tab-a', sessionGeneration: activeGeneration, componentKey: 'line' }),
        isSessionMetaCurrent: (_component, meta) => workspaceState.activeTabId === meta.tabId && activeGeneration === meta.sessionGeneration
      };

      const execution = window.Shared.jobs.createExecutionContext({
        component: 'line',
        tabId: 'tab-a',
        kind: 'graph'
      });
      expect(execution.owner.sessionGeneration).toBe(7);
      expect(execution.isCurrent()).toBe(true);

      workspaceState.activeTabId = 'tab-b';
      activeGeneration = 8;
      workspaceState.activeTabId = 'tab-a';

      expect(execution.isCurrent()).toBe(false);
    } finally {
      window.Main = previousMain;
      window.Shared.workspaceTabs = previousWorkspaceTabs;
    }
  });

  test('an active job cannot make an inactive execution owner current', () => {
    const previousMain = window.Main;
    const previousWorkspaceTabs = window.Shared.workspaceTabs;
    const tabs = [
      { id: 'tab-a', type: 'pie', title: 'Pie A' },
      { id: 'tab-b', type: 'pie', title: 'Pie B' }
    ];
    const workspaceState = { tabs, activeTabId: 'tab-a' };
    try {
      window.Main = {
        ...(previousMain || {}),
        session: {
          ...(previousMain?.session || {}),
          workspaceState,
          getActiveTab: () => tabs.find(tab => tab.id === workspaceState.activeTabId) || null
        }
      };
      window.Shared.workspaceTabs = {
        ...(previousWorkspaceTabs || {}),
        buildSessionMeta: () => ({ tabId: 'tab-a', sessionGeneration: 2, componentKey: 'pie' }),
        isSessionMetaCurrent: (_component, meta) => workspaceState.activeTabId === meta.tabId && meta.sessionGeneration === 2
      };
      const job = window.Shared.jobs.start({ kind: 'graph', component: 'pie', tabId: 'tab-a' });
      const execution = window.Shared.jobs.createExecutionContext({ component: 'pie', tabId: 'tab-a', kind: 'graph' });
      expect(execution.job.id).toBe(job.id);
      workspaceState.activeTabId = 'tab-b';
      expect(execution.isCurrent()).toBe(false);
    } finally {
      window.Main = previousMain;
      window.Shared.workspaceTabs = previousWorkspaceTabs;
    }
  });

  test('live resize checkpoints preserve cancellation without yielding a painted frame', async () => {
    const nextFrame = jest.spyOn(window.Shared.jobs, 'nextFrame').mockResolvedValue();
    const liveResize = window.Shared.jobs.createExecutionContext({
      component: 'hist',
      tabId: 'tab-hist',
      kind: 'graph',
      budgetMs: 4,
      drawOptions: { reason: 'resize', resizePhase: 'move', viewOnly: true }
    });

    await expect(liveResize.checkpoint()).resolves.toBe(false);
    expect(liveResize.liveResize).toBe(true);
    expect(nextFrame).not.toHaveBeenCalled();

    const settledDraw = window.Shared.jobs.createExecutionContext({
      component: 'hist',
      tabId: 'tab-hist',
      kind: 'graph',
      budgetMs: 4,
      drawOptions: { reason: 'resize', resizePhase: 'programmatic', viewOnly: true }
    });
    expect(settledDraw.liveResize).toBe(false);
  });

  test('replacement aborts only the previous graph job for the same owner', () => {
    const first = window.Shared.jobs.start({ kind: 'graph', component: 'box', tabId: 'tab-a' });
    const unrelated = window.Shared.jobs.start({ kind: 'graph', component: 'box', tabId: 'tab-b' });
    const replacement = window.Shared.jobs.start({
      kind: 'graph',
      component: 'box',
      tabId: 'tab-a',
      replaceForOwner: true
    });

    expect(first.signal.aborted).toBe(true);
    expect(unrelated.signal.aborted).toBe(false);
    expect(window.Shared.jobs.getActiveFor({ component: 'box', tabId: 'tab-a', kind: 'graph' }).id).toBe(replacement.id);
  });

  test('loading overlay stop preserves stopped state and retry restores progress until draw settles', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let completeDraw;
    const component = {
      cancelCurrentDraw: jest.fn(),
      draw: jest.fn(() => new Promise(resolve => { completeDraw = resolve; }))
    };
    window.Components = { scatter: component };

    const controller = window.Shared.loadingOverlay.createController({
      component: 'scatter',
      message: 'Rendering scatter plot...',
      host,
      getTabId: () => 'tab-a'
    });

    controller.queue({ reason: 'unit-render', immediate: true });
    const overlay = host.querySelector('.venn-loading-overlay');
    expect(overlay.hidden).toBe(false);
    expect(overlay.textContent).toContain('Stop');

    overlay.querySelector('[data-overlay-action="cancel"]').click();
    expect(component.cancelCurrentDraw).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'tab-a'
    }));
    expect(overlay.hidden).toBe(false);
    expect(overlay.textContent).toContain('Drawing stopped');
    expect(overlay.textContent).toContain('Draw again');

    overlay.querySelector('[data-overlay-action="retry"]').click();
    expect(overlay.hidden).toBe(false);
    expect(overlay.querySelector('.venn-loading-overlay__spinner')?.hidden).toBe(false);
    expect(overlay.textContent).toContain('Rendering scatter plot...');
    expect(overlay.textContent).not.toContain('Drawing stopped');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(component.draw).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      userInitiated: true
    }));
    completeDraw();
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(overlay.hidden).toBe(true);
  });

  test('pending controller keeps ownership across stop and retry settlement', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let controller;
    window.Components = {
      scatter: {
        cancelCurrentDraw: jest.fn(meta => {
          controller.resolve({ reason: 'cancelled', status: 'cancelled', tabId: meta.tabId });
        }),
        draw: jest.fn(options => {
          controller.force('overlay-retry', { tabId: options.tabId });
          controller.resolve({ reason: 'complete', status: 'complete', tabId: options.tabId });
        })
      }
    };
    controller = window.Shared.loadingOverlay.createPendingController({
      component: 'scatter',
      message: 'Rendering scatter plot...',
      host,
      getTabId: meta => meta?.tabId || 'tab-a'
    });

    controller.force('large-render', { tabId: 'tab-a' });
    const overlay = host.querySelector('.venn-loading-overlay');
    overlay.querySelector('[data-overlay-action="cancel"]').click();
    expect(controller.isActive({ tabId: 'tab-a' })).toBe(true);
    expect(overlay.textContent).toContain('Drawing stopped');

    overlay.querySelector('[data-overlay-action="retry"]').click();
    await new Promise(resolve => setTimeout(resolve, 220));
    expect(window.Components.scatter.draw).toHaveBeenCalledTimes(1);
    expect(window.Shared.jobs.getSnapshot().active).toHaveLength(0);
    expect(overlay.hidden).toBe(true);
  });

  test('latest graph controller owns the single overlay handle for a host', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const first = window.Shared.loadingOverlay.createController({ component: 'box', host, getTabId: () => 'tab-a' });
    const second = window.Shared.loadingOverlay.createController({ component: 'box', host, getTabId: () => 'tab-a' });

    first.queue({ reason: 'import', immediate: true });
    second.queue({ reason: 'render', immediate: true });
    const overlay = host.querySelector('.venn-loading-overlay');
    expect(overlay.hidden).toBe(false);

    first.resolve({ reason: 'old-import-complete' });
    expect(overlay.hidden).toBe(false);
    second.resolve({ reason: 'render-complete' });
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(overlay.hidden).toBe(true);
  });

  test('header cancellation updates an active graph overlay', () => {
    const activity = document.createElement('div');
    activity.dataset.jobActivity = '1';
    document.body.appendChild(activity);
    const host = document.createElement('div');
    document.body.appendChild(host);
    window.Components = {
      scatter: {
        cancelCurrentDraw: jest.fn(),
        draw: jest.fn()
      }
    };

    const controller = window.Shared.loadingOverlay.createController({
      component: 'scatter',
      message: 'Rendering scatter plot...',
      host,
      getTabId: () => 'tab-a'
    });
    controller.queue({ reason: 'unit-render', immediate: true });

    window.Shared.jobs.bindStatusUi();
    activity.querySelector('[data-job-action="cancel"]').click();

    const overlay = host.querySelector('.venn-loading-overlay');
    expect(overlay.textContent).toContain('Drawing stopped');
    expect(overlay.textContent).toContain('Draw again');
  });

  test('toolbar activity stays hidden for fast jobs by default', () => {
    const host = document.createElement('div');
    host.dataset.jobActivity = '1';
    document.body.appendChild(host);

    const job = window.Shared.jobs.start({
      kind: 'recovery',
      component: 'document',
      message: 'Saving recovery snapshot...'
    });

    window.Shared.jobs.bindStatusUi();
    expect(host.hidden).toBe(true);
    expect(host.dataset.jobStatus).toBe('pending');

    window.Shared.jobs.complete(job.id);
    expect(host.hidden).toBe(true);
    expect(host.dataset.jobStatus).toBe('idle');
  });

  test('graph wheel only shows for forced heavy pending work and shows immediately', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = window.Shared.loadingOverlay.createPendingController({
      component: 'scatter',
      message: 'Rendering scatter plot...',
      host,
      getTabId: () => 'tab-a'
    });

    controller.markPending('small-redraw');
    expect(controller.queue('small-redraw')).toBe(false);
    expect(host.querySelector('.venn-loading-overlay')).toBeNull();

    expect(controller.force('large-render', { message: 'Rendering scatter plot...' })).toBe(true);
    const overlay = host.querySelector('.venn-loading-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.hidden).toBe(false);
    expect(overlay.textContent).toContain('Rendering scatter plot...');
  });

  test('graph wheel force path can be gated by the component heavy predicate', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = window.Shared.loadingOverlay.createPendingController({
      component: 'scatter',
      message: 'Rendering scatter plot...',
      host,
      getTabId: () => 'tab-a',
      isHeavy: reason => reason === 'large-render'
    });

    controller.markPending('small-render');
    expect(controller.force('small-render', { message: 'Rendering scatter plot...' })).toBe(false);
    expect(host.querySelector('.venn-loading-overlay')).toBeNull();

    expect(controller.force('large-render', { message: 'Rendering scatter plot...' })).toBe(true);
    const overlay = host.querySelector('.venn-loading-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.hidden).toBe(false);
  });

  test('pending controllers keep same-component overlays isolated by owner tab', async () => {
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    document.body.append(hostA, hostB);
    const controller = window.Shared.loadingOverlay.createPendingController({
      component: 'pca',
      message: 'Rendering PCA...',
      getTabId: meta => meta?.tabId || null,
      getHost: meta => meta?.tabId === 'tab-b' ? hostB : hostA
    });

    controller.force('import-a', { tabId: 'tab-a' });
    controller.force('import-b', { tabId: 'tab-b' });
    expect(hostA.querySelector('.venn-loading-overlay')?.hidden).toBe(false);
    expect(hostB.querySelector('.venn-loading-overlay')?.hidden).toBe(false);

    controller.resolve({ reason: 'done-a', tabId: 'tab-a' });
    await new Promise(resolve => setTimeout(resolve, 170));
    expect(hostA.querySelector('.venn-loading-overlay')?.hidden).toBe(true);
    expect(hostB.querySelector('.venn-loading-overlay')?.hidden).toBe(false);
    expect(controller.isActive({ tabId: 'tab-b' })).toBe(true);
  });
});
