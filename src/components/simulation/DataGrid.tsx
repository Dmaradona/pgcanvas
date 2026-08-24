"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import { keyRole, ridOf, type SimRow, type Table } from "@/lib/types";
import { getType } from "@/lib/pg-types";
import { useStore } from "@/lib/store";
import { parentOptions, relationOfColumn } from "@/lib/dataops";
import { cn } from "@/lib/utils";
import { IconButton, KeyBadge } from "@/components/ui/primitives";

const PAGE_SIZE = 50;

function renderValue(value: SimRow[string]) {
  if (value === null || value === undefined) {
    return <span className="italic text-ink-faint">NULL</span>;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function rawOf(value: SimRow[string]): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

interface DataGridProps {
  table: Table;
  rows: SimRow[];
  focusRid: string | null;
  onFocusRow: (rid: string | null) => void;
  /** quando presente, a grade vira editavel */
  editable?: boolean;
  onDeleteRow?: (rid: string) => void;
  onInsertRow?: () => void;
  highlightColumnId?: string | null;
  /** linhas ligadas a selecao atual, destacadas em outra cor */
  relatedRids?: string[];
  /** linhas que acabaram de mudar, para piscar */
  flashRids?: string[];
}

export function DataGrid({
  table,
  rows,
  focusRid,
  onFocusRow,
  editable = false,
  onDeleteRow,
  onInsertRow,
  highlightColumnId,
  relatedRids,
  flashRids,
}: DataGridProps) {
  const diagram = useStore((state) => state.diagram);
  const updateCell = useStore((state) => state.updateCell);

  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ rid: string; columnId: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const related = useMemo(() => new Set(relatedRids ?? []), [relatedRids]);
  const flash = useMemo(() => new Set(flashRids ?? []), [flashRids]);

  // trocar de tabela cancela qualquer edicao pendente e volta para a pagina 1
  const [shownTableId, setShownTableId] = useState(table.id);
  if (shownTableId !== table.id) {
    setShownTableId(table.id);
    setEditing(null);
    setError(null);
    setPage(0);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEdit(rid: string, columnId: string, value: SimRow[string]) {
    if (!editable) return;
    setEditing({ rid, columnId });
    setDraft(rawOf(value));
    setError(null);
  }

  function commit(rid: string, columnId: string, raw: string) {
    const message = updateCell(table.id, rid, columnId, raw);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setEditing(null);
  }

  const columnCount = table.columns.length + (editable ? 2 : 1);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-11 border-b border-r border-line bg-surface-2 px-2 py-2 text-right font-mono text-[10px] font-medium text-ink-faint">
                #
              </th>
              {table.columns.map((column) => {
                const role = keyRole(column);
                const relation = relationOfColumn(diagram, table.id, column.id);
                const parent = relation
                  ? diagram.tables.find((item) => item.id === relation.sourceTableId)
                  : undefined;
                return (
                  <th
                    key={column.id}
                    className={cn(
                      "whitespace-nowrap border-b border-r border-line bg-surface-2 px-3 py-2 text-left align-bottom",
                      highlightColumnId === column.id && "bg-violet-soft",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {role !== "none" ? <KeyBadge role={role} /> : null}
                      <span className="font-mono text-[11.5px] font-semibold text-ink">
                        {column.name}
                      </span>
                      {!column.nullable ? (
                        <span className="font-mono text-[9px] text-alerta">NN</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block font-mono text-[9.5px] font-normal text-ink-faint">
                      {parent ? `→ ${parent.name}` : getType(column.type).sql}
                    </span>
                  </th>
                );
              })}
              {editable ? (
                <th className="w-10 border-b border-line bg-surface-2 px-2 py-2" aria-label="Ações" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, offset) => {
              const index = current * PAGE_SIZE + offset;
              const rid = ridOf(row);
              const focused = rid === focusRid;
              const isRelated = related.has(rid);
              return (
                <tr
                  key={rid || index}
                  className={cn(
                    "transition-colors",
                    focused
                      ? "bg-dado-soft"
                      : isRelated
                        ? "bg-brass-soft/60"
                        : "hover:bg-surface-2",
                    flash.has(rid) && "pgc-flash",
                  )}
                >
                  <td
                    onClick={() => onFocusRow(focused ? null : rid)}
                    className="cursor-pointer border-b border-r border-line px-2 py-1.5 text-right font-mono text-[10px] text-ink-faint"
                  >
                    {index + 1}
                  </td>
                  {table.columns.map((column) => {
                    const kind = getType(column.type).kind;
                    const numeric = kind === "int" || kind === "float" || kind === "money";
                    const isEditing = editing?.rid === rid && editing.columnId === column.id;
                    const relation = relationOfColumn(diagram, table.id, column.id);
                    const value = row[column.id] ?? null;

                    if (isEditing) {
                      return (
                        <td
                          key={column.id}
                          className={cn(
                            "border-b border-r border-line p-0",
                            error && "ring-1 ring-inset ring-alerta",
                          )}
                        >
                          {relation || kind === "bool" ? (
                            <FkSelect
                              ref={inputRef as React.Ref<HTMLSelectElement>}
                              nullable={column.nullable}
                              value={draft}
                              options={
                                relation
                                  ? undefined
                                  : [
                                      { value: "true", label: "true" },
                                      { value: "false", label: "false" },
                                    ]
                              }
                              relationId={relation?.id}
                              onCancel={() => {
                                setEditing(null);
                                setError(null);
                              }}
                              onCommit={(next) => commit(rid, column.id, next)}
                            />
                          ) : (
                            <input
                              ref={inputRef as React.Ref<HTMLInputElement>}
                              value={draft}
                              spellCheck={false}
                              onChange={(event) => setDraft(event.target.value)}
                              onBlur={() => commit(rid, column.id, draft)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commit(rid, column.id, draft);
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  setEditing(null);
                                  setError(null);
                                }
                              }}
                              className="w-full bg-surface px-3 py-1.5 font-mono text-[12px] outline-none"
                            />
                          )}
                        </td>
                      );
                    }

                    return (
                      <td
                        key={column.id}
                        onClick={() => {
                          if (editable && focused) startEdit(rid, column.id, value);
                          else onFocusRow(rid);
                        }}
                        onDoubleClick={() => startEdit(rid, column.id, value)}
                        title={
                          editable
                            ? "Clique na linha e depois na célula para editar, ou dê um duplo clique"
                            : undefined
                        }
                        className={cn(
                          "group/cell relative max-w-[240px] cursor-pointer truncate border-b border-r border-line px-3 py-1.5 font-mono",
                          numeric && "text-right tabular-nums",
                          highlightColumnId === column.id && "bg-violet-soft/60",
                        )}
                      >
                        {renderValue(value)}
                        {editable ? (
                          <Pencil
                            size={10}
                            aria-hidden
                            className="absolute right-1 top-1/2 -translate-y-1/2 text-elephant opacity-0 transition-opacity group-hover/cell:opacity-70"
                          />
                        ) : null}
                      </td>
                    );
                  })}
                  {editable ? (
                    <td className="border-b border-line px-1 py-0.5 text-center">
                      <button
                        type="button"
                        aria-label="Apagar esta linha"
                        title="Apagar esta linha e ver o efeito nas filhas"
                        onClick={() => onDeleteRow?.(rid)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-alerta-soft hover:text-alerta"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-4 py-8 text-center text-[12.5px] text-ink-faint"
                >
                  Nenhuma linha nesta tabela.
                </td>
              </tr>
            ) : null}

            {editable && onInsertRow ? (
              <tr>
                <td colSpan={columnCount} className="border-b border-line p-0">
                  <button
                    type="button"
                    onClick={onInsertRow}
                    className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-medium text-ink-faint transition-colors hover:bg-dado-soft hover:text-dado"
                  >
                    <Plus size={13} />
                    Nova linha em {table.name}
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {error ? (
        <div className="flex shrink-0 items-start gap-2 border-t border-alerta bg-alerta-soft px-3 py-2">
          <CircleAlert size={14} className="mt-px shrink-0 text-alerta" />
          <p className="text-[11.5px] leading-relaxed text-alerta">{error}</p>
        </div>
      ) : null}

      {rows.length > PAGE_SIZE ? (
        <div className="flex shrink-0 items-center justify-between border-t border-line px-3 py-1.5">
          <p className="font-mono text-[11px] text-ink-faint">
            {current * PAGE_SIZE + 1} a {Math.min(rows.length, (current + 1) * PAGE_SIZE)} de{" "}
            {rows.length}
          </p>
          <div className="flex items-center gap-1">
            <IconButton
              label="Página anterior"
              onClick={() => setPage(Math.max(0, current - 1))}
              disabled={current === 0}
            >
              <ChevronLeft size={14} />
            </IconButton>
            <span className="font-mono text-[11px] text-ink-soft">
              {current + 1}/{pageCount}
            </span>
            <IconButton
              label="Próxima página"
              onClick={() => setPage(Math.min(pageCount - 1, current + 1))}
              disabled={current >= pageCount - 1}
            >
              <ChevronRight size={14} />
            </IconButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Editor de celula para FK e boolean. Numa FK o valor so pode ser uma chave
 * que existe no pai, entao a lista evita o erro antes de ele acontecer.
 */
const FkSelect = function FkSelect({
  ref,
  value,
  nullable,
  relationId,
  options,
  onCommit,
  onCancel,
}: {
  ref?: React.Ref<HTMLSelectElement>;
  value: string;
  nullable: boolean;
  relationId?: string;
  options?: Array<{ value: string; label: string }>;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const diagram = useStore((state) => state.diagram);
  const simData = useStore((state) => state.simData);
  // escolher uma opcao dispara change e logo em seguida blur; sem esta marca
  // o blur cancelaria a edicao e engoliria a mensagem de erro do commit
  const committed = useRef(false);
  const relation = diagram.relations.find((item) => item.id === relationId);
  const list =
    options ??
    (relation
      ? parentOptions(diagram, simData, relation).map((item) => ({
          value: item.value === null ? "" : String(item.value),
          label: item.label,
        }))
      : []);

  return (
    <select
      ref={ref}
      defaultValue={value}
      onChange={(event) => {
        committed.current = true;
        onCommit(event.target.value);
      }}
      onBlur={() => {
        if (!committed.current) onCancel();
        committed.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
      className="w-full cursor-pointer bg-surface px-2.5 py-1.5 font-mono text-[12px] outline-none"
    >
      {nullable ? <option value="">NULL</option> : null}
      {list.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
};
