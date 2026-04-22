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

  it("resizes a node while preserving its id and position", () => {
    const edited = applyDirectDiagramEdits(model(), [
      { type: "resize-node", nodeId: "node_a", width: 180, height: 96 }
    ]);

    expect(edited.nodes[0]).toMatchObject({
      id: "node_a",
      boundingBox: { x: 0, y: 0, width: 180, height: 96 }
    });
  });

  it("updates editable node and edge fields", () => {
    const edited = applyDirectDiagramEdits(model(), [
      { type: "update-node-fields", nodeId: "node_a", label: "API Server", nodeType: "server", width: 190 },
      { type: "update-edge-fields", edgeId: "edge_ab", label: "HTTPS", targetId: "node_c" }
    ]);

    expect(edited.nodes[0]).toMatchObject({
      label: "API Server",
      type: "server",
      boundingBox: { x: 0, y: 0, width: 190, height: 60 }
    });
    expect(edited.edges[0]).toMatchObject({
      label: "HTTPS",
      targetId: "node_c"
    });
  });

  it("updates and clears edge labels through direct edits", () => {
    const labeled = applyDirectDiagramEdits(model(), [
      { type: "update-edge-label", edgeId: "edge_ab", label: "calls" }
    ]);
    const cleared = applyDirectDiagramEdits(labeled, [
      { type: "update-edge-label", edgeId: "edge_ab", label: " " }
    ]);

    expect(labeled.edges[0].label).toBe("calls");
    expect(cleared.edges[0].label).toBeUndefined();
  });
});
