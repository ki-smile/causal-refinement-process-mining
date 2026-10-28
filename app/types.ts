
export enum NodeType {
  EXPOSURE = 'EXPOSURE',
  OUTCOME = 'OUTCOME',
  CONFOUNDER = 'CONFOUNDER',
  MEDIATOR = 'MEDIATOR',
  COMPETING_RISK = 'COMPETING_RISK',
  OTHER = 'OTHER'
}

export interface DAGNode {
  id: string;
  label: string;
  type: NodeType;
  x?: number;
  y?: number;
  count?: number; // For DFG node size
}

export interface DAGEdge {
  source: string; // Node ID
  target: string; // Node ID
  label?: string;
  type?: 'hypothesized' | 'observed' | 'refuted';
  strength?: number; // 0-1 for visualization thickness
}

export interface DAGData {
  nodes: DAGNode[];
  edges: DAGEdge[];
}

export interface Suggestion {
  id: string;
  type: 'add_node' | 'add_edge' | 'remove_edge';
  label: string;
  description: string;
  evidence: string;
  confidence: 'High' | 'Medium' | 'Low';
  data: any; // Node or Edge object
}

export interface ModelRecommendation {
  id: string;
  title: string;
  description: string;
  configuration: string[];
  rationale: string;
  icon: string; // Icon name
  rCode: string; // R implementation snippet
  comparisonMetrics: {
    biasReduction: number; // 1-5
    efficiency: number; // 1-5
    complexity: number; // 1-5
    clinicalInterpretability: number; // 1-5
  };
  isBestChoice?: boolean;
}

export enum Phase {
  KNOWLEDGE = 1,
  DISCOVERY = 2,
  REFINEMENT = 3,
  VALIDATION = 4
}

export interface SimulationStats {
  hr_crude: number;
  hr_adjusted: number;
  c_statistic: number;
}

export interface EventLogEntry {
  caseId: string;
  activity: string;
  timestamp: Date;
}

export interface ProcessStats {
  totalCases: number;
  totalEvents: number;
  uniqueActivities: number;
  avgDuration: string;
  variants: { path: string[], count: number }[];
}

export interface DataQualityReport {
  missingValues: number;
  unsortedTimestamps: number;
  duplicates: number;
  issues: string[];
  score: number; // 0-100
}
