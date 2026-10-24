const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { confirmDataImportPrompt, openComponentFromWelcome } = require('../helpers/workspaceDriver');

test('welcome page follows the new theme across desktop and mobile', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const activeWorkspaceTab = page.locator('.workspace-tab.is-active');
  await expect(activeWorkspaceTab).toBeVisible();
  const activeTabStyle = await activeWorkspaceTab.evaluate(tab => ({
    background: getComputedStyle(tab).backgroundColor,
    underline: getComputedStyle(tab.querySelector('.workspace-tab__label'), '::after').backgroundColor
  }));
  expect(activeTabStyle.background).toBe('rgb(255, 255, 255)');
  expect(activeTabStyle.underline).toBe('rgb(11, 110, 105)');

  const fileTool = page.locator('#welcomeFileDropZone');
  const popular = page.locator('.welcome-popular');
  await expect(fileTool).toContainText('Open or drop a file');
  const fileTitleMetrics = await fileTool.locator('.welcome-panel__title').evaluate(node => ({
    height: node.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(node).lineHeight)
  }));
  expect(fileTitleMetrics.height).toBeLessThanOrEqual(fileTitleMetrics.lineHeight + 1);
  await expect(fileTool.locator('.welcome-drop-zone__copy > span')).toHaveText([
    'Open a workspace or import data.',
    '.graph, .prism, .pzfx, .csv, .tsv, .txt, .xls, .xlsx, .ods'
  ]);
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
  const magnifier = page.locator('.welcome-graph-finder__icon');
  await expect(magnifier.locator('circle')).toHaveAttribute('r', '7');
  await expect(magnifier.locator('path')).toHaveAttribute('d', 'm20 20-4-4');
  expect(await magnifier.evaluate(svg => Array.from(svg.children).map(node => ({
    fill: getComputedStyle(node).fill,
    strokeWidth: getComputedStyle(node).strokeWidth
  })))).toEqual([
    { fill: 'none', strokeWidth: '2px' },
    { fill: 'none', strokeWidth: '2px' }
  ]);
  await expect(page.locator('#graphSelectionGrid .welcome-graph-category')).toHaveCount(3);
  const graphActions = page.locator('#graphSelectionGrid .graph-card__action');
  const matchedActionHeights = async () => Promise.all([
    '.welcome-drop-zone__action',
    '#welcomeGraphSearch',
    '#graphSelectionGrid .graph-card__action--new'
  ].map(selector => page.locator(selector).first().evaluate(node => Math.round(node.getBoundingClientRect().height))));
  await expect(graphActions.first()).toHaveCSS('min-height', '36px');
  const newActionBackground = await graphActions.first().evaluate(node => {
    const probe = node.ownerDocument.createElement('span');
    probe.style.backgroundColor = getComputedStyle(node).getPropertyValue('--gt-surface-muted').trim();
    node.ownerDocument.body.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  await expect(graphActions.first()).toHaveCSS('background-color', newActionBackground);
  const newActionColors = await page.locator('#graphSelectionGrid .graph-card').first().evaluate(card => {
    const newAction = card.querySelector('.graph-card__action--new');
    const exampleAction = card.querySelector('.graph-card__action--example');
    const icon = card.querySelector('.graph-card__icon');
    return {
      newText: getComputedStyle(newAction).color,
      exampleText: getComputedStyle(exampleAction).color,
      iconTile: getComputedStyle(icon).backgroundColor,
      iconAxis: getComputedStyle(icon.querySelector('.welcome-icon__axis')).stroke,
      iconBoxes: Array.from(icon.querySelectorAll('.welcome-icon__box'), box => getComputedStyle(box).fill)
    };
  });
  const expectedIconColors = await page.locator('#graphSelectionGrid .graph-card__icon').first().evaluate(icon => {
    const resolve = (property, token) => {
      const probe = document.createElement('span');
      probe.style.setProperty(property, getComputedStyle(icon).getPropertyValue(token).trim());
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return color;
    };
    return {
      tile: resolve('background-color', '--ui-surface-subtle'),
      axis: resolve('color', '--welcome-icon-axis')
    };
  });
  expect(newActionColors.newText).toBe(newActionColors.exampleText);
  expect(newActionColors.iconTile).toBe(expectedIconColors.tile);
  expect(newActionColors.iconAxis).toBe(expectedIconColors.axis);
  expect(new Set(newActionColors.iconBoxes).size).toBe(3);
  expect(await matchedActionHeights()).toEqual([36, 36, 36]);
  await expect(page.locator('#graphSelectionGrid .welcome-graph-category__title')).toHaveText([
    'Compare & summarize', 'Relate & explore', 'Over time & outcomes'
  ]);
  await expect(page.locator('#graphSelectionGrid .welcome-graph-category').nth(0).locator('.graph-card')).toHaveCount(4);
  await expect(page.locator('#graphSelectionGrid .welcome-graph-category').nth(1).locator('.graph-card')).toHaveCount(4);
  await expect(page.locator('#graphSelectionGrid .welcome-graph-category').nth(2).locator('.graph-card')).toHaveCount(3);
  await expect(page.locator('.welcome-drop-zone__action')).toHaveText('Browse');
  await expect(popular.locator('.welcome-example-card')).toHaveCount(11);
  await expect(popular.locator('.welcome-example-card').first()).toHaveCSS('overflow', 'hidden');
  await expect(popular.locator('.welcome-example-card__title').first()).toHaveCSS('text-align', 'center');
  await expect(popular.locator('.welcome-example-card .welcome-example-card__thumb > svg[data-inline-ready="true"]')).toHaveCount(11);
  await expect(popular.locator('.welcome-example-card').filter({ hasText: 'Open example' })).toHaveCount(0);
  await expect(popular.locator('.welcome-example-card__thumb > svg').first()).toHaveAttribute('data-preview-source', 'Graphitix owner-scoped SVG projection');
  await expect(popular).toHaveCSS('position', 'static');
  await expect.poll(() => popular.evaluate(node => getComputedStyle(node, '::before').content)).toBe('none');
  await expect(page.locator('#welcomeViewAllExamples')).toHaveText('View all 11');

  const carousel = page.locator('#welcomePopularExamplesList');
  const previousButton = page.locator('#welcomePopularExamplesPrev');
  const nextButton = page.locator('#welcomePopularExamplesNext');
  await expect(previousButton).toBeDisabled();
  await expect(nextButton).toBeEnabled();
  await expect(previousButton).toHaveCSS('width', '32px');
  await expect(nextButton).toHaveCSS('width', '32px');
  await expect(carousel).toHaveCSS('scrollbar-width', 'none');
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

  const measureCarouselControls = () => page.evaluate(() => {
    const card = document.querySelector('#welcomePopularExamplesList .welcome-example-card');
    const previous = document.getElementById('welcomePopularExamplesPrev');
    const next = document.getElementById('welcomePopularExamplesNext');
    const cardBox = card.getBoundingClientRect();
    return [previous, next].map(node => {
      const box = node.getBoundingClientRect();
      return {
        height: box.height,
        centerOffset: Math.abs(box.top + box.height / 2 - cardBox.top - cardBox.height / 2)
      };
    });
  });
  for (const control of await measureCarouselControls()) {
    expect(control.height).toBe(32);
    expect(control.centerOffset).toBeLessThanOrEqual(1);
  }

  await nextButton.click();
  await expect.poll(() => carousel.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await expect(previousButton).toBeEnabled();
  await expect.poll(
    () => carousel.evaluate(node => new Promise(resolve => {
      const before = node.scrollLeft;
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(Math.abs(node.scrollLeft - before))));
    })),
    { timeout: 2000, intervals: [32, 64] }
  ).toBe(0);

  await previousButton.click();
  await expect.poll(() => carousel.evaluate(node => node.scrollLeft)).toBe(0);
  await expect(previousButton).toBeDisabled();
  await expect.poll(
    () => carousel.evaluate(node => new Promise(resolve => {
      const before = node.scrollLeft;
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(Math.abs(node.scrollLeft - before))));
    })),
    { timeout: 2000, intervals: [32, 64] }
  ).toBe(0);

  await carousel.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => carousel.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(
    () => carousel.evaluate(node => new Promise(resolve => {
      const before = node.scrollLeft;
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(Math.abs(node.scrollLeft - before))));
    })),
    { timeout: 2000, intervals: [32, 64] }
  ).toBe(0);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => carousel.evaluate(node => node.scrollLeft)).toBe(0);
  await expect.poll(
    () => carousel.evaluate(node => new Promise(resolve => {
      const before = node.scrollLeft;
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(Math.abs(node.scrollLeft - before))));
    })),
    { timeout: 2000, intervals: [32, 64] }
  ).toBe(0);

  const scrollBeforeWheel = await carousel.evaluate(node => node.scrollLeft);
  await carousel.hover();
  await page.mouse.wheel(0, 120);
  await expect.poll(
    () => carousel.evaluate(node => node.scrollLeft),
    { timeout: 1000, intervals: [16, 32, 64, 128] }
  ).toBeGreaterThan(scrollBeforeWheel);
  await expect(carousel).not.toHaveClass(/is-wheel-scrolling/);

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
      previewSource: svg.dataset.previewSource,
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
    && contract.previewSource === 'Graphitix owner-scoped SVG projection'
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
    productTitle: 28,
    tagline: 14,
    panelTitle: 17,
    sectionTitle: 24,
    graphCardTitle: 17,
    exampleTitle: 13
  });
  expect(welcomeTypography.productTitle).toBeGreaterThan(welcomeTypography.panelTitle);
  expect(welcomeTypography.sectionTitle).toBeGreaterThan(welcomeTypography.panelTitle);
  expect(welcomeTypography.panelTitle).toBe(welcomeTypography.graphCardTitle);
  expect(welcomeTypography.graphCardTitle).toBeGreaterThan(welcomeTypography.exampleTitle);

  const desktopLayout = await page.locator('.welcome-action-grid').evaluate(node => {
    const file = node.querySelector('#welcomeFileDropZone').getBoundingClientRect();
    const graphFinder = node.querySelector('.welcome-graph-finder').getBoundingClientRect();
    const examples = node.querySelector('.welcome-popular').getBoundingClientRect();
    const browse = node.querySelector('.welcome-drop-zone__action').getBoundingClientRect();
    const search = node.querySelector('.welcome-hero__search-input').getBoundingClientRect();
    return {
      aligned: Math.abs(file.top - graphFinder.top) < 1 && Math.abs(file.top - examples.top) < 1,
      controlsAligned: Math.abs(browse.bottom - search.bottom) < 1,
      ordered: file.right < graphFinder.left && graphFinder.right < examples.left
    };
  });
  expect(desktopLayout).toEqual({ aligned: true, controlsAligned: true, ordered: true });

  const popularGeometry = await popular.evaluate(node => {
    const thumb = node.querySelector('.welcome-example-card__thumb')?.getBoundingClientRect();
    const finderBox = document.querySelector('.welcome-graph-finder')?.getBoundingClientRect();
    const popularBox = node.getBoundingClientRect();
    const captions = Array.from(node.querySelectorAll('.welcome-example-card__title'));
    return {
      thumbWidth: thumb?.width || 0,
      thumbHeight: thumb?.height || 0,
      popularWidth: popularBox.width,
      finderWidth: finderBox?.width || 0,
      captionsContained: captions.every(caption => {
        const box = caption.getBoundingClientRect();
        return box.top >= popularBox.top && box.bottom <= popularBox.bottom;
      }),
      captionGap: captions[0].getBoundingClientRect().top - thumb.bottom
    };
  });
  expect(popularGeometry.thumbWidth).toBeGreaterThanOrEqual(118);
  expect(popularGeometry.thumbHeight).toBeGreaterThanOrEqual(80);
  expect(popularGeometry.popularWidth).toBeGreaterThan(popularGeometry.finderWidth * 1.8);
  expect(popularGeometry.captionsContained).toBe(true);
  expect(popularGeometry.captionGap).toBe(0);

  const firstGraphCard = page.locator('#graphSelectionGrid .graph-card').first();
  await expect(firstGraphCard).toBeVisible();
  const designGeometry = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    const rounded = value => Math.round(value * 10) / 10;
    const frame = box('.welcome-container');
    const actions = box('.welcome-action-grid');
    const popular = box('.welcome-popular');
    const popularHeader = box('.welcome-popular .welcome-panel__header');
    const carousel = box('.welcome-popular__carousel');
    const category = box('.welcome-graph-category__title');
    const graph = box('#graphSelectionGrid .graph-card');
    return {
      frameWidth: rounded(frame.width),
      actionX: rounded(actions.x),
      actionY: rounded(actions.y),
      actionWidth: rounded(actions.width),
      actionHeight: rounded(actions.height),
      popularHeight: rounded(popular.height),
      carouselGap: rounded(carousel.y - popularHeader.bottom),
      categoryY: rounded(category.y),
      graphY: rounded(graph.y)
    };
  });
  expect(designGeometry).toMatchObject({
    frameWidth: 1280,
    actionX: 32,
    actionY: 117,
    actionWidth: 1216
  });
  expect(designGeometry.actionHeight).toBeLessThan(210);
  expect(designGeometry.popularHeight).toBe(designGeometry.actionHeight);
  expect(designGeometry.carouselGap).toBe(2);
  expect(designGeometry.categoryY).toBeGreaterThan(designGeometry.actionY + designGeometry.actionHeight);
  expect(designGeometry.graphY).toBeGreaterThan(designGeometry.categoryY);
  expect(await firstGraphCard.evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThan(900);

  await page.evaluate(() => {
    window.__welcomeOpenCalls = 0;
    window.Shared.fileIO.openGraphFile = async () => {
      window.__welcomeOpenCalls += 1;
      return { status: 'cancelled' };
    };
  });
  await fileTool.click();
  await expect.poll(() => page.evaluate(() => window.__welcomeOpenCalls)).toBe(1);

  await page.setViewportSize({ width: 1280, height: 700 });
  await page.locator('#welcomeGraphSearch').fill('scatter');
  await expect(page.locator('#welcomeGraphResults')).toBeVisible();
  await expect(page.locator('#welcomeGraphResults .welcome-picker__option').first()).toContainText('Scatter');
  await page.locator('#welcomeGraphSearch').fill('plot');
  await expect(page.locator('#welcomeGraphResults .welcome-picker__option').nth(2)).toBeVisible();
  const pickerGeometry = await page.evaluate(() => {
    const search = document.querySelector('#welcomeGraphSearch');
    const results = document.querySelector('#welcomeGraphResultsPopup');
    const optionList = document.querySelector('#welcomeGraphResults');
    const sectionHeading = document.querySelectorAll('.welcome-graph-category__title')[1];
    const searchRect = search?.getBoundingClientRect();
    const resultsRect = results?.getBoundingClientRect();
    const dockRect = document.querySelector('#workspaceTabsDock')?.getBoundingClientRect();
    const headingRect = sectionHeading?.getBoundingClientRect();
    const overlapLeft = Math.max(resultsRect?.left || 0, headingRect?.left || 0);
    const overlapRight = Math.min(resultsRect?.right || 0, headingRect?.right || 0);
    const overlapTop = Math.max(resultsRect?.top || 0, headingRect?.top || 0);
    const overlapBottom = Math.min(resultsRect?.bottom || 0, headingRect?.bottom || 0);
    const hit = overlapRight > overlapLeft && overlapBottom > overlapTop
      ? document.elementFromPoint((overlapLeft + overlapRight) / 2, (overlapTop + overlapBottom) / 2)
      : null;
    return {
      gap: resultsRect && searchRect ? resultsRect.top - searchRect.bottom : -1,
      menuBottom: resultsRect?.bottom ?? -1,
      dockTop: dockRect?.top ?? window.innerHeight,
      scrollbarButtons: getComputedStyle(optionList, '::-webkit-scrollbar-button').display,
      frameOverflowY: getComputedStyle(results).overflowY,
      listOverflowY: getComputedStyle(optionList).overflowY,
      rightBorderWidth: getComputedStyle(results).borderRightWidth,
      bottomBorderWidth: getComputedStyle(results).borderBottomWidth,
      overlapsNextSection: overlapRight > overlapLeft && overlapBottom > overlapTop,
      menuIsTopmost: !!hit && results.contains(hit)
    };
  });
  expect(pickerGeometry.gap).toBeGreaterThanOrEqual(0);
  expect(pickerGeometry.menuBottom).toBeLessThanOrEqual(pickerGeometry.dockTop - 3);
  expect(pickerGeometry.scrollbarButtons).toBe('none');
  expect(pickerGeometry.frameOverflowY).toBe('hidden');
  expect(pickerGeometry.listOverflowY).toBe('auto');
  expect(pickerGeometry.rightBorderWidth).toBe('1px');
  expect(pickerGeometry.bottomBorderWidth).toBe('1px');
  expect(pickerGeometry.overlapsNextSection).toBe(true);
  expect(pickerGeometry.menuIsTopmost).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('#welcomeViewAllExamples').click();
  const gallery = page.locator('#welcomeExamplesDialog');
  const accessibleGallery = page.getByRole('dialog', { name: 'Explore Graphitix examples' });
  await expect(gallery).toBeVisible();
  await expect(accessibleGallery).toBeVisible();
  await expect(accessibleGallery.locator('#welcomeAllExamplesList .welcome-example-card')).toHaveCount(11);
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

  await expect(page.locator('#welcomeExamplesDialogClose')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(gallery.locator('.welcome-example-card').last()).toBeFocused();
  await expect(page.locator('#welcomeScreen')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(gallery).toBeHidden();
  await expect(page.locator('#welcomeViewAllExamples')).toBeFocused();

  await page.setViewportSize({ width: 640, height: 900 });
  for (const control of await measureCarouselControls()) {
    expect(control.height).toBe(32);
    expect(control.centerOffset).toBeLessThanOrEqual(1);
  }
  await expect(graphActions.first()).toHaveCSS('min-height', '44px');
  expect(await matchedActionHeights()).toEqual([44, 44, 44]);
  const mobileLayout = await page.locator('.welcome-action-grid').evaluate(node => {
    const file = node.querySelector('#welcomeFileDropZone').getBoundingClientRect();
    const graphFinder = node.querySelector('.welcome-graph-finder').getBoundingClientRect();
    const examples = node.querySelector('.welcome-popular').getBoundingClientRect();
    return graphFinder.top > file.bottom && examples.top > graphFinder.bottom;
  });
  expect(mobileLayout).toBe(true);
  await expect(page.locator('#graphSelectionGrid .welcome-graph-category')).toHaveCount(3);
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(mobileOverflow).toBe(false);

  const mobileHeatmapStroke = await measureHeatmapStroke();
  const responsiveSvgScale = mobileHeatmapStroke.svgScale / desktopHeatmapStroke.svgScale;
  expect(mobileHeatmapStroke.displayStrokeWidth / desktopHeatmapStroke.displayStrokeWidth)
    .toBeCloseTo(responsiveSvgScale, 4);

  await page.locator('#welcomeViewAllExamples').click();
  await page.locator('#welcomeAllExamplesList .welcome-example-card[data-graph-type="roc"]').click();
  await page.waitForFunction(() => {
    const session = window.Main?.session;
    const tab = session?.getActiveTab?.();
    return tab?.type === 'roc'
      && !!tab.payload
      && session?.tabHasTableData?.(tab) === true;
  }, null, { timeout: 30_000 });
  await expect(page.locator('#rocPage:not([hidden])')).toHaveCount(1);
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

test('welcome Load example action opens the selected graph example', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' }, {
    first: true,
    loadExample: true
  });

  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId);
    return active?.type === 'hist' && Array.isArray(active?.payload?.data) && active.payload.data.length > 0;
  }, null, { timeout: 30_000 });
  await expect(page.locator('#histPage:not([hidden])')).toHaveCount(1);
});

