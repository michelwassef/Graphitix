(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const namespace = Main.snapshotPolicy = Main.snapshotPolicy || {};

  const DEFAULT_SNAPSHOT_KIND = 'lifecycle-checkpoint';

  function cloneSnapshotIntent(intent) {
    if (!intent || typeof intent !== 'object') {
      return {};
    }
    return { ...intent };
  }

  function normalizeSnapshotKind(kind, reason) {
    const normalizedKind = String(kind || '').trim().toLowerCase();
    if (normalizedKind) {
      return normalizedKind;
    }
    const normalizedReason = String(reason || '').trim().toLowerCase();
    if (!normalizedReason) {
      return DEFAULT_SNAPSHOT_KIND;
    }
    if (normalizedReason.includes('recovery')) {
      return 'recovery';
    }
    if (normalizedReason.includes('autosave')) {
      return 'autosave';
    }
    if (normalizedReason.includes('archive') || normalizedReason.includes('save')) {
      return 'archive-save';
    }
    if (normalizedReason.includes('warmup') || normalizedReason.includes('cache-prime')) {
      return 'warmup-cache';
    }
    return DEFAULT_SNAPSHOT_KIND;
  }

  function resolvePersistSnapshotIntent(options = {}) {
    const explicit = cloneSnapshotIntent(options.snapshotIntent);
    if (Object.keys(explicit).length) {
      return explicit;
    }
    const kind = normalizeSnapshotKind(options.snapshotKind, options.reason);
    switch (kind) {
      case 'archive-save':
      case 'document-snapshot':
      case 'append-existing':
      case 'recovery':
        return {
          saveLike: true,
          captureLivePayload: true,
          skipLivePayloadCapture: false,
          allowSkipLivePayloadCapture: false,
          lifecycleSnapshot: false,
          runSkippedPayloadDriftProbe: true,
          promoteSkippedPayloadDrift: true,
          reasonSkippable: false,
          snapshotCapture: true
        };
      case 'warmup-cache':
        return {
          saveLike: false,
          captureLivePayload: false,
          skipLivePayloadCapture: true,
          allowSkipLivePayloadCapture: true,
          lifecycleSnapshot: true,
          runSkippedPayloadDriftProbe: false,
          promoteSkippedPayloadDrift: false,
          reasonSkippable: true,
          snapshotCapture: true
        };
      case 'autosave':
        return {
          saveLike: false,
          allowSkipLivePayloadCapture: true,
          lifecycleSnapshot: true,
          runSkippedPayloadDriftProbe: false,
          promoteSkippedPayloadDrift: false,
          reasonSkippable: true,
          snapshotCapture: true
        };
      case 'lifecycle-checkpoint':
      default:
        return {
          saveLike: false,
          allowSkipLivePayloadCapture: true,
          lifecycleSnapshot: true,
          runSkippedPayloadDriftProbe: false,
          promoteSkippedPayloadDrift: false,
          reasonSkippable: true
        };
    }
  }

  function resolveArchiveBuildPolicy(options = {}) {
    const kind = normalizeSnapshotKind(options.snapshotKind, options.reason);
    const reasonText = String(options.reason || '').toLowerCase();
    const modeText = String(options.mode || '').toLowerCase();
    const explicitCapture = options.captureRenderCacheBeforeSnapshot;
    const explicitInclude = options.includeRenderCacheInSnapshot;
    const autosaveLike = modeText === 'autosave' || kind === 'autosave' || reasonText.includes('autosave');
    const warmupLike = modeText === 'warmup-cache' || kind === 'warmup-cache';
    const recoveryLike = modeText === 'recovery'
      || kind === 'recovery'
      || reasonText.includes('recovery');

    let captureRenderCache = false;
    let includeRenderCache = false;
    let policyId = 'default-lean';

    if (autosaveLike) {
      captureRenderCache = false;
      includeRenderCache = false;
      policyId = 'autosave-lean';
    } else if (warmupLike) {
      captureRenderCache = true;
      includeRenderCache = true;
      policyId = 'warmup-cache';
    } else if (recoveryLike) {
      // Crash recovery is a reopen path, not a lower-fidelity autosave path.
      // It must persist the same owner-scoped completed render checkpoints as
      // manual save so recovery never redraws a visually different graph when
      // an exact cache already exists.
      captureRenderCache = true;
      includeRenderCache = true;
      policyId = 'recovery-rich';
    } else {
      captureRenderCache = true;
      includeRenderCache = true;
      policyId = 'manual-archive-rich';
    }

    if (typeof explicitCapture === 'boolean') {
      captureRenderCache = explicitCapture;
      policyId = `${policyId}:capture-override`;
    }
    if (typeof explicitInclude === 'boolean') {
      includeRenderCache = explicitInclude;
      policyId = `${policyId}:include-override`;
    }

    return {
      snapshotKind: kind,
      snapshotIntent: resolvePersistSnapshotIntent({
        snapshotKind: kind,
        snapshotIntent: options.snapshotIntent,
        reason: options.reason
      }),
      captureRenderCache,
      includeRenderCache,
      preserveRenderCacheTabScope: includeRenderCache ? 'all' : 'active-only',
      policyId
    };
  }

  namespace.constants = Object.freeze({
    defaultSnapshotKind: DEFAULT_SNAPSHOT_KIND
  });
  namespace.normalizeSnapshotKind = normalizeSnapshotKind;
  namespace.resolvePersistSnapshotIntent = resolvePersistSnapshotIntent;
  namespace.resolveArchiveBuildPolicy = resolveArchiveBuildPolicy;
})();
