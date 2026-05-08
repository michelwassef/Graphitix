const fs = require('fs');
const path = require('path');

const KNOWN_NON_FATAL_LOG_PATTERNS = [
  /AG Grid: invalid gridOptions property 'columnBuffer'/i,
  /AG Grid: to see all the valid gridOptions properties/i,
  /AG Grid: The return of `getRowHeight` cannot be zero/i,
  /The Components object is deprecated\./i
];

const CDN_OVERRIDE_ENTRIES = [
  {
    match: /\/ag-grid-community@32\.3\.3\/styles\/ag-grid\.css$/i,
    localPath: path.resolve(__dirname, '../../node_modules/ag-grid-community/styles/ag-grid.css'),
    contentType: 'text/css; charset=utf-8'
  },
  {
    match: /\/ag-grid-community@32\.3\.3\/styles\/ag-theme-balham\.css$/i,
    localPath: path.resolve(__dirname, '../../node_modules/ag-grid-community/styles/ag-theme-balham.css'),
    contentType: 'text/css; charset=utf-8'
  },
  {
    match: /\/ag-grid-community@32\.3\.3\/dist\/ag-grid-community\.min\.noStyle\.js$/i,
    localPath: path.resolve(__dirname, '../../node_modules/ag-grid-community/dist/ag-grid-community.min.noStyle.js'),
    contentType: 'text/javascript; charset=utf-8'
  },
  {
    match: /\/jstat@1\.9\.5\/dist\/jstat\.min\.js$/i,
    localPath: path.resolve(__dirname, '../../node_modules/jstat/dist/jstat.min.js'),
    contentType: 'text/javascript; charset=utf-8'
  },
  {
    match: /\/jszip@3\.10\.1\/dist\/jszip\.min\.js$/i,
    localPath: path.resolve(__dirname, '../../node_modules/jszip/dist/jszip.min.js'),
    contentType: 'text/javascript; charset=utf-8'
  },
  {
    match: /\/svd-js@1\.1\.1\/build-umd\/svd-js\.min\.js$/i,
    localPath: path.resolve(__dirname, '../../node_modules/svd-js/build-umd/svd-js.min.js'),
    contentType: 'text/javascript; charset=utf-8'
  },
  {
    match: /\/npm\/chart\.js(?:@[^/]+)?\/?$/i,
    localPath: path.resolve(__dirname, '../../node_modules/chart.js/dist/chart.umd.js'),
    contentType: 'text/javascript; charset=utf-8'
  }
];

const CDN_OVERRIDE_CACHE = new Map();

