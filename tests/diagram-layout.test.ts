import { describe, expect, it } from "vitest";
import { applyDiagramLayout, applyHierarchicalLayout, applyOptimizedLayout, pointsToSvgPath, routeOrthogonalEdge } from "../lib/diagram/layout";
import type { BoundingBox, DiagramModel } from "../types";

function overlaps(a: BoundingBox, b: BoundingBox, padding = 0) {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

function crossingCount(diagram: DiagramModel) {
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node.boundingBox!]));
  let crossings = 0;

  for (let i = 0; i < diagram.edges.length; i += 1) {
    for (let j = i + 1; j < diagram.edges.length; j += 1) {
      const first = diagram.edges[i];
      const second = diagram.edges[j];
      const firstSource = nodes.get(first.sourceId);
      const firstTarget = nodes.get(first.targetId);
      const secondSource = nodes.get(second.sourceId);
      const secondTarget = nodes.get(second.targetId);
      if (!firstSource || !firstTarget || !secondSource || !secondTarget) continue;

      const firstSourceY = firstSource.y + firstSource.height / 2;
      const firstTargetY = firstTarget.y + firstTarget.height / 2;
      const secondSourceY = secondSource.y + secondSource.height / 2;
      const secondTargetY = secondTarget.y + secondTarget.height / 2;
      const sourceOrder = firstSourceY - secondSourceY;
      const targetOrder = firstTargetY - secondTargetY;

      if (sourceOrder * targetOrder < 0) {
        crossings += 1;
      }
    }
  }

  return crossings;
}

const model: DiagramModel = {
  nodes: [
    { id: "api", stableId: "api", label: "API", boundingBox: { x: 400, y: 400, width: 150, height: 70 }, style: {}, data: {} },
    { id: "web", stableId: "web", label: "Web", boundingBox: { x: 20, y: 20, width: 150, height: 70 }, style: {}, data: {} },
    { id: "db", stableId: "db", label: "Database", boundingBox: { x: 20, y: 240, width: 150, height: 70 }, style: {}, data: {} }
  ],
  edges: [
    { id: "edge_web_api", stableId: "edge_web_api", sourceId: "web", targetId: "api", style: {}, data: {} },
    { id: "edge_api_db", stableId: "edge_api_db", sourceId: "api", targetId: "db", style: {}, data: {} }
  ],
  groups: [
    { id: "group_runtime", stableId: "group_runtime", label: "Runtime", nodeIds: ["api", "db"], style: {} }
  ],
  layoutMetadata: {},
  styleMetadata: {},
  normalized: {}
};

