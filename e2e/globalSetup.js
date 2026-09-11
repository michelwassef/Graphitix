'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function verifyServerProvenance() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL
    || `http://127.0.0.1:${Number(process.env.PLAYWRIGHT_WEB_PORT || 4173)}`;
  const expectedHash = crypto.createHash('sha256')
    .update(fs.readFileSync(path.resolve(__dirname, '..', 'index.html')))
    .digest('hex');
  const response = await fetch(`${baseUrl}/__graphitix_provenance`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`E2E server provenance unavailable: HTTP ${response.status}`);
  }
  const provenance = await response.json();
  if (provenance?.schemaVersion !== 1 || provenance.indexHash !== expectedHash) {
    throw new Error('E2E server is serving a different index.html than the current checkout');
  }
}

module.exports = verifyServerProvenance;
