// Per-test setup. Load the real index.html into JSDOM and reset stubs.

const fs = require('fs');
const path = require('path');
const {
  inspectIntegrationTeardown,
  formatIntegrationLeakReport
} = require('../../test-support/integrationTeardown');
const { resetProductionNamespaces } = require('../../test-support/productionLoader');
const { installProductionTestEventTracker } = require('../../test-support/productionTestLifecycle');

let integrationEventTracker = null;

beforeEach(() => {
  if (process.env.TEST_ENFORCE_INTEGRATION_LEAKS === '1') {
    if (!integrationEventTracker) {
      integrationEventTracker = installProductionTestEventTracker({ window, document });
    } else {
      const reset = integrationEventTracker.reset();
      if (reset.failures.length > 0) {
        throw new Error(`Failed to isolate integration listeners: ${JSON.stringify(reset.failures)}`);
      }
    }
    resetProductionNamespaces();
  }
  if (typeof global.__clearUnexpectedConsoleErrors === 'function') {
    global.__clearUnexpectedConsoleErrors();
  }

  // Reset HT call log
  if (global.__resetGrid__) global.__resetGrid__();

  // Load the real HTML body so querySelectors match what main.js expects
  const htmlPath = path.resolve(__dirname, '../../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Populate document with full HTML
  document.open();
  document.write(html);
  document.close();

  // Prevent external <script> tags from attempting to load in tests
  document.querySelectorAll('script[src]').forEach(s => s.parentNode.removeChild(s));
});

afterEach(() => {
  let consoleFailure = null;
  let leakFailure = null;
  try {
    if (process.env.TEST_ENFORCE_INTEGRATION_LEAKS === '1') {
      const teardown = inspectIntegrationTeardown(window, integrationEventTracker);
      if (teardown.disposalUnavailable || teardown.disposalFailures.length > 0
        || teardown.pendingScopes.length > 0) {
        leakFailure = new Error(`Integration resources leaked across test boundary: ${formatIntegrationLeakReport({
          ...teardown,
          disposalFailures: teardown.disposalFailures
        })}`);
      }
    }
    if (typeof global.__isStrictConsoleErrorsEnabled === 'function'
      && global.__isStrictConsoleErrorsEnabled()
      && typeof global.__consumeUnexpectedConsoleErrors === 'function') {
      const errors = global.__consumeUnexpectedConsoleErrors();
      if (Array.isArray(errors) && errors.length > 0) {
        const preview = errors
          .slice(0, 3)
          .map((entry, index) => `#${index + 1} ${entry.map(value => String(value)).join(' ')}`)
          .join('\n');
        consoleFailure = new Error(`Unexpected console.error detected (${errors.length}).\n${preview}`);
      }
    }
  } finally {
    if (process.env.TEST_ENFORCE_INTEGRATION_LEAKS === '1') {
      const listenerCleanup = integrationEventTracker?.reset();
      if (listenerCleanup?.failures?.length > 0 && !leakFailure) {
        leakFailure = new Error(`Failed to isolate integration listeners: ${JSON.stringify(listenerCleanup.failures)}`);
      }
    }
    // A failed assertion must not leave spies or fake timers active for the
    // next test in the same integration worker.
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
  if (consoleFailure) {
    throw consoleFailure;
  }
  if (leakFailure) {
    throw leakFailure;
  }
});

afterAll(() => {
  integrationEventTracker?.restore();
  integrationEventTracker = null;
});
