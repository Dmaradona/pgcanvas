"use client";

import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { PG_TYPES, TYPE_GROUPS, getType, isSerial, renderType } from "@/lib/pg-types";
import { GENERATORS } from "@/lib/simulate";
import { keyRole, type Column, type KeyRole, type Table } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Button,
  Chip,
  Field,
  IconButton,
  KeyBadge,
  SelectInput,
  Segmented,
  TextInput,
  Toggle,
} from "@/components/ui/primitives";

const ROLE_OPTIONS: Array<{ value: KeyRole; label: string }> = [
  { value: "none", label: "Comum" },
  { value: "pk", label: "PK" },
  { value: "fk", label: "FK" },
  { value: "pfk", label: "PFK" },
];

const ROLE_HELP: Record<KeyRole, string> = {
  none: "Coluna de atributo, sem participação em chaves.",
  pk: "Compõe a chave primária. Vira NOT NULL automaticamente.",
  fk: "Chave estrangeira. Ligue no canvas arrastando da coluna referenciada até aqui.",
  pfk: "Chave primária e estrangeira ao mesmo tempo, o caso clássico de tabela associativa.",
};

const GENERATOR_GROUPS = Array.from(new Set(GENERATORS.map((g) => g.group)));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {title}
        <span className="h-px flex-1 bg-line" />
      </h3>
      {children}
    </section>
  );
}

/** linha do DDL que esta coluna vai gerar, para conferir sem abrir o painel */
function ddlPreview(column: Column): string {
  const parts = [
    column.name,
    renderType(column.type, {
      length: column.length,
      precision: column.precision,
      scale: column.scale,
    }),
  ];
  if (column.identity && !isSerial(column.type)) parts.push("GENERATED ALWAYS AS IDENTITY");
  if (!column.nullable) parts.push("NOT NULL");
  if (column.unique && !column.isPrimary) parts.push("UNIQUE");
  if (column.defaultValue?.trim()) parts.push(`DEFAULT ${column.defaultValue.trim()}`);
  if (column.check?.trim()) parts.push(`CHECK (${column.check.trim()})`);
  return parts.join(" ");
}

