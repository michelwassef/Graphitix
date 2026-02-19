describe('fileIO activation handling', () => {
  let originalActivationDescriptor;
  let originalShowSavePicker;

  function setActivation(isActive) {
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { isActive: !!isActive }
    });
  }

  function installFileIO() {
    jest.resetModules();
    window.Shared = {};
    require('../js/shared/fileIO.js');
    return window.Shared.fileIO;
  }

  beforeEach(() => {
    originalActivationDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'userActivation');
    originalShowSavePicker = window.showSaveFilePicker;
  });

  afterEach(() => {
    if (originalActivationDescriptor) {
      Object.defineProperty(window.navigator, 'userActivation', originalActivationDescriptor);
    } else {
      delete window.navigator.userActivation;
    }
    window.showSaveFilePicker = originalShowSavePicker;
    delete window.Shared;
  });

  test('verifyPermission does not request permission without user activation', async () => {
    setActivation(false);
    const fileIO = installFileIO();
    const handle = {
      queryPermission: jest.fn().mockResolvedValue('prompt'),
      requestPermission: jest.fn().mockResolvedValue('granted')
    };

    const allowed = await fileIO.verifyPermission(handle, true);

    expect(allowed).toBe(false);
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  test('verifyPermission handles activation SecurityError without throwing', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const activationErr = typeof DOMException === 'function'
      ? new DOMException('User activation is required to request permissions.', 'SecurityError')
      : { name: 'SecurityError', message: 'User activation is required to request permissions.' };
    const handle = {
      queryPermission: jest.fn().mockResolvedValue('prompt'),
      requestPermission: jest.fn().mockRejectedValue(activationErr)
    };

    const allowed = await fileIO.verifyPermission(handle, true);

    expect(allowed).toBe(false);
    expect(handle.requestPermission).toHaveBeenCalled();
  });

  test('saveGraphFileAs skips picker and downloads when activation is missing', async () => {
    setActivation(false);
    const fileIO = installFileIO();
    window.showSaveFilePicker = jest.fn();
    const downloadSpy = jest.spyOn(fileIO, 'downloadBlob').mockImplementation(() => {});
    const downloadJsonSpy = jest.spyOn(fileIO, 'downloadJSON').mockImplementation(() => {});

    const result = await fileIO.saveGraphFileAs({
      context: 'workspace',
      payload: new Blob(['zip'], { type: 'application/zip' }),
      fileName: 'workspace.graph',
      downloadFileName: 'workspace.graph',
      mimeType: 'application/zip'
    });

    expect(window.showSaveFilePicker).not.toHaveBeenCalled();
    expect(downloadSpy.mock.calls.length + downloadJsonSpy.mock.calls.length).toBeGreaterThan(0);
    expect(result.status).toBe('downloaded');
    expect(result.via).toBe('download');
  });

  test('saveGraphFileAs falls back to download on picker SecurityError activation failure', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const activationErr = typeof DOMException === 'function'
      ? new DOMException('User activation is required to request permissions.', 'SecurityError')
      : { name: 'SecurityError', message: 'User activation is required to request permissions.' };
    window.showSaveFilePicker = jest.fn().mockRejectedValue(activationErr);
    const downloadSpy = jest.spyOn(fileIO, 'downloadBlob').mockImplementation(() => {});
    const downloadJsonSpy = jest.spyOn(fileIO, 'downloadJSON').mockImplementation(() => {});

    const result = await fileIO.saveGraphFileAs({
      context: 'workspace',
      payload: new Blob(['zip'], { type: 'application/zip' }),
      fileName: 'workspace.graph',
      downloadFileName: 'workspace.graph',
      mimeType: 'application/zip'
    });

    expect(window.showSaveFilePicker).toHaveBeenCalled();
    expect(downloadSpy.mock.calls.length + downloadJsonSpy.mock.calls.length).toBeGreaterThan(0);
    expect(result.status).toBe('downloaded');
    expect(result.via).toBe('download-activation-fallback');
  });

  test('saveGraphFileAs does not build payload when picker is cancelled', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const abortErr = typeof DOMException === 'function'
      ? new DOMException('The user aborted a request.', 'AbortError')
      : { name: 'AbortError', message: 'The user aborted a request.' };
    window.showSaveFilePicker = jest.fn().mockRejectedValue(abortErr);
    const getPayload = jest.fn(() => new Blob(['zip'], { type: 'application/zip' }));

    const result = await fileIO.saveGraphFileAs({
      context: 'workspace',
      getPayload,
      fileName: 'workspace.graph',
      downloadFileName: 'workspace.graph',
      mimeType: 'application/zip'
    });

    expect(window.showSaveFilePicker).toHaveBeenCalled();
    expect(getPayload).not.toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
  });

  test('saveGraphFile does not build payload when picker is cancelled', async () => {
    setActivation(true);
    const fileIO = installFileIO();
    const abortErr = typeof DOMException === 'function'
      ? new DOMException('The user aborted a request.', 'AbortError')
      : { name: 'AbortError', message: 'The user aborted a request.' };
    window.showSaveFilePicker = jest.fn().mockRejectedValue(abortErr);
    const getPayload = jest.fn(() => new Blob(['zip'], { type: 'application/zip' }));

    const result = await fileIO.saveGraphFile({
      context: 'workspace',
      getPayload,
      fileName: 'workspace.graph',
      downloadFileName: 'workspace.graph',
      mimeType: 'application/zip'
    });

    expect(window.showSaveFilePicker).toHaveBeenCalled();
    expect(getPayload).not.toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
    expect(result.via).toBe('picker');
  });
});
