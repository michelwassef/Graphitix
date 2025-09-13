// js/ui.js - DOM interaction and event wiring (module)
import { init } from './app.js';

function setupUI() {
    // Hook up event listeners and minimal DOM wiring here.
    // Move event handler functions out of index.html into this file for maintainability.
    console.log('ui.setup');
    init({});
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupUI);
} else {
    setupUI();
}

// Exports for testing or progressive enhancement
export { setupUI };