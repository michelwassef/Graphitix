const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { activateToolbarSection } = require('../helpers/uiDriver');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');
const { expectTargetsAtLeast24 } = require('../helpers/targetSizeAssertions');

const WCAG_22_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const GRID_ACCESSIBLE_NAMES = Object.freeze({
  venn: 'Venn input data table',
  box: 'Box data table',
  scatter: 'Scatter data table',
  pca: 'PCA input data table',
  line: 'Line data table',
  heatmap: 'Heatmap input data table',
  surface: 'Surface input data table',
  roc: 'ROC input data table',
  survival: 'Survival input data table',
  hist: 'Histogram input data table',
  pie: 'Pie chart input data table'
});
const STATS_PANEL_IDS = Object.freeze({
  box: 'statsPanel',
  surface: 'surfaceStats',
  pca: 'pcaStats',
  scatter: 'scatterStats',
  line: 'lineStats',
  roc: 'rocStats',
  survival: 'survivalStats',
  hist: 'histStats',
  pie: 'pieStats',
  heatmap: 'heatmapStats'
});
const WCAG_TEXT_SPACING_STYLE = `
  body, body * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-block-end: 2em !important; }
`;

function parseColor(value) {
  const hex = String(value || '').match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex) {
    const digits = hex[1].length <= 4
      ? Array.from(hex[1], digit => digit + digit).join('')
      : hex[1];
    const channels = [0, 2, 4].map(index => Number.parseInt(digits.slice(index, index + 2), 16));
    const alpha = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return { channels, alpha };
  }
  const match = String(value || '').match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/i);
  if (!match) return null;
  const alphaValue = match[4] === undefined ? 1 : Number(match[4]);
  const alpha = String(value).includes('%') ? alphaValue / 100 : alphaValue;
  return { channels: [Number(match[1]), Number(match[2]), Number(match[3])], alpha };
}

function parseSvgBackgroundIcon(value) {
  const cssValue = String(value || '');
  const match = cssValue.match(/url\("(data:image\/svg\+xml,[^"]+)"\)/i)
    || cssValue.match(/url\('(data:image\/svg\+xml,[^']+)'\)/i)
    || cssValue.match(/url\((data:image\/svg\+xml,[^)]+)\)/i);
  if (!match) return null;
  try {
    const svg = decodeURIComponent(match[1].slice('data:image/svg+xml,'.length));
    const fill = svg.match(/\bfill\s*=\s*["'](#[\da-f]{3,8})["']/i);
    return fill ? parseColor(fill[1]) : null;
  } catch (_error) {
    return null;
  }
}

function compositeColor(foreground, background) {
  return {
    channels: foreground.channels.map((channel, index) => (
      channel * foreground.alpha + background.channels[index] * (1 - foreground.alpha)
    )),
    alpha: 1
  };
}

function resolveContrastColors(example) {
  const foreground = parseColor(example.fill || example.color);
  if (!foreground || foreground.alpha < 1 - 1e-6 || Number(example.opacity || 1) < 1 - 1e-6) {
    return null;
  }
  let background = { channels: [255, 255, 255], alpha: 1 };
  const icons = [];
  const stack = Array.isArray(example.backgroundStack) ? example.backgroundStack : [];
  for (const layer of [...stack].reverse()) {
    if (layer.backgroundImage && layer.backgroundImage !== 'none') {
      const icon = parseSvgBackgroundIcon(layer.backgroundImage);
      const iconBackground = parseColor(layer.backgroundColor);
      if (!icon || !iconBackground) return null;
      icons.push({
        foreground: icon.channels,
        background: iconBackground.channels
      });
    }
    if (Number(layer.opacity || 1) < 1 - 1e-6) return null;
    const color = parseColor(layer.backgroundColor);
    if (color && color.alpha > 0) {
      background = color.alpha >= 1 - 1e-6 ? color : compositeColor(color, background);
    }
  }
  return { foreground: foreground.channels, background: background.channels, icons };
}

function contrastRatio(foreground, background) {
  const luminance = channels => channels
    .map(channel => channel / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function reviewIncompleteContrast(visualReviews) {
  const examples = visualReviews.flatMap(screen => screen.rules
    .filter(rule => rule.id === 'color-contrast')
    .flatMap(rule => rule.examples.map(example => ({ screen: screen.screen, example }))));
  const unresolved = [];
  const failures = [];
  const iconFailures = [];
  let iconsReviewed = 0;
  let minimumRatio = Infinity;
  for (const { screen, example } of examples) {
    const colors = resolveContrastColors(example);
    if (!colors) {
      unresolved.push({ screen, selector: example.selector });
      continue;
    }
    const ratio = contrastRatio(colors.foreground, colors.background);
    minimumRatio = Math.min(minimumRatio, ratio);
    if (ratio < 4.5) failures.push({ screen, selector: example.selector, ratio });
    colors.icons.forEach(icon => {
      const iconRatio = contrastRatio(icon.foreground, icon.background);
      iconsReviewed += 1;
      if (iconRatio < 3) iconFailures.push({ screen, selector: example.selector, ratio: iconRatio });
    });
  }
  return {
    reviewed: examples.length - unresolved.length,
    iconsReviewed,
    minimumRatio: Number.isFinite(minimumRatio) ? Math.round(minimumRatio * 100) / 100 : null,
    failures,
    iconFailures,
    unresolved
  };
}

async function inspectPointerTargetSizes(page, scopeSelector) {
  return page.evaluate(selector => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`Target-size scan root not found: ${selector}`);
    // SVG data marks and drag surfaces are reviewed by their chart/resize contracts, not as ordinary controls.
    const candidateSelector = [
      'button', 'a[href]', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
      '[role="button"]', '[role="link"]', '[role="tab"]', '[role="checkbox"]', '[role="radio"]',
      '[role="switch"]', '[role="menuitem"]', '[role="menuitemcheckbox"]',
      '[role="menuitemradio"]', '[role="option"]', '[role="combobox"]', '[role="slider"]',
      '[role="searchbox"]', '[role="spinbutton"]', '[role="treeitem"]'
    ].join(', ');
    const candidates = Array.from(root.querySelectorAll(candidateSelector));
    const seen = new Set();
    const targets = [];

    for (const element of candidates) {
      const target = element.matches('input[type="checkbox"], input[type="radio"]')
        ? (element.labels?.[0] || element.closest('label') || element)
        : element;
      if (target.closest('[inert], .visually-hidden')) continue;
      const closedDetails = target.closest('details:not([open])');
      if (closedDetails && target.closest('summary')?.parentElement !== closedDetails) continue;
      const style = getComputedStyle(target);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.pointerEvents === 'none') continue;
      // Disabled controls cannot receive pointer input; inline links remain in the audit for case-by-case review.
      if (element.matches(':disabled, [aria-disabled="true"]') || target.matches('[aria-disabled="true"]')) continue;
      if (seen.has(target)) continue;
      seen.add(target);

      const rect = target.getBoundingClientRect();
      const visibleRect = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      let clippedByScrollableAncestor = false;
      let clippedByFixedOverflowAncestor = false;
      for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor);
        const ancestorRect = ancestor.getBoundingClientRect();
        if (['hidden', 'clip', 'auto', 'scroll'].includes(ancestorStyle.overflowX)) {
          const left = ancestorRect.left + ancestor.clientLeft;
          const previousWidth = visibleRect.right - visibleRect.left;
          visibleRect.left = Math.max(visibleRect.left, left);
          visibleRect.right = Math.min(visibleRect.right, left + ancestor.clientWidth);
          if (visibleRect.right - visibleRect.left < previousWidth) {
            if (['auto', 'scroll'].includes(ancestorStyle.overflowX)) clippedByScrollableAncestor = true;
            else clippedByFixedOverflowAncestor = true;
          }
        }
        if (['hidden', 'clip', 'auto', 'scroll'].includes(ancestorStyle.overflowY)) {
          const top = ancestorRect.top + ancestor.clientTop;
          const previousHeight = visibleRect.bottom - visibleRect.top;
          visibleRect.top = Math.max(visibleRect.top, top);
          visibleRect.bottom = Math.min(visibleRect.bottom, top + ancestor.clientHeight);
          if (visibleRect.bottom - visibleRect.top < previousHeight) {
            if (['auto', 'scroll'].includes(ancestorStyle.overflowY)) clippedByScrollableAncestor = true;
            else clippedByFixedOverflowAncestor = true;
          }
        }
      }
      if (clippedByScrollableAncestor && !clippedByFixedOverflowAncestor
        && ((visibleRect.right - visibleRect.left) < rect.width - 0.5
          || (visibleRect.bottom - visibleRect.top) < rect.height - 0.5)) continue;
      visibleRect.left = Math.max(0, visibleRect.left);
      visibleRect.top = Math.max(0, visibleRect.top);
      visibleRect.right = Math.min(innerWidth, visibleRect.right);
      visibleRect.bottom = Math.min(innerHeight, visibleRect.bottom);
      if (visibleRect.right <= visibleRect.left || visibleRect.bottom <= visibleRect.top) continue;
      const className = typeof target.className === 'string'
        ? target.className
        : String(target.className?.baseVal || '');
      const isCompactGridRowCheckbox = element.matches('input.ag-checkbox-input')
        && !!element.closest('.ag-theme-balham .ag-row');
      targets.push({
        element: target,
        rect: visibleRect,
        exception: isCompactGridRowCheckbox ? 'compact-ag-grid-row-checkbox' : null,
        description: `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}${className ? `.${className.trim().replace(/\s+/g, '.')}` : ''}@${Math.round(visibleRect.left)},${Math.round(visibleRect.top)}`
      });
    }

    const undersized = [];
    for (const target of targets) {
      const { rect } = target;
      if (rect.right - rect.left >= 24 && rect.bottom - rect.top >= 24) continue;
      const centerX = (rect.left + rect.right) / 2;
      const centerY = (rect.top + rect.bottom) / 2;
      const overlaps = targets.filter(other => {
        if (other === target) return false;
        const otherWidth = other.rect.right - other.rect.left;
        const otherHeight = other.rect.bottom - other.rect.top;
        const otherCenterX = (other.rect.left + other.rect.right) / 2;
        const otherCenterY = (other.rect.top + other.rect.bottom) / 2;
        if (otherWidth < 24 || otherHeight < 24) {
          return Math.hypot(centerX - otherCenterX, centerY - otherCenterY) < 24;
        }
        const closestX = Math.max(other.rect.left, Math.min(centerX, other.rect.right));
        const closestY = Math.max(other.rect.top, Math.min(centerY, other.rect.bottom));
        return Math.hypot(centerX - closestX, centerY - closestY) < 12;
      });
      if (overlaps.length) {
        undersized.push({
          target: target.description,
          width: Math.round((rect.right - rect.left) * 10) / 10,
          height: Math.round((rect.bottom - rect.top) * 10) / 10,
          exception: target.exception,
          overlapsOnlyCompactGridRowCheckboxes: overlaps.every(other => other.exception === 'compact-ag-grid-row-checkbox'),
          overlaps: overlaps.slice(0, 3).map(other => other.description)
        });
      }
    }
    return { targetCount: targets.length, undersized };
  }, scopeSelector);
}

