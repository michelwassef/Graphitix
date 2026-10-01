'use strict';

// JSDOM does not implement Element.scrollBy, while the workspace tab strip
// uses it as a browser-supported projection operation. Keep the test model
// observable through scrollLeft/scrollTop without pretending to perform CSS
// animation.
function installScrollByPolyfill(target = globalThis) {
  const ElementPrototype = target.Element?.prototype;
  if (!ElementPrototype || typeof ElementPrototype.scrollBy === 'function') {
    return;
  }
  ElementPrototype.scrollBy = function scrollBy(options, top) {
    const left = typeof options === 'object'
      ? Number(options?.left || 0)
      : Number(options || 0);
    const vertical = typeof options === 'object'
      ? Number(options?.top || 0)
      : Number(top || 0);
    if (Number.isFinite(left)) {
      this.scrollLeft = Number(this.scrollLeft || 0) + left;
    }
    if (Number.isFinite(vertical)) {
      this.scrollTop = Number(this.scrollTop || 0) + vertical;
    }
  };
}

installScrollByPolyfill();

module.exports = { installScrollByPolyfill };
