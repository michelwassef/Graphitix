describe('graphSizing preserves resize baseline', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/shared/chartStyle.js');
    require('../js/shared/graphSizing.js');
  });

  test('enrichPayloadWithLayout stores current display size separately from default size', () => {
    const graphSizing = window.Shared?.graphSizing;
    expect(graphSizing).toBeTruthy();

    const payload = { type: 'venn', meta: {} };
    const layoutState = {
      version: 1,
      svgBox: {
        style: {
          width: '327px',
          height: '327px',
          minWidth: '137px',
          minHeight: '137px',
          maxWidth: '',
          maxHeight: '455px',
          aspectRatio: '1'
        },
        dataset: {
          graphWidthPx: '327',
          graphHeightPx: '327',
          graphDefaultWidth: '455',
          graphDefaultHeight: '455',
          graphMinWidthPx: '137',
          graphMinHeightPx: '137',
          graphMaxWidthPx: 'Infinity',
          graphMaxHeightPx: '455',
          graphAspectRatio: '1',
          graphAspectLocked: 'true',
          resizerDefaultWidth: '455',
          resizerDefaultHeight: '455',
          resizerMinWidth: '137',
          resizerMinHeight: '137',
          resizerMaxWidth: 'Infinity',
          resizerMaxHeight: '455',
          resizerAspectRatio: '1',
          resizerAspectLocked: 'true',
          resizerUnlimitedWidth: 'true'
        }
      }
    };

    const enriched = graphSizing.enrichPayloadWithLayout('venn', payload, layoutState, {
      context: 'test-venn-layout-enrich'
    });

    expect(enriched?.meta?.graphSizing?.display?.widthPx).toBe(327);
    expect(enriched?.meta?.graphSizing?.display?.heightPx).toBe(327);
    expect(enriched?.meta?.graphSizing?.display?.defaultWidthPx).toBe(455);
    expect(enriched?.meta?.graphSizing?.display?.defaultHeightPx).toBe(455);
  });

  test('mergePayloadSizingIntoLayout keeps default svg size when applying saved display size', () => {
    const graphSizing = window.Shared?.graphSizing;
    expect(graphSizing).toBeTruthy();

    const layoutState = {
      version: 1,
      svgBox: {
        style: {
          width: '327px',
          height: '327px'
        },
        dataset: {
          graphDefaultWidth: '455',
          graphDefaultHeight: '455',
          resizerDefaultWidth: '455',
          resizerDefaultHeight: '455',
          resizerMinWidth: '137',
          resizerMinHeight: '137',
          resizerMaxWidth: 'Infinity',
          resizerMaxHeight: '455',
          resizerAspectRatio: '1',
          resizerAspectLocked: 'true',
          resizerUnlimitedWidth: 'true'
        }
      }
    };
    const payload = {
      type: 'venn',
      meta: {
        graphSizing: {
          version: 1,
          display: {
            widthPx: 327,
            heightPx: 327,
            defaultWidthPx: 455,
            defaultHeightPx: 455,
            minWidthPx: 137,
            minHeightPx: 137,
            maxWidthPx: 1365,
            maxHeightPx: 455,
            aspectRatio: 1,
            aspectLocked: true,
            allowUnlimitedWidth: true
          },
          export: {
            widthPx: 327,
            heightPx: 327
          }
        }
      }
    };

    const merged = graphSizing.mergePayloadSizingIntoLayout(layoutState, payload, {
      context: 'test-venn-layout-merge'
    });

    expect(merged?.svgBox?.style?.width).toBe('327px');
    expect(merged?.svgBox?.style?.height).toBe('327px');
    expect(merged?.svgBox?.dataset?.resizerDefaultWidth).toBe('455');
    expect(merged?.svgBox?.dataset?.resizerDefaultHeight).toBe('455');
    expect(merged?.svgBox?.dataset?.graphDefaultWidth).toBe('455');
    expect(merged?.svgBox?.dataset?.graphDefaultHeight).toBe('455');
  });
});
