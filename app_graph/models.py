from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints

AttachmentKey = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,128}$")]
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = 24 * 1024 * 1024


class Attachment(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    mimeType: str
    sizeBytes: int = Field(ge=0)
    createdAt: str
    storageKey: AttachmentKey | None = None
    description: str | None = None


class NodeContent(BaseModel):
    type: Literal["article", "example", "dataset", "note"]
    markdown: str
    updatedAt: str
    sourceData: JsonValue = None


class NodeStyle(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    radius: float
    fill: str
    stroke: str
    textColor: str


class RelationshipStyle(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    stroke: str
    width: float
    dashed: bool | None = None


class Relationship(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    id: str
    fromNodeId: str
    toNodeId: str
    type: str
    properties: dict[str, str | int | float | bool]
    style: RelationshipStyle


class Node(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)

    id: str
    title: str
    x: float
    y: float
    labels: list[str]
    tags: list[str]
    content: NodeContent
    style: NodeStyle
    attachments: list[Attachment]


class GraphDocument(BaseModel):
    model_config = ConfigDict(extra="allow")

    schemaVersion: Literal[1]
    id: str
    title: str
    nodes: list[Node]
    relationships: list[Relationship]
    createdAt: str
    updatedAt: str


class Workspace(BaseModel):
    revision: int = Field(ge=0)
    document: GraphDocument | None


class WorkspaceUpdate(BaseModel):
    revision: int = Field(ge=0)
    document: GraphDocument
    files: dict[AttachmentKey, str] = Field(default_factory=dict)
