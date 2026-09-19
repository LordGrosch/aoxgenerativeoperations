import { z } from "zod";
import type { CompatibilityTable } from "./compatibilityTypes";
import rawTable from "../../data/compatibility-rules.json";

/**
 * La table vit désormais dans src/data/compatibility-rules.json (édition à
 * la main facilitée : JSON simple, un objet par entrée). On la valide au
 * chargement avec zod pour transformer une faute de frappe (clé "kind"
 * mal orthographiée, "category" oubliée...) en erreur claire au démarrage
 * plutôt qu'en bug silencieux découvert plus tard dans l'éditeur.
 */
const ruleSchema = z.union([
  z.object({ kind: z.literal("category"), category: z.string().min(1) }),
  z.object({ kind: z.literal("categoryPrefix"), prefix: z.string().min(1) }),
]);

const entrySchema = z.object({
  rule: ruleSchema,
  observed: z.boolean(),
  note: z.string(),
  isList: z.boolean().optional(),
});

const tableSchema = z.record(z.string(), entrySchema);

function parseTable(): CompatibilityTable {
  const result = tableSchema.safeParse(rawTable);
  if (!result.success) {
    throw new Error(
      `src/data/compatibility-rules.json invalide :\n${result.error.issues
        .map((i) => `  - [${i.path.join(".")}] ${i.message}`)
        .join("\n")}`
    );
  }
  // Vérifie au passage que chaque clé respecte bien le format "Type.Port"
  // attendu par compatibilityEngine (un seul point de séparation logique,
  // même si le Type ou le Port peuvent eux-mêmes contenir des underscores).
  for (const key of Object.keys(result.data)) {
    if (!key.includes(".")) {
      throw new Error(
        `src/data/compatibility-rules.json invalide : la clé "${key}" doit être au format "Type.NomDuPort".`
      );
    }
  }
  return result.data as CompatibilityTable;
}

export const compatibilityTable: CompatibilityTable = parseTable();
