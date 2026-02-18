/**
 * Regression persistence and configuration coverage.
 */

describe('Regression controls persistence', () => {
  beforeEach(() => {
    jest.resetModules();
    const mean = arr => {
      const numeric = arr.map(v => Number(v)).filter(v => Number.isFinite(v));
      if(!numeric.length) return 0;
      return numeric.reduce((sum,val)=>sum+val,0)/numeric.length;
    };
    const corrcoeff = (x, y) => {
      const mx = mean(x);
      const my = mean(y);
      let num = 0;
      let denomX = 0;
      let denomY = 0;
      for(let i=0;i<x.length;i++){
        const xv = Number(x[i]);
        const yv = Number(y[i]);
        if(!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
        const dx = xv - mx;
        const dy = yv - my;
        num += dx*dy;
        denomX += dx*dx;
        denomY += dy*dy;
      }
      const denom = Math.sqrt(denomX*denomY);
      return denom === 0 ? 0 : num/denom;
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
    global.jStat = {
      mean,
      corrcoeff,
      spearmancoeff: (x,y) => corrcoeff(rank(x), rank(y)),
      studentt: {
        cdf: () => 0.5
      }
    };
    global.Shared = global.Shared || {};
    global.Components = global.Components || {};
    require('../js/vendor.js');
    require('../js/shared/debounce.js');
    require('../js/shared/resizer.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/hot.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/regression.js');
    require('../js/components/scatter.js');
    require('../js/components/line.js');
  });

  test('Scatter regression payload captures summary', async () => {
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();
    scatter.ensure();

    const payload = scatter.getPayload();
    const data = payload.data;
    data[0][0] = 'Label';
    data[0][1] = 'X';
    data[0][2] = 'Y';
    data[1][0] = 'A'; data[1][1] = 0; data[1][2] = 0;
    data[2][0] = 'B'; data[2][1] = 1; data[2][2] = 0;
    data[3][0] = 'C'; data[3][1] = 2; data[3][2] = 1;
    data[4][0] = 'D'; data[4][1] = 3; data[4][2] = 1;

    const showLine = document.getElementById('scatterShowLine');
    showLine.checked = true;
    showLine.dispatchEvent(new window.Event('change'));

    const regressionSelect = document.getElementById('scatterRegressionMode');
    regressionSelect.value = 'logistic';
    regressionSelect.dispatchEvent(new window.Event('change'));

    scatter.draw();
    // Allow initial draw/UI sync, then compute stats explicitly (required for summaries).
    for (let i = 0; i < 25; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const computeBtn = document.getElementById('scatterComputeStats');
    expect(computeBtn).toBeTruthy();
    // Button enablement is async; give it a moment.
    for (let i = 0; i < 25 && computeBtn.disabled; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(computeBtn.disabled).toBe(false);
    computeBtn.click();
    for (let i = 0; i < 25; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const nextPayload = scatter.getPayload();
    expect(nextPayload.config.regression.mode).toBe('logistic');
    const summary = nextPayload.config.regression.summary;
    expect(summary).toBeTruthy();
    expect(summary.metrics).toEqual(expect.objectContaining({
      sampleSize: expect.any(Number)
    }));
    expect(summary.residuals).toEqual(expect.objectContaining({
      mean: expect.any(Number),
      sd: expect.any(Number)
    }));
  });

  test('Logistic regression can summarize non-binary responses with IC50', () => {
    const regressionTools = window.Shared?.regressionTools;
    expect(regressionTools).toBeTruthy();

    const points = [
      { x: -9.0, y: 1525 },
      { x: -8.2, y: 1480 },
      { x: -7.6, y: 1320 },
      { x: -7.0, y: 1025 },
      { x: -6.5, y: 760 },
      { x: -6.0, y: 500 },
      { x: -5.4, y: 340 },
      { x: -4.8, y: 290 },
      { x: -4.2, y: 260 }
    ];

    const model = regressionTools.fitRegression(points, {
      mode: 'logistic',
      preferDoseResponse: true,
      alpha: 0.05
    });
    expect(model).toBeTruthy();
    expect(model.mode).toBe('doseResponse4pl');
    expect(Number.isFinite(model.summary?.parameters?.IC50)).toBe(true);
    expect(Number.isFinite(model.summary?.parameters?.LogIC50)).toBe(true);

    const summary = regressionTools.createSummary(model);
    expect(summary).toBeTruthy();
    expect(summary.mode).toBe('doseResponse4pl');
    expect(Number.isFinite(summary.summary?.parameters?.IC50)).toBe(true);

    const ic50Stat = Array.isArray(summary.coefficientStats)
      ? summary.coefficientStats.find(entry => entry.term === 'IC50')
      : null;
    expect(ic50Stat).toBeTruthy();
    expect(Number.isFinite(ic50Stat.estimate)).toBe(true);
  });

  test('Line regression payload stores per-series summaries', async () => {
    const line = window.Components?.line;
    expect(line).toBeTruthy();
    line.ensure();

    const hot = line.getHot();
    expect(hot).toBeTruthy();
    const matrix = hot.getData();
    matrix[0][0] = 'X';
    matrix[0][1] = 'Series1';
    matrix[0][2] = 'Series2';
    matrix[1][0] = 0; matrix[1][1] = 1; matrix[1][2] = 1;
    matrix[2][0] = 1; matrix[2][1] = 4; matrix[2][2] = 1;
    matrix[3][0] = 2; matrix[3][1] = 9; matrix[3][2] = 4;
    matrix[4][0] = 3; matrix[4][1] = 16; matrix[4][2] = 9;
    hot.loadData(matrix);

    const regressionSelect = document.getElementById('lineRegressionMode');
    regressionSelect.value = 'linear';
    regressionSelect.dispatchEvent(new window.Event('change'));

    line.draw();
    await new Promise(resolve => setTimeout(resolve, 0));

    const saved = line.getPayload();
    expect(saved.config.regression.mode).toBe('linear');
    const summaries = saved.config.regression.seriesSummaries;
    expect(Array.isArray(summaries)).toBe(true);
    expect(summaries.length).toBeGreaterThan(0);
    const firstSummary = summaries[0];
    expect(firstSummary).toEqual(expect.objectContaining({
      mode: 'linear',
      name: 'Series1'
    }));
    expect(firstSummary.summary).toBeTruthy();
    expect(firstSummary.summary.metrics).toEqual(expect.objectContaining({
      sampleSize: expect.any(Number)
    }));
  });
});
