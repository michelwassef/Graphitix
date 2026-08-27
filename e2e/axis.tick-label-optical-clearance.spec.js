const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/workspaceHarness');

test('rotating an X-axis tick label preserves its optical distance from the tick', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const metrics = await page.evaluate(() => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '500');
    svg.setAttribute('height', '120');
    svg.style.position = 'fixed';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.zIndex = '-1';
    document.body.appendChild(svg);

    const makeLabel = x => {
      const node = document.createElementNS(NS, 'text');
      node.setAttribute('x', String(x));
      node.setAttribute('y', '50');
      node.setAttribute('font-size', '16');
      node.setAttribute('text-anchor', 'middle');
      node.textContent = 'Treatment label';
      window.Shared.applyTextBaseline(node, 'hanging', 16);
      svg.appendChild(node);
      return node;
    };

    const horizontal = makeLabel(120);
    const rotated = makeLabel(360);
    const horizontalTop = horizontal.getBoundingClientRect().top;
    window.Shared.chartStyle.applyLabelOrientation([rotated], {
      angle: -45,
      anchor: 'end',
      dy: '0.35em',
      force: true
    });
    const rotatedTop = rotated.getBoundingClientRect().top;
    const resolvedDyPx = Number.parseFloat(rotated.getAttribute('dy'));
    svg.remove();
    return { horizontalTop, rotatedTop, resolvedDyPx };
  });

  expect(Math.abs(metrics.rotatedTop - metrics.horizontalTop)).toBeLessThan(0.75);
  expect(metrics.resolvedDyPx).toBeLessThan(16 * 0.35);
});
