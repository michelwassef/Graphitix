'use strict';

// Render-cache variants must change a declared, component-owned data field.
// The adapters deliberately name candidate cells per component; they must not
// search arbitrary payload leaves for a convenient number.

const COMPONENT_DATA_PATHS = Object.freeze({
  box: Object.freeze([[1, 1], [1, 2], [2, 1]]),
  scatter: Object.freeze([[1, 1], [1, 2], [2, 1]]),
  pca: Object.freeze([[1, 1], [1, 2], [2, 1]]),
  line: Object.freeze([[1, 1], [1, 2], [2, 1]]),
  heatmap: Object.freeze([[1, 1], [1, 2], [2, 1]]),
  surface: Object.freeze([[1, 1], [1, 2], [2, 1]]),
  survival: Object.freeze([[1, 0], [1, 1], [2, 0]]),
  hist: Object.freeze([[1, 0], [1, 1], [2, 0]]),
  pie: Object.freeze([[1, 1], [1, 0], [2, 1]])
});

const clone = value => JSON.parse(JSON.stringify(value));

function variantDelta(variant) {
  if (variant === 'A') return 0.125;
  if (variant === 'B') return 0.375;
  throw new Error(`Unsupported render-cache variant ${String(variant)}`);
}

function mutateNumericCell(matrix, paths, delta, componentType) {
  for (const path of paths) {
    const row = matrix?.[path[0]];
    if (!Array.isArray(row)) continue;
    const current = row[path[1]];
    if (typeof current === 'number' && Number.isFinite(current)) {
      row[path[1]] = current + delta;
      return { path, componentType };
    }
    if (typeof current === 'string' && /^-?\d+(?:\.\d+)?$/.test(current.trim())) {
      row[path[1]] = String(Number(current) + delta);
      return { path, componentType };
    }
  }
  return null;
}

function mutateVennList(payload, variant) {
  const variantGene = variant === 'B' ? 'TP53' : 'BRCA2';
  const genes = String(payload?.data?.listA || '')
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);
  if (!genes.includes(variantGene)) genes.push(variantGene);
  payload.data.listA = genes.join('\n');
  return { path: ['data', 'listA'], componentType: 'venn' };
}

function mutateRocScores(payload, variant) {
  const matrix = payload?.data;
  const delta = variantDelta(variant);
  if (!Array.isArray(matrix)) return null;
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    if (!Array.isArray(row)) continue;
    for (let colIndex = 1; colIndex < row.length; colIndex += 1) {
      const current = row[colIndex];
      if (typeof current === 'number' && Number.isFinite(current)) {
        row[colIndex] = current + delta;
        return { path: ['data', rowIndex, colIndex], componentType: 'roc' };
      }
      if (typeof current === 'string' && /^-?\d+(?:\.\d+)?$/.test(current.trim())) {
        row[colIndex] = String(Number(current) + delta);
        return { path: ['data', rowIndex, colIndex], componentType: 'roc' };
      }
    }
  }
  return null;
}

const ADAPTERS = Object.freeze({
  venn: (payload, variant) => mutateVennList(payload, variant),
  box: (payload, variant) => mutateNumericCell(payload?.data, COMPONENT_DATA_PATHS.box, variantDelta(variant), 'box'),
  scatter: (payload, variant) => mutateNumericCell(payload?.data, COMPONENT_DATA_PATHS.scatter, variantDelta(variant), 'scatter'),
  pca: (payload, variant) => mutateNumericCell(payload?.data, COMPONENT_DATA_PATHS.pca, variantDelta(variant), 'pca'),
  line: (payload, variant) => mutateNumericCell(payload?.data, COMPONENT_DATA_PATHS.line, variantDelta(variant), 'line'),
  heatmap: (payload, variant) => mutateNumericCell(payload?.data, COMPONENT_DATA_PATHS.heatmap, variantDelta(variant), 'heatmap'),
  surface: (payload, variant) => mutateNumericCell(payload?.data, COMPONENT_DATA_PATHS.surface, variantDelta(variant), 'surface'),
  roc: (payload, variant) => mutateRocScores(payload, variant),
  survival: (payload, variant) => mutateNumericCell(payload?.data, COMPONENT_DATA_PATHS.survival, variantDelta(variant), 'survival'),
  hist: (payload, variant) => mutateNumericCell(payload?.data, COMPONENT_DATA_PATHS.hist, variantDelta(variant), 'hist'),
  pie: (payload, variant) => mutateNumericCell(payload?.data, COMPONENT_DATA_PATHS.pie, variantDelta(variant), 'pie')
});

function buildRenderCacheVariantPayload(basePayload, componentType, variant) {
  const adapter = ADAPTERS[componentType];
  if (!adapter) throw new Error(`No render-cache mutation adapter for ${String(componentType)}`);
  const payload = clone(basePayload);
  const mutation = adapter(payload, variant);
  if (!mutation) {
    throw new Error(`Unable to create a declared render-cache variant for ${componentType}`);
  }
  return { payload, mutation };
}

module.exports = {
  COMPONENT_DATA_PATHS,
  RENDER_CACHE_MUTATION_ADAPTERS: ADAPTERS,
  buildRenderCacheVariantPayload
};
