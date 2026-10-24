const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const COMPONENTS = [
  { type: 'hist', panel: '#histStats', results: '#histStatsResults', button: '#histComputeStats', status: '#histStatsStatus', prepare: [['#histStatsDiagnosticsMode', 'normal-vs-lognormal'], ['#histStatsComparisonMode', 'ks']] },
  { type: 'box', panel: '#statsPanel', results: '#statsResults', button: '#boxComputeStats', status: '#boxStatsStatus' },
  { type: 'scatter', panel: '#scatterStats', results: '#scatterStatsResults', button: '#scatterComputeStats', status: '#scatterStatsStatus' },
  { type: 'line', panel: '#lineStats', results: '#lineStatsResults', button: '#lineComputeStats', status: '#lineStatsStatus' },
  { type: 'pie', panel: '#pieStats', results: '#pieStatsResults', button: '#pieComputeStats', status: '#pieStatsStatus' },
  { type: 'roc', panel: '#rocStats', results: '#rocStatsResults', button: '#rocComputeStats', status: '#rocStatsStatus', prepare: [['#rocSinglePMethod', 'auto']] },
  { type: 'survival', panel: '#survivalStats', results: '#survivalStatsSummary', resultHeader: false, button: '#survivalComputeStats', status: '#survivalStatsStatus' }
];

async function expectHistogramButtonAppearance(button){
  const comparison = await button.evaluate(node => {
    const properties = [
      'backgroundColor', 'backgroundImage', 'boxShadow', 'color',
      'borderTopColor', 'borderTopStyle', 'borderTopWidth', 'borderRightColor', 'borderRightStyle', 'borderRightWidth',
      'borderBottomColor', 'borderBottomStyle', 'borderBottomWidth', 'borderLeftColor', 'borderLeftStyle', 'borderLeftWidth',
      'borderRadius', 'boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform',
      'textDecorationLine', 'cursor', 'opacity', 'transition'
    ];
    const read = element => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        ...Object.fromEntries(properties.map(property => [property, style[property]])),
        width: bounds.width,
        height: bounds.height
      };
    };
    const wasDisabled = node.disabled;
    const compareState = disabled => {
      node.disabled = disabled;
      const reference = document.querySelector('#histPage #histComputeStats')?.cloneNode(false);
      if (!reference) throw new Error('Histogram calculate button is missing');
      reference.disabled = disabled;
      reference.textContent = node.textContent;
      Object.assign(reference.style, { position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden' });
      document.body.appendChild(reference);
      const result = { actual: read(node), expected: read(reference) };
      reference.remove();
      return result;
    };
    const enabled = compareState(false);
    const disabled = compareState(true);
    node.disabled = wasDisabled;
    return { sharedClass: node.classList.contains('stats-calculate-button'), enabled, disabled };
  });
  expect(comparison.sharedClass).toBe(true);
  expect(comparison.enabled.actual).toEqual(comparison.enabled.expected);
  expect(comparison.disabled.actual).toEqual(comparison.disabled.expected);
}

