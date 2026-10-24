const { test, expect } = require('@playwright/test');

test('shared UI tokens preserve their computed interface values', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    getComputedStyle(document.documentElement).getPropertyValue('--ui-content-padding-standard').trim() === '10px 16px'
      && getComputedStyle(document.documentElement).getPropertyValue('--ui-menu-max-height').trim() === '220px'
      && getComputedStyle(document.documentElement).getPropertyValue('--ui-line-height-dense').trim() === '1.3'
  ));
  await page.waitForFunction(() => {
    const theme = document.querySelector('link[rel="stylesheet"][href*="ag-theme-balham.css"]');
    return Boolean(theme?.sheet && theme.sheet.cssRules.length > 0);
  });
  const statsActions = await page.locator('.stats-action-row').evaluateAll(rows => rows.map(row => {
    const style = getComputedStyle(row);
    const status = row.querySelector('[aria-live="polite"]');
    const statusStyle = status ? getComputedStyle(status) : null;
    return {
      buttonId: row.querySelector('button')?.id || '',
      buttonLabel: row.querySelector('button')?.textContent.trim() || '',
      display: style.display,
      gap: style.gap,
      flexWrap: style.flexWrap,
      alignItems: style.alignItems,
      marginTop: style.marginTop,
      statusLive: status?.getAttribute('aria-live') || '',
      statusFlex: statusStyle?.flex || '',
      statusMinWidth: statusStyle?.minWidth || ''
    };
  }));
  expect(statsActions.map(row => row.buttonId).sort()).toEqual([
    'boxComputeStats', 'calcSignificance', 'histComputeStats', 'lineComputeStats',
    'pieComputeStats', 'rocComputeStats', 'scatterComputeStats', 'survivalComputeStats'
  ].sort());
  expect(statsActions.map(row => row.buttonLabel)).toEqual(Array(8).fill('Calculate statistics'));
  const actionPresentation = ({ display, gap, flexWrap, alignItems, marginTop, statusLive, statusFlex, statusMinWidth }) => ({
    display, gap, flexWrap, alignItems, marginTop, statusLive, statusFlex, statusMinWidth
  });
  expect(statsActions.map(actionPresentation)).toEqual(Array(8).fill(actionPresentation(statsActions[0])));
  await expect(page.locator('#pcaPage .stats-action-row, #surfacePage .stats-action-row, #heatmapPage .stats-action-row')).toHaveCount(0);

  const styles = await page.evaluate(async () => {
    const css = await fetch('css/style.css').then(response => response.text());
    const appShell = document.getElementById('appShell');
    const panel = document.createElement('div');
    panel.className = 'stats-table-card';
    const actions = document.createElement('div');
    actions.className = 'stats-table-actions';
    const importMenu = document.createElement('div');
    importMenu.className = 'welcome-import-component-menu';
    const fitPanel = document.createElement('details');
    fitPanel.className = 'fit-specification-foldable';
    const control = document.createElement('button');
    control.className = 'style-sync-select-all';
    const selectHost = document.createElement('div');
    selectHost.className = 'workspace-toolbar__input';
    const select = document.createElement('select');
    selectHost.appendChild(select);
    const toolbarForm = document.createElement('div');
    toolbarForm.className = 'workspace-toolbar__form';
    toolbarForm.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden;width:240px;height:32px';
    const makeColorInputProbe = (hostClass, inputClass = '') => {
      const host = document.createElement('div');
      host.className = hostClass;
      host.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden;display:block;width:240px;height:32px';
      const input = document.createElement('input');
      input.type = 'color';
      input.className = inputClass;
      host.appendChild(input);
      appShell.appendChild(host);
      return { host, input };
    };
    const fontToolbarColorProbe = makeColorInputProbe('font-toolbar-host');
    const fontPanelColorProbe = makeColorInputProbe('font-controls-panel');
    const workspaceToolbarColorInput = document.createElement('input');
    workspaceToolbarColorInput.type = 'color';
    toolbarForm.appendChild(workspaceToolbarColorInput);
    const axisColorProbe = makeColorInputProbe('axis-controls-panel', 'axis-controls-panel__color-input');
    const fontColorProbe = makeColorInputProbe('', 'font-controls-panel__color-input');
    const fontColorFieldProbe = document.createElement('div');
    fontColorFieldProbe.className = 'font-controls-panel__field--color';
    fontColorFieldProbe.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    const fontColorControlProbe = document.createElement('span');
    fontColorControlProbe.className = 'font-controls-panel__color-control';
    const fontOverlayColorInputProbe = document.createElement('input');
    fontOverlayColorInputProbe.type = 'color';
    fontOverlayColorInputProbe.className = 'font-controls-panel__color-input';
    fontColorControlProbe.appendChild(fontOverlayColorInputProbe);
    fontColorFieldProbe.appendChild(fontColorControlProbe);
    appShell.appendChild(fontColorFieldProbe);
    const statsControls = document.createElement('div');
    statsControls.className = 'stats-reporting-controls';
    const compactInferenceControls = document.createElement('div');
    compactInferenceControls.className = 'stats-inference-controls stats-inference-controls--compact';
    const figureControls = document.createElement('div');
    figureControls.className = 'stats-figure-controls';
    const figureOptions = document.createElement('div');
    figureOptions.className = 'stats-figure-controls__options';
    figureControls.appendChild(figureOptions);
    const dataViewHostProbe = document.createElement('div');
    dataViewHostProbe.className = 'data-view-host';
    const welcomeDialogCopy = document.createElement('div');
    welcomeDialogCopy.className = 'welcome-dialog__copy';
    const additionalTransparency = document.createElement('input');
    additionalTransparency.type = 'range';
    additionalTransparency.className = 'additional-line-controls-panel__transparency-input';
    const gridTransparency = document.createElement('input');
    gridTransparency.type = 'range';
    gridTransparency.className = 'grid-controls-panel__transparency-input';
    const advisor = document.createElement('div');
    advisor.className = 'stats-advisor';
    const pcaPage = document.createElement('div');
    pcaPage.id = 'pcaPage';
    const pcaCardClasses = ['scree-card__title', 'variance-card__title', 'variance-card__empty', 'loadings-card__title'];
    const pcaCardContent = pcaCardClasses.map(className => {
      const element = document.createElement('div');
      element.className = className;
      pcaPage.appendChild(element);
      return element;
    });
    const welcomeScreen = document.getElementById('welcomeScreen');
    const examplesDialog = document.getElementById('welcomeExamplesDialog');
    const iconProbeHosts = [];
    const createSvgIconProbe = (root, hostClass, iconClass = '') => {
      const host = document.createElement('button');
      if (hostClass) host.className = hostClass;
      host.style.cssText = 'position:fixed;left:-3000px;top:0;visibility:hidden';
      iconProbeHosts.push(host);
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      if (iconClass) icon.classList.add(iconClass);
      host.appendChild(icon);
      root.appendChild(host);
      return icon;
    };
    const smallIconProbes = [
      createSvgIconProbe(welcomeScreen, 'welcome-carousel__button'),
      createSvgIconProbe(welcomeScreen, 'welcome-import-component-button', 'welcome-import-component-button__chevron'),
      createSvgIconProbe(appShell, 'shared-fill-style-chip')
    ];
    smallIconProbes[2].parentElement.setAttribute('data-size-text', '4.1');
    const standardIconProbes = [
      createSvgIconProbe(appShell, 'font-controls-panel__alignment-button'),
      createSvgIconProbe(appShell, 'workspace-toolbar__overflow-button')
    ];
    const mediumIconProbes = [
      createSvgIconProbe(appShell, 'shared-color-picker__shape-option', 'shared-color-picker__shape-icon')
    ];
    const formatCheckIconProbe = document.createElement('div');
    formatCheckIconProbe.className = 'welcome-import-format-check__icon';
    formatCheckIconProbe.style.cssText = 'position:fixed;left:-3000px;top:0;visibility:hidden';
    iconProbeHosts.push(formatCheckIconProbe);
    welcomeScreen.appendChild(formatCheckIconProbe);
    const largeIconProbes = [
      createSvgIconProbe(welcomeScreen, 'welcome-import-component-icon graph-card__icon', 'welcome-graph-icon')
    ];
    const panelPaddingRoots = [
      { id: 'significanceSection' },
      { className: 'config-panel', childTag: 'fieldset' },
      { id: 'statsPanel', childTag: 'fieldset' },
      { id: 'heatmapPage', childClassName: 'heatmap-lower-panels', childTag: 'fieldset' }
    ];
    const panelPaddingProbes = panelPaddingRoots.map(({ id, className, childClassName, childTag }) => {
      const host = document.createElement('div');
      if (id) host.id = id;
      if (className) host.className = className;
      const parent = childClassName ? document.createElement('div') : host;
      if (childClassName) parent.className = childClassName;
      const element = childTag ? document.createElement(childTag) : host;
      if (childTag) parent.appendChild(element);
      if (parent !== host) host.appendChild(parent);
      document.body.appendChild(host);
      return element;
    });
    const menuTargetHost = document.createElement('div');
    menuTargetHost.className = 'ag-hot-menu';
    menuTargetHost.setAttribute('role', 'menu');
    const menuTarget = document.createElement('button');
    menuTarget.className = 'ag-hot-menu__item';
    menuTargetHost.appendChild(menuTarget);
    const filterTargetHost = document.createElement('div');
    filterTargetHost.className = 'ag-hot-menu ag-hot-filter-menu';
    const filterTarget = document.createElement('select');
    filterTarget.className = 'ag-hot-filter-menu__select';
    const filterCheckTarget = document.createElement('label');
    filterCheckTarget.className = 'ag-hot-filter-menu__check';
    const filterValuesMenu = document.createElement('div');
    filterValuesMenu.className = 'ag-hot-filter-menu__values';
    filterTargetHost.append(filterTarget, filterCheckTarget, filterValuesMenu);
    const fontMenuProbes = ['font-controls-panel__combo-menu', 'font-controls-panel__select-menu'].map(className => {
      const element = document.createElement('div');
      element.className = className;
      return element;
    });
    const transformPanel = document.createElement('div');
    transformPanel.className = 'workspace-toolbar__panel--transform';
    const transformSection = document.createElement('div');
    transformSection.className = 'workspace-toolbar__section';
    transformSection.setAttribute('data-transform-section', '1');
    const transformRow = document.createElement('div');
    transformRow.className = 'workspace-toolbar__transform-row';
    const transformButton = document.createElement('button');
    transformButton.className = 'workspace-toolbar__button';
    transformRow.appendChild(transformButton);
    transformSection.append(transformRow);
    transformPanel.appendChild(transformSection);
    const dataViewTarget = document.createElement('button');
    dataViewTarget.className = 'data-view-tabs__tab';
    const menuItemClasses = [
      'workspace-toolbar__menu-item',
      'font-controls-panel__combo-option',
      'tab-context-menu__item',
      'data-view-tabs__export-item',
      'welcome-picker__option',
      'ag-hot-filter-menu__sort-button'
    ];
    const menuItemProbes = menuItemClasses.map(className => {
      const element = document.createElement('button');
      element.className = className;
      return element;
    });
    const fontSelectOptionProbe = document.createElement('button');
    fontSelectOptionProbe.className = 'font-controls-panel__select-option';
    const paletteOptionHostProbe = document.createElement('div');
    paletteOptionHostProbe.className = 'config-panel';
    const paletteOptionProbe = document.createElement('button');
    paletteOptionProbe.className = 'color-scheme-picker__option';
    paletteOptionHostProbe.appendChild(paletteOptionProbe);
    [menuTargetHost, filterTargetHost, transformPanel, dataViewTarget].forEach(host => {
      host.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
      document.body.appendChild(host);
    });
    paletteOptionHostProbe.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    document.body.appendChild(paletteOptionHostProbe);
    [...menuItemProbes, fontSelectOptionProbe].forEach(element => {
      element.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
      document.body.appendChild(element);
    });
    const targetSizeProbes = [menuTarget, filterTarget, filterCheckTarget, transformRow, transformButton, dataViewTarget];
    const borderProbeDefinitions = [
      { className: 'stats-table-footnotes', edge: 'borderTop' },
      { className: 'workspace-tabs-dock', edge: 'borderRight' },
      { className: 'workspace-tabs-scroll-button--right', edge: 'borderLeft' }
    ];
    const borderProbes = borderProbeDefinitions.map(({ className, edge }) => {
      const element = document.createElement('div');
      element.className = className;
      element.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
      document.body.appendChild(element);
      return { element, edge };
    });
    const gridThemeProbe = document.createElement('div');
    gridThemeProbe.className = 'ag-theme-balham';
    gridThemeProbe.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    const gridCellProbe = document.createElement('div');
    gridCellProbe.className = 'ag-cell';
    const gridCellValueProbe = document.createElement('span');
    gridCellValueProbe.className = 'ag-cell-value';
    const gridCellWrapperProbe = document.createElement('div');
    gridCellWrapperProbe.className = 'ag-cell-wrapper';
    gridCellProbe.append(gridCellValueProbe, gridCellWrapperProbe);
    const gridRowProbe = document.createElement('div');
    gridRowProbe.className = 'ag-row';
    const gridRootProbe = document.createElement('div');
    gridRootProbe.className = 'ag-root';
    const gridBodyViewportProbe = document.createElement('div');
    gridBodyViewportProbe.className = 'ag-body-viewport';
    const gridVerticalScrollProbe = document.createElement('div');
    gridVerticalScrollProbe.className = 'ag-body-vertical-scroll';
    const gridVerticalScrollViewportProbe = document.createElement('div');
    gridVerticalScrollViewportProbe.className = 'ag-body-vertical-scroll-viewport';
    const gridVerticalScrollContainerProbe = document.createElement('div');
    gridVerticalScrollContainerProbe.className = 'ag-body-vertical-scroll-container';
    const gridHorizontalScrollProbe = document.createElement('div');
    gridHorizontalScrollProbe.className = 'ag-body-horizontal-scroll';
    const gridHorizontalScrollViewportProbe = document.createElement('div');
    gridHorizontalScrollViewportProbe.className = 'ag-body-horizontal-scroll-viewport';
    const gridPinnedTopProbe = document.createElement('div');
    gridPinnedTopProbe.className = 'ag-pinned-top';
    const gridFloatingTopProbe = document.createElement('div');
    gridFloatingTopProbe.className = 'ag-floating-top';
    const gridPinnedRowProbe = document.createElement('div');
    gridPinnedRowProbe.className = 'ag-row';
    const gridPinnedCellProbe = document.createElement('div');
    gridPinnedCellProbe.className = 'ag-cell';
    const gridGroupedCellProbe = document.createElement('div');
    gridGroupedCellProbe.className = 'ag-cell box-grouped-header-anchor';
    gridPinnedRowProbe.append(gridPinnedCellProbe, gridGroupedCellProbe);
    gridPinnedTopProbe.appendChild(gridPinnedRowProbe);
    const gridFloatingRowProbe = document.createElement('div');
    gridFloatingRowProbe.className = 'ag-row';
    const gridFloatingCellProbe = document.createElement('div');
    gridFloatingCellProbe.className = 'ag-cell';
    gridFloatingRowProbe.appendChild(gridFloatingCellProbe);
    gridFloatingTopProbe.appendChild(gridFloatingRowProbe);
    const gridPinnedTopViewportProbe = document.createElement('div');
    gridPinnedTopViewportProbe.className = 'ag-pinned-top-viewport';
    const gridFloatingTopViewportProbe = document.createElement('div');
    gridFloatingTopViewportProbe.className = 'ag-floating-top-viewport';
    const gridPinnedLeftHeaderProbe = document.createElement('div');
    gridPinnedLeftHeaderProbe.className = 'ag-pinned-left-header';
    const gridPinnedLeftHeaderCellProbe = document.createElement('div');
    gridPinnedLeftHeaderCellProbe.className = 'ag-header-cell';
    gridPinnedLeftHeaderProbe.appendChild(gridPinnedLeftHeaderCellProbe);
    const gridPinnedLeftHeaderViewportProbe = document.createElement('div');
    gridPinnedLeftHeaderViewportProbe.className = 'ag-pinned-left-header-viewport';
    const gridPinnedLeftHeaderViewportCellProbe = document.createElement('div');
    gridPinnedLeftHeaderViewportCellProbe.className = 'ag-header-cell';
    gridPinnedLeftHeaderViewportProbe.appendChild(gridPinnedLeftHeaderViewportCellProbe);
    const gridPinnedLeftColsProbe = document.createElement('div');
    gridPinnedLeftColsProbe.className = 'ag-pinned-left-cols-container';
    const gridPinnedLeftCellProbe = document.createElement('div');
    gridPinnedLeftCellProbe.className = 'ag-cell';
    gridPinnedLeftColsProbe.appendChild(gridPinnedLeftCellProbe);
    const gridPinnedLeftFloatingTopProbe = document.createElement('div');
    gridPinnedLeftFloatingTopProbe.className = 'ag-pinned-left-floating-top';
    const gridPinnedLeftFloatingRowProbe = document.createElement('div');
    gridPinnedLeftFloatingRowProbe.className = 'ag-row';
    const gridPinnedLeftFloatingCellProbe = document.createElement('div');
    gridPinnedLeftFloatingCellProbe.className = 'ag-cell';
    gridPinnedLeftFloatingRowProbe.appendChild(gridPinnedLeftFloatingCellProbe);
    gridPinnedLeftFloatingTopProbe.appendChild(gridPinnedLeftFloatingRowProbe);
    const gridPinnedRightFloatingTopProbe = document.createElement('div');
    gridPinnedRightFloatingTopProbe.className = 'ag-pinned-right-floating-top';
    const gridPinnedRightFloatingRowProbe = document.createElement('div');
    gridPinnedRightFloatingRowProbe.className = 'ag-row';
    const gridPinnedRightFloatingCellProbe = document.createElement('div');
    gridPinnedRightFloatingCellProbe.className = 'ag-cell';
    gridPinnedRightFloatingRowProbe.appendChild(gridPinnedRightFloatingCellProbe);
    gridPinnedRightFloatingTopProbe.appendChild(gridPinnedRightFloatingRowProbe);
    const gridHorizontalLeftSpacerProbe = document.createElement('div');
    gridHorizontalLeftSpacerProbe.className = 'ag-horizontal-left-spacer';
    const gridHeaderProbe = document.createElement('div');
    gridHeaderProbe.className = 'ag-header';
    const gridHeaderViewportProbe = document.createElement('div');
    gridHeaderViewportProbe.className = 'ag-header-viewport';
    const gridHeaderContainerProbe = document.createElement('div');
    gridHeaderContainerProbe.className = 'ag-header-container';
    const gridHeaderRowProbe = document.createElement('div');
    gridHeaderRowProbe.className = 'ag-header-row';
    const gridHeaderCellProbe = document.createElement('div');
    gridHeaderCellProbe.className = 'ag-header-cell hot-selected-column-header';
    gridHeaderRowProbe.appendChild(gridHeaderCellProbe);
    gridHeaderContainerProbe.appendChild(gridHeaderRowProbe);
    gridHeaderViewportProbe.appendChild(gridHeaderContainerProbe);
    gridHeaderProbe.appendChild(gridHeaderViewportProbe);
    gridThemeProbe.appendChild(gridCellProbe);
    gridThemeProbe.appendChild(gridRowProbe);
    gridThemeProbe.appendChild(gridRootProbe);
    gridThemeProbe.appendChild(gridBodyViewportProbe);
    gridThemeProbe.append(
      gridVerticalScrollProbe,
      gridVerticalScrollViewportProbe,
      gridVerticalScrollContainerProbe,
      gridHorizontalScrollProbe,
      gridHorizontalScrollViewportProbe,
      gridPinnedTopProbe,
      gridFloatingTopProbe,
      gridPinnedTopViewportProbe,
      gridFloatingTopViewportProbe,
      gridPinnedLeftHeaderProbe,
      gridPinnedLeftHeaderViewportProbe,
      gridPinnedLeftColsProbe,
      gridPinnedLeftFloatingTopProbe,
      gridPinnedRightFloatingTopProbe,
      gridHorizontalLeftSpacerProbe
    );
    gridThemeProbe.appendChild(gridHeaderProbe);
    appShell.appendChild(gridThemeProbe);
    const gridFontReference = document.createElement('div');
    gridFontReference.style.fontFamily = 'var(--ui-font-family)';
    appShell.appendChild(gridFontReference);
    const gridInkReference = document.createElement('div');
    gridInkReference.style.color = 'var(--gt-ink)';
    appShell.appendChild(gridInkReference);
    const activeStateProbeDefinitions = [
      { name: 'stats-tab', className: 'stats-summary-tabs__tab stats-summary-tabs__tab--active', activeChrome: true },
      { name: 'filter-sort', className: 'ag-hot-filter-menu__sort-button is-active', activeChrome: true },
      { name: 'selected-transform', className: 'workspace-toolbar__button', attributes: { 'data-transform-option': 'cpm', 'data-transform-selected': '1' }, transformSection: true, activeChrome: true },
      { name: 'font-toggle', className: 'font-controls-panel__toggle--active', fontControl: true },
      { name: 'font-alignment', className: 'font-controls-panel__alignment-button', attributes: { 'aria-pressed': 'true' }, fontControl: true },
      { name: 'formula-option', className: 'hot-formula-fn-item is-active', selectionOnly: true },
      { name: 'import-option', className: 'welcome-import-component-option is-selected', selectionOnly: true, welcomeHost: true }
    ];
    const activeStateProbes = activeStateProbeDefinitions.map(({ name, className, attributes = {}, fontControl = false, transformSection = false, activeChrome = false, selectionOnly = false, welcomeHost = false }) => {
      const element = document.createElement('button');
      element.className = className;
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
      let host = welcomeHost ? welcomeScreen : appShell;
      if (transformSection) {
        host = document.createElement('div');
        host.className = 'workspace-toolbar__section';
        host.setAttribute('data-transform-section', '1');
        host.appendChild(element);
        appShell.appendChild(host);
      } else {
        host.appendChild(element);
      }
      return { name, element, fontControl, activeChrome, selectionOnly, host: transformSection ? host : element };
    });
    const activeStateReference = document.createElement('div');
    activeStateReference.style.cssText = 'border-color:var(--gt-border-strong);background-color:var(--ui-surface-selected);color:var(--gt-accent)';
    appShell.appendChild(activeStateReference);
    const zoomFieldHost = document.createElement('div');
    zoomFieldHost.className = 'svgbox';
    const zoomField = document.createElement('input');
    zoomField.type = 'number';
    zoomField.className = 'resizer-zoom-value resizer-zoom-input';
    zoomFieldHost.appendChild(zoomField);
    document.body.appendChild(zoomFieldHost);
    const fontWeightProbes = [
      { className: 'workspace-toolbar__label', host: appShell },
      { className: 'workspace-tab', host: appShell },
      { className: 'welcome-panel__title', host: welcomeScreen },
      { className: 'workspace-toolbar__document-title', host: appShell }
    ].map(({ className, host }) => {
      const element = document.createElement('div');
      element.className = className;
      host.appendChild(element);
      return element;
    });
    const workspaceToolbar = document.createElement('div');
    workspaceToolbar.className = 'workspace-toolbar';
    const workspaceJobActivity = document.createElement('div');
    workspaceJobActivity.className = 'workspace-job-activity';
    const workspaceAutosave = document.createElement('div');
    workspaceAutosave.className = 'workspace-toolbar__autosave';
    const toolbarContent = document.createElement('div');
    toolbarContent.className = 'workspace-toolbar__content';
    const toolbarSection = document.createElement('div');
    toolbarSection.className = 'workspace-toolbar__section';
    const toolbarTab = document.createElement('button');
    toolbarTab.className = 'workspace-toolbar__tab';
    workspaceToolbar.append(toolbarContent, toolbarSection, toolbarTab, workspaceJobActivity, workspaceAutosave);
    const axisChip = document.createElement('button');
    axisChip.className = 'axis-controls-panel__checkbox-chip';
    const significanceChip = document.createElement('button');
    significanceChip.className = 'significance-controls-panel__checkbox-chip';
    const axisLengthField = document.createElement('div');
    axisLengthField.className = 'axis-controls-panel__field--length';
    const lengthPreserve = document.createElement('label');
    lengthPreserve.className = 'axis-controls-panel__checkbox-label axis-controls-panel__length-preserve';
    lengthPreserve.textContent = 'Preserve ratio';
    axisLengthField.appendChild(lengthPreserve);
    const brokenAxisField = document.createElement('div');
    brokenAxisField.className = 'axis-controls-panel__field--broken-axis';
    brokenAxisField.style.width = '320px';
    const brokenAxisLabel = document.createElement('label');
    brokenAxisLabel.className = 'axis-controls-panel__checkbox-label';
    brokenAxisLabel.textContent = 'Enable broken axis';
    brokenAxisField.appendChild(brokenAxisLabel);
    const dataViewTab = document.createElement('button');
    dataViewTab.className = 'data-view-tabs__tab';
    const dataViewClose = document.createElement('button');
    dataViewClose.className = 'data-view-tabs__close';
    const dataViewSave = document.createElement('button');
    dataViewSave.className = 'data-view-tabs__save';
    const resizeControlsProbe = document.createElement('div');
    resizeControlsProbe.className = 'svgbox';
    const resizerCornerProbe = document.createElement('div');
    resizerCornerProbe.className = 'resizer-corner';
    resizeControlsProbe.appendChild(resizerCornerProbe);
    const graphOptionsSummary = document.createElement('button');
    graphOptionsSummary.className = 'resizer-options-summary';
    resizeControlsProbe.appendChild(graphOptionsSummary);
    const formulaTooltip = document.createElement('div');
    formulaTooltip.className = 'hot-formula-fn-tooltip';
    const welcomeHeroLede = document.createElement('p');
    welcomeHeroLede.className = 'welcome-hero__lede';
    const styleSyncOptions = document.createElement('div');
    styleSyncOptions.className = 'style-sync-options';
    const styleSyncLabel = document.createElement('label');
    styleSyncOptions.appendChild(styleSyncLabel);
    const toolbarHint = document.createElement('div');
    toolbarHint.className = 'workspace-toolbar__hint';
    const statsCopyButton = document.createElement('button');
    statsCopyButton.className = 'stats-report-panel__copy-btn';
    const significanceBadge = document.createElement('span');
    significanceBadge.className = 'stats-significance-badge';
    const lineHeightTightVennTab = document.createElement('button');
    lineHeightTightVennTab.className = 'analysis-results-tab';
    const upsetToggleRow = document.createElement('div');
    upsetToggleRow.className = 'upset-controls-row--toggles';
    const upsetToggle = document.createElement('button');
    upsetToggle.className = 'upset-toggle';
    upsetToggleRow.appendChild(upsetToggle);
    const addExtraAxisButton = document.createElement('button');
    addExtraAxisButton.className = 'axis-controls-panel__button--add-extra';
    const addSegmentAxisButton = document.createElement('button');
    addSegmentAxisButton.className = 'axis-controls-panel__button--add-segment';
    const removeExtraAxisButton = document.createElement('button');
    removeExtraAxisButton.className = 'axis-controls-panel__button--remove-extra';
    const removeSegmentAxisButton = document.createElement('button');
    removeSegmentAxisButton.className = 'axis-controls-panel__button--remove-segment';
    const axisActionHost = document.createElement('div');
    axisActionHost.className = 'axis-controls-panel';
    axisActionHost.append(addExtraAxisButton, addSegmentAxisButton, removeExtraAxisButton, removeSegmentAxisButton);
    const welcomeMeasurementClasses = [
      'welcome-drop-zone__copy',
      'welcome-example-card__body',
      'graph-card__content'
    ];
    const welcomeMeasurementProbes = welcomeMeasurementClasses.map(className => {
      const element = document.createElement('div');
      element.className = className;
      return element;
    });
    const colorSwatchesProbe = document.createElement('div');
    colorSwatchesProbe.className = 'color-scheme-picker__swatches';
    const heatmapLowerPanels = document.createElement('div');
    heatmapLowerPanels.className = 'heatmap-lower-panels';
    const heatmapLowerInlineGroup = document.createElement('div');
    heatmapLowerInlineGroup.className = 'heatmap-inline-group';
    heatmapLowerPanels.appendChild(heatmapLowerInlineGroup);
    appShell.append(workspaceToolbar, toolbarForm, axisChip, significanceChip, dataViewTab, dataViewClose, dataViewSave, resizeControlsProbe, axisLengthField, brokenAxisField);
    appShell.append(toolbarHint, statsCopyButton, significanceBadge, axisActionHost);
    welcomeScreen.append(welcomeHeroLede, ...welcomeMeasurementProbes);
    const vennPage = document.getElementById('vennPage');
    vennPage.append(lineHeightTightVennTab, upsetToggleRow);
    const search = document.createElement('input');
    search.className = 'welcome-hero__search-input';
    const graphAction = document.createElement('button');
    graphAction.className = 'graph-card__action';
    welcomeScreen.append(search, graphAction);
    const dialogClose = document.createElement('button');
    dialogClose.className = 'welcome-dialog__close';
    examplesDialog.appendChild(dialogClose);
    const appGraphCard = document.createElement('div');
    appGraphCard.className = 'graph-card';
    appShell.appendChild(appGraphCard);
    const welcomeSurfaceClasses = ['graph-card', 'welcome-drop-zone', 'welcome-picker__popup', 'graph-card__icon', 'welcome-example-card'];
    const welcomeSurfaces = welcomeSurfaceClasses.map(className => {
      const element = document.createElement(className.includes('results') ? 'ul' : 'div');
      element.className = className;
      welcomeScreen.appendChild(element);
      return element;
    });
    const popular = document.createElement('div');
    popular.className = 'welcome-popular';
    const compactCard = document.createElement('div');
    compactCard.className = 'welcome-example-card welcome-example-card--compact';
    popular.appendChild(compactCard);
    welcomeScreen.appendChild(popular);
    const dialogCard = document.createElement('div');
    dialogCard.className = 'welcome-example-card';
    examplesDialog.appendChild(dialogCard);
    const heatmapPage = panelPaddingProbes.find(element => element.closest('#heatmapPage')).closest('#heatmapPage');
    const heatmapFilterList = document.createElement('div');
    heatmapFilterList.className = 'heatmap-filter-list';
    const heatmapFilterRow = document.createElement('div');
    heatmapFilterRow.className = 'heatmap-filter-row';
    heatmapPage.querySelector('.heatmap-lower-panels').append(heatmapFilterList, heatmapFilterRow, heatmapLowerPanels);
    formulaTooltip.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    styleSyncOptions.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    colorSwatchesProbe.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    axisActionHost.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    [toolbarHint, statsCopyButton, significanceBadge, addExtraAxisButton, addSegmentAxisButton, removeExtraAxisButton, removeSegmentAxisButton, ...welcomeMeasurementProbes, heatmapLowerInlineGroup, lineHeightTightVennTab, upsetToggle].forEach(element => {
      element.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    });
    document.body.append(formulaTooltip, styleSyncOptions, colorSwatchesProbe);
    panelPaddingProbes.find(element => element.closest('.config-panel')).closest('.config-panel').appendChild(colorSwatchesProbe);
    document.body.append(panel, actions, importMenu, fitPanel, control, selectHost, statsControls, compactInferenceControls, figureControls, dataViewHostProbe, advisor, pcaPage, additionalTransparency, gridTransparency);
    document.body.append(welcomeDialogCopy, ...fontMenuProbes);

    const panelStyle = getComputedStyle(panel);
    const actionsStyle = getComputedStyle(actions);
    const rootStyle = getComputedStyle(document.documentElement);
    // Theme shades are adjustable. Check that consumers follow the semantic
    // border tokens instead of freezing a previous palette's RGB values.
    const resolveBorderColor = token => {
      const probe = document.createElement('span');
      probe.style.border = `var(${token})`;
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).borderTopColor;
      probe.remove();
      return color;
    };
    const result = {
      themeBorderColors: {
        default: resolveBorderColor('--ui-border-default'),
        control: resolveBorderColor('--ui-control-border')
      },
      borderWidth: panelStyle.borderTopWidth,
      borderStyle: panelStyle.borderTopStyle,
      borderColor: panelStyle.borderTopColor,
      importMenuBorderColor: getComputedStyle(importMenu).borderTopColor,
      fitPanelBorderColor: getComputedStyle(fitPanel).borderTopColor,
      controlBorderColor: getComputedStyle(control).borderTopColor,
      contentPadding: actionsStyle.padding,
      centeredColorInputs: [
        fontToolbarColorProbe.input,
        fontPanelColorProbe.input,
        workspaceToolbarColorInput,
        axisColorProbe.input,
        fontColorProbe.input
      ].map(element => {
        const style = getComputedStyle(element);
        return {
          display: style.display,
          marginLeft: style.marginLeft,
          marginRight: style.marginRight,
          boxSizing: style.boxSizing
        };
      }),
      colorInputOverlayPosition: getComputedStyle(fontOverlayColorInputProbe).position,
      denseLineHeightToken: rootStyle.getPropertyValue('--ui-line-height-dense').trim(),
      denseLineHeights: [formulaTooltip, welcomeHeroLede, styleSyncLabel, toolbarHint, heatmapLowerInlineGroup].map(element => {
        const style = getComputedStyle(element);
        return { lineHeight: parseFloat(style.lineHeight), fontSize: parseFloat(style.fontSize) };
      }),
      tightLineHeightToken: rootStyle.getPropertyValue('--ui-line-height-tight').trim(),
      tightLineHeights: [dataViewTab, statsCopyButton, significanceBadge, lineHeightTightVennTab, upsetToggle].map(element => {
        const style = getComputedStyle(element);
        return { lineHeight: parseFloat(style.lineHeight), fontSize: parseFloat(style.fontSize) };
      }),
      tinyGapToken: rootStyle.getPropertyValue('--ui-gap-tiny').trim(),
      tinyGaps: [...welcomeMeasurementProbes, colorSwatchesProbe].map(element => getComputedStyle(element).gap),
      controlPaddingRoomyToken: rootStyle.getPropertyValue('--ui-control-padding-roomy').trim(),
      menuItemPaddingToken: rootStyle.getPropertyValue('--ui-menu-item-padding').trim(),
      menuItemPaddings: [...menuItemProbes, fontSelectOptionProbe, paletteOptionProbe].map(element => getComputedStyle(element).padding),
      axisActionPaddings: [addExtraAxisButton, addSegmentAxisButton].map(element => getComputedStyle(element).padding),
      iconSizeToken: rootStyle.getPropertyValue('--ui-icon-size-small').trim(),
      iconSizes: [removeExtraAxisButton, removeSegmentAxisButton].map(element => getComputedStyle(element).fontSize),
      smallIconSizeToken: rootStyle.getPropertyValue('--ui-icon-size-xsmall').trim(),
      smallIconDimensions: smallIconProbes.map(element => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height })),
      standardIconDimensions: standardIconProbes.map(element => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height })),
      mediumIconSizeToken: rootStyle.getPropertyValue('--ui-icon-size-medium').trim(),
      mediumIconDimensions: [...mediumIconProbes, formatCheckIconProbe].map(element => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height })),
      largeIconSizeToken: rootStyle.getPropertyValue('--ui-icon-size-large').trim(),
      largeIconHostDimensions: largeIconProbes.map(element => {
        const style = getComputedStyle(element.parentElement);
        return { width: style.width, height: style.height, minWidth: style.minWidth, flexBasis: style.flexBasis };
      }),
      largeIconDimensions: largeIconProbes.map(element => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height })),
      iconSizeTokenSources: [
        ['.welcome-carousel__button svg', '--ui-icon-size-xsmall'],
        ['.welcome-import-component-button__chevron', '--ui-icon-size-xsmall'],
        ['.shared-fill-style-chip svg', '--ui-icon-size-xsmall'],
        ['.font-controls-panel__alignment-button svg', '--ui-icon-size-small'],
        ['.workspace-toolbar__overflow-button svg', '--ui-icon-size-small'],
        ['.shared-color-picker__shape-icon', '--ui-icon-size-medium'],
        ['.welcome-import-format-check__icon', '--ui-icon-size-medium'],
        ['.welcome-import-component-icon.graph-card__icon', '--ui-icon-size-large'],
        ['.welcome-import-component-icon.graph-card__icon .welcome-graph-icon', '--ui-icon-size-large']
      ].map(([selector, token]) => {
        const escaped = selector.replace(/\./g, '\\.');
        const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
        return Boolean(rule && ['width', 'height'].every(property => (
          new RegExp(`${property}\\s*:\\s*var\\(${token}\\)`).test(rule[1])
        )));
      }),
      largeIconLayoutSource: (() => {
        const selector = '.welcome-import-component-icon.graph-card__icon';
        const escaped = selector.replace(/\./g, '\\.');
        const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
        return Boolean(rule
          && ['width', 'height', 'min-width'].every(property => (
            new RegExp(`${property}\\s*:\\s*var\\(--ui-icon-size-large\\)`).test(rule[1])
          ))
          && /flex\s*:\s*0\s+0\s+var\(--ui-icon-size-large\)/.test(rule[1]));
      })(),
      selectPadding: getComputedStyle(select).padding,
      selectPaddingToken: rootStyle.getPropertyValue('--ui-select-padding').trim(),
      toolbarFormGap: getComputedStyle(toolbarForm).gap,
      statsControlsGap: getComputedStyle(statsControls).gap,
      formRowGapToken: rootStyle.getPropertyValue('--ui-gap-form-row').trim(),
      formRowGaps: [compactInferenceControls, figureControls, figureOptions].map(element => getComputedStyle(element).gap),
      dataViewHostOverflow: getComputedStyle(dataViewHostProbe).overflow,
      contentPaddingRoomyToken: rootStyle.getPropertyValue('--ui-content-padding-roomy').trim(),
      roomyContentPadding: [advisor, ...pcaCardContent].map(element => getComputedStyle(element).padding),
      panelContentPaddingToken: rootStyle.getPropertyValue('--ui-content-padding-panel').trim(),
      panelContentPaddings: panelPaddingProbes.map(element => getComputedStyle(element).padding),
      targetSizeMinimumToken: rootStyle.getPropertyValue('--ui-target-size-minimum').trim(),
      minimumTargetHeights: targetSizeProbes.map(element => getComputedStyle(element).minHeight),
      targetSizeActionDimensions: [dataViewClose, dataViewSave, graphOptionsSummary].map(element => {
        const style = getComputedStyle(element);
        return { width: style.width, height: style.height };
      }),
      targetSizeActionSources: [
        '.data-view-tabs__close',
        '.data-view-tabs__save',
        '.graph-controls-header .resizer-options-summary',
        '.svgbox .resizer-corner'
      ].map(selector => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
        return Boolean(rule && ['width', 'height'].every(property => (
          new RegExp(`${property}\\s*:\\s*var\\(--ui-target-size-minimum\\)`).test(rule[1])
        )));
      }),
      coarseCheckboxTargetSource: (() => {
        const rule = css.match(/@media\s*\(any-pointer:\s*coarse\)[\s\S]*?\.ag-theme-balham \.ag-checkbox-input-wrapper\s*\{([^}]*)\}/);
        return Boolean(rule && ['width', 'height', 'font-size', 'line-height'].every(property => (
          new RegExp(`${property}\\s*:\\s*var\\(--ui-target-size-minimum\\)`).test(rule[1])
        )));
      })(),
      coarseGridRowHeightSource: (() => {
        const rule = css.match(/@media\s*\(any-pointer:\s*coarse\)[\s\S]*?\.ag-theme-balham\s*\{([^}]*)\}/);
        return Boolean(rule && /--graphitix-ag-row-height\s*:\s*var\(--ui-target-size-minimum\)/.test(rule[1]));
      })(),
      resizerCornerDimensions: {
        width: getComputedStyle(resizerCornerProbe).width,
        height: getComputedStyle(resizerCornerProbe).height
      },
      menuItemMinimumToken: rootStyle.getPropertyValue('--ui-menu-item-min-height').trim(),
      menuItemMinimumHeights: [...menuItemProbes, paletteOptionProbe].map(element => getComputedStyle(element).minHeight),
      menuMaxHeightToken: rootStyle.getPropertyValue('--ui-menu-max-height').trim(),
      menuMaxHeights: [filterValuesMenu, ...fontMenuProbes].map(element => getComputedStyle(element).maxHeight),
      smallGapToken: rootStyle.getPropertyValue('--ui-gap-small').trim(),
      smallGaps: [
        filterCheckTarget,
        welcomeDialogCopy,
        workspaceJobActivity,
        workspaceAutosave,
        heatmapFilterList,
        heatmapFilterRow
      ].map(element => getComputedStyle(element).gap),
      compactCardSpacing: {
        padding: getComputedStyle(compactCard).padding,
        gap: getComputedStyle(compactCard).gap
      },
      fontSelectOptionMinimumHeight: getComputedStyle(fontSelectOptionProbe).minHeight,
      fontWeightTokens: [
        '--ui-font-weight-regular',
        '--ui-font-weight-medium',
        '--ui-font-weight-semibold',
        '--ui-font-weight-bold'
      ].map(token => rootStyle.getPropertyValue(token).trim()),
      fontWeightConsumers: fontWeightProbes.map(element => getComputedStyle(element).fontWeight),
      transparencyWidthToken: rootStyle.getPropertyValue('--ui-control-width-transparency').trim(),
      transparencyWidths: [additionalTransparency, gridTransparency].map(element => {
        const style = getComputedStyle(element);
        return { width: style.width, minWidth: style.minWidth, maxWidth: style.maxWidth, flexBasis: style.flexBasis };
      }),
      controlRadiusToken: rootStyle.getPropertyValue('--ui-control-radius').trim(),
      buttonRadiusToken: rootStyle.getPropertyValue('--ui-btn-radius').trim(),
      controlRadii: [axisChip, significanceChip, search].map(element => getComputedStyle(element).borderRadius),
      axisDisclosureLabels: [lengthPreserve, brokenAxisLabel].map(element => {
        const style = getComputedStyle(element);
        return {
          padding: style.padding,
          borderStyle: style.borderTopStyle,
          borderWidth: style.borderTopWidth,
          background: style.backgroundColor,
          radius: style.borderRadius,
          boxShadow: style.boxShadow
        };
      }),
      buttonRadii: [graphAction, dialogClose].map(element => getComputedStyle(element).borderRadius),
      dataViewTabTopRadii: [getComputedStyle(dataViewTab).borderTopLeftRadius, getComputedStyle(dataViewTab).borderTopRightRadius],
      surfaceRadiusToken: rootStyle.getPropertyValue('--ui-rounded-radius').trim(),
      sharedSurfaceRadii: [appGraphCard, ...welcomeSurfaces, compactCard, dialogCard].map(element => getComputedStyle(element).borderRadius),
      defaultBorderToken: rootStyle.getPropertyValue('--ui-border-default').trim(),
      menuBorderToken: rootStyle.getPropertyValue('--ui-menu-border').trim(),
      defaultBorderEdges: borderProbes.map(({ element, edge }) => {
        const style = getComputedStyle(element);
        return {
          width: style[`${edge}Width`],
          style: style[`${edge}Style`],
          color: style[`${edge}Color`]
        };
      }),
      gridCellBottomBorder: {
        width: getComputedStyle(gridCellProbe).borderBottomWidth,
        style: getComputedStyle(gridCellProbe).borderBottomStyle,
        color: getComputedStyle(gridCellProbe).borderBottomColor
      },
      gridCellBaseStyle: {
        padding: getComputedStyle(gridCellProbe).padding,
        lineHeight: getComputedStyle(gridCellProbe).lineHeight,
        childLineHeights: [gridCellValueProbe, gridCellWrapperProbe].map(element => getComputedStyle(element).lineHeight),
        rightBorder: [getComputedStyle(gridCellProbe).borderRightWidth, getComputedStyle(gridCellProbe).borderRightStyle],
        leftBorderWidth: getComputedStyle(gridCellProbe).borderLeftWidth
      },
      gridHeaderSizing: {
        rowHeight: getComputedStyle(gridHeaderRowProbe).height,
        hostBounds: [gridHeaderProbe, gridHeaderViewportProbe, gridHeaderContainerProbe].map(element => {
          const style = getComputedStyle(element);
          return [style.height, style.minHeight, style.maxHeight];
        }),
        cellHeight: getComputedStyle(gridHeaderCellProbe).height,
        cellLineHeight: getComputedStyle(gridHeaderCellProbe).lineHeight,
        cellPadding: getComputedStyle(gridHeaderCellProbe).padding
      },
      gridHeaderSeam: {
        width: getComputedStyle(gridHeaderProbe).borderBottomWidth,
        style: getComputedStyle(gridHeaderProbe).borderBottomStyle,
        color: getComputedStyle(gridHeaderProbe).borderBottomColor,
        boxShadow: getComputedStyle(gridHeaderProbe).boxShadow
      },
      gridScrollBehavior: getComputedStyle(gridBodyViewportProbe).scrollBehavior,
      gridPinnedRowChrome: {
        rowOverflowY: [gridPinnedTopProbe, gridFloatingTopProbe].map(element => getComputedStyle(element).overflowY),
        viewportEdges: [gridPinnedTopViewportProbe, gridFloatingTopViewportProbe].map(element => {
          const style = getComputedStyle(element);
          return [style.borderTopWidth, style.borderTopStyle, style.boxShadow];
        }),
        sectionTopBorders: [gridPinnedTopProbe, gridFloatingTopProbe].map(element => {
          const style = getComputedStyle(element);
          return [style.borderTopWidth, style.borderTopStyle];
        }),
        cellBottomBorders: [gridPinnedCellProbe, gridFloatingCellProbe].map(element => {
          const style = getComputedStyle(element);
          return [style.borderBottomWidth, style.borderBottomStyle];
        }),
        groupedCellBottomBorder: (() => {
          const style = getComputedStyle(gridGroupedCellProbe);
          return [style.borderBottomWidth, style.borderBottomStyle, style.borderBottomColor];
        })(),
        sectionBottomShadows: [gridPinnedTopProbe, gridFloatingTopProbe, gridPinnedLeftHeaderProbe, gridPinnedLeftFloatingTopProbe, gridPinnedRightFloatingTopProbe]
          .map(element => getComputedStyle(element).boxShadow),
        expectedBottomShadow: (() => {
          const reference = document.createElement('div');
          reference.style.boxShadow = 'inset 0 -1px 0 var(--gt-border)';
          gridThemeProbe.appendChild(reference);
          const shadow = getComputedStyle(reference).boxShadow;
          reference.remove();
          return shadow;
        })(),
        leftSectionCellBorderColors: [gridPinnedLeftHeaderCellProbe, gridPinnedLeftHeaderViewportCellProbe, gridPinnedLeftCellProbe, gridPinnedLeftFloatingCellProbe, gridPinnedRightFloatingCellProbe]
          .map(element => getComputedStyle(element).borderBottomColor),
        leftSectionLastRowBorders: [gridPinnedLeftFloatingCellProbe, gridPinnedRightFloatingCellProbe].map(element => {
          const style = getComputedStyle(element);
          return [style.borderBottomWidth, style.borderBottomStyle];
        })
      },
      gridHiddenScrollbar: (() => {
        const style = getComputedStyle(gridHorizontalLeftSpacerProbe, '::-webkit-scrollbar');
        return [style.width, style.height, style.display];
      })(),
      gridScrollbarChrome: {
        trackColors: [gridVerticalScrollProbe, gridVerticalScrollViewportProbe, gridHorizontalScrollProbe, gridHorizontalScrollViewportProbe]
          .map(element => getComputedStyle(element).backgroundColor),
        expectedTrackColor: (() => {
          const reference = document.createElement('div');
          reference.style.backgroundColor = 'var(--graphitix-ag-scrollbar-track)';
          gridThemeProbe.appendChild(reference);
          const color = getComputedStyle(reference).backgroundColor;
          reference.remove();
          return color;
        })(),
        gutters: [gridVerticalScrollProbe, gridVerticalScrollViewportProbe, gridVerticalScrollContainerProbe].map(element => {
          const style = getComputedStyle(element);
          return [style.margin, style.padding, style.borderWidth];
        })
      },
      gridHeaderCellBorderBottom: {
        width: getComputedStyle(gridHeaderCellProbe).borderBottomWidth,
        style: getComputedStyle(gridHeaderCellProbe).borderBottomStyle
      },
      gridHeaderSelection: {
        backgroundColor: getComputedStyle(gridHeaderCellProbe).backgroundColor,
        boxShadow: getComputedStyle(gridHeaderCellProbe).boxShadow
      },
      gridRowBottomBorder: {
        width: getComputedStyle(gridRowProbe).borderBottomWidth,
        style: getComputedStyle(gridRowProbe).borderBottomStyle
      },
      gridThemeRadii: [gridThemeProbe, gridRootProbe].map(element => getComputedStyle(element).borderRadius),
      gridThemeTypography: {
        fontToken: getComputedStyle(gridThemeProbe).getPropertyValue('--ag-font-family').trim(),
        foregroundToken: getComputedStyle(gridThemeProbe).getPropertyValue('--ag-foreground-color').trim(),
        rootFont: getComputedStyle(gridThemeProbe).fontFamily,
        cellFont: getComputedStyle(gridCellProbe).fontFamily,
        cellColor: getComputedStyle(gridCellProbe).color,
        expectedFont: getComputedStyle(gridFontReference).fontFamily,
        expectedColor: getComputedStyle(gridInkReference).color,
        rowHeight: getComputedStyle(gridThemeProbe).getPropertyValue('--ag-row-height').trim()
      },
      activeStateStyles: activeStateProbes.map(({ name, element, fontControl, activeChrome, selectionOnly }) => {
        const style = getComputedStyle(element);
        return {
          name,
          fontControl,
          activeChrome,
          selectionOnly,
          borderColor: style.borderColor,
          backgroundColor: style.backgroundColor,
          color: style.color,
          boxShadow: style.boxShadow
        };
      }),
      activeStateReference: {
        borderColor: getComputedStyle(activeStateReference).borderColor,
        backgroundColor: getComputedStyle(activeStateReference).backgroundColor,
        color: getComputedStyle(activeStateReference).color
      },
      zoomFieldAppearance: getComputedStyle(zoomField).appearance,
      zoomFieldWebkitAppearance: getComputedStyle(zoomField).webkitAppearance
    };
    panel.remove();
    actions.remove();
    importMenu.remove();
    fitPanel.remove();
    control.remove();
    selectHost.remove();
    toolbarForm.remove();
    fontToolbarColorProbe.host.remove();
    fontPanelColorProbe.host.remove();
    axisColorProbe.host.remove();
    fontColorProbe.host.remove();
    fontColorFieldProbe.remove();
    statsControls.remove();
    compactInferenceControls.remove();
    figureControls.remove();
    dataViewHostProbe.remove();
    additionalTransparency.remove();
    gridTransparency.remove();
    advisor.remove();
    panelPaddingProbes.forEach(element => element.closest('#significanceSection, .config-panel, #statsPanel, #heatmapPage').remove());
    menuTargetHost.remove();
    filterTargetHost.remove();
    transformPanel.remove();
    dataViewTarget.remove();
    paletteOptionHostProbe.remove();
    menuItemProbes.forEach(element => element.remove());
    fontMenuProbes.forEach(element => element.remove());
    fontSelectOptionProbe.remove();
    pcaPage.remove();
    workspaceToolbar.remove();
    axisChip.remove();
    significanceChip.remove();
    axisLengthField.remove();
    brokenAxisField.remove();
    dataViewTab.remove();
    dataViewClose.remove();
    dataViewSave.remove();
    resizeControlsProbe.remove();
    formulaTooltip.remove();
    styleSyncOptions.remove();
    toolbarHint.remove();
    statsCopyButton.remove();
    significanceBadge.remove();
    lineHeightTightVennTab.remove();
    upsetToggleRow.remove();
    axisActionHost.remove();
    welcomeMeasurementProbes.forEach(element => element.remove());
    colorSwatchesProbe.remove();
    search.remove();
    graphAction.remove();
    dialogClose.remove();
    appGraphCard.remove();
    welcomeSurfaces.forEach(element => element.remove());
    popular.remove();
    dialogCard.remove();
    welcomeDialogCopy.remove();
    fontWeightProbes.forEach(element => element.remove());
    workspaceJobActivity.remove();
    workspaceAutosave.remove();
    borderProbes.forEach(({ element }) => element.remove());
    gridThemeProbe.remove();
    gridFontReference.remove();
    gridInkReference.remove();
    activeStateProbes.forEach(({ host }) => host.remove());
    activeStateReference.remove();
    zoomFieldHost.remove();
    iconProbeHosts.forEach(host => host.remove());
    return result;
  });

  expect(styles.borderWidth).toBe('1px');
  expect(styles.borderStyle).toBe('solid');
  expect(styles.borderColor).toBe(styles.themeBorderColors.default);
  expect(styles.importMenuBorderColor).toBe(styles.borderColor);
  expect(styles.fitPanelBorderColor).toBe(styles.borderColor);
  expect(styles.controlBorderColor).toBe(styles.themeBorderColors.control);
  expect(styles.contentPadding).toBe('10px 16px');
  expect(styles.centeredColorInputs).toHaveLength(5);
  for (const style of styles.centeredColorInputs) {
    expect(style.display).toBe('block');
    expect(style.boxSizing).toBe('border-box');
    expect(style.marginLeft).toBe(style.marginRight);
    expect(parseFloat(style.marginLeft)).toBeGreaterThan(0);
  }
  expect(styles.colorInputOverlayPosition).toBe('absolute');
  expect(styles.denseLineHeightToken).toBe('1.3');
  for (const { lineHeight, fontSize } of styles.denseLineHeights) {
    expect(lineHeight).toBeCloseTo(fontSize * 1.3, 1);
  }
  expect(styles.tightLineHeightToken).toBe('1.2');
  for (const { lineHeight, fontSize } of styles.tightLineHeights) {
    expect(lineHeight).toBeCloseTo(fontSize * 1.2, 1);
  }
  expect(styles.tinyGapToken).toBe('3px');
  expect(styles.tinyGaps).toEqual(['3px', '3px', '6px', '3px']);
  expect(styles.controlPaddingRoomyToken).toBe('6px 10px');
  expect(styles.menuItemPaddingToken).toBe('4px 8px');
  expect(styles.menuItemPaddings).toEqual([
    styles.menuItemPaddingToken,
    styles.menuItemPaddingToken,
    styles.menuItemPaddingToken,
    styles.menuItemPaddingToken,
    styles.menuItemPaddingToken,
    styles.menuItemPaddingToken,
    styles.menuItemPaddingToken,
    styles.menuItemPaddingToken
  ]);
  expect(styles.axisActionPaddings).toEqual(Array(2).fill(styles.controlPaddingRoomyToken));
  expect(styles.iconSizeToken).toBe('16px');
  expect(styles.iconSizes).toEqual(Array(2).fill(styles.iconSizeToken));
  expect(styles.smallIconSizeToken).toBe('14px');
  expect(styles.smallIconDimensions).toEqual(Array(3).fill({ width: '14px', height: '14px' }));
  expect(styles.standardIconDimensions).toEqual(Array(2).fill({ width: '16px', height: '16px' }));
  expect(styles.mediumIconSizeToken).toBe('18px');
  expect(styles.mediumIconDimensions).toEqual(Array(2).fill({ width: '18px', height: '18px' }));
  expect(styles.largeIconSizeToken).toBe('24px');
  expect(styles.largeIconHostDimensions).toEqual(Array(1).fill({
    width: '24px', height: '24px', minWidth: '24px', flexBasis: '24px'
  }));
  expect(styles.largeIconDimensions).toEqual(Array(1).fill({ width: '24px', height: '24px' }));
  expect(styles.iconSizeTokenSources).toEqual(Array(9).fill(true));
  expect(styles.largeIconLayoutSource).toBe(true);
  expect(styles.selectPaddingToken).toBe('2px 24px 2px 8px');
  expect(styles.selectPadding).toBe(styles.selectPaddingToken);
  expect(styles.toolbarFormGap).toBe('8px 12px');
  expect(styles.statsControlsGap).toBe(styles.toolbarFormGap);
  expect(styles.formRowGapToken).toBe('6px 12px');
  expect(styles.formRowGaps).toEqual(Array(3).fill(styles.formRowGapToken));
  expect(styles.dataViewHostOverflow).toBe('hidden');
  expect(styles.contentPaddingRoomyToken).toBe('12px 16px');
  expect(styles.roomyContentPadding).toEqual(Array(5).fill(styles.contentPaddingRoomyToken));
  expect(styles.panelContentPaddingToken).toBe('10px 12px 12px');
  expect(styles.panelContentPaddings).toEqual(Array(4).fill(styles.panelContentPaddingToken));
  expect(styles.targetSizeMinimumToken).toBe('24px');
  expect(styles.minimumTargetHeights).toEqual(Array(6).fill(styles.targetSizeMinimumToken));
  expect(styles.targetSizeActionDimensions).toEqual(Array(3).fill({
    width: styles.targetSizeMinimumToken,
    height: styles.targetSizeMinimumToken
  }));
  expect(styles.targetSizeActionSources).toEqual([true, true, true, true]);
  expect(styles.coarseCheckboxTargetSource).toBe(true);
  expect(styles.coarseGridRowHeightSource).toBe(true);
  expect(styles.resizerCornerDimensions).toEqual({ width: '24px', height: '24px' });
  expect(styles.menuItemMinimumToken).toBe('24px');
  expect(styles.menuItemMinimumHeights).toEqual(Array(7).fill(styles.menuItemMinimumToken));
  expect(styles.menuMaxHeightToken).toBe('220px');
  expect(styles.menuMaxHeights).toEqual(Array(3).fill(styles.menuMaxHeightToken));
  expect(styles.smallGapToken).toBe('5px');
  expect(styles.smallGaps).toEqual(Array(6).fill(styles.smallGapToken));
  expect(styles.compactCardSpacing).toEqual({ padding: '0px', gap: '0px' });
  expect(styles.fontSelectOptionMinimumHeight).toBe(styles.menuItemMinimumToken);
  expect(styles.fontWeightTokens).toEqual(['400', '500', '600', '700']);
  expect(styles.fontWeightConsumers).toEqual(styles.fontWeightTokens);
  expect(styles.transparencyWidthToken).toBe('96px');
  expect(styles.transparencyWidths).toEqual(Array(2).fill({ width: '96px', minWidth: '96px', maxWidth: '96px', flexBasis: '96px' }));
  expect(styles.controlRadii).toEqual(Array(3).fill(styles.controlRadiusToken));
  expect(styles.axisDisclosureLabels).toEqual([
    { padding: '0px 0px 0px 2px', borderStyle: 'none', borderWidth: '0px', background: 'rgba(0, 0, 0, 0)', radius: '0px', boxShadow: 'none' },
    { padding: '0px', borderStyle: 'none', borderWidth: '0px', background: 'rgba(0, 0, 0, 0)', radius: '0px', boxShadow: 'none' }
  ]);
  expect(styles.buttonRadii).toEqual(Array(2).fill(styles.buttonRadiusToken));
  expect(styles.dataViewTabTopRadii).toEqual(Array(2).fill(styles.surfaceRadiusToken));
  expect(styles.sharedSurfaceRadii).toEqual(Array(8).fill(styles.surfaceRadiusToken));
  expect(styles.menuBorderToken).toBe(styles.defaultBorderToken);
  expect(styles.defaultBorderEdges).toEqual(Array(3).fill({
    width: '1px',
    style: 'solid',
    color: styles.borderColor
  }));
  expect(styles.gridCellBottomBorder).toEqual({ width: '1px', style: 'solid', color: styles.borderColor });
  expect(styles.gridCellBaseStyle).toEqual({
    padding: '2px 3px',
    lineHeight: '16px',
    childLineHeights: ['16px', '16px'],
    rightBorder: ['1px', 'solid'],
    leftBorderWidth: '0px'
  });
  expect(styles.gridHeaderSizing).toEqual({
    rowHeight: '24px',
    hostBounds: Array(3).fill(['24px', '24px', '24px']),
    cellHeight: '24px',
    cellLineHeight: '16px',
    cellPadding: '0px'
  });
  expect(styles.gridHeaderSeam).toEqual({
    width: '1px',
    style: 'solid',
    color: styles.borderColor,
    boxShadow: 'none'
  });
  expect(styles.gridScrollBehavior).toBe('auto');
  expect(styles.gridPinnedRowChrome).toEqual({
    rowOverflowY: ['hidden', 'hidden'],
    viewportEdges: Array(2).fill(['0px', 'none', 'none']),
    sectionTopBorders: Array(2).fill(['0px', 'none']),
    cellBottomBorders: Array(2).fill(['0px', 'none']),
    groupedCellBottomBorder: ['1px', 'solid', styles.borderColor],
    sectionBottomShadows: Array(5).fill(styles.gridPinnedRowChrome.expectedBottomShadow),
    expectedBottomShadow: styles.gridPinnedRowChrome.expectedBottomShadow,
    leftSectionCellBorderColors: Array(5).fill(styles.borderColor),
    leftSectionLastRowBorders: Array(2).fill(['1px', 'solid'])
  });
  expect(styles.gridHiddenScrollbar).toEqual(['0px', '0px', 'none']);
  expect(styles.gridScrollbarChrome).toEqual({
    trackColors: Array(4).fill(styles.gridScrollbarChrome.expectedTrackColor),
    expectedTrackColor: styles.gridScrollbarChrome.expectedTrackColor,
    gutters: Array(3).fill(['0px', '0px', '0px'])
  });
  expect(styles.gridRowBottomBorder).toEqual({ width: '0px', style: 'none' });
  expect(styles.gridThemeRadii).toEqual(['0px', '0px']);
  expect(styles.gridHeaderCellBorderBottom).toEqual({ width: '0px', style: 'none' });
  expect(styles.gridHeaderSelection).toEqual({
    backgroundColor: 'rgba(11, 110, 105, 0.12)',
    boxShadow: 'none'
  });
  expect(styles.gridThemeTypography.fontToken).not.toBe('');
  expect(styles.gridThemeTypography.foregroundToken).not.toBe('');
  expect(styles.gridThemeTypography.rootFont).toBe(styles.gridThemeTypography.expectedFont);
  expect(styles.gridThemeTypography.cellFont).toBe(styles.gridThemeTypography.expectedFont);
  expect(styles.gridThemeTypography.cellColor).toBe(styles.gridThemeTypography.expectedColor);
  expect(styles.gridThemeTypography.rowHeight).toBe('20px');
  for (const style of styles.activeStateStyles.filter(state => state.activeChrome)) {
    expect(style, `${style.name} selected state`).toMatchObject({
      borderColor: styles.activeStateReference.borderColor,
      backgroundColor: styles.activeStateReference.backgroundColor,
      boxShadow: 'none'
    });
  }
  for (const style of styles.activeStateStyles.filter(state => state.fontControl)) {
    expect(style, `${style.name} selected state`).toMatchObject({
      borderColor: styles.activeStateReference.borderColor,
      backgroundColor: styles.activeStateReference.backgroundColor,
      color: styles.activeStateReference.color,
      boxShadow: 'none'
    });
  }
  for (const style of styles.activeStateStyles.filter(state => state.selectionOnly)) {
    expect(style, `${style.name} selection state`).toMatchObject({ backgroundColor: styles.activeStateReference.backgroundColor });
  }
  expect(styles.zoomFieldAppearance).toBe('textfield');
  expect(styles.zoomFieldWebkitAppearance).toBe('textfield');
});

