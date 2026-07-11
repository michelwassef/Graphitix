const fs = require('fs');
const path = require('path');

const boxSource = () => fs.readFileSync(path.join(__dirname, '../js/components/box.js'), 'utf8').replace(/\r\n/g, '\n');

function extractModuleFunction(source, name){
  const header = new RegExp(`^  (?:async )?function ${name}\\s*\\(`, 'm');
  const match = header.exec(source);
  if(!match){ return null; }
  const start = match.index;
  const headerEnd = source.indexOf('\n', start);
  const braceStart = source.lastIndexOf('{', headerEnd >= 0 ? headerEnd : source.length);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for(let index = braceStart; index < source.length; index += 1){
    const ch = source[index];
    const next = source[index + 1];
    if(lineComment){ if(ch === '\n') lineComment = false; continue; }
    if(blockComment){ if(ch === '*' && next === '/'){ blockComment = false; index += 1; } continue; }
    if(quote){
      if(escaped){ escaped = false; }
      else if(ch === '\\'){ escaped = true; }
      else if(ch === quote){ quote = null; }
      continue;
    }
    if(ch === '/' && next === '/'){ lineComment = true; index += 1; continue; }
    if(ch === '/' && next === '*'){ blockComment = true; index += 1; continue; }
    if(ch === '"' || ch === "'" || ch === '`'){ quote = ch; continue; }
    if(ch === '{') depth += 1;
    if(ch === '}'){
      depth -= 1;
      if(depth === 0){ return source.slice(start, index + 1); }
    }
  }
  return null;
}

describe('Box statistics-state performance contract', () => {
  test('session access and session capture use boundary-only statistics normalization', () => {
    const source = boxSource();
    const normalizeRecord = extractModuleFunction(source, 'normalizeBoxOwnedRuntimeRecord');
    const normalizeSession = extractModuleFunction(source, 'normalizeBoxSessionState');
    const getResults = extractModuleFunction(source, 'getBoxStatsResultsState');
    const setResults = extractModuleFunction(source, 'setBoxStatsResultsState');
    expect(source).toContain('const boxNormalizedOwnedRuntimeRecords = new WeakSet();');
    expect(source).toContain('const boxNormalizedStatsResultsStates = new WeakSet();');
    expect(source.match(/\bnormalizeBoxStatsResultsState\s*\(/g)).toHaveLength(2);
    expect(normalizeRecord).toContain('boxNormalizedOwnedRuntimeRecords.has(record)');
    expect(normalizeRecord).toContain('boxNormalizedOwnedRuntimeRecords.add(record)');
    expect(normalizeRecord).toContain('ensureBoxStatsResultsState(');
    expect(normalizeRecord).not.toContain('normalizeBoxStatsResultsState(');
    expect(normalizeSession).not.toContain('cloneSimple(value)');
    expect(getResults).toContain('ensureBoxStatsResultsState(');
    expect(getResults).not.toContain('normalizeBoxStatsResultsState(');
    expect(setResults).toContain('ensureBoxStatsResultsState(');
    expect(setResults).not.toContain('normalizeBoxStatsResultsState(');
  });


  test('routine draw capture preserves the canonical computed-output tree', () => {
    const capture = extractModuleFunction(boxSource(), 'captureBoxStatsResultsState');
    expect(capture).toContain('const captureLivePanel = options.captureLivePanel === true;');
    expect(capture).toContain(': previous.panelModel;');
    expect(capture).toContain('Routine draw/session capture');
    expect(capture).not.toContain(': normalizeBoxStatsPanelModel(previous.panelModel)');
  });

  test('tab deactivation copies owned slices without cloning the full statistics tree', () => {
    const remember = extractModuleFunction(boxSource(), 'rememberBoxOwnedRuntimeRecord');
    expect(remember).toContain("sessionState && typeof sessionState === 'object'");
    expect(remember).not.toContain('cloneSimple(sessionState)');
  });

  test('tab binding and state-only restore do not re-normalize computed statistics', () => {
    const source = boxSource();
    const bind = extractModuleFunction(source, 'bindBoxOwnedRuntimeRecord');
    const hydrate = extractModuleFunction(source, 'hydrateBoxStatsSurfaceFromTabPayload');
    const syncOnly = extractModuleFunction(source, 'syncBoxStatsResultsStateOnly');
    const restore = extractModuleFunction(source, 'restoreBoxStatsResultsState');
    const mirrors = extractModuleFunction(source, 'syncBoxStatsOutputMirrors');
    expect(bind).toContain('ensureBoxStatsResultsState(');
    expect(bind).not.toContain('normalizeBoxStatsResultsState(');
    expect(hydrate).toContain('getBoxStatsResultsState(session)');
    expect(hydrate).not.toContain('normalizeBoxStatsResultsState(');
    expect(syncOnly).toContain('ensureBoxStatsResultsState(');
    expect(syncOnly).not.toContain('normalizeBoxStatsResultsState(');
    expect(restore).toContain('ensureBoxStatsResultsState(');
    expect(restore).not.toContain('normalizeBoxStatsResultsState(');
    expect(mirrors).not.toContain('cloneSimple(normalized.report)');
    expect(mirrors).not.toContain('cloneSimple(normalized.assumptions)');
  });

  test('small stats-state updates do not clone the complete report tree', () => {
    const update = extractModuleFunction(boxSource(), 'updateBoxStatsResultsFields');
    expect(update).toBeTruthy();
    expect(update).not.toContain('normalizeBoxStatsResultsState(');
    expect(update).not.toContain('setBoxStatsResultsState(');
    expect(update).toContain('mutator(current)');
  });

  test('routine payload capture reads the owner session instead of serializing live stats DOM', () => {
    const payload = extractModuleFunction(boxSource(), 'getPayload');
    expect(payload).toContain('const payloadStatsResults = getBoxStatsResultsState(payloadSession);');
    expect(payload).toContain('...payloadStatsPanelModel');
    expect(payload).not.toContain('captureBoxStatsPanelModel(');
  });

  test('stats surface restore memoization is session-owned', () => {
    const source = boxSource();
    const restore = extractModuleFunction(source, 'restoreBoxStatsResultsState');
    expect(source).not.toContain('lastBoxStatsSurfaceRestoreKey');
    expect(restore).toContain('restoreSession.cache.statsSurfaceRestoreKey');
  });
});
