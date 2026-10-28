"""Identification and estimand machinery (reviewer actions R2.3, R3.1-R3.3).

* ``arm_identification`` derives, from an arm's refined state graph, whether the
  graph is a DAG and which covariate sets satisfy the back-door criterion for the
  exposure -> recorded-CKD-onset estimand (replaces the former hard-coded set).
* ``fit_propensity`` / ``overlap_diagnostics`` fit the exposure model and report
  positivity diagnostics (propensity range, ESS, max weight, SMD before/after).
* ``aj_cif`` / ``rmtl`` are weighted Aalen-Johansen cumulative incidence and
  restricted mean time lost, with death as a COMPETING event (not censoring).
"""
from __future__ import annotations

import networkx as nx
import numpy as np


# ---------------------------------------------------------------- identification
def _is_dsep(g: nx.DiGraph, x: set, y: set, z: set) -> bool:
    f = getattr(nx, "is_d_separator", None) or nx.d_separated
    return bool(f(g, x, y, z))


def arm_identification(ref) -> dict:
    """What an arm's refined graph does and does not license, for E -> CKD onset.

    Estimand graph over {E, L, V, T, Y[, C][, D]}: L = baseline covariates, V = visit
    intensity (a descendant of E), T = LATENT CKD onset, Y = RECORDED CKD onset (T seen
    through V), C = CVAE, D = death. Three separate questions, deliberately not collapsed:

    * ``state_graph_acyclic``: a descriptive flag about the arm's transition graph. A cycle
      is a structural WARNING (backward edges), not a statement that no adjustment set
      exists: a time-indexed unrolling of a feedback loop is acyclic.
    * ``backdoor_valid_*``: d-separation of E and the RECORDED outcome Y on the estimand
      graph, for the adjustment sets {L}, {L, V} and {}.
    * ``latent_effect_identified``: ALWAYS False. The effect on latent onset T is not
      identified from recorded data in any arm, because detection of T depends on the
      exposure through V (assumption A4). Reaching it needs bias parameters (see
      ``estimation.qba_detection``).
    """
    state_g = nx.DiGraph(list(ref.edges))
    acyclic = nx.is_directed_acyclic_graph(state_g)
    has_death = "S3" in ref.nodes
    contaminated = ("S2", "S1") in ref.edges

    g = nx.DiGraph()
    g.add_edges_from([("L", "E"), ("L", "T"), ("E", "T"), ("E", "V"), ("V", "Y"), ("T", "Y"),
                      ("E", "C"), ("L", "C"), ("T", "C")])
    if contaminated:
        g.add_edge("C", "Y")   # recoded events make CVAE feed the recorded CKD outcome
    if has_death:
        g.add_edges_from([("L", "D"), ("E", "D"), ("T", "D")])

    desc_E = nx.descendants(g, "E")
    h = g.copy()
    h.remove_edges_from(list(g.out_edges("E")))
    out = {"state_graph_acyclic": acyclic, "has_death_node": has_death,
           "outcome_contaminated": contaminated, "latent_effect_identified": False}
    for name, z in {"L": {"L"}, "L+V": {"L", "V"}, "none": set()}.items():
        out[f"backdoor_valid_{name}"] = bool(not (z & desc_E) and _is_dsep(h, {"E"}, {"Y"}, z))
    out["adjustment_set"] = ["age", "sex", "diabetes", "hypertension", "egfr"] if out["backdoor_valid_L"] else None
    return out


# ------------------------------------------------------------------- propensity
def fit_propensity(L_std: np.ndarray, E: np.ndarray, iters: int = 25) -> np.ndarray:
    X = np.column_stack([np.ones(len(E)), L_std])
    b = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X @ b))
        W = np.clip(p * (1 - p), 1e-9, None)
        step = np.linalg.solve(X.T @ (X * W[:, None]) + 1e-8 * np.eye(len(b)), X.T @ (E - p))
        b += step
        if np.abs(step).max() < 1e-8:
            break
    return 1 / (1 + np.exp(-X @ b))


def _smd(x: np.ndarray, E: np.ndarray, w: np.ndarray) -> float:
    def wm(v, ww):
        return np.sum(ww * v) / np.sum(ww)
    m1, m0 = wm(x[E == 1], w[E == 1]), wm(x[E == 0], w[E == 0])
    v1 = wm((x[E == 1] - m1) ** 2, w[E == 1]); v0 = wm((x[E == 0] - m0) ** 2, w[E == 0])
    s = np.sqrt((v1 + v0) / 2)
    return float(abs(m1 - m0) / s) if s > 0 else 0.0


