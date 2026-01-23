// DataPipeline tests

describe('DataPipeline', () => {
  beforeAll(() => {
    require('../js/shared/dataPipeline.js');
  });

  it('should expose the DataPipeline factory', () => {
    expect(window.Shared).toBeDefined();
    expect(window.Shared.DataPipeline).toBeDefined();
    expect(typeof window.Shared.DataPipeline.create).toBe('function');
  });

  it('should be lazy until a terminal operation is called', () => {
    let calls = 0;
    const pipeline = window.Shared.DataPipeline.create([1, 2, 3])
      .map((value) => {
        calls += 1;
        return value * 2;
      });

    expect(calls).toBe(0);
    const result = pipeline.toArray();
    expect(result).toEqual([2, 4, 6]);
    expect(calls).toBe(3);
  });

  it('should cache results when the signature is unchanged', () => {
    let calls = 0;
    const pipeline = window.Shared.DataPipeline.create([1, 2])
      .map((value) => {
        calls += 1;
        return value + 1;
      });

    expect(pipeline.toArray()).toEqual([2, 3]);
    expect(pipeline.toArray()).toEqual([2, 3]);
    expect(calls).toBe(2);
  });

  it('should invalidate cache and recompute when requested', () => {
    let calls = 0;
    const pipeline = window.Shared.DataPipeline.create([1, 2])
      .map((value) => {
        calls += 1;
        return value * 3;
      });

    pipeline.toArray();
    expect(calls).toBe(2);
    pipeline.invalidate('test');
    pipeline.toArray();
    expect(calls).toBe(4);
  });

  it('should respect explicit source signatures', () => {
    let signature = 1;
    let calls = 0;
    const source = () => ({
      data: [5, 6],
      signature
    });
    const pipeline = window.Shared.DataPipeline.create(source)
      .map((value) => {
        calls += 1;
        return value + 1;
      });

    expect(pipeline.toArray()).toEqual([6, 7]);
    expect(calls).toBe(2);
    signature = 2;
    expect(pipeline.toArray()).toEqual([6, 7]);
    expect(calls).toBe(4);
  });

  it('should support flatMap and unique steps', () => {
    const pipeline = window.Shared.DataPipeline.create([1, 2, 2])
      .flatMap((value) => [value, value + 1])
      .unique();

    expect(pipeline.toArray()).toEqual([1, 2, 3]);
  });
});
