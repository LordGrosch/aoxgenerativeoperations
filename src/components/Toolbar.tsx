"use client";

import { useRef } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { getReachableNodeIds } from "@/types/types";

export default function Toolbar() {
  const graph = useWorkflowStore((s) => s.graph);
  const loadedFileName = useWorkflowStore((s) => s.loadedFileName);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const exportXml = useWorkflowStore((s) => s.exportXml);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const pruneOrphans = useWorkflowStore((s) => s.pruneOrphans);
  const canUndo = useWorkflowStore((s) => s.past.length > 0 || s.pendingParamEdit !== null);
  const canRedo = useWorkflowStore((s) => s.future.length > 0);
  // "Modifié" = au moins une action dans l'historique (ou une frappe en
  // cours) depuis le dernier chargement/la dernière création — pas besoin
  // d'un champ dédié, on réutilise exactement ce que canUndo calcule déjà.
  const isDirty = canUndo;
  const orphanCount = useWorkflowStore((s) => {
    if (!s.graph) return 0;
    const reachable = getReachableNodeIds(s.graph);
    return Object.keys(s.graph.nodes).length - reachable.size;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      loadWorkflow(text, file.name);
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
    a.download = loadedFileName ?? "workflow.xml";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePruneOrphans = () => {
    if (orphanCount === 0) return;
    const confirmed = window.confirm(
      `Supprimer définitivement ${orphanCount} nœud(s) actuellement inatteignable(s) depuis la racine ? ` +
        `Cette action peut être annulée avec Ctrl+Z juste après.`
    );
    if (confirmed) pruneOrphans();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-white">
      <span className="font-semibold text-sm mr-2 shrink-0">AOX Generative Operations</span>

      {graph && (
        <span className="text-xs text-gray-500 mr-2 truncate max-w-[16rem]" title={loadedFileName ?? undefined}>
          {loadedFileName ?? "Nouveau workflow"}
          {isDirty && (
            <span className="text-amber-600 font-bold ml-1" title="Modifications non exportées">
              ●
            </span>
          )}
        </span>
      )}

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
      <input ref={fileInputRef} type="file" accept=".xml,.xmlt" className="hidden" onChange={handleFile} />
      <button
        className="text-sm border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={handleExport}
        disabled={!graph}
      >
        Générer / Exporter le XML
      </button>

      <span className="w-px h-5 bg-gray-200 mx-1" />
      <button
        className="text-sm border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={handlePruneOrphans}
        disabled={orphanCount === 0}
        title="Supprime définitivement les nœuds détachés (visibles en pointillés sur le canvas)"
      >
        🧹 Nettoyer les orphelins{orphanCount > 0 ? ` (${orphanCount})` : ""}
      </button>
    </div>
  );
}
