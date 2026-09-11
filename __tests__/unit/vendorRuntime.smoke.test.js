const agGrid = require('ag-grid-community');
const jStatModule = require('jstat');
const svd = require('svd-js');
const JSZip = require('jszip');

describe('real npm vendor runtime smoke', () => {
  test('exports the APIs required by the application without Jest fakes', () => {
    const jStat = jStatModule?.jStat || jStatModule;
    expect(typeof agGrid.createGrid).toBe('function');
    expect(jStat.normal.cdf(0, 0, 1)).toBeCloseTo(0.5, 12);
    expect(svd.SVD([[1]])).toEqual(expect.objectContaining({ q: expect.any(Array) }));
    expect(JSZip.version).toBe('3.10.1');
  });
});
