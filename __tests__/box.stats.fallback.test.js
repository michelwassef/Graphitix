const path = require('path');

describe('Components.box stats fallbacks', () => {
  let originalJStat;
  let originalShared;
  let originalComponents;

  function loadBoxHooks(){
    let hooks;
    jest.isolateModules(() => {
      require(path.join('..', 'js', 'components', 'box.js'));
      hooks = global.Components?.box?.__testHooks;
    });
    return hooks;
  }

  beforeEach(() => {
    jest.resetModules();
    originalJStat = global.jStat;
    originalShared = global.Shared;
    originalComponents = global.Components;
    delete global.jStat;
    delete global.Shared;
    delete global.Components;
  });

  afterEach(() => {
    if(typeof originalJStat === 'undefined'){
      delete global.jStat;
    }else{
      global.jStat = originalJStat;
    }
    if(typeof originalShared === 'undefined'){
      delete global.Shared;
    }else{
      global.Shared = originalShared;
    }
    if(typeof originalComponents === 'undefined'){
      delete global.Components;
    }else{
      global.Components = originalComponents;
    }
  });

  test('returns unavailable placeholders when jStat distributions are missing', () => {
    const hooks = loadBoxHooks();
    expect(hooks).toBeDefined();

    const sampleA = [1, 2, 3, 4];
    const sampleB = [2, 3, 4, 5];
    const pairedB = [1, 2, 3, 4];
    const groups = [[1, 2, 3], [2, 3, 4], [3, 4, 5]];

    const results = [
      hooks.tTest(sampleA, sampleB),
      hooks.tTestPaired(sampleA, pairedB),
      hooks.mannWhitney(sampleA, sampleB),
      hooks.wilcoxonSignedRank(sampleA, sampleB),
      hooks.anova(groups),
      hooks.kruskalWallis(groups)
    ];

    results.forEach(result => {
      expect(result).toBeDefined();
      expect(result.available).toBe(false);
      expect(result.message).toMatch(/unavailable/i);
    });
  });
});