test('disclosure and native-select spacing keeps its shared measurements', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const measurements = await page.evaluate(() => {
    const appShell = document.getElementById('appShell');
    const hosts = [];
    const makeHost = ({ id = '', className = '' } = {}) => {
      const host = document.createElement('div');
      host.id = id;
      host.className = className;
      host.style.cssText = 'position:fixed;left:-3000px;top:0;visibility:hidden';
      appShell.appendChild(host);
      hosts.push(host);
      return host;
    };
    const makeDisclosure = (host, detailsClass, summaryClass = '') => {
      const details = document.createElement('details');
      details.className = detailsClass;
      const summary = document.createElement('summary');
      summary.className = summaryClass;
      details.appendChild(summary);
      host.appendChild(details);
      return summary;
    };
    const statsHost = makeHost({ id: 'statsPanel' });
    const markerProbes = [
      makeDisclosure(makeHost(), 'fit-specification-foldable', 'fit-specification-summary'),
      makeDisclosure(statsHost, 'box-stats-advanced'),
      makeDisclosure(makeHost(), 'shared-notes', 'shared-notes__summary'),
      makeDisclosure(makeHost({ id: 'pcaPage' }), 'pca-method-advanced', 'pca-method-advanced__summary')
    ];
    const heatmapHost = makeHost({ id: 'heatmapPage' });
    const heatmapPanels = document.createElement('div');
    heatmapPanels.className = 'heatmap-lower-panels';
    heatmapHost.appendChild(heatmapPanels);
    const makeSelect = host => {
      const select = document.createElement('select');
      host.appendChild(select);
      return select;
    };
    const selectProbes = [
      makeSelect(makeHost({ className: 'workspace-page' })),
      makeSelect(statsHost),
      makeSelect(makeHost({ className: 'config-panel' })),
      makeSelect(heatmapPanels)
    ];
    const rootStyle = getComputedStyle(document.documentElement);
    const result = {
      compactGap: rootStyle.getPropertyValue('--ui-gap-compact').trim(),
      disclosureMargins: markerProbes.map(summary => getComputedStyle(summary, '::before').marginRight),
      selectArrowReserve: rootStyle.getPropertyValue('--ui-select-arrow-reserve').trim(),
      selectPaddingRights: selectProbes.map(select => getComputedStyle(select).paddingRight)
    };
    hosts.forEach(host => host.remove());
    return result;
  });

  expect(measurements.compactGap).toBe('6px');
  expect(measurements.disclosureMargins).toEqual(Array(4).fill(measurements.compactGap));
  expect(measurements.selectArrowReserve).toBe('22px');
  expect(measurements.selectPaddingRights).toEqual(Array(4).fill(measurements.selectArrowReserve));
});

