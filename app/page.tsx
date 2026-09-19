"use client";

import WorkflowCanvas from "@/components/canvas/WorkflowCanvas";
import Inspector from "@/components/inspector/Inspector";
import Palette from "@/components/palette/Palette";
import Toolbar from "@/components/Toolbar";
import ValidationPanel from "@/components/ValidationPanel";
import { useWorkflowStore } from "@/store/workflowStore";
import { useEffect } from "react";

export default function Home() {
  const loadCatalog = useWorkflowStore((s) => s.loadCatalog);

  useEffect(() => {
    // Le catalogue doit être placé dans /public/catalog.xml pour être servi
    // statiquement par Next.js à cette URL.
    fetch("/catalog.xml")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(loadCatalog)
      .catch((err) => console.error("Impossible de charger le catalogue (/public/catalog.xml) :", err));
  }, [loadCatalog]);

  return (
    <div className="h-screen flex flex-col">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r overflow-hidden shrink-0">
          <Palette />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <WorkflowCanvas />
          </div>
          <ValidationPanel />
        </div>
        <div className="w-80 border-l overflow-hidden shrink-0">
          <Inspector />
        </div>
      </div>
    </div>
  );
}