def overlap_diagnostics(L_std: np.ndarray, E: np.ndarray) -> dict:
    ps = fit_propensity(L_std, E)
    w = np.where(E == 1, 1 / ps, 1 / (1 - ps))
    ones = np.ones(len(E))
    ess = lambda ww: float(ww.sum() ** 2 / (ww ** 2).sum())
    smd_raw = [_smd(L_std[:, j], E, ones) for j in range(L_std.shape[1])]
    smd_w = [_smd(L_std[:, j], E, w) for j in range(L_std.shape[1])]
    return {
        "prop_exposed": float(E.mean()),
        "ps_min": float(ps.min()), "ps_max": float(ps.max()),
        "ps_p01": float(np.percentile(ps, 1)), "ps_p99": float(np.percentile(ps, 99)),
        "share_ps_lt_0.05_or_gt_0.95": float(np.mean((ps < 0.05) | (ps > 0.95))),
        "max_weight": float(w.max()),
        "ess_exposed": ess(w[E == 1]), "ess_unexposed": ess(w[E == 0]),
        "max_smd_raw": float(max(smd_raw)), "max_smd_weighted": float(max(smd_w)),
    }, ps, w


# ------------------------------------------------- competing-risks CIF and RMTL
def aj_cif(time: np.ndarray, cause: np.ndarray, w: np.ndarray, horizon: float):
    """Weighted Aalen-Johansen CIF of cause 1 (cause 2 competing, 0 censored).
    Returns (event_times, cif_values) as a right-continuous step function."""
    keep = time <= horizon
    t, c, ww = time[keep], cause[keep], w[keep]
    order = np.argsort(t, kind="stable")
    t, c, ww = t[order], c[order], ww[order]
    ut, inv = np.unique(t, return_inverse=True)
    d1 = np.bincount(inv, weights=ww * (c == 1), minlength=len(ut))
    d_all = np.bincount(inv, weights=ww * (c > 0), minlength=len(ut))
    n_at = np.bincount(inv, weights=ww, minlength=len(ut))
    # at-risk includes everyone with time >= ut (also those beyond the horizon)
    total_w = w.sum()
    risk = total_w - np.concatenate([[0.0], np.cumsum(n_at)[:-1]])
    surv_prev = np.concatenate([[1.0], np.cumprod(1 - d_all / risk)[:-1]])
    cif = np.cumsum(surv_prev * d1 / risk)
    return ut, cif


def cif_at(times: np.ndarray, cif: np.ndarray, horizon: float) -> float:
    return float(cif[-1]) if len(cif) else 0.0


def rmtl(times: np.ndarray, cif: np.ndarray, horizon: float) -> float:
    """Restricted mean time lost to cause 1 up to ``horizon`` = integral of CIF."""
    if len(times) == 0:
        return 0.0
    x = np.concatenate([times, [horizon]])
    y = np.concatenate([[0.0], cif])
    return float(np.sum(y * np.diff(np.concatenate([[0.0], x]))))


def standardized_contrasts(duration, cause, E, w, horizon: float) -> dict:
    out = {}
    for e in (1, 0):
        m = E == e
        ts, cs = aj_cif(duration[m], cause[m], w[m], horizon)
        out[f"cif{e}"] = cif_at(ts, cs, horizon)
        out[f"rmtl{e}"] = rmtl(ts, cs, horizon)
    out["risk_difference"] = out["cif1"] - out["cif0"]
    out["risk_ratio"] = out["cif1"] / out["cif0"] if out["cif0"] > 0 else float("nan")
    out["rmtl_difference"] = out["rmtl1"] - out["rmtl0"]
    return out


def bootstrap_rd(duration, cause, E, L_std, horizon: float, B: int, seed: int,
                 alpha: float = 0.05) -> dict:
    """Nonparametric bootstrap (resample patients, REFIT the propensity model, recompute the
    weighted Aalen-Johansen risk difference). Percentile interval."""
    rng = np.random.default_rng(seed)
    n = len(E)
    vals = np.empty(B)
    for b in range(B):
        idx = rng.integers(0, n, n)
        ps = fit_propensity(L_std[idx], E[idx])
        w = np.where(E[idx] == 1, 1 / ps, 1 / (1 - ps))
        vals[b] = standardized_contrasts(duration[idx], cause[idx], E[idx], w, horizon)["risk_difference"]
    lo, hi = np.percentile(vals, [100 * alpha / 2, 100 * (1 - alpha / 2)])
    return {"low": float(lo), "high": float(hi), "se": float(vals.std(ddof=1))}
