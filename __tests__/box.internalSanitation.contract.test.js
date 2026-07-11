const fs = require('fs');
const path = require('path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8').replace(/\r\n/g, '\n');

function functionSource(source, name){
  const header = new RegExp(`^[ \t]*(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm');
  const match = header.exec(source);
  if(!match){
    return null;
  }
  const headerEnd = source.indexOf('\n', match.index);
  const brace = source.lastIndexOf('{', headerEnd >= 0 ? headerEnd : source.length);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for(let index = brace; index < source.length; index += 1){
    const ch = source[index];
    const next = source[index + 1];
    if(lineComment){
      if(ch === '\n') lineComment = false;
      continue;
    }
    if(blockComment){
      if(ch === '*' && next === '/'){
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if(quote){
      if(escaped) escaped = false;
      else if(ch === '\\') escaped = true;
      else if(ch === quote) quote = null;
      continue;
    }
    if(ch === '/' && next === '/'){
      lineComment = true;
      index += 1;
      continue;
    }
    if(ch === '/' && next === '*'){
      blockComment = true;
      index += 1;
      continue;
    }
    if(ch === '"' || ch === "'" || ch === '`'){
      quote = ch;
      continue;
    }
    if(ch === '{') depth += 1;
    if(ch === '}'){
      depth -= 1;
      if(depth === 0) return source.slice(match.index, index + 1);
    }
  }
  return null;
}

describe('Box internal sanitation contract', () => {
  const box = read('js/components/box.js');

  test('renderer responsibilities stay split by orientation', () => {
    const prepared = functionSource(box, 'renderBoxPreparedFrame');
    const vertical = functionSource(box, 'renderBoxVerticalFrame');
    const horizontal = functionSource(box, 'renderBoxHorizontalFrame');
    expect(prepared).toBeTruthy();
    expect(vertical).toBeTruthy();
    expect(horizontal).toBeTruthy();
    expect(prepared.split('\n').length).toBeLessThanOrEqual(2800);
    expect(vertical.split('\n').length).toBeLessThanOrEqual(1250);
    expect(horizontal.split('\n').length).toBeLessThanOrEqual(1125);
    expect(prepared).toContain('renderBoxVerticalFrame(orientationFrameContext)');
    expect(prepared).toContain('renderBoxHorizontalFrame(orientationFrameContext)');
  });

  test('pure statistics and post-hoc ownership stays in Shared.boxStatsModel', () => {
    const delegates = [
      'computeSwarmOffsets', 'computeTraceSummary', 'computeAssumptionDiagnostics',
      'computeQQPoints', 'computeDagostino', 'computeVarianceDiagnostics',
      'listEffectOptions',
    'resolveEffectOptionMeta',
    'computeEffectSizeMetrics', 'applyPValueCorrection', 'resolveCorrectionMeta',
      'listPostHocOptions', 'isPostHocSupported', 'ensureValidPostHoc', 'getPostHocSummary',
      'anova', 'kruskalWallis', 'computeRepeatedMeasuresAnova', 'computeFriedmanTest',
      'computeWelchAnova', 'computeTukeyComparisons', 'computeGamesHowellComparisons',
      'computeTamhaneT2Comparisons', 'computeNemenyiComparisons',
      'computeDunnettComparisons', 'computeDunnComparisons'
    ];
    delegates.forEach(name => {
      const source = functionSource(box, name);
      expect(source).toBeTruthy();
      expect(source).toContain("callBoxStatsModel('");
      expect(source.split('\n').length).toBeLessThanOrEqual(6);
    });
    expect(box).not.toContain('const POST_HOC_META=');
    expect(box).not.toContain('const POST_HOC_ORDER=');
  });

  test('confirmed dead helpers and direct debug spam cannot return', () => {
    const removed = [
      'mapPostHocPairResults', 'selectQuantileInPlace', 'createEmptyTraceSummary',
      'buildGroupDataQualityFootnotes', 'computeDiffStats', 'computePairwiseCounts',
      'createDefaultBoxLabelPositions', 'getBoxStatsTableModelState',
      'buildGroupedNestedHeaders', 'resolveStudentizedRangeCritical',
      'computeAnovaComponents', 'multinomialCount', 'createPooledAssignmentLabels',
      'enumerateRankAssignmentsExact', 'generatePermutations', 'resolveTCritical'
    ];
    removed.forEach(name => {
      expect(new RegExp(`function\\s+${name}\\s*\\(`).test(box)).toBe(false);
    });
    expect((box.match(/console\.debug\s*\(/g) || [])).toHaveLength(2);
  });

  test('pair parsing remains explicit and validated', () => {
    const source = functionSource(box, 'parsePairString');
    expect(source).toBeTruthy();
    expect(source).toContain('resolveTraceIndex');
    expect(source).toContain("String(value || '')");
    expect(source.split('\n').length).toBeGreaterThanOrEqual(15);
    expect(source).not.toContain('return str.split(');
  });
});
