from datetime import date, datetime, timezone
from enum import StrEnum
from uuid import uuid4

from pydantic import BaseModel, Field


def new_id() -> str:
    return uuid4().hex


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CardType(StrEnum):
    EPIC = "epic"
    FEATURE = "feature"
    STORY = "story"
    SUBTASK = "subtask"


class CardStatus(StrEnum):
    BACKLOG = "backlog"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"


class Project(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str
    description: str | None = None


class ProjectCard(BaseModel):
    id: str = Field(default_factory=new_id)
    project_id: str
    card_type: CardType
    title: str
    description: str | None = None
    comments: str | None = None
    status: CardStatus = CardStatus.BACKLOG
    start_date: date | None = None
    due_date: date | None = None
    parent_id: str | None = None
    dependency_ids: list[str] = Field(default_factory=list)
    deliverables: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ProjectCardCreate(BaseModel):
    project_id: str
    card_type: CardType
    title: str
    description: str | None = None
    comments: str | None = None
    status: CardStatus = CardStatus.BACKLOG
    start_date: date | None = None
    due_date: date | None = None
    parent_id: str | None = None
    dependency_ids: list[str] = Field(default_factory=list)
    deliverables: list[str] = Field(default_factory=list)


class ProjectCardUpdate(BaseModel):
    card_type: CardType
    title: str
    description: str | None = None
    comments: str | None = None
    status: CardStatus = CardStatus.BACKLOG
    start_date: date | None = None
    due_date: date | None = None
    parent_id: str | None = None
    dependency_ids: list[str] = Field(default_factory=list)
    deliverables: list[str] = Field(default_factory=list)
