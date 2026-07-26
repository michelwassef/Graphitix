#!/usr/bin/env python3
"""Independent statistical oracle used by Graphitix differential tests.

Oracle contract version: 2026-07-26.2

The oracle intentionally relies on SciPy/statsmodels reference implementations
where available. Missing/invalid inference is represented as JSON null and is
never converted to significance.

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
import itertools
import math
import sys
from typing import Any, Callable, Dict, List, Tuple

import numpy as np
from scipy import stats
from scipy.interpolate import CubicSpline
from scipy.optimize import least_squares
from scipy.special import expit

try:
    import statsmodels.api as sm
    from statsmodels.duration.hazard_regression import PHReg
except Exception:  # optional dependency for oracle-only operations
    sm = None
    PHReg = None


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



def _sanitize_p_values(values: List[Any]) -> Tuple[List[int], List[float], List[Any]]:
    """Return valid positions/values while preserving invalid entries as None.

    Invalid, missing, negative, and >1 p-values are excluded from the
    multiplicity family. They must never be converted to zero or silently
    clamped because that would turn failed calculations into significance.
    """
    valid_indices: List[int] = []
    valid_values: List[float] = []
    output: List[Any] = [None] * len(values)
    for idx, raw in enumerate(values):
        if not _is_finite_number(raw):
            continue
        numeric = float(raw)
        if numeric < 0 or numeric > 1:
            continue
        valid_indices.append(idx)
        valid_values.append(numeric)
        output[idx] = numeric
    return valid_indices, valid_values, output

def _inverse_permutation(order: List[int]) -> List[int]:
    inv = [0] * len(order)
    for sorted_idx, original_idx in enumerate(order):
        inv[original_idx] = sorted_idx
    return inv



def adjust_p_values(method: str, values: List[Any]) -> List[Any]:
    valid_indices, p, output = _sanitize_p_values(values)
    m = len(p)
    if m == 0:
        return output
    key = str(method or "").strip().lower()
    if key == "none":
        return output
    if key == "bonferroni":
        adjusted = [_clamp_unit(v * m) for v in p]
    elif key == "sidak":
        adjusted = [_clamp_unit(-math.expm1(m * math.log1p(-v))) if v < 1 else 1.0 for v in p]
    else:
        order = sorted(range(m), key=lambda idx: p[idx])
        sorted_p = [p[idx] for idx in order]
        adjusted_sorted = [0.0] * m
        if key == "holm":
            running = 0.0
            for i, p_i in enumerate(sorted_p):
                running = max(running, (m - i) * p_i)
                adjusted_sorted[i] = _clamp_unit(running)
        elif key == "holm-sidak":
            running = 0.0
            for i, p_i in enumerate(sorted_p):
                exponent = m - i
                raw = -math.expm1(exponent * math.log1p(-p_i)) if p_i < 1 else 1.0
                running = max(running, raw)
                adjusted_sorted[i] = _clamp_unit(running)
        elif key == "hochberg":
            running = 1.0
            for i in range(m - 1, -1, -1):
                running = min(running, (m - i) * sorted_p[i])
                adjusted_sorted[i] = _clamp_unit(running)
        elif key == "bh":
            running = 1.0
            for i in range(m - 1, -1, -1):
                running = min(running, sorted_p[i] * m / (i + 1))
                adjusted_sorted[i] = _clamp_unit(running)
        elif key == "by":
            harmonic = sum(1.0 / j for j in range(1, m + 1))
            running = 1.0
            for i in range(m - 1, -1, -1):
                running = min(running, sorted_p[i] * m * harmonic / (i + 1))
                adjusted_sorted[i] = _clamp_unit(running)
        else:
            raise ValueError(f"Unsupported correction method: {method!r}")
        adjusted = [0.0] * m
        for sorted_idx, original_idx in enumerate(order):
            adjusted[original_idx] = adjusted_sorted[sorted_idx]
    for original_idx, value in zip(valid_indices, adjusted):
        output[original_idx] = value
    return output

def _fit_normal(values: List[Any]) -> Dict[str, Any]:
    numeric = [float(v) for v in values if _is_finite_number(v)]
    count = len(numeric)
    if count < 2:
        return {"valid": False, "params": None, "usedCount": count}
    arr = np.asarray(numeric, dtype=float)
    mu = float(np.mean(arr))
    variance = float(np.mean((arr - mu) ** 2))
    sigma = float(math.sqrt(max(variance, 0.0)))
    log_likelihood = float(np.sum(stats.norm.logpdf(arr, loc=mu, scale=max(sigma, np.finfo(float).eps))))
    return {
        "valid": sigma > 0,
        "usedCount": count,
        "params": {"mu": mu, "sigma": sigma, "variance": variance},
        "logLikelihood": log_likelihood,
    }



def _fit_lognormal(values: List[Any]) -> Dict[str, Any]:
    numeric = [float(v) for v in values if _is_finite_number(v)]
    count = len(numeric)
    if count < 2:
        return {"valid": False, "params": None, "usedCount": count, "message": "Need at least two finite values."}
    if any(v <= 0 for v in numeric):
        return {"valid": False, "params": None, "usedCount": count, "message": "Log-normal fitting requires all observations to be strictly positive."}
    arr = np.asarray(numeric, dtype=float)
    logs = np.log(arr)
    mu = float(np.mean(logs))
    variance_log = float(np.mean((logs - mu) ** 2))
    sigma = float(math.sqrt(max(variance_log, 0.0)))
    if not sigma > 0:
        return {"valid": False, "params": {"mu": mu, "sigma": sigma}, "usedCount": count, "message": "Log-scale variance is zero."}
    log_likelihood = float(np.sum(stats.lognorm.logpdf(arr, s=sigma, scale=math.exp(mu), loc=0)))
    return {
        "valid": True,
        "usedCount": count,
        "params": {
            "mu": mu,
            "sigma": sigma,
            "mean": float(math.exp(mu + variance_log / 2)),
            "median": float(math.exp(mu)),
        },
        "logLikelihood": log_likelihood,
    }


def _fit_exponential(values: List[Any]) -> Dict[str, Any]:
    numeric = [float(v) for v in values if _is_finite_number(v)]
    count = len(numeric)
    if count == 0:
        return {"valid": False, "params": None, "usedCount": 0}
    if any(v < 0 for v in numeric):
        return {"valid": False, "params": None, "usedCount": count, "message": "Exponential fitting requires all observations to be non-negative."}
    arr = np.asarray(numeric, dtype=float)
    mean = float(np.mean(arr))
    lamb = float(1.0 / mean) if mean > 0 else 0.0
    return {
        "valid": lamb > 0,
        "usedCount": count,
        "params": {"lambda": lamb, "mean": mean},
        "logLikelihood": float(count * math.log(lamb) - lamb * float(np.sum(arr))) if lamb > 0 else float("nan"),
        "message": None if lamb > 0 else "Mean is zero."
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



def goodness_of_fit(
    distribution: str,
    values: List[Any],
    params: Dict[str, Any],
    *,
    parameters_estimated: bool = True,
    iterations: int = 500,
    seed: int = 1337,
) -> Dict[str, Any]:
    numeric = [float(v) for v in values if _is_finite_number(v)]
    if not numeric:
        return {"valid": False, "available": False, "n": 0}
    key = str(distribution or "").strip().lower()
    if key == "lognormal" and any(v <= 0 for v in numeric):
        return {"valid": False, "available": False, "n": len(numeric), "message": "Observations violate log-normal support."}
    if key == "exponential" and any(v < 0 for v in numeric):
        return {"valid": False, "available": False, "n": len(numeric), "message": "Observations violate exponential support."}
    sorted_values = sorted(numeric)
    cdf = _make_cdf(key, params)
    ks_stat = _ks_statistic(sorted_values, cdf)
    ad_stat = _ad_statistic(sorted_values, cdf)
    n = len(sorted_values)
    if not parameters_estimated:
        return {
            "valid": True, "available": True, "n": n,
            "ksStatistic": ks_stat, "adStatistic": ad_stat,
            "ksPValue": _clamp_unit(float(stats.kstwo.sf(ks_stat, n))),
            "calibration": "fully-specified exact/asymptotic KS",
            "parametersEstimated": False,
            "iterations": 0, "seed": None,
        }

    iterations = max(200, min(5000, int(round(iterations))))
    rng = np.random.default_rng(int(seed) & 0xFFFFFFFF)
    ks_extreme = 0
    ad_extreme = 0
    valid_iterations = 0
    for _ in range(iterations):
        if key == "normal":
            simulated = rng.normal(float(params["mu"]), float(params["sigma"]), n)
        elif key == "lognormal":
            simulated = rng.lognormal(float(params["mu"]), float(params["sigma"]), n)
        elif key == "exponential":
            simulated = rng.exponential(1.0 / float(params["lambda"]), n)
        else:
            raise ValueError(f"Unsupported distribution: {distribution!r}")
        refit = fit_distribution(key, simulated.tolist())
        if not refit.get("valid"):
            continue
        sim_sorted = sorted(float(v) for v in simulated)
        sim_cdf = _make_cdf(key, refit["params"])
        sim_ks = _ks_statistic(sim_sorted, sim_cdf)
        sim_ad = _ad_statistic(sim_sorted, sim_cdf)
        if math.isfinite(sim_ks) and math.isfinite(sim_ad):
            valid_iterations += 1
            ks_extreme += int(sim_ks >= ks_stat - 1e-15)
            ad_extreme += int(sim_ad >= ad_stat - 1e-15)
    if valid_iterations == 0:
        return {"valid": False, "available": False, "n": n, "message": "Parametric-bootstrap calibration failed."}
    return {
        "valid": True, "available": True, "n": n,
        "ksStatistic": ks_stat, "adStatistic": ad_stat,
        "ksPValue": (ks_extreme + 1) / (valid_iterations + 1),
        "adPValue": (ad_extreme + 1) / (valid_iterations + 1),
        "calibration": "parametric bootstrap with parameter refitting",
        "parametersEstimated": True,
        "iterations": valid_iterations,
        "seed": int(seed) & 0xFFFFFFFF,
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
    if x.size < 2 or not np.any(x != 0):
        return {"valid": False, "message": "Insufficient data for through-origin regression."}
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    denominator = float(np.dot(x, x))
    slope = float(np.dot(x, y) / denominator)
    predictions = slope * x
    residuals = y - predictions
    sse = float(np.dot(residuals, residuals))
    uncentered_sst = float(np.dot(y, y))
    n = int(x.size)
    p_count = 1
    df = n - p_count
    r2 = 1.0 - sse / uncentered_sst if uncentered_sst > 0 else float("nan")
    adj = 1.0 - (sse / df) / (uncentered_sst / n) if df > 0 and uncentered_sst > 0 else float("nan")
    variance = sse / df if df > 0 else float("nan")
    se = math.sqrt(variance / denominator) if variance >= 0 and denominator > 0 else float("nan")
    t_stat = slope / se if se > 0 else float("nan")
    p_value = float(2 * stats.t.sf(abs(t_stat), df)) if math.isfinite(t_stat) and df > 0 else float("nan")
    tcrit = float(stats.t.ppf(1 - alpha / 2, df)) if df > 0 else float("nan")
    return {
        "valid": True, "sampleSize": n, "predictors": 1,
        "coefficients": [slope],
        "metrics": {
            "sse": sse, "sst": uncentered_sst, "r2": r2, "adjR2": adj,
            "r2Kind": "uncentered",
            "rmse": math.sqrt(sse / n), "mae": float(np.mean(np.abs(residuals))),
        },
        "coefficientStats": {"Slope": {
            "estimate": slope, "standardError": se, "tStatistic": t_stat,
            "pValue": p_value, "ciLow": slope - tcrit * se, "ciHigh": slope + tcrit * se,
        }},
        "coefficientCovariance": [[variance / denominator]] if math.isfinite(variance) else None,
        "summary": {"intercept": 0.0, "slope": slope},
    }

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


def regression_exponential(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    mask = y > 0
    x = x[mask]
    y = y[mask]
    if x.size < 2:
        return {"valid": False, "message": "Insufficient positive-Y data for exponential regression."}
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    log_y = np.log(y)
    design = np.column_stack([np.ones_like(x), x])
    result = _regression_core(x, log_y, design, alpha, ["ln(a)", "b"])
    if not result.get("valid"):
        return result
    log_a, b = result["coefficients"]
    predictions = np.exp(design @ np.asarray([log_a, b], dtype=float))
    residuals = y - predictions
    y_mean = float(np.mean(y))
    sst = float(np.sum((y - y_mean) ** 2))
    sse = float(np.sum(residuals ** 2))
    r2 = 1.0 if sst == 0 else float(1 - (sse / sst))
    n = int(x.size)
    result["metrics"] = {
        "sse": sse,
        "sst": sst,
        "r2": r2,
        "adjR2": float(1 - (1 - r2) * ((n - 1) / (n - 2))) if n > 2 else r2,
        "rmse": float(math.sqrt(sse / n)),
        "mae": float(np.mean(np.abs(residuals))),
    }
    result["summary"] = {"intercept": log_a, "slope": b, "amplitude": float(math.exp(log_a)), "rate": b}
    return result


def regression_power(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    mask = (x > 0) & (y > 0)
    x = x[mask]
    y = y[mask]
    if x.size < 2:
        return {"valid": False, "message": "Insufficient positive-X/positive-Y data for power regression."}
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    log_x = np.log(x)
    log_y = np.log(y)
    design = np.column_stack([np.ones_like(log_x), log_x])
    result = _regression_core(log_x, log_y, design, alpha, ["ln(a)", "b"])
    if not result.get("valid"):
        return result
    log_a, b = result["coefficients"]
    predictions = np.exp(log_a + (b * log_x))
    residuals = y - predictions
    y_mean = float(np.mean(y))
    sst = float(np.sum((y - y_mean) ** 2))
    sse = float(np.sum(residuals ** 2))
    r2 = 1.0 if sst == 0 else float(1 - (sse / sst))
    n = int(x.size)
    result["metrics"] = {
        "sse": sse,
        "sst": sst,
        "r2": r2,
        "adjR2": float(1 - (1 - r2) * ((n - 1) / (n - 2))) if n > 2 else r2,
        "rmse": float(math.sqrt(sse / n)),
        "mae": float(np.mean(np.abs(residuals))),
    }
    result["summary"] = {"intercept": log_a, "slope": b, "scale": float(math.exp(log_a)), "exponent": b}
    return result



def regression_logistic(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    n = int(x.size)
    if n < 3:
        return {"valid": False, "available": False, "message": "Insufficient data for logistic regression."}
    if np.any((y != 0) & (y != 1)):
        return {"valid": False, "available": False, "message": "Binary logistic regression requires Y encoded exactly as 0 or 1."}
    if np.unique(y).size < 2:
        return {"valid": False, "available": False, "message": "Logistic regression requires at least one event and one non-event."}
    if np.unique(x).size < 2:
        return {"valid": False, "available": False, "message": "Logistic regression requires variation in X."}
    if sm is None:
        raise RuntimeError("statsmodels is required for the logistic-regression oracle.")
    design = sm.add_constant(x, has_constant="add")
    try:
        model = sm.GLM(y, design, family=sm.families.Binomial())
        fit = model.fit(maxiter=100, tol=1e-9)
    except Exception as exc:
        return {"valid": False, "available": False, "message": f"Logistic fit failed: {exc}"}
    params = np.asarray(fit.params, dtype=float)
    cov = np.asarray(fit.cov_params(), dtype=float)
    se = np.asarray(fit.bse, dtype=float)
    z = np.asarray(fit.tvalues, dtype=float)
    pvals = np.asarray(fit.pvalues, dtype=float)
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    zcrit = float(stats.norm.ppf(1 - alpha / 2))
    ci = np.column_stack([params - zcrit * se, params + zcrit * se])
    predictions = np.asarray(fit.predict(design), dtype=float)
    residuals = y - predictions
    llf = float(fit.llf)
    null_llf = float(fit.llnull)
    converged = bool(getattr(fit, "converged", True))
    coefficient_stats = []
    for idx, term in enumerate(("Intercept", "Slope")):
        coefficient_stats.append({
            "term": term, "estimate": float(params[idx]), "standardError": float(se[idx]),
            "statistic": float(z[idx]), "zStatistic": float(z[idx]), "tStatistic": float(z[idx]),
            "pValue": float(pvals[idx]), "ciLow": float(ci[idx, 0]), "ciHigh": float(ci[idx, 1]),
            "distribution": "normal", "statisticLabel": "z",
        })
    return {
        "valid": True, "available": True,
        "coefficients": [float(v) for v in params],
        "coefficientStats": coefficient_stats,
        "coefficientCovariance": cov.tolist(),
        "metrics": {
            "sampleSize": n, "predictors": 1, "logLikelihood": llf,
            "deviance": float(fit.deviance), "nullDeviance": float(fit.null_deviance),
            "r2": float(1 - llf / null_llf), "adjR2": None,
            "logLoss": float(-llf / n), "iterations": int(getattr(fit, "fit_history", {}).get("iteration", 0) or 0),
            "converged": converged, "inferenceAvailable": converged,
            "aic": float(fit.aic), "bic": float(-2 * llf + len(params) * math.log(n)),
            "sse": float(np.sum(residuals ** 2)), "rmse": float(math.sqrt(np.mean(residuals ** 2))),
            "mae": float(np.mean(np.abs(residuals))),
        },
        "summary": {
            "intercept": float(params[0]), "slope": float(params[1]),
            "parameters": {"Intercept": float(params[0]), "Slope": float(params[1]), "OddsRatioPerUnitX": float(math.exp(params[1]))},
            "oddsRatioConfidenceInterval": {"low": float(math.exp(ci[1, 0])), "high": float(math.exp(ci[1, 1]))},
        },
        "predictions": predictions.tolist(),
        "warnings": [] if converged else ["Logistic maximum-likelihood fit did not fully converge."],
    }

def regression_deming(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    if x.size < 3:
        return {"valid": False, "message": "Insufficient data for Deming regression."}
    mode = str(payload.get("mode") or "deming").strip().lower()
    error_ratio = 1.0 if mode == "orthogonal" else (
        float(payload.get("errorRatio")) if _is_finite_number(payload.get("errorRatio")) and float(payload.get("errorRatio")) > 0 else 1.0
    )
    x_mean = float(np.mean(x))
    y_mean = float(np.mean(y))
    dx = x - x_mean
    dy = y - y_mean
    sxx = float(np.sum(dx * dx))
    syy = float(np.sum(dy * dy))
    sxy = float(np.sum(dx * dy))
    if abs(sxy) <= 1e-18:
        return {"valid": False, "message": "Degenerate covariance for Deming regression."}
    discriminant = ((syy - (error_ratio * sxx)) ** 2) + (4 * error_ratio * sxy * sxy)
    slope = ((syy - (error_ratio * sxx)) + math.sqrt(max(0.0, discriminant))) / (2 * sxy)
    intercept = y_mean - (slope * x_mean)
    predictions = intercept + (slope * x)
    residuals = y - predictions
    sse = float(np.sum(residuals ** 2))
    orth_sse = float(np.sum((residuals ** 2) / np.maximum(1e-12, 1 + (slope * slope))))
    return {
        "valid": True,
        "coefficients": [intercept, slope],
        "metrics": {
            "sse": sse,
            "orthogonalSSE": orth_sse,
            "r2": float("nan"),
            "adjR2": float("nan"),
            "rmse": float(math.sqrt(sse / x.size)),
            "mae": float(np.mean(np.abs(residuals))),
        },
        "summary": {"intercept": intercept, "slope": slope, "errorRatio": error_ratio},
    }


def regression_lowess(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    if x.size < 3:
        return {"valid": False, "message": "Insufficient data for LOWESS."}
    points = sorted(zip(x.tolist(), y.tolist()), key=lambda item: item[0])
    xs = np.asarray([pt[0] for pt in points], dtype=float)
    ys = np.asarray([pt[1] for pt in points], dtype=float)
    span = float(payload.get("span")) if _is_finite_number(payload.get("span")) else 0.75
    span = min(0.95, max(0.2, span))
    n = int(xs.size)
    k = max(2, int(math.ceil(span * n)))

    def tricube(value: float) -> float:
        t = min(1.0, abs(value))
        base = 1 - (t ** 3)
        return max(0.0, base) ** 3

    def smooth_at(target_index: int, robust_weights: np.ndarray) -> float:
        x0 = xs[target_index]
        distances = sorted((abs(xs[idx] - x0), idx) for idx in range(n))
        bandwidth = max(1e-9, distances[min(len(distances) - 1, k - 1)][0] or 1e-9)
        sw = sx = sy = sxx = sxy = 0.0
        for idx in range(n):
            distance_weight = tricube((xs[idx] - x0) / bandwidth)
            weight = distance_weight * robust_weights[idx]
            sw += weight
            sx += weight * xs[idx]
            sy += weight * ys[idx]
            sxx += weight * xs[idx] * xs[idx]
            sxy += weight * xs[idx] * ys[idx]
        det = (sw * sxx) - (sx * sx)
        if abs(det) <= 1e-18:
            return float(ys[target_index])
        intercept = ((sy * sxx) - (sx * sxy)) / det
        slope = ((sw * sxy) - (sx * sy)) / det
        return float(intercept + (slope * x0))

    robust_weights = np.ones(n, dtype=float)
    smoothed = np.asarray([smooth_at(idx, robust_weights) for idx in range(n)], dtype=float)
    for _ in range(2):
        residuals = ys - smoothed
        median_abs = float(np.median(np.abs(residuals))) or 1e-9
        updated = []
        for value in residuals:
            ratio = abs(float(value)) / (6 * median_abs)
            if ratio >= 1:
                updated.append(0.0)
            else:
                base = 1 - (ratio * ratio)
                updated.append(base * base)
        robust_weights = np.asarray(updated, dtype=float)
        smoothed = np.asarray([smooth_at(idx, robust_weights) for idx in range(n)], dtype=float)

    def predict(x_value: float) -> float:
        x_num = float(x_value)
        if x_num <= xs[0]:
            return float(smoothed[0])
        if x_num >= xs[-1]:
            return float(smoothed[-1])
        for idx in range(1, n):
            left_x = xs[idx - 1]
            right_x = xs[idx]
            if x_num <= right_x:
                span_x = (right_x - left_x) or 1.0
                t = (x_num - left_x) / span_x
                return float(smoothed[idx - 1] + (t * (smoothed[idx] - smoothed[idx - 1])))
        return float("nan")

    residuals = ys - smoothed
    sse = float(np.sum(residuals ** 2))
    y_mean = float(np.mean(ys))
    tss = float(np.sum((ys - y_mean) ** 2))
    parameter_count = max(2, int(round(span * n)))
    residual_df = max(1, n - parameter_count)
    if n > 0 and parameter_count > 0 and sse > 0:
        aic = float((n * math.log(sse / n)) + (2 * parameter_count))
        aicc = float(aic + ((2 * parameter_count * (parameter_count + 1)) / (n - parameter_count - 1))) if (n - parameter_count - 1) > 0 else float("nan")
        bic = float((n * math.log(sse / n)) + (parameter_count * math.log(n)))
    else:
        aic = float("nan")
        aicc = float("nan")
        bic = float("nan")
    eval_xs = [float(v) for v in (payload.get("evalXs") or []) if _is_finite_number(v)]
    return {
        "valid": True,
        "metrics": {
            "sampleSize": n,
            "parameterCount": parameter_count,
            "residualDf": residual_df,
            "sse": sse,
            "r2": float(1 - (sse / tss)) if tss > 0 else float("nan"),
            "adjR2": float("nan"),
            "rmse": float(math.sqrt(sse / n)),
            "mae": float(np.mean(np.abs(residuals))),
            "aic": aic,
            "aicc": aicc,
            "bic": bic,
        },
        "summary": {"span": span, "parameters": {"Span": span}},
        "predictions": [predict(x_val) for x_val in eval_xs],
    }


def regression_spline_natural(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    if x.size < 3:
        return {"valid": False, "message": "Insufficient data for spline regression."}
    order = np.argsort(x)
    x = x[order]
    y = y[order]
    if np.unique(x).size != x.size:
        return {"valid": False, "message": "Natural spline requires unique X values."}
    spline = CubicSpline(x, y, bc_type="natural")
    fitted = spline(x)
    residuals = y - fitted
    sse = float(np.sum(residuals ** 2))
    y_mean = float(np.mean(y))
    tss = float(np.sum((y - y_mean) ** 2))
    eval_xs = [float(v) for v in (payload.get("evalXs") or []) if _is_finite_number(v)]
    predictions = spline(np.asarray(eval_xs, dtype=float)) if eval_xs else np.asarray([], dtype=float)
    return {
        "valid": True,
        "metrics": {
            "sse": sse,
            "r2": float(1 - (sse / tss)) if tss > 0 else float("nan"),
            "adjR2": float("nan"),
            "rmse": float(math.sqrt(sse / x.size)),
            "mae": float(np.mean(np.abs(residuals))),
        },
        "summary": {"knots": int(x.size), "domainMin": float(x[0]), "domainMax": float(x[-1])},
        "predictions": [float(value) for value in predictions.tolist()],
    }


def _safe_pow10(exponent: float) -> float:
    if not math.isfinite(exponent):
        return float("nan")
    bounded = max(-308.0, min(308.0, float(exponent)))
    return float(10**bounded)


def _clamp_positive(value: Any, fallback: float) -> float:
    numeric = float(value) if _is_finite_number(value) else fallback
    if not math.isfinite(numeric) or numeric <= 0:
        return fallback
    return float(numeric)


def _clamp_positive_int(value: Any, *, min_value: int = 1, max_value: int = 120, fallback: int = 1) -> int:
    if not _is_finite_number(value):
        return fallback
    rounded = int(round(float(value)))
    return max(min_value, min(max_value, rounded))


def _clamp_unit_interval(value: Any, fallback: float = 0.2) -> float:
    if not _is_finite_number(value):
        return fallback
    numeric = float(value)
    return max(0.001, min(0.999, numeric))


def _compute_sse_metrics(y_true: np.ndarray, y_pred: np.ndarray, parameter_count: int) -> Dict[str, float]:
    residuals = y_true - y_pred
    sse = float(np.sum(residuals**2))
    y_mean = float(np.mean(y_true)) if y_true.size else float("nan")
    sst = float(np.sum((y_true - y_mean) ** 2)) if y_true.size else float("nan")
    r2 = 1.0 if sst == 0 else float(1 - (sse / sst))
    n = int(y_true.size)
    if n > parameter_count + 1:
        adj_r2 = float(1 - (1 - r2) * ((n - 1) / (n - parameter_count - 1)))
    else:
        adj_r2 = r2
    return {
        "sse": sse,
        "sst": sst,
        "r2": r2,
        "adjR2": adj_r2,
        "rmse": float(math.sqrt(sse / n)) if n > 0 else float("nan"),
        "mae": float(np.mean(np.abs(residuals))) if n > 0 else float("nan"),
    }


def _run_nonlinear_fit(
    payload: Dict[str, Any],
    *,
    initial_builder: Callable[[List[Tuple[float, float]]], List[float]],
    predict_scalar: Callable[[np.ndarray, float], float],
    summary_builder: Callable[[np.ndarray], Dict[str, Any]],
    bounds_builder: Callable[[List[Tuple[float, float]]], Tuple[List[float], List[float]]],
    mode: str,
) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    points = list(zip(x.tolist(), y.tolist()))
    if len(points) < 4:
        return {"valid": False, "message": f"Insufficient data for {mode} regression."}

    lower, upper = bounds_builder(points)
    lower_arr = np.asarray(lower, dtype=float)
    upper_arr = np.asarray(upper, dtype=float)
    raw_initial = initial_builder(points)
    if raw_initial and isinstance(raw_initial[0], (list, tuple, np.ndarray)):
        initial_candidates = [np.asarray(candidate, dtype=float) for candidate in raw_initial]
    else:
        initial_candidates = [np.asarray(raw_initial, dtype=float)]

    def residual_vector(params: np.ndarray) -> np.ndarray:
        predictions = np.asarray([predict_scalar(params, float(xv)) for xv in x], dtype=float)
        return predictions - y

    fit = None
    best_cost = float("inf")
    for candidate in initial_candidates:
        initial = np.minimum(np.maximum(candidate, lower_arr), upper_arr)
        try:
            attempt = least_squares(
                residual_vector,
                x0=initial,
                bounds=(lower_arr, upper_arr),
                method="trf",
                max_nfev=10000,
            )
        except Exception:
            continue
        cost = float(getattr(attempt, "cost", float("inf")))
        if fit is None or cost < best_cost:
            fit = attempt
            best_cost = cost
    if fit is None:
        return {"valid": False, "message": f"Fit failed for {mode} regression."}
    params = np.asarray(fit.x, dtype=float)
    predictions = np.asarray([predict_scalar(params, float(xv)) for xv in x], dtype=float)
    metrics = _compute_sse_metrics(y, predictions, params.size)
    eval_xs = [float(v) for v in (payload.get("evalXs") or []) if _is_finite_number(v)]
    return {
        "valid": True,
        "coefficients": [float(value) for value in params.tolist()],
        "metrics": {
            **metrics,
            "iterations": int(getattr(fit, "nfev", 0) or 0),
        },
        "summary": summary_builder(params),
        "predictions": [float(predict_scalar(params, x_val)) for x_val in eval_xs],
    }


def regression_gaussian(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[float]:
        xs = [pt[0] for pt in points]
        ys = [pt[1] for pt in points]
        min_y = min(ys)
        max_y = max(ys)
        center = xs[ys.index(max_y)] if ys else float(np.mean(xs))
        sigma = max((max(xs) - min(xs)) / 6.0, 1e-3)
        return [min_y, max_y - min_y, center, sigma]

    def predict(params: np.ndarray, x_value: float) -> float:
        baseline, amplitude, center, sigma = params
        sigma = _clamp_positive(sigma, 1e-9)
        z = (x_value - center) / sigma
        return float(baseline + (amplitude * math.exp(-0.5 * z * z)))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        return {
            "parameters": {
                "Baseline": float(params[0]),
                "Amplitude": float(params[1]),
                "Center": float(params[2]),
                "Sigma": float(params[3]),
            },
            "primaryParameter": {"label": "Center", "value": float(params[2])},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([-math.inf, -math.inf, -math.inf, 1e-9], [math.inf, math.inf, math.inf, math.inf])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="gaussian")


def regression_one_phase_association(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[float]:
        xs = [pt[0] for pt in points]
        ys = [pt[1] for pt in points]
        x_range = max(1e-6, max(xs) - min(xs))
        return [ys[0], ys[-1], 1 / x_range]

    def predict(params: np.ndarray, x_value: float) -> float:
        y0, plateau, k = params
        k = _clamp_positive(k, 1e-9)
        return float(y0 + ((plateau - y0) * (1 - math.exp(-k * x_value))))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        return {
            "parameters": {"Y0": float(params[0]), "Plateau": float(params[1]), "K": float(params[2])},
            "primaryParameter": {"label": "K", "value": float(params[2])},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([-math.inf, -math.inf, 1e-9], [math.inf, math.inf, math.inf])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="onePhaseAssociation")


def regression_one_phase_decay(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[float]:
        xs = [pt[0] for pt in points]
        ys = [pt[1] for pt in points]
        x_range = max(1e-6, max(xs) - min(xs))
        return [ys[0], ys[-1], 1 / x_range]

    def predict(params: np.ndarray, x_value: float) -> float:
        y0, plateau, k = params
        k = _clamp_positive(k, 1e-9)
        return float(plateau + ((y0 - plateau) * math.exp(-k * x_value)))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        return {
            "parameters": {"Y0": float(params[0]), "Plateau": float(params[1]), "K": float(params[2])},
            "primaryParameter": {"label": "K", "value": float(params[2])},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([-math.inf, -math.inf, 1e-9], [math.inf, math.inf, math.inf])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="onePhaseDecay")


def regression_gompertz(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[float]:
        xs = [pt[0] for pt in points]
        ys = [pt[1] for pt in points]
        lower = min(ys)
        upper = max(ys)
        k = 1 / max(1e-6, max(xs) - min(xs))
        return [lower, upper, k, float(np.mean(xs))]

    def predict(params: np.ndarray, x_value: float) -> float:
        lower, upper, k, x0 = params
        k = _clamp_positive(k, 1e-9)
        return float(lower + ((upper - lower) * math.exp(-math.exp(-k * (x_value - x0)))))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        return {
            "parameters": {"Lower": float(params[0]), "Upper": float(params[1]), "K": float(params[2]), "X0": float(params[3])},
            "primaryParameter": {"label": "K", "value": float(params[2])},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([-math.inf, -math.inf, 1e-9, -math.inf], [math.inf, math.inf, math.inf, math.inf])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="gompertz")


def regression_binding_saturation(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[float]:
        xs = sorted(pt[0] for pt in points)
        ys = [pt[1] for pt in points]
        mid_x = xs[len(xs) // 2] if xs else 1.0
        return [max(ys), max(1e-6, mid_x), 0.0]

    def predict(params: np.ndarray, x_value: float) -> float:
        bmax, kd, ns = params
        kd = _clamp_positive(kd, 1e-12)
        return float((bmax * x_value) / (kd + x_value) + (ns * x_value))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        return {
            "parameters": {"Bmax": float(params[0]), "Kd": float(params[1]), "NS": float(params[2])},
            "primaryParameter": {"label": "Kd", "value": float(params[1])},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([0.0, 1e-12, -math.inf], [math.inf, math.inf, math.inf])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="bindingSaturation")


def regression_binding_competitive(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[float]:
        ys = [pt[1] for pt in points]
        xs = sorted(pt[0] for pt in points)
        mid_x = xs[len(xs) // 2] if xs else 1.0
        return [max(ys), min(ys), max(1e-9, abs(mid_x)), 1.0]

    def predict(params: np.ndarray, x_value: float) -> float:
        top, bottom, ic50, hill = params
        ic50 = _clamp_positive(ic50, 1e-12)
        hill = _clamp_positive(hill, 0.01)
        ratio = (max(0.0, x_value) / ic50) ** hill
        return float(bottom + ((top - bottom) / (1 + ratio)))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        return {
            "parameters": {"Top": float(params[0]), "Bottom": float(params[1]), "IC50": float(params[2]), "HillSlope": float(params[3])},
            "primaryParameter": {"label": "IC50", "value": float(params[2])},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([-math.inf, -math.inf, 1e-12, 0.01], [math.inf, math.inf, math.inf, 8.0])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="bindingCompetitive")


def regression_enzyme_kinetics_substrate(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[float]:
        ys = [pt[1] for pt in points]
        xs = sorted(pt[0] for pt in points)
        mid_x = xs[len(xs) // 2] if xs else 1.0
        return [max(ys), max(1e-6, mid_x), min(ys) * 0.05]

    def predict(params: np.ndarray, x_value: float) -> float:
        vmax, km, baseline = params
        km = _clamp_positive(km, 1e-12)
        x_pos = max(0.0, x_value)
        return float(baseline + ((vmax * x_pos) / (km + x_pos)))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        return {
            "parameters": {"Vmax": float(params[0]), "Km": float(params[1]), "Baseline": float(params[2])},
            "primaryParameter": {"label": "Km", "value": float(params[1])},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([0.0, 1e-12, -math.inf], [math.inf, math.inf, math.inf])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="enzymeKineticsSubstrate")


def regression_enzyme_kinetics_inhibition(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[float]:
        ys = [pt[1] for pt in points]
        xs = sorted(pt[0] for pt in points)
        mid_x = xs[len(xs) // 2] if xs else 1.0
        return [max(ys), max(1e-9, abs(mid_x)), 1.0, min(ys)]

    def predict(params: np.ndarray, x_value: float) -> float:
        vmax, ic50, hill, baseline = params
        ic50 = _clamp_positive(ic50, 1e-12)
        hill = _clamp_positive(hill, 0.01)
        ratio = (max(0.0, x_value) / ic50) ** hill
        return float(baseline + (vmax / (1 + ratio)))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        return {
            "parameters": {"Vmax": float(params[0]), "IC50": float(params[1]), "HillSlope": float(params[2]), "Baseline": float(params[3])},
            "primaryParameter": {"label": "IC50", "value": float(params[1])},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([-math.inf, 1e-12, 0.01, -math.inf], [math.inf, math.inf, 8.0, math.inf])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="enzymeKineticsInhibition")


def regression_dose_response_3pl(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[List[float]]:
        xs = [pt[0] for pt in points]
        ys = [pt[1] for pt in points]
        mid_y = (min(ys) + max(ys)) / 2.0
        near = min(points, key=lambda pt: abs(pt[1] - mid_y))
        mean_x = float(np.mean(xs))
        top = max(ys)
        return [
            [top, near[0], -1.0],
            [top, near[0], 1.0],
            [top, mean_x, -1.0],
            [top, mean_x, 1.0],
            [top * 1.05, near[0], 1.5],
        ]

    def predict(params: np.ndarray, x_value: float) -> float:
        top, log_ic50, hill = params
        denom = 1 + _safe_pow10((log_ic50 - x_value) * hill)
        return float(top / denom)

    def summary(params: np.ndarray) -> Dict[str, Any]:
        ic50 = _safe_pow10(float(params[1]))
        return {
            "parameters": {"Bottom": 0.0, "Top": float(params[0]), "LogIC50": float(params[1]), "IC50": ic50, "HillSlope": float(params[2])},
            "primaryParameter": {"label": "IC50", "value": ic50},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([-math.inf, -math.inf, -12.0], [math.inf, math.inf, 12.0])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="doseResponse3pl")


def regression_dose_response_4pl(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[List[float]]:
        xs = [pt[0] for pt in points]
        ys = [pt[1] for pt in points]
        span = max(max(ys) - min(ys), 1e-6)
        mid_y = min(ys) + (span / 2.0)
        near = min(points, key=lambda pt: abs(pt[1] - mid_y))
        mean_x = float(np.mean(xs))
        bottom = min(ys)
        top = max(ys)
        return [
            [bottom, top, near[0], -1.0],
            [bottom, top, near[0], 1.0],
            [bottom, top, mean_x, -1.0],
            [bottom, top, mean_x, 1.0],
            [bottom - 0.05 * span, top + 0.05 * span, near[0], 1.25],
        ]

    def predict(params: np.ndarray, x_value: float) -> float:
        bottom, top, log_ic50, hill = params
        denom = 1 + _safe_pow10((log_ic50 - x_value) * hill)
        return float(bottom + ((top - bottom) / denom))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        ic50 = _safe_pow10(float(params[2]))
        return {
            "parameters": {"Bottom": float(params[0]), "Top": float(params[1]), "LogIC50": float(params[2]), "IC50": ic50, "HillSlope": float(params[3])},
            "primaryParameter": {"label": "IC50", "value": ic50},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([-math.inf, -math.inf, -math.inf, -12.0], [math.inf, math.inf, math.inf, 12.0])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="doseResponse4pl")


def regression_dose_response_5pl(payload: Dict[str, Any]) -> Dict[str, Any]:
    def initial(points: List[Tuple[float, float]]) -> List[List[float]]:
        xs = [pt[0] for pt in points]
        ys = [pt[1] for pt in points]
        mid_y = (min(ys) + max(ys)) / 2.0
        near = min(points, key=lambda pt: abs(pt[1] - mid_y))
        mean_x = float(np.mean(xs))
        bottom = min(ys)
        top = max(ys)
        return [
            [bottom, top, near[0], -1.0, 1.0],
            [bottom, top, near[0], 1.0, 1.0],
            [bottom, top, mean_x, -1.0, 1.0],
            [bottom, top, mean_x, 1.0, 1.0],
            [bottom, top, near[0], 1.0, 1.5],
        ]

    def predict(params: np.ndarray, x_value: float) -> float:
        bottom, top, log_ic50, hill, asym = params
        asym = _clamp_positive(asym, 0.1)
        base = 1 + _safe_pow10((log_ic50 - x_value) * hill)
        return float(bottom + ((top - bottom) / (base**asym)))

    def summary(params: np.ndarray) -> Dict[str, Any]:
        ic50 = _safe_pow10(float(params[2]))
        return {
            "parameters": {
                "Bottom": float(params[0]),
                "Top": float(params[1]),
                "LogIC50": float(params[2]),
                "IC50": ic50,
                "HillSlope": float(params[3]),
                "Asymmetry": float(params[4]),
            },
            "primaryParameter": {"label": "IC50", "value": ic50},
        }

    def bounds(_: List[Tuple[float, float]]) -> Tuple[List[float], List[float]]:
        return ([-math.inf, -math.inf, -math.inf, -12.0, 0.1], [math.inf, math.inf, math.inf, 12.0, 10.0])

    return _run_nonlinear_fit(payload, initial_builder=initial, predict_scalar=predict, summary_builder=summary, bounds_builder=bounds, mode="doseResponse5pl")


def _difference_series(values: List[float], order: int = 0) -> List[float]:
    current = list(values)
    for _ in range(max(0, order)):
        if len(current) < 2:
            return list(current)
        current = [current[idx] - current[idx - 1] for idx in range(1, len(current))]
    return current


def _compute_mape(actual: List[float], predicted: List[float]) -> float:
    total = 0.0
    count = 0
    for a_val, p_val in zip(actual, predicted):
        if math.isfinite(a_val) and math.isfinite(p_val) and a_val != 0:
            total += abs((a_val - p_val) / a_val)
            count += 1
    return float(total / count) if count else float("nan")


def _compute_smape(actual: List[float], predicted: List[float]) -> float:
    total = 0.0
    count = 0
    for a_val, p_val in zip(actual, predicted):
        if math.isfinite(a_val) and math.isfinite(p_val):
            denom = abs(a_val) + abs(p_val)
            if denom == 0:
                continue
            total += (2 * abs(a_val - p_val)) / denom
            count += 1
    return float(total / count) if count else float("nan")


def _compute_average_spacing(values: List[float]) -> float:
    if len(values) < 2:
        return float("nan")
    deltas = [values[idx] - values[idx - 1] for idx in range(1, len(values)) if math.isfinite(values[idx] - values[idx - 1])]
    return float(sum(deltas) / len(deltas)) if deltas else float("nan")



def _compute_forecast_variance(phi: List[float], horizon: int, sigma_sq: float) -> List[float]:
    """Innovation forecast variance for a stationary AR(p) process.

    psi_0=1 and Var(e_{t+h}) = sigma^2 * sum_{j=0}^{h-1} psi_j^2.
    """
    if horizon <= 0:
        return []
    p = len(phi)
    psi = [1.0]
    for k in range(1, horizon):
        psi_k = 0.0
        for i in range(1, min(k, p) + 1):
            psi_k += phi[i - 1] * psi[k - i]
        psi.append(psi_k)
    return [float(max(0.0, sigma_sq * sum(v * v for v in psi[:h]))) for h in range(1, horizon + 1)]

def _ols_coefficients(design: List[List[float]], target: List[float]) -> np.ndarray:
    design_arr = np.asarray(design, dtype=float)
    target_arr = np.asarray(target, dtype=float)
    xtx = design_arr.T @ design_arr
    try:
        xtx_inv = np.linalg.inv(xtx)
    except np.linalg.LinAlgError:
        xtx_inv = np.linalg.pinv(xtx)
    beta = xtx_inv @ (design_arr.T @ target_arr)
    return np.asarray(beta, dtype=float)


def _auto_select_arima_order(series: List[float], options: Dict[str, Any]) -> Dict[str, Any]:
    if len(series) < 5:
        return {"p": 1, "d": 0, "criterion": float("nan")}
    max_p = max(0, min(int(options.get("maxP") or 2), 5))
    max_d = max(0, min(int(options.get("maxD") or 2), 2))
    criterion = "aic" if options.get("criterion") == "aic" else "bic"
    best: Dict[str, Any] | None = None
    for d_val in range(max_d + 1):
        values = _difference_series(series, d_val)
        if len(values) < 4:
            continue
        for p_val in range(max_p + 1):
            if p_val == 0:
                continue
            design: List[List[float]] = []
            target: List[float] = []
            for t_idx in range(p_val, len(values)):
                row = [1.0] + [values[t_idx - lag] for lag in range(1, p_val + 1)]
                design.append(row)
                target.append(values[t_idx])
            coeffs = _ols_coefficients(design, target)
            residuals = []
            for t_idx in range(p_val, len(values)):
                pred = float(coeffs[0] + sum(coeffs[lag] * values[t_idx - lag] for lag in range(1, p_val + 1)))
                residuals.append(values[t_idx] - pred)
            n_eff = len(residuals)
            if n_eff <= 0:
                continue
            sse = float(sum(val * val for val in residuals))
            sigma_sq = sse / max(n_eff, 1)
            if not math.isfinite(sigma_sq) or sigma_sq <= 0:
                continue
            k = len(coeffs)
            log_likelihood = -0.5 * n_eff * (math.log(2 * math.pi) + math.log(sigma_sq) + 1)
            aic = 2 * k - 2 * log_likelihood
            bic = math.log(n_eff) * k - 2 * log_likelihood
            score = aic if criterion == "aic" else bic
            if best is None or score < best["score"]:
                best = {"p": p_val, "d": d_val, "score": score, "aic": aic, "bic": bic}
    return best or {"p": 1, "d": 0, "criterion": float("nan")}


def regression_arima(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    if x.size < 4:
        return {"valid": False, "message": "Insufficient data for ARIMA."}
    order = np.argsort(x)
    x = x[order]
    y = y[order]
    y_vals = [float(val) for val in y.tolist()]
    x_vals = [float(val) for val in x.tolist()]
    forecast = payload.get("forecast") if isinstance(payload.get("forecast"), dict) else {}
    horizon = _clamp_positive_int(forecast.get("horizon"), min_value=1, max_value=120, fallback=max(1, round(len(y_vals) * 0.25)))
    auto_tune = bool(forecast.get("autoTune"))
    selection = _auto_select_arima_order(y_vals, forecast) if auto_tune else None
    p_raw = int(forecast.get("p")) if isinstance(forecast.get("p"), int) else 1
    d_raw = int(forecast.get("d")) if isinstance(forecast.get("d"), int) else 0
    p_val = max(1, selection["p"] if selection else max(0, min(p_raw, int(forecast.get("maxP") or 5))))
    d_val = max(0, selection["d"] if selection else max(0, min(d_raw, int(forecast.get("maxD") or 2))))
    diff_series = _difference_series(y_vals, d_val)
    if len(diff_series) <= p_val:
        return {"valid": False, "message": "Differenced series too short for ARIMA."}
    design: List[List[float]] = []
    target: List[float] = []
    for t_idx in range(p_val, len(diff_series)):
        design.append([1.0] + [diff_series[t_idx - lag] for lag in range(1, p_val + 1)])
        target.append(diff_series[t_idx])
    coeffs = _ols_coefficients(design, target)
    intercept = float(coeffs[0])
    phi = [float(val) for val in coeffs[1:].tolist()]
    fitted: List[float | None] = [None] * len(y_vals)
    residuals: List[float] = []
    actual_for_errors: List[float] = []
    predicted_for_errors: List[float] = []
    for t_idx in range(p_val, len(diff_series)):
        pred = intercept + sum(phi[lag - 1] * diff_series[t_idx - lag] for lag in range(1, p_val + 1))
        actual_index = t_idx + d_val
        base_actual = y_vals[actual_index - 1]
        predicted_actual = base_actual + pred
        fitted[actual_index] = predicted_actual
        residuals.append(y_vals[actual_index] - predicted_actual)
        actual_for_errors.append(y_vals[actual_index])
        predicted_for_errors.append(predicted_actual)
    n_eff = len(residuals)
    sse = float(sum(val * val for val in residuals))
    sigma_sq = sse / max(n_eff, 1) if n_eff else 0.0
    metrics = _compute_sse_metrics(np.asarray(y_vals, dtype=float), np.asarray([f if f is not None else y_vals[idx] for idx, f in enumerate(fitted)], dtype=float), len(coeffs))
    metrics["sse"] = sse
    metrics["rmse"] = float(math.sqrt(sse / n_eff)) if n_eff else float("nan")
    metrics["mae"] = float(sum(abs(val) for val in residuals) / n_eff) if n_eff else float("nan")
    metrics["mape"] = _compute_mape(actual_for_errors, predicted_for_errors)
    metrics["smape"] = _compute_smape(actual_for_errors, predicted_for_errors)
    k = len(coeffs)
    log_likelihood = -0.5 * n_eff * (math.log(2 * math.pi) + math.log(sigma_sq) + 1) if n_eff > 0 and sigma_sq > 0 else float("nan")
    metrics["aic"] = float(2 * k - 2 * log_likelihood) if math.isfinite(log_likelihood) else float("nan")
    metrics["bic"] = float(math.log(n_eff or 1) * k - 2 * log_likelihood) if math.isfinite(log_likelihood) else float("nan")
    metrics["horizon"] = int(horizon)
    spacing = _compute_average_spacing(x_vals)
    last_x = x_vals[-1]
    working_actual = y_vals[-1]
    diff_history = diff_series[-p_val:]
    variances = _compute_forecast_variance(phi, horizon, sigma_sq)
    z_critical = float(stats.norm.ppf(0.975))
    forecast_points = []
    for h_idx in range(1, horizon + 1):
        diff_pred = intercept + sum((phi[lag - 1] if lag - 1 < len(phi) else 0.0) * (diff_history[-lag] if lag <= len(diff_history) else 0.0) for lag in range(1, p_val + 1))
        diff_history.append(diff_pred)
        working_actual = working_actual + diff_pred
        variance = variances[h_idx - 1] if h_idx - 1 < len(variances) else sigma_sq
        std_err = math.sqrt(max(variance, sigma_sq))
        x_value = (last_x + spacing * h_idx) if math.isfinite(spacing) else (last_x + h_idx)
        forecast_points.append({
            "x": float(x_value),
            "y": float(working_actual),
            "lower": float(working_actual - z_critical * std_err),
            "upper": float(working_actual + z_critical * std_err),
            "stdErr": float(std_err),
        })
    summary_parameters: Dict[str, Any] = {"Intercept": intercept, "Horizon": horizon, "AR order (p)": p_val, "Differencing (d)": d_val}
    for idx, value in enumerate(phi):
        summary_parameters[f"AR{idx + 1}"] = value
    return {
        "valid": True,
        "coefficients": [float(value) for value in coeffs.tolist()],
        "metrics": metrics,
        "forecast": {"horizon": int(horizon), "points": forecast_points},
        "summary": {"parameters": summary_parameters, "primaryParameter": {"label": "AR1" if phi else "Intercept", "value": phi[0] if phi else intercept}},
    }


def _build_initial_seasonal_components(values: List[float], season_length: int) -> Dict[str, Any]:
    seasons = max(1, len(values) // season_length)
    if seasons < 2:
        avg = float(np.mean(values)) if values else 0.0
        seasonals = [(values[idx] - avg) if idx < len(values) and math.isfinite(values[idx]) else 0.0 for idx in range(season_length)]
        return {"level": avg, "trend": 0.0, "seasonals": seasonals}
    season_averages: List[float] = []
    for season_idx in range(seasons):
        start = season_idx * season_length
        chunk = values[start : start + season_length]
        if len(chunk) < season_length:
            continue
        season_averages.append(float(sum(chunk) / season_length))
    seasonals = [0.0] * season_length
    for idx in range(season_length):
        total = 0.0
        count = 0
        for season_idx in range(seasons):
            value_index = season_idx * season_length + idx
            if value_index >= len(values):
                continue
            value = values[value_index]
            if not math.isfinite(value):
                continue
            total += value - (season_averages[season_idx] if season_idx < len(season_averages) else 0.0)
            count += 1
        seasonals[idx] = (total / count) if count else 0.0
    level = season_averages[0] if season_averages else values[0]
    trend = ((season_averages[1] - season_averages[0]) / season_length) if len(season_averages) > 1 else (((values[season_length] if season_length < len(values) else values[-1]) - values[0]) / max(season_length, 1))
    return {"level": level, "trend": trend, "seasonals": seasonals}


def _run_holt_winters(values: List[float], season_length: int, level_alpha: float, trend_beta: float, seasonal_gamma: float) -> Dict[str, Any]:
    sanitized = max(2, round(season_length))
    initial = _build_initial_seasonal_components(values, sanitized)
    level = float(initial["level"]) if math.isfinite(float(initial["level"])) else (values[0] if values else 0.0)
    trend = float(initial["trend"]) if math.isfinite(float(initial["trend"])) else 0.0
    seasonal = list(initial["seasonals"]) if isinstance(initial.get("seasonals"), list) else [0.0] * sanitized
    fitted: List[float] = []
    residuals: List[float] = []
    alpha_val = _clamp_unit_interval(level_alpha)
    beta_val = _clamp_unit_interval(trend_beta)
    gamma_val = _clamp_unit_interval(seasonal_gamma)
    for idx, actual in enumerate(values):
        season_index = idx % sanitized
        season_factor = seasonal[season_index] if season_index < len(seasonal) else 0.0
        fitted_value = level + trend + season_factor
        fitted.append(float(fitted_value))
        resid = actual - fitted_value if math.isfinite(actual) else 0.0
        residuals.append(float(resid))
        prev_level = level
        level = alpha_val * (actual - season_factor) + (1 - alpha_val) * (level + trend)
        trend = beta_val * (level - prev_level) + (1 - beta_val) * trend
        seasonal[season_index] = gamma_val * (actual - level) + (1 - gamma_val) * season_factor
    return {"fitted": fitted, "residuals": residuals, "level": float(level), "trend": float(trend), "seasonals": [float(v) for v in seasonal]}


def _auto_tune_holt_winters(values: List[float], season_length: int, options: Dict[str, Any]) -> Dict[str, Any] | None:
    criterion = "aic" if options.get("criterion") == "aic" else "bic"
    candidates = options.get("gridValues") if isinstance(options.get("gridValues"), list) and options.get("gridValues") else [0.2, 0.4, 0.6, 0.8]
    best: Dict[str, Any] | None = None
    for alpha_candidate in candidates:
        for beta_candidate in candidates:
            for gamma_candidate in candidates:
                execution = _run_holt_winters(values, season_length, float(alpha_candidate), float(beta_candidate), float(gamma_candidate))
                residuals = execution["residuals"][season_length:]
                if not residuals:
                    continue
                sse = float(sum(val * val for val in residuals))
                sigma_sq = sse / max(len(residuals), 1)
                if not math.isfinite(sigma_sq) or sigma_sq <= 0:
                    continue
                k = season_length + 3
                log_likelihood = -0.5 * len(residuals) * (math.log(2 * math.pi) + math.log(sigma_sq) + 1)
                aic = 2 * k - 2 * log_likelihood
                bic = math.log(len(residuals)) * k - 2 * log_likelihood
                score = aic if criterion == "aic" else bic
                if best is None or score < best["score"]:
                    best = {"alpha": float(alpha_candidate), "beta": float(beta_candidate), "gamma": float(gamma_candidate), "score": score, "aic": aic, "bic": bic}
    return best


def regression_holt_winters(payload: Dict[str, Any]) -> Dict[str, Any]:
    x, y = _prepare_xy(payload)
    if x.size < 4:
        return {"valid": False, "message": "Insufficient data for Holt-Winters."}
    order = np.argsort(x)
    x = x[order]
    y = y[order]
    x_vals = [float(val) for val in x.tolist()]
    y_vals = [float(val) for val in y.tolist()]
    forecast = payload.get("forecast") if isinstance(payload.get("forecast"), dict) else {}
    season_length = _clamp_positive_int(forecast.get("seasonLength"), min_value=2, max_value=max(2, len(y_vals) // 2), fallback=12)
    horizon = _clamp_positive_int(forecast.get("horizon"), min_value=1, max_value=120, fallback=max(1, round(len(y_vals) * 0.25)))
    auto_tune = bool(forecast.get("autoTune"))
    tuned = _auto_tune_holt_winters(y_vals, season_length, forecast) if auto_tune else None
    level_alpha = _clamp_unit_interval((tuned or {}).get("alpha", forecast.get("level", 0.2)))
    trend_beta = _clamp_unit_interval((tuned or {}).get("beta", forecast.get("trend", 0.1)))
    seasonal_gamma = _clamp_unit_interval((tuned or {}).get("gamma", forecast.get("seasonal", 0.1)))
    execution = _run_holt_winters(y_vals, season_length, level_alpha, trend_beta, seasonal_gamma)
    residuals = execution["residuals"][season_length:]
    fitted = execution["fitted"]
    if not residuals:
        return {"valid": False, "message": "No residuals available for Holt-Winters."}
    actual_for_errors = y_vals[season_length:]
    predicted_for_errors = fitted[season_length:]
    sse = float(sum(val * val for val in residuals))
    sigma_sq = sse / max(len(residuals), 1)
    sigma = math.sqrt(max(sigma_sq, 0.0))
    y_mean = float(np.mean(y_vals))
    sst = float(sum((value - y_mean) ** 2 for value in y_vals))
    r2 = 1.0 if sst == 0 else float(1 - (sse / sst))
    k = season_length + 3
    adj_r2 = float(1 - (1 - r2) * ((len(residuals) - 1) / (len(residuals) - k - 1))) if len(residuals) > k else r2
    log_likelihood = -0.5 * len(residuals) * (math.log(2 * math.pi) + math.log(sigma_sq) + 1)
    spacing = _compute_average_spacing(x_vals)
    last_x = x_vals[-1]
    z_critical = float(stats.norm.ppf(0.975))
    forecast_points = []
    for h_idx in range(1, horizon + 1):
        season_index = (len(y_vals) + h_idx - 1) % season_length
        seasonal = execution["seasonals"][season_index] if season_index < len(execution["seasonals"]) else 0.0
        forecast_value = execution["level"] + h_idx * execution["trend"] + seasonal
        inflation = math.sqrt(1 + (h_idx / season_length))
        std_err = sigma * inflation
        x_value = (last_x + spacing * h_idx) if math.isfinite(spacing) else (last_x + h_idx)
        forecast_points.append({
            "x": float(x_value),
            "y": float(forecast_value),
            "lower": float(forecast_value - z_critical * std_err),
            "upper": float(forecast_value + z_critical * std_err),
            "stdErr": float(std_err),
            "seasonal": float(seasonal),
        })
    parameters: Dict[str, Any] = {
        "Level": float(execution["level"]),
        "Trend": float(execution["trend"]),
        "Season length": int(season_length),
        "Horizon": int(horizon),
        "Level α": float(level_alpha),
        "Trend β": float(trend_beta),
        "Season γ": float(seasonal_gamma),
    }
    for idx, value in enumerate(execution["seasonals"][: min(season_length, 6)]):
        parameters[f"Seasonal {idx + 1}"] = float(value)
    return {
        "valid": True,
        "coefficients": [],
        "metrics": {
            "sse": sse,
            "sst": sst,
            "r2": r2,
            "adjR2": adj_r2,
            "rmse": float(math.sqrt(sse / len(residuals))),
            "mae": float(sum(abs(val) for val in residuals) / len(residuals)),
            "mape": _compute_mape(actual_for_errors, predicted_for_errors),
            "smape": _compute_smape(actual_for_errors, predicted_for_errors),
            "aic": float(2 * k - 2 * log_likelihood),
            "bic": float(math.log(len(residuals)) * k - 2 * log_likelihood),
            "horizon": int(horizon),
        },
        "forecast": {"horizon": int(horizon), "seasonLength": int(season_length), "points": forecast_points},
        "summary": {"parameters": parameters, "primaryParameter": {"label": "Trend", "value": float(execution["trend"])}},
    }


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


def _has_duplicate_values(values: List[float]) -> bool:
    seen = set()
    for value in values:
        key = float(value)
        if key in seen:
            return True
        seen.add(key)
    return False


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
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    t_crit = float(stats.t.ppf(1 - alpha / 2, df)) if math.isfinite(df) and df > 0 else float("nan")
    ci_half = t_crit * se if math.isfinite(t_crit) and math.isfinite(se) else float("nan")
    return {
        "available": True,
        "t": t_stat,
        "df": df,
        "p": p_value,
        "se": se,
        "diff": diff,
        "meanA": ma,
        "meanB": mb,
        "ciLow": diff - ci_half if math.isfinite(ci_half) else float("nan"),
        "ciHigh": diff + ci_half if math.isfinite(ci_half) else float("nan"),
        "ciLevel": 1 - alpha,
        "alternative": alternative,
    }


def box_ttest_equal_variance(payload: Dict[str, Any]) -> Dict[str, Any]:
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
    df = float(na + nb - 2)
    pooled_variance = (((na - 1) * va) + ((nb - 1) * vb)) / max(df, 1.0)
    se = math.sqrt(max(pooled_variance, 0.0) * ((1.0 / na) + (1.0 / nb)))
    diff = ma - mb
    if se == 0:
        if diff == 0:
            t_stat = 0.0
            p_value = 1.0
        else:
            t_stat = float("inf") if diff > 0 else float("-inf")
            p_value = _p_from_t_stat(t_stat, df, alternative)
    else:
        t_stat = diff / se
        p_value = _p_from_t_stat(t_stat, df, alternative)
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    t_crit = float(stats.t.ppf(1 - alpha / 2, df)) if math.isfinite(df) and df > 0 else float("nan")
    ci_half = t_crit * se if math.isfinite(t_crit) and math.isfinite(se) else float("nan")
    return {
        "available": True,
        "t": t_stat,
        "df": df,
        "p": p_value,
        "se": se,
        "diff": diff,
        "meanA": ma,
        "meanB": mb,
        "ciLow": diff - ci_half if math.isfinite(ci_half) else float("nan"),
        "ciHigh": diff + ci_half if math.isfinite(ci_half) else float("nan"),
        "ciLevel": 1 - alpha,
        "alternative": alternative,
    }


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
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    t_crit = float(stats.t.ppf(1 - alpha / 2, n - 1)) if n > 1 else float("nan")
    ci_half = t_crit * se if math.isfinite(t_crit) and math.isfinite(se) else float("nan")
    return {
        "available": True,
        "t": t_stat,
        "df": float(n - 1),
        "p": p_value,
        "diff": mean_diff,
        "se": se,
        "ciLow": mean_diff - ci_half if math.isfinite(ci_half) else float("nan"),
        "ciHigh": mean_diff + ci_half if math.isfinite(ci_half) else float("nan"),
        "ciLevel": 1 - alpha,
        "alternative": alternative,
    }


def box_ratio_ttest(payload: Dict[str, Any]) -> Dict[str, Any]:
    a, b = _clean_paired_vectors(payload.get("a"), payload.get("b"))
    pairs = [(x, y) for x, y in zip(a, b) if x > 0 and y > 0]
    if len(pairs) < 2:
        return {"available": False, "message": "Ratio t test requires at least two paired positive observations."}
    log_ratios = [math.log(x / y) for x, y in pairs]
    result = box_ttest_one_sample({
        "values": log_ratios,
        "nullValue": 0.0,
        "alternative": payload.get("alternative"),
    })
    if not result.get("available"):
        return result
    ci_low = result.get("ciLow")
    ci_high = result.get("ciHigh")
    return {
        **result,
        "ratio": float(math.exp(result["mean"])) if _is_finite_number(result.get("mean")) else float("nan"),
        "diff": float(math.exp(result["mean"])) if _is_finite_number(result.get("mean")) else float("nan"),
        "meanDiff": float(math.exp(result["mean"])) if _is_finite_number(result.get("mean")) else float("nan"),
        "ciLow": float(math.exp(ci_low)) if _is_finite_number(ci_low) else None,
        "ciHigh": float(math.exp(ci_high)) if _is_finite_number(ci_high) else None,
        "scale": "ratio",
        "validPairs": len(pairs),
    }


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
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    t_crit = float(stats.t.ppf(1 - alpha / 2, n - 1)) if n > 1 else float("nan")
    ci_half = t_crit * se if math.isfinite(t_crit) else float("nan")
    return {
        "available": True,
        "t": t_stat,
        "df": float(n - 1),
        "p": p_value,
        "diff": diff,
        "se": se,
        "mean": mean_val,
        "sd": sd,
        "ciLow": mean_val - ci_half if math.isfinite(ci_half) else float("nan"),
        "ciHigh": mean_val + ci_half if math.isfinite(ci_half) else float("nan"),
        "ciLevel": 1 - alpha,
        "alternative": alternative,
    }


def _box_require_positive_groups(groups: List[List[float]], message: str) -> Tuple[bool, Dict[str, Any]]:
    if any(any(value <= 0 for value in group) for group in groups):
        return False, {"available": False, "message": message}
    return True, {}


def _convert_lognormal_two_group_result(result: Dict[str, Any], a: List[float], b: List[float]) -> Dict[str, Any]:
    mean_a_log = float(np.mean(np.log(np.asarray(a, dtype=float))))
    mean_b_log = float(np.mean(np.log(np.asarray(b, dtype=float))))
    ratio = math.exp(mean_a_log - mean_b_log)
    ci_low = result.get("ciLow")
    ci_high = result.get("ciHigh")
    return {
        **result,
        "ratio": ratio,
        "diff": ratio,
        "meanDiff": ratio,
        "meanA": float(math.exp(mean_a_log)),
        "meanB": float(math.exp(mean_b_log)),
        "ciLow": float(math.exp(ci_low)) if _is_finite_number(ci_low) else None,
        "ciHigh": float(math.exp(ci_high)) if _is_finite_number(ci_high) else None,
        "scale": "ratio",
    }


def box_lognormal_ttest_equal_variance(payload: Dict[str, Any]) -> Dict[str, Any]:
    a = _clean_vector(payload.get("a"))
    b = _clean_vector(payload.get("b"))
    if len(a) < 2 or len(b) < 2:
        return {"available": False, "message": "Need at least two observations per group."}
    ok, failure = _box_require_positive_groups([a, b], "Lognormal t tests require strictly positive values in both groups.")
    if not ok:
        return failure
    result = box_ttest_equal_variance({
        "a": [math.log(v) for v in a],
        "b": [math.log(v) for v in b],
        "alternative": payload.get("alternative"),
    })
    return _convert_lognormal_two_group_result(result, a, b) if result.get("available") else result


def box_lognormal_ttest_welch(payload: Dict[str, Any]) -> Dict[str, Any]:
    a = _clean_vector(payload.get("a"))
    b = _clean_vector(payload.get("b"))
    if len(a) < 2 or len(b) < 2:
        return {"available": False, "message": "Need at least two observations per group."}
    ok, failure = _box_require_positive_groups([a, b], "Lognormal Welch t tests require strictly positive values in both groups.")
    if not ok:
        return failure
    result = box_ttest_welch({
        "a": [math.log(v) for v in a],
        "b": [math.log(v) for v in b],
        "alternative": payload.get("alternative"),
    })
    return _convert_lognormal_two_group_result(result, a, b) if result.get("available") else result


def box_mann_whitney(payload: Dict[str, Any]) -> Dict[str, Any]:
    a = _clean_vector(payload.get("a"))
    b = _clean_vector(payload.get("b"))
    if not a or not b:
        return {"available": False, "message": "Need at least one observation per group."}
    alternative = _resolve_alternative(payload.get("alternative"))
    resampling_mode = str(payload.get("resamplingMode") or "auto").strip().lower()
    has_ties = _has_duplicate_values(a + b)
    exact_eligible = (not has_ties) and ((len(a) + len(b)) <= 20)
    method = "exact" if (resampling_mode != "asymptotic" and exact_eligible) else "asymptotic"
    result = stats.mannwhitneyu(a, b, alternative=alternative, method=method, use_continuity=True)
    u1 = float(result.statistic)
    u2 = float(len(a) * len(b) - u1)
    return {"available": True, "U1": u1, "U2": u2, "U": min(u1, u2), "p": float(result.pvalue), "method": method}


def box_wilcoxon_signed_rank(payload: Dict[str, Any]) -> Dict[str, Any]:
    a, b = _clean_paired_vectors(payload.get("a"), payload.get("b"))
    if not a:
        return {"available": False, "message": "Need at least one paired value."}
    alternative = _resolve_alternative(payload.get("alternative"))
    diffs = np.asarray([x - y for x, y in zip(a, b)], dtype=float)
    if np.allclose(diffs, 0):
        return {"available": True, "W": 0.0, "p": 1.0}
    resampling_mode = str(payload.get("resamplingMode") or "auto").strip().lower()
    ranks = _rankdata_average(np.abs(diffs).tolist())
    has_ties = _has_duplicate_values(ranks.tolist())
    exact_eligible = (not has_ties) and diffs.size <= 25
    method = "approx" if resampling_mode == "asymptotic" else ("exact" if exact_eligible else "approx")
    try:
        result = stats.wilcoxon(diffs, zero_method="wilcox", correction=True, alternative=alternative, method=method)
    except TypeError:
        result = stats.wilcoxon(diffs, zero_method="wilcox", correction=True, alternative=alternative, mode=method)
    return {"available": True, "W": float(result.statistic), "p": float(result.pvalue), "method": method}


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
    ranks = _rankdata_average(np.abs(non_zero).tolist())
    has_ties = _has_duplicate_values(ranks.tolist())
    exact_eligible = (not has_ties) and non_zero.size <= 25
    method = "approx" if resampling_mode == "asymptotic" else ("exact" if exact_eligible else "approx")
    try:
        result = stats.wilcoxon(non_zero, zero_method="wilcox", correction=True, alternative=alternative, method=method)
    except TypeError:
        result = stats.wilcoxon(non_zero, zero_method="wilcox", correction=True, alternative=alternative, mode=method)
    return {"available": True, "W": float(result.statistic), "p": float(result.pvalue), "method": method}


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


def box_welch_anova(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    groups = [group for group in groups if len(group) > 0]
    if len(groups) < 2:
        return {"available": False, "message": "Need at least two groups."}
    if any(len(group) < 2 for group in groups):
        return {"available": False, "message": "Need at least two observations per group."}
    k = len(groups)
    counts = [len(group) for group in groups]
    means = [float(np.mean(group)) for group in groups]
    variances = []
    for group, mean_val in zip(groups, means):
        variance = float(np.var(group, ddof=1))
        variances.append(variance if variance > 0 else float(np.finfo(float).eps))
    weights = [counts[idx] / variances[idx] for idx in range(k)]
    weight_sum = float(sum(weights))
    if not math.isfinite(weight_sum) or weight_sum <= 0:
        return {"available": False, "message": "Unable to normalize Welch weights."}
    mean_weighted = sum(weights[idx] * means[idx] for idx in range(k)) / weight_sum
    between = 0.0
    sum_term = 0.0
    for idx in range(k):
        mean_diff = means[idx] - mean_weighted
        between += weights[idx] * mean_diff * mean_diff
        weight_frac = weights[idx] / weight_sum
        sum_term += ((1 - weight_frac) ** 2) / max(counts[idx] - 1, 1)
    df1 = float(k - 1)
    numerator = between / max(df1, 1.0)
    correction_denom = (k ** 2) - 1
    correction = 1 + ((2 * (k - 2) / correction_denom) * sum_term) if correction_denom != 0 else 1.0
    f_stat = (numerator / correction) if correction > 0 else float("nan")
    df2_den = 3 * sum_term
    df2 = (((k ** 2) - 1) / df2_den) if df2_den > 0 else float("inf")
    p_value = float(1 - stats.f.cdf(f_stat, df1, df2)) if math.isfinite(f_stat) else 1.0
    return {"available": True, "F": f_stat, "p": p_value, "df1": df1, "df2": df2, "means": means, "counts": counts}


def box_lognormal_anova(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    groups = [group for group in groups if len(group) > 0]
    if len(groups) < 2:
        return {"available": False, "message": "Need at least two groups."}
    ok, failure = _box_require_positive_groups(groups, "Lognormal ANOVA requires strictly positive values in every included group.")
    if not ok:
        return failure
    result = box_anova({"groups": [[math.log(v) for v in group] for group in groups]})
    if not result.get("available"):
        return result
    return {
        **result,
        "lognormal": True,
        "means": [float(math.exp(np.mean(np.log(np.asarray(group, dtype=float))))) for group in groups],
        "counts": [len(group) for group in groups],
    }


def box_lognormal_welch_anova(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    groups = [group for group in groups if len(group) > 0]
    if len(groups) < 2:
        return {"available": False, "message": "Need at least two groups."}
    ok, failure = _box_require_positive_groups(groups, "Lognormal Welch ANOVA requires strictly positive values in every included group.")
    if not ok:
        return failure
    result = box_welch_anova({"groups": [[math.log(v) for v in group] for group in groups]})
    if not result.get("available"):
        return result
    return {
        **result,
        "lognormal": True,
        "means": [float(math.exp(np.mean(np.log(np.asarray(group, dtype=float))))) for group in groups],
        "counts": [len(group) for group in groups],
    }



def box_brown_forsythe(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    labels = payload.get("labels") or []
    groups = [group for group in groups if len(group) > 0]
    if len(groups) < 2:
        return {"method": "brown-forsythe", "statistic": None, "pValue": None, "passed": None, "df1": 0, "df2": 0, "sparkline": [], "reason": "Need >=2 groups"}
    deviations = [[abs(v - float(np.median(g))) for v in g] for g in groups]
    sparkline = [{"label": labels[i] if i < len(labels) else None, "value": float(np.mean(d))} for i, d in enumerate(deviations)]
    k = len(groups)
    total_n = sum(len(g) for g in groups)
    df1, df2 = k - 1, total_n - k
    if df2 <= 0:
        return {"method": "brown-forsythe", "statistic": None, "pValue": None, "passed": None, "df1": df1, "df2": max(df2, 0), "sparkline": sparkline, "reason": "Insufficient observations"}
    all_deviations = np.concatenate([np.asarray(d, dtype=float) for d in deviations])
    if np.allclose(all_deviations, all_deviations[0], rtol=0, atol=0):
        return {"method": "brown-forsythe", "statistic": None, "pValue": None, "passed": None, "df1": df1, "df2": df2, "sparkline": sparkline, "reason": "All absolute deviations are identical; the F statistic is undefined."}
    means = [float(np.mean(d)) for d in deviations]
    grand = float(np.mean(all_deviations))
    ss_between = sum(len(d) * (m - grand) ** 2 for d, m in zip(deviations, means))
    ss_within = sum(sum((v - m) ** 2 for v in d) for d, m in zip(deviations, means))
    ms_between = ss_between / df1
    ms_within = ss_within / df2
    f_stat = float("inf") if ms_within == 0 and ms_between > 0 else ms_between / ms_within
    p_value = 0.0 if math.isinf(f_stat) else float(stats.f.sf(f_stat, df1, df2))
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    return {"method": "brown-forsythe", "statistic": f_stat, "pValue": p_value, "passed": p_value >= alpha, "df1": df1, "df2": df2, "sparkline": sparkline}

def box_bartlett(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    labels = payload.get("labels") or []
    groups = [group for group in groups if len(group) > 0]
    if len(groups) < 2:
        return {"method": "bartlett", "statistic": None, "pValue": None, "passed": None, "df1": 0, "df2": 0, "sparkline": [], "reason": "Need >=2 groups"}
    if any(len(group) < 2 for group in groups):
        return {"method": "bartlett", "statistic": None, "pValue": None, "passed": None, "df1": len(groups) - 1, "df2": 0, "sparkline": [], "reason": "Each group needs at least two observations"}
    result = stats.bartlett(*groups)
    counts = [len(group) for group in groups]
    total_n = sum(counts)
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    variances = [float(np.var(group, ddof=1)) for group in groups]
    return {
        "method": "bartlett",
        "statistic": float(result.statistic),
        "pValue": float(result.pvalue),
        "passed": float(result.pvalue) >= alpha,
        "df1": len(groups) - 1,
        "df2": total_n - len(groups),
        "sparkline": [{"label": labels[idx] if idx < len(labels) else None, "value": variances[idx]} for idx in range(len(groups))],
    }


def box_lognormal_comparison(payload: Dict[str, Any]) -> Dict[str, Any]:
    values = _clean_vector(payload.get("values"))
    if len(values) < 2:
        return {"valid": False}
    normal_fit = fit_distribution("normal", values)
    lognormal_fit = fit_distribution("lognormal", values)
    if not normal_fit.get("valid") or not lognormal_fit.get("valid"):
        return {"valid": False}
    n = len(values)

    def _aicc(log_likelihood: Any, parameter_count: int) -> float:
        if not _is_finite_number(log_likelihood):
            return float("nan")
        k = max(1, int(parameter_count))
        if n <= k + 1:
            return float("nan")
        aic = (2 * k) - (2 * float(log_likelihood))
        return float(aic + ((2 * k * (k + 1)) / max(n - k - 1, 1)))

    normal_aicc = _aicc(normal_fit.get("logLikelihood"), 2)
    lognormal_aicc = _aicc(lognormal_fit.get("logLikelihood"), 2)
    preferred = "lognormal" if math.isfinite(lognormal_aicc) and (not math.isfinite(normal_aicc) or lognormal_aicc < normal_aicc) else "normal"
    delta = abs(normal_aicc - lognormal_aicc) if math.isfinite(normal_aicc) and math.isfinite(lognormal_aicc) else float("nan")
    return {
        "valid": True,
        "preferred": preferred,
        "normalAicc": normal_aicc,
        "lognormalAicc": lognormal_aicc,
        "deltaAicc": delta,
    }


def box_linear_trend(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = payload.get("groups") or []
    labels = payload.get("labels") or []
    alternative = _resolve_alternative(payload.get("alternative"))
    x_values: List[float] = []
    y_values: List[float] = []
    for group_idx, group in enumerate(groups):
        for value in _clean_vector(group):
            x_values.append(float(group_idx))
            y_values.append(float(value))
    if len(x_values) < 3:
        return {"available": False, "message": "Need at least three observations across ordered groups."}
    x = np.asarray(x_values, dtype=float)
    y = np.asarray(y_values, dtype=float)
    mean_x = float(np.mean(x))
    mean_y = float(np.mean(y))
    dx = x - mean_x
    dy = y - mean_y
    sxx = float(np.sum(dx * dx))
    sxy = float(np.sum(dx * dy))
    syy = float(np.sum(dy * dy))
    if not sxx > 0:
        return {"available": False, "message": "Ordered groups need more than one distinct position."}
    slope = sxy / sxx
    intercept = mean_y - (slope * mean_x)
    residuals = y - (intercept + (slope * x))
    df = max(len(x_values) - 2, 1)
    mse = float(np.sum(residuals * residuals) / df)
    se_slope = math.sqrt(mse / sxx)
    t_stat = slope / se_slope if se_slope > 0 else float("nan")
    p_value = _p_from_t_stat(t_stat, df, alternative) if math.isfinite(t_stat) else float("nan")
    r_squared = max(0.0, min(1.0, (sxy * sxy) / (sxx * syy))) if syy > 0 else float("nan")
    return {"available": True, "slope": slope, "intercept": intercept, "t": t_stat, "df": float(df), "p": p_value, "rSquared": r_squared, "order": list(labels)}



def box_tamhane_t2(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    labels = payload.get("labels") or []
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    if len(groups) < 2 or any(len(group) < 2 for group in groups):
        return {"ok": False, "message": "Welch pairwise comparisons require at least two groups and two observations per group."}
    pair_count = len(groups) * (len(groups) - 1) // 2
    sidak_alpha = 1 - (1 - alpha) ** (1 / pair_count)
    pairs = []
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            raw = box_ttest_welch({"a": groups[i], "b": groups[j], "alternative": "two-sided"})
            p_raw = float(raw["p"])
            adjusted = -math.expm1(pair_count * math.log1p(-p_raw)) if p_raw < 1 else 1.0
            pairs.append({
                "i": i, "j": j,
                "groupA": labels[i] if i < len(labels) else f"Group {i + 1}",
                "groupB": labels[j] if j < len(labels) else f"Group {j + 1}",
                "diff": float(raw["diff"]), "t": float(raw["t"]), "df": float(raw["df"]),
                "p": p_raw, "adjustedP": _clamp_unit(adjusted), "significant": adjusted <= alpha,
            })
    return {
        "ok": True, "method": "welch-pairwise-sidak", "pairs": pairs,
        "sidakAlpha": sidak_alpha,
        "footnote": "Pairwise Welch t tests with Sidak family-wise adjustment.",
    }


def box_tukey_hsd(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    labels = payload.get("labels") or []
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    if len(groups) < 2 or any(len(g) < 2 for g in groups):
        return {"ok": False, "message": "Tukey HSD requires at least two groups with at least two observations each."}
    result = stats.tukey_hsd(*groups)
    k = len(groups)
    pairs = []
    for i in range(k):
        for j in range(i + 1, k):
            ci = result.confidence_interval(confidence_level=1-alpha)
            pairs.append({
                "i": i, "j": j,
                "groupA": labels[i] if i < len(labels) else f"Group {i+1}",
                "groupB": labels[j] if j < len(labels) else f"Group {j+1}",
                "diff": float(np.mean(groups[i]) - np.mean(groups[j])),
                "pAdj": float(result.pvalue[i, j]),
                "ciLow": float(ci.low[i, j]), "ciHigh": float(ci.high[i, j]),
                "significant": bool(result.pvalue[i, j] <= alpha),
            })
    return {"ok": True, "method": "tukey-hsd", "pairs": pairs}


def box_games_howell(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(group) for group in (payload.get("groups") or [])]
    labels = payload.get("labels") or []
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    if len(groups) < 2 or any(len(g) < 2 for g in groups):
        return {"ok": False, "message": "Games-Howell requires at least two groups with at least two observations each."}
    k = len(groups)
    means = [float(np.mean(g)) for g in groups]
    variances = [float(np.var(g, ddof=1)) for g in groups]
    ns = [len(g) for g in groups]
    pairs = []
    for i in range(k):
        for j in range(i + 1, k):
            vi = variances[i] / ns[i]
            vj = variances[j] / ns[j]
            welch_se = math.sqrt(vi + vj)
            diff = means[i] - means[j]
            df = (vi + vj) ** 2 / ((vi ** 2)/(ns[i]-1) + (vj ** 2)/(ns[j]-1))
            q = math.sqrt(2) * abs(diff) / welch_se if welch_se > 0 else float("inf")
            pval = float(stats.studentized_range.sf(q, k, df))
            qcrit = float(stats.studentized_range.ppf(1-alpha, k, df))
            half = qcrit * welch_se / math.sqrt(2)
            pairs.append({
                "i": i, "j": j,
                "groupA": labels[i] if i < len(labels) else f"Group {i+1}",
                "groupB": labels[j] if j < len(labels) else f"Group {j+1}",
                "diff": diff, "q": q, "df": df, "p": pval,
                "ciLow": diff-half, "ciHigh": diff+half,
                "significant": pval <= alpha,
            })
    return {"ok": True, "method": "games-howell", "pairs": pairs}


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
    resampling_mode = str(payload.get("resamplingMode") or "auto").strip().lower()
    k = len(groups)
    n = size
    row_ranks = []
    rank_sums = np.zeros(k, dtype=float)
    tie_term_sum = 0.0
    for row_idx in range(n):
        row_values = [group[row_idx] for group in groups]
        ranks = _rankdata_average(row_values)
        row_ranks.append(ranks.tolist())
        _, counts = np.unique(np.asarray(row_values, dtype=float), return_counts=True)
        tie_term_sum += float(sum((count ** 3) - count for count in counts if count > 1))
        rank_sums += ranks
    q_stat = float((12 / (n * k * (k + 1))) * np.sum(rank_sums ** 2) - (3 * n * (k + 1)))
    tie_correction = 1.0
    if tie_term_sum > 0:
        denom = n * k * ((k * k) - 1)
        if denom > 0:
            tie_correction = 1 - (tie_term_sum / denom)
        if tie_correction > 0:
            q_stat /= tie_correction
    exact_eligible = (tie_term_sum == 0) and ((math.factorial(k) ** n) <= 200000)
    if resampling_mode != "asymptotic" and exact_eligible:
        permutations = list(itertools.permutations(range(1, k + 1)))
        total = 0
        hits = 0
        for assignment in itertools.product(permutations, repeat=n):
            sums = np.sum(np.asarray(assignment, dtype=float), axis=0)
            sim_q = float((12 / (n * k * (k + 1))) * np.sum(sums ** 2) - (3 * n * (k + 1)))
            total += 1
            if sim_q >= q_stat - 1e-12:
                hits += 1
        p_value = hits / max(total, 1)
        return {"available": True, "Q": q_stat, "p": float(p_value), "df": k - 1, "method": "exact"}
    result = stats.friedmanchisquare(*groups)
    return {"available": True, "Q": float(result.statistic), "p": float(result.pvalue), "df": k - 1, "method": "asymptotic"}


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


def box_kolmogorov_smirnov(payload: Dict[str, Any]) -> Dict[str, Any]:
    a = _clean_vector(payload.get("a"))
    b = _clean_vector(payload.get("b"))
    if not a or not b:
        return {"available": False, "message": "Need at least one observation per group."}
    result = stats.ks_2samp(a, b, alternative="two-sided", method="asymp")
    return {"available": True, "D": float(result.statistic), "p": float(result.pvalue), "method": "asymptotic"}


def _quantile_linear(values: np.ndarray, q: float) -> float:
    try:
        return float(np.quantile(values, q, method="linear"))
    except TypeError:
        return float(np.quantile(values, q, interpolation="linear"))


def hist_descriptive_summary(payload: Dict[str, Any]) -> Dict[str, Any]:
    values = _clean_vector(payload.get("values"))
    if not values:
        return {"available": False, "message": "Need at least one numeric value."}
    arr = np.asarray(sorted(values), dtype=float)
    n = int(arr.size)
    mean = float(np.mean(arr))
    median = float(np.median(arr))
    variance = float(np.var(arr, ddof=1)) if n > 1 else float("nan")
    sd = float(math.sqrt(variance)) if math.isfinite(variance) and variance >= 0 else float("nan")
    sem = float(sd / math.sqrt(n)) if n > 1 and math.isfinite(sd) else float("nan")
    q1 = _quantile_linear(arr, 0.25)
    q3 = _quantile_linear(arr, 0.75)
    iqr = float(q3 - q1)
    cv = float((sd / abs(mean)) * 100.0) if math.isfinite(sd) and mean != 0 else float("nan")
    skewness = float("nan")
    kurtosis = float("nan")
    if n >= 3 and math.isfinite(sd) and sd > 0:
        z = (arr - mean) / sd
        z3 = float(np.sum(z ** 3))
        skewness = float((n / ((n - 1) * (n - 2))) * z3)
        if n >= 4:
            z4 = float(np.sum(z ** 4))
            kurtosis = float(((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * z4 - ((3 * (n - 1) ** 2) / ((n - 2) * (n - 3))))
    strictly_positive = bool(np.all(arr > 0))
    geometric_mean = float(math.exp(np.mean(np.log(arr)))) if strictly_positive else float("nan")
    harmonic_mean = float(n / np.sum(1.0 / arr)) if strictly_positive else float("nan")
    return {
        "available": True,
        "n": n,
        "mean": mean,
        "median": median,
        "variance": variance,
        "sd": sd,
        "sem": sem,
        "min": float(arr[0]),
        "q1": q1,
        "q3": q3,
        "max": float(arr[-1]),
        "iqr": iqr,
        "cv": cv,
        "skewness": skewness,
        "kurtosis": kurtosis,
        "geometricMean": geometric_mean,
        "harmonicMean": harmonic_mean,
    }


def _compute_aicc(log_likelihood: float, parameter_count: int, sample_size: int) -> float:
    if not math.isfinite(log_likelihood) or sample_size <= parameter_count + 1:
        return float("nan")
    aic = (2 * parameter_count) - (2 * log_likelihood)
    return float(aic + ((2 * parameter_count * (parameter_count + 1)) / max(sample_size - parameter_count - 1, 1)))


def hist_lognormal_comparison(payload: Dict[str, Any]) -> Dict[str, Any]:
    values = _clean_vector(payload.get("values"))
    if len(values) < 2:
        return {"available": False, "message": "Need at least two numeric values."}
    normal_fit = fit_distribution("normal", values)
    lognormal_fit = fit_distribution("lognormal", values)
    normal_aicc = _compute_aicc(float(normal_fit.get("logLikelihood", float("nan"))), 2, len(values))
    lognormal_aicc = _compute_aicc(float(lognormal_fit.get("logLikelihood", float("nan"))), 2, len(values))
    preferred = "lognormal" if math.isfinite(lognormal_aicc) and (not math.isfinite(normal_aicc) or lognormal_aicc < normal_aicc) else "normal"
    delta = abs(normal_aicc - lognormal_aicc) if math.isfinite(normal_aicc) and math.isfinite(lognormal_aicc) else float("nan")
    return {
        "available": True,
        "preferred": preferred,
        "normalAicc": float(normal_aicc),
        "lognormalAicc": float(lognormal_aicc),
        "deltaAicc": float(delta),
    }


def hist_kolmogorov_smirnov(payload: Dict[str, Any]) -> Dict[str, Any]:
    a = _clean_vector(payload.get("a"))
    b = _clean_vector(payload.get("b"))
    if not a or not b:
        return {"available": False, "message": "Need at least one observation per group."}
    result = stats.ks_2samp(a, b, alternative="two-sided", method="asymp")
    return {"available": True, "D": float(result.statistic), "p": float(result.pvalue), "method": "asymptotic"}


def pie_chi_square(payload: Dict[str, Any]) -> Dict[str, Any]:
    observed = _clean_vector(payload.get("observed"))
    expected = _clean_vector(payload.get("expected"))
    if not observed or len(observed) != len(expected) or any(exp <= 0 for exp in expected):
        return {"available": False, "message": "Observed and expected must be same length, with expected > 0."}
    result = stats.chisquare(f_obs=observed, f_exp=expected)
    return {"available": True, "chi2": float(result.statistic), "p": float(result.pvalue), "df": len(observed) - 1}


def _sanitize_pie_test_method(raw: Any) -> str:
    method = str(raw or "chi-square").strip().lower()
    if method in {"chi-square", "g-test", "auto"}:
        return method
    return "chi-square"


def _sanitize_sparse_threshold(raw: Any) -> int:
    try:
        numeric = int(math.floor(float(raw)))
    except Exception:
        return 5
    return max(1, min(100, numeric))



def pie_gof_test(payload: Dict[str, Any]) -> Dict[str, Any]:
    observed = _clean_vector(payload.get("observed"))
    expected = _clean_vector(payload.get("expected"))
    if not observed or len(observed) != len(expected):
        return {"ok": False, "message": "Observed and expected vectors must be non-empty and have the same length."}
    if any(v < 0 for v in observed) or any(v <= 0 for v in expected):
        return {"ok": False, "message": "Observed values must be non-negative and expected counts must be positive."}
    observed_total = float(sum(observed))
    expected_total = float(sum(expected))
    tolerance = max(1e-9, 1e-9 * max(observed_total, expected_total, 1.0))
    if abs(observed_total - expected_total) > tolerance:
        return {"ok": False, "message": "Expected counts must sum to the observed total."}
    method = _sanitize_pie_test_method(payload.get("method"))
    test_method = "chi-square" if method == "auto" else method
    pearson = float(sum((o-e)**2/e for o,e in zip(observed, expected)))
    g2 = float(2 * sum(o * math.log(o/e) for o,e in zip(observed, expected) if o > 0))
    statistic = g2 if test_method == "g-test" else pearson
    df = len(observed)-1
    p_value = float(stats.chi2.sf(statistic, df))
    cohens_w = math.sqrt(pearson / observed_total) if observed_total > 0 else float("nan")
    return {
        "ok": True, "method": test_method, "statistic": statistic,
        "pearsonStatistic": pearson, "gStatistic": g2, "df": df, "pValue": p_value,
        "total": observed_total, "categories": len(observed), "cohensW": cohens_w,
    }


def pie_contingency_test(payload: Dict[str, Any]) -> Dict[str, Any]:
    raw = payload.get("table")
    if not isinstance(raw, list) or len(raw) < 2:
        return {"ok": False, "message": "At least two rows are required."}
    try:
        table = np.asarray(raw, dtype=float)
    except Exception:
        return {"ok": False, "message": "Table rows must contain numeric counts."}
    if table.ndim != 2 or table.shape[0] < 2 or table.shape[1] < 2 or np.any(~np.isfinite(table)) or np.any(table < 0):
        return {"ok": False, "message": "A finite non-negative table of at least 2x2 is required."}
    if np.any(table.sum(axis=0) == 0) or np.any(table.sum(axis=1) == 0):
        return {"ok": False, "message": "Rows and columns with zero totals are not testable."}
    total = float(table.sum())
    method = _sanitize_pie_test_method(payload.get("method"))
    sparse_threshold = _sanitize_sparse_threshold(payload.get("sparseThreshold"))
    _, _, df, expected = stats.chi2_contingency(table, correction=False)
    sparse_count = int(np.sum(expected < sparse_threshold))
    auto_fisher = method == "auto" and table.shape == (2,2) and sparse_count > 0
    if auto_fisher or method == "fisher-exact":
        if table.shape != (2,2):
            return {"ok": False, "message": "Fisher exact is available only for 2x2 tables."}
        odds, pval = stats.fisher_exact(table, alternative="two-sided")
        pearson = float(stats.chi2_contingency(table, correction=False)[0])
        return {
            "ok": True, "method": "fisher-exact", "statistic": float(odds), "pValue": float(pval),
            "df": 1, "total": total, "rowCount": 2, "colCount": 2,
            "sparseCellCount": sparse_count, "sparseThreshold": sparse_threshold,
            "minExpected": float(expected.min()), "cramersV": math.sqrt(pearson/total),
            "pearsonStatistic": pearson, "yatesApplied": False,
        }
    test_method = "chi-square" if method == "auto" else method
    if test_method == "g-test":
        statistic, pval, df, expected = stats.chi2_contingency(table, correction=False, lambda_="log-likelihood")
    else:
        use_yates = bool(payload.get("yatesCorrection")) and table.shape == (2,2)
        statistic, pval, df, expected = stats.chi2_contingency(table, correction=use_yates)
    pearson = float(stats.chi2_contingency(table, correction=False)[0])
    min_dim = min(table.shape[0]-1, table.shape[1]-1)
    return {
        "ok": True, "method": test_method, "statistic": float(statistic), "pValue": float(pval), "df": int(df),
        "total": total, "rowCount": int(table.shape[0]), "colCount": int(table.shape[1]),
        "sparseCellCount": int(np.sum(expected < sparse_threshold)), "sparseThreshold": sparse_threshold,
        "minExpected": float(expected.min()), "cramersV": math.sqrt(pearson/(total*min_dim)),
        "pearsonStatistic": pearson,
        "yatesApplied": bool(test_method == "chi-square" and payload.get("yatesCorrection") and table.shape == (2,2)),
    }

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


def _sample_variance(values: List[float]) -> float:
    if len(values) <= 1:
        return 0.0
    return float(np.var(np.asarray(values, dtype=float), ddof=1))


def _resolve_z_critical(alpha: float) -> float:
    bounded = min(max(float(alpha), 1e-12), 0.5)
    return float(stats.norm.ppf(1 - (bounded / 2)))


def _wilson_interval(successes: float, total: float, alpha: float = 0.05) -> Dict[str, float] | None:
    if total <= 0:
        return None
    p_hat = successes / total
    z = _resolve_z_critical(alpha)
    z2_over_n = (z * z) / total
    denom = 1 + z2_over_n
    center = (p_hat + (z2_over_n / 2)) / denom
    margin = (z / denom) * math.sqrt(max((p_hat * (1 - p_hat) / total) + ((z * z) / (4 * total * total)), 0.0))
    return {"low": max(0.0, center - margin), "high": min(1.0, center + margin)}


def roc_auc_uncertainty(payload: Dict[str, Any]) -> Dict[str, Any]:
    pairs = _prepare_pairs(payload.get("pairs"))
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    positives = [pair["score"] for pair in pairs if pair["label"] == 1]
    negatives = [pair["score"] for pair in pairs if pair["label"] == 0]
    m = len(positives)
    n = len(negatives)
    if m < 1 or n < 1:
        return {"available": False, "message": "Need at least one positive and one negative score."}
    kernel = lambda pos, neg: 1.0 if pos > neg else (0.5 if pos == neg else 0.0)
    v10 = [sum(kernel(score, neg) for neg in negatives) / n for score in positives]
    v01 = [sum(kernel(pos, score) for pos in positives) / m for score in negatives]
    auc = sum(v10) / m
    variance = (_sample_variance(v10) / m) + (_sample_variance(v01) / n)
    se = math.sqrt(variance) if variance >= 0 else float("nan")
    z = _resolve_z_critical(alpha)
    ci_low = max(0.0, auc - (z * se)) if math.isfinite(se) else float("nan")
    ci_high = min(1.0, auc + (z * se)) if math.isfinite(se) else float("nan")
    return {"available": True, "auc": auc, "se": se, "ciLow": ci_low, "ciHigh": ci_high, "method": "DeLong-style"}


def roc_threshold_table(payload: Dict[str, Any]) -> Dict[str, Any]:
    pairs = _prepare_pairs(payload.get("pairs"))
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    if not pairs:
        return {"available": False, "message": "No valid pairs supplied."}
    sorted_pairs = sorted(pairs, key=lambda pair: pair["score"], reverse=True)
    positives = sum(1 for pair in sorted_pairs if pair["label"] == 1)
    negatives = len(sorted_pairs) - positives
    tp = 0
    fp = 0
    tn = negatives
    fn = positives
    rows = []
    index = 0
    while index < len(sorted_pairs):
        threshold = sorted_pairs[index]["score"]
        while index < len(sorted_pairs) and sorted_pairs[index]["score"] == threshold:
            current = sorted_pairs[index]
            if current["label"] == 1:
                tp += 1
                fn -= 1
            else:
                fp += 1
                tn -= 1
            index += 1
        sensitivity = (tp / positives) if positives > 0 else float("nan")
        specificity = (tn / negatives) if negatives > 0 else float("nan")
        ppv = (tp / (tp + fp)) if (tp + fp) > 0 else float("nan")
        npv = (tn / (tn + fn)) if (tn + fn) > 0 else float("nan")
        accuracy = ((tp + tn) / len(sorted_pairs)) if sorted_pairs else float("nan")
        lr_positive = (sensitivity / (1 - specificity)) if math.isfinite(sensitivity) and math.isfinite(specificity) and specificity < 1 else float("inf")
        lr_negative = ((1 - sensitivity) / specificity) if math.isfinite(sensitivity) and math.isfinite(specificity) and specificity > 0 else float("inf")
        rows.append({
            "threshold": threshold,
            "tp": tp,
            "fp": fp,
            "tn": tn,
            "fn": fn,
            "sensitivity": sensitivity,
            "specificity": specificity,
            "ppv": ppv,
            "npv": npv,
            "accuracy": accuracy,
            "lrPositive": lr_positive,
            "lrNegative": lr_negative,
            "sensitivityCi": _wilson_interval(tp, positives, alpha),
            "specificityCi": _wilson_interval(tn, negatives, alpha),
            "ppvCi": _wilson_interval(tp, tp + fp, alpha),
            "npvCi": _wilson_interval(tn, tn + fn, alpha),
        })
    return {"available": True, "rows": rows}


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
        p_value = float(stat.pvalue)
        p_method = "t approximation"
        has_ties = (_has_duplicate_values(x.tolist()) or _has_duplicate_values(y.tolist()))
        if bool(payload.get("exactPermutation")) and not has_ties and x.size <= 9:
            observed = abs(float(stat.statistic))
            ranks = list(range(1, int(x.size) + 1))
            total = 0
            extreme = 0
            denom = x.size * ((x.size ** 2) - 1)
            for perm in itertools.permutations(ranks):
                d2 = 0.0
                for idx, rank in enumerate(perm):
                    diff = (idx + 1) - rank
                    d2 += diff * diff
                perm_rho = 1 - ((6 * d2) / denom)
                total += 1
                if abs(perm_rho) >= observed - 1e-12:
                    extreme += 1
            if total > 0:
                p_value = extreme / total
                p_method = "exact permutation"
        return {"available": True, "method": "spearman", "r": float(stat.statistic), "p": p_value, "n": int(x.size), "pMethod": p_method}
    stat = stats.pearsonr(x, y)
    return {"available": True, "method": "pearson", "r": float(stat.statistic), "p": float(stat.pvalue), "n": int(x.size), "pMethod": "Student t approximation"}


def _prepare_survival_groups(series: Any) -> Tuple[List[List[Dict[str, Any]]], str | None]:
    if not isinstance(series, list) or len(series) < 2:
        return [], "Log-rank requires at least two groups."
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
        return [], "Each group must contain records."
    return groups, None


def _weighted_survival_logrank(groups: List[List[Dict[str, Any]]], label: str, weight_mode: str = "logrank", scores: List[float] | None = None) -> Dict[str, Any]:
    event_times = sorted({
        rec["time"]
        for group in groups
        for rec in group
        if rec["event"] and _is_finite_number(rec["time"])
    })
    if not event_times:
        return {"available": False, "message": f"No events detected for {label.lower()}."}

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
        weight = total_at_risk if weight_mode == "gehan" else 1.0
        if total_events > 0 and total_at_risk > 0:
            expected = (np.asarray(at_risk, dtype=float) / total_at_risk) * total_events
            diff += weight * (events - expected)
            if total_at_risk > 1:
                common = weight * weight * total_events * (total_at_risk - total_events) / (total_at_risk * (total_at_risk - 1))
                p = np.asarray(at_risk, dtype=float) / total_at_risk
                for i in range(k):
                    for j in range(k):
                        if i == j:
                            variance[i, j] += common * p[i] * (1 - p[i])
                        else:
                            variance[i, j] -= common * p[i] * p[j]
        at_risk = [max(0, int(at_risk[idx] - events[idx] - censored[idx])) for idx in range(k)]

    if scores is not None:
        score_vec = np.asarray(scores, dtype=float)
        numerator = float(score_vec @ diff)
        denom = float(score_vec @ variance @ score_vec)
        if denom <= 0:
            return {"available": False, "message": "Unable to estimate log-rank trend variance."}
        chi2 = (numerator * numerator) / denom
        p_value = float(1 - stats.chi2.cdf(chi2, 1))
        return {"available": True, "chi2": chi2, "df": 1, "p": p_value, "scores": list(scores)}

    df = k - 1
    if df <= 0:
        return {"available": False, "message": f"Invalid {label.lower()} degrees of freedom."}
    reduced = variance[:df, :df]
    inv = np.linalg.pinv(reduced)
    diff_vec = diff[:df]
    chi2 = float(diff_vec.T @ inv @ diff_vec)
    p_value = float(1 - stats.chi2.cdf(chi2, df))
    return {"available": True, "chi2": chi2, "df": df, "p": p_value}


def survival_logrank(payload: Dict[str, Any]) -> Dict[str, Any]:
    series = payload.get("series") or []
    groups, error = _prepare_survival_groups(series)
    if error:
        return {"available": False, "message": error}
    return _weighted_survival_logrank(groups, "Log-rank", "logrank")


def survival_gehan_breslow(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups, error = _prepare_survival_groups(payload.get("series") or [])
    if error:
        return {"available": False, "message": error}
    return _weighted_survival_logrank(groups, "Gehan-Breslow-Wilcoxon", "gehan")


def survival_logrank_trend(payload: Dict[str, Any]) -> Dict[str, Any]:
    series = payload.get("series") or []
    groups, error = _prepare_survival_groups(series)
    if error:
        return {"available": False, "message": error}
    if len(groups) < 3:
        return {"available": False, "message": "Trend test requires at least three ordered groups."}
    scores = [idx + 1 for idx in range(len(groups))]
    return _weighted_survival_logrank(groups, "Log-rank trend", "logrank", scores=scores)



def roc_mann_whitney(payload: Dict[str, Any]) -> Dict[str, Any]:
    pairs = _prepare_pairs(payload.get("pairs"))
    positives = [p["score"] for p in pairs if int(p["label"]) == 1]
    negatives = [p["score"] for p in pairs if int(p["label"]) == 0]
    if not positives or not negatives:
        return {"available": False, "message": "Both positive and negative observations are required."}
    requested = str(payload.get("method") or "auto").strip().lower()
    ties = len(set(positives + negatives)) < len(positives) + len(negatives)
    if requested == "exact" and ties:
        return {"available": False, "message": "Exact Mann-Whitney inference is unavailable when scores are tied."}
    if requested == "auto":
        method = "exact" if not ties and len(positives) * len(negatives) <= 10000 else "asymptotic"
    elif requested in {"exact", "asymptotic"}:
        method = requested
    else:
        raise ValueError("Mann-Whitney method must be auto, exact, or asymptotic.")
    result = stats.mannwhitneyu(
        positives,
        negatives,
        alternative=_resolve_alternative(payload.get("alternative")),
        method=method,
        use_continuity=(method == "asymptotic"),
    )
    u = float(result.statistic)
    auc = u / (len(positives) * len(negatives))
    return {
        "available": True, "method": method, "ties": ties,
        "u": u, "auc": auc, "pValue": float(result.pvalue),
        "nPositive": len(positives), "nNegative": len(negatives),
    }


def box_friedman_pairwise_maxstat(payload: Dict[str, Any]) -> Dict[str, Any]:
    groups = [_clean_vector(g) for g in (payload.get("groups") or [])]
    labels = payload.get("labels") or []
    if len(groups) < 3 or not groups or len(groups[0]) < 2 or any(len(g) != len(groups[0]) for g in groups):
        return {"ok": False, "message": "Equal paired group sizes and at least three groups are required."}
    k = len(groups)
    n = len(groups[0])
    rank_matrix = np.asarray([
        stats.rankdata([groups[j][i] for j in range(k)], method="average")
        for i in range(n)
    ], dtype=float)
    mean_ranks = rank_matrix.mean(axis=0)
    observed = {(i,j): abs(float(mean_ranks[i]-mean_ranks[j])) for i in range(k) for j in range(i+1,k)}
    mode = str(payload.get("resamplingMode") or "auto").lower()
    max_exact = int(payload.get("maxExact") or 200000)
    total_permutations = math.factorial(k) ** n
    exact = mode == "exact" or (mode == "auto" and total_permutations <= max_exact)
    iterations = int(payload.get("iterations") or 2000)
    seed = int(payload.get("seed") or 1337)
    exceed = {pair: 0 for pair in observed}
    used = 0
    permutations = list(itertools.permutations(range(k)))
    rng = np.random.default_rng(seed)

    def consume(permuted_rows):
        nonlocal used
        permuted = np.asarray(permuted_rows, dtype=float)
        perm_mean = permuted.mean(axis=0)
        max_stat = max(abs(float(perm_mean[i]-perm_mean[j])) for i in range(k) for j in range(i+1,k))
        for pair, stat_value in observed.items():
            exceed[pair] += int(max_stat >= stat_value - 1e-15)
        used += 1

    if exact:
        for choices in itertools.product(range(len(permutations)), repeat=n):
            consume([rank_matrix[row, permutations[choice]] for row, choice in enumerate(choices)])
    else:
        iterations = max(1, min(1_000_000, iterations))
        for _ in range(iterations):
            consume([rank_matrix[row, rng.permutation(k)] for row in range(n)])

    pairs = []
    for (i,j), stat_value in observed.items():
        pval = exceed[(i,j)] / used if exact else (exceed[(i,j)] + 1) / (used + 1)
        pairs.append({
            "i": i, "j": j,
            "groupA": labels[i] if i < len(labels) else f"Group {i+1}",
            "groupB": labels[j] if j < len(labels) else f"Group {j+1}",
            "meanRankDifference": float(mean_ranks[i]-mean_ranks[j]),
            "absoluteMeanRankDifference": stat_value,
            "p": float(pval), "adjustedP": float(pval),
        })
    return {
        "ok": True, "method": "friedman-pairwise-max-statistic-permutation",
        "resamplingMode": "exact" if exact else "monte-carlo",
        "iterations": used, "seed": None if exact else seed,
        "meanRanks": mean_ranks.tolist(), "pairs": pairs,
    }


def survival_kaplan_meier(payload: Dict[str, Any]) -> Dict[str, Any]:
    records = payload.get("records") or []
    cleaned = []
    for record in records:
        if not isinstance(record, dict):
            continue
        t = record.get("time")
        e = record.get("event")
        if _is_finite_number(t) and float(t) >= 0:
            cleaned.append((float(t), 1 if bool(e) else 0))
    if not cleaned:
        return {"available": False, "message": "No valid survival records."}
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    z = float(stats.norm.ppf(1-alpha/2))
    cleaned.sort()
    times = sorted(set(t for t,e in cleaned if e == 1))
    n_at_risk = len(cleaned)
    survival = 1.0
    greenwood_sum = 0.0
    points = [{"time": 0.0, "survival": 1.0, "lower": 1.0, "upper": 1.0, "atRisk": n_at_risk, "events": 0}]
    for time in sorted(set(t for t,e in cleaned)):
        at_risk = sum(1 for t,e in cleaned if t >= time)
        events = sum(1 for t,e in cleaned if t == time and e == 1)
        if events:
            survival *= (1-events/at_risk)
            if at_risk > events:
                greenwood_sum += events/(at_risk*(at_risk-events))
            if survival <= 0:
                lower = upper = 0.0
            elif survival >= 1 or greenwood_sum <= 0:
                lower = upper = survival
            else:
                log_neg_log = math.log(-math.log(survival))
                se_transform = math.sqrt(greenwood_sum)/abs(math.log(survival))
                lower = math.exp(-math.exp(log_neg_log + z*se_transform))
                upper = math.exp(-math.exp(log_neg_log - z*se_transform))
            points.append({
                "time": time, "survival": survival, "lower": lower, "upper": upper,
                "atRisk": at_risk, "events": events,
            })
    median = next((p["time"] for p in points if p["survival"] <= 0.5), None)
    return {"available": True, "n": len(cleaned), "events": sum(e for _,e in cleaned), "points": points, "median": median, "ciMethod": "log-log Greenwood"}


def survival_cox_efron(payload: Dict[str, Any]) -> Dict[str, Any]:
    if PHReg is None:
        raise RuntimeError("statsmodels is required for the Cox-regression oracle.")
    times = payload.get("time") or []
    events = payload.get("event") or []
    covariates = payload.get("covariates") or []
    n = min(len(times), len(events), len(covariates))
    rows = []
    excluded = 0
    for i in range(n):
        row = covariates[i]
        if not isinstance(row, (list, tuple)):
            row = [row]
        if not _is_finite_number(times[i]) or float(times[i]) < 0 or not all(_is_finite_number(v) for v in row):
            excluded += 1
            continue
        rows.append((float(times[i]), 1 if bool(events[i]) else 0, [float(v) for v in row]))
    if len(rows) < 3 or sum(r[1] for r in rows) == 0:
        return {"available": False, "message": "Insufficient valid Cox observations/events.", "excluded": excluded}
    endog = np.asarray([r[0] for r in rows], dtype=float)
    status = np.asarray([r[1] for r in rows], dtype=int)
    exog = np.asarray([r[2] for r in rows], dtype=float)
    if exog.ndim == 1:
        exog = exog[:,None]
    try:
        model = PHReg(endog, exog, status=status, ties="efron")
        fit = model.fit(disp=False)
    except Exception as exc:
        return {"available": False, "message": f"Cox Efron fit failed: {exc}", "excluded": excluded}
    params = np.asarray(fit.params, dtype=float)
    se = np.asarray(fit.bse, dtype=float)
    zvals = params/se
    pvals = 2*stats.norm.sf(np.abs(zvals))
    alpha = float(payload.get("alpha")) if _is_finite_number(payload.get("alpha")) else 0.05
    zcrit = float(stats.norm.ppf(1-alpha/2))
    return {
        "available": True, "ties": "efron", "n": len(rows), "events": int(status.sum()), "excluded": excluded,
        "coefficients": params.tolist(), "standardErrors": se.tolist(), "z": zvals.tolist(), "pValues": pvals.tolist(),
        "hazardRatios": np.exp(params).tolist(),
        "hazardRatioCiLow": np.exp(params-zcrit*se).tolist(),
        "hazardRatioCiHigh": np.exp(params+zcrit*se).tolist(),
        "logLikelihood": float(model.loglike(params)),
        "covariance": np.asarray(fit.cov_params(),dtype=float).tolist(),
    }



def survival_harrell_c(payload: Dict[str, Any]) -> Dict[str, Any]:
    times = payload.get("time") or []
    events = payload.get("event") or []
    risks = payload.get("risk") or []
    n = min(len(times), len(events), len(risks))
    rows = []
    excluded = 0
    for i in range(n):
        if not _is_finite_number(times[i]) or not _is_finite_number(risks[i]) or float(times[i]) < 0:
            excluded += 1
            continue
        rows.append((float(times[i]), 1 if bool(events[i]) else 0, float(risks[i])))
    concordant = discordant = tied_risk = comparable = 0.0
    for i in range(len(rows)):
        for j in range(i+1, len(rows)):
            ti, ei, ri = rows[i]
            tj, ej, rj = rows[j]
            if ti == tj:
                continue
            if ti < tj and ei == 1:
                earlier_risk, later_risk = ri, rj
            elif tj < ti and ej == 1:
                earlier_risk, later_risk = rj, ri
            else:
                continue
            comparable += 1
            if earlier_risk > later_risk:
                concordant += 1
            elif earlier_risk < later_risk:
                discordant += 1
            else:
                tied_risk += 1
    if comparable == 0:
        return {"available": False, "message": "No comparable subject pairs.", "excluded": excluded}
    c_index = (concordant + 0.5*tied_risk)/comparable
    return {
        "available": True, "c": c_index, "concordant": concordant,
        "discordant": discordant, "tiedRisk": tied_risk,
        "comparablePairs": comparable, "excluded": excluded,
        "standardError": None, "ciLow": None, "ciHigh": None,
        "uncertaintyAvailable": False,
        "note": "Point estimate only; overlapping subject pairs do not support a binomial standard error.",
    }


def oracle_capabilities(_: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "contractVersion": "2026-07-26.2",
        "numpy": np.__version__,
        "scipy": getattr(__import__("scipy"), "__version__", "unknown"),
        "statsmodelsAvailable": sm is not None,
        "operations": [
            "adjust_pvalues", "distribution_fit", "goodness_of_fit",
            "regression_logistic", "box_tukey_hsd", "box_games_howell",
            "box_welch_pairwise_sidak", "box_friedman_pairwise_maxstat",
            "pie_gof_test", "pie_contingency_test", "roc_mann_whitney",
            "survival_kaplan_meier", "survival_cox_efron", "survival_harrell_c",
        ],
    }

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

    if operation == "oracle_capabilities":
        result = oracle_capabilities(payload)
    elif operation == "adjust_pvalues":
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
            result = goodness_of_fit(
                distribution,
                values,
                params,
                parameters_estimated=payload.get("parametersEstimated") is not False,
                iterations=int(payload.get("iterations") or 500),
                seed=int(payload.get("seed") or 1337),
            )
    elif operation == "regression_linear":
        result = regression_linear(payload)
    elif operation == "regression_linear_through_origin":
        result = regression_linear_through_origin(payload)
    elif operation == "regression_polynomial":
        result = regression_polynomial(payload)
    elif operation == "regression_exponential":
        result = regression_exponential(payload)
    elif operation == "regression_power":
        result = regression_power(payload)
    elif operation == "regression_logistic":
        result = regression_logistic(payload)
    elif operation == "regression_deming":
        result = regression_deming(payload)
    elif operation == "regression_lowess":
        result = regression_lowess(payload)
    elif operation == "regression_spline_natural":
        result = regression_spline_natural(payload)
    elif operation == "regression_gaussian":
        result = regression_gaussian(payload)
    elif operation == "regression_one_phase_association":
        result = regression_one_phase_association(payload)
    elif operation == "regression_one_phase_decay":
        result = regression_one_phase_decay(payload)
    elif operation == "regression_gompertz":
        result = regression_gompertz(payload)
    elif operation == "regression_binding_saturation":
        result = regression_binding_saturation(payload)
    elif operation == "regression_binding_competitive":
        result = regression_binding_competitive(payload)
    elif operation == "regression_enzyme_kinetics_substrate":
        result = regression_enzyme_kinetics_substrate(payload)
    elif operation == "regression_enzyme_kinetics_inhibition":
        result = regression_enzyme_kinetics_inhibition(payload)
    elif operation == "regression_dose_response_3pl":
        result = regression_dose_response_3pl(payload)
    elif operation == "regression_dose_response_4pl":
        result = regression_dose_response_4pl(payload)
    elif operation == "regression_dose_response_5pl":
        result = regression_dose_response_5pl(payload)
    elif operation == "regression_arima":
        result = regression_arima(payload)
    elif operation == "regression_holt_winters":
        result = regression_holt_winters(payload)
    elif operation == "box_ttest_welch":
        result = box_ttest_welch(payload)
    elif operation == "box_ttest_equal_variance":
        result = box_ttest_equal_variance(payload)
    elif operation == "box_ttest_paired":
        result = box_ttest_paired(payload)
    elif operation == "box_ratio_ttest":
        result = box_ratio_ttest(payload)
    elif operation == "box_lognormal_ttest_equal_variance":
        result = box_lognormal_ttest_equal_variance(payload)
    elif operation == "box_lognormal_ttest_welch":
        result = box_lognormal_ttest_welch(payload)
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
    elif operation == "box_welch_anova":
        result = box_welch_anova(payload)
    elif operation == "box_lognormal_anova":
        result = box_lognormal_anova(payload)
    elif operation == "box_lognormal_welch_anova":
        result = box_lognormal_welch_anova(payload)
    elif operation == "box_brown_forsythe":
        result = box_brown_forsythe(payload)
    elif operation == "box_bartlett":
        result = box_bartlett(payload)
    elif operation == "box_lognormal_comparison":
        result = box_lognormal_comparison(payload)
    elif operation == "box_linear_trend":
        result = box_linear_trend(payload)
    elif operation in {"box_tamhane_t2", "box_welch_pairwise_sidak"}:
        result = box_tamhane_t2(payload)
    elif operation == "box_tukey_hsd":
        result = box_tukey_hsd(payload)
    elif operation == "box_games_howell":
        result = box_games_howell(payload)
    elif operation == "box_kruskal":
        result = box_kruskal(payload)
    elif operation == "box_friedman":
        result = box_friedman(payload)
    elif operation == "box_friedman_pairwise_maxstat":
        result = box_friedman_pairwise_maxstat(payload)
    elif operation == "box_repeated_measures_anova":
        result = box_repeated_measures_anova(payload)
    elif operation == "box_kolmogorov_smirnov":
        result = box_kolmogorov_smirnov(payload)
    elif operation == "hist_descriptive_summary":
        result = hist_descriptive_summary(payload)
    elif operation == "hist_lognormal_comparison":
        result = hist_lognormal_comparison(payload)
    elif operation == "hist_kolmogorov_smirnov":
        result = hist_kolmogorov_smirnov(payload)
    elif operation == "pie_chi_square":
        result = pie_chi_square(payload)
    elif operation == "pie_gof_test":
        result = pie_gof_test(payload)
    elif operation == "pie_contingency_test":
        result = pie_contingency_test(payload)
    elif operation == "roc_curve_metric":
        result = roc_curve_metric(payload)
    elif operation == "roc_auc_uncertainty":
        result = roc_auc_uncertainty(payload)
    elif operation == "roc_mann_whitney":
        result = roc_mann_whitney(payload)
    elif operation == "roc_threshold_table":
        result = roc_threshold_table(payload)
    elif operation == "roc_delong_diff":
        result = roc_delong_diff(payload)
    elif operation == "correlation":
        result = correlation(payload)
    elif operation == "survival_logrank":
        result = survival_logrank(payload)
    elif operation == "survival_gehan_breslow":
        result = survival_gehan_breslow(payload)
    elif operation == "survival_logrank_trend":
        result = survival_logrank_trend(payload)
    elif operation == "survival_kaplan_meier":
        result = survival_kaplan_meier(payload)
    elif operation == "survival_cox_efron":
        result = survival_cox_efron(payload)
    elif operation == "survival_harrell_c":
        result = survival_harrell_c(payload)
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
