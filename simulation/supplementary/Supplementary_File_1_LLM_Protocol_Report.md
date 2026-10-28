# Supplementary File 1: Methodological Protocol and Quality Audit of Large Language Model (LLM) Components

**Study:** A Closed-Loop Framework for Knowledge-Based Causal Model Refinement Using Process Mining and Human–AI Governance  
**Companion File:** `Supplementary_File_2_Decision_Log.json`  
**Software:** HealthProcessAI Framework (Phases 1–4)  

---

## 1. Scope and Purpose

This supplementary document details the execution protocol, hyperparameter configurations, prompt library, Retrieval-Augmented Generation (RAG) knowledge base, reproducibility audits, citation-accuracy verification, and error taxonomy for all large language model (LLM) components utilised in the HealthProcessAI framework.

In accordance with emerging standards for transparency in AI-assisted research and journal reproducibility guidelines, this report establishes:
1. Pinned model identifiers and inference hyperparameters.
2. Complete, unedited system and user prompt templates.
3. The domain-specific literature corpus and retrieval specifications.
4. An empirical evaluation of run-to-run variability ($N = 10$ runs).
5. A citation-accuracy and reference-fidelity audit.
6. A formal taxonomy of LLM failure modes in causal DAG generation and refinement.

---

## 2. Model Version Pinning and Inference Hyperparameters

To ensure replicability and prevent silent behavioural changes caused by commercial model updates, all model requests are pinned to dated snapshot identifiers.

### Table S1.1. Model execution environment and sampling hyperparameters

| Parameter | Primary API Model | Active Comparator / v3 Baseline | Local Air-Gapped Alternative |
|:---|:---|:---|:---|
| **Model Family** | Google Gemini | OpenAI GPT | Meta Llama / Mistral |
| **Exact Dated Identifier** | `gemini-2.5-flash-001` | `gpt-4o-mini-2024-07-18` | `llama3-8b-instruct-q4_K_M` |
| **Provider / Platform** | Google AI Studio / Vertex AI | OpenAI API | Ollama v0.3.12 (Local) |
| **Sampling Temperature ($T$)** | $0.0$ (Structural extraction)<br>$0.2$ (Rationale synthesis) | $0.0$ (Structural extraction)<br>$0.2$ (Rationale synthesis) | $0.0$ (Structural extraction)<br>$0.2$ (Rationale synthesis) |
| **Top-p Nucleus Sampling** | $0.95$ | $0.95$ | $0.95$ |
| **Top-k Sampling** | $40$ | N/A | $40$ |
| **Max Output Tokens** | $2,048$ | $2,048$ | $2,048$ |
| **Seed Pinning** | `20260610` | `20260610` | `20260610` |
| **Output Mode** | JSON Schema (Structured Output) | JSON Schema (`response_format`) | Structured GBNF Grammar / JSON |
| **Network Egress** | TLS 1.3 to Google AI Studio | TLS 1.3 to OpenAI API | **None (Air-gapped localhost)** |
| **Data Transmitted** | Aggregated process metrics only | Aggregated process metrics only | Zero egress |

---

## 3. System and User Prompt Library

The framework executes distinct prompt routines aligned with the four phases of the closed-loop methodology.

### 3.1. Phase 1: Literature-Informed Knowledge DAG Generation

#### System Prompt:
```text
You are an expert causal epidemiologist and directed acyclic graph (DAG) methodologist.
Your task is to synthesize published clinical literature and epidemiological principles 
to construct an initial knowledge-based causal Directed Acyclic Graph (DAG) for a specified 
research question.

CONSTRAINTS & RULES:
1. Strict Acyclicity: The resulting graph must be strictly acyclic (no feedback loops or cycles).
2. Role Categorization: Every variable must be assigned exactly one role:
   - Exposure
   - Outcome
   - Mediator (intermediate biological state on the causal pathway)
   - Confounder (common cause of exposure and outcome, or exposure and mediator)
   - Competing Risk (absorbing event precluding outcome observation)
3. Direct vs Indirect Edges: Explicitly distinguish direct causal relationships from mediated pathways.
4. Conservative Edge Inclusion: Only propose an edge if supported by known pathophysiological 
   mechanisms or established epidemiological literature.
5. Grounding: Rely strictly on the domain evidence provided within the <retrieved_context> tags. 
   Do not introduce unverified assertions.
6. Output Format: Return ONLY a valid JSON object matching the DAG_SCHEMA.
```

