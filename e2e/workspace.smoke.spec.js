const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('welcome primary actions and popular examples form one responsive entry row', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const fileTool = page.locator('#welcomeFileDropZone');
  const finder = page.locator('.welcome-graph-finder');
  const popular = page.locator('.welcome-popular');
  await expect(fileTool).toContainText('Open or drop a file');
  await expect(fileTool.locator('[data-file-formats-label="welcome"]')).toHaveText(
    '.graph, .prism, .pzfx, .csv, .tsv, .txt, .xls, .xlsx, .ods'
  );
  const importCopyOrder = await fileTool.locator('.welcome-drop-zone__copy > span').evaluateAll(nodes => (
    nodes.map(node => node.classList.contains('welcome-drop-zone__supporting') ? 'supporting' : 'formats')
  ));
  expect(importCopyOrder).toEqual(['supporting', 'formats']);
  await expect(page.locator('#welcomeOpenButton')).toHaveCount(0);
  await expect(page.locator('.welcome-hero__subtitle')).toHaveCount(0);
  await expect(page.locator('.welcome-panel__eyebrow')).toHaveCount(0);
  await expect(page.locator('.welcome-section-header__eyebrow')).toHaveCount(0);
  await expect(page.locator('.welcome-section-header__subtitle')).toHaveCount(0);
  await expect(page.locator('#welcomeGraphFamiliesTitle')).toHaveText('Choose a graph type');
  await expect(page.locator('.welcome-drop-zone__action')).toHaveText('Browse');
  await expect(popular.locator('.welcome-example-card')).toHaveCount(11);
  await expect(popular.locator('.welcome-example-card .welcome-example-card__thumb > svg[data-inline-ready="true"]')).toHaveCount(11);
  await expect(popular.locator('.welcome-example-card').filter({ hasText: 'Open example' })).toHaveCount(0);
  await expect(popular).toHaveCSS('position', 'static');
  await expect.poll(() => popular.evaluate(node => getComputedStyle(node, '::before').content)).toBe('none');
  await expect(page.locator('#welcomeViewAllExamples')).toHaveText('View all 11');

  const carousel = page.locator('#welcomePopularExamplesList');
  const previousButton = page.locator('#welcomePopularExamplesPrev');
  const nextButton = page.locator('#welcomePopularExamplesNext');
  await expect(previousButton).toBeDisabled();
  await expect(nextButton).toBeEnabled();
  const initialCarouselLayout = await carousel.evaluate(node => {
    const items = Array.from(node.querySelectorAll('.welcome-example-item'));
    const viewport = node.getBoundingClientRect();
    const visibleItems = items.filter(item => {
      const rect = item.getBoundingClientRect();
      return rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1;
    });
    const widths = items.map(item => item.getBoundingClientRect().width);
    return {
      visibleCount: visibleItems.length,
      equalWidths: Math.max(...widths) - Math.min(...widths) < 0.5,
      overflow: node.scrollWidth > node.clientWidth
    };
  });
  expect(initialCarouselLayout).toEqual({ visibleCount: 4, equalWidths: true, overflow: true });

  await nextButton.click();
  await expect.poll(() => carousel.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await expect(previousButton).toBeEnabled();

  const scrollBeforeWheel = await carousel.evaluate(node => node.scrollLeft);
  await carousel.hover();
  await page.mouse.wheel(0, 120);
  await expect(carousel).toHaveClass(/is-wheel-scrolling/);
  const wheelSamples = [];
  for (let sample = 0; sample < 4; sample += 1) {
    await page.waitForTimeout(16);
    wheelSamples.push(await carousel.evaluate(node => node.scrollLeft));
  }
  expect(wheelSamples[0]).toBeGreaterThan(scrollBeforeWheel);
  await expect.poll(() => carousel.evaluate(node => node.classList.contains('is-wheel-scrolling'))).toBe(false);

  const thumbnailContracts = await popular.locator('.welcome-example-card__thumb > svg').evaluateAll(nodes => nodes.map(svg => {
    const type = svg.dataset.graphitixWelcomeThumbnail || '';
    const idPrefix = `graphitix-welcome-${type}-id-`;
    const ids = Array.from(svg.querySelectorAll('[id]'), node => node.id);
    const referencedIds = Array.from(svg.querySelectorAll('*')).flatMap(node => (
      Array.from(node.attributes || []).flatMap(attribute => (
        Array.from(attribute.value.matchAll(/url\(\s*["']?#([^)"'\s]+)["']?\s*\)/g), match => match[1])
      ))
    ));
    const idSet = new Set(ids);
    return {
      titleCount: svg.querySelectorAll('text[data-font-role="graphTitle"]').length,
      titleSuppressed: svg.dataset.graphTitleSuppressed,
      strokeContract: svg.dataset.proportionalStrokeContract,
      bakedStrokeCount: svg.querySelectorAll('[data-welcome-baked-stroke="true"]').length,
      declaredBakedStrokeCount: Number(svg.dataset.nonScalingStrokeCount || 0),
      deterministicIds: svg.dataset.idPrefix === idPrefix
        && ids.length === idSet.size
        && ids.every(id => new RegExp(`^${idPrefix}\\d+$`).test(id))
        && referencedIds.every(id => idSet.has(id))
    };
  }));
  expect(thumbnailContracts.every(contract => (
    contract.titleCount === 0
    && contract.titleSuppressed === 'true'
    && contract.strokeContract === 'source-viewport-baked-strokes-v1'
    && contract.bakedStrokeCount === contract.declaredBakedStrokeCount
    && contract.deterministicIds === true
  ))).toBe(true);

  const heatmapThumbnail = popular.locator('.welcome-example-card[data-graph-type="heatmap"] .welcome-example-card__thumb > svg');
  const measureHeatmapStroke = () => heatmapThumbnail.evaluate(svg => {
    const stroke = svg.querySelector('[data-welcome-baked-stroke="true"]');
    if (!(stroke instanceof SVGGraphicsElement)) {
      throw new Error('Heatmap thumbnail has no baked responsive stroke.');
    }
    const matrix = stroke.getScreenCTM();
    const svgMatrix = svg.getScreenCTM();
    const scale = matrix
      ? Math.sqrt(Math.hypot(matrix.a, matrix.b) * Math.hypot(matrix.c, matrix.d))
      : 0;
    const svgScale = svgMatrix
      ? Math.sqrt(Math.hypot(svgMatrix.a, svgMatrix.b) * Math.hypot(svgMatrix.c, svgMatrix.d))
      : 0;
    return {
      svgScale,
      displayStrokeWidth: Number(stroke.getAttribute('stroke-width')) * scale,
      vectorEffect: stroke.getAttribute('vector-effect')
    };
  });
  const desktopHeatmapStroke = await measureHeatmapStroke();
  expect(desktopHeatmapStroke.vectorEffect).toBeNull();

  const welcomeTypography = await page.evaluate(() => {
    const size = selector => Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    return {
      productTitle: size('.welcome-hero__title'),
      tagline: size('.welcome-hero__lede'),
      panelTitle: size('.welcome-panel__title'),
      sectionTitle: size('.welcome-section-header__title'),
      graphCardTitle: size('.graph-card__title'),
      exampleTitle: size('.welcome-example-card--compact .welcome-example-card__title')
    };
  });
  expect(welcomeTypography).toEqual({
    productTitle: 34,
    tagline: 16.5,
    panelTitle: 18,
    sectionTitle: 18,
    graphCardTitle: 16,
    exampleTitle: 12.25
  });
  expect(welcomeTypography.productTitle).toBeGreaterThan(welcomeTypography.panelTitle);
  expect(welcomeTypography.panelTitle).toBeGreaterThan(welcomeTypography.graphCardTitle);
  expect(welcomeTypography.graphCardTitle).toBeGreaterThan(welcomeTypography.exampleTitle);

  const desktopLayout = await page.locator('.welcome-action-grid').evaluate(node => {
    const file = node.querySelector('#welcomeFileDropZone').getBoundingClientRect();
    const graphFinder = node.querySelector('.welcome-graph-finder').getBoundingClientRect();
    const examples = node.querySelector('.welcome-popular').getBoundingClientRect();
    return {
      aligned: Math.abs(file.top - graphFinder.top) < 1 && Math.abs(file.top - examples.top) < 1,
      ordered: file.right < graphFinder.left && graphFinder.right < examples.left
    };
  });
  expect(desktopLayout).toEqual({ aligned: true, ordered: true });

  const popularGeometry = await popular.evaluate(node => {
    const thumb = node.querySelector('.welcome-example-card__thumb')?.getBoundingClientRect();
    const finderBox = document.querySelector('.welcome-graph-finder')?.getBoundingClientRect();
    const popularBox = node.getBoundingClientRect();
    return {
      thumbWidth: thumb?.width || 0,
      thumbHeight: thumb?.height || 0,
      popularWidth: popularBox.width,
      finderWidth: finderBox?.width || 0
    };
  });
  expect(popularGeometry.thumbWidth).toBeGreaterThanOrEqual(120);
  expect(popularGeometry.thumbHeight).toBeGreaterThanOrEqual(80);
  expect(popularGeometry.popularWidth).toBeGreaterThan(popularGeometry.finderWidth * 1.8);

  const firstGraphCard = page.locator('#graphSelectionGrid .graph-card').first();
  await expect(firstGraphCard).toBeVisible();
  await expect.poll(() => firstGraphCard.evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThan(900);

  await page.evaluate(() => {
    window.__welcomeOpenCalls = 0;
    window.Shared.fileIO.openGraphFile = async () => {
      window.__welcomeOpenCalls += 1;
      return { status: 'cancelled' };
    };
  });
  await fileTool.click();
  await expect.poll(() => page.evaluate(() => window.__welcomeOpenCalls)).toBe(1);

  await page.locator('#welcomeGraphSearch').fill('scatter');
  await expect(page.locator('#welcomeGraphResults')).toBeVisible();
  await expect(page.locator('#welcomeGraphResults .welcome-picker__option').first()).toContainText('Scatter');

  await page.locator('#welcomeViewAllExamples').click();
  const gallery = page.locator('#welcomeExamplesDialog');
  await expect(gallery).toBeVisible();
  await expect(gallery).toHaveAttribute('aria-hidden', 'false');
  await expect(gallery.locator('.welcome-example-card')).toHaveCount(11);
  await expect(gallery.locator('.welcome-example-card .welcome-example-card__thumb > svg[data-inline-ready="true"]')).toHaveCount(11);
  await expect(gallery.locator('.welcome-example-card__thumb img')).toHaveCount(0);
  await expect(gallery.locator('.welcome-example-card__thumb image')).toHaveCount(0);
  await expect(gallery.locator('.welcome-example-card').filter({ hasText: 'Open example' })).toHaveCount(0);

  const desktopGalleryLayout = await gallery.locator('.welcome-all-examples').evaluate(node => {
    const cards = Array.from(node.querySelectorAll('.welcome-example-card'));
    const rects = cards.map(card => card.getBoundingClientRect());
    const firstRowTop = rects[0]?.top ?? 0;
    return {
      firstRowCount: rects.filter(rect => Math.abs(rect.top - firstRowTop) < 1).length,
      maxCardWidth: Math.max(...rects.map(rect => rect.width)),
      centered: Math.abs(
        (rects[0].left + rects[Math.max(0, rects.filter(rect => Math.abs(rect.top - firstRowTop) < 1).length - 1)].right) / 2
        - node.getBoundingClientRect().left
        - node.getBoundingClientRect().width / 2
      ) < 1
    };
  });
  expect(desktopGalleryLayout.firstRowCount).toBeGreaterThanOrEqual(5);
  expect(desktopGalleryLayout.maxCardWidth).toBeLessThanOrEqual(212.5);
  expect(desktopGalleryLayout.centered).toBe(true);

  await expect(gallery.locator('.welcome-dialog__panel')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(gallery.locator('.welcome-example-card').last()).toBeFocused();
  await page.locator('#welcomeExamplesDialogClose').click();
  await expect(gallery).toBeHidden();
  await expect(page.locator('#welcomeViewAllExamples')).toBeFocused();

  await page.setViewportSize({ width: 640, height: 900 });
  const mobileLayout = await page.locator('.welcome-action-grid').evaluate(node => {
    const file = node.querySelector('#welcomeFileDropZone').getBoundingClientRect();
    const graphFinder = node.querySelector('.welcome-graph-finder').getBoundingClientRect();
    const examples = node.querySelector('.welcome-popular').getBoundingClientRect();
    return graphFinder.top > file.bottom && examples.top > graphFinder.bottom;
  });
  expect(mobileLayout).toBe(true);

  const mobileHeatmapStroke = await measureHeatmapStroke();
  const responsiveSvgScale = mobileHeatmapStroke.svgScale / desktopHeatmapStroke.svgScale;
  expect(mobileHeatmapStroke.displayStrokeWidth / desktopHeatmapStroke.displayStrokeWidth)
    .toBeCloseTo(responsiveSvgScale, 4);
});

test('workspace loads and opens a graph tab from welcome screen', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId);
    return active?.type === 'scatter';
  }, null, { timeout: 20_000 });
  await expect(page.locator('#saveScatter')).toBeVisible();
});

