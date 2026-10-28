
import { EventLogEntry, ProcessStats, DataQualityReport, DAGData, NodeType } from '../types';

// Robust CSV Parser that handles quoted commas
const parseCSVLine = (line: string): string[] => {
    const result = [];
    let startValueIndex = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        if (line[i] === ',' && !inQuotes) {
            result.push(line.substring(startValueIndex, i).replace(/^"|"$/g, '').trim());
            startValueIndex = i + 1;
        }
    }
    result.push(line.substring(startValueIndex).replace(/^"|"$/g, '').trim());
    return result;
};

// Mock generator for demo purposes
export const generateMockEventLog = (): EventLogEntry[] => {
    const events: EventLogEntry[] = [];
    const startDate = new Date('2023-01-01');
    
    // Pattern 1: Standard Progression (50 cases)
    for (let i = 0; i < 50; i++) {
        const caseId = `C${1000 + i}`;
        let d = new Date(startDate.getTime() + i * 86400000);
        events.push({ caseId, activity: 'PPI Start', timestamp: new Date(d) });
        d = new Date(d.getTime() + 1000 * 60 * 60 * 24 * 30);
        events.push({ caseId, activity: 'Stable eGFR', timestamp: new Date(d) });
        d = new Date(d.getTime() + 1000 * 60 * 60 * 24 * 30);
        events.push({ caseId, activity: 'End of Follow-up', timestamp: new Date(d) });
    }

    // Pattern 2: Rapid Decline (30 cases)
    for (let i = 0; i < 30; i++) {
        const caseId = `C${2000 + i}`;
        let d = new Date(startDate.getTime() + i * 86400000);
        events.push({ caseId, activity: 'PPI Start', timestamp: new Date(d) });
        d = new Date(d.getTime() + 1000 * 60 * 60 * 24 * 15);
        events.push({ caseId, activity: 'Rapid eGFR Drop', timestamp: new Date(d) });
        d = new Date(d.getTime() + 1000 * 60 * 60 * 24 * 10);
        events.push({ caseId, activity: 'CKD Stage 4', timestamp: new Date(d) });
    }

    // Pattern 3: Competing Risk (20 cases) - The "Death" finding
    for (let i = 0; i < 20; i++) {
        const caseId = `C${3000 + i}`;
        let d = new Date(startDate.getTime() + i * 86400000);
        events.push({ caseId, activity: 'PPI Start', timestamp: new Date(d) });
        d = new Date(d.getTime() + 1000 * 60 * 60 * 24 * 20);
        events.push({ caseId, activity: 'Hospitalization', timestamp: new Date(d) });
        d = new Date(d.getTime() + 1000 * 60 * 60 * 24 * 5);
        events.push({ caseId, activity: 'Death', timestamp: new Date(d) });
    }

    return events;
};

export const parseCSV = async (file: File): Promise<EventLogEntry[]> => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) throw new Error("File is empty or missing headers");

    const rawHeaders = parseCSVLine(lines[0]);
    const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    
    const caseIdIdx = headers.findIndex(h => h.includes('case') || h.includes('id') || h.includes('patient'));
    const activityIdx = headers.findIndex(h => h.includes('activity') || h.includes('event') || h.includes('conceptname') || h.includes('action'));
    const timeIdx = headers.findIndex(h => h.includes('time') || h.includes('date') || h.includes('start'));

    if (caseIdIdx === -1 || activityIdx === -1 || timeIdx === -1) {
        throw new Error(`Could not automatically map columns. Found headers: [${rawHeaders.join(', ')}]. Expected Case ID, Activity, and Timestamp.`);
    }

    const data: EventLogEntry[] = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length < Math.max(caseIdIdx, activityIdx, timeIdx)) continue;

        const timestamp = new Date(parts[timeIdx]);
        data.push({
            caseId: parts[caseIdIdx] || '',
            activity: parts[activityIdx] || '',
            timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp
        });
    }
    return data;
};

