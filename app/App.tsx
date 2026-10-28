import React, { useState, useEffect, useMemo } from 'react';
import { Brain, Database, GitMerge, BarChart3, AlertCircle, ArrowRight, CheckCircle2, FlaskConical, Search, ShieldCheck, XCircle, Check, History, Upload, FileText, Activity, AlertTriangle, Lightbulb, Plus, Trash2, Edit2, Link as LinkIcon, Settings2, X, ClipboardList, Info, ChevronRight, Calculator, Terminal, Code2, BookOpen, Layers, ListChecks, Table, Star, Award, TrendingUp, Cpu } from 'lucide-react';
import { generateDAGFromHypothesis, saveToKnowledgeBase } from './services/geminiService';
import { parseCSV, analyzeEventLog, generateMockEventLog } from './services/processMiningService';
import DAGVisualizer from './components/DAGVisualizer';
import ProcessMap from './components/ProcessMap';
import { DAGData, NodeType, Phase, Suggestion, ProcessStats, DataQualityReport, DAGNode, DAGEdge, ModelRecommendation } from './types';
import { INITIAL_CKD_DAG } from './constants';

// --- Suggestion Engine ---
const generateDynamicSuggestions = (discovery: { stats: ProcessStats, dfg: DAGData }, currentDag: DAGData): Suggestion[] => {
    const suggestions: Suggestion[] = [];
    const { stats, dfg } = discovery;
    
    // 1. Detect Competing Risks (Terminal nodes that aren't the primary outcome)
    const deathCount = stats.variants
        .filter(v => v.path.some(p => p.toLowerCase().includes('death') || p.toLowerCase().includes('mortality')))
        .reduce((sum, v) => sum + v.count, 0);

    if (deathCount > 0 && !currentDag.nodes.find(n => n.id === 'death')) {
        suggestions.push({
            id: 'dyn_sug_death',
            type: 'add_node',
            label: 'Competing Risk: Death',
            description: 'Add "Death" as a Competing Risk node to handle informative censoring.',
            evidence: `Process mining identified ${deathCount} trajectories (${Math.round(deathCount/stats.totalCases * 100)}% of cases) that end in death, preventing the primary outcome from being observed.`,
            confidence: 'High',
            data: { id: 'death', label: 'Death', type: NodeType.COMPETING_RISK }
        });
    }

    // 2. Detect Mediators (Intermediate nodes between exposure and outcome)
    const exposureNode = currentDag.nodes.find(n => n.type === NodeType.EXPOSURE);
    const outcomeNode = currentDag.nodes.find(n => n.type === NodeType.OUTCOME);
    
    const dfgExposureId = dfg.nodes.find(n => n.type === NodeType.EXPOSURE)?.id || (exposureNode ? exposureNode.id : '');
    const dfgOutcomeId = dfg.nodes.find(n => n.type === NodeType.OUTCOME)?.id || (outcomeNode ? outcomeNode.id : '');
    const dfgExposureLabel = dfg.nodes.find(n => n.type === NodeType.EXPOSURE)?.label || (exposureNode ? exposureNode.label : '');
    const dfgOutcomeLabel = dfg.nodes.find(n => n.type === NodeType.OUTCOME)?.label || (outcomeNode ? outcomeNode.label : '');

    if (exposureNode && outcomeNode) {
        dfg.nodes.forEach(obsNode => {
            const isExposure = obsNode.id === dfgExposureId || obsNode.type === NodeType.EXPOSURE;
            const isOutcome = obsNode.id === dfgOutcomeId || obsNode.type === NodeType.OUTCOME;
            
            const isKnown = currentDag.nodes.some(n => 
                n.id === obsNode.id || 
                (isExposure && n.type === NodeType.EXPOSURE) ||
                (isOutcome && n.type === NodeType.OUTCOME)
            );

            if (!isKnown) {
                const sitsInMiddle = stats.variants.some(v => {
                    const expIdx = v.path.indexOf(dfgExposureLabel);
                    const obsIdx = v.path.indexOf(obsNode.label);
                    const outIdx = v.path.indexOf(dfgOutcomeLabel);
                    return expIdx !== -1 && obsIdx !== -1 && outIdx !== -1 && expIdx < obsIdx && obsIdx < outIdx;
                });

                if (sitsInMiddle) {
                    suggestions.push({
                        id: `dyn_sug_med_${obsNode.id}`,
                        type: 'add_node',
                        label: `Potential Mediator: ${obsNode.label}`,
                        description: `Add "${obsNode.label}" as a mediator. It frequently appears on the temporal path between exposure and outcome.`,
                        evidence: `Observed as an intermediate step in ${stats.variants.filter(v => v.path.includes(obsNode.label)).reduce((s, v) => s+v.count, 0)} cases.`,
                        confidence: 'Medium',
                        data: { id: obsNode.id, label: obsNode.label, type: NodeType.MEDIATOR }
                    });
                }
            }
        });
    }

    // 3. New Edge Detection
    dfg.edges.forEach(obsEdge => {
        const sourceId = typeof obsEdge.source === 'string' ? obsEdge.source : (obsEdge.source as any).id;
        const targetId = typeof obsEdge.target === 'string' ? obsEdge.target : (obsEdge.target as any).id;
        
        let mappedSource = sourceId;
        if (sourceId === dfgExposureId) mappedSource = exposureNode.id;
        else if (sourceId === dfgOutcomeId) mappedSource = outcomeNode.id;

        let mappedTarget = targetId;
        if (targetId === dfgExposureId) mappedTarget = exposureNode.id;
        else if (targetId === dfgOutcomeId) mappedTarget = outcomeNode.id;

        const exists = currentDag.edges.some(e => e.source === mappedSource && e.target === mappedTarget);
        const bothNodesExist = currentDag.nodes.some(n => n.id === mappedSource) && currentDag.nodes.some(n => n.id === mappedTarget);

        if (!exists && bothNodesExist && (obsEdge.strength || 0) > 0.4) {
             suggestions.push({
                id: `dyn_sug_edge_${mappedSource}_${mappedTarget}`,
                type: 'add_edge',
                label: `New Path: ${mappedSource} → ${mappedTarget}`,
                description: `Observed strong temporal flow from ${mappedSource} to ${mappedTarget} not present in domain model.`,
                evidence: `Strong DFG connection (Weight: ${Math.round((obsEdge.strength || 0) * 100)}%) found in discovery phase.`,
                confidence: 'High',
                data: { source: mappedSource, target: mappedTarget, type: 'observed' }
            });
        }
    });

    return suggestions;
};

