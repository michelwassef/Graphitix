describe('graph archive render cache serialization', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Main = {};
    window.Shared = {};
    require('../js/main/session.js');
  });

  afterEach(() => {
    delete window.Main;
    delete window.Shared;
  });

  test('serializes canvas-backed cached SVGs with bitmap pixels for archive restore', () => {
    const session = window.Main?.session;
    expect(session).toBeTruthy();

    const fragment = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'scatterSvg');
    svg.setAttribute('width', '320');
    svg.setAttribute('height', '240');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('x', '10');
    foreignObject.setAttribute('y', '20');
    foreignObject.setAttribute('width', '100');
    foreignObject.setAttribute('height', '80');
    foreignObject.setAttribute('data-point-renderer', 'canvas-preview');
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 160;
    canvas.style.width = '100px';
    canvas.style.height = '80px';
    canvas.toDataURL = jest.fn(() => 'data:image/png;base64,Y2FjaGVkLXBvaW50cw==');
    foreignObject.appendChild(canvas);
    svg.appendChild(foreignObject);
    fragment.appendChild(svg);

    const serialized = session.serializeRenderCacheForArchive({
      plot: { fragment, count: 1 },
      __graphitixRenderCache: {
        type: 'scatter',
        complete: true,
        tabId: 'workspace-2'
      }
    });

    const markup = serialized.plot.nodes[0].markup;
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(markup).toContain('data-graphitix-render-cache-canvas-bitmap="true"');
    expect(markup).toContain('data:image/png;base64,Y2FjaGVkLXBvaW50cw==');
    expect(markup).not.toContain('<canvas');

    const tab = {
      id: 'workspace-2',
      type: 'scatter',
      payloadSignature: 'payload',
      layoutSignature: 'layout',
      archiveRenderCache: serialized,
      archiveRenderCacheSignature: 'payload',
      archiveRenderCacheLayoutSignature: 'layout'
    };
    const consumed = session.consumeArchiveRenderCache(tab, { reason: 'test' });
    const restoredImage = consumed.cache.plot.fragment.querySelector('img[data-graphitix-render-cache-canvas-bitmap="true"]');
    expect(restoredImage).toBeTruthy();
    expect(restoredImage.getAttribute('src')).toBe('data:image/png;base64,Y2FjaGVkLXBvaW50cw==');
  });
});
