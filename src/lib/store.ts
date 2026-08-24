"use client";

import { create } from "zustand";
import type {
  Column,
  Diagram,
  EditorMode,
  Relation,
  RowRef,
  Selection,
  SimData,
  SimOptions,
  SimRow,
  SqlOptions,
  Table,
} from "./types";
import { ROW_ID, applyKeyRole, ridOf, type KeyRole } from "./types";
import { cloneTemplate, emptyDiagram } from "./samples";
import { simulate, suggestRow } from "./simulate";
import {
  applyDelete,
  applyUpdates,
  columnOf,
  formatValue,
  deleteSql,
  describePlan,
  findRow,
  insertSql,
  makeLog,
  newRowId,
  parseValue,
  planCellUpdate,
  planDelete,
  rowLabel,
  sameValue,
  tableOf,
  updateSql,
  validateCell,
  validateRow,
  type DeletePlan,
  type OpLog,
} from "./dataops";
import { newId, nextColor, toIdentifier } from "./utils";
import { clearStoredData, readData, readDiagram } from "./library";

const HISTORY_LIMIT = 60;

interface StoreState {
  hydrated: boolean;
  /** primeira visita: ninguem escolheu ainda entre branco e modelo pronto */
  welcome: boolean;
  /** false quando os dados nao couberam no localStorage */
  dataStored: boolean;
  diagram: Diagram;
  past: Diagram[];
  future: Diagram[];
  selection: Selection;
  mode: EditorMode;
  sqlOptions: SqlOptions;
  simOptions: SimOptions;
  simData: SimData;
  simWarnings: string[];
  simTableId: string | null;
  focusRow: RowRef | null;
  panel: "sql" | "issues" | null;

  /** aba de demonstracao */
  demoView: "canvas" | "grid";
  demoRowsPerTable: number;
  opLog: OpLog[];
  /** exclusao aguardando confirmacao, com o efeito ja calculado */
  pendingDelete: DeletePlan | null;
  /** linhas alteradas agora ha pouco, para o destaque piscar na tela */
  flash: string[];

  setMode: (mode: EditorMode) => void;
  setSelection: (selection: Selection) => void;
  setPanel: (panel: "sql" | "issues" | null) => void;
  setDiagramName: (name: string) => void;

  loadDiagram: (diagram: Diagram) => void;
  loadTemplate: (key: string) => void;
  resetDiagram: () => void;
  /** sai da tela de inicio para um modelo em branco */
  startBlank: () => void;
  /** sai da tela de inicio abrindo um modelo pronto */
  startTemplate: (key: string) => void;
  showWelcome: () => void;
  /** volta da tela de inicio para o que ja estava aberto */
  resume: () => void;
  setDataStored: (stored: boolean) => void;

  addTable: (position?: { x: number; y: number }) => string;
  updateTable: (tableId: string, patch: Partial<Table>) => void;
  duplicateTable: (tableId: string) => void;
  removeTable: (tableId: string) => void;
  moveTable: (tableId: string, position: { x: number; y: number }) => void;

  addColumn: (tableId: string) => void;
  updateColumn: (tableId: string, columnId: string, patch: Partial<Column>) => void;
  setColumnRole: (tableId: string, columnId: string, role: KeyRole) => void;
  removeColumn: (tableId: string, columnId: string) => void;
  moveColumn: (tableId: string, columnId: string, offset: number) => void;

  addRelation: (input: {
    sourceTableId: string;
    sourceColumnId: string;
    targetTableId: string;
    targetColumnId: string;
  }) => void;
  updateRelation: (relationId: string, patch: Partial<Relation>) => void;
  removeRelation: (relationId: string) => void;
  convertToAssociative: (relationId: string) => void;

  setSqlOptions: (patch: Partial<SqlOptions>) => void;
  setSimOptions: (patch: Partial<SimOptions>) => void;
  setSimTable: (tableId: string | null) => void;
  setFocusRow: (focus: RowRef | null) => void;
  runSimulation: () => void;
  clearSimulation: () => void;

