# Supplementary File 3: Ground-Truth Simulation Study Protocol and Reporting Appendix (ADEMP Framework)

**Study Title:** A Closed-Loop Framework for Diagnostic Appraisal of Knowledge-Based Causal Graphs Using Process Mining and Human–AI Governance  
**Companion Software:** `closed_loop_sim` Python package (`v0.1.0`; `https://github.com/ki-smile/causal-refinement-process-mining/tree/main/simulation`)  
**Reporting Guideline:** ADEMP Framework for Statistical Simulation Studies (Morris, White, & Crowther, *Stat Med* 2019; 38(11):2074–2101)  
**Execution Environment:** Python 3.10.9, NumPy 2.2.6, SciPy 1.15.3, Pandas 2.3.3, Lifelines 0.30.0, PM4Py 2.7.16.2  
**Master Random Seed:** `20260610`  
**Replications:** $M = 500$ independent Monte Carlo runs at base cell ($n = 5,000$ per replication); $1,000,000$-patient Monte Carlo oracle  

---

## 1. AIMS (A)

### 1.1. Context and Methodological Problem
Observational real-world data (RWD) analyses frequently suffer from model misspecification due to omitted competing risks, unmodeled intermediate pathways, or misidentified temporal orderings. Conversely, purely automated data-driven discovery algorithms (e.g., standard process mining or constraint-based causal discovery) are vulnerable to observation-induced artifacts: electronic health record (EHR) surveillance bias, administrative billing switches, and diagnostic re-coding.

The primary aim of this simulation study is to evaluate the performance of the **rule-gated closed-loop transition-classification configuration** against an explicit synthetic ground truth under controlled data-generating mechanisms. 

### 1.2. Scope of Inference and Terminological Clarity
In response to reviewer feedback, we establish a strict boundary regarding what the simulation evaluates:
* **Transition Graphs vs. Causal DAGs:** The empirical Directly-Follows Graph (DFG) discovered by process mining reflects *temporal succession and event frequency in recorded data*, not latent biological causality. Structural classification metrics (precision, recall, F1, directed edge-set Hamming distance) measure the classification of *data-generating process (DGP) state transitions*, not the automated discovery of an unobserved causal DAG.
* **Exploratory Appraisal vs. Confirmatory Proof:** The closed loop is evaluated as a *diagnostic hypothesis prioritisation mechanism* designed to prevent the adoption of targeted observational artifacts and surface analytical hazards (competing mortality, intermediate events) prior to statistical estimation. The deterministic rule gate evaluated here does not test LLM proposals or human adjudication.

### 1.3. Specific Hypotheses Tested
1. **Hypothesis 1 (Transition-Set Classification):** The rule-gated configuration (Arm B) recovers high-support transitions and includes the absorbing `Death` competing-risk state.
2. **Hypothesis 2 (Targeted Artifact Resistance):** A deterministic rule-based plausibility gate rejects targeted observation-induced decoy edges that an ungated configuration (Arm A) erroneously accepts in the positive-control scenario.
3. **Hypothesis 3 (Estimand Integrity):** The statistical model mapped from the refined transition set preserves nominal coverage and eliminates artifact-induced event contamination on target causal estimands. *(Empirical finding: only partially supported—the estimator achieves nominal $93.6\%$ coverage on clean latent times and eliminates $+0.0034$ of artifact-induced contamination on recorded data, but recorded-data coverage is $86.6\%$ rather than nominal $95\%$ because transition-set refinement cannot remove the $+0.0108$ irreducible surveillance bias).*

---

## 2. DATA-GENERATING MECHANISMS (D)

The simulator establishes a rigorous separation between the **latent disease process** (unobserved biological truth) and the **observation process** (how healthcare interactions and EHR coding generate recorded timestamps).

```
   LATENT BIOLOGICAL TRUTH (DGP)
   Continuous-time multi-state disease progression
   S0 (Index) ──► S1 (CKD) ──► S2 (CVAE) ──► S3 (Death)
         │
         ▼
   OBSERVATION MECHANISM (EHR Sampling)
   - Poisson visit processes (Differential rate: kappa = 2.0)
   - Detection delays at clinic encounters
   - Injected artifact 1: Post-event drug switch (S2 -> S0)
   - Injected artifact 2: Reverse coding shift (S2 -> S1)
         │
         ▼
   RECORDED EVENT LOG & DFG PROCESS MODEL
   Refinement Loop: Arm A (Ungated) vs Arm B (Rule-Gated) vs Arm C (Oracle)
```

### 2.1. Latent Multi-State Disease Process
Patients progress through four mutually exclusive disease states:
* **$S_0$:** Index therapy initiation / On-drug (PPI or H2B)
* **$S_1$:** Chronic Kidney Disease (CKD progression)
* **$S_2$:** Cardiovascular Adverse Event (CVAE; myocardial infarction / stroke)
* **$S_3$:** Death (absorbing terminal state)

