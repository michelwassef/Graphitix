/** @jest-environment jsdom */

describe('shared SVG text blocks', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
    require('../../js/shared/textBlock.js');
  });

  test('normalizes newline sequences and preserves empty logical lines with UTF-16 offsets', () => {
    const textBlock = window.Shared.textBlock;
    expect(textBlock.normalizeText('A\r\n\rB\n')).toBe('A\n\nB\n');
    expect(textBlock.splitLines('A\n\nB\n')).toEqual([
      { text: 'A', start: 0, end: 1, index: 0 },
      { text: '', start: 2, end: 2, index: 1 },
      { text: 'B', start: 3, end: 4, index: 2 },
      { text: '', start: 5, end: 5, index: 3 }
    ]);
    expect(textBlock.splitLines('😀\nA')[1].start).toBe(3);
  });

  test('aligns lines inside a stable block anchor without moving a single-line title', () => {
    const textBlock = window.Shared.textBlock;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.dataset.fontRole = 'graphTitle';
    title.setAttribute('x', '100');
    title.setAttribute('y', '30');
    title.setAttribute('text-anchor', 'middle');
    svg.appendChild(title);

    textBlock.renderLines(title, 'Long line\nx', (row, line) => { row.textContent = line.text; });
    const rows = Array.from(title.querySelectorAll('tspan[data-title-line="1"]'));
    rows[0].getComputedTextLength = () => 80;
    rows[1].getComputedTextLength = () => 10;
    textBlock.applyAlignment(title, 'left');
    expect(rows.map(row => [row.getAttribute('x'), row.getAttribute('text-anchor')]))
      .toEqual([['60', 'start'], ['60', 'start']]);
    expect(title.getAttribute('text-anchor')).toBe('middle');

    textBlock.applyAlignment(title, 'right');
    expect(rows.map(row => [row.getAttribute('x'), row.getAttribute('text-anchor')]))
      .toEqual([['140', 'end'], ['140', 'end']]);

    const single = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    single.dataset.fontRole = 'xTitle';
    single.setAttribute('x', '240');
    single.setAttribute('text-anchor', 'middle');
    svg.appendChild(single);
    single.textContent = 'One line';
    textBlock.applyAlignment(single, 'left');
    expect(single.getAttribute('x')).toBe('240');
    expect(single.getAttribute('text-anchor')).toBe('middle');
    expect(single.dataset.titleTextAlign).toBe('left');
  });

  test('uses the tallest effective inline font size as the exact added-line reserve', () => {
    const textBlock = window.Shared.textBlock;
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('font-size', '12px');
    expect(textBlock.resolveLineHeight(title, [
      null,
      { fontSize: '18pt' },
      { fontSize: '10px' }
    ])).toBeCloseTo(24, 6);
    expect(textBlock.resolveLineHeight(title, [
      { fontSize: '18pt' }
    ], { fontSize: 8, scale: 0.5 })).toBeCloseTo(12, 6);
  });

  test('marks drafts with the explicit owning tab and component', () => {
    const target = document.createElement('text');
    const mark = jest.fn(() => true);
    window.Main = { session: { markWorkspaceTargetUserModified: mark } };

    expect(window.Shared.textBlock.markDraftModified(target, { tabId: 'tab-a' }, 'line', 'line-title-draft')).toBe(true);
    expect(mark).toHaveBeenCalledWith(target, 'line-title-draft', {
      tabId: 'tab-a',
      componentKey: 'line',
      source: 'line-inline-text-draft',
      origin: 'user',
      affectsPayload: true
    });
    expect(window.Shared.textBlock.markDraftModified(target, { tabId: 'tab-b' }, 'line', 'line-title-draft')).toBe(true);
    expect(mark.mock.calls[1][2].tabId).toBe('tab-b');
  });

});
