const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const CASES = [
  { type: 'box', svg: '#boxSvg', toggle: '#boxShowLegend', example: 'boxLoadExample' },
  { type: 'scatter', svg: '#scatterSvg', toggle: '#scatterShowLegend' },
  { type: 'pca', svg: '#pcaSvg', toggle: '#pcaShowLegend' },
  { type: 'line', svg: '#lineSvg', toggle: '#lineShowLegend' },
  { type: 'roc', svg: '#rocSvg', toggle: '#rocShowLegend' },
  { type: 'survival', svg: '#survivalSvg', toggle: '#survivalShowLegend' },
  { type: 'hist', svg: '#histSvg', toggle: '#histShowLegend' },
  { type: 'pie', svg: '#pieSvg', toggle: '#pieShowLegend' },
  { type: 'scatter', svg: '#scatterSvg', toggle: '#scatterShowLegend', viewMode: '#scatterViewMode', reloadExample: 'scatterLoadExample' },
  { type: 'pca', svg: '#pcaSvg', toggle: '#pcaShowLegend', viewMode: '#pcaViewMode' },
  { type: 'line', svg: '#lineSvg', toggle: '#lineShowLegend', viewMode: '#lineViewMode' }
];

test('Pie example honors the initially checked legend option', async ({ page }) => {
  test.setTimeout(45_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const box = COMPONENT_MATRIX.find(entry => entry.type === 'box');
  await openComponentFromWelcome(page, box, { first: true });
  const component = COMPONENT_MATRIX.find(entry => entry.type === 'pie');
  await openComponentFromWelcome(page, component);
  await clickExampleButtonIfPresent(page, 'pieLoadExample');

  await expect(page.locator('#pieShowLegend')).toBeChecked();
  const pieCase = { type: 'pie', svg: '#pieSvg' };
  await waitForLegendProjection(page, pieCase, true);
  await expect.poll(async () => captureViewport(page, pieCase), { timeout: 15_000 }).toMatchObject({
    hasEnvelope: true,
    legendFits: true,
    legendFitsVertically: true
  });
  const viewport = await captureViewport(page, pieCase);
  expect(viewport.legendUnclipped, JSON.stringify(viewport)).toBe(true);
  expect(viewport.reserveWidth).toBeGreaterThan(0);
  expect(viewport.viewportWidth).toBeCloseTo(viewport.baseWidth + viewport.reserveWidth, 2);
  expect(viewport.projectedWidth).toBeCloseTo(viewport.viewportWidth, 2);
});

async function setLegend(page, componentCase, visible) {
  await page.evaluate(({ selector, checked }) => {
    const control = document.querySelector(selector);
    if (!control) {
      throw new Error(`Missing legend control: ${selector}`);
    }
    control.checked = checked;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector: componentCase.toggle, checked: visible });
  await waitForLegendProjection(page, componentCase, visible);
}

async function waitForLegendProjection(page, componentCase, visible) {
  await page.waitForFunction(({ selector, expectedVisible }) => {
    const svg = document.querySelector(selector);
    const reserve = Number(svg?.dataset?.legendReserveWidth);
    if(!Number.isFinite(reserve) || (expectedVisible ? reserve <= 0 : reserve !== 0)){
      return false;
    }
    const signature = `${svg.getAttribute('viewBox')}|${svg.querySelectorAll('*').length}|${svg.textContent?.length || 0}`;
    const key = `${selector}:${expectedVisible}`;
    window.__legendViewportTestSamples = window.__legendViewportTestSamples || {};
    const previous = window.__legendViewportTestSamples[key];
    window.__legendViewportTestSamples[key] = previous?.signature === signature
      ? { signature, count: previous.count + 1 }
      : { signature, count: 1 };
    return window.__legendViewportTestSamples[key].count >= 3;
  }, { selector: componentCase.svg, expectedVisible: visible }, { timeout: 30_000 });
}

async function captureViewport(page, componentCase) {
  return page.evaluate(({ selector, componentType }) => {
    const svg = document.querySelector(selector);
    const viewBox = String(svg?.getAttribute?.('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const viewportHost = svg?.parentElement?.closest?.('[data-graph-content-viewport="true"]') || null;
    const horizontalLines = Array.from(svg?.querySelectorAll?.('line') || [])
      .filter(node => !node.closest?.('[data-legend-viewport-content="true"]'))
      .map(node => {
        const x1 = Number(node.getAttribute('x1'));
        const x2 = Number(node.getAttribute('x2'));
        const y1 = Number(node.getAttribute('y1'));
        const y2 = Number(node.getAttribute('y2'));
        const horizontal = Number.isFinite(x1) && Number.isFinite(x2) && Number.isFinite(y1) && Number.isFinite(y2) && Math.abs(y1 - y2) < 0.5;
        return {
          units: horizontal ? Math.abs(x2 - x1) : 0,
          pixels: horizontal ? node.getBoundingClientRect().width : 0
        };
      });
    const dataLayer = svg?.querySelector?.('[data-layer="pie-data"]');
    const dataBounds = dataLayer?.getBBox?.();
    const dataRect = dataLayer?.getBoundingClientRect?.();
    const legend = svg?.querySelector?.('[data-legend-viewport-content="true"]');
    const legendRect = legend?.getBoundingClientRect?.();
    const svgRect = svg?.getBoundingClientRect?.();
    const svgBox = svg?.closest?.('.svgbox') || null;
    const shellStyle = svgBox ? getComputedStyle(svgBox, '::after') : null;
    let legendUnclipped = true;
    let legendClippedBy = null;
    let ancestor = legend?.parentElement || null;
    while(legendRect && ancestor && ancestor !== document.documentElement){
      const style = getComputedStyle(ancestor);
      if(['hidden', 'clip'].includes(style.overflowX)){
        const rect = ancestor.getBoundingClientRect();
        if(legendRect.left < rect.left - 1 || legendRect.right > rect.right + 1){
          legendUnclipped = false;
          legendClippedBy = {
            id: ancestor.id || '',
            className: String(ancestor.className || ''),
            overflowX: style.overflowX,
            left: rect.left,
            right: rect.right,
            legendLeft: legendRect.left,
            legendRight: legendRect.right
          };
          break;
        }
      }
      ancestor = ancestor.parentElement;
    }
    return {
      baseWidth: Number(svg?.dataset?.legendBaseWidth),
      componentBaseWidth: Number(svg?.getAttribute?.(`data-${componentType}-base-width`)) || 0,
      reserveWidth: Number(svg?.dataset?.legendReserveWidth),
      viewportWidth: Number(viewBox[2]),
      projectedWidth: Number.parseFloat(viewportHost?.style?.getPropertyValue?.('--graph-content-viewport-width')) || 0,
      plotSpan: Math.max(0, ...horizontalLines.map(entry => entry.units), Number(dataBounds?.width) || 0),
      plotSpanPx: Math.max(0, ...horizontalLines.map(entry => entry.pixels), Number(dataRect?.width) || 0),
      legendFits: !legendRect || !svgRect || (legendRect.left >= svgRect.left - 1 && legendRect.right <= svgRect.right + 1),
      legendFitsVertically: !legendRect || !svgRect || (legendRect.top >= svgRect.top - 1 && legendRect.bottom <= svgRect.bottom + 1),
      legendUnclipped,
      legendClippedBy,
      legendColumnCount: Number(legend?.dataset?.legendColumnCount) || 0,
      boxWidth: svgBox?.getBoundingClientRect?.().width || 0,
      shellWidth: Number.parseFloat(shellStyle?.width) || 0,
      hasEnvelope: svgBox?.dataset?.graphContentEnvelope === 'true'
    };
  }, { selector: componentCase.svg, componentType: componentCase.type });
}

for (const componentCase of CASES) {
  const modeLabel = componentCase.viewMode ? ' 3D' : '';
  test(`${componentCase.type}${modeLabel} legend extends the SVG without shrinking its base viewport`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    if (componentCase.type === 'box') {
      await page.setViewportSize({ width: 1920, height: 1080 });
    }
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const component = COMPONENT_MATRIX.find(entry => entry.type === componentCase.type);
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });

    if (componentCase.type === 'box') {
      await page.evaluate(() => {
        const format = document.querySelector('#boxTableFormat');
        format.value = 'grouped';
        format.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await clickExampleButtonIfPresent(page, componentCase.example);
    }

    if (componentCase.type === 'hist') {
      await page.evaluate(async () => {
        const component = window.Components.hist;
        const tab = window.Main.tabs.getActiveTab();
        const payload = component.createEmptyPayload();
        payload.data = [
          ['Control', 'Treatment'],
          [38, 40], [42, 45], [45, 47], [50, 54], [55, 58],
          [62, 66], [70, 73], [78, 82], [86, 89], [94, 98]
        ];
        component.loadFromPayload(payload, { source: 'e2e-legend-viewport', tab, tabId: tab.id, skipDraw: true });
        await component.draw({ reason: 'e2e-legend-viewport-setup', tabId: tab.id });
      });
    }

    if (componentCase.viewMode) {
      await page.evaluate(({ selector }) => {
        const control = document.querySelector(selector);
        control.value = '3d';
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }, { selector: componentCase.viewMode });
      if (componentCase.reloadExample) {
        await clickExampleButtonIfPresent(page, componentCase.reloadExample);
      } else {
        await page.evaluate(async type => {
          const tabId = window.Main.session.getActiveTab().id;
          await window.Components[type].draw({ reason: `e2e-${type}-3d-legend-viewport`, tabId });
        }, componentCase.type);
      }
      await page.waitForFunction(selector => document.querySelector(selector)?.dataset?.viewMode === '3d', componentCase.svg);
    }

    if (componentCase.type === 'line' && !componentCase.viewMode) {
      await page.evaluate(() => {
        const events = [];
        const svgBox = document.querySelector('#linePage:not([hidden]) .svgbox');
        const probe = {
          events,
          observer: null,
          originalStage: window.Shared.framePublication.stage,
          envelopeSignature: `${svgBox.dataset.graphContentEnvelope || ''}|${svgBox.style.getPropertyValue('--graph-content-extra-right')}`
        };
        const observer = new MutationObserver(records => {
          if (records.some(record => record.attributeName === 'data-graph-content-envelope' || record.attributeName === 'style')) {
            const signature = `${svgBox.dataset.graphContentEnvelope || ''}|${svgBox.style.getPropertyValue('--graph-content-extra-right')}`;
            if (signature !== probe.envelopeSignature) {
              probe.envelopeSignature = signature;
              events.push('envelope');
            }
          }
        });
        observer.observe(svgBox, { attributes: true });
        probe.observer = observer;
        const originalStage = probe.originalStage;
        window.Shared.framePublication.stage = options => {
          const publication = originalStage(options);
          const originalCommit = publication.commit.bind(publication);
          publication.commit = () => {
            events.push('frame-commit');
            return originalCommit();
          };
          return publication;
        };
        window.__legendEnvelopeCommitProbe = probe;
      });
    }

    await setLegend(page, componentCase, false);
    if (componentCase.type === 'box') {
      await page.evaluate(async () => {
        const tabId = window.Main.session.getActiveTab().id;
        await window.Components.box.draw({ reason: 'e2e-box-hidden-legend-settle', tabId });
      });
      await waitForLegendProjection(page, componentCase, false);
    }
    const hidden = await captureViewport(page, componentCase);
    let hideCommitEvents = null;
    if (componentCase.type === 'line' && !componentCase.viewMode) {
      hideCommitEvents = await page.evaluate(() => {
        const probe = window.__legendEnvelopeCommitProbe;
        const svgBox = document.querySelector('#linePage:not([hidden]) .svgbox');
        const events = probe.events.slice();
        probe.events.length = 0;
        probe.envelopeSignature = `${svgBox.dataset.graphContentEnvelope || ''}|${svgBox.style.getPropertyValue('--graph-content-extra-right')}`;
        return events;
      });
    }
    await setLegend(page, componentCase, true);
    if (componentCase.type === 'box') {
      await page.evaluate(async () => {
        const tabId = window.Main.session.getActiveTab().id;
        await window.Components.box.draw({ reason: 'e2e-box-visible-legend-settle', tabId });
      });
      await waitForLegendProjection(page, componentCase, true);
    }
    const visible = await captureViewport(page, componentCase);

    expect(hidden.reserveWidth).toBe(0);
    expect(visible.reserveWidth).toBeGreaterThan(0);
    expect(visible.baseWidth).toBeCloseTo(hidden.baseWidth, 0);
    expect(hidden.projectedWidth).toBe(0);
    expect(visible.projectedWidth - visible.reserveWidth).toBeCloseTo(hidden.baseWidth, 0);
    expect(visible.boxWidth).toBeCloseTo(hidden.boxWidth, 0);
    expect(hidden.plotSpan).toBeGreaterThan(0);
    expect(visible.plotSpan).toBeCloseTo(hidden.plotSpan, 0);
    expect(visible.plotSpanPx).toBeCloseTo(hidden.plotSpanPx, 0);
    expect(visible.legendFits).toBe(true);
    expect(visible.legendFitsVertically).toBe(true);
    expect(hidden.hasEnvelope).toBe(false);
    expect(visible.hasEnvelope).toBe(true);
    expect(visible.shellWidth).toBeGreaterThanOrEqual(visible.reserveWidth);
    expect(visible.shellWidth - visible.reserveWidth).toBeLessThanOrEqual(2);
    if (componentCase.type === 'pca' && !componentCase.viewMode) {
      expect(visible.legendColumnCount).toBeGreaterThan(1);
    }
    if (visible.componentBaseWidth > 0) {
      expect(visible.componentBaseWidth).toBeCloseTo(visible.baseWidth, 0);
    }

    if (componentCase.type === 'line' && !componentCase.viewMode) {
      const showCommitEvents = await page.evaluate(() => {
        const probe = window.__legendEnvelopeCommitProbe;
        probe.observer.disconnect();
        window.Shared.framePublication.stage = probe.originalStage;
        return probe.events.slice();
      });
      for (const events of [hideCommitEvents, showCommitEvents]) {
        expect(events.indexOf('frame-commit')).toBeGreaterThanOrEqual(0);
        expect(events.indexOf('envelope')).toBeGreaterThan(events.indexOf('frame-commit'));
      }

      const resizeHandle = page.locator('#linePage:not([hidden]) .svgbox .resizer-vertical').first();
      const handleBox = await resizeHandle.boundingBox();
      const envelopeRight = await page.evaluate(() => {
        const svgBox = document.querySelector('#linePage:not([hidden]) .svgbox');
        const rect = svgBox.getBoundingClientRect();
        return rect.right + Number.parseFloat(svgBox.style.getPropertyValue('--graph-content-extra-right'));
      });
      expect(handleBox).not.toBeNull();
      expect(Math.abs((handleBox.x + handleBox.width) - envelopeRight)).toBeLessThanOrEqual(2);
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + handleBox.width / 2 + 36, handleBox.y + handleBox.height / 2, { steps: 4 });
      await page.mouse.up();
      await page.waitForFunction(({ selector, previousBaseWidth }) => {
        const baseWidth = Number(document.querySelector(selector)?.dataset?.legendBaseWidth);
        return Number.isFinite(baseWidth) && baseWidth > previousBaseWidth + 20;
      }, { selector: componentCase.svg, previousBaseWidth: visible.baseWidth });
    }
  });
}

test('legend envelope follows its owner across same-component render-cache restores', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = COMPONENT_MATRIX.find(entry => entry.type === 'line');
  const componentCase = CASES.find(entry => entry.type === 'line' && !entry.viewMode);

  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await setLegend(page, componentCase, true);
  const firstTabId = await page.evaluate(() => window.Main.session.getActiveTab().id);
  const firstViewport = await captureViewport(page, componentCase);

  await openComponentFromWelcome(page, component, { first: false, loadExample: true });
  const secondTabId = await page.evaluate(() => window.Main.session.getActiveTab().id);
  await setLegend(page, componentCase, false);
  await page.waitForFunction(tabId => !!window.Main.session.workspaceState.tabs.find(tab => tab.id === tabId)?.renderCache, firstTabId);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.waitForFunction(({ tabId, selector }) => {
    const active = window.Main.session.getActiveTab();
    const svg = document.querySelector(selector);
    const svgBox = svg?.closest?.('.svgbox');
    return active?.id === tabId
      && Number(svg?.dataset?.legendReserveWidth) > 0
      && svgBox?.dataset?.graphContentEnvelope === 'true';
  }, { tabId: firstTabId, selector: componentCase.svg });
  const restoredFirst = await captureViewport(page, componentCase);
  expect(restoredFirst.baseWidth).toBeCloseTo(firstViewport.baseWidth, 0);
  expect(restoredFirst.reserveWidth).toBeCloseTo(firstViewport.reserveWidth, 0);
  expect(restoredFirst.hasEnvelope).toBe(true);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${secondTabId}"]`).click();
  await page.waitForFunction(({ tabId, selector }) => {
    const active = window.Main.session.getActiveTab();
    const svg = document.querySelector(selector);
    const svgBox = svg?.closest?.('.svgbox');
    return active?.id === tabId
      && Number(svg?.dataset?.legendReserveWidth) === 0
      && svgBox?.dataset?.graphContentEnvelope !== 'true';
  }, { tabId: secondTabId, selector: componentCase.svg });
});