export const analyzeEventLog = (data: EventLogEntry[]): { stats: ProcessStats, quality: DataQualityReport, dfg: DAGData } => {
    const quality: DataQualityReport = {
        missingValues: 0,
        unsortedTimestamps: 0,
        duplicates: 0,
        issues: [],
        score: 100
    };

    // 1. Cleaning & Quality Check
    const cleanData: EventLogEntry[] = [];
    const seenEvents = new Set<string>();

    data.forEach(e => {
        let isValid = true;
        if (!e.caseId || !e.activity || isNaN(e.timestamp.getTime())) {
            quality.missingValues++;
            isValid = false;
        }
        
        const uniqueKey = `${e.caseId}-${e.activity}-${e.timestamp.getTime()}`;
        if (seenEvents.has(uniqueKey)) {
            quality.duplicates++;
            isValid = false;
        } else {
            seenEvents.add(uniqueKey);
        }

        if (isValid) cleanData.push(e);
    });

    if (quality.missingValues > 0) quality.issues.push(`Found ${quality.missingValues} rows with missing or invalid data.`);
    if (quality.duplicates > 0) quality.issues.push(`Removed ${quality.duplicates} duplicate events.`);

    // 2. Grouping and Sorting
    const cases: Record<string, EventLogEntry[]> = {};
    cleanData.forEach(e => {
        if (!cases[e.caseId]) cases[e.caseId] = [];
        cases[e.caseId].push(e);
    });

    let unsortedCount = 0;
    Object.values(cases).forEach(events => {
        let sorted = true;
        for (let i = 1; i < events.length; i++) {
            if (events[i].timestamp < events[i - 1].timestamp) {
                sorted = false;
                break;
            }
        }
        if (!sorted) unsortedCount++;
        events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    });

    if (unsortedCount > 0) {
        quality.unsortedTimestamps = unsortedCount;
        quality.issues.push(`${unsortedCount} cases had out-of-order timestamps (auto-corrected).`);
        quality.score -= 10;
    }
    quality.score -= (quality.missingValues > 0 ? 5 : 0);

    // 3. Stats & DFG Construction
    const variants: Record<string, number> = {};
    const dfgMap: Record<string, Record<string, number>> = {};
    const activityCounts: Record<string, number> = {};
    let totalDurationMs = 0;
    let durationCases = 0;

    Object.values(cases).forEach(events => {
        if (events.length === 0) return;

        // Activity Counts
        events.forEach(e => {
            activityCounts[e.activity] = (activityCounts[e.activity] || 0) + 1;
        });

        // Duration
        if (events.length > 1) {
            const duration = events[events.length - 1].timestamp.getTime() - events[0].timestamp.getTime();
            totalDurationMs += duration;
            durationCases++;
        }

        // Variants
        const path = events.map(e => e.activity);
        const pathStr = path.join('||');
        variants[pathStr] = (variants[pathStr] || 0) + 1;

        // DFG Edges
        for (let i = 0; i < path.length - 1; i++) {
            const source = path[i];
            const target = path[i+1];
            if (!dfgMap[source]) dfgMap[source] = {};
            dfgMap[source][target] = (dfgMap[source][target] || 0) + 1;
        }
    });

    const variantsList = Object.entries(variants)
        .map(([p, count]) => ({ path: p.split('||'), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const nodes = Object.keys(activityCounts).map(act => ({
        id: act.toLowerCase().replace(/\s+/g, '_'),
        label: act,
        type: getNodeTypeGuess(act),
        count: activityCounts[act]
    }));

    const edges: any[] = [];
    Object.keys(dfgMap).forEach(source => {
        Object.keys(dfgMap[source]).forEach(target => {
            edges.push({
                source: source.toLowerCase().replace(/\s+/g, '_'),
                target: target.toLowerCase().replace(/\s+/g, '_'),
                label: dfgMap[source][target].toString(),
                strength: dfgMap[source][target],
                type: 'observed'
            });
        });
    });

    const maxStrength = Math.max(...edges.map(e => e.strength), 1);
    edges.forEach(e => {
        e.strength = 0.1 + (0.9 * (e.strength / maxStrength));
    });

    const avgDurationDays = durationCases > 0 
        ? (totalDurationMs / durationCases / (1000 * 60 * 60 * 24)).toFixed(1) 
        : '0';

    const stats: ProcessStats = {
        totalCases: Object.keys(cases).length,
        totalEvents: cleanData.length,
        uniqueActivities: Object.keys(activityCounts).length,
        avgDuration: `${avgDurationDays} days`,
        variants: variantsList
    };

    return { stats, quality, dfg: { nodes, edges } };
};

const getNodeTypeGuess = (label: string): NodeType => {
    const l = label.toLowerCase();
    if (l.includes('start') || l.includes('init') || l.includes('ppi')) return NodeType.EXPOSURE;
    if (l.includes('death') || l.includes('fail') || l.includes('mortality')) return NodeType.COMPETING_RISK;
    if (l.includes('ckd') || l.includes('outcome') || l.includes('esrd')) return NodeType.OUTCOME;
    if (l.includes('aki') || l.includes('injury') || l.includes('acute')) return NodeType.MEDIATOR;
    return NodeType.OTHER;
};
