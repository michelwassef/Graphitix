const {loadComponentTestBootstrap}=require('../../test-support/componentTestBootstrap');
let policies;
beforeAll(()=>{
  jest.resetModules();
  global.jStat=require('jstat').jStat;
  for(const type of ['line','pie','roc','survival']){ loadComponentTestBootstrap(type); }
  policies=Object.fromEntries(['line','pie','roc','survival'].map(type=>[type,window.Components[type].__testHooks.getAdvisorRecommendation]));
});

const lineAnswers={measurement:'continuousNormal',analysisGoal:'trend',trendShape:'linear',detailLevel:'minimal'};
const lineContext={totalPoints:12,minLength:12,maxLength:12,avgLength:12,xMin:1,yMin:1,regularSpacing:true,minUniqueX:12,hasConstantY:false,showDiagnostics:true};
const rocContext={graphType:'roc',seriesCount:2,positives:25,negatives:25,minPairs:50};
const pieContext={selectedCount:3,validCounts:true,contingency:{ok:true},sparseConcern:false,comparisonCounts:{all:3,reference:2,custom:0},comparisonValidity:{all:{ok:true,sparse:false},reference:{ok:true,sparse:false},custom:{ok:true,sparse:false}},gof:{ok:true,sparse:false,valueColumn:1,expectedColumn:2,observedLabel:'Observed',expectedLabel:'Expected'}};
const survivalContext={groupCount:2,totalEvents:20,zeroEventGroups:[],covariateCount:0,enabledCovariateCount:0,enabledBaselineCovariates:0,enabledTimeCovariates:0,supportsTimeDependent:false,hasLogRank:true};

test.each([
  ['roc',{methodChoice:'delong'},{...rocContext,graphType:'pr'}],
  ['roc',{methodChoice:'permutation'},rocContext],
  ['roc',{methodChoice:'delong'},{...rocContext,positives:1}],
  ['roc',{methodChoice:'bootstrap'},{...rocContext,minPairs:0}],
  ['roc',{methodChoice:'bootstrap'},{...rocContext,seriesCount:1}],
  ['roc',{methodChoice:'bootstrap'},{...rocContext,negatives:0}],
  ['roc',{methodChoice:'bootstrap'},{...rocContext,positives:1}],
  ['pie',{objective:'compare',scope:'all',sparse:'yes'},pieContext],
  ['pie',{objective:'compare',scope:'all',sparse:'no'},{...pieContext,sparseConcern:true}],
  ['pie',{objective:'compare',scope:'custom',sparse:'no'},pieContext],
  ['pie',{objective:'compare',scope:'all',sparse:'no'},{...pieContext,comparisonValidity:{all:{ok:true,sparse:true}}}],
  ['pie',{objective:'compare',scope:'all',sparse:'no'},{...pieContext,comparisonValidity:{all:{ok:false,sparse:false}}}],
  ['pie',{objective:'compare',scope:'all',sparse:'no'},{...pieContext,validCounts:false}],
  ['pie',{objective:'gof',sparse:'no'},{...pieContext,gof:{ok:false,message:'Mismatched totals'}}],
  ['pie',{objective:'gof',sparse:'yes'},pieContext],
  ['line',lineAnswers,{...lineContext,totalPoints:0,minLength:0}],
  ['line',lineAnswers,{...lineContext,minUniqueX:1}],
  ['line',lineAnswers,{...lineContext,hasConstantY:true}],
  ['line',{...lineAnswers,analysisGoal:'forecast',seasonality:'nonSeasonal'},{...lineContext,minLength:3}],
  ['line',{...lineAnswers,measurement:'binaryOutcome'},lineContext],
  ['line',{...lineAnswers,trendShape:'power'},{...lineContext,xMin:0}],
  ['line',{...lineAnswers,trendShape:'power'},{...lineContext,yMin:0}],
  ['line',{...lineAnswers,trendShape:'logistic'},lineContext],
  ['line',{...lineAnswers,trendShape:'exponential'},{...lineContext,yMin:0}],
  ['line',{...lineAnswers,analysisGoal:'forecast',seasonality:'seasonal'},{...lineContext,regularSpacing:false}],
  ['survival',{analysisFocus:'adjust',covariateStrategy:'baseline'},survivalContext],
  ['survival',{analysisFocus:'adjust',covariateStrategy:'none'},{...survivalContext,enabledCovariateCount:1,covariateCount:1}],
  ['survival',{analysisFocus:'adjust',covariateStrategy:'none'},{...survivalContext,groupCount:1,covariateCount:1}],
  ['survival',{analysisFocus:'adjust',covariateStrategy:'baseline'},{...survivalContext,enabledBaselineCovariates:1,enabledTimeCovariates:1,enabledCovariateCount:2}],
  ['survival',{analysisFocus:'adjust',covariateStrategy:'timeDependent'},survivalContext],
  ['survival',{analysisFocus:'compare',comparisonDetail:'hazardRatios'},{...survivalContext,totalEvents:0}],
  ['survival',{analysisFocus:'describe'},{...survivalContext,groupCount:0}]
])('%s blocks an unsupported or incomplete plan (%j)',(type,answers,context)=>{
  const before=JSON.stringify({answers,context});
  const result=policies[type](answers,context);
  expect(result.ready).toBe(false);
  expect(result.message).toBeTruthy();
  expect(JSON.stringify({answers,context})).toBe(before);
});