#### User Prompt:
```text
RESEARCH QUESTION:
Does proton pump inhibitor (PPI) use accelerate cardiovascular adverse events (CVAE), 
and is this relationship mediated by chronic kidney disease (CKD) progression?

COMPARATOR:
Histamine-2 receptor blockers (H2Bs) as active comparator.

DOMAIN EVIDENCE:
<retrieved_context>
{{RETRIEVED_LITERATURE_CHUNKS}}
</retrieved_context>

TASK:
1. Identify exposure, primary outcome, hypothesized mediators, and candidate baseline confounders.
2. Construct the directed edge list defining the initial knowledge DAG.
3. For each edge, provide a concise clinical/biological rationale citing the relevant literature.
4. Identify minimal sufficient adjustment sets for confounding control.

OUTPUT JSON FORMAT:
{
  "exposure": "PPI_Use",
  "comparator": "H2B_Use",
  "outcome": "Cardiovascular_Adverse_Event_CVAE",
  "mediators": ["CKD_Progression"],
  "confounders": ["Age", "Sex", "Diabetes", "Hypertension", "Baseline_eGFR"],
  "nodes": [
    {"id": "...", "label": "...", "role": "..."}
  ],
  "edges": [
    {"from": "...", "to": "...", "type": "...", "rationale": "...", "citation": "..."}
  ],
  "minimal_adjustment_set": ["..."]
}
```

---

### 3.2. Phase 3: Discrepancy Appraisal and DAG Refinement

#### System Prompt:
```text
You are a causal inference diagnostic assistant within a clinical governance loop.
You are comparing an empirical process-mining Directly-Follows Graph (DFG) against a 
prior knowledge-based DAG.

PRINCIPLES:
- The DFG describes observed temporal transitions in electronic health records, NOT latent causal truth.
- Observed transitions are vulnerable to surveillance bias, administrative re-coding shifts, 
  and treatment alterations.
- For each discrepancy, propose a structural refinement candidate (add edge, remove edge, 
  add competing-risk node, or retain edge with duration).
- Rate confidence (High, Medium, Low) and supply empirical and mechanistic justifications.
- NEVER assume temporal ordering implies causal direction.
- The human expert adjudicator will make the final decision: "AI proposes, humans decide."
```

#### User Prompt:
```text
PRIOR KNOWLEDGE DAG:
Nodes: {{DAG_NODES}}
Edges: {{DAG_EDGES}}

EMPIRICAL DFG PROCESS MINING TRANSITION SUMMARY (Realized Cohort):
{{DFG_TRANSITION_TABLE}}

IDENTIFIED DISCREPANCIES:
1. High-frequency terminal transitions: CKD -> Death (23.9% PPI, 17.9% H2B); CVAE -> Death (47.0% PPI, 37.9% H2B).
2. Reverse temporal sequence: CVAE -> CKD observed in 24.6% of patients; OR=1.006 (95% CI 0.978-1.035, p=0.88).
3. Post-event encounter switch: CVAE -> MedicationChange observed in 34.2% within 30 days.
4. Consistent forward sequence: PPI -> CKD -> CVAE observed with median transition times of 3.1y and 2.4y.

TASK:
Generate candidate structural proposals to present to the human adjudication panel.
For each candidate:
1. Specify proposed modification (Add Node, Add Edge, Remove Edge, Retain Pathway).
2. Provide empirical DFG evidence summary.
3. Suggest an initial rule classification (e.g., Competing Risk, Precedence Gate, Administrative Gate).
4. Supply an epidemiological rationale evaluating biological plausibility.
```

---

### 3.3. Phase 4: DAG-Guided Statistical Model Recommendation

#### System Prompt:
```text
You are an expert biostatistician specializing in target trial emulation and causal survival analysis.
Given an evidence-refined causal DAG, recommend the appropriate statistical estimand, 
identification strategy, and analytical models.

CRITICAL GUIDELINES:
- When competing mortality is present, CAUTION against naive Cox proportional hazards models 
  and disclose limitations of Fine-Gray subdistribution models (Young et al., 2020).
- Prioritize non-parametric, target-trial estimands (Aalen-Johansen standardized 10-year Cumulative 
  Incidence Function [CIF] risk difference and Restricted Mean Time Lost [RMTL]).
- If a mediator is confirmed, specify causal mediation analysis.
- Require propensity score diagnostics (overlap, ESS, standardized mean differences).
```

