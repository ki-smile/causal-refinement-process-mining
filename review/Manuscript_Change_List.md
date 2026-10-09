# Manuscript change list

**Base for the tracked changes:** the v3 PDF the reviewers read (`latex-manuscriot-v3.pdf`). `Manuscript_REDLINE_vs_v3.pdf` is a word-level redline of v3 against the revised text, so every difference the reviewers could notice is visible, including the ones that predate this revision (section A). `Manuscript_TRACKED_changes.pdf` shows, in the layout of the authors' current LaTeX source, what this revision changed on top of that source (red strikethrough = deleted, blue underline = inserted, magenta tags = reviewer item, orange = author input required). `Manuscript_CLEAN.pdf` is the revised manuscript.

## A. Differences between v3 (reviewed) and the current source -- need author decisions

| Difference | Where | Why it matters | Action |
|---|---|---|---|
| Author list: v3 includes **Carlos Fernandez-Llatas**; the current source does not. Corresponding author: v3 eduardo.illueca@ki.se; source farhad.abtahi@ki.se. | Title page | Authorship changes need an explanation and the agreement of all authors. | **Authors decide**; restore or document in the cover letter. |
| LLM: v3 says GPT-4o-mini via the OpenAI API; source says gemini-2.5-flash via Google AI Studio. | *Large Language Model Configuration* | Reviewers 2 and 4 asked about GPT-4o-mini. | **Authors** state which model produced which output and why it changed. |
| HealthProcessAI (Frontiers 2026) is not cited in v3; the source cites it. | References | R2-5 said it was missing. | Response now says *added*, not *already cited*. |
| Typos and 'direct follow graph (DAG)' in v3 are corrected in the source; 'This hypothesis has been demonstrated' and 'beyond the state of the art' were removed. | Throughout | Reviewers read the old text. | Response says *corrected*, not *not present*. |
| v3 Generative-AI statement (proofreading, Claude Code) is replaced by 'no LLM was used in drafting'. | Back matter | Contradiction. | New Generative AI statement drafted; **authors confirm**. |

## B. Tracked edits to the manuscript (this revision)

