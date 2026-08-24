"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";
import type { SimRow, Table } from "@/lib/types";
import { ridOf } from "@/lib/types";
import { formatValue } from "@/lib/dataops";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export type DataNodeData = {
  table: Table;
  rows: SimRow[];
  total: number;
  focusRid: string | null;
  relatedRids: string[];
  flashRids: string[];
  /** linhas que sumiriam se a exclusao em analise for confirmada */
  doomedRids: string[];
  /** linhas que teriam a FK zerada */
  nullifiedRids: string[];
  /** ligadas a selecao mas fora das linhas visiveis do card */
  hiddenRelated: number;
};

export type DataNodeType = Node<DataNodeData, "dataCard">;

export const DATA_NODE_WIDTH = 300;

/** as colunas que cabem no card: chave, um texto que descreve e as FKs */
function layoutColumns(table: Table) {
  const key = table.columns.filter((column) => column.isPrimary);
  const fk = table.columns.filter((column) => column.isForeign && !column.isPrimary);
  const rest = table.columns.filter(
    (column) => !column.isPrimary && !column.isForeign,
  );
  return {
    key: key.length > 0 ? key : table.columns.slice(0, 1),
    label: rest.slice(0, 1),
    fk: fk.slice(0, 2),
  };
}

function DataCardNodeComponent({ data }: NodeProps<DataNodeType>) {
  const {
    table,
    rows,
    total,
    focusRid,
    relatedRids,
    flashRids,
    doomedRids,
    nullifiedRids,
    hiddenRelated,
  } = data;
  const setFocusRow = useStore((state) => state.setFocusRow);
  const requestDelete = useStore((state) => state.requestDelete);
  const insertRow = useStore((state) => state.insertRow);
  const columns = layoutColumns(table);

  return (
    <div
      style={{ width: DATA_NODE_WIDTH }}
      className="overflow-hidden rounded-[10px] border border-line bg-surface shadow-sm"
    >
      <Handle type="target" position={Position.Left} id="in-l" className="!opacity-0" />
      <Handle type="source" position={Position.Left} id="out-l" className="!opacity-0" />
      <Handle type="target" position={Position.Right} id="in-r" className="!opacity-0" />
      <Handle type="source" position={Position.Right} id="out-r" className="!opacity-0" />

      <div className="h-[3px] w-full" style={{ backgroundColor: table.color }} />

      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 py-2 pl-3 pr-1.5">
        <div className="min-w-0">
          <p className="truncate font-display text-[13.5px] font-semibold leading-tight">
            {table.name}
          </p>
          <p className="font-mono text-[10px] leading-tight text-ink-faint">
            {total} {total === 1 ? "linha" : "linhas"}
          </p>
        </div>
        <button
          type="button"
          title={`Inserir uma linha em ${table.name}`}
          aria-label={`Inserir uma linha em ${table.name}`}
          onClick={(event) => {
            event.stopPropagation();
            insertRow(table.id);
          }}
          className="nodrag nopan inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-dado-soft hover:text-dado"
        >
          <Plus size={15} />
        </button>
      </header>

      <ul className="divide-y divide-line/60">
        {rows.map((row) => {
          const rid = ridOf(row);
          const focused = rid === focusRid;
          const related = relatedRids.includes(rid);
          const doomed = doomedRids.includes(rid);
          const nullified = nullifiedRids.includes(rid);
          return (
            <li
              key={rid}
              className={cn(
                "group relative flex items-center gap-2 px-3 py-2 transition-colors",
                focused
                  ? "bg-dado-soft"
                  : related
                    ? "bg-brass-soft/70"
                    : "hover:bg-surface-2",
                doomed && "bg-alerta-soft line-through decoration-alerta/60",
                nullified && !doomed && "bg-brass-soft",
                flashRids.includes(rid) && "pgc-flash",
              )}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setFocusRow(focused ? null : { tableId: table.id, rid });
                }}
                className="nodrag nopan flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="shrink-0 rounded-[4px] bg-surface-3 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink">
                  {columns.key.map((column) => formatValue(row[column.id])).join(", ")}
                </span>
                {columns.label.map((column) => (
                  <span
                    key={column.id}
                    className="min-w-0 flex-1 truncate text-[11.5px] text-ink-soft"
                  >
                    {formatValue(row[column.id])}
                  </span>
                ))}
                {columns.fk.map((column) => (
                  <span
                    key={column.id}
                    title={`${column.name} = ${formatValue(row[column.id])}`}
                    className={cn(
                      "shrink-0 rounded-[4px] border px-1 font-mono text-[10px]",
                      row[column.id] === null
                        ? "border-line bg-surface-2 text-ink-faint"
                        : "border-violet/30 bg-violet-soft text-violet",
                    )}
                  >
                    {formatValue(row[column.id])}
                  </span>
                ))}
              </button>
              <button
                type="button"
                aria-label="Apagar esta linha"
                title="Apagar esta linha"
                onClick={(event) => {
                  event.stopPropagation();
                  requestDelete([{ tableId: table.id, rid }]);
                }}
                className="nodrag nopan inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint opacity-0 transition-all hover:bg-alerta-soft hover:text-alerta group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </li>
          );
        })}

        {rows.length === 0 ? (
          <li className="px-3 py-3 text-center text-[11.5px] text-ink-faint">
            Sem linhas. Use o + para inserir.
          </li>
        ) : null}
      </ul>

      {total > rows.length ? (
        <p className="border-t border-dashed border-line px-3 py-1.5 text-center font-mono text-[10px] text-ink-faint">
          mais {total - rows.length} {total - rows.length === 1 ? "linha" : "linhas"} nesta tabela
          {hiddenRelated > 0 ? `, ${hiddenRelated} ligada${hiddenRelated === 1 ? "" : "s"}` : ""}
        </p>
      ) : null}
    </div>
  );
}

export const DataCardNode = memo(DataCardNodeComponent);
