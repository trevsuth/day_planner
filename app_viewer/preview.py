from typing import Literal

from markdown_it import MarkdownIt
from pydantic import BaseModel, Field


MAX_SOURCE_CHARS = 100_000
PreviewMode = Literal["markdown", "mermaid"]

_markdown = MarkdownIt("commonmark", {"html": False})
_markdown.disable("image")


class PreviewRequest(BaseModel):
    source: str = Field(max_length=MAX_SOURCE_CHARS)
    mode: PreviewMode = "markdown"


class Preview(BaseModel):
    html: str
    diagrams: list[str]


def preview_document(request: PreviewRequest) -> Preview:
    """Prepare HTML and Mermaid source without loading any external resources."""
    if request.mode == "mermaid":
        return Preview(
            html='<div data-diagram-index="0"></div>', diagrams=[request.source]
        )

    diagrams = []
    tokens = _markdown.parse(request.source)
    for token in tokens:
        if token.type != "fence":
            continue
        language = token.info.lower().split(maxsplit=1)
        if language and language[0] in {"mermaid", "mmd"}:
            diagram = token.content
            token.type = "html_block"
            token.content = f'<div data-diagram-index="{len(diagrams)}"></div>\n'
            diagrams.append(diagram)
    return Preview(
        html=_markdown.renderer.render(tokens, _markdown.options, {}), diagrams=diagrams
    )
