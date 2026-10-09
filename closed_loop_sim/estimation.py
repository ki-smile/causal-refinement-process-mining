"""Phase 4 estimation.

Primary estimand: IPW-standardised 10-year CKD risk difference (Aalen-Johansen, death a
competing event), risk ratio and RMTL difference, with bootstrap intervals. Secondary:
cause-specific Cox log-HR on CKD onset (lifelines).

Arm-specific analysis: an arm's refined graph determines (i) whether death is a competing
event or is (wrongly) treated as censoring, and (ii) whether recoded events contaminate the
CKD outcome. Whether the graph is acyclic and which back-door set it implies is reported by
``causal.arm_identification``; the latent estimand is NOT identified from recorded data in
any arm (assumption A4), which the simulation makes visible by comparing with the oracle.

Surveillance bias is addressed by a quantitative bias analysis on detection sensitivity
(``qba_detection``), not by a covariate or a count-based weight: visit intensity depends on
the exposure only, so a per-patient visit-count weight carries no information about the
detection mechanism within an exposure arm.
"""
from __future__ import annotations

import typing
import warnings

import numpy as np
import pandas as pd

from closed_loop_sim.eventlog import EventLogData

_COVS = ["age", "sex", "diabetes", "hypertension", "egfr"]


def _first_time(log: pd.DataFrame, activity: str) -> pd.Series:
    return log[log.activity == activity].groupby("case")["time"].min()


def _zscore(x: np.ndarray) -> np.ndarray:
    sd = x.std()
    return (x - x.mean()) / (sd if sd > 0 else 1.0)


def _followup(data: EventLogData, t_max: float) -> np.ndarray:
    return data.followup_end if data.followup_end is not None else np.full(len(data.E), t_max)


def _frame(dur, ev, cause, data: EventLogData, visits: bool = False) -> pd.DataFrame:
    dur = np.clip(dur, 1e-6, None)
    frame = {"duration": dur, "event": ev, "cause": cause, "E": data.E.astype(float)}
    for j, c in enumerate(_COVS):
        frame[c] = _zscore(data.L[:, j])
    if visits:
        frame["visits"] = _zscore(data.visit_counts.astype(float))
    return pd.DataFrame(frame)


def s0s1_arm_frame(data: EventLogData, t_max: float, ref: typing.Any = None,
                   visits: bool = True) -> pd.DataFrame:
    """Outcome frame for CKD onset derived from an arm's refined graph.

    * ``('S2','S1')`` accepted  -> recoded events enter the CKD outcome (contamination).
    * a CVAE recorded before any CKD is a competing event (cause 2) in every arm.
    * ``'S3'`` in the graph      -> death is also a competing event (cause 2).
      ``'S3'`` absent            -> death is not modelled and the record simply ends there:
                                    the patient is censored at death (the usual error of
                                    ignoring a competing event).
    """
    n = len(data.E)
    end = _followup(data, t_max)
    ckd = _first_time(data.log, "CKD_recorded")
    if ((ref is None) or (hasattr(ref, "edges") and ("S2", "S1") in ref.edges)) \
            and "CKD_recode" in data.log.activity.values:
        ckd = pd.concat([ckd, _first_time(data.log, "CKD_recode")]).groupby("case").min()
    has_death_node = (ref is None) or (hasattr(ref, "nodes") and "S3" in ref.nodes)
    death = _first_time(data.log, "Death")
    dur = end.astype(float).copy()
    ev = np.zeros(n, dtype=int)
    cause = np.zeros(n, dtype=int)
    cvae = _first_time(data.log, "CVAE_recorded")
    for i in range(n):
        ct = ckd.get(i, np.nan)
        if not np.isnan(ct):
            dur[i], ev[i], cause[i] = ct, 1, 1
            continue
        # Competing events for CKD: death (only if the arm models it) and a CVAE that occurs
        # first (in this DGP a CVAE-first patient can never develop CKD).
        comp = []
        if has_death_node:
            comp.append(death.get(i, np.nan))
        comp.append(cvae.get(i, np.nan))
        comp = [t for t in comp if not np.isnan(t)]
        if comp:
            dur[i], cause[i] = min(comp), 2
    return _frame(dur, ev, cause, data, visits)


