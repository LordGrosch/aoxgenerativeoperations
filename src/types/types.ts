/**
 * Modèle interne du workflow AOX.
 *
 * Rappel des règles observées sur les fichiers réels (voir analyse) :
 * - Un fichier AOX est un arbre unique, enraciné sur un seul <ObjectAOX> (pas de
 *   wrapper, pas de multi-racine).
 * - Il n'existe AUCUN mécanisme de référence/id dans le format XML : toute
 *   réutilisation d'une opération est une duplication physique du sous-arbre.
 *   Le modèle interne, lui, autorise le partage d'un nœud entre plusieurs
 *   parents (fan-out) ; c'est le générateur XML qui se chargera de dupliquer
 *   au moment de la sérialisation.
 * - Un "port" correspond à une Property du catalogue dont le DataType est
 *   ObjectAOX / DynamicObjectAOX (jamais String/Integer/Boolean/None).
 * - Le caractère "liste" d'un port ne se déduit PAS du DataType déclaré
 *   (observé : DynamicObjectAOX, ObjectAOX, ObjectAOXList selon les fichiers,
 *   de façon incohérente). Il se déduit uniquement de la structure réelle :
 *   présence d'un <ListObjectAOX> comme enfant direct du <Param>.
 */

/** Valeur scalaire d'un paramètre de configuration (non connectable). */
export type ScalarValue = string | number | boolean;

/** DataType scalaire tel qu'observé dans les Param des fichiers d'instance. */
export type ScalarDataType = "String" | "Integer" | "Boolean" | "None";

/** Un paramètre de configuration simple (jamais un port). */
export interface ParamValue {
  name: string;
  dataType: ScalarDataType;
  value: ScalarValue;
}

/**
 * Un port connectable sur un nœud, correspondant à un Param dont le contenu
 * est un <ObjectAOX> (port simple) ou un <ListObjectAOX> (port liste).
 *
 * - isList = false : connectedNodeIds contient 0 ou 1 id.
 * - isList = true  : connectedNodeIds contient 0..N ids, dans l'ordre du XML.
 */
export interface PortInstance {
  name: string;
  isList: boolean;
  connectedNodeIds: string[];
  /**
   * DataType tel que déclaré sur le <Param> source ("DynamicObjectAOX",
   * "ObjectAOX", "ObjectAOXList" observés, de façon incohérente selon les
   * fichiers). Préservé pour la régénération XML afin de rester au plus
   * près du fichier d'origine. Vaut "DynamicObjectAOX" par défaut pour un
   * port créé depuis l'éditeur (jamais chargé depuis un fichier).
   */
  declaredDataType: string;
}

/**
 * Un nœud du graphe, correspondant à un <ObjectAOX Category="..." Type="...">.
 * `id` est un identifiant généré côté éditeur : il n'existe pas dans le XML
 * source et ne doit jamais être écrit dans le XML généré.
 */
export interface WorkflowNode {
  id: string;
  category: string; // ObjectAOX@Category
  type: string; // ObjectAOX@Type
  /** Paramètres scalaires, indexés par Param@Name. */
  params: Record<string, ParamValue>;
  /** Ports connectables, indexés par Param@Name. */
  ports: Record<string, PortInstance>;
  /**
   * Contenu brut préservé tel quel pour les blocs non modélisés
   * structurellement (ex. KeyValueListAOX / HTMLT_Parameters).
   * Indexé par nom de port. Restitué sans interprétation à la génération.
   */
  rawConfigBlobs?: Record<string, string>;
}

/** Représentation interne complète d'un fichier de workflow AOX. */
export interface WorkflowGraph {
  rootNodeId: string;
  nodes: Record<string, WorkflowNode>;
}

/** Ajoute un nœud au graphe (utilitaire de construction, sans validation). */
export function addNode(graph: WorkflowGraph, node: WorkflowNode): void {
  graph.nodes[node.id] = node;
}

/** Ensemble des ids atteignables en descendant depuis la racine via les ports. */
export function getReachableNodeIds(graph: WorkflowGraph): Set<string> {
  const reachable = new Set<string>();
  const stack = [graph.rootNodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = graph.nodes[id];
    if (!node) continue;
    for (const port of Object.values(node.ports)) {
      stack.push(...port.connectedNodeIds);
    }
  }
  return reachable;
}

/**
 * Supprime du graphe tous les nœuds qui ne sont plus atteignables depuis la
 * racine (ex. après suppression manuelle d'un nœud, ses anciens enfants
 * peuvent se retrouver orphelins s'ils n'étaient utilisés que par lui).
 */
export function pruneUnreachableNodes(graph: WorkflowGraph): void {
  const reachable = getReachableNodeIds(graph);
  for (const id of Object.keys(graph.nodes)) {
    if (!reachable.has(id)) delete graph.nodes[id];
  }
}

/** Récupère un nœud par id, lève une erreur explicite s'il est absent. */
export function getNode(graph: WorkflowGraph, id: string): WorkflowNode {
  const node = graph.nodes[id];
  if (!node) {
    throw new Error(`WorkflowGraph: node "${id}" not found.`);
  }
  return node;
}

/**
 * Liste les ids de tous les nœuds ayant au moins deux parents (fan-out).
 * Utile pour avertir l'utilisateur qu'une duplication aura lieu à la
 * génération XML.
 */
export function findFanOutNodeIds(graph: WorkflowGraph): string[] {
  const parentCount = new Map<string, number>();
  for (const node of Object.values(graph.nodes)) {
    for (const port of Object.values(node.ports)) {
      for (const childId of port.connectedNodeIds) {
        parentCount.set(childId, (parentCount.get(childId) ?? 0) + 1);
      }
    }
  }
  return [...parentCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
}
