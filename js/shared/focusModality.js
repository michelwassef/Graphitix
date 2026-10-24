(function initializeFocusModality(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const doc = global.document;
  const root = doc?.documentElement;
  if (!root || typeof doc.addEventListener !== 'function') {
    Shared.focusModality = Object.freeze({
      getCurrentModality() {
        return 'keyboard';
      }
    });
    return;
  }
  const keyboardFocusKeys = new Set([
    'Tab',
    'Enter',
    ' ',
    'Escape',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown'
  ]);
  const textEntrySelector = [
    'textarea',
    'input:not([type])',
    'input[type="text"]',
    'input[type="search"]',
    'input[type="number"]',
    'input[type="email"]',
    'input[type="url"]',
    'input[type="tel"]',
    'input[type="password"]',
    '[contenteditable]:not([contenteditable="false"])'
  ].join(', ');

  doc.addEventListener('pointerdown', () => {
    root.dataset.uiInputModality = 'pointer';
  }, true);

  doc.addEventListener('keydown', event => {
    if (!keyboardFocusKeys.has(event.key)) return;

    const target = event.target;
    const isTextEntry = target instanceof Element && target.matches(textEntrySelector);
    if (isTextEntry && event.key !== 'Tab' && event.key !== 'Escape') return;

    root.dataset.uiInputModality = 'keyboard';
  }, true);

  Shared.focusModality = Object.freeze({
    getCurrentModality() {
      return root.dataset.uiInputModality || 'keyboard';
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