| # | Reviewer item | Type | Change |
|---|---|---|---|
| 1 | R2-m5 | format | Line numbers added (lineno); tracked-change macros defined |
| 2 | R2-1,R2-7 | replace | Title reframed as diagnostic appraisal (AUTHOR DECISION D1) |
| 3 | R2-2,R2-3,R4-1 | insert | Abstract Methods: simulation sentence |
| 4 | R3-1,R4-4,R2-7 | replace | Abstract Results: simulation findings, hedged AI claim |
| 5 | R2-7,R3-5,R4-4 | replace | Abstract Conclusions tempered |
| 6 | R2-m5 | insert-block | New abbreviation list |
| 7 | R1-m6 | replace | Abbreviation re-introduced: DAGs |
| 8 | R2-4,R2-6 | replace | Contribution list extended |
| 9 | R2-5 | insert-block | Novelty / overlap statement (new paragraph) |
| 10 | R2-m3 | table | Table 1: wrong citations for constraint-based algorithms and 'Agentic AI' (greedy equivalence search, ref 20) |
| 11 | R3-ref,R4-4 | insert-block | Related work: expert-in-the-loop / LLM causal discovery (reviewer 3 suggestions) |
| 12 | R2-1,R2-m1,R3-3,R1-m6 | insert-block | New subsection: formal definitions, estimand, assumptions, falsification scope, terminology table |
| 13 | R1-3,R1-1,R2-2,R2-4 | insert-block | Phase 3: gate-rule cost/limits and reviewer attributes (new paragraphs) |
| 14 | R2-m3 | replace | Wrong citation (DAGWOOD) for multi-state models; hard-coded table number |
| 15 | R2-m3 | replace | Wrong citation (Table 2 fallacy) for negative controls |
| 16 | R3-1,R3-2,R2-3 | insert-block | Phase 4: primary estimand = standardised CIF/RMTL; HR limitations; separable effects; positivity/DML |
| 17 | R3-5 | insert-block | Explicit stopping rule (implemented in run_iterative_refinement) |
| 18 | R1-m2 | replace | Hard-coded figure/table numbers -> \ref |
| 19 | R2-3,R3-1 | replace | Simulation claim (3) re-stated |
| 20 | R2-2,R2-4,R4-1 | insert-block | Scope paragraph for simulation |
| 21 | R1-m2 | replace | Fig S1 -> \ref |
| 22 | R2-2 | replace | Arms: add baselines |
| 23 | R1-m2 | replace | Fig 4 -> \ref |
| 24 | R2-2,R4-1,R4-2 | replace | Arm B: state explicitly that rules are trap-specific and result is by construction |
| 25 | R2-2 | insert | Two baselines added to the arm list |
| 26 | R2-2,R2-6,R3-2 | insert-block | Challenge scenarios paragraph |
| 27 | R2-3,R2-6,R3-1,R4-3,R1-2 | replace | Outcome metrics: primary estimand, arm-specific estimators, MCSE |
| 28 | R2-1 | replace | Wording: classification, not causal recovery |
| 29 | R2-2 | insert | Baseline finding |
| 30 | R1-m2 | replace | Fig S2 -> \ref |
| 31 | R2-2 | table | Table 5: unknown-node rule, three-way gate, initial-DAG and forward-order-filter rows added |
| 32 | R4-3,R2-2 | replace | Table 5 caption: SD = 0 disclosed |
| 33 | R4-4 | replace | Recall 0.83 qualifier |
| 34 | R1-m2,R2-2 | replace | S0->S3 miss attributed to the threshold, not to sample size |
| 35 | R4-3 | replace | Regenerated numbers |
| 36 | R2-3 | replace | Estimand recovery claim tempered |
| 37 | R2-3,R4-3 | replace | S1->S2 effect described correctly; MCSE and Wilson intervals regenerated |
| 38 | R3-1,R4-3 | table | Table 6 (Cox, secondary): numbers regenerated with the corrected competing-event handling |
| 39 | R1-6,R2-2,R2-3,R2-6,R3-2,R4-2,R4-3,R1-2 | insert-block | New results subsections: identification, primary estimand with interval coverage, detection-sensitivity QBA, overlap, challenge scenarios (own truth), red-team scenarios, benchmark |
| 40 | R2-7,R4-4 | delete | Simulation summary paragraph replaced |
| 41 | R1-m2 | replace | Hard-coded table number |
| 42 | R2-7 | replace | Fig. 1 caption: 'Validation' overstated |
| 43 | R2-m2 | replace | Language: stray 'In contrast, This' |
| 44 | R2-m2 | delete | Duplicated sentence in Results introduction |
| 45 | R1-m7,R2-m2 | replace | Grammar |
| 46 | R1-m7,R2-m2 | replace | Grammar |
| 47 | R2-m2 | replace | Missing space |
| 48 | R1-m7,R2-m2 | replace | Typo 'adress' |
| 49 | R1-m7,R2-m2 | replace | Typo 'accesible' |
| 50 | R1-m6 | replace | Abbreviation re-introduced: DAG |
| 51 | R1-m6 | replace | Abbreviation re-introduced: PPI |
| 52 | R1-m6 | replace | Abbreviation re-introduced: CKD |
| 53 | R1-m6 | replace | Abbreviation re-introduced: DFG |
| 54 | R1-m6 | replace | Abbreviation re-introduced: DFG |
| 55 | R1-m6 | replace | Abbreviation re-introduced: PPI/H2B |
| 56 | R1-m6 | replace | Abbreviation re-introduced: DFG |
| 57 | R1-m6 | replace | Abbreviation re-introduced: RAG |
| 58 | R2-4,R4-2 | insert | LLM configuration: required reproducibility details (author input needed) |
| 59 | R2-4 | replace | AI-use statement made consistent with Generative AI statement |
| 60 | R2-4 | insert-block | Deployment governance paragraph |
| 61 | R2-2,R4-1,R2-7 | insert-block | Use-case selection and hindsight paragraph (user note: use case already published) |
| 62 | R2-5 | insert-block | Provenance table (synthetic vs reproduced vs reused) |
| 63 | R4-4 | replace | Tempered qualitative claim |
| 64 | R4-4 | replace | Tempered qualitative claim (Discussion) |
| 65 | R4-4 | replace | Fig. 6 caption |
| 66 | R3-1 | insert | Caveat on tool's Fine-Gray recommendation |
| 67 | R2-3,R2-7,R4-4 | insert-block | Discussion: refinement prevents harm rather than improves accuracy (note from user) |
| 68 | R2-m3 | replace | Added target-trial-emulation citation |
| 69 | R2-7,R4-4 | replace | Conclusion tempered |
| 70 | R2-7 | replace | Conclusion tempered |
| 71 | R2-7,R4-1 | insert | Conclusion: simulation scope |
| 72 | R1-1,R1-3,R1-6,R2-2,R2-4,R3-2,R4-1 | insert | Limitations extended |
| 73 | R1-1,R1-6 | table | Table 8 (future challenges): three rows added |
| 74 | R2-m4 | insert | Immutable archival record (author action) |
| 75 | R2-4,R2-m4 | insert-block | Generative AI statement (restores v3 disclosure + this revision) |
| 76 | R2-6,R3-4,R4-2,R2-m4 | insert-block | Appendix: complete simulation protocol (ADEMP), all parameters, versions, MCSE, M justification |
| 77 | R1-m2 | replace | Hard-coded table number |
| 78 | R1-m2 | replace | Hard-coded table number |
| 79 | R2-7 | replace | Overclaim removed |
| 80 | R2-7 | replace | 'validation' overclaim |
| 81 | R2-7 | replace | Overclaim removed |
| 82 | R2-7 | replace | Abstract overclaim |
| 83 | R2-7 | replace | Overclaim in Fig. 5 caption |
| 84 | R2-1,R2-7 | replace | 'recovery property' overclaim |
| 85 | R2-1 | replace | True 'causal graph' -> transition graph |
| 86 | R2-4,R4-2 | replace | Unsupported LLM-stability claim |
| 87 | R2-4 | insert | Supplementary File 2 check |
| 88 | R2-7 | replace | Safeguard stated as a recommendation, not a fact |
| 89 | R2-5 | replace | Fig. 4 provenance |
| 90 | R1-2 | replace | Wrong word 'over-corrected' |
| 91 | R1-2 | replace | Gate does not handle surveillance |
| 92 | R3-1 | table | Decision-rule table: Fine-Gray no longer first; CIF/RMTL primary |
| 93 | R3-1 | replace | Mediation oracle relabelled; no estimator evaluated |

