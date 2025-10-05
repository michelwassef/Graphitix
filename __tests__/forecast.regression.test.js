const fs = require('fs');
const path = require('path');

function createJStatStub(){
  const mean = arr => {
    const clean = (arr || []).map(Number).filter(Number.isFinite);
    if(!clean.length) return 0;
    return clean.reduce((sum,val)=>sum+val,0)/clean.length;
  };
  const variance = (arr, sample = true) => {
    const clean = (arr || []).map(Number).filter(Number.isFinite);
    if(clean.length <= 1) return 0;
    const m = mean(clean);
    const denom = sample ? (clean.length - 1) : clean.length;
    return clean.reduce((sum,val)=>sum+Math.pow(val - m,2),0)/Math.max(denom,1);
  };
  const transpose = (matrix = []) => matrix[0].map((_, colIdx) => matrix.map(row => row[colIdx] ?? 0));
  const multiply = (a = [], b = []) => {
    const rows = a.length;
    const cols = b[0]?.length || 0;
    const shared = b.length;
    const result = Array.from({ length: rows }, () => Array(cols).fill(0));
    for(let i=0;i<rows;i++){
      for(let k=0;k<shared;k++){
        const aVal = a[i]?.[k] ?? 0;
        if(!aVal) continue;
        for(let j=0;j<cols;j++){
          result[i][j] += aVal * (b[k]?.[j] ?? 0);
        }
      }
    }
    return result;
  };
  const invert = (matrix = []) => {
    const n = matrix.length;
    const aug = matrix.map((row,i) => {
      const identityRow = Array.from({ length: n }, (_, j) => (i === j ? 1 : 0));
      return [...row.map(val => Number(val) || 0), ...identityRow];
    });
    for(let i=0;i<n;i++){
      let pivot = aug[i][i];
      if(!pivot){
        for(let r=i+1;r<n;r++){
          if(aug[r][i]){
            const temp = aug[i];
            aug[i] = aug[r];
            aug[r] = temp;
            pivot = aug[i][i];
            break;
          }
        }
      }
      if(!pivot) return null;
      const scale = pivot;
      for(let c=0;c<2*n;c++){
        aug[i][c] = aug[i][c] / scale;
      }
      for(let r=0;r<n;r++){
        if(r === i) continue;
        const factor = aug[r][i];
        if(!factor) continue;
        for(let c=0;c<2*n;c++){
          aug[r][c] -= factor * aug[i][c];
        }
      }
    }
    return aug.map(row => row.slice(n));
  };
  const corrcoeff = (x = [], y = []) => {
    const mx = mean(x);
    const my = mean(y);
    let num = 0;
    let dx2 = 0;
    let dy2 = 0;
    for(let i=0;i<x.length;i++){
      const xv = Number(x[i]);
      const yv = Number(y[i]);
      if(!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
      const dx = xv - mx;
      const dy = yv - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    return denom === 0 ? 0 : num / denom;
  };
  const rank = arr => {
    const pairs = arr.map((value,index)=>({ value:Number(value), index })).sort((a,b)=>a.value-b.value);
    const ranks = new Array(arr.length).fill(0);
    let i=0;
    while(i<pairs.length){
      let j=i;
      while(j<pairs.length && pairs[j].value === pairs[i].value){ j++; }
      const rankValue = (i + j + 1) / 2;
      for(let k=i;k<j;k++){ ranks[pairs[k].index] = rankValue; }
      i=j;
    }
    return ranks;
  };
  return {
    mean,
    variance,
    transpose,
    multiply,
    inv: invert,
    pinv: invert,
    corrcoeff,
    spearmancoeff: (x,y) => corrcoeff(rank(x), rank(y)),
    studentt: {
      cdf: () => 0.5,
      inv: () => 2
    },
    chisquare: {
      cdf: () => 0.5
    },
    normal: {
      inv: () => 1.96
    }
  };
}

describe('Forecast regression tools', () => {
  let regressionTools;
  let dataset;

  beforeAll(() => {
    jest.resetModules();
    const fixturePath = path.resolve(__dirname, 'fixtures/line.forecast.dataset.json');
    dataset = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    global.Shared = {};
    global.jStat = createJStatStub();
    require('../js/shared/regression.js');
    regressionTools = global.Shared.regressionTools;
    expect(regressionTools).toBeTruthy();
  });

  afterAll(() => {
    delete global.Shared;
    delete global.jStat;
  });

  test('ARIMA forecast provides horizon and accuracy metrics', () => {
    const points = dataset.arimaSeries.map(pt => ({ x: pt.x, y: pt.y }));
    const model = regressionTools.fitRegression(points, {
      mode: 'arima',
      alpha: 0.05,
      forecast: {
        horizon: 4,
        autoTune: true,
        maxP: 3,
        maxD: 1,
        criterion: 'bic'
      }
    });
    expect(model).toBeTruthy();
    expect(model.mode).toBe('arima');
    expect(model.forecast).toBeTruthy();
    expect(Array.isArray(model.forecast.points)).toBe(true);
    expect(model.forecast.points.length).toBe(4);
    expect(model.metrics).toEqual(expect.objectContaining({ horizon: expect.any(Number) }));
    expect(model.summary.parameters).toEqual(expect.objectContaining({ 'AR order (p)': expect.any(Number) }));
    const firstForecast = model.forecast.points[0];
    expect(firstForecast).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  test('Holt-Winters forecast exposes seasonal structure', () => {
    const points = dataset.holtWintersSeries.map(pt => ({ x: pt.x, y: pt.y }));
    const model = regressionTools.fitRegression(points, {
      mode: 'holtWinters',
      alpha: 0.05,
      forecast: {
        horizon: 4,
        seasonLength: 4,
        autoTune: false,
        level: 0.4,
        trend: 0.2,
        seasonal: 0.3
      }
    });
    expect(model).toBeTruthy();
    expect(model.mode).toBe('holtWinters');
    expect(model.forecast).toBeTruthy();
    expect(Array.isArray(model.forecast.points)).toBe(true);
    expect(model.forecast.points.length).toBe(4);
    expect(model.summary.parameters).toEqual(expect.objectContaining({ 'Season length': expect.any(Number) }));
    expect(model.summary.parameters).toEqual(expect.objectContaining({ 'Seasonal 1': expect.any(Number) }));
    expect(model.metrics).toEqual(expect.objectContaining({ mae: expect.any(Number) }));
  });
});
