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
});
