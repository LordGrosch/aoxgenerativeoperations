import dagre from "dagre";
import type { WorkflowGraph } from "../model/types";

const NODE_WIDTH = 220;
const NODE_HEIGHT_BASE = 44;
const NODE_HEIGHT_PER_PORT = 24;

function estimateNodeHeight(portCount: number): number {
  return NODE_HEIGHT_BASE + portCount * NODE_HEIGHT_PER_PORT;
}

/**
 * Calcule un layout initial via dagre, direction "LR" (gauche vers droite).
 * Le sens des arêtes fournies à dagre est enfant -> parent (le "producteur"
 * pointe vers son "consommateur"), ce qui place naturellement les feuilles
 * (fichiers, valeurs statiques...) à gauche et la racine à droite —
 * lecture standard d'un flux qui converge vers son résultat final.
 */
export function computeAutoLayout(graph: WorkflowGraph): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of Object.values(graph.nodes)) {
    const portCount = Object.keys(node.ports).length;
    g.setNode(node.id, { width: NODE_WIDTH, height: estimateNodeHeight(portCount) });
  }

  for (const node of Object.values(graph.nodes)) {
    for (const port of Object.values(node.ports)) {
      for (const childId of port.connectedNodeIds) {
        if (graph.nodes[childId]) {
          g.setEdge(childId, node.id);
        }
      }
    }
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of Object.values(graph.nodes)) {
    const pos = g.node(node.id);
    const height = estimateNodeHeight(Object.keys(node.ports).length);
    positions[node.id] = { x: pos.x - NODE_WIDTH / 2, y: pos.y - height / 2 };
  }
  return positions;
}
