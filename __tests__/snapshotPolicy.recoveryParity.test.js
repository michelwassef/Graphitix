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

  test('manual save and recovery use the same rich render-cache contract', () => {
    const policy = window.Main.snapshotPolicy;
    const manual = policy.resolveArchiveBuildPolicy({
      mode: 'manual-save',
      snapshotKind: 'archive-save',
      scope: 'workspace'
    });
    const recovery = policy.resolveArchiveBuildPolicy({
      mode: 'recovery',
      snapshotKind: 'recovery',
      scope: 'workspace'
    });

    expect(manual).toEqual(expect.objectContaining({
      captureRenderCache: true,
      includeRenderCache: true,
      preserveRenderCacheTabScope: 'all',
      policyId: 'manual-archive-rich'
    }));
    expect(recovery).toEqual(expect.objectContaining({
      captureRenderCache: true,
      includeRenderCache: true,
      preserveRenderCacheTabScope: 'all',
      policyId: 'recovery-rich'
    }));
  });

  test('autosave remains lean and excludes render caches', () => {
    const policy = window.Main.snapshotPolicy.resolveArchiveBuildPolicy({
      mode: 'autosave',
      snapshotKind: 'autosave',
      scope: 'workspace'
    });

    expect(policy).toEqual(expect.objectContaining({
      captureRenderCache: false,
      includeRenderCache: false,
      preserveRenderCacheTabScope: 'active-only',
      policyId: 'autosave-lean'
    }));
  });

  test('recovery reasons normalize to the dedicated recovery kind', () => {
    expect(window.Main.snapshotPolicy.normalizeSnapshotKind('', 'recovery-interval')).toBe('recovery');
  });
});
