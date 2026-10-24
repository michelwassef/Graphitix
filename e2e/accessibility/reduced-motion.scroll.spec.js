const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

test('Welcome carousel arrow uses automatic scrolling when reduced motion is enabled', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');

  const list = page.locator('#welcomePopularExamplesList');
  await expect(list).toBeVisible();
  await expect.poll(() => list.evaluate(node => getComputedStyle(node).scrollBehavior)).toBe('auto');
  const reducedMotionStyles = await list.evaluate(node => {
    const style = getComputedStyle(node);
    const milliseconds = value => Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
    return {
      animationDelay: milliseconds(style.animationDelay),
      animationDuration: milliseconds(style.animationDuration),
      animationIterationCount: style.animationIterationCount,
      scrollBehavior: style.scrollBehavior,
      transitionDelay: milliseconds(style.transitionDelay),
      transitionDuration: milliseconds(style.transitionDuration)
    };
  });
  expect(reducedMotionStyles.animationDelay).toBe(0);
  expect(reducedMotionStyles.animationDuration).toBeCloseTo(0.01, 5);
  expect(reducedMotionStyles.animationIterationCount).toBe('1');
  expect(reducedMotionStyles.scrollBehavior).toBe('auto');
  expect(reducedMotionStyles.transitionDelay).toBe(0);
  expect(reducedMotionStyles.transitionDuration).toBe(0);
  await list.evaluate(node => {
    const nativeScrollBy = node.scrollBy.bind(node);
    node.dataset.testScrollBehavior = '';
    node.scrollBy = options => {
      node.dataset.testScrollBehavior = options?.behavior || 'default';
      nativeScrollBy(options);
    };
  });

  const initialScroll = await list.evaluate(node => node.scrollLeft);
  await page.locator('#welcomePopularExamplesNext').click();
  await expect.poll(() => list.evaluate(node => node.scrollLeft)).toBeGreaterThan(initialScroll);
  await expect(list).toHaveAttribute('data-test-scroll-behavior', 'auto');
});

test('workspace tab arrow uses automatic scrolling when reduced motion is enabled', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');
  await page.evaluate(() => {
    const { session, tabs } = window.Main;
    for (let index = 0; index < 14; index += 1) {
      session.workspaceState.tabs.push(session.createTab({ title: `Motion tab ${index + 2}` }));
    }
    tabs.renderTabs();
  });

  const list = page.locator('#workspaceTabsList');
  const scrollRight = page.locator('#workspaceTabsScrollRight');
  await expect(scrollRight).toBeVisible();
  await expect.poll(() => list.evaluate(node => getComputedStyle(node).scrollBehavior)).toBe('auto');
  await list.evaluate(node => {
    const nativeScrollBy = node.scrollBy.bind(node);
    node.dataset.testScrollBehavior = '';
    node.scrollBy = options => {
      node.dataset.testScrollBehavior = options?.behavior || 'default';
      nativeScrollBy(options);
    };
  });

  const initialScroll = await list.evaluate(node => node.scrollLeft);
  await scrollRight.click();
  await expect.poll(() => list.evaluate(node => node.scrollLeft)).toBeGreaterThan(initialScroll);
  await expect(list).toHaveAttribute('data-test-scroll-behavior', 'auto');
});

test('scroll motion updates when the reduced-motion preference changes after startup', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');

  const welcomeList = page.locator('#welcomePopularExamplesList');
  await expect(welcomeList).toBeVisible();
  await expect.poll(() => welcomeList.evaluate(node => getComputedStyle(node).scrollBehavior)).toBe('smooth');
  await welcomeList.evaluate(node => {
    const nativeScrollBy = node.scrollBy.bind(node);
    node.dataset.testScrollBehavior = '';
    node.scrollBy = options => {
      node.dataset.testScrollBehavior = options?.behavior || 'default';
      nativeScrollBy(options);
    };
  });

  await page.evaluate(() => {
    const { session, tabs } = window.Main;
    for (let index = 0; index < 14; index += 1) {
      session.workspaceState.tabs.push(session.createTab({ title: `Runtime motion tab ${index + 2}` }));
    }
    tabs.renderTabs();
  });
  const tabList = page.locator('#workspaceTabsList');
  await expect(page.locator('#workspaceTabsScrollRight')).toBeVisible();
  await tabList.evaluate(node => {
    const nativeScrollBy = node.scrollBy.bind(node);
    node.dataset.testScrollBehavior = '';
    node.scrollBy = options => {
      node.dataset.testScrollBehavior = options?.behavior || 'default';
      nativeScrollBy(options);
    };
  });

  await page.locator('#welcomePopularExamplesNext').click();
  await expect(welcomeList).toHaveAttribute('data-test-scroll-behavior', 'smooth');
  await page.locator('#workspaceTabsScrollRight').click();
  await expect(tabList).toHaveAttribute('data-test-scroll-behavior', 'smooth');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => welcomeList.evaluate(node => getComputedStyle(node).scrollBehavior)).toBe('auto');
  await page.locator('#welcomePopularExamplesNext').click();
  await expect(welcomeList).toHaveAttribute('data-test-scroll-behavior', 'auto');
  await page.locator('#workspaceTabsScrollRight').click();
  await expect(tabList).toHaveAttribute('data-test-scroll-behavior', 'auto');
});
