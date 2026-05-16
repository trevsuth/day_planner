from datetime import date
from pydantic import BaseModel, Field


class Task(BaseModel):
    text: str
    completed: bool


class PlannerEntry(BaseModel):
    entry_date: date
    priorities: list[str] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    schedule: str | None = None
    notes: str | None = None
