import { XMLParser } from "fast-xml-parser";
import { v4 as uuidv4 } from "uuid";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: false });

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export type KeyValueEditorModel =
  | { kind: "json"; entries: Array<{ id: string; name: string; valueJson: string }> }
  | { kind: "xml"; entries: Array<{ id: string; key: string; value: string }> }
  | { kind: "unsupported"; reason: string };

/**
 * Tente d'interpréter le contenu brut d'un port "Dictionary" d'un nœud
 * KeyValueListAOX (voir workflowParser : ce contenu est capturé tel quel en
 * rawConfigBlob, jamais modélisé structurellement dans le graphe).
 *
 * Deux formes réelles observées :
 *  - JSONKeyValueList : un unique <Param Value='[...]' /> contenant un
 *    tableau JSON de {name, value}.
 *  - XMLKeyValueList : une liste de <XMLKeyValue Key="..." Value="..." />.
 *
 * Toute variante non reconnue (structure inattendue, JSON invalide, ou
 * présence d'un <AttributeTranslation> — volontairement non supporté, voir
 * décision précédente) retombe en "unsupported" : l'appelant doit alors
 * garder l'édition en lecture seule pour ne rien corrompre.
 */
export function parseDictionaryBlob(rawParamXml: string): KeyValueEditorModel {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(rawParamXml);
  } catch {
    return { kind: "unsupported", reason: "XML illisible." };
  }

  const param = doc.Param as Record<string, unknown> | undefined;
  const kvList = param?.KeyValueListAOX as Record<string, unknown> | undefined;
  if (!kvList) return { kind: "unsupported", reason: "Structure inattendue (KeyValueListAOX introuvable)." };

  const innerCandidates = asArray(kvList.Param as unknown) as Record<string, unknown>[];
  const inner = innerCandidates[0];
  if (!inner) return { kind: "unsupported", reason: "Aucun contenu de dictionnaire trouvé." };

  if (inner["@_Name"] === "JSONKeyValueList") {
    const jsonText = inner["@_Value"] as string | undefined;
    if (jsonText === undefined) return { kind: "unsupported", reason: "JSONKeyValueList sans attribut Value." };
    try {
      const parsedArray = JSON.parse(jsonText);
      if (!Array.isArray(parsedArray)) throw new Error("pas un tableau");
      return {
        kind: "json",
        entries: parsedArray.map((item: { name?: unknown; value?: unknown }) => ({
          id: uuidv4(),
          name: String(item.name ?? ""),
          valueJson: JSON.stringify(item.value, null, 2),
        })),
      };
    } catch {
      return { kind: "unsupported", reason: "Contenu JSON invalide, à corriger manuellement." };
    }
  }

  if (inner["@_Name"] === "XMLKeyValueList") {
    const items = asArray(inner.XMLKeyValue as unknown) as Record<string, unknown>[];
    const hasAdvanced = items.some((it) => it.AttributeTranslation !== undefined);
    if (hasAdvanced) {
      return {
        kind: "unsupported",
        reason: "Contient un <AttributeTranslation>, non pris en charge par l'éditeur assisté.",
      };
    }
    return {
      kind: "xml",
      entries: items.map((it) => ({
        id: uuidv4(),
        key: String(it["@_Key"] ?? ""),
        value: String(it["@_Value"] ?? ""),
      })),
    };
  }

  return { kind: "unsupported", reason: "Format de dictionnaire non reconnu par l'éditeur assisté." };
}

/**
 * Reconstruit le <Param Name="Dictionary">...</Param> complet à partir du
 * modèle édité, dans le même format d'enveloppe que celui produit par le
 * parser (voir workflowParser.rebuildRawXml) — round-trip garanti via
 * ré-analyse par fast-xml-parser, indépendamment du style de guillemets.
 */
export function serializeDictionaryBlob(model: KeyValueEditorModel): string {
  if (model.kind === "json") {
    const array = model.entries.map((e) => {
      let value: unknown;
      try {
        value = JSON.parse(e.valueJson);
      } catch {
        value = e.valueJson; // repli : conservé tel quel si ce n'est pas du JSON valide
      }
      return { name: e.name, value };
    });
    const jsonText = JSON.stringify(array);
    return `<Param Name="Dictionary" DataType="None"><KeyValueListAOX><Param Name="JSONKeyValueList" DataType="None" Value="${escapeXmlAttr(
      jsonText
    )}" /></KeyValueListAOX></Param>`;
  }

  if (model.kind === "xml") {
    const items = model.entries
      .map((e) => `<XMLKeyValue Key="${escapeXmlAttr(e.key)}" Value="${escapeXmlAttr(e.value)}"></XMLKeyValue>`)
      .join("");
    return `<Param Name="Dictionary" DataType="None"><KeyValueListAOX><Param Name="XMLKeyValueList" DataType="None">${items}</Param></KeyValueListAOX></Param>`;
  }

  throw new Error("Impossible de sérialiser un modèle non supporté.");
}
