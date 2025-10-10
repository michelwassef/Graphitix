(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const box = Components.box = Components.box || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  box.__installed = true;
  box.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: box component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: box component awaiting Shared.tableImport helpers');
  }

  // PART: UTILS
  const NS='http://www.w3.org/2000/svg';
  const DEFAULT_BOX_COLORS=['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854','#ffd92f','#e5c494','#b3b3b3'];
  const DEFAULT_ROWS=100, DEFAULT_COLS=10;
  const DEFAULT_AXIS_COLOR='#000000';
  const ANN_BASE_OFFSET=25;
  const ANN_LEVEL_GAP=25;
  const DEFAULT_CORRECTION='bonferroni';
  const ASSUMPTION_ALPHA=0.05;
  function createDefaultAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null },
      y: { tickInterval: null }
    };
  }
  function fallbackSanitizeP(value){
    const num=Number(value);
    if(!Number.isFinite(num)||num<0){
      return 0;
    }
    if(num>1){
      return 1;
    }
    return num;
  }
  function fallbackClampUnit(value){
    if(!Number.isFinite(value)){
      return 1;
    }
    if(value<0){
      return 0;
    }
    if(value>1){
      return 1;
    }
    return value;
  }
  function fallbackAdjustNone(values){
    return values.map(v=>fallbackClampUnit(fallbackSanitizeP(v)));
  }
  function fallbackAdjustBonferroni(values){
    const m=values.length||1;
    return values.map(v=>fallbackClampUnit(fallbackSanitizeP(v)*m));
  }
  function fallbackAdjustSidak(values){
    const m=values.length||1;
    return values.map(v=>{
      const p=fallbackSanitizeP(v);
      return fallbackClampUnit(1-Math.pow(1-p,m));
    });
  }
  function fallbackAdjustHolm(values){
    const m=values.length;
    const ordered=values.map((v,index)=>({ p:fallbackSanitizeP(v), index }));
    ordered.sort((a,b)=>a.p-b.p);
    const adjusted=new Array(m).fill(1);
    let running=0;
    ordered.forEach((entry,idx)=>{
      const rank=m-idx;
      const raw=fallbackClampUnit(entry.p*rank);
      running=Math.max(running,raw);
      adjusted[entry.index]=fallbackClampUnit(running);
    });
    return adjusted;
  }
  function fallbackAdjustHochberg(values){
    const m=values.length;
    const ordered=values.map((v,index)=>({ p:fallbackSanitizeP(v), index }));
    ordered.sort((a,b)=>b.p-a.p);
    const adjusted=new Array(m).fill(1);
    let running=1;
    ordered.forEach((entry,idx)=>{
      const rank=idx+1;
      const raw=fallbackClampUnit(entry.p*rank);
      running=Math.min(running,raw);
      adjusted[entry.index]=fallbackClampUnit(running);
    });
    return adjusted;
  }
  function fallbackAdjustBH(values){
    const m=values.length;
    const ordered=values.map((v,index)=>({ p:fallbackSanitizeP(v), index }));
    ordered.sort((a,b)=>a.p-b.p);
    const adjusted=new Array(m).fill(1);
    let running=1;
    for(let i=m-1;i>=0;i--){
      const entry=ordered[i];
      const rank=i+1;
      const raw=fallbackClampUnit((entry.p*m)/rank);
      running=Math.min(running,raw);
      adjusted[entry.index]=fallbackClampUnit(running);
    }
    return adjusted;
  }
  function fallbackAdjustBY(values){
    const m=values.length;
    const harmonic=Array.from({ length: Math.max(m,1) },(_,idx)=>1/(idx+1)).reduce((sum,val)=>sum+val,0);
    const ordered=values.map((v,index)=>({ p:fallbackSanitizeP(v), index }));
    ordered.sort((a,b)=>a.p-b.p);
    const adjusted=new Array(m).fill(1);
    let running=1;
    for(let i=m-1;i>=0;i--){
      const entry=ordered[i];
      const rank=i+1;
      const raw=fallbackClampUnit((entry.p*m*harmonic)/rank);
      running=Math.min(running,raw);
      adjusted[entry.index]=fallbackClampUnit(running);
    }
    return adjusted;
  }
  const FALLBACK_CORRECTION_META={
    none:{ label:'None (unadjusted)', shortLabel:'None', footnote:count=>`P-values are unadjusted${count>0?` (${count} comparison${count===1?'':'s'})`:''}.`, adjust:fallbackAdjustNone },
    bonferroni:{ label:'Bonferroni', shortLabel:'Bonferroni', footnote:count=>`Bonferroni-adjusted P values across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustBonferroni },
    holm:{ label:'Holm', shortLabel:'Holm', footnote:count=>`Holm correction applied across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustHolm },
    sidak:{ label:'Šidák', shortLabel:'Šidák', footnote:count=>`Šidák correction applied across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustSidak },
    hochberg:{ label:'Hochberg', shortLabel:'Hochberg', footnote:count=>`Hochberg correction applied across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustHochberg },
    bh:{ label:'Benjamini–Hochberg (FDR)', shortLabel:'BH', footnote:count=>`Benjamini–Hochberg FDR correction across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustBH },
    by:{ label:'Benjamini–Yekutieli (FDR)', shortLabel:'BY', footnote:count=>`Benjamini–Yekutieli FDR correction across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustBY }
  };
  function fallbackCorrectionsList(){
    return Object.entries(FALLBACK_CORRECTION_META).map(([value,cfg])=>({ value, label:cfg.label }));
  }
  function getAvailableCorrections(){
    const statsHelpers=Shared.stats;
    if(statsHelpers && typeof statsHelpers.listCorrections==='function'){
      try{
        const list=statsHelpers.listCorrections();
        if(Array.isArray(list) && list.length){
          console.debug('Debug: box corrections sourced from Shared.stats',{ methods:list.map(item=>item.value) });
          return list.map(item=>({ value:item.value, label:item.label }));
        }
      }catch(err){
        console.debug('Debug: box getAvailableCorrections Shared.stats error',{ message:err?.message });
      }
    }
    const fallback=fallbackCorrectionsList();
    console.debug('Debug: box getAvailableCorrections fallback',{ methods:fallback.map(item=>item.value) });
    return fallback;
  }
  function ensureValidCorrectionValue(value){
    const options=getAvailableCorrections();
    const has=options.some(opt=>opt.value===value);
    if(has){
      return value;
    }
    const fallbackValue=options[0]?.value || DEFAULT_CORRECTION;
    console.debug('Debug: box ensureValidCorrectionValue fallback',{ requested:value, fallback:fallbackValue });
    return fallbackValue;
  }
  function resolveCorrectionMeta(method,count){
    const statsHelpers=Shared.stats;
    if(statsHelpers && typeof statsHelpers.getCorrectionMeta==='function'){
      try{
        const metaRaw=statsHelpers.getCorrectionMeta(method);
        const note=typeof metaRaw?.footnote==='function'?metaRaw.footnote(count || 0):metaRaw?.footnote;
        const resolved={
          key:metaRaw?.key || method || DEFAULT_CORRECTION,
          label:metaRaw?.label || metaRaw?.shortLabel || method || DEFAULT_CORRECTION,
          shortLabel:metaRaw?.shortLabel || metaRaw?.label || method || DEFAULT_CORRECTION,
          footnote:note || ''
        };
        console.debug('Debug: box resolveCorrectionMeta via Shared.stats',{ method:resolved.key, count });
        return resolved;
      }catch(err){
        console.debug('Debug: box resolveCorrectionMeta error',{ method, message:err?.message });
      }
    }
    const fallbackKey=FALLBACK_CORRECTION_META[method]?method:DEFAULT_CORRECTION;
    const cfg=FALLBACK_CORRECTION_META[fallbackKey];
    const footnote=typeof cfg.footnote==='function'?cfg.footnote(count || 0):cfg.footnote;
    console.debug('Debug: box resolveCorrectionMeta fallback',{ method, resolved:fallbackKey, count });
    return {
      key:fallbackKey,
      label:cfg.label,
      shortLabel:cfg.shortLabel || cfg.label,
      footnote:footnote || ''
    };
  }
  function applyPValueCorrection(values,method){
    const arr=Array.isArray(values)?values.slice():[];
    const statsHelpers=Shared.stats;
    if(statsHelpers && typeof statsHelpers.adjustPValues==='function'){
      try{
        const adjusted=statsHelpers.adjustPValues(arr,{ method });
        if(Array.isArray(adjusted) && adjusted.length===arr.length){
          console.debug('Debug: box applyPValueCorrection via Shared.stats',{ method, count:arr.length });
          return adjusted;
        }
      }catch(err){
        console.debug('Debug: box applyPValueCorrection Shared.stats error',{ method, message:err?.message });
      }
    }
    const fallbackKey=FALLBACK_CORRECTION_META[method]?method:DEFAULT_CORRECTION;
    const adjustFn=FALLBACK_CORRECTION_META[fallbackKey].adjust;
    console.debug('Debug: box applyPValueCorrection fallback',{ method, fallback:fallbackKey, count:arr.length });
    return adjustFn(arr);
  }

  function shadeColor(color, percent){
    const num=parseInt(color.slice(1),16);
    const amt=Math.round(2.55*percent);
    const R=(num>>16)+amt; const G=(num>>8&0x00FF)+amt; const B=(num&0x0000FF)+amt;
    const newColor='#'+(0x1000000+(R<255?(R<0?0:R):255)*0x10000+(G<255?(G<0?0:G):255)*0x100+(B<255?(B<0?0:B):255)).toString(16).slice(1);
    console.debug('Debug: shadeColor',{color,percent,newColor}); // Debug
    return newColor;
  }

  function computeSampleSpreadFactor(sampleSize){
    const n = Number(sampleSize) || 0;
    if(n <= 1){
      console.debug('Debug: computeSampleSpreadFactor minimal',{ sampleSize: n, factor: 0.2 });
      return 0.2;
    }
    const sqrtScaled = Math.sqrt(n) / 7;
    const factor = Math.min(1, Math.max(0.2, sqrtScaled));
    console.debug('Debug: computeSampleSpreadFactor',{ sampleSize: n, sqrtScaled, factor });
    return factor;
  }

  function computeSwarmOffsets(points, options){
    const entries = Array.isArray(points) ? points.slice() : [];
    const sampleSize = Number(options?.sampleSize) || entries.length;
    const pointRadiusValue = Number(options?.pointRadius) || 1;
    const axisSpacing = Number(options?.axisSpacing) || 0;
    const orientation = options?.orientation || 'vertical';
    const spreadFactor = computeSampleSpreadFactor(sampleSize);
    const baseMax = axisSpacing * 0.1;
    const minOffset = pointRadiusValue * 1.1;
    let maxOffset = Math.max(minOffset, baseMax * spreadFactor);
    if(!Number.isFinite(maxOffset) || maxOffset <= 0){
      maxOffset = minOffset;
    }
    const searchStep = Math.max(1, pointRadiusValue * 0.75);
    const minDistance = Math.max(pointRadiusValue * 2 + 0.5, searchStep);
    const minDistanceSq = minDistance * minDistance;
    const placed = [];
    const offsetsMap = new Map();
    const sorted = entries.slice().sort((a, b) => (Number(a?.coord) || 0) - (Number(b?.coord) || 0));
    let maxUsed = 0;
    console.debug('Debug: computeSwarmOffsets start',{ orientation, sampleSize, spreadFactor, axisSpacing, baseMax, minOffset, maxOffset, pointRadiusValue });
    sorted.forEach(entry => {
      if(!entry || typeof entry.index !== 'number'){
        return;
      }
      const coord = Number(entry.coord) || 0;
      const collides = candidate => {
        for(const placedEntry of placed){
          const dx = candidate - placedEntry.offset;
          const dy = coord - placedEntry.coord;
          if(dx * dx + dy * dy < minDistanceSq){
            return true;
          }
        }
        return false;
      };
      let chosen = 0;
      if(collides(0)){
        let step = searchStep;
        let placedFlag = false;
        let guard = 0;
        while(step <= maxOffset + searchStep && !placedFlag && guard < 250){
          for(const dir of [-1, 1]){
            const candidate = dir * step;
            if(Math.abs(candidate) > maxOffset + 0.01){
              continue;
            }
            if(!collides(candidate)){
              chosen = candidate;
              placedFlag = true;
              break;
            }
          }
          step += searchStep;
          guard++;
        }
        if(!placedFlag){
          const fallbackDir = placed.length % 2 === 0 ? 1 : -1;
          chosen = fallbackDir * maxOffset;
          console.debug('Debug: computeSwarmOffsets fallback',{ orientation, sampleSize, fallbackDir, maxOffset });
        }
      }
      placed.push({ offset: chosen, coord });
      offsetsMap.set(entry.index, chosen);
      if(Math.abs(chosen) > maxUsed){
        maxUsed = Math.abs(chosen);
      }
    });
    const offsets = entries.map(entry => offsetsMap.get(entry.index) || 0);
    console.debug('Debug: computeSwarmOffsets result',{ orientation, sampleSize, spreadFactor, maxOffset, maxOffsetUsed: maxUsed, pointCount: entries.length });
    return { offsets, maxOffsetUsed: maxUsed, spreadFactor, maxOffset };
  }
  const makeEditable = (el,onChange,options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if (typeof fn === 'function') {
      return fn(el,onChange,options);
    }
    console.warn('box component makeEditable fallback missing');
    return undefined;
  };
  const serializeSvg = (svgEl, options) => {
    const fn = Shared.serializeCleanSVG || global.serializeCleanSVG;
    if (typeof fn === 'function') {
      return fn(svgEl, options);
    }
    if (!svgEl) return '';
    const serializer = new (global.XMLSerializer || XMLSerializer)();
    return serializer.serializeToString(svgEl);
  };
  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('box')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'box', debugLabel: 'box-viewport-fallback', ...options });
        return;
      }
      console.debug('Debug: box ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  console.debug('Debug: box component DOM helpers resolved', {
    hasSharedEditable: typeof Shared.makeEditable === 'function',
    hasSharedResize: typeof Shared.graphViewport?.ensure === 'function' || typeof Shared.autoResizeSvg === 'function',
    hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
  }); // Debug: helper resolution summary
  const markFontEditable = (node, role, key) => {
    if (!node) { return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if (fontControls && typeof fontControls.markText === 'function') {
      fontControls.markText(node, { scopeId: 'box', role, key });
    } else if (node.dataset) {
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'box';
      if (role) node.dataset.fontRole = role;
      if (key || role) node.dataset.fontKey = key || role;
    }
    if (!role || role.indexOf('Tick') === -1) {
      console.debug('Debug: box markFontEditable', payload); // Debug: font target tagging summary
    }
  };
  const EFFECT_SIZE_PARAM_OPTIONS=[
    { value:'cohenD', label:"Cohen's d", shortLabel:"Cohen's d", tooltip:"Difference in means scaled by the pooled standard deviation.", format:'decimal' },
    { value:'hedgesG', label:"Hedges' g", shortLabel:"Hedges' g", tooltip:"Small-sample corrected Cohen's d using a bias adjustment.", format:'decimal' }
  ];
  const EFFECT_SIZE_NONPARAM_OPTIONS=[
    { value:'rankBiserial', label:'Rank-biserial r', shortLabel:'Rank-biserial r', tooltip:'Rank-biserial correlation (−1 to 1) comparing favorable vs. unfavorable pairings.', format:'decimal' },
    { value:'commonLanguage', label:'Common language (A)', shortLabel:'Common language A', tooltip:'Probability that a score from the first sample exceeds the second (expressed as a percentage).', format:'percent' }
  ];
  function listEffectOptions(type){
    return type==='parametric'?EFFECT_SIZE_PARAM_OPTIONS.slice():EFFECT_SIZE_NONPARAM_OPTIONS.slice();
  }

  const POST_HOC_META={
    standard:{
      value:'standard',
      label:'Pairwise + correction',
      shortLabel:'Standard',
      tooltip:'Run pairwise tests and adjust P values using the selected multiple-testing correction.',
      applies:context=>context?.mode!=='custom',
      summary:()=>'Pairwise tests with the chosen correction.'
    },
    tukey:{
      value:'tukey',
      label:'Tukey HSD',
      shortLabel:'Tukey',
      tooltip:'Parametric Tukey Honestly Significant Difference using the studentized range distribution (unpaired, ≥3 groups).',
      applies:context=>context && context.mode!=='custom' && context.test==='parametric' && !context.paired && context.groupCount>=3,
      summary:context=>`Tukey HSD on ${context?.groupCount || 0} groups (family-wise adjusted).`
    },
    dunn:{
      value:'dunn',
      label:"Dunn's test",
      shortLabel:'Dunn',
      tooltip:"Non-parametric Dunn's post-hoc test using rank sums (unpaired, ≥3 groups).",
      applies:context=>context && context.mode!=='custom' && context.test==='nonparametric' && !context.paired && context.groupCount>=3,
      summary:context=>`Dunn's rank-based post-hoc across ${context?.groupCount || 0} groups.`
    }
  };
  const POST_HOC_ORDER=['standard','tukey','dunn'];
  function listPostHocOptions(){
    return POST_HOC_ORDER.map(key=>({
      value:key,
      label:POST_HOC_META[key]?.label || key,
      tooltip:POST_HOC_META[key]?.tooltip || ''
    }));
  }
  function isPostHocSupported(method,context){
    const meta=POST_HOC_META[method];
    if(!meta||typeof meta.applies!=='function'){ return false; }
    try{
      return !!meta.applies(context||{});
    }catch(err){
      console.debug('Debug: box isPostHocSupported error',{ method, message:err?.message });
      return false;
    }
  }
  function ensureValidPostHoc(method,context){
    const requested=(typeof method==='string'?method:'').toLowerCase();
    if(requested && isPostHocSupported(requested,context)){
      return requested;
    }
    for(const key of POST_HOC_ORDER){
      if(isPostHocSupported(key,context)){
        if(requested && requested!==key){
          console.debug('Debug: box postHoc fallback',{ requested, fallback:key, context });
        }
        return key;
      }
    }
    console.debug('Debug: box postHoc default to standard',{ requested, context });
    return 'standard';
  }
  function getPostHocSummary(method,context){
    const meta=POST_HOC_META[method];
    if(meta){
      const summary=typeof meta.summary==='function'?meta.summary(context):meta.summary;
      return summary || meta.tooltip || meta.label || method;
    }
    return method || 'standard';
  }

  const ADVISOR_GROUP_OPTIONS=[
    { value:'two', label:'Two groups' },
    { value:'threePlus', label:'Three or more groups' }
  ];
  const ADVISOR_PAIRED_OPTIONS=[
    { value:'unpaired', label:'No, groups are independent' },
    { value:'paired', label:'Yes, measurements are paired/repeated' }
  ];
  const ADVISOR_DISTRIBUTION_OPTIONS=[
    { value:'normal', label:'Yes, roughly bell-shaped' },
    { value:'nonnormal', label:'No, noticeably non-normal' },
    { value:'unsure', label:"I am not sure yet" }
  ];
  const ADVISOR_VARIANCE_OPTIONS=[
    { value:'yes', label:'Yes, variances look similar' },
    { value:'no', label:'No, variances differ a lot' },
    { value:'unsure', label:"Not sure / haven’t checked" }
  ];
  const GROUPED_GOAL_OPTIONS=[
    { value:'interaction', label:'Study group × condition effects together' },
    { value:'perCondition', label:'Compare groups within each condition separately' }
  ];
  const GROUPED_REPEATED_OPTIONS=[
    { value:'yes', label:'Yes, rows are repeated measurements of the same subjects' },
    { value:'no', label:'No, rows are independent observations' }
  ];
  const GROUPED_ROW_FACTOR_OPTIONS=[
    { value:'yes', label:'Yes, include the row/subject dimension as a factor' },
    { value:'no', label:'No, focus on group and condition only' }
  ];

  function normalizeAdvisorGroupAnswer(answer,context){
    const fallback=(context?.groupCount||0)>=3?'threePlus':(context?.groupCount===2?'two':null);
    if(answer==='two'||answer==='threePlus'){ return answer; }
    return fallback;
  }

  function computeGroupedAdvisorRecommendation(rawAnswers,rawContext){
    const answers=rawAnswers || {};
    const context=rawContext || {};
    const groupCount=Number.isFinite(context.groupCount)?context.groupCount:0;
    const conditionCount=Number.isFinite(context.conditionCount)?context.conditionCount:0;
    const rowCount=Number.isFinite(context.rowCount)?context.rowCount:0;
    if(groupCount<2){
      return {
        format:'grouped',
        ready:false,
        message:'Add at least two groups before running the advisor for grouped analyses.',
        missing:['groupedGoal']
      };
    }
    if(conditionCount<1){
      return {
        format:'grouped',
        ready:false,
        message:'Increase the conditions per group to at least one before running grouped analyses.',
        missing:['groupedGoal']
      };
    }
    const goal=answers.groupedGoal;
    if(goal!=='interaction' && goal!=='perCondition'){
      return {
        format:'grouped',
        ready:false,
        message:'Tell the advisor whether you want interaction tests or per-condition comparisons.',
        missing:['groupedGoal']
      };
    }
    const rationale=[];
    const warnings=[];
    if(goal==='perCondition'){
      const summary=`Run row-wise t-tests to compare groups within each of the ${conditionCount} condition${conditionCount===1?'':'s'}.`;
      rationale.push('Row-wise t-tests provide simple group comparisons within each condition.');
      if(!context.ok && context.message){
        warnings.push(context.message);
      }
      if((context.partialRowsSkipped||0)>0){
        warnings.push(`${context.partialRowsSkipped} incomplete row${context.partialRowsSkipped===1?' was':'s were'} skipped; ensure rows are fully populated.`);
      }
      return {
        format:'grouped',
        ready:true,
        analysis:'rowTTests',
        summary,
        rationale,
        warnings,
        detail:{ goal }
      };
    }
    const repeated=answers.groupedRepeated;
    if(repeated!=='yes' && repeated!=='no'){
      return {
        format:'grouped',
        ready:false,
        message:'Specify whether rows represent repeated measurements of the same subjects across conditions.',
        missing:['groupedRepeated'],
        goal
      };
    }
    let includeRowFactor=false;
    if(rowCount>=2){
      const rowAnswer=answers.groupedRowFactor;
      if(rowAnswer!=='yes' && rowAnswer!=='no'){
        return {
          format:'grouped',
          ready:false,
          message:'Tell the advisor whether the row/subject dimension should be included as a factor.',
          missing:['groupedRowFactor'],
          goal,
          repeated:repeated==='yes'
        };
      }
      includeRowFactor=rowAnswer==='yes';
    }else if(answers.groupedRowFactor==='yes'){
      warnings.push('At least two complete rows are required to include the row/subject dimension; defaulting to a two-way model.');
    }
    let analysis='twoWayAnova';
    let summary='Use a two-way ANOVA to assess group and condition main effects plus their interaction.';
    if(includeRowFactor){
      if(repeated==='yes'){
        analysis='threeWayMixed';
        summary='Use a three-way mixed model to evaluate group, condition, and row effects with repeated measurements.';
      }else{
        analysis='threeWayAnova';
        summary='Use a three-way ANOVA to evaluate group, condition, and row factors together.';
      }
    }else if(repeated==='yes'){
      analysis='twoWayMixed';
      summary='Use a two-way mixed model to assess group and condition effects with repeated measurements across conditions.';
    }
    if(repeated==='yes'){
      rationale.push('Rows track repeated observations for each subject, so a mixed-model approach accounts for within-subject correlation.');
    }else{
      rationale.push('Groups and conditions are independent, so a standard ANOVA is appropriate.');
    }
    if(includeRowFactor){
      rationale.push('Including the row/subject factor lets you test for row-level trends and higher-order interactions.');
    }
    if(!context.ok && context.message){
      warnings.push(context.message);
    }
    if((context.partialRowsSkipped||0)>0){
      warnings.push(`${context.partialRowsSkipped} incomplete row${context.partialRowsSkipped===1?' was':'s were'} skipped; fill missing values to retain balance.`);
    }
    return {
      format:'grouped',
      ready:true,
      analysis,
      summary,
      rationale,
      warnings,
      detail:{ goal, repeated, includeRowFactor, rowCount }
    };
  }

  function computeAdvisorRecommendation(rawAnswers,rawContext){
    const answers=rawAnswers||{};
    const context=rawContext||{};
    if(context?.format==='grouped'){
      return computeGroupedAdvisorRecommendation(answers,context);
    }
    const groupCount=Number.isFinite(context.groupCount)?context.groupCount:0;
    if(groupCount<2){
      return {
        ready:false,
        message:'Select at least two groups before running the advisor.',
        missing:['groups']
      };
    }
    const groupsAnswer=normalizeAdvisorGroupAnswer(answers.groups,context);
    if(!groupsAnswer){
      return {
        ready:false,
        message:'Tell the advisor how many groups you are comparing.',
        missing:['groups']
      };
    }
    const pairedAnswer=answers.paired;
    if(pairedAnswer!=='paired' && pairedAnswer!=='unpaired'){
      return {
        ready:false,
        message:'Specify whether the measurements are paired/repeated.',
        missing:['paired'],
        groups:groupsAnswer
      };
    }
    const distributionAnswer=answers.distribution;
    if(!distributionAnswer){
      return {
        ready:false,
        message:'Let the advisor know whether the data look approximately normal.',
        missing:['distribution'],
        groups:groupsAnswer,
        paired:pairedAnswer==='paired'
      };
    }
    const equalVarianceAnswer=answers.equalVariance;
    const paired=pairedAnswer==='paired';
    const sampleSizes=Array.isArray(context.sampleSizes)
      ? context.sampleSizes.map(n=>Number.isFinite(n)?n:0)
      : [];
    const assumptionDiagnostics=context.assumptions||null;

    let statsTest='parametric';
    let postHoc='standard';
    let primaryLabel='';
    let postHocLabel='';
    const rationale=[];
    const warnings=[];

    if(groupsAnswer==='two'){
      if(paired){
        if(distributionAnswer==='normal'){
          statsTest='parametric';
          primaryLabel='Paired t-test';
          rationale.push('Paired measurements with approximately normal differences favour parametric tests.');
        }else if(distributionAnswer==='nonnormal'){
          statsTest='nonparametric';
          primaryLabel='Wilcoxon signed-rank test';
          rationale.push('Non-normal paired differences are handled best with rank-based Wilcoxon tests.');
        }else{
          statsTest='nonparametric';
          primaryLabel='Wilcoxon signed-rank test';
          rationale.push('When normality is uncertain, rank-based paired tests offer robustness.');
        }
      }else{
        if(distributionAnswer==='normal'){
          statsTest='parametric';
          primaryLabel='Welch t-test';
          rationale.push('Independent groups with roughly normal distributions support the Welch t-test.');
        }else if(distributionAnswer==='nonnormal'){
          statsTest='nonparametric';
          primaryLabel='Mann–Whitney U test';
          rationale.push('Rank-based Mann–Whitney tests are robust for non-normal independent groups.');
        }else{
          statsTest='nonparametric';
          primaryLabel='Mann–Whitney U test';
          rationale.push('When unsure about normality, Mann–Whitney offers a safer default for independent groups.');
        }
      }
    }else{
      if(paired){
        if(distributionAnswer==='normal'){
          statsTest='parametric';
          primaryLabel='Paired contrasts with Holm correction';
          rationale.push('Repeated measures with normal-ish differences can use paired t-tests plus Holm correction.');
        }else if(distributionAnswer==='nonnormal'){
          statsTest='nonparametric';
          primaryLabel='Wilcoxon signed-rank contrasts with Holm correction';
          rationale.push('Rank-based paired contrasts protect against non-normal repeated measures.');
        }else{
          statsTest='nonparametric';
          primaryLabel='Wilcoxon signed-rank contrasts with Holm correction';
          rationale.push('When normality is uncertain for repeated measures, start with rank-based paired contrasts.');
        }
        postHoc='standard';
        postHocLabel='Apply the selected multiple-testing correction across paired contrasts.';
      }else{
        if(distributionAnswer==='normal'){
          if(equalVarianceAnswer==='no'){
            statsTest='nonparametric';
            primaryLabel='Kruskal–Wallis test';
            postHoc='dunn';
            postHocLabel='Follow up with Dunn post-hoc comparisons (rank-based).';
            rationale.push('Substantial variance differences undermine ANOVA; Kruskal–Wallis is variance-robust.');
            warnings.push('Welch ANOVA handles unequal variances but is not available here; consider transformations or heteroscedastic methods.');
          }else{
            statsTest='parametric';
            primaryLabel='ANOVA';
            postHoc='tukey';
            postHocLabel='Use Tukey HSD for adjusted pairwise comparisons.';
            rationale.push('Normal, independent groups support ANOVA with Tukey-controlled post-hoc tests.');
            if(equalVarianceAnswer==='unsure' || !equalVarianceAnswer){
              warnings.push('Check variance homogeneity (e.g., Levene/Bartlett). If variances differ, prefer Welch ANOVA or non-parametric tests.');
            }
          }
        }else if(distributionAnswer==='nonnormal'){
          statsTest='nonparametric';
          primaryLabel='Kruskal–Wallis test';
          postHoc='dunn';
          postHocLabel='Follow up with Dunn post-hoc comparisons (rank-based).';
          rationale.push('Rank-based Kruskal–Wallis handles non-normal independent groups.');
        }else{
          statsTest='nonparametric';
          primaryLabel='Kruskal–Wallis test';
          postHoc='dunn';
          postHocLabel='Follow up with Dunn post-hoc comparisons (rank-based).';
          rationale.push('When normality is uncertain, Kruskal–Wallis offers a robust default for multiple groups.');
        }
      }
    }

    if(Array.isArray(sampleSizes) && sampleSizes.some(n=>n>0 && n<3) && groupsAnswer!=='two'){
      warnings.push('Some groups have fewer than 3 observations; post-hoc comparisons may have limited power.');
    }
    if(assumptionDiagnostics?.recommendNonParametric && statsTest==='parametric'){
      warnings.push('Recent assumption diagnostics flagged issues with parametric assumptions.');
    }

    const groupPhrase=groupsAnswer==='two'
      ? 'the two selected groups'
      : `${groupCount} selected groups`;
    const methodLabel=statsTest==='parametric'?'parametric':'non-parametric';
    const summaryParts=[`Use ${methodLabel} ${primaryLabel} on ${groupPhrase}.`];
    if(postHocLabel){
      summaryParts.push(postHocLabel);
    }else if(groupsAnswer!=='two'){
      summaryParts.push('Keep the current multiple-testing correction for pairwise follow-ups.');
    }

    return {
      ready:true,
      statsTest,
      paired,
      postHoc,
      summary:summaryParts.join(' '),
      rationale,
      warnings,
      groups:groupsAnswer,
      distribution:distributionAnswer,
      detail:{
        primaryLabel,
        postHocLabel
      }
    };
  }

  const GAUSS_HERMITE_NODES=[
    -3.889724897869781,
    -3.020637025120889,
    -2.2795070805010594,
    -1.5976826351526044,
    -0.9477883912401637,
    -0.3142403762543591,
    0.3142403762543591,
    0.9477883912401637,
    1.5976826351526044,
    2.2795070805010594,
    3.020637025120889,
    3.889724897869781
  ];
  const GAUSS_HERMITE_WEIGHTS=[
    2.6585516843563013e-07,
    0.00001761400713915212,
    0.0009322840086241802,
    0.02697315497843491,
    0.3982821276709972,
    1.830103131080486,
    1.830103131080486,
    0.3982821276709972,
    0.02697315497843491,
    0.0009322840086241802,
    0.00001761400713915212,
    2.6585516843563013e-07
  ];
  function studentizedRangeCDFInfinite(q,r){
    if(!Number.isFinite(q) || q<=0){
      return 0;
    }
    if(!Number.isFinite(r) || r<2){
      return 1;
    }
    const jStatLib=global.jStat;
    const normalCdf=(value)=>{
      if(jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf==='function'){
        return jStatLib.normal.cdf(value,0,1);
      }
      return 0.5*(1+Math.erf(value/Math.SQRT2));
    };
    let acc=0;
    for(let i=0;i<GAUSS_HERMITE_NODES.length;i++){
      const node=GAUSS_HERMITE_NODES[i];
      const weight=GAUSS_HERMITE_WEIGHTS[i];
      const t=node*Math.SQRT2;
      const upper=normalCdf(t+q);
      const lower=normalCdf(t);
      const span=Math.max(0,Math.min(1,upper-lower));
      acc+=weight*Math.pow(span,r-1);
    }
    const result=acc/Math.sqrt(Math.PI);
    const clamped=Math.max(0,Math.min(1,result));
    console.debug('Debug: box studentizedRangeCDFInfinite',{ q, r, result:clamped });
    return clamped;
  }
  function studentizedRangeCDF(q,r,df){
    if(!Number.isFinite(q) || q<=0){
      return 0;
    }
    if(!Number.isFinite(df) || df<=2){
      const fallback=studentizedRangeCDFInfinite(q*Math.SQRT1_2,r);
      console.debug('Debug: box studentizedRangeCDF df<=2 fallback',{ q, r, df, fallback });
      return fallback;
    }
    const scale=Math.sqrt(df/(df-2));
    const adjusted=q*scale;
    const result=studentizedRangeCDFInfinite(adjusted,r);
    console.debug('Debug: box studentizedRangeCDF',{ q, r, df, scale, adjusted, result });
    return result;
  }
  function computeAnovaComponents(groups){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>group.filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    const validCounts=counts.every(n=>n>0);
    if(!validCounts){
      return { ok:false, reason:'Each group needs at least one observation for Tukey HSD.' };
    }
    const k=cleaned.length;
    const totals=cleaned.map(group=>group.reduce((sum,val)=>sum+val,0));
    const totalN=counts.reduce((sum,val)=>sum+val,0);
    if(totalN<=k){
      return { ok:false, reason:'Tukey HSD requires more observations than groups.' };
    }
    const means=totals.map((sum,idx)=>sum/(counts[idx]||1));
    const grandMean=totals.reduce((sum,val)=>sum+val,0)/totalN;
    let sse=0;
    cleaned.forEach((group,idx)=>{
      const meanVal=means[idx];
      group.forEach(value=>{ sse+=Math.pow(value-meanVal,2); });
    });
    const dfWithin=totalN-k;
    const mse=dfWithin>0?sse/dfWithin:NaN;
    return {
      ok:Number.isFinite(mse) && mse>0 && dfWithin>0,
      mse,
      dfWithin,
      means,
      counts,
      grandMean,
      totalN,
      groupCount:k,
      sse
    };
  }
  function computeTukeyComparisons(groups,labels){
    const base=computeAnovaComponents(groups);
    if(!base.ok){
      console.debug('Debug: box computeTukeyComparisons unavailable',base);
      return { ok:false, message:base.reason || 'Unable to compute Tukey HSD.' };
    }
    const pairs=[];
    for(let i=0;i<base.groupCount;i++){
      for(let j=i+1;j<base.groupCount;j++){
        const ni=base.counts[i];
        const nj=base.counts[j];
        const se=Math.sqrt(base.mse*0.5*(1/ni+1/nj));
        if(!Number.isFinite(se) || se<=0){
          console.debug('Debug: box computeTukeyComparisons skip pair',{ i,j,se });
          continue;
        }
        const diff=base.means[i]-base.means[j];
        const q=Math.abs(diff)/se;
        const cdf=studentizedRangeCDF(q,base.groupCount,base.dfWithin);
        const pAdj=Math.max(0,Math.min(1,1-cdf));
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
          labelA:labels?.[i],
          labelB:labels?.[j]
        });
      }
    }
    console.debug('Debug: box computeTukeyComparisons summary',{ pairCount:pairs.length, df:base.dfWithin, mse:base.mse });
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
  function computeDunnComparisons(groups,labels){
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
          console.debug('Debug: box computeDunnComparisons skip pair',{ i,j,se });
          continue;
        }
        const z=diff/se;
        const absZ=Math.abs(z);
        const jStatLib=global.jStat;
        const cdf=jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf==='function'
          ? jStatLib.normal.cdf(absZ,0,1)
          : 0.5*(1+Math.erf(absZ/Math.SQRT2));
        const p=Math.max(0,Math.min(1,2*(1-cdf)));
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
    console.debug('Debug: box computeDunnComparisons summary',{ pairCount:pairs.length, totalN, tieCorrection:corrected });
    return {
      ok:pairs.length>0,
      pairs,
      footnote:"Dunn's test uses rank sums with tie correction.",
      totalN,
      counts
    };
  }

  function resolveEffectOptionMeta(type,value){
    const list=listEffectOptions(type);
    const found=list.find(opt=>opt.value===value);
    if(found){
      return found;
    }
    const fallback=list[0];
    console.debug('Debug: box resolveEffectOptionMeta fallback',{ type, requested:value, fallback:fallback?.value });
    return fallback;
  }
  function ensureValidEffectOption(type,value){
    const meta=resolveEffectOptionMeta(type,value);
    return meta?.value;
  }
  function safeRound(value,digits){
    if(!Number.isFinite(value)) return null;
    const factor=Math.pow(10,digits||0);
    return Math.round(value*factor)/factor;
  }
  function clamp(value,min,max){
    if(!Number.isFinite(value)) return value;
    if(value<min) return min;
    if(value>max) return max;
    return value;
  }
  function formatEffectValue(value,meta){
    if(value==null||!Number.isFinite(value)){
      return '—';
    }
    if(meta?.format==='percent'){
      const percent=clamp(value,0,1)*100;
      return `${percent.toFixed(1)}%`;
    }
    return value.toFixed(3);
  }
  function buildEffectFootnotes(paramMeta,nonParamMeta){
    const notes=[];
    if(paramMeta?.tooltip){
      notes.push(`Parametric effect (${paramMeta.shortLabel || paramMeta.label}): ${paramMeta.tooltip}`);
    }
    if(nonParamMeta?.tooltip){
      notes.push(`Non-parametric effect (${nonParamMeta.shortLabel || nonParamMeta.label}): ${nonParamMeta.tooltip}`);
    }
    return notes;
  }
  function computeVectorStats(values){
    const arr=(Array.isArray(values)?values:[]).map(Number).filter(v=>Number.isFinite(v));
    const n=arr.length;
    if(!n){
      return { n:0, mean:NaN, variance:NaN, sd:NaN };
    }
    const meanVal=arr.reduce((sum,v)=>sum+v,0)/n;
    let variance=0;
    if(n>1){
      const sumSq=arr.reduce((sum,v)=>sum+Math.pow(v-meanVal,2),0);
      variance=sumSq/(n-1);
    }
    const sd=Math.sqrt(Math.max(variance,0));
    return { n, mean:meanVal, variance, sd };
  }
  function computePairedSamples(a,b){
    const len=Math.min(Array.isArray(a)?a.length:0,Array.isArray(b)?b.length:0);
    const samples=[];
    for(let i=0;i<len;i++){
      const av=Number(a[i]);
      const bv=Number(b[i]);
      if(Number.isFinite(av)&&Number.isFinite(bv)){
        samples.push({ a:av, b:bv });
      }
    }
    return samples;
  }
  function computeDiffStats(pairedSamples){
    const diffs=[];
    let positive=0,negative=0,ties=0;
    pairedSamples.forEach(pair=>{
      const diff=pair.a-pair.b;
      diffs.push(diff);
      if(diff>0) positive++;
      else if(diff<0) negative++;
      else ties++;
    });
    const stats=computeVectorStats(diffs);
    return { ...stats, positive, negative, ties, total:stats.n };
  }
  function computePairwiseCounts(a,b){
    const arrA=(Array.isArray(a)?a:[]).map(Number).filter(v=>Number.isFinite(v));
    const arrB=(Array.isArray(b)?b:[]).map(Number).filter(v=>Number.isFinite(v));
    let greater=0,less=0,equal=0;
    for(let i=0;i<arrA.length;i++){
      const av=arrA[i];
      for(let j=0;j<arrB.length;j++){
        const bv=arrB[j];
        if(av>bv) greater++;
        else if(av<bv) less++;
        else equal++;
      }
    }
    const totalPairs=greater+less+equal;
    return { greater, less, equal, totalPairs, nA:arrA.length, nB:arrB.length };
  }
  function computeEffectSizeMetrics(a,b,options){
    const paired=!!options?.paired;
    const statsA=computeVectorStats(a);
    const statsB=computeVectorStats(b);
    const pairedSamples=paired?computePairedSamples(a,b):[];
    const diffStats=paired?computeDiffStats(pairedSamples):null;
    const counts=!paired?computePairwiseCounts(a,b):null;
    const metrics={ parametric:{}, nonParametric:{}, context:{ nA:statsA.n, nB:statsB.n, paired } };
    if(paired){
      metrics.context.nPairs=diffStats?.total || 0;
    }
    if(statsA.n>0 && statsB.n>0){
      if(paired){
        if(diffStats && diffStats.total>1 && Number.isFinite(diffStats.sd) && diffStats.sd>0){
          const d=diffStats.mean/(diffStats.sd||1);
          metrics.parametric.cohenD=d;
          const correctionDenom=4*diffStats.total-9;
          const correction=correctionDenom!==0?1-3/correctionDenom:1;
          if(Number.isFinite(correction)){
            metrics.parametric.hedgesG=d*correction;
          }
        }
      }else{
        const pooledDenom=(statsA.n-1)+(statsB.n-1);
        if(pooledDenom>0){
          const pooledVar=((statsA.variance*(statsA.n-1))+(statsB.variance*(statsB.n-1)))/pooledDenom;
          const pooledSd=Math.sqrt(Math.max(pooledVar,0));
          if(pooledSd>0){
            const d=(statsA.mean-statsB.mean)/pooledSd;
            metrics.parametric.cohenD=d;
            const correctionDenom=4*(statsA.n+statsB.n)-9;
            const correction=correctionDenom!==0?1-3/correctionDenom:1;
            if(Number.isFinite(correction)){
              metrics.parametric.hedgesG=d*correction;
            }
          }
        }
      }
    }
    if(!paired && counts && counts.totalPairs>0){
      const delta=(counts.greater-counts.less)/counts.totalPairs;
      metrics.nonParametric.rankBiserial=clamp(delta,-1,1);
      const commonLanguage=(counts.greater+0.5*counts.equal)/counts.totalPairs;
      metrics.nonParametric.commonLanguage=clamp(commonLanguage,0,1);
    }
    if(paired && diffStats && diffStats.total>0){
      const rb=(diffStats.positive-diffStats.negative)/diffStats.total;
      metrics.nonParametric.rankBiserial=clamp(rb,-1,1);
      const cl=(diffStats.positive+0.5*diffStats.ties)/diffStats.total;
      metrics.nonParametric.commonLanguage=clamp(cl,0,1);
    }
    const debugPayload={
      paired,
      nA:statsA.n,
      nB:statsB.n,
      nPairs:diffStats?.total || 0,
      parametric:Object.fromEntries(Object.entries(metrics.parametric).map(([key,val])=>[key,safeRound(val,4)])),
      nonParametric:Object.fromEntries(Object.entries(metrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)])),
      counts:counts?{ ...counts, totalPairs:counts.totalPairs }:null,
      diffCounts:diffStats?{ positive:diffStats.positive, negative:diffStats.negative, ties:diffStats.ties }:null
    };
    console.debug('Debug: box computeEffectSizeMetrics',debugPayload);
    return { ...metrics, statsA, statsB, diffStats, counts };
  }
  // Local state and element cache
  const state = { hot: null, scheduleDraw: function(){}, fileHandle: null, fileName: 'box.graph', titleText: 'Boxplot', yLabelText: 'Value', lastDefaultFill: '#4472c4', selectedCols: new Set(), statsTest: 'parametric', statsMode: 'all', statsRef: 0, statsPaired: false, statsPairsText: '', statsCustomPairs: [], statsCorrection: DEFAULT_CORRECTION, statsEffectParametric: EFFECT_SIZE_PARAM_OPTIONS[0].value, statsEffectNonParametric: EFFECT_SIZE_NONPARAM_OPTIONS[0].value, statsPostHoc: POST_HOC_ORDER[0], colOrder: [], fillColors: [], borderColors: [], drawToken: 0, flipAxes: false, tableFormat: 'single', grouped: { replicatesPerGroup: 3, groups: ['Control', 'Treated'] }, groupedStats: { analysis: 'twoWayAnova' }, layout: null, minSvgWidth: 0, individualSummary: 'mean', lastAxisLabels: [], showSignificanceBars: false, statsAdvisor: { open: false, answers: {} }, axisSettings: createDefaultAxisSettings() };

  function ensureAxisSettings(){
    const settings = state.axisSettings && typeof state.axisSettings === 'object' ? state.axisSettings : createDefaultAxisSettings();
    if(!settings.x || typeof settings.x !== 'object'){ settings.x = { tickInterval: null }; }
    if(!settings.y || typeof settings.y !== 'object'){ settings.y = { tickInterval: null }; }
    if(settings.x.tickInterval === undefined){ settings.x.tickInterval = null; }
    if(settings.y.tickInterval === undefined){ settings.y.tickInterval = null; }
    const strokeNumeric = Number(settings.strokeWidth);
    if(!Number.isFinite(strokeNumeric) || strokeNumeric <= 0){
      settings.strokeWidth = 1;
    }
    if(typeof settings.color !== 'string' || !settings.color.trim()){
      settings.color = DEFAULT_AXIS_COLOR;
    }
    state.axisSettings = settings;
    return settings;
  }

  function isAxisNumeric(axis){
    if(axis === 'x'){ return !!state.flipAxes; }
    if(axis === 'y'){ return !state.flipAxes; }
    return false;
  }

  function getAxisTickInterval(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureAxisSettings();
    if(!isAxisNumeric(axis)){
      const stored = settings[axis]?.tickInterval;
      if(stored){
        console.debug('Debug: box axis tick interval ignored for categorical axis',{ axis, stored, flipAxes: state.flipAxes });
      }
      return null;
    }
    const raw = settings[axis]?.tickInterval;
    const numeric = typeof raw === 'string' ? Number(raw) : raw;
    if(Number.isFinite(numeric) && numeric > 0){
      const resolved = axis === 'x' ? Math.max(1, Math.round(numeric)) : numeric;
      return resolved;
    }
    return null;
  }

  function updateAxisTickInterval(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    if(!isAxisNumeric(axis)){
      settings[axis].tickInterval = null;
      console.debug('Debug: box axis tick interval blocked for categorical axis',{ axis, flipAxes: state.flipAxes, attempted: value });
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
      return;
    }
    if(value === null || value === undefined || value === ''){
      settings[axis].tickInterval = null;
    } else {
      const numeric = Number(value);
      if(Number.isFinite(numeric) && numeric > 0){
        settings[axis].tickInterval = axis === 'x' ? Math.max(1, Math.round(numeric)) : numeric;
      } else {
        settings[axis].tickInterval = null;
      }
    }
    console.debug('Debug: box axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function getAxisStrokeWidthBase(){
    const settings = ensureAxisSettings();
    const numeric = Number(settings.strokeWidth);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  }

  function updateAxisStrokeWidth(value){
    const settings = ensureAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings.strokeWidth = 1;
    } else {
      const numeric = Number(value);
      settings.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    }
    console.debug('Debug: box axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function getAxisColor(){
    const settings = ensureAxisSettings();
    return typeof settings.color === 'string' && settings.color ? settings.color : DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    if(typeof value === 'string' && value.trim()){
      settings.color = value;
    } else {
      settings.color = DEFAULT_AXIS_COLOR;
    }
    console.debug('Debug: box axis color updated',{ color: settings.color });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }
  const els = {};

  function updateStatsCorrectionSummary(count){
    const noteEl=global.document.getElementById('statsCorrectionNote');
    if(!noteEl){
      console.debug('Debug: box updateStatsCorrectionSummary missing element');
      return;
    }
    const rawCount=Number(count);
    const safeCount=Number.isFinite(rawCount) && rawCount>0 ? Math.round(rawCount) : 0;
    if(state.statsPostHoc==='tukey'){
      const detail=safeCount>0?`${safeCount} comparison${safeCount===1?'':'s'}`:'awaiting data';
      noteEl.textContent=`Post-hoc: Tukey HSD (${detail}, studentized range).`;
      noteEl.dataset.method='tukey';
      noteEl.dataset.correctionLabel='Tukey HSD';
      console.debug('Debug: box updateStatsCorrectionSummary tukey',{ count:safeCount });
      return;
    }
    const meta=resolveCorrectionMeta(state.statsCorrection,safeCount);
    const detail=safeCount>0?`${safeCount} test${safeCount===1?'':'s'}`:'awaiting data';
    const labelPrefix=state.statsPostHoc==='dunn'?"Dunn's test correction":"Multiple-testing correction";
    noteEl.textContent=`${labelPrefix}: ${meta.label} (${detail}).`;
    noteEl.dataset.method=meta.key;
    noteEl.dataset.correctionLabel=meta.shortLabel || meta.label;
    console.debug('Debug: box updateStatsCorrectionSummary',{ method:meta.key, label:meta.label, count:safeCount });
  }

  // PART: CACHE_ELS
  function cacheEls(){
    els.tablePanel = global.document.getElementById('boxTablePanel');
    els.graphPanel = global.document.getElementById('boxGraphPanel');
    els.panelResizer = global.document.getElementById('boxPanelResizer');
    els.svgBox = els.graphPanel?.querySelector('.svgbox');
    els.configPanel = els.graphPanel?.querySelector('.config-options');
    els.hotContainer = global.document.getElementById('hot');
    els.hotWrapper = global.document.getElementById('hotWrapper');
    els.plotDiv = global.document.getElementById('boxPlot');
    els.tableFormat = global.document.getElementById('boxTableFormat');
    els.groupedControls = global.document.getElementById('boxGroupedControls');
    els.groupedReplicates = global.document.getElementById('boxGroupedReplicates');
    els.groupedList = global.document.getElementById('boxGroupedList');
    els.groupedAdd = global.document.getElementById('boxGroupedAdd');
    els.groupedRemove = global.document.getElementById('boxGroupedRemove');
    // Controls
    els.boxColorUnified=global.$('#boxColorUnified');
    els.boxColorIndividual=global.$('#boxColorIndividual');
    els.boxUnifiedColors=global.$('#boxUnifiedColors');
    els.boxFill=global.$('#boxFill');
    els.boxBorder=global.$('#boxBorder');
    els.boxBorderWidth=global.$('#boxBorderWidth');
    els.boxErrorBarWidth=global.$('#boxErrorBarWidth');
    els.boxErrorBarWidthCtl=global.$('#boxErrorBarWidthCtl');
    els.boxFontSize=global.$('#boxFontSize');
    els.boxFontSizeVal=global.$('#boxFontSizeVal');
    if (typeof chartStyle.renderFontSizeLabel === 'function') {
      if(els.boxFontSize?.dataset){
        els.boxFontSize.dataset.fontBasePt = String(els.boxFontSize.value);
        console.debug('Debug: box font size base initialized',{ value: els.boxFontSize.value }); // Debug: initial base size
      }
      chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: Number(els.boxFontSize.value), input: els.boxFontSize, manual: true });
    } else {
      console.debug('Debug: box renderFontSizeLabel missing helper'); // Debug: chartStyle guard
    }
    els.boxShowGrid=global.$('#boxShowGrid');
    els.boxShowFrame=global.$('#boxShowFrame');
    els.boxLogScale=global.$('#boxLogScale');
    els.boxLogScaleLabel=global.$('#boxLogScaleLabel');
    els.boxFlipAxes=global.$('#boxFlipAxes');
    els.boxGraphType=global.$('#boxGraphType');
    els.boxIndividualSummaryCtl=global.$('#boxIndividualSummaryCtl');
    els.boxIndividualSummary=global.$('#boxIndividualSummary');
    if(els.boxIndividualSummary){
      const allowedSummaries = new Set(['mean','median','none']);
      const fallbackSummary = allowedSummaries.has(state.individualSummary) ? state.individualSummary : 'mean';
      els.boxIndividualSummary.value = fallbackSummary;
      console.debug('Debug: box individual summary initialised',{ value: els.boxIndividualSummary.value });
    }
    els.boxPointMode=global.$('#boxPointMode');
    els.boxShowCaps=global.$('#boxShowCaps');
    els.boxShowSignificance=global.$('#boxShowSignificance');
    if(els.boxShowSignificance){
      els.boxShowSignificance.checked = !!state.showSignificanceBars;
    }
    els.boxErrorMode=global.$('#boxErrorMode');
    els.boxErrorModeCtl=global.$('#boxErrorModeCtl');
    els.boxColorPerBox=global.$('#boxColorPerBox');
    els.boxYMin=global.$('#boxYMin');
    els.boxYMax=global.$('#boxYMax');
  }

  // PART: INIT_TABLE
  function ensureGroupedDefaults(){
    if(!state.grouped || typeof state.grouped !== 'object'){
      state.grouped = { replicatesPerGroup: 3, groups: ['Control', 'Treated'] };
    }
    const rawReplicates = Number(state.grouped.replicatesPerGroup);
    if(!Number.isFinite(rawReplicates) || rawReplicates < 1){
      state.grouped.replicatesPerGroup = 1;
    }else{
      state.grouped.replicatesPerGroup = Math.max(1, Math.round(rawReplicates));
    }
    if(!Array.isArray(state.grouped.groups) || !state.grouped.groups.length){
      state.grouped.groups = ['Group 1', 'Group 2'];
    }
    state.grouped.groups = state.grouped.groups.map((name, idx)=>{
      const trimmed = typeof name === 'string' ? name.trim() : '';
      return trimmed || `Group ${idx + 1}`;
    });
    console.debug('Debug: ensureGroupedDefaults',{ replicates: state.grouped.replicatesPerGroup, groups: [...state.grouped.groups] });
  }

  function buildGroupedNestedHeaders(){
    ensureGroupedDefaults();
    const headers = state.grouped.groups.map((name, idx)=>({ label: name || `Group ${idx + 1}`, colspan: state.grouped.replicatesPerGroup }));
    console.debug('Debug: buildGroupedNestedHeaders',{ headers });
    return [headers];
  }

  function updateGroupedHeaders(){
    if(state.tableFormat !== 'grouped' || !state.hot){
      console.debug('Debug: updateGroupedHeaders skipped',{ tableFormat: state.tableFormat, hasHot: !!state.hot });
      return;
    }
    const nested = buildGroupedNestedHeaders();
    state.hot.updateSettings({ nestedHeaders: nested });
    console.debug('Debug: updateGroupedHeaders applied',{ nested });
  }

  function renderGroupedList(){
    if(!els.groupedList){
      console.debug('Debug: renderGroupedList skipped no container');
      return;
    }
    ensureGroupedDefaults();
    els.groupedList.innerHTML='';
    state.grouped.groups.forEach((name, idx)=>{
      const row = global.document.createElement('div');
      row.className = 'grouped-row';
      const label = global.document.createElement('label');
      label.textContent = `Group ${idx + 1}`;
      const input = global.document.createElement('input');
      input.type = 'text';
      input.value = name;
      input.addEventListener('input', e=>{
        state.grouped.groups[idx] = e.target.value;
        console.debug('Debug: grouped name updated',{ index: idx, value: state.grouped.groups[idx] });
        updateGroupedHeaders();
        state.scheduleDraw();
      });
      const removeBtn = global.document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'grouped-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click',()=>{
        if(state.grouped.groups.length <= 1){
          console.debug('Debug: grouped remove prevented minimum',{ length: state.grouped.groups.length });
          return;
        }
        const removed = state.grouped.groups.splice(idx,1);
        console.debug('Debug: grouped remove',{ index: idx, removed });
        renderGroupedList();
        applyTableFormatToHot();
        state.scheduleDraw();
      });
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(removeBtn);
      els.groupedList.appendChild(row);
    });
    if(els.groupedReplicates){
      els.groupedReplicates.value = String(state.grouped.replicatesPerGroup);
    }
  }

  function adjustColumnsForGrouped(){
    if(!state.hot){
      console.debug('Debug: adjustColumnsForGrouped skipped no hot');
      return;
    }
    ensureGroupedDefaults();
    const groupsCount = state.grouped.groups.length;
    const replicates = Math.max(1, state.grouped.replicatesPerGroup);
    const targetCols = Math.max(0, groupsCount * replicates);
    const currentCols = state.hot.countCols();
    if(targetCols > currentCols){
      state.hot.alter('insert_col', currentCols, targetCols - currentCols);
    }else if(targetCols < currentCols){
      state.hot.alter('remove_col', targetCols, currentCols - targetCols);
    }
    state.colOrder = Array.from({ length: state.hot.countCols() }, (_, i)=>i);
    console.debug('Debug: adjustColumnsForGrouped',{ groupsCount, replicates, targetCols, currentCols });
  }

  function applyTableFormatToHot(){
    if(!state.hot){
      console.debug('Debug: applyTableFormatToHot skipped no hot');
      return;
    }
    if(state.tableFormat === 'grouped'){
      ensureGroupedDefaults();
      adjustColumnsForGrouped();
      const nested = buildGroupedNestedHeaders();
      state.hot.updateSettings({ nestedHeaders: nested });
      console.debug('Debug: applyTableFormatToHot grouped',{ nested });
    }else{
      state.hot.updateSettings({ nestedHeaders: false });
      console.debug('Debug: applyTableFormatToHot single');
    }
  }

  function updateTableFormatUI(){
    if(els.tableFormat){
      els.tableFormat.value = state.tableFormat;
    }
    if(els.groupedControls){
      els.groupedControls.style.display = state.tableFormat === 'grouped' ? '' : 'none';
    }
    if(state.tableFormat === 'grouped'){
      renderGroupedList();
      updateGroupedHeaders();
    }
    console.debug('Debug: updateTableFormatUI',{ tableFormat: state.tableFormat });
  }

  function setTableFormat(mode, options){
    const opts = options || {};
    const normalized = mode === 'grouped' ? 'grouped' : 'single';
    if(state.tableFormat === normalized){
      console.debug('Debug: setTableFormat no change',{ mode: normalized });
      if(!opts.skipUI){
        updateTableFormatUI();
      }
      applyTableFormatToHot();
      if(!opts.skipDraw){
        state.scheduleDraw();
      }
      return;
    }
    state.tableFormat = normalized;
    console.debug('Debug: setTableFormat',{ mode: normalized });
    if(normalized === 'grouped' && els.boxColorUnified?.checked && !opts.skipColorSwitch){
      els.boxColorIndividual.checked = true;
      toggleColorMode();
      console.debug('Debug: auto color mode switch for grouped');
    }
    if(!opts.skipUI){
      updateTableFormatUI();
    }
    applyTableFormatToHot();
    if(!opts.skipDraw){
      state.scheduleDraw();
    }
  }

  // PART: INIT_HOT
  function initHot(){
    console.debug('Debug: box initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('box initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
    let boxScheduleProxyCount = 0;
    const scheduleBoxDrawProxy = () => {
      boxScheduleProxyCount += 1;
      if(boxScheduleProxyCount <= 5){
        console.debug('Debug: box scheduleDraw proxy invoked', { count: boxScheduleProxyCount }); // Debug: table change trigger
        if(boxScheduleProxyCount === 5){
          console.debug('Debug: box scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
        }
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };

    state.hot = Shared.hot.createStandardTable(els.hotContainer, { rows: DEFAULT_ROWS, cols: DEFAULT_COLS }, scheduleBoxDrawProxy, {
      debugLabel: 'box',
      data,
      hotOptions: {
        manualColumnMove: true,
        afterChange(changes, source){
          if(!changes || source === 'loadData') return;
          console.log('boxplot afterChange', { count: changes.length, source });
        },
        afterCreateCol(){
          state.selectedCols.clear();
          console.debug('Debug: box afterCreateCol cleared selection');
        },
        afterRemoveCol(){
          state.selectedCols.clear();
          console.debug('Debug: box afterRemoveCol cleared selection');
        },
        afterUndo(){
          console.log('boxplot undo');
        },
        afterRedo(){
          console.log('boxplot redo');
        },
        afterColumnMove(_moved, _finalIndex, _dropIndex, _possible, orderChanged){
          if(orderChanged){
            console.log('boxplot afterColumnMove');
          }
        }
      }
    });
  
    const loadExampleBtn=global.$('#boxLoadExample'), importBtn=global.$('#boxImport'), fileInput=global.$('#boxFile');
    const exampleSingle=[['Control','Treatment A','Treatment B'],[12,15,14],[14,17,15],[11,14,13],[13,16,16],[15,18,18],[16,19,17],[14,16,15],[13,15,14],[12,14,13],[15,17,16]];
    const exampleGrouped=[['Wild type','Knock-out A','Knock-out B','Wild type','Knock-out A','Knock-out B'],[23,24,21,67,29,65],[21,23,25,79,31,69],[19,25,27,98,32,71],[22,26,24,88,30,67]];
    console.debug('Debug: example datasets prepared',{ singleCols: exampleSingle[0]?.length, groupedCols: exampleGrouped[0]?.length });
    loadExampleBtn.addEventListener('click',()=>{
      state.selectedCols.clear();
      if(state.tableFormat === 'grouped'){
        state.grouped.replicatesPerGroup = 3;
        state.grouped.groups = ['Control','Treated'];
        renderGroupedList();
        updateTableFormatUI();
        applyTableFormatToHot();
        state.hot.loadData(exampleGrouped);
        console.log('boxplot grouped example loaded');
      }else{
        state.hot.loadData(exampleSingle);
        console.log('boxplot example loaded');
      }
      state.axisSettings = createDefaultAxisSettings();
      console.debug('Debug: box axis settings reset from example load');
      state.scheduleDraw();
    });
    importBtn.addEventListener('click',()=>{ fileInput.value=''; fileInput.click(); });
    const tableImport = Shared.tableImport;
    fileInput.addEventListener('change',()=>{
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('boxplot import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      tableImport.openFile(fileInput, {
        hot: state.hot,
        minCols: DEFAULT_COLS,
        minRows: DEFAULT_ROWS,
        scheduleDraw: state.scheduleDraw,
        debugLabel: 'box',
        onProcessed: info => console.log('boxplot data imported', {rows: info?.rows, cols: info?.cols})
      });
    });

    if(tableImport && typeof tableImport.handlePaste === 'function'){
      els.hotContainer.addEventListener('paste',async e=>{
        console.time('boxplotPaste');
        try{
          await tableImport.handlePaste(e, state.hot, {
            minCols: DEFAULT_COLS,
            minRows: DEFAULT_ROWS,
            scheduleDraw: state.scheduleDraw,
            debugLabel: 'box',
            onBeforeProcess: meta => console.log('boxplot fast paste',{rows: meta.rowCount, cols: meta.colCount, startRow: meta.startRow, startCol: meta.startCol}),
            onProcessed: info => console.log('boxplot data imported', {rows: info?.rows, cols: info?.cols})
          });
        }finally{
          console.timeEnd('boxplotPaste');
        }
      },true);
    }
    applyTableFormatToHot();
    updateTableFormatUI();
  }

  // PART: UI
  function toggleColorMode(){
    const mode=els.boxColorUnified.checked?'unified':'individual';
    els.boxUnifiedColors.style.display=mode==='unified'?'':'none';
    if(mode==='unified'){ els.boxColorPerBox.innerHTML=''; }
    console.log('box color mode toggled',mode);
    state.scheduleDraw();
  }
  function updateBoxColorPickers(labels, options){
    const opts = options || {};
    const grouped = !!opts.grouped;
    if(els.boxColorUnified.checked){ els.boxColorPerBox.innerHTML=''; return; }
    els.boxColorPerBox.innerHTML='';
    labels.forEach((lab,i)=>{
      const colorIndex=i;
      if(!state.fillColors[colorIndex]) state.fillColors[colorIndex]=DEFAULT_BOX_COLORS[colorIndex%DEFAULT_BOX_COLORS.length];
      if(!state.borderColors[colorIndex]) state.borderColors[colorIndex]=shadeColor(state.fillColors[colorIndex],-30);
      const fillInput=document.createElement('input');
      fillInput.type='color';
      fillInput.value=state.fillColors[colorIndex];
      if(global.attachColorPickerNear) global.attachColorPickerNear(fillInput);
      fillInput.addEventListener('input',e=>{
        state.fillColors[colorIndex]=e.target.value;
        console.log('box fill color changed',{index:colorIndex,color:state.fillColors[colorIndex],grouped});
        state.scheduleDraw();
      });
      const borderInput=document.createElement('input');
      borderInput.type='color';
      borderInput.value=state.borderColors[colorIndex];
      if(global.attachColorPickerNear) global.attachColorPickerNear(borderInput);
      borderInput.addEventListener('input',e=>{
        state.borderColors[colorIndex]=e.target.value;
        console.log('box border color changed',{index:colorIndex,color:state.borderColors[colorIndex],grouped});
        state.scheduleDraw();
      });
      const lbl=document.createElement('label'); lbl.textContent=lab+' '; lbl.appendChild(fillInput); lbl.appendChild(borderInput); els.boxColorPerBox.appendChild(lbl);
    });
    state.fillColors.length=labels.length;
    state.borderColors.length=labels.length;
    console.debug('Debug: updateBoxColorPickers applied',{ labelsCount: labels.length, grouped, fillColors: [...state.fillColors], borderColors: [...state.borderColors] });
  }
  function initUI(){
    if(els.tableFormat){
      els.tableFormat.addEventListener('change', e=>{
        console.debug('Debug: tableFormat select change',{ value: e.target.value });
        setTableFormat(e.target.value);
      });
    }
    if(els.groupedReplicates){
      els.groupedReplicates.addEventListener('change', e=>{
        const raw = Number(e.target.value);
        const resolved = Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : state.grouped.replicatesPerGroup;
        state.grouped.replicatesPerGroup = resolved;
        console.debug('Debug: grouped replicates change',{ raw, resolved });
        renderGroupedList();
        applyTableFormatToHot();
        state.scheduleDraw();
      });
    }
    if(els.groupedAdd){
      els.groupedAdd.addEventListener('click',()=>{
        ensureGroupedDefaults();
        const nextLabel = `Group ${state.grouped.groups.length + 1}`;
        state.grouped.groups.push(nextLabel);
        console.debug('Debug: grouped add button',{ nextLabel, groups: [...state.grouped.groups] });
        renderGroupedList();
        applyTableFormatToHot();
        state.scheduleDraw();
      });
    }
    if(els.groupedRemove){
      els.groupedRemove.addEventListener('click',()=>{
        ensureGroupedDefaults();
        if(state.grouped.groups.length <= 1){
          console.debug('Debug: grouped remove button blocked',{ length: state.grouped.groups.length });
          return;
        }
        const removed = state.grouped.groups.pop();
        console.debug('Debug: grouped remove button',{ removed, groups: [...state.grouped.groups] });
        renderGroupedList();
        applyTableFormatToHot();
        state.scheduleDraw();
      });
    }
    els.boxColorUnified.addEventListener('change',toggleColorMode);
    els.boxColorIndividual.addEventListener('change',toggleColorMode);
    toggleColorMode();
    els.boxFontSize.addEventListener('input',()=>{
      if(els.boxFontSize.dataset){
        els.boxFontSize.dataset.fontBasePt = String(els.boxFontSize.value);
        console.debug('Debug: box font size input manual set',{ value: els.boxFontSize.value }); // Debug: manual slider update
      }
      chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: Number(els.boxFontSize.value), input: els.boxFontSize, manual: true });
      state.scheduleDraw();
    });
    els.boxShowGrid.addEventListener('change',()=>{ console.log('boxShowGrid changed', els.boxShowGrid.checked); state.scheduleDraw(); });
    els.boxShowFrame?.addEventListener('change',()=>{ console.debug('Debug: box showFrame change',{checked:els.boxShowFrame.checked}); state.scheduleDraw(); });
    els.boxLogScale.addEventListener('change',()=>{ console.log('boxLogScale changed', els.boxLogScale.checked); state.scheduleDraw(); });
    const updateGraphTypeControls = () => {
      const graphTypeValue = els.boxGraphType.value;
      const showErrorControls = graphTypeValue === 'bar';
      const showErrorBarThickness = graphTypeValue === 'bar' || graphTypeValue === 'strip';
      if(els.boxErrorModeCtl){
        els.boxErrorModeCtl.style.display = showErrorControls ? '' : 'none';
      }
      if(els.boxErrorBarWidthCtl){
        els.boxErrorBarWidthCtl.style.display = showErrorBarThickness ? '' : 'none';
        console.debug('Debug: box error bar thickness visibility',{ graphTypeValue, showErrorBarThickness });
      }
      const showCapsLabel = els.boxShowCaps?.closest('label');
      if(showCapsLabel){
        const capsVisible = graphTypeValue === 'box' || graphTypeValue === 'notched';
        showCapsLabel.style.display = capsVisible ? '' : 'none';
        console.debug('Debug: box showCaps visibility updated',{ graphTypeValue, capsVisible });
      }
      if(els.boxIndividualSummaryCtl){
        const summaryVisible = graphTypeValue === 'strip';
        els.boxIndividualSummaryCtl.style.display = summaryVisible ? '' : 'none';
        if(summaryVisible && els.boxIndividualSummary){
          const allowedSummaries = new Set(['mean','median','none']);
          const summaryValue = allowedSummaries.has(state.individualSummary) ? state.individualSummary : 'mean';
          if(els.boxIndividualSummary.value !== summaryValue){
            els.boxIndividualSummary.value = summaryValue;
            console.debug('Debug: box individual summary sync',{ summaryValue });
          }
        }
        console.debug('Debug: box individual summary visibility',{ graphTypeValue, summaryVisible });
      }
      console.debug('Debug: box graph type controls',{ graphTypeValue, showErrorControls });
    };
    els.boxGraphType.addEventListener('change',()=>{ console.log('boxGraphType changed', els.boxGraphType.value); updateGraphTypeControls(); state.scheduleDraw(); });
    if(els.boxIndividualSummary){
      els.boxIndividualSummary.addEventListener('change',()=>{
        const allowedSummaries = new Set(['mean','median','none']);
        const summaryValue = allowedSummaries.has(els.boxIndividualSummary.value) ? els.boxIndividualSummary.value : 'mean';
        state.individualSummary = summaryValue;
        console.debug('Debug: box individual summary change',{ summaryValue });
        state.scheduleDraw();
      });
    }
    els.boxPointMode.addEventListener('change',()=>{ console.log('boxPointMode changed', els.boxPointMode.value); state.scheduleDraw(); });
    els.boxShowCaps.addEventListener('change',()=>{ console.log('boxShowCaps changed', els.boxShowCaps.checked); state.scheduleDraw(); });
    if(els.boxShowSignificance){
      els.boxShowSignificance.checked = !!state.showSignificanceBars;
      els.boxShowSignificance.addEventListener('change',()=>{
        state.showSignificanceBars = !!els.boxShowSignificance.checked;
        console.debug('Debug: box significance toggle',{ enabled: state.showSignificanceBars });
        state.scheduleDraw();
      });
    }
    els.boxErrorMode.addEventListener('change',()=>{ console.log('boxErrorMode changed', els.boxErrorMode.value); state.scheduleDraw(); });
    els.boxYMin.addEventListener('input',()=>{ console.log('boxYMin changed', els.boxYMin.value); state.scheduleDraw(); });
    els.boxYMax.addEventListener('input',()=>{ console.log('boxYMax changed', els.boxYMax.value); state.scheduleDraw(); });
    if(els.boxFlipAxes){
      state.flipAxes = !!els.boxFlipAxes.checked;
      els.boxFlipAxes.addEventListener('change',()=>{
        state.flipAxes = !!els.boxFlipAxes.checked;
        console.debug('Debug: box flipAxes toggled',{ flipAxes: state.flipAxes }); // Debug: flip axis change trace
        state.scheduleDraw();
      });
    }
    updateGraphTypeControls();
    els.boxFill.addEventListener('input',()=>{ console.log('boxFill changed',{newColor:els.boxFill.value,oldColor:state.lastDefaultFill}); state.fillColors=state.fillColors.map(c=>c===state.lastDefaultFill?els.boxFill.value:c); state.lastDefaultFill=els.boxFill.value; state.scheduleDraw(); });
    els.boxBorder.addEventListener('input',()=>{ console.log('boxBorder changed', els.boxBorder.value); state.scheduleDraw(); });
    els.boxBorderWidth.addEventListener('input',()=>{ console.log('boxBorderWidth changed', els.boxBorderWidth.value); state.scheduleDraw(); });
    if(els.boxErrorBarWidth){
      els.boxErrorBarWidth.addEventListener('input',()=>{
        console.debug('Debug: boxErrorBarWidth changed',{ value: els.boxErrorBarWidth.value });
        state.scheduleDraw();
      });
    }
    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#boxExportControls',
        svgSelector: '#boxSvg',
        fileName: 'boxplot',
        contextLabel: 'box-export'
      });
      console.debug('Debug: box export controls mounted', { hasExporter: true }); // Debug: box export mount
    } else {
      console.debug('Debug: box export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: box export fallback
    }
    global.$('#openBox').addEventListener('click', box.open);
    global.$('#saveBox').addEventListener('click', box.save);
    global.$('#saveAsBox').addEventListener('click', box.saveAs);
    global.$('#boxGraphFile').addEventListener('change', e=>{ const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; box.loadFromFile(f); } });
  }

  // PART: STATS
  function p2stars(p){ return p<0.0001?'****':p<0.001?'***':p<0.01?'**':p<0.05?'*':'ns'; }
  function formatP(p){ return p.toLocaleString('en-US',{maximumSignificantDigits:6}); }
  const mean=arr=>arr.reduce((s,v)=>s+v,0)/arr.length;
  function tTest(a,b){ const na=a.length, nb=b.length; const ma=mean(a), mb=mean(b); const va=a.reduce((s,v)=>s+Math.pow(v-ma,2),0)/(na-1||1); const vb=b.reduce((s,v)=>s+Math.pow(v-mb,2),0)/(nb-1||1); const se=Math.sqrt(va/na+vb/nb); const t=(ma-mb)/se; const df=Math.pow(va/na+vb/nb,2)/(Math.pow(va/na,2)/(na-1||1)+Math.pow(vb/nb,2)/(nb-1||1)); const p=2*(1-global.jStat.studentt.cdf(Math.abs(t),df)); return {t,df,p}; }
  function tTestPaired(a,b){ const diffs=a.map((v,i)=>v-b[i]).filter(v=>!isNaN(v)); const n=diffs.length; const md=mean(diffs); const sd=Math.sqrt(diffs.reduce((s,v)=>s+Math.pow(v-md,2),0)/(n-1||1)); const t=md/(sd/Math.sqrt(n)); const p=2*(1-global.jStat.studentt.cdf(Math.abs(t),n-1)); return {t,df:n-1,p}; }
  function rankArray(arr){ const sorted=arr.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v); const ranks=new Array(arr.length); let i=0; while(i<sorted.length){ let j=i; while(j<sorted.length && sorted[j].v===sorted[i].v) j++; const avg=(i+j-1)/2+1; for(let k=i;k<j;k++) ranks[sorted[k].i]=avg; i=j; } return ranks; }
  function mannWhitney(a,b){ const all=[...a.map(v=>({v,g:0})),...b.map(v=>({v,g:1}))]; all.sort((x,y)=>x.v-y.v); let rank=1; for(let i=0;i<all.length;i++){ let j=i; while(j<all.length && all[j].v===all[i].v) j++; const avg=(rank+(j-1))/2; for(let k=i;k<j;k++) all[k].rank=avg; rank=j+1; } const Ra=all.filter(o=>o.g===0).reduce((s,o)=>s+o.rank,0); const Rb=all.filter(o=>o.g===1).reduce((s,o)=>s+o.rank,0); const na=a.length, nb=b.length; const Ua=Ra-na*(na+1)/2; const Ub=Rb-nb*(nb+1)/2; const U=Math.min(Ua,Ub); const mu=na*nb/2; const sigma=Math.sqrt(na*nb*(na+nb+1)/12); const z=(U-mu)/sigma; const p=2*(1-global.jStat.normal.cdf(Math.abs(z),0,1)); return {U,z,p}; }
  function wilcoxonSignedRank(a,b){ const diffs=a.map((v,i)=>v-b[i]).filter(v=>v!==0); const abs=diffs.map(Math.abs); const ranks=rankArray(abs); let Wpos=0,Wneg=0; ranks.forEach((rk,i)=>{ if(diffs[i]>0) Wpos+=rk; else Wneg+=rk; }); const W=Math.min(Wpos,Wneg); const nEff=ranks.length; const mu=nEff*(nEff+1)/4; const sigma=Math.sqrt(nEff*(nEff+1)*(2*nEff+1)/24); const z=(W-mu)/sigma; const p=2*(1-global.jStat.normal.cdf(Math.abs(z),0,1)); return {W,z,p}; }
  function anova(groups){ const k=groups.length; const n=groups.reduce((s,g)=>s+g.length,0); const grand=groups.reduce((s,g)=>s+mean(g)*g.length,0)/n; let ssBetween=0, ssWithin=0; groups.forEach(g=>{ const m=mean(g); ssBetween+=g.length*Math.pow(m-grand,2); ssWithin+=g.reduce((s,v)=>s+Math.pow(v-m,2),0); }); const dfBetween=k-1; const dfWithin=n-k; const msBetween=ssBetween/dfBetween; const msWithin=ssWithin/dfWithin; const F=msBetween/msWithin; const p=1-global.jStat.centralF.cdf(F,dfBetween,dfWithin); return {F,p}; }
  function kruskalWallis(groups){ const n=groups.reduce((s,g)=>s+g.length,0); const all=groups.flat(); const ranks=rankArray(all); let idx=0; const R=groups.map(g=>{ const r=ranks.slice(idx, idx+g.length).reduce((a,b)=>a+b,0); idx+=g.length; return r; }); const H=(12/(n*(n+1)))*R.reduce((sum,ri,i)=>sum+Math.pow(ri,2)/groups[i].length,0)-3*(n+1); const df=groups.length-1; const p=1-global.jStat.chisquare.cdf(H,df); return {H,p}; }

  function normalQuantile(p){
    const clipped=Math.min(Math.max(p,Number.EPSILON),1-Number.EPSILON);
    const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.38357751867269e+02,-3.066479806614716e+01,2.506628277459239e+00];
    const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
    const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
    const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
    const plow=0.02425;
    const phigh=1-plow;
    let q,r;
    if(clipped<plow){
      q=Math.sqrt(-2*Math.log(clipped));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    if(clipped>phigh){
      q=Math.sqrt(-2*Math.log(1-clipped));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    q=clipped-0.5;
    r=q*q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4]+1);
  }

  function logGamma(z){
    const coeffs=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if(z<0.5){
      return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    }
    z-=1;
    let x=coeffs[0];
    for(let i=1;i<coeffs.length;i++){
      x+=coeffs[i]/(z+i);
    }
    const t=z+7.5;
    return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);
  }

  function betacf(x,a,b){
    const MAX_ITER=100;
    const EPS=1e-12;
    const FPMIN=Number.MIN_VALUE/EPS;
    let qab=a+b;
    let qap=a+1;
    let qam=a-1;
    let c=1;
    let d=1-qab*x/qap;
    if(Math.abs(d)<FPMIN) d=FPMIN;
    d=1/d;
    let h=d;
    for(let m=1;m<=MAX_ITER;m++){
      const m2=2*m;
      let aa=m*(b-m)*x/((qam+m2)*(a+m2));
      d=1+aa*d;
      if(Math.abs(d)<FPMIN) d=FPMIN;
      c=1+aa/c;
      if(Math.abs(c)<FPMIN) c=FPMIN;
      d=1/d;
      h*=d*c;
      aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
      d=1+aa*d;
      if(Math.abs(d)<FPMIN) d=FPMIN;
      c=1+aa/c;
      if(Math.abs(c)<FPMIN) c=FPMIN;
      d=1/d;
      const del=d*c;
      h*=del;
      if(Math.abs(del-1)<EPS) break;
    }
    return h;
  }

  function regularizedIncompleteBeta(x,a,b){
    if(x<=0) return 0;
    if(x>=1) return 1;
    const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log(1-x));
    if(x<(a+1)/(a+b+2)){
      return bt*betacf(x,a,b)/a;
    }
    return 1-bt*betacf(1-x,b,a)/b;
  }

  function fcdf(x,d1,d2){
    if(!Number.isFinite(x)||x<0){
      return 0;
    }
    const transformed=(d1*x)/(d1*x+d2);
    const result=regularizedIncompleteBeta(transformed,d1/2,d2/2);
    return Number.isFinite(result)?result:0;
  }

  function computeQQPoints(values){
    const cleaned=values.filter(Number.isFinite);
    if(cleaned.length<3){
      return [];
    }
    const sorted=cleaned.slice().sort((a,b)=>a-b);
    const n=sorted.length;
    const mean=sorted.reduce((sum,v)=>sum+v,0)/n;
    const variance=sorted.reduce((sum,v)=>{ const diff=v-mean; return sum+diff*diff; },0)/(n-1||1);
    const sd=Math.sqrt(variance)||0;
    if(sd===0){
      return [];
    }
    const sampleCount=Math.min(25,n);
    const points=[];
    for(let j=0;j<sampleCount;j++){
      const frac=(j+0.5)/sampleCount;
      const index=Math.min(n-1,Math.max(0,Math.round(frac*n-0.5)));
      const theoretical=normalQuantile((index+0.5)/n);
      const observed=(sorted[index]-mean)/sd;
      points.push({ theoretical, observed });
    }
    console.debug('Debug: box QQ points computed',{ sampleCount: points.length, n });
    return points;
  }

  function computeDagostino(values){
    const cleaned=values.filter(Number.isFinite);
    const n=cleaned.length;
    if(n<8){
      console.debug('Debug: box dagostino insufficient sample',{ n });
      return { method:'dagostino', sampleSize:n, statistic:NaN, pValue:NaN, passed:null, reason:'Sample size < 8' };
    }
    const meanVal=cleaned.reduce((sum,v)=>sum+v,0)/n;
    const diffs=cleaned.map(v=>v-meanVal);
    const m2=diffs.reduce((sum,v)=>sum+v*v,0);
    const m3=diffs.reduce((sum,v)=>sum+v*v*v,0);
    const m4=diffs.reduce((sum,v)=>sum+Math.pow(v,4),0);
    const s2=m2/(n-1||1);
    const s=Math.sqrt(s2);
    if(!Number.isFinite(s)||s===0){
      console.debug('Debug: box dagostino zero variance',{ n });
      return { method:'dagostino', sampleSize:n, statistic:0, pValue:1, passed:true, reason:'Zero variance' };
    }
    const g1=(n*m3)/((n-1)*(n-2)*Math.pow(s,3));
    const g2=((n*(n+1)*m4)/((n-1)*(n-2)*(n-3)*Math.pow(s,4)))-(3*Math.pow(n-1,2))/((n-2)*(n-3));
    const mu2=6*(n-2)/((n+1)*(n+3));
    const gamma2=36*(n-7)*(n*n+2*n-5)/((n-2)*(n+5)*(n+7)*(n+9));
    const w2=Math.sqrt(2*gamma2+4)-1;
    const alpha=Math.sqrt(2/(w2-1));
    const delta=1/Math.sqrt(Math.log(w2));
    const z1=delta*Math.asinh(g1/(alpha*Math.sqrt(mu2)));
    const mu1g2=-6/(n+1);
    const mu2g2=24*n*(n-2)*(n-3)/(Math.pow(n+1,2)*(n+3)*(n+5));
    const gamma1g2=(6*(n*n-5*n+2)/((n+7)*(n+9)))*Math.sqrt(6*(n+3)*(n+5)/(n*(n-2)*(n-3)));
    const gamma2g2=36*(15*Math.pow(n,6)-36*Math.pow(n,5)-628*Math.pow(n,4)+982*Math.pow(n,3)+5777*Math.pow(n,2)-6402*n+900)/(n*(n-3)*(n-2)*(n+7)*(n+9)*(n+11)*(n+13));
    const A=6+(8/gamma2g2)*(2/gamma2g2+gamma1g2*gamma1g2);
    const term=(g2-mu1g2)/Math.sqrt(mu2g2)*Math.sqrt(2/(A-4));
    const base=Math.pow((1-2/A)/(1+term),1/3);
    const z2=Math.sqrt(9*A/2)*(1-2/(9*A)-base);
    const statistic=z1*z1+z2*z2;
    const pValue=Math.exp(-statistic/2);
    const passed=Number.isFinite(pValue)?pValue>=ASSUMPTION_ALPHA:null;
    console.debug('Debug: box dagostino metrics',{ n, g1, g2, z1, z2, statistic, pValue, passed });
    return { method:'dagostino', sampleSize:n, statistic, pValue, passed, z1, z2, g1, g2 };
  }

  function computeVarianceDiagnostics(groups,labels){
    const cleanedGroups=groups.map((group,idx)=>{
      const filtered=group.filter(Number.isFinite);
      console.debug('Debug: box variance group summary',{ index: idx, label: labels[idx], size: filtered.length });
      return filtered;
    });
    if(cleanedGroups.length<2){
      return { method:'brown-forsythe', statistic:NaN, pValue:NaN, passed:null, df1:0, df2:0, sparkline:[], reason:'Need >=2 groups' };
    }
    const medians=cleanedGroups.map(group=>{
      if(!group.length) return NaN;
      const sorted=group.slice().sort((a,b)=>a-b);
      const mid=Math.floor(sorted.length/2);
      return sorted.length%2===0?(sorted[mid-1]+sorted[mid])/2:sorted[mid];
    });
    const transformed=cleanedGroups.map((group,idx)=>group.map(value=>Math.abs(value-(medians[idx]||0))));
    const totalN=transformed.reduce((sum,g)=>sum+g.length,0);
    const k=transformed.length;
    if(totalN<=k){
      return { method:'brown-forsythe', statistic:NaN, pValue:NaN, passed:null, df1:k-1, df2:Math.max(totalN-k,0), sparkline:[], reason:'Insufficient observations' };
    }
    const groupMeans=transformed.map(group=>group.reduce((sum,v)=>sum+v,0)/(group.length||1));
    const grandMean=transformed.reduce((sum,group,idx)=>sum+groupMeans[idx]*(group.length||0),0)/totalN;
    let ssBetween=0;
    let ssWithin=0;
    transformed.forEach((group,idx)=>{
      const mean=groupMeans[idx]||0;
      ssBetween+=(group.length||0)*Math.pow(mean-grandMean,2);
      group.forEach(val=>{ ssWithin+=Math.pow(val-mean,2); });
    });
    const df1=k-1;
    const df2=totalN-k;
    const msBetween=ssBetween/(df1||1);
    const msWithin=ssWithin/(df2||1);
    const F=msWithin===0?Infinity:msBetween/msWithin;
    const pValue=Number.isFinite(F)?1-fcdf(F,df1,df2):0;
    const passed=Number.isFinite(pValue)?pValue>=ASSUMPTION_ALPHA:null;
    console.debug('Debug: box variance diagnostics',{ df1, df2, F, pValue, passed, grandMean });
    const sparklineValues=groupMeans.map((val,idx)=>({ label: labels[idx], value: val }));
    return { method:'brown-forsythe', statistic:F, pValue, passed, df1, df2, sparkline:sparklineValues };
  }

  function computeAssumptionDiagnostics(groups,labels){
    const diagnostics={
      normalityMethod:'dagostino',
      varianceMethod:'brown-forsythe',
      alpha:ASSUMPTION_ALPHA,
      groups:[],
      warnings:[]
    };
    const failReasons=[];
    groups.forEach((group,idx)=>{
      const label=labels[idx] || `Group ${idx + 1}`;
      const dagostino=computeDagostino(group);
      const qqPoints=computeQQPoints(group);
      diagnostics.groups.push({
        label,
        size:group.filter(Number.isFinite).length,
        normality:dagostino,
        qqPoints
      });
      if(dagostino && dagostino.passed===false){
        const formatted=Number.isFinite(dagostino.pValue)?formatP(dagostino.pValue):'—';
        failReasons.push(`${label} failed normality (p = ${formatted})`);
      }
    });
    const variance=computeVarianceDiagnostics(groups,labels);
    diagnostics.variance=variance;
    if(variance && variance.passed===false){
      const formatted=Number.isFinite(variance.pValue)?formatP(variance.pValue):'—';
      failReasons.push(`Variance equality violated (p = ${formatted})`);
    }
    diagnostics.warnings=failReasons;
    diagnostics.recommendNonParametric=failReasons.length>0;
    console.debug('Debug: box assumption diagnostics',{ failCount: failReasons.length, variancePassed: variance?.passed });
    return diagnostics;
  }

  function createAssumptionBadge(result,label){
    const badge=document.createElement('span');
    badge.className='assumption-badge';
    badge.textContent=label || (result ? 'PASS' : result===false ? 'FAIL' : 'N/A');
    badge.dataset.result=result===false?'fail':result?'pass':'na';
    badge.style.display='inline-block';
    badge.style.padding='2px 6px';
    badge.style.borderRadius='4px';
    badge.style.fontSize='11px';
    badge.style.fontWeight='600';
    if(result===false){
      badge.style.background='#f8d7da';
      badge.style.color='#721c24';
    }else if(result){
      badge.style.background='#d4edda';
      badge.style.color='#155724';
    }else{
      badge.style.background='#e2e3e5';
      badge.style.color='#383d41';
    }
    return badge;
  }

  function createQQSparkline(points){
    const width=80;
    const height=40;
    const padding=6;
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.setAttribute('width',String(width));
    svg.setAttribute('height',String(height));
    svg.setAttribute('preserveAspectRatio','none');
    if(!points || !points.length){
      return svg;
    }
    const values=points.reduce((acc,p)=>{
      acc.push(p.theoretical);
      acc.push(p.observed);
      return acc;
    },[]);
    let min=Math.min(...values);
    let max=Math.max(...values);
    if(!Number.isFinite(min) || !Number.isFinite(max)){
      return svg;
    }
    if(min===max){
      min-=1;
      max+=1;
    }
    const scale=v=>(v-min)/(max-min);
    const xCoord=v=>padding+scale(v)*(width-padding*2);
    const yCoord=v=>height-padding-scale(v)*(height-padding*2);
    const identity=document.createElementNS(NS,'line');
    identity.setAttribute('x1',String(xCoord(min)));
    identity.setAttribute('y1',String(yCoord(min)));
    identity.setAttribute('x2',String(xCoord(max)));
    identity.setAttribute('y2',String(yCoord(max)));
    identity.setAttribute('stroke','#cccccc');
    identity.setAttribute('stroke-width','1');
    svg.appendChild(identity);
    const path=document.createElementNS(NS,'polyline');
    const sorted=points.slice().sort((a,b)=>a.theoretical-b.theoretical);
    path.setAttribute('fill','none');
    path.setAttribute('stroke','#1d78c8');
    path.setAttribute('stroke-width','1.5');
    path.setAttribute('points',sorted.map(p=>`${xCoord(p.theoretical)},${yCoord(p.observed)}`).join(' '));
    svg.appendChild(path);
    return svg;
  }

  function createResidualSparkline(values){
    const width=80;
    const height=40;
    const padding=6;
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.setAttribute('width',String(width));
    svg.setAttribute('height',String(height));
    svg.setAttribute('preserveAspectRatio','none');
    if(!values || !values.length){
      return svg;
    }
    const data=values.map(v=>Number(v.value)).filter(Number.isFinite);
    if(!data.length){
      return svg;
    }
    const min=Math.min(...data);
    const max=Math.max(...data);
    const yScale=v=>height-padding-((v-min)/(max-min || 1))*(height-padding*2);
    const xScale=idx=>padding+(idx/(data.length-1 || 1))*(width-padding*2);
    const polyline=document.createElementNS(NS,'polyline');
    polyline.setAttribute('fill','none');
    polyline.setAttribute('stroke','#8e44ad');
    polyline.setAttribute('stroke-width','1.5');
    polyline.setAttribute('points',data.map((v,idx)=>`${xScale(idx)},${yScale(v)}`).join(' '));
    svg.appendChild(polyline);
    return svg;
  }

  function renderAssumptionSection(container,diagnostics){
    if(!container){
      return;
    }
    container.innerHTML='';
    const section=document.createElement('div');
    section.className='stats-assumption-section';
    const heading=document.createElement('div');
    heading.className='stats-table-lead';
    heading.textContent='Assumption Checks';
    section.appendChild(heading);
    if(!diagnostics){
      const message=document.createElement('div');
      message.textContent='Assumption metrics will appear once groups are selected.';
      section.appendChild(message);
      container.appendChild(section);
      return;
    }
    const table=document.createElement('table');
    const thead=document.createElement('thead');
    const headerRow=document.createElement('tr');
    ['Group','Normality','p-value','QQ'].forEach(label=>{
      const th=document.createElement('th');
      th.textContent=label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody=document.createElement('tbody');
    diagnostics.groups.forEach(group=>{
      const tr=document.createElement('tr');
      const labelCell=document.createElement('td');
      labelCell.textContent=group.label;
      tr.appendChild(labelCell);
      const badgeCell=document.createElement('td');
      badgeCell.appendChild(createAssumptionBadge(group.normality?.passed));
      tr.appendChild(badgeCell);
      const pCell=document.createElement('td');
      const pValue=group.normality?.pValue;
      pCell.textContent=Number.isFinite(pValue)?formatP(pValue):'—';
      tr.appendChild(pCell);
      const sparkCell=document.createElement('td');
      sparkCell.appendChild(createQQSparkline(group.qqPoints));
      tr.appendChild(sparkCell);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    if(diagnostics.variance){
      const varianceRow=document.createElement('div');
      varianceRow.style.marginTop='8px';
      const label=document.createElement('span');
      label.textContent='Variance test:';
      label.style.marginRight='8px';
      varianceRow.appendChild(label);
      varianceRow.appendChild(createAssumptionBadge(diagnostics.variance.passed, diagnostics.variance.passed===false?'FAIL':'PASS'));
      const detail=document.createElement('span');
      const pValue=diagnostics.variance?.pValue;
      detail.textContent=` p = ${Number.isFinite(pValue)?formatP(pValue):'—'}`;
      detail.style.marginLeft='6px';
      varianceRow.appendChild(detail);
      if(Array.isArray(diagnostics.variance.sparkline) && diagnostics.variance.sparkline.length){
        const spark=createResidualSparkline(diagnostics.variance.sparkline);
        spark.style.marginLeft='12px';
        varianceRow.appendChild(spark);
      }
      section.appendChild(varianceRow);
    }
    if(Array.isArray(diagnostics.warnings) && diagnostics.warnings.length){
      const warningList=document.createElement('div');
      warningList.className='assumption-warning-list';
      diagnostics.warnings.forEach(msg=>{
        const warn=document.createElement('div');
        warn.className='assumption-warning';
        warn.textContent=msg;
        warningList.appendChild(warn);
      });
      section.appendChild(warningList);
    }
    container.appendChild(section);
  }

  function serializeAssumptions(diag){
    if(!diag){
      return null;
    }
    return {
      normalityMethod:diag.normalityMethod,
      varianceMethod:diag.variance?.method || null,
      alpha:diag.alpha,
      groups:diag.groups.map(g=>({
        label:g.label,
        size:g.size,
        statistic:Number.isFinite(g.normality?.statistic)?g.normality.statistic:null,
        pValue:Number.isFinite(g.normality?.pValue)?g.normality.pValue:null,
        passed:g.normality?.passed
      })),
      variance:diag.variance?{
        statistic:Number.isFinite(diag.variance.statistic)?diag.variance.statistic:null,
        pValue:Number.isFinite(diag.variance.pValue)?diag.variance.pValue:null,
        passed:diag.variance.passed,
        df1:diag.variance.df1,
        df2:diag.variance.df2
      }:null,
      warnings:Array.isArray(diag.warnings)?diag.warnings.slice():[],
      recommendNonParametric:!!diag.recommendNonParametric
    };
  }


  function parsePairString(str,traces){ return str.split(/[\n,]+/).map(p=>p.trim()).filter(p=>p).map(p=>{ const [a,b]=p.split('-').map(s=>s.trim()); const ai=isNaN(parseInt(a))?traces.findIndex(t=>t.name===a):parseInt(a)-1; const bi=isNaN(parseInt(b))?traces.findIndex(t=>t.name===b):parseInt(b)-1; return (ai>=0&&bi>=0)?{ai,bi}:null; }).filter(Boolean); }
  function ensureGroupedStatsDefaults(){
    if(!state.groupedStats || typeof state.groupedStats !== 'object'){
      state.groupedStats = { analysis: 'twoWayAnova' };
    }
    const allowed = new Set(['twoWayAnova','twoWayMixed','threeWayAnova','threeWayMixed','rowTTests']);
    if(!allowed.has(state.groupedStats.analysis)){
      state.groupedStats.analysis = 'twoWayAnova';
      console.debug('Debug: grouped stats analysis reset to default');
    }
  }
  function formatStatNumber(value, digits){
    const places = Number.isInteger(digits) ? digits : 4;
    if(!Number.isFinite(value)){
      return '—';
    }
    return value.toFixed(places);
  }
  function prepareGroupedStatsData(traces, helpers){
    ensureGroupedDefaults();
    ensureGroupedStatsDefaults();
    const hotInstance = state.hot;
    const groups = Array.isArray(state.grouped?.groups) ? state.grouped.groups : [];
    const groupsCount = groups.length;
    const replicatesRaw = Number(state.grouped?.replicatesPerGroup);
    const conditionsCount = Number.isFinite(replicatesRaw) && replicatesRaw >= 1 ? Math.round(replicatesRaw) : 1;
    const axisLabelsSource = Array.isArray(helpers?.axisLabels) && helpers.axisLabels.length >= conditionsCount
      ? helpers.axisLabels
      : (Array.isArray(state.lastAxisLabels) && state.lastAxisLabels.length >= conditionsCount ? state.lastAxisLabels : []);
    const conditionLabels = [];
    for(let i = 0; i < conditionsCount; i++){
      const rawLabel = axisLabelsSource[i];
      const trimmed = typeof rawLabel === 'string' ? rawLabel.trim() : '';
      conditionLabels.push(trimmed || `Condition ${i + 1}`);
    }
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      console.debug('Debug: prepareGroupedStatsData missing hot instance');
      return { ok: false, message: 'Table data unavailable for grouped analysis.', groupsCount, conditionsCount, groupLabels: [], conditionLabels, rows: [], cellData: [], rowsWithData: 0, totalRows: 0, partialRowsSkipped: 0 };
    }
    const tableData = hotInstance.getData();
    const normalizedGroups = groups.map((name, idx)=>{
      const trimmed = typeof name === 'string' ? name.trim() : '';
      return trimmed || `Group ${idx + 1}`;
    });
    if(!groupsCount){
      return { ok: false, message: 'Add at least one group to run grouped analyses.', groupsCount, conditionsCount, groupLabels: normalizedGroups, conditionLabels, rows: [], cellData: [], rowsWithData: 0, totalRows: 0, partialRowsSkipped: 0 };
    }
    const rows = [];
    let candidateRows = 0;
    for(let r = 1; r < tableData.length; r++){
      const row = tableData[r];
      if(!row) continue;
      let rowHasAny = false;
      let rowComplete = true;
      const entry = Array.from({ length: groupsCount }, () => Array(conditionsCount).fill(null));
      for(let gIdx = 0; gIdx < groupsCount; gIdx++){
        for(let cIdx = 0; cIdx < conditionsCount; cIdx++){
          const colIndex = gIdx * conditionsCount + cIdx;
          const rawValue = Array.isArray(row) ? row[colIndex] : undefined;
          const parsed = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
          if(Number.isFinite(parsed)){
            entry[gIdx][cIdx] = parsed;
            rowHasAny = true;
          }else{
            rowComplete = false;
          }
        }
      }
      if(rowHasAny){
        candidateRows++;
      }
      if(rowHasAny && rowComplete){
        rows.push(entry);
      }
    }
    if(!rows.length){
      return {
        ok: false,
        message: 'Enter complete rows (no missing values) to run grouped analyses.',
        groupsCount,
        conditionsCount,
        groupLabels: normalizedGroups,
        conditionLabels,
        rows: [],
        cellData: [],
        rowsWithData: 0,
        totalRows: candidateRows,
        partialRowsSkipped: Math.max(0, candidateRows)
      };
    }
    const cellData = Array.from({ length: groupsCount }, () => Array.from({ length: conditionsCount }, () => []));
    rows.forEach((rowEntry, rowIdx) => {
      for(let gIdx = 0; gIdx < groupsCount; gIdx++){
        for(let cIdx = 0; cIdx < conditionsCount; cIdx++){
          const value = rowEntry[gIdx][cIdx];
          cellData[gIdx][cIdx].push(value);
        }
      }
    });
    const info = {
      ok: true,
      groupsCount,
      conditionsCount,
      groupLabels: normalizedGroups,
      conditionLabels,
      rows,
      cellData,
      rowsWithData: rows.length,
      totalRows: candidateRows,
      partialRowsSkipped: Math.max(0, candidateRows - rows.length)
    };
    console.debug('Debug: grouped stats dataset summary', {
      groups: info.groupsCount,
      conditions: info.conditionsCount,
      rowsWithData: info.rowsWithData,
      partialRowsSkipped: info.partialRowsSkipped
    });
    return info;
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
        const sum = arr.reduce((acc, val)=>acc + val, 0);
        const mean = arr.length ? sum / arr.length : 0;
        cellMeans[i][j] = mean;
        totalsByGroup[i] += sum;
        totalsByCondition[j] += sum;
        grandTotal += sum;
        sse += arr.reduce((acc, val)=>acc + Math.pow(val - mean, 2), 0);
      }
    }
    if(!balanced){
      console.debug('Debug: grouped stats imbalance detected', mismatch);
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
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfError) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfError) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfError) : NaN;
    console.debug('Debug: two-way ANOVA stats',{ dfA, dfB, dfAB, dfError, fA, fB, fAB });
    return {
      ok: true,
      caption: 'Two-way ANOVA',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Error', df: String(dfError), ss: formatStatNumber(sse), ms: formatStatNumber(mse), f: '—', p: '—' }
      ],
      options:{ fileName:'box-two-way-anova', contextLabel:'box-grouped-anova2' },
      footnotes: ['F-tests use the pooled within-cell error term.'],
      diagnostics: { dfA, dfB, dfAB, dfError }
    };
  }
  function analyzeTwoWayMixed(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, ssa, ssb, ssab, sse, meanByGroup, meanByCondition, subjectMeans, asMeans, bsMeans, grandMean } = base;
    if(I < 2 || J < 2 || K < 2){
      return { ok: false, message: 'Two-way mixed model requires at least two groups, two conditions, and two complete rows.' };
    }
    const dfA = I - 1;
    const dfB = J - 1;
    const dfS = K - 1;
    const dfAS = (I - 1) * (K - 1);
    const dfBS = (J - 1) * (K - 1);
    const dfAB = (I - 1) * (J - 1);
    const dfABS = (I - 1) * (J - 1) * (K - 1);
    if(dfAS <= 0 || dfBS <= 0 || dfABS <= 0){
      return { ok: false, message: 'Two-way mixed model requires at least two rows to estimate error terms.' };
    }
    let sss = 0;
    for(let k = 0; k < K; k++){
      sss += Math.pow(subjectMeans[k] - grandMean, 2);
    }
    sss *= I * J;
    let ssas = 0;
    for(let i = 0; i < I; i++){
      for(let k = 0; k < K; k++){
        const value = asMeans[i][k] - meanByGroup[i] - subjectMeans[k] + grandMean;
        ssas += Math.pow(value, 2);
      }
    }
    ssas *= J;
    let ssbs = 0;
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        const value = bsMeans[j][k] - meanByCondition[j] - subjectMeans[k] + grandMean;
        ssbs += Math.pow(value, 2);
      }
    }
    ssbs *= I;
    let ssabs = 0;
    for(let k = 0; k < K; k++){
      for(let i = 0; i < I; i++){
        for(let j = 0; j < J; j++){
          const term = data.rows[k][i][j]
            - base.cellMeans[i][j]
            - asMeans[i][k]
            - bsMeans[j][k]
            + meanByGroup[i]
            + meanByCondition[j]
            + subjectMeans[k]
            - grandMean;
          ssabs += Math.pow(term, 2);
        }
      }
    }
    const msa = ssa / dfA;
    const msas = ssas / dfAS;
    const msb = ssb / dfB;
    const msbs = ssbs / dfBS;
    const msab = ssab / dfAB;
    const msabs = ssabs / dfABS;
    const fA = msas > 0 ? msa / msas : NaN;
    const fB = msbs > 0 ? msb / msbs : NaN;
    const fAB = msabs > 0 ? msab / msabs : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfAS) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfBS) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfABS) : NaN;
    console.debug('Debug: two-way mixed stats',{ dfA, dfAS, dfB, dfBS, dfAB, dfABS, fA, fB, fAB });
    return {
      ok: true,
      caption: 'Two-way Mixed Model',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Row (random)', df: String(dfS), ss: formatStatNumber(sss), ms: formatStatNumber(dfS ? sss / dfS : NaN), f: '—', p: '—' },
        { source: 'Group × Row', df: String(dfAS), ss: formatStatNumber(ssas), ms: formatStatNumber(msas), f: '—', p: '—' },
        { source: 'Condition × Row', df: String(dfBS), ss: formatStatNumber(ssbs), ms: formatStatNumber(msbs), f: '—', p: '—' },
        { source: 'Group × Condition × Row', df: String(dfABS), ss: formatStatNumber(ssabs), ms: formatStatNumber(msabs), f: '—', p: '—' }
      ],
      options:{ fileName:'box-two-way-mixed', contextLabel:'box-grouped-mixed2' },
      footnotes: ['Mixed model treats rows as a random effect; F-tests for fixed effects use row interactions as denominators.']
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
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfABC) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfABC) : NaN;
    const pC = Number.isFinite(fC) ? 1 - jStatLib.centralF.cdf(fC, dfC, dfABC) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfABC) : NaN;
    const pAC = Number.isFinite(fAC) ? 1 - jStatLib.centralF.cdf(fAC, dfAC, dfABC) : NaN;
    const pBC = Number.isFinite(fBC) ? 1 - jStatLib.centralF.cdf(fBC, dfBC, dfABC) : NaN;
    console.debug('Debug: three-way ANOVA stats',{ dfA, dfB, dfC, dfAB, dfAC, dfBC, dfABC, fA, fB, fC, fAB, fAC, fBC });
    return {
      ok: true,
      caption: 'Three-way ANOVA',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Row', df: String(dfC), ss: formatStatNumber(ssc), ms: formatStatNumber(msc), f: formatStatNumber(fC), p: formatP(pC) },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Group × Row', df: String(dfAC), ss: formatStatNumber(ssac), ms: formatStatNumber(msac), f: formatStatNumber(fAC), p: formatP(pAC) },
        { source: 'Condition × Row', df: String(dfBC), ss: formatStatNumber(ssbc), ms: formatStatNumber(msbc), f: formatStatNumber(fBC), p: formatP(pBC) },
        { source: 'Group × Condition × Row', df: String(dfABC), ss: formatStatNumber(ssabc), ms: formatStatNumber(msabc), f: '—', p: '—' },
        { source: 'Residual', df: '—', ss: formatStatNumber(residual), ms: '—', f: '—', p: '—' }
      ],
      options:{ fileName:'box-three-way-anova', contextLabel:'box-grouped-anova3' },
      footnotes: ['Highest-order interaction is used as the error term for F-tests.'],
      diagnostics: { dfA, dfB, dfC, dfAB, dfAC, dfBC, dfABC }
    };
  }
  function analyzeThreeWayMixed(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, ssa, ssb, ssab, meanByGroup, meanByCondition, subjectMeans, asMeans, bsMeans, grandMean } = base;
    if(I < 2 || J < 2 || K < 2){
      return { ok: false, message: 'Three-way mixed model requires at least two groups, two conditions, and two rows.' };
    }
    const dfA = I - 1;
    const dfB = J - 1;
    const dfC = K - 1;
    const dfAS = (I - 1) * (K - 1);
    const dfBS = (J - 1) * (K - 1);
    const dfAB = (I - 1) * (J - 1);
    const dfABS = (I - 1) * (J - 1) * (K - 1);
    if(dfAS <= 0 || dfBS <= 0 || dfABS <= 0){
      return { ok: false, message: 'Three-way mixed model requires at least two rows to estimate random effects.' };
    }
    let sss = 0;
    for(let k = 0; k < K; k++){
      sss += Math.pow(subjectMeans[k] - grandMean, 2);
    }
    sss *= I * J;
    let ssas = 0;
    for(let i = 0; i < I; i++){
      for(let k = 0; k < K; k++){
        const term = asMeans[i][k] - meanByGroup[i] - subjectMeans[k] + grandMean;
        ssas += Math.pow(term, 2);
      }
    }
    ssas *= J;
    let ssbs = 0;
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        const term = bsMeans[j][k] - meanByCondition[j] - subjectMeans[k] + grandMean;
        ssbs += Math.pow(term, 2);
      }
    }
    ssbs *= I;
    let ssabs = 0;
    for(let k = 0; k < K; k++){
      for(let i = 0; i < I; i++){
        for(let j = 0; j < J; j++){
          const term = data.rows[k][i][j]
            - base.cellMeans[i][j]
            - asMeans[i][k]
            - bsMeans[j][k]
            + meanByGroup[i]
            + meanByCondition[j]
            + subjectMeans[k]
            - grandMean;
          ssabs += Math.pow(term, 2);
        }
      }
    }
    const msa = ssa / dfA;
    const msas = ssas / dfAS;
    const msb = ssb / dfB;
    const msbs = ssbs / dfBS;
    const msab = ssab / dfAB;
    const msabs = ssabs / dfABS;
    const fA = msas > 0 ? msa / msas : NaN;
    const fB = msbs > 0 ? msb / msbs : NaN;
    const fAB = msabs > 0 ? msab / msabs : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfAS) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfBS) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfABS) : NaN;
    console.debug('Debug: three-way mixed stats',{ dfA, dfAS, dfB, dfBS, dfAB, dfABS, fA, fB, fAB });
    return {
      ok: true,
      caption: 'Three-way Mixed Model',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Row (random)', df: String(dfC), ss: formatStatNumber(sss), ms: formatStatNumber(dfC ? sss / dfC : NaN), f: '—', p: '—' },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Group × Row', df: String(dfAS), ss: formatStatNumber(ssas), ms: formatStatNumber(msas), f: '—', p: '—' },
        { source: 'Condition × Row', df: String(dfBS), ss: formatStatNumber(ssbs), ms: formatStatNumber(msbs), f: '—', p: '—' },
        { source: 'Group × Condition × Row', df: String(dfABS), ss: formatStatNumber(ssabs), ms: formatStatNumber(msabs), f: '—', p: '—' }
      ],
      options:{ fileName:'box-three-way-mixed', contextLabel:'box-grouped-mixed3' },
      footnotes: ['Rows treated as a random effect; F-tests reported for fixed factors only.']
    };
  }
  function analyzeRowWiseTTests(data){
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
            console.debug('Debug: row-wise t-test skipped due to insufficient replicates',{ condIdx, gA, gB, aCount: sampleA.length, bCount: sampleB.length });
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
    const adjustedValues = applyPValueCorrection(tests.map(test => test.p), state.statsCorrection);
    adjustedValues.forEach((adj, idx) => {
      tests[idx].padjust = adj;
    });
    const correctionMeta = resolveCorrectionMeta(state.statsCorrection, m);
    updateStatsCorrectionSummary(m);
    console.debug('Debug: row-wise t-tests computed',{ count: tests.length, correction: correctionMeta.key });
    return {
      ok: true,
      caption: 'Row-wise t-tests',
      columns: [
        { key: 'condition', label: 'Condition', align: 'left' },
        { key: 'comparison', label: 'Comparison', align: 'left' },
        { key: 't', label: 't', align: 'right' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' },
        { key: 'padjust', label: `P (adj, ${correctionMeta.shortLabel})`, align: 'right' }
      ],
      rows: tests.map(test => ({
        condition: test.condition,
        comparison: `${test.groupA} vs ${test.groupB}`,
        t: formatStatNumber(test.t),
        df: Number.isFinite(test.df) ? formatStatNumber(test.df, 2) : '—',
        p: formatP(test.p),
        padjust: formatP(test.padjust)
      })),
      options:{ fileName:'box-rowwise-ttest', contextLabel:'box-grouped-ttests' },
      footnotes: correctionMeta.footnote ? [correctionMeta.footnote] : []
    };
  }
  function getAdvisorState(){
    if(!state.statsAdvisor || typeof state.statsAdvisor!=='object'){
      state.statsAdvisor={ open:false, answers:{} };
    }
    if(!state.statsAdvisor.answers || typeof state.statsAdvisor.answers!=='object'){
      state.statsAdvisor.answers={};
    }
    return state.statsAdvisor;
  }
  function buildAdvisorContext(traces){
    if(state.tableFormat==='grouped'){
      const prepared=prepareGroupedStatsData(traces,{ axisLabels: state.lastAxisLabels });
      const groupsCount=Number.isFinite(prepared?.groupsCount)?prepared.groupsCount:0;
      const conditionsCount=Number.isFinite(prepared?.conditionsCount)?prepared.conditionsCount:0;
      const rowsWithData=Number.isFinite(prepared?.rowsWithData)?prepared.rowsWithData:0;
      return {
        format:'grouped',
        groupCount:groupsCount,
        conditionCount:conditionsCount,
        rowCount:rowsWithData,
        ok:!!prepared?.ok,
        message:prepared?.message || '',
        partialRowsSkipped:Number.isFinite(prepared?.partialRowsSkipped)?prepared.partialRowsSkipped:0,
        analysis:state.groupedStats?.analysis || 'twoWayAnova',
        prepared
      };
    }
    const indices=[...state.selectedCols].filter(idx=>Number.isInteger(idx) && idx<traces.length);
    const sampleSizes=indices.map(idx=>{
      const trace=traces[idx] || {};
      const values=Array.isArray(trace.rawY)?trace.rawY:(Array.isArray(trace.y)?trace.y:[]);
      return values.filter(Number.isFinite).length;
    });
    return {
      format:'standard',
      groupCount: indices.length,
      sampleSizes,
      assumptions: state.assumptionDiagnostics || null,
      currentTest: state.statsTest,
      currentPaired: state.statsPaired,
      currentPostHoc: state.statsPostHoc
    };
  }
  function ensureAdvisorDefaults(context){
    const advisor=getAdvisorState();
    const answers=advisor.answers;
    if(context?.format==='grouped'){
      const analysis=context?.analysis || state.groupedStats?.analysis;
      if(answers.groupedGoal===undefined){
        answers.groupedGoal=analysis==='rowTTests'?'perCondition':'interaction';
      }
      if(answers.groupedRepeated===undefined){
        if(analysis==='twoWayMixed' || analysis==='threeWayMixed'){
          answers.groupedRepeated='yes';
        }else if(analysis==='twoWayAnova' || analysis==='threeWayAnova'){
          answers.groupedRepeated='no';
        }
      }
      const rowCount=Number.isFinite(context?.rowCount)?context.rowCount:0;
      if(rowCount>=2){
        if(answers.groupedRowFactor===undefined){
          answers.groupedRowFactor=(analysis==='threeWayAnova' || analysis==='threeWayMixed')?'yes':'no';
        }
      }else if(answers.groupedRowFactor!==undefined){
        delete answers.groupedRowFactor;
      }
      return answers;
    }
    if(answers.groups===undefined && (context.groupCount||0)>=2){
      answers.groups=context.groupCount>=3?'threePlus':'two';
    }
    if(answers.paired===undefined){
      answers.paired=state.statsPaired?'paired':'unpaired';
    }
    if(answers.distribution===undefined){
      if(context.assumptions?.recommendNonParametric){
        answers.distribution='nonnormal';
      }else if(state.statsTest==='parametric'){
        answers.distribution='normal';
      }
    }
    if(answers.equalVariance===undefined && (context.groupCount||0)>=3){
      answers.equalVariance='unsure';
    }
    return answers;
  }
  function buildAdvisorQuestions(context,answers){
    if(context?.format==='grouped'){
      const questions=[];
      const conditionHelp=`Detected ${context.conditionCount || 0} condition${context.conditionCount===1?'':'s'} per group.`;
      questions.push({
        id:'groupedGoal',
        prompt:'What is your grouped-analysis goal?',
        help:conditionHelp,
        options:GROUPED_GOAL_OPTIONS
      });
      const multiCondition=(context.conditionCount||0)>=2;
      if(multiCondition && (answers.groupedGoal==='interaction' || !answers.groupedGoal)){
        const repeatedHelp=context.rowCount>=2
          ? 'Rows appear aligned across groups/conditions. Confirm if they represent repeated subjects.'
          : 'With a single complete row the mixed-model option is limited.';
        questions.push({
          id:'groupedRepeated',
          prompt:'Are rows repeated measures of the same subjects across conditions?',
          help:repeatedHelp,
          options:GROUPED_REPEATED_OPTIONS
        });
        if((context.rowCount||0)>=2){
          questions.push({
            id:'groupedRowFactor',
            prompt:'Do you want to include the row/subject dimension as a factor?',
            help:`Detected ${context.rowCount || 0} complete row${context.rowCount===1?'':'s'} available for modeling row-level effects.`,
            options:GROUPED_ROW_FACTOR_OPTIONS
          });
        }
      }
      return questions;
    }
    const questions=[];
    const groupsHelp=`Detected ${context.groupCount || 0} selected column${context.groupCount===1?'':'s'}.`;
    questions.push({
      id:'groups',
      prompt:'How many groups are you comparing?',
      help:groupsHelp,
      options:ADVISOR_GROUP_OPTIONS
    });
    questions.push({
      id:'paired',
      prompt:'Are the observations paired/repeated on the same subjects?',
      help:'Paired means each row links the groups (e.g., before/after or matched pairs).',
      options:ADVISOR_PAIRED_OPTIONS
    });
    questions.push({
      id:'distribution',
      prompt:'Do the group distributions look approximately normal?',
      help:'Inspect the boxplots, QQ plots, or normality diagnostics when available.',
      options:ADVISOR_DISTRIBUTION_OPTIONS
    });
    const resolvedGroups=normalizeAdvisorGroupAnswer(answers.groups,context);
    const resolvedPaired=(answers.paired==='paired' || (answers.paired===undefined && state.statsPaired))?'paired':'unpaired';
    if(resolvedGroups==='threePlus' && resolvedPaired!=='paired'){
      questions.push({
        id:'equalVariance',
        prompt:'For parametric tests, can you assume equal variances across groups?',
        help:'Large variance differences call for Welch-type or non-parametric methods.',
        options:ADVISOR_VARIANCE_OPTIONS
      });
    }
    return questions;
  }
  function renderStatsAdvisor(traces,controls,providedContext){
    const advisorState=getAdvisorState();
    const context=providedContext || buildAdvisorContext(traces);
    const answers=ensureAdvisorDefaults(context);
    const recommendation=computeAdvisorRecommendation(answers,context);
    const container=document.createElement('div');
    container.className='stats-advisor';
    container.dataset.open=advisorState.open?'1':'0';

    const header=document.createElement('div');
    header.className='stats-advisor__header';
    const title=document.createElement('strong');
    title.textContent='Test advisor';
    header.appendChild(title);
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='stats-advisor__toggle';
    toggle.textContent=advisorState.open?'Hide advisor':'Guide me';
    toggle.addEventListener('click',()=>{
      advisorState.open=!advisorState.open;
      console.debug('Debug: box statsAdvisor toggled',{ open:advisorState.open });
      renderStatsControls(traces);
    });
    header.appendChild(toggle);
    container.appendChild(header);

    const summary=document.createElement('div');
    summary.className='stats-advisor__summary';
    if(recommendation.ready){
      const summaryLine=document.createElement('div');
      summaryLine.className='stats-advisor__summary-line';
      summaryLine.textContent=`Recommendation: ${recommendation.summary}`;
      summary.appendChild(summaryLine);
      if(Array.isArray(recommendation.rationale) && recommendation.rationale.length){
        const rationaleList=document.createElement('ul');
        rationaleList.className='stats-advisor__rationale';
        recommendation.rationale.forEach(item=>{
          const li=document.createElement('li');
          li.textContent=item;
          rationaleList.appendChild(li);
        });
        summary.appendChild(rationaleList);
      }
      if(Array.isArray(recommendation.warnings) && recommendation.warnings.length){
        const warnTitle=document.createElement('div');
        warnTitle.className='stats-advisor__warnings-title';
        warnTitle.textContent='Cautions:';
        summary.appendChild(warnTitle);
        const warnList=document.createElement('ul');
        warnList.className='stats-advisor__warnings';
        recommendation.warnings.forEach(item=>{
          const li=document.createElement('li');
          li.textContent=item;
          warnList.appendChild(li);
        });
        summary.appendChild(warnList);
      }
    }else{
      const msg=document.createElement('div');
      msg.textContent=recommendation.message || 'Answer the advisor questions to receive a recommendation.';
      summary.appendChild(msg);
    }
    container.appendChild(summary);

    if(advisorState.open){
      const questionsWrap=document.createElement('div');
      questionsWrap.className='stats-advisor__questions';
      const questions=buildAdvisorQuestions(context,answers);
      questions.forEach(question=>{
        const fieldset=document.createElement('fieldset');
        fieldset.className='stats-advisor__question';
        const legend=document.createElement('legend');
        legend.textContent=question.prompt;
        fieldset.appendChild(legend);
        if(question.help){
          const hint=document.createElement('p');
          hint.className='stats-advisor__hint';
          hint.textContent=question.help;
          fieldset.appendChild(hint);
        }
        (question.options||[]).forEach(opt=>{
          const optionWrap=document.createElement('label');
          optionWrap.className='stats-advisor__option';
          const input=document.createElement('input');
          input.type='radio';
          input.name=`advisor-${question.id}`;
          input.value=opt.value;
          input.checked=answers[question.id]===opt.value;
          input.addEventListener('change',()=>{
            answers[question.id]=opt.value;
            console.debug('Debug: box statsAdvisor answer change',{ question:question.id, value:opt.value });
            renderStatsControls(traces);
          });
          const span=document.createElement('span');
          span.textContent=opt.label;
          optionWrap.appendChild(input);
          optionWrap.appendChild(span);
          fieldset.appendChild(optionWrap);
        });
        questionsWrap.appendChild(fieldset);
      });
      container.appendChild(questionsWrap);

      const actions=document.createElement('div');
      actions.className='stats-advisor__actions';
      const applyBtn=document.createElement('button');
      applyBtn.type='button';
      applyBtn.textContent='Apply recommendation';
      applyBtn.disabled=!recommendation.ready;
      applyBtn.addEventListener('click',()=>{
        if(!recommendation.ready){
          return;
        }
        if(context?.format==='grouped' || recommendation.format==='grouped'){
          ensureGroupedStatsDefaults();
          if(!state.groupedStats || typeof state.groupedStats!=='object'){
            state.groupedStats={ analysis:'twoWayAnova' };
          }
          if(recommendation.analysis){
            state.groupedStats.analysis=recommendation.analysis;
          }
          advisorState.lastApplied={ ...recommendation };
          console.debug('Debug: box grouped statsAdvisor applied',{
            analysis: state.groupedStats.analysis,
            answers:{ ...answers }
          });
          renderStatsControls(traces);
          state.scheduleDraw();
          return;
        }
        state.statsTest=recommendation.statsTest;
        state.statsPaired=recommendation.paired;
        const postHocContext={
          mode: state.statsMode,
          test: recommendation.statsTest,
          paired: recommendation.paired,
          groupCount: context.groupCount
        };
        state.statsPostHoc=ensureValidPostHoc(recommendation.postHoc,postHocContext);
        advisorState.lastApplied={ ...recommendation };
        console.debug('Debug: box statsAdvisor applied',{
          statsTest: state.statsTest,
          statsPaired: state.statsPaired,
          statsPostHoc: state.statsPostHoc,
          answers:{ ...answers }
        });
        renderStatsControls(traces);
        state.scheduleDraw();
      });
      actions.appendChild(applyBtn);
      const resetBtn=document.createElement('button');
      resetBtn.type='button';
      resetBtn.className='stats-advisor__reset';
      resetBtn.textContent='Reset answers';
      resetBtn.addEventListener('click',()=>{
        advisorState.answers={};
        console.debug('Debug: box statsAdvisor reset');
        renderStatsControls(traces);
      });
      actions.appendChild(resetBtn);
      container.appendChild(actions);
    }

    controls.appendChild(container);
  }

  function renderStatsControls(traces){
  const controls=document.getElementById('statsControls');
  if(!controls){
    return;
  }
  controls.innerHTML='';
  const correctionOptions=getAvailableCorrections();
  const normalizedCorrection=ensureValidCorrectionValue(state.statsCorrection);
  if(normalizedCorrection!==state.statsCorrection){
    console.debug('Debug: box statsCorrection normalized',{ before:state.statsCorrection, after:normalizedCorrection });
    state.statsCorrection=normalizedCorrection;
  }
  const normalizedParamEffect=ensureValidEffectOption('parametric',state.statsEffectParametric);
  if(normalizedParamEffect!==state.statsEffectParametric){
    console.debug('Debug: box statsEffectParametric normalized',{ before:state.statsEffectParametric, after:normalizedParamEffect });
    state.statsEffectParametric=normalizedParamEffect;
  }
  const normalizedNonParamEffect=ensureValidEffectOption('nonparametric',state.statsEffectNonParametric);
  if(normalizedNonParamEffect!==state.statsEffectNonParametric){
    console.debug('Debug: box statsEffectNonParametric normalized',{ before:state.statsEffectNonParametric, after:normalizedNonParamEffect });
    state.statsEffectNonParametric=normalizedNonParamEffect;
  }
  const postHocContext={
    mode: state.statsMode,
    test: state.statsTest,
    paired: state.statsPaired,
    groupCount: Array.isArray(traces)?traces.length:0
  };
  const normalizedPostHoc=ensureValidPostHoc(state.statsPostHoc,postHocContext);
  if(normalizedPostHoc!==state.statsPostHoc){
    console.debug('Debug: box statsPostHoc normalized',{ before:state.statsPostHoc, after:normalizedPostHoc, context:postHocContext });
    state.statsPostHoc=normalizedPostHoc;
  }
  if(state.selectedCols.size<2 && traces.length>=2){
    state.selectedCols.clear();
    state.selectedCols.add(0);
    state.selectedCols.add(1);
  }
  if(state.statsMode==='reference' && !state.selectedCols.has(state.statsRef)){
    state.selectedCols.add(state.statsRef);
  }

  const advisorContext=buildAdvisorContext(traces);
  renderStatsAdvisor(traces, controls, advisorContext);

  if(state.tableFormat==='grouped'){
    renderGroupedStatsControls(traces, controls, advisorContext?.prepared);
    return;
  }

  const optionWrap=document.createElement('div');

  const testLabel=document.createElement('label');
  testLabel.textContent='Test:';
  const testSel=document.createElement('select');
  ['parametric','nonparametric'].forEach(v=>{
    const option=document.createElement('option');
    option.value=v;
    option.textContent=v==='parametric'?'Parametric':'Non-parametric';
    if(state.statsTest===v) option.selected=true;
    testSel.appendChild(option);
  });
  testSel.addEventListener('change',()=>{
    state.statsTest=testSel.value;
    console.log('boxplot statsTest changed', state.statsTest);
    state.scheduleDraw();
  });
  optionWrap.appendChild(testLabel);
  optionWrap.appendChild(testSel);

  const pairedLabel=document.createElement('label');
  pairedLabel.textContent='Pairing:';
  const pairedSel=document.createElement('select');
  [['unpaired','Unpaired'],['paired','Paired']].forEach(([value,text])=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=text;
    if((state.statsPaired && value==='paired')||(!state.statsPaired && value==='unpaired')) option.selected=true;
    pairedSel.appendChild(option);
  });
  pairedSel.addEventListener('change',()=>{
    state.statsPaired=pairedSel.value==='paired';
    console.log('boxplot statsPaired changed', state.statsPaired);
    state.scheduleDraw();
  });
  optionWrap.appendChild(pairedLabel);
  optionWrap.appendChild(pairedSel);

  const modeLabel=document.createElement('label');
  modeLabel.textContent='Comparison:';
  const modeSel=document.createElement('select');
  [['all','All pairwise'],['reference','Versus reference'],['custom','Custom pairs']].forEach(([value,text])=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=text;
    if(state.statsMode===value) option.selected=true;
    modeSel.appendChild(option);
  });
  modeSel.addEventListener('change',()=>{
    state.statsMode=modeSel.value;
    console.log('boxplot statsMode changed', state.statsMode);
    if(state.selectedCols && state.selectedCols.size){
      const beforeSize = state.selectedCols.size;
      const filteredSelection = [...state.selectedCols].filter(idx => idx < traces.length);
      if(filteredSelection.length !== beforeSize){
        state.selectedCols = new Set(filteredSelection);
        console.debug('Debug: selectedCols pruned',{ before: beforeSize, after: filteredSelection.length });
      }
    }
    renderStatsControls(traces);
    state.scheduleDraw();
  });
  optionWrap.appendChild(modeLabel);
  optionWrap.appendChild(modeSel);

  const postHocLabel=document.createElement('label');
  postHocLabel.textContent='Post-hoc:';
  const postHocSel=document.createElement('select');
  const postHocOptions=listPostHocOptions();
  postHocOptions.forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    option.title=opt.tooltip || '';
    const supported=isPostHocSupported(opt.value,postHocContext);
    option.disabled=!supported;
    if(opt.value===state.statsPostHoc){ option.selected=true; }
    postHocSel.appendChild(option);
  });
  postHocSel.addEventListener('change',()=>{
    state.statsPostHoc=postHocSel.value;
    console.debug('Debug: box statsPostHoc changed',{ value:state.statsPostHoc });
    renderStatsControls(traces);
    state.scheduleDraw();
  });
  optionWrap.appendChild(postHocLabel);
  optionWrap.appendChild(postHocSel);

  const correctionLabel=document.createElement('label');
  correctionLabel.textContent='Correction:';
  const correctionSel=document.createElement('select');
  correctionOptions.forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    if(opt.value===state.statsCorrection) option.selected=true;
    correctionSel.appendChild(option);
  });
  correctionSel.addEventListener('change',()=>{
    const value=ensureValidCorrectionValue(correctionSel.value);
    state.statsCorrection=value;
    console.debug('Debug: box statsCorrection changed',{ value, source:'main-controls' });
    updateStatsCorrectionSummary(0);
    state.scheduleDraw();
  });
  correctionSel.disabled=state.statsPostHoc==='tukey';
  if(correctionSel.disabled){
    correctionSel.title='Tukey HSD already adjusts for multiple comparisons.';
  }
  optionWrap.appendChild(correctionLabel);
  optionWrap.appendChild(correctionSel);

  const paramEffectLabel=document.createElement('label');
  paramEffectLabel.textContent='Param effect size:';
  const paramEffectSel=document.createElement('select');
  listEffectOptions('parametric').forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    option.title=opt.tooltip;
    if(opt.value===state.statsEffectParametric) option.selected=true;
    paramEffectSel.appendChild(option);
  });
  paramEffectSel.addEventListener('change',()=>{
    const value=ensureValidEffectOption('parametric',paramEffectSel.value);
    state.statsEffectParametric=value;
    console.debug('Debug: box statsEffectParametric changed',{ value });
    state.scheduleDraw();
  });
  optionWrap.appendChild(paramEffectLabel);
  optionWrap.appendChild(paramEffectSel);

  const nonParamEffectLabel=document.createElement('label');
  nonParamEffectLabel.textContent='Non-param effect size:';
  const nonParamEffectSel=document.createElement('select');
  listEffectOptions('nonparametric').forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    option.title=opt.tooltip;
    if(opt.value===state.statsEffectNonParametric) option.selected=true;
    nonParamEffectSel.appendChild(option);
  });
  nonParamEffectSel.addEventListener('change',()=>{
    const value=ensureValidEffectOption('nonparametric',nonParamEffectSel.value);
    state.statsEffectNonParametric=value;
    console.debug('Debug: box statsEffectNonParametric changed',{ value });
    state.scheduleDraw();
  });
  optionWrap.appendChild(nonParamEffectLabel);
  optionWrap.appendChild(nonParamEffectSel);

  const postHocHelp=document.getElementById('statsPostHocHelp');
  if(postHocHelp){
    postHocHelp.textContent=getPostHocSummary(state.statsPostHoc,postHocContext);
  }

  if(state.statsMode==='reference'){
    const refLabel=document.createElement('label');
    refLabel.textContent='Reference:';
    const refSel=document.createElement('select');
    traces.forEach((trace,index)=>{
      const option=document.createElement('option');
      option.value=index;
      option.textContent=trace.name;
      if(index===state.statsRef) option.selected=true;
      refSel.appendChild(option);
    });
    refSel.addEventListener('change',()=>{
      state.statsRef=+refSel.value;
      console.log('boxplot statsRef changed', state.statsRef);
      renderStatsControls(traces);
      state.scheduleDraw();
    });
    optionWrap.appendChild(refLabel);
    optionWrap.appendChild(refSel);
  }else if(state.statsMode==='custom'){
    const pairLabel=document.createElement('label');
    pairLabel.textContent='Pairs:';
    const pairInput=document.createElement('input');
    pairInput.type='text';
    pairInput.value=state.statsPairsText;
    pairInput.placeholder='1-3,2-4';
    pairInput.addEventListener('change',()=>{
      state.statsPairsText=pairInput.value;
      state.statsCustomPairs=parsePairString(state.statsPairsText,traces);
      console.log('boxplot custom pairs changed', state.statsPairsText);
      state.scheduleDraw();
    });
    optionWrap.appendChild(pairLabel);
    optionWrap.appendChild(pairInput);
    state.statsCustomPairs=parsePairString(state.statsPairsText,traces);
  }

  controls.appendChild(optionWrap);

  traces.forEach((trace,index)=>{
    const id=`statCol${index}`;
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';
    checkbox.id=id;
    checkbox.dataset.index=index;
    checkbox.checked=state.selectedCols.has(index);
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked) state.selectedCols.add(index);
      else state.selectedCols.delete(index);
      console.log('boxplot column toggle',{index,checked:checkbox.checked});
      state.scheduleDraw();
    });
    const label=document.createElement('label');
    label.setAttribute('for',id);
    label.textContent=trace.name;
    controls.appendChild(checkbox);
    controls.appendChild(label);
  });
  updateStatsCorrectionSummary(state.selectedCols.size>=2?state.selectedCols.size*(state.selectedCols.size-1)/2:0);
}
function renderGroupedStatsControls(traces, controls, precomputed){
  ensureGroupedStatsDefaults();
  const prepared=precomputed && precomputed.ok!==undefined ? precomputed : prepareGroupedStatsData(traces,{ axisLabels: state.lastAxisLabels });
  const summary=document.createElement('div');
  summary.className='stats-table-lead';
  summary.textContent=`Groups: ${prepared.groupsCount} | Conditions: ${prepared.conditionsCount} | Rows with data: ${prepared.rowsWithData || 0}`;
  controls.appendChild(summary);
  if(prepared.partialRowsSkipped){
    const note=document.createElement('div');
    note.style.fontSize='12px';
    note.style.color='#555';
    note.textContent=`${prepared.partialRowsSkipped} row(s) skipped due to missing values.`;
    controls.appendChild(note);
  }
  const analysisWrap=document.createElement('div');
  analysisWrap.style.display='flex';
  analysisWrap.style.gap='8px';
  analysisWrap.style.alignItems='center';
  const label=document.createElement('label');
  label.textContent='Analysis:';
  const select=document.createElement('select');
  const options=[
    { value:'twoWayAnova', text:'Two-way ANOVA' },
    { value:'twoWayMixed', text:'Two-way Mixed Model' },
    { value:'threeWayAnova', text:'Three-way ANOVA' },
    { value:'threeWayMixed', text:'Three-way Mixed Model' },
    { value:'rowTTests', text:'Multiple t tests (row-wise)' }
  ];
  const allowed=new Set(options.map(opt=>opt.value));
  if(!allowed.has(state.groupedStats.analysis)){
    state.groupedStats.analysis='twoWayAnova';
  }
  options.forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.text;
    if(state.groupedStats.analysis===opt.value) option.selected=true;
    select.appendChild(option);
  });
  select.addEventListener('change',()=>{
    state.groupedStats.analysis=select.value;
    console.debug('Debug: grouped stats analysis changed',{ analysis: state.groupedStats.analysis });
    state.scheduleDraw();
  });
  analysisWrap.appendChild(label);
  analysisWrap.appendChild(select);
  controls.appendChild(analysisWrap);
  const correctionWrap=document.createElement('div');
  correctionWrap.style.display='flex';
  correctionWrap.style.gap='8px';
  correctionWrap.style.alignItems='center';
  const correctionLabel=document.createElement('label');
  correctionLabel.textContent='Correction:';
  const correctionSel=document.createElement('select');
  const correctionOptions=getAvailableCorrections();
  correctionOptions.forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    if(opt.value===state.statsCorrection) option.selected=true;
    correctionSel.appendChild(option);
  });
  correctionSel.addEventListener('change',()=>{
    const value=ensureValidCorrectionValue(correctionSel.value);
    state.statsCorrection=value;
    console.debug('Debug: box statsCorrection changed',{ value, source:'grouped-controls' });
    updateStatsCorrectionSummary(0);
    state.scheduleDraw();
  });
  correctionWrap.appendChild(correctionLabel);
  correctionWrap.appendChild(correctionSel);
  controls.appendChild(correctionWrap);
  console.debug('Debug: renderGroupedStatsControls summary',{ analysis: state.groupedStats.analysis, rowsWithData: prepared.rowsWithData });
  updateStatsCorrectionSummary(prepared.conditionsCount>1?prepared.conditionsCount*(prepared.conditionsCount-1)/2:0);
}
  function annotatePair(svg,x1,x2,valueCoord,p,styleOptions){
    const opts=styleOptions||{};
    const orientation=opts.orientation==='horizontal'?'horizontal':'vertical';
    const strokeWidth=typeof opts.strokeWidth==='number'
      ? opts.strokeWidth
      : chartStyle.scaleStrokeWidth(1, opts.styleScaleInfo, { context: 'box-annotation', min: 0.5 });
    const bracketSize=Number.isFinite(opts.bracketSize)?opts.bracketSize:10;
    const path=document.createElementNS(NS,'path');
    if(orientation==='horizontal'){
      const outerX=valueCoord;
      const innerX=outerX+bracketSize;
      path.setAttribute('d',`M${outerX},${x1} L${innerX},${x1} L${innerX},${x2} L${outerX},${x2}`);
    }else{
      const outerY=valueCoord;
      const innerY=valueCoord-bracketSize;
      path.setAttribute('d',`M${x1},${outerY} L${x1},${innerY} L${x2},${innerY} L${x2},${outerY}`);
    }
    path.setAttribute('stroke','#000');
    if(Number.isFinite(strokeWidth)){
      path.setAttribute('stroke-width',strokeWidth);
    }
    path.setAttribute('fill','none');
    svg.appendChild(path);
    const txt=document.createElementNS(NS,'text');
    if(orientation==='horizontal'){
      txt.setAttribute('x',valueCoord+bracketSize*1.4);
      txt.setAttribute('y',(x1+x2)/2);
      txt.setAttribute('text-anchor','start');
      txt.setAttribute('dominant-baseline','middle');
    }else{
      const textYOffset=Number.isFinite(opts.fontSize)?opts.fontSize*0.2:12;
      txt.setAttribute('x',(x1+x2)/2);
      txt.setAttribute('y',valueCoord-bracketSize-textYOffset);
      txt.setAttribute('text-anchor','middle');
    }
    if(Number.isFinite(opts.fontSize)){
      txt.setAttribute('font-size',opts.fontSize);
    }
    txt.textContent=p2stars(p);
    svg.appendChild(txt);
    console.debug('Debug: box annotatePair scaling',{strokeWidth,fontSize:opts.fontSize,orientation});
  }
  function annotateOverall(svg,xCenters,valueToCoord,maxVal,p,level=0,styleOptions){
    const opts=styleOptions||{};
    const orientation=opts.orientation==='horizontal'?'horizontal':'vertical';
    const baseOffset=Number.isFinite(opts.baseOffset)?opts.baseOffset:ANN_BASE_OFFSET;
    const levelGap=Number.isFinite(opts.levelGap)?opts.levelGap:ANN_LEVEL_GAP;
    const fontSize=opts.fontSize;
    const bracketSize=Number.isFinite(opts.bracketSize)?opts.bracketSize:10;
    const coordFn=typeof valueToCoord==='function'?valueToCoord:v=>v;
    const baseCoord=coordFn(maxVal);
    if(!Number.isFinite(baseCoord)) return;
    const txt=document.createElementNS(NS,'text');
    if(orientation==='horizontal'){
      const x=baseCoord+baseOffset+level*levelGap+bracketSize*0.6;
      const y=(Math.min(...xCenters)+Math.max(...xCenters))/2;
      txt.setAttribute('x',x);
      txt.setAttribute('y',y);
      txt.setAttribute('text-anchor','start');
      txt.setAttribute('dominant-baseline','middle');
    }else{
      const y=baseCoord-baseOffset-level*levelGap;
      txt.setAttribute('x',(Math.min(...xCenters)+Math.max(...xCenters))/2);
      txt.setAttribute('y',y-12);
      txt.setAttribute('text-anchor','middle');
    }
    if(Number.isFinite(fontSize)){
      txt.setAttribute('font-size',fontSize);
    }
    txt.textContent=p2stars(p);
    svg.appendChild(txt);
    console.debug('Debug: box annotateOverall scaling',{baseOffset,levelGap,fontSize,orientation});
  }
  function renderStatsTable(traces){
    const tableDiv=document.getElementById('statsTable');
    if(!tableDiv) return;
    const jStatLib=global.jStat;
    if(!jStatLib){
      tableDiv.textContent='Statistics unavailable (jStat missing).';
      return;
    }
    const tableRows=traces.map(t=>{
      const arr=t.rawY.filter(v=>Number.isFinite(v));
      const n=arr.length;
      if(!n){
        return {
          name:t.name,
          n:'0',
          mean:'—',
          median:'—',
          sd:'—',
          min:'—',
          q1:'—',
          q3:'—',
          max:'—'
        };
      }
      const sorted=arr.slice().sort((a,b)=>a-b);
      const mean=arr.reduce((s,v)=>s+v,0)/n;
      const med=sorted[Math.floor((n-1)/2)];
      const sd=jStatLib.stdev(arr,true);
      const min=sorted[0];
      const q1=jStatLib.percentile(arr,0.25);
      const q3=jStatLib.percentile(arr,0.75);
      const max=sorted[sorted.length-1];
      return {
        name:t.name,
        n:String(n),
        mean:mean.toFixed(2),
        median:med.toFixed(2),
        sd:sd.toFixed(2),
        min:min.toFixed(2),
        q1:q1.toFixed(2),
        q3:q3.toFixed(2),
        max:max.toFixed(2)
      };
    });
    if(Shared.statsTable && typeof Shared.statsTable.render==='function'){
      Shared.statsTable.render({
        target:tableDiv,
        columns:[
          {key:'name',label:'Column',align:'left'},
          {key:'n',label:'N',align:'right'},
          {key:'mean',label:'Mean',align:'right'},
          {key:'median',label:'Median',align:'right'},
          {key:'sd',label:'SD',align:'right'},
          {key:'min',label:'Min',align:'right'},
          {key:'q1',label:'Q1',align:'right'},
          {key:'q3',label:'Q3',align:'right'},
          {key:'max',label:'Max',align:'right'}
        ],
        rows:tableRows,
        caption:'Descriptive statistics',
        options:{
          fileName:'box-summary-statistics',
          contextLabel:'box-summary'
        }
      });
      console.debug('Debug: box renderStatsTable using Shared.statsTable',{rowCount:tableRows.length});
    }else{
      const header=['Column','N','Mean','Median','SD','Min','Q1','Q3','Max'];
      let html='<table><thead><tr>'+header.map(h=>`<th>${h}</th>`).join('')+'</tr></thead>';
      html+='<tbody>'+tableRows.map(r=>`<tr><td>${r.name}</td><td>${r.n}</td><td>${r.mean}</td><td>${r.median}</td><td>${r.sd}</td><td>${r.min}</td><td>${r.q1}</td><td>${r.q3}</td><td>${r.max}</td></tr>`).join('')+'</tbody></table>';
      tableDiv.innerHTML=html;
      console.debug('Debug: box renderStatsTable fallback',{rowCount:tableRows.length});
    }
  }

  // Compute and render statistics and p-value annotations
  function computeStats(traces,svg,helpers){
    const statsDiv=document.getElementById('statsResults');
    if(!statsDiv){ console.warn('Debug: statsResults element not found'); return; }
    statsDiv.innerHTML='';
    const hasStatsTable=Shared.statsTable && typeof Shared.statsTable.render==='function';
    let resultsContainer=statsDiv;
    let assumptionContainer=null;
    const renderTableModel=(model,append=false,targetOverride)=>{
      const target=targetOverride || resultsContainer || statsDiv;
      if(hasStatsTable){
        Shared.statsTable.render({ target, append, ...model });
        console.debug('Debug: box stats render via Shared.statsTable',{
          caption:model.caption || null,
          rowCount:model.rows?.length || 0,
          append
        });
        return;
      }
      if(!append){
        target.innerHTML='';
      }
      if(model.caption){
        const captionEl=document.createElement('div');
        captionEl.className='stats-table-lead';
        captionEl.textContent=model.caption;
        target.appendChild(captionEl);
      }
      const table=document.createElement('table');
      const thead=document.createElement('thead');
      const headRow=document.createElement('tr');
      (model.columns||[]).forEach(col=>{
        const th=document.createElement('th');
        th.textContent=col.label;
        if(col.tooltip){
          th.title=col.tooltip;
        }
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody=document.createElement('tbody');
      (model.rows||[]).forEach(row=>{
        const tr=document.createElement('tr');
        (model.columns||[]).forEach(col=>{
          const td=document.createElement('td');
          const value=Array.isArray(row)?row[col.index]:(row?.[col.key]);
          td.textContent=value ?? '';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      target.appendChild(table);
      if(Array.isArray(model.footnotes) && model.footnotes.length){
        const list=document.createElement('div');
        model.footnotes.forEach(note=>{
          const item=document.createElement('div');
          item.textContent=note;
          list.appendChild(item);
        });
        target.appendChild(list);
      }
      console.debug('Debug: box stats render fallback',{ caption:model.caption || null, rowCount:model.rows?.length || 0, append });
    };
    const setResultsMessage=text=>{
      if(!resultsContainer){
        return;
      }
      resultsContainer.innerHTML='';
      if(typeof text==='string'){
        const msg=document.createElement('div');
        msg.textContent=text;
        resultsContainer.appendChild(msg);
      }
    };
    const significanceEnabled = helpers?.significance?.enabled ?? !!state.showSignificanceBars;
    console.debug('Debug: box significance annotations status',{ enabled: significanceEnabled });
    const annotationOpts=helpers?.annotationStyle||{};
    const orientation=annotationOpts.orientation==='horizontal'?'horizontal':'vertical';
    const categoryCenter=typeof helpers?.categoryCenter==='function'
      ? helpers.categoryCenter
      : (typeof helpers?.xCenter==='function'?helpers.xCenter:(idx=>idx));
    const valueToCoord=typeof helpers?.valueToCoord==='function'
      ? helpers.valueToCoord
      : (typeof helpers?.y2px==='function'?helpers.y2px:(val=>val));
    const baseOffset=Number.isFinite(annotationOpts.baseOffset)?annotationOpts.baseOffset:ANN_BASE_OFFSET;
    const levelGap=Number.isFinite(annotationOpts.levelGap)?annotationOpts.levelGap:ANN_LEVEL_GAP;
    console.debug('Debug: box annotation offsets',{baseOffset,levelGap,orientation});
    if(state.tableFormat==='grouped'){
      const prepared=prepareGroupedStatsData(traces, helpers || { axisLabels: state.lastAxisLabels });
      statsDiv.innerHTML='';
      const summary=document.createElement('div');
      summary.className='stats-table-lead';
      summary.textContent=`Groups: ${prepared.groupsCount} | Conditions: ${prepared.conditionsCount} | Rows with data: ${prepared.rowsWithData || 0}`;
      statsDiv.appendChild(summary);
      if(prepared.partialRowsSkipped){
        const note=document.createElement('div');
        note.style.fontSize='12px';
        note.style.color='#555';
        note.textContent=`${prepared.partialRowsSkipped} row(s) skipped due to missing values.`;
        statsDiv.appendChild(note);
      }
      if(!prepared.ok){
        const warn=document.createElement('div');
        warn.textContent=prepared.message || 'Unable to compute grouped statistics.';
        statsDiv.appendChild(warn);
        return;
      }
      const analysis=state.groupedStats?.analysis || 'twoWayAnova';
      let resultModel;
      if(analysis==='twoWayAnova') resultModel=analyzeTwoWayAnova(prepared);
      else if(analysis==='twoWayMixed') resultModel=analyzeTwoWayMixed(prepared);
      else if(analysis==='threeWayAnova') resultModel=analyzeThreeWayAnova(prepared);
      else if(analysis==='threeWayMixed') resultModel=analyzeThreeWayMixed(prepared);
      else if(analysis==='rowTTests') resultModel=analyzeRowWiseTTests(prepared);
      if(!resultModel || !resultModel.ok){
        const warn=document.createElement('div');
        warn.textContent=resultModel?.message || 'Unable to compute grouped statistics for the selected analysis.';
        statsDiv.appendChild(warn);
        console.debug('Debug: grouped stats unavailable',{ analysis, reason: resultModel?.message });
        return;
      }
      renderTableModel(resultModel, true, statsDiv);
      console.debug('Debug: grouped stats rendered',{ analysis });
      state.assumptionDiagnostics=null;
      return;
    }
    assumptionContainer=document.createElement('div');
    assumptionContainer.className='stats-assumption-container';
    statsDiv.appendChild(assumptionContainer);
    resultsContainer=document.createElement('div');
    resultsContainer.className='stats-results-main';
    statsDiv.appendChild(resultsContainer);
    const indices=[...state.selectedCols];
    if(indices.length<2){
      state.assumptionDiagnostics=null;
      renderAssumptionSection(assumptionContainer,null);
      setResultsMessage('Select at least two columns for statistical analysis.');
      return;
    }
    const groups=indices.map(i=>traces[i].rawY);
    const labels=indices.map(i=>traces[i].name);
    const assumptionDiagnostics=computeAssumptionDiagnostics(groups,labels);
    state.assumptionDiagnostics=assumptionDiagnostics;
    renderAssumptionSection(assumptionContainer,assumptionDiagnostics);
    if(assumptionDiagnostics){
      if(assumptionDiagnostics.recommendNonParametric && state.statsTest==='parametric'){
        state.statsTest='nonparametric';
        assumptionDiagnostics.autoSwitched=true;
        console.debug('Debug: box assumptions auto-switch',{ warnings: assumptionDiagnostics.warnings });
        renderStatsControls(traces);
      }
      assumptionDiagnostics.appliedTest=state.statsTest;
    }
    // Custom pairs mode
    if(state.statsMode==='custom'){
      if(!state.statsCustomPairs.length){ setResultsMessage('Specify pairs for comparison.'); return; }
      const pairTest=state.statsTest==='parametric'?(state.statsPaired?tTestPaired:tTest):(state.statsPaired?wilcoxonSignedRank:mannWhitney);
      const pairs=[];
      state.statsCustomPairs.forEach(pr=>{
        const aData=traces[pr.ai].rawY; const bData=traces[pr.bi].rawY;
        if(state.statsPaired && aData.length!==bData.length) return;
        const r=pairTest(aData,bData);
        const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
        const statVal=r[statName];
        const effectMetrics=computeEffectSizeMetrics(aData,bData,{ paired:state.statsPaired });
        const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
        const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
        console.debug('Debug: box custom pair effect metrics',{
          pair:{ a:traces[pr.ai].name, b:traces[pr.bi].name },
          parametric:Object.fromEntries(Object.entries(effectMetrics.parametric).map(([key,val])=>[key,safeRound(val,4)])),
          nonParametric:Object.fromEntries(Object.entries(effectMetrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)]))
        });
        let rangeMax=-Infinity; for(let k=Math.min(pr.ai,pr.bi);k<=Math.max(pr.ai,pr.bi);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
        pairs.push({
          ...pr,
          p:r.p,
          rangeMax,
          labelA:traces[pr.ai].name,
          labelB:traces[pr.bi].name,
          stat:statVal,
          statName,
          df:r.df,
          effects:effectMetrics,
          effectParametric:formattedParamEffect,
          effectNonParametric:formattedNonParamEffect
        });
      });
      const m=pairs.length;
      if(m){
        const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
        adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
      }
      const correctionMeta=resolveCorrectionMeta(state.statsCorrection,m);
      updateStatsCorrectionSummary(m);
      const tableRows=pairs.map(pr=>({
        comparison:`${pr.labelA} vs ${pr.labelB}`,
        statistic:`${pr.statName} = ${pr.stat.toFixed(4)}`,
        df:pr.df!=null?pr.df:'—',
        padj:formatP(pr.adjP),
        effectParametric:pr.effectParametric,
        effectNonParametric:pr.effectNonParametric
      }));
      renderTableModel({
        caption:'Custom pairwise comparisons',
        columns:[
          {key:'comparison',label:'Comparison',align:'left',index:0},
          {key:'statistic',label:'Statistic',align:'left',index:1},
          {key:'df',label:'df',align:'right',index:2},
          {key:'padj',label:`P (adj, ${correctionMeta.shortLabel})`,align:'right',index:3},
          {key:'effectParametric',label:`Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`,align:'right',index:4,tooltip:paramEffectMeta.tooltip},
          {key:'effectNonParametric',label:`Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`,align:'right',index:5,tooltip:nonParamEffectMeta.tooltip}
        ],
        rows:tableRows,
        footnotes:[
          ...(correctionMeta.footnote ? [correctionMeta.footnote] : []),
          ...effectFootnotes
        ],
        options:{
          fileName:'box-custom-comparisons',
          contextLabel:'box-custom'
        }
      });
      if(pairs.length){
        pairs.sort((a,b)=>(a.bi-a.ai)-(b.bi-b.ai));
        const placed=[];
        pairs.forEach(pr=>{
          let level=0; while(placed.some(pl=>!(pl.bi<pr.ai||pl.ai>pr.bi)&&pl.level===level)) level++;
          const baseCoord=valueToCoord(pr.rangeMax);
          const annotationCoord=orientation==='horizontal'
            ? baseCoord+baseOffset+level*levelGap
            : baseCoord-baseOffset-level*levelGap;
          annotatePair(svg,categoryCenter(pr.ai),categoryCenter(pr.bi),annotationCoord,pr.p,helpers.annotationStyle);
          pr.level=level; placed.push(pr);
        });
      }
      return;
    }
    const param=state.statsTest==='parametric';
    const pairTest=param?(state.statsPaired?tTestPaired:tTest):(state.statsPaired?wilcoxonSignedRank:mannWhitney);
    const overallTest=param?anova:kruskalWallis;
    const paramEffectMeta=resolveEffectOptionMeta('parametric',state.statsEffectParametric);
    const nonParamEffectMeta=resolveEffectOptionMeta('nonparametric',state.statsEffectNonParametric);
    const effectFootnotes=buildEffectFootnotes(paramEffectMeta,nonParamEffectMeta);
    console.debug('Debug: box effect meta',{ parametric:paramEffectMeta?.value, nonParametric:nonParamEffectMeta?.value });
    if(state.statsPaired && groups.some(g=>g.length!==groups[0].length)){
      setResultsMessage('Paired tests require equal group sizes.'); return;
    }
    // Two-group case
    if(indices.length===2){
      const res=pairTest(groups[0],groups[1]);
      const statName=res.t!==undefined?'t':res.U!==undefined?'U':res.W!==undefined?'W':'stat';
      const effectMetrics=computeEffectSizeMetrics(groups[0],groups[1],{ paired:state.statsPaired });
      console.debug('Debug: box pair summary effect metrics',{
        labels:labels,
        parametric:Object.fromEntries(Object.entries(effectMetrics.parametric).map(([key,val])=>[key,safeRound(val,4)])),
        nonParametric:Object.fromEntries(Object.entries(effectMetrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)]))
      });
      const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
      const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
      const summaryRows=[
        { metric:'Comparison', value:`${labels[0]} vs ${labels[1]}` },
        { metric:'Test', value:param?(state.statsPaired?'Paired t-test':'t-test'):(state.statsPaired?'Wilcoxon signed-rank':'Mann-Whitney U') },
        { metric:statName, value:res[statName].toFixed(4) }
      ];
      if(res.df!==undefined){ summaryRows.push({ metric:'df', value:res.df.toFixed(4) }); }
      summaryRows.push({ metric:'P value', value:formatP(res.p) });
      const correctionMeta=resolveCorrectionMeta(state.statsCorrection,1);
      const adjusted=applyPValueCorrection([res.p], state.statsCorrection);
      const adjValue=Array.isArray(adjusted) && adjusted.length?adjusted[0]:res.p;
      summaryRows.push({ metric:`P (${correctionMeta.shortLabel})`, value:formatP(adjValue) });
      summaryRows.push({ metric:`Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`, value:formattedParamEffect });
      summaryRows.push({ metric:`Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`, value:formattedNonParamEffect });
      updateStatsCorrectionSummary(1);
      const footnotes=[
        ...(correctionMeta.footnote ? [correctionMeta.footnote] : []),
        ...effectFootnotes
      ];
      renderTableModel({
        caption:'Pairwise test summary',
        columns:[
          {key:'metric',label:'Metric',align:'left',index:0},
          {key:'value',label:'Value',align:'left',index:1}
        ],
        rows:summaryRows,
        footnotes,
        options:{
          fileName:'box-pairwise-summary',
          contextLabel:'box-pairwise'
        }
      });
      const from=Math.min(indices[0],indices[1]); const to=Math.max(indices[0],indices[1]); let rangeMax=-Infinity; for(let k=from;k<=to;k++) rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); const baseCoord=valueToCoord(rangeMax); const annotationCoord=orientation==='horizontal'?baseCoord+baseOffset:baseCoord-baseOffset; if(significanceEnabled){
        annotatePair(svg,categoryCenter(indices[0]),categoryCenter(indices[1]),annotationCoord,res.p,helpers.annotationStyle);
      }else{
        console.debug('Debug: box significance annotation skipped for pair',{ p: res.p, significanceEnabled });
      }
      return;
    }
    // Multi-group
    let overall=null; if(!state.statsPaired){ overall=overallTest(groups); }
    const maxVal=Math.max(...indices.map(i=>Math.max(...traces[i].y)));
    const xs=indices.map(i=>categoryCenter(i));
    let pairs=[];
    let referenceLabel=null;
    let methodFootnotes=[];
    const postHocMode=ensureValidPostHoc(state.statsPostHoc,{ mode: state.statsMode, test: param?'parametric':'nonparametric', paired: state.statsPaired, groupCount: indices.length });
    if(postHocMode!==state.statsPostHoc){
      console.debug('Debug: box computeStats postHoc normalized',{ before:state.statsPostHoc, after:postHocMode });
      state.statsPostHoc=postHocMode;
    }
    if(state.statsMode==='all'){
      if(postHocMode==='tukey'){
        const tukey=computeTukeyComparisons(groups,labels);
        if(!tukey.ok){
          setResultsMessage(tukey.message || 'Unable to compute Tukey HSD.');
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(tukey.footnote);
        pairs=tukey.pairs.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          let rangeMax=-Infinity; for(let k=Math.min(ai,bi);k<=Math.max(ai,bi);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.pAdj,
            adjP:pr.pAdj,
            stat:pr.q,
            statName:'q',
            df:pr.df,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'tukey'
          };
        });
        updateStatsCorrectionSummary(pairs.length);
      }else if(postHocMode==='dunn'){
        const dunn=computeDunnComparisons(groups,labels);
        if(!dunn.ok){
          setResultsMessage(dunn.message || "Unable to compute Dunn's test.");
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(dunn.footnote);
        pairs=dunn.pairs.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          let rangeMax=-Infinity; for(let k=Math.min(ai,bi);k<=Math.max(ai,bi);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.p,
            stat:pr.z,
            statName:'z',
            df:null,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'dunn'
          };
        });
        if(pairs.length){
          const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
          adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
        }
        updateStatsCorrectionSummary(pairs.length);
      }else{
        for(let i=0;i<indices.length;i++){
          for(let j=i+1;j<indices.length;j++){
            const aIdx=indices[i],bIdx=indices[j];
            const aValues=traces[aIdx].rawY;
            const bValues=traces[bIdx].rawY;
            const r=pairTest(aValues,bValues);
            const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
            const statVal=r[statName];
            const effectMetrics=computeEffectSizeMetrics(aValues,bValues,{ paired:state.statsPaired });
            const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
            const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
            console.debug('Debug: box pair effect metrics',{ comparison:`${labels[i]} vs ${labels[j]}`, parametric:Object.fromEntries(Object.entries(effectMetrics.parametric).map(([key,val])=>[key,safeRound(val,4)])), nonParametric:Object.fromEntries(Object.entries(effectMetrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)])) });
            let rangeMax=-Infinity; for(let k=Math.min(aIdx,bIdx);k<=Math.max(aIdx,bIdx);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
            pairs.push({
              a:i,
              b:j,
              ai:aIdx,
              bi:bIdx,
              p:r.p,
              rangeMax,
              stat:statVal,
              statName,
              df:r.df,
              labelA:labels[i],
              labelB:labels[j],
              effects:effectMetrics,
              effectParametric:formattedParamEffect,
              effectNonParametric:formattedNonParamEffect,
              method:'standard'
            });
          }
        }
        if(pairs.length){
          const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
          adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
        }
        updateStatsCorrectionSummary(pairs.length);
      }
    } else if(state.statsMode==='reference'){
      const refIdx=indices.indexOf(state.statsRef); if(refIdx===-1){ setResultsMessage('Select reference column among the chosen groups.'); return; }
      const refData=groups[refIdx];
      referenceLabel=labels[refIdx];
      if(postHocMode==='tukey'){
        const tukey=computeTukeyComparisons(groups,labels);
        if(!tukey.ok){
          setResultsMessage(tukey.message || 'Unable to compute Tukey HSD.');
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(tukey.footnote);
        const filtered=tukey.pairs.filter(pr=>pr.i===refIdx || pr.j===refIdx);
        pairs=filtered.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          let rangeMax=-Infinity; for(let k=Math.min(ai,bi);k<=Math.max(ai,bi);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.pAdj,
            adjP:pr.pAdj,
            stat:pr.q,
            statName:'q',
            df:pr.df,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'tukey'
          };
        });
        updateStatsCorrectionSummary(pairs.length);
      }else if(postHocMode==='dunn'){
        const dunn=computeDunnComparisons(groups,labels);
        if(!dunn.ok){
          setResultsMessage(dunn.message || "Unable to compute Dunn's test.");
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(dunn.footnote);
        const filtered=dunn.pairs.filter(pr=>pr.i===refIdx || pr.j===refIdx);
        pairs=filtered.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          let rangeMax=-Infinity; for(let k=Math.min(ai,bi);k<=Math.max(ai,bi);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.p,
            stat:pr.z,
            statName:'z',
            df:null,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'dunn'
          };
        });
        if(pairs.length){
          const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
          adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
        }
        updateStatsCorrectionSummary(pairs.length);
      }else{
        indices.forEach((idx,i)=>{
          if(i===refIdx) return;
          const compareValues=traces[idx].rawY;
          const r=pairTest(refData,compareValues);
          const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
          const statVal=r[statName];
          const effectMetrics=computeEffectSizeMetrics(refData,compareValues,{ paired:state.statsPaired });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          console.debug('Debug: box reference pair effect metrics',{ comparison:`${labels[refIdx]} vs ${labels[i]}`, parametric:Object.fromEntries(Object.entries(effectMetrics.parametric).map(([key,val])=>[key,safeRound(val,4)])), nonParametric:Object.fromEntries(Object.entries(effectMetrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)])) });
          let rangeMax=-Infinity; for(let k=Math.min(state.statsRef,idx);k<=Math.max(state.statsRef,idx);k++){ rangeMax=Math.max(rangeMax,Math.max(...traces[k].y)); }
          pairs.push({
            a:refIdx,
            b:i,
            ai:state.statsRef,
            bi:idx,
            p:r.p,
            rangeMax,
            labelA:labels[refIdx],
            labelB:labels[i],
            stat:statVal,
            statName,
            df:r.df,
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            method:'standard'
          });
        });
        if(pairs.length){
          const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
          adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
        }
        updateStatsCorrectionSummary(pairs.length);
      }
    }
    if(pairs.length){
      let correctionMeta;
      if(postHocMode==='tukey'){
        correctionMeta={ key:'tukey', label:'Tukey HSD', shortLabel:'Tukey HSD', footnote:null };
      }else{
        correctionMeta=resolveCorrectionMeta(state.statsCorrection,pairs.length);
      }
      updateStatsCorrectionSummary(pairs.length);
      console.debug('Debug: box pairwise correction applied',{ method:correctionMeta.key, count:pairs.length });
      const footnotes=[];
      if(correctionMeta.footnote){ footnotes.push(correctionMeta.footnote); }
      methodFootnotes.forEach(note=>{ if(note){ footnotes.push(note); } });
      let appendForPairs=false;
      if(!state.statsPaired && overall){
        const overallStatName=param?'F':'H';
        const overallRows=[
          { metric:'Overall test', value:param?'ANOVA':'Kruskal-Wallis' },
          { metric:overallStatName, value:overall[overallStatName].toFixed(4) }
        ];
        if(param){
          overallRows.push({ metric:'df', value:`${groups.length-1},${groups.reduce((s,g)=>s+g.length,0)-groups.length}` });
        }else{
          overallRows.push({ metric:'df', value:String(groups.length-1) });
        }
        overallRows.push({ metric:'P value', value:formatP(overall.p) });
        renderTableModel({
          caption:'Overall test summary',
          columns:[
            {key:'metric',label:'Metric',align:'left',index:0},
            {key:'value',label:'Value',align:'left',index:1}
          ],
          rows:overallRows,
          options:{
            fileName:'box-overall-test',
            contextLabel:'box-overall'
          }
        });
        appendForPairs=true;
      }
      const pairRows=pairs.map(pr=>({
        comparison:`${pr.labelA ?? labels[pr.a]} vs ${pr.labelB ?? labels[pr.b]}`,
        statistic:`${pr.statName} = ${pr.stat.toFixed(4)}`,
        df:pr.df!=null?pr.df:'—',
        padj:formatP(pr.adjP),
        effectParametric:pr.effectParametric,
        effectNonParametric:pr.effectNonParametric
      }));
      if(referenceLabel){
        footnotes.push(`Reference group: ${referenceLabel}`);
      }
      effectFootnotes.forEach(note=>footnotes.push(note));
      const pLabel=postHocMode==='tukey'
        ? 'P (Tukey HSD)'
        : `P (adj, ${correctionMeta.shortLabel})`;
      renderTableModel({
        caption: state.statsMode==='reference' ? 'Comparisons vs reference' : 'Pairwise comparisons',
        columns:[
          {key:'comparison',label:'Comparison',align:'left',index:0},
          {key:'statistic',label:'Statistic',align:'left',index:1},
          {key:'df',label:'df',align:'right',index:2},
          {key:'padj',label:pLabel,align:'right',index:3},
          {key:'effectParametric',label:`Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`,align:'right',index:4,tooltip:paramEffectMeta.tooltip},
          {key:'effectNonParametric',label:`Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`,align:'right',index:5,tooltip:nonParamEffectMeta.tooltip}
        ],
        rows:pairRows,
        footnotes,
        options:{
          fileName:'box-pairwise-comparisons',
          contextLabel:'box-pairs'
        }
      },appendForPairs);
      if(significanceEnabled && pairs.length){
        pairs.sort((a,b)=>(a.bi-a.ai)-(b.bi-b.ai));
        const placed=[];
        pairs.forEach(pr=>{
          let level=0; while(placed.some(pl=>!(pl.bi<pr.ai||pl.ai>pr.bi)&&pl.level===level)) level++;
          const baseCoord=valueToCoord(pr.rangeMax);
          const annotationCoord=orientation==='horizontal'
            ? baseCoord+baseOffset+level*levelGap
            : baseCoord-baseOffset-level*levelGap;
          annotatePair(svg,categoryCenter(pr.ai),categoryCenter(pr.bi),annotationCoord,pr.p,helpers.annotationStyle);
          pr.level=level; placed.push(pr);
        });
        const maxLevel=Math.max(...pairs.map(pr=>pr.level));
        void maxLevel;
      }else{
        console.debug('Debug: box significance annotation skipped for pairs',{ pairCount: pairs.length, significanceEnabled });
      }
    } else {
      // No pairwise; show overall only if available
      if(significanceEnabled && !state.statsPaired && indices.length>2 && overall){
        annotateOverall(svg,xs,valueToCoord,maxVal,overall.p,0,helpers.annotationStyle);
      }else if(!significanceEnabled){
        console.debug('Debug: box overall significance annotation skipped',{ significanceEnabled, groupCount: indices.length, overallP: overall?.p });
      }
      updateStatsCorrectionSummary(0);
    }
  }

  // PART: DRAW

  function draw(){
    const token = ++state.drawToken;
    console.log('boxplot draw start',{token});
    const colorMode = els.boxColorUnified.checked ? 'unified' : 'individual';
    const defaultFill = els.boxFill.value;
    const defaultBorder = els.boxBorder.value;
    const borderWidthRaw = Number(els.boxBorderWidth.value);
    const errorBarWidthInput = Number(els.boxErrorBarWidth?.value);
    const errorBarWidthRaw = Number.isFinite(errorBarWidthInput) ? errorBarWidthInput : borderWidthRaw;
    const containerRect = els.svgBox?.getBoundingClientRect?.();
    const fontInfo = chartStyle.resolveScaledFontSize({
      rawSize: els.boxFontSize.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: els.svgBox,
      input: els.boxFontSize
    });
    const fs = fontInfo.scaledPx;
    const styleScaleInfo = fontInfo.scaleInfo;
    const axisSettings = ensureAxisSettings();
    console.debug('Debug: box axis settings current',{
      strokeWidth: axisSettings.strokeWidth,
      color: axisSettings.color,
      tickIntervalX: axisSettings.x?.tickInterval || null,
      tickIntervalY: axisSettings.y?.tickInterval || null
    });
    const axisStrokeBase = getAxisStrokeWidthBase();
    const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeBase, styleScaleInfo, { context: 'box-axis', min: 0.5 });
    const axisStrokeColor = getAxisColor();
    const gridStrokeWidth = chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'box-grid', min: 0.25 });
    const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'box-border', min: 0 });
    const errorBarWidthPx = chartStyle.scaleStrokeWidth(errorBarWidthRaw, styleScaleInfo, { context: 'box-errorbar', min: 0 });
    const pointRadius = chartStyle.scaleRadius(3, styleScaleInfo, { context: 'box-point', min: 0.75 });
    const annotationStrokeWidth = chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'box-annotation', min: 0.5 });
    const annotationBaseOffset = chartStyle.scaleLength(ANN_BASE_OFFSET, styleScaleInfo, { context: 'box-annotation-offset', min: 10 });
    const annotationLevelGap = chartStyle.scaleLength(ANN_LEVEL_GAP, styleScaleInfo, { context: 'box-annotation-gap', min: 8 });
    const annotationBracketSize = chartStyle.scaleLength(12, styleScaleInfo, { context: 'box-annotation-bracket', min: 8 });
    const showSignificance = !!state.showSignificanceBars;
    console.debug('Debug: box showSignificance flag',{ showSignificance });
    chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, fontInfo, input: els.boxFontSize });
    console.debug('Debug: box font scaling applied',{
      input: els.boxFontSize.value,
      fontSizePt: fontInfo.pt,
      baseFontPx: fontInfo.px,
      scaledFontPx: fs,
      scale: fontInfo.scaleInfo?.scale,
      containerWidth: containerRect?.width,
      containerHeight: containerRect?.height
    });
    console.debug('Debug: box style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      errorBarWidthRaw,
      errorBarWidthPx,
      axisStrokeWidth,
      gridStrokeWidth,
      pointRadius,
      annotationStrokeWidth,
      annotationBaseOffset,
      annotationLevelGap,
      annotationBracketSize,
      styleScale: styleScaleInfo?.styleScale
    });
    const axisMetrics = chartStyle.createAxisMetrics(fs);
    console.debug('Debug: box axis metrics', axisMetrics);
    const showGrid = els.boxShowGrid.checked;
    const showFrame = !!els.boxShowFrame?.checked;
    console.debug('Debug: box showFrame state',{ showFrame });
    const logScale = els.boxLogScale.checked;
    const graphTypeRaw = els.boxGraphType.value;
    const isIndividualValues = graphTypeRaw === 'strip';
    let individualSummaryMode = 'none';
    if(isIndividualValues){
      const allowedSummaries = new Set(['mean','median','none']);
      const domValue = els.boxIndividualSummary?.value;
      const summaryValue = allowedSummaries.has(domValue) ? domValue : (allowedSummaries.has(state.individualSummary) ? state.individualSummary : 'mean');
      individualSummaryMode = summaryValue;
      if(summaryValue !== state.individualSummary){
        state.individualSummary = summaryValue;
        console.debug('Debug: box individual summary state sync',{ summaryValue });
      }
    }
    console.debug('Debug: box individual summary mode',{ graphTypeRaw, individualSummaryMode });
    const pointMode = els.boxPointMode.value;
    const showCaps = els.boxShowCaps.checked;
    const errorMode = els.boxErrorMode.value;
    const isFlipped = !!els.boxFlipAxes?.checked;
    state.flipAxes = isFlipped;
    if(els.boxLogScaleLabel){
      els.boxLogScaleLabel.textContent = isFlipped ? 'Log Scale (Values)' : 'Log Scale (Y)';
    }
    console.debug('Debug: box draw orientation',{ isFlipped });
    let legendRenderer = chartStyle.createLegendRenderer({ entries: [], fontSize: fs, strokeWidth: borderWidthPx });
    let legendGapPx = 0;
    let legendWidthForMargin = 0;
    console.debug('Debug: box legend initial state',{ legendWidthForMargin, legendGapPx, entryCount: legendRenderer.entries.length });
    const traces = [];
    const traceLabels = [];
    let axisLabels = [];
    const groupColorAssignments = new Map();
    const resolveTraceColor = (trace, index) => {
      const rawColorIndex = isGroupedMode && Number.isInteger(trace?.groupIndex) ? trace.groupIndex : index;
      const colorIndex = Number.isInteger(rawColorIndex) && rawColorIndex >= 0 ? rawColorIndex : 0;
      console.debug('Debug: box resolveTraceColor',{ traceIndex: index, colorIndex, rawColorIndex, groupName: trace?.groupName, grouped: isGroupedMode });
      if(colorMode === 'individual'){
        let fillColor = state.fillColors[colorIndex];
        if(!fillColor){
          if(isGroupedMode && trace?.groupName && groupColorAssignments.has(trace.groupName)){
            fillColor = groupColorAssignments.get(trace.groupName).fill;
          }else{
            fillColor = DEFAULT_BOX_COLORS[colorIndex % DEFAULT_BOX_COLORS.length];
          }
          state.fillColors[colorIndex] = fillColor;
        }
        let borderColor = state.borderColors[colorIndex];
        if(!borderColor){
          if(isGroupedMode && trace?.groupName && groupColorAssignments.has(trace.groupName)){
            borderColor = groupColorAssignments.get(trace.groupName).border;
          }else{
            borderColor = shadeColor(fillColor, -30);
          }
          state.borderColors[colorIndex] = borderColor;
        }
        if(isGroupedMode && trace?.groupName){
          groupColorAssignments.set(trace.groupName, { fill: fillColor, border: borderColor, colorIndex });
        }
        return { fillColor, borderColor };
      }
      const fillColor = defaultFill;
      const borderColor = defaultBorder;
      if(isGroupedMode && trace?.groupName){
        if(!groupColorAssignments.has(trace.groupName)){
          groupColorAssignments.set(trace.groupName, { fill: fillColor, border: borderColor, colorIndex });
        }
      }
      return { fillColor, borderColor };
    };
    const isGroupedMode = state.tableFormat === 'grouped';
    if(isGroupedMode){
      ensureGroupedDefaults();
    }
    const groupedGroups = isGroupedMode ? state.grouped.groups.map((name, idx)=>{ const trimmed = typeof name === 'string' ? name.trim() : ''; return trimmed || `Group ${idx + 1}`; }) : [];
    const groupedReplicates = isGroupedMode ? Math.max(1, state.grouped.replicatesPerGroup) : 1;
    const analysis = state.hot?.getAnalysisData?.() || Shared.hot.getAnalysisData(state.hot);
    const dataMatrix = analysis.data || [];
    const nCols = analysis.colCount || state.hot.countCols();
    const nRows = analysis.rowCount || state.hot.countRows?.() || dataMatrix.length;
    console.debug('Debug: box analysis snapshot',{ nCols, nRows, excludedCols: analysis.excluded?.cols?.length || 0, excludedRows: analysis.excluded?.rows?.length || 0 });
    if(!isGroupedMode){
      if(state.colOrder.length !== nCols){
        state.colOrder = Array.from({ length: nCols }, (_, i) => i);
      }
      state.colOrder = state.colOrder.filter(index=>index < nCols);
      if(!state.colOrder.length){
        state.colOrder = Array.from({ length: nCols }, (_, i) => i);
      }
      for(let orderIdx = 0; orderIdx < state.colOrder.length; orderIdx++){
        const i = state.colOrder[orderIdx];
        if(i >= nCols){
          continue;
        }
        if(analysis.isColumnExcluded?.(i)){
          console.debug('Debug: box column skipped due to exclusion',{ column: i });
          continue;
        }
        const headerCell = dataMatrix?.[0]?.[i];
        const label = (headerCell && String(headerCell).trim()) || `Col ${i + 1}`;
        const col = [];
        console.time(`boxColCollect_${i}_${token}`);
        for(let r = 1; r < nRows; r++){
          const rawValue = dataMatrix?.[r]?.[i];
          if(rawValue === null || typeof rawValue === 'undefined'){
            continue;
          }
          const v = parseFloat(rawValue);
          if(!isNaN(v)) col.push(v);
          if(r % 10000 === 0){
            console.log('boxplot collect progress',{ col: i, row: r, token });
          }
        }
        console.timeEnd(`boxColCollect_${i}_${token}`);
        console.log('boxplot collected column',{ index: i, values: col.length });
        if(token !== state.drawToken){
          console.log('boxplot draw cancelled after collect',{ token });
          return;
        }
        if(col.length){
          traceLabels.push(label);
          traces.push({ name: label, rawY: col });
        }
      }
      axisLabels = traceLabels.slice();
    }else{
      state.colOrder = Array.from({ length: nCols }, (_, i) => i);
      for(let repIdx = 0; repIdx < groupedReplicates; repIdx++){
        const pendingTraces = [];
        let categoryName = '';
        for(let gIdx = 0; gIdx < groupedGroups.length; gIdx++){
          const groupName = groupedGroups[gIdx];
          const colIndex = gIdx * groupedReplicates + repIdx;
          if(colIndex >= nCols){
            console.debug('Debug: grouped column missing',{ colIndex, gIdx, repIdx, nCols });
            continue;
          }
          if(analysis.isColumnExcluded?.(colIndex)){
            console.debug('Debug: grouped column excluded',{ colIndex, gIdx, repIdx });
            continue;
          }
          const headerCell = dataMatrix?.[0]?.[colIndex];
          const headerText = headerCell && String(headerCell).trim();
          if(headerText && !categoryName){
            categoryName = headerText;
          }
          const values = [];
          console.time(`boxColCollect_${colIndex}_${token}`);
          for(let r = 1; r < nRows; r++){
            const rawValue = dataMatrix?.[r]?.[colIndex];
            if(rawValue === null || typeof rawValue === 'undefined'){
              continue;
            }
            const v = parseFloat(rawValue);
            if(!isNaN(v)) values.push(v);
            if(r % 10000 === 0){
              console.log('boxplot collect progress',{ col: colIndex, row: r, token, groupIndex: gIdx, replicate: repIdx });
            }
          }
          console.timeEnd(`boxColCollect_${colIndex}_${token}`);
          console.log('boxplot collected column',{ index: colIndex, values: values.length, groupIndex: gIdx, replicate: repIdx });
          if(token !== state.drawToken){
            console.log('boxplot draw cancelled after grouped collect',{ token });
            return;
          }
          if(values.length){
            pendingTraces.push({ groupName, groupIndex: gIdx, rawY: values, columnIndex: colIndex });
          }
        }
        if(!pendingTraces.length){
          console.debug('Debug: grouped replicate without data',{ replicateIndex: repIdx });
          continue;
        }
        const finalCategoryName = categoryName || `Category ${axisLabels.length + 1}`;
        const categoryIndex = axisLabels.length;
        axisLabels.push(finalCategoryName);
        pendingTraces.forEach(traceInfo => {
          const label = `${traceInfo.groupName} – ${finalCategoryName}`;
          const trace = {
            name: label,
            rawY: traceInfo.rawY,
            groupName: traceInfo.groupName,
            groupIndex: traceInfo.groupIndex,
            categoryName: finalCategoryName,
            categoryIndex,
            columnIndex: traceInfo.columnIndex
          };
          traces.push(trace);
          traceLabels.push(label);
        });
      }
      if(!axisLabels.length && traceLabels.length){
        axisLabels = traceLabels.slice();
      }
    }
    if(token !== state.drawToken){
      console.log('boxplot draw cancelled before traces ready',{ token });
      return;
    }
    if(!traces.length){
      els.boxColorPerBox.innerHTML='';
      global.document.getElementById('boxPlot').innerHTML='';
      global.document.getElementById('statsResults').innerHTML='';
      global.document.getElementById('statsTable').innerHTML='';
      return;
    }
    const colorPrimeSample = [];
    traces.forEach((trace, index) => {
      const colorInfo = resolveTraceColor(trace, index);
      trace.fillColor = colorInfo.fillColor;
      trace.borderColor = colorInfo.borderColor;
      if(colorPrimeSample.length < 5){
        colorPrimeSample.push({
          index,
          name: trace.name,
          fill: colorInfo.fillColor,
          border: colorInfo.borderColor,
          group: trace.groupName || null
        });
      }
    });
    console.debug('Debug: box trace colors primed',{ traceCount: traces.length, sample: colorPrimeSample });
    const colorPickerLabels = isGroupedMode ? groupedGroups : traceLabels;
    console.debug('Debug: box color picker labels resolved',{ isGroupedMode, labelCount: colorPickerLabels.length, labels: colorPickerLabels });
    state.lastAxisLabels = Array.isArray(axisLabels) ? axisLabels.slice() : [];
    if(els.boxColorIndividual.checked){
      updateBoxColorPickers(colorPickerLabels, { grouped: isGroupedMode });
    }else{
      els.boxColorPerBox.innerHTML='';
    }
    renderStatsControls(traces);
    if(logScale){
      const hasNonPos = traces.some(t => t.rawY.some(v => v <= 0));
      if(hasNonPos){
        global.document.getElementById('boxPlot').innerHTML='<i>Log scale requires positive values.</i>';
        global.document.getElementById('statsResults').innerHTML='';
        global.document.getElementById('statsTable').innerHTML='';
        return;
      }
      traces.forEach(t => { t.y = t.rawY.map(v => Math.log10(v)); });
    }else{
      traces.forEach(t => { t.y = [...t.rawY]; });
    }
    while (els.plotDiv.firstChild) els.plotDiv.removeChild(els.plotDiv.firstChild);
    const W = Math.max(50, Math.floor(els.plotDiv.clientWidth || 50));
    const H = Math.max(40, Math.floor(els.plotDiv.clientHeight || 40));
    els.plotDiv.style.position = 'relative';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'boxSvg');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
    chartStyle.applySvgDefaults(svg);
    els.plotDiv.appendChild(svg);
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg,{ scopeId: 'box' });
      console.debug('Debug: box fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
    } else {
      console.debug('Debug: box fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
    }
    let ymin = Infinity;
    let ymax = -Infinity;
    for(let ti = 0; ti < traces.length; ti++){
      const t = traces[ti];
      for(let j = 0; j < t.y.length; j++){
        const v = t.y[j];
        if(v < ymin) ymin = v;
        if(v > ymax) ymax = v;
        if(j % 10000 === 0){
          console.log('boxplot range progress',{ trace: ti, row: j, token });
        }
      }
    }
    if(token !== state.drawToken){
      console.log('boxplot draw cancelled after range calc',{ token });
      return;
    }
    console.log('boxplot ymin/ymax',{ ymin, ymax });
    let barErrorMin = Infinity;
    if(graphTypeRaw === 'bar'){
      traces.forEach(t => {
        const sampleCount = t.y.length;
        if(!sampleCount) return;
        const mean = t.y.reduce((a, b) => a + b, 0) / sampleCount;
        const hasSpread = sampleCount > 1;
        const variance = hasSpread ? t.y.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (sampleCount - 1) : 0;
        const sd = hasSpread ? Math.sqrt(Math.max(variance, 0)) : 0;
        const candidate = hasSpread ? mean - sd : mean;
        if(!hasSpread){
          console.debug('Debug: box skip bar extent for single value',{ trace: t.name, sampleCount, mean });
        }
        barErrorMin = Math.min(barErrorMin, candidate);
      });
      if(isFinite(barErrorMin)) ymin = Math.min(ymin, barErrorMin);
    }
    const userYMin = parseFloat(els.boxYMin.value);
    const userYMax = parseFloat(els.boxYMax.value);
    if(isFinite(userYMin)) ymin = logScale ? Math.log10(userYMin) : userYMin;
    if(isFinite(userYMax)) ymax = logScale ? Math.log10(userYMax) : userYMax;
    console.log('boxplot axis override',{ userYMin, userYMax, ymin, ymax });
    console.log('boxplot range',{ ymin, ymax });
    if(graphTypeRaw === 'bar' && !logScale){
      const beforeYMin = ymin;
      const beforeYMax = ymax;
      ymin = Math.min(ymin, 0);
      ymax = Math.max(ymax, 0);
      console.debug('Debug: box bar axis zero clamp',{ beforeYMin, beforeYMax, ymin, ymax });
    }
    function niceNum(range, round){
      const exp = Math.floor(Math.log10(range));
      const f = range / Math.pow(10, exp);
      let nf;
      if(round){
        if(f < 1.5) nf = 1;
        else if(f < 3) nf = 2;
        else if(f < 7) nf = 5;
        else nf = 10;
      }else{
        if(f <= 1) nf = 1;
        else if(f <= 2) nf = 2;
        else if(f <= 5) nf = 5;
        else nf = 10;
      }
      return nf * Math.pow(10, exp);
    }
    function niceScale(min, max, maxTicks){
      const range = niceNum(max - min || 1, false);
      const step = niceNum(range / (Math.max(maxTicks - 1, 1)), true);
      const graphMin = Math.floor(min / step) * step;
      const graphMax = Math.ceil(max / step) * step;
      const ticks = [];
      for(let v = graphMin; v <= graphMax + 1e-9; v += step) ticks.push(v);
      return { min: graphMin, max: graphMax, ticks, step };
    }
    const labelTexts = axisLabels.map((lab, i) => lab || `Category ${i + 1}`);
    if(isGroupedMode && groupColorAssignments.size){
      const legendEntries = Array.from(groupColorAssignments.entries()).map(([name, colors]) => ({
        label: name,
        fill: colors.fill,
        stroke: colors.border,
        strokeWidth: borderWidthPx
      }));
      legendRenderer = chartStyle.createLegendRenderer({
        entries: legendEntries,
        fontSize: fs,
        strokeWidth: borderWidthPx
      });
      legendGapPx = legendRenderer.entries.length ? Math.max(12, Math.round(fs * 0.5)) : 0;
      legendWidthForMargin = legendRenderer.entries.length ? legendRenderer.width + legendGapPx : 0;
      console.debug('Debug: box legend metrics',{ legendWidthForMargin, legendGapPx, entryCount: legendRenderer.entries.length });
    }else{
      legendRenderer = chartStyle.createLegendRenderer({ entries: [], fontSize: fs, strokeWidth: borderWidthPx });
      legendGapPx = 0;
      legendWidthForMargin = 0;
      console.debug('Debug: box legend disabled',{ grouped: isGroupedMode, groupCount: groupColorAssignments.size });
    }
    function formatTick(v){
      return v.toLocaleString('en-US',{ maximumFractionDigits: 2, useGrouping: false });
    }
    function add(tag, attrs){
      const el = document.createElementNS(NS, tag);
      for(const [k, v] of Object.entries(attrs)){
        el.setAttribute(k, String(v));
      }
      svg.appendChild(el);
      return el;
    }
    function percentile(sorted, p){
      if(!sorted.length) return NaN;
      const pos = (sorted.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      return (sorted[base + 1] !== undefined) ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
    }
    const axisStroke = axisStrokeColor || DEFAULT_AXIS_COLOR;
    function estimateBandwidth(sorted){
      if(!sorted.length) return 1;
      const n = sorted.length;
      const meanVal = sorted.reduce((acc, v) => acc + v, 0) / n;
      const variance = sorted.reduce((acc, v) => acc + Math.pow(v - meanVal, 2), 0) / (n - 1 || 1);
      const sigma = Math.sqrt(variance) || 0;
      const iqrVal = percentile(sorted, 0.75) - percentile(sorted, 0.25);
      const scale = Math.min(sigma, iqrVal / 1.349 || Infinity) || sigma || Math.abs(sorted[0]) || 1;
      const bandwidth = 0.9 * scale * Math.pow(n, -0.2);
      const fallback = (sorted[n - 1] - sorted[0]) / (Math.sqrt(n) || 1) || 1;
      const resolved = Number.isFinite(bandwidth) && bandwidth > 0 ? bandwidth : fallback;
      console.debug('Debug: box violin bandwidth',{ n, sigma, iqr: iqrVal, scale, bandwidth, fallback, resolved });
      return resolved;
    }
    function computeDensity(sorted, minVal, maxVal, sampleCount){
      const count = sampleCount || 64;
      if(!sorted.length){
        return { positions: [], densities: [], bandwidth: 1 };
      }
      let domainMin = Math.min(minVal, sorted[0]);
      let domainMax = Math.max(maxVal, sorted[sorted.length - 1]);
      if(!isFinite(domainMin) || !isFinite(domainMax)){
        domainMin = sorted[0];
        domainMax = sorted[sorted.length - 1];
      }
      if(domainMax === domainMin){
        domainMin -= 0.5;
        domainMax += 0.5;
      }
      const bandwidth = estimateBandwidth(sorted);
      const positions = [];
      const densities = [];
      const step = (domainMax - domainMin) / Math.max(count - 1, 1);
      const denom = sorted.length * bandwidth * Math.sqrt(2 * Math.PI);
      for(let idx = 0; idx < count; idx++){
        const x = domainMin + step * idx;
        let sum = 0;
        for(let j = 0; j < sorted.length; j++){
          const u = (x - sorted[j]) / bandwidth;
          sum += Math.exp(-0.5 * u * u);
        }
        const density = denom ? sum / denom : 0;
        positions.push(x);
        densities.push(density);
      }
      const peak = densities.length ? densities.reduce((max, d) => (d > max ? d : max), 0) : 0;
      console.debug('Debug: box violin density',{ bandwidth, domainMin, domainMax, sampleCount: count, peak });
      return { positions, densities, bandwidth };
    }
    const annotationStyle = {
      styleScaleInfo,
      fontSize: fs,
      strokeWidth: annotationStrokeWidth,
      baseOffset: annotationBaseOffset,
      levelGap: annotationLevelGap,
      bracketSize: annotationBracketSize,
      orientation: isFlipped ? 'horizontal' : 'vertical'
    };
    const selectionCount = state.selectedCols.size || 0;
    const maxLevelEstimate = showSignificance && selectionCount > 1 ? selectionCount : 0;

    function buildManualTicks(minVal, maxVal, step){
      const safeStep = Number(step);
      if(!Number.isFinite(minVal) || !Number.isFinite(maxVal)){
        console.debug('Debug: box manual ticks skipped',{ minVal, maxVal, step, reason: 'non-finite-range' });
        return null;
      }
      if(!Number.isFinite(safeStep) || safeStep <= 0){
        console.debug('Debug: box manual ticks skipped',{ minVal, maxVal, step });
        return null;
      }
      let graphMin = Math.floor(minVal / safeStep) * safeStep;
      let graphMax = Math.ceil(maxVal / safeStep) * safeStep;
      if(graphMin === graphMax){
        graphMax = graphMin + safeStep;
      }
      const ticks = [];
      let current = graphMin;
      let guard = 0;
      while(current <= graphMax + safeStep * 0.25 && guard < 1000){
        ticks.push(Number.parseFloat(current.toPrecision(12)));
        current += safeStep;
        guard += 1;
      }
      if(!ticks.length){
        ticks.push(Number.parseFloat(graphMin.toPrecision(12)));
      }
      console.debug('Debug: box manual ticks generated',{ minVal, maxVal, step: safeStep, tickCount: ticks.length });
      return {
        min: Math.min(graphMin, ticks[0], minVal),
        max: Math.max(graphMax, ticks[ticks.length - 1], maxVal),
        ticks,
        step: safeStep
      };
    }

    const axisControlConfig = axis => ({
      axis,
      scopeId: 'box',
      getTickInterval: () => getAxisTickInterval(axis),
      getThickness: () => getAxisStrokeWidthBase(),
      getColor: () => getAxisColor(),
      isTickIntervalEnabled: () => isAxisNumeric(axis),
      getTickIntervalDisabledMessage: () => {
        if(axis === 'x'){
          return 'Tick interval is only available when the X axis shows numeric values. Enable Flip Axes to adjust X ticks.';
        }
        if(axis === 'y'){
          return 'Tick interval is only available when the Y axis shows numeric values. Disable Flip Axes to adjust Y ticks.';
        }
        return 'Tick interval available only for numeric axes.';
      },
      onTickIntervalChange: value => updateAxisTickInterval(axis, value),
      onThicknessChange: value => updateAxisStrokeWidth(value),
      onColorChange: value => updateAxisColor(value)
    });

    function renderVertical(){
      const tickFont = chartStyle.makeFont(fs);
      const axisLabelFont = chartStyle.makeFont(fs);
      const yTitleWidthBase = chartStyle.measureText(state.yLabelText, axisLabelFont);
      const tickLen = axisMetrics.tickLength;
      const tickGap = axisMetrics.tickLabelGap;
      const topExtra = showSignificance && maxLevelEstimate ? (annotationBaseOffset + maxLevelEstimate * annotationLevelGap) : 0;
      let marginLocal = chartStyle.computeBaseMargins({ fontSize: fs, maxYLabelWidth: 0, yTitleWidth: yTitleWidthBase, axisMetrics, legendWidth: legendWidthForMargin });
      marginLocal.top += topExtra;
      marginLocal.left = Math.max(marginLocal.left, fs * 0.5);
      let plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
      let plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
      let bottomLayout = chartStyle.computeBottomLayout({ labels: labelTexts, fontSize: fs, plotWidth: plotWLocal, baseBottom: marginLocal.bottom, axisMetrics });
      marginLocal.bottom = bottomLayout.bottom;
      plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
      plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
      const yIntervalSetting = getAxisTickInterval('y');
      let yTickTarget = chartStyle.estimateTickCount(plotHLocal, { axis: 'y', fallback: 6 });
      let yScale = niceScale(ymin, ymax, yTickTarget);
      let manualYScale = null;
      if(yIntervalSetting){
        const manual = buildManualTicks(ymin, ymax, yIntervalSetting);
        if(manual){
          manualYScale = manual;
          yScale = manual;
          yTickTarget = manual.ticks.length;
          console.debug('Debug: box y-axis manual override',{ step: manual.step, tickCount: manual.ticks.length, min: manual.min, max: manual.max });
        }
      }
      let tickLabels = [];
      let tickWidths = [];
      let maxTickWidth = 0;
      let yLabelGap = 0;
      const tickPasses = manualYScale ? 1 : 2;
      for(let pass = 0; pass < tickPasses; pass++){
        if(!manualYScale){
          yScale = niceScale(ymin, ymax, yTickTarget);
        }
        tickLabels = yScale.ticks.map(t => formatTick(logScale ? Math.pow(10, t) : t));
        tickWidths = tickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
        maxTickWidth = Math.max(...tickWidths, 0);
        yLabelGap = maxTickWidth + tickLen + tickGap;
        marginLocal = chartStyle.computeBaseMargins({ fontSize: fs, maxYLabelWidth: maxTickWidth, yTitleWidth: yTitleWidthBase, axisMetrics, legendWidth: legendWidthForMargin });
        marginLocal.top += topExtra;
        marginLocal.left = Math.max(marginLocal.left, yLabelGap + fs * 0.5);
        plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
        plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
        bottomLayout = chartStyle.computeBottomLayout({ labels: labelTexts, fontSize: fs, plotWidth: plotWLocal, baseBottom: marginLocal.bottom, axisMetrics });
        marginLocal.bottom = bottomLayout.bottom;
        plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
        plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
        if(manualYScale){
          break;
        }
        const refinedTickTarget = chartStyle.estimateTickCount(plotHLocal, { axis: 'y', fallback: yTickTarget });
        console.debug('Debug: box tick target evaluation',{ pass, plotH: plotHLocal, yTickTarget, refinedTickTarget });
        if(refinedTickTarget === yTickTarget){
          break;
        }
        yTickTarget = refinedTickTarget;
      }
      console.debug('Debug: box layout',{ margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, rotate: bottomLayout.shouldRotate, yTickTarget, manualTicks: !!manualYScale });
      const axisCount = Math.max(axisLabels.length, 1);
      const bandW = plotWLocal / axisCount;
      const groupCountLocal = isGroupedMode ? Math.max(1, groupedGroups.length) : 1;
      const clusterGap = isGroupedMode ? Math.min(bandW * 0.25, 16) : 0;
      let perGroupBand = isGroupedMode ? (bandW - clusterGap) / groupCountLocal : bandW;
      if(!Number.isFinite(perGroupBand) || perGroupBand <= 0){
        perGroupBand = bandW / Math.max(groupCountLocal, 1);
      }
      const groupOffset = isGroupedMode ? (bandW - perGroupBand * groupCountLocal) / 2 : 0;
      const valueRange = yScale.max - yScale.min || 1;
      const y2px = v => marginLocal.top + plotHLocal * (1 - (v - yScale.min) / valueRange);
      const boxWidthForTrace = () => Math.max(6, Math.min(60, perGroupBand * 0.6));
      const localBandWidthForTrace = () => (isGroupedMode ? perGroupBand : bandW);
      const xCenter = (trace, traceIndex) => {
        if(isGroupedMode){
          const categoryIdx = Number.isFinite(trace?.categoryIndex) ? trace.categoryIndex : traceIndex;
          const groupIdx = Number.isFinite(trace?.groupIndex) ? trace.groupIndex : 0;
          const left = marginLocal.left + categoryIdx * bandW + groupOffset;
          return left + (groupIdx + 0.5) * perGroupBand;
        }
        return marginLocal.left + (traceIndex + 0.5) * bandW;
      };
      const yAxisX = marginLocal.left;
      const xAxisY = graphTypeRaw === 'bar' ? y2px(0) : marginLocal.top + plotHLocal;
      if(showGrid){
        yScale.ticks.forEach(t => {
          const y = y2px(t);
          add('line',{ x1: yAxisX, y1: y, x2: yAxisX + plotWLocal, y2: y, stroke: '#ddd', 'stroke-width': gridStrokeWidth });
        });
        console.debug('Debug: box grid stroke scaled',{ horizontal: yScale.ticks.length, gridStrokeWidth });
      }
      const yTickPositions = yScale.ticks.map(t => y2px(t));
      let axisYStart = yTickPositions.length ? Math.min(...yTickPositions) : marginLocal.top;
      let axisYEnd = yTickPositions.length ? Math.max(...yTickPositions) : marginLocal.top + plotHLocal;
      if(axisYStart === axisYEnd){
        axisYStart = marginLocal.top;
        axisYEnd = marginLocal.top + plotHLocal;
      }
      axisYStart = Math.min(axisYStart, xAxisY);
      axisYEnd = Math.max(axisYEnd, xAxisY);
      console.debug('Debug: box axis join span',{ axisYStart, axisYEnd, xAxisY, yAxisX });
      const yAxisLine = add('line',{ x1: yAxisX, y1: axisYStart, x2: yAxisX, y2: axisYEnd, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
      }
      let yTickFontCount = 0;
      yScale.ticks.forEach((t, i) => {
        const y = y2px(t);
        add('line',{ x1: yAxisX - tickLen, y1: y, x2: yAxisX, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const txt = add('text',{ x: yAxisX - (tickLen + tickGap), y, 'font-size': fs, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: chartStyle.TEXT_COLOR });
        txt.textContent = formatTick(logScale ? Math.pow(10, t) : t);
        markFontEditable(txt,'yTick');
        yTickFontCount += 1;
      });
      const xTickPositions = axisLabels.map((_, i) => marginLocal.left + (i + 0.5) * bandW);
      const xIntervalSetting = getAxisTickInterval('x');
      const xInterval = Number.isFinite(xIntervalSetting) && xIntervalSetting > 1 ? Math.max(1, Math.round(xIntervalSetting)) : null;
      let axisXStart = xTickPositions.length ? Math.min(...xTickPositions) : yAxisX;
      let axisXEnd = xTickPositions.length ? Math.max(...xTickPositions) : yAxisX + plotWLocal;
      if(xTickPositions.length === 1){
        const halfBand = Math.max(6, bandW * 0.5);
        axisXStart = xTickPositions[0] - halfBand;
        axisXEnd = xTickPositions[0] + halfBand;
      }
      if(axisXStart === axisXEnd){
        axisXStart = yAxisX;
        axisXEnd = yAxisX + plotWLocal;
      }
      axisXStart = Math.min(axisXStart, yAxisX);
      const frameXMax = yAxisX + plotWLocal;
      axisXEnd = Math.max(axisXEnd, frameXMax);
      console.debug('Debug: box x-axis span',{ axisXStart, axisXEnd, yAxisX, frameXMax });
      const xAxisLine = add('line',{ x1: yAxisX, y1: xAxisY, x2: axisXEnd, y2: xAxisY, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
      }
      console.debug('Debug: box axes stroke scaled',{ axisStrokeWidth });
      if(showFrame){
        console.debug('Debug: box frame request',{ stroke: axisStroke, showFrame });
        const doc = svg.ownerDocument || global.document;
        const frameGroup = doc?.createElementNS ? doc.createElementNS(NS, 'g') : null;
        if(frameGroup){
          frameGroup.setAttribute('stroke-width', axisStrokeWidth);
          frameGroup.setAttribute('fill', 'none');
          svg.appendChild(frameGroup);
          chartStyle.drawPlotFrame({ svg, group: frameGroup, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, sides: ['top', 'right'] });
          console.debug('Debug: box frame stroke scaled',{ axisStrokeWidth });
        }else{
          chartStyle.drawPlotFrame({ svg, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, sides: ['top', 'right'] });
          console.debug('Debug: box frame group fallback used');
        }
      }
      const xLabelOffset = tickLen + tickGap;
      const xLabels = [];
      let xTickFontCount = 0;
      let renderedXTicks = 0;
      axisLabels.forEach((lab, i) => {
        if(xInterval && i % xInterval !== 0){
          return;
        }
        const x = marginLocal.left + (i + 0.5) * bandW;
        add('line',{ x1: x, y1: xAxisY, x2: x, y2: xAxisY + tickLen, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const labelText = lab || `Category ${i + 1}`;
        const t = add('text',{ x, y: xAxisY + xLabelOffset, 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'hanging', fill: chartStyle.TEXT_COLOR });
        t.textContent = labelText;
        markFontEditable(t,'xTick');
        xTickFontCount += 1;
        if(isGroupedMode){
          t.style.cursor = 'default';
        }else{
          t.style.cursor = 'ew-resize';
          enableLabelDrag(t, i);
        }
        xLabels.push(t);
        renderedXTicks += 1;
      });
      console.debug('Debug: box font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
      console.debug('Debug: box ticks stroke scaled',{ yTickCount: yScale.ticks.length, xTickCount: renderedXTicks, axisStrokeWidth });
      chartStyle.applyLabelOrientation(xLabels,{ angle: -45, anchor: 'end', dy: '0.35em', force: bottomLayout.shouldRotate });
      if(xInterval && axisLabels.length){
        console.debug('Debug: box x-axis tick filter',{ interval: xInterval, rendered: renderedXTicks, total: axisLabels.length });
      }
      function enableLabelDrag(t, idx){
        if(isGroupedMode){
          return;
        }
        t.addEventListener('mousedown', e => {
          e.preventDefault();
          const svgRect = svg.getBoundingClientRect();
          const onMove = ev => {
            const svgX = ev.clientX - svgRect.left;
            t.setAttribute('x', svgX);
          };
          const onUp = ev => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const svgX = ev.clientX - svgRect.left;
            let targetIdx = Math.floor((svgX - marginLocal.left) / bandW);
            targetIdx = Math.max(0, Math.min(axisLabels.length - 1, targetIdx));
            if(targetIdx !== idx){
              const moved = state.colOrder.splice(idx, 1)[0];
              state.colOrder.splice(targetIdx, 0, moved);
            }
            console.log('boxplot label drag end',{ from: idx, to: targetIdx, orientation: 'horizontal-axis' });
            state.scheduleDraw();
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
      const yX = marginLocal.left - (maxTickWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
      const yText = add('text',{ x: yX, y: marginLocal.top + plotHLocal / 2, transform: `rotate(-90 ${yX} ${marginLocal.top + plotHLocal / 2})`, 'text-anchor': 'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR });
      yText.textContent = state.yLabelText;
      markFontEditable(yText,'yTitle','yTitle');
      makeEditable(yText, txt => { state.yLabelText = txt; });
      for(let i = 0; i < traces.length; i++){
        if(token !== state.drawToken){
          console.log('boxplot draw cancelled during render loop',{ token });
          return null;
        }
        const t = traces[i];
        const vals = [...t.y].sort((a, b) => a - b);
        if(!vals.length) continue;
        const cx = xCenter(t, i);
        const localBand = localBandWidthForTrace();
        const boxW = Math.max(6, Math.min(60, localBand * 0.6));
        const x0 = cx - boxW / 2;
        const x1 = cx + boxW / 2;
        const q1 = percentile(vals, 0.25);
        const med = percentile(vals, 0.5);
        const q3 = percentile(vals, 0.75);
        const iqr = q3 - q1;
        const lowerFence = q1 - 1.5 * iqr;
        const upperFence = q3 + 1.5 * iqr;
        const outliers = [];
        let wMin = Infinity;
        let wMax = -Infinity;
        let valIdx = 0;
        for(const v of vals){
          if(v < lowerFence || v > upperFence){
            outliers.push(v);
          }else{
            if(v < wMin) wMin = v;
            if(v > wMax) wMax = v;
          }
          valIdx++;
          if(valIdx % 10000 === 0){
            console.log('boxplot fence progress',{ index: i, valIdx, token });
          }
        }
        if(wMin === Infinity){
          wMin = vals[0];
          wMax = vals[vals.length - 1];
        }
        const yQ1 = y2px(q1);
        const yMed = y2px(med);
        const yQ3 = y2px(q3);
        const yWMin = y2px(wMin);
        const yWMax = y2px(wMax);
        const fillColor = t.fillColor || resolveTraceColor(t, i).fillColor;
        const borderColor = t.borderColor || resolveTraceColor(t, i).borderColor;
        const mean = t.y.reduce((acc, v) => acc + v, 0) / t.y.length;
        const yMean = y2px(mean);
        if(graphTypeRaw === 'box' || graphTypeRaw === 'notched'){
          if(graphTypeRaw === 'box'){
            add('rect',{ x: x0, y: yQ3, width: boxW, height: Math.max(1, yQ1 - yQ3), fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: x0, y1: yMed, x2: x1, y2: yMed, stroke: borderColor, 'stroke-width': borderWidthPx });
          }else{
            const notchSpan = 1.57 * (iqr) / Math.sqrt(vals.length);
            let notchLower = Math.max(q1, med - notchSpan);
            let notchUpper = Math.min(q3, med + notchSpan);
            if(notchLower > notchUpper){
              const mid = (notchLower + notchUpper) / 2;
              notchLower = notchUpper = mid;
            }
            const yNL = y2px(notchLower);
            const yNU = y2px(notchUpper);
            const notchWidth = boxW * 0.4;
            const xNL = cx - notchWidth / 2;
            const xNR = cx + notchWidth / 2;
            const d = [
              `M ${x0} ${yQ3}`,
              `L ${x1} ${yQ3}`,
              `L ${x1} ${yNU}`,
              `L ${xNR} ${yMed}`,
              `L ${x1} ${yNL}`,
              `L ${x1} ${yQ1}`,
              `L ${x0} ${yQ1}`,
              `L ${x0} ${yNL}`,
              `L ${xNL} ${yMed}`,
              `L ${x0} ${yNU}`,
              'Z'
            ].join(' ');
            add('path',{ d, fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: xNL, y1: yMed, x2: xNR, y2: yMed, stroke: borderColor, 'stroke-width': borderWidthPx });
          }
          add('line',{ x1: cx, y1: yQ3, x2: cx, y2: yWMax, stroke: borderColor, 'stroke-width': borderWidthPx });
          add('line',{ x1: cx, y1: yQ1, x2: cx, y2: yWMin, stroke: borderColor, 'stroke-width': borderWidthPx });
          if(showCaps){
            const cap = Math.max(6, boxW * 0.4);
            add('line',{ x1: cx - cap / 2, y1: yWMax, x2: cx + cap / 2, y2: yWMax, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: cx - cap / 2, y1: yWMin, x2: cx + cap / 2, y2: yWMin, stroke: borderColor, 'stroke-width': borderWidthPx });
          }
        }else if(graphTypeRaw === 'bar'){
          const sampleCount = t.y.length;
          const hasSpread = sampleCount > 1;
          const variance = hasSpread ? t.y.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (sampleCount - 1) : 0;
          const sd = hasSpread ? Math.sqrt(Math.max(variance, 0)) : 0;
          const yZero = y2px(0);
          const rectY = Math.min(yMean, yZero);
          const rectH = Math.abs(yZero - yMean);
          add('rect',{ x: x0, y: rectY, width: boxW, height: Math.max(1, rectH), fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
          if(hasSpread){
            const ySdTop = y2px(mean + sd);
            const cap = Math.max(6, boxW * 0.4);
            if(errorMode === 'both'){
              const ySdBottom = y2px(mean - sd);
              add('line',{ x1: cx, y1: ySdTop, x2: cx, y2: ySdBottom, stroke: borderColor, 'stroke-width': errorBarWidthPx });
              add('line',{ x1: cx - cap / 2, y1: ySdBottom, x2: cx + cap / 2, y2: ySdBottom, stroke: borderColor, 'stroke-width': errorBarWidthPx });
            }else{
              add('line',{ x1: cx, y1: ySdTop, x2: cx, y2: yMean, stroke: borderColor, 'stroke-width': errorBarWidthPx });
            }
            add('line',{ x1: cx - cap / 2, y1: ySdTop, x2: cx + cap / 2, y2: ySdTop, stroke: borderColor, 'stroke-width': errorBarWidthPx });
          }else{
            console.debug('Debug: box bar error bar skipped for single value',{ index: i, sampleCount, mean });
          }
        }else if(graphTypeRaw === 'violin'){
          const densityInfo = computeDensity(vals, yScale.min, yScale.max, 80);
          const peak = densityInfo.densities.length ? densityInfo.densities.reduce((max, d) => (d > max ? d : max), 0) : 1;
          const halfWidth = Math.max(6, Math.min(80, localBand * 0.45));
          const pathParts = [];
          for(let idx = 0; idx < densityInfo.positions.length; idx++){
            const pos = densityInfo.positions[idx];
            const density = peak ? densityInfo.densities[idx] / peak : 0;
            const y = y2px(pos);
            const offset = density * halfWidth;
            const xLeft = cx - offset;
            pathParts.push(`${idx === 0 ? 'M' : 'L'} ${xLeft} ${y}`);
          }
          for(let idx = densityInfo.positions.length - 1; idx >= 0; idx--){
            const pos = densityInfo.positions[idx];
            const density = peak ? densityInfo.densities[idx] / peak : 0;
            const y = y2px(pos);
            const offset = density * halfWidth;
            const xRight = cx + offset;
            pathParts.push(`L ${xRight} ${y}`);
          }
          pathParts.push('Z');
          add('path',{ d: pathParts.join(' '), fill: fillColor, 'fill-opacity': 0.7, stroke: borderColor, 'stroke-width': borderWidthPx });
          add('line',{ x1: cx - halfWidth, y1: yMed, x2: cx + halfWidth, y2: yMed, stroke: borderColor, 'stroke-width': borderWidthPx });
          console.debug('Debug: box violin vertical render',{ index: i, points: vals.length, peak, halfWidth });
        }else if(graphTypeRaw === 'strip'){
          const pointEntries = vals.map((value, idx)=>({ index: idx, coord: y2px(value), raw: value }));
          const swarm = computeSwarmOffsets(pointEntries, {
            axisSpacing: localBand,
            pointRadius,
            sampleSize: vals.length,
            orientation: 'vertical'
          });
          const frag = document.createDocumentFragment();
          pointEntries.forEach(entry => {
            const offset = swarm.offsets[entry.index] || 0;
            const circle = document.createElementNS(NS, 'circle');
            circle.setAttribute('cx', cx + offset);
            circle.setAttribute('cy', entry.coord);
            circle.setAttribute('r', pointRadius);
            circle.setAttribute('fill', fillColor);
            circle.setAttribute('stroke', borderColor);
            circle.setAttribute('fill-opacity', 0.7);
            frag.appendChild(circle);
          });
          const stripGroup = add('g',{ 'data-trace': i, 'data-individual': 'true' });
          stripGroup.appendChild(frag);
          if(individualSummaryMode !== 'none'){
            const summaryGroup = add('g',{ 'data-trace': i, 'data-summary': individualSummaryMode });
            const summaryCap = Math.max(6, localBand * 0.12);
            const summaryAdd = (tag, attrs) => {
              const node = document.createElementNS(NS, tag);
              for(const [key, value] of Object.entries(attrs)){
                node.setAttribute(key, String(value));
              }
              summaryGroup.appendChild(node);
              return node;
            };
            if(individualSummaryMode === 'mean'){
              const sampleCount = vals.length;
              const variance = sampleCount > 1 ? vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (sampleCount - 1) : 0;
              const sd = Math.sqrt(Math.max(variance, 0));
              const sem = sampleCount > 0 ? sd / Math.sqrt(sampleCount) : 0;
              if(sampleCount > 1){
                const yTop = y2px(mean + sem);
                const yBottom = y2px(mean - sem);
                summaryAdd('line',{ x1: cx, y1: yTop, x2: cx, y2: yBottom, stroke: borderColor, 'stroke-width': errorBarWidthPx });
                summaryAdd('line',{ x1: cx - summaryCap / 2, y1: yTop, x2: cx + summaryCap / 2, y2: yTop, stroke: borderColor, 'stroke-width': errorBarWidthPx });
                summaryAdd('line',{ x1: cx - summaryCap / 2, y1: yBottom, x2: cx + summaryCap / 2, y2: yBottom, stroke: borderColor, 'stroke-width': errorBarWidthPx });
                console.debug('Debug: box individual summary vertical mean',{ index: i, sampleCount, sd, sem });
              }else{
                console.debug('Debug: box individual summary vertical mean skipped error bars',{ index: i, sampleCount, mean });
              }
              summaryAdd('circle',{ cx, cy: yMean, r: pointRadius * 1.4, fill: '#fff', stroke: borderColor, 'stroke-width': borderWidthPx });
            }else if(individualSummaryMode === 'median'){
              summaryAdd('line',{ x1: cx, y1: yQ3, x2: cx, y2: yQ1, stroke: borderColor, 'stroke-width': borderWidthPx });
              summaryAdd('line',{ x1: cx - summaryCap / 2, y1: yQ3, x2: cx + summaryCap / 2, y2: yQ3, stroke: borderColor, 'stroke-width': borderWidthPx });
              summaryAdd('line',{ x1: cx - summaryCap / 2, y1: yQ1, x2: cx + summaryCap / 2, y2: yQ1, stroke: borderColor, 'stroke-width': borderWidthPx });
              summaryAdd('line',{ x1: cx - summaryCap / 2, y1: yMed, x2: cx + summaryCap / 2, y2: yMed, stroke: borderColor, 'stroke-width': borderWidthPx });
              summaryAdd('circle',{ cx, cy: yMed, r: pointRadius * 1.2, fill: '#fff', stroke: borderColor, 'stroke-width': borderWidthPx });
              console.debug('Debug: box individual summary vertical median',{ index: i, q1, q3 });
            }
          }
          console.debug('Debug: box individual vertical render',{ index: i, mean, maxOffsetUsed: swarm.maxOffsetUsed, spreadFactor: swarm.spreadFactor, pointCount: vals.length });
        }
        if(pointMode !== 'none' && graphTypeRaw !== 'strip'){
          console.time(`boxplotPoints_${token}_${i}`);
          const frag = document.createDocumentFragment();
          let ptIdx = 0;
          if(pointMode === 'outliers'){
            for(const v of outliers){
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', cx);
              c.setAttribute('cy', y2px(v));
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0){
                console.log('boxplot outlier progress',{ index: i, ptIdx, token });
              }
            }
          }else{
            for(const v of vals){
              const cy = y2px(v);
              let px;
              if(pointMode === 'overlay'){
                px = cx + (Math.random() - 0.5) * boxW * 0.6;
              }else{
                px = x0 - boxW * 0.3 + (Math.random() - 0.5) * boxW * 0.2;
              }
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', px);
              c.setAttribute('cy', cy);
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              if(pointMode === 'overlay'){
                c.setAttribute('fill-opacity', 0.6);
              }
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0){
                console.log('boxplot point progress',{ index: i, ptIdx, token });
              }
            }
          }
          add('g',{ 'data-trace': i }).appendChild(frag);
          console.timeEnd(`boxplotPoints_${token}_${i}`);
        }
      }
      const traceCenter = idx => {
        const trace = traces[idx];
        if(trace){
          return xCenter(trace, idx);
        }
        return marginLocal.left + (idx + 0.5) * bandW;
      };
      return {
        margin: marginLocal,
        plotW: plotWLocal,
        plotH: plotHLocal,
        categoryCenter: traceCenter,
        valueToCoord: y2px,
        titleX: marginLocal.left + plotWLocal / 2,
        titleY: marginLocal.top / 2
      };
    }

    function renderHorizontal(){
      const tickFont = chartStyle.makeFont(fs);
      const axisLabelFont = chartStyle.makeFont(fs);
      const categoryWidths = labelTexts.map(lbl => chartStyle.measureText(lbl, axisLabelFont));
      const maxCategoryWidth = Math.max(...categoryWidths, 0);
      const tickLen = axisMetrics.tickLength;
      const tickGap = axisMetrics.tickLabelGap;
      const rightExtra = showSignificance && maxLevelEstimate ? (annotationBaseOffset + maxLevelEstimate * annotationLevelGap) : 0;
      let marginLocal = chartStyle.computeBaseMargins({ fontSize: fs, maxYLabelWidth: maxCategoryWidth, yTitleWidth: 0, axisMetrics, legendWidth: legendWidthForMargin });
      marginLocal.top = Math.max(marginLocal.top, fs * 2);
      marginLocal.left = Math.max(marginLocal.left, maxCategoryWidth + tickLen + tickGap + fs * 0.5);
      marginLocal.right = Math.max(marginLocal.right, rightExtra + fs);
      marginLocal.bottom = Math.max(marginLocal.bottom, tickLen + tickGap + fs + axisMetrics.axisTitleGap + fs);
      let plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
      let plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
      const xIntervalSetting = getAxisTickInterval('x');
      let yScale = niceScale(ymin, ymax, chartStyle.estimateTickCount(Math.max(plotWLocal, 40), { axis: 'x', fallback: 6 }));
      if(xIntervalSetting){
        const manual = buildManualTicks(ymin, ymax, xIntervalSetting);
        if(manual){
          yScale = manual;
          console.debug('Debug: box x-axis manual override',{ step: manual.step, tickCount: manual.ticks.length });
        }
      }
      const valueRange = yScale.max - yScale.min || 1;
      const valueToX = v => marginLocal.left + ((v - yScale.min) / valueRange) * plotWLocal;
      const axisCount = Math.max(axisLabels.length, 1);
      const bandH = plotHLocal / axisCount;
      const groupCountLocal = isGroupedMode ? Math.max(1, groupedGroups.length) : 1;
      const clusterGap = isGroupedMode ? Math.min(bandH * 0.25, 16) : 0;
      let perGroupBand = isGroupedMode ? (bandH - clusterGap) / groupCountLocal : bandH;
      if(!Number.isFinite(perGroupBand) || perGroupBand <= 0){
        perGroupBand = bandH / Math.max(groupCountLocal, 1);
      }
      const groupOffset = isGroupedMode ? (bandH - perGroupBand * groupCountLocal) / 2 : 0;
      const boxHeightForTrace = () => Math.max(6, Math.min(60, perGroupBand * 0.6));
      const localBandHeightForTrace = () => (isGroupedMode ? perGroupBand : bandH);
      const categoryCenter = (trace, traceIndex) => {
        if(isGroupedMode){
          const categoryIdx = Number.isFinite(trace?.categoryIndex) ? trace.categoryIndex : traceIndex;
          const groupIdx = Number.isFinite(trace?.groupIndex) ? trace.groupIndex : 0;
          const top = marginLocal.top + categoryIdx * bandH + groupOffset;
          return top + (groupIdx + 0.5) * perGroupBand;
        }
        return marginLocal.top + (traceIndex + 0.5) * bandH;
      };
      if(showGrid){
        yScale.ticks.forEach(t => {
          const x = valueToX(t);
          add('line',{ x1: x, y1: marginLocal.top, x2: x, y2: marginLocal.top + plotHLocal, stroke: '#ddd', 'stroke-width': gridStrokeWidth });
        });
        console.debug('Debug: box grid stroke scaled',{ vertical: yScale.ticks.length, gridStrokeWidth });
      }
      const yAxisLeft = marginLocal.left;
      const xAxisBottom = marginLocal.top + plotHLocal;
      const yAxisLine = add('line',{ x1: yAxisLeft, y1: marginLocal.top, x2: yAxisLeft, y2: xAxisBottom, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
      }
      const yIntervalSetting = getAxisTickInterval('y');
      const yInterval = Number.isFinite(yIntervalSetting) && yIntervalSetting > 1 ? Math.max(1, Math.round(yIntervalSetting)) : null;
      let renderedYTicks = 0;
      axisLabels.forEach((lab, i) => {
        if(yInterval && i % yInterval !== 0){
          return;
        }
        const y = marginLocal.top + (i + 0.5) * bandH;
        add('line',{ x1: yAxisLeft, y1: y, x2: yAxisLeft - tickLen, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const labelText = lab || `Category ${i + 1}`;
        const t = add('text',{ x: yAxisLeft - (tickLen + tickGap), y, 'font-size': fs, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: chartStyle.TEXT_COLOR });
        t.textContent = labelText;
        if(isGroupedMode){
          t.style.cursor = 'default';
        }else{
          t.style.cursor = 'ns-resize';
          enableVerticalLabelDrag(t, i);
        }
        renderedYTicks += 1;
      });
      if(yInterval && axisLabels.length){
        console.debug('Debug: box y-axis tick filter',{ interval: yInterval, rendered: renderedYTicks, total: axisLabels.length });
      }
      yScale.ticks.forEach(t => {
        const x = valueToX(t);
        add('line',{ x1: x, y1: xAxisBottom, x2: x, y2: xAxisBottom + tickLen, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const txt = add('text',{ x, y: xAxisBottom + tickLen + tickGap, 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'hanging', fill: chartStyle.TEXT_COLOR });
        txt.textContent = formatTick(logScale ? Math.pow(10, t) : t);
      });
      const xAxisLine = add('line',{ x1: yAxisLeft, y1: xAxisBottom, x2: marginLocal.left + plotWLocal, y2: xAxisBottom, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
      }
      if(showFrame){
        chartStyle.drawPlotFrame({ svg, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, sides: ['top', 'right'] });
      }
      const xLabel = add('text',{ x: marginLocal.left + plotWLocal / 2, y: xAxisBottom + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.8, 'text-anchor': 'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR });
      xLabel.textContent = state.yLabelText;
      makeEditable(xLabel, txt => { state.yLabelText = txt; });
      function enableVerticalLabelDrag(t, idx){
        if(isGroupedMode){
          return;
        }
        t.addEventListener('mousedown', e => {
          e.preventDefault();
          const svgRect = svg.getBoundingClientRect();
          const onMove = ev => {
            const svgY = ev.clientY - svgRect.top;
            t.setAttribute('y', svgY);
          };
          const onUp = ev => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const svgY = ev.clientY - svgRect.top;
            let targetIdx = Math.floor((svgY - marginLocal.top) / bandH);
            targetIdx = Math.max(0, Math.min(axisLabels.length - 1, targetIdx));
            if(targetIdx !== idx){
              const moved = state.colOrder.splice(idx, 1)[0];
              state.colOrder.splice(targetIdx, 0, moved);
            }
            console.log('boxplot label drag end',{ from: idx, to: targetIdx, orientation: 'vertical-axis' });
            state.scheduleDraw();
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
      for(let i = 0; i < traces.length; i++){
        if(token !== state.drawToken){
          console.log('boxplot draw cancelled during render loop',{ token });
          return null;
        }
        const t = traces[i];
        const vals = [...t.y].sort((a, b) => a - b);
        if(!vals.length) continue;
        const cy = categoryCenter(t, i);
        const localBand = localBandHeightForTrace();
        const boxH = Math.max(6, Math.min(60, localBand * 0.6));
        const y0 = cy - boxH / 2;
        const y1 = cy + boxH / 2;
        const q1 = percentile(vals, 0.25);
        const med = percentile(vals, 0.5);
        const q3 = percentile(vals, 0.75);
        const iqr = q3 - q1;
        const lowerFence = q1 - 1.5 * iqr;
        const upperFence = q3 + 1.5 * iqr;
        const outliers = [];
        let wMin = Infinity;
        let wMax = -Infinity;
        let valIdx = 0;
        for(const v of vals){
          if(v < lowerFence || v > upperFence){
            outliers.push(v);
          }else{
            if(v < wMin) wMin = v;
            if(v > wMax) wMax = v;
          }
          valIdx++;
          if(valIdx % 10000 === 0){
            console.log('boxplot fence progress',{ index: i, valIdx, token, orientation: 'horizontal' });
          }
        }
        if(wMin === Infinity){
          wMin = vals[0];
          wMax = vals[vals.length - 1];
        }
        const xQ1 = valueToX(q1);
        const xMed = valueToX(med);
        const xQ3 = valueToX(q3);
        const xWMin = valueToX(wMin);
        const xWMax = valueToX(wMax);
        const fillColor = t.fillColor || resolveTraceColor(t, i).fillColor;
        const borderColor = t.borderColor || resolveTraceColor(t, i).borderColor;
        const mean = t.y.reduce((acc, v) => acc + v, 0) / t.y.length;
        const xMean = valueToX(mean);
        if(graphTypeRaw === 'box' || graphTypeRaw === 'notched'){
          const left = Math.min(xQ1, xQ3);
          const right = Math.max(xQ1, xQ3);
          if(graphTypeRaw === 'box'){
            add('rect',{ x: left, y: y0, width: Math.max(1, right - left), height: Math.max(1, boxH), fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: xMed, y1: y0, x2: xMed, y2: y1, stroke: borderColor, 'stroke-width': borderWidthPx });
          }else{
            const notchSpan = 1.57 * (iqr) / Math.sqrt(vals.length);
            let notchLower = Math.max(q1, med - notchSpan);
            let notchUpper = Math.min(q3, med + notchSpan);
            if(notchLower > notchUpper){
              const mid = (notchLower + notchUpper) / 2;
              notchLower = notchUpper = mid;
            }
            const xNotchLow = valueToX(notchLower);
            const xNotchHigh = valueToX(notchUpper);
            const notchDepth = boxH * 0.4;
            const notchHalf = notchDepth / 2;
            let yNotchTop = cy - notchHalf;
            let yNotchBottom = cy + notchHalf;
            if(yNotchTop < y0) yNotchTop = y0;
            if(yNotchBottom > y1) yNotchBottom = y1;
            if(yNotchTop > yNotchBottom){
              const mid = (yNotchTop + yNotchBottom) / 2;
              yNotchTop = yNotchBottom = mid;
            }
            const d = [
              `M ${left} ${y0}`,
              `L ${xNotchLow} ${y0}`,
              `L ${xMed} ${yNotchTop}`,
              `L ${xNotchHigh} ${y0}`,
              `L ${right} ${y0}`,
              `L ${right} ${y1}`,
              `L ${xNotchHigh} ${y1}`,
              `L ${xMed} ${yNotchBottom}`,
              `L ${xNotchLow} ${y1}`,
              `L ${left} ${y1}`,
              'Z'
            ].join(' ');
            add('path',{ d, fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: xMed, y1: yNotchTop, x2: xMed, y2: yNotchBottom, stroke: borderColor, 'stroke-width': borderWidthPx });
            // Debug: log the horizontal notch geometry so future tweaks keep parity with vertical boxes.
            console.debug('Debug: box horizontal notch path',{ notchLower, notchUpper, xNotchLow, xNotchHigh, yNotchTop, yNotchBottom, boxHeight: boxH, token });
          }
          add('line',{ x1: xWMin, y1: cy, x2: left, y2: cy, stroke: borderColor, 'stroke-width': borderWidthPx });
          add('line',{ x1: right, y1: cy, x2: xWMax, y2: cy, stroke: borderColor, 'stroke-width': borderWidthPx });
          if(showCaps){
            const cap = Math.max(6, boxH * 0.4);
            add('line',{ x1: xWMin, y1: cy - cap / 2, x2: xWMin, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': borderWidthPx });
            add('line',{ x1: xWMax, y1: cy - cap / 2, x2: xWMax, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': borderWidthPx });
          }
        }else if(graphTypeRaw === 'bar'){
          const sampleCount = t.y.length;
          const hasSpread = sampleCount > 1;
          const variance = hasSpread ? t.y.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (sampleCount - 1) : 0;
          const sd = hasSpread ? Math.sqrt(Math.max(variance, 0)) : 0;
          const xZero = valueToX(0);
          const rectX = Math.min(xMean, xZero);
          const rectW = Math.max(1, Math.abs(xZero - xMean));
          add('rect',{ x: rectX, y: y0, width: rectW, height: Math.max(1, boxH), fill: fillColor, stroke: borderColor, 'stroke-width': borderWidthPx });
          if(hasSpread){
            const xSdPos = valueToX(mean + sd);
            const cap = Math.max(6, boxH * 0.4);
            if(errorMode === 'both'){
              const xSdNeg = valueToX(mean - sd);
              add('line',{ x1: xSdNeg, y1: cy, x2: xSdPos, y2: cy, stroke: borderColor, 'stroke-width': errorBarWidthPx });
              add('line',{ x1: xSdNeg, y1: cy - cap / 2, x2: xSdNeg, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': errorBarWidthPx });
            }else{
              add('line',{ x1: xMean, y1: cy, x2: xSdPos, y2: cy, stroke: borderColor, 'stroke-width': errorBarWidthPx });
            }
            add('line',{ x1: xSdPos, y1: cy - cap / 2, x2: xSdPos, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': errorBarWidthPx });
          }else{
            console.debug('Debug: box horizontal bar error bar skipped for single value',{ index: i, sampleCount, mean });
          }
        }else if(graphTypeRaw === 'violin'){
          const densityInfo = computeDensity(vals, yScale.min, yScale.max, 80);
          const peak = densityInfo.densities.length ? densityInfo.densities.reduce((max, d) => (d > max ? d : max), 0) : 1;
          const halfHeight = Math.max(6, Math.min(80, localBand * 0.45));
          const pathParts = [];
          for(let idx = 0; idx < densityInfo.positions.length; idx++){
            const pos = densityInfo.positions[idx];
            const density = peak ? densityInfo.densities[idx] / peak : 0;
            const x = valueToX(pos);
            const offset = density * halfHeight;
            const yTop = cy - offset;
            pathParts.push(`${idx === 0 ? 'M' : 'L'} ${x} ${yTop}`);
          }
          for(let idx = densityInfo.positions.length - 1; idx >= 0; idx--){
            const pos = densityInfo.positions[idx];
            const density = peak ? densityInfo.densities[idx] / peak : 0;
            const x = valueToX(pos);
            const offset = density * halfHeight;
            const yBottom = cy + offset;
            pathParts.push(`L ${x} ${yBottom}`);
          }
          pathParts.push('Z');
          add('path',{ d: pathParts.join(' '), fill: fillColor, 'fill-opacity': 0.7, stroke: borderColor, 'stroke-width': borderWidthPx });
          add('line',{ x1: xMed, y1: cy - halfHeight, x2: xMed, y2: cy + halfHeight, stroke: borderColor, 'stroke-width': borderWidthPx });
          console.debug('Debug: box violin horizontal render',{ index: i, points: vals.length, peak, halfHeight });
        }else if(graphTypeRaw === 'strip'){
          const pointEntries = vals.map((value, idx)=>({ index: idx, coord: valueToX(value), raw: value }));
          const swarm = computeSwarmOffsets(pointEntries, {
            axisSpacing: localBand,
            pointRadius,
            sampleSize: vals.length,
            orientation: 'horizontal'
          });
          const frag = document.createDocumentFragment();
          pointEntries.forEach(entry => {
            const offset = swarm.offsets[entry.index] || 0;
            const circle = document.createElementNS(NS, 'circle');
            circle.setAttribute('cx', entry.coord);
            circle.setAttribute('cy', cy + offset);
            circle.setAttribute('r', pointRadius);
            circle.setAttribute('fill', fillColor);
            circle.setAttribute('stroke', borderColor);
            circle.setAttribute('fill-opacity', 0.7);
            frag.appendChild(circle);
          });
          const stripGroup = add('g',{ 'data-trace': i, 'data-individual': 'true' });
          stripGroup.appendChild(frag);
          if(individualSummaryMode !== 'none'){
            const summaryGroup = add('g',{ 'data-trace': i, 'data-summary': individualSummaryMode });
            const summaryCap = Math.max(6, localBand * 0.12);
            const summaryAdd = (tag, attrs) => {
              const node = document.createElementNS(NS, tag);
              for(const [key, value] of Object.entries(attrs)){
                node.setAttribute(key, String(value));
              }
              summaryGroup.appendChild(node);
              return node;
            };
            if(individualSummaryMode === 'mean'){
              const sampleCount = vals.length;
              const variance = sampleCount > 1 ? vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (sampleCount - 1) : 0;
              const sd = Math.sqrt(Math.max(variance, 0));
              const sem = sampleCount > 0 ? sd / Math.sqrt(sampleCount) : 0;
              if(sampleCount > 1){
                const xLow = valueToX(mean - sem);
                const xHigh = valueToX(mean + sem);
                summaryAdd('line',{ x1: xLow, y1: cy, x2: xHigh, y2: cy, stroke: borderColor, 'stroke-width': errorBarWidthPx });
                summaryAdd('line',{ x1: xLow, y1: cy - summaryCap / 2, x2: xLow, y2: cy + summaryCap / 2, stroke: borderColor, 'stroke-width': errorBarWidthPx });
                summaryAdd('line',{ x1: xHigh, y1: cy - summaryCap / 2, x2: xHigh, y2: cy + summaryCap / 2, stroke: borderColor, 'stroke-width': errorBarWidthPx });
                console.debug('Debug: box individual summary horizontal mean',{ index: i, sampleCount, sd, sem });
              }else{
                console.debug('Debug: box individual summary horizontal mean skipped error bars',{ index: i, sampleCount, mean });
              }
              summaryAdd('circle',{ cx: xMean, cy: cy, r: pointRadius * 1.4, fill: '#fff', stroke: borderColor, 'stroke-width': borderWidthPx });
            }else if(individualSummaryMode === 'median'){
              const xLow = valueToX(q1);
              const xHigh = valueToX(q3);
              summaryAdd('line',{ x1: xLow, y1: cy, x2: xHigh, y2: cy, stroke: borderColor, 'stroke-width': borderWidthPx });
              summaryAdd('line',{ x1: xLow, y1: cy - summaryCap / 2, x2: xLow, y2: cy + summaryCap / 2, stroke: borderColor, 'stroke-width': borderWidthPx });
              summaryAdd('line',{ x1: xHigh, y1: cy - summaryCap / 2, x2: xHigh, y2: cy + summaryCap / 2, stroke: borderColor, 'stroke-width': borderWidthPx });
              summaryAdd('line',{ x1: xMed - summaryCap / 2, y1: cy, x2: xMed + summaryCap / 2, y2: cy, stroke: borderColor, 'stroke-width': borderWidthPx });
              summaryAdd('circle',{ cx: xMed, cy: cy, r: pointRadius * 1.2, fill: '#fff', stroke: borderColor, 'stroke-width': borderWidthPx });
              console.debug('Debug: box individual summary horizontal median',{ index: i, q1, q3 });
            }
          }
          console.debug('Debug: box individual horizontal render',{ index: i, mean, maxOffsetUsed: swarm.maxOffsetUsed, spreadFactor: swarm.spreadFactor, pointCount: vals.length });
        }
        if(pointMode !== 'none' && graphTypeRaw !== 'strip'){
          console.time(`boxplotPoints_${token}_${i}`);
          const frag = document.createDocumentFragment();
          let ptIdx = 0;
          if(pointMode === 'outliers'){
            for(const v of outliers){
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', valueToX(v));
              c.setAttribute('cy', cy);
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0){
                console.log('boxplot outlier progress',{ index: i, ptIdx, token, orientation: 'horizontal' });
              }
            }
          }else{
            for(const v of vals){
              const px = valueToX(v);
              let py;
              if(pointMode === 'overlay'){
                py = cy + (Math.random() - 0.5) * boxH * 0.6;
              }else{
                py = y0 - boxH * 0.3 + (Math.random() - 0.5) * boxH * 0.2;
              }
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', px);
              c.setAttribute('cy', py);
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              if(pointMode === 'overlay'){
                c.setAttribute('fill-opacity', 0.6);
              }
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0){
                console.log('boxplot point progress',{ index: i, ptIdx, token, orientation: 'horizontal' });
              }
            }
          }
          add('g',{ 'data-trace': i }).appendChild(frag);
          console.timeEnd(`boxplotPoints_${token}_${i}`);
        }
      }
      const traceCenter = idx => {
        const trace = traces[idx];
        if(trace){
          return categoryCenter(trace, idx);
        }
        return marginLocal.top + (idx + 0.5) * bandH;
      };
      return {
        margin: marginLocal,
        plotW: plotWLocal,
        plotH: plotHLocal,
        categoryCenter: traceCenter,
        valueToCoord: valueToX,
        titleX: marginLocal.left + plotWLocal / 2,
        titleY: marginLocal.top / 2
      };
    }

    const orientationResult = isFlipped ? renderHorizontal() : renderVertical();
    if(!orientationResult){
      ensureGraphViewport(svg, { padding: Math.max(fs || 14, 16), debugLabel: 'box-graph' });
      return;
    }
    if(token !== state.drawToken){
      console.log('boxplot draw cancelled before finalize',{ token });
      return;
    }
    const titleText = add('text',{ x: orientationResult.titleX, y: orientationResult.titleY, 'text-anchor': 'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR });
    titleText.textContent = state.titleText;
    markFontEditable(titleText,'graphTitle','graphTitle');
    makeEditable(titleText, txt => { state.titleText = txt; });
    if(legendRenderer.entries.length){
      const plotRight = orientationResult.margin.left + orientationResult.plotW;
      const legendX = plotRight + legendGapPx;
      legendRenderer.draw(svg, { x: legendX, y: orientationResult.margin.top });
      console.debug('Debug: box legend rendered shared helper',{ legendX, legendGapPx, entryCount: legendRenderer.entries.length });
    }
    const helpers = {
      xCenter: orientationResult.categoryCenter,
      categoryCenter: orientationResult.categoryCenter,
      y2px: orientationResult.valueToCoord,
      valueToCoord: orientationResult.valueToCoord,
      annotationStyle,
      significance: { enabled: showSignificance }
    };
    console.debug('Debug: box annotation style forwarded', { annotationStyle: helpers.annotationStyle, significance: helpers.significance });
    computeStats(traces, svg, helpers);
    renderStatsTable(traces);
    const otherBoxes = Array.from(svg.children).filter(el => el !== titleText && el.getBBox).map(el => el.getBBox());
    if(otherBoxes.length){
      const topMost = Math.min(...otherBoxes.map(b => b.y));
      const spacing = fs + 4;
      const newY = Math.max(spacing, topMost - spacing);
      titleText.setAttribute('y', newY);
    }
    ensureGraphViewport(svg, { padding: Math.max(fs || 14, 16), debugLabel: 'box-graph' });
    console.log('boxplot render complete');
  }
  // PART: SAVE_OPEN
  function getPayload(){
    const selectedColumns = Array.from(state.selectedCols || [])
      .map(idx => Number(idx))
      .filter(idx => Number.isInteger(idx));
    selectedColumns.sort((a,b)=>a-b);
    const axisSnapshot = ensureAxisSettings();
    const payload = {
      type:'box',
      version:3,
      data: state.hot.getData(),
      exclusions: state.hot?.exportExclusions?.() || Shared.hot.exportExclusions(state.hot),
      config: {
        title:state.titleText,
        yLabel:state.yLabelText,
        colorMode:els.boxColorUnified.checked?'unified':'individual',
        fill:els.boxFill.value,
        border:els.boxBorder.value,
        borderWidth:els.boxBorderWidth.value,
        errorBarWidth:els.boxErrorBarWidth?.value ?? els.boxBorderWidth.value,
        fontSize:els.boxFontSize.value,
        showGrid:els.boxShowGrid.checked,
        showFrame:!!els.boxShowFrame?.checked,
        logScale:els.boxLogScale.checked,
        graphType:els.boxGraphType.value,
        individualSummary: state.individualSummary,
        pointMode:els.boxPointMode.value,
        showCaps:els.boxShowCaps.checked,
        showSignificanceBars: state.showSignificanceBars,
        errorMode:els.boxErrorMode.value,
        colors:[...state.fillColors],
        borderColors:[...state.borderColors],
        yMin:els.boxYMin.value,
        yMax:els.boxYMax.value,
        flipAxes: state.flipAxes,
        tableFormat: state.tableFormat,
        grouped: {
          replicatesPerGroup: state.grouped?.replicatesPerGroup,
          groups: Array.isArray(state.grouped?.groups) ? [...state.grouped.groups] : []
        },
        axis: {
          strokeWidth: axisSnapshot.strokeWidth,
          color: axisSnapshot.color,
          tickInterval: {
            x: axisSnapshot.x?.tickInterval ?? null,
            y: axisSnapshot.y?.tickInterval ?? null
          }
        },
        stats: {
          test: state.statsTest,
          paired: state.statsPaired,
          mode: state.statsMode,
          referenceIndex: state.statsRef,
          pairsText: state.statsPairsText,
          postHoc: state.statsPostHoc,
          correction: state.statsCorrection,
          effectParametric: state.statsEffectParametric,
          effectNonParametric: state.statsEffectNonParametric,
          groupedAnalysis: state.groupedStats?.analysis,
          selectedColumns,
          assumptions: serializeAssumptions(state.assumptionDiagnostics)
        }
      }
    };
    console.debug('Debug: box.getPayload captured state', {
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      colorMode: payload.config.colorMode,
      statsTest: payload.config.stats?.test,
      statsMode: payload.config.stats?.mode,
      statsPostHoc: payload.config.stats?.postHoc,
      statsCorrection: payload.config.stats?.correction,
      effectParametric: payload.config.stats?.effectParametric,
      effectNonParametric: payload.config.stats?.effectNonParametric,
      statsSelection: payload.config.stats?.selectedColumns?.length || 0,
      assumptionWarnings: payload.config.stats?.assumptions?.warnings?.length || 0
    });
    return payload;
  }
  box.getPayload = getPayload;
  box.save = async function(){
    console.debug('Debug: box.save invoked', { hasHandle: !!state.fileHandle });
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('box.save missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'box',
      fileHandle: state.fileHandle,
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: box.save result', result);
  };
  box.saveAs = async function(){
    console.debug('Debug: box.saveAs invoked', { currentName: state.fileName });
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('box.saveAs missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'box',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: box.saveAs result', result);
  };
  box.open = async function(){
    console.debug('Debug: box.open invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('box.open missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'box',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: file => box.loadFromFile(file),
      triggerInput: () => {
        const input = global.document.getElementById('boxGraphFile');
        if(input){
          input.value='';
          input.click();
        }
      }
    });
    console.debug('Debug: box.open result', result);
  };
  box.loadFromFile = function(file){
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const obj=JSON.parse(e.target.result);
        const version=Number.isFinite(obj?.version)?Number(obj.version):Number(obj?.version)||Number(obj?.configVersion)||1;
        console.log('loadBoxGraph',obj);
        console.debug('Debug: box.loadFromFile version parse',{ version, hasStats:!!obj?.config?.stats, hasEffectOptions:!!obj?.config?.stats?.effectParametric });
        if(obj.type!=='box') throw new Error('Invalid graph type');
        state.hot.loadData(obj.data||[]);
        if(obj.exclusions){
          state.hot.applyExclusions?.(obj.exclusions);
        }
        const c=obj.config||{};
        state.titleText=c.title||state.titleText;
        state.yLabelText=c.yLabel||state.yLabelText;
        els.boxFill.value=c.fill||els.boxFill.value;
        els.boxBorder.value=c.border||els.boxBorder.value;
        els.boxBorderWidth.value=c.borderWidth||els.boxBorderWidth.value;
        if(els.boxErrorBarWidth){
          if(c.errorBarWidth != null){
            els.boxErrorBarWidth.value = c.errorBarWidth;
          }else if(!els.boxErrorBarWidth.value){
            els.boxErrorBarWidth.value = els.boxBorderWidth.value;
          }
        }
        els.boxFontSize.value=c.fontSize||els.boxFontSize.value;
        if(els.boxFontSize.dataset){
          els.boxFontSize.dataset.fontBasePt = String(els.boxFontSize.value);
          console.debug('Debug: box font size base restored',{ value: els.boxFontSize.value }); // Debug: restore base from file
        }
        chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: Number(els.boxFontSize.value), input: els.boxFontSize, manual: true });
        els.boxShowGrid.checked=!!c.showGrid;
        if(els.boxShowFrame) els.boxShowFrame.checked=!!c.showFrame;
        els.boxLogScale.checked=!!c.logScale;
        els.boxGraphType.value=c.graphType||els.boxGraphType.value;
        const allowedSummaries = new Set(['mean','median','none']);
        if(typeof c.individualSummary === 'string' && allowedSummaries.has(c.individualSummary)){
          state.individualSummary = c.individualSummary;
        }else if(!allowedSummaries.has(state.individualSummary)){
          state.individualSummary = 'mean';
        }
        if(els.boxIndividualSummary){
          const summaryValue = allowedSummaries.has(state.individualSummary) ? state.individualSummary : 'mean';
          els.boxIndividualSummary.value = summaryValue;
        }
        els.boxPointMode.value=c.pointMode||els.boxPointMode.value;
        els.boxShowCaps.checked=!!c.showCaps;
        state.showSignificanceBars = !!c.showSignificanceBars;
        if(els.boxShowSignificance){
          els.boxShowSignificance.checked = state.showSignificanceBars;
        }
        els.boxErrorMode.value=c.errorMode||els.boxErrorMode.value;
        const graphTypeValue = els.boxGraphType.value;
        if(els.boxErrorModeCtl){
          els.boxErrorModeCtl.style.display = graphTypeValue==='bar'?'':'none';
        }
        if(els.boxErrorBarWidthCtl){
          const showErrorThickness = graphTypeValue==='bar' || graphTypeValue==='strip';
          els.boxErrorBarWidthCtl.style.display = showErrorThickness ? '' : 'none';
        }
        if(els.boxIndividualSummaryCtl){
          els.boxIndividualSummaryCtl.style.display = graphTypeValue==='strip' ? '' : 'none';
        }
        state.fillColors=c.colors||[];
        state.borderColors=c.borderColors||[];
        if(c.colorMode==='individual'){ els.boxColorIndividual.checked=true; } else { els.boxColorUnified.checked=true; }
        toggleColorMode();
        const restoredFormat = c.tableFormat === 'grouped' ? 'grouped' : 'single';
        if(c.grouped && typeof c.grouped === 'object'){
          const groupCfg = c.grouped;
          const repValue = Number(groupCfg.replicatesPerGroup);
          if(Number.isFinite(repValue) && repValue >= 1){
            state.grouped.replicatesPerGroup = Math.round(repValue);
          }
          if(Array.isArray(groupCfg.groups) && groupCfg.groups.length){
            state.grouped.groups = groupCfg.groups.map((name, idx)=>{
              const trimmed = typeof name === 'string' ? name.trim() : '';
              return trimmed || `Group ${idx + 1}`;
            });
          }
        }
        setTableFormat(restoredFormat, { skipColorSwitch: true, skipDraw: true });
        els.boxYMin.value=c.yMin||'';
        els.boxYMax.value=c.yMax||'';
        state.flipAxes=!!c.flipAxes;
        if(els.boxFlipAxes){ els.boxFlipAxes.checked=state.flipAxes; }
        if(c.axis && typeof c.axis === 'object'){
          const axisCfg = c.axis;
          const axisState = ensureAxisSettings();
          if(axisCfg.strokeWidth !== undefined){
            const numeric = Number(axisCfg.strokeWidth);
            axisState.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
          }
          if(typeof axisCfg.color === 'string' && axisCfg.color.trim()){
            axisState.color = axisCfg.color;
          } else {
            axisState.color = DEFAULT_AXIS_COLOR;
          }
          const tickCfg = axisCfg.tickInterval || {};
          const tickX = tickCfg.x;
          const tickY = tickCfg.y;
          axisState.x.tickInterval = Number.isFinite(Number(tickX)) && Number(tickX) > 0 ? Math.max(1, Math.round(Number(tickX))) : null;
          axisState.y.tickInterval = Number.isFinite(Number(tickY)) && Number(tickY) > 0 ? Number(tickY) : null;
          console.debug('Debug: box axis settings restored from file',{
            strokeWidth: axisState.strokeWidth,
            color: axisState.color,
            tickIntervalX: axisState.x.tickInterval,
            tickIntervalY: axisState.y.tickInterval
          });
        } else {
          state.axisSettings = createDefaultAxisSettings();
          console.debug('Debug: box axis settings reset to default from file');
        }
        const statsAnalysis = state.hot?.getAnalysisData?.() || Shared.hot.getAnalysisData(state.hot);
        const labels=(statsAnalysis.data?.[0] || []).map(value=>value === null ? '' : value);
        const labelCount=labels.length;
        const statsConfig=c.stats||{};
        state.statsTest=statsConfig.test==='nonparametric'?'nonparametric':'parametric';
        state.statsPaired=!!statsConfig.paired;
        const allowedModes=new Set(['all','reference','custom']);
        state.statsMode=allowedModes.has(statsConfig.mode)?statsConfig.mode:'all';
        state.statsCorrection=ensureValidCorrectionValue(statsConfig.correction || state.statsCorrection);
        state.statsEffectParametric=ensureValidEffectOption('parametric',statsConfig.effectParametric || state.statsEffectParametric);
        state.statsEffectNonParametric=ensureValidEffectOption('nonparametric',statsConfig.effectNonParametric || state.statsEffectNonParametric);
        const candidateRef=Number(statsConfig.referenceIndex);
        const maxIndex=labelCount>0?labelCount-1:-1;
        if(Number.isInteger(candidateRef) && candidateRef>=0 && (maxIndex>=0?candidateRef<=maxIndex:true)){
          state.statsRef=candidateRef;
        }else if(maxIndex>=0 && state.statsRef>maxIndex){
          state.statsRef=maxIndex;
        }else if(!Number.isInteger(state.statsRef) || state.statsRef<0){
          state.statsRef=0;
        }
        if(typeof statsConfig.pairsText==='string'){
          state.statsPairsText=statsConfig.pairsText;
        }else if(typeof state.statsPairsText!=='string'){
          state.statsPairsText='';
        }
        ensureGroupedStatsDefaults();
        const allowedGroupedAnalyses=new Set(['twoWayAnova','twoWayMixed','threeWayAnova','threeWayMixed','rowTTests']);
        if(typeof statsConfig.groupedAnalysis==='string' && allowedGroupedAnalyses.has(statsConfig.groupedAnalysis)){
          state.groupedStats.analysis=statsConfig.groupedAnalysis;
        }else if(!allowedGroupedAnalyses.has(state.groupedStats.analysis)){
          state.groupedStats.analysis='twoWayAnova';
        }
        const selectedFromFile=Array.isArray(statsConfig.selectedColumns)
          ? statsConfig.selectedColumns
              .map(idx=>Number(idx))
              .filter(idx=>Number.isInteger(idx) && idx>=0 && (maxIndex>=0?idx<=maxIndex:true))
          : [];
        state.selectedCols=new Set(selectedFromFile);
        if(state.statsMode==='reference' && !state.selectedCols.has(state.statsRef)){
          state.selectedCols.add(state.statsRef);
        }
        const postHocContextOnLoad={
          mode: state.statsMode,
          test: state.statsTest,
          paired: state.statsPaired,
          groupCount: state.selectedCols.size || labels.filter(l=>l!=null && l!=='').length
        };
        const restoredPostHoc=ensureValidPostHoc(statsConfig.postHoc || state.statsPostHoc,postHocContextOnLoad);
        if(restoredPostHoc!==state.statsPostHoc){
          console.debug('Debug: box statsPostHoc restored',{ before:state.statsPostHoc, after:restoredPostHoc, context:postHocContextOnLoad });
          state.statsPostHoc=restoredPostHoc;
        }
        state.statsCustomPairs=[];
        if(statsConfig.assumptions){
          const restoredAssumptions={
            ...statsConfig.assumptions,
            groups:Array.isArray(statsConfig.assumptions.groups)
              ? statsConfig.assumptions.groups.map(group=>({ ...group }))
              : [],
            variance:statsConfig.assumptions.variance
              ? { ...statsConfig.assumptions.variance }
              : null,
            warnings:Array.isArray(statsConfig.assumptions.warnings)
              ? statsConfig.assumptions.warnings.slice()
              : []
          };
          state.assumptionDiagnostics=restoredAssumptions;
          console.debug('Debug: box assumption diagnostics restored',{ warningCount: restoredAssumptions.warnings.length });
        }else{
          state.assumptionDiagnostics=null;
          console.debug('Debug: box assumption diagnostics cleared on load');
        }
        console.debug('Debug: box stats config restored', {
          statsTest: state.statsTest,
          statsMode: state.statsMode,
          statsPaired: state.statsPaired,
          statsRef: state.statsRef,
          statsPostHoc: state.statsPostHoc,
          statsCorrection: state.statsCorrection,
          statsEffectParametric: state.statsEffectParametric,
          statsEffectNonParametric: state.statsEffectNonParametric,
          selectedCount: state.selectedCols.size,
          hasPairsText: !!state.statsPairsText
        });
        const colorPickerRestoreLabels = state.tableFormat === 'grouped'
          ? (ensureGroupedDefaults(), state.grouped.groups.map((name, idx)=>{ const trimmed = typeof name === 'string' ? name.trim() : ''; return trimmed || `Group ${idx + 1}`; }))
          : labels;
        console.debug('Debug: box restore color labels',{ tableFormat: state.tableFormat, labelCount: colorPickerRestoreLabels.length });
        if(els.boxColorIndividual.checked){ updateBoxColorPickers(colorPickerRestoreLabels, { grouped: state.tableFormat === 'grouped' }); } else { els.boxColorPerBox.innerHTML=''; }
        state.scheduleDraw();
      }catch(err){
        console.error('loadBoxGraph error',err);
      }
    };
    reader.readAsText(file);
  };

  box.init = function init(){
    if (box.ready) { console.debug('Debug: Components.box.init skipped'); return; }
    console.debug('Debug: Components.box.init');
    // Will be filled by placeholders
    // cache elements, ensure styles, set up resizers, hot, ui, and schedule
    if (typeof cacheEls === 'function') cacheEls();
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'box',
      selectors: {
        tablePanel: '#boxTablePanel',
        graphPanel: '#boxGraphPanel',
        panelResizer: '#boxPanelResizer',
        hotWrapper: '#hotWrapper',
        hotContainer: '#hot',
        svgBox: () => els.graphPanel?.querySelector('.svgbox'),
        resizeTarget: () => els.plotDiv?.closest('.svgbox') || els.graphPanel?.querySelector('.svgbox')
      },
      scheduleDraw: state.scheduleDraw,
      onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        console.debug('Debug: box layout min width update', { value: state.minSvgWidth });
      }
    });
    if(state.layout?.elements?.svgBox){
      els.svgBox = state.layout.elements.svgBox;
    }
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    state.layout?.syncPanels?.();
    if (typeof initHot === 'function') initHot();
    if (typeof initUI === 'function') initUI();
    state.scheduleDraw = Shared.debounceFrame(draw);
    console.debug('Debug: box scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    box.ready = true;
    try{ state.scheduleDraw(); } catch(e){ console.error('box init initial draw error', e); }
  };

  box.draw = function(){ try{ if (typeof draw === 'function') draw(); } catch(e){ console.error('box.draw error', e); } };
  box.ensure = function(){ if(!box.ready) box.init(); };
  box.getAdvisorRecommendation = function(answers,context){
    return computeAdvisorRecommendation(answers || {}, context || {});
  };
  box.__getState = function(){
    console.debug('Debug: box.__getState invoked');
    return state;
  };
})(window);

