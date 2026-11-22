import { useEffect, useRef, useState } from "react";

const tools = [
  ["document", "Validate & Format"],
  ["characters", "Invisible Characters"],
  ["regex", "Regex Playground"],
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

function Source({ value, onChange, onFile }) {
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
    <label className="validation-file">Open UTF-8 text file <input type="file" onChange={readFile} /></label>
    {error && <p role="alert">{error}</p>}
    <label className="validation-editor">Source text
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
  </section>;
}