Six biological transitions form the prespecified allowed transition set $\mathcal{T}_{\text{sim}} = \{S_0 \to S_1, S_0 \to S_2, S_0 \to S_3, S_1 \to S_2, S_1 \to S_3, S_2 \to S_3\}$.

#### 2.1.1. Baseline Covariate Generation
Each individual draws a baseline covariate vector $\boldsymbol{L} = (L_1, L_2, L_3, L_4, L_5)^\top$:
* $L_1$ (Age): $L_1 \sim \mathcal{N}(70.0, 10.0^2)$
* $L_2$ (Sex, Female): $L_2 \sim \text{Bernoulli}(0.50)$
* $L_3$ (Diabetes): $L_3 \sim \text{Bernoulli}(0.25)$
* $L_4$ (Hypertension): $L_4 \sim \text{Bernoulli}(0.55)$
* $L_5$ (Baseline eGFR): $L_5 \sim \mathcal{N}(75.0, 15.0^2) \text{ mL/min/1.73m}^2$

Standardized covariates $\tilde{\boldsymbol{L}}$ are defined by centering continuous variables: $\tilde{L}_1 = (L_1 - 70)/10$, $\tilde{L}_2 = L_2 - 0.5$, $\tilde{L}_3 = L_3 - 0.25$, $\tilde{L}_4 = L_4 - 0.55$, and $\tilde{L}_5 = (L_5 - 75)/15$.

#### 2.1.2. Confounded Exposure Assignment
Binary exposure $E \in \{0, 1\}$ (PPI = 1, H2B = 0) is assigned via a logistic propensity score:
$$\text{logit}(P(E = 1 \mid \boldsymbol{L})) = \alpha_0 + \boldsymbol{\alpha}^\top \tilde{\boldsymbol{L}}$$
where $\alpha_0 = 0.80$ (generating an empirical PPI exposure proportion of $\approx 66.7\%$) and:
$$\boldsymbol{\alpha} = (\alpha_{\text{age}}, \alpha_{\text{sex}}, \alpha_{\text{dm}}, \alpha_{\text{htn}}, \alpha_{\text{egfr}})^\top = (0.40, 0.00, 0.50, 0.30, -0.40)^\top$$

#### 2.1.3. Transition Hazard Intensities
Transition waiting times are generated under cause-specific Weibull proportional hazards models with clock-reset at each state entry:
$$h_{jk}(t \mid E, \boldsymbol{L}) = \lambda_{jk} \rho_{jk} t^{\rho_{jk} - 1} \exp\left(\beta^E_{jk} E + \boldsymbol{\beta}^L_{jk} \cdot \tilde{\boldsymbol{L}}\right)$$
where $\lambda_{jk}$ is the scale parameter, $\rho_{jk}$ is the Weibull shape parameter, $\beta^E_{jk}$ is the log-hazard ratio for exposure, and $\boldsymbol{\beta}^L_{jk}$ is the vector of covariate effects.

### Table S3.1. Complete latent Data-Generating Process (DGP) parameters

| Transition ($j \to k$) | Scale $\lambda_{jk}$ | Shape $\rho_{jk}$ | Exposure Effect $\beta^E_{jk}$ | Covariate Effects $\boldsymbol{\beta}^L_{jk} = (\beta_{\text{age}}, \beta_{\text{sex}}, \beta_{\text{dm}}, \beta_{\text{htn}}, \beta_{\text{egfr}})$ | Simulator Specification |
|:---|:---:|:---:|:---:|:---|:---|
| **$S_0 \to S_1$ (Index $\to$ CKD)** | $0.0140$ | $1.20$ | **$+0.25$** | $(+0.30, 0.00, +0.35, +0.20, -0.45)$ | Exposure increases $S_0 \to S_1$ transition intensity |
| **$S_0 \to S_2$ (Index $\to$ CVAE)** | $0.0038$ | $1.10$ | **$+0.20$** | $(+0.35, 0.00, +0.30, +0.30, -0.10)$ | Direct $S_0 \to S_2$ exposure effect |
| **$S_0 \to S_3$ (Index $\to$ Death)** | $0.0032$ | $1.05$ | $+0.05$ | $(+0.55, 0.00, +0.20, +0.15, -0.15)$ | Low background baseline mortality |
| **$S_1 \to S_2$ (CKD $\to$ CVAE)** | $0.0285$ | $1.15$ | **$0.00$** | $(+0.25, 0.00, +0.30, +0.30, -0.20)$ | **Pure indirect pathway:** Exposure increases $S_1$ onset, with $\beta^E_{12} = 0$ on $S_1 \to S_2$ |
| **$S_1 \to S_3$ (CKD $\to$ Death)** | $0.0207$ | $1.10$ | $+0.10$ | $(+0.50, 0.00, +0.25, +0.15, -0.25)$ | Renal-state competing mortality |
| **$S_2 \to S_3$ (CVAE $\to$ Death)** | $0.1304$ | $0.95$ | $+0.10$ | $(+0.40, 0.00, +0.20, +0.10, -0.10)$ | High post-CVAE mortality |

