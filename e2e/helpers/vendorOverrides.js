'use strict';

const fs = require('fs');
const path = require('path');
const { BROWSER_VENDOR_VERSIONS } = require('../../test-support/vendorManifest.js');

function versionPattern(packageName) {
  const escaped = String(BROWSER_VENDOR_VERSIONS[packageName] || '').replaceAll('.', '\\.' );
  return new RegExp(`\\/(?:npm\\/)?${packageName.replace('-', '\\-')}@${escaped}\\/`, 'i');
}

const CDN_OVERRIDE_ENTRIES = [
  {
    match: new RegExp(`${versionPattern('ag-grid-community').source}styles/ag-grid\\.css$`, 'i'),
    localPath: path.resolve(__dirname, '../../libs/ag-grid-community/ag-grid.css'),
    contentType: 'text/css; charset=utf-8'
  },
  {
    match: new RegExp(`${versionPattern('ag-grid-community').source}styles/ag-theme-balham\\.css$`, 'i'),
    localPath: path.resolve(__dirname, '../../libs/ag-grid-community/ag-theme-balham.css'),
    contentType: 'text/css; charset=utf-8'
  },
  {
    match: new RegExp(`${versionPattern('ag-grid-community').source}dist/ag-grid-community\\.min\\.noStyle\\.js$`, 'i'),
    localPath: path.resolve(__dirname, '../../libs/ag-grid-community/ag-grid-community.min.noStyle.js'),
    contentType: 'text/javascript; charset=utf-8'
  },
  {
    match: new RegExp(`${versionPattern('jstat').source}dist/jstat\\.min\\.js$`, 'i'),
    localPath: path.resolve(__dirname, '../../libs/jstat.min.js'),
    contentType: 'text/javascript; charset=utf-8'
  },
  {
    match: new RegExp(`${versionPattern('jszip').source}dist/jszip\\.min\\.js$`, 'i'),
    localPath: path.resolve(__dirname, '../../libs/jszip.min.js'),
    contentType: 'text/javascript; charset=utf-8'
  },
  {
    match: new RegExp(`${versionPattern('svd-js').source}build-umd/svd-js\\.min\\.js$`, 'i'),
    localPath: path.resolve(__dirname, '../../libs/svd-js.min.js'),
    contentType: 'text/javascript; charset=utf-8'
  }
];

const CDN_OVERRIDE_CACHE = new Map();

function readOverrideBody(entry) {
  const key = entry.localPath;
  if (CDN_OVERRIDE_CACHE.has(key)) {
    return CDN_OVERRIDE_CACHE.get(key);
  }
  const body = fs.readFileSync(entry.localPath);
  CDN_OVERRIDE_CACHE.set(key, body);
  return body;
}

async function installLocalCdnOverrides(page) {
  await page.route('https://cdn.jsdelivr.net/**', route => {
    const url = route.request().url();
    const entry = CDN_OVERRIDE_ENTRIES.find(item => item.match.test(url));
    if (!entry) {
      route.continue();
      return;
    }
    try {
      const body = readOverrideBody(entry);
      route.fulfill({
        status: 200,
        contentType: entry.contentType,
        body
      });
    } catch (err) {
      route.abort();
    }
  });
}

module.exports = {
  installLocalCdnOverrides,
  versionPattern
};