async function scanVisibleAccessibility(page, scope) {
  const result = await page.evaluate(async ({ scopeSelector, tags }) => {
    const root = scopeSelector ? document.querySelector(scopeSelector) : document;
    if (!root) throw new Error(`Accessibility scan root not found: ${scopeSelector}`);
    const report = await window.axe.run(root, { runOnly: { type: 'tag', values: tags } });
    const violations = report.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.help,
      count: violation.nodes.length,
      summary: violation.nodes[0]?.failureSummary || '',
      targets: [...new Set(violation.nodes.map(node => node.target.join(' ')))].slice(0, 6),
      details: violation.id === 'scrollable-region-focusable'
        ? violation.nodes.slice(0, 6).map(node => {
          const target = node.target.join(' ');
          const element = target ? root.querySelector(target) : null;
          const style = element ? getComputedStyle(element) : null;
          return {
            target,
            html: element?.outerHTML?.slice(0, 500) || node.html || '',
            overflowX: style?.overflowX || '',
            overflowY: style?.overflowY || '',
            clientWidth: element?.clientWidth || 0,
            scrollWidth: element?.scrollWidth || 0,
            clientHeight: element?.clientHeight || 0,
            scrollHeight: element?.scrollHeight || 0,
            tabIndex: element?.getAttribute('tabindex') || null,
            descendantTabStops: element?.querySelectorAll?.('[tabindex="0"], a[href], button, input, select, textarea, [contenteditable="true"]').length || 0
          };
        })
        : undefined,
      nodes: violation.nodes
    }));
    const resolvedViolations = violations.flatMap(violation => {
      if (violation.id !== 'aria-required-children') return [violation];
      const unresolved = violation.nodes.filter(node => {
        const target = node.target.length === 1 ? node.target[0] : '';
        if (target !== '.ag-root' || !/children which are not allowed: \[role=presentation\]/.test(node.failureSummary || '')) {
          return true;
        }
        const grid = root.querySelector('.ag-root[role="grid"]');
        const rowGroups = grid?.querySelectorAll('[role="rowgroup"]').length || 0;
        const rows = grid?.querySelectorAll('[role="row"]').length || 0;
        const headers = grid?.querySelectorAll('[role="columnheader"]').length || 0;
        // AG Grid's layout wrappers use presentation roles; verify the required row structure directly.
        return !(grid && rowGroups > 0 && rows > 0 && headers > 0);
      });
      if (!unresolved.length) return [];
      return [{ ...violation, count: unresolved.length, nodes: unresolved }];
    }).map(violation => ({
      ...violation,
      targets: [...new Set(violation.nodes.map(node => node.target.join(' ')))].slice(0, 6),
      nodes: undefined
    }));
    const visualReviews = report.incomplete
      .filter(result => result.id === 'target-size' || result.id === 'color-contrast')
      .map(result => {
        const reasonCounts = new Map();
        for (const node of result.nodes) {
          const reason = (node.failureSummary || 'No automated explanation').split('\n').slice(1, 3).join(' ').trim();
          reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
        }
        const examples = result.nodes.map(node => {
          const selector = node.target.join(' ');
          const element = root.querySelector(selector);
          const rect = element?.getBoundingClientRect();
          const style = element ? getComputedStyle(element) : null;
          const backgroundStack = [];
          for (let ancestor = element, depth = 0; ancestor && ancestor !== document.documentElement && depth < 8; ancestor = ancestor.parentElement, depth += 1) {
            const ancestorStyle = getComputedStyle(ancestor);
            const backgroundColor = ancestorStyle.backgroundColor;
            const backgroundImage = ancestorStyle.backgroundImage;
            const opacity = ancestorStyle.opacity;
            if (backgroundColor !== 'rgba(0, 0, 0, 0)' || backgroundImage !== 'none' || opacity !== '1') {
              backgroundStack.push({
                selector: ancestor.id ? `#${ancestor.id}` : `${ancestor.tagName.toLowerCase()}.${String(ancestor.className || '').trim().replace(/\s+/g, '.')}`,
                backgroundColor,
                backgroundImage,
                opacity
              });
            }
          }
          return {
            selector,
            tag: element?.tagName.toLowerCase() || null,
            role: element?.getAttribute('role') || null,
            tabindex: element?.getAttribute('tabindex') || null,
            className: typeof element?.className === 'string' ? element.className : null,
            html: element?.outerHTML?.slice(0, 1200) || node.html || '',
            width: rect ? Math.round(rect.width * 10) / 10 : null,
            height: rect ? Math.round(rect.height * 10) / 10 : null,
            fontSize: style?.fontSize || null,
            fontWeight: style?.fontWeight || null,
            color: style?.color || null,
            fill: element?.namespaceURI === 'http://www.w3.org/2000/svg' ? style?.fill || null : null,
            backgroundColor: style?.backgroundColor || null,
            backgroundImage: style?.backgroundImage || null,
            opacity: style?.opacity || null,
            backgroundStack,
            failureSummary: node.failureSummary || '',
            checks: [...(node.any || []), ...(node.all || []), ...(node.none || [])].map(check => ({
              id: check.id,
              message: check.message,
              impact: check.impact,
              data: check.data
            }))
          };
        });
        return {
          id: result.id,
          count: result.nodes.length,
          reasons: [...reasonCounts].map(([reason, count]) => ({ reason, count })),
          examples
        };
      });
    return { violations: resolvedViolations, visualReviews };
  }, { scopeSelector: scope, tags: WCAG_22_AA_TAGS });
  return result;
}

test('workspace picker supports keyboard selection and exposes an active option', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');

  const dropZoneRadii = await page.locator('#welcomeFileDropZone').evaluate(node => {
    const style = getComputedStyle(node);
    return [style.borderTopLeftRadius, style.borderTopRightRadius,
      style.borderBottomRightRadius, style.borderBottomLeftRadius];
  });
  expect(dropZoneRadii).toEqual(['5px', '5px', '5px', '5px']);

  const search = page.locator('#welcomeGraphSearch');
  await expect(search).toHaveAttribute('role', 'combobox');
  await expect(search).toHaveAccessibleName('Find a graph type');
  await search.fill('heatmap');
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await search.press('ArrowDown');

  const activeId = await search.getAttribute('aria-activedescendant');
  expect(activeId).toBeTruthy();
  const activeOption = page.locator(`#${activeId}`);
  await expect(activeOption).toHaveAttribute('role', 'option');
  await expect(activeOption).toHaveAttribute('aria-selected', 'true');
  await search.press('Enter');
  await expect(page.locator('#heatmapPage')).toBeVisible();
});

