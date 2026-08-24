"use client";

import { ArrowRight, Split, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Cardinality, FkAction, Relation } from "@/lib/types";
import {
  Button,
  Field,
  IconButton,
  SelectInput,
  Segmented,
  TextInput,
  Toggle,
} from "@/components/ui/primitives";

const ACTIONS: FkAction[] = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];

const CARDINALITY_OPTIONS: Array<{ value: Cardinality; label: string }> = [
  { value: "1:1", label: "1:1" },
  { value: "1:N", label: "1:N" },
  { value: "N:N", label: "N:N" },
];

const CARDINALITY_HELP: Record<Cardinality, string> = {
  "1:1": "Cada linha do pai aparece no máximo uma vez no filho. Exige UNIQUE na FK.",
  "1:N": "Uma linha do pai aparece em várias linhas do filho. O caso mais comum.",
  "N:N": "Não existe direto no banco relacional. Converta em tabela associativa.",
};

export function RelationEditor({ relation }: { relation: Relation }) {
  const diagram = useStore((state) => state.diagram);
  const updateRelation = useStore((state) => state.updateRelation);
  const removeRelation = useStore((state) => state.removeRelation);
  const convertToAssociative = useStore((state) => state.convertToAssociative);
  const setSelection = useStore((state) => state.setSelection);

  const parent = diagram.tables.find((table) => table.id === relation.sourceTableId);
  const child = diagram.tables.find((table) => table.id === relation.targetTableId);
  const parentColumn = parent?.columns.find((column) => column.id === relation.sourceColumnId);
  const childColumn = child?.columns.find((column) => column.id === relation.targetColumnId);

  if (!parent || !child || !parentColumn || !childColumn) {
    return (
      <div className="px-4 py-4 text-[12.5px] text-ink-faint">
        Este relacionamento aponta para algo que não existe mais.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">Relacionamento</p>
          <h2 className="truncate font-mono text-[13.5px] font-semibold">
            {relation.name || `fk_${child.name}_${parent.name}`}
          </h2>
        </div>
        <IconButton
          label="Remover relacionamento"
          tone="danger"
          onClick={() => removeRelation(relation.id)}
        >
          <Trash2 size={14} />
        </IconButton>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[12px]">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => setSelection({ kind: "column", tableId: parent.id, columnId: parentColumn.id })}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Referenciada
              </span>
              <span className="block truncate font-mono text-ink underline decoration-line underline-offset-2">
                {parent.name}.{parentColumn.name}
              </span>
            </button>
            <ArrowRight size={14} className="shrink-0 text-ink-faint" />
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => setSelection({ kind: "column", tableId: child.id, columnId: childColumn.id })}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Recebe a FK
              </span>
              <span className="block truncate font-mono text-ink underline decoration-line underline-offset-2">
                {child.name}.{childColumn.name}
              </span>
            </button>
          </div>
        </div>

        <Field label="Nome da constraint">
          <TextInput
            mono
            value={relation.name}
            placeholder={`fk_${child.name}_${parent.name}`}
            onChange={(event) => updateRelation(relation.id, { name: event.target.value })}
          />
        </Field>

        <div>
          <span className="field-label">Cardinalidade</span>
          <Segmented
            className="w-full"
            value={relation.cardinality}
            options={CARDINALITY_OPTIONS}
            onChange={(value) => updateRelation(relation.id, { cardinality: value })}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            {CARDINALITY_HELP[relation.cardinality]}
          </p>
        </div>

        {relation.cardinality === "N:N" ? (
          <Button
            variant="primary"
            className="w-full"
            onClick={() => convertToAssociative(relation.id)}
          >
            <Split size={14} />
            Criar tabela associativa
          </Button>
        ) : null}

        <div className="rounded-md border border-line p-1">
          <Toggle
            label="Relacionamento identificador"
            description="A FK também compõe a PK da tabela filha"
            checked={relation.identifying}
            onChange={(value) => updateRelation(relation.id, { identifying: value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="ON DELETE">
            <SelectInput
              className="field-mono"
              value={relation.onDelete}
              onChange={(event) =>
                updateRelation(relation.id, { onDelete: event.target.value as FkAction })
              }
            >
              {ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="ON UPDATE">
            <SelectInput
              className="field-mono"
              value={relation.onUpdate}
              onChange={(event) =>
                updateRelation(relation.id, { onUpdate: event.target.value as FkAction })
              }
            >
              {ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
          A linha cheia no canvas marca relacionamento identificador. A linha tracejada marca
          relacionamento comum.
        </p>
      </div>
    </div>
  );
}