*Note:* Trajectories are sampled via the standard competing-risks minimum waiting time algorithm: $T_{jk} = \left(-\frac{\ln U}{\lambda_{jk} \exp(\beta^E_{jk} E + \boldsymbol{\beta}^L_{jk} \tilde{\boldsymbol{L}})}\right)^{1/\rho_{jk}}$ with $U \sim \text{Uniform}(0, 1)$. Patients are followed until $S_3$ (Death) or administrative censoring at $t_{\max} = 10.0$ years.

---

### 2.2. Observation Process and Artifact Injection

Real-world observational registries do not record latent disease onset continuously; clinical events are recorded during clinical encounters.

1. **Healthcare Encounters (Surveillance Bias):** Clinic visits occur as an independent Poisson process with intensity:
   $$\lambda_{\text{visit}}(E) = \lambda_{\text{base}} \cdot \left(\kappa \cdot E + (1 - E)\right)$$
   In the base cell: $\lambda_{\text{base}} = 1.0 \text{ visit/year}$, and the monitoring multiplier $\kappa = 2.0$. Consequently, PPI users generate clinic visits at twice the rate of H2B users ($\lambda_{\text{PPI}} = 2.0$ vs. $\lambda_{\text{H2B}} = 1.0$), creating differential surveillance detection delays.
2. **Clinical Detection Delays:** 
   * CKD ($S_1$) and CVAE ($S_2$) are recorded at the earliest clinic visit occurring at or after latent onset: $t_{\text{recorded}} = \min \{t_{\text{visit}} : t_{\text{visit}} \ge t_{\text{latent}}\}$.
   * Mortality ($S_3$) is recorded with exact timestamp fidelity via registry linkage.
3. **Injected Decoy Artifact 1: Post-Event Drug-Feedback Decoy ($S_2 \to S_0$):**
   * Following a recorded CVAE, with probability $p_{\text{switch}} = 0.40$, an administrative `MedicationChange` event occurs at the subsequent encounter. In the naive directly-follows graph, this appears as an apparent transition from disease outcome back to drug therapy ($S_2 \to S_0$).
4. **Injected Decoy Artifact 2: Reverse Coding Shift ($S_2 \to S_1$):**
   * Following a recorded CVAE, with probability $p_{\text{recode}} = 0.30$, a hospitalization lab panel results in a spurious re-coding event (`CKD_recode`). In the DFG, this generates a reverse transition from CVAE to CKD ($S_2 \to S_1$).

### Table S3.2. Mapping from recorded EHR activities to multi-state transition nodes

| Activity Label in Raw Event Log | Multi-State Node | State Semantics | Administrative vs Biological Role |
|:---|:---:|:---|:---|
| `IndexDrug` | $S_0$ | Exposure initiation (PPI or H2B) | Baseline exposure encounter |
| `CKD_recorded` | $S_1$ | Primary documented renal impairment | Biological onset (delayed by visit interval) |
| `CKD_recode` | $S_1$ | Re-tested / re-coded renal encounter | Observation-induced coding shift |
| `CVAE_recorded` | $S_2$ | Documented acute myocardial infarction / stroke | Acute biological outcome |
| `MedicationChange` | $S_0$ | Post-infarction secondary drug adjustment | Administrative prescription change |
| `Death` | $S_3$ | All-cause terminal mortality | Terminal absorbing state |
| `Lab_Reassay` *(Held-Out Challenge Only)* | $S_4$ *(Unk)* | Routine administrative laboratory re-draw ($p_{\text{held\_out}} = 0.40$) | Unclassified non-causal hospital protocol |

---

## 3. ESTIMANDS (E)

### 3.1. Primary Causal Estimand: Standardized Cumulative Incidence Risk Difference
The primary target trial estimand is the **marginal 10-year CKD Cumulative Incidence Function (CIF) Risk Difference**, accounting for competing death:
$$\Delta_{\text{CIF}}(10) = P(T \le 10, J = S_1 \mid \text{do}(E = 1)) - P(T \le 10, J = S_1 \mid \text{do}(E = 0))$$
evaluated using the Aalen–Johansen non-parametric estimator with Inverse Probability Weighting (IPW).

### 3.2. 1,000,000-Patient Monte Carlo Oracle Truth
To eliminate Monte Carlo error in the ground truth, a super-population of $N = 1,000,000$ individuals was simulated under identical DGP parameters with common random numbers across counterfactual worlds $\text{do}(E=1)$ and $\text{do}(E=0)$:

### Table S3.3. Ground-truth oracle estimands ($N = 1,000,000$, Seed 999)