def s0s1_frame(data: EventLogData, t_max: float) -> pd.DataFrame:
    """Recorded CKD outcome with death as a competing event (no artefact contamination)."""
    class _Clean:  # a graph with the Death node and no accepted recode edge
        nodes = {"S0", "S1", "S2", "S3"}
        edges: set = set()
    return s0s1_arm_frame(data, t_max, _Clean())


def s0s1_latent_frame(data: EventLogData, t_max: float) -> pd.DataFrame:
    """The same analysis on the TRUE latent onset times (no detection delay, no missed
    detections): the surveillance-free benchmark under the same censoring."""
    n = len(data.E)
    end = _followup(data, t_max)
    dur = end.astype(float).copy()
    ev = np.zeros(n, dtype=int)
    cause = np.zeros(n, dtype=int)
    for i, hist in enumerate(data.histories):
        onset = {s: t for s, t in hist}
        if "S1" in onset and onset["S1"] <= end[i]:
            dur[i], ev[i], cause[i] = onset["S1"], 1, 1
        else:
            comp = [onset[k] for k in ("S2", "S3") if k in onset and onset[k] <= end[i]]
            if comp:
                dur[i], cause[i] = min(comp), 2
    return _frame(dur, ev, cause, data)


def s1s2_frame(data: EventLogData, t_max: float) -> pd.DataFrame:
    """Among patients who entered CKD: time from CKD to CVAE (clock reset)."""
    end = _followup(data, t_max)
    ckd = _first_time(data.log, "CKD_recorded")
    cvae = _first_time(data.log, "CVAE_recorded")
    death = _first_time(data.log, "Death")
    rows = []
    for i in ckd.index:
        ct = ckd[i]
        vt = cvae.get(i, np.nan)
        if not np.isnan(vt) and vt > ct:
            dur, ev = vt - ct, 1
        else:
            dt = death.get(i, np.nan)
            stop = dt if not np.isnan(dt) else end[i]
            dur, ev = max(stop - ct, 1e-6), 0
        row = {"duration": dur, "event": ev, "E": float(data.E[i])}
        for j, c in enumerate(_COVS):
            row[c] = data.L[i, j]
        rows.append(row)
    df = pd.DataFrame(rows)
    for c in _COVS:
        df[c] = _zscore(df[c].to_numpy())
    return df


def _fit_betaE(df: pd.DataFrame, covariates: list) -> dict:
    try:
        from lifelines import CoxPHFitter
    except ImportError as exc:  # never silently emit NaN estimates
        raise RuntimeError("lifelines is required for Phase 4 estimation") from exc
    cph = CoxPHFitter(penalizer=0.01)
    cols = ["duration", "event", "E"] + covariates
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        cph.fit(df[cols], duration_col="duration", event_col="event")
    coef = cph.params_["E"]
    lo = cph.confidence_intervals_.loc["E"].iloc[0]
    hi = cph.confidence_intervals_.loc["E"].iloc[1]
    return {"beta_E": float(coef), "ci_low": float(lo), "ci_high": float(hi)}


# ------------------------------------------------------------------ surveillance
def detection_oracle(data: EventLogData, t_max: float) -> dict:
    """Simulator-only truth about detection: among patients whose latent CKD began by
    ``t_max``, the share with a RECORDED CKD by ``t_max``, per exposure arm."""
    ckd = _first_time(data.log, "CKD_recorded")
    out = {}
    for e in (1, 0):
        latent = rec = 0
        for i, hist in enumerate(data.histories):
            if data.E[i] != e:
                continue
            onset = next((t for s, t in hist if s == "S1"), None)
            if onset is None or onset > t_max:
                continue
            latent += 1
            rt = ckd.get(i, np.nan)
            rec += int((not np.isnan(rt)) and rt <= t_max)
        out[f"se{e}"] = rec / latent if latent else float("nan")
    out["se_ratio"] = out["se1"] / out["se0"] if out["se0"] else float("nan")
    return out


