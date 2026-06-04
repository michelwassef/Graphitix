describe('Main.desktopCommands', () => {
  function loadDesktopCommands({ shared = {}, main = {}, desktop = null } = {}) {
    jest.resetModules();
    delete window.Main;
    delete window.Shared;
    delete window.desktop;
    window.Main = main;
    window.Shared = {
      isDebugEnabled: () => false,
      ...shared
    };
    if (desktop) {
      window.desktop = desktop;
    }
    require('../js/main/desktopCommands.js');
    return window.Main.desktopCommands;
  }

  afterEach(() => {
    delete window.desktop;
  });

  test('routes Save As to the workspace save handler with a forced picker', async () => {
    const save = jest.fn().mockResolvedValue({ status: 'saved' });
    const commands = loadDesktopCommands();

    commands.init({
      handleSessionSaveClick: save
    });

    const result = await commands.execute('saveWorkspaceAs');

    expect(result).toEqual({ status: 'saved' });
    expect(save).toHaveBeenCalledWith({
      reason: 'desktop-menu-save-as',
      scope: 'workspace',
      forcePicker: true
    });
  });

  test('invokes Import on the active tab root only', async () => {
    const activeImport = jest.fn();
    const inactiveImport = jest.fn();
    const activeRoot = document.createElement('section');
    const inactiveRoot = document.createElement('section');
    const activeButton = document.createElement('button');
    const inactiveButton = document.createElement('button');
    const activeTab = { id: 'tab-active', type: 'scatter' };

    activeButton.id = 'scatterImport';
    inactiveButton.id = 'scatterImport';
    activeButton.addEventListener('click', activeImport);
    inactiveButton.addEventListener('click', inactiveImport);
    activeRoot.appendChild(activeButton);
    inactiveRoot.appendChild(inactiveButton);
    document.body.appendChild(inactiveRoot);

    const commands = loadDesktopCommands({
      shared: {
        workspaceTabs: {
          getMountedRoot: jest.fn(() => activeRoot)
        }
      }
    });

    commands.init({
      session: { getActiveTab: jest.fn(() => activeTab) },
      workspaces: {
        scatter: { element: inactiveRoot }
      }
    });

    const result = await commands.execute('importData');

    expect(result).toMatchObject({
      status: 'sent',
      command: 'importData',
      type: 'scatter',
      id: 'scatterImport'
    });
    expect(activeImport).toHaveBeenCalledTimes(1);
    expect(inactiveImport).not.toHaveBeenCalled();
  });

  test('activates active-tab toolbar sections without crossing component type', async () => {
    const activateSection = jest.fn(() => true);
    const commands = loadDesktopCommands({
      shared: {
        workspaceToolbar: { activateSection }
      }
    });

    commands.init({
      session: {
        getActiveTab: jest.fn(() => ({ id: 'tab-line', type: 'line' }))
      }
    });

    const result = await commands.execute('showDataControls');

    expect(result).toMatchObject({
      status: 'activated',
      command: 'showDataControls',
      type: 'line',
      section: 'Data'
    });
    expect(activateSection).toHaveBeenCalledWith('line', 'Data');
  });

  test('registers the desktop menu bridge when running under Electron', () => {
    const cleanup = jest.fn();
    const onMenuCommand = jest.fn(() => cleanup);
    const commands = loadDesktopCommands({
      desktop: {
        isDesktop: true,
        onMenuCommand
      }
    });

    commands.init();

    expect(onMenuCommand).toHaveBeenCalledTimes(1);
    expect(typeof onMenuCommand.mock.calls[0][0]).toBe('function');
  });
});
