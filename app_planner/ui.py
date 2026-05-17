import os
import sys
from datetime import date, timedelta
from typing import Optional

from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical, Container
from textual.widgets import Label, Static, Input, TextArea, Checkbox
from app_planner.models import PlannerEntry, Task
from app_planner.database import load_entry, save_entry, init_db
from app_projmgmt.database import (
    create_card,
    create_project,
    update_card,
    init_db as init_project_db,
    list_cards,
    list_projects,
)
from app_projmgmt.models import (
    CardStatus,
    CardType,
    Project,
    ProjectCard,
    ProjectCardCreate,
    ProjectCreate,
)

init_db()
init_project_db()


CARD_TYPE_LABELS = {
    CardType.EPIC: "Epic",
    CardType.FEATURE: "Feature",
    CardType.STORY: "Story",
    CardType.SUBTASK: "Subtask",
}

CHILD_TYPE_BY_CARD_TYPE = {
    CardType.EPIC: CardType.FEATURE,
    CardType.FEATURE: CardType.STORY,
    CardType.STORY: CardType.SUBTASK,
}

PARENT_TYPE_BY_CARD_TYPE = {
    CardType.EPIC: None,
    CardType.FEATURE: CardType.EPIC,
    CardType.STORY: CardType.FEATURE,
    CardType.SUBTASK: CardType.STORY,
}

STATUS_HELP = "backlog | in_progress | blocked | done"


def get_css_path() -> str:
    if getattr(sys, "frozen", False):
        # This activates if running as part of a PyInstaller bundle
        return os.path.join(sys._MEIPASS, "app_planner", "ui.css")
    else:
        # This executes when being run normally
        return os.path.join(os.path.dirname(__file__), "ui.css")


