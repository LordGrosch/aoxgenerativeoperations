/**
 * Charge un exemple de workflow, affiche l'arbre reconstruit (catégorie,
 * type, ports, params, blobs bruts), et vérifie chaque connexion via le
 * moteur de compatibilité.
 *
 * Usage : npx tsx scripts/inspect-workflow.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWorkflowXml } from "../src/lib/parser/workflowParser";
import { getNode, findFanOutNodeIds, type WorkflowGraph } from "../src/lib/model/types";
import { checkPortCompatibility } from "../src/lib/compatibility/compatibilityEngine";

const xmlPath = join(__dirname, "..", "src", "data", "samples", "sample-createzip.xml");
const xml = readFileSync(xmlPath, "utf-8");

const graph = parseWorkflowXml(xml);

console.log(`Nombre de nœuds parsés : ${Object.keys(graph.nodes).length}`);
console.log(`Nœuds en fan-out (partagés par >1 parent) : ${findFanOutNodeIds(graph).length}`);
console.log("");

function printTree(graph: WorkflowGraph, nodeId: string, depth = 0): void {
  const node = getNode(graph, nodeId);
  const indent = "  ".repeat(depth);
  console.log(`${indent}- [${node.category}] ${node.type}`);

  const paramSummary = Object.values(node.params)
    .map((p) => `${p.name}=${JSON.stringify(p.value)}`)
    .join(", ");
  if (paramSummary) console.log(`${indent}    params: ${paramSummary}`);

  if (node.rawConfigBlobs) {
    console.log(`${indent}    rawConfigBlobs: [${Object.keys(node.rawConfigBlobs).join(", ")}]`);
  }

  for (const port of Object.values(node.ports)) {
    console.log(`${indent}    port "${port.name}"${port.isList ? " (liste)" : ""}:`);
    for (const childId of port.connectedNodeIds) {
      const child = getNode(graph, childId);
      const result = checkPortCompatibility(node.type, port.name, child.category);
      const tag =
        result.status === "compatible" ? "OK" : result.status === "incompatible" ? "INCOMPATIBLE !" : "INCONNU";
      console.log(`${indent}      -> ${tag} (${child.category})`);
      if (result.status !== "compatible") console.log(`${indent}         ${result.reason}`);
      printTree(graph, childId, depth + 3);
    }
  }
}

printTree(graph, graph.rootNodeId);
