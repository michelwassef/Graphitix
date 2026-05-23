(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const namespace = Main.snapshotPolicy = Main.snapshotPolicy || {};

  const DEFAULT_SNAPSHOT_KIND = 'lifecycle-checkpoint';
  const DEFAULT_IDLE_THRESHOLD_MS = 2500;

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
        return {
          saveLike: true,
          captureLivePayload: true,
          allowSkipLivePayloadCapture: false,
          runSkippedPayloadDriftProbe: true,
          promoteSkippedPayloadDrift: true,
          reasonSkippable: false
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
          reasonSkippable: true
        };
      case 'autosave':
        return {
          saveLike: false,
          allowSkipLivePayloadCapture: true,
          lifecycleSnapshot: true,
          runSkippedPayloadDriftProbe: false,
          promoteSkippedPayloadDrift: false,
          reasonSkippable: true
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
    const highFidelityRecoveryEnabled = !!options.highFidelityRecoveryEnabled;
    const idleForMs = Number.isFinite(Number(options.idleForMs)) ? Math.max(0, Number(options.idleForMs)) : 0;
    const idleThresholdMs = Number.isFinite(Number(options.idleThresholdMs))
      ? Math.max(0, Number(options.idleThresholdMs))
      : DEFAULT_IDLE_THRESHOLD_MS;
    const idle = idleForMs >= idleThresholdMs;
    const scope = options.scope === 'tab' ? 'tab' : 'workspace';
    const autosaveLike = modeText === 'autosave' || kind === 'autosave' || reasonText.includes('autosave');
    const warmupLike = modeText === 'warmup-cache' || kind === 'warmup-cache';
    const recoveryLike = modeText === 'recovery'
      || kind === 'lifecycle-checkpoint'
      || reasonText.includes('recovery');

    let captureRenderCache = false;
    let policyId = 'default-lean';
    let highFidelityEligible = false;

    if (typeof explicitCapture === 'boolean') {
      captureRenderCache = explicitCapture;
      policyId = 'explicit-override';
    } else if (autosaveLike) {
      captureRenderCache = false;
      policyId = 'autosave-lean';
    } else if (warmupLike) {
      captureRenderCache = true;
      policyId = 'warmup-cache';
    } else if (recoveryLike) {
      highFidelityEligible = highFidelityRecoveryEnabled && scope === 'workspace' && idle;
      captureRenderCache = highFidelityEligible;
      policyId = highFidelityEligible ? 'recovery-high-fidelity-idle' : 'recovery-lean';
    } else {
      captureRenderCache = true;
      policyId = 'manual-archive-rich';
    }

    return {
      snapshotKind: kind,
      snapshotIntent: resolvePersistSnapshotIntent({
        snapshotKind: kind,
        snapshotIntent: options.snapshotIntent,
        reason: options.reason
      }),
      captureRenderCache,
      preserveRenderCacheTabScope: captureRenderCache ? 'all' : 'active-only',
      highFidelityEligible,
      highFidelityRecoveryEnabled,
      idleForMs,
      idleThresholdMs,
      idle,
      policyId
    };
  }

  namespace.constants = Object.freeze({
    defaultSnapshotKind: DEFAULT_SNAPSHOT_KIND,
    defaultIdleThresholdMs: DEFAULT_IDLE_THRESHOLD_MS
  });
  namespace.normalizeSnapshotKind = normalizeSnapshotKind;
  namespace.resolvePersistSnapshotIntent = resolvePersistSnapshotIntent;
  namespace.resolveArchiveBuildPolicy = resolveArchiveBuildPolicy;
})();
