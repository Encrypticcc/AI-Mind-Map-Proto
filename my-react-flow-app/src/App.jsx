import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VersionControlPanel from './VersionControlPanel.jsx';
import { nodeImplementations } from './nodes/nodeImplementations.js';
import binIcon from './assets/bin.png';
import {
  ALL_NODE_TYPES,
  DEFAULT_NODE_TYPE,
  getNodeTypeDefinition,
  normalizeNodeType,
} from './nodeTypes.js';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const DEFAULT_NODE_STYLE = { width: 220, minHeight: 80 };
const SYNC_ENDPOINT = '/api/generate-code'; // Switch to /api/generate-code when ready for real calls or /api/generate-code-fake for testing
const ASK_AI_ENDPOINT = '/api/ask-ai';
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 520;
const MIN_BOTTOM_HEIGHT = 30;
const MAX_BOTTOM_HEIGHT_RATIO = 0.5;
const EXPANDED_BOTTOM_HEIGHT = 200;
const HISTORY_LIMIT = 50;

const isEditableElement = (element) => {
  if (!element) return false;
  const tagName = element.tagName;
  const editableTypes = ['INPUT', 'TEXTAREA'];
  const role = element.getAttribute ? element.getAttribute('role') : null;
  return Boolean(element.isContentEditable || editableTypes.includes(tagName) || role === 'textbox');
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const shallowEqualObjects = (a = {}, b = {}) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

const isNodeEqual = (a, b) => {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (!shallowEqualObjects(a.data ?? {}, b.data ?? {})) return false;
  return true;
};

const isEdgeEqual = (a, b) => {
  if (!a || !b) return false;
  if (a.source !== b.source) return false;
  if (a.target !== b.target) return false;
  if ((a.sourceHandle ?? null) !== (b.sourceHandle ?? null)) return false;
  if ((a.targetHandle ?? null) !== (b.targetHandle ?? null)) return false;
  if (!shallowEqualObjects(a.data ?? {}, b.data ?? {})) return false;
  return true;
};

const areNodeListsEqual = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  const mapB = new Map(b.map((node) => [node.id, node]));
  for (const node of a) {
    const other = mapB.get(node.id);
    if (!other) return false;
    const posA = node.position ?? {};
    const posB = other.position ?? {};
    if (posA.x !== posB.x || posA.y !== posB.y) return false;
    if (node.type !== other.type) return false;
    if (!shallowEqualObjects(node.style ?? {}, other.style ?? {})) return false;
    if (!shallowEqualObjects(node.data ?? {}, other.data ?? {})) return false;
  }
  return true;
};

const areEdgeListsEqual = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  const mapB = new Map(b.map((edge) => [edge.id, edge]));
  for (const edge of a) {
    const other = mapB.get(edge.id);
    if (!other) return false;
    if (!isEdgeEqual(edge, other)) return false;
    if ((edge.type ?? null) !== (other.type ?? null)) return false;
    if ((edge.label ?? null) !== (other.label ?? null)) return false;
    if ((edge.animated ?? false) !== (other.animated ?? false)) return false;
  }
  return true;
};

const areGraphsEqual = (prevNodes, prevEdges, nextNodes, nextEdges) =>
  areNodeListsEqual(prevNodes, nextNodes) && areEdgeListsEqual(prevEdges, nextEdges);

const cloneGraphState = (nodes, edges) => JSON.parse(JSON.stringify({ nodes, edges }));

const computePendingChanges = (nodes, edges, lastSyncedNodes, lastSyncedEdges) => {
  const changes = [];

  const syncedNodeMap = new Map(lastSyncedNodes.map((node) => [node.id, node]));
  const currentNodeMap = new Map(nodes.map((node) => [node.id, node]));

  nodes.forEach((node) => {
    const previousNode = syncedNodeMap.get(node.id);
    if (!previousNode) {
      changes.push({
        id: `node:${node.id}`,
        kind: 'node',
        changeType: 'added',
        nodeId: node.id,
        currentNode: node,
      });
    } else if (!isNodeEqual(node, previousNode)) {
      changes.push({
        id: `node:${node.id}`,
        kind: 'node',
        changeType: 'modified',
        nodeId: node.id,
        currentNode: node,
        previousNode,
      });
    }
  });

  lastSyncedNodes.forEach((previousNode) => {
    if (!currentNodeMap.has(previousNode.id)) {
      changes.push({
        id: `node:${previousNode.id}`,
        kind: 'node',
        changeType: 'removed',
        nodeId: previousNode.id,
        previousNode,
      });
    }
  });

  const syncedEdgeMap = new Map(lastSyncedEdges.map((edge) => [edge.id, edge]));
  const currentEdgeMap = new Map(edges.map((edge) => [edge.id, edge]));

  edges.forEach((edge) => {
    const previousEdge = syncedEdgeMap.get(edge.id);
    if (!previousEdge) {
      changes.push({
        id: `edge:${edge.id}`,
        kind: 'edge',
        changeType: 'added',
        edgeId: edge.id,
        currentEdge: edge,
      });
    } else if (!isEdgeEqual(edge, previousEdge)) {
      changes.push({
        id: `edge:${edge.id}`,
        kind: 'edge',
        changeType: 'modified',
        edgeId: edge.id,
        currentEdge: edge,
        previousEdge,
      });
    }
  });

  lastSyncedEdges.forEach((previousEdge) => {
    if (!currentEdgeMap.has(previousEdge.id)) {
      changes.push({
        id: `edge:${previousEdge.id}`,
        kind: 'edge',
        changeType: 'removed',
        edgeId: previousEdge.id,
        previousEdge,
      });
    }
  });

  return changes.sort((a, b) => {
    if (a.kind === b.kind) return a.id.localeCompare(b.id);
    return a.kind === 'node' ? -1 : 1;
  });
};

