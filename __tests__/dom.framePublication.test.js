describe('shared graph frame publication', () => {
  const NS = 'http://www.w3.org/2000/svg';

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    document.body.innerHTML = '';
    require('../js/shared/dom.js');
  });

  test('keeps the committed frame visible until the replacement commits', () => {
    const container = document.createElement('div');
    const previous = document.createElementNS(NS, 'svg');
    const replacement = document.createElementNS(NS, 'svg');
    previous.id = 'graphSvg';
    container.appendChild(previous);

    const publication = window.Shared.framePublication.stage({
      container,
      frame: replacement,
      publishedId: 'graphSvg',
      component: 'test',
      tabId: 'tab-a',
      canCommit: () => true
    });

    expect(container.querySelector('#graphSvg')).toBe(previous);
    expect(replacement.dataset.graphFramePublication).toBe('staged');
    expect(replacement.dataset.graphFrameOwnerTabId).toBe('tab-a');
    expect(replacement.style.visibility).toBe('hidden');
    expect(window.Shared.framePublication.hasStaged({ component: 'test', tabId: 'tab-a', root: container })).toBe(true);
    expect(window.Shared.framePublication.getStagedCount({ component: 'test', tabId: 'tab-a' })).toBe(1);
    expect(publication.commit()).toBe(true);
    expect(window.Shared.framePublication.hasStaged({ component: 'test', tabId: 'tab-a', root: container })).toBe(false);
    expect(container.querySelector('#graphSvg')).toBe(replacement);
    expect(previous.parentNode).toBeNull();
    expect(replacement.dataset.graphFramePublication).toBe('committed');
    expect(replacement.style.visibility).toBe('');
  });

  test('rejects stale publication and discards only the staged frame', () => {
    const container = document.createElement('div');
    const previous = document.createElementNS(NS, 'svg');
    const replacement = document.createElementNS(NS, 'svg');
    previous.id = 'graphSvg';
    container.appendChild(previous);

    const publication = window.Shared.framePublication.stage({
      container,
      frame: replacement,
      publishedId: 'graphSvg',
      canCommit: () => false
    });

    expect(publication.commit()).toBe(false);
    expect(window.Shared.framePublication.hasStaged({ root: container })).toBe(true);
    expect(publication.cleanup()).toBe(true);
    expect(publication.state).toBe('discarded');
    expect(window.Shared.framePublication.hasStaged({ root: container })).toBe(false);
    expect(container.childNodes).toHaveLength(1);
    expect(container.querySelector('#graphSvg')).toBe(previous);
    expect(replacement.parentNode).toBeNull();
  });

  test('publishes a nested SVG without changing its wrapper layout styles', () => {
    const container = document.createElement('div');
    const wrapper = document.createElement('div');
    const svg = document.createElementNS(NS, 'svg');
    wrapper.style.display = 'flex';
    wrapper.style.pointerEvents = 'all';
    wrapper.appendChild(svg);

    const publication = window.Shared.framePublication.stage({
      container,
      frame: wrapper,
      publishedNode: svg,
      publishedId: 'graphSvg',
      canCommit: () => true
    });

    expect(publication.commit()).toBe(true);
    expect(svg.id).toBe('graphSvg');
    expect(wrapper.style.display).toBe('flex');
    expect(wrapper.style.pointerEvents).toBe('all');
    expect(wrapper.style.position).toBe('');
  });
});
