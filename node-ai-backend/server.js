// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

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

// Simple health check
app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Node-AI backend listening on http://localhost:${port}`);
});
