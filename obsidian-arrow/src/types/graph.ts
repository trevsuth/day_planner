export type NodeContentType = "article" | "example" | "dataset" | "note";

export type AttachedFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  storageKey?: string;
  description?: string;
};

export type GraphNode = {
  id: string;
  title: string;
  x: number;
  y: number;
  labels: string[];
  tags: string[];
  content: {
    type: NodeContentType;
    markdown: string;
    sourceData?: unknown;
    updatedAt: string;
  };
  attachments: AttachedFile[];
  style: {
    radius: number;
    fill: string;
    stroke: string;
    textColor: string;
  };
};

export type GraphRelationship = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  properties: Record<string, string | number | boolean>;
  style: {
    stroke: string;
    width: number;
    dashed?: boolean;
  };
};

export type GraphDocument = {
  schemaVersion: 1;
  id: string;
  title: string;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  createdAt: string;
  updatedAt: string;
};

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "nodes"; ids: string[] }
  | { kind: "relationship"; id: string }
  | null;
