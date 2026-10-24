describe('shared modal lifecycle', () => {
  let manager;
  let dialog;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <main id="workspace"><button id="open">Open</button></main>
      <section id="modal" hidden aria-hidden="true" role="dialog" aria-modal="true" tabindex="-1">
        <button id="first">First</button>
        <button id="last">Last</button>
      </section>
    `;
    require('../../js/shared/modalLifecycle.js');
    manager = window.Shared.modalLifecycle.createManager(document);
    dialog = document.getElementById('modal');
    [document.getElementById('open'), document.getElementById('first'), document.getElementById('last')]
      .forEach(element => { element.getClientRects = () => [{ width: 1, height: 1 }]; });
  });

  test('traps focus, inerts background, handles Escape, and restores focus', () => {
    const invoker = document.getElementById('open');
    invoker.focus();
    manager.open(dialog, { initialFocus: '#first' });

    expect(dialog.hidden).toBe(false);
    expect(dialog.getAttribute('aria-hidden')).toBe('false');
    expect(document.getElementById('workspace').inert).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('first'));

    document.getElementById('last').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(document.getElementById('first'));

    document.getElementById('first').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(document.getElementById('last'));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog.hidden).toBe(true);
    expect(document.getElementById('workspace').inert).toBe(false);
    expect(document.activeElement).toBe(invoker);
  });

  test('keeps a parent modal inert behind a nested modal and blocks Escape when requested', () => {
    const invoker = document.getElementById('open');
    invoker.focus();
    manager.open(dialog, { initialFocus: '#first' });

    const nested = document.createElement('section');
    nested.hidden = true;
    nested.setAttribute('role', 'dialog');
    nested.tabIndex = -1;
    nested.innerHTML = '<button id="nested-action">Nested action</button>';
    nested.querySelector('button').getClientRects = () => [{ width: 1, height: 1 }];
    document.body.appendChild(nested);
    manager.open(nested, { initialFocus: '#nested-action', closeOnEscape: false });

    expect(document.activeElement).toBe(nested.querySelector('button'));
    expect(dialog.inert).toBe(true);
    expect(document.getElementById('workspace').inert).toBe(true);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(nested.hidden).toBe(false);

    manager.close(nested);
    expect(nested.hidden).toBe(true);
    expect(dialog.inert).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('first'));

    manager.close(dialog);
    expect(document.getElementById('workspace').inert).toBe(false);
    expect(document.activeElement).toBe(invoker);
    nested.remove();
  });
});
