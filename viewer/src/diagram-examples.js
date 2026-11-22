export const diagramExamples = [
  {
    id: "flowchart",
    label: "Flowchart",
    source: `flowchart LR
    Draft --> Review{Approved?}
    Review -->|Yes| Publish
    Review -->|Revise| Draft
    Publish --> Verify`,
  },
  {
    id: "sequence",
    label: "Sequence diagram",
    source: `sequenceDiagram
    participant User
    participant App
    participant API
    User->>App: Open workspace
    App->>API: Load workspace
    API-->>App: Workspace data
    App-->>User: Show workspace`,
  },
  {
    id: "class",
    label: "Class diagram",
    source: `classDiagram
    class Project {
      +String name
      +addTask()
    }
    class Task {
      +String title
      +Boolean done
    }
    Project "1" *-- "*" Task : contains`,
  },
  {
    id: "state",
    label: "State diagram",
    source: `stateDiagram-v2
    [*] --> Draft
    Draft --> Review: Submit
    Review --> Draft: Request changes
    Review --> Approved: Approve
    Approved --> [*]`,
  },
  {
    id: "er",
    label: "Entity relationship",
    source: `erDiagram
    PROJECT ||--o{ TASK : contains
    PROJECT {
      int id PK
      string name
    }
    TASK {
      int id PK
      int project_id FK
      string title
    }`,
  },
  {
    id: "gantt",
    label: "Gantt chart",
    source: `gantt
    title Release plan
    dateFormat YYYY-MM-DD
    section Build
      Draft release     :draft, 2031-02-03, 2d
      Test package      :test, after draft, 2d
    section Deploy
      Roll out release  :after test, 1d`,
  },
  {
    id: "pie",
    label: "Pie chart",
    source: `pie title Time by activity
    "Planning" : 20
    "Building" : 50
    "Testing" : 30`,
  },
  {
    id: "mindmap",
    label: "Mind map",
    source: `mindmap
  root((Home lab))
    Services
      Planner
      Graph
    Operations
      Backups
      Monitoring`,
  },
  {
    id: "timeline",
    label: "Timeline",
    source: `timeline
    title Release milestones
    Monday : Draft release notes
    Wednesday : Run acceptance tests
    Friday : Deploy and verify`,
  },
  {
    id: "git",
    label: "Git graph",
    source: `gitGraph
    commit id: "Initial release"
    branch feature
    checkout feature
    commit id: "Add preview"
    checkout main
    merge feature`,
  },
];
