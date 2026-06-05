// Tests for js/shared/publicationStyles.js
// The only public export is namespace.init().  Everything else is driven through
// DOM events wired up by init().  We set up the DOM scaffold, call init(), then
// simulate "Apply style" button clicks and assert payload side-effects.

// publicationStyles.init() starts a setInterval(…, 1200) via startActiveMonitor().
// Fake timers prevent that interval from leaking into the real timer queue and
// interfering with timing-sensitive tests in other suites.
beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => { jest.useRealTimers(); });

function loadModule() {
  jest.resetModules();
  delete window.Shared;
  delete window.Main;
  require('../js/shared/publicationStyles.js');
  return window.Shared.publicationStyles;
}

// Build a config panel with the IDs that publicationStyles.js expects
function buildConfigPanel(type) {
  const pageId = `${type}Page`;
  let page = document.getElementById(pageId);
  if (!page) {
    page = document.createElement('div');
    page.id = pageId;
    document.body.appendChild(page);
  }
  let panel = page.querySelector('.config-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'config-panel';
    page.appendChild(panel);
  }
  return { page, panel };
}

const FONT_CONTROL_IDS = {
  venn: { inputId: 'fontsize', labelId: 'fontsizeVal' },
  box: { inputId: 'boxFontSize', labelId: 'boxFontSizeVal' },
  scatter: { inputId: 'scatterFontSize', labelId: 'scatterFontSizeVal' },
  pca: { inputId: 'pcaFontSize', labelId: 'pcaFontSizeVal' },
  line: { inputId: 'lineFontSize', labelId: 'lineFontSizeVal' },
  heatmap: { inputId: 'heatmapFontSize', labelId: 'heatmapFontSizeVal' },
  surface: { inputId: 'surfaceFontSize', labelId: 'surfaceFontSizeVal' },
  roc: { inputId: 'rocFontSize', labelId: 'rocFontSizeVal' },
  survival: { inputId: 'survivalFontSize', labelId: 'survivalFontSizeVal' },
  hist: { inputId: 'histFontSize', labelId: 'histFontSizeVal' },
  pie: { inputId: 'pieFontSize', labelId: 'pieFontSizeVal' }
};

function buildFontControl(type, initialValue = '12') {
  const descriptor = FONT_CONTROL_IDS[type];
  if (!descriptor) throw new Error(`Missing font control descriptor for ${type}`);
  const { page } = buildConfigPanel(type);
  const input = document.createElement('input');
  input.id = descriptor.inputId;
  input.type = 'range';
  input.min = '1';
  input.max = '48';
  input.value = initialValue;
  const label = document.createElement('output');
  label.id = descriptor.labelId;
  page.appendChild(input);
  page.appendChild(label);
  const events = [];
  input.addEventListener('input', () => events.push(`input:${input.value}`));
  input.addEventListener('change', () => events.push(`change:${input.value}`));
  return { input, label, events };
}

function readPath(obj, path) {
  return String(path).split('.').reduce((cursor, key) => (
    cursor && typeof cursor === 'object' ? cursor[key] : undefined
  ), obj);
}

// Minimal session / workspace / domControls scaffold
function buildMain(type, payloadOverrides = {}) {
  const basePayload = {
    type,
    config: {
      colorScheme: 'scientific',
      colorMode: 'individual',
      axis: {},
      showGrid: true,
      showFrame: true,
      fontSize: 12,
      significance: { color: '#000', thickness: 1 },
      summaryGlobalStyle: { color: '#000' },
      pointGlobalStyle: { size: 8, borderWidth: 1 },
      ...payloadOverrides
    }
  };

  const tab = { id: 'workspace-1', type, payload: JSON.parse(JSON.stringify(basePayload)) };

  window.Shared = window.Shared || {};
  window.Shared.colorSchemes = {
    applyToPayload: jest.fn((t, p, schemeId) => {
      const clone = JSON.parse(JSON.stringify(p));
      clone.config = clone.config || {};
      clone.config.colorScheme = schemeId;
      return clone;
    })
  };
  window.Shared.chartStyle = {
    renderFontSizeLabel: jest.fn(({ element, pt, input }) => {
      if (element) element.textContent = `${pt} pt`;
      if (input?.dataset) {
        input.dataset.fontBasePt = String(pt);
        input.dataset.fontDisplayPt = String(pt);
      }
    }),
    setTextSizeLock: jest.fn()
  };
  window.Shared.workspaceTabs = {
    resolveTabScopedRoot: jest.fn((t) => document.getElementById(`${t}Page`) || null)
  };

  const session = {
    getActiveTab: jest.fn(() => tab),
    persistActiveTabState: jest.fn(),
    assignTabPayload: jest.fn((t, p) => { t.payload = JSON.parse(JSON.stringify(p)); }),
    markSessionDirty: jest.fn()
  };
  const workspace = {
    getPayload: jest.fn(() => JSON.parse(JSON.stringify(tab.payload))),
    createEmptyPayload: jest.fn(() => ({ type, config: {} })),
    captureEmptyPayloadTemplate: jest.fn(() => null),
    restoreEmptyPayloadTemplate: jest.fn()
  };
  const domControls = {
    applyWorkspacePayload: jest.fn(),
    ensureDefaultPayload: jest.fn(() => null),
    setWorkspaceDefaultPayload: jest.fn()
  };
  const components = { get: jest.fn(t => (t === type ? workspace : null)) };

  window.Main = { session, domControls, components };
  return { tab, session, workspace, domControls };
}

