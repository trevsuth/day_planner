import { useEffect, useState } from "react";
import App from "./App";
import GraphNavigation from "./GraphNavigation";
import { createEmptyDocument } from "./lib/graphOps";
import { HostedGraphStorage } from "./lib/hostedStorage";
import type { GraphDocument } from "./types/graph";

export default function HostedGraph() {
  const [workspace, setWorkspace] = useState<{ storage: HostedGraphStorage; document: GraphDocument }>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    HostedGraphStorage.open(controller.signal).then(({ storage, document }) => {
      if (!controller.signal.aborted) setWorkspace({ storage, document: document ?? createEmptyDocument() });
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Could not open Graph.");
      }
    });
    return () => controller.abort();
  }, [attempt]);

  if (workspace) return <App initialDocument={workspace.document} hostedStorage={workspace.storage} />;
  return (
    <main className="app-shell loading">
      <GraphNavigation />
      <section className="graph-load-status">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button type="button" onClick={() => { setError(""); setAttempt(attempt + 1); }}>Retry</button>
          </>
        ) : <p role="status">Loading Graph…</p>}
      </section>
    </main>
  );
}
