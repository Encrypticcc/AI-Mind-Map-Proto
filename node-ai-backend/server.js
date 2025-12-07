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

Each node participates in the implementation and may represent:
- a unit of behaviour (e.g. "A simple plus calculator"),
- a high-level instruction (e.g. "Generate this is python"),
- or a modifier of other nodes (e.g. "Add a comment at the top", "Make this async").

CODE MAPPING
------------

For each node that participates in the implementation, you must generate or update code
wrapped in markers of the form:

// <NODE:{nodeId}:START>
... implementation ...
// <NODE:{nodeId}:END>

These markers must be stable across syncs so that specific node regions can be updated later.

Use the full graph (nodes + edges) for context, but treat "changes" as the primary driver
for what to modify. For added nodes, create new marker blocks. For modified nodes, update
only their marker blocks and minimal glue code. For deleted nodes, remove or disable their
marker blocks and any direct references that would break the build.

MODIFIER NODES AND EDGE SCOPING
-------------------------------

Some nodes act like modifiers, for example:
- "Add a comment at the top"
- "Only apply to the connected node above"
- "Make this async"
- "Add logging to this function"

IMPORTANT RULE:

A modifier node may ONLY affect the nodes it is explicitly connected to by outgoing edges.

- If a modifier node M has an edge from M -> A, then M may only change the code associated
  with node A (and any files/functions that directly implement node A).
- If M is NOT connected to node B by an edge, M MUST NOT change node B's code, even if B:
  - is a sibling of A,
  - shares the same parent as A,
  - or has a very similar description.

Example:

- Node "Generate this is python" is a parent instruction node.
- Child nodes:
    - "A simple plus calculator" (node id: plus-calculator)
    - "A simple times calculator" (node id: times-calculator)
- Modifier node:
    - "Add a comment at the top" connected ONLY to "A simple plus calculator".

Result:
- Only the code for "A simple plus calculator" is changed by the modifier (e.g. adding a
  comment at the top of its file or function).
- The code for "A simple times calculator" must remain unchanged apart from its own node
  description. The modifier MUST NOT touch it.

Always use edges to determine scope:
- A modifier’s effect is limited to its explicit outgoing connections.
- Do not "helpfully" apply modifiers to other nodes that merely look similar or share a
  parent.

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
