const { createPcaViewTestContext } = require('../../test-support/pcaViewTestSuite');

jest.setTimeout(30000);

describe('PCA view controls — preprocessing DataViews', () => {
  const {
    flushAll,
    flushUntil,
  } = createPcaViewTestContext();

  test('RNA-seq preprocessing creates an active filtered-gene AG Grid tab and preserves it in payload', async () => {
    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();
    const raw = [
      ['Label point', true, false, false],
      ['Variable', 'S1', 'S2', 'S3']
    ];
    for (let gene = 0; gene < 501; gene += 1) {
      raw.push([
        `gene-${gene + 1}`,
        gene + 10,
        (gene + 10) * ((gene % 3) + 1),
        (gene + 10) * ((gene % 5) + 1)
      ]);
    }
    hot.loadData(raw);
    hot.applyExclusions({ rows: [], cols: [3], cells: [] }, { silent: true });
    await flushAll(8);

    const preprocessing = document.getElementById('pcaPreprocessing');
    expect(preprocessing).toBeTruthy();
    preprocessing.value = 'rna-seq-normalized-log';
    preprocessing.dispatchEvent(new Event('change', { bubbles: true }));

    await flushUntil(() => {
      const manager = hot.__pcaDataViewsManager;
      return manager?.getActiveView?.()?.transformSpec?.type === 'rnaSeqNormalizedLog';
    }, { limit: 100, step: 2 });

    const manager = hot.__pcaDataViewsManager;
    const activeView = manager.getActiveView();
    expect(manager.getViewCount()).toBe(2);
    expect(activeView.title).toBe('RNA-seq log (filtered genes)');
    expect(activeView.data).toHaveLength(502);
    expect(activeView.data.slice(2).every(row => row.slice(1, 4).every(Number.isFinite))).toBe(true);
    expect(activeView.exclusions).toEqual({ rows: [], cols: [3], cells: [] });
    expect(document.querySelectorAll('#pcaHotWrapper .data-view-tabs__tab')).toHaveLength(2);

    manager.activateView('raw', { reason: 'tab-click' });
    expect(document.getElementById('pcaPreprocessing').value).toBe('none');
    manager.activateView(activeView.id, { reason: 'tab-click' });
    expect(document.getElementById('pcaPreprocessing').value).toBe('rna-seq-normalized-log');

    const payload = window.Components.pca.getPayload();
    expect(payload.data).toHaveLength(503);
    expect(payload.dataViews.views).toHaveLength(2);
    expect(payload.activeDataViewId).toBe(activeView.id);

    window.Components.pca.loadFromPayload(payload, { skipDraw: true });
    const restoredManager = window.Components.pca.getHotInstance().__pcaDataViewsManager;
    expect(restoredManager.getActiveView().transformSpec.type).toBe('rnaSeqNormalizedLog');
    expect(restoredManager.getActiveView().data).toHaveLength(502);
    expect(document.getElementById('pcaPreprocessing').value).toBe('rna-seq-normalized-log');
  });

  test('migrates legacy RNA-seq preprocessing payloads to a materialized DataView', () => {
    window.Components.pca.loadFromPayload({
      type: 'pca',
      data: [
        ['Label point', true, false, false],
        ['Variable', 'S1', 'S2', 'S3'],
        ['g1', 10, 20, 40],
        ['g2', 20, 20, 20],
        ['g3', 10, 40, 160]
      ],
      config: {
        method: 'pca',
        tableFormat: 'standard',
        preprocessing: 'rna-seq-normalized-log'
      }
    }, { skipDraw: true });

    const manager = window.Components.pca.getHotInstance().__pcaDataViewsManager;
    expect(manager.getViewCount()).toBe(2);
    expect(manager.getActiveView().transformSpec.type).toBe('rnaSeqNormalizedLog');
    expect(manager.getActiveView().data).toHaveLength(5);
  });

});
