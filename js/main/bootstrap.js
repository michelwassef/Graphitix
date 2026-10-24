(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  const namespace = Main.bootstrap = Main.bootstrap || {};
  const debug = (message, payload) => {
    if(typeof Shared.debug === 'function'){
      Shared.debug(message, payload);
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      if(typeof payload === 'undefined'){
        console.debug(message);
      }else{
        console.debug(message, payload);
      }
    }
  };
  debug('Debug: Main.bootstrap namespace initialized', { module: 'js/main/bootstrap.js' });

  function welcomeGraphIcon(markup, artworkCenter = {}) {
    const centerX = Number.isFinite(artworkCenter.x) ? artworkCenter.x : 24;
    const centerY = Number.isFinite(artworkCenter.y) ? artworkCenter.y : 24;
    const opticalX = Number.isFinite(artworkCenter.opticalX) ? artworkCenter.opticalX : 0;
    const opticalY = Number.isFinite(artworkCenter.opticalY) ? artworkCenter.opticalY : 0;
    const viewBoxX = centerX - 24 - opticalX;
    const viewBoxY = centerY - 24 - opticalY;
    return `<svg class="welcome-graph-icon" viewBox="${viewBoxX} ${viewBoxY} 48 48" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">${markup}</svg>`;
  }

  const WELCOME_GRAPH_ICONS = Object.freeze({
    box: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <g class="welcome-icon__primary" style="stroke-width:0.85; stroke-linecap:butt; stroke-linejoin:miter; shape-rendering:crispEdges;">
        <path d="M16 16V34 M13.5 16H18.5 M13.5 34H18.5" />
        <rect class="welcome-icon__box" x="13.5" y="22" width="5" height="8" fill="#6d28d9" style="stroke-width:0.85; stroke-linejoin:miter; shape-rendering:crispEdges;" />
        <path d="M13.5 26H18.5" stroke="#ffffff" />

        <path d="M25 13V34 M22.5 13H27.5 M22.5 34H27.5" />
        <rect class="welcome-icon__box" x="22.5" y="19" width="5" height="10" fill="#6d28d9" style="stroke-width:0.85; stroke-linejoin:miter; shape-rendering:crispEdges;" />
        <path d="M22.5 24H27.5" stroke="#ffffff" />

        <path d="M34 19V34 M31.5 19H36.5 M31.5 34H36.5" />
        <rect class="welcome-icon__box" x="31.5" y="24" width="5" height="7" fill="#6d28d9" style="stroke-width:0.85; stroke-linejoin:miter; shape-rendering:crispEdges;" />
        <path d="M31.5 27.5H36.5" stroke="#ffffff" />
      </g>
    `, { x: 25, y: 24.25 }),
    scatter: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <path class="welcome-icon__guide" d="M14.5 32L37.5 15" />
      <g class="welcome-icon__points">
        <circle cx="15.3" cy="31.6" r="1.55" />
        <circle cx="17.5" cy="34.0" r="1.55" />
        <circle cx="19.1" cy="27.8" r="1.55" />
        <circle cx="21.9" cy="30.2" r="1.55" />
        <circle cx="23.6" cy="21.4" r="1.55" />
        <circle cx="25.2" cy="25.5" r="1.55" />
        <circle cx="27.8" cy="26.8" r="1.55" />
        <circle cx="29.0" cy="18.7" r="1.55" />
        <circle cx="31.5" cy="21.0" r="1.55" />
        <circle cx="33.1" cy="13.6" r="1.55" />
        <circle cx="34.5" cy="18.2" r="1.55" />
        <circle cx="37.1" cy="14.7" r="1.55" />
      </g>
    `, { x: 25, y: 24.25 }),
    line: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <path class="welcome-icon__area" d="M11 35L17 30L23 27L29 20L35 17L40 12V38H11Z" />
      <path class="welcome-icon__primary" d="M11 35L17 30L23 27L29 20L35 17L40 12" />
    `, { x: 25, y: 24.25 }),
    hist: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <g class="welcome-icon__bars">
        <rect x="14" y="28.5" width="4" height="9.5" />
        <rect x="19" y="22.5" width="4" height="15.5" />
        <rect x="24" y="17" width="4" height="21" />
        <rect x="29" y="20" width="4" height="18" />
        <rect x="34" y="26.5" width="4" height="11.5" />
      </g>
      <path class="welcome-icon__density" d="M13.5 31.5C17.2 24.5 21.2 18 26 18C30.8 18 34.2 24 38.5 31.5" />
    `, { x: 25, y: 24.25 }),
    heatmap: welcomeGraphIcon(`
      <path class="welcome-icon__dendrogram" d="M10 23.5H13 M13 17V30 M13 17H18 M13 30H18 M18 14V20 M18 27V33 M18 14H23 M18 20H23 M18 27H23 M18 33H23" />
      <g class="welcome-icon__heatmap-grid">
        <rect class="welcome-icon__heat-1" x="25" y="11.5" width="6" height="6" />
        <rect class="welcome-icon__heat-2" x="31" y="11.5" width="6" height="6" />
        <rect class="welcome-icon__heat-3" x="37" y="11.5" width="6" height="6" />
        <rect class="welcome-icon__heat-2" x="25" y="17.5" width="6" height="6" />
        <rect class="welcome-icon__heat-3" x="31" y="17.5" width="6" height="6" />
        <rect class="welcome-icon__heat-4" x="37" y="17.5" width="6" height="6" />
        <rect class="welcome-icon__heat-3" x="25" y="23.5" width="6" height="6" />
        <rect class="welcome-icon__heat-4" x="31" y="23.5" width="6" height="6" />
        <rect class="welcome-icon__heat-5" x="37" y="23.5" width="6" height="6" />
        <rect class="welcome-icon__heat-4" x="25" y="29.5" width="6" height="6" />
        <rect class="welcome-icon__heat-5" x="31" y="29.5" width="6" height="6" />
        <rect class="welcome-icon__heat-6" x="37" y="29.5" width="6" height="6" />
      </g>
    `, { x: 26.5, y: 23.5 }),
    pca: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 10H38.5V38.5H10Z M10 38.5V10 M10 10H38.5" />
      <ellipse class="welcome-icon__cluster-a" cx="18.2" cy="29.3" rx="7.2" ry="4.7" transform="rotate(-22 18.2 29.3)" />
      <ellipse class="welcome-icon__cluster-b" cx="30.8" cy="18.8" rx="6.3" ry="4.3" transform="rotate(18 30.8 18.8)" />
      <g class="welcome-icon__points">
        <circle cx="14.5" cy="31.2" r="1.4" />
        <circle cx="18.3" cy="27.6" r="1.4" />
        <circle cx="21.8" cy="30.1" r="1.4" />
        <circle cx="27.9" cy="18.8" r="1.4" />
        <circle cx="31.9" cy="17.2" r="1.4" />
        <circle cx="33.2" cy="22.2" r="1.4" />
      </g>
    `, { x: 24.25, y: 24.25, opticalX: 0.5 }),
    pie: welcomeGraphIcon(`
      <circle class="welcome-icon__donut-a" cx="24" cy="24" r="13" pathLength="100" />
      <circle class="welcome-icon__donut-b" cx="24" cy="24" r="13" pathLength="100" />
      <circle class="welcome-icon__donut-c" cx="24" cy="24" r="13" pathLength="100" />
      <circle class="welcome-icon__donut-hole" cx="24" cy="24" r="6" />
    `),
    roc: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 10H38.5V38.5H10Z M10 38.5V10 M10 10H38.5" />
      <path class="welcome-icon__diagonal" d="M10 38.5L38.5 10" />
      <path class="welcome-icon__primary" d="M10 38.5C11 17 18 11 38.5 11" />
    `, { x: 24.25, y: 24.25 }),
    survival: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <path class="welcome-icon__survival-a" d="M12 13H22V17H29V22H35V31H39" />
      <path class="welcome-icon__survival-b" d="M12 15H16V20H19V24H23V29H26V34H30V38H33" />
    `, { x: 25, y: 24.25 }),
    venn: welcomeGraphIcon(`
      <circle class="welcome-icon__venn-a" cx="21" cy="24" r="10" />
      <circle class="welcome-icon__venn-b" cx="29" cy="24" r="10" />
    `, { x: 25, y: 24 }),
    surface: welcomeGraphIcon(`
      <path class="welcome-icon__surface-back" d="M10.5 29.5L20 21L35 24.5L40.5 17" />
      <path class="welcome-icon__surface-grid" d="M10.5 29.5L18 37L33 33.5L40.5 25.5 M20 21L18 37 M27.5 22.8L25.5 35.2 M35 24.5L33 33.5 M40.5 17L40.5 25.5" />
      <path class="welcome-icon__surface-grid" d="M14.2 26.3L22.2 32.4L37 29 M17.2 23.7L25.4 29.1L40 24.8" />
      <path class="welcome-icon__surface-ridge" d="M10.5 29.5C15.4 24.1 20 21.6 25.8 23.6C31.2 25.5 35.8 22.9 40.5 17" />
    `, { x: 25.5, y: 27 })
  });

  const GRAPH_CATEGORIES = [
    { id: 'compare', label: 'Compare & summarize' },
    { id: 'relate', label: 'Relate & explore' },
    { id: 'outcomes', label: 'Over time & outcomes' }
  ];

  const GRAPH_TYPES = [
    {
      type: 'box',
      category: 'compare',
      label: 'Distribution Charts',
      hint: 'Group comparisons',
      description: 'Compare groups with box, violin, bar, and individual-value plots, with statistical tests.',
      exampleTitle: 'Distribution plot',
      exampleSummary: 'Inspect individual values, group spread, and statistical differences.',
      previewAsset: 'assets/welcome-examples/box.svg',
      popular: true,
      icon: WELCOME_GRAPH_ICONS.box
    },
    {
      type: 'scatter',
      category: 'relate',
      label: 'XY Plots',
      hint: 'Correlation & expression',
      description: 'Create scatter plots in 2D/3D, or volcano and MA plots.',
      exampleTitle: 'Scatter plot',
      exampleSummary: 'Explore pairwise relationships, groups, regression, and point-level styling.',
      previewAsset: 'assets/welcome-examples/scatter.svg',
      popular: true,
      icon: WELCOME_GRAPH_ICONS.scatter
    },
    {
      type: 'line',
      category: 'outcomes',
      label: 'Line & Area Charts',
      hint: 'Trends & forecasting',
      description: 'Plot series as lines, areas, or 3D charts with regression and forecasts.',
      exampleTitle: 'Line graph',
      exampleSummary: 'Show trajectories, repeated measures, and time-dependent patterns.',
      previewAsset: 'assets/welcome-examples/line.svg',
      popular: false,
      icon: WELCOME_GRAPH_ICONS.line
    },
    {
      type: 'hist',
      category: 'compare',
      label: 'Histogram / Density Plot',
      hint: 'Frequency distribution',
      description: 'Explore distributions with custom bins, density curves, and model fitting.',
      exampleTitle: 'Histogram',
      exampleSummary: 'Inspect distribution shape, spread, tails, and fitted probability models.',
      previewAsset: 'assets/welcome-examples/hist.svg',
      popular: false,
      icon: WELCOME_GRAPH_ICONS.hist
    },
    {
      type: 'heatmap',
      category: 'relate',
      label: 'Heatmap & Clustering',
      hint: 'Matrix view',
      description: 'Visualize data or correlations; cluster rows/columns, flag significant pairs.',
      exampleTitle: 'Clustered heatmap',
      exampleSummary: 'Reveal coordinated patterns, sample structure, and hierarchical clusters.',
      previewAsset: 'assets/welcome-examples/heatmap.svg',
      popular: true,
      icon: WELCOME_GRAPH_ICONS.heatmap
    },
    {
      type: 'pca',
      category: 'relate',
      label: 'Dimensionality Reduction',
      hint: 'PCA / MDS / t-SNE / UMAP',
      description: 'Explore high-dimensional data with PCA, MDS, t-SNE, or UMAP.',
      exampleTitle: 'PCA plot',
      exampleSummary: 'Project high-dimensional samples into an interpretable low-dimensional view.',
      previewAsset: 'assets/welcome-examples/pca.svg',
      popular: false,
      icon: WELCOME_GRAPH_ICONS.pca
    },
    {
      type: 'pie',
      category: 'compare',
      label: 'Pie, Donut & Stacked Bar',
      hint: 'Category proportions',
      description: 'Visualize category proportions and compare them with chi-square tests.',
      exampleTitle: 'Proportion charts',
      exampleSummary: 'Compare observed composition with reference or expected proportions.',
      previewAsset: 'assets/welcome-examples/pie.svg',
      popular: false,
      icon: WELCOME_GRAPH_ICONS.pie
    },
    {
      type: 'roc',
      category: 'outcomes',
      label: 'Classification Curves',
      hint: 'ROC & precision-recall',
      description: 'Assess and compare classifiers with ROC or precision-recall curves.',
      exampleTitle: 'ROC curves',
      exampleSummary: 'Assess diagnostic discrimination and compare several biomarkers or models.',
      previewAsset: 'assets/welcome-examples/roc.svg',
      popular: true,
      icon: WELCOME_GRAPH_ICONS.roc
    },
    {
      type: 'survival',
      category: 'outcomes',
      label: 'Survival Analysis',
      hint: 'Time-to-event analysis',
      description: 'Analyze survival with Kaplan-Meier curves, log-rank tests, and Cox regression.',
      exampleTitle: 'Survival curves',
      exampleSummary: 'Analyse time-to-event outcomes with Kaplan-Meier and Cox workflows.',
      previewAsset: 'assets/welcome-examples/survival.svg',
      popular: false,
      icon: WELCOME_GRAPH_ICONS.survival
    },
    {
      type: 'venn',
      category: 'compare',
      label: 'Venn Diagram / UpSet Plot',
      hint: 'Set comparisons',
      description: 'Compare set overlaps with Venn or UpSet plots and enrichment analysis.',
      exampleTitle: 'Venn diagram',
      exampleSummary: 'Inspect shared and unique members across several biological sets.',
      previewAsset: 'assets/welcome-examples/venn.svg',
      popular: false,
      icon: WELCOME_GRAPH_ICONS.venn
    },
    {
      type: 'surface',
      category: 'relate',
      label: '3D Surface Plot',
      hint: '3D visualization',
      description: 'Explore X/Y/Z data as 3D surfaces or points, with rotation and color ramps.',
      exampleTitle: '3D surface',
      exampleSummary: 'Explore a continuous response landscape across two predictors.',
      previewAsset: 'assets/welcome-examples/surface.svg',
      popular: false,
      icon: WELCOME_GRAPH_ICONS.surface
    }
  ];

  const SESSION_FILE_TYPES = [
    {
      description: 'Workspace Graph Archive',
      accept: {
        'application/zip': ['.graph'],
        'application/json': ['.json']
      }
    }
  ];

  function createElement(tagName, className, text, doc) {
    const element = doc.createElement(tagName);
    if (className) element.className = className;
    if (typeof text === 'string') element.textContent = text;
    return element;
  }

  namespace.createWelcomeGraphCard = function createWelcomeGraphCard(info, doc = document) {
    if (!info?.type || !doc?.createElement) return null;

    const card = createElement('article', 'graph-card', null, doc);
    card.dataset.graphType = info.type;

    const main = createElement('div', 'graph-card__main', null, doc);
    const icon = createElement('div', 'graph-card__icon', null, doc);
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = info.icon || '';
    const content = createElement('div', 'graph-card__content', null, doc);
    content.appendChild(createElement('h3', 'graph-card__title', info.label || '', doc));
    content.appendChild(createElement('p', 'graph-card__description', info.description || '', doc));
    main.append(icon, content);

    const actions = createElement('div', 'graph-card__actions', null, doc);
    const newButton = createElement('button', 'graph-card__action graph-card__action--new', 'New', doc);
    newButton.type = 'button';
    newButton.dataset.welcomeAction = 'new';
    newButton.setAttribute('aria-label', `New ${info.label || info.type}`);
    const exampleButton = createElement('button', 'graph-card__action graph-card__action--example', 'Load example', doc);
    exampleButton.type = 'button';
    exampleButton.dataset.welcomeAction = 'example';
    exampleButton.setAttribute('aria-label', `Load example ${info.label || info.type}`);
    actions.append(newButton, exampleButton);

    card.append(main, actions);
    return card;
  };

  function resolveGraphCategory(info) {
    const categoryId = info?.category || GRAPH_CATEGORIES[0].id;
    return GRAPH_CATEGORIES.find(category => category.id === categoryId) || GRAPH_CATEGORIES[0];
  }

  function renderWelcomeGraphCategories(container, items, doc) {
    container.textContent = '';
    const groups = new Map(GRAPH_CATEGORIES.map(category => [category.id, []]));
    items.forEach(info => groups.get(resolveGraphCategory(info).id).push(info));

    const fragment = doc.createDocumentFragment();
    GRAPH_CATEGORIES.forEach(category => {
      const entries = groups.get(category.id);
      if (!entries.length) return;

      const section = createElement('section', 'welcome-graph-category', null, doc);
      const titleId = `welcomeGraphCategory-${category.id}`;
      section.setAttribute('aria-labelledby', titleId);
      const title = createElement('h2', 'welcome-graph-category__title', category.label, doc);
      title.id = titleId;
      const list = createElement('ul', 'welcome-graph-category__items', null, doc);
      list.setAttribute('aria-label', category.label);

      entries.forEach(info => {
        const card = namespace.createWelcomeGraphCard(info, doc);
        if (card) {
          const item = createElement('li', 'welcome-graph-category__item', null, doc);
          item.appendChild(card);
          list.appendChild(item);
        }
      });
      section.append(title, list);
      fragment.appendChild(section);
    });
    container.appendChild(fragment);
    return true;
  }

  namespace.createWelcomeExampleCard = function createWelcomeExampleCard(info, options = {}, doc = document) {
    if (!info?.type || !doc?.createElement) return null;

    const compact = options.compact === true;
    const card = createElement('button', `welcome-example-card${compact ? ' welcome-example-card--compact' : ''}`, null, doc);
    card.type = 'button';
    card.dataset.graphType = info.type;
    card.setAttribute('aria-label', `Load example ${info.label || info.type}`);

    const thumb = createElement('span', 'welcome-example-card__thumb', null, doc);
    const thumbnail = window.GraphitixWelcomeThumbnails?.[info.type];
    if (thumbnail) {
      thumb.innerHTML = thumbnail;
      if (compact) {
        // Remove only the generator's centered letterboxing, retaining the full source viewport.
        const svg = thumb.firstElementChild;
        const scale = Number(svg.dataset.thumbnailVisualScale);
        const width = Number(svg.dataset.sourceViewportWidth) * scale;
        const height = Number(svg.dataset.sourceViewportHeight) * scale;
        const x = (Number(svg.getAttribute('width')) - width) / 2;
        const y = (Number(svg.getAttribute('height')) - height) / 2;
        svg.setAttribute('viewBox', [x - 2, y - 2, width + 4, height + 4].join(' '));
      }
    } else {
      const fallback = createElement('span', 'welcome-example-card__thumb-fallback', null, doc);
      fallback.setAttribute('aria-hidden', 'true');
      fallback.innerHTML = info.icon || '';
      thumb.appendChild(fallback);
    }

    const body = createElement('span', 'welcome-example-card__body', null, doc);
    body.appendChild(createElement('span', 'welcome-example-card__hint', info.hint || '', doc));
    body.appendChild(createElement('span', 'welcome-example-card__title', info.exampleTitle || info.label || '', doc));
    body.appendChild(createElement('span', 'welcome-example-card__summary', info.exampleSummary || info.description || '', doc));
    card.append(thumb, body);
    return card;
  };

  function renderWelcomeCollection(container, items, createCard) {
    if (!container) return false;
    container.textContent = '';
    const doc = container.ownerDocument;
    const fragment = doc.createDocumentFragment();
    items.forEach(info => {
      const item = createElement('li', 'welcome-example-item', null, doc);
      item.appendChild(createCard(info));
      fragment.appendChild(item);
    });
    container.appendChild(fragment);
    return true;
  }

  namespace.presentWelcomeFrame = function presentWelcomeFrame(doc = document) {
    if (!doc?.getElementById) return false;
    const welcomeScreen = doc.getElementById('welcomeScreen');
    const selectionGrid = doc.getElementById('graphSelectionGrid');
    const popularList = doc.getElementById('welcomePopularExamplesList');
    if (!welcomeScreen || !selectionGrid || !popularList) return false;

    renderWelcomeGraphCategories(selectionGrid, GRAPH_TYPES, doc);
    renderWelcomeCollection(
      popularList,
      GRAPH_TYPES,
      info => namespace.createWelcomeExampleCard(info, { compact: true }, doc)
    );

    const viewAll = doc.getElementById('welcomeViewAllExamples');
    if (viewAll) {
      viewAll.textContent = `View all ${GRAPH_TYPES.length}`;
      viewAll.setAttribute('aria-label', `View all ${GRAPH_TYPES.length} Graphitix examples`);
    }
    welcomeScreen.dataset.welcomePresented = 'true';
    return true;
  };

  namespace.graphTypes = GRAPH_TYPES;
  if (typeof document !== 'undefined') {
    namespace.presentWelcomeFrame(document);
  }

  function validateMain(main) {
    if (!main) {
      throw new Error('Main.bootstrap.init requires the Main namespace.');
    }
    return main;
  }

  function runComponentBootstrap({ workspaces, domControls, session }) {
    const ensureDefaultPayload = (type, config) => domControls.ensureDefaultPayload(session, type, config);
    const hideWorkspaceElement = config => domControls.hideWorkspaceElement(config);
    const registry = Object.values(workspaces || {}).filter(Boolean);
    if (!registry.length) {
      debug('Debug: runComponentBootstrap skipped', { reason: 'no-workspaces' });
      return;
    }

    const activeTab = typeof session?.getActiveTab === 'function' ? session.getActiveTab() : null;
    const activeType = (activeTab && activeTab.type && !activeTab.isWelcome) ? activeTab.type : null;
    let initialConfig = activeType && workspaces ? workspaces[activeType] : null;

    if (!initialConfig) {
      initialConfig = registry.find(entry => {
        if (!entry?.element) return false;
        const hiddenAttr = entry.element.hasAttribute('hidden');
        const styleDisplay = entry.element.style?.display || '';
        return !hiddenAttr && styleDisplay !== 'none';
      }) || null;
    }

    if (!initialConfig) {
      debug('Debug: runComponentBootstrap initial workspace skipped', {
        reason: activeTab?.isWelcome ? 'welcome-tab-active' : 'no-visible-workspace'
      });
    }

    const initializedTypes = [];
    registry.forEach(config => {
      if (!config) return;
      const shouldEnsure = initialConfig && config.type === initialConfig.type;
      if (shouldEnsure) {
        const finalizeEnsure = () => {
          initializedTypes.push(config.type);
          if (typeof domControls.markWorkspaceInitialized === 'function') {
            domControls.markWorkspaceInitialized(config.type, { reason: 'bootstrap-active' });
          }
          ensureDefaultPayload(config.type, config);
          debug('Debug: bootstrap ensured initial workspace', { type: config.type });
        };
        if (typeof config.ensure === 'function') {
          try {
            const ensureResult = config.ensure();
            if (ensureResult && typeof ensureResult.then === 'function') {
              ensureResult.then(() => finalizeEnsure()).catch(err => {
                console.error('bootstrap async ensure error', { type: config.type, err });
              });
            } else {
              finalizeEnsure();
            }
          } catch (err) {
            console.error('bootstrap ensure error', { type: config.type, err });
          }
        } else {
          debug('Debug: bootstrap initial workspace missing ensure', { type: config.type });
          if (typeof domControls.markWorkspaceInitialized === 'function') {
            domControls.markWorkspaceInitialized(config.type, { reason: 'bootstrap-no-ensure' });
          }
          ensureDefaultPayload(config.type, config);
        }
      } else {
        debug('Debug: bootstrap ensure skipped', {
          type: config.type,
          reason: 'not-initial-workspace'
        });
      }
      hideWorkspaceElement(config);
    });

    debug('Debug: Main.bootstrap component bootstrap executed', {
      count: registry.length,
      initialType: initialConfig ? initialConfig.type : null,
      initializedTypes
    });
  }

  namespace.init = function init(main) {
    const target = validateMain(main || Main);
    debug('Debug: Main.bootstrap.init invoked', { hasMain: !!target });

    const session = target.session;
    const previews = target.previews;
    const domControls = target.domControls;
    const sessionActions = target.sessionActions;
    const tabDrag = target.tabDrag;
    if (!session || !previews || !domControls || !sessionActions || !tabDrag) {
      const details = {
        hasSession: !!session,
        hasPreviews: !!previews,
        hasDomControls: !!domControls,
        hasSessionActions: !!sessionActions,
        hasTabDrag: !!tabDrag
      };
      console.error('Main.bootstrap.init missing dependencies', details);
      throw new Error('Main.bootstrap.init requires session, previews, domControls, sessionActions, and tabDrag.');
    }

    const components = target.components || {};
    const workspaces = components.registry || {};
    const variantApi = target.graphVariants || {};

    const dom = domControls.createDomHandles();
    const workspaceState = session.workspaceState;
    if (!workspaceState) {
      console.error('Main.bootstrap.init missing workspaceState');
      throw new Error('Main.bootstrap.init requires session.workspaceState.');
    }

    const graphVariants = typeof variantApi.list === 'function' ? variantApi.list() : [];

    function withSessionContext(extra = {}) {
      const context = {
        workspaces,
        previews
      };
      return Object.assign(context, extra);
    }

    runComponentBootstrap({ workspaces, domControls, session });

    debug('Debug: Main.bootstrap.init completed', {
      tabs: workspaceState.tabs?.length || 0,
      workspaces: Object.keys(workspaces).length,
      graphVariants: graphVariants.length
    });

    return {
      session,
      previews,
      domControls,
      sessionActions,
      tabDrag,
      workspaces,
      graphTypes: GRAPH_TYPES,
      graphVariants,
      sessionFileTypes: SESSION_FILE_TYPES,
      dom,
      workspaceState,
      withSessionContext
    };
  };
})();
