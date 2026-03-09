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
const CSV_PATH = path.resolve(__dirname, '../__tests__/test-scatter.csv');
const ITERATIONS = Math.max(1, Number(process.env.SCATTER_BENCH_ITERATIONS) || 6);
const OUTPUT_PATH = process.env.SCATTER_BENCH_OUTPUT
  ? path.resolve(process.cwd(), process.env.SCATTER_BENCH_OUTPUT)
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

async function runActionIterations(page, actionId, runAction, iterations = ITERATIONS) {
  const wallTimes = [];
  const drawTimes = [];
  const svgDrawTimes = [];
  const attachTimes = [];
  const collectTimes = [];
  for (let i = 0; i < iterations; i += 1) {
    const beforeDraw = await collectEntryCount(page, 'scatter.draw');
    const beforeCollect = await collectEntryCount(page, 'scatter.data.collect');
    const t0 = Date.now();
    await runAction(i);
    await waitForEntryIncrease(page, 'scatter.draw', beforeDraw);
    const wall = Date.now() - t0;
    wallTimes.push(wall);
    drawTimes.push(await getLastDuration(page, 'scatter.draw'));
    svgDrawTimes.push(await getLastDuration(page, 'scatter.svg.draw'));
    attachTimes.push(await getLastDuration(page, 'scatter.svg.attach'));
    const afterCollect = await collectEntryCount(page, 'scatter.data.collect');
    collectTimes.push(afterCollect - beforeCollect);
  }
  return {
    action: actionId,
    iterations,
    wallMs: summarizeSeries(wallTimes),
    scatterDrawMs: summarizeSeries(drawTimes),
    svgDrawMs: summarizeSeries(svgDrawTimes),
    svgAttachMs: summarizeSeries(attachTimes),
    dataCollectIncrements: collectTimes
  };
}

async function runBenchmark(page) {
  const datasetInfo = await page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    const data = hot?.getData?.() || [];
    return {
      rows: Array.isArray(data) ? data.length : 0,
      cols: Array.isArray(data?.[0]) ? data[0].length : 0
    };
  });

  await page.evaluate(() => {
    window.Shared?.Performance?.clear?.();
  });

  const initialDrawCount = await collectEntryCount(page, 'scatter.draw');
  await page.locator('#scatterRenderButton').click();
  await waitForEntryIncrease(page, 'scatter.draw', initialDrawCount);

  const renderMeta = await page.evaluate(() => {
    const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
    const mode = layer?.getAttribute?.('data-render-mode') || null;
    const nodes = layer ? layer.querySelectorAll('*').length : 0;
    return { mode, nodes };
  });

  const colorResult = await runActionIterations(
    page,
    'fill-color-input',
    async index => {
      const palette = ['#1f78b4', '#33a02c', '#e31a1c', '#ff7f00', '#6a3d9a', '#b15928'];
      const color = palette[index % palette.length];
      await page.evaluate(nextColor => {
        const input = document.getElementById('scatterFill');
        if (!input) {
          return;
        }
        input.value = nextColor;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, color);
    }
  );

  await page.evaluate(() => {
    const lineToggle = document.getElementById('scatterShowLine');
    if (lineToggle && !lineToggle.checked) {
      lineToggle.checked = true;
      lineToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  const statsButton = page.locator('#scatterComputeStats');
  let statsComputationReady = false;
  if (await statsButton.count()) {
    await statsButton.click();
    try {
      await page.waitForFunction(() => {
        const status = document.getElementById('scatterStatsStatus');
        const text = (status?.textContent || '').toLowerCase();
        const button = document.getElementById('scatterComputeStats');
        const buttonLabel = (button?.textContent || '').toLowerCase();
        const buttonDone = !!button && !button.disabled && !buttonLabel.includes('calculating');
        return text.includes('up to date') || text.includes('ready') || buttonDone;
      }, null, { timeout: 300000 });
      statsComputationReady = true;
    } catch (err) {
      statsComputationReady = false;
    }
  }

  const trendlineResult = await runActionIterations(
    page,
    'trendline-toggle',
    async () => {
      await page.evaluate(() => {
        const toggle = document.getElementById('scatterShowLine');
        if (!toggle) {
          return;
        }
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  );

  const statsOverlayResult = await runActionIterations(
    page,
    'stats-overlay-toggle',
    async () => {
      await page.evaluate(() => {
        const toggle = document.getElementById('scatterShowPlotStats');
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
    statsComputationReady,
    results: [colorResult, trendlineResult, statsOverlayResult],
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
      { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
      { first: true }
    );
    await page.setInputFiles('#scatterFile', CSV_PATH);
    await page.waitForSelector('#scatterRenderButton', { timeout: 180000 });
    await page.waitForFunction(() => {
      const notice = document.getElementById('scatterAutoDrawNotice');
      const text = (notice?.textContent || '').toLowerCase();
      return text.includes('paused') || text.includes('disabled');
    }, null, { timeout: 180000 });

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