  setDemoView: (view: "canvas" | "grid") => void;
  setDemoRows: (rows: number) => void;
  /** recria os dados com poucas linhas, o suficiente para enxergar as ligacoes */
  seedDemo: (rowsPerTable?: number) => void;
  /** garante dados ao entrar na demonstracao pela primeira vez */
  ensureDemoData: () => void;
  /** grava uma celula; devolve a mensagem de erro ou null se deu certo */
  updateCell: (tableId: string, rid: string, columnId: string, raw: string) => string | null;
  /** insere uma linha sugerida; devolve erro ou null */
  insertRow: (tableId: string) => string | null;
  /** calcula o efeito da exclusao e abre a confirmacao */
  requestDelete: (refs: RowRef[]) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
  /** troca o ON DELETE do relacionamento e recalcula o plano aberto */
  relaxBlockedRelation: (relationId: string) => void;
  clearLog: () => void;
  clearFlash: () => void;

  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  hydrate: () => void;
}

function findTable(diagram: Diagram, tableId: string): Table | undefined {
  return diagram.tables.find((t) => t.id === tableId);
}

function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let index = 2;
  while (taken.includes(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

const NODE_WIDTH = 268;
const GAP = 48;

function estimatedHeight(table: Table): number {
  return 92 + table.columns.length * 30;
}

/**
 * Procura um lugar livre a partir da posicao desejada, para a tabela nova
 * nao nascer em cima de outra.
 */
function freeSpot(tables: Table[], preferred: { x: number; y: number }): { x: number; y: number } {
  const height = 160;
  const overlaps = (spot: { x: number; y: number }) =>
    tables.some((table) => {
      const other = { ...table.position, h: estimatedHeight(table) };
      return (
        spot.x < other.x + NODE_WIDTH + GAP &&
        spot.x + NODE_WIDTH + GAP > other.x &&
        spot.y < other.y + other.h + GAP &&
        spot.y + height + GAP > other.y
      );
    });

  for (let column = 0; column < 14; column += 1) {
    for (let row = 0; row < 14; row += 1) {
      const spot = {
        x: Math.round(preferred.x + column * (NODE_WIDTH + GAP)),
        y: Math.round(preferred.y + row * (height + GAP)),
      };
      if (!overlaps(spot)) return spot;
    }
  }
  return preferred;
}

export const useStore = create<StoreState>()((set, get) => {
  /** aplica uma mudanca no diagrama registrando no historico */
  const commit = (updater: (draft: Diagram) => Diagram) => {
    set((state) => {
      const next = updater(structuredClone(state.diagram));
      return {
        diagram: next,
        past: [...state.past, state.diagram].slice(-HISTORY_LIMIT),
        future: [],
      };
    });
  };

  return {
    hydrated: false,
    welcome: false,
    dataStored: true,
    diagram: emptyDiagram(),
    past: [],
    future: [],
    selection: { kind: "none" },
    mode: "modeler",
    sqlOptions: {
      includeDrop: false,
      includeComments: true,
      includeIndexes: true,
      ifNotExists: true,
    },
    simOptions: { seed: "pgcanvas", nullRate: 0.08, locale: "pt-BR" },
    simData: {},
    simWarnings: [],
    simTableId: null,
    focusRow: null,
    panel: null,
    demoView: "canvas",
    demoRowsPerTable: 5,
    opLog: [],
    pendingDelete: null,
    flash: [],

    setMode: (mode) => set({ mode, focusRow: null }),
    setSelection: (selection) => set({ selection }),
    setPanel: (panel) => set((state) => ({ panel: state.panel === panel ? null : panel })),
    setDiagramName: (name) => commit((draft) => ({ ...draft, name })),

    loadDiagram: (diagram) => {
      clearStoredData();
      set({
        diagram,
        past: [],
        future: [],
        selection: { kind: "none" },
        simData: {},
        simWarnings: [],
        simTableId: null,
        focusRow: null,
        opLog: [],
        pendingDelete: null,
        flash: [],
        welcome: false,
        dataStored: true,
      });
    },

    loadTemplate: (key) => get().loadDiagram(cloneTemplate(key)),
    resetDiagram: () => get().loadDiagram(emptyDiagram()),

    startBlank: () => {
      get().loadDiagram(emptyDiagram());
      set({ mode: "modeler" });
    },

    startTemplate: (key) => {
      get().loadTemplate(key);
      set({ mode: "modeler" });
    },

    showWelcome: () => set({ welcome: true }),
    resume: () => set({ welcome: false }),
    setDataStored: (stored) => set({ dataStored: stored }),

    addTable: (position) => {
      const id = newId("tbl");
      const state = get();
      const name = uniqueName("nova_tabela", state.diagram.tables.map((t) => t.name));
      const columnId = newId("col");
      const table: Table = {
        id,
        name,
        schema: "public",
        color: nextColor(state.diagram.tables.length),
        position: position ?? freeSpot(state.diagram.tables, { x: 60, y: 60 }),
        rowCount: 10,
        columns: [
          {
            id: columnId,
            name: "id",
            type: "integer",
            isPrimary: true,
            isForeign: false,
            nullable: false,
            unique: false,
            identity: true,
          },
        ],
      };
      commit((draft) => ({ ...draft, tables: [...draft.tables, table] }));
      set({ selection: { kind: "table", tableId: id } });
      return id;
    },

    updateTable: (tableId, patch) =>
      commit((draft) => ({
        ...draft,
        tables: draft.tables.map((table) =>
          table.id === tableId
            ? { ...table, ...patch, name: patch.name !== undefined ? patch.name : table.name }
            : table,
        ),
      })),

    duplicateTable: (tableId) => {
      const source = findTable(get().diagram, tableId);
      if (!source) return;
      const newTableId = newId("tbl");
      const clone: Table = {
        ...structuredClone(source),
        id: newTableId,
        name: uniqueName(`${source.name}_copia`, get().diagram.tables.map((t) => t.name)),
        position: freeSpot(get().diagram.tables, {
          x: source.position.x + NODE_WIDTH + GAP,
          y: source.position.y,
        }),
        columns: source.columns.map((column) => ({
          ...column,
          id: newId("col"),
          isForeign: false,
        })),
      };
      commit((draft) => ({ ...draft, tables: [...draft.tables, clone] }));
      set({ selection: { kind: "table", tableId: newTableId } });
    },

    removeTable: (tableId) => {
      commit((draft) => ({
        ...draft,
        tables: draft.tables.filter((table) => table.id !== tableId),
        relations: draft.relations.filter(
          (relation) => relation.sourceTableId !== tableId && relation.targetTableId !== tableId,
        ),
      }));
      set({ selection: { kind: "none" } });
    },

    moveTable: (tableId, position) =>
      set((state) => ({
        diagram: {
          ...state.diagram,
          tables: state.diagram.tables.map((table) =>
            table.id === tableId ? { ...table, position } : table,
          ),
        },
      })),

    addColumn: (tableId) => {
      const table = findTable(get().diagram, tableId);
      if (!table) return;
      const columnId = newId("col");
      const column: Column = {
        id: columnId,
        name: uniqueName("coluna", table.columns.map((c) => c.name)),
        type: "varchar",
        length: 255,
        isPrimary: false,
        isForeign: false,
        nullable: true,
        unique: false,
        identity: false,
      };
      commit((draft) => ({
        ...draft,
        tables: draft.tables.map((item) =>
          item.id === tableId ? { ...item, columns: [...item.columns, column] } : item,
        ),
      }));
      set({ selection: { kind: "column", tableId, columnId } });
    },

    updateColumn: (tableId, columnId, patch) =>
      commit((draft) => ({
        ...draft,
        tables: draft.tables.map((table) =>
          table.id !== tableId
            ? table
            : {
                ...table,
                columns: table.columns.map((column) =>
                  column.id === columnId ? { ...column, ...patch } : column,
                ),
              },
        ),
      })),

    setColumnRole: (tableId, columnId, role) =>
      commit((draft) => {
        const tables = draft.tables.map((table) =>
          table.id !== tableId
            ? table
            : {
                ...table,
                columns: table.columns.map((column) =>
                  column.id === columnId ? applyKeyRole(column, role) : column,
                ),
              },
        );
        // tirar a marca de FK remove o relacionamento correspondente
        const relations =
          role === "none" || role === "pk"
            ? draft.relations.filter(
                (relation) =>
                  !(relation.targetTableId === tableId && relation.targetColumnId === columnId),
              )
            : draft.relations.map((relation) =>
                relation.targetTableId === tableId && relation.targetColumnId === columnId
                  ? { ...relation, identifying: role === "pfk" }
                  : relation,
              );
        return { ...draft, tables, relations };
      }),

    removeColumn: (tableId, columnId) => {
      commit((draft) => ({
        ...draft,
        tables: draft.tables.map((table) =>
          table.id !== tableId
            ? table
            : { ...table, columns: table.columns.filter((column) => column.id !== columnId) },
        ),
        relations: draft.relations.filter(
          (relation) =>
            !(relation.sourceTableId === tableId && relation.sourceColumnId === columnId) &&
            !(relation.targetTableId === tableId && relation.targetColumnId === columnId),
        ),
      }));
      set({ selection: { kind: "table", tableId } });
    },

    moveColumn: (tableId, columnId, offset) =>
      commit((draft) => ({
        ...draft,
        tables: draft.tables.map((table) => {
          if (table.id !== tableId) return table;
          const index = table.columns.findIndex((column) => column.id === columnId);
          const target = index + offset;
          if (index < 0 || target < 0 || target >= table.columns.length) return table;
          const columns = [...table.columns];
          const [moved] = columns.splice(index, 1);
          columns.splice(target, 0, moved);
          return { ...table, columns };
        }),
      })),

    addRelation: ({ sourceTableId, sourceColumnId, targetTableId, targetColumnId }) => {
      const diagram = get().diagram;
      if (sourceTableId === targetTableId && sourceColumnId === targetColumnId) return;
      const alreadyLinked = diagram.relations.some(
        (relation) =>
          relation.targetTableId === targetTableId && relation.targetColumnId === targetColumnId,
      );
      if (alreadyLinked) return;

      const parent = findTable(diagram, sourceTableId);
      const child = findTable(diagram, targetTableId);
      if (!parent || !child) return;
      const childColumn = child.columns.find((column) => column.id === targetColumnId);
      const identifying = childColumn?.isPrimary ?? false;

      const relation: Relation = {
        id: newId("rel"),
        name: `fk_${child.name}_${parent.name}`,
        sourceTableId,
        sourceColumnId,
        targetTableId,
        targetColumnId,
        cardinality: "1:N",
        identifying,
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      };

      commit((draft) => ({
        ...draft,
        relations: [...draft.relations, relation],
        tables: draft.tables.map((table) =>
          table.id !== targetTableId
            ? table
            : {
                ...table,
                columns: table.columns.map((column) =>
                  column.id === targetColumnId ? { ...column, isForeign: true } : column,
                ),
              },
        ),
      }));
      set({ selection: { kind: "relation", relationId: relation.id } });
    },

    updateRelation: (relationId, patch) =>
      commit((draft) => {
        const relations = draft.relations.map((relation) =>
          relation.id === relationId ? { ...relation, ...patch } : relation,
        );
        const changed = relations.find((relation) => relation.id === relationId);
        if (!changed || patch.identifying === undefined) return { ...draft, relations };
        const tables = draft.tables.map((table) =>
          table.id !== changed.targetTableId
            ? table
            : {
                ...table,
                columns: table.columns.map((column) =>
                  column.id === changed.targetColumnId
                    ? applyKeyRole(column, patch.identifying ? "pfk" : "fk")
                    : column,
                ),
              },
        );
        return { ...draft, relations, tables };
      }),

    removeRelation: (relationId) => {
      commit((draft) => {
        const relation = draft.relations.find((item) => item.id === relationId);
        if (!relation) return draft;
        const stillForeign = draft.relations.some(
          (item) =>
            item.id !== relationId &&
            item.targetTableId === relation.targetTableId &&
            item.targetColumnId === relation.targetColumnId,
        );
        return {
          ...draft,
          relations: draft.relations.filter((item) => item.id !== relationId),
          tables: draft.tables.map((table) =>
            table.id !== relation.targetTableId || stillForeign
              ? table
              : {
                  ...table,
                  columns: table.columns.map((column) =>
                    column.id === relation.targetColumnId
                      ? { ...column, isForeign: false }
                      : column,
                  ),
                },
          ),
        };
      });
      set({ selection: { kind: "none" } });
    },

    convertToAssociative: (relationId) => {
      const diagram = get().diagram;
      const relation = diagram.relations.find((item) => item.id === relationId);
      if (!relation) return;
      const parent = findTable(diagram, relation.sourceTableId);
      const child = findTable(diagram, relation.targetTableId);
      if (!parent || !child) return;
      const parentPk = parent.columns.find((column) => column.isPrimary);
      const childPk = child.columns.find((column) => column.isPrimary);
      if (!parentPk || !childPk) return;

      const tableId = newId("tbl");
      const leftId = newId("col");
      const rightId = newId("col");
      const name = uniqueName(
        toIdentifier(`${parent.name}_${child.name}`),
        diagram.tables.map((t) => t.name),
      );

      const junction: Table = {
        id: tableId,
        name,
        schema: parent.schema,
        color: nextColor(diagram.tables.length),
        rowCount: 30,
        comment: `Tabela associativa que resolve o N:N entre ${parent.name} e ${child.name}`,
        position: freeSpot(diagram.tables, {
          x: Math.round((parent.position.x + child.position.x) / 2),
          y: Math.round(Math.max(parent.position.y, child.position.y)) + 260,
        }),
        columns: [
          {
            id: leftId,
            name: parentPk.name,
            type: parentPk.type,
            length: parentPk.length,
            precision: parentPk.precision,
            scale: parentPk.scale,
            isPrimary: true,
            isForeign: true,
            nullable: false,
            unique: false,
            identity: false,
          },
          {
            id: rightId,
            name: childPk.name === parentPk.name ? `${childPk.name}_2` : childPk.name,
            type: childPk.type,
            length: childPk.length,
            precision: childPk.precision,
            scale: childPk.scale,
            isPrimary: true,
            isForeign: true,
            nullable: false,
            unique: false,
            identity: false,
          },
        ],
      };

      const left: Relation = {
        id: newId("rel"),
        name: `fk_${name}_${parent.name}`,
        sourceTableId: parent.id,
        sourceColumnId: parentPk.id,
        targetTableId: tableId,
        targetColumnId: leftId,
        cardinality: "1:N",
        identifying: true,
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      };
      const right: Relation = {
        id: newId("rel"),
        name: `fk_${name}_${child.name}`,
        sourceTableId: child.id,
        sourceColumnId: childPk.id,
        targetTableId: tableId,
        targetColumnId: rightId,
        cardinality: "1:N",
        identifying: true,
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      };

      commit((draft) => ({
        ...draft,
        tables: [
          ...draft.tables.map((table) =>
            table.id !== relation.targetTableId
              ? table
              : {
                  ...table,
                  columns: table.columns.map((column) =>
                    column.id === relation.targetColumnId
                      ? { ...column, isForeign: false }
                      : column,
                  ),
                },
          ),
          junction,
        ],
        relations: [...draft.relations.filter((item) => item.id !== relationId), left, right],
      }));
      set({ selection: { kind: "table", tableId } });
    },

    setSqlOptions: (patch) => set((state) => ({ sqlOptions: { ...state.sqlOptions, ...patch } })),
    setSimOptions: (patch) => set((state) => ({ simOptions: { ...state.simOptions, ...patch } })),
    setSimTable: (tableId) => set({ simTableId: tableId, focusRow: null }),
    setFocusRow: (focus) => set({ focusRow: focus }),

    runSimulation: () => {
      const { diagram, simOptions, simTableId } = get();
      const result = simulate(diagram, simOptions);
      const total = Object.values(result.data).reduce((sum, rows) => sum + rows.length, 0);
      set({
        simData: result.data,
        simWarnings: result.warnings,
        simTableId: simTableId ?? diagram.tables[0]?.id ?? null,
        focusRow: null,
        pendingDelete: null,
        flash: [],
        opLog: [
          makeLog({
            tone: "info",
            title: `${total} ${total === 1 ? "linha gerada" : "linhas geradas"} com a semente "${simOptions.seed}"`,
            detail: ["As tabelas pai foram geradas antes das filhas, na ordem topológica das FKs."],
          }),
        ],
      });
    },

    clearSimulation: () =>
      set({
        simData: {},
        simWarnings: [],
        focusRow: null,
        pendingDelete: null,
        opLog: [],
        flash: [],
      }),

    /* ---------------------------------------------------------------- */
    /* Demonstracao: preencher, editar e apagar com integridade          */
    /* ---------------------------------------------------------------- */

    setDemoView: (view) => set({ demoView: view }),

    setDemoRows: (rows) =>
      set({ demoRowsPerTable: Math.max(1, Math.min(20, Math.round(rows) || 5)) }),

    seedDemo: (rowsPerTable) => {
      const { diagram, simOptions, demoRowsPerTable, simTableId } = get();
      const count = rowsPerTable ?? demoRowsPerTable;
      // a demonstracao pede poucas linhas e nenhum nulo, senao a ligacao some
      const scaled: Diagram = {
        ...diagram,
        tables: diagram.tables.map((table) => ({ ...table, rowCount: count })),
      };
      const result = simulate(scaled, { ...simOptions, nullRate: 0 });
      set({
        simData: result.data,
        simWarnings: result.warnings,
        simTableId: simTableId ?? diagram.tables[0]?.id ?? null,
        focusRow: null,
        pendingDelete: null,
        flash: [],
        demoRowsPerTable: count,
        opLog: [
          makeLog({
            tone: "info",
            title: `Demonstração recriada com ${count} ${count === 1 ? "linha" : "linhas"} por tabela`,
            detail: [
              "Toda FK aponta para uma linha que existe mesmo, então dá para seguir o caminho entre as tabelas.",
            ],
          }),
        ],
      });
    },

    ensureDemoData: () => {
      const { simData, diagram } = get();
      if (diagram.tables.length === 0) return;
      const empty = diagram.tables.every((table) => (simData[table.id] ?? []).length === 0);
      if (empty) get().seedDemo();
    },

    updateCell: (tableId, rid, columnId, raw) => {
      const { diagram, simData } = get();
      const table = tableOf(diagram, tableId);
      const column = columnOf(table, columnId);
      if (!table || !column) return "Coluna não encontrada.";
      const row = findRow(simData, tableId, rid);
      if (!row) return "Linha não encontrada.";

      const parsed = parseValue(column, raw);
      if (parsed.error) return parsed.error;

      const current = row[columnId] ?? null;
      if (current === parsed.value || sameValue(current, parsed.value)) return null;

      const invalid = validateCell(diagram, simData, table, row, column, parsed.value);
      if (invalid) return invalid;

      // mudar uma chave referenciada arrasta os filhos, ou e barrada por eles
      const plan = planCellUpdate(diagram, simData, tableId, rid, columnId, parsed.value);
      if (plan.blocks.length > 0) {
        return plan.blocks[0].reason ?? "Alteração bloqueada por uma chave estrangeira.";
      }

      const nextData = applyUpdates(simData, plan.updates);
      const cascaded = plan.updates.length - 1;
      set((state) => ({
        simData: nextData,
        flash: plan.updates.map((item) => item.rid),
        opLog: [
          makeLog({
            tone: "ok",
            tableId,
            title: `${table.name}.${column.name}: ${formatValue(current)} virou ${formatValue(parsed.value)}`,
            detail:
              cascaded > 0
                ? [
                    `ON UPDATE CASCADE levou o novo valor para ${cascaded} ${cascaded === 1 ? "linha filha" : "linhas filhas"}.`,
                  ]
                : [],
            sql: updateSql(table, row, column, parsed.value),
          }),
          ...state.opLog,
        ].slice(0, 60),
      }));
      return null;
    },

    insertRow: (tableId) => {
      const { diagram, simData } = get();
      const table = tableOf(diagram, tableId);
      if (!table) return "Tabela não encontrada.";
      if (table.columns.length === 0) return "Esta tabela ainda não tem colunas.";

      const row: SimRow = {
        ...suggestRow(diagram, simData, table, `manual:${Date.now()}`),
        [ROW_ID]: newRowId(),
      };
      const errors = validateRow(diagram, simData, table, row);
      if (errors.length > 0) {
        // o card do canvas nao tem onde mostrar o erro, entao ele vai para o log
        set((state) => ({
          opLog: [
            makeLog({
              tone: "warn",
              tableId,
              title: `Não deu para inserir em ${table.name}`,
              detail: errors.slice(0, 3),
            }),
            ...state.opLog,
          ].slice(0, 60),
        }));
        return errors[0];
      }

      const rid = ridOf(row);
      set((state) => ({
        simData: { ...state.simData, [tableId]: [...(state.simData[tableId] ?? []), row] },
        focusRow: { tableId, rid },
        flash: [rid],
        opLog: [
          makeLog({
            tone: "ok",
            tableId,
            title: `Linha nova em ${table.name}: ${rowLabel(table, row)}`,
            detail: ["Clique em qualquer célula para trocar o valor gerado."],
            sql: insertSql(table, row),
          }),
          ...state.opLog,
        ].slice(0, 60),
      }));
      return null;
    },

    requestDelete: (refs) => {
      if (refs.length === 0) return;
      const { diagram, simData } = get();
      const plan = planDelete(diagram, simData, refs);
      // linha que ja sumiu numa exclusao anterior nao abre confirmacao vazia
      if (plan.removedCount === 0 && plan.blocks.length === 0) return;
      set({ pendingDelete: plan });
    },

    cancelDelete: () => set({ pendingDelete: null }),

    confirmDelete: () => {
      const { diagram, simData, pendingDelete } = get();
      if (!pendingDelete || pendingDelete.blocks.length > 0) return;

      const rootTableId = pendingDelete.roots[0]?.tableId ?? "";
      const rootTable = tableOf(diagram, rootTableId);
      const rootRows = pendingDelete.roots
        .filter((ref) => ref.tableId === rootTableId)
        .map((ref) => findRow(simData, ref.tableId, ref.rid))
        .filter((row): row is SimRow => Boolean(row));

      const nextData = applyDelete(simData, pendingDelete);
      const detail = describePlan(diagram, pendingDelete);
      const extra = pendingDelete.removedCount - pendingDelete.roots.length;

      set((state) => ({
        simData: nextData,
        pendingDelete: null,
        focusRow: null,
        flash: pendingDelete.updates.map((item) => item.rid),
        opLog: [
          makeLog({
            tone: extra > 0 ? "danger" : "warn",
            tableId: rootTableId,
            title: `${pendingDelete.removedCount} ${pendingDelete.removedCount === 1 ? "linha apagada" : "linhas apagadas"}${
              pendingDelete.updatedCount > 0
                ? `, ${pendingDelete.updatedCount} ${pendingDelete.updatedCount === 1 ? "atualizada" : "atualizadas"}`
                : ""
            }`,
            detail,
            sql: rootTable ? deleteSql(rootTable, rootRows) : undefined,
          }),
          ...state.opLog,
        ].slice(0, 60),
      }));
    },

    relaxBlockedRelation: (relationId) => {
      const plan = get().pendingDelete;
      get().updateRelation(relationId, { onDelete: "CASCADE" });
      if (!plan) return;
      const { diagram, simData } = get();
      set({ pendingDelete: planDelete(diagram, simData, plan.roots) });
    },

    clearLog: () => set({ opLog: [] }),
    clearFlash: () => set({ flash: [] }),

    pushHistory: () =>
      set((state) => ({
        past: [...state.past, state.diagram].slice(-HISTORY_LIMIT),
        future: [],
      })),

    undo: () =>
      set((state) => {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        return {
          diagram: previous,
          past: state.past.slice(0, -1),
          future: [state.diagram, ...state.future].slice(0, HISTORY_LIMIT),
          selection: { kind: "none" },
        };
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0) return state;
        const next = state.future[0];
        return {
          diagram: next,
          past: [...state.past, state.diagram].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          selection: { kind: "none" },
        };
      }),

    hydrate: () => {
      if (typeof window === "undefined") return;
      if (get().hydrated) return;

      const stored = readDiagram();
      if (!stored) {
        // primeira visita: quem escolhe por onde comecar e o usuario
        set({ hydrated: true, welcome: true });
        return;
      }

      // o que estava na tela volta como estava, inclusive os dados preenchidos
      const data = readData() ?? {};
      set({
        hydrated: true,
        welcome: false,
        diagram: stored,
        past: [],
        future: [],
        selection: { kind: "none" },
        simData: data,
        simWarnings: [],
        simTableId: stored.tables[0]?.id ?? null,
        focusRow: null,
        opLog: [],
        pendingDelete: null,
        flash: [],
      });
    },
  };
});
