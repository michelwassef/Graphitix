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
    expect(enriched?.meta?.graphSizing?.version).toBe(3);
    expect(enriched?.meta?.graphSizing).not.toHaveProperty('export');
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
          version: 2,
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

  test('box uses the same payload graph sizing enrichment path as other components', () => {
    const graphSizing = window.Shared?.graphSizing;
    expect(graphSizing).toBeTruthy();

    const payload = { type: 'box', meta: {} };
    const layoutState = {
      version: 1,
      svgBox: {
        style: {
          width: '612px',
          height: '418px'
        },
        dataset: {
          graphWidthPx: '612',
          graphHeightPx: '418',
          graphDefaultWidth: '640',
          graphDefaultHeight: '420',
          resizerDefaultWidth: '640',
          resizerDefaultHeight: '420',
          resizerAspectLocked: 'false'
        }
      }
    };

    const enriched = graphSizing.enrichPayloadWithLayout('box', payload, layoutState, {
      context: 'test-box-layout-enrich'
    });

    expect(enriched).not.toBe(payload);
    expect(enriched?.meta?.graphSizing?.display?.widthPx).toBe(612);
    expect(enriched?.meta?.graphSizing?.display?.heightPx).toBe(418);
    expect(enriched?.meta?.graphSizing?.display?.defaultWidthPx).toBe(640);
    expect(enriched?.meta?.graphSizing?.display?.defaultHeightPx).toBe(420);
    expect(enriched?.meta?.graphSizing).not.toHaveProperty('export');
  });

  test('box payload graph sizing can seed layout when no authoritative layout exists', () => {
    const graphSizing = window.Shared?.graphSizing;
    expect(graphSizing).toBeTruthy();

    const payload = {
      type: 'box',
      meta: {
        graphSizing: {
          version: 2,
          display: {
            widthPx: 512,
            heightPx: 384,
            defaultWidthPx: 640,
            defaultHeightPx: 420,
            minWidthPx: 120,
            minHeightPx: 120,
            maxWidthPx: 1600,
            maxHeightPx: 1200,
            aspectRatio: 4 / 3,
            aspectLocked: false,
            allowUnlimitedWidth: true
          }
        }
      }
    };

    const merged = graphSizing.mergePayloadSizingIntoLayout(null, payload, {
      context: 'test-box-layout-merge'
    });

    expect(merged?.svgBox?.style?.width).toBe('512px');
    expect(merged?.svgBox?.style?.height).toBe('384px');
    expect(merged?.svgBox?.dataset?.graphWidthPx).toBe('512');
    expect(merged?.svgBox?.dataset?.graphHeightPx).toBe('384');
    expect(merged?.svgBox?.dataset?.resizerDefaultWidth).toBe('640');
    expect(merged?.svgBox?.dataset?.resizerDefaultHeight).toBe('420');
  });

  test('unlimited height survives layout capture and payload-only projection', () => {
    const graphSizing = window.Shared?.graphSizing;
    expect(graphSizing).toBeTruthy();

    const layoutState = {
      version: 1,
      svgBox: {
        style: {
          width: '468px',
          height: '456px',
          minWidth: '128px',
          minHeight: '128px',
          maxWidth: 'none',
          maxHeight: 'none',
          aspectRatio: '468 / 456'
        },
        dataset: {
          graphWidthPx: '468',
          graphHeightPx: '456',
          resizerDefaultWidth: '468',
          resizerDefaultHeight: '456',
          resizerMinWidth: '128',
          resizerMinHeight: '128',
          resizerMaxWidth: 'Infinity',
          resizerMaxHeight: 'Infinity',
          resizerUnlimitedWidth: 'true',
          resizerUnlimitedHeight: 'true',
          resizerAspectRatio: String(468 / 456),
          resizerAspectLocked: 'false'
        }
      }
    };

    const enriched = graphSizing.enrichPayloadWithLayout('pca', { type: 'pca', meta: {} }, layoutState, {
      context: 'test-unlimited-height-capture'
    });
    expect(enriched.meta.graphSizing.display.allowUnlimitedHeight).toBe(true);

    const projected = graphSizing.mergePayloadSizingIntoLayout(null, enriched, {
      context: 'test-unlimited-height-project'
    });
    expect(projected.svgBox.style.maxHeight).toBe('none');
    expect(projected.svgBox.dataset.resizerUnlimitedHeight).toBe('true');
    expect(projected.svgBox.dataset.resizerMaxHeight).toBe('Infinity');
    expect(projected.svgBox.dataset.graphMaxHeightPx).toBe('Infinity');
  });

});

