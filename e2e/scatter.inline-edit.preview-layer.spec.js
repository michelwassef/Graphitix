const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function ensureScatterExampleLoaded(page) {
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.evaluate(() => {
    const button = document.getElementById('scatterLoadExample');
    if (button && typeof button.click === 'function') {
      button.click();
    }
  });
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll('#scatterSvg text[data-font-key="graphTitle"]');
    if (!nodes || nodes.length < 1) { return false; }
    const first = nodes[0];
    const text = String(first.textContent || '').trim().toLowerCase();
    return text.length > 0 && !text.includes('input table to generate a plot');
  }, { timeout: 30_000 });
}

test('scatter inline edit preview mode hides source text and avoids entry duplication', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await ensureScatterExampleLoaded(page);

  await page.waitForFunction(
    () => document.querySelectorAll('#scatterSvg text[data-font-key="yTitle"]').length > 0,
    { timeout: 20_000 }
  );

  await page.evaluate(() => {
    const target = document.querySelector('#scatterSvg text[data-font-key="yTitle"]');
    if (!target) { return; }
    const text = String(target.textContent || 'Y title');
    target.textContent = '';
    for (let i = 0; i < text.length; i += 1) {
      const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      span.textContent = text[i];
      if (i === Math.min(1, Math.max(0, text.length - 1))) {
        span.setAttribute('baseline-shift', 'super');
        span.setAttribute('font-size', '0.75em');
      }
      target.appendChild(span);
    }
  });

  await page.evaluate(() => {
    const target = document.querySelector('#scatterSvg text[data-font-key="yTitle"]');
    if (!target) { return; }
    target.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      detail: 2,
      view: window
    }));
  });

  await page.waitForSelector('.inline-edit-overlay .inline-edit-input', { timeout: 20_000 });

  const state = await page.evaluate(() => {
    const overlay = document.querySelector('.inline-edit-overlay');
    const input = overlay ? overlay.querySelector('.inline-edit-input') : null;
    const preview = overlay ? overlay.querySelector('.inline-edit-preview') : null;
    const target = document.querySelector('#scatterSvg text[data-font-key="yTitle"]');
    const inlineState = target && target.__inlineEditState ? target.__inlineEditState : null;
    const rect = overlay ? overlay.getBoundingClientRect() : null;
    const visibleSourceTextOverlays = (() => {
      if (!rect) { return 0; }
      const nodes = Array.from(document.querySelectorAll('#scatterSvg text[data-font-key="yTitle"]'));
      return nodes.filter(node => {
        const nodeRect = node.getBoundingClientRect();
        const intersects = !(nodeRect.right < rect.left || nodeRect.left > rect.right || nodeRect.bottom < rect.top || nodeRect.top > rect.bottom);
        if (!intersects) { return false; }
        const computed = getComputedStyle(node);
        if (computed.visibility === 'hidden') { return false; }
        const opacity = Number.parseFloat(computed.opacity || '1');
        return Number.isFinite(opacity) ? opacity > 0.01 : true;
      }).length;
    })();

    return {
      hasPreviewClass: !!(input && input.classList && input.classList.contains('inline-edit-input--preview-mode')),
      previewVisible: !!(preview && preview.style.visibility === 'visible' && preview.style.opacity === '1'),
      selectionStart: input && Number.isInteger(input.selectionStart) ? input.selectionStart : null,
      selectionEnd: input && Number.isInteger(input.selectionEnd) ? input.selectionEnd : null,
      valueLength: input ? String(input.value || '').length : null,
      sourceVisibility: target ? target.style.visibility || '' : null,
      sourceOpacity: target ? target.style.opacity || '' : null,
      hiddenTargetsCount: Array.isArray(inlineState?.hiddenTargets) ? inlineState.hiddenTargets.length : 0,
      visibleSourceTextOverlays
    };
  });

  expect(state.hasPreviewClass).toBe(true);
  expect(state.previewVisible).toBe(true);
  expect(state.selectionStart).toBe(state.valueLength);
  expect(state.selectionEnd).toBe(state.valueLength);
  expect(state.sourceVisibility).toBe('hidden');
  expect(state.sourceOpacity).toBe('0');
  expect(state.hiddenTargetsCount).toBeGreaterThan(0);
  expect(state.visibleSourceTextOverlays).toBe(0);
  expect(issues.critical).toEqual([]);
});

