"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, useViewport } from "reactflow";
import type { AoxNodeData } from "@/lib/reactflow/graphAdapter";
import { inputHandleId, OUTPUT_HANDLE_ID, NODE_MIN_WIDTH, NODE_MAX_WIDTH } from "@/lib/reactflow/graphAdapter";
import { resolveNodeColor } from "@/lib/reactflow/nodeColors";
import { useWorkflowStore } from "@/store/workflowStore";

interface AoxNodeProps {
  id: string;
  data: AoxNodeData;
  selected: boolean;
}

const TOOLTIP_WIDTH = 256;
const TOOLTIP_ESTIMATED_HEIGHT = 90;

function computeTooltipPosition(rect: DOMRect) {
  let left = rect.left;
  let top = rect.bottom + 6;

  if (left + TOOLTIP_WIDTH > window.innerWidth - 8) {
    left = window.innerWidth - TOOLTIP_WIDTH - 8;
  }
  if (left < 8) left = 8;

  if (top + TOOLTIP_ESTIMATED_HEIGHT > window.innerHeight - 8) {
    // Pas assez de place en dessous : on bascule au-dessus du nœud plutôt
    // que de laisser l'infobulle se faire couper / passer sous d'autres blocs.
    top = rect.top - TOOLTIP_ESTIMATED_HEIGHT - 6;
  }
  if (top < 8) top = 8;

  return { top, left };
}

export default function AoxNode({ id, data, selected }: AoxNodeProps) {
  const { node, portViews, isRoot, isOrphan, documentation, width } = data;
  const headerColor = resolveNodeColor(node);
  const setNodeWidth = useWorkflowStore((s) => s.setNodeWidth);
  const { zoom } = useViewport();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  const handleMouseEnter = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) setTooltipPos(computeTooltipPosition(rect));
    setHovered(true);
  }, []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  // --- Redimensionnement horizontal (glisser le bord droit) ---
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      resizeStateRef.current = { startX: e.clientX, startWidth: width };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [width]
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      // Le delta écran doit être ramené à l'échelle du canvas (le zoom de
      // React Flow), sinon la largeur "saute" de façon incohérente dès
      // qu'on n'est plus à 100% de zoom.
      const deltaFlow = (e.clientX - state.startX) / zoom;
      const newWidth = Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, Math.round(state.startWidth + deltaFlow)));
      setNodeWidth(id, newWidth);
    },
    [id, zoom, setNodeWidth]
  );

  const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
    resizeStateRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    // Filet de sécurité : si le pointeur quitte la fenêtre pendant le drag.
    function onWindowPointerUp() {
      resizeStateRef.current = null;
    }
    window.addEventListener("pointerup", onWindowPointerUp);
    return () => window.removeEventListener("pointerup", onWindowPointerUp);
  }, []);

  return (
    <div ref={wrapperRef} className="relative" style={{ width }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div
        className={`rounded-md border bg-white shadow-sm text-xs ${
          selected ? "border-blue-500 ring-2 ring-blue-200" : isOrphan ? "border-gray-300 border-dashed" : "border-gray-300"
        }`}
        style={{ opacity: isOrphan ? 0.65 : 1 }}
      >
        <div
          className="px-2 py-1 border-b border-gray-300 rounded-t-md flex items-center justify-between gap-1"
          style={{ backgroundColor: headerColor }}
        >
          <span className="font-medium truncate" title={node.type}>
            {node.type}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {isOrphan && (
              <span
                className="text-[9px] bg-gray-500 text-white px-1 rounded"
                title="Inatteignable depuis la racine : ne sera pas exporté tant qu'il n'est pas reconnecté (ou nettoyé)."
              >
                ORPHELIN
              </span>
            )}
            {isRoot && <span className="text-[9px] bg-blue-600 text-white px-1 rounded">ROOT</span>}
          </span>
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

        {/* Poignée de redimensionnement horizontal */}
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          className="absolute top-0 right-0 h-full w-2 cursor-ew-resize"
          style={{ touchAction: "none" }}
          title="Glisser pour redimensionner"
        />
      </div>

      {hovered &&
        documentation &&
        tooltipPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none rounded bg-gray-900 px-2 py-1.5 text-[11px] leading-snug text-white shadow-lg whitespace-pre-line"
            style={{ top: tooltipPos.top, left: tooltipPos.left, width: TOOLTIP_WIDTH }}
          >
            {documentation}
          </div>,
          document.body
        )}
    </div>
  );
}
