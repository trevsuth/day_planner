import sqlglot
from sqlglot import exp
from sqlglot.errors import ErrorLevel, ParseError, SqlglotError

from app_validation.models import Diagnostic, SqlRequest, SqlResult


def translate_sql(request: SqlRequest) -> SqlResult:
    """Parse and generate SQL text using the requested dialects."""
    output_dialect = request.target_dialect or request.source_dialect
    try:
        statements = [
            statement
            for statement in sqlglot.parse(
                request.source, read=request.source_dialect, error_message_context=0
            )
            if statement is not None
        ]
        if not statements:
            return SqlResult(diagnostic=Diagnostic(message="Enter a SQL statement."))
        if any(isinstance(statement, exp.Command) for statement in statements):
            return SqlResult(
                diagnostic=Diagnostic(
                    message="This statement is unsupported by the SQL parser."
                )
            )
        output = []
        for statement in statements:
            sql = statement.sql(
                dialect=output_dialect, pretty=True, unsupported_level=ErrorLevel.RAISE
            )
            output.append(sql if isinstance(statement, exp.Semicolon) else sql + ";")
    except ParseError as error:
        detail = error.errors[0] if error.errors else {}
        return SqlResult(
            diagnostic=Diagnostic(
                message=detail.get("description", str(error)),
                line=detail.get("line"),
                column=detail.get("col"),
            )
        )
    except SqlglotError as error:
        return SqlResult(diagnostic=Diagnostic(message=str(error)))
    except RecursionError:
        return SqlResult(
            diagnostic=Diagnostic(message="The SQL statement is nested too deeply.")
        )
    warnings = []
    if output_dialect != request.source_dialect:
        unknown = sorted(
            {
                function.name.upper()
                for statement in statements
                for function in statement.find_all(exp.Anonymous)
            }
        )
        if unknown:
            warnings.append(
                f"Review function compatibility in the target dialect: {', '.join(unknown)}."
            )
    return SqlResult(formatted="\n\n".join(output) + "\n", warnings=warnings)
