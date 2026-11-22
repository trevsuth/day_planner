import { encodeAttachment, migrateDocument, type StoredAttachment } from "./storage";
import type { AttachedFile, GraphDocument } from "../types/graph";

const workspaceUrl = "/api/graphs/workspace";
const maxAttachmentBytes = 10 * 1024 * 1024;
const maxRequestBytes = 24 * 1024 * 1024;

async function responseError(response: Response): Promise<Error> {
  const fallback = `Graph request failed (${response.status}).`;
  const result = await response.json().catch(() => null);
  return new Error(typeof result?.detail === "string" ? result.detail : fallback);
}

export class HostedGraphStorage {
  private readonly pending = new Map<string, Blob>();
  private conflict = false;

  private constructor(private revision: number) {}

  static async open(signal: AbortSignal) {
    const response = await fetch(workspaceUrl, { signal });
    if (!response.ok) throw await responseError(response);
    const { document, revision } = await response.json();
    return {
      storage: new HostedGraphStorage(revision),
      document: document === null ? null : migrateDocument(document),
    };
  }

  storeFiles = async (files: StoredAttachment[]): Promise<void> => {
    let totalBytes = 0;
    for (const file of files) {
      if (file.blob.size > maxAttachmentBytes) {
        throw new Error(`“${file.name}” is larger than 10 MiB.`);
      }
      totalBytes += Math.ceil(file.blob.size / 3) * 4;
    }
    if (totalBytes >= maxRequestBytes) throw new Error("The backup is too large to import in one save.");
    for (const file of files) this.pending.set(file.key, file.blob);
  };

  storeFile(file: File, attachment: AttachedFile) {
    if (file.size > maxAttachmentBytes) throw new Error("Attachments may be at most 10 MiB.");
    if (!attachment.storageKey) throw new Error("Attachment is missing a storage key.");
    this.pending.set(attachment.storageKey, file);
  }

  loadFile = async (attachment: AttachedFile): Promise<Blob | null> => {
    const key = attachment.storageKey;
    if (!key) return null;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const response = await fetch(`${workspaceUrl}/attachments/${encodeURIComponent(key)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await responseError(response);
    return response.blob();
  };

  async save(document: GraphDocument) {
    if (this.conflict) {
      throw new Error("The graph changed in another browser. Export a backup of your edits, then reload.");
    }
    const files: Record<string, string> = Object.create(null);
    for (const { storageKey } of document.nodes.flatMap((node) => node.attachments)) {
      if (!storageKey || Object.prototype.hasOwnProperty.call(files, storageKey)) continue;
      const file = this.pending.get(storageKey);
      if (file) files[storageKey] = await encodeAttachment(file);
    }
    const body = JSON.stringify({ revision: this.revision, document, files });
    if (new Blob([body]).size > maxRequestBytes) {
      throw new Error("A graph save may be at most 24 MiB.");
    }
    const response = await fetch(workspaceUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (response.status === 409) {
      this.conflict = true;
      throw new Error("The graph changed in another browser. Export a backup of your edits, then reload.");
    }
    if (!response.ok) throw await responseError(response);
    this.revision = (await response.json()).revision;
    for (const key of Object.keys(files)) this.pending.delete(key);
  }
}
