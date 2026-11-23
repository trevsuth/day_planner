import { useEffect, useRef, useState } from "react";
import { request } from "../api/client";

const modules = { planner: "Planner", projects: "Projects", graph: "Graph" };

function resultUrl(hit) {
  const id = encodeURIComponent(hit.id);
  if (hit.module === "planner") return `/?date=${id}`;
  if (hit.module === "projects") return `/?view=projects&card=${id}`;
  return `/graph/?node=${id}`;
}

export function SearchApp({ focusRequest }) {
  const input = useRef(null);
  const activeRequest = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => input.current?.focus(), [focusRequest]);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function search(event) {
    event.preventDefault();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setError("");
    setResults(null);
    setPending(true);
    try {
      const hits = await request(`/api/search?${new URLSearchParams({ q: query.trim() })}`, { signal: controller.signal });
      if (!controller.signal.aborted) setResults(hits);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return <section className="validation api-panel">
    <h1>Search</h1>
    <form className="validation-controls" onSubmit={search}>
      <label>Search Planner, Projects, and Graph{" "}
        <input type="search" maxLength={100} ref={input} value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button className="secondary-button" type="submit" disabled={query.trim().length < 2 || pending}>Search</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {pending && <p role="status">Searching…</p>}
    {results?.length === 0 && <p role="status">No matches found.</p>}
    {results?.length > 0 && <ul className="suite-search-results">
      {results.map((hit) => <li key={`${hit.module}:${hit.id}`}>
        <span>{modules[hit.module]}</span>
        <a href={resultUrl(hit)}>{hit.title}</a>
        {hit.excerpt && <p>{hit.excerpt}</p>}
      </li>)}
    </ul>}
  </section>;
}
