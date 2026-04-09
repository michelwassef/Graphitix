describe('fontControls color parsing', () => {
  const NS = 'http://www.w3.org/2000/svg';

  function createSvgText(label){
    const svg = document.createElementNS(NS, 'svg');
    const text = document.createElementNS(NS, 'text');
    text.textContent = label;
    svg.appendChild(text);
    document.body.appendChild(svg);
    return text;
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div class="workspace-toolbar">
        <div class="workspace-toolbar__section workspace-toolbar__section--dock">
          <button id="pieFontHost" type="button">Font host</button>
        </div>
      </div>
    `;
    require('../js/vendor.js');
    require('../js/shared/fontControls.js');
  });

  test('openForElement accepts spaced rgb computed colors for SVG text without fill attributes', () => {
    const fontControls = window.Shared?.fontControls;
    expect(fontControls && typeof fontControls.openForElement === 'function').toBe(true);

    const text = createSvgText('Proportion graph');
    fontControls.markText(text, { scopeId: 'pie', key: 'graphTitle' });

    const realGetComputedStyle = window.getComputedStyle.bind(window);
    const styleOverrides = {
      color: 'rgb(0, 0, 0)',
      fill: 'rgb(0, 0, 0)',
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: '400',
      fontStyle: 'normal',
      fontSize: '16px',
      textDecoration: 'none',
      verticalAlign: 'baseline',
      baselineShift: 'baseline',
      paddingLeft: '0px',
      paddingRight: '0px',
      borderLeftWidth: '0px',
      borderRightWidth: '0px',
      letterSpacing: 'normal',
      fontVariant: 'normal',
      textTransform: 'none',
      gap: '2px',
      width: '25px'
    };
    const buildComputedStyle = target => new Proxy(target, {
      get(base, prop, receiver){
        if(Object.prototype.hasOwnProperty.call(styleOverrides, prop)){
          return styleOverrides[prop];
        }
        const value = Reflect.get(base, prop, receiver);
        return typeof value === 'function' ? value.bind(base) : value;
      }
    });
    const computedSpy = jest.spyOn(window, 'getComputedStyle').mockImplementation(node => {
      const computed = realGetComputedStyle(node);
      if(node === text || node?.tagName === 'SPAN'){
        return buildComputedStyle(computed);
      }
      return computed;
    });

    fontControls.openForElement(text, { scopeId: 'pie', key: 'graphTitle' });

    const colorInput = document.querySelector('.font-controls-panel__color-input');
    expect(colorInput).not.toBeNull();
    expect(colorInput.value).toBe('#000000');

    computedSpy.mockRestore();
  });
});
