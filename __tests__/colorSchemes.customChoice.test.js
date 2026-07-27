const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const clone = value => JSON.parse(JSON.stringify(value));

describe('color scheme custom-color choice', () => {
  let tab;
  let workspace;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    document.body.innerHTML = `
      <div id="linePage">
        <div class="config-panel"></div>
        <div id="lineGraphPanel"><div class="svgbox"></div></div>
      </div>
    `;
    tab = {
      id: 'line-custom-colors',
      type: 'line',
      payload: {
        type: 'line',
        data: [['X', 'Series 1', 'Series 2', 'Series 3']],
        config: {
          colorScheme: 'scientific',
          labelColors: {
            'Series 1': '#d35d02',
            'Series 2': '#006fb0',
            'Series 3': '#00aa00'
          },
          seriesStyles: {}
        }
      }
    };
    workspace = {
      getPayload: jest.fn(() => clone(tab.payload)),
      applyColorSchemePayload: jest.fn(() => true)
    };
    window.Main = {
      session: {
        workspaceState: { tabs: [tab] },
        getActiveTab: jest.fn(() => tab),
        commitTabPayload: jest.fn((owner, payload) => {
          owner.payload = clone(payload);
        })
      },
      components: {
        get: jest.fn(() => workspace)
      }
    };
    require('../js/shared/undo.js');
    require('../js/shared/colorSchemes.js');
    window.Shared.colorSchemes.init();
  });

  function selectColorBlindScheme(){
    const select = document.querySelector('#lineColorSchemeSelect');
    const picker = select.parentElement.querySelector('.color-scheme-picker');
    picker.querySelector('[data-color-scheme-toggle="1"]').click();
    picker.querySelector('[data-scheme-id="colorblind"]').click();
    return {
      select,
      choice: picker.querySelector('[data-color-scheme-choice="1"]')
    };
  }

  test('recommends matching and applies distinct nearest palette colors as one undo action', () => {
    const before = clone(tab.payload);
    const { select, choice } = selectColorBlindScheme();

    expect(choice.hidden).toBe(false);
    expect(choice.querySelector('[data-color-scheme-choice-action="match"]').textContent)
      .toContain('Recommended');
    expect(tab.payload).toEqual(before);

    choice.querySelector('[data-color-scheme-choice-action="match"]').click();

    expect(tab.payload.config.colorScheme).toBe('colorblind');
    expect(tab.payload.config.labelColors).toEqual({
      'Series 1': '#d55e00',
      'Series 2': '#0072b2',
      'Series 3': '#009e73'
    });
    expect(select.value).toBe('colorblind');

    expect(window.Shared.undoManager.undo({ tabId: tab.id })).toBe(true);
    expect(tab.payload).toEqual(before);
  });

  test('replace action keeps the existing full-palette replacement behavior', () => {
    const { choice } = selectColorBlindScheme();
    choice.querySelector('[data-color-scheme-choice-action="replace"]').click();

    expect(tab.payload.config.labelColors).toEqual({
      'Series 1': '#0072b2',
      'Series 2': '#d55e00',
      'Series 3': '#009e73'
    });
  });

  test('Box matches every dataset sharing a custom color, including a slot equal to its old default', () => {
    tab = {
      id: 'box-equal-colors',
      type: 'box',
      payload: {
        type: 'box',
        data: [['A', 'B', 'C'], [1, 2, 3]],
        config: {
          colorScheme: 'grayscale',
          colorMode: 'individual',
          colors: ['#7a7a7a', '#7a7a7a', '#7a7a7a'],
          borderColors: ['#000000', '#000000', '#000000']
        }
      }
    };

    expect(window.Shared.colorSchemes.applyToActiveTab('box', 'colorblind', { colorMode: 'match' })).toBe(true);

    expect(new Set(tab.payload.config.colors).size).toBe(1);
    expect(tab.payload.config.colors[0]).not.toBe('#7a7a7a');
    expect(window.Shared.colorSchemes.resolveCategoricalPaletteForType('box', { schemeId: 'colorblind' }))
      .toContain(tab.payload.config.colors[0]);
  });

  test('Box Unified mode matches global and indexed point colors together', () => {
    tab = {
      id: 'box-unified-point-colors',
      type: 'box',
      payload: {
        type: 'box',
        data: [['A', 'B', 'C'], [1, 2, 3]],
        config: {
          colorScheme: 'grayscale',
          colorMode: 'unified',
          fill: '#7a7a7a',
          colors: ['#7a7a7a'],
          pointGlobalStyle: { fill: '#00b050', size: 3 },
          pointStyles: {
            1: { fill: '#00b050', size: 3 },
            2: { fill: '#ff0000', size: 3 }
          }
        }
      }
    };

    expect(window.Shared.colorSchemes.applyToActiveTab('box', 'colorblind', { colorMode: 'match' })).toBe(true);

    expect(tab.payload.config.pointGlobalStyle.fill).toBe('#009e73');
    expect(tab.payload.config.pointStyles[1].fill).toBe('#009e73');
    expect(tab.payload.config.pointStyles[2].fill).toBe('#d55e00');
  });

  test('testfile.graph keeps every shared green point assignment together', async () => {
    const archive = await JSZip.loadAsync(
      fs.readFileSync(path.join(__dirname, 'testfile.graph'))
    );
    const payloadEntry = archive.file('tabs/new validation set/payload.json');
    const payload = JSON.parse(await payloadEntry.async('string'));
    tab = {
      id: 'box-testfile',
      type: 'box',
      payload
    };
    const greenStyleKeys = Object.entries(payload.config.pointStyles)
      .filter(([, style]) => String(style?.fill || '').toLowerCase() === '#00b050')
      .map(([key]) => key);

    expect(window.Shared.colorSchemes.applyToActiveTab('box', 'colorblind', { colorMode: 'match' })).toBe(true);

    expect(tab.payload.config.pointGlobalStyle.fill).toBe('#009e73');
    expect(greenStyleKeys.length).toBeGreaterThan(1);
    greenStyleKeys.forEach(key => {
      expect(tab.payload.config.pointStyles[key].fill).toBe('#009e73');
    });
  });

  test('cancel leaves colors and selected palette unchanged', () => {
    const before = clone(tab.payload);
    const { select, choice } = selectColorBlindScheme();
    choice.querySelector('[data-color-scheme-choice-action="cancel"]').click();

    expect(choice.hidden).toBe(true);
    expect(tab.payload).toEqual(before);
    expect(select.value).toBe('custom');
  });

  test.each([
    ['scatter', { data: [['Label'], ['A']], config: { colorScheme: 'scientific', labelColors: { A: '#123456' } } }, payload => payload.config.labelColors.A, 'categorical'],
    ['pca', { data: [['Variable', 'A'], ['Var1', 1]], config: { colorScheme: 'scientific', labelColors: { A: '#123456' } } }, payload => payload.config.labelColors.A, 'categorical'],
    ['box', { data: [['X', 'A']], config: { colorScheme: 'scientific', colors: ['#123456'] } }, payload => payload.config.colors[0], 'categorical'],
    ['hist', { data: [['A'], [1]], config: { colorScheme: 'scientific', seriesColors: { 'col-0': '#123456' } } }, payload => payload.config.seriesColors['col-0'], 'categorical'],
    ['pie', { data: [['Label'], ['A']], config: { colorScheme: 'scientific', colors: { A: '#123456' } } }, payload => payload.config.colors.A, 'categorical'],
    ['roc', { data: [['Label'], ['A']], config: { colorScheme: 'scientific', labelColors: { A: '#123456' } } }, payload => payload.config.labelColors.A, 'categorical'],
    ['survival', { data: [['Label'], ['A']], config: { colorScheme: 'scientific', labelColors: { A: '#123456' } } }, payload => payload.config.labelColors.A, 'categorical'],
    ['heatmap', { config: { colorScheme: 'scientific', colors: { negative: '#123456', zero: '#ffffff', positive: '#ff0000' } } }, payload => payload.config.colors.negative, 'diverging'],
    ['venn', { style: { colorScheme: 'scientific', colorA: '#123456', colorB: '#ff0000', colorC: '#00aa00' } }, payload => payload.style.colorA, 'categorical']
  ])('matches custom %s dataset colors through the shared contract', (type, payload, readColor, paletteKind) => {
    tab = { id: `${type}-matched`, type, payload: clone({ type, ...payload }) };

    expect(window.Shared.colorSchemes.applyToActiveTab(type, 'colorblind', { colorMode: 'match' })).toBe(true);

    const scheme = window.Shared.colorSchemes.getSchemes().colorblind;
    const allowed = paletteKind === 'diverging'
      ? Object.values(scheme.diverging)
      : window.Shared.colorSchemes.resolveCategoricalPaletteForType(type, { schemeId: 'colorblind' });
    expect(allowed).toContain(readColor(tab.payload));
    expect(readColor(tab.payload)).not.toBe('#123456');
  });
});
