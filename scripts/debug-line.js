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

const modules = [
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
];
modules.forEach(modulePath => {
  require(path.join(projectRoot, modulePath));
});

if (window.Main?.components?.preloadAllBundlesSync) {
  window.Main.components.preloadAllBundlesSync();
}

[
  'js/main/session.js',
  'js/main/domControls.js',
  'js/main/sessionActions.js',
  'js/main/styleSync.js',
  'js/main/tabDrag.js',
  'js/main/previews.js',
  'js/main.js'
].forEach(modulePath => {
  require(path.join(projectRoot, modulePath));
});

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
  await activateWorkspace('line');
  const line = window.Components?.line;
  if (!line) {
    throw new Error('Line component missing');
  }
  line.ensure?.();
  const hot = line.getHot?.();
  if (!hot) {
    throw new Error('Line Handsontable missing');
  }
  const matrix = hot.getData();
  matrix[0][0] = 'X';
  matrix[0][1] = 'Series1';
  matrix[0][2] = 'Series2';
  matrix[1][0] = 0; matrix[1][1] = 1; matrix[1][2] = 1;
  matrix[2][0] = 1; matrix[2][1] = 4; matrix[2][2] = 1;
  matrix[3][0] = 2; matrix[3][1] = 9; matrix[3][2] = 4;
  matrix[4][0] = 3; matrix[4][1] = 16; matrix[4][2] = 9;
  console.error('INPUT HEADER BEFORE LOAD:', matrix[0][0], matrix[0][1], matrix[0][2]);
  console.log('MATRIX BEFORE LOAD:', JSON.stringify(matrix.slice(0,6).map(row => Array.isArray(row) ? row.slice(0,4) : row)));
  hot.loadData(matrix);
  const hotAfter = line.getHot?.();
  console.log('HOT SAME INSTANCE:', hotAfter === hot);
  const activeHot = hotAfter || hot;
  const snapshot = activeHot.getData();
  const filePath = path.join(projectRoot, 'matrix-debug.json');
  fs.writeFileSync(filePath, JSON.stringify({
    before: matrix.slice(0,6).map(row => Array.isArray(row) ? row.slice(0,4) : row),
    after: snapshot.slice(0,6).map(row => Array.isArray(row) ? row.slice(0,4) : row)
  }, null, 2));
  console.error('HEADER AFTER LOAD:', snapshot[0]?.[0], snapshot[0]?.[1], snapshot[0]?.[2]);
  const preview = snapshot.slice(0,6).map(row => Array.isArray(row) ? row.slice(0,4) : row);
  console.log('DATA SAMPLE JSON:', JSON.stringify(preview));
  console.log('HEADER ROW:', JSON.stringify(snapshot[0]?.slice?.(0,6)));
  console.log('ROW 1:', JSON.stringify(snapshot[1]?.slice?.(0,6)));

  const regressionSelect = document.getElementById('lineRegressionMode');
  regressionSelect.value = 'linear';
  regressionSelect.dispatchEvent(new window.Event('change'));

  line.draw();
  await new Promise(resolve => setTimeout(resolve, 0));
  const afterDrawData = activeHot.getData();
  console.log('DATA AFTER DRAW HEADER:', JSON.stringify(afterDrawData[0]?.slice?.(0, 6)));
  console.log('DATA AFTER DRAW ROW1:', JSON.stringify(afterDrawData[1]?.slice?.(0, 6)));

  const payload = line.getPayload();
  const summaries = payload?.config?.regression?.seriesSummaries || [];
  console.log('Line summary count:', summaries.length);
  console.log('Summaries:', summaries);
})();
