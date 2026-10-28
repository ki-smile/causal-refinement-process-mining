"""Fill the manuscript-section template from results JSON and render a figure."""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RES = json.loads((ROOT / "results" / "base_cell_results.json").read_text(encoding="utf-8"))


def pct(x):
    return f"{100 * x:.0f}%"


def ci(pair):
    return f"{pair[0]:.2f}–{pair[1]:.2f}"


def fill() -> dict:
    m = RES["meta"]
    cell = RES["cell"]
    s = cell["structural"]
    e = cell["estimation"]
    cal = RES["observed_calibration"]
    med = RES["mediation_oracle"]
    edges = RES["representative_state_edges"]

    def block(arm):
        x = s[arm]
        return {
            f"{arm}_prec": f"{x['precision_mean']:.2f}", f"{arm}_rec": f"{x['recall_mean']:.2f}",
            f"{arm}_f1": f"{x['f1_mean']:.2f}", f"{arm}_shd": f"{x['shd_mean']:.2f}",
            f"{arm}_traps": f"{x['n_traps_accepted_mean']:.2f}",
            f"{arm}_death": f"{x['death_node_rate']:.2f}",
            f"{arm}_anytrap": pct(x['accept_any_trap_rate']),
            f"{arm}_anytrap_ci": ci(x['accept_any_trap_ci']),
            f"{arm}_anytrap_pct": pct(x['accept_any_trap_rate']),
        }

    def est(obj, prefix):
        return {f"{prefix}_mean": f"{obj['mean_beta']:.3f}", f"{prefix}_bias": f"{obj['bias']:+.3f}",
                f"{prefix}_rmse": f"{obj['rmse']:.3f}", f"{prefix}_cov": f"{obj['coverage']:.2f}"}

    vals = {
        "M": str(m["M"]), "py": m["python"], "np": m["numpy"], "pd": m["pandas"],
        "pm4py": m["pm4py"], "lifelines": m["lifelines"],
        "cal_gap": f"{cal['worst_gap']:.3f}",
        "cs_ppi": f"{cal['coding_shift']['PPI']:.3f}", "cs_h2b": f"{cal['coding_shift']['H2B']:.3f}",
        "decoy_risk": f"{edges['S2->S0']['risk']:.2f}", "recode_risk": f"{edges['S2->S1']['risk']:.2f}",
        "B_reject_pct": pct(1 - s["B"]["accept_any_trap_rate"]),
        "med_prop": f"{med['mediated_proportion']:.2f}", "med_ind": f"{med['indirect']:.3f}",
        "med_tot": f"{med['total']:.3f}",
        "lat_p2": f"{e['s0s1_latent']['p2_5']:.3f}", "lat_p97": f"{e['s0s1_latent']['p97_5']:.3f}",
    }
    for arm in ("A", "B", "C"):
        vals.update(block(arm))
        if "by_arm" in e and arm in e["by_arm"]:
            vals.update(est(e["by_arm"][arm], f"arm{arm}"))
    vals.update(est(e["s0s1_latent"], "lat"))
    vals.update(est(e["s0s1_naive"], "naive"))
    vals.update(est(e["s0s1_adjusted"], "adj"))
    vals.update(est(e["s1s2"], "s12"))
    return vals


def render_doc(vals: dict) -> None:
    src = (ROOT / "docs" / "manuscript_simulation_sections.md").read_text(encoding="utf-8")
    for k, v in vals.items():
        src = src.replace("{{" + k + "}}", str(v))
    out = ROOT / "docs" / "manuscript_simulation_sections_FINAL.md"
    out.write_text(src, encoding="utf-8")
    leftover = [tok for tok in vals] and [s for s in src.split("{{")[1:]]
    print("wrote", out, "| unfilled placeholders:", len(src.split("{{")) - 1)


