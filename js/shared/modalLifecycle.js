(function(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const modalLifecycle = Shared.modalLifecycle = Shared.modalLifecycle || {};
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    'summary',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function createManager(doc) {
    const stack = [];
    let previousBodyOverflow = null;
    let keydownBound = false;

    function isVisible(element) {
      if (!element?.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) {
        return false;
      }
      const view = doc.defaultView;
      const style = view?.getComputedStyle?.(element);
      return style?.display !== 'none'
        && style?.visibility !== 'hidden'
        && element.getClientRects().length > 0;
    }

    function getFocusableElements(dialog) {
      return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(element => (
        !element.disabled && isVisible(element)
      ));
    }

    function resolveTarget(value, dialog) {
      if (typeof value === 'function') {
        return value(dialog) || null;
      }
      if (typeof value === 'string') {
        try {
          return dialog.querySelector(value);
        } catch (_error) {
          return null;
        }
      }
      return value || null;
    }

    function focus(element) {
      if (!element || typeof element.focus !== 'function') {
        return false;
      }
      try {
        element.focus({ preventScroll: true });
      } catch (_error) {
        element.focus();
      }
      return doc.activeElement === element;
    }

    function focusEntry(entry) {
      const initial = resolveTarget(entry.initialFocus, entry.dialog);
      if (initial && isVisible(initial) && focus(initial)) {
        return true;
      }
      const first = getFocusableElements(entry.dialog)[0];
      if (first && focus(first)) {
        return true;
      }
      return focus(entry.dialog);
    }

    function makeBackgroundInert(dialog) {
      const changes = [];
      let branch = dialog;
      while (branch && branch !== doc.body) {
        const parent = branch.parentElement;
        if (!parent) break;
        Array.from(parent.children).forEach(sibling => {
          if (sibling === branch || sibling.contains(dialog)) return;
          changes.push({ element: sibling, wasInert: !!sibling.inert });
          sibling.inert = true;
        });
        branch = parent;
      }
      return changes;
    }

    function restoreBackground(entry) {
      (entry.inertChanges || []).reverse().forEach(change => {
        if (change.element?.isConnected) {
          change.element.inert = change.wasInert;
        }
      });
      entry.inertChanges = [];
    }

    function trapTab(event, entry) {
      const focusable = getFocusableElements(entry.dialog);
      if (!focusable.length) {
        event.preventDefault();
        focus(entry.dialog);
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = doc.activeElement;
      const activeIndex = focusable.indexOf(active);
      if (active === entry.dialog || !entry.dialog.contains(active)) {
        event.preventDefault();
        focus(event.shiftKey ? last : first);
      } else if (event.shiftKey && activeIndex === 0) {
        event.preventDefault();
        focus(last);
      } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
        event.preventDefault();
        focus(first);
      }
    }

    function handleKeydown(event) {
      const entry = stack[stack.length - 1];
      if (!entry || !entry.dialog.isConnected) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (entry.closeOnEscape === false) return;
        if (typeof entry.onEscape === 'function') {
          entry.onEscape(event);
        } else {
          close(entry.dialog);
        }
      } else if (event.key === 'Tab') {
        trapTab(event, entry);
      }
    }

    function open(dialog, options = {}) {
      if (!dialog || !doc?.body || stack.some(entry => entry.dialog === dialog)) {
        return false;
      }
      const entry = {
        dialog,
        initialFocus: options.initialFocus || null,
        onEscape: typeof options.onEscape === 'function' ? options.onEscape : null,
        closeOnEscape: options.closeOnEscape !== false,
        returnFocus: options.returnFocus === undefined ? doc.activeElement : options.returnFocus,
        fallbackFocus: options.fallbackFocus || null,
        previousAriaHidden: dialog.getAttribute('aria-hidden'),
        inertChanges: []
      };
      if (!stack.length) {
        previousBodyOverflow = doc.body.style.overflow;
        doc.body.style.overflow = 'hidden';
      }
      dialog.hidden = false;
      dialog.setAttribute('aria-hidden', 'false');
      if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      entry.inertChanges = makeBackgroundInert(dialog);
      stack.push(entry);
      if (!keydownBound) {
        doc.addEventListener('keydown', handleKeydown, true);
        keydownBound = true;
      }
      focusEntry(entry);
      return true;
    }

    function resolveReturnFocus(entry) {
      const target = resolveTarget(entry.returnFocus, doc);
      if (target && isVisible(target)) return target;
      const fallback = resolveTarget(entry.fallbackFocus, doc)
        || doc.querySelector('.workspace-tab[aria-selected="true"]')
        || doc.querySelector('.workspace-page:not([hidden])')
        || doc.querySelector('#welcomeScreen');
      return fallback && isVisible(fallback) ? fallback : null;
    }

    function close(dialog, options = {}) {
      const index = stack.findIndex(entry => entry.dialog === dialog);
      if (index < 0) return false;
      const returnEntry = stack[index];
      while (stack.length > index) {
        const entry = stack.pop();
        entry.dialog.hidden = true;
        if (entry.previousAriaHidden === null) {
          entry.dialog.removeAttribute('aria-hidden');
        } else {
          entry.dialog.setAttribute('aria-hidden', entry.previousAriaHidden);
        }
        restoreBackground(entry);
      }
      if (!stack.length) {
        if (keydownBound) {
          doc.removeEventListener('keydown', handleKeydown, true);
          keydownBound = false;
        }
        doc.body.style.overflow = previousBodyOverflow || '';
        previousBodyOverflow = null;
      }
      if (options.restoreFocus !== false) {
        const remaining = stack[stack.length - 1];
        if (remaining) {
          const target = resolveReturnFocus(returnEntry);
          if (!target || !remaining.dialog.contains(target)) focusEntry(remaining);
          else focus(target);
        } else {
          const target = resolveReturnFocus(returnEntry);
          if (target) focus(target);
        }
      }
      return true;
    }

    function isOpen(dialog) {
      return dialog
        ? stack.some(entry => entry.dialog === dialog)
        : stack.length > 0;
    }

    return { open, close, isOpen };
  }

  modalLifecycle.createManager = createManager;
  const manager = typeof global.document !== 'undefined' ? createManager(global.document) : null;
  ['open', 'close', 'isOpen'].forEach(method => {
    modalLifecycle[method] = (...args) => manager?.[method](...args) || false;
  });
})(typeof window !== 'undefined' ? window : globalThis);
