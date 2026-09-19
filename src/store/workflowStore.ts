import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { CatalogIndex } from "../lib/catalog/catalogTypes";
import { parseCatalog } from "../lib/catalog/catalogParser";
import { parseWorkflowXml } from "../lib/parser/workflowParser";
import { generateWorkflowXml } from "../lib/generator/workflowGenerator";

import { computeAutoLayout } from "../lib/layout/autoLayout";
import { pruneUnreachableNodes } from "../lib/model/types";
import type { ParamValue, WorkflowGraph, WorkflowNode } from "../lib/model/types";
import { checkPortCompatibility } from "../lib/compatibility/compatibilityEngine";
import { ValidationResult } from "../lib/validation/validationTypes";
import { validateWorkflow } from "../lib/validation/validateWorkflow";

type Position = { x: number; y: number };
type ConnectResult = { ok: true } | { ok: false; reason: string };

interface WorkflowState {
  catalog: CatalogIndex | null;
  graph: WorkflowGraph | null;
  layout: Record<string, Position>;
  selectedNodeId: string | null;
  validation: ValidationResult | null;

  loadCatalog: (xml: string) => void;
  loadWorkflow: (xml: string) => void;
  exportXml: () => string;

  selectNode: (id: string | null) => void;
  setNodePosition: (id: string, pos: Position) => void;

  /** Crée un nœud non connecté. Si aucun graphe n'existe encore, ce nœud en devient la racine. */
  addNode: (type: string) => string;
  deleteNode: (id: string) => void;
  updateParam: (nodeId: string, paramName: string, value: string | number | boolean) => void;
  connect: (parentId: string, portName: string, childId: string) => ConnectResult;
  disconnect: (parentId: string, portName: string, childId: string) => void;

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

  loadCatalog: (xml) => set({ catalog: parseCatalog(xml) }),

  loadWorkflow: (xml) => {
    const graph = parseWorkflowXml(xml);
    const layout = computeAutoLayout(graph);
    set({ graph, layout, selectedNodeId: null });
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
        isList: false,
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
}));
