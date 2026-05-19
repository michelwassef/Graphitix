describe('Shared.themeRuntime', () => {
  let runtime;

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
    require('../js/shared/theme/themeRuntime.js');
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
      t.setAttribute('fill', '#aabbcc');
      svg.appendChild(t);

      runtime.applyDarkTextTheme(svg, '#fff');
      expect(t.getAttribute('data-color-scheme-prev-fill')).toBe('#aabbcc');
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
      t.setAttribute('fill', '#original');
      svg.appendChild(t);

      runtime.applyDarkTextTheme(svg, '#aaa');
      // second call — prev-fill must not change
      runtime.applyDarkTextTheme(svg, '#bbb');

      expect(t.getAttribute('data-color-scheme-prev-fill')).toBe('#original');
      expect(t.getAttribute('fill')).toBe('#bbb');
    });
  });

  describe('restoreTextTheme', () => {
    test('restores original fill and removes theme attributes', () => {
      const svg = makeSvg();
      const t = makeText('q');
      t.setAttribute('fill', '#abc123');
      svg.appendChild(t);

      runtime.applyDarkTextTheme(svg, '#fff');
      runtime.restoreTextTheme(svg);

      expect(t.getAttribute('fill')).toBe('#abc123');
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
      tspan.setAttribute('fill', '#999');
      svg.appendChild(tspan);

      runtime.applyDarkTextTheme(svg, '#fff');
      runtime.restoreTextTheme(svg);

      expect(tspan.getAttribute('fill')).toBe('#999');
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
});
