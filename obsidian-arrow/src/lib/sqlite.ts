import type { AttachedFile, GraphDocument, GraphNode, GraphRelationship } from "../types/graph";
import { migrateDocument } from "./storage";

export const SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  content_type TEXT NOT NULL,
  markdown TEXT NOT NULL,
  source_data_json TEXT,
  content_updated_at TEXT NOT NULL,
  radius REAL NOT NULL,
  fill TEXT NOT NULL,
  stroke TEXT NOT NULL,
  text_color TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_document_id ON nodes(document_id);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  from_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  stroke TEXT NOT NULL,
  width REAL NOT NULL,
  dashed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_relationships_document_id ON relationships(document_id);
CREATE INDEX IF NOT EXISTS idx_relationships_from_node_id ON relationships(from_node_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to_node_id ON relationships(to_node_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_attachments_node_id ON attachments(node_id);

CREATE TABLE IF NOT EXISTS node_labels (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  PRIMARY KEY (node_id, label)
);

CREATE INDEX IF NOT EXISTS idx_node_labels_label ON node_labels(label);

CREATE TABLE IF NOT EXISTS node_tags (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (node_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag);
`;

export type SqliteDocumentRow = {
  id: string;
  schema_version: number;
  title: string;
  created_at: string;
  updated_at: string;
};

export type SqliteNodeRow = {
  id: string;
  document_id: string;
  title: string;
  x: number;
  y: number;
  content_type: GraphNode["content"]["type"];
  markdown: string;
  source_data_json: string | null;
  content_updated_at: string;
  radius: number;
  fill: string;
  stroke: string;
  text_color: string;
};

export type SqliteRelationshipRow = {
  id: string;
  document_id: string;
  from_node_id: string;
  to_node_id: string;
  type: string;
  properties_json: string;
  stroke: string;
  width: number;
  dashed: 0 | 1;
};

export type SqliteAttachmentRow = {
  id: string;
  node_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  storage_key: string;
  description: string | null;
};

export type SqliteNodeLabelRow = {
  node_id: string;
  label: string;
};

export type SqliteNodeTagRow = {
  node_id: string;
  tag: string;
};

export type GraphSqliteSnapshot = {
  document: SqliteDocumentRow;
  nodes: SqliteNodeRow[];
  relationships: SqliteRelationshipRow[];
  attachments: SqliteAttachmentRow[];
  labels: SqliteNodeLabelRow[];
  tags: SqliteNodeTagRow[];
};

export function documentToSqliteSnapshot(document: GraphDocument): GraphSqliteSnapshot {
  return {
    document: {
      id: document.id,
      schema_version: document.schemaVersion,
      title: document.title,
      created_at: document.createdAt,
      updated_at: document.updatedAt,
    },
    nodes: document.nodes.map((node) => ({
      id: node.id,
      document_id: document.id,
      title: node.title,
      x: node.x,
      y: node.y,
      content_type: node.content.type,
      markdown: node.content.markdown,
      source_data_json:
        node.content.sourceData === undefined ? null : JSON.stringify(node.content.sourceData),
      content_updated_at: node.content.updatedAt,
      radius: node.style.radius,
      fill: node.style.fill,
      stroke: node.style.stroke,
      text_color: node.style.textColor,
    })),
    relationships: document.relationships.map((relationship) => ({
      id: relationship.id,
      document_id: document.id,
      from_node_id: relationship.fromNodeId,
      to_node_id: relationship.toNodeId,
      type: relationship.type,
      properties_json: JSON.stringify(relationship.properties),
      stroke: relationship.style.stroke,
      width: relationship.style.width,
      dashed: relationship.style.dashed ? 1 : 0,
    })),
    attachments: document.nodes.flatMap((node) =>
      node.attachments.map((attachment) => ({
        id: attachment.id,
        node_id: node.id,
        name: attachment.name,
        mime_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
        created_at: attachment.createdAt,
        storage_key: attachment.storageKey ?? attachment.id,
        description: attachment.description ?? null,
      })),
    ),
    labels: document.nodes.flatMap((node) =>
      node.labels.map((label) => ({ node_id: node.id, label })),
    ),
    tags: document.nodes.flatMap((node) => node.tags.map((tag) => ({ node_id: node.id, tag }))),
  };
}

export function sqliteSnapshotToDocument(snapshot: GraphSqliteSnapshot): GraphDocument {
  const labelsByNodeId = new Map<string, string[]>();
  const tagsByNodeId = new Map<string, string[]>();
  const attachmentsByNodeId = new Map<string, AttachedFile[]>();

  snapshot.labels.forEach((row) => {
    labelsByNodeId.set(row.node_id, [...(labelsByNodeId.get(row.node_id) ?? []), row.label]);
  });
  snapshot.tags.forEach((row) => {
    tagsByNodeId.set(row.node_id, [...(tagsByNodeId.get(row.node_id) ?? []), row.tag]);
  });
  snapshot.attachments.forEach((row) => {
    attachmentsByNodeId.set(row.node_id, [
      ...(attachmentsByNodeId.get(row.node_id) ?? []),
      {
        id: row.id,
        name: row.name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        storageKey: row.storage_key,
        description: row.description ?? undefined,
      },
    ]);
  });

  const document: GraphDocument = {
    schemaVersion: 1,
    id: snapshot.document.id,
    title: snapshot.document.title,
    createdAt: snapshot.document.created_at,
    updatedAt: snapshot.document.updated_at,
    nodes: snapshot.nodes.map((row) => ({
      id: row.id,
      title: row.title,
      x: row.x,
      y: row.y,
      labels: labelsByNodeId.get(row.id) ?? [],
      tags: tagsByNodeId.get(row.id) ?? [],
      content: {
        type: row.content_type,
        markdown: row.markdown,
        sourceData: row.source_data_json === null ? undefined : JSON.parse(row.source_data_json),
        updatedAt: row.content_updated_at,
      },
      attachments: attachmentsByNodeId.get(row.id) ?? [],
      style: {
        radius: row.radius,
        fill: row.fill,
        stroke: row.stroke,
        textColor: row.text_color,
      },
    })),
    relationships: snapshot.relationships.map((row): GraphRelationship => ({
      id: row.id,
      fromNodeId: row.from_node_id,
      toNodeId: row.to_node_id,
      type: row.type,
      properties: JSON.parse(row.properties_json) as GraphRelationship["properties"],
      style: {
        stroke: row.stroke,
        width: row.width,
        dashed: row.dashed === 1 || undefined,
      },
    })),
  };

  return migrateDocument(document);
}

