# Supplementary File 3: Ground-Truth Simulation Study Protocol and Reporting Appendix (ADEMP Framework)

**Study Title:** A Closed-Loop Framework for Knowledge-Based Causal Model Refinement Using Process Mining and Human–AI Governance  
**Companion Software:** `closed_loop_sim` Python package (v2.1)  
**Reporting Guideline:** ADEMP Framework for Statistical Simulation Studies (Morris, White, & Crowther, *Stat Med* 2019; 38(11):2074–2101)  
**Execution Environment:** Python 3.10.9, NumPy 2.2.6, SciPy 1.15.3, Pandas 2.3.3, Lifelines 0.30.0, PM4Py 2.7.16.2  
**Master Random Seed:** `20260610`  
**Replications:** $M = 500$ independent Monte Carlo runs at base cell ($n = 5,000$ per replication); $1,000,000$-patient Monte Carlo oracle  

---

## 1. AIMS (A)

### 1.1. Context and Methodological Problem
Observational real-world data (RWD) analyses frequently suffer from model misspecification due to omitted competing risks, unmodeled mediator pathways, or misidentified temporal orderings. Conversely, purely automated data-driven discovery algorithms (e.g., standard process mining or constraint-based causal discovery) are vulnerable to observation-induced artifacts: electronic health record (EHR) surveillance bias, administrative billing switches, and diagnostic re-coding.

The primary aim of this simulation study is to evaluate the performance of the proposed **governed closed-loop refinement framework** against an explicit ground truth under controlled data-generating mechanisms. 

### 1.2. Scope of Inference and Terminological Clarity
In response to reviewer feedback, we establish a strict boundary regarding what the simulation evaluates:
* **Transition Graphs vs. Causal DAGs:** The empirical Directly-Follows Graph (DFG) discovered by process mining reflects *temporal succession and event frequency in recorded data*, not latent biological causality. Structural recovery metrics (precision, recall, F1, structural Hamming distance) measure the classification of *data-generating process (DGP) state transitions*, not the automated discovery of an unobserved causal DAG.
* **Exploratory Appraisal vs. Confirmatory Proof:** The closed loop is evaluated as a *diagnostic hypothesis prioritisation mechanism* designed to prevent the adoption of observational artifacts and surface analytical hazards (competing mortality, mediation) prior to statistical estimation.

### 1.3. Specific Hypotheses Tested
1. **Hypothesis 1 (Structural Recovery):** The governed loop (Arm B) recovers valid high-support transitions and successfully introduces the absorbing `Death` competing-risk node.
2. **Hypothesis 2 (Artifact Resistance):** A governed plausibility gate rejects observation-induced decoy edges that an ungoverned configuration (Arm A) erroneously accepts.
3. **Hypothesis 3 (Estimand Integrity):** The statistical model recommended by the refined DAG preserves nominal coverage and eliminates artifact-induced event contamination on target causal estimands.

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
   Refinement Loop: Arm A (Ungated) vs Arm B (Governed) vs Arm C (Oracle)
