"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { Cardinality } from "@/lib/types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export type RelationEdgeData = {
  cardinality: Cardinality;
  identifying: boolean;
  label: string;
};

export type RelationEdgeType = Edge<RelationEdgeData, "relation">;

/** Defs de marcadores de pe de galinha, montados uma vez no canvas */
export function CrowFootDefs() {
  const stroke = "var(--color-line-strong)";
  const accent = "var(--color-elephant)";
  const marker = (id: string, d: string, refX: number, color: string) => (
    <marker
      key={id}
      id={id}
      viewBox="0 0 15 14"
      markerWidth="15"
      markerHeight="14"
      refX={refX}
      refY={7}
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </marker>
  );

  const CROW_END = "M 1 7 L 14 1 M 1 7 L 14 7 M 1 7 L 14 13";
  const CROW_START = "M 14 7 L 1 1 M 14 7 L 1 7 M 14 7 L 1 13";
  const ONE_END = "M 8 2 L 8 12";
  const ONE_START = "M 6 2 L 6 12";

  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
      <defs>
        {marker("pgc-crow-end", CROW_END, 14, stroke)}
        {marker("pgc-crow-end-on", CROW_END, 14, accent)}
        {marker("pgc-crow-start", CROW_START, 1, stroke)}
        {marker("pgc-crow-start-on", CROW_START, 1, accent)}
        {marker("pgc-one-end", ONE_END, 14, stroke)}
        {marker("pgc-one-end-on", ONE_END, 14, accent)}
        {marker("pgc-one-start", ONE_START, 1, stroke)}
        {marker("pgc-one-start-on", ONE_START, 1, accent)}
      </defs>
    </svg>
  );
}

function RelationEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  data,
  selected,
}: EdgeProps<RelationEdgeType>) {
  const setSelection = useStore((state) => state.setSelection);

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: 24,
  });

  const identifying = data?.identifying ?? false;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={{
          strokeDasharray: identifying ? undefined : "5 4",
        }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSelection({ kind: "relation", relationId: id });
          }}
          title="Editar relacionamento"
          aria-label={`Editar relacionamento ${data?.cardinality ?? "1:N"}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className={cn(
            "nodrag nopan absolute rounded-[4px] border px-1.5 py-px font-mono text-[9.5px] font-semibold leading-[14px] transition-colors",
            selected
              ? "border-elephant bg-elephant text-white"
              : "border-line bg-surface text-ink-soft hover:border-elephant hover:text-elephant",
          )}
        >
          {data?.cardinality ?? "1:N"}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

export const RelationEdge = memo(RelationEdgeComponent);
