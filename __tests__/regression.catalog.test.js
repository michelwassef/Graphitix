function createJStatStub(){
  const mean = arr => {
    const clean = (arr || []).map(Number).filter(Number.isFinite);
    if(!clean.length) return 0;
    return clean.reduce((sum,val)=>sum + val, 0) / clean.length;
  };
  const transpose = (matrix = []) => matrix[0].map((_, colIdx) => matrix.map(row => row[colIdx] ?? 0));
  const multiply = (a = [], b = []) => {
    const rows = a.length;
    const cols = b[0]?.length || 0;
    const shared = b.length;
    const result = Array.from({ length: rows }, () => Array(cols).fill(0));
    for(let i = 0; i < rows; i++){
      for(let k = 0; k < shared; k++){
        const aVal = a[i]?.[k] ?? 0;
        if(!aVal) continue;
        for(let j = 0; j < cols; j++){
          result[i][j] += aVal * (b[k]?.[j] ?? 0);
        }
      }
    }
    return result;
  };
  const invert = (matrix = []) => {
    const n = matrix.length;
    if(!n){
      return null;
    }
    const aug = matrix.map((row, i) => {
      const identity = Array.from({ length: n }, (_, j) => (i === j ? 1 : 0));
      return [...row.map(v => Number(v) || 0), ...identity];
    });
    for(let i = 0; i < n; i++){
      let pivot = aug[i][i];
      if(!pivot){
        for(let r = i + 1; r < n; r++){
          if(aug[r][i]){
            const tmp = aug[i];
            aug[i] = aug[r];
            aug[r] = tmp;
            pivot = aug[i][i];
            break;
          }
        }
      }
      if(!pivot){
        return null;
      }
      for(let c = 0; c < 2 * n; c++){
        aug[i][c] /= pivot;
      }
      for(let r = 0; r < n; r++){
        if(r === i) continue;
        const factor = aug[r][i];
        if(!factor) continue;
        for(let c = 0; c < 2 * n; c++){
          aug[r][c] -= factor * aug[i][c];
        }
      }
    }
    return aug.map(row => row.slice(n));
  };
  return {
    mean,
    transpose,
    multiply,
    inv: invert,
    pinv: invert,
    studentt: {
      cdf: () => 0.5,
      inv: () => 2
    },
    normal: {
      inv: () => 1.96
    },
    chisquare: {
      cdf: () => 0.5
    }
  };
}

