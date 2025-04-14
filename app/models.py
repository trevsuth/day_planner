from datetime import date
from typing import List, Optional
from pydantic import BaseModel


class Task(BaseModel):
    text: str
    completed: bool


class PlannerEntry(BaseModel):
    entry_date: date
    priorities: List[str] = []
    tasks: List[Task] = []
    schedule: Optional[str] = None
    notes: Optional[str] = None
