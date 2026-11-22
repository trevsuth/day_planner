import type { GraphNode } from "../types/graph";

type NodeViewProps = {
  node: GraphNode;
  selected: boolean;
  highlighted: boolean;
  pendingRelationship: boolean;
  onPointerDown: (event: React.PointerEvent<SVGGElement>, node: GraphNode) => void;
  onConnectorPointerDown: (event: React.PointerEvent<SVGCircleElement>, node: GraphNode) => void;
  onClick: (event: React.MouseEvent<SVGGElement>, node: GraphNode) => void;
};

const handleOffsets = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
];

export default function NodeView({
  node,
  selected,
  highlighted,
  pendingRelationship,
  onPointerDown,
  onConnectorPointerDown,
  onClick,
}: NodeViewProps) {
  return (
    <g
      className="graph-node"
      transform={`translate(${node.x} ${node.y})`}
      onPointerDown={(event) => onPointerDown(event, node)}
      onClick={(event) => onClick(event, node)}
    >
      <circle
        r={node.style.radius}
        fill={node.style.fill}
        stroke={selected ? "#ff3fb7" : pendingRelationship ? "#ff3fb7" : highlighted ? "#ffd166" : node.style.stroke}
        strokeWidth={selected || pendingRelationship || highlighted ? 4 : 2}
        filter="url(#holoGlow)"
      />
      <circle
        r={node.style.radius + 9}
        fill="none"
        stroke={selected || pendingRelationship ? "#ff3fb7" : highlighted ? "#ffd166" : "#38e8ff"}
        strokeOpacity={selected || pendingRelationship || highlighted ? 0.46 : 0.18}
        strokeWidth="1.5"
        strokeDasharray="5 8"
        pointerEvents="none"
      />
      <text
        fill={node.style.textColor}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="13"
        fontWeight="700"
        pointerEvents="none"
      >
        {node.title.length > 18 ? `${node.title.slice(0, 16)}...` : node.title}
      </text>
      {node.labels.length > 0 && (
        <text
          y={node.style.radius + 17}
          textAnchor="middle"
          fontSize="11"
          fill="#94f4ff"
          pointerEvents="none"
        >
          {node.labels.slice(0, 2).join(", ")}
        </text>
      )}
      {handleOffsets.map((offset) => {
        const cx = offset.x * (node.style.radius + 7);
        const cy = offset.y * (node.style.radius + 7);
        return (
          <circle
            key={`${offset.x}:${offset.y}`}
            className="node-link-handle"
            cx={cx}
            cy={cy}
            r="8"
            fill="#020711"
            stroke={selected || pendingRelationship ? "#ff3fb7" : "#38e8ff"}
            strokeWidth="2"
            onPointerDown={(event) => onConnectorPointerDown(event, node)}
          />
        );
      })}
    </g>
  );
}
