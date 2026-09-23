"use client";

import { useCallback, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import { useWorkflowStore } from "@/store/workflowStore";
import { toReactFlowElements, portNameFromHandle, type AoxEdgeData } from "@/lib/reactflow/graphAdapter";
import AoxNode from "./AoxNode";
import AoxEdge from "./AoxEdge";

const nodeTypes = { aoxNode: AoxNode };
const edgeTypes = { aoxEdge: AoxEdge };
export const AOX_DRAG_TYPE = "application/aox-class-type";
export const AOX_SNIPPET_DRAG_TYPE = "application/aox-snippet-id";

function CanvasInner() {
  const catalog = useWorkflowStore((s) => s.catalog);
  const graph = useWorkflowStore((s) => s.graph);
  const layout = useWorkflowStore((s) => s.layout);
  const nodeWidths = useWorkflowStore((s) => s.nodeWidths);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const setNodePosition = useWorkflowStore((s) => s.setNodePosition);
  const connect = useWorkflowStore((s) => s.connect);
  const disconnect = useWorkflowStore((s) => s.disconnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const deleteNode = useWorkflowStore((s) => s.deleteNode);
  const instantiateSnippet = useWorkflowStore((s) => s.instantiateSnippet);

  // Sélection d'arête : purement une préoccupation d'affichage du canvas
  // (pas besoin de la faire vivre dans le store global comme selectedNodeId).
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const elements =
    catalog && graph ? toReactFlowElements(graph, layout, nodeWidths, catalog) : { nodes: [], edges: [] };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          setNodePosition(change.id, change.position);
        } else if (change.type === "remove") {
          // La racine est protégée directement dans le store (deleteNode
          // l'ignore silencieusement), pas besoin de filtrer ici.
          deleteNode(change.id);
        }
      }
    },
    [setNodePosition, deleteNode]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "remove") {
          const edge = elements.edges.find((e) => e.id === change.id);
          const data = edge?.data as AoxEdgeData | undefined;
          if (data) disconnect(data.parentId, data.portName, data.childId);
        }
      }
    },
    [elements.edges, disconnect]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !connection.targetHandle) return;
      const portName = portNameFromHandle(connection.targetHandle);
      const result = connect(connection.target, portName, connection.source);
      if (!result.ok) {
        window.alert(`Connexion refusée : ${result.reason}`);
      }
    },
    [connect]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const snippetId = event.dataTransfer.getData(AOX_SNIPPET_DRAG_TYPE);
      const classType = event.dataTransfer.getData(AOX_DRAG_TYPE);
      if (!snippetId && !classType) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      try {
        if (snippetId) {
          instantiateSnippet(snippetId, position);
        } else {
          const id = addNode(classType);
          setNodePosition(id, position);
        }
      } catch (err) {
        window.alert((err as Error).message);
      }
    },
    [addNode, instantiateSnippet, screenToFlowPosition, setNodePosition]
  );

  if (!catalog) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chargement du catalogue…</div>;
  }
  if (!graph) {
    return (
      <div
        ref={wrapperRef}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="flex items-center justify-center h-full text-gray-400 text-sm border-2 border-dashed m-4 rounded"
      >
        Glissez une classe depuis la palette pour créer la racine du workflow, ou chargez un XML existant.
      </div>
    );
  }

  return (
    <div className="h-full w-full" ref={wrapperRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={elements.nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId }))}
        edges={elements.edges.map((e) => ({ ...e, selected: e.id === selectedEdgeId }))}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => {
          setSelectedEdgeId(null);
          selectNode(node.id);
        }}
        onEdgeClick={(_, edge) => {
          selectNode(null);
          setSelectedEdgeId(edge.id);
        }}
        onPaneClick={() => {
          selectNode(null);
          setSelectedEdgeId(null);
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

export default function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
