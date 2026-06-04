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
});
