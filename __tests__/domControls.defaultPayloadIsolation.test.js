const deepClone = value => (value == null ? value : JSON.parse(JSON.stringify(value)));

describe('domControls default payload cache isolation', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }
    require('../js/main/session.js');
    require('../js/main/domControls.js');
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('ensureDefaultPayload uses empty payload defaults and ignores live tab payload', () => {
    const session = window.Main?.session;
    const domControls = window.Main?.domControls;
    expect(session).toBeTruthy();
    expect(domControls).toBeTruthy();

    const calls = { empty: 0, live: 0 };
    const livePayload = {
      type: 'box',
      data: [['']],
      config: {
        title: 'Boxplot',
        fontSize: '13',
        stats: {
          test: 'parametric',
          mode: 'all',
          alpha: 0.05,
          correction: 'holm',
          selectedColumns: [0],
          pairsText: 'A-B'
        }
      }
    };

    const config = {
      createEmptyPayload() {
        calls.empty += 1;
        return {
          type: 'box',
          data: [['']],
          config: {
            title: 'Boxplot',
            fontSize: '13',
            stats: {
              test: 'parametric',
              mode: 'all',
              alpha: 0.05,
              correction: 'holm',
              selectedColumns: [],
              pairsText: ''
            }
          }
        };
      },
      getPayload() {
        calls.live += 1;
        return deepClone(livePayload);
      }
    };

    const defaults = domControls.ensureDefaultPayload(session, 'box', config);
    expect(defaults).toBeTruthy();
    expect(defaults.config?.stats).toBeTruthy();
    expect(defaults.config.stats.test).toBe('parametric');
    expect(defaults.config.stats.mode).toBe('all');
    expect(defaults.config.stats.alpha).toBe(0.05);
    expect(defaults.config.stats.correction).toBe('holm');
    expect(defaults.config.stats.selectedColumns).toEqual([]);
    expect(defaults.config.stats.pairsText).toBe('');
    expect(calls.empty).toBe(1);
    expect(calls.live).toBe(0);
  });

  test('cached workspace defaults are detached across calls', () => {
    const session = window.Main?.session;
    const domControls = window.Main?.domControls;
    expect(session).toBeTruthy();
    expect(domControls).toBeTruthy();

    const config = {
      createEmptyPayload() {
        return {
          type: 'line',
          data: [['']],
          config: {
            fontSize: '13',
            stats: {
              controls: {
                method: 'pearson'
              },
              statsOptions: {
                showDiagnostics: true
              }
            }
          }
        };
      },
      getPayload() {
        return {
          type: 'line',
          data: [['']],
          config: {
            fontSize: '13',
            stats: {
              controls: {
                method: 'pearson'
              },
              statsOptions: {
                showDiagnostics: true
              }
            }
          }
        };
      }
    };

    const first = domControls.ensureDefaultPayload(session, 'line', config);
    expect(first?.config?.stats?.controls?.method).toBe('pearson');
    expect(first?.config?.stats?.statsOptions?.showDiagnostics).toBe(true);

    first.config.stats.controls.method = 'spearman';
    first.config.stats.statsOptions.showDiagnostics = true;

    const second = domControls.ensureDefaultPayload(session, 'line', config);
    expect(second?.config?.stats?.controls?.method).toBe('pearson');
    expect(second?.config?.stats?.statsOptions?.showDiagnostics).toBe(true);
  });
});
