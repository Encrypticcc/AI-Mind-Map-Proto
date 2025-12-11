import { DEFAULT_NODE_STYLE } from '../constants/appConstants.js';
import { DEFAULT_NODE_TYPE, normalizeNodeType } from '../nodeTypes.js';
import { attachNodeType } from '../utils/graphUtils.js';

export const exampleTemplates = [
  // ================================
  // 1. WEBSITE TEMPLATE
  // ================================
  {
    id: 'website-template',
    title: 'Website Template',
    summary: 'A starter template for generating any kind of website or landing page.',
    nodes: [
      {
        id: 'idea',
        label: 'What it should do',
        notes: 'Describe the purpose of the website. Example: a portfolio, landing page, shop, blog, or app homepage.',
        position: { x: 0, y: 0 },
        nodeType: 'descriptive',
      },
      {
        id: 'layout',
        label: 'Build the layout',
        notes: 'Explain the page structure: hero section, features, images, text blocks, navigation, or footer.',
        position: { x: 260, y: 0 },
        nodeType: 'descriptive',
      },
      {
        id: 'style',
        label: 'Style',
        notes: 'Describe the design style: modern, luxury, minimalistic, colorful, dark mode, premium typography.',
        position: { x: 520, y: 0 },
        nodeType: 'descriptive',
      },
      {
        id: 'functionality',
        label: 'Functionality',
        notes: 'Optional features: animations, forms, sliders, buttons, transitions, interactive UI elements.',
        position: { x: 780, y: 0 },
        nodeType: 'logic',
      },
      {
        id: 'export',
        label: 'Export page',
        notes: 'Generate a full HTML/CSS/JS website packaged in a single output or separated files.',
        position: { x: 1040, y: 0 },
        nodeType: 'output',
      },
    ],
    edges: [
      { source: 'idea', target: 'layout' },
      { source: 'layout', target: 'style' },
      { source: 'style', target: 'functionality' },
      { source: 'functionality', target: 'export' },
    ],
  },

  // ================================
  // 2. PYTHON SCRIPT TEMPLATE
  // ================================
  {
    id: 'python-template',
    title: 'Python Script Template',
    summary: 'A basic flow for generating any small Python tool or script.',
    nodes: [
      {
        id: 'goal',
        label: 'What it should do',
        notes: 'Explain what the script solves: automation, calculation, file processing, API calls, or data tasks.',
        position: { x: 0, y: 0 },
        nodeType: 'descriptive',
      },
      {
        id: 'inputs',
        label: 'Inputs',
        notes: 'Describe what the script receives: user input, CLI args, files, URLs, or nothing.',
        position: { x: 260, y: 0 },
        nodeType: 'data',
      },
      {
        id: 'logic',
        label: 'Core logic',
        notes: 'Explain the main actions: loops, math, data parsing, filtering, or API requests.',
        position: { x: 520, y: 0 },
        nodeType: 'logic',
      },
      {
        id: 'output',
        label: 'Outputs',
        notes: 'Describe what the script should produce: text, files, JSON, printed results, or logs.',
        position: { x: 780, y: 0 },
        nodeType: 'output',
      },
      {
        id: 'package',
        label: 'Export script',
        notes: 'Generate a ready-to-run .py file using clean functions and comments.',
        position: { x: 1040, y: 0 },
        nodeType: 'output',
      },
    ],
    edges: [
      { source: 'goal', target: 'inputs' },
      { source: 'inputs', target: 'logic' },
      { source: 'logic', target: 'output' },
      { source: 'output', target: 'package' },
    ],
  },

  // ================================
  // 3. BACKEND API TEMPLATE
  // ================================
  {
    id: 'backend-template',
    title: 'Backend API Template',
    summary: 'Template for building a simple backend or microservice.',
    nodes: [
      {
        id: 'purpose',
        label: 'What it should do',
        notes: 'Describe the API goal: store data, fetch something, authenticate users, etc.',
        position: { x: 0, y: 0 },
        nodeType: 'descriptive',
      },
      {
        id: 'routes',
        label: 'Endpoints',
        notes: 'List the routes needed: GET /items, POST /login, etc.',
        position: { x: 260, y: 0 },
        nodeType: 'event',
      },
      {
        id: 'logic',
        label: 'Server logic',
        notes: 'Explain the actions each endpoint performs (validation, saving, reading, processing).',
        position: { x: 520, y: 0 },
        nodeType: 'logic',
      },
      {
        id: 'database',
        label: 'Data',
        notes: 'Describe whether it uses a database, in-memory data, or no storage at all.',
        position: { x: 780, y: 0 },
        nodeType: 'data',
      },
      {
        id: 'export',
        label: 'Export project',
        notes: 'Generate the API in Node, Python, or another backend language of your choice.',
        position: { x: 1040, y: 0 },
        nodeType: 'output',
      },
    ],
    edges: [
      { source: 'purpose', target: 'routes' },
      { source: 'routes', target: 'logic' },
      { source: 'logic', target: 'database' },
      { source: 'database', target: 'export' },
    ],
  },

  // ================================
  // 4. AUTOMATION WORKFLOW TEMPLATE
  // ================================
  {
    id: 'automation-template',
    title: 'Automation Workflow Template',
    summary: 'A template for creating an automated task or scheduled process.',
    nodes: [
      {
        id: 'task',
        label: 'What it should automate',
        notes: 'Describe the workflow: file renaming, reminders, backups, syncing, scraping, etc.',
        position: { x: 0, y: 0 },
        nodeType: 'descriptive',
      },
      {
        id: 'trigger',
        label: 'Trigger',
        notes: 'Explain when it runs: manually, on a timer, daily, or after an event.',
        position: { x: 260, y: 0 },
        nodeType: 'event',
      },
      {
        id: 'processing',
        label: 'Processing steps',
        notes: 'Describe each step of the automation in simple bullet points.',
        position: { x: 520, y: 0 },
        nodeType: 'logic',
      },
      {
        id: 'result',
        label: 'Result',
        notes: 'Explain what the automation produces or updates.',
        position: { x: 780, y: 0 },
        nodeType: 'output',
      },
      {
        id: 'export',
        label: 'Export workflow',
        notes: 'Generate a script, cron job, bot, or tool that performs the automation.',
        position: { x: 1040, y: 0 },
        nodeType: 'output',
      },
    ],
    edges: [
      { source: 'task', target: 'trigger' },
      { source: 'trigger', target: 'processing' },
      { source: 'processing', target: 'result' },
      { source: 'result', target: 'export' },
    ],
  },

  // ================================
  // 5. AI TOOL TEMPLATE
  // ================================
  {
    id: 'ai-template',
    title: 'AI Tool Template',
    summary: 'A simple template for generating an AI-powered feature or model workflow.',
    nodes: [
      {
        id: 'goal',
        label: 'What the AI should do',
        notes: 'Explain the AI task: summarizing, classifying, generating text, answering questions, etc.',
        position: { x: 0, y: 0 },
        nodeType: 'descriptive',
      },
      {
        id: 'input',
        label: 'Input type',
        notes: 'What the AI receives: text, images, numbers, instructions, or mixed content.',
        position: { x: 260, y: 0 },
        nodeType: 'data',
      },
      {
        id: 'prompting',
        label: 'AI behavior',
        notes: 'Describe the style, tone, output format, and rules the AI should follow.',
        position: { x: 520, y: 0 },
        nodeType: 'logic',
      },
      {
        id: 'output',
        label: 'Response format',
        notes: 'Decide how the output should look: bullets, summary, JSON, HTML, or natural text.',
        position: { x: 780, y: 0 },
        nodeType: 'output',
      },
      {
        id: 'export',
        label: 'Export tool',
        notes: 'Generate the AI-powered script, endpoint, or packaged module.',
        position: { x: 1040, y: 0 },
        nodeType: 'output',
      },
    ],
    edges: [
      { source: 'goal', target: 'input' },
      { source: 'input', target: 'prompting' },
      { source: 'prompting', target: 'output' },
      { source: 'output', target: 'export' },
    ],
  },
];

