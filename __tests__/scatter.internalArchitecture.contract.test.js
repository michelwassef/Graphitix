const fs = require('fs');
const path = require('path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8').replace(/\r\n/g, '\n');

function functionSource(source, name){
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = pattern.exec(source);
  if(!match){ return null; }
  const start = match.index;
  let index = source.indexOf('(', start);
  let parameterDepth = 0;
  let parameterQuote = null;
  let parameterEscaped = false;
  for(; index < source.length; index += 1){
    const ch = source[index];
    if(parameterQuote){
      if(parameterEscaped){ parameterEscaped = false; }
      else if(ch === '\\'){ parameterEscaped = true; }
      else if(ch === parameterQuote){ parameterQuote = null; }
      continue;
    }
    if(ch === '"' || ch === "'" || ch === '`'){
      parameterQuote = ch;
      continue;
    }
    if(ch === '('){ parameterDepth += 1; }
    else if(ch === ')'){
      parameterDepth -= 1;
      if(parameterDepth === 0){
        index = source.indexOf('{', index + 1);
        break;
      }
    }
  }
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for(; index < source.length; index += 1){
    const ch = source[index];
    const next = source[index + 1];
    if(lineComment){
      if(ch === '\n'){ lineComment = false; }
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
      if(escaped){ escaped = false; }
      else if(ch === '\\'){ escaped = true; }
      else if(ch === quote){ quote = null; }
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
    if(ch === '{'){ depth += 1; }
    if(ch === '}'){
      depth -= 1;
      if(depth === 0){ return source.slice(start, index + 1); }
    }
  }
  return null;
}

describe('Scatter internal architecture contract', () => {
  const scatter = read('js/components/scatter.js');
  const stats = read('js/shared/stats.js');
  const regression = read('js/shared/regression.js');
  const worker = read('js/workers/scatter.worker.js');

  test('drawScatter delegates renderer responsibilities to explicit stages', () => {
    const draw = functionSource(scatter, 'drawScatter');
    expect(draw).toBeTruthy();
    expect(draw.split('\n').length).toBeLessThanOrEqual(3000);
    for(const marker of [
      'renderScatter3dFrame({',
      'renderScatter2dAxes({',
      'renderScatter2dPointLayer({',
      'renderScatter2dLegend({',
      'renderScatter2dTextLayers({',
      'renderScatter2dStatsLayer({'
    ]){
      expect(draw).toContain(marker);
    }
  });

  test('large renderer details do not return to drawScatter', () => {
    const draw = functionSource(scatter, 'drawScatter');
    expect(draw).not.toContain('indexedCanvasPointBuckets.set(');
    expect(draw).not.toContain('appendScatterPointCanvasIndexedBucketsAsPaths(');
    expect(draw).not.toContain('minorTicksX.forEach(');
    expect(draw).not.toContain('legendRenderer.draw(svg,');
    expect(draw).not.toContain("infoText.dataset.scatterOverlay = 'stats'");
  });

  test('axis-title editing uses one canonical table-header write', () => {
    const update = functionSource(scatter, 'syncScatterAxisHeader');
    const textLayer = functionSource(scatter, 'renderScatter2dTextLayers');
    expect(update).toBeTruthy();
    expect(textLayer).toBeTruthy();
    expect((update.match(/\.setDataAtCell\s*\(/g) || [])).toHaveLength(1);
    expect(update).not.toMatch(/\.setData\s*\(|\.updateSettings\s*\(|gridApi\.setRowData/);
    expect(textLayer).toContain('syncScatterAxisHeader(axis, nextValue');
    expect(scatter).not.toContain('IMMEDIATE DEBUG');
    expect(scatter).not.toContain('Try multiple approaches');
    expect(scatter).not.toContain('JSON.parse(JSON.stringify(currentData))');
  });

  test('Canvas bucket rendering has one implementation per backend', () => {
    const canvas = functionSource(scatter, 'renderScatterPointCanvasBucketCollection');
    const vector = functionSource(scatter, 'appendScatterPointCanvasBucketCollectionAsPaths');
    const indexedCanvas = functionSource(scatter, 'renderScatterPointCanvasIndexedBuckets');
    const ordinaryCanvas = functionSource(scatter, 'renderScatterPointCanvasBuckets');
    const indexedVector = functionSource(scatter, 'appendScatterPointCanvasIndexedBucketsAsPaths');
    const ordinaryVector = functionSource(scatter, 'appendScatterPointCanvasBucketsAsPaths');
    expect(canvas).toBeTruthy();
    expect(vector).toBeTruthy();
    expect(indexedCanvas).toContain('renderScatterPointCanvasBucketCollection(');
    expect(ordinaryCanvas).toContain('renderScatterPointCanvasBucketCollection(');
    expect(indexedVector).toContain('appendScatterPointCanvasBucketCollectionAsPaths(');
    expect(ordinaryVector).toContain('appendScatterPointCanvasBucketCollectionAsPaths(');
  });

  test('statistics context construction is centralized', () => {
    expect(functionSource(scatter, 'buildScatterStatsContextPayload')).toBeTruthy();
    expect(functionSource(scatter, 'buildScatterSignificanceStatsContext')).toBeTruthy();
    const layer = functionSource(scatter, 'renderScatter2dStatsLayer');
    expect(layer).toContain('buildScatterStatsContextPayload({');
    expect(layer).toContain('buildScatterSignificanceStatsContext({');
  });

  test('statistical primitives use their shared statistical owners', () => {
    expect(stats).toContain('function correlationConfidenceInterval(');
    expect(stats).toContain('stats.correlationConfidenceInterval = correlationConfidenceInterval;');
    expect(regression).toContain('regressionTools.computeRunsTestFromResiduals = computeRunsTestFromResiduals;');
    expect(regression).toContain('regressionTools.computeInformationCriteria = computeInformationCriteria;');
    expect(scatter).toContain('Shared.stats?.correlationConfidenceInterval');
    expect(scatter).toContain('regressionTools.computeRunsTestFromResiduals');
    expect(scatter).toContain('regressionTools.computeInformationCriteria');
    expect(worker).toContain('stats?.correlationConfidenceInterval');
  });

  test('confirmed dead helpers and old local statistical formulas are absent', () => {
    for(const marker of [
      'clearScatterAsyncTimeout',
      'addAdvancedMetric',
      'invertScatterMatrix2x2',
      'computeScatterAicMetricsForLowess',
      'function computeScatterAicMetrics('
    ]){
      expect(scatter).not.toContain(marker);
    }
  });
});
