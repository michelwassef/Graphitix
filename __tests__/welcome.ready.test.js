describe('welcome startup rendering', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <section id="welcomeScreen" class="welcome-screen">
        <div id="graphSelectionGrid" class="selection-grid"></div>
        <div id="welcomePopularExamplesList"></div>
        <button id="welcomeViewAllExamples"></button>
      </section>
      <div id="workspaceTabsList"></div>
      <button id="workspaceAddTab"></button>
    `;
    global.window.requestAnimationFrame = global.window.requestAnimationFrame || (callback => setTimeout(callback, 0));
    window.Main = {};
  });

  test('renders the complete welcome frame before the heavy application scripts', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const earlyBootstrap = source.indexOf('<script defer src="js/main/bootstrap.js"></script>');
    const heavyGrid = source.indexOf('<script defer src="libs/ag-grid-community/ag-grid-community.min.noStyle.js"></script>');

    expect(earlyBootstrap).toBeGreaterThan(-1);
    expect(earlyBootstrap).toBeLessThan(heavyGrid);
    require('../js/main/bootstrap.js');

    expect(document.querySelectorAll('#graphSelectionGrid .graph-card')).toHaveLength(11);
    expect(document.querySelectorAll('#welcomePopularExamplesList .welcome-example-card')).toHaveLength(11);
    expect(document.getElementById('welcomeScreen').dataset.welcomePresented).toBe('true');
    expect(document.getElementById('welcomeScreen').dataset.welcomeReady).toBeUndefined();
  });

  test('marks welcome ready only after graph cards are generated', () => {
    require('../js/main/bootstrap.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs.js');

    const workspaceState = { tabs: [], activeTabId: null };
    let nextId = 1;
    const session = {
      createTab: input => ({ id: `tab-${nextId++}`, title: input.title, isWelcome: !!input.isWelcome, allowClose: input.allowClose }),
      disposeWorkspaceTabResources: jest.fn(),
      generateUniqueTabTitle: title => title,
      persistActiveTabState: jest.fn()
    };
    const dom = {
      welcomeScreen: document.getElementById('welcomeScreen'),
      selectionGrid: document.getElementById('graphSelectionGrid'),
      tabsList: document.getElementById('workspaceTabsList'),
      addTabBtn: document.getElementById('workspaceAddTab')
    };
    const manager = window.Main.tabs.createManager({
      session,
      previews: { hideTabPreviewTooltip: jest.fn() },
      domControls: {
        showGraphSelection: ({ dom: handles }) => { handles.welcomeScreen.style.display = 'flex'; },
        hideWorkspaceElement: jest.fn()
      },
      tabDrag: {
        applyTabDragClasses: jest.fn(),
        updateTabDragHover: jest.fn(),
        resetTabDragState: jest.fn(),
        moveWorkspaceTab: jest.fn()
      },
      workspaces: {},
      graphTypes: [
        { type: 'box', label: 'Distribution Charts', hint: 'Group comparisons', description: 'Compare groups.' }
      ],
      graphVariants: [],
      dom,
      workspaceState,
      withSessionContext: () => ({})
    });

    expect(dom.welcomeScreen.dataset.welcomeReady).toBeUndefined();
    manager.initializeWorkspace();

    expect(dom.selectionGrid.querySelectorAll('.graph-card')).toHaveLength(1);
    expect(dom.welcomeScreen.dataset.welcomeReady).toBe('true');
  });

  test('preloads selected component bundle without initializing a grid', async () => {
    require('../js/main/bootstrap.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs.js');

    const loadComponentBundle = jest.fn(() => Promise.resolve({ type: 'box' }));
    window.Main.components = { loadComponentBundle };
    const workspaceState = { tabs: [], activeTabId: null };
    let nextId = 1;
    const session = {
      createTab: input => ({ id: `tab-${nextId++}`, title: input.title, isWelcome: !!input.isWelcome, allowClose: input.allowClose }),
      disposeWorkspaceTabResources: jest.fn(),
      generateUniqueTabTitle: title => title,
      persistActiveTabState: jest.fn()
    };
    const dom = {
      welcomeScreen: document.getElementById('welcomeScreen'),
      selectionGrid: document.getElementById('graphSelectionGrid'),
      tabsList: document.getElementById('workspaceTabsList'),
      addTabBtn: document.getElementById('workspaceAddTab')
    };
    const manager = window.Main.tabs.createManager({
      session,
      previews: { hideTabPreviewTooltip: jest.fn() },
      domControls: {
        showGraphSelection: ({ dom: handles }) => { handles.welcomeScreen.style.display = 'flex'; },
        hideWorkspaceElement: jest.fn()
      },
      tabDrag: {
        applyTabDragClasses: jest.fn(),
        updateTabDragHover: jest.fn(),
        resetTabDragState: jest.fn(),
        moveWorkspaceTab: jest.fn()
      },
      workspaces: { box: { type: 'box' } },
      graphTypes: [
        { type: 'box', label: 'Distribution Charts', hint: 'Group comparisons', description: 'Compare groups.' }
      ],
      graphVariants: [],
      dom,
      workspaceState,
      withSessionContext: () => ({})
    });

    manager.initializeWorkspace();
    const card = dom.selectionGrid.querySelector('.graph-card');
    card.dispatchEvent(new Event('pointerenter'));
    card.dispatchEvent(new Event('focusin', { bubbles: true }));
    await Promise.resolve();

    expect(loadComponentBundle).toHaveBeenCalledTimes(1);
    expect(loadComponentBundle).toHaveBeenCalledWith('box', expect.objectContaining({ reason: 'welcome-card-pointerenter' }));
  });
});
