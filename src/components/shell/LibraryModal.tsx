"use client";

import { useEffect, useState } from "react";
import { FolderOpen, HardDriveDownload, LayoutTemplate, Plus, Save, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLibrary } from "@/lib/library";
import { TEMPLATES } from "@/lib/samples";
import { cn } from "@/lib/utils";
import { Button, Field, Modal, TextInput } from "@/components/ui/primitives";

function whenText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Biblioteca local: salvar o modelo aberto, retomar um salvo e comecar
 * de novo, em branco ou a partir de um modelo pronto.
 */
export function LibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const diagram = useStore((state) => state.diagram);
  const loadDiagram = useStore((state) => state.loadDiagram);
  const startBlank = useStore((state) => state.startBlank);
  const startTemplate = useStore((state) => state.startTemplate);
  const showWelcome = useStore((state) => state.showWelcome);

  const items = useLibrary((state) => state.items);
  const currentId = useLibrary((state) => state.currentId);
  const writable = useLibrary((state) => state.writable);
  const notice = useLibrary((state) => state.notice);
  const refresh = useLibrary((state) => state.refresh);
  const saveNew = useLibrary((state) => state.saveNew);
  const saveOver = useLibrary((state) => state.saveOver);
  const remove = useLibrary((state) => state.remove);
  const setCurrent = useLibrary((state) => state.setCurrent);
  const clearNotice = useLibrary((state) => state.clearNotice);

  const [name, setName] = useState(diagram.name);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // abrir a janela recarrega a lista e volta o nome para o do modelo atual
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(diagram.name);
      setConfirmId(null);
    }
  }

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const current = items.find((item) => item.id === currentId);

  return (
    <Modal
      open={open}
      width={560}
      title="Meus modelos"
      onClose={() => {
        clearNotice();
        onClose();
      }}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              showWelcome();
              onClose();
            }}
          >
            Tela de início
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <Field label="Salvar o modelo aberto como">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => saveNew({ ...diagram, name }, name)}
            >
              <HardDriveDownload size={14} />
              Salvar como novo
            </Button>
            {current ? (
              <Button variant="subtle" onClick={() => saveOver(current.id, { ...diagram, name })}>
                <Save size={14} />
                Salvar em &quot;{current.name}&quot;
              </Button>
            ) : null}
          </div>
          {!writable ? (
            <p className="mt-2 rounded-md border border-alerta bg-alerta-soft px-3 py-2 text-[11.5px] text-alerta">
              O navegador recusou a gravação. Em aba anônima ou com o armazenamento cheio, use
              exportar JSON para não perder o trabalho.
            </p>
          ) : null}
          {notice ? (
            <p className="mt-2 rounded-md border border-dado/40 bg-dado-soft px-3 py-2 text-[11.5px] text-dado">
              {notice}
            </p>
          ) : null}
        </section>

        <section>
          <p className="field-label">Salvos neste navegador ({items.length})</p>
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[12px] text-ink-faint">
              Nada salvo ainda. O modelo aberto continua voltando sozinho depois do refresh.
            </p>
          ) : (
            <ul className="max-h-[210px] space-y-1 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2",
                    item.id === currentId ? "border-elephant bg-elephant-soft" : "border-line",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">{item.name}</span>
                    <span className="block font-mono text-[10.5px] text-ink-faint">
                      {item.tables} tabelas · {item.relations} FKs · {whenText(item.updatedAt)}
                    </span>
                  </span>

                  {confirmId === item.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          remove(item.id);
                          setConfirmId(null);
                        }}
                      >
                        Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                        Não
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => {
                          loadDiagram(item.diagram);
                          setCurrent(item.id);
                          onClose();
                        }}
                      >
                        <FolderOpen size={13} />
                        Abrir
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remover ${item.name}`}
                        title="Remover deste navegador"
                        onClick={() => setConfirmId(item.id)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className="field-label">Começar de novo</p>
          <p className="mb-2 text-[11.5px] leading-relaxed text-ink-faint">
            Substitui o que está na tela. Salve ou exporte antes se quiser guardar.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                startBlank();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-md border border-dashed border-line px-3 py-2.5 text-left transition-colors hover:border-elephant hover:bg-elephant-soft"
            >
              <Plus size={15} className="shrink-0 text-ink-faint" />
              <span>
                <span className="block text-[13px] font-semibold">Modelo em branco</span>
                <span className="block text-[11.5px] text-ink-faint">Comece do zero</span>
              </span>
            </button>

            {TEMPLATES.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => {
                  startTemplate(template.key);
                  onClose();
                }}
                className="flex w-full items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-left transition-colors hover:border-elephant hover:bg-elephant-soft"
              >
                <LayoutTemplate size={15} className="shrink-0 text-ink-faint" />
                <span>
                  <span className="block text-[13px] font-semibold">{template.label}</span>
                  <span className="block text-[11.5px] text-ink-faint">
                    {template.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
