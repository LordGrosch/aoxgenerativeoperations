/**
 * Représentation du catalogue AOX (le "schéma" des classes disponibles),
 * distincte du modèle des instances de workflow (voir lib/model/types.ts).
 */

/** Une propriété scalaire (paramètre de configuration, jamais un port). */
export interface PropertyDef {
  name: string;
  /** DataType tel que déclaré dans le catalogue (String, Integer, Boolean...). */
  dataType: string;
  mandatory: boolean;
}

/**
 * Une propriété "port" : DataType ObjectAOX / DynamicObjectAOX dans le
 * catalogue. Le caractère "liste" n'est PAS porté ici : il ne se déduit que
 * de l'instance réelle (voir commentaire dans lib/model/types.ts). Le
 * catalogue nous dit seulement qu'un port existe et s'il est obligatoire.
 */
export interface PortDef {
  name: string;
  mandatory: boolean;
  /** DataType brut du catalogue, conservé à titre informatif uniquement. */
  declaredDataType: string;
}

/** Définition complète d'une classe AOX (une <Class> du catalogue). */
export interface ClassDef {
  /** Category englobante dans le catalogue (ex: "InputStreamAOX_Text"). */
  category: string;
  /** Nom de la classe (ObjectAOX@Type dans les instances). */
  type: string;
  module?: string;
  documentation?: string;
  scalarProperties: PropertyDef[];
  portProperties: PortDef[];
}

/** Index du catalogue complet, prêt à être consommé par la palette / le moteur de compatibilité. */
export interface CatalogIndex {
  /** Une classe par Type (les Type sont supposés uniques dans tout le catalogue). */
  classesByType: Map<string, ClassDef>;
  /** Classes regroupées par Category. */
  classesByCategory: Map<string, ClassDef[]>;
  /** Liste des noms de Category, dans l'ordre du catalogue. */
  categories: string[];
}
