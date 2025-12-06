// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const CODEGEN_MODEL = process.env.OPENAI_CODEGEN_MODEL || "gpt-4.1-mini";
const app = express();
const port = process.env.PORT || 3001;

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
          content:
            "You are the code generator for a node-based app. " +
            "You must respond with ONLY JSON shaped as {\"files\":[{\"path\":string,\"contents\":string}]}. " +
            "Each entry in files represents a virtual file to create or overwrite. " +
            "Do not include markdown fences, comments, or prose. " +
            "No extra keys beyond files. Ensure the JSON is valid and complete.",
        },
        {
          role: "user",
          content: JSON.stringify({
            intent,
            currentGraph: { nodes, edges },
            stagedChanges: changes,
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