test('PCA literature example honors its standard-table presentation contract', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#welcomeScreen[data-welcome-ready="true"]');

  await page.evaluate(async () => {
    await window.Main.tabs.launchWelcomeGraph('pca', {
      loadExample: true,
      reason: 'e2e-pca-literature-example'
    });
  });
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId);
    const root = active
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'pca')
      : null;
    const svg = root?.querySelector?.('#pcaSvg');
    const format = root?.querySelector?.('#pcaTableFormat');
    return active?.type === 'pca'
      && format?.value === 'standard'
      && typeof svg?.innerHTML === 'string'
      && svg.innerHTML.trim().length > 0;
  }, null, { timeout: 120_000 });

  await expect(page.locator('#pcaTableFormat')).toHaveValue('standard');
});

test('renaming a workspace tab stays inside the tab without expanding the tab list', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  const tab = page.locator('#workspaceTabsList .workspace-tab.is-active');
  const label = tab.locator('.workspace-tab__label');
  const tabsList = page.locator('#workspaceTabsList');
  const scrollWidthBefore = await tabsList.evaluate(node => node.scrollWidth);

  await label.dblclick();

  const input = tab.locator('.workspace-tab__rename');
  await expect(input).toBeVisible();
  const geometry = await tab.evaluate(node => {
    const field = node.querySelector('.workspace-tab__rename');
    const tabBox = node.getBoundingClientRect();
    const fieldBox = field.getBoundingClientRect();
    return {
      fieldLeft: fieldBox.left,
      fieldRight: fieldBox.right,
      tabLeft: tabBox.left,
      tabRight: tabBox.right,
      background: getComputedStyle(field).backgroundColor
    };
  });

  expect(geometry.fieldLeft).toBeGreaterThanOrEqual(geometry.tabLeft);
  expect(geometry.fieldRight).toBeLessThanOrEqual(geometry.tabRight);
  expect(geometry.background).toBe('rgba(0, 0, 0, 0)');
  await expect.poll(() => tabsList.evaluate(node => node.scrollWidth)).toBe(scrollWidthBefore);
});

