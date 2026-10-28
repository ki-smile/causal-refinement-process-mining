"""Assemble the patient-level activity event log.

Wires simulate_population -> generate_visits -> observe_trajectory ->
inject_artifacts with separate DGP/observation RNG streams (review fix 5d) and
death-truncated follow-up (review fix 1). Returns a tidy DataFrame and the latent
covariate/exposure arrays needed downstream by estimation.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from closed_loop_sim.config import GRANULARITY_STEP, SimConfig
from closed_loop_sim.dgp import (
    draw_population_setup, simulate_trajectory,
)
from closed_loop_sim.observation import (
    ACTIVITY_ORDER, generate_visits, inject_artifacts, observe_trajectory,
)


@dataclass
class EventLogData:
    log: pd.DataFrame          # columns: case, activity, time, group
    L: np.ndarray              # (n, 5) raw covariates
    L_std: np.ndarray          # (n, 5) standardized
    E: np.ndarray              # (n,) exposure
    histories: list            # latent histories (for oracle cross-checks)
    visit_counts: np.ndarray   # (n,) number of visits per patient (monitoring intensity)
    followup_end: np.ndarray = None   # (n,) end of observed follow-up (death, loss, or t_max)
    loss_applied: bool = False        # True when independent loss to follow-up was simulated
    Z: np.ndarray = None       # (n,) latent common cause (zeros unless enabled)


def _death_time(history) -> float | None:
    return next((t for s, t in history if s == "S3"), None)


def build_event_log_data(n: int, cfg: SimConfig, seed: int) -> EventLogData:
    L, L_std, Z, E, patient_seqs = draw_population_setup(n, cfg.dgp, seed)
    followup = np.zeros(n)

    records: list = []
    histories: list = []
    visit_counts = np.zeros(n, dtype=int)
    for i in range(n):
        dgp_seed, obs_seed = patient_seqs[i].spawn(2)
        dgp_rng = np.random.default_rng(dgp_seed)
        obs_rng = np.random.default_rng(obs_seed)

        history = simulate_trajectory(L_std[i], int(E[i]), cfg.dgp, dgp_rng, Z[i])
        histories.append(history)

        death = _death_time(history)
        followup_end = min(cfg.dgp.t_max, death) if death is not None else cfg.dgp.t_max
        if cfg.obs.loss_rate > 0:   # independent loss to follow-up (own draw; base cell unaffected)
            followup_end = min(followup_end, float(obs_rng.exponential(1.0 / cfg.obs.loss_rate)))
        followup[i] = followup_end
        visits = generate_visits(int(E[i]), cfg.obs, followup_end, obs_rng)
        visit_counts[i] = len(visits)

        events = observe_trajectory(history, int(E[i]), visits, followup_end)
        events = inject_artifacts(events, cfg.obs, visits, obs_rng)

        group = "PPI" if E[i] == 1 else "H2B"
        for activity, t in events:
            records.append({"case": i, "activity": activity, "time": float(t), "group": group})

    df = pd.DataFrame.from_records(records, columns=["case", "activity", "time", "group"])
    step = GRANULARITY_STEP[cfg.obs.time_granularity]
    if step is None:
        # Exact: deterministic, disease-order tie-break (reproducible base study).
        df["_ord"] = df["activity"].map(ACTIVITY_ORDER).fillna(500)
        df = df.sort_values(["case", "time", "_ord"]).drop(columns="_ord")
    else:
        # Coarse: round recorded timestamps; same-bin events have ambiguous order,
        # modelled by a reproducible random tie-break (loss of temporal precedence).
        df["time"] = np.round(df["time"] / step) * step
        df["_tb"] = np.random.default_rng(seed ^ 0x9E3779B9).random(len(df))
        df = df.sort_values(["case", "time", "_tb"]).drop(columns="_tb")
    df = df.reset_index(drop=True)
    return EventLogData(log=df, L=L, L_std=L_std, E=E,
                        histories=histories, visit_counts=visit_counts,
                        followup_end=followup, Z=Z, loss_applied=cfg.obs.loss_rate > 0)


def build_event_log(n: int, cfg: SimConfig, seed: int) -> pd.DataFrame:
    return build_event_log_data(n, cfg, seed).log
