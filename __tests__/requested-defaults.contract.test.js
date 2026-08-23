const fs = require('fs');
const path = require('path');
const { initializeWorkspaceHarness } = require('./setup/workspaceHarness');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));

describe('requested data-aware defaults contract', () => {
  test('Scatter keeps automatic theme ownership separate from explicit user choices', () => {
    jest.resetModules();
    const { session, setActiveTab } = initializeWorkspaceHarness({ resetNamespaces: true });
    require('../js/shared/colorSchemes.js');
    require('../js/components/scatter.js');

    const scatter = window.Components.scatter;
    const hooks = scatter.__testHooks;
    const unique = [
      ['Sample', 'X', 'Y'],
      ['A', 1, 2],
      ['B', 2, 4],
      ['C', 3, 6]
    ];
    const twoFormats = [
      ['Sample', 'X', 'Y'],
      ...Array.from({ length: 10 }, (_, index) => [index < 5 ? 'Group 1' : 'Group 2', index + 1, index + 2])
    ];
    const rareLabels = [
      ['Sample', 'X', 'Y'],
      ...Array.from({ length: 42 }, (_, index) => [`Group ${index % 21}`, index + 1, index + 2])
    ];

    expect(scatter.createEmptyPayload().config.colorSchemeUserOverride).toBe(false);
    expect(hooks.resolveDataAwareDefaultPolicy(unique)).toEqual(expect.objectContaining({
      schemeId: 'grayscale',
      singlePointFormat: true
    }));
    expect(hooks.resolveDataAwareDefaultPolicy(twoFormats)).toEqual(expect.objectContaining({
      schemeId: 'scientific',
      pointFormatCount: 2,
      singlePointFormat: false
    }));
    expect(hooks.resolveDataAwareDefaultPolicy(rareLabels)).toEqual(expect.objectContaining({
      schemeId: 'grayscale',
      singlePointFormat: true,
      distribution: expect.objectContaining({ rareLabels: true })
    }));

    const tab = {
      id: 'scatter-default-contract',
      type: 'scatter',
      payload: {
        ...scatter.createEmptyPayload(),
        data: unique,
        config: {
          ...scatter.createEmptyPayload().config,
          colorScheme: 'grayscale'
        }
      }
    };
    session.workspaceState.tabs = [tab];
    setActiveTab(tab);
    session.commitTabPayload = jest.fn((owner, payload) => {
      owner.payload = clone(payload);
    });
    window.Main.components = {
      get: jest.fn(() => ({
        getPayload: jest.fn(() => clone(tab.payload)),
        applyColorSchemePayload: jest.fn(() => true)
      }))
    };

    expect(window.Shared.colorSchemes.applyToActiveTab('scatter', 'scientific')).toBe(true);
    expect(tab.payload.config.colorScheme).toBe('scientific');
    expect(tab.payload.config.colorSchemeUserOverride).toBe(true);
  });

  test('Heatmap defaults values off only above ten conditions and persists the override boundary', () => {
    const heatmap = read('js/components/heatmap.js');
    expect(heatmap).toContain('const showValues = conditionCount <= 10;');
    expect(heatmap).toContain('showValuesUserOverride: src.showValuesUserOverride === true');
    expect(heatmap).toContain("reason: 'heatmap-data-aware-values-default'");
    expect(heatmap).toContain('nextPayload.config.showValues = showValues;');
    expect(heatmap).toContain('nextPayload.config.showValuesUserOverride = false;');
    expect(heatmap).toContain('payload.config.showValuesUserOverride = false;');
    expect(heatmap).toMatch(/el === refs\.showValues[\s\S]*showValuesUserOverride: true/);
  });

  test('multi-series Histogram opacity is shared by fill and border groups', () => {
    const hist = read('js/components/hist.js');
    expect(hist).toContain('const HIST_DEFAULT_MULTI_SERIES_TRACE_OPACITY = 0.65;');
    expect((hist.match(/seriesEntries\.length > 1 \? HIST_DEFAULT_MULTI_SERIES_TRACE_OPACITY : 1/g) || [])).toHaveLength(2);
    expect(hist).toContain("representative?.closest?.('[data-series-role=\"hist-trace\"]')");
  });
});
