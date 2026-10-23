# Supplementary File 2: De-Identified Decision Log of the Worked Tutorial Case Study

**Study Identifier:** `HP-CS-2025-001`  
**Study Title:** Closed-Loop Causal Model Refinement: PPI vs H2B, CKD Progression, Cardiovascular Events, and Mortality  
**Software Framework:** HealthProcessAI Closed-Loop Framework (Phases 1–4)  
**Demonstration Cohort:** Synthetic electronic health records calibrated to the Stockholm CREAtinine Measurements (SCREAM) cohort ($N = 294,734$)  
**Named Human Adjudicators:**
- **Dr. Farhad Abtahi** (Lead Causal Methodologist & Senior Investigator, Karolinska Institutet / KTH)
- **Dr. Eduardo Illueca** (Clinical Epidemiologist & Lead Investigator, Karolinska Institutet)  
**Governance Protocol:** Asymmetric Human-in-the-Loop (*AI Proposes, Humans Decide*)  
**Export Timestamp:** 2026-06-10T16:45:00Z  

---

## 1. Executive Summary of Tutorial Adjudication

During the four-phase closed-loop refinement of the initial literature-informed Directed Acyclic Graph (DAG), the suggestion engine generated **6 structural and statistical proposals** by comparing the Directly-Follows Graph (DFG) process model against the conceptual causal model. 

Following formal expert adjudication against epidemiological criteria and biological plausibility:
- **4 proposals were ACCEPTED:**
  1. Addition of the **Death** absorbing competing-risk state (`PROP-001`).
  2. Empirical confirmation and retention of the **CKD mediator** pathway (`PROP-004`).
  3. Parametric **transition duration annotation** on surviving DAG edges (`PROP-005`).
  4. Specification of the **Aalen–Johansen standardized 10-year Cumulative Incidence Function (CIF) Risk Difference** with Inverse Probability Weighting as the primary target trial estimand (`PROP-006`).
- **2 proposals were REJECTED:**
  1. Reverse coding shift / surveillance artifact edge `CVAE → CKD` (`PROP-002`).
  2. Administrative post-event medication switch loop `CVAE → MedicationChange` (`PROP-003`).

---

## 2. Structured Decision Log Table

| Proposal ID | Phase | Candidate Modification | Empirical Evidence (Process Mining / DFG) | AI Confidence | Plausibility Gate | Adjudication | Named Adjudicators | Clinical & Methodological Rationale |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **PROP-001** | Phase 3 | **Add Node & Edges:** Absorbing node `Death`; edges `CKD → Death` and `CVAE → Death` | Transition risks to Death: CKD$\to$Death = 23.9% (PPI) vs 17.9% (H2B) [$p < 0.001$]; CVAE$\to$Death = 47.0% (PPI) vs 37.9% (H2B) [$p < 0.001$]. Median time 1.8y and 0.9y. | 0.95 (High) | **PASS** | **ACCEPTED** | Dr. E. Illueca,<br>Dr. F. Abtahi | Mortality is an absorbing competing risk in this longitudinal cohort. Omitting Death forces standard models to treat death as uninformative right-censoring, severely violating non-informative censoring assumptions. |
| **PROP-002** | Phase 3 | **Add Directed Edge:** Reverse cardiorenal edge `CVAE → CKD` | Reverse sequence observed in 24.6% (PPI) vs 24.5% (H2B); OR = 1.006 (95% CI 0.978–1.035, $p = 0.88$; non-differential between exposure arms). | 0.54 (Med) | **FAIL** | **REJECTED** | Dr. E. Illueca,<br>Dr. F. Abtahi | Observational electronic records suffer from post-event surveillance artifacts: acute hospitalization for myocardial infarction triggers routine inpatient metabolic panels that re-detect pre-existing baseline CKD. The lack of exposure-differential confirms a diagnostic artifact. Introducing this edge creates an illegal cyclic graph and blocks mediator identification. |
| **PROP-003** | Phase 3 | **Add Feedback Edge:** `CVAE → MedicationChange` (`S2 → S0`) | 34.2% of surviving CVAE cases record an outpatient pharmacotherapy adjustment within 30 days post-infarction. | 0.88 (High) | **FAIL** | **REJECTED** | Dr. F. Abtahi,<br>Dr. E. Illueca | Post-infarction prescription changes represent clinical guideline-mandated secondary prevention and administrative disease management, not an etiologic disease mechanism. Allowing an edge from S2 back to S0 creates a feedback loop, confounds the baseline index exposure, and induces collider stratification bias. |
| **PROP-004** | Phase 3 | **Validate Mediator:** Confirm `CKD` on causal path `PPI → CKD → CVAE` | Unidirectional temporal precedence: `PPI → CKD` observed in 31.4% (median 3.1y); `CKD → CVAE` observed in 18.2% (median 2.4y). Temporal precedence preserved in 81.3% of dual-event trajectories. | 0.92 (High) | **PASS** | **ACCEPTED** | Dr. E. Illueca,<br>Dr. F. Abtahi | Observed temporal sequence corroborates the biological hypothesis that impaired renal hemodynamics precede macrovascular disease (endothelial dysfunction, vascular calcification). Empirical non-falsification justifies preserving CKD as a candidate mediator for formal mediation modeling. |
| **PROP-005** | Phase 3 | **Edge Dynamics:** Attach parametric transition distributions (median, IQR) | Process mining duration algorithms extracted inter-event survival distributions across all valid edges: S0$\to$S1: 3.1y; S0$\to$S2: 4.2y; S1$\to$S2: 2.4y; S1$\to$S3: 1.8y; S2$\to$S3: 0.9y. | 0.96 (High) | **PASS** | **ACCEPTED** | Dr. F. Abtahi,<br>Dr. E. Illueca | Augmenting qualitative DAG arrows with empirical inter-event survival distributions bridges abstract causal topology and quantitative time-to-event statistical parameterization, setting the 10-year horizon. |
| **PROP-006** | Phase 4 | **Model Selection:** Specify primary target estimand and confounding control | Refined DAG exhibits competing event (`Death`), candidate mediator (`CKD`), and substantial baseline confounding. | 0.93 (High) | **PASS** | **ACCEPTED** | Dr. F. Abtahi,<br>Dr. E. Illueca | Under competing mortality, cause-specific hazard ratios lack direct causal interpretation for cumulative incidence (Hernan 2010, Aalen 2015). Aalen–Johansen standardized 10-year CIF risk difference under IPW weighting chosen as primary estimand; causal mediation analysis specified for pathway decomposition. |

