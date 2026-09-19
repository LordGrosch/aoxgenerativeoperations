"use client";

import { useState } from "react";

interface Props {
  ownerType: string;
  portName: string;
  candidateCategory: string;
}

function buildSnippet(ownerType: string, portName: string, candidateCategory: string): string {
  return `"${ownerType}.${portName}": {
  "rule": { "kind": "category", "category": "${candidateCategory}" },
  "observed": true,
  "note": "TODO: décrire l'exemple d'origine.",
  "isList": false
},`;
}

/**
 * Petit bouton "📋" qui copie dans le presse-papier un squelette de règle
 * prêt à coller dans src/data/compatibility-rules.json, préremplie avec la
 * Category réellement rencontrée (souvent la seule valeur à garder telle
 * quelle) — il ne reste plus qu'à ajuster "isList" et le "note" si besoin.
 */
export default function CompatibilitySnippetButton({ ownerType, portName, candidateCategory }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const snippet = buildSnippet(ownerType, portName, candidateCategory);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Contexte non sécurisé / permission refusée : repli manuel.
      window.prompt("Copie automatique indisponible, copiez manuellement :", snippet);
    }
  };

  return (
    <button
      onClick={handleCopy}
      title="Copier un squelette de règle pour compatibility-rules.json"
      className="ml-1 shrink-0 text-[11px] border rounded px-1 hover:bg-white"
    >
      {copied ? "✅" : "📋"}
    </button>
  );
}
