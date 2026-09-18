/**
 * Script de sanity-check : charge src/data/catalog.xml, parse, et affiche
 * un résumé + le détail de quelques classes clés pour vérifier visuellement
 * que la distinction paramètre scalaire / port est correcte.
 *
 * Usage : npx tsx scripts/inspect-catalog.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCatalog } from "../src/lib/catalog/catalogParser";

const xmlPath = join(__dirname, "..", "src", "data", "catalog.xml");
const xml = readFileSync(xmlPath, "utf-8");

const catalog = parseCatalog(xml);

console.log(`Catégories : ${catalog.categories.length}`);
console.log(`Classes (Type uniques) : ${catalog.classesByType.size}`);
console.log("");

function dump(typeName: string): void {
  const cls = catalog.classesByType.get(typeName);
  if (!cls) {
    console.log(`!! Classe "${typeName}" introuvable.`);
    return;
  }
  console.log(`--- ${cls.type} (Category: ${cls.category}) ---`);
  console.log(
    "  Paramètres scalaires:",
    cls.scalarProperties.map((p) => `${p.name}:${p.dataType}${p.mandatory ? "*" : ""}`).join(", ") || "(aucun)"
  );
  console.log(
    "  Ports:",
    cls.portProperties.map((p) => `${p.name}${p.mandatory ? "*" : ""} (déclaré ${p.declaredDataType})`).join(", ") ||
      "(aucun)"
  );
  console.log("");
}

// Vérifie quelques classes représentatives des cas discutés.
dump("OperationAOX_OutputText_OperationIterator_HtmlPages"); // multi-ports nommés
dump("OperationAOX_OutputImage_ConvertToFormattedImage"); // port ImageAOXFormat déclaré ObjectAOX
dump("InputStreamAOX_Text_ListInput"); // port liste
dump("InputStreamAOX_None_ListInput"); // port liste wildcard
dump("OperationAOX_OutputText_SendMail"); // beaucoup de scalaires + un port liste (JoinedFile)
