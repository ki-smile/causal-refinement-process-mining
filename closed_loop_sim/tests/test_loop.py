"""Phase 3 integration: discovery -> refinement arms -> structural metrics."""
from __future__ import annotations

import numpy as np

from closed_loop_sim.config import base_cell
from closed_loop_sim.discovery import discover
from closed_loop_sim.eventlog import build_event_log_data
from closed_loop_sim.metrics import structural_metrics
from closed_loop_sim.refinement import ARMS


def _run_arms(seed=1, n=6000):
    cfg = base_cell()
    data = build_event_log_data(n, cfg, seed)
    disc = discover(data.log, data.visit_counts)
    return {arm: structural_metrics(fn(disc)) for arm, fn in ARMS.items()}


def test_dfg_surfaces_both_traps_as_candidates():
    cfg = base_cell()
    data = build_event_log_data(8000, cfg, seed=2)
    disc = discover(data.log, data.visit_counts)
    assert ("S2", "S0") in disc.state_edges
    assert ("S2", "S1") in disc.state_edges
    assert disc.state_edges[("S2", "S0")].risk >= 0.10


def test_arm_A_accepts_at_least_one_trap():
    m = _run_arms()["A"]
    assert m["accepts_any_trap"], "ungoverned arm should accept >=1 trap"


def test_arm_B_rejects_both_traps_and_adds_death():
    m = _run_arms()["B"]
    assert m["n_traps_accepted"] == 0, "governed arm must reject both traps"
    assert m["death_node_added"]
    assert m["accepted_S2_S0"] is False and m["accepted_S2_S1"] is False


def test_arm_B_precision_perfect_and_recovers_discoverable():
    m = _run_arms()["B"]
    assert m["precision"] == 1.0           # no false edges (both traps rejected)
    # Recovers all discoverable true edges; misses only S0->S3 (4.8%, below the
    # 10% Fig-4 support threshold) -> recall 5/6, SHD 1.
    assert abs(m["recall"] - 5 / 6) < 1e-9
    assert m["shd"] == 1


def test_arm_A_precision_degraded_by_traps():
    res = _run_arms()
    assert res["A"]["precision"] < res["B"]["precision"]


def test_arm_C_oracle_is_perfect():
    m = _run_arms()["C"]
    assert m["f1"] == 1.0 and m["shd"] == 0


def test_A_vs_B_contrast():
    res = _run_arms()
    assert res["A"]["n_traps_accepted"] > res["B"]["n_traps_accepted"]


def test_refinement_has_no_module_level_truth_imports():
    import sys
    import closed_loop_sim.refinement as ref
    # Ensure refinement does not export or import truth symbols at module level (Action A09)
    assert not hasattr(ref, "STATE_ORDER"), "refinement module should not import STATE_ORDER from truth"
    assert hasattr(ref, "PHASE1_STATE_ORDER"), "refinement module should define PHASE1_STATE_ORDER from Phase 1 knowledge"


def test_arm_specific_estimation_in_replication_loop():
    from closed_loop_sim.config import base_cell
    from closed_loop_sim.experiment import run_replication, run_cell
    res = run_replication(base_cell(), seed=42, with_estimation=True)
    assert "arm_estimation" in res
    assert "A" in res["arm_estimation"]
    assert "B" in res["arm_estimation"]
    assert "C" in res["arm_estimation"]
    assert "naive" in res["arm_estimation"]["A"]
    assert "adjusted" in res["arm_estimation"]["A"]

    cell_res = run_cell(base_cell(), M=5, with_estimation=True)
    assert "by_arm" in cell_res["estimation"]
    assert "A" in cell_res["estimation"]["by_arm"]
    assert "B" in cell_res["estimation"]["by_arm"]
    assert "C" in cell_res["estimation"]["by_arm"]


def test_category1_primary_estimands_cif_rmst():
    from closed_loop_sim.config import base_cell
    from closed_loop_sim.eventlog import build_event_log_data
    from closed_loop_sim.estimation import s0s1_arm_frame
    from closed_loop_sim.causal import overlap_diagnostics, standardized_contrasts
    data = build_event_log_data(1000, base_cell(), seed=1)
    df = s0s1_arm_frame(data, 10.0, None)
    _, _, w = overlap_diagnostics(data.L_std, data.E)
    c = standardized_contrasts(df.duration.to_numpy(), df.cause.to_numpy(), data.E, w, 10.0)
    assert {"risk_difference", "risk_ratio", "rmtl_difference"} <= set(c)
    assert 0 < c["cif1"] < 1 and 0 < c["cif0"] < 1


def test_aj_cif_matches_hand_calculation_with_competing_event():
    import numpy as np
    from closed_loop_sim.causal import aj_cif
    # 4 subjects, unit weights: CKD at 1, death at 2, CKD at 3, censored at 4
    t, c = np.array([1., 2., 3., 4.]), np.array([1, 2, 1, 0])
    _, cif = aj_cif(t, c, np.ones(4), 10.0)
    # t=1: 1/4 ; t=2: S=0.75, no cause-1 ; t=3: S=0.5 -> +0.5*1/2 = 0.25 -> 0.5
    assert np.allclose(cif, [0.25, 0.25, 0.5, 0.5])


