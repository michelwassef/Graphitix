#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { chromium } = require('playwright');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('../e2e/helpers/workspaceHarness');

const PORT = Number(process.env.PLAYWRIGHT_WEB_PORT || 4173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const CSV_PATH = process.env.BOX_BENCH_CSV
  ? path.resolve(process.cwd(), process.env.BOX_BENCH_CSV)
  : path.resolve(__dirname, '../__tests__/test-box-large.csv');
const ITERATIONS = Math.max(1, Number(process.env.BOX_BENCH_ITERATIONS) || 6);
const FORCE_VIEW_DRAW = process.env.BOX_BENCH_FORCE_VIEW_DRAW === '1';
const DISABLE_LIVE_STYLE = process.env.BOX_BENCH_DISABLE_LIVE_STYLE === '1';
const INIT_TIMEOUT_MS = Math.max(120000, Number(process.env.BOX_BENCH_INIT_TIMEOUT_MS) || 180000);
const OUTPUT_PATH = process.env.BOX_BENCH_OUTPUT
  ? path.resolve(process.cwd(), process.env.BOX_BENCH_OUTPUT)
  : null;

function percentile(values, p) {
  if (!Array.isArray(values) || !values.length) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (sorted.length - 1) * Math.min(Math.max(p, 0), 1);
  const base = Math.floor(idx);
  const rest = idx - base;
  const baseValue = sorted[base];
  const nextValue = sorted[base + 1];
  if (!Number.isFinite(nextValue)) {
    return baseValue;
  }
  return baseValue + rest * (nextValue - baseValue);
}

function summarizeSeries(values) {
  const safe = (values || []).filter(v => Number.isFinite(v));
  if (!safe.length) {
    return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  }
  const total = safe.reduce((sum, v) => sum + v, 0);
  return {
    count: safe.length,
    avgMs: Number((total / safe.length).toFixed(3)),
    p50Ms: Number(percentile(safe, 0.5).toFixed(3)),
    p95Ms: Number(percentile(safe, 0.95).toFixed(3)),
    minMs: Number(Math.min(...safe).toFixed(3)),
    maxMs: Number(Math.max(...safe).toFixed(3))
  };
}

function fetchUrl(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
        resolve(true);
      } else {
        reject(new Error(`status=${res.statusCode}`));
      }
      res.resume();
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

async function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now();
  let lastErr = null;
  while ((Date.now() - start) < timeoutMs) {
    try {
      await fetchUrl(url, 2000);
      return true;
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`Server not ready at ${url}: ${lastErr ? lastErr.message : 'unknown error'}`);
}

function startServer() {
  const args = ['scripts/e2e-server.cjs', '--port', String(PORT)];
  const child = spawn('node', args, {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => {
    const text = String(chunk || '').trim();
    if (text) {
      console.log(`[server] ${text}`);
    }
  });
  child.stderr.on('data', chunk => {
    const text = String(chunk || '').trim();
    if (text) {
      console.error(`[server] ${text}`);
    }
  });
  return child;
}

async function collectEntryCount(page, label) {
  return page.evaluate(targetLabel => {
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    return entries.filter(entry => String(entry?.label || '') === targetLabel).length;
  }, label);
}

async function waitForEntryIncrease(page, label, beforeCount, timeoutMs = 120000) {
  await page.waitForFunction(
    ({ targetLabel, baseline }) => {
      const entries = Array.isArray(window.Shared?.Performance?._entries)
        ? window.Shared.Performance._entries
        : [];
      const count = entries.filter(entry => String(entry?.label || '') === targetLabel).length;
      return count > baseline;
    },
    { targetLabel: label, baseline: beforeCount },
    { timeout: timeoutMs }
  );
}

async function getLastDuration(page, label) {
  return page.evaluate(targetLabel => {
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (String(entry?.label || '') === targetLabel && Number.isFinite(entry?.duration)) {
        return Number(entry.duration);
      }
    }
    return NaN;
  }, label);
}

async function ensureInitialBoxRender(page) {
  await page.waitForFunction(() => {
    return !!window.Components?.box?.__getState?.()?.hot;
  }, null, { timeout: INIT_TIMEOUT_MS });

  const beforeDraw = await collectEntryCount(page, 'box.draw');
  await page.evaluate(() => {
    const api = window.Components?.box;
    if (api && typeof api.draw === 'function') {
      api.draw({ force: true, reason: 'benchmark-init' });
    }
  });
  await waitForEntryIncrease(page, 'box.draw', beforeDraw, INIT_TIMEOUT_MS);

  await page.waitForFunction(() => {
    return !!document.querySelector('#boxPlot svg');
  }, null, { timeout: INIT_TIMEOUT_MS });
}

async function runActionIterations(page, actionId, runAction, iterations = ITERATIONS) {
  const wallTimes = [];
  const drawTimes = [];
  const collectTimes = [];
  const drawIncrements = [];
  for (let i = 0; i < iterations; i += 1) {
    const beforeDraw = await collectEntryCount(page, 'box.draw');
    const beforeCollect = await collectEntryCount(page, 'box.data.collect');
    const t0 = Date.now();
    await runAction(i);
    if (FORCE_VIEW_DRAW) {
      await page.evaluate(() => {
        const api = window.Components?.box;
        if (api && typeof api.draw === 'function') {
          api.draw({ viewOnly: true, force: true, reason: 'benchmark-action' });
        }
      });
      await waitForEntryIncrease(page, 'box.draw', beforeDraw, 120000);
    } else {
      await page.waitForTimeout(180);
    }
    const afterDraw = await collectEntryCount(page, 'box.draw');
    drawIncrements.push(Math.max(0, afterDraw - beforeDraw));
    wallTimes.push(Date.now() - t0);
    drawTimes.push(afterDraw > beforeDraw ? await getLastDuration(page, 'box.draw') : 0);
    const afterCollect = await collectEntryCount(page, 'box.data.collect');
    collectTimes.push(afterCollect - beforeCollect);
  }
  return {
    action: actionId,
    iterations,
    wallMs: summarizeSeries(wallTimes),
    boxDrawMs: summarizeSeries(drawTimes),
    dataCollectIncrements: collectTimes,
    drawIncrements
  };
}

async function runBenchmark(page) {
  const datasetInfo = await page.evaluate(() => {
    const hot = window.Components?.box?.__getState?.()?.hot;
    const data = hot?.getData?.() || [];
    return {
      rows: Array.isArray(data) ? data.length : 0,
      cols: Array.isArray(data?.[0]) ? data[0].length : 0
    };
  });

  const renderMeta = await page.evaluate(() => {
    const svg = document.querySelector('#boxPlot svg');
    const pointNodes = svg
      ? svg.querySelectorAll('g[data-export-layer="box-points"] circle, g[data-export-layer="box-points"] rect, g[data-export-layer="box-points"] path')
      : [];
    return {
      hasSvg: !!svg,
      pointNodeCount: pointNodes.length
    };
  });

  await page.evaluate(() => {
    window.Shared?.Performance?.clear?.();
  });

  const colorSchemeResult = await runActionIterations(
    page,
    'color-scheme',
    async index => {
      const schemes = ['scientific', 'grayscale', 'highcontrast', 'pastel'];
      const nextScheme = schemes[index % schemes.length];
      await page.evaluate(schemeId => {
        if (window.Shared?.colorSchemes?.applyToActiveTab) {
          window.Shared.colorSchemes.applyToActiveTab('box', schemeId);
          return;
        }
        const select = document.getElementById('boxColorSchemeSelect');
        if (!select) {
          return;
        }
        select.value = schemeId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, nextScheme);
    }
  );

  const gridToggleResult = await runActionIterations(
    page,
    'grid-toggle',
    async () => {
      await page.evaluate(() => {
        const toggle = document.getElementById('boxShowGrid');
        if (!toggle) {
          return;
        }
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  );

  const legendToggleResult = await runActionIterations(
    page,
    'legend-toggle',
    async () => {
      await page.evaluate(() => {
        const toggle = document.getElementById('boxShowLegend');
        if (!toggle) {
          return;
        }
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  );

  const frameToggleResult = await runActionIterations(
    page,
    'frame-toggle',
    async () => {
      await page.evaluate(() => {
        const toggle = document.getElementById('boxShowFrame');
        if (!toggle) {
          return;
        }
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  );

  const report = await page.evaluate(() => {
    const performance = window.Shared?.Performance;
    const summary = typeof performance?.getReport === 'function'
      ? performance.getReport({ groupBy: 'label' })
      : [];
    return Array.isArray(summary) ? summary.slice(0, 12) : [];
  });

  return {
    dataset: datasetInfo,
    renderMeta,
    mode: FORCE_VIEW_DRAW ? 'forced-view-redraw' : 'action-only',
    liveStyle: DISABLE_LIVE_STYLE ? 'disabled' : 'enabled',
    results: [colorSchemeResult, gridToggleResult, frameToggleResult, legendToggleResult],
    perfTop: report
  };
}

async function main() {
  const server = startServer();
  let browser;
  try {
    await waitForServer(`${BASE_URL}/index.html`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
      { first: true }
    );
    await page.setInputFiles('#boxFile', CSV_PATH);
    await ensureInitialBoxRender(page);
    await page.evaluate(disableLiveStyle => {
      window.__BOX_DISABLE_STRIP_LIVE_STYLE = disableLiveStyle === true;
    }, DISABLE_LIVE_STYLE);

    const output = await runBenchmark(page);
    if (OUTPUT_PATH) {
      fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
    }
    console.log(JSON.stringify(output, null, 2));
    await context.close();
  } finally {
    if (browser) {
      await browser.close();
    }
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
  }
}

main().catch(err => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
