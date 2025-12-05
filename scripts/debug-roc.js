const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const projectRoot = path.resolve(__dirname, '..');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/'
});

global.window = dom.window;
global.document = dom.window.document;
Object.getOwnPropertyNames(dom.window).forEach(prop => {
  if (typeof global[prop] === 'undefined') {
    global[prop] = dom.window[prop];
  }
});

require(path.join(projectRoot, '__tests__', 'setup', 'globals.js'));

const htmlPath = path.join(projectRoot, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

document.open();
document.write(html);
document.close();

document.querySelectorAll('script[src]').forEach(script => {
  script.parentNode?.removeChild(script);
});

const requireAll = (modules) => {
  modules.forEach(modPath => {
    require(path.join(projectRoot, modPath));
  });
};

requireAll([
  'js/vendor.js',
  'js/shared/fileIO.js',
  'js/shared/debounce.js',
  'js/shared/undo.js',
  'js/shared/resizer.js',
  'js/shared/dom.js',
  'js/shared/exporter.js',
  'js/shared/chartStyle.js',
  'js/shared/graphSizing.js',
  'js/shared/regression.js',
  'js/shared/stats.js',
  'js/shared/stats-table.js',
  'js/shared/colorPicker.js',
  'js/shared/editHighlight.js',
  'js/shared/axisControls.js',
  'js/shared/fontControls.js',
  'js/shared/formControls.js',
  'js/shared/hot.js',
  'js/shared/componentLayout.js',
  'js/shared/loadingOverlay.js',
  'js/shared/tableImport.js',
  'js/shared/uniprot.js',
  'js/shared/goAnalysis.js',
  'js/shared/stringAnalysis.js',
  'js/main/components.js'
]);

if (window.Main?.components?.preloadAllBundlesSync) {
  window.Main.components.preloadAllBundlesSync();
}

requireAll([
  'js/main/session.js',
  'js/main/domControls.js',
  'js/main/sessionActions.js',
  'js/main/styleSync.js',
  'js/main/tabDrag.js',
  'js/main/previews.js',
  'js/main.js'
]);

async function activateWorkspace(type) {
  const handler = window.Main?.tabs?.handleGraphSelection;
  if (typeof handler !== 'function') {
    throw new Error('handleGraphSelection missing');
  }
  const result = handler(type);
  if (result && typeof result.then === 'function') {
    await result;
  }
  await Promise.resolve();
}

(async () => {
  await activateWorkspace('roc');
  const payload = window.Components?.roc?.getPayload?.();
  if (!payload) {
    throw new Error('ROC payload missing');
  }
  const tableData = payload.data;
  const ensureRow = idx => {
    tableData[idx] = tableData[idx] || [];
    return tableData[idx];
  };
  const htmlName = 'Model <em>Injected</em>';
  const header = ensureRow(0);
  header[0] = 'Label';
  header[1] = htmlName;
  const rows = [
    [1, 0.92],
    [0, 0.12],
    [1, 0.88],
    [0, 0.05]
  ];
  rows.forEach((row, idx) => {
    const target = ensureRow(idx + 1);
    target[0] = row[0];
    target[1] = row[1];
  });
  window.Components.roc.draw();
  const statsResults = document.getElementById('rocStatsResults');
  console.log('Stats HTML:', statsResults?.innerHTML || '(empty)');
  console.log('Stats text nodes:', Array.from(statsResults?.querySelectorAll('p') || []).map(el => el.textContent));
})();
