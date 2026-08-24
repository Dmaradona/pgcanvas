"use client";

import { useMemo, useState } from "react";
import { KeyRound, Plus, Search, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";

export function Sidebar() {
  const diagram = useStore((state) => state.diagram);
  const selection = useStore((state) => state.selection);
  const setSelection = useStore((state) => state.setSelection);
  const addTable = useStore((state) => state.addTable);
  const addColumn = useStore((state) => state.addColumn);
  const [query, setQuery] = useState("");

  const selectedTableId =
    selection.kind === "table" || selection.kind === "column" ? selection.tableId : null;

  const grouped = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = diagram.tables.filter((table) => {
      if (!term) return true;
      return (
        table.name.toLowerCase().includes(term) ||
        table.columns.some((column) => column.name.toLowerCase().includes(term))
      );
    });
    const map = new Map<string, typeof filtered>();
    for (const table of filtered) {
      const list = map.get(table.schema) ?? [];
      list.push(table);
      map.set(table.schema, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [diagram.tables, query]);

  return (
    <aside className="flex h-full w-[228px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-3 py-2.5">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            className="field pl-7 text-[12.5px]"
            placeholder="Buscar tabela ou coluna"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar tabela ou coluna"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {grouped.length === 0 ? (
          <p className="px-2 py-4 text-center text-[12px] text-ink-faint">
            {diagram.tables.length === 0 ? "Nenhuma tabela ainda" : "Nada encontrado"}
          </p>
        ) : null}

        {grouped.map(([schema, tables]) => (
          <section key={schema} className="mb-3">
            <p className="eyebrow px-2 py-1">{schema}</p>
            <ul className="space-y-px">
              {tables.map((table) => {
                const hasPk = table.columns.some((column) => column.isPrimary);
                const active = table.id === selectedTableId;
                return (
                  <li key={table.id}>
                    <div
                      className={cn(
                        "group flex items-center gap-1 rounded-md pr-1 transition-colors",
                        active ? "bg-elephant-soft" : "hover:bg-surface-2",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: "table", tableId: table.id })}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: table.color }}
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                          {table.name}
                        </span>
                        {hasPk ? (
                          <KeyRound size={11} className="shrink-0 text-brass" aria-label="tem PK" />
                        ) : (
                          <TriangleAlert
                            size={11}
                            className="shrink-0 text-alerta"
                            aria-label="sem chave primária"
                          />
                        )}
                        <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                          {table.columns.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        title={`Adicionar coluna em ${table.name}`}
                        aria-label={`Adicionar coluna em ${table.name}`}
                        onClick={() => addColumn(table.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint opacity-0 transition-all hover:bg-surface hover:text-elephant focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="border-t border-line p-2">
        <Button className="w-full" variant="primary" onClick={() => addTable()}>
          <Plus size={14} />
          Nova tabela
        </Button>
      </div>
    </aside>
  );
}
