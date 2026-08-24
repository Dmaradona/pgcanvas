"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  Cloud,
  CloudCheck,
  Code2,
  FileCode2,
  FileJson,
  FolderOpen,
  FlaskConical,
  LayoutGrid,
  MousePointerClick,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud";
import { validateDiagram } from "@/lib/validate";
import { parseDiagramJson } from "@/lib/library";
import type { EditorMode } from "@/lib/types";
import { cn, downloadText, toIdentifier } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/primitives";
import { ImportDdlModal } from "./ImportDdlModal";
import { LibraryModal } from "./LibraryModal";
import { CloudModal } from "./CloudModal";

function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-ink font-mono text-[11px] font-bold text-white"
      >
        pg
      </span>
      <span className="font-display text-[15px] font-bold tracking-tight">pgcanvas</span>
    </span>
  );
}

export function TopBar() {
  const mode = useStore((state) => state.mode);
  const setMode = useStore((state) => state.setMode);
  const diagram = useStore((state) => state.diagram);
  const panel = useStore((state) => state.panel);
  const setPanel = useStore((state) => state.setPanel);
  const loadDiagram = useStore((state) => state.loadDiagram);

  const [openLibrary, setOpenLibrary] = useState(false);
  const [openDdl, setOpenDdl] = useState(false);
  const [openCloud, setOpenCloud] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cloudInit = useCloud((state) => state.init);
  const cloudUser = useCloud((state) => state.user);
  useEffect(() => {
    cloudInit();
  }, [cloudInit]);

  const issues = useMemo(() => validateDiagram(diagram), [diagram]);
  const errors = issues.filter((issue) => issue.level === "error").length;
  const warnings = issues.length - errors;

  const modes: Array<{ value: EditorMode; label: string; icon: React.ReactNode }> = [
    { value: "modeler", label: "Modelador", icon: <LayoutGrid size={13} /> },
    { value: "simulation", label: "Simulação", icon: <FlaskConical size={13} /> },
    { value: "demo", label: "Demonstração", icon: <MousePointerClick size={13} /> },
  ];

  async function onImportFile(file: File) {
    const parsed = parseDiagramJson(await file.text());
    if (!parsed) {
      setImportError("O arquivo não tem o formato de modelo do pgcanvas.");
      window.setTimeout(() => setImportError(null), 6000);
      return;
    }
    loadDiagram(parsed);
    setImportError(null);
  }

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-3">
      <div className="flex min-w-0 items-center gap-3">
        <Wordmark />
        <span className="h-4 w-px bg-line" />
        <p className="truncate text-[13px] font-medium text-ink-soft">{diagram.name}</p>
      </div>

      <div
        role="tablist"
        aria-label="Modo de trabalho"
        className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
      >
        {modes.map((item) => {
          const active = item.value === mode;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(item.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors",
                active
                  ? item.value === "simulation"
                    ? "bg-dado text-white shadow-sm"
                    : item.value === "demo"
                      ? "bg-violet text-white shadow-sm"
                      : "bg-elephant text-white shadow-sm"
                  : "text-ink-soft hover:bg-surface hover:text-ink",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        {mode === "modeler" ? (
          <>
            <Button
              size="sm"
              variant={panel === "sql" ? "primary" : "subtle"}
              onClick={() => setPanel("sql")}
            >
              <Code2 size={13} />
              DDL
            </Button>
            <Button
              size="sm"
              variant={panel === "issues" ? "primary" : "subtle"}
              onClick={() => setPanel("issues")}
            >
              {errors > 0 ? (
                <CircleAlert size={13} className={panel === "issues" ? "" : "text-alerta"} />
              ) : (
                <ShieldCheck size={13} className={panel === "issues" ? "" : "text-dado"} />
              )}
              {errors > 0 ? `${errors} erro${errors > 1 ? "s" : ""}` : "Validação"}
              {warnings > 0 ? (
                <span
                  className={cn(
                    "ml-0.5 rounded-[3px] px-1 font-mono text-[10px]",
                    panel === "issues" ? "bg-white/20" : "bg-brass-soft text-brass",
                  )}
                >
                  {warnings}
                </span>
              ) : null}
            </Button>
            <span className="mx-0.5 h-5 w-px bg-line" />
          </>
        ) : null}

        <IconButton
          label="Exportar modelo em JSON"
          onClick={() =>
            downloadText(
              `${toIdentifier(diagram.name) || "modelo"}.pgcanvas.json`,
              JSON.stringify(diagram, null, 2),
              "application/json",
            )
          }
        >
          <FileJson size={15} />
        </IconButton>
        <IconButton label="Importar modelo em JSON" onClick={() => fileRef.current?.click()}>
          <Upload size={15} />
        </IconButton>
        <IconButton label="Importar DDL PostgreSQL" onClick={() => setOpenDdl(true)}>
          <FileCode2 size={15} />
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onImportFile(file);
            event.target.value = "";
          }}
        />
        <Button size="sm" variant="subtle" onClick={() => setOpenLibrary(true)}>
          <FolderOpen size={13} />
          Meus modelos
        </Button>
        <Button
          size="sm"
          variant={cloudUser ? "primary" : "ghost"}
          title={
            cloudUser
              ? `Conectado como ${cloudUser.email}`
              : "Contas e sincronização ainda estão a caminho"
          }
          onClick={() => setOpenCloud(true)}
        >
          {cloudUser ? <CloudCheck size={13} /> : <Cloud size={13} />}
          {cloudUser ? (
            <span className="max-w-[120px] truncate">{cloudUser.email.split("@")[0]}</span>
          ) : (
            <>
              Entrar
              <span className="rounded-[3px] bg-violet-soft px-1 font-mono text-[9.5px] font-semibold text-violet">
                em breve
              </span>
            </>
          )}
        </Button>
      </div>

      {importError ? (
        <p className="absolute right-3 top-full z-40 mt-1.5 rounded-md border border-alerta bg-alerta-soft px-3 py-2 text-[12px] text-alerta shadow-sm">
          {importError}
        </p>
      ) : null}

      <ImportDdlModal open={openDdl} onClose={() => setOpenDdl(false)} />
      <LibraryModal open={openLibrary} onClose={() => setOpenLibrary(false)} />
      <CloudModal open={openCloud} onClose={() => setOpenCloud(false)} />

    </header>
  );
}
