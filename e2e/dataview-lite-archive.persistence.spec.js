const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/workspaceHarness');

test('lite archive preserves Raw plus replayable, materialized, and user-edited DataViews exactly', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    !!window.Shared?.graphArchive?.buildArchiveBlob
    && !!window.Shared?.graphArchive?.parseArchiveBuffer
    && !!window.Shared?.dataTransforms?.applyTransform
  ));

  const payload = await page.evaluate(async () => {
    const raw = [
      ['Gene', 'Value'],
      ['A', 1],
      ['B', 3]
    ];
    const transformed = window.Shared.dataTransforms.applyTransform(raw, { type: 'add', value: 1 }, {
      headerRows: 1,
      startCol: 1
    });
    if (!transformed?.ok) {
      throw new Error(transformed?.error || 'Unable to prepare deterministic DataView fixture.');
    }

    const sourcePayload = {
      type: 'heatmap',
      // Deliberately stale/incorrect top-level projection: the archive contract
      // must source Raw from the serialized Raw DataView instead.
      data: [['STALE-DERIVED-PROJECTION']],
      dataViews: {
        version: 3,
        activeViewId: 'edited',
        views: [
          { id: 'raw', kind: 'raw', title: 'Raw', data: raw },
          {
            id: 'replayable',
            kind: 'derived',
            title: 'Add one',
            sourceViewId: 'raw',
            replayable: true,
            transformOptions: { headerRows: 1, startCol: 1 },
            transformSpec: { type: 'add', value: 1 },
            data: transformed.data
          },
          {
            id: 'materialized',
            kind: 'derived',
            title: 'Correlation',
            sourceViewId: 'raw',
            replayable: false,
            transformOptions: null,
            transformSpec: { type: 'heatmapCorrelationMatrix' },
            data: [['Feature', 'A'], ['A', 1]]
          },
          {
            id: 'edited',
            kind: 'derived',
            title: 'Edited add one',
            sourceViewId: 'raw',
            replayable: false,
            transformOptions: { headerRows: 1, startCol: 1 },
            transformSpec: { type: 'add', value: 1 },
            data: [['Gene', 'Value'], ['A', 999], ['B', 4]]
          }
        ]
      },
      activeDataViewId: 'edited',
      config: {}
    };

    const blob = await window.Shared.graphArchive.buildArchiveBlob({
      tabs: [{ title: 'Heatmap', type: 'heatmap', payload: sourcePayload, layout: null }],
      activeIndex: 0,
      scope: 'tab',
      useWorker: false,
      payloadMode: 'lite',
      compressionMode: 'adaptive'
    });
    const parsed = await window.Shared.graphArchive.parseArchiveBuffer(await blob.arrayBuffer(), {
      fileName: 'dataview-lite-contract.graph'
    });
    return parsed.session.tabs[0].payload;
  });

  expect(payload.data).toEqual([
    ['Gene', 'Value'],
    ['A', '1'],
    ['B', '3']
  ]);
  expect(payload.activeDataViewId).toBe('edited');
  expect(payload.dataViews.activeViewId).toBe('edited');
  expect(payload.dataViews.views[0].data).toEqual(payload.data);
  expect(payload.dataViews.views[1].data).toEqual([
    ['Gene', 'Value'],
    ['A', 2],
    ['B', 4]
  ]);
  expect(payload.dataViews.views[2].data).toEqual([
    ['Feature', 'A'],
    ['A', 1]
  ]);
  expect(payload.dataViews.views[3].data).toEqual([
    ['Gene', 'Value'],
    ['A', 999],
    ['B', 4]
  ]);
});

test('lite archive materializes descendants that predate a source-view edit', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    !!window.Shared?.graphArchive?.buildArchiveBlob
    && !!window.Shared?.graphArchive?.parseArchiveBuffer
    && !!window.Shared?.dataViews?.createManager
  ));

  const result = await page.evaluate(async () => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'unit-lite-lineage' });
    manager.initialize([
      ['Gene', 'Value'],
      ['A', 1],
      ['B', 2]
    ]);
    const parent = manager.applyTransform({ type: 'add', value: 1 }, {
      title: 'Parent',
      transformOptions: { headerRows: 1, startCol: 1 }
    });
    const child = manager.applyTransform({ type: 'multiply', value: 2 }, {
      title: 'Child created before parent edit',
      transformOptions: { headerRows: 1, startCol: 1 }
    });
    if (!parent?.ok || !child?.ok) {
      throw new Error('Unable to prepare DataView lineage fixture.');
    }
    const childBeforeEdit = child.view.data.map(row => row.slice());

    manager.activateView(parent.view.id);
    manager.updateActiveData([
      ['Gene', 'Value'],
      ['A', 100],
      ['B', 200]
    ], { userMutation: true });

    const serialized = manager.serialize({ includeData: true });
    const parentRecord = serialized.views.find(view => view.id === parent.view.id);
    const childRecord = serialized.views.find(view => view.id === child.view.id);
    const sourcePayload = {
      type: 'scatter',
      data: parentRecord.data,
      dataViews: serialized,
      activeDataViewId: serialized.activeViewId,
      config: {}
    };
    const blob = await window.Shared.graphArchive.buildArchiveBlob({
      tabs: [{ title: 'Lineage', type: 'scatter', payload: sourcePayload, layout: null }],
      activeIndex: 0,
      scope: 'tab',
      useWorker: false,
      payloadMode: 'lite',
      compressionMode: 'adaptive'
    });
    const parsed = await window.Shared.graphArchive.parseArchiveBuffer(await blob.arrayBuffer(), {
      fileName: 'dataview-lite-lineage.graph'
    });
    return {
      payload: parsed.session.tabs[0].payload,
      childBeforeEdit,
      replayableBeforeSave: {
        parent: parentRecord.replayable,
        child: childRecord.replayable
      }
    };
  });

  expect(result.replayableBeforeSave).toEqual({ parent: false, child: false });
  const restoredParent = result.payload.dataViews.views.find(view => view.title === 'Parent');
  const restoredChild = result.payload.dataViews.views.find(view => view.title === 'Child created before parent edit');
  expect(restoredParent.data).toEqual([
    ['Gene', 'Value'],
    ['A', 100],
    ['B', 200]
  ]);
  expect(restoredChild.data).toEqual(result.childBeforeEdit);
});
