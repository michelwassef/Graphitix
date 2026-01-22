// Simple test to check if performance framework is loaded

describe('Performance Framework Loading', () => {
  beforeAll(() => {
    require('../js/shared/performance.js');
  });

  it('should have Performance namespace available', () => {
    console.log('window.Performance:', window.Performance);
    console.log('window.Shared:', window.Shared);
    console.log('window.Shared.Performance:', window.Shared?.Performance);
    
    // Check what functions are available
    if (window.Performance) {
      console.log('window.Performance functions:', Object.keys(window.Performance));
    }
    if (window.Shared?.Performance) {
      console.log('window.Shared.Performance functions:', Object.keys(window.Shared.Performance));
    }
    
    // Check if Performance is available in any form
    const performanceAvailable = 
      typeof window.Performance !== 'undefined' ||
      typeof window.Shared?.Performance !== 'undefined';
    
    expect(performanceAvailable).toBe(true);
  });
});