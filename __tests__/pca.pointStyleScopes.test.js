describe('PCA scoped point styles', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="pcaPage" data-workspace-tab-id="tab-pca">
        <div id="pcaFontHost"></div>
        <input id="pcaFill" value="#0000ff">
        <input id="pcaBorder" value="#000000">
        <input id="pcaBorderWidth" value="0">
        <input id="pcaDotSize" value="3">
        <input id="pcaAlpha" value="0">
        <span id="pcaAlphaVal"></span>
      </div>
    `;
    window.Shared = {};
    window.Components = {};
    window.Main = {
      session: {
        getActiveTab: () => ({ id: 'tab-pca', type: 'pca' }),
        markTabUserModified: jest.fn(() => true)
      }
    };
    require('../js/shared/symbolToolbar.js');
    require('../js/components/pca.js');
  });

  test('migrates legacy grouped and point styles into one scoped model', () => {
    const hooks = window.Components.pca.__testHooks;
    const scopes = hooks.normalizePointStyleScopes({
      points: {
        'column:2': { fill: '#abcdef', size: 9 }
      }
    }, {
      controls: {
        fill: '#101010', border: '#202020', borderWidth: '1', dotSize: '4', alpha: '0.1'
      },
      grouped: {
        colors: ['#ff0000', '#00ff00'],
        shapes: ['circle', 'square']
      },
      labelColors: { A: '#123456' },
      labelShapes: { A: 'triangle' },
      labelPointStyles: { A: { borderColor: '#654321', size: 7 } }
    });

    expect(scopes).toEqual(expect.objectContaining({ version: 1 }));
    expect(scopes.global).toEqual(expect.objectContaining({
      fill: '#101010', borderColor: '#202020', borderWidth: 1, size: 4, alpha: 0.1
    }));
    expect(scopes.groups['0']).toEqual(expect.objectContaining({ fill: '#ff0000', shape: 'circle' }));
    expect(scopes.groups['1']).toEqual(expect.objectContaining({ fill: '#00ff00', shape: 'square' }));
    expect(scopes.points['label:A']).toEqual(expect.objectContaining({
      fill: '#123456', shape: 'triangle', borderColor: '#654321', size: 7
    }));
    expect(scopes.points['column:2']).toEqual(expect.objectContaining({ fill: '#abcdef', size: 9 }));
  });

  test('resolves individual point over group over global', () => {
    const hooks = window.Components.pca.__testHooks;
    const state = window.Components.pca.__state;
    state.tableFormat = 'grouped';
    state.pointStyleScopes = hooks.normalizePointStyleScopes({
      global: { fill: '#111111', shape: 'circle', size: 3, borderColor: '#000000', borderWidth: 0, alpha: 0 },
      groups: { '1': { fill: '#222222', shape: 'square', size: 5 } },
      points: { 'column:4': { fill: '#333333', size: 8 } }
    });

    expect(hooks.resolvePointStyle({ label: 'D', columnIndex: 4 }, 1, 3)).toEqual(expect.objectContaining({
      fill: '#333333', shape: 'square', size: 8
    }));
    expect(hooks.resolvePointStyle({ label: 'C', columnIndex: 3 }, 1, 2)).toEqual(expect.objectContaining({
      fill: '#222222', shape: 'square', size: 5
    }));
    expect(hooks.resolvePointStyle({ label: 'A', columnIndex: 1 }, null, 0)).toEqual(expect.objectContaining({
      fill: '#111111', shape: 'circle', size: 3
    }));
  });

  test('clicked grouped point exposes all groups and only that individual point', () => {
    const component = window.Components.pca;
    const hooks = component.__testHooks;
    const state = component.__state;
    state.tableFormat = 'grouped';
    state.grouped = { replicatesPerGroup: 2 };
    const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    target.__pcaPointData = {
      label: 'B',
      columnIndex: 2,
      index: 1,
      groupIndex: 0
    };
    document.getElementById('pcaPage').appendChild(target);
    const showSpy = jest.spyOn(window.Shared.symbolToolbar, 'show').mockImplementation(config => config);
    jest.spyOn(hooks, 'resolveGroupMeta').mockRestore?.();
    state.pointStyleScopes = hooks.normalizePointStyleScopes({
      groups: {
        '0': { fill: '#ff0000', shape: 'circle' },
        '1': { fill: '#00ff00', shape: 'square' }
      }
    });
    component.__state.cachedRender = {
      sampleCount: 4,
      labels: ['A', 'B', 'C', 'D'],
      sampleColumnIndices: [1, 2, 3, 4],
      groupedHeaderRow: ['', 'Control', '', 'Treated', '']
    };

    hooks.showPointFormatControls(target);

    const config = showSpy.mock.calls[0][0];
    expect(config.scope.value).toBe(window.Shared.encodeScopeValue('point', 'column:2'));
    expect(config.scope.options.map(option => option.label)).toEqual([
      'All points',
      'Group · Control',
      'Group · Treated',
      'Point · B'
    ]);
    expect(config.scope.options.filter(option => option.scopeKind === 'point')).toHaveLength(1);
    showSpy.mockRestore();
  });

  test('scoped styles are JSON-safe and legacy payload styles migrate', () => {
    const hooks = window.Components.pca.__testHooks;
    const scopes = hooks.normalizePointStyleScopes({
      global: { fill: '#111111' },
      groups: { '0': { fill: '#222222', shape: 'square', size: 6 } },
      points: { 'column:2': { fill: '#333333', borderColor: '#444444', size: 9 } }
    });
    const roundTripped = JSON.parse(JSON.stringify(scopes));
    expect(roundTripped.groups['0']).toEqual(expect.objectContaining({
      fill: '#222222', shape: 'square', size: 6
    }));
    expect(roundTripped.points['column:2']).toEqual(expect.objectContaining({
      fill: '#333333', borderColor: '#444444', size: 9
    }));
    const migrated = hooks.normalizePointStyleScopes({}, {
      grouped: { replicatesPerGroup: 2, colors: ['#aa0000'], shapes: ['triangle'] },
      labelColors: { B: '#00aaff' },
      labelPointStyles: { B: { size: 11 } }
    });
    expect(migrated.groups['0']).toEqual(expect.objectContaining({ fill: '#aa0000', shape: 'triangle' }));
    expect(migrated.points['label:B']).toEqual(expect.objectContaining({ fill: '#00aaff', size: 11 }));
  });
});
