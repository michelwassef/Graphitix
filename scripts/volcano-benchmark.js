#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '..', '__tests__', 'test-volcano.csv');
const DEFAULT_LOG2_FC_THRESHOLD = 1;
const DEFAULT_NEG_LOG_P_THRESHOLD = 1.3;

function debugLog(step, payload){
  console.debug(`Debug: benchmark.${step}`, payload); // Debug: benchmark trace output
}

function loadCsvMatrix(filePath){
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const matrix = lines.map(line => line.split(',').map(cell => cell.trim()));
  debugLog('loadCsvMatrix', { rows: matrix.length, cols: matrix[0]?.length || 0 });
  return matrix;
}

function simulateLegacyProcessing(matrix){
  const labelCol = matrix.map(row => row[0] || '');
  const xCol = matrix.map(row => row[1] || '');
  const yCol = matrix.map(row => row[2] || '');
  const points = [];
  const labelSet = new Set();
  let significant = 0;
  for(let r = 1; r < matrix.length; r++){
    const lab = labelCol[r] || '';
    const log2fc = parseFloat(xCol[r]);
    const pRaw = parseFloat(yCol[r]);
    if(Number.isFinite(log2fc) && Number.isFinite(pRaw) && pRaw > 0){
      let negLogP = -Math.log10(pRaw);
      if(!Number.isFinite(negLogP)){
        negLogP = -Math.log10(Number.MIN_VALUE);
      }
      const isSignificant = Math.abs(log2fc) >= DEFAULT_LOG2_FC_THRESHOLD && negLogP >= DEFAULT_NEG_LOG_P_THRESHOLD;
      points.push({
        x: log2fc,
        y: negLogP,
        label: lab,
        isSignificant,
        meta: { log2fc, pValue: pRaw, negLogP }
      });
      if(isSignificant){
        significant += 1;
      }
      if(lab){
        labelSet.add(lab);
      }
    }
  }
  debugLog('simulateLegacyProcessing.complete', { points: points.length, labels: labelSet.size, significant });
  return { points: points.length, labels: labelSet.size, significant };
}

function simulateOptimizedProcessing(matrix){
  const labelCol = matrix.map(row => row[0] || '');
  const xCol = matrix.map(row => row[1] || '');
  const yCol = matrix.map(row => row[2] || '');
  const points = [];
  let significant = 0;
  for(let r = 1; r < matrix.length; r++){
    const lab = labelCol[r] || '';
    const log2fc = parseFloat(xCol[r]);
    const pRaw = parseFloat(yCol[r]);
    if(Number.isFinite(log2fc) && Number.isFinite(pRaw) && pRaw > 0){
      let negLogP = -Math.log10(pRaw);
      if(!Number.isFinite(negLogP)){
        negLogP = -Math.log10(Number.MIN_VALUE);
      }
      const isSignificant = Math.abs(log2fc) >= DEFAULT_LOG2_FC_THRESHOLD && negLogP >= DEFAULT_NEG_LOG_P_THRESHOLD;
      const labelValue = lab && isSignificant ? lab : '';
      points.push({ x: log2fc, y: negLogP, label: labelValue, isSignificant });
      if(isSignificant){
        significant += 1;
      }
    }
  }
  debugLog('simulateOptimizedProcessing.complete', { points: points.length, significant });
  return { points: points.length, significant };
}

function measureRun(name, fn){
  if(global.gc){
    global.gc();
  }
  const before = process.memoryUsage().heapUsed;
  const start = process.hrtime.bigint();
  const result = fn();
  if(global.gc){
    global.gc();
  }
  const after = process.memoryUsage().heapUsed;
  const end = process.hrtime.bigint();
  const heapDeltaMb = (after - before) / (1024 * 1024);
  const durationMs = Number(end - start) / 1e6;
  return { name, heapDeltaMb, durationMs, result };
}

function main(){
  const matrix = loadCsvMatrix(INPUT_PATH);
  const runs = [
    measureRun('legacy', () => simulateLegacyProcessing(matrix)),
    measureRun('optimized', () => simulateOptimizedProcessing(matrix))
  ];
  const table = runs.map(run => ({
    name: run.name,
    heapDeltaMb: run.heapDeltaMb.toFixed(2),
    durationMs: run.durationMs.toFixed(2),
    pointCount: run.result.points,
    labelsTracked: run.result.labels ?? 'n/a',
    significant: run.result.significant
  }));
  console.table(table);
}

main();
