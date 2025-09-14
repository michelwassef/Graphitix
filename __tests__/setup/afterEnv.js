// Per-test setup. Load the real index.html into JSDOM and reset stubs.

const fs = require('fs');
const path = require('path');

beforeEach(() => {
  // Reset HT call log
  if (global.__resetHT__) global.__resetHT__();

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

