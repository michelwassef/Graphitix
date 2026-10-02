(function initScatterDensityModel(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.scatterDensityModel = Shared.scatterDensityModel || {};
  const GRID_CELL_SIZE_PX = 1.5;
  const GRID_MAX_RESOLUTION = 1024;
  // Keep sampling resolution separate from Gaussian bandwidth (see
  // https://d3js.org/d3-contour/density). This visual default uses 1.5% of
  // each displayed axis range, preserving smoothing through plot resizing.
  const BANDWIDTH_FRACTION = 0.015;
  // Resolve each standard deviation with at least four grid intervals.
  const GRID_MIN_RESOLUTION = Math.ceil(4 / BANDWIDTH_FRACTION);

  function gaussianKernel(sigma){
    const radius = Math.ceil(3 * sigma);
    const weights = new Float64Array(2 * radius + 1);
    let sum = 0;
    for(let i = -radius; i <= radius; i += 1){
      const weight = Math.exp(-0.5 * (i / sigma) ** 2);
      weights[i + radius] = weight;
      sum += weight;
    }
    for(let i = 0; i < weights.length; i += 1){ weights[i] /= sum; }
    return { weights, radius };
  }

  function blurGrid(source, width, height, kernel, horizontal){
    const result = new Float64Array(source.length);
    const { weights, radius } = kernel;
    const stride = horizontal ? 1 : width;
    const length = horizontal ? width : height;
    for(let y = 0; y < height; y += 1){
      for(let x = 0; x < width; x += 1){
        const position = horizontal ? x : y;
        const index = y * width + x;
        let sum = 0;
        const start = Math.max(-radius, -position);
        const end = Math.min(radius, length - position - 1);
        for(let k = start; k <= end; k += 1){
          sum += source[index + k * stride] * weights[k + radius];
        }
        result[index] = sum;
      }
    }
    return result;
  }

  function computeScatterDensityValuesFromGeometry(cxValues, cyValues, size){
    const width = Math.max(1, Number(size?.width) || 1);
    const height = Math.max(1, Number(size?.height) || 1);
    const offsetX = Number(size?.offsetX) || 0;
    const offsetY = Number(size?.offsetY) || 0;
    const count = Math.min(
      Array.isArray(cxValues) || ArrayBuffer.isView(cxValues) ? cxValues.length : 0,
      Array.isArray(cyValues) || ArrayBuffer.isView(cyValues) ? cyValues.length : 0
    );
    if(!count){ return { values: [], max: 0 }; }
    // cellSize controls numerical approximation only, never bandwidth.
    const requestedCellSize = Number(size?.cellSize);
    const cellSize = Number.isFinite(requestedCellSize) && requestedCellSize > 0
      ? requestedCellSize : GRID_CELL_SIZE_PX;
    const cellsX = Math.max(GRID_MIN_RESOLUTION, Math.min(GRID_MAX_RESOLUTION, Math.ceil(width / cellSize)));
    const cellsY = Math.max(GRID_MIN_RESOLUTION, Math.min(GRID_MAX_RESOLUTION, Math.ceil(height / cellSize)));
    const kernelX = gaussianKernel(cellsX * BANDWIDTH_FRACTION);
    const kernelY = gaussianKernel(cellsY * BANDWIDTH_FRACTION);
    const padX = kernelX.radius + 1;
    const padY = kernelY.radius + 1;
    const gridW = cellsX + 2 * padX + 1;
    const gridH = cellsY + 2 * padY + 1;
    const grid = new Float64Array(gridW * gridH);
    const positionsX = new Float64Array(count).fill(NaN);
    const positionsY = new Float64Array(count).fill(NaN);

    // Deposit mass linearly instead of snapping points to bins. Padding
    // retains kernel tails without clamping outliers onto plot boundaries.
    for(let i = 0; i < count; i += 1){
      const x = (Number(cxValues[i]) - offsetX) / width * cellsX + padX;
      const y = (Number(cyValues[i]) - offsetY) / height * cellsY + padY;
      if(!Number.isFinite(x) || !Number.isFinite(y)
        || x < 0 || y < 0 || x >= gridW - 1 || y >= gridH - 1){ continue; }
      positionsX[i] = x;
      positionsY[i] = y;
      const ix = Math.floor(x), iy = Math.floor(y);
      const tx = x - ix, ty = y - iy;
      const index = iy * gridW + ix;
      grid[index] += (1 - tx) * (1 - ty);
      grid[index + 1] += tx * (1 - ty);
      grid[index + gridW] += (1 - tx) * ty;
      grid[index + gridW + 1] += tx * ty;
    }
    const horizontal = blurGrid(grid, gridW, gridH, kernelX, true);
    const densityGrid = blurGrid(horizontal, gridW, gridH, kernelY, false);
    const values = new Float64Array(count);
    let maxDensity = 0;
    for(let i = 0; i < count; i += 1){
      const x = positionsX[i], y = positionsY[i];
      if(!Number.isFinite(x) || !Number.isFinite(y)){ continue; }
      const ix = Math.floor(x), iy = Math.floor(y);
      const tx = x - ix, ty = y - iy;
      const index = iy * gridW + ix;
      const top = densityGrid[index] * (1 - tx) + densityGrid[index + 1] * tx;
      const bottom = densityGrid[index + gridW] * (1 - tx) + densityGrid[index + gridW + 1] * tx;
      const density = top * (1 - ty) + bottom * ty;
      values[i] = density;
      maxDensity = Math.max(maxDensity, density);
    }
    return { values, max: maxDensity };
  }

  namespace.computeScatterDensityValuesFromGeometry = computeScatterDensityValuesFromGeometry;
  if(typeof module !== 'undefined' && module.exports){ module.exports = namespace; }
})(typeof window !== 'undefined' ? window : globalThis);