test('native select picker keeps theme styling and keyboard selection', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });

  const select = page.locator('#scatterPage:not([hidden]) #scatterGraphType');
  await expect(select).toBeVisible();
  const closedStyle = await select.evaluate(node => {
    const style = getComputedStyle(node);
    const picker = getComputedStyle(node, '::picker(select)');
    const selectedOption = node.querySelector('option:checked');
    const expectedOption = document.createElement('span');
    expectedOption.style.backgroundColor = 'var(--ui-menu-item-hover-bg)';
    expectedOption.style.color = 'var(--gt-ink)';
    document.body.append(expectedOption);
    const expectedOptionStyle = getComputedStyle(expectedOption);
    const optionColors = selectedOption ? {
      backgroundColor: getComputedStyle(selectedOption).backgroundColor,
      color: getComputedStyle(selectedOption).color
    } : null;
    const expectedOptionColors = {
      backgroundColor: expectedOptionStyle.backgroundColor,
      color: expectedOptionStyle.color
    };
    expectedOption.remove();
    const heatmapPage = document.getElementById('heatmapPage');
    const heatmapLowerPanel = document.createElement('div');
    heatmapLowerPanel.className = 'heatmap-lower-panels';
    const heatmapSelectProbe = document.createElement('select');
    heatmapLowerPanel.appendChild(heatmapSelectProbe);
    heatmapPage.appendChild(heatmapLowerPanel);
    const heatmapBackgroundImage = getComputedStyle(heatmapSelectProbe).backgroundImage;
    heatmapLowerPanel.remove();
    return {
      supportsBaseSelect: CSS.supports('appearance', 'base-select'),
      appearance: style.appearance,
      backgroundImage: style.backgroundImage,
      heatmapBackgroundImage,
      optionColors,
      expectedOptionColors,
      picker: {
        borderTopWidth: picker.borderTopWidth,
        borderTopStyle: picker.borderTopStyle,
        borderTopColor: picker.borderTopColor,
        borderRadius: picker.borderRadius,
        backgroundColor: picker.backgroundColor,
        color: picker.color,
        boxShadow: picker.boxShadow
      }
    };
  });

  if (closedStyle.supportsBaseSelect) {
    expect(closedStyle.appearance).toBe('base-select');
    expect(closedStyle.backgroundImage).toBe('none');
    expect(closedStyle.heatmapBackgroundImage).toBe('none');
    expect(closedStyle.optionColors).toEqual(closedStyle.expectedOptionColors);
    expect(closedStyle.picker).toMatchObject({
      borderTopWidth: '1px',
      borderTopStyle: 'solid',
      borderRadius: '5px',
      backgroundColor: 'rgb(255, 255, 255)',
      color: 'rgb(15, 27, 42)'
    });
    expect(closedStyle.picker.boxShadow).not.toBe('none');
  }

  await select.click();
  if (closedStyle.supportsBaseSelect) {
    await expect.poll(() => select.evaluate(node => node.matches(':open'))).toBe(true);
    await select.press('Escape');
    await expect.poll(() => select.evaluate(node => node.matches(':open'))).toBe(false);
  }

  await select.focus();
  await page.keyboard.press('Enter');
  if (closedStyle.supportsBaseSelect) {
    await expect.poll(() => select.evaluate(node => node.matches(':open'))).toBe(true);
  }
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(select).toHaveValue('volcano');
  if (closedStyle.supportsBaseSelect) {
    await expect.poll(() => select.evaluate(node => node.matches(':open'))).toBe(false);
  }

  const keyboardFocus = await select.evaluate(node => ({
    modality: window.Shared.focusModality.getCurrentModality(),
    focusVisible: node.matches(':focus-visible'),
    outline: getComputedStyle(node).outlineStyle
  }));
  expect(keyboardFocus.modality).toBe('keyboard');
  expect(keyboardFocus.focusVisible).toBe(true);
  expect(keyboardFocus.outline).toBe('solid');
});

test('pointer clicks do not leave control rings while keyboard focus stays visible', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const numericSearch = page.locator('#welcomeGraphSearch');
  await expect(numericSearch).toBeVisible();
  const searchResting = await numericSearch.evaluate(node => {
    node.blur();
    const style = getComputedStyle(node);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      borderColor: style.borderColor,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth
    };
  });
  await numericSearch.click();
  await numericSearch.click();
  const searchFocus = await numericSearch.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      modality: window.Shared.focusModality.getCurrentModality(),
      focusOutlineToken: getComputedStyle(document.documentElement).getPropertyValue('--ui-focus-outline').trim(),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      borderColor: style.borderColor,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth
    };
  });
  expect(searchFocus.modality).toBe('pointer');
  expect(searchFocus.focusOutlineToken).toBe('none');
  expect({
    outlineStyle: searchFocus.outlineStyle,
    outlineWidth: searchFocus.outlineWidth,
    boxShadow: searchFocus.boxShadow,
    borderColor: searchFocus.borderColor,
    borderStyle: searchFocus.borderStyle,
    borderWidth: searchFocus.borderWidth
  }).toEqual(searchResting);

  await page.keyboard.press('Tab');
  await numericSearch.focus();
  const welcomeKeyboardFocus = await numericSearch.evaluate(node => ({
    focusVisible: node.matches(':focus-visible'),
    modality: window.Shared.focusModality.getCurrentModality(),
    outlineStyle: getComputedStyle(node).outlineStyle,
    outlineWidth: getComputedStyle(node).outlineWidth,
    outlineColor: getComputedStyle(node).outlineColor,
    outlineOffset: getComputedStyle(node).outlineOffset,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--gt-accent').trim()
  }));
  expect(welcomeKeyboardFocus.focusVisible).toBe(true);
  expect(welcomeKeyboardFocus.modality).toBe('keyboard');
  expect(welcomeKeyboardFocus.outlineStyle).toBe('solid');
  expect(welcomeKeyboardFocus.outlineWidth).toBe('2px');
  expect(welcomeKeyboardFocus.outlineOffset).toBe('2px');
  expect(parseColor(welcomeKeyboardFocus.outlineColor)).toEqual(parseColor(welcomeKeyboardFocus.accent));

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });

  const viewMode = page.locator('#scatterViewMode');
  await expect(viewMode).toBeVisible();
  await viewMode.click();
  await viewMode.click();
  const selectFocus = await viewMode.evaluate(node => ({
    focused: document.activeElement === node,
    focusVisible: node.matches(':focus-visible'),
    outline: getComputedStyle(node).outlineStyle,
    boxShadow: getComputedStyle(node).boxShadow
  }));

  const gridToggle = page.locator('#scatterShowGrid');
  const gridToggleInitiallyChecked = await gridToggle.isChecked();
  await gridToggle.click();
  await gridToggle.click();
  await expect(gridToggle).toHaveJSProperty('checked', gridToggleInitiallyChecked);
  const checkboxFocus = await gridToggle.evaluate(node => ({
    focused: document.activeElement === node,
    focusVisible: node.matches(':focus-visible'),
    outline: getComputedStyle(node).outlineStyle,
    boxShadow: getComputedStyle(node).boxShadow
  }));

  expect(selectFocus.focused).toBe(true);
  expect(selectFocus.focusVisible).toBe(false);
  expect(selectFocus.outline).toBe('none');
  expect(selectFocus.boxShadow).toBe('none');
  expect(checkboxFocus.focused).toBe(true);
  expect(checkboxFocus.focusVisible).toBe(false);
  expect(checkboxFocus.outline).toBe('none');
  expect(checkboxFocus.boxShadow).toBe('none');

  const agGridCheckbox = page.locator('.ag-theme-balham .ag-center-cols-container .ag-row:not(.ag-row-pinned) input.ag-checkbox-input').first();
  await expect(agGridCheckbox).toBeVisible();
  await agGridCheckbox.click();
  const agGridCheckboxFocus = await agGridCheckbox.evaluate(node => {
    const wrapper = node.closest('.ag-checkbox-input-wrapper');
    const style = getComputedStyle(wrapper);
    return {
      modality: window.Shared.focusModality.getCurrentModality(),
      outline: style.outlineStyle,
      boxShadow: style.boxShadow
    };
  });
  expect(agGridCheckboxFocus.modality).toBe('pointer');
  expect(agGridCheckboxFocus.outline).toBe('none');
  expect(agGridCheckboxFocus.boxShadow).toBe('none');

  await agGridCheckbox.press('Space');
  const keyboardAgGridCheckboxFocus = await agGridCheckbox.evaluate(node => {
    const wrapper = node.closest('.ag-checkbox-input-wrapper');
    const style = getComputedStyle(wrapper);
    return {
      modality: window.Shared.focusModality.getCurrentModality(),
      focused: document.activeElement === node,
      outline: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--gt-accent').trim()
    };
  });
  expect(keyboardAgGridCheckboxFocus.modality).toBe('keyboard');
  expect(keyboardAgGridCheckboxFocus.focused).toBe(true);
  expect(keyboardAgGridCheckboxFocus.outline).toBe('solid');
  expect(keyboardAgGridCheckboxFocus.outlineWidth).toBe('3px');
  expect(keyboardAgGridCheckboxFocus.outlineColor).toBe('rgb(11, 110, 105)');
  expect(keyboardAgGridCheckboxFocus.boxShadow).toBe('none');

  const numericField = page.locator('#scatterXMax');
  const numericResting = await numericField.evaluate(node => {
    node.blur();
    const style = getComputedStyle(node);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      borderColor: style.borderColor,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth
    };
  });
  await numericField.click();
  await numericField.click();
  await numericField.fill('');
  await numericField.pressSequentially('-8');
  // Chromium may keep :focus-visible true after repeated mouse clicks; compare the rendered styles.
  const numericFocus = await numericField.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      focused: document.activeElement === node,
      focusVisible: node.matches(':focus-visible'),
      modality: window.Shared.focusModality.getCurrentModality(),
      outline: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      borderColor: style.borderColor,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth
    };
  });
  expect(numericFocus.focused).toBe(true);
  await expect(numericField).toHaveValue('-8');
  expect(numericFocus.modality).toBe('pointer');
  expect(numericFocus.outline).toBe('none');
  expect(numericFocus.boxShadow).toBe('none');
  expect({
    outlineStyle: numericFocus.outline,
    outlineWidth: numericFocus.outlineWidth,
    boxShadow: numericFocus.boxShadow,
    borderColor: numericFocus.borderColor,
    borderStyle: numericFocus.borderStyle,
    borderWidth: numericFocus.borderWidth
  }).toEqual(numericResting);
  await numericField.press('ArrowUp');
  await expect.poll(() => numericField.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('none');

  await page.locator('#scatterGraphType').focus();
  await page.keyboard.press('Tab');
  const keyboardFocus = await viewMode.evaluate(node => ({
    focused: document.activeElement === node,
    focusVisible: node.matches(':focus-visible'),
    focusOutlineToken: getComputedStyle(document.documentElement).getPropertyValue('--ui-focus-outline').trim(),
    outlineWidth: getComputedStyle(node).outlineWidth
  }));
  expect(keyboardFocus.focused).toBe(true);
  expect(keyboardFocus.focusVisible).toBe(true);
  expect(keyboardFocus.focusOutlineToken).not.toBe('none');
  expect(Number.parseFloat(keyboardFocus.outlineWidth)).toBeGreaterThan(0);
});

