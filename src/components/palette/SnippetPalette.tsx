"use client";

import { useWorkflowStore } from "@/store/workflowStore";
import { AOX_SNIPPET_DRAG_TYPE } from "@/components/canvas/WorkflowCanvas";

export default function SnippetPalette() {
  const snippets = useWorkflowStore((s) => s.snippets);
  const deleteSnippet = useWorkflowStore((s) => s.deleteSnippet);

  if (snippets.length === 0) return null;

  return (
    <div className="border-b">
      <div className="px-2 py-1 bg-purple-50 text-purple-700 font-medium text-[11px]">
        Mes snippets ({snippets.length})
      </div>
      {snippets.map((s) => (
        <div
          key={s.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(AOX_SNIPPET_DRAG_TYPE, s.id);
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="group px-3 py-1 cursor-grab hover:bg-purple-50 flex items-center justify-between gap-2"
          title={`Racine : ${s.rootType}`}
        >
          <span className="truncate text-sm">{s.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Supprimer le snippet "${s.name}" ?`)) deleteSnippet(s.id);
            }}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-red-600 shrink-0"
            title="Supprimer ce snippet"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
