export const TASK_COUNT = 5;
export const PRIORITY_COUNT = 3;
export const STATUSES = ["backlog", "in_progress", "blocked", "done"];
export const CARD_TYPES = ["epic", "feature", "story", "subtask"];

export const statusLabels = {
  backlog: "Backlog",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

export const cardTypeLabels = {
  epic: "Epic",
  feature: "Feature",
  story: "Story",
  subtask: "Subtask",
};

export const activityFieldLabels = {
  card_type: "Type",
  status: "Status",
  start_date: "Start date",
  due_date: "Due date",
  parent_id: "Parent",
  comments: "Comments",
};

export const parentTypeByCardType = {
  epic: null,
  feature: "epic",
  story: "feature",
  subtask: "story",
};

export const childTypeByCardType = {
  epic: "feature",
  feature: "story",
  story: "subtask",
  subtask: null,
};

export const statusOrder = {
  backlog: 0,
  in_progress: 1,
  blocked: 2,
  done: 3,
};

export const cardTypeOrder = {
  epic: 0,
  feature: 1,
  story: 2,
  subtask: 3,
};

export const PROJECT_VIEWS = ["portfolio", "issues", "graph", "roadmap", "timeline", "gantt", "calendar", "board"];

export const projectCardCsvHeaders = [
  "Project Name",
  "Hierarchy Level",
  "Card ID",
  "Type",
  "Title",
  "Status",
  "Parent ID",
  "Parent Type",
  "Parent Title",
  "Dependency IDs",
  "Dependency Titles",
  "Start Date",
  "Due Date",
  "Deliverables",
  "Description",
  "Comments",
  "Created At",
  "Updated At",
];

export const defaultProjectFilters = {
  query: "",
  cardTypes: [],
  statuses: [],
  schedule: "all",
};
