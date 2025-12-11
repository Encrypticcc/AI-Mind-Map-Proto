import { DEFAULT_NODE_TYPE, normalizeNodeType } from '../nodeTypes.js';

export const isEditableElement = (element) => {
  if (!element) return false;
  const tagName = element.tagName;
  const editableTypes = ['INPUT', 'TEXTAREA'];
  const role = element.getAttribute ? element.getAttribute('role') : null;
  return Boolean(element.isContentEditable || editableTypes.includes(tagName) || role === 'textbox');
};

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const shallowEqualObjects = (a = {}, b = {}) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

export const isNodeEqual = (a, b) => {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (!shallowEqualObjects(a.data ?? {}, b.data ?? {})) return false;
  return true;
};

export const isEdgeEqual = (a, b) => {
  if (!a || !b) return false;
  if (a.source !== b.source) return false;
  if (a.target !== b.target) return false;
  if ((a.sourceHandle ?? null) !== (b.sourceHandle ?? null)) return false;
  if ((a.targetHandle ?? null) !== (b.targetHandle ?? null)) return false;
  if (!shallowEqualObjects(a.data ?? {}, b.data ?? {})) return false;
  return true;
};

export const areNodeListsEqual = (a = [], b = []) => {
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

export const areEdgeListsEqual = (a = [], b = []) => {
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

export const areGraphsEqual = (prevNodes, prevEdges, nextNodes, nextEdges) =>
  areNodeListsEqual(prevNodes, nextNodes) && areEdgeListsEqual(prevEdges, nextEdges);

export const cloneGraphState = (nodes, edges) => JSON.parse(JSON.stringify({ nodes, edges }));

export const computePendingChanges = (nodes, edges, lastSyncedNodes, lastSyncedEdges) => {
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

export const getNodeTypeId = (node, fallback = DEFAULT_NODE_TYPE) =>
  normalizeNodeType(node?.data?.nodeType ?? node?.nodeType ?? node?.type ?? fallback);

export const attachNodeType = (node, preferredType) => {
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
