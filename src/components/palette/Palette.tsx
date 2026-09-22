"use client";

import { useMemo, useState } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { AOX_DRAG_TYPE } from "@/components/canvas/WorkflowCanvas";
import { getNodeAcceptance } from "@/lib/compatibility/compatibilityEngine";
import type { ClassDef } from "@/lib/catalog/catalogTypes";
import SnippetPalette from "./SnippetPalette";
import ClassDetailsModal from "./ClassDetailsModal";

export default function Palette() {
  const catalog = useWorkflowStore((s) => s.catalog);
  const graph = useWorkflowStore((s) => s.graph);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const [query, setQuery] = useState("");
  const [detailsClass, setDetailsClass] = useState<ClassDef | null>(null);

  const selectedNode = graph && selectedNodeId ? graph.nodes[selectedNodeId] : null;

  const grouped = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.categories
      .map((category) => ({
        category,
        classes: (catalog.classesByCategory.get(category) ?? []).filter(
          (c) => !q || c.type.toLowerCase().includes(q) || category.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.classes.length > 0);
  }, [catalog, query]);

  if (!catalog) {
    return <div className="p-3 text-sm text-gray-400">Catalogue non chargé.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b space-y-1">
        <input
          className="w-full text-sm border rounded px-2 py-1"
          placeholder="Rechercher une classe…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {selectedNode && (
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" /> branchable en entrée
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-purple-400 inline-block" /> peut recevoir ce nœud
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto text-sm">
        <SnippetPalette />
        {grouped.map((g) => (
          <div key={g.category} className="border-b">
            <div className="px-2 py-1 bg-gray-50 text-gray-500 font-medium text-[11px] sticky top-0">
              {g.category}
            </div>
            {g.classes.map((c) => {
              let acceptsAsInput: ReturnType<typeof getNodeAcceptance> | null = null;
              let acceptsAsOutput: ReturnType<typeof getNodeAcceptance> | null = null;
              if (selectedNode) {
                acceptsAsInput = getNodeAcceptance(selectedNode.type, c.category, catalog);
                acceptsAsOutput = getNodeAcceptance(c.type, selectedNode.category, catalog);
              }
              const isInputMatch = acceptsAsInput === "compatible";
              const isOutputMatch = acceptsAsOutput === "compatible";
              const isDimmed =
                selectedNode !== null &&
                !isInputMatch &&
                !isOutputMatch &&
                acceptsAsInput === "incompatible" &&
                acceptsAsOutput === "incompatible";

              return (
                <div
                  key={c.type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(AOX_DRAG_TYPE, c.type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={`px-3 py-1 cursor-grab hover:bg-blue-50 truncate flex items-center gap-1.5 ${
                    isDimmed ? "opacity-30" : ""
                  }`}
                  title={c.documentation ?? c.type}
                >
                  <span className="flex gap-0.5 shrink-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isInputMatch ? "bg-emerald-400" : "bg-transparent"}`}
                    />
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isOutputMatch ? "bg-purple-400" : "bg-transparent"}`}
                    />
                  </span>
                  <span className="truncate flex-1">{c.type}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsClass(c);
                    }}
                    onDragStart={(e) => e.stopPropagation()}
                    title="Fiche technique"
                    className="shrink-0 text-gray-400 hover:text-blue-600 text-[11px] border rounded-full w-4 h-4 flex items-center justify-center"
                  >
                    i
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {grouped.length === 0 && <div className="p-3 text-gray-400">Aucun résultat.</div>}
      </div>

      {detailsClass && <ClassDetailsModal classDef={detailsClass} onClose={() => setDetailsClass(null)} />}
    </div>
  );
}
