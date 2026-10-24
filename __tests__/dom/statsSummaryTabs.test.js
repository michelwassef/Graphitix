describe('shared statistical summary tabs', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <section id="first-results">
        <article id="first-overall" class="stats-table-card"><h2 class="stats-table-caption">Overall test summary</h2></article>
        <article id="first-comparisons" class="stats-table-card"><h2 class="stats-table-caption">Multiple comparisons vs reference</h2></article>
      </section>
      <section id="second-results">
        <article id="second-overall" class="stats-table-card"><h2 class="stats-table-caption">Overall test summary</h2></article>
        <article id="second-comparisons" class="stats-table-card"><h2 class="stats-table-caption">Pairwise comparisons</h2></article>
      </section>
    `;
    require('../../js/shared/tabListKeyboard.js');
    require('../../js/shared/statsSummaryTabs.js');
  });

  const readCaption = card => card.querySelector('.stats-table-caption')?.textContent.trim() || '';
  const isOverall = card => /^Overall test summary$/i.test(readCaption(card));
  const isComparisons = card => /comparisons/i.test(readCaption(card));

  function mount(container, options = {}){
    return window.Shared.statsSummaryTabs.mount({
      resultsContainer: container,
      regionLabel: 'Statistical summaries',
      idPrefix: options.idPrefix || 'boxStatsSummaryTab',
      idSuffix: options.idSuffix || '1',
      activeTab: options.activeTab,
      isOverallCard: isOverall,
      isComparisonsCard: isComparisons,
      onSelect: (wrapper, tab) => {
        const selected = window.Shared.statsSummaryTabs.select(wrapper, tab, options.normalize);
        options.onSelect?.(selected, wrapper);
      }
    });
  }

  test('mounts named linked tabs and switches visibility through the shared projection', () => {
    const selectedTabs = [];
    const mounted = mount(document.getElementById('first-results'), {
      activeTab: 'invalid',
      onSelect: tab => selectedTabs.push(tab)
    });

    expect(mounted.wrapper.getAttribute('role')).toBe('region');
    expect(mounted.wrapper.getAttribute('aria-label')).toBe('Statistical summaries');
    expect(mounted.wrapper.getAttribute('data-active-tab')).toBe('overall');
    expect(mounted.overallButton.id).toBe('boxStatsSummaryTabOverall-1');
    expect(mounted.comparisonsButton.id).toBe('boxStatsSummaryTabComparisons-1');
    expect(mounted.overallPanel.getAttribute('aria-labelledby')).toBe(mounted.overallButton.id);
    expect(mounted.comparisonsPanel.getAttribute('aria-labelledby')).toBe(mounted.comparisonsButton.id);
    expect(mounted.overallPanel.hidden).toBe(false);
    expect(mounted.comparisonsPanel.hidden).toBe(true);
    expect(selectedTabs).toEqual([]);

    mounted.comparisonsButton.click();
    expect(mounted.wrapper.getAttribute('data-active-tab')).toBe('comparisons');
    expect(mounted.overallButton.getAttribute('aria-selected')).toBe('false');
    expect(mounted.comparisonsButton.getAttribute('aria-selected')).toBe('true');
    expect(mounted.overallPanel.hidden).toBe(true);
    expect(mounted.comparisonsPanel.hidden).toBe(false);
    expect(selectedTabs).toEqual(['comparisons']);
  });

  test('keeps component ids and selected state isolated between result containers', () => {
    const first = mount(document.getElementById('first-results'), {
      idPrefix: 'boxStatsSummaryTab', idSuffix: '11', activeTab: 'overall'
    });
    const second = mount(document.getElementById('second-results'), {
      idPrefix: 'pieStatsSummaryTab', idSuffix: '4', activeTab: 'comparisons',
      normalize: tab => tab === 'comparisons' ? 'comparisons' : 'overall'
    });

    expect(first.overallButton.id).toBe('boxStatsSummaryTabOverall-11');
    expect(second.overallButton.id).toBe('pieStatsSummaryTabOverall-4');
    expect(first.wrapper.getAttribute('data-active-tab')).toBe('overall');
    expect(second.wrapper.getAttribute('data-active-tab')).toBe('comparisons');
    second.overallButton.click();
    expect(second.wrapper.getAttribute('data-active-tab')).toBe('overall');
    expect(first.wrapper.getAttribute('data-active-tab')).toBe('overall');
  });

  test('leaves cards untouched when the required summary pair is absent', () => {
    const container = document.createElement('section');
    const onlyCard = document.createElement('article');
    onlyCard.className = 'stats-table-card';
    container.appendChild(onlyCard);
    document.body.appendChild(container);

    expect(mount(container)).toBeNull();
    expect(container.firstElementChild).toBe(onlyCard);
    expect(container.querySelector('.stats-summary-tabs')).toBeNull();
  });
});
