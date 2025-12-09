import express from "express";
import { buildLlmClient, resolveAskModel } from "./llm-client.js";
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 30000;
const DEFAULT_NODE_TYPE = "logic";
const VALID_NODE_TYPES = new Set([
  "logic",
  "descriptive",
  "event",
  "condition",
  "data",
  "output",
]);
const LEGACY_NODE_TYPES = {
  note: "logic",
  default: "logic",
  input: "data",
  output: "output",
  modifier: "logic",
};

const systemPrompt = `
You are the AI Copilot for a node-based editor. Given a user prompt and optional selected nodes, you:
- Brainstorm ideas and suggestions for the user.
- Reword or clarify nodes when asked.
- Suggest connections between nodes based on semantics.

Respond ONLY with JSON using the shape:
{
  "reply": "string",                        // conversational answer to the user
  "newNodes": [                             // optional: nodes to create
    { "id": "string", "label": "string", "notes": "string", "nodeType": "logic|descriptive|event|condition|data|output" }
  ],
  "updatedNodes": [                         // optional: node updates
    { "id": "string", "label": "string", "notes": "string", "nodeType": "logic|descriptive|event|condition|data|output" }
  ],
  "suggestedConnections": [                 // optional: edges to add
    { "source": "string", "target": "string", "reason": "string" }
  ]
}

Rules:
- Keep reply concise and helpful.
- Only propose IDs the frontend can use directly (avoid collisions when possible).
- Default nodeType to "logic" if you're unsure, and mirror it to the legacy "type" field for compatibility.
- If unsure, leave arrays empty rather than guessing.
`;

function coerceNodeType(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (VALID_NODE_TYPES.has(normalized)) return normalized;
  if (normalized && LEGACY_NODE_TYPES[normalized]) return LEGACY_NODE_TYPES[normalized];
  return DEFAULT_NODE_TYPE;
}

function sanitizeSelectedNodes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((node) => {
      if (!node || typeof node !== "object") return null;
      const id = typeof node.id === "string" ? node.id.trim() : "";
      const label = typeof node.label === "string" ? node.label.trim() : "";
      if (!id && !label) return null;
      const notes =
        typeof node.notes === "string" && node.notes.trim().length
          ? node.notes.trim()
          : undefined;
      const rawType =
        typeof node.type === "string" && node.type.trim().length
          ? node.type.trim()
          : undefined;
      const rawNodeType =
        typeof node.nodeType === "string" && node.nodeType.trim().length
          ? node.nodeType.trim()
          : undefined;
      const nodeType = coerceNodeType(rawNodeType || rawType);
      return {
        id: id || label,
        label: label || id,
        notes,
        type: nodeType,
        nodeType,
      };
    })
    .filter(Boolean);
}

function normalizeResponse(json) {
  if (!json || typeof json !== "object") {
    return {
      reply: "",
      newNodes: [],
      updatedNodes: [],
      suggestedConnections: [],
    };
  }

  const safeArray = (value) => (Array.isArray(value) ? value : []);

  return {
    reply: typeof json.reply === "string" ? json.reply : "",
    newNodes: safeArray(json.newNodes),
    updatedNodes: safeArray(json.updatedNodes),
    suggestedConnections: safeArray(json.suggestedConnections),
  };
}

export function createAskAiRouter({ client, model } = {}) {
  const openai = client || buildLlmClient();

  const router = express.Router();

  router.post("/ask-ai", async (req, res) => {
    const modelName = model || resolveAskModel();
    const { prompt, selectedNodes: rawSelectedNodes } = req.body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim().length) {
      return res
        .status(400)
        .json({ error: "Prompt is required and must be a non-empty string." });
    }

    const selectedNodes = sanitizeSelectedNodes(rawSelectedNodes);

    try {
      const response = await openai.chat.completions.create(
        {
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: JSON.stringify({
                prompt: prompt.trim(),
                selectedNodes,
              }),
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.4,
          max_tokens: 800,
        },
        { timeout: REQUEST_TIMEOUT_MS }
      );

      const rawContent = response?.choices?.[0]?.message?.content;
      if (!rawContent || typeof rawContent !== "string") {
        return res
          .status(502)
          .json({ error: "Invalid response from AI service (empty content)." });
      }

      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch (parseErr) {
        console.error("ask-ai parse error:", parseErr, rawContent);
        return res
          .status(502)
          .json({ error: "AI response was not valid JSON." });
      }

      const normalized = normalizeResponse(parsed);
      res.json(normalized);
    } catch (err) {
      console.error("ask-ai error:", err.response?.data || err.message || err);
      const status = err?.response?.status;
      res
        .status(status && status >= 400 ? status : 502)
        .json({ error: "Something went wrong talking to the AI." });
    }
  });

  return router;
}

export default createAskAiRouter;
