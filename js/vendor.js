// Vendor entry file for third-party polyfills or small wrappers.
// Keep this file minimal and only include stable utility code that other modules depend on.

// Example: small polyfill guard (add more if needed later)
(function() {
    'use strict';
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
})();
