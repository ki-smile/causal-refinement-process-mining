
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ProcessMapProps {
  variants: { path: string[], count: number }[];
}

const ProcessMap: React.FC<ProcessMapProps> = ({ variants }) => {
  const data = variants.map(v => ({
    name: v.path.join(' → '),
    count: v.count,
    path: v.path
  }));

  const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#6366f1', '#84cc16'];

  if (variants.length === 0) {
    return <div className="text-center py-10 text-slate-400">No process variants found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {data.slice(0, 10).map((item, index) => (
          <div key={index} className="flex items-center p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
             <div className="flex-1 overflow-hidden">
                <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wide">
                    Variant {index + 1} {index === 0 && "(Most Common)"}
                </div>
                <div className="flex items-center space-x-1 overflow-x-auto pb-1 no-scrollbar">
                    {item.path.map((step, i) => (
                        <React.Fragment key={i}>
                            <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap font-medium border ${
                                step.includes('Decline') || step.includes('Death') || step.includes('Fail') ? 'bg-red-50 text-red-700 border-red-100' :
                                step.includes('Start') || step.includes('PPI') ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                step.includes('Stable') || step.includes('Success') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                'bg-slate-50 text-slate-600 border-slate-200'
                            }`}>
                                {step}
                            </span>
                            {i < item.path.length - 1 && (
                                <span className="text-slate-300 text-xs">→</span>
                            )}
                        </React.Fragment>
                    ))}
                </div>
             </div>
             <div className="text-right pl-4 border-l border-slate-100 ml-2 min-w-[60px]">
                <div className="text-lg font-bold text-slate-800">{item.count}</div>
                <div className="text-[10px] text-slate-400 uppercase">Cases</div>
             </div>
          </div>
        ))}
      </div>

      <div className="h-48 bg-white p-4 rounded-lg border border-slate-200">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Variant Distribution</h4>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data.slice(0, 10)}
            margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={0} tick={false} />
            <Tooltip 
                cursor={{fill: '#f8fafc'}}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                formatter={(value: number) => [`${value} Cases`, 'Count']}
                labelStyle={{ fontWeight: 'bold', marginBottom: '4px', maxWidth: '200px', whiteSpace: 'normal' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={12}>
              {data.slice(0, 10).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProcessMap;