test('resizer axes menus keep the same closed and open styling in both hosts', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const hostStyles = await page.evaluate(() => {
    const appShell = document.getElementById('appShell');
    const hosts = ['svgbox', 'graph-controls-header'].map(className => {
      const host = document.createElement('div');
      host.className = className;
      host.style.cssText = 'position:fixed;left:-3000px;top:0;visibility:hidden';
      const control = document.createElement('details');
      control.className = 'resizer-axeslength-control';
      const menu = document.createElement('div');
      menu.className = 'resizer-axeslength-menu';
      control.appendChild(menu);
      const optionsMenu = document.createElement('div');
      optionsMenu.className = 'resizer-options-menu';
      const nestedControl = document.createElement('details');
      nestedControl.className = 'resizer-axeslength-control';
      const nestedMenu = document.createElement('div');
      nestedMenu.className = 'resizer-axeslength-menu';
      const axisLabels = ['Equal length / same scale', 'Equal length / different scale', 'Variance-scaled'].map(text => {
        const label = document.createElement('label');
        label.className = 'resizer-axeslength-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        const span = document.createElement('span');
        span.className = 'resizer-axeslength-text';
        span.textContent = text;
        label.append(checkbox, span);
        nestedMenu.appendChild(label);
        return label;
      });
      const optionLabels = ['resizer-aspect-control', 'resizer-fontresize-control', 'resizer-title-control', 'resizer-legend-control'].map(className => {
        const label = document.createElement('label');
        label.className = className;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        label.append(checkbox, document.createTextNode(className));
        optionsMenu.appendChild(label);
        return label;
      });
      const summary = document.createElement('summary');
      summary.className = 'resizer-axeslength-summary';
      summary.textContent = 'Axes length';
      nestedControl.appendChild(summary);
      nestedControl.appendChild(nestedMenu);
      optionsMenu.appendChild(nestedControl);
      const tray = document.createElement('div');
      tray.className = 'resizer-control-tray';
      tray.append(control, optionsMenu);
      host.appendChild(tray);
      appShell.appendChild(host);
      return { host, control, menu, nestedControl, nestedMenu, labels: [...axisLabels, ...optionLabels, summary] };
    });
    const readStyle = menu => {
      const style = getComputedStyle(menu);
      return {
        position: style.position,
        display: style.display,
        flexDirection: style.flexDirection,
        gap: style.gap,
        minWidth: style.minWidth,
        padding: style.padding,
        background: style.backgroundColor,
        border: style.border,
        radius: style.borderRadius,
        shadow: style.boxShadow,
        zIndex: style.zIndex
      };
    };
    const reference = document.createElement('div');
    reference.style.fontSize = 'var(--ui-font-size-small)';
    appShell.appendChild(reference);
    const expectedFontSize = getComputedStyle(reference).fontSize;
    const panel = document.createElement('div');
    panel.className = 'config-panel';
    const panelLabel = document.createElement('label');
    panelLabel.textContent = 'Control label';
    const panelText = document.createElement('span');
    panelText.textContent = 'Control text';
    const panelRow = document.createElement('div');
    panelRow.className = 'config-panel__line';
    panelRow.append(panelLabel, panelText);
    panel.appendChild(panelRow);
    appShell.appendChild(panel);
    reference.style.fontSize = 'var(--ui-font-size-base)';
    const expectedPanelFontSize = getComputedStyle(reference).fontSize;
    const panelFonts = [panel, panelRow, panelLabel, panelText].map(element => getComputedStyle(element).fontSize);
    const result = hosts.map(({ control, menu, nestedControl, nestedMenu, labels }) => {
      const closedDisplay = getComputedStyle(menu).display;
      control.open = true;
      const nestedClosedDisplay = getComputedStyle(nestedMenu).display;
      nestedControl.open = true;
      return {
        closedDisplay,
        openStyle: readStyle(menu),
        nestedClosedDisplay,
        nestedOpenStyle: readStyle(nestedMenu),
        expectedFontSize,
        expectedPanelFontSize,
        panelFonts,
        labelStyles: labels.map(label => ({
          fontSize: getComputedStyle(label).fontSize,
          textFontSize: getComputedStyle(label.querySelector('span') || label).fontSize,
          display: getComputedStyle(label).display,
          gap: getComputedStyle(label).gap
        }))
      };
    });
    hosts.forEach(({ host }) => host.remove());
    reference.remove();
    panel.remove();
    return result;
  });

  expect(hostStyles[0]).toEqual(hostStyles[1]);
  expect(hostStyles[0].closedDisplay).toBe('none');
  expect(hostStyles[0].openStyle).toMatchObject({
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '170px',
    padding: '6px 8px'
  });
  expect(hostStyles[0].nestedClosedDisplay).toBe('none');
  expect(hostStyles[0].nestedOpenStyle).toMatchObject({
    position: 'static',
    display: 'flex',
    minWidth: '0px',
    padding: '2px 0px 0px'
  });
  for (const style of hostStyles[0].labelStyles) {
    expect(style).toMatchObject({
      fontSize: hostStyles[0].expectedFontSize,
      textFontSize: hostStyles[0].expectedFontSize,
      display: 'flex',
      gap: '6px'
    });
  }
  for (const fontSize of hostStyles[0].panelFonts) {
    expect(fontSize).toBe(hostStyles[0].expectedPanelFontSize);
  }
});

