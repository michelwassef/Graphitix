// Performance framework tests
// Test the new unified performance utilities

const loadSharedModules = () => {
  require('../js/vendor.js');
  require('../js/shared/fileIO.js');
  require('../js/shared/debounce.js');
  require('../js/shared/performance.js'); // Add the new performance framework
  require('../js/shared/undo.js');
  require('../js/shared/resizer.js');
  require('../js/shared/dom.js');
  require('../js/shared/exporter.js');
  require('../js/shared/chartStyle.js');
  require('../js/shared/graphSizing.js');
  require('../js/shared/regression.js');
  require('../js/shared/stats.js');
  require('../js/shared/stats-table.js');
  require('../js/shared/colorPicker.js');
  require('../js/shared/editHighlight.js');
  require('../js/shared/axisControls.js');
  require('../js/shared/significanceControls.js');
  require('../js/shared/fontControls.js');
  require('../js/shared/formControls.js');
};

describe('Performance Optimization Framework', () => {
  beforeAll(() => {
    // Ensure all shared modules are loaded
    loadSharedModules();
  });

  describe('Performance.debounce', () => {
    jest.useFakeTimers();

    it('should debounce function calls with timeout strategy', () => {
      const mockFn = jest.fn();
      const debounced = Shared.Performance.debounce(mockFn, 100, 'timeout');

      debounced();
      debounced();
      debounced();

      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should debounce function calls with animationFrame strategy', () => {
      // Mock requestAnimationFrame and cancelAnimationFrame BEFORE creating debounced function
      global.requestAnimationFrame = jest.fn((cb) => {
        cb();
        return 1;
      });
      global.cancelAnimationFrame = jest.fn();
      
      const mockFn = jest.fn();
      const debounced = Shared.Performance.debounce(mockFn, 16, 'animationFrame');

      debounced();
      debounced();
      debounced();

      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance.debounceFrame', () => {
    it('should use animation frame strategy by default', () => {
      // Mock requestAnimationFrame
      global.requestAnimationFrame = jest.fn((cb) => {
        cb();
        return 1;
      });

      const mockFn = jest.fn();
      const debounced = Shared.Performance.debounceFrame(mockFn);

      debounced();
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance.batch', () => {
    it('should execute function immediately and return result', () => {
      const mockFn = jest.fn(() => 'test-result');
      const result = Shared.Performance.batch(mockFn);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(result).toBe('test-result');
    });

    it('should handle errors gracefully', () => {
      const errorFn = jest.fn(() => {
        throw new Error('test-error');
      });

      expect(() => {
        Shared.Performance.batch(errorFn);
      }).toThrow('test-error');
    });
  });

  describe('Performance.nestedBatch', () => {
    it('should handle nested batching correctly', () => {
      const mockFn1 = jest.fn();
      const mockFn2 = jest.fn();

      Shared.Performance.nestedBatch(() => {
        mockFn1();
        Shared.Performance.nestedBatch(() => {
          mockFn2();
        });
      });

      expect(mockFn1).toHaveBeenCalledTimes(1);
      expect(mockFn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance.throttle', () => {
    it('should throttle function calls', () => {
      // Mock both Date.now and performance.now to make throttle testable
      const originalDateNow = Date.now;
      const originalPerfNow = global.performance?.now;
      let mockTime = 0;
      Date.now = jest.fn(() => mockTime);
      if (global.performance) {
        global.performance.now = jest.fn(() => mockTime);
      }

      const mockFn = jest.fn();
      const throttled = Shared.Performance.throttle(mockFn, 100);

      // First call should execute immediately
      throttled();
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Calls within 100ms should be throttled
      mockTime += 50;
      throttled();
      mockTime += 30;
      throttled();
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Call after 100ms should execute
      mockTime += 50; // Total: 130ms from start
      throttled();
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Restore original functions
      Date.now = originalDateNow;
      if (global.performance && originalPerfNow) {
        global.performance.now = originalPerfNow;
      }
    });
  });

  describe('Performance.mark and Performance.measure', () => {
    beforeAll(() => {
      // Enable debug logging for these tests
      if (typeof Shared.enableDebugLogging === 'function') {
        Shared.enableDebugLogging();
      }
    });

    afterAll(() => {
      // Restore debug logging state
      if (typeof Shared.disableDebugLogging === 'function') {
        Shared.disableDebugLogging();
      }
    });

    it('should mark performance timestamps', () => {
      const spy = jest.spyOn(console, 'debug').mockImplementation(() => {});

      Shared.Performance.mark('test-start');
      Shared.Performance.mark('test-end');

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Performance mark:'), expect.any(Object));

      spy.mockRestore();
    });

    it('should measure performance between marks', () => {
      const spy = jest.spyOn(console, 'debug').mockImplementation(() => {});

      Shared.Performance.mark('measure-start');
      Shared.Performance.mark('measure-end');
      Shared.Performance.measure('test-measurement', 'measure-start', 'measure-end');

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Performance measure:'), expect.any(Object));

      spy.mockRestore();
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain compatibility with existing Shared.debounceFrame', () => {
      // This test ensures that the new Performance framework doesn't break existing code
      const mockFn = jest.fn();
      const debounced = window.Shared.debounceFrame(mockFn);

      // Mock requestAnimationFrame
      global.requestAnimationFrame = jest.fn((cb) => {
        cb();
        return 1;
      });

      debounced();
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});