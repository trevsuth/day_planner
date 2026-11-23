"""Run inline JSON Schema and XSD validation in a time-limited worker."""

import json
import subprocess
import sys
from itertools import islice
from pathlib import Path
from threading import BoundedSemaphore

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from referencing import Registry
from referencing.exceptions import Unresolvable

from app_validation.documents import validate_json
from app_validation.models import SchemaRequest, SchemaResult, SchemaIssue


ROOT = Path(__file__).resolve().parents[1]
slots = BoundedSemaphore(2)
MAX_ISSUES = 50
DRAFT = "https://json-schema.org/draft/2020-12/schema"


def validate_schema(request: SchemaRequest) -> SchemaResult:
    return run_schema(request, "json")


def validate_xml_schema(request: SchemaRequest) -> SchemaResult:
    return run_schema(request, "xml")


def run_schema(request: SchemaRequest, kind: str) -> SchemaResult:
    if not slots.acquire(blocking=False):
        return failure("Schema validator is busy. Try again shortly.")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "app_validation.schema", kind],
            cwd=ROOT,
            input=request.model_dump_json(),
            capture_output=True,
            encoding="utf-8",
            timeout=2,
            check=True,
        )
    except subprocess.TimeoutExpired:
        return failure("Schema validation exceeded the two-second limit.")
    except subprocess.CalledProcessError:
        return failure("The schema validator could not finish processing this input.")
    finally:
        slots.release()
    return SchemaResult.model_validate_json(result.stdout)


def failure(message: str) -> SchemaResult:
    return SchemaResult(
        valid=False, issues=[SchemaIssue(document="schema", message=message)]
    )


def check_schema(request: SchemaRequest) -> SchemaResult:
    documents = []
    for name, source in (("json", request.source), ("schema", request.schema_source)):
        try:
            validate_json(source)
            documents.append(json.loads(source))
        except json.JSONDecodeError as error:
            return SchemaResult(
                valid=False,
                issues=[
                    SchemaIssue(
                        document=name,
                        message=error.msg,
                        line=error.lineno,
                        column=error.colno,
                    )
                ],
            )
        except (ValueError, RecursionError):
            return SchemaResult(
                valid=False,
                issues=[
                    SchemaIssue(
                        document=name,
                        message="This JSON exceeds the parser's numeric or nesting limits.",
                    )
                ],
            )
    instance, schema = documents
    if isinstance(schema, dict) and schema.get("$schema", DRAFT) not in (
        DRAFT,
        DRAFT + "#",
    ):
        return failure("Use a JSON Schema Draft 2020-12 schema.")
    try:
        Draft202012Validator.check_schema(schema)
        # The empty registry resolves references within the provided schema only.
        validator = Draft202012Validator(schema, registry=Registry())
        errors = list(islice(validator.iter_errors(instance), MAX_ISSUES + 1))
    except SchemaError as error:
        return SchemaResult(
            valid=False,
            issues=[
                SchemaIssue(
                    document="schema",
                    message=error.message,
                    path=error.json_path,
                )
            ],
        )
    except Unresolvable:
        return failure(
            "Could not resolve a schema reference. Define referenced schemas inline."
        )
    except RecursionError:
        return failure("The schema or its references are nested too deeply.")
    return SchemaResult(
        valid=not errors,
        issues=[
            SchemaIssue(document="json", path=error.json_path, message=error.message)
            for error in errors[:MAX_ISSUES]
        ],
        truncated=len(errors) > MAX_ISSUES,
    )


if __name__ == "__main__":
    request = SchemaRequest.model_validate_json(sys.stdin.read())
    if sys.argv[1] == "xml":
        from app_validation.xml_schema import check_xml_schema

        result = check_xml_schema(request)
    else:
        result = check_schema(request)
    print(result.model_dump_json())
