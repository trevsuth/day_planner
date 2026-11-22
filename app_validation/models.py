from typing import Annotated, Literal

from pydantic import BaseModel, Field

Source = Annotated[str, Field(max_length=100_000)]


class DocumentRequest(BaseModel):
    format: Literal["json", "xml", "yaml", "toml"]
    source: Source
    pretty: bool = False


class Diagnostic(BaseModel):
    message: str
    line: int | None = None
    column: int | None = None


class DocumentResult(BaseModel):
    valid: bool
    diagnostic: Diagnostic | None = None
    formatted: str | None = None


class CharacterRequest(BaseModel):
    source: Source
    remove_offsets: list[int] = Field(default_factory=list, max_length=10_000)


class InvisibleCharacter(BaseModel):
    offset: int
    line: int
    column: int
    code_point: str
    name: str


class CharacterResult(BaseModel):
    characters: list[InvisibleCharacter]
    truncated: bool
    cleaned: str | None = None


class RegexRequest(BaseModel):
    pattern: str = Field(max_length=2_000)
    source: Source
    flags: Annotated[str, Field(pattern=r"^[aimsx]*$", max_length=5)] = ""


class Span(BaseModel):
    start: int
    end: int


class RegexMatch(Span):
    groups: list[Span | None]


class RegexResult(BaseModel):
    matches: list[RegexMatch] = Field(default_factory=list)
    group_names: dict[str, int] = Field(default_factory=dict)
    truncated: bool = False
    diagnostic: Diagnostic | None = None
