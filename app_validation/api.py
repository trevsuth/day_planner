from fastapi import APIRouter

from app_validation.characters import scan_characters
from app_validation.config_diff import compare_configs
from app_validation.documents import process_document
from app_validation.models import (
    CharacterRequest,
    CharacterResult,
    ConfigDiffRequest,
    ConfigDiffResult,
    DocumentRequest,
    DocumentResult,
    SchemaRequest,
    SchemaResult,
    RegexRequest,
    RegexResult,
    SqlRequest,
    SqlResult,
)
from app_validation.regex import run_python_regex
from app_validation.schema import validate_schema, validate_xml_schema
from app_validation.sql import translate_sql


router = APIRouter(prefix="/api/validation", tags=["validation"])


@router.post("/document")
def document(request: DocumentRequest) -> DocumentResult:
    """Validate JSON, XML, YAML or TOML, optionally returning formatted text."""
    return process_document(request)


@router.post("/characters")
def characters(request: CharacterRequest) -> CharacterResult:
    """Find invisible characters and optionally remove specified code-point offsets."""
    return scan_characters(request)


@router.post("/regex")
def regex(request: RegexRequest) -> RegexResult:
    """Match a Python regex and return code-point spans and capture groups."""
    return run_python_regex(request)


@router.post("/sql")
def sql(request: SqlRequest) -> SqlResult:
    """Format SQL in its source dialect or translate it to a target dialect."""
    return translate_sql(request)


@router.post("/schema")
def schema(request: SchemaRequest) -> SchemaResult:
    """Validate JSON against an inline Draft 2020-12 JSON Schema."""
    return validate_schema(request)


@router.post("/xml-schema")
def xml_schema(request: SchemaRequest) -> SchemaResult:
    """Validate XML against a self-contained XSD 1.0 schema."""
    return validate_xml_schema(request)


@router.post("/config-diff")
def config_diff(request: ConfigDiffRequest) -> ConfigDiffResult:
    """Format and compare two JSON or YAML configurations."""
    return compare_configs(request)
