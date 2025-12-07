// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const CODEGEN_MODEL = process.env.OPENAI_CODEGEN_MODEL || "gpt-4.1-mini";
const app = express();
const port = process.env.PORT || 3001;
const systemPrompt = `
You are the code generation engine for a visual, node-based programming tool.

The request body contains:
- nodes: the full current graph of nodes.
- edges: directed connections between nodes.
- changes: only the staged changes since the last sync.
- intent: currently "sync".
- modifierTargets (optional): an object whose keys are modifier node ids and whose values are arrays of node ids that modifier is allowed to change.

Each node participates in the implementation and may represent:
- a unit of behaviour (e.g. "A simple plus calculator"),
- a high-level instruction (e.g. "Generate this is python"),
- or a modifier of other nodes (e.g. "Add a comment at the top").

CODE MAPPING
------------

For each node that participates in the implementation, you must generate or update code wrapped in markers of the form:

// <NODE:{nodeId}:START>
... implementation ...
// <NODE:{nodeId}:END>

These markers must be stable across syncs so that specific node regions can be updated later.

Use the full graph (nodes + edges) for context, but treat "changes" as the primary driver for what to modify. For added nodes, create new marker blocks. For modified nodes, update only their marker blocks and minimal glue code. For deleted nodes, remove or disable their marker blocks and any direct references that would break the build.

MODIFIER NODES AND HARD SCOPING
-------------------------------

Some nodes act like modifiers, for example:
- "Add a comment at the top"
- "Only apply to the connected node above"
- "Make this async"
- "Add logging"

The request may include a "modifierTargets" object like:

{
  "modifier-node-id": ["target-node-id-1", "target-node-id-2"],
  ...
}

This defines, explicitly, which node ids each modifier is allowed to affect.

HARD RULE (must be strictly followed):

- A modifier may ONLY change code for node ids listed in modifierTargets[modifierId].
- If a node id is not listed as a target for a modifier, that modifier MUST NOT change that node's code or any file/function that implements it.
- Do NOT infer extra targets based on similarity, shared parents, or helpfulness. Ignore intuition: follow modifierTargets exactly.
- If modifierTargets is missing or a modifier id has no entry, assume that modifier has no allowed targets and must not change anything.

Example:

- Nodes:
    - "A simple plus calculator" (id: plus-calculator)
    - "A simple times calculator" (id: times-calculator)
- Modifier:
    - "Add a comment at the top" (id: comment-modifier)
- modifierTargets:
    {
      "comment-modifier": ["plus-calculator"]
    }

Result:
- Only the code for "plus-calculator" is changed by the modifier (e.g. adding a comment at the top of its file or function).
- The code for "times-calculator" MUST remain untouched apart from its own node description.

OUTPUT FORMAT
-------------

Return a single JSON object of the form:

{
  "files": [
    { "path": string, "contents": string }
  ]
}

Rules:
- "files" must contain the full contents of each generated/updated file (no patches).
- Do NOT include any extra top-level keys or prose in the response.
- The response must be valid JSON (no markdown fences, comments, or trailing commas).
`;

function computeModifierTargets(nodes, edges) {
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const targets = {};

  for (const node of nodes) {
    // Simple heuristic for now:
    // treat nodes explicitly tagged as modifiers OR whose label mentions "comment" / "modifier" as modifiers.
    const label = (node.data?.label || "").toLowerCase();
    const isModifier =
      node.type === "modifier" ||
      node.data?.kind === "modifier" ||
      label.includes("add a comment") ||
      label.includes("modifier");

    if (!isModifier) continue;

    const modifierId = node.id;
    targets[modifierId] = edges
      .filter((edge) => edge.source === modifierId)
      .map((edge) => edge.target)
      .filter((targetId) => Boolean(nodeMap[targetId]));
  }

  return targets;
}

// Basic middleware
app.use(cors());
app.use(express.json());

// OpenAI client (reads OPENAI_API_KEY from .env)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple test route: generate nodes from a prompt + current graph
app.post("/api/generate-nodes", async (req, res) => {
  const { userPrompt, graph } = req.body;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini", // or gpt-4.1 / gpt-5.1 if you have it
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an AI that edits a node-based app architecture. " +
            "You ONLY respond with JSON describing node operations.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instructions: userPrompt,
            currentGraph: graph,
          }),
        },
      ],
    });

    const raw = response.choices[0].message.content;
    const data = JSON.parse(raw); // your node ops JSON
    res.json(data);
  } catch (err) {
    console.error("OpenAI error:", err.response?.data || err.message);
    res.status(500).json({ error: "LLM request failed" });
  }
});

// Code generation route (real OpenAI call)
app.post("/api/generate-code", async (req, res) => {
  const {
    nodes: rawNodes = [],
    edges: rawEdges = [],
    changes: rawChanges = [],
    intent = "sync",
  } = req.body || {};

  const nodes = Array.isArray(rawNodes) ? rawNodes : [];
  const edges = Array.isArray(rawEdges) ? rawEdges : [];
  const changes = Array.isArray(rawChanges) ? rawChanges : [];
  const modifierTargets = computeModifierTargets(nodes, edges);

  try {
    const response = await client.chat.completions.create({
      model: CODEGEN_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify({
            intent,
            nodes,
            edges,
            changes,
            modifierTargets,
          }),
        },
      ],
    });

    const raw = response.choices[0].message.content;

    try {
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (parseErr) {
      console.error("generate-code parse error:", parseErr, "raw:", raw);
      res.status(500).json({ error: "LLM response parse failed" });
    }
  } catch (err) {
    console.error(
      "generate-code error:",
      err.response?.data || err.message || err
    );
    res.status(500).json({ error: "LLM request failed" });
  }
});

// Fake code generation route for testing
app.post("/api/generate-code-fake", (req, res) => {
  const {
    nodes: rawNodes = [],
    edges: rawEdges = [],
    changes: rawChanges = [],
    intent = "sync",
  } = req.body || {};

  const nodes = Array.isArray(rawNodes) ? rawNodes : [];
  const edges = Array.isArray(rawEdges) ? rawEdges : [];
  const changes = Array.isArray(rawChanges) ? rawChanges : [];

  try {
    const nodeCount = Array.isArray(nodes) ? nodes.length : 0;
    const edgeCount = Array.isArray(edges) ? edges.length : 0;
    const changeCount = Array.isArray(changes) ? changes.length : 0;

    const fakeResponse = {
      files: [
        {
          path: "generated/nodeSpecs.md",
          contents:
            "# Plan\n" +
            "This is a FAKE LLM response for testing.\n" +
            "Include a short bullet list of what changed based on node/edge counts.\n" +
            `- Nodes: ${nodeCount}\n` +
            `- Edges: ${edgeCount}\n` +
            `- Changes: ${changeCount}\n`,
        },
        {
          path: "src/generated-logic.js",
          contents:
            "export function run(){ console.log('Fake LLM run() called'); }\n",
        },
      ],
      meta: {
        intent,
        nodeCount,
        edgeCount,
        changeCount,
      },
    };

    res.json(fakeResponse);
  } catch (err) {
    console.error("generate-code-fake error:", err);
    res.status(500).json({ error: "Fake codegen failed" });
  }
});

// Simple health check
app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Node-AI backend listening on http://localhost:${port}`);
});
