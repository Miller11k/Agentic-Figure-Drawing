export interface DiagramIconDefinition {
  id: string;
  label: string;
  aliases: string[];
  drawioStyle: string;
  shape: string;
  icon: string;
  categories: string[];
}

export const SUPPORTED_DIAGRAM_ICONS: DiagramIconDefinition[] = [
  {
    id: "process",
    label: "Process",
    aliases: ["process", "step", "activity", "operation"],
    drawioStyle: "rounded=1;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#475569;",
    shape: "rounded",
    icon: "Process",
    categories: ["flowchart", "workflow"]
  },
  {
    id: "decision",
    label: "Decision",
    aliases: ["decision", "choice", "branch", "condition", "if"],
    drawioStyle: "shape=rhombus;whiteSpace=wrap;html=1;fillColor=#fef9c3;strokeColor=#ca8a04;",
    shape: "diamond",
    icon: "?",
    categories: ["flowchart", "state"]
  },
  {
    id: "terminator",
    label: "Terminator",
    aliases: ["start", "end", "terminator", "begin", "stop", "finish"],
    drawioStyle: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dcfce7;strokeColor=#16a34a;",
    shape: "ellipse",
    icon: "START",
    categories: ["flowchart", "state"]
  },
  {
    id: "input-output",
    label: "Input / Output",
    aliases: ["input", "output", "i/o", "request", "response", "source", "sink"],
    drawioStyle: "shape=parallelogram;whiteSpace=wrap;html=1;fillColor=#eff6ff;strokeColor=#2563eb;",
    shape: "parallelogram",
    icon: "I/O",
    categories: ["flowchart", "data-flow"]
  },
  {
    id: "database",
    label: "Database",
    aliases: ["database", "db", "sql", "rds", "postgres", "mysql", "data-store"],
    drawioStyle: "shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#ecfeff;strokeColor=#0891b2;",
    shape: "cylinder",
    icon: "DB",
    categories: ["database", "architecture", "cloud"]
  },
  {
    id: "table",
    label: "Table / Entity",
    aliases: ["table", "entity", "relation", "primary key", "foreign key"],
    drawioStyle: "shape=table;startSize=28;container=1;collapsible=0;childLayout=tableLayout;whiteSpace=wrap;html=1;fillColor=#ecfeff;strokeColor=#0891b2;",
    shape: "table",
    icon: "Table",
    categories: ["erd", "database"]
  },
  {
    id: "class",
    label: "UML Class",
    aliases: ["class", "interface", "uml class", "package"],
    drawioStyle: "swimlane;whiteSpace=wrap;html=1;startSize=28;horizontal=1;fillColor=#f8fafc;strokeColor=#475569;",
    shape: "class",
    icon: "Class",
    categories: ["uml"]
  },
  {
    id: "lifeline",
    label: "Sequence Lifeline",
    aliases: ["lifeline", "participant", "activation", "actor lifeline"],
    drawioStyle: "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;fillColor=#f8fafc;strokeColor=#64748b;",
    shape: "lifeline",
    icon: "Life",
    categories: ["uml", "sequence"]
  },
  {
    id: "server",
    label: "Server",
    aliases: ["server", "host", "compute", "instance", "vm", "container"],
    drawioStyle: "shape=mxgraph.basic.server;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#475569;",
    shape: "server",
    icon: "Srv",
    categories: ["architecture", "network", "cloud"]
  },
  {
    id: "service-api",
    label: "Service / API",
    aliases: ["service", "api", "microservice", "endpoint", "lambda", "function", "worker"],
    drawioStyle: "rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f3ff;strokeColor=#7c3aed;",
    shape: "service",
    icon: "API",
    categories: ["architecture", "cloud", "devops"]
  },
  {
    id: "gateway",
    label: "Gateway",
    aliases: ["gateway", "api gateway", "edge gateway", "ingress"],
    drawioStyle: "shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fillColor=#dbeafe;strokeColor=#2563eb;",
    shape: "hexagon",
    icon: "GW",
    categories: ["architecture", "cloud", "network"]
  },
  {
    id: "queue",
    label: "Queue",
    aliases: ["queue", "message queue", "sqs", "pubsub", "topic", "stream", "event bus"],
    drawioStyle: "shape=partialRectangle;whiteSpace=wrap;html=1;right=0;fillColor=#fef3c7;strokeColor=#d97706;",
    shape: "queue",
    icon: "Q",
    categories: ["architecture", "cloud", "devops"]
  },
  {
    id: "cache",
    label: "Cache",
    aliases: ["cache", "redis", "memcached", "cdn cache"],
    drawioStyle: "shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#ecfdf5;strokeColor=#059669;",
    shape: "cylinder",
    icon: "Cache",
    categories: ["architecture", "cloud"]
  },
  {
    id: "storage",
    label: "Object Storage",
    aliases: ["storage", "bucket", "object storage", "blob", "file store", "s3", "gcs"],
    drawioStyle: "shape=folder;whiteSpace=wrap;html=1;tabWidth=36;tabHeight=14;fillColor=#f8fafc;strokeColor=#475569;",
    shape: "folder",
    icon: "Storage",
    categories: ["architecture", "cloud"]
  },
  {
    id: "cloud",
    label: "Cloud",
    aliases: ["cloud", "aws", "gcp", "azure", "cloud account"],
    drawioStyle: "shape=cloud;whiteSpace=wrap;html=1;fillColor=#eef2ff;strokeColor=#4f46e5;",
    shape: "cloud",
    icon: "Cloud",
    categories: ["architecture", "cloud"]
  },
  {
    id: "user",
    label: "User / Actor",
    aliases: ["user", "client", "actor", "customer", "admin", "operator"],
    drawioStyle: "shape=mxgraph.basic.user;whiteSpace=wrap;html=1;fillColor=#fdf2f8;strokeColor=#db2777;",
    shape: "user",
    icon: "User",
    categories: ["uml", "journey", "architecture"]
  },
  {
    id: "router",
    label: "Router",
    aliases: ["router", "route", "routing"],
    drawioStyle: "shape=mxgraph.cisco.routers.router;whiteSpace=wrap;html=1;fillColor=#eff6ff;strokeColor=#2563eb;",
    shape: "router",
    icon: "Router",
    categories: ["network"]
  },
  {
    id: "switch",
    label: "Switch",
    aliases: ["switch", "network switch", "lan switch"],
    drawioStyle: "shape=mxgraph.cisco.switches.workgroup_switch;whiteSpace=wrap;html=1;fillColor=#ecfdf5;strokeColor=#059669;",
    shape: "switch",
    icon: "Switch",
    categories: ["network"]
  },
  {
    id: "firewall",
    label: "Firewall",
    aliases: ["firewall", "waf", "security group", "acl"],
    drawioStyle: "shape=mxgraph.cisco.security.firewall;whiteSpace=wrap;html=1;fillColor=#fee2e2;strokeColor=#dc2626;",
    shape: "firewall",
    icon: "FW",
    categories: ["network", "security"]
  },
  {
    id: "load-balancer",
    label: "Load Balancer",
    aliases: ["load balancer", "alb", "nlb", "lb", "proxy"],
    drawioStyle: "shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fillColor=#f5f3ff;strokeColor=#7c3aed;",
    shape: "hexagon",
    icon: "LB",
    categories: ["architecture", "network", "cloud"]
  },
  {
    id: "document",
    label: "Document",
    aliases: ["document", "file", "report", "artifact", "contract"],
    drawioStyle: "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#f8fafc;strokeColor=#64748b;",
    shape: "document",
    icon: "Doc",
    categories: ["flowchart", "workflow"]
  },
  {
    id: "wireframe",
    label: "UI / Wireframe",
    aliases: ["screen", "page", "form", "button", "wireframe", "ui component"],
    drawioStyle: "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#64748b;shadow=0;",
    shape: "wireframe",
    icon: "UI",
    categories: ["wireframe", "journey"]
  },
  {
    id: "custom-icon",
    label: "Custom Generated Icon",
    aliases: ["custom", "bespoke", "domain-specific", "logo", "graphic", "image icon"],
    drawioStyle: "shape=image;whiteSpace=wrap;html=1;imageAspect=1;aspect=fixed;fillColor=#ffffff;strokeColor=#94a3b8;dashed=1;",
    shape: "image",
    icon: "Custom",
    categories: ["custom", "fallback"]
  }
];

export function findSupportedDiagramIcon(typeOrLabel: string | undefined): DiagramIconDefinition | undefined {
  if (!typeOrLabel) return undefined;
  const normalized = typeOrLabel.trim().toLowerCase();
  return SUPPORTED_DIAGRAM_ICONS.find(
    (icon) =>
      icon.id === normalized ||
      icon.label.toLowerCase() === normalized ||
      icon.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))
  );
}

export function supportedDiagramIconPromptCatalog(): string {
  return SUPPORTED_DIAGRAM_ICONS.map((icon) => {
    const aliases = icon.aliases.slice(0, 5).join(", ");
    return `- ${icon.id}: ${icon.label}; aliases: ${aliases}; shape=${icon.shape}; categories=${icon.categories.join("/")}`;
  }).join("\n");
}