const getNodeTypeId = (node, fallback = DEFAULT_NODE_TYPE) =>
  normalizeNodeType(node?.data?.nodeType ?? node?.nodeType ?? node?.type ?? fallback);

const attachNodeType = (node, preferredType) => {
  const nodeType = preferredType ? normalizeNodeType(preferredType) : getNodeTypeId(node, DEFAULT_NODE_TYPE);
  return {
    ...node,
    type: nodeType,
    nodeType,
    data: {
      ...(node.data ?? {}),
      nodeType,
    },
  };
};

function GeneratedFilesModal({ files, onClose, isSyncing, syncError }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!files || !files.length) return null;

  const downloadFile = (file) => {
    if (!file) return;
    const blob = new Blob([file.contents ?? ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const parts = (file.path || 'file.txt').split(/[/\\]/);
    link.download = parts[parts.length - 1] || 'file.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const safeIndex = selectedIndex < files.length ? selectedIndex : 0;
  const selected = files[safeIndex] || files[0];

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-body">
          <div className="file-list">
            {files.map((file, index) => (
              <button
                key={file.path}
                type="button"
                className={`file-tab ${index === safeIndex ? 'active' : ''}`}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    downloadFile(file);
                    return;
                  }
                  setSelectedIndex(index);
                }}
              >
                {file.path}
              </button>
            ))}
          </div>
          <pre className="file-contents">{selected?.contents ?? ''}</pre>
        </div>
        {syncError ? <div className="modal-footer error">Sync error: {syncError}</div> : null}
      </div>
    </div>
  );
}

