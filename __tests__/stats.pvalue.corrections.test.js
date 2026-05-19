function loadModule() {
  jest.resetModules();
  delete window.Shared;
  require('../js/shared/stats.js');
  return window.Shared.stats;
}

// Reference inputs — p = [0.01, 0.04, 0.20, 0.06], n = 4
// All expected values computed by hand against published algorithms.
const P = [0.01, 0.04, 0.20, 0.06];
const TOL = 1e-6;

function expectClose(actual, expected, label) {
  for (let i = 0; i < expected.length; i++) {
    if (Math.abs(actual[i] - expected[i]) > TOL) {
      throw new Error(
        `${label}[${i}]: actual=${actual[i]}, expected=${expected[i]}, diff=${Math.abs(actual[i] - expected[i])}`
      );
    }
  }
}

describe('stats.adjustPValues — reference-value correctness', () => {
  let stats;
  beforeEach(() => { stats = loadModule(); });

  test('none — returns clamped input values unchanged', () => {
    const adj = stats.adjustPValues([0.01, 0.04, 0.20, 0.06], { method: 'none' });
    expect(adj).toEqual([0.01, 0.04, 0.20, 0.06]);
  });

  test('bonferroni — multiplies each by n', () => {
    // adj[i] = min(1, p[i] * 4)
    const adj = stats.adjustPValues(P, { method: 'bonferroni' });
    expectClose(adj, [0.04, 0.16, 0.80, 0.24], 'bonferroni');
  });

  test('sidak — 1 - (1-p)^n', () => {
    // adj[i] = 1 - (1-p[i])^4
    const expected = [
      1 - Math.pow(0.99, 4),  // ≈ 0.039403...
      1 - Math.pow(0.96, 4),  // ≈ 0.150649...
      1 - Math.pow(0.80, 4),  // ≈ 0.590400
      1 - Math.pow(0.94, 4),  // ≈ 0.219250...
    ];
    const adj = stats.adjustPValues(P, { method: 'sidak' });
    expectClose(adj, expected, 'sidak');
  });

  test('holm — step-down Bonferroni with monotonicity constraint', () => {
    // Sorted asc: (0.01,i=0),(0.04,i=1),(0.06,i=3),(0.20,i=2)
    // Ranks: 4, 3, 2, 1 (m - sorted_idx)
    // raw: 0.04, 0.12, 0.12, 0.20; cummax: 0.04, 0.12, 0.12, 0.20
    const adj = stats.adjustPValues(P, { method: 'holm' });
    expectClose(adj, [0.04, 0.12, 0.20, 0.12], 'holm');
  });

  test('hochberg — step-up with rank × p, cummin enforced', () => {
    // Sorted desc: (0.20,i=2),(0.06,i=3),(0.04,i=1),(0.01,i=0)
    // raw: 0.20×1=0.20, 0.06×2=0.12, 0.04×3=0.12, 0.01×4=0.04; cummin
    const adj = stats.adjustPValues(P, { method: 'hochberg' });
    expectClose(adj, [0.04, 0.12, 0.20, 0.12], 'hochberg');
  });

  test('bh — Benjamini-Hochberg FDR', () => {
    // Sorted asc: (0.01,i=0),(0.04,i=1),(0.06,i=3),(0.20,i=2)
    // p*m/rank from highest to lowest rank, cummin:
    // rank 4: 0.20*4/4=0.20; rank 3: 0.06*4/3≈0.08; rank 2: 0.04*4/2=0.08; rank 1: 0.01*4/1=0.04
    const adj = stats.adjustPValues(P, { method: 'bh' });
    expectClose(adj, [0.04, 0.08, 0.20, 0.08], 'bh');
  });

  test('by — Benjamini-Yekutieli (bh × harmonic factor)', () => {
    const H = 1 + 1/2 + 1/3 + 1/4; // harmonic(4) = 25/12
    const expected = [
      0.01 * 4 * H / 1,  // rank 1; clamped by running min
      0.04 * 4 * H / 2,  // rank 2; same as running
      0.20 * 4 * H / 4,  // rank 4; first from top = 0.20*H*1
      0.06 * 4 * H / 3,  // rank 3
    ];
    // After cummin from top: rank4=0.20*H, rank3=0.06*4*H/3, rank2=0.04*4*H/2, rank1=0.01*4*H
    // All clamped to 1 if > 1
    const raw4 = Math.min(1, 0.20 * 4 * H / 4);
    const raw3 = Math.min(1, Math.min(raw4, 0.06 * 4 * H / 3));
    const raw2 = Math.min(1, Math.min(raw3, 0.04 * 4 * H / 2));
    const raw1 = Math.min(1, Math.min(raw2, 0.01 * 4 * H / 1));
    const adj = stats.adjustPValues(P, { method: 'by' });
    expectClose(adj, [raw1, raw2, raw4, raw3], 'by');
  });

  test('all methods produce values in [0, 1]', () => {
    ['none', 'bonferroni', 'sidak', 'holm', 'holm-sidak', 'hochberg', 'bh', 'by'].forEach(method => {
      const adj = stats.adjustPValues(P, { method });
      adj.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    });
  });

  test('all methods are monotone — adjusted ≥ original', () => {
    // Adjusted p-values should be ≥ the original in all correction methods
    ['bonferroni', 'sidak', 'holm', 'holm-sidak', 'hochberg', 'bh', 'by'].forEach(method => {
      const adj = stats.adjustPValues(P, { method });
      P.forEach((p, i) => {
        expect(adj[i]).toBeGreaterThanOrEqual(p - TOL);
      });
    });
  });

  test('single p-value — bonferroni equals input', () => {
    const adj = stats.adjustPValues([0.05], { method: 'bonferroni' });
    expect(adj).toHaveLength(1);
    expect(Math.abs(adj[0] - 0.05)).toBeLessThan(TOL);
  });

  test('p=0 stays 0 for bonferroni; p=1 stays 1', () => {
    const adj0 = stats.adjustPValues([0, 0.5, 0], { method: 'bonferroni' });
    const adj1 = stats.adjustPValues([1, 0.5, 1], { method: 'bonferroni' });
    expect(adj0[0]).toBe(0);
    expect(adj1[0]).toBe(1);
  });

  test('non-finite/out-of-range values are sanitized', () => {
    // sanitizeP: non-finite (incl. Infinity) or < 0 → 0; > 1 → 1
    // Note: Infinity is non-finite, so it maps to 0, not 1
    const adj = stats.adjustPValues([NaN, Infinity, -0.1, 0.05, 1.5], { method: 'none' });
    expect(adj[0]).toBe(0);  // NaN → non-finite → 0
    expect(adj[1]).toBe(0);  // Infinity → non-finite → 0
    expect(adj[2]).toBe(0);  // -0.1 < 0 → 0
    expect(Math.abs(adj[3] - 0.05)).toBeLessThan(TOL); // valid → preserved
    expect(adj[4]).toBe(1);  // 1.5 > 1 → clamped to 1
  });

  test('unknown method falls back to bonferroni', () => {
    const adj = stats.adjustPValues(P, { method: 'unknown-method' });
    const expected = stats.adjustPValues(P, { method: 'bonferroni' });
    expectClose(adj, expected, 'fallback-method');
  });

  test('empty array returns empty array', () => {
    expect(stats.adjustPValues([], { method: 'bonferroni' })).toEqual([]);
  });
});

describe('stats.adjustPValues — holm-sidak reference values', () => {
  let stats;
  beforeEach(() => { stats = loadModule(); });

  test('holm-sidak uses 1-(1-p)^rank with step-down cummax', () => {
    // Sorted asc: (0.01,i=0),(0.04,i=1),(0.06,i=3),(0.20,i=2)
    // rank from top (m-idx): 4, 3, 2, 1
    // raw: 1-(0.99)^4, 1-(0.96)^3, 1-(0.94)^2, 1-(0.80)^1
    const r1 = 1 - Math.pow(0.99, 4);
    const r2 = 1 - Math.pow(0.96, 3);
    const r3 = 1 - Math.pow(0.94, 2);
    const r4 = 1 - Math.pow(0.80, 1);
    // cummax: r1, max(r1,r2), max(max(r1,r2),r3), max(...,r4)
    const c1 = r1;
    const c2 = Math.max(c1, r2);
    const c3 = Math.max(c2, r3);
    const c4 = Math.max(c3, r4);
    // Assign back: i=0→c1, i=1→c2, i=3→c3, i=2→c4
    const adj = stats.adjustPValues(P, { method: 'holm-sidak' });
    expectClose(adj, [c1, c2, c4, c3], 'holm-sidak');
  });
});