const generateModelRecommendations = (dag: DAGData): ModelRecommendation[] => {
    const recommendations: ModelRecommendation[] = [];
    const nodes = dag.nodes;
    const exposure = nodes.find(n => n.type === NodeType.EXPOSURE)?.id || 'treatment';
    const outcome = nodes.find(n => n.type === NodeType.OUTCOME)?.id || 'outcome';
    const confounderIds = nodes.filter(n => n.type === NodeType.CONFOUNDER).map(n => n.id);
    const hasCompetingRisk = nodes.some(n => n.type === NodeType.COMPETING_RISK);
    const hasMediator = nodes.some(n => n.type === NodeType.MEDIATOR);
    const mediators = nodes.filter(n => n.type === NodeType.MEDIATOR);

    // 1. Primary Analysis Strategy
    if (hasCompetingRisk) {
        const crNode = nodes.find(n => n.type === NodeType.COMPETING_RISK)?.id || 'death';
        recommendations.push({
            id: 'rec_cr',
            title: 'Competing Risk (Fine-Gray)',
            description: 'Use a subdistribution hazard model to account for competing risks discovered in patient trajectories.',
            configuration: [
                'Estimation: Subdistribution Hazard Ratio',
                'Tie-handling: Efron approximation',
                'Pre-processing: Fine-Gray weighting'
            ],
            rCode: `# R Protocol: Competing Risk Analysis\nlibrary(survival)\n\n# Prepare data with finegray()\nfg_data <- finegray(Surv(time, status) ~ ., \n                    data = df, \n                    etype = "${crNode}")\n\n# Fit subdistribution hazards model\nfit <- coxph(Surv(fgstart, fgstop, fgstatus) ~ ${exposure} + ${confounderIds.join(' + ')},\n             data = fg_data, \n             weights = fgwt)`,
            rationale: 'Corrects for overestimation of cumulative incidence in the presence of informative censoring.',
            icon: 'Activity',
            comparisonMetrics: { biasReduction: 5, efficiency: 4, complexity: 4, clinicalInterpretability: 3 },
            isBestChoice: true
        });
    } else {
        recommendations.push({
            id: 'rec_cox',
            title: 'Standard Survival Cohort (Cox PH)',
            description: 'Cox Proportional Hazards model for estimating treatment-effect hazards on observed timelines.',
            configuration: [
                'Model type: Semi-parametric Cox',
                'Time-scale: Days from baseline',
                'Covariates: Back-door adjustment set'
            ],
            rCode: `# R Protocol: Standard Survival Analysis\nlibrary(survival)\n\nfit <- coxph(\n  Surv(time, event) ~ ${exposure} + ${confounderIds.join(' + ')},\n  data = df,\n  ties = "efron"\n)\n\n# Test proportionality\nzph <- cox.zph(fit)\nplot(zph)`,
            rationale: 'Standard identification for time-to-event outcomes without identified competing risks.',
            icon: 'Activity',
            comparisonMetrics: { biasReduction: 3, efficiency: 5, complexity: 2, clinicalInterpretability: 5 },
            isBestChoice: !hasCompetingRisk && !hasMediator
        });
    }

    // 2. Mediation Analysis Guidance
    if (hasMediator) {
        const medId = mediators[0].id;
        recommendations.push({
            id: 'rec_med',
            title: 'Causal Mediation (Bootstrapped)',
            description: 'Decompose effects into Direct (treatment -> outcome) and Indirect (treatment -> mediator -> outcome).',
            configuration: [
                'Algorithm: Non-parametric bootstrapping',
                'Mediator: Discovery-identified node',
                'Simulations: 1000+'
            ],
            rCode: `# R Protocol: Causal Mediation\nlibrary(mediation)\n\n# Fit mediator model\nmed_fit <- glm(${medId} ~ ${exposure} + ${confounderIds.join(' + ')}, \n               data = df, family = binomial)\n\n# Fit outcome model\nout_fit <- coxph(Surv(time, event) ~ ${exposure} + ${medId} + ${confounderIds.join(' + ')}, \n                 data = df)\n\n# Perform mediation\nres <- mediate(med_fit, out_fit, \n               treat = "${exposure}", \n               mediator = "${medId}")\nsummary(res)`,
            rationale: 'Necessary to explain the mechanistic flow identified in the refined trajectory analysis.',
            icon: 'GitMerge',
            comparisonMetrics: { biasReduction: 4, efficiency: 3, complexity: 5, clinicalInterpretability: 4 }
        });
    }

    // 3. Confounding Balancing Guidance
    if (confounderIds.length > 3) {
        recommendations.push({
            id: 'rec_ps',
            title: 'IPTW Balancing',
            description: 'Balance baseline characteristics between exposure groups using discovered confounding factors.',
            configuration: [
                'Balancing: IPTW (Inverse Probability Treatment Weighting)',
                'Model: Logit or Boosting for PS estimation',
                'Metric: Standardized Mean Difference (SMD)'
            ],
            rCode: `# R Protocol: IPTW Balancing\nlibrary(WeightIt)\n\n# Calculate weights\nW <- weightit(${exposure} ~ ${confounderIds.join(' + ')},\n              data = df,\n              method = "ps",\n              estimand = "ATE")\n\n# Summary of balance\nsummary(W)\n\n# Fit weighted model\nfit <- coxph(Surv(time, event) ~ ${exposure}, \n             data = df, \n             weights = W$weights)`,
            rationale: 'More robust adjustment when many baseline common causes are present.',
            icon: 'ShieldCheck',
            comparisonMetrics: { biasReduction: 5, efficiency: 3, complexity: 3, clinicalInterpretability: 4 },
            isBestChoice: !hasCompetingRisk && confounderIds.length > 5
        });
    }

    return recommendations;
};

// --- Phase Components ---

