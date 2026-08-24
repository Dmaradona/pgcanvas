"use client";

import { useRef, useState } from "react";
import { FileUp, TriangleAlert, Wand2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseDdl, type ParsedDdl } from "@/lib/parse-sql";
import { Button, Field, Modal, TextInput } from "@/components/ui/primitives";

const PLACEHOLDER = `CREATE TABLE cliente (
  id_cliente integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome varchar(120) NOT NULL
);

CREATE TABLE pedido (
  id_pedido integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cliente integer NOT NULL REFERENCES cliente (id_cliente) ON DELETE RESTRICT
);`;

export function ImportDdlModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loadDiagram = useStore((state) => state.loadDiagram);
  const setMode = useStore((state) => state.setMode);

  const [sql, setSql] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<ParsedDdl | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setSql("");
    setName("");
    setResult(null);
    setError(null);
  }

  function read(text: string, suggestedName?: string) {
    try {
      const parsed = parseDdl(text, name || suggestedName);
      if (parsed.diagram.tables.length === 0) {
        setResult(null);
        setError("Nenhum CREATE TABLE foi encontrado no script.");
        return;
      }
      setResult(parsed);
      setError(null);
      if (!name && suggestedName) setName(suggestedName);
    } catch {
      setResult(null);
      setError("Não foi possível ler este script. Confira se é DDL PostgreSQL.");
    }
  }

  async function onFile(file: File) {
    const text = await file.text();
    setSql(text);
    read(text, file.name.replace(/\.sql$/i, ""));
  }

  return (
    <Modal
      open={open}
      width={640}
      title="Importar DDL PostgreSQL"
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </Button>
          {result ? (
            <Button
              variant="primary"
              onClick={() => {
                loadDiagram(result.diagram);
                setMode("modeler");
                reset();
                onClose();
              }}
            >
              Abrir no modelador
            </Button>
          ) : (
            <Button variant="primary" disabled={sql.trim().length === 0} onClick={() => read(sql)}>
              <Wand2 size={14} />
              Ler o script
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Cole o script ou abra um arquivo <code className="font-mono">.sql</code>. São lidos{" "}
          <code className="font-mono">CREATE TABLE</code>, chaves primárias, únicas,{" "}
          <code className="font-mono">CHECK</code>, <code className="font-mono">DEFAULT</code>,{" "}
          <code className="font-mono">ALTER TABLE ... ADD CONSTRAINT</code> e{" "}
          <code className="font-mono">COMMENT ON</code>. Abrir substitui o diagrama atual.
        </p>

        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Nome do modelo">
            <TextInput
              value={name}
              placeholder="Modelo importado"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Button variant="subtle" onClick={() => fileRef.current?.click()}>
            <FileUp size={14} />
            Abrir .sql
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".sql,text/plain,application/sql"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
              event.target.value = "";
            }}
          />
        </div>

        <Field label="Script">
          <textarea
            className="field field-mono min-h-[190px] resize-y whitespace-pre"
            spellCheck={false}
            placeholder={PLACEHOLDER}
            value={sql}
            onChange={(event) => {
              setSql(event.target.value);
              setResult(null);
              setError(null);
            }}
          />
        </Field>

        {error ? (
          <p className="rounded-md border border-alerta bg-alerta-soft px-3 py-2 text-[12px] text-alerta">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Tabelas", result.stats.tables],
                ["Colunas", result.stats.columns],
                ["Relacionamentos", result.stats.relations],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-md border border-line px-3 py-2">
                  <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">{label}</p>
                  <p className="font-display text-[19px] font-semibold leading-tight">{value}</p>
                </div>
              ))}
            </div>

            <ul className="max-h-[132px] space-y-1 overflow-y-auto">
              {result.diagram.tables.map((table) => (
                <li
                  key={table.id}
                  className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: table.color }}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                    {table.schema}.{table.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">
                    {table.columns.length} colunas
                  </span>
                </li>
              ))}
            </ul>

            {result.warnings.length > 0 ? (
              <div className="rounded-md border border-brass/40 bg-brass-soft px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-brass">
                  <TriangleAlert size={13} />
                  {result.warnings.length}{" "}
                  {result.warnings.length === 1 ? "aviso" : "avisos"} na leitura
                </p>
                <ul className="mt-1 max-h-[110px] space-y-0.5 overflow-y-auto">
                  {result.warnings.map((warning, index) => (
                    <li key={index} className="text-[11.5px] leading-relaxed text-ink">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
