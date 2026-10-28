"""The oracle: true DAG, true beta_E, marginal-rate report, and the
g-computation mediated proportion computed ON the simulator (spec section 2.4).
"""
from __future__ import annotations

import numpy as np

from closed_loop_sim.config import SimConfig
from closed_loop_sim.dgp import PopulationData, draw_population_setup, simulate_trajectory

TRUE_EDGES: set = {
    ("S0", "S1"), ("S0", "S2"), ("S0", "S3"),
    ("S1", "S2"), ("S1", "S3"), ("S2", "S3"),
}
# DAG-level shorthand for the injected artifacts (deterministic spec section A.1).
TRAP_EDGES: set = {("S2", "S0"), ("S2", "S1")}
# The progression prior (forward order); edges that go backward are protected-direction
# violations. Death (S3) is absorbing: edges INTO S3 are allowed, OUT are not.
STATE_ORDER = {"S0": 0, "S1": 1, "S2": 2, "S3": 3}


def true_beta_E(cfg: SimConfig, transition: str) -> float:
    return cfg.dgp.transitions[transition].beta_E


def _arm_rates(histories, mask) -> dict:
    """Per-transition risk = events / patients who entered the origin state
    (matches Table 4 'at risk' denominators; everyone enters S0)."""
    origin_counts: dict = {}
    trans_counts = {f"{a}->{b}": 0 for a, b in TRUE_EDGES}
    for h, keep in zip(histories, mask):
        if not keep:
            continue
        states = [s for s, _ in h]
        for s in ("S0", "S1", "S2"):
            if s in states:
                origin_counts[s] = origin_counts.get(s, 0) + 1
        for a, b in zip(states, states[1:]):
            trans_counts[f"{a}->{b}"] += 1
    rates: dict = {}
    for tr, c in trans_counts.items():
        denom = origin_counts.get(tr.split("->")[0], 0)
        rates[tr] = c / denom if denom else 0.0
    return rates


def marginal_transition_rates(pop: PopulationData) -> dict:
    """Per-arm LATENT transition risk (truth, before observation distortions)."""
    return {
        "PPI": _arm_rates(pop.histories, pop.E == 1),
        "H2B": _arm_rates(pop.histories, pop.E == 0),
    }


def _reached_s2_by(history, horizon: float) -> bool:
    return any(s == "S2" and t <= horizon for s, t in history)


def cvae_cif(cfg: SimConfig, n: int, seed: int, e_direct: int, e_med: int,
             horizon: float) -> float:
    """Counterfactual CVAE cumulative incidence by ``horizon``, exposure overridden
    per transition: every transition uses e_direct except the mediator-onset
    S0->S1, which uses e_med. Covariates/seed are shared across counterfactual
    worlds so contrasts use the same population."""
    L, L_std, Z, _E, patient_seqs = draw_population_setup(n, cfg.dgp, seed)

    def e_func(transition: str) -> int:
        return e_med if transition == "S0->S1" else e_direct

    hits = 0
    for i in range(n):
        dgp_seed, _obs = patient_seqs[i].spawn(2)
        h = simulate_trajectory(L_std[i], e_func, cfg.dgp, np.random.default_rng(dgp_seed), Z[i])
        hits += _reached_s2_by(h, horizon)
    return hits / n


def mediated_proportion(cfg: SimConfig, n: int, seed: int, horizon: float) -> dict:
    cif11 = cvae_cif(cfg, n, seed, e_direct=1, e_med=1, horizon=horizon)
    cif10 = cvae_cif(cfg, n, seed, e_direct=1, e_med=0, horizon=horizon)
    cif00 = cvae_cif(cfg, n, seed, e_direct=0, e_med=0, horizon=horizon)
    total = cif11 - cif00
    indirect = cif11 - cif10   # natural indirect effect (through CKD onset)
    direct = cif10 - cif00     # natural direct effect
    return {
        "mediated_proportion": (indirect / total) if total != 0 else float("nan"),
        "total": total, "direct": direct, "indirect": indirect,
        "cif11": cif11, "cif10": cif10, "cif00": cif00,
    }


def ckd_truth(cfg: SimConfig, n: int, seed: int, horizon: float) -> dict:
    """Oracle for the PRIMARY estimand: standardised (whole-population) latent CKD
    cumulative incidence under E=1 vs E=0 with death as a competing event, plus
    restricted mean time lost to CKD. Common random numbers across the two worlds
    (same patients, covariates, latent Z and seeds), so the Monte Carlo standard
    error of the contrasts is computed from the paired per-patient differences."""
    L, L_std, Z, _E, patient_seqs = draw_population_setup(n, cfg.dgp, seed)
    # SeedSequence.spawn() advances an internal counter, so spawn ONCE per patient and reuse
    # the same seed in both exposure worlds (otherwise the worlds do not share random numbers).
    dgp_seeds = [patient_seqs[i].spawn(2)[0] for i in range(n)]
    hit, lost = {}, {}
    for e in (1, 0):
        onset = np.full(n, np.inf)
        for i in range(n):
            dgp_seed = dgp_seeds[i]
            h = simulate_trajectory(L_std[i], e, cfg.dgp, np.random.default_rng(dgp_seed), Z[i])
            onset[i] = next((t for s_, t in h if s_ == "S1"), np.inf)
        hit[e] = onset <= horizon
        lost[e] = np.where(hit[e], horizon - onset, 0.0)
    res = {"n": n, "seed": seed}
    for e in (1, 0):
        res[f"cif{e}"] = float(hit[e].mean())
        res[f"rmtl{e}"] = float(lost[e].mean())
    d = hit[1].astype(float) - hit[0].astype(float)
    res["risk_difference"] = res["cif1"] - res["cif0"]
    res["risk_difference_se"] = float(d.std(ddof=1) / np.sqrt(n))
    res["risk_ratio"] = res["cif1"] / res["cif0"]
    res["rmtl_difference"] = res["rmtl1"] - res["rmtl0"]
    res["rmtl_difference_se"] = float((lost[1] - lost[0]).std(ddof=1) / np.sqrt(n))
    return res


def cached_oracle(cfg: SimConfig, path, n: int = 1_000_000, seed: int = 999) -> dict:
    """High-precision oracle, computed once and cached with the config it belongs to."""
    import json
    from pathlib import Path
    p = Path(path)
    key = cfg.dgp.model_dump_json()
    if p.exists():
        blob = json.loads(p.read_text())
        if blob.get("dgp") == key and blob["oracle"]["n"] >= n:
            return blob["oracle"]
    o = ckd_truth(cfg, n, seed, cfg.dgp.t_max)
    p.write_text(json.dumps({"dgp": key, "oracle": o}, indent=1))
    return o
