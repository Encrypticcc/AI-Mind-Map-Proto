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

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const DEFAULT_NODE_STYLE = { width: 220, minHeight: 80 };
const SYNC_ENDPOINT = '/api/generate-code'; // Switch to /api/generate-code when ready for real calls
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 520;
const MIN_BOTTOM_HEIGHT = 60;
const MAX_BOTTOM_HEIGHT_RATIO = 0.5;
const NODE_TYPE_OPTIONS = ['note', 'default', 'input', 'output', 'modifier'];

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
        <div className="modal-header">
          <h2>Generated files, Control + Left Click to download.</h2>
          <div className="modal-actions">
            {isSyncing ? <span className="tag">Syncing...</span> : null}
            {syncError ? <span className="tag danger">Error</span> : null}
            <button type="button" className="ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
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
  const nodeType = type || 'note';
  return (
    <div
      className={`note-node node-${nodeType}`}
      onContextMenu={(event) => {
        event.stopPropagation();
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="note-header">
        <div className="note-title">{data.label}</div>
      </div>
      {data.notes ? (
        <div className="note-body">
          <div className="note-notes">{data.notes}</div>
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const initialNodes = [
  {
    id: 'controls-template',
    type: 'note',
    position: { x: 0, y: 0 },
    data: {
      label: 'Getting started',
      notes: [
        '• Right-click on the canvas to create a node',
        '• Drag from the small circle to connect nodes',
        '• Scroll to zoom, drag canvas to pan',
        '• Click a node to edit or inspect it',
        '• Press Delete/Backspace to remove a node/connection'
      ].join('\n')
    },
    style: { ...DEFAULT_NODE_STYLE },
  },

  {
    id: 'hierarchy-guide',
    type: 'note',
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
      ].join('\n')
    },
    style: { ...DEFAULT_NODE_STYLE },
  },

  {
    id: 'version-control-guide',
    type: 'note',
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
      ].join('\n')
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

const exampleTemplates = [
  {
    id: 'python-calculator',
    title: 'Python CLI calculator',
    summary: 'Parse a text request, validate numbers, then emit a tiny Python script to run the math.',
    nodes: [
      { id: 'prompt', label: 'User prompt', notes: 'Sample: "calculate 8 * 4 - 2" with natural language intent.', position: { x: 0, y: 0 } },
      { id: 'parse-intent', label: 'Parse intent', notes: 'Extract operands and operator tokens. Default to addition if unclear.', position: { x: 260, y: 0 } },
      { id: 'validate', label: 'Validate numbers', notes: 'Confirm both operands are numeric and operator is in [+ - * /].', position: { x: 520, y: 0 } },
      { id: 'operation', label: 'Build operation', notes: 'Compose the expression string like "result = a * b".', position: { x: 780, y: 0 } },
      { id: 'script', label: 'Emit Python snippet', notes: 'Wrap expression into a CLI-ready script with argparse + print.', position: { x: 1040, y: 0 } },
    ],
    edges: [
      { source: 'prompt', target: 'parse-intent' },
      { source: 'parse-intent', target: 'validate' },
      { source: 'validate', target: 'operation' },
      { source: 'operation', target: 'script' },
    ],
  },
  {
    id: 'rest-json',
    title: 'REST fetch + filter',
    summary: 'Hit an API, parse JSON, and keep only the useful fields.',
    nodes: [
      { id: 'url', label: 'API endpoint', notes: 'Example: GET https://api.example.com/users?limit=20', position: { x: 0, y: 0 } },
      { id: 'headers', label: 'Headers/auth', notes: 'Add Authorization + User-Agent headers.', position: { x: 260, y: 0 } },
      { id: 'fetch', label: 'HTTP request', notes: 'Perform fetch with retries and timeout.', position: { x: 520, y: 0 } },
      { id: 'parse', label: 'Parse JSON', notes: 'Validate JSON body; surface schema errors early.', position: { x: 780, y: 0 } },
      { id: 'filter', label: 'Filter fields', notes: 'Map records to id, email, createdAt only.', position: { x: 1040, y: 0 } },
      { id: 'output', label: 'Return list', notes: 'Emit cleaned array for downstream nodes.', position: { x: 1300, y: 0 } },
    ],
    edges: [
      { source: 'url', target: 'headers' },
      { source: 'headers', target: 'fetch' },
      { source: 'fetch', target: 'parse' },
      { source: 'parse', target: 'filter' },
      { source: 'filter', target: 'output' },
    ],
  },
  {
    id: 'csv-cleaner',
    title: 'CSV cleaner to SQL',
    summary: 'Load a CSV, normalize rows, and prep a SQL INSERT batch.',
    nodes: [
      { id: 'csv-path', label: 'CSV source', notes: 'Path + delimiter; expect headers row.', position: { x: 0, y: 0 } },
      { id: 'schema', label: 'Infer schema', notes: 'Detect column types and required fields.', position: { x: 260, y: 0 } },
      { id: 'clean', label: 'Clean rows', notes: 'Trim strings, coerce dates, drop empty rows.', position: { x: 520, y: 0 } },
      { id: 'validate-rows', label: 'Validate rows', notes: 'Reject rows missing primary keys; log reasons.', position: { x: 780, y: 0 } },
      { id: 'sql', label: 'Build SQL', notes: 'Generate INSERT statements with placeholders.', position: { x: 1040, y: 0 } },
      { id: 'preview', label: 'Preview batch', notes: 'Show first 5 INSERTS for verification.', position: { x: 1300, y: 0 } },
    ],
    edges: [
      { source: 'csv-path', target: 'schema' },
      { source: 'schema', target: 'clean' },
      { source: 'clean', target: 'validate-rows' },
      { source: 'validate-rows', target: 'sql' },
      { source: 'sql', target: 'preview' },
    ],
  },
  {
    id: 'summarizer',
    title: 'LLM summarizer',
    summary: 'Chunk text, summarize each part, then stitch a final concise brief.',
    nodes: [
      { id: 'ingest', label: 'Ingest text', notes: 'Upload transcript or paste paragraphs.', position: { x: 0, y: 0 } },
      { id: 'chunk', label: 'Chunk content', notes: 'Split into ~800 token slices with overlap.', position: { x: 260, y: 0 } },
      { id: 'per-chunk', label: 'Summarize chunk', notes: 'LLM prompt with bullet output + key quotes.', position: { x: 520, y: 0 } },
      { id: 'merge', label: 'Merge summaries', notes: 'Combine bullets; dedupe repeating facts.', position: { x: 780, y: 0 } },
      { id: 'tone', label: 'Apply tone', notes: 'Rewrite into executive brief at 120 words.', position: { x: 1040, y: 0 } },
    ],
    edges: [
      { source: 'ingest', target: 'chunk' },
      { source: 'chunk', target: 'per-chunk' },
      { source: 'per-chunk', target: 'merge' },
      { source: 'merge', target: 'tone' },
    ],
  },
  {
    id: 'image-pipeline',
    title: 'Image resize + alt text',
    summary: 'Optimize an image, keep variants, and auto-write accessibility alt text.',
    nodes: [
      { id: 'upload', label: 'Upload image', notes: 'Accept PNG/JPG up to 5MB.', position: { x: 0, y: 0 } },
      { id: 'analyze', label: 'Analyze content', notes: 'Detect subject, colors, and any text.', position: { x: 260, y: 0 } },
      { id: 'resize', label: 'Generate sizes', notes: 'Create 512px thumb and 1080px hero with quality=80.', position: { x: 520, y: 0 } },
      { id: 'compress', label: 'Compress', notes: 'Strip metadata; ensure under 400KB when possible.', position: { x: 780, y: 0 } },
      { id: 'alt-text', label: 'Write alt text', notes: 'Use analysis to propose an accessible alt string.', position: { x: 1040, y: 0 } },
      { id: 'deliver', label: 'Return assets', notes: 'Return URLs plus alt text as JSON.', position: { x: 1300, y: 0 } },
    ],
    edges: [
      { source: 'upload', target: 'analyze' },
      { source: 'analyze', target: 'resize' },
      { source: 'resize', target: 'compress' },
      { source: 'compress', target: 'alt-text' },
      { source: 'alt-text', target: 'deliver' },
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
    return {
      id: newId,
      type: node.type ?? 'note',
      position: { x: baseX + position.x, y: baseY + position.y },
      data: { label: node.label, notes: node.notes },
      style: { ...DEFAULT_NODE_STYLE, ...(node.style ?? {}) },
    };
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



function FlowCanvas() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [lastSyncedNodes, setLastSyncedNodes] = useState(initialNodes);
  const [lastSyncedEdges, setLastSyncedEdges] = useState(initialEdges);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [stagedChangeIds, setStagedChangeIds] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [lastSyncedVersion, setLastSyncedVersion] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodes[0]?.id ?? null);
  const [inspectorLabel, setInspectorLabel] = useState(initialNodes[0]?.data.label ?? '');
  const [inspectorNotes, setInspectorNotes] = useState(initialNodes[0]?.data.notes ?? '');
  const [inspectorType, setInspectorType] = useState(initialNodes[0]?.type ?? 'note');
  const [collapsedNodes, setCollapsedNodes] = useState(() => new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(260);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(320);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(60);
  const seenChangeIdsRef = useRef(new Set());
  const dragStateRef = useRef({ active: null, startX: 0, startY: 0, startWidth: 0, startHeight: 0 });
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const nodeImplementationMap = useMemo(() => nodeImplementations, []);
  const getNodeImplementation = useCallback((nodeId) => nodeImplementationMap[nodeId], [nodeImplementationMap]);

  useEffect(() => {
    const computed = computePendingChanges(nodes, edges, lastSyncedNodes, lastSyncedEdges);
    setPendingChanges(computed);
  }, [nodes, edges, lastSyncedNodes, lastSyncedEdges]);

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

  useEffect(() => {
    if (selectedNode) {
      setInspectorLabel(selectedNode.data.label ?? '');
      setInspectorNotes(selectedNode.data.notes ?? '');
      setInspectorType(selectedNode.type ?? 'note');
    } else {
      setInspectorLabel('');
      setInspectorNotes('');
      setInspectorType('note');
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
  }, []);

  const onNodeDragStart = useCallback((_, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
    if (selectedNodes?.length) {
      setSelectedNodeId(selectedNodes[0].id);
    } else {
      setSelectedNodeId(null);
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

      setNodes((snapshot) => [
        ...snapshot,
        {
          id: newId,
          type: 'note',
          position,
          data: { label: 'Untitled Node', notes: 'Describe what this node should do.' },
          style: { ...DEFAULT_NODE_STYLE },
        },
      ]);
      setSelectedNodeId(newId);
      setInspectorLabel('New Node');
      setInspectorNotes('');
    },
    [screenToFlowPosition],
  );

  const handleSaveNode = useCallback(
    (event) => {
      event.preventDefault();
      if (!selectedNodeId) return;

      setNodes((snapshot) =>
        snapshot.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                type: inspectorType || 'note',
                data: {
                  ...node.data,
                  label: inspectorLabel,
                  notes: inspectorNotes,
                  // Mark modifier intent to help backend scoping
                  ...(inspectorType === 'modifier' ? { kind: 'modifier' } : { kind: undefined }),
                },
              }
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
            return [...current, change.previousNode];
          }
          if (change.changeType === 'modified' && change.previousNode) {
            return current.map((node) => (node.id === change.nodeId ? change.previousNode : node));
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

    setIsSyncing(true);
    setSyncError(null);

    try {
      const response = await fetch(`${BACKEND_URL}${SYNC_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes,
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
  }, [edges, nodes, pendingChanges, stagedChangeIds]);

  const handleLabelChange = (event) => setInspectorLabel(event.target.value);
  const handleNotesChange = (event) => setInspectorNotes(event.target.value);
  const handleTypeChange = (event) => setInspectorType(event.target.value);
  const nodeTypes = {
    note: NoteNode,
    default: NoteNode,
    input: NoteNode,
    output: NoteNode,
    modifier: NoteNode,
  };
  const getNodeLabel = useCallback((id) => nodesById.get(id)?.data?.label ?? id, [nodesById]);
  const versionLabel = lastSyncedVersion != null ? `v${lastSyncedVersion}` : 'Unsynced';
  const handleInsertExample = useCallback(
    (templateId) => {
      const template = exampleTemplates.find((item) => item.id === templateId);
      if (!template) return;

      setNodes((currentNodes) => {
        const placement = buildTemplatePlacement(template, currentNodes);
        setEdges((currentEdges) => [...currentEdges, ...placement.edges]);
        if (placement.firstNode) {
          setSelectedNodeId(placement.firstNode.id);
          setInspectorLabel(placement.firstNode.data.label ?? '');
          setInspectorNotes(placement.firstNode.data.notes ?? '');
        }
        return [...currentNodes, ...placement.nodes];
      });
    },
    [exampleTemplates, setEdges, setInspectorLabel, setInspectorNotes, setSelectedNodeId],
  );
  const startResize = useCallback(
    (side, event) => {
      event.preventDefault();
      if (side === 'bottom') {
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
            <div className="panel-header">AI Copilot</div>
            <div className="ai-card">
              <p>Ask for ideas, reword nodes, or auto-connect concepts.</p>
              <button className="primary full">Ask AI</button>
            </div>
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
                  Type
                  <select value={inspectorType} onChange={handleTypeChange}>
                    {NODE_TYPE_OPTIONS.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Notes
                  <textarea
                    rows="4"
                    placeholder="Add context..."
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
        <GeneratedFilesModal
          files={generatedFiles}
          onClose={() => setGeneratedFiles([])}
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
