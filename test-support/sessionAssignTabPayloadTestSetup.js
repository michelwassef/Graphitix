'use strict';

function registerSessionAssignTabPayloadFixture(setSession) {
  beforeEach(() => {
    jest.resetModules();
    delete window.Main;
    delete window.Shared;
    require('../js/main/session.js');
    const session = window.Main.session;
    expect(session).toBeTruthy();
    setSession(session);
  });

  afterEach(() => {
    delete window.Main;
    delete window.Shared;
  });
}

// JSDOM cannot mark dispatched events as trusted; the session test backdoor models a user event.
function makeTrustedEvent(type, _target) {
  const event = new Event(type, { bubbles: true });
  const flag = window.Main?.session?.__USER_TRUSTED_FLAG__ || '__graphitixUserTrusted';
  event[flag] = true;
  return event;
}

function createPayloadTabForSession(session) {
  const tab = session.createTab({
    title: 'Distribution Charts',
    type: 'box',
    payload: { type: 'box', data: [['Lib1', 'Lib2'], [180, 109], [337, 204]], config: {} },
    payloadSignature: 'box-7357-row-sig'
  });
  session.workspaceState.tabs.push(tab);
  return tab;
}

module.exports = {
  createPayloadTabForSession,
  makeTrustedEvent,
  registerSessionAssignTabPayloadFixture
};
