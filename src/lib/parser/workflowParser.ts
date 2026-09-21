import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { v4 as uuidv4 } from "uuid";
import type { ParamValue, PortInstance, ScalarDataType, WorkflowGraph, WorkflowNode } from "../model/types";

const SCALAR_DATATYPES: ReadonlySet<string> = new Set(["String", "Integer", "Boolean", "None"]);

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function coerceScalar(dataType: string, raw: string): string | number | boolean {
  if (dataType === "Integer") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (dataType === "Boolean") {
    return raw === "1" || raw.toLowerCase() === "true";
  }
  return raw;
}

const rawBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", format: true });

/**
 * Reconstruit en XML un sous-objet issu du parsing, pour les contenus non
 * modélisés structurellement (raw config blobs).
 *
 * Limite assumée : ceci produit un XML structurellement équivalent, PAS
 * garanti identique octet pour octet à la source (ordre des attributs,
 * indentation, commentaires XML internes non préservés). Suffisant pour un
 * blob de configuration opaque non édité visuellement ; à revoir si un
 * round-trip strictement bit-à-bit devient nécessaire sur ces blocs.
 */
function rebuildRawXml(tagName: string, node: unknown): string {
  const xml = rawBuilder.build({ [tagName]: node });
  // Nettoyage cosmétique : XMLBuilder laisse des lignes vides/blanches lors
  // de la reconstruction, sans impact structurel (déjà validé par le test
  // de round-trip), mais nuisant à la lisibilité une fois réinjecté dans le
  // XML généré.
  return xml
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

/**
 * Parse un fichier de workflow AOX (un unique <ObjectAOX> racine, sans
 * wrapper) vers le modèle interne WorkflowGraph.
 *
 * Règles de détection appliquées à chaque <Param> :
 *  1. Un seul enfant <ListObjectAOX>            -> port liste.
 *  2. Un seul enfant <ObjectAOX>                 -> port simple.
 *  3. Un attribut Value et aucun autre enfant     -> paramètre scalaire.
 *  4. Tout le reste (ex. <KeyValueListAOX> direct,
 *     <AttributeTranslation>, structure imprévue) -> blob brut préservé
 *     tel quel dans node.rawConfigBlobs, non interprété.
 *
 * Ce choix structurel (plutôt que par nom de classe) est délibéré : il gère
 * uniformément HTMLT_Parameters (cas 2, port normal vers un nœud
 * KeyValueListAOX) et son contenu interne Dictionary (cas 4, blob brut),
 * sans avoir à connaître ces noms de classe à l'avance.
 */
export function parseWorkflowXml(xml: string): WorkflowGraph {
  // Certains fichiers réels (notamment les .xmlt utilisés comme "template"
  // par un OperationIterator) ont plusieurs nœuds au niveau racine du
  // fichier (commentaires, futures balises non modélisées...), ce qui n'est
  // pas du XML valide au sens strict (un document ne doit avoir qu'un seul
  // élément racine). On encapsule tout le contenu dans une balise
  // synthétique avant validation/parsing : ça rend n'importe quel fichier
  // de ce type syntaxiquement valide, quel que soit le nombre ou la nature
  // de ses nœuds de tête, sans avoir à connaître ni énumérer ces nœuds à
  // l'avance. On cherche ensuite l'unique <ObjectAOX> à l'intérieur ; tout
  // le reste au même niveau (commentaires, balises inconnues) est
  // simplement ignoré, comme pour n'importe quel enfant non-<Param> d'un
  // <ObjectAOX> (déjà le cas plus bas dans parseObjectAOX).
  const wrapped = `<_root>${xml}</_root>`;

  const validation = XMLValidator.validate(wrapped);
  if (validation !== true) {
    const { msg, line, col } = validation.err;
    throw new Error(`XML de workflow invalide (ligne ${line}, colonne ${col}) : ${msg}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    allowBooleanAttributes: true,
    trimValues: false,
    isArray: (name) => name === "Param" || name === "ObjectAOX",
  });

  const doc = parser.parse(wrapped);
  const rootWrapper = doc._root as Record<string, unknown>;
  const rootCandidates = asArray(rootWrapper.ObjectAOX as unknown) as Record<string, unknown>[];
  if (rootCandidates.length === 0) {
    throw new Error('XML de workflow invalide : aucun élément "<ObjectAOX>" trouvé dans le fichier.');
  }
  if (rootCandidates.length > 1) {
    throw new Error(
      `XML de workflow invalide : ${rootCandidates.length} éléments <ObjectAOX> trouvés au niveau racine. ` +
        `Un fichier de workflow AOX ne doit en contenir qu'un seul (les autres nœuds de tête — commentaires, ` +
        `balises non modélisées — sont ignorés, mais un seul <ObjectAOX> est attendu).`
    );
  }

  const nodes: Record<string, WorkflowNode> = {};

  function parseObjectAOX(objNode: Record<string, unknown>): string {
    const id = uuidv4();
    const category = objNode["@_Category"] as string;
    const type = objNode["@_Type"] as string;

    const params: Record<string, ParamValue> = {};
    const ports: Record<string, PortInstance> = {};
    const rawConfigBlobs: Record<string, string> = {};

    for (const paramNode of asArray(objNode.Param as unknown)) {
      const p = paramNode as Record<string, unknown>;
      const name = p["@_Name"] as string | undefined;
      const dataType = (p["@_DataType"] as string | undefined) ?? "";
      if (!name) continue;

      const listWrapper = p.ListObjectAOX as Record<string, unknown> | undefined;
      const singleChildren = p.ObjectAOX as unknown[] | undefined;
      const value = p["@_Value"] as string | undefined;

      const otherKeys = Object.keys(p).filter(
        (k) => !k.startsWith("@_") && k !== "ListObjectAOX" && k !== "ObjectAOX" && k !== "#text"
      );

      if (listWrapper !== undefined) {
        const children = asArray(listWrapper.ObjectAOX as unknown) as Record<string, unknown>[];
        ports[name] = {
          name,
          isList: true,
          connectedNodeIds: children.map((c) => parseObjectAOX(c)),
          declaredDataType: dataType || "DynamicObjectAOX",
        };
      } else if (singleChildren !== undefined) {
        if (singleChildren.length > 1) {
          console.warn(
            `[workflowParser] Port simple "${name}" (owner ${type}) a ${singleChildren.length} ` +
              `enfants <ObjectAOX> — seul le premier est conservé.`
          );
        }
        ports[name] = {
          name,
          isList: false,
          connectedNodeIds: [parseObjectAOX(singleChildren[0] as Record<string, unknown>)],
          declaredDataType: dataType || "DynamicObjectAOX",
        };
      } else if (otherKeys.length === 0 && value !== undefined) {
        const scalarDataType: ScalarDataType = SCALAR_DATATYPES.has(dataType)
          ? (dataType as ScalarDataType)
          : "String";
        params[name] = { name, dataType: scalarDataType, value: coerceScalar(dataType, value) };
      } else {
        // On reconstruit le <Param> complet (pas seulement son contenu) afin
        // que le générateur puisse le réinjecter tel quel sans avoir à
        // deviner l'enveloppe Name/DataType d'origine.
        rawConfigBlobs[name] = rebuildRawXml("Param", p);
      }
    }

    const node: WorkflowNode = { id, category, type, params, ports };
    if (Object.keys(rawConfigBlobs).length > 0) {
      node.rawConfigBlobs = rawConfigBlobs;
    }
    nodes[id] = node;
    return id;
  }

  const rootNodeId = parseObjectAOX(rootCandidates[0] as Record<string, unknown>);
  return { rootNodeId, nodes };
}
