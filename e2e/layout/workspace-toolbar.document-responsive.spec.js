const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { applyEnlargedUiText } = require('../helpers/enlargedUiText');
const { launchChromiumAtBrowserZoom } = require('../helpers/actualBrowserZoom');

const histogram = COMPONENT_MATRIX.find(component => component.type === 'hist');
const widths = [320, 460, 640, 768, 1280];

async function readDocumentRow(page, { autosaveOn, status, title }) {
  return page.evaluate(({ autosaveOn, status, title }) => {
    const documentArea = Array.from(document.querySelectorAll('.workspace-toolbar__document'))
      .find(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
    const titleNode = documentArea?.querySelector('.workspace-toolbar__document-title');
    const autosaveNode = documentArea?.querySelector('.workspace-toolbar__autosave');
    const statusNode = documentArea?.querySelector('.workspace-toolbar__document-status');
    const autosaveInput = autosaveNode?.querySelector('input[type="checkbox"]');
    if (!documentArea || !titleNode || !autosaveNode || !statusNode || !autosaveInput) return null;
    titleNode.textContent = title;
    statusNode.textContent = status;
    autosaveInput.checked = autosaveOn;
    const rect = node => {
      const bounds = node.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    return {
      area: rect(documentArea),
      title: rect(titleNode),
      autosave: rect(autosaveNode),
      status: rect(statusNode),
      titlePosition: getComputedStyle(titleNode).position,
      documentScrollWidth: documentArea.scrollWidth,
      documentClientWidth: documentArea.clientWidth
    };
  }, { autosaveOn, status, title });
}

function expectSeparated(metrics, width) {
  expect(metrics, `toolbar elements exist at ${width}px`).toBeTruthy();
  for (const [name, element] of Object.entries({ title: metrics.title, autosave: metrics.autosave, status: metrics.status })) {
    expect(element.width, `${name} visible width at ${width}px`).toBeGreaterThan(0);
    expect(element.left, `${name} left edge at ${width}px`).toBeGreaterThanOrEqual(metrics.area.left - 1);
    expect(element.right, `${name} right edge at ${width}px`).toBeLessThanOrEqual(metrics.area.right + 1);
  }
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  expect(overlaps(metrics.title, metrics.autosave), `title overlaps Autosave at ${width}px`).toBe(false);
  expect(overlaps(metrics.title, metrics.status), `title overlaps status at ${width}px`).toBe(false);
  expect(overlaps(metrics.autosave, metrics.status), `Autosave overlaps status at ${width}px`).toBe(false);
  if (width <= 720) expect(metrics.titlePosition).toBe('static');
}

test('document title, Autosave, and status stay readable and separate across viewport widths', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, histogram, { first: true, loadExample: true });

  for (const [index, width] of widths.entries()) {
    await page.setViewportSize({ width, height: 900 });
    const autosaveOn = index % 2 === 0;
    const title = width <= 640
      ? 'Long example analysis filename with unsaved changes.graph *'
      : 'Analysis.graph';
    const metrics = await readDocumentRow(page, {
      autosaveOn,
      status: autosaveOn ? 'Saved' : 'Autosave Off · Unsaved changes',
      title
    });
    expectSeparated(metrics, width);
    if (width === 640) {
      await page.screenshot({ path: test.info().outputPath('workspace-document-640.png') });
    }
  }

  await page.setViewportSize({ width: 640, height: 900 });
  await applyEnlargedUiText(page, 2);
  const enlarged = await readDocumentRow(page, {
    autosaveOn: false,
    status: 'Autosave Off · Unsaved changes',
    title: 'Long example analysis filename with unsaved changes.graph *'
  });
  expectSeparated(enlarged, 640);
  await page.screenshot({ path: test.info().outputPath('workspace-document-640-enlarged-text.png') });
});

test('workspace document controls stay separate at actual 200% browser zoom', async ({ browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', '[skip-policy issue=ROADMAP-FIREFOX-PARITY owner=test-infrastructure expires=2026-12-31 gate=firefox-zoom-enabled] Actual tab zoom uses Chromium tabs.setZoom.');
  test.setTimeout(90_000);
  const { page, setZoom, close } = await launchChromiumAtBrowserZoom({ width: 1280, height: 900 });
  try {
    await installLocalCdnOverrides(page);
    await page.goto(`${baseURL}/index.html`, { waitUntil: 'domcontentloaded' });
    await setZoom(2);
    await openComponentFromWelcome(page, histogram, { first: true, loadExample: true });
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(width).toBeLessThanOrEqual(642);
    const metrics = await readDocumentRow(page, {
      autosaveOn: false,
      status: 'Autosave Off · Unsaved changes',
      title: 'Long example analysis filename with unsaved changes.graph *'
    });
    expectSeparated(metrics, width);
    await page.screenshot({ path: test.info().outputPath('workspace-document-200-percent-zoom.png') });
  } finally {
    await close();
  }
});
