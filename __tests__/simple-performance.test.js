// Simple test to check if performance framework is loaded

describe('Performance Framework Loading', () => {
  beforeAll(() => {
    require('../js/shared/performance.js');
  });

  it('should have Performance namespace available', () => {
    expect(window.Shared?.Performance || window.Performance).toBeDefined();
  });
});
