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

  test('module-level payload capture persists the live font-size control value', () => {
    const source = scatterSource();
    expect(source).toMatch(/function getScatterGraphPayload\(context = \{\}\)\{\s*return getActiveScatterGraphPayload\(context\);\s*\}/);
    const payloadMatch = source.match(/function getActiveScatterGraphPayload\(context = \{\}\)\{([\s\S]*?)function applyActiveScatterPayload/);
    expect(payloadMatch).toBeTruthy();
    const payloadBody = payloadMatch[1];
    expect(payloadBody).toContain("resolvePayloadControl('scatterFontSize', scatterFontSize)");
    expect(payloadBody).toMatch(/fontSize\s*:\s*readValue\(payloadScatterFontSize,\s*''\)/);
  });

  test('module-level payload apply restores config.fontSize into the live font-size control', () => {
    const source = scatterSource();
    expect(source).toMatch(/function applyScatterPayload\(obj, meta = \{\}\)\{\s*return applyActiveScatterPayload\(obj, meta\);\s*\}/);
    const payloadMatch = source.match(/function applyActiveScatterPayload\(obj, meta = \{\}\)\{([\s\S]*?)function initNotes/);
    expect(payloadMatch).toBeTruthy();
    const payloadBody = payloadMatch[1];
    expect(payloadBody).toContain('if(c.fontSize !== undefined && scatterFontSize)');
    expect(payloadBody).toContain('scatterFontSize.value = String(c.fontSize)');
    expect(payloadBody).toContain('scatterFontSize.dataset.fontBasePt = String(c.fontSize)');
    expect(payloadBody).toContain('scatterFontSize.dataset.fontDisplayPt = String(c.fontSize)');
  });

  test('module-level DOM bindings include the alpha value label used by payload apply and setup', () => {
    const source = scatterSource();
    expect(source).toMatch(/\blet\s+scatterAlphaVal\s*=\s*null\s*;/);
    const setupMatch = source.match(/function setup\(initOptions[^)]*\)\{([\s\S]*?)scatter\.ready = true;/);
    expect(setupMatch).toBeTruthy();
    expect(setupMatch[1]).not.toMatch(/\b(?:const|let|var)\s+scatterAlphaVal\b/);
    expect(setupMatch[1]).toContain("scatterAlphaVal=$('#scatterAlphaVal')");
  });

  test('the extracted scheduler resolves its module-level frame debouncer instead of calling the removed setup-local binding', () => {
    const source = scatterSource();
    expect(source).toContain('function getScatterScheduleBase()');
    expect(source).toMatch(/const scheduleBase = getScatterScheduleBase\(\);\s*scheduleBase\(guarded\);/);
    expect(source).not.toMatch(/\bscheduleScatterBase\s*\(/);
  });

});