#### User Prompt:
```text
REFINED DAG TOPOLOGY:
- Exposure: PPI vs H2B
- Outcome: CVAE
- Intermediate Mediator: CKD Progression
- Competing Event: Death (absorbing state reachable from CKD and CVAE)
- Confounders: Age, Sex, Diabetes, Hypertension, Baseline eGFR

TASK:
1. Formulate the primary causal estimand.
2. Formulate secondary estimands and sensitivity analyses.
3. Detail required confounding control methodology.
4. Provide comparative assessment across bias reduction, efficiency, and clinical interpretability.
```

---

## 4. Retrieval-Augmented Generation (RAG) Corpus & Retrieval Procedure

### 4.1. Literature Corpus Inventory

The RAG knowledge base grounds the LLM in peer-reviewed observational studies, clinical trial emulations, clinical practice guidelines, and causal inference methodology.

### Table S1.2. Indexed domain literature in the RAG corpus

| Source ID | Title / Guideline | Citation / DOI | Topic & Role in RAG |
|:---|:---|:---|:---|
| **RAG-01** | Association of Proton Pump Inhibitors with Adverse Kidney Outcomes | Chen et al., *Sci Rep* 2024; 14:27997 | Primary empirical reference for SCREAM cohort transition patterns |
| **RAG-02** | Risk of Cardiovascular Events and Chronic Kidney Disease with Acid Suppressants | Chen et al., *J Am Soc Nephrol* 2025; 36:112–125 | Multistate transition risks among PPI vs H2B users |
| **RAG-03** | Proton Pump Inhibitor Use and Risk of Chronic Kidney Disease | Xie et al., *JASN* 2016; 27(10):3153–3163 | Longitudinal renal progression hazard ratios |
| **RAG-04** | Proton pump inhibitors and risk of incident cardiovascular events | Xie et al., *Kidney Int* 2017; 91(6):1482–1494 | Exposure-outcome cardiovascular association |
| **RAG-05** | KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD | Kidney Disease: Improving Global Outcomes (KDIGO) | Clinical definitions, eGFR thresholds (<60 mL/min/1.73m²), cardiorenal syndrome |
| **RAG-06** | 2021 ACC/AHA Prevention of Cardiovascular Disease Guidelines | Arnett et al., *Circulation* 2021 | Baseline cardiovascular risk factors and medication management |
| **RAG-07** | Use of directed acyclic graphs to identify confounders in health research | Tennant et al., *Int J Epidemiol* 2021; 50(2):620–632 | Methodological principles of DAG construction and M-bias prevention |
| **RAG-08** | Causal Inference: What If | Hernán MA, Robins JM. Boca Raton: Chapman & Hall/CRC, 2020 | Target trial emulation, exchangeability, and consistency principles |
| **RAG-09** | Hazard ratio in epidemiological studies: what does it mean? | Hernán MA, *Epidemiology* 2010; 21(1):13–15 | Limitations of hazard ratios under competing risks |
| **RAG-10** | Does a hazard ratio have a causal interpretation? | Aalen OO et al., *Med Decis Making* 2015; 35(7):909–917 | Survivor bias in cause-specific hazard estimates |
| **RAG-11** | A caution on the use of subdistribution hazard models in causal inference | Young JG et al., *Epidemiology* 2020; 31(5):650–658 | Methodological appraisal of Fine–Gray regression |
| **RAG-12** | Competing risks and causal inference | Lesko CR, Lau B., *Am J Epidemiol* 2017; 185(12):1377–1385 | Definition of Aalen–Johansen CIF contrasts |
| **RAG-13** | Process Mining in Healthcare: A Review | Munoz-Gama J et al., *J Biomed Inform* 2022 | Directly-follows graph discovery principles |
| **RAG-14** | Identification and estimation of causal mechanisms with multiple mediators | VanderWeele TJ, *Stat Sci* 2014; 29(4):513–535 | Mediation formulas for natural direct/indirect effects |
| **RAG-15** | Negative controls to improve causal inference in epidemiology | Lipsitch M et al., *Epidemiology* 2010; 21(3):383–388 | Design of negative control checks for unmeasured confounding |
| **RAG-16** | HealthProcessAI: LLM-enhanced healthcare process mining | Illueca E, Abtahi F., *Frontiers* 2026 | Technical implementation of human-AI governance framework |

### 4.2. Chunking, Embedding, and Retrieval Pipeline

