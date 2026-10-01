const { ensureJStatStub } = require('../__tests__/helpers/jstatTestStub');

const { loadProductionBootstrap } = require('./productionLoader');

const { installProductionTestEventTracker } = require('./productionTestLifecycle');

const originalDebug = console.debug;

const originalLog = console.log;

let productionEvents;

jest.setTimeout(20000);

async function activateWorkspace(type){
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  const result = graphSelection(type);
  if (result && typeof result.then === 'function') {
    await result;
  }
  await Promise.resolve();
}

function getExampleData(component, key){
  const record = window.Shared?.exampleDatasets?.get?.(component, key);
  expect(record?.data).toBeTruthy();
  return record.data;
}

async function flushAsyncWork(iterations = 25){
  for (let i = 0; i < iterations; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function awaitBoxReady(reason){
  const box = window.Components?.box;
  expect(typeof box?.awaitReadyForSnapshot).toBe('function');
  const result = await box.awaitReadyForSnapshot({
    reason,
    timeoutMs: 15000,
    settleFrames: 1
  });
  expect(result?.ok).toBe(true);
}

async function awaitScatterReady(reason){
  const scatter = window.Components?.scatter;
  expect(typeof scatter?.awaitReadyForSnapshot).toBe('function');
  const result = await scatter.awaitReadyForSnapshot({ reason, timeoutMs: 15000, settleFrames: 1 });
  expect(result?.ok).toBe(true);
}

async function awaitComponentAsyncIdle(type, reason){
  return waitFor(() => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId;
    const scope = window.Components?.[type]?.__asyncScope?.snapshot?.(tabId);
    return scope?.idle === true ? scope : null;
  }, { timeout: 15000, interval: 20, reason });
}

function setVennListValue(input, value){
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeAll(() => {
  productionEvents = installProductionTestEventTracker();
});

beforeEach(() => {
  productionEvents.reset();
  jest.resetModules();
  console.debug = jest.fn();
  console.log = jest.fn();

  // Reset global namespaces so each test re-binds to the fresh DOM.
  // The test harness reloads index.html per-test, but window.* objects persist.
  // Without clearing these, components may skip setup due to ready/__installed flags
  // and keep references to detached nodes, causing renders to target the old DOM.
  if (typeof window !== 'undefined') {
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    delete global.Main;
    delete global.Components;
    delete global.Shared;
  }

  if (typeof global.__restoreTestDebugLogs === 'function') {
    global.__restoreTestDebugLogs();
  }
  if (typeof global.__resetGrid__ === 'function') {
    global.__resetGrid__();
  }
  loadProductionBootstrap({ vendorMode: 'fake' });
});

afterEach(() => {
  productionEvents.reset();
  if (typeof global.__suppressTestDebugLogs === 'function') {
    global.__suppressTestDebugLogs();
  }
});

afterAll(() => {
  productionEvents.restore();
  console.debug = originalDebug;
  console.log = originalLog;
});

module.exports = { ensureJStatStub, activateWorkspace, getExampleData, flushAsyncWork, awaitBoxReady, awaitScatterReady, awaitComponentAsyncIdle, setVennListValue };
