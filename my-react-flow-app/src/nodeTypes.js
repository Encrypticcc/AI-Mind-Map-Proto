/**
 * Canonical node type definitions for the editor.
 */

/**
 * @typedef {'logic' | 'descriptive' | 'event' | 'condition' | 'data' | 'output'} NodeTypeId
 */

export const DEFAULT_NODE_TYPE = 'logic';

/**
 * @type {Record<NodeTypeId, { id: NodeTypeId; label: string; description: string; defaultNotesPlaceholder: string; accent: string; iconName?: string; }>}
 */
export const NODE_TYPE_DEFINITIONS = {
  logic: {
    id: 'logic',
    label: 'Logic',
    description:
      'Holds executable logic: conditions, functions, sequences, API calls, game logic, etc. 90% of user nodes should be this type.',
    defaultNotesPlaceholder:
      'Describe the logic this node should implement, e.g. "When player presses E, open the door and play a sound."',
    accent: '#4be6a5',
  },
  descriptive: {
    id: 'descriptive',
    label: 'Descriptive',
    description:
      'Non-code metadata: explanations, design notes, requirements, TODOs, and documentation. Does not generate code unless explicitly referenced.',
    defaultNotesPlaceholder: 'Use this for notes about what you want, not code logic.',
    accent: '#5fb4ff',
  },
  event: {
    id: 'event',
    label: 'Event',
    description: 'Represents triggers the system should hook into. The AI converts these into event listeners or callbacks.',
    defaultNotesPlaceholder: 'Example: "On player join", "On key press", "On HTTP request", etc.',
    accent: '#ffb347',
  },
  condition: {
    id: 'condition',
    label: 'Condition',
    description:
      'Holds conditions that branch program flow. The AI generates if/else, switch statements, guards, etc.',
    defaultNotesPlaceholder: 'Example: "If player health < 50", "If request is valid", "Is object in range?"',
    accent: '#ff6b6b',
  },
  data: {
    id: 'data',
    label: 'Data',
    description:
      'Defines data structures or variables the system relies on. The AI outputs type definitions or variable declarations.',
    defaultNotesPlaceholder: 'Example: "PlayerData { health, stamina, inventory }", config objects, positions, etc.',
    accent: '#22d3ee',
  },
  output: {
    id: 'output',
    label: 'Output',
    description: 'Defines what the system returns or outputs. Used to know how to end chains.',
    defaultNotesPlaceholder:
      'Example: "Return JSON response", "Display error message", "Render element", "Return damage value".',
    accent: '#c084fc',
  },
};

/** @type {NodeTypeId[]} */
export const ALL_NODE_TYPE_IDS = ['logic', 'descriptive', 'event', 'condition', 'data', 'output'];
export const ALL_NODE_TYPES = ALL_NODE_TYPE_IDS.map((id) => NODE_TYPE_DEFINITIONS[id]);

const LEGACY_TYPE_MAP = {
  note: 'logic',
  default: 'logic',
  input: 'data',
  output: 'output',
  modifier: 'logic',
};

/**
 * Ensures we always return one of the supported node type ids.
 * Unknown or legacy values are mapped to logic by default.
 * @param {unknown} raw
 * @returns {NodeTypeId}
 */
export function normalizeNodeType(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value && NODE_TYPE_DEFINITIONS[value]) {
    return /** @type {NodeTypeId} */ (value);
  }
  if (value && LEGACY_TYPE_MAP[value]) {
    return LEGACY_TYPE_MAP[value];
  }
  return DEFAULT_NODE_TYPE;
}

/**
 * @param {unknown} raw
 * @returns {{ id: NodeTypeId; label: string; description: string; defaultNotesPlaceholder: string; accent: string; iconName?: string }}
 */
export function getNodeTypeDefinition(raw) {
  const nodeType = normalizeNodeType(raw);
  return NODE_TYPE_DEFINITIONS[nodeType];
}
