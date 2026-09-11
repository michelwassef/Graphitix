'use strict';

// Test metadata only. This catalog describes how a test may address a
// component; it is never a source of application/session state.
const { COMPONENT_MUTATION_CATALOG } = require('./componentMutationCatalog.js');

const COMPONENT_CATALOG = [
  {
    type: 'venn',
    pageId: 'vennPage',
    exampleButtonId: 'sample',
    geometry: 'venn-upset',
    graphModes: ['venn', 'upset'],
    capabilities: {
      renderCache: true,
      statistics: false,
      notes: true,
      dataViews: false,
      canvas: false,
      threeD: false,
      worker: false,
      externalAsync: true
    }
  },
  {
    type: 'box',
    pageId: 'boxPage',
    exampleButtonId: 'boxLoadExample',
    geometry: 'cartesian',
    graphModes: ['box', 'notched', 'violin', 'strip', 'bar'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: false,
      threeD: false,
      worker: true,
      externalAsync: false
    }
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    exampleButtonId: 'scatterLoadExample',
    geometry: 'cartesian',
    graphModes: ['2d', '3d', 'volcano', 'ma'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: true,
      threeD: true,
      worker: true,
      externalAsync: false
    }
  },
  {
    type: 'pca',
    pageId: 'pcaPage',
    exampleButtonId: 'pcaLoadExample',
    geometry: 'cartesian-scree-3d',
    graphModes: ['pca', 'mds', 'tsne', 'umap', 'scree', '3d'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: false,
      threeD: true,
      worker: true,
      externalAsync: false
    }
  },
  {
    type: 'line',
    pageId: 'linePage',
    exampleButtonId: 'lineLoadExample',
    geometry: 'cartesian',
    graphModes: ['line', 'area', '3d'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: false,
      threeD: true,
      worker: false,
      externalAsync: false
    }
  },
  {
    type: 'heatmap',
    pageId: 'heatmapPage',
    exampleButtonId: 'heatmapLoadExample',
    geometry: 'heatmap',
    graphModes: ['values', 'correlation'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: true,
      threeD: false,
      worker: true,
      externalAsync: false
    }
  },
  {
    type: 'surface',
    pageId: 'surfacePage',
    exampleButtonId: 'surfaceLoadExample',
    geometry: '3d',
    graphModes: ['surface', 'points'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: false,
      threeD: true,
      worker: false,
      externalAsync: false
    }
  },
  {
    type: 'roc',
    pageId: 'rocPage',
    exampleButtonId: 'rocLoadExample',
    geometry: 'cartesian',
    graphModes: ['roc', 'precision-recall'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: false,
      threeD: false,
      worker: false,
      externalAsync: false
    }
  },
  {
    type: 'survival',
    pageId: 'survivalPage',
    exampleButtonId: 'survivalLoadExample',
    geometry: 'cartesian',
    graphModes: ['kaplan-meier', 'cox'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: false,
      threeD: false,
      worker: false,
      externalAsync: false
    }
  },
  {
    type: 'hist',
    pageId: 'histPage',
    exampleButtonId: 'histLoadExample',
    geometry: 'cartesian',
    graphModes: ['histogram', 'density', 'cumulative', 'frequency'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: false,
      threeD: false,
      worker: false,
      externalAsync: false
    }
  },
  {
    type: 'pie',
    pageId: 'piePage',
    exampleButtonId: 'pieLoadExample',
    geometry: 'radial-cartesian',
    graphModes: ['pie', 'donut', 'stacked'],
    capabilities: {
      renderCache: true,
      statistics: true,
      notes: true,
      dataViews: true,
      canvas: false,
      threeD: false,
      worker: false,
      externalAsync: false
    }
  }
];

const seenTypes = new Set();
for (const component of COMPONENT_CATALOG) {
  if (!component.type || seenTypes.has(component.type)) {
    throw new Error(`Invalid duplicate component catalog entry: ${component.type || '(missing type)'}`);
  }
  seenTypes.add(component.type);
  if (!component.pageId || !component.exampleButtonId || !component.geometry) {
    throw new Error(`Incomplete component catalog entry: ${component.type}`);
  }
  const mutationPlan = COMPONENT_MUTATION_CATALOG[component.type];
  if (!mutationPlan) {
    throw new Error(`Missing explicit mutation plan: ${component.type}`);
  }
  component.mutationPlan = mutationPlan;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

deepFreeze(COMPONENT_CATALOG);

function getComponentByType(type) {
  const component = COMPONENT_CATALOG.find(entry => entry.type === type);
  if (!component) {
    throw new Error(`Unknown component type: ${String(type)}`);
  }
  return component;
}

module.exports = {
  COMPONENT_CATALOG,
  // Temporary compatibility name while existing suites migrate.
  COMPONENT_MATRIX: COMPONENT_CATALOG,
  getComponentByType
};
