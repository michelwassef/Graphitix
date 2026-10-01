/* global jest */
'use strict';

const deepClone = value => (value == null ? value : JSON.parse(JSON.stringify(value)));
const { ensureWorkspaceTabs, initializeWorkspaceHarness } = require('../__tests__/setup/workspaceHarness');

function installDomControls() {
  jest.resetModules();
  if (typeof global.__resetGrid__ === 'function') {
    global.__resetGrid__();
  }
  initializeWorkspaceHarness();
  require('../js/main/session.js');
  require('../js/shared/colorSchemes.js');
  require('../js/main/domControls.js');
}

module.exports = {
  deepClone,
  ensureWorkspaceTabs,
  installDomControls
};

