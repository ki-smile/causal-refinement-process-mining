import { DAGData, NodeType, Suggestion } from './types';

export const INITIAL_CKD_DAG: DAGData = {
  nodes: [
    { id: 'ppi', label: 'PPI Use', type: NodeType.EXPOSURE },
    { id: 'ckd', label: 'CKD Progression', type: NodeType.OUTCOME },
    { id: 'age', label: 'Age', type: NodeType.CONFOUNDER },
    { id: 'dm', label: 'Diabetes', type: NodeType.CONFOUNDER },
    { id: 'htn', label: 'Hypertension', type: NodeType.CONFOUNDER },
  ],
  edges: [
    { source: 'ppi', target: 'ckd', type: 'hypothesized' },
    { source: 'age', target: 'ppi', type: 'hypothesized' },
    { source: 'age', target: 'ckd', type: 'hypothesized' },
    { source: 'dm', target: 'ckd', type: 'hypothesized' },
    { source: 'htn', target: 'ckd', type: 'hypothesized' },
  ]
};

// Not used directly in Phase 3 anymore, as we build it iteratively, but kept for reference or Phase 4 initial state if skipped
export const REFINED_CKD_DAG: DAGData = {
  nodes: [
    { id: 'ppi', label: 'PPI Use', type: NodeType.EXPOSURE },
    { id: 'ckd', label: 'CKD Progression', type: NodeType.OUTCOME },
    { id: 'age', label: 'Age', type: NodeType.CONFOUNDER },
    { id: 'dm', label: 'Diabetes', type: NodeType.CONFOUNDER },
    { id: 'htn', label: 'Hypertension', type: NodeType.CONFOUNDER },
    { id: 'death', label: 'Death (Competing)', type: NodeType.COMPETING_RISK },
    { id: 'aki', label: 'Acute Kidney Injury', type: NodeType.MEDIATOR },
  ],
  edges: [
    { source: 'ppi', target: 'ckd', type: 'hypothesized' },
    { source: 'age', target: 'ppi', type: 'hypothesized' },
    { source: 'age', target: 'ckd', type: 'hypothesized' },
    { source: 'dm', target: 'ckd', type: 'hypothesized' },
    { source: 'htn', target: 'ckd', type: 'hypothesized' },
    { source: 'ppi', target: 'aki', type: 'observed' },
    { source: 'aki', target: 'ckd', type: 'observed' },
    { source: 'age', target: 'death', type: 'observed' },
    { source: 'dm', target: 'death', type: 'observed' },
    { source: 'ppi', target: 'death', type: 'observed' },
  ]
};

export const SAMPLE_PROCESS_LOGS = [
  { id: 1, path: ['PPI Start', 'Stable eGFR', 'Censored'], count: 550 },
  { id: 2, path: ['PPI Start', 'Rapid Decline', 'CKD Stage 4'], count: 250 },
  { id: 3, path: ['PPI Start', 'Fluctuating eGFR', 'Death'], count: 200 },
];

export const AI_SUGGESTIONS: Suggestion[] = [
  {
    id: 'sug_1',
    type: 'add_node',
    label: 'Competing Risk: Death',
    description: 'Add "Death" as a Competing Risk node.',
    evidence: 'Process mining identified 200 trajectories (Trajectory 3) ending in Death before CKD outcome could be observed.',
    confidence: 'High',
    data: { id: 'death', label: 'Death (Competing)', type: NodeType.COMPETING_RISK }
  },
  {
    id: 'sug_2',
    type: 'add_node',
    label: 'Mediator: Acute Kidney Injury',
    description: 'Add "AKI" as a Mediator node.',
    evidence: 'Temporal analysis shows a cluster of acute decline events occurring shortly after PPI initiation, distinct from chronic progression.',
    confidence: 'Medium',
    data: { id: 'aki', label: 'Acute Kidney Injury', type: NodeType.MEDIATOR }
  },
  {
    id: 'sug_3',
    type: 'add_edge',
    label: 'Path: PPI → AKI',
    description: 'Add causal link from PPI Use to AKI.',
    evidence: 'Strong temporal precedence observed: AKI events occur within 90 days of PPI start in 15% of cases.',
    confidence: 'High',
    data: { source: 'ppi', target: 'aki', type: 'observed' }
  },
  {
    id: 'sug_4',
    type: 'add_edge',
    label: 'Path: AKI → CKD',
    description: 'Add causal link from AKI to CKD Progression.',
    evidence: 'Patients with intermediate AKI events have a 2.8x higher hazard of subsequent CKD progression.',
    confidence: 'High',
    data: { source: 'aki', target: 'ckd', type: 'observed' }
  },
  {
    id: 'sug_5',
    type: 'add_edge',
    label: 'Confounding: Age → Death',
    description: 'Add causal link from Age to Death.',
    evidence: 'Age is a known strong predictor of mortality (Competing Risk).',
    confidence: 'High',
    data: { source: 'age', target: 'death', type: 'observed' }
  }
];