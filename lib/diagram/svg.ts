import { pointsToSvgPath, routeOrthogonalEdge } from "@/lib/diagram/layout";
import type { BoundingBox, DiagramModel } from "@/types";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function boundsFor(model: DiagramModel) {
  const boxes = [
    ...model.groups.map((group) => group.boundingBox),
    ...model.nodes.map((node) => node.boundingBox)
  ].filter((box): box is BoundingBox => Boolean(box));

  if (boxes.length === 0) {
    return { minX: 0, minY: 0, width: 900, height: 560 };
  }

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));

  return {
    minX: Math.max(0, minX - 120),
    minY: Math.max(0, minY - 120),
    width: Math.max(900, maxX - minX + 300),
    height: Math.max(560, maxY - minY + 300)
  };
}

function styleColor(style: Record<string, unknown>, key: "fillColor" | "strokeColor", fallback: string) {
  if (typeof style[key] === "string") return style[key] as string;
  if (typeof style.raw === "string") {
    const match = style.raw.match(new RegExp(`${key}=([^;]+)`));
    if (match?.[1]) return match[1];
  }
  return fallback;
}

function styleShape(style: Record<string, unknown>, fallback = "rounded") {
  if (typeof style.shape === "string") return style.shape;
  if (typeof style.raw === "string") {
    const match = style.raw.match(/shape=([^;]+)/);
    if (match?.[1]?.includes("cylinder")) return "cylinder";
    if (match?.[1]?.includes("rhombus")) return "diamond";
    if (match?.[1]?.includes("cloud")) return "cloud";
    if (match?.[1]?.includes("folder")) return "folder";
    if (match?.[1]?.includes("hexagon")) return "hexagon";
    if (match?.[1]?.includes("image")) return "image";
    if (match?.[1]?.includes("parallelogram")) return "parallelogram";
    if (match?.[1]?.includes("ellipse")) return "ellipse";
    if (match?.[1]?.includes("table")) return "table";
    if (match?.[1]?.includes("umlLifeline")) return "lifeline";
    if (match?.[1]?.includes("partialRectangle")) return "queue";
    if (match?.[1]?.includes("server")) return "server";
    if (match?.[1]?.includes("firewall")) return "firewall";
    if (match?.[1]?.includes("router")) return "router";
    if (match?.[1]?.includes("switch")) return "switch";
  }
  if (typeof style.raw === "string" && style.raw.startsWith("ellipse;")) return "ellipse";
  return fallback;
}

