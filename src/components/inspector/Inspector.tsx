"use client";

import { ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { keyRole, type Table } from "@/lib/types";
import { renderTypeShort } from "@/lib/pg-types";
import { TABLE_COLORS, cn } from "@/lib/utils";
import {
  Button,
  Field,
  IconButton,
  KeyBadge,
  TextInput,
} from "@/components/ui/primitives";
import { ColumnEditor } from "./ColumnEditor";
import { RelationEditor } from "./RelationEditor";

function TableEditor({ table }: { table: Table }) {
  const updateTable = useStore((state) => state.updateTable);
  const removeTable = useStore((state) => state.removeTable);
  const duplicateTable = useStore((state) => state.duplicateTable);
  const addColumn = useStore((state) => state.addColumn);
  const setSelection = useStore((state) => state.setSelection);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">Tabela</p>
          <h2 className="truncate font-mono text-[14px] font-semibold">
            {table.schema}.{table.name}
          </h2>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton label="Duplicar tabela" onClick={() => duplicateTable(table.id)}>
            <Copy size={14} />
          </IconButton>
          <IconButton label="Remover tabela" tone="danger" onClick={() => removeTable(table.id)}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <Field label="Nome">
            <TextInput
              mono
              value={table.name}
              spellCheck={false}
              onChange={(event) => updateTable(table.id, { name: event.target.value })}
            />
          </Field>
          <Field label="Schema">
            <TextInput
              mono
              value={table.schema}
              spellCheck={false}
              onChange={(event) => updateTable(table.id, { schema: event.target.value })}
            />
          </Field>
        </div>

        <div>
          <span className="field-label">Cor no canvas</span>
          <div className="flex flex-wrap gap-1.5">
            {TABLE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Usar a cor ${color}`}
                onClick={() => updateTable(table.id, { color })}
                style={{ backgroundColor: color }}
                className={cn(
                  "h-6 w-6 rounded-md border-2 transition-transform",
                  table.color === color
                    ? "border-ink scale-110"
                    : "border-transparent hover:scale-105",
                )}
              />
            ))}
          </div>
        </div>

        <Field label="Comentário">
          <textarea
            className="field min-h-[54px] resize-y"
            value={table.comment ?? ""}
            placeholder="COMMENT ON TABLE"
            onChange={(event) => updateTable(table.id, { comment: event.target.value })}
          />
        </Field>

        <Field label="Linhas na simulação" hint="Quantas linhas gerar para esta tabela">
          <TextInput
            mono
            type="number"
            min={0}
            max={2000}
            value={table.rowCount}
            onChange={(event) =>
              updateTable(table.id, { rowCount: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="field-label mb-0">Colunas ({table.columns.length})</span>
            <Button size="sm" variant="primary" onClick={() => addColumn(table.id)}>
              <Plus size={13} />
              Nova coluna
            </Button>
          </div>

          <ul className="overflow-hidden rounded-md border border-line">
            {table.columns.map((column) => {
              const role = keyRole(column);
              return (
                <li key={column.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() =>
                      setSelection({ kind: "column", tableId: table.id, columnId: column.id })
                    }
                    title={`Abrir os atributos de ${column.name}`}
                    className="group flex w-full items-center gap-2 px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="flex w-[30px] shrink-0 justify-start">
                      {role !== "none" ? <KeyBadge role={role} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12.5px] leading-tight">
                        {column.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1">
                        <span className="font-mono text-[10.5px] text-ink-faint">
                          {renderTypeShort(column.type, {
                            length: column.length,
                            precision: column.precision,
                            scale: column.scale,
                          })}
                        </span>
                        {!column.nullable ? (
                          <span className="font-mono text-[10px] text-alerta">NOT NULL</span>
                        ) : null}
                        {column.unique ? (
                          <span className="font-mono text-[10px] text-dado">UNIQUE</span>
                        ) : null}
                        {column.identity ? (
                          <span className="font-mono text-[10px] text-brass">IDENTITY</span>
                        ) : null}
                      </span>
                    </span>
                    <ChevronRight
                      size={14}
                      aria-hidden
                      className="shrink-0 text-ink-faint transition-colors group-hover:text-elephant"
                    />
                  </button>
                </li>
              );
            })}
            <li className="border-t border-dashed border-line">
              <button
                type="button"
                onClick={() => addColumn(table.id)}
                className="flex w-full items-center justify-center gap-1.5 px-2.5 py-2.5 text-[12px] font-medium text-ink-faint transition-colors hover:bg-elephant-soft hover:text-elephant"
              >
                <Plus size={13} />
                {table.columns.length === 0 ? "Criar a primeira coluna" : "Adicionar coluna"}
              </button>
            </li>
          </ul>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            Clique numa coluna para abrir tipo, chave, restrições e gerador.
          </p>
        </div>
      </div>
    </div>
  );
}

function Overview() {
  const diagram = useStore((state) => state.diagram);
  const setSelection = useStore((state) => state.setSelection);
  const setDiagramName = useStore((state) => state.setDiagramName);

  const columnCount = diagram.tables.reduce((total, table) => total + table.columns.length, 0);
  const pfkCount = diagram.tables.reduce(
    (total, table) =>
      total + table.columns.filter((column) => column.isPrimary && column.isForeign).length,
    0,
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-4 py-3">
        <p className="eyebrow">Modelo</p>
        <h2 className="text-[15px] font-semibold">Visão geral</h2>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="Nome do modelo">
          <TextInput
            value={diagram.name}
            onChange={(event) => setDiagramName(event.target.value)}
          />
        </Field>

        <dl className="grid grid-cols-2 gap-2">
          {[
            ["Tabelas", diagram.tables.length],
            ["Colunas", columnCount],
            ["Relacionamentos", diagram.relations.length],
            ["Colunas PFK", pfkCount],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-md border border-line px-2.5 py-2">
              <dt className="text-[10.5px] uppercase tracking-wide text-ink-faint">{label}</dt>
              <dd className="font-display text-[19px] font-semibold leading-tight">{value}</dd>
            </div>
          ))}
        </dl>

        {diagram.relations.length > 0 ? (
          <div>
            <span className="field-label">Relacionamentos</span>
            <ul className="overflow-hidden rounded-md border border-line">
              {diagram.relations.map((relation) => {
                const parent = diagram.tables.find((t) => t.id === relation.sourceTableId);
                const child = diagram.tables.find((t) => t.id === relation.targetTableId);
                return (
                  <li key={relation.id} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setSelection({ kind: "relation", relationId: relation.id })}
                      className="flex w-full items-center gap-2 px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                        {parent?.name ?? "?"} para {child?.name ?? "?"}
                      </span>
                      <span className="shrink-0 rounded-[3px] border border-line px-1 font-mono text-[9.5px] text-ink-soft">
                        {relation.cardinality}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-ink-soft">Como ligar duas tabelas</p>
          <ol className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-ink-faint">
            <li>1. Passe o mouse sobre a coluna que será referenciada, normalmente a PK.</li>
            <li>2. Arraste da bolinha lateral até a coluna que vai receber a FK.</li>
            <li>3. Ajuste cardinalidade e ações no painel do relacionamento.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export function Inspector() {
  const selection = useStore((state) => state.selection);
  const diagram = useStore((state) => state.diagram);

  if (selection.kind === "relation") {
    const relation = diagram.relations.find((item) => item.id === selection.relationId);
    if (relation) return <RelationEditor relation={relation} />;
  }

  if (selection.kind === "column") {
    const table = diagram.tables.find((item) => item.id === selection.tableId);
    const column = table?.columns.find((item) => item.id === selection.columnId);
    if (table && column) return <ColumnEditor table={table} column={column} />;
  }

  if (selection.kind === "table") {
    const table = diagram.tables.find((item) => item.id === selection.tableId);
    if (table) return <TableEditor table={table} />;
  }

  return <Overview />;
}