export const buildTemplatePlacement = (template, currentNodes) => {
  const now = Date.now();
  const maxX = currentNodes.reduce((max, node) => Math.max(max, node.position?.x ?? 0), -Infinity);
  const baseX = Number.isFinite(maxX) ? maxX + 320 : 0;
  const baseY = 40 + ((currentNodes.length * 22) % 240);
  const idMap = new Map();

  const placedNodes = template.nodes.map((node, index) => {
    const newId = `${template.id}-${now}-${index}`;
    idMap.set(node.id, newId);
    const position = node.position ?? { x: 0, y: index * 120 };
    const nodeType = normalizeNodeType(node.nodeType ?? node.type ?? DEFAULT_NODE_TYPE);
    return attachNodeType(
      {
        id: newId,
        type: nodeType,
        position: { x: baseX + position.x, y: baseY + position.y },
        data: {
          ...(node.data ?? {}),
          label: node.label ?? node.data?.label,
          notes: node.notes ?? node.data?.notes,
        },
        style: { ...DEFAULT_NODE_STYLE, ...(node.style ?? {}) },
      },
      nodeType,
    );
  });

  const placedEdges = (template.edges ?? []).map((edge, index) => ({
    id: `${template.id}-edge-${now}-${index}`,
    source: idMap.get(edge.source),
    target: idMap.get(edge.target),
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    data: edge.data ?? {},
  }));

  const firstNode = placedNodes[0];
  return { nodes: placedNodes, edges: placedEdges, firstNode };
};