describe('graphSizing delayed owner isolation', () => {
  let graphSizing;
  let roots;
  let generations;
  let activeOwnerTabId;

  const makePayload = (width, height) => graphSizing.setPayloadSizing(
    { type: 'scatter', meta: {} },
    { display: { widthPx: width, heightPx: height } },
    { type: 'scatter', context: 'test-owner-sizing-payload' }
  );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    document.body.innerHTML = '<div id="scatterPage"></div>';
    require('../js/shared/chartStyle.js');
    require('../js/shared/graphSizing.js');
    graphSizing = window.Shared.graphSizing;

    roots = {
      A: document.createElement('div'),
      B: document.createElement('div')
    };
    roots.A.innerHTML = '<div class="svgbox" data-owner="A"></div>';
    roots.B.innerHTML = '<div class="svgbox" data-owner="B"></div>';
    generations = { A: 1, B: 1 };
    activeOwnerTabId = 'A';

    window.Shared.workspaceTabs = {
      getMountedRoot: jest.fn((tabId, type) => (
        type === 'scatter' ? (roots[String(tabId)] || null) : null
      )),
      getSessionRecord: jest.fn((tabId, type) => (
        type === 'scatter' && roots[String(tabId)]
          ? { generation: generations[String(tabId)] || 0 }
          : null
      )),
      getActiveSessionInfo: jest.fn(type => (
        type === 'scatter' && activeOwnerTabId
          ? { tabId: activeOwnerTabId, generation: generations[activeOwnerTabId] || 0 }
          : null
      ))
    };
    window.Shared.applyResizableBoxSize = jest.fn(() => null);
  });

  afterEach(() => {
    jest.useRealTimers();
    delete window.Shared?.workspaceTabs;
    delete window.Shared?.applyResizableBoxSize;
    document.body.innerHTML = '';
  });

  test('explicit tab ownership prevents a delayed retry from sizing the visible sibling', () => {
    const visibleSibling = roots.B.querySelector('.svgbox');
    document.getElementById('scatterPage').appendChild(visibleSibling);
    const ownerBox = roots.A.querySelector('.svgbox');

    expect(graphSizing.applyPayloadSizingForType('scatter', makePayload(713, 509), {
      context: 'test-explicit-owner-delay',
      tabId: 'A',
      sessionGeneration: 1,
      retryDelaysMs: [120]
    })).toBe(true);

    jest.advanceTimersByTime(120);

    expect(ownerBox.style.width).toBe('713px');
    expect(ownerBox.style.height).toBe('509px');
    expect(visibleSibling.style.width).toBe('');
    expect(visibleSibling.style.height).toBe('');
  });

  test('inactive owner sizing suppresses component resize callbacks while still sizing that owner', () => {
    document.getElementById('scatterPage').appendChild(roots.A);
    activeOwnerTabId = 'B';
    const ownerBox = roots.A.querySelector('.svgbox');

    graphSizing.applyPayloadSizingForType('scatter', makePayload(704, 506), {
      context: 'test-inactive-owner-resize-callback',
      tabId: 'A',
      sessionGeneration: 1,
      retryDelaysMs: [40]
    });

    jest.advanceTimersByTime(40);

    expect(ownerBox.style.width).toBe('704px');
    expect(ownerBox.style.height).toBe('506px');
    expect(window.Shared.applyResizableBoxSize).toHaveBeenCalledWith(
      ownerBox,
      expect.objectContaining({ suppressOnResize: true })
    );
  });

  test('projected owner sizing keeps its component resize callback enabled', () => {
    document.getElementById('scatterPage').appendChild(roots.A);
    activeOwnerTabId = 'A';
    const ownerBox = roots.A.querySelector('.svgbox');

    graphSizing.applyPayloadSizingForType('scatter', makePayload(702, 504), {
      context: 'test-active-owner-resize-callback',
      tabId: 'A',
      sessionGeneration: 1,
      retryDelaysMs: [40]
    });

    jest.advanceTimersByTime(40);

    expect(window.Shared.applyResizableBoxSize).toHaveBeenCalledWith(
      ownerBox,
      expect.objectContaining({ suppressOnResize: false })
    );
  });

  test('ownerless delayed sizing pins the concrete element present at invocation', () => {
    const page = document.getElementById('scatterPage');
    const original = document.createElement('div');
    original.className = 'svgbox';
    original.dataset.owner = 'original';
    page.appendChild(original);

    expect(graphSizing.applyPayloadSizingForType('scatter', makePayload(641, 477), {
      context: 'test-ownerless-pin',
      retryDelaysMs: [100]
    })).toBe(true);

    const replacement = document.createElement('div');
    replacement.className = 'svgbox';
    replacement.dataset.owner = 'replacement';
    original.replaceWith(replacement);

    jest.advanceTimersByTime(100);

    expect(original.style.width).toBe('641px');
    expect(original.style.height).toBe('477px');
    expect(replacement.style.width).toBe('');
    expect(replacement.style.height).toBe('');
  });

  test('a newer sizing request supersedes older retries for the same owner', () => {
    const ownerBox = roots.A.querySelector('.svgbox');

    graphSizing.applyPayloadSizingForType('scatter', makePayload(601, 451), {
      context: 'test-owner-older',
      tabId: 'A',
      sessionGeneration: 1,
      retryDelaysMs: [180]
    });
    graphSizing.applyPayloadSizingForType('scatter', makePayload(733, 521), {
      context: 'test-owner-newer',
      tabId: 'A',
      sessionGeneration: 1,
      retryDelaysMs: [20]
    });

    jest.advanceTimersByTime(20);
    expect(ownerBox.style.width).toBe('733px');
    expect(ownerBox.style.height).toBe('521px');

    jest.advanceTimersByTime(200);
    expect(ownerBox.style.width).toBe('733px');
    expect(ownerBox.style.height).toBe('521px');
  });

  test('stale session generations cannot publish after an ABA owner reuse', () => {
    const ownerBox = roots.A.querySelector('.svgbox');

    graphSizing.applyPayloadSizingForType('scatter', makePayload(687, 493), {
      context: 'test-owner-stale-generation',
      tabId: 'A',
      sessionGeneration: 1,
      retryDelaysMs: [100]
    });
    generations.A = 2;

    jest.advanceTimersByTime(100);

    expect(ownerBox.style.width).toBe('');
    expect(ownerBox.style.height).toBe('');
  });
});
