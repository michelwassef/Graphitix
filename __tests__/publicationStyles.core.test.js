// Tests for js/shared/publicationStyles.js
// The only public export is namespace.init().  Everything else is driven through
// DOM events wired up by init().  We set up the DOM scaffold, call init(), then
// simulate "Apply style" button clicks and assert payload side-effects.

// publicationStyles.init() starts a setInterval(…, 1200) via startActiveMonitor().
// Fake timers prevent that interval from leaking into the real timer queue and
// interfering with timing-sensitive tests in other suites.
beforeEach(() => { jest.useFakeTimers(); });
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
