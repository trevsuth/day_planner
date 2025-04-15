from datetime import date, timedelta
from typing import Optional

from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical, Container
from textual.widgets import Label, Static, Input, TextArea, Checkbox
from textual.events import Key
from models import PlannerEntry, Task
from database import load_entry, save_entry, init_db

init_db()

class PlannerApp(App):
    CSS_PATH = "ui.css"

    def __init__(self):
        super().__init__()
        self.entry_date = date.today()
        self.entry: Optional[PlannerEntry] = None

    def compose(self) -> ComposeResult:
        yield Label(f"📆 {self.entry_date.strftime('%A, %B %d, %Y')}", id="date-label")

        # Store references for later access
        self.schedule_area = TextArea()
        self.priority_inputs = [Input(placeholder=f"{i + 1}.") for i in range(3)]
        self.task_checkboxes = [
            Checkbox("Task 1"),
            Checkbox("Task 2"),
            Checkbox("Task 3")
        ]
        self.notes_area = TextArea()

        # Top row with 3 panels
        yield Horizontal(
            Vertical(Static("📅 Schedule"), self.schedule_area, id="schedule"),
            Vertical(
                Static("⭐ Daily Priorities"),
                *self.priority_inputs,
                id="priorities",
            ),
            Vertical(
                Static("✅ Tasks"),
                *self.task_checkboxes,
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
            if i < len(self.task_checkboxes):
                self.task_checkboxes[i].label = task.text
                self.task_checkboxes[i].value = task.completed
        self.notes_area.text = self.entry.notes or ""

    def save_current_entry(self):
        # Collect updated values from widgets
        priorities = [
            input.value for input in self.priority_inputs if input.value.strip()
        ]
        tasks = [
            Task(text=cb.label.plain, completed=cb.value)
            for cb in self.task_checkboxes
            if cb.label.plain.strip()
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
        self.entry = load_entry(self.entry_date.isoformat()) or PlannerEntry(entry_date=self.entry_date)

        # Populate widgets
        self.schedule_area.text = self.entry.schedule or ""
        for i, input_field in enumerate(self.priority_inputs):
            input_field.value = self.entry.priorities[i] if i < len(self.entry.priorities) else ""
        for i, task in enumerate(self.entry.tasks):
            if i < len(self.task_checkboxes):
                self.task_checkboxes[i].label = task.text
                self.task_checkboxes[i].value = task.completed
            else:
                self.task_checkboxes[i].label = ""
                self.task_checkboxes[i].value = False
        self.notes_area.text = self.entry.notes or ""


    async def on_key(self, event: Key) -> None:
        if event.key in {"left", "right"}:
            self.save_current_entry()
        if event.key == "left":
            self.entry_date -= timedelta(days=1)
            await self.reload_entry()
        elif event.key == "right":
            self.entry_date += timedelta(days=1)
            await self.reload_entry()


if __name__ == "__main__":
    app = PlannerApp()
    app.run()
