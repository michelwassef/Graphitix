describe('dataViewPersistence raw-data and lite-archive contract', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
    require('../js/shared/dataViewPersistence.js');
  });

  afterEach(() => {
    delete window.Shared;
  });

  test('prefers the serialized Raw view over the active derived projection', () => {
    const persistence = window.Shared.dataViewPersistence;
    const raw = [['Value'], [10], [100]];
    const derived = [['Value'], [1], [2]];
    const serialized = {
      activeViewId: 'view-2',
      views: [
        { id: 'raw', kind: 'raw', title: 'Raw', data: raw },
        { id: 'view-2', kind: 'derived', title: 'Log10', sourceViewId: 'raw', data: derived }
      ]
    };

    expect(persistence.resolveRawDataForPersistence(serialized, derived)).toBe(raw);
  });

  test('uses the first serialized view for legacy DataViews without an explicit Raw stamp', () => {
    const persistence = window.Shared.dataViewPersistence;
    const raw = [['Value'], [10]];
    const derived = [['Value'], [1]];
    const serialized = {
      activeViewId: 'filtered',
      views: [
        { id: 'base', title: 'Original', data: raw },
        { id: 'filtered', title: 'Filtered', data: derived }
      ]
    };

    expect(persistence.resolveRawDataForPersistence(serialized, derived)).toBe(raw);
  });

  test('preserves the payload fallback when no serialized Raw matrix is available', () => {
    const persistence = window.Shared.dataViewPersistence;
    const fallback = { labelA: 'A', listA: 'GENE1' };

    expect(persistence.resolveRawDataForPersistence(null, fallback)).toBe(fallback);
    expect(persistence.resolveRawDataForPersistence({ views: [{ id: 'raw', kind: 'raw' }] }, fallback)).toBe(fallback);
  });

  test('classifies only archive-replayable transform specifications as replayable', () => {
    const persistence = window.Shared.dataViewPersistence;

    expect(persistence.isTransformSpecReplayable({ type: 'log10' })).toBe(true);
    expect(persistence.isTransformSpecReplayable({ type: 'formula', expression: 'x + 1' })).toBe(true);
    expect(persistence.isTransformSpecReplayable({
      type: 'pipeline',
      specs: [{ type: 'add', value: 1 }, { type: 'log2', pseudoCount: 1 }]
    })).toBe(true);

    expect(persistence.isTransformSpecReplayable({ type: 'residuals', runtimeOnly: true })).toBe(false);
    expect(persistence.isTransformSpecReplayable({ type: 'histogramFrequency' })).toBe(false);
    expect(persistence.isTransformSpecReplayable({
      type: 'pipeline',
      specs: [{ type: 'add', value: 1 }, { type: 'heatmapMaterialized' }]
    })).toBe(false);
  });

  test('does not trust a replayable=true stamp when the current loader cannot replay the transform', () => {
    const persistence = window.Shared.dataViewPersistence;

    expect(persistence.isViewReplayable({
      id: 'specialized',
      kind: 'derived',
      replayable: true,
      transformOptions: {},
      transformSpec: { type: 'heatmapMaterialized' }
    })).toBe(false);
    expect(persistence.isViewReplayable({
      id: 'edited',
      kind: 'derived',
      replayable: false,
      transformOptions: { headerRows: 1 },
      transformSpec: { type: 'add', value: 1 }
    })).toBe(false);
    expect(persistence.isViewReplayable({
      id: 'missing-options',
      kind: 'derived',
      replayable: true,
      transformSpec: { type: 'add', value: 1 }
    })).toBe(false);
  });

  test('lite archives strip Raw and deterministic derived matrices but retain materialized and edited derived matrices', () => {
    const persistence = window.Shared.dataViewPersistence;
    const serialized = {
      version: 3,
      activeViewId: 'materialized',
      views: [
        { id: 'raw', kind: 'raw', data: [['RAW']] },
        {
          id: 'replayable',
          kind: 'derived',
          sourceViewId: 'raw',
          replayable: true,
          transformOptions: { headerRows: 1, startCol: 1 },
          transformSpec: { type: 'add', value: 1 },
          data: [['REPLAYABLE']]
        },
        {
          id: 'materialized',
          kind: 'derived',
          sourceViewId: 'raw',
          replayable: false,
          transformOptions: null,
          transformSpec: { type: 'heatmapMaterialized' },
          data: [['MATERIALIZED']]
        },
        {
          id: 'edited',
          kind: 'derived',
          sourceViewId: 'raw',
          replayable: false,
          transformOptions: { headerRows: 1, startCol: 1 },
          transformSpec: { type: 'log10' },
          data: [['USER-EDITED']]
        }
      ]
    };

    const lite = persistence.prepareDataViewsForLiteArchive(serialized);
    expect(Object.prototype.hasOwnProperty.call(lite.views[0], 'data')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(lite.views[1], 'data')).toBe(false);
    expect(lite.views[2].data).toEqual([['MATERIALIZED']]);
    expect(lite.views[3].data).toEqual([['USER-EDITED']]);

    const config = persistence.stripAllDataViewMatrices(serialized);
    expect(config.views.every(view => !Object.prototype.hasOwnProperty.call(view, 'data'))).toBe(true);
  });

  test('retains replayable matrices when their source lineage cannot be reconstructed', () => {
    const persistence = window.Shared.dataViewPersistence;
    const serialized = {
      version: 3,
      activeViewId: 'child',
      views: [
        { id: 'raw', kind: 'raw', data: [['RAW']] },
        {
          id: 'child',
          kind: 'derived',
          sourceViewId: 'deleted-source',
          replayable: true,
          transformOptions: { headerRows: 0, startCol: 0 },
          transformSpec: { type: 'add', value: 1 },
          data: [['CHILD-MATERIALIZED']]
        }
      ]
    };

    const lite = persistence.prepareDataViewsForLiteArchive(serialized);
    expect(lite.views[1].data).toEqual([['CHILD-MATERIALIZED']]);
  });

  test('retains replayable matrices when source lineage is cyclic', () => {
    const persistence = window.Shared.dataViewPersistence;
    const serialized = {
      version: 3,
      activeViewId: 'view-a',
      views: [
        { id: 'raw', kind: 'raw', data: [['RAW']] },
        {
          id: 'view-a',
          kind: 'derived',
          sourceViewId: 'view-b',
          replayable: true,
          transformOptions: { headerRows: 0, startCol: 0 },
          transformSpec: { type: 'add', value: 1 },
          data: [['A-MATERIALIZED']]
        },
        {
          id: 'view-b',
          kind: 'derived',
          sourceViewId: 'view-a',
          replayable: true,
          transformOptions: { headerRows: 0, startCol: 0 },
          transformSpec: { type: 'subtract', value: 1 },
          data: [['B-MATERIALIZED']]
        }
      ]
    };

    const lite = persistence.prepareDataViewsForLiteArchive(serialized);
    expect(lite.views[1].data).toEqual([['A-MATERIALIZED']]);
    expect(lite.views[2].data).toEqual([['B-MATERIALIZED']]);
  });

  test('can strip a replayable child whose source is retained materialized data', () => {
    const persistence = window.Shared.dataViewPersistence;
    const serialized = {
      version: 3,
      activeViewId: 'child',
      views: [
        { id: 'raw', kind: 'raw', data: [['RAW']] },
        {
          id: 'materialized',
          kind: 'derived',
          sourceViewId: 'raw',
          replayable: false,
          transformOptions: null,
          transformSpec: { type: 'heatmapMaterialized' },
          data: [['BASE-MATERIALIZED']]
        },
        {
          id: 'child',
          kind: 'derived',
          sourceViewId: 'materialized',
          replayable: true,
          transformOptions: { headerRows: 0, startCol: 0 },
          transformSpec: { type: 'add', value: 1 },
          data: [['CHILD-REPLAYABLE']]
        }
      ]
    };

    const lite = persistence.prepareDataViewsForLiteArchive(serialized);
    expect(lite.views[1].data).toEqual([['BASE-MATERIALIZED']]);
    expect(Object.prototype.hasOwnProperty.call(lite.views[2], 'data')).toBe(false);
  });

});
