"use client";

import { useWorkflowStore } from "@/store/workflowStore";

export default function ValidationPanel() {
  const validation = useWorkflowStore((s) => s.validation);
  const selectNode = useWorkflowStore((s) => s.selectNode);

  if (!validation) return null;

  if (validation.issues.length === 0) {
    return <div className="px-3 py-1 text-xs text-green-700 bg-green-50 border-t">✅ Aucun problème détecté.</div>;
  }

  return (
    <div className="border-t max-h-32 overflow-y-auto text-xs bg-white">
      <div className="px-3 py-1 bg-gray-50 text-gray-500 sticky top-0 border-b">
        {validation.errorCount} erreur(s), {validation.warningCount} avertissement(s)
      </div>
      {validation.issues.map((issue, i) => (
        <button
          key={i}
          onClick={() => selectNode(issue.nodeId)}
          className={`w-full text-left px-3 py-1 border-b hover:bg-gray-50 ${
            issue.severity === "error" ? "text-red-700" : "text-amber-700"
          }`}
        >
          {issue.severity === "error" ? "❌" : "⚠️"} {issue.path} — {issue.message}
        </button>
      ))}
    </div>
  );
}
