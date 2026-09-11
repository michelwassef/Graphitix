'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = process.versions.node.split('.').map(Number);
const major = version[0];
const range = packageJson.engines?.node || '';

if (!Number.isInteger(major) || major < 20 || major >= 25) {
  console.error(`Unsupported Node.js runtime ${process.versions.node}; expected ${range || 'Node 20 through 24'}.`);
  process.exitCode = 1;
} else {
  console.log(`Test runtime supported: Node.js ${process.versions.node} (${range})`);
}
