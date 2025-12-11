import { useState } from 'react';
import './ProjectNameModal.css';

export default function ProjectNameModal({ onConfirm, onCancel }) {
  const [projectName, setProjectName] = useState('');

  const handleConfirm = () => {
    if (projectName.trim()) {
      onConfirm(projectName.trim());
      setProjectName('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <h2>Create New Project</h2>
        <p>Enter a name for your new project:</p>
        <input
          type="text"
          placeholder="Project name..."
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" onClick={handleConfirm} disabled={!projectName.trim()}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
