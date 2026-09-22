import { z } from "zod";
import rawConfig from "../../data/node-colors.json";
import type { WorkflowNode } from "../model/types";
import { getNodeKind } from "../reactflow/graphAdapter";

const colorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "doit être une couleur hexadécimale (#rrggbb ou #rgb)");

const configSchema = z.object({
  byKind: z.object({
    operation: colorSchema,
    input: colorSchema,
    output: colorSchema,
    other: colorSchema,
  }),
  byType: z.record(z.string(), colorSchema).default({}),
  fileReferenceRules: z
    .array(
      z.object({
        paramName: z.string(),
        extensions: z.array(z.string().min(1)),
        color: colorSchema,
        note: z.string().optional(),
      })
    )
    .default([]),
});

function parseConfig() {
  const result = configSchema.safeParse(rawConfig);
  if (!result.success) {
    throw new Error(
      `src/data/node-colors.json invalide :\n${result.error.issues
        .map((i) => `  - [${i.path.join(".")}] ${i.message}`)
        .join("\n")}`
    );
  }
  return result.data;
}

export const nodeColorConfig = parseConfig();

/**
 * Couleur de bandeau d'un nœud, par priorité décroissante :
 *  1. une couleur propre à ce Type exact (`byType`) ;
 *  2. une règle "ce fichier référence un autre document d'opération" (ex.
 *     un FilePath se terminant par .xml/.xmlt/.htmlt) ;
 *  3. la couleur par défaut de sa nature (Operation / Input / Output / autre).
 *
 * Modifiable sans toucher au code : tout se passe dans
 * src/data/node-colors.json.
 */
export function resolveNodeColor(node: WorkflowNode): string {
  const byType = nodeColorConfig.byType[node.type];
  if (byType) return byType;

  for (const rule of nodeColorConfig.fileReferenceRules) {
    const param = node.params[rule.paramName];
    if (typeof param?.value === "string") {
      const lower = param.value.toLowerCase();
      if (rule.extensions.some((ext) => lower.endsWith(ext.toLowerCase()))) {
        return rule.color;
      }
    }
  }

  return nodeColorConfig.byKind[getNodeKind(node.category)];
}