| Estimand Quantity | True Oracle Value | Oracle Standard Error (SE) | 95% Confidence Bounds |
|:---|:---:|:---:|:---:|
| **$\text{CIF}_1(10)$ (PPI Cumulative Incidence)** | $0.26155$ | $0.00044$ | $[0.26069, 0.26241]$ |
| **$\text{CIF}_0(10)$ (H2B Cumulative Incidence)** | $0.21547$ | $0.00041$ | $[0.21467, 0.21627]$ |
| **Primary Risk Difference ($\Delta_{\text{CIF}}$)** | **$0.04608$** | **$0.00021$** | **$[0.04567, 0.04649]$** |
| **Risk Ratio ($\text{RR}_{\text{CIF}}$)** | $1.21388$ | $0.00281$ | $[1.20837, 1.21939]$ |
| **Restricted Mean Time Lost ($\Delta_{\text{RMTL}}$, years)** | $0.25222$ | $0.00052$ | $[0.25120, 0.25324]$ |

### 3.3. Secondary Estimand: Cause-Specific Log-Hazard Ratio
Cause-specific Cox proportional hazards on $S_0 \to S_1$: True $\beta^E_{01} = 0.2500$. In accordance with Hernán (2010) and Aalen et al. (2015), cause-specific hazard ratios are treated as secondary descriptive parameters due to selection/survivor conditioning under competing mortality.

### 3.4. Separable Counterfactual Mediation Oracle
Estimated via transition-override counterfactual g-computation on the simulator ($n = 50,000$, chosen for computational tractability across nested counterfactual transition-override worlds while maintaining a negligible Monte Carlo SE $< 0.0005$, compared with $N = 1,000,000$ for the single-contrast primary CIF oracle). Whereas Section 3.1 targets 10-year CKD cumulative incidence ($S_1$) as the primary single-event estimand, the mediation decomposition targets 10-year CVAE cumulative incidence ($S_2$) because CKD ($S_1$) is the intermediate state on the $S_0 \to S_1 \to S_2$ pathway. By overriding exposure on the intermediate transition intensity ($S_0 \to S_1$) while holding direct intensities ($S_0 \to S_2, S_0 \to S_3, S_1 \to S_3, S_2 \to S_3$) fixed, the simulator evaluates separable (interventional) transition-override contrasts rather than cross-world natural effects:
* Separable Direct Effect ($\text{CIF}_{10} - \text{CIF}_{00}$) on 10-year CVAE incidence: $0.00902$
* Separable Indirect Effect ($\text{CIF}_{11} - \text{CIF}_{10}$) operating through CKD: $0.00730$
* **Simulated Mediated Proportion:** $\frac{0.00730}{0.01632} = \mathbf{44.7\%}$ *(confirming recovery of the programmed simulator parameter $\beta^E_{01} = +0.25$ with baseline $S_1 \to S_2$ hazard, not biological mediation in real clinical data).*

---

## 4. METHODS AND REFINEMENT ARMS (M)

### 4.1. Refinement Configurations (Study Arms)
Process mining discovers a DFG using PM4Py; transitions exceeding support threshold $s_{\min} = 0.10$ are surfaced as candidate state-transition updates. In the software (`refinement.py`), state transition ordering and administrative activity classification are defined via the constants `PHASE1_STATE_ORDER = {S0: 0, S1: 1, S2: 2, S3: 3}` and `ADMIN_ACTIVITIES = {"MedicationChange"}`. While these constants are stored separately from the simulator's DGP module (`dgp.py`), in this 4-state setup the pre-specified Phase 1 clinical order is identical to the simulator's true forward transition order.

Transition-set classification starts from an initial candidate transition set ($S_0 \to S_1, S_0 \to S_2, S_1 \to S_2$; omitting Death $S_3$) and is evaluated across five configurations:
* **Arm Initial (Baseline 1: Initial Candidate Transition Set):** The initial literature-derived transition set ($S_0 \to S_1, S_0 \to S_2, S_1 \to S_2$; omitting Death $S_3$) prior to process-mining proposals.
* **Arm A (Ungated Proposal-Only):** A mechanical proposer adds every surfaced transition ($s \ge s_{\min}$) absent from the initial transition set. All proposals are accepted without review.
* **Arm B (Rule-Gated):** The same proposer combined with a deterministic rule-based plausibility gate written to target the two base-cell artifacts:
  1. *Rule R1 (Directionality / Precedence Rule):* Rejects candidate transitions that reverse the pre-specified state order ($S_2 \to S_1$).
  2. *Rule R2 (Activity-Type Rule):* Rejects transitions generated by an administrative activity in `ADMIN_ACTIVITIES` ($S_2 \to S_0$).
  3. *Competing-Risk State Inclusion:* Retains the absorbing node $S_3$ (Death) when terminal mortality transitions ($S_1 \to S_3, S_2 \to S_3$) exceed the $10\%$ support threshold.
* **Arm PC_Temporal (Baseline 2: Simple Forward-Order Filter):** A purely temporal-tier filter retaining transitions where target state order exceeds source state order ($a < b$). Despite the historical code label `PC_Temporal`, this baseline is a simple forward-order filter and not the constraint-based Peter–Clark (PC) conditional-independence algorithm.
* **Arm C (Oracle):** Supplied the simulator's true allowed transition set $\mathcal{T}_{\text{sim}}$; serves as an upper-bound benchmark rather than a graph recovered from data.

