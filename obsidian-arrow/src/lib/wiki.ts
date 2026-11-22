import type { GraphDocument, GraphNode, NodeContentType } from "../types/graph";

export type WikiLink = {
  label: string;
  targetTitle: string;
  targetNode?: GraphNode;
};

export type ActivityItem = {
  id: string;
  label: string;
  timestamp: string;
};

export const nodeTemplates: Record<NodeContentType, string> = {
  article: "# Article\n\n## Summary\n\n## Details\n\n## Related\n- [[Node title]]",
  example: "# Example\n\n## Context\n\n## Steps\n1. \n\n## Result\n",
  dataset: "# Dataset\n\n## Source\n\n## Fields\n- name: description\n\n## Notes\n",
  note: "# Note\n\n## Observation\n\n## Follow-up\n",
};

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

export function findNodeByTitle(nodes: GraphNode[], title: string): GraphNode | undefined {
  const normalized = normalizeTitle(title);
  return nodes.find((node) => normalizeTitle(node.title) === normalized);
}

export function extractWikiLinks(markdown: string, nodes: GraphNode[]): WikiLink[] {
  const links: WikiLink[] = [];
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    const targetTitle = match[1].trim();
    const label = (match[2] ?? targetTitle).trim();
    links.push({
      label,
      targetTitle,
      targetNode: findNodeByTitle(nodes, targetTitle),
    });
  }

  return links;
}

export function getOutboundLinks(node: GraphNode, nodes: GraphNode[]): WikiLink[] {
  return extractWikiLinks(node.content.markdown, nodes);
}

export function getBacklinks(document: GraphDocument, nodeId: string): GraphNode[] {
  const target = document.nodes.find((node) => node.id === nodeId);
  if (!target) {
    return [];
  }

  return document.nodes.filter((node) => {
    if (node.id === nodeId) {
      return false;
    }

    return extractWikiLinks(node.content.markdown, document.nodes).some(
      (link) => link.targetNode?.id === nodeId || normalizeTitle(link.targetTitle) === normalizeTitle(target.title),
    );
  });
}

export function getNodeActivity(document: GraphDocument, node: GraphNode): ActivityItem[] {
  const relationshipCount = document.relationships.filter(
    (relationship) => relationship.fromNodeId === node.id || relationship.toNodeId === node.id,
  ).length;
  const items: ActivityItem[] = [
    {
      id: `${node.id}:content`,
      label: "Article updated",
      timestamp: node.content.updatedAt,
    },
    ...node.attachments.map((attachment) => ({
      id: attachment.id,
      label: `Attachment added: ${attachment.name}`,
      timestamp: attachment.createdAt,
    })),
  ];

  if (relationshipCount > 0) {
    items.push({
      id: `${node.id}:relationships`,
      label: `${relationshipCount} relationship${relationshipCount === 1 ? "" : "s"} connected`,
      timestamp: document.updatedAt,
    });
  }

  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function validateJsonObject(value: string): { ok: true; formatted: string } | { ok: false; message: string } {
  if (!value.trim()) {
    return { ok: true, formatted: "" };
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      return { ok: false, message: "JSON data must be an object." };
    }

    return { ok: true, formatted: JSON.stringify(parsed, null, 2) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid JSON." };
  }
}
