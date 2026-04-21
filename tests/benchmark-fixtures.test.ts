import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDrawioXmlToDiagramModel, validateAndRepairDrawioXml } from "../lib/xml";

const root = process.cwd();
const suitePath = path.join(root, "benchmarks/fixtures/benchmark-suite.json");

describe("benchmark fixtures", () => {
  it("references local files that exist", () => {
    const suite = JSON.parse(readFileSync(suitePath, "utf8")) as {
      xmlCompatibility: Array<{ file: string }>;
      recoverability: Array<{ file?: string }>;
      imageMasking: Array<{ source: string }>;
    };

    const files = [
      ...suite.xmlCompatibility.map((item) => item.file),
      ...suite.recoverability.map((item) => item.file).filter((file): file is string => Boolean(file)),
      ...suite.imageMasking.map((item) => item.source)
    ];

    for (const file of files) {
      expect(existsSync(path.join(root, file))).toBe(true);
    }
  });

  it("round-trips the XML compatibility fixture into a diagram model", () => {
    const xml = readFileSync(path.join(root, "benchmarks/fixtures/xml-compatibility.drawio"), "utf8");
    const model = parseDrawioXmlToDiagramModel(xml);

    expect(model.nodes).toHaveLength(3);
    expect(model.edges).toHaveLength(2);
    expect(model.groups).toHaveLength(1);
  });

  it("repairs the recoverability fixture", () => {
    const xml = readFileSync(path.join(root, "benchmarks/fixtures/recoverability-missing-root.xml"), "utf8");
    const repaired = validateAndRepairDrawioXml(xml);

    expect(repaired.valid).toBe(true);
    expect(repaired.repairApplied).toBe(true);
    expect(parseDrawioXmlToDiagramModel(repaired.xml).nodes[0].label).toBe("Repair Me");
  });
});
