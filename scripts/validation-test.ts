import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCatalog } from "../src/lib/catalog/catalogParser";
import { parseWorkflowXml } from "../src/lib/parser/workflowParser";
import { validateWorkflow } from "../src/lib/validation/validateWorkflow";
import { getNode } from "../src/lib/model/types";

const catalogXml = readFileSync(join(__dirname, "..", "src", "data", "catalog.xml"), "utf-8");
const catalog = parseCatalog(catalogXml);

function runFile(label: string, filePath: string): void {
  console.log(`\n=== ${label} ===`);
  const xml = readFileSync(filePath, "utf-8");
  const graph = parseWorkflowXml(xml);
  const result = validateWorkflow(graph, catalog);

  for (const issue of result.issues) {
    const icon = issue.severity === "error" ? "❌" : "⚠️ ";
    console.log(`${icon} [${issue.code}] ${issue.path} — ${issue.message}`);
  }
  console.log(`--- ${result.errorCount} erreur(s), ${result.warningCount} avertissement(s), valide=${result.isValid}`);
}

runFile("CreateZip (sain)", join(__dirname, "..", "src", "data", "samples", "sample-createzip.xml"));
runFile("HTML_To_PDF/Iterator (sain)", join(__dirname, "..", "src", "data", "samples", "sample-htmltopdf-iterator.xml"));

// --- Cas volontairement cassé : on retire un paramètre obligatoire et on
// force une connexion incompatible, pour vérifier que la validation les
// détecte bien. ---
console.log(`\n=== Cas volontairement cassé ===`);
const zipXml = readFileSync(join(__dirname, "..", "src", "data", "samples", "sample-createzip.xml"), "utf-8");
const graph = parseWorkflowXml(zipXml);

// 1) Supprime un paramètre obligatoire (FilePath du OutputStreamAOX_Binary_File).
const outputBinaryNode = Object.values(graph.nodes).find((n) => n.type === "OutputStreamAOX_Binary_File")!;
delete outputBinaryNode.params["FilePath"];

// 2) Force une connexion incompatible : remplace un enfant de InputStreamAOX
//    (attendu InputStreamAOX_Image) par un nœud de Category InputStreamAOX_Text.
const rootNode = getNode(graph, graph.rootNodeId);
const listInputWrapperId = rootNode.ports["InputStreamAOX"].connectedNodeIds[0];
const listInputWrapper = getNode(graph, listInputWrapperId);
const listPort = listInputWrapper.ports["ListInput"];
const wrongNode = Object.values(graph.nodes).find((n) => n.type === "InputStreamAOX_Text_File")!;
listPort.connectedNodeIds[0] = wrongNode.id; // était un InputStreamAOX_Image_Operation

const brokenResult = validateWorkflow(graph, catalog);
for (const issue of brokenResult.issues) {
  const icon = issue.severity === "error" ? "❌" : "⚠️ ";
  console.log(`${icon} [${issue.code}] ${issue.path} — ${issue.message}`);
}
console.log(
  `--- ${brokenResult.errorCount} erreur(s), ${brokenResult.warningCount} avertissement(s), valide=${brokenResult.isValid}`
);
