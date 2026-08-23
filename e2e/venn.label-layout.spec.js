const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function rectsOverlap(a, b) {
  return a.left < b.right
    && a.right > b.left
    && a.top < b.bottom
    && a.bottom > b.top;
}

async function openBlankVenn(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' },
    { first: true }
  );
  await page.waitForFunction(() => !!window.Components?.venn?.ready, null, { timeout: 30_000 });
}

async function awaitVennReady(page, reason) {
  await page.evaluate(async (readyReason) => {
    const active = window.Main?.tabs?.getActiveTab?.();
    await window.Components?.venn?.awaitReadyForSnapshot?.({
      tabId: active?.id || null,
      reason: readyReason,
      settleFrames: 2,
      timeoutMs: 30_000
    });
  }, reason);
}

async function loadNumericVenn(page, data) {
  await page.evaluate((nextData) => {
    const venn = window.Components.venn;
    const payload = venn.getPayload();
    payload.data = {
      ...(payload.data || {}),
      labelA: nextData.labelA,
      labelB: nextData.labelB,
      labelC: nextData.labelC || '',
      listA: '',
      listB: '',
      listC: '',
      nA: String(nextData.nA),
      nB: String(nextData.nB),
      nC: String(nextData.nC || 0),
      nAB: String(nextData.nAB || 0),
      nAC: String(nextData.nAC || 0),
      nBC: String(nextData.nBC || 0),
      nABC: String(nextData.nABC || 0)
    };
    payload.config = { ...(payload.config || {}), plotType: 'venn' };
    venn.loadFromPayload(payload, { reason: 'e2e-venn-label-layout' });
  }, data);
  await page.waitForFunction(() => {
    const stage = document.querySelector('#vennPage:not([hidden]) #stage');
    return stage
      && stage.querySelectorAll('circle[data-venn-trace-id]').length >= 2
      && stage.querySelectorAll('text[data-venn-set-label]').length >= 2;
  }, null, { timeout: 30_000 });
  await awaitVennReady(page, 'e2e-venn-label-layout-ready');
}

async function captureLayout(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('#vennPage:not([hidden]) #stage');
    const toRect = node => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        text: node.textContent || '',
        side: node.dataset.vennLabelSide || '',
        id: node.dataset.vennSetLabel || node.dataset.vennTraceId || ''
      };
    };
    return {
      title: toRect(stage.querySelector('text[data-font-role="graphTitle"]')),
      labels: Array.from(stage.querySelectorAll('text[data-venn-set-label]')).map(toRect),
      circles: Array.from(stage.querySelectorAll('circle[data-venn-trace-id]')).map(toRect)
    };
  });
}

async function captureStageGeometry(page, excludedSelectors = []) {
  return page.evaluate((selectors) => {
    const stage = document.querySelector('#vennPage:not([hidden]) #stage');
    const excluded = new Set(selectors.flatMap(selector => Array.from(stage.querySelectorAll(selector))));
    const excludedRoots = Array.from(excluded);
    const records = Array.from(stage.querySelectorAll('*'))
      .filter(node => !excluded.has(node) && !excludedRoots.some(parent => parent.contains(node)))
      .map(node => ({
        tag: node.tagName,
        attrs: Array.from(node.attributes || [])
          .map(attr => [attr.name, attr.value])
          .sort(([left], [right]) => left.localeCompare(right)),
        text: node.children.length === 0 ? String(node.textContent || '') : ''
      }));
    return {
      viewBox: stage.getAttribute('viewBox'),
      preserveAspectRatio: stage.getAttribute('preserveAspectRatio'),
      records
    };
  }, excludedSelectors);
}

async function dragCenterTo(page, locator, target) {
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
}

async function forceVennDraw(page, reason) {
  await page.evaluate((drawReason) => {
    window.Components.venn.draw({ reason: drawReason, force: true, userInitiated: false });
  }, reason);
  await awaitVennReady(page, reason);
}

function expectHarmoniousLayout(layout) {
  for (const label of layout.labels) {
    expect(rectsOverlap(label, layout.title)).toBe(false);
    const circle = layout.circles.find(candidate => candidate.id === label.id);
    expect(circle).toBeTruthy();
    if (label.side === 'top') {
      expect(label.bottom).toBeLessThanOrEqual(circle.top + 1);
    } else {
      expect(label.top).toBeGreaterThanOrEqual(circle.bottom - 1);
    }
  }
  for (let index = 0; index < layout.labels.length; index += 1) {
    for (let other = index + 1; other < layout.labels.length; other += 1) {
      expect(rectsOverlap(layout.labels[index], layout.labels[other])).toBe(false);
    }
  }
  expect(Math.min(...layout.circles.map(circle => circle.top))).toBeGreaterThan(layout.title.bottom);
}

const THREE_SET_DATA = {
  labelA: 'Luminal A',
  labelB: 'Luminal B',
  labelC: 'Basal-like',
  nA: 12,
  nB: 14,
  nC: 14,
  nAB: 10,
  nAC: 8,
  nBC: 10,
  nABC: 6
};

