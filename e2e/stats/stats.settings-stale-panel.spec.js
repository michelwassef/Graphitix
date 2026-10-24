const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

const cases = [
  {
    type: 'hist',
    prepare: ['#histStatsDiagnosticsMode', 'normal-vs-lognormal'],
    setting: '#histStatsComparisonMode',
    value: 'ks',
    panels: ['#histStatsResults'],
    plot: '#histPlot svg'
  },
  {
    type: 'box',
    setting: '#boxStatsFamily',
    value: 'nonparametric',
    panels: ['#statsResults', '#statsTable'],
    plot: '#boxPlot svg'
  },
  {
    type: 'line',
    setting: '#lineStatType',
    value: 'spearman',
    panels: ['#lineStatsResults'],
    plot: '#linePlot svg'
  },
  {
    type: 'roc',
    prepare: ['#rocSinglePMethod', 'auto'],
    setting: '#rocSinglePMethod',
    value: 'asymptotic',
    panels: ['#rocStatsResults'],
    plot: '#rocPlot svg'
  },
  {
    type: 'survival',
    setting: '#survivalPairwiseCorrection',
    value: 'holm',
    panels: ['#survivalStatsSummary', '#survivalStatsLogRank', '#survivalStatsHazardRatios', '#survivalStatsCox'],
    plot: '#survivalPlot svg'
  },
  {
    type: 'pie',
    setting: '#pieStatsControl-2',
    value: 'g-test',
    panels: ['#pieStatsResults'],
    plot: '#piePlot svg'
  },
  {
    type: 'scatter',
    setting: '#scatterStatType',
    value: 'spearman',
    panels: ['#scatterStatsResults'],
    plot: '#scatterPlot svg'
  }
];

async function settleComponent(page, type){
  await page.evaluate(async componentType => {
    const tab = window.Main.session.getActiveTab();
    await window.Components[componentType].draw({ tabId: tab.id, force: true, reason: 'stats-stale-panel-regression' });
    await window.Components[componentType].awaitReadyForSnapshot?.({
      tab,
      tabId: tab.id,
      reason: 'stats-stale-panel-regression',
      timeoutMs: 20_000
    });
  }, type);
}

async function waitForStablePresentation(page, scenario){
  await page.evaluate(async ({ panels, plot }) => {
    let previous = null;
    let stableFrames = 0;
    for(let frame = 0; frame < 120 && stableFrames < 6; frame += 1){
      await new Promise(resolve => requestAnimationFrame(resolve));
      const current = {
        svg: document.querySelector(plot),
        panels: panels.map(selector => {
          const target = document.querySelector(selector);
          return [target?.getBoundingClientRect().height ?? null, target?.textContent.trim().length ?? 0];
        })
      };
      const stable = previous
        && current.svg === previous.svg
        && current.panels.every((value, index) => value[0] === previous.panels[index][0] && value[1] === previous.panels[index][1]);
      stableFrames = stable ? stableFrames + 1 : 0;
      previous = current;
    }
    if(stableFrames < 6){
      throw new Error('Statistics presentation did not settle after calculation.');
    }
  }, scenario);
}

