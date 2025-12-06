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
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useState } from 'react';

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
    style: { width: 120, height: 80 },
  },
  {
    id: 'n2',
    type: 'note',
    position: { x: 180, y: 140 },
    data: { label: 'Node 2', notes: 'Follow-up task' },
    style: { width: 120, height: 80 },
  },
    {
    id: 'n3',
    type: 'note',
    position: { x: -180, y: 140 },
    data: { label: 'Node 3', notes: 'Follow-up task' },
    style: { width: 120, height: 80 },
  },
];
const initialEdges = [{ id: 'n1-n2', source: 'n1', target: 'n2' }];

function FlowCanvas() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodes[0]?.id ?? null);
  const [inspectorLabel, setInspectorLabel] = useState(initialNodes[0]?.data.label ?? '');
  const [inspectorNotes, setInspectorNotes] = useState(initialNodes[0]?.data.notes ?? '');
  const { screenToFlowPosition } = useReactFlow();

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  useEffect(() => {
    if (selectedNode) {
      setInspectorLabel(selectedNode.data.label ?? '');
      setInspectorNotes(selectedNode.data.notes ?? '');
    } else {
      setInspectorLabel('');
      setInspectorNotes('');
    }
  }, [selectedNode]);

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
          data: { label: 'New Node', notes: '' },
          style: { width: 120, height: 80 },
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

  const handleLabelChange = (event) => setInspectorLabel(event.target.value);
  const handleNotesChange = (event) => setInspectorNotes(event.target.value);
  const nodeTypes = { note: NoteNode };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">AI Node Generator</div>
        <div className="top-actions">
          <button className="ghost">New Project</button>
          <button className="primary">Sync</button>
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
            <div className="panel-header">Outline</div>
            <ul className="list">
              <li className="list-item">North Star</li>
              <li className="list-item">Opportunities</li>
              <li className="list-item">Risks</li>
            </ul>
          </div>
          <div className="panel">
            <div className="panel-header">Versions</div>
            <ul className="list compact">
              <li className="list-item">v1.2 Today</li>
              <li className="list-item">v1.1 Yesterday</li>
              <li className="list-item">v1.0 Tuesday</li>
            </ul>
          </div>
        </aside>

        <section className="canvas-area">
          <div className="canvas-header">
            <div>
              <div className="eyebrow">Current canvas</div>
              <div className="title">Journey Map</div>
            </div>
            <div className="canvas-actions">
              <button className="ghost">Fit View</button>
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
          <div className="panel">
            <div className="panel-header">AI Copilot</div>
            <div className="ai-card">
              <p>Ask for ideas, reword nodes, or auto-connect concepts.</p>
              <button className="primary full">Ask AI</button>
            </div>
          </div>
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
        <div>Status: Connected</div>
        <div>Nodes: {nodes.length} · Edges: {edges.length}</div>
        <div>Draft autosaved 2m ago</div>
      </footer>
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