test('three-set Venn reserves a title band and distributes set labels across outer arcs', async ({ page }) => {
  await openBlankVenn(page);
  await loadNumericVenn(page, THREE_SET_DATA);

  const layout = await captureLayout(page);
  expect(layout.labels).toHaveLength(3);
  expectHarmoniousLayout(layout);
  expect(new Set(layout.labels.map(label => label.side))).toEqual(new Set(['top', 'bottom']));
});

test('two-set Venn separates long labels without title or label collisions', async ({ page }) => {
  await openBlankVenn(page);
  await loadNumericVenn(page, {
    labelA: 'Chromatin remodelling complex alpha',
    labelB: 'DNA-damage response interactors beta',
    nA: 30,
    nB: 28,
    nAB: 18
  });

  const layout = await captureLayout(page);
  expect(layout.labels).toHaveLength(2);
  expectHarmoniousLayout(layout);
  expect(layout.labels[0].side).not.toBe(layout.labels[1].side);
});

test('moving the Venn title is presentation-only and cannot reflow the diagram', async ({ page }) => {
  await openBlankVenn(page);
  await loadNumericVenn(page, THREE_SET_DATA);

  const title = page.locator('#vennPage:not([hidden]) #stage text[data-font-role="graphTitle"]');
  const targetLabel = await page.locator(
    '#vennPage:not([hidden]) #stage text[data-venn-set-label="B"]'
  ).boundingBox();
  expect(targetLabel).toBeTruthy();
  const beforeGeometry = await captureStageGeometry(page, ['text[data-font-role="graphTitle"]']);

  await dragCenterTo(page, title, {
    x: targetLabel.x + targetLabel.width / 2,
    y: targetLabel.y + targetLabel.height / 2
  });
  await page.waitForFunction(() => {
    const active = window.Main?.tabs?.getActiveTab?.();
    const position = window.Components?.venn?.__testHooks?.getSession?.(active?.id)?.state?.labelPositions?.title;
    return Number.isFinite(Number(position?.relX)) && Number(position?.relY) > 0.08;
  });

  expect(await captureStageGeometry(page, ['text[data-font-role="graphTitle"]'])).toEqual(beforeGeometry);
  await forceVennDraw(page, 'e2e-venn-manual-title-redraw');
  expect(await captureStageGeometry(page, ['text[data-font-role="graphTitle"]'])).toEqual(beforeGeometry);
  const after = await captureLayout(page);
  expect(rectsOverlap(after.title, after.labels.find(label => label.id === 'B'))).toBe(true);
});

test('set labels may be positioned over the title without changing circle geometry', async ({ page }) => {
  await openBlankVenn(page);
  await loadNumericVenn(page, THREE_SET_DATA);

  const titleBox = await page.locator(
    '#vennPage:not([hidden]) #stage text[data-font-role="graphTitle"]'
  ).boundingBox();
  const label = page.locator('#vennPage:not([hidden]) #stage text[data-venn-set-label="A"]');
  expect(titleBox).toBeTruthy();
  const beforeGeometry = await captureStageGeometry(page, [
    'text[data-font-role="graphTitle"]',
    'text[data-venn-set-label="A"]'
  ]);

  await dragCenterTo(page, label, {
    x: titleBox.x + titleBox.width / 2,
    y: titleBox.y + titleBox.height / 2
  });
  expect(await captureStageGeometry(page, [
    'text[data-font-role="graphTitle"]',
    'text[data-venn-set-label="A"]'
  ])).toEqual(beforeGeometry);

  await forceVennDraw(page, 'e2e-venn-manual-set-label-redraw');
  expect(await captureStageGeometry(page, [
    'text[data-font-role="graphTitle"]',
    'text[data-venn-set-label="A"]'
  ])).toEqual(beforeGeometry);
  const after = await captureLayout(page);
  expect(rectsOverlap(after.title, after.labels.find(candidate => candidate.id === 'A'))).toBe(true);
});

test('moving the UpSet title is presentation-only and cannot reflow the plot', async ({ page }) => {
  await openBlankVenn(page);
  await loadNumericVenn(page, THREE_SET_DATA);
  await page.locator('#vennPage:not([hidden]) #vennPlotType').selectOption('upset');
  await page.waitForFunction(() => {
    const stage = document.querySelector('#vennPage:not([hidden]) #stage');
    return stage?.querySelectorAll?.('[data-upset-trace-kind]').length > 0;
  }, null, { timeout: 30_000 });
  await awaitVennReady(page, 'e2e-upset-title-layout-ready');

  const title = page.locator('#vennPage:not([hidden]) #stage text[data-font-role="graphTitle"]');
  const firstBar = await page.locator(
    '#vennPage:not([hidden]) #stage rect[data-upset-trace-kind="intersectionBars"]'
  ).first().boundingBox();
  expect(firstBar).toBeTruthy();
  const beforeGeometry = await captureStageGeometry(page, ['text[data-font-role="graphTitle"]']);

  await dragCenterTo(page, title, {
    x: firstBar.x + firstBar.width / 2,
    y: firstBar.y + Math.min(firstBar.height / 2, 24)
  });
  expect(await captureStageGeometry(page, ['text[data-font-role="graphTitle"]'])).toEqual(beforeGeometry);

  await forceVennDraw(page, 'e2e-upset-manual-title-redraw');
  expect(await captureStageGeometry(page, ['text[data-font-role="graphTitle"]'])).toEqual(beforeGeometry);
});
