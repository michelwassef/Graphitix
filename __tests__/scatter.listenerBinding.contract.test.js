const fs = require('fs');
const path = require('path');

const scatterSource = () => fs.readFileSync(path.join(__dirname, '../js/components/scatter.js'), 'utf8').replace(/\r\n/g, '\n');

describe('scatter listener binding contract', () => {
  test('scatterShowLine is not in the generic change-listener array', () => {
    const source = scatterSource();
    // The generic array forEach must not contain scatterShowLine — it has its own dedicated handler.
    const arrayMatch = source.match(/\[scatterShowGrid[^\]]+\]\s*\.forEach\(el=>el&&el\.addEventListener\('change'/);
    expect(arrayMatch).toBeTruthy();
    expect(arrayMatch[0]).not.toContain('scatterShowLine');
  });

  test('scatterShowCI is not in the generic change-listener array', () => {
    const source = scatterSource();
    const arrayMatch = source.match(/\[scatterShowGrid[^\]]+\]\s*\.forEach\(el=>el&&el\.addEventListener\('change'/);
    expect(arrayMatch).toBeTruthy();
    expect(arrayMatch[0]).not.toContain('scatterShowCI');
  });

  test('scatterShowPI is not in the generic change-listener array', () => {
    const source = scatterSource();
    const arrayMatch = source.match(/\[scatterShowGrid[^\]]+\]\s*\.forEach\(el=>el&&el\.addEventListener\('change'/);
    expect(arrayMatch).toBeTruthy();
    expect(arrayMatch[0]).not.toContain('scatterShowPI');
  });

  test('scatterShowLine has exactly one dedicated change listener in setup', () => {
    const source = scatterSource();
    const setupMatch = source.match(/function setup\(initOptions[^)]*\)\{([\s\S]*?)scatter\.ready = true;/);
    expect(setupMatch).toBeTruthy();
    const setupBody = setupMatch[1];
    const matches = [...setupBody.matchAll(/scatterShowLine\.addEventListener\('change'/g)];
    expect(matches).toHaveLength(1);
  });

  test('scatterShowCI has exactly one dedicated change listener in setup', () => {
    const source = scatterSource();
    const setupMatch = source.match(/function setup\(initOptions[^)]*\)\{([\s\S]*?)scatter\.ready = true;/);
    expect(setupMatch).toBeTruthy();
    const setupBody = setupMatch[1];
    const matches = [...setupBody.matchAll(/scatterShowCI\.addEventListener\('change'/g)];
    expect(matches).toHaveLength(1);
  });

  test('scatterShowPI has exactly one dedicated change listener in setup', () => {
    const source = scatterSource();
    const setupMatch = source.match(/function setup\(initOptions[^)]*\)\{([\s\S]*?)scatter\.ready = true;/);
    expect(setupMatch).toBeTruthy();
    const setupBody = setupMatch[1];
    const matches = [...setupBody.matchAll(/scatterShowPI\.addEventListener\('change'/g)];
    expect(matches).toHaveLength(1);
  });
});