## C. Changes to the simulation (all local, nothing committed)

| Change | Why |
|---|---|
| Held-out artefact kept out of the gate's vocabulary; maps to a node outside the Phase-1 ordering; two new arms: *unknown-node rule* and a *three-way (accept/reject/defer)* gate | Reviewers 1/2/4; the earlier 'held-out' artefact was already in the rule list |
| Edge-removal proposals (initial edges almost never observed) | Only 'add' decisions were exercised before |
| Scenario-specific truth when grading structural metrics | The feedback scenarios had been graded against the wrong truth |
| One 1,000,000-patient oracle (common random numbers, SE reported) used in every table | The earlier 50,000 and 20,000 oracles differed by about 0.004 |
| Primary estimand has bootstrap intervals (propensity refitted) and an estimator-validity row on latent data | Coverage of the primary estimand was not reported |
| Competing events defined correctly: death and a CVAE occurring before any CKD; an arm without a death node censors at death | Death had no numeric effect before; CVAE-first patients were kept at risk |
| Identification recast: state-graph cycles are a *warning*, back-door is evaluated for the *recorded* outcome, and the *latent* effect is never identified (A4) | The earlier logic certified the wrong estimand and conflated DFG and DAG |
| Count-based 'IIW' and constant-subtraction 'QBA' removed; replaced by a QBA on differential detection sensitivity with the simulator's true sensitivities as a mechanism check | Visit intensity depends on exposure only, so a per-patient count carries no information within an arm |
| New scenarios: negative control (null effect), latent common cause, loss to follow-up, S1->S2 truly absent; rules frozen (fingerprint recorded) before they ran. **Not blind.** | Reviewers 2/4 asked for mechanisms the rules were not written for |
| Latent common cause and loss to follow-up added to the simulator (disabled by default; base-cell random streams unchanged and verified) | |
| **Codex adversarial review (4 findings, all reproduced and fixed, everything regenerated):** (1) the ungated gate could never accept an edge removal, which inflated the governed-vs-ungated gap in the removal scenario; (2) the simulator's detection sensitivities were not defined under loss to follow-up (now returned as undefined there); (3) the default bias-analysis grid included an impossible detection probability of 1.04 (now feasible ratios only; the nulling ratio is reported as unattainable); (4) the oracle advanced the random-seed counter between the two exposure worlds, so they did not share random numbers (now they do: oracle SE fell from 0.0006 to 0.0002 and the negative-control truth is exactly 0) | Independent challenge review |
| 48 tests pass (was 38), including one regression test per Codex finding | |

