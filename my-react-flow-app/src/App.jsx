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

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const DEFAULT_NODE_STYLE = { width: 220, minHeight: 80 };
const SYNC_ENDPOINT = '/api/generate-code-fake'; // Switch to /api/generate-code when ready for real calls

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

  const safeIndex = selectedIndex < files.length ? selectedIndex : 0;
  const selected = files[safeIndex] || files[0];

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2>Generated files</h2>
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
                onClick={() => setSelectedIndex(index)}
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

const NoteNode = ({ data }) => {
  return (
    <div
      className="note-node"
      onContextMenu={(event) => {
        event.stopPropagation();
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="note-title">{data.label}</div>
      {data.notes ? <div className="note-notes">{data.notes}</div> : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const initialNodes = [
  {
    id: 'n1',
    type: 'note',
    position: { x: 0, y: 0 },
    data: { label: 'Node 1', notes: 'Key milestone' },
    style: { ...DEFAULT_NODE_STYLE },
  },
  {
    id: 'n2',
    type: 'note',
    position: { x: 180, y: 140 },
    data: { label: 'Node 2', notes: 'Follow-up task' },
    style: { ...DEFAULT_NODE_STYLE },
  },
  {
    id: 'n3',
    type: 'note',
    position: { x: -180, y: 140 },
    data: { label: 'Node 3', notes: 'Follow-up task' },
    style: { ...DEFAULT_NODE_STYLE },
  },
];
const initialEdges = [{ id: 'n1-n2', source: 'n1', target: 'n2' }];

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
  const [collapsedNodes, setCollapsedNodes] = useState(() => new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const seenChangeIdsRef = useRef(new Set());
  const { screenToFlowPosition, setCenter } = useReactFlow();

  useEffect(() => {
    const computed = computePendingChanges(nodes, edges, lastSyncedNodes, lastSyncedEdges);
    setPendingChanges(computed);
  }, [nodes, edges, lastSyncedNodes, lastSyncedEdges]);

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
    } else {
      setInspectorLabel('');
      setInspectorNotes('');
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
                data: {
                  ...node.data,
                  label: inspectorLabel,
                  notes: inspectorNotes,
                },
              }
            : node,
        ),
      );
    },
    [inspectorLabel, inspectorNotes, selectedNodeId],
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
  const nodeTypes = { note: NoteNode };
  const getNodeLabel = useCallback((id) => nodesById.get(id)?.data?.label ?? id, [nodesById]);
  const versionLabel = lastSyncedVersion != null ? `v${lastSyncedVersion}` : 'Unsynced';

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
        <aside className="sidebar left">
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
        </aside>

        <section className="canvas-area">
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

        <aside className="sidebar right">
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

      <footer className="status-bar">
        <div>Status: {isSyncing ? 'Syncing...' : 'Connected'}</div>
        <div>Nodes: {nodes.length} | Connections: {edges.length}</div>
        <div>Draft autosaved 2m ago</div>
      </footer>
      <GeneratedFilesModal
        files={generatedFiles}
        onClose={() => setGeneratedFiles([])}
        isSyncing={isSyncing}
        syncError={syncError}
      />
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
