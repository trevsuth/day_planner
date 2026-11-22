"""Run Python regular expressions in a process that can be terminated."""

import itertools
import json
import re
import sys
import warnings


MAX_MATCHES = 200
MAX_GROUPS = 64


def match_pattern(pattern: str, source: str, flags: str) -> dict:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", FutureWarning)
            regex = re.compile(pattern, sum_flag_bits(flags))
    except (re.error, OverflowError, RecursionError) as error:
        return {
            "diagnostic": {
                "message": str(error),
                "line": getattr(error, "lineno", None),
                "column": getattr(error, "colno", None),
            }
        }
    if regex.groups > MAX_GROUPS:
        return {"diagnostic": {"message": f"Use at most {MAX_GROUPS} capture groups."}}
    matches = []
    for match in itertools.islice(regex.finditer(source), MAX_MATCHES + 1):
        if len(matches) == MAX_MATCHES:
            return {
                "matches": matches,
                "group_names": regex.groupindex.copy(),
                "truncated": True,
            }
        matches.append(
            {
                "start": match.start(),
                "end": match.end(),
                "groups": [
                    {"start": start, "end": end} if start >= 0 else None
                    for start, end in match.regs[1:]
                ],
            }
        )
    return {"matches": matches, "group_names": regex.groupindex.copy()}


def sum_flag_bits(flags: str) -> int:
    options = {
        "a": re.ASCII,
        "i": re.IGNORECASE,
        "m": re.MULTILINE,
        "s": re.DOTALL,
        "x": re.VERBOSE,
    }
    bits = 0
    for flag in flags:
        bits |= options[flag]
    return bits


if __name__ == "__main__":
    print(json.dumps(match_pattern(**json.load(sys.stdin))))
