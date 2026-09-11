'use strict';

const { loadProductionBootstrap } = require('./productionLoader');

function installPcaViewProductionFixture() {
  if (typeof global.__resetGrid__ === 'function') {
    global.__resetGrid__();
  }
  if (typeof window !== 'undefined') {
    delete window.Main;
    delete window.Components;
    delete window.Shared;
  }
  if (typeof global !== 'undefined') {
    delete global.Main;
    delete global.Components;
    delete global.Shared;
  }

  global.__svdCallCount = 0;
  global.SVDJS = {
    SVD(matrix = []) {
      global.__svdCallCount = (global.__svdCallCount || 0) + 1;
      const rows = Array.isArray(matrix) ? matrix.length : 0;
      const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
      const componentCount = Math.max(1, Math.min(rows, cols, 3));
      const q = Array.from({ length: componentCount }, (_, idx) => componentCount - idx + 1);
      const u = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: componentCount }, (_, k) => ((r + 1) / (componentCount + k + 1)))
      );
      const v = Array.from({ length: cols }, (_, c) =>
        Array.from({ length: componentCount }, (_, k) => ((c + 1) / (componentCount + k + 1)))
      );
      return { u, v, q };
    }
  };
  if (typeof window !== 'undefined') {
    window.SVDJS = global.SVDJS;
  }
  global.jStat = {
    mean(values = []) {
      const filtered = values.filter(value => typeof value === 'number');
      if (!filtered.length) return 0;
      return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
    },
    stdev(values = [], flag) {
      const filtered = values.filter(value => typeof value === 'number');
      if (filtered.length < 2) return 0;
      const mean = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
      const variance = filtered.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
        (flag ? filtered.length : filtered.length - 1);
      return Math.sqrt(variance);
    }
  };
  if (typeof window !== 'undefined') {
    window.jStat = global.jStat;
  }

  return loadProductionBootstrap({
    vendorMode: 'fake',
    preloadComponents: ['pca']
  });
}

module.exports = { installPcaViewProductionFixture };
