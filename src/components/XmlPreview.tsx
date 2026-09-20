"use client";

import { useMemo, useState } from "react";
import { diffLines } from "diff";
import { useWorkflowStore } from "@/store/workflowStore";
import { generateWorkflowXml } from "@/lib/generator/workflowGenerator";

type ViewMode = "preview" | "diff";

/**
 * Aperçu XML en lecture seule, régénéré à chaque changement du graphe, avec
 * un second mode "diff" comparant au XML tel que chargé initialement.
 * generateWorkflowXml est pur et synchrone (concaténation de chaînes) : la
 * recalculer à chaque frappe est négligeable pour un workflow de taille
 * réaliste. Un debounce serait la première optimisation si ça devenait
 * perceptible sur un très gros fichier.
 */
export default function XmlPreview() {
  const graph = useWorkflowStore((s) => s.graph);
  const loadedXml = useWorkflowStore((s) => s.loadedXml);
  const [mode, setMode] = useState<ViewMode>("preview");

  const { xml, error } = useMemo(() => {
    if (!graph) return { xml: "", error: null as string | null };
    try {
      return { xml: generateWorkflowXml(graph), error: null as string | null };
    } catch (err) {
      return { xml: "", error: (err as Error).message };
    }
  }, [graph]);

  const diffParts = useMemo(() => {
    if (mode !== "diff" || loadedXml === null || error) return null;
    return diffLines(loadedXml, xml);
  }, [mode, loadedXml, xml, error]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(xml);
    } catch {
      // Pas critique : l'utilisateur peut toujours sélectionner/copier à la main.
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1 border-b bg-gray-50 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode("preview")}
            className={`text-[10px] border rounded px-1.5 py-0.5 ${
              mode === "preview" ? "bg-white font-medium" : "text-gray-500"
            }`}
          >
            Aperçu
          </button>
          <button
            onClick={() => setMode("diff")}
            disabled={loadedXml === null}
            title={loadedXml === null ? "Chargez un fichier XML pour comparer." : undefined}
            className={`text-[10px] border rounded px-1.5 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed ${
              mode === "diff" ? "bg-white font-medium" : "text-gray-500"
            }`}
          >
            Diff avec l&apos;original
          </button>
        </div>
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
      ) : mode === "diff" && diffParts ? (
        <pre className="flex-1 w-full text-[10px] font-mono p-2 overflow-auto bg-white whitespace-pre-wrap m-0">
          {diffParts.map((part, i) => (
            <span
              key={i}
              className={
                part.added
                  ? "bg-green-100 text-green-800 block"
                  : part.removed
                  ? "bg-red-100 text-red-800 block line-through decoration-red-400/50"
                  : "text-gray-700 block"
              }
            >
              {part.value}
            </span>
          ))}
        </pre>
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
