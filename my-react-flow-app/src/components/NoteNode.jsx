import { Handle, Position } from '@xyflow/react';
import { getNodeTypeDefinition, normalizeNodeType } from '../nodeTypes.js';

export default function NoteNode({ data, type }) {
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
}
