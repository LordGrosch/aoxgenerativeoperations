import type { Edge, Node } from "reactflow";
import type { WorkflowGraph, WorkflowNode } from "../model/types";
import type { CatalogIndex } from "../catalog/catalogTypes";
import { describeConnection } from "../compatibility/compatibilityEngine";

/**
 * Convention de représentation visuelle : chaque WorkflowNode a un unique
 * handle de sortie ("out", à droite) représentant "ce que ce nœud produit",
 * et un handle d'entrée par port déclaré (à gauche). Une arête va donc
 * toujours du handle de sortie d'un enfant vers un handle d'entrée nommé de
 * son parent — c'est la traduction visuelle directe de "parent.ports[x]
 * contient childId".
 */
export const OUTPUT_HANDLE_ID = "out";
const INPUT_HANDLE_PREFIX = "in:";

export function inputHandleId(portName: string): string {
  return `${INPUT_HANDLE_PREFIX}${portName}`;
}

export function portNameFromHandle(handleId: string): string {
  return handleId.startsWith(INPUT_HANDLE_PREFIX) ? handleId.slice(INPUT_HANDLE_PREFIX.length) : handleId;
}

export interface AoxPortView {
  name: string;
  mandatory: boolean;
}

export interface AoxNodeData {
  node: WorkflowNode;
  /** Union des ports déclarés par le catalogue et des ports réellement
   * présents sur le nœud (utile si le fichier source utilise un port non
   * documenté par le catalogue — on veut quand même pouvoir le voir/déconnecter). */
  portViews: AoxPortView[];
  isRoot: boolean;
  /** Documentation du catalogue pour ce Type, si disponible. */
  documentation?: string;
}

export interface AoxEdgeData {
  parentId: string;
  portName: string;
  childId: string;
  note: string;
  status: "compatible" | "unknown" | "incompatible";
}

export type NodeKind = "operation" | "input" | "output" | "other";

/**
 * Classifie une Category en "nature" visuelle (Operation / Input / Output /
 * autre). Purement indicatif pour l'UI, sans lien avec la compatibilité.
 */
export function getNodeKind(category: string): NodeKind {
  if (category.startsWith("OperationAOX")) return "operation";
  if (category.startsWith("InputStreamAOX") || category === "InputAOX") return "input";
  if (category.startsWith("OutputStreamAOX")) return "output";
  return "other";
}

export function toReactFlowElements(
  graph: WorkflowGraph,
  layout: Record<string, { x: number; y: number }>,
  catalog: CatalogIndex
): { nodes: Node<AoxNodeData>[]; edges: Edge<AoxEdgeData>[] } {
  const nodes: Node<AoxNodeData>[] = [];
  const edges: Edge<AoxEdgeData>[] = [];

  for (const node of Object.values(graph.nodes)) {
    const classDef = catalog.classesByType.get(node.type);
    const declared = classDef?.portProperties ?? [];
    const declaredNames = new Set(declared.map((p) => p.name));
    const actualNames = Object.keys(node.ports);

    const portViews: AoxPortView[] = [
      ...declared.map((p) => ({ name: p.name, mandatory: p.mandatory })),
      ...actualNames.filter((n) => !declaredNames.has(n)).map((n) => ({ name: n, mandatory: false })),
    ];

    nodes.push({
      id: node.id,
      type: "aoxNode",
      position: layout[node.id] ?? { x: 0, y: 0 },
      data: { node, portViews, isRoot: node.id === graph.rootNodeId, documentation: classDef?.documentation },
    });

    for (const port of Object.values(node.ports)) {
      port.connectedNodeIds.forEach((childId, index) => {
        const child = graph.nodes[childId];
        if (!child) return; // défensif : référence orpheline
        const { status, note } = describeConnection(node.type, port.name, child.category);
        edges.push({
          id: `${childId}->${node.id}:${port.name}:${index}`,
          source: childId,
          sourceHandle: OUTPUT_HANDLE_ID,
          target: node.id,
          targetHandle: inputHandleId(port.name),
          type: "aoxEdge",
          data: { parentId: node.id, portName: port.name, childId, note, status },
        });
      });
    }
  }

  return { nodes, edges };
}
