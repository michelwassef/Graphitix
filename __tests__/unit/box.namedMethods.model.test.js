describe('Box named multiple-comparison engines',()=>{
  let model;
  beforeAll(()=>{
    jest.resetModules();
    global.Shared={};
    global.jStat=require('jstat').jStat;
    require('../../js/shared/stats.js');
    require('../../js/shared/boxStatsModel.js');
    model=global.Shared.boxStatsModel;
  });
  test('Dunnett reduces to the unadjusted pooled t-test for one treatment',()=>{
    const groups=[[1,3,4],[4,7,8,9]];
    const result=model.computeDunnettComparisons(groups,['C','T'],0);
    expect(result.ok).toBe(true);
    const expected=model.tTestEqualVariance(...groups);
    expect(result.pairs[0].pAdj).toBeCloseTo(expected.p,12);
    expect(result.pairs[0].ciLow).toBeCloseTo(expected.ciLow,9);
    expect(result.pairs[0].ciHigh).toBeCloseTo(expected.ciHigh,9);
  });
  test('Dunnett T3 reduces to Welch for one pair',()=>{
    const groups=[[1,3,4],[4,7,8,9]];
    const result=model.computeDunnettT3Comparisons(groups,['A','B']);
    expect(result.ok).toBe(true);
    const expected=model.tTest(...groups);
    expect(result.pairs[0].pAdj).toBeCloseTo(expected.p,12);
    expect(result.pairs[0].ciLow).toBeCloseTo(expected.ciLow,9);
    expect(result.pairs[0].ciHigh).toBeCloseTo(expected.ciHigh,9);
  });
  test('independent maximum modulus has the exact normal limit',()=>{
    const q=2.7,m=6;
    const expected=1-Math.pow(1-2*global.jStat.normal.cdf(-q,0,1),m);
    expect(model.studentizedMaximumSF(q,Infinity,new Array(m).fill(0))).toBeCloseTo(expected,10);
  });
  test('named engines reject unavailable variances and preserve zero differences',()=>{
    expect(model.computeDunnettComparisons([[1,1],[2,2]],[],0).ok).toBe(false);
    expect(model.computeDunnettT3Comparisons([[1,1],[2,2]],[]).ok).toBe(false);
    expect(model.computeDunnettComparisons([[1,2,3],[1,2,3]],[],0).pairs[0].pAdj).toBe(1);
  });
  test('ROUT fits a constant location, excludes an extreme and preserves indices',()=>{
    const values=[8,9,10,11,12,9,10,11,10,100];
    const result=model.detectRoutOutliers(values);
    expect(result.converged).toBe(true);
    expect(result.removed.map(item=>item.index)).toEqual([9]);
    expect(result.kept).toEqual(values.slice(0,9));
    expect(result.center).toBeGreaterThan(9);
    expect(result.center).toBeLessThan(11);
  });
  test('ROUT leaves small or constant samples intact and is affine invariant',()=>{
    expect(model.detectRoutOutliers([1,2,50]).removed).toEqual([]);
    expect(model.detectRoutOutliers([3,3,3,3]).removed).toEqual([]);
    const values=[8,9,10,11,12,9,10,11,10,100];
    const original=model.detectRoutOutliers(values);
    const shifted=model.detectRoutOutliers(values.map(value=>17-3*value));
    expect(shifted.removed.map(item=>item.index)).toEqual([9]);
    expect(shifted.center).toBeCloseTo(17-3*original.center,8);
    expect(shifted.rsdr).toBeCloseTo(3*original.rsdr,8);
  });
  test('ROUT custom comparisons and ordinary results use the same screened observations',()=>{
    const selection=[{index:7,label:'A',values:[8,9,10,11,12,9,10,11,10,100]},{index:9,label:'B',values:[3,3,5,5,8,3,5,5,6,5]}];
    for(const statsPaired of [false,true]){
      const base={mode:'single',statsMode:'all',statsTest:'parametric',statsParametricVariant:'classic',statsPaired,statsOutlierMode:'routTest',selection};
      const ordinary=model.computeBoxStatsModel(base);
      const custom=model.computeBoxStatsModel({...base,statsMode:'custom',statsCustomPairs:[{ai:7,bi:9}]});
      expect(custom.ok).toBe(true);
      expect(custom.outlierAudit.exclusions).toHaveLength(1);
      expect(custom.groupSummaries).toEqual(ordinary.groupSummaries);
      expect(custom.pairs[0].p).toBeCloseTo(ordinary.pairs[0].p,12);
      expect(custom.report.analysisSpec.outlierQ).toBe(0.01);
    }
  });
  test('ROUT paired screening reports the original source-row ID',()=>{
    const a=[8,9,10,11,12,9,10,11,10,100],b=a.map(()=>0),rows=[0,2,3,4,5,6,7,8,9,11];
    const result=model.preprocessStatsGroups([a,b],['A','B'],{statsPaired:true,statsMode:'all',statsOutlierMode:'routTest',rowIndicesByGroup:[rows,rows]});
    expect(result.groups.map(group=>group.length)).toEqual([9,9]);
    expect(result.exclusions.map(item=>item.index)).toEqual([11]);
    expect(result.auditNotes.join(' ')).toContain('paired differences');
  });
  test('new post-hoc methods have explicit scopes and do not reinterpret saved Sidak choices',()=>{
    const groups=[[10,12,15,19],[20,21,25],[4,8,9,11,14,18]];
    const selection=groups.map((values,index)=>({values,index,label:String(index)}));
    const base={mode:'single',statsMode:'reference',statsRef:1,statsTest:'parametric',statsParametricVariant:'classic',statsCiLevel:0.9,selection};
    const dunnett=model.computeBoxStatsModel({...base,statsPostHoc:'dunnettTest'});
    expect(dunnett.ok).toBe(true);
    expect(dunnett.effectivePostHoc).toBe('dunnettTest');
    expect(dunnett.effectiveAnalysisSpec.ciType).toBe('simultaneous');
    const sidak=model.computeBoxStatsModel({...base,statsPostHoc:'dunnett'});
    expect(sidak.effectivePostHoc).toBe('dunnett');
    expect(sidak.effectiveAnalysisSpec.ciType).toBe('sidak-adjusted-marginal');
    const t3=model.computeBoxStatsModel({...base,statsMode:'all',statsPostHoc:'dunnettT3Test'});
    expect(t3.ok).toBe(true);
    expect(t3.pairs).toHaveLength(3);
    expect(t3.effectiveAnalysisSpec.effectiveAlternative).toBe('two-sided');
    expect(model.computeBoxStatsModel({...base,statsPostHoc:'dunnettT3Test'}).ok).toBe(false);
  });
});
