describe('snapshotPolicy recovery parity', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Main = {};
    require('../js/main/snapshotPolicy.js');
  });

  afterEach(() => {
    delete window.Main;
  });

  test('recovery uses the same authoritative live payload capture contract as manual save', () => {
    const policy = window.Main.snapshotPolicy;
    const saveIntent = policy.resolvePersistSnapshotIntent({ snapshotKind: 'archive-save' });
    const recoveryIntent = policy.resolvePersistSnapshotIntent({ snapshotKind: 'recovery' });

    expect(recoveryIntent).toEqual(expect.objectContaining({
      saveLike: true,
      captureLivePayload: true,
      skipLivePayloadCapture: false,
      allowSkipLivePayloadCapture: false,
      lifecycleSnapshot: false,
      reasonSkippable: false,
      snapshotCapture: true
    }));
    expect(recoveryIntent).toEqual(saveIntent);
  });

  test('Hi-Fi recovery requires explicit opt-in and idle time', () => {
    const policy = window.Main.snapshotPolicy;
    const manual = policy.resolveArchiveBuildPolicy({
      mode: 'manual-save',
      snapshotKind: 'archive-save',
      scope: 'workspace'
    });
    const activeRecovery = policy.resolveArchiveBuildPolicy({
      mode: 'recovery',
      snapshotKind: 'recovery',
      scope: 'workspace',
      idleForMs: 0
    });
    const idleRecovery = policy.resolveArchiveBuildPolicy({
      mode: 'recovery',
      snapshotKind: 'recovery',
      scope: 'workspace',
      idleForMs: policy.constants.defaultIdleThresholdMs
    });
    const optedInIdleRecovery = policy.resolveArchiveBuildPolicy({
      mode: 'recovery',
      snapshotKind: 'recovery',
      scope: 'workspace',
      highFidelityEnabled: true,
      idleForMs: policy.constants.defaultIdleThresholdMs
    });

    expect(manual.captureRenderCache).toBe(true);
    expect(activeRecovery.captureRenderCache).toBe(false);
    expect(idleRecovery.captureRenderCache).toBe(false);
    expect(optedInIdleRecovery.captureRenderCache).toBe(true);
  });

  test('recovery reasons normalize to the dedicated recovery kind', () => {
    expect(window.Main.snapshotPolicy.normalizeSnapshotKind('', 'recovery-interval')).toBe('recovery');
  });
});
