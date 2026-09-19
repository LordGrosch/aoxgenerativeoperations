"use client";

import { useWorkflowStore } from "@/store/workflowStore";
import CompatibilitySnippetButton from "@/components/CompatibilitySnippetButton";

export default function Inspector() {
  const catalog = useWorkflowStore((s) => s.catalog);
  const graph = useWorkflowStore((s) => s.graph);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const validation = useWorkflowStore((s) => s.validation);
  const updateParam = useWorkflowStore((s) => s.updateParam);
  const deleteNode = useWorkflowStore((s) => s.deleteNode);

  if (!catalog || !graph || !selectedNodeId) {
    return <div className="p-3 text-sm text-gray-400">Sélectionnez un nœud pour voir ses propriétés.</div>;
  }

  const node = graph.nodes[selectedNodeId];
  if (!node) return null;

  const classDef = catalog.classesByType.get(node.type);
  const issues = (validation?.issues ?? []).filter((i) => i.nodeId === selectedNodeId);
  const isRoot = selectedNodeId === graph.rootNodeId;

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
        <div className="space-y-2">
          <div className="text-xs text-gray-500 font-medium">
            Contenu préservé tel quel (non éditable dans cette version)
          </div>
          {Object.entries(node.rawConfigBlobs).map(([key, xml]) => (
            <div key={key}>
              <div className="text-xs text-gray-500">{key}</div>
              <textarea
                readOnly
                value={xml}
                className="w-full text-[10px] font-mono border rounded p-1 h-24 bg-gray-50"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