def render_figure() -> None:
    """(a) transition-graph classification for all arms; (b) the primary estimand by arm
    against the 1,000,000-patient latent oracle."""
    import pandas as pd
    s = RES["cell"]["structural"]
    e = RES["cell"]["estimation"]
    reps = pd.read_csv(ROOT / "results" / "replications.csv")
    fig, ax = plt.subplots(1, 2, figsize=(12, 4.8))

    arms = ["A", "B", "B_unk", "B_defer", "C", "Initial", "PC_Temporal"]
    labels = ["A\nungated", "B\ntwo rules", "B+\nunknown-node\nrule", "B+\ndefer", "C\noracle",
              "Initial\nDAG", "Forward-\norder\nfilter"]
    x = np.arange(len(arms)); w = 0.38
    ax[0].bar(x - w / 2, [s[a]["precision_mean"] for a in arms], w, label="precision", color="#2980b9")
    ax[0].bar(x + w / 2, [s[a]["recall_mean"] for a in arms], w, label="recall", color="#e67e22")
    for i, a in enumerate(arms):
        ax[0].text(i, 1.04, f"{100 * s[a]['accept_any_trap_rate']:.0f}%", ha="center", fontsize=8)
    ax[0].text(len(arms) / 2 - 0.5, 1.12, "accepts a designed artefact", ha="center", fontsize=8, style="italic")
    ax[0].set_xticks(x); ax[0].set_xticklabels(labels, fontsize=7); ax[0].set_ylim(0, 1.2)
    ax[0].set_title("(a) Transition-graph classification, base cell (%d replications)" % RES["meta"]["M"], fontsize=9)
    ax[0].legend(loc="lower right", fontsize=8)

    orc = e["truth_ckd_cif"]; truth = orc["risk_difference"]
    rows = [("rd_latent", "B", "latent\nprocess"), ("rd_ipw", "A", "A\nrecorded"), ("rd_ipw", "B", "B / C\nrecorded"),
            ("rd_ipw", "Initial", "Initial DAG\nrecorded")]
    for i, (col, arm, lab) in enumerate(rows):
        v = reps[reps.arm == arm][col].to_numpy()
        lo, hi = np.percentile(v, [2.5, 97.5])
        ax[1].errorbar(i, v.mean(), yerr=[[v.mean() - lo], [hi - v.mean()]], fmt="o",
                       color="#7f8c8d" if col == "rd_latent" else "#c0392b", capsize=5)
    ax[1].axhspan(truth - 2 * orc["risk_difference_se"], truth + 2 * orc["risk_difference_se"], color="k", alpha=0.15)
    ax[1].axhline(truth, color="k", ls="--", lw=1, label=f"oracle = {truth:.4f} (n = {orc['n']:,})")
    ax[1].set_xticks(range(len(rows))); ax[1].set_xticklabels([r[2] for r in rows], fontsize=8)
    ax[1].set_ylabel("10-year CKD risk difference (PPI - H2B)")
    ax[1].set_title("(b) Primary estimand; bars = 2.5-97.5 percentile", fontsize=9)
    ax[1].legend(fontsize=8, loc="upper left")
    fig.tight_layout()
    out = ROOT / "results" / "figure_simulation.png"
    fig.savefig(out, dpi=200)
    print("wrote", out)


def generate_phase4_recommendations(est_results: dict) -> dict:
    """Phase 4 Recommendation Engine (Action A15).
    
    Prompts and recommends primary target estimands (Standardized CIF Risk Difference & RMTL)
    rather than relying on cause-specific hazard ratios or Fine-Gray models as defaults.
    """
    rec = {
        "primary_estimand": "Standardized Cumulative Incidence Function (CIF) Risk Difference (RD) / Risk Ratio (RR)",
        "secondary_estimand": "Restricted Mean Survival Time / Loss (RMST / RMTL)",
        "hazard_ratio_guidance": "Cause-specific log-HR reported as secondary descriptive metric with explicit Hernan 2010 / Aalen 2015 hazard ratio limitation disclosures.",
        "recommended_checks": [
            "Propensity score overlap plot & Standardized Mean Differences (SMDs)",
            "Inverse-Intensity-of-Visit Weighting (IIW) for monitoring differentials",
            "Quantitative Bias Analysis (QBA) sensitivity sweep for surveillance attenuation",
        ]
    }
    return rec


if __name__ == "__main__":
    render_figure()