test('Line describes its actual diagnostics capability and binary/Pearson association',()=>{
  expect(policies.line(lineAnswers,lineContext)).toMatchObject({ready:true,showDiagnostics:true,showIntervals:false});
  const plan=policies.line({...lineAnswers,measurement:'binaryOutcome'},{...lineContext,hasBinaryVariable:true});
  expect(plan).toMatchObject({ready:true,statsMethod:'pearson'});
  expect(plan.rationale.join(' ')).toContain('point-biserial');
});
test('Pie correction follows the proposed comparison family',()=>{
  expect(policies.pie({objective:'compare',scope:'all',sparse:'no'},pieContext)).toMatchObject({ready:true,apply:{test:'chi-square',correction:'holm'}});
  expect(policies.pie({objective:'compare',scope:'reference',sparse:'no'},{...pieContext,comparisonCounts:{reference:1}})).toMatchObject({ready:true,apply:{correction:'none'}});
  expect(policies.pie({objective:'gof',sparse:'no'},pieContext)).toMatchObject({ready:true,apply:{valueColumn:1,expectedColumn:2}});
});
test('ROC retains the requested compatible method',()=>{
  expect(policies.roc({methodChoice:'bootstrap'},{...rocContext,graphType:'pr'})).toMatchObject({ready:true,diffMethod:'bootstrap'});
  expect(policies.roc({methodChoice:'permutation'},{...rocContext,graphType:'pr'})).toMatchObject({ready:true,diffMethod:'permutation'});
});

test('ROC guidance reflects the smaller outcome class, not just the total sample size',()=>{
  const plan=policies.roc({methodChoice:'bootstrap'},{...rocContext,positives:2,negatives:100,minPairs:102});
  expect(plan).toMatchObject({ready:true});
  expect(plan.warnings.join(' ')).toContain('Small class counts');
});

test('Survival distinguishes hazard ratios from survival probabilities and states their assumptions',()=>{
  const plan=policies.survival({analysisFocus:'compare',comparisonDetail:'hazardRatios'},survivalContext);
  expect(plan).toMatchObject({ready:true});
  expect(plan.warnings.join(' ')).toMatch(/proportional hazards/i);
  expect(plan.warnings.join(' ')).toMatch(/independent.*censoring|non-informative censoring/i);
});
test('Survival only offers adjustment when the required predictors are enabled',()=>{
  expect(policies.survival({analysisFocus:'adjust',covariateStrategy:'baseline'},{...survivalContext,enabledCovariateCount:1,enabledBaselineCovariates:1,covariateCount:1})).toMatchObject({ready:true,fitCoxModel:true});
  expect(policies.survival({analysisFocus:'describe'},{...survivalContext,groupCount:1,totalEvents:0})).toMatchObject({ready:true,fitCoxModel:false,showHazardRatios:false});
});

test.each([
 [[0,1,2,3,10],false], [[0,1,1,2],false], [[0,0.1,0.2,0.3],true],
 [[0,1e-8,2e-8,3e-8],true], [[0,1e-8,2e-8,9e-8],false]
])('Line checks every time interval (%j)',(values,expected)=>{
  expect(window.Components.line.__testHooks.hasRegularAdvisorSpacing(values.map(x=>({x,y:1})))).toBe(expected);
});
test('Line requires a genuinely binary Y for logistic fitting',()=>{
  expect(policies.line({...lineAnswers,trendShape:'logistic'},{...lineContext,binaryResponse:true})).toMatchObject({ready:true,regression:'logistic'});
});

test('Line checks the configured season on the shortest series',()=>{
  const answers={...lineAnswers,analysisGoal:'forecast',seasonality:'seasonal'};
  expect(policies.line(answers,{...lineContext,minLength:10,maxLength:30,forecastOptions:{seasonLength:12}})).toMatchObject({ready:false});
  expect(policies.line(answers,{...lineContext,minLength:24,maxLength:24,forecastOptions:{seasonLength:12}})).toMatchObject({ready:true,regression:'holtWinters'});
});
test.each(['curved','flexible'])('Line %s guidance checks the shared model design requirement',trendShape=>{
  expect(policies.line({...lineAnswers,trendShape},{...lineContext,minUniqueX:2})).toMatchObject({ready:false,message:expect.stringContaining('distinct X')});
  expect(policies.line({...lineAnswers,trendShape},{...lineContext,minUniqueX:3})).toMatchObject({ready:true});
});
test('Line forecasting explicitly cautions about serial inference and future validation',()=>{
  const plan=policies.line({...lineAnswers,analysisGoal:'forecast',seasonality:'nonSeasonal'},lineContext);
  expect(plan).toMatchObject({ready:true});
  expect(plan.warnings.join(' ')).toContain('serial dependence');
});
test('Survival permits group-only adjustment with unused covariate columns',()=>{
  expect(policies.survival({analysisFocus:'adjust',covariateStrategy:'none'},{...survivalContext,covariateCount:1})).toMatchObject({ready:true,showHazardRatios:true,fitCoxModel:false});
});
test('Pie validates only the requested pair family beyond the overall test',()=>{
  expect(policies.pie({objective:'compare',scope:'reference',sparse:'no'},{...pieContext,comparisonValidity:{all:{ok:true,sparse:true},reference:{ok:true,sparse:false}}})).toMatchObject({ready:true});
});
