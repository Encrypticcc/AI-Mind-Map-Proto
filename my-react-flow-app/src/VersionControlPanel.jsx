const formatLastSync = (lastSyncedAt, lastSyncedVersion) => {
  if (!lastSyncedAt) return 'Last sync: Never';
  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(lastSyncedAt);
  const versionLabel = lastSyncedVersion ? `${lastSyncedVersion}` : 'Current';
  return `Last sync: ${versionLabel} - ${time}`;
};

const renderTitle = (change, getNodeLabel) => {
  if (change.kind === 'node') {
    const ref = change.currentNode ?? change.previousNode;
    const label = ref?.data?.label?.trim() || 'Untitled Node';
    return label;
  }

  const edgeRef = change.currentEdge ?? change.previousEdge;
  const sourceId = edgeRef?.source ?? '?';
  const targetId = edgeRef?.target ?? '?';
  const sourceLabel = getNodeLabel ? getNodeLabel(sourceId) : sourceId;
  const targetLabel = getNodeLabel ? getNodeLabel(targetId) : targetId;
  return `Connected ${sourceLabel} to ${targetLabel}`;
};

const renderIdText = (change) => {
  if (change.kind === 'node') return `ID: ${change.nodeId}`;
  return `ID: ${change.edgeId ?? change.currentEdge?.id ?? change.previousEdge?.id ?? 'unknown'}`;
};

export default function VersionControlPanel({
  pendingChanges,
  stagedChangeIds,
  onToggleStage,
  onRevertChange,
  onStageAll,
  onUnstageAll,
  onSync,
  lastSyncedAt,
  lastSyncedVersion,
  getNodeLabel,
}) {
  const lastSyncLabel = formatLastSync(lastSyncedAt, lastSyncedVersion);
  return (
    <div className="panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-header">Version Control</div>
          <div className="panel-subheader">Pending changes ({pendingChanges.length})</div>
        </div>
        {pendingChanges.length ? (
          <div className="vc-quick">
            <button className="ghost tiny" type="button" onClick={onStageAll}>
              Stage all
            </button>
            <button className="ghost tiny" type="button" onClick={onUnstageAll}>
              Unstage all
            </button>
          </div>
        ) : null}
      </div>

      <div className="vc-list">
        {pendingChanges.length === 0 ? (
          <div className="empty-state">Nothing to sync. Make some changes in the canvas.</div>
        ) : (
          pendingChanges.map((change) => {
            const isStaged = stagedChangeIds.includes(change.id);
            return (
              <div
                className={`vc-item${isStaged ? ' staged' : ' unstaged'}`}
                key={change.id}
                onClick={() => onToggleStage(change.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onToggleStage(change.id);
                  }
                }}
              >
                <div className="vc-body">
                  <div className="vc-text">
                    <div className="vc-title">{renderTitle(change, getNodeLabel)}</div>
                    <div className="vc-meta">
                      <span className="tag">{change.kind}</span>
                      <span className="tag">{change.changeType}</span>
                    </div>
                    <div className="vc-id">{renderIdText(change)}</div>
                  </div>
                </div>
                <button
                  className="ghost tiny"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRevertChange(change.id);
                  }}
                >
                  Revert
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="vc-footer">
        <button className="primary full" type="button" onClick={onSync} disabled={!stagedChangeIds.length}>
          Sync
        </button>
        <div className="vc-last-sync">{lastSyncLabel}</div>
      </div>
    </div>
  );
}
