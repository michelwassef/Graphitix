const { initializeWorkspaceHarness } = require('../setup/workspaceHarness');

const clone = value => JSON.parse(JSON.stringify(value));

describe('requested data-aware defaults contract', () => {
  test('Scatter keeps automatic theme ownership separate from explicit user choices', () => {
    jest.resetModules();
    const { session, setActiveTab } = initializeWorkspaceHarness({ resetNamespaces: true });
    require('../../js/shared/colorSchemes.js');
    require('../../js/components/scatter.js');

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

});
