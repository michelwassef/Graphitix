/* Shared Box statistics and swarm model.
 * Pure computation layer used by both js/components/box.js and js/workers/box.worker.js.
 * Keep this file DOM-free: callers provide data/options and receive renderable models.
 */
(function(root){
  'use strict';

  const ctx = root || (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
  const global = ctx;
  const Shared = ctx.Shared = ctx.Shared || {};
  const JSTAT_URL = '../../libs/jstat.min.js';
  const STATS_URL = '../shared/stats.js';
  const P_VALUE_FORMATTER_URL = '../shared/pValueFormatter.js';

  function logDebug(message, payload){
    if(typeof Shared.debug === 'function'){
      Shared.debug(message, payload);
    }
  }

  function ensureStats(){
    if(Shared.stats && typeof Shared.stats.adjustPValues === 'function'){
      return Shared.stats;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts(STATS_URL);
    }
    if(Shared.stats && typeof Shared.stats.adjustPValues === 'function'){
      return Shared.stats;
    }
    throw new Error('Shared.stats unavailable for Box statistics');
  }

  function getPValueFormatter(){
    if(Shared.pValueFormatter && typeof Shared.pValueFormatter.format === 'function'){
      return Shared.pValueFormatter;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts(P_VALUE_FORMATTER_URL);
    }
    return Shared.pValueFormatter && typeof Shared.pValueFormatter.format === 'function'
      ? Shared.pValueFormatter
      : null;
  }

  function toNumericPValue(value){
    const formatter = getPValueFormatter();
    if(typeof formatter?.toNumericValue === 'function'){
      return formatter.toNumericValue(value);
    }
    if(value === null || value === undefined || typeof value === 'boolean' || typeof value === 'symbol'){
      return NaN;
    }
    if(typeof value !== 'number' && typeof value !== 'string' && !(value instanceof Number)){
      return NaN;
    }
    if(typeof value === 'string' && value.trim() === ''){
      return NaN;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : NaN;
  }

  function isValidProbability(value){
    const numeric = toNumericPValue(value);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1;
  }

  function ensureJStat(){
    if(ctx.jStat){
      return ctx.jStat;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts(JSTAT_URL);
    }
    if(ctx.jStat){
      return ctx.jStat;
    }
    throw new Error('jStat unavailable for Box statistics');
  }

  const DEFAULT_CORRECTION = 'holm';
  const ASSUMPTION_ALPHA = 0.05;
  const ASSUMPTION_QQ_SAMPLE_LIMIT = 4000;
  const BOX_ROW_RANDOM_SPHERICITY_VERSION = 'row-random-sphericity-v1';
  // One million Float64 cells is about 8 MB per effect; larger corrections
  // are returned unavailable while descriptive ANOVA values remain available.
  const BOX_SPHERICITY_MAX_COVARIANCE_CELLS = 1_000_000;

  function sanitizeStatsAlternative(value){
    return value==='greater' || value==='less' ? value : 'two-sided';
  }

  function sanitizeStatsCiLevel(value, fallback=0.95){
    const numeric=Number(value);
    if(Number.isFinite(numeric) && numeric>0.5 && numeric<1){
      return numeric;
    }
    return fallback;
  }

  function resolveStudentTPValue(t, df, alternative){
    const safeAlternative=sanitizeStatsAlternative(alternative);
    if(!Number.isFinite(t) || !Number.isFinite(df) || !(df>0)){
      if(t===Infinity){
        return safeAlternative==='less' ? 1 : 0;
      }
      if(t===-Infinity){
        return safeAlternative==='greater' ? 1 : 0;
      }
      return NaN;
    }
    let stats=null;
    try{
      stats=ensureStats();
    }catch(err){
      logDebug('Debug: box stats Student t distribution unavailable',{ message:err?.message || String(err) });
    }
    const upper=stats?.studentTUpperTail;
    if(typeof upper==='function'){
      if(safeAlternative==='greater'){
        return resolvePValue(upper(t,df));
      }
      if(safeAlternative==='less'){
        return resolvePValue(upper(-t,df));
      }
    }
    return studentTTwoSidedPValue(t,df);
  }

  function resolveDirectionalTCritical(df, ciLevel, alternative){
    const inv=global.jStat?.studentt?.inv;
    if(typeof inv!=='function' || !Number.isFinite(df) || !(df>0)){
      return NaN;
    }
    const safeLevel=sanitizeStatsCiLevel(ciLevel,0.95);
    const safeAlternative=sanitizeStatsAlternative(alternative);
    const probability=safeAlternative==='two-sided'
      ? 1-((1-safeLevel)/2)
      : safeLevel;
    try{
      return inv(probability,df);
    }catch(err){
      logDebug('Debug: box stats directional t critical failed',{ df, ciLevel:safeLevel, alternative:safeAlternative, message:err?.message || String(err) });
      return NaN;
    }
  }

  function createTInterval(diff,se,df,options={}){
    const alternative=sanitizeStatsAlternative(options.alternative);
    const ciLevel=sanitizeStatsCiLevel(options.ciLevel,0.95);
    const critical=resolveDirectionalTCritical(df,ciLevel,alternative);
    if(!Number.isFinite(diff) || !Number.isFinite(se) || !Number.isFinite(critical)){
      return { ciLow:NaN, ciHigh:NaN, ciLevel, alternative };
    }
    const margin=critical*se;
    if(alternative==='greater'){
      return { ciLow:diff-margin, ciHigh:Infinity, ciLevel, alternative };
    }
    if(alternative==='less'){
      return { ciLow:-Infinity, ciHigh:diff+margin, ciLevel, alternative };
    }
    return { ciLow:diff-margin, ciHigh:diff+margin, ciLevel, alternative };
  }

  function sanitizeStatsAlpha(value,fallback=0.05){
    const numeric=Number(value);
    if(Number.isFinite(numeric) && numeric>0 && numeric<0.5){
      return numeric;
    }
    return fallback;
  }
  function sanitizeStatsSeed(value,fallback=1337){
    const numeric=Math.round(Number(value));
    if(Number.isFinite(numeric)){
      return numeric;
    }
    return fallback;
  }
  function sanitizeResamplingMode(value){
    return value==='exact' || value==='monte-carlo' || value==='asymptotic' ? value : 'auto';
  }
  function sanitizeMonteCarloIterations(value,fallback=10000){
    const numeric=Math.round(Number(value));
    if(Number.isFinite(numeric) && numeric>=250 && numeric<=200000){
      return numeric;
    }
    return fallback;
  }
  function computeEtaSquared(ssEffect,ssTotal){
    if(!Number.isFinite(ssEffect) || !Number.isFinite(ssTotal) || ssTotal<=0){
      return NaN;
    }
    return clamp(ssEffect/ssTotal,0,1);
  }
  function computePartialEtaSquared(ssEffect,ssError){
    if(!Number.isFinite(ssEffect) || !Number.isFinite(ssError)){
      return NaN;
    }
    const denom=ssEffect+ssError;
    if(!(denom>0)){
      return NaN;
    }
    return clamp(ssEffect/denom,0,1);
  }
  function computeOmegaSquared(ssEffect,dfEffect,msError,ssTotal){
    if(!Number.isFinite(ssEffect) || !Number.isFinite(dfEffect) || !Number.isFinite(msError) || !Number.isFinite(ssTotal)){
      return NaN;
    }
    const denom=ssTotal+msError;
    if(!(denom>0)){
      return NaN;
    }
    return clamp((ssEffect-(dfEffect*msError))/denom,0,1);
  }
  function computeKruskalEpsilonSquared(H,k,n){
    if(!Number.isFinite(H) || !Number.isFinite(k) || !Number.isFinite(n)){
      return NaN;
    }
    const denom=n-k;
    if(!(denom>0)){
      return NaN;
    }
    return clamp((H-k+1)/denom,0,1);
  }
  function computeKendallsW(Q,n,k){
    if(!Number.isFinite(Q) || !Number.isFinite(n) || !Number.isFinite(k) || !(n>0) || !(k>1)){
      return NaN;
    }
    return clamp(Q/(n*(k-1)),0,1);
  }
  function createSeededRandom(seed){
    let rng=resolveStatsSeed({ seed }) >>> 0;
    return ()=>{
      rng=(rng*1664525 + 1013904223) >>> 0;
      return rng / 4294967295;
    };
  }
  function shuffleInPlace(array,nextRand){
    for(let i=array.length-1; i>0; i--){
      const j=Math.floor(nextRand() * (i + 1));
      const tmp=array[i];
      array[i]=array[j];
      array[j]=tmp;
    }
    return array;
  }
  function factorialInt(n){
    let value=1;
    for(let i=2; i<=n; i++){
      value*=i;
    }
    return value;
  }
  function multinomialCount(counts){
    const total=(Array.isArray(counts)?counts:[]).reduce((sum,val)=>sum+(Number(val)||0),0);
    let value=factorialInt(total);
    (Array.isArray(counts)?counts:[]).forEach(count=>{
      value/=factorialInt(Number(count)||0);
    });
    return value;
  }
  function createPooledAssignmentLabels(counts){
    const labels=[];
    (Array.isArray(counts)?counts:[]).forEach((count,groupIdx)=>{
      for(let i=0; i<(Number(count)||0); i++){
        labels.push(groupIdx);
      }
    });
    return labels;
  }
  function computeEmpiricalPValue(observed, sampled, alternative, options={}){
    const safeAlt=sanitizeStatsAlternative(alternative);
    const mode=options?.mode || 'absolute';
    const center=Number.isFinite(Number(options?.center)) ? Number(options.center) : 0;
    let hits=1;
    const total=(Array.isArray(sampled)?sampled.length:0)+1;
    const obs=Number(observed);
    (Array.isArray(sampled)?sampled:[]).forEach(value=>{
      const simulated=Number(value);
      if(!Number.isFinite(simulated)){
        return;
      }
      let extreme=false;
      if(safeAlt==='greater'){
        extreme=simulated>=obs;
      }else if(safeAlt==='less'){
        extreme=simulated<=obs;
      }else if(mode==='signed'){
        extreme=Math.abs(simulated-center)>=Math.abs(obs-center);
      }else{
        extreme=Math.abs(simulated)>=Math.abs(obs);
      }
      if(extreme){
        hits+=1;
      }
    });
    return hits/Math.max(total,1);
  }
  function enumerateRankAssignmentsExact(counts,visitor){
    const remaining=counts.slice();
    const k=remaining.length;
    const rankSums=new Array(k).fill(0);
    const total=remaining.reduce((sum,val)=>sum+val,0);
    function visit(rank){
      if(rank>total){
        visitor(rankSums);
        return;
      }
      for(let g=0; g<k; g++){
        if(remaining[g]<=0){
          continue;
        }
        remaining[g]-=1;
        rankSums[g]+=rank;
        visit(rank+1);
        rankSums[g]-=rank;
        remaining[g]+=1;
      }
    }
    visit(1);
  }
  function generatePermutations(values){
    const source=(Array.isArray(values)?values:[]).slice();
    const permutations=[];
    function visit(index){
      if(index>=source.length){
        permutations.push(source.slice());
        return;
      }
      for(let i=index; i<source.length; i++){
        const tmp=source[index];
        source[index]=source[i];
        source[i]=tmp;
        visit(index+1);
        source[i]=source[index];
        source[index]=tmp;
      }
    }
    visit(0);
    return permutations;
  }
  function tryResolveStudentizedRangeCritical(alpha,groups,df,initialGuess){
    let q=Number(initialGuess);
    let evaluations=0;
    if(!(Number.isFinite(q) && q>0)) return { critical:NaN,evaluations };
    for(let iteration=0;iteration<8;iteration+=1){
      evaluations+=1;
      const evaluation=studentizedRangeSurvivalAndDensity(q,groups,df);
      if(!evaluation || !(Number.isFinite(evaluation.probability) && Number.isFinite(evaluation.density))){
        return { critical:NaN,evaluations };
      }
      const residual=evaluation.probability-alpha;
      const quantileTolerance=1e-8*Math.max(1,Math.abs(q));
      if(!(evaluation.density>0)) return { critical:NaN,evaluations };
      const correction=residual/evaluation.density;
      if(!(Number.isFinite(correction) && Math.abs(correction)<=Math.max(0.5,Math.abs(q)*0.5))){
        return { critical:NaN,evaluations };
      }
      if(Math.abs(correction)<=quantileTolerance*32){
        if(residual>0){
          evaluations+=1;
          const upperTail=studentizedRangeSF(q+quantileTolerance,groups,df);
          if(Number.isFinite(upperTail) && upperTail<=alpha){
            return { critical:q+(quantileTolerance/2),evaluations };
          }
        }else if(residual<0){
          const lower=Math.max(0,q-quantileTolerance);
          evaluations+=1;
          const lowerTail=studentizedRangeSF(lower,groups,df);
          if(Number.isFinite(lowerTail) && lowerTail>=alpha){
            return { critical:(lower+q)/2,evaluations };
          }
        }else{
          const lower=Math.max(0,q-quantileTolerance);
          evaluations+=2;
          const lowerTail=studentizedRangeSF(lower,groups,df);
          const upperTail=studentizedRangeSF(q+quantileTolerance,groups,df);
          if(Number.isFinite(lowerTail) && Number.isFinite(upperTail) && lowerTail>=alpha && upperTail<=alpha){
            return { critical:q,evaluations };
          }
        }
      }
      const next=q+correction;
      if(!(Number.isFinite(next) && next>0 && next!==q)) return { critical:NaN,evaluations };
      q=next;
    }
    return { critical:NaN,evaluations };
  }

  function resolveStudentizedRangeCritical(alpha,r,df,initialGuess=null){
    const tailAlpha=Number(alpha);
    const groups=Number(r);
    const dof=Number(df);
    if(!(Number.isFinite(tailAlpha) && tailAlpha>=0 && tailAlpha<=1)
      || !(Number.isInteger(groups) && groups>=2)
      || !(dof===Number.POSITIVE_INFINITY || (Number.isFinite(dof) && dof>0))){
      return NaN;
    }
    if(tailAlpha===0) return Number.POSITIVE_INFINITY;
    if(tailAlpha===1) return 0;

    if(groups===2){
      const quantileProbability=1-(tailAlpha/2);
      const quantile=dof===Number.POSITIVE_INFINITY
        ? global.jStat?.normal?.inv?.(quantileProbability,0,1)
        : global.jStat?.studentt?.inv?.(quantileProbability,dof);
      if(Number.isFinite(quantile) && quantile>=0){
        return Math.SQRT2*quantile;
      }
    }

    let low=0;
    let lowTail=1;
    let high=Math.max(4,Math.sqrt(2*Math.log(groups))+3);
    let highTail=NaN;
    const evaluateTail=q=>studentizedRangeSF(q,groups,dof);
    let evaluations=0;
    const evaluate=q=>{
      evaluations+=1;
      return evaluateTail(q);
    };
    const finish=critical=>{
      logDebug('Debug: box studentizedRange critical',{ alpha:tailAlpha, groups, df:dof, critical, evaluations });
      return critical;
    };
    const jStat=global.jStat;
    const studentTInverse=jStat?.studentt?.inv;
    const suppliedGuess=Number(initialGuess);
    const hasSuppliedGuess=Number.isFinite(suppliedGuess) && suppliedGuess>0;
    const tailGuess=hasSuppliedGuess
      ? suppliedGuess
      : (typeof studentTInverse==='function'
        ? Math.SQRT2*studentTInverse(1-(tailAlpha/(2*groups)),dof)
        : NaN);
    const probabilityTolerance=tailAlpha*1e-9;
    if(tailAlpha>=1e-8 && Number.isFinite(tailGuess) && tailGuess>0){
      const fastResult=tryResolveStudentizedRangeCritical(tailAlpha,groups,dof,tailGuess);
      evaluations+=fastResult.evaluations;
      if(Number.isFinite(fastResult.critical)) return finish(fastResult.critical);
    }
    let initialEvaluation=null;
    if(Number.isFinite(tailGuess) && tailGuess>0 && Number.isFinite(tailGuess*1.25)){
      evaluations+=1;
      initialEvaluation=studentizedRangeSurvivalAndDensity(tailGuess,groups,dof);
      if(!initialEvaluation || !(Number.isFinite(initialEvaluation.probability) && Number.isFinite(initialEvaluation.density))) return NaN;
      const initialResidual=initialEvaluation.probability-tailAlpha;
      if(Math.abs(initialResidual)<=probabilityTolerance) return finish(tailGuess);
      let step=Math.max(tailGuess*(hasSuppliedGuess?0.01:0.25),hasSuppliedGuess?0.01:0.5);
      let guard=0;
      if(initialResidual>0){
        low=tailGuess;
        lowTail=initialEvaluation.probability;
        high=tailGuess+step;
        if(!Number.isFinite(high)) return Number.POSITIVE_INFINITY;
        highTail=evaluate(high);
        if(!Number.isFinite(highTail)) return NaN;
        while(highTail>tailAlpha && guard<128){
          low=high;
          lowTail=highTail;
          step*=2;
          high=tailGuess+step;
          if(!Number.isFinite(high)) return Number.POSITIVE_INFINITY;
          highTail=evaluate(high);
          if(!Number.isFinite(highTail)) return NaN;
          guard+=1;
        }
        if(highTail>tailAlpha) return NaN;
      }else{
        high=tailGuess;
        highTail=initialEvaluation.probability;
        low=Math.max(0,tailGuess-step);
        lowTail=low>0 ? evaluate(low) : 1;
        if(!Number.isFinite(lowTail)) return NaN;
        while(lowTail<=tailAlpha && low>0 && guard<128){
          high=low;
          highTail=lowTail;
          step*=2;
          low=Math.max(0,tailGuess-step);
          lowTail=low>0 ? evaluate(low) : 1;
          if(!Number.isFinite(lowTail)) return NaN;
          guard+=1;
        }
        if(lowTail<=tailAlpha) return NaN;
      }
    }else{
      low=0;
      lowTail=1;
      highTail=evaluate(high);
      if(!Number.isFinite(highTail)) return NaN;
      let guard=0;
      while(highTail>tailAlpha && guard<128){
        low=high;
        lowTail=highTail;
        high*=2;
        if(!Number.isFinite(high)) return Number.POSITIVE_INFINITY;
        highTail=evaluate(high);
        if(!Number.isFinite(highTail)) return NaN;
        guard+=1;
      }
      if(highTail>tailAlpha) return NaN;
    }

    let a=low;
    let b=high;
    let fa=lowTail-tailAlpha;
    let fb=highTail-tailAlpha;
    if(!(fa>=0 && fb<=0)) return NaN;
    let candidate=Number.isFinite(tailGuess) && tailGuess>=a && tailGuess<=b
      ? tailGuess
      : ((a+b)/2);
    let candidateEvaluation=initialEvaluation && candidate===tailGuess ? initialEvaluation : null;
    for(let iteration=0;iteration<64;iteration+=1){
      const tolerance=1e-7*Math.max(1,Math.abs(b));
      if(Math.abs(b-a)<=tolerance) return finish((a+b)/2);
      evaluations+=1;
      const evaluation=candidateEvaluation || studentizedRangeSurvivalAndDensity(candidate,groups,dof);
      candidateEvaluation=null;
      if(!evaluation || !(Number.isFinite(evaluation.probability) && Number.isFinite(evaluation.density))) return NaN;
      const residual=evaluation.probability-tailAlpha;
      if(Math.abs(residual)<=probabilityTolerance) return finish(candidate);
      if(residual>0){
        a=candidate;
      }else{
        b=candidate;
      }
      if(Math.abs(b-a)<=tolerance) return finish((a+b)/2);
      let next=evaluation.density>0 ? candidate+(residual/evaluation.density) : NaN;
      if(!(Number.isFinite(next) && next>a && next<b)
        || Math.abs(next-candidate)<(tolerance/4)){
        next=(a+b)/2;
      }
      candidate=next;
    }
    return Math.abs(b-a)<=1e-7*Math.max(1,Math.abs(b)) ? finish((a+b)/2) : NaN;
  }
  function resolveStudentizedRangeCriticalValues(alpha,groups,degreesOfFreedom){
    const uniqueDfs=Array.from(new Set((Array.isArray(degreesOfFreedom)?degreesOfFreedom:[]).map(Number)))
      .filter(df=>df===Number.POSITIVE_INFINITY || (Number.isFinite(df) && df>0))
      .sort((left,right)=>left-right);
    const values=[];
    for(const df of uniqueDfs){
      let initialGuess=values.length?values[values.length-1].critical:null;
      if(values.length>=2 && Number.isFinite(df)){
        const previous=values[values.length-1];
        const prior=values[values.length-2];
        const currentCoordinate=1/Math.sqrt(df);
        const previousCoordinate=1/Math.sqrt(previous.df);
        const priorCoordinate=1/Math.sqrt(prior.df);
        const slope=(previous.critical-prior.critical)/(previousCoordinate-priorCoordinate);
        const predicted=previous.critical+(currentCoordinate-previousCoordinate)*slope;
        if(Number.isFinite(predicted) && predicted>0
          && Math.abs(predicted-previous.critical)<=Math.max(0.5,previous.critical*0.5)){
          initialGuess=predicted;
        }
      }
      values.push({
        df,
        critical:resolveStudentizedRangeCritical(alpha,groups,df,initialGuess)
      });
    }
    return values;
  }
  function resolveStatsAlpha(options){
    return sanitizeStatsAlpha(options?.alpha, ASSUMPTION_ALPHA);
  }
  function resolveStatsSeed(options){
    return sanitizeStatsSeed(options?.seed, 1337);
  }
  function resolveStatsResamplingMode(options){
    return sanitizeResamplingMode(options?.resamplingMode);
  }
  function resolveStatsMonteCarloIterations(options){
    return sanitizeMonteCarloIterations(options?.iterations ?? options?.monteCarloIterations, 10000);
  }


  function fallbackSanitizeP(value){
    const num = toNumericPValue(value);
    return Number.isFinite(num) && num >= 0 && num <= 1 ? num : NaN;
  }

  function fallbackClampUnit(value){
    if(!Number.isFinite(value)){
      return NaN;
    }
    if(value < 0){
      return 0;
    }
    if(value > 1){
      return 1;
    }
    return value;
  }

  function fallbackAdjustNone(values){
    return values.map(v => fallbackClampUnit(fallbackSanitizeP(v)));
  }

  function fallbackAdjustBonferroni(values){
    const m = values.length || 1;
    return values.map(v => fallbackClampUnit(fallbackSanitizeP(v) * m));
  }

  function fallbackAdjustSidak(values){
    const m = values.length || 1;
    return values.map(v => {
      const p = fallbackSanitizeP(v);
      return fallbackClampUnit(-Math.expm1(m * Math.log1p(-p)));
    });
  }

  function fallbackAdjustHolm(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 0;
    ordered.forEach((entry, idx) => {
      const rank = m - idx;
      const raw = fallbackClampUnit(entry.p * rank);
      running = Math.max(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    });
    return adjusted;
  }

  function fallbackAdjustHolmSidak(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 0;
    ordered.forEach((entry, idx) => {
      const rank = m - idx;
      const raw = fallbackClampUnit(-Math.expm1(rank * Math.log1p(-entry.p)));
      running = Math.max(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    });
    return adjusted;
  }

  function fallbackAdjustHochberg(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => b.p - a.p);
    const adjusted = new Array(m).fill(1);
    let running = 1;
    ordered.forEach((entry, idx) => {
      const rank = idx + 1;
      const raw = fallbackClampUnit(entry.p * rank);
      running = Math.min(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    });
    return adjusted;
  }

  function fallbackAdjustBH(values){
    const m = values.length;
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 1;
    for(let i = m - 1; i >= 0; i--){
      const entry = ordered[i];
      const rank = i + 1;
      const raw = fallbackClampUnit((entry.p * m) / rank);
      running = Math.min(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    }
    return adjusted;
  }

  function fallbackAdjustBY(values){
    const m = values.length;
    let harmonic = 0;
    for(let i = 1; i <= Math.max(m, 1); i++){
      harmonic += 1 / i;
    }
    const ordered = values.map((v, index) => ({ p: fallbackSanitizeP(v), index }));
    ordered.sort((a, b) => a.p - b.p);
    const adjusted = new Array(m).fill(1);
    let running = 1;
    for(let i = m - 1; i >= 0; i--){
      const entry = ordered[i];
      const rank = i + 1;
      const raw = fallbackClampUnit((entry.p * m * harmonic) / rank);
      running = Math.min(running, raw);
      adjusted[entry.index] = fallbackClampUnit(running);
    }
    return adjusted;
  }

  const FALLBACK_CORRECTION_META = {
    none: {
      label: 'None (unadjusted)',
      shortLabel: 'None',
      footnote: count => `P-values are unadjusted${count > 0 ? ` (${count} comparison${count === 1 ? '' : 's'})` : ''}.`,
      adjust: fallbackAdjustNone
    },
    bonferroni: {
      label: 'Bonferroni',
      shortLabel: 'Bonferroni',
      footnote: count => `The Bonferroni adjustment was applied across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustBonferroni
    },
    holm: {
      label: 'Holm',
      shortLabel: 'Holm',
      footnote: count => `The Holm correction was applied across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustHolm
    },
    'holm-sidak': {
      label: 'Holm-Sidak',
      shortLabel: 'Holm-Sidak',
      footnote: count => `The Holm-Sidak correction was applied across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustHolmSidak
    },
    sidak: {
      label: 'Sidak',
      shortLabel: 'Sidak',
      footnote: count => `The Sidak correction was applied across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustSidak
    },
    hochberg: {
      label: 'Hochberg',
      shortLabel: 'Hochberg',
      footnote: count => `The Hochberg correction was applied across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustHochberg
    },
    bh: {
      label: 'Benjamini-Hochberg (FDR)',
      shortLabel: 'BH',
      footnote: count => `The Benjamini-Hochberg procedure controlled the false discovery rate across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustBH
    },
    by: {
      label: 'Benjamini-Yekutieli (FDR)',
      shortLabel: 'BY',
      footnote: count => `The Benjamini-Yekutieli procedure controlled the false discovery rate across ${count} test${count === 1 ? '' : 's'}.`,
      adjust: fallbackAdjustBY
    }
  };
  function resolveCorrectionMeta(method, count){
    if(Shared.stats && typeof Shared.stats.getCorrectionMeta === 'function'){
      try{
        const metaRaw = Shared.stats.getCorrectionMeta(method);
        const note = typeof metaRaw?.footnote === 'function' ? metaRaw.footnote(count || 0) : metaRaw?.footnote;
        return {
          key: metaRaw?.key || method || DEFAULT_CORRECTION,
          label: metaRaw?.label || metaRaw?.shortLabel || method || DEFAULT_CORRECTION,
          shortLabel: metaRaw?.shortLabel || metaRaw?.label || method || DEFAULT_CORRECTION,
          footnote: note || ''
        };
      }catch(err){
        logDebug('Debug: box worker resolveCorrectionMeta error', { method, message: err?.message || String(err) });
      }
    }
    const fallbackKey = FALLBACK_CORRECTION_META[method] ? method : DEFAULT_CORRECTION;
    const cfg = FALLBACK_CORRECTION_META[fallbackKey];
    const footnote = typeof cfg.footnote === 'function' ? cfg.footnote(count || 0) : cfg.footnote;
    return {
      key: fallbackKey,
      label: cfg.label,
      shortLabel: cfg.shortLabel || cfg.label,
      footnote: footnote || ''
    };
  }

  function formatAdjustedPLabel(method, correctionMeta){
    if(typeof Shared.stats?.getAdjustedPLabel === 'function'){
      return Shared.stats.getAdjustedPLabel(method);
    }
    const shortLabel=correctionMeta?.shortLabel || correctionMeta?.label || 'Adjusted';
    return `${shortLabel}-adjusted p`;
  }

  function applyPValueCorrection(values, method){
    const arr = Array.isArray(values) ? values.slice() : [];
    if(Shared.stats && typeof Shared.stats.adjustPValues === 'function'){
      try{
        const adjusted = Shared.stats.adjustPValues(arr, { method });
        if(Array.isArray(adjusted) && adjusted.length === arr.length){
          return adjusted;
        }
      }catch(err){
        logDebug('Debug: box worker applyPValueCorrection error', { method, message: err?.message || String(err) });
      }
    }
    const fallbackKey = FALLBACK_CORRECTION_META[method] ? method : DEFAULT_CORRECTION;
    const adjustFn = FALLBACK_CORRECTION_META[fallbackKey].adjust;
    const valid = arr
      .map((value, index) => ({ index, p: fallbackSanitizeP(value) }))
      .filter(entry => Number.isFinite(entry.p));
    const adjustedValid = adjustFn(valid.map(entry => entry.p));
    const output = new Array(arr.length).fill(null);
    valid.forEach((entry, index) => {
      output[entry.index] = adjustedValid[index];
    });
    return output;
  }

  function resolveEffectiveComparisonCorrection(values, method){
    const rawValues = Array.isArray(values) ? values.slice() : [];
    const effectiveMethod = rawValues.length > 1 ? (method || DEFAULT_CORRECTION) : 'none';
    const adjustedValues = effectiveMethod === 'none'
      ? rawValues.slice()
      : applyPValueCorrection(rawValues, effectiveMethod);
    return {
      count: rawValues.length,
      effectiveMethod,
      adjustedValues,
      correctionMeta: resolveCorrectionMeta(effectiveMethod, rawValues.length),
      hasAdjustment: effectiveMethod !== 'none'
    };
  }

  function resolvePostHocInferenceMethod(postHocMode, correctionMethod, comparisonCount){
    if(Number(comparisonCount) <= 1){
      return 'none';
    }
    const intrinsicMethods = {
      tukey: 'tukey',
      gamesHowell: 'games-howell',
      tamhaneT2: 'tamhane-t2',
      nemenyi: 'nemenyi',
      dunnettTest:'dunnett-test',
      dunnettT3Test:'dunnett-t3-test',
      dunnett: 'dunnett',
      dunnettT3: 'dunnett-t3'
    };
    return intrinsicMethods[postHocMode] || correctionMethod || DEFAULT_CORRECTION;
  }

  function normalizeEffectiveInferenceSnapshot(payload, model){
    const snapshot = payload?.inferenceSnapshot;
    if(!snapshot || typeof snapshot !== 'object'){
      return snapshot || null;
    }
    const comparison = snapshot.comparisons;
    const method = String(model?.effectiveComparisonMethod || comparison?.method || 'none').trim().toLowerCase() || 'none';
    if(!comparison || method === String(comparison.method || 'none').trim().toLowerCase()){
      return snapshot;
    }
    const isFdr = method === 'bh' || method === 'by';
    const alpha = Number(snapshot.alpha);
    const targetFdr = Number(snapshot.targetFdr);
    const level = isFdr
      ? (Number.isFinite(targetFdr) ? targetFdr : Number(comparison.level))
      : (Number.isFinite(alpha) ? alpha : Number(comparison.level));
    return {
      ...snapshot,
      comparisons: {
        ...comparison,
        criterion: isFdr ? 'fdr' : 'alpha',
        level,
        method,
        errorControl: isFdr ? 'fdr' : (method === 'none' ? 'unadjusted' : 'fwer'),
        valueKind: method === 'none' ? 'raw-p' : 'adjusted-p',
        decisionLabel: isFdr ? 'Discovery' : 'Significant',
        negativeDecisionLabel: isFdr ? 'No discovery' : 'Not significant'
      }
    };
  }

  const FALLBACK_SCIENTIFIC_SUPERSCRIPTS = Object.freeze({
    '-': '⁻', '+': '⁺', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
  });

  function formatFallbackScientificNumber(value, fractionalDigits = 5){
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric === 0){
      return Number.isFinite(numeric) ? '0' : String(value);
    }
    let exponent = Math.floor(Math.log10(Math.abs(numeric)));
    let mantissa = numeric / Math.pow(10, exponent);
    const digits = Math.max(0, Math.min(15, Number.isInteger(fractionalDigits) ? fractionalDigits : 5));
    mantissa = Number(mantissa.toFixed(digits));
    if(Math.abs(mantissa) >= 10){
      mantissa /= 10;
      exponent += 1;
    }
    const mantissaText = mantissa.toFixed(digits).replace(/\.?0+$/, '').replace(/^-/, '−');
    const exponentText = String(exponent).split('').map(char => FALLBACK_SCIENTIFIC_SUPERSCRIPTS[char] || char).join('');
    return `${mantissaText} × 10${exponentText}`;
  }

  function formatP(value, options){
    const formatter = getPValueFormatter()?.format
      || Shared.formatters?.formatPValue
      || Shared.formatPValue;
    if(typeof formatter === 'function'){
      return formatter(value, options);
    }
    const numeric = toNumericPValue(value);
    if(!Number.isFinite(numeric)){
      return 'unavailable (not estimable)';
    }
    if(numeric < 0 || numeric > 1){
      return 'unavailable (invalid probability)';
    }
    const scientific = options?.forceScientific === true || options?.scientific === true;
    if(scientific){
      const scientificFormatter = Shared.formatters?.formatScientificNumber;
      if(numeric === 0){
        const thresholdDisplay = typeof scientificFormatter === 'function'
          ? scientificFormatter(0.0001, { fractionalDigits: 5 })
          : formatFallbackScientificNumber(0.0001, 5);
        return `<${thresholdDisplay}`;
      }
      return typeof scientificFormatter === 'function'
        ? scientificFormatter(numeric, { fractionalDigits: 5 })
        : formatFallbackScientificNumber(numeric, 5);
    }
    if(numeric === 0){
      return '<0.0001';
    }
    const exponent = Math.floor(Math.log10(numeric));
    const decimalPlaces = Math.max(4, exponent < 0 ? -exponent + 5 : 5 - exponent);
    if(decimalPlaces > 20){
      return '<0.0001';
    }
    return numeric.toFixed(decimalPlaces).replace(/0+$/, '').replace(/\.$/, '');
  }

  function createPValueCell(value, options = {}){
    const numeric = toNumericPValue(value);
    if(!Number.isFinite(numeric)){
      return options.fallback ?? formatP(value);
    }
    const cell = {
      type: 'pValue',
      value: numeric,
      fallback: options.fallback ?? String(formatP(numeric))
    };
    if(options.inference){
      cell.__statsInference = options.inference;
    }
    return cell;
  }

  function formatPExpression(value, label = 'p'){
    const display = String(formatP(value));
    const match = /^(<=|>=|≤|≥|<|>)\s*(.*)$/.exec(display);
    if(match){
      const operator = match[1] === '<=' ? '≤' : (match[1] === '>=' ? '≥' : match[1]);
      return `${label} ${operator} ${match[2]}`;
    }
    return `${label} = ${display}`;
  }

  function resolvePValue(value){
    try{
      const resolver = ensureStats()?.finiteProbabilityOrFallback;
      if(typeof resolver === 'function'){
        return resolver(value, NaN);
      }
    }catch(err){
      logDebug('Debug: box worker resolvePValue stats unavailable', { message: err?.message || String(err) });
    }
    const num = toNumericPValue(value);
    return Number.isFinite(num) && num >= 0 && num <= 1 ? num : NaN;
  }

  function toTailNumber(value){
    return value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY
      ? value
      : toNumericPValue(value);
  }

  function normalTwoSidedPValue(z){
    try{
      const helper = ensureStats()?.normalTwoSidedPValue;
      if(typeof helper === 'function'){
        return resolvePValue(helper(z));
      }
    }catch(err){}
    const value = toTailNumber(z);
    if(value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY){
      return 0;
    }
    const cdf = ctx.jStat?.normal?.cdf;
    return typeof cdf === 'function' && Number.isFinite(value)
      ? resolvePValue(2 * (1 - cdf(Math.abs(value), 0, 1)))
      : NaN;
  }



  function studentTTwoSidedPValue(t, df){
    try{
      const helper = ensureStats()?.studentTTwoSidedPValue;
      if(typeof helper === 'function'){
        return resolvePValue(helper(t, df));
      }
    }catch(err){}
    const value = toTailNumber(t);
    if(value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY){
      return 0;
    }
    const cdf = ctx.jStat?.studentt?.cdf;
    return typeof cdf === 'function' && Number.isFinite(value) && Number.isFinite(toTailNumber(df))
      ? resolvePValue(2 * (1 - cdf(Math.abs(value), toTailNumber(df))))
      : NaN;
  }

  function fUpperTailPValue(F, df1, df2){
    try{
      const helper = ensureStats()?.fUpperTail;
      if(typeof helper === 'function'){
        return resolvePValue(helper(F, df1, df2));
      }
    }catch(err){}
    const value = toTailNumber(F);
    const firstDf = toTailNumber(df1);
    const secondDf = toTailNumber(df2);
    if(value === Number.POSITIVE_INFINITY){
      return 0;
    }
    const cdf = ctx.jStat?.centralF?.cdf;
    return typeof cdf === 'function' && Number.isFinite(value) && Number.isFinite(firstDf) && Number.isFinite(secondDf)
      ? resolvePValue(1 - cdf(value, firstDf, secondDf))
      : NaN;
  }

  function chiSquareUpperTailPValue(statistic, df){
    try{
      const helper = ensureStats()?.chiSquareUpperTail;
      if(typeof helper === 'function'){
        return resolvePValue(helper(statistic, df));
      }
    }catch(err){}
    const value = toTailNumber(statistic);
    const degrees = toTailNumber(df);
    if(value === Number.POSITIVE_INFINITY){
      return 0;
    }
    const cdf = ctx.jStat?.chisquare?.cdf;
    return typeof cdf === 'function' && Number.isFinite(value) && Number.isFinite(degrees)
      ? resolvePValue(1 - cdf(value, degrees))
      : NaN;
  }

  function formatStatNumber(value, digits){
    const places = Number.isInteger(digits) ? digits : 4;
    if(!Number.isFinite(value)){
      return '-';
    }
    return value.toFixed(places);
  }


  function formatIntervalBound(value){
    if(value===Infinity){
      return '∞';
    }
    if(value===-Infinity){
      return '-∞';
    }
    return Number.isFinite(value) ? formatStatNumber(value) : '-';
  }

  function formatConfidenceInterval(low,high){
    if((!Number.isFinite(low) && low!==-Infinity) || (!Number.isFinite(high) && high!==Infinity)){
      return '-';
    }
    return `${formatIntervalBound(low)} to ${formatIntervalBound(high)}`;
  }

  function formatPercentLabel(value){
    const numeric=Number(value);
    if(!Number.isFinite(numeric)){
      return '95%';
    }
    const percent=numeric*100;
    return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1).replace(/\.0$/,'')}%`;
  }

  function safeRound(value, digits){
    if(!Number.isFinite(value)){
      return null;
    }
    const factor = Math.pow(10, digits || 0);
    return Math.round(value * factor) / factor;
  }

  function clamp(value, min, max){
    if(!Number.isFinite(value)){
      return value;
    }
    if(value < min){
      return min;
    }
    if(value > max){
      return max;
    }
    return value;
  }

  function formatEffectValue(value, meta){
    if(value == null || !Number.isFinite(value)){
      return '-';
    }
    if(meta?.format === 'percent'){
      const percent = clamp(value, 0, 1) * 100;
      return `${percent.toFixed(1)}%`;
    }
    return value.toFixed(3);
  }

  function buildEffectFootnotes(paramMeta, nonParamMeta){
    const notes = [];
    if(paramMeta?.tooltip){
      notes.push(`Parametric effect (${paramMeta.shortLabel || paramMeta.label}): ${paramMeta.tooltip}`);
    }
    if(nonParamMeta?.tooltip){
      notes.push(`Non-parametric effect (${nonParamMeta.shortLabel || nonParamMeta.label}): ${nonParamMeta.tooltip}`);
    }
    return notes;
  }

  const EFFECT_SIZE_PARAM_OPTIONS = [
    { value: 'cohenD', label: "Cohen's d", shortLabel: "Cohen's d", tooltip: 'Difference in means scaled by the pooled standard deviation.', format: 'decimal' },
    { value: 'hedgesG', label: "Hedges' g", shortLabel: "Hedges' g", tooltip: "Small-sample corrected Cohen's d using a bias adjustment.", format: 'decimal' }
  ];
  const EFFECT_SIZE_NONPARAM_OPTIONS = [
    { value: 'rankBiserial', label: 'Rank-biserial r', shortLabel: 'Rank-biserial r', tooltip: 'Rank-biserial correlation (-1 to 1) comparing favorable vs. unfavorable pairings.', format: 'decimal' },
    { value: 'commonLanguage', label: 'Common language (A)', shortLabel: 'Common language A', tooltip: 'Probability that a score from the first sample exceeds the second (expressed as a percentage).', format: 'percent' }
  ];

  function listEffectOptions(type){
    return type === 'parametric' ? EFFECT_SIZE_PARAM_OPTIONS.slice() : EFFECT_SIZE_NONPARAM_OPTIONS.slice();
  }

  function resolveEffectOptionMeta(type, value){
    const list = listEffectOptions(type);
    const found = list.find(opt => opt.value === value);
    if(found){
      return found;
    }
    const fallback = list[0];
    logDebug('Debug: box worker resolveEffectOptionMeta fallback', { type, requested: value, fallback: fallback?.value });
    return fallback;
  }

  function isWelchStyleParametricVariant(value){
    return value === 'welch' || value === 'lognormalWelch';
  }

  function isEqualVarianceParametricVariant(value){
    return value === 'classic' || value === 'lognormalClassic';
  }

  const STUDENTIZED_RANGE_CACHE_VERSION = 'studentized-range-direct-sf-v2';
  const POST_HOC_META = {
    auto: {
      value: 'auto',
      label: 'Automatic',
      shortLabel: 'Automatic',
      tooltip: 'Choose a post-hoc procedure from the selected primary analysis and comparison scope.',
      summary: context => {
        const resolution = resolvePostHocProcedure({ ...context, requestedProcedure: 'auto' });
        return resolution.effectiveProcedure
          ? `Automatic (${resolution.effectiveLabel}).`
          : (resolution.reason || 'Automatic post-hoc selection is unavailable.');
      }
    },
    standard: {
      value: 'standard',
      label: 'Pairwise + correction',
      shortLabel: 'Standard',
      tooltip: 'Run pairwise tests and adjust p-values using the selected multiple-testing correction.',
      applies: context => context?.mode !== 'custom',
      summary: () => 'Pairwise tests with the chosen correction.'
    },
    anovaPooled: {
      value: 'anovaPooled',
      label: 'ANOVA-pooled t-tests',
      shortLabel: 'ANOVA-pooled',
      tooltip: 'Two-sided pairwise t-tests using the common residual mean square from an independent classic one-way ANOVA.',
      applies: context => context?.mode === 'all'
        && context?.paired !== true
        && context?.groupCount >= 3
        && (context?.analysisId === 'oneWayAnova' || context?.analysisId === 'lognormalAnova'),
      summary: context => `Two-sided pairwise t-tests use the common ANOVA residual mean square (df = N − k).`
    },
    tukey: {
      value: 'tukey',
      label: 'Tukey HSD',
      shortLabel: 'Tukey',
      tooltip: 'Parametric Tukey Honestly Significant Difference using the studentized range distribution (unpaired, ≥3 groups).',
      numericalCacheVersion: STUDENTIZED_RANGE_CACHE_VERSION,
      applies: context => context && context.mode !== 'custom' && context.analysisId !== 'oneSampleT' && context.analysisId !== 'oneSampleWilcoxon' && context.test === 'parametric' && isEqualVarianceParametricVariant(context.variant) && !context.paired && context.groupCount >= 3,
      summary: context => `Tukey HSD on ${context?.groupCount || 0} groups (family-wise adjusted).`
    },
    gamesHowell: {
      value: 'gamesHowell',
      label: 'Games-Howell',
      shortLabel: 'Games-Howell',
      tooltip: 'Games-Howell post-hoc test using Welch-standardized differences (unpaired, ≥3 groups, unequal variances).',
      numericalCacheVersion: STUDENTIZED_RANGE_CACHE_VERSION,
      applies: context => context && context.mode !== 'custom' && context.analysisId !== 'oneSampleT' && context.analysisId !== 'oneSampleWilcoxon' && context.test === 'parametric' && !context.paired && context.groupCount >= 3 && (isWelchStyleParametricVariant(context.variant) || context.varianceConcern === true),
      summary: context => `Games-Howell comparisons across ${context?.groupCount || 0} groups with Welch-standardized SE.`
    },
    tamhaneT2: {
      value: 'tamhaneT2',
      label: 'Tamhane T2 (Welch + Sidak)',
      shortLabel: 'Tamhane T2',
      tooltip: 'Tamhane T2 unequal-variance post-hoc based on Welch t tests with Sidak family-wise adjustment (unpaired, ≥3 groups).',
      applies: context => context && context.mode !== 'custom' && context.test === 'parametric' && !context.paired && context.groupCount >= 3 && (isWelchStyleParametricVariant(context.variant) || context.varianceConcern === true),
      summary: context => `Tamhane T2 Welch pairwise comparisons with Sidak family-wise adjustment across ${context?.groupCount || 0} groups.`
    },
    dunn: {
      value: 'dunn',
      label: "Dunn's test",
      shortLabel: 'Dunn',
      tooltip: "Non-parametric Dunn's post-hoc test using rank sums (unpaired, ≥3 groups).",
      applies: context => context && context.mode !== 'custom' && context.test === 'nonparametric' && !context.paired && context.groupCount >= 3,
      summary: context => `Dunn's rank-based post-hoc across ${context?.groupCount || 0} groups.`
    },
    nemenyi: {
      value: 'nemenyi',
      label: "Friedman pairwise post-hoc",
      shortLabel: 'Friedman post-hoc',
      tooltip: 'Pairwise comparisons of mean ranks after Friedman; calibration is exact/Monte Carlo max-statistic permutation when selected, otherwise the Nemenyi studentized-range approximation.',
      numericalCacheVersion: STUDENTIZED_RANGE_CACHE_VERSION,
      applies: context => context && context.mode !== 'custom' && context.analysisId !== 'oneSampleT' && context.analysisId !== 'oneSampleWilcoxon' && context.test === 'nonparametric' && context.paired && context.groupCount >= 3,
      summary: context => `Nemenyi pairwise mean-rank comparisons across ${context?.groupCount || 0} paired groups after Friedman.`
    },
    dunnettTest: {
      value:'dunnettTest',label:'Dunnett',shortLabel:'Dunnett',
      tooltip:'Two-sided comparisons against one control, using correlated multivariate t calibration and common ANOVA residual variance.',
      numericalCacheVersion:'dunnett-multivariate-t-v1',
      applies:context=>context && context.mode==='reference' && context.test==='parametric' && !context.paired && context.groupCount>=3 && isEqualVarianceParametricVariant(context.variant),
      summary:context=>`Dunnett simultaneous comparisons against the reference across ${Math.max(0,(context?.groupCount||0)-1)} treatments.`
    },
    dunnettT3Test: {
      value:'dunnettT3Test',label:'Dunnett T3',shortLabel:'Dunnett T3',
      tooltip:'Two-sided all-pairs unequal-variance comparisons, using the studentized maximum modulus and pair-specific Welch degrees of freedom.',
      numericalCacheVersion:'dunnett-t3-maximum-modulus-v1',
      applies:context=>context && context.mode==='all' && context.test==='parametric' && !context.paired && context.groupCount>=3,
      summary:context=>`Dunnett T3 unequal-variance simultaneous comparisons across all ${context?.groupCount||0} groups.`
    },
    dunnett: {
      value: 'dunnett',
      label: "Control comparisons (pooled t + Sidak)",
      shortLabel: 'Control + Sidak',
      tooltip: 'Parametric multiple comparison versus a control/reference group (equal variances).',
      applies: context => context && context.mode === 'reference' && context.test === 'parametric' && !context.paired && context.groupCount >= 3 && isEqualVarianceParametricVariant(context.variant),
      summary: context => `Pooled-variance t comparisons versus the reference with Sidak family-wise adjustment across ${Math.max(0, (context?.groupCount || 0) - 1)} group${(context?.groupCount || 0) === 2 ? '' : 's'}.`
    },
    dunnettT3: {
      value: 'dunnettT3',
      label: "Control comparisons (Welch + Sidak)",
      shortLabel: 'Control Welch + Sidak',
      tooltip: 'Welch-type multiple comparison versus a control/reference group (unequal variances).',
      applies: context => context && context.mode === 'reference' && context.test === 'parametric' && !context.paired && context.groupCount >= 3,
      summary: context => `Welch t comparisons versus the reference with Sidak family-wise adjustment across ${Math.max(0, (context?.groupCount || 0) - 1)} group${(context?.groupCount || 0) === 2 ? '' : 's'}.`
    }
  };
  const POST_HOC_ORDER = ['auto', 'standard', 'anovaPooled', 'tukey', 'gamesHowell', 'tamhaneT2', 'dunn', 'nemenyi', 'dunnettTest', 'dunnettT3Test', 'dunnett', 'dunnettT3'];

  function inferPostHocAnalysisId(context = {}){
    const mode = String(context.mode || context.scope || 'all');
    const groupCount = Math.max(0, Number(context.groupCount) || 0);
    const paired = context.design === 'paired' || context.paired === true;
    const family = context.test || context.family || 'parametric';
    const variant = context.variant || context.parametricVariant || 'classic';
    if(mode === 'oneSample'){
      return family === 'nonparametric' ? 'oneSampleWilcoxon' : 'oneSampleT';
    }
    if(family === 'nonparametric'){
      if(paired){
        return groupCount >= 3 ? 'friedman' : 'wilcoxonSignedRank';
      }
      return groupCount >= 3 ? 'kruskalWallis' : 'mannWhitney';
    }
    if(mode === 'reference' || mode === 'custom' || groupCount <= 2){
      if(paired){
        return variant === 'ratioT' ? 'ratioT' : 'pairedT';
      }
      return variant === 'welch' ? 'welchT'
        : variant === 'lognormalClassic' ? 'lognormalT'
          : variant === 'lognormalWelch' ? 'lognormalWelchT'
            : 'studentT';
    }
    if(paired){
      return variant === 'lognormalClassic' ? 'lognormalRepeatedMeasuresAnova' : 'repeatedMeasuresAnova';
    }
    return variant === 'welch' ? 'welchAnova'
      : variant === 'lognormalClassic' ? 'lognormalAnova'
        : variant === 'lognormalWelch' ? 'lognormalWelchAnova'
          : 'oneWayAnova';
  }

  function resolvePostHocProcedure(input = {}){
    const scope = String(input.scope || input.mode || 'all');
    const design = input.design === 'paired' || input.paired === true ? 'paired' : 'independent';
    const groupCount = Math.max(0, Number(input.groupCount) || 0);
    const analysisId = String(input.analysisId || input.analysis?.id || inferPostHocAnalysisId({
      mode: scope,
      test: input.test,
      family: input.family,
      paired: design === 'paired',
      variant: input.variant || input.analysis?.variant,
      groupCount
    }));
    const rawRequested = String(input.requestedProcedure ?? input.requested ?? 'standard').trim();
    const requestedProcedure = POST_HOC_ORDER.find(key => key.toLowerCase() === rawRequested.toLowerCase()) || rawRequested;
    const automatic = requestedProcedure === 'auto';
    const analysisMeta = SINGLE_TEST_META[analysisId] || {};
    const context = {
      mode: scope,
      scope,
      test: analysisMeta.family || input.test || input.family || null,
      paired: design === 'paired',
      design,
      groupCount,
      variant: analysisMeta.variant || input.variant || input.analysis?.variant || null,
      varianceConcern: input.varianceConcern === true,
      analysisId
    };
    const automaticChoices = {
      oneWayAnova: 'tukey',
      lognormalAnova: 'tukey',
      welchAnova: 'gamesHowell',
      lognormalWelchAnova: 'gamesHowell'
    };
    let candidate = requestedProcedure;
    if(automatic){
      candidate = scope === 'all'
        && design === 'independent'
        && groupCount >= 3
        && automaticChoices[analysisId]
        ? automaticChoices[analysisId]
        : 'standard';
    }
    const meta = POST_HOC_META[candidate];
    let supported = false;
    try{
      supported = !!meta && typeof meta.applies === 'function' && !!meta.applies(context);
    }catch(err){
      logDebug('Debug: box worker resolvePostHocProcedure applicability failed', {
        requestedProcedure,
        candidate,
        message: err?.message || String(err)
      });
    }
    let reason = null;
    if(!supported){
      if(candidate === 'anovaPooled'){
        reason = 'ANOVA-pooled t-tests require All pairwise scope, at least three independent groups, and classic one-way ANOVA on the original or log scale.';
      }else if(candidate === 'auto'){
        reason = 'Automatic post-hoc selection could not resolve a supported procedure.';
      }else if(!meta){
        reason = `Unknown post-hoc procedure: ${requestedProcedure}.`;
      }else{
        reason = `${meta.label || candidate} is not supported for ${analysisId} in ${scope} scope with ${design} groups and ${groupCount} selected groups.`;
      }
    }
    const labels = {
      standard: context.paired ? 'Paired pairwise tests' : (context.test === 'parametric' ? 'Independent pairwise t-tests' : 'Independent pairwise rank tests'),
      anovaPooled: 'ANOVA-pooled t-tests'
    };
    const pairwiseTestLabels = {
      studentT: 'Student independent two-sample t-tests',
      welchT: 'Welch independent two-sample t-tests',
      lognormalT: 'Student independent two-sample t-tests on log-transformed observations',
      lognormalWelchT: 'Welch independent two-sample t-tests on log-transformed observations',
      pairedT: 'paired Student t-tests',
      ratioT: 'paired ratio t-tests on log-transformed values',
      mannWhitney: 'Mann–Whitney U tests',
      kolmogorovSmirnov: 'Kolmogorov–Smirnov two-sample tests',
      wilcoxonSignedRank: 'Wilcoxon signed-rank tests',
      oneWayAnova: 'independent pair-specific Student t-tests',
      welchAnova: 'independent pair-specific Welch t-tests',
      lognormalAnova: 'independent pair-specific Student t-tests on log-transformed observations',
      lognormalWelchAnova: 'independent pair-specific Welch t-tests on log-transformed observations',
      repeatedMeasuresAnova: 'paired pairwise t-tests',
      lognormalRepeatedMeasuresAnova: 'paired ratio t-tests on within-subject log ratios',
      kruskalWallis: 'independent pairwise rank tests',
      friedman: 'paired pairwise rank tests'
    };
    const standardVarianceEstimators = {
      studentT: 'pairSpecificPooledVariance',
      welchT: 'pairSpecificWelchVariance',
      lognormalT: 'pairSpecificPooledVarianceOnLogScale',
      lognormalWelchT: 'pairSpecificWelchVarianceOnLogScale',
      oneWayAnova: 'pairSpecificPooledVariance',
      welchAnova: 'pairSpecificWelchVariance',
      lognormalAnova: 'pairSpecificPooledVarianceOnLogScale',
      lognormalWelchAnova: 'pairSpecificWelchVarianceOnLogScale',
      lognormalRepeatedMeasuresAnova: 'pairedLogRatioVariance'
    };
    const effectiveLabel = candidate === 'standard'
      ? labels.standard
      : (POST_HOC_META[candidate]?.label || candidate);
    const alternative = ['tukey', 'gamesHowell', 'anovaPooled','dunnettTest','dunnettT3Test'].includes(candidate) ? 'two-sided' : null;
    const varianceEstimator = candidate === 'standard'
      ? (standardVarianceEstimators[analysisId] || (context.test === 'parametric' ? 'pairSpecificVariance' : null))
      : candidate === 'anovaPooled' || candidate === 'tukey' || candidate==='dunnettTest'
      ? 'anovaResidualMSE'
      : candidate === 'gamesHowell' || candidate === 'tamhaneT2' || candidate === 'dunnettT3' || candidate==='dunnettT3Test'
        ? 'groupSampleVariances'
        : null;
    return {
      requestedProcedure,
      effectiveProcedure: supported ? candidate : null,
      automatic,
      supported,
      reason,
      analysisId,
      scope,
      design,
      groupCount,
      effectiveLabel,
      pairwiseTest: candidate === 'standard'
        ? (pairwiseTestLabels[analysisId] || effectiveLabel)
        : candidate === 'anovaPooled'
          ? 'two-sided t-tests using the common ANOVA residual mean square'
          : candidate === 'tukey'
            ? 'Tukey HSD studentized-range comparisons'
            : candidate === 'gamesHowell'
              ? 'Games-Howell studentized-range comparisons'
              : (POST_HOC_META[candidate]?.label || candidate),
      effectiveAlternative: alternative,
      varianceEstimator,
      intrinsicCorrection: ['tukey', 'gamesHowell', 'tamhaneT2', 'nemenyi', 'dunnett', 'dunnettT3','dunnettTest','dunnettT3Test'].includes(candidate),
      numericalCacheVersion: supported ? (meta?.numericalCacheVersion || null) : null
    };
  }

  function listPostHocOptions(){
    return POST_HOC_ORDER.map(key => ({
      value: key,
      label: POST_HOC_META[key]?.label || key,
      shortLabel: POST_HOC_META[key]?.shortLabel || POST_HOC_META[key]?.label || key,
      tooltip: POST_HOC_META[key]?.tooltip || ''
    }));
  }

  function getPostHocSummary(method, context){
    const resolution = resolvePostHocProcedure({ ...(context || {}), requestedProcedure: method });
    if(!resolution.supported){
      return resolution.reason;
    }
    if(resolution.automatic){
      return `Automatic (${resolution.effectiveLabel}); ${POST_HOC_META[resolution.effectiveProcedure]?.tooltip || 'pairwise comparisons use the selected primary analysis'}`;
    }
    if(resolution.effectiveProcedure === 'standard'){
      return `${resolution.effectiveLabel} with the selected multiple-testing correction.`;
    }
    if(resolution.effectiveProcedure === 'anovaPooled'){
      return 'Two-sided pairwise t-tests use the common ANOVA residual mean square; selected multiplicity control applies across all pairwise comparisons.';
    }
    const meta = POST_HOC_META[resolution.effectiveProcedure];
    if(!meta){
      return method || 'standard';
    }
    const summary = typeof meta.summary === 'function' ? meta.summary(context || {}) : meta.summary;
    return summary || meta.tooltip || meta.label || method;
  }

  function percentileFromSorted(sorted, p){
    if(!Array.isArray(sorted) || !sorted.length){
      return NaN;
    }
    const clamped = Math.min(Math.max(p, 0), 1);
    const pos = (sorted.length - 1) * clamped;
    const base = Math.floor(pos);
    const rest = pos - base;
    const baseVal = sorted[base];
    const nextVal = sorted[base + 1];
    if(nextVal === undefined){
      return baseVal;
    }
    return baseVal + rest * (nextVal - baseVal);
  }

  function partitionArray(arr, left, right, pivotIndex){
    const pivotValue = arr[pivotIndex];
    [arr[pivotIndex], arr[right]] = [arr[right], arr[pivotIndex]];
    let storeIndex = left;
    for(let i = left; i < right; i++){
      if(arr[i] < pivotValue){
        [arr[storeIndex], arr[i]] = [arr[i], arr[storeIndex]];
        storeIndex += 1;
      }
    }
    [arr[right], arr[storeIndex]] = [arr[storeIndex], arr[right]];
    return storeIndex;
  }

  function nthValueInPlace(arr, n, left = 0, right = arr.length - 1){
    let start = left;
    let end = right;
    while(start <= end){
      if(start === end){
        return arr[start];
      }
      const pivotIndex = Math.floor((start + end) / 2);
      const newPivotIndex = partitionArray(arr, start, end, pivotIndex);
      if(n === newPivotIndex){
        return arr[n];
      }
      if(n < newPivotIndex){
        end = newPivotIndex - 1;
      }else{
        start = newPivotIndex + 1;
      }
    }
    return arr[start];
  }

  function selectQuantileInPlace(work, p){
    if(!work.length){
      return NaN;
    }
    const pos = (work.length - 1) * Math.min(Math.max(p, 0), 1);
    const lowerIndex = Math.floor(pos);
    const upperIndex = Math.ceil(pos);
    const lowerValue = nthValueInPlace(work, lowerIndex);
    if(upperIndex === lowerIndex){
      return lowerValue;
    }
    const upperValue = nthValueInPlace(work, upperIndex);
    return lowerValue + (upperValue - lowerValue) * (pos - lowerIndex);
  }

  function quantileFromUnsorted(values, p){
    if(!Array.isArray(values) || !values.length){
      return NaN;
    }
    const pos = (values.length - 1) * Math.min(Math.max(p, 0), 1);
    const lowerIndex = Math.floor(pos);
    const upperIndex = Math.ceil(pos);
    const working = values.slice();
    const lowerValue = nthValueInPlace(working, lowerIndex);
    if(upperIndex === lowerIndex){
      return lowerValue;
    }
    const upperValue = nthValueInPlace(working, upperIndex);
    return lowerValue + (upperValue - lowerValue) * (pos - lowerIndex);
  }

  function computeTraceSummary(values, options){
    const requireSorted = !!options?.requireSorted;
    const assumeFiniteValues = options?.assumeFiniteValues === true;
    const precomputed = options?.precomputedMoments && Number.isFinite(options.precomputedMoments.count)
      ? options.precomputedMoments
      : null;
    if(!Array.isArray(values) || !values.length){
      return {
        count: 0,
        mean: 0,
        variance: 0,
        sd: 0,
        min: NaN,
        max: NaN,
        q1: NaN,
        median: NaN,
        q3: NaN,
        iqr: 0,
        sortedValues: requireSorted ? [] : null,
        sum: 0,
        sumSquares: 0,
        sumCubes: 0,
        sumFourth: 0
      };
    }
    const sourceValues = Array.isArray(values) ? values : [];
    let numericValues;
    if(assumeFiniteValues){
      numericValues = sourceValues.slice();
    }else{
      numericValues = [];
      for(let idx = 0; idx < sourceValues.length; idx++){
        const v = Number(sourceValues[idx]);
        if(Number.isFinite(v)){
          numericValues.push(v);
        }
      }
    }
    const count = precomputed?.count ?? numericValues.length;
    if(!count){
      return {
        count: 0,
        mean: 0,
        variance: 0,
        sd: 0,
        min: NaN,
        max: NaN,
        q1: NaN,
        median: NaN,
        q3: NaN,
        iqr: 0,
        sortedValues: requireSorted ? [] : null,
        sum: 0,
        sumSquares: 0,
        sumCubes: 0,
        sumFourth: 0
      };
    }
    let min = Number.isFinite(precomputed?.min) ? precomputed.min : numericValues[0];
    let max = Number.isFinite(precomputed?.max) ? precomputed.max : numericValues[0];
    let sum = Number.isFinite(precomputed?.sum) ? precomputed.sum : 0;
    let sumSquares = Number.isFinite(precomputed?.sumSquares) ? precomputed.sumSquares : 0;
    let sumCubes = Number.isFinite(precomputed?.sumCubes) ? precomputed.sumCubes : 0;
    let sumFourth = Number.isFinite(precomputed?.sumFourth) ? precomputed.sumFourth : 0;
    if(!precomputed){
      for(let idx = 0; idx < numericValues.length; idx++){
        const value = numericValues[idx];
        if(value < min) min = value;
        if(value > max) max = value;
        sum += value;
        const square = value * value;
        sumSquares += square;
        sumCubes += square * value;
        sumFourth += square * square;
      }
    }
    const mean = sum / count;
    const variance = count > 1 ? Math.max(0, (sumSquares - (sum * sum) / count) / (count - 1)) : 0;
    const sd = Math.sqrt(variance);
    let q1;
    let median;
    let q3;
    let sortedValues = null;
    if(requireSorted){
      const sorted = numericValues.slice().sort((a, b) => a - b);
      sortedValues = sorted;
      q1 = percentileFromSorted(sorted, 0.25);
      median = percentileFromSorted(sorted, 0.5);
      q3 = percentileFromSorted(sorted, 0.75);
    }else{
      const working = numericValues;
      q1 = selectQuantileInPlace(working, 0.25);
      median = selectQuantileInPlace(working, 0.5);
      q3 = selectQuantileInPlace(working, 0.75);
    }
    return {
      count,
      mean,
      variance,
      sd,
      min,
      max,
      q1,
      median,
      q3,
      iqr: Number.isFinite(q3) && Number.isFinite(q1) ? q3 - q1 : 0,
      sortedValues,
      sum,
      sumSquares,
      sumCubes,
      sumFourth
    };
  }
  function normalQuantile(p){
    const clipped = Math.min(Math.max(p, Number.EPSILON), 1 - Number.EPSILON);
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.38357751867269e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const plow = 0.02425;
    const phigh = 1 - plow;
    let q;
    let r;
    if(clipped < plow){
      q = Math.sqrt(-2 * Math.log(clipped));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if(clipped > phigh){
      q = Math.sqrt(-2 * Math.log(1 - clipped));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = clipped - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4] + 1);
  }



    function computeQQPoints(values,options){
    const maxSample=Number.isFinite(options?.maxSampleSize)
      ? Math.max(25,Math.floor(options.maxSampleSize))
      : ASSUMPTION_QQ_SAMPLE_LIMIT;

    const source=Array.isArray(values)?values:[];
    const finite=source.filter(Number.isFinite);
    if(finite.length<3){
      return [];
    }

    // Standard QQ-plot points: theoretical normal quantiles vs observed sample quantiles (raw scale).
    const sorted=finite.slice().sort((a,b)=>a-b);
    const n=sorted.length;

    // Use all points when possible; for very large n, downsample to maxSample evenly across the distribution.
    const sampleCount=Math.min(n,maxSample);
    const points=[];
    for(let i=0;i<sampleCount;i++){
      // Evenly-spaced order statistics (quantile sampling) to keep the QQ shape faithful when downsampling.
      const idx=Math.min(n-1,Math.max(0,Math.floor(((i+0.5)*n)/sampleCount - 0.5)));
      const p=(idx+0.5)/n;
      const theoretical=normalQuantile(p);
      const observed=sorted[idx];
      points.push({ theoretical, observed });
    }

    const sampled=n>maxSample;
    logDebug('Debug: box QQ points computed',{
      sampleCount: points.length,
      sourceSize: source.length,
      finiteSize: finite.length,
      n,
      sampled
    });
    return points;
  }

  function computeDagostino(values, summary){
    const series = Array.isArray(values) ? values : [];
    const readySummary = summary && Number.isFinite(summary.count) && summary.count > 0
      && Number.isFinite(summary.sum) && Number.isFinite(summary.sumSquares)
      && Number.isFinite(summary.sumCubes) && Number.isFinite(summary.sumFourth)
      ? summary
      : null;
    let n = readySummary ? readySummary.count : 0;
    let sum = readySummary ? readySummary.sum : 0;
    let sumSquares = readySummary ? readySummary.sumSquares : 0;
    let sumCubes = readySummary ? readySummary.sumCubes : 0;
    let sumFourth = readySummary ? readySummary.sumFourth : 0;
    if(!readySummary){
      for(let idx = 0; idx < series.length; idx++){
        const value = Number(series[idx]);
        if(!Number.isFinite(value)){
          continue;
        }
        n += 1;
        sum += value;
        const square = value * value;
        sumSquares += square;
        sumCubes += square * value;
        sumFourth += square * square;
      }
    }
    if(n < 8){
      return { method: 'dagostino', sampleSize: n, statistic: NaN, pValue: NaN, passed: null, reason: 'Sample size < 8' };
    }
    const meanVal = sum / n;
    const m2 = sumSquares - (sum * sum) / n;
    const meanSquared = meanVal * meanVal;
    const meanCubed = meanSquared * meanVal;
    const meanFourth = meanSquared * meanSquared;
    const m3 = sumCubes - 3 * meanVal * sumSquares + 2 * n * meanCubed;
    const m4 = sumFourth - 4 * meanVal * sumCubes + 6 * meanSquared * sumSquares - 3 * n * meanFourth;
    const s2 = m2 / (n - 1 || 1);
    const s = Math.sqrt(Math.max(s2, 0));
    if(!Number.isFinite(s) || s === 0){
      return { method: 'dagostino', sampleSize: n, statistic: 0, pValue: 1, passed: true, reason: 'Zero variance' };
    }
    const s3 = Math.pow(s, 3);
    const s4 = Math.pow(s, 4);
    const g1 = (n * m3) / ((n - 1) * (n - 2) * s3);
    const g2 = ((n * (n + 1) * m4) / ((n - 1) * (n - 2) * (n - 3) * s4)) - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    const mu2 = 6 * (n - 2) / ((n + 1) * (n + 3));
    const gamma2 = 36 * (n - 7) * (n * n + 2 * n - 5) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
    const w2 = Math.sqrt(2 * gamma2 + 4) - 1;
    const alpha = Math.sqrt(2 / (w2 - 1));
    const delta = 1 / Math.sqrt(Math.log(w2));
    const z1 = delta * Math.asinh(g1 / (alpha * Math.sqrt(mu2)));
    const mu1g2 = -6 / (n + 1);
    const mu2g2 = 24 * n * (n - 2) * (n - 3) / (Math.pow(n + 1, 2) * (n + 3) * (n + 5));
    const gamma1g2 = (6 * (n * n - 5 * n + 2) / ((n + 7) * (n + 9))) * Math.sqrt(6 * (n + 3) * (n + 5) / (n * (n - 2) * (n - 3)));
    const gamma2g2 = 36 * (15 * Math.pow(n, 6) - 36 * Math.pow(n, 5) - 628 * Math.pow(n, 4) + 982 * Math.pow(n, 3) + 5777 * Math.pow(n, 2) - 6402 * n + 900) /
      (n * (n - 3) * (n - 2) * (n + 7) * (n + 9) * (n + 11) * (n + 13));
    const A = 6 + (8 / gamma2g2) * (2 / gamma2g2 + gamma1g2 * gamma1g2);
    const term = (g2 - mu1g2) / Math.sqrt(mu2g2) * Math.sqrt(2 / (A - 4));
    const base = Math.pow((1 - 2 / A) / (1 + term), 1 / 3);
    const z2 = Math.sqrt(9 * A / 2) * (1 - 2 / (9 * A) - base);
    const statistic = z1 * z1 + z2 * z2;
    const pValue = Math.exp(-statistic / 2);
    const passed = isValidProbability(pValue) ? pValue >= ASSUMPTION_ALPHA : null;
    return { method: 'dagostino', sampleSize: n, statistic, pValue, passed, z1, z2, g1, g2 };
  }

  function computeVarianceDiagnostics(groups, labels, options){
    const summaries = [];
    let totalN = 0;
    let grandSum = 0;
    const sparklineValues = [];
    const summaryList = Array.isArray(options?.summaries) ? options.summaries : null;
    for(let idx = 0; idx < groups.length; idx++){
      const group = Array.isArray(groups[idx]) ? groups[idx] : [];
      const label = labels[idx];
      if(!group.length){
        summaries.push({ count: 0, sum: 0, sumSquares: 0, mean: 0, median: NaN });
        sparklineValues.push({ label, value: 0 });
        continue;
      }
      const summaryRef = summaryList && summaryList[idx];
      const median = Number.isFinite(summaryRef?.median)
        ? summaryRef.median
        : quantileFromUnsorted(group, 0.5);
      let count = 0;
      let sum = 0;
      let sumSquares = 0;
      for(let j = 0; j < group.length; j++){
        const value = Number(group[j]);
        if(!Number.isFinite(value)){
          continue;
        }
        const deviation = Math.abs(value - (Number.isFinite(median) ? median : 0));
        sum += deviation;
        sumSquares += deviation * deviation;
        count++;
      }
      totalN += count;
      grandSum += sum;
      const mean = count ? sum / count : 0;
      sparklineValues.push({ label, value: mean });
      summaries.push({ count, sum, sumSquares, mean, median });
    }
    const k = summaries.length;
    if(k < 2){
      return { method: 'brown-forsythe', statistic: NaN, pValue: NaN, passed: null, df1: 0, df2: 0, sparkline: [], reason: 'Need ≥2 groups' };
    }
    if(totalN <= k){
      return { method: 'brown-forsythe', statistic: NaN, pValue: NaN, passed: null, df1: k - 1, df2: Math.max(totalN - k, 0), sparkline: [], reason: 'Insufficient observations' };
    }
    const grandMean = grandSum / totalN;
    let ssBetween = 0;
    let ssWithin = 0;
    summaries.forEach(summary => {
      if(!summary.count){
        return;
      }
      const meanVal = summary.mean;
      ssBetween += summary.count * Math.pow(meanVal - grandMean, 2);
      const within = summary.sumSquares - (summary.sum * summary.sum) / (summary.count || 1);
      if(Number.isFinite(within)){
        ssWithin += within;
      }
    });
    const df1 = k - 1;
    const df2 = totalN - k;
    const msBetween = ssBetween / (df1 || 1);
    const msWithin = ssWithin / (df2 || 1);
    let F = NaN;
    let pValue = NaN;
    if(msWithin > 0){
      F = msBetween / msWithin;
      pValue = Number.isFinite(F) ? fUpperTailPValue(F, df1, df2) : NaN;
    }else if(msBetween > 0){
      F = Infinity;
      pValue = 0;
    }else{
      F = NaN;
      pValue = NaN;
    }
    const passed = isValidProbability(pValue) ? pValue >= ASSUMPTION_ALPHA : null;
    return { method: 'brown-forsythe', statistic: F, pValue, passed, df1, df2, sparkline: sparklineValues };
  }



  const SHAPIRO_A_CACHE = new Map();

  function shapiroPoly(cc, x){
    // Polynomial with cc[0] as constant term.
    let p = x * cc[cc.length-1];
    for(let j=cc.length-2;j>=1;j--){
      p = (p + cc[j]) * x;
    }
    return cc[0] + p;
  }

  function shapiroSign(x, y){
    // Fortran SIGN function: abs(x) with sign of y.
    return y < 0 ? -Math.abs(x) : Math.abs(x);
  }

  function shapiroPpnd7(p){
    // Algorithm AS 241: normal deviate (inverse normal CDF) approximation.
    const zero=0.0, one=1.0, half=0.5;
    const split1=0.425, split2=5.0, const1=0.180625, const2=1.6;

    const a0=3.3871327179, a1=50.434271938, a2=159.29113202, a3=59.10937472;
    const b1=17.895169469, b2=78.757757664, b3=67.1875636;

    const c0=1.4234372777, c1=2.75681539, c2=1.3067284816, c3=0.17023821103;
    const d1=0.7370016425, d2=0.12021132975;

    const e0=6.657905115, e1=3.081226386, e2=0.42868294337, e3=0.017337203997;
    const f1=0.24197894225, f2=0.012258202635;

    const clipped = Math.min(Math.max(Number(p), Number.EPSILON), 1-Number.EPSILON);
    const q = clipped - half;

    if(Math.abs(q) <= split1){
      const r = const1 - q*q;
      return q * (((a3*r + a2)*r + a1)*r + a0) / ((((b3*r + b2)*r + b1)*r + one));
    }

    let r = q < zero ? clipped : (one - clipped);
    if(r <= zero){
      return zero;
    }

    r = Math.sqrt(-Math.log(r));
    let normalDev;
    if(r <= split2){
      r = r - const2;
      normalDev = (((c3*r + c2)*r + c1)*r + c0) / (((d2*r + d1)*r + one));
    }else{
      r = r - split2;
      normalDev = (((e3*r + e2)*r + e1)*r + e0) / (((f2*r + f1)*r + one));
    }

    return q < zero ? -normalDev : normalDev;
  }

  function shapiroAlnorm(x, upper){
    // Algorithm AS 66: normal distribution tail area.
    const zero=0, one=1, half=0.5;
    const con=1.28, ltone=7.0, utzero=18.66;
    const p=0.398942280444, q=0.39990348504, r=0.398942280385;
    const a1=5.75885480458, a2=2.62433121679, a3=5.92885724438;
    const b1=-29.8213557807, b2=48.6959930692;
    const c1=-3.8052e-8, c2=3.98064794e-4, c3=-0.151679116635, c4=4.8385912808, c5=0.742380924027, c6=3.99019417011;
    const d1=1.00000615302, d2=1.98615381364, d3=5.29330324926, d4=-15.1508972451, d5=30.789933034;

    let z=Number(x);
    let up=!!upper;
    if(!Number.isFinite(z)){
      return NaN;
    }
    if(z < zero){
      up = !up;
      z = -z;
    }

    let alnorm;
    if(z <= ltone || (up && z <= utzero)){
      const y = half * z * z;
      if(z > con){
        alnorm = r * Math.exp(-y) / (z + c1 + d1 / (z + c2 + d2 / (z + c3 + d3 / (z + c4 + d4 / (z + c5 + d5 / (z + c6))))));
      }else{
        alnorm = half - z * (p - q * y / (y + a1 + b1 / (y + a2 + b2 / (y + a3))));
      }
    }else{
      alnorm = zero;
    }

    if(!up){
      alnorm = one - alnorm;
    }
    return alnorm;
  }

  function shapiroCoefficients(n){
    const cached = SHAPIRO_A_CACHE.get(n);
    if(cached){
      return cached.slice();
    }

    const an = Number(n);
    const nn2 = Math.floor(n/2);
    const a = new Array(nn2).fill(0);

    const zero=0.0, one=1.0, two=2.0;
    const sqrth=0.70711;
    const c1=[0.0,0.221157,-0.147981,-2.07119,4.434685,-2.706056];
    const c2=[0.0,0.042981,-0.293762,-1.752461,5.682633,-3.582633];

    if(n===3){
      a[0]=sqrth;
      SHAPIRO_A_CACHE.set(n, a.slice());
      return a;
    }

    const an25 = an + 0.25;
    let summ2 = zero;

    for(let i=1;i<=nn2;i++){
      a[i-1] = shapiroPpnd7((i - 0.375) / an25);
      summ2 += a[i-1]*a[i-1];
    }

    summ2 *= two;
    const ssumm2 = Math.sqrt(summ2);
    const rsn = one / Math.sqrt(an);
    const a1 = shapiroPoly(c1, rsn) - a[0] / ssumm2;

    let i1;
    let fac;
    if(n > 5){
      i1 = 3;
      const a2 = -a[1] / ssumm2 + shapiroPoly(c2, rsn);
      fac = Math.sqrt((summ2 - two*a[0]*a[0] - two*a[1]*a[1]) / (one - two*a1*a1 - two*a2*a2));
      a[1] = a2;
    }else{
      i1 = 2;
      fac = Math.sqrt((summ2 - two*a[0]*a[0]) / (one - two*a1*a1));
    }

    a[0] = a1;
    for(let i=i1;i<=nn2;i++){
      a[i-1] = a[i-1] / (-fac);
    }

    SHAPIRO_A_CACHE.set(n, a.slice());
    return a;
  }

  function computeShapiroWilk(values){
    const source = Array.isArray(values) ? values : [];
    const x = source.filter(Number.isFinite).map(Number).sort((a,b)=>a-b);
    const n = x.length;

    if(n < 3){
      logDebug('Debug: box shapiro-wilk insufficient sample',{ n });
      return { method:'shapiro-wilk', sampleSize:n, statistic:NaN, pValue:NaN, passed:null, reason:'Sample size < 3' };
    }

    const SMALL = 1e-19;
    const range = x[n-1] - x[0];
    if(!(range > SMALL)){
      logDebug('Debug: box shapiro-wilk zero range',{ n, range });
      return {
        method:'shapiro-wilk',
        sampleSize:n,
        statistic:NaN,
        pValue:NaN,
        passed:null,
        available:false,
        degenerate:true,
        ifault:6,
        reason:'All observations are identical; normality cannot be assessed.'
      };
    }

    // Coefficients for the test.
    const a = shapiroCoefficients(n);


    // Compute W statistic (uncensored, n1 = n).
    let xx = x[0] / range;
    let sx = xx;
    let sa = -a[0];
    let j = n - 1;

    for(let i=2;i<=n;i++){
      const xi = x[i-1] / range;
      if(xx - xi > SMALL){
        logDebug('Debug: box shapiro-wilk unexpected sort order',{ n, i, prev: xx, current: xi });
        return { method:'shapiro-wilk', sampleSize:n, statistic:NaN, pValue:NaN, passed:null, ifault:7, reason:'Sort order check failed' };
      }
      sx += xi;
      if(i !== j){
        sa += shapiroSign(1, i - j) * a[Math.min(i,j)-1];
      }
      xx = xi;
      j -= 1;
    }

    sa /= n;
    sx /= n;

    let ssa = 0.0;
    let ssx = 0.0;
    let sax = 0.0;
    j = n;

    for(let i=1;i<=n;i++, j--){
      let asa;
      if(i !== j){
        asa = shapiroSign(1, i - j) * a[Math.min(i,j)-1] - sa;
      }else{
        asa = -sa;
      }
      const xsx = x[i-1] / range - sx;
      ssa += asa * asa;
      ssx += xsx * xsx;
      sax += asa * xsx;
    }

    const ssassx = Math.sqrt(ssa * ssx);
    let w1 = (ssassx - sax) * (ssassx + sax) / (ssa * ssx);
    // Numerical guard.
    if(!Number.isFinite(w1)){
      logDebug('Debug: box shapiro-wilk invalid w1',{ n, w1, ssa, ssx, sax });
      return { method:'shapiro-wilk', sampleSize:n, statistic:NaN, pValue:NaN, passed:null, ifault:9, reason:'Invalid numeric state' };
    }
    w1 = Math.max(SMALL, Math.min(1, w1));
    const W = Math.max(0, Math.min(1, 1 - w1));

    // p-value.
    let pValue;
    let ifault = 0;

    if(n === 3){
      const pi6 = 1.909859;
      const stqr = 1.047198;
      pValue = pi6 * (Math.asin(Math.sqrt(W)) - stqr);
      pValue = Math.max(0, Math.min(1, pValue));
      const passed = pValue >= ASSUMPTION_ALPHA;
      logDebug('Debug: box shapiro-wilk result (n=3)',{ n, W, pValue, passed });
      return { method:'shapiro-wilk', sampleSize:n, statistic:W, pValue, passed, ifault };
    }

    // Transform (Royston) to normal equivalent deviate.
    let y = Math.log(w1);
    const an = Number(n);
    const logn = Math.log(an);

    let m = 0.0;
    let s = 1.0;

    // Polynomial coefficients (AS R94 / AS 181).
    const g=[-2.273, 0.459];
    const c3=[0.544, -0.39978, 0.025054, -0.0006714];
    const c4=[1.3822, -0.77857, 0.062767, -0.0020322];
    const c5=[-1.5861, -0.31082, -0.083751, 0.0038915];
    const c6=[-0.4803, -0.082676, 0.0030302];

    if(n <= 11){
      const gamma = shapiroPoly(g, an);
      if(y >= gamma){
        pValue = SMALL;
        ifault = 0;
        const passed = pValue >= ASSUMPTION_ALPHA;
        logDebug('Debug: box shapiro-wilk result (n<=11 gamma)',{ n, W, w1, y, gamma, pValue, passed });
        return { method:'shapiro-wilk', sampleSize:n, statistic:W, pValue, passed, ifault };
      }
      y = -Math.log(gamma - y);
      m = shapiroPoly(c3, an);
      s = Math.exp(shapiroPoly(c4, an));
    }else{
      m = shapiroPoly(c5, logn);
      s = Math.exp(shapiroPoly(c6, logn));
      if(n > 5000){
        ifault = 2; // matches typical "p-value may be inaccurate" warning
      }
    }

    const z = (y - m) / s;
    pValue = shapiroAlnorm(z, true);

    // Clamp.
    if(!Number.isFinite(pValue)){
      logDebug('Debug: box shapiro-wilk invalid pValue',{ n, W, z, y, m, s, pValue });
      return { method:'shapiro-wilk', sampleSize:n, statistic:W, pValue:NaN, passed:null, ifault:9, reason:'Invalid pValue' };
    }

    pValue = Math.max(0, Math.min(1, pValue));
    const passed = pValue >= ASSUMPTION_ALPHA;

    logDebug('Debug: box shapiro-wilk result',{
      n,
      W,
      w1,
      z,
      y,
      m,
      s,
      pValue,
      passed,
      ifault
    });

    return { method:'shapiro-wilk', sampleSize:n, statistic:W, pValue, passed, ifault };
  }





  function computeBartlettVarianceDiagnostics(groups,labels,options={}){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>normalizeFiniteSample(group));
    const k=cleaned.length;
    if(k<2 || cleaned.some(group=>group.length<2)){
      return {method:'bartlett',statistic:NaN,pValue:NaN,passed:null,df1:Math.max(k-1,0),df2:0,sparkline:[],reason:'Each of at least two groups needs two observations'};
    }
    const counts=cleaned.map(group=>group.length);
    const variances=cleaned.map(group=>{
      const center=mean(group);
      return Math.max(group.reduce((sum,value)=>sum+Math.pow(value-center,2),0)/(group.length-1),Number.EPSILON);
    });
    const totalN=counts.reduce((sum,value)=>sum+value,0);
    const df=totalN-k;
    const pooled=counts.reduce((sum,count,index)=>sum+((count-1)*variances[index]),0)/df;
    const numerator=df*Math.log(pooled)-counts.reduce((sum,count,index)=>sum+((count-1)*Math.log(variances[index])),0);
    const correction=1+(1/(3*(k-1)))*(counts.reduce((sum,count)=>sum+(1/(count-1)),0)-(1/df));
    const statistic=numerator/Math.max(correction,Number.EPSILON);
    const pValue=chiSquareUpperTailPValue(statistic,k-1);
    const alpha=sanitizeStatsAlpha(options.alpha,ASSUMPTION_ALPHA);
    return {method:'bartlett',statistic,pValue,passed:isValidProbability(pValue)?pValue>=alpha:null,df1:k-1,df2:df,sparkline:(labels||[]).map((label,index)=>({label,value:variances[index]}))};
  }

  function computeDistributionComparison(values){
    const cleaned=normalizeFiniteSample(values);
    if(cleaned.length<3 || !Shared.stats || typeof Shared.stats.fitDistribution!=='function'){
      return null;
    }
    const normalFit=Shared.stats.fitDistribution(cleaned,{distribution:'normal'});
    const lognormalFit=cleaned.every(value=>value>0) ? Shared.stats.fitDistribution(cleaned,{distribution:'lognormal'}) : null;
    const aicc=(fit,k=2)=>{
      const ll=Number(fit?.logLikelihood);
      const n=cleaned.length;
      if(!Number.isFinite(ll) || n<=k+1) return NaN;
      return (2*k)-(2*ll)+((2*k*(k+1))/(n-k-1));
    };
    const normalAicc=aicc(normalFit);
    const lognormalAicc=aicc(lognormalFit);
    return {
      preferred:Number.isFinite(lognormalAicc)&&(!Number.isFinite(normalAicc)||lognormalAicc<normalAicc)?'lognormal':'normal',
      normalAicc,lognormalAicc,
      deltaAicc:Number.isFinite(normalAicc)&&Number.isFinite(lognormalAicc)?Math.abs(normalAicc-lognormalAicc):NaN
    };
  }

  function computeLinearTrendTest(groups,options={}){
    const x=[];const y=[];
    (Array.isArray(groups)?groups:[]).forEach((group,index)=>normalizeFiniteSample(group).forEach(value=>{x.push(index);y.push(value);}));
    if(x.length<3){return {available:false,message:'Need at least three observations.'};}
    const mx=mean(x),my=mean(y);
    let sxx=0,sxy=0,sse=0;
    for(let i=0;i<x.length;i+=1){sxx+=Math.pow(x[i]-mx,2);sxy+=(x[i]-mx)*(y[i]-my);}
    if(!(sxx>0)){return {available:false,message:'Need at least two ordered groups.'};}
    const slope=sxy/sxx;const intercept=my-(slope*mx);
    for(let i=0;i<x.length;i+=1){sse+=Math.pow(y[i]-(intercept+slope*x[i]),2);}
    const df=x.length-2;const se=Math.sqrt((sse/df)/sxx);const tValue=se>0?slope/se:(slope===0?0:(slope>0?Infinity:-Infinity));
    return {available:true,slope,intercept,t:tValue,df,p:resolveStudentTPValue(tValue,df,options.alternative)};
  }

  function sanitizeOutlierMode(value){return ['grubbs','rout','routTest'].includes(value)?value:'none';}
  function sanitizeOutlierAlpha(value,fallback=0.05){
    const numeric=Number(value);
    return Number.isFinite(numeric)&&numeric>0&&numeric<0.25?numeric:fallback;
  }
  function sanitizeOutlierQ(value,fallback=0.01){
    const numeric=Number(value);
    return Number.isFinite(numeric)&&numeric>0&&numeric<0.25?numeric:fallback;
  }
  function resolveStatsOutlierAlpha(options){return sanitizeOutlierAlpha(options?.statsOutlierAlpha,0.05);}
  function resolveStatsOutlierQ(options){return sanitizeOutlierQ(options?.statsOutlierQ,0.01);}
  function detectGrubbsOutliers(values,options={}){
    const working=normalizeFiniteSample(values).map((value,index)=>({value,index}));
    const removed=[];const alpha=sanitizeOutlierAlpha(options.alpha,0.05);const inv=global.jStat?.studentt?.inv;
    if(typeof inv!=='function') return {kept:working.map(item=>item.value),removed,note:'Student-t inverse unavailable; Grubbs screening skipped.'};
    // Grubbs tests one extreme, not a sequence of selected hypotheses.
    if(working.length>=3){
      const center=mean(working.map(item=>item.value));
      const sd=Math.sqrt(working.reduce((sum,item)=>sum+Math.pow(item.value-center,2),0)/(working.length-1));
      if(!(sd>0)) return {kept:working.map(item=>item.value),removed};
      let maxIndex=0,maxG=-Infinity;working.forEach((item,index)=>{const g=Math.abs(item.value-center)/sd;if(g>maxG){maxG=g;maxIndex=index;}});
      const n=working.length;const tc=inv(1-(alpha/(2*n)),n-2);const critical=((n-1)/Math.sqrt(n))*Math.sqrt((tc*tc)/(n-2+(tc*tc)));
      if(maxG>critical){
        removed.push({...working[maxIndex],statistic:maxG,critical});working.splice(maxIndex,1);
      }
    }
    return {kept:working.map(item=>item.value),removed};
  }
  function flagMadBhObservations(values,options={}){
    const source=normalizeFiniteSample(values).map((value,index)=>({value,index}));
    if(source.length<4) return {kept:source.map(item=>item.value),removed:[],flags:[],note:'MAD heuristic needs at least four observations.'};
    const sorted=source.map(item=>item.value).sort((a,b)=>a-b);const median=quantileFromUnsorted(sorted,0.5);
    const mad=quantileFromUnsorted(source.map(item=>Math.abs(item.value-median)).sort((a,b)=>a-b),0.5);
    if(!(mad>0)) return {kept:source.map(item=>item.value),removed:[],flags:[],note:'MAD is zero; heuristic scores are undefined and no observations were flagged.'};
    const sigma=1.4826*mad;
    const scores=source.map(item=>({z:Math.abs((item.value-median)/sigma)}));
    const adjusted=applyPValueCorrection(scores.map(item=>normalTwoSidedPValue(item.z)),'bh');const q=sanitizeOutlierQ(options.q,0.01);
    const flags=[];source.forEach((item,index)=>{if(Number(adjusted[index])<=q&&scores[index].z>=3) flags.push({...item,robustZ:scores[index].z,adjustedScore:adjusted[index]});});
    return {kept:source.map(item=>item.value),removed:[],flags};
  }
  function detectRoutOutliers(values,options={}){
    const source=normalizeFiniteSample(values).map((value,index)=>({value,index}));
    const unchanged=note=>({kept:source.map(item=>item.value),removed:[],note});
    const n=source.length;
    if(n<4) return unchanged('ROUT needs at least four observations to screen the largest 30% of residuals.');
    const origin=quantileFromUnsorted(source.map(item=>item.value),0.5);
    const unit=source.reduce((largest,item)=>Math.max(largest,Math.abs(item.value-origin)),0);
    if(!(unit>0 && Number.isFinite(unit))) return unchanged('ROUT residual scale is unavailable; no observations excluded.');
    const sample=source.map(item=>(item.value-origin)/unit);
    const scaleAt=center=>quantileFromUnsorted(sample.map(value=>Math.abs(value-center)),0.6827)*n/(n-1);
    const merit=(center,scale)=>sample.reduce((sum,value)=>sum+Math.log1p(Math.pow((value-center)/scale,2)),0);
    let center=mean(sample),scale=scaleAt(center),damping=0.001,converged=false;
    // Motulsky & Brown (2006), equations 15-16, specialized to a constant
    // location model (K=1). Compare both merits using the candidate RSDR.
    for(let iteration=0;iteration<500;iteration+=1){
      if(!(scale>0)) return unchanged('ROUT residual scale is zero; no observations excluded.');
      let weightedResidual=0,weightSum=0;
      sample.forEach(value=>{const residual=value-center,weight=1/(1+Math.pow(residual/scale,2));weightedResidual+=weight*residual;weightSum+=weight;});
      const direction=weightedResidual/weightSum;
      if(Math.abs(direction)<=1e-8*Math.max(scale,1e-8)){converged=true;break;}
      const candidate=center+direction/(1+damping),candidateScale=scaleAt(candidate);
      if(!(candidateScale>0)) return unchanged('ROUT residual scale is zero; no observations excluded.');
      if(merit(candidate,candidateScale)<merit(center,candidateScale)){
        center=candidate;scale=candidateScale;damping=Math.max(1e-12,damping/10);
      }else{
        damping*=10;
        if(damping>1e12) break;
      }
    }
    if(!converged) return unchanged('ROUT robust fit did not converge; no observations excluded.');
    const ranked=sample.map((value,index)=>({index,residual:Math.abs(value-center)})).sort((a,b)=>a.residual-b.residual||a.index-b.index);
    const q=sanitizeOutlierQ(options.q,0.01),removed=[];
    for(let index=n-Math.floor(0.3*n);index<n;index+=1){
      const p=studentTTwoSidedPValue(ranked[index].residual/scale,n-1),threshold=q*(n-index)/n;
      if(p<threshold){
        ranked.slice(index).forEach(item=>removed.push({...source[item.index],residual:item.residual*unit,p:studentTTwoSidedPValue(item.residual/scale,n-1)}));
        break;
      }
    }
    const excluded=new Set(removed.map(item=>item.index));
    return {kept:source.filter(item=>!excluded.has(item.index)).map(item=>item.value),removed,center:origin+center*unit,rsdr:scale*unit,df:n-1,q,converged:true};
  }
  function screenStatsSample(values,mode,options){
    if(mode==='grubbs') return detectGrubbsOutliers(values,{alpha:options.alpha});
    if(mode==='routTest') return detectRoutOutliers(values,{q:options.q});
    return flagMadBhObservations(values,{q:options.q});
  }
  function preprocessStatsGroups(groups,labels,payload){
    const mode=sanitizeOutlierMode(payload.statsOutlierMode);
    const paired=payload.statsPaired && payload.statsMode!=='oneSample';
    const aligned=paired ? alignCompleteRows(groups,payload.rowIndicesByGroup) : null;
    const excludedIncompleteRows=aligned?.excludedRows || 0;
    const cleaned=paired ? aligned.groups : (groups||[]).map(normalizeFiniteSample);
    const auditNotes=[];const exclusions=[];const flags=[];
    if(aligned?.excludedRows){
      const count=aligned.excludedRows;
      auditNotes.push(`${count} ${count===1?'row':'rows'} with missing or non-numeric values across the selected groups ${count===1?'was':'were'} excluded to preserve paired/repeated-measures alignment.`);
    }
    if(mode==='none') return {groups:cleaned,auditNotes,exclusions,flags,excludedIncompleteRows};
    auditNotes.push(mode==='grubbs'
      ? 'Single-outlier Grubbs exclusion assumes normal data with at most one outlier per screened sample. Exclusion-based inference is exploratory: p-values and confidence intervals do not account for data-dependent selection.'
      : mode==='routTest'
        ? 'ROUT uses adaptive Lorentzian constant-location fitting and residual screening (Q per sample; maximum 30% excluded). Subsequent inference is exploratory and does not account for data-dependent exclusion.'
        : 'MAD + BH scores are heuristic flags, not ROUT or validated FDR control; all observations are retained.');
    if(paired&&cleaned.length>2){auditNotes.push('Outlier screening was not applied to repeated-measures designs with more than two groups to preserve row alignment.');return {groups:cleaned,auditNotes,exclusions,flags,excludedIncompleteRows};}
    if(paired&&cleaned.length===2){
      const pairs=computePairedSamples(cleaned[0],cleaned[1]);const differences=pairs.map(pair=>pair.a-pair.b);
      const result=screenStatsSample(differences,mode,{alpha:payload.statsOutlierAlpha,q:payload.statsOutlierQ});
      const removedIndices=new Set(result.removed.map(item=>item.index));const kept=pairs.filter((_,index)=>!removedIndices.has(index));
      result.removed.forEach(item=>exclusions.push({group:'paired-differences',index:aligned.rows[item.index],value:item.value}));
      (result.flags||[]).forEach(item=>flags.push({...item,group:'paired-differences',index:aligned.rows[item.index]}));
      if(result.note) auditNotes.push(result.note);
      auditNotes.push(`Outlier screening on paired differences excluded ${result.removed.length} row${result.removed.length === 1 ? '' : 's'}.`);
      if(flags.length) auditNotes.push(`Flagged paired differences: ${flags.map(item=>formatStatNumber(item.value)).join(', ')}; none excluded.`);
      if(exclusions.length) auditNotes.push(`Excluded paired differences: ${exclusions.map(item=>formatStatNumber(item.value)).join(', ')}.`);
      return {groups:[kept.map(pair=>pair.a),kept.map(pair=>pair.b)],auditNotes,exclusions,flags,excludedIncompleteRows};
    }
    const screenAlpha=resolveStatsOutlierAlpha(payload)/Math.max(1,cleaned.length);
    if(mode==='grubbs') auditNotes.push(`Grubbs screening uses Bonferroni α = ${formatStatNumber(screenAlpha)} across ${cleaned.length} selected samples.`);
    const processed=cleaned.map((group,index)=>{
      const result=screenStatsSample(group,mode,{alpha:screenAlpha,q:payload.statsOutlierQ});
      result.removed.forEach(item=>exclusions.push({group:labels[index],index:item.index,value:item.value}));
      (result.flags||[]).forEach(item=>flags.push({...item,group:labels[index]}));
      if(result.note) auditNotes.push(`${labels[index]}: ${result.note}`);
      if(result.removed.length) auditNotes.push(`${labels[index]}: excluded ${result.removed.map(item=>formatStatNumber(item.value)).join(', ')} by ${mode==='routTest'?'ROUT':'a single Grubbs test'}; n = ${group.length} → ${result.kept.length}.`);
      if(result.flags?.length) auditNotes.push(`${labels[index]}: flagged ${result.flags.map(item=>formatStatNumber(item.value)).join(', ')}; none excluded.`);
      return result.kept;
    });
    return {groups:processed,auditNotes,exclusions,flags,excludedIncompleteRows};
  }

  function computeAssumptionDiagnostics(groups,labels,options={}){
    const alpha=sanitizeStatsAlpha(options.alpha,ASSUMPTION_ALPHA);
    const requestedNormality=['shapiro-wilk','dagostino','auto'].includes(options.normalityMethod)?options.normalityMethod:'auto';
    const varianceMethod=options.varianceMethod==='bartlett'?'bartlett':'brown-forsythe';
    const distributionDiagnostic=options.distributionDiagnostic==='normal-vs-lognormal'?'normal-vs-lognormal':'normality-only';
    const diagnostics={normalityMethod:requestedNormality,varianceMethod,distributionDiagnostic,alpha,groups:[],warnings:[],distributionComparisons:[]};
    const qqSampleLimit=Number.isFinite(options.qqSampleLimit)?Math.max(25,Math.floor(options.qqSampleLimit)):ASSUMPTION_QQ_SAMPLE_LIMIT;
    const summaryList=Array.isArray(options.summaries)?options.summaries:null;
    let normalityFailures=0;
    const pairedContrasts=options.paired===true && groups.length>=2;
    const transformed=pairedContrasts || options.lognormal===true;
    const diagnosticGroups=pairedContrasts
      ? groups.slice(1).map(group=>computePairedSamples(group,groups[0]).map(pair=>options.ratio===true?Math.log(pair.a/pair.b):subtractRankObservation(pair.a,pair.b)))
      : options.lognormal===true?groups.map(group=>normalizeFiniteSample(group).map(value=>value>0?Math.log(value):NaN)):groups;
    diagnostics.normalityTarget=pairedContrasts?(options.ratio===true?'within-subject-log-ratios':'within-subject-contrasts'):options.lognormal===true?'log-observations':'group-observations';
    diagnosticGroups.forEach((group,index)=>{
      const label=pairedContrasts?`${labels[index+1] || `Group ${index+2}`} ${options.ratio===true?'/':'−'} ${labels[0] || 'Group 1'} (${options.ratio===true?'log ratios':'paired differences'})`:`${labels[index]||`Group ${index+1}`}${options.lognormal===true?' (log values)':''}`;
      const cleaned=normalizeFiniteSample(group);const unique=new Set(cleaned).size;
      let method=requestedNormality==='auto'?(cleaned.length<=5000&&unique===cleaned.length?'shapiro-wilk':'dagostino'):requestedNormality;
      let normality=method==='shapiro-wilk'?computeShapiroWilk(cleaned):computeDagostino(cleaned,transformed?null:summaryList?.[index]);
      if(method==='dagostino'&&(!Number.isFinite(normality?.pValue)||cleaned.length<8)&&cleaned.length<=5000){method='shapiro-wilk';normality=computeShapiroWilk(cleaned);}
      normality={...normality,method,alpha,passed:isValidProbability(normality?.pValue)?normality.pValue>=alpha:normality?.passed??null};
      diagnostics.groups.push({label,size:cleaned.length,normality,qqPoints:cleaned.length?computeQQPoints(cleaned,{maxSampleSize:qqSampleLimit}):[]});
      if(normality.passed===false){
        normalityFailures+=1;
        diagnostics.warnings.push(`${label}: ${method} normality diagnostic flagged a deviation (${formatPExpression(normality.pValue)}).`);
      }else if(normality.passed == null){
        diagnostics.warnings.push(`${label}: ${normality.reason || `${method} normality could not be assessed.`}`);
      }
      if(distributionDiagnostic==='normal-vs-lognormal'){const comparison=computeDistributionComparison(cleaned);if(comparison)diagnostics.distributionComparisons.push({label,...comparison});}
    });
    const variance=pairedContrasts
      ? {method:'not-applicable',passed:null,pValue:null,reason:'Between-group variance equality is not a paired-test assumption.'}
      : varianceMethod==='bartlett'?computeBartlettVarianceDiagnostics(diagnosticGroups,labels,{alpha}):computeVarianceDiagnostics(diagnosticGroups,labels,{alpha,summaries:transformed?null:summaryList});
    diagnostics.variance=variance;diagnostics.varianceConcern=variance?.passed===false;diagnostics.normalityFailures=normalityFailures;
    if(diagnostics.varianceConcern) diagnostics.warnings.push(`Variance diagnostic (${varianceMethod}) flagged heterogeneity (${formatPExpression(variance.pValue)}).`);
    diagnostics.recommendWelch=diagnostics.varianceConcern && options.paired!==true;
    diagnostics.recommendNonParametric=false;
    diagnostics.guidance=[
      'A nonsignificant normality test does not establish normality; inspect plots and the study context.',
      'Small samples have low diagnostic power; large samples detect minor departures. Balance, skew, influential values, and the target effect matter more than a normality-test cutoff.',
      options.family==='nonparametric'
        ? 'Rank tests do not need normal observations: signed-rank tests require symmetric differences, and distributional interpretations depend on the design and group shapes.'
        : options.paired===true
        ? 'For paired t-tests, assess within-subject differences; repeated-measures ANOVA also needs an appropriate covariance/sphericity model.'
        : 'For mean comparisons, unequal spreads or unequal sample sizes favor considering Welch; rank tests answer different distributional questions.',
      'Diagnostics do not select or change the analysis.'
    ];
    if(options.trendTest===true) diagnostics.trend=computeLinearTrendTest(groups,{alternative:options.alternative});
    return diagnostics;
  }
  function mean(arr){
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function createUnavailableStatResult(base, message){
    return { available: false, message, ...base };
  }

  function sanitizeOneSampleNullValue(value){
    const numeric = Number(value);
    if(Number.isFinite(numeric)){
      return numeric;
    }
    return 0;
  }

  function resolveTCritical(df, alpha){
    const jStatLib = global.jStat;
    const inv = jStatLib && jStatLib.studentt && typeof jStatLib.studentt.inv === 'function'
      ? jStatLib.studentt.inv
      : null;
    const level = Number.isFinite(alpha) ? alpha : 0.05;
    if(!inv || !Number.isFinite(df) || df <= 0){
      return NaN;
    }
    try{
      return inv(1 - (level / 2), df);
    }catch(err){
      logDebug('Debug: box worker resolveTCritical failed', { df, alpha: level, message: err?.message || String(err) });
      return NaN;
    }
  }

  function normalizeFiniteSample(values){
    return (Array.isArray(values) ? values : []).map(toFiniteObservation).filter(Number.isFinite);
  }

  function toFiniteObservation(value){
    return value==null || (typeof value==='string' && value.trim()==='') ? NaN : Number(value);
  }

  // Compact renderer samples carry source-row IDs; direct callers use array positions.
  // Intersect rows before any filtering or screening can shift subject identity.
  function alignCompleteRows(groups,rowIndicesByGroup=[]){
    const rowSets=new Set();
    const maps=(Array.isArray(groups)?groups:[]).map((group,groupIndex)=>{
      const map=new Map();
      (Array.isArray(group)?group:[]).forEach((value,index)=>{
        const row=rowIndicesByGroup?.[groupIndex]?.[index] ?? index;
        rowSets.add(row);
        const numeric=toFiniteObservation(value);
        if(Number.isFinite(numeric)) map.set(row,numeric);
      });
      return map;
    });
    const rows=[...rowSets].filter(row=>maps.every(map=>map.has(row))).sort((a,b)=>a-b);
    return {groups:maps.map(map=>rows.map(row=>map.get(row))),rows,excludedRows:rowSets.size-rows.length};
  }

  function resolveDegenerateTResult(diff,df,options={}){
    return createUnavailableStatResult({
      t:NaN,
      df,
      p:NaN,
      diff,
      ciLow:NaN,
      ciHigh:NaN,
      ciLevel:sanitizeStatsCiLevel(options.ciLevel),
      alternative:sanitizeStatsAlternative(options.alternative)
    },'Zero estimated variance does not provide a sampling-based t-test or confidence interval.');
  }

  function tTest(a, b, options={}){
    const sampleA=normalizeFiniteSample(a);
    const sampleB=normalizeFiniteSample(b);
    const na=sampleA.length;
    const nb=sampleB.length;
    if(na<2 || nb<2){
      return createUnavailableStatResult({ t:NaN,df:NaN,p:NaN,nA:na,nB:nb },'Welch t-test needs at least two values per group.');
    }
    const ma=mean(sampleA);
    const mb=mean(sampleB);
    const va=sampleA.reduce((sum,value)=>sum+Math.pow(value-ma,2),0)/(na-1);
    const vb=sampleB.reduce((sum,value)=>sum+Math.pow(value-mb,2),0)/(nb-1);
    const seSquared=(va/na)+(vb/nb);
    const se=Math.sqrt(Math.max(seSquared,0));
    const dfDenominator=(Math.pow(va/na,2)/(na-1))+(Math.pow(vb/nb,2)/(nb-1));
    const df=dfDenominator>0 ? Math.pow(seSquared,2)/dfDenominator : na+nb-2;
    const diff=ma-mb;
    if(se===0){
      return { ...resolveDegenerateTResult(diff,df,options),df,se,diff,meanA:ma,meanB:mb,nA:na,nB:nb,method:'welch-t' };
    }
    const t=diff/se;
    const p=resolveStudentTPValue(t,df,options.alternative);
    return { t,df,p,se,diff,meanA:ma,meanB:mb,nA:na,nB:nb,method:'welch-t',...createTInterval(diff,se,df,options) };
  }

  function tTestEqualVariance(a,b,options={}){
    const sampleA=normalizeFiniteSample(a);
    const sampleB=normalizeFiniteSample(b);
    const na=sampleA.length;
    const nb=sampleB.length;
    if(na<2 || nb<2){
      return createUnavailableStatResult({ t:NaN,df:NaN,p:NaN,nA:na,nB:nb },'Unpaired t-test needs at least two values per group.');
    }
    const ma=mean(sampleA);
    const mb=mean(sampleB);
    const va=sampleA.reduce((sum,value)=>sum+Math.pow(value-ma,2),0)/(na-1);
    const vb=sampleB.reduce((sum,value)=>sum+Math.pow(value-mb,2),0)/(nb-1);
    const df=na+nb-2;
    const pooledVariance=df>0 ? (((na-1)*va)+((nb-1)*vb))/df : NaN;
    const se=Math.sqrt(Math.max(0,pooledVariance*((1/na)+(1/nb))));
    const diff=ma-mb;
    if(se===0){
      return { ...resolveDegenerateTResult(diff,df,options),df,se,diff,meanA:ma,meanB:mb,nA:na,nB:nb,method:'student-t' };
    }
    const t=diff/se;
    const p=resolveStudentTPValue(t,df,options.alternative);
    return { t,df,p,se,diff,meanA:ma,meanB:mb,nA:na,nB:nb,method:'student-t',...createTInterval(diff,se,df,options) };
  }

  function tTestPaired(a, b, options={}){
    const pairs=computePairedSamples(a,b).map(pair=>pair.a-pair.b);
    const n=pairs.length;
    if(n<2){
      return createUnavailableStatResult({ t:NaN,df:NaN,p:NaN,n },'Paired t-test needs at least two complete pairs.');
    }
    const diff=mean(pairs);
    const variance=pairs.reduce((sum,value)=>sum+Math.pow(value-diff,2),0)/(n-1);
    const se=Math.sqrt(Math.max(variance,0))/Math.sqrt(n);
    const df=n-1;
    if(se===0){
      return { ...resolveDegenerateTResult(diff,df,options),df,se,diff,meanDiff:diff,n,method:'paired-t' };
    }
    const t=diff/se;
    const p=resolveStudentTPValue(t,df,options.alternative);
    return { t,df,p,se,diff,meanDiff:diff,n,method:'paired-t',...createTInterval(diff,se,df,options) };
  }

  function tTestOneSample(values, nullValue, options={}){
    const target=sanitizeOneSampleNullValue(nullValue);
    const cleaned=normalizeFiniteSample(values);
    const n=cleaned.length;
    if(n<2){
      return createUnavailableStatResult({ t:NaN,df:NaN,p:NaN,n,mean:NaN,sd:NaN },'One-sample t-test needs at least two values.');
    }
    const meanVal=mean(cleaned);
    const variance=cleaned.reduce((sum,value)=>sum+Math.pow(value-meanVal,2),0)/(n-1);
    const sd=Math.sqrt(Math.max(variance,0));
    const se=sd/Math.sqrt(n);
    const diff=meanVal-target;
    const df=n-1;
    if(se===0){
      return { ...resolveDegenerateTResult(diff,df,options),df,se,diff,n,mean:meanVal,sd,method:'one-sample-t' };
    }
    const t=diff/se;
    const p=resolveStudentTPValue(t,df,options.alternative);
    return { t,df,p,se,diff,n,mean:meanVal,sd,method:'one-sample-t',...createTInterval(diff,se,df,options) };
  }

  function requirePositiveSamples(a,b,label){
    const sampleA=normalizeFiniteSample(a);
    const sampleB=normalizeFiniteSample(b);
    if(sampleA.some(value=>value<=0) || sampleB.some(value=>value<=0)){
      return { ok:false, result:createUnavailableStatResult({ t:NaN,df:NaN,p:NaN },`${label} requires strictly positive values.`) };
    }
    return { ok:true, sampleA, sampleB };
  }

  function convertLogDifferenceToRatio(result,sampleA,sampleB,method){
    if(!result || result.available===false){
      return result;
    }
    const expBound=value=>value===Infinity ? Infinity : value===-Infinity ? 0 : (Number.isFinite(value) ? Math.exp(value) : NaN);
    const ratio=Number.isFinite(result.diff) ? Math.exp(result.diff) : NaN;
    return {
      ...result,
      method,
      logDiff:result.diff,
      ratio,
      diff:ratio,
      meanDiff:ratio,
      ciLow:expBound(result.ciLow),
      ciHigh:expBound(result.ciHigh),
      scale:'ratio',
      estimateLabel:'Geometric mean ratio (A/B)',
      geoMeanA:sampleA.length ? Math.exp(mean(sampleA.map(Math.log))) : NaN,
      geoMeanB:sampleB.length ? Math.exp(mean(sampleB.map(Math.log))) : NaN
    };
  }

  function lognormalWelchTTest(a,b,options={}){
    const checked=requirePositiveSamples(a,b,"Lognormal Welch's t-test");
    if(!checked.ok){
      return checked.result;
    }
    const result=tTest(checked.sampleA.map(Math.log),checked.sampleB.map(Math.log),options);
    return convertLogDifferenceToRatio(result,checked.sampleA,checked.sampleB,'lognormal-welch-t');
  }

  function lognormalTTestEqualVariance(a,b,options={}){
    const checked=requirePositiveSamples(a,b,'Lognormal t-test');
    if(!checked.ok){
      return checked.result;
    }
    const result=tTestEqualVariance(checked.sampleA.map(Math.log),checked.sampleB.map(Math.log),options);
    return convertLogDifferenceToRatio(result,checked.sampleA,checked.sampleB,'lognormal-student-t');
  }

  function ratioTTest(a,b,options={}){
    const [sampleA,sampleB]=alignCompleteRows([a,b]).groups;
    const checked=requirePositiveSamples(sampleA,sampleB,'Ratio t-test');
    if(!checked.ok){
      return checked.result;
    }
    const logRatios=checked.sampleA.map((value,index)=>Math.log(value/checked.sampleB[index]));
    const result=tTestOneSample(logRatios,0,options);
    return convertLogDifferenceToRatio({ ...result,diff:result.diff },checked.sampleA,checked.sampleB,'ratio-t');
  }

  function resolveNormalPValue(z, alternative){
    const safeAlternative=sanitizeStatsAlternative(alternative);
    if(!Number.isFinite(z)){
      return NaN;
    }
    let stats=null;
    try{
      stats=ensureStats();
    }catch(err){
      logDebug('Debug: box stats normal distribution unavailable',{ message:err?.message || String(err) });
    }
    if(safeAlternative==='greater' && typeof stats?.normalUpperTail==='function'){
      return resolvePValue(stats.normalUpperTail(z));
    }
    if(safeAlternative==='less' && typeof stats?.normalUpperTail==='function'){
      return resolvePValue(stats.normalUpperTail(-z));
    }
    return normalTwoSidedPValue(z);
  }

  function resolveRankResamplingMode(options, exactStateCount, autoMonteCarloEligible = false){
    const requested=sanitizeResamplingMode(options?.resamplingMode);
    if(requested==='exact'){
      return Number.isFinite(exactStateCount) && exactStateCount<=200000 ? 'exact' : 'monte-carlo';
    }
    if(requested==='monte-carlo' || requested==='asymptotic'){
      return requested;
    }
    if(Number.isFinite(exactStateCount) && exactStateCount<=200000){
      return 'exact';
    }
    return autoMonteCarloEligible ? 'monte-carlo' : 'asymptotic';
  }

  function empiricalRankPValue(observed, sampled, alternative, center){
    const safeAlternative=sanitizeStatsAlternative(alternative);
    const values=(Array.isArray(sampled)?sampled:[]).filter(Number.isFinite);
    if(!values.length || !Number.isFinite(observed)){
      return NaN;
    }
    let extreme=0;
    values.forEach(value=>{
      if(safeAlternative==='greater'){
        if(value>=observed-1e-12) extreme+=1;
      }else if(safeAlternative==='less'){
        if(value<=observed+1e-12) extreme+=1;
      }else if(Math.abs(value-center)>=Math.abs(observed-center)-1e-12){
        extreme+=1;
      }
    });
    return clamp(extreme/values.length,0,1);
  }

  function enumerateCombinationSums(values, choose, visitor){
    const source=Array.isArray(values)?values:[];
    const selected=[];
    function visit(start,remaining,sum){
      if(remaining===0){
        visitor(sum,selected);
        return;
      }
      for(let index=start;index<=source.length-remaining;index+=1){
        selected.push(index);
        visit(index+1,remaining-1,sum+source[index]);
        selected.pop();
      }
    }
    visit(0,choose,0);
  }

  function binomialStateCount(n,k){
    const safeN=Math.max(0,Math.floor(Number(n)||0));
    const safeK=Math.max(0,Math.min(safeN,Math.floor(Number(k)||0)));
    const m=Math.min(safeK,safeN-safeK);
    let value=1;
    for(let index=1;index<=m;index+=1){
      value=(value*(safeN-m+index))/index;
      if(value>200000){
        return value;
      }
    }
    return Math.round(value);
  }

  function kolmogorovSmirnovTwoSample(a,b,options={}){
    const sharedTest=Shared.stats?.kolmogorovSmirnovTwoSample;
    if(typeof sharedTest!=='function'){
      throw new Error('Shared two-sample Kolmogorov-Smirnov test is unavailable.');
    }
    return sharedTest(a,b,options);
  }

  function rankArray(arr){
    const sorted=(Array.isArray(arr)?arr:[]).map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value);
    const ranks=new Array(sorted.length);
    const tieCounts=[];
    let index=0;
    while(index<sorted.length){
      let end=index+1;
      while(end<sorted.length && sorted[end].value===sorted[index].value){
        end+=1;
      }
      const averageRank=((index+1)+end)/2;
      for(let cursor=index;cursor<end;cursor+=1){
        ranks[sorted[cursor].index]=averageRank;
      }
      if(end-index>1){
        tieCounts.push(end-index);
      }
      index=end;
    }
    return { ranks,tieCounts };
  }

  function computeMannWhitneyStatistic(sampleA,sampleB){
    const all=[
      ...sampleA.map(value=>({value,group:0})),
      ...sampleB.map(value=>({value,group:1}))
    ];
    const rankInfo=rankArray(all.map(item=>item.value));
    let rankSumA=0;
    all.forEach((item,index)=>{
      if(item.group===0){
        rankSumA+=rankInfo.ranks[index];
      }
    });
    const na=sampleA.length;
    const nb=sampleB.length;
    const uA=rankSumA-(na*(na+1)/2);
    const uB=(na*nb)-uA;
    return { uA,uB,rankSumA,tieCounts:rankInfo.tieCounts };
  }

  function mannWhitney(a,b,options={}){
    const sampleA=normalizeFiniteSample(a);
    const sampleB=normalizeFiniteSample(b);
    const na=sampleA.length;
    const nb=sampleB.length;
    if(!na || !nb){
      return createUnavailableStatResult({ U:NaN,U1:NaN,U2:NaN,z:NaN,p:NaN,nA:na,nB:nb },'Mann-Whitney test needs at least one value per group.');
    }
    const alternative=sanitizeStatsAlternative(options.alternative);
    const observed=computeMannWhitneyStatistic(sampleA,sampleB);
    const center=na*nb/2;
    const totalN=na+nb;
    const exactStates=observed.tieCounts.length ? Infinity : binomialStateCount(totalN,na);
    const resamplingMode=resolveRankResamplingMode(options,exactStates,(na+nb)<=40);
    let p=NaN;
    let method='asymptotic';
    if(resamplingMode==='exact'){
      const rankValues=Array.from({length:totalN},(_,index)=>index+1);
      const sampled=[];
      enumerateCombinationSums(rankValues,na,rankSum=>{
        sampled.push(rankSum-(na*(na+1)/2));
      });
      p=empiricalRankPValue(observed.uA,sampled,alternative,center);
      method='exact';
    }else if(resamplingMode==='monte-carlo'){
      const iterations=sanitizeMonteCarloIterations(options.iterations,10000);
      const nextRandom=createSeededRandom(sanitizeStatsSeed(options.seed,1337)+na*101+nb*211);
      const pooled=sampleA.concat(sampleB);
      const sampled=[];
      for(let iteration=0;iteration<iterations;iteration+=1){
        const shuffled=shuffleInPlace(pooled.slice(),nextRandom);
        sampled.push(computeMannWhitneyStatistic(shuffled.slice(0,na),shuffled.slice(na)).uA);
      }
      p=computeEmpiricalPValue(observed.uA,sampled,alternative,{ mode:'signed',center });
      method='monte-carlo';
    }
    const tieTerm=observed.tieCounts.reduce((sum,count)=>sum+(count*count*count-count),0);
    const variance=(na*nb/12)*((totalN+1)-(totalN>1?tieTerm/(totalN*(totalN-1)):0));
    const sigma=Math.sqrt(Math.max(variance,0));
    const delta=observed.uA-center;
    const continuity=delta===0 ? 0 : 0.5*Math.sign(delta);
    const z=sigma>0 ? (delta-continuity)/sigma : 0;
    if(!Number.isFinite(p)){
      p=resolveNormalPValue(z,alternative);
    }
    return {
      U:alternative==='two-sided'?Math.min(observed.uA,observed.uB):observed.uA,
      U1:observed.uA,
      U2:observed.uB,
      z,
      p:resolvePValue(p),
      nA:na,
      nB:nb,
      method,
      alternative
    };
  }

  // Subtract the shortest round-trip decimal representations exactly. This
  // repairs arithmetic-created ties without applying a tolerance to observations.
  function subtractRankObservation(a,b){
    if(Number.isSafeInteger(a) && Number.isSafeInteger(b) && Number.isSafeInteger(a-b)) return a-b;
    const decimal=value=>{
      const [mantissa,power='0']=String(value).toLowerCase().split('e');
      const [integer,fraction='']=mantissa.split('.');
      return {coefficient:BigInt(integer+fraction),exponent:Number(power)-fraction.length};
    };
    const left=decimal(a),right=decimal(b);
    const exponent=Math.min(left.exponent,right.exponent);
    const difference=left.coefficient*10n**BigInt(left.exponent-exponent)-right.coefficient*10n**BigInt(right.exponent-exponent);
    return Number(`${difference}e${exponent}`);
  }

  function computeSignedRankSums(differences){
    const nonZero=differences.filter(value=>value!==0);
    const rankInfo=rankArray(nonZero.map(Math.abs));
    let wPositive=0;
    let wNegative=0;
    rankInfo.ranks.forEach((rank,index)=>{
      if(nonZero[index]>0){
        wPositive+=rank;
      }else{
        wNegative+=rank;
      }
    });
    return {nonZero,rankInfo,wPositive,wNegative};
  }

  function computeSignedRankFromDifferences(differences,options={}){
    const cleaned=(Array.isArray(differences)?differences:[]).map(Number).filter(Number.isFinite);
    const {nonZero,rankInfo,wPositive,wNegative}=computeSignedRankSums(cleaned);
    const n=cleaned.length;
    const effectiveN=nonZero.length;
    const median=quantileFromUnsorted(cleaned,0.5);
    if(!effectiveN){
      return { W:0,WPositive:0,WNegative:0,z:0,p:1,n,effectiveN,median,method:'degenerate',alternative:sanitizeStatsAlternative(options.alternative) };
    }
    const alternative=sanitizeStatsAlternative(options.alternative);
    const totalRank=wPositive+wNegative;
    const center=totalRank/2;
    const exactStates=rankInfo.tieCounts.length ? Infinity : Math.pow(2,effectiveN);
    const resamplingMode=resolveRankResamplingMode(options,exactStates,effectiveN<=40);
    let p=NaN;
    let method='asymptotic';
    if(resamplingMode==='exact'){
      const sampled=[];
      const stateCount=Math.pow(2,effectiveN);
      for(let mask=0;mask<stateCount;mask+=1){
        let sum=0;
        for(let index=0;index<effectiveN;index+=1){
          if((mask&(1<<index))!==0){
            sum+=rankInfo.ranks[index];
          }
        }
        sampled.push(sum);
      }
      p=empiricalRankPValue(wPositive,sampled,alternative,center);
      method='exact';
    }else if(resamplingMode==='monte-carlo'){
      const iterations=sanitizeMonteCarloIterations(options.iterations,10000);
      const nextRandom=createSeededRandom(sanitizeStatsSeed(options.seed,1337)+effectiveN*307);
      const sampled=[];
      for(let iteration=0;iteration<iterations;iteration+=1){
        let sum=0;
        rankInfo.ranks.forEach(rank=>{
          if(nextRandom()>=0.5){
            sum+=rank;
          }
        });
        sampled.push(sum);
      }
      p=computeEmpiricalPValue(wPositive,sampled,alternative,{ mode:'signed',center });
      method='monte-carlo';
    }
    const variance=rankInfo.ranks.reduce((sum,rank)=>sum+(rank*rank),0)/4;
    const sigma=Math.sqrt(Math.max(variance,0));
    const delta=wPositive-center;
    const continuity=delta===0 ? 0 : 0.5*Math.sign(delta);
    const z=sigma>0 ? (delta-continuity)/sigma : 0;
    if(!Number.isFinite(p)){
      p=resolveNormalPValue(z,alternative);
    }
    return {
      W:alternative==='two-sided'?Math.min(wPositive,wNegative):wPositive,
      WPositive:wPositive,
      WNegative:wNegative,
      z,
      p:resolvePValue(p),
      n,
      effectiveN,
      median,
      method,
      alternative
    };
  }

  function wilcoxonOneSample(values,nullValue,options={}){
    const target=sanitizeOneSampleNullValue(nullValue);
    const cleaned=normalizeFiniteSample(values);
    if(!cleaned.length){
      return createUnavailableStatResult({ W:NaN,z:NaN,p:NaN,n:0,effectiveN:0,median:NaN },'One-sample Wilcoxon test needs at least one value.');
    }
    return computeSignedRankFromDifferences(cleaned.map(value=>subtractRankObservation(value,target)),options);
  }

  function wilcoxonSignedRank(a,b,options={}){
    const differences=computePairedSamples(a,b).map(pair=>subtractRankObservation(pair.a,pair.b));
    if(!differences.length){
      return createUnavailableStatResult({ W:NaN,z:NaN,p:NaN,n:0,effectiveN:0,median:NaN },'Wilcoxon signed-rank test needs at least one complete numeric pair.');
    }
    return computeSignedRankFromDifferences(differences,options);
  }


  function anova(groups){
    const k=groups.length;
    const n=groups.reduce((s,g)=>s+g.length,0);
    const counts=groups.map(group=>group.length);
    const means=groups.map(group=>mean(group));
    const grand=groups.reduce((s,g)=>s+mean(g)*g.length,0)/n;
    let ssBetween=0;
    let ssWithin=0;
    groups.forEach((g,index)=>{
      const m=means[index];
      ssBetween+=g.length*Math.pow(m-grand,2);
      ssWithin+=g.reduce((s,v)=>s+Math.pow(v-m,2),0);
    });
    const dfBetween=k-1;
    const dfWithin=n-k;
    const msBetween=ssBetween/dfBetween;
    const msWithin=ssWithin/dfWithin;
    const F=msBetween/msWithin;
    const p=fUpperTailPValue(F, dfBetween, dfWithin);
    return {F,p,dfBetween,dfWithin,ssBetween,ssWithin,ssTotal:ssBetween+ssWithin,msWithin,means,counts,totalN:n};
  }

  function kruskalWallis(groups){
    const n=groups.reduce((s,g)=>s+g.length,0);
    const all=groups.flat();
    const rankInfo=rankValuesWithTieInfo(all);
    const ranks=rankInfo.ranks;
    let idx=0;
    const R=groups.map(g=>{
      const r=ranks.slice(idx, idx+g.length).reduce((a,b)=>a+b,0);
      idx+=g.length;
      return r;
    });
    const rawH=(12/(n*(n+1)))*R.reduce((sum,ri,i)=>sum+Math.pow(ri,2)/groups[i].length,0)-3*(n+1);
    const tieDenom=Math.pow(n,3)-n;
    const tieCorrection=tieDenom>0 ? (1-(rankInfo.tieTerm/tieDenom)) : 1;
    const H=tieCorrection>0 ? (rawH/tieCorrection) : rawH;
    const df=groups.length-1;
    const p=chiSquareUpperTailPValue(H, df);
    return {
      H,p,n,k:groups.length,
      epsilonSquared:computeKruskalEpsilonSquared(H,groups.length,n),
      tieCorrected:tieCorrection!==1,
      tieCorrection
    };
  }

  function rankValuesWithTieInfo(values){
    const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(values.length);
    let tieTerm = 0;
    let start = 0;
    while(start < sorted.length){
      let end = start + 1;
      while(end < sorted.length && sorted[end].v === sorted[start].v){
        end++;
      }
      const tieCount = end - start;
      const avg = (start + 1 + end) / 2;
      for(let idx = start; idx < end; idx++){
        ranks[sorted[idx].i] = avg;
      }
      if(tieCount > 1){
        tieTerm += Math.pow(tieCount, 3) - tieCount;
      }
      start = end;
    }
    return { ranks, tieTerm };
  }

  function unavailableSphericity(reason){
    return {
      ggAvailable:false,
      hfAvailable:false,
      ggReason:reason,
      hfReason:reason,
      ggEpsilon:NaN,
      hfEpsilon:NaN
    };
  }

  function buildOrthonormalHelmert(levelCount){
    const dimensions=levelCount-1;
    const basis=Array.from({ length:levelCount },()=>new Array(dimensions).fill(0));
    for(let contrast=0;contrast<dimensions;contrast++){
      const count=contrast+1;
      const denominator=Math.sqrt(count*(count+1));
      for(let level=0;level<=contrast;level++) basis[level][contrast]=1/denominator;
      basis[count][contrast]=-count/denominator;
    }
    return basis;
  }

  function computeContrastSpaceSphericity(contrastRows){
    const rows=Array.isArray(contrastRows)?contrastRows:[];
    const subjectCount=rows.length;
    const dimension=Array.isArray(rows[0])?rows[0].length:0;
    if(subjectCount<2 || dimension<1 || rows.some(row=>
      !Array.isArray(row) || row.length!==dimension || row.some(value=>!Number.isFinite(value)))){
      return unavailableSphericity('invalid-contrast-scores');
    }
    const covarianceCells=dimension*dimension;
    if(!Number.isSafeInteger(covarianceCells) || covarianceCells>BOX_SPHERICITY_MAX_COVARIANCE_CELLS){
      return unavailableSphericity('sphericity-covariance-resource-limit');
    }

    const means=new Array(dimension).fill(0);
    for(let column=0;column<dimension;column++){
      const mean=stableFiniteMean(rows.map(row=>row[column]));
      if(mean===null) return unavailableSphericity('non-finite-contrast-mean');
      means[column]=mean;
    }

    let deviationScale=0;
    for(let subject=0;subject<subjectCount;subject++){
      for(let column=0;column<dimension;column++){
        const deviation=rows[subject][column]-means[column];
        if(!Number.isFinite(deviation)) return unavailableSphericity('non-finite-contrast-deviation');
        deviationScale=Math.max(deviationScale,Math.abs(deviation));
      }
    }
    if(deviationScale===0) return unavailableSphericity('zero-within-subject-contrast-variance');

    const covariance=new Float64Array(covarianceCells);
    const divisor=subjectCount-1;
    for(let row=0;row<dimension;row++){
      for(let column=row;column<dimension;column++){
        let crossProduct=0;
        let compensation=0;
        for(let subject=0;subject<subjectCount;subject++){
          const left=(rows[subject][row]-means[row])/deviationScale;
          const right=(rows[subject][column]-means[column])/deviationScale;
          const adjusted=left*right-compensation;
          const next=crossProduct+adjusted;
          compensation=(next-crossProduct)-adjusted;
          crossProduct=next;
        }
        const value=crossProduct/divisor;
        if(!Number.isFinite(value)) return unavailableSphericity('non-finite-contrast-covariance');
        covariance[row*dimension+column]=value;
        covariance[column*dimension+row]=value;
      }
    }
    let trace=0;
    let traceCompensation=0;
    let traceSquare=0;
    let traceSquareCompensation=0;
    for(let row=0;row<dimension;row++){
      const traceAdjusted=covariance[row*dimension+row]-traceCompensation;
      const nextTrace=trace+traceAdjusted;
      traceCompensation=(nextTrace-trace)-traceAdjusted;
      trace=nextTrace;
      for(let column=0;column<dimension;column++){
        const value=covariance[row*dimension+column];
        const squareAdjusted=value*value-traceSquareCompensation;
        const nextTraceSquare=traceSquare+squareAdjusted;
        traceSquareCompensation=(nextTraceSquare-traceSquare)-squareAdjusted;
        traceSquare=nextTraceSquare;
      }
    }
    if(!(trace>0) || !(traceSquare>0) || !Number.isFinite(trace) || !Number.isFinite(traceSquare)){
      return unavailableSphericity('zero-or-non-finite-contrast-covariance');
    }
    let ggEpsilon=(trace*trace)/(dimension*traceSquare);
    const lowerBound=1/dimension;
    const ggTolerance=64*Number.EPSILON*Math.max(1,Math.abs(ggEpsilon));
    if(!Number.isFinite(ggEpsilon) || ggEpsilon<lowerBound-ggTolerance || ggEpsilon>1+ggTolerance){
      return unavailableSphericity('greenhouse-geisser-epsilon-out-of-range');
    }
    ggEpsilon=Math.min(1,Math.max(lowerBound,ggEpsilon));
    if(dimension===1){
      return { ggAvailable:true,hfAvailable:true,ggReason:null,hfReason:null,ggEpsilon:1,hfEpsilon:1 };
    }

    const hfNumerator=subjectCount*dimension*ggEpsilon-2;
    const hfResidualDf=subjectCount-1-dimension*ggEpsilon;
    const hfDenominator=dimension*hfResidualDf;
    const hfDenominatorTolerance=64*Number.EPSILON*Math.max(1,subjectCount-1,dimension*ggEpsilon);
    if(!(hfResidualDf>hfDenominatorTolerance) || !Number.isFinite(hfNumerator) || !Number.isFinite(hfDenominator)){
      return {
        ggAvailable:true,hfAvailable:false,ggReason:null,hfReason:'huynh-feldt-denominator-not-positive',
        ggEpsilon,hfEpsilon:NaN
      };
    }
    const hfRaw=hfNumerator/hfDenominator;
    const hfTolerance=64*Number.EPSILON*Math.max(1,Math.abs(hfRaw),Math.abs(ggEpsilon));
    if(!Number.isFinite(hfRaw) || hfRaw<lowerBound-hfTolerance || hfRaw<ggEpsilon-hfTolerance){
      return {
        ggAvailable:true,hfAvailable:false,ggReason:null,hfReason:'huynh-feldt-epsilon-out-of-range',
        ggEpsilon,hfEpsilon:NaN
      };
    }
    const hfEpsilon=Math.min(1,Math.max(ggEpsilon,lowerBound,hfRaw));
    return { ggAvailable:true,hfAvailable:true,ggReason:null,hfReason:null,ggEpsilon,hfEpsilon };
  }

  function computeRepeatedMeasuresSphericity(conditionRows){
    const rows=Array.isArray(conditionRows)?conditionRows:[];
    const levels=rows.length;
    const subjectCount=Array.isArray(rows[0])?rows[0].length:0;
    if(levels<2 || subjectCount<2 || rows.some(row=>
      !Array.isArray(row) || row.length!==subjectCount || row.some(value=>!Number.isFinite(value)))){
      return unavailableSphericity('invalid-repeated-measures-data');
    }
    const basis=buildOrthonormalHelmert(levels);
    const scores=Array.from({ length:subjectCount },()=>new Array(levels-1).fill(0));
    for(let subject=0;subject<subjectCount;subject++){
      const subjectValues=rows.map(row=>row[subject]);
      const subjectMean=stableFiniteMean(subjectValues);
      if(subjectMean===null) return unavailableSphericity('non-finite-repeated-measures-mean');
      let centeredScale=0;
      for(let level=0;level<levels;level++){
        const centered=rows[level][subject]-subjectMean;
        if(!Number.isFinite(centered)) return unavailableSphericity('non-finite-repeated-measures-contrast');
        centeredScale=Math.max(centeredScale,Math.abs(centered));
      }
      for(let contrast=0;contrast<levels-1;contrast++){
        let scaledScore=0;
        let compensation=0;
        for(let level=0;level<levels;level++){
          const centered=rows[level][subject]-subjectMean;
          const normalized=centeredScale>0?centered/centeredScale:0;
          const term=normalized*basis[level][contrast];
          const adjusted=term-compensation;
          const next=scaledScore+adjusted;
          compensation=(next-scaledScore)-adjusted;
          scaledScore=next;
        }
        scores[subject][contrast]=centeredScale*scaledScore;
        if(!Number.isFinite(scores[subject][contrast])) return unavailableSphericity('non-finite-repeated-measures-contrast');
      }
    }
    return computeContrastSpaceSphericity(scores);
  }

  function computeRepeatedMeasuresAnova(groups){
    const cleaned=alignCompleteRows(groups).groups;
    const k=cleaned.length;
    if(k<3){
      return { ok:false, message:'Repeated-measures ANOVA requires at least three groups.' };
    }
    const n=cleaned[0]?.length || 0;
    if(n<2){
      return { ok:false, message:'Repeated-measures ANOVA needs at least two paired rows.' };
    }
    const grandN=n*k;
    const origin=cleaned[0][0];
    let normalizationScale=0;
    let finiteDifferences=true;
    for(let j=0; j<k; j++){
      for(let i=0; i<n; i++){
        const difference=cleaned[j][i]-origin;
        if(!Number.isFinite(difference)){
          finiteDifferences=false;
          break;
        }
        normalizationScale=Math.max(normalizationScale,Math.abs(difference));
      }
      if(!finiteDifferences) break;
    }
    if(!finiteDifferences){
      normalizationScale=0;
      for(let j=0; j<k; j++){
        for(let i=0; i<n; i++) normalizationScale=Math.max(normalizationScale,Math.abs(cleaned[j][i]));
      }
    }
    const normalizedGroups=cleaned.map(group=>group.map(value=>{
      if(normalizationScale===0) return 0;
      return finiteDifferences
        ? (value-origin)/normalizationScale
        : value/normalizationScale-origin/normalizationScale;
    }));
    const flatValues=normalizedGroups.flat();
    const grandMean=stableFiniteMean(flatValues);
    const conditionMeans=normalizedGroups.map(group=>stableFiniteMean(group));
    const subjectMeans=Array.from({length:n},(_,subject)=>stableFiniteMean(normalizedGroups.map(group=>group[subject])));
    if(grandMean===null || conditionMeans.some(mean=>mean===null) || subjectMeans.some(mean=>mean===null)){
      return {ok:false,message:'Repeated-measures means could not be evaluated safely.'};
    }
    let ssConditionScaled=0;
    let conditionCompensation=0;
    for(let j=0; j<k; j++){
      const effect=conditionMeans[j]-grandMean;
      const term=n*effect*effect;
      const adjusted=term-conditionCompensation;
      const next=ssConditionScaled+adjusted;
      conditionCompensation=(next-ssConditionScaled)-adjusted;
      ssConditionScaled=next;
    }
    let ssErrorScaled=0;
    let errorCompensation=0;
    for(let j=0; j<k; j++){
      for(let i=0; i<n; i++){
        const residual=normalizedGroups[j][i]-subjectMeans[i]-conditionMeans[j]+grandMean;
        const term=residual*residual;
        const adjusted=term-errorCompensation;
        const next=ssErrorScaled+adjusted;
        errorCompensation=(next-ssErrorScaled)-adjusted;
        ssErrorScaled=next;
      }
    }
    const zeroErrorTolerance=4096*Number.EPSILON*Number.EPSILON*grandN;
    if(ssErrorScaled<=zeroErrorTolerance){
      ssErrorScaled=0;
    }
    const restoreSumOfSquares=scaledValue=>{
      if(normalizationScale===0 || scaledValue===0) return 0;
      const restored=(scaledValue*normalizationScale)*normalizationScale;
      return Number.isFinite(restored) && restored>0?restored:null;
    };
    const ssCondition=restoreSumOfSquares(ssConditionScaled);
    const ssError=restoreSumOfSquares(ssErrorScaled);
    const df1=k-1;
    const df2=(k-1)*(n-1);
    if(df1<=0 || df2<=0){
      return { ok:false, message:'Repeated-measures ANOVA degrees of freedom are invalid.' };
    }
    const msConditionScaled=ssConditionScaled/df1;
    const msErrorScaled=ssErrorScaled/df2;
    if(msErrorScaled===0){
      const message='Repeated-measures inference is unavailable because within-subject error variance is zero.';
      return {
        ok:true,
        available:false,
        message,
        F:null,
        p:null,
        df1,
        df2,
        ggEpsilon:null,
        hfEpsilon:null,
        ggP:null,
        hfP:null,
        ssCondition,
        ssError,
        partialEtaSquared:computePartialEtaSquared(ssConditionScaled,ssErrorScaled),
        footnote:[message]
      };
    }
    const F=msConditionScaled/msErrorScaled;
    const p=fUpperTailPValue(F, df1, df2);
    const { ggEpsilon, hfEpsilon } = computeRepeatedMeasuresSphericity(cleaned);
    const ggP=Number.isFinite(ggEpsilon) && ggEpsilon>0
      ? fUpperTailPValue(F,ggEpsilon*df1,ggEpsilon*df2)
      : NaN;
    const hfP=Number.isFinite(hfEpsilon) && hfEpsilon>0
      ? fUpperTailPValue(F,hfEpsilon*df1,hfEpsilon*df2)
      : NaN;
    const correctionFootnoteParts=['Repeated-measures ANOVA assumes sphericity.'];
    if(Number.isFinite(ggEpsilon)){
      correctionFootnoteParts.push(` Greenhouse–Geisser ε = ${ggEpsilon.toFixed(3)}`);
      if(Number.isFinite(ggP)){
        correctionFootnoteParts.push(', p(GG) = ', { type:'pValue', value:ggP, fallback:String(formatP(ggP)) });
      }
      correctionFootnoteParts.push('.');
    }
    if(Number.isFinite(hfEpsilon)){
      correctionFootnoteParts.push(` Huynh–Feldt ε = ${hfEpsilon.toFixed(3)}`);
      if(Number.isFinite(hfP)){
        correctionFootnoteParts.push(', p(HF) = ', { type:'pValue', value:hfP, fallback:String(formatP(hfP)) });
      }
      correctionFootnoteParts.push('.');
    }
    return {
      ok:true,
      F,
      p,
      df1,
      df2,
      ggEpsilon,
      hfEpsilon,
      ggP,
      hfP,
      ssCondition,
      ssError,
      partialEtaSquared:computePartialEtaSquared(ssConditionScaled,ssErrorScaled),
      footnote:correctionFootnoteParts
    };
  }

  function computeFriedmanTest(groups,options={}){
    const cleaned=alignCompleteRows(groups).groups;
    const k=cleaned.length;
    if(k<3){
      return { ok:false, message:'Friedman test requires at least three groups.' };
    }
    const n=cleaned[0]?.length || 0;
    if(n<2){
      return { ok:false, message:'Friedman test needs at least two paired rows.' };
    }
    const rowRanks=[];
    const rankSums=new Array(k).fill(0);
    let tieTermSum=0;
    for(let row=0; row<n; row++){
      const rowValues=cleaned.map(group=>group[row]);
      const rankInfo=rankValuesWithTieInfo(rowValues);
      rowRanks.push(rankInfo.ranks.slice());
      tieTermSum+=rankInfo.tieTerm;
      for(let col=0; col<k; col++){
        rankSums[col]+=rankInfo.ranks[col];
      }
    }
    let Q=(12/(n*k*(k+1)))*rankSums.reduce((sum,val)=>sum+val*val,0)-3*n*(k+1);
    let tieCorrection=1;
    if(tieTermSum>0){
      const denom=n*k*(k*k-1);
      if(denom>0){
        tieCorrection=1-(tieTermSum/denom);
      }
      if(tieCorrection>0){
        Q/=tieCorrection;
      }
    }
    const df=k-1;
    const requestedResamplingMode=resolveStatsResamplingMode(options);
    const resamplingMode=resolveRankResamplingMode(options,Math.pow(factorialInt(k),n),n<=12);
    const iterations=resolveStatsMonteCarloIterations(options);
    const seed=resolveStatsSeed(options);
    if(resamplingMode==='exact'){
      const perms=generatePermutations(Array.from({ length:k },(_,idx)=>idx));
      let total=0;
      let hits=0;
      function visit(rowIndex,currentSums){
        if(rowIndex>=n){
          const simQ=((12/(n*k*(k+1)))*currentSums.reduce((sum,val)=>sum+val*val,0)-3*n*(k+1))/(tieCorrection>0?tieCorrection:1);
          total+=1;
          if(simQ>=Q-1e-12){
            hits+=1;
          }
          return;
        }
        perms.forEach(perm=>{
          for(let col=0; col<k; col++){
            currentSums[col]+=rowRanks[rowIndex][perm[col]];
          }
          visit(rowIndex+1,currentSums);
          for(let col=0; col<k; col++){
            currentSums[col]-=rowRanks[rowIndex][perm[col]];
          }
        });
      }
      visit(0,new Array(k).fill(0));
      const p=hits/Math.max(total,1);
      return {
        ok:true,
        Q,
        p,
        df,
        tieCorrection,
        n,
        k,
        kendallsW:computeKendallsW(Q,n,k),
        calibrationMethod:'exact',
        footnote:'Friedman exact permutation distribution over observed within-row rank assignments (ties retained).'
      };
    }
    if(resamplingMode==='monte-carlo'){
      const nextRand=createSeededRandom(seed + n*211 + k*19);
      const simulations=[];
      for(let iter=0; iter<iterations; iter++){
        const simSums=new Array(k).fill(0);
        for(let row=0; row<n; row++){
          const perm=shuffleInPlace(rowRanks[row].slice(),nextRand);
          for(let col=0; col<k; col++){
            simSums[col]+=perm[col];
          }
        }
        const simQ=((12/(n*k*(k+1)))*simSums.reduce((sum,val)=>sum+val*val,0)-3*n*(k+1))/(tieCorrection>0?tieCorrection:1);
        simulations.push(simQ);
      }
      const p=computeEmpiricalPValue(Q,simulations,'greater',{ mode:'signed' });
      return {
        ok:true,
        Q,
        p,
        df,
        tieCorrection,
        n,
        k,
        kendallsW:computeKendallsW(Q,n,k),
        iterations,
        seed,
        calibrationMethod:'monte-carlo',
        footnote:(requestedResamplingMode==='exact'?'Requested exact calibration exceeded the 200,000-state limit; Monte Carlo was used. ':'')+(tieTermSum>0
          ? `Friedman Monte Carlo calibration (${iterations} iterations; ties retained by rank permutation).`
          : `Friedman Monte Carlo calibration (${iterations} iterations).`)
      };
    }
    const p=chiSquareUpperTailPValue(Q, df);
    return {
      ok:true,
      Q,
      p,
      df,
      tieCorrection,
      n,
      k,
      kendallsW:computeKendallsW(Q,n,k),
      calibrationMethod:'asymptotic',
      footnote:tieTermSum>0
        ? `Friedman tie correction applied (factor ${tieCorrection.toFixed(4)}).`
        : 'Friedman test on paired ranks.'
    };
  }

    function computeWelchAnova(groups){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>group.filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    const k=cleaned.length;
    if(k<2){
      return { ok:false, message:'Welch ANOVA requires at least two groups.' };
    }
    if(counts.some(n=>n<2)){
      return { ok:false, message:'Welch ANOVA needs at least two observations per group.' };
    }
    const means=cleaned.map(group=>group.reduce((sum,val)=>sum+val,0)/group.length);
    const variances=cleaned.map((group,idx)=>{
      const m=means[idx];
      const sumSq=group.reduce((sum,val)=>sum+Math.pow(val-m,2),0);
      const denom=Math.max(group.length-1,1);
      return sumSq/denom;
    });
    const weights=variances.map((variance,idx)=>counts[idx]/variance);
    const weightSum=weights.reduce((sum,val)=>sum+val,0);
    if(!Number.isFinite(weightSum) || weightSum<=0){
      return { ok:false, message:'Unable to normalize Welch weights (degenerate variances).' };
    }
    const meanWeighted=weights.reduce((sum,val,idx)=>sum+val*means[idx],0)/weightSum;
    let between=0;
    let sumTerm=0;
    for(let idx=0;idx<k;idx++){
      const meanDiff=means[idx]-meanWeighted;
      between+=weights[idx]*meanDiff*meanDiff;
      const weightFrac=weights[idx]/weightSum;
      sumTerm+=Math.pow(1-weightFrac,2)/Math.max(counts[idx]-1,1);
    }
    const df1=k-1;
    const numerator=between/Math.max(df1,1);
    const correctionDenom=Math.pow(k,2)-1;
    const correction=correctionDenom!==0?1+(2*(k-2)/correctionDenom)*sumTerm:1;
    const F=correction>0?numerator/correction:NaN;
    const df2Den=3*sumTerm;
    const df2=df2Den>0?(Math.pow(k,2)-1)/df2Den:Number.POSITIVE_INFINITY;
    const p=Number.isFinite(F)?fUpperTailPValue(F, df1, df2):1;
    logDebug('Debug: box welchAnova',{ k, df1, df2, F, p, weightSum, sumTerm });
    const totalN=counts.reduce((sum,val)=>sum+val,0);
    const grandMean=means.reduce((sum,val,idx)=>sum+(val*counts[idx]),0)/Math.max(totalN,1);
    let ssBetween=0;
    let ssWithin=0;
    cleaned.forEach((group,idx)=>{
      ssBetween+=counts[idx]*Math.pow(means[idx]-grandMean,2);
      group.forEach(value=>{ ssWithin+=Math.pow(value-means[idx],2); });
    });
    const ssTotal=ssBetween+ssWithin;
    const msWithin=(totalN-k)>0 ? ssWithin/(totalN-k) : NaN;
    return {
      ok:Number.isFinite(F) && Number.isFinite(df2) && df2>0 && isValidProbability(p),
      F,
      p,
      df1,
      df2,
      means,
      counts,
      variances,
      ssBetween,
      ssWithin,
      ssTotal,
      etaSquared:computeEtaSquared(ssBetween,ssTotal),
      omegaSquared:computeOmegaSquared(ssBetween,df1,msWithin,ssTotal),
      footnote:`Welch ANOVA (df₁ = ${df1}, df₂ ≈ ${Number.isFinite(df2)?df2.toFixed(2):'∞'})`
    };
  }

  // The distribution is evaluated from its normal-range/chi-square mixture,
  // as documented by SciPy and Algorithm AS 190. The survival integral below
  // is derived from the conditional minimum density; it does not copy either
  // implementation. SciPy is BSD-licensed; R's ptukey implementation is GPL.
  // Neither source implementation is copied or used as a runtime dependency.
  function createGaussLegendreRule(order){
    const nodes=new Array(order);
    const weights=new Array(order);
    const halfCount=Math.ceil(order/2);
    for(let index=0;index<halfCount;index+=1){
      let root=Math.cos(Math.PI*(index+0.75)/(order+0.5));
      let derivative=0;
      for(let iteration=0;iteration<20;iteration+=1){
        let previous=1;
        let current=root;
        for(let degree=2;degree<=order;degree+=1){
          const next=((2*degree-1)*root*current-(degree-1)*previous)/degree;
          previous=current;
          current=next;
        }
        derivative=order*(root*current-previous)/(root*root-1);
        const delta=current/derivative;
        root-=delta;
        if(Math.abs(delta)<1e-15) break;
      }
      let previous=1;
      let current=root;
      for(let degree=2;degree<=order;degree+=1){
        const next=((2*degree-1)*root*current-(degree-1)*previous)/degree;
        previous=current;
        current=next;
      }
      derivative=order*(root*current-previous)/(root*root-1);
      const weight=2/((1-root*root)*derivative*derivative);
      nodes[index]=-root;
      nodes[order-1-index]=root;
      weights[index]=weight;
      weights[order-1-index]=weight;
    }
    return { nodes, weights };
  }

  const STUDENTIZED_RANGE_OUTER_RULE=createGaussLegendreRule(12);
  const STUDENTIZED_RANGE_NORMAL_RULE=createGaussLegendreRule(44);
  const STUDENTIZED_RANGE_HIGH_GROUP_NORMAL_RULE=createGaussLegendreRule(56);
  const STUDENTIZED_RANGE_TAIL_LOG_BOUND=760;
  const STUDENTIZED_RANGE_LOW_H_BOUND=1e-12;
  const STUDENTIZED_RANGE_HIGH_H=64;
  const STUDENTIZED_RANGE_MAX_LOG=Math.log(Number.MAX_VALUE);

  function normalSurvival(value,normalCdf=global.jStat?.normal?.cdf){
    const x=Number(value);
    if(Number.isNaN(x)) return NaN;
    if(x===Number.POSITIVE_INFINITY) return 0;
    if(x===Number.NEGATIVE_INFINITY) return 1;
    if(x<0) return 1-normalSurvival(-x,normalCdf);
    if(x<3){
      return typeof normalCdf==='function' ? normalCdf(-x,0,1) : NaN;
    }
    // Laplace's continued fraction for the Mills ratio avoids cancellation in
    // 1 - Phi(x) while retaining a fixed, small operation count.
    let fraction=0;
    for(let numerator=12;numerator>=1;numerator-=1){
      fraction=numerator/(x+fraction);
    }
    return (Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI))/(x+fraction);
  }

  function normalIntervalProbability(lower,upper,lowerTail,upperTail){
    if(!(upper>lower)) return 0;
    let probability;
    if(lower>=0){
      probability=lowerTail-upperTail;
    }else if(upper<=0){
      probability=lowerTail-upperTail;
      if(probability<1e-8){
        probability=normalSurvival(-upper)-normalSurvival(-lower);
      }
    }else{
      probability=lowerTail-upperTail;
      if(probability<1e-8){
        probability=1-normalSurvival(-lower)-upperTail;
      }
    }
    return Number.isFinite(probability) ? Math.max(0,Math.min(1,probability)) : NaN;
  }

  function normalRangeProbability(q,groups,survival,withDensity=false){
    if(q<=0){
      return withDensity ? { probability:survival?1:0,density:0 } : (survival ? 1 : 0);
    }
    if(q===Number.POSITIVE_INFINITY){
      return withDensity ? { probability:survival?0:1,density:0 } : (survival ? 0 : 1);
    }
    const midpointHalfRange=7;
    const exponent=groups-1;
    const rule=groups>=20
      ? STUDENTIZED_RANGE_HIGH_GROUP_NORMAL_RULE
      : STUDENTIZED_RANGE_NORMAL_RULE;
    let sum=0;
    let densitySum=0;
    for(let index=0;index<rule.nodes.length;index+=1){
      const coordinate=midpointHalfRange*rule.nodes[index];
      // The range CDF is integrated over the minimum observation itself.
      // Its density stays near the lower normal tail as q grows, so shifting
      // the integration interval to the range midpoint loses almost all CDF
      // mass for large q. The survival integral instead uses the midpoint,
      // where extreme ranges of width q are centered.
      const lower=survival ? coordinate-(q/2) : coordinate;
      const upper=survival ? coordinate+(q/2) : coordinate+q;
      const upperTailAtLower=normalSurvival(lower);
      const upperTailAtUpper=normalSurvival(upper);
      const span=normalIntervalProbability(lower,upper,upperTailAtLower,upperTailAtUpper);
      if(!(Number.isFinite(upperTailAtLower) && Number.isFinite(upperTailAtUpper) && Number.isFinite(span))){
        return NaN;
      }
      let probabilityTerm;
      if(survival){
        const ratio=Math.max(0,Math.min(1,span/upperTailAtLower));
        const logSpanRatio=ratio<0.5
          ? Math.log(ratio)
          : Math.log1p(-Math.max(0,Math.min(1,upperTailAtUpper/upperTailAtLower)));
        const minimumTailPower=Math.exp(exponent*Math.log(upperTailAtLower));
        probabilityTerm=minimumTailPower*(-Math.expm1(exponent*logSpanRatio));
      }else{
        probabilityTerm=Math.pow(span,exponent);
      }
      const density=Math.exp(-0.5*lower*lower)/Math.sqrt(2*Math.PI);
      sum+=rule.weights[index]*density*probabilityTerm;
      if(withDensity){
        const intervalDensity=span>0
          ? Math.exp(Math.log(groups*(groups-1)/(2*Math.PI))
            -0.5*((lower*lower)+(upper*upper))
            +((groups-2)*Math.log(span)))
          : 0;
        densitySum+=rule.weights[index]*intervalDensity;
      }
    }
    const value=groups*midpointHalfRange*sum;
    if(!Number.isFinite(value)) return NaN;
    const probability=Math.max(0,Math.min(1,value));
    if(!withDensity) return probability;
    const rangeDensity=midpointHalfRange*densitySum;
    return Number.isFinite(rangeDensity) ? { probability,density:Math.max(0,rangeDensity) } : NaN;
  }

  function logAddPositive(left,right){
    if(left===Number.NEGATIVE_INFINITY) return right;
    if(right===Number.NEGATIVE_INFINITY) return left;
    const high=Math.max(left,right);
    return high+Math.log1p(Math.exp(Math.min(left,right)-high));
  }

  function regularizedGammaLowerFromLogX(shape,logX){
    if(!(Number.isFinite(shape) && shape>0) || Number.isNaN(logX)) return NaN;
    if(logX===Number.NEGATIVE_INFINITY) return 0;
    if(logX===Number.POSITIVE_INFINITY) return 1;
    const logThreshold=Math.log(shape+1);
    if(logX>=logThreshold){
      if(logX>STUDENTIZED_RANGE_MAX_LOG) return 1;
      const stats=ensureStats();
      const upper=stats?.regularizedGammaQ?.(shape,Math.exp(logX));
      return Number.isFinite(upper) ? Math.max(0,Math.min(1,1-upper)) : NaN;
    }
    const x=logX<Math.log(Number.MIN_VALUE) ? 0 : Math.exp(logX);
    let logTerm=0;
    let logSum=0;
    for(let index=1;index<=10000;index+=1){
      logTerm+=logX-Math.log(shape+index);
      logSum=logAddPositive(logSum,logTerm);
      if(logTerm-logSum<Math.log(2e-16)) break;
      if(x===0) break;
    }
    const logProbability=shape*logX-x-logGammaLanczos(shape+1)+logSum;
    if(logProbability>=0) return 1;
    if(logProbability<Math.log(Number.MIN_VALUE)) return 0;
    return Math.exp(logProbability);
  }

  function regularizedGammaUpperFromLogX(shape,logX){
    if(!(Number.isFinite(shape) && shape>0) || Number.isNaN(logX)) return NaN;
    if(logX===Number.NEGATIVE_INFINITY) return 1;
    if(logX>STUDENTIZED_RANGE_MAX_LOG) return 0;
    const stats=ensureStats();
    const upper=stats?.regularizedGammaQ?.(shape,Math.exp(logX));
    return Number.isFinite(upper) ? Math.max(0,Math.min(1,upper)) : NaN;
  }

  function studentizedRangeScaleLogBounds(df,tailLogBound=STUDENTIZED_RANGE_TAIL_LOG_BOUND){
    const shape=df/2;
    const target=tailLogBound/shape;
    if(!Number.isFinite(target)){
      return { lower:Number.NEGATIVE_INFINITY, upper:Number.POSITIVE_INFINITY };
    }
    const deviance=logScale=>Math.expm1(2*logScale)-2*logScale;
    let lowerLow=-Math.max(2,target+2);
    let lowerHigh=0;
    for(let iteration=0;iteration<64;iteration+=1){
      const midpoint=(lowerLow+lowerHigh)/2;
      if(deviance(midpoint)>target) lowerLow=midpoint;
      else lowerHigh=midpoint;
    }
    let upperLow=0;
    let upperHigh=1;
    while(deviance(upperHigh)<target && upperHigh<1024){
      upperHigh*=2;
    }
    if(upperHigh>=1024 && deviance(upperHigh)<target){
      return { lower:(lowerLow+lowerHigh)/2, upper:Number.POSITIVE_INFINITY };
    }
    for(let iteration=0;iteration<64;iteration+=1){
      const midpoint=(upperLow+upperHigh)/2;
      if(deviance(midpoint)<target) upperLow=midpoint;
      else upperHigh=midpoint;
    }
    return { lower:(lowerLow+lowerHigh)/2, upper:(upperLow+upperHigh)/2 };
  }

  function integrateGaussLegendre(fn,lower,upper,rule){
    if(!(upper>lower)) return 0;
    const midpoint=(lower+upper)/2;
    const halfRange=(upper-lower)/2;
    let sum=0;
    for(let index=0;index<rule.nodes.length;index+=1){
      const value=fn(midpoint+(halfRange*rule.nodes[index]));
      if(!Number.isFinite(value)) return NaN;
      sum+=rule.weights[index]*value;
    }
    return halfRange*sum;
  }

  function integrateGaussLegendrePair(fn,lower,upper,rule){
    if(!(upper>lower)) return { probability:0,density:0 };
    const midpoint=(lower+upper)/2;
    const halfRange=(upper-lower)/2;
    let probabilitySum=0;
    let densitySum=0;
    for(let index=0;index<rule.nodes.length;index+=1){
      const value=fn(midpoint+(halfRange*rule.nodes[index]));
      if(!value || !(Number.isFinite(value.probability) && Number.isFinite(value.density))) return NaN;
      probabilitySum+=rule.weights[index]*value.probability;
      densitySum+=rule.weights[index]*value.density;
    }
    return {
      probability:halfRange*probabilitySum,
      density:halfRange*densitySum
    };
  }

  function studentizedRangeFiniteProbability(q,groups,df,survival,withDensity=false){
    const shape=df/2;
    if(!(shape>0)) return NaN;
    const lowH=Math.pow(STUDENTIZED_RANGE_LOW_H_BOUND,1/(groups-1))/Math.sqrt(2/Math.PI);
    const lowLogH=Math.log(lowH);
    const highLogH=Math.log(STUDENTIZED_RANGE_HIGH_H);
    const logQ=Math.log(q);
    const bounds=studentizedRangeScaleLogBounds(df);
    const lower=Math.max(lowLogH,logQ+bounds.lower);
    const upper=Math.min(highLogH,logQ+bounds.upper);
    const logShape=Math.log(shape);
    const lowerMass=regularizedGammaLowerFromLogX(shape,logShape+(2*(lowLogH-logQ)));
    const upperMass=survival ? 0 : regularizedGammaUpperFromLogX(shape,logShape+(2*(highLogH-logQ)));
    if(!(Number.isFinite(lowerMass) && Number.isFinite(upperMass))) return NaN;
    if(!(upper>lower)){
      const probability=Math.max(0,Math.min(1,survival?lowerMass:upperMass));
      return withDensity ? { probability,density:0 } : probability;
    }

    const logDensityConstant=Math.log(2)+(shape*logShape)-logGammaLanczos(shape);
    const integrand=logH=>{
      const logScale=logH-logQ;
      const twiceLogScale=2*logScale;
      const scaledSquare=twiceLogScale>STUDENTIZED_RANGE_MAX_LOG
        ? Number.POSITIVE_INFINITY
        : Math.exp(twiceLogScale);
      const logDensity=logDensityConstant+(df*logScale)-(shape*scaledSquare);
      if(!Number.isFinite(logDensity)){
        return logDensity===Number.NEGATIVE_INFINITY
          ? (withDensity ? { probability:0,density:0 } : 0)
          : NaN;
      }
      if(logDensity<Math.log(Number.MIN_VALUE)) return withDensity ? { probability:0,density:0 } : 0;
      const conditional=normalRangeProbability(Math.exp(logH),groups,survival,withDensity);
      if(withDensity){
        if(!conditional || !(Number.isFinite(conditional.probability) && Number.isFinite(conditional.density))){
          return { probability:NaN,density:NaN };
        }
        const weight=Math.exp(logDensity);
        return {
          probability:weight*conditional.probability,
          density:weight*Math.exp(logScale)*conditional.density
        };
      }
      return Number.isFinite(conditional) ? Math.exp(logDensity)*conditional : NaN;
    };

    const breakpoints=[lower,upper];
    const logQInside=logQ>lower && logQ<upper ? logQ : null;
    if(logQInside!==null) breakpoints.push(logQInside);
    [0.1,0.5,1,2,4,8,16,32].forEach(h=>{
      const point=Math.log(h);
      if(point>lower && point<upper) breakpoints.push(point);
    });
    breakpoints.sort((left,right)=>left-right);
    const uniqueBreakpoints=breakpoints.filter((point,index)=>index===0 || point-breakpoints[index-1]>1e-12);
    const maxPanelWidth=Math.min(2.5,6/Math.sqrt(df));
    let integral=0;
    let densityIntegral=0;
    for(let index=0;index<uniqueBreakpoints.length-1;index+=1){
      const panelStart=uniqueBreakpoints[index];
      const panelEnd=uniqueBreakpoints[index+1];
      const panelCount=Math.max(1,Math.ceil((panelEnd-panelStart)/maxPanelWidth));
      for(let panel=0;panel<panelCount;panel+=1){
        const panelLow=panelStart+((panelEnd-panelStart)*panel/panelCount);
        const panelHigh=panelStart+((panelEnd-panelStart)*(panel+1)/panelCount);
        if(withDensity){
          const area=integrateGaussLegendrePair(integrand,panelLow,panelHigh,STUDENTIZED_RANGE_OUTER_RULE);
          if(!area || !(Number.isFinite(area.probability) && Number.isFinite(area.density))) return NaN;
          integral+=area.probability;
          densityIntegral+=area.density;
        }else{
          const area=integrateGaussLegendre(integrand,panelLow,panelHigh,STUDENTIZED_RANGE_OUTER_RULE);
          if(!Number.isFinite(area)) return NaN;
          integral+=area;
        }
      }
    }
    const value=survival ? lowerMass+integral : upperMass+integral;
    if(!Number.isFinite(value)) return NaN;
    const probability=Math.max(0,Math.min(1,value));
    return withDensity ? { probability,density:densityIntegral } : probability;
  }

  function studentizedRangeCDFInfinite(q,r){
    const survival=normalRangeProbability(q,r,true);
    if(!Number.isFinite(survival)) return NaN;
    // Complementation is stable while the CDF is at least 0.01; integrate a
    // smaller lower tail directly to avoid cancellation.
    return survival<=0.99
      ? Math.max(0,Math.min(1,1-survival))
      : normalRangeProbability(q,r,false);
  }
  function logGammaLanczos(value){
    const coefficients=[676.5203681218851,-1259.1392167224028,771.323428777653,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.98436957801957e-6,1.5056327351493116e-7];
    if(value<0.5){
      return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*value))-logGammaLanczos(1-value);
    }
    let z=value-1;
    let x=0.9999999999998099;
    for(let i=0;i<coefficients.length;i++) x+=coefficients[i]/(z+i+1);
    const t=z+coefficients.length-0.5;
    return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);
  }

  function studentizedRangeParametersAreValid(q,r,df){
    return !Number.isNaN(q)
      && Number.isInteger(r) && r>=2
      && (df===Number.POSITIVE_INFINITY || (Number.isFinite(df) && df>0));
  }

  function studentizedRangeCDF(q,r,df){
    const value=Number(q);
    const groups=Number(r);
    const degrees=Number(df);
    if(Number.isNaN(value) || !studentizedRangeParametersAreValid(value,groups,degrees)) return NaN;
    if(value<=0) return 0;
    if(value===Number.POSITIVE_INFINITY) return 1;
    if(groups===2){
      if(degrees===Number.POSITIVE_INFINITY){
        return studentizedRangeCDFInfinite(value,groups);
      }
      const t=value/Math.SQRT2;
      const ratio=t>Math.sqrt(Number.MAX_VALUE) ? 0 : (degrees/(degrees+(t*t)));
      const x=1-ratio;
      const stats=ensureStats();
      return stats?.regularizedBeta?.(x,0.5,degrees/2) ?? NaN;
    }
    if(degrees===Number.POSITIVE_INFINITY || degrees>100000){
      return studentizedRangeCDFInfinite(value,groups);
    }
    const survival=studentizedRangeFiniteProbability(value,groups,degrees,true);
    if(!Number.isFinite(survival)) return NaN;
    // Keep CDF/SF consistent above a 0.01 CDF while computing smaller CDFs
    // directly from their lower-tail integral.
    if(survival<=0.99) return Math.max(0,Math.min(1,1-survival));
    return studentizedRangeFiniteProbability(value,groups,degrees,false);
  }

  function studentizedRangeSF(q,r,df){
    const value=Number(q);
    const groups=Number(r);
    const degrees=Number(df);
    if(Number.isNaN(value) || !studentizedRangeParametersAreValid(value,groups,degrees)) return NaN;
    if(value<=0) return 1;
    if(value===Number.POSITIVE_INFINITY) return 0;
    if(groups===2){
      if(degrees===Number.POSITIVE_INFINITY) return Math.max(0,Math.min(1,2*normalSurvival(value/Math.SQRT2)));
      return studentTTwoSidedPValue(value/Math.SQRT2,degrees);
    }
    const infiniteDegrees=degrees===Number.POSITIVE_INFINITY || degrees>100000;
    const survival=infiniteDegrees
      ? normalRangeProbability(value,groups,true)
      : studentizedRangeFiniteProbability(value,groups,degrees,true);
    if(!Number.isFinite(survival)) return NaN;
    if(groups>=20 && survival>0.99){
      // The high-group quadrature loses precision when the survival value is
      // nearly one. In this region the lower tail is small, so its direct CDF
      // is the stable complement and avoids cancellation in 1 - CDF.
      const lowerTail=infiniteDegrees
        ? normalRangeProbability(value,groups,false)
        : studentizedRangeFiniteProbability(value,groups,degrees,false);
      if(!Number.isFinite(lowerTail)) return NaN;
      return Math.max(0,Math.min(1,1-lowerTail));
    }
    return survival;
  }

  function studentizedRangeSurvivalAndDensity(q,groups,df){
    if(df===Number.POSITIVE_INFINITY || df>100000){
      return normalRangeProbability(q,groups,true,true);
    }
    return studentizedRangeFiniteProbability(q,groups,df,true,true);
  }

  function computeAnovaComponents(groups, suppliedComponents = null){
    const cleaned = (Array.isArray(groups) ? groups : []).map(group => group.filter(Number.isFinite));
    const counts = cleaned.map(group => group.length);
    const validCounts = counts.every(n => n > 0);
    if(!validCounts){
      return { ok: false, reason: 'Each group needs at least one observation for one-way ANOVA pairwise comparisons.' };
    }
    const k = cleaned.length;
    const totalN = counts.reduce((sum, val) => sum + val, 0);
    if(totalN <= k){
      return { ok: false, reason: 'One-way ANOVA pairwise comparisons require positive residual degrees of freedom.' };
    }
    const components = suppliedComponents && Number.isFinite(suppliedComponents.ssWithin)
      ? suppliedComponents
      : anova(cleaned);
    const dfWithin = totalN - k;
    const mse = Number.isFinite(components.msWithin) ? components.msWithin : NaN;
    const means = Array.isArray(components.means) && components.means.length === k
      ? components.means
      : cleaned.map(group => mean(group));
    const sse = Number.isFinite(components.ssWithin) ? components.ssWithin : NaN;
    return {
      ok: Number.isFinite(mse) && mse > 0 && dfWithin > 0,
      mse,
      dfWithin,
      means,
      counts,
      totalN,
      groupCount: k,
      sse
    };
  }

  function hasValidReferenceIndex(groupCount, referenceIndex){
    if(referenceIndex===null || typeof referenceIndex==='undefined') return true;
    const reference=Number(referenceIndex);
    return Number.isInteger(reference) && reference>=0 && reference<groupCount;
  }

  function forEachComparisonPair(groupCount, referenceIndex, visit){
    if(referenceIndex!==null && typeof referenceIndex!=='undefined'){
      const reference=Number(referenceIndex);
      for(let i=0;i<reference;i+=1) visit(i,reference);
      for(let j=reference+1;j<groupCount;j+=1) visit(reference,j);
      return;
    }
    for(let i=0;i<groupCount;i+=1){
      for(let j=i+1;j<groupCount;j+=1){
        visit(i,j);
      }
    }
  }

  function computeTukeyComparisons(groups,labels,options={}){
    const base=computeAnovaComponents(groups, options?.anovaComponents);
    if(!base.ok){
      logDebug('Debug: box computeTukeyComparisons unavailable',base);
      return { ok:false, message:base.reason || 'Unable to compute Tukey HSD; residual variance must be positive.' };
    }
    if(!hasValidReferenceIndex(base.groupCount,options?.referenceIndex)){
      return { ok:false, message:'Tukey HSD reference group index is invalid.' };
    }
    const pairs=[];
    const ciLevel=sanitizeStatsCiLevel(options?.ciLevel,0.95);
    const qCritical=resolveStudentizedRangeCritical(1-ciLevel,base.groupCount,base.dfWithin);
    if(!Number.isFinite(qCritical)){
      return { ok:false, message:'Tukey HSD confidence limits could not be computed from the studentized-range distribution.' };
    }
    let failure=null;
    forEachComparisonPair(base.groupCount,options?.referenceIndex,(i,j)=>{
        if(failure) return;
        const ni=base.counts[i];
        const nj=base.counts[j];
        const se=Math.sqrt(base.mse*0.5*(1/ni+1/nj));
        if(!Number.isFinite(se) || se<=0){
          logDebug('Debug: box computeTukeyComparisons skip pair',{ i,j,se });
          return;
        }
        const diff=base.means[i]-base.means[j];
        const q=Math.abs(diff)/se;
        const pAdj=studentizedRangeSF(q,base.groupCount,base.dfWithin);
        if(!Number.isFinite(pAdj)){
          failure={ ok:false, message:'Tukey HSD adjusted p-values could not be computed from the studentized-range distribution.' };
          return;
        }
        const ciHalf=Number.isFinite(qCritical)?qCritical*se:NaN;
        pairs.push({
          i,
          j,
          diff,
          se,
          q,
          pAdj,
          df:base.dfWithin,
          mse:base.mse,
          ni,
          nj,
          ciLow:Number.isFinite(ciHalf)?diff-ciHalf:NaN,
          ciHigh:Number.isFinite(ciHalf)?diff+ciHalf:NaN,
          labelA:labels?.[i],
          labelB:labels?.[j]
        });
    });
    if(failure) return failure;
    logDebug('Debug: box computeTukeyComparisons summary',{ pairCount:pairs.length, df:base.dfWithin, mse:base.mse });
    return {
      ok:pairs.length>0,
      pairs,
      df:base.dfWithin,
      mse:base.mse,
      footnote:`Tukey HSD adjusted via studentized range (df = ${base.dfWithin})`,
      counts:base.counts,
      means:base.means
    };
  }

  function computeAnovaPooledComparisons(groups,labels,options={}){
    const base=computeAnovaComponents(groups, options?.anovaComponents);
    if(!base.ok){
      return {
        ok:false,
        message:base.reason || 'ANOVA-pooled t-tests require positive residual variance and residual degrees of freedom.'
      };
    }
    const ciLevel=sanitizeStatsCiLevel(options?.ciLevel,0.95);
    const critical=resolveDirectionalTCritical(base.dfWithin,ciLevel,'two-sided');
    if(!Number.isFinite(critical)){
      return { ok:false, message:'ANOVA-pooled confidence intervals could not be computed from the Student t distribution.' };
    }
    const pairs=[];
    for(let i=0;i<base.groupCount;i+=1){
      for(let j=i+1;j<base.groupCount;j+=1){
        const ni=base.counts[i];
        const nj=base.counts[j];
        const se=Math.sqrt(base.mse*(1/ni+1/nj));
        const diff=base.means[i]-base.means[j];
        if(!(Number.isFinite(se) && se>0 && Number.isFinite(diff))){
          return { ok:false, message:'ANOVA-pooled t-tests require finite pairwise standard errors and mean differences.' };
        }
        const t=diff/se;
        const p=studentTTwoSidedPValue(t,base.dfWithin);
        if(!Number.isFinite(p) || p<0 || p>1){
          return { ok:false, message:'ANOVA-pooled t-test p-values could not be computed.' };
        }
        const ciHalf=critical*se;
        pairs.push({
          i,
          j,
          diff,
          se,
          t,
          p,
          df:base.dfWithin,
          mse:base.mse,
          ni,
          nj,
          ciLow:diff-ciHalf,
          ciHigh:diff+ciHalf,
          ciType:'nominal',
          ciLevel,
          labelA:labels?.[i],
          labelB:labels?.[j]
        });
      }
    }
    return {
      ok:pairs.length>0,
      pairs,
      df:base.dfWithin,
      mse:base.mse,
      counts:base.counts,
      means:base.means,
      ciType:'nominal',
      ciLevel
    };
  }

  function computeGamesHowellComparisons(groups,labels,options={}){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>group.filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    const k=cleaned.length;
    if(k<2){
      return { ok:false, message:'Games–Howell requires at least two groups.' };
    }
    if(counts.some(n=>n<2)){
      return { ok:false, message:'Games–Howell needs ≥2 observations per group.' };
    }
    if(!hasValidReferenceIndex(k,options?.referenceIndex)){
      return { ok:false, message:'Games–Howell reference group index is invalid.' };
    }
    const means=cleaned.map(group=>group.reduce((sum,val)=>sum+val,0)/group.length);
    const variances=cleaned.map((group,idx)=>{
      const m=means[idx];
      const sumSq=group.reduce((sum,val)=>sum+Math.pow(val-m,2),0);
      const denom=Math.max(group.length-1,1);
      const variance=sumSq/denom;
      return variance;
    });
    const ciLevel=sanitizeStatsCiLevel(options?.ciLevel,0.95);
    const pairInputs=[];
    let failure=null;
    forEachComparisonPair(k,options?.referenceIndex,(i,j)=>{
      if(failure) return;
      const ni=counts[i];
      const nj=counts[j];
      const varI=variances[i];
      const varJ=variances[j];
      const se2=varI/ni+varJ/nj;
      if(!(Number.isFinite(se2) && se2>0)){
        failure={ ok:false, message:'Games–Howell comparisons require positive pairwise variance.' };
        return;
      }
      const welchSe=Math.sqrt(se2);
      const rangeSe=Math.sqrt(0.5*se2);
      const diff=means[i]-means[j];
      const q=Math.abs(diff)/rangeSe;
      const denom=(Math.pow(varI/ni,2)/(ni-1))+(Math.pow(varJ/nj,2)/(nj-1));
      const df=denom>0?Math.pow(se2,2)/denom:Number.POSITIVE_INFINITY;
      const p=studentizedRangeSF(q,k,df);
      if(!Number.isFinite(p)){
        failure={ ok:false, message:'Games–Howell p-values could not be computed from the studentized-range distribution.' };
        return;
      }
      pairInputs.push({ i,j,diff,welchSe,rangeSe,q,p,df,ni,nj,varI,varJ });
    });
    if(failure) return failure;

    const criticalValues=resolveStudentizedRangeCriticalValues(
      1-ciLevel,
      k,
      pairInputs.map(pair=>pair.df)
    );
    const criticalByDf=new Map(criticalValues.map(value=>[value.df,value.critical]));
    if(criticalValues.some(value=>!Number.isFinite(value.critical))){
        return { ok:false, message:'Games–Howell confidence limits could not be computed from the studentized-range distribution.' };
    }

    const pairs=pairInputs.map(pair=>{
      const qCritical=criticalByDf.get(pair.df);
      const ciHalf=qCritical*pair.rangeSe;
      return {
        i:pair.i,
        j:pair.j,
        diff:pair.diff,
        se:pair.welchSe,
        rangeSe:pair.rangeSe,
        q:pair.q,
        p:pair.p,
        pAdj:pair.p,
        df:pair.df,
        ni:pair.ni,
        nj:pair.nj,
        varI:pair.varI,
        varJ:pair.varJ,
        ciLow:Number.isFinite(ciHalf)?pair.diff-ciHalf:NaN,
        ciHigh:Number.isFinite(ciHalf)?pair.diff+ciHalf:NaN,
        ciType:'simultaneous',
        ciLevel,
        labelA:labels?.[pair.i],
        labelB:labels?.[pair.j]
      };
    });
    logDebug('Debug: box computeGamesHowell summary',{ pairCount:pairs.length, k, variances:variances.map(v=>Number.isFinite(v)?Number(v.toFixed(4)):v) });
    return {
      ok:pairs.length>0,
      pairs,
      means,
      counts,
      variances,
      footnote:'Games–Howell adjusted via studentized range (Welch df per pair)'
    };
  }

    function computeNemenyiComparisons(groups,labels,options={}){
    const cleaned=alignCompleteRows(groups).groups;
    const k=cleaned.length;
    if(k<3){
      return { ok:false, message:"Nemenyi's test requires at least three paired groups." };
    }
    const n=cleaned[0]?.length || 0;
    if(n<2){
      return { ok:false, message:"Nemenyi's test requires at least two paired rows." };
    }
    const rowRanks=[];
    const rankSums=new Array(k).fill(0);
    let tieRows=0;
    for(let row=0; row<n; row++){
      const rowValues=cleaned.map(group=>group[row]);
      const rankInfo=rankValuesWithTieInfo(rowValues);
      if(rankInfo.tieTerm>0){
        tieRows+=1;
      }
      rowRanks.push(rankInfo.ranks.slice());
      for(let col=0; col<k; col++){
        rankSums[col]+=rankInfo.ranks[col];
      }
    }
    const meanRanks=rankSums.map(sum=>sum/n);
    const se=Math.sqrt((k*(k+1))/(6*n));
    if(!(se>0)){
      return { ok:false, message:"Unable to compute Nemenyi standard error." };
    }
    const pairs=[];
    for(let i=0;i<k;i++){
      for(let j=i+1;j<k;j++){
        const diff=meanRanks[i]-meanRanks[j];
        const q=Math.abs(diff)/se;
        const p=studentizedRangeSF(q*Math.SQRT2,k,Number.POSITIVE_INFINITY);
        if(!Number.isFinite(p)){
          return { ok:false, message:'Nemenyi p-values could not be computed from the studentized-range distribution.' };
        }
        pairs.push({
          i,
          j,
          diff,
          q,
          p,
          meanRankA:meanRanks[i],
          meanRankB:meanRanks[j],
          labelA:labels?.[i],
          labelB:labels?.[j]
        });
      }
    }
    const resamplingMode=resolveStatsResamplingMode(options);
    const iterations=resolveStatsMonteCarloIterations(options);
    const seed=resolveStatsSeed(options);
    const exactEligible=tieRows===0 && Math.pow(factorialInt(k),n)<=200000;
    if(resamplingMode!=='asymptotic' && (exactEligible || resamplingMode==='monte-carlo' || (resamplingMode==='auto' && n<=10))){
      const observedStats=pairs.map(pair=>Math.abs(pair.diff));
      const exceed=new Array(pairs.length).fill(0);
      let total=0;
      if(exactEligible && resamplingMode!=='monte-carlo'){
        const perms=generatePermutations(Array.from({ length:k },(_,idx)=>idx+1));
        function visit(rowIndex,currentSums){
          if(rowIndex>=n){
            total+=1;
            const simMeans=currentSums.map(sum=>sum/n);
            let maxPairwiseStatistic=0;
            pairs.forEach(pair=>{
              maxPairwiseStatistic=Math.max(maxPairwiseStatistic,Math.abs(simMeans[pair.i]-simMeans[pair.j]));
            });
            observedStats.forEach((observedStatistic,pairIdx)=>{
              if(maxPairwiseStatistic>=observedStatistic-1e-12){
                exceed[pairIdx]+=1;
              }
            });
            return;
          }
          perms.forEach(perm=>{
            for(let col=0; col<k; col++){
              currentSums[col]+=perm[col];
            }
            visit(rowIndex+1,currentSums);
            for(let col=0; col<k; col++){
              currentSums[col]-=perm[col];
            }
          });
        }
        visit(0,new Array(k).fill(0));
        pairs.forEach((pair,pairIdx)=>{
          pair.p=Math.max(0,Math.min(1,exceed[pairIdx]/Math.max(total,1)));
          pair.method='exact-permutation';
        });
        return {
          ok:pairs.length>0,
          pairs,
          meanRanks,
          footnote:'Friedman pairwise comparisons calibrated by the exact maximum absolute mean-rank difference across all displayed pairs.'
        };
      }
      const nextRand=createSeededRandom(seed + n*271 + k*31);
      for(let iter=0; iter<iterations; iter++){
        const simSums=new Array(k).fill(0);
        for(let row=0; row<n; row++){
          const perm=shuffleInPlace(rowRanks[row].slice(),nextRand);
          for(let col=0; col<k; col++){
            simSums[col]+=perm[col];
          }
        }
        const simMeans=simSums.map(sum=>sum/n);
        let maxPairwiseStatistic=0;
        pairs.forEach(pair=>{
          maxPairwiseStatistic=Math.max(maxPairwiseStatistic,Math.abs(simMeans[pair.i]-simMeans[pair.j]));
        });
        observedStats.forEach((observedStatistic,pairIdx)=>{
          if(maxPairwiseStatistic>=observedStatistic-1e-12){
            exceed[pairIdx]+=1;
          }
        });
      }
      pairs.forEach((pair,pairIdx)=>{
        pair.p=(exceed[pairIdx]+1)/(iterations+1);
        pair.method='monte-carlo';
      });
      return {
        ok:pairs.length>0,
        pairs,
        meanRanks,
        footnote:tieRows>0
          ? `Friedman pairwise comparisons calibrated by a Monte Carlo maximum-statistic within-row permutation test (${iterations} iterations; ties present).`
          : `Friedman pairwise comparisons calibrated by a Monte Carlo maximum-statistic within-row permutation test (${iterations} iterations).`
      };
    }
    return {
      ok:pairs.length>0,
      pairs,
      meanRanks,
      footnote:tieRows>0
        ? "Nemenyi post-hoc on average ranks after Friedman (studentized range approximation; ties present, so interpret conservatively)."
        : "Nemenyi post-hoc on average ranks after Friedman (studentized range approximation)."
    };
  }

  function computeTamhaneT2Comparisons(groups,labels,options={}){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>(Array.isArray(group)?group:[]).filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    const k=cleaned.length;
    if(k<2){
      return { ok:false, message:'Welch + Sidak comparisons require at least two groups.' };
    }
    if(counts.some(n=>n<2)){
      return { ok:false, message:'Welch + Sidak comparisons need at least two observations per group.' };
    }
    const means=cleaned.map(group=>group.reduce((sum,val)=>sum+val,0)/group.length);
    const variances=cleaned.map((group,idx)=>{
      const mu=means[idx];
      const sumSq=group.reduce((sum,val)=>sum+Math.pow(val-mu,2),0);
      const denom=Math.max(group.length-1,1);
      const variance=sumSq/denom;
      return variance>0?variance:Number.EPSILON;
    });
    const pairCount=Math.max(1,(k*(k-1))/2);
    const sidakAlpha=-Math.expm1(Math.log1p(-resolveStatsAlpha({ alpha:options?.alpha }))/pairCount);
    const pairs=[];
    for(let i=0;i<k;i++){
      for(let j=i+1;j<k;j++){
        const ni=counts[i];
        const nj=counts[j];
        const varI=variances[i];
        const varJ=variances[j];
        const se2=(varI/ni)+(varJ/nj);
        const se=Math.sqrt(se2>0?se2:Number.EPSILON);
        const diff=means[i]-means[j];
        const t=Math.abs(diff)/se;
        const denom=(Math.pow(varI/ni,2)/(ni-1))+(Math.pow(varJ/nj,2)/(nj-1));
        const df=denom>0?Math.pow(se2,2)/denom:Number.POSITIVE_INFINITY;
        const rawP=Number.isFinite(t) ? studentTTwoSidedPValue(t, df) : NaN;
        const pAdj=Number.isFinite(rawP) ? Math.max(0,Math.min(1,-Math.expm1(pairCount*Math.log1p(-rawP)))) : NaN;
        const tCritical=resolveTCritical(df,sidakAlpha);
        const ciHalf=Number.isFinite(tCritical)?tCritical*se:NaN;
        pairs.push({
          i,
          j,
          diff,
          se,
          t,
          p:rawP,
          pAdj,
          df,
          ni,
          nj,
          varI,
          varJ,
          ciLow:Number.isFinite(ciHalf)?diff-ciHalf:NaN,
          ciHigh:Number.isFinite(ciHalf)?diff+ciHalf:NaN,
          labelA:labels?.[i],
          labelB:labels?.[j]
        });
      }
    }
    logDebug('Debug: box computeTamhaneT2 summary',{ pairCount:pairs.length, k, sidakAlpha });
    return {
      ok:pairs.length>0,
      pairs,
      means,
      counts,
      variances,
      footnote:'Pairwise Welch t-tests with Sidak family-wise adjustment.'
    };
  }

  // A shared chi-square scale gives the multivariate-t distribution. Dunnett
  // uses common-control normal loadings; T3 uses independent normal coordinates.
  function studentizedMaximumSF(value,df,loadings){
    const q=Math.abs(value);
    if(!(df>0) || !Array.isArray(loadings) || !loadings.length || loadings.some(a=>!(a>=0 && a<1))) return NaN;
    if(q===Infinity) return 0;
    if(q===0) return 1;
    if(!Number.isFinite(q)) return NaN;
    if(loadings.length===1) return df===Infinity?2*normalSurvival(q):studentTTwoSidedPValue(q,df);
    const normalCdf=global.jStat?.normal?.cdf;
    const survival=x=>normalSurvival(x,normalCdf);
    const components=loadings.map(a=>({a,b:Math.sqrt(1-a*a)}));
    const independent=loadings.every(a=>a===0);
    const conditional=h=>{
      if(independent) return -Math.expm1(loadings.length*Math.log1p(-2*survival(h)));
      const integrand=z=>{
        let logInside=0;
        for(const {a,b} of components){
          const outside=Math.min(1,survival((h-a*z)/b)+survival((h+a*z)/b));
          logInside+=Math.log1p(-outside);
        }
        return Math.exp(-z*z/2)/Math.sqrt(2*Math.PI)*(-Math.expm1(logInside));
      };
      const points=Array.from({length:21},(_,index)=>index-10);
      loadings.forEach(a=>{
        if(a===0) return;
        const width=Math.sqrt(1-a*a)/a;
        if(width>=0.5) return;
        [-1,1].forEach(sign=>[-8,-4,-2,-1,0,1,2,4,8].forEach(offset=>{
          const point=sign*h/a+offset*width;
          if(point>-10 && point<10) points.push(point);
        }));
      });
      points.sort((a,b)=>a-b);
      let integral=0;
      for(let index=1;index<points.length;index+=1){
        integral+=integrateGaussLegendre(integrand,points[index-1],points[index],STUDENTIZED_RANGE_OUTER_RULE);
      }
      return integral;
    };
    if(df===Infinity) return conditional(q);
    const shape=df/2;
    const constant=shape>50
      ? 0.5*Math.log(df/Math.PI)-1/(12*shape)+1/(360*Math.pow(shape,3))-1/(1260*Math.pow(shape,5))
      : Math.log(2)+shape*Math.log(shape)-logGammaLanczos(shape)-shape;
    const bounds=studentizedRangeScaleLogBounds(df,50);
    const panels=Math.ceil((bounds.upper-bounds.lower)/Math.min(0.5,3/Math.sqrt(df)));
    let probability=0;
    for(let panel=0;panel<panels;panel+=1){
      const lower=bounds.lower+(bounds.upper-bounds.lower)*panel/panels;
      const upper=bounds.lower+(bounds.upper-bounds.lower)*(panel+1)/panels;
      probability+=integrateGaussLegendre(logScale=>{
        const logWeight=constant+shape*(2*logScale-Math.expm1(2*logScale));
        return Math.exp(logWeight)*conditional(q*Math.exp(logScale));
      },lower,upper,STUDENTIZED_RANGE_OUTER_RULE);
    }
    return Math.max(0,Math.min(1,probability));
  }

  const studentizedMaximumCriticalCache=new Map();
  function studentizedMaximumCritical(alpha,df,loadings){
    if(loadings.length===1) return resolveTCritical(df,alpha);
    const key=JSON.stringify([alpha,df,loadings]);
    if(studentizedMaximumCriticalCache.has(key)) return studentizedMaximumCriticalCache.get(key);
    let lower=0,upper=resolveTCritical(df,alpha/loadings.length);
    if(!(upper>0 && Number.isFinite(upper))) return NaN;
    while(studentizedMaximumSF(upper,df,loadings)>alpha) upper*=2;
    let lowValue=1-alpha,highValue=studentizedMaximumSF(upper,df,loadings)-alpha,lastSide=null,critical=NaN;
    // Illinois interpolation retains a bracket while avoiding dozens of
    // costly multivariate integrals required by plain bisection.
    for(let iteration=0;iteration<60;iteration+=1){
      const middle=(lower*highValue-upper*lowValue)/(highValue-lowValue);
      const value=studentizedMaximumSF(middle,df,loadings)-alpha;
      if(Math.abs(value)<1e-11 || upper-lower<1e-9){critical=middle;break;}
      if(value>0){
        lower=middle;lowValue=value;
        if(lastSide==='lower') highValue/=2;
        lastSide='lower';
      }else{
        upper=middle;highValue=value;
        if(lastSide==='upper') lowValue/=2;
        lastSide='upper';
      }
    }
    if(Number.isFinite(critical)){
      if(studentizedMaximumCriticalCache.size>=64) studentizedMaximumCriticalCache.delete(studentizedMaximumCriticalCache.keys().next().value);
      studentizedMaximumCriticalCache.set(key,critical);
    }
    return critical;
  }

  function computeDunnettComparisons(groups,labels,referenceIndex,options={}){
    const cleaned=(groups||[]).map(normalizeFiniteSample);
    const base=computeAnovaComponents(cleaned);
    const ref=Number.isInteger(referenceIndex)?referenceIndex:0;
    if(!base.ok || cleaned.length<2 || ref<0 || ref>=cleaned.length || cleaned.some(group=>group.length<2)){
      return {ok:false,message:'Dunnett requires a valid control and at least two observations per group.'};
    }
    if(!(base.mse>0)) return {ok:false,message:'Dunnett requires positive pooled residual variance.'};
    const comparisons=cleaned.map((_,index)=>index).filter(index=>index!==ref);
    const loadings=comparisons.map(index=>Math.sqrt(base.counts[index]/(base.counts[index]+base.counts[ref])));
    const ciLevel=sanitizeStatsCiLevel(options.ciLevel,0.95);
    const critical=studentizedMaximumCritical(1-ciLevel,base.dfWithin,loadings);
    const pairs=comparisons.map(j=>{
      const diff=base.means[ref]-base.means[j];
      const se=Math.sqrt(base.mse*(1/base.counts[ref]+1/base.counts[j]));
      const t=diff/se;
      return {i:ref,j,diff,se,t,df:base.dfWithin,p:studentTTwoSidedPValue(Math.abs(t),base.dfWithin),pAdj:studentizedMaximumSF(t,base.dfWithin,loadings),ciLow:diff-critical*se,ciHigh:diff+critical*se};
    });
    return {ok:true,pairs,means:base.means,counts:base.counts,footnote:'Dunnett two-sided many-to-one comparisons use the correlated multivariate-t distribution and simultaneous confidence intervals.'};
  }

  function computeDunnettT3Comparisons(groups,labels,options={}){
    const cleaned=(groups||[]).map(normalizeFiniteSample);
    if(cleaned.length<2 || cleaned.some(group=>group.length<2)) return {ok:false,message:'Dunnett T3 requires at least two groups with two observations each.'};
    const count=cleaned.length*(cleaned.length-1)/2;
    const loadings=new Array(count).fill(0);
    const ciLevel=sanitizeStatsCiLevel(options.ciLevel,0.95);
    const pairs=[];
    for(let i=0;i<cleaned.length;i+=1){
      for(let j=i+1;j<cleaned.length;j+=1){
        const pair=tTest(cleaned[i],cleaned[j],{alternative:'two-sided',ciLevel});
        if(!(pair.se>0)) return {ok:false,message:'Dunnett T3 requires positive variance for each compared pair.'};
        const critical=studentizedMaximumCritical(1-ciLevel,pair.df,loadings);
        pairs.push({i,j,...pair,pAdj:studentizedMaximumSF(pair.t,pair.df,loadings),ciLow:pair.diff-critical*pair.se,ciHigh:pair.diff+critical*pair.se});
      }
    }
    return {ok:true,pairs,footnote:'Dunnett T3 all-pairs comparisons use the studentized maximum modulus distribution with pair-specific Welch degrees of freedom and simultaneous confidence intervals; unequal-variance calibration is approximate.'};
  }

  function computeControlSidakComparisons(groups,labels,referenceIndex,options={}){
    const unequalVariances=options?.unequalVariances===true;
    const alpha=Number.isFinite(options?.alpha)?Math.min(0.5,Math.max(1e-6,options.alpha)):0.05;
    const ciLevel=sanitizeStatsCiLevel(options.ciLevel,1-alpha);
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>(Array.isArray(group)?group:[]).filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    const k=cleaned.length;
    if(k<3){
      return { ok:false, message:'Reference comparisons require at least three groups (including the reference).' };
    }
    const refIdx=Number.isInteger(referenceIndex)?referenceIndex:0;
    if(refIdx<0 || refIdx>=k){
      return { ok:false, message:'Select a valid reference group for the control comparisons.' };
    }
    if(counts.some(n=>n<2)){
      return { ok:false, message:'Reference comparisons require at least two values in each group.' };
    }
    const means=cleaned.map(group=>group.reduce((sum,val)=>sum+val,0)/group.length);
    const variances=cleaned.map((group,idx)=>{
      const mu=means[idx];
      const sumSq=group.reduce((sum,val)=>sum+Math.pow(val-mu,2),0);
      const denom=Math.max(group.length-1,1);
      const variance=sumSq/denom;
      return variance;
    });
    let pooledMse=NaN;
    let pooledDf=NaN;
    if(!unequalVariances){
      const anovaParts=computeAnovaComponents(cleaned);
      if(!anovaParts.ok){
        return { ok:false, message:anovaParts.reason || 'Unable to compute the pooled variance for reference comparisons.' };
      }
      pooledMse=anovaParts.mse;
      pooledDf=anovaParts.dfWithin;
    }
    const comparisonCount=Math.max(1,k-1);
    const sidakAlpha=-Math.expm1(Math.log(ciLevel)/comparisonCount);
    const pairs=[];
    for(let i=0;i<k;i++){
      if(i===refIdx){ continue; }
      const ni=counts[i];
      const nr=counts[refIdx];
      let se=NaN;
      let df=NaN;
      if(unequalVariances){
        const vi=variances[i];
        const vr=variances[refIdx];
        const se2=(vi/ni)+(vr/nr);
        se=Math.sqrt(se2);
        const denom=(Math.pow(vi/ni,2)/(ni-1))+(Math.pow(vr/nr,2)/(nr-1));
        df=denom>0?Math.pow(se2,2)/denom:Number.POSITIVE_INFINITY;
      }else{
        se=Math.sqrt(pooledMse*((1/ni)+(1/nr)));
        df=pooledDf;
      }
      if(!Number.isFinite(se) || se<=0){
        return {ok:false,message:'Control comparisons require a positive standard error for every contrast; constant samples cannot be calibrated.'};
      }
      const diff=means[refIdx]-means[i];
      const tVal=diff/se;
      const rawP=studentTTwoSidedPValue(tVal, df);
      const tCritical=resolveTCritical(df,sidakAlpha);
      const ciHalf=Number.isFinite(tCritical)?tCritical*se:NaN;
      pairs.push({
        i:refIdx,
        j:i,
        diff,
        se,
        t:tVal,
        p:rawP,
        df,
        ciLow:Number.isFinite(ciHalf)?diff-ciHalf:NaN,
        ciHigh:Number.isFinite(ciHalf)?diff+ciHalf:NaN,
        labelA:labels?.[refIdx],
        labelB:labels?.[i]
      });
    }
    if(!pairs.length){
      return { ok:false, message:'Unable to compute reference comparisons for the selected groups.' };
    }
    const adjusted=applyPValueCorrection(pairs.map(pair=>pair.p),'sidak');
    pairs.forEach((pair,index)=>{pair.pAdj=adjusted[index];});
    return {
      ok:true,
      pairs,
      referenceIndex:refIdx,
      means,
      counts,
      variances,
      footnote:unequalVariances
        ? "Welch t-tests versus control with Sidak-adjusted p-values and marginal t intervals; Welch calibration is approximate."
        : "ANOVA-pooled t-tests versus control with Sidak-adjusted p-values and marginal t intervals."
    };
  }

    function computeDunnComparisons(groups,labels,options={}){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>group.filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    if(counts.some(n=>n===0)){
      return { ok:false, message:"Dunn's test requires at least one value per group." };
    }
    const k=cleaned.length;
    if(k<2){
      return { ok:false, message:"Dunn's test needs at least two groups." };
    }
    const flat=[];
    cleaned.forEach((group,gi)=>{
      group.forEach(value=>flat.push({ value, group:gi }));
    });
    flat.sort((a,b)=>a.value-b.value);
    let idx=0;
    let tieSum=0;
    while(idx<flat.length){
      let j=idx+1;
      while(j<flat.length && flat[j].value===flat[idx].value){ j++; }
      const t=j-idx;
      const avg=(idx+j-1)/2+1;
      for(let m=idx;m<j;m++){ flat[m].rank=avg; }
      if(t>1){ tieSum+=t*t*t-t; }
      idx=j;
    }
    const rankSums=new Array(k).fill(0);
    flat.forEach(item=>{ rankSums[item.group]+=item.rank; });
    const totalN=flat.length;
    if(totalN<=1){
      return { ok:false, message:"Dunn's test requires more than one observation." };
    }
    const varianceBase=totalN*(totalN+1)/12;
    const tieCorrectionDenom=Math.pow(totalN,3)-totalN;
    const tieCorrection=tieCorrectionDenom!==0?1-tieSum/tieCorrectionDenom:1;
    const corrected=Math.max(tieCorrection,1e-6);
    const pairs=[];
    for(let i=0;i<k;i++){
      for(let j=i+1;j<k;j++){
        const meanRankI=rankSums[i]/counts[i];
        const meanRankJ=rankSums[j]/counts[j];
        const diff=meanRankI-meanRankJ;
        const se=Math.sqrt(varianceBase*corrected*((1/counts[i])+(1/counts[j])));
        if(!Number.isFinite(se) || se<=0){
          logDebug('Debug: box computeDunnComparisons skip pair',{ i,j,se });
          continue;
        }
        const z=diff/se;
        const absZ=Math.abs(z);


        const p=normalTwoSidedPValue(absZ);
        pairs.push({
          i,
          j,
          diff,
          z,
          se,
          p,
          labelA:labels?.[i],
          labelB:labels?.[j],
          counts:{ a:counts[i], b:counts[j] },
          rankMeans:{ a:meanRankI, b:meanRankJ }
        });
      }
    }
    const resamplingMode=resolveStatsResamplingMode(options);
    const iterations=resolveStatsMonteCarloIterations(options);
    const seed=resolveStatsSeed(options);
    const exactEligible=tieSum===0 && totalN<=10 && multinomialCount(counts)<=200000;
    if(resamplingMode!=='asymptotic' && (exactEligible || resamplingMode==='monte-carlo' || (resamplingMode==='auto' && totalN<=24))){
      const observedStats=pairs.map(pair=>Math.abs(pair.diff));
      const exceed=new Array(pairs.length).fill(0);
      if(exactEligible && resamplingMode!=='monte-carlo'){
        enumerateRankAssignmentsExact(counts,rankAssignment=>{
          const simMeanRanks=rankAssignment.map((sum,groupIdx)=>sum/counts[groupIdx]);
          pairs.forEach((pair,pairIdx)=>{
            const stat=Math.abs(simMeanRanks[pair.i]-simMeanRanks[pair.j]);
            if(stat>=observedStats[pairIdx]-1e-12){
              exceed[pairIdx]+=1;
            }
          });
        });
        const totalStates=multinomialCount(counts);
        pairs.forEach((pair,pairIdx)=>{
          pair.p=Math.max(0,Math.min(1,exceed[pairIdx]/Math.max(totalStates,1)));
          pair.method='exact-permutation';
        });
        logDebug('Debug: box computeDunnComparisons exact summary',{ pairCount:pairs.length, totalN, totalStates });
        return {
          ok:pairs.length>0,
          pairs,
          footnote:"Dunn's test uses exact pooled-rank assignments for small tie-free datasets.",
          totalN,
          counts
        };
      }
      const assignmentLabels=createPooledAssignmentLabels(counts);
      const rankValues=flat.map(item=>item.rank);
      const nextRand=createSeededRandom(seed + totalN*317 + k*37);
      for(let iter=0; iter<iterations; iter++){
        const labelsSim=shuffleInPlace(assignmentLabels.slice(),nextRand);
        const rankSumsSim=new Array(k).fill(0);
        for(let rankIdx=0; rankIdx<rankValues.length; rankIdx++){
          rankSumsSim[labelsSim[rankIdx]]+=rankValues[rankIdx];
        }
        const meanRanksSim=rankSumsSim.map((sum,groupIdx)=>sum/counts[groupIdx]);
        pairs.forEach((pair,pairIdx)=>{
          const stat=Math.abs(meanRanksSim[pair.i]-meanRanksSim[pair.j]);
          if(stat>=observedStats[pairIdx]-1e-12){
            exceed[pairIdx]+=1;
          }
        });
      }
      pairs.forEach((pair,pairIdx)=>{
        pair.p=(exceed[pairIdx]+1)/(iterations+1);
        pair.method='monte-carlo';
      });
      logDebug('Debug: box computeDunnComparisons monte-carlo summary',{ pairCount:pairs.length, totalN, iterations });
      return {
        ok:pairs.length>0,
        pairs,
        footnote:`Dunn's test calibrated by permutation/Monte Carlo over pooled rank assignments (${iterations} iterations).`,
        totalN,
        counts
      };
    }
    logDebug('Debug: box computeDunnComparisons summary',{ pairCount:pairs.length, totalN, tieCorrection:corrected });
    return {
      ok:pairs.length>0,
      pairs,
      footnote:"Dunn's test uses rank sums with tie correction.",
      totalN,
      counts
    };
  }
  function computeVectorStats(values){
    const arr = (Array.isArray(values) ? values : []).map(Number).filter(v => Number.isFinite(v));
    const n = arr.length;
    if(!n){
      return { n: 0, mean: NaN, variance: NaN, sd: NaN };
    }
    const meanVal = arr.reduce((sum, v) => sum + v, 0) / n;
    let variance = 0;
    if(n > 1){
      const sumSq = arr.reduce((sum, v) => sum + Math.pow(v - meanVal, 2), 0);
      variance = sumSq / (n - 1);
    }
    const sd = Math.sqrt(Math.max(variance, 0));
    return { n, mean: meanVal, variance, sd };
  }

  function computePairedSamples(a, b){
    const [sampleA,sampleB]=alignCompleteRows([a,b]).groups;
    return sampleA.map((value,index)=>({a:value,b:sampleB[index]}));
  }

  function computeDiffStats(pairedSamples){
    const diffs = [];
    let positive = 0;
    let negative = 0;
    let ties = 0;
    pairedSamples.forEach(pair => {
      const diff = pair.a - pair.b;
      diffs.push(diff);
      if(diff > 0) positive++;
      else if(diff < 0) negative++;
      else ties++;
    });
    const stats = computeVectorStats(diffs);
    return { ...stats, positive, negative, ties, total: stats.n };
  }

  function computePairwiseCounts(a, b){
    const arrA = (Array.isArray(a) ? a : []).map(Number).filter(v => Number.isFinite(v));
    const arrB = (Array.isArray(b) ? b : []).map(Number).filter(v => Number.isFinite(v));
    const nA = arrA.length;
    const nB = arrB.length;
    if(nA === 0 || nB === 0){
      return { greater: 0, less: 0, equal: 0, totalPairs: 0, nA, nB };
    }
    arrB.sort((x, y) => x - y);
    function lowerBound(arr, value){
      let lo = 0;
      let hi = arr.length;
      while(lo < hi){
        const mid = (lo + hi) >> 1;
        if(arr[mid] < value) lo = mid + 1; else hi = mid;
      }
      return lo;
    }
    function upperBound(arr, value){
      let lo = 0;
      let hi = arr.length;
      while(lo < hi){
        const mid = (lo + hi) >> 1;
        if(arr[mid] <= value) lo = mid + 1; else hi = mid;
      }
      return lo;
    }
    let greater = 0;
    let less = 0;
    let equal = 0;
    for(let i = 0; i < nA; i++){
      const av = arrA[i];
      const lessCount = lowerBound(arrB, av);
      const leCount = upperBound(arrB, av);
      const eq = leCount - lessCount;
      greater += lessCount;
      equal += eq;
      less += (nB - leCount);
    }
    const totalPairs = greater + less + equal;
    return { greater, less, equal, totalPairs, nA, nB };
  }

  function computeEffectSizeMetrics(a, b, options){
    const paired = !!options?.paired;
    const statsA = computeVectorStats(a);
    const statsB = computeVectorStats(b);
    const pairedSamples = paired ? computePairedSamples(a, b) : [];
    const diffStats = paired ? computeDiffStats(pairedSamples) : null;
    const counts = !paired ? computePairwiseCounts(a, b) : null;
    const metrics = { parametric: {}, nonParametric: {}, context: { nA: statsA.n, nB: statsB.n, paired } };
    if(paired){
      metrics.context.nPairs = diffStats?.total || 0;
    }
    if(statsA.n > 0 && statsB.n > 0){
      if(paired){
        if(diffStats && diffStats.total > 1 && Number.isFinite(diffStats.sd) && diffStats.sd > 0){
          const d = diffStats.mean / (diffStats.sd || 1);
          metrics.parametric.cohenD = d;
          const correctionDenom = 4 * (diffStats.total - 1) - 1;
          const correction = correctionDenom !== 0 ? 1 - 3 / correctionDenom : 1;
          if(Number.isFinite(correction)){
            metrics.parametric.hedgesG = d * correction;
          }
        }
      }else{
        const pooledDenom = (statsA.n - 1) + (statsB.n - 1);
        if(pooledDenom > 0){
          const pooledVar = ((statsA.variance * (statsA.n - 1)) + (statsB.variance * (statsB.n - 1))) / pooledDenom;
          const pooledSd = Math.sqrt(Math.max(pooledVar, 0));
          if(pooledSd > 0){
            const d = (statsA.mean - statsB.mean) / pooledSd;
            metrics.parametric.cohenD = d;
            const correctionDenom = 4 * (statsA.n + statsB.n) - 9;
            const correction = correctionDenom !== 0 ? 1 - 3 / correctionDenom : 1;
            if(Number.isFinite(correction)){
              metrics.parametric.hedgesG = d * correction;
            }
          }
        }
      }
    }
    if(!paired && counts && counts.totalPairs > 0){
      const delta = (counts.greater - counts.less) / counts.totalPairs;
      metrics.nonParametric.rankBiserial = clamp(delta, -1, 1);
      const commonLanguage = (counts.greater + 0.5 * counts.equal) / counts.totalPairs;
      metrics.nonParametric.commonLanguage = clamp(commonLanguage, 0, 1);
    }
    if(paired && diffStats && diffStats.total > 0){
      const signedRanks=computeSignedRankSums(pairedSamples.map(pair=>subtractRankObservation(pair.a,pair.b)));
      const totalRank=signedRanks.wPositive+signedRanks.wNegative;
      if(totalRank>0){
        metrics.nonParametric.rankBiserial=(signedRanks.wPositive-signedRanks.wNegative)/totalRank;
      }
      const cl = (diffStats.positive + 0.5 * diffStats.ties) / diffStats.total;
      metrics.nonParametric.commonLanguage = clamp(cl, 0, 1);
    }
    const debugPayload = {
      paired,
      nA: statsA.n,
      nB: statsB.n,
      nPairs: diffStats?.total || 0,
      parametric: Object.fromEntries(Object.entries(metrics.parametric).map(([key, val]) => [key, safeRound(val, 4)])),
      nonParametric: Object.fromEntries(Object.entries(metrics.nonParametric).map(([key, val]) => [key, safeRound(val, 4)])),
      counts: counts ? { ...counts, totalPairs: counts.totalPairs } : null,
      diffCounts: diffStats ? { positive: diffStats.positive, negative: diffStats.negative, ties: diffStats.ties } : null
    };
    logDebug('Debug: box worker computeEffectSizeMetrics', debugPayload);
    return { ...metrics, statsA, statsB, diffStats, counts };
  }
  function computeSampleSpreadFactor(sampleSize, debugEnabled){
    const n = Number(sampleSize) || 0;
    if(n <= 1){
      if(debugEnabled){
        console.debug('Debug: computeSampleSpreadFactor minimal', { sampleSize: n, factor: 0.2 });
      }
      return 0.2;
    }
    const sqrtScaled = Math.sqrt(n) / 7;
    const factor = Math.min(1, Math.max(0.2, sqrtScaled));
    if(debugEnabled){
      console.debug('Debug: computeSampleSpreadFactor', { sampleSize: n, sqrtScaled, factor });
    }
    return factor;
  }

  function computeSwarmOffsets(points, options){
    const isArrayLike = value => Array.isArray(value) || ArrayBuffer.isView(value);
    const coordsSource = points ? points.coords : null;
    const isCompact = !!points && !Array.isArray(points) && isArrayLike(coordsSource);
    const coordsInput = isCompact ? coordsSource : null;
    const rawInput = isCompact
      ? (isArrayLike(points.raws) ? points.raws : (isArrayLike(points.rawValues) ? points.rawValues : coordsInput))
      : null;
    const entries = Array.isArray(points) ? points : [];
    const entryCount = isCompact ? (coordsInput ? coordsInput.length : 0) : entries.length;
    const sampleSize = Number(options?.sampleSize) || entryCount;
    let pointRadiusValue = Number(options?.pointRadius);
    if(!Number.isFinite(pointRadiusValue) || pointRadiusValue <= 0){
      pointRadiusValue = 1;
    }
    const basePointRadius = pointRadiusValue;
    const axisSpacing = Number(options?.axisSpacing) || 0;
    const orientation = options?.orientation || 'vertical';
    const widthScaleMode = options?.widthScaleMode || 'none';
    const maxHalfWidthOverride = Number(options?.maxHalfWidth);
    const allowRadiusAdjustment = options?.allowRadiusAdjustment !== false;
    const radiusCountExponent = Number(options?.radiusCountExponent);
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const spreadFactor = computeSampleSpreadFactor(sampleSize, debugEnabled);
    const PREFERRED_GAP_FACTOR = 2.05;
    const densityDistance = Math.max(0.5, basePointRadius * PREFERRED_GAP_FACTOR);
    let axisBoundary = Math.max(0, axisSpacing / 2 - basePointRadius);

    const stripScale = 0.18;

    let effectiveHalfSpan = axisBoundary > 0
      ? axisSpacing * stripScale * spreadFactor
      : basePointRadius * 2.2 * spreadFactor;
    let globalMaxHalfWidth = Math.max(basePointRadius * 1.05, Math.min(effectiveHalfSpan, axisBoundary || effectiveHalfSpan));
    if(Number.isFinite(maxHalfWidthOverride) && maxHalfWidthOverride > 0){
      globalMaxHalfWidth = Math.max(basePointRadius * 1.05, maxHalfWidthOverride);
      if(axisBoundary > 0){
        globalMaxHalfWidth = Math.min(globalMaxHalfWidth, axisBoundary);
      }
    }
    if(!entryCount || !Number.isFinite(globalMaxHalfWidth) || globalMaxHalfWidth <= 0){
      if(debugEnabled){
        console.debug('Debug: computeSwarmOffsets empty', { orientation, sampleSize, axisSpacing });
      }
      return { offsets: new Array(entryCount).fill(0), maxOffsetUsed: 0, spreadFactor, maxOffset: 0 };
    }
    const offsetsByIndex = new Array(entryCount);
    const maxHalfWidthByIndex = new Array(entryCount);
    const coords = new Float64Array(entryCount);
    const jitters = new Uint32Array(entryCount);
    const fastThresholdRaw = Number(options?.fastThreshold);
    const fastThreshold = Number.isFinite(fastThresholdRaw) && fastThresholdRaw > 0 ? fastThresholdRaw : 20000;
    const fastMode = options?.fastMode;
    const useFastPlacement = fastMode === true
      ? true
      : (fastMode === false ? false : entryCount >= fastThreshold);
    const buildEntryJitterKey = (rawValue, coordValue, index, seed) => {
      const raw = Number(rawValue);
      const baseValue = Number.isFinite(raw) ? raw : (Number.isFinite(coordValue) ? coordValue : 0);
      const scaled = Math.round(baseValue * 1000);
      let hash = (scaled ^ (seed || 0)) >>> 0;
      hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
      hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
      hash = ((hash >>> 16) ^ hash) >>> 0;
      hash = (hash + (Number(index) + 1) * 1013) >>> 0;
      return hash;
    };
    const buildSortedIndices = seed => {
      const sorted = new Array(entryCount);
      let sortedCount = 0;
      if(isCompact){
        for(let i = 0; i < entryCount; i++){
          const coord = Number(coordsInput[i]);
          const safeCoord = Number.isFinite(coord) ? coord : 0;
          coords[i] = safeCoord;
          jitters[i] = buildEntryJitterKey(rawInput ? rawInput[i] : safeCoord, safeCoord, i, seed);
          sorted[sortedCount] = i;
          sortedCount += 1;
        }
      }else{
        for(let i = 0; i < entries.length; i++){
          const entry = entries[i];
          if(!entry || typeof entry.index !== 'number'){
            continue;
          }
          const coord = Number(entry.coord);
          const safeCoord = Number.isFinite(coord) ? coord : 0;
          const idx = entry.index;
          coords[idx] = safeCoord;
          jitters[idx] = buildEntryJitterKey(entry.raw, safeCoord, idx, seed);
          sorted[sortedCount] = idx;
          sortedCount += 1;
        }
      }
      if(sortedCount !== sorted.length){
        sorted.length = sortedCount;
      }
      sorted.sort((a, b) => (coords[a] - coords[b]) || (jitters[a] - jitters[b]) || (a - b));
      return sorted;
    };
    const getMaxOverlapCount = (sorted, distance) => {
      if(!sorted.length || !Number.isFinite(distance) || distance <= 0){
        return 0;
      }
      let maxCount = 0;
      let start = 0;
      for(let i = 0; i < sorted.length; i++){
        const coord = coords[sorted[i]];
        while(start < i && coord - coords[sorted[start]] > distance){
          start += 1;
        }
        const count = i - start + 1;
        if(count > maxCount){
          maxCount = count;
        }
      }
      return maxCount;
    };
    let seedBase = Math.round((sampleSize || entries.length) * 17 + pointRadiusValue * 1000);
    let sortedIndices = buildSortedIndices(seedBase);
    let collisionDistance = Math.max(0.5, pointRadiusValue * PREFERRED_GAP_FACTOR);
    let maxCount = getMaxOverlapCount(sortedIndices, collisionDistance);
    if(debugEnabled && maxCount > 1){
      console.debug('Debug: computeSwarmOffsets overlap scan', {
        orientation,
        pointRadius: pointRadiusValue,
        collisionDistance,
        maxCount
      });
    }
    if(maxCount <= 0){
      if(debugEnabled){
        console.debug('Debug: computeSwarmOffsets noBins', { orientation, sampleSize, axisSpacing });
      }
      return { offsets: entries.map(() => 0), maxOffsetUsed: 0, spreadFactor, maxOffset: 0 };
    }

    if(maxCount > 1 && allowRadiusAdjustment){
      const initialRadius = pointRadiusValue;
      const minRadius = Math.max(0.15, basePointRadius * 0.45);
      const effectiveCount = (Number.isFinite(radiusCountExponent) && radiusCountExponent > 0 && radiusCountExponent !== 1)
        ? (maxCount <= 1 ? maxCount : (1 + Math.pow(maxCount - 1, radiusCountExponent)))
        : maxCount;
      const maxAllowedRadius = (globalMaxHalfWidth * 2) / ((Math.max(1, effectiveCount) - 1) * PREFERRED_GAP_FACTOR);
      if(Number.isFinite(maxAllowedRadius) && maxAllowedRadius < pointRadiusValue){
        const adjusted = Math.max(minRadius, Math.min(pointRadiusValue, maxAllowedRadius));
        if(adjusted < pointRadiusValue){
          if(debugEnabled){
            console.debug('Debug: computeSwarmOffsets auto-adjust radius', { previousRadius: pointRadiusValue, adjustedRadius: adjusted, maxCount });
          }
          pointRadiusValue = adjusted;
        }
      }
      if(pointRadiusValue !== initialRadius){
        seedBase = Math.round((sampleSize || entries.length) * 17 + pointRadiusValue * 1000);
        sortedIndices = buildSortedIndices(seedBase);
        collisionDistance = Math.max(0.5, pointRadiusValue * PREFERRED_GAP_FACTOR);
        maxCount = getMaxOverlapCount(sortedIndices, collisionDistance);
        if(debugEnabled && maxCount > 1){
          console.debug('Debug: computeSwarmOffsets overlap scan adjusted', {
            orientation,
            pointRadius: pointRadiusValue,
            collisionDistance,
            maxCount
          });
        }
      }
    }

    let localCounts = null;
    let densityMax = maxCount;
    if(widthScaleMode === 'density' && sortedIndices.length){
      localCounts = new Array(entryCount);
      let left = 0;
      let right = 0;
      let maxLocal = 0;
      for(let i = 0; i < sortedIndices.length; i++){
        const coord = coords[sortedIndices[i]];
        if(right < i){
          right = i;
        }
        while(right + 1 < sortedIndices.length && coords[sortedIndices[right + 1]] - coord <= densityDistance){
          right += 1;
        }
        while(coord - coords[sortedIndices[left]] > densityDistance){
          left += 1;
        }
        const count = right - left + 1;
        localCounts[sortedIndices[i]] = count;
        if(count > maxLocal){
          maxLocal = count;
        }
      }
      densityMax = Math.max(1, maxLocal);
    }

    const groupSizeByIndex = new Array(entryCount);
    const groupIndexByIndex = new Array(entryCount);
    const centerBuckets = [];
    if(sortedIndices.length){
      const coordQuantum = 1;
      let bucket = [];
      let lastKey = null;
      for(let i = 0; i < sortedIndices.length; i++){
        const index = sortedIndices[i];
        const coord = coords[index];
        const coordKey = Number.isFinite(coord)
          ? Math.round(coord / coordQuantum) * coordQuantum
          : coord;
        if(!bucket.length){
          bucket.push(index);
          lastKey = coordKey;
          continue;
        }
        if(coordKey === lastKey){
          bucket.push(index);
          continue;
        }
        if(bucket.length > 1){
          centerBuckets.push(bucket);
          const size = bucket.length;
          for(let j = 0; j < size; j++){
            const idx = bucket[j];
            groupSizeByIndex[idx] = size;
            groupIndexByIndex[idx] = j;
          }
        }
        bucket = [index];
        lastKey = coordKey;
      }
      if(bucket.length > 1){
        centerBuckets.push(bucket);
        const size = bucket.length;
        for(let j = 0; j < size; j++){
          const idx = bucket[j];
          groupSizeByIndex[idx] = size;
          groupIndexByIndex[idx] = j;
        }
      }
    }

    const pairBuckets = [];
    if(sortedIndices.length > 1){
      const neighborLeftByIndex = new Array(entryCount);
      const neighborRightByIndex = new Array(entryCount);
      const neighborCountByIndex = new Array(entryCount);
      let left = 0;
      let right = 0;
      for(let i = 0; i < sortedIndices.length; i++){
        const coord = coords[sortedIndices[i]];
        if(right < i){
          right = i;
        }
        while(right + 1 < sortedIndices.length && coords[sortedIndices[right + 1]] - coord <= collisionDistance){
          right += 1;
        }
        while(coord - coords[sortedIndices[left]] > collisionDistance){
          left += 1;
        }
        const index = sortedIndices[i];
        neighborLeftByIndex[index] = left;
        neighborRightByIndex[index] = right;
        neighborCountByIndex[index] = right - left + 1;
      }
      const paired = new Uint8Array(entryCount);
      for(let i = 0; i < sortedIndices.length; i++){
        const entryIndex = sortedIndices[i];
        if(paired[entryIndex]){
          continue;
        }
        if((groupSizeByIndex[entryIndex] || 0) > 1){
          continue;
        }
        const count = neighborCountByIndex[entryIndex];
        if(count !== 2){
          continue;
        }
        let otherIndex = null;
        const leftIdx = neighborLeftByIndex[entryIndex];
        const rightIdx = neighborRightByIndex[entryIndex];
        for(let k = leftIdx; k <= rightIdx; k++){
          const candidate = sortedIndices[k];
          if(candidate !== entryIndex){
            otherIndex = candidate;
            break;
          }
        }
        if(otherIndex == null || paired[otherIndex]){
          continue;
        }
        if((groupSizeByIndex[otherIndex] || 0) > 1){
          continue;
        }
        if(neighborCountByIndex[otherIndex] !== 2){
          continue;
        }
        paired[entryIndex] = 1;
        paired[otherIndex] = 1;
        pairBuckets.push([entryIndex, otherIndex]);
      }
    }

    const collisionDistanceSq = collisionDistance * collisionDistance;
    let maxUsed = 0;
    const placedCoord = new Float64Array(entryCount);
    const placedOffset = new Float64Array(entryCount);
    let placedCount = 0;
    let activeStart = 0;
    const candidateCount = Math.min(9, Math.max(5, Math.round(Math.log(entryCount + 2) * 2)));
    const intervalPool = [];
    const freeIntervalPool = [];
    const intervals = [];
    const freeIntervals = [];
    const candidates = [];
    for(let idx = 0; idx < sortedIndices.length; idx++){
      const index = sortedIndices[idx];
      const coord = coords[index];
      while(activeStart < placedCount && coord - placedCoord[activeStart] > collisionDistance){
        activeStart += 1;
      }
      let maxHalfWidth = globalMaxHalfWidth;
      if(widthScaleMode === 'density' && localCounts){
        const localCount = localCounts[index] || 1;
        const scale = densityMax > 1 ? (localCount / densityMax) : 1;
        const scaledWidth = globalMaxHalfWidth * scale;
        maxHalfWidth = Math.max(pointRadiusValue * 1.05, Math.min(globalMaxHalfWidth, scaledWidth));
      }
      maxHalfWidthByIndex[index] = maxHalfWidth;
      const groupSize = Number.isFinite(groupSizeByIndex[index]) ? groupSizeByIndex[index] : 1;
      const groupIndex = Number.isFinite(groupIndexByIndex[index]) ? groupIndexByIndex[index] : 0;
      const resolveOffset = maxHalfWidthValue => {
        if(!Number.isFinite(maxHalfWidthValue) || maxHalfWidthValue <= 0){
          return null;
        }
        const preferSymmetric = groupSize > 1;
        const evenGroup = preferSymmetric && groupSize % 2 === 0;
        if(useFastPlacement){
          let preferredOffset = null;
          if(preferSymmetric){
            const gapLimit = groupSize > 1 ? (maxHalfWidthValue * 2) / Math.max(1, groupSize - 1) : 0;
            const preferredGap = Math.min(collisionDistance, Number.isFinite(gapLimit) && gapLimit > 0 ? gapLimit : collisionDistance);
            const centerIndex = (groupSize - 1) / 2;
            preferredOffset = (groupIndex - centerIndex) * preferredGap;
            if(!Number.isFinite(preferredOffset)){
              preferredOffset = 0;
            }
            if(preferredOffset > maxHalfWidthValue){
              preferredOffset = maxHalfWidthValue;
            }else if(preferredOffset < -maxHalfWidthValue){
              preferredOffset = -maxHalfWidthValue;
            }
          }
          if(activeStart >= placedCount){
            if(preferSymmetric && Number.isFinite(preferredOffset)){
              return preferredOffset;
            }
            return 0;
          }
          candidates.length = 0;
          const addCandidate = cand => {
            if(Number.isFinite(cand)){
              candidates.push(cand);
            }
          };
          if(preferSymmetric && Number.isFinite(preferredOffset)){
            addCandidate(preferredOffset);
          }
          if(!evenGroup){
            addCandidate(0);
          }
          addCandidate(-maxHalfWidthValue);
          addCandidate(maxHalfWidthValue);
          let rng = (jitters[index] ^ (seedBase + idx * 2654435761)) >>> 0;
          const nextRand = () => {
            rng = (rng * 1664525 + 1013904223) >>> 0;
            return rng / 4294967295;
          };
          for(let i = 0; i < candidateCount; i++){
            const u = nextRand();
            addCandidate(-maxHalfWidthValue + u * (maxHalfWidthValue * 2));
          }
          if(!candidates.length){
            return 0;
          }
          let bestFree = -Infinity;
          let bestOverlap = -Infinity;
          let chosenLocal = null;
          for(let i = 0; i < candidates.length; i++){
            const cand = candidates[i];
            let minDistSq = Infinity;
            for(let j = activeStart; j < placedCount; j++){
              const dx = cand - placedOffset[j];
              const dy = coord - placedCoord[j];
              const distSq = dx * dx + dy * dy;
              if(distSq < minDistSq){
                minDistSq = distSq;
                if(bestFree > -Infinity && minDistSq < collisionDistanceSq){
                  break;
                }
              }
            }
            if(minDistSq >= collisionDistanceSq){
              if(minDistSq > bestFree){
                bestFree = minDistSq;
                chosenLocal = cand;
              }
            }else if(bestFree === -Infinity && minDistSq > bestOverlap){
              bestOverlap = minDistSq;
              chosenLocal = cand;
            }
          }
          return chosenLocal == null ? 0 : chosenLocal;
        }
        intervals.length = 0;
        let intervalCount = 0;
        for(let j = activeStart; j < placedCount; j++){
          const dy = coord - placedCoord[j];
          if(dy >= collisionDistance || dy <= -collisionDistance){
            continue;
          }
          const dx = Math.sqrt(Math.max(0, collisionDistanceSq - dy * dy));
          let start = placedOffset[j] - dx;
          let end = placedOffset[j] + dx;
          if(end < -maxHalfWidthValue || start > maxHalfWidthValue){
            continue;
          }
          if(start < -maxHalfWidthValue){ start = -maxHalfWidthValue; }
          if(end > maxHalfWidthValue){ end = maxHalfWidthValue; }
          if(end > start){
            const interval = intervalPool[intervalCount] || (intervalPool[intervalCount] = { start: 0, end: 0 });
            interval.start = start;
            interval.end = end;
            intervals[intervalCount] = interval;
            intervalCount += 1;
          }
        }
        intervals.length = intervalCount;
        if(!intervals.length && !preferSymmetric){
          return 0;
        }
        if(!intervals.length && preferSymmetric){
          const gapLimit = groupSize > 1 ? (maxHalfWidthValue * 2) / Math.max(1, groupSize - 1) : 0;
          const preferredGap = Math.min(collisionDistance, Number.isFinite(gapLimit) && gapLimit > 0 ? gapLimit : collisionDistance);
          const centerIndex = (groupSize - 1) / 2;
          let preferredOffset = (groupIndex - centerIndex) * preferredGap;
          if(!Number.isFinite(preferredOffset)){
            preferredOffset = 0;
          }
          if(preferredOffset > maxHalfWidthValue){
            preferredOffset = maxHalfWidthValue;
          }else if(preferredOffset < -maxHalfWidthValue){
            preferredOffset = -maxHalfWidthValue;
          }
          return preferredOffset;
        }
        freeIntervals.length = 0;
        let freeCount = 0;
        if(!intervals.length){
          const full = freeIntervalPool[freeCount] || (freeIntervalPool[freeCount] = { start: 0, end: 0 });
          full.start = -maxHalfWidthValue;
          full.end = maxHalfWidthValue;
          freeIntervals[freeCount] = full;
          freeCount += 1;
        }else{
          intervals.sort((a, b) => (a.start - b.start) || (a.end - b.end));
          let cursor = -maxHalfWidthValue;
          let curStart = intervals[0].start;
          let curEnd = intervals[0].end;
          for(let i = 1; i < intervals.length; i++){
            const next = intervals[i];
            if(next.start <= curEnd){
              curEnd = Math.max(curEnd, next.end);
            }else{
              if(curStart > cursor){
                const interval = freeIntervalPool[freeCount] || (freeIntervalPool[freeCount] = { start: 0, end: 0 });
                interval.start = cursor;
                interval.end = curStart;
                freeIntervals[freeCount] = interval;
                freeCount += 1;
              }
              cursor = curEnd;
              curStart = next.start;
              curEnd = next.end;
            }
          }
          if(curStart > cursor){
            const interval = freeIntervalPool[freeCount] || (freeIntervalPool[freeCount] = { start: 0, end: 0 });
            interval.start = cursor;
            interval.end = curStart;
            freeIntervals[freeCount] = interval;
            freeCount += 1;
          }
          cursor = Math.max(cursor, curEnd);
          if(cursor < maxHalfWidthValue){
            const interval = freeIntervalPool[freeCount] || (freeIntervalPool[freeCount] = { start: 0, end: 0 });
            interval.start = cursor;
            interval.end = maxHalfWidthValue;
            freeIntervals[freeCount] = interval;
            freeCount += 1;
          }
        }
        freeIntervals.length = freeCount;
        if(freeIntervals.length){
          let write = 0;
          for(let i = 0; i < freeIntervals.length; i++){
            const interval = freeIntervals[i];
            if(interval.end - interval.start > 0.0001){
              freeIntervals[write] = interval;
              write += 1;
            }
          }
          freeIntervals.length = write;
        }
        let allowOverlap = false;
        if(!freeIntervals.length){
          allowOverlap = true;
          const full = freeIntervalPool[0] || (freeIntervalPool[0] = { start: 0, end: 0 });
          full.start = -maxHalfWidthValue;
          full.end = maxHalfWidthValue;
          freeIntervals[0] = full;
          freeIntervals.length = 1;
        }
        let totalFree = 0;
        for(let i = 0; i < freeIntervals.length; i++){
          totalFree += (freeIntervals[i].end - freeIntervals[i].start);
        }
        if(!Number.isFinite(totalFree) || totalFree <= 0){
          return null;
        }
        let rng = (jitters[index] ^ (seedBase + idx * 2654435761)) >>> 0;
        const nextRand = () => {
          rng = (rng * 1664525 + 1013904223) >>> 0;
          return rng / 4294967295;
        };
        candidates.length = 0;
        const addCandidate = cand => {
          if(Number.isFinite(cand)){
            candidates.push(cand);
          }
        };
        let preferredOffset = null;
        if(preferSymmetric){
          const gapLimit = groupSize > 1 ? (maxHalfWidthValue * 2) / Math.max(1, groupSize - 1) : 0;
          const preferredGap = Math.min(collisionDistance, Number.isFinite(gapLimit) && gapLimit > 0 ? gapLimit : collisionDistance);
          const centerIndex = (groupSize - 1) / 2;
          preferredOffset = (groupIndex - centerIndex) * preferredGap;
          if(!Number.isFinite(preferredOffset)){
            preferredOffset = 0;
          }
          if(preferredOffset > maxHalfWidthValue){
            preferredOffset = maxHalfWidthValue;
          }else if(preferredOffset < -maxHalfWidthValue){
            preferredOffset = -maxHalfWidthValue;
          }
          addCandidate(preferredOffset);
        }
        for(let i = 0; i < candidateCount; i++){
          const u = nextRand();
          let target = u * totalFree;
          for(let k = 0; k < freeIntervals.length; k++){
            const interval = freeIntervals[k];
            const length = interval.end - interval.start;
            if(target <= length || k === freeIntervals.length - 1){
              const cand = interval.start + Math.min(length, Math.max(0, target));
              addCandidate(cand);
              break;
            }
            target -= length;
          }
        }
        if(allowOverlap){
          addCandidate(-maxHalfWidthValue);
          addCandidate(maxHalfWidthValue);
        }
        for(let k = 0; k < freeIntervals.length; k++){
          const interval = freeIntervals[k];
          if(!evenGroup && interval.start <= 0 && interval.end >= 0){
            addCandidate(0);
            break;
          }
        }
        if(!candidates.length){
          return null;
        }
        if(evenGroup){
          const zeroEps = 0.0001;
          let write = 0;
          for(let i = 0; i < candidates.length; i++){
            const cand = candidates[i];
            if(Math.abs(cand) > zeroEps){
              candidates[write] = cand;
              write += 1;
            }
          }
          if(write){
            candidates.length = write;
          }
        }
        let bestScore = -Infinity;
        let bestAbs = Infinity;
        let bestPreferredDist = Infinity;
        let chosenLocal = null;
        for(let i = 0; i < candidates.length; i++){
          const cand = candidates[i];
          let minDistSq = Infinity;
          for(let j = activeStart; j < placedCount; j++){
            const dx = cand - placedOffset[j];
            const dy = coord - placedCoord[j];
            const distSq = dx * dx + dy * dy;
            if(distSq < minDistSq){
              minDistSq = distSq;
              if(bestScore > -Infinity && minDistSq <= bestScore - 0.0001){
                break;
              }
              if(distSq <= 0){
                break;
              }
            }
          }
          const abs = Math.abs(cand);
          const preferredDist = Number.isFinite(preferredOffset) ? Math.abs(cand - preferredOffset) : Infinity;
          const scoreDelta = minDistSq - bestScore;
          if(scoreDelta > 0.0001){
            bestScore = minDistSq;
            bestAbs = abs;
            bestPreferredDist = preferredDist;
            chosenLocal = cand;
            continue;
          }
          if(Math.abs(scoreDelta) <= 0.0001){
            if(preferSymmetric && preferredDist + 0.0001 < bestPreferredDist){
              bestScore = minDistSq;
              bestAbs = abs;
              bestPreferredDist = preferredDist;
              chosenLocal = cand;
              continue;
            }
            if((!preferSymmetric || Math.abs(preferredDist - bestPreferredDist) <= 0.0001) && abs < bestAbs){
              bestScore = minDistSq;
              bestAbs = abs;
              bestPreferredDist = preferredDist;
              chosenLocal = cand;
              continue;
            }
          }
        }
        return chosenLocal;
      };
      let chosen = resolveOffset(maxHalfWidth);
      if(chosen == null && widthScaleMode !== 'density' && maxHalfWidth < globalMaxHalfWidth){
        chosen = resolveOffset(globalMaxHalfWidth);
        maxHalfWidth = globalMaxHalfWidth;
      }
      if(chosen == null){
        chosen = Math.max(-maxHalfWidth, Math.min(maxHalfWidth, 0));
      }
      offsetsByIndex[index] = chosen;
      placedCoord[placedCount] = coord;
      placedOffset[placedCount] = chosen;
      placedCount += 1;
      const abs = Math.abs(chosen);
      if(abs > maxUsed){
        maxUsed = abs;
      }
    }
    if(pairBuckets.length){
      for(let i = 0; i < pairBuckets.length; i++){
        centerBuckets.push(pairBuckets[i]);
      }
    }
    if(centerBuckets.length){
      for(let b = 0; b < centerBuckets.length; b++){
        const bucket = centerBuckets[b];
        if(!Array.isArray(bucket) || bucket.length <= 1){
          continue;
        }
        let sum = 0;
        let minShift = -Infinity;
        let maxShift = Infinity;
        for(let i = 0; i < bucket.length; i++){
          const index = bucket[i];
          const offset = offsetsByIndex[index] || 0;
          sum += offset;
          const limit = Number.isFinite(maxHalfWidthByIndex[index])
            ? maxHalfWidthByIndex[index]
            : globalMaxHalfWidth;
          if(Number.isFinite(limit) && limit > 0){
            minShift = Math.max(minShift, -limit - offset);
            maxShift = Math.min(maxShift, limit - offset);
          }
        }
        const meanOffset = sum / bucket.length;
        let shift = -meanOffset;
        if(Number.isFinite(minShift) && Number.isFinite(maxShift)){
          shift = Math.max(minShift, Math.min(maxShift, shift));
        }
        if(!Number.isFinite(shift) || Math.abs(shift) < 0.0001){
          continue;
        }
        for(let i = 0; i < bucket.length; i++){
          const index = bucket[i];
          offsetsByIndex[index] = (offsetsByIndex[index] || 0) + shift;
        }
      }
      maxUsed = 0;
      for(let i = 0; i < offsetsByIndex.length; i++){
        const value = offsetsByIndex[i];
        if(!Number.isFinite(value)){
          continue;
        }
        const abs = Math.abs(value || 0);
        if(abs > maxUsed){
          maxUsed = abs;
        }
      }
    }
    const offsets = new Array(entryCount);
    if(isCompact){
      for(let i = 0; i < entryCount; i++){
        offsets[i] = offsetsByIndex[i] || 0;
      }
    }else{
      for(let i = 0; i < entries.length; i++){
        const entry = entries[i];
        offsets[i] = offsetsByIndex[entry.index] || 0;
      }
    }
    if(debugEnabled){
      console.debug('Debug: computeSwarmOffsets density', { orientation, sampleSize, spreadFactor, axisSpacing, axisBoundary, globalMaxHalfWidth, maxOffsetUsed: maxUsed, pointCount: entryCount, maxBinSize: maxCount, adjustedRadius: pointRadiusValue, densityDistance, basePointRadius });
    }
    return { offsets, maxOffsetUsed: maxUsed, spreadFactor, maxOffset: globalMaxHalfWidth, adjustedRadius: pointRadiusValue };
  }
  function collectGroupedMomentInfo(data){
    const I = data.groupsCount;
    const J = data.conditionsCount;
    const K = data.rowsWithData;
    if(I === 0 || J === 0 || K === 0){
      return { ok: false, message: 'Insufficient data for grouped statistics.', detail: { groups: I, conditions: J, rows: K } };
    }
    const cellMeans = Array.from({ length: I }, () => Array(J).fill(0));
    const totalsByGroup = new Array(I).fill(0);
    const totalsByCondition = new Array(J).fill(0);
    let grandTotal = 0;
    let sse = 0;
    let balanced = true;
    let mismatch = null;
    for(let i = 0; i < I; i++){
      for(let j = 0; j < J; j++){
        const arr = data.cellData[i][j];
        if(arr.length !== K){
          balanced = false;
          mismatch = { groupIndex: i, conditionIndex: j, count: arr.length, expected: K };
        }
        const sum = arr.reduce((acc, val) => acc + val, 0);
        const meanVal = arr.length ? sum / arr.length : 0;
        cellMeans[i][j] = meanVal;
        totalsByGroup[i] += sum;
        totalsByCondition[j] += sum;
        grandTotal += sum;
        sse += arr.reduce((acc, val) => acc + Math.pow(val - meanVal, 2), 0);
      }
    }
    if(!balanced){
      return { ok: false, message: 'Each group/condition combination must contain the same number of complete rows.', detail: mismatch };
    }
    const N = I * J * K;
    const grandMean = grandTotal / N;
    const meanByGroup = totalsByGroup.map(sum => sum / (J * K));
    const meanByCondition = totalsByCondition.map(sum => sum / (I * K));
    let ssa = 0;
    for(let i = 0; i < I; i++){
      ssa += Math.pow(meanByGroup[i] - grandMean, 2);
    }
    ssa *= J * K;
    let ssb = 0;
    for(let j = 0; j < J; j++){
      ssb += Math.pow(meanByCondition[j] - grandMean, 2);
    }
    ssb *= I * K;
    let ssab = 0;
    for(let i = 0; i < I; i++){
      for(let j = 0; j < J; j++){
        ssab += Math.pow(cellMeans[i][j] - meanByGroup[i] - meanByCondition[j] + grandMean, 2);
      }
    }
    ssab *= K;
    const subjectMeans = new Array(K).fill(0);
    const asMeans = Array.from({ length: I }, () => Array(K).fill(0));
    const bsMeans = Array.from({ length: J }, () => Array(K).fill(0));
    let sstotal = 0;
    for(let k = 0; k < K; k++){
      let subjectSum = 0;
      for(let i = 0; i < I; i++){
        let rowSumForGroup = 0;
        for(let j = 0; j < J; j++){
          const value = data.rows[k][i][j];
          subjectSum += value;
          rowSumForGroup += value;
          sstotal += Math.pow(value - grandMean, 2);
        }
        asMeans[i][k] = rowSumForGroup / J;
      }
      subjectMeans[k] = subjectSum / (I * J);
    }
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        let rowSumForCondition = 0;
        for(let i = 0; i < I; i++){
          rowSumForCondition += data.rows[k][i][j];
        }
        bsMeans[j][k] = rowSumForCondition / I;
      }
    }
    return {
      ok: true,
      I,
      J,
      K,
      cellMeans,
      meanByGroup,
      meanByCondition,
      subjectMeans,
      asMeans,
      bsMeans,
      grandMean,
      ssa,
      ssb,
      ssab,
      sse,
      sstotal
    };
  }

  function analyzeTwoWayAnova(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, ssa, ssb, ssab, sse } = base;
    if(I < 2 || J < 2){
      return { ok: false, message: 'Two-way ANOVA requires at least two groups and two conditions.' };
    }
    if(K < 2){
      return { ok: false, message: 'Two-way ANOVA requires at least two complete rows.' };
    }
    const dfA = I - 1;
    const dfB = J - 1;
    const dfAB = (I - 1) * (J - 1);
    const dfError = I * J * (K - 1);
    if(dfError <= 0){
      return { ok: false, message: 'Two-way ANOVA requires at least two replicates per group/condition combination.' };
    }
    const msa = ssa / dfA;
    const msb = ssb / dfB;
    const msab = ssab / dfAB;
    const mse = sse / dfError;
    const fA = mse > 0 ? msa / mse : NaN;
    const fB = mse > 0 ? msb / mse : NaN;
    const fAB = mse > 0 ? msab / mse : NaN;
    const pA = Number.isFinite(fA) ? fUpperTailPValue(fA, dfA, dfError) : NaN;
    const pB = Number.isFinite(fB) ? fUpperTailPValue(fB, dfB, dfError) : NaN;
    const pAB = Number.isFinite(fAB) ? fUpperTailPValue(fAB, dfAB, dfError) : NaN;
    return {
      ok: true,
      caption: 'Two-way ANOVA',
      section: 'summary',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'p-value', align: 'right', inferenceRole: 'overall' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: createPValueCell(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: createPValueCell(pB) },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: createPValueCell(pAB) },
        { source: 'Error', df: String(dfError), ss: formatStatNumber(sse), ms: formatStatNumber(mse), f: '-', p: '-' }
      ],
      options: { fileName: 'box-two-way-anova', contextLabel: 'box-grouped-anova2' },
      footnotes: ['F-tests use the pooled within-cell error term.'],
      diagnostics: { dfA, dfB, dfAB, dfError }
    };
  }

  function stableFiniteMean(values){
    if(!Array.isArray(values) || !values.length || values.some(value=>!Number.isFinite(value))){
      return null;
    }
    const origin=values[0];
    let deviationScale=0;
    const deviations=new Array(values.length);
    let finiteDifferences=true;
    for(let index=0;index<values.length;index++){
      const deviation=values[index]-origin;
      if(!Number.isFinite(deviation)){
        finiteDifferences=false;
        break;
      }
      deviations[index]=deviation;
      deviationScale=Math.max(deviationScale,Math.abs(deviation));
    }
    if(finiteDifferences){
      if(deviationScale===0) return origin;
      let scaledTotal=0;
      let compensation=0;
      for(const deviation of deviations){
        const adjusted=deviation/deviationScale-compensation;
        const next=scaledTotal+adjusted;
        compensation=(next-scaledTotal)-adjusted;
        scaledTotal=next;
      }
      const result=origin+deviationScale*(scaledTotal/values.length);
      if(Number.isFinite(result)) return result;
    }

    let scale=0;
    values.forEach(value=>{ scale=Math.max(scale,Math.abs(value)); });
    if(scale===0) return 0;
    let scaledTotal=0;
    let compensation=0;
    values.forEach(value=>{
      const adjusted=value/scale-compensation;
      const next=scaledTotal+adjusted;
      compensation=(next-scaledTotal)-adjusted;
      scaledTotal=next;
    });
    const result=scale*(scaledTotal/values.length);
    return Number.isFinite(result)?result:null;
  }

  function validateRowRandomRepeatedMeasuresData(data){
    const groupsCount=Number(data?.groupsCount);
    const conditionsCount=Number(data?.conditionsCount);
    const subjectCount=Number(data?.rowsWithData);
    const rows=Array.isArray(data?.rows)?data.rows:null;
    if(!Number.isSafeInteger(groupsCount) || groupsCount<2
      || !Number.isSafeInteger(conditionsCount) || conditionsCount<2
      || !Number.isSafeInteger(subjectCount) || subjectCount<2){
      return { ok:false,message:'The row-random repeated-measures model requires at least two groups, two conditions, and two complete subjects.' };
    }
    const cellCount=groupsCount*conditionsCount;
    if(!Number.isSafeInteger(cellCount) || !Number.isSafeInteger(cellCount*subjectCount)){
      return { ok:false,message:'The row-random repeated-measures design dimensions exceed the supported numeric range.' };
    }
    if(!rows || rows.length!==subjectCount){
      return { ok:false,message:'The declared complete-subject count does not match the prepared repeated-measures rows.' };
    }
    for(let subject=0;subject<subjectCount;subject++){
      const subjectRow=rows[subject];
      if(!Array.isArray(subjectRow) || subjectRow.length!==groupsCount){
        return { ok:false,message:`Complete subject row ${subject+1} has an invalid group dimension.` };
      }
      for(let group=0;group<groupsCount;group++){
        const cell=subjectRow[group];
        if(!Array.isArray(cell) || cell.length!==conditionsCount
          || cell.some(value=>typeof value!=='number' || !Number.isFinite(value))){
          return { ok:false,message:`Complete subject row ${subject+1} contains a missing, non-numeric, or misaligned group/condition value.` };
        }
      }
    }
    const excluded=Number(data?.partialRowsSkipped);
    return {
      ok:true,
      rows,
      subjectCount,
      groupsCount,
      conditionsCount,
      excludedIncompleteSubjects:Number.isSafeInteger(excluded) && excluded>0?excluded:0
    };
  }

  function projectRowRandomEffect(rows,groupBasis,conditionBasis,effect){
    const subjectCount=rows.length;
    const groupsCount=groupBasis.length;
    const conditionsCount=conditionBasis.length;
    const groupDimension=groupsCount-1;
    const conditionDimension=conditionsCount-1;
    const dimension=effect==='group'?groupDimension:(effect==='condition'?conditionDimension:groupDimension*conditionDimension);
    const scores=Array.from({ length:subjectCount },()=>new Array(dimension).fill(0));
    for(let subject=0;subject<subjectCount;subject++){
      const values=rows[subject].flat();
      const subjectMean=stableFiniteMean(values);
      if(subjectMean===null) return { ok:false,message:'A subject mean is outside the finite numeric range.' };
      const centered=[];
      let scale=0;
      for(let group=0;group<groupsCount;group++){
        for(let condition=0;condition<conditionsCount;condition++){
          const value=rows[subject][group][condition]-subjectMean;
          if(!Number.isFinite(value)) return { ok:false,message:'Centering a subject row exceeded the finite numeric range.' };
          centered.push(value);
          scale=Math.max(scale,Math.abs(value));
        }
      }
      if(scale===0) continue;
      let coordinate=0;
      if(effect==='group'){
        for(let groupContrast=0;groupContrast<groupDimension;groupContrast++){
          let sum=0;
          let compensation=0;
          for(let group=0;group<groupsCount;group++){
            for(let condition=0;condition<conditionsCount;condition++){
              const term=(centered[group*conditionsCount+condition]/scale)
                *groupBasis[group][groupContrast]/Math.sqrt(conditionsCount);
              const adjusted=term-compensation;
              const next=sum+adjusted;
              compensation=(next-sum)-adjusted;
              sum=next;
            }
          }
          scores[subject][coordinate]=scale*sum;
          if(!Number.isFinite(scores[subject][coordinate])) return { ok:false,message:'A group contrast exceeded the finite numeric range.' };
          coordinate++;
        }
      }else if(effect==='condition'){
        for(let conditionContrast=0;conditionContrast<conditionDimension;conditionContrast++){
          let sum=0;
          let compensation=0;
          for(let group=0;group<groupsCount;group++){
            for(let condition=0;condition<conditionsCount;condition++){
              const term=(centered[group*conditionsCount+condition]/scale)
                *conditionBasis[condition][conditionContrast]/Math.sqrt(groupsCount);
              const adjusted=term-compensation;
              const next=sum+adjusted;
              compensation=(next-sum)-adjusted;
              sum=next;
            }
          }
          scores[subject][coordinate]=scale*sum;
          if(!Number.isFinite(scores[subject][coordinate])) return { ok:false,message:'A condition contrast exceeded the finite numeric range.' };
          coordinate++;
        }
      }else{
        for(let groupContrast=0;groupContrast<groupDimension;groupContrast++){
          for(let conditionContrast=0;conditionContrast<conditionDimension;conditionContrast++){
            let sum=0;
            let compensation=0;
            for(let group=0;group<groupsCount;group++){
              for(let condition=0;condition<conditionsCount;condition++){
                const term=(centered[group*conditionsCount+condition]/scale)
                  *groupBasis[group][groupContrast]*conditionBasis[condition][conditionContrast];
                const adjusted=term-compensation;
                const next=sum+adjusted;
                compensation=(next-sum)-adjusted;
                sum=next;
              }
            }
            scores[subject][coordinate]=scale*sum;
            if(!Number.isFinite(scores[subject][coordinate])) return { ok:false,message:'An interaction contrast exceeded the finite numeric range.' };
            coordinate++;
          }
        }
      }
    }
    return { ok:true,scores,dimension };
  }

  function computeRepeatedEffectResult(scores,dimension){
    const subjectCount=scores.length;
    const df1=dimension;
    const df2=dimension*(subjectCount-1);
    const meanScores=new Array(dimension).fill(0);
    for(let coordinate=0;coordinate<dimension;coordinate++){
      const values=scores.map(row=>row[coordinate]);
      const value=stableFiniteMean(values);
      if(value===null) return null;
      meanScores[coordinate]=value;
    }
    let ssEffect=0;
    let ssError=0;
    for(let subject=0;subject<subjectCount;subject++){
      for(let coordinate=0;coordinate<dimension;coordinate++){
        const deviation=scores[subject][coordinate]-meanScores[coordinate];
        const errorTerm=deviation*deviation;
        if(!Number.isFinite(deviation) || !Number.isFinite(errorTerm)) return null;
        ssError+=errorTerm;
        if(!Number.isFinite(ssError)) return null;
      }
    }
    for(const value of meanScores){
      const effectTerm=subjectCount*value*value;
      if(!Number.isFinite(effectTerm)) return null;
      ssEffect+=effectTerm;
      if(!Number.isFinite(ssEffect)) return null;
    }
    const msEffect=ssEffect/df1;
    const msError=ssError/df2;
    const partialScale=Math.max(ssEffect,ssError);
    const partialEtaSquared=partialScale>0
      ? (ssEffect/partialScale)/((ssEffect/partialScale)+(ssError/partialScale))
      : null;
    const f=msError>0?msEffect/msError:null;
    const validF=Number.isFinite(f)?f:null;
    const pUncorrected=validF!==null?fUpperTailPValue(validF,df1,df2):null;
    const sphericity=computeContrastSpaceSphericity(scores);
    const ggDf1=sphericity.ggAvailable?sphericity.ggEpsilon*df1:null;
    const ggDf2=sphericity.ggAvailable?sphericity.ggEpsilon*df2:null;
    const hfDf1=sphericity.hfAvailable?sphericity.hfEpsilon*df1:null;
    const hfDf2=sphericity.hfAvailable?sphericity.hfEpsilon*df2:null;
    const ggP=sphericity.ggAvailable && validF!==null?fUpperTailPValue(validF,ggDf1,ggDf2):null;
    const hfP=sphericity.hfAvailable && validF!==null?fUpperTailPValue(validF,hfDf1,hfDf2):null;
    const ggAvailable=sphericity.ggAvailable && Number.isFinite(ggP);
    const hfAvailable=sphericity.hfAvailable && Number.isFinite(hfP);
    const reason=ssError>0
      ? (ggAvailable?null:(sphericity.ggReason || 'corrected-inference-unavailable'))
      : 'zero-within-subject-error-variance';
    const gg={
      available:ggAvailable,
      reason:ggAvailable?null:reason,
      epsilon:ggAvailable?sphericity.ggEpsilon:null,
      df1:ggAvailable?ggDf1:null,
      df2:ggAvailable?ggDf2:null,
      p:ggAvailable?ggP:null
    };
    const hf={
      available:hfAvailable,
      reason:hfAvailable?null:(ssError>0?(sphericity.hfReason || 'corrected-inference-unavailable'):reason),
      epsilon:hfAvailable?sphericity.hfEpsilon:null,
      df1:hfAvailable?hfDf1:null,
      df2:hfAvailable?hfDf2:null,
      p:hfAvailable?hfP:null
    };
    const primaryMethod=ggAvailable
      ? (dimension===1?'uncorrected-equivalent-df1':'greenhouse-geisser')
      : 'unavailable';
    return {
      available:ggAvailable,
      reason,
      contrastDimension:dimension,
      ssEffect,
      ssError,
      df1,
      df2,
      msEffect:Number.isFinite(msEffect)?msEffect:null,
      msError:Number.isFinite(msError)?msError:null,
      f:validF,
      pUncorrected:Number.isFinite(pUncorrected)?pUncorrected:null,
      partialEtaSquared:Number.isFinite(partialEtaSquared)?partialEtaSquared:null,
      primaryP:ggAvailable?ggP:null,
      primaryMethod,
      gg,
      hf
    };
  }

  function buildRowRandomCorrectionTable(repeatedMeasures){
    const effects=repeatedMeasures.effects;
    const labels={group:'Group',condition:'Condition',interaction:'Group × Condition'};
    const rows=Object.keys(labels).map(key=>{
      const effect=effects[key];
      return {
        effect:labels[key],
        df1:formatStatNumber(effect.df1,0),
        df2:formatStatNumber(effect.df2,0),
        epsilonGG:formatStatNumber(effect.gg.epsilon),
        df1GG:formatStatNumber(effect.gg.df1),
        df2GG:formatStatNumber(effect.gg.df2),
        pGG:createPValueCell(effect.gg.p),
        epsilonHF:formatStatNumber(effect.hf.epsilon),
        df1HF:formatStatNumber(effect.hf.df1),
        df2HF:formatStatNumber(effect.hf.df2),
        pHF:createPValueCell(effect.hf.p),
        pUncorrected:createPValueCell(effect.pUncorrected),
        ggAvailable:effect.gg.available,
        hfAvailable:effect.hf.available,
        reason:effect.reason
      };
    });
    return {
      ok:true,
      caption:'Effect-specific sphericity corrections',
      section:'summary',
      columns:[
        {key:'effect',label:'Effect',align:'left'},
        {key:'df1',label:'Uncorrected df1',align:'right'},
        {key:'df2',label:'Uncorrected df2',align:'right'},
        {key:'epsilonGG',label:'εGG',align:'right'},
        {key:'df1GG',label:'GG df1',align:'right'},
        {key:'df2GG',label:'GG df2',align:'right'},
        {key:'pGG',label:'p (GG primary)',align:'right'},
        {key:'epsilonHF',label:'εHF',align:'right'},
        {key:'df1HF',label:'HF df1',align:'right'},
        {key:'df2HF',label:'HF df2',align:'right'},
        {key:'pHF',label:'p (HF supplementary)',align:'right'},
        {key:'pUncorrected',label:'p (uncorrected reference)',align:'right'}
      ],
      rows,
      options:{fileName:'box-row-random-sphericity',contextLabel:'box-row-random-sphericity-corrections'},
      footnotes:[
        'Greenhouse–Geisser corrected degrees of freedom and p-values are the primary within-subject inference; Huynh–Feldt values are supplementary.',
        'Uncorrected p-values are shown only as a labelled reference. The three effect corrections are not a multiple-comparison adjustment.'
      ],
      methodVersion:repeatedMeasures.schemaVersion
    };
  }

  function analyzeTwoWayMixed(data){
    const prepared=validateRowRandomRepeatedMeasuresData(data);
    if(!prepared.ok) return prepared;
    if(!global.jStat) return {ok:false,message:'Statistics unavailable (jStat missing).'};
    const {rows,subjectCount,groupsCount,conditionsCount,excludedIncompleteSubjects}=prepared;
    const groupBasis=buildOrthonormalHelmert(groupsCount);
    const conditionBasis=buildOrthonormalHelmert(conditionsCount);
    const groupProjection=projectRowRandomEffect(rows,groupBasis,conditionBasis,'group');
    const conditionProjection=projectRowRandomEffect(rows,groupBasis,conditionBasis,'condition');
    const interactionProjection=projectRowRandomEffect(rows,groupBasis,conditionBasis,'interaction');
    for(const projection of [groupProjection,conditionProjection,interactionProjection]){
      if(!projection.ok) return {ok:false,message:projection.message};
    }
    const group=computeRepeatedEffectResult(groupProjection.scores,groupProjection.dimension);
    const condition=computeRepeatedEffectResult(conditionProjection.scores,conditionProjection.dimension);
    const interaction=computeRepeatedEffectResult(interactionProjection.scores,interactionProjection.dimension);
    if(!group || !condition || !interaction){
      return {ok:false,message:'The row-random repeated-measures sums of squares exceeded the finite numeric range.'};
    }
    const subjectMeans=rows.map(subject=>stableFiniteMean(subject.flat()));
    if(subjectMeans.some(value=>value===null)) return {ok:false,message:'A subject mean is outside the finite numeric range.'};
    const grandMean=stableFiniteMean(subjectMeans);
    if(grandMean===null) return {ok:false,message:'The grand mean is outside the finite numeric range.'};
    const subjectResiduals=subjectMeans.map(value=>value-grandMean);
    let ssSubject=0;
    for(const residual of subjectResiduals){
      const term=groupsCount*conditionsCount*residual*residual;
      if(!Number.isFinite(term) || !Number.isFinite(ssSubject+term)){
        return {ok:false,message:'The row effect sum of squares exceeded the finite numeric range.'};
      }
      ssSubject+=term;
    }
    const dfSubject=subjectCount-1;
    const dfGroupRow=group.df2;
    const dfConditionRow=condition.df2;
    const dfInteractionRow=interaction.df2;
    const repeatedMeasures={
      schemaVersion:'box-row-random-sphericity-v1',
      methodVersion:BOX_ROW_RANDOM_SPHERICITY_VERSION,
      design:'fully-crossed-within-subjects',
      subjectCount,
      groupsCount,
      conditionsCount,
      excludedIncompleteSubjects,
      primaryCorrection:'greenhouse-geisser',
      effects:{group,condition,interaction}
    };
    const mainRows=[
      {source:'Group',effect:group,df:group.df1},
      {source:'Condition',effect:condition,df:condition.df1},
      {source:'Group × Condition',effect:interaction,df:interaction.df1}
    ].map(({source,effect,df})=>({
      source,
      df:String(df),
      ss:formatStatNumber(effect.ssEffect),
      ms:formatStatNumber(effect.msEffect),
      f:formatStatNumber(effect.f),
      p:createPValueCell(effect.primaryP),
      etaP2:formatStatNumber(effect.partialEtaSquared)
    }));
    const mainTable={
      ok:true,
      caption:'Two-way repeated-measures ANOVA (rows random)',
      section:'summary',
      columns:[
        {key:'source',label:'Source',align:'left'},
        {key:'df',label:'df (uncorrected)',align:'right'},
        {key:'ss',label:'SS',align:'right'},
        {key:'ms',label:'MS (uncorrected)',align:'right'},
        {key:'f',label:'F',align:'right'},
        {key:'p',label:'p-value (GG primary)',align:'right',inferenceRole:'overall'},
        {key:'etaP2',label:'ηp²',align:'right'}
      ],
      rows:[
        ...mainRows,
        {source:'Row (random)',df:String(dfSubject),ss:formatStatNumber(ssSubject),ms:formatStatNumber(ssSubject/dfSubject),f:'-',p:'-',etaP2:'-'},
        {source:'Group × Row',df:String(dfGroupRow),ss:formatStatNumber(group.ssError),ms:formatStatNumber(group.msError),f:'-',p:'-',etaP2:'-'},
        {source:'Condition × Row',df:String(dfConditionRow),ss:formatStatNumber(condition.ssError),ms:formatStatNumber(condition.msError),f:'-',p:'-',etaP2:'-'},
        {source:'Group × Condition × Row',df:String(dfInteractionRow),ss:formatStatNumber(interaction.ssError),ms:formatStatNumber(interaction.msError),f:'-',p:'-',etaP2:'-'}
      ],
      options:{fileName:'box-row-random-repeated-measures',contextLabel:'box-grouped-row-random-repeated-measures'},
      footnotes:[
        `Each complete subject row contributes all ${groupsCount*conditionsCount} Group × Condition measurements; N = ${subjectCount} independent subjects.`,
        'The subject-by-effect interactions are the corresponding within-subject error terms. Raw sums of squares, mean squares, and displayed degrees of freedom are uncorrected.',
        'Greenhouse–Geisser corrected p-values are primary; Huynh–Feldt results are supplementary. No formal sphericity test is performed.'
      ],
      diagnostics:{subjectCount,dfSubject,dfGroup:group.df1,dfGroupRow,dfCondition:condition.df1,dfConditionRow,dfInteraction:interaction.df1,dfInteractionRow}
    };
    return {
      ok:true,
      caption:mainTable.caption,
      section:'summary',
      table:mainTable,
      correctionTable:buildRowRandomCorrectionTable(repeatedMeasures),
      repeatedMeasures
    };
  }

  function analyzeNestedRepeatedTwoWay(data){
    const groupsCount = Math.trunc(Number(data?.groupsCount) || 0);
    const conditionsCount = Math.trunc(Number(data?.conditionsCount) || 0);
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    if(groupsCount < 2 || conditionsCount !== 2){
      return { ok: false, message: 'The nested repeated-measures ANOVA requires at least two independent groups and exactly two repeated conditions.' };
    }
    if(Number(data?.partialRowsSkipped || 0) > 0 || rows.length < 2 || Number(data?.rowsWithData || rows.length) !== rows.length){
      return { ok: false, message: 'The nested repeated-measures ANOVA requires complete data with the same number of subjects in every group.' };
    }
    const observations = Array.from({ length: groupsCount }, () => []);
    for(let rowIndex = 0; rowIndex < rows.length; rowIndex++){
      const row = rows[rowIndex];
      if(!Array.isArray(row) || row.length < groupsCount){
        return { ok: false, message: 'Grouped data are incomplete for the nested repeated-measures ANOVA.' };
      }
      for(let groupIndex = 0; groupIndex < groupsCount; groupIndex++){
        const cell = row[groupIndex];
        if(!Array.isArray(cell) || cell.length !== 2 || !Number.isFinite(Number(cell[0])) || !Number.isFinite(Number(cell[1]))){
          return { ok: false, message: 'Every subject must have numeric observations for both conditions in every group.' };
        }
        observations[groupIndex].push([Number(cell[0]), Number(cell[1])]);
      }
    }
    const subjectsPerGroup = rows.length;
    if(observations.some(group => group.length !== subjectsPerGroup)){
      return { ok: false, message: 'The nested repeated-measures ANOVA requires equal subject counts across groups.' };
    }
    const observationCount = groupsCount * subjectsPerGroup * conditionsCount;
    const grandMean = observations.flat(2).reduce((sum, value) => sum + value, 0) / observationCount;
    const centered = observations.map(group => group.map(pair => pair.map(value => value - grandMean)));
    const subjectMeansByGroup = centered.map(group => group.map(pair => (pair[0] + pair[1]) / 2));
    const groupMeans = subjectMeansByGroup.map(values => values.reduce((sum, value) => sum + value, 0) / subjectsPerGroup);
    const groupMeanGrand = groupMeans.reduce((sum, value) => sum + value, 0) / groupsCount;
    const ssGroup = conditionsCount * subjectsPerGroup * groupMeans.reduce((sum, value) => sum + ((value - groupMeanGrand) ** 2), 0);
    let ssSubjectsWithinGroup = 0;
    for(let groupIndex = 0; groupIndex < groupsCount; groupIndex++){
      subjectMeansByGroup[groupIndex].forEach(value => {
        ssSubjectsWithinGroup += conditionsCount * ((value - groupMeans[groupIndex]) ** 2);
      });
    }
    const differencesByGroup = centered.map(group => group.map(pair => pair[1] - pair[0]));
    const groupDifferences = differencesByGroup.map(values => values.reduce((sum, value) => sum + value, 0) / subjectsPerGroup);
    const meanDifference = groupDifferences.reduce((sum, value) => sum + value, 0) / groupsCount;
    const totalSubjects = groupsCount * subjectsPerGroup;
    const ssCondition = totalSubjects * (meanDifference ** 2) / conditionsCount;
    const ssInteraction = subjectsPerGroup * groupDifferences.reduce((sum, value) => sum + ((value - meanDifference) ** 2), 0) / conditionsCount;
    let ssSubjectCondition = 0;
    differencesByGroup.forEach((values, groupIndex) => {
      values.forEach(value => {
        ssSubjectCondition += ((value - groupDifferences[groupIndex]) ** 2) / conditionsCount;
      });
    });
    const centeredTotal = centered.flat(2).reduce((sum, value) => sum + value ** 2, 0);
    const errorTolerance = Number.EPSILON * Math.max(centeredTotal, Number.MIN_VALUE) * 64;
    if(!Number.isFinite(ssSubjectsWithinGroup) || !Number.isFinite(ssSubjectCondition)
      || ssSubjectsWithinGroup <= errorTolerance || ssSubjectCondition <= errorTolerance){
      return { ok: false, message: 'The nested repeated-measures model is not estimable because a required subject-level error term has zero or numerically negligible variance.' };
    }
    const dfGroup = groupsCount - 1;
    const dfSubject = groupsCount * (subjectsPerGroup - 1);
    const dfCondition = 1;
    const dfInteraction = groupsCount - 1;
    const dfSubjectCondition = groupsCount * (subjectsPerGroup - 1);
    const msGroup = ssGroup / dfGroup;
    const msSubject = ssSubjectsWithinGroup / dfSubject;
    const msCondition = ssCondition / dfCondition;
    const msInteraction = ssInteraction / dfInteraction;
    const msSubjectCondition = ssSubjectCondition / dfSubjectCondition;
    const fGroup = msSubject > 0 ? msGroup / msSubject : NaN;
    const fCondition = msSubjectCondition > 0 ? msCondition / msSubjectCondition : NaN;
    const fInteraction = msSubjectCondition > 0 ? msInteraction / msSubjectCondition : NaN;
    const pGroup = Number.isFinite(fGroup) ? fUpperTailPValue(fGroup, dfGroup, dfSubject) : NaN;
    const pCondition = Number.isFinite(fCondition) ? fUpperTailPValue(fCondition, dfCondition, dfSubjectCondition) : NaN;
    const pInteraction = Number.isFinite(fInteraction) ? fUpperTailPValue(fInteraction, dfInteraction, dfSubjectCondition) : NaN;
    return {
      ok: true,
      caption: 'Two-way mixed ANOVA (subjects nested within groups)',
      section: 'summary',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'p-value', align: 'right', inferenceRole: 'overall' },
        { key: 'etaP2', label: 'ηp²', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfGroup), ss: formatStatNumber(ssGroup), ms: formatStatNumber(msGroup), f: formatStatNumber(fGroup), p: createPValueCell(pGroup), etaP2: formatStatNumber(computePartialEtaSquared(ssGroup, ssSubjectsWithinGroup)) },
        { source: 'Condition', df: String(dfCondition), ss: formatStatNumber(ssCondition), ms: formatStatNumber(msCondition), f: formatStatNumber(fCondition), p: createPValueCell(pCondition), etaP2: formatStatNumber(computePartialEtaSquared(ssCondition, ssSubjectCondition)) },
        { source: 'Group × Condition', df: String(dfInteraction), ss: formatStatNumber(ssInteraction), ms: formatStatNumber(msInteraction), f: formatStatNumber(fInteraction), p: createPValueCell(pInteraction), etaP2: formatStatNumber(computePartialEtaSquared(ssInteraction, ssSubjectCondition)) },
        { source: 'Subjects within Group', df: String(dfSubject), ss: formatStatNumber(ssSubjectsWithinGroup), ms: formatStatNumber(msSubject), f: '—', p: '—', etaP2: '—' },
        { source: 'Subjects within Group × Condition', df: String(dfSubjectCondition), ss: formatStatNumber(ssSubjectCondition), ms: formatStatNumber(msSubjectCondition), f: '—', p: '—', etaP2: '—' }
      ],
      options: { fileName: 'box-nested-repeated-two-way', contextLabel: 'box-grouped-nested-repeated-two-way' },
      footnotes: [
        'Subjects are independent between groups and measured in both conditions; rows with the same position in different groups are not paired.',
        'Group is tested against Subjects within Group. Condition and Group × Condition are tested against Subjects within Group × Condition.',
        'This complete, balanced two-condition ANOVA assumes independent subjects, approximately normal residuals, and comparable group-level residual variances for subject means and within-subject differences. With two conditions, sphericity is automatic.'
      ],
      diagnostics: {
        groupsCount,
        conditionsCount,
        subjectsPerGroup,
        dfGroup,
        dfSubject,
        dfCondition,
        dfInteraction,
        dfSubjectCondition,
        ssGroup,
        ssSubjectsWithinGroup,
        ssCondition,
        ssInteraction,
        ssSubjectCondition,
        fGroup,
        fCondition,
        fInteraction,
        pGroup,
        pCondition,
        pInteraction
      }
    };
  }

  function analyzeThreeWayAnova(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, meanByGroup, meanByCondition, subjectMeans, asMeans, bsMeans, grandMean, cellMeans, ssa, ssb, ssab, sstotal } = base;
    if(I < 2 || J < 2 || K < 2){
      return { ok: false, message: 'Three-way ANOVA requires at least two groups, two conditions, and two rows.' };
    }
    let ssc = 0;
    for(let k = 0; k < K; k++){
      ssc += Math.pow(subjectMeans[k] - grandMean, 2);
    }
    ssc *= I * J;
    let ssac = 0;
    for(let i = 0; i < I; i++){
      for(let k = 0; k < K; k++){
        const term = asMeans[i][k] - meanByGroup[i] - subjectMeans[k] + grandMean;
        ssac += Math.pow(term, 2);
      }
    }
    ssac *= J;
    let ssbc = 0;
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        const term = bsMeans[j][k] - meanByCondition[j] - subjectMeans[k] + grandMean;
        ssbc += Math.pow(term, 2);
      }
    }
    ssbc *= I;
    let ssabc = 0;
    for(let i = 0; i < I; i++){
      for(let j = 0; j < J; j++){
        for(let k = 0; k < K; k++){
          const value = data.rows[k][i][j];
          const abMean = cellMeans[i][j];
          const acMean = asMeans[i][k];
          const bcMean = bsMeans[j][k];
          const term = value - abMean - acMean - bcMean + meanByGroup[i] + meanByCondition[j] + subjectMeans[k] - grandMean;
          ssabc += Math.pow(term, 2);
        }
      }
    }
    const residual = sstotal - (ssa + ssb + ssc + ssab + ssac + ssbc + ssabc);
    const dfA = I - 1;
    const dfB = J - 1;
    const dfC = K - 1;
    const dfAB = (I - 1) * (J - 1);
    const dfAC = (I - 1) * (K - 1);
    const dfBC = (J - 1) * (K - 1);
    const dfABC = (I - 1) * (J - 1) * (K - 1);
    if(dfABC <= 0){
      return { ok: false, message: 'Three-way ANOVA requires at least two rows to estimate interaction variance.' };
    }
    const msabc = ssabc / dfABC;
    const msa = ssa / dfA;
    const msb = ssb / dfB;
    const msc = ssc / dfC;
    const msab = ssab / dfAB;
    const msac = ssac / dfAC;
    const msbc = ssbc / dfBC;
    const fA = msabc > 0 ? msa / msabc : NaN;
    const fB = msabc > 0 ? msb / msabc : NaN;
    const fC = msabc > 0 ? msc / msabc : NaN;
    const fAB = msabc > 0 ? msab / msabc : NaN;
    const fAC = msabc > 0 ? msac / msabc : NaN;
    const fBC = msabc > 0 ? msbc / msabc : NaN;
    const pA = Number.isFinite(fA) ? fUpperTailPValue(fA, dfA, dfABC) : NaN;
    const pB = Number.isFinite(fB) ? fUpperTailPValue(fB, dfB, dfABC) : NaN;
    const pC = Number.isFinite(fC) ? fUpperTailPValue(fC, dfC, dfABC) : NaN;
    const pAB = Number.isFinite(fAB) ? fUpperTailPValue(fAB, dfAB, dfABC) : NaN;
    const pAC = Number.isFinite(fAC) ? fUpperTailPValue(fAC, dfAC, dfABC) : NaN;
    const pBC = Number.isFinite(fBC) ? fUpperTailPValue(fBC, dfBC, dfABC) : NaN;
    return {
      ok: true,
      caption: 'Unreplicated three-factor ANOVA (ABC interaction used as error)',
      section: 'summary',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'p-value', align: 'right', inferenceRole: 'overall' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: createPValueCell(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: createPValueCell(pB) },
        { source: 'Row', df: String(dfC), ss: formatStatNumber(ssc), ms: formatStatNumber(msc), f: formatStatNumber(fC), p: createPValueCell(pC) },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: createPValueCell(pAB) },
        { source: 'Group × Row', df: String(dfAC), ss: formatStatNumber(ssac), ms: formatStatNumber(msac), f: formatStatNumber(fAC), p: createPValueCell(pAC) },
        { source: 'Condition × Row', df: String(dfBC), ss: formatStatNumber(ssbc), ms: formatStatNumber(msbc), f: formatStatNumber(fBC), p: createPValueCell(pBC) },
        { source: 'Group × Condition × Row', df: String(dfABC), ss: formatStatNumber(ssabc), ms: formatStatNumber(msabc), f: '-', p: '-' },
        { source: 'Residual', df: '-', ss: formatStatNumber(residual), ms: '-', f: '-', p: '-' }
      ],
      options: { fileName: 'box-three-way-anova', contextLabel: 'box-grouped-anova3' },
      footnotes: ['Highest-order interaction is used as the error term for F-tests.'],
      diagnostics: { dfA, dfB, dfC, dfAB, dfAC, dfBC, dfABC }
    };
  }



  function analyzeRowWiseTTests(data, correctionMethod){
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    if(data.groupsCount < 2){
      return { ok: false, message: 'Row-wise t-tests require at least two groups.' };
    }
    const conditionLabels = data.conditionLabels;
    const tests = [];
    for(let condIdx = 0; condIdx < data.conditionsCount; condIdx++){
      for(let gA = 0; gA < data.groupsCount; gA++){
        for(let gB = gA + 1; gB < data.groupsCount; gB++){
          const sampleA = data.cellData[gA][condIdx];
          const sampleB = data.cellData[gB][condIdx];
          if(sampleA.length < 2 || sampleB.length < 2){
            continue;
          }
          const result = tTest(sampleA, sampleB);
          tests.push({
            condition: conditionLabels[condIdx] || `Condition ${condIdx + 1}`,
            groupA: data.groupLabels[gA],
            groupB: data.groupLabels[gB],
            t: result.t,
            df: result.df,
            p: result.p
          });
        }
      }
    }
    if(!tests.length){
      return { ok: false, message: 'Not enough replicates to compute row-wise t-tests.' };
    }
    const m = tests.length;
    const comparisonCorrection = resolveEffectiveComparisonCorrection(tests.map(test => test.p), correctionMethod);
    comparisonCorrection.adjustedValues.forEach((adj, idx) => {
      tests[idx].padjust = Number.isFinite(adj) ? adj : tests[idx].p;
    });
    const correctionMeta = comparisonCorrection.correctionMeta;
    const showAdjustedP = comparisonCorrection.hasAdjustment;
    return {
      ok: true,
      caption: 'Row-wise t-tests',
      section: 'comparisons',
      columns: [
        { key: 'condition', label: 'Condition', align: 'left' },
        { key: 'comparison', label: 'Comparison', align: 'left' },
        { key: 't', label: 't', align: 'right' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'p', label: 'p-value', align: 'right', inferenceRole: showAdjustedP ? 'raw' : 'comparison' },
        ...(showAdjustedP ? [{ key: 'padjust', label: formatAdjustedPLabel(comparisonCorrection.effectiveMethod, correctionMeta), align: 'right', inferenceRole: 'comparison' }] : [])
      ],
      rows: tests.map(test => ({
        condition: test.condition,
        comparison: `${test.groupA} vs ${test.groupB}`,
        t: formatStatNumber(test.t),
        df: Number.isFinite(test.df) ? formatStatNumber(test.df, 2) : '-',
        p: createPValueCell(test.p),
        ...(showAdjustedP ? { padjust: createPValueCell(test.padjust) } : {})
      })),
      options: { fileName: 'box-rowwise-ttest', contextLabel: 'box-grouped-ttests' },
      footnotes: showAdjustedP && correctionMeta.footnote ? [correctionMeta.footnote] : [],
      correctionCount: m,
      effectiveComparisonMethod: comparisonCorrection.effectiveMethod
    };
  }
  function prepareLognormalGroups(groups, label){
    const transformed=[];
    for(const group of (Array.isArray(groups)?groups:[])){
      const values=normalizeFiniteSample(group);
      if(values.some(value=>!(value>0))){
        return { ok:false,message:`${label || 'Lognormal analysis'} requires strictly positive values in every selected group.`,groups:[] };
      }
      transformed.push(values.map(Math.log));
    }
    return { ok:true,message:null,groups:transformed };
  }

  function computeLognormalRepeatedMeasuresAnova(groups, options = {}) {
    const aligned = alignCompleteRows(groups, options.rowIndicesByGroup);
    const prepared = prepareLognormalGroups(aligned.groups, 'Lognormal repeated-measures ANOVA');
    if (!prepared.ok) {
      return {
        ok: false,
        available: false,
        message: prepared.message,
        subjectCount: aligned.rows.length,
        excludedRows: aligned.excludedRows
      };
    }
    const result = computeRepeatedMeasuresAnova(prepared.groups);
    if (!result.ok) {
      return {
        ...result,
        method: 'lognormalRepeatedMeasuresAnova',
        analysisScale: 'log',
        subjectCount: aligned.rows.length,
        excludedRows: aligned.excludedRows
      };
    }
    if (result.available !== false && !Number.isFinite(result.ggP)) {
      return {
        ok: false,
        available: false,
        message: 'Greenhouse–Geisser corrected inference could not be estimated for this lognormal repeated-measures design.',
        method: 'lognormalRepeatedMeasuresAnova',
        analysisScale: 'log',
        subjectCount: aligned.rows.length,
        excludedRows: aligned.excludedRows
      };
    }
    return {
      ...result,
      method: 'lognormalRepeatedMeasuresAnova',
      analysisScale: 'log',
      reportingScale: 'geometric-mean-ratio',
      subjectCount: aligned.rows.length,
      excludedRows: aligned.excludedRows,
      geometricMeans: prepared.groups.map(group => Math.exp(mean(group)))
    };
  }

  function backTransformLogPair(pair){
    if(!pair || typeof pair!=='object'){
      return pair;
    }
    const next={...pair,differenceScale:'ratio'};
    if(Number.isFinite(pair.diff)){
      next.diff=Math.exp(pair.diff);
    }
    if(Number.isFinite(pair.ciLow)){
      next.ciLow=Math.exp(pair.ciLow);
    }
    if(Number.isFinite(pair.ciHigh)){
      next.ciHigh=Math.exp(pair.ciHigh);
    }
    return next;
  }

  function normalizePostHocResultScale(result, lognormal){
    if(!lognormal || !result || !Array.isArray(result.pairs)){
      return result;
    }
    return {
      ...result,
      pairs:result.pairs.map(backTransformLogPair),
      footnote:[result.footnote,'Differences and confidence intervals are back-transformed to geometric-mean ratios.'].filter(Boolean).join(' ')
    };
  }

  function mapBoxPostHocPairs(sourcePairs, context = {}){
    const indices = Array.isArray(context.indices) ? context.indices : [];
    const groups = Array.isArray(context.groups) ? context.groups : [];
    const labels = Array.isArray(context.labels) ? context.labels : [];
    const paramEffectMeta = context.paramEffectMeta;
    const nonParamEffectMeta = context.nonParamEffectMeta;
    const statKey = context.statKey || 'stat';
    const statName = context.statName || statKey;
    const pKey = context.pKey || 'p';
    const adjPKey = context.adjPKey || pKey;
    const method = context.method || 'postHoc';
    const paired = context.paired === true;
    return (Array.isArray(sourcePairs) ? sourcePairs : []).map(pair => {
      const ai = indices[pair.i];
      const bi = indices[pair.j];
      const effectMetrics = computeEffectSizeMetrics(groups[pair.i], groups[pair.j], { paired });
      return {
        a: pair.i,
        b: pair.j,
        ai,
        bi,
        p: pair[pKey],
        adjP: pair[adjPKey],
        stat: pair[statKey],
        statName,
        df: Number.isFinite(pair.df) ? pair.df : null,
        diff: pair.diff,
        ciLow: pair.ciLow,
        ciHigh: pair.ciHigh,
        differenceScale: pair.differenceScale || 'difference',
        labelA: labels[pair.i],
        labelB: labels[pair.j],
        effects: effectMetrics,
        effectParametric: formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta),
        effectNonParametric: formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta),
        method
      };
    });
  }

  const SINGLE_TEST_META = Object.freeze({
    oneSampleT:{ label:'One-sample t test', family:'parametric', variant:'classic' },
    oneSampleWilcoxon:{ label:'Wilcoxon signed-rank test', family:'nonparametric', variant:'wilcoxonSignedRank' },
    pairedT:{ label:'Paired t-test', family:'parametric', variant:'classic' },
    ratioT:{ label:'Ratio t-test', family:'parametric', variant:'ratioT' },
    studentT:{ label:'Unpaired t-test', family:'parametric', variant:'classic' },
    welchT:{ label:'Welch t-test', family:'parametric', variant:'welch' },
    lognormalT:{ label:'Lognormal t-test', family:'parametric', variant:'lognormalClassic' },
    lognormalWelchT:{ label:"Lognormal Welch's t-test", family:'parametric', variant:'lognormalWelch' },
    mannWhitney:{ label:'Mann-Whitney test', family:'nonparametric', variant:'mannWhitney' },
    kolmogorovSmirnov:{ label:'Kolmogorov-Smirnov test', family:'nonparametric', variant:'kolmogorovSmirnov' },
    wilcoxonSignedRank:{ label:'Wilcoxon signed-rank test', family:'nonparametric', variant:'wilcoxonSignedRank' },
    oneWayAnova:{ label:'One-way ANOVA', family:'parametric', variant:'classic' },
    welchAnova:{ label:'Welch ANOVA', family:'parametric', variant:'welch' },
    lognormalAnova:{ label:'Lognormal one-way ANOVA', family:'parametric', variant:'lognormalClassic' },
    lognormalWelchAnova:{ label:'Lognormal Welch ANOVA', family:'parametric', variant:'lognormalWelch' },
    repeatedMeasuresAnova:{ label:'Repeated-measures ANOVA', family:'parametric', variant:'classic' },
    lognormalRepeatedMeasuresAnova:{ label:'Lognormal repeated-measures ANOVA', family:'parametric', variant:'lognormalClassic' },
    kruskalWallis:{ label:'Kruskal-Wallis test', family:'nonparametric', variant:'kruskalWallis' },
    friedman:{ label:'Friedman test', family:'nonparametric', variant:'friedman' }
  });

  function resolveSingleAnalysisPlan(payload,groupCount){
    const mode=payload.statsMode || 'all';
    const family=payload.statsTest==='nonparametric' ? 'nonparametric' : 'parametric';
    const paired=mode==='oneSample' ? false : !!payload.statsPaired;
    const pairwise=mode==='reference' || mode==='custom' || groupCount<=2;
    const requested=family==='parametric'
      ? String(payload.statsParametricVariant || 'classic')
      : String(payload.statsNonParametricVariant || (paired ? (pairwise?'wilcoxonSignedRank':'friedman') : (pairwise?'mannWhitney':'kruskalWallis')));
    let id=null;
    if(mode==='oneSample'){
      id=family==='parametric' ? 'oneSampleT' : 'oneSampleWilcoxon';
    }else if(pairwise){
      if(family==='parametric' && paired){
        id=requested==='ratioT' ? 'ratioT' : requested==='classic' ? 'pairedT' : null;
      }else if(family==='parametric'){
        id=requested==='classic' ? 'studentT'
          : requested==='welch' ? 'welchT'
          : requested==='lognormalClassic' ? 'lognormalT'
          : requested==='lognormalWelch' ? 'lognormalWelchT'
          : null;
      }else if(paired){
        id=requested==='wilcoxonSignedRank' ? 'wilcoxonSignedRank' : null;
      }else{
        id=requested==='kolmogorovSmirnov' ? 'kolmogorovSmirnov'
          : requested==='mannWhitney' ? 'mannWhitney'
          : null;
      }
    }else if(family==='parametric' && paired){
      id=requested==='classic' ? 'repeatedMeasuresAnova'
        : requested==='lognormalClassic' ? 'lognormalRepeatedMeasuresAnova'
          : null;
    }else if(family==='parametric'){
      id=requested==='classic' ? 'oneWayAnova'
        : requested==='welch' ? 'welchAnova'
        : requested==='lognormalClassic' ? 'lognormalAnova'
        : requested==='lognormalWelch' ? 'lognormalWelchAnova'
        : null;
    }else if(paired){
      id=requested==='friedman' ? 'friedman' : null;
    }else{
      id=requested==='kruskalWallis' ? 'kruskalWallis' : null;
    }
    if(!id){
      return { ok:false,message:`The selected test (${requested}) is not valid for the current ${paired?'paired':'independent'} ${pairwise?'pairwise':'multi-group'} design. Choose an available test explicitly.` };
    }
    const meta=SINGLE_TEST_META[id];
    const options={
      alternative:sanitizeStatsAlternative(payload.statsAlternative),
      ciLevel:sanitizeStatsCiLevel(payload.statsCiLevel,0.95),
      resamplingMode:sanitizeResamplingMode(payload.statsResamplingMode),
      iterations:sanitizeMonteCarloIterations(payload.statsMonteCarloIterations,10000),
      seed:sanitizeStatsSeed(payload.statsSeed,1337)
    };
    let pairTest=null;
    if(id==='pairedT') pairTest=(a,b)=>tTestPaired(a,b,options);
    else if(id==='ratioT') pairTest=(a,b)=>ratioTTest(a,b,options);
    else if(id==='studentT') pairTest=(a,b)=>tTestEqualVariance(a,b,options);
    else if(id==='welchT') pairTest=(a,b)=>tTest(a,b,options);
    else if(id==='lognormalT') pairTest=(a,b)=>lognormalTTestEqualVariance(a,b,options);
    else if(id==='lognormalWelchT') pairTest=(a,b)=>lognormalWelchTTest(a,b,options);
    else if(id==='mannWhitney') pairTest=(a,b)=>mannWhitney(a,b,options);
    else if(id==='kolmogorovSmirnov') pairTest=(a,b)=>kolmogorovSmirnovTwoSample(a,b,options);
    else if(id==='wilcoxonSignedRank') pairTest=(a,b)=>wilcoxonSignedRank(a,b,options);
    else if(id==='oneWayAnova') pairTest=(a,b)=>tTestEqualVariance(a,b,options);
    else if(id==='welchAnova') pairTest=(a,b)=>tTest(a,b,options);
    else if(id==='lognormalAnova') pairTest=(a,b)=>lognormalTTestEqualVariance(a,b,options);
    else if(id==='lognormalWelchAnova') pairTest=(a,b)=>lognormalWelchTTest(a,b,options);
    else if(id==='repeatedMeasuresAnova') pairTest=(a,b)=>tTestPaired(a,b,options);
    else if(id==='lognormalRepeatedMeasuresAnova') pairTest=(a,b)=>ratioTTest(a,b,options);
    else if(id==='kruskalWallis') pairTest=(a,b)=>mannWhitney(a,b,options);
    else if(id==='friedman') pairTest=(a,b)=>wilcoxonSignedRank(a,b,options);
    const lognormal=id==='ratioT'||id==='lognormalT'||id==='lognormalWelchT'
      || id==='lognormalAnova'||id==='lognormalWelchAnova'||id==='lognormalRepeatedMeasuresAnova';
    return { ok:true,id,label:meta.label,family,variant:meta.variant,paired,pairwise,options,pairTest,lognormal };
  }

  function formatInferenceMethodLabel(method){
    const normalized=String(method || 'none').trim().toLowerCase();
    if(normalized==='none') return '';
    if(normalized==='bh') return 'Benjamini-Hochberg';
    if(normalized==='by') return 'Benjamini-Yekutieli';
    if(normalized==='dunnett-test') return 'Dunnett';
    if(normalized==='dunnett-t3-test') return 'Dunnett T3';
    const correctionMeta=resolveCorrectionMeta(normalized,2);
    if(correctionMeta?.label && correctionMeta.key===normalized){
      return correctionMeta.label;
    }
    return normalized.split('-').map(part=>part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : '').join(' ');
  }

  function describeInferenceSnapshot(snapshot){
    const parts=[];
    const overall=snapshot?.overall;
    const comparisons=snapshot?.comparisons;
    if(overall && Number.isFinite(Number(overall.level))){
      parts.push(`Overall-test decisions used α = ${formatStatNumber(Number(overall.level),4).replace(/0+$/,'').replace(/\.$/,'')}.`);
    }
    if(comparisons && Number.isFinite(Number(comparisons.level))){
      const level=formatStatNumber(Number(comparisons.level),4).replace(/0+$/,'').replace(/\.$/,'');
      const methodLabel=formatInferenceMethodLabel(comparisons.method);
      if(comparisons.criterion==='fdr'){
        parts.push(`${methodLabel || 'FDR-controlled'} pairwise discoveries used target FDR = ${level}.`);
      }else if(comparisons.errorControl==='fwer'){
        parts.push(`${methodLabel || 'Multiplicity-adjusted'} pairwise decisions used family-wise α = ${level}.`);
      }else{
        parts.push(`Pairwise decisions used α = ${level}.`);
      }
    }
    return parts;
  }

  function buildBoxStatsReport(model,payload){
    const analysis=model?.analysis || {};
    const isLognormalRepeatedMeasures=analysis.id==='lognormalRepeatedMeasuresAnova';
    const selectedLabels=(Array.isArray(payload.selection)?payload.selection:[]).map(item=>item?.label).filter(Boolean);
    const selectedGroupCount=selectedLabels.length || Number(model?.groupCount) || 0;
    const inferenceSnapshot=normalizeEffectiveInferenceSnapshot(payload,model);
    const correctionCount=Number(model?.correctionCount)||0;
    const effectiveComparisonMethod=String(model?.effectiveComparisonMethod || inferenceSnapshot?.comparisons?.method || 'none');
    const effectiveSpec=model?.effectiveAnalysisSpec || {};
    const ciLevel=Number.isFinite(Number(effectiveSpec.ciLevel))
      ? Number(effectiveSpec.ciLevel)
      : sanitizeStatsCiLevel(payload.statsCiLevel,0.95);
    const ciLevelPercent=Math.round(ciLevel*100);
    const alpha=Number.isFinite(Number(effectiveSpec.alpha))
      ? Number(effectiveSpec.alpha)
      : sanitizeStatsAlpha(payload.statsAlpha,0.05);
    const alphaText=formatStatNumber(alpha,4).replace(/0+$/,'').replace(/\.$/,'');
    const ciDescription=effectiveSpec.ciType==='sidak-adjusted-marginal'
      ? `Reported ${ciLevelPercent}% intervals used marginal t quantiles with Sidak-adjusted α across ${correctionCount} control comparisons${effectiveSpec.effectivePostHoc==='dunnettT3'?'; Welch calibration is approximate':''}.`
      : effectiveSpec.ciType==='simultaneous'
      ? `Reported ${ciLevelPercent}% confidence intervals were simultaneous for the comparison family.`
      : effectiveSpec.ciType==='nominal' && effectiveSpec.effectivePostHoc==='anovaPooled'
        ? `Reported ${ciLevelPercent}% confidence intervals were nominal and were not adjusted for multiplicity.`
        : (Array.isArray(model?.pairs) && model.pairs.some(pair=>Number.isFinite(pair?.ciLow) || Number.isFinite(pair?.ciHigh))
          ? `Reported ${ciLevelPercent}% confidence intervals were nominal per-comparison intervals.`
          : null);
    const intrinsicMethods={
      tukey:'Tukey HSD',
      'games-howell':'Games–Howell',
      'tamhane-t2':'Tamhane T2',
      nemenyi:'Nemenyi',
      'dunnett-test':'Dunnett',
      'dunnett-t3-test':'Dunnett T3',
      dunnett:'Pooled t + Sidak versus control',
      'dunnett-t3':'Welch + Sidak versus control'
    };
    let multiplicityDescription=null;
    if(correctionCount>1){
      if(intrinsicMethods[effectiveComparisonMethod]){
        multiplicityDescription=`P-values used intrinsic ${intrinsicMethods[effectiveComparisonMethod]} adjustment across ${correctionCount} comparisons (family-wise α = ${alphaText}).`;
      }else if(effectiveComparisonMethod!=='none'){
        const meta=resolveCorrectionMeta(effectiveComparisonMethod,correctionCount);
        multiplicityDescription=`P-values were adjusted across ${correctionCount} comparisons using ${meta.label}'s procedure (family-wise α = ${alphaText}).`;
      }else{
        multiplicityDescription=`No multiplicity adjustment was applied across ${correctionCount} comparisons.`;
      }
    }else if(correctionCount===1){
      const configured=String(payload.statsCorrection || DEFAULT_CORRECTION);
      multiplicityDescription=configured==='none'
        ? 'The single comparison was unadjusted.'
        : `No multiplicity adjustment was needed for the single comparison; the configured ${resolveCorrectionMeta(configured,1).label} correction was not applied.`;
    }
    const outlierMode=String(model?.outlierAudit?.mode || sanitizeOutlierMode(payload.statsOutlierMode));
    const outlierDescription=outlierMode==='none'
      ? 'No statistical outlier screening was applied.'
      : outlierMode==='grubbs'
        ? `Single-outlier Grubbs screening used family α = ${formatStatNumber(resolveStatsOutlierAlpha(payload),3)}; independent samples use Bonferroni screening.`
        : outlierMode==='routTest'
          ? `ROUT constant-location screening used Q = ${formatStatNumber(resolveStatsOutlierQ(payload),3)} per sample, with at most 30% residual exclusions.`
          : `MAD + BH heuristic flags used score cutoff q = ${formatStatNumber(resolveStatsOutlierQ(payload),3)}; all observations were retained.`;
    const outlierNotes=Array.isArray(model?.outlierAudit?.notes)?model.outlierAudit.notes:[];
    const alternative=String(effectiveSpec.effectiveAlternative || sanitizeStatsAlternative(payload.statsAlternative));
    const varianceDescriptions={
      anovaResidualMSE:'the common residual mean square of the ANOVA',
      pairSpecificPooledVariance:'a separate pooled variance for each pair',
      pairSpecificPooledVarianceOnLogScale:'a separate pooled variance for each pair on the log scale',
      pairSpecificWelchVariance:'Welch standard errors with pair-specific Satterthwaite degrees of freedom',
      pairSpecificWelchVarianceOnLogScale:'Welch standard errors and pair-specific Satterthwaite degrees of freedom on the log scale',
      pairedLogRatioVariance:'the sample variance of paired within-subject log ratios',
      groupSampleVariances:'group-specific sample variances'
    };
    const degreesOfFreedomDescription=effectiveSpec.degreesOfFreedom!=null && Number.isFinite(Number(effectiveSpec.degreesOfFreedom))
      ? ` (df = ${formatStatNumber(Number(effectiveSpec.degreesOfFreedom),2)})`
      : Array.isArray(effectiveSpec.degreesOfFreedomByComparison)
        ? ` (pair-specific df: ${effectiveSpec.degreesOfFreedomByComparison.map(item=>`${item.comparison} = ${Number.isFinite(Number(item.df))?formatStatNumber(Number(item.df),2):'unavailable'}`).join('; ')})`
        : '';
    const pairwiseDescription=effectiveSpec.effectivePostHoc==='anovaPooled'
      ? `Pairwise comparisons used two-sided t-tests based on ${varianceDescriptions[effectiveSpec.varianceEstimator] || 'the common ANOVA residual mean square'}${degreesOfFreedomDescription}.`
      : effectiveSpec.pairwiseTest && correctionCount
        ? `Pairwise comparisons used ${effectiveSpec.pairwiseTest}${varianceDescriptions[effectiveSpec.varianceEstimator] ? ` with ${varianceDescriptions[effectiveSpec.varianceEstimator]}` : ''}${degreesOfFreedomDescription}.`
        : null;
    const lognormalRepeatedMeasuresDescription=isLognormalRepeatedMeasures
      ? 'Strictly positive observations were natural-log transformed internally. The omnibus test compares mean log outcomes, which is equivalent to testing equality of geometric means; paired contrasts are reported as geometric-mean ratios with nominal, unadjusted per-comparison confidence intervals. Pairwise p-values use the reported multiplicity correction. The univariate repeated-measures model uses complete aligned subjects and assumes approximately normal errors on the log scale; its uncorrected inference assumes sphericity of within-subject contrasts. Greenhouse–Geisser corrected degrees of freedom and p-values are primary for potential nonsphericity; Huynh–Feldt results are supplementary. This workflow does not fit a general covariance structure or perform a formal sphericity test.'
      : null;
    const resamplingMode=sanitizeResamplingMode(payload.statsResamplingMode);
    const resamplingDescription=analysis.family!=='nonparametric'
      ? null
      : resamplingMode==='exact'
        ? 'Rank-based p-values requested exact calibration when a tractable exact distribution was available; otherwise the method-specific approximation was used.'
        : resamplingMode==='monte-carlo'
          ? `Rank-based tests used Monte Carlo calibration (${sanitizeMonteCarloIterations(payload.statsMonteCarloIterations,10000)} iterations).`
          : resamplingMode==='asymptotic'
            ? 'Rank-based tests used asymptotic p-values unless an exact distribution was built into the test.'
          : 'Rank-based tests used automatic calibration: exact when tractable, otherwise Monte Carlo or asymptotic methods as appropriate.';
    const configuredCorrection=String(payload.statsCorrection || DEFAULT_CORRECTION);
    const configuredCorrectionDescription=correctionCount>1 && intrinsicMethods[effectiveComparisonMethod]
      && String(resolveCorrectionMeta(configuredCorrection,correctionCount).key)!==effectiveComparisonMethod
      ? ` The configured ${resolveCorrectionMeta(configuredCorrection,correctionCount).label} correction was not applied because ${intrinsicMethods[effectiveComparisonMethod]} supplies intrinsic adjustment.`
      : '';
    const methods=[
      `${analysis.label || 'Statistical analysis'} was performed on ${selectedGroupCount} selected ${selectedGroupCount === 1 ? 'group' : 'groups'}.`,
      `The analysis used ${analysis.paired ? 'a paired' : 'an independent'} design.`,
      lognormalRepeatedMeasuresDescription,
      model?.overall ? `The omnibus ${model.overall.F!=null?'F-test':'test'} was nondirectional.` : null,
      Number.isFinite(Number(inferenceSnapshot?.overall?.level))
        ? `Omnibus-test decisions used α = ${alphaText}.`
        : null,
      pairwiseDescription,
      correctionCount ? `Pairwise alternatives were ${alternative}.` : null,
      'No equivalence or non-inferiority test is performed; failure to reject a difference does not establish equivalence.',
      multiplicityDescription ? `${multiplicityDescription}${configuredCorrectionDescription}` : null,
      ciDescription,
      resamplingDescription,
      model?.overall?.method==='friedman' ? model.overall.footnote : null,
      outlierDescription,
      ...outlierNotes
    ].filter(Boolean);
    const results=[];
    if(model?.overall){
      const overall=model.overall;
      const stat=Number.isFinite(overall.F)?`F = ${formatStatNumber(overall.F)}`:Number.isFinite(overall.H)?`H = ${formatStatNumber(overall.H)}`:Number.isFinite(overall.Q)?`Q = ${formatStatNumber(overall.Q)}`:'';
      results.push(`${analysis.label || 'The omnibus test'}${stat?` yielded ${stat}`:''}${Number.isFinite(overall.p)?`, p ${formatP(overall.p)}`:''}.`);
      if(isLognormalRepeatedMeasures){
        results.push('The omnibus null is equality of condition geometric means. A pairwise geometric-mean ratio above 1 means the first condition has the larger geometric mean; a ratio of 1 means equality.');
      }
    }else if(Array.isArray(model?.pairs) && model.pairs.length){
      results.push(`${model.pairs.length} comparison${model.pairs.length===1?' was':'s were'} evaluated using ${analysis.label || 'the selected test'}.`);
    }
    return {
      methodsText:methods.join(' '),
      resultsText:results.join(' '),
      methodsParts:methods.slice(),
      resultsParts:results.slice(),
      analysisSpec:{
        schemaVersion:'box-stats-spec-v8',
        analysisId:analysis.id || null,
        analysisLabel:analysis.label || null,
        family:analysis.family || null,
        variant:analysis.variant || null,
        paired:!!analysis.paired,
        mode:payload.statsMode || 'all',
        inference: inferenceSnapshot,
        alpha,
        targetFdr:sanitizeStatsAlpha(payload.statsTargetFdr,0.05),
        ciLevel,
        ciType:effectiveSpec.ciType || null,
        alternative,
        requestedAlternative:sanitizeStatsAlternative(payload.statsAlternative),
        correction:effectiveComparisonMethod,
        configuredCorrection,
        requestedPostHoc:model?.requestedPostHoc || payload.statsPostHoc || 'standard',
        effectivePostHoc:model?.effectivePostHoc || model?.postHoc || null,
        postHocAutomatic:model?.postHocResolution?.automatic === true || model?.requestedPostHoc === 'auto',
        varianceEstimator:effectiveSpec.varianceEstimator || null,
        degreesOfFreedom:effectiveSpec.degreesOfFreedom ?? null,
        degreesOfFreedomByComparison:effectiveSpec.degreesOfFreedomByComparison || null,
        correctionFamilySize:effectiveSpec.correctionFamilySize ?? correctionCount,
        comparisonScope:effectiveSpec.comparisonScope || payload.statsMode || 'all',
        analysisScale:effectiveSpec.analysisScale || (analysis.variant?.startsWith('lognormal') ? 'log' : 'original'),
        reportingScale:effectiveSpec.reportingScale || (analysis.variant?.startsWith('lognormal') ? 'geometric-mean-ratio' : 'mean-difference'),
        outlierMode,
        outlierAlpha:outlierMode==='grubbs' ? resolveStatsOutlierAlpha(payload) : null,
        outlierQ:['rout','routTest'].includes(outlierMode) ? resolveStatsOutlierQ(payload) : null,
        selectedGroups:selectedLabels,
        seed:sanitizeStatsSeed(payload.statsSeed,1337),
        resamplingMode:sanitizeResamplingMode(payload.statsResamplingMode),
        overallCalibrationMethod:model?.overall?.calibrationMethod || null,
        monteCarloIterations:sanitizeMonteCarloIterations(payload.statsMonteCarloIterations,10000),
        ...(isLognormalRepeatedMeasures ? {
          modelVersion:'box-lognormal-one-way-repeated-v1',
          responseTransformation:'natural-log',
          estimand:'equality-of-geometric-means',
          effectInterpretation:'geometric-mean-ratio',
          covarianceModel:'univariate-repeated-measures-sphericity',
          primaryWithinSubjectCorrection:'greenhouse-geisser',
          supplementaryWithinSubjectCorrection:'huynh-feldt',
          completeCaseSubjects:true,
          positivityRequired:true,
          subjectCount:model?.overall?.subjectCount ?? null,
          incompleteSubjectsExcluded:model?.overall?.excludedRows ?? 0,
          pairwiseConfidenceIntervals:'nominal-unadjusted'
        } : {})
      }
    };
  }

  function computeSingleStatsModel(payload){
    const selection = Array.isArray(payload.selection) ? payload.selection : [];
    const statsMode = payload.statsMode || 'all';
    const oneSampleMode = statsMode === 'oneSample';
    const indices = [];
    const labels = [];
    let groups = [];
    const groupByIndex = new Map();
    selection.forEach((item, idx) => {
      const index = Number.isFinite(item?.index) ? item.index : idx;
      const label = typeof item?.label === 'string' && item.label ? item.label : `Group ${idx + 1}`;
      const values = Array.isArray(item?.values) ? item.values : [];
      indices.push(index);
      labels.push(label);
      groups.push(values);
      groupByIndex.set(index, { label, position: idx });
    });

    const model = {
      mode: 'single',
      ok: true,
      message: null,
      tables: [],
      pairs: [],
      indices,
      groupCount: indices.length,
      assumptionDiagnostics: null,
      parametricVariant: payload.statsParametricVariant,
      postHoc: payload.statsPostHoc,
      correctionCount: 0,
      overall: null,
    };

    const minSelectionRequired = oneSampleMode ? 1 : 2;
    if(indices.length < minSelectionRequired){
      model.ok = false;
      model.message = oneSampleMode
        ? 'Select at least one column for one-sample analysis.'
        : 'Select at least two columns for statistical analysis.';
      return model;
    }

    const preprocessing=preprocessStatsGroups(groups,labels,{
      ...payload,rowIndicesByGroup:selection.map(item=>item?.rowIndices)
    });
    groups=preprocessing.groups;
    model.outlierAudit={mode:sanitizeOutlierMode(payload.statsOutlierMode),notes:preprocessing.auditNotes,exclusions:preprocessing.exclusions,flags:preprocessing.flags,excludedIncompleteRows:preprocessing.excludedIncompleteRows || 0};
    if(groups.some(group=>group.length===0)){
      model.ok=false;
      model.message='Outlier preprocessing left at least one selected group without usable values.';
      return model;
    }
    const summaries = groups.map(values => computeTraceSummary(values, { requireSorted: false }));
    model.groupSummaries = labels.map((label, index) => ({
      label,
      n: Number.isFinite(Number(summaries[index]?.count)) ? Number(summaries[index].count) : (groups[index]?.length || 0)
    }));
    const assumptionDiagnostics = computeAssumptionDiagnostics(groups, labels, {
      qqSampleLimit: ASSUMPTION_QQ_SAMPLE_LIMIT,
      summaries,
      alpha:ASSUMPTION_ALPHA,
      normalityMethod:payload.statsNormalityMethod,
      varianceMethod:payload.statsVarianceMethod,
      distributionDiagnostic:payload.statsDistributionDiagnostic,
      paired:payload.statsPaired && !oneSampleMode,
      ratio:payload.statsParametricVariant==='ratioT'
        || (payload.statsPaired===true && payload.statsParametricVariant==='lognormalClassic'),
      lognormal:['lognormalClassic','lognormalWelch'].includes(payload.statsParametricVariant),
      family:payload.statsTest,
      trendTest:payload.statsTrendTest===true,
      alternative:payload.statsAlternative
    });
    model.assumptionDiagnostics = assumptionDiagnostics;

    const analysisPlan=resolveSingleAnalysisPlan(payload,indices.length);
    if(!analysisPlan.ok){
      model.ok=false;
      model.message=analysisPlan.message;
      return model;
    }
    model.analysis={
      id:analysisPlan.id,
      label:analysisPlan.label,
      family:analysisPlan.family,
      variant:analysisPlan.variant,
      paired:analysisPlan.paired,
      pairwise:analysisPlan.pairwise,
      lognormal:analysisPlan.lognormal
    };
    const statsTest=analysisPlan.family;
    const statsPaired=analysisPlan.paired;
    const variant=analysisPlan.variant;
    model.parametricVariant=statsTest==='parametric' ? variant : payload.statsParametricVariant;
    model.nonParametricVariant=statsTest==='nonparametric' ? variant : payload.statsNonParametricVariant;
    if(assumptionDiagnostics){
      assumptionDiagnostics.parametricOverrideActive=false;
      assumptionDiagnostics.appliedTest=statsTest;
      assumptionDiagnostics.appliedVariant=variant;
      assumptionDiagnostics.selectionPolicy='explicit-user-choice';
    }

    const param=statsTest==='parametric';
    const paramVariant=variant;
    const pairTest=analysisPlan.pairTest;
    const paramEffectMeta = resolveEffectOptionMeta('parametric', payload.statsEffectParametric);
    const nonParamEffectMeta = resolveEffectOptionMeta('nonparametric', payload.statsEffectNonParametric);
    const effectFootnotes = buildEffectFootnotes(paramEffectMeta, nonParamEffectMeta);

    const lognormalRepeatedMeasures=analysisPlan.id==='lognormalRepeatedMeasuresAnova';
    const lognormalPreparation=analysisPlan.lognormal && !lognormalRepeatedMeasures
      ? prepareLognormalGroups(groups,analysisPlan.label)
      : { ok:true,groups };
    if(!lognormalPreparation.ok){
      model.ok=false;
      model.message=lognormalPreparation.message;
      return model;
    }
    const postHocGroups=lognormalPreparation.groups;

    if(oneSampleMode){
      model.requestedPostHoc=String(payload.statsPostHoc || 'standard');
      model.postHoc=null;
      model.effectivePostHoc=null;
      const nullValue = sanitizeOneSampleNullValue(payload.statsOneSampleNull ?? payload.statsOneSampleValue);
      const tests = indices.map((traceIndex, groupIdx) => {
        const values = groups[groupIdx];
        const label = labels[groupIdx];
        if(param){
          const result = tTestOneSample(values, nullValue, analysisPlan.options);
          return {
            index: traceIndex,
            label,
            valid: result.available !== false,
            message: result.message || '',
            n: result.n,
            mean: result.mean,
            sd: result.sd,
            delta: Number.isFinite(result.mean) ? result.mean - nullValue : NaN,
            stat: result.t,
            df: result.df,
            p: result.p
          };
        }
        const result = wilcoxonOneSample(values, nullValue, analysisPlan.options);
        return {
          index: traceIndex,
          label,
          valid: result.available !== false,
          message: result.message || '',
          n: result.n,
          effectiveN: result.effectiveN,
          median: result.median,
          delta: Number.isFinite(result.median) ? result.median : NaN,
          stat: result.W,
          z: result.z,
          p: result.p
        };
      });
      const validTests = tests.filter(test => test.valid && Number.isFinite(test.p) && test.p >= 0 && test.p <= 1);
      if(!validTests.length){
        model.ok = false;
        model.message = 'No one-sample tests could be computed. Check that each selected column has enough numeric values.';
        return model;
      }
      const comparisonCorrection = resolveEffectiveComparisonCorrection(validTests.map(test => test.p), payload.statsCorrection);
      validTests.forEach((test, idx) => {
        test.adjP = Array.isArray(comparisonCorrection.adjustedValues) && Number.isFinite(comparisonCorrection.adjustedValues[idx])
          ? comparisonCorrection.adjustedValues[idx]
          : test.p;
      });
      const correctionMeta = comparisonCorrection.correctionMeta;
      const showAdjustedP = comparisonCorrection.hasAdjustment;
      model.effectiveComparisonMethod = comparisonCorrection.effectiveMethod;
      const skippedNotes = tests
        .filter(test => !test.valid)
        .map(test => `${test.label}: ${test.message || 'skipped'}`);
      if(param){
        model.tables.push({
          caption: 'One-sample t-tests',
          section: 'comparisons',
          columns: [
            { key: 'group', label: 'Group', align: 'left', index: 0 },
            { key: 'n', label: 'n', align: 'right', index: 1 },
            { key: 'mean', label: 'Mean', align: 'right', index: 2 },
            { key: 'delta', label: 'Mean − H₀', align: 'right', index: 3 },
            { key: 'statistic', label: 't', align: 'right', index: 4 },
            { key: 'df', label: 'df', align: 'right', index: 5 },
            { key: 'p', label: 'p-value', align: 'right', index: 6, inferenceRole: showAdjustedP ? 'raw' : 'comparison' },
            ...(showAdjustedP ? [{ key: 'padj', label: formatAdjustedPLabel(comparisonCorrection.effectiveMethod, correctionMeta), align: 'right', index: 7, inferenceRole: 'comparison' }] : []),
            { key: 'note', label: 'Note', align: 'left', index: showAdjustedP ? 8 : 7 }
          ],
          rows: tests.map(test => ({
            group: test.label,
            n: Number.isFinite(test.n) ? String(test.n) : '-',
            mean: Number.isFinite(test.mean) ? formatStatNumber(test.mean) : '-',
            delta: Number.isFinite(test.delta) ? formatStatNumber(test.delta) : '-',
            statistic: Number.isFinite(test.stat) ? formatStatNumber(test.stat) : '-',
            df: Number.isFinite(test.df) ? formatStatNumber(test.df, 2) : '-',
            p: test.valid ? createPValueCell(test.p) : '-',
            ...(showAdjustedP ? { padj: test.valid ? createPValueCell(test.adjP) : '-' } : {}),
            note: test.valid ? '' : (test.message || 'Skipped')
          })),
          footnotes: [
            `Null hypothesis value (H₀): ${formatStatNumber(nullValue)}.`,
            ...(showAdjustedP && correctionMeta.footnote ? [correctionMeta.footnote] : []),
            ...skippedNotes
          ],
          options: { fileName: 'box-one-sample-ttest', contextLabel: 'box-one-sample' }
        });
      }else{
        model.tables.push({
          caption: 'One-sample Wilcoxon signed-rank tests',
          section: 'comparisons',
          columns: [
            { key: 'group', label: 'Group', align: 'left', index: 0 },
            { key: 'n', label: 'n', align: 'right', index: 1 },
            { key: 'nEff', label: 'n (non-zero)', align: 'right', index: 2 },
            { key: 'median', label: 'Median − H₀', align: 'right', index: 3 },
            { key: 'statistic', label: 'W', align: 'right', index: 4 },
            { key: 'z', label: 'z', align: 'right', index: 5 },
            { key: 'p', label: 'p-value', align: 'right', index: 6, inferenceRole: showAdjustedP ? 'raw' : 'comparison' },
            ...(showAdjustedP ? [{ key: 'padj', label: formatAdjustedPLabel(comparisonCorrection.effectiveMethod, correctionMeta), align: 'right', index: 7, inferenceRole: 'comparison' }] : []),
            { key: 'note', label: 'Note', align: 'left', index: showAdjustedP ? 8 : 7 }
          ],
          rows: tests.map(test => ({
            group: test.label,
            n: Number.isFinite(test.n) ? String(test.n) : '-',
            nEff: Number.isFinite(test.effectiveN) ? String(test.effectiveN) : '-',
            median: Number.isFinite(test.delta) ? formatStatNumber(test.delta) : '-',
            statistic: Number.isFinite(test.stat) ? formatStatNumber(test.stat) : '-',
            z: Number.isFinite(test.z) ? formatStatNumber(test.z) : '-',
            p: test.valid ? createPValueCell(test.p) : '-',
            ...(showAdjustedP ? { padj: test.valid ? createPValueCell(test.adjP) : '-' } : {}),
            note: test.valid ? '' : (test.message || 'Skipped')
          })),
          footnotes: [
            `Null hypothesis value (H₀): ${formatStatNumber(nullValue)}.`,
            ...(showAdjustedP && correctionMeta.footnote ? [correctionMeta.footnote] : []),
            ...skippedNotes
          ],
          options: { fileName: 'box-one-sample-wilcoxon', contextLabel: 'box-one-sample' }
        });
      }
      model.correctionCount = validTests.length;
      if(model.ok && !model.message){ model.report=buildBoxStatsReport(model,payload); }
      return model;
    }

    if(statsMode === 'custom'){
      model.requestedPostHoc=String(payload.statsPostHoc || 'standard');
      model.postHoc=null;
      model.effectivePostHoc=null;
      const customPairs = Array.isArray(payload.statsCustomPairs) ? payload.statsCustomPairs : [];
      if(!customPairs.length){
        model.ok = false;
        model.message = 'Specify pairs for comparison.';
        return model;
      }
      const pairs = [];
      customPairs.forEach(pr => {
        const ai = Number(pr?.ai);
        const bi = Number(pr?.bi);
        if(!Number.isFinite(ai) || !Number.isFinite(bi)){
          return;
        }
        const groupA = groupByIndex.get(ai);
        const groupB = groupByIndex.get(bi);
        if(!groupA || !groupB){
          return;
        }
        const aData = groups[groupA.position];
        const bData = groups[groupB.position];
        const r = pairTest(aData, bData);
        const statName = r.t !== undefined ? 't' : (r.U !== undefined ? 'U' : (r.W !== undefined ? 'W' : 'stat'));
        const statVal = r[statName];
        const effectMetrics = computeEffectSizeMetrics(aData, bData, { paired: statsPaired });
        const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
        const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
        pairs.push({
          ai,
          bi,
          p: r.p,
          diff: Number.isFinite(r.diff) ? r.diff : (mean(aData)-mean(bData)),
          ciLow: r.ciLow,
          ciHigh: r.ciHigh,
          differenceScale: r.scale === 'ratio' ? 'ratio' : 'difference',
          labelA: groupA.label,
          labelB: groupB.label,
          stat: statVal,
          statName,
          df: r.df,
          effects: effectMetrics,
          effectParametric: formattedParamEffect,
          effectNonParametric: formattedNonParamEffect
        });
      });
      const comparisonCorrection = resolveEffectiveComparisonCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
      comparisonCorrection.adjustedValues.forEach((adj, idx) => {
        if(pairs[idx]){
          pairs[idx].adjP = Number.isFinite(adj) ? adj : pairs[idx].p;
        }
      });
      const correctionMeta = comparisonCorrection.correctionMeta;
      model.effectiveComparisonMethod = comparisonCorrection.effectiveMethod;
      const tableRows = pairs.map(pr => ({
        comparison: `${pr.labelA} vs ${pr.labelB}`,
        statistic: `${pr.statName} = ${Number.isFinite(pr.stat) ? pr.stat.toFixed(4) : '-'}`,
        df: pr.df != null && Number.isFinite(pr.df) ? pr.df : '-',
        padj: createPValueCell(pr.adjP),
        effectParametric: pr.effectParametric,
        effectNonParametric: pr.effectNonParametric
      }));
      model.tables.push({
        caption: 'Custom pairwise comparisons',
        section: 'comparisons',
        columns: [
          { key: 'comparison', label: 'Comparison', align: 'left', index: 0 },
          { key: 'statistic', label: 'Statistic', align: 'left', index: 1 },
          { key: 'df', label: 'df', align: 'right', index: 2 },
          { key: 'padj', label: formatAdjustedPLabel(comparisonCorrection.effectiveMethod, correctionMeta), align: 'right', index: 3, inferenceRole: 'comparison' },
          { key: 'effectParametric', label: `Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`, align: 'right', index: 4, tooltip: paramEffectMeta.tooltip },
          { key: 'effectNonParametric', label: `Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`, align: 'right', index: 5, tooltip: nonParamEffectMeta.tooltip }
        ],
        rows: tableRows,
        footnotes: [
          ...(comparisonCorrection.hasAdjustment && correctionMeta.footnote ? [correctionMeta.footnote] : []),
          ...effectFootnotes
        ],
        options: { fileName: 'box-custom-comparisons', contextLabel: 'box-custom' }
      });
      model.pairs = pairs;
      model.correctionCount = pairs.length;
      if(model.ok && !model.message){ model.report=buildBoxStatsReport(model,payload); }
      return model;
    }

    if(indices.length === 2){
      const requestedPostHoc=String(payload.statsPostHoc || 'standard');
      const directPostHocResolution=resolvePostHocProcedure({
        requestedProcedure:'standard',
        analysisId:analysisPlan.id,
        scope:statsMode,
        design:statsPaired?'paired':'independent',
        groupCount:indices.length
      });
      model.requestedPostHoc=requestedPostHoc;
      model.postHocResolution=resolvePostHocProcedure({
        requestedProcedure:requestedPostHoc,
        analysisId:analysisPlan.id,
        scope:statsMode,
        design:statsPaired?'paired':'independent',
        groupCount:indices.length
      });
      model.postHoc='standard';
      model.effectivePostHoc='standard';
      const res = pairTest(groups[0], groups[1]);
      const statName = res.t !== undefined ? 't' : (res.U !== undefined ? 'U' : (res.W !== undefined ? 'W' : (res.D !== undefined ? 'D' : 'stat')));
      const effectMetrics = computeEffectSizeMetrics(groups[0], groups[1], { paired: statsPaired });
      const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
      const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
      const summaryRows = [
        { metric: 'Comparison', value: `${labels[0]} vs ${labels[1]}` },
        { metric: 'Test', value: analysisPlan.label },
        { metric: statName, value: Number.isFinite(res[statName]) ? res[statName].toFixed(4) : '-' }
      ];
      const diffValue = Number.isFinite(res.diff) ? res.diff : (mean(groups[0]) - mean(groups[1]));
      const ratioScale=res.scale==='ratio';
      if(Number.isFinite(diffValue)){
        summaryRows.push({ metric: ratioScale ? 'Geometric mean ratio (A/B)' : 'Difference (A-B)', value: formatStatNumber(diffValue) });
      }
      const intervalText=formatConfidenceInterval(res.ciLow,res.ciHigh);
      if(intervalText!=='-'){
        summaryRows.push({ metric: `${formatPercentLabel(sanitizeStatsCiLevel(payload.statsCiLevel,0.95))} CI`, value: intervalText });
      }
      if(res.df !== undefined){
        summaryRows.push({ metric: 'df', value: Number.isFinite(res.df) ? res.df.toFixed(4) : '-' });
      }
      summaryRows.push({ metric: 'p-value', value: createPValueCell(res.p), pValueRaw: res.p, inferenceRole: 'comparison' });
      const adjValue = res.p;
      model.effectiveComparisonMethod = 'none';
      summaryRows.push({ metric: `Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`, value: formattedParamEffect });
      summaryRows.push({ metric: `Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`, value: formattedNonParamEffect });
      const footnotes = effectFootnotes.slice();
      model.tables.push({
        caption: 'Overall test summary',
        section: 'summary',
        columns: [
          { key: 'metric', label: 'Metric', align: 'left', index: 0 },
          { key: 'value', label: 'Value', align: 'left', index: 1 }
        ],
        rows: summaryRows,
        footnotes,
        options: { fileName: 'box-pairwise-summary', contextLabel: 'box-pairwise' }
      });
      const ai = indices[0];
      const bi = indices[1];
      model.pairs = [{
        ai,
        bi,
        p: res.p,
        rawP:res.p,
        adjP: adjValue,
        diff: diffValue,
        ciLow: res.ciLow,
        ciHigh: res.ciHigh,
        labelA: labels[0],
        labelB: labels[1],
        stat: res[statName],
        statName,
        df: res.df,
        ciType:'nominal',
        ciLevel:sanitizeStatsCiLevel(payload.statsCiLevel,0.95),
        effectParametric: formattedParamEffect,
        effectNonParametric: formattedNonParamEffect,
        differenceScale: res.scale === 'ratio' ? 'ratio' : 'difference'
      }];
      model.correctionCount = 1;
      model.effectiveAnalysisSpec={
        schemaVersion:'box-effective-analysis-v1',
        primaryAnalysisId:analysisPlan.id,
        requestedPostHoc,
        effectivePostHoc:'standard',
        postHocAutomatic:model.postHocResolution.automatic,
        comparisonScope:statsMode==='all'?'all-pairwise':statsMode,
        design:statsPaired?'paired':'independent',
        groupCount:indices.length,
        pairwiseTest:directPostHocResolution.pairwiseTest,
        varianceEstimator:directPostHocResolution.varianceEstimator,
        degreesOfFreedom:Number.isFinite(res.df)?res.df:null,
        degreesOfFreedomByComparison:null,
        correctionMethod:'none',
        configuredCorrection:payload.statsCorrection || DEFAULT_CORRECTION,
        correctionFamilySize:1,
        alpha:sanitizeStatsAlpha(payload.statsAlpha,0.05),
        effectiveAlternative:sanitizeStatsAlternative(payload.statsAlternative),
        ciLevel:sanitizeStatsCiLevel(payload.statsCiLevel,0.95),
        ciType:'nominal',
        analysisScale:analysisPlan.lognormal?'log':'original',
        reportingScale:res.scale==='ratio'?'geometric-mean-ratio':'mean-difference'
      };
      if(model.ok && !model.message){ model.report=buildBoxStatsReport(model,payload); }
      return model;
    }

    const computeOmnibusOverall = statsMode === 'all';
    let overall = null;
    let omnibusAnovaComponents = null;
    const overallFootnotes = [];
    if(computeOmnibusOverall && !statsPaired){
      if(param){
        const omnibusGroups=postHocGroups;
        if(paramVariant === 'welch' || paramVariant === 'lognormalWelch'){
          const welch = computeWelchAnova(omnibusGroups);
          if(welch.ok){
            overall = { method: paramVariant==='lognormalWelch'?'lognormalWelchAnova':'welchAnova', F: welch.F, p: welch.p, df1: welch.df1, df2: welch.df2, footnote: welch.footnote };
            if(welch.footnote){
              overallFootnotes.push(welch.footnote);
            }
          }
        }else{
          const classic = anova(omnibusGroups);
          if(classic){
            omnibusAnovaComponents = classic;
            overall = { method: paramVariant==='lognormalClassic'?'lognormalAnova':'anova', F: classic.F, p: classic.p, df1: classic.dfBetween, df2: classic.dfWithin };
          }
        }
      }else{
        const kw = kruskalWallis(groups);
        overall = { method: 'kruskalWallis', H: kw.H, p: kw.p, df: groups.length - 1 };
      }
    }else if(computeOmnibusOverall && param){
      const rm = lognormalRepeatedMeasures
        ? computeLognormalRepeatedMeasuresAnova(groups)
        : computeRepeatedMeasuresAnova(groups);
      if(!rm.ok){
        model.ok=false;
        model.message=rm.message || `Unable to compute ${analysisPlan.label}. Check sample sizes and numeric values.`;
        return model;
      }
      if(rm.ok){
        const primaryP=lognormalRepeatedMeasures
          ? (Number.isFinite(rm.ggP)?rm.ggP:null)
          : rm.p;
        overall = {
          method: lognormalRepeatedMeasures ? 'lognormalRmAnova' : 'rmAnova',
          available: rm.available !== false,
          F: rm.F,
          p: primaryP,
          ...(lognormalRepeatedMeasures ? {
            pUncorrected:rm.p,
            primaryCorrection:Number.isFinite(rm.ggP)?'greenhouse-geisser':null,
            subjectCount:rm.subjectCount,
            excludedRows:(Number(model.outlierAudit?.excludedIncompleteRows)||0)+(Number(rm.excludedRows)||0),
            geometricMeans:rm.geometricMeans
          } : {}),
          df1: rm.df1,
          df2: rm.df2,
          ggEpsilon: rm.ggEpsilon,
          hfEpsilon: rm.hfEpsilon,
          ggP: rm.ggP,
          hfP: rm.hfP,
          footnote: rm.footnote
        };
        if(rm.footnote){
          overallFootnotes.push(rm.footnote);
        }
      }
    }else if(computeOmnibusOverall){
      const friedman = computeFriedmanTest(groups, {
        resamplingMode: payload.statsResamplingMode,
        iterations: payload.statsMonteCarloIterations,
        seed: payload.statsSeed
      });
      if(friedman.ok){
        overall = { method: 'friedman', Q: friedman.Q, p: friedman.p, df: friedman.df, calibrationMethod: friedman.calibrationMethod, footnote: friedman.footnote };
        if(friedman.footnote){
          overallFootnotes.push(friedman.footnote);
        }
      }
    }
    if(computeOmnibusOverall && !overall){
      model.ok=false;
      model.message=`Unable to compute ${analysisPlan.label}. Check sample sizes and numeric values.`;
      return model;
    }
    model.overall = overall;

    let pairs = [];
    let referenceLabel = null;
    const methodFootnotes = [];
    const postHocContext={
      mode:statsMode,
      test:param ? 'parametric' : 'nonparametric',
      paired:statsPaired,
      groupCount:indices.length,
      variant:paramVariant,
      varianceConcern:assumptionDiagnostics?.varianceConcern === true,
      analysisId:analysisPlan.id
    };
    const requestedPostHoc=String(payload.statsPostHoc || 'standard');
    const postHocResolution=resolvePostHocProcedure({
      requestedProcedure:requestedPostHoc,
      analysisId:analysisPlan.id,
      scope:statsMode,
      design:statsPaired?'paired':'independent',
      groupCount:indices.length,
      varianceConcern:postHocContext.varianceConcern
    });
    model.requestedPostHoc=postHocResolution.requestedProcedure;
    model.postHocResolution=postHocResolution;
    const effectivePostHocResolution=postHocResolution.supported
      ? postHocResolution
      : (indices.length<=2 ? resolvePostHocProcedure({
        ...postHocContext,
        requestedProcedure:'standard'
      }) : postHocResolution);
    if(!effectivePostHocResolution.supported){
      model.ok=false;
      model.message=postHocResolution.reason || `${requestedPostHoc} is not valid for ${analysisPlan.label}. Choose an available pairwise procedure.`;
      return model;
    }
    const postHocMode=effectivePostHocResolution.effectiveProcedure;
    model.postHoc=postHocMode;
    model.effectivePostHoc=postHocMode;

    if(statsMode === 'all'){
      if(postHocMode==='dunnettT3Test'){
        const result=normalizePostHocResultScale(computeDunnettT3Comparisons(postHocGroups,labels,{ciLevel:payload.statsCiLevel}),analysisPlan.lognormal);
        if(!result.ok){model.ok=false;model.message=result.message;return model;}
        methodFootnotes.push(result.footnote);
        pairs=mapBoxPostHocPairs(result.pairs,{indices,groups,labels,paramEffectMeta,nonParamEffectMeta,statKey:'t',pKey:'p',adjPKey:'pAdj',method:postHocMode});
      }else if(postHocMode === 'anovaPooled'){
        const pooled=normalizePostHocResultScale(computeAnovaPooledComparisons(postHocGroups,labels,{
          ciLevel:payload.statsCiLevel,
          anovaComponents:omnibusAnovaComponents
        }),analysisPlan.lognormal);
        if(!pooled.ok){
          model.ok=false;
          model.message=pooled.message || 'Unable to compute ANOVA-pooled comparisons.';
          return model;
        }
        pairs=mapBoxPostHocPairs(pooled.pairs,{
          indices,
          groups,
          labels,
          paramEffectMeta,
          nonParamEffectMeta,
          statKey:'t',
          statName:'t',
          pKey:'p',
          adjPKey:'p',
          method:'anovaPooled'
        }).map((pair,index)=>({
          ...pair,
          rawP:pooled.pairs[index].p,
          ciType:'nominal',
          ciLevel:pooled.ciLevel
        }));
        const comparisonCorrection=resolveEffectiveComparisonCorrection(pairs.map(pair=>pair.rawP),payload.statsCorrection);
        comparisonCorrection.adjustedValues.forEach((adjusted,index)=>{
          if(pairs[index]){
            pairs[index].adjP=Number.isFinite(adjusted)?adjusted:pairs[index].rawP;
          }
        });
      }else if(postHocMode === 'tukey'){
        const tukey = normalizePostHocResultScale(computeTukeyComparisons(postHocGroups, labels, {
          ciLevel:payload.statsCiLevel,
          anovaComponents:omnibusAnovaComponents
        }),analysisPlan.lognormal);
        if(!tukey.ok){
          model.ok = false;
          model.message = tukey.message || 'Unable to compute Tukey HSD.';
          return model;
        }
        if(tukey.footnote){
          methodFootnotes.push(tukey.footnote);
        }
        pairs = tukey.pairs.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.pAdj,
            rawP: null,
            adjP: pr.pAdj,
            stat: pr.q,
            statName: 'q',
            df: pr.df,
            diff: pr.diff,
            ciLow: pr.ciLow,
            ciHigh: pr.ciHigh,
            differenceScale: pr.differenceScale || 'difference',
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            method: 'tukey'
            ,ciType:'simultaneous',
            ciLevel:sanitizeStatsCiLevel(payload.statsCiLevel,0.95)
          };
        });
      }else if(postHocMode === 'gamesHowell'){
        const gh = normalizePostHocResultScale(computeGamesHowellComparisons(postHocGroups, labels, {
          ciLevel:payload.statsCiLevel
        }),analysisPlan.lognormal);
        if(!gh.ok){
          model.ok = false;
          model.message = gh.message || 'Unable to compute Games-Howell comparisons.';
          return model;
        }
        if(gh.footnote){
          methodFootnotes.push(gh.footnote);
        }
        pairs = gh.pairs.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.p,
            rawP: null,
            adjP: pr.pAdj,
            stat: pr.q,
            statName: 'q',
            df: pr.df,
            diff: pr.diff,
            ciLow: pr.ciLow,
            ciHigh: pr.ciHigh,
            differenceScale: pr.differenceScale || 'difference',
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            method: 'gamesHowell',
            ciType:'simultaneous',
            ciLevel:sanitizeStatsCiLevel(payload.statsCiLevel,0.95)
          };
        });
      }else if(postHocMode === 'tamhaneT2'){
        const tamhane = normalizePostHocResultScale(computeTamhaneT2Comparisons(postHocGroups, labels, { alpha: payload.statsAlpha }),analysisPlan.lognormal);
        if(!tamhane.ok){
          model.ok = false;
          model.message = tamhane.message || 'Unable to compute Tamhane T2 comparisons.';
          return model;
        }
        if(tamhane.footnote){
          methodFootnotes.push(tamhane.footnote);
        }
        pairs = mapBoxPostHocPairs(tamhane.pairs, {
          indices,
          groups,
          labels,
          paramEffectMeta,
          nonParamEffectMeta,
          statKey: 't',
          statName: 't',
          pKey: 'p',
          adjPKey: 'pAdj',
          method: 'tamhaneT2'
        });
      }else if(postHocMode === 'dunn'){
        const dunn = computeDunnComparisons(groups, labels);
        if(!dunn.ok){
          model.ok = false;
          model.message = dunn.message || "Unable to compute Dunn's test.";
          return model;
        }
        if(dunn.footnote){
          methodFootnotes.push(dunn.footnote);
        }
        pairs = dunn.pairs.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.p,
            stat: pr.z,
            statName: 'z',
            df: null,
            diff: pr.diff,
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            method: 'dunn'
          };
        });
        if(pairs.length && postHocMode !== 'gamesHowell'){
          const adjusted = applyPValueCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
          adjusted.forEach((adj, idx) => { pairs[idx].adjP = adj; });
        }
      }else if(postHocMode === 'nemenyi'){
        const nemenyi = computeNemenyiComparisons(groups, labels, {
          resamplingMode: payload.statsResamplingMode,
          iterations: payload.statsMonteCarloIterations,
          seed: payload.statsSeed
        });
        if(!nemenyi.ok){
          model.ok = false;
          model.message = nemenyi.message || 'Unable to compute Nemenyi comparisons.';
          return model;
        }
        if(nemenyi.footnote){
          methodFootnotes.push(nemenyi.footnote);
        }
        pairs = mapBoxPostHocPairs(nemenyi.pairs, {
          indices,
          groups,
          labels,
          paramEffectMeta,
          nonParamEffectMeta,
          paired: true,
          statKey: 'q',
          statName: 'q',
          pKey: 'p',
          adjPKey: 'p',
          method: 'nemenyi'
        });
      }else{
        for(let i = 0; i < indices.length; i++){
          for(let j = i + 1; j < indices.length; j++){
            const aIdx = indices[i];
            const bIdx = indices[j];
            const aValues = groups[i];
            const bValues = groups[j];
            const r = pairTest(aValues, bValues);
            const statName = r.t !== undefined ? 't' : (r.U !== undefined ? 'U' : (r.W !== undefined ? 'W' : 'stat'));
            const effectMetrics = lognormalRepeatedMeasures
              ? null
              : computeEffectSizeMetrics(aValues, bValues, { paired: statsPaired });
            const formattedParamEffect = formatEffectValue(effectMetrics?.parametric?.[paramEffectMeta?.value], paramEffectMeta);
            const formattedNonParamEffect = formatEffectValue(effectMetrics?.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
            const diffValue = Number.isFinite(r.diff) ? r.diff : (mean(aValues) - mean(bValues));
            pairs.push({
              a: i,
              b: j,
              ai: aIdx,
              bi: bIdx,
              p: r.p,
              diff: diffValue,
              ciLow: r.ciLow,
              ciHigh: r.ciHigh,
              differenceScale: r.scale === 'ratio' ? 'ratio' : 'difference',
              stat: r[statName],
              statName,
              df: r.df,
              labelA: labels[i],
              labelB: labels[j],
              effects: effectMetrics,
              effectParametric: formattedParamEffect,
              effectNonParametric: formattedNonParamEffect,
              method: 'standard'
            });
          }
        }
        if(pairs.length && postHocMode !== 'gamesHowell'){
          const adjusted = applyPValueCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
          adjusted.forEach((adj, idx) => { pairs[idx].adjP = adj; });
        }
      }
    }else if(statsMode === 'reference'){
      const refIndexValue = Number(payload.statsRef);
      const refIdx = indices.indexOf(refIndexValue);
      if(refIdx === -1){
        model.ok = false;
        model.message = 'Select reference column among the chosen groups.';
        return model;
      }
      const refData = groups[refIdx];
      referenceLabel = labels[refIdx];
      if(postHocMode === 'tukey'){
        const tukey = normalizePostHocResultScale(computeTukeyComparisons(postHocGroups, labels, {
          ciLevel:payload.statsCiLevel,
          referenceIndex:refIdx
        }),analysisPlan.lognormal);
        if(!tukey.ok){
          model.ok = false;
          model.message = tukey.message || 'Unable to compute Tukey HSD.';
          return model;
        }
        if(tukey.footnote){
          methodFootnotes.push(tukey.footnote);
        }
        pairs = tukey.pairs.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.pAdj,
            rawP: null,
            adjP: pr.pAdj,
            stat: pr.q,
            statName: 'q',
            df: pr.df,
            diff: pr.diff,
            ciLow: pr.ciLow,
            ciHigh: pr.ciHigh,
            differenceScale: pr.differenceScale || 'difference',
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            method: 'tukey',
            ciType:'simultaneous',
            ciLevel:sanitizeStatsCiLevel(payload.statsCiLevel,0.95)
          };
        });
      }else if(postHocMode === 'gamesHowell'){
        const gh = normalizePostHocResultScale(computeGamesHowellComparisons(postHocGroups, labels, {
          ciLevel:payload.statsCiLevel,
          referenceIndex:refIdx
        }),analysisPlan.lognormal);
        if(!gh.ok){
          model.ok = false;
          model.message = gh.message || 'Unable to compute Games-Howell comparisons.';
          return model;
        }
        if(gh.footnote){
          methodFootnotes.push(gh.footnote);
        }
        pairs = gh.pairs.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.p,
            rawP: null,
            adjP: pr.pAdj,
            stat: pr.q,
            statName: 'q',
            df: pr.df,
            diff: pr.diff,
            ciLow: pr.ciLow,
            ciHigh: pr.ciHigh,
            differenceScale: pr.differenceScale || 'difference',
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            method: 'gamesHowell',
            ciType:'simultaneous',
            ciLevel:sanitizeStatsCiLevel(payload.statsCiLevel,0.95)
          };
        });
      }else if(postHocMode === 'tamhaneT2'){
        const tamhane = normalizePostHocResultScale(computeTamhaneT2Comparisons(postHocGroups, labels, { alpha: payload.statsAlpha }),analysisPlan.lognormal);
        if(!tamhane.ok){
          model.ok = false;
          model.message = tamhane.message || 'Unable to compute Tamhane T2 comparisons.';
          return model;
        }
        if(tamhane.footnote){
          methodFootnotes.push(tamhane.footnote);
        }
        const filtered = tamhane.pairs.filter(pair => pair.i === refIdx || pair.j === refIdx);
        pairs = mapBoxPostHocPairs(filtered, {
          indices,
          groups,
          labels,
          paramEffectMeta,
          nonParamEffectMeta,
          statKey: 't',
          statName: 't',
          pKey: 'p',
          adjPKey: 'pAdj',
          method: 'tamhaneT2'
        });
      }else if(postHocMode === 'dunn'){
        const dunn = computeDunnComparisons(groups, labels);
        if(!dunn.ok){
          model.ok = false;
          model.message = dunn.message || "Unable to compute Dunn's test.";
          return model;
        }
        if(dunn.footnote){
          methodFootnotes.push(dunn.footnote);
        }
        const filtered = dunn.pairs.filter(pr => pr.i === refIdx || pr.j === refIdx);
        pairs = filtered.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.p,
            stat: pr.z,
            statName: 'z',
            df: null,
            diff: pr.diff,
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            method: 'dunn'
          };
        });
        if(pairs.length && postHocMode !== 'gamesHowell'){
          const adjusted = applyPValueCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
          adjusted.forEach((adj, idx) => { pairs[idx].adjP = adj; });
        }
      }else if(postHocMode === 'nemenyi'){
        const nemenyi = computeNemenyiComparisons(groups, labels, {
          resamplingMode: payload.statsResamplingMode,
          iterations: payload.statsMonteCarloIterations,
          seed: payload.statsSeed
        });
        if(!nemenyi.ok){
          model.ok = false;
          model.message = nemenyi.message || 'Unable to compute Nemenyi comparisons.';
          return model;
        }
        if(nemenyi.footnote){
          methodFootnotes.push(nemenyi.footnote);
        }
        const filtered = nemenyi.pairs.filter(pair => pair.i === refIdx || pair.j === refIdx);
        pairs = mapBoxPostHocPairs(filtered, {
          indices,
          groups,
          labels,
          paramEffectMeta,
          nonParamEffectMeta,
          paired: true,
          statKey: 'q',
          statName: 'q',
          pKey: 'p',
          adjPKey: 'p',
          method: 'nemenyi'
        });
      }else if(postHocMode === 'dunnett' || postHocMode === 'dunnettT3' || postHocMode==='dunnettTest'){
        const dunnett = normalizePostHocResultScale((postHocMode==='dunnettTest'?computeDunnettComparisons:computeControlSidakComparisons)(postHocGroups, labels, refIdx, {
          unequalVariances: postHocMode === 'dunnettT3',
          alpha: payload.statsAlpha,
          ciLevel: payload.statsCiLevel
        }),analysisPlan.lognormal);
        if(!dunnett.ok){
          model.ok = false;
          model.message = dunnett.message || 'Unable to compute Pooled t + Sidak versus control comparisons.';
          return model;
        }
        if(dunnett.footnote){
          methodFootnotes.push(dunnett.footnote);
        }
        pairs = dunnett.pairs.map(pr => {
          const ai = indices[pr.i];
          const bi = indices[pr.j];
          const effectMetrics = computeEffectSizeMetrics(groups[pr.i], groups[pr.j], { paired: false });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          return {
            a: pr.i,
            b: pr.j,
            ai,
            bi,
            p: pr.p,
            adjP: pr.pAdj,
            stat: pr.t,
            statName: 't',
            df: pr.df,
            diff: pr.diff,
            ciLow: pr.ciLow,
            ciHigh: pr.ciHigh,
            differenceScale: pr.differenceScale || 'difference',
            labelA: labels[pr.i],
            labelB: labels[pr.j],
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            method: postHocMode
          };
        });
      }else{
        indices.forEach((idx, i) => {
          if(i === refIdx) return;
          const compareValues = groups[i];
          const r = pairTest(refData, compareValues);
          const statName = r.t !== undefined ? 't' : (r.U !== undefined ? 'U' : (r.W !== undefined ? 'W' : 'stat'));
          const effectMetrics = computeEffectSizeMetrics(refData, compareValues, { paired: statsPaired });
          const formattedParamEffect = formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value], paramEffectMeta);
          const formattedNonParamEffect = formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value], nonParamEffectMeta);
          const diffValue = Number.isFinite(r.diff) ? r.diff : (mean(refData) - mean(compareValues));
          pairs.push({
            a: refIdx,
            b: i,
            ai: refIndexValue,
            bi: idx,
            p: r.p,
            diff: diffValue,
            ciLow: r.ciLow,
            ciHigh: r.ciHigh,
            differenceScale: r.scale === 'ratio' ? 'ratio' : 'difference',
            labelA: labels[refIdx],
            labelB: labels[i],
            stat: r[statName],
            statName,
            df: r.df,
            effects: effectMetrics,
            effectParametric: formattedParamEffect,
            effectNonParametric: formattedNonParamEffect,
            method: 'standard'
          });
        });
        if(pairs.length && postHocMode !== 'gamesHowell'){
          const adjusted = applyPValueCorrection(pairs.map(pr => pr.p), payload.statsCorrection);
          adjusted.forEach((adj, idx) => { pairs[idx].adjP = adj; });
        }
      }
    }

    model.correctionCount = pairs.length;
    model.effectiveComparisonMethod = resolvePostHocInferenceMethod(postHocMode, payload.statsCorrection, pairs.length);
    const noRawPProcedures=new Set(['tukey','gamesHowell','nemenyi']);
    pairs.forEach(pair=>{
      if(!Object.prototype.hasOwnProperty.call(pair,'rawP')){
        pair.rawP=noRawPProcedures.has(postHocMode) ? null : (Number.isFinite(pair.p) ? pair.p : null);
      }
      if(!Number.isFinite(pair.adjP)){
        pair.adjP=Number.isFinite(pair.p) ? pair.p : null;
      }
    });
    const pairDfs=Array.from(new Set(pairs.map(pair=>Number(pair.df)).filter(Number.isFinite)));
    const simultaneousCiMethods=new Set(['tukey','gamesHowell','tamhaneT2','dunnett','dunnettT3','dunnettTest','dunnettT3Test']);
    const ciType=postHocMode==='dunnett' || postHocMode==='dunnettT3'
      ? 'sidak-adjusted-marginal'
      : simultaneousCiMethods.has(postHocMode)
      ? 'simultaneous'
      : (postHocMode==='nemenyi' ? 'none' : 'nominal');
    const ciLevel=sanitizeStatsCiLevel(payload.statsCiLevel,0.95);
    pairs.forEach(pair=>{
      if(!pair.ciType){
        pair.ciType=ciType;
      }
      if(!Number.isFinite(pair.ciLevel) && ciType!=='none'){
        pair.ciLevel=ciLevel;
      }
    });
    model.effectiveAnalysisSpec={
      schemaVersion:'box-effective-analysis-v1',
      primaryAnalysisId:analysisPlan.id,
      requestedPostHoc:postHocResolution.requestedProcedure,
      effectivePostHoc:postHocMode,
      postHocAutomatic:postHocResolution.automatic,
      comparisonScope:statsMode==='all'?'all-pairwise':statsMode,
      design:statsPaired?'paired':'independent',
      groupCount:indices.length,
      pairwiseTest:effectivePostHocResolution.pairwiseTest,
      varianceEstimator:effectivePostHocResolution.varianceEstimator,
      degreesOfFreedom:pairDfs.length===1?pairDfs[0]:null,
      degreesOfFreedomByComparison:pairDfs.length>1
        ? pairs.map(pair=>({ comparison:`${pair.labelA || labels[pair.a]} vs ${pair.labelB || labels[pair.b]}`, df:Number.isFinite(pair.df)?pair.df:null }))
        : null,
      correctionMethod:model.effectiveComparisonMethod,
      configuredCorrection:payload.statsCorrection || DEFAULT_CORRECTION,
      correctionFamilySize:pairs.length,
      alpha:sanitizeStatsAlpha(payload.statsAlpha,0.05),
      effectiveAlternative:effectivePostHocResolution.effectiveAlternative || sanitizeStatsAlternative(payload.statsAlternative),
      ciLevel,
      ciType,
      analysisScale:analysisPlan.lognormal?'log':'original',
      reportingScale:analysisPlan.lognormal?'geometric-mean-ratio':'mean-difference'
    };
    model.pairs = pairs;

    if(pairs.length){
      let correctionMeta;
      if(postHocMode === 'tukey'){
        correctionMeta = { key: 'tukey', label: 'Tukey HSD', shortLabel: 'Tukey HSD', footnote: null };
      }else if(postHocMode === 'gamesHowell'){
        correctionMeta = { key: 'gamesHowell', label: 'Games-Howell', shortLabel: 'Games-Howell', footnote: null };
      }else if(postHocMode === 'tamhaneT2'){
        correctionMeta = { key: 'tamhaneT2', label: 'Tamhane T2', shortLabel: 'Tamhane T2', footnote: null };
      }else if(postHocMode === 'nemenyi'){
        correctionMeta = { key: 'nemenyi', label: 'Nemenyi', shortLabel: 'Friedman max-T', footnote: null };
      }else if(postHocMode==='dunnettTest' || postHocMode==='dunnettT3Test'){
        correctionMeta={key:postHocMode,label:POST_HOC_META[postHocMode].label,shortLabel:POST_HOC_META[postHocMode].shortLabel,footnote:null};
      }else if(postHocMode === 'dunnett'){
        correctionMeta = { key: 'dunnett', label: 'Pooled t + Sidak versus control', shortLabel: 'Control + Sidak', footnote: null };
      }else if(postHocMode === 'dunnettT3'){
        correctionMeta = { key: 'dunnettT3', label: 'Welch + Sidak versus control', shortLabel: 'Control Welch + Sidak', footnote: null };
      }else{
        correctionMeta = resolveCorrectionMeta(model.effectiveComparisonMethod, pairs.length);
      }
      const footnotes = [];
      if(model.effectiveComparisonMethod !== 'none' && correctionMeta.footnote){
        footnotes.push(correctionMeta.footnote);
      }
      methodFootnotes.forEach(note => { if(note) footnotes.push(note); });

      if(!overall && statsMode === 'reference'){
        const summaryRows = [
          { metric: 'Pairwise test', value: `${analysisPlan.label} vs reference` },
          { metric: 'Comparison scope', value: 'Versus reference' },
          { metric: 'Comparisons', value: String(pairs.length) },
          { metric: 'Reference group', value: referenceLabel || '-' }
        ];
        if(pairs.length > 1){
          summaryRows.push({ metric: 'Multiplicity control', value: correctionMeta.label });
        }
        model.tables.push({
          caption: 'Analysis summary',
          section: 'summary',
          columns: [
            { key: 'metric', label: 'Metric', align: 'left', index: 0 },
            { key: 'value', label: 'Value', align: 'left', index: 1 }
          ],
          rows: summaryRows,
          footnotes: [],
          options: { fileName: 'box-analysis-summary', contextLabel: 'box-analysis-summary' }
        });
      }

      if(overall){
        const overallMeta={
          anova:{ label:'One-way ANOVA',statName:'F',statKey:'F',dfKind:'f' },
          welchAnova:{ label:'Welch ANOVA',statName:'F',statKey:'F',dfKind:'f' },
          lognormalAnova:{ label:'Lognormal one-way ANOVA',statName:'F',statKey:'F',dfKind:'f' },
          lognormalWelchAnova:{ label:'Lognormal Welch ANOVA',statName:'F',statKey:'F',dfKind:'f' },
          rmAnova:{ label:'Repeated-measures ANOVA',statName:'F',statKey:'F',dfKind:'f' },
          lognormalRmAnova:{ label:'Lognormal repeated-measures ANOVA',statName:'F',statKey:'F',dfKind:'f' },
          kruskalWallis:{ label:'Kruskal-Wallis test',statName:'H',statKey:'H',dfKind:'single' },
          friedman:{ label:'Friedman test',statName:'Q',statKey:'Q',dfKind:'single' }
        }[overall.method] || { label:analysisPlan.label,statName:'Statistic',statKey:'stat',dfKind:'single' };
        const statValue=overall[overallMeta.statKey];
        const overallRows = [
          { metric: 'Overall test', value: overallMeta.label },
          { metric: overallMeta.statName, value: Number.isFinite(statValue) ? statValue.toFixed(4) : '-' }
        ];
        if(overallMeta.dfKind==='f'){
          overallRows.push({ metric:'df',value:`${formatStatNumber(overall.df1,2)}, ${Number.isFinite(overall.df2)?formatStatNumber(overall.df2,2):'Infinity'}` });
        }else if(overall?.df != null){
          overallRows.push({ metric: 'df', value: String(overall.df) });
        }
        const isLognormalRm=overall.method==='lognormalRmAnova';
        overallRows.push({
          metric:isLognormalRm?'p-value (GG, primary)':'p-value',
          value:createPValueCell(overall.p),
          pValueRaw:overall.p,
          inferenceRole:'overall'
        });
        if(isLognormalRm){
          overallRows.push({metric:'Complete subjects',value:String(overall.subjectCount)});
          overallRows.push({metric:'Incomplete subjects excluded',value:String(overall.excludedRows || 0)});
          overallRows.push({metric:'p-value (uncorrected)',value:createPValueCell(overall.pUncorrected),pValueRaw:overall.pUncorrected});
          overall.geometricMeans.forEach((value,index)=>{
            overallRows.push({metric:`Geometric mean (${labels[index] || `Group ${index+1}`})`,value:formatStatNumber(value)});
          });
        }
        if(overall.method === 'rmAnova' || isLognormalRm){
          if(Number.isFinite(overall.ggEpsilon)){
            overallRows.push({ metric: 'GG ε', value: overall.ggEpsilon.toFixed(4) });
          }
          if(!isLognormalRm && Number.isFinite(overall.ggP)){
            overallRows.push({ metric: 'p-value (GG)', value: createPValueCell(overall.ggP), pValueRaw: overall.ggP, inferenceRole: 'overall' });
          }
          if(Number.isFinite(overall.hfEpsilon)){
            overallRows.push({ metric: 'HF ε', value: overall.hfEpsilon.toFixed(4) });
          }
          if(Number.isFinite(overall.hfP)){
            overallRows.push({
              metric:isLognormalRm?'p-value (HF, supplementary)':'p-value (HF)',
              value:createPValueCell(overall.hfP),
              pValueRaw:overall.hfP,
              inferenceRole:'overall'
            });
          }
        }
        model.tables.push({
          caption: 'Overall test summary',
          section: 'summary',
          columns: [
            { key: 'metric', label: 'Metric', align: 'left', index: 0 },
            { key: 'value', label: 'Value', align: 'left', index: 1 }
          ],
          rows: overallRows,
          footnotes: overallFootnotes.slice(),
          options: { fileName: 'box-overall-test', contextLabel: 'box-overall' }
        });
      }

      const ratioScale=analysisPlan.lognormal || analysisPlan.id==='ratioT' || pairs.some(pair=>pair.differenceScale==='ratio');
      const ciLabel=`${formatPercentLabel(ciLevel)}${lognormalRepeatedMeasures?' nominal':ciType==='sidak-adjusted-marginal'?' Sidak-adjusted':ciType==='simultaneous'?' simultaneous':(ciType==='nominal' && postHocMode==='anovaPooled'?' nominal':'')} CI`;
      const pairRows = pairs.map(pr => ({
        comparison: `${pr.labelA ?? labels[pr.a]} vs ${pr.labelB ?? labels[pr.b]}`,
        statistic: `${pr.statName} = ${Number.isFinite(pr.stat) ? pr.stat.toFixed(4) : '-'}`,
        df: Number.isFinite(pr.df) ? pr.df.toFixed(2) : (pr.df === Infinity ? 'Infinity' : '-'),
        difference: Number.isFinite(pr.diff) ? formatStatNumber(pr.diff) : '-',
        ci: formatConfidenceInterval(pr.ciLow,pr.ciHigh),
        padj: createPValueCell(pr.adjP),
        ...(lognormalRepeatedMeasures ? {} : {
          effectParametric:pr.effectParametric,
          effectNonParametric:pr.effectNonParametric
        })
      }));
      if(referenceLabel){
        footnotes.push(`Reference group: ${referenceLabel}`);
      }
      if(lognormalRepeatedMeasures){
        footnotes.push('Confidence intervals are nominal per-comparison intervals; p-values use the stated multiplicity correction.');
      }
      if(!lognormalRepeatedMeasures){
        effectFootnotes.forEach(note => footnotes.push(note));
      }
      const postHocPLabels = {
        tukey: 'p (Tukey HSD)',
        gamesHowell: 'p (Games-Howell)',
        tamhaneT2: 'p (Tamhane T2)',
        nemenyi: 'p (Nemenyi)',
        dunnettTest:'p (Dunnett)',
        dunnettT3Test:'p (Dunnett T3)',
        dunnett: 'p (Pooled t + Sidak versus control)',
        dunnettT3: 'p (Welch + Sidak versus control)'
      };
      const pLabel = postHocPLabels[postHocMode]
        || formatAdjustedPLabel(model.effectiveComparisonMethod, correctionMeta);
      const isSinglePrimaryComparison = !overall && pairs.length === 1;
      model.tables.push({
        caption: isSinglePrimaryComparison
          ? 'Overall test summary'
          : (statsMode === 'reference' ? 'Comparisons vs reference' : 'Pairwise comparisons'),
        section: isSinglePrimaryComparison ? 'summary' : 'comparisons',
        columns: [
          { key: 'comparison', label: 'Comparison', align: 'left', index: 0 },
          { key: 'statistic', label: 'Statistic', align: 'left', index: 1 },
          { key: 'df', label: 'df', align: 'right', index: 2 },
          { key: 'difference', label: ratioScale ? 'Geometric mean ratio (A/B)' : 'Difference', align: 'right', index: 3 },
          { key: 'ci', label: ciLabel, align: 'right', index: 4 },
          { key: 'padj', label: pLabel, align: 'right', index: 5, inferenceRole: 'comparison' },
          ...(lognormalRepeatedMeasures ? [] : [
            { key: 'effectParametric', label: `Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`, align: 'right', index: 6, tooltip: paramEffectMeta.tooltip },
            { key: 'effectNonParametric', label: `Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`, align: 'right', index: 7, tooltip: nonParamEffectMeta.tooltip }
          ])
        ],
        rows: pairRows,
        footnotes,
        options: { fileName: 'box-pairwise-comparisons', contextLabel: 'box-pairs' }
      });
    }

    if(model.ok && !model.message){ model.report=buildBoxStatsReport(model,payload); }
    return model;
  }

  function analyzeGroupedMultipleComparisons(data, options={}){
    const scope=String(options.comparisonScope || 'groupsWithinCondition');
    const correction=options.correction || DEFAULT_CORRECTION;
    const ciLevel=sanitizeStatsCiLevel(options.ciLevel,0.95);
    const rows=[];
    const groupsCount=Number(data.groupsCount)||0;
    const conditionsCount=Number(data.conditionsCount)||0;
    const groupLabels=Array.isArray(data.groupLabels)?data.groupLabels:[];
    const conditionLabels=Array.isArray(data.conditionLabels)?data.conditionLabels:[];
    const observed=Array.isArray(data.observedCellData) && data.observedCellData.length ? data.observedCellData : data.cellData;
    const addComparison=(labelA,labelB,sampleA,sampleB,paired,familyKey)=>{
      const result=paired ? tTestPaired(sampleA,sampleB,{ alternative:'two-sided',ciLevel }) : tTest(sampleA,sampleB,{ alternative:'two-sided',ciLevel });
      if(result?.available===false || !Number.isFinite(result?.p)){
        return;
      }
      rows.push({
        comparison:`${labelA} vs ${labelB}`,
        familyKey,
        method:paired?'Paired t-test':'Welch t-test',
        statistic:result.t,
        df:result.df,
        p:result.p,
        difference:result.diff,
        ciLow:result.ciLow,
        ciHigh:result.ciHigh
      });
    };
    if(scope==='groupsWithinCondition'){
      for(let condition=0; condition<conditionsCount; condition+=1){
        for(let a=0; a<groupsCount; a+=1){
          for(let b=a+1; b<groupsCount; b+=1){
            addComparison(`${groupLabels[a]||`Group ${a+1}`} @ ${conditionLabels[condition]||`Condition ${condition+1}`}`,`${groupLabels[b]||`Group ${b+1}`} @ ${conditionLabels[condition]||`Condition ${condition+1}`}`,observed?.[a]?.[condition]||[],observed?.[b]?.[condition]||[],false,`condition:${condition}`);
          }
        }
      }
    }else if(scope==='conditionsWithinGroup'){
      for(let group=0; group<groupsCount; group+=1){
        for(let a=0; a<conditionsCount; a+=1){
          for(let b=a+1; b<conditionsCount; b+=1){
            const sampleA=[];
            const sampleB=[];
            (Array.isArray(data.allRows)?data.allRows:[]).forEach(row=>{
              const valueA=toFiniteObservation(row?.[group]?.[a]);
              const valueB=toFiniteObservation(row?.[group]?.[b]);
              if(Number.isFinite(valueA)&&Number.isFinite(valueB)){
                sampleA.push(valueA);sampleB.push(valueB);
              }
            });
            addComparison(`${groupLabels[group]||`Group ${group+1}`} @ ${conditionLabels[a]||`Condition ${a+1}`}`,`${groupLabels[group]||`Group ${group+1}`} @ ${conditionLabels[b]||`Condition ${b+1}`}`,sampleA,sampleB,true,`group:${group}`);
          }
        }
      }
    }else if(scope==='groupMarginals'){
      const samples=Array.from({length:groupsCount},()=>[]);
      (Array.isArray(data.allRows)?data.allRows:[]).forEach(row=>{
        for(let group=0;group<groupsCount;group+=1){
          const values=normalizeFiniteSample(row?.[group]);
          if(values.length) samples[group].push(mean(values));
        }
      });
      for(let a=0;a<groupsCount;a+=1){for(let b=a+1;b<groupsCount;b+=1){addComparison(groupLabels[a]||`Group ${a+1}`,groupLabels[b]||`Group ${b+1}`,samples[a],samples[b],false,'group-marginals');}}
    }else if(scope==='conditionMarginals'){
      const samples=Array.from({length:conditionsCount},()=>[]);
      (Array.isArray(data.allRows)?data.allRows:[]).forEach(row=>{
        for(let condition=0;condition<conditionsCount;condition+=1){
          const values=[];
          for(let group=0;group<groupsCount;group+=1){const value=toFiniteObservation(row?.[group]?.[condition]);if(Number.isFinite(value)) values.push(value);}
          samples[condition].push(values.length ? mean(values) : NaN);
        }
      });
      for(let a=0;a<conditionsCount;a+=1){for(let b=a+1;b<conditionsCount;b+=1){addComparison(conditionLabels[a]||`Condition ${a+1}`,conditionLabels[b]||`Condition ${b+1}`,samples[a],samples[b],true,'condition-marginals');}}
    }else{
      const cells=[];
      for(let group=0;group<groupsCount;group+=1){for(let condition=0;condition<conditionsCount;condition+=1){cells.push({label:`${groupLabels[group]||`Group ${group+1}`} @ ${conditionLabels[condition]||`Condition ${condition+1}`}`,values:observed?.[group]?.[condition]||[]});}}
      for(let a=0;a<cells.length;a+=1){for(let b=a+1;b<cells.length;b+=1){addComparison(cells[a].label,cells[b].label,cells[a].values,cells[b].values,false,'all-cells');}}
    }
    if(!rows.length){return {ok:false,message:'No grouped comparisons could be computed for the selected scope.'};}
    const familyMode=String(options.multiplicityFamily||'within-scope');
    const buckets=new Map();
    rows.forEach(row=>{
      const key=familyMode==='global'?'global':row.familyKey;
      if(!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(row);
    });
    let hasAdjustedFamily=false;
    buckets.forEach(bucket=>{
      const familyCorrection=resolveEffectiveComparisonCorrection(bucket.map(row=>row.p),correction);
      if(familyCorrection.hasAdjustment){
        hasAdjustedFamily=true;
      }
      bucket.forEach((row,index)=>{
        const adjusted=familyCorrection.adjustedValues?.[index];
        row.adjP=Number.isFinite(adjusted)?adjusted:row.p;
      });
    });
    const effectiveComparisonMethod=hasAdjustedFamily ? correction : 'none';
    const correctionMeta=resolveCorrectionMeta(effectiveComparisonMethod,rows.length);
    const correctionFootnote=hasAdjustedFamily
      ? (familyMode==='global'
        ? correctionMeta.footnote
        : `${correctionMeta.label} multiplicity control was applied separately within each family containing more than one comparison.`)
      : null;
    return {
      ok:true,
      caption:'Grouped Multiple Comparisons',
      section:'comparisons',
      columns:[
        {key:'comparison',label:'Comparison',align:'left'},
        {key:'method',label:'Test',align:'left'},
        {key:'statisticText',label:'Statistic',align:'right'},
        {key:'dfText',label:'df',align:'right'},
        {key:'differenceText',label:'Difference',align:'right'},
        {key:'ciText',label:`${formatPercentLabel(ciLevel)} CI`,align:'right'},
        {key:'pText',label:'p-value',align:'right',inferenceRole:hasAdjustedFamily?'raw':'comparison'},
        ...(hasAdjustedFamily ? [{key:'adjPText',label:formatAdjustedPLabel(effectiveComparisonMethod,correctionMeta),align:'right',inferenceRole:'comparison'}] : [])
      ],
      rows:rows.map(row=>({
        ...row,
        statisticText:formatStatNumber(row.statistic),
        dfText:formatStatNumber(row.df,2),
        differenceText:formatStatNumber(row.difference),
        ciText:Number.isFinite(row.ciLow)&&Number.isFinite(row.ciHigh)?`${formatStatNumber(row.ciLow)} to ${formatStatNumber(row.ciHigh)}`:'-',
        pText:createPValueCell(row.p),
        ...(hasAdjustedFamily ? {adjPText:createPValueCell(row.adjP)} : {})
      })),
      footnotes:[correctionFootnote,`Multiplicity families: ${familyMode==='global'?'one global family':'separate families within the selected scope'}.`].filter(Boolean),
      options:{fileName:'box-grouped-multiple-comparisons',contextLabel:'box-grouped-multiple-comparisons'},
      correctionCount:rows.length,
      effectiveComparisonMethod,
      analysisId:'multipleComparisons'
    };
  }

  function buildGroupedStatsReport(analysis,resultModel,summary,grouped,payload){
    const labels={
      twoWayAnova:'Two-way ANOVA',
      rowRandomMixed:'Rows-random repeated-measures model',
      nestedRepeatedTwoWay:'Two-way mixed ANOVA with subjects nested within groups',
      threeWayAnova:'Unreplicated three-factor ANOVA (ABC as error)',
      rowTTests:'Row-wise t-tests',
      multipleComparisons:'Grouped multiple comparisons'
    };
    const label=labels[analysis] || resultModel?.caption || analysis;
    const inferenceSnapshot=normalizeEffectiveInferenceSnapshot(payload,resultModel);
    const effectiveComparisonMethod=String(resultModel?.effectiveComparisonMethod || inferenceSnapshot?.comparisons?.method || 'none');
    const inferenceParts=describeInferenceSnapshot(inferenceSnapshot);
    const groupCountText=`${summary.groupsCount} ${Number(summary.groupsCount) === 1 ? 'group' : 'groups'}`;
    const conditionCountText=`${summary.conditionsCount} ${Number(summary.conditionsCount) === 1 ? 'condition' : 'conditions'}`;
    const completeRowCountText=`${summary.rowsWithData} complete ${Number(summary.rowsWithData) === 1 ? 'row' : 'rows'}`;
    const repeatedMeasures=resultModel?.repeatedMeasures || null;
    const isRowRandomRepeated=analysis==='rowRandomMixed' && repeatedMeasures?.schemaVersion==='box-row-random-sphericity-v1';
    const groupedComparisonMethod = analysis === 'multipleComparisons'
      ? (() => {
        const scopeLabels={
          groupsWithinCondition:'groups within each condition',
          conditionsWithinGroup:'conditions within each group',
          groupMarginals:'group marginal means',
          conditionMarginals:'condition marginal means',
          cellMeans:'all cell means'
        };
        const scope=String(grouped.comparisonScope || 'groupsWithinCondition');
        const scopeLabel=scopeLabels[scope] || 'the selected comparison scope';
        const comparisonRows=Array.isArray(resultModel?.rows) ? resultModel.rows : [];
        const tests=[...new Set(comparisonRows.map(row=>String(row?.method || '').trim()).filter(Boolean))];
        const testText=tests.length
          ? tests.map(test=>comparisonRows.length === 1 || !/t-test$/.test(test) ? test : `${test}s`).join(' and ')
          : 'the selected pairwise tests';
        const familyText=grouped.multiplicityFamily === 'global'
          ? `${comparisonRows.length} comparisons formed one global multiplicity family.`
          : 'Comparisons were grouped into separate families within the selected scope.';
        const configuredCorrection=String(payload.statsCorrection || DEFAULT_CORRECTION).toLowerCase();
        let correctionText;
        if(configuredCorrection === 'none'){
          correctionText='No multiplicity adjustment was selected.';
        }else if(resultModel?.effectiveComparisonMethod && resultModel.effectiveComparisonMethod !== 'none'){
          const correctionLabel=resolveCorrectionMeta(resultModel.effectiveComparisonMethod,comparisonRows.length)?.label || resultModel.effectiveComparisonMethod;
          correctionText=`${correctionLabel} adjustment was applied to families containing more than one comparison.`;
        }else{
          correctionText='No adjustment was needed because each family contained at most one comparison.';
        }
        return `Grouped multiple comparisons were computed for ${scopeLabel} using ${testText}. ${familyText} ${correctionText}`;
      })()
      : null;
    const designMethod = analysis === 'nestedRepeatedTwoWay'
      ? 'Independent subjects are nested within groups and measured under exactly two conditions. Data must be complete and balanced, with approximately normal residuals and homogeneous group-level error variances. Group is tested against subject-within-group error; condition and interaction use subject-within-group-by-condition error.'
      : (isRowRandomRepeated
        ? `Each complete subject is measured at every Group × Condition cell (${repeatedMeasures.subjectCount} independent complete subjects); incomplete subject rows are excluded. The model assumes approximately normal contrast errors. Effect-specific Greenhouse–Geisser corrected degrees of freedom and p-values are the primary inference; Huynh–Feldt results are supplementary. No formal sphericity test is performed.`
        : groupedComparisonMethod);
    const repeatedEffectResults=isRowRandomRepeated
      ? Object.entries({group:'Group',condition:'Condition',interaction:'Group × Condition'}).map(([key,label])=>{
        const effect=repeatedMeasures.effects[key];
        const gg=effect?.gg;
        const hf=effect?.hf;
        const ggText=gg?.available
          ? `GG df = (${formatStatNumber(gg.df1,3)}, ${formatStatNumber(gg.df2,3)}), p(GG) = ${formatP(gg.p)}`
          : `GG inference unavailable (${gg?.reason || effect?.reason || 'not estimable'})`;
        const hfText=hf?.available
          ? `HF ε = ${formatStatNumber(hf.epsilon,3)}, p(HF) = ${formatP(hf.p)}`
          : `HF supplementary inference unavailable (${hf?.reason || 'not estimable'})`;
        return `${label}: ${ggText}; ${hfText}.`;
      })
      : [];
    const methodsParts=[
      `For ${label.toLowerCase()}, the analysis covered ${groupCountText}, ${conditionCountText}, and ${completeRowCountText}.`,
      designMethod,
      ...inferenceParts
    ].filter(Boolean);
    return {
      methodsText:methodsParts.join(' '),
      resultsText:[
        `The ${label} results are reported in the accompanying table${summary.partialRowsSkipped ? `; ${summary.partialRowsSkipped} incomplete row${summary.partialRowsSkipped === 1 ? '' : 's'} were excluded from complete-case factorial calculations` : ''}.`,
        ...repeatedEffectResults
      ].join(' '),
      methodsParts,
      resultsParts:[
        `The ${label} results are reported in the accompanying table${summary.partialRowsSkipped ? `; ${summary.partialRowsSkipped} incomplete row${summary.partialRowsSkipped === 1 ? '' : 's'} were excluded from complete-case factorial calculations` : ''}.`,
        ...repeatedEffectResults
      ],
      analysisSpec:{
        schemaVersion:isRowRandomRepeated?'box-stats-spec-v8':'box-stats-spec-v7',
        inference:inferenceSnapshot,
        analysisId:analysis,
        analysisLabel:label,
        mode:'grouped',
        groupsCount:summary.groupsCount,
        conditionsCount:summary.conditionsCount,
        rowsWithData:summary.rowsWithData,
        partialRowsSkipped:summary.partialRowsSkipped,
        ...(isRowRandomRepeated ? {
          experimentalUnit:'subject-repeated-across-every-group-condition-cell',
          rowRandomSphericityVersion:BOX_ROW_RANDOM_SPHERICITY_VERSION,
          repeatedMeasures,
          primaryWithinSubjectCorrection:'greenhouse-geisser',
          supplementaryWithinSubjectCorrection:'huynh-feldt',
          errorTerms:{
            group:'group-by-subject',
            condition:'condition-by-subject',
            interaction:'group-by-condition-by-subject'
          },
          assumptions:['complete-case-subject-alignment','normal-contrast-errors']
        } : {}),
        ...(analysis === 'nestedRepeatedTwoWay' ? {
          experimentalUnit:'subject-within-independent-group',
          repeatedFactor:'condition',
          errorTerms:{
            group:'subjects-within-group',
            condition:'subjects-within-group-by-condition',
            interaction:'subjects-within-group-by-condition'
          },
          assumptions:[
            'complete-balanced-data',
            'two-conditions',
            'independent-subjects',
            'normal-errors',
            'homogeneous-group-error-variances'
          ]
        } : {}),
        comparisonScope:grouped.comparisonScope || null,
        multiplicityFamily:grouped.multiplicityFamily || null,
        correction:effectiveComparisonMethod,
        configuredCorrection:payload.statsCorrection || DEFAULT_CORRECTION
      }
    };
  }

  function computeGroupedStatsModel(payload){
    const grouped=payload.grouped || {};
    const data=grouped.data || {};
    const summary={
      groupsCount:data.groupsCount || 0,
      conditionsCount:data.conditionsCount || 0,
      rowsWithData:data.rowsWithData || 0,
      partialRowsSkipped:data.partialRowsSkipped || 0
    };
    if(!data.ok){
      return {mode:'grouped',ok:false,message:data.message || 'Unable to compute grouped statistics.',groupedSummary:summary,tables:[],correctionCount:0};
    }
    const aliases={twoWayMixed:'rowRandomMixed',threeWayMixed:'rowRandomMixed'};
    const analysis=aliases[grouped.analysis] || grouped.analysis || 'twoWayAnova';
    let resultModel=null;
    if(analysis==='twoWayAnova') resultModel=analyzeTwoWayAnova(data);
    else if(analysis==='rowRandomMixed') resultModel=analyzeTwoWayMixed(data);
    else if(analysis==='nestedRepeatedTwoWay') resultModel=analyzeNestedRepeatedTwoWay(data);
    else if(analysis==='threeWayAnova') resultModel=analyzeThreeWayAnova(data);
    else if(analysis==='rowTTests') resultModel=analyzeRowWiseTTests(data,payload.statsCorrection);
    else if(analysis==='multipleComparisons') resultModel=analyzeGroupedMultipleComparisons(data,{
      comparisonScope:grouped.comparisonScope,
      multiplicityFamily:grouped.multiplicityFamily,
      correction:payload.statsCorrection,
      ciLevel:payload.statsCiLevel
    });
    else return {mode:'grouped',ok:false,message:`Unknown grouped analysis: ${analysis}.`,groupedSummary:summary,tables:[],correctionCount:0,analysisId:analysis};
    if(!resultModel || !resultModel.ok){
      return {mode:'grouped',ok:false,message:resultModel?.message || 'Unable to compute grouped statistics for the selected analysis.',groupedSummary:summary,tables:[],correctionCount:0,analysisId:analysis};
    }
    const rowRandomResult=analysis==='rowRandomMixed' ? resultModel : null;
    const tables=rowRandomResult
      ? [rowRandomResult.table,rowRandomResult.correctionTable].filter(Boolean)
      : [resultModel];
    const model={
      mode:'grouped',ok:true,message:null,analysisId:analysis,
      groupedSummary:summary,tables,correctionCount:resultModel.correctionCount || 0,
      effectiveComparisonMethod:resultModel.effectiveComparisonMethod || null,
      ...(rowRandomResult ? {repeatedMeasures:rowRandomResult.repeatedMeasures} : {})
    };
    model.report=buildGroupedStatsReport(analysis,resultModel,summary,grouped,payload);
    return model;
  }

  function makeInferencePValueCell(value, inferenceSpec){
    if(!inferenceSpec){
      return value;
    }
    const numeric = toNumericPValue(value?.value ?? value?.raw ?? value);
    const fallback = value && typeof value === 'object'
      ? (value.fallback ?? value.text ?? String(value.value ?? ''))
      : String(value ?? '');
    return {
      type: 'pValue',
      value: Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : NaN,
      fallback,
      __statsInference: inferenceSpec
    };
  }

  function resolveInferenceSpecForRole(role, overallSpec, comparisonSpec){
    const normalized = String(role || '').trim().toLowerCase();
    if(normalized === 'overall'){
      return overallSpec || null;
    }
    if(normalized === 'comparison'){
      return comparisonSpec || null;
    }
    return null;
  }

  function annotateMetricValueInference(table, overallSpec, comparisonSpec){
    if(!Array.isArray(table?.rows) || !table.rows.length){
      return false;
    }
    const hasMetricValueColumns = Array.isArray(table.columns)
      && table.columns.some(column => column?.key === 'metric')
      && table.columns.some(column => column?.key === 'value');
    if(!hasMetricValueColumns){
      return false;
    }
    let changed = false;
    table.rows.forEach(row => {
      const inferenceSpec = resolveInferenceSpecForRole(row?.inferenceRole, overallSpec, comparisonSpec);
      if(!inferenceSpec){
        return;
      }
      const raw = toNumericPValue(row?.pValueRaw ?? row?.rawPValue ?? row?.valueRaw ?? row?.value?.value);
      if(!Number.isFinite(raw) || raw < 0 || raw > 1){
        return;
      }
      row.value = makeInferencePValueCell({ value: raw, fallback: row.value?.fallback ?? row.value }, inferenceSpec);
      changed = true;
    });
    return changed;
  }

  function attachInferenceMetadataToTables(model,payload){
    const tables=Array.isArray(model?.tables)?model.tables:[];
    if(!tables.length){
      return model;
    }
    const snapshot=normalizeEffectiveInferenceSnapshot(payload,model);
    const overallSpec=snapshot?.overall || null;
    const comparisonSpec=snapshot?.comparisons || null;
    tables.forEach(table=>{
      if(!Array.isArray(table?.columns) || String(table.section || '').toLowerCase()==='diagnostics'){
        return;
      }
      annotateMetricValueInference(table,overallSpec,comparisonSpec);
      table.columns.forEach(column=>{
        const inferenceSpec = resolveInferenceSpecForRole(column?.inferenceRole, overallSpec, comparisonSpec);
        if(inferenceSpec){
          column.inference = inferenceSpec;
        }
      });
    });
    return model;
  }

  function computeBoxStatsModel(payload){
    Shared.setDebugLogging?.(payload?.debug === true);
    ensureStats();
    ensureJStat();
    const normalizedPayload=payload || {};
    const model=normalizedPayload.mode === 'grouped'
      ? computeGroupedStatsModel(normalizedPayload)
      : computeSingleStatsModel(normalizedPayload);
    return attachInferenceMetadataToTables(model,normalizedPayload);
  }

  function finalizePValueResult(result, label){
    const candidate=result?.p ?? result?.pValue;
    if(isValidProbability(candidate)){
      return result;
    }
    return {
      ...(result && typeof result === 'object' ? result : {}),
      available:false,
      message:result?.message || `${label} p-value unavailable.`
    };
  }



  const api = {
    computeBoxStatsModel,
    alignCompleteRows,
    computeGroupedStatsModel,
    computeSingleStatsModel,
    computeSwarmOffsets,
    computeTraceSummary,
    computeAssumptionDiagnostics,
    computeQQPoints,
    computeDagostino,
    computeShapiroWilk,
    computeVarianceDiagnostics,
    computeBartlettVarianceDiagnostics,
    computeDistributionComparison,
    computeLinearTrendTest,
    preprocessStatsGroups,
    subtractRankObservation,
    sanitizeOutlierMode,
    sanitizeOutlierAlpha,
    sanitizeOutlierQ,
    tTest: (...args) => finalizePValueResult(tTest(...args), 'Welch t-test'),
    tTestEqualVariance: (...args) => finalizePValueResult(tTestEqualVariance(...args), 'Student t-test'),
    tTestPaired: (...args) => finalizePValueResult(tTestPaired(...args), 'Paired t-test'),
    tTestOneSample: (...args) => finalizePValueResult(tTestOneSample(...args), 'One-sample t-test'),
    ratioTTest: (...args) => finalizePValueResult(ratioTTest(...args), 'Ratio t-test'),
    lognormalTTestEqualVariance: (...args) => finalizePValueResult(lognormalTTestEqualVariance(...args), 'Lognormal t-test'),
    lognormalWelchTTest: (...args) => finalizePValueResult(lognormalWelchTTest(...args), 'Lognormal Welch t-test'),
    kolmogorovSmirnovTwoSample: (...args) => finalizePValueResult(kolmogorovSmirnovTwoSample(...args), 'Kolmogorov-Smirnov test'),
    resolveSingleAnalysisPlan,
    wilcoxonOneSample: (...args) => finalizePValueResult(wilcoxonOneSample(...args), 'Wilcoxon signed-rank test'),
    mannWhitney: (...args) => finalizePValueResult(mannWhitney(...args), 'Mann-Whitney test'),
    wilcoxonSignedRank: (...args) => finalizePValueResult(wilcoxonSignedRank(...args), 'Wilcoxon signed-rank test'),
    anova: (...args) => finalizePValueResult(anova(...args), 'ANOVA'),
    kruskalWallis: (...args) => finalizePValueResult(kruskalWallis(...args), 'Kruskal-Wallis test'),
    computeRepeatedMeasuresAnova: (...args) => finalizePValueResult(computeRepeatedMeasuresAnova(...args), 'Repeated-measures ANOVA'),
    computeLognormalRepeatedMeasuresAnova: (...args) => finalizePValueResult(computeLognormalRepeatedMeasuresAnova(...args), 'Lognormal repeated-measures ANOVA'),
    computeFriedmanTest: (...args) => finalizePValueResult(computeFriedmanTest(...args), 'Friedman test'),
    computeWelchAnova: (...args) => finalizePValueResult(computeWelchAnova(...args), 'Welch ANOVA'),
    studentizedRangeCDF,
    studentizedMaximumSF,
    computeDunnettComparisons,
    computeDunnettT3Comparisons,
    detectRoutOutliers,
    studentizedRangeSF,
    resolveStudentizedRangeCritical,
    resolveStudentizedRangeCriticalValues,
    computeTukeyComparisons,
    computeGamesHowellComparisons,
    computeTamhaneT2Comparisons,
    computeNemenyiComparisons,
    computeControlSidakComparisons,
    computeDunnComparisons,
    analyzeTwoWayAnova,
    analyzeTwoWayMixed,
    analyzeNestedRepeatedTwoWay,
    analyzeThreeWayAnova,
    analyzeRowWiseTTests,
    analyzeGroupedMultipleComparisons,
    listEffectOptions,
    resolveEffectOptionMeta,
    resolvePostHocProcedure,
    listPostHocOptions,
    getPostHocSummary,
    applyPValueCorrection,
    resolveCorrectionMeta,
    formatP,
    formatStatNumber,
    quantileFromUnsorted,
    computeVectorStats,
    computeEffectSizeMetrics,
    constants: {
      DEFAULT_CORRECTION,
      ASSUMPTION_ALPHA,
      ASSUMPTION_QQ_SAMPLE_LIMIT,
      POST_HOC_ORDER
    }
  };

  Shared.boxStatsModel = Object.assign(Shared.boxStatsModel || {}, api);

  if(typeof module !== 'undefined' && module.exports){
    module.exports = Shared.boxStatsModel;
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
