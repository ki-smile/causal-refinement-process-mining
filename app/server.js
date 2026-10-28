import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

// Load .env for local development
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Initialize Gemini with server-side secret
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not set in environment variables!");
}
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// --- API Endpoints ---

// 1. Embeddings Endpoint
app.post('/api/gemini/embedding', async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text parameter is required' });
    }

    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
    });
    return res.json({ embedding: response.embeddings[0].values });
  } catch (error) {
    console.error('Embedding error:', error);
    return res.status(500).json({ error: 'Failed to generate embedding' });
  }
});

// 2. DAG Generation Endpoint
app.post('/api/gemini/generate-dag', async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }
    const { hypothesis, pastContext } = req.body;
    if (!hypothesis) {
      return res.status(400).json({ error: 'Hypothesis is required' });
    }

    let promptText = `Generate a Causal DAG (Directed Acyclic Graph) for the following research question/hypothesis: "${hypothesis}". \n\nIdentify the Exposure, Outcome, Confounders, and potential Mediators. Return a JSON object with 'nodes' and 'edges'. Ensure IDs are simple strings like 'age', 'sex'.`;

    if (pastContext) {
      promptText += `\n\nCRUCIAL CONTEXT: We have previously validated empirical data for a similar clinical question ("${pastContext.hypothesis}"). The validated causal structure was: ${JSON.stringify(pastContext.dag)}. Use this historical empirical data to heavily inform your structural decisions and node selections. Do not ignore this structure.`;
    }

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              label: { type: Type.STRING },
              type: {
                type: Type.STRING,
                enum: [
                  'EXPOSURE',
                  'OUTCOME',
                  'CONFOUNDER',
                  'MEDIATOR',
                  'COMPETING_RISK',
                  'OTHER'
                ],
              },
            },
            required: ['id', 'label', 'type'],
          },
        },
        edges: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              source: { type: Type.STRING },
              target: { type: Type.STRING },
              label: { type: Type.STRING },
            },
            required: ['source', 'target'],
          },
        },
      },
      required: ['nodes', 'edges'],
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      },
    });

    const text = response.text;
    if (!text) {
      return res.status(500).json({ error: 'Empty response from Gemini' });
    }

    const data = JSON.parse(text);
    data.edges = (data.edges || []).map((e) => ({ ...e, type: 'hypothesized' }));

    if (pastContext) {
      data.isAugmented = true;
      data.referenceHypothesis = pastContext.hypothesis;
    }

    return res.json(data);
  } catch (error) {
    console.error('DAG Generation error:', error);
    return res.status(500).json({ error: 'Failed to generate DAG' });
  }
});

// --- Serve Static Frontend (Vite dist) in Production ---
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
