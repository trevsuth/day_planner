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

