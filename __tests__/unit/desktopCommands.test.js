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
    require('../../js/main/desktopCommands.js');
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

  test('routes Import to the active component capability', async () => {
    const executeCommand = jest.fn(() => ({ status: 'handled' }));
    const activeTab = { id: 'tab-active', type: 'scatter' };

    const commands = loadDesktopCommands();

    commands.init({
      session: { getActiveTab: jest.fn(() => activeTab) },
      workspaces: { scatter: { executeCommand } }
    });

    const result = await commands.execute('importData');

    expect(result).toMatchObject({
      status: 'handled',
      command: 'importData',
      type: 'scatter'
    });
    expect(executeCommand).toHaveBeenCalledWith('importData', expect.objectContaining({
      tab: activeTab,
      tabId: 'tab-active',
      origin: 'desktop'
    }));
  });

  test('does not contain component DOM lookup or button-id maps', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../../js/main/desktopCommands.js'), 'utf8');
    expect(source).not.toContain('IMPORT_BUTTON_IDS');
    expect(source).not.toContain('EXAMPLE_BUTTON_IDS');
    expect(source).not.toContain('.click()');
  });

  test('keeps command execution inside component action registries', () => {
    const fs = require('fs');
    const path = require('path');
    const components = ['box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie', 'venn'];
    components.forEach(type => {
      const source = fs.readFileSync(path.join(__dirname, `../../js/components/${type}.js`), 'utf8');
      const start = source.indexOf(`${type}.executeDesktopCommand = function`);
      expect(start).toBeGreaterThanOrEqual(0);
      const block = source.slice(start, start + 500);
      expect(block).toContain(`${type}.__desktopCommandActions`);
      expect(block).not.toContain('get' + type[0].toUpperCase() + type.slice(1) + 'NodeById');
      expect(block).not.toContain('.click()');
    });
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
