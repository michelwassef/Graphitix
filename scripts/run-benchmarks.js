#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// --- Environment bootstrap -------------------------------------------------
function noop(){}
function createElementStub(){
  const node = {
    style: {},
    children: [],
    appendChild(child){ if(child) this.children.push(child); return child; },
    removeChild(child){ this.children = this.children.filter(c => c !== child); },
    setAttribute: noop,
    addEventListener: noop,
    removeEventListener: noop,
    getContext: () => ({ measureText: txt => ({ width: String(txt || '').length * 8 }) })
  };
  return node;
}
function ensureDomStubs(){
  if(typeof global.window === 'undefined'){
    global.window = global;
  }
  if(!global.document){
    const doc = {
      createElement: createElementStub,
      createElementNS: () => createElementStub(),
      createDocumentFragment: () => ({ appendChild: noop }),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      body: { appendChild: noop },
      documentElement: { appendChild: noop, style: {} },
      open: noop,
      write: noop,
      close: noop
    };
    global.document = doc;
    global.window.document = doc;
  }
  if(!global.navigator){
    global.navigator = { userAgent: 'benchmark-script' };
  }
  if(!global.performance){
    global.performance = performance;
  }
}
ensureDomStubs();

// --- CLI parsing -----------------------------------------------------------
const DEFAULT_ITERATIONS = 5;
let cachedTestBoxMatrix = null;

function loadCsvMatrix(csvPath){
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(line => line.length);
  return lines.map(line => line.split(','));
}

function getTestBoxMatrix(){
  if(!cachedTestBoxMatrix){
    const csvPath = path.join(__dirname, '..', '__tests__', 'test-box.csv');
    cachedTestBoxMatrix = loadCsvMatrix(csvPath);
  }
  return cachedTestBoxMatrix;
}

const BENCHMARKS = [
  {
    id: 'box',
    label: 'Box trace summaries',
    module: path.join(__dirname, '..', 'js', 'components', 'box.js'),
    resolveHook: () => global.window?.Components?.box?.__testHooks?.benchmarkSummaries,
    defaults: { rows: 2000, cols: 25 }
  },
  {
    id: 'box-swarm',
    label: 'Box swarm spacing',
    module: path.join(__dirname, '..', 'js', 'components', 'box.js'),
    resolveHook: () => global.window?.Components?.box?.__testHooks?.benchmarkSwarmOffsets,
    defaults: { points: 12000, clusters: 8, axisSpacing: 120, radius: 2, widthScaleMode: 'density' }
  },
  {
    id: 'box-swarm-modes',
    label: 'Box swarm modes',
    module: path.join(__dirname, '..', 'js', 'components', 'box.js'),
    resolveHook: () => global.window?.Components?.box?.__testHooks?.benchmarkSwarmModes,
    defaults: { points: 12000, clusters: 8, axisSpacing: 120, radius: 5, overlayRadius: 2, height: 600, violinSamples: 80 }
  },
  {
    id: 'scatter',
    label: 'Scatter plot prep',
    module: path.join(__dirname, '..', 'js', 'components', 'scatter.js'),
    resolveHook: () => global.window?.Components?.scatter?.__testHooks?.benchmarkLoad,
    defaults: { points: 8000, dimensions: 3 }
  },
  {
    id: 'pca',
    label: 'PCA solver prep',
    module: path.join(__dirname, '..', 'js', 'components', 'pca.js'),
    resolveHook: () => global.window?.Components?.pca?.__testHooks?.benchmarkLoad,
    defaults: { rows: 600, cols: 30 }
  },
  {
    id: 'heatmap',
    label: 'Heatmap preprocessing',
    module: path.join(__dirname, '..', 'js', 'components', 'heatmap.js'),
    resolveHook: () => global.window?.Components?.heatmap?.__testHooks?.benchmarkLoad,
    defaults: { rows: 400, cols: 45 }
  },
  {
    id: 'box-dataset',
    label: 'Box dataset (test-box.csv)',
    module: path.join(__dirname, '..', 'js', 'components', 'box.js'),
    resolveHook: () => global.window?.Components?.box?.__testHooks?.benchmarkDatasetLoad,
    getInput: () => ({ matrix: getTestBoxMatrix() })
  }
];

