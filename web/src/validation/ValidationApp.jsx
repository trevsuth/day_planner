import { useEffect, useRef, useState } from "react";

const tools = [
  ["document", "Validate & Format"],
  ["characters", "Invisible Characters"],
  ["regex", "Regex Playground"],
  ["sql", "SQL Translate & Format"],
  ["schema", "JSON Schema"],
  ["xml-schema", "XML Schema"],
  ["config-diff", "Config Diff"],
];
const formats = ["json", "xml", "yaml", "toml"];

async function requestValidation(endpoint, body) {
  const response = await fetch(`/api/validation/${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    const details = Array.isArray(result.detail) ? result.detail.map((item) => item.msg).join(" ") : result.detail;
    throw new Error(details || `Request failed (${response.status}).`);
  }
  return result;
}

function javascriptRegex(body) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./regex.worker.js", import.meta.url), { type: "module" });
    function finish(callback, value) {
      clearTimeout(timeout);
      worker.terminate();
      callback(value);
    }
    const timeout = setTimeout(() => finish(reject, new Error("JavaScript regex exceeded the one-second limit.")), 1000);
    worker.onmessage = ({ data }) => finish(resolve, data);
    worker.onerror = () => finish(reject, new Error("JavaScript regex could not run."));
    worker.postMessage(body);
  });
}

function useResult() {
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);

  function clear() {
    sequence.current++;
    setResult(null);
    setPending(false);
  }

  async function run(action) {
    const current = ++sequence.current;
    setPending(true);
    setResult(null);
    try {
      const next = await action();
      if (current === sequence.current) setResult(next);
    } catch (error) {
      if (current === sequence.current) setResult({ diagnostic: { message: error.message } });
    } finally {
      if (current === sequence.current) setPending(false);
    }
  }

  return { result, pending, clear, run };
}

function Source({ value, onChange, onFile, label = "Source text", fileLabel = "Open UTF-8 text file" }) {
  const [error, setError] = useState("");
  const fileRequest = useRef(0);

  async function readFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const current = ++fileRequest.current;
    try {
      if (file.size > 400_000) throw new Error("Choose a file with at most 100,000 characters.");
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
      if ([...text].length > 100_000) throw new Error("Choose a file with at most 100,000 characters.");
      if (current === fileRequest.current) {
        setError("");
        onChange(text);
        onFile?.(file.name);
      }
    } catch (failure) {
      if (current === fileRequest.current) {
        setError(failure instanceof TypeError ? "This file is not UTF-8 text." : failure.message);
      }
    }
  }

  return <>
    <label className="validation-file">{fileLabel} <input type="file" onChange={readFile} /></label>
    {error && <p role="alert">{error}</p>}
    <label className="validation-editor">{label}
      <textarea spellCheck={false} value={value} onChange={(event) => {
        fileRequest.current++;
        setError("");
        onChange(event.target.value);
      }} />
    </label>
  </>;
}

function Diagnostic({ diagnostic, source }) {
  if (!diagnostic) return null;
  const { message, line, column } = diagnostic;
  const excerpt = Number.isInteger(line) && source !== undefined
    ? source.split(/\r\n|\n|\r/)[line - 1]
    : undefined;
  const start = Math.max(0, (column ?? 1) - 61);
  return <div className="validation-error" role="alert">
    <p>{line ? `Line ${line}${column ? `, column ${column}` : ""} — ` : ""}{message}</p>
    {excerpt !== undefined && <pre>{excerpt.slice(start, start + 160)}{column && `\n${" ".repeat(Math.max(0, column - start - 1))}^`}</pre>}
  </div>;
}

function Output({ value, label, extension }) {
  const [status, setStatus] = useState("");
  function download() {
    const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `validation.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <div className="validation-output">
    <label className="validation-editor">{label}<textarea readOnly value={value} /></label>
    <div className="validation-controls">
      <button className="secondary-button" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setStatus("Copied."); }
        catch { setStatus("Select the output text to copy it."); }
      }}>Copy</button>
      <button className="secondary-button" type="button" onClick={download}>Download</button>
      <span aria-live="polite">{status}</span>
    </div>
  </div>;
}

