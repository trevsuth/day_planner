from typing import Literal

from lxml import etree

from app_validation.models import SchemaIssue, SchemaRequest, SchemaResult


XSD = "{http://www.w3.org/2001/XMLSchema}"
MAX_ISSUES = 50
XmlInput = Literal["xml", "schema"]


class DenyResources(etree.Resolver):
    def resolve(self, url, public_id, context):
        raise OSError("External XML and XSD resources are unavailable.")


def parse_xml(source: str):
    parser = etree.XMLParser(
        encoding="UTF-8", load_dtd=False, resolve_entities=False, no_network=True
    )
    parser.resolvers.add(DenyResources())
    return etree.fromstring(source.encode("utf-8"), parser)


def issue(document: XmlInput, message: str, line: int | None = None) -> SchemaResult:
    return SchemaResult(
        valid=False,
        issues=[
            SchemaIssue(
                document=document,
                path="/",
                message=message,
                line=line,
            )
        ],
    )


def diagnostics(log, document: XmlInput, fallback: str) -> SchemaResult:
    errors = log.filter_from_level(etree.ErrorLevels.ERROR)
    if not errors:
        return issue(document, fallback)
    return SchemaResult(
        valid=False,
        issues=[
            SchemaIssue(
                document=document,
                message=entry.message,
                path=entry.path or "/",
                line=entry.line or None,
                column=entry.column or None,
            )
            for entry in errors[:MAX_ISSUES]
        ],
        truncated=len(errors) > MAX_ISSUES,
    )


def check_xml_schema(request: SchemaRequest) -> SchemaResult:
    roots = []
    for name, source in (("xml", request.source), ("schema", request.schema_source)):
        try:
            root = parse_xml(source)
        except etree.XMLSyntaxError as error:
            return diagnostics(error.error_log, name, "Invalid XML syntax.")
        except (OSError, UnicodeError):
            return issue(name, "Could not read this XML input.")
        if root.getroottree().docinfo.doctype:
            return issue(name, "DTDs and custom entity declarations are unavailable.")
        roots.append(root)

    document, schema = roots
    for directive in schema:
        if directive.tag in {
            XSD + "include",
            XSD + "import",
            XSD + "redefine",
            XSD + "override",
        }:
            if directive.get("schemaLocation") is not None:
                return issue(
                    "schema",
                    "Use a self-contained XSD. External schema locations are unavailable.",
                    directive.sourceline,
                )
    try:
        validator = etree.XMLSchema(schema)
    except etree.XMLSchemaParseError as error:
        return diagnostics(error.error_log, "schema", "Invalid XSD 1.0 schema.")
    except OSError:
        return issue("schema", "External XML and XSD resources are unavailable.")

    if validator.validate(document):
        return SchemaResult(valid=True)
    return diagnostics(
        validator.error_log, "xml", "The XML does not satisfy the schema."
    )