function clickApplyButton(type) {
  const btn = document.querySelector(
    `button[data-publication-style-apply="1"][data-component-type="${type}"]`
  );
  if (!btn) throw new Error(`Apply button not found for type "${type}"`);
  btn.click();
}

function selectPublicationPreset(type, presetId) {
  const select = document.querySelector(
    `select[data-publication-style-select="1"][data-component-type="${type}"]`
  );
  if (!select) throw new Error(`Publication style select not found for type "${type}"`);
  select.value = presetId;
}

// ─── init() ────────────────────────────────────────────────────────────────

describe('publicationStyles — init()', () => {
  let ps;

  beforeEach(() => {
    Object.keys({ venn: 1, box: 1, scatter: 1, pca: 1, line: 1, heatmap: 1,
      surface: 1, roc: 1, survival: 1, hist: 1, pie: 1 }).forEach(t => buildConfigPanel(t));
    ps = loadModule();
  });

  afterEach(() => { delete window.Main; });

  test('init() returns the namespace', () => {
    expect(ps.init()).toBe(ps);
  });

  test('init() is idempotent — calling twice does not throw', () => {
    expect(() => { ps.init(); ps.init(); }).not.toThrow();
  });

  test('init() renders apply buttons for all component types', () => {
    ps.init();
    const types = ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'];
    types.forEach(type => {
      const btn = document.querySelector(
        `button[data-publication-style-apply="1"][data-component-type="${type}"]`
      );
      expect(btn).not.toBeNull();
    });
  });

  test('init() renders preset select for each type', () => {
    ps.init();
    const selects = document.querySelectorAll('select[data-publication-style-select="1"]');
    expect(selects.length).toBeGreaterThanOrEqual(11);
  });

  test('init() exposes the documented publisher style presets in stable order', () => {
    ps.init();
    const select = document.querySelector('select[data-publication-style-select="1"]');
    const options = Array.from(select.options).map(option => ({ value: option.value, text: option.textContent }));
    expect(options.map(option => option.value)).toEqual([
      'npg_single',
      'npg_15col_120',
      'npg_15col_136',
      'npg_double',
      'science_1col',
      'science_2col',
      'science_3col',
      'cell_press_single',
      'plos_text',
      'plos_full',
      'jcb_max',
      'jcs_full',
      'embo_single',
      'embo_double',
      'jci_single',
      'jci_double'
    ]);
    expect(options.find(option => option.value === 'plos_text')?.text).toBe('Text column (132 mm)');
    expect(options.find(option => option.value === 'jci_double')?.text).toBe('Double column (180 mm)');
  });
});

// ─── Apply preset via DOM click — scatter ──────────────────────────────────

