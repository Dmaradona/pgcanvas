"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Database,
  Download,
  Dices,
  Pencil,
  Play,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { toCsv, toInsertSql } from "@/lib/simulate";
import { findRow, relatedRows, rowLabel } from "@/lib/dataops";
import { downloadText, toIdentifier, cn } from "@/lib/utils";
import { Button, EmptyState, Field, TextInput } from "@/components/ui/primitives";
import { DataGrid } from "./DataGrid";

function RelationInspector() {
  const diagram = useStore((state) => state.diagram);
  const simData = useStore((state) => state.simData);
  const focusRow = useStore((state) => state.focusRow);
  const setSimTable = useStore((state) => state.setSimTable);
  const setFocusRow = useStore((state) => state.setFocusRow);
  const requestDelete = useStore((state) => state.requestDelete);

  const detail = useMemo(() => {
    if (!focusRow) return null;
    const table = diagram.tables.find((item) => item.id === focusRow.tableId);
    const row = findRow(simData, focusRow.tableId, focusRow.rid);
    if (!table || !row) return null;

    const related = relatedRows(diagram, simData, focusRow);

    const parents = related.parents.map((item) => {
      const parent = diagram.tables.find((table) => table.id === item.tableId);
      const column = parent?.columns.find((col) => col.id === item.relation.sourceColumnId);
      return {
        relationId: item.relation.id,
        tableId: item.tableId,
        rid: item.rid,
        label: `${parent?.name ?? "?"}.${column?.name ?? "?"}`,
        value: item.value,
      };
    });

    const children = related.children.map((item) => {
      const child = diagram.tables.find((table) => table.id === item.tableId);
      const column = child?.columns.find((col) => col.id === item.relation.targetColumnId);
      return {
        relationId: item.relation.id,
        tableId: item.tableId,
        label: `${child?.name ?? "?"}.${column?.name ?? "?"}`,
        count: item.rids.length,
        onDelete: item.relation.onDelete,
      };
    });

    return { table, row, parents, children };
  }, [diagram, simData, focusRow]);

  if (!detail) {
    return (
      <div className="px-4 py-4">
        <p className="eyebrow">Integridade referencial</p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
          Clique em uma linha da tabela para ver de onde ela veio e quem depende dela.
        </p>
        <p className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-soft">
          Com a linha selecionada, clique de novo em qualquer célula para editar o valor à mão.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <p className="eyebrow">Linha selecionada</p>
        <p className="mt-0.5 break-words font-mono text-[13px] font-semibold">
          {detail.table.name} · {rowLabel(detail.table, detail.row)}
        </p>
      </div>

      {detail.parents.length > 0 ? (
        <div>
          <p className="field-label">Depende de</p>
          <ul className="space-y-1">
            {detail.parents.map((parent) => (
              <li key={parent.relationId}>
                <button
                  type="button"
                  disabled={!parent.rid}
                  onClick={() => {
                    if (!parent.rid) return;
                    setSimTable(parent.tableId);
                    setFocusRow({ tableId: parent.tableId, rid: parent.rid });
                  }}
                  className="flex w-full items-center gap-2 rounded-md border border-line px-3 py-2.5 text-left transition-colors hover:border-elephant hover:bg-elephant-soft disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-transparent"
                >
                  <ArrowUpRight size={13} className="mt-0.5 shrink-0 self-start text-elephant" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-all font-mono text-[11.5px] leading-tight">
                      {parent.label}
                    </span>
                    <span className="block font-mono text-[10.5px] text-ink-faint">
                      {parent.value === null ? "NULL" : String(parent.value)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.children.length > 0 ? (
        <div>
          <p className="field-label">Referenciada por</p>
          <ul className="space-y-1">
            {detail.children.map((child) => (
              <li key={child.relationId}>
                <button
                  type="button"
                  onClick={() => {
                    setSimTable(child.tableId);
                    setFocusRow(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-md border border-line px-3 py-2.5 text-left transition-colors hover:border-dado hover:bg-dado-soft"
                >
                  <Database size={13} className="mt-0.5 shrink-0 self-start text-dado" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-all font-mono text-[11.5px] leading-tight">
                      {child.label}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span
                        className={cn(
                          "inline-block rounded-[3px] px-1.5 font-mono text-[10.5px] font-semibold",
                          child.count > 0 ? "bg-dado-soft text-dado" : "bg-surface-3 text-ink-faint",
                        )}
                      >
                        {child.count} {child.count === 1 ? "linha" : "linhas"}
                      </span>
                      <span className="font-mono text-[10px] text-ink-faint">
                        ON DELETE {child.onDelete}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.parents.length === 0 && detail.children.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-ink-faint">
          Esta tabela não participa de nenhum relacionamento.
        </p>
      ) : null}

      <Button
        variant="danger"
        className="w-full"
        onClick={() => focusRow && requestDelete([focusRow])}
      >
        <Trash2 size={14} />
        Apagar esta linha
      </Button>
    </div>
  );
}

export function SimulationView() {
  const diagram = useStore((state) => state.diagram);
  const simData = useStore((state) => state.simData);
  const simWarnings = useStore((state) => state.simWarnings);
  const simOptions = useStore((state) => state.simOptions);
  const setSimOptions = useStore((state) => state.setSimOptions);
  const runSimulation = useStore((state) => state.runSimulation);
  const simTableId = useStore((state) => state.simTableId);
  const setSimTable = useStore((state) => state.setSimTable);
  const focusRow = useStore((state) => state.focusRow);
  const setFocusRow = useStore((state) => state.setFocusRow);
  const updateTable = useStore((state) => state.updateTable);
  const insertRow = useStore((state) => state.insertRow);
  const requestDelete = useStore((state) => state.requestDelete);
  const flash = useStore((state) => state.flash);
  const dataStored = useStore((state) => state.dataStored);

  const [notice, setNotice] = useState<string | null>(null);

  const hasData = Object.values(simData).some((rows) => rows.length > 0);
  const activeTable =
    diagram.tables.find((table) => table.id === simTableId) ?? diagram.tables[0] ?? null;
  const rows = activeTable ? simData[activeTable.id] ?? [] : [];

  const totalRows = Object.values(simData).reduce((total, list) => total + list.length, 0);

  const relatedInTable = useMemo(() => {
    if (!focusRow || !activeTable || focusRow.tableId === activeTable.id) return [];
    return relatedRows(diagram, simData, focusRow).byTable[activeTable.id] ?? [];
  }, [diagram, simData, focusRow, activeTable]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[246px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="space-y-3 border-b border-line px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Semente">
              <TextInput
                mono
                value={simOptions.seed}
                onChange={(event) => setSimOptions({ seed: event.target.value })}
              />
            </Field>
            <Field label="Nulos (%)">
              <TextInput
                mono
                type="number"
                min={0}
                max={60}
                value={Math.round(simOptions.nullRate * 100)}
                onChange={(event) =>
                  setSimOptions({
                    nullRate: Math.min(0.6, Math.max(0, Number(event.target.value) / 100 || 0)),
                  })
                }
              />
            </Field>
          </div>
          <div className="flex gap-1.5">
            <Button variant="dado" className="flex-1" onClick={runSimulation}>
              <Play size={14} />
              {hasData ? "Gerar de novo" : "Gerar dados"}
            </Button>
            <Button
              variant="subtle"
              aria-label="Sortear nova semente"
              title="Sortear nova semente"
              onClick={() => {
                setSimOptions({ seed: Math.random().toString(36).slice(2, 9) });
                window.setTimeout(runSimulation, 0);
              }}
            >
              <Dices size={14} />
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            A mesma semente sempre gera os mesmos dados. Depois de gerar, dá para editar cada
            célula à mão.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <p className="eyebrow px-2 py-1">Tabelas e volume</p>
          <ul className="space-y-px">
            {diagram.tables.map((table) => {
              const active = table.id === activeTable?.id;
              const generated = simData[table.id]?.length ?? 0;
              return (
                <li key={table.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-2",
                      active ? "bg-dado-soft" : "hover:bg-surface-2",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSimTable(table.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: table.color }}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                        {table.name}
                      </span>
                      {generated > 0 ? (
                        <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                          {generated}
                        </span>
                      ) : null}
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={2000}
                      value={table.rowCount}
                      aria-label={`Linhas para ${table.name}`}
                      onChange={(event) =>
                        updateTable(table.id, {
                          rowCount: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      className="h-7 w-[52px] shrink-0 rounded border border-line bg-surface px-1 text-right font-mono text-[11px]"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {!dataStored ? (
          <p className="border-t border-line px-3 py-2 text-[11px] leading-relaxed text-brass">
            Volume grande demais para o navegador guardar. O modelo continua salvo, mas estes
            dados somem ao fechar a aba: exporte os INSERTs antes.
          </p>
        ) : null}
        {hasData ? (
          <div className="space-y-1.5 border-t border-line p-2">
            <Button
              size="sm"
              variant="subtle"
              className="w-full"
              onClick={() =>
                downloadText(
                  `${toIdentifier(diagram.name) || "modelo"}_dados.sql`,
                  toInsertSql(diagram, simData),
                  "application/sql",
                )
              }
            >
              <Download size={13} />
              Baixar INSERTs
            </Button>
            <Button
              size="sm"
              variant="subtle"
              className="w-full"
              disabled={!activeTable}
              onClick={() => {
                if (!activeTable) return;
                downloadText(`${activeTable.name}.csv`, toCsv(activeTable, rows), "text/csv");
              }}
            >
              <Download size={13} />
              CSV desta tabela
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {simWarnings.length > 0 ? (
          <div className="flex items-start gap-2 border-b border-line bg-brass-soft px-4 py-2">
            <TriangleAlert size={14} className="mt-px shrink-0 text-brass" />
            <ul className="space-y-0.5 text-[11.5px] leading-relaxed text-ink">
              {simWarnings.slice(0, 3).map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {notice ? (
          <div className="flex items-start gap-2 border-b border-alerta bg-alerta-soft px-4 py-2">
            <TriangleAlert size={14} className="mt-px shrink-0 text-alerta" />
            <p className="text-[11.5px] leading-relaxed text-alerta">{notice}</p>
          </div>
        ) : null}

        {!hasData ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              title="Nenhum dado gerado ainda"
              description="A simulação usa o modelo atual, respeita tipos, NOT NULL, UNIQUE e insere as linhas na ordem correta das chaves estrangeiras. Depois de gerar, você pode editar, incluir e apagar linhas."
              action={
                <Button
                  variant="dado"
                  onClick={runSimulation}
                  disabled={diagram.tables.length === 0}
                >
                  <Play size={14} />
                  Gerar dados
                </Button>
              }
            />
          </div>
        ) : activeTable ? (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
              <div className="min-w-0">
                <p className="eyebrow">Tabela</p>
                <h2 className="truncate font-mono text-[13.5px] font-semibold">
                  {activeTable.schema}.{activeTable.name}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden items-center gap-1 font-mono text-[11px] text-ink-faint lg:flex">
                  <Pencil size={11} />
                  duplo clique edita a célula
                </span>
                <p className="font-mono text-[11px] text-ink-faint">
                  {rows.length} de {totalRows}
                </p>
                <Button
                  size="sm"
                  variant="dado"
                  onClick={() => setNotice(insertRow(activeTable.id))}
                >
                  <Plus size={13} />
                  Nova linha
                </Button>
              </div>
            </header>
            <div className="min-h-0 flex-1">
              <DataGrid
                table={activeTable}
                rows={rows}
                editable
                focusRid={focusRow?.tableId === activeTable.id ? focusRow.rid : null}
                relatedRids={relatedInTable}
                flashRids={flash}
                onFocusRow={(rid) =>
                  setFocusRow(rid === null ? null : { tableId: activeTable.id, rid })
                }
                onInsertRow={() => setNotice(insertRow(activeTable.id))}
                onDeleteRow={(rid) => requestDelete([{ tableId: activeTable.id, rid }])}
              />
            </div>
          </>
        ) : null}
      </div>

      <aside className="w-[248px] shrink-0 overflow-y-auto border-l border-line bg-surface">
        <RelationInspector />
      </aside>
    </div>
  );
}
