const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  GRAPH_TITLE_CONTROL_SELECTOR,
  LEGEND_CONTROL_IDS,
  LEGEND_MARKER_PATTERN,
  MANIFEST_SCHEMA_VERSION,
  PREVIEW_SOURCE,
  PROPORTIONAL_STROKE_CONTRACT,
  REGISTRY_FILE,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  TYPES,
  assertReusableAssetFresh,
  computeWelcomeThumbnailProjection,
  computeSourceFingerprints,
  findStaleTypes,
  hashCanonicalText,
  normalizeTextForHash,
  parseRequestedTypes,
  resolveCanonicalSvgDimensions,
  stripXmlDeclaration,
  validateStandaloneSvg,
  withTemporaryAssetDirectory
} = require('../scripts/generate-welcome-example-thumbnails.cjs');

const ROOT = path.resolve(__dirname, '..');
const ASSET_DIR = path.join(ROOT, 'assets', 'welcome-examples');

function readRegistry() {
  const text = fs.readFileSync(path.join(ASSET_DIR, REGISTRY_FILE), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(text, context, { filename: REGISTRY_FILE });
  return { text, registry: context.window.GraphitixWelcomeThumbnails };
}

describe('welcome example SVG assets', () => {
  test('all graph families use fresh, flattened and self-contained vector exports', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'manifest.json'), 'utf8'));
    const fingerprints = computeSourceFingerprints();
    const { text: registryText, registry } = readRegistry();

    expect(manifest).toMatchObject({
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      generator: 'scripts/generate-welcome-example-thumbnails.cjs',
      assetFormat: 'svg',
      previewSource: PREVIEW_SOURCE,
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      sourceFingerprint: fingerprints.aggregate,
      registry: {
        file: REGISTRY_FILE,
        sha256: hashCanonicalText(registryText),
        inline: true
      }
    });
    expect(manifest.examples.map(record => record.type)).toEqual(TYPES);
    expect(Object.keys(registry)).toEqual(expect.arrayContaining(TYPES));
    expect(Object.keys(registry)).toHaveLength(TYPES.length);

    for (const record of manifest.examples) {
      const controlId = LEGEND_CONTROL_IDS[record.type] || null;
      expect(['canonical-export', 'owner-preview-migrated']).toContain(record.captureMode);
      expect(record).toMatchObject({
        file: `${record.type}.svg`,
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        source: PREVIEW_SOURCE,
        sourceFormat: 'svg',
        inlineReady: true,
        rasterImageCount: 0,
        sourceFingerprint: fingerprints.byType[record.type]
      });
      if (controlId) {
        expect(record.legendSuppression).toMatchObject({
          mode: 'control',
          controlId,
          requested: true,
          verified: true
        });
      } else {
        expect(record.legendSuppression).toMatchObject({
          mode: 'not-applicable',
          requested: false
        });
      }
      expect(record.graphTitleSuppression).toMatchObject({
        mode: 'control',
        selector: GRAPH_TITLE_CONTROL_SELECTOR,
        requested: true,
        verified: true
      });
      expect(record).toMatchObject({
        proportionalStrokeContract: PROPORTIONAL_STROKE_CONTRACT
      });
      expect(record.visualScale).toBeGreaterThan(0);
      expect(Number.isInteger(record.nonScalingStrokeCount)).toBe(true);
      expect(record.nonScalingStrokeCount).toBeGreaterThanOrEqual(0);

      const svgText = fs.readFileSync(path.join(ASSET_DIR, record.file), 'utf8');
      expect(() => validateStandaloneSvg(svgText, record.type)).not.toThrow();
      expect(Buffer.byteLength(svgText, 'utf8')).toBeGreaterThanOrEqual(800);
      expect(svgText.match(/<svg\b/gi)).toHaveLength(1);
      expect(svgText).not.toMatch(/<(?:image|foreignObject|script|iframe|object|embed)\b/i);
      expect(svgText).not.toMatch(/\b(?:href|xlink:href)\s*=\s*["'](?!#)/i);
      expect(svgText).toContain(`data-graphitix-welcome-thumbnail="${record.type}"`);
      const idPrefix = `graphitix-welcome-${record.type}-id-`;
      expect(svgText).toContain(`data-id-prefix="${idPrefix}"`);
      const ids = Array.from(svgText.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach(id => expect(id).toMatch(new RegExp(`^${idPrefix}\\d+$`)));
      const idSet = new Set(ids);
      const urlReferences = Array.from(svgText.matchAll(/url\(\s*["']?#([^)"'\s]+)["']?\s*\)/g), match => match[1]);
      urlReferences.forEach(id => expect(idSet.has(id)).toBe(true));
      expect(svgText).not.toMatch(/\bid=["'][^"']*(?:workspace|tab-|session)[^"']*["']/i);
      expect(svgText).toContain('data-inline-ready="true"');
      expect(svgText).toContain('data-graph-title-suppressed="true"');
      expect(svgText).toContain(`data-proportional-stroke-contract="${PROPORTIONAL_STROKE_CONTRACT}"`);
      expect(svgText).toContain(`data-thumbnail-visual-scale="${record.visualScale}"`);
      expect(svgText).toContain(`data-non-scaling-stroke-count="${record.nonScalingStrokeCount}"`);
      expect(svgText).not.toMatch(/\bvector-effect\s*=\s*["']non-scaling-stroke["']/i);
      expect(svgText).not.toMatch(/\bvector-effect\s*:\s*non-scaling-stroke\b/i);
      expect(svgText).not.toMatch(/data-font-role=["']graphTitle["']/i);
      const bakedStrokeMarkers = svgText.match(/\bdata-welcome-baked-stroke=["']true["']/gi) || [];
      expect(bakedStrokeMarkers).toHaveLength(record.nonScalingStrokeCount);
      if (record.type === 'heatmap') {
        expect(record.nonScalingStrokeCount).toBeGreaterThan(0);
      }
      if (record.type === 'heatmap') {
        expect(['svg', 'vector-matrix']).toContain(record.exportProjection);
        expect(svgText).toContain(`data-export-projection="${record.exportProjection}"`);
        if (record.exportProjection === 'vector-matrix') {
          expect(svgText).toMatch(/data-heatmap-vector-cell-count="[1-9]\d*"/);
        }
      }
      if (controlId) {
        expect(svgText).not.toMatch(LEGEND_MARKER_PATTERN);
      }
      expect(normalizeTextForHash(registry[record.type])).toBe(normalizeTextForHash(stripXmlDeclaration(svgText)));
      expect(hashCanonicalText(svgText)).toBe(record.sha256);
    }
  });

  test('provenance hashing is stable across Unix and Windows line endings', () => {
    const lf = 'first line\nsecond line\n';
    const crlf = 'first line\r\nsecond line\r\n';
    const legacyCr = 'first line\rsecond line\r';

    expect(normalizeTextForHash(crlf)).toBe(lf);
    expect(normalizeTextForHash(legacyCr)).toBe(lf);
    expect(hashCanonicalText(crlf)).toBe(hashCanonicalText(lf));
    expect(hashCanonicalText(legacyCr)).toBe(hashCanonicalText(lf));
  });

  test('serialized SVG viewport is canonical when an export clone is detached', () => {
    expect(resolveCanonicalSvgDimensions(
      '<svg width="100%" height="100%" viewBox="0 0 452 392"></svg>',
      0,
      0
    )).toEqual({ width: 452, height: 392 });

    expect(resolveCanonicalSvgDimensions(
      '<svg width="450" height="392" viewBox="0 0 900 784"></svg>',
      0,
      0
    )).toEqual({ width: 450, height: 392 });
  });

  test('supports deterministic targeted regeneration and reports no stale assets after publication', () => {
    expect(parseRequestedTypes(['--types=scatter,pca,surface'])).toEqual(['scatter', 'pca', 'surface']);
    expect(() => parseRequestedTypes(['--types=scatter,unknown'])).toThrow(/Invalid welcome thumbnail type selection/);
    expect(findStaleTypes()).toEqual([]);
  });



  test('temporary generation staging is removed after an early failure', async () => {
    let temporaryDir = null;
    await expect(withTemporaryAssetDirectory(async dir => {
      temporaryDir = dir;
      fs.writeFileSync(path.join(dir, 'partial.svg'), '<svg/>', 'utf8');
      throw new Error('simulated early generation failure');
    })).rejects.toThrow('simulated early generation failure');

    expect(temporaryDir).toBeTruthy();
    expect(fs.existsSync(temporaryDir)).toBe(false);
  });

  test('targeted regeneration never promotes a stale reused asset to a fresh fingerprint', () => {
    expect(() => assertReusableAssetFresh({
      type: 'box',
      sourceFingerprint: 'old-fingerprint'
    }, 'box', 'new-fingerprint')).toThrow(/Cannot reuse stale welcome thumbnail asset for box/);

    expect(assertReusableAssetFresh({
      type: 'box',
      sourceFingerprint: 'current-fingerprint'
    }, 'box', 'current-fingerprint')).toBe(true);
  });

  test('legacy raster thumbnails are not retained', () => {
    const rasterFiles = fs.readdirSync(ASSET_DIR).filter(fileName => /\.(?:png|jpe?g|webp)$/i.test(fileName));
    expect(rasterFiles).toEqual([]);
  });

  test('source viewport projection preserves the graph viewport before fitting the card', () => {
    const projection = computeWelcomeThumbnailProjection({
      width: 320,
      height: 220,
      padding: 10,
      sourceWidth: 480,
      sourceHeight: 480,
      viewBox: { x: 0, y: 0, width: 450, height: 392 },
      preserveAspectRatio: 'xMidYMid meet'
    });

    expect(projection.viewportScale).toBeCloseTo(200 / 480, 12);
    expect(projection.renderedViewport).toEqual({
      x: 60,
      y: 10,
      width: 200,
      height: 200
    });
    expect(projection.matrix.a).toBeCloseTo((200 / 480) * (480 / 450), 12);
    expect(projection.matrix.d).toBeCloseTo(projection.matrix.a, 12);
    expect(projection.matrix.e).toBeCloseTo(60, 12);
    expect(projection.matrix.f).toBeCloseTo(10 + (200 / 480) * ((480 - 392 * (480 / 450)) / 2), 12);
  });

  test('non-uniform source viewports retain preserveAspectRatio none geometry', () => {
    const projection = computeWelcomeThumbnailProjection({
      width: 320,
      height: 220,
      padding: 10,
      sourceWidth: 450,
      sourceHeight: 392,
      viewBox: { x: 10, y: 20, width: 900, height: 196 },
      preserveAspectRatio: 'none'
    });

    expect(projection.viewportScale).toBeCloseTo(200 / 392, 12);
    expect(projection.matrix.a).toBeCloseTo((200 / 392) * 0.5, 12);
    expect(projection.matrix.d).toBeCloseTo((200 / 392) * 2, 12);
    expect(projection.matrix.e).toBeCloseTo(projection.renderedViewport.x - 10 * projection.matrix.a, 12);
    expect(projection.matrix.f).toBeCloseTo(projection.renderedViewport.y - 20 * projection.matrix.d, 12);
  });
});