const Phase1 = ({ dag, setDag, query, setQuery, onNext }: { dag: DAGData, setDag: (d: DAGData) => void, query: string, setQuery: (q: string) => void, onNext: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Editor State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeForm, setNewNodeForm] = useState({ label: '', type: NodeType.CONFOUNDER });

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await generateDAGFromHypothesis(query);
      if (result) {
        setDag(result);
      } else {
        setError("AI could not generate a DAG. Using default template.");
        setDag(INITIAL_CKD_DAG);
      }
    } catch (e) {
      setError("Error connecting to AI service.");
      setDag(INITIAL_CKD_DAG);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (nodeId: string) => {
      if (!nodeId) {
          setSelectedNodeId(null);
          setLinkSourceId(null);
          setIsLinking(false);
          return;
      }

      if (isLinking) {
          if (!linkSourceId) {
              setLinkSourceId(nodeId);
          } else {
              if (linkSourceId === nodeId) {
                  setLinkSourceId(null);
                  setIsLinking(false);
                  return;
              }
              const newEdge = { source: linkSourceId, target: nodeId, type: 'hypothesized' as const };
              const exists = dag.edges.some(e => e.source === linkSourceId && e.target === nodeId);
              if (!exists) {
                  setDag({ ...dag, edges: [...dag.edges, newEdge] });
              }
              setLinkSourceId(null);
              setIsLinking(false);
          }
      } else {
          setSelectedNodeId(nodeId);
      }
  };

  const handleAddNode = () => {
      if (!newNodeForm.label) return;
      const id = newNodeForm.label.toLowerCase().replace(/\s+/g, '_');
      const newNode: DAGNode = { id, label: newNodeForm.label, type: newNodeForm.type, x: 350, y: 225 };
      setDag({ ...dag, nodes: [...dag.nodes, newNode] });
      setNewNodeForm({ label: '', type: NodeType.CONFOUNDER });
      setShowAddNode(false);
  };

  const handleDeleteNode = () => {
      if (!selectedNodeId) return;
      setDag({
          nodes: dag.nodes.filter(n => n.id !== selectedNodeId),
          edges: dag.edges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId)
      });
      setSelectedNodeId(null);
  };

  const handleDeleteEdge = (targetId: string) => {
      if (!selectedNodeId) return;
      setDag({
          ...dag,
          edges: dag.edges.filter(e => !(e.source === selectedNodeId && e.target === targetId))
      });
  };

  const selectedNode = dag.nodes.find(n => n.id === selectedNodeId);
  const outgoingEdges = selectedNodeId ? dag.edges.filter(e => e.source === selectedNodeId) : [];
  const isAugmented = (dag as any).isAugmented;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-blue-600" />
          Phase 1: Knowledge-Driven Domain Model
        </h2>
        <p className="text-slate-600 mb-6">
          Define your research question to generate an initial DAG. The system will consult the Knowledge Base for similar past studies.
        </p>

        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="Enter your research question..."
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Generate Initial DAG'}
          </button>
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">{error}</div>}

        <div className="flex flex-col lg:flex-row gap-6 border-t border-slate-100 pt-6">
           <div className="lg:w-2/3 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <button onClick={() => setShowAddNode(!showAddNode)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded text-sm font-medium hover:bg-slate-50 transition-colors">
                          <Plus className="w-4 h-4" /> Add Node
                      </button>
                      <div className="w-px h-6 bg-slate-300 mx-1"></div>
                      <button 
                        onClick={() => { setIsLinking(!isLinking); setLinkSourceId(null); setSelectedNodeId(null); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-sm font-medium transition-colors ${isLinking ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                      >
                          <LinkIcon className="w-4 h-4" /> {isLinking ? (linkSourceId ? "Select Target" : "Select Source") : "Add Edge"}
                      </button>
                  </div>
                  {isAugmented && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-semibold shadow-sm">
                          <Database className="w-3.5 h-3.5" /> Context Augmented from Knowledge Base
                      </div>
                  )}
              </div>

              <div className={`relative rounded-lg border-2 overflow-hidden transition-colors ${isLinking ? 'border-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.2)]' : 'border-slate-100'}`}>
                <DAGVisualizer 
                    data={dag} 
                    height={450} 
                    width={700} 
                    interactive={true}
                    onNodeClick={handleNodeClick}
                    selectedNodeId={selectedNodeId}
                    linkingSourceId={linkSourceId}
                />
              </div>
           </div>

           <div className="lg:w-1/3 space-y-4">
              {/* Sidebar Content Remains the Same */}
              {showAddNode && (
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-md mb-4 animate-in slide-in-from-top-2">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-sm text-slate-700">Add New Node</h3>
                        <button onClick={() => setShowAddNode(false)}><X className="w-4 h-4 text-slate-400" /></button>
                      </div>
                      <div className="space-y-3">
                          <input type="text" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none" value={newNodeForm.label} onChange={e => setNewNodeForm({...newNodeForm, label: e.target.value})} placeholder="Label (e.g. Diet)" />
                          <select className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none" value={newNodeForm.type} onChange={e => setNewNodeForm({...newNodeForm, type: e.target.value as NodeType})}>
                              {Object.values(NodeType).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <button onClick={handleAddNode} className="w-full py-1.5 bg-blue-600 text-white text-sm rounded font-medium hover:bg-blue-700">Add to Graph</button>
                      </div>
                  </div>
              )}

              {selectedNode ? (
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                      <div className="flex justify-between items-start mb-4">
                          <div>
                             <h3 className="font-bold text-slate-800">{selectedNode.label}</h3>
                             <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {selectedNode.id}</p>
                          </div>
                      </div>
                      <div className="space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outgoing Connections</h4>
                          {outgoingEdges.length > 0 ? (
                              <div className="space-y-2">
                                  {outgoingEdges.map(edge => (
                                      <div key={edge.target} className="flex items-center justify-between bg-white p-2 rounded border border-slate-200 text-sm">
                                          <span className="flex items-center gap-2">
                                              <ArrowRight className="w-3 h-3 text-slate-400" />
                                              {dag.nodes.find(n => n.id === edge.target)?.label || edge.target}
                                          </span>
                                          <button onClick={() => handleDeleteEdge(edge.target)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                                      </div>
                                  ))}
                              </div>
                          ) : <p className="text-xs text-slate-400 italic">No outgoing connections.</p>}
                      </div>
                      <button onClick={handleDeleteNode} className="mt-6 w-full py-2 flex items-center justify-center gap-2 text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-lg text-sm font-medium">
                          <Trash2 className="w-4 h-4" /> Delete Node
                      </button>
                  </div>
              ) : !showAddNode && (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                    <Edit2 className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm font-medium">Select a node to edit</p>
                </div>
              )}
           </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={onNext} className="flex items-center gap-2 px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors">
            Next: Data Discovery <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// --- Phases 2 & 3 Remain Exactly the Same ---
// To keep the file manageable in this format, I am copying them directly from your original code.
// They require zero changes for this implementation.

const Phase2 = ({ onNext, onPrev, onComplete }: { onNext: () => void, onPrev: () => void, onComplete: (stats: ProcessStats, quality: DataQualityReport, dfg: DAGData) => void }) => {
    const [file, setFile] = useState<File | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [stats, setStats] = useState<ProcessStats | null>(null);
    const [quality, setQuality] = useState<DataQualityReport | null>(null);
    const [dfg, setDfg] = useState<DAGData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            processFile(f);
        }
    };

    const loadMockData = () => {
        setIsAnalyzing(true);
        setError(null);
        setTimeout(() => {
             const data = generateMockEventLog();
             const results = analyzeEventLog(data);
             setStats(results.stats);
             setQuality(results.quality);
             setDfg(results.dfg);
             onComplete(results.stats, results.quality, results.dfg);
             setIsAnalyzing(false);
             setFile(new File([""], "demo_dataset.csv"));
        }, 1200);
    };

    const processFile = async (f: File) => {
        setIsAnalyzing(true);
        setError(null);
        try {
            const data = await parseCSV(f);
            const results = analyzeEventLog(data);
            setStats(results.stats);
            setQuality(results.quality);
            setDfg(results.dfg);
            onComplete(results.stats, results.quality, results.dfg);
        } catch (error: any) {
            setError(error.message || "An error occurred while parsing the data.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2 mb-2">
                            <Database className="w-5 h-5 text-indigo-600" />
                            Phase 2: Data-Driven Pattern Discovery
                        </h2>
                        <p className="text-slate-600">
                            The Architect reconstructs patient journeys from flat event logs to reveal actual temporal dependencies.
                        </p>
                    </div>
                    <div className="bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-2">
                        <Info className="w-4 h-4 text-indigo-500" />
                        <span className="text-xs font-semibold text-indigo-700">Accepts CSV with Patient ID, Event, & Date</span>
                    </div>
                </div>

                {!stats ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 border-2 border-dashed border-slate-300 rounded-xl p-12 text-center bg-slate-50 hover:bg-slate-100 transition-colors">
                             {isAnalyzing ? (
                                 <div className="flex flex-col items-center">
                                     <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
                                     <p className="text-indigo-700 font-medium">Analyzing Event Log...</p>
                                     <p className="text-slate-400 text-xs mt-2">Sorting timestamps and aggregating paths...</p>
                                 </div>
                             ) : (
                                 <>
                                    <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-slate-700 mb-2">Upload Event Log CSV</h3>
                                    <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">Upload clinical data to discover hidden causal paths and mediators.</p>
                                    <div className="flex gap-4 justify-center">
                                        <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-sm">
                                            Browse File
                                            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                                        </label>
                                        <button onClick={loadMockData} className="bg-white border border-slate-200 text-indigo-600 font-medium hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors">
                                            Try with Synthetic Data
                                        </button>
                                    </div>
                                    {error && (
                                        <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 text-left">
                                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-bold text-red-800">Digestion Error</p>
                                                <p className="text-xs text-red-700">{error}</p>
                                            </div>
                                        </div>
                                    )}
                                 </>
                             )}
                        </div>
                        <div className="bg-slate-900 rounded-xl p-6 text-white">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                                <ListChecks className="w-4 h-4" /> Data Requirements
                            </h3>
                            <div className="space-y-6">
                                {[
                                    { label: "Case/Patient ID", desc: "Unique identifier for each cohort member.", icon: CheckCircle2 },
                                    { label: "Activity/Event", desc: "The clinical event name (e.g., PPI Start).", icon: CheckCircle2 },
                                    { label: "Timestamp", desc: "Standard ISO or US/UK date format.", icon: CheckCircle2 },
                                ].map((req, i) => (
                                    <div key={i} className="flex gap-4">
                                        <req.icon className="w-5 h-5 text-emerald-400 shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold">{req.label}</p>
                                            <p className="text-xs text-slate-400">{req.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 pt-6 border-t border-slate-800">
                                <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                                    <p className="text-[10px] text-slate-500 font-mono mb-2">EXPECTED FORMAT:</p>
                                    <p className="text-[11px] font-mono text-emerald-400">patient_id, event, date<br/>P001, PPI_Start, 2024-01-01<br/>P001, AKI_Event, 2024-03-12</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8 animate-in zoom-in-95 duration-500">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: "Total Cases", value: stats.totalCases, icon: FileText, color: "text-blue-600" },
                                { label: "Total Events", value: stats.totalEvents, icon: Activity, color: "text-indigo-600" },
                                { label: "Avg Duration", value: stats.avgDuration, icon: History, color: "text-emerald-600" },
                                { label: "Quality Score", value: `${quality?.score}%`, icon: ShieldCheck, color: "text-green-600" },
                            ].map((stat, idx) => (
                                <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-2 mb-1">
                                        <stat.icon className={`w-4 h-4 ${stat.color}`} />
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</span>
                                    </div>
                                    <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-700 flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2"><GitMerge className="w-4 h-4" /> Directly-Follows Graph (DFG)</div>
                                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">Observed Temporal Flow</span>
                                </h3>
                                {dfg && <DAGVisualizer data={dfg} height={350} width={450} interactive={true} />}
                            </div>
                            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-700 flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2"><Table className="w-4 h-4" /> Path Discovery</div>
                                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">Top 10 Patient Journeys</span>
                                </h3>
                                <ProcessMap variants={stats.variants} />
                            </div>
                        </div>
                        {quality && quality.issues.length > 0 && (
                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold text-amber-900">Data Quality Alerts</h4>
                                    <ul className="mt-1 space-y-1">
                                        {quality.issues.map((issue, i) => (
                                            <li key={i} className="text-xs text-amber-800">• {issue}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="flex justify-between">
                <button onClick={onPrev} className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Back</button>
                <div className="flex gap-3">
                    {stats && (
                        <button onClick={() => { setStats(null); setFile(null); }} className="px-6 py-2 text-slate-500 font-medium hover:text-slate-800 transition-colors">
                            Reset Data
                        </button>
                    )}
                    <button onClick={onNext} disabled={!stats} className="flex items-center gap-2 px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 shadow-md transition-all">
                        Next: DAG Refinement <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

const Phase3 = ({ currentDag, setDag, discovery, onNext, onPrev }: { currentDag: DAGData, setDag: (d: DAGData) => void, discovery: { stats: ProcessStats, dfg: DAGData } | null, onNext: () => void, onPrev: () => void }) => {
    const generatedSuggestions = useMemo(() => {
        if (!discovery) return [];
        return generateDynamicSuggestions(discovery, currentDag);
    }, [discovery, currentDag]);

    const [pendingSuggestions, setPendingSuggestions] = useState<Suggestion[]>([]);
    const [history, setHistory] = useState<{id: string, label: string, status: 'accepted'|'rejected'}[]>([]);

    // Sync pending suggestions with generated ones, omitting resolved history items
    useEffect(() => {
        const historyIds = new Set(history.map(h => h.id));
        const filtered = generatedSuggestions.filter(s => !historyIds.has(s.id));
        setPendingSuggestions(filtered);
    }, [generatedSuggestions, history]);

    // Editor States in Phase 3
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [isLinking, setIsLinking] = useState(false);
    const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
    const [showAddNode, setShowAddNode] = useState(false);
    const [newNodeForm, setNewNodeForm] = useState({ label: '', type: NodeType.CONFOUNDER });

    const handleNodeClick = (nodeId: string) => {
        if (!nodeId) {
            setSelectedNodeId(null);
            setLinkSourceId(null);
            setIsLinking(false);
            return;
        }

        if (isLinking) {
            if (!linkSourceId) {
                setLinkSourceId(nodeId);
            } else {
                if (linkSourceId === nodeId) {
                    setLinkSourceId(null);
                    setIsLinking(false);
                    return;
                }
                const newEdge = { source: linkSourceId, target: nodeId, type: 'hypothesized' as const };
                const exists = currentDag.edges.some(e => e.source === linkSourceId && e.target === nodeId);
                if (!exists) {
                    setDag({ ...currentDag, edges: [...currentDag.edges, newEdge] });
                }
                setLinkSourceId(null);
                setIsLinking(false);
            }
        } else {
            setSelectedNodeId(nodeId);
        }
    };

    const handleAddNode = () => {
        if (!newNodeForm.label) return;
        const id = newNodeForm.label.toLowerCase().replace(/\s+/g, '_');
        const newNode: DAGNode = { id, label: newNodeForm.label, type: newNodeForm.type, x: 350, y: 225 };
        setDag({ ...currentDag, nodes: [...currentDag.nodes, newNode] });
        setNewNodeForm({ label: '', type: NodeType.CONFOUNDER });
        setShowAddNode(false);
    };

    const handleDeleteNode = () => {
        if (!selectedNodeId) return;
        setDag({
            nodes: currentDag.nodes.filter(n => n.id !== selectedNodeId),
            edges: currentDag.edges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId)
        });
        setSelectedNodeId(null);
    };

    const handleDeleteEdge = (targetId: string) => {
        if (!selectedNodeId) return;
        setDag({
            ...currentDag,
            edges: currentDag.edges.filter(e => !(e.source === selectedNodeId && e.target === targetId))
        });
    };

    const selectedNode = currentDag.nodes.find(n => n.id === selectedNodeId);
    const outgoingEdges = selectedNodeId ? currentDag.edges.filter(e => e.source === selectedNodeId) : [];

    const activeSuggestions = pendingSuggestions.filter(s => {
        if (s.type === 'add_node') return true;
        if (s.type === 'add_edge') {
            const nodeIds = currentDag.nodes.map(n => n.id);
            return nodeIds.includes(s.data.source) && nodeIds.includes(s.data.target);
        }
        return true;
    });

    const handleAccept = (suggestion: Suggestion) => {
        const newDag = { ...currentDag };
        if (suggestion.type === 'add_node') {
            newDag.nodes = [...newDag.nodes, { ...suggestion.data, x: 350, y: 225 }];
        } else if (suggestion.type === 'add_edge') {
            newDag.edges = [...newDag.edges, suggestion.data];
        }
        setDag(newDag);
        setHistory(prev => [...prev, { id: suggestion.id, label: suggestion.label, status: 'accepted' as const }]);
    };

    const handleReject = (suggestion: Suggestion) => {
        setHistory(prev => [...prev, { id: suggestion.id, label: suggestion.label, status: 'rejected' as const }]);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2 mb-1">
                            <GitMerge className="w-5 h-5 text-purple-600" />
                            Phase 3: Human-AI Governance Panel
                        </h2>
                        <p className="text-sm text-slate-600">Review data-driven proposals based on the analysis of {discovery?.stats.totalCases || 'your'} patient trajectories.</p>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-6 border-t border-slate-100 pt-6">
                    <div className="lg:w-2/3 flex flex-col gap-2">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                <button onClick={() => setShowAddNode(!showAddNode)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded text-sm font-medium hover:bg-slate-50 transition-colors">
                                    <Plus className="w-4 h-4" /> Add Node
                                </button>
                                <div className="w-px h-6 bg-slate-300 mx-1"></div>
                                <button 
                                  onClick={() => { setIsLinking(!isLinking); setLinkSourceId(null); setSelectedNodeId(null); }}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-sm font-medium transition-colors ${isLinking ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                >
                                    <LinkIcon className="w-4 h-4" /> {isLinking ? (linkSourceId ? "Select Target" : "Select Source") : "Add Edge"}
                                </button>
                            </div>
                        </div>

                        <div className={`relative rounded-lg border-2 overflow-hidden transition-colors ${isLinking ? 'border-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.2)]' : 'border-slate-100'}`}>
                          <DAGVisualizer 
                              data={currentDag} 
                              height={500} 
                              width={600} 
                              interactive={true}
                              onNodeClick={handleNodeClick}
                              selectedNodeId={selectedNodeId}
                              linkingSourceId={linkSourceId}
                          />
                        </div>
                    </div>

                    <div className="w-full lg:w-96 flex flex-col gap-4">
                        {showAddNode && (
                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-md mb-4 animate-in slide-in-from-top-2">
                                <div className="flex justify-between items-center mb-3">
                                  <h3 className="font-semibold text-sm text-slate-700">Add New Node</h3>
                                  <button onClick={() => setShowAddNode(false)}><X className="w-4 h-4 text-slate-400" /></button>
                                </div>
                                <div className="space-y-3">
                                    <input type="text" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none" value={newNodeForm.label} onChange={e => setNewNodeForm({...newNodeForm, label: e.target.value})} placeholder="Label (e.g. Diet)" />
                                    <select className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none" value={newNodeForm.type} onChange={e => setNewNodeForm({...newNodeForm, type: e.target.value as NodeType})}>
                                        {Object.values(NodeType).map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <button onClick={handleAddNode} className="w-full py-1.5 bg-blue-600 text-white text-sm rounded font-medium hover:bg-blue-700">Add to Graph</button>
                                </div>
                            </div>
                        )}

                        {selectedNode ? (
                            <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                       <h3 className="font-bold text-slate-800">{selectedNode.label}</h3>
                                       <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {selectedNode.id}</p>
                                    </div>
                                    <button onClick={() => setSelectedNodeId(null)}><X className="w-4 h-4 text-slate-400" /></button>
                                </div>
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outgoing Connections</h4>
                                    {outgoingEdges.length > 0 ? (
                                        <div className="space-y-2">
                                            {outgoingEdges.map(edge => (
                                                <div key={edge.target} className="flex items-center justify-between bg-white p-2 rounded border border-slate-200 text-sm">
                                                    <span className="flex items-center gap-2">
                                                        <ArrowRight className="w-3 h-3 text-slate-400" />
                                                        {currentDag.nodes.find(n => n.id === edge.target)?.label || edge.target}
                                                    </span>
                                                    <button onClick={() => handleDeleteEdge(edge.target)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-xs text-slate-400 italic">No outgoing connections.</p>}
                                </div>
                                <button onClick={handleDeleteNode} className="mt-6 w-full py-2 flex items-center justify-center gap-2 text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-lg text-sm font-medium">
                                    <Trash2 className="w-4 h-4" /> Delete Node
                                </button>
                            </div>
                        ) : (
                            <>
                                <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Brain className="w-4 h-4 text-purple-600" /> Proposed Refinements</h3>
                                {activeSuggestions.length > 0 ? (
                                    <div className="space-y-4">
                                        {activeSuggestions.map(suggestion => (
                                            <div key={suggestion.id} className="bg-white rounded-lg border border-purple-100 shadow-sm p-4 relative overflow-hidden group">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-semibold text-slate-800 text-sm group-hover:text-purple-700 transition-colors">{suggestion.label}</h4>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${suggestion.confidence === 'High' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{suggestion.confidence} Confidence</span>
                                                </div>
                                                <p className="text-xs text-slate-600 mb-3 leading-relaxed">{suggestion.description}</p>
                                                <div className="bg-slate-50 p-2 rounded text-[11px] text-slate-500 mb-4 border border-slate-100 italic">
                                                    <span className="font-bold text-slate-700 not-italic">Data Evidence:</span> {suggestion.evidence}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleReject(suggestion)} className="flex-1 py-2 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 flex items-center justify-center gap-1 transition-colors"><XCircle className="w-3 h-3" /> Reject</button>
                                                    <button onClick={() => handleAccept(suggestion)} className="flex-1 py-2 text-xs font-medium text-white bg-purple-600 rounded hover:bg-purple-700 flex items-center justify-center gap-1 shadow-sm transition-colors"><Check className="w-3 h-3" /> Accept</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                        <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                        <p className="text-sm font-medium text-slate-700">All suggestions reviewed</p>
                                        <p className="text-[10px] text-slate-400 mt-1">Domain model is now synchronized with data.</p>
                                    </div>
                                )}
                            </>
                        )}
                        {history.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-100">
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1"><History className="w-3 h-3" /> Decision Log</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 no-scrollbar">
                                    {history.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-xs animate-in slide-in-from-right-2">
                                            <span className="text-slate-600 truncate max-w-[180px]">{item.label}</span>
                                            <span className={`px-1.5 py-0.5 rounded capitalize font-medium ${item.status === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex justify-between">
                <button onClick={onPrev} className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Back</button>
                <button onClick={onNext} disabled={activeSuggestions.length > 0} className="flex items-center gap-2 px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 shadow-md transition-all">Next: Statistical Validation <ArrowRight className="w-4 h-4" /></button>
            </div>
        </div>
    );
};

// --- Updated Phase 4 with the save function ---

const Phase4 = ({ currentDag, originalQuery, onPrev }: { currentDag: DAGData, originalQuery: string, onPrev: () => void }) => {
    const recommendations = useMemo(() => generateModelRecommendations(currentDag), [currentDag]);
    const bestChoice = useMemo(() => recommendations.find(r => r.isBestChoice), [recommendations]);

    const renderRating = (score: number) => {
        return (
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                    <div key={star} className={`w-1.5 h-3 rounded-full ${star <= score ? 'bg-indigo-500' : 'bg-slate-200'}`}></div>
                ))}
            </div>
        );
    };

    // The core change to trigger RAG storage
    const handleFinalize = async () => {
        if (bestChoice && originalQuery) {
            await saveToKnowledgeBase(originalQuery, currentDag, bestChoice.title);
        }
        window.print();
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-700 pb-20">
            {/* Summary Introduction */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <div className="mb-8 text-center max-w-2xl mx-auto">
                    <div className="inline-flex p-3 bg-indigo-100 text-indigo-700 rounded-full mb-4 shadow-sm">
                        <Calculator className="w-8 h-8" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Modeling Strategy Summary</h2>
                    <p className="text-slate-500">Based on the refined DAG, we evaluated several statistical approaches. The following strategies provide the most robust causal identification.</p>
                </div>

                {/* Best Choice Callout */}
                {bestChoice && (
                    <div className="mb-10 p-6 bg-gradient-to-r from-indigo-600 to-blue-700 rounded-2xl text-white shadow-xl relative overflow-hidden">
                        <div className="absolute -right-8 -bottom-8 opacity-10">
                            <Award className="w-48 h-48" />
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                                <Star className="w-8 h-8 text-yellow-300 fill-yellow-300" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                                    Recommended Primary Strategy: {bestChoice.title}
                                </h3>
                                <p className="text-sm text-indigo-50 max-w-xl leading-relaxed">
                                    This model is identified as the optimal choice because it directly addresses the <strong>{currentDag.nodes.some(n => n.type === NodeType.COMPETING_RISK) ? 'Competing Risk' : 'Confounding Structure'}</strong> observed in your refined data-driven DAG.
                                </p>
                                <div className="mt-4 flex gap-6 text-[11px] font-bold uppercase tracking-widest text-indigo-200">
                                    <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> High Bias Reduction</span>
                                    <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Causally Validated</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Comparison Table */}
                <div className="mb-12 overflow-hidden border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">Statistical Model</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">Bias Reduction</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">Efficiency</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">Interpretability</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">Complexity</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {recommendations.map((rec) => (
                                <tr key={rec.id} className={`hover:bg-slate-50/50 transition-colors ${rec.isBestChoice ? 'bg-indigo-50/30' : ''}`}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                                                {rec.icon === 'Activity' && <Activity className="w-3.5 h-3.5" />}
                                                {rec.icon === 'GitMerge' && <GitMerge className="w-3.5 h-3.5" />}
                                                {rec.icon === 'ShieldCheck' && <ShieldCheck className="w-3.5 h-3.5" />}
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">{rec.title}</span>
                                            {rec.isBestChoice && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase">Best</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">{renderRating(rec.comparisonMetrics.biasReduction)}</td>
                                    <td className="px-6 py-4">{renderRating(rec.comparisonMetrics.efficiency)}</td>
                                    <td className="px-6 py-4">{renderRating(rec.comparisonMetrics.clinicalInterpretability)}</td>
                                    <td className="px-6 py-4">{renderRating(rec.comparisonMetrics.complexity)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="grid grid-cols-1 gap-16 mt-16">
                    {recommendations.map((rec) => (
                        <div key={rec.id} className="group border-b border-slate-100 pb-16 last:border-0 last:pb-0">
                            <div className="flex flex-col lg:flex-row gap-10">
                                {/* Component 1: Analysis Suggestions */}
                                <div className="lg:w-1/3 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-slate-900 rounded-xl text-white shadow-lg">
                                            {rec.icon === 'Activity' && <Activity className="w-6 h-6" />}
                                            {rec.icon === 'GitMerge' && <GitMerge className="w-6 h-6" />}
                                            {rec.icon === 'ShieldCheck' && <ShieldCheck className="w-6 h-6" />}
                                            {rec.icon === 'Settings2' && <Settings2 className="w-6 h-6" />}
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-800 leading-tight group-hover:text-indigo-700 transition-colors">{rec.title}</h3>
                                    </div>
                                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                            <Layers className="w-3.5 h-3.5" /> Strategy Overview
                                        </h4>
                                        <p className="text-sm text-slate-700 leading-relaxed font-medium">
                                            {rec.description}
                                        </p>
                                        <div className="mt-4 pt-4 border-t border-slate-200/50">
                                            <div className="text-[11px] text-slate-500 italic leading-relaxed">
                                                <span className="font-bold text-slate-800 not-italic">Identification Rationale:</span> {rec.rationale}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Component 2: Model Configuration */}
                                <div className="lg:w-1/3">
                                    <div className="h-full bg-slate-50 p-6 rounded-2xl border border-slate-200">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                            <ListChecks className="w-4 h-4" /> Configuration Recommendations
                                        </h4>
                                        <div className="space-y-4">
                                            {rec.configuration.map((cfg, i) => (
                                                <div key={i} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm group-hover:border-indigo-200 transition-colors">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                                    <span className="text-xs font-semibold text-slate-700">{cfg}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Component 3: R Implementation Guidance */}
                                <div className="lg:w-1/3">
                                    <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl h-full flex flex-col">
                                        <div className="bg-slate-800 px-4 py-3 flex justify-between items-center border-b border-slate-700">
                                            <div className="flex items-center gap-2">
                                                <Terminal className="w-4 h-4 text-emerald-400" />
                                                <span className="text-[10px] font-mono text-slate-300 font-bold tracking-wider uppercase">R Protocol Source</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
                                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20" />
                                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20" />
                                            </div>
                                        </div>
                                        <div className="p-6 flex-1 overflow-x-auto bg-slate-950/50 scrollbar-thin">
                                            <pre className="text-[11px] font-mono text-emerald-400 leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30">
                                                <code>{rec.rCode}</code>
                                            </pre>
                                        </div>
                                        <div className="bg-slate-900/80 p-3 text-[9px] text-slate-500 font-mono text-center border-t border-slate-800">
                                            Package requirements: {rec.configuration[0]?.split(':')[0] || 'survival'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <button onClick={onPrev} className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold text-sm transition-colors">
                    Back to Causal Refinement
                </button>
                <div className="flex gap-4">
                    <button onClick={handleFinalize} className="px-8 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2 font-bold group">
                        <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" /> Finalize & Export Protocol (PDF)
                    </button>
                </div>
            </div>
        </div>
    );
};

const TargetIcon = (props: any) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

interface InstructionStep {
  text: string;
  isDone: boolean;
}

interface Term {
  word: string;
  definition: string;
}

interface PhaseDetail {
  title: string;
  subtitle: string;
  objective: string;
  steps: InstructionStep[];
  terms: Term[];
  accentColor: string;
  icon: React.ReactNode;
}

function PhaseInstructionsPanel({
  activePhase,
  dag,
  discoveryData,
  researchQuery,
}: {
  activePhase: Phase;
  dag: DAGData;
  discoveryData: any;
  researchQuery: string;
}) {
  const isQueryFormulated = researchQuery.trim().length > 15;
  const isInitialDagGenerated = dag.nodes.length > 0;
  const isDagModified = JSON.stringify(dag) !== JSON.stringify(INITIAL_CKD_DAG);

  const isDataLoaded = discoveryData !== null;
  const isQualityChecked = discoveryData !== null;
  const isDfgAnalyzed = discoveryData !== null;

  const hasCompetingRisk = dag.nodes.some(n => n.type === NodeType.COMPETING_RISK);
  const hasMediator = dag.nodes.some(n => n.type === NodeType.MEDIATOR);
  const isRefined = hasCompetingRisk || hasMediator;

  const phaseDetails: Record<Phase, PhaseDetail> = {
    [Phase.KNOWLEDGE]: {
      title: "Knowledge Model",
      subtitle: "Establish baseline hypothesis",
      objective: "Formulate your clinical research question and establish a baseline causal DAG structure using literature knowledge.",
      accentColor: "blue",
      icon: <Brain className="w-5 h-5" />,
      steps: [
        { text: "Formulate research question in input", isDone: isQueryFormulated },
        { text: "Generate initial DAG from AI", isDone: isInitialDagGenerated },
        { text: "Edit nodes or edges if necessary", isDone: isDagModified }
      ],
      terms: [
        { word: "Causal DAG", definition: "A Directed Acyclic Graph showing variables (nodes) and hypothesized direct causal effects (edges)." },
        { word: "Confounder", definition: "A variable that causes both the exposure and outcome. Failing to control for it introduces backdoor path bias." },
        { word: "Exposure", definition: "The treatment, intervention, or risk factor being evaluated (e.g., Proton Pump Inhibitors)." },
        { word: "Outcome", definition: "The primary clinical endpoint or effect being studied (e.g., Chronic Kidney Disease progression)." }
      ]
    },
    [Phase.DISCOVERY]: {
      title: "Pattern Discovery",
      subtitle: "Observe empirical patient flows",
      objective: "Upload event logs or patient timelines to automatically discover directly-followed paths and evaluate data quality.",
      accentColor: "indigo",
      icon: <Database className="w-5 h-5" />,
      steps: [
        { text: "Upload CSV or load synthetic data", isDone: isDataLoaded },
        { text: "Examine data quality diagnostics", isDone: isQualityChecked },
        { text: "Analyze clinical flows (DFG / Variants)", isDone: isDfgAnalyzed }
      ],
      terms: [
        { word: "Directly-Follows Graph", definition: "A process mining graph showing which clinical events directly succeed others in patient timelines." },
        { word: "Case / Variant", definition: "A Case is a single patient trajectory. A Variant is a unique sequence of events shared by multiple cases." },
        { word: "Event Log", definition: "A dataset recording patient ID, event description, and timestamp for clinical processes." }
      ]
    },
    [Phase.REFINEMENT]: {
      title: "Governance Refinement",
      subtitle: "Reconcile domain model & data",
      objective: "Review discrepancies between your baseline hypothesis and empirical flows. Accept or reject structural recommendations.",
      accentColor: "purple",
      icon: <GitMerge className="w-5 h-5" />,
      steps: [
        { text: "Review AI-suggested structural adjustments", isDone: isDataLoaded },
        { text: "Inspect data evidence for each proposal", isDone: isRefined },
        { text: "Resolve recommendations (Accept/Reject)", isDone: isRefined }
      ],
      terms: [
        { word: "Mediator", definition: "A variable on the causal path between exposure and outcome. Adjusting for it blocks the indirect effect." },
        { word: "Competing Risk", definition: "An event (e.g., death) that prevents the occurrence of the primary outcome of interest." },
        { word: "Informative Censoring", definition: "Occurs when patients exit the study early due to a competing risk, biasing standard survival estimators." }
      ]
    },
    [Phase.VALIDATION]: {
      title: "Protocol Validation",
      subtitle: "Select and export clinical model",
      objective: "Identify the optimal statistical method matching your refined causal structure and generate production-ready R code.",
      accentColor: "emerald",
      icon: <BarChart3 className="w-5 h-5" />,
      steps: [
        { text: "Evaluate suggested estimation strategy", isDone: true },
        { text: "Inspect tailored R script configuration", isDone: true },
        { text: "Export causal analysis protocol", isDone: false }
      ],
      terms: [
        { word: "Fine-Gray Model", definition: "A subdistribution hazard regression model designed to yield unbiased estimates under competing risks." },
        { word: "Cox Proportional Hazards", definition: "A semi-parametric model used to estimate hazard ratios for time-to-event data without competing risks." },
        { word: "IPTW Balancing", definition: "Inverse Probability of Treatment Weighting adjusts for confounders by creating a pseudo-population where treatment is independent of baseline covariates." }
      ]
    }
  };

  const detail = phaseDetails[activePhase];

  const colorMap = {
    blue: {
      bg: "bg-blue-50/80",
      border: "border-blue-100",
      text: "text-blue-700",
      badge: "bg-blue-100 text-blue-800",
      progress: "bg-blue-600",
      indicator: "border-blue-600 text-blue-600",
      accent: "text-blue-600"
    },
    indigo: {
      bg: "bg-indigo-50/80",
      border: "border-indigo-100",
      text: "text-indigo-700",
      badge: "bg-indigo-100 text-indigo-800",
      progress: "bg-indigo-600",
      indicator: "border-indigo-600 text-indigo-600",
      accent: "text-indigo-600"
    },
    purple: {
      bg: "bg-purple-50/80",
      border: "border-purple-100",
      text: "text-purple-700",
      badge: "bg-purple-100 text-purple-800",
      progress: "bg-purple-600",
      indicator: "border-purple-600 text-purple-600",
      accent: "text-purple-600"
    },
    emerald: {
      bg: "bg-emerald-50/80",
      border: "border-emerald-100",
      text: "text-emerald-700",
      badge: "bg-emerald-100 text-emerald-800",
      progress: "bg-emerald-600",
      indicator: "border-emerald-600 text-emerald-600",
      accent: "text-emerald-600"
    }
  }[detail.accentColor as 'blue' | 'indigo' | 'purple' | 'emerald'] || {
    bg: "bg-slate-50/80",
    border: "border-slate-100",
    text: "text-slate-700",
    badge: "bg-slate-100 text-slate-800",
    progress: "bg-slate-600",
    indicator: "border-slate-600 text-slate-600",
    accent: "text-slate-600"
  };

  const progressPercent = activePhase === Phase.KNOWLEDGE ? 25 
                        : activePhase === Phase.DISCOVERY ? 50 
                        : activePhase === Phase.REFINEMENT ? 75 
                        : 100;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm sticky top-24 space-y-6">
      <div className={`p-4 rounded-xl border ${colorMap.bg} ${colorMap.border} flex items-center gap-3`}>
        <div className={`p-2 bg-white rounded-lg shadow-sm ${colorMap.text}`}>
          {detail.icon}
        </div>
        <div>
          <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full ${colorMap.badge}`}>
            Phase {activePhase} of 4
          </span>
          <h3 className="font-bold text-slate-800 text-sm mt-1 leading-tight">{detail.title}</h3>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center text-xs mb-1.5 font-medium text-slate-500">
          <span>Overall Loop Progress</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div className={`${colorMap.progress} h-full transition-all duration-500`} style={{ width: `${progressPercent}%` }}></div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <TargetIcon className="w-3.5 h-3.5" /> Objective
        </h4>
        <p className="text-xs text-slate-600 leading-relaxed font-medium">
          {detail.objective}
        </p>
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <ListChecks className="w-4 h-4" /> Checklist
        </h4>
        <div className="space-y-2.5">
          {detail.steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2.5">
              {step.isDone ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <div className={`w-4 h-4 rounded-full border-2 ${colorMap.indicator} flex items-center justify-center shrink-0 mt-0.5`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${colorMap.progress}`}></div>
                </div>
              )}
              <span className={`text-xs ${step.isDone ? 'text-slate-400 line-through font-normal' : 'text-slate-700 font-semibold'}`}>
                {step.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" /> Key Terminology
        </h4>
        <div className="space-y-3">
          {detail.terms.map((t, idx) => (
            <div key={idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1 transition-all duration-300 hover:shadow-md">
              <span className={`text-xs font-bold ${colorMap.accent}`}>{t.word}</span>
              <p className="text-[11px] text-slate-500 leading-normal">{t.definition}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Updated Main Application ---

export default function App() {
  const [activePhase, setActivePhase] = useState<Phase>(Phase.KNOWLEDGE);
  const [dag, setDag] = useState<DAGData>(INITIAL_CKD_DAG);
  const [discoveryData, setDiscoveryData] = useState<{stats: ProcessStats, quality: DataQualityReport, dfg: DAGData} | null>(null);
  
  // This state is lifted up so both Phase1 and Phase4 can access the query
  const [researchQuery, setResearchQuery] = useState("Does Proton Pump Inhibitor (PPI) use accelerate Chronic Kidney Disease (CKD) progression?");
  
  const isRefined = dag.nodes.some(n => n.id === 'death' || n.id === 'aki');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-200"><GitMerge className="w-5 h-5" /></div>
                <div><h1 className="text-lg font-bold text-slate-900 leading-none tracking-tight">HealthProcessAI</h1></div>
            </div>
            <div className="hidden md:flex items-center gap-1 text-sm font-medium">
               {[
                   { id: Phase.KNOWLEDGE, label: "1. Knowledge", icon: Brain },
                   { id: Phase.DISCOVERY, label: "2. Discovery", icon: Database },
                   { id: Phase.REFINEMENT, label: "3. Refinement", icon: GitMerge },
                   { id: Phase.VALIDATION, label: "4. Protocol", icon: BarChart3 },
               ].map((item) => (
                   <button key={item.id} onClick={() => setActivePhase(item.id)} className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${activePhase === item.id ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
                       <item.icon className="w-4 h-4" />{item.label}
                   </button>
               ))}
            </div>
        </div>
      </header>
      <main className="flex-1 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <aside className="lg:col-span-3">
               <PhaseInstructionsPanel
                 activePhase={activePhase}
                 dag={dag}
                 discoveryData={discoveryData}
                 researchQuery={researchQuery}
               />
            </aside>
            <div className="lg:col-span-9">
               {activePhase === Phase.KNOWLEDGE && <Phase1 dag={dag} setDag={setDag} query={researchQuery} setQuery={setResearchQuery} onNext={() => setActivePhase(Phase.DISCOVERY)} />}
               {activePhase === Phase.DISCOVERY && <Phase2 onPrev={() => setActivePhase(Phase.KNOWLEDGE)} onNext={() => setActivePhase(Phase.REFINEMENT)} onComplete={(stats, quality, dfg) => setDiscoveryData({stats, quality, dfg})} />}
               {activePhase === Phase.REFINEMENT && <Phase3 currentDag={dag} setDag={setDag} discovery={discoveryData} onPrev={() => setActivePhase(Phase.DISCOVERY)} onNext={() => setActivePhase(Phase.VALIDATION)} />}
               {activePhase === Phase.VALIDATION && <Phase4 currentDag={dag} originalQuery={researchQuery} onPrev={() => setActivePhase(Phase.REFINEMENT)} />}
            </div>
         </div>
      </main>
    </div>
  );
}