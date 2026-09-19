"use client";


import { useMemo, useState } from "react";
import { AOX_DRAG_TYPE } from "../canvas/WorkflowCanvas";
import { useWorkflowStore } from "@/store/workflowStore";


export default function Palette() {
  const catalog = useWorkflowStore((s) => s.catalog);
  const [query, setQuery] = useState("");

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
      <div className="p-2 border-b">
        <input
          className="w-full text-sm border rounded px-2 py-1"
          placeholder="Rechercher une classe…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto text-sm">
        {grouped.map((g) => (
          <div key={g.category} className="border-b">
            <div className="px-2 py-1 bg-gray-50 text-gray-500 font-medium text-[11px] sticky top-0">
              {g.category}
            </div>
            {g.classes.map((c) => (
              <div
                key={c.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(AOX_DRAG_TYPE, c.type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="px-3 py-1 cursor-grab hover:bg-blue-50 truncate"
                title={c.documentation ?? c.type}
              >
                {c.type}
              </div>
            ))}
          </div>
        ))}
        {grouped.length === 0 && <div className="p-3 text-gray-400">Aucun résultat.</div>}
      </div>
    </div>
  );
}
