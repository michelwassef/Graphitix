const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const CASES = [
  { type: 'hist', textSelector: 'text' },
  { type: 'box', textSelector: 'text' },
  { type: 'line', textSelector: '[data-legend-viewport-content="true"] text' }
].map(entry => ({
  ...COMPONENT_MATRIX.find(component => component.type === entry.type),
  textSelector: entry.textSelector
}));

async function readTextTheme(page, component) {
  return page.evaluate(({ pageId, textSelector }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const svg = root?.querySelector?.('.svgbox svg');
    const texts = Array.from(svg?.querySelectorAll?.(textSelector) || []);
    return {
      scheme: svg?.getAttribute?.('data-color-scheme') || '',
      background: svg ? getComputedStyle(svg).backgroundColor : '',
      fills: texts.map(node => getComputedStyle(node).fill),
      count: texts.length
    };
  }, component);
}

async function resizeGraph(page, component) {
  const handle = page.locator(`#${component.pageId}:not([hidden]) .svgbox .resizer-vertical`).first();
  await expect(handle).toBeVisible({ timeout: 20_000 });
  const box = await handle.boundingBox();
  if (!box) throw new Error(`Missing resize handle for ${component.type}`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 72, startY, { steps: 6 });
  await page.mouse.up();
}

for (const component of CASES) {
  test(`${component.type} keeps dark-theme text visible after resize redraw`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });

    await page.evaluate(type => window.Shared.colorSchemes.applyToActiveTab(type, 'dark'), component.type);
    await expect.poll(() => readTextTheme(page, component), { timeout: 30_000 }).toMatchObject({
      scheme: 'dark',
      background: 'rgb(0, 0, 0)'
    });

    await resizeGraph(page, component);
    await expect.poll(async () => {
      const theme = await readTextTheme(page, component);
      return {
        scheme: theme.scheme,
        background: theme.background,
        count: theme.count,
        allVisible: theme.count > 0 && theme.fills.every(fill => fill === 'rgb(242, 242, 242)')
      };
    }, { timeout: 30_000 }).toEqual({
      scheme: 'dark',
      background: 'rgb(0, 0, 0)',
      count: expect.any(Number),
      allVisible: true
    });
  });
}
