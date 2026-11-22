import type { GraphDocument, GraphNode } from "../types/graph";

export type SearchFilters = {
  labels: string[];
  tags: string[];
  contentTypes: string[];
};

export type SearchResult = {
  node: GraphNode;
  score: number;
  matchedFields: string[];
};

function matchesFilters(node: GraphNode, filters: SearchFilters): boolean {
  const labelMatches =
    filters.labels.length === 0 || filters.labels.some((label) => node.labels.includes(label));
  const tagMatches = filters.tags.length === 0 || filters.tags.some((tag) => node.tags.includes(tag));
  const contentTypeMatches =
    filters.contentTypes.length === 0 || filters.contentTypes.includes(node.content.type);

  return labelMatches && tagMatches && contentTypeMatches;
}

export function getSearchFacets(document: GraphDocument) {
  return {
    labels: [...new Set(document.nodes.flatMap((node) => node.labels))].sort((a, b) => a.localeCompare(b)),
    tags: [...new Set(document.nodes.flatMap((node) => node.tags))].sort((a, b) => a.localeCompare(b)),
    contentTypes: [...new Set(document.nodes.map((node) => node.content.type))].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

export function searchNodes(
  document: GraphDocument,
  query: string,
  filters: SearchFilters = { labels: [], tags: [], contentTypes: [] },
): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const hasFilters = filters.labels.length > 0 || filters.tags.length > 0 || filters.contentTypes.length > 0;
  if (!normalizedQuery && !hasFilters) {
    return [];
  }

  return document.nodes
    .filter((node) => matchesFilters(node, filters))
    .map((node) => {
      const fields = [
        ["title", node.title],
        ["labels", node.labels.join(" ")],
        ["tags", node.tags.join(" ")],
        ["article", node.content.markdown],
      ] as const;
      const matchedFields = normalizedQuery
        ? fields
            .filter(([, value]) => value.toLowerCase().includes(normalizedQuery))
            .map(([field]) => field)
        : ["filters"];

      const titleBoost = node.title.toLowerCase().includes(normalizedQuery) ? 3 : 0;
      const filterBoost = hasFilters ? 1 : 0;
      return { node, score: matchedFields.length + titleBoost + filterBoost, matchedFields };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title));
}
