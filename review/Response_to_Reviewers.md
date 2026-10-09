# Response to Reviewers

We thank the four reviewers. Every comment is answered below with the location of the change. Where we could not do what was asked, or the evidence does not support a stronger claim, we say so. All simulation numbers were regenerated with the revised code (M = 500, master seed 20260610) and read from the results files. Two points of transparency first. (1) The use case (PPI vs H2B, CKD, CVAE, death) was chosen *because* its results were already published by the authors, as a retrospective known-answer test of whether the pipeline can recover known results; the co-authors who designed the framework and wrote the gate rules also acted as reviewers and had carried out the earlier studies. The manuscript now states this in the Scope of the simulation, a new *Use-case selection and hindsight* paragraph, and the Limitations. (2) The manuscript source we revised differs from the v3 you reviewed in several ways (author list, LLM model, citations, corrected typos and removed claims); a redline against v3 is supplied.

## Summary of the main changes

| Theme | What we did | What the revised evidence shows |
|---|---|---|
| Scope of claims (R2-1, R2-7, R3-5, R4-4) | Reframed as diagnostic hypothesis prioritisation; formal definitions of every graph object, the estimand and assumptions A1-A5; claims tempered. | Structural metrics measure classification of simulator transitions, not causal-DAG recovery. |
| Circularity of the gate (R1-1, R2-2, R4-1) | Stated that the two rules were written knowing the two artefacts; held-out artefact, true feedback, edge removal, negative control, latent confounder, loss to follow-up; two baselines; a one-rule extension and a three-way (defer) gate. | The two-rule gate accepted the held-out artefact in 98% of replications; one extra rule fixes that case; with true feedback coinciding with the coding artefact it rejected the true edge in every replication (the defer arm sends it to the expert instead). A forward-order filter matched it in the base cell. |
| Estimand and arm-specific analysis (R2-3, R3-1) | Primary estimand is the IPW-standardised 10-year CKD risk difference (Aalen-Johansen, competing events) with bootstrap intervals; one 1,000,000-patient oracle; identification flags per arm. | Estimator valid on latent data (bias -0.0005, interval coverage 0.94). On recorded data the risk difference is 1.23x the oracle and the 95% interval covers it 87% of the time. Ungated vs governed: 0.0034 (MCSE 0.0001), i.e. 24% of Arm A's bias. **Refinement prevented harm rather than improved accuracy.** |
| Surveillance bias (R1-2) | Count-based weighting removed (invalid); quantitative bias analysis on differential detection sensitivity. | CKD detection sensitivity: PPI 0.937, H2B 0.875. Adjusting with the true values gives 0.0465 against an oracle of 0.0461: the mechanism explains almost all of the bias, but the sensitivities are unknown to an analyst. |
| Reporting (R1-4/5, R2-6, R3-4, R4-2/3) | Appendix with every parameter, seeds, versions, MCSE, convergence in M, all sweeps. | Structural metrics have zero SD (deterministic); reported as such. |
| Not achievable here (R2-4, R4-1) | -- | No human or LLM adjudication was simulated or measured; we say so. |


## Reviewer 1

**R1 Major 1.** *Trap-specific rules in Arm B; limitation of writing custom rules for every task.*

Agreed. The manuscript now states that the two rules were written knowing the two designed artefacts, so rejection is guaranteed by construction and is a positive control. Phase 3 has a new paragraph on the cost of writing, registering and maintaining rules per task. The scenarios quantify the limit: the held-out artefact was accepted in 98% of replications (Arm B precision 0.72); a one-line unknown-node rule removes that error (precision 1.00), which shows what fixes this failure, not that the next unseen artefact would be caught. The three-way gate defers 1.0 candidates per replication in the true-feedback scenario (1.0 of them true edges), which is the workload cost. Rules are frozen before the red-team scenarios (fingerprint recorded), but the same team wrote both, so that test is not blind.

**Status:** Done within the stated limits; a blind version needs a second party.

**R1 Major 2.** *Surveillance bias in the final estimands; recommend QBA or weighting for monitoring frequency.*

