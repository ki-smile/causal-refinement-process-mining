"""Phase 5: run replications of a cell and aggregate the metrics.

Reproducibility: one master SeedSequence -> deterministic per-replication seeds. The
oracle (true latent contrasts) is computed ONCE at large n and shared by every table.
Arms whose refined graphs are identical share one estimation (same estimator, same data).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from closed_loop_sim.config import SimConfig
from closed_loop_sim.discovery import discover
from closed_loop_sim.estimation import estimate, estimate_arm
from closed_loop_sim.eventlog import build_event_log_data
from closed_loop_sim.metrics import structural_metrics
from closed_loop_sim.refinement import ARMS
from closed_loop_sim.truth import true_beta_E

ALL_ARMS = ["A", "B", "B_unk", "B_defer", "C", "Initial", "PC_Temporal"]


def run_replication(cfg: SimConfig, seed: int, with_estimation: bool = True,
                    true_edges: set | None = None, trap_edges: set | None = None,
                    boot_B: int = 0, arms: list | None = None) -> dict:
    arms = arms or ALL_ARMS
    data = build_event_log_data(cfg.n, cfg, seed)
    disc = discover(data.log, data.visit_counts, compute_activity_dfg=False)
    out: dict = {"seed": seed, "structural": {}, "arm_estimation": {}}
    if with_estimation:
        from closed_loop_sim.causal import overlap_diagnostics
        out["overlap"] = overlap_diagnostics(data.L_std, data.E)[0]
    cache: dict = {}
    for arm in arms:
        ref = ARMS[arm](disc)
        out["structural"][arm] = structural_metrics(ref, true_edges, trap_edges)
        if with_estimation:
            sig = (frozenset(ref.nodes), frozenset(ref.edges))
            if sig not in cache:
                cache[sig] = estimate_arm(data, cfg.dgp.t_max, ref, boot_B=boot_B, seed=seed % (2 ** 31))
            out["arm_estimation"][arm] = cache[sig]
    if with_estimation:
        out["estimation"] = estimate(data, cfg.dgp.t_max, boot_B=boot_B, seed=seed % (2 ** 31))
    return out


def _wilson(k: int, n: int) -> tuple:
    if n == 0:
        return (0.0, 0.0)
    z = 1.96
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - half) / d, (c + half) / d)


def _mc(vals, truth=None) -> dict:
    v = np.asarray(vals, dtype=float)
    out = {"mean": float(v.mean()), "sd": float(v.std(ddof=1)), "mcse": float(v.std(ddof=1) / np.sqrt(len(v)))}
    if truth is not None:
        out.update(bias=float(v.mean() - truth), bias_mcse=out["mcse"],
                   rmse=float(np.sqrt(np.mean((v - truth) ** 2))))
    return out


def _cov(hits) -> dict:
    k, n = int(np.sum(hits)), len(hits)
    return {"coverage": k / n, "coverage_ci": _wilson(k, n)}


def _worker(args):
    cfg, seed, with_estimation, te, tr, boot_B, arms = args
    return run_replication(cfg, seed, with_estimation, te, tr, boot_B, arms)


def run_cell(cfg: SimConfig, M: int, master_seed: int = 20260610, with_estimation: bool = True,
             workers: int | None = None, oracle: dict | None = None, true_edges: set | None = None,
             trap_edges: set | None = None, boot_B: int = 0, arms: list | None = None) -> dict:
    arms = arms or ALL_ARMS
    seeds = [int(s) for s in np.random.SeedSequence(master_seed).generate_state(M)]
    jobs = [(cfg, s, with_estimation, true_edges, trap_edges, boot_B, arms) for s in seeds]
    if workers and workers > 1:
        from concurrent.futures import ProcessPoolExecutor
        with ProcessPoolExecutor(workers) as ex:
            reps = list(ex.map(_worker, jobs, chunksize=4))
    else:
        reps = [_worker(j) for j in jobs]

    struct = {a: {} for a in arms}
    for a in arms:
        for key in ["precision", "recall", "f1", "shd", "n_traps_accepted", "n_other_false_edges",
                    "n_deferred", "deferred_true_edges", "deferred_artefacts", "wrongly_removed_true_edges"]:
            vals = [r["structural"][a][key] for r in reps]
            struct[a][key + "_mean"] = float(np.mean(vals))
            struct[a][key + "_sd"] = float(np.std(vals, ddof=1)) if M > 1 else 0.0
            struct[a][key + "_mcse"] = struct[a][key + "_sd"] / np.sqrt(M)
        k = sum(r["structural"][a]["accepts_any_trap"] for r in reps)
        struct[a]["accept_any_trap_rate"] = k / M
        struct[a]["accept_any_trap_ci"] = _wilson(k, M)
        struct[a]["reject_S2_S0_rate"] = float(np.mean([not r["structural"][a]["accepted_S2_S0"] for r in reps]))
        struct[a]["reject_S2_S1_rate"] = float(np.mean([not r["structural"][a]["accepted_S2_S1"] for r in reps]))
        struct[a]["death_node_rate"] = float(np.mean([r["structural"][a]["death_node_added"] for r in reps]))
        struct[a]["held_out_accept_rate"] = float(np.mean([r["structural"][a]["accepted_held_out"] for r in reps]))

    result = {"M": M, "n": cfg.n, "structural": struct}

    if with_estimation:
        truth01 = true_beta_E(cfg, "S0->S1")
        truth12 = true_beta_E(cfg, "S1->S2")
        tr = oracle
        est = {"truth_S0S1": truth01, "truth_S1S2": truth12, "truth_ckd_cif": tr, "by_arm": {}}
        for key, truth in [("s0s1_latent", truth01), ("s0s1_naive", truth01),
                           ("s0s1_adjusted", truth01), ("s1s2", truth12)]:
            betas = [r["estimation"][key]["beta_E"] for r in reps]
            cover = [r["estimation"][key]["ci_low"] <= truth <= r["estimation"][key]["ci_high"] for r in reps]
            est[key] = {**_mc(betas, truth), "p2_5": float(np.percentile(betas, 2.5)),
                        "p97_5": float(np.percentile(betas, 97.5)), "mean_beta": float(np.mean(betas)), **_cov(cover)}

        def prim(getter, name):
            blk = {}
            for m in ("risk_difference", "risk_ratio", "rmtl_difference"):
                blk[m] = _mc([getter(r)[m] for r in reps], tr[m] if tr else None)
            return blk

        # latent process, primary estimand (estimator-validity row for Table 9)
        est["latent_primary"] = prim(lambda r: r["estimation"]["latent_ipw_cif"], "latent")
        if boot_B and tr:
            est["latent_primary"]["rd_ci_coverage"] = _cov(
                [r["estimation"]["latent_rd_ci"]["low"] <= tr["risk_difference"] <= r["estimation"]["latent_rd_ci"]["high"]
                 for r in reps])
            est["latent_primary"]["rd_boot_se_mean"] = float(np.mean([r["estimation"]["latent_rd_ci"]["se"] for r in reps]))
        for arm in arms:
            ae = [r["arm_estimation"][arm] for r in reps]
            betas = [x["beta_E"] for x in ae]
            blk = {**_mc(betas, truth01), "mean_beta": float(np.mean(betas)),
                   "p2_5": float(np.percentile(betas, 2.5)), "p97_5": float(np.percentile(betas, 97.5)),
                   **_cov([x["ci_low"] <= truth01 <= x["ci_high"] for x in ae])}
            for mt in ("naive", "adjusted"):
                mb = [x[mt]["beta_E"] for x in ae]
                blk[mt] = {**_mc(mb, truth01), "mean_beta": float(np.mean(mb)),
                           **_cov([x[mt]["ci_low"] <= truth01 <= x[mt]["ci_high"] for x in ae])}
            for m in ("risk_difference", "risk_ratio", "rmtl_difference"):
                blk[m] = _mc([x["ipw_cif"][m] for x in ae], tr[m] if tr else None)
            if boot_B and tr:
                blk["rd_ci_coverage"] = _cov([x["rd_ci"]["low"] <= tr["risk_difference"] <= x["rd_ci"]["high"] for x in ae])
                blk["rd_ci_width_mean"] = float(np.mean([x["rd_ci"]["high"] - x["rd_ci"]["low"] for x in ae]))
                blk["rd_boot_se_mean"] = float(np.mean([x["rd_ci"]["se"] for x in ae]))
            ids = [x["identification"] for x in ae]
            blk["identification"] = {k: float(np.mean([i[k] for i in ids]))
                                     for k in ("state_graph_acyclic", "has_death_node", "outcome_contaminated",
                                               "backdoor_valid_L", "backdoor_valid_L+V", "latent_effect_identified")}
            est["by_arm"][arm] = blk
        # detection (surveillance) mechanism, simulator truth, and the QBA grid
        det = [r["estimation"]["detection_oracle"] for r in reps]
        est["detection_oracle_mean"] = {k: (float(np.nanmean([d[k] for d in det])) if not all(np.isnan(d[k]) for d in det) else float("nan")) for k in det[0]}
        q = [r["estimation"]["qba"] for r in reps]
        est["qba_mean"] = {"recorded_rd": float(np.mean([x["recorded_rd"] for x in q])),
                           "oracle_adjusted_rd": float(np.mean([x["oracle_adjusted_rd"] for x in q])),
                           "adjusted_rd": {k: float(np.mean([x["adjusted_rd"][k] for x in q])) for k in q[0]["adjusted_rd"]},
                           "ratio_that_nulls": float(np.mean([x["ratio_that_nulls"] for x in q])),
                           "nulling_ratio_feasible": bool(all(x["nulling_ratio_feasible"] for x in q))}
        est["oracle_delta_mean"] = float(np.mean([r["estimation"]["s0s1_naive"]["beta_E"]
                                                  - r["estimation"]["s0s1_latent"]["beta_E"] for r in reps]))
        ov = [r["overlap"] for r in reps]
        est["overlap_mean"] = {k: float(np.mean([o[k] for o in ov])) for k in ov[0]}
        result["estimation"] = est

    per_rep: list = []
    for r in reps:
        base = {"seed": r["seed"]}
        if with_estimation:
            for key in ["s0s1_latent", "s0s1_naive", "s0s1_adjusted", "s1s2"]:
                base[f"beta_{key}"] = r["estimation"][key]["beta_E"]
            base["rd_latent"] = r["estimation"]["latent_ipw_cif"]["risk_difference"]
        for a in arms:
            row = {**base, "arm": a, **r["structural"][a]}
            if with_estimation:
                ae = r["arm_estimation"][a]
                row.update(beta_arm=ae["beta_E"], rd_ipw=ae["ipw_cif"]["risk_difference"],
                           rr_ipw=ae["ipw_cif"]["risk_ratio"], rmtl_diff_ipw=ae["ipw_cif"]["rmtl_difference"])
                if boot_B:
                    row.update(rd_ci_low=ae["rd_ci"]["low"], rd_ci_high=ae["rd_ci"]["high"])
            per_rep.append(row)
    result["_per_rep"] = per_rep
    return result
