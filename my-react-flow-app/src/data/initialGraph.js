import { DEFAULT_NODE_STYLE } from '../constants/appConstants.js';
import { attachNodeType } from '../utils/graphUtils.js';

export const initialNodes = [
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

export const initialEdges = [
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

export const seededInitialNodes = initialNodes.map((node) => attachNodeType(node));
