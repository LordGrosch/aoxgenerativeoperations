import { getSmoothStepPath, type EdgeProps } from "reactflow";
import type { AoxEdgeData } from "@/lib/reactflow/graphAdapter";

const STATUS_COLOR: Record<AoxEdgeData["status"], string> = {
  compatible: "#94a3b8", // gris-bleu neutre : connexion documentée et valide
  unknown: "#d97706", // ambre : connexion permise mais non documentée
  incompatible: "#dc2626", // rouge : ne devrait normalement pas apparaître (bloqué à la connexion), mais peut survenir sur un fichier importé
};

// Largeur (invisible) de la zone cliquable autour du trait, en plus du
// tracé visible — sans elle, il faut cliquer pixel-perfect sur le trait.
const INTERACTION_WIDTH = 20;

export default function AoxEdge(props: EdgeProps<AoxEdgeData>) {
  const { id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, style, data, selected } =
    props;

  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const status = data?.status ?? "compatible";
  const color = selected ? "#2563eb" : STATUS_COLOR[status];
  const dashed = status !== "compatible";

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: color,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: dashed ? "4 3" : undefined,
          fill: "none",
        }}
      >
        {data?.note && <title>{data.note}</title>}
      </path>
      {/* Zone de clic invisible et élargie, indispensable pour pouvoir
          sélectionner/supprimer le lien facilement. */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={INTERACTION_WIDTH} className="react-flow__edge-interaction" />
    </>
  );
}
