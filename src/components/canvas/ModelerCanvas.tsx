"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeTypes,
  type NodeTypes,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Frame, Plus, Redo2, Undo2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { TableNode, columnFromHandle, handleId, type TableNodeType } from "./TableNode";
import { CrowFootDefs, RelationEdge, type RelationEdgeType } from "./RelationEdge";
import { Button, IconButton } from "@/components/ui/primitives";
import { TEMPLATES } from "@/lib/samples";

const nodeTypes: NodeTypes = { table: TableNode };
const edgeTypes: EdgeTypes = { relation: RelationEdge };

function CanvasInner() {
  const diagram = useStore((state) => state.diagram);
  const selection = useStore((state) => state.selection);
  const setSelection = useStore((state) => state.setSelection);
  const moveTable = useStore((state) => state.moveTable);
  const pushHistory = useStore((state) => state.pushHistory);
  const addRelation = useStore((state) => state.addRelation);
  const addTable = useStore((state) => state.addTable);
  const loadTemplate = useStore((state) => state.loadTemplate);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  const canUndo = useStore((state) => state.past.length > 0);
  const canRedo = useStore((state) => state.future.length > 0);

  const { screenToFlowPosition, fitView, setCenter, getZoom } = useReactFlow();

  // tabela recem criada pode nascer fora da area visivel, entao levamos a
  // camera ate ela em vez de deixar o usuario procurar
  const knownTables = useRef<string[] | null>(null);
  useEffect(() => {
    const ids = diagram.tables.map((table) => table.id);
    const previous = knownTables.current;
    knownTables.current = ids;
    if (previous === null) return;
    const created = ids.find((id) => !previous.includes(id));
    if (!created) return;
    const table = diagram.tables.find((item) => item.id === created);
    if (!table) return;
    setCenter(table.position.x + 134, table.position.y + 110, {
      zoom: getZoom(),
      duration: 320,
    });
  }, [diagram.tables, setCenter, getZoom]);

  const selectedTableId =
    selection.kind === "table" || selection.kind === "column" ? selection.tableId : null;
  const selectedColumnId = selection.kind === "column" ? selection.columnId : null;
  const selectedRelationId = selection.kind === "relation" ? selection.relationId : null;

  // os nos sao derivados do store, entao guardamos as medidas do React Flow
  // aqui, senao o minimapa nao sabe o tamanho de cada tabela
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});

  const nodes = useMemo<TableNodeType[]>(
    () =>
      diagram.tables.map((table) => ({
        id: table.id,
        type: "table" as const,
        position: table.position,
        selected: table.id === selectedTableId,
        measured: measured[table.id],
        data: {
          table,
          selectedColumnId: table.id === selectedTableId ? selectedColumnId : null,
          highlighted: false,
        },
      })),
    [diagram.tables, selectedTableId, selectedColumnId, measured],
  );

  const edges = useMemo<RelationEdgeType[]>(() => {
    const byId = new Map(diagram.tables.map((table) => [table.id, table]));

    /** escolhe de que lado a linha sai e entra, para nao contornar as tabelas */
    function sides(sourceId: string, targetId: string): { from: "l" | "r"; to: "l" | "r" } {
      const parent = byId.get(sourceId);
      const child = byId.get(targetId);
      if (!parent || !child) return { from: "r", to: "l" };
      const delta = child.position.x - parent.position.x;
      if (delta > 120) return { from: "r", to: "l" };
      if (delta < -120) return { from: "l", to: "r" };
      // tabelas praticamente alinhadas na vertical: contorna pela esquerda
      return { from: "l", to: "l" };
    }

    return diagram.relations.map((relation) => {
        const active = relation.id === selectedRelationId;
        const suffix = active ? "-on" : "";
        const childIsMany = relation.cardinality !== "1:1";
        const side = sides(relation.sourceTableId, relation.targetTableId);
        return {
          id: relation.id,
          type: "relation" as const,
          source: relation.sourceTableId,
          target: relation.targetTableId,
          sourceHandle: handleId(relation.sourceColumnId, side.from),
          targetHandle: handleId(relation.targetColumnId, side.to),
          selected: active,
          // o React Flow ja embrulha o valor em url(#...), entao passamos so o id
          markerStart: `pgc-one-start${suffix}`,
          markerEnd: childIsMany ? `pgc-crow-end${suffix}` : `pgc-one-end${suffix}`,
          data: {
            cardinality: relation.cardinality,
            identifying: relation.identifying,
            label: relation.name,
          },
        };
      });
  }, [diagram.relations, diagram.tables, selectedRelationId]);

  const onNodesChange = useCallback<OnNodesChange<TableNodeType>>(
    (changes) => {
      let sizes: Record<string, { width: number; height: number }> | null = null;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          moveTable(change.id, change.position);
        } else if (change.type === "dimensions" && change.dimensions) {
          sizes = { ...(sizes ?? {}), [change.id]: change.dimensions };
        }
      }
      if (sizes) {
        const next = sizes;
        setMeasured((current) => ({ ...current, ...next }));
      }
    },
    [moveTable],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceColumnId = columnFromHandle(connection.sourceHandle);
      const targetColumnId = columnFromHandle(connection.targetHandle);
      if (!connection.source || !connection.target || !sourceColumnId || !targetColumnId) return;
      addRelation({
        sourceTableId: connection.source,
        sourceColumnId,
        targetTableId: connection.target,
        targetColumnId,
      });
    },
    [addRelation],
  );

  const isValidConnection = useCallback(
    (connection: Connection | RelationEdgeType) => {
      const sourceColumnId = columnFromHandle(connection.sourceHandle);
      const targetColumnId = columnFromHandle(connection.targetHandle);
      if (!sourceColumnId || !targetColumnId) return false;
      // os dois lados da mesma coluna nao formam relacionamento
      if (sourceColumnId === targetColumnId) return false;
      // uma coluna so recebe uma FK, senao o inspetor mostraria so a primeira
      const taken = diagram.relations.some(
        (relation) =>
          relation.targetTableId === connection.target &&
          relation.targetColumnId === targetColumnId,
      );
      return !taken;
    },
    [diagram.relations],
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: TableNodeType) => {
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLElement>("[data-columnid]");
      if (row?.dataset.columnid) {
        setSelection({ kind: "column", tableId: node.id, columnId: row.dataset.columnid });
        return;
      }
      setSelection({ kind: "table", tableId: node.id });
    },
    [setSelection],
  );

  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addTable({ x: Math.round(position.x), y: Math.round(position.y) });
    },
    [addTable, screenToFlowPosition],
  );

  return (
    <div className="relative h-full w-full">
      <CrowFootDefs />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={pushHistory}
        onNodeClick={onNodeClick}
        onEdgeClick={(_, edge) => setSelection({ kind: "relation", relationId: edge.id })}
        onPaneClick={() => setSelection({ kind: "none" })}
        onDoubleClick={onPaneDoubleClick}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        // com um handle por lado, quem comeca o arrasto e a coluna
        // referenciada e quem recebe o solto e a coluna que ganha a FK
        connectionMode={ConnectionMode.Loose}
        connectionRadius={26}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
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
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          style={{ width: 168, height: 112 }}
          className="!bottom-4 !left-4"
          bgColor="var(--color-surface)"
          maskColor="rgba(22, 33, 44, 0.08)"
          nodeColor={(node) => (node as TableNodeType).data.table.color}
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
        />
      </ReactFlow>

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-1.5">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-sm">
          <Button size="sm" variant="ghost" onClick={() => addTable()}>
            <Plus size={13} />
            Nova tabela
          </Button>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <IconButton label="Desfazer" onClick={undo} disabled={!canUndo}>
            <Undo2 size={14} />
          </IconButton>
          <IconButton label="Refazer" onClick={redo} disabled={!canRedo}>
            <Redo2 size={14} />
          </IconButton>
          <IconButton label="Enquadrar diagrama" onClick={() => fitView({ duration: 300 })}>
            <Frame size={14} />
          </IconButton>
        </div>
      </div>

      {diagram.tables.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="panel pointer-events-auto w-[380px] p-5 shadow-sm">
            <p className="eyebrow">Canvas vazio</p>
            <h2 className="mt-1 text-[17px] font-semibold">Comece pelo modelo</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
              Clique duas vezes no canvas para criar uma tabela, ou abra um modelo pronto para
              estudar a estrutura.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => loadTemplate(template.key)}
                  className="rounded-md border border-line px-3 py-2 text-left transition-colors hover:border-elephant hover:bg-elephant-soft"
                >
                  <span className="block text-[13px] font-semibold">{template.label}</span>
                  <span className="block text-[11.5px] text-ink-faint">
                    {template.description}
                  </span>
                </button>
              ))}
              <Button variant="primary" onClick={() => addTable({ x: 120, y: 120 })}>
                <Plus size={14} />
                Criar tabela em branco
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ModelerCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
