import type {
  AttachedFile,
  GraphDocument,
  GraphNode,
  GraphRelationship,
  NodeContentType,
  Selection,
} from "../types/graph";

export type GraphFragment = {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
};

export type RelationshipPreset = {
  type: string;
  label: string;
  style: GraphRelationship["style"];
};

export const relationshipPresets: RelationshipPreset[] = [
  { type: "relates_to", label: "Relates to", style: { stroke: "#20d9ff", width: 2 } },
  { type: "depends_on", label: "Depends on", style: { stroke: "#ffd166", width: 2.5 } },
  { type: "blocks", label: "Blocks", style: { stroke: "#ff5c8a", width: 3, dashed: true } },
  { type: "references", label: "References", style: { stroke: "#69f0ae", width: 2, dashed: true } },
  { type: "contains", label: "Contains", style: { stroke: "#b8a1ff", width: 2.5 } },
];

export type NodeStylePatch = Partial<GraphNode["style"]>;

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function createEmptyDocument(): GraphDocument {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    id: createId("doc"),
    title: "Local Graph Wiki",
    nodes: [],
    relationships: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createNode(
  partial: Partial<Pick<GraphNode, "title" | "x" | "y" | "labels" | "tags">> = {},
): GraphNode {
  const now = new Date().toISOString();

  return {
    id: createId("node"),
    title: partial.title ?? "New node",
    x: partial.x ?? 320,
    y: partial.y ?? 240,
    labels: partial.labels ?? [],
    tags: partial.tags ?? [],
    content: {
      type: "article",
      markdown: "# New article\n\nAdd notes here.",
      updatedAt: now,
    },
    attachments: [],
    style: {
      radius: 44,
      fill: "rgba(8, 22, 38, 0.76)",
      stroke: "#38e8ff",
      textColor: "#e6fbff",
    },
  };
}

export function createRelationship(fromNodeId: string, toNodeId: string): GraphRelationship {
  const preset = relationshipPresets[0];

  return {
    id: createId("rel"),
    fromNodeId,
    toNodeId,
    type: preset.type,
    properties: {},
    style: { ...preset.style },
  };
}

function cloneJsonValue<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function touchDocument(document: GraphDocument): GraphDocument {
  return { ...document, updatedAt: new Date().toISOString() };
}

export function addNode(document: GraphDocument, node: GraphNode): GraphDocument {
  return touchDocument({ ...document, nodes: [...document.nodes, node] });
}

export function updateNode(
  document: GraphDocument,
  nodeId: string,
  updater: (node: GraphNode) => GraphNode,
): GraphDocument {
  return touchDocument({
    ...document,
    nodes: document.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
  });
}

export function moveNode(document: GraphDocument, nodeId: string, x: number, y: number): GraphDocument {
  return updateNode(document, nodeId, (node) => ({ ...node, x, y }));
}

export function moveNodes(
  document: GraphDocument,
  positions: Record<string, { x: number; y: number }>,
): GraphDocument {
  const ids = new Set(Object.keys(positions));
  if (ids.size === 0) {
    return document;
  }

  return touchDocument({
    ...document,
    nodes: document.nodes.map((node) => {
      const position = positions[node.id];
      return position ? { ...node, x: position.x, y: position.y } : node;
    }),
  });
}

export function updateNodesStyle(
  document: GraphDocument,
  nodeIds: string[],
  patch: NodeStylePatch,
): GraphDocument {
  const selectedIds = new Set(nodeIds);
  if (selectedIds.size === 0) {
    return document;
  }

  return touchDocument({
    ...document,
    nodes: document.nodes.map((node) =>
      selectedIds.has(node.id) ? { ...node, style: { ...node.style, ...patch } } : node,
    ),
  });
}

export function addRelationship(
  document: GraphDocument,
  relationship: GraphRelationship,
): GraphDocument {
  if (relationship.fromNodeId === relationship.toNodeId) {
    return document;
  }

  const exists = document.relationships.some(
    (item) =>
      item.fromNodeId === relationship.fromNodeId &&
      item.toNodeId === relationship.toNodeId &&
      item.type === relationship.type,
  );

  if (exists) {
    return document;
  }

  return touchDocument({
    ...document,
    relationships: [...document.relationships, relationship],
  });
}

export function updateRelationship(
  document: GraphDocument,
  relationshipId: string,
  updater: (relationship: GraphRelationship) => GraphRelationship,
): GraphDocument {
  return touchDocument({
    ...document,
    relationships: document.relationships.map((relationship) =>
      relationship.id === relationshipId ? updater(relationship) : relationship,
    ),
  });
}

export function applyRelationshipPreset(
  relationship: GraphRelationship,
  presetType: string,
): GraphRelationship {
  const preset = relationshipPresets.find((item) => item.type === presetType);
  if (!preset) {
    return { ...relationship, type: presetType };
  }

  return {
    ...relationship,
    type: preset.type,
    style: { ...preset.style },
  };
}

export function swapRelationshipDirection(relationship: GraphRelationship): GraphRelationship {
  return {
    ...relationship,
    fromNodeId: relationship.toNodeId,
    toNodeId: relationship.fromNodeId,
  };
}

export function deleteSelection(document: GraphDocument, selection: Selection): GraphDocument {
  if (!selection) {
    return document;
  }

  if (selection.kind === "nodes") {
    const selectedIds = new Set(selection.ids);

    return touchDocument({
      ...document,
      nodes: document.nodes.filter((node) => !selectedIds.has(node.id)),
      relationships: document.relationships.filter(
        (relationship) =>
          !selectedIds.has(relationship.fromNodeId) && !selectedIds.has(relationship.toNodeId),
      ),
    });
  }

  if (selection.kind === "node") {
    return touchDocument({
      ...document,
      nodes: document.nodes.filter((node) => node.id !== selection.id),
      relationships: document.relationships.filter(
        (relationship) =>
          relationship.fromNodeId !== selection.id && relationship.toNodeId !== selection.id,
      ),
    });
  }

  return touchDocument({
    ...document,
    relationships: document.relationships.filter((relationship) => relationship.id !== selection.id),
  });
}

export function getSelectedNodeIds(selection: Selection): string[] {
  if (!selection) {
    return [];
  }

  if (selection.kind === "node") {
    return [selection.id];
  }

  if (selection.kind === "nodes") {
    return selection.ids;
  }

  return [];
}

export function toggleNodeSelection(selection: Selection, nodeId: string): Selection {
  const selectedIds = new Set(getSelectedNodeIds(selection));

  if (selectedIds.has(nodeId)) {
    selectedIds.delete(nodeId);
  } else {
    selectedIds.add(nodeId);
  }

  const ids = [...selectedIds];
  if (ids.length === 0) {
    return null;
  }

  if (ids.length === 1) {
    return { kind: "node", id: ids[0] };
  }

  return { kind: "nodes", ids };
}

export function createFragmentFromSelection(
  document: GraphDocument,
  selection: Selection,
): GraphFragment | null {
  const selectedIds = new Set(getSelectedNodeIds(selection));
  if (selectedIds.size === 0) {
    return null;
  }

  return {
    nodes: document.nodes.filter((node) => selectedIds.has(node.id)),
    relationships: document.relationships.filter(
      (relationship) =>
        selectedIds.has(relationship.fromNodeId) && selectedIds.has(relationship.toNodeId),
    ),
  };
}

export function pasteFragment(
  document: GraphDocument,
  fragment: GraphFragment,
  offset = { x: 56, y: 48 },
): { document: GraphDocument; selection: Selection } {
  const idMap = new Map<string, string>();

  const copiedNodes = fragment.nodes.map((node) => {
    const nextId = createId("node");
    idMap.set(node.id, nextId);

    return {
      ...node,
      id: nextId,
      title: `${node.title} copy`,
      x: node.x + offset.x,
      y: node.y + offset.y,
      labels: [...node.labels],
      tags: [...node.tags],
      content: {
        ...node.content,
        sourceData: cloneJsonValue(node.content.sourceData),
        updatedAt: new Date().toISOString(),
      },
      attachments: node.attachments.map((attachment) => ({
        ...attachment,
        id: createId("file"),
      })),
      style: { ...node.style },
    };
  });

  const copiedRelationships = fragment.relationships.flatMap((relationship) => {
    const fromNodeId = idMap.get(relationship.fromNodeId);
    const toNodeId = idMap.get(relationship.toNodeId);
    if (!fromNodeId || !toNodeId) {
      return [];
    }

    return [
      {
        ...relationship,
        id: createId("rel"),
        fromNodeId,
        toNodeId,
        properties: { ...relationship.properties },
        style: { ...relationship.style },
      },
    ];
  });

  const nextDocument = touchDocument({
    ...document,
    nodes: [...document.nodes, ...copiedNodes],
    relationships: [...document.relationships, ...copiedRelationships],
  });
  const ids = copiedNodes.map((node) => node.id);

  return {
    document: nextDocument,
    selection:
      ids.length === 0 ? null : ids.length === 1 ? { kind: "node", id: ids[0] } : { kind: "nodes", ids },
  };
}

export function duplicateSelection(document: GraphDocument, selection: Selection) {
  const fragment = createFragmentFromSelection(document, selection);
  if (!fragment) {
    return { document, selection };
  }

  return pasteFragment(document, fragment);
}

export function layoutSelectedNodes(
  document: GraphDocument,
  nodeIds: string[],
  mode: "grid" | "circle",
): GraphDocument {
  const selectedIds = new Set(nodeIds);
  const nodes = document.nodes.filter((node) => selectedIds.has(node.id));
  if (nodes.length < 2) {
    return document;
  }

  const center = nodes.reduce(
    (point, node) => ({ x: point.x + node.x / nodes.length, y: point.y + node.y / nodes.length }),
    { x: 0, y: 0 },
  );
  const positions: Record<string, { x: number; y: number }> = {};

  if (mode === "circle") {
    const radius = Math.max(140, nodes.length * 34);
    nodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
      positions[node.id] = {
        x: Math.round(center.x + Math.cos(angle) * radius),
        y: Math.round(center.y + Math.sin(angle) * radius),
      };
    });
  } else {
    const columns = Math.ceil(Math.sqrt(nodes.length));
    const spacingX = 180;
    const spacingY = 140;
    const rows = Math.ceil(nodes.length / columns);
    const startX = center.x - ((columns - 1) * spacingX) / 2;
    const startY = center.y - ((rows - 1) * spacingY) / 2;

    nodes.forEach((node, index) => {
      positions[node.id] = {
        x: Math.round(startX + (index % columns) * spacingX),
        y: Math.round(startY + Math.floor(index / columns) * spacingY),
      };
    });
  }

  return moveNodes(document, positions);
}