We tried a per-patient visit-count weight and removed it: visit intensity depends on the exposure only, so within an arm it carries no information about detection, and its apparent effect was not interpretable. We replaced it with a quantitative bias analysis on the *sensitivity of detection*. In the simulation, CKD was recorded for 94% of PPI and 88% of H2B patients whose latent CKD began within 10 years; with those values the adjusted risk difference is 0.0465 against an oracle of 0.0461 (recorded 0.0569). With an assumed unexposed sensitivity of 0.80 only ratios up to 1.25 are feasible (larger ones imply a detection probability above 1); over the feasible range the adjusted value runs from 0.0711 to 0.0099, and the ratio that would null the association (1.31) is unattainable, so the conclusion is highly sensitive to the bias parameters. Phase 4 now recommends this analysis, and interval-censored handling of onset times where visit schedules exist. We did not implement inverse-intensity weighting with a visit-process model. The monitoring sweep shows the Cox log-HR bias growing with kappa.

**Status:** Done as a sensitivity analysis; not a correction.

**R1 Major 3.** *What attributes make a human expert suitable?*

New paragraph *Attributes of the expert reviewer* (Phase 3): clinical expertise; causal-inference training; knowledge of the data source's coding and visit patterns; independence with a conflict-of-interest declaration; calibration on known cases; at least two independent reviewers with agreement reported and a third for disagreements. In the demonstration the reviewers were the authors, who had carried out the earlier studies on this subject; the manuscript says so.

**Status:** Done as a specification; the demonstration had no independent reviewers.

**R1 Major 4.** *Software, versions, libraries.*

Appendix lists Python 3.10.9, numpy 2.2.6, pandas 2.3.3, lifelines 0.30.0, pm4py 2.7.16.2, networkx, scipy, pydantic, matplotlib, and `results/environment_freeze.txt`. An earlier committed result file recorded `lifelines: not installed` with all estimates NaN; this is corrected and the code now fails loudly.

**Status:** Done for the simulation. LLM and tool versions need the authors.

**R1 Major 5.** *Why 500 replications?*

No tuning: n and M were fixed a priori by convention and cost. The appendix convergence table gives the MCSE falling with M. Structural metrics are deterministic and need no more replications.

**Status:** Done.

**R1 Major 6.** *Computational limits; subtle hallucinations bypassing review.*

Benchmark at n = 294,734 trajectories (436,395 event rows, about 1.5 events per patient): 33 s, peak RSS 0.82 GB on a macOS-26.5.1-arm64-arm-64bit machine, single process. It computes the state-level summaries only (the activity-level pm4py graph is not built at this scale), uses sparse synthetic sequences, and excludes real data loading and mapping; it is a batch workflow, not streaming. Limitations (iii) discusses hallucinations and automation bias with mitigations.

**Status:** Partly: a synthetic batch benchmark, not a real-EHR scaling study.

**R1 Minor 1.** *Abstract: 'direct follow graph (DAG)'.*

Corrected. DFG/DAG and the other graph terms are used consistently and defined in a terminology table.

**Status:** Done.

**R1 Minor 2, 5.** *Table 1 / Table 2 placement.*

In the compiled revision each table follows its first citation; hard-coded numbers ('Table 2', 'Table 4', 'Table 5', 'Fig. 4', 'Fig. S1') were replaced by cross-references.

**Status:** Done.

**R1 Minor 3, 4.** *Figure 1 in colour with larger fonts; Figure 3 too small.*

Requires the figure sources, which we do not have.

**Status:** **Author action.**

**R1 Minor 6.** *Abbreviations must not be re-introduced.*

Nine re-introductions were removed and an abbreviation list added.

**Status:** Done; a final read-through is advisable.

**R1 Minor 7.** *Typos.*

The listed errors are corrected in the revised text (the redline against v3 shows each). We fixed further ones; a professional language edit and one spelling convention are still needed.

**Status:** Partly; **author action** for the language edit.


## Reviewer 2

**R2 Major 1.** *A DFG is not a causal DAG; define nodes/edges, the time-indexed graph, the estimand and assumptions.*

Agreed. New subsection *Formal definitions and scope of inference*: a terminology table giving each graph object one meaning, the estimand as an equation (competing events defined), assumptions A1-A5, and when a DFG discrepancy can count against an edge (only against the conjunction of the graph and the observation assumptions). Simulation precision/recall/SHD are relabelled *transition-graph classification*. In the code, a cycle in an arm's state graph is now a *warning about backward edges*, not a statement that no adjustment set exists; the back-door criterion is evaluated on the recorded outcome; and the latent effect is reported as not identified in any arm (A4). The title was changed (author decision).

**Status:** Done, except a time-indexed causal graph *figure*.

**R2 Major 2.** *Validation is circular and trap-specific; add forward artefacts, true feedback, latent common causes, alternative observation mechanisms, independent rules, non-oracle baselines; justify 10%.*

