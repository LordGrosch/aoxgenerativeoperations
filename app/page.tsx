"use client";

import { useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Palette from "@/components/palette/Palette";
import WorkflowCanvas from "@/components/canvas/WorkflowCanvas";
import Inspector from "@/components/inspector/Inspector";
import XmlPreview from "@/components/XmlPreview";
import ValidationPanel from "@/components/ValidationPanel";
import Toolbar from "@/components/Toolbar";
import { useWorkflowStore } from "@/store/workflowStore";

function ColResizeHandle() {
  return (
    <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors cursor-col-resize" />
  );
}

function RowResizeHandle() {
  return (
    <PanelResizeHandle className="h-1 bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors cursor-row-resize" />
  );
}

export default function Home() {
  const loadCatalog = useWorkflowStore((s) => s.loadCatalog);
  const loadSnippetsFromStorage = useWorkflowStore((s) => s.loadSnippetsFromStorage);

  useEffect(() => {
    loadSnippetsFromStorage();
  }, [loadSnippetsFromStorage]);

  useEffect(() => {
    // Raccourcis Ctrl/Cmd+Z (annuler) et Ctrl/Cmd+Maj+Z (rétablir). On laisse
    // le champ gérer son propre undo natif si le focus est dans un
    // input/textarea, pour ne pas créer une double sémantique d'annulation.
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod || e.key.toLowerCase() !== "z") return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      const { undo, redo } = useWorkflowStore.getState();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId="aox-main-layout">
          <Panel defaultSize={22} minSize={14} maxSize={40} className="overflow-hidden">
            <Palette />
          </Panel>

          <ColResizeHandle />

          <Panel defaultSize={56} minSize={30} className="overflow-hidden">
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0">
                <WorkflowCanvas />
              </div>
              <ValidationPanel />
            </div>
          </Panel>

          <ColResizeHandle />

          <Panel defaultSize={22} minSize={14} maxSize={45} className="overflow-hidden">
            <PanelGroup direction="vertical" autoSaveId="aox-right-column">
              <Panel defaultSize={50} minSize={15} className="overflow-hidden">
                <Inspector />
              </Panel>
              <RowResizeHandle />
              <Panel defaultSize={50} minSize={15} className="overflow-hidden">
                <XmlPreview />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
