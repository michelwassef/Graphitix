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
    require('../../js/vendor.js');
    require('../../js/shared/styleUndo.js');
    require('../../js/shared/textBlock.js');
    require('../../js/shared/fontControls.js');
    require('../../js/shared/dom.js');
  });

  function createEditableText(role, value, onChange = jest.fn(), editOptions = {}){
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
    window.Shared.makeEditable(text, onChange, editOptions);
    return { text, onChange };
  }

  function commitValue(text, value){
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = document.querySelector('.inline-edit-input');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if(window.Shared.textBlock.isTitleRole(text.dataset.fontRole)){
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    }else{
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
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

  test('Enter inserts title line breaks and outside pointer commits the multiline value', () => {
    const { text, onChange } = createEditableText('graphTitle', 'Initial title');
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const editor = document.querySelector('.inline-edit-input');
    expect(editor.tagName).toBe('TEXTAREA');
    editor.value = 'Long title\nshort';
    editor.setSelectionRange(editor.value.length, editor.value.length);
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    expect(editor.value).toBe('Long title\nshort\n');
    expect(Array.from(text.children).map(row => row.dataset.titleLine)).toEqual(['1', '1', '1']);
    const previewRows = Array.from(document.querySelector('.inline-edit-preview').children);
    expect(previewRows).toHaveLength(3);
    expect(previewRows[2].style.minHeight).toBe(previewRows[0].style.minHeight);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector('.inline-edit-input')).toBeNull();
    expect(onChange).toHaveBeenCalledWith('Long title\nshort\n', text);
    expect(text.dataset.titleBlockText).toBe('Long title\nshort\n');
  });

  test('font commands checkpoint edited title text without recording the temporary textarea', () => {
    const onEditCheckpoint = jest.fn(() => true);
    const { text } = createEditableText('graphTitle', 'Title', jest.fn(), { onEditCheckpoint });
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const editor = document.querySelector('.inline-edit-input');
    expect(editor.getAttribute('data-undo-ignore')).toBe('1');
    editor.value = 'Title\nfirst';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    expect(window.Shared.checkpointInlineTitleEditForTab('tab-a', 'font-command')).toBe(true);
    expect(onEditCheckpoint).toHaveBeenCalledWith('Title\nfirst', text, 'font-command');
    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    expect(editor.value).toBe('Title\nfirst');
    expect(window.Shared.checkpointInlineTitleEditForTab('tab-a', 'archive-save')).toBe(false);
    expect(onEditCheckpoint).toHaveBeenCalledTimes(1);
  });

  test('undo and redo restore title text in the active editor and reset its checkpoint baseline', () => {
    let checkpointedValue = '';
    const onEditCheckpoint = jest.fn((value, _target, reason) => {
      if(reason === 'history-command'){
        checkpointedValue = value;
        return true;
      }
      return reason === 'history-restore';
    });
    const { text } = createEditableText('graphTitle', 'Original', jest.fn(), { onEditCheckpoint });
    window.Shared.undoManager = {
      undo: jest.fn(() => {
        window.Shared.fontControls.setTitleText(text, 'Original');
        return true;
      }),
      redo: jest.fn(() => {
        window.Shared.fontControls.setTitleText(text, checkpointedValue);
        return true;
      })
    };
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const editor = document.querySelector('.inline-edit-input');
    editor.value = 'Original\nDraft';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    expect(editor.__undoManagerHandleKeydown({ key: 'z', ctrlKey: true })).toBe(true);
    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    expect(editor.value).toBe('Original');
    expect(text.dataset.titleBlockText || text.textContent).toBe('Original');

    expect(editor.__undoManagerHandleKeydown({ key: 'y', ctrlKey: true })).toBe(true);
    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    expect(editor.value).toBe('Original\nDraft');
    expect(text.dataset.titleBlockText || text.textContent).toBe('Original\nDraft');
    expect(onEditCheckpoint).toHaveBeenCalledWith('Original\nDraft', text, 'history-command');
    expect(onEditCheckpoint).toHaveBeenCalledWith('Original', text, 'history-restore');
  });

  test('all Enter modifiers, Escape, and Tab keep graph-title editing open', () => {
    const { text, onChange } = createEditableText('graphTitle', 'Title');
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const editor = document.querySelector('.inline-edit-input');
    editor.value = 'Title';
    editor.setSelectionRange(5, 5);
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(editor.value).toBe('Title\n\n\n');
    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('IME Enter does not finish editing and outside pointer commits exactly once', () => {
    const { text, onChange } = createEditableText('graphTitle', 'Title');
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const editor = document.querySelector('.inline-edit-input');
    editor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', isComposing: true, keyCode: 229, bubbles: true
    }));
    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    expect(editor.value).toBe('Title');
    expect(onChange).not.toHaveBeenCalled();

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector('.inline-edit-input')).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Title', text);
  });

  test('cache capture sees the current title but leaves its editor open and hidden projection intact', () => {
    const { text, onChange } = createEditableText('graphTitle', 'Title');
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const editor = document.querySelector('.inline-edit-input');
    editor.value = 'Draft\nsecond line';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    expect(text.style.visibility).toBe('hidden');
    expect(text.dataset.titleBlockText).toBe('Draft\nsecond line');

    const otherOwnerCapture = window.Shared.withVisibleInlineTitleTargetsForCapture('tab-b', () => text.style.visibility);
    expect(otherOwnerCapture).toBe('hidden');
    const ownerCapture = window.Shared.withVisibleInlineTitleTargetsForCapture('tab-a', () => ({
      visibility: text.style.visibility,
      title: text.dataset.titleBlockText
    }));
    expect(ownerCapture).toEqual({ visibility: '', title: 'Draft\nsecond line' });
    expect(text.style.visibility).toBe('hidden');
    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    expect(onChange).not.toHaveBeenCalled();

    expect(window.Shared.finalizeInlineTitleEditForTab('tab-b', 'wrong-owner')).toBe(false);
    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    expect(window.Shared.finalizeInlineTitleEditForTab('tab-a', 'tab-switch')).toBe(true);
    expect(document.querySelector('.inline-edit-input')).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Draft\nsecond line', text);
    expect(text.style.visibility).toBe('');
  });

  test('save checkpoint restores an empty title draft, hides it, and keeps editing usable', () => {
    const markWorkspaceTargetUserModified = jest.fn();
    const onInput = jest.fn();
    window.Main.session = { markWorkspaceTargetUserModified };
    const { text, onChange } = createEditableText('graphTitle', 'Keep this title', jest.fn(), { onInput });
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const editor = document.querySelector('.inline-edit-input');
    editor.value = '  \n';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    expect(text.dataset.titleBlockText).toBe('  \n');

    expect(window.Shared.checkpointInlineTitleEditForTab('tab-a', 'archive-save')).toBe(true);
    expect(editor.value).toBe('Keep this title');
    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    expect(text.dataset.titleBlockText || text.textContent).toBe('Keep this title');
    expect(window.Shared.fontControls.exportScopeStyles('box', { tabId: 'tab-a' }).graphTitle)
      .toEqual(expect.objectContaining({ hidden: true }));
    expect(window.Shared.withVisibleInlineTitleTargetsForCapture('tab-a', () => text.style.visibility))
      .toBe('hidden');
    expect(onInput).toHaveBeenLastCalledWith('Keep this title', text);
    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector('.inline-edit-input')).toBe(editor);

    editor.value = 'Edited after save';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    expect(window.Shared.fontControls.areRolesVisible('box', 'graphTitle', { tabId: 'tab-a' })).toBe(true);
    expect(text.style.visibility).toBe('hidden');
  });

  test('multiline SVG titles keep explicit empty lines at stable baselines', () => {
    const text = document.createElementNS(NS, 'text');
    text.dataset.fontRole = 'graphTitle';
    text.setAttribute('x', '100');
    text.setAttribute('y', '20');
    text.setAttribute('font-size', '10');
    document.getElementById('plot').appendChild(text);
    expect(window.Shared.textBlock.renderLines(text, 'A\n\nB', (row, line) => {
      row.textContent = line.text;
    })).toBe(true);
    expect(text.dataset.titleBlockText).toBe('A\n\nB');
    expect(Array.from(text.children).map(row => row.getAttribute('y'))).toEqual(['20', '30', '40']);
    expect(Array.from(text.children).map(row => row.textContent)).toEqual(['A', '', 'B']);
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
    const editor = document.querySelector('.inline-edit-input');
    editor.value = 'Heatmap\nsecond';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    const replacement = document.createElementNS(NS, 'text');
    replacement.textContent = 'Heatmap';
    replacement.dataset.fontKey = 'graphTitle';
    replacement.dataset.fontRole = 'graphTitle';
    replacement.dataset.fontScope = 'box';
    replacement.dataset.fontTabId = 'tab-a';
    document.getElementById('plot').appendChild(replacement);
    window.Shared.makeEditable(replacement, jest.fn());
    await Promise.resolve();

    expect(replacement.style.visibility).toBe('hidden');
    expect(replacement.style.opacity).toBe('0');
    expect(replacement.__inlineEditState).toBe(text.__inlineEditState);
    expect(replacement.dataset.titleBlockText).toBe('Heatmap\nsecond');
    editor.value = 'Heatmap\nsecond\nthird';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    expect(replacement.dataset.titleBlockText).toBe('Heatmap\nsecond\nthird');

    editor
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.inline-edit-input')).toBe(editor);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(replacement.style.visibility).toBe('');
    expect(replacement.style.opacity).toBe('');
  });

  test('native fallback from an inline editor does not undo an unrelated app action', () => {
    require('../../js/shared/undo.js');
    const textarea = document.createElement('textarea');
    textarea.__undoManagerHandleKeydown = () => 'native';
    const unrelatedUndo = jest.fn();
    window.Shared.undoManager.record({
      label: 'unrelated-action',
      tabId: 'tab-a',
      undo: unrelatedUndo
    });

    expect(window.Shared.undoManager.performCommand('undo', {
      tabId: 'tab-a',
      target: textarea
    })).toBe(false);
    expect(unrelatedUndo).not.toHaveBeenCalled();
  });
});