const NoteNode = ({ data, type }) => {
  const nodeType = normalizeNodeType(data?.nodeType ?? type);
  const definition = getNodeTypeDefinition(nodeType);
  const label = data?.label ?? 'Untitled Node';
  const notes = data?.notes;
  const hasNotes = typeof notes === 'string' && notes.trim().length > 0;

  return (
    <div
      className={`note-node node-${nodeType}`}
      style={{ '--node-accent': definition.accent }}
      onContextMenu={(event) => {
        event.stopPropagation();
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div
        className={`note-header note-type--${nodeType}`}
        data-node-type-label={definition.label}
        title={definition.label}
      >
        <div className="note-title">{label}</div>
      </div>
      {hasNotes ? (
        <div className="note-body">
          <div className="note-notes">{notes}</div>
        </div>
      ) : (
        <div className="note-body note-body--placeholder">
          <div className="note-notes">{definition.defaultNotesPlaceholder}</div>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const initialNodes = [
  {
    id: 'controls-template',
    type: 'descriptive',
    position: { x: 0, y: 0 },
    data: {
      label: 'Getting started',
      notes: [
        '• Right-click on the canvas to create a node',
        '• Drag from the small circle to connect nodes',
        '• Scroll to zoom, drag canvas to pan',
        '• Click a node to edit or inspect it',
        '• Press Delete/Backspace to remove a node/connection'
      ].join('\n'),
      nodeType: 'descriptive',
    },
    style: { ...DEFAULT_NODE_STYLE },
  },

  {
    id: 'hierarchy-guide',
    type: 'descriptive',
    position: { x: 350, y: 0 }, // between controls + version control
    data: {
      label: 'Using the Hierarchy',
      notes: [
        '• The Hierarchy lists all nodes in the current canvas',
        '• Click a node in the Hierarchy to select and focus it on the canvas',
        '• Selecting a node on the canvas also highlights it in the Hierarchy',
        '• Use the + button to expand and show related/child nodes',
        '• Use the – button to collapse a group back to a single entry',
        '• Use the search bar to quickly find a node by name'
      ].join('\n'),
      nodeType: 'descriptive',
    },
    style: { ...DEFAULT_NODE_STYLE },
  },

  {
    id: 'version-control-guide',
    type: 'descriptive',
    position: { x: 700, y: 0 },
    data: {
      label: 'Using Version Control',
      notes: [
        '• Each edit appears in the Version Control panel',
        '• Click a change to stage it — only staged changes will sync',
        '• Use “Stage all” to quickly stage everything',
        '• Use “Revert” to undo a specific change',
        '• Press Sync to generate/update code from staged changes',
        '• After syncing, changes are saved into a new version'
      ].join('\n'),
      nodeType: 'descriptive',
    },
    style: { ...DEFAULT_NODE_STYLE },
  },
];

const initialEdges = [
  {
    id: 'controls-to-hierarchy',
    source: 'controls-template',
    target: 'hierarchy-guide',
  },
  {
    id: 'hierarchy-to-vc',
    source: 'hierarchy-guide',
    target: 'version-control-guide',
  },
];

const seededInitialNodes = initialNodes.map((node) => attachNodeType(node));

const exampleTemplates = [
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

const buildTemplatePlacement = (template, currentNodes) => {
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

function AiCopilot({ selectedNodes, onApplySuggestions }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState(null);

  const handleOpen = () => {
    setIsOpen(true);
    setInput('');
    setAnswer(null);
    setError(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    const prompt = input.trim();
    if (!prompt) return;

    setIsLoading(true);
    setError(null);
    setAnswer(null);

    const selectedNodesPayload = (selectedNodes ?? [])
      .map((node) => {
        if (!node?.id) return null;
        const label = typeof node?.data?.label === 'string' ? node.data.label : '';
        const nodeType = getNodeTypeId(node);
        const isDescriptive = nodeType === 'descriptive';
        return {
          id: node.id,
          label: label.trim().length ? label : node.id,
          notes: node?.data?.notes ?? undefined,
          nodeType,
          type: nodeType,
          isDescriptive,
        };
      })
      .filter(Boolean);

    const body = { prompt };
    if (selectedNodesPayload.length) {
      body.selectedNodes = selectedNodesPayload;
    }

    try {
      const response = await fetch(`${BACKEND_URL}${ASK_AI_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let message = 'Request failed.';
        try {
          const errorData = await response.json();
          message = errorData?.error || message;
        } catch (_) {
          // ignore parse errors
        }
        throw new Error(message);
      }

      const data = await response.json();
      const payload = {
        reply: typeof data?.reply === 'string' ? data.reply : '',
        newNodes: Array.isArray(data?.newNodes) ? data.newNodes : [],
        updatedNodes: Array.isArray(data?.updatedNodes) ? data.updatedNodes : [],
        suggestedConnections: Array.isArray(data?.suggestedConnections)
          ? data.suggestedConnections
          : [],
      };

      setAnswer(payload.reply || 'Agent responded but did not include a reply.');
      if (onApplySuggestions) {
        onApplySuggestions(payload);
      }
    } catch (err) {
      console.error('Ask AI error', err);
      setError(err?.message || 'Something went wrong talking to the Agent. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ai-card">
      <p>Ask for ideas, reword nodes, or auto-connect concepts.</p>
      <button type="button" className="primary full" onClick={handleOpen}>
        Ask Agent
      </button>

      {isOpen ? (
        <div className="ai-dialog-backdrop">
          <div className="ai-dialog" role="dialog" aria-modal="true">
            <div className="ai-dialog-title">Ask Agent</div>
            <p className="ai-dialog-helper">
              Ask for ideas, reword nodes, or auto-connect concepts. The Agent will use the currently selected nodes as
              context.
            </p>
            <form className="ai-dialog-form" onSubmit={handleSubmit}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Describe what you'd like help with..."
                rows="4"
              ></textarea>

              <div className="ai-dialog-status">
                {isLoading ? <span className="ai-dialog-thinking">Thinking...</span> : null}
              </div>

              {error ? <div className="ai-dialog-error">{error}</div> : null}
              {answer ? <div className="ai-dialog-answer">{answer}</div> : null}

              <div className="ai-dialog-actions">
                <button type="button" className="ghost" onClick={handleClose} disabled={isLoading}>
                  Close
                </button>
                <button type="submit" className="primary" disabled={isLoading || !input.trim()}>
                  {isLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}



function FlowCanvas() {
  const firstNode = seededInitialNodes[0];
  const [nodes, setNodes] = useState(seededInitialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [lastSyncedNodes, setLastSyncedNodes] = useState(seededInitialNodes);
  const [lastSyncedEdges, setLastSyncedEdges] = useState(initialEdges);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [stagedChangeIds, setStagedChangeIds] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [lastSyncedVersion, setLastSyncedVersion] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(firstNode?.id ?? null);
  const [selectedNodeIds, setSelectedNodeIds] = useState(firstNode ? [firstNode.id] : []);
  const [inspectorLabel, setInspectorLabel] = useState(firstNode?.data.label ?? '');
  const [inspectorNotes, setInspectorNotes] = useState(firstNode?.data.notes ?? '');
  const [inspectorType, setInspectorType] = useState(getNodeTypeId(firstNode));
  const [collapsedNodes, setCollapsedNodes] = useState(() => new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(260);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(320);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(30);
  const [isBottomDragging, setIsBottomDragging] = useState(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const isDraggingRef = useRef(false);
  const dragStartSnapshotRef = useRef(null);
  const skipHistoryOnceRef = useRef(false);
  const historyRef = useRef([]);
  const futureRef = useRef([]);
  const isRestoringRef = useRef(false);
  const prevGraphRef = useRef(cloneGraphState(seededInitialNodes, initialEdges));
  const seenChangeIdsRef = useRef(new Set());
  const dragStateRef = useRef({ active: null, startX: 0, startY: 0, startWidth: 0, startHeight: 0 });
  const { screenToFlowPosition, setCenter, fitView } = useReactFlow();
  const nodeImplementationMap = useMemo(() => nodeImplementations, []);
  const getNodeImplementation = useCallback((nodeId) => nodeImplementationMap[nodeId], [nodeImplementationMap]);

  useEffect(() => {
    const computed = computePendingChanges(nodes, edges, lastSyncedNodes, lastSyncedEdges);
    setPendingChanges(computed);
  }, [nodes, edges, lastSyncedNodes, lastSyncedEdges]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    if (isRestoringRef.current) {
      prevGraphRef.current = cloneGraphState(nodes, edges);
      isRestoringRef.current = false;
      return;
    }

    if (skipHistoryOnceRef.current) {
      skipHistoryOnceRef.current = false;
      prevGraphRef.current = cloneGraphState(nodes, edges);
      return;
    }

    if (isDraggingRef.current) {
      return;
    }

    const previous = prevGraphRef.current;
    if (previous && !areGraphsEqual(previous.nodes, previous.edges, nodes, edges)) {
      historyRef.current = [...historyRef.current, previous].slice(-HISTORY_LIMIT);
      futureRef.current = [];
      prevGraphRef.current = cloneGraphState(nodes, edges);
    } else if (!previous) {
      prevGraphRef.current = cloneGraphState(nodes, edges);
    }
  }, [nodes, edges]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__nodeImplementations = nodeImplementationMap;
      window.__resolveNodeImplementation = getNodeImplementation;
    }
  }, [getNodeImplementation, nodeImplementationMap]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const nodesById = useMemo(() => {
    const map = new Map();
    nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodes]);
  const computeCanvasCenter = useCallback((nodeList) => {
    if (!nodeList.length) return { x: 0, y: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    nodeList.forEach((node) => {
      const x = node?.position?.x ?? 0;
      const y = node?.position?.y ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    return {
      x: (minX + maxX) / 2 || 0,
      y: (minY + maxY) / 2 || 0,
    };
  }, []);
  const selectedNodesForContext = useMemo(
    () => selectedNodeIds.map((id) => nodesById.get(id)).filter(Boolean),
    [nodesById, selectedNodeIds],
  );

  const childrenMap = useMemo(() => {
    const map = new Map();
    edges.forEach((edge) => {
      const list = map.get(edge.source) ?? [];
      list.push(edge.target);
      map.set(edge.source, list);
    });
    return map;
  }, [edges]);

  const roots = useMemo(() => {
    const targets = new Set(edges.map((edge) => edge.target));
    const rootNodes = nodes.filter((node) => !targets.has(node.id));
    return rootNodes.length ? rootNodes : nodes;
  }, [nodes, edges]);

  const applySnapshot = useCallback(
    (snapshot) => {
      if (!snapshot) return;
      const allowedIds = new Set(snapshot.nodes.map((node) => node.id));
      isRestoringRef.current = true;
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setSelectedNodeId((current) => (allowedIds.has(current) ? current : snapshot.nodes[0]?.id ?? null));
      setSelectedNodeIds((currentIds) => {
        const filtered = currentIds.filter((id) => allowedIds.has(id));
        if (filtered.length) return filtered;
        const fallback = snapshot.nodes[0]?.id;
        return fallback ? [fallback] : [];
      });
    },
    [setEdges, setNodes, setSelectedNodeId, setSelectedNodeIds],
  );

  const undo = useCallback(() => {
    if (!historyRef.current.length) return;
    const previous = historyRef.current.pop();
    futureRef.current.push(cloneGraphState(nodesRef.current, edgesRef.current));
    applySnapshot(previous);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const next = futureRef.current.pop();
    historyRef.current = [...historyRef.current, cloneGraphState(nodesRef.current, edgesRef.current)].slice(
      -HISTORY_LIMIT,
    );
    applySnapshot(next);
  }, [applySnapshot]);

  useEffect(() => {
    if (selectedNode) {
      setInspectorLabel(selectedNode.data.label ?? '');
      setInspectorNotes(selectedNode.data.notes ?? '');
      setInspectorType(getNodeTypeId(selectedNode));
    } else {
      setInspectorLabel('');
      setInspectorNotes('');
      setInspectorType(DEFAULT_NODE_TYPE);
    }
  }, [selectedNode]);

  useEffect(() => {
    const pendingIds = pendingChanges.map((change) => change.id);
    setStagedChangeIds((previous) => {
      const next = previous.filter((id) => pendingIds.includes(id));
      pendingIds.forEach((id) => {
        if (!seenChangeIdsRef.current.has(id) && !next.includes(id)) {
          next.push(id);
        }
      });
      return next;
    });
    seenChangeIdsRef.current = new Set(pendingIds);
  }, [pendingChanges]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      const { active, startX, startY, startWidth, startHeight } = dragStateRef.current;
      if (!active) return;
      if (active === 'left' || active === 'right') {
        const delta = event.clientX - startX;
        const nextWidth = clamp(startWidth + delta, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
        if (active === 'left') {
          setLeftSidebarWidth(nextWidth);
        } else {
          setRightSidebarWidth(nextWidth);
        }
        return;
      }
      if (active === 'bottom') {
        const deltaY = startY - event.clientY;
        const maxHeight = Math.max(MIN_BOTTOM_HEIGHT, window.innerHeight * MAX_BOTTOM_HEIGHT_RATIO);
        const nextHeight = clamp(startHeight + deltaY, MIN_BOTTOM_HEIGHT, maxHeight);
        setBottomPanelHeight(nextHeight);
      }
    };

    const handleMouseUp = () => {
      if (!dragStateRef.current.active) return;
      setIsBottomDragging(false);
      dragStateRef.current = { active: null, startX: 0, startY: 0, startWidth: 0, startHeight: 0 };
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!event.key || event.key.toLowerCase() !== 'z') return;
      if (isEditableElement(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  const onNodesChange = useCallback(
    (changes) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  );
  const onConnect = useCallback(
    (params) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    [],
  );

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
  }, []);

  const onNodeDragStart = useCallback(
    (_, node) => {
      setSelectedNodeId(node.id);
      setSelectedNodeIds([node.id]);
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        dragStartSnapshotRef.current = cloneGraphState(nodesRef.current, edgesRef.current);
      }
    },
    [edgesRef, nodesRef],
  );

  const onNodeDragStop = useCallback(() => {
    if (!isDraggingRef.current) return;
    const startSnapshot = dragStartSnapshotRef.current;
    const endSnapshot = cloneGraphState(nodesRef.current, edgesRef.current);
    isDraggingRef.current = false;
    dragStartSnapshotRef.current = null;

    if (!startSnapshot || areGraphsEqual(startSnapshot.nodes, startSnapshot.edges, endSnapshot.nodes, endSnapshot.edges)) {
      prevGraphRef.current = endSnapshot;
      skipHistoryOnceRef.current = true;
      return;
    }

    historyRef.current = [...historyRef.current, startSnapshot].slice(-HISTORY_LIMIT);
    futureRef.current = [];
    prevGraphRef.current = endSnapshot;
    skipHistoryOnceRef.current = true;
  }, []);

  const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
    if (selectedNodes?.length) {
      setSelectedNodeId(selectedNodes[0].id);
      setSelectedNodeIds(selectedNodes.map((node) => node.id));
    } else {
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    }
  }, []);

  const toggleCollapse = useCallback((nodeId) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleJumpToNode = useCallback(
    (nodeId) => {
      const node = nodesById.get(nodeId);
      if (!node) return;
      setSelectedNodeId(nodeId);
      setSelectedNodeIds([nodeId]);
      const width = node.width ?? node.style?.width ?? node.style?.minWidth ?? 0;
      const height = node.height ?? node.style?.height ?? node.style?.minHeight ?? 0;
      const centerX = node.position.x + width / 2;
      const centerY = node.position.y + height / 2;
      setCenter(centerX, centerY, { zoom: 1.2, duration: 400 });
    },
    [nodesById, setCenter],
  );

  const searchTermValue = searchTerm.trim().toLowerCase();
  const matchesSearch = useCallback(
    (node) => {
      if (!searchTermValue) return false;
      const label = (node?.data?.label ?? '').toLowerCase();
      const notes = (node?.data?.notes ?? '').toLowerCase();
      return label.includes(searchTermValue) || notes.includes(searchTermValue);
    },
    [searchTermValue],
  );

  const renderTree = useCallback(
    (nodeId, depth = 0) => {
      const node = nodesById.get(nodeId);
      if (!node) return null;

      const rawChildren = (childrenMap.get(nodeId) ?? []).filter((id) => nodesById.has(id));
      const renderedChildren = rawChildren
        .map((childId) => renderTree(childId, depth + 1))
        .filter(Boolean);

      const hasVisibleChildren = renderedChildren.length > 0;
      const isMatch = matchesSearch(node);

      if (searchTermValue && !isMatch && !hasVisibleChildren) {
        return null;
      }

      const forcedOpen = Boolean(searchTermValue) && (isMatch || hasVisibleChildren);
      const isCollapsed = forcedOpen ? false : collapsedNodes.has(nodeId);

      return (
        <div className="tree-item" key={node.id}>
          <div className="tree-row" style={{ paddingLeft: 8 + depth * 14 }}>
            {rawChildren.length ? (
              <button
                type="button"
                className="tree-toggle"
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                onClick={() => toggleCollapse(node.id)}
                disabled={forcedOpen}
              >
                {isCollapsed ? '+' : '-'}
              </button>
            ) : (
              <span className="tree-toggle placeholder" aria-hidden="true" />
            )}
            <button
              type="button"
              className={`tree-label${node.id === selectedNodeId ? ' active' : ''}${
                isMatch ? ' match' : ''
              }`}
              onClick={() => handleJumpToNode(node.id)}
            >
              {node.data?.label ?? node.id}
            </button>
          </div>
          {!isCollapsed && renderedChildren.length ? (
            <div className="tree-children">{renderedChildren}</div>
          ) : null}
        </div>
      );
    },
    [
      childrenMap,
      collapsedNodes,
      handleJumpToNode,
      matchesSearch,
      nodesById,
      searchTermValue,
      selectedNodeId,
      toggleCollapse,
    ],
  );

  const rootTreeItems = useMemo(() => roots.map((root) => renderTree(root.id)).filter(Boolean), [renderTree, roots]);

  const onPaneContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newId = `n${Date.now()}`;
      const nodeType = DEFAULT_NODE_TYPE;
      const newNode = attachNodeType(
        {
          id: newId,
          type: nodeType,
          position,
          data: { label: 'Untitled Node', notes: '' },
          style: { ...DEFAULT_NODE_STYLE },
        },
        nodeType,
      );

      setNodes((snapshot) => [...snapshot, newNode]);
      setSelectedNodeId(newId);
      setSelectedNodeIds([newId]);
      setInspectorLabel(newNode.data.label ?? '');
      setInspectorNotes(newNode.data.notes ?? '');
      setInspectorType(nodeType);
    },
    [screenToFlowPosition],
  );

  const handleSaveNode = useCallback(
    (event) => {
      event.preventDefault();
      if (!selectedNodeId) return;

      const nodeType = normalizeNodeType(inspectorType);
      setNodes((snapshot) =>
        snapshot.map((node) =>
          node.id === selectedNodeId
            ? attachNodeType(
                {
                  ...node,
                  type: nodeType,
                  data: {
                    ...node.data,
                    label: inspectorLabel,
                    notes: inspectorNotes,
                  },
                },
                nodeType,
              )
            : node,
        ),
      );
    },
    [inspectorLabel, inspectorNotes, inspectorType, selectedNodeId],
  );

  const handleToggleStage = useCallback((changeId) => {
    setStagedChangeIds((prev) => (prev.includes(changeId) ? prev.filter((id) => id !== changeId) : [...prev, changeId]));
  }, []);

  const handleStageAll = useCallback(() => {
    setStagedChangeIds(pendingChanges.map((change) => change.id));
  }, [pendingChanges]);

  const handleUnstageAll = useCallback(() => {
    setStagedChangeIds([]);
  }, []);

  const animateBottomPanelHeight = useCallback((height) => {
    setIsBottomDragging(false);
    setBottomPanelHeight(height);
  }, []);

  const handleRevertChange = useCallback(
    (changeId) => {
      const change = pendingChanges.find((item) => item.id === changeId);
      if (!change) return;

      if (change.kind === 'node') {
        setNodes((current) => {
          if (change.changeType === 'added') {
            return current.filter((node) => node.id !== change.nodeId);
          }
          if (change.changeType === 'removed' && change.previousNode) {
            if (current.find((node) => node.id === change.nodeId)) return current;
            return [...current, attachNodeType(change.previousNode)];
          }
          if (change.changeType === 'modified' && change.previousNode) {
            const restored = attachNodeType(change.previousNode);
            return current.map((node) => (node.id === change.nodeId ? restored : node));
          }
          return current;
        });
      } else {
        setEdges((current) => {
          if (change.changeType === 'added') {
            return current.filter((edge) => edge.id !== change.edgeId);
          }
          if (change.changeType === 'removed' && change.previousEdge) {
            if (current.find((edge) => edge.id === change.edgeId)) return current;
            return [...current, change.previousEdge];
          }
          if (change.changeType === 'modified' && change.previousEdge) {
            return current.map((edge) => (edge.id === change.edgeId ? change.previousEdge : edge));
          }
          return current;
        });
      }
      setStagedChangeIds((prev) => prev.filter((id) => id !== changeId));
      setPendingChanges((prev) => prev.filter((item) => item.id !== changeId));
    },
    [pendingChanges],
  );

  const handleSync = useCallback(async () => {
    if (!stagedChangeIds.length) return;

    const stagedSet = new Set(stagedChangeIds);
    const stagedChanges = pendingChanges.filter((change) => stagedSet.has(change.id));
    const nodesForSync = nodes.map((node) => {
      const nodeType = getNodeTypeId(node);
      const isDescriptive = nodeType === 'descriptive'; // Descriptive nodes feed context only; no direct code unless referenced.
      return {
        ...node,
        type: nodeType,
        nodeType,
        data: { ...(node.data ?? {}), nodeType },
        isDescriptive,
      };
    });

    setIsSyncing(true);
    setSyncError(null);

    try {
      const response = await fetch(`${BACKEND_URL}${SYNC_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: nodesForSync,
          edges,
          changes: stagedChanges,
          intent: 'sync',
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (Array.isArray(data.files)) {
        setGeneratedFiles(data.files);
      } else {
        setGeneratedFiles([]);
      }
      animateBottomPanelHeight(EXPANDED_BOTTOM_HEIGHT);

      const now = new Date();
      setLastSyncedAt(now);
      setLastSyncedVersion((prev) => {
        if (prev == null) return 1;
        if (typeof prev === 'number') return prev + 1;
        const parsed = Number(prev);
        return Number.isFinite(parsed) ? parsed + 1 : prev;
      });

      setLastSyncedNodes((previousSynced) => {
        const map = new Map(previousSynced.map((node) => [node.id, node]));
        stagedChanges.forEach((change) => {
          if (change.kind !== 'node') return;
          if (change.changeType === 'added' && change.currentNode) {
            map.set(change.nodeId, change.currentNode);
          } else if (change.changeType === 'removed') {
            map.delete(change.nodeId);
          } else if (change.changeType === 'modified' && change.currentNode) {
            map.set(change.nodeId, change.currentNode);
          }
        });
        return Array.from(map.values());
      });

      setLastSyncedEdges((previousSynced) => {
        const map = new Map(previousSynced.map((edge) => [edge.id, edge]));
        stagedChanges.forEach((change) => {
          if (change.kind !== 'edge') return;
          if (change.changeType === 'added' && change.currentEdge) {
            map.set(change.edgeId, change.currentEdge);
          } else if (change.changeType === 'removed') {
            map.delete(change.edgeId);
          } else if (change.changeType === 'modified' && change.currentEdge) {
            map.set(change.edgeId, change.currentEdge);
          }
        });
        return Array.from(map.values());
      });

      setStagedChangeIds([]);
    } catch (err) {
      console.error('Sync error', err);
      setSyncError(err.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [animateBottomPanelHeight, edges, nodes, pendingChanges, stagedChangeIds]);

  const handleLabelChange = (event) => setInspectorLabel(event.target.value);
  const handleNotesChange = (event) => setInspectorNotes(event.target.value);
  const handleTypeChange = (event) => setInspectorType(normalizeNodeType(event.target.value));
  const nodeTypes = useMemo(
    () => ({
      logic: NoteNode,
      descriptive: NoteNode,
      event: NoteNode,
      condition: NoteNode,
      data: NoteNode,
      output: NoteNode,
      // Legacy fallbacks so older graphs still render
      note: NoteNode,
      default: NoteNode,
      input: NoteNode,
      modifier: NoteNode,
    }),
    [],
  );
  const inspectorDefinition = useMemo(() => getNodeTypeDefinition(inspectorType), [inspectorType]);
  const getNodeLabel = useCallback((id) => nodesById.get(id)?.data?.label ?? id, [nodesById]);
  const versionLabel = lastSyncedVersion != null ? `v${lastSyncedVersion}` : 'Unsynced';

  const applyAiSuggestions = useCallback(
    (result) => {
      if (!result) return;
      const { newNodes = [], updatedNodes = [], suggestedConnections = [] } = result;
      const idMap = new Map();

      setNodes((currentNodes) => {
        const currentIds = new Set(currentNodes.map((node) => node.id));

        const updated = currentNodes.map((node) => {
          const next = updatedNodes.find((item) => item?.id === node.id);
          if (!next) return node;
          const label = typeof next.label === 'string' && next.label.trim().length ? next.label : node.data?.label;
          const notes = typeof next.notes === 'string' ? next.notes : node.data?.notes;
          const nodeType = normalizeNodeType(next.nodeType ?? next.type ?? node.data?.nodeType ?? node.type);
          return attachNodeType(
            {
              ...node,
              type: nodeType,
              data: {
                ...node.data,
                label: label ?? node.data?.label,
                notes: notes ?? node.data?.notes,
              },
            },
            nodeType,
          );
        });

        const center = computeCanvasCenter(updated);
        const randomOffset = () => (Math.random() - 0.5) * 240;
        const ensureId = (baseId) => {
          const safeBase = baseId && baseId.trim().length ? baseId.trim() : 'ai-node';
          let candidate = safeBase;
          let suffix = 1;
          while (currentIds.has(candidate)) {
            candidate = `${safeBase}-${suffix}`;
            suffix += 1;
          }
          currentIds.add(candidate);
          return candidate;
        };

        const additions = (Array.isArray(newNodes) ? newNodes : []).map((spec, index) => {
          const finalId = ensureId(spec?.id || `ai-node-${index}`);
          idMap.set(spec?.id || finalId, finalId);
          const label =
            typeof spec?.label === 'string' && spec.label.trim().length ? spec.label.trim() : finalId;
          const notes = typeof spec?.notes === 'string' ? spec.notes : undefined;
          const nodeType = normalizeNodeType(spec?.nodeType ?? spec?.type ?? DEFAULT_NODE_TYPE);
          currentIds.add(finalId);
          return attachNodeType(
            {
              id: finalId,
              type: nodeType,
              position: {
                x: center.x + randomOffset(),
                y: center.y + randomOffset(),
              },
              data: { label, notes },
              style: { ...DEFAULT_NODE_STYLE },
            },
            nodeType,
          );
        });

        return [...updated, ...additions];
      });

      setEdges((currentEdges) => {
        const existingIds = new Set(currentEdges.map((edge) => edge.id));
        const existingPairs = new Set(currentEdges.map((edge) => `${edge.source}->${edge.target}`));
        const additions = [];

        (Array.isArray(suggestedConnections) ? suggestedConnections : []).forEach((conn, index) => {
          const source = idMap.get(conn?.source) || conn?.source;
          const target = idMap.get(conn?.target) || conn?.target;
          if (!source || !target) return;
          const pairKey = `${source}->${target}`;
          if (existingPairs.has(pairKey)) return;
          let edgeId =
            (conn && typeof conn.id === 'string' && conn.id.trim().length && conn.id.trim()) ||
            `${source}-${target}`;
          let suffix = 1;
          while (existingIds.has(edgeId)) {
            edgeId = `${source}-${target}-${suffix}`;
            suffix += 1;
          }
          existingIds.add(edgeId);
          existingPairs.add(pairKey);
          additions.push({
            id: edgeId,
            source,
            target,
            animated: false,
          });
        });

        return [...currentEdges, ...additions];
      });

      setTimeout(() => {
        try {
          fitView({ padding: 0.2, duration: 600 });
        } catch (err) {
          const center = computeCanvasCenter(nodes);
          setCenter(center.x, center.y, { zoom: 1, duration: 400 });
        }
      }, 50);
    },
    [computeCanvasCenter, fitView, nodes, setCenter],
  );

  const handleInsertExample = useCallback(
    (templateId) => {
      const template = exampleTemplates.find((item) => item.id === templateId);
      if (!template) return;

      setNodes((currentNodes) => {
        const placement = buildTemplatePlacement(template, currentNodes);
        setEdges((currentEdges) => [...currentEdges, ...placement.edges]);
        if (placement.firstNode) {
          setSelectedNodeId(placement.firstNode.id);
          setSelectedNodeIds([placement.firstNode.id]);
          setInspectorLabel(placement.firstNode.data.label ?? '');
          setInspectorNotes(placement.firstNode.data.notes ?? '');
          setInspectorType(getNodeTypeId(placement.firstNode));
        }
        return [...currentNodes, ...placement.nodes];
      });
    },
    [exampleTemplates, setEdges, setInspectorLabel, setInspectorNotes, setSelectedNodeId, setSelectedNodeIds],
  );
  const startResize = useCallback(
    (side, event) => {
      event.preventDefault();
      if (side === 'bottom') {
        setIsBottomDragging(true);
        dragStateRef.current = {
          active: side,
          startX: event.clientX,
          startY: event.clientY,
          startWidth: 0,
          startHeight: bottomPanelHeight,
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'row-resize';
        return;
      }
      const initialWidth = side === 'left' ? leftSidebarWidth : rightSidebarWidth;
      dragStateRef.current = {
        active: side,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: initialWidth,
        startHeight: 0,
      };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [bottomPanelHeight, leftSidebarWidth, rightSidebarWidth],
  );

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">AI Node Generator</div>
        <div className="top-actions">
          <button className="ghost">New Project</button>
          <button className="primary" onClick={handleSync} disabled={!stagedChangeIds.length || isSyncing}>
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar left" style={{ width: leftSidebarWidth, minWidth: MIN_SIDEBAR_WIDTH }}>
          <div className="panel">
            <div className="panel-header">Projects</div>
            <ul className="list">
              <li className="list-item active">FPS Game</li>
              <li className="list-item">Vanguard App</li>
              <li className="list-item">Daily Planner</li>
            </ul>
          </div>
          <div className="panel">
            <div className="panel-header">Hierarchy</div>
            <div className="hierarchy-search">
              <input
                type="text"
                placeholder="Search nodes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="tree">
              {rootTreeItems.length ? rootTreeItems : <div className="empty-state">No nodes match your search.</div>}
            </div>
          </div>
          <div className="panel">
            <div className="panel-header">Versions</div>
            <ul className="list compact">
              <li className="list-item">{versionLabel}</li>
              <li className="list-item">v1.0</li>
              <li className="list-item">v0.9</li>
            </ul>
          </div>
          <div className="panel">
            <div className="panel-header">Agent</div>
            <AiCopilot selectedNodes={selectedNodesForContext} onApplySuggestions={applyAiSuggestions} />
          </div>
          <div className="panel">
            <div className="panel-header-row">
              <div>
                <div className="panel-header">Example Node Flows</div>
                <div className="panel-subheader">Insert ready-made multi-node chains.</div>
              </div>
            </div>
            <div className="example-list">
              {exampleTemplates.map((template) => (
                <div className="example-card" key={template.id}>
                  <div className="example-meta">
                    <div className="example-title">{template.title}</div>
                    <div className="example-summary">{template.summary}</div>
                  </div>
                  <div className="example-preview">
                    {template.nodes.length} nodes / {template.edges.length} links
                  </div>
                  <button className="primary full" onClick={() => handleInsertExample(template.id)}>
                    Insert flow
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div
          className="resize-handle"
          role="separator"
          aria-label="Resize left sidebar"
          aria-orientation="vertical"
          onMouseDown={(event) => startResize('left', event)}
        />

        <section className="canvas-area" style={{ flex: 1, minWidth: 0 }}>
          <div className="canvas-header">
            <div>
              <div className="eyebrow">Current canvas</div>
              <div className="title">FPS Game</div>
            </div>
            <div className="canvas-actions">
              <button className="ghost">Export</button>
            </div>
          </div>
          <div className="canvas-wrapper">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onSelectionChange={onSelectionChange}
            onPaneContextMenu={onPaneContextMenu}
            deleteKeyCode={['Delete', 'Backspace']}
            nodeTypes={nodeTypes}
            fitView
            >
              <Controls />
              <MiniMap />
              <Background variant="dots" gap={12} size={1} />
            </ReactFlow>
          </div>
        </section>

        <div
          className="resize-handle"
          role="separator"
          aria-label="Resize right sidebar"
          aria-orientation="vertical"
          onMouseDown={(event) => startResize('right', event)}
        />

        <aside className="sidebar right" style={{ width: rightSidebarWidth, minWidth: MIN_SIDEBAR_WIDTH }}>
          <VersionControlPanel
            pendingChanges={pendingChanges}
            stagedChangeIds={stagedChangeIds}
            onToggleStage={handleToggleStage}
            onRevertChange={handleRevertChange}
            onStageAll={handleStageAll}
            onUnstageAll={handleUnstageAll}
            onSync={handleSync}
            lastSyncedAt={lastSyncedAt}
            lastSyncedVersion={lastSyncedVersion != null ? `v${lastSyncedVersion}` : null}
            getNodeLabel={getNodeLabel}
          />
          {syncError ? <div className="panel error">Sync error: {syncError}</div> : null}
          <div className="panel">
            <div className="panel-header">Node Inspector</div>
            {selectedNode ? (
              <form className="inspector" onSubmit={handleSaveNode}>
                <label>
                  Label
                  <input type="text" value={inspectorLabel} onChange={handleLabelChange} />
                </label>
                <label>
                  Node type
                  <select value={inspectorType} onChange={handleTypeChange}>
                    {ALL_NODE_TYPES.map((option) => (
                      <option value={option.id} key={option.id} title={option.description}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Notes
                  <textarea
                    rows="4"
                    placeholder={inspectorDefinition?.defaultNotesPlaceholder ?? 'Add context...'}
                    value={inspectorNotes}
                    onChange={handleNotesChange}
                  ></textarea>
                </label>
                <button type="submit" className="ghost full">
                  Save Node
                </button>
              </form>
            ) : (
              <div className="inspector">
                <p style={{ margin: 0, color: 'var(--muted)' }}>Click a node to inspect its details.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <div
        className="bottom-panel"
        style={{
          height: bottomPanelHeight,
          minHeight: MIN_BOTTOM_HEIGHT,
          maxHeight: `${MAX_BOTTOM_HEIGHT_RATIO * 100}vh`,
          transition: isBottomDragging ? 'none' : 'height 0.5s ease',
        }}
      >
        <div
          className="resize-handle vertical"
          role="separator"
          aria-label="Resize bottom panel"
          aria-orientation="horizontal"
          onMouseDown={(event) => startResize('bottom', event)}
        />
        <footer className="status-bar">
          <div>Status: {isSyncing ? 'Syncing...' : 'Connected'}</div>
          <div>Nodes: {nodes.length} | Connections: {edges.length}</div>
          <div>Draft autosaved 2m ago</div>
          <div>© 2025 Encryptic. Proprietary technology. Not for redistribution.</div>
        </footer>
        <div className="bottom-panel-header">
          <div className="bottom-panel-title">Generated Output — Ctrl + Click to download on a file to download.</div>
          {generatedFiles?.length ? (
            <button
              type="button"
              className="icon-button bottom-panel-close"
              onClick={() => {
                setGeneratedFiles([]);
                animateBottomPanelHeight(MIN_BOTTOM_HEIGHT);
              }}
              aria-label="Close"
            >
              <img src={binIcon} alt="Close" />
            </button>
          ) : null}
        </div>
        <GeneratedFilesModal
          files={generatedFiles}
          onClose={() => {
            setGeneratedFiles([]);
            animateBottomPanelHeight(MIN_BOTTOM_HEIGHT);
          }}
          isSyncing={isSyncing}
          syncError={syncError}
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
