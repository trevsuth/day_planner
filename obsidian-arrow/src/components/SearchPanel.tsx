import type { RefObject } from "react";
import type { SearchFilters, SearchResult } from "../lib/search";
import type { NodeContentType } from "../types/graph";

type SearchPanelProps = {
  query: string;
  filters: SearchFilters;
  facets: SearchFilters;
  results: SearchResult[];
  inputRef: RefObject<HTMLInputElement>;
  onQueryChange: (query: string) => void;
  onFiltersChange: (filters: SearchFilters) => void;
  onSelectNode: (nodeId: string) => void;
};

function toggleFilterValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function SearchPanel({
  query,
  filters,
  facets,
  results,
  inputRef,
  onQueryChange,
  onFiltersChange,
  onSelectNode,
}: SearchPanelProps) {
  const hasSearch = Boolean(query.trim()) || filters.labels.length > 0 || filters.tags.length > 0 || filters.contentTypes.length > 0;

  return (
    <section className="search-panel">
      <input
        id="graph-search"
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search graph wiki"
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <details className="search-filters">
        <summary>Filters</summary>
        <div className="filter-group">
          <span>Type</span>
          {facets.contentTypes.map((type) => (
            <label key={type} className="filter-chip">
              <input
                type="checkbox"
                checked={filters.contentTypes.includes(type)}
                onChange={() =>
                  onFiltersChange({
                    ...filters,
                    contentTypes: toggleFilterValue(filters.contentTypes, type as NodeContentType),
                  })
                }
              />
              {type}
            </label>
          ))}
        </div>
        <div className="filter-group">
          <span>Labels</span>
          {facets.labels.length === 0 ? (
            <em>None</em>
          ) : (
            facets.labels.map((label) => (
              <label key={label} className="filter-chip">
                <input
                  type="checkbox"
                  checked={filters.labels.includes(label)}
                  onChange={() =>
                    onFiltersChange({ ...filters, labels: toggleFilterValue(filters.labels, label) })
                  }
                />
                {label}
              </label>
            ))
          )}
        </div>
        <div className="filter-group">
          <span>Tags</span>
          {facets.tags.length === 0 ? (
            <em>None</em>
          ) : (
            facets.tags.map((tag) => (
              <label key={tag} className="filter-chip">
                <input
                  type="checkbox"
                  checked={filters.tags.includes(tag)}
                  onChange={() => onFiltersChange({ ...filters, tags: toggleFilterValue(filters.tags, tag) })}
                />
                {tag}
              </label>
            ))
          )}
        </div>
      </details>
      {hasSearch && (
        <div className="search-results">
          {results.length === 0 ? (
            <p>No matching nodes.</p>
          ) : (
            results.map((result) => (
              <button key={result.node.id} type="button" onClick={() => onSelectNode(result.node.id)}>
                <strong>{result.node.title}</strong>
                <span>{result.matchedFields.join(", ")}</span>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
