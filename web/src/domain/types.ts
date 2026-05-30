export type CardType = "epic" | "feature" | "story" | "subtask";
export type CardStatus = "backlog" | "in_progress" | "blocked" | "done";

export interface PlannerTask {
  text: string;
  completed: boolean;
}

export interface PlannerEntry {
  entry_date: string;
  priorities: string[];
  priority_card_ids: Array<string | null>;
  tasks: PlannerTask[];
  schedule: string | null;
  notes: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCard {
  id: string;
  project_id: string;
  card_type: CardType;
  title: string;
  description: string | null;
  comments: string | null;
  status: CardStatus;
  start_date: string | null;
  due_date: string | null;
  parent_id: string | null;
  dependency_ids: string[];
  deliverables: string[];
  created_at: string;
  updated_at: string;
}

export interface ProjectCardIssue {
  card_id: string;
  type: string;
  severity: "warning";
  message: string;
  dependency_id: string | null;
  boundary: string | null;
}
