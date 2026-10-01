/* global beforeAll, jest */
const { ensureMainSession, ensureWorkspaceTabs, initializeWorkspaceHarness } = require('../__tests__/setup/workspaceHarness');
const { loadComponentTestBootstrap } = require('./componentTestBootstrap');

function createBoxSwarmTestContext() {
  let hooks;
  
  function bindBoxWorkspaceRoot(root, tabId = 'workspace-test'){
    ensureWorkspaceTabs({
      getMountedRoot: () => root
    });
    const { session } = ensureMainSession({
      workspaceState: { tabs: [], activeTabId: tabId },
      activeTab: { id: tabId, type: 'box' }
    });
    session.getActiveTab.mockReturnValue({ id: tabId, type: 'box' });
    if(window.Components?.box){
      window.Components.box.__boundTabId = tabId;
    }
  }
  
  function hasOverlap(result, coordsInput, minDistanceFactor = 2){
    const offsets = Array.isArray(result?.offsets) ? result.offsets : [];
    const coords = (Array.isArray(coordsInput) || ArrayBuffer.isView(coordsInput)) ? coordsInput : [];
    const radius = Number(result?.adjustedRadius);
    if(!offsets.length || !Number.isFinite(radius) || radius <= 0){
      return false;
    }
    const spacingFactor = Number.isFinite(Number(minDistanceFactor)) && Number(minDistanceFactor) > 0
      ? Number(minDistanceFactor)
      : 2;
    const minDistance = radius * spacingFactor - 1e-6;
    const minDistanceSq = minDistance * minDistance;
    for(let i = 0; i < offsets.length; i += 1){
      const ax = Number(offsets[i]) || 0;
      const ay = Number(coords[i]) || 0;
      for(let j = i + 1; j < offsets.length; j += 1){
        const bx = Number(offsets[j]) || 0;
        const by = Number(coords[j]) || 0;
        const dx = bx - ax;
        const dy = by - ay;
        if(dx * dx + dy * dy < minDistanceSq){
          return true;
        }
      }
    }
    return false;
  }
  
  beforeAll(() => {
    jest.resetModules();
    initializeWorkspaceHarness();
    loadComponentTestBootstrap('box');
    hooks = window.Components?.box?.__testHooks;
  });

  return {
    get hooks() {
      return hooks;
    },
    bindBoxWorkspaceRoot,
    hasOverlap
  };
}

module.exports = { createBoxSwarmTestContext };

