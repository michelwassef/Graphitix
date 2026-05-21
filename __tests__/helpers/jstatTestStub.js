function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  const abs = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * abs);
  const poly = (((((a5 * t) + a4) * t + a3) * t + a2) * t + a1) * t;
  const y = 1 - poly * Math.exp(-abs * abs);
  return sign * y;
}

function normalCdf(x, mean = 0, sd = 1) {
  const safeSd = Math.max(Math.abs(sd), 1e-9);
  const z = (x - mean) / (safeSd * Math.SQRT2);
  return 0.5 * (1 + erf(z));
}

function normalInv(p) {
  if (!Number.isFinite(p)) {
    return NaN;
  }
  if (p <= 0) {
    return -Infinity;
  }
  if (p >= 1) {
    return Infinity;
  }
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.38357751867269e+02,
    -3.066479806614716e+01,
    2.506628277459239
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996,
    3.754408661907416
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q;
  let r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function collectValidPairs(arrA = [], arrB = []) {
  const len = Math.min(arrA.length, arrB.length);
  const pairs = [];
  for (let i = 0; i < len; i += 1) {
    const ax = Number(arrA[i]);
    const by = Number(arrB[i]);
    if (Number.isFinite(ax) && Number.isFinite(by)) {
      pairs.push([ax, by]);
    }
  }
  return pairs;
}

function rankValues(source = []) {
  const entries = [];
  const ranks = new Array(source.length).fill(NaN);
  source.forEach((value, index) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      entries.push({ value: numeric, index });
    }
  });
  entries.sort((a, b) => a.value - b.value);
  let i = 0;
  while (i < entries.length) {
    let j = i + 1;
    while (j < entries.length && entries[j].value === entries[i].value) {
      j += 1;
    }
    const rank = ((i + j - 1) / 2) + 1;
    for (let k = i; k < j; k += 1) {
      ranks[entries[k].index] = rank;
    }
    i = j;
  }
  return ranks;
}

function createJStatTestStub() {
  const stub = {
    normal: { cdf: normalCdf },
    studentt: {
      cdf: (x, df = 1) => {
        const safeDf = Math.max(df, 1);
        const scale = Math.sqrt(Math.max((safeDf - 2) / safeDf, 0.5));
        return normalCdf(x * scale, 0, 1);
      },
      inv: (p, df = 1) => {
        const safeDf = Math.max(Number(df) || 1, 1);
        const z = normalInv(p);
        if (!Number.isFinite(z)) {
          return z;
        }
        const n1 = safeDf;
        const z2 = z * z;
        const z3 = z2 * z;
        const z5 = z3 * z2;
        const z7 = z5 * z2;
        const c1 = (z3 + z) / (4 * n1);
        const c2 = (5 * z5 + 16 * z3 + 3 * z) / (96 * n1 * n1);
        const c3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * n1 * n1 * n1);
        return z + c1 + c2 + c3;
      }
    },
    centralF: { cdf: () => 0.5 },
    chisquare: { cdf: () => 0.5 },
    corrcoeff: (arrA, arrB) => {
      const pairs = collectValidPairs(arrA, arrB);
      if (pairs.length < 2) {
        return 0;
      }
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;
      let sumYY = 0;
      const n = pairs.length;
      for (let i = 0; i < n; i += 1) {
        const [x, y] = pairs[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
        sumYY += y * y;
      }
      const numerator = (n * sumXY) - (sumX * sumY);
      const denomX = (n * sumXX) - (sumX * sumX);
      const denomY = (n * sumYY) - (sumY * sumY);
      const denom = Math.sqrt(Math.max(denomX * denomY, 0));
      return denom === 0 ? 0 : (numerator / denom);
    },
    spearmancoeff: (arrA, arrB) => stub.corrcoeff(rankValues(arrA), rankValues(arrB)),
    mean: (arr) => {
      const clean = (arr || []).map(Number).filter(Number.isFinite);
      if (!clean.length) {
        return NaN;
      }
      const sum = clean.reduce((total, value) => total + value, 0);
      return sum / clean.length;
    },
    stdev: (arr, sample) => {
      const clean = (arr || []).map(Number).filter(Number.isFinite);
      if (!clean.length) {
        return 0;
      }
      const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
      const divisor = sample ? Math.max(clean.length - 1, 1) : clean.length;
      const variance = clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / divisor;
      return Math.sqrt(Math.max(variance, 0));
    },
    percentile: (arr, p) => {
      const clean = (arr || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (!clean.length) {
        return NaN;
      }
      const pos = (clean.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      return clean[base + 1] !== undefined
        ? clean[base] + rest * (clean[base + 1] - clean[base])
        : clean[base];
    }
  };
  return stub;
}

function ensureJStatStub() {
  const previousGlobal = global.jStat;
  const previousWindow = typeof window !== 'undefined' ? window.jStat : undefined;
  const existing = previousGlobal || previousWindow;
  const stub = existing || createJStatTestStub();
  global.jStat = stub;
  if (typeof window !== 'undefined') {
    window.jStat = stub;
  }
  return () => {
    if (typeof previousGlobal === 'undefined') {
      delete global.jStat;
    } else {
      global.jStat = previousGlobal;
    }
    if (typeof window !== 'undefined') {
      if (typeof previousWindow === 'undefined') {
        delete window.jStat;
      } else {
        window.jStat = previousWindow;
      }
    }
  };
}

module.exports = {
  createJStatTestStub,
  ensureJStatStub
};
