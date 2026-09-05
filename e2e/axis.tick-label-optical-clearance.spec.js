const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/workspaceHarness');

for (const angle of [-45, -90, 45, 90]) {
  test(`rotating an X-axis tick label to ${angle} degrees adds the shared optical clearance`, async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    const metrics = await page.evaluate(targetAngle => {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', '500');
      svg.setAttribute('height', '180');
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
      const opticalPaddingPx = window.Shared.chartStyle.resolveXAxisRotationOpticalPadding({
        angleDeg: targetAngle,
        fontSize: 16,
        tickLabelGap: window.Shared.chartStyle.resolveTickLabelGap(16)
      });
      window.Shared.chartStyle.applyLabelOrientation([rotated], {
        angle: targetAngle,
        anchor: targetAngle < 0 ? 'end' : 'start',
        dy: '0.35em',
        opticalPaddingPx,
        force: true
      });
      const rotatedTop = rotated.getBoundingClientRect().top;
      const resolvedDy = rotated.getAttribute('dy');
      const transform = rotated.getAttribute('transform') || '';
      svg.remove();
      return { horizontalTop, rotatedTop, opticalPaddingPx, resolvedDy, transform };
    }, angle);

    expect(metrics.rotatedTop - metrics.horizontalTop).toBeCloseTo(metrics.opticalPaddingPx, 0);
    expect(metrics.opticalPaddingPx).toBeGreaterThan(0);
    expect(metrics.resolvedDy).toBe('0.35em');
    expect(metrics.transform).toContain(`rotate(${angle} `);
    expect(metrics.transform).toContain('translate(0 ');
  });
}