class PlannerApp(App):
    CSS_PATH = get_css_path()
    BINDINGS = [
        ("f2", "show_projects", "Projects"),
        ("ctrl+m", "show_projects", "Projects"),
        ("f1", "show_planner", "Planner"),
        ("ctrl+p", "show_planner", "Planner"),
        ("left", "previous_day", "Previous day"),
        ("right", "next_day", "Next day"),
        ("ctrl+1", "focus_schedule", "Schedule"),
        ("ctrl+2", "focus_priorities", "Priorities"),
        ("ctrl+3", "focus_tasks", "Tasks"),
        ("ctrl+4", "focus_notes", "Notes"),
        ("f5", "create_project", "Create project"),
        ("ctrl+n", "create_project", "Create project"),
        ("f6", "create_epic", "Create epic"),
        ("ctrl+e", "create_epic", "Create epic"),
        ("f7", "create_child", "Create child"),
        ("ctrl+a", "create_child", "Create child"),
        ("f10", "save_card", "Save card"),
        ("pageup", "previous_project", "Previous project"),
        ("ctrl+up", "previous_project", "Previous project"),
        ("pagedown", "next_project", "Next project"),
        ("ctrl+down", "next_project", "Next project"),
        ("f9", "next_card", "Next card"),
        ("ctrl+j", "next_card", "Next card"),
        ("f8", "previous_card", "Previous card"),
        ("ctrl+k", "previous_card", "Previous card"),
    ]

    def __init__(self):
        super().__init__()
        self.entry_date = date.today()
        self.entry: Optional[PlannerEntry] = None
        self.active_view = "planner"
        self.projects: list[Project] = []
        self.project_index = 0
        self.project_cards = []
        self.card_index = 0

    def compose(self) -> ComposeResult:
        yield Label("", id="mode-label")

        # Store references for later access
        self.date_label = Label(
            f"DATE: {self.entry_date.strftime('%A, %B %d, %Y')}", id="date-label"
        )
        self.schedule_area = TextArea(id="section-schedule")
        self.priority_inputs = [
            Input(placeholder=f"{i + 1}.", id=f"priority-{i}") for i in range(3)
        ]
        self.task_widgets = [
            (Checkbox(value=False), Input(placeholder=f"Task {i + 1}", id=f"task-{i}"))
            for i in range(5)
        ]
        self.notes_area = TextArea(id="section-notes")

        self.project_list = Static("", id="project-list")
        self.card_list = Static("", id="project-card-list")
        self.project_name_input = Input(
            placeholder="Project name (F5 to create)", id="project-name"
        )
        self.project_description_area = TextArea(id="project-description")
        self.epic_input = Input(placeholder="New epic title (F6)", id="epic-title")
        self.child_input = Input(
            placeholder="New child title for selected card (F7)", id="child-title"
        )
        self.deliverables_input = Input(
            placeholder="Deliverables, comma separated", id="card-deliverables"
        )
        self.edit_title_input = Input(
            placeholder="Selected card title", id="card-edit-title"
        )
        self.edit_description_area = TextArea(id="card-edit-description")
        self.edit_status_input = Input(
            placeholder=f"Status: {STATUS_HELP}", id="card-edit-status"
        )
        self.edit_due_date_input = Input(
            placeholder="Due date: YYYY-MM-DD", id="card-edit-due-date"
        )
        self.edit_parent_input = Input(
            placeholder="Parent #: blank for project/root", id="card-edit-parent"
        )
        self.edit_deliverables_input = Input(
            placeholder="Deliverables, comma separated", id="card-edit-deliverables"
        )
        self.edit_message = Static("", id="card-edit-message")

        yield Container(
            self.date_label,
            Horizontal(
                Vertical(Static("[ SCHEDULE ]"), self.schedule_area, id="schedule"),
                Vertical(
                    Static("[ PRIORITIES ]"),
                    *self.priority_inputs,
                    id="priorities",
                ),
                Vertical(
                    Label("[ TASKS ]", id="title-tasks"),
                    *[Horizontal(cb, inp) for cb, inp in self.task_widgets],
                    id="tasks",
                ),
            ),
            Container(Static("[ NOTES ]"), self.notes_area, id="notes"),
            id="planner-view",
        )

        yield Container(
            Horizontal(
                Vertical(
                    Static("Projects"),
                    self.project_list,
                    Static("New Project"),
                    self.project_name_input,
                    self.project_description_area,
                    id="project-panel",
                ),
                Vertical(
                    Static("Cards"),
                    self.card_list,
                    Static("Add Cards"),
                    self.epic_input,
                    self.child_input,
                    self.deliverables_input,
                    Static("Edit Selected Card"),
                    self.edit_title_input,
                    self.edit_description_area,
                    self.edit_status_input,
                    self.edit_due_date_input,
                    self.edit_parent_input,
                    self.edit_deliverables_input,
                    self.edit_message,
                    id="card-panel",
                ),
            ),
            id="projects-view",
        )

    async def on_mount(self):
        await self.show_planner_view()
        # Load entry from the database
        self.entry = load_entry(self.entry_date.isoformat()) or PlannerEntry(
            entry_date=self.entry_date
        )

        # Populate widgets
        self.schedule_area.text = self.entry.schedule or ""
        for i, val in enumerate(self.entry.priorities):
            if i < len(self.priority_inputs):
                self.priority_inputs[i].value = val
        for i, task in enumerate(self.entry.tasks):
            if i < len(self.task_widgets):
                cb, inp = self.task_widgets[i]
                cb.value = task.completed
                inp.value = task.text
        self.notes_area.text = self.entry.notes or ""
        await self.reload_projects()

    def save_current_entry(self):
        # Collect updated values from widgets
        priorities = [
            input.value for input in self.priority_inputs if input.value.strip()
        ]
        tasks = [
            Task(text=inp.value, completed=cb.value)
            for cb, inp in self.task_widgets
            if inp.value.strip()
        ]

        updated_entry = PlannerEntry(
            entry_date=self.entry_date,
            priorities=priorities,
            tasks=tasks,
            schedule=self.schedule_area.text,
            notes=self.notes_area.text,
        )

        save_entry(updated_entry)

    def on_exit(self) -> None:
        if self.active_view == "planner":
            self.save_current_entry()

    async def show_planner_view(self):
        self.active_view = "planner"
        self.query_one("#planner-view").display = True
        self.query_one("#projects-view").display = False
        self.query_one("#mode-label", Label).update(
            "Planner | F2 Projects | Left/Right Day | Ctrl+1..4 Focus"
        )

    async def show_projects_view(self):
        self.save_current_entry()
        self.active_view = "projects"
        self.query_one("#planner-view").display = False
        self.query_one("#projects-view").display = True
        self.query_one("#mode-label", Label).update(
            "Projects | F1 Planner | F5 Project | F6 Epic | F7 Child | F10 Save | PgUp/PgDn Project | F8/F9 Card"
        )
        await self.reload_projects()

    async def reload_projects(self):
        self.projects = list_projects()
        if self.project_index >= len(self.projects):
            self.project_index = max(len(self.projects) - 1, 0)
        await self.reload_project_cards()
        self.render_project_lists()
        self.populate_card_edit_form()

    async def reload_project_cards(self):
        selected_id = self.selected_card.id if self.selected_card else None
        project = self.selected_project
        self.project_cards = list_cards(project.id) if project else []
        if selected_id:
            for index, card in enumerate(self.project_cards):
                if card.id == selected_id:
                    self.card_index = index
                    break
        if self.card_index >= len(self.project_cards):
            self.card_index = max(len(self.project_cards) - 1, 0)

    @property
    def selected_project(self) -> Project | None:
        if not self.projects:
            return None
        return self.projects[self.project_index]

    @property
    def selected_card(self) -> ProjectCard | None:
        if not self.project_cards:
            return None
        return self.project_cards[self.card_index]

    def render_project_lists(self):
        if not self.projects:
            self.project_list.update("No projects yet. Enter a name and press F5.")
            self.card_list.update("Create a project before adding cards.")
            self.populate_card_edit_form()
            return

        project_lines = []
        for index, project in enumerate(self.projects):
            marker = ">" if index == self.project_index else " "
            description = f" — {project.description}" if project.description else ""
            project_lines.append(f"{marker} {project.name}{description}")
        self.project_list.update("\n".join(project_lines))

        project = self.selected_project
        if not self.project_cards:
            self.card_list.update(f"{project.name}\nNo cards yet. Add an epic with F6.")
            self.populate_card_edit_form()
            return

        card_lines = [f"{project.name}"]
        for index, card in enumerate(self.project_cards):
            marker = ">" if index == self.card_index else " "
            parent = self.card_parent_label(card)
            deliverables = (
                f" | deliverables: {', '.join(card.deliverables)}"
                if card.deliverables
                else ""
            )
            card_lines.append(
                f"{marker} {index + 1}. [{CARD_TYPE_LABELS[card.card_type]}] {card.title}"
                f" | {card.status.value.replace('_', ' ')} | parent: {parent}{deliverables}"
            )
        self.card_list.update("\n".join(card_lines))

    def card_parent_label(self, card) -> str:
        if not card.parent_id:
            return "Project"
        parent = next(
            (
                candidate
                for candidate in self.project_cards
                if candidate.id == card.parent_id
            ),
            None,
        )
        return parent.title if parent else "Unknown"

    async def create_project_from_form(self):
        name = self.project_name_input.value.strip()
        if not name:
            return

        description = self.project_description_area.text.strip() or None
        create_project(ProjectCreate(name=name, description=description))
        self.project_name_input.value = ""
        self.project_description_area.text = ""
        self.project_index = 0
        await self.reload_projects()

    async def create_epic_from_form(self):
        project = self.selected_project
        title = self.epic_input.value.strip()
        if not project or not title:
            return

        create_card(
            ProjectCardCreate(
                project_id=project.id,
                card_type=CardType.EPIC,
                title=title,
                status=CardStatus.BACKLOG,
                deliverables=self.deliverables_from_form(),
            )
        )
        self.epic_input.value = ""
        self.deliverables_input.value = ""
        await self.reload_projects()

    async def create_child_from_form(self):
        parent = self.selected_card
        title = self.child_input.value.strip()
        if not parent or not title:
            return

        child_type = CHILD_TYPE_BY_CARD_TYPE.get(parent.card_type)
        if not child_type:
            return

        create_card(
            ProjectCardCreate(
                project_id=parent.project_id,
                card_type=child_type,
                title=title,
                status=parent.status,
                parent_id=parent.id,
                deliverables=self.deliverables_from_form(),
            )
        )
        self.child_input.value = ""
        self.deliverables_input.value = ""
        await self.reload_projects()

    def deliverables_from_form(self) -> list[str]:
        return [
            deliverable.strip()
            for deliverable in self.deliverables_input.value.split(",")
            if deliverable.strip()
        ]

    def edit_deliverables_from_form(self) -> list[str]:
        return [
            deliverable.strip()
            for deliverable in self.edit_deliverables_input.value.split(",")
            if deliverable.strip()
        ]

    def eligible_parent_cards(self, card: ProjectCard) -> list[ProjectCard]:
        expected_type = PARENT_TYPE_BY_CARD_TYPE[card.card_type]
        if not expected_type:
            return []
        return [
            candidate
            for candidate in self.project_cards
            if candidate.id != card.id and candidate.card_type == expected_type
        ]

    def populate_card_edit_form(self):
        card = self.selected_card
        if not card:
            self.edit_title_input.value = ""
            self.edit_description_area.text = ""
            self.edit_status_input.value = ""
            self.edit_due_date_input.value = ""
            self.edit_parent_input.value = ""
            self.edit_deliverables_input.value = ""
            self.edit_message.update("No selected card.")
            return

        self.edit_title_input.value = card.title
        self.edit_description_area.text = card.description or ""
        self.edit_status_input.value = card.status.value
        self.edit_due_date_input.value = (
            card.due_date.isoformat() if card.due_date else ""
        )
        parents = self.eligible_parent_cards(card)
        self.edit_parent_input.value = ""
        for index, parent in enumerate(parents, start=1):
            if parent.id == card.parent_id:
                self.edit_parent_input.value = str(index)
                break
        self.edit_deliverables_input.value = ", ".join(card.deliverables)
        self.edit_message.update(self.parent_edit_help(card, parents))

    def parent_edit_help(self, card: ProjectCard, parents: list[ProjectCard]) -> str:
        if card.card_type == CardType.EPIC:
            return "Epic cards are tied to the project. F10 saves edits."
        if not parents:
            expected_type = PARENT_TYPE_BY_CARD_TYPE[card.card_type]
            return f"No eligible {expected_type.value} parent cards. F10 saves details."
        parent_choices = " | ".join(
            f"{index}:{parent.title}" for index, parent in enumerate(parents, start=1)
        )
        return f"Parent #: {parent_choices}. F10 saves edits."

    async def save_selected_card_from_form(self):
        card = self.selected_card
        if not card:
            self.edit_message.update("No selected card to save.")
            return

        title = self.edit_title_input.value.strip()
        if not title:
            self.edit_message.update("Title is required.")
            return

        status_value = self.edit_status_input.value.strip() or CardStatus.BACKLOG.value
        try:
            status = CardStatus(status_value)
        except ValueError:
            self.edit_message.update(f"Invalid status. Use: {STATUS_HELP}.")
            return

        due_date_text = self.edit_due_date_input.value.strip()
        try:
            due_date = date.fromisoformat(due_date_text) if due_date_text else None
        except ValueError:
            self.edit_message.update("Invalid due date. Use YYYY-MM-DD.")
            return

        parents = self.eligible_parent_cards(card)
        parent_text = self.edit_parent_input.value.strip()
        parent_id = None
        if PARENT_TYPE_BY_CARD_TYPE[card.card_type]:
            if not parent_text:
                self.edit_message.update("Parent # is required for this card type.")
                return
            try:
                parent_index = int(parent_text)
            except ValueError:
                self.edit_message.update("Parent # must be a number from the list.")
                return
            if parent_index < 1 or parent_index > len(parents):
                self.edit_message.update("Parent # is not in the eligible parent list.")
                return
            parent_id = parents[parent_index - 1].id

        card.title = title
        card.description = self.edit_description_area.text.strip() or None
        card.status = status
        card.due_date = due_date
        card.parent_id = parent_id
        card.deliverables = self.edit_deliverables_from_form()
        update_card(card)
        await self.reload_project_cards()
        self.render_project_lists()
        self.populate_card_edit_form()
        self.edit_message.update("Saved selected card.")

    async def select_adjacent_project(self, direction: int):
        if not self.projects:
            return
        self.project_index = (self.project_index + direction) % len(self.projects)
        self.card_index = 0
        await self.reload_project_cards()
        self.render_project_lists()
        self.populate_card_edit_form()

    def select_adjacent_card(self, direction: int):
        if not self.project_cards:
            return
        self.card_index = (self.card_index + direction) % len(self.project_cards)
        self.render_project_lists()
        self.populate_card_edit_form()

    async def reload_entry(self):
        # Update date label
        date_label = self.query_one("#date-label", Label)
        date_label.update(f"DATE: {self.entry_date.strftime('%A, %B %d, %Y')}")

        # Load data
        self.entry = load_entry(self.entry_date.isoformat()) or PlannerEntry(
            entry_date=self.entry_date
        )

        # Populate widgets
        self.schedule_area.text = self.entry.schedule or ""
        for i, input_field in enumerate(self.priority_inputs):
            input_field.value = (
                self.entry.priorities[i] if i < len(self.entry.priorities) else ""
            )
        for i in range(len(self.task_widgets)):
            cb, inp = self.task_widgets[i]
            if i < len(self.entry.tasks):
                task = self.entry.tasks[i]
                cb.value = task.completed
                inp.value = task.text
            else:
                cb.value = False
                inp.value = ""
        self.notes_area.text = self.entry.notes or ""

    async def action_show_planner(self) -> None:
        await self.show_planner_view()

    async def action_show_projects(self) -> None:
        await self.show_projects_view()

    async def action_previous_day(self) -> None:
        if self.active_view == "planner":
            self.save_current_entry()
            self.entry_date -= timedelta(days=1)
            await self.reload_entry()

    async def action_next_day(self) -> None:
        if self.active_view == "planner":
            self.save_current_entry()
            self.entry_date += timedelta(days=1)
            await self.reload_entry()

    def action_focus_schedule(self) -> None:
        if self.active_view == "planner":
            self.query_one("#section-schedule").focus()

    def action_focus_priorities(self) -> None:
        if self.active_view == "planner":
            self.query_one("#priority-0").focus()

    def action_focus_tasks(self) -> None:
        if self.active_view == "planner":
            self.query_one("#task-0").focus()

    def action_focus_notes(self) -> None:
        if self.active_view == "planner":
            self.query_one("#section-notes").focus()

    async def action_create_project(self) -> None:
        if self.active_view == "projects":
            await self.create_project_from_form()

    async def action_create_epic(self) -> None:
        if self.active_view == "projects":
            await self.create_epic_from_form()

    async def action_create_child(self) -> None:
        if self.active_view == "projects":
            await self.create_child_from_form()

    async def action_save_card(self) -> None:
        if self.active_view == "projects":
            await self.save_selected_card_from_form()

    async def action_previous_project(self) -> None:
        if self.active_view == "projects":
            await self.select_adjacent_project(-1)

    async def action_next_project(self) -> None:
        if self.active_view == "projects":
            await self.select_adjacent_project(1)

    def action_next_card(self) -> None:
        if self.active_view == "projects":
            self.select_adjacent_card(1)

    def action_previous_card(self) -> None:
        if self.active_view == "projects":
            self.select_adjacent_card(-1)

    async def on_key(self, event) -> None:
        # Fallback for terminals that report uncommon binding names.
        if event.key in {"f1", "ctrl+p", "ctrl_p"}:
            await self.show_planner_view()
            return
        if event.key in {"f2", "ctrl+m", "ctrl_m"}:
            await self.show_projects_view()
            return

        if self.active_view == "projects":
            if event.key in {"f5", "ctrl+n", "ctrl_n"}:
                await self.create_project_from_form()
            elif event.key in {"f6", "ctrl+e", "ctrl_e"}:
                await self.create_epic_from_form()
            elif event.key in {"f7", "ctrl+a", "ctrl_a"}:
                await self.create_child_from_form()
            elif event.key == "f10":
                await self.save_selected_card_from_form()
            elif event.key in {"pageup", "ctrl+up", "ctrl_up"}:
                await self.select_adjacent_project(-1)
            elif event.key in {"pagedown", "ctrl+down", "ctrl_down"}:
                await self.select_adjacent_project(1)
            elif event.key in {"f9", "ctrl+j", "ctrl_j"}:
                self.select_adjacent_card(1)
            elif event.key in {"f8", "ctrl+k", "ctrl_k"}:
                self.select_adjacent_card(-1)
            return

        if event.key in {"left", "right"}:
            self.save_current_entry()
            if event.key == "left":
                self.entry_date -= timedelta(days=1)
            elif event.key == "right":
                self.entry_date += timedelta(days=1)
            await self.reload_entry()
        elif event.key in {"ctrl+1", "ctrl_1"}:
            self.query_one("#section-schedule").focus()
        elif event.key in {"ctrl+2", "ctrl_2"}:
            self.query_one("#priority-0").focus()
        elif event.key in {"ctrl+3", "ctrl_3"}:
            self.query_one("#task-0").focus()
        elif event.key in {"ctrl+4", "ctrl_4"}:
            self.query_one("#section-notes").focus()


if __name__ == "__main__":
    app = PlannerApp()
    app.run()