describe('publicationStyles — NPG single preset on scatter (via DOM click)', () => {
  let ps;
  let scaffold;

  beforeEach(() => {
    buildConfigPanel('scatter');
    ps = loadModule();
    ps.init();
    scaffold = buildMain('scatter');
  });

  afterEach(() => { delete window.Main; });

  test('clicking Apply does not throw', () => {
    expect(() => clickApplyButton('scatter')).not.toThrow();
  });

  test('tab payload is updated after Apply click', () => {
    const before = JSON.stringify(scaffold.tab.payload);
    clickApplyButton('scatter');
    const after = JSON.stringify(scaffold.tab.payload);
    // Payload must have changed (preset was applied)
    expect(after).not.toEqual(before);
  });

  test('NPG preset sets axis.color to #000000', () => {
    clickApplyButton('scatter');
    expect(scaffold.tab.payload.config?.axis?.color).toBe('#000000');
  });

  test('NPG preset sets showGrid to false', () => {
    clickApplyButton('scatter');
    expect(scaffold.tab.payload.config?.showGrid).toBe(false);
  });

  test('NPG preset sets showFrame to false', () => {
    clickApplyButton('scatter');
    expect(scaffold.tab.payload.config?.showFrame).toBe(false);
  });

  test('NPG preset forces a colorScheme string', () => {
    clickApplyButton('scatter');
    const cs = scaffold.tab.payload.config?.colorScheme;
    expect(typeof cs).toBe('string');
    expect(cs.length).toBeGreaterThan(0);
  });

  test('NPG preset sets a positive fontSize', () => {
    clickApplyButton('scatter');
    const fs = scaffold.tab.payload.config?.fontSize;
    expect(Number.isFinite(fs)).toBe(true);
    expect(fs).toBeGreaterThan(0);
  });

  test('NPG preset applies font size through the manual input route', () => {
    const { input, label, events } = buildFontControl('scatter');

    clickApplyButton('scatter');

    expect(input.value).toBe('7');
    expect(input.dataset.fontBasePt).toBe('7');
    expect(input.dataset.fontDisplayPt).toBe('7');
    expect(events.slice(0, 2)).toEqual(['input:7', 'change:7']);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(scaffold.tab.payload.config?.fontSize).toBe(7);
    expect(window.Shared.chartStyle.renderFontSizeLabel).toHaveBeenCalledWith(expect.objectContaining({
      element: label,
      input,
      pt: 7,
      manual: true
    }));
  });

  test('workspace payload fallback propagates explicit tab ownership metadata', () => {
    scaffold.tab.payload = null;
    scaffold.workspace.getPayload.mockReturnValue({
      type: 'scatter',
      config: { colorScheme: 'scientific' }
    });

    clickApplyButton('scatter');

    expect(scaffold.workspace.getPayload).toHaveBeenCalled();
    const [metaArg] = scaffold.workspace.getPayload.mock.calls.at(-1) || [];
    expect(metaArg).toEqual(expect.objectContaining({
      tabId: 'workspace-1',
      type: 'scatter',
      origin: 'publicationStyles'
    }));
    expect(String(metaArg.reason || '')).toContain('publication-style-source-scatter');
  });
});

describe('publicationStyles — canonical font-size persistence path', () => {
  const cases = [
    ['venn', 'style.fontsize'],
    ['box', 'config.fontSize'],
    ['scatter', 'config.fontSize'],
    ['pca', 'config.fontSize'],
    ['line', 'config.fontSize'],
    ['heatmap', 'config.fontSize'],
    ['surface', 'config.settings.fontSize'],
    ['roc', 'config.fontSize'],
    ['survival', 'config.fontSize'],
    ['hist', 'config.fontSize'],
    ['pie', 'config.fontSize']
  ];

  test.each(cases)('%s preset writes %s even when missing from the source payload', (type, path) => {
    buildConfigPanel(type);
    buildFontControl(type);
    const ps = loadModule();
    ps.init();
    const scaffold = buildMain(type);
    scaffold.tab.payload = type === 'venn'
      ? { type, data: {}, style: {}, config: { colorScheme: 'scientific', axis: {} } }
      : { type, data: [], config: { colorScheme: 'scientific', axis: {} } };

    clickApplyButton(type);

    expect(readPath(scaffold.tab.payload, path)).toBe(7);
  });
});

// ─── Apply preset via DOM click — box (single format) ──────────────────────

describe('publicationStyles — NPG single preset on box/single (via DOM click)', () => {
  let ps;
  let scaffold;

  beforeEach(() => {
    buildConfigPanel('box');
    ps = loadModule();
    ps.init();
    scaffold = buildMain('box', {
      tableFormat: 'single',
      colors: ['#ff0000', '#00ff00'],
      borderColors: ['#ff0000', '#00ff00']
    });
  });

  afterEach(() => { delete window.Main; });

  test('clicking Apply updates the box payload', () => {
    const before = JSON.stringify(scaffold.tab.payload);
    clickApplyButton('box');
    expect(JSON.stringify(scaffold.tab.payload)).not.toEqual(before);
  });

  test('single-format box: colorScheme is grayscale', () => {
    clickApplyButton('box');
    expect(scaffold.tab.payload.config?.colorScheme).toBe('grayscale');
  });

  test('single-format box: fill is #666666', () => {
    clickApplyButton('box');
    expect(scaffold.tab.payload.config?.fill).toBe('#666666');
  });

  test('single-format box: border is #000000', () => {
    clickApplyButton('box');
    expect(scaffold.tab.payload.config?.border).toBe('#000000');
  });

  test('single-format box: all colors set to gray fill', () => {
    clickApplyButton('box');
    const colors = scaffold.tab.payload.config?.colors;
    expect(Array.isArray(colors)).toBe(true);
    colors.forEach(c => expect(c).toBe('#666666'));
  });

  test('single-format box: colorMode is individual', () => {
    clickApplyButton('box');
    expect(scaffold.tab.payload.config?.colorMode).toBe('individual');
  });

  test('single-format box: dataset spacing x is 0.6', () => {
    clickApplyButton('box');
    expect(scaffold.tab.payload.config?.axis?.datasetSpacing?.x).toBe(0.6);
  });
});

