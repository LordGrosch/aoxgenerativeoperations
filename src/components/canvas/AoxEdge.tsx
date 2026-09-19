import { AoxEdgeData } from "@/lib/reactflow/graphAdapter";
import { getSmoothStepPath, type EdgeProps } from "reactflow";


const STATUS_COLOR: Record<AoxEdgeData["status"], string> = {
  compatible: "#94a3b8", // gris-bleu neutre : connexion documentée et valide
  unknown: "#d97706", // ambre : connexion permise mais non documentée
  incompatible: "#dc2626", // rouge : ne devrait normalement pas apparaître (bloqué à la connexion), mais peut survenir sur un fichier importé
};

export default function AoxEdge(props: EdgeProps<AoxEdgeData>) {
  const { id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, data } = props;

  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const status = data?.status ?? "compatible";
  const color = STATUS_COLOR[status];
  const dashed = status !== "compatible";

  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      markerEnd={markerEnd}
      style={{ stroke: color, strokeWidth: 1.5, strokeDasharray: dashed ? "4 3" : undefined, fill: "none" }}
    >
      {data?.note && <title>{data.note}</title>}
    </path>
  );
}
