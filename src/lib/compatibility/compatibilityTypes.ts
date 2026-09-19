/**
 * Modèle de règles de compatibilité entre un port et les nœuds qu'on peut y
 * brancher.
 *
 * Constat clé (issu de l'analyse des exemples réels) : la famille acceptée
 * par un port NE SE DÉDUIT PAS du nom du port seul (ex. "InputStreamAOX"
 * accepte tantôt la famille Text, tantôt Binary, tantôt None, tantôt Image
 * selon la classe propriétaire — voir OperationAOX_OutputImage_HTML_To_Image
 * dont le port "InputStreamAOX" attend en réalité du InputStreamAOX_Text,
 * pas de l'Image). La règle est donc indexée par (Type de la classe
 * propriétaire, nom du port), pas par nom de port seul.
 *
 * Une exception régulière et documentée dans le catalogue : les classes
 * "passerelles" nommées `<Family>AOX_<Sous-Famille>_Operation`
 * (InputStreamAOX_Text_Operation, InputStreamAOX_Binary_Operation,
 * InputStreamAOX_Image_Operation, InputStreamAOX_ItemDataList_Operation)
 * ont toutes un unique port "OperationAOX" qui attend une Category
 * "OperationAOX_Output<Sous-Famille>". Cette convention est gérée
 * génériquement par le moteur plutôt que dupliquée ligne à ligne.
 */

export type CompatibilityRule =
  /** N'accepte que les nœuds dont la Category est exactement `category`. */
  | { kind: "category"; category: string }
  /** Accepte tout nœud dont la Category commence par `prefix` (wildcard). */
  | { kind: "categoryPrefix"; prefix: string };

/** Une entrée de la table, avec sa provenance pour audit/traçabilité. */
export interface CompatibilityEntry {
  rule: CompatibilityRule;
  /** true si confirmé par un fichier de workflow réel, false si supposé/à valider. */
  observed: boolean;
  /** Court commentaire : d'où vient cette règle (quel exemple, quel raisonnement). */
  note: string;
  /**
   * true si ce port doit être créé en mode "liste" (<ListObjectAOX>) lors
   * d'une première connexion faite depuis l'éditeur (par opposition à un
   * port chargé depuis un fichier existant, où le caractère liste est
   * toujours déduit structurellement par le parser, jamais de cette table).
   * Absent ou false = port simple par défaut.
   */
  isList?: boolean;
}

/** Clé de la table : "<TypeDeLaClassePropriétaire>.<NomDuPort>". */
export type CompatibilityKey = `${string}.${string}`;

export type CompatibilityTable = Record<CompatibilityKey, CompatibilityEntry>;
