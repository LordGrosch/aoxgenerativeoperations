"use client";

import { useMemo } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { generateWorkflowXml } from "@/lib/generator/workflowGenerator";

/**
 * Aperçu XML en lecture seule, régénéré à chaque changement du graphe.
 * generateWorkflowXml est une fonction pure et synchrone (simple
 * concaténation de chaînes) : la recalculer à chaque frappe est
 * négligeable pour des workflows de taille réaliste. Si ça devient
 * perceptible sur un très gros fichier, un debounce serait la première
 * optimisation à ajouter ici, sans rien changer côté store/génération.
 */
export default function XmlPreview() {
  const graph = useWorkflowStore((s) => s.graph);

  const { xml, error } = useMemo(() => {
    if (!graph) return { xml: "", error: null as string | null };
    try {
      return { xml: generateWorkflowXml(graph), error: null as string | null };
    } catch (err) {
      return { xml: "", error: (err as Error).message };
    }
  }, [graph]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(xml);
    } catch {
      // Pas critique : l'utilisateur peut toujours sélectionner/copier à la main.
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1 border-b bg-gray-50 flex items-center justify-between shrink-0">
        <span className="text-[11px] text-gray-500 font-medium">XML généré (aperçu, lecture seule)</span>
        <button
          onClick={handleCopy}
          disabled={!xml}
          className="text-[10px] border rounded px-1.5 py-0.5 hover:bg-white disabled:opacity-40"
        >
          Copier
        </button>
      </div>

      {error ? (
        <div className="p-2 text-xs text-red-700 bg-red-50 flex-1 overflow-y-auto">
          Erreur de génération : {error}
        </div>
      ) : (
        <textarea
          readOnly
          value={xml || (graph ? "" : "Aucun workflow chargé.")}
          spellCheck={false}
          className="flex-1 w-full text-[10px] font-mono p-2 resize-none outline-none bg-white"
        />
      )}
    </div>
  );
}
