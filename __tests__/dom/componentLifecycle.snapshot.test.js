require('../../js/shared/componentLifecycle.js');
const lifecycle = global.Shared.componentLifecycle;

describe('componentLifecycle cache snapshot', () => {
  test('clones settled children, skips staged publication, and leaves the host unchanged', () => {
    const host = document.createElement('div');
    const settled = document.createElement('svg');
    const staged = document.createElement('svg');
    staged.setAttribute('data-graph-frame-publication', 'staged');
    host.append(settled, staged);

    const snapshot = lifecycle.snapshotCacheableChildren(host);

    expect(snapshot?.count).toBe(1);
    expect(snapshot?.fragment?.firstChild).not.toBe(settled);
    expect(snapshot?.fragment?.firstChild?.isEqualNode(settled)).toBe(true);
    expect(snapshot?.fragment?.querySelector?.('[data-graph-frame-publication="staged"]')).toBeNull();
    expect(Array.from(host.childNodes)).toEqual([settled, staged]);
  });

  test('snapshots canvas pixels into a cache-only bitmap without mutating the live host', () => {
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    canvas.style.width = '16px';
    canvas.style.height = '12px';
    canvas.setAttribute('data-resolution-scale', '2');
    canvas.toDataURL = jest.fn(() => 'data:image/png;base64,cached-canvas');
    foreignObject.appendChild(canvas);
    host.appendChild(foreignObject);

    const originalChildren = Array.from(host.childNodes);
    const snapshot = lifecycle.snapshotCacheableChildren(host, {
      copyCanvasBitmaps: true
    });

    const cachedImage = snapshot?.fragment?.querySelector?.(
      'img[data-graphitix-render-cache-canvas-bitmap="true"]'
    );
    expect(snapshot?.count).toBe(1);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(cachedImage).toBeTruthy();
    expect(cachedImage?.getAttribute('src')).toBe('data:image/png;base64,cached-canvas');
    expect(cachedImage?.getAttribute('width')).toBe('32');
    expect(cachedImage?.getAttribute('height')).toBe('24');
    expect(cachedImage?.getAttribute('data-resolution-scale')).toBe('2');
    expect(snapshot?.fragment?.querySelector?.('canvas')).toBeNull();
    expect(Array.from(host.childNodes)).toEqual(originalChildren);
    expect(host.querySelector('canvas')).toBe(canvas);
  });

  test('handles a canvas that is itself a direct cache child', () => {
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 10;
    canvas.toDataURL = jest.fn(() => 'data:image/png;base64,direct-canvas');
    host.appendChild(canvas);

    const snapshot = lifecycle.snapshotCacheableChildren(host, {
      copyCanvasBitmaps: true
    });

    expect(snapshot?.count).toBe(1);
    expect(snapshot?.fragment?.firstChild?.tagName).toBe('IMG');
    expect(snapshot?.fragment?.firstChild?.getAttribute('src')).toBe('data:image/png;base64,direct-canvas');
    expect(host.firstChild).toBe(canvas);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  test('rejects a canvas snapshot when pixels cannot be exported', () => {
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 10;
    canvas.toDataURL = jest.fn(() => '');
    host.appendChild(canvas);

    expect(lifecycle.snapshotCacheableChildren(host, {
      copyCanvasBitmaps: true
    })).toBeNull();
    expect(host.firstChild).toBe(canvas);
  });
});
