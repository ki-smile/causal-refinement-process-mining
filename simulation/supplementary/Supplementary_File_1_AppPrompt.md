# Base Prompt Template

Generate a Causal DAG (Directed Acyclic Graph) for the following research question/hypothesis: "${hypothesis}". 

Identify the Exposure, Outcome, Confounders, and potential Mediators. Return a JSON object with 'nodes' and 'edges'. Ensure IDs are simple strings like 'age', 'sex'.

# RAG Context Extension

CRUCIAL CONTEXT: We have previously validated empirical data for a similar clinical question ("${pastContext.hypothesis}"). The validated causal structure was: ${JSON.stringify(pastContext.dag)}. Use this historical empirical data to heavily inform your structural decisions and node selections. Do not ignore this structure.

# Structured Output Schema

{
  "type": "OBJECT",
  "properties": {
    "nodes": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "properties": {
          "id": { "type": "STRING" },
          "label": { "type": "STRING" },
          "type": {
            "type": "STRING",
            "enum": [
              "EXPOSURE",
              "OUTCOME",
              "CONFOUNDER",
              "MEDIATOR",
              "COMPETING_RISK",
              "OTHER"
            ]
          }
        },
        "required": ["id", "label", "type"]
      }
    },
    "edges": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "properties": {
          "source": { "type": "STRING" },
          "target": { "type": "STRING" },
          "label": { "type": "STRING" }
        },
        "required": ["source", "target"]
      }
    }
  },
  "required": ["nodes", "edges"]
}