function parseArgs(argv){
  const options = {
    include: null,
    jsonPath: null,
    comparePath: null,
    configPath: null,
    iterations: DEFAULT_ITERATIONS,
    overrides: {}
  };
  for(let i = 0; i < argv.length; i++){
    const arg = argv[i];
    if(arg === '--help' || arg === '-h'){
      printHelp();
      process.exit(0);
    }else if(arg === '--json'){
      options.jsonPath = argv[++i];
    }else if(arg === '--compare'){
      options.comparePath = argv[++i];
    }else if(arg === '--config'){
      options.configPath = argv[++i];
    }else if(arg === '--only'){
      options.include = argv[++i]?.split(',').map(s => s.trim()).filter(Boolean) || [];
    }else if(arg === '--iterations'){
      options.iterations = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_ITERATIONS);
    }else if(/^[a-z]+\.[^=]+=/.test(arg)){
      const [lhs, rawValue] = arg.split('=');
      const [component, key] = lhs.split('.');
      if(!component || !key){
        throw new Error(`Invalid override syntax: ${arg}`);
      }
      if(!options.overrides[component]){
        options.overrides[component] = {};
      }
      options.overrides[component][key] = coerceValue(rawValue);
    }else{
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if(options.configPath){
    Object.assign(options.overrides, loadConfigFile(options.configPath));
  }
  return options;
}

function coerceValue(value){
  if(value === 'true') return true;
  if(value === 'false') return false;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : value;
}

function loadConfigFile(filePath){
  const abs = path.resolve(process.cwd(), filePath);
  const data = fs.readFileSync(abs, 'utf8');
  const parsed = JSON.parse(data);
  if(typeof parsed !== 'object' || parsed === null){
    throw new Error(`Benchmark config must be an object: ${filePath}`);
  }
  return parsed;
}

function printHelp(){
  console.log(`Usage: node scripts/run-benchmarks.js [options]\n\n` +
    `Options:\n` +
    `  --only box,scatter     Run a subset of benchmarks\n` +
    `  --iterations N         Samples per benchmark (default ${DEFAULT_ITERATIONS})\n` +
    `  component.key=value    Override input (e.g., box.rows=10000)\n` +
    `  --config path.json     Provide overrides via JSON file\n` +
    `  --json path            Write results to JSON\n` +
    `  --compare path         Show delta vs previous JSON\n` +
    `  -h, --help             Show this help\n`);
}

// --- Benchmark runner ------------------------------------------------------
function resolveHook(def){
  if(!def.__loaded){
    require(def.module);
    def.__loaded = true;
  }
  const hook = def.resolveHook();
  if(typeof hook !== 'function'){
    throw new Error(`Benchmark hook missing for ${def.id}`);
  }
  return hook;
}

function runBenchmark(def, overrides, iterations){
  const hook = resolveHook(def);
  const baseInput = typeof def.getInput === 'function'
    ? def.getInput()
    : (def.defaults ? { ...def.defaults } : {});
  const overrideInput = overrides?.[def.id] || {};
  const input = Object.assign({}, baseInput, overrideInput);
  const samples = [];
  let lastResult = null;
  for(let i = 0; i < iterations; i++){
    lastResult = hook(input);
    samples.push(Number(lastResult?.durationMs) || 0);
  }
  const stats = summarize(samples);
  return {
    id: def.id,
    label: def.label,
    input: formatInputForOutput(def, input),
    samples,
    stats,
    lastResult
  };
}

function formatInputForOutput(def, input){
  if(def.id === 'box-dataset'){
    return {
      source: 'test-box.csv',
      rows: Array.isArray(input?.matrix) ? Math.max(0, input.matrix.length - 1) : null,
      columns: Array.isArray(input?.columnIndices) ? input.columnIndices.length : 'all'
    };
  }
  return input;
}

function summarize(samples){
  if(!samples.length){
    return { min: 0, max: 0, mean: 0, median: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((acc, v) => acc + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / samples.length,
    median
  };
}

function loadBaseline(filePath){
  if(!filePath){
    return null;
  }
  const abs = path.resolve(process.cwd(), filePath);
  if(!fs.existsSync(abs)){
    throw new Error(`Baseline file not found: ${filePath}`);
  }
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if(!data || !Array.isArray(data.results)){
    throw new Error('Baseline JSON missing "results" array');
  }
  const map = new Map();
  data.results.forEach(entry => { if(entry && entry.id){ map.set(entry.id, entry); } });
  return { raw: data, map };
}

function formatDelta(current, baseline){
  if(!baseline){
    return { deltaMs: null, deltaPct: null };
  }
  const prev = baseline.stats?.mean;
  if(!Number.isFinite(prev) || prev === 0){
    return { deltaMs: null, deltaPct: null };
  }
  const deltaMs = current.stats.mean - prev;
  const deltaPct = (deltaMs / prev) * 100;
  return { deltaMs, deltaPct };
}

function writeJson(pathname, payload){
  const abs = path.resolve(process.cwd(), pathname);
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(payload, null, 2));
  console.log(`\nSaved benchmark JSON -> ${abs}`);
}

function formatNumber(value, digits = 2){
  return Number(value).toFixed(digits);
}

function main(){
  let options;
  try{
    options = parseArgs(process.argv.slice(2));
  }catch(err){
    console.error(`\nBenchmark argument error: ${err.message}`);
    printHelp();
    process.exit(1);
  }

  const subset = options.include && options.include.length
    ? BENCHMARKS.filter(def => options.include.includes(def.id))
    : BENCHMARKS;
  if(!subset.length){
    console.error('No benchmarks selected.');
    process.exit(1);
  }

  let baseline = null;
  if(options.comparePath){
    try{
      baseline = loadBaseline(options.comparePath);
    }catch(err){
      console.error(`Baseline load error: ${err.message}`);
      process.exit(1);
    }
  }

  const results = [];
  subset.forEach(def => {
    try{
      const entry = runBenchmark(def, options.overrides, options.iterations);
      const delta = baseline ? formatDelta(entry, baseline.map.get(def.id)) : { deltaMs: null, deltaPct: null };
      entry.delta = delta;
      results.push(entry);
    }catch(err){
      console.error(`Benchmark failed for ${def.id}: ${err.message}`);
      process.exitCode = 1;
    }
  });

  if(!results.length){
    console.error('No benchmark results captured.');
    process.exit(process.exitCode || 1);
  }

  console.log(`\nVenn component benchmarks (${options.iterations} iteration${options.iterations === 1 ? '' : 's'})`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('Component        Mean ms   Median   Min   Max   Δ ms   Δ %');
  console.log('───────────────────────────────────────────────────────────────');
  results.forEach(entry => {
    const deltaMs = entry.delta?.deltaMs;
    const deltaPct = entry.delta?.deltaPct;
    const deltaLabel = Number.isFinite(deltaMs) ? formatNumber(deltaMs, 2) : '—';
    const deltaPctLabel = Number.isFinite(deltaPct) ? formatNumber(deltaPct, 2) : '—';
    console.log(
      `${entry.id.padEnd(15)} ${formatNumber(entry.stats.mean, 2).padStart(7)} ` +
      `${formatNumber(entry.stats.median, 2).padStart(7)} ${formatNumber(entry.stats.min, 2).padStart(6)} ${formatNumber(entry.stats.max, 2).padStart(6)} ` +
      `${deltaLabel.padStart(6)} ${deltaPctLabel.padStart(6)}`
    );
  });

  if(options.jsonPath){
    const payload = {
      generatedAt: new Date().toISOString(),
      iterations: options.iterations,
      overrides: options.overrides,
      results: results.map(entry => ({
        id: entry.id,
        label: entry.label,
        input: entry.input,
        stats: entry.stats,
        samples: entry.samples,
        delta: entry.delta,
        lastResult: entry.lastResult
      }))
    };
    try{
      writeJson(options.jsonPath, payload);
    }catch(err){
      console.error(`Failed to write JSON: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

main();
