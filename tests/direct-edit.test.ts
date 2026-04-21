import { describe, expect, it } from "vitest";
import { applyDirectDiagramEdits } from "../lib/diagram/direct-edit";
import type { DiagramModel } from "../types";

function model(): DiagramModel {
  return {
    nodes: [
      {
        id: "node_a",
        stableId: "node_a",
        label: "A",
        boundingBox: { x: 0, y: 0, width: 100, height: 60 },
        style: {},
        data: {}
      },
      {
        id: "node_b",
        stableId: "node_b",
        label: "B",
        boundingBox: { x: 200, y: 0, width: 100, height: 60 },
        style: {},
        data: {}
      },
      {
        id: "node_c",
        stableId: "node_c",
        label: "C",
        boundingBox: { x: 400, y: 0, width: 100, height: 60 },
        style: {},
        data: {}
      }
    ],
    edges: [
      {
        id: "edge_ab",
        stableId: "edge_ab",
        sourceId: "node_a",
        targetId: "node_b",
        style: {},
        data: {}
      }
    ],
    groups: [],
    layoutMetadata: {},
    styleMetadata: {},
    normalized: {}
  };
}

describe("direct diagram edits", () => {
  it("reconnects an edge target while preserving the edge id", () => {
    const edited = applyDirectDiagramEdits(model(), [
      { type: "reconnect-edge", edgeId: "edge_ab", targetId: "node_c" }
    ]);

    expect(edited.edges[0]).toMatchObject({
      id: "edge_ab",
      sourceId: "node_a",
      targetId: "node_c"
    });
  });

  it("throws when reconnecting to a missing node", () => {
    expect(() =>
      applyDirectDiagramEdits(model(), [{ type: "reconnect-edge", edgeId: "edge_ab", targetId: "missing" }])
    ).toThrow("Target node missing was not found.");
  });

  it("supports group creation, membership changes, and group styling", () => {
    const edited = applyDirectDiagramEdits(model(), [
      { type: "add-group", group: { id: "group_1", label: "Runtime", nodeIds: ["node_a"] } },
      { type: "set-node-group", nodeId: "node_b", groupId: "group_1" },
      { type: "update-group", groupId: "group_1", style: { fillColor: "#eff6ff" } }
    ]);

    expect(edited.groups[0]).toMatchObject({
      id: "group_1",
      label: "Runtime",
      nodeIds: ["node_a", "node_b"]
    });
    expect(edited.groups[0].style.fillColor).toBe("#eff6ff");
    expect(edited.groups[0].boundingBox?.width).toBeGreaterThan(100);
  });

  it("updates edge style through direct edits", () => {
    const edited = applyDirectDiagramEdits(model(), [
      { type: "update-edge-style", edgeId: "edge_ab", style: { strokeColor: "#2563eb" } }
    ]);

    expect(edited.edges[0].style.strokeColor).toBe("#2563eb");
  });
});
