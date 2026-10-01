/* global jest */
/* Shared minimal DOM harness for statsFigureSummary renderer contracts. */

function createStatsFigureSummaryRendererHarness() {
  let sharedStates;
  let root;
  let svg;

  function installWorkspace(tabId = 'tab-a', type = 'box') {
    sharedStates = new Map();
    document.body.innerHTML = `
      <section id="${type}Page" data-workspace-tab-id="${tabId}" data-workspace-component="${type}">
        <div class="svgbox"><div id="${type}Plot"><svg width="400" height="300" viewBox="0 0 400 300"></svg></div></div>
      </section>`;
    root = document.getElementById(`${type}Page`);
    svg = root.querySelector('svg');
    svg.getBoundingClientRect = () => ({ x:0, y:0, left:0, top:0, right:400, bottom:300, width:400, height:300 });

    const tabs = [{ id:tabId, type, isWelcome:false }];
    global.Main = window.Main = {
      session: {
        workspaceState: { activeTabId:tabId, tabs },
        getActiveTab: () => tabs[0]
      }
    };
    window.Shared.workspaceTabs = {
      getMountedRoot: (id, componentType) => id === tabId && componentType === type ? root : null,
      getSharedControlState: (_tabLike, key) => sharedStates.get(`${tabId}:${key}`) || null,
      ensureSharedControlState: (_tabLike, key) => {
        const mapKey = `${tabId}:${key}`;
        if(!sharedStates.has(mapKey)) sharedStates.set(mapKey, {});
        return sharedStates.get(mapKey);
      }
    };
    return tabId;
  }

  function reportWithValue(value) {
    return {
      figureSummary: {
        schemaVersion:1,
        kind:'inferential',
        title:'Statistical analysis summary',
        sections:[{
          key:'results',
          label:'Results',
          rows:[{ label:'Key result', value }]
        }]
      }
    };
  }

  function setup() {
    jest.resetModules();
    delete window.Shared;
    global.Shared = {};
    window.Shared = global.Shared;
    require('../js/shared/chartStyle.js');
  }

  function cleanup() {
    delete global.Main;
    delete window.Main;
    delete global.Shared;
    delete window.Shared;
  }

  return {
    installWorkspace,
    reportWithValue,
    setup,
    cleanup,
    get root() { return root; },
    get svg() { return svg; }
  };
}

module.exports = { createStatsFigureSummaryRendererHarness };
