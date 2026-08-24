"use client";

import { ArrowDownRight, CircleAlert, Eraser, ShieldAlert, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { columnOf, findRow, rowLabel, tableOf, deleteSql } from "@/lib/dataops";
import type { ImpactKind } from "@/lib/dataops";
import { cn } from "@/lib/utils";
import { Button, Chip, Modal } from "@/components/ui/primitives";

const KIND_LABEL: Record<ImpactKind, string> = {
  root: "linha escolhida",
  cascade: "apagadas em cascata",
  "set-null": "FK vira NULL",
  "set-default": "FK volta ao default",
  block: "bloqueado",
};

const KIND_TONE: Record<ImpactKind, "neutral" | "alerta" | "brass" | "violet"> = {
  root: "neutral",
  cascade: "alerta",
  "set-null": "brass",
  "set-default": "violet",
  block: "alerta",
};

/**
 * Confirmacao de exclusao que mostra o efeito antes de aplicar.
 * E aqui que o cascade fica visivel: quantas linhas somem em cada tabela,
 * quais FKs viram NULL e o que o RESTRICT impede.
 */
export function CascadeDialog() {
  const plan = useStore((state) => state.pendingDelete);
  const diagram = useStore((state) => state.diagram);
  const simData = useStore((state) => state.simData);
  const cancelDelete = useStore((state) => state.cancelDelete);
  const confirmDelete = useStore((state) => state.confirmDelete);
  const relaxBlockedRelation = useStore((state) => state.relaxBlockedRelation);

  if (!plan) return null;

  const rootTable = tableOf(diagram, plan.roots[0]?.tableId ?? "");
  const rootRows = plan.roots
    .map((ref) => findRow(simData, ref.tableId, ref.rid))
    .filter((row) => Boolean(row));
  const blocked = plan.blocks.length > 0;

  return (
    <Modal
      open
      width={560}
      title={blocked ? "O banco não deixa apagar" : "Confirmar exclusão"}
      onClose={cancelDelete}
      footer={
        <>
          <Button variant="ghost" onClick={cancelDelete}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={blocked} onClick={confirmDelete}>
            <Trash2 size={14} />
            {blocked
              ? "Bloqueado pela FK"
              : `Apagar ${plan.removedCount} ${plan.removedCount === 1 ? "linha" : "linhas"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="eyebrow">Comando</p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink">
            {rootTable && rootRows.length > 0
              ? deleteSql(
                  rootTable,
                  rootRows.filter((row): row is NonNullable<typeof row> => Boolean(row)),
                )
              : "DELETE"}
          </pre>
          {rootTable && rootRows[0] ? (
            <p className="mt-1 text-[11.5px] text-ink-faint">
              {rootTable.name}: {rowLabel(rootTable, rootRows[0])}
            </p>
          ) : null}
        </div>

        {blocked ? (
          <div className="space-y-2">
            {plan.blocks.map((block) => {
              const table = tableOf(diagram, block.tableId);
              return (
                <div
                  key={block.id}
                  className="rounded-md border border-alerta bg-alerta-soft px-3 py-2.5"
                >
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-alerta">
                    <ShieldAlert size={14} />
                    ON DELETE {block.action} em {table?.name ?? "?"}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink">{block.reason}</p>
                  {block.relationId && block.action !== "SET NULL" ? (
                    <Button
                      size="sm"
                      variant="subtle"
                      className="mt-2"
                      onClick={() => relaxBlockedRelation(block.relationId!)}
                    >
                      <Eraser size={13} />
                      Trocar este relacionamento para CASCADE
                    </Button>
                  ) : null}
                </div>
              );
            })}
            <p className="text-[11.5px] leading-relaxed text-ink-soft">
              É exatamente o que o PostgreSQL faria: com RESTRICT ou NO ACTION, o pai só sai
              depois que os filhos saírem.
            </p>
          </div>
        ) : (
          <div>
            <p className="eyebrow">Efeito em cadeia</p>
            <ul className="mt-1.5 space-y-1">
              {plan.steps.map((step) => {
                const table = tableOf(diagram, step.tableId);
                const column = columnOf(table, step.columnId ?? "");
                const from = tableOf(diagram, step.fromTableId ?? "");
                return (
                  <li
                    key={step.id}
                    style={{ marginLeft: Math.min(step.depth, 4) * 16 }}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2",
                      step.kind === "cascade" || step.kind === "root"
                        ? "border-alerta/30 bg-alerta-soft/50"
                        : "border-line bg-surface-2",
                    )}
                  >
                    {step.depth > 0 ? (
                      <ArrowDownRight size={13} className="shrink-0 text-ink-faint" />
                    ) : (
                      <Trash2 size={13} className="shrink-0 text-alerta" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[12px] font-semibold">
                        {table?.name ?? "?"}
                        {column ? `.${column.name}` : ""}
                      </span>
                      {from && step.depth > 0 ? (
                        <span className="block text-[11px] text-ink-faint">
                          por causa de {from.name}
                        </span>
                      ) : null}
                    </span>
                    <Chip tone={KIND_TONE[step.kind]}>
                      {step.rids.length} · {KIND_LABEL[step.kind]}
                    </Chip>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2.5">
              <CircleAlert size={14} className="mt-px shrink-0 text-ink-faint" />
              <p className="text-[11.5px] leading-relaxed text-ink-soft">
                {plan.removedCount} {plan.removedCount === 1 ? "linha some" : "linhas somem"} no
                total
                {plan.updatedCount > 0
                  ? `, e ${plan.updatedCount} ${plan.updatedCount === 1 ? "linha fica" : "linhas ficam"} com a FK alterada`
                  : ""}
                . Nada disso é desfeito automaticamente, gere os dados de novo para voltar ao
                estado inicial.
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
