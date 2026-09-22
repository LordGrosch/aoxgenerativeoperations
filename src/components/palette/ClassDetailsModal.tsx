"use client";

import type { ClassDef } from "@/lib/catalog/catalogTypes";
import { describePortRequirement } from "@/lib/compatibility/compatibilityEngine";

interface Props {
  classDef: ClassDef;
  onClose: () => void;
}

export default function ClassDetailsModal({ classDef, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-sm break-all">{classDef.type}</div>
            <div className="text-xs text-gray-500">
              {classDef.category}
              {classDef.module ? ` · ${classDef.module}` : ""}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none shrink-0">
            ✕
          </button>
        </div>

        {classDef.documentation && (
          <p className="text-xs text-gray-600 whitespace-pre-line border-l-2 border-gray-200 pl-2 mb-3">
            {classDef.documentation}
          </p>
        )}

        {classDef.scalarProperties.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-medium text-gray-500 mb-1">Paramètres</div>
            <div className="space-y-0.5 text-xs">
              {classDef.scalarProperties.map((p) => (
                <div key={p.name} className="flex justify-between gap-2">
                  <span className={p.mandatory ? "text-red-600" : "text-gray-700"}>
                    {p.name}
                    {p.mandatory ? " *" : ""}
                  </span>
                  <span className="text-gray-400 shrink-0">{p.dataType}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {classDef.portProperties.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Ports (règles de compatibilité)</div>
            <div className="space-y-1.5 text-xs">
              {classDef.portProperties.map((p) => {
                const req = describePortRequirement(classDef.type, p.name);
                return (
                  <div key={p.name} className="border rounded p-1.5">
                    <div className={p.mandatory ? "text-red-600 font-medium" : "text-gray-700 font-medium"}>
                      {p.name}
                      {p.mandatory ? " *" : ""}
                      {req.isList ? " (liste)" : ""}
                    </div>
                    <div className={req.status === "known" ? "text-gray-600" : "text-amber-600 italic"}>
                      accepte : {req.ruleText}
                    </div>
                    {req.note && <div className="text-gray-400 mt-0.5">{req.note}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {classDef.scalarProperties.length === 0 && classDef.portProperties.length === 0 && (
          <p className="text-xs text-gray-400 italic">Aucun paramètre ni port déclaré pour cette classe.</p>
        )}
      </div>
    </div>
  );
}
