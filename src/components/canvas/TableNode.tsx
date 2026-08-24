"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Asterisk, ChevronRight, MessageSquareText, Plus } from "lucide-react";
import type { Table } from "@/lib/types";
import { keyRole } from "@/lib/types";
import { renderTypeShort } from "@/lib/pg-types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { KeyBadge } from "@/components/ui/primitives";

export type TableNodeData = {
  table: Table;
  selectedColumnId: string | null;
  highlighted: boolean;
};

export type TableNodeType = Node<TableNodeData, "table">;

/** ids de handle carregam a coluna: colId|origem|lado */
export function handleId(columnId: string, kind: "s" | "t", side: "l" | "r") {
  return `${columnId}|${kind}|${side}`;
}

export function columnFromHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  return handle.split("|")[0] ?? null;
}

function TableNodeComponent({ data, selected }: NodeProps<TableNodeType>) {
  const { table, selectedColumnId, highlighted } = data;
  const addColumn = useStore((state) => state.addColumn);

  return (
    <div
      className={cn(
        "pgc-node w-[268px] overflow-hidden rounded-[10px] border bg-surface shadow-sm transition-shadow",
        selected ? "border-elephant shadow-md" : "border-line",
        highlighted && !selected && "border-line-strong",
      )}
    >
      <div className="h-[3px] w-full" style={{ backgroundColor: table.color }} />

      <header
        className={cn(
          "flex items-center justify-between gap-2 border-b border-line py-2 pl-3 pr-1.5",
          selected ? "bg-elephant-soft" : "bg-surface-2",
        )}
      >
        <div className="min-w-0">
          <p className="truncate font-display text-[13.5px] font-semibold leading-tight text-ink">
            {table.name}
          </p>
          <p className="truncate font-mono text-[10px] leading-tight text-ink-faint">
            {table.schema}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {table.comment ? (
            <MessageSquareText size={12} className="text-ink-faint" aria-hidden />
          ) : null}
          <button
            type="button"
            aria-label={`Adicionar coluna em ${table.name}`}
            title="Adicionar coluna"
            onClick={(event) => {
              // sem isso o clique sobe para o no e troca a selecao para a tabela
              event.stopPropagation();
              addColumn(table.id);
            }}
            className="nodrag nopan inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface hover:text-elephant"
          >
            <Plus size={15} />
          </button>
        </div>
      </header>

      <ul className="divide-y divide-line/60">
        {table.columns.map((column) => {
          const role = keyRole(column);
          const isSelected = column.id === selectedColumnId;
          return (
            <li
              key={column.id}
              data-columnid={column.id}
              title={`${column.name} — clique para abrir os atributos`}
              className={cn(
                "group relative flex h-[30px] cursor-pointer items-center gap-2 px-3",
                isSelected
                  ? "bg-elephant-soft/70 ring-1 ring-inset ring-elephant/40"
                  : "hover:bg-surface-2",
              )}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={handleId(column.id, "t", "l")}
                className="!top-1/2"
              />
              <Handle
                type="source"
                position={Position.Left}
                id={handleId(column.id, "s", "l")}
                className="!top-1/2"
              />

              <span className="flex w-[30px] shrink-0 justify-start">
                {role !== "none" ? <KeyBadge role={role} /> : null}
              </span>

              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono text-[11.5px]",
                  column.isPrimary ? "font-semibold text-ink" : "text-ink",
                )}
              >
                {column.name}
              </span>

              {!column.nullable ? (
                <Asterisk size={9} className="shrink-0 text-alerta" aria-label="obrigatório" />
              ) : null}

              <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">
                {renderTypeShort(column.type, {
                  length: column.length,
                  precision: column.precision,
                  scale: column.scale,
                })}
              </span>

              <ChevronRight
                size={12}
                aria-hidden
                className={cn(
                  "-mr-1 shrink-0 text-elephant transition-opacity",
                  isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              />

              <Handle
                type="source"
                position={Position.Right}
                id={handleId(column.id, "s", "r")}
                className="!top-1/2"
              />
              <Handle
                type="target"
                position={Position.Right}
                id={handleId(column.id, "t", "r")}
                className="!top-1/2"
              />
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          addColumn(table.id);
        }}
        className={cn(
          "nodrag nopan flex w-full items-center justify-center gap-1.5 border-t border-dashed border-line",
          "px-3 py-2 text-[11.5px] font-medium text-ink-faint transition-colors",
          "hover:bg-elephant-soft hover:text-elephant",
        )}
      >
        <Plus size={13} />
        {table.columns.length === 0 ? "Criar a primeira coluna" : "Adicionar coluna"}
      </button>
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