Acknowledged in the text (rejection is by construction), and the use case itself was chosen for its known answer. Added: held-out artefact (accepted by the two-rule gate in 98% of replications); one-rule and three-way gate variants; true feedback with and without artefacts; S1->S2 truly absent (edge removal); negative control (null effect); latent common cause; loss to follow-up; two baselines (initial DAG recall 0.50; forward-order filter identical to Arm B in the base cell); a support-threshold sweep (the rare S0->S3 edge is recovered in all replications at s_min <= 0.02 and never at >= 0.10). The 0.10 value follows the original process-map indicator and was not tuned.

**Status:** Partly. **Not done:** independently written or blinded rules; PC/GES/PCMCI; AI-only and expert-only baselines; outcome-dependent visits; forward artefacts creating new edges inside the true graph.

**R2 Major 3.** *Estimand analysis disconnected from the refinement arms.*

Each arm now gets its own analysis, and the manuscript says exactly what differs: an arm that accepts the coding shift contaminates the CKD outcome with recoded events; an arm without a death node censors at death. Differences are small and measured: ungated vs governed 0.0034 (MCSE 0.0001; ungated has the larger absolute error in 71% of replications and the larger risk difference in 84%); initial DAG vs governed 0.0010. The latent estimator is valid (bias -0.0005, coverage 0.94), so the remaining error is surveillance bias, identical across the governed, oracle and baseline arms. The loss-to-follow-up scenario stresses the competing-event handling (Table *redteam*). We therefore describe refinement as *preventing harm rather than improving accuracy* and removed any 'improves estimation' wording. The latent Cox check is described as a model-specification check.

**Status:** Partly. **Not done:** total/direct/indirect effects per arm; the tutorial's PPI-vs-H2B CVAE estimand with CKD mediation.

**R2 Major 4.** *Human-AI governance asserted, not evaluated; LLM details; audit trail; deployment governance.*

We agree it is not evaluated: the simulation has neither an LLM nor humans, and the text says so (Scope of the simulation, Limitations ii). A human study is outside this revision. Added *Deployment governance* (what is sent to external APIs, version pinning, privacy, prompt injection, accountability). The exact model identifier, prompts, temperature, runs, RAG corpus, citation accuracy, error taxonomy and the reviewers' number and expertise are not recorded in the repository; orange placeholders mark them, and the unsupported 'highly stable across runs' claim was replaced by a placeholder.

**Status:** **Not done** (needs a human study and information only the authors hold).

**R2 Major 5.** *Overlap with the authors' HealthProcessAI paper and the SCREAM process map.*

The HealthProcessAI paper is **added** to the reference list (it was not cited in v3). New paragraph *Relation to our previous work and what is new* and a *Provenance* table labelling each item as synthetic, reproduced, reused or new. Figure 4's caption now says the map comes from a synthetic dataset calibrated to SCREAM.

**Status:** Done; licence/permission wording is an **author action**.

**R2 Major 6.** *Incomplete simulation report.*

Appendix (ADEMP; Morris et al. 2019): every DGP parameter, observation process, activity-to-state mapping, propensity coefficients, gate rules, s_min, feedback and scenario parameters, seeds, estimators, software, MCSE, convergence in M, failure handling (none occurred), and one table with every sweep.

**Status:** Done.

**R2 Major 7.** *Claims must match the exploratory role.*

Adopted the reviewer's suggested conclusion almost verbatim. Abstract, results summary, discussion and conclusions tempered; leftover overclaims ('validation', 'recovery property', 'accurately reflects ... empirical reality', 'methodological foundation is robust', 'confirming the mediating role') were reworded.

**Status:** Done.

**R2 Minor 1, 5.** *Term audit; abbreviation list; line numbers.*

Terminology table; abbreviation list; line numbers.

**Status:** Done.

**R2 Minor 2.** *Language edit.*

See R1 Minor 7.

**Status:** **Author action.**

**R2 Minor 3.** *Reference errors; add references.*

Fixed: Table 1 'Agentic AI' and constraint-based citations; multi-state models now cite Andersen & Keiding; negative controls cite Lipsitch; Munoz-Gama and Rojas DOIs; Chen 2024 corrected against PubMed (Sci Rep 14(1):27997). Added references for negative controls, target-trial emulation, competing-event estimands, simulation reporting and the related work. A further check by an independent reviewer found more problems (change list, section D).

**Status:** Partly; **a full reference audit is an author action**.

