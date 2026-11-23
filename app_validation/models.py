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


SqlDialect = Literal["postgres", "sqlite", "duckdb", "mysql", "snowflake", "bigquery"]


class SqlRequest(BaseModel):
    source: Source
    source_dialect: SqlDialect
    target_dialect: SqlDialect | None = None


class SqlResult(BaseModel):
    formatted: str | None = None
    warnings: list[str] = Field(default_factory=list)
    diagnostic: Diagnostic | None = None


class SchemaRequest(BaseModel):
    source: Source
    schema_source: Source


class SchemaIssue(Diagnostic):
    document: Literal["json", "xml", "schema"]
    path: str = "$"


class SchemaResult(BaseModel):
    valid: bool
    issues: list[SchemaIssue] = Field(default_factory=list)
    truncated: bool = False


class ConfigDiffRequest(BaseModel):
    format: Literal["json", "yaml"]
    left: Source
    right: Source


class DiffRow(BaseModel):
    kind: Literal["equal", "insert", "delete", "replace"]
    left: str | None
    right: str | None
    left_line: int | None
    right_line: int | None


class ConfigDiffResult(BaseModel):
    rows: list[DiffRow] = Field(default_factory=list)
    changed: int = 0
    side: Literal["left", "right"] | None = None
    diagnostic: Diagnostic | None = None
