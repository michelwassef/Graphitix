/* global expect, jest, test */
'use strict';

const {
  runPythonOracle,
  indexOracleResults,
  detectPythonOracleAvailability
} = require('../__tests__/helpers/pythonOracle');

const oracleAvailability = detectPythonOracleAvailability();
const testWithOracle = oracleAvailability.available ? test : test.skip;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function expectClose(actual, expected, label, tolerance = {}) {
  const abs = isFiniteNumber(tolerance.abs) ? tolerance.abs : 1e-8;
  const rel = isFiniteNumber(tolerance.rel) ? tolerance.rel : 1e-6;
  if (expected == null) {
    expect(actual == null || !Number.isFinite(actual)).toBe(true);
    return;
  }
  expect(isFiniteNumber(actual)).toBe(true);
  expect(isFiniteNumber(expected)).toBe(true);
  const diff = Math.abs(actual - expected);
  const limit = Math.max(abs, rel * Math.max(1, Math.abs(expected)));
  if (diff > limit) {
    throw new Error(`${label} mismatch: actual=${actual}, expected=${expected}, diff=${diff}, limit=${limit}`);
  }
}

function createRng(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = ((1664525 * state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randn(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function createFixtures() {
  
    const boxA = [12, 14, 11, 13, 15, 16, 14, 13, 12, 15];
    const boxB = [15, 17, 14, 16, 18, 19, 16, 15, 14, 17];
    const boxC = [9, 10, 11, 10, 12, 13, 11, 9, 10, 12];
    const pairedA = [22, 19, 25, 27, 30, 24, 26, 28];
    const pairedB = [20, 18, 23, 24, 29, 22, 24, 26];
    const ratioA = [4.2, 5.1, 6.8, 7.4, 8.9, 10.2, 11.6, 13.1];
    const ratioB = [3.1, 4.0, 5.4, 5.9, 7.1, 8.0, 9.4, 10.5];
    const logBoxA = [2.2, 2.8, 3.5, 4.9, 5.6, 6.4, 7.8, 9.1];
    const logBoxB = [1.8, 2.1, 2.9, 3.2, 4.4, 5.1, 5.7, 6.8];
    const logBoxC = [2.7, 3.6, 4.1, 5.8, 6.5, 7.9, 9.6, 11.2];
    const boxLabels = ['A', 'B', 'C'];
  
    const friedmanGroups = [
      [11, 12, 13, 14, 15, 16, 14, 13, 17, 18, 16, 15, 19, 20, 18],
      [12, 13, 14, 15, 16, 17, 15, 14, 18, 19, 17, 16, 20, 21, 19],
      [14, 15, 16, 17, 18, 19, 17, 16, 20, 21, 19, 18, 22, 23, 21]
    ];
  
    const pieObserved = [120, 90, 60, 130];
    const pieExpected = [100, 100, 80, 120];
    const pieContingency = [
      [120, 100, 95],
      [90, 100, 88],
      [60, 80, 73],
      [130, 120, 111]
    ];
    const pieContingency2x2 = [
      [18, 12],
      [9, 21]
    ];
  
    const rocPairs1 = [
      { label: 1, score: 0.95 }, { label: 1, score: 0.90 }, { label: 1, score: 0.84 }, { label: 1, score: 0.82 },
      { label: 1, score: 0.78 }, { label: 1, score: 0.76 }, { label: 1, score: 0.71 }, { label: 1, score: 0.66 },
      { label: 1, score: 0.62 }, { label: 1, score: 0.58 }, { label: 0, score: 0.73 }, { label: 0, score: 0.69 },
      { label: 0, score: 0.61 }, { label: 0, score: 0.57 }, { label: 0, score: 0.52 }, { label: 0, score: 0.49 },
      { label: 0, score: 0.42 }, { label: 0, score: 0.37 }, { label: 0, score: 0.33 }, { label: 0, score: 0.27 }
    ];
    const rocPairs2 = rocPairs1.map((row, idx) => ({
      label: row.label,
      score: row.label === 1 ? row.score - 0.04 + ((idx % 3) * 0.005) : row.score + 0.03 - ((idx % 4) * 0.004)
    }));
  
    const corrX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const corrY = [2.2, 4.2, 6.3, 8.1, 9.6, 12.5, 13.9, 16.2, 17.4, 20.1, 22.2, 23.8];
  
    const survivalSeries = [
      {
        name: 'Control',
        records: [
          { time: 2.0, event: true }, { time: 3.1, event: false }, { time: 4.2, event: true }, { time: 5.6, event: true },
          { time: 6.1, event: false }, { time: 7.3, event: true }, { time: 8.0, event: false }, { time: 9.5, event: true }
        ]
      },
      {
        name: 'Treatment',
        records: [
          { time: 2.4, event: false }, { time: 3.8, event: true }, { time: 4.9, event: false }, { time: 6.4, event: true },
          { time: 7.0, event: false }, { time: 8.6, event: true }, { time: 9.2, event: false }, { time: 10.8, event: true }
        ]
      }
    ];
    const survivalTrendSeries = [
      {
        name: 'Dose 1',
        records: [
          { time: 2.1, event: true }, { time: 3.0, event: true }, { time: 4.1, event: false }, { time: 5.0, event: true },
          { time: 6.1, event: false }, { time: 6.9, event: true }, { time: 7.8, event: false }, { time: 8.6, event: true }
        ]
      },
      {
        name: 'Dose 2',
        records: [
          { time: 2.8, event: false }, { time: 3.6, event: true }, { time: 4.8, event: false }, { time: 5.9, event: true },
          { time: 6.8, event: false }, { time: 7.9, event: true }, { time: 8.8, event: false }, { time: 10.0, event: true }
        ]
      },
      {
        name: 'Dose 3',
        records: [
          { time: 3.4, event: false }, { time: 4.7, event: false }, { time: 5.9, event: true }, { time: 7.1, event: false },
          { time: 8.0, event: true }, { time: 9.5, event: false }, { time: 10.4, event: true }, { time: 11.8, event: false }
        ]
      }
    ];
  
  
  return {
    boxA,
    boxB,
    boxC,
    pairedA,
    pairedB,
    ratioA,
    ratioB,
    logBoxA,
    logBoxB,
    logBoxC,
    boxLabels,
    friedmanGroups,
    pieObserved,
    pieExpected,
    pieContingency,
    pieContingency2x2,
    rocPairs1,
    rocPairs2,
    corrX,
    corrY,
    survivalSeries,
    survivalTrendSeries,
  };
}

function loadStatsHooks() {
  jest.resetModules();
  global.Shared = {};
  global.Components = {};
  const jStatModule = require('jstat');
  const jStat = jStatModule?.jStat || jStatModule;
  global.jStat = jStat;
  if (typeof window !== 'undefined') {
    window.jStat = jStat;
    window.Shared = global.Shared;
    window.Components = global.Components;
  }
require('../js/vendor.js');
require('../js/shared/stats.js');
require('../js/shared/regression.js');
require('../js/components/box.js');
require('../js/components/hist.js');
require('../js/components/pie.js');
require('../js/components/roc.js');
require('../js/components/line.js');
require('../js/components/scatter.js');
require('../js/components/survival.js');

  return {
    boxHooks: window.Components?.box?.__testHooks,
    histHooks: window.Components?.hist?.__testHooks,
    pieHooks: window.Components?.pie?.__testHooks,
    rocHooks: window.Components?.roc?.__testHooks,
    lineHooks: window.Components?.line?.__testHooks,
    scatterHooks: window.Components?.scatter?.__testHooks,
    survivalHooks: window.Components?.survival?.__testHooks,
  };
}

module.exports = {
  createFixtures,
  expectClose,
  createRng,
  indexOracleResults,
  isFiniteNumber,
  loadStatsHooks,
  randn,
  runPythonOracle,
  testWithOracle
};