---

## 5. PERFORMANCE MEASURES & MONTE CARLO UNCERTAINTY (P)

### 5.1. Performance Criteria
* **Transition-Graph Classification:** Precision, Recall, F1 score, and Directed Edge-Set Hamming Distance graded against the 6 allowed DGP state transitions in $\mathcal{T}_{\text{sim}}$.
* **Artifact Rejection Rate:** Proportion of replications where an arm accepts $\ge 1$ injected decoy.
* **Causal Estimand Recovery:** Mean $\hat{\Delta}_{\text{CIF}}$, Bias ($\hat{\Delta}_{\text{CIF}} - \Delta_{\text{oracle}}$), Monte Carlo Standard Error (MCSE), Root Mean Square Error (RMSE), and 95% Confidence Interval Coverage.

### 5.2. Sample Size ($n$) and Replication Count ($M$) Rationale
* Sample size per replication $n = 5,000$ was selected to match typical regional registry cohorts while testing detection limits for rare background transitions (e.g., $S_0 \to S_3$ baseline mortality at $\approx 4.8\%$).
* Replication count $M = 500$ was pre-specified. By the central limit theorem, the MCSE of the mean risk difference is $\text{MCSE} = \frac{\text{SD}}{\sqrt{500}} \approx \frac{0.0140}{\sqrt{500}} \approx 0.0006$, providing high precision for detecting bias as small as $0.001$.

### Table S3.4. Monte Carlo convergence across replication counts $M$ (Base Cell)

| Replications $M$ | Mean $\hat{\Delta}_{\text{CIF}}$ (Arm B) | Bias vs Oracle | Empirical SD | MCSE ($\frac{\text{SD}}{\sqrt{M}}$) | 95% Interval Coverage |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **$M = 10$** | $0.0581$ | $+0.0120$ | $0.0152$ | $0.0048$ | $80.0\%$ |
| **$M = 50$** | $0.0564$ | $+0.0103$ | $0.0144$ | $0.0020$ | $86.0\%$ |
| **$M = 100$** | $0.0571$ | $+0.0110$ | $0.0141$ | $0.0014$ | $87.0\%$ |
| **$M = 250$** | $0.0568$ | $+0.0107$ | $0.0139$ | $0.0009$ | $86.8\%$ |
| **$M = 500$ (Reported)** | **$0.0569$** | **$+0.0108$** | **$0.0140$** | **$0.0006$** | **$86.6\%$** |

### 5.3. Deterministic Structural Variance Disclosure
Because the plausibility rules in Arm B are programmatic and deterministic, all structural metrics exhibit **zero sample standard deviation** ($\text{SD} = 0.000, \text{MCSE} = 0.000$) across all 500 replications. Uncertainty is therefore reported as exact Wilson score 95% confidence intervals on proportions.

### Table S3.5. Structural classification and artifact resistance ($M = 500$, $n = 5,000$)

| Arm / Configuration | Precision (MCSE) | Recall (MCSE) | F1 Score | Hamming Distance | Death Added | Traps Accepted | Accepts $\ge 1$ Trap | 95% Wilson CI |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Arm A (Ungated)** | $0.714$ ($0.000$) | $0.833$ ($0.000$) | $0.769$ | $3.00$ | $1.00$ | $2.00$ | **$100.0\%$** | $[99.2\%, 100.0\%]$ |
| **Arm B (Rule-Gated)** | **$1.000$** ($0.000$) | $0.833$ ($0.000$) | **$0.909$** | **$1.00$** | $1.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |
| **Arm C (Oracle)** | $1.000$ ($0.000$) | $1.000$ ($0.000$) | $1.000$ | $0.00$ | $1.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |
| **Arm Initial (Initial Transition Set)**| $1.000$ ($0.000$) | $0.500$ ($0.000$) | $0.667$ | $3.00$ | $0.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |
| **Arm PC_Temporal (Forward-Order Filter)**| $1.000$ ($0.000$) | $0.833$ ($0.000$) | $0.909$ | $1.00$ | $1.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |

*Notes on Table S3.5:*
1. *Explanation of Recall = 0.833:* All data-driven arms achieve recall of $5/6$ ($0.833$) rather than $1.000$ because the direct baseline mortality transition $S_0 \to S_3$ occurs at an empirical frequency of $4.8\%$, below the pre-specified discovery threshold $s_{\min} = 0.10$.
2. *Equivalence of Arm B and Forward-Order Filter in the Base Cell:* In the base cell, `Arm PC_Temporal` (a simple forward-order filter retaining $a < b$) performs identically to `Arm B` ($\text{Precision} = 1.000, \text{Recall} = 0.833, \text{F1} = 0.909$) because the administrative medication-switch decoy ($S_2 \to S_0$) is also a backward transition in state index order, so the activity-type rule (Rule R2) adds no incremental filtering in the base cell.

