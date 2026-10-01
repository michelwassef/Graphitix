/* global afterEach, beforeEach, describe, expect, jest, test */
'use strict';

const { deepClone, installDomControls } = require('../../test-support/domControlsDefaultPayloadSuite');

describe('domControls default payload authority', () => {
  beforeEach(installDomControls);
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

  test('workspace defaults force immutable component theme defaults', () => {
    const session = window.Main?.session;
    const domControls = window.Main?.domControls;
    expect(session).toBeTruthy();
    expect(domControls).toBeTruthy();

    const config = {
      createEmptyPayload() {
        return {
          type: 'line',
          data: [['X title', 'Series 1']],
          config: {
            colorScheme: 'dark',
            labelColors: {
              'Series 1': '#ffffff'
            },
            seriesStyles: {
              'Series 1': {
                color: '#ffffff',
                markerStroke: '#ffffff'
              }
            }
          }
        };
      }
    };

    const first = domControls.ensureDefaultPayload(session, 'line', config);
    expect(first?.config?.colorScheme).toBe('scientific');
    expect(first?.config?.labelColors?.['Series 1']).not.toBe('#ffffff');
    expect(first?.config?.seriesStyles?.['Series 1']?.color).not.toBe('#ffffff');

    const contaminated = deepClone(first);
    contaminated.config.colorScheme = 'dark';
    contaminated.config.labelColors['Series 1'] = '#ffffff';
    expect(domControls.setWorkspaceDefaultPayload(session, 'line', contaminated)).toBe(true);

    const second = domControls.ensureDefaultPayload(session, 'line', config);
    expect(second?.config?.colorScheme).toBe('scientific');
    expect(second?.config?.labelColors?.['Series 1']).not.toBe('#ffffff');
  });

  test('ensureDefaultPayload refuses live payload fallback for defaults', () => {
    const session = window.Main?.session;
    const domControls = window.Main?.domControls;
    expect(session).toBeTruthy();
    expect(domControls).toBeTruthy();

    const config = {
      createEmptyPayload: jest.fn(() => null),
      captureEmptyPayloadTemplate: jest.fn(() => ({
        type: 'hist',
        data: [['Values'], [1], [2]],
        config: {
          plotMode: 'density',
          distributions: {
            selected: ['normal'],
            showPdf: false
          }
        }
      })),
      getPayload: jest.fn(() => ({
        type: 'hist',
        data: [['Values'], [1], [2]],
        config: {
          plotMode: 'density',
          distributions: {
            selected: ['normal'],
            showPdf: false
          }
        }
      }))
    };

    const defaults = domControls.ensureDefaultPayload(session, 'hist', config);
    expect(defaults).toBeNull();
    expect(config.createEmptyPayload).toHaveBeenCalled();
    expect(config.captureEmptyPayloadTemplate).not.toHaveBeenCalled();
    expect(config.getPayload).not.toHaveBeenCalled();
  });
});

