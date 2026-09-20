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
import { extractSubgraph, instantiateSubgraph, type WorkflowSnippet } from "../lib/model/snippet";
import { checkPortCompatibility, isPortListCapable } from "@/lib/compatibility/compatibilityEngine";

const SNIPPETS_STORAGE_KEY = "aox-snippets";

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
    // Quota dépassé ou storage indisponible : non bloquant, les snippets
    // restent utilisables pour la session en cours.
  }
}

type Position = { x: number; y: number };
type ConnectResult = { ok: true } | { ok: false; reason: string };

interface WorkflowState {
  catalog: CatalogIndex | null;
  graph: WorkflowGraph | null;
  layout: Record<string, Position>;
  selectedNodeId: string | null;
  validation: ValidationResult | null;
  /** XML tel que chargé initialement (avant toute édition), pour la vue diff. null si le workflow a été créé de zéro dans l'éditeur. */
  loadedXml: string | null;
  snippets: WorkflowSnippet[];

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

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  catalog: null,
  graph: null,
  layout: {},
  selectedNodeId: null,
  validation: null,
  loadedXml: null,
  snippets: [],

  loadCatalog: (xml) => set({ catalog: parseCatalog(xml) }),

  loadWorkflow: (xml) => {
    const graph = parseWorkflowXml(xml);
    const layout = computeAutoLayout(graph);
    set({ graph, layout, selectedNodeId: null, loadedXml: xml });
    get().runValidation();
  },

  exportXml: () => {
    const graph = get().graph;
    return graph ? generateWorkflowXml(graph) : "";
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  setNodePosition: (id, pos) => set((s) => ({ layout: { ...s.layout, [id]: pos } })),

  addNode: (type) => {
    const { catalog, graph, layout } = get();
    if (!catalog) throw new Error("Catalogue non chargé.");
    const node = createEmptyNode(type, catalog);

    if (!graph) {
      const newGraph: WorkflowGraph = { rootNodeId: node.id, nodes: { [node.id]: node } };
      set({ graph: newGraph, layout: { [node.id]: { x: 0, y: 0 } }, selectedNodeId: node.id });
    } else {
      graph.nodes[node.id] = node;
      set({ graph: { ...graph }, layout: { ...layout, [node.id]: { x: 0, y: 0 } }, selectedNodeId: node.id });
    }
    get().runValidation();
    return node.id;
  },

  deleteNode: (id) => {
    const { graph, layout } = get();
    if (!graph || id === graph.rootNodeId) return; // la racine ne se supprime pas directement

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
    get().runValidation();
  },

  updateParam: (nodeId, paramName, value) => {
    const { graph, catalog } = get();
    if (!graph || !catalog) return;
    const node = graph.nodes[nodeId];
    if (!node) return;

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
    const { graph } = get();
    if (!graph) return;
    const node = graph.nodes[nodeId];
    if (!node || !node.rawConfigBlobs || !(blobKey in node.rawConfigBlobs)) return;
    node.rawConfigBlobs[blobKey] = newRawXml;
    set({ graph: { ...graph } });
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
    get().runValidation();
    return { ok: true };
  },

  disconnect: (parentId, portName, childId) => {
    const { graph } = get();
    if (!graph) return;
    const port = graph.nodes[parentId]?.ports[portName];
    if (!port) return;
    port.connectedNodeIds = port.connectedNodeIds.filter((cid) => cid !== childId);
    pruneUnreachableNodes(graph);
    set({ graph: { ...graph } });
    get().runValidation();
  },

  runValidation: () => {
    const { graph, catalog } = get();
    if (!graph || !catalog) return set({ validation: null });
    set({ validation: validateWorkflow(graph, catalog) });
  },

  loadSnippetsFromStorage: () => set({ snippets: loadSnippetsFromLocalStorage() }),

  saveSnippetFromNode: (nodeId, name) => {
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
    const { snippets, graph, layout } = get();
    const snippet = snippets.find((s) => s.id === snippetId);
    if (!snippet) throw new Error("Snippet introuvable.");

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
    get().runValidation();
    return rootNodeId;
  },
}));
