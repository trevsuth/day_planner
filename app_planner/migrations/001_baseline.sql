CREATE TABLE IF NOT EXISTS planner (
    entry_date DATE PRIMARY KEY,
    priorities JSONB NOT NULL DEFAULT '[]'::jsonb,
    priority_card_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
    schedule TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS project_cards (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED,
    card_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    comments TEXT,
    status TEXT NOT NULL,
    start_date DATE,
    due_date DATE,
    parent_id TEXT REFERENCES project_cards(id) ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED,
    dependency_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS project_card_activity (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED,
    card_id TEXT NOT NULL REFERENCES project_cards(id) ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_cards_project_id_created_at
ON project_cards (project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_project_card_activity_card_id_created_at
ON project_card_activity (card_id, created_at DESC);

CREATE TABLE IF NOT EXISTS graph_workspace (
    singleton BOOLEAN PRIMARY KEY CHECK (singleton),
    revision BIGINT NOT NULL DEFAULT 0,
    document JSONB
);

CREATE TABLE IF NOT EXISTS graph_attachments (
    storage_key TEXT PRIMARY KEY,
    data BYTEA NOT NULL
);

INSERT INTO graph_workspace (singleton)
VALUES (TRUE)
ON CONFLICT DO NOTHING;
