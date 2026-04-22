import { describe, expect, it } from "vitest";
import { createDiagramModelFromSpec, isMermaidDiagram, parseMermaidToDiagramSpec } from "@/lib/diagram";
import { createDrawioXmlFromModel, validateAndRepairDrawioXml } from "@/lib/xml";

describe("Mermaid diagram import", () => {
  it("converts flowchart source into a Draw.io-compatible model and XML", () => {
    const source = `
flowchart TD
  User[User] -->|submits prompt| API[API Route]
  API --> OpenAI[(OpenAI API)]
  API --> Storage[(Artifact Storage)]
`;

    expect(isMermaidDiagram(source)).toBe(true);
    const spec = parseMermaidToDiagramSpec(source, "workflow.mmd");
    const model = createDiagramModelFromSpec(spec);
    const xml = createDrawioXmlFromModel(model);
    const validation = validateAndRepairDrawioXml(xml);

    expect(spec.nodes.map((node) => node.id)).toEqual(["User", "API", "OpenAI", "Storage"]);
    expect(spec.edges).toHaveLength(3);
    expect(model.nodes.every((node) => node.boundingBox)).toBe(true);
    expect(validation.valid).toBe(true);
    expect(validation.xml).toContain("mxCell");
  });

  it("parses sequence diagram messages as labeled edges", () => {
    const spec = parseMermaidToDiagramSpec(
      `
sequenceDiagram
  participant Browser
  participant Server
  Browser->>Server: Save edit
`,
      "sequence.mmd"
    );

    expect(spec.diagramType).toBe("sequence");
    expect(spec.nodes.map((node) => node.id)).toEqual(["Browser", "Server"]);
    expect(spec.edges[0]).toMatchObject({ sourceId: "Browser", targetId: "Server", label: "Save edit" });
  });
});