export function findOpenNodePosition(
  document: GraphDocument,
  x: number,
  y: number,
  radius = 44,
): { x: number; y: number } {
  const spacing = radius * 2 + 42;
  const collides = (point: { x: number; y: number }) =>
    document.nodes.some((node) => Math.hypot(node.x - point.x, node.y - point.y) < node.style.radius + radius + 28);

  const origin = { x, y };
  if (!collides(origin)) {
    return origin;
  }

  for (let ring = 1; ring <= 12; ring += 1) {
    const candidates = [
      { x: x + spacing * ring, y },
      { x, y: y + spacing * ring },
      { x: x - spacing * ring, y },
      { x, y: y - spacing * ring },
      { x: x + spacing * ring, y: y + spacing * ring },
      { x: x - spacing * ring, y: y + spacing * ring },
      { x: x - spacing * ring, y: y - spacing * ring },
      { x: x + spacing * ring, y: y - spacing * ring },
    ];
    const open = candidates.find((point) => !collides(point));
    if (open) {
      return open;
    }
  }

  return { x: x + spacing * 13, y };
}

export function parseListInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stringifyListInput(values: string[]): string {
  return values.join(", ");
}

export function updateNodeContent(
  node: GraphNode,
  patch: Partial<{ type: NodeContentType; markdown: string; sourceData: unknown }>,
): GraphNode {
  return {
    ...node,
    content: {
      ...node.content,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function createAttachmentFromFile(
  file: File,
  description?: string,
  storageKey = createId("file_bytes"),
): AttachedFile {
  return {
    id: createId("file"),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    createdAt: new Date().toISOString(),
    storageKey,
    description,
  };
}