### Table S3.6. Primary causal estimand recovery and arm-to-estimator mapping ($\Delta_{\text{CIF}}$, True Oracle = $0.0461$)

| Configuration | Target Event ($J=1$) | Competing Event ($J=2$) | Death ($S_3$) Modeled | Adjustment Set | Mean $\hat{\Delta}_{\text{CIF}}$ | Bias | Bias MCSE | RMSE | Bootstrap SE | 95% Interval Coverage (Wilson CI) |
|:---|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Latent Benchmark (Clean Truth)** | Latent $S_1$ onset | Latent $S_3$ or prior $S_2$ | Yes | $\boldsymbol{L}$ (IPW) | $0.0455$ | **$-0.0005$** | $0.0006$ | $0.0142$ | $0.0147$ | **$93.6\%$** ($[91.1\%, 95.4\%]$) |
| **Arm A (Ungated Recorded)** | Recorded $S_1$ **+ `CKD_recode` contamination** | Recorded $S_3$ or prior $S_2$ | Yes ($S_1, S_2 \to S_3$) | $\boldsymbol{L}$ (IPW) | $0.0603$ | $+0.0142$ | $0.0006$ | $0.0199$ | $0.0145$ | $82.6\%$ ($[79.0\%, 85.7\%]$) |
| **Arm B (Rule-Gated Recorded)** | Primary recorded $S_1$ (`CKD_recorded` only) | Recorded $S_3$ or prior $S_2$ | Yes ($S_1, S_2 \to S_3$) | $\boldsymbol{L}$ (IPW) | $0.0569$ | $+0.0108$ | $0.0006$ | $0.0177$ | $0.0142$ | $86.6\%$ ($[83.3\%, 89.3\%]$) |
| **Arm C (Oracle Recorded)** | Primary recorded $S_1$ (`CKD_recorded` only) | Recorded $S_3$ or prior $S_2$ | Yes (All $\to S_3$) | $\boldsymbol{L}$ (IPW) | $0.0569$ | $+0.0108$ | $0.0006$ | $0.0177$ | $0.0142$ | $86.6\%$ ($[83.3\%, 89.3\%]$) |
| **Arm Initial (Initial Transition Set)** | Primary recorded $S_1$ (`CKD_recorded` only) | Death right-censored (Kaplan–Meier) | **No** (Omitted) | $\boldsymbol{L}$ (IPW) | $0.0580$ | $+0.0119$ | $0.0006$ | $0.0186$ | $0.0145$ | $85.0\%$ ($[81.6\%, 87.9\%]$) |

