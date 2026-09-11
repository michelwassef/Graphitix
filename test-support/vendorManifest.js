'use strict';

const BROWSER_VENDOR_VERSIONS = Object.freeze({
  'ag-grid-community': '32.3.9',
  jstat: '1.9.6',
  jszip: '3.10.1',
  'svd-js': '1.1.1'
});

const VENDOR_MANIFEST = Object.freeze([
  Object.freeze({ packageName: 'ag-grid-community', assetPath: 'libs/ag-grid-community/ag-grid-community.min.noStyle.js' }),
  Object.freeze({ packageName: 'jstat', assetPath: 'libs/jstat.min.js' }),
  Object.freeze({ packageName: 'jszip', assetPath: 'libs/jszip.min.js' }),
  Object.freeze({ packageName: 'svd-js', assetPath: 'libs/svd-js.min.js' })
]);

module.exports = {
  BROWSER_VENDOR_VERSIONS,
  VENDOR_MANIFEST
};
