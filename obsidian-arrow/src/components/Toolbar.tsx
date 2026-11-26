import { ChevronDown, GitBranch, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useRef } from "react";

type ToolbarProps = {
  documentTitle: string;
  saveStatus: "saved" | "saving" | "error";
  lastSavedAt?: string;
  saveError?: string;
  pendingRelationship: boolean;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTitleChange: (title: string) => void;
  onAddNode: () => void;
  onStartRelationship: () => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onBackup: () => void;
  onBrowserBackup?: () => void;
  onRetrySave?: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
};

export default function Toolbar({
  documentTitle,
  saveStatus,
  lastSavedAt,
  saveError,
  pendingRelationship,
  canDelete,
  canUndo,
  canRedo,
  onTitleChange,
  onAddNode,
  onStartRelationship,
  onDeleteSelected,
  onUndo,
  onRedo,
  onExport,
  onBackup,
  onBrowserBackup,
  onRetrySave,
  onImport,
  onReset,
}: ToolbarProps) {
  const documentActions = useRef<HTMLDetailsElement>(null);

  function closeDocumentActions() {
    const menu = documentActions.current;
    if (!menu) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  }

  const savedLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "error"
        ? "Save failed"
        : lastSavedAt
          ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
          : "Saved";

  return (
    <>
      <header className="toolbar">
        <div className="graph-heading">
          <p className="eyebrow"><GitBranch size={16} aria-hidden="true" /> Graph</p>
          <h1>{documentTitle.trim() || "Untitled graph"}</h1>
        </div>
        <div className="graph-actions">
          <div className="toolbar-group primary-actions" role="group" aria-label="Graph editing">
            <button type="button" className="primary-button" onClick={onAddNode}>
              <Plus size={16} aria-hidden="true" /> Add node
            </button>
            <button type="button" aria-pressed={pendingRelationship} className={pendingRelationship ? "active" : ""} onClick={onStartRelationship}>
              <GitBranch size={16} aria-hidden="true" /> Relationship
            </button>
            <button type="button" className="icon-button" aria-label="Delete selected" title="Delete selected" disabled={!canDelete} onClick={onDeleteSelected}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="toolbar-group" role="group" aria-label="History">
            <button type="button" className="icon-button" aria-label="Undo" title="Undo" onClick={onUndo} disabled={!canUndo}>
              <Undo2 size={16} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" aria-label="Redo" title="Redo" onClick={onRedo} disabled={!canRedo}>
              <Redo2 size={16} aria-hidden="true" />
            </button>
          </div>
          <details ref={documentActions} className="document-actions" onKeyDown={(event) => {
            if (event.key === "Escape" && event.currentTarget.open) {
              event.stopPropagation();
              closeDocumentActions();
            }
          }}>
            <summary>Document <ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="document-actions-panel">
              <label className="document-title-field">
                Graph title
                <input
                  className="document-title"
                  value={documentTitle}
                  onChange={(event) => onTitleChange(event.target.value)}
                />
              </label>
              <button type="button" onClick={() => {
                closeDocumentActions();
                onReset();
              }}>New document</button>
              <label className="file-button">
                Import JSON
                <input
                  type="file"
                  accept="application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onImport(file);
                      event.target.value = "";
                      closeDocumentActions();
                    }
                  }}
                />
              </label>
              <button type="button" onClick={onBackup}>Export backup</button>
              <button type="button" onClick={onExport}>Export JSON</button>
              <a className="file-button" href={`${import.meta.env.BASE_URL}user-guide.graph.json`} download onClick={closeDocumentActions}>
                Download user guide
              </a>
              {onBrowserBackup && <button type="button" onClick={onBrowserBackup}>Export old browser graph</button>}
            </div>
          </details>
        </div>
      </header>
      <div className={`save-status ${saveStatus}`} role="status" title={saveError}>
        <span className="status-dot" aria-hidden="true" />{savedLabel}
      </div>
      {saveError && onRetrySave && (
        <span className="save-feedback" role="alert">
          {saveError} <button type="button" onClick={onRetrySave}>Retry save</button>
        </span>
      )}
    </>
  );
}
