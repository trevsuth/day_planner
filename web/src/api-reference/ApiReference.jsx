import { ClipboardList } from "lucide-react";

const plannerEndpoints = [
  {
    method: "GET",
    path: "/api/planner/entries/{entry_date}",
    purpose: "Load one planner entry. Returns an empty entry when none exists.",
  },
  {
    method: "PUT",
    path: "/api/planner/entries/{entry_date}",
    purpose: "Create or replace one planner entry. URL date must match body entry_date.",
  },
  {
    method: "PUT",
    path: "/api/planner/card-assignments/{card_id}",
    purpose: "Assign or move a linked card into a planner priority slot.",
  },
  {
    method: "DELETE",
    path: "/api/planner/card-assignments/{card_id}",
    purpose: "Remove a linked card from its planner priority slot.",
  },
  {
    method: "GET",
    path: "/api/entries/{entry_date}",
    purpose: "Legacy alias for loading planner entries.",
  },
  {
    method: "PUT",
    path: "/api/entries/{entry_date}",
    purpose: "Legacy alias for saving planner entries.",
  },
];

const projectEndpoints = [
  {
    method: "GET",
    path: "/api/projmgmt/projects",
    purpose: "List projects ordered by update time.",
  },
  {
    method: "POST",
    path: "/api/projmgmt/projects",
    purpose: "Create a project.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/projects/{project_id}",
    purpose: "Load one project.",
  },
  {
    method: "PUT",
    path: "/api/projmgmt/projects/{project_id}",
    purpose: "Update a project name and description.",
  },
  {
    method: "DELETE",
    path: "/api/projmgmt/projects/{project_id}",
    purpose: "Delete a project and its cards.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/projects/{project_id}/cards",
    purpose: "List cards for one project.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/projects/{project_id}/issues",
    purpose: "List server-side dependency and hierarchy schedule warnings for one project.",
  },
  {
    method: "POST",
    path: "/api/projmgmt/cards",
    purpose: "Create an epic, feature, story, or subtask card.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/cards/{card_id}",
    purpose: "Load one card.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/cards/{card_id}/activity",
    purpose: "List tracked type, status, date, parent, and comment changes for one card.",
  },
  {
    method: "PUT",
    path: "/api/projmgmt/cards/{card_id}",
    purpose: "Update a card; type changes shift descendant levels when hierarchy depth remains valid.",
  },
  {
    method: "DELETE",
    path: "/api/projmgmt/cards/{card_id}",
    purpose: "Delete a card that has no child cards.",
  },
];

export function ApiReference() {
  return (
    <>
      <header className="topbar api-topbar">
        <div>
          <div className="eyebrow">
            <ClipboardList size={16} />
            <span>API Reference</span>
          </div>
          <h1>Local API</h1>
        </div>
        <a className="secondary-button api-doc-link" href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">
          Open Docs
        </a>
      </header>

      <div className="api-reference-grid">
        <section className="api-panel api-overview">
          <h2>Development URLs</h2>
          <dl>
            <div>
              <dt>API server</dt>
              <dd>http://127.0.0.1:8000</dd>
            </div>
            <div>
              <dt>OpenAPI JSON</dt>
              <dd>/openapi.json</dd>
            </div>
            <div>
              <dt>Interactive docs</dt>
              <dd>/docs</dd>
            </div>
          </dl>
        </section>

        <ApiEndpointSection title="Planner" endpoints={plannerEndpoints} />
        <ApiEndpointSection title="Project Manager" endpoints={projectEndpoints} />

        <section className="api-panel">
          <h2>Planner Entry</h2>
          <CodeBlock
            value={`{
  "entry_date": "2026-05-17",
  "priorities": ["Ship project views"],
  "priority_card_ids": ["linked-card-id"],
  "tasks": [
    { "text": "Review API reference", "completed": false }
  ],
  "schedule": "09:00 Focus block",
  "notes": "Anything useful from the day."
}`}
          />
        </section>

        <section className="api-panel">
          <h2>Project Card</h2>
          <CodeBlock
            value={`{
  "project_id": "project-id",
  "card_type": "feature",
  "title": "Timeline view",
  "description": "Show scheduled work",
  "comments": "## Notes\\n\\n\`\`\`mermaid\\ngraph TD\\nA-->B\\n\`\`\`",
  "status": "in_progress",
  "start_date": "2026-05-17",
  "due_date": "2026-05-24",
  "parent_id": "epic-id",
  "dependency_ids": ["api-contract-card-id"],
  "deliverables": ["Timeline", "Gantt"]
}`}
          />
        </section>

        <section className="api-panel">
          <h2>Project Card Activity</h2>
          <CodeBlock
            value={`{
  "id": "activity-id",
  "project_id": "project-id",
  "card_id": "card-id",
  "field_name": "status",
  "old_value": "backlog",
  "new_value": "in_progress",
  "created_at": "2026-05-18T14:30:00Z"
}`}
          />
        </section>

        <section className="api-panel">
          <h2>Card Rules</h2>
          <ul className="api-rule-list">
            <li>Valid card types: epic, feature, story, subtask.</li>
            <li>Valid statuses: backlog, in_progress, blocked, done.</li>
            <li>Features must have an epic parent.</li>
            <li>Stories must have a feature parent.</li>
            <li>Subtasks must have a story parent.</li>
            <li>Start date must be on or before due date.</li>
            <li>Dependency cards must belong to the same project.</li>
            <li>Dependency date conflicts are warnings and do not block saves.</li>
            <li>Changing a card type shifts every descendant by the same number of levels.</li>
            <li>Type changes are rejected when a descendant would move below subtask.</li>
            <li>Cards with children cannot be deleted.</li>
          </ul>
        </section>
      </div>
    </>
  );
}

function ApiEndpointSection({ endpoints, title }) {
  return (
    <section className="api-panel api-endpoints">
      <h2>{title}</h2>
      <div>
        {endpoints.map((endpoint) => (
          <article className="api-endpoint" key={`${endpoint.method}-${endpoint.path}`}>
            <span className={`api-method ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
            <code>{endpoint.path}</code>
            <p>{endpoint.purpose}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CodeBlock({ value }) {
  return <pre className="api-code"><code>{value}</code></pre>;
}
