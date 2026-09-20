"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { serializeDictionaryBlob, type KeyValueEditorModel } from "@/lib/rawconfig/keyValueEditor";

interface Props {
  model: KeyValueEditorModel;
  onSave: (rawXml: string) => void;
}

/**
 * Édite un modèle "json" ou "xml" (jamais "unsupported" : l'appelant garde
 * l'affichage en lecture seule dans ce cas). État local avec bouton
 * "Enregistrer" explicite plutôt qu'une sauvegarde à chaque frappe : on
 * évite de committer un JSON invalide en cours de frappe dans le graphe.
 */
export default function DictionaryEditor({ model, onSave }: Props) {
  const [draft, setDraft] = useState(model);
  const dirty = JSON.stringify(draft) !== JSON.stringify(model);

  if (draft.kind === "unsupported") return null;

  const handleSave = () => onSave(serializeDictionaryBlob(draft));

  if (draft.kind === "json") {
    return (
      <div className="space-y-2">
        {draft.entries.map((entry) => (
          <div key={entry.id} className="border rounded p-1.5 space-y-1">
            <div className="flex items-center gap-1">
              <input
                className="flex-1 text-xs border rounded px-1 py-0.5"
                value={entry.name}
                placeholder="name"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    entries: draft.entries.map((it) => (it.id === entry.id ? { ...it, name: e.target.value } : it)),
                  })
                }
              />
              <button
                onClick={() => setDraft({ ...draft, entries: draft.entries.filter((it) => it.id !== entry.id) })}
                className="text-[10px] text-red-600 border border-red-200 rounded px-1 shrink-0"
              >
                ✕
              </button>
            </div>
            <textarea
              className="w-full text-[10px] font-mono border rounded p-1 h-16"
              value={entry.valueJson}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  entries: draft.entries.map((it) =>
                    it.id === entry.id ? { ...it, valueJson: e.target.value } : it
                  ),
                })
              }
            />
          </div>
        ))}
        <div className="flex gap-1">
          <button
            onClick={() =>
              setDraft({ ...draft, entries: [...draft.entries, { id: uuidv4(), name: "", valueJson: '""' }] })
            }
            className="text-xs border rounded px-2 py-0.5 hover:bg-gray-50"
          >
            + ajouter
          </button>
          {dirty && (
            <button onClick={handleSave} className="text-xs bg-blue-600 text-white rounded px-2 py-0.5">
              Enregistrer
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {draft.entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-1">
          <input
            className="w-24 shrink-0 text-xs border rounded px-1 py-0.5"
            value={entry.key}
            placeholder="Key"
            onChange={(e) =>
              setDraft({
                ...draft,
                entries: draft.entries.map((it) => (it.id === entry.id ? { ...it, key: e.target.value } : it)),
              })
            }
          />
          <input
            className="flex-1 text-xs border rounded px-1 py-0.5"
            value={entry.value}
            placeholder="Value"
            onChange={(e) =>
              setDraft({
                ...draft,
                entries: draft.entries.map((it) => (it.id === entry.id ? { ...it, value: e.target.value } : it)),
              })
            }
          />
          <button
            onClick={() => setDraft({ ...draft, entries: draft.entries.filter((it) => it.id !== entry.id) })}
            className="text-[10px] text-red-600 border border-red-200 rounded px-1 shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        <button
          onClick={() => setDraft({ ...draft, entries: [...draft.entries, { id: uuidv4(), key: "", value: "" }] })}
          className="text-xs border rounded px-2 py-0.5 hover:bg-gray-50"
        >
          + ajouter
        </button>
        {dirty && (
          <button onClick={handleSave} className="text-xs bg-blue-600 text-white rounded px-2 py-0.5">
            Enregistrer
          </button>
        )}
      </div>
    </div>
  );
}
