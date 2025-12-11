import { useState } from 'react';

export default function GeneratedFilesModal({ files, onClose, isSyncing, syncError }) {
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
