describe('fontControls title visibility', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div class="workspace-toolbar">
        <div class="workspace-toolbar__section workspace-toolbar__section--dock"></div>
      </div>
    `;
    require('../js/vendor.js');
    require('../js/shared/fontControls.js');
  });

  function createTitle(role, tabId){
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.fontTabId = tabId;
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.textContent = role;
    svg.appendChild(title);
    document.body.appendChild(svg);
    window.Shared.fontControls.markText(title, {
      scopeId: 'scatter',
      role,
      key: role,
      tabId
    });
    return title;
  }

  test('persists visibility in font styles and isolates tabs', () => {
    const first = createTitle('graphTitle', 'tab-a');
    const second = createTitle('graphTitle', 'tab-b');

    window.Shared.fontControls.setRoleVisibility('scatter', 'graphTitle', false, { tabId: 'tab-a' });

    expect(first.style.display).toBe('');
    expect(first.style.visibility).toBe('hidden');
    expect(second.style.display).toBe('');
    expect(second.style.visibility).toBe('');
    expect(window.Shared.fontControls.areRolesVisible('scatter', 'graphTitle', { tabId: 'tab-a' })).toBe(false);
    expect(window.Shared.fontControls.areRolesVisible('scatter', 'graphTitle', { tabId: 'tab-b' })).toBe(true);
    expect(window.Shared.fontControls.exportScopeStyles('scatter', { tabId: 'tab-a' }))
      .toEqual(expect.objectContaining({ graphTitle: expect.objectContaining({ hidden: true }) }));
  });

  test('restores hidden titles and removes the visibility override when shown', () => {
    window.Shared.fontControls.importScopeStyles('scatter', {
      xTitle: { hidden: true, fontWeight: '700' }
    }, { tabId: 'tab-a' });
    const title = createTitle('xTitle', 'tab-a');

    expect(title.style.display).toBe('');
    expect(title.style.visibility).toBe('hidden');
    window.Shared.fontControls.setRoleVisibility('scatter', 'xTitle', true, { tabId: 'tab-a' });

    expect(title.style.display).toBe('');
    expect(title.style.visibility).toBe('');
    expect(window.Shared.fontControls.exportScopeStyles('scatter', { tabId: 'tab-a' }).xTitle)
      .toEqual({ fontWeight: '700' });
  });

  test('records visibility changes as reversible style state', () => {
    const recordStateChange = jest.fn();
    window.Shared.undoManager = { recordStateChange };
    const title = createTitle('graphTitle', 'tab-a');

    window.Shared.fontControls.setRoleVisibility('scatter', 'graphTitle', false, {
      tabId: 'tab-a',
      recordUndo: true,
      undoLabel: 'title-visibility:graph',
      undoScope: 'scatterPanel'
    });

    expect(recordStateChange).toHaveBeenCalledTimes(1);
    const command = recordStateChange.mock.calls[0][0];
    expect(command).toEqual(expect.objectContaining({
      label: 'title-visibility:graph',
      scope: 'scatterPanel',
      from: true,
      to: false
    }));
    command.apply(true, 'undo');
    expect(title.style.display).toBe('');
  });
});
