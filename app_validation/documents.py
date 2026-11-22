import io
import json
import re
from xml.dom import Node
from xml.parsers.expat import ExpatError

import tomlkit
from defusedxml import minidom
from defusedxml.common import DefusedXmlException
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError
from tomlkit.exceptions import ParseError
from tomlkit.items import AoT, Array, InlineTable, Table

from app_validation.models import Diagnostic, DocumentRequest, DocumentResult


JSON_TOKEN = re.compile(r'"(?:[^"\\]|\\.)*"|[{}\[\],:]|[^\s{}\[\],:"]+')
XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace"
MAX_FORMATTED_LENGTH = 500_000


class FormattingLimit(ValueError):
    pass


def validate_json(source: str) -> None:
    def reject_constant(value: str) -> None:
        token = next(
            (
                token
                for token in JSON_TOKEN.finditer(source)
                if token[0].startswith(value)
            ),
            None,
        )
        raise json.JSONDecodeError(
            f"{value} is not a JSON value.", source, token.start() if token else 0
        )

    # The formatter preserves the original numeric tokens. Validation only needs
    # the JSON decoder to confirm their grammar.
    json.loads(
        source,
        parse_int=lambda _: None,
        parse_float=lambda _: None,
        parse_constant=reject_constant,
    )


def pretty_json(source: str) -> str:
    # Only whitespace is rewritten. Preserve numeric precision and string escapes.
    tokens = JSON_TOKEN.findall(source)
    result = []
    depth = 0
    previous = ""
    indentation = 0
    for token in tokens:
        if token in ("]", "}"):
            depth -= 1
            if previous not in ("[", "{"):
                indentation += 2 * depth + 1
                result.append("\n" + "  " * depth)
        elif previous in ("[", "{", ","):
            indentation += 2 * depth + 1
            result.append("\n" + "  " * depth)
        elif previous == ":":
            result.append(" ")
        result.append(token)
        if token in ("[", "{"):
            depth += 1
        if indentation > MAX_FORMATTED_LENGTH:
            raise FormattingLimit("Formatted output exceeds 500,000 characters.")
        previous = token
    return "".join(result) + "\n"


def indent_xml(element, depth: int = 0, preserve: bool = False) -> None:
    space = element.getAttributeNS(XML_NAMESPACE, "space")
    if space:
        preserve = space != "default"
    children = list(element.childNodes)
    for child in children:
        if child.nodeType == Node.ELEMENT_NODE:
            indent_xml(child, depth + 1, preserve)
    if (
        preserve
        or not children
        or any(
            child.nodeType in (Node.TEXT_NODE, Node.CDATA_SECTION_NODE)
            for child in children
        )
    ):
        return
    document = element.ownerDocument
    for child in children:
        element.insertBefore(document.createTextNode("\n" + "  " * (depth + 1)), child)
    element.appendChild(document.createTextNode("\n" + "  " * depth))


def normalize_toml_assignments(container) -> None:
    for key, value in container.body:
        if isinstance(value, Table):
            normalize_toml_assignments(value.value)
        elif isinstance(value, AoT):
            for table in value.body:
                normalize_toml_assignments(table.value)
        elif key is not None:
            key.sep = "= " if key.as_string().endswith((" ", "\t")) else " = "
            if isinstance(value, InlineTable):
                normalize_toml_assignments(value.value)
            elif (
                isinstance(value, Array)
                and len(value) > 2
                and "\n" not in value.as_string()
            ):
                value.multiline(True)


def process_document(request: DocumentRequest) -> DocumentResult:
    source = request.source
    formatted = None
    try:
        match request.format:
            case "json":
                validate_json(source)
                if request.pretty:
                    formatted = pretty_json(source)
            case "xml":
                document = minidom.parseString(source, forbid_dtd=True)
                if request.pretty:
                    indent_xml(document.documentElement)
                    formatted = document.toxml().replace("?>", "?>\n", 1) + "\n"
            case "yaml":
                yaml = YAML(typ="rt")
                yaml.max_depth = 80
                yaml.preserve_quotes = True
                yaml.indent(mapping=2, sequence=4, offset=2)
                documents = list(yaml.load_all(source))
                if request.pretty:
                    if not documents:
                        formatted = source
                    else:
                        output = io.StringIO()
                        yaml.dump_all(documents, output)
                        formatted = output.getvalue()
            case "toml":
                document = tomlkit.parse(source)
                if request.pretty:
                    normalize_toml_assignments(document)
                    formatted = tomlkit.dumps(document)
                    if formatted and not formatted.endswith("\n"):
                        formatted += "\n"
    except json.JSONDecodeError as error:
        return invalid(error.msg, error.lineno, error.colno)
    except ExpatError as error:
        return invalid(str(error), error.lineno, error.offset + 1)
    except YAMLError as error:
        mark = getattr(error, "problem_mark", None)
        return invalid(
            getattr(error, "problem", None) or str(error),
            mark.line + 1 if mark else None,
            mark.column + 1 if mark else None,
        )
    except ParseError as error:
        return invalid(str(error), error.line, error.col + 1)
    except FormattingLimit as error:
        return DocumentResult(valid=True, diagnostic=Diagnostic(message=str(error)))
    except RecursionError:
        return invalid("The document is nested too deeply.")
    except (ValueError, DefusedXmlException) as error:
        return invalid(str(error))
    if formatted is not None and len(formatted) > MAX_FORMATTED_LENGTH:
        return DocumentResult(
            valid=True,
            diagnostic=Diagnostic(
                message="Formatted output exceeds 500,000 characters."
            ),
        )
    return DocumentResult(valid=True, formatted=formatted)


def invalid(
    message: str, line: int | None = None, column: int | None = None
) -> DocumentResult:
    return DocumentResult(
        valid=False, diagnostic=Diagnostic(message=message, line=line, column=column)
    )
