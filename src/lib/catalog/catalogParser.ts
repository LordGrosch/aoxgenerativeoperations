import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { CatalogIndex, ClassDef, PortDef, PropertyDef } from "./catalogTypes";

/**
 * DataTypes observés pour des Property qui sont en réalité des ports
 * connectables plutôt que des paramètres scalaires. "ObjectAOXList" est
 * inclus par précaution même si le catalogue ne le déclare a priori que sur
 * des instances, pas sur des Property de classe.
 */
const PORT_DATATYPES = new Set(["ObjectAOX", "DynamicObjectAOX", "ObjectAOXList"]);

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Parse le XML de catalogue AOX (élément racine <Catalog>) et produit un
 * index consultable par Type et par Category.
 *
 * Remarque : les incohérences de DataType observées entre le catalogue et
 * les fichiers d'instance (ex. ImageAOXFormat déclaré ObjectAOX dans le
 * catalogue, utilisé en DynamicObjectAOX dans les fichiers réels) ne posent
 * pas de problème ici : les deux valeurs sont dans PORT_DATATYPES, donc
 * classées comme port dans les deux cas.
 */
export function parseCatalog(xml: string): CatalogIndex {
  // fast-xml-parser est tolérant par défaut : une balise mal fermée (ex. un
  // <Class> sans </Class>) n'est PAS rejetée, elle est silencieusement
  // réinterprétée en imbriquant tout ce qui suit comme descendant de la
  // balise mal fermée — ce qui fait "disparaître" des classes entières de
  // l'index sans aucune erreur visible. On valide donc explicitement la
  // bonne formation du XML avant de parser, pour échouer bruyamment avec un
  // numéro de ligne exploitable plutôt que de perdre des données en silence.
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const { msg, line, col } = validation.err;
    throw new Error(
      `Catalogue XML invalide (ligne ${line}, colonne ${col}) : ${msg}. ` +
        `Vérifiez les balises non fermées autour de cet endroit.`
    );
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    allowBooleanAttributes: true,
    trimValues: true,
    // Force le mode tableau pour ces éléments même quand il n'y en a qu'un
    // seul, afin d'avoir un traitement uniforme.
    isArray: (name) => name === "Category" || name === "Class" || name === "Property",
  });

  const doc = parser.parse(xml);
  const catalogRoot = doc.Catalog;
  if (!catalogRoot) {
    throw new Error('Catalogue invalide : élément racine "<Catalog>" introuvable.');
  }

  const classesByType = new Map<string, ClassDef>();
  const classesByCategory = new Map<string, ClassDef[]>();
  const categories: string[] = [];

  for (const categoryNode of asArray(catalogRoot.Category)) {
    const categoryName: string | undefined = categoryNode["@_Name"];
    if (!categoryName) continue;
    categories.push(categoryName);

    for (const classNode of asArray(categoryNode.Class)) {
      const typeName: string | undefined = classNode["@_Name"];
      if (!typeName) continue;

      const moduleName: string | undefined = classNode["@_Module"];
      const documentation =
        typeof classNode.Documentation === "string" ? classNode.Documentation.trim() : undefined;

      const scalarProperties: PropertyDef[] = [];
      const portProperties: PortDef[] = [];

      for (const propNode of asArray(classNode.Property)) {
        const propName: string | undefined = propNode["@_Name"];
        const dataType: string | undefined = propNode["@_DataType"];
        if (!propName || !dataType) continue;

        const mandatory = toBool(propNode["@_Mandatory"]);

        if (PORT_DATATYPES.has(dataType)) {
          portProperties.push({ name: propName, mandatory, declaredDataType: dataType });
        } else {
          scalarProperties.push({ name: propName, dataType, mandatory });
        }
      }

      const classDef: ClassDef = {
        category: categoryName,
        type: typeName,
        module: moduleName,
        documentation,
        scalarProperties,
        portProperties,
      };

      const existing = classesByType.get(typeName);
      if (existing) {
        // Un Type dupliqué casserait la résolution par Type seul (utilisée
        // partout ailleurs) : on le signale bruyamment plutôt que de
        // silencieusement écraser.
        console.warn(
          `[catalogParser] Type de classe dupliqué "${typeName}" ` +
            `(Category "${existing.category}" puis "${categoryName}"). ` +
            `La seconde définition remplace la première.`
        );
      }
      classesByType.set(typeName, classDef);

      const listForCategory = classesByCategory.get(categoryName) ?? [];
      listForCategory.push(classDef);
      classesByCategory.set(categoryName, listForCategory);
    }
  }

  return { classesByType, classesByCategory, categories };
}