```

### 2.1. Latent Multi-State Disease Process
Patients progress through four mutually exclusive disease states:
* **$S_0$:** Index therapy initiation / On-drug (PPI or H2B)
* **$S_1$:** Chronic Kidney Disease (CKD progression)
* **$S_2$:** Cardiovascular Adverse Event (CVAE; myocardial infarction / stroke)
* **$S_3$:** Death (absorbing terminal state)

Six biological transitions carry non-zero transition hazard: $S_0 \to S_1$, $S_0 \to S_2$, $S_0 \to S_3$, $S_1 \to S_2$, $S_1 \to S_3$, and $S_2 \to S_3$.

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

| Transition ($j \to k$) | Scale $\lambda_{jk}$ | Shape $\rho_{jk}$ | Exposure Effect $\beta^E_{jk}$ | Covariate Effects $\boldsymbol{\beta}^L_{jk} = (\beta_{\text{age}}, \beta_{\text{sex}}, \beta_{\text{dm}}, \beta_{\text{htn}}, \beta_{\text{egfr}})$ | Biological Interpretation |
|:---|:---:|:---:|:---:|:---|:---|
| **$S_0 \to S_1$ (Index $\to$ CKD)** | $0.0140$ | $1.20$ | **$+0.25$** | $(+0.30, 0.00, +0.35, +0.20, -0.45)$ | PPI increases renal disease incidence |
| **$S_0 \to S_2$ (Index $\to$ CVAE)** | $0.0038$ | $1.10$ | **$+0.20$** | $(+0.35, 0.00, +0.30, +0.30, -0.10)$ | Direct vascular effect of exposure |
| **$S_0 \to S_3$ (Index $\to$ Death)** | $0.0032$ | $1.05$ | $+0.05$ | $(+0.55, 0.00, +0.20, +0.15, -0.15)$ | Low background baseline mortality |
| **$S_1 \to S_2$ (CKD $\to$ CVAE)** | $0.0285$ | $1.15$ | **$0.00$** | $(+0.25, 0.00, +0.30, +0.30, -0.20)$ | **Pure mediation:** PPI accelerates CKD onset, not CKD$\to$CVAE rate |
| **$S_1 \to S_3$ (CKD $\to$ Death)** | $0.0207$ | $1.10$ | $+0.10$ | $(+0.50, 0.00, +0.25, +0.15, -0.25)$ | Renal-associated competing mortality |
| **$S_2 \to S_3$ (CVAE $\to$ Death)** | $0.1304$ | $0.95$ | $+0.10$ | $(+0.40, 0.00, +0.20, +0.10, -0.10)$ | High acute post-infarction mortality |

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
   * Following a recorded CVAE, with probability $p_{\text{switch}} = 0.40$, an administrative `MedicationChange` event occurs at the subsequent encounter. In the naive directly-follows graph, this appears as an apparent causal edge from disease outcome back to drug therapy ($S_2 \to S_0$).
4. **Injected Decoy Artifact 2: Reverse Coding Shift ($S_2 \to S_1$):**
   * Following a recorded CVAE, with probability $p_{\text{recode}} = 0.30$, a hospitalization lab panel results in a spurious re-coding event (`CKD_recode`). In the DFG, this generates a reverse transition from CVAE to CKD ($S_2 \to S_1$).

### Table S3.2. Mapping from recorded EHR activities to multi-state DAG nodes

| Activity Label in Raw Event Log | Multi-State Node | State Semantics | Administrative vs Biological |
|:---|:---:|:---|:---|
| `IndexDrug` | $S_0$ | Exposure initiation (PPI or H2B) | Baseline exposure encounter |
| `CKD_recorded` | $S_1$ | Primary documented renal impairment | Biological onset (delayed by visit interval) |
| `CKD_recode` | $S_1$ | Re-tested / re-coded renal encounter | Observation-induced coding shift |
| `CVAE_recorded` | $S_2$ | Documented acute myocardial infarction / stroke | Acute biological outcome |
| `MedicationChange` | $S_0$ | Post-infarction secondary drug adjustment | Administrative prescription change |
| `Death` | $S_3$ | All-cause terminal mortality | Terminal absorbing state |
| `Lab_Reassay` *(Held-Out)* | $S_4$ *(Unk)* | Routine administrative laboratory re-draw | Non-causal hospital protocol |

---

## 3. ESTIMANDS (E)

### 3.1. Primary Causal Estimand: Standardized Cumulative Incidence Risk Difference
The primary target trial estimand is the **marginal 10-year CKD Cumulative Incidence Function (CIF) Risk Difference**, accounting for competing death:
$$\Delta_{\text{CIF}}(10) = P(T \le 10, J = S_1 \mid \text{do}(E = 1)) - P(T \le 10, J = S_1 \mid \text{do}(E = 0))$$
evaluated using the Aalen–Johansen non-parametric estimator with Inverse Probability of Treatment Weighting (IPTW).

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

### 3.4. Causal Mediation Oracle
Estimated via high-precision counterfactual g-computation on the simulator ($n = 50,000$):
* Natural Direct Effect on 10-year CVAE incidence: $0.00902$
* Natural Indirect Effect operating through CKD: $0.00730$
* **True Mediated Proportion:** $\frac{0.00730}{0.01632} = \mathbf{44.7\%}$

---

## 4. METHODS AND REFINEMENT ARMS (M)

### 4.1. Refinement Configurations (Study Arms)
Process mining discovers a DFG using PM4Py; transitions exceeding support threshold $s_{\min} = 0.10$ are surfaced as candidate DAG updates.

* **Arm A (Ungated Proposal-Only):** A mechanical proposer adds every surfaced transition ($s \ge s_{\min}$) absent from the initial DAG. All proposals are accepted without review. (Proxy for ungoverned AI).
* **Arm B (Governed - Two Rules):** Proposer combined with a deterministic biological plausibility gate:
  1. *Rule R1 (Directionality / Precedence Gate):* Rejects transitions reversing the established clinical timeline ($S_2 \to S_1$).
  2. *Rule R2 (Activity-Type Gate):* Rejects administrative encounters ($S_2 \to S_0$).
  3. *Rule R3 (Competing Risk Gate):* Inserts absorbing node $S_3$ (Death) when terminal mortality exceeds $10\%$.
* **Arm B_unk (Extended Gate):** Incorporates an unknown-node filter, automatically rejecting activities outside the clinical vocabulary (e.g., `Lab_Reassay`).
* **Arm B_defer (Three-Way Decision Gate):** Introduces a `DEFER` category when automated rules detect conflict, routing candidate transitions to human expert adjudication.
* **Arm C (Oracle):** Handed the true DAG architecture; theoretical upper bound.
* **Baseline 1 (Initial Knowledge DAG):** Literature-derived DAG ($S_0 \to S_1, S_0 \to S_2, S_1 \to S_2$; omitting Death $S_3$).
* **Baseline 2 (Forward-Order Temporal Filter / PC-Temporal):** Purely data-driven algorithmic filter retaining transitions where mean timestamp $t_{\text{target}} > t_{\text{source}}$.

---

## 5. PERFORMANCE MEASURES & MONTE CARLO UNCERTAINTY (P)

### 5.1. Performance Criteria
* **Transition-Graph Classification:** Precision, Recall, F1 score, Structural Hamming Distance (SHD) graded against the 6 true DGP state transitions.
* **Artifact Rejection Rate:** Proportion of replications where Arm accepts $\ge 1$ injected decoy.
* **Causal Estimand Recovery:** Mean $\hat{\Delta}$, Bias ($\hat{\Delta} - \Delta_{\text{oracle}}$), Monte Carlo Standard Error (MCSE), Root Mean Square Error (RMSE), and 95% Confidence Interval Coverage.

### 5.2. Sample Size ($n$) and Replication Count ($M$) Rationale
* Sample size per replication $n = 5,000$ was selected to match typical regional registry cohorts while testing detection limits for rare background transitions (e.g., $S_0 \to S_3$ baseline mortality at $\approx 4.8\%$).
* Replication count $M = 500$ was pre-specified. By the central limit theorem, the MCSE of the mean risk difference is $\text{MCSE} = \frac{\text{SD}}{\sqrt{500}} \approx \frac{0.014}{\sqrt{500}} \approx 0.0006$, providing high precision for detecting bias as small as $0.001$.

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

### Table S3.5. Structural recovery and artifact resistance ($M = 500$, $n = 5,000$)

| Arm / Configuration | Precision (MCSE) | Recall (MCSE) | F1 Score | SHD | Death Added | Decoys Accepted | Accepts $\ge 1$ Trap | 95% Wilson CI |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Arm A (Ungated)** | $0.714$ ($0.000$) | $0.833$ ($0.000$) | $0.769$ | $3.00$ | $1.00$ | $2.00$ | **$100.0\%$** | $[99.2\%, 100.0\%]$ |
| **Arm B (Governed)** | **$1.000$** ($0.000$) | $0.833$ ($0.000$) | **$0.909$** | **$1.00$** | $1.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |
| **Arm B_unk (Extended)** | **$1.000$** ($0.000$) | $0.833$ ($0.000$) | **$0.909$** | **$1.00$** | $1.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |
| **Arm B_defer (Three-Way)**| **$1.000$** ($0.000$) | $0.833$ ($0.000$) | **$0.909$** | **$1.00$** | $1.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |
| **Arm C (Oracle)** | $1.000$ ($0.000$) | $1.000$ ($0.000$) | $1.000$ | $0.00$ | $1.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |
| **Baseline 1 (Initial DAG)**| $1.000$ ($0.000$) | $0.500$ ($0.000$) | $0.667$ | $3.00$ | $0.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |
| **Baseline 2 (PC-Temporal)**| $1.000$ ($0.000$) | $0.833$ ($0.000$) | $0.909$ | $1.00$ | $1.00$ | $0.00$ | **$0.0\%$** | $[0.0\%, 0.76\%]$ |

*Explanation of Recall = 0.833:* All data-driven arms achieve recall of 5/6 (0.833) rather than 1.00 because the direct baseline mortality transition $S_0 \to S_3$ occurs at an empirical frequency of $4.8\%$, below the pre-specified discovery threshold $s_{\min} = 0.10$.

### Table S3.6. Primary causal estimand recovery ($\Delta_{\text{CIF}}$, True Oracle = $0.0461$)

| Configuration | Mean $\hat{\Delta}_{\text{CIF}}$ | Bias | Bias MCSE | RMSE | Bootstrap SE | 95% Interval Coverage |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Latent Benchmark (Unobserved Clean Truth)** | $0.0455$ | **$-0.0005$** | $0.0006$ | $0.0142$ | $0.0147$ | **$93.6\%$** (Valid Estimator) |
| **Arm A (Ungated Recorded)** | $0.0603$ | $+0.0142$ | $0.0007$ | $0.0201$ | $0.0145$ | $80.2\%$ |
| **Arm B (Governed Recorded)** | $0.0569$ | $+0.0108$ | $0.0006$ | $0.0177$ | $0.0142$ | $86.6\%$ |
| **Arm C (Oracle Recorded)** | $0.0569$ | $+0.0108$ | $0.0006$ | $0.0177$ | $0.0142$ | $86.6\%$ |
| **Baseline 1 (Initial DAG Recorded)** | $0.0579$ | $+0.0118$ | $0.0006$ | $0.0183$ | $0.0143$ | $84.2\%$ |

**Key Takeaway:** The latent benchmark proves the estimator is unbiased ($\text{Bias} = -0.0005, \text{Coverage} = 93.6\%$). On recorded EHR data, the remaining bias ($+0.0108$) is pure surveillance bias from differential visit intensity ($\kappa = 2.0$), which is identical across governed and oracle arms. Arm B eliminates trap-induced contamination, improving over Arm A by $0.0034$ (MCSE $0.0001$). Refinement prevents harm rather than improving estimation beyond the data's limits.

---

## 6. SENSITIVITY ANALYSES AND ROBUSTNESS SWEEPS

To evaluate boundary performance, five one-factor-at-a-time sweeps were executed from the base cell (data read from `results/sweeps.csv`).

### Table S3.7. Comprehensive robustness sweeps across 5 experimental factors

| Factor | Factor Level | Replications $M$ | Arm A Precision | Arm B Precision | Arm B Recall | Decoy Risk | Recode Risk | Naive Cox Bias | Latent Cox Bias |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Sample Size ($n$)** | $n = 1,000$ | $80$ | $0.720$ | **$1.000$** | $0.833$ | $0.335$ | $0.149$ | $+0.105$ | $+0.022$ |
| | $n = 5,000$ | $80$ | $0.714$ | **$1.000$** | $0.833$ | $0.332$ | $0.148$ | $+0.090$ | $+0.013$ |
| | $n = 20,000$ | $30$ | $0.714$ | **$1.000$** | $0.833$ | $0.337$ | $0.154$ | $+0.071$ | $-0.005$ |
| | $n = 100,000$ | $8$ | $0.714$ | **$1.000$** | $0.833$ | $0.335$ | $0.151$ | $+0.082$ | $+0.002$ |
| **Surveillance ($\kappa$)**| $\kappa = 1.0$ (Equal) | $60$ | $0.720$ | **$1.000$** | $0.833$ | $0.300$ | $0.133$ | **$+0.016$** | $+0.015$ |
| | $\kappa = 1.5$ | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.317$ | $0.145$ | $+0.065$ | $+0.013$ |
| | $\kappa = 2.0$ (Base) | $60$ | $0.716$ | **$1.000$** | $0.833$ | $0.333$ | $0.150$ | $+0.077$ | $-0.001$ |
| | $\kappa = 3.0$ (Severe) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.348$ | $0.158$ | **$+0.112$** | $+0.007$ |
| **Timestamp Granularity**| Exact (Continuous) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.334$ | $0.150$ | — | — |
| | Daily binning | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.270$ | $0.223$ | — | — |
| | Monthly binning | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.265$ | $0.212$ | — | — |
| | Yearly binning | $60$ | $0.714$ | **$1.000$** | $0.833$ | **$0.192$** | $0.167$ | — | — |
| **Confounding Strength** | $\times 0.5$ (Low) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.333$ | $0.150$ | — | — |
| | $\times 1.0$ (Moderate) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.332$ | $0.147$ | — | — |
| | $\times 1.5$ (Strong) | $60$ | $0.714$ | **$1.000$** | $0.833$ | $0.334$ | $0.150$ | — | — |
| **Artifact Injection Rate**| Off ($p=0.0$) | $60$ | **$1.000$** | **$1.000$** | $0.833$ | $0.000$ | $0.000$ | — | — |
| | Low ($p_s=0.2, p_r=0.15$) | $60$ | $0.788$ | **$1.000$** | $0.833$ | $0.168$ | $0.097$ | — | — |
| | High ($p_s=0.6, p_r=0.3$) | $60$ | $0.716$ | **$1.000$** | $0.833$ | $0.499$ | $0.150$ | — | — |

*Support Threshold Sweep ($s_{\min}$):* At $s_{\min} = 0.01$ and $0.02$, Arm B achieves **Recall = 1.000** (recovering the rare $S_0 \to S_3$ edge in $100\%$ of replications). As $s_{\min}$ increases to $0.05$, recall drops to $0.956$; at $s_{\min} \ge 0.10$, recall stabilizes at $0.833$.

---

## 7. RED-TEAM CHALLENGE SCENARIOS (TESTING THE GATE)

To resolve circularity concerns where gate rules were written knowing the base artifacts, we evaluated 6 stress scenarios where the DGP violates gate assumptions.

### Table S3.8. Performance across adversarial red-team scenarios ($M = 100$ per scenario)

| Scenario | Description / DGP Stress | Arm A Precision | Arm B Precision | Arm B Recall | Arm B_unk Precision | Arm B_defer Precision | Defer Rate (Arm B_defer) |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **1. Held-Out Artifact** | Injected `Lab_Reassay` node outside gate's vocabulary | $0.557$ | **$0.717$ (Accepted 98%)** | $0.833$ | **$1.000$** | **$1.000$** | $2.98 \text{ edges/rep}$ |
| **2. True Feedback Coinciding with Decoy** | Biological $S_2 \to S_1$ truly exists in DGP | $0.857$ | **$1.000$ (Rejected 100%)** | **$0.714$ (Missed true edge)**| $1.000$ | **$1.000$** | $1.00 \text{ edges/rep}$ (Sent to expert) |
| **3. True Feedback Without Artifacts** | True cardiorenal feedback with clean data | $1.000$ | $1.000$ | $0.714$ | $1.000$ | $1.000$ | $0.00$ |
| **4. Absent Mediation ($S_1 \to S_2 = 0$)** | Direct effect only; mediator edge truly absent | $0.668$ | **$1.000$** | $0.800$ | $1.000$ | $1.000$ | $0.99 \text{ edges/rep}$ |
| **5. Latent Common Cause (Frailty)** | Unmeasured confounder generating spurious correlation | $0.714$ | **$1.000$** | $0.833$ | $1.000$ | $1.000$ | $1.00 \text{ edges/rep}$ |
| **6. Negative Control ($\beta^E = 0$)** | True null exposure effect | $0.714$ | **$1.000$** | $0.833$ | $1.000$ | $1.000$ | $1.00 \text{ edges/rep}$ |

### Quantitative Bias Analysis (QBA) for Surveillance Bias
Under detection sensitivity analysis on the simulator's true values ($\text{Se}_{\text{PPI}} = 0.937, \text{Se}_{\text{H2B}} = 0.875$), the QBA-adjusted risk difference is **$0.0465$**, closely recovering the oracle of **$0.0461$**. Over feasible sensitivity ratios ($1.00$ to $1.25$), the adjusted risk difference spans $0.0711$ to $0.0099$. The ratio required to completely nullify the association ($1.308$) is mathematically unattainable (implying a detection probability $> 1.0$).

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
Across all $M = 500$ replications of the base cell and all $18$ sweep configurations (exceeding $1,200$ total population runs), **zero numerical exceptions, singular matrix errors, or optimization failures occurred** ($100\%$ completion rate). Lifelines proportional hazards models fit with a minimal ridge penalty ($0.01$) for numerical stability; bootstrap refitting achieved $100\%$ convergence.
