/**
 * Résultat de la validation métier d'un WorkflowGraph : ports obligatoires
 * manquants, paramètres obligatoires manquants, connexions incompatibles,
 * classes inconnues du catalogue, etc.
 */

export type ValidationSeverity = "error" | "warning";

export type ValidationCode =
  | "UNKNOWN_CLASS" // Type absent du catalogue
  | "CATEGORY_MISMATCH" // Category du nœud ≠ Category déclarée par le catalogue pour ce Type
  | "MISSING_MANDATORY_PORT" // port obligatoire du catalogue absent ou vide
  | "MISSING_MANDATORY_PARAM" // paramètre scalaire obligatoire absent ou vide
  | "UNKNOWN_PORT" // port présent sur le nœud mais non déclaré par le catalogue
  | "UNKNOWN_PARAM" // paramètre présent sur le nœud mais non déclaré par le catalogue
  | "INCOMPATIBLE_CONNECTION" // règle de compatibilité connue et violée
  | "UNKNOWN_COMPATIBILITY_RULE" // aucune règle connue pour ce port -> bloqué par prudence
  | "CYCLE_DETECTED" // le nœud se référence lui-même via une chaîne de ports (invalide, ce n'est pas un fan-out)
  | "FAN_OUT_DUPLICATION"; // information : ce nœud a plusieurs parents, sera dupliqué à la génération XML

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: ValidationCode;
  nodeId: string;
  /** Chemin lisible depuis la racine, ex: "OperationAOX_OutputBinary_CreateZip.InputStreamAOX[0].ListInput[1]". */
  path: string;
  message: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  isValid: boolean; // true si aucune erreur (les warnings n'invalident pas le workflow)
}
