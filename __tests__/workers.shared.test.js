describe('Shared.Workers cancellation', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    window.Shared = {};
  });

  afterEach(() => {
    jest.useRealTimers();
    delete window.Worker;
  });

  test('a timed-out terminate task stops its worker', async () => {
    const worker = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
      onmessage: null,
      onerror: null,
      onmessageerror: null
    };
    window.Worker = jest.fn(() => worker);
    require('../js/shared/workers.js');

    const task = window.Shared.Workers.runTask({
      name: 'timeout-owner',
      url: 'worker.js',
      action: 'slow',
      timeoutMs: 50,
      cancelStrategy: 'terminate'
    });
    const rejection = expect(task).rejects.toThrow('Worker task timeout');
    jest.advanceTimersByTime(50);
    await rejection;

    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  test('abort cancellation is classified and never falls through as an ordinary failure', async () => {
    const worker = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
      onmessage: null,
      onerror: null,
      onmessageerror: null
    };
    window.Worker = jest.fn(() => worker);
    require('../js/shared/workers.js');
    const controller = new AbortController();
    const task = window.Shared.Workers.runTask({
      name: 'box:tab-a:swarm',
      url: 'worker.js',
      action: 'slow',
      signal: controller.signal,
      cancelStrategy: 'terminate'
    });

    controller.abort(new Error('stop'));
    const error = await task.catch(reason => reason);

    expect(window.Shared.Workers.isCancellationError(error)).toBe(true);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
