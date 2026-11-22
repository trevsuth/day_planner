import { useMemo, useRef, useState } from "react";
import type { GraphDocument, GraphNode, GraphRelationship, Selection } from "../types/graph";
import NodeView from "./NodeView";
import RelationshipView from "./RelationshipView";

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 900;
const GRID_SIZE = 28;
const GUIDE_THRESHOLD = 8;

type GraphCanvasProps = {
  document: GraphDocument;
  selection: Selection;
  selectedNodeIds: string[];
  highlightedNodeIds: string[];
  pendingRelationshipFromId: string | null;
  onSelect: (selection: Selection) => void;
  onToggleNodeSelection: (nodeId: string) => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onMoveNodes: (positions: Record<string, { x: number; y: number }>) => void;
  onNodeRelationshipClick: (nodeId: string) => void;
  onCreateLinkedNode: (fromNodeId: string, x: number, y: number) => void;
  onCreateRelationship: (fromNodeId: string, toNodeId: string) => void;
  onBeginNodeDrag: () => void;
  onEndNodeDrag: () => void;
};

type Point = {
  x: number;
  y: number;
};

type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  origin: Point;
  nodePositions: Record<string, Point>;
};

type LinkDragState = {
  fromNodeId: string;
  x: number;
  y: number;
};

type LassoState = {
  start: Point;
  current: Point;
};

type PanState = {
  startClientX: number;
  startClientY: number;
  viewBox: ViewBox;
};

type AlignmentGuides = {
  x?: number;
  y?: number;
};

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapPoint(point: Point): Point {
  return { x: snap(point.x), y: snap(point.y) };
}

function normalizeRect(start: Point, end: Point) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  };
}