test('custom formula editor focus follows its pointer or keyboard opener', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await activateToolbarSection(page, 'scatter', 'Data');

  const trigger = page.locator('#scatterTransformCustom');
  const editor = page.locator('#scatterTransformCustomExpr');
  const close = page.locator('#scatterTransformCustomClose');
  await trigger.click();
  await expect(editor).toBeFocused();
  const pointerFocus = await editor.evaluate(node => {
    const appearance = [];
    for (let current = node; current && current !== document.body; current = current.parentElement) {
      const style = getComputedStyle(current);
      appearance.push({
        id: current.id,
        className: typeof current.className === 'string' ? current.className : '',
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth
      });
    }
    return {
      focusVisible: node.matches(':focus-visible'),
      modality: window.Shared.focusModality.getCurrentModality(),
      appearance
    };
  });
  expect(pointerFocus.focusVisible).toBe(true);
  expect(pointerFocus.modality).toBe('pointer');
  await editor.evaluate(node => node.blur());
  const restingAppearance = await editor.evaluate(node => {
    const appearance = [];
    for (let current = node; current && current !== document.body; current = current.parentElement) {
      const style = getComputedStyle(current);
      appearance.push({
        id: current.id,
        className: typeof current.className === 'string' ? current.className : '',
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth
      });
    }
    return appearance;
  });
  expect(pointerFocus.appearance).toEqual(restingAppearance);
  await editor.press('x');
  const typedPointerFocus = await editor.evaluate(node => {
    const appearance = [];
    for (let current = node; current && current !== document.body; current = current.parentElement) {
      const style = getComputedStyle(current);
      appearance.push({
        id: current.id,
        className: typeof current.className === 'string' ? current.className : '',
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth
      });
    }
    return {
      modality: window.Shared.focusModality.getCurrentModality(),
      appearance
    };
  });
  expect(typedPointerFocus.modality).toBe('pointer');
  expect(typedPointerFocus.appearance).toEqual(restingAppearance);

  await close.click();
  await trigger.focus();
  await trigger.press('Enter');
  await expect(editor).toBeFocused();
  const keyboardFocus = await editor.evaluate(node => ({
    focusVisible: node.matches(':focus-visible'),
    modality: window.Shared.focusModality.getCurrentModality(),
    outline: getComputedStyle(node).outlineStyle,
    outlineWidth: getComputedStyle(node).outlineWidth
  }));
  expect(keyboardFocus.focusVisible).toBe(true);
  expect(keyboardFocus.modality).toBe('keyboard');
  expect(keyboardFocus.outline).toBe('solid');
  expect(Number.parseFloat(keyboardFocus.outlineWidth)).toBeGreaterThan(0);
});

