describe('Shared.themeRuntime', () => {
  let runtime;

  function normalizeCssColor(value) {
    const probe = document.createElement('span');
    probe.style.color = value;
    return probe.style.color;
  }

  function relativeLuminance(hexColor) {
    const match = /^#([0-9a-f]{6})$/i.exec(hexColor);
    if (!match) throw new Error(`Expected a six-digit hex paint, got ${hexColor}`);
    const channels = [0, 2, 4].map(offset => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255);
    const linear = channels.map(channel => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }

  function makeSvg(children = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = children;
    document.body.appendChild(svg);
    return svg;
  }

  function makeText(textContent = 'hello') {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.textContent = textContent;
    return text;
  }

  function makeTspan(textContent = 'span') {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.textContent = textContent;
    return tspan;
  }

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../../js/shared/theme/themeRuntime.js');
    runtime = window.Shared.themeRuntime;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('exposes the expected API surface', () => {
    expect(typeof runtime.applySvgTheme).toBe('function');
    expect(typeof runtime.applyDarkTextTheme).toBe('function');
    expect(typeof runtime.restoreTextTheme).toBe('function');
  });

  describe('applyDarkTextTheme', () => {
    test('sets fill attribute on every text node', () => {
      const svg = makeSvg();
      const t1 = makeText('A');
      const t2 = makeText('B');
      svg.appendChild(t1);
      svg.appendChild(t2);

      runtime.applyDarkTextTheme(svg, '#f2f2f2');

      expect(t1.getAttribute('fill')).toBe('#f2f2f2');
      expect(t2.getAttribute('fill')).toBe('#f2f2f2');
    });

    test('does not recolor explicit annotation label paints', () => {
      const svg = makeSvg();
      const label = makeText('custom');
      label.setAttribute('fill', '#aabbcc');
      svg.appendChild(label);
      runtime.applyDarkTextTheme(svg, '#ffffff');
      expect(label.getAttribute('fill')).toBe('#aabbcc');
      expect(label.hasAttribute('data-color-scheme-text-themed')).toBe(false);
      runtime.restoreTextTheme(svg);
      expect(label.getAttribute('fill')).toBe('#aabbcc');
    });

    test('keeps a custom text color edited after Dark was applied', () => {
      const svg = makeSvg();
      const label = makeText('edited');
      label.setAttribute('fill', '#000000');
      svg.appendChild(label);
      runtime.applyDarkTextTheme(svg, '#f2f2f2');
      label.setAttribute('fill', '#ff0000');
      runtime.applyDarkTextTheme(svg, '#f2f2f2');
      runtime.restoreTextTheme(svg);
      expect(label.getAttribute('fill')).toBe('#ff0000');
    });

    test('sets fill on tspan nodes', () => {
      const svg = makeSvg();
      const tspan = makeTspan('foo');
      svg.appendChild(tspan);

      runtime.applyDarkTextTheme(svg, '#ffffff');
      expect(tspan.getAttribute('fill')).toBe('#ffffff');
    });

    test('marks nodes with data-color-scheme-text-themed="1"', () => {
      const svg = makeSvg();
      const t = makeText('x');
      svg.appendChild(t);

      runtime.applyDarkTextTheme(svg, '#111');
      expect(t.getAttribute('data-color-scheme-text-themed')).toBe('1');
    });

    test('saves previous fill in data-color-scheme-prev-fill', () => {
      const svg = makeSvg();
      const t = makeText('x');
      t.setAttribute('fill', '#333333');
      svg.appendChild(t);

      runtime.applyDarkTextTheme(svg, '#fff');
      expect(t.getAttribute('data-color-scheme-prev-fill')).toBe('#333333');
    });

    test('marks __none__ when node had no prior fill', () => {
      const svg = makeSvg();
      const t = makeText('y');
      svg.appendChild(t);

      runtime.applyDarkTextTheme(svg, '#fff');
      expect(t.getAttribute('data-color-scheme-prev-fill')).toBe('__none__');
    });

    test('does not overwrite data-color-scheme-prev-fill when already themed', () => {
      const svg = makeSvg();
      const t = makeText('z');
      t.setAttribute('fill', '#333333');
      svg.appendChild(t);

      runtime.applyDarkTextTheme(svg, '#aaa');
      // second call — prev-fill must not change
      runtime.applyDarkTextTheme(svg, '#bbb');

      expect(t.getAttribute('data-color-scheme-prev-fill')).toBe('#333333');
      expect(t.getAttribute('fill')).toBe('#bbb');
    });
  });

  describe('restoreTextTheme', () => {
    test('restores original fill and removes theme attributes', () => {
      const svg = makeSvg();
      const t = makeText('q');
      t.setAttribute('fill', '#333333');
      svg.appendChild(t);

      runtime.applyDarkTextTheme(svg, '#fff');
      runtime.restoreTextTheme(svg);

      expect(t.getAttribute('fill')).toBe('#333333');
      expect(t.getAttribute('data-color-scheme-text-themed')).toBeNull();
      expect(t.getAttribute('data-color-scheme-prev-fill')).toBeNull();
    });

    test('removes fill attribute when node had no prior fill', () => {
      const svg = makeSvg();
      const t = makeText('r');
      svg.appendChild(t);

      runtime.applyDarkTextTheme(svg, '#fff');
      runtime.restoreTextTheme(svg);

      expect(t.hasAttribute('fill')).toBe(false);
    });

    test('is a no-op on nodes that were never themed', () => {
      const svg = makeSvg();
      const t = makeText('s');
      t.setAttribute('fill', '#123456');
      svg.appendChild(t);

      runtime.restoreTextTheme(svg);

      expect(t.getAttribute('fill')).toBe('#123456');
    });

    test('also restores tspan nodes', () => {
      const svg = makeSvg();
      const tspan = makeTspan('ts');
      tspan.setAttribute('fill', '#000000');
      svg.appendChild(tspan);

      runtime.applyDarkTextTheme(svg, '#fff');
      runtime.restoreTextTheme(svg);

      expect(tspan.getAttribute('fill')).toBe('#000000');
    });
  });

  describe('applySvgTheme', () => {
    const darkScheme = {
      id: 'dark',
      tokens: { background: '#1a1a2e', textColor: '#f2f2f2', axisColor: '#ccc', gridColor: '#333' }
    };
    const lightScheme = {
      id: 'scientific',
      tokens: { background: '#ffffff', textColor: '#000000' }
    };

    test('sets data-color-scheme attribute to scheme id', () => {
      const svg = makeSvg();
      runtime.applySvgTheme(svg, darkScheme);
      expect(svg.getAttribute('data-color-scheme')).toBe('dark');
    });

    test('dark scheme applies background colour to svg style', () => {
      const svg = makeSvg();
      runtime.applySvgTheme(svg, darkScheme);
      expect(svg.style.backgroundColor).toBe('rgb(26, 26, 46)');
    });

    test('dark scheme applies text colour to text nodes', () => {
      const svg = makeSvg();
      const t = makeText('label');
      svg.appendChild(t);
      runtime.applySvgTheme(svg, darkScheme);
      expect(t.getAttribute('fill')).toBe('#f2f2f2');
    });

    test('switching from dark to light restores original fill', () => {
      const svg = makeSvg();
      const t = makeText('lbl');
      t.setAttribute('fill', '#333333');
      svg.appendChild(t);

      runtime.applySvgTheme(svg, darkScheme);
      expect(t.getAttribute('fill')).toBe('#f2f2f2');

      runtime.applySvgTheme(svg, lightScheme);
      expect(t.getAttribute('fill')).toBe('#333333');
    });

    test('light scheme removes background-color style', () => {
      const svg = makeSvg();
      runtime.applySvgTheme(svg, darkScheme);
      runtime.applySvgTheme(svg, lightScheme);
      expect(svg.style.backgroundColor).toBe('');
    });

    test('no-ops gracefully when svg or scheme is missing', () => {
      expect(() => runtime.applySvgTheme(null, darkScheme)).not.toThrow();
      expect(() => runtime.applySvgTheme(makeSvg(), null)).not.toThrow();
    });

    test('removes stale background rect from prior dark application', () => {
      const svg = makeSvg();
      const staleBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      staleBg.setAttribute('data-color-scheme-background', '1');
      svg.appendChild(staleBg);

      runtime.applySvgTheme(svg, darkScheme);
      expect(svg.querySelector('[data-color-scheme-background="1"]')).toBeNull();
    });
  });

  describe('appearance-only contrast across components', () => {
    const dark = { id: 'grayscale-dark', appearance: 'dark', tokens: { background: '#000000', textColor: '#f2f2f2' } };
    const light = { id: 'grayscale', appearance: 'light', tokens: { background: '#ffffff', textColor: '#000000' } };

    test.each(['box', 'scatter', 'pca', 'line', 'hist', 'roc', 'survival', 'pie', 'venn', 'heatmap', 'surface'])(
      '%s converts inherited black axes without persisting their appearance paint', componentType => {
        const svg = makeSvg('<g data-axis-line="1" stroke="#000000"><path id="axis" d="M0 0 L50 0"></path></g>');
        const axis = svg.querySelector('[data-axis-line]');
        runtime.applySvgTheme(svg, dark, { componentType });
        expect(axis.getAttribute('stroke')).toBe('#ebebeb');
        runtime.applySvgTheme(svg, light, { componentType });
        expect(axis.getAttribute('stroke')).toBe('#000000');
        expect(axis.hasAttribute('data-appearance-stroke-original')).toBe(false);
      }
    );

    test('inherited axis stroke from a group inline style is visible and restores exactly', () => {
      const svg = makeSvg('<g class="axis" style="stroke: black"><path d="M0 0L20 0"/></g>');
      const axis = svg.querySelector('g.axis');
      runtime.applySvgTheme(svg, dark, { componentType: 'box' });
      expect(normalizeCssColor(axis.style.stroke)).toBe(normalizeCssColor('#ebebeb'));
      runtime.applySvgTheme(svg, light, { componentType: 'box' });
      expect(axis.style.stroke).toBe('black');
    });

    test('2D black points and their outlines remain visible, and Light restores exact source paint', () => {
      const svg = makeSvg('<circle id="point" fill="black" stroke="rgb(0, 0, 0)" r="5"/>');
      const point = svg.querySelector('#point');
      runtime.applySvgTheme(svg, dark, { componentType: 'scatter' });
      expect(point.getAttribute('fill')).toBe('#ebebeb');
      expect(point.getAttribute('stroke')).toBe('#ebebeb');
      runtime.applySvgTheme(svg, light, { componentType: 'scatter' });
      expect(point.getAttribute('fill')).toBe('black');
      expect(point.getAttribute('stroke')).toBe('rgb(0, 0, 0)');
    });

    test('an explicit marker edit while Dark is selected is restored as the new original', () => {
      const svg = makeSvg('<circle id="point" fill="#000000"/>');
      const point = svg.querySelector('#point');
      runtime.applySvgTheme(svg, dark, { componentType: 'scatter' });
      point.setAttribute('fill', '#ff0000');
      runtime.applySvgTheme(svg, dark, { componentType: 'scatter' });
      runtime.applySvgTheme(svg, light, { componentType: 'scatter' });
      expect(point.getAttribute('fill')).toBe('#ff0000');
    });

    test('editing an inline paint while Dark is active preserves the edit in Light', async () => {
      const svg = makeSvg('<circle id="point" fill="#000000"/>');
      const point = svg.querySelector('#point');
      runtime.applySvgTheme(svg, dark, { componentType: 'scatter' });
      point.style.fill = '#ff0000';
      await Promise.resolve();
      expect(normalizeCssColor(point.style.fill)).toBe(normalizeCssColor('#ff0000'));
      runtime.applySvgTheme(svg, light, { componentType: 'scatter' });
      expect(normalizeCssColor(point.style.fill)).toBe(normalizeCssColor('#ff0000'));
      expect(point.getAttribute('fill')).toBe('#000000');
    });

    test('full-viewport background rectangle stays dark instead of being mistaken for a mark', () => {
      const svg = makeSvg('<rect id="bg" width="420" height="420" fill="#000000"/><circle id="mark" fill="#000000" r="5"/>');
      svg.setAttribute('viewBox', '0 0 420 420');
      runtime.applySvgTheme(svg, dark, { componentType: 'box' });
      expect(svg.querySelector('#bg').getAttribute('fill')).toBe('#000000');
      expect(svg.querySelector('#mark').getAttribute('fill')).toBe('#ebebeb');
    });

    test.each(['heatmap', 'surface'])('%s adapts quantitative ramps without changing order and restores source paint', componentType => {
      const sourceColors = ['#000000', '#202020', '#808080', '#ffffff'];
      const dataLayer = componentType === 'heatmap' ? 'data-layer="cells"' : 'class="surface-faces"';
      const rects = sourceColors.map((color, index) => `<rect data-ramp-index="${index}" width="6" height="6" fill="${color}"/>`).join('');
      const svg = makeSvg(`<g ${dataLayer}>${rects}</g><line id="axis" stroke="#000000"/>`);
      const paints = () => Array.from(svg.querySelectorAll('[data-ramp-index]'), node => node.getAttribute('fill'));

      runtime.applySvgTheme(svg, dark, { componentType });
      const darkColors = paints();
      const darkLuminances = darkColors.map(relativeLuminance);
      expect(darkLuminances.every((value, index) => index === 0 || value > darkLuminances[index - 1])).toBe(true);
      expect(darkLuminances.every(value => (value + 0.05) / 0.05 >= 3)).toBe(true);
      expect(svg.querySelector('#axis').getAttribute('stroke')).toBe('#ebebeb');

      runtime.applySvgTheme(svg, dark, { componentType });
      expect(paints()).toEqual(darkColors);

      runtime.applySvgTheme(svg, light, { componentType });
      expect(paints()).toEqual(sourceColors);
      expect(svg.querySelector('#axis').getAttribute('stroke')).toBe('#000000');
    });

    test('a newly inserted black symbol receives dark contrast without a graph redraw', async () => {
      const svg = makeSvg();
      runtime.applySvgTheme(svg, dark, { componentType: 'scatter' });
      const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      point.setAttribute('fill', '#000000');
      svg.appendChild(point);
      await Promise.resolve();
      expect(point.getAttribute('fill')).toBe('#ebebeb');
      runtime.applySvgTheme(svg, light, { componentType: 'scatter' });
      expect(point.getAttribute('fill')).toBe('#000000');
    });
  });

});
