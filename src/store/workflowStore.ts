import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { CatalogIndex } from "../lib/catalog/catalogTypes";
import { parseCatalog } from "../lib/catalog/catalogParser";
import { parseWorkflowXml } from "../lib/parser/workflowParser";
import { generateWorkflowXml } from "../lib/generator/workflowGenerator";
import { validateWorkflow } from "../lib/validation/validateWorkflow";
import type { ValidationResult } from "../lib/validation/validationTypes";
import { computeAutoLayout } from "../lib/layout/autoLayout";
import { pruneUnreachableNodes } from "../lib/model/types";
import type { ParamValue, WorkflowGraph, WorkflowNode } from "../lib/model/types";
import { checkPortCompatibility, isPortListCapable } from "../lib/compatibility/compatibilityEngine";
import { extractSubgraph, instantiateSubgraph, type WorkflowSnippet } from "../lib/model/snippet";

const SNIPPETS_STORAGE_KEY = "aox-snippets";
const MAX_HISTORY = 100;

function loadSnippetsFromLocalStorage(): WorkflowSnippet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SNIPPETS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkflowSnippet[]) : [];
  } catch {
    return [];
  }
}

function persistSnippets(snippets: WorkflowSnippet[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNIPPETS_STORAGE_KEY, JSON.stringify(snippets));
  } catch {
    // Quota dépassé ou storage indisponible : non bloquant.
  }
}

/** Clone profond pour les snapshots d'historique (les nœuds étant mutés en
 * place par plusieurs actions, une simple copie de référence capturerait
 * l'état APRÈS mutation, pas avant). */
function snapshotGraph(graph: WorkflowGraph | null): WorkflowGraph | null {
  return graph ? (structuredClone(graph) as WorkflowGraph) : null;
}

type Position = { x: number; y: number };
type ConnectResult = { ok: true } | { ok: false; reason: string };

/** Édition de paramètre en cours de "regroupement" : tant que l'utilisateur
 * continue de taper dans le MÊME champ, on ne crée pas un cran d'undo par
 * frappe — on garde seulement l'état d'avant le tout premier caractère. */
interface PendingParamEdit {
  nodeId: string;
  paramName: string;
  before: WorkflowGraph | null;
}

interface WorkflowState {
  catalog: CatalogIndex | null;
  graph: WorkflowGraph | null;
  layout: Record<string, Position>;
  selectedNodeId: string | null;
  validation: ValidationResult | null;
  /** XML tel que chargé initialement (avant toute édition), pour la vue diff. null si le workflow a été créé de zéro dans l'éditeur. */
  loadedXml: string | null;
  snippets: WorkflowSnippet[];

  past: (WorkflowGraph | null)[];
  future: (WorkflowGraph | null)[];
  pendingParamEdit: PendingParamEdit | null;
  undo: () => void;
  redo: () => void;

  loadCatalog: (xml: string) => void;
  loadWorkflow: (xml: string) => void;
  exportXml: () => string;

  selectNode: (id: string | null) => void;
  setNodePosition: (id: string, pos: Position) => void;

  /** Crée un nœud non connecté. Si aucun graphe n'existe encore, ce nœud en devient la racine. */
  addNode: (type: string) => string;
  deleteNode: (id: string) => void;
  updateParam: (nodeId: string, paramName: string, value: string | number | boolean) => void;
  updateRawConfigBlob: (nodeId: string, blobKey: string, newRawXml: string) => void;
  connect: (parentId: string, portName: string, childId: string) => ConnectResult;
  disconnect: (parentId: string, portName: string, childId: string) => void;

  loadSnippetsFromStorage: () => void;
  saveSnippetFromNode: (nodeId: string, name: string) => void;
  deleteSnippet: (id: string) => void;
  /** Instancie un snippet dans le graphe courant (ou en tant que racine si aucun graphe n'existe). Renvoie l'id du nœud racine inséré. */
  instantiateSnippet: (snippetId: string, dropPosition?: Position) => string;

