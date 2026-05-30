const fs = require('fs');
const path = require('path');

const scatterSource = () => fs.readFileSync(path.join(__dirname, '../js/components/scatter.js'), 'utf8').replace(/\r\n/g, '\n');

describe('scatter listener binding contract', () => {
  // Change listeners are registered via the shared bindScatterControlListener(el, 'change', ...)
  // helper. The trend-line/CI/PI toggles must keep their dedicated handlers (which force a
  // redraw) and must not be folded into the generic config-control array.
  const GENERIC_ARRAY_RE = /\[scatterShowGrid[^\]]+\]\s*\.forEach\(el=>el&&bindScatterControlListener\(el, 'change'/;

  test('scatterShowLine is not in the generic change-listener array', () => {
    const source = scatterSource();
    const arrayMatch = source.match(GENERIC_ARRAY_RE);
    expect(arrayMatch).toBeTruthy();
    expect(arrayMatch[0]).not.toContain('scatterShowLine');
  });

  test('scatterShowCI is not in the generic change-listener array', () => {
    const source = scatterSource();
    const arrayMatch = source.match(GENERIC_ARRAY_RE);
    expect(arrayMatch).toBeTruthy();
    expect(arrayMatch[0]).not.toContain('scatterShowCI');
  });

  test('scatterShowPI is not in the generic change-listener array', () => {
    const source = scatterSource();
    const arrayMatch = source.match(GENERIC_ARRAY_RE);
    expect(arrayMatch).toBeTruthy();
    expect(arrayMatch[0]).not.toContain('scatterShowPI');
  });

  test('scatterShowLine has exactly one dedicated change listener in setup', () => {
    const source = scatterSource();
    const setupMatch = source.match(/function setup\(initOptions[^)]*\)\{([\s\S]*?)scatter\.ready = true;/);
    expect(setupMatch).toBeTruthy();
    const setupBody = setupMatch[1];
    const matches = [...setupBody.matchAll(/bindScatterControlListener\(scatterShowLine, 'change'/g)];
    expect(matches).toHaveLength(1);
  });

  test('scatterShowCI has exactly one dedicated change listener in setup', () => {
    const source = scatterSource();
    const setupMatch = source.match(/function setup\(initOptions[^)]*\)\{([\s\S]*?)scatter\.ready = true;/);
    expect(setupMatch).toBeTruthy();
    const setupBody = setupMatch[1];
    const matches = [...setupBody.matchAll(/bindScatterControlListener\(scatterShowCI, 'change'/g)];
    expect(matches).toHaveLength(1);
  });

  test('scatterShowPI has exactly one dedicated change listener in setup', () => {
    const source = scatterSource();
    const setupMatch = source.match(/function setup\(initOptions[^)]*\)\{([\s\S]*?)scatter\.ready = true;/);
    expect(setupMatch).toBeTruthy();
    const setupBody = setupMatch[1];
    const matches = [...setupBody.matchAll(/bindScatterControlListener\(scatterShowPI, 'change'/g)];
    expect(matches).toHaveLength(1);
  });
});
