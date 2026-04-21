import { describe, expect, it } from "vitest";
import { applyDiagramLayout, applyHierarchicalLayout, pointsToSvgPath, routeOrthogonalEdge } from "../lib/diagram/layout";
import type { DiagramModel } from "../types";

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

  it("routes self-like edges without returning a zero-length path", () => {
    const box = { x: 80, y: 80, width: 150, height: 70 };
    const route = routeOrthogonalEdge(box, box);

    expect(route.points).toHaveLength(4);
    expect(new Set(route.points.map((point) => `${point.x},${point.y}`)).size).toBeGreaterThan(2);
  });
});
