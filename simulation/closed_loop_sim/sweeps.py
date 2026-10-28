"""Robustness sweeps (spec section 6): one factor at a time from the base cell.

Probes where the framework degrades — sample size, monitoring differential kappa,
timestamp granularity, confounding strength, and artefact rates — substantiating the
manuscript's Table 5 future-work claims with evidence. Structural metrics are the
fast core; the kappa sweep additionally fits the estimand to show surveillance bias
growing with monitoring.

    python -m closed_loop_sim.sweeps          # run all sweeps -> results/sweeps*
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from closed_loop_sim.config import base_cell
from closed_loop_sim.discovery import discover
from closed_loop_sim.estimation import estimate
from closed_loop_sim.eventlog import build_event_log_data
from closed_loop_sim.metrics import structural_metrics
from closed_loop_sim.refinement import ARMS

OUT = Path("results")
OUT.mkdir(exist_ok=True)


def _tie_rate(df: pd.DataFrame) -> float:
    # df is sorted by (case, time). Adjacent within-case pairs sharing a timestamp
    # are order-ambiguous. Vectorised (fast at large n).
    c = df["case"].to_numpy(); t = df["time"].to_numpy()
    adj = c[1:] == c[:-1]
    tot = int(adj.sum())
    ties = int((adj & (t[1:] == t[:-1])).sum())
    return ties / tot if tot else 0.0


def _run_one(cfg, seed: int, with_est: bool = False) -> dict:
    data = build_event_log_data(cfg.n, cfg, seed)
    disc = discover(data.log, data.visit_counts, compute_activity_dfg=False)
    se = disc.state_edges
    out = {
        "tie_rate": _tie_rate(data.log),
        "decoy_risk": se[("S2", "S0")].risk if ("S2", "S0") in se else 0.0,
        "recode_risk": se[("S2", "S1")].risk if ("S2", "S1") in se else 0.0,
    }
    for arm in "ABC":
        out[arm] = structural_metrics(ARMS[arm](disc))
    if with_est:
        out["est"] = estimate(data, cfg.dgp.t_max)
    return out


def _aggregate(reps: list, with_est: bool, truth01: float) -> dict:
    def amean(arm, key):
        return float(np.mean([r[arm][key] for r in reps]))
    row = {
        "decoy_risk": float(np.mean([r["decoy_risk"] for r in reps])),
        "recode_risk": float(np.mean([r["recode_risk"] for r in reps])),
        "tie_rate": float(np.mean([r["tie_rate"] for r in reps])),
    }
    for arm in "ABC":
        row[f"{arm}_accept_trap"] = float(np.mean([r[arm]["accepts_any_trap"] for r in reps]))
        row[f"{arm}_precision"] = amean(arm, "precision")
        row[f"{arm}_recall"] = amean(arm, "recall")
        row[f"{arm}_shd"] = amean(arm, "shd")
    if with_est:
        for key in ("s0s1_latent", "s0s1_naive"):
            betas = np.array([r["est"][key]["beta_E"] for r in reps])
            row[f"{key}_mean"] = float(betas.mean())
            row[f"{key}_bias"] = float(betas.mean() - truth01)
            row[f"{key}_rmse"] = float(np.sqrt(np.mean((betas - truth01) ** 2)))
            row[f"{key}_coverage"] = float(np.mean(
                [r["est"][key]["ci_low"] <= truth01 <= r["est"][key]["ci_high"] for r in reps]))
    return row


def run_factor(name: str, levels: list, apply_fn, m_fn, with_est: bool = False) -> pd.DataFrame:
    truth01 = base_cell().dgp.transitions["S0->S1"].beta_E
    rows = []
    for li, lvl in enumerate(levels):
        cfg = base_cell()
        apply_fn(cfg, lvl)
        M = m_fn(lvl)
        seeds = np.random.SeedSequence(20260610 + li * 1000).generate_state(M)
        reps = [_run_one(cfg, int(s), with_est) for s in seeds]
        row = {"factor": name, "level": str(lvl), "M": M, **_aggregate(reps, with_est, truth01)}
        rows.append(row)
        print(f"  {name}={lvl} (M={M}): A_trap={row['A_accept_trap']:.2f} "
              f"B_trap={row['B_accept_trap']:.2f} B_recall={row['B_recall']:.2f} "
              f"tie={row['tie_rate']:.2f} decoy={row['decoy_risk']:.2f}", flush=True)
    return pd.DataFrame(rows)


def _set_n(cfg, v): cfg.n = int(v)
def _set_kappa(cfg, v): cfg.obs.kappa = float(v)
def _set_gran(cfg, v): cfg.obs.time_granularity = v
def _set_artifacts(cfg, v):
    cfg.obs.p_switch, cfg.obs.p_recode = {"off": (0.0, 0.0), "low": (0.2, 0.15), "high": (0.6, 0.45)}[v]
def _set_conf(cfg, v):
    s = {"low": 0.5, "moderate": 1.0, "strong": 1.5}[v]
    cfg.dgp.propensity.alpha = [a * s for a in cfg.dgp.propensity.alpha]


def run_all() -> dict:
    print("[sweeps] sample size (with estimation) ...")
    n_M = {1000: 80, 5000: 80, 20000: 30, 100000: 8}
    sw = {}
    sw["sample_size"] = run_factor("sample_size", [1000, 5000, 20000, 100000], _set_n,
                                   lambda v: n_M.get(v, 60), with_est=True)
    print("[sweeps] monitoring kappa (with estimation) ...")
    sw["kappa"] = run_factor("kappa", [1.0, 1.5, 2.0, 3.0], _set_kappa, lambda v: 60, with_est=True)
    print("[sweeps] timestamp granularity ...")
    sw["granularity"] = run_factor("granularity", ["exact", "daily", "monthly", "yearly"], _set_gran,
                                   lambda v: 60)
    print("[sweeps] confounding strength ...")
    sw["confounding"] = run_factor("confounding", ["low", "moderate", "strong"], _set_conf, lambda v: 60)
    print("[sweeps] artefact rates ...")
    sw["artifacts"] = run_factor("artifacts", ["off", "low", "high"], _set_artifacts, lambda v: 60)
    return sw


def render_figure(sw: dict) -> None:
    fig, ax = plt.subplots(2, 3, figsize=(15, 8.5))

    # (a) sample size: estimand precision (structural recovery is n-invariant here,
    #     since the support threshold is on transition RISK, not count).
    d = sw["sample_size"]; x = d["level"].astype(int)
    ax[0, 0].plot(x, d["s0s1_latent_coverage"], "o-", color="#27ae60", label="latent 95% coverage")
    ax[0, 0].axhline(0.95, color="k", ls=":", lw=0.8)
    ax[0, 0].set_xscale("log"); ax[0, 0].set_xlabel("sample size n")
    ax[0, 0].set_ylabel("95% CI coverage"); ax[0, 0].set_ylim(0.5, 1.02)
    axb = ax[0, 0].twinx()
    axb.plot(x, d["s0s1_latent_rmse"], "s--", color="#8e44ad", label="latent RMSE")
    axb.set_ylabel("RMSE", color="#8e44ad"); axb.tick_params(axis="y", labelcolor="#8e44ad")
    ax[0, 0].set_title("(a) Sample size — estimand precision")
    ax[0, 0].legend(fontsize=8, loc="lower right"); axb.legend(fontsize=8, loc="upper right")

    # (b) kappa: discovered trap risks + A/B acceptance
    d = sw["kappa"]; x = d["level"].astype(float)
    ax[0, 1].plot(x, d["decoy_risk"], "o-", color="#c0392b", label="decoy S2->S0 risk")
    ax[0, 1].plot(x, d["recode_risk"], "s-", color="#e67e22", label="coding-shift S2->S1 risk")
    ax[0, 1].plot(x, d["A_accept_trap"], "^--", color="#7f8c8d", label="Arm A accepts trap")
    ax[0, 1].plot(x, d["B_accept_trap"], "v--", color="#2980b9", label="Arm B accepts trap")
    ax[0, 1].set_xlabel("monitoring differential κ"); ax[0, 1].set_ylim(-0.05, 1.05)
    ax[0, 1].set_title("(b) Monitoring intensity"); ax[0, 1].legend(fontsize=8)

    # (c) granularity: tie rate
    d = sw["granularity"]
    ax[0, 2].bar(d["level"], d["tie_rate"], color="#9b59b6")
    ax[0, 2].set_ylabel("fraction of ambiguous (tied) transitions")
    ax[0, 2].set_title("(c) Timestamp granularity")
    for i, v in enumerate(d["tie_rate"]):
        ax[0, 2].text(i, v + 0.005, f"{v:.2f}", ha="center", fontsize=9)

    # (d) artefact rates: A vs B F1 / trap acceptance
    d = sw["artifacts"]
    xi = np.arange(len(d))
    ax[1, 0].plot(xi, d["A_precision"], "s--", color="#c0392b", label="Arm A precision")
    ax[1, 0].plot(xi, d["B_precision"], "o-", color="#27ae60", label="Arm B precision")
    ax[1, 0].plot(xi, d["A_accept_trap"], "^--", color="#7f8c8d", label="Arm A accepts trap")
    ax[1, 0].set_xticks(xi); ax[1, 0].set_xticklabels(d["level"]); ax[1, 0].set_ylim(-0.05, 1.05)
    ax[1, 0].set_xlabel("artefact rate"); ax[1, 0].set_title("(d) Artefact rates"); ax[1, 0].legend(fontsize=8)

    # (e) confounding: A/B precision (robustness)
    d = sw["confounding"]; xi = np.arange(len(d))
    ax[1, 1].plot(xi, d["A_precision"], "s--", color="#c0392b", label="Arm A precision")
    ax[1, 1].plot(xi, d["B_precision"], "o-", color="#27ae60", label="Arm B precision")
    ax[1, 1].set_xticks(xi); ax[1, 1].set_xticklabels(d["level"]); ax[1, 1].set_ylim(-0.05, 1.05)
    ax[1, 1].set_xlabel("confounding strength"); ax[1, 1].set_title("(e) Confounding"); ax[1, 1].legend(fontsize=8)

    # (f) kappa estimand bias: naive vs latent
    d = sw["kappa"]; x = d["level"].astype(float)
    ax[1, 2].axhline(0, color="k", lw=0.8)
    ax[1, 2].plot(x, d["s0s1_naive_bias"], "s-", color="#e67e22", label="recorded (naive) bias")
    ax[1, 2].plot(x, d["s0s1_latent_bias"], "o-", color="#27ae60", label="latent bias")
    ax[1, 2].set_xlabel("monitoring differential κ"); ax[1, 2].set_ylabel("bias in exposure log-HR")
    ax[1, 2].set_title("(f) Surveillance bias vs κ"); ax[1, 2].legend(fontsize=8)

    fig.suptitle("Robustness sweeps (one factor at a time from the base cell)", fontsize=13)
    fig.tight_layout(rect=[0, 0, 1, 0.97])
    fig.savefig(OUT / "figure_sweeps.png", dpi=150)
    print("wrote", OUT / "figure_sweeps.png")


def sweep_support_threshold(s_min_levels: list[float] = [0.01, 0.02, 0.05, 0.10, 0.15, 0.20],
                            M: int = 30, seed: int = 20260610) -> pd.DataFrame:
    """Sensitivity of structural recovery to the proposal support threshold s_min,
    averaged over M replications (previously a single seed)."""
    from closed_loop_sim import refinement
    cfg = base_cell()
    seeds = np.random.SeedSequence(seed).generate_state(M)
    rows = []
    orig = refinement.S_MIN
    try:
        for s_min in s_min_levels:
            refinement.S_MIN = s_min
            res = [_run_one(cfg, int(sd), with_est=False) for sd in seeds]
            row = {"sweep": "support_threshold", "s_min": s_min, "M": M}
            for arm in ("A", "B"):
                for k in ("precision", "recall", "f1", "shd"):
                    row[f"{arm}_{k}"] = float(np.mean([r[arm][k] for r in res]))
            rows.append(row)
    finally:
        refinement.S_MIN = orig
    return pd.DataFrame(rows)


BASE_EDGES = {("S0", "S1"), ("S0", "S2"), ("S0", "S3"), ("S1", "S2"), ("S1", "S3"), ("S2", "S3")}
CH_ARMS = ["A", "B", "B_unk", "B_defer", "Initial", "PC_Temporal"]


def sweep_challenge_scenarios(M: int = 100, master_seed: int = 20260610) -> pd.DataFrame:
    """Scenarios the gate's rules were not written for. Each is graded against ITS OWN truth:
    with true feedback S2->S1 the truth graph contains that edge and only S2->S0 is a trap."""
    from closed_loop_sim.experiment import run_cell
    scenarios = [
        ("baseline", lambda c: None, BASE_EDGES, None),
        ("feedback_cvae_ckd", lambda c: setattr(c.dgp, "challenge_scenario", "feedback_cvae_ckd"),
         BASE_EDGES | {("S2", "S1")}, {("S2", "S0")}),
        ("feedback_no_artefacts", lambda c: (setattr(c.dgp, "challenge_scenario", "feedback_cvae_ckd"),
                                             setattr(c.obs, "p_switch", 0.0), setattr(c.obs, "p_recode", 0.0)),
         BASE_EDGES | {("S2", "S1")}, {("S2", "S0")}),
        ("held_out_artifact", lambda c: setattr(c.obs, "p_held_out", 0.4), BASE_EDGES, None),
        ("high_artefact_rate", lambda c: (setattr(c.obs, "p_switch", 0.7), setattr(c.obs, "p_recode", 0.6)),
         BASE_EDGES, None),
        ("no_mediation_S1S2_absent", lambda c: setattr(c.dgp.transitions["S1->S2"], "lam", 1e-9),
         BASE_EDGES - {("S1", "S2")}, None),
    ]
    rows = []
    for name, apply_fn, truth, traps in scenarios:
        cfg = base_cell(); apply_fn(cfg)
        cell = run_cell(cfg, M=M, master_seed=master_seed, with_estimation=False, workers=9,
                        true_edges=truth, trap_edges=traps, arms=CH_ARMS)
        for arm in CH_ARMS:
            x = cell["structural"][arm]
            rows.append({"sweep": "challenge_scenarios", "scenario": name, "arm": arm, "M": M,
                         "precision": x["precision_mean"], "recall": x["recall_mean"], "shd": x["shd_mean"],
                         "false_edges": x["n_other_false_edges_mean"] + x["n_traps_accepted_mean"],
                         "held_out_accept": x["held_out_accept_rate"],
                         "deferred": x["n_deferred_mean"], "deferred_true": x["deferred_true_edges_mean"],
                         "deferred_artefacts": x["deferred_artefacts_mean"],
                         "wrongly_removed_true": x["wrongly_removed_true_edges_mean"]})
    return pd.DataFrame(rows)


def rules_hash() -> str:
    """Fingerprint of the frozen gate rules, recorded BEFORE the red-team scenarios run."""
    import hashlib, inspect
    from closed_loop_sim import discovery, refinement
    src = inspect.getsource(refinement.RulesGate) + repr(sorted(discovery.ADMIN_ACTIVITIES)) + repr(refinement.PHASE1_STATE_ORDER)
    return hashlib.sha256(src.encode()).hexdigest()[:16]


def sweep_redteam(M: int = 60, master_seed: int = 20260610, oracle_n: int = 200_000) -> pd.DataFrame:
    """Extra mechanisms for the estimand, run with the rules frozen (hash recorded). NOT blind:
    the same team wrote rules and scenarios. A blind version needs a second party."""
    from closed_loop_sim.experiment import run_cell
    from closed_loop_sim.truth import ckd_truth
    ARMS_ = ["A", "B", "Initial"]
    def null(c):
        for tp in c.dgp.transitions.values(): tp.beta_E = 0.0
        c.obs.p_switch = c.obs.p_recode = 0.0
    def conf(c):
        c.dgp.frailty_exposure, c.dgp.frailty_hazard = 0.8, 0.4
    scenarios = [("negative_control_null_effect", null), ("latent_confounder", conf),
                 ("loss_to_follow_up", lambda c: setattr(c.obs, "loss_rate", 0.10))]
    rows = []
    for name, fn in scenarios:
        cfg = base_cell(); fn(cfg)
        orc = ckd_truth(cfg, oracle_n, 999, cfg.dgp.t_max)
        cell = run_cell(cfg, M=M, master_seed=master_seed, with_estimation=True, workers=9, oracle=orc,
                        boot_B=50, arms=ARMS_)
        est = cell["estimation"]
        lat = est["latent_primary"]["risk_difference"]
        rows.append({"sweep": "redteam", "scenario": name, "arm": "latent", "M": M, "truth_rd": orc["risk_difference"],
                     "rd_mean": lat["mean"], "rd_bias": lat["bias"], "rd_sd": lat["sd"],
                     "ci_cover": est["latent_primary"].get("rd_ci_coverage", {}).get("coverage", float("nan"))})
        for arm in ARMS_:
            b = est["by_arm"][arm]
            rows.append({"sweep": "redteam", "scenario": name, "arm": arm, "M": M, "truth_rd": orc["risk_difference"],
                         "rd_mean": b["risk_difference"]["mean"], "rd_bias": b["risk_difference"]["bias"],
                         "rd_sd": b["risk_difference"]["sd"], "ci_cover": b["rd_ci_coverage"]["coverage"]})
        print(f"  redteam {name}: truth {orc['risk_difference']:.4f}", flush=True)
    return pd.DataFrame(rows)


def sweep_overlap(alpha0_levels=(0.8, 1.8, 2.9), M: int = 40, master_seed: int = 20260610) -> pd.DataFrame:
    """Positivity sweep: push PPI prevalence towards the case-study 92.8%. The oracle is
    the shared high-precision one (the whole-population ATE does not depend on alpha0)."""
    from closed_loop_sim.estimation import estimate_arm
    from closed_loop_sim.causal import overlap_diagnostics
    from closed_loop_sim.truth import cached_oracle
    orc = cached_oracle(base_cell(), OUT / "oracle_ckd.json", n=1_000_000)
    rows = []
    seeds = np.random.SeedSequence(master_seed).generate_state(M)
    for a0 in alpha0_levels:
        cfg = base_cell(); cfg.dgp.propensity.alpha0 = a0
        rd, ov = [], []
        for sd in seeds:
            data = build_event_log_data(cfg.n, cfg, int(sd))
            disc = discover(data.log, data.visit_counts, compute_activity_dfg=False)
            est = estimate_arm(data, cfg.dgp.t_max, ARMS["B"](disc))
            rd.append(est["ipw_cif"]["risk_difference"])
            ov.append(overlap_diagnostics(data.L_std, data.E)[0])
        row = {"sweep": "overlap", "alpha0": a0, "M": M, "truth_rd": orc["risk_difference"],
               "rd_ipw_mean": float(np.mean(rd)), "rd_ipw_sd": float(np.std(rd, ddof=1))}
        row.update({k: float(np.mean([o[k] for o in ov])) for k in ov[0]})
        rows.append(row)
        print(f"  alpha0={a0}: exposed={row['prop_exposed']:.3f} ESS0={row['ess_unexposed']:.0f} "
              f"maxw={row['max_weight']:.1f} RD={row['rd_ipw_mean']:.3f} (truth {row['truth_rd']:.3f})", flush=True)
    return pd.DataFrame(rows)


def main():
    sw = run_all()
    sw["support_threshold"] = sweep_support_threshold()
    sw["challenge_scenarios"] = sweep_challenge_scenarios()
    print("[sweeps] overlap / positivity ...")
    sw["overlap"] = sweep_overlap()
    print("[sweeps] red-team scenarios (rules frozen, hash %s) ..." % rules_hash())
    sw["redteam"] = sweep_redteam()
    for k_ in ("overlap",):
        pass
    allrows = pd.concat(sw.values(), ignore_index=True)
    allrows.to_csv(OUT / "sweeps.csv", index=False)
    out = {k: v.to_dict("records") for k, v in sw.items()}
    out["meta"] = {"gate_rules_hash": rules_hash(), "blind": False,
                   "note": "rules frozen before the red-team scenarios ran; same team wrote rules and scenarios"}
    (OUT / "sweeps.json").write_text(json.dumps(out, indent=2))
    render_figure(sw)
    print("DONE -> results/sweeps.csv, sweeps.json, figure_sweeps.png")


if __name__ == "__main__":
    main()