test('scatter inline edit plain mode hides source text with a single editable layer', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await ensureScatterExampleLoaded(page);

  await page.evaluate(() => {
    const target = document.querySelector('#scatterSvg text[data-font-key="graphTitle"]');
    if (!target) { return; }
    target.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      detail: 2,
      view: window
    }));
  });

  await page.waitForSelector('.inline-edit-overlay .inline-edit-input', { timeout: 20_000 });

  const state = await page.evaluate(() => {
    const overlay = document.querySelector('.inline-edit-overlay');
    const input = overlay ? overlay.querySelector('.inline-edit-input') : null;
    const preview = overlay ? overlay.querySelector('.inline-edit-preview') : null;
    const target = document.querySelector('#scatterSvg text[data-font-key="graphTitle"]');
    const rect = overlay ? overlay.getBoundingClientRect() : null;
    const visibleSourceTextOverlays = (() => {
      if (!rect) { return 0; }
      const nodes = Array.from(document.querySelectorAll('#scatterSvg text[data-font-key="graphTitle"]'));
      return nodes.filter(node => {
        const nodeRect = node.getBoundingClientRect();
        const intersects = !(nodeRect.right < rect.left || nodeRect.left > rect.right || nodeRect.bottom < rect.top || nodeRect.top > rect.bottom);
        if (!intersects) { return false; }
        const computed = getComputedStyle(node);
        if (computed.visibility === 'hidden') { return false; }
        const opacity = Number.parseFloat(computed.opacity || '1');
        return Number.isFinite(opacity) ? opacity > 0.01 : true;
      }).length;
    })();

    return {
      hasPreviewClass: !!(input && input.classList && input.classList.contains('inline-edit-input--preview-mode')),
      previewHidden: !!(preview && preview.style.visibility === 'hidden' && preview.style.opacity === '0'),
      selectionStart: input && Number.isInteger(input.selectionStart) ? input.selectionStart : null,
      selectionEnd: input && Number.isInteger(input.selectionEnd) ? input.selectionEnd : null,
      valueLength: input ? String(input.value || '').length : null,
      sourceVisibility: target ? target.style.visibility || '' : null,
      sourceOpacity: target ? target.style.opacity || '' : null,
      visibleSourceTextOverlays
    };
  });

  expect(state.hasPreviewClass).toBe(false);
  expect(state.previewHidden).toBe(true);
  expect(state.selectionStart).toBe(0);
  expect(state.selectionEnd).toBe(state.valueLength);
  expect(state.sourceVisibility).toBe('hidden');
  expect(state.sourceOpacity).toBe('0');
  expect(state.visibleSourceTextOverlays).toBe(0);
  expect(issues.critical).toEqual([]);
});

test('scatter inline edit uses only outer border and keeps short title text fully visible', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await ensureScatterExampleLoaded(page);

  await page.evaluate(() => {
    const target = document.querySelector('#scatterSvg text[data-font-key="graphTitle"]');
    if (!target) { return; }
    target.setAttribute('font-size', '78');
    target.setAttribute('font-weight', '700');
    target.textContent = 'sds';
    target.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      detail: 2,
      view: window
    }));
  });

  await page.waitForSelector('.inline-edit-overlay .inline-edit-input', { timeout: 20_000 });

  const state = await page.evaluate(() => {
    const overlay = document.querySelector('.inline-edit-overlay');
    const input = overlay ? overlay.querySelector('.inline-edit-input') : null;
    if (!input || !overlay) {
      return null;
    }
    const cs = getComputedStyle(input);
    const overlayCs = getComputedStyle(overlay);
    const clientWidth = Number(input.clientWidth || 0);
    const scrollWidth = Number(input.scrollWidth || 0);
    return {
      borderTopWidth: cs.borderTopWidth,
      borderStyle: cs.borderStyle,
      boxShadow: cs.boxShadow,
      overlayBorder: overlayCs.borderTopWidth,
      clientWidth,
      scrollWidth,
      textFits: scrollWidth <= (clientWidth + 1)
    };
  });

  expect(state).not.toBeNull();
  expect(state.borderTopWidth).toBe('0px');
  expect(state.borderStyle).toBe('none');
  expect(state.boxShadow === 'none' || state.boxShadow === 'rgb(0, 0, 0) 0px 0px 0px 0px').toBe(true);
  expect(state.overlayBorder).not.toBe('0px');
  expect(state.textFits).toBe(true);
  expect(issues.critical).toEqual([]);
});
