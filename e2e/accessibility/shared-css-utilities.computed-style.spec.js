const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

test('shared CSS accessibility utilities preserve hidden text and hidden state', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const computed = await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.shared-hidden-utility-probe { display: flex; width: 60px; height: 20px; }';
    document.head.appendChild(style);

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-2000px;top:0';
    const button = document.createElement('button');
    button.type = 'button';
    const label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = 'Accessible label probe';
    label.style.cssText = 'position:static;width:20px;height:20px;padding:4px;margin:0;overflow:visible;clip:auto;white-space:normal;border:2px solid red';
    button.appendChild(label);

    const visible = document.createElement('div');
    visible.className = 'shared-hidden-utility-probe';
    const hidden = document.createElement('div');
    hidden.className = 'shared-hidden-utility-probe';
    hidden.hidden = true;
    host.append(button, visible, hidden);
    document.body.appendChild(host);

    const labelStyle = getComputedStyle(label);
    return {
      visuallyHidden: {
        position: labelStyle.position,
        width: labelStyle.width,
        height: labelStyle.height,
        padding: labelStyle.padding,
        margin: labelStyle.margin,
        overflow: labelStyle.overflow,
        clip: labelStyle.clip,
        whiteSpace: labelStyle.whiteSpace,
        borderTopWidth: labelStyle.borderTopWidth
      },
      visibleDisplay: getComputedStyle(visible).display,
      hiddenDisplay: getComputedStyle(hidden).display,
      hiddenRect: hidden.getBoundingClientRect().toJSON()
    };
  });

  expect(computed.visuallyHidden).toEqual({
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0px',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0px, 0px, 0px, 0px)',
    whiteSpace: 'nowrap',
    borderTopWidth: '0px'
  });
  expect(computed.visibleDisplay).toBe('flex');
  expect(computed.hiddenDisplay).toBe('none');
  expect(computed.hiddenRect.width).toBe(0);
  expect(computed.hiddenRect.height).toBe(0);

  await expect(page.getByRole('button', { name: 'Accessible label probe' })).toHaveCount(1);
});
