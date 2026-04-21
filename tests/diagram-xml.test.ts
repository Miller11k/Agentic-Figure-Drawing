import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDiagramModelFromSpec } from "../lib/diagram";
import {
  createDrawioXmlFromModel,
  parseDrawioXmlToDiagramModel,
  validateAndRepairDrawioXml,
  validateDrawioXmlShape
} from "../lib/xml";
import type { DiagramSpec } from "../types";

const samplePath = path.join(process.cwd(), "public", "samples", "basic.drawio");

describe("Draw.io XML pipeline", () => {
  it("imports common Draw.io XML into a normalized DiagramModel", () => {
    const xml = readFileSync(samplePath, "utf8");
    const model = parseDrawioXmlToDiagramModel(xml);

    expect(model.nodes.map((node) => node.id)).toEqual([
      "node_api_gateway",
      "node_auth_service",
      "node_user_store"
    ]);
    expect(model.edges).toHaveLength(2);
    expect(model.groups[0]).toMatchObject({
      id: "group_backend",
      label: "Backend",
      nodeIds: ["node_api_gateway", "node_auth_service"]
    });
    expect(model.nodes[0].boundingBox).toEqual({ x: 90, y: 100, width: 150, height: 70 });
  });

  it("round-trips imported XML through DiagramModel and preserves structure", () => {
    const xml = readFileSync(samplePath, "utf8");
    const model = parseDrawioXmlToDiagramModel(xml);
    const outputXml = createDrawioXmlFromModel(model);
    const reparsed = parseDrawioXmlToDiagramModel(outputXml);

    expect(validateDrawioXmlShape(outputXml).valid).toBe(true);
    expect(reparsed.nodes.map((node) => node.id)).toEqual(model.nodes.map((node) => node.id));
    expect(reparsed.edges.map((edge) => [edge.id, edge.sourceId, edge.targetId])).toEqual(
      model.edges.map((edge) => [edge.id, edge.sourceId, edge.targetId])
    );
    expect(reparsed.groups.map((group) => group.id)).toEqual(model.groups.map((group) => group.id));
  });

  it("creates deterministic DiagramModel layout from DiagramSpec and serializes it", () => {
    const spec: DiagramSpec = {
      title: "Generated Architecture",
      diagramType: "system",
      nodes: [
        { label: "API Gateway" },
        { label: "Backend Service" },
        { label: "User Database" }
      ],
      edges: [
        { sourceId: "API Gateway", targetId: "Backend Service" },
        { sourceId: "Backend Service", targetId: "User Database" }
      ],
      groups: [],
      layoutHints: {},
      styleHints: {}
    };

    const model = createDiagramModelFromSpec(spec);
    const xml = createDrawioXmlFromModel(model);
    const reparsed = parseDrawioXmlToDiagramModel(xml);

    expect(model.nodes[0].id).toBe("node_api_gateway");
    expect(model.nodes[0].boundingBox).toEqual({ x: 80, y: 80, width: 150, height: 70 });
    expect(reparsed.edges[0]).toMatchObject({
      sourceId: "node_api_gateway",
      targetId: "node_backend_service"
    });
  });

  it("repairs missing root and layer cells", () => {
    const broken =
      '<mxfile><diagram name="Broken"><mxGraphModel><root><mxCell id="node_a" value="A" vertex="1" parent="1"><mxGeometry x="10" y="20" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
    const repaired = validateAndRepairDrawioXml(broken);

    expect(repaired.repairApplied).toBe(true);
    expect(repaired.valid).toBe(true);
    expect(repaired.xml).toContain('id="0"');
    expect(repaired.xml).toContain('id="1"');
  });

  it("repairs mxGraphModel XML that is missing a root wrapper", () => {
    const broken =
      '<mxfile><diagram name="No Root"><mxGraphModel><mxCell id="0"/><mxCell id="1" parent="0"/></mxGraphModel></diagram></mxfile>';
    const repaired = validateAndRepairDrawioXml(broken);

    expect(repaired.repairApplied).toBe(true);
    expect(repaired.valid).toBe(true);
    expect(repaired.xml).toContain("<root>");
    expect(repaired.xml).toContain("</root>");
  });
});