def qba_detection(cif1: float, cif0: float, se0_assumed: float = 0.8,
                  ratios=(1.0, 1.1, 1.2, 1.25), oracle: dict | None = None) -> dict:
    """Quantitative bias analysis for differential DETECTION SENSITIVITY.

    Observed CIF_e = Se_e * (true CIF_e). Given an assumed sensitivity in the unexposed
    (``se0_assumed``) and an assumed ratio rho = Se_PPI / Se_H2B, the bias-adjusted risk
    difference is CIF_1/(rho*Se_0) - CIF_0/Se_0. Parameter sets implying a sensitivity above 1
    (rho * Se_0 > 1) are infeasible and returned as NaN; a ratio that would null the association
    but exceeds 1/Se_0 is reported as unattainable. Sensitivity analysis over user-supplied bias
    parameters, not an estimate of them; it ignores detection delay.
    """
    nan = float("nan")
    adj = {f"{r:.2f}": (cif1 / (r * se0_assumed) - cif0 / se0_assumed) if r * se0_assumed <= 1.0 + 1e-9 else nan
           for r in ratios}
    null_ratio = cif1 / cif0 if cif0 > 0 else nan
    out = {"recorded_rd": cif1 - cif0, "adjusted_rd": adj, "ratio_that_nulls": null_ratio,
           "nulling_ratio_feasible": bool(null_ratio * se0_assumed <= 1.0 + 1e-9) if null_ratio == null_ratio else False}
    if oracle is not None and np.isfinite(oracle.get("se0", nan)):
        out["oracle_adjusted_rd"] = cif1 / oracle["se1"] - cif0 / oracle["se0"]
        out["oracle"] = oracle
    else:
        out["oracle_adjusted_rd"] = nan
    return out


# --------------------------------------------------------------------- per arm
def estimate_arm(data: EventLogData, t_max: float, ref: typing.Any,
                 boot_B: int = 0, seed: int = 0) -> dict:
    """Arm-specific estimation (see module docstring)."""
    from closed_loop_sim.causal import (arm_identification, bootstrap_rd, overlap_diagnostics,
                                        standardized_contrasts)
    ident = arm_identification(ref)
    arm_df = s0s1_arm_frame(data, t_max, ref)
    naive = _fit_betaE(arm_df, _COVS)
    adjusted = _fit_betaE(arm_df, _COVS + ["visits"])
    _, _, w = overlap_diagnostics(data.L_std, data.E)
    ipw = standardized_contrasts(arm_df.duration.to_numpy(), arm_df.cause.to_numpy(), data.E, w, t_max)
    out = {"beta_E": naive["beta_E"], "ci_low": naive["ci_low"], "ci_high": naive["ci_high"],
           "naive": naive, "adjusted": adjusted, "ipw_cif": ipw, "identification": ident}
    if boot_B:
        out["rd_ci"] = bootstrap_rd(arm_df.duration.to_numpy(), arm_df.cause.to_numpy(), data.E,
                                    data.L_std, t_max, boot_B, seed)
    return out


def estimate(data: EventLogData, t_max: float, boot_B: int = 0, seed: int = 0) -> dict:
    from closed_loop_sim.causal import bootstrap_rd, overlap_diagnostics, standardized_contrasts
    s01 = s0s1_frame(data, t_max)
    s01_latent = s0s1_latent_frame(data, t_max)
    s12 = s1s2_frame(data, t_max)
    _, _, w = overlap_diagnostics(data.L_std, data.E)
    lat = standardized_contrasts(s01_latent.duration.to_numpy(), s01_latent.cause.to_numpy(), data.E, w, t_max)
    rec = standardized_contrasts(s01.duration.to_numpy(), s01.cause.to_numpy(), data.E, w, t_max)
    # The simulator's detection sensitivities are defined for the whole population at the horizon;
    # with independent loss to follow-up the denominator would include cases whose onset falls after
    # loss, so the mechanism check is not defined and is returned as NaN.
    det = (detection_oracle(data, t_max) if not data.loss_applied
           else {"se1": float("nan"), "se0": float("nan"), "se_ratio": float("nan")})
    out = {
        "s0s1_latent": _fit_betaE(s01_latent, _COVS),
        "s0s1_naive": _fit_betaE(s01, _COVS),
        "s0s1_adjusted": _fit_betaE(s01, _COVS + ["visits"]),
        "s1s2": _fit_betaE(s12, _COVS),
        "latent_ipw_cif": lat,
        "detection_oracle": det,
        "qba": qba_detection(rec["cif1"], rec["cif0"], oracle=det),
    }
    if boot_B:
        out["latent_rd_ci"] = bootstrap_rd(s01_latent.duration.to_numpy(), s01_latent.cause.to_numpy(),
                                           data.E, data.L_std, t_max, boot_B, seed + 1)
    return out
