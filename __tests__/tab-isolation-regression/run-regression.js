#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { chromium } = require('@playwright/test');
const { analyzeGraphFile } = require('./analyze-graph-file');
const { analyzeLogs } = require('./analyze-logs');

const DEFAULT_COMPONENTS = [
  'box',
  'scatter',
  'line',
  'hist',
  'heatmap',
  'pca',
  'pie',
  'roc',
  'survival',
  'venn',
  'surface'
];

function parseArgs(argv) {
  const out = {
    appRoot: process.cwd(),
    outDir: '',
    components: DEFAULT_COMPONENTS.slice(),
    headed: false,
    keepOpen: false,
    port: 0,
    timeoutMs: 240000,
    phaseTimeoutMs: 0
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--app-root') out.appRoot = next();
    else if (arg === '--out-dir') out.outDir = next();
    else if (arg === '--components') out.components = String(next() || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--headed') out.headed = true;
    else if (arg === '--keep-open') out.keepOpen = true;
    else if (arg === '--port') out.port = Number(next() || 0);
    else if (arg === '--timeout-ms') out.timeoutMs = Number(next() || out.timeoutMs);
    else if (arg === '--phase-timeout-ms') out.phaseTimeoutMs = Number(next() || 0);
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node tests/tab-isolation-regression/run-regression.js [options]\n\nOptions:\n  --app-root <path>       Graphitix project root. Default: current directory\n  --out-dir <path>        Output folder. Default: tests/tab-isolation-regression/artifacts/<timestamp>\n  --components <csv>      Components to test. Default: ${DEFAULT_COMPONENTS.join(',')}\n  --headed                Show the browser window\n  --keep-open             Keep browser open after test\n  --port <port>           Static server port. Default: random free port\n  --timeout-ms <ms>       Global timeout. Default: 240000\n  --phase-timeout-ms <ms> Per-phase watchdog timeout. Default: --timeout-ms\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.woff2') return 'font/woff2';
  if (ext === '.graph' || ext === '.zip') return 'application/zip';
  return 'application/octet-stream';
}

function safeResolve(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0].split('#')[0]);
  const clean = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.resolve(root, `.${clean}`);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved)) {
    return null;
  }
  return resolved;
}

function createStaticServer(root, preferredPort = 0) {
  const server = http.createServer((req, res) => {
    const filePath = safeResolve(root, req.url || '/');
    if (!filePath) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      res.setHeader('Content-Type', contentType(filePath));
      res.setHeader('Cache-Control', 'no-store');
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(preferredPort, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port, url: `http://127.0.0.1:${address.port}/index.html` });
    });
  });
}

function serializeConsoleMessage(msg) {
  const type = msg.type();
  const text = msg.text();
  const loc = msg.location();
  return `${new Date().toISOString()} [${type}] ${loc.url ? `${path.basename(loc.url)}:${loc.lineNumber}` : ''} ${text}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function collectCacheReuseFailures(summary, label, options = {}) {
  const failures = [];
  const rows = summary?.byType ? Object.values(summary.byType) : [];
  if (!rows.length) {
    return failures;
  }
  rows.forEach(row => {
    const type = row?.type || 'unknown';
    const switches = Number(row?.switches) || 0;
    if (switches <= 0) {
      return;
    }
    const redraw = Number(row?.drawObserved) || 0;
    const missingSaved = Number(row?.missingSavedCacheBeforeSwitch) || 0;
    if (redraw > 0) {
      failures.push(`${label}: ${type} performed redraw on ${redraw}/${switches} switch(es)`);
    }
    if (options.requireSavedCache === true && missingSaved > 0) {
      failures.push(`${label}: ${type} missing saved render cache before ${missingSaved}/${switches} switch(es)`);
    }
  });
  return failures;
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function writePhaseLog(outDir, phaseName, lines) {
  const file = path.join(outDir, `${phaseName}.log`);
  fs.writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  return file;
}

function decodeBase64ToFile(base64, filePath) {
  const clean = String(base64 || '').replace(/^data:[^,]+,/, '');
  const buf = Buffer.from(clean, 'base64');
  fs.writeFileSync(filePath, buf);
  return buf.length;
}

function withTimeout(promise, timeoutMs, label) {
  const ms = Math.max(1000, Number(timeoutMs) || 0);
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms} ms`);
      err.code = 'GRAPHITIX_REGRESSION_PHASE_TIMEOUT';
      err.phase = label;
      reject(err);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