test('overflowing workspace tabs use a thin scrollbar', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    const { session, tabs } = window.Main;
    for (let index = 0; index < 14; index += 1) {
      session.workspaceState.tabs.push(session.createTab({ title: `Workspace ${index + 2}` }));
    }
    tabs.renderTabs();
  });

  const scrollbar = await page.locator('#workspaceTabsList').evaluate(node => {
    const tab = node.querySelector('.workspace-tab');
    const label = tab.querySelector('.workspace-tab__label');
    const listBox = node.getBoundingClientRect();
    const thickness = node.offsetHeight - node.clientHeight;
    return {
      thickness,
      overflows: node.scrollWidth > node.clientWidth,
      dockHeight: node.closest('.workspace-tabs-dock').getBoundingClientRect().height,
      visibleBottom: listBox.bottom - thickness,
      tabHeight: tab.getBoundingClientRect().height,
      tabBottom: tab.getBoundingClientRect().bottom,
      labelBottom: label.getBoundingClientRect().bottom
    };
  });

  expect(scrollbar.overflows).toBe(true);
  expect(scrollbar.dockHeight).toBe(42);
  expect(scrollbar.thickness).toBeLessThanOrEqual(8);
  expect(scrollbar.tabHeight).toBeGreaterThanOrEqual(36);
  expect(scrollbar.tabBottom).toBeLessThanOrEqual(scrollbar.visibleBottom);
  expect(scrollbar.labelBottom).toBeLessThanOrEqual(scrollbar.visibleBottom);

  await page.evaluate(() => {
    const { session, tabs } = window.Main;
    session.workspaceState.tabs.splice(1);
    tabs.renderTabs();
  });
  await expect.poll(() => page.locator('#workspaceTabsDock').evaluate(node => node.getBoundingClientRect().height)).toBe(36);
});

