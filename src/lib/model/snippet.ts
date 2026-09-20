import { v4 as uuidv4 } from "uuid";
import type { PortInstance, WorkflowNode } from "./types";

export interface WorkflowSnippet {
  id: string;
  name: string;
  /** Type du nœud racine, affiché dans la palette pour identifier rapidement le snippet. */
  rootType: string;
  createdAt: string;
  rootNodeId: string;
  /** Sous-graphe capturé, avec les ids d'origine au moment de la capture
   * (toujours remappés vers des ids frais à l'instanciation, jamais réutilisés
   * tels quels pour éviter toute collision avec le graphe courant). */
  nodes: Record<string, WorkflowNode>;
}

/**
 * Capture le sous-graphe atteignable en descendant depuis `startId` (feuilles
 * incluses). Clone profondément chaque nœud pour que le snippet soit
 * totalement indépendant du graphe source (une modification ultérieure du
 * graphe ne doit jamais affecter un snippet déjà enregistré).
 */
export function extractSubgraph(
  graph: { nodes: Record<string, WorkflowNode> },
  startId: string
): { rootNodeId: string; nodes: Record<string, WorkflowNode> } {
  const nodes: Record<string, WorkflowNode> = {};
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (nodes[id]) continue;
    const node = graph.nodes[id];
    if (!node) continue;
    nodes[id] = structuredClone(node);
    for (const port of Object.values(node.ports)) {
      stack.push(...port.connectedNodeIds);
    }
  }
  return { rootNodeId: startId, nodes };
}

/**
 * Instancie un snippet : remplace tous les ids internes par des ids frais
 * (uuid), y compris dans les références des ports, pour pouvoir l'insérer
 * dans un graphe existant sans jamais entrer en collision avec ses ids.
 * Construction en deux passes (pas de récursion) : insensible à un
 * éventuel cycle qui se serait glissé dans les données.
 */
export function instantiateSubgraph(snippet: {
  rootNodeId: string;
  nodes: Record<string, WorkflowNode>;
}): { rootNodeId: string; nodes: Record<string, WorkflowNode> } {
  const idMap = new Map<string, string>();
  for (const oldId of Object.keys(snippet.nodes)) {
    idMap.set(oldId, uuidv4());
  }

  const nodes: Record<string, WorkflowNode> = {};
  for (const [oldId, node] of Object.entries(snippet.nodes)) {
    const newId = idMap.get(oldId)!;
    const clonedPorts: Record<string, PortInstance> = {};
    for (const [portName, port] of Object.entries(node.ports)) {
      clonedPorts[portName] = {
        ...port,
        connectedNodeIds: port.connectedNodeIds.map((cid) => idMap.get(cid) ?? cid),
      };
    }
    const cloned = structuredClone(node);
    nodes[newId] = { ...cloned, id: newId, ports: clonedPorts };
  }

  return { rootNodeId: idMap.get(snippet.rootNodeId)!, nodes };
}
