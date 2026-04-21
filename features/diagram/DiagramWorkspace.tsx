"use client";

import type { DiagramModel } from "@/types";

function boundsFor(model: DiagramModel) {
  const boxes = model.nodes.map((node) => node.boundingBox).filter(Boolean);

  if (boxes.length === 0) {
    return { minX: 0, minY: 0, width: 900, height: 560 };
  }

  const minX = Math.min(...boxes.map((box) => box!.x));
  const minY = Math.min(...boxes.map((box) => box!.y));
  const maxX = Math.max(...boxes.map((box) => box!.x + box!.width));
  const maxY = Math.max(...boxes.map((box) => box!.y + box!.height));

  return {
    minX: Math.max(0, minX - 80),
    minY: Math.max(0, minY - 80),
    width: Math.max(900, maxX - minX + 220),
    height: Math.max(560, maxY - minY + 220)
  };
}

export function DiagramWorkspace({ diagramModel }: { diagramModel?: DiagramModel }) {
  if (!diagramModel || diagramModel.nodes.length === 0) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center border border-dashed border-slate-300 bg-white">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-slate-800">No diagram loaded</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Create a session, import Draw.io XML, or generate a diagram from a prompt to populate this workspace.
          </p>
        </div>
      </div>
    );
  }

  const view = boundsFor(diagramModel);
  const nodeById = new Map(diagramModel.nodes.map((node) => [node.id, node]));

  return (
    <div className="h-full min-h-[520px] overflow-auto border border-slate-200 bg-white">
      <svg
        className="min-h-full min-w-full"
        viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
        role="img"
        aria-label="Diagram preview"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
          </marker>
        </defs>

        {diagramModel.groups.map((group) => {
          const box = group.boundingBox;
          if (!box) return null;
          return (
            <g key={group.id}>
              <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
              <text x={box.x + 14} y={box.y + 24} fill="#334155" fontSize="14" fontWeight="600">
                {group.label}
              </text>
            </g>
          );
        })}

        {diagramModel.edges.map((edge) => {
          const source = nodeById.get(edge.sourceId)?.boundingBox;
          const target = nodeById.get(edge.targetId)?.boundingBox;
          if (!source || !target) return null;
          const x1 = source.x + source.width;
          const y1 = source.y + source.height / 2;
          const x2 = target.x;
          const y2 = target.y + target.height / 2;
          const midX = (x1 + x2) / 2;
          return (
            <g key={edge.id}>
              <path d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`} fill="none" stroke="#334155" strokeWidth="2" markerEnd="url(#arrow)" />
              {edge.label ? (
                <text x={midX + 6} y={(y1 + y2) / 2 - 6} fill="#475569" fontSize="12">
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {diagramModel.nodes.map((node) => {
          const box = node.boundingBox ?? { x: 80, y: 80, width: 150, height: 70 };
          const isDatabase = node.type === "database";
          return (
            <g key={node.id}>
              {isDatabase ? (
                <>
                  <ellipse cx={box.x + box.width / 2} cy={box.y + 12} rx={box.width / 2} ry="12" fill="#ecfeff" stroke="#0891b2" strokeWidth="1.5" />
                  <rect x={box.x} y={box.y + 12} width={box.width} height={box.height - 24} fill="#ecfeff" stroke="#0891b2" strokeWidth="1.5" />
                  <ellipse cx={box.x + box.width / 2} cy={box.y + box.height - 12} rx={box.width / 2} ry="12" fill="#ecfeff" stroke="#0891b2" strokeWidth="1.5" />
                </>
              ) : (
                <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="6" fill="#fff7ed" stroke="#ea580c" strokeWidth="1.5" />
              )}
              <text x={box.x + box.width / 2} y={box.y + box.height / 2 + 5} textAnchor="middle" fill="#111827" fontSize="14" fontWeight="600">
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
