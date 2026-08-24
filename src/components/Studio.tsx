"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { persistData, persistDiagram } from "@/lib/library";
import { TopBar } from "@/components/shell/TopBar";
import { Sidebar } from "@/components/shell/Sidebar";
import { BottomPanel } from "@/components/shell/BottomPanel";
import { WelcomeScreen } from "@/components/shell/WelcomeScreen";
import { Inspector } from "@/components/inspector/Inspector";
import { ModelerCanvas } from "@/components/canvas/ModelerCanvas";
import { SimulationView } from "@/components/simulation/SimulationView";
import { DemoView } from "@/components/demo/DemoView";
import { CascadeDialog } from "@/components/demo/CascadeDialog";

export function Studio() {
  const ready = useStore((state) => state.hydrated);
  const welcome = useStore((state) => state.welcome);
  const hydrate = useStore((state) => state.hydrate);
  const diagram = useStore((state) => state.diagram);
  const simData = useStore((state) => state.simData);
  const setDataStored = useStore((state) => state.setDataStored);
  const mode = useStore((state) => state.mode);
  const selection = useStore((state) => state.selection);
  const flash = useStore((state) => state.flash);
  const clearFlash = useStore((state) => state.clearFlash);
  const removeTable = useStore((state) => state.removeTable);
  const removeRelation = useStore((state) => state.removeRelation);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // o modelo aberto volta igual depois de um F5
  useEffect(() => {
    if (!ready || welcome) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => persistDiagram(diagram), 400);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [diagram, ready, welcome]);

  // os dados preenchidos também, enquanto couberem no navegador
  useEffect(() => {
    if (!ready || welcome) return;
    const handle = window.setTimeout(() => setDataStored(persistData(simData)), 700);
    return () => window.clearTimeout(handle);
  }, [simData, ready, welcome, setDataStored]);

  useEffect(() => {
    if (flash.length === 0) return;
    const handle = window.setTimeout(clearFlash, 1500);
    return () => window.clearTimeout(handle);
  }, [flash, clearFlash]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (typing) return;
      // apagar tabela e relacionamento so faz sentido no modelador
      if (mode !== "modeler") return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection.kind === "table") {
          event.preventDefault();
          removeTable(selection.tableId);
        } else if (selection.kind === "relation") {
          event.preventDefault();
          removeRelation(selection.relationId);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, removeTable, removeRelation, undo, redo, mode]);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="font-mono text-[12px] text-ink-faint">carregando modelo</p>
      </div>
    );
  }

  if (welcome) return <WelcomeScreen />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar />
      {mode === "modeler" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1">
              <ModelerCanvas />
            </main>
            <aside className="w-[300px] shrink-0 border-l border-line bg-surface">
              <Inspector />
            </aside>
          </div>
          <BottomPanel />
        </div>
      ) : mode === "simulation" ? (
        <main className="min-h-0 flex-1">
          <SimulationView />
        </main>
      ) : (
        <main className="min-h-0 flex-1">
          <DemoView />
        </main>
      )}

      <CascadeDialog />
    </div>
  );
}