async function captureDiagnostics(page, outDir, phaseName, extra = {}) {
  const diagnostics = {
    phaseName,
    capturedAt: new Date().toISOString(),
    extra
  };
  try {
    diagnostics.page = await withTimeout(page.evaluate(() => {
      const ws = window.Main?.session?.workspaceState || null;
      const activeTab = typeof window.Main?.session?.getActiveTab === 'function'
        ? window.Main.session.getActiveTab()
        : null;
      const tabs = Array.isArray(ws?.tabs)
        ? ws.tabs.map(tab => ({
            id: tab?.id || null,
            type: tab?.type || null,
            title: tab?.title || null,
            isWelcome: !!tab?.isWelcome,
            hasPayload: !!tab?.payload,
            hasLayoutState: !!tab?.layoutState,
            hasRenderCache: !!tab?.renderCache,
            hasArchiveRenderCache: !!tab?.archiveRenderCache,
            activationError: tab?.activationError || null
          }))
        : [];
      return {
        readyState: document.readyState,
        url: location.href,
        hasMain: !!window.Main,
        hasShared: !!window.Shared,
        hasRegressionHarness: !!window.GraphitixRegression,
        activeTabId: ws?.activeTabId || null,
        activeTab: activeTab ? { id: activeTab.id, type: activeTab.type, title: activeTab.title } : null,
        tabCount: tabs.length,
        tabs,
        loadedWorkspaces: ws?.loadedWorkspaces ? Object.keys(ws.loadedWorkspaces) : [],
        renderedWorkspaceByType: ws?.renderedWorkspaceByType || null
      };
    }), 5000, `${phaseName}:diagnostics-evaluate`);
  } catch (err) {
    diagnostics.pageError = err?.message || String(err);
  }
  const jsonPath = path.join(outDir, `${phaseName}.diagnostics.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(diagnostics, null, 2), 'utf8');
  try {
    await page.screenshot({ path: path.join(outDir, `${phaseName}.png`), fullPage: true, timeout: 5000 });
  } catch (_err) {
    // Screenshot failure should not mask the original failure.
  }
  return jsonPath;
}

async function main() {
  const opts = parseArgs(process.argv);
  const appRoot = path.resolve(opts.appRoot);
  if (!fs.existsSync(path.join(appRoot, 'index.html'))) {
    throw new Error(`App root does not contain index.html: ${appRoot}`);
  }
  const outDir = opts.outDir
    ? path.resolve(opts.outDir)
    : path.resolve(appRoot, 'tests', 'tab-isolation-regression', 'artifacts', timestampForPath());
  ensureDir(outDir);

  const harnessPath = path.resolve(__dirname, 'renderer-harness.js');
  const { server, url } = await createStaticServer(appRoot, opts.port);
  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(opts.timeoutMs);
  page.setDefaultNavigationTimeout(opts.timeoutMs);
  const phaseTimeoutMs = Math.max(1000, Number(opts.phaseTimeoutMs) || Number(opts.timeoutMs) || 240000);

  const allLogs = [];
  let phaseLogs = [];
  const resetPhase = () => { phaseLogs = []; };
  const captureLine = line => {
    allLogs.push(line);
    phaseLogs.push(line);
    if (/\[regression-progress\]|\[pageerror\]|\[requestfailed\]|\[(error|warning)\]/i.test(line)) {
      console.log(line);
    }
  };

  page.on('console', msg => captureLine(serializeConsoleMessage(msg)));
  page.on('pageerror', err => captureLine(`${new Date().toISOString()} [pageerror] ${err.stack || err.message || String(err)}`));
  page.on('requestfailed', req => captureLine(`${new Date().toISOString()} [requestfailed] ${req.url()} ${req.failure()?.errorText || ''}`));

  console.log(`[Graphitix regression] App root: ${appRoot}`);
  console.log(`[Graphitix regression] Output:   ${outDir}`);
  console.log(`[Graphitix regression] URL:      ${url}`);
  console.log(`[Graphitix regression] Components: ${opts.components.join(', ')}`);
  console.log(`[Graphitix regression] Phase timeout: ${phaseTimeoutMs} ms`);

  const runPhase = async (phaseName, fn) => {
    console.log(`[Graphitix regression] Starting ${phaseName}...`);
    resetPhase();
    try {
      const result = await withTimeout(fn(), phaseTimeoutMs, phaseName);
      await writePhaseLog(outDir, `${phaseName}`, phaseLogs);
      console.log(`[Graphitix regression] Completed ${phaseName}.`);
      return result;
    } catch (err) {
      await writePhaseLog(outDir, `${phaseName}`, phaseLogs).catch(() => {});
      const diagnosticsPath = await captureDiagnostics(page, outDir, phaseName, {
        message: err?.message || String(err),
        code: err?.code || null
      }).catch(() => null);
      if (diagnosticsPath) {
        console.error(`[Graphitix regression] Diagnostics written: ${diagnosticsPath}`);
      }
      throw err;
    }
  };

  try {
    await runPhase('00_boot', async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs });
      await page.waitForFunction(() => !!window.Main?.tabs && !!window.Main?.session && !!window.Main?.sessionActions, null, { timeout: opts.timeoutMs });
      await page.addScriptTag({ path: harnessPath });
      await page.waitForFunction(() => !!window.GraphitixRegression?.runCreateWorkspace, null, { timeout: opts.timeoutMs });
      return true;
    });

    const createSummary = await runPhase('01_create_workspace', () => page.evaluate(async components => {
      return window.GraphitixRegression.runCreateWorkspace({ components, tabsPerComponent: 2 });
    }, opts.components));

    const initialSwitchSummary = await runPhase('02_initial_switching', () => page.evaluate(async () => {
      return window.GraphitixRegression.runSwitchingPhase({ phase: 'initial-switching' });
    }));

    const saveResult = await runPhase('03_file_save', () => page.evaluate(async () => {
      return window.GraphitixRegression.runSavePhase({ fileName: 'workspace-regression.graph' });
    }));

    const graphFile = path.join(outDir, 'workspace-regression.graph');
    const graphSize = decodeBase64ToFile(saveResult.base64, graphFile);

    const reopenedColdCacheSummary = await runPhase('04_reopened_cold_cache', () => page.evaluate(async base64 => {
      return window.GraphitixRegression.runReopenColdCachePhase({ base64, fileName: 'workspace-regression.graph' });
    }, saveResult.base64));

    const reopenedLiveSwitchSummary = await runPhase('05_reopened_live_switching', () => page.evaluate(async () => {
      return window.GraphitixRegression.runSwitchingPhase({ phase: 'reopened-live-switching', primeRenderCaches: false });
    }));

    const resizeAfterSwitchSummary = await runPhase('06_resize_after_switch', () => page.evaluate(async () => {
      return window.GraphitixRegression.runResizeAfterSwitchPhase({ pointerDx: -120, pointerDy: -96 });
    }));
    const homogeneousSwitchSummary = await runPhase('07_homogeneous_switching', () => page.evaluate(async () => {
      return window.GraphitixRegression.runHomogeneousSwitchingPhase({ phase: 'homogeneous-switching', tabsPerComponent: 2 });
    }));

    fs.writeFileSync(path.join(outDir, 'full-console.log'), allLogs.join('\n') + '\n', 'utf8');

    const graphAnalysis = await analyzeGraphFile(graphFile, { quiet: true });
    const logAnalysis = analyzeLogs({
      initialLogPath: path.join(outDir, '02_initial_switching.log'),
      saveLogPath: path.join(outDir, '03_file_save.log'),
      coldLogPath: path.join(outDir, '04_reopened_cold_cache.log'),
      reopenedLogPath: path.join(outDir, '05_reopened_live_switching.log'),
      quiet: true
    });

    const cacheReuseSummary = {
      createdAt: new Date().toISOString(),
      initial: initialSwitchSummary?.cacheReuseSummary || null,
      reopenedCold: reopenedColdCacheSummary?.cacheReuseSummary || null,
      reopenedLive: reopenedLiveSwitchSummary?.cacheReuseSummary || null
    };
    const finalSummary = {
      createdAt: new Date().toISOString(),
      appRoot,
      outDir,
      graphFile,
      graphSize,
      createSummary,
      initialSwitchSummary,
      saveResult: { ...saveResult, base64: undefined, byteLength: graphSize },
      reopenedColdCacheSummary,
      reopenedLiveSwitchSummary,
      resizeAfterSwitchSummary,
      homogeneousSwitchSummary,
      cacheReuseSummary,
      graphAnalysis,
      logAnalysis
    };

    const failures = [];
    if (graphAnalysis.failures?.length) failures.push(...graphAnalysis.failures.map(x => `graph: ${x}`));
    if (logAnalysis.failures?.length) failures.push(...logAnalysis.failures.map(x => `logs: ${x}`));
    if (createSummary.failures?.length) failures.push(...createSummary.failures.map(x => `create: ${x}`));
    if (initialSwitchSummary.failures?.length) failures.push(...initialSwitchSummary.failures.map(x => `initial: ${x}`));
    if (reopenedColdCacheSummary.failures?.length) failures.push(...reopenedColdCacheSummary.failures.map(x => `reopened-cold: ${x}`));
    if (reopenedLiveSwitchSummary.failures?.length) failures.push(...reopenedLiveSwitchSummary.failures.map(x => `reopened-live: ${x}`));
    if (resizeAfterSwitchSummary.failures?.length) failures.push(...resizeAfterSwitchSummary.failures.map(x => `resize-after-switch: ${x}`));
    if (homogeneousSwitchSummary.failures?.length) failures.push(...homogeneousSwitchSummary.failures.map(x => `homogeneous-switching: ${x}`));
    failures.push(...collectCacheReuseFailures(cacheReuseSummary.reopenedCold, 'reopened-cold-cache', { requireSavedCache: true }));
    failures.push(...collectCacheReuseFailures(cacheReuseSummary.reopenedLive, 'reopened-live-switching'));
    finalSummary.failures = failures;
    finalSummary.status = failures.length ? 'FAIL' : 'PASS';

    fs.writeFileSync(path.join(outDir, 'regression-summary.json'), JSON.stringify(finalSummary, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, 'cache-reuse-summary.json'), JSON.stringify(cacheReuseSummary, null, 2), 'utf8');

    console.log('\n[Graphitix regression] Summary');
    console.log(`  Status: ${finalSummary.status}`);
    console.log(`  Graph tabs: ${graphAnalysis.counts.tabs}`);
    console.log(`  Payload files: ${graphAnalysis.counts.payload}`);
    console.log(`  Layout files: ${graphAnalysis.counts.layout}`);
    console.log(`  Preview files: ${graphAnalysis.counts.preview}`);
    console.log(`  Render-cache files: ${graphAnalysis.counts.renderCache}`);
    console.log(`  Log warnings/errors flagged: ${logAnalysis.failures.length}`);
    console.log(`  Artifacts: ${outDir}`);

    const printCacheReusePhase = (label, summary) => {
      if (!summary || !summary.byType) return;
      console.log(`\n[Graphitix regression] Cache/reuse paths: ${label}`);
      Object.values(summary.byType).sort((a, b) => String(a.type).localeCompare(String(b.type))).forEach(row => {
        const outcomes = Object.entries(row.outcomes || {}).map(([key, value]) => `${key}=${value}`).join(', ');
        console.log(`  - ${row.type}: saved-cache=${row.savedRenderCacheReused || 0}/${row.switches}, runtime-cache=${row.runtimeRenderCacheReused || 0}/${row.switches}, live-dom=${row.liveDomReused || 0}/${row.switches}, redraw=${row.drawObserved || 0}/${row.switches}, missing-saved-cache=${row.missingSavedCacheBeforeSwitch || 0}/${row.switches}${outcomes ? ` (${outcomes})` : ''}`);
      });
      if (summary.slowTypes && summary.slowTypes.length) {
        console.log(`    slow/redraw types: ${summary.slowTypes.join(', ')}`);
      }
      if (summary.savedCacheMissingTypes && summary.savedCacheMissingTypes.length) {
        console.log(`    missing saved-cache types: ${summary.savedCacheMissingTypes.join(', ')}`);
      }
      if (summary.liveDomReuseTypes && summary.liveDomReuseTypes.length) {
        console.log(`    live DOM reuse types: ${summary.liveDomReuseTypes.join(', ')}`);
      }
      if (summary.fullCacheReuseTypes && summary.fullCacheReuseTypes.length) {
        console.log(`    full render-cache reuse types: ${summary.fullCacheReuseTypes.join(', ')}`);
      }
    };
    printCacheReusePhase('initial warmed switching', cacheReuseSummary.initial);
    printCacheReusePhase('cold first activation after reopen', cacheReuseSummary.reopenedCold);
    printCacheReusePhase('live switching after reopen', cacheReuseSummary.reopenedLive);

    if (failures.length) {
      console.log('\n[Graphitix regression] FAILURES');
      failures.forEach(f => console.log(`  - ${f}`));
      process.exitCode = 1;
    }

    if (opts.keepOpen) {
      console.log('\n[Graphitix regression] Browser left open. Press Ctrl+C to stop.');
      await new Promise(() => {});
    }
  } finally {
    if (!opts.keepOpen) {
      await browser.close().catch(() => {});
      server.close();
    }
  }
}

main().catch(err => {
  console.error('[Graphitix regression] Fatal error');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
