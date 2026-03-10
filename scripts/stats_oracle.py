#!/usr/bin/env python3
"""Independent statistical oracle used by Jest differential tests.

Input (stdin):
{
  "cases": [
    { "id": "case-1", "operation": "...", "payload": { ... } }
  ]
}

Output (stdout):
{
  "ok": true,
  "results": [
    { "id": "case-1", "ok": true, "result": { ... } }
  ]
}
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any, Callable, Dict, List, Tuple

import numpy as np
from scipy import stats


EPSILON = 1e-12


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def _clamp_unit(value: float) -> float:
    if not math.isfinite(value):
        return 1.0
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return float(value)


def _resolve_alternative(raw: Any) -> str:
    alt = str(raw or "two-sided").strip().lower()
    if alt in {"two-sided", "greater", "less"}:
        return alt
    return "two-sided"


def _p_from_t_stat(t_value: float, df: float, alternative: str) -> float:
    if not math.isfinite(df) or df <= 0:
        return float("nan")
    if not math.isfinite(t_value):
        if t_value > 0:
            if alternative == "less":
                return 1.0
            return 0.0
        if t_value < 0:
            if alternative == "greater":
                return 1.0
            return 0.0
        return 1.0
    cdf = float(stats.t.cdf(t_value, df))
    if alternative == "greater":
        return _clamp_unit(1 - cdf)
    if alternative == "less":
        return _clamp_unit(cdf)
    return _clamp_unit(2 * min(cdf, 1 - cdf))


def _sanitize_p_values(values: List[Any]) -> List[float]:
    sanitized: List[float] = []
    for raw in values:
        numeric = float(raw) if _is_finite_number(raw) else 0.0
        sanitized.append(_clamp_unit(numeric))
    return sanitized


def _inverse_permutation(order: List[int]) -> List[int]:
    inv = [0] * len(order)
    for sorted_idx, original_idx in enumerate(order):
        inv[original_idx] = sorted_idx
    return inv


def adjust_p_values(method: str, values: List[Any]) -> List[float]:
    p = _sanitize_p_values(values)
    m = len(p)
    if m == 0:
        return []
    key = str(method or "").strip().lower()
    if key == "none":
        return p
    if key == "bonferroni":
        return [_clamp_unit(v * m) for v in p]
    if key == "sidak":
        return [_clamp_unit(1 - ((1 - v) ** m)) for v in p]

    order = sorted(range(m), key=lambda idx: p[idx])
    sorted_p = [p[idx] for idx in order]
    adjusted_sorted = [0.0] * m

    if key == "holm":
        running = 0.0
        for i, p_i in enumerate(sorted_p):
            raw = (m - i) * p_i
            running = max(running, raw)
            adjusted_sorted[i] = _clamp_unit(running)
    elif key == "holm-sidak":
        running = 0.0
        for i, p_i in enumerate(sorted_p):
            raw = 1 - ((1 - p_i) ** (m - i))
            running = max(running, raw)
            adjusted_sorted[i] = _clamp_unit(running)
    elif key == "hochberg":
        running = 1.0
        for i in range(m - 1, -1, -1):
            raw = (m - i) * sorted_p[i]
            running = min(running, raw)
            adjusted_sorted[i] = _clamp_unit(running)
    elif key == "bh":
        running = 1.0
        for i in range(m - 1, -1, -1):
            raw = (sorted_p[i] * m) / (i + 1)
            running = min(running, raw)
            adjusted_sorted[i] = _clamp_unit(running)
    elif key == "by":
        harmonic = sum(1.0 / (j + 1) for j in range(m))
        running = 1.0
        for i in range(m - 1, -1, -1):
            raw = (sorted_p[i] * m * harmonic) / (i + 1)
            running = min(running, raw)
            adjusted_sorted[i] = _clamp_unit(running)
    else:
        raise ValueError(f"Unsupported correction method: {method!r}")

    inv = _inverse_permutation(order)
    return [adjusted_sorted[inv_idx] for inv_idx in inv]


def _fit_normal(values: List[Any]) -> Dict[str, Any]:
    numeric = [float(v) for v in values if _is_finite_number(v)]
    count = len(numeric)
    if count < 2:
        return {"valid": False, "params": None, "usedCount": count}
    arr = np.asarray(numeric, dtype=float)
    mu = float(np.mean(arr))
    variance = float(np.mean((arr - mu) ** 2))
    sigma = float(math.sqrt(max(variance, 0.0)))
    return {
        "valid": sigma > 0,
        "usedCount": count,
        "params": {"mu": mu, "sigma": sigma, "variance": variance},
    }


def _fit_lognormal(values: List[Any]) -> Dict[str, Any]:
    numeric = [float(v) for v in values if _is_finite_number(v) and float(v) > 0]
    count = len(numeric)
    if count < 2:
        return {"valid": False, "params": None, "usedCount": count}
    logs = np.log(np.asarray(numeric, dtype=float))
    mu = float(np.mean(logs))
    variance_log = float(np.mean((logs - mu) ** 2))
    sigma = float(math.sqrt(max(variance_log, 0.0)))
    return {
        "valid": sigma > 0,
        "usedCount": count,
        "params": {
            "mu": mu,
            "sigma": sigma,
            "mean": float(math.exp(mu + variance_log / 2)),
            "median": float(math.exp(mu)),
        },
    }


def _fit_exponential(values: List[Any]) -> Dict[str, Any]:
    numeric = [float(v) for v in values if _is_finite_number(v) and float(v) >= 0]
    count = len(numeric)
    if count == 0:
        return {"valid": False, "params": None, "usedCount": 0}
    arr = np.asarray(numeric, dtype=float)
    mean = float(np.mean(arr))
    lamb = float(1.0 / mean) if mean > 0 else 0.0
    return {
        "valid": lamb > 0,
        "usedCount": count,
        "params": {"lambda": lamb, "mean": mean},
    }


def fit_distribution(distribution: str, values: List[Any]) -> Dict[str, Any]:
    key = str(distribution or "").strip().lower()
    if key == "normal":
        return _fit_normal(values)
    if key == "lognormal":
        return _fit_lognormal(values)
    if key == "exponential":
        return _fit_exponential(values)
    raise ValueError(f"Unsupported distribution: {distribution!r}")


def _make_cdf(distribution: str, params: Dict[str, Any]) -> Callable[[float], float]:
    key = str(distribution or "").strip().lower()
    if key == "normal":
        mu = float(params.get("mu"))
        sigma = float(params.get("sigma"))
        return lambda x: float(stats.norm.cdf((x - mu) / sigma)) if sigma > 0 else (0.0 if x < mu else 1.0)
    if key == "lognormal":
        mu = float(params.get("mu"))
        sigma = float(params.get("sigma"))

        def _lognorm_cdf(x: float) -> float:
            if x <= 0:
                return 0.0
            if sigma <= 0:
                median = math.exp(mu)
                return 0.0 if x < median else 1.0
            return float(stats.norm.cdf((math.log(x) - mu) / sigma))

        return _lognorm_cdf
    if key == "exponential":
        lamb = float(params.get("lambda"))

        def _exp_cdf(x: float) -> float:
            if x < 0:
                return 0.0
            if lamb <= 0:
                return 1.0
            return float(1.0 - math.exp(-lamb * x))

        return _exp_cdf
    raise ValueError(f"Unsupported distribution for cdf: {distribution!r}")


def _ks_statistic(sorted_values: List[float], cdf: Callable[[float], float]) -> float:
    n = len(sorted_values)
    if n == 0:
        return 0.0
    max_diff = 0.0
    for i, value in enumerate(sorted_values):
        cdf_value = _clamp_unit(float(cdf(value)))
        upper = (i + 1) / n
        lower = i / n
        diff = max(abs(cdf_value - upper), abs(cdf_value - lower))
        if diff > max_diff:
            max_diff = diff
    return max_diff


def _ad_statistic(sorted_values: List[float], cdf: Callable[[float], float]) -> float:
    n = len(sorted_values)
    if n == 0:
        return 0.0
    total = 0.0
    for i in range(n):
        lower = sorted_values[i]
        upper = sorted_values[n - 1 - i]
        f_i = min(max(_clamp_unit(float(cdf(lower))), EPSILON), 1 - EPSILON)
        f_j = min(max(1.0 - _clamp_unit(float(cdf(upper))), EPSILON), 1 - EPSILON)
        total += (2 * (i + 1) - 1) * (math.log(f_i) + math.log(f_j))
    return float(-n - (total / n))


def goodness_of_fit(distribution: str, values: List[Any], params: Dict[str, Any]) -> Dict[str, Any]:
    numeric = [float(v) for v in values if _is_finite_number(v)]
    if not numeric:
        return {"valid": False, "n": 0}
    sorted_values = sorted(numeric)
    cdf = _make_cdf(distribution, params)
    ks_stat = _ks_statistic(sorted_values, cdf)
    ad_stat = _ad_statistic(sorted_values, cdf)
    n = len(sorted_values)
    ks_exact_p = float(stats.kstwo.sf(ks_stat, n))
    return {
        "valid": True,
        "n": n,
        "ksStatistic": ks_stat,
        "adStatistic": ad_stat,
        "ksExactPValue": _clamp_unit(ks_exact_p),
    }


def _prepare_xy(payload: Dict[str, Any]) -> Tuple[np.ndarray, np.ndarray]:
    x_values = payload.get("x") or []
    y_values = payload.get("y") or []
    length = min(len(x_values), len(y_values))
    pairs: List[Tuple[float, float]] = []
    for idx in range(length):
        x_raw = x_values[idx]
        y_raw = y_values[idx]
        if _is_finite_number(x_raw) and _is_finite_number(y_raw):
            pairs.append((float(x_raw), float(y_raw)))
    if not pairs:
        return np.asarray([], dtype=float), np.asarray([], dtype=float)
    x = np.asarray([pair[0] for pair in pairs], dtype=float)
    y = np.asarray([pair[1] for pair in pairs], dtype=float)
    return x, y


def _regression_core(
    x: np.ndarray,
    y: np.ndarray,
    design: np.ndarray,
    alpha: float,
    term_labels: List[str],
) -> Dict[str, Any]:
    n = int(x.size)
    p = int(design.shape[1])
    if n < p:
        return {"valid": False, "message": "Insufficient data for selected model."}
    beta, _, _, _ = np.linalg.lstsq(design, y, rcond=None)
    predictions = design @ beta
    residuals = y - predictions
    y_mean = float(np.mean(y))
    sst = float(np.sum((y - y_mean) ** 2))
    sse = float(np.sum(residuals ** 2))
    r2 = 1.0 if sst == 0 else float(1 - (sse / sst))
    if n > p:
        adj_r2 = float(1 - (1 - r2) * ((n - 1) / (n - p)))
    else:
        adj_r2 = r2
    rmse = float(math.sqrt(sse / n)) if n > 0 else float("nan")
    mae = float(np.mean(np.abs(residuals))) if n > 0 else float("nan")
    dof = n - p

    cov = None
    coef_stats: Dict[str, Dict[str, Any]] = {}
    if dof > 0:
        sigma2 = sse / dof
        xtx_inv = np.linalg.pinv(design.T @ design)
        cov = xtx_inv * sigma2
        se = np.sqrt(np.maximum(np.diag(cov), 0.0))
        t_crit = float(stats.t.ppf(1 - alpha / 2, dof))
        for idx, label in enumerate(term_labels):
            estimate = float(beta[idx])
            se_val = float(se[idx]) if idx < se.size else float("nan")
            t_stat = estimate / se_val if math.isfinite(se_val) and se_val != 0 else float("nan")
            p_value = (
                float(2 * (1 - stats.t.cdf(abs(t_stat), dof)))
                if math.isfinite(t_stat)
                else float("nan")
            )
            ci_half = t_crit * se_val if math.isfinite(t_crit) and math.isfinite(se_val) else float("nan")
            coef_stats[label] = {
                "estimate": estimate,
                "standardError": se_val,
                "tStatistic": t_stat,
                "pValue": p_value,
                "ciLow": estimate - ci_half if math.isfinite(ci_half) else float("nan"),
                "ciHigh": estimate + ci_half if math.isfinite(ci_half) else float("nan"),
            }

    return {
        "valid": True,
        "sampleSize": n,
        "predictors": p - 1 if p > 0 else 0,
        "coefficients": [float(val) for val in beta.tolist()],
        "metrics": {
            "sse": sse,
            "sst": sst,
            "r2": r2,
            "adjR2": adj_r2,
            "rmse": rmse,
            "mae": mae,
        },
        "coefficientStats": coef_stats,
        "coefficientCovariance": cov.tolist() if cov is not None else None,
    }


def regression_linear(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    if x.size < 2:
        return {"valid": False, "message": "Insufficient data for linear regression."}
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    design = np.column_stack([np.ones_like(x), x])
    result = _regression_core(x, y, design, alpha, ["Intercept", "Slope"])
    if not result.get("valid"):
        return result
    coeffs = result["coefficients"]
    result["summary"] = {"intercept": coeffs[0], "slope": coeffs[1]}
    return result


def regression_linear_through_origin(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    if x.size < 2:
        return {"valid": False, "message": "Insufficient data for through-origin regression."}
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    design = x.reshape(-1, 1)
    result = _regression_core(x, y, design, alpha, ["Slope"])
    if not result.get("valid"):
        return result
    slope = result["coefficients"][0]
    result["summary"] = {"intercept": 0.0, "slope": slope}
    return result


def regression_polynomial(payload: Dict[str, Any]) -> Dict[str, Any]:
    degree_raw = payload.get("degree")
    degree = int(degree_raw) if _is_finite_number(degree_raw) else 2
    degree = max(1, min(5, degree))
    x, y = _prepare_xy(payload)
    if x.size < degree + 1:
        return {"valid": False, "message": "Insufficient data for polynomial regression."}
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    columns = [np.power(x, power) for power in range(degree + 1)]
    design = np.column_stack(columns)
    labels = ["Intercept"] + [f"x^{idx}" for idx in range(1, degree + 1)]
    result = _regression_core(x, y, design, alpha, labels)
    if not result.get("valid"):
        return result
    coeffs = result["coefficients"]
    result["summary"] = {
        "intercept": coeffs[0] if coeffs else float("nan"),
        "slope": coeffs[1] if len(coeffs) > 1 else float("nan"),
    }
    result["degree"] = degree
    return result


def hypergeometric_right_tail(payload: Dict[str, Any]) -> Dict[str, Any]:
    population_size = int(payload.get("populationSize") or 0)
    success_population = int(payload.get("successPopulation") or 0)
    draws = int(payload.get("draws") or 0)
    observed = int(payload.get("observedSuccesses") or 0)
    if population_size <= 0 or draws <= 0:
        return {"pValue": 0.0}
    p_value = float(
        stats.hypergeom.sf(
            observed - 1,
            population_size,
            success_population,
            draws,
        )
    )
    return {"pValue": _clamp_unit(p_value)}


def _clean_vector(values: Any) -> List[float]:
    return [float(v) for v in (values or []) if _is_finite_number(v)]


def _clean_paired_vectors(a_values: Any, b_values: Any) -> Tuple[List[float], List[float]]:
    a_raw = a_values or []
    b_raw = b_values or []
    n = min(len(a_raw), len(b_raw))
    a: List[float] = []
    b: List[float] = []
    for idx in range(n):
        a_val = a_raw[idx]
        b_val = b_raw[idx]
        if _is_finite_number(a_val) and _is_finite_number(b_val):
            a.append(float(a_val))
            b.append(float(b_val))
    return a, b


def box_ttest_welch(payload: Dict[str, Any]) -> Dict[str, Any]:
    a = _clean_vector(payload.get("a"))
    b = _clean_vector(payload.get("b"))
    if len(a) < 2 or len(b) < 2:
        return {"available": False, "message": "Need at least two observations per group."}
    alternative = _resolve_alternative(payload.get("alternative"))
    na = len(a)
    nb = len(b)
    ma = float(np.mean(a))
    mb = float(np.mean(b))
    va = float(np.var(a, ddof=1))
    vb = float(np.var(b, ddof=1))
    se = math.sqrt((va / na) + (vb / nb))
    diff = ma - mb
    if se == 0:
        if diff == 0:
            t_stat = 0.0
            p_value = 1.0
        else:
            t_stat = float("inf") if diff > 0 else float("-inf")
            p_value = _p_from_t_stat(t_stat, na + nb - 2, alternative)
        df = float(na + nb - 2)
    else:
        t_stat = diff / se
        df = ((va / na + vb / nb) ** 2) / (((va / na) ** 2) / (na - 1) + ((vb / nb) ** 2) / (nb - 1))
        p_value = _p_from_t_stat(t_stat, df, alternative)
    return {"available": True, "t": t_stat, "df": df, "p": p_value, "se": se, "diff": diff, "meanA": ma, "meanB": mb}


def box_ttest_paired(payload: Dict[str, Any]) -> Dict[str, Any]:
    a, b = _clean_paired_vectors(payload.get("a"), payload.get("b"))
    if len(a) < 2:
        return {"available": False, "message": "Need at least two paired values."}
    alternative = _resolve_alternative(payload.get("alternative"))
    diffs = np.asarray([x - y for x, y in zip(a, b)], dtype=float)
    n = int(diffs.size)
    mean_diff = float(np.mean(diffs))
    sd = float(np.std(diffs, ddof=1))
    se = sd / math.sqrt(n)
    if se == 0:
        if mean_diff == 0:
            t_stat = 0.0
            p_value = 1.0
        else:
            t_stat = float("inf") if mean_diff > 0 else float("-inf")
            p_value = _p_from_t_stat(t_stat, n - 1, alternative)
    else:
        t_stat = mean_diff / se
        p_value = _p_from_t_stat(t_stat, n - 1, alternative)
    return {"available": True, "t": t_stat, "df": float(n - 1), "p": p_value, "diff": mean_diff, "se": se}


def box_ttest_one_sample(payload: Dict[str, Any]) -> Dict[str, Any]:
    values = _clean_vector(payload.get("values"))
    null_value = float(payload.get("nullValue")) if _is_finite_number(payload.get("nullValue")) else 0.0
    if len(values) < 2:
        return {"available": False, "message": "Need at least two observations."}
    alternative = _resolve_alternative(payload.get("alternative"))
    arr = np.asarray(values, dtype=float)
    n = int(arr.size)
    mean_val = float(np.mean(arr))
    sd = float(np.std(arr, ddof=1))
    diff = mean_val - null_value
    se = sd / math.sqrt(n)
    if se == 0:
        if diff == 0:
            t_stat = 0.0
            p_value = 1.0
        else:
            t_stat = float("inf") if diff > 0 else float("-inf")
            p_value = _p_from_t_stat(t_stat, n - 1, alternative)
    else:
        t_stat = diff / se
        p_value = _p_from_t_stat(t_stat, n - 1, alternative)
    return {"available": True, "t": t_stat, "df": float(n - 1), "p": p_value, "diff": diff, "se": se, "mean": mean_val, "sd": sd}


def box_mann_whitney(payload: Dict[str, Any]) -> Dict[str, Any]:
    a = _clean_vector(payload.get("a"))
    b = _clean_vector(payload.get("b"))
    if not a or not b:
        return {"available": False, "message": "Need at least one observation per group."}
    alternative = _resolve_alternative(payload.get("alternative"))
    result = stats.mannwhitneyu(a, b, alternative=alternative, method="asymptotic", use_continuity=True)
    u1 = float(result.statistic)
    u2 = float(len(a) * len(b) - u1)
    return {"available": True, "U1": u1, "U2": u2, "U": min(u1, u2), "p": float(result.pvalue)}


def box_wilcoxon_signed_rank(payload: Dict[str, Any]) -> Dict[str, Any]:
    a, b = _clean_paired_vectors(payload.get("a"), payload.get("b"))
    if not a:
        return {"available": False, "message": "Need at least one paired value."}
    alternative = _resolve_alternative(payload.get("alternative"))
    diffs = np.asarray([x - y for x, y in zip(a, b)], dtype=float)
    if np.allclose(diffs, 0):
        return {"available": True, "W": 0.0, "p": 1.0}
    resampling_mode = str(payload.get("resamplingMode") or "auto").strip().lower()
    method = "approx" if resampling_mode == "asymptotic" else "auto"
    try:
        result = stats.wilcoxon(diffs, zero_method="wilcox", correction=True, alternative=alternative, method=method)
    except TypeError:
        result = stats.wilcoxon(diffs, zero_method="wilcox", correction=True, alternative=alternative, mode=method)
    return {"available": True, "W": float(result.statistic), "p": float(result.pvalue)}


def box_wilcoxon_one_sample(payload: Dict[str, Any]) -> Dict[str, Any]:
    values = _clean_vector(payload.get("values"))
    null_value = float(payload.get("nullValue")) if _is_finite_number(payload.get("nullValue")) else 0.0
    if not values:
        return {"available": False, "message": "Need at least one observation."}
    alternative = _resolve_alternative(payload.get("alternative"))
    diffs = np.asarray([value - null_value for value in values], dtype=float)
    non_zero = diffs[np.abs(diffs) > 0]
    if non_zero.size == 0:
        return {"available": True, "W": 0.0, "p": 1.0}
    resampling_mode = str(payload.get("resamplingMode") or "auto").strip().lower()
    method = "approx" if resampling_mode == "asymptotic" else "auto"
    try:
        result = stats.wilcoxon(non_zero, zero_method="wilcox", correction=True, alternative=alternative, method=method)
    except TypeError:
        result = stats.wilcoxon(non_zero, zero_method="wilcox", correction=True, alternative=alternative, mode=method)
    return {"available": True, "W": float(result.statistic), "p": float(result.pvalue)}


def box_anova(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    groups = [group for group in groups if len(group) > 0]
    if len(groups) < 2:
        return {"available": False, "message": "Need at least two groups."}
    result = stats.f_oneway(*groups)
    n = sum(len(group) for group in groups)
    return {
        "available": True,
        "F": float(result.statistic),
        "p": float(result.pvalue),
        "dfBetween": len(groups) - 1,
        "dfWithin": n - len(groups),
    }


def box_kruskal(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    groups = [group for group in groups if len(group) > 0]
    if len(groups) < 2:
        return {"available": False, "message": "Need at least two groups."}
    result = stats.kruskal(*groups)
    return {"available": True, "H": float(result.statistic), "p": float(result.pvalue), "df": len(groups) - 1}


def box_friedman(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    if len(groups) < 3:
        return {"available": False, "message": "Need at least three groups."}
    size = len(groups[0])
    if size < 2 or any(len(group) != size for group in groups):
        return {"available": False, "message": "Friedman requires equal paired group sizes >= 2."}
    result = stats.friedmanchisquare(*groups)
    return {"available": True, "Q": float(result.statistic), "p": float(result.pvalue), "df": len(groups) - 1}


def box_repeated_measures_anova(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    if len(groups) < 3:
        return {"available": False, "message": "Need at least three groups."}
    n = len(groups[0])
    k = len(groups)
    if n < 2 or any(len(group) != n for group in groups):
        return {"available": False, "message": "Repeated-measures ANOVA requires equal paired group sizes >= 2."}
    matrix = np.asarray(groups, dtype=float)
    grand_mean = float(np.mean(matrix))
    condition_means = np.mean(matrix, axis=1)
    subject_means = np.mean(matrix, axis=0)
    ss_total = float(np.sum((matrix - grand_mean) ** 2))
    ss_condition = float(sum(n * (m - grand_mean) ** 2 for m in condition_means))
    ss_subject = float(sum(k * (m - grand_mean) ** 2 for m in subject_means))
    ss_error = ss_total - ss_condition - ss_subject
    if abs(ss_error) < 1e-12:
        ss_error = 0.0
    df1 = k - 1
    df2 = (k - 1) * (n - 1)
    if df1 <= 0 or df2 <= 0:
        return {"available": False, "message": "Invalid repeated-measures degrees of freedom."}
    ms_condition = ss_condition / df1
    ms_error = ss_error / df2
    if ms_error == 0:
        f_stat = float("inf") if ms_condition > 0 else 0.0
        p_value = 0.0 if ms_condition > 0 else 1.0
    else:
        f_stat = ms_condition / ms_error
        p_value = float(1 - stats.f.cdf(f_stat, df1, df2))
    return {"available": True, "F": f_stat, "p": p_value, "df1": df1, "df2": df2}


def pie_chi_square(payload: Dict[str, Any]) -> Dict[str, Any]:
    observed = _clean_vector(payload.get("observed"))
    expected = _clean_vector(payload.get("expected"))
    if not observed or len(observed) != len(expected) or any(exp <= 0 for exp in expected):
        return {"available": False, "message": "Observed and expected must be same length, with expected > 0."}
    result = stats.chisquare(f_obs=observed, f_exp=expected)
    return {"available": True, "chi2": float(result.statistic), "p": float(result.pvalue), "df": len(observed) - 1}


def _prepare_pairs(raw_pairs: Any) -> List[Dict[str, float]]:
    pairs: List[Dict[str, float]] = []
    for entry in raw_pairs or []:
        if not isinstance(entry, dict):
            continue
        label = entry.get("label")
        score = entry.get("score")
        if label in (0, 1) and _is_finite_number(score):
            pairs.append({"label": int(label), "score": float(score)})
    return pairs


def _rankdata_average(values: List[float]) -> np.ndarray:
    n = len(values)
    order = sorted(range(n), key=lambda idx: values[idx])
    ranks = np.zeros(n, dtype=float)
    i = 0
    while i < n:
        j = i + 1
        while j < n and values[order[j]] == values[order[i]]:
            j += 1
        avg_rank = ((i + 1) + j) / 2.0
        for k in range(i, j):
            ranks[order[k]] = avg_rank
        i = j
    return ranks


def _roc_auc_score_binary(y_true: List[int], y_score: List[float]) -> float:
    positives = sum(1 for y in y_true if y == 1)
    negatives = sum(1 for y in y_true if y == 0)
    if positives <= 0 or negatives <= 0:
        return float("nan")
    ranks = _rankdata_average(y_score)
    rank_sum_pos = float(sum(ranks[idx] for idx, y in enumerate(y_true) if y == 1))
    return (rank_sum_pos - (positives * (positives + 1) / 2.0)) / (positives * negatives)


def _average_precision_binary(y_true: List[int], y_score: List[float]) -> float:
    positives = sum(1 for y in y_true if y == 1)
    if positives <= 0:
        return float("nan")
    order = sorted(range(len(y_true)), key=lambda idx: (-y_score[idx], idx))
    tp = 0.0
    fp = 0.0
    prev_recall = 0.0
    ap = 0.0
    for pos, idx in enumerate(order):
        if y_true[idx] == 1:
            tp += 1.0
        else:
            fp += 1.0
        is_last = pos == (len(order) - 1)
        next_score = y_score[order[pos + 1]] if not is_last else None
        if is_last or y_score[idx] != next_score:
            recall = tp / positives
            precision = tp / max(tp + fp, 1.0)
            ap += (recall - prev_recall) * precision
            prev_recall = recall
    return float(ap)


def roc_curve_metric(payload: Dict[str, Any]) -> Dict[str, Any]:
    pairs = _prepare_pairs(payload.get("pairs"))
    if not pairs:
        return {"available": False, "message": "No valid pairs supplied."}
    y_true = [pair["label"] for pair in pairs]
    y_score = [pair["score"] for pair in pairs]
    if len(set(y_true)) < 2:
        return {"available": False, "message": "Need both classes for ROC/PR metric."}
    graph_type = str(payload.get("graphType") or "roc").strip().lower()
    if graph_type == "roc":
        metric = _roc_auc_score_binary(y_true, y_score)
    else:
        metric = _average_precision_binary(y_true, y_score)
    return {"available": True, "metric": metric}


def _calc_delong_v(pos: List[float], neg: List[float]) -> Tuple[np.ndarray, np.ndarray, float]:
    pos_arr = np.asarray(pos, dtype=float)
    neg_arr = np.asarray(neg, dtype=float)
    v10 = []
    for ps in pos_arr:
        gt = np.sum(ps > neg_arr)
        eq = np.sum(ps == neg_arr)
        v10.append((gt + 0.5 * eq) / max(len(neg_arr), 1))
    v01 = []
    for ns in neg_arr:
        gt = np.sum(pos_arr > ns)
        eq = np.sum(pos_arr == ns)
        v01.append((gt + 0.5 * eq) / max(len(pos_arr), 1))
    v10_arr = np.asarray(v10, dtype=float)
    v01_arr = np.asarray(v01, dtype=float)
    auc = float(np.mean(v10_arr)) if v10_arr.size else float("nan")
    return v10_arr, v01_arr, auc


def _covariance(a: np.ndarray, b: np.ndarray) -> float:
    if a.size <= 1 or b.size <= 1:
        return 0.0
    return float(np.cov(a, b, ddof=1)[0, 1])


def roc_delong_diff(payload: Dict[str, Any]) -> Dict[str, Any]:
    pairs1 = _prepare_pairs(payload.get("pairs1"))
    pairs2 = _prepare_pairs(payload.get("pairs2"))
    if not pairs1 or not pairs2 or len(pairs1) != len(pairs2):
        return {"available": False, "message": "pairs1 and pairs2 must be non-empty with equal length."}
    pos1 = [pair["score"] for pair in pairs1 if pair["label"] == 1]
    neg1 = [pair["score"] for pair in pairs1 if pair["label"] == 0]
    pos2 = [pair["score"] for pair in pairs2 if pair["label"] == 1]
    neg2 = [pair["score"] for pair in pairs2 if pair["label"] == 0]
    if len(pos1) < 2 or len(neg1) < 2 or len(pos2) < 2 or len(neg2) < 2:
        return {"available": False, "message": "Need >=2 positives and >=2 negatives per curve."}
    if len(pos1) != len(pos2) or len(neg1) != len(neg2):
        return {"available": False, "message": "Curves must share class counts for paired DeLong."}

    v10_1, v01_1, auc1 = _calc_delong_v(pos1, neg1)
    v10_2, v01_2, auc2 = _calc_delong_v(pos2, neg2)
    m = len(pos1)
    n = len(neg1)

    s10 = np.array(
        [
            [_covariance(v10_1, v10_1), _covariance(v10_1, v10_2)],
            [_covariance(v10_2, v10_1), _covariance(v10_2, v10_2)],
        ],
        dtype=float,
    )
    s01 = np.array(
        [
            [_covariance(v01_1, v01_1), _covariance(v01_1, v01_2)],
            [_covariance(v01_2, v01_1), _covariance(v01_2, v01_2)],
        ],
        dtype=float,
    )

    var1 = (s10[0, 0] / m) + (s01[0, 0] / n)
    var2 = (s10[1, 1] / m) + (s01[1, 1] / n)
    covar = (s10[0, 1] / m) + (s01[0, 1] / n)
    diff = auc1 - auc2
    var_diff = var1 + var2 - 2 * covar
    if var_diff <= 0:
        return {"available": True, "diff": diff, "p": 1.0, "ci": [diff, diff]}
    sd = math.sqrt(var_diff)
    z = diff / sd
    p_value = float(2 * (1 - stats.norm.cdf(abs(z))))
    ci = [diff - 1.96 * sd, diff + 1.96 * sd]
    return {"available": True, "diff": diff, "p": p_value, "ci": ci}


def correlation(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    if x.size < 3:
        return {"available": False, "message": "Need at least three paired observations."}
    method = str(payload.get("method") or "pearson").strip().lower()
    if method == "spearman":
        stat = stats.spearmanr(x, y)
        return {"available": True, "method": "spearman", "r": float(stat.statistic), "p": float(stat.pvalue), "n": int(x.size)}
    stat = stats.pearsonr(x, y)
    return {"available": True, "method": "pearson", "r": float(stat.statistic), "p": float(stat.pvalue), "n": int(x.size)}


def survival_logrank(payload: Dict[str, Any]) -> Dict[str, Any]:
    series = payload.get("series") or []
    if not isinstance(series, list) or len(series) < 2:
        return {"available": False, "message": "Log-rank requires at least two groups."}

    groups: List[List[Dict[str, Any]]] = []
    for group in series:
        records = []
        for record in (group.get("records") if isinstance(group, dict) else []) or []:
            time = record.get("time") if isinstance(record, dict) else None
            event = record.get("event") if isinstance(record, dict) else None
            if _is_finite_number(time):
                records.append({"time": float(time), "event": bool(event)})
        groups.append(records)
    if any(len(group) == 0 for group in groups):
        return {"available": False, "message": "Each group must contain records."}

    event_times = sorted({
        rec["time"]
        for group in groups
        for rec in group
        if rec["event"] and _is_finite_number(rec["time"])
    })
    if not event_times:
        return {"available": False, "message": "No events detected for log-rank."}

    k = len(groups)
    at_risk = [len(group) for group in groups]
    event_maps: List[Dict[float, Dict[str, int]]] = []
    for group in groups:
        mapping: Dict[float, Dict[str, int]] = {}
        for rec in group:
            key = rec["time"]
            bucket = mapping.get(key) or {"events": 0, "censored": 0}
            if rec["event"]:
                bucket["events"] += 1
            else:
                bucket["censored"] += 1
            mapping[key] = bucket
        event_maps.append(mapping)

    diff = np.zeros(k, dtype=float)
    variance = np.zeros((k, k), dtype=float)
    for time in event_times:
        events = np.array([event_maps[idx].get(time, {}).get("events", 0) for idx in range(k)], dtype=float)
        censored = np.array([event_maps[idx].get(time, {}).get("censored", 0) for idx in range(k)], dtype=float)
        total_events = float(np.sum(events))
        total_at_risk = float(np.sum(at_risk))
        if total_events > 0 and total_at_risk > 0:
            expected = (np.asarray(at_risk, dtype=float) / total_at_risk) * total_events
            diff += events - expected
            if total_at_risk > 1:
                common = total_events * (total_at_risk - total_events) / (total_at_risk * (total_at_risk - 1))
                p = np.asarray(at_risk, dtype=float) / total_at_risk
                for i in range(k):
                    for j in range(k):
                        if i == j:
                            variance[i, j] += common * p[i] * (1 - p[i])
                        else:
                            variance[i, j] -= common * p[i] * p[j]
        at_risk = [max(0, int(at_risk[idx] - events[idx] - censored[idx])) for idx in range(k)]

    df = k - 1
    if df <= 0:
        return {"available": False, "message": "Invalid log-rank degrees of freedom."}
    reduced = variance[:df, :df]
    inv = np.linalg.pinv(reduced)
    diff_vec = diff[:df]
    chi2 = float(diff_vec.T @ inv @ diff_vec)
    p_value = float(1 - stats.chi2.cdf(chi2, df))
    return {"available": True, "chi2": chi2, "df": df, "p": p_value}


def _clean_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (np.floating, float)):
        numeric = float(value)
        return numeric if math.isfinite(numeric) else None
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, dict):
        return {str(key): _clean_json(val) for key, val in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean_json(item) for item in value]
    return value


def evaluate_case(case: Dict[str, Any]) -> Dict[str, Any]:
    case_id = case.get("id")
    operation = str(case.get("operation") or "").strip().lower()
    payload = case.get("payload") if isinstance(case.get("payload"), dict) else {}
    if not operation:
        raise ValueError("Missing operation.")

    if operation == "adjust_pvalues":
        method = payload.get("method")
        adjusted = adjust_p_values(str(method or ""), payload.get("pValues") or [])
        result = {"adjusted": adjusted}
    elif operation == "hypergeometric_right_tail":
        result = hypergeometric_right_tail(payload)
    elif operation == "distribution_fit":
        distribution = payload.get("distribution")
        values = payload.get("values") or []
        result = fit_distribution(str(distribution or ""), values)
    elif operation == "goodness_of_fit":
        distribution = str(payload.get("distribution") or "")
        values = payload.get("values") or []
        fit_result = fit_distribution(distribution, values)
        params = payload.get("params") if isinstance(payload.get("params"), dict) else fit_result.get("params") or {}
        if not fit_result.get("valid") or not params:
            result = {"valid": False, "n": 0}
        else:
            result = goodness_of_fit(distribution, values, params)
    elif operation == "regression_linear":
        result = regression_linear(payload)
    elif operation == "regression_linear_through_origin":
        result = regression_linear_through_origin(payload)
    elif operation == "regression_polynomial":
        result = regression_polynomial(payload)
    elif operation == "box_ttest_welch":
        result = box_ttest_welch(payload)
    elif operation == "box_ttest_paired":
        result = box_ttest_paired(payload)
    elif operation == "box_ttest_one_sample":
        result = box_ttest_one_sample(payload)
    elif operation == "box_mann_whitney":
        result = box_mann_whitney(payload)
    elif operation == "box_wilcoxon_signed_rank":
        result = box_wilcoxon_signed_rank(payload)
    elif operation == "box_wilcoxon_one_sample":
        result = box_wilcoxon_one_sample(payload)
    elif operation == "box_anova":
        result = box_anova(payload)
    elif operation == "box_kruskal":
        result = box_kruskal(payload)
    elif operation == "box_friedman":
        result = box_friedman(payload)
    elif operation == "box_repeated_measures_anova":
        result = box_repeated_measures_anova(payload)
    elif operation == "pie_chi_square":
        result = pie_chi_square(payload)
    elif operation == "roc_curve_metric":
        result = roc_curve_metric(payload)
    elif operation == "roc_delong_diff":
        result = roc_delong_diff(payload)
    elif operation == "correlation":
        result = correlation(payload)
    elif operation == "survival_logrank":
        result = survival_logrank(payload)
    else:
        raise ValueError(f"Unsupported operation: {operation}")

    return {"id": case_id, "ok": True, "result": _clean_json(result)}


def main() -> int:
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            raise ValueError("Oracle request missing from stdin.")
        request = json.loads(raw_input)
        cases = request.get("cases")
        if not isinstance(cases, list):
            raise ValueError("Request must contain a 'cases' list.")
        results = []
        for case in cases:
            if not isinstance(case, dict):
                results.append({"id": None, "ok": False, "error": "Case must be an object."})
                continue
            try:
                results.append(evaluate_case(case))
            except Exception as err:  # noqa: BLE001
                results.append({"id": case.get("id"), "ok": False, "error": str(err)})
        output = {"ok": True, "results": results}
        sys.stdout.write(json.dumps(output))
        return 0
    except Exception as err:  # noqa: BLE001
        sys.stderr.write(f"stats_oracle failure: {err}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
