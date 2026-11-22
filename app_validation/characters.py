import unicodedata

from app_validation.models import CharacterRequest, CharacterResult, InvisibleCharacter


CONTROL_NAMES = {
    "\x00": "NULL",
    "\x08": "BACKSPACE",
    "\x0b": "VERTICAL TAB",
    "\x0c": "FORM FEED",
    "\x1b": "ESCAPE",
    "\x7f": "DELETE",
}


def scan_characters(request: CharacterRequest) -> CharacterResult:
    """Report invisible characters and remove only explicitly selected findings."""
    selected = set(request.remove_offsets)
    findings = []
    cleaned = []
    line = column = 1
    truncated = False
    previous = ""
    for offset, char in enumerate(request.source):
        suspicious = char not in " \t\r\n" and unicodedata.category(char) in {
            "Cc",
            "Cf",
            "Cs",
            "Zs",
            "Zl",
            "Zp",
        }
        if suspicious:
            if len(findings) < 1_000:
                findings.append(
                    InvisibleCharacter(
                        offset=offset,
                        line=line,
                        column=column,
                        code_point=f"U+{ord(char):04X}",
                        name=unicodedata.name(
                            char,
                            CONTROL_NAMES.get(char, "UNNAMED CONTROL OR SURROGATE"),
                        ),
                    )
                )
            else:
                truncated = True
        if selected and not (suspicious and offset in selected):
            cleaned.append(char)
        if char == "\r" or (char == "\n" and previous != "\r"):
            line, column = line + 1, 1
        elif char != "\n":
            column += 1
        previous = char
    return CharacterResult(
        characters=findings,
        truncated=truncated,
        cleaned="".join(cleaned) if selected else None,
    )
