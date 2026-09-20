"use client";

import { useRef } from "react";
import { useWorkflowStore } from "@/store/workflowStore";

export default function Toolbar() {
  const graph = useWorkflowStore((s) => s.graph);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const exportXml = useWorkflowStore((s) => s.exportXml);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const canUndo = useWorkflowStore((s) => s.past.length > 0 || s.pendingParamEdit !== null);
  const canRedo = useWorkflowStore((s) => s.future.length > 0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      loadWorkflow(text);
    } catch (err) {
      window.alert(`Erreur de chargement : ${(err as Error).message}`);
    }
    e.target.value = "";
  };

  const handleExport = () => {
    if (!graph) return;
    const xml = exportXml();
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workflow.xml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-white">
      <span className="font-semibold text-sm mr-4">AOX Generative Operations</span>
      <button
        className="text-sm border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={undo}
        disabled={!canUndo}
        title="Annuler (Ctrl+Z)"
      >
        ↶ Annuler
      </button>
      <button
        className="text-sm border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={redo}
        disabled={!canRedo}
        title="Rétablir (Ctrl+Maj+Z)"
      >
        ↷ Rétablir
      </button>
      <span className="w-px h-5 bg-gray-200 mx-1" />
      <button className="text-sm border rounded px-2 py-1 hover:bg-gray-50" onClick={() => fileInputRef.current?.click()}>
        Charger un XML
      </button>
      <input ref={fileInputRef} type="file" accept=".xml" className="hidden" onChange={handleFile} />
      <button
        className="text-sm border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={handleExport}
        disabled={!graph}
      >
        Générer / Exporter le XML
      </button>
    </div>
  );
}
