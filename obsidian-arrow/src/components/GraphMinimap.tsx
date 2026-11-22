import type { GraphDocument } from "../types/graph";

type GraphMinimapProps = {
  document: GraphDocument;
  selectedNodeIds: string[];
  highlightedNodeIds: string[];
  onSelectNode: (nodeId: string) => void;
};

const WIDTH = 220;
const HEIGHT = 140;
const PADDING = 12;

export default function GraphMinimap({
  document,
  selectedNodeIds,
  highlightedNodeIds,
  onSelectNode,
}: GraphMinimapProps) {
  if (document.nodes.length === 0) {
    return null;
  }

  const minX = Math.min(...document.nodes.map((node) => node.x));
  const minY = Math.min(...document.nodes.map((node) => node.y));
  const maxX = Math.max(...document.nodes.map((node) => node.x));
  const maxY = Math.max(...document.nodes.map((node) => node.y));
  const graphWidth = Math.max(maxX - minX, 1);
  const graphHeight = Math.max(maxY - minY, 1);
  const scale = Math.min((WIDTH - PADDING * 2) / graphWidth, (HEIGHT - PADDING * 2) / graphHeight);
  const offsetX = (WIDTH - graphWidth * scale) / 2;
  const offsetY = (HEIGHT - graphHeight * scale) / 2;
  const selected = new Set(selectedNodeIds);
  const highlighted = new Set(highlightedNodeIds);

  function mapX(x: number) {
    return offsetX + (x - minX) * scale;
  }

  function mapY(y: number) {
    return offsetY + (y - minY) * scale;
  }

  return (
    <div className="minimap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Graph outline">
        {document.relationships.map((relationship) => {
          const fromNode = document.nodes.find((node) => node.id === relationship.fromNodeId);
          const toNode = document.nodes.find((node) => node.id === relationship.toNodeId);
          if (!fromNode || !toNode) {
            return null;
          }

          return (
            <line
              key={relationship.id}
              x1={mapX(fromNode.x)}
              y1={mapY(fromNode.y)}
              x2={mapX(toNode.x)}
              y2={mapY(toNode.y)}
            />
          );
        })}
        {document.nodes.map((node) => (
          <circle
            key={node.id}
            cx={mapX(node.x)}
            cy={mapY(node.y)}
            r={selected.has(node.id) ? 4.8 : highlighted.has(node.id) ? 4.2 : 3.2}
            className={selected.has(node.id) ? "selected" : highlighted.has(node.id) ? "highlighted" : ""}
            onClick={() => onSelectNode(node.id)}
          />
        ))}
      </svg>
    </div>
  );
}
