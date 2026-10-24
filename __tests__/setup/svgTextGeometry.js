// JSDOM has no SVG layout engine. These deterministic text bounds support
// structural unit tests; rendered glyph geometry is verified in Chromium.
function installSvgTextGeometry(){
  const original = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: function(){
      const size = parseFloat(this.getAttribute('font-size')) || 12;
      const width = (this.textContent || '').length * size * 0.6;
      return { x: Number(this.getAttribute('x')) - width / 2, y: Number(this.getAttribute('y')) - size / 2, width, height: size };
    }
  });
  return () => {
    if(original){ Object.defineProperty(SVGElement.prototype, 'getBBox', original); }
    else { delete SVGElement.prototype.getBBox; }
  };
}

module.exports = { installSvgTextGeometry };