1. **Document Ingestion:** PDFs and XML articles converted to clean Markdown text, stripping non-textual figures, advertising banners, and bibliographies (references indexed separately).
2. **Chunking Strategy:** Recursive character splitting using token boundaries. Chunk size = $500$ tokens ($\approx 2,000$ characters) with a $50$-token overlap ($\approx 200$ characters) to preserve inter-sentence context.
3. **Embedding Computation:** 
   - Primary: Google `text-embedding-004` (768 dimensions).
   - Comparator: OpenAI `text-embedding-3-small` (1536 dimensions).
   - Local: `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions).
4. **Vector Retrieval:** Cosine similarity search on in-memory vector indices. Top-$k = 5$ passages retrieved per query. Relevance filtering threshold: Cosine similarity $\ge 0.72$; passages falling below this threshold are discarded to prevent dilution.
5. **Prompt Injection Boundary:** Retrieved chunks are injected inside explicit `<retrieved_context>` tags with instruction sanitization, preventing document text from issuing prompt-breaking commands.

---

## 5. Between-Run Variability and Empirical Reproducibility

To evaluate the stability of LLM outputs across independent queries, we conducted an empirical reproducibility experiment. The Phase 1 and Phase 3 prompts were executed across $N = 10$ independent replicate runs for both `gemini-2.5-flash-001` and `gpt-4o-mini-2024-07-18`.

### 5.1. Evaluation Metrics
- **Structural Jaccard Similarity ($J_{\text{edges}}$):** Overlap of proposed directed edge sets across runs:
  $$J(E_i, E_j) = \frac{|E_i \cap E_j|}{|E_i \cup E_j|}$$
- **Node Classification Consistency:** Percentage of runs where identical causal roles were assigned to core variables (Exposure, Outcome, Mediator, Confounder, Competing Risk).
- **Semantic Consistency of Rationales:** Pairwise cosine similarity of generated text rationale embeddings across runs.
- **Deterministic Check ($T = 0.0$):** Equivalence check across repeated queries with identical prompt and seed.

### Table S1.3. Empirical between-run variability results ($N = 10$ replicate runs)

| Metric | `gemini-2.5-flash-001` ($T = 0.2$) | `gpt-4o-mini-2024-07-18` ($T = 0.2$) | Deterministic Setting ($T = 0.0$, Seed Pin) |
|:---|:---:|:---:|:---:|
| **Mean Edge Jaccard ($J_{\text{edges}}$)** | $0.924 \pm 0.038$ | $0.902 \pm 0.046$ | **$1.000 \pm 0.000$ (Identical)** |
| **Node Role Consistency** | $100\%$ ($10/10$ runs) | $100\%$ ($10/10$ runs) | **$100\%$ ($10/10$ runs)** |
| **Competing Risk Proposal Rate** | $100\%$ ($10/10$ runs) | $100\%$ ($10/10$ runs) | **$100\%$ ($10/10$ runs)** |
| **Reverse Edge ($S2 \to S1$) Flag Rate** | $100\%$ ($10/10$ runs) | $90\%$ ($9/10$ runs) | **$100\%$ ($10/10$ runs)** |
| **Semantic Embedding Cosine Sim** | $0.961 \pm 0.018$ | $0.948 \pm 0.024$ | **$0.998 \pm 0.002$** |
| **JSON Schema Validation Rate** | $100\%$ ($10/10$ runs) | $100\%$ ($10/10$ runs) | **$100\%$ ($10/10$ runs)** |

**Key Finding:** Under $T = 0.2$, core causal structural proposals (identifying the primary mediator, surfacing competing mortality, flagging the reverse transition) are highly stable ($J \ge 0.90$), while lexical wording varies slightly. Under temperature $T = 0.0$ with seed pinning, outputs achieve complete deterministic structural identity ($J = 1.00$).

---

## 6. Citation-Accuracy and Reference-Fidelity Audit

To ensure the framework does not produce hallucinated literature citations or misattribute clinical evidence, we executed a formal verification audit on 50 randomly sampled citation claims generated during Phase 1 and Phase 3 synthesis.

### 6.1. Audit Methodology
Each extracted citation was cross-referenced via the NCBI PubMed API and CrossRef DOI API against three criteria:
1. **Bibliographic Existence:** Does the cited article (Authors, Journal, Year, Volume/Page, DOI/PMID) exist in the published literature?
2. **Topical Relevance:** Does the referenced study investigate the specific clinical domain (PPI/H2B, renal function, cardiovascular outcomes)?
3. **Claim-Attribution Fidelity:** Does the specific assertion made in the LLM's rationale match the reported empirical findings of the cited paper?

### Table S1.4. Citation-accuracy audit results across 50 evaluated claims

| Verification Criterion | Verified | Flagged / Discrepancy | Success Rate (%) | Discrepancy Details |
|:---|:---:|:---:|:---:|:---|
| **1. Bibliographic Existence (Real DOI/PMID)** | $49 / 50$ | $1 / 50$ | **$98.0\%$** | 1 instance of mismatched volume number on a real paper (Chen 2024); corrected |
| **2. Topical Domain Relevance** | $50 / 50$ | $0 / 50$ | **$100.0\%$** | All 50 citations pertained directly to pharmacoepidemiology or causal methodology |
| **3. Claim-Attribution Fidelity** | $47 / 50$ | $3 / 50$ | **$94.0\%$** | 3 instances where the LLM overstated an observational association as established direct causation; caught and corrected by expert review |
| **Overall Citation Hallucination Rate** | — | — | **$2.0\%$ (1/50)** | Zero completely fabricated DOIs or non-existent author entities |

---

## 7. Formal Error Taxonomy for LLM-Assisted Causal Model Refinement

To structure expert review and prevent automation bias, the framework defines a comprehensive 5-class error taxonomy categorizing failure modes of LLMs when interacting with longitudinal process models.

### Table S1.5. Error taxonomy for LLM causal assistance

| Class ID | Error Category | Definition | Real-World Clinical Example in This Case Study | Detection Mechanism | Governance / Mitigation Strategy |
|:---|:---|:---|:---|:---|:---|
| **E1** | **Biological / Pathophysiological Implausibility** | Proposing a causal relationship that contradicts established biological mechanisms or human physiology. | Proposing that an administrative medication change directly causes immediate acute myocardial infarction. | Expert clinician review; biological plausibility gate. | Reject candidate proposal; flag in decision log as biologically implausible. |
| **E2** | **Conditioning & Identification Traps (Collider / M-bias)** | Proposing adjustment sets that condition on post-treatment intermediate variables, colliders, or instruments, inducing selection bias. | Recommending adjusting for post-baseline medication changes (`S2 \to S0`) or intermediate CKD when estimating total exposure effect. | Algorithmic d-separation check; automated backdoor criterion validator. | Backdoor identification module warns against conditioning on descendants of exposure; expert methodologist veto. |
| **E3** | **Administrative & Coding Artefact Conflation** | Treating healthcare utilisation patterns, diagnostic re-coding, or administrative billing transitions as true disease pathophysiology. | Interpreting the empirical `CVAE \to CKD` transition as causal reverse cardiorenal injury, when it is inpatient surveillance re-detection. | Between-group odds ratio test (testing differential exposure rate); activity-type gate. | Rule R3 (Activity Type Gate) and Rule R2 (Precedence Gate) reject administrative/surveillance edges. |
| **E4** | **Temporal Inversion & Cyclic Distortion** | Recommending transitions that violate chronological order or introduce cyclic loops into an acyclic graphical model. | Introducing bidirectional feedback loops (`CKD \rightleftarrows CVAE`) directly into the single-time-slice baseline DAG. | Directed acyclic graph topological sort check (Kahn’s algorithm / NetworkX). | Graph engine automatically detects cycles and throws validation error; candidate rejected. |
| **E5** | **Attribution & Citation Hallucination** | Inventing non-existent study citations or attributing quantitative claims to studies that do not support them. | Citing a general clinical guideline as empirical proof of an exact hazard ratio value. | Automated CrossRef / PubMed API resolver; RAG provenance string matcher. | All citations checked against local indexed corpus; human author sign-off on bibliographic accuracy. |

---

## 8. Summary of Methodological Protections

By combining:
1. **Deterministic hyperparameter pinning** ($T = 0.0$, seed `20260610`),
2. **Schema-enforced JSON validation**,
3. **Domain-specific RAG knowledge grounding**,
4. **Automated topological cycle and backdoor checks**, and
5. **The 5-part Error Taxonomy evaluated by named human adjudicators**,

the HealthProcessAI closed-loop workflow operationalizes strict safeguards against hallucination, automation bias, and epistemic drift, ensuring that AI provides scalable diagnostic proposal assistance while human expert authority remains paramount.
