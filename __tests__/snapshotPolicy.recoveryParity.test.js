describe('snapshotPolicy recovery parity', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Main = {};
    require('../js/main/snapshotPolicy.js');
  });

  afterEach(() => {
    delete window.Main;
  });

  test('recovery uses the same canonical live-payload capture contract as manual save', () => {
    const policy = window.Main.snapshotPolicy;
    const saveIntent = policy.resolvePersistSnapshotIntent({ snapshotKind: 'archive-save' });
    const recoveryIntent = policy.resolvePersistSnapshotIntent({ snapshotKind: 'recovery' });

    expect(recoveryIntent).toEqual(saveIntent);
    expect(recoveryIntent).toEqual(expect.objectContaining({
      saveLike: true,
      captureLivePayload: true,
      allowSkipLivePayloadCapture: false,
      reasonSkippable: false,
      snapshotCapture: true
    }));
  });

  test('recovery differs from manual save only in optional cache policy', () => {
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

    expect(activeRecovery.snapshotIntent).toEqual(manual.snapshotIntent);
    expect(idleRecovery.snapshotIntent).toEqual(manual.snapshotIntent);
    expect(manual.captureRenderCache).toBe(true);
    expect(activeRecovery.captureRenderCache).toBe(false);
    expect(idleRecovery.captureRenderCache).toBe(true);
  });

  test('recovery reasons normalize to the dedicated recovery kind', () => {
    expect(window.Main.snapshotPolicy.normalizeSnapshotKind('', 'recovery-interval')).toBe('recovery');
  });
});