export default function GraphCanvas({
  document,
  selection,
  selectedNodeIds,
  highlightedNodeIds,
  pendingRelationshipFromId,
  onSelect,
  onToggleNodeSelection,
  onMoveNode,
  onMoveNodes,
  onNodeRelationshipClick,
  onCreateLinkedNode,
  onCreateRelationship,
  onBeginNodeDrag,
  onEndNodeDrag,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewBox, setViewBox] = useState<ViewBox>({
    x: 0,
    y: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [linkDragState, setLinkDragState] = useState<LinkDragState | null>(null);
  const [lassoState, setLassoState] = useState<LassoState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({});

  const nodesById = useMemo(() => {
    return new Map(document.nodes.map((node) => [node.id, node]));
  }, [document.nodes]);
  const highlightedNodes = useMemo(() => new Set(highlightedNodeIds), [highlightedNodeIds]);

  function getCanvasPoint(event: React.PointerEvent | React.WheelEvent | PointerEvent) {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function findAlignmentGuides(nodeId: string, point: Point): AlignmentGuides {
    const draggedIds = dragState ? new Set(Object.keys(dragState.nodePositions)) : new Set([nodeId]);

    return document.nodes.reduce<AlignmentGuides>((guides, node) => {
      if (draggedIds.has(node.id)) {
        return guides;
      }

      return {
        x: guides.x ?? (Math.abs(node.x - point.x) <= GUIDE_THRESHOLD ? node.x : undefined),
        y: guides.y ?? (Math.abs(node.y - point.y) <= GUIDE_THRESHOLD ? node.y : undefined),
      };
    }, {});
  }

  function handleNodePointerDown(event: React.PointerEvent<SVGGElement>, node: GraphNode) {
    event.stopPropagation();
    if (linkDragState) {
      return;
    }

    const point = getCanvasPoint(event);
    const nodeIds = selectedNodeIds.includes(node.id) ? selectedNodeIds : [node.id];
    const nodePositions = Object.fromEntries(
      document.nodes
        .filter((item) => nodeIds.includes(item.id))
        .map((item) => [item.id, { x: item.x, y: item.y }]),
    );

    setDragState({
      nodeId: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      origin: { x: node.x, y: node.y },
      nodePositions,
    });
    onBeginNodeDrag();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleConnectorPointerDown(event: React.PointerEvent<SVGCircleElement>, node: GraphNode) {
    event.stopPropagation();
    const point = getCanvasPoint(event);
    setDragState(null);
    setLinkDragState({ fromNodeId: node.id, x: point.x, y: point.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleBackgroundPointerDown(event: React.PointerEvent<SVGRectElement>) {
    const point = getCanvasPoint(event);

    if (event.altKey || event.button === 1 || event.button === 2) {
      setPanState({
        startClientX: event.clientX,
        startClientY: event.clientY,
        viewBox,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    setLassoState({ start: point, current: point });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (panState) {
      const scaleX = viewBox.width / (svgRef.current?.clientWidth || CANVAS_WIDTH);
      const scaleY = viewBox.height / (svgRef.current?.clientHeight || CANVAS_HEIGHT);
      setViewBox({
        ...panState.viewBox,
        x: panState.viewBox.x - (event.clientX - panState.startClientX) * scaleX,
        y: panState.viewBox.y - (event.clientY - panState.startClientY) * scaleY,
      });
      return;
    }

    if (lassoState) {
      setLassoState({ ...lassoState, current: getCanvasPoint(event) });
      return;
    }

    if (linkDragState) {
      const point = getCanvasPoint(event);
      setLinkDragState((current) => (current ? { ...current, x: point.x, y: point.y } : null));
      return;
    }

    if (!dragState) {
      return;
    }

    const point = getCanvasPoint(event);
    const snapped = snapPoint({ x: point.x - dragState.offsetX, y: point.y - dragState.offsetY });
    const guides = findAlignmentGuides(dragState.nodeId, snapped);
    const guided = {
      x: guides.x ?? snapped.x,
      y: guides.y ?? snapped.y,
    };

    setAlignmentGuides(guides);
    const deltaX = guided.x - dragState.origin.x;
    const deltaY = guided.y - dragState.origin.y;

    if (Object.keys(dragState.nodePositions).length > 1) {
      onMoveNodes(
        Object.fromEntries(
          Object.entries(dragState.nodePositions).map(([nodeId, position]) => [
            nodeId,
            { x: position.x + deltaX, y: position.y + deltaY },
          ]),
        ),
      );
    } else {
      onMoveNode(dragState.nodeId, guided.x, guided.y);
    }
  }

  function findNodeAtPoint(x: number, y: number, excludedNodeId: string): GraphNode | undefined {
    return document.nodes.find((node) => {
      if (node.id === excludedNodeId) {
        return false;
      }

      const distance = Math.hypot(node.x - x, node.y - y);
      return distance <= node.style.radius + 14;
    });
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (lassoState) {
      const rect = normalizeRect(lassoState.start, lassoState.current);
      if (rect.width < 8 && rect.height < 8) {
        onSelect(null);
      } else {
        const ids = document.nodes
          .filter(
            (node) =>
              node.x >= rect.x &&
              node.x <= rect.x + rect.width &&
              node.y >= rect.y &&
              node.y <= rect.y + rect.height,
          )
          .map((node) => node.id);
        onSelect(ids.length === 0 ? null : ids.length === 1 ? { kind: "node", id: ids[0] } : { kind: "nodes", ids });
      }
    }

    if (linkDragState) {
      const point = snapPoint(getCanvasPoint(event));
      const targetNode = findNodeAtPoint(point.x, point.y, linkDragState.fromNodeId);

      if (targetNode) {
        onCreateRelationship(linkDragState.fromNodeId, targetNode.id);
      } else {
        onCreateLinkedNode(linkDragState.fromNodeId, point.x, point.y);
      }
    }

    if (dragState) {
      onEndNodeDrag();
    }

    setDragState(null);
    setLinkDragState(null);
    setLassoState(null);
    setPanState(null);
    setAlignmentGuides({});
  }

  function handleNodeClick(event: React.MouseEvent<SVGGElement>, node: GraphNode) {
    event.stopPropagation();
    if (pendingRelationshipFromId) {
      onNodeRelationshipClick(node.id);
      return;
    }

    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      onToggleNodeSelection(node.id);
      return;
    }

    onSelect({ kind: "node", id: node.id });
  }

  function handleRelationshipClick(
    event: React.MouseEvent<SVGGElement>,
    relationship: GraphRelationship,
  ) {
    event.stopPropagation();
    onSelect({ kind: "relationship", id: relationship.id });
  }

  function zoomAtCenter(factor: number) {
    setViewBox((current) => {
      const nextWidth = current.width * factor;
      const nextHeight = current.height * factor;
      return {
        x: current.x + (current.width - nextWidth) / 2,
        y: current.y + (current.height - nextHeight) / 2,
        width: nextWidth,
        height: nextHeight,
      };
    });
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = getCanvasPoint(event);
    const factor = event.deltaY > 0 ? 1.12 : 0.88;
    setViewBox((current) => {
      const nextWidth = current.width * factor;
      const nextHeight = current.height * factor;
      const ratioX = (point.x - current.x) / current.width;
      const ratioY = (point.y - current.y) / current.height;

      return {
        x: point.x - nextWidth * ratioX,
        y: point.y - nextHeight * ratioY,
        width: nextWidth,
        height: nextHeight,
      };
    });
  }

  function fitToGraph() {
    if (document.nodes.length === 0) {
      setViewBox({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
      return;
    }

    const minX = Math.min(...document.nodes.map((node) => node.x - node.style.radius)) - 120;
    const minY = Math.min(...document.nodes.map((node) => node.y - node.style.radius)) - 120;
    const maxX = Math.max(...document.nodes.map((node) => node.x + node.style.radius)) + 120;
    const maxY = Math.max(...document.nodes.map((node) => node.y + node.style.radius)) + 120;

    setViewBox({
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 420),
      height: Math.max(maxY - minY, 280),
    });
  }

  const lassoRect = lassoState ? normalizeRect(lassoState.start, lassoState.current) : null;

  return (
    <div className="graph-canvas-frame">
      <div className="canvas-controls">
        <button type="button" onClick={() => zoomAtCenter(0.82)}>
          Zoom +
        </button>
        <button type="button" onClick={() => zoomAtCenter(1.18)}>
          Zoom -
        </button>
        <button type="button" onClick={fitToGraph}>
          Fit
        </button>
      </div>
      <svg
        ref={svgRef}
        className="graph-canvas"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          if (dragState) {
            onEndNodeDrag();
          }
          setDragState(null);
          setLinkDragState(null);
          setLassoState(null);
          setPanState(null);
          setAlignmentGuides({});
        }}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <defs>
          <radialGradient id="canvasGlow" cx="50%" cy="46%" r="66%">
            <stop offset="0%" stopColor="#0f456a" stopOpacity="0.66" />
            <stop offset="46%" stopColor="#071827" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#020711" stopOpacity="1" />
          </radialGradient>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#1ad7ff" strokeOpacity="0.13" strokeWidth="1" />
          </pattern>
          <filter id="holoGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 4 L 0 8 z" fill="context-stroke" />
          </marker>
        </defs>
        <rect
          x={viewBox.x - viewBox.width}
          y={viewBox.y - viewBox.height}
          width={viewBox.width * 3}
          height={viewBox.height * 3}
          fill="url(#canvasGlow)"
          onPointerDown={handleBackgroundPointerDown}
        />
        <rect
          x={viewBox.x - viewBox.width}
          y={viewBox.y - viewBox.height}
          width={viewBox.width * 3}
          height={viewBox.height * 3}
          fill="url(#grid)"
          pointerEvents="none"
        />
        <g className="holo-orbits" filter="url(#holoGlow)">
          <circle cx="700" cy="450" r="150" />
          <circle cx="700" cy="450" r="255" />
          <circle cx="700" cy="450" r="380" />
          <ellipse cx="700" cy="450" rx="520" ry="170" />
          <line x1="0" y1="450" x2="1400" y2="450" />
          <line x1="700" y1="0" x2="700" y2="900" />
        </g>
        {alignmentGuides.x !== undefined && (
          <line className="alignment-guide" x1={alignmentGuides.x} y1={viewBox.y} x2={alignmentGuides.x} y2={viewBox.y + viewBox.height} />
        )}
        {alignmentGuides.y !== undefined && (
          <line className="alignment-guide" x1={viewBox.x} y1={alignmentGuides.y} x2={viewBox.x + viewBox.width} y2={alignmentGuides.y} />
        )}
        {linkDragState && (
          <line
            className="link-drag-preview"
            x1={nodesById.get(linkDragState.fromNodeId)?.x}
            y1={nodesById.get(linkDragState.fromNodeId)?.y}
            x2={linkDragState.x}
            y2={linkDragState.y}
            markerEnd="url(#arrowhead)"
            filter="url(#holoGlow)"
          />
        )}
        {document.relationships.map((relationship) => (
          <RelationshipView
            key={relationship.id}
            relationship={relationship}
            fromNode={nodesById.get(relationship.fromNodeId)}
            toNode={nodesById.get(relationship.toNodeId)}
            selected={selection?.kind === "relationship" && selection.id === relationship.id}
            onClick={handleRelationshipClick}
          />
        ))}
        {document.nodes.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            selected={selectedNodeIds.includes(node.id)}
            highlighted={highlightedNodes.has(node.id)}
            pendingRelationship={pendingRelationshipFromId === node.id}
            onPointerDown={handleNodePointerDown}
            onConnectorPointerDown={handleConnectorPointerDown}
            onClick={handleNodeClick}
          />
        ))}
        {lassoRect && (
          <rect
            className="lasso-selection"
            x={lassoRect.x}
            y={lassoRect.y}
            width={lassoRect.width}
            height={lassoRect.height}
          />
        )}
      </svg>
    </div>
  );
}
