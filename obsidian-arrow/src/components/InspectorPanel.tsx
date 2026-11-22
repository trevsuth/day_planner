import { useEffect, useMemo, useState } from "react";
import type { AttachedFile, GraphNode, GraphRelationship, NodeContentType } from "../types/graph";
import {
  applyRelationshipPreset,
  relationshipPresets,
  parseListInput,
  swapRelationshipDirection,
  stringifyListInput,
  updateNodeContent,
  type NodeStylePatch,
} from "../lib/graphOps";
import {
  getBacklinks,
  getNodeActivity,
  getOutboundLinks,
  nodeTemplates,
  validateJsonObject,
} from "../lib/wiki";
import MarkdownEditor from "./MarkdownEditor";
import type { GraphDocument } from "../types/graph";

type InspectorPanelProps = {
  selectedNode?: GraphNode;
  selectedRelationship?: GraphRelationship;
  document: GraphDocument;
  nodes: GraphNode[];
  selectedNodeCount: number;
  onUpdateNode: (node: GraphNode) => void;
  onUpdateRelationship: (relationship: GraphRelationship) => void;
  onAddAttachment: (nodeId: string, file: File) => void;
  onDownloadAttachment: (attachment: AttachedFile) => void;
  onDeleteAttachment: (nodeId: string, attachment: AttachedFile) => void;
  onDuplicateSelection: () => void;
  onLayoutSelection: (mode: "grid" | "circle") => void;
  onUpdateSelectedNodeStyle: (patch: NodeStylePatch) => void;
  onSelectNode: (nodeId: string) => void;
};

const contentTypes: NodeContentType[] = ["article", "example", "dataset", "note"];

function parseProperties(value: string): Record<string, string | number | boolean> {
  if (!value.trim()) {
    return {};
  }

  const parsed = JSON.parse(value) as Record<string, string | number | boolean>;
  return parsed;
}

function parseSourceData(value: string): unknown {
  if (!value.trim()) {
    return undefined;
  }

  return JSON.parse(value);
}

type JsonObjectEditorProps = {
  value: unknown;
  onSave: (value: unknown) => void;
};