const COMPONENT_MATRIX = [
  { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' },
  { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
  { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
  { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' },
  { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample' },
  { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
  { type: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample' },
  { type: 'roc', pageId: 'rocPage', exampleButtonId: 'rocLoadExample' },
  { type: 'survival', pageId: 'survivalPage', exampleButtonId: 'survivalLoadExample' },
  { type: 'hist', pageId: 'histPage', exampleButtonId: 'histLoadExample' },
  { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' }
];

function shouldIgnoreConsoleEntry(text) {
  return KNOWN_NON_FATAL_LOG_PATTERNS.some(pattern => pattern.test(String(text || '')));
}

function readOverrideBody(entry) {
  const key = entry.localPath;
  if (CDN_OVERRIDE_CACHE.has(key)) {
    return CDN_OVERRIDE_CACHE.get(key);
  }
  const body = fs.readFileSync(entry.localPath);
  CDN_OVERRIDE_CACHE.set(key, body);
  return body;
}

async function installLocalCdnOverrides(page) {
  await page.route('https://cdn.jsdelivr.net/**', route => {
    const url = route.request().url();
    const entry = CDN_OVERRIDE_ENTRIES.find(item => item.match.test(url));
    if (!entry) {
      route.continue();
      return;
    }
    try {
      const body = readOverrideBody(entry);
      route.fulfill({
        status: 200,
        contentType: entry.contentType,
        body
      });
    } catch (err) {
      route.abort();
    }
  });
}

function registerIssueCollectors(page) {
  const all = [];
  const critical = [];

  page.on('console', message => {
    const entry = {
      kind: 'console',
      type: message.type(),
      text: message.text()
    };
    all.push(entry);
    if (entry.type === 'error' && !shouldIgnoreConsoleEntry(entry.text)) {
      critical.push(entry);
    }
  });

  page.on('pageerror', err => {
    const entry = {
      kind: 'pageerror',
      type: 'error',
      text: err?.stack || String(err)
    };
    all.push(entry);
    critical.push(entry);
  });

  page.on('requestfailed', request => {
    const entry = {
      kind: 'requestfailed',
      type: 'error',
      text: `${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`
    };
    all.push(entry);
    critical.push(entry);
  });

  return {
    all,
    critical
  };
}

async function maybeHandleDuplicatePrompt(page) {
  const prompt = page.locator('#duplicatePrompt:not([hidden])');
  if (await prompt.count() < 1) {
    return;
  }
  const emptyButton = page.locator('#duplicateEmpty');
  if (await emptyButton.isVisible()) {
    await emptyButton.click();
    await page.waitForTimeout(200);
  }
}

async function openComponentFromWelcome(page, component, options = {}) {
  if (!options.first) {
    await page.locator('#addWorkspaceTab').click();
    await maybeHandleDuplicatePrompt(page);
  }
  const selector = `#graphSelectionGrid [data-graph-type="${component.type}"]`;
  const card = page.locator(selector);
  await page.waitForSelector(selector, { timeout: 20_000 });
  let clicked = false;
  let lastError = null;
  for (let attempt = 0; attempt < 4 && !clicked; attempt += 1) {
    try {
      await card.scrollIntoViewIfNeeded();
      await card.click({ force: true, timeout: 5000 });
      clicked = true;
    } catch (err) {
      lastError = err;
      if (page.isClosed()) {
        throw err;
      }
      await page.waitForTimeout(200 * (attempt + 1));
    }
  }
  if (!clicked && !page.isClosed()) {
    try {
      await page.evaluate((type) => {
        const fn = window.Main?.tabs?.handleGraphSelection;
        if (typeof fn === 'function') {
          fn(type);
        }
      }, component.type);
      clicked = true;
    } catch (err) {
      lastError = err;
    }
  }
  if (!clicked) {
    throw lastError || new Error(`Failed to open component card: ${component.type}`);
  }
  await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
}

async function clickExampleButtonIfPresent(page, buttonId) {
  if (!buttonId) {
    return false;
  }
  const clicked = await page.evaluate((targetId) => {
    const state = window.Main?.session?.workspaceState;
    const activeTab = state?.tabs?.find(tab => tab?.id === state?.activeTabId) || null;
    const type = activeTab?.type || '';
    const mountedRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(activeTab?.id || null, type) || null;
    const pageRoot = type ? document.getElementById(`${type}Page`) : null;
    const searchRoot = mountedRoot || pageRoot || document;
    const button = searchRoot?.querySelector?.(`#${targetId}`) || null;
    if (!button || button.disabled) {
      return false;
    }
    const style = window.getComputedStyle(button);
    if (!button.offsetParent || style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    button.click();
    return true;
  }, buttonId);
  if (!clicked) {
    return false;
  }
  await page.waitForTimeout(700);
  return true;
}

function toMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(3));
}

function normalizePerfEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const id = Number(entry.id);
  const duration = Number(entry.duration);
  return {
    id: Number.isFinite(id) ? id : 0,
    label: typeof entry.label === 'string' ? entry.label : 'unknown',
    duration: Number.isFinite(duration) ? toMs(duration) : 0,
    meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : null
  };
}

function summarizeReportDelta(beforeReport, afterReport) {
  const beforeMap = new Map((beforeReport || []).map(entry => [entry.key, entry]));
  const changes = [];
  for (const entry of (afterReport || [])) {
    const before = beforeMap.get(entry.key);
    const beforeTotal = Number(before?.totalMs || 0);
    const afterTotal = Number(entry.totalMs || 0);
    const deltaTotal = afterTotal - beforeTotal;
    const beforeCount = Number(before?.count || 0);
    const afterCount = Number(entry.count || 0);
    const deltaCount = afterCount - beforeCount;
    if (deltaCount > 0 || deltaTotal > 0.1) {
      changes.push({
        key: entry.key,
        deltaCount,
        deltaTotalMs: toMs(deltaTotal),
        latestAvgMs: Number(entry.avgMs || 0),
        latestP95Ms: Number(entry.p95Ms || 0)
      });
    }
  }
  changes.sort((a, b) => b.deltaTotalMs - a.deltaTotalMs);
  return changes.slice(0, 8);
}

function summarizeHookDelta(beforeHook, afterHook) {
  const sections = ['loadData', 'evaluation', 'draw'];
  const result = {};
  for (const section of sections) {
    const before = beforeHook?.performance?.[section] || null;
    const after = afterHook?.performance?.[section] || null;
    if (!after || typeof after !== 'object') {
      continue;
    }
    const changed = (after?.timestamp || 0) !== (before?.timestamp || 0);
    if (!changed) {
      continue;
    }
    result[section] = {
      totalMs: toMs(after.totalMs),
      parseMs: toMs(after.parseMs),
      computeMs: toMs(after.computeMs),
      renderMs: toMs(after.renderMs),
      rows: Number(after.rows || 0),
      cols: Number(after.cols || 0),
      reason: after.reason || null
    };
  }
  return result;
}

function summarizeSharedEntryDelta(beforeSnapshot, afterSnapshot) {
  const beforeMaxId = Number(beforeSnapshot?.sharedPerformance?.maxEntryId || 0);
  const nextEntries = (afterSnapshot?.sharedPerformance?.entries || [])
    .filter(entry => Number(entry.id) > beforeMaxId)
    .map(normalizePerfEntry)
    .filter(Boolean);
  nextEntries.sort((a, b) => b.duration - a.duration);
  return nextEntries.slice(0, 10);
}

async function collectComponentPerformanceSnapshot(page, componentType) {
  try {
    return await page.evaluate(({ componentType }) => {
      const Shared = window.Shared || {};
      const Components = window.Components || {};
      const perfApi = Shared.Performance || {};
      const allEntries = Array.isArray(perfApi._entries) ? perfApi._entries : [];
      const componentPrefix = `${componentType}.`;
      const relevantEntries = allEntries.filter(entry => {
        const label = typeof entry?.label === 'string' ? entry.label : '';
        return label.startsWith(componentPrefix) || label.startsWith('hot.');
      });
      const reportForPrefix = prefix => {
        if (typeof perfApi.getReport !== 'function') {
          return [];
        }
        return perfApi.getReport({
          filter: entry => typeof entry?.label === 'string' && entry.label.startsWith(prefix)
        }).slice(0, 12);
      };
      const componentHook = (() => {
        if (componentType === 'pca') {
          return Components?.pca?.__testHooks?.getPerformance?.() || null;
        }
        if (componentType === 'heatmap') {
          return Components?.heatmap?.__testHooks?.getPerformance?.() || null;
        }
        return null;
      })();
      const maxEntryId = relevantEntries.reduce((maxId, entry) => {
        const id = Number(entry?.id);
        return Number.isFinite(id) && id > maxId ? id : maxId;
      }, 0);
      return {
        componentType,
        capturedAt: Date.now(),
        componentHook,
        sharedPerformance: {
          totalEntries: allEntries.length,
          relevantEntries: relevantEntries.slice(-120).map(entry => ({
            id: Number(entry?.id || 0),
            label: String(entry?.label || ''),
            duration: Number(entry?.duration || 0),
            meta: entry?.meta || null
          })),
          maxEntryId,
          componentReport: reportForPrefix(componentPrefix),
          hotReport: reportForPrefix('hot.')
        }
      };
    }, { componentType });
  } catch (err) {
    return {
      componentType,
      capturedAt: Date.now(),
      error: err?.message || String(err)
    };
  }
}

async function runTimedStep(page, component, stepName, action) {
  const beforeSnapshot = await collectComponentPerformanceSnapshot(page, component.type);
  const start = Date.now();
  const actionResult = await action();
  const durationMs = Date.now() - start;
  const afterSnapshot = await collectComponentPerformanceSnapshot(page, component.type);
  return {
    step: stepName,
    durationMs: toMs(durationMs),
    actionResult: actionResult || null,
    perfDelta: {
      hook: summarizeHookDelta(beforeSnapshot?.componentHook, afterSnapshot?.componentHook),
      sharedEntries: summarizeSharedEntryDelta(beforeSnapshot, afterSnapshot),
      componentReport: summarizeReportDelta(
        beforeSnapshot?.sharedPerformance?.componentReport,
        afterSnapshot?.sharedPerformance?.componentReport
      ),
      hotReport: summarizeReportDelta(
        beforeSnapshot?.sharedPerformance?.hotReport,
        afterSnapshot?.sharedPerformance?.hotReport
      )
    }
  };
}

async function cycleVisibleSelects(pageRoot, maxCount = 4) {
  const start = Date.now();
  const selects = pageRoot.locator('select:visible');
  const count = await selects.count();
  const limit = Math.min(count, maxCount);
  let changed = 0;
  for (let i = 0; i < limit; i += 1) {
    const select = selects.nth(i);
    if (!(await select.isEnabled())) {
      continue;
    }
    const current = await select.inputValue().catch(() => null);
    const nextOptions = await select.evaluate(el => {
      const currentValue = String(el.value || '');
      return Array.from(el.options || [])
        .filter(option => !option.disabled && String(option.value || '') !== currentValue)
        .map(option => String(option.value || ''))
        .filter(value => value.length > 0);
    }).catch(() => []);
    if (!Array.isArray(nextOptions) || !nextOptions.length) {
      continue;
    }
    await select.selectOption(nextOptions[0], { timeout: 1_500 }).catch(() => {});
    await pageRoot.page().waitForTimeout(60);
    if (current != null) {
      await select.selectOption(String(current), { timeout: 1_500 }).catch(() => {});
      await pageRoot.page().waitForTimeout(60);
    }
    changed += 1;
  }
  return {
    visible: count,
    attempted: limit,
    changed,
    durationMs: toMs(Date.now() - start)
  };
}

async function toggleVisibleCheckboxes(pageRoot, maxCount = 5) {
  const start = Date.now();
  const checkboxes = pageRoot.locator('input[type="checkbox"]:visible');
  const count = await checkboxes.count();
  const limit = Math.min(count, maxCount);
  let toggled = 0;
  for (let i = 0; i < limit; i += 1) {
    const checkbox = checkboxes.nth(i);
    if (!(await checkbox.isEnabled())) {
      continue;
    }
    await checkbox.click({ timeout: 1_500 }).catch(() => {});
    await pageRoot.page().waitForTimeout(50);
    await checkbox.click({ timeout: 1_500 }).catch(() => {});
    await pageRoot.page().waitForTimeout(50);
    toggled += 1;
  }
  return {
    visible: count,
    attempted: limit,
    toggled,
    durationMs: toMs(Date.now() - start)
  };
}

async function clickAnalysisButtons(pageRoot, maxCount = 6) {
  const start = Date.now();
  const analysisPattern = /calculate statistics|recalculate statistics|guide me|diagnostics|log-rank|cox|chi|delong|forecast|anova|t-test|fit/i;
  const buttons = pageRoot.locator('button:visible');
  const count = await buttons.count();
  let clicks = 0;
  const clickedLabels = [];
  for (let i = 0; i < count && clicks < maxCount; i += 1) {
    const button = buttons.nth(i);
    const text = await button.innerText().catch(() => '');
    if (!analysisPattern.test(String(text || ''))) {
      continue;
    }
    if (!(await button.isEnabled().catch(() => false))) {
      continue;
    }
    await button.click({ timeout: 1_500 }).catch(() => {});
    clicks += 1;
    clickedLabels.push(String(text || '').trim());
    await pageRoot.page().waitForTimeout(90);
  }
  return {
    visible: count,
    clicked: clicks,
    clickedLabels: clickedLabels.slice(0, 6),
    durationMs: toMs(Date.now() - start)
  };
}

async function adjustVisibleZoomControls(pageRoot) {
  const start = Date.now();
  const zoomIn = pageRoot.locator('button[aria-label="Zoom in graph view"]:visible').first();
  const zoomOut = pageRoot.locator('button[aria-label="Zoom out graph view"]:visible').first();
  let zoomInClicks = 0;
  let zoomOutClicks = 0;
  if (await zoomIn.count()) {
    await zoomIn.click().catch(() => {});
    zoomInClicks += 1;
    await pageRoot.page().waitForTimeout(80);
    await zoomIn.click().catch(() => {});
    zoomInClicks += 1;
    await pageRoot.page().waitForTimeout(80);
  }
  if (await zoomOut.count()) {
    await zoomOut.click().catch(() => {});
    zoomOutClicks += 1;
    await pageRoot.page().waitForTimeout(80);
  }
  return {
    zoomInClicks,
    zoomOutClicks,
    durationMs: toMs(Date.now() - start)
  };
}

async function dragPanelResizer(page, pageRoot) {
  const start = Date.now();
  const resizer = pageRoot.locator('.panel-resizer:visible').first();
  if (await resizer.count() < 1) {
    return { present: false, moved: false, durationMs: toMs(Date.now() - start) };
  }
  const box = await resizer.boundingBox();
  if (!box) {
    return { present: true, moved: false, durationMs: toMs(Date.now() - start) };
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(90);
  await page.mouse.move(cx + 100, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 60, cy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(90);
  return { present: true, moved: true, durationMs: toMs(Date.now() - start) };
}

async function exerciseVisibleComponentControls(page, component) {
  const pageRoot = page.locator(`#${component.pageId}:not([hidden])`);
  const isHeavy = component.type === 'pca' || component.type === 'line';
  const before = await collectComponentPerformanceSnapshot(page, component.type);
  const steps = [];
  steps.push(await runTimedStep(page, component, 'cycle-selects', () => cycleVisibleSelects(pageRoot, isHeavy ? 2 : 4)));
  steps.push(await runTimedStep(page, component, 'toggle-checkboxes', () => toggleVisibleCheckboxes(pageRoot, isHeavy ? 2 : 5)));
  steps.push(await runTimedStep(page, component, 'click-analysis-buttons', () => clickAnalysisButtons(pageRoot, isHeavy ? 3 : 6)));
  steps.push(await runTimedStep(page, component, 'drag-panel-resizer', () => dragPanelResizer(page, pageRoot)));
  steps.push(await runTimedStep(page, component, 'adjust-zoom', () => adjustVisibleZoomControls(pageRoot)));
  await page.waitForTimeout(250);
  const after = await collectComponentPerformanceSnapshot(page, component.type);
  return {
    steps,
    before,
    after
  };
}

module.exports = {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  exerciseVisibleComponentControls,
  collectComponentPerformanceSnapshot,
  shouldIgnoreConsoleEntry
};
