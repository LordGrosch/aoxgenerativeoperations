"use client";

import { Handle, Position } from "reactflow";
import type { AoxNodeData } from "@/lib/reactflow/graphAdapter";
import { inputHandleId, OUTPUT_HANDLE_ID } from "@/lib/reactflow/graphAdapter";
import { resolveNodeColor } from "@/lib/reactflow/nodeColors";

const NODE_WIDTH = 220;

interface AoxNodeProps {
  data: AoxNodeData;
  selected: boolean;
}

export default function AoxNode({ data, selected }: AoxNodeProps) {
  const { node, portViews, isRoot, documentation } = data;
  const headerColor = resolveNodeColor(node);

  return (
    <div className="group relative" style={{ width: NODE_WIDTH }}>
      <div
        className={`rounded-md border bg-white shadow-sm text-xs ${
          selected ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300"
        }`}
      >
        <div
          className="px-2 py-1 border-b border-gray-300 rounded-t-md flex items-center justify-between gap-1"
          style={{ backgroundColor: headerColor }}
        >
          <span className="font-medium truncate" title={node.type}>
            {node.type}
          </span>
          {isRoot && <span className="text-[9px] bg-blue-600 text-white px-1 rounded shrink-0">ROOT</span>}
        </div>
        <div className="px-2 py-0.5 text-[10px] text-gray-500 truncate">{node.category}</div>

        <div className="py-1">
          {portViews.length === 0 && <div className="px-2 py-1 text-[10px] text-gray-400 italic">Aucun port</div>}
          {portViews.map((port) => {
            const filled = (node.ports[port.name]?.connectedNodeIds.length ?? 0) > 0;
            const missing = port.mandatory && !filled;
            return (
              <div key={port.name} className="relative flex items-center h-6 px-2">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={inputHandleId(port.name)}
                  style={{ background: filled ? "#4b5563" : missing ? "#dc2626" : "#9ca3af", width: 8, height: 8 }}
                />
                <span className={`truncate ${missing ? "text-red-600 font-medium" : "text-gray-700"}`}>
                  {port.name}
                  {port.mandatory ? " *" : ""}
                </span>
              </div>
            );
          })}
        </div>

        <Handle
          type="source"
          position={Position.Right}
          id={OUTPUT_HANDLE_ID}
          style={{ background: "#2563eb", width: 8, height: 8 }}
        />
      </div>

      {documentation && (
        <div
          className="pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 w-64
                     bg-gray-900 text-white text-[11px] leading-snug rounded px-2 py-1.5 shadow-lg
                     opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-pre-line"
        >
          {documentation}
        </div>
      )}
    </div>
  );
}
