import { getNode, type WorkflowGraph, type WorkflowNode, type ParamValue } from "../model/types";

/**
 * Génère le XML d'un workflow à partir du modèle interne.
 *
 * Point structurant : le format AOX ne connaît aucun mécanisme de
 * référence/id. Si un nœud a plusieurs parents dans le modèle interne
 * (fan-out), il est donc automatiquement dupliqué intégralement à chaque
 * occurrence — c'est un effet naturel de la récursion ci-dessous (le
 * sous-arbre est régénéré depuis le modèle à chaque fois qu'un id apparaît
 * dans un port), pas un traitement spécial. Utilisez
 * `findFanOutNodeIds(graph)` en amont pour avertir l'utilisateur avant
 * génération si cela doit rester visible/contrôlé dans l'éditeur.
 *
 * Hypothèse assumée sur le format des booléens : les fichiers réels
 * observés jusqu'ici n'utilisent que la valeur "1" pour "vrai"
 * (bCanEditContent="1", bJpegCompressionEnabled="1"). Aucun exemple de
 * "faux" n'a encore été vu. On sérialise donc en "1"/"0". À confirmer sur
 * d'autres fichiers réels — si le format "True"/"False" existe aussi
 * quelque part, il faudra soit détecter le style par nœud, soit le
 * paramétrer.
 */

const INDENT_UNIT = "  ";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serializeScalarValue(param: ParamValue): string {
  if (param.dataType === "Boolean") {
    return param.value ? "1" : "0";
  }
  return String(param.value);
}

function serializeParamScalar(param: ParamValue, pad: string): string {
  return `${pad}<Param Name="${escapeAttr(param.name)}" DataType="${param.dataType}" Value="${escapeAttr(
    serializeScalarValue(param)
  )}" />`;
}

function serializeObjectAOX(graph: WorkflowGraph, nodeId: string, depth: number): string {
  const node: WorkflowNode = getNode(graph, nodeId);
  const pad = INDENT_UNIT.repeat(depth);
  const childPad = INDENT_UNIT.repeat(depth + 1);
  const lines: string[] = [];

  lines.push(`${pad}<ObjectAOX Category="${escapeAttr(node.category)}" Type="${escapeAttr(node.type)}">`);

  const scalarParams = Object.values(node.params);
  if (scalarParams.length > 0) {
    lines.push(`${childPad}<!--Paramètres-->`);
    for (const param of scalarParams) {
      lines.push(serializeParamScalar(param, childPad));
    }
  }

  const ports = Object.values(node.ports);
  if (ports.length > 0) {
    lines.push(`${childPad}<!--Input/Output-->`);
  }
  for (const port of ports) {
    lines.push(`${childPad}<Param Name="${escapeAttr(port.name)}" DataType="${escapeAttr(port.declaredDataType)}">`);
    if (port.isList) {
      lines.push(`${childPad}${INDENT_UNIT}<ListObjectAOX>`);
      port.connectedNodeIds.forEach((childId, index) => {
        lines.push(`${childPad}${INDENT_UNIT}<!-- Élément ${index + 1} -->`);
        lines.push(serializeObjectAOX(graph, childId, depth + 3));
      });
      lines.push(`${childPad}${INDENT_UNIT}</ListObjectAOX>`);
    } else {
      for (const childId of port.connectedNodeIds) {
        lines.push(serializeObjectAOX(graph, childId, depth + 2));
      }
    }
    lines.push(`${childPad}</Param>`);
  }

  if (node.rawConfigBlobs) {
    for (const rawXml of Object.values(node.rawConfigBlobs)) {
      // Le blob contient déjà un <Param>...</Param> complet et autonome
      // (voir workflowParser). On le réindente simplement pour la lisibilité.
      const rawLines = rawXml.split("\n").map((line) => `${childPad}${line}`);
      lines.push(...rawLines);
    }
  }

  lines.push(`${pad}</ObjectAOX>`);
  return lines.join("\n");
}

/** Génère le XML complet d'un workflow (racine <ObjectAOX> unique, sans wrapper). */
export function generateWorkflowXml(graph: WorkflowGraph): string {
  return serializeObjectAOX(graph, graph.rootNodeId, 0) + "\n";
}
