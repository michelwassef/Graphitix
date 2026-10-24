#!/usr/bin/env node
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');

const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...parts] = value.replace(/^--/, '').split('=');
  return [key, parts.join('=') || 'true'];
}));
const readList = (key, fallback, convert = value => value) => (args.get(key) || fallback)
  .split(',').map(value => convert(value)).filter(value => value !== null && value !== undefined);
const repetitions = Math.max(3, Number(args.get('repetitions')) || 5);
const warmups = Math.max(1, Number(args.get('warmups')) || 1);
const groupCounts = readList('groups', '3,5,10,25,30,50', Number).filter(Number.isInteger);
const patterns = readList('patterns', 'repeated-exact,heterogeneous');
const scopes = readList('scopes', 'all,reference');
const methods = readList('methods', 'games-howell,tukey').filter(value => ['games-howell', 'tukey'].includes(value));
const ciLevels = readList('ci', '0.95', Number).filter(value => value > 0 && value < 1);
const includeWorker = args.get('include-worker') === 'true';
const modelPath = path.resolve(args.get('model') || path.join(__dirname, '../js/shared/boxStatsModel.js'));
const rootPath = path.resolve(__dirname, '..');
const statsPath = path.join(rootPath, 'js/shared/stats.js');

global.jStat = require('jstat').jStat;
global.Shared = {};
require(statsPath);
const boxStatsModel = require(modelPath);

function makeGroups(groupCount, pattern) {
  if (pattern === 'repeated-exact' || pattern === 'near-repeated') {
    const offsets = [-1, 0, 1, 2];
    return Array.from({ length: groupCount }, (_, index) => {
      const scale = pattern === 'near-repeated' ? 1 + (index * 1e-6) : 1;
      const center = index * 4;
      return offsets.map(value => center + (scale * value));
    });
  }
  if (pattern !== 'heterogeneous') throw new Error(`Unknown dataset pattern: ${pattern}`);
  return Array.from({ length: groupCount }, (_, index) => {
    const size = 3 + (index % 5);
    const scale = 0.4 + (index * 0.037);
    const center = index * 1.1;
    return Array.from({ length: size }, (_, observation) => {
      const centered = observation - ((size - 1) / 2);
      const frequency = index + 2;
      return center + (scale * (centered + (0.08 * Math.sin((observation + 1) * frequency))));
    });
  });
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function resolveResult(method, groups, labels, ciLevel, referenceIndex) {
  const options = { ciLevel };
  if (referenceIndex !== null) options.referenceIndex = referenceIndex;
  return method === 'tukey'
    ? boxStatsModel.computeTukeyComparisons(groups, labels, options)
    : boxStatsModel.computeGamesHowellComparisons(groups, labels, options);
}

function assertResult(result, method, expectedPairs) {
  if (!result?.ok) throw new Error(`${method} failed: ${result?.message || 'no result'}`);
  if (result.pairs.length !== expectedPairs) {
    throw new Error(`${method} returned ${result.pairs.length}; expected ${expectedPairs} pairs.`);
  }
  return result;
}

function distinctDegreesOfFreedom(pairs) {
  return [...new Set(pairs.map(pair => pair.df))].sort((left, right) => left - right);
}

function summarizeGroups(groups) {
  const counts = groups.map(group => group.length);
  const means = groups.map(group => group.reduce((sum, value) => sum + value, 0) / group.length);
  const variances = groups.map((group, index) => group.reduce((sum, value) => sum + ((value - means[index]) ** 2), 0) / (group.length - 1));
  return {
    groupSizes: counts,
    varianceMin: Math.min(...variances),
    varianceMax: Math.max(...variances),
    varianceRatio: Math.max(...variances) / Math.min(...variances)
  };
}

async function measure(fn) {
  let start = performance.now();
  let value = await fn();
  const coldFirstRunMs = performance.now() - start;
  for (let index = 0; index < warmups; index += 1) await fn();
  const samplesMs = [];
  for (let index = 0; index < repetitions; index += 1) {
    start = performance.now();
    value = await fn();
    samplesMs.push(performance.now() - start);
  }
  return {
    coldFirstRunMs: Number(coldFirstRunMs.toFixed(3)),
    warmupRuns: warmups,
    repetitions,
    medianMs: Number(median(samplesMs).toFixed(3)),
    samplesMs: samplesMs.map(sample => Number(sample.toFixed(3))),
    value
  };
}

function measureNodeStartup() {
  const source = [
    `global.jStat=require(${JSON.stringify(require.resolve('jstat'))}).jStat;`,
    'global.Shared={};',
    `require(${JSON.stringify(statsPath)});`,
    `require(${JSON.stringify(modelPath)});`
  ].join('');
  const start = performance.now();
  const result = spawnSync(process.execPath, ['-e', source], { cwd: rootPath, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Cold Node startup measurement failed.');
  return Number((performance.now() - start).toFixed(3));
}

function runWorkerThread(method, groups, labels, ciLevel, referenceIndex) {
  const workerSource = `
    const { parentPort, workerData } = require('node:worker_threads');
    global.jStat = require(workerData.jstatPath).jStat;
    global.Shared = {};
    require(workerData.statsPath);
    const model = require(workerData.modelPath);
    const options = { ciLevel: workerData.ciLevel };
    if (workerData.referenceIndex !== null) options.referenceIndex = workerData.referenceIndex;
    const result = workerData.method === 'tukey'
      ? model.computeTukeyComparisons(workerData.groups, workerData.labels, options)
      : model.computeGamesHowellComparisons(workerData.groups, workerData.labels, options);
    parentPort.postMessage({ ok: result?.ok === true, pairCount: result?.pairs?.length || 0 });
  `;
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        jstatPath: require.resolve('jstat'), statsPath, modelPath,
        method, groups, labels, ciLevel, referenceIndex
      }
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => {
      if (code !== 0) reject(new Error(`Statistics worker exited with code ${code}.`));
    });
  });
}

