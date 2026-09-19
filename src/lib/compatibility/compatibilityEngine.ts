import type { CompatibilityRule } from "./compatibilityTypes";
import { compatibilityTable } from "./compatibilityRules";

/**
 * Convention des classes "passerelle" : InputStreamAOX_<Famille>_Operation
 * a toujours un port unique "OperationAOX" qui attend une Category
 * "OperationAOX_Output<Famille>". Observé pour Text / Binary / Image /
 * ItemDataList. Gérée génériquement plutôt que dupliquée dans la table :
 * c'est un pattern de nommage systématique du catalogue, pas une
 * coïncidence entre exemples isolés.
 */
const GATEWAY_PATTERN = /^InputStreamAOX_(.+)_Operation$/;
const GATEWAY_PORT_NAME = "OperationAOX";

export type CompatibilityResult =
  | { status: "compatible" }
  | { status: "incompatible"; reason: string }
  /** Aucune règle connue : on bloque par défaut, mais en le disant clairement. */
  | { status: "unknown"; reason: string };

/**
 * Indique si un port doit être créé en mode "liste" lors d'une première
 * connexion faite depuis l'éditeur (jamais utilisé pour un fichier chargé :
 * le parser déduit toujours ça structurellement, voir workflowParser).
 * Les ports "passerelle" (*_Operation.OperationAOX) sont toujours simples.
 */
export function isPortListCapable(ownerType: string, portName: string): boolean {
  if (resolveGatewayRule(ownerType, portName)) return false;
  const key = `${ownerType}.${portName}` as const;
  return compatibilityTable[key]?.isList ?? false;
}

function ruleMatches(rule: CompatibilityRule, candidateCategory: string): boolean {
  switch (rule.kind) {
    case "category":
      return candidateCategory === rule.category;
    case "categoryPrefix":
      return candidateCategory === rule.prefix || candidateCategory.startsWith(`${rule.prefix}_`);
  }
}

function resolveGatewayRule(ownerType: string, portName: string): CompatibilityRule | null {
  if (portName !== GATEWAY_PORT_NAME) return null;
  const match = GATEWAY_PATTERN.exec(ownerType);
  if (!match) return null;
  const family = match[1]; // ex: "Text", "Binary", "Image", "ItemDataList"
  return { kind: "category", category: `OperationAOX_Output${family}` };
}

/**
 * Détermine si un nœud de Category `candidateCategory` peut être branché
 * sur le port `portName` d'un nœud de Type `ownerType`.
 *
 * Politique par défaut : DENY. Une connexion sans règle connue est
 * `unknown`, traitée comme bloquée par l'éditeur — jamais autorisée par
 * défaut. C'est un choix délibéré (sécurité avant permissivité) : mieux
 * vaut devoir enrichir la table avec un nouvel exemple réel que d'autoriser
 * silencieusement une connexion jamais vue en pratique.
 */
export function checkPortCompatibility(
  ownerType: string,
  portName: string,
  candidateCategory: string
): CompatibilityResult {
  const gatewayRule = resolveGatewayRule(ownerType, portName);
  const key = `${ownerType}.${portName}` as const;
  const entry = compatibilityTable[key];

  const rule = gatewayRule ?? entry?.rule;
  if (!rule) {
    return {
      status: "unknown",
      reason:
        `Aucune règle de compatibilité connue pour "${ownerType}.${portName}". ` +
        `Ajoutez un exemple réel utilisant ce port pour la définir.`,
    };
  }

  if (ruleMatches(rule, candidateCategory)) {
    return { status: "compatible" };
  }

  const expected = rule.kind === "category" ? rule.category : `${rule.prefix}_*`;
  return {
    status: "incompatible",
    reason: `"${ownerType}.${portName}" attend la famille "${expected}", reçu "${candidateCategory}".`,
  };
}