test('Surface legend visibility is canonical and does not alter plot geometry', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'surface', pageId: 'surfacePage' },
    { first: true, loadExample: true }
  );

  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'surface') || null
      : null;
    return active?.type === 'surface'
      && root?.querySelector('#surfaceShowLegend')?.checked === true
      && !!root.querySelector('.resizer-options-menu .resizer-legend-control #surfaceShowLegend')
      && !!root.querySelector('#surfaceSvg g.surface-legend');
  }, null, { timeout: 30_000 });

  const capturePlotGeometry = () => page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'surface') || null
      : null;
    const svg = root?.querySelector('#surfaceSvg') || null;
    if (!svg) return null;

    const attributeNames = [
      'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
      'width', 'height', 'd', 'points', 'transform', 'font-size', 'text-anchor'
    ];
    const layerSelectors = [
      '.surface-layer-background',
      '.surface-layer-geometry',
      '.surface-layer-foreground',
      '.surface-layer-axes'
    ];
    const layers = layerSelectors.map(selector => {
      const layer = svg.querySelector(selector);
      if (!layer) return null;
      const clone = layer.cloneNode(true);
      clone.querySelectorAll('.surface-legend, [data-legend-key]').forEach(node => node.remove());
      return Array.from(clone.querySelectorAll('g,path,polygon,polyline,line,rect,circle,ellipse,text')).map(node => ({
        tag: node.tagName.toLowerCase(),
        className: node.getAttribute('class') || '',
        text: node.tagName.toLowerCase() === 'text' ? node.textContent : '',
        attrs: Object.fromEntries(attributeNames
          .filter(name => node.hasAttribute(name))
          .map(name => [name, node.getAttribute(name)]))
      }));
    });
    return {
      layers,
      showLegend: window.Components?.surface?.getPayload?.()?.config?.settings?.showLegend
    };
  });

  const before = await capturePlotGeometry();
  expect(before).not.toBeNull();
  expect(before.showLegend).toBe(true);

  await page.locator('#surfacePage:not([hidden]) .resizer-options-summary').click();
  const legendControl = page.locator('#surfacePage:not([hidden]) #surfaceShowLegend');
  await legendControl.uncheck();
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'surface') || null
      : null;
    return root?.querySelector('#surfaceShowLegend')?.checked === false
      && !root?.querySelector('#surfaceSvg g.surface-legend')
      && window.Components?.surface?.getPayload?.()?.config?.settings?.showLegend === false;
  }, null, { timeout: 30_000 });

  const after = await capturePlotGeometry();
  expect(after.showLegend).toBe(false);
  expect(after.layers).toEqual(before.layers);
});
