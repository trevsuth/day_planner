import type { AttachedFile, GraphDocument } from "../types/graph";
import type { AsyncStorageRepository, SaveResult } from "./storage";
import { migrateDocument } from "./storage";

type TauriCommandBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type StoredFilePayload = {
  bytes: number[];
  mimeType: string;
};

function getTauriBridge(): TauriCommandBridge | null {
  const candidate = (globalThis as { __TAURI_INTERNALS__?: TauriCommandBridge }).__TAURI_INTERNALS__;
  return candidate && typeof candidate.invoke === "function" ? candidate : null;
}

function requireStorageKey(attachment: AttachedFile): string {
  if (!attachment.storageKey) {
    throw new Error("Attachment is missing a filesystem storage key.");
  }

  return attachment.storageKey;
}

export class TauriStorageRepository implements AsyncStorageRepository {
  constructor(private readonly bridge: TauriCommandBridge) {}

  async loadDocument(): Promise<GraphDocument> {
    const document = await this.bridge.invoke<unknown>("load_document");
    return migrateDocument(document);
  }

  async saveDocument(document: GraphDocument): Promise<SaveResult> {
    const savedAt = new Date().toISOString();
    await this.bridge.invoke("save_document", { document: { ...document, schemaVersion: 1 } });
    return { savedAt };
  }

  async clearDocument(): Promise<void> {
    await this.bridge.invoke("clear_document");
  }

  async saveAttachment(file: File, attachment: AttachedFile): Promise<void> {
    const storageKey = requireStorageKey(attachment);
    const bytes = [...new Uint8Array(await file.arrayBuffer())];
    await this.bridge.invoke("save_attachment_file", {
      storageKey,
      name: attachment.name,
      mimeType: attachment.mimeType,
      bytes,
    });
  }

  async loadAttachment(attachment: AttachedFile): Promise<Blob | null> {
    const storageKey = attachment.storageKey;
    if (!storageKey) {
      return null;
    }

    const payload = await this.bridge.invoke<StoredFilePayload | null>("load_attachment_file", {
      storageKey,
    });
    if (!payload) {
      return null;
    }

    return new Blob([new Uint8Array(payload.bytes)], { type: payload.mimeType });
  }

  async deleteAttachment(attachment: AttachedFile): Promise<void> {
    const storageKey = attachment.storageKey;
    if (!storageKey) {
      return;
    }

    await this.bridge.invoke("delete_attachment_file", { storageKey });
  }
}

export function createTauriStorageRepository(
  bridge: TauriCommandBridge | null = getTauriBridge(),
): TauriStorageRepository | null {
  return bridge ? new TauriStorageRepository(bridge) : null;
}

