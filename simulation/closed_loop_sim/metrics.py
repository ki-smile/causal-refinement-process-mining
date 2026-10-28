"""Structural metrics, graded against the oracle transition graph."""
from __future__ import annotations

from closed_loop_sim.refinement import INITIAL_EDGES, RefinementResult
from closed_loop_sim.truth import TRAP_EDGES, TRUE_EDGES


def structural_metrics(res: RefinementResult, true_edges: set | None = None,
                       trap_edges: set | None = None) -> dict:
    """``true_edges``/``trap_edges`` default to the base-cell oracle; scenarios whose
    data-generating process differs (e.g. true feedback, a removed transition) must pass
    their own truth, otherwise the metrics are graded against the wrong answer."""
    truth = set(TRUE_EDGES if true_edges is None else true_edges)
    traps = set(TRAP_EDGES if trap_edges is None else trap_edges)
    recovered = set(res.edges)
    tp = len(recovered & truth)
    fp = len(recovered - truth)
    fn = len(truth - recovered)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    traps_accepted = sorted(recovered & traps)
    deferred = [(c.frm, c.to) for c, d in res.decisions if getattr(d, "deferred", False)]
    return {
        "precision": precision, "recall": recall, "f1": f1, "shd": fp + fn,
        "death_node_added": "S3" in res.nodes,
        "n_traps_accepted": len(traps_accepted),
        "accepted_S2_S0": ("S2", "S0") in recovered,
        "accepted_S2_S1": ("S2", "S1") in recovered,
        "accepts_any_trap": len(traps_accepted) >= 1,
        "n_other_false_edges": len(recovered - truth - traps),
        "accepted_held_out": ("S2", "S4") in recovered,
        "n_deferred": len(deferred),
        "deferred_true_edges": sum(1 for e in deferred if e in truth),
        "deferred_artefacts": sum(1 for e in deferred if e not in truth),
        "wrongly_removed_true_edges": len((INITIAL_EDGES & truth) - recovered),
    }