def test_category1_phase4_recommendations():
    from closed_loop_sim.finalize import generate_phase4_recommendations
    recs = generate_phase4_recommendations({})
    assert "primary_estimand" in recs
    assert "Cumulative Incidence Function" in recs["primary_estimand"]


def test_category1_challenge_scenarios():
    from closed_loop_sim.config import base_cell
    from closed_loop_sim.eventlog import build_event_log_data
    cfg = base_cell()
    cfg.dgp.challenge_scenario = "feedback_cvae_ckd"
    data = build_event_log_data(500, cfg, seed=1)
    assert len(data.log) > 0


def test_category1_baselines():
    from closed_loop_sim.refinement import ARMS, initial_dag_only_refinement
    init_res = initial_dag_only_refinement()
    assert len(init_res.nodes) == 3
    assert "Initial" in ARMS
    assert "PC_Temporal" in ARMS


def test_category1_propensity_diagnostics_and_backdoor():
    from closed_loop_sim.config import base_cell
    from closed_loop_sim.eventlog import build_event_log_data
    from closed_loop_sim.calibration import compute_propensity_diagnostics, verify_backdoor_adjustment_set
    data = build_event_log_data(500, base_cell(), seed=1)
    diag = compute_propensity_diagnostics(data)
    assert diag["max_smd_weighted"] < diag["max_smd_raw"]
    assert 0 < diag["ps_min"] < diag["ps_max"] < 1
    bd = verify_backdoor_adjustment_set({"S0", "S1", "S2"}, {("S0", "S1")})
    assert bd["backdoor_criterion_satisfied"]


def test_identification_depends_on_the_arm_graph():
    from closed_loop_sim.causal import arm_identification
    from closed_loop_sim.refinement import ARMS
    from closed_loop_sim.config import base_cell
    from closed_loop_sim.discovery import discover
    from closed_loop_sim.eventlog import build_event_log_data
    data = build_event_log_data(6000, base_cell(), seed=2)
    disc = discover(data.log, data.visit_counts)
    idA, idB = (arm_identification(ARMS[a](disc)) for a in "AB")
    assert not idA["state_graph_acyclic"] and idA["outcome_contaminated"]   # S2->S0/S2->S1 are backward edges
    assert idB["state_graph_acyclic"] and not idB["outcome_contaminated"]
    assert idB["backdoor_valid_L"] and not idB["backdoor_valid_L+V"]        # visits are a descendant of E
    assert not idA["latent_effect_identified"] and not idB["latent_effect_identified"]   # A4: no arm identifies it


def test_held_out_artifact_is_not_caught_by_the_gate():
    from closed_loop_sim.config import base_cell
    from closed_loop_sim.discovery import discover
    from closed_loop_sim.eventlog import build_event_log_data
    from closed_loop_sim.metrics import structural_metrics
    from closed_loop_sim.refinement import ARMS
    cfg = base_cell(); cfg.obs.p_held_out = 0.4
    data = build_event_log_data(6000, cfg, seed=3)
    m = structural_metrics(ARMS["B"](discover(data.log, data.visit_counts)))
    assert m["accepted_held_out"] and m["precision"] < 1.0   # honest limitation of fixed rules
    from closed_loop_sim.refinement import ARMS as _A
    d = discover(data.log, data.visit_counts)
    assert not structural_metrics(_A["B_unk"](d))["accepted_held_out"]       # one extra rule catches it
    mm = structural_metrics(_A["B_defer"](d))
    assert mm["n_deferred"] >= 1 and mm["precision"] == 1.0


def test_action_a31_explicit_stopping_rules():
    from closed_loop_sim.config import base_cell
    from closed_loop_sim.eventlog import build_event_log_data
    from closed_loop_sim.discovery import discover
    from closed_loop_sim.refinement import run_iterative_refinement, MechanicalProposer, RulesGate
    data = build_event_log_data(1000, base_cell(), seed=1)
    disc = discover(data.log, data.visit_counts)
    ref_res = run_iterative_refinement(MechanicalProposer(), RulesGate(), disc, max_cycles=5, min_change_patience=2)
    
    assert ref_res.cycles_run > 0
    assert ("stopping_rule" in ref_res.stopped_reason or "max_cycles" in ref_res.stopped_reason or "no_further" in ref_res.stopped_reason)
    assert len(ref_res.cycle_history) == ref_res.cycles_run