function nodeSvg(box: BoundingBox, fill: string, stroke: string, shape: string) {
  if (shape === "diamond") {
    return `<polygon points="${box.x + box.width / 2},${box.y} ${box.x + box.width},${box.y + box.height / 2} ${box.x + box.width / 2},${box.y + box.height} ${box.x},${box.y + box.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  }

  if (shape === "cylinder") {
    return [
      `<rect x="${box.x}" y="${box.y + 9}" width="${box.width}" height="${box.height - 18}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
      `<ellipse cx="${box.x + box.width / 2}" cy="${box.y + 9}" rx="${box.width / 2}" ry="9" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
      `<ellipse cx="${box.x + box.width / 2}" cy="${box.y + box.height - 9}" rx="${box.width / 2}" ry="9" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`
    ].join("");
  }

  if (shape === "parallelogram") {
    return `<polygon points="${box.x + 24},${box.y} ${box.x + box.width},${box.y} ${box.x + box.width - 24},${box.y + box.height} ${box.x},${box.y + box.height}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  }

  if (shape === "ellipse") {
    return `<ellipse cx="${box.x + box.width / 2}" cy="${box.y + box.height / 2}" rx="${box.width / 2}" ry="${box.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  }

  if (shape === "hexagon") {
    return `<polygon points="${box.x + 24},${box.y} ${box.x + box.width - 24},${box.y} ${box.x + box.width},${box.y + box.height / 2} ${box.x + box.width - 24},${box.y + box.height} ${box.x + 24},${box.y + box.height} ${box.x},${box.y + box.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  }

  if (shape === "image") {
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="#ffffff" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="6 5"/>`;
  }

  if (["table", "class", "lifeline"].includes(shape)) {
    const lifeline =
      shape === "lifeline"
        ? `<line x1="${box.x + box.width / 2}" y1="${box.y + 28}" x2="${box.x + box.width / 2}" y2="${box.y + box.height + 72}" stroke="${stroke}" stroke-dasharray="7 6" stroke-width="1.5"/>`
        : "";
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><line x1="${box.x}" y1="${box.y + 28}" x2="${box.x + box.width}" y2="${box.y + 28}" stroke="${stroke}" stroke-width="1.2"/>${lifeline}`;
  }

  if (shape === "queue" || shape === "server") {
    const divider =
      shape === "queue"
        ? `<line x1="${box.x + box.width - 22}" y1="${box.y}" x2="${box.x + box.width - 22}" y2="${box.y + box.height}" stroke="${stroke}" stroke-width="1.2"/>`
        : `<line x1="${box.x}" y1="${box.y + 24}" x2="${box.x + box.width}" y2="${box.y + 24}" stroke="${stroke}" opacity="0.55"/><line x1="${box.x}" y1="${box.y + 46}" x2="${box.x + box.width}" y2="${box.y + 46}" stroke="${stroke}" opacity="0.55"/>`;
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${divider}`;
  }

  if (shape === "firewall") {
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><line x1="${box.x}" y1="${box.y + 22}" x2="${box.x + box.width}" y2="${box.y + 22}" stroke="${stroke}" opacity="0.35"/><line x1="${box.x}" y1="${box.y + 44}" x2="${box.x + box.width}" y2="${box.y + 44}" stroke="${stroke}" opacity="0.35"/><line x1="${box.x + box.width / 2}" y1="${box.y}" x2="${box.x + box.width / 2}" y2="${box.y + box.height}" stroke="${stroke}" opacity="0.35"/>`;
  }

  if (shape === "router" || shape === "switch") {
    return `<rect x="${box.x}" y="${box.y + 10}" width="${box.width}" height="${box.height - 20}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><path d="M ${box.x + 24} ${box.y + box.height / 2} H ${box.x + box.width - 24}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
  }

  return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
}

export function createDiagramSvgFromModel(model: DiagramModel): string {
  const bounds = boundsFor(model);
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const groups = model.groups
    .map((group) => {
      const box = group.boundingBox;
      if (!box) return "";
      return `<g><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="14" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" opacity="0.78"/><text x="${box.x + 14}" y="${box.y + 24}" fill="#334155" font-size="14" font-weight="600" font-family="Arial">${escapeHtml(group.label)}</text></g>`;
    })
    .join("");
  const edges = model.edges
    .map((edge) => {
      const source = nodeById.get(edge.sourceId)?.boundingBox;
      const target = nodeById.get(edge.targetId)?.boundingBox;
      if (!source || !target) return "";
      const route = routeOrthogonalEdge(source, target);
      const labelWidth = edge.label ? Math.max(56, Math.min(220, edge.label.length * 7 + 20)) : 0;
      const label = edge.label
        ? `<rect x="${route.labelPoint.x - labelWidth / 2}" y="${route.labelPoint.y - 17}" width="${labelWidth}" height="22" rx="8" fill="#ffffff" stroke="#e2e8f0" opacity="0.96"/><text x="${route.labelPoint.x}" y="${route.labelPoint.y - 2}" text-anchor="middle" fill="#475569" font-size="12" font-weight="600" font-family="Arial">${escapeHtml(edge.label)}</text>`
        : "";
      return `<g><path d="${pointsToSvgPath(route.points)}" fill="none" stroke="#334155" stroke-width="2" marker-end="url(#arrow)"/>${label}</g>`;
    })
    .join("");
  const nodes = model.nodes
    .map((node) => {
      const box = node.boundingBox ?? { x: 80, y: 80, width: 150, height: 70 };
      const fill = styleColor(node.style, "fillColor", "#fff7ed");
      const stroke = styleColor(node.style, "strokeColor", "#ea580c");
      const shape = styleShape(node.style, node.type === "database" ? "cylinder" : "rounded");
      return `<g>${nodeSvg(box, fill, stroke, shape)}<foreignObject x="${box.x + 12}" y="${box.y + 24}" width="${box.width - 24}" height="${Math.max(34, box.height - 34)}"><div xmlns="http://www.w3.org/1999/xhtml" style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;font:600 14px Arial;color:#111827;line-height:1.25;overflow-wrap:anywhere;">${escapeHtml(node.label)}</div></foreignObject></g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"/></marker></defs><rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff"/>${groups}${edges}${nodes}</svg>`;
}