test('repeated interface foregrounds use semantic palette tokens', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--gt-ink').trim() !== '');

  const measurements = await page.evaluate(async () => {
    const css = await fetch('css/style.css').then(response => response.text());
    const appShell = document.getElementById('appShell');
    const probes = [];
    const addProbe = (tag, className, parent = appShell) => {
      const element = document.createElement(tag);
      element.className = className;
      parent.appendChild(element);
      probes.push(element);
      return element;
    };
    const controlPanel = document.createElement('div');
    controlPanel.className = 'config-panel';
    appShell.appendChild(controlPanel);
    const controlLabel = addProbe('label', 'config-panel__checkbox', controlPanel);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    controlLabel.appendChild(checkbox);

    const pcaPage = document.createElement('section');
    pcaPage.id = 'pcaPage';
    appShell.appendChild(pcaPage);
    addProbe('summary', 'pca-method-advanced__summary', pcaPage);

    const filterMenu = document.createElement('div');
    filterMenu.className = 'ag-hot-menu ag-hot-filter-menu';
    const filterInput = document.createElement('input');
    filterInput.className = 'ag-hot-filter-menu__search';
    filterMenu.appendChild(filterInput);
    document.body.appendChild(filterMenu);
    probes.push(filterInput);

    addProbe('span', 'style-sync-field__label');
    addProbe('span', 'stats-advisor__inline-label');
    addProbe('div', 'welcome-import-field');
    addProbe('h2', 'workspace-modal__title');
    addProbe('span', 'welcome-picker__empty');
    addProbe('span', 'dendrogram-controls-panel__summary-value');
    addProbe('p', 'stats-advisor__hint');
    addProbe('h2', 'welcome-dialog__title');
    const supportingColorProbeDefinitions = [
      { className: 'shared-color-picker__eyedropper--fallback' },
      { className: 'ag-hot-filter-menu__heading' },
      { className: 'data-view-tabs__export-label' },
      { className: 'stats-report-panel__summary-item' },
      { className: 'axis-controls-panel__extra-head-cell' },
      { className: 'font-controls-panel__color-indicator' }
    ];
    const controlTextColorProbeDefinitions = [
      { className: 'shared-color-picker__shape-swatch' },
      { className: 'ag-hot-filter-menu' },
      { className: 'ag-hot-filter-menu__sort-button' },
      { className: 'ag-hot-filter-menu__button' },
      { className: 'ag-hot-filter-menu__check' },
      { className: 'axis-controls-panel__mini-field-label' },
      { className: 'axis-controls-panel__extra-toggle' }
    ];
    const subtleSurfaceProbeDefinitions = [
      { className: 'ag-hot-filter-menu__sort-button', tag: 'button' },
      { className: 'ag-hot-filter-menu__sort-button', tag: 'button', disabled: true },
      { className: 'welcome-import-preview', tag: 'div' }
    ];
    const supportingColorProbeHosts = [];
    const addPaletteProbes = definitions => definitions.map(({ className, id, hostId, tag = 'span', disabled = false }) => {
      let parent = appShell;
      if (hostId) {
        parent = document.createElement('section');
        parent.id = hostId;
        appShell.appendChild(parent);
        supportingColorProbeHosts.push(parent);
      }
      const probe = document.createElement(tag);
      probe.className = className;
      if (id) probe.id = id;
      if (disabled) probe.disabled = true;
      probe.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
      parent.appendChild(probe);
      return probe;
    });
    const supportingColorProbes = addPaletteProbes(supportingColorProbeDefinitions);
    const controlTextColorProbes = addPaletteProbes(controlTextColorProbeDefinitions);
    const subtleSurfaceProbes = addPaletteProbes(subtleSurfaceProbeDefinitions);
    const importPreviewTable = document.createElement('table');
    importPreviewTable.className = 'welcome-import-preview__table';
    importPreviewTable.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    const importPreviewRow = importPreviewTable.insertRow();
    const importPreviewRowNumber = importPreviewRow.insertCell();
    importPreviewRowNumber.className = 'row-number';
    appShell.appendChild(importPreviewTable);
    const colorPickers = document.createElement('div');
    colorPickers.className = 'color-pickers';
    const formLabel = document.createElement('label');
    colorPickers.appendChild(formLabel);
    controlPanel.appendChild(colorPickers);
    probes.push(formLabel);

    const rootStyle = getComputedStyle(document.documentElement);
    const references = [];
    const tokens = {
      subtleSurface: rootStyle.getPropertyValue('--ui-surface-subtle').trim(),
      strong: rootStyle.getPropertyValue('--ui-color-ink-strong').trim(),
      emphasis: rootStyle.getPropertyValue('--ui-color-ink-emphasis').trim(),
      content: rootStyle.getPropertyValue('--ui-color-ink-content').trim(),
      default: rootStyle.getPropertyValue('--ui-color-ink-default').trim(),
      control: rootStyle.getPropertyValue('--ui-color-ink-control').trim(),
      controlText: rootStyle.getPropertyValue('--ui-color-ink-control-text').trim(),
      form: rootStyle.getPropertyValue('--ui-color-ink-form').trim(),
      supporting: rootStyle.getPropertyValue('--ui-color-ink-supporting').trim(),
      secondary: rootStyle.getPropertyValue('--ui-color-ink-secondary').trim(),
      muted: rootStyle.getPropertyValue('--ui-color-ink-muted').trim()
    };
    const expectedColors = ['control', 'content', 'strong', 'strong', 'content', 'strong', 'strong', 'muted', 'default', 'secondary', 'emphasis', 'form'].map(role => {
      const reference = document.createElement('span');
      reference.style.color = `var(--ui-color-ink-${role})`;
      appShell.appendChild(reference);
      references.push(reference);
      return getComputedStyle(reference).color;
    });
    const actual = probes.map(element => getComputedStyle(element).color);
    const supportingActual = supportingColorProbes.map(element => getComputedStyle(element).color);
    const supportingReference = document.createElement('span');
    supportingReference.style.color = 'var(--ui-color-ink-supporting)';
    appShell.appendChild(supportingReference);
    const supportingExpected = getComputedStyle(supportingReference).color;
    const controlTextReference = document.createElement('span');
    controlTextReference.style.color = 'var(--ui-color-ink-control-text)';
    appShell.appendChild(controlTextReference);
    const controlTextExpected = getComputedStyle(controlTextReference).color;
    const controlTextActual = controlTextColorProbes.map(element => getComputedStyle(element).color);
    const subtleSurfaceReference = document.createElement('span');
    subtleSurfaceReference.style.backgroundColor = 'var(--ui-surface-subtle)';
    appShell.appendChild(subtleSurfaceReference);
    const subtleSurfaceExpected = getComputedStyle(subtleSurfaceReference).backgroundColor;
    const subtleSurfaceActual = [...subtleSurfaceProbes, importPreviewRowNumber].map(element => getComputedStyle(element).backgroundColor);
    const subtleSurfaceUsage = (css.match(/background\s*:\s*var\(--ui-surface-subtle\)/gi) || []).length;
    [controlPanel, pcaPage, filterMenu, importPreviewTable, ...probes, ...references, ...supportingColorProbes, ...controlTextColorProbes, ...subtleSurfaceProbes, ...supportingColorProbeHosts, supportingReference, controlTextReference, subtleSurfaceReference].forEach(element => element.remove());
    const tokenUsage = Object.fromEntries(['strong', 'emphasis', 'content', 'default', 'control', 'control-text', 'form', 'supporting', 'secondary', 'muted'].map(role => [
      role,
      (css.match(new RegExp(`(?:^|[;{\\s])color\\s*:\\s*var\\(--ui-color-ink-${role}\\)`, 'gi')) || []).length
    ]));
    return {
      tokens,
      expectedColors,
      actual,
      supportingActual,
      supportingExpected,
      controlTextActual,
      controlTextExpected,
      subtleSurfaceActual,
      subtleSurfaceExpected,
      subtleSurfaceUsage,
      tokenUsage,
      hasRepeatedPaletteLiteral: /(?:^|[;{\s])color\s*:\s*#(?:111827|0f172a|1d2735|1e293b|111b2c|1f2937|1c2534|334155|475569|64748b)\b/i.test(css)
    };
  });

  expect(measurements.tokens).toEqual({
    subtleSurface: '#f8fafc',
    strong: '#111827',
    emphasis: '#0f172a',
    content: '#1d2735',
    default: '#1e293b',
    control: '#111b2c',
    controlText: '#1f2937',
    form: '#1c2534',
    supporting: '#334155',
    secondary: '#475569',
    muted: '#64748b'
  });
  expect(measurements.tokenUsage).toEqual({ strong: 13, emphasis: 13, content: 14, default: 11, control: 14, 'control-text': 6, form: 9, supporting: 7, secondary: 10, muted: 8 });
  expect(measurements.hasRepeatedPaletteLiteral).toBe(false);
  expect(measurements.actual).toEqual(measurements.expectedColors);
  expect(measurements.supportingActual).toEqual(Array(7).fill(measurements.supportingExpected));
  expect(measurements.controlTextActual).toEqual(Array(7).fill(measurements.controlTextExpected));
  expect(measurements.subtleSurfaceUsage).toBe(7);
  expect(measurements.subtleSurfaceActual).toEqual(Array(4).fill(measurements.subtleSurfaceExpected));
});

