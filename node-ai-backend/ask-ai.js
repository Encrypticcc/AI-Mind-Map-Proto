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
You are the AI Copilot for a node-based editor.

OUTPUT FORMAT (MANDATORY)
- You MUST respond with a single valid JSON object, and nothing else (no markdown, no commentary).
- Use only double quotes for strings. Escape newlines as \\n or use short single-line strings.
- If you cannot produce valid JSON, return exactly: {"error":"<short explanation>"} and nothing else.

SCHEMA
Return a JSON object with these keys (missing arrays are allowed but must be present as empty arrays if no items):
{
  "reply": "string",
  "newNodes": [ { "id":"string","label":"string","notes":"string","nodeType":"logic|descriptive|event|condition|data|output" } ],
  "updatedNodes": [ { "id":"string","label":"string","notes":"string","nodeType":"logic|descriptive|event|condition|data|output" } ],
  "suggestedConnections": [ { "source":"string","target":"string","reason":"string" } ],
  "meta": { "formatVersion": "1", "generatedBy":"copilot", "generatedAt":"ISO8601" }
}

RULES
- Keep "reply" concise (max ~300 chars). It's OK to be short.
- When creating IDs prefer short deterministic forms (e.g. hero_section, features_grid, demo_showcase). Avoid any punctuation or spaces.
- Default nodeType to "logic" if unsure. Also mirror it to a compatibility field "type": "<same value>" if needed.
- Do NOT invent fields outside the schema. Extra fields may be ignored by the backend.
- Do not include raw code blocks or file dumps inside the notes field (notes can be short descriptions only).
- Always include the "meta" object above.
- If arrays are empty, return them as empty arrays (e.g. "newNodes": []) rather than omitting them.

EXAMPLE (exact shape, keep formatting compact):
{"reply":"OK, created nodes","newNodes":[{"id":"hero_section","label":"Hero Section","notes":"Bold headline + CTA","nodeType":"descriptive"}],"updatedNodes":[],"suggestedConnections":[],"meta":{"formatVersion":"1","generatedBy":"copilot","generatedAt":"2025-12-11T12:00:00Z"}}
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
