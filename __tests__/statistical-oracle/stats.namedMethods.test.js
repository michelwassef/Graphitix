const {runPythonOracle,indexOracleResults,expectClose,testWithOracle}=require('../../test-support/statsMatrixSuite');

describe('Named Box methods independent reference comparisons',()=>{
  let model;
  beforeAll(()=>{
    global.Shared=window.Shared={};global.jStat=window.jStat=require('jstat').jStat;
    require('../../js/shared/stats.js');require('../../js/shared/boxStatsModel.js');
    model=window.Shared.boxStatsModel;
  });
  testWithOracle('Dunnett matches SciPy with unequal sizes, a non-first control and 90% simultaneous intervals',()=>{
    const groups=[[10,12,15,19],[20,21,25],[4,8,9,11,14,18]];
    const expected=indexOracleResults(runPythonOracle([{id:'d',operation:'box_named_comparisons',payload:{groups,referenceIndex:1,ciLevel:0.9,method:'dunnett'}}])).get('d').result;
    const actual=model.computeDunnettComparisons(groups,[],1,{ciLevel:0.9});
    actual.pairs.forEach((pair,index)=>{
      for(const field of ['diff','se','df','t','p']) expectClose(pair[field],expected.pairs[index][field],field,{abs:1e-8,rel:1e-8});
      expectClose(pair.pAdj,expected.pairs[index].pAdj,'SciPy multivariate-t p',{abs:2e-5,rel:0});
      for(const field of ['ciLow','ciHigh']) expectClose(pair[field],expected.pairs[index][field],'SciPy Dunnett '+field,{abs:0.012,rel:0});
    });
  });
  testWithOracle('T3 matches independent SciPy chi-square integration, using continuous Welch df',()=>{
    const groups=[[1,2,3],[2,5,10,12],[0,1,2,3,4,5]];
    const expected=indexOracleResults(runPythonOracle([{id:'t3',operation:'box_named_comparisons',payload:{groups,ciLevel:0.9,method:'t3'}}])).get('t3').result;
    const actual=model.computeDunnettT3Comparisons(groups,[],{ciLevel:0.9});
    actual.pairs.forEach((pair,index)=>{
      for(const field of ['diff','se','df','t','p','pAdj','ciLow','ciHigh']) expectClose(pair[field],expected.pairs[index][field],'T3 '+field,{abs:2e-7,rel:2e-7});
    });
  });
  testWithOracle('ROUT adaptive fit agrees with an independent SciPy solution of the published score equations',()=>{
    const samples=[[8,9,10,11,12,9,10,11,10,100],[-2,-1,0,1,2,-1,0,1,0,35,40],[0.5,1,1.5,2,2.5,3,3.5,4,4.5,5]];
    const references=indexOracleResults(runPythonOracle(samples.map((values,index)=>({id:String(index),operation:'box_rout_location',payload:{values}}))));
    samples.forEach((values,index)=>{
      const expected=references.get(String(index)).result,actual=model.detectRoutOutliers(values);
      expect(actual.converged).toBe(true);
      expectClose(actual.center,expected.center,'ROUT center',{abs:2e-7,rel:0});
      expectClose(actual.rsdr,expected.rsdr,'ROUT RSDR',{abs:2e-7,rel:0});
      expect(actual.removed.map(item=>item.index)).toEqual(expected.removed);
      expect(Math.abs(expected.score)).toBeLessThan(1e-7);
    });
  });
  testWithOracle('maximum-t integration agrees with SciPy for near-perfect control correlation, low df and extreme tails',()=>{
    const cases=[
      {q:2.5,df:25,loadings:[0.999,0.998,0.9]},
      {q:1000,df:1.01,loadings:[0,0,0,0,0,0]},
      {q:4,df:100000,loadings:[0.1,0.6,0.8,0.2]},
      {q:1.3,df:2.2,loadings:[0,0,0]}
    ];
    const references=indexOracleResults(runPythonOracle(cases.map((payload,index)=>({id:String(index),operation:'box_studentized_maximum',payload}))));
    cases.forEach((payload,index)=>{
      const actual=model.studentizedMaximumSF(payload.q,payload.df,payload.loadings);
      expectClose(actual,references.get(String(index)).result.p,'SciPy maximum-t edge '+index,{abs:2e-5,rel:0});
      expect(model.studentizedMaximumSF(payload.q*2,payload.df,payload.loadings)).toBeLessThan(actual);
    });
  });
});
