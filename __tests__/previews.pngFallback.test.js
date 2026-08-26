const { bindElementToTab, initializeWorkspaceHarness } = require('./setup/workspaceHarness');

describe('tab preview PNG fallback', () => {
  let pngSequence;

  beforeEach(() => {
    jest.resetModules();
    initializeWorkspaceHarness({ html: '<div id="workspaceTabsList"></div>' });
    pngSequence = 0;
    window.Shared = {
      ...(window.Shared || {}),
      exporter: {
        svgElementToPngBlob: jest.fn(async () => ({ id: `png-${++pngSequence}` })),
        blobToDataUrl: jest.fn(async blob => `data:image/png;base64,${blob.id}`)
      }
    };
    require('../js/main/previews.js');
  });

  function mountSvg(tab, innerMarkup, attributes = '') {
    const element = document.createElement('div');
    element.innerHTML = `
      <div class="svgbox">
        <svg width="640" height="480" viewBox="0 0 640 480" ${attributes}>
          ${innerMarkup}
        </svg>
      </div>
    `;
    document.body.appendChild(element);
    bindElementToTab(element, tab.id);
    window.Main.session.workspaceState.tabs = [tab];
    window.Main.session.workspaceState.activeTabId = tab.id;
    window.Main.session.getActiveTab.mockReturnValue(tab);
    return {
      element,
      svg: element.querySelector('svg'),
      config: { type: tab.type, element }
    };
  }

  test('keeps a lightweight vector preview as SVG', async () => {
    const tab = {
      id: 'line-tab',
      type: 'line',
      payloadSignature: 'payload-1',
      layoutSignature: 'layout-1'
    };
    const { config } = mountSvg(tab, '<path d="M 0 0 L 100 100"></path>');

    const changed = window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      forceCapture: true,
      reason: 'test'
    });

    expect(changed).toBe(true);
    expect(tab.previewMarkup).toContain('<svg');
    expect(tab.previewMeta.format).toBe('svg');
    expect(window.Shared.exporter.svgElementToPngBlob).not.toHaveBeenCalled();
    await window.Main.previews.awaitPendingCaptures([tab.id]);
  });

  test('clears only the canonical owner preview', () => {
    const tab = {
      id: 'box-empty-tab',
      type: 'box',
      payload: { type: 'box', data: [['A'], ['']] },
      previewMarkup: '<svg><path d="M0 0L1 1"></path></svg>',
      previewSignature: 'payload-before-empty',
      previewMeta: { format: 'svg' }
    };
    window.Main.session.workspaceState.tabs = [tab];
    expect(window.Main.previews.clearTabPreview(tab, { reason: 'payload-change' })).toBe(true);
    expect(tab).toMatchObject({
      previewMarkup: null,
      previewSignature: null,
      previewMeta: null
    });
  });

  test('does not block populated preview capture when payload renderability is true', () => {
    const tab = {
      id: 'box-populated-tab',
      type: 'box',
      payload: { type: 'box', data: [['A'], [1]] },
      payloadSignature: 'payload-populated'
    };
    const { element } = mountSvg(tab, '<path d="M 0 0 L 100 100"></path>');
    const config = { type: 'box', element, hasRenderablePayload: jest.fn(() => true) };

    expect(window.Main.previews.updateTabPreviewFromWorkspace(tab, config, { reason: 'hover-inactive' })).toBe(true);
    expect(tab.previewMarkup).toContain('<svg');
  });

  test('does not recapture stale live DOM for an empty payload revision', () => {
    const tab = {
      id: 'empty-revision-tab',
      type: 'heatmap',
      payloadSignature: 'empty-revision',
      previewSuppressedSignature: 'empty-revision'
    };
    const { element } = mountSvg(tab, '<path d="M 0 0 L 100 100"></path>');
    const config = { type: 'heatmap', element };

    expect(window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      forceCapture: true,
      reason: 'hover-inactive'
    })).toBe(false);
    expect(tab.previewMarkup).toBeNull();
  });

  test('scales non-scaling strokes as part of the thumbnail', () => {
    const tab = {
      id: 'heatmap-stroke-tab',
      type: 'heatmap',
      payloadSignature: 'payload-stroke',
      layoutSignature: 'layout-stroke'
    };
    const { config } = mountSvg(
      tab,
      '<g class="heatmap-dendrogram" stroke-width="4" vector-effect="non-scaling-stroke"><path d="M 0 0 H 100" vector-effect="non-scaling-stroke"></path></g>'
    );

    window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      forceCapture: true,
      reason: 'stroke-scale'
    });

    const template = document.createElement('template');
    template.innerHTML = tab.previewMarkup;
    const previewSvg = template.content.querySelector('svg');
    const dendrogram = previewSvg.querySelector('.heatmap-dendrogram');
    expect(Number(dendrogram.getAttribute('stroke-width'))).toBeCloseTo(1.375, 6);
    expect(previewSvg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  test('stores one PNG image when SVG markup exceeds the shared threshold', async () => {
    const tab = {
      id: 'large-line-tab',
      type: 'line',
      payloadSignature: 'payload-large',
      layoutSignature: 'layout-large',
      payloadVersion: 3,
      layoutVersion: 2
    };
    const hugePath = `M ${'0 0 L 1 1 '.repeat(15000)}`;
    const { config, svg } = mountSvg(tab, `<path d="${hugePath}"></path>`);

    window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      forceCapture: true,
      reason: 'large-vector'
    });
    expect(tab.previewMarkup).toContain('Preparing preview');

    await window.Main.previews.awaitPendingCaptures([tab.id]);

    const rasterSvg = window.Shared.exporter.svgElementToPngBlob.mock.calls[0][0];
    expect(rasterSvg).not.toBe(svg);
    expect(rasterSvg.getAttribute('width')).toBe('220');
    expect(window.Shared.exporter.svgElementToPngBlob).toHaveBeenCalledWith(rasterSvg, expect.objectContaining({
      pngScale: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number)
    }));
    const pngOptions = window.Shared.exporter.svgElementToPngBlob.mock.calls[0][1];
    expect(pngOptions.pngScale).toBeGreaterThanOrEqual(2);
    expect(pngOptions.pngScale).toBeLessThanOrEqual(3);
    expect(pngOptions.width).toBeLessThanOrEqual(320);
    expect(pngOptions.height).toBeLessThanOrEqual(220);
    expect(tab.previewMarkup).toContain('<img');
    expect(tab.previewMarkup).toContain('data-tab-preview-format="png"');
    expect(tab.previewMarkup).not.toContain('<svg');
    expect(tab.previewMeta).toEqual(expect.objectContaining({
      format: 'png',
      rasterized: true,
      rasterScale: pngOptions.pngScale,
      pixelWidth: Math.round(tab.previewMeta.width * pngOptions.pngScale),
      pixelHeight: Math.round(tab.previewMeta.height * pngOptions.pngScale),
      layoutSignature: 'layout-large',
      payloadVersion: 3,
      layoutVersion: 2
    }));
  });

  test('preview capture never advances the graph render-commit checkpoint', async () => {
    const vectorTab = {
      id: 'preview-vector-tab',
      type: 'line',
      payloadSignature: 'vector-payload',
      layoutSignature: 'vector-layout'
    };
    const vector = mountSvg(vectorTab, '<path d="M 0 0 L 10 10"></path>');
    window.Main.previews.updateTabPreviewFromWorkspace(vectorTab, vector.config, {
      forceCapture: true,
      reason: 'preview-vector-commit-barrier'
    });
    await window.Main.previews.awaitPendingCaptures([vectorTab.id]);

    const rasterTab = {
      id: 'preview-raster-tab',
      type: 'scatter',
      payloadSignature: 'raster-payload',
      layoutSignature: 'raster-layout',
      payloadVersion: 4,
      layoutVersion: 3
    };
    const raster = mountSvg(
      rasterTab,
      '<foreignObject data-point-renderer="canvas"><canvas></canvas></foreignObject>'
    );
    window.Main.previews.updateTabPreviewFromWorkspace(rasterTab, raster.config, {
      forceCapture: true,
      reason: 'preview-raster-commit-barrier'
    });
    await window.Main.previews.awaitPendingCaptures([rasterTab.id]);

    expect(window.Main.session.markTabRenderCommitted).toBeUndefined();
  });

  test('refreshes a legacy low-resolution PNG when its live owner is available', async () => {
    const tab = {
      id: 'legacy-raster-tab',
      type: 'scatter',
      payloadSignature: 'legacy-payload',
      layoutSignature: 'legacy-layout',
      payloadVersion: 1,
      layoutVersion: 1,
      previewSignature: 'legacy-payload',
      previewMarkup: '<img src="data:image/png;base64,legacy" width="220" height="165" data-tab-preview-format="png">',
      previewMeta: {
        format: 'png',
        rasterized: true,
        rasterScale: 1,
        width: 220,
        height: 165,
        layoutSignature: 'legacy-layout',
        payloadVersion: 1,
        layoutVersion: 1
      }
    };
    const { config } = mountSvg(
      tab,
      '<foreignObject data-point-renderer="canvas"><canvas></canvas></foreignObject>'
    );

    const changed = window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      reason: 'refresh-raster-scale'
    });
    expect(changed).toBe(true);
    await window.Main.previews.awaitPendingCaptures([tab.id]);

    const pngOptions = window.Shared.exporter.svgElementToPngBlob.mock.calls[0][1];
    expect(pngOptions.pngScale).toBeGreaterThanOrEqual(2);
    expect(tab.previewMeta.rasterScale).toBe(pngOptions.pngScale);
    expect(tab.previewMarkup).not.toContain('base64,legacy');
  });

  test.each(['box', 'scatter', 'heatmap'])(
    'converts a canvas-backed %s graph into one PNG preview',
    async type => {
      const tab = {
        id: `${type}-tab`,
        type,
        payloadSignature: `${type}-payload`,
        layoutSignature: `${type}-layout`
      };
      const { config } = mountSvg(
        tab,
        '<g data-export-layer="data"><foreignObject data-point-renderer="canvas"><canvas></canvas></foreignObject></g>'
      );

      window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
        forceCapture: true,
        reason: 'canvas-preview'
      });
      await window.Main.previews.awaitPendingCaptures([tab.id]);

      expect(tab.previewMarkup.match(/<img/g)).toHaveLength(1);
      expect(tab.previewMarkup).not.toContain('<svg');
      expect(tab.previewMarkup).not.toContain('foreignObject');
      expect(tab.previewMeta.format).toBe('png');
    }
  );

  test('rejects a raster result after its owning payload changes', async () => {
    let resolveBlob;
    window.Shared.exporter.svgElementToPngBlob.mockImplementation(
      () => new Promise(resolve => { resolveBlob = resolve; })
    );
    const tab = {
      id: 'stale-tab',
      type: 'scatter',
      payloadSignature: 'payload-before',
      layoutSignature: 'layout-before',
      payloadVersion: 1
    };
    const { config } = mountSvg(
      tab,
      '<foreignObject data-point-renderer="canvas"><canvas></canvas></foreignObject>'
    );

    window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      forceCapture: true,
      reason: 'stale-test'
    });
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    tab.payloadSignature = 'payload-after';
    tab.payloadVersion = 2;
    resolveBlob({ id: 'stale' });
    await window.Main.previews.awaitPendingCaptures([tab.id]);

    expect(tab.previewMarkup).toContain('Preparing preview');
    expect(tab.previewMarkup).not.toContain('data-tab-preview-format="png"');
  });

  test('keeps simultaneous same-component raster results with their owners', async () => {
    const first = {
      id: 'scatter-first',
      type: 'scatter',
      payloadSignature: 'first-payload',
      layoutSignature: 'first-layout'
    };
    const second = {
      id: 'scatter-second',
      type: 'scatter',
      payloadSignature: 'second-payload',
      layoutSignature: 'second-layout'
    };
    const firstMounted = mountSvg(
      first,
      '<foreignObject data-point-renderer="canvas"><canvas></canvas></foreignObject>'
    );
    const secondMounted = mountSvg(
      second,
      '<foreignObject data-point-renderer="canvas"><canvas></canvas></foreignObject>'
    );
    window.Main.session.workspaceState.tabs = [first, second];

    window.Main.previews.updateTabPreviewFromWorkspace(first, firstMounted.config, {
      forceCapture: true,
      reason: 'owner-first'
    });
    window.Main.previews.updateTabPreviewFromWorkspace(second, secondMounted.config, {
      forceCapture: true,
      reason: 'owner-second'
    });
    await window.Main.previews.awaitPendingCaptures();

    expect(first.previewMarkup).toContain('data-preview-owner-tab-id="scatter-first"');
    expect(second.previewMarkup).toContain('data-preview-owner-tab-id="scatter-second"');
    expect(first.previewMarkup).not.toBe(second.previewMarkup);
  });

  test('renders a restored PNG preview without rebuilding it', () => {
    const previews = window.Main.previews;
    const tab = {
      id: 'restored-tab',
      type: 'heatmap',
      previewMarkup: '<img src="data:image/png;base64,restored" width="220" height="150" data-tab-preview-format="png">',
      previewMeta: { format: 'png', width: 220, height: 150 }
    };
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({ left: 40, top: 200, width: 120, height: 24, bottom: 224 });
    document.body.appendChild(anchor);

    previews.showTabPreviewTooltip(tab, anchor);

    const image = previews.ensureTabPreviewTooltipElement().querySelector('img');
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,restored');
    expect(image?.style.objectFit).toBe('contain');
    expect(window.Shared.exporter.svgElementToPngBlob).not.toHaveBeenCalled();
  });
});
