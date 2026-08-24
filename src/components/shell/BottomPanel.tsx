"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, TriangleAlert, X, CircleCheck, CircleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { generateSql } from "@/lib/sql";
import { validateDiagram } from "@/lib/validate";
import { copyText, downloadText, toIdentifier } from "@/lib/utils";
import { Button, IconButton, Toggle } from "@/components/ui/primitives";
import { SqlCode } from "./SqlCode";

function SqlTab() {
  const diagram = useStore((state) => state.diagram);
  const options = useStore((state) => state.sqlOptions);
  const setSqlOptions = useStore((state) => state.setSqlOptions);
  const [copied, setCopied] = useState(false);

  const sql = useMemo(() => generateSql(diagram, options), [diagram, options]);

  return (
    <div className="flex h-full">
      <div className="w-[210px] shrink-0 space-y-1 overflow-y-auto border-r border-line p-2">
        <Toggle
          label="IF NOT EXISTS"
          checked={options.ifNotExists}
          onChange={(value) => setSqlOptions({ ifNotExists: value })}
        />
        <Toggle
          label="Incluir DROP"
          checked={options.includeDrop}
          onChange={(value) => setSqlOptions({ includeDrop: value })}
        />
        <Toggle
          label="Índices nas FKs"
          checked={options.includeIndexes}
          onChange={(value) => setSqlOptions({ includeIndexes: value })}
        />
        <Toggle
          label="Comentários"
          checked={options.includeComments}
          onChange={(value) => setSqlOptions({ includeComments: value })}
        />
        <div className="flex flex-col gap-1.5 pt-2">
          <Button
            size="sm"
            variant={copied ? "primary" : "subtle"}
            onClick={async () => {
              const ok = await copyText(sql);
              setCopied(ok);
              window.setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copiado" : "Copiar DDL"}
          </Button>
          <Button
            size="sm"
            variant="subtle"
            onClick={() =>
              downloadText(`${toIdentifier(diagram.name) || "modelo"}.sql`, sql, "application/sql")
            }
          >
            <Download size={13} />
            Baixar .sql
          </Button>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <SqlCode code={sql} />
      </div>
    </div>
  );
}

function IssuesTab() {
  const diagram = useStore((state) => state.diagram);
  const setSelection = useStore((state) => state.setSelection);
  const issues = useMemo(() => validateDiagram(diagram), [diagram]);

  if (issues.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
        <CircleCheck size={22} className="text-dado" />
        <p className="text-[13px] font-semibold">Modelo consistente</p>
        <p className="max-w-[46ch] text-[12px] text-ink-faint">
          Nenhum problema encontrado nas chaves, tipos e restrições declaradas.
        </p>
      </div>
    );
  }

  return (
    <ul className="h-full divide-y divide-line overflow-y-auto">
      {issues.map((issue, index) => (
        <li key={index}>
          <button
            type="button"
            onClick={() => {
              if (issue.relationId) {
                setSelection({ kind: "relation", relationId: issue.relationId });
              } else if (issue.tableId && issue.columnId) {
                setSelection({
                  kind: "column",
                  tableId: issue.tableId,
                  columnId: issue.columnId,
                });
              } else if (issue.tableId) {
                setSelection({ kind: "table", tableId: issue.tableId });
              }
            }}
            className="flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-surface-2"
          >
            {issue.level === "error" ? (
              <CircleAlert size={14} className="mt-px shrink-0 text-alerta" />
            ) : (
              <TriangleAlert size={14} className="mt-px shrink-0 text-brass" />
            )}
            <span className="text-[12.5px] leading-relaxed">{issue.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function BottomPanel() {
  const panel = useStore((state) => state.panel);
  const setPanel = useStore((state) => state.setPanel);

  if (!panel) return null;

  return (
    <section className="flex h-[290px] shrink-0 flex-col border-t border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <div className="flex items-center gap-3">
          <p className="eyebrow">{panel === "sql" ? "DDL PostgreSQL" : "Validação do modelo"}</p>
        </div>
        <IconButton label="Fechar painel" onClick={() => setPanel(panel)}>
          <X size={14} />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1">{panel === "sql" ? <SqlTab /> : <IssuesTab />}</div>
    </section>
  );
}
