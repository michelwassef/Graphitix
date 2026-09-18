const fs = require('fs');
const path = require('path');
const { loadComponentTestBootstrap } = require('../../test-support/componentTestBootstrap');

const readBox = () => fs.readFileSync(path.join(__dirname, '../../js/components/box.js'), 'utf8').replace(/\r\n/g, '\n');

describe('Box render-impact contract', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    loadComponentTestBootstrap('box');
    hooks = window.Components?.box?.__testHooks;
  });

  test('explicit impact wins over legacy compatibility flags', () => {
    expect(hooks.resolveRenderImpact({ renderImpact: 'paint', viewOnly: false })).toBe('paint');
    expect(hooks.resolveRenderImpact({ renderImpact: 'analysis', viewOnly: true })).toBe('analysis');
    expect(hooks.resolveRenderImpact({ structural: true })).toBe('structural');
    expect(hooks.resolveRenderImpact({ invalidate: 'style' })).toBe('paint');
    expect(hooks.resolveRenderImpact({ viewOnly: true })).toBe('layout');
  });

  test('sanitized draw options derive viewOnly from semantic impact', () => {
    expect(hooks.sanitizeDrawOptions({ renderImpact: 'paint', viewOnly: false })).toMatchObject({
      renderImpact: 'paint',
      viewOnly: true
    });
    expect(hooks.sanitizeDrawOptions({ renderImpact: 'analysis', viewOnly: true })).toMatchObject({
      renderImpact: 'analysis',
      viewOnly: false
    });
  });

  test('statistics signatures distinguish equal-moment datasets', () => {
    const first = [{ name: 'A', rawY: [0, 1, 2, 3] }];
    const second = [{ name: 'A', rawY: [1.5 - Math.sqrt(1.25), 1.5 - Math.sqrt(1.25), 1.5 + Math.sqrt(1.25), 1.5 + Math.sqrt(1.25)] }];
    const firstSummary = hooks.buildStatsSignature(first);
    const secondSummary = hooks.buildStatsSignature(second);
    expect(firstSummary).not.toBe(secondSummary);
    expect(hooks.computeTraceDataSignature(first[0].rawY)).not.toBe(hooks.computeTraceDataSignature(second[0].rawY));
  });

  test('the scheduler and settled event retain the resolved impact', () => {
    const source = readBox();
    expect(source).toContain('const renderImpact = resolveBoxRenderImpact(options, \'analysis\');');
    expect(source).toContain('computeBoxTraceDataSignature(values)');
    expect(source).toContain('runBoxSwarmWorker(payload, options?.tabId || options?.ownerTabId || null)');
    expect(source).toContain("source: 'box.draw'");
    expect(source).toContain('renderImpact: guardedOptions.renderImpact || resolveBoxRenderImpact(guardedOptions)');
  });
});
