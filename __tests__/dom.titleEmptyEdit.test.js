describe('shared inline title editing', () => {
  const NS = 'http://www.w3.org/2000/svg';

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div class="workspace-toolbar">
        <div class="workspace-toolbar__section workspace-toolbar__section--dock"></div>
      </div>
      <div id="boxPanel" class="panel" data-workspace-component="box" data-workspace-tab-id="tab-a">
        <svg id="plot"></svg>
      </div>
    `;
    window.Main = {};
    require('../js/vendor.js');
    require('../js/shared/styleUndo.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/dom.js');
  });

  function createEditableText(role, value, onChange = jest.fn()){
    const svg = document.getElementById('plot');
    const text = document.createElementNS(NS, 'text');
    text.textContent = value;
    svg.appendChild(text);
    window.Shared.fontControls.markText(text, {
      scopeId: 'box',
      role,
      key: role,
      tabId: 'tab-a'
    });
    window.Shared.makeEditable(text, onChange);
    return { text, onChange };
  }

  function commitValue(text, value){
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = document.querySelector('.inline-edit-input');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  test('empty graph title hides it while preserving text for restoration', () => {
    const markWorkspaceTargetUserModified = jest.fn();
    window.Main.session = { markWorkspaceTargetUserModified };
    const { text, onChange } = createEditableText('graphTitle', 'Individual values');
    window.Shared.fontControls.importScopeStyles('box', {
      graphTitle: { fontWeight: '700' }
    }, { tabId: 'tab-a' });

    commitValue(text, '');

    expect(onChange).toHaveBeenCalledWith('Individual values', text);
    expect(text.textContent).toBe('Individual values');
    expect(text.style.display).toBe('');
    expect(text.style.visibility).toBe('hidden');
    expect(window.Shared.fontControls.exportScopeStyles('box', { tabId: 'tab-a' }).graphTitle)
      .toEqual(expect.objectContaining({ hidden: true, fontWeight: '700' }));
    expect(markWorkspaceTargetUserModified).toHaveBeenCalledWith(
      text,
      'title-hidden-by-empty-edit',
      expect.objectContaining({
        tabId: 'tab-a',
        componentKey: 'box',
        affectsPayload: true
      })
    );

    window.Shared.fontControls.setRoleVisibility('box', 'graphTitle', true, { tabId: 'tab-a' });
    expect(text.textContent).toBe('Individual values');
    expect(text.style.display).toBe('');
  });

  test('empty axis title hides the axis-title group without erasing labels', () => {
    const { text } = createEditableText('yTitle', 'Value');

    commitValue(text, '   ');

    const styles = window.Shared.fontControls.exportScopeStyles('box', { tabId: 'tab-a' });
    expect(text.textContent).toBe('Value');
    expect(styles.xTitle.hidden).toBe(true);
    expect(styles.yTitle.hidden).toBe(true);
    expect(styles.zTitle.hidden).toBe(true);
  });

  test('non-title text can still be intentionally emptied', () => {
    const { text, onChange } = createEditableText('legendLabel', 'Series A');

    commitValue(text, '');

    expect(onChange).toHaveBeenCalledWith('', text);
    expect(text.textContent).toBe('');
    expect(text.style.display).toBe('');
  });

  test('keeps renderer replacement titles hidden until editing ends', async () => {
    const { text } = createEditableText('graphTitle', 'Heatmap');
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const replacement = document.createElementNS(NS, 'text');
    replacement.textContent = 'Heatmap';
    replacement.dataset.fontKey = 'graphTitle';
    replacement.dataset.fontRole = 'graphTitle';
    document.getElementById('plot').appendChild(replacement);
    await Promise.resolve();

    expect(replacement.style.visibility).toBe('hidden');
    expect(replacement.style.opacity).toBe('0');

    document.querySelector('.inline-edit-input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(replacement.style.visibility).toBe('');
    expect(replacement.style.opacity).toBe('');
  });
});
