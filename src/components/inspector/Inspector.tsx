"use client";

import { useWorkflowStore } from "@/store/workflowStore";
import CompatibilitySnippetButton from "@/components/CompatibilitySnippetButton";
import DictionaryEditor from "@/components/inspector/DictionaryEditor";
import { parseDictionaryBlob } from "@/lib/rawconfig/keyValueEditor";
import { getReachableNodeIds } from "@/types/types";

export default function Inspector() {
  const catalog = useWorkflowStore((s) => s.catalog);
  const graph = useWorkflowStore((s) => s.graph);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const validation = useWorkflowStore((s) => s.validation);
  const updateParam = useWorkflowStore((s) => s.updateParam);
  const deleteNode = useWorkflowStore((s) => s.deleteNode);
  const saveSnippetFromNode = useWorkflowStore((s) => s.saveSnippetFromNode);
  const updateRawConfigBlob = useWorkflowStore((s) => s.updateRawConfigBlob);
  const setRoot = useWorkflowStore((s) => s.setRoot);

  if (!catalog || !graph || !selectedNodeId) {
    return <div className="p-3 text-sm text-gray-400">Sélectionnez un nœud pour voir ses propriétés.</div>;
  }

  const node = graph.nodes[selectedNodeId];
  if (!node) return null;

  const classDef = catalog.classesByType.get(node.type);
  const issues = (validation?.issues ?? []).filter((i) => i.nodeId === selectedNodeId);
  const isRoot = selectedNodeId === graph.rootNodeId;
  const isOrphan = !getReachableNodeIds(graph).has(selectedNodeId);

  return (
    <div className="p-3 text-sm space-y-3 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold break-all">{node.type}</div>
          <div className="text-xs text-gray-500">{node.category}</div>
        </div>
        {!isRoot && (
          <button
            onClick={() => deleteNode(node.id)}
            className="text-xs text-red-600 border border-red-200 rounded px-2 py-1 hover:bg-red-50 shrink-0"
          >
            Supprimer
          </button>
        )}
      </div>

      {isOrphan && (
        <div className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-1">
          ⚠ Ce nœud n&apos;est actuellement pas atteignable depuis la racine (orphelin) : il ne sera pas inclus dans l&apos;export
          tant qu&apos;il n&apos;est pas reconnecté. Utilisez &quot;🧹 Nettoyer les orphelins&quot; dans la barre d&apos;outils pour le supprimer
          définitivement si vous n&apos;en avez plus besoin.
        </div>
      )}

      <button
        onClick={() => {
          const name = window.prompt("Nom du snippet :", node.type);
          if (name) saveSnippetFromNode(node.id, name);
        }}
        className="text-xs text-purple-700 border border-purple-200 rounded px-2 py-1 hover:bg-purple-50 w-full"
        title="Enregistre ce nœud et tout son sous-arbre comme snippet réutilisable, disponible ensuite dans la palette."
      >
        💾 Enregistrer comme snippet
      </button>

      {!isRoot && (
        <button
          onClick={() => setRoot(node.id)}
          className="text-xs text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 w-full"
          title="Fait de ce nœud le point de départ de l'export XML. L'ancienne racine reste dans le graphe (potentiellement orpheline), rien n'est supprimé."
        >
          👑 Définir comme racine
        </button>
      )}

      {classDef?.documentation && (
        <p className="text-xs text-gray-600 whitespace-pre-line border-l-2 border-gray-200 pl-2">
          {classDef.documentation}
        </p>
      )}

      {!classDef && (
        <div className="text-xs bg-red-50 text-red-700 rounded px-2 py-1">
          Type absent du catalogue chargé : édition des propriétés impossible.
        </div>
      )}

      {issues.length > 0 && (
        <div className="space-y-1">
          {issues.map((issue, i) => (
            <div
              key={i}
              className={`text-xs rounded px-2 py-1 flex items-center gap-1 ${
                issue.severity === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              <span className="flex-1">{issue.message}</span>
              {issue.meta && (
                <CompatibilitySnippetButton
                  ownerType={issue.meta.ownerType}
                  portName={issue.meta.portName}
                  candidateCategory={issue.meta.candidateCategory}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {classDef && classDef.scalarProperties.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 font-medium">Paramètres</div>
          {classDef.scalarProperties.map((prop) => {
            const current = node.params[prop.name];
            const value = current?.value ?? "";
            return (
              <label key={prop.name} className="block">
                <span className={`text-xs ${prop.mandatory ? "text-red-600" : "text-gray-600"}`}>
                  {prop.name}
                  {prop.mandatory ? " *" : ""}
                </span>
                {prop.dataType === "Boolean" ? (
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(e) => updateParam(node.id, prop.name, e.target.checked)}
                    className="block mt-1"
                  />
                ) : (
                  <input
                    type={prop.dataType === "Integer" ? "number" : "text"}
                    value={value as string | number}
                    onChange={(e) =>
                      updateParam(
                        node.id,
                        prop.name,
                        prop.dataType === "Integer" ? Number(e.target.value) : e.target.value
                      )
                    }
                    className="w-full text-sm border rounded px-2 py-1 mt-0.5"
                  />
                )}
              </label>
            );
          })}
        </div>
      )}

      {node.rawConfigBlobs && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 font-medium">Contenu additionnel</div>
          {Object.entries(node.rawConfigBlobs).map(([key, xml]) => {
            const isDictionary = node.type === "KeyValueListAOX" && key === "Dictionary";
            const model = isDictionary ? parseDictionaryBlob(xml) : null;

            if (model && model.kind !== "unsupported") {
              return (
                <div key={key}>
                  <div className="text-xs text-gray-500 mb-1">{key} — édition assistée</div>
                  <DictionaryEditor
                    key={`${node.id}-${key}`}
                    model={model}
                    onSave={(rawXml) => updateRawConfigBlob(node.id, key, rawXml)}
                  />
                </div>
              );
            }

            return (
              <div key={key}>
                <div className="text-xs text-gray-500">
                  {key}
                  {model?.kind === "unsupported" ? (
                    <span className="text-amber-600"> — {model.reason}</span>
                  ) : (
                    " (non éditable dans cette version)"
                  )}
                </div>
                <textarea
                  readOnly
                  value={xml}
                  className="w-full text-[10px] font-mono border rounded p-1 h-24 bg-gray-50"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