describe("diagram layout helpers", () => {
  it("places connected nodes in deterministic hierarchy columns", () => {
    const laidOut = applyHierarchicalLayout(model);
    const web = laidOut.nodes.find((node) => node.id === "web")!;
    const api = laidOut.nodes.find((node) => node.id === "api")!;
    const db = laidOut.nodes.find((node) => node.id === "db")!;

    expect(web.boundingBox?.x).toBeLessThan(api.boundingBox!.x);
    expect(api.boundingBox?.x).toBeLessThan(db.boundingBox!.x);
    expect(laidOut.layoutMetadata.layout).toBe("deterministic-hierarchical");
    expect(laidOut.groups[0].boundingBox?.width).toBeGreaterThan(150);
  });

  it("routes edges as orthogonal svg paths", () => {
    const route = routeOrthogonalEdge(
      { x: 80, y: 80, width: 150, height: 70 },
      { x: 370, y: 220, width: 150, height: 70 }
    );

    expect(route.points).toHaveLength(4);
    expect(pointsToSvgPath(route.points)).toMatch(/^M \d+ \d+ L /);
  });

  it("supports grid and radial layout modes", () => {
    const grid = applyDiagramLayout(model, "grid");
    const radial = applyDiagramLayout(model, "radial");

    expect(grid.layoutMetadata.layout).toBe("deterministic-grid");
    expect(radial.layoutMetadata.layout).toBe("deterministic-radial");
    expect(radial.nodes.every((node) => node.boundingBox)).toBe(true);
  });

  it("uses optimized layout as the structural default with readable spacing", () => {
    const optimized = applyOptimizedLayout(model);
    const web = optimized.nodes.find((node) => node.id === "web")!;
    const api = optimized.nodes.find((node) => node.id === "api")!;
    const db = optimized.nodes.find((node) => node.id === "db")!;

    expect(optimized.layoutMetadata.layout).toBe("deterministic-optimized");
    expect(web.boundingBox!.x).toBeLessThan(api.boundingBox!.x);
    expect(api.boundingBox!.x).toBeLessThan(db.boundingBox!.x);
    expect(optimized.groups[0].boundingBox?.height).toBeGreaterThan(100);
  });

  it("selects an optimized radial fallback for dense graphs", () => {
    const dense = applyDiagramLayout(
      {
        ...model,
        edges: [
          ...model.edges,
          { id: "e1", stableId: "e1", sourceId: "web", targetId: "db", style: {}, data: {} },
          { id: "e2", stableId: "e2", sourceId: "db", targetId: "web", style: {}, data: {} },
          { id: "e3", stableId: "e3", sourceId: "db", targetId: "api", style: {}, data: {} }
        ]
      },
      "optimized"
    );

    expect(dense.layoutMetadata.layout).toBe("deterministic-optimized-radial");
  });

  it("routes self-like edges without returning a zero-length path", () => {
    const box = { x: 80, y: 80, width: 150, height: 70 };
    const route = routeOrthogonalEdge(box, box);

    expect(route.points).toHaveLength(4);
    expect(new Set(route.points.map((point) => `${point.x},${point.y}`)).size).toBeGreaterThan(2);
  });

  it("sizes and spaces optimized layouts so long labels do not collide", () => {
    const readable = applyOptimizedLayout({
      ...model,
      nodes: [
        { id: "start", stableId: "start", label: "Start request intake from mobile application", type: "start", style: {}, data: {} },
        { id: "decision", stableId: "decision", label: "Is account verified and policy accepted?", type: "decision", style: {}, data: {} },
        { id: "store", stableId: "store", label: "Customer profile and audit event data store", type: "data-store", style: {}, data: {} },
        { id: "output", stableId: "output", label: "Return eligibility response and next best action", type: "output", style: {}, data: {} }
      ],
      edges: [
        { id: "e1", stableId: "e1", sourceId: "start", targetId: "decision", label: "submit", style: {}, data: {} },
        { id: "e2", stableId: "e2", sourceId: "decision", targetId: "store", label: "verified", style: {}, data: {} },
        { id: "e3", stableId: "e3", sourceId: "store", targetId: "output", label: "profile state", style: {}, data: {} }
      ],
      groups: []
    });

    const boxes = readable.nodes.map((node) => node.boundingBox!);
    for (let i = 0; i < boxes.length; i += 1) {
      expect(boxes[i].width).toBeGreaterThanOrEqual(150);
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(overlaps(boxes[i], boxes[j], 36)).toBe(false);
      }
    }

    expect(readable.layoutMetadata.overlapAvoidance).toBe(true);
  });

  it("keeps sibling region bounds separated in optimized layouts", () => {
    const regional = applyOptimizedLayout({
      ...model,
      nodes: [
        { id: "a1", stableId: "a1", label: "Frontend input", style: {}, data: {}, groupId: "g1" },
        { id: "a2", stableId: "a2", label: "Frontend output", style: {}, data: {}, groupId: "g1" },
        { id: "b1", stableId: "b1", label: "Backend decision", style: {}, data: {}, groupId: "g2" },
        { id: "b2", stableId: "b2", label: "Backend data store", style: {}, data: {}, groupId: "g2" }
      ],
      edges: [
        { id: "a1_b1", stableId: "a1_b1", sourceId: "a1", targetId: "b1", style: {}, data: {} },
        { id: "a2_b2", stableId: "a2_b2", sourceId: "a2", targetId: "b2", style: {}, data: {} }
      ],
      groups: [
        { id: "g1", stableId: "g1", label: "Experience Layer", nodeIds: ["a1", "a2"], style: {} },
        { id: "g2", stableId: "g2", label: "Platform Layer", nodeIds: ["b1", "b2"], style: {} }
      ]
    });

    expect(regional.groups).toHaveLength(2);
    expect(overlaps(regional.groups[0].boundingBox!, regional.groups[1].boundingBox!, 24)).toBe(false);
  });

  it("reorders optimized layout columns to minimize crossed edge corridors", () => {
    const tangled: DiagramModel = {
      ...model,
      nodes: [
        { id: "source-a", stableId: "source-a", label: "A source", style: {}, data: {} },
        { id: "source-b", stableId: "source-b", label: "B source", style: {}, data: {} },
        { id: "target-c", stableId: "target-c", label: "C target", style: {}, data: {} },
        { id: "target-d", stableId: "target-d", label: "D target", style: {}, data: {} }
      ],
      edges: [
        { id: "a-d", stableId: "a-d", sourceId: "source-a", targetId: "target-d", label: "to D", style: {}, data: {} },
        { id: "b-c", stableId: "b-c", sourceId: "source-b", targetId: "target-c", label: "to C", style: {}, data: {} }
      ],
      groups: []
    };

    const hierarchical = applyHierarchicalLayout(tangled);
    const optimized = applyOptimizedLayout(tangled);

    expect(crossingCount(hierarchical)).toBeGreaterThan(crossingCount(optimized));
    expect(crossingCount(optimized)).toBe(0);
    expect(optimized.layoutMetadata.edgeOverlapReduction).toBe("barycentric-column-ordering");
  });
});
