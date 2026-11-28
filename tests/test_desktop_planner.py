from datetime import date

import pytest

from app_planner.database import load_entry, save_entry
from app_planner.models import PlannerEntry, Task
from app_planner.ui import PlannerApp
from app_projmgmt.database import get_card, list_cards


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_planner_saves_each_day_and_restores_its_fields(temp_db):
    today = date(2026, 6, 10)
    tomorrow = date(2026, 6, 11)
    save_entry(
        PlannerEntry(
            entry_date=today,
            priorities=["Keep priority", "Replace priority"],
            priority_card_ids=["keep-card", "replace-card"],
            tasks=[Task(text="Existing task", completed=True)],
            schedule="Morning review",
            notes="Daily notes",
        )
    )
    app = PlannerApp()
    app.entry_date = today

    async with app.run_test() as pilot:
        assert app.schedule_area.text == "Morning review"
        assert app.notes_area.text == "Daily notes"
        assert app.task_widgets[0][0].value
        app.priority_inputs[1].value = "Revised priority"
        app.task_widgets[1][1].value = "Follow up"

        await app.action_next_day()
        assert app.entry_date == tomorrow
        assert app.schedule_area.text == ""
        assert not app.task_widgets[0][0].value
        assert all(not widget.value for widget in app.priority_inputs)
        app.notes_area.text = "Tomorrow's notes"

        await app.action_previous_day()
        assert app.entry_date == today
        assert app.priority_inputs[1].value == "Revised priority"
        assert app.task_widgets[1][1].value == "Follow up"
        assert load_entry(tomorrow.isoformat()).notes == "Tomorrow's notes"
        saved = load_entry(today.isoformat())
        assert saved.priority_card_ids == ["keep-card", None]
        assert [task.completed for task in saved.tasks] == [True, False]

        for key, widget_id in (
            ("ctrl+1", "section-schedule"),
            ("ctrl+2", "priority-0"),
            ("ctrl+3", "task-0"),
            ("ctrl+4", "section-notes"),
        ):
            await pilot.press(key)
            assert app.focused.id == widget_id

        app.notes_area.text = "Saved on view change"
        await pilot.press("f2")
        assert app.active_view == "projects"
        assert load_entry(today.isoformat()).notes == "Saved on view change"
        await pilot.press("f1")
        assert app.active_view == "planner"


@pytest.mark.anyio
async def test_projects_create_search_reparent_and_edit_cards(temp_db):
    app = PlannerApp()
    async with app.run_test() as pilot:
        await pilot.press("f2", "f5", "f6", "f7", "f10")
        assert app.selected_project is None
        assert "No selected card to save" in str(app.edit_message.render())

        app.project_name_input.value = "  Release  "
        app.project_description_area.text = "Ship the update"
        await pilot.press("f5")
        project = app.selected_project
        assert project.name == "Release"
        assert project.description == "Ship the update"

        app.epic_input.value = "Original epic"
        app.deliverables_input.value = "Checklist, , Notes"
        await pilot.press("f6")
        original = app.selected_card
        assert original.deliverables == ["Checklist", "Notes"]

        app.child_input.value = "Regression tests"
        await pilot.press("f7", "f3")
        assert app.focused is app.card_search_input
        app.card_search_input.value = "Regression"
        await pilot.press("enter")
        child = app.selected_card
        assert child.title == "Regression tests"
        assert child.parent_id == original.id
        assert app.focused is app.edit_title_input

        app.epic_input.value = "Destination epic"
        await pilot.press("f6")
        destination = next(
            card for card in app.project_cards if card.title == "Destination epic"
        )
        eligible = app.eligible_parent_cards(child)
        app.edit_parent_input.value = str(eligible.index(destination) + 1)
        app.edit_title_input.value = "Automated regression tests"
        app.edit_status_input.value = "in_progress"
        app.edit_start_date_input.value = "2026-06-10"
        app.edit_due_date_input.value = "2026-06-11"
        app.edit_description_area.text = "Exercise the release"
        app.edit_comments_area.text = "Run in CI"
        app.edit_deliverables_input.value = "Report, , Logs"
        await pilot.press("f10")
        updated = get_card(child.id)
        assert updated.title == "Automated regression tests"
        assert updated.parent_id == destination.id
        assert updated.status == "in_progress"
        assert updated.start_date == date(2026, 6, 10)
        assert updated.due_date == date(2026, 6, 11)
        assert updated.description == "Exercise the release"
        assert updated.comments == "Run in CI"
        assert updated.deliverables == ["Report", "Logs"]

        app.card_search_input.value = ""
        await pilot.press("f9")
        assert app.selected_card.id != child.id
        await pilot.press("f8")
        assert app.selected_card.id == child.id

        await pilot.press("f3")
        app.card_search_input.value = str(app.project_cards.index(destination) + 1)
        await pilot.press("enter")
        assert app.selected_card.id == destination.id
        assert app.card_search_input.value == ""

        app.project_name_input.value = "Second project"
        await pilot.press("f5")
        names = [app.selected_project.name]
        await app.action_next_project()
        names.append(app.selected_project.name)
        assert set(names) == {"Release", "Second project"}
        await app.action_previous_project()
        assert app.selected_project.name == names[0]
        assert len(list_cards(project.id)) == 3


@pytest.mark.anyio
async def test_project_editor_rejects_invalid_changes_without_saving(temp_db):
    app = PlannerApp()
    async with app.run_test() as pilot:
        await pilot.press("f2")
        app.project_name_input.value = "Release"
        await pilot.press("f5")
        app.epic_input.value = "Release epic"
        await pilot.press("f6")
        app.child_input.value = "Release feature"
        await pilot.press("f7", "f3")
        app.card_search_input.value = "Release feature"
        await pilot.press("enter")
        original = app.selected_card

        for fields, message in (
            ({"title": ""}, "Title is required"),
            ({"status": "unknown"}, "Invalid status"),
            ({"start_date": "tomorrow"}, "Invalid start date"),
            ({"due_date": "yesterday"}, "Invalid due date"),
            ({"start_date": "2026-06-12", "due_date": "2026-06-11"}, "on or before"),
            ({"parent": ""}, "Parent # is required"),
            ({"parent": "two"}, "Parent # must be a number"),
            ({"parent": "2"}, "Parent # is not in the eligible parent list"),
        ):
            app.populate_card_edit_form()
            for field, value in fields.items():
                getattr(app, f"edit_{field}_input").value = value
            await pilot.press("f10")
            assert message in str(app.edit_message.render())
            assert get_card(original.id) == original

        app.card_search_input.value = "no matching card"
        await pilot.pause()
        assert "No cards match" in str(app.card_list.render())
        await pilot.press("f9")
        assert app.selected_card.id == original.id
