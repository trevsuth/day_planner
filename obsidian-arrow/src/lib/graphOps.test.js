import assert from "node:assert/strict";
import test from "node:test";

import {
  addNode,
  addRelationship,
  applyRelationshipPreset,
  createEmptyDocument,
  createNode,
  createRelationship,
  deleteSelection,
  duplicateSelection,
  findOpenNodePosition,
  getSelectedNodeIds,
  layoutSelectedNodes,
  moveNode,
  swapRelationshipDirection,
  toggleNodeSelection,
  updateNodesStyle,
  updateRelationship,
} from "./graphOps.ts";

function linkedGraph() {
  const source = createNode({ title: "Runbook", x: 100, y: 100 });
  const target = createNode({ title: "Incident", x: 200, y: 100 });
  const outside = createNode({ title: "Background" });
  const relationship = createRelationship(source.id, target.id);
  let graph = createEmptyDocument();
  for (const node of [source, target, outside]) graph = addNode(graph, node);
  graph = addRelationship(graph, relationship);
  graph = addRelationship(graph, createRelationship(target.id, outside.id));
  return { graph, source, target, outside, relationship };
}

test("duplicates a subgraph with new identities and only its internal relationships", () => {
  const { graph, source, target } = linkedGraph();
  const selected = toggleNodeSelection({ kind: "node", id: source.id }, target.id);
  const copy = duplicateSelection(graph, selected);
  const [copiedSource, copiedTarget] = copy.document.nodes.slice(graph.nodes.length);
  assert.equal(copiedSource.title, "Runbook copy");
  assert.equal(copiedSource.x, source.x + 56);
  assert.notEqual(copiedSource.id, source.id);
  assert.notEqual(copiedTarget.id, target.id);
  assert.deepEqual(getSelectedNodeIds(copy.selection), [copiedSource.id, copiedTarget.id]);
  assert.equal(copy.document.relationships.length, 3);
  assert.equal(copy.document.relationships.at(-1).fromNodeId, copiedSource.id);
  assert.equal(copy.document.relationships.at(-1).toNodeId, copiedTarget.id);
  assert.equal(graph.nodes.length, 3);
  assert.deepEqual(duplicateSelection(graph, null), { document: graph, selection: null });
  assert.deepEqual(toggleNodeSelection(selected, source.id), { kind: "node", id: target.id });
});

test("removes edges with deleted nodes and preserves edges when changing their style", () => {
  const { graph, source, target, outside, relationship } = linkedGraph();
  assert.equal(addRelationship(graph, createRelationship(source.id, source.id)), graph);
  assert.equal(addRelationship(graph, createRelationship(source.id, target.id)), graph);

  const updated = updateRelationship(graph, relationship.id, (edge) =>
    swapRelationshipDirection(applyRelationshipPreset(edge, "blocks")),
  );
  const changed = updated.relationships[0];
  assert.equal(changed.fromNodeId, target.id);
  assert.equal(changed.toNodeId, source.id);
  assert.equal(changed.type, "blocks");
  assert.equal(changed.style.dashed, true);
  assert.equal(graph.relationships[0], relationship);

  const cleaned = deleteSelection(updated, { kind: "node", id: target.id });
  assert.deepEqual(cleaned.nodes.map(({ id }) => id), [source.id, outside.id]);
  assert.deepEqual(cleaned.relationships, []);
  assert.equal(deleteSelection(graph, { kind: "relationship", id: relationship.id }).relationships.length, 1);
});

test("layouts and style editing affect only selected nodes", () => {
  const { graph, source, target, outside } = linkedGraph();
  const ids = [source.id, target.id];
  const grid = layoutSelectedNodes(graph, ids, "grid");
  const circle = layoutSelectedNodes(graph, ids, "circle");
  assert.deepEqual(grid.nodes.slice(0, 2).map(({ x, y }) => [x, y]), [[60, 100], [240, 100]]);
  assert.deepEqual(circle.nodes.slice(0, 2).map(({ x, y }) => [x, y]), [[150, -40], [150, 240]]);
  assert.equal(circle.nodes[2], outside);
  assert.equal(layoutSelectedNodes(graph, [source.id], "grid"), graph);

  const styled = updateNodesStyle(moveNode(graph, source.id, 50, 70), ids, { radius: 60 });
  assert.equal(styled.nodes[0].x, 50);
  assert.equal(styled.nodes[0].y, 70);
  assert.equal(styled.nodes[0].style.radius, 60);
  assert.equal(styled.nodes[1].style.radius, 60);
  assert.equal(styled.nodes[2], outside);
  assert.notDeepEqual(findOpenNodePosition(graph, source.x, source.y), { x: source.x, y: source.y });
});