test('pointer-focused value controls stay ring-free across all graph workspaces', async ({ page }) => {
  test.setTimeout(360_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');
  await page.addStyleTag({ content: `
    #appShell *,
    #appShell *::before,
    #appShell *::after {
      transition: none !important;
    }
  ` });

  for (let index = 0; index < COMPONENT_CATALOG.length; index += 1) {
    const component = COMPONENT_CATALOG[index];
    let componentValueFieldsTested = 0;
    await openComponentFromWelcome(page, component, { first: index === 0, loadExample: true });
    const sections = await page.locator(`#${component.pageId}:not([hidden]) .workspace-page__topbar[data-toolbar] .workspace-toolbar__tab[data-toolbar-section-target]`)
      .evaluateAll(tabs => tabs.map(tab => String(tab.textContent || '').trim()).filter(Boolean));
    for (const section of sections) {
      await activateToolbarSection(page, component, section);
      const result = await page.locator(`#${component.pageId}:not([hidden])`)
        .evaluate(root => {
          const controls = Array.from(root.querySelectorAll('input:not([type="hidden"]), textarea, select, [contenteditable="true"]'))
            .filter(control => {
              if (control.disabled || control.closest('.ag-theme-balham, [hidden], [inert]')) return false;
              const style = getComputedStyle(control);
              const rect = control.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden'
                && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
            });
          document.activeElement?.blur();
          const fingerprint = node => {
            const style = getComputedStyle(node);
            return {
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              outlineColor: style.outlineColor,
              outlineOffset: style.outlineOffset,
              boxShadow: style.boxShadow,
              borderColor: style.borderColor,
              borderStyle: style.borderStyle,
              borderWidth: style.borderWidth
            };
          };
          const baseline = new Map();
          controls.forEach(control => {
            for (let node = control; node && node !== root.parentElement; node = node.parentElement) {
              if (!baseline.has(node)) baseline.set(node, fingerprint(node));
            }
          });
          const checks = controls.flatMap(control => {
            control.focus();
            const changed = [];
            for (let node = control; node && node !== root.parentElement; node = node.parentElement) {
              const before = baseline.get(node);
              const after = fingerprint(node);
              if (after.outlineStyle !== before.outlineStyle
                || after.outlineWidth !== before.outlineWidth
                || after.outlineColor !== before.outlineColor
                || after.outlineOffset !== before.outlineOffset
                || after.boxShadow !== before.boxShadow
                || after.borderColor !== before.borderColor
                || after.borderStyle !== before.borderStyle
                || after.borderWidth !== before.borderWidth) {
                changed.push({
                  id: node.id || '',
                  className: typeof node.className === 'string' ? node.className : '',
                  before,
                  after
                });
              }
            }
            return changed.map(change => ({
              controlId: control.id || '',
              type: control.type || control.tagName.toLowerCase(),
              focusVisible: control.matches(':focus-visible'),
              ...change
            }));
          });
          return {
            modality: window.Shared.focusModality.getCurrentModality(),
            controls: checks
          };
        });

      expect(result.modality, `${component.type} ${section} pointer modality`).toBe('pointer');
      expect(result.controls, `${component.type} ${section} pointer focus appearance`).toEqual([]);

      const valueFields = page.locator(`#${component.pageId}:not([hidden]) input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]), #${component.pageId}:not([hidden]) textarea, #${component.pageId}:not([hidden]) [contenteditable="true"]`);
      const valueFieldIndexes = await valueFields.evaluateAll(nodes => {
        return nodes.flatMap((node, index) => {
          const style = getComputedStyle(node);
          if (node.disabled || node.readOnly || node.closest('.ag-theme-balham, [hidden], [inert]')
            || style.display === 'none' || style.visibility === 'hidden'
            || Number(style.opacity) <= 0 || node.getBoundingClientRect().width <= 0 || node.getBoundingClientRect().height <= 0) return [];
          return [index];
        });
      });
      for (const fieldIndex of valueFieldIndexes) {
        const field = valueFields.nth(fieldIndex);
        if (!await field.isVisible()) continue;
        const eligible = await field.evaluate(node => !node.disabled && !node.readOnly && !node.closest('.ag-theme-balham, [hidden], [inert]'));
        expect(eligible, `${component.type} ${section} editable value field ${fieldIndex}`).toBe(true);
        await field.scrollIntoViewIfNeeded();
        const receivesPointer = await field.evaluate(node => {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return hit === node || node.contains(hit);
        });
        if (!receivesPointer) continue;
        const resting = await field.evaluate(node => {
          node.blur();
          const fingerprint = element => {
            const style = getComputedStyle(element);
            return {
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              outlineColor: style.outlineColor,
              outlineOffset: style.outlineOffset,
              boxShadow: style.boxShadow,
              borderColor: style.borderColor,
              borderStyle: style.borderStyle,
              borderWidth: style.borderWidth
            };
          };
          const chain = [];
          for (let current = node; current && current !== document.body; current = current.parentElement) {
            chain.push({ element: current, style: fingerprint(current) });
          }
          return chain.map(({ element, style }) => ({
            key: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${typeof element.className === 'string' ? element.className.trim().replace(/\\s+/g, '.') : ''}`,
            style
          }));
        });
        await field.click({ timeout: 5_000 });
        await field.click({ timeout: 5_000 });
        const focused = await field.evaluate(node => {
          const fingerprint = element => {
            const style = getComputedStyle(element);
            return {
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              outlineColor: style.outlineColor,
              outlineOffset: style.outlineOffset,
              boxShadow: style.boxShadow,
              borderColor: style.borderColor,
              borderStyle: style.borderStyle,
              borderWidth: style.borderWidth
            };
          };
          const chain = [];
          for (let current = node; current && current !== document.body; current = current.parentElement) {
            chain.push({ element: current, style: fingerprint(current) });
          }
          return {
            active: document.activeElement === node,
            modality: window.Shared.focusModality.getCurrentModality(),
            chain: chain.map(({ element, style }) => ({
              key: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${typeof element.className === 'string' ? element.className.trim().replace(/\\s+/g, '.') : ''}`,
              style
            }))
          };
        });
        const changed = resting.flatMap((entry, chainIndex) => {
          const after = focused.chain[chainIndex];
          return after && after.key === entry.key && JSON.stringify(after.style) !== JSON.stringify(entry.style)
            ? [{ element: entry.key, before: entry.style, after: after.style }]
            : [];
        });
        expect(focused.active, `${component.type} ${section} value field ${fieldIndex} receives pointer focus`).toBe(true);
        expect(focused.modality, `${component.type} ${section} value field ${fieldIndex} sets pointer modality`).toBe('pointer');
        expect(changed, `${component.type} ${section} value field ${fieldIndex} pointer focus appearance`).toEqual([]);
        componentValueFieldsTested += 1;
      }
    }
    expect(componentValueFieldsTested, `${component.type} pointer-reachable value fields tested`).toBeGreaterThan(0);
  }

  const scatter = COMPONENT_CATALOG.find(component => component.type === 'scatter');
  await openComponentFromWelcome(page, scatter, { loadExample: true });
  const scatterRoot = `#${scatter.pageId}:not([hidden])`;
  const pointerAppearance = async locator => {
    const resting = await locator.evaluate(node => {
      node.blur();
      const style = getComputedStyle(node);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth
      };
    });
    await locator.click();
    await locator.click();
    const focused = await locator.evaluate(node => {
      const style = getComputedStyle(node);
      return {
        modality: window.Shared.focusModality.getCurrentModality(),
        focusVisible: node.matches(':focus-visible'),
        appearance: {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
          borderColor: style.borderColor,
          borderStyle: style.borderStyle,
          borderWidth: style.borderWidth
        }
      };
    });
    expect(focused.modality).toBe('pointer');
    expect(focused.appearance).toEqual(resting);
  };

  const numericValueField = page.locator(`${scatterRoot} #scatterXMax`);
  await numericValueField.fill('-8');
  await numericValueField.blur();
  await pointerAppearance(numericValueField);

  await activateToolbarSection(page, scatter, 'Data');
  await page.locator(`${scatterRoot} .workspace-toolbar__button[data-transform-option="custom"]`).click();
  const formulaValueField = page.locator(`${scatterRoot} input[data-transform-custom-input="1"]`);
  await expect(formulaValueField).toBeVisible();
  await pointerAppearance(formulaValueField);

  const notesSummary = page.locator(`${scatterRoot} details.shared-notes > summary`).first();
  await expect(notesSummary).toBeVisible();
  await notesSummary.click();
  const notesEditor = page.locator(`${scatterRoot} details.shared-notes [data-notes-editor="1"], ${scatterRoot} details.shared-notes textarea`).first();
  await expect(notesEditor).toBeVisible();
  await pointerAppearance(notesEditor);

  await notesSummary.focus();
  await page.keyboard.press('Tab');
  const keyboardNotes = await notesEditor.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      active: document.activeElement === node,
      modality: window.Shared.focusModality.getCurrentModality(),
      focusVisible: node.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth
    };
  });
  expect(keyboardNotes.active).toBe(true);
  expect(keyboardNotes.modality).toBe('keyboard');
  expect(keyboardNotes.focusVisible).toBe(true);
  expect(keyboardNotes.outlineStyle).toBe('solid');
  expect(Number.parseFloat(keyboardNotes.outlineWidth)).toBeGreaterThan(0);

  const graphZoom = page.locator(`${scatterRoot} .resizer-zoom-value`).first();
  await expect(graphZoom).toBeVisible();
  await pointerAppearance(graphZoom);

  const filterTrigger = page.locator(`${scatterRoot} .hot-header-action`).first();
  await expect(filterTrigger).toBeVisible();
  await expect(filterTrigger).toHaveAttribute('aria-expanded', 'false');
  await filterTrigger.click();
  await expect(filterTrigger).toHaveAttribute('aria-expanded', 'true');
  const filterPopup = page.locator('body > .ag-hot-filter-menu');
  await expect(filterPopup).toBeVisible();
  const filterPopupId = await filterTrigger.getAttribute('aria-controls');
  expect(filterPopupId).toBeTruthy();
  await expect(filterPopup).toHaveAttribute('id', filterPopupId);
  const filterField = filterPopup.locator('.ag-hot-filter-menu__search');
  await expect(filterField).toBeVisible();
  await pointerAppearance(filterField);
  await page.locator('body > .ag-hot-filter-menu .ag-hot-filter-menu__button', { hasText: 'Cancel' }).click();

  await filterTrigger.click();
  await expect(filterField).toBeVisible();
  await page.keyboard.press('Tab');
  await filterField.focus();
  const keyboardFilter = await filterField.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      modality: window.Shared.focusModality.getCurrentModality(),
      borderColor: style.borderColor,
      boxShadow: style.boxShadow
    };
  });
  expect(keyboardFilter.modality).toBe('keyboard');
  expect(keyboardFilter.borderColor).toBe('rgb(11, 110, 105)');
  expect(keyboardFilter.boxShadow).not.toBe('none');
  await page.locator('body > .ag-hot-filter-menu .ag-hot-filter-menu__button', { hasText: 'Cancel' }).click();
});

test('numeric AG Grid filter inputs retain styling as condition fields show and hide', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });

  const scatterRoot = '#scatterPage:not([hidden])';
  const numericHeader = page.locator(`${scatterRoot} .hot-ag-header`).filter({ hasText: /^C$/ });
  const filterTrigger = numericHeader.locator('.hot-header-action');
  await expect(filterTrigger).toBeVisible();
  await filterTrigger.click();

  const menu = page.locator('body > .ag-hot-filter-menu');
  const mode = menu.locator('.ag-hot-filter-menu__select');
  const inputs = menu.locator('.ag-hot-filter-menu__input');
  await expect(menu).toBeVisible();
  await mode.selectOption('greaterThan');
  await expect(inputs.nth(0)).toBeVisible();
  await expect(inputs.nth(1)).toBeHidden();

  const visibleStyle = await inputs.nth(0).evaluate(node => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      minHeight: style.minHeight,
      padding: style.padding,
      borderWidth: style.borderTopWidth,
      borderStyle: style.borderTopStyle,
      borderColor: style.borderTopColor,
      boxSizing: style.boxSizing,
      boxShadow: style.boxShadow,
      outline: style.outlineStyle,
      modality: window.Shared.focusModality.getCurrentModality()
    };
  });
  expect(visibleStyle).toEqual({
    display: 'block',
    minHeight: '24px',
    padding: '2px 6px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgb(127, 142, 163)',
    boxSizing: 'border-box',
    boxShadow: 'none',
    outline: 'none',
    modality: 'pointer'
  });

  await mode.selectOption('between');
  await expect(inputs.nth(0)).toBeVisible();
  await expect(inputs.nth(1)).toBeVisible();
  const pairedStyles = await inputs.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      borderColor: style.borderTopColor,
      boxShadow: style.boxShadow,
      outline: style.outlineStyle
    };
  }));
  expect(pairedStyles).toEqual([
    { display: 'block', borderColor: 'rgb(127, 142, 163)', boxShadow: 'none', outline: 'none' },
    { display: 'block', borderColor: 'rgb(127, 142, 163)', boxShadow: 'none', outline: 'none' }
  ]);
  await mode.selectOption('aboveAverage');
  await expect(inputs.nth(0)).toBeHidden();
  await expect(inputs.nth(1)).toBeHidden();
  const hiddenDisplays = await inputs.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).display));
  expect(hiddenDisplays).toEqual(['none', 'none']);

  await mode.selectOption('greaterThan');
  await page.keyboard.press('Tab');
  await inputs.nth(0).focus();
  const keyboardStyle = await inputs.nth(0).evaluate(node => {
    const style = getComputedStyle(node);
    return {
      modality: window.Shared.focusModality.getCurrentModality(),
      borderColor: style.borderTopColor,
      boxShadow: style.boxShadow
    };
  });
  expect(keyboardStyle.modality).toBe('keyboard');
  expect(keyboardStyle.borderColor).toBe('rgb(11, 110, 105)');
  expect(keyboardStyle.boxShadow).not.toBe('none');
  await menu.getByRole('button', { name: 'Cancel' }).click();
});