def test_action_a10_challenge_scenarios_and_backward_edge_cost():
    from closed_loop_sim.config import base_cell
    from closed_loop_sim.eventlog import build_event_log_data
    from closed_loop_sim.discovery import discover
    from closed_loop_sim.refinement import run_refinement, MechanicalProposer, RulesGate, cost_of_rejecting_true_backward_edges
    cfg = base_cell()
    cfg.obs.challenge_scenario = "held_out_artifact"
    cfg.obs.p_held_out = 0.4
    data = build_event_log_data(1000, cfg, seed=1)
    disc = discover(data.log, data.visit_counts)
    ref_res = run_refinement(MechanicalProposer(), RulesGate(), disc)
    
    true_feedback_edges = {("S0", "S1"), ("S0", "S2"), ("S0", "S3"), ("S1", "S2"), ("S1", "S3"), ("S2", "S3"), ("S2", "S1")}
    cost = cost_of_rejecting_true_backward_edges(ref_res, true_feedback_edges)
    assert "backward_edge_false_negative_rate" in cost
    assert cost["fn_count"] >= 0


def test_action_a33_demonstrator_benchmark(tmp_path):
    from closed_loop_sim.benchmark import benchmark_demonstrator
    res = benchmark_demonstrator(n=500, seed=42, out_dir=tmp_path)
    assert res["n_trajectories"] == 500
    assert "timing_sec" in res
    assert "memory" in res
    assert "Cycle-based diagnostic workflow" in res["framework_operating_mode"]
    assert (tmp_path / "benchmark.json").exists()





def test_scenario_truth_changes_the_grade():
    from closed_loop_sim.refinement import RefinementResult
    res = RefinementResult(nodes={"S0", "S1", "S2", "S3"},
                           edges={("S0", "S1"), ("S0", "S2"), ("S1", "S2"), ("S1", "S3"), ("S2", "S3"), ("S2", "S1")}, decisions=[])
    base = structural_metrics(res)
    fb = structural_metrics(res, true_edges={("S0", "S1"), ("S0", "S2"), ("S0", "S3"), ("S1", "S2"),
                                             ("S1", "S3"), ("S2", "S3"), ("S2", "S1")})
    assert fb["precision"] > base["precision"]


def test_latent_confounder_changes_exposure_and_oracle_streams_consistently():
    from closed_loop_sim.dgp import draw_population_setup
    cfg = base_cell(); cfg.dgp.frailty_exposure = 1.0; cfg.dgp.frailty_hazard = 0.5
    L, Ls, Z, E, _ = draw_population_setup(2000, cfg.dgp, 7)
    assert abs(np.corrcoef(Z, E)[0, 1]) > 0.1
    L0, _, Z0, E0, _ = draw_population_setup(2000, base_cell().dgp, 7)
    assert (Z0 == 0).all() and np.allclose(L0, L)    # base cell: covariates identical, no Z


def test_loss_to_follow_up_truncates_records_and_hides_deaths():
    cfg = base_cell(); cfg.obs.loss_rate = 0.5
    data = build_event_log_data(1500, cfg, seed=4)
    assert (data.followup_end <= 10.0).all() and data.followup_end.mean() < 5
    last = data.log.groupby("case").time.max()
    assert (last <= data.followup_end[last.index.to_numpy()] + 1e-9).all()


def test_competing_event_matters_when_death_is_treated_as_censoring():
    from closed_loop_sim.estimation import s0s1_arm_frame
    from closed_loop_sim.causal import standardized_contrasts, overlap_diagnostics
    from closed_loop_sim.refinement import ARMS
    data = build_event_log_data(6000, base_cell(), seed=11)
    disc = discover(data.log, data.visit_counts)
    _, _, w = overlap_diagnostics(data.L_std, data.E)
    rd = {}
    for arm in ("B", "Initial"):
        f_ = s0s1_arm_frame(data, 10.0, ARMS[arm](disc))
        rd[arm] = standardized_contrasts(f_.duration.to_numpy(), f_.cause.to_numpy(), data.E, w, 10.0)
    assert abs(rd["B"]["cif0"] - rd["Initial"]["cif0"]) > 0.005   # ignoring death as competing inflates CIF


def test_ungated_arm_can_accept_a_mechanical_removal():
    from closed_loop_sim.refinement import NoneGate, RulesGate, Candidate
    c = Candidate("remove_edge", "S1", "S2", 0.0, {})
    assert NoneGate().adjudicate(c).accept and RulesGate().adjudicate(c).accept


def test_oracle_shares_random_numbers_across_exposure_worlds():
    from closed_loop_sim.truth import ckd_truth
    cfg = base_cell()
    for tp in cfg.dgp.transitions.values():
        tp.beta_E = 0.0
    o = ckd_truth(cfg, 400, seed=5, horizon=10.0)
    assert o["risk_difference"] == 0.0 and o["rmtl_difference"] == 0.0   # exact null under common random numbers


def test_qba_rejects_infeasible_detection_probabilities():
    from closed_loop_sim.estimation import qba_detection
    q = qba_detection(0.26, 0.20, se0_assumed=0.8, ratios=(1.0, 1.25, 1.3))
    assert q["adjusted_rd"]["1.30"] != q["adjusted_rd"]["1.30"]     # NaN: se1 would be 1.04
    assert q["adjusted_rd"]["1.25"] == q["adjusted_rd"]["1.25"]
    assert q["nulling_ratio_feasible"] is False                       # nulling ratio 1.30 > 1/Se0 = 1.25: unattainable
