import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import binIcon from '../assets/bin.png';
import {
  BACKEND_URL,
  DEFAULT_NODE_STYLE,
  EXPANDED_BOTTOM_HEIGHT,
  HISTORY_LIMIT,
  MAX_BOTTOM_HEIGHT_RATIO,
  MAX_SIDEBAR_WIDTH,
  MIN_BOTTOM_HEIGHT,
  MIN_SIDEBAR_WIDTH,
  SYNC_ENDPOINT,
} from '../constants/appConstants.js';
import { exampleTemplates, buildTemplatePlacement } from '../data/exampleTemplates.js';
import { initialEdges, seededInitialNodes } from '../data/initialGraph.js';
import { nodeImplementations } from '../nodes/nodeImplementations.js';
import { ALL_NODE_TYPES, DEFAULT_NODE_TYPE, getNodeTypeDefinition, normalizeNodeType } from '../nodeTypes.js';
import VersionControlPanel from './VersionControlPanel.jsx';
import {
  attachNodeType,
  clamp,
  cloneGraphState,
  computePendingChanges,
  areGraphsEqual,
  getNodeTypeId,
  isEditableElement,
} from '../utils/graphUtils.js';
import AiCopilot from './AiCopilot.jsx';
import GeneratedFilesModal from './GeneratedFilesModal.jsx';
import NoteNode from './NoteNode.jsx';


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
  const clipboardRef = useRef(null);
  const cursorPositionRef = useRef({ x: 0, y: 0 });
  const hoveredNodeIdRef = useRef(null);
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

  const captureSelectionPayload = useCallback(
    (ids) => {
      const currentNodes = nodesRef.current ?? [];
      const currentEdges = edgesRef.current ?? [];
      const idSet = new Set(ids);
      const selectedNodes = currentNodes.filter((node) => idSet.has(node.id));
      if (!selectedNodes.length) return null;
      const selectedEdges = currentEdges.filter((edge) => idSet.has(edge.source) && idSet.has(edge.target));
      const center = computeCanvasCenter(selectedNodes);

      const entries = selectedNodes.map((node) => ({
        id: node.id,
        nodeType: getNodeTypeId(node),
        data: JSON.parse(JSON.stringify(node.data ?? {})),
        style: JSON.parse(JSON.stringify(node.style ?? {})),
        offset: {
          x: (node.position?.x ?? 0) - center.x,
          y: (node.position?.y ?? 0) - center.y,
        },
      }));

      const clonedEdges = selectedEdges.map((edge) => JSON.parse(JSON.stringify(edge)));
      return { entries, edges: clonedEdges, center };
    },
    [computeCanvasCenter],
  );

  const copyNodes = useCallback(() => {
    const ids =
      (selectedNodeIds && selectedNodeIds.length
        ? selectedNodeIds
        : hoveredNodeIdRef.current
          ? [hoveredNodeIdRef.current]
          : []) ?? [];
    if (!ids.length) return;
    const payload = captureSelectionPayload(ids);
    if (payload) {
      clipboardRef.current = payload;
    }
  }, [captureSelectionPayload, selectedNodeIds]);

  const pasteCopiedNode = useCallback(
    (targetPosition) => {
      const payload = clipboardRef.current;
      if (!payload || !payload.entries?.length) return;
      const currentNodes = nodesRef.current ?? [];
      const currentEdges = edgesRef.current ?? [];
      const position = targetPosition ?? cursorPositionRef.current ?? { x: 0, y: 0 };

      const existingNodeIds = new Set(currentNodes.map((node) => node.id));
      const ensureNodeId = (base) => {
        const safeBase = base && base.trim().length ? base : 'node-copy';
        let candidate = safeBase;
        let suffix = 1;
        while (existingNodeIds.has(candidate)) {
          candidate = `${safeBase}-${suffix}`;
          suffix += 1;
        }
        existingNodeIds.add(candidate);
        return candidate;
      };

      const entries = payload.entries ?? [];
      const newNodes = [];
      const idMap = new Map();

      entries.forEach((entry, index) => {
        const baseId = entry.id || entry.data?.label || `node-${index}`;
        const newId = ensureNodeId(`${baseId}-copy`);
        idMap.set(entry.id, newId);
        const nodeType = entry.nodeType ?? DEFAULT_NODE_TYPE;
        const newNode = attachNodeType(
          {
            id: newId,
            type: nodeType,
            position: {
              x: position.x + (entry.offset?.x ?? 0),
              y: position.y + (entry.offset?.y ?? 0),
            },
            data: { ...(entry.data ?? {}) },
            style: { ...DEFAULT_NODE_STYLE, ...(entry.style ?? {}) },
          },
          nodeType,
        );
        newNodes.push(newNode);
      });

      const existingEdgeIds = new Set(currentEdges.map((edge) => edge.id));
      const ensureEdgeId = (base) => {
        const safeBase = base && base.trim().length ? base : 'edge-copy';
        let candidate = safeBase;
        let suffix = 1;
        while (existingEdgeIds.has(candidate)) {
          candidate = `${safeBase}-${suffix}`;
          suffix += 1;
        }
        existingEdgeIds.add(candidate);
        return candidate;
      };

      const newEdges = (payload.edges ?? [])
        .map((edge, index) => {
          const newSource = idMap.get(edge.source);
          const newTarget = idMap.get(edge.target);
          if (!newSource || !newTarget) return null;
          const baseId = edge.id || `${newSource}-${newTarget}-${index}`;
          return {
            ...edge,
            id: ensureEdgeId(`${baseId}-copy`),
            source: newSource,
            target: newTarget,
          };
        })
        .filter(Boolean);

      setNodes((snapshot) => {
        const clearedSelection = snapshot.map((node) => ({ ...node, selected: false }));
        return [...clearedSelection, ...newNodes.map((node) => ({ ...node, selected: true }))];
      });
      setEdges((snapshot) => [...snapshot, ...newEdges]);

      const primaryId = newNodes[0]?.id ?? null;
      setSelectedNodeId(primaryId);
      setSelectedNodeIds(newNodes.map((node) => node.id));
      if (primaryId) {
        setInspectorLabel(newNodes[0]?.data?.label ?? '');
        setInspectorNotes(newNodes[0]?.data?.notes ?? '');
        setInspectorType(getNodeTypeId(newNodes[0]));
      }
    },
    [setEdges],
  );

  const duplicateSelectedNode = useCallback(() => {
    const ids =
      (selectedNodeIds && selectedNodeIds.length
        ? selectedNodeIds
        : hoveredNodeIdRef.current
          ? [hoveredNodeIdRef.current]
          : []) ?? [];
    if (!ids.length) return;
    const payload = captureSelectionPayload(ids);
    if (!payload) return;
    clipboardRef.current = payload;
    const targetCenter = {
      x: (payload.center?.x ?? 0) + 30,
      y: (payload.center?.y ?? 0) + 30,
    };
    pasteCopiedNode(targetCenter);
  }, [captureSelectionPayload, pasteCopiedNode, selectedNodeIds]);

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
        
        if (active === 'left') {
          const nextWidth = clamp(startWidth + delta, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
          setLeftSidebarWidth(nextWidth);
        } else {
          const nextWidth = clamp(startWidth - delta, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
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
      if (!event.key) return;
      const key = event.key.toLowerCase();
      if (isEditableElement(event.target)) return;

      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (key === 'd') {
        event.preventDefault();
        duplicateSelectedNode();
        return;
      }

      if (key === 'c') {
        event.preventDefault();
        copyNodes();
        return;
      }

      if (key === 'v') {
        event.preventDefault();
        pasteCopiedNode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copyNodes, duplicateSelectedNode, pasteCopiedNode, redo, undo]);

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

  const onNodeMouseEnter = useCallback((_, node) => {
    hoveredNodeIdRef.current = node?.id ?? null;
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    hoveredNodeIdRef.current = null;
  }, []);

  const onPaneMouseMove = useCallback(
    (event) => {
      if (!event) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      cursorPositionRef.current = position;
    },
    [screenToFlowPosition],
  );

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
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              onPaneMouseMove={onPaneMouseMove}
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

export default FlowCanvas;
