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
    expect(model.nodes[0].boundingBox).toEqual({ x: 140, y: 140, width: 150, height: 70 });
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

  it("preserves non-standard mxCell attributes where practical", () => {
    const xml =
      '<mxfile><diagram name="Attrs"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="node_a" value="A" vertex="1" parent="1" connectable="0" custom:data="kept"><mxGeometry x="10" y="20" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
    const model = parseDrawioXmlToDiagramModel(xml);
    const outputXml = createDrawioXmlFromModel(model);

    expect(outputXml).toContain('connectable="0"');
    expect(outputXml).toContain('custom:data="kept"');
  });

  it("renders grouped Draw.io child geometry as absolute in the editor and relative on export", () => {
    const xml =
      '<mxfile><diagram name="Groups"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="group_a" value="Group" style="swimlane;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="200" y="120" width="320" height="220" as="geometry"/></mxCell><mxCell id="node_a" value="Inside" vertex="1" parent="group_a"><mxGeometry x="40" y="60" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
    const model = parseDrawioXmlToDiagramModel(xml);
    const node = model.nodes.find((candidate) => candidate.id === "node_a");

    expect(node?.boundingBox).toEqual({ x: 240, y: 180, width: 120, height: 60 });

    const outputXml = createDrawioXmlFromModel(model);
    expect(outputXml).toContain('id="node_a"');
    expect(outputXml).toContain('parent="group_a"');
    expect(outputXml).toContain('x="40" y="60" width="120" height="60"');
  });

  it("preserves Draw.io edge waypoints for closer route fidelity", () => {
    const xml =
      '<mxfile><diagram name="Edges"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell><mxCell id="b" value="B" vertex="1" parent="1"><mxGeometry x="320" y="160" width="120" height="60" as="geometry"/></mxCell><mxCell id="e" value="via" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="220" y="50"/><mxPoint x="220" y="190"/></Array></mxGeometry></mxCell></root></mxGraphModel></diagram></mxfile>';
    const model = parseDrawioXmlToDiagramModel(xml);
    const edge = model.edges[0];

    expect((edge.data.mxCell as { geometry?: { points?: Array<{ x: number; y: number }> } }).geometry?.points).toEqual([
      { x: 220, y: 50, as: undefined },
      { x: 220, y: 190, as: undefined }
    ]);

    const outputXml = createDrawioXmlFromModel(model);
    expect(outputXml).toContain('<Array as="points"><mxPoint x="220" y="50"/><mxPoint x="220" y="190"/></Array>');
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
    expect(model.nodes[0].boundingBox).toMatchObject({ x: 80, y: 80, height: 70 });
    expect(model.nodes[0].boundingBox?.width).toBeGreaterThanOrEqual(150);
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
