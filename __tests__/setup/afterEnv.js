// Per-test setup. Load the real index.html into JSDOM and reset stubs.

const fs = require('fs');
const path = require('path');

beforeEach(() => {
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
  if (typeof global.__isStrictConsoleErrorsEnabled !== 'function' || !global.__isStrictConsoleErrorsEnabled()) {
    return;
  }
  if (typeof global.__consumeUnexpectedConsoleErrors !== 'function') {
    return;
  }
  const errors = global.__consumeUnexpectedConsoleErrors();
  if (!Array.isArray(errors) || errors.length === 0) {
    return;
  }
  const preview = errors
    .slice(0, 3)
    .map((entry, index) => `#${index + 1} ${entry.map(value => String(value)).join(' ')}`)
    .join('\n');
  throw new Error(`Unexpected console.error detected (${errors.length}).\n${preview}`);
});

