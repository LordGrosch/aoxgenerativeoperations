import type { CatalogIndex } from "../catalog/catalogTypes";
import { getNode, type WorkflowGraph } from "../model/types";
import { checkPortCompatibility } from "../compatibility/compatibilityEngine";
import type { ValidationIssue, ValidationResult } from "./validationTypes";

function isScalarValueEmpty(value: string | number | boolean): boolean {
  return value === "" || value === undefined || value === null;
}

/**
 * Valide un WorkflowGraph par rapport au catalogue :
 *  - classe inconnue / Category incohérente avec le catalogue,
 *  - ports et paramètres obligatoires manquants (Mandatory="True" au catalogue),
 *  - ports/paramètres présents mais non déclarés par le catalogue (dérive possible),
 *  - compatibilité de chaque connexion réelle (via compatibilityEngine),
 *  - cycles (un nœud qui se retrouve son propre ancêtre — invalide, à ne
 *    pas confondre avec un fan-out légitime où un même nœud a plusieurs
 *    parents indépendants),
 *  - fan-out (information : le nœud sera dupliqué à la génération XML).
 */
export function validateWorkflow(graph: WorkflowGraph, catalog: CatalogIndex): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Un même nœud peut être visité plusieurs fois depuis des parents
  // différents (fan-out légitime) : on ne le compte qu'une fois pour les
  // avertissements de fan-out, via ce compteur de parents.
  const parentCount = new Map<string, number>();
  for (const node of Object.values(graph.nodes)) {
    for (const port of Object.values(node.ports)) {
      for (const childId of port.connectedNodeIds) {
        parentCount.set(childId, (parentCount.get(childId) ?? 0) + 1);
      }
    }
  }
  const fanOutWarned = new Set<string>();

  function walk(nodeId: string, path: string, ancestors: Set<string>): void {
    if (ancestors.has(nodeId)) {
      issues.push({
        severity: "error",
        code: "CYCLE_DETECTED",
        nodeId,
        path,
        message: `Cycle détecté : le nœud apparaît déjà comme ancêtre de lui-même sur ce chemin (${path}).`,
      });
      return; // on n'aggrave pas en redescendant dans un cycle
    }

    const node = getNode(graph, nodeId);

    if ((parentCount.get(nodeId) ?? 0) > 1 && !fanOutWarned.has(nodeId)) {
      fanOutWarned.add(nodeId);
      issues.push({
        severity: "warning",
        code: "FAN_OUT_DUPLICATION",
        nodeId,
        path,
        message:
          `Ce nœud (${node.type}) a ${parentCount.get(nodeId)} parents. ` +
          `Le format AOX ne supportant aucune référence, il sera dupliqué intégralement ` +
          `à chaque endroit lors de la génération XML.`,
      });
    }

    const classDef = catalog.classesByType.get(node.type);

    if (!classDef) {
      issues.push({
        severity: "error",
        code: "UNKNOWN_CLASS",
        nodeId,
        path,
        message: `Type "${node.type}" absent du catalogue : impossible de valider ses ports/paramètres.`,
      });
    } else {
      if (classDef.category !== node.category) {
        issues.push({
          severity: "warning",
          code: "CATEGORY_MISMATCH",
          nodeId,
          path,
          message:
            `Category "${node.category}" du nœud ne correspond pas à la Category "${classDef.category}" ` +
            `déclarée par le catalogue pour le Type "${node.type}".`,
        });
      }

      for (const portDef of classDef.portProperties) {
        const port = node.ports[portDef.name];
        const hasRawOverride = node.rawConfigBlobs !== undefined && portDef.name in node.rawConfigBlobs;
        const isEmpty = (!port || port.connectedNodeIds.length === 0) && !hasRawOverride;
        if (portDef.mandatory && isEmpty) {
          issues.push({
            severity: "error",
            code: "MISSING_MANDATORY_PORT",
            nodeId,
            path,
            message: `Port obligatoire "${portDef.name}" manquant sur "${node.type}".`,
          });
        }
      }

      for (const propDef of classDef.scalarProperties) {
        const param = node.params[propDef.name];
        // Une valeur fournie via <AttributeTranslation> (contenu dynamique,
        // ex. <GetVariable>) atterrit en rawConfigBlobs plutôt qu'en param
        // classique (voir workflowParser) : on ne sait pas l'interpréter,
        // mais sa seule présence suffit à considérer le paramètre comme
        // renseigné, pour éviter un faux "manquant".
        const hasRawOverride = node.rawConfigBlobs !== undefined && propDef.name in node.rawConfigBlobs;
        const isEmpty = (!param || isScalarValueEmpty(param.value)) && !hasRawOverride;
        if (propDef.mandatory && isEmpty) {
          issues.push({
            severity: "error",
            code: "MISSING_MANDATORY_PARAM",
            nodeId,
            path,
            message: `Paramètre obligatoire "${propDef.name}" manquant sur "${node.type}".`,
          });
        }
      }

      const knownPortNames = new Set(classDef.portProperties.map((p) => p.name));
      const knownParamNames = new Set(classDef.scalarProperties.map((p) => p.name));

      for (const portName of Object.keys(node.ports)) {
        if (!knownPortNames.has(portName)) {
          issues.push({
            severity: "warning",
            code: "UNKNOWN_PORT",
            nodeId,
            path,
            message: `Port "${portName}" présent sur le nœud mais non déclaré par le catalogue pour "${node.type}".`,
          });
        }
      }
      for (const paramName of Object.keys(node.params)) {
        if (!knownParamNames.has(paramName)) {
          issues.push({
            severity: "warning",
            code: "UNKNOWN_PARAM",
            nodeId,
            path,
            message: `Paramètre "${paramName}" présent sur le nœud mais non déclaré par le catalogue pour "${node.type}".`,
          });
        }
      }
    }

    for (const port of Object.values(node.ports)) {
      port.connectedNodeIds.forEach((childId, index) => {
        const child = getNode(graph, childId);
        const childPath = `${path}.${port.name}${port.isList ? `[${index}]` : ""}`;
        const compat = checkPortCompatibility(node.type, port.name, child.category);

        if (compat.status === "incompatible") {
          issues.push({
            severity: "error",
            code: "INCOMPATIBLE_CONNECTION",
            nodeId: childId,
            path: childPath,
            message: compat.reason,
          });
        } else if (compat.status === "unknown") {
          issues.push({
            severity: "warning",
            code: "UNKNOWN_COMPATIBILITY_RULE",
            nodeId: childId,
            path: childPath,
            message: compat.reason,
            meta: { ownerType: compat.ownerType, portName: compat.portName, candidateCategory: compat.candidateCategory },
          });
        }

        const nextAncestors = new Set(ancestors);
        nextAncestors.add(nodeId);
        walk(childId, childPath, nextAncestors);
      });
    }
  }

  const rootNode = getNode(graph, graph.rootNodeId);
  walk(graph.rootNodeId, rootNode.type, new Set());

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return { issues, errorCount, warningCount, isValid: errorCount === 0 };
}