  runValidation: () => void;
}

function createEmptyNode(type: string, catalog: CatalogIndex): WorkflowNode {
  const classDef = catalog.classesByType.get(type);
  if (!classDef) {
    throw new Error(`Type inconnu du catalogue : "${type}"`);
  }
  return { id: uuidv4(), category: classDef.category, type, params: {}, ports: {} };
}

/** true si `targetId` est atteignable en descendant depuis `startId` via les ports. */
function isReachableDownward(graph: WorkflowGraph, startId: string, targetId: string): boolean {
  const stack = [startId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === targetId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = graph.nodes[id];
    if (!node) continue;
    for (const port of Object.values(node.ports)) {
      stack.push(...port.connectedNodeIds);
    }
  }
  return false;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => {
  /**
   * À appeler en tête de chaque action mutante (sauf updateParam, qui gère
   * son propre regroupement). Termine proprement une édition de paramètre
   * en cours en la poussant dans l'historique, pour ne jamais la perdre si
   * une autre action survient pendant qu'un champ est en cours d'édition.
   */
  function flushPendingParamEdit(): void {
    const { pendingParamEdit, past } = get();
    if (pendingParamEdit) {
      const trimmed = [...past, pendingParamEdit.before].slice(-MAX_HISTORY);
      set({ past: trimmed, future: [], pendingParamEdit: null });
    }
  }

  function pushHistory(before: WorkflowGraph | null): void {
    const trimmed = [...get().past, before].slice(-MAX_HISTORY);
    set({ past: trimmed, future: [] });
  }

  return {
    catalog: null,
    graph: null,
    layout: {},
    selectedNodeId: null,
    validation: null,
    loadedXml: null,
    snippets: [],
    past: [],
    future: [],
    pendingParamEdit: null,

    undo: () => {
      const { pendingParamEdit, past, graph, future } = get();

      // Premier "annuler" pendant une frappe en cours : on revient juste à
      // l'état d'avant cette édition, sans consommer l'historique normal.
      if (pendingParamEdit) {
        set({ graph: snapshotGraph(pendingParamEdit.before), pendingParamEdit: null, selectedNodeId: null });
        get().runValidation();
        return;
      }

      if (past.length === 0) return;
      const previous = past[past.length - 1];
      set({
        past: past.slice(0, -1),
        future: [snapshotGraph(graph), ...future],
        graph: snapshotGraph(previous),
        selectedNodeId: null,
      });
      get().runValidation();
    },

    redo: () => {
      const { future, graph, past } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({
        future: future.slice(1),
        past: [...past, snapshotGraph(graph)],
        graph: snapshotGraph(next),
        selectedNodeId: null,
      });
      get().runValidation();
    },

    loadCatalog: (xml) => set({ catalog: parseCatalog(xml) }),

    loadWorkflow: (xml) => {
      // Charger un (nouveau) fichier réinitialise l'historique : "annuler"
      // vers un état d'un autre fichier n'aurait pas de sens.
      const graph = parseWorkflowXml(xml);
      const layout = computeAutoLayout(graph);
      set({
        graph,
        layout,
        selectedNodeId: null,
        loadedXml: xml,
        past: [],
        future: [],
        pendingParamEdit: null,
      });
      get().runValidation();
    },

    exportXml: () => {
      const graph = get().graph;
      return graph ? generateWorkflowXml(graph) : "";
    },

    selectNode: (id) => {
      flushPendingParamEdit();
      set({ selectedNodeId: id });
    },

    setNodePosition: (id, pos) => set((s) => ({ layout: { ...s.layout, [id]: pos } })),

    addNode: (type) => {
      flushPendingParamEdit();
      const { catalog, graph, layout } = get();
      if (!catalog) throw new Error("Catalogue non chargé.");
      const before = snapshotGraph(graph);
      const node = createEmptyNode(type, catalog);

      if (!graph) {
        const newGraph: WorkflowGraph = { rootNodeId: node.id, nodes: { [node.id]: node } };
        set({ graph: newGraph, layout: { [node.id]: { x: 0, y: 0 } }, selectedNodeId: node.id });
      } else {
        graph.nodes[node.id] = node;
        set({ graph: { ...graph }, layout: { ...layout, [node.id]: { x: 0, y: 0 } }, selectedNodeId: node.id });
      }
      pushHistory(before);
      get().runValidation();
      return node.id;
    },

    deleteNode: (id) => {
      flushPendingParamEdit();
      const { graph, layout } = get();
      if (!graph || id === graph.rootNodeId) return; // la racine ne se supprime pas directement
      const before = snapshotGraph(graph);

      for (const node of Object.values(graph.nodes)) {
        for (const port of Object.values(node.ports)) {
          port.connectedNodeIds = port.connectedNodeIds.filter((cid) => cid !== id);
        }
      }
      delete graph.nodes[id];
      pruneUnreachableNodes(graph);

      const newLayout: Record<string, Position> = {};
      for (const [nid, pos] of Object.entries(layout)) {
        if (graph.nodes[nid]) newLayout[nid] = pos;
      }

      set({ graph: { ...graph }, layout: newLayout, selectedNodeId: null });
      pushHistory(before);
      get().runValidation();
    },

    updateParam: (nodeId, paramName, value) => {
      const { graph, catalog, pendingParamEdit } = get();
      if (!graph || !catalog) return;
      const node = graph.nodes[nodeId];
      if (!node) return;

      // Nouveau champ édité (différent du précédent, ou aucune édition en
      // cours) : on committe l'édition précédente si besoin, puis on ouvre
      // une nouvelle entrée "en attente" pour CE champ, capturée avant sa
      // toute première modification.
      if (!pendingParamEdit || pendingParamEdit.nodeId !== nodeId || pendingParamEdit.paramName !== paramName) {
        flushPendingParamEdit();
        set({ pendingParamEdit: { nodeId, paramName, before: snapshotGraph(graph) } });
      }

      const classDef = catalog.classesByType.get(node.type);
      const propDef = classDef?.scalarProperties.find((p) => p.name === paramName);
      const declared = propDef?.dataType;
      const dataType: ParamValue["dataType"] =
        declared === "Integer" || declared === "Boolean" || declared === "None" ? declared : "String";

      node.params[paramName] = { name: paramName, dataType, value };
      set({ graph: { ...graph } });
      get().runValidation();
    },

    updateRawConfigBlob: (nodeId, blobKey, newRawXml) => {
      flushPendingParamEdit();
      const { graph } = get();
      if (!graph) return;
      const node = graph.nodes[nodeId];
      if (!node || !node.rawConfigBlobs || !(blobKey in node.rawConfigBlobs)) return;
      const before = snapshotGraph(graph);
      node.rawConfigBlobs[blobKey] = newRawXml;
      set({ graph: { ...graph } });
      pushHistory(before);
      get().runValidation();
    },

    connect: (parentId, portName, childId) => {
      const { graph } = get();
      if (!graph) return { ok: false, reason: "Aucun workflow ouvert." };
      const parent = graph.nodes[parentId];
      const child = graph.nodes[childId];
      if (!parent || !child) return { ok: false, reason: "Nœud introuvable." };
      if (parentId === childId) return { ok: false, reason: "Un nœud ne peut pas se connecter à lui-même." };

      if (isReachableDownward(graph, childId, parentId)) {
        return { ok: false, reason: "Cette connexion créerait un cycle." };
      }

      const compat = checkPortCompatibility(parent.type, portName, child.category);
      if (compat.status === "incompatible") {
        return { ok: false, reason: compat.reason };
      }
      // "unknown" : autorisé au geste de connexion (pas de faux blocage sur un
      // port jamais documenté), mais restera visible dans le panneau de
      // validation grâce à la politique deny-by-default de validateWorkflow.

      flushPendingParamEdit();
      const before = snapshotGraph(graph);

      const existingPort = parent.ports[portName];
      const isList = existingPort?.isList ?? false;

      if (!existingPort) {
        parent.ports[portName] = {
          name: portName,
          isList: isPortListCapable(parent.type, portName),
          connectedNodeIds: [childId],
          declaredDataType: "DynamicObjectAOX",
        };
      } else if (isList) {
        if (!existingPort.connectedNodeIds.includes(childId)) {
          existingPort.connectedNodeIds.push(childId);
        }
      } else {
        existingPort.connectedNodeIds = [childId];
      }

      set({ graph: { ...graph } });
      pushHistory(before);
      get().runValidation();
      return { ok: true };
    },

    disconnect: (parentId, portName, childId) => {
      flushPendingParamEdit();
      const { graph } = get();
      if (!graph) return;
      const port = graph.nodes[parentId]?.ports[portName];
      if (!port) return;
      const before = snapshotGraph(graph);
      port.connectedNodeIds = port.connectedNodeIds.filter((cid) => cid !== childId);
      pruneUnreachableNodes(graph);
      set({ graph: { ...graph } });
      pushHistory(before);
      get().runValidation();
    },

    runValidation: () => {
      const { graph, catalog } = get();
      if (!graph || !catalog) return set({ validation: null });
      set({ validation: validateWorkflow(graph, catalog) });
    },

    loadSnippetsFromStorage: () => set({ snippets: loadSnippetsFromLocalStorage() }),

    saveSnippetFromNode: (nodeId, name) => {
      // Ne modifie pas le graphe courant : n'affecte pas l'historique d'undo.
      const { graph, snippets } = get();
      if (!graph) return;
      const node = graph.nodes[nodeId];
      if (!node) return;

      const { rootNodeId, nodes } = extractSubgraph(graph, nodeId);
      const snippet: WorkflowSnippet = {
        id: uuidv4(),
        name,
        rootType: node.type,
        createdAt: new Date().toISOString(),
        rootNodeId,
        nodes,
      };
      const next = [...snippets, snippet];
      set({ snippets: next });
      persistSnippets(next);
    },

    deleteSnippet: (id) => {
      const next = get().snippets.filter((s) => s.id !== id);
      set({ snippets: next });
      persistSnippets(next);
    },

    instantiateSnippet: (snippetId, dropPosition) => {
      flushPendingParamEdit();
      const { snippets, graph, layout } = get();
      const snippet = snippets.find((s) => s.id === snippetId);
      if (!snippet) throw new Error("Snippet introuvable.");
      const before = snapshotGraph(graph);

      const { rootNodeId, nodes } = instantiateSubgraph(snippet);

      // Layout local au snippet (indépendant du reste du graphe), puis
      // translaté pour que sa racine atterrisse exactement au point de dépose.
      const miniGraph: WorkflowGraph = { rootNodeId, nodes };
      const miniLayout = computeAutoLayout(miniGraph);
      const rootPos = miniLayout[rootNodeId] ?? { x: 0, y: 0 };
      const target = dropPosition ?? { x: 0, y: 0 };
      const dx = target.x - rootPos.x;
      const dy = target.y - rootPos.y;
      const placedLayout: Record<string, Position> = {};
      for (const [id, pos] of Object.entries(miniLayout)) {
        placedLayout[id] = { x: pos.x + dx, y: pos.y + dy };
      }

      if (!graph) {
        set({ graph: miniGraph, layout: placedLayout, selectedNodeId: rootNodeId });
      } else {
        Object.assign(graph.nodes, nodes);
        set({ graph: { ...graph }, layout: { ...layout, ...placedLayout }, selectedNodeId: rootNodeId });
      }
      pushHistory(before);
      get().runValidation();
      return rootNodeId;
    },
  };
});