export function ColumnEditor({ table, column }: { table: Table; column: Column }) {
  const updateColumn = useStore((state) => state.updateColumn);
  const setColumnRole = useStore((state) => state.setColumnRole);
  const removeColumn = useStore((state) => state.removeColumn);
  const moveColumn = useStore((state) => state.moveColumn);
  const addColumn = useStore((state) => state.addColumn);
  const setSelection = useStore((state) => state.setSelection);
  const diagram = useStore((state) => state.diagram);

  const role = keyRole(column);
  const type = getType(column.type);
  const index = table.columns.findIndex((item) => item.id === column.id);

  const relation = diagram.relations.find(
    (item) => item.targetTableId === table.id && item.targetColumnId === column.id,
  );
  const parentTable = relation
    ? diagram.tables.find((item) => item.id === relation.sourceTableId)
    : undefined;
  const parentColumn = parentTable
    ? parentTable.columns.find((item) => item.id === relation?.sourceColumnId)
    : undefined;

  const goTo = (offset: number) => {
    const next = table.columns[index + offset];
    if (next) setSelection({ kind: "column", tableId: table.id, columnId: next.id });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelection({ kind: "table", tableId: table.id })}
            className="min-w-0 text-left"
            title="Voltar para a tabela"
          >
            <p className="eyebrow">Coluna de {table.name}</p>
            <h2 className="truncate font-mono text-[14.5px] font-semibold">{column.name}</h2>
          </button>
          <div className="flex shrink-0 items-center">
            <IconButton
              label="Mover para cima"
              onClick={() => moveColumn(table.id, column.id, -1)}
              disabled={index <= 0}
            >
              <ArrowUp size={14} />
            </IconButton>
            <IconButton
              label="Mover para baixo"
              onClick={() => moveColumn(table.id, column.id, 1)}
              disabled={index >= table.columns.length - 1}
            >
              <ArrowDown size={14} />
            </IconButton>
            <IconButton
              label="Remover coluna"
              tone="danger"
              onClick={() => removeColumn(table.id, column.id)}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        </div>

        {/* leitura rapida do que esta coluna e, sem precisar rolar o painel */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {role !== "none" ? <KeyBadge role={role} /> : null}
          <Chip tone="elephant">
            {renderType(column.type, {
              length: column.length,
              precision: column.precision,
              scale: column.scale,
            })}
          </Chip>
          {!column.nullable ? (
            <Chip tone="alerta" title="A coluna não aceita valores nulos">
              NOT NULL
            </Chip>
          ) : (
            <Chip title="A coluna aceita valores nulos">NULL ok</Chip>
          )}
          {column.unique ? <Chip tone="dado">UNIQUE</Chip> : null}
          {column.identity ? <Chip tone="brass">IDENTITY</Chip> : null}
          {column.defaultValue?.trim() ? <Chip>DEFAULT</Chip> : null}
          {column.check?.trim() ? <Chip tone="violet">CHECK</Chip> : null}
        </div>

        <p className="mt-2 overflow-x-auto whitespace-nowrap rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[10.5px] text-ink-soft">
          {ddlPreview(column)}
        </p>

        {/* navegar entre as colunas sem voltar para a lista */}
        <div className="mt-2 flex items-center gap-1">
          <IconButton label="Coluna anterior" onClick={() => goTo(-1)} disabled={index <= 0}>
            <ChevronLeft size={14} />
          </IconButton>
          <SelectInput
            className="field-mono h-8 py-0 text-[12px]"
            aria-label="Trocar de coluna"
            value={column.id}
            onChange={(event) =>
              setSelection({ kind: "column", tableId: table.id, columnId: event.target.value })
            }
          >
            {table.columns.map((item, position) => (
              <option key={item.id} value={item.id}>
                {position + 1}. {item.name}
              </option>
            ))}
          </SelectInput>
          <IconButton
            label="Próxima coluna"
            onClick={() => goTo(1)}
            disabled={index >= table.columns.length - 1}
          >
            <ChevronRight size={14} />
          </IconButton>
          <IconButton label="Adicionar coluna" onClick={() => addColumn(table.id)}>
            <Plus size={15} />
          </IconButton>
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Section title="Identificação">
          <Field label="Nome">
            <TextInput
              mono
              value={column.name}
              onChange={(event) => updateColumn(table.id, column.id, { name: event.target.value })}
              spellCheck={false}
            />
          </Field>

          <Field label="Tipo" hint={type.hint}>
            <SelectInput
              className="field-mono"
              value={column.type}
              onChange={(event) => {
                const next = getType(event.target.value);
                updateColumn(table.id, column.id, {
                  type: next.key,
                  length: next.args === "length" ? next.defaultLength : undefined,
                  precision: next.args === "precision" ? next.defaultPrecision : undefined,
                  scale: next.args === "precision" ? next.defaultScale : undefined,
                });
              }}
            >
              {TYPE_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {PG_TYPES.filter((item) => item.group === group).map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.sql}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectInput>
          </Field>

          {type.args === "length" ? (
            <Field label="Tamanho">
              <TextInput
                mono
                type="number"
                min={1}
                max={10485760}
                value={column.length ?? ""}
                onChange={(event) =>
                  updateColumn(table.id, column.id, {
                    length: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              />
            </Field>
          ) : null}

          {type.args === "precision" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Precisão">
                <TextInput
                  mono
                  type="number"
                  min={1}
                  max={1000}
                  value={column.precision ?? ""}
                  onChange={(event) =>
                    updateColumn(table.id, column.id, {
                      precision: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Escala">
                <TextInput
                  mono
                  type="number"
                  min={0}
                  max={1000}
                  value={column.scale ?? ""}
                  onChange={(event) =>
                    updateColumn(table.id, column.id, {
                      scale: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                />
              </Field>
            </div>
          ) : null}
        </Section>

        <Section title="Papel na chave">
          <div>
            <Segmented
              className="w-full"
              value={role}
              options={ROLE_OPTIONS}
              onChange={(next) => setColumnRole(table.id, column.id, next)}
            />
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">{ROLE_HELP[role]}</p>
          </div>

          {relation && parentTable && parentColumn ? (
            <button
              type="button"
              onClick={() => setSelection({ kind: "relation", relationId: relation.id })}
              className="flex w-full items-center gap-2.5 rounded-md border border-violet/30 bg-violet-soft px-3 py-2.5 text-left transition-colors hover:border-violet"
            >
              <Link2 size={15} className="shrink-0 text-violet" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-violet">
                  Referencia {relation.cardinality}
                </span>
                <span className="block truncate font-mono text-[11.5px] text-ink">
                  {parentTable.name}.{parentColumn.name}
                </span>
              </span>
              <ChevronRight size={14} className="shrink-0 text-violet" />
            </button>
          ) : null}
        </Section>

        <Section title="Restrições">
          <div className="space-y-0.5 rounded-md border border-line p-1">
            <Toggle
              label="Aceita nulo"
              description="Desmarque para gerar NOT NULL"
              checked={column.nullable}
              onChange={(value) => updateColumn(table.id, column.id, { nullable: value })}
            />
            <Toggle
              label="Valor único"
              description="Gera uma constraint UNIQUE"
              checked={column.unique}
              onChange={(value) => updateColumn(table.id, column.id, { unique: value })}
            />
            <Toggle
              label="Identity"
              description="GENERATED ALWAYS AS IDENTITY"
              checked={column.identity}
              onChange={(value) => updateColumn(table.id, column.id, { identity: value })}
            />
          </div>

          <Field label="Valor padrão" hint="Escreva como sai no DDL, por exemplo now() ou 'ativo'">
            <TextInput
              mono
              value={column.defaultValue ?? ""}
              placeholder="sem default"
              onChange={(event) =>
                updateColumn(table.id, column.id, { defaultValue: event.target.value })
              }
            />
          </Field>

          <Field label="Check" hint="Expressão booleana, por exemplo quantidade > 0">
            <TextInput
              mono
              value={column.check ?? ""}
              placeholder="sem check"
              onChange={(event) => updateColumn(table.id, column.id, { check: event.target.value })}
            />
          </Field>
        </Section>

        <Section title="Documentação e dados">
          <Field label="Comentário">
            <textarea
              className="field min-h-[60px] resize-y"
              value={column.comment ?? ""}
              placeholder="COMMENT ON COLUMN"
              onChange={(event) =>
                updateColumn(table.id, column.id, { comment: event.target.value })
              }
            />
          </Field>

          <Field
            label="Gerador na simulação"
            hint="Automático decide pelo nome da coluna e pelo tipo"
          >
            <SelectInput
              value={column.generator ?? "auto"}
              onChange={(event) =>
                updateColumn(table.id, column.id, { generator: event.target.value })
              }
            >
              {GENERATOR_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {GENERATORS.filter((item) => item.group === group).map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectInput>
          </Field>
        </Section>
      </div>

      <footer className="flex gap-1.5 border-t border-line px-4 py-3">
        <Button
          className={cn("flex-1")}
          variant="subtle"
          onClick={() => setSelection({ kind: "table", tableId: table.id })}
        >
          Voltar para a tabela
        </Button>
        <Button variant="primary" onClick={() => addColumn(table.id)}>
          <Plus size={14} />
          Coluna
        </Button>
      </footer>
    </div>
  );
}
