import os
import sys
from datetime import date, timedelta
from typing import Optional

from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical, Container
from textual.widgets import Label, Static, Input, TextArea, Checkbox
from textual.events import Key
from app.models import PlannerEntry, Task
from app.database import load_entry, save_entry, init_db

init_db()


def get_css_path() -> str:
    if getattr(sys, "frozen", False):
        # This activates if running as part of a PyInstaller bundle
        return os.path.join(sys._MEIPASS, "app", "ui.css")
    else:
        # This executes when being run normally
        return os.path.join(os.path.dirname(__file__), "ui.css")


class PlannerApp(App):
    CSS_PATH = get_css_path()

    def __init__(self):
        super().__init__()
        self.entry_date = date.today()
        self.entry: Optional[PlannerEntry] = None

    def compose(self) -> ComposeResult:
        yield Label(f"📆 {self.entry_date.strftime('%A, %B %d, %Y')}", id="date-label")

        # Store references for later access
        self.schedule_area = TextArea(id="section-schedule")
        self.priority_inputs = [
            Input(placeholder=f"{i + 1}.", id=f"priority-{i}") for i in range(3)
        ]
        self.task_widgets = [
            (Checkbox(value=False), Input(placeholder=f"Task {i + 1}", id=f"task-{i}"))
            for i in range(5)
        ]
        self.notes_area = TextArea(id="section-notes")

        # Top row with 3 panels
        yield Horizontal(
            Vertical(Static("📅 Schedule"), self.schedule_area, id="schedule"),
            Vertical(
                Static("⭐ Daily Priorities"),
                *self.priority_inputs,
                id="priorities",
            ),
            Vertical(
                Label("✅ Tasks", id="title-tasks"),
                *[Horizontal(cb, inp) for cb, inp in self.task_widgets],
                id="tasks",
            ),
        )

        # Notes section
        yield Container(Static("📝 Notes"), self.notes_area, id="notes")

    async def on_mount(self):
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
        self.save_current_entry()

    async def reload_entry(self):
        # Update date label
        date_label = self.query_one("#date-label", Label)
        date_label.update(f"📆 {self.entry_date.strftime('%A, %B %d, %Y')}")

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

    async def on_key(self, event: Key) -> None:
        if event.key in {"left", "right"}:
            self.save_current_entry()
            if event.key == "left":
                self.entry_date -= timedelta(days=1)
            elif event.key == "right":
                self.entry_date += timedelta(days=1)
            await self.reload_entry()
        elif event.key == "ctrl+1":
            self.query_one("#section-schedule").focus()
        elif event.key == "ctrl+2":
            self.query_one("#priority-0").focus()
        elif event.key == "ctrl+3":
            self.query_one("#task-0").focus()
        elif event.key == "ctrl+4":
            self.query_one("#section-notes").focus()


if __name__ == "__main__":
    app = PlannerApp()
    app.run()
