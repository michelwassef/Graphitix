const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const COMPONENTS = ['scatter', 'hist', 'roc', 'survival', 'line', 'pie'].map(type => {
  const component = COMPONENT_MATRIX.find(entry => entry.type === type);
  if (!component) {
    throw new Error(`Missing workspace harness entry for ${type}`);
  }
  return {
    ...component,
    label: type === 'pie' ? 'stacked bar' : type,
    graphPanelSelector: `#${type}GraphPanel`,
    plotSelector: `#${type}Plot`
  };
});

function readGraphGeometry(config) {
  const plot = document.querySelector(config.plotSelector);
  const svgBox = document.querySelector(`${config.graphPanelSelector} .svgbox`);
  const svgs = Array.from(plot?.querySelectorAll?.('svg') || []).filter(svg => {
    const rect = svg.getBoundingClientRect();
    const style = window.getComputedStyle(svg);
    return rect.width > 20 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden';
  });
  const svg = svgs[svgs.length - 1] || null;
  if (!svgBox || !svg) {
    return null;
  }
  const horizontalAxes = Array.from(svg.querySelectorAll('line'))
    .map(line => {
      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      if (![x1, x2, y1, y2].every(Number.isFinite)) {
        return null;
      }
      const length = Math.abs(x2 - x1);
      return Math.abs(y2 - y1) <= 0.25 && length > 20 ? length : null;
    })
    .filter(Number.isFinite);
  return {
    boxWidth: svgBox.getBoundingClientRect().width,
    axisLength: horizontalAxes.length ? Math.max(...horizontalAxes) : 0,
    svgWidth: Number(svg.getAttribute('width')) || 0
  };
}

async function dragWidthAndReadBeforeRelease(page, component) {
  const handle = page.locator(`${component.graphPanelSelector} .svgbox .resizer-vertical`).first();
  await expect(handle).toBeVisible({ timeout: 15_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error(`Missing resize handle for ${component.type}`);
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const before = await page.evaluate(readGraphGeometry, component);
  await page.evaluate(({ config, reader }) => {
    const read = new Function(`return (${reader});`)();
    window.__liveResizeSamples = [];
    window.__liveResizeSampling = true;
    const sample = () => {
      if (!window.__liveResizeSampling) {
        return;
      }
      window.__liveResizeSamples.push(read(config));
      window.requestAnimationFrame(sample);
    };
    window.requestAnimationFrame(sample);
  }, { config: component, reader: readGraphGeometry.toString() });
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const live = [];
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(startX + (step * 12), startY);
    await page.waitForTimeout(30);
    live.push(await page.evaluate(readGraphGeometry, component));
  }
  const during = await page.evaluate(readGraphGeometry, component);
  const animationFrames = await page.evaluate(() => {
    window.__liveResizeSampling = false;
    const samples = Array.isArray(window.__liveResizeSamples) ? window.__liveResizeSamples : [];
    window.__liveResizeSamples = [];
    return samples;
  });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const after = await page.evaluate(readGraphGeometry, component);
  return { before, live, animationFrames, during, after };
}

for (const component of COMPONENTS) {
  test(`${component.label} redraws graph geometry before resize pointer release`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    if (component.type === 'pie') {
      await page.locator('#piePage:not([hidden]) #pieChartType').selectOption('stacked');
    }
    await page.waitForFunction(
      ({ config, reader }) => {
        const read = new Function(`return (${reader});`)();
        return !!read(config)?.axisLength;
      },
      { config: component, reader: readGraphGeometry.toString() },
      { timeout: 30_000 }
    );
    await page.waitForTimeout(300);

    const snapshots = await dragWidthAndReadBeforeRelease(page, component);
    await testInfo.attach(`${component.type}-live-resize.json`, {
      body: Buffer.from(JSON.stringify({ snapshots, issues: issues.all }, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    expect(snapshots.before).not.toBeNull();
    expect(snapshots.during).not.toBeNull();
    expect(snapshots.after).not.toBeNull();
    expect(snapshots.during.boxWidth - snapshots.before.boxWidth).toBeGreaterThan(70);
    expect(Math.abs(snapshots.during.axisLength - snapshots.before.axisLength)).toBeGreaterThan(10);
    const liveAxisChanges = snapshots.live.reduce((count, snapshot, index) => {
      const previous = index === 0 ? snapshots.before : snapshots.live[index - 1];
      return count + (Math.abs(snapshot.axisLength - previous.axisLength) > 1 ? 1 : 0);
    }, 0);
    expect(liveAxisChanges).toBeGreaterThanOrEqual(4);
    const sampledFrames = snapshots.animationFrames.filter(Boolean);
    expect(sampledFrames.length).toBeGreaterThanOrEqual(6);
    expect(sampledFrames.filter(snapshot => snapshot.axisLength <= 20)).toEqual([]);
    expect(Math.abs(snapshots.after.axisLength - snapshots.during.axisLength)).toBeLessThanOrEqual(4);
    expect(issues.critical).toEqual([]);
  });
}
