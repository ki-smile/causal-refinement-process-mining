import { DAGData, NodeType } from "../types";

// --- KNOWLEDGE BASE (LOCAL VECTOR DB POC) ---

export const getEmbedding = async (text: string): Promise<number[]> => {
    try {
        const response = await fetch('/api/gemini/embedding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.embedding || [];
    } catch (e) {
        console.error("Embedding failed:", e);
        return [];
    }
};

const cosineSimilarity = (vecA: number[], vecB: number[]) => {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const saveToKnowledgeBase = async (hypothesis: string, dag: DAGData, bestModel: string) => {
    const embedding = await getEmbedding(hypothesis);
    if (!embedding.length) return;

    const newItem = { 
        hypothesis, 
        dag, 
        bestModel, 
        embedding, 
        timestamp: new Date().toISOString() 
    };
    
    const existing = JSON.parse(localStorage.getItem('closed_loop_kb') || '[]');
    existing.push(newItem);
    localStorage.setItem('closed_loop_kb', JSON.stringify(existing));
    console.log("Saved to Knowledge Base:", newItem.hypothesis);
};

export const retrieveSimilarKnowledge = async (newQuery: string) => {
    const queryVector = await getEmbedding(newQuery);
    if (!queryVector.length) return null;

    const kb = JSON.parse(localStorage.getItem('closed_loop_kb') || '[]');
    if (kb.length === 0) return null;

    const scoredItems = kb.map((item: any) => ({
        ...item,
        score: cosineSimilarity(queryVector, item.embedding)
    }));

    // Sort by highest similarity score
    scoredItems.sort((a: any, b: any) => b.score - a.score);

    // Return the highest match if similarity is above 75%
    if (scoredItems[0].score > 0.75) {
        return scoredItems[0];
    }
    return null;
};


// --- AI GENERATION ENGINE ---

export const generateDAGFromHypothesis = async (hypothesis: string): Promise<DAGData | null> => {
  // 1. Check for historical context (RAG)
  const pastContext = await retrieveSimilarKnowledge(hypothesis);

  try {
    const response = await fetch('/api/gemini/generate-dag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hypothesis, pastContext }),
    });

    if (!response.ok) {
      console.error("Backend error:", response.statusText);
      return null;
    }

    const data = await response.json();
    return data as DAGData;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};