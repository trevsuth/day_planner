import { CalendarDays, ClipboardList, FileText, FolderKanban, GitBranch } from "lucide-react";

export default function GraphNavigation() {
  return (
    <nav className="app-tabs" aria-label="Application views">
      <a href="/"><CalendarDays size={18} aria-hidden="true" />Planner</a>
      <a href="/?view=projects"><FolderKanban size={18} aria-hidden="true" />Projects</a>
      <a href="/graph/" aria-current="page"><GitBranch size={18} aria-hidden="true" />Graph</a>
      <a href="/viewer/"><FileText size={18} aria-hidden="true" />Viewer</a>
      <a href="/?view=api"><ClipboardList size={18} aria-hidden="true" />API</a>
    </nav>
  );
}
