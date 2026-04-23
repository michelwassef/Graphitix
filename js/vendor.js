// Vendor entry file for third-party polyfills or small wrappers.
// Keep this file minimal and only include stable utility code that other modules depend on.

// Example: small polyfill guard (add more if needed later)
(function() {
    'use strict';
    if (typeof require === 'function') {
        try {
            require('./shared/workspaceToolbarAccess.js');
            require('./shared/workspaceToolbar.js');
        } catch (err) {
            // Ignore CommonJS-only bootstrap failures outside test/runtime module loading.
        }
    }
    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = function(cb) { return setTimeout(cb, 16); };
    }
    // Provide global DOM helpers for components loaded before main.js
    if (!window.$) {
        window.$ = function(selector, root){ return (root||document).querySelector(selector); };
    }
    if (!window.$$) {
        window.$$ = function(selector, root){ return Array.from((root||document).querySelectorAll(selector)); };
    }
    if (!window.Components) {
        window.Components = {};
    }
    if (typeof globalThis !== 'undefined' && globalThis.Components !== window.Components) {
        globalThis.Components = window.Components;
    }
})();
