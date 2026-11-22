import MarkdownIt from "markdown-it";
import { useMemo } from "react";
import type { GraphNode } from "../types/graph";
import { findNodeByTitle } from "../lib/wiki";

type MarkdownEditorProps = {
  markdown: string;
  nodes: GraphNode[];
  onChange: (markdown: string) => void;
  onNavigateNode: (nodeId: string) => void;
};

const markdownParser = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: true,
});

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function replaceWikiLinks(markdown: string, nodes: GraphNode[]): string {
  return markdown.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, rawTarget: string, rawLabel?: string) => {
    const targetTitle = rawTarget.trim();
    const label = (rawLabel ?? targetTitle).trim();
    const targetNode = findNodeByTitle(nodes, targetTitle);

    if (!targetNode) {
      return `**${escapeMarkdownLinkLabel(label)}**`;
    }

    return `[${escapeMarkdownLinkLabel(label)}](#node:${targetNode.id})`;
  });
}

export default function MarkdownEditor({
  markdown,
  nodes,
  onChange,
  onNavigateNode,
}: MarkdownEditorProps) {
  const html = useMemo(() => markdownParser.render(replaceWikiLinks(markdown, nodes)), [markdown, nodes]);

  return (
    <div className="markdown-editor">
      <textarea
        value={markdown}
        onChange={(event) => onChange(event.target.value)}
        spellCheck
      />
      <article
        className="markdown-preview"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(event) => {
          const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='#node:']");
          if (!link) {
            return;
          }

          event.preventDefault();
          onNavigateNode(link.hash.replace("#node:", ""));
        }}
      />
    </div>
  );
}
