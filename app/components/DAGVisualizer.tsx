import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { DAGData, NodeType } from '../types';

interface DAGVisualizerProps {
  data: DAGData;
  width?: number;
  height?: number;
  interactive?: boolean;
  onNodeClick?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  linkingSourceId?: string | null; // ID of the node currently being used as source for a new link
}

const DAGVisualizer: React.FC<DAGVisualizerProps> = ({ 
  data, 
  width = 600, 
  height = 400, 
  interactive = true,
  onNodeClick,
  selectedNodeId,
  linkingSourceId
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    // Create deep copies to avoid mutating props directly during simulation
    // If x/y are provided in data (e.g. from previous state), use them to stabilize
    const nodes = data.nodes.map(d => ({ ...d }));
    const links = data.edges.map(d => ({ ...d }));

    // Setup simulation
    // Added forceX and forceY to act as gravity, keeping unconnected nodes (like new ones) near the center
    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.05)) // Gravity to center horizontally
      .force("y", d3.forceY(height / 2).strength(0.05)) // Gravity to center vertically
      .force("collide", d3.forceCollide().radius(45));

    // Define Arrowhead markers
    const defs = svg.append("defs");
    ["hypothesized", "observed", "refuted"].forEach(type => {
        const color = type === 'observed' ? '#ef4444' : type === 'refuted' ? '#94a3b8' : '#334155';
        
        defs.append("marker")
            .attr("id", `arrow-${type}`)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 28) // Offset to not overlap with node circle
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", color);
    });

    // Draw Links
    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("stroke-width", (d: any) => d.strength ? Math.max(1, d.strength * 5) : 2)
      .attr("stroke", (d: any) => {
         if (d.type === 'observed') return '#ef4444';
         if (d.type === 'refuted') return '#cbd5e1';
         return '#475569';
      })
      .attr("marker-end", (d: any) => `url(#arrow-${d.type || 'hypothesized'})`)
      .attr("opacity", 0.8);

    // Draw Nodes
    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .attr("cursor", interactive ? "pointer" : "default")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any)
      .on("click", (event, d) => {
          if (interactive && onNodeClick) {
              event.stopPropagation();
              onNodeClick(d.id);
          }
      });

    // Node Circles
    node.append("circle")
      .attr("r", (d: any) => d.count ? Math.min(30, Math.max(18, Math.log(d.count) * 5)) : 20)
      .attr("fill", (d: any) => {
        // Highlight logic
        if (d.id === linkingSourceId) return '#fbbf24'; // Amber for source
        
        switch (d.type) {
          case NodeType.EXPOSURE: return '#dbeafe'; 
          case NodeType.OUTCOME: return '#dcfce7'; 
          case NodeType.COMPETING_RISK: return '#fee2e2'; 
          case NodeType.MEDIATOR: return '#f3e8ff'; 
          default: return '#f8fafc'; 
        }
      })
      .attr("stroke", (d: any) => {
        if (d.id === selectedNodeId) return '#000000'; // Black strong border for selected
        if (d.id === linkingSourceId) return '#d97706'; 

        switch (d.type) {
          case NodeType.EXPOSURE: return '#2563eb';
          case NodeType.OUTCOME: return '#16a34a';
          case NodeType.COMPETING_RISK: return '#dc2626';
          case NodeType.MEDIATOR: return '#9333ea';
          default: return '#64748b';
        }
      })
      .attr("stroke-width", (d: any) => (d.id === selectedNodeId || d.id === linkingSourceId) ? 3 : 2)
      .attr("stroke-dasharray", (d: any) => (d.id === linkingSourceId) ? "4 2" : "none");

    // Labels
    node.append("text")
      .text((d: any) => d.label)
      .attr("x", 0)
      .attr("y", 32)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("fill", "#334155")
      .attr("font-weight", "600")
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 2px white");

    // Simulation Tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag handlers
    function dragstarted(event: any, d: any) {
      if (!interactive) return;
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      if (!interactive) return;
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!interactive) return;
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data, width, height, interactive, onNodeClick, selectedNodeId, linkingSourceId]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden relative flex flex-col">
       {interactive && (
           <div className="absolute top-2 right-2 text-[10px] text-slate-400 pointer-events-none">
               Interactive Graph
           </div>
       )}
       <div className="flex-1">
          <svg ref={svgRef} width={width} height={height} className="block mx-auto" onClick={() => onNodeClick && onNodeClick('')} />
       </div>
       <div className="bg-slate-50 border-t border-slate-100 p-3 flex flex-wrap gap-y-2 gap-x-4 justify-center items-center text-[10px] font-medium text-slate-600">
         <div className="flex items-center gap-1.5">
           <span className="w-3 h-3 rounded-full bg-[#dbeafe] border border-[#2563eb] shrink-0"></span>
           <span>Exposure</span>
         </div>
         <div className="flex items-center gap-1.5">
           <span className="w-3 h-3 rounded-full bg-[#dcfce7] border border-[#16a34a] shrink-0"></span>
           <span>Outcome</span>
         </div>
         <div className="flex items-center gap-1.5">
           <span className="w-3 h-3 rounded-full bg-[#f8fafc] border border-[#64748b] shrink-0"></span>
           <span>Confounder</span>
         </div>
         <div className="flex items-center gap-1.5">
           <span className="w-3 h-3 rounded-full bg-[#f3e8ff] border border-[#9333ea] shrink-0"></span>
           <span>Mediator</span>
         </div>
         <div className="flex items-center gap-1.5">
           <span className="w-3 h-3 rounded-full bg-[#fee2e2] border border-[#dc2626] shrink-0"></span>
           <span>Competing Risk</span>
         </div>
         <div className="w-px h-3 bg-slate-200 mx-1 shrink-0"></div>
         <div className="flex items-center gap-1.5">
           <svg width="20" height="8" className="shrink-0">
             <line x1="0" y1="4" x2="14" y2="4" stroke="#475569" strokeWidth="2" />
             <polygon points="14,1 20,4 14,7" fill="#475569" />
           </svg>
           <span>Hypothesized Path</span>
         </div>
         <div className="flex items-center gap-1.5">
           <svg width="20" height="8" className="shrink-0">
             <line x1="0" y1="4" x2="14" y2="4" stroke="#ef4444" strokeWidth="2" />
             <polygon points="14,1 20,4 14,7" fill="#ef4444" />
           </svg>
           <span>Observed Flow</span>
         </div>
       </div>
    </div>
  );
};

export default DAGVisualizer;