import type { AttachedFile, GraphDocument, GraphNode, GraphRelationship } from "../types/graph";
import { createEmptyDocument } from "./graphOps";

const DOCUMENT_SCHEMA_VERSION = 1 as const;
const STORAGE_KEY = "local-graph-wiki.document.v1";
const ATTACHMENT_DB_NAME = "local-graph-wiki.attachments";
const ATTACHMENT_DB_VERSION = 1;
const ATTACHMENT_STORE_NAME = "files";

type StoredDocument = Omit<GraphDocument, "schemaVersion"> & {
  schemaVersion?: number;
};

type StoredAttachment = {
  key: string;
  blob: Blob;
  name: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: string;
};

export type SaveResult = {
  savedAt: string;
};

export interface StorageRepository {
  loadDocument(): GraphDocument;
  saveDocument(document: GraphDocument): SaveResult;
  clearDocument(): void;
  saveAttachment(file: File, attachment: AttachedFile): Promise<void>;
  loadAttachment(attachment: AttachedFile): Promise<Blob | null>;
  deleteAttachment(attachment: AttachedFile): Promise<void>;
}

export interface AsyncStorageRepository {
  loadDocument(): Promise<GraphDocument>;
  saveDocument(document: GraphDocument): Promise<SaveResult>;
  clearDocument(): Promise<void>;
  saveAttachment(file: File, attachment: AttachedFile): Promise<void>;
  loadAttachment(attachment: AttachedFile): Promise<Blob | null>;
  deleteAttachment(attachment: AttachedFile): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid graph document: ${field} must be a string.`);
  }

  return value;
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid graph document: ${field} must be a number.`);
  }

  return value;
}

function normalizeStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid graph document: ${field} must be an array.`);
  }

  return value.map((item, index) => assertString(item, `${field}[${index}]`));
}

function normalizeContentType(value: unknown, field: string): GraphNode["content"]["type"] {
  if (value === "article" || value === "example" || value === "dataset" || value === "note") {
    return value;
  }

  throw new Error(`Invalid graph document: ${field} is not a supported content type.`);
}

function normalizeRelationshipProperties(
  value: Record<string, unknown>,
  field: string,
): GraphRelationship["properties"] {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        return [key, item];
      }

      throw new Error(`Invalid graph document: ${field}.${key} must be a string, number, or boolean.`);
    }),
  );
}

function normalizeAttachment(value: unknown, index: number): AttachedFile {
  if (!isRecord(value)) {
    throw new Error(`Invalid graph document: attachments[${index}] must be an object.`);
  }

  const attachment: AttachedFile = {
    id: assertString(value.id, `attachments[${index}].id`),
    name: assertString(value.name, `attachments[${index}].name`),
    mimeType: assertString(value.mimeType, `attachments[${index}].mimeType`),
    sizeBytes: assertNumber(value.sizeBytes, `attachments[${index}].sizeBytes`),
    createdAt: assertString(value.createdAt, `attachments[${index}].createdAt`),
  };

  if (typeof value.storageKey === "string") {
    attachment.storageKey = value.storageKey;
  }

  if (typeof value.description === "string") {
    attachment.description = value.description;
  }

  return attachment;
}

function normalizeNode(value: unknown, index: number): GraphNode {
  if (!isRecord(value)) {
    throw new Error(`Invalid graph document: nodes[${index}] must be an object.`);
  }

  if (!isRecord(value.content)) {
    throw new Error(`Invalid graph document: nodes[${index}].content must be an object.`);
  }

  if (!isRecord(value.style)) {
    throw new Error(`Invalid graph document: nodes[${index}].style must be an object.`);
  }

  return {
    id: assertString(value.id, `nodes[${index}].id`),
    title: assertString(value.title, `nodes[${index}].title`),
    x: assertNumber(value.x, `nodes[${index}].x`),
    y: assertNumber(value.y, `nodes[${index}].y`),
    labels: normalizeStringList(value.labels, `nodes[${index}].labels`),
    tags: normalizeStringList(value.tags, `nodes[${index}].tags`),
    content: {
      type: normalizeContentType(value.content.type, `nodes[${index}].content.type`),
      markdown: assertString(value.content.markdown, `nodes[${index}].content.markdown`),
      sourceData: value.content.sourceData,
      updatedAt: assertString(value.content.updatedAt, `nodes[${index}].content.updatedAt`),
    },
    attachments: Array.isArray(value.attachments)
      ? value.attachments.map(normalizeAttachment)
      : [],
    style: {
      radius: assertNumber(value.style.radius, `nodes[${index}].style.radius`),
      fill: assertString(value.style.fill, `nodes[${index}].style.fill`),
      stroke: assertString(value.style.stroke, `nodes[${index}].style.stroke`),
      textColor: assertString(value.style.textColor, `nodes[${index}].style.textColor`),
    },
  };
}

function normalizeRelationship(value: unknown, index: number): GraphRelationship {
  if (!isRecord(value)) {
    throw new Error(`Invalid graph document: relationships[${index}] must be an object.`);
  }

  if (!isRecord(value.style)) {
    throw new Error(`Invalid graph document: relationships[${index}].style must be an object.`);
  }

  if (!isRecord(value.properties)) {
    throw new Error(`Invalid graph document: relationships[${index}].properties must be an object.`);
  }

  return {
    id: assertString(value.id, `relationships[${index}].id`),
    fromNodeId: assertString(value.fromNodeId, `relationships[${index}].fromNodeId`),
    toNodeId: assertString(value.toNodeId, `relationships[${index}].toNodeId`),
    type: assertString(value.type, `relationships[${index}].type`),
    properties: normalizeRelationshipProperties(
      value.properties as Record<string, unknown>,
      `relationships[${index}].properties`,
    ),
    style: {
      stroke: assertString(value.style.stroke, `relationships[${index}].style.stroke`),
      width: assertNumber(value.style.width, `relationships[${index}].style.width`),
      dashed: typeof value.style.dashed === "boolean" ? value.style.dashed : undefined,
    },
  };
}

export function migrateDocument(value: unknown): GraphDocument {
  if (!isRecord(value)) {
    throw new Error("Imported JSON does not look like a graph document.");
  }

  const stored = value as StoredDocument;
  if (stored.schemaVersion && stored.schemaVersion > DOCUMENT_SCHEMA_VERSION) {
    throw new Error(`This document uses schema version ${stored.schemaVersion}, which this app cannot read.`);
  }

  if (!Array.isArray(stored.nodes) || !Array.isArray(stored.relationships)) {
    throw new Error("Imported JSON does not look like a graph document.");
  }

  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: assertString(stored.id, "id"),
    title: typeof stored.title === "string" ? stored.title : "Local Graph Wiki",
    nodes: stored.nodes.map(normalizeNode),
    relationships: stored.relationships.map(normalizeRelationship),
    createdAt: assertString(stored.createdAt, "createdAt"),
    updatedAt: assertString(stored.updatedAt, "updatedAt"),
  };
}

function openAttachmentDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ATTACHMENT_DB_NAME, ATTACHMENT_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) {
        database.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open attachment storage."));
  });
}

function runAttachmentTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openAttachmentDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(ATTACHMENT_STORE_NAME, mode);
        const store = transaction.objectStore(ATTACHMENT_STORE_NAME);
        const request = action(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Attachment storage request failed."));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("Attachment storage transaction failed."));
        };
      }),
  );
}

function getAttachmentStorageKey(attachment: AttachedFile): string | null {
  return attachment.storageKey ?? null;
}

export class BrowserStorageRepository implements StorageRepository {
  loadDocument(): GraphDocument {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyDocument();
    }

    try {
      return migrateDocument(JSON.parse(raw));
    } catch (error) {
      console.warn("Could not parse saved graph document.", error);
      return createEmptyDocument();
    }
  }

  saveDocument(document: GraphDocument): SaveResult {
    const savedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...document, schemaVersion: DOCUMENT_SCHEMA_VERSION }));
    return { savedAt };
  }

  clearDocument(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  async saveAttachment(file: File, attachment: AttachedFile): Promise<void> {
    const key = getAttachmentStorageKey(attachment);
    if (!key) {
      throw new Error("Attachment is missing a storage key.");
    }

    await runAttachmentTransaction("readwrite", (store) =>
      store.put({
        key,
        blob: file,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        updatedAt: new Date().toISOString(),
      } satisfies StoredAttachment),
    );
  }

  async loadAttachment(attachment: AttachedFile): Promise<Blob | null> {
    const key = getAttachmentStorageKey(attachment);
    if (!key) {
      return null;
    }

    const stored = await runAttachmentTransaction<StoredAttachment | undefined>("readonly", (store) =>
      store.get(key),
    );

    return stored?.blob ?? null;
  }

  async deleteAttachment(attachment: AttachedFile): Promise<void> {
    const key = getAttachmentStorageKey(attachment);
    if (!key) {
      return;
    }

    await runAttachmentTransaction("readwrite", (store) => store.delete(key));
  }
}

export const browserStorageRepository = new BrowserStorageRepository();

export function loadDocument(repository: StorageRepository = browserStorageRepository): GraphDocument {
  return repository.loadDocument();
}

export function saveDocument(
  document: GraphDocument,
  repository: StorageRepository = browserStorageRepository,
): SaveResult {
  return repository.saveDocument(document);
}

export function clearSavedDocument(repository: StorageRepository = browserStorageRepository): void {
  repository.clearDocument();
}

export function saveAttachmentFile(
  file: File,
  attachment: AttachedFile,
  repository: StorageRepository = browserStorageRepository,
): Promise<void> {
  return repository.saveAttachment(file, attachment);
}

export function loadAttachmentFile(
  attachment: AttachedFile,
  repository: StorageRepository = browserStorageRepository,
): Promise<Blob | null> {
  return repository.loadAttachment(attachment);
}

export function deleteAttachmentFile(
  attachment: AttachedFile,
  repository: StorageRepository = browserStorageRepository,
): Promise<void> {
  return repository.deleteAttachment(attachment);
}

export function exportDocument(document: GraphDocument): string {
  return JSON.stringify({ ...document, schemaVersion: DOCUMENT_SCHEMA_VERSION }, null, 2);
}

export function importDocument(raw: string): GraphDocument {
  return migrateDocument(JSON.parse(raw));
}