async function main() {
  const results = [];
  for (const count of groupCounts) {
    for (const pattern of patterns) {
      const groups = makeGroups(count, pattern);
      const labels = groups.map((_, index) => `G${index + 1}`);
      const referenceIndex = Math.floor(count / 2);
      const groupSummary = summarizeGroups(groups);
      for (const scope of scopes) {
        const selectedReference = scope === 'reference' ? referenceIndex : null;
        const expectedPairs = scope === 'reference' ? count - 1 : count * (count - 1) / 2;
        for (const ciLevel of ciLevels) {
          for (const method of methods) {
            const fullMeasure = await measure(() => assertResult(
              resolveResult(method, groups, labels, ciLevel, selectedReference),
              method,
              expectedPairs
            ));
            const pairs = fullMeasure.value.pairs;
            const dfs = distinctDegreesOfFreedom(pairs);
            if (method === 'games-howell' && pattern === 'repeated-exact' && dfs.length !== 1) {
              throw new Error(`Exact repeated-df dataset produced ${dfs.length} distinct values.`);
            }
            if (method === 'games-howell' && pattern === 'near-repeated'
              && (dfs.length < 2 || ((Math.max(...dfs) - Math.min(...dfs)) / Math.min(...dfs)) >= 1e-3)) {
              throw new Error(`Near-repeated dataset did not produce distinct, tightly clustered df values (${dfs.length}).`);
            }

            const row = {
              method,
              groups: count,
              dataset: pattern,
              scope,
              referenceIndex: selectedReference,
              ciLevel,
              pairCount: pairs.length,
              distinctDfCount: dfs.length,
              dfMin: dfs.length ? dfs[0] : null,
              dfMax: dfs.length ? dfs[dfs.length - 1] : null,
              ...groupSummary,
              complete: {
                coldFirstRunMs: fullMeasure.coldFirstRunMs,
                medianMs: fullMeasure.medianMs,
                samplesMs: fullMeasure.samplesMs
              }
            };

            if (method === 'games-howell') {
              const pMeasure = await measure(() => {
                for (const pair of pairs) {
                  const p = boxStatsModel.studentizedRangeSF(pair.q, count, pair.df);
                  if (!Number.isFinite(p)) throw new Error('Games–Howell p-value kernel failed.');
                }
                return pairs.length;
              });
              const criticalMeasure = await measure(() => {
                const values = boxStatsModel.resolveStudentizedRangeCriticalValues(
                  1 - ciLevel,
                  count,
                  pairs.map(pair => pair.df)
                );
                if (values.length !== dfs.length || values.some(value => !Number.isFinite(value.critical))) {
                  throw new Error('Games–Howell critical-value kernel failed.');
                }
                return values.length;
              });
              row.pValuesOnly = {
                coldFirstRunMs: pMeasure.coldFirstRunMs,
                medianMs: pMeasure.medianMs,
                samplesMs: pMeasure.samplesMs
              };
              row.criticalValuesOnly = {
                coldFirstRunMs: criticalMeasure.coldFirstRunMs,
                medianMs: criticalMeasure.medianMs,
                samplesMs: criticalMeasure.samplesMs
              };
            }

            if (includeWorker) {
              const workerMeasure = await measure(() => runWorkerThread(
                method, groups, labels, ciLevel, selectedReference
              ));
              if (!workerMeasure.value.ok || workerMeasure.value.pairCount !== expectedPairs) {
                throw new Error('Worker-thread result did not match direct pair count.');
              }
              row.nodeWorkerThread = {
                coldFirstRunMs: workerMeasure.coldFirstRunMs,
                medianMs: workerMeasure.medianMs,
                samplesMs: workerMeasure.samplesMs,
                includesThreadStartupAndMessageTransfer: true
              };
            }
            results.push(row);
            process.stderr.write(`benchmarked ${method} ${count} groups ${pattern} ${scope} CI ${ciLevel}\n`);
          }
        }
      }
    }
  }

  process.stdout.write(`${JSON.stringify({
    model: modelPath,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpu: os.cpus()[0]?.model || null,
    coldNodeStartupMs: measureNodeStartup(),
    warmups,
    repetitions,
    generator: {
      heterogeneous: 'group size 3+(index mod 5), scale 0.4+0.037*index, center 1.1*index, sinusoidal perturbation 0.08',
      repeatedExact: 'four integer offsets [-1,0,1,2] translated by 4*index',
      nearRepeated: 'same four offsets scaled by 1+1e-6*index'
    },
    includesUiRendering: false,
    includesActualBrowserWorker: false,
    results
  }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