---

## 3. Detailed Decision Provenance Records

### Proposal PROP-001: Addition of Absorbing Node `Death`
- **Initial Context:** The literature-informed DAG in Phase 1 defined exposure, mediator, outcome, and baseline confounders, but omitted mortality.
- **Empirical Signal:** In Phase 2, process mining revealed substantial terminal transitions to mortality:
  $$\text{Risk}(\text{CKD} \to \text{Death}) = 23.9\% \text{ (PPI) vs } 17.9\% \text{ (H2B)}$$
  $$\text{Risk}(\text{CVAE} \to \text{Death}) = 47.0\% \text{ (PPI) vs } 37.9\% \text{ (H2B)}$$
- **Evaluation:** Evaluated against Rule R1 (*Competing Risk Identification Gate*).
- **Adjudication Outcome:** **ACCEPTED**.
- **Impact on Downstream Analysis:** Incorporating Death as a competing-risk node prevents naive Cox regression from censoring deceased patients as if they could still experience subsequent CVAE.

### Proposal PROP-002: Rejection of Reverse Coding Shift `CVAE → CKD`
- **Empirical Signal:** Transition frequency for `CVAE → CKD` reached 24.6% in the empirical process model, above the 10% discovery threshold.
- **Epidemiological Analysis:** In real-world EHRs, patients experiencing severe acute events (myocardial infarction, acute ischemic stroke) are hospitalized and undergo extensive diagnostic workups, leading to delayed documentation of long-standing renal impairment.
- **Differential Test:** Between-group comparison yielded an Odds Ratio of 1.006 (95% CI 0.978–1.035, $p = 0.88$). If PPI accelerated biological CKD following CVAE, an exposure differential would be expected.
- **Adjudication Outcome:** **REJECTED**.
- **Impact on Downstream Analysis:** Preserves acyclicity and prevents diagnostic detection artifacts from corrupting the causal graph.

### Proposal PROP-003: Rejection of Drug-Feedback Decoy `CVAE → MedicationChange`
- **Empirical Signal:** High-frequency transition (34.2%) from CVAE to subsequent medication adjustments.
- **Epidemiological Analysis:** Prescribing changes occurring after cardiovascular events represent secondary prevention and clinical guideline adherence.
- **Adjudication Outcome:** **REJECTED**.
- **Impact on Downstream Analysis:** Prevents feedback loops that would violate DAG structure and induce post-treatment collider stratification.

### Proposal PROP-004: Confirmation of Mediator Role for `CKD Progression`
- **Empirical Signal:** Chronological sequence in 81.3% of joint trajectories showed CKD diagnosis preceding CVAE, with median latency of 3.1 years from drug index to CKD, and 2.4 years from CKD to CVAE.
- **Adjudication Outcome:** **ACCEPTED**.
- **Impact on Downstream Analysis:** The mediator hypothesis is preserved for formal decomposition in Phase 4 rather than being dismissed.

### Proposal PROP-005: Empirical Edge Dynamics Parameterization
- **Empirical Signal:** Inter-event duration distributions extracted via process mining performance algorithms.
- **Adjudication Outcome:** **ACCEPTED**.
- **Impact on Downstream Analysis:** Enables time-aware survival analysis and informs optimal administrative follow-up windows.

### Proposal PROP-006: Phase 4 Model Selection
- **Topology Analysis:** Refined DAG features multi-state trajectories with competing mortality and intermediate mediation.
- **Epidemiological Rationale:** Traditional Cox proportional hazards models do not accommodate competing risks without distorting cumulative incidence. Subdistribution hazard ratios from Fine–Gray models hold limitations for causal interpretation (Young et al., 2020).
- **Adjudication Outcome:** **ACCEPTED**.
- **Recommended Protocol:**
  1. *Primary Estimand:* IPW-standardized 10-year Cumulative Incidence Function (CIF) Risk Difference via the Aalen–Johansen estimator.
  2. *Secondary Estimand:* Restricted Mean Time Lost (RMTL) difference at 10 years.
  3. *Sensitivity Analysis:* Quantitative Bias Analysis (QBA) for differential surveillance sensitivity between exposure arms.

---

## 4. Formal Adjudicator Sign-Off

The undersigned human adjudicators certify that every proposal above was evaluated in accordance with the pre-specified biological and methodological gate rules, that no automated LLM proposal was adopted without explicit human oversight, and that legal and scientific responsibility for the final refined causal graph rests entirely with the named adjudicators.

- **Dr. Farhad Abtahi**, PhD (Associate Professor, Lead Causal Methodologist) — *Signed 2026-06-10*
- **Dr. Eduardo Illueca**, MD, PhD (Clinical Epidemiologist, Lead Investigator) — *Signed 2026-06-10*
