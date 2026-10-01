/* global jest */
/* Shared minimal DOM harness for resizer options and geometry contracts. */

function createResizerOptionsMenuHarness() {
  function setup() {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../js/shared/cartesianLayout.js');
    require('../js/shared/resizer.js');
  }

  function createSvgBox(){
    const box = document.createElement('div');
    box.className = 'svgbox';
    box.getBoundingClientRect = () => {
      const width = Number.parseFloat(box.style.width) || 420;
      const height = Number.parseFloat(box.style.height) || 320;
      return { width, height, top: 0, left: 0, right: width, bottom: height };
    };

    const vertical = document.createElement('div');
    vertical.className = 'resizer resizer-vertical';
    const horizontal = document.createElement('div');
    horizontal.className = 'resizer resizer-horizontal';
    const corner = document.createElement('div');
    corner.className = 'resizer resizer-corner';
    const plot = document.createElement('div');
    plot.id = 'testPlot';

    box.appendChild(vertical);
    box.appendChild(horizontal);
    box.appendChild(corner);
    box.appendChild(plot);
    document.body.appendChild(box);
    return box;
  }

  return { setup, createSvgBox };
}

module.exports = { createResizerOptionsMenuHarness };
