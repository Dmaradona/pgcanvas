"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type NodeTypes,
  type OnNodesChange,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowUpRight,
  Database,
  Eraser,
  Frame,
  LayoutGrid,
  Play,
  Plus,
  Rows3,
  Table2,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  findRow,
  formatValue,
  relatedRows,
  rowLabel,
  rowsOf,
  type OpLog,
} from "@/lib/dataops";
import { ridOf, type FkAction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Chip, EmptyState, Segmented } from "@/components/ui/primitives";
import { DataGrid } from "@/components/simulation/DataGrid";
import { DataCardNode, type DataNodeType } from "./DataCardNode";

/** quantas linhas cabem no card antes de virar "mais N linhas" */
const ROWS_IN_CARD = 6;

const ACTION_TONE: Record<FkAction, string> = {
  CASCADE: "border-alerta/40 bg-alerta-soft text-alerta",
  RESTRICT: "border-line bg-surface text-ink-soft",
  "NO ACTION": "border-line bg-surface text-ink-soft",
  "SET NULL": "border-brass/40 bg-brass-soft text-brass",
  "SET DEFAULT": "border-violet/40 bg-violet-soft text-violet",
};

type DataEdgeData = { action: FkAction; cardinality: string; active: boolean };
type DataEdgeType = Edge<DataEdgeData, "data">;

function DataEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<DataEdgeType>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: 26,
  });
  const active = data?.active ?? false;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: active ? "var(--color-dado)" : "var(--color-line-strong)",
          strokeWidth: active ? 2.4 : 1.6,
        }}
      />
      <EdgeLabelRenderer>
        <span
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          className={cn(
            "absolute rounded-[4px] border px-1.5 py-px font-mono text-[9.5px] font-semibold leading-[15px]",
            ACTION_TONE[data?.action ?? "RESTRICT"],
          )}
        >
          ON DELETE {data?.action ?? "RESTRICT"}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes: NodeTypes = { dataCard: DataCardNode };
const edgeTypes: EdgeTypes = { data: DataEdgeComponent };

function DemoCanvasInner() {
  const diagram = useStore((state) => state.diagram);
  const simData = useStore((state) => state.simData);
  const focusRow = useStore((state) => state.focusRow);
  const setFocusRow = useStore((state) => state.setFocusRow);
  const pendingDelete = useStore((state) => state.pendingDelete);
  const flash = useStore((state) => state.flash);
  const { fitView } = useReactFlow();

  // os cards de dados sao maiores que os do modelador, entao a posicao do
  // diagrama serve de ponto de partida e e afastada um pouco. O que o usuario
  // arrastar fica em `moved` e passa por cima do calculo.
  const [moved, setMoved] = useState<Record<string, XYPosition>>({});
  const positions = useMemo(() => {
    const map: Record<string, XYPosition> = {};
    for (const table of diagram.tables) {
      map[table.id] = moved[table.id] ?? {
        x: Math.round(table.position.x * 1.55),
        y: Math.round(table.position.y * 1.5),
      };
    }
    return map;
  }, [diagram.tables, moved]);

  const related = useMemo(
    () => (focusRow ? relatedRows(diagram, simData, focusRow) : null),
    [diagram, simData, focusRow],
  );

  const nodes = useMemo<DataNodeType[]>(() => {
    return diagram.tables.map((table) => {
      const rows = rowsOf(simData, table.id);
      const highlight = related?.byTable[table.id] ?? [];
      // as linhas ficam sempre na mesma ordem: mexer nelas ao selecionar
      // faria o card dancar embaixo do cursor
      const visible = rows.slice(0, ROWS_IN_CARD);
      const shown = new Set(visible.map(ridOf));

      return {
        id: table.id,
        type: "dataCard" as const,
        position: positions[table.id] ?? { x: 0, y: 0 },
        data: {
          table,
          rows: visible,
          total: rows.length,
          hiddenRelated: highlight.filter((rid) => !shown.has(rid)).length,
          focusRid: focusRow?.tableId === table.id ? focusRow.rid : null,
          relatedRids: highlight,
          flashRids: flash,
          doomedRids: pendingDelete?.removed[table.id] ?? [],
          nullifiedRids:
            pendingDelete?.updates
              .filter((item) => item.tableId === table.id)
              .map((item) => item.rid) ?? [],
        },
      };
    });
  }, [diagram.tables, simData, positions, focusRow, related, flash, pendingDelete]);

  const edges = useMemo<DataEdgeType[]>(() => {
    return diagram.relations.map((relation) => {
      const parent = positions[relation.sourceTableId];
      const child = positions[relation.targetTableId];
      const delta = (child?.x ?? 0) - (parent?.x ?? 0);
      const side = delta > 120 ? { from: "r", to: "l" } : delta < -120 ? { from: "l", to: "r" } : { from: "l", to: "l" };
      const active =
        focusRow?.tableId === relation.sourceTableId ||
        focusRow?.tableId === relation.targetTableId;
      return {
        id: relation.id,
        type: "data" as const,
        source: relation.sourceTableId,
        target: relation.targetTableId,
        sourceHandle: `out-${side.from}`,
        targetHandle: `in-${side.to}`,
        data: { action: relation.onDelete, cardinality: relation.cardinality, active },
      };
    });
  }, [diagram.relations, positions, focusRow]);

  const onNodesChange = useCallback<OnNodesChange<DataNodeType>>((changes) => {
    setMoved((current) => {
      let next = current;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          next = { ...next, [change.id]: change.position };
        }
      }
      return next;
    });
  }, []);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onPaneClick={() => setFocusRow(null)}
        nodesConnectable={false}
        minZoom={0.2}
        maxZoom={1.6}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="bg-paper"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.2}
          color="var(--color-line-strong)"
        />
        <Controls
          position="bottom-right"
          showInteractive={false}
          className="!bottom-4 !right-4 overflow-hidden rounded-lg border border-line shadow-sm"
        />
      </ReactFlow>

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-1.5">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1.5 shadow-sm">
          <span className="font-mono text-[10.5px] text-ink-faint">
            clique numa linha para acender as ligações
          </span>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <button
            type="button"
            title="Enquadrar"
            aria-label="Enquadrar"
            onClick={() => fitView({ duration: 300 })}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Frame size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DemoCanvas() {
  return (
    <ReactFlowProvider>
      <DemoCanvasInner />
    </ReactFlowProvider>
  );
}

