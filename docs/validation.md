# Validation

Open **Validation** in Day Planner. Each tool keeps its draft while you switch
between tools. Paste text or open a UTF-8 file. Formatting and cleanup produce
separate previews that you can copy or download.

- **Validate & Format** checks JSON, XML, YAML, and TOML syntax. Errors show a
  line and column when the parser provides one. JSON formatting preserves number
  and string spellings. YAML and TOML formatting preserves comments and key
  order. XML preserves existing text and mixed content. The XML parser rejects
  DTDs and custom entity declarations.
- **Invisible Characters** finds control characters, formatting characters,
  unusual spaces, and Unicode line and paragraph separators. Tabs, ordinary
  spaces, and CR/LF are kept. Review the marked source or select individual
  findings to preview their removal.
- **Regex Playground** starts with Python's standard `re` syntax. Switch to
  JavaScript for browser regexes. Enter a pattern without slash delimiters.
  Matches include zero-width positions and captures. Python supports
  `a`, `i`, `m`, `s`, and `x`, plus inline flags. JavaScript finds all
  matches and uses a browser worker. Either runner stops after one second.

Document checks, character inspection, and Python regex send the input to
your Day Planner API. The API processes it in memory. JavaScript regex runs
in the browser. Sources have a 100,000-character limit, regex patterns a
2,000-character limit, and match results a 200-match limit.

## API and MCP

| HTTP endpoint | MCP tool | Main inputs |
| --- | --- | --- |
| `POST /api/validation/document` | `validate_document` | `format`, `source`, optional `pretty` |
| `POST /api/validation/characters` | `inspect_invisible_characters` | `source`, optional `remove_offsets` |
| `POST /api/validation/regex` | `find_python_regex_matches` | `pattern`, `source`, optional `flags` |

HTTP accepts a JSON body containing the main inputs. MCP takes those same
inputs under `request`. Syntax errors and regex timeouts return a structured
`diagnostic`. Locations are 1-based. Character offsets and Python regex spans
are zero-based Unicode code-point offsets. Match ends are exclusive.
Unmatched captures are null.

See the suite's API Reference or `/docs` for request and response schemas and
the [MCP setup guide](mcp.md) for client configuration.
