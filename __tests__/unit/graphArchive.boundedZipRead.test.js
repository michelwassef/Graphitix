describe('graphArchive bounded ZIP entry reads', () => {
  let JSZip;
  let graphArchive;

  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
    JSZip = require('jszip');
    graphArchive = require('../../js/shared/graphArchive.js')
      && window.Shared.graphArchive;
  });

  afterEach(() => {
    delete window.Shared;
  });

  test('streams a ZIP member that fits within its limit', async () => {
    const source = Uint8Array.from({ length: 96 * 1024 }, (_, index) => index % 251);
    const zip = new JSZip();
    zip.file('graphs/G1/data.bin', source, { compression: 'DEFLATE' });
    const archive = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));

    const result = await graphArchive.readZipEntryLimitedBytes(
      archive.file('graphs/G1/data.bin'), source.byteLength
    );

    expect(result).toEqual(source);
  });

  test('pauses decompression and rejects as soon as a ZIP member exceeds its limit', async () => {
    const zip = new JSZip();
    zip.file('graphs/G1/data.bin', 'x'.repeat(96 * 1024), { compression: 'DEFLATE' });
    const archive = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));

    await expect(graphArchive.readZipEntryLimitedBytes(
      archive.file('graphs/G1/data.bin'), 4096
    )).rejects.toThrow('ZIP entry exceeds the 4096-byte extraction limit.');
  });

  test('uses the public JSZip stream interface and pauses before retaining an oversized chunk', async () => {
    const handlers = {};
    let paused = false;
    const stream = {
      on(event, handler){ handlers[event] = handler; return this; },
      pause(){ paused = true; },
      resume(){ handlers.data.call(this, new Uint8Array(8)); return this; }
    };
    const entry = { internalStream: jest.fn(() => stream) };

    await expect(graphArchive.readZipEntryLimitedBytes(entry, 4)).rejects.toThrow('4-byte extraction limit');
    expect(entry.internalStream).toHaveBeenCalledWith('uint8array');
    expect(paused).toBe(true);
  });
});