test('analysis setting changes keep stale results in place without redrawing report-only plots', async ({ page }) => {
  test.setTimeout(180_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1600, height: 1100 });

  for (const scenario of cases){
    await page.goto('/index.html');
    const component = COMPONENT_CATALOG.find(entry => entry.type === scenario.type);
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await settleComponent(page, scenario.type);

    if(scenario.prepare){
      await page.locator(scenario.prepare[0]).selectOption(scenario.prepare[1]);
      await settleComponent(page, scenario.type);
    }

    const calculate = page.locator(`#${scenario.type}ComputeStats`);
    await expect(calculate).toBeEnabled({ timeout: 20_000 });
    await calculate.click();
    await page.waitForFunction(type => {
      const status = document.getElementById(`${type}StatsStatus`)?.textContent || '';
      return /up to date|calculated for the current|current for this data/i.test(status);
    }, scenario.type, { timeout: 35_000 });
    await page.evaluate(async componentType => {
      const tab = window.Main.session.getActiveTab();
      await window.Components[componentType].awaitReadyForSnapshot?.({
        tab,
        tabId: tab.id,
        reason: 'stats-setting-stale-panel-baseline',
        timeoutMs: 20_000
      });
    }, scenario.type);
    await waitForStablePresentation(page, scenario);

    const before = await page.evaluate(({ panels, plot }) => {
      window.__statsSettingInitialSvg = document.querySelector(plot);
      return {
        heights: panels.map(selector => document.querySelector(selector)?.getBoundingClientRect().height ?? null),
        content: panels.map(selector => document.querySelector(selector)?.textContent.trim().length ?? 0),
        hasSvg: !!window.__statsSettingInitialSvg
      };
    }, scenario);
    expect(before.heights.every(height => Number.isFinite(height) && height > 0), scenario.type).toBe(true);
    expect(before.content.every(length => length > 0), scenario.type).toBe(true);
    expect(before.hasSvg, scenario.type).toBe(true);

    await page.evaluate(type => {
      const component = window.Components[type];
      const draw = component.draw.bind(component);
      window.__statsSettingDrawCalls = [];
      component.draw = options => {
        window.__statsSettingDrawCalls.push(options || null);
        return draw(options);
      };
    }, scenario.type);

    await page.locator(scenario.setting).selectOption(scenario.value);
    await expect.poll(() => page.evaluate(panels => panels.map(selector => (
      document.querySelector(selector)?.getAttribute('data-stats-stale') || null
    )), scenario.panels), { timeout: 5_000 }).toEqual(scenario.panels.map(() => 'true'));

    const after = await page.evaluate(({ panels, plot }) => {
      const frames = [];
      return new Promise(resolve => {
        const sample = () => {
          frames.push(panels.map(selector => document.querySelector(selector)?.getBoundingClientRect().height ?? null));
          if(frames.length < 20){
            requestAnimationFrame(sample);
            return;
          }
          resolve({
            heights: panels.map(selector => document.querySelector(selector)?.getBoundingClientRect().height ?? null),
            content: panels.map(selector => document.querySelector(selector)?.textContent.trim().length ?? 0),
            stale: panels.map(selector => document.querySelector(selector)?.getAttribute('data-stats-stale') || null),
            sameSvg: document.querySelector(plot) === window.__statsSettingInitialSvg,
            drawCalls: window.__statsSettingDrawCalls,
            frameHeights: frames
          });
        };
        requestAnimationFrame(sample);
      });
    }, scenario);

    expect(after.stale.every(value => value === 'true'), scenario.type).toBe(true);
    expect(after.content.every(length => length > 0), `${scenario.type}: ${JSON.stringify(after)}`).toBe(true);
    after.heights.forEach((height, index) => {
      expect(height, `${scenario.type} panel ${scenario.panels[index]}`).toBeGreaterThanOrEqual(before.heights[index] - 2);
      expect(height, `${scenario.type} panel ${scenario.panels[index]}`).toBeLessThanOrEqual(before.heights[index] + 2);
    });
    after.frameHeights.forEach(frame => frame.forEach((height, index) => {
      expect(height, `${scenario.type} frame ${scenario.panels[index]}`).toBeGreaterThanOrEqual(before.heights[index] - 2);
      expect(height, `${scenario.type} frame ${scenario.panels[index]}`).toBeLessThanOrEqual(before.heights[index] + 2);
    }));
    expect(after.sameSvg, `${scenario.type} report-only setting: ${JSON.stringify(after.drawCalls)}`).toBe(true);
    expect(after.drawCalls, `${scenario.type} report-only setting must not schedule a plot draw`).toEqual([]);

    await calculate.click();
    await page.waitForFunction(type => {
      const status = document.getElementById(`${type}StatsStatus`)?.textContent || '';
      return /up to date|calculated for the current|current for this data/i.test(status);
    }, scenario.type, { timeout: 35_000 });
    await expect.poll(() => page.evaluate(panels => panels.map(selector => (
      document.querySelector(selector)?.getAttribute('data-stats-stale') || null
    )), scenario.panels), { timeout: 5_000 }).toEqual(scenario.panels.map(() => null));
  }
});