test('coarse-pointer workspace grids stay compact and graph resize corners meet 24px', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  try {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);

    for (let index = 0; index < COMPONENT_CATALOG.length; index += 1) {
      const component = COMPONENT_CATALOG[index];
      await openComponentFromWelcome(page, component, { first: index === 0, loadExample: true });
      const geometry = await page.locator(`#${component.pageId}:not([hidden])`)
        .evaluate(root => {
          const grid = Array.from(root.querySelectorAll('.ag-theme-balham')).find(node => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          const row = grid?.querySelector('.ag-row:not(.ag-row-pinned)');
          const rowHeight = row?.getBoundingClientRect().height || 0;
          const corner = Array.from(root.querySelectorAll('.svgbox .resizer-corner')).find(node => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          const cornerRect = corner?.getBoundingClientRect();
          return {
            configuredRowHeight: grid ? getComputedStyle(grid).getPropertyValue('--graphitix-ag-row-height').trim() : '',
            targetSizeToken: getComputedStyle(document.documentElement).getPropertyValue('--ui-target-size-minimum').trim(),
            rowHeight,
            resizerCornerTarget: cornerRect ? { width: cornerRect.width, height: cornerRect.height } : null
          };
        });

      expect(geometry.configuredRowHeight, `${component.type} compact row-height token on touch`).toBe('20px');
      expect(geometry.targetSizeToken, `${component.type} shared minimum target token`).toBe('24px');
      expect(geometry.rowHeight, `${component.type} rendered touch row height`).toBe(20);
      expect(geometry.resizerCornerTarget, `${component.type} graph corner resize target`).toEqual({ width: 24, height: 24 });
    }
  } finally {
    await context.close();
  }
});

test('workspace picker results stay inside a short phone viewport', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');

  const search = page.getByRole('combobox', { name: 'Find a graph type' });
  const results = page.getByRole('listbox', { name: 'Available graph types' });
  await search.fill('heatmap');
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await expect(results).toBeVisible();

  const bounds = await results.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);

  await page.setViewportSize({ width: 360, height: 420 });
  await expect.poll(async () => {
    const resizedBounds = await results.boundingBox();
    return !!resizedBounds
      && resizedBounds.x >= 0
      && resizedBounds.y >= 0
      && resizedBounds.x + resizedBounds.width <= 361
      && resizedBounds.y + resizedBounds.height <= 421;
  }).toBe(true);

  await results.locator('[data-variant-id="heatmap:values"]').click();
  await expect(page.locator('#heatmapPage')).toBeVisible();
});

test('workspace tabs use linked panels and manual keyboard activation', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');
  await page.evaluate(() => {
    const { session, tabs } = window.Main;
    session.workspaceState.tabs.push(session.createTab({ title: 'Keyboard tab one' }));
    session.workspaceState.tabs.push(session.createTab({ title: 'Keyboard tab two' }));
    tabs.renderTabs();
  });

  const tabList = page.getByRole('tablist', { name: 'Workspace tabs' });
  const tabs = tabList.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  const tabRadii = await tabs.first().evaluate(node => {
    const style = getComputedStyle(node);
    return [style.borderTopLeftRadius, style.borderTopRightRadius,
      style.borderBottomRightRadius, style.borderBottomLeftRadius];
  });
  expect(tabRadii).toEqual(['0px', '0px', '0px', '0px']);
  const activeBefore = await tabList.locator('[aria-selected="true"]').getAttribute('data-tab-id');
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  const focusStyle = await tabs.nth(1).evaluate(node => getComputedStyle(node).outlineStyle);
  expect(focusStyle).not.toBe('none');
  await expect(tabList.locator('[aria-selected="true"]')).toHaveAttribute('data-tab-id', activeBefore);
  await page.keyboard.press('Enter');

  const selected = tabList.locator('[aria-selected="true"]');
  await expect(selected).toHaveAttribute('data-tab-id', await tabs.nth(1).getAttribute('data-tab-id'));
  await expect(selected).toBeFocused();
  await expect(selected).toHaveAttribute('aria-controls', 'welcomeScreen');
  await expect(page.locator('#welcomeScreen')).toHaveAttribute('aria-labelledby', await selected.getAttribute('id'));
  const allPanelsExist = await tabs.evaluateAll(nodes => nodes.every(tab => document.getElementById(tab.getAttribute('aria-controls'))));
  expect(allPanelsExist).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(tabList.locator('[aria-selected="true"]')).toHaveAttribute('data-tab-id', await tabs.nth(2).getAttribute('data-tab-id'));
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('tabindex', '0');
  await expect(tabs.nth(2)).toHaveAttribute('tabindex', '-1');
  const tabShortcuts = await tabs.nth(1).getAttribute('aria-keyshortcuts');
  expect(tabShortcuts).toContain('F2');
  expect(tabShortcuts).toContain('Control+Shift+ArrowLeft');
  await expect(tabs.nth(1)).toHaveAttribute('aria-describedby', 'workspaceTabsKeyboardHint');
  await page.keyboard.press('F2');
  const renameInput = page.locator('#workspaceTabsDock > .workspace-tab__rename');
  await expect(renameInput).toBeFocused();
  await renameInput.press('Escape');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabList.locator('[aria-selected="true"]')).toHaveAttribute('data-tab-id', await tabs.nth(2).getAttribute('data-tab-id'));
});

test('forced colors retain visible keyboard focus and selected tab state', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');
  const systemColors = await page.evaluate(() => {
    const reference = document.createElement('span');
    reference.style.cssText = 'position:fixed;left:-2000px;top:0;color:CanvasText;background:Canvas;border:0;border-bottom:2px solid Highlight;outline:2px solid Highlight;outline-offset:-2px';
    document.body.appendChild(reference);
    const style = getComputedStyle(reference);
    const colors = {
      canvas: style.backgroundColor,
      canvasText: style.color,
      highlight: style.outlineColor,
      highlightBorder: style.borderBottomColor
    };
    reference.remove();
    return colors;
  });

  const welcomeSearch = page.locator('#welcomeGraphSearch');
  await welcomeSearch.fill('heatmap');
  await welcomeSearch.press('ArrowDown');
  const activeSearchOption = page.locator(`#${await welcomeSearch.getAttribute('aria-activedescendant')}`);
  await expect(activeSearchOption).toHaveAttribute('aria-selected', 'true');
  const welcomeOptionCue = await activeSearchOption.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset
    };
  });
  expect(welcomeOptionCue).toEqual({
    outlineStyle: 'solid',
    outlineColor: systemColors.highlight,
    outlineWidth: '2px',
    outlineOffset: '-2px'
  });
  await welcomeSearch.fill('');

  await page.evaluate(() => {
    const { session, tabs } = window.Main;
    session.workspaceState.tabs.push(session.createTab({ title: 'Forced colors tab' }));
    tabs.renderTabs();
  });

  const tabs = page.getByRole('tablist', { name: 'Workspace tabs' }).getByRole('tab');
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  const focusedStyles = await tabs.nth(1).evaluate(node => ({
    focusVisible: node.matches(':focus-visible'),
    outlineStyle: getComputedStyle(node).outlineStyle,
    outlineColor: getComputedStyle(node).outlineColor,
    outlineWidth: getComputedStyle(node).outlineWidth,
    outlineOffset: getComputedStyle(node).outlineOffset
  }));
  expect(focusedStyles.focusVisible).toBe(true);
  expect(focusedStyles).toMatchObject({
    outlineStyle: 'solid',
    outlineColor: systemColors.highlight,
    outlineWidth: '3px',
    outlineOffset: '2px'
  });
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('Enter');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  const selectedStyles = await tabs.nth(1).evaluate(node => {
    const style = getComputedStyle(node);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset
    };
  });
  expect(selectedStyles).toEqual({
    backgroundColor: systemColors.canvas,
    color: systemColors.canvasText,
    outlineStyle: 'solid',
    outlineColor: systemColors.highlight,
    outlineWidth: '2px',
    outlineOffset: '-2px'
  });

  const viewAll = page.locator('#welcomeViewAllExamples');
  await viewAll.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('#welcomeExamplesDialog');
  await expect(dialog).toBeVisible();
  const dialogFocus = await page.locator('#welcomeExamplesDialogClose').evaluate(node => ({
    focusVisible: node.matches(':focus-visible'),
    outlineStyle: getComputedStyle(node).outlineStyle,
    outlineColor: getComputedStyle(node).outlineColor
  }));
  expect(dialogFocus.focusVisible).toBe(true);
  expect(dialogFocus.outlineStyle).toBe('solid');
  expect(dialogFocus.outlineColor).toBe(systemColors.highlight);
});

