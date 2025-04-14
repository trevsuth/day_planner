import os
import sqlite3
import tempfile
import pytest
from datetime import date
from app.models import PlannerEntry, Task
from app.database import get_connection, init_db, save_entry, load_entry


@pytest.fixture
def temp_db(monkeypatch):
    fd, path = tempfile.mkstemp()
    os.close(fd)

    def _get_temp_connection():
        return sqlite3.connect(path)

    monkeypatch.setattr("database.get_connection", _get_temp_connection)
    init_db()
    yield
    os.remove(path)


def test_save_and_load_entry(temp_db):
    entry = PlannerEntry(
        entry_date=date(2025, 4, 10),
        priorities=["Finish report", "Workout", "Meditate"],
        tasks=[
            Task(text="Write unit test", completed=True),
            Task(text="Push to Git", completed=False),
        ],
        schedule="8am: Coffee\n9am: Meeting",
        notes="Felt productive today",
    )

    save_entry(entry)

    loaded = load_entry("2025-04-10")
    assert loaded is not None
    assert loaded.entry_date == entry.entry_date
    assert loaded.priorities == entry.priorities
    assert loaded.tasks == entry.tasks
    assert loaded.schedule == entry.schedule
    assert loaded.notes - -entry.notes