## D. Items that need the authors

| Item | Why |
|---|---|
| Authorship and LLM model changes (section A) | Cannot be decided from here. |
| Figures 1 and 3 (colour, larger fonts, legibility) | Original figure files are not in the repository. |
| LLM details: dated model ID, prompts, temperature, runs, variability, RAG corpus, citation-accuracy audit, error taxonomy; Supplementary File 2 | Not recorded. Orange placeholders mark each. |
| What the tool sends to external APIs | Orange placeholder. |
| Commit, tag and Zenodo-archive code, tool and dataset; cite DOI and commit | Results were produced from a dirty working tree (recorded in the metadata). Nothing was committed or pushed. |
| Licence/permission statement for reproduced tables and figures | Orange placeholder. |
| Full reference audit | Flagged by the independent review: [4] has a PubMed URL as its DOI; [43] DOI truncated; [58] wrong volume; VERIFY placeholders (Xu 2023/2025, Guess2Graph, causal process mining, Ban 2023); [34] and [38] may be duplicates; [15], [31], [65] may be mis-cited. |
| Professional language edit; UK vs US spelling; trim the abstract | |
| Title: 'Diagnostic Appraisal of Knowledge-Based Causal Models' (changed from 'Causal Model Refinement'); 'Human-AI Governance' is still in the title although governance was not evaluated | Authors decide. |

## E. Not done

| Request | Status |
|---|---|
| Human or blinded-expert evaluation of governance (R2-4, R4-1) | Excluded by decision. The manuscript says governance is not evaluated. |
| A truly blind red-team (rules frozen, scenarios written by someone else) | Ours is frozen-then-run but not blind. A second use case with an answer unknown to the rule writers is the stronger design and is stated as such. |
| Comparison with PC/GES/PCMCI | The forward-order filter is not PC/GES and is labelled so. |
| Outcome-dependent visit schedules; forward artefacts that create new edges inside the true graph | Not simulated; listed as limitations. |
| Direct/indirect effects per arm; separable effects; double/debiased ML | Recommended in the text, not implemented. |
| Time-indexed causal graph figure | Defined in text and a table; no figure. |
| R port | Not updated; excluded from reported results. |