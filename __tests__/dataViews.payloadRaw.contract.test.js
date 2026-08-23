const fs = require('fs');
const path = require('path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8').replace(/\r\n/g, '\n');

const COMPONENT_FILES = [
  'js/components/box.js',
  'js/components/scatter.js',
  'js/components/line.js',
  'js/components/hist.js',
  'js/components/pie.js',
  'js/components/roc.js',
  'js/components/survival.js',
  'js/components/heatmap.js',
  'js/components/surface.js',
  'js/components/pca.js'
];

describe('DataViews Raw payload persistence contract', () => {
  test.each(COMPONENT_FILES)('%s resolves payload.data from the shared Raw-view authority', relative => {
    const source = read(relative);
    expect(source).toContain('resolveRawDataForPersistence');
  });

  test('shared table write-through keeps canonical payload.data on the Raw view', () => {
    const hot = read('js/shared/hot.js');
    expect(hot).toContain('mergeCapturedDataViewsIntoPayload');
    expect(hot).toContain('Shared.dataViewPersistence?.resolveRawDataForPersistence?.(dataViewsPayload, nextPayload.data)');
    expect((hot.match(/mergeCapturedDataViewsIntoPayload\(/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  test('both archive builders resolve raw.csv from the shared Raw-view authority', () => {
    const mainArchive = read('js/shared/graphArchive.js');
    const workerArchive = read('js/workers/graphArchive.worker.js');

    const resolverBinding = 'const rawDataResolver = Shared.dataViewPersistence?.resolveRawDataForPersistence;';
    const rawResolution = 'rawDataResolver(rawPayload?.dataViews || null';
    expect(mainArchive).toContain(resolverBinding);
    expect(workerArchive).toContain(resolverBinding);
    expect(mainArchive).toContain(rawResolution);
    expect(workerArchive).toContain(rawResolution);
  });

  test('browser bootstrap loads the persistence authority before archive and DataViews consumers', () => {
    const index = read('index.html');
    const persistenceIndex = index.indexOf('js/shared/dataViewPersistence.js');
    const archiveIndex = index.indexOf('js/shared/graphArchive.js');
    const dataViewsIndex = index.indexOf('js/shared/dataViews.js');

    expect(persistenceIndex).toBeGreaterThanOrEqual(0);
    expect(archiveIndex).toBeGreaterThan(persistenceIndex);
    expect(dataViewsIndex).toBeGreaterThan(persistenceIndex);
  });
});