**R2 Minor 4.** *Exact versions, environment files, immutable commits.*

Versions and an environment freeze are provided; results were produced from a working tree with uncommitted changes (recorded). We have not committed, tagged or archived anything.

**Status:** Partly; **author action** (archive DOI, commit).


## Reviewer 3

**R3 Threat 1 / Essential 1.** *Log-HR lacks causal interpretation under competing risks; Fine-Gray denominator problem.*

The primary estimand is the standardised 10-year CIF contrast and RMTL difference with competing events; the Cox log-HR is secondary with the Hernan 2010 / Aalen 2015 limitation; Fine-Gray is flagged with Young 2020 (the decision-rule table no longer puts it first). Separable effects are recommended and **not implemented**. The mediation oracle is relabelled as a transition-specific, separable-type contrast, not a natural indirect effect, and no estimator is evaluated against it.

**Status:** Done, except separable effects.

**R3 Threat 2 / Essential 2.** *Positivity at 92.8%/7.2%; consider double/debiased ML.*

Positivity diagnostics (propensity range, ESS, maximum weight, SMD before and after) are reported, and an overlap sweep goes to 93% exposure: ESS of the unexposed 1203 to 179, maximum weight 24 to 132, SD of the risk difference 0.013 to 0.036. DML is recommended, not implemented; nothing was run on real data.

**Status:** Partly.

**R3 Threat 3 / Essential 3.** *Formalise exchangeability, positivity, consistency; demonstrate back-door derivation.*

Assumptions A1-A5 are stated; the back-door criterion is applied on the case DAG in text and computed by d-separation in the simulation, on a hand-specified estimand graph for the *recorded* outcome (so it does not claim identification of the latent effect).

**Status:** Done.

**R3 Essential 4.** *Rationale for M, n and the 10% threshold; report parameters.*

Appendix tables, convergence table, threshold sweep, sample-size sweep (structural results unchanged from n = 1,000 to 100,000).

**Status:** Done.

**R3 Essential 5.** *Temper claims; explicit stopping rule.*

Claims tempered. The stopping rule is in *Closing the loop* and implemented; the base cell uses a single pass, so it is exercised only in the benchmark and tests.

**Status:** Done.

**R3 Related work.** *Ankan & Textor; Guess2Graph; causal process mining; Ban et al.*

Cited and contrasted in *State of the Art*; no head-to-head benchmark.

**Status:** Done as discussion; author lists marked VERIFY.


## Reviewer 4

**R4 1.** *Only a deterministic two-rule gate; no humans; circularity.*

See R2 Major 2 and 4. The manuscript now also discloses that the use case was chosen because its results were already published and that the reviewers were co-authors who had carried out the earlier studies, so the study is a known-answer test.

**Status:** Not achievable without a human study; claims narrowed.

**R4 2.** *Replication details.*

Gate rules, Weibull parameters and the s_min justification are in the Appendix. The LLM prompting protocol is not in the repository.

**Status:** Partly; **author action** for the LLM details.

**R4 3.** *No variability for Tables 5 and 6; coverage without uncertainty.*

Table 5's caption states that SD is 0 for every structural metric and gives Wilson intervals; estimator results carry MCSE and Wilson intervals for coverage; the primary estimand now has bootstrap intervals and their coverage (governed arm 87%, Wilson 0.83-0.89).

**Status:** Done.

**R4 4.** *Overstated claims.*

(a), (b) The 'hypothesis has been demonstrated' and 'beyond the state of the art' statements of v3 were removed. (c) 'Aligned with best practice' now reads 'in the authors' assessment', with no independent or blinded review. (d) 'Recovers the true graph' carries the qualifier that recall was 0.83 and one rare edge was missed in every replication.

**Status:** Done.


## Corrections to our own earlier work (not requested by the reviewers)

- The previously committed base-cell results had all Cox estimates NaN (lifelines not installed), M = 5 in the 'FINAL' text, mismatching versions, a negative Wilson bound and identical Arm B and C rows. Everything was regenerated.
- The earlier 'held-out' `Lab_Reassay` artefact was already in the gate's administrative list and could not create a candidate edge; it is now genuinely outside the gate's vocabulary.
- The earlier back-door function returned True for any graph; the earlier identification logic certified the effect on the *recorded* outcome as 'identified' although the paper's own assumption A4 fails; both were rebuilt.
- The earlier challenge-scenario table graded true-feedback scenarios against the wrong truth.
- The earlier count-based 'IIW' and constant-subtraction 'QBA' were removed.