test('popular SVG previews open the matching editable example', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#welcomeScreen[data-welcome-ready="true"]');

  await page.locator('#welcomePopularExamplesList .welcome-example-card[data-graph-type="heatmap"]').click();
  await page.waitForFunction(() => {
    const session = window.Main?.session;
    const tab = session?.getActiveTab?.();
    return tab?.type === 'heatmap'
      && !!tab.payload
      && session?.tabHasTableData?.(tab) === true;
  }, null, { timeout: 30_000 });

  await expect(page.locator('#heatmapPage:not([hidden])')).toHaveCount(1);
});

test('welcome imports delimited TXT files through the table importer', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await page.locator('#welcomeGraphFileInput').setInputFiles({
    name: 'welcome-data.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Label,Value\nA,1\nB,2\n')
  });
  await confirmDataImportPrompt(page);

  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId);
    return active?.isWelcome === false && active?.type === 'box';
  }, null, { timeout: 30_000 });
  await expect(page.locator('#boxPage:not([hidden])')).toHaveCount(1);
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

  const input = page.locator('#workspaceTabsDock > .workspace-tab__rename');
  await expect(input).toBeVisible();
  const geometry = await tab.evaluate(node => {
    const field = document.querySelector('#workspaceTabsDock > .workspace-tab__rename');
    const tabBox = node.getBoundingClientRect();
    const fieldBox = field.getBoundingClientRect();
    return {
      fieldLeft: fieldBox.left,
      fieldRight: fieldBox.right,
      tabLeft: tabBox.left,
      tabRight: tabBox.right,
      background: getComputedStyle(field).backgroundColor,
      borderRadius: getComputedStyle(node).borderRadius,
      nested: node.contains(field),
      parentId: field.parentElement.id
    };
  });

  expect(geometry.fieldLeft).toBeGreaterThanOrEqual(geometry.tabLeft);
  expect(geometry.fieldRight).toBeLessThanOrEqual(geometry.tabRight);
  expect(geometry.background).toBe('rgba(0, 0, 0, 0)');
  expect(geometry.borderRadius).toBe('0px');
  expect(geometry.nested).toBe(false);
  expect(geometry.parentId).toBe('workspaceTabsDock');
  await expect.poll(() => tabsList.evaluate(node => node.scrollWidth)).toBe(scrollWidthBefore);
});

