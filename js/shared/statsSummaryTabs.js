(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const TAB_SELECTOR = '.stats-summary-tabs__tab';
  const PANEL_SELECTOR = '.stats-summary-tabs__panel';

  function normalizeTab(tab, normalize){
    return typeof normalize === 'function'
      ? normalize(tab)
      : (tab === 'comparisons' ? 'comparisons' : 'overall');
  }

  function select(wrapper, tab, normalize){
    if(!wrapper || wrapper.nodeType !== 1){
      return null;
    }
    const activeTab = normalizeTab(tab, normalize);
    wrapper.setAttribute('data-active-tab', activeTab);
    Array.from(wrapper.querySelectorAll(TAB_SELECTOR)).forEach(button => {
      const selected = button.getAttribute('data-tab') === activeTab;
      button.classList.toggle('stats-summary-tabs__tab--active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    Array.from(wrapper.querySelectorAll(PANEL_SELECTOR)).forEach(panel => {
      const selected = panel.getAttribute('data-tab') === activeTab;
      panel.hidden = !selected;
      panel.setAttribute('aria-hidden', selected ? 'false' : 'true');
    });
    return activeTab;
  }

  function createTabButton(label, tab, id, wrapper, onSelect){
    const button = global.document.createElement('button');
    button.type = 'button';
    button.className = 'stats-summary-tabs__tab';
    button.textContent = label;
    button.id = id;
    button.setAttribute('data-tab', tab);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;
    button.addEventListener('click', () => onSelect(wrapper, tab));
    return button;
  }

  function createPanel(tab, labelledBy){
    const panel = global.document.createElement('div');
    panel.className = 'stats-summary-tabs__panel';
    panel.setAttribute('data-tab', tab);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', labelledBy);
    panel.hidden = true;
    return panel;
  }

  function mount(options = {}){
    const container = options.resultsContainer;
    if(!container || container.nodeType !== 1
      || typeof options.isOverallCard !== 'function'
      || typeof options.isComparisonsCard !== 'function'
      || typeof options.onSelect !== 'function'
      || !String(options.regionLabel || '').trim()){
      return null;
    }
    const cards = Array.from(container.children)
      .filter(node => node?.classList?.contains('stats-table-card'));
    if(cards.length < 2){
      return null;
    }
    const overallCard = cards.find(options.isOverallCard);
    const comparisonsCard = cards.find(options.isComparisonsCard);
    if(!overallCard || !comparisonsCard || overallCard === comparisonsCard){
      return null;
    }

    const wrapper = global.document.createElement('div');
    wrapper.className = 'stats-summary-tabs';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', options.regionLabel);

    const tabList = global.document.createElement('div');
    tabList.className = 'stats-summary-tabs__tablist';
    tabList.setAttribute('role', 'tablist');
    Shared.tabListKeyboard?.attach(tabList);

    const idPrefix = String(options.idPrefix || 'statsSummaryTab');
    const idSuffix = String(options.idSuffix || '1');
    const overallId = `${idPrefix}Overall-${idSuffix}`;
    const comparisonsId = `${idPrefix}Comparisons-${idSuffix}`;
    const overallButton = createTabButton('Overall test summary', 'overall', overallId, wrapper, options.onSelect);
    const comparisonsButton = createTabButton('Multiple comparisons', 'comparisons', comparisonsId, wrapper, options.onSelect);
    const overallPanel = createPanel('overall', overallId);
    const comparisonsPanel = createPanel('comparisons', comparisonsId);

    tabList.append(overallButton, comparisonsButton);
    container.insertBefore(wrapper, overallCard);
    overallPanel.appendChild(overallCard);
    comparisonsPanel.appendChild(comparisonsCard);
    wrapper.append(tabList, overallPanel, comparisonsPanel);
    select(wrapper, options.activeTab, options.normalizeTab);

    return {
      wrapper,
      overallCard,
      comparisonsCard,
      overallButton,
      comparisonsButton,
      overallPanel,
      comparisonsPanel
    };
  }

  Shared.statsSummaryTabs = Object.freeze({ mount, select });
})(typeof window !== 'undefined' ? window : globalThis);