**Key Takeaway and Mechanism Explanation:**
* **Latent Validity:** Evaluated on clean latent event times, the IPW Aalen–Johansen estimator is unbiased ($\text{Bias} = -0.0005, \text{Coverage} = 93.6\%$).
* **Why Arm B Matches Arm C Exactly Despite Lacking $S_0 \to S_3$:** In the simulation code (`estimation.py`), the Aalen–Johansen estimator responds to whether the absorbing `Death` node ($S_3$) is present in the graph (treating any patient death prior to $S_1$ as a competing event $J=2$ rather than right-censoring), and whether the reverse coding shift ($S_2 \to S_1$) is accepted (which contaminates the $S_1$ event definition with spurious post-CVAE `CKD_recode` events). Because Arm B includes the `Death` state via $S_1 \to S_3$ and $S_2 \to S_3$ and rejects both artifacts, its estimator specification is identical to Arm C ($\hat{\Delta}_{\text{CIF}} = 0.0569, \text{Bias} = +0.0108$).
* **Why Arm A Has Excess Bias ($+0.0142$ vs $+0.0108$):** Arm A has the same recall ($0.833$) as Arm B and *does* include the `Death` node; its additional $+0.0034$ bias ($\text{MCSE} = 0.0001$) arises from accepting the $S_2 \to S_1$ coding-shift artifact (contaminating the CKD outcome definition), whereas `Arm Initial` ($\hat{\Delta}_{\text{CIF}} = 0.0580, \text{Bias} = +0.0119$) incurs $+0.0011$ excess bias from omitting the competing `Death` state and treating pre-CKD death as non-informative right-censoring.
* **Status of Hypothesis 3:** Hypothesis 3 is **not supported on recorded data** for nominal coverage: while rule-gated refinement prevents $+0.0034$ of artifact-contamination harm, the remaining $+0.0108$ bias ($76\%$ of Arm A's total bias) is irreducible surveillance bias ($\kappa = 2.0$), reducing recorded-data coverage to $86.6\%$.

---

## 6. SENSITIVITY ANALYSES AND ROBUSTNESS SWEEPS

To evaluate boundary performance, five one-factor-at-a-time sweeps were executed from the base cell (data read from `results/sweeps.csv` and `results/sweeps.json`).

### Table S3.7. Comprehensive robustness sweeps across 5 experimental factors

| Factor | Factor Level | Replications $M$ | Arm A Precision | Arm B Precision | Arm B Recall | Decoy Risk | Recode Risk | Naive Cox Bias (MCSE) | Latent Cox Bias (MCSE) |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Sample Size ($n$)** | $n = 1,000$ | $80$ | $0.720$ | **$1.000$** | $0.833$ | $0.335$ | $0.149$ | $+0.105$ ($0.020$) | $+0.022$ ($0.019$) |
| | $n = 5,000$ | $80$ | $0.714$ | **$1.000$** | $0.833$ | $0.332$ | $0.148$ | $+0.090$ ($0.007$) | $+0.013$ ($0.007$) |
| | $n = 20,000$ | $30$ | $0.714$ | **$1.000$** | $0.833$ | $0.337$ | $0.154$ | $+0.071$ ($0.005$) | $-0.005$ ($0.005$) |
| | $n = 100,000$ | $8$ | $0.714$ | **$1.000$** | $0.833$ | $0.335$ | $0.151$ | $+0.082$ ($0.004$) | $+0.002$ ($0.005$) |
| **Surveillance ($\kappa$)**| $\kappa = 1.0$ (Equal) | $60$ | $0.720$ | **$1.000$** | $0.833$ | $0.300$ | $0.133$ | **$+0.016$** ($0.009$) | $+0.015$ ($0.008$) |
| | $\kappa = 1.5$ | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.317$ | $0.145$ | $+0.065$ ($0.009$) | $+0.013$ ($0.008$) |
| | $\kappa = 2.0$ (Base) | $60$ | $0.716$ | **$1.000$** | $0.833$ | $0.333$ | $0.150$ | $+0.077$ ($0.009$) | $-0.001$ ($0.008$) |
| | $\kappa = 3.0$ (Severe) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.348$ | $0.158$ | **$+0.112$** ($0.009$) | $+0.007$ ($0.009$) |
| **Timestamp Granularity**| Exact (Continuous) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.334$ | $0.150$ | — | — |
| | Daily binning | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.270$ | $0.223$ | — | — |
| | Monthly binning | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.265$ | $0.212$ | — | — |
| | Yearly binning | $60$ | $0.714$ | **$1.000$** | $0.833$ | **$0.192$** | $0.167$ | — | — |
| **Confounding Strength** | $\times 0.5$ (Low) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.333$ | $0.150$ | — | — |
| | $\times 1.0$ (Moderate) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.332$ | $0.147$ | — | — |
| | $\times 1.5$ (Strong) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.334$ | $0.150$ | — | — |
| **Artifact Injection Rate**| Off ($p_s=0.0, p_r=0.0$) | $60$ | **$1.000$** | **$1.000$** | $0.833$ | $0.000$ | $0.000$ | — | — |
| | Low ($p_s=0.2, p_r=0.15$) | $60$ | $0.788$ | **$1.000$** | $0.833$ | $0.168$ | $0.097$ | — | — |
| | High ($p_s=0.6, p_r=0.3$) | $60$ | $0.716$ | **$1.000$** | $0.833$ | $0.499$ | $0.150$ | — | — |

*Notes on Table S3.7:*
1. *Monte Carlo Uncertainty in Small-$M$ Cells:* For $n = 20,000$ ($M = 30$) and $n = 100,000$ ($M = 8$), small latent Cox biases ($-0.005$ and $+0.002$) are within $\pm 1\text{–}2 \times \text{MCSE}$ ($0.005$) of zero and reflect Monte Carlo sampling noise rather than structural bias.
2. *Support Threshold Sweep ($s_{\min}$, $M = 30$):* At $s_{\min} = 0.01$ and $0.02$, Arm B achieves **Precision = 1.000, Recall = 1.000, F1 = 1.000** (recovering the rare $S_0 \to S_3$ edge in $100\%$ of replications). At $s_{\min} = 0.05$, Arm B achieves **Recall = 0.956 ($0.96$ in Table 8), F1 = 0.976 ($0.98$)** (capturing $S_0 \to S_3$ in $73\%$ of runs). At $s_{\min} = 0.10$ and $0.15$, Arm B achieves **Recall = 0.833 ($0.83$), F1 = 0.909 ($0.91$)** ($S_0 \to S_3$ omitted). At $s_{\min} = 0.20$, Recall drops to **$0.717$ ($0.72$), F1 = 0.833 ($0.83$)**.

---

## 7. RED-TEAM CHALLENGE SCENARIOS (TESTING THE GATE)

To resolve circularity concerns where gate rules were written knowing the base-cell artifacts, we evaluated challenge scenarios where the DGP violates gate assumptions or introduces structural and statistical stress tests.

### Table S3.8. Performance across challenge scenarios ($M = 100$ for structural scenarios; $M = 60$ for estimand red-team checks; $n = 5,000$)

| Scenario | Description / DGP Stress | Arm A Precision | Arm B Precision | Arm B Recall | Arm B Backward FNR |
|:---|:---|:---:|:---:|:---:|:---:|
| **Baseline (Positive Control)** | Base cell ($p_s = 0.40, p_r = 0.30$, no feedback) | $0.714$ | **$1.000$** | $0.833$ | $0.00$ |
| **1. Held-Out Artifact Class** | Injected `Lab_Reassay` node ($p_{\text{held\_out}} = 0.40$) outside gate's vocabulary | $0.557$ | **$0.717$ (Accepted 98%)** | $0.833$ | $0.00$ |
| **2. True Feedback Coinciding with Decoy** | Biological $S_2 \to S_1$ truly exists in DGP alongside artifacts | $0.857$ | **$1.000$ (Rejected 100%)** | **$0.714$ (Missed true edge)** | **$1.00$** |
| **3. True Feedback Without Artifacts** | True cardiorenal feedback ($S_2 \to S_1$) with clean data | $1.000$ | $1.000$ | $0.714$ | **$1.00$** |
| **4. High Artifact Rates** | Elevated switch probability ($p_s = 0.60, p_r = 0.30$) | $0.714$ | **$1.000$** | $0.833$ | $0.00$ |
| **5. Absent Mediation ($\beta_{12} = 0, \lambda_{12} = 0$)** | Direct effect only; $S_1 \to S_2$ transition truly absent | $0.668$ | **$1.000$** | $0.800$ | $0.00$ |
| **6. Latent Common Cause (Unmeasured Frailty)** | Unmeasured confounder affecting exposure and transitions | $0.714$ | **$1.000$** | $0.833$ | $0.00$ |
| **7. Negative Control ($\beta^E = 0$)** | True null exposure effect across all transitions | $0.714$ | **$1.000$** | $0.833$ | $0.00$ |

**Key Findings from Challenge Scenarios:**
* **Failure Modes Under Rule Violations (Scenarios 1–3):** When an unclassified administrative event (`Lab_Reassay`) is injected outside `ADMIN_ACTIVITIES`, it bypasses Arm B in $98\%$ of runs, degrading Arm B precision to $0.717$ ($0.72$ in Table 7). Conversely, when genuine biological feedback ($S_2 \to S_1$) exists in the DGP, the deterministic directionality rule (Rule R1) rejects it in $100\%$ of runs ($\text{Backward FNR} = 1.00$, reducing recall from $0.833$ to $0.714$).
* **Blindness of Transition Classification to Unmeasured Confounding and Null Effects (Scenarios 6 & 7):** In Scenario 6 (Latent Common Cause / unmeasured frailty) and Scenario 7 (Negative Control / $\beta^E = 0$), the structural transition-classification metrics ($\text{Arm A Precision} = 0.714$, $\text{Arm B Precision} = 1.000$, $\text{Arm B Recall} = 0.833$) are **identical to the base cell**. This demonstrates a fundamental methodological boundary: DFG transition classification only filters event-log transitions and cannot detect unmeasured confounding (where recorded $\hat{\Delta}_{\text{CIF}}$ bias rises to $+0.0575$, coverage $1.7\%$) or prevent surveillance-induced false positives under a true null exposure effect (where recorded $\hat{\Delta}_{\text{CIF}} = +0.0162$ vs. true $0.0000$, coverage $76.7\%$).

### Quantitative Bias Analysis (QBA) for Surveillance Bias
Under detection sensitivity analysis on the simulator's true values ($\text{Se}_{\text{PPI}} = 0.937, \text{Se}_{\text{H2B}} = 0.875$), the QBA-adjusted risk difference is **$0.0465$**, closely recovering the oracle of **$0.0461$**. Over feasible sensitivity ratios ($1.00$ to $1.25$ for an assumed unexposed sensitivity of $0.80$), the adjusted risk difference spans $0.0711$ to $0.0099$. The ratio required to completely nullify the association ($1.308$, reported as $1.31$ in the main text) is mathematically unattainable (implying a detection probability $> 1.0$).

---

## 8. SOFTWARE VERSIONS, REPRODUCIBILITY & FAILURE HANDLING

### 8.1. Software Environment
* **Python:** 3.10.9
* **NumPy:** 2.2.6
* **SciPy:** 1.15.3
* **Pandas:** 2.3.3
* **Lifelines:** 0.30.0
* **PM4Py:** 2.7.16.2
* **Pydantic:** 2.11.7
* **NetworkX:** 2.8.4
* **Matplotlib:** 3.10.8

### 8.2. Simulation Failure Handling
Across all $M = 500$ replications of the base cell and all sweep configurations (exceeding $1,200$ total population runs), **zero numerical exceptions, singular matrix errors, or optimization failures occurred** ($100\%$ completion rate). Lifelines proportional hazards models fit with a minimal ridge penalty ($0.01$) for numerical stability; bootstrap refitting achieved $100\%$ convergence.
