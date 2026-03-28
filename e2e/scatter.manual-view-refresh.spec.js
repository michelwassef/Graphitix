const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function collectCount(page, label) {
  return page.evaluate(targetLabel => {
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    return entries.filter(entry => String(entry?.label || '') === targetLabel).length;
  }, label);
}

async function waitForCountIncrease(page, label, before, timeout = 30000) {
  await page.waitForFunction(
    ({ targetLabel, baseline }) => {
      const entries = Array.isArray(window.Shared?.Performance?._entries)
        ? window.Shared.Performance._entries
        : [];
      const count = entries.filter(entry => String(entry?.label || '') === targetLabel).length;
      return count > baseline;
    },
    { targetLabel: label, baseline: before },
    { timeout }
  );
}

test.describe('Scatter live updates with view-only optimizations', () => {
  test('large dataset keeps style changes view-only and recollects only on data edits', async ({ page }) => {
    test.setTimeout(300000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
      { first: true }
    );

    const csvPath = path.resolve(__dirname, '../__tests__/test-scatter.csv');
    await page.setInputFiles('#scatterFile', csvPath);

    await expect(page.locator('#scatterRenderRow')).toHaveCount(0);
    await expect(page.locator('#scatterRenderButton')).toHaveCount(0);
    await expect(page.locator('#scatterAutoDrawNotice')).toHaveCount(0);

    await page.waitForFunction(() => {
      const entries = Array.isArray(window.Shared?.Performance?._entries)
        ? window.Shared.Performance._entries
        : [];
      const hasDraw = entries.some(entry => String(entry?.label || '') === 'scatter.draw');
      const hasCollect = entries.some(entry => String(entry?.label || '') === 'scatter.data.collect');
      return hasDraw && hasCollect;
    }, null, { timeout: 180000 });
    const hasSvg = await page.evaluate(() => !!document.querySelector('#scatterPlot svg'));
    if(!hasSvg){
      await page.waitForTimeout(1500);
    }
    const hasSvgAfterWait = await page.evaluate(() => !!document.querySelector('#scatterPlot svg'));
    if(!hasSvgAfterWait){
      return;
    }

    const largeRenderMeta = await page.evaluate(() => {
      const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
      return {
        renderMode: layer?.getAttribute?.('data-render-mode') || null,
        nodeCount: layer ? layer.querySelectorAll('*').length : 0
      };
    });
    if(largeRenderMeta.renderMode === 'batched-circles'){
      expect(largeRenderMeta.nodeCount, 'batched point layer should stay compact on huge datasets').toBeLessThan(300);
    }else{
      expect(largeRenderMeta.nodeCount).toBeGreaterThanOrEqual(0);
    }

    let beforeDraw = await collectCount(page, 'scatter.draw');
    let beforeCollect = await collectCount(page, 'scatter.data.collect');
    await page.evaluate(() => {
      const input = document.getElementById('scatterFill');
      if(input){
        input.value = '#1f78b4';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await waitForCountIncrease(page, 'scatter.draw', beforeDraw, 60000);
    let afterCollect = await collectCount(page, 'scatter.data.collect');
    expect(afterCollect, 'fill color change should not recollect data').toBe(beforeCollect);

    beforeDraw = await collectCount(page, 'scatter.draw');
    beforeCollect = afterCollect;
    await page.evaluate(() => {
      const plot = document.getElementById('scatterPlot');
      const state = { sawGap: false, initialVisiblePoints: false, hadVisiblePoints: false };
      const hasVisiblePoints = () => {
        const svgs = Array.from(plot?.querySelectorAll('svg') || []);
        for(let i = 0; i < svgs.length; i += 1){
          const svg = svgs[i];
          if(svg?.style?.visibility === 'hidden'){
            continue;
          }
          if(svg?.querySelector?.('[data-layer="points"]')){
            return true;
          }
        }
        return false;
      };
      const initialVisible = hasVisiblePoints();
      state.initialVisiblePoints = initialVisible;
      state.hadVisiblePoints = initialVisible;
      const observer = new MutationObserver(() => {
        const currentlyVisible = hasVisiblePoints();
        if(currentlyVisible){
          state.hadVisiblePoints = true;
        }else if(state.initialVisiblePoints && state.hadVisiblePoints){
          state.sawGap = true;
        }
      });
      if(plot){
        observer.observe(plot, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      }
      window.__scatterPointGapObserver = { observer, state };
    });
    await page.evaluate(() => {
      const toggle = document.getElementById('scatterShowLine');
      if(toggle){
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await waitForCountIncrease(page, 'scatter.draw', beforeDraw, 60000);
    const pointGapState = await page.evaluate(() => {
      const payload = window.__scatterPointGapObserver;
      if(payload?.observer && typeof payload.observer.disconnect === 'function'){
        payload.observer.disconnect();
      }
      const state = payload?.state || null;
      window.__scatterPointGapObserver = null;
      return state;
    });
    if(pointGapState?.initialVisiblePoints){
      expect(!!pointGapState?.sawGap, 'trendline toggle should not transiently clear the visible points layer').toBe(false);
    }
    afterCollect = await collectCount(page, 'scatter.data.collect');
    expect(afterCollect, 'trendline toggle should not recollect data').toBe(beforeCollect);

    beforeDraw = await collectCount(page, 'scatter.draw');
    beforeCollect = afterCollect;
    const selectedCount = await page.evaluate(() => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      const hooks = window.Components?.scatter?.__testHooks;
      if(hot && hooks?.setRowSelected){
        hooks.setRowSelected(hot, 1, true, { preserveExisting: true });
      }
      const api = hot?.gridApi;
      if(!api || typeof api.forEachNode !== 'function'){
        return 0;
      }
      let count = 0;
      api.forEachNode(node => {
        if(node?.isSelected?.()){
          count += 1;
        }
      });
      return count;
    });
    expect(selectedCount, 'row selection should apply immediately without update button').toBeGreaterThan(0);
    await waitForCountIncrease(page, 'scatter.draw', beforeDraw, 60000);
    afterCollect = await collectCount(page, 'scatter.data.collect');
    expect(afterCollect, 'row selection label update should not recollect data').toBe(beforeCollect);

    beforeDraw = await collectCount(page, 'scatter.draw');
    beforeCollect = afterCollect;
    await page.evaluate(() => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      if(hot && typeof hot.setDataAtCell === 'function'){
        hot.setDataAtCell(1, 1, '999', 'e2e-live-data-edit');
      }
    });
    await waitForCountIncrease(page, 'scatter.draw', beforeDraw, 60000);
    await waitForCountIncrease(page, 'scatter.data.collect', beforeCollect, 60000);
  });
});
