(function initScatterLabelModel(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.scatterLabelModel = Shared.scatterLabelModel || {};

  function summarizeScatterLabelDistribution(labels){
    const source = Array.isArray(labels) ? labels : [];
    const summary = {
      totalPoints: source.length,
      labeledPointCount: 0,
      labelCount: 0,
      pureUnique: false,
      averageFrequency: 0,
      rareLabels: false,
      pointFormatCount: 0,
      singlePointFormat: false,
      shouldUseUniform: false
    };
    if(!source.length){
      return summary;
    }
    const counts = new Map();
    source.forEach(rawLabel => {
      const label = rawLabel == null ? '' : String(rawLabel).trim();
      if(!label){ return; }
      summary.labeledPointCount += 1;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    summary.labelCount = counts.size;
    if(!summary.labelCount || !summary.labeledPointCount){
      return summary;
    }
    summary.pureUnique = summary.labeledPointCount === summary.totalPoints
      && summary.labelCount === summary.totalPoints
      && Array.from(counts.values()).every(count => count === 1);
    summary.averageFrequency = (summary.labeledPointCount / summary.labelCount) / summary.totalPoints;
    const hasUnlabeledPoints = summary.labeledPointCount < summary.totalPoints;
    summary.pointFormatCount = summary.labelCount + (hasUnlabeledPoints ? 1 : 0);
    summary.rareLabels = summary.averageFrequency < 0.05;
    summary.singlePointFormat = summary.pureUnique || summary.pointFormatCount <= 1 || summary.rareLabels;
    summary.shouldUseUniform = summary.singlePointFormat;
    return summary;
  }

  namespace.summarizeScatterLabelDistribution = summarizeScatterLabelDistribution;
  if(typeof module !== 'undefined' && module.exports){
    module.exports = namespace;
  }
})(typeof window !== 'undefined' ? window : globalThis);
