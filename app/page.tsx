"use client";

import { useEffect } from "react";
import Palette from "@/components/palette/Palette";
import WorkflowCanvas from "@/components/canvas/WorkflowCanvas";
import Inspector from "@/components/inspector/Inspector";
import XmlPreview from "@/components/XmlPreview";
import ValidationPanel from "@/components/ValidationPanel";
import Toolbar from "@/components/Toolbar";
import { useWorkflowStore } from "@/store/workflowStore";

export default function Home() {
  const loadCatalog = useWorkflowStore((s) => s.loadCatalog);
  const loadSnippetsFromStorage = useWorkflowStore((s) => s.loadSnippetsFromStorage);

  useEffect(() => {
    loadSnippetsFromStorage();
  }, [loadSnippetsFromStorage]);

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
        <div className="w-80 border-l overflow-hidden shrink-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
            <Inspector />
          </div>
          <div className="flex-1 min-h-0 border-t overflow-hidden">
            <XmlPreview />
          </div>
        </div>
      </div>
    </div>
  );
}
