// Lightweight DOM-ready helper and small utilities to centralize common tasks
export function domReady(fn) {
  if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

export function $ (selector, root = document) {
  return root.querySelector(selector);
}

export function $$ (selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler.call(target, e);
  });
}

// Add other small, well-tested helpers here to keep app.js focused on app logic.
