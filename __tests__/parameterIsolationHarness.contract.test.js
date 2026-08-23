const fs = require('fs');
const path = require('path');

const harnessPath = path.resolve(__dirname, 'tab-isolation-regression', 'parameter-harness.js');
const source = fs.readFileSync(harnessPath, 'utf8');

function functionBody(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not locate harness contract markers: ${startMarker} -> ${endMarker}`);
  }
  return source.slice(start, end);
}

describe('parameter isolation harness persistence contract', () => {
  test('owner persistence treats the session return value as a change indicator, not success/failure', () => {
    const body = functionBody('function persistOwner(', 'function captureCanonicalPayload(');

    expect(body).toContain('persist(tab, {');
    expect(body).not.toMatch(/persisted\s*===\s*false/);
    expect(body).not.toMatch(/if\s*\([^)]*persist[^)]*===\s*false/);
    expect(body).toContain('requireOwnerTab(tabId, type, `${reason}:post-persist`)');
    expect(body).toContain("if(!persistedTab.payload || typeof persistedTab.payload !== 'object')");
  });

  test('parameter discovery reads the canonical owner payload without forcing a persistence capture', () => {
    const body = functionBody('async function discover(', 'function describeError(');

    expect(body).toContain('captureCanonicalPayload(type, tabId');
    expect(body).not.toContain('persistOwner(');
  });

  test('parameter batches share one archive/reopen instead of archiving each leaf', () => {
    const persistence = functionBody('api.runPersistenceMatrix = async function runPersistenceMatrix(', 'api.runSameTypeIsolation = async function runSameTypeIsolation(');
    const sameType = functionBody('api.runSameTypeIsolation = async function runSameTypeIsolation(', 'api.USER_ROOTS = USER_ROOTS;');

    expect((persistence.match(/buildArchiveBlob\(/g) || [])).toHaveLength(1);
    expect((persistence.match(/reopenArchiveBlob\(/g) || [])).toHaveLength(1);
    expect((sameType.match(/buildArchiveBlob\(/g) || [])).toHaveLength(1);
    expect((sameType.match(/reopenArchiveBlob\(/g) || [])).toHaveLength(1);
    expect(source).toContain("return String(parameter.path[0] || parameter.key || 'parameters');");
  });

  test('ordinary parameter hydration suppresses redraw and statistics recomputation', () => {
    const body = functionBody('async function applyPayload(', 'function controlTokens(');

    expect(body).toContain('skipDraw: options.draw !== true');
    expect(body).toContain('suppressStatsRecompute: options.draw !== true');
    expect(body).toContain('passiveControls: options.draw !== true');
  });
});