describe('Regression model catalog and nonlinear fits', () => {
  let regressionTools;
  let fixture;

  beforeAll(() => {
    jest.resetModules();
    global.Shared = {};
    global.jStat = createJStatStub();
    require('../js/shared/regression.js');
    regressionTools = global.Shared.regressionTools;
    fixture = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, 'fixtures/regression.nonlinear.fixture.json'), 'utf8')
    );
  });

  afterAll(() => {
    delete global.Shared;
    delete global.jStat;
  });

  test('model catalog includes implemented and planned families', () => {
    const models = regressionTools.listModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.find(m => m.id === 'gaussian')?.implemented).toBe(true);
    expect(models.find(m => m.id === 'bindingSaturation')?.implemented).toBe(true);
    expect(models.find(m => m.id === 'enzymeKineticsSubstrate')?.implemented).toBe(true);
  });

  test('gaussian model fits and exposes summary', () => {
    const points = [
      { x: -2, y: 1.3 },
      { x: -1, y: 2.8 },
      { x: 0, y: 4.2 },
      { x: 1, y: 2.9 },
      { x: 2, y: 1.4 }
    ];
    const model = regressionTools.fitRegression(points, {
      modelId: 'gaussian',
      method: 'huber'
    });
    expect(model).toBeTruthy();
    expect(model.mode).toBe('gaussian');
    expect(model.fitMethod).toBe('huber');
    expect(Number.isFinite(model.summary?.parameters?.Center)).toBe(true);
  });

  test('5PL dose-response model fits and reports IC50', () => {
    const points = fixture.doseResponse5pl.map(pt => ({ x: pt.x, y: pt.y }));
    const model = regressionTools.fitRegression(points, {
      modelId: 'doseResponse5pl',
      method: 'wls'
    });
    expect(model).toBeTruthy();
    expect(model.mode).toBe('doseResponse5pl');
    expect(model.fitMethod).toBe('wls');
    expect(Number.isFinite(model.summary?.parameters?.IC50)).toBe(true);
  });

  test('binding and enzyme models return expected primary parameters', () => {
    const bindingModel = regressionTools.fitRegression(
      fixture.bindingSaturation.map(pt => ({ x: pt.x, y: pt.y })),
      { modelId: 'bindingSaturation', method: 'ols' }
    );
    expect(bindingModel).toBeTruthy();
    expect(bindingModel.mode).toBe('bindingSaturation');
    expect(Number.isFinite(bindingModel.summary?.parameters?.Kd)).toBe(true);

    const enzymeModel = regressionTools.fitRegression(
      fixture.enzymeKineticsSubstrate.map(pt => ({ x: pt.x, y: pt.y })),
      { modelId: 'enzymeKineticsSubstrate', method: 'huber' }
    );
    expect(enzymeModel).toBeTruthy();
    expect(enzymeModel.mode).toBe('enzymeKineticsSubstrate');
    expect(enzymeModel.fitMethod).toBe('huber');
    expect(Number.isFinite(enzymeModel.summary?.parameters?.Km)).toBe(true);
  });

  test('fitSpec range and fixed parameters are honored', () => {
    const points = fixture.gaussian.map(pt => ({ x: pt.x, y: pt.y }));
    const model = regressionTools.fitRegression(points, {
      modelId: 'gaussian',
      fitSpec: {
        confidenceLevel: 90,
        range: { minX: -2, maxX: 2 },
        parameters: {
          Sigma: { initial: 1.0, fixed: true }
        }
      }
    });
    expect(model).toBeTruthy();
    expect(model.mode).toBe('gaussian');
    expect(model.fitSpec).toBeTruthy();
    expect(model.fitSpec.confidenceLevel).toBe(90);
    expect(model.warnings.join(' ')).toMatch(/fixed/i);
    expect(Number.isFinite(model.summary?.parameters?.Sigma)).toBe(true);
  });

  test('linear regression falls back when matrix inverse yields non-finite values', () => {
    const originalInv = global.jStat.inv;
    const originalPinv = global.jStat.pinv;
    global.jStat.inv = () => [[NaN, NaN], [NaN, NaN]];
    global.jStat.pinv = () => [[NaN, NaN], [NaN, NaN]];
    try{
      const points = [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 },
        { x: 4, y: 8 }
      ];
      const model = regressionTools.fitRegression(points, {
        modelId: 'linear',
        method: 'ols'
      });
      expect(model).toBeTruthy();
      expect(Number.isFinite(model.summary?.intercept)).toBe(true);
      expect(Number.isFinite(model.summary?.slope)).toBe(true);
      expect(model.summary.intercept).toBeCloseTo(0, 8);
      expect(model.summary.slope).toBeCloseTo(2, 8);
    }finally{
      global.jStat.inv = originalInv;
      global.jStat.pinv = originalPinv;
    }
  });

  test('fit range fallback keeps finite linear metrics when range excludes all points', () => {
    const points = [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
      { x: 4, y: 8 }
    ];
    const model = regressionTools.fitRegression(points, {
      modelId: 'linear',
      method: 'ols',
      fitSpec: {
        range: { minX: 100, maxX: 200 }
      }
    });
    expect(model).toBeTruthy();
    expect(Number.isFinite(model.metrics?.sampleSize)).toBe(true);
    expect(model.metrics.sampleSize).toBe(4);
    expect(Number.isFinite(model.summary?.slope)).toBe(true);
    expect(model.summary.slope).toBeCloseTo(2, 8);
    expect(Array.isArray(model.warnings)).toBe(true);
    expect(model.warnings.join(' ')).toMatch(/using full dataset/i);
  });
});
const fs = require('fs');
const path = require('path');