// ─── Apply preset via DOM click — box (grouped format) ─────────────────────

describe('publicationStyles — NPG single preset on box/grouped (via DOM click)', () => {
  let ps;
  let scaffold;

  beforeEach(() => {
    buildConfigPanel('box');
    ps = loadModule();
    ps.init();
    scaffold = buildMain('box', { tableFormat: 'grouped' });
  });

  afterEach(() => { delete window.Main; });

  test('grouped-format box: colorScheme is colorblind', () => {
    clickApplyButton('box');
    expect(scaffold.tab.payload.config?.colorScheme).toBe('colorblind');
  });
});


// ─── Non-NPG publisher presets ─────────────────────────────────────────────

describe('publicationStyles — documented publisher presets', () => {
  let ps;
  let scaffold;

  beforeEach(() => {
    buildConfigPanel('scatter');
    ps = loadModule();
    ps.init();
    scaffold = buildMain('scatter');
  });

  afterEach(() => { delete window.Main; });

  test('PLOS text-column preset applies 8 pt text and 0.2 mm line width', () => {
    selectPublicationPreset('scatter', 'plos_text');
    clickApplyButton('scatter');

    expect(scaffold.tab.payload.config?.fontSize).toBe(8);
    expect(scaffold.tab.payload.config?.axis?.strokeWidth).toBeCloseTo(0.567, 3);
  });

  test('Science one-column preset applies the documented 57 mm width', () => {
    window.Shared.graphSizing = {
      setPayloadSizing: jest.fn((payload, sizing) => ({
        ...JSON.parse(JSON.stringify(payload)),
        __testSizing: JSON.parse(JSON.stringify(sizing))
      })),
      getPayloadSizing: jest.fn(() => null)
    };

    selectPublicationPreset('scatter', 'science_1col');
    clickApplyButton('scatter');

    expect(scaffold.tab.payload.__testSizing?.display?.widthPx).toBe(215);
    expect(scaffold.tab.payload.__testSizing?.display?.heightPx).toBe(192);
  });

  test('JCI double-column preset respects the 8 pt Helvetica/Arial typography rule', () => {
    selectPublicationPreset('scatter', 'jci_double');
    clickApplyButton('scatter');

    expect(scaffold.tab.payload.config?.fontSize).toBe(8);
    expect(scaffold.tab.payload.config?.axis?.color).toBe('#000000');
    expect(scaffold.tab.payload.config?.showGrid).toBe(false);
  });


  test('Nature/NPG variants are grouped and explained as width variants, not separate visual styles', () => {
    const select = document.querySelector(
      'select[data-publication-style-select="1"][data-component-type="scatter"]'
    );
    const hint = select.closest('[data-publication-style-fieldset="1"]')
      .querySelector('[data-publication-style-hint="1"]');

    expect(select.querySelector('optgroup[label="Nature / NPG — choose final width"]')).not.toBeNull();
    expect(hint.textContent).toMatch(/89 mm single column/i);
    expect(hint.textContent).toMatch(/Arial\/Helvetica, 7 pt/i);

    select.value = 'npg_double';
    select.dispatchEvent(new window.Event('change'));
    expect(hint.textContent).toMatch(/183 mm double column/i);
    expect(hint.textContent).toMatch(/0\.25-1 pt strokes/i);
  });
});

// ─── Apply button when no active tab for that type ─────────────────────────

describe('publicationStyles — mismatched type does not modify payload', () => {
  let ps;
  let scaffold;

  beforeEach(() => {
    buildConfigPanel('scatter');
    buildConfigPanel('box');
    ps = loadModule();
    ps.init();
    // Active tab is scatter but we click box button
    scaffold = buildMain('scatter');
  });

  afterEach(() => { delete window.Main; });

  test('box Apply does not update scatter payload', () => {
    const before = JSON.stringify(scaffold.tab.payload);
    // click box button — type mismatch → should be a no-op
    const boxBtn = document.querySelector(
      'button[data-publication-style-apply="1"][data-component-type="box"]'
    );
    if (boxBtn) boxBtn.click();
    expect(JSON.stringify(scaffold.tab.payload)).toEqual(before);
  });
});