/* ------------------------------------------------------------------ */

function LogEntry({ log }: { log: OpLog }) {
  const tone =
    log.tone === "danger"
      ? "border-alerta/40 bg-alerta-soft"
      : log.tone === "warn"
        ? "border-brass/40 bg-brass-soft"
        : log.tone === "ok"
          ? "border-dado/30 bg-dado-soft"
          : "border-line bg-surface-2";
  return (
    <li className={cn("rounded-md border px-3 py-2", tone)}>
      <p className="text-[11.5px] font-semibold leading-snug text-ink">{log.title}</p>
      {log.detail.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {log.detail.map((line, index) => (
            <li key={index} className="text-[11px] leading-relaxed text-ink-soft">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {log.sql ? (
        <pre className="mt-1.5 overflow-x-auto rounded border border-line/70 bg-surface px-2 py-1 font-mono text-[10px] leading-relaxed text-ink-soft">
          {log.sql}
        </pre>
      ) : null}
    </li>
  );
}

function RowPanel() {
  const diagram = useStore((state) => state.diagram);
  const simData = useStore((state) => state.simData);
  const focusRow = useStore((state) => state.focusRow);
  const setFocusRow = useStore((state) => state.setFocusRow);
  const requestDelete = useStore((state) => state.requestDelete);

  const detail = useMemo(() => {
    if (!focusRow) return null;
    const table = diagram.tables.find((item) => item.id === focusRow.tableId);
    const row = findRow(simData, focusRow.tableId, focusRow.rid);
    if (!table || !row) return null;
    return { table, row, related: relatedRows(diagram, simData, focusRow) };
  }, [diagram, simData, focusRow]);

  if (!detail) {
    return (
      <div className="space-y-3 px-4 py-4">
        <p className="eyebrow">Linha</p>
        <p className="text-[12px] leading-relaxed text-ink-faint">
          Clique em uma linha de qualquer card para ver os valores, quem ela referencia e quem
          depende dela.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <p className="eyebrow">{detail.table.name}</p>
        <p className="mt-0.5 break-words font-mono text-[13px] font-semibold">
          {rowLabel(detail.table, detail.row)}
        </p>
      </div>

      <dl className="overflow-hidden rounded-md border border-line">
        {detail.table.columns.map((column) => (
          <div
            key={column.id}
            className="flex items-start gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0"
          >
            <dt className="w-[42%] shrink-0 truncate font-mono text-[10.5px] text-ink-faint">
              {column.name}
            </dt>
            <dd className="min-w-0 flex-1 break-words font-mono text-[11px] text-ink">
              {formatValue(detail.row[column.id] ?? null)}
            </dd>
          </div>
        ))}
      </dl>

      {detail.related.parents.length > 0 ? (
        <div>
          <p className="field-label">Referencia</p>
          <ul className="space-y-1">
            {detail.related.parents.map((item) => {
              const parent = diagram.tables.find((table) => table.id === item.tableId);
              const parentRow = item.rid ? findRow(simData, item.tableId, item.rid) : undefined;
              return (
                <li key={item.relation.id}>
                  <button
                    type="button"
                    disabled={!item.rid}
                    onClick={() =>
                      item.rid && setFocusRow({ tableId: item.tableId, rid: item.rid })
                    }
                    className="flex w-full items-center gap-2 rounded-md border border-line px-3 py-2.5 text-left transition-colors hover:border-elephant hover:bg-elephant-soft disabled:opacity-50"
                  >
                    <ArrowUpRight size={13} className="shrink-0 text-elephant" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11.5px]">{parent?.name}</span>
                      <span className="block truncate text-[10.5px] text-ink-faint">
                        {parent && parentRow ? rowLabel(parent, parentRow) : "sem pai"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {detail.related.children.length > 0 ? (
        <div>
          <p className="field-label">Dependem dela</p>
          <ul className="space-y-1">
            {detail.related.children.map((item) => {
              const child = diagram.tables.find((table) => table.id === item.tableId);
              return (
                <li
                  key={item.relation.id}
                  className="flex items-center gap-2 rounded-md border border-line px-3 py-2.5"
                >
                  <Database size={13} className="shrink-0 text-dado" />
                  <span className="min-w-0 flex-1 font-mono text-[11.5px]">{child?.name}</span>
                  <Chip tone={item.rids.length > 0 ? "dado" : "neutral"}>
                    {item.rids.length}
                  </Chip>
                  <Chip
                    tone={
                      item.relation.onDelete === "CASCADE"
                        ? "alerta"
                        : item.relation.onDelete === "SET NULL"
                          ? "brass"
                          : "neutral"
                    }
                  >
                    {item.relation.onDelete}
                  </Chip>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <Button
        variant="danger"
        className="w-full"
        onClick={() => focusRow && requestDelete([focusRow])}
      >
        <Trash2 size={14} />
        Apagar e ver o efeito
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function DemoView() {
  const diagram = useStore((state) => state.diagram);
  const simData = useStore((state) => state.simData);
  const demoView = useStore((state) => state.demoView);
  const setDemoView = useStore((state) => state.setDemoView);
  const demoRows = useStore((state) => state.demoRowsPerTable);
  const setDemoRows = useStore((state) => state.setDemoRows);
  const seedDemo = useStore((state) => state.seedDemo);
  const ensureDemoData = useStore((state) => state.ensureDemoData);
  const simTableId = useStore((state) => state.simTableId);
  const setSimTable = useStore((state) => state.setSimTable);
  const focusRow = useStore((state) => state.focusRow);
  const setFocusRow = useStore((state) => state.setFocusRow);
  const insertRow = useStore((state) => state.insertRow);
  const requestDelete = useStore((state) => state.requestDelete);
  const opLog = useStore((state) => state.opLog);
  const clearLog = useStore((state) => state.clearLog);
  const flash = useStore((state) => state.flash);
  const dataStored = useStore((state) => state.dataStored);

  const [notice, setNotice] = useState<string | null>(null);

  // entrar na aba com o modelo vazio de dados ja monta o exemplo
  useEffect(() => {
    ensureDemoData();
  }, [ensureDemoData]);

  const activeTable =
    diagram.tables.find((table) => table.id === simTableId) ?? diagram.tables[0] ?? null;
  const rows = activeTable ? rowsOf(simData, activeTable.id) : [];

  const relatedInTable = useMemo(() => {
    if (!focusRow || !activeTable || focusRow.tableId === activeTable.id) return [];
    return relatedRows(diagram, simData, focusRow).byTable[activeTable.id] ?? [];
  }, [diagram, simData, focusRow, activeTable]);

  if (diagram.tables.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          title="O modelo ainda não tem tabelas"
          description="Crie tabelas e relacionamentos no modelador. A demonstração preenche o modelo com linhas de exemplo para você mexer nos dados."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[252px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="space-y-3 border-b border-line px-3 py-3">
          <div>
            <span className="field-label">Linhas por tabela</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={20}
                value={demoRows}
                aria-label="Linhas por tabela na demonstração"
                onChange={(event) => setDemoRows(Number(event.target.value))}
                className="field w-[70px] font-mono"
              />
              <Button variant="dado" className="flex-1" onClick={() => seedDemo()}>
                <Play size={14} />
                Recriar
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
              Poucas linhas, sem nulos e com todas as FKs apontando para linhas que existem.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <p className="eyebrow px-2 py-1">Tabelas</p>
          <ul className="space-y-px">
            {diagram.tables.map((table) => {
              const active = table.id === activeTable?.id;
              const count = rowsOf(simData, table.id).length;
              return (
                <li key={table.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-2",
                      active ? "bg-dado-soft" : "hover:bg-surface-2",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSimTable(table.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: table.color }}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                        {table.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                        {count}
                      </span>
                    </button>
                    <button
                      type="button"
                      title={`Inserir linha em ${table.name}`}
                      aria-label={`Inserir linha em ${table.name}`}
                      onClick={() => setNotice(insertRow(table.id))}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-dado-soft hover:text-dado"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {!dataStored ? (
          <p className="border-t border-line px-3 py-2 text-[11px] leading-relaxed text-brass">
            Volume grande demais para o navegador guardar. O modelo continua salvo, mas estes
            dados somem ao fechar a aba: exporte os INSERTs antes.
          </p>
        ) : null}
        <div className="space-y-1.5 border-t border-line px-3 py-3">
          <p className="eyebrow">Legenda do ON DELETE</p>
          <p className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <Chip tone="alerta">CASCADE</Chip> apaga os filhos junto
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <Chip tone="brass">SET NULL</Chip> zera a FK do filho
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <Chip>RESTRICT</Chip> impede apagar o pai
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
          <Segmented
            accent="dado"
            value={demoView}
            onChange={setDemoView}
            options={[
              { value: "canvas", label: "Canvas de dados", icon: <LayoutGrid size={13} /> },
              { value: "grid", label: "Tabela", icon: <Rows3 size={13} /> },
            ]}
          />
          <div className="flex items-center gap-2">
            {demoView === "grid" && activeTable ? (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-faint">
                <Table2 size={12} />
                {activeTable.name}
              </span>
            ) : null}
            <Button size="sm" variant="subtle" onClick={() => seedDemo()}>
              <Eraser size={13} />
              Restaurar exemplo
            </Button>
          </div>
        </header>

        {notice ? (
          <div className="border-b border-alerta bg-alerta-soft px-4 py-2 text-[11.5px] text-alerta">
            {notice}
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {demoView === "canvas" ? (
            <DemoCanvas />
          ) : activeTable ? (
            <DataGrid
              table={activeTable}
              rows={rows}
              editable
              focusRid={focusRow?.tableId === activeTable.id ? focusRow.rid : null}
              relatedRids={relatedInTable}
              flashRids={flash}
              onFocusRow={(rid) =>
                setFocusRow(rid === null ? null : { tableId: activeTable.id, rid })
              }
              onInsertRow={() => setNotice(insertRow(activeTable.id))}
              onDeleteRow={(rid) => requestDelete([{ tableId: activeTable.id, rid }])}
            />
          ) : null}
        </div>
      </div>

      <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-surface">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RowPanel />
        </div>
        <div className="flex max-h-[46%] min-h-0 flex-col border-t border-line">
          <header className="flex items-center justify-between px-4 py-2">
            <p className="eyebrow">O que aconteceu</p>
            {opLog.length > 0 ? (
              <button
                type="button"
                onClick={clearLog}
                className="rounded px-1.5 py-1 text-[11px] text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
              >
                limpar
              </button>
            ) : null}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {opLog.length === 0 ? (
              <p className="text-[11.5px] leading-relaxed text-ink-faint">
                Cada inclusão, edição e exclusão aparece aqui com o SQL equivalente.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {opLog.map((log) => (
                  <LogEntry key={log.id} log={log} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
