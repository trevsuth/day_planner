from difflib import SequenceMatcher

from app_validation.documents import process_document
from app_validation.models import (
    ConfigDiffRequest,
    ConfigDiffResult,
    Diagnostic,
    DiffRow,
    DocumentRequest,
)


MAX_LINES = 1_000


def compare_configs(request: ConfigDiffRequest) -> ConfigDiffResult:
    sides = []
    for side, source in (("left", request.left), ("right", request.right)):
        normalized = process_document(
            DocumentRequest(format=request.format, source=source, pretty=True)
        )
        if normalized.diagnostic is not None:
            return ConfigDiffResult(side=side, diagnostic=normalized.diagnostic)
        sides.append((normalized.formatted or "").splitlines())
    left, right = sides
    if max(len(left), len(right)) > MAX_LINES:
        return ConfigDiffResult(
            diagnostic=Diagnostic(
                message=f"Compare configurations with up to {MAX_LINES:,} formatted lines per side."
            )
        )

    rows = []
    matcher = SequenceMatcher(None, left, right, autojunk=False)
    for kind, left_start, left_end, right_start, right_end in matcher.get_opcodes():
        for offset in range(max(left_end - left_start, right_end - right_start)):
            left_index = left_start + offset
            right_index = right_start + offset
            rows.append(
                DiffRow(
                    kind=kind,
                    left=left[left_index] if left_index < left_end else None,
                    right=right[right_index] if right_index < right_end else None,
                    left_line=left_index + 1 if left_index < left_end else None,
                    right_line=right_index + 1 if right_index < right_end else None,
                )
            )
    return ConfigDiffResult(rows=rows, changed=sum(row.kind != "equal" for row in rows))
