const { expect } = require('@playwright/test');

async function expectTargetsAtLeast24(targets, description) {
  const bounds = await targets.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(bounds.length, `${description} exposes pointer targets`).toBeGreaterThan(0);
  bounds.forEach((target, index) => {
    expect(target.width, `${description} target ${index + 1} minimum width`).toBeGreaterThanOrEqual(24);
    expect(target.height, `${description} target ${index + 1} minimum height`).toBeGreaterThanOrEqual(24);
  });
}

module.exports = { expectTargetsAtLeast24 };
