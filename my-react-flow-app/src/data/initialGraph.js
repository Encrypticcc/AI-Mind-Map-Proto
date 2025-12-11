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
        'ƒ?› Right-click on the canvas to create a node',
        'ƒ?› Drag from the small circle to connect nodes',
        'ƒ?› Scroll to zoom, drag canvas to pan',
        'ƒ?› Click a node to edit or inspect it',
        'ƒ?› Press Delete/Backspace to remove a node/connection'
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
        'ƒ?› The Hierarchy lists all nodes in the current canvas',
        'ƒ?› Click a node in the Hierarchy to select and focus it on the canvas',
        'ƒ?› Selecting a node on the canvas also highlights it in the Hierarchy',
        'ƒ?› Use the + button to expand and show related/child nodes',
        'ƒ?› Use the ƒ?" button to collapse a group back to a single entry',
        'ƒ?› Use the search bar to quickly find a node by name'
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
        'ƒ?› Each edit appears in the Version Control panel',
        'ƒ?› Click a change to stage it ƒ?" only staged changes will sync',
        'ƒ?› Use ƒ?oStage allƒ?? to quickly stage everything',
        'ƒ?› Use ƒ?oRevertƒ?? to undo a specific change',
        'ƒ?› Press Sync to generate/update code from staged changes',
        'ƒ?› After syncing, changes are saved into a new version'
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
