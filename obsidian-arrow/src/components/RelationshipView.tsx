import type { GraphNode, GraphRelationship } from "../types/graph";

type RelationshipViewProps = {
  relationship: GraphRelationship;
  fromNode?: GraphNode;
  toNode?: GraphNode;
  selected: boolean;
  onClick: (event: React.MouseEvent<SVGGElement>, relationship: GraphRelationship) => void;
};

export default function RelationshipView({
  relationship,
  fromNode,
  toNode,
  selected,
  onClick,
}: RelationshipViewProps) {
  if (!fromNode || !toNode) {
    return null;
  }

  const midX = (fromNode.x + toNode.x) / 2;
  const midY = (fromNode.y + toNode.y) / 2;

  return (
    <g className="graph-relationship" onClick={(event) => onClick(event, relationship)}>
      <line
        x1={fromNode.x}
        y1={fromNode.y}
        x2={toNode.x}
        y2={toNode.y}
        stroke={selected ? "#ff3fb7" : relationship.style.stroke}
        strokeWidth={selected ? relationship.style.width + 2 : relationship.style.width}
        strokeDasharray={relationship.style.dashed ? "7 6" : undefined}
        markerEnd="url(#arrowhead)"
        filter="url(#holoGlow)"
      />
      <rect
        x={midX - relationship.type.length * 3.8 - 8}
        y={midY - 13}
        width={relationship.type.length * 7.6 + 16}
        height="22"
        rx="4"
        fill="rgba(3, 12, 25, 0.86)"
        stroke={selected ? "#ff3fb7" : "#38e8ff"}
      />
      <text x={midX} y={midY + 4} textAnchor="middle" fontSize="11" fill="#d9fbff">
        {relationship.type}
      </text>
    </g>
  );
}