test('forced colors distinguish selected and pressed controls across component workspaces', async ({ page }) => {
  test.setTimeout(180_000);
  await installLocalCdnOverrides(page);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const systemColors = await page.evaluate(() => {
    const reference = document.createElement('span');
    reference.style.cssText = 'position:fixed;left:-2000px;top:0;color:CanvasText;background:Canvas;border:0;border-bottom:2px solid Highlight;outline:2px solid Highlight;outline-offset:-2px';
    document.body.appendChild(reference);
    const style = getComputedStyle(reference);
    const colors = {
      canvas: style.backgroundColor,
      canvasText: style.color,
      highlight: style.outlineColor,
      highlightBorder: style.borderBottomColor
    };
    reference.remove();
    return colors;
  });

  for (let index = 0; index < COMPONENT_CATALOG.length; index += 1) {
    const component = COMPONENT_CATALOG[index];
    await openComponentFromWelcome(page, component, { first: index === 0 });
    const cues = await page.evaluate(pageId => {
      const root = document.getElementById(pageId);
      const selectedTab = root?.querySelector('.workspace-toolbar__tab[aria-selected="true"]');
      const selectedPressed = root?.querySelector('[aria-pressed="true"], [aria-checked="true"]');
      const readCue = element => {
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          outlineColor: style.outlineColor,
          outlineWidth: style.outlineWidth,
          outlineOffset: style.outlineOffset,
          backgroundColor: style.backgroundColor,
          color: style.color,
          borderBottomWidth: style.borderBottomWidth,
          borderBottomStyle: style.borderBottomStyle,
          borderBottomColor: style.borderBottomColor,
          borderTopWidth: style.borderTopWidth,
          borderRightWidth: style.borderRightWidth,
          borderLeftWidth: style.borderLeftWidth
        };
      };
      return {
        selectedTab: readCue(selectedTab),
        selectedPressed: readCue(selectedPressed)
      };
    }, component.pageId);

    expect(cues.selectedTab, `${component.type} selected workspace control`).not.toBeNull();
    expect(cues.selectedTab.backgroundColor).toBe(systemColors.canvas);
    expect(cues.selectedTab.color).toBe(systemColors.canvasText);
    expect(cues.selectedTab.borderBottomStyle).toBe('solid');
    expect(cues.selectedTab.borderBottomWidth).toBe('2px');
    expect(cues.selectedTab.borderBottomColor).toBe(systemColors.highlightBorder);
    expect(cues.selectedTab.borderTopWidth).toBe('0px');
    expect(cues.selectedTab.borderRightWidth).toBe('0px');
    expect(cues.selectedTab.borderLeftWidth).toBe('0px');
    if (cues.selectedPressed) {
      expect(cues.selectedPressed).toMatchObject({
        outlineStyle: 'solid',
        outlineColor: systemColors.highlight,
        outlineWidth: '2px',
        outlineOffset: '-2px'
      });
    }
  }

  await page.keyboard.press('Tab');
  const pointFocus = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'chart-point-navigation-root';
    probe.tabIndex = 0;
    probe.style.cssText = 'position:fixed;left:-2000px;top:0';
    document.getElementById('appShell').appendChild(probe);
    probe.focus();
    const style = getComputedStyle(probe);
    const result = {
      focusVisible: probe.matches(':focus-visible'),
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset
    };
    probe.remove();
    return result;
  });
  expect(pointFocus.focusVisible).toBe(true);
  expect(pointFocus.outlineColor).toBe(systemColors.highlight);
  expect(pointFocus.outlineWidth).toBe('3px');
  expect(pointFocus.outlineOffset).toBe('2px');
});

test('workspace toolbar menus support arrow navigation and return focus on Escape', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });

  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'workspace-page__topbar';
    host.dataset.toolbar = 'e2e-keyboard-menu';
    document.querySelector('#linePage:not([hidden])')?.appendChild(host);
    window.Shared.workspaceToolbar.register('e2e-keyboard-menu', {
      ariaLabel: 'Keyboard menu test actions',
      sections: [{
        type: 'buttons',
        caption: 'Menu keyboard test',
        buttons: [{
          id: 'e2eKeyboardMenuTrigger',
          label: 'Actions',
          icon: 'open',
          menuItems: [
            { id: 'e2eKeyboardMenuFirst', label: 'First action' },
            { id: 'e2eKeyboardMenuSecond', label: 'Second action' },
            { id: 'e2eKeyboardMenuThird', label: 'Third action' }
          ]
        }]
      }]
    });
    window.Shared.workspaceToolbar.renderForElement(host);
    const outsideButton = document.createElement('button');
    outsideButton.id = 'e2eKeyboardMenuOutside';
    outsideButton.type = 'button';
    outsideButton.textContent = 'Outside menu';
    host.appendChild(outsideButton);
  });

  const trigger = page.locator('#linePage:not([hidden]) #e2eKeyboardMenuTrigger');
  const menu = page.locator('#e2eKeyboardMenuTriggerMenu');
  const items = menu.getByRole('menuitem');
  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(items.nth(0)).toBeFocused();
  await expectTargetsAtLeast24(items, 'workspace toolbar menu');

  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.nth(2)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.nth(2)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();

  await trigger.press('ArrowUp');
  await expect(items.nth(2)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();

  await trigger.press('Space');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('Escape');
  await trigger.press('Enter');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('Escape');

  await trigger.click();
  await expect(items.nth(0)).toBeFocused();
  const outsideButton = page.locator('#e2eKeyboardMenuOutside');
  await outsideButton.click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(outsideButton).toBeFocused();
});

