describe('Shared.editableCombobox', () => {
  beforeAll(() => {
    require('../../js/shared/editableCombobox.js');
  });

  beforeEach(() => {
    document.body.innerHTML = `
      <input id="search" role="combobox" />
      <div id="list" role="listbox">
        <button id="one" role="option" aria-selected="false">One</button>
        <button id="two" role="option" aria-selected="false">Two</button>
        <button id="disabled" role="option" disabled>Disabled</button>
        <button id="hidden" role="option" aria-selected="true" hidden>Hidden</button>
      </div>
    `;
  });

  it('filters unavailable options and moves with caller-selected wrapping', () => {
    const helper = global.Shared.editableCombobox;
    const list = document.getElementById('list');
    const options = helper.getOptions(list);
    const [first, second] = options;

    expect(options.map(option => option.id)).toEqual(['one', 'two']);
    expect(helper.moveActive(options, first, 1)).toBe(second);
    expect(helper.moveActive(options, second, 1)).toBe(second);
    expect(helper.moveActive(options, second, 1, { wrap: true })).toBe(first);
    expect(helper.moveActive(options, null, -1)).toBe(second);
    expect(helper.getEdge(options, 'first')).toBe(first);
    expect(helper.getEdge(options, 'last')).toBe(second);
  });

  it('projects active option and expanded state while retaining input focus', () => {
    const helper = global.Shared.editableCombobox;
    const input = document.getElementById('search');
    const list = document.getElementById('list');
    const options = helper.getOptions(list);
    const [first, second] = options;
    input.focus();

    expect(helper.setActive(input, list, second, { expanded: true })).toBe(second);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe('two');
    expect(first.getAttribute('aria-selected')).toBe('false');
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('hidden').getAttribute('aria-selected')).toBe('false');
    expect(document.activeElement).toBe(input);

    helper.setActive(input, list, first, { expanded: false });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(second.getAttribute('aria-selected')).toBe('false');
  });
});
