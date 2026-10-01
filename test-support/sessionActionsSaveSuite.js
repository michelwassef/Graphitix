/* global afterEach, jest */
'use strict';

function installSessionActions() {
  jest.resetModules();
  window.Main = {};
  window.Shared = {
    fileIO: {},
    graphArchive: {
      parseFile: jest.fn(),
      ensureGraphFileName: jest.fn((name, fallback) => name || fallback || 'workspace.graph'),
      buildArchiveBlob: jest.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }))
    }
  };
  require('../js/main/snapshotPolicy.js');
  require('../js/main/sessionActions.js');
  return window.Main.sessionActions;
}

function createContext(overrides = {}) {
  const workspaceState = {
    tabs: [{
      id: 'tab-1',
      title: 'XY Plots',
      type: 'scatter',
      isWelcome: false,
      payload: { type: 'scatter', data: [[1, 2, 'A']] },
      layoutState: null
    }],
    sessionDirty: true,
    sessionFileHandle: null,
    sessionFileScope: null,
    sessionFileName: ''
  };
  const session = {
    fastClonePayload: value => (value == null ? value : JSON.parse(JSON.stringify(value))),
    getActiveTab: jest.fn(() => workspaceState.tabs[0]),
    persistActiveTabState: jest.fn(),
    clearSessionDirty: jest.fn()
  };
  return {
    Shared: window.Shared,
    session,
    workspaceState,
    withSessionContext: value => value,
    sessionFileTypes: [],
    ...overrides
  };
}

function createSessionActionsSaveTestContext() {
  afterEach(() => {
    delete window.Main;
    delete window.Shared;
  });

  return { installSessionActions, createContext };
}

module.exports = { createSessionActionsSaveTestContext };

