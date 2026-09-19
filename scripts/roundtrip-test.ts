/**
 * Vérifie qu'un fichier de workflow survit à un cycle complet
 * parse -> generate -> parse, en comparant les deux graphes obtenus
 * structurellement (les ids étant éphémères, on ne les compare jamais).
 *
 * Usage : npx tsx scripts/roundtrip-test.ts <chemin-vers-fichier.xml>
 * Sans argument : utilise src/data/samples/sample-createzip.xml
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWorkflowXml } from "../src/lib/parser/workflowParser";
import { generateWorkflowXml } from "../src/lib/generator/workflowGenerator";
import { getNode, type WorkflowGraph } from "../src/lib/model/types";
import { XMLParser } from "fast-xml-parser";

const filePath =
  process.argv[2] ?? join(__dirname, "..", "src", "data", "samples", "sample-createzip.xml");
const originalXml = readFileSync(filePath, "utf-8");

const graph1 = parseWorkflowXml(originalXml);
const regeneratedXml = generateWorkflowXml(graph1);
const graph2 = parseWorkflowXml(regeneratedXml);

const rawCompareParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

function normalizeRawBlob(xml: string): unknown {
  // Compare le contenu structurel du blob (indépendant de l'indentation/formatage).
  return rawCompareParser.parse(xml);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let errorCount = 0;

function compareNodes(g1: WorkflowGraph, id1: string, g2: WorkflowGraph, id2: string, path: string): void {
  const n1 = getNode(g1, id1);
  const n2 = getNode(g2, id2);

  if (n1.category !== n2.category || n1.type !== n2.type) {
    console.log(`❌ ${path}: Category/Type différent ("${n1.category}/${n1.type}" vs "${n2.category}/${n2.type}")`);
    errorCount++;
    return;
  }

  const paramNames1 = Object.keys(n1.params).sort();
  const paramNames2 = Object.keys(n2.params).sort();
  if (JSON.stringify(paramNames1) !== JSON.stringify(paramNames2)) {
    console.log(`❌ ${path}: paramètres différents [${paramNames1}] vs [${paramNames2}]`);
    errorCount++;
  } else {
    for (const name of paramNames1) {
      const p1 = n1.params[name];
      const p2 = n2.params[name];
      if (p1.dataType !== p2.dataType || String(p1.value) !== String(p2.value)) {
        console.log(
          `❌ ${path}.${name}: valeur différente (${p1.dataType}=${JSON.stringify(p1.value)} vs ${p2.dataType}=${JSON.stringify(p2.value)})`
        );
        errorCount++;
      }
    }
  }

  const portNames1 = Object.keys(n1.ports).sort();
  const portNames2 = Object.keys(n2.ports).sort();
  if (JSON.stringify(portNames1) !== JSON.stringify(portNames2)) {
    console.log(`❌ ${path}: ports différents [${portNames1}] vs [${portNames2}]`);
    errorCount++;
  } else {
    for (const name of portNames1) {
      const port1 = n1.ports[name];
      const port2 = n2.ports[name];
      if (port1.isList !== port2.isList) {
        console.log(`❌ ${path}.${name}: isList différent (${port1.isList} vs ${port2.isList})`);
        errorCount++;
      }
      if (port1.connectedNodeIds.length !== port2.connectedNodeIds.length) {
        console.log(
          `❌ ${path}.${name}: nombre d'enfants différent (${port1.connectedNodeIds.length} vs ${port2.connectedNodeIds.length})`
        );
        errorCount++;
        continue;
      }
      port1.connectedNodeIds.forEach((childId1, i) => {
        compareNodes(g1, childId1, g2, port2.connectedNodeIds[i], `${path}.${name}[${i}]`);
      });
    }
  }

  const rawKeys1 = Object.keys(n1.rawConfigBlobs ?? {}).sort();
  const rawKeys2 = Object.keys(n2.rawConfigBlobs ?? {}).sort();
  if (JSON.stringify(rawKeys1) !== JSON.stringify(rawKeys2)) {
    console.log(`❌ ${path}: clés rawConfigBlobs différentes [${rawKeys1}] vs [${rawKeys2}]`);
    errorCount++;
  } else {
    for (const key of rawKeys1) {
      const raw1 = normalizeRawBlob(n1.rawConfigBlobs![key]);
      const raw2 = normalizeRawBlob(n2.rawConfigBlobs![key]);
      if (!deepEqual(raw1, raw2)) {
        console.log(`❌ ${path}.rawConfigBlobs.${key}: contenu structurel différent après re-parsing`);
        console.log("   original :", JSON.stringify(raw1));
        console.log("   régénéré :", JSON.stringify(raw2));
        errorCount++;
      }
    }
  }
}

compareNodes(graph1, graph1.rootNodeId, graph2, graph2.rootNodeId, "root");

console.log("");
if (errorCount === 0) {
  console.log(`✅ Round-trip OK — ${Object.keys(graph1.nodes).length} nœuds, structure identique.`);
} else {
  console.log(`❌ Round-trip : ${errorCount} différence(s) détectée(s).`);
}

console.log("\n--- XML régénéré ---\n");
console.log(regeneratedXml);
