// Tests for js/shared/notes.js — mountFoldable()

describe('Shared.notes.mountFoldable', () => {
  function loadNotes() {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/notes.js');
    return window.Shared.notes;
  }

  let notes;
  let container;

  beforeEach(() => {
    notes = loadNotes();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  // ─── Basic mount ───────────────────────────────────────────────────────────

  test('returns null when container is missing', () => {
    const ctrl = notes.mountFoldable({ container: null });
    expect(ctrl).toBeNull();
  });

  test('returns null when container selector matches nothing', () => {
    const ctrl = notes.mountFoldable({ container: '#nonexistent' });
    expect(ctrl).toBeNull();
  });

  test('mounts a <details> element into the container', () => {
    const ctrl = notes.mountFoldable({ container });
    expect(ctrl).not.toBeNull();
    expect(container.querySelector('details')).not.toBeNull();
  });

  test('returned control has the expected API', () => {
    const ctrl = notes.mountFoldable({ container });
    expect(typeof ctrl.getValue).toBe('function');
    expect(typeof ctrl.setValue).toBe('function');
    expect(typeof ctrl.isOpen).toBe('function');
    expect(typeof ctrl.setOpen).toBe('function');
    expect(typeof ctrl.focus).toBe('function');
    expect(typeof ctrl.destroy).toBe('function');
    expect(ctrl.root).toBeInstanceOf(HTMLElement);
    expect(ctrl.details).toBeInstanceOf(HTMLElement);
    expect(ctrl.editor).toBeInstanceOf(HTMLElement);
  });

  test('<summary> label defaults to "Notes"', () => {
    const ctrl = notes.mountFoldable({ container });
    expect(ctrl.details.querySelector('summary').textContent).toBe('Notes');
  });

  test('custom title is rendered in summary', () => {
    const ctrl = notes.mountFoldable({ container, title: 'Analysis notes' });
    expect(ctrl.details.querySelector('summary').textContent).toBe('Analysis notes');
  });

  test('open:true makes details initially open', () => {
    const ctrl = notes.mountFoldable({ container, open: true });
    expect(ctrl.details.open).toBe(true);
  });

  test('open:false (default) keeps details closed', () => {
    const ctrl = notes.mountFoldable({ container });
    expect(ctrl.details.open).toBe(false);
  });

  // ─── Rich-text mode (default) ──────────────────────────────────────────────

  test('rich-text mode creates a contenteditable div', () => {
    const ctrl = notes.mountFoldable({ container, richText: true });
    expect(ctrl.editor.tagName.toLowerCase()).toBe('div');
    expect(ctrl.editor.getAttribute('contenteditable')).toBe('true');
  });

  test('plain-text mode creates a textarea', () => {
    const ctrl = notes.mountFoldable({ container, richText: false });
    expect(ctrl.editor.tagName.toLowerCase()).toBe('textarea');
  });

  // ─── getValue / setValue ───────────────────────────────────────────────────

  test('getValue returns current editor content (rich-text)', () => {
    const ctrl = notes.mountFoldable({ container, value: '<b>hello</b>' });
    expect(ctrl.getValue()).toBe('<b>hello</b>');
  });

  test('getValue returns current editor value (plain-text)', () => {
    const ctrl = notes.mountFoldable({ container, richText: false, value: 'plain text' });
    expect(ctrl.getValue()).toBe('plain text');
  });

  test('setValue updates editor content (rich-text)', () => {
    const ctrl = notes.mountFoldable({ container });
    ctrl.setValue('<i>updated</i>');
    expect(ctrl.getValue()).toBe('<i>updated</i>');
  });

  test('setValue updates editor value (plain-text)', () => {
    const ctrl = notes.mountFoldable({ container, richText: false });
    ctrl.setValue('new text');
    expect(ctrl.getValue()).toBe('new text');
  });

  test('setValue with null/undefined does not throw', () => {
    const ctrl = notes.mountFoldable({ container });
    expect(() => ctrl.setValue(null)).not.toThrow();
    expect(() => ctrl.setValue(undefined)).not.toThrow();
  });

  // ─── isOpen / setOpen ─────────────────────────────────────────────────────

  test('isOpen reflects details.open state', () => {
    const ctrl = notes.mountFoldable({ container, open: false });
    expect(ctrl.isOpen()).toBe(false);
    ctrl.setOpen(true);
    expect(ctrl.isOpen()).toBe(true);
  });

  test('setOpen(false) closes details', () => {
    const ctrl = notes.mountFoldable({ container, open: true });
    ctrl.setOpen(false);
    expect(ctrl.details.open).toBe(false);
  });

  // ─── onChange callback ────────────────────────────────────────────────────

  test('onChange is fired when editor input event occurs', () => {
    const onChange = jest.fn();
    const ctrl = notes.mountFoldable({ container, richText: false, onChange });
    ctrl.editor.value = 'typed text';
    ctrl.editor.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('typed text');
  });

  // ─── onToggle callback ────────────────────────────────────────────────────

  test('onToggle is fired when details toggle event occurs', () => {
    const onToggle = jest.fn();
    const ctrl = notes.mountFoldable({ container, onToggle });
    ctrl.details.dispatchEvent(new Event('toggle'));
    expect(onToggle).toHaveBeenCalledWith(ctrl.details.open);
  });

  // ─── data-notes-id ────────────────────────────────────────────────────────

  test('data-notes-id is set when id is provided', () => {
    const ctrl = notes.mountFoldable({ container, id: 'analysis-1' });
    expect(ctrl.details.dataset.notesId).toBe('analysis-1');
  });

  test('re-mounting with same id destroys the existing control', () => {
    notes.mountFoldable({ container, id: 'slot-1', richText: false });
    notes.mountFoldable({ container, id: 'slot-1', richText: false });
    // Only one notes block should exist
    expect(container.querySelectorAll('[data-notes-id="slot-1"]')).toHaveLength(1);
  });

  // ─── destroy() ────────────────────────────────────────────────────────────

  test('destroy() removes the details element from the DOM', () => {
    const ctrl = notes.mountFoldable({ container });
    ctrl.destroy();
    expect(container.querySelector('details')).toBeNull();
  });

  test('calling destroy() twice does not throw', () => {
    const ctrl = notes.mountFoldable({ container });
    ctrl.destroy();
    expect(() => ctrl.destroy()).not.toThrow();
  });

  test('onChange is not called after destroy()', () => {
    const onChange = jest.fn();
    const ctrl = notes.mountFoldable({ container, richText: false, onChange });
    ctrl.destroy();
    // Simulate input on the now-detached editor — should not call onChange
    ctrl.editor.value = 'post-destroy';
    ctrl.editor.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  // ─── placeholder ──────────────────────────────────────────────────────────

  test('custom placeholder is applied to rich-text editor', () => {
    const ctrl = notes.mountFoldable({ container, placeholder: 'Enter observations…' });
    expect(ctrl.editor.dataset.placeholder).toBe('Enter observations…');
  });

  test('custom placeholder is applied to plain-text textarea', () => {
    const ctrl = notes.mountFoldable({ container, richText: false, placeholder: 'Notes here' });
    expect(ctrl.editor.placeholder).toBe('Notes here');
  });

  // ─── Module isolation ─────────────────────────────────────────────────────

  test('re-requiring the module does not double-install', () => {
    const notes2 = loadNotes();
    // Should be the same namespace
    expect(notes2).toBe(window.Shared.notes);
    expect(typeof notes2.mountFoldable).toBe('function');
  });
});
