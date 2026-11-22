from fastapi import APIRouter

from app_validation.characters import scan_characters
from app_validation.documents import process_document
from app_validation.models import (
    CharacterRequest,
    CharacterResult,
    DocumentRequest,
    DocumentResult,
    RegexRequest,
    RegexResult,
)
from app_validation.regex import run_python_regex


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