test('workspace tab rename commits spaces and cancels with Escape', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  const tab = page.locator('#workspaceTabsList .workspace-tab.is-active');
  const renameInput = page.locator('#workspaceTabsDock > .workspace-tab__rename');
  await tab.locator('.workspace-tab__label').dblclick();
  await expect(renameInput).toBeFocused();
  await renameInput.fill('Renamed');
  await renameInput.press('Space');
  await renameInput.type('tab');
  await renameInput.press('Enter');
  await expect(tab.locator('.workspace-tab__label')).toHaveText('Renamed tab');
  await expect(renameInput).toHaveCount(0);

  await tab.locator('.workspace-tab__label').dblclick();
  await expect(renameInput).toBeFocused();
  await renameInput.fill('Temporary title');
  await renameInput.press('Escape');
  await expect(tab.locator('.workspace-tab__label')).toHaveText('Renamed tab');
  await expect(renameInput).toHaveCount(0);
});

test('overflowing workspace tabs use wheel and arrow scrolling without a scrollbar', async ({ page }) => {
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
    const activeLabel = node.querySelector('.workspace-tab.is-active .workspace-tab__label');
    const activeUnderline = activeLabel ? getComputedStyle(activeLabel, '::after') : null;
    return {
      overflows: node.scrollWidth > node.clientWidth,
      dock: node.closest('.workspace-tabs-dock').getBoundingClientRect(),
      tabHeight: tab.getBoundingClientRect().height,
      tabBottom: tab.getBoundingClientRect().bottom,
      labelBottom: label.getBoundingClientRect().bottom,
      closeControls: node.querySelectorAll('.workspace-tab__close').length,
      activeUnderlineHeight: activeUnderline?.height || null,
      activeUnderlineWidth: activeUnderline ? Number.parseFloat(activeUnderline.width) : null,
      activeLabelWidth: activeLabel?.getBoundingClientRect().width || null,
      activeUnderlineBottom: activeUnderline?.bottom || null,
      scrollLeftVisible: !document.getElementById('workspaceTabsScrollLeft').hidden,
      scrollRightVisible: !document.getElementById('workspaceTabsScrollRight').hidden
    };
  });

  expect(scrollbar.overflows).toBe(true);
  expect(scrollbar.dock.height).toBe(33);
  expect(scrollbar.tabHeight).toBeGreaterThanOrEqual(32);
  expect(scrollbar.tabBottom).toBeLessThanOrEqual(scrollbar.dock.bottom);
  expect(scrollbar.labelBottom).toBeLessThanOrEqual(scrollbar.dock.bottom);
  expect(scrollbar.closeControls).toBe(0);
  expect(scrollbar.activeUnderlineHeight).toBe('2px');
  expect(scrollbar.activeUnderlineWidth).toBeLessThanOrEqual(scrollbar.activeLabelWidth + 0.01);
  expect(scrollbar.activeUnderlineBottom).toBe('-4px');
  expect(scrollbar.scrollLeftVisible).toBe(true);
  expect(scrollbar.scrollRightVisible).toBe(true);

  const list = page.locator('#workspaceTabsList');
  const scrollBeforeArrow = await list.evaluate(node => node.scrollLeft);
  await page.locator('#workspaceTabsScrollRight').click();
  await expect.poll(() => list.evaluate(node => node.scrollLeft)).toBeGreaterThan(scrollBeforeArrow);

  const scrollBeforeWheel = await list.evaluate(node => node.scrollLeft);
  await list.evaluate(node => {
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => list.evaluate(node => node.scrollLeft)).toBeLessThan(scrollBeforeWheel);

  const initiallySelectedId = await list.locator('.workspace-tab[aria-selected="true"]').getAttribute('data-tab-id');
  await list.locator('.workspace-tab[aria-selected="true"]').focus();
  const scrollBeforeKey = await list.evaluate(node => node.scrollLeft);
  await page.keyboard.press('End');
  await expect.poll(() => list.evaluate(node => node.scrollLeft)).toBeGreaterThan(scrollBeforeKey);
  const lastTabId = await list.locator('.workspace-tab').last().getAttribute('data-tab-id');
  await expect(list.locator('.workspace-tab:focus')).toHaveAttribute('data-tab-id', lastTabId);
  await expect(list.locator('.workspace-tab[aria-selected="true"]')).toHaveAttribute('data-tab-id', initiallySelectedId);
  await page.keyboard.press('ArrowLeft');
  const keyboardTargetId = await list.locator('.workspace-tab:focus').getAttribute('data-tab-id');
  await page.keyboard.press('Enter');
  await expect(list.locator('.workspace-tab[aria-selected="true"]')).toHaveAttribute('data-tab-id', keyboardTargetId);
  await expect(list.locator('.workspace-tab:focus')).toHaveAttribute('data-tab-id', keyboardTargetId);

  await page.evaluate(() => {
    const { session, tabs } = window.Main;
    session.workspaceState.tabs.splice(1);
    tabs.renderTabs();
  });
  await expect.poll(() => page.locator('#workspaceTabsDock').evaluate(node => node.getBoundingClientRect().height)).toBe(33);
  await expect.poll(() => page.locator('#workspaceTabsList').evaluate(node => {
    const add = document.getElementById('addWorkspaceTab');
    return {
      listRight: Math.round(node.getBoundingClientRect().right),
      addLeft: Math.round(add.getBoundingClientRect().left),
      leftArrowHidden: document.getElementById('workspaceTabsScrollLeft').hidden,
      rightArrowHidden: document.getElementById('workspaceTabsScrollRight').hidden
    };
  })).toEqual({
    listRight: await page.locator('#addWorkspaceTab').evaluate(node => Math.round(node.getBoundingClientRect().left)),
    addLeft: await page.locator('#addWorkspaceTab').evaluate(node => Math.round(node.getBoundingClientRect().left)),
    leftArrowHidden: true,
    rightArrowHidden: true
  });
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

  const waitForSurfaceReady = async reason => {
    const readiness = await page.evaluate(async currentReason => {
      const component = window.Components?.surface;
      const tab = window.Main?.session?.getActiveTab?.();
      if (!component?.awaitReadyForSnapshot || !tab) return { ok: false, reason: 'missing-owner-readiness' };
      return component.awaitReadyForSnapshot({
        tab,
        tabId: tab.id,
        reason: currentReason,
        settleFrames: 2
      });
    }, reason);
    expect(readiness).toMatchObject({ ok: true });
  };
  await waitForSurfaceReady('smoke-surface-legend-before-capture');

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
      return Array.from(clone.querySelectorAll('g,path,polygon,polyline,line,rect,circle,ellipse'))
        .map(node => ({
        tag: node.tagName.toLowerCase(),
        className: node.getAttribute('class') || '',
        attrs: Object.fromEntries(attributeNames
          .filter(name => node.hasAttribute(name))
          .map(name => [name, node.getAttribute(name)]))
        }));
    });
    return {
      layers,
      axisText: Array.from(svg.querySelectorAll('.surface-layer-axes text')).map(label => {
        const style = getComputedStyle(label);
        const rect = label.getBoundingClientRect();
        const transformAngle = String(label.getAttribute('transform') || '').match(/^rotate\(([-+\d.eE]+)/);
        return {
          text: label.textContent,
          axis: label.dataset.axisKey,
          isTick: label.hasAttribute('data-axis-tick-label'),
          hidden: label.getAttribute('display') === 'none' || style.display === 'none',
          fontSize: style.fontSize,
          fill: label.getAttribute('fill'),
          anchor: label.getAttribute('text-anchor'),
          baseline: label.getAttribute('dominant-baseline'),
          angle: transformAngle ? Number(transformAngle[1]) : 0,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        };
      }),
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
  await waitForSurfaceReady('smoke-surface-legend-after-toggle');

  const after = await capturePlotGeometry();
  expect(after.showLegend).toBe(false);
  expect(after.layers).toEqual(before.layers);
  expect(after.axisText.map(({ rect, ...semantics }) => semantics)).toEqual(
    before.axisText.map(({ rect, ...semantics }) => semantics)
  );
  after.axisText.forEach((label, index) => {
    if (label.hidden) return;
    const previous = before.axisText[index].rect;
    expect(Math.abs(label.rect.x - previous.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(label.rect.y - previous.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(label.rect.width - previous.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(label.rect.height - previous.height)).toBeLessThanOrEqual(1);
  });
});