test('welcome carousel remains readable on phones and follows reduced motion', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');

  const themeColors = await page.evaluate(async () => {
    const manifest = await fetch('manifest.webmanifest').then(response => response.json());
    return {
      document: document.querySelector('meta[name="theme-color"]')?.content,
      manifest: manifest.theme_color
    };
  });
  expect(themeColors.document).toBe(themeColors.manifest);

  const measurements = await page.evaluate(() => {
    const list = document.querySelector('.welcome-popular__grid');
    const firstCard = list?.querySelector('.welcome-example-item');
    const next = document.querySelector('#welcomePopularExamplesNext');
    const nextBox = next?.getBoundingClientRect();
    return {
      cardWidth: firstCard?.getBoundingClientRect().width || 0,
      listOverflows: !!list && list.scrollWidth > list.clientWidth,
      scrollBehavior: list ? getComputedStyle(list).scrollBehavior : '',
      nextTarget: nextBox ? { width: nextBox.width, height: nextBox.height } : null,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    };
  });
  expect(measurements.cardWidth).toBeGreaterThanOrEqual(200);
  expect(measurements.listOverflows).toBe(true);
  expect(measurements.scrollBehavior).toBe('auto');
  expect(measurements.nextTarget.width).toBeGreaterThanOrEqual(24);
  expect(measurements.nextTarget.height).toBeGreaterThanOrEqual(24);
  expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);

  const list = page.locator('.welcome-popular__grid');
  await list.evaluate(node => node.dispatchEvent(new WheelEvent('wheel', {
    deltaY: 140,
    bubbles: true,
    cancelable: true
  })));
  await expect.poll(() => list.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await expect(list).not.toHaveClass(/is-wheel-scrolling/);
  await page.setViewportSize({ width: 320, height: 700 });
  const narrowMeasurements = await page.evaluate(() => ({
    cardWidth: document.querySelector('.welcome-example-item')?.getBoundingClientRect().width || 0,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  expect(narrowMeasurements.cardWidth).toBeGreaterThanOrEqual(176);
  expect(narrowMeasurements.documentWidth).toBeLessThanOrEqual(narrowMeasurements.viewportWidth);
});

test('WCAG text spacing keeps dialogs and component controls inside narrow viewports', async ({ page }) => {
  test.setTimeout(180_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');
  await page.addStyleTag({ content: WCAG_TEXT_SPACING_STYLE });

  await page.locator('#welcomeViewAllExamples').click();
  const gallery = page.getByRole('dialog', { name: 'Explore Graphitix examples' });
  await expect(gallery).toBeVisible();
  const galleryBounds = await page.evaluate(() => {
    const panel = document.querySelector('.welcome-dialog__panel').getBoundingClientRect();
    return { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, width: innerWidth, height: innerHeight };
  });
  expect(galleryBounds.left).toBeGreaterThanOrEqual(0);
  expect(galleryBounds.right).toBeLessThanOrEqual(galleryBounds.width);
  expect(galleryBounds.top).toBeGreaterThanOrEqual(0);
  expect(galleryBounds.bottom).toBeLessThanOrEqual(galleryBounds.height);
  await page.keyboard.press('Escape');
  await expect(gallery).toBeHidden();

  await page.locator('#welcomeGraphFileInput').setInputFiles({
    name: 'text-spacing-import.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Label,Value\nA,1\n')
  });
  const importDialog = page.getByRole('dialog', { name: 'Import data file' });
  await expect(importDialog).toBeVisible();
  const importLayout = await importDialog.locator('.workspace-modal__panel').evaluate(panel => {
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  expect(importLayout.left).toBeGreaterThanOrEqual(0);
  expect(importLayout.right).toBeLessThanOrEqual(importLayout.width);
  expect(importLayout.top).toBeGreaterThanOrEqual(0);
  expect(importLayout.bottom).toBeLessThanOrEqual(importLayout.height);
  await expect(page.locator('#welcomeDataImportCancel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(importDialog).toBeHidden();

  await page.setViewportSize({ width: 320, height: 700 });
  for (let index = 0; index < COMPONENT_CATALOG.length; index += 1) {
    const component = COMPONENT_CATALOG[index];
    await openComponentFromWelcome(page, component, { first: index === 0 });
    const layout = await page.evaluate(pageId => {
      const root = document.getElementById(pageId);
      const actions = Array.from(root.querySelectorAll('button, input, select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="switch"]'))
        .filter(element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        });
      const clippedActions = actions.filter(element => {
        const rect = element.getBoundingClientRect();
        const hasHorizontalScrollOwner = Array.from((function* ancestors(){
          for(let node = element.parentElement; node && node !== root; node = node.parentElement) yield node;
        })()).some(parent => {
          const style = getComputedStyle(parent);
          return ['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth;
        });
        return !hasHorizontalScrollOwner && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map(element => ({
        tag: element.tagName.toLowerCase(),
        id: element.id || '',
        className: typeof element.className === 'string' ? element.className : '',
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right)
      }));
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        visibleActions: actions.length,
        clippedActions
      };
    }, component.pageId);
    expect(layout.documentWidth, `${component.type} document horizontal overflow`).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.visibleActions, `${component.type} visible interactive controls`).toBeGreaterThan(0);
    expect(layout.clippedActions, `${component.type} clipped controls at WCAG text spacing`).toEqual([]);
  }
});

test('visible workspace controls pass checks with compact AG Grid rows', async ({ page }) => {
  test.setTimeout(240_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });

  const failures = [];
  const visualReviews = [];
  const pointerTargetFailures = [];
  const welcomeAudit = await scanVisibleAccessibility(page, '#workspaceMain');
  if (welcomeAudit.violations.length) failures.push({ screen: 'welcome', violations: welcomeAudit.violations });
  if (welcomeAudit.visualReviews.length) visualReviews.push({ screen: 'welcome', rules: welcomeAudit.visualReviews });
  const welcomeTargets = await inspectPointerTargetSizes(page, '#workspaceMain');
  if (welcomeTargets.undersized.length) pointerTargetFailures.push({ screen: 'welcome', targets: welcomeTargets.undersized });
  let pointerTargetCount = welcomeTargets.targetCount;

  const requestedTypes = String(process.env.A11Y_SCAN_COMPONENTS || '').split(',').map(type => type.trim()).filter(Boolean);
  const components = requestedTypes.length
    ? COMPONENT_CATALOG.filter(component => requestedTypes.includes(component.type))
    : COMPONENT_CATALOG;
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    await openComponentFromWelcome(page, component, { first: index === 0 });
    await expect(page.getByRole('grid', { name: GRID_ACCESSIBLE_NAMES[component.type] }))
      .toBeVisible({ timeout: 15_000 });
    await waitForComponentOwnerReady(page, component, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    const statsPanelId = STATS_PANEL_IDS[component.type];
    if (statsPanelId) {
      const statsFieldsetRadii = await page.evaluate((panelId) => {
        const panel = document.getElementById(panelId);
        if (!panel) return null;
        const expectedRadiusProbe = document.createElement('div');
        expectedRadiusProbe.style.borderRadius = 'var(--ui-rounded-radius)';
        document.body.append(expectedRadiusProbe);
        const expectedRadius = getComputedStyle(expectedRadiusProbe).borderRadius;
        expectedRadiusProbe.remove();
        return {
          expectedRadius,
          actualRadii: Array.from(panel.children)
            .filter(element => element.tagName === 'FIELDSET')
            .map(element => getComputedStyle(element).borderRadius)
        };
      }, statsPanelId);
      expect(statsFieldsetRadii, `${component.type} statistics panel is mounted`).not.toBeNull();
      expect(statsFieldsetRadii.actualRadii, `${component.type} statistics fieldsets are present`).not.toHaveLength(0);
      expect(statsFieldsetRadii.actualRadii, `${component.type} statistics fieldsets use the shared radius`)
        .toEqual(statsFieldsetRadii.actualRadii.map(() => statsFieldsetRadii.expectedRadius));
    }
    const audit = await scanVisibleAccessibility(page, '#workspaceMain');
    if (audit.violations.length) failures.push({ screen: component.type, violations: audit.violations });
    if (audit.visualReviews.length) visualReviews.push({ screen: component.type, rules: audit.visualReviews });
    const targets = await inspectPointerTargetSizes(page, '#workspaceMain');
    pointerTargetCount += targets.targetCount;
    if (targets.undersized.length) pointerTargetFailures.push({ screen: component.type, targets: targets.undersized });
    const gridGeometry = await page.evaluate(() => {
      const grid = Array.from(document.querySelectorAll('.ag-theme-balham')).find(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!grid) return null;
      const renderedRowHeights = Array.from(grid.querySelectorAll('.ag-row'))
        .map(element => element.getBoundingClientRect().height)
        .filter(height => height > 0)
        .map(height => Math.round(height * 10) / 10);
      const misalignedHeaderActions = Array.from(grid.querySelectorAll('.hot-header-action')).flatMap(element => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return [];
        const cell = element.closest('.ag-header-cell');
        if (!cell) return [{ reason: 'missing header cell' }];
        const cellRect = cell.getBoundingClientRect();
        const topOffset = rect.top - cellRect.top;
        const bottomOffset = cellRect.bottom - rect.bottom;
        if (Math.abs(topOffset) <= 0.5 && Math.abs(bottomOffset) <= 0.5) return [];
        return [{
          height: Math.round(rect.height * 10) / 10,
          cellHeight: Math.round(cellRect.height * 10) / 10,
          topOffset: Math.round(topOffset * 10) / 10,
          bottomOffset: Math.round(bottomOffset * 10) / 10
        }];
      });
      const headerActionBorders = Array.from(grid.querySelectorAll('.hot-header-action')).flatMap(element => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return [];
        const style = getComputedStyle(element);
        const sides = ['Top', 'Right', 'Bottom', 'Left'];
        return [{
          widths: sides.map(side => style[`border${side}Width`]),
          styles: sides.map(side => style[`border${side}Style`])
        }];
      });
      return {
        configuredRowHeight: getComputedStyle(grid).getPropertyValue('--graphitix-ag-row-height').trim(),
        headerHeight: grid.querySelector('.ag-header')?.getBoundingClientRect().height || 0,
        headerBottomBorder: (() => {
          const style = getComputedStyle(grid.querySelector('.ag-header'));
          return { width: style.borderBottomWidth, style: style.borderBottomStyle };
        })(),
        renderedRowHeights,
        misalignedHeaderActions,
        headerActionBorders
      };
    });
    expect(gridGeometry, `${component.type} exposes a mounted AG Grid`).not.toBeNull();
    expect(gridGeometry.configuredRowHeight, `${component.type} preserves the single compact grid layout`).toBe('20px');
    expect(gridGeometry.headerHeight, `${component.type} header matches the 20px compact row`).toBe(20);
    expect(gridGeometry.headerBottomBorder, `${component.type} keeps the visible AG Grid header separator`)
      .toEqual({ width: '1px', style: 'solid' });
    expect(gridGeometry.renderedRowHeights, `${component.type} rendered rows use the compact height`).toEqual(
      gridGeometry.renderedRowHeights.map(() => 20)
    );
    expect(gridGeometry.misalignedHeaderActions, `${component.type} header actions fill the header-cell height`).toEqual([]);
    expect(gridGeometry.headerActionBorders, `${component.type} has a visible column-filter action`).not.toHaveLength(0);
    for (const border of gridGeometry.headerActionBorders) {
      expect(border.widths, `${component.type} filter actions show only a leading divider`).toEqual(['0px', '0px', '0px', '1px']);
      expect(border.styles, `${component.type} filter action divider is solid`).toEqual(['none', 'none', 'none', 'solid']);
    }
  }

  await test.info().attach('compact-grid-target-debt.json', {
    body: JSON.stringify(pointerTargetFailures.flatMap(({ screen, targets }) => targets
      .filter(target => target.exception === 'compact-ag-grid-row-checkbox' && target.overlapsOnlyCompactGridRowCheckboxes)
      .map(target => ({ screen, ...target }))), null, 2),
    contentType: 'application/json'
  });
  await test.info().attach('axe-visual-manual-review.json', {
    body: JSON.stringify(visualReviews, null, 2),
    contentType: 'application/json'
  });
  const contrastReview = reviewIncompleteContrast(visualReviews);
  await test.info().attach('axe-computed-contrast-review.json', {
    body: JSON.stringify(contrastReview, null, 2),
    contentType: 'application/json'
  });
  expect(contrastReview.unresolved, 'contrast review needs a solid foreground/background pair').toEqual([]);
  expect(contrastReview.failures, 'reviewed contrast colors must meet the normal-text 4.5:1 ratio').toEqual([]);
  expect(contrastReview.iconFailures, 'decorative SVG select carets must meet the 3:1 non-text contrast ratio').toEqual([]);
  console.log(`Computed contrast review: ${contrastReview.reviewed} text nodes (min ${contrastReview.minimumRatio}:1); ${contrastReview.iconsReviewed} embedded icons.`);
  console.log(`Semantic pointer-target review: ${pointerTargetCount} controls across Welcome and ${components.length} workspaces.`);
  const compactGridTargetDebt = [];
  const unexpectedTargetDebt = [];
  for (const finding of pointerTargetFailures) {
    for (const target of finding.targets) {
      const isDocumentedCompactGridDebt = target.exception === 'compact-ag-grid-row-checkbox'
        && target.overlapsOnlyCompactGridRowCheckboxes;
      (isDocumentedCompactGridDebt ? compactGridTargetDebt : unexpectedTargetDebt).push({ screen: finding.screen, ...target });
    }
  }
  console.log(`Tracked compact-grid target debt: ${compactGridTargetDebt.length} visible row checkboxes.`);
  expect(unexpectedTargetDebt, 'controls outside the tracked compact-grid debt must meet the 24×24px target policy').toEqual([]);
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});