function Documents() {
  const [source, setSource] = useState("");
  const [format, setFormat] = useState("json");
  const job = useResult();
  function run(pretty) {
    job.run(() => requestValidation("document", { format, source, pretty }));
  }
  return <>
    <label>Format <select aria-label="Format" value={format} onChange={(event) => { setFormat(event.target.value); job.clear(); }}>
      {formats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
    </select></label>
    <Source value={source} onChange={(text) => { setSource(text); job.clear(); }} onFile={(name) => {
      const extension = name.split(".").at(-1).toLowerCase();
      if (extension === "yml") setFormat("yaml");
      else if (formats.includes(extension)) setFormat(extension);
    }} />
    <div className="validation-controls">
      <button className="secondary-button" type="button" disabled={job.pending} onClick={() => run(false)}>Validate</button>
      <button className="secondary-button" type="button" disabled={job.pending} onClick={() => run(true)}>Format document</button>
      {job.result?.valid && <span role="status">Valid {format.toUpperCase()}</span>}
    </div>
    <Diagnostic diagnostic={job.result?.diagnostic} source={source} />
    {job.result?.formatted != null && <Output value={job.result.formatted} label="Formatted output" extension={format} />}
  </>;
}

function InvisiblePreview({ source, findings }) {
  const characters = Array.from(source);
  let start = 0;
  const parts = [];
  for (const item of findings) {
    parts.push(characters.slice(start, item.offset).join(""));
    parts.push(<mark key={item.offset} title={item.name}>⟦{item.code_point}⟧</mark>);
    start = item.offset + 1;
  }
  parts.push(characters.slice(start).join(""));
  return <details>
    <summary>Show markers in source</summary>
    <pre className="validation-highlight" aria-label="Source with invisible character markers">{parts}</pre>
  </details>;
}

function Characters() {
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState([]);
  const job = useResult();
  const findings = job.result?.characters ?? [];
  function scan(offsets) {
    job.run(() => requestValidation("characters", { source, remove_offsets: offsets }));
  }
  return <>
    <Source value={source} onChange={(text) => { setSource(text); setSelected([]); job.clear(); }} />
    <div className="validation-controls">
      <button className="secondary-button" type="button" disabled={job.pending} onClick={() => { setSelected([]); scan([]); }}>Show invisible characters</button>
      {findings.length > 0 && <>
        <button className="secondary-button" type="button" onClick={() => setSelected(findings.map((item) => item.offset))}>Select displayed</button>
        <button className="secondary-button" type="button" disabled={!selected.length || job.pending} onClick={() => scan(selected)}>Preview removal</button>
      </>}
    </div>
    <Diagnostic diagnostic={job.result?.diagnostic} />
    {job.result?.characters && <p role="status">
      {findings.length ? `${findings.length} invisible character(s) shown.` : "No invisible characters found."}
      {job.result.truncated ? " Only the first 1,000 are shown." : ""}
    </p>}
    {findings.length > 0 && <InvisiblePreview source={source} findings={findings} />}
    {findings.length > 0 && <ul className="validation-findings">
      {findings.map((item) => <li key={item.offset}><label>
        <input type="checkbox" checked={selected.includes(item.offset)} onChange={(event) => {
          const checked = event.target.checked;
          setSelected((current) => checked ? [...current, item.offset] : current.filter((offset) => offset !== item.offset));
        }} />
        <code>{item.code_point}</code> {item.name} at line {item.line}, column {item.column}
      </label></li>)}
    </ul>}
    {job.result?.cleaned != null && <Output value={job.result.cleaned} label="Cleaned preview" extension="txt" />}
  </>;
}

function RegexMatches({ result, source, dialect }) {
  if (!result?.matches || result.diagnostic) return null;
  const offsets = [0];
  if (dialect === "python") {
    for (const character of source) offsets.push(offsets.at(-1) + character.length);
  }
  const index = (offset) => dialect === "python" ? offsets[offset] : offset;
  const slice = ({ start, end }) => source.slice(index(start), index(end));
  function captureText(span) {
    const start = index(span.start);
    const end = index(span.end);
    return JSON.stringify(source.slice(start, Math.min(end, start + 200))) + (end - start > 200 ? "…" : "");
  }
  const parts = [];
  let cursor = 0;
  for (const [number, match] of result.matches.entries()) {
    parts.push(source.slice(index(cursor), index(match.start)));
    parts.push(<mark key={number}>{slice(match) || <span title="Zero-width match">│</span>}</mark>);
    cursor = match.end;
  }
  parts.push(source.slice(index(cursor)));
  const names = Object.fromEntries(Object.entries(result.group_names).map(([name, group]) => [group, name]));
  return <>
    <p role="status">{result.matches.length} match(es){result.truncated ? " shown; more matches were found." : "."}</p>
    <pre className="validation-highlight" aria-label="Highlighted matches">{parts}</pre>
    {result.matches.length > 0 && <details><summary>Match positions and capture groups</summary>
      <ol className="validation-findings">{result.matches.map((match, number) => <li key={number}>
        <code>{match.start}–{match.end}</code>
        {match.groups.length > 0 && <ul>{match.groups.map((group, id) => <li key={id}>
          {names[id + 1] ?? `Group ${id + 1}`}: <code>{group ? captureText(group) : "unmatched"}</code>
        </li>)}</ul>}
      </li>)}</ol>
    </details>}
  </>;
}

function RegexPlayground() {
  const [source, setSource] = useState("");
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("");
  const [dialect, setDialect] = useState("python");
  const job = useResult();
  return <form className="validation-regex" onSubmit={(event) => {
    event.preventDefault();
    const body = { pattern, flags, source };
    job.run(() => {
      if ([...source].length > 100_000) throw new Error("Use at most 100,000 characters of source text.");
      return dialect === "python" ? requestValidation("regex", body) : javascriptRegex(body);
    });
  }}>
    <div className="validation-controls">
      <label>Regex dialect <select aria-label="Regex dialect" value={dialect} onChange={(event) => {
        setDialect(event.target.value); setFlags(""); job.clear();
      }}><option value="python">Python</option><option value="javascript">JavaScript</option></select></label>
      <label>Flags <input value={flags} maxLength={8} placeholder={dialect === "python" ? "aimsx" : "imsuvy"} onChange={(event) => {
        setFlags(event.target.value); job.clear();
      }} /></label>
    </div>
    <label className="validation-editor">Pattern
      <textarea className="validation-pattern" spellCheck={false} maxLength={2000} value={pattern} onChange={(event) => {
        setPattern(event.target.value); job.clear();
      }} />
    </label>
    <Source value={source} onChange={(text) => { setSource(text); job.clear(); }} />
    <button className="secondary-button" disabled={job.pending} type="submit">Find matches</button>
    <Diagnostic diagnostic={job.result?.diagnostic} source={pattern} />
    <RegexMatches result={job.result} source={source} dialect={dialect} />
  </form>;
}

const sqlDialects = [
  ["postgres", "PostgreSQL"], ["sqlite", "SQLite"], ["duckdb", "DuckDB"],
  ["mysql", "MySQL"], ["snowflake", "Snowflake"], ["bigquery", "Google BigQuery"],
];

function SqlTools() {
  const [source, setSource] = useState("");
  const [sourceDialect, setSourceDialect] = useState("postgres");
  const [targetDialect, setTargetDialect] = useState("bigquery");
  const job = useResult();

  function run(translate) {
    job.run(() => requestValidation("sql", {
      source, source_dialect: sourceDialect,
      target_dialect: translate ? targetDialect : null,
    }));
  }

  return <>
    <div className="validation-controls">
      <label>Source dialect <select aria-label="Source dialect" value={sourceDialect} onChange={(event) => {
        setSourceDialect(event.target.value); job.clear();
      }}>{sqlDialects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Target dialect <select aria-label="Target dialect" value={targetDialect} onChange={(event) => {
        setTargetDialect(event.target.value); job.clear();
      }}>{sqlDialects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    <div className="validation-comparison">
      <div className="validation-comparison-pane">
        <Source value={source} onChange={(text) => { setSource(text); job.clear(); }} />
        <div className="validation-controls">
          <button className="secondary-button" type="button" disabled={job.pending} onClick={() => run(false)}>Format SQL</button>
          <button className="secondary-button" type="button" disabled={job.pending} onClick={() => run(true)}>Translate SQL</button>
        </div>
      </div>
      {job.result?.formatted != null && <Output value={job.result.formatted} label="SQL output" extension="sql" />}
    </div>
    <Diagnostic diagnostic={job.result?.diagnostic} source={source} />
    {job.result?.warnings?.length > 0 && <ul className="validation-findings" aria-label="SQL translation warnings">
      {job.result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
    </ul>}
  </>;
}

function SchemaTools({ xml = false }) {
  const kind = xml ? "XML" : "JSON";
  const [source, setSource] = useState("");
  const [schema, setSchema] = useState("");
  const job = useResult();
  return <>
    <div className="validation-comparison">
      <div className="validation-comparison-pane">
        <Source value={source} onChange={(text) => { setSource(text); job.clear(); }} />
      </div>
      <div className="validation-comparison-pane">
        <Source value={schema} onChange={(text) => { setSchema(text); job.clear(); }}
          label={xml ? "XML Schema (XSD 1.0)" : "JSON Schema (Draft 2020-12)"}
          fileLabel={xml ? "Open XSD file" : "Open JSON Schema file"} />
      </div>
    </div>
    <div className="validation-controls">
      <button className="secondary-button" type="button" disabled={job.pending} onClick={() => {
        job.run(() => requestValidation(xml ? "xml-schema" : "schema", { source, schema_source: schema }));
      }}>Check against schema</button>
      {job.result?.valid && <span role="status">{kind} satisfies the schema.</span>}
    </div>
    <Diagnostic diagnostic={job.result?.diagnostic} />
    {job.result?.issues?.length > 0 && <ul className="validation-findings">
      {job.result.issues.map((issue, index) => <li key={index}>
        <strong>{issue.document === "schema" ? "Schema" : kind}</strong>{" "}<code>{issue.path}</code>
        <Diagnostic diagnostic={issue} source={issue.document === "schema" ? schema : source} />
      </li>)}
    </ul>}
    {job.result?.truncated && <p role="status">Only the first 50 issues are shown.</p>}
  </>;
}

function ConfigDiff() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [format, setFormat] = useState("json");
  const [changesOnly, setChangesOnly] = useState(false);
  const job = useResult();
  const result = job.result;

  return <>
    <label>Format <select aria-label="Config format" value={format} onChange={(event) => {
      setFormat(event.target.value); job.clear();
    }}><option value="json">JSON</option><option value="yaml">YAML</option></select></label>
    <div className="validation-comparison">
      <div className="validation-comparison-pane">
        <Source label="Before" fileLabel="Open before file" value={left}
          onChange={(value) => { setLeft(value); job.clear(); }} />
      </div>
      <div className="validation-comparison-pane">
        <Source label="After" fileLabel="Open after file" value={right}
          onChange={(value) => { setRight(value); job.clear(); }} />
      </div>
    </div>
    <div className="validation-controls">
      <button className="secondary-button" type="button" disabled={job.pending} onClick={() => {
        job.run(() => requestValidation("config-diff", { format, left, right }));
      }}>Compare configs</button>
      {result && !result.diagnostic && <label><input type="checkbox" checked={changesOnly}
        onChange={(event) => setChangesOnly(event.target.checked)} /> Hide unchanged lines</label>}
    </div>
    {result?.side && <strong>{result.side === "left" ? "Before" : "After"}</strong>}
    <Diagnostic diagnostic={result?.diagnostic} source={result?.side === "left" ? left : right} />
    {result && !result.diagnostic && <>
      <p role="status">{result.changed ? `${result.changed} changed line(s).` : "No differences after formatting."}</p>
      <div className="config-diff-scroll">
        <table className="config-diff">
          <caption>Formatted comparison</caption>
          <thead><tr><th scope="col">Before</th><th scope="col">After</th></tr></thead>
          <tbody>{result.rows.map((row, index) => changesOnly && row.kind === "equal" ? null : <tr key={index} className={`diff-${row.kind}`}>
            <td><span>{row.left_line}</span><code>{row.kind === "replace" || row.kind === "delete" ? "− " : "  "}{row.left}</code></td>
            <td><span>{row.right_line}</span><code>{row.kind === "replace" || row.kind === "insert" ? "+ " : "  "}{row.right}</code></td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </>;
}

export function ValidationApp() {
  const [tool, setTool] = useState("document");
  return <section className="validation api-panel">
    <h1>Validation</h1>
    <nav className="validation-controls" aria-label="Validation tools">
      {tools.map(([id, label]) => <button className="secondary-button" key={id} type="button"
        aria-pressed={tool === id} onClick={() => setTool(id)}>{label}</button>)}
    </nav>
    <div className="validation-tool" hidden={tool !== "document"}><Documents /></div>
    <div className="validation-tool" hidden={tool !== "characters"}><Characters /></div>
    <div className="validation-tool" hidden={tool !== "regex"}><RegexPlayground /></div>
    <div className="validation-tool" hidden={tool !== "sql"}><SqlTools /></div>
    <div className="validation-tool" hidden={tool !== "schema"}><SchemaTools /></div>
    <div className="validation-tool" hidden={tool !== "xml-schema"}><SchemaTools xml /></div>
    <div className="validation-tool" hidden={tool !== "config-diff"}><ConfigDiff /></div>
  </section>;
}