test('shared controls and white surfaces use semantic surface and text tokens', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-surface-control-chip').trim() !== '');

  const measurements = await page.evaluate(async () => {
    const css = await fetch('css/style.css').then(response => response.text());
    const appShell = document.getElementById('appShell');
    const probes = [];
    const temporaryHosts = [];
    const temporaryElements = [];
    const addProbe = (hostClass, tag, probeClass, hostId) => {
      const host = document.createElement(hostId ? 'section' : 'div');
      if (hostClass) host.className = hostClass;
      if (hostId) host.id = hostId;
      host.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
      const probe = document.createElement(tag);
      probe.className = probeClass;
      if (hostClass || hostId) {
        host.appendChild(probe);
        appShell.appendChild(host);
        temporaryHosts.push(host);
      } else {
        appShell.appendChild(probe);
        temporaryElements.push(probe);
      }
      probes.push(probe);
      return probe;
    };

    addProbe('', 'button', 'style-sync-select-all');
    addProbe('style-sync-targets', 'label', '');
    addProbe('style-sync-options', 'label', '');
    addProbe('', 'label', 'workspace-toolbar__checkbox');
    const overriddenChip = addProbe('', 'label', 'workspace-toolbar__checkbox');
    overriddenChip.style.setProperty('--shared-checkbox-chip-bg', '#fff3cd');
    addProbe('', 'label', 'axis-controls-panel__checkbox-label');
    addProbe('', 'button', 'axis-controls-panel__extra-toggle');
    addProbe('svgbox', 'label', 'config-panel__checkbox');
    addProbe('', 'button', 'upset-toggle', 'vennPage');

    const rootStyle = getComputedStyle(document.documentElement);
    const whiteSurfaceHosts = [];
    const whiteSurfaceProbes = [];
    const addWhiteSurfaceProbe = (tag, className, hostId, parentClass) => {
      const existingHost = hostId ? document.getElementById(hostId) : null;
      const host = existingHost || document.createElement('section');
      if (!existingHost) {
        host.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
        if (hostId) host.id = hostId;
      }
      let parent = host;
      if (parentClass) {
        parent = document.createElement('div');
        parent.className = parentClass;
        host.appendChild(parent);
      }
      const probe = document.createElement(tag);
      probe.className = className;
      parent.appendChild(probe);
      if (!existingHost) {
        appShell.appendChild(host);
        whiteSurfaceHosts.push(host);
      }
      whiteSurfaceProbes.push(probe);
      return probe;
    };
    addWhiteSurfaceProbe('details', 'fit-specification-foldable');
    addWhiteSurfaceProbe('span', 'stats-significance-badge');
    addWhiteSurfaceProbe('details', 'box-stats-advanced', 'statsPanel');
    addWhiteSurfaceProbe('button', 'font-controls-panel__combo-option');
    addWhiteSurfaceProbe('button', 'font-controls-panel__select-option');
    const toolbarHost = document.createElement('div');
    toolbarHost.className = 'workspace-toolbar';
    const axisPanel = document.createElement('div');
    axisPanel.className = 'workspace-toolbar__panel axis-controls-panel';
    const lengthField = document.createElement('div');
    lengthField.className = 'axis-controls-panel__field--length';
    const lengthLabel = document.createElement('label');
    lengthLabel.className = 'axis-controls-panel__field-label';
    lengthLabel.textContent = 'Axis length';
    lengthField.appendChild(lengthLabel);
    axisPanel.appendChild(lengthField);
    toolbarHost.appendChild(axisPanel);
    toolbarHost.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    appShell.appendChild(toolbarHost);
    temporaryHosts.push(toolbarHost);
    const whiteSurfaceReference = document.createElement('span');
    whiteSurfaceReference.style.backgroundColor = 'var(--gt-surface)';
    appShell.appendChild(whiteSurfaceReference);
    const surfaceReference = document.createElement('span');
    surfaceReference.style.backgroundColor = 'var(--ui-surface-control-chip)';
    appShell.appendChild(surfaceReference);
    const textReference = document.createElement('span');
    textReference.style.color = 'var(--ui-color-control-chip)';
    appShell.appendChild(textReference);
    const controlTextReference = document.createElement('span');
    controlTextReference.style.color = 'var(--ui-color-ink-control-text)';
    appShell.appendChild(controlTextReference);
    const result = {
      surfaceToken: rootStyle.getPropertyValue('--ui-surface-control-chip').trim(),
      textToken: rootStyle.getPropertyValue('--ui-color-control-chip').trim(),
      surfaceExpected: getComputedStyle(surfaceReference).backgroundColor,
      textExpected: getComputedStyle(textReference).color,
      controlTextExpected: getComputedStyle(controlTextReference).color,
      whiteSurfaceExpected: getComputedStyle(whiteSurfaceReference).backgroundColor,
      whiteSurfaceColors: whiteSurfaceProbes.map(probe => getComputedStyle(probe).backgroundColor),
      axisLabelSurface: getComputedStyle(lengthLabel).backgroundColor,
      axisPanelSurface: getComputedStyle(axisPanel).backgroundColor,
      remainingWhiteSurfaceLiterals: (css.match(/background(?:-color)?\s*:\s*#fff(?![0-9a-f])/gi) || []).length,
      backgrounds: probes.map(probe => getComputedStyle(probe).backgroundColor),
      colors: probes.map(probe => getComputedStyle(probe).color),
      backgroundTokenUsage: (css.match(/background\s*:\s*var\([^;]*--ui-surface-control-chip/gi) || []).length,
      colorTokenUsage: (css.match(/color\s*:\s*var\([^;]*--ui-color-control-chip/gi) || []).length,
      hasRepeatedChipLiterals: /(?:background|color)\s*:\s*#(?:f9fafc|1e2633)\b/i.test(css)
    };
    [ ...temporaryHosts, ...temporaryElements, ...whiteSurfaceHosts, ...whiteSurfaceProbes, surfaceReference, textReference, controlTextReference, whiteSurfaceReference ].forEach(element => element.remove());
    return result;
  });

  expect(measurements.surfaceToken).toBe('#f9fafc');
  expect(measurements.textToken).toBe('#1e2633');
  expect(measurements.backgroundTokenUsage).toBe(4);
  expect(measurements.colorTokenUsage).toBe(4);
  expect(measurements.hasRepeatedChipLiterals).toBe(false);
  expect(measurements.remainingWhiteSurfaceLiterals).toBe(0);
  expect(measurements.whiteSurfaceColors).toEqual(Array(5).fill(measurements.whiteSurfaceExpected));
  expect(measurements.axisLabelSurface).toBe(measurements.axisPanelSurface);
  expect(measurements.backgrounds.slice(0, 4)).toEqual(Array(4).fill(measurements.surfaceExpected));
  expect(measurements.backgrounds[4]).toBe('rgb(255, 243, 205)');
  expect(measurements.backgrounds.slice(5)).toEqual(Array(4).fill(measurements.surfaceExpected));
  expect(measurements.colors.slice(0, 6)).toEqual(Array(6).fill(measurements.textExpected));
  expect(measurements.colors[6]).toBe(measurements.controlTextExpected);
  expect(measurements.colors.slice(7)).toEqual(Array(2).fill(measurements.textExpected));
});

test('shared formatting panels use CSS layout and native hidden state', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const measurements = await page.evaluate(() => {
    const panels = [
      ['axis-controls-panel', 'flex'],
      ['dendrogram-controls-panel', 'flex'],
      ['significance-controls-panel', 'flex'],
      ['workspace-toolbar__panel--additional-line additional-line-controls-panel', 'grid'],
      ['grid-controls-panel', 'flex']
    ];
    return panels.map(([className]) => {
      const panel = document.createElement('div');
      panel.className = className;
      document.getElementById('appShell').appendChild(panel);
      const open = { hidden: panel.hidden, inlineDisplay: panel.style.display, display: getComputedStyle(panel).display };
      panel.hidden = true;
      const closed = { hidden: panel.hidden, inlineDisplay: panel.style.display, display: getComputedStyle(panel).display };
      panel.remove();
      return { className, open, closed };
    });
  });
  expect(measurements).toEqual([
    { className: 'axis-controls-panel', open: { hidden: false, inlineDisplay: '', display: 'flex' }, closed: { hidden: true, inlineDisplay: '', display: 'none' } },
    { className: 'dendrogram-controls-panel', open: { hidden: false, inlineDisplay: '', display: 'flex' }, closed: { hidden: true, inlineDisplay: '', display: 'none' } },
    { className: 'significance-controls-panel', open: { hidden: false, inlineDisplay: '', display: 'flex' }, closed: { hidden: true, inlineDisplay: '', display: 'none' } },
    { className: 'workspace-toolbar__panel--additional-line additional-line-controls-panel', open: { hidden: false, inlineDisplay: '', display: 'grid' }, closed: { hidden: true, inlineDisplay: '', display: 'none' } },
    { className: 'grid-controls-panel', open: { hidden: false, inlineDisplay: '', display: 'flex' }, closed: { hidden: true, inlineDisplay: '', display: 'none' } }
  ]);
});

test('disabled controls use the shared disabled-text token', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-color-disabled').trim() !== '');

  const measurements = await page.evaluate(async () => {
    const css = await fetch('css/style.css').then(response => response.text());
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';
    const createProbe = (tag, className, disabled = false) => {
      const element = document.createElement(tag);
      element.className = className;
      if (disabled === 'aria') element.setAttribute('aria-disabled', 'true');
      else if (disabled) element.disabled = true;
      host.appendChild(element);
      return element;
    };
    const probes = [
      createProbe('button', 'ag-hot-filter-menu__sort-button', true),
      createProbe('input', 'axis-controls-panel__input', true),
      createProbe('button', 'axis-controls-panel__button--additional-ticks', 'aria'),
      createProbe('button', 'axis-controls-panel__button--break-axis', 'aria'),
      createProbe('button', 'tab-context-menu__item', 'aria')
    ];
    document.getElementById('appShell').appendChild(host);
    const reference = document.createElement('span');
    reference.style.color = 'var(--ui-color-disabled)';
    host.appendChild(reference);
    const result = {
      token: getComputedStyle(document.documentElement).getPropertyValue('--ui-color-disabled').trim(),
      expected: getComputedStyle(reference).color,
      actual: probes.map(probe => getComputedStyle(probe).color),
      tokenUsage: (css.match(/(?:^|[;{\s])color\s*:\s*var\(--ui-color-disabled\)/g) || []).length,
      repeatedLiteral: /(?:^|[;{\s])color\s*:\s*#94a3b8\b/i.test(css)
    };
    host.remove();
    return result;
  });

  expect(measurements.token).toBe('#94a3b8');
  expect(measurements.tokenUsage).toBe(5);
  expect(measurements.repeatedLiteral).toBe(false);
  expect(measurements.actual).toEqual(Array(5).fill(measurements.expected));
});

test('Welcome descriptions use one semantic text-color token', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-color-ink-description').trim() !== '');

  const measurements = await page.evaluate(async () => {
    const css = await fetch('css/style.css').then(response => response.text());
    const root = document.getElementById('welcomeScreen');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-2000px;top:0;visibility:hidden';

    const dropCopy = document.createElement('div');
    dropCopy.className = 'welcome-drop-zone__copy';
    const dropTitle = document.createElement('span');
    const dropSupporting = document.createElement('span');
    dropCopy.append(dropTitle, dropSupporting);
    const probes = [
      dropTitle,
      Object.assign(document.createElement('div'), { className: 'welcome-drop-zone__supporting' }),
      Object.assign(document.createElement('p'), { className: 'welcome-graph-finder__hint' }),
      Object.assign(document.createElement('p'), { className: 'graph-card__description' })
    ];
    host.append(dropCopy, probes[1], probes[2], probes[3]);
    const reference = document.createElement('span');
    reference.style.color = 'var(--ui-color-ink-description)';
    host.appendChild(reference);
    root.appendChild(host);
    const result = {
      token: getComputedStyle(document.documentElement).getPropertyValue('--ui-color-ink-description').trim(),
      expected: getComputedStyle(reference).color,
      actual: probes.map(probe => getComputedStyle(probe).color),
      tokenUsage: (css.match(/(?:^|[;{\s])color\s*:\s*var\(--ui-color-ink-description\)/g) || []).length,
      repeatedLiteral: /(?:^|[;{\s])color\s*:\s*#3f4b5a\b/i.test(css)
    };
    host.remove();
    return result;
  });

  expect(measurements.token).toBe('#3f4b5a');
  expect(measurements.tokenUsage).toBe(4);
  expect(measurements.repeatedLiteral).toBe(false);
  expect(measurements.actual).toEqual(Array(4).fill(measurements.expected));
});

test('repeated control measurements resolve through shared UI tokens', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    getComputedStyle(document.documentElement).getPropertyValue('--ui-control-width-standard').trim() === '108px'
      && getComputedStyle(document.documentElement).getPropertyValue('--ui-layout-min-width-wide').trim() === '220px'
  ));

  const measurements = await page.evaluate(async () => {
    const css = await fetch('css/style.css').then(response => response.text());
    const appShell = document.getElementById('appShell');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;visibility:hidden';
    const scopedHosts = [];
    const groups = {};
    const add = (group, parent, tag, className) => {
      const element = document.createElement(tag);
      element.className = className;
      parent.appendChild(element);
      (groups[group] ||= []).push(element);
      return element;
    };
    const parent = (className, root = host) => {
      const element = document.createElement('div');
      element.className = className;
      root.appendChild(element);
      return element;
    };
    const addScopedHost = root => {
      const element = document.createElement('div');
      element.style.cssText = 'position:fixed;left:-3000px;top:0;visibility:hidden';
      root.appendChild(element);
      scopedHosts.push(element);
      return element;
    };
    const addIdRoot = id => {
      let root = document.getElementById(id);
      if (!root) {
        root = document.createElement('div');
        root.id = id;
        host.appendChild(root);
      }
      return addScopedHost(root);
    };

    add('standardWidth', host, 'div', 'axis-controls-panel__notation-combo');
    for (const className of [
      'significance-controls-panel__input significance-controls-panel__input--select',
      'additional-line-controls-panel__input additional-line-controls-panel__input--select',
      'grid-controls-panel__input grid-controls-panel__input--select'
    ]) add('standardWidth', host, 'select', className);
    for (const className of [
      'significance-controls-panel__input',
      'additional-line-controls-panel__input',
      'grid-controls-panel__input'
    ]) add('standardMaxWidth', host, 'input', className);

    add('wideMinimum', host, 'div', 'workspace-toolbar__section--form');
    add('wideMinimum', parent('config-panel'), 'button', 'color-scheme-picker__button');
    const surfacePage = addIdRoot('surfacePage');
    add('wideMinimum', parent('diagram-area', surfacePage), 'div', 'config-panel');
    const significanceField = add('wideMinimum', host, 'div', 'significance-controls-panel__field--label-mode');
    add('wideMinimum', significanceField, 'select', 'significance-controls-panel__input significance-controls-panel__input--select');
    add('wideMinimum', host, 'div', 'additional-line-controls-panel__field--scatter-grouped-controls');

    const fitBody = parent('fit-specification-body');
    add('insetPadding', fitBody, 'textarea', 'fit-textarea');
    add('insetPadding', host, 'div', 'stats-inference-controls stats-inference-controls--compact');
    add('insetPadding', parent('svgbox'), 'div', 'resizer-axeslength-menu');
    add('insetPadding', parent('config-panel'), 'button', 'color-scheme-picker__option');
    add('insetPadding', host, 'div', 'config-panel__warning');
    const nativeSelect = document.createElement('select');
    host.appendChild(nativeSelect);
    add('insetPadding', nativeSelect, 'option', '');

    const picker = parent('shared-color-picker');
    add('tightPadding', picker, 'input', 'shared-color-picker__scatter-style-input');
    const filterPopup = document.createElement('div');
    filterPopup.className = 'ag-hot-menu ag-hot-filter-menu';
    add('tightPadding', filterPopup, 'input', 'ag-hot-filter-menu__search ag-hot-filter-menu__input');
    add('tightPadding', filterPopup, 'div', 'ag-hot-filter-menu__check');
    document.body.appendChild(filterPopup);
    add('tightPadding', parent('resizer-control-tray', parent('svgbox')), 'button', 'resizer-zoom-control');
    add('tightPadding', host, 'input', 'axis-controls-panel__extra-input');

    const welcomeProbeHost = addScopedHost(document.getElementById('welcomeScreen'));
    add('rowPadding', welcomeProbeHost, 'div', 'welcome-popular__grid');
    let significanceSection = document.getElementById('significanceSection');
    if (!significanceSection) {
      significanceSection = document.createElement('div');
      significanceSection.id = 'significanceSection';
      host.appendChild(significanceSection);
    }
    const significanceSummary = document.createElement('summary');
    significanceSection.appendChild(significanceSummary);
    (groups.rowPadding ||= []).push(significanceSummary);
    add('rowPadding', parent('config-panel'), 'legend', '');
    const statsPanel = addIdRoot('statsPanel');
    add('rowPadding', statsPanel, 'legend', '');
    const heatmapPage = addIdRoot('heatmapPage');
    add('rowPadding', parent('heatmap-lower-panels', heatmapPage), 'legend', '');

    const vennPage = addIdRoot('vennPage');
    add('circularRadius', welcomeProbeHost, 'div', 'welcome-import-format-check__icon');
    add('circularRadius', host, 'div', 'workspace-job-activity__spinner');
    add('circularRadius', vennPage, 'div', 'venn-loading-overlay__spinner');
    add('circularRadius', host, 'div', 'document-open-overlay__spinner');
    add('controlMinimumHeight', parent('graph-controls-header', parent('svgbox')), 'button', 'resizer-view-button');
    const statsHeightProbe = add('controlMinimumHeight', statsPanel, 'input', '');
    statsHeightProbe.type = 'number';
    const boxPage = addIdRoot('boxPage');
    const whiskerRow = parent('', boxPage);
    whiskerRow.id = 'boxGraphWhiskerRow';
    const whiskerLabel = add('controlMinimumHeight', whiskerRow, 'label', '');
    whiskerLabel.id = 'boxShowCapsLabel';
    const significanceControls = parent('box-significance-controls', boxPage);
    significanceControls.id = 'boxSignificanceControls';
    add('controlMinimumHeight', significanceControls, 'label', '');
    add('tightLineHeight', host, 'div', 'hot-formula-fn-item');
    add('normalLineHeight', host, 'div', 'workspace-toolbar__document-title');
    add('tightLineHeight', host, 'button', 'workspace-toolbar__tab');
    add('tightLineHeight', vennPage, 'button', 'string-overlay-file-button');

    appShell.appendChild(host);
    const getStyles = (items, properties) => items.map(element => {
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map(property => [property, style[property]]));
    });
    const rootStyle = getComputedStyle(document.documentElement);
    const result = {
      tokens: Object.fromEntries([
        'ui-control-width-standard', 'ui-layout-min-width-wide', 'ui-control-padding-inset',
        'ui-control-padding-tight', 'ui-content-padding-row', 'ui-line-height-compact-tight', 'ui-radius-circle'
      ].map(name => [name, rootStyle.getPropertyValue(`--${name}`).trim()])),
      tokenUseCounts: Object.fromEntries([
        'ui-control-width-standard', 'ui-layout-min-width-wide', 'ui-control-padding-inset',
        'ui-control-padding-tight', 'ui-content-padding-row', 'ui-line-height-compact-tight', 'ui-radius-circle'
      ].map(name => [name, (css.match(new RegExp(`var\\(--${name}\\)`, 'g')) || []).length])),
      standardWidth: getStyles(groups.standardWidth, ['width', 'minWidth', 'maxWidth']),
      standardMaxWidth: getStyles(groups.standardMaxWidth, ['maxWidth']),
      wideMinimums: getStyles(groups.wideMinimum, ['minWidth']),
      insetPaddings: getStyles(groups.insetPadding, ['padding']),
      tightPaddings: getStyles(groups.tightPadding, ['padding']),
      rowPaddings: getStyles(groups.rowPadding, ['padding']),
      tightLineHeights: getStyles(groups.tightLineHeight, ['lineHeight', 'fontSize']),
      normalLineHeights: getStyles(groups.normalLineHeight, ['lineHeight', 'fontSize']),
      controlHeightToken: rootStyle.getPropertyValue('--ui-control-height').trim(),
      controlMinimumHeights: getStyles(groups.controlMinimumHeight, ['minHeight']),
      circularRadii: getStyles(groups.circularRadius, ['borderTopLeftRadius'])
    };
    significanceSummary.remove();
    scopedHosts.forEach(probeHost => probeHost.remove());
    host.remove();
    filterPopup.remove();
    return result;
  });

  expect(measurements.tokens).toEqual({
    'ui-control-width-standard': '108px',
    'ui-layout-min-width-wide': '220px',
    'ui-control-padding-inset': '6px 8px',
    'ui-control-padding-tight': '2px 6px',
    'ui-content-padding-row': '0 6px',
    'ui-line-height-compact-tight': '1.25',
    'ui-radius-circle': '50%'
  });
  expect(measurements.tokenUseCounts).toEqual({
    'ui-control-width-standard': 9,
    'ui-layout-min-width-wide': 6,
    'ui-control-padding-inset': 6,
    'ui-control-padding-tight': 5,
    'ui-content-padding-row': 5,
    'ui-line-height-compact-tight': 4,
    'ui-radius-circle': 4
  });
  expect(measurements.standardWidth[0]).toEqual({ width: '108px', minWidth: '108px', maxWidth: '108px' });
  expect(measurements.standardWidth.slice(1).map(style => style.minWidth)).toEqual(Array(3).fill('108px'));
  expect(measurements.standardMaxWidth).toEqual(Array(3).fill({ maxWidth: '108px' }));
  expect(measurements.wideMinimums).toEqual(Array(6).fill({ minWidth: '220px' }));
  expect(measurements.insetPaddings).toEqual(Array(6).fill({ padding: '6px 8px' }));
  expect(measurements.tightPaddings).toEqual(Array(5).fill({ padding: '2px 6px' }));
  expect(measurements.rowPaddings).toEqual(Array(5).fill({ padding: '0px 6px' }));
  expect(measurements.controlHeightToken).toBe('26px');
  expect(measurements.controlMinimumHeights).toEqual(Array(4).fill({ minHeight: '26px' }));
  expect(measurements.circularRadii).toEqual(Array(4).fill({ borderTopLeftRadius: '50%' }));
  for (const { lineHeight, fontSize } of measurements.normalLineHeights) {
    expect(Number.parseFloat(lineHeight) / Number.parseFloat(fontSize)).toBeCloseTo(1.4, 2);
  }
  for (const { lineHeight, fontSize } of measurements.tightLineHeights) {
    expect(Number.parseFloat(lineHeight) / Number.parseFloat(fontSize)).toBeCloseTo(1.25, 2);
  }
});
