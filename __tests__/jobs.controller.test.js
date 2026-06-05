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

  test('loading overlay stop preserves stopped state and retry calls component draw', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const component = {
      cancelCurrentDraw: jest.fn(),
      draw: jest.fn()
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
    expect(component.draw).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      userInitiated: true
    }));
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
});