for (const component of COMPONENTS) {
  test(`${component.type} analysis settings and results use the shared compact layout`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type: component.type, pageId: `${component.type}Page` }, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, { requireIdle: true });

    const panel = page.locator(`#${component.type}Page:not([hidden]) ${component.panel}`);
    const settings = panel.locator('.stats-analysis-settings');
    const body = settings.locator('.stats-analysis-settings__body');
    const heading = settings.locator('h3[id$="SettingsTitle"]');
    const advisor = settings.locator('.stats-advisor').first();
    const toggle = advisor.locator('.stats-advisor__toggle');
    const calculate = body.locator(component.button);

    await expect(settings).toBeVisible();
    await expect(heading).toHaveText('Analysis settings');
    await expect(calculate).toBeVisible();
    await expect(toggle).toHaveText('Help me choose');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', /.+/);

    for (const [selector, value] of component.prepare || []) {
      await panel.locator(selector).selectOption(value);
    }

    const structure = await settings.evaluate((node, componentType) => {
      const title = node.querySelector('h3[id$="SettingsTitle"]');
      const header = title?.closest('.stats-advisor__header') || null;
      const bodyNode = node.querySelector('.stats-analysis-settings__body');
      const action = bodyNode?.querySelector('.stats-action-row') || null;
      const visible = element => !!element && !element.hidden && element.getBoundingClientRect().height > 0;
      const visibleSelects = [...(bodyNode?.querySelectorAll('select') || [])].filter(visible);
      const inferenceInputs = [...(bodyNode?.querySelectorAll('.stats-inference-controls__input') || [])].filter(visible);
      const primaryControlLeftEdges = ['box', 'pie'].includes(componentType)
        ? [...(node.querySelectorAll('.box-stats-options__column--primary .box-stats-options__row') || [])]
          .map(row => row.querySelector('select'))
          .filter(visible)
          .map(select => select.getBoundingClientRect().left)
        : [];
      const rocFieldAlignment = componentType === 'roc'
        ? [...node.querySelectorAll('.roc-curve-comparison-controls .roc-stats-field')]
          .filter(visible)
          .map(field => {
            const label = field.querySelector('label');
            const select = field.querySelector('select');
            if (!visible(label) || !visible(select)) return null;
            const labelRect = label.getBoundingClientRect();
            const selectRect = select.getBoundingClientRect();
            return {
              labelLeft: labelRect.left,
              selectLeft: selectRect.left,
              labelBottom: labelRect.bottom,
              selectTop: selectRect.top
            };
          })
          .filter(Boolean)
        : [];
      const fieldLabels = [...bodyNode.querySelectorAll('.stats-analysis-field-label, .stats-inference-controls__label')].filter(visible).map(label => {
        const labelText = [...label.childNodes]
          .filter(child => child.nodeType === Node.TEXT_NODE)
          .map(child => child.textContent)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const associatedControl = (label.htmlFor && document.getElementById(label.htmlFor)) || null;
        const select = associatedControl?.tagName === 'SELECT'
          ? associatedControl
          : label.closest('label')?.querySelector('select')
            || label.parentElement?.querySelector('select')
            || null;
        const stackedField = label.closest('.roc-stats-field, .box-stats-options__row, .hist-stats-field, .config-panel__item--wide, .line-stats-primary-row, .stats-inference-controls__field, .survival-stats-pairwise-correction');
        const labelRect = label.getBoundingClientRect();
        const controlRect = stackedField ? select?.getBoundingClientRect() : null;
        const style = getComputedStyle(label);
        return {
          text: labelText,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          color: style.color,
          labelLeft: labelRect.left,
          controlLeft: controlRect?.left ?? null
        };
      });
      const styleProbe = document.createElement('span');
      styleProbe.style.cssText = [
        'position:fixed', 'visibility:hidden',
        'font-family:var(--ui-font-family)',
        'font-size:var(--ui-font-size-base)',
        'font-weight:var(--ui-font-weight-regular)',
        'line-height:var(--ui-line-height-normal)',
        'color:var(--ui-color-ink-control)'
      ].join(';');
      bodyNode.appendChild(styleProbe);
      const probeStyle = getComputedStyle(styleProbe);
      const expectedFieldLabelStyle = {
        fontFamily: probeStyle.fontFamily,
        fontSize: probeStyle.fontSize,
        fontWeight: probeStyle.fontWeight,
        lineHeight: probeStyle.lineHeight,
        color: probeStyle.color
      };
      styleProbe.remove();
      const previous = action && [...bodyNode.children].slice(0, [...bodyNode.children].indexOf(action)).filter(visible).pop();
      const gap = previous && action ? action.getBoundingClientRect().top - previous.getBoundingClientRect().bottom : null;
      return {
        titleSharesHeaderWithAdvisor: !!header?.querySelector('.stats-advisor__toggle'),
        actionInsideSettingsBox: !!action && bodyNode.contains(action),
        actionGap: gap,
        actionMarginTop: action ? getComputedStyle(action).marginTop : null,
        bodyOverflow: bodyNode ? bodyNode.scrollWidth - bodyNode.clientWidth : null,
        selectWidths: visibleSelects.map(select => select.getBoundingClientRect().width),
        inferenceInputSizes: inferenceInputs.map(input => ({
          width: input.getBoundingClientRect().width,
          height: input.getBoundingClientRect().height,
          flexBasis: getComputedStyle(input).flexBasis
        })),
        primaryControlLeftEdges,
        rocFieldAlignment,
        fieldLabels,
        expectedFieldLabelStyle
      };
    }, component.type);
    expect(structure.titleSharesHeaderWithAdvisor).toBe(true);
    expect(structure.actionInsideSettingsBox).toBe(true);
    expect(structure.actionMarginTop).toBe('0px');
    expect(structure.actionGap).toBeGreaterThanOrEqual(8);
    expect(structure.actionGap).toBeLessThanOrEqual(20);
    expect(structure.bodyOverflow).toBeLessThanOrEqual(1);
    for (const width of structure.selectWidths) expect(width).toBeLessThanOrEqual(520);
    expect(structure.inferenceInputSizes.length).toBeGreaterThan(0);
    expect(structure.fieldLabels.length).toBeGreaterThan(0);
    for (const field of structure.fieldLabels) {
      expect(field.text).not.toMatch(/:\s*$/);
      if (field.controlLeft !== null) expect(Math.abs(field.labelLeft - field.controlLeft)).toBeLessThanOrEqual(1);
      expect({
        fontFamily: field.fontFamily,
        fontSize: field.fontSize,
        fontWeight: field.fontWeight,
        lineHeight: field.lineHeight,
        color: field.color
      }).toEqual(structure.expectedFieldLabelStyle);
    }
    for (const { width, height, flexBasis } of structure.inferenceInputSizes) {
      expect(width).toBeGreaterThanOrEqual(80);
      expect(width).toBeLessThanOrEqual(110);
      expect(height).toBeGreaterThanOrEqual(24);
      expect(height).toBeLessThanOrEqual(40);
      expect(flexBasis).not.toBe('96px');
    }
    if (['box', 'pie'].includes(component.type)) {
      expect(structure.primaryControlLeftEdges.length).toBeGreaterThan(1);
      expect(Math.max(...structure.primaryControlLeftEdges) - Math.min(...structure.primaryControlLeftEdges)).toBeLessThanOrEqual(1);
    }
    if (component.type === 'roc') {
      expect(structure.rocFieldAlignment).toHaveLength(2);
      for (const field of structure.rocFieldAlignment) {
        expect(Math.abs(field.labelLeft - field.selectLeft)).toBeLessThanOrEqual(1);
        expect(field.selectTop).toBeGreaterThan(field.labelBottom);
      }
    }
    await testInfo.attach(`${component.type}-analysis-settings-measurement`, {
      body: JSON.stringify(structure, null, 2), contentType: 'application/json'
    });

    await expect(panel.locator(component.status)).toHaveCount(1);
    await expect(panel.locator(component.button)).toBeEnabled({ timeout: 20_000 });
    await expectHistogramButtonAppearance(calculate);
    await panel.locator(component.button).click();
    await expect.poll(async () => (await panel.locator(component.status).textContent()) || '', { timeout: 45_000 })
      .toMatch(/up to date|calculated for the current|current for this data/i);
    await page.evaluate(async type => {
      const tab = window.Main.session.getActiveTab();
      await window.Components[type].awaitReadyForSnapshot?.({ tab, tabId: tab.id, reason: 'analysis-settings-layout', timeoutMs: 20_000 });
    }, component.type);

    if (component.resultHeader !== false) {
      const results = panel.locator(component.results);
      await expect(results).toBeVisible();
      await expect(results.locator(':scope > .stats-reporting-controls .stats-results-title')).toHaveText('Results');
      await expect(results.locator(':scope > .stats-reporting-controls .stats-pvalue-format-select')).toBeVisible();
    } else {
      await expect(panel.locator('.stats-results-heading')).toContainText('Results');
      await expect(panel.locator('#survivalStatsPValueFormat .stats-pvalue-format-select')).toBeVisible();
      await expect(panel.locator(component.results)).toBeVisible();
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const expandedControlsId = await toggle.getAttribute('aria-controls');
    await expect(panel.locator(`[id="${expandedControlsId}"]`)).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: testInfo.outputPath(`${component.type}-analysis-settings.png`) });

    if (component.type === 'box') {
      for (const [leftId, rightId] of [
        ['#boxStatsFamily', '#boxStatsTestChoice'],
        ['#boxStatsDesign', '#boxStatsPostHoc'],
        ['#boxStatsScope', '#boxStatsCorrection']
      ]) {
        const left = await settings.locator(leftId).boundingBox();
        const right = await settings.locator(rightId).boundingBox();
        expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
      }
      const advanced = settings.locator('#boxStatsAdvancedParameters');
      await advanced.locator(':scope > summary').click();
      await expect(advanced.getByRole('group')).toHaveCount(4);
      const bounds = await advanced.boundingBox();
      const options = await settings.locator('.box-stats-options').boundingBox();
      expect(Math.abs(bounds.width - options.width)).toBeLessThanOrEqual(1);
      await settings.screenshot({ path: testInfo.outputPath('box-analysis-settings-expanded.png') });
    }

    for (const width of [1200, 1100, 700]) {
      await page.setViewportSize({ width, height: 1000 });
      const responsiveLayout = await body.evaluate(bodyNode => {
        const bounds = bodyNode.getBoundingClientRect();
        const visible = element => !element.hidden && element.getBoundingClientRect().height > 0;
        const controls = [...bodyNode.querySelectorAll('select, input')].filter(visible);
        const primaryControls = [...bodyNode.querySelectorAll('.box-stats-options__column--primary .box-stats-options__row select')].filter(visible);
        const primaryLeftEdges = primaryControls.map(control => control.getBoundingClientRect().left);
        return {
          overflow: bodyNode.scrollWidth - bodyNode.clientWidth,
          controlsStayInside: controls.every(control => {
            const rect = control.getBoundingClientRect();
            return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
          }),
          primaryControlAlignment: primaryLeftEdges.length > 1
            ? Math.max(...primaryLeftEdges) - Math.min(...primaryLeftEdges)
            : 0,
          selectWidths: controls.filter(control => control.tagName === 'SELECT').map(control => control.getBoundingClientRect().width)
        };
      });
      expect(responsiveLayout.overflow, `${component.type} overflows at ${width}px`).toBeLessThanOrEqual(1);
      expect(responsiveLayout.controlsStayInside, `${component.type} controls escape their settings box at ${width}px`).toBe(true);
      expect(responsiveLayout.primaryControlAlignment, `${component.type} dropdowns misalign at ${width}px`).toBeLessThanOrEqual(1);
      if (component.type === 'box') {
        const widths = responsiveLayout.selectWidths;
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
      }
    }

    if (component.type === 'line') {
      await page.setViewportSize({ width: 1600, height: 1100 });
      await panel.locator('#lineRegressionMode').selectOption('arima');
      const forecastControls = panel.locator('#lineForecastControls');
      await expect(forecastControls).toBeVisible();
      const forecastLabels = await forecastControls.locator('.stats-analysis-field-label').evaluateAll(labels => labels.map(label => {
        const directText = [...label.childNodes]
          .filter(child => child.nodeType === Node.TEXT_NODE)
          .map(child => child.textContent)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const style = getComputedStyle(label);
        return {
          text: directText,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          color: style.color
        };
      }));
      expect(forecastLabels.map(label => label.text)).toEqual(['Horizon', 'Season Length', 'ARIMA selection criterion']);
      for (const { text, fontFamily, fontSize, fontWeight, lineHeight, color } of forecastLabels) {
        expect(text).not.toMatch(/:\s*$/);
        expect({ fontFamily, fontSize, fontWeight, lineHeight, color }).toEqual(structure.expectedFieldLabelStyle);
      }
      await forecastControls.screenshot({ path: testInfo.outputPath('line-forecast-analysis-settings.png') });
    }
  });
}

test('Venn keeps its existing statistics disclosure and uses the shared calculate-button style', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'venn', { requireIdle: true });

  const pageRoot = page.locator('#vennPage:not([hidden])');
  const disclosure = pageRoot.locator('#significanceSection');
  await disclosure.locator(':scope > summary').click();
  const calculate = pageRoot.locator('#calcSignificance');
  await expect(calculate).toBeVisible();
  await expect(pageRoot.locator('.stats-analysis-settings')).toHaveCount(0);
  await expectHistogramButtonAppearance(calculate);
  await disclosure.screenshot({ path: testInfo.outputPath('venn-calculate-statistics.png') });
});
