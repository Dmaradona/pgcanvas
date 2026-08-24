"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileCode2, FileJson, FolderOpen, LayoutTemplate, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLibrary, parseDiagramJson } from "@/lib/library";
import { TEMPLATES } from "@/lib/samples";
import { Button } from "@/components/ui/primitives";
import { ImportDdlModal } from "./ImportDdlModal";

function whenText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Primeira tela: ninguem cai num modelo que nao pediu. O aluno escolhe
 * comecar em branco, abrir um modelo pronto, trazer um script ou retomar
 * algo que ficou salvo neste navegador.
 */
export function WelcomeScreen() {
  const diagram = useStore((state) => state.diagram);
  const resume = useStore((state) => state.resume);
  const startBlank = useStore((state) => state.startBlank);
  const startTemplate = useStore((state) => state.startTemplate);
  const loadDiagram = useStore((state) => state.loadDiagram);

  const items = useLibrary((state) => state.items);
  const refresh = useLibrary((state) => state.refresh);
  const setCurrent = useLibrary((state) => state.setCurrent);

  const [openDdl, setOpenDdl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onFile(file: File) {
    const parsed = parseDiagramJson(await file.text());
    if (!parsed) {
      setError("O arquivo não tem o formato de modelo do pgcanvas.");
      return;
    }
    loadDiagram(parsed);
  }

  return (
    <div className="h-dvh overflow-y-auto bg-paper">
      <div className="mx-auto w-full max-w-[840px] px-6 py-10">
        <header className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-ink font-mono text-[14px] font-bold text-white"
          >
            pg
          </span>
          <div>
            <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight">
              pgcanvas
            </h1>
            <p className="text-[12.5px] text-ink-soft">
              Modelagem PostgreSQL, DDL e dados de exemplo, tudo no navegador
            </p>
          </div>
        </header>

        {diagram.tables.length > 0 ? (
          <button
            type="button"
            onClick={resume}
            className="mt-7 flex w-full items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-elephant hover:bg-elephant-soft"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold">
                Continuar em &quot;{diagram.name}&quot;
              </span>
              <span className="block text-[11.5px] text-ink-faint">
                {diagram.tables.length} tabelas · {diagram.relations.length} relacionamentos ·
                estava aberto neste navegador
              </span>
            </span>
            <ArrowRight size={16} className="shrink-0 text-elephant" />
          </button>
        ) : null}

        <section className="mt-8">
          <h2 className="eyebrow">Por onde começar</h2>

          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={startBlank}
              className="group flex flex-col rounded-[10px] border-2 border-elephant bg-surface p-4 text-left transition-colors hover:bg-elephant-soft"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-elephant text-white">
                <Plus size={17} />
              </span>
              <span className="mt-3 block text-[14.5px] font-semibold">Modelo em branco</span>
              <span className="mt-1 block text-[12px] leading-relaxed text-ink-soft">
                Canvas vazio. Crie a primeira tabela e vá ligando as chaves.
              </span>
            </button>

            {TEMPLATES.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => startTemplate(template.key)}
                className="group flex flex-col rounded-[10px] border border-line bg-surface p-4 text-left transition-colors hover:border-elephant hover:bg-elephant-soft"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-3 text-ink-soft transition-colors group-hover:bg-elephant group-hover:text-white">
                  <LayoutTemplate size={16} />
                </span>
                <span className="mt-3 block text-[14.5px] font-semibold">
                  Modelo pronto: {template.label}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-soft">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="eyebrow">Trazer o que você já tem</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="subtle" onClick={() => setOpenDdl(true)}>
              <FileCode2 size={15} />
              Importar DDL PostgreSQL
            </Button>
            <Button variant="subtle" onClick={() => fileRef.current?.click()}>
              <FileJson size={15} />
              Abrir JSON do pgcanvas
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
                event.target.value = "";
              }}
            />
          </div>
          {error ? (
            <p className="mt-2 rounded-md border border-alerta bg-alerta-soft px-3 py-2 text-[12px] text-alerta">
              {error}
            </p>
          ) : null}
        </section>

        {items.length > 0 ? (
          <section className="mt-6">
            <h2 className="eyebrow">Salvos neste navegador</h2>
            <ul className="mt-2 space-y-1">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{item.name}</span>
                    <span className="block font-mono text-[10.5px] text-ink-faint">
                      {item.tables} tabelas · {item.relations} relacionamentos ·{" "}
                      {whenText(item.updatedAt)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => {
                      loadDiagram(item.diagram);
                      setCurrent(item.id);
                    }}
                  >
                    <FolderOpen size={13} />
                    Abrir
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-8 border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-faint">
          O trabalho fica guardado neste navegador, sem conta e sem servidor: o modelo aberto, os
          modelos que você salvar e até os dados preenchidos à mão voltam depois de fechar a aba.
          Para levar para outra máquina, exporte JSON, DDL, INSERT ou CSV. Login com sincronização
          entre dispositivos está a caminho.
        </p>
      </div>

      <ImportDdlModal open={openDdl} onClose={() => setOpenDdl(false)} />
    </div>
  );
}