function JsonObjectEditor({ value, onSave }: JsonObjectEditorProps) {
  const initialValue = value === undefined ? "" : JSON.stringify(value, null, 2);
  const [text, setText] = useState(initialValue);
  const validation = useMemo(() => validateJsonObject(text), [text]);

  useEffect(() => {
    setText(initialValue);
  }, [initialValue]);

  function save() {
    if (!validation.ok) {
      return;
    }

    onSave(parseSourceData(validation.formatted));
  }

  return (
    <div className="json-editor">
      <textarea
        className={`json-textarea ${validation.ok ? "" : "invalid"}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
      />
      <div className="json-editor-footer">
        <span className={validation.ok ? "muted" : "validation-error"}>
          {validation.ok ? "Valid JSON object" : validation.message}
        </span>
        <button
          type="button"
          disabled={!validation.ok}
          onClick={() => {
            if (validation.ok) {
              setText(validation.formatted);
              onSave(parseSourceData(validation.formatted));
            }
          }}
        >
          Format
        </button>
      </div>
    </div>
  );
}

export default function InspectorPanel({
  selectedNode,
  selectedRelationship,
  document,
  nodes,
  selectedNodeCount,
  onUpdateNode,
  onUpdateRelationship,
  onAddAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onDuplicateSelection,
  onLayoutSelection,
  onUpdateSelectedNodeStyle,
  onSelectNode,
}: InspectorPanelProps) {
  if (selectedNode) {
    const backlinks = getBacklinks(document, selectedNode.id);
    const outboundLinks = getOutboundLinks(selectedNode, nodes);
    const activity = getNodeActivity(document, selectedNode);

    return (
      <aside className="inspector-panel">
        <h2>Node</h2>
        <label>
          Title
          <input
            value={selectedNode.title}
            onChange={(event) => onUpdateNode({ ...selectedNode, title: event.target.value })}
          />
        </label>
        <label>
          Content type
          <select
            value={selectedNode.content.type}
            onChange={(event) =>
              onUpdateNode(
                updateNodeContent(selectedNode, { type: event.target.value as NodeContentType }),
              )
            }
          >
            {contentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Labels
          <input
            value={stringifyListInput(selectedNode.labels)}
            onChange={(event) =>
              onUpdateNode({ ...selectedNode, labels: parseListInput(event.target.value) })
            }
          />
        </label>
        <label>
          Tags
          <input
            value={stringifyListInput(selectedNode.tags)}
            onChange={(event) =>
              onUpdateNode({ ...selectedNode, tags: parseListInput(event.target.value) })
            }
          />
        </label>
        <details open>
          <summary>Wiki article</summary>
          <div className="button-row">
            {contentTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  onUpdateNode(updateNodeContent(selectedNode, { type, markdown: nodeTemplates[type] }))
                }
              >
                {type}
              </button>
            ))}
          </div>
          <MarkdownEditor
            markdown={selectedNode.content.markdown}
            nodes={nodes}
            onChange={(markdown) => onUpdateNode(updateNodeContent(selectedNode, { markdown }))}
            onNavigateNode={onSelectNode}
          />
        </details>
        <details open>
          <summary>Links</summary>
          <div className="link-lists">
            <section>
              <h3>Outbound</h3>
              {outboundLinks.length === 0 ? (
                <p className="muted">No outbound node links.</p>
              ) : (
                <ul>
                  {outboundLinks.map((link, index) => (
                    <li key={`${link.targetTitle}:${index}`}>
                      {link.targetNode ? (
                        <button type="button" onClick={() => link.targetNode && onSelectNode(link.targetNode.id)}>
                          {link.label}
                        </button>
                      ) : (
                        <span className="missing-link">{link.targetTitle}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3>Backlinks</h3>
              {backlinks.length === 0 ? (
                <p className="muted">No backlinks.</p>
              ) : (
                <ul>
                  {backlinks.map((node) => (
                    <li key={node.id}>
                      <button type="button" onClick={() => onSelectNode(node.id)}>
                        {node.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </details>
        <details>
          <summary>Activity</summary>
          <ul className="activity-list">
            {activity.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
                <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>Structured JSON data</summary>
          <JsonObjectEditor
            value={selectedNode.content.sourceData}
            onSave={(sourceData) => onUpdateNode(updateNodeContent(selectedNode, { sourceData }))}
          />
        </details>
        <details>
          <summary>Attached files</summary>
          <label className="file-button inline">
            Add metadata
            <input
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }

                onAddAttachment(selectedNode.id, file);
                event.target.value = "";
              }}
            />
          </label>
          {selectedNode.attachments.length === 0 ? (
            <p className="muted">No file metadata attached.</p>
          ) : (
            <ul className="attachment-list">
              {selectedNode.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <div>
                    <strong>{attachment.name}</strong>
                    <span>{attachment.mimeType}</span>
                    <span>{attachment.sizeBytes.toLocaleString()} bytes</span>
                  </div>
                  <div className="attachment-actions">
                    <button type="button" onClick={() => onDownloadAttachment(attachment)}>
                      Download
                    </button>
                    <button type="button" onClick={() => onDeleteAttachment(selectedNode.id, attachment)}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </details>
      </aside>
    );
  }

  if (selectedNodeCount > 1) {
    return (
      <aside className="inspector-panel">
        <h2>Selection</h2>
        <p>{selectedNodeCount} nodes selected.</p>
        <div className="button-row">
          <button type="button" onClick={onDuplicateSelection}>
            Duplicate
          </button>
          <button type="button" onClick={() => onLayoutSelection("grid")}>
            Grid layout
          </button>
          <button type="button" onClick={() => onLayoutSelection("circle")}>
            Circle layout
          </button>
        </div>
        <details open>
          <summary>Group style</summary>
          <label>
            Fill
            <input
              type="color"
              onChange={(event) => onUpdateSelectedNodeStyle({ fill: event.target.value })}
            />
          </label>
          <label>
            Stroke
            <input
              type="color"
              onChange={(event) => onUpdateSelectedNodeStyle({ stroke: event.target.value })}
            />
          </label>
          <label>
            Text
            <input
              type="color"
              onChange={(event) => onUpdateSelectedNodeStyle({ textColor: event.target.value })}
            />
          </label>
          <label>
            Radius
            <input
              type="range"
              min="30"
              max="72"
              step="2"
              defaultValue="44"
              onChange={(event) => onUpdateSelectedNodeStyle({ radius: Number(event.target.value) })}
            />
          </label>
        </details>
      </aside>
    );
  }

  if (selectedRelationship) {
    return (
      <aside className="inspector-panel">
        <h2>Relationship</h2>
        <label>
          Preset
          <select
            value={relationshipPresets.some((preset) => preset.type === selectedRelationship.type) ? selectedRelationship.type : ""}
            onChange={(event) => onUpdateRelationship(applyRelationshipPreset(selectedRelationship, event.target.value))}
          >
            <option value="">Custom</option>
            {relationshipPresets.map((preset) => (
              <option key={preset.type} value={preset.type}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <input
            value={selectedRelationship.type}
            onChange={(event) =>
              onUpdateRelationship({ ...selectedRelationship, type: event.target.value })
            }
          />
        </label>
        <label>
          From node
          <select
            value={selectedRelationship.fromNodeId}
            onChange={(event) => {
              if (event.target.value !== selectedRelationship.toNodeId) {
                onUpdateRelationship({ ...selectedRelationship, fromNodeId: event.target.value });
              }
            }}
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          To node
          <select
            value={selectedRelationship.toNodeId}
            onChange={(event) => {
              if (event.target.value !== selectedRelationship.fromNodeId) {
                onUpdateRelationship({ ...selectedRelationship, toNodeId: event.target.value });
              }
            }}
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.title}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => onUpdateRelationship(swapRelationshipDirection(selectedRelationship))}>
          Swap direction
        </button>
        <label>
          Properties JSON
          <textarea
            className="json-textarea"
            defaultValue={JSON.stringify(selectedRelationship.properties, null, 2)}
            onBlur={(event) => {
              try {
                onUpdateRelationship({
                  ...selectedRelationship,
                  properties: parseProperties(event.target.value),
                });
              } catch {
                event.currentTarget.classList.add("invalid");
              }
            }}
            onFocus={(event) => event.currentTarget.classList.remove("invalid")}
          />
        </label>
        <label>
          Stroke
          <input
            type="color"
            value={selectedRelationship.style.stroke}
            onChange={(event) =>
              onUpdateRelationship({
                ...selectedRelationship,
                style: { ...selectedRelationship.style, stroke: event.target.value },
              })
            }
          />
        </label>
        <label>
          Width
          <input
            type="range"
            min="1"
            max="6"
            step="0.5"
            value={selectedRelationship.style.width}
            onChange={(event) =>
              onUpdateRelationship({
                ...selectedRelationship,
                style: { ...selectedRelationship.style, width: Number(event.target.value) },
              })
            }
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(selectedRelationship.style.dashed)}
            onChange={(event) =>
              onUpdateRelationship({
                ...selectedRelationship,
                style: { ...selectedRelationship.style, dashed: event.target.checked || undefined },
              })
            }
          />
          Dashed
        </label>
      </aside>
    );
  }

  return (
    <aside className="inspector-panel empty">
      <h2>Inspector</h2>
      <p>Select a node or relationship to edit its details.</p>
    </aside>
  );
}
