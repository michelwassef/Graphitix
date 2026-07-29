describe('Shared.dataTransforms', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/shared/dataPipeline.js');
    require('../js/shared/dataTransforms.js');
  });

  test('applies scale transform to numeric cells within scope', () => {
    const api = window.Shared.dataTransforms;
    const matrix = [
      ['Label', 'A', 'B'],
      ['g1', 1, 2],
      ['g2', '3', 4]
    ];
    const result = api.applyTransform(matrix, { type: 'scale', factor: 10 }, {
      headerRows: 1,
      startCol: 1
    });
    expect(result.ok).toBe(true);
    expect(result.data[0]).toEqual(['Label', 'A', 'B']);
    expect(result.data[1]).toEqual(['g1', 10, 20]);
    expect(result.data[2]).toEqual(['g2', 30, 40]);
  });

  test('applies log transform with pseudocount and skips invalid values', () => {
    const api = window.Shared.dataTransforms;
    const matrix = [
      ['Label', 'A', 'B', 'C'],
      ['g1', 0, 3, -1]
    ];
    const result = api.applyTransform(matrix, { type: 'log', base: 2, pseudoCount: 1 }, {
      headerRows: 1,
      startCol: 1
    });
    expect(result.ok).toBe(true);
    expect(result.data[1][1]).toBeCloseTo(0, 8);
    expect(result.data[1][2]).toBeCloseTo(2, 8);
    expect(result.data[1][3]).toBe(-1);
    expect(result.stats.skippedCells).toBeGreaterThan(0);
  });

  test('applies column CPM normalization', () => {
    const api = window.Shared.dataTransforms;
    const matrix = [
      ['Label', 'S1', 'S2'],
      ['g1', 10, 40],
      ['g2', 30, 60]
    ];
    const result = api.applyTransform(matrix, { type: 'cpm', orientation: 'column' }, {
      headerRows: 1,
      startCol: 1
    });
    expect(result.ok).toBe(true);
    expect(result.data[1][1]).toBeCloseTo(250000, 4);
    expect(result.data[2][1]).toBeCloseTo(750000, 4);
    expect(result.data[1][2]).toBeCloseTo(400000, 4);
    expect(result.data[2][2]).toBeCloseTo(600000, 4);
  });

  test('supports safe custom expressions', () => {
    const api = window.Shared.dataTransforms;
    const matrix = [
      ['Label', 'A'],
      ['g1', 3]
    ];
    const result = api.applyTransform(matrix, { type: 'custom', expression: 'log2(x + 1)' }, {
      headerRows: 1,
      startCol: 1
    });
    expect(result.ok).toBe(true);
    expect(result.data[1][1]).toBeCloseTo(2, 8);

    const bad = api.applyTransform(matrix, { type: 'custom', expression: 'process.exit(1)' }, {
      headerRows: 1,
      startCol: 1
    });
    expect(bad.ok).toBe(false);
  });

  test('supports median centering for rows', () => {
    const api = window.Shared.dataTransforms;
    const matrix = [
      ['Label', 'A', 'B', 'C'],
      ['g1', 1, 10, 100]
    ];
    const result = api.applyTransform(matrix, { type: 'centerRows', method: 'median' }, {
      headerRows: 1,
      startCol: 1
    });
    expect(result.ok).toBe(true);
    expect(result.data[1][1]).toBe(-9);
    expect(result.data[1][2]).toBe(0);
    expect(result.data[1][3]).toBe(90);
  });

  test('materializes filtered RNA-seq normalized log counts as a replayable table transform', () => {
    const api = window.Shared.dataTransforms;
    const matrix = [
      ['Label point', true, false, false],
      ['Variable', 'S1', 'S2', 'S3'],
      ['stable-a', 10, 10, 10],
      ['variable-b', 10, 20, 40],
      ['stable-c', 20, 20, 20],
      ['variable-d', 10, 40, 160]
    ];
    const spec = {
      type: 'rnaSeqNormalizedLog',
      headerRows: 2,
      startCol: 1,
      labelCol: 0,
      topFeatureLimit: 2
    };
    const result = api.applyTransform(matrix, spec);
    expect(result.ok).toBe(true);
    expect(result.data.slice(0, 2)).toEqual(matrix.slice(0, 2));
    expect(result.data.slice(2).map(row => row[0])).toEqual(['variable-d', 'variable-b']);
    expect(result.summary.preprocessingMetadata.selectedFeatureCount).toBe(2);
    expect(result.data[2].slice(1).every(Number.isFinite)).toBe(true);

    const replay = api.applyTransform(matrix, result.spec);
    expect(replay.ok).toBe(true);
    expect(replay.data).toEqual(result.data);
  });

  test('RNA-seq table transform rejects invalid raw counts', () => {
    const api = window.Shared.dataTransforms;
    const result = api.applyTransform([
      ['Variable', 'S1', 'S2'],
      ['g1', 1, 2],
      ['g2', 1.5, 3]
    ], {
      type: 'rnaSeqNormalizedLog',
      headerRows: 1,
      startCol: 1
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-negative integer raw counts/i);
  });
});
