/**
 * Operacoes sobre os dados simulados: editar celula, inserir e apagar linha.
 *
 * O ponto central e o `planDelete`: antes de sumir com qualquer coisa ele
 * percorre as chaves estrangeiras e monta o efeito completo da exclusao,
 * do jeito que o PostgreSQL faria. Isso permite mostrar o cascade na tela
 * antes de ele acontecer, que e o objetivo da aba de demonstracao.
 */

import type {
  Column,
  Diagram,
  FkAction,
  Relation,
  RowRef,
  SimData,
  SimRow,
  Table,
} from "./types";
import { ridOf } from "./types";
import { getType } from "./pg-types";
import { newId, quoteIdent, quoteLiteral } from "./utils";

export type Primitive = string | number | boolean | null;

/* ------------------------------------------------------------------ */
/* Acesso basico                                                       */
/* ------------------------------------------------------------------ */

export function rowsOf(data: SimData, tableId: string): SimRow[] {
  return data[tableId] ?? [];
}

export function findRow(data: SimData, tableId: string, rid: string): SimRow | undefined {
  return rowsOf(data, tableId).find((row) => ridOf(row) === rid);
}

export function newRowId(): string {
  return newId("row");
}

/** relacionamentos em que a tabela e o lado 1, ou seja, os filhos dela */
export function childRelations(diagram: Diagram, tableId: string): Relation[] {
  return diagram.relations.filter((relation) => relation.sourceTableId === tableId);
}

/** relacionamentos em que a tabela e o lado N, ou seja, os pais dela */
export function parentRelations(diagram: Diagram, tableId: string): Relation[] {
  return diagram.relations.filter((relation) => relation.targetTableId === tableId);
}

export function relationOfColumn(
  diagram: Diagram,
  tableId: string,
  columnId: string,
): Relation | undefined {
  return diagram.relations.find(
    (relation) => relation.targetTableId === tableId && relation.targetColumnId === columnId,
  );
}

export function tableOf(diagram: Diagram, tableId: string): Table | undefined {
  return diagram.tables.find((table) => table.id === tableId);
}

export function columnOf(table: Table | undefined, columnId: string): Column | undefined {
  return table?.columns.find((column) => column.id === columnId);
}

/** comparacao tolerante: 3 e "3" apontam para a mesma linha do pai */
export function sameValue(a: Primitive | undefined, b: Primitive | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

export function formatValue(value: Primitive | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** coluna de texto que melhor descreve a linha, usada nos rotulos curtos */
function descriptiveColumn(table: Table, skipId?: string): Column | undefined {
  return table.columns.find(
    (column) =>
      column.id !== skipId &&
      !column.isPrimary &&
      !column.isForeign &&
      getType(column.type).kind === "text",
  );
}

/** as linhas do pai que uma FK pode apontar, para montar o select da celula */
export function parentOptions(
  diagram: Diagram,
  data: SimData,
  relation: Relation,
): Array<{ value: Primitive; label: string; rid: string }> {
  const parent = tableOf(diagram, relation.sourceTableId);
  if (!parent) return [];
  const keyColumn = columnOf(parent, relation.sourceColumnId);
  const extraColumn = descriptiveColumn(parent, relation.sourceColumnId);
  return rowsOf(data, parent.id).map((row) => {
    const value = row[relation.sourceColumnId] ?? null;
    const extra = extraColumn ? row[extraColumn.id] : null;
    const head = `${keyColumn?.name ?? "id"} ${formatValue(value)}`;
    return {
      value,
      rid: ridOf(row),
      label: extra === null || extra === undefined ? head : `${head} - ${String(extra)}`,
    };
  });
}

/** rotulo curto de uma linha, do tipo "3 - Ana Silva" */
export function rowLabel(table: Table, row: SimRow): string {
  const pk = table.columns.filter((column) => column.isPrimary);
  const key = (pk.length > 0 ? pk : table.columns.slice(0, 1))
    .map((column) => formatValue(row[column.id]))
    .join(", ");
  const extraColumn = descriptiveColumn(table);
  const extra = extraColumn ? row[extraColumn.id] : null;
  return extra === null || extra === undefined ? key : `${key} - ${String(extra)}`;
}

/* ------------------------------------------------------------------ */
/* Leitura do texto digitado                                           */
/* ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRUE_WORDS = new Set(["true", "t", "1", "sim", "s", "verdadeiro", "yes", "y"]);
const FALSE_WORDS = new Set(["false", "f", "0", "nao", "não", "n", "falso", "no"]);

export interface ParseResult {
  value: Primitive;
  error: string | null;
}

/** converte o texto da celula no valor do tipo declarado da coluna */
export function parseValue(column: Column, raw: string): ParseResult {
  const text = raw.trim();
  const type = getType(column.type);

  if (text === "" || text.toUpperCase() === "NULL") {
    if (!column.nullable) {
      return { value: null, error: `${column.name} é NOT NULL, precisa de um valor.` };
    }
    return { value: null, error: null };
  }

  switch (type.kind) {
    case "int": {
      const parsed = Number(text.replace(",", "."));
      if (!Number.isFinite(parsed)) {
        return { value: null, error: `${column.name} espera um número inteiro.` };
      }
      if (!Number.isInteger(parsed)) {
        return { value: null, error: `${column.name} é ${type.sql}, não aceita casas decimais.` };
      }
      return { value: parsed, error: null };
    }
    case "float":
    case "money": {
      const parsed = Number(text.replace(/[^\d.,-]/g, "").replace(",", "."));
      if (!Number.isFinite(parsed)) {
        return { value: null, error: `${column.name} espera um número.` };
      }
      if (type.args === "precision") {
        const precision = column.precision ?? type.defaultPrecision ?? 12;
        const scale = column.scale ?? type.defaultScale ?? 2;
        const ceiling = 10 ** Math.max(1, precision - scale);
        if (Math.abs(parsed) >= ceiling) {
          return {
            value: null,
            error: `${column.name} é numeric(${precision}, ${scale}), o valor precisa ser menor que ${ceiling}.`,
          };
        }
        return { value: Number(parsed.toFixed(scale)), error: null };
      }
      return { value: parsed, error: null };
    }
    case "bool": {
      const lowered = text.toLowerCase();
      if (TRUE_WORDS.has(lowered)) return { value: true, error: null };
      if (FALSE_WORDS.has(lowered)) return { value: false, error: null };
      return { value: null, error: `${column.name} é boolean, use true ou false.` };
    }
    case "date":
      if (!DATE_RE.test(text)) {
        return { value: null, error: `${column.name} espera uma data no formato AAAA-MM-DD.` };
      }
      return { value: text, error: null };
    case "time":
      if (!TIME_RE.test(text)) {
        return { value: null, error: `${column.name} espera uma hora no formato HH:MM.` };
      }
      return { value: text, error: null };
    case "timestamp":
      if (!TIMESTAMP_RE.test(text)) {
        return {
          value: null,
          error: `${column.name} espera data e hora no formato AAAA-MM-DD HH:MM.`,
        };
      }
      return { value: text, error: null };
    case "uuid":
      if (!UUID_RE.test(text)) {
        return { value: null, error: `${column.name} espera um UUID válido.` };
      }
      return { value: text, error: null };
    default: {
      if (column.length && text.length > column.length) {
        return {
          value: null,
          error: `${column.name} aceita no máximo ${column.length} caracteres, foram ${text.length}.`,
        };
      }
      return { value: text, error: null };
    }
  }
}

/** default declarado no DDL convertido em valor, quando da para entender */
export function defaultAsValue(column: Column): Primitive {
  const raw = (column.defaultValue ?? "").trim();
  if (!raw) return null;
  if (/^'.*'$/.test(raw)) return raw.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === "true";
  // expressoes como now() ou nextval() nao tem como ser resolvidas aqui
  return null;
}

/* ------------------------------------------------------------------ */
/* Validacao de linha                                                  */
/* ------------------------------------------------------------------ */

/** confere NOT NULL, UNIQUE, PK e existencia do pai antes de gravar */
export function validateRow(
  diagram: Diagram,
  data: SimData,
  table: Table,
  row: SimRow,
  ignoreRid?: string,
): string[] {
  const errors: string[] = [];
  const others = rowsOf(data, table.id).filter((item) => ridOf(item) !== ignoreRid);

  for (const column of table.columns) {
    const value = row[column.id] ?? null;

    if (value === null && !column.nullable) {
      errors.push(`${column.name} é NOT NULL e está vazia.`);
      continue;
    }
    if (value === null) continue;

    if (column.unique && others.some((item) => sameValue(item[column.id], value))) {
      errors.push(`${column.name} tem UNIQUE e o valor ${formatValue(value)} já existe.`);
    }

    const relation = relationOfColumn(diagram, table.id, column.id);
    if (relation) {
      const parentRows = rowsOf(data, relation.sourceTableId);
      const exists = parentRows.some((item) => sameValue(item[relation.sourceColumnId], value));
      if (!exists) {
        const parent = tableOf(diagram, relation.sourceTableId);
        errors.push(
          `${column.name} = ${formatValue(value)} não existe em ${parent?.name ?? "tabela pai"}, a FK exige um pai.`,
        );
      }
      if (relation.cardinality === "1:1" && others.some((item) => sameValue(item[column.id], value))) {
        errors.push(`${column.name} é 1:1 e esse pai já está ocupado por outra linha.`);
      }
    }
  }

  const pk = table.columns.filter((column) => column.isPrimary);
  if (pk.length > 0) {
    const key = pk.map((column) => String(row[column.id] ?? "")).join("");
    const duplicated = others.some(
      (item) => pk.map((column) => String(item[column.id] ?? "")).join("") === key,
    );
    if (duplicated) {
      const shown = pk.map((column) => `${column.name}=${formatValue(row[column.id] ?? null)}`);
      errors.push(`Já existe uma linha com a chave primária ${shown.join(", ")}.`);
    }
  }

  return errors;
}

/**
 * Versao pontual da validacao, usada quando so uma celula muda. Evita
 * bloquear a edicao por causa de um problema que ja existia em outra coluna.
 */
export function validateCell(
  diagram: Diagram,
  data: SimData,
  table: Table,
  row: SimRow,
  column: Column,
  value: Primitive,
): string | null {
  const rid = ridOf(row);
  const others = rowsOf(data, table.id).filter((item) => ridOf(item) !== rid);

  if (value === null) {
    if (!column.nullable) return `${column.name} é NOT NULL e não aceita vazio.`;
  } else {
    if (column.unique && others.some((item) => sameValue(item[column.id], value))) {
      return `${column.name} tem UNIQUE e o valor ${formatValue(value)} já existe.`;
    }
    const relation = relationOfColumn(diagram, table.id, column.id);
    if (relation) {
      const exists = rowsOf(data, relation.sourceTableId).some((item) =>
        sameValue(item[relation.sourceColumnId], value),
      );
      if (!exists) {
        const parent = tableOf(diagram, relation.sourceTableId);
        return `${column.name} = ${formatValue(value)} não existe em ${parent?.name ?? "tabela pai"}, a FK exige um pai.`;
      }
      if (relation.cardinality === "1:1" && others.some((item) => sameValue(item[column.id], value))) {
        return `${column.name} é 1:1 e esse pai já está ocupado por outra linha.`;
      }
    }
  }

  if (column.isPrimary) {
    const pk = table.columns.filter((item) => item.isPrimary);
    const candidate = { ...row, [column.id]: value };
    const key = pk.map((item) => String(candidate[item.id] ?? "")).join("");
    const duplicated = others.some(
      (item) => pk.map((col) => String(item[col.id] ?? "")).join("") === key,
    );
    if (duplicated) return `Essa chave primária já existe em ${table.name}.`;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Plano de exclusao com cascade                                       */
/* ------------------------------------------------------------------ */

export type ImpactKind = "root" | "cascade" | "set-null" | "set-default" | "block";

export interface ImpactStep {
  id: string;
  kind: ImpactKind;
  tableId: string;
  /** tabela pai que disparou este efeito */
  fromTableId?: string;
  relationId?: string;
  relationName?: string;
  columnId?: string;
  action?: FkAction;
  rids: string[];
  depth: number;
  /** motivo do bloqueio, quando kind e "block" */
  reason?: string;
}

export interface CellUpdate {
  tableId: string;
  rid: string;
  columnId: string;
  value: Primitive;
}

export interface DeletePlan {
  roots: RowRef[];
  steps: ImpactStep[];
  /** tabela para a lista de rids que somem */
  removed: Record<string, string[]>;
  updates: CellUpdate[];
  blocks: ImpactStep[];
  removedCount: number;
  updatedCount: number;
}

/**
 * Percorre as FKs a partir das linhas escolhidas e monta o efeito total.
 * Nada e alterado aqui, o plano so descreve o que aconteceria.
 */
export function planDelete(diagram: Diagram, data: SimData, roots: RowRef[]): DeletePlan {
  const removed = new Map<string, Set<string>>();
  const steps: ImpactStep[] = [];
  const blocks: ImpactStep[] = [];
  const updates: CellUpdate[] = [];
  let counter = 0;
  const stepId = () => `step_${(counter += 1)}`;

  const mark = (tableId: string, rid: string): boolean => {
    const set = removed.get(tableId) ?? new Set<string>();
    if (set.has(rid)) return false;
    set.add(rid);
    removed.set(tableId, set);
    return true;
  };
  const isRemoved = (tableId: string, rid: string) => removed.get(tableId)?.has(rid) ?? false;

  const queue: Array<RowRef & { depth: number }> = [];
  const rootsByTable = new Map<string, string[]>();
  for (const ref of roots) {
    if (!findRow(data, ref.tableId, ref.rid)) continue;
    if (!mark(ref.tableId, ref.rid)) continue;
    queue.push({ ...ref, depth: 0 });
    rootsByTable.set(ref.tableId, [...(rootsByTable.get(ref.tableId) ?? []), ref.rid]);
  }
  for (const [tableId, rids] of rootsByTable) {
    steps.push({ id: stepId(), kind: "root", tableId, rids, depth: 0 });
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const row = findRow(data, current.tableId, current.rid);
    if (!row) continue;

    for (const relation of childRelations(diagram, current.tableId)) {
      const childTable = tableOf(diagram, relation.targetTableId);
      const childColumn = columnOf(childTable, relation.targetColumnId);
      if (!childTable || !childColumn) continue;

      const parentValue = row[relation.sourceColumnId] ?? null;
      if (parentValue === null) continue;

      const children = rowsOf(data, childTable.id).filter(
        (item) =>
          !isRemoved(childTable.id, ridOf(item)) &&
          sameValue(item[relation.targetColumnId], parentValue),
      );
      if (children.length === 0) continue;

      const rids = children.map((item) => ridOf(item));
      const base = {
        id: stepId(),
        tableId: childTable.id,
        fromTableId: current.tableId,
        relationId: relation.id,
        relationName: relation.name || `fk_${childTable.name}`,
        columnId: childColumn.id,
        action: relation.onDelete,
        rids,
        depth: current.depth + 1,
      };

      switch (relation.onDelete) {
        case "CASCADE": {
          steps.push({ ...base, kind: "cascade" });
          for (const rid of rids) {
            if (mark(childTable.id, rid)) {
              queue.push({ tableId: childTable.id, rid, depth: current.depth + 1 });
            }
          }
          break;
        }
        case "SET NULL": {
          if (!childColumn.nullable) {
            blocks.push({
              ...base,
              kind: "block",
              reason: `${childTable.name}.${childColumn.name} é NOT NULL, o SET NULL não tem como ser aplicado.`,
            });
            break;
          }
          steps.push({ ...base, kind: "set-null" });
          for (const rid of rids) {
            updates.push({ tableId: childTable.id, rid, columnId: childColumn.id, value: null });
          }
          break;
        }
        case "SET DEFAULT": {
          const fallback = defaultAsValue(childColumn);
          if (fallback === null && !childColumn.nullable) {
            blocks.push({
              ...base,
              kind: "block",
              reason: `${childTable.name}.${childColumn.name} não tem DEFAULT utilizável e é NOT NULL.`,
            });
            break;
          }
          steps.push({ ...base, kind: "set-default" });
          for (const rid of rids) {
            updates.push({
              tableId: childTable.id,
              rid,
              columnId: childColumn.id,
              value: fallback,
            });
          }
          break;
        }
        default: {
          blocks.push({
            ...base,
            kind: "block",
            reason: `${relation.onDelete} impede apagar enquanto ${childTable.name} tiver ${rids.length} ${rids.length === 1 ? "linha dependente" : "linhas dependentes"}.`,
          });
        }
      }
    }
  }

  const removedRecord: Record<string, string[]> = {};
  let removedCount = 0;
  for (const [tableId, set] of removed) {
    removedRecord[tableId] = Array.from(set);
    removedCount += set.size;
  }

  // linha que sumiu nao precisa de update
  const survivingUpdates = updates.filter((item) => !isRemoved(item.tableId, item.rid));

  return {
    roots,
    steps,
    removed: removedRecord,
    updates: survivingUpdates,
    blocks,
    removedCount,
    updatedCount: survivingUpdates.length,
  };
}

/** aplica o plano gerando um novo SimData, sem tocar no original */
export function applyDelete(data: SimData, plan: DeletePlan): SimData {
  const updatesByRow = new Map<string, CellUpdate[]>();
  for (const update of plan.updates) {
    const key = `${update.tableId}|${update.rid}`;
    updatesByRow.set(key, [...(updatesByRow.get(key) ?? []), update]);
  }

  const next: SimData = {};
  for (const [tableId, rows] of Object.entries(data)) {
    const drop = new Set(plan.removed[tableId] ?? []);
    next[tableId] = rows
      .filter((row) => !drop.has(ridOf(row)))
      .map((row) => {
        const patch = updatesByRow.get(`${tableId}|${ridOf(row)}`);
        if (!patch) return row;
        const copy = { ...row };
        for (const update of patch) copy[update.columnId] = update.value;
        return copy;
      });
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Alteracao de celula com ON UPDATE                                   */
/* ------------------------------------------------------------------ */

export interface UpdatePlan {
  updates: CellUpdate[];
  steps: ImpactStep[];
  blocks: ImpactStep[];
}

/**
 * Mudar uma coluna referenciada arrasta os filhos junto, conforme o
 * ON UPDATE do relacionamento. E o mesmo raciocinio do delete.
 */
export function planCellUpdate(
  diagram: Diagram,
  data: SimData,
  tableId: string,
  rid: string,
  columnId: string,
  value: Primitive,
): UpdatePlan {
  const updates: CellUpdate[] = [{ tableId, rid, columnId, value }];
  const steps: ImpactStep[] = [];
  const blocks: ImpactStep[] = [];
  const row = findRow(data, tableId, rid);
  if (!row) return { updates, steps, blocks };

  const oldValue = row[columnId] ?? null;
  if (sameValue(oldValue, value)) return { updates, steps, blocks };

  let counter = 0;
  const stepId = () => `upd_${(counter += 1)}`;

  for (const relation of childRelations(diagram, tableId)) {
    if (relation.sourceColumnId !== columnId) continue;
    const childTable = tableOf(diagram, relation.targetTableId);
    const childColumn = columnOf(childTable, relation.targetColumnId);
    if (!childTable || !childColumn) continue;

    const children = rowsOf(data, childTable.id).filter((item) =>
      sameValue(item[relation.targetColumnId], oldValue),
    );
    if (children.length === 0) continue;

    const rids = children.map((item) => ridOf(item));
    const base = {
      id: stepId(),
      tableId: childTable.id,
      fromTableId: tableId,
      relationId: relation.id,
      relationName: relation.name || `fk_${childTable.name}`,
      columnId: childColumn.id,
      action: relation.onUpdate,
      rids,
      depth: 1,
    };

    if (relation.onUpdate === "CASCADE") {
      steps.push({ ...base, kind: "cascade" });
      for (const childRid of rids) {
        updates.push({ tableId: childTable.id, rid: childRid, columnId: childColumn.id, value });
      }
    } else if (relation.onUpdate === "SET NULL" && childColumn.nullable) {
      steps.push({ ...base, kind: "set-null" });
      for (const childRid of rids) {
        updates.push({
          tableId: childTable.id,
          rid: childRid,
          columnId: childColumn.id,
          value: null,
        });
      }
    } else {
      blocks.push({
        ...base,
        kind: "block",
        reason: `ON UPDATE ${relation.onUpdate} em ${childTable.name}.${childColumn.name} impede mudar essa chave com ${rids.length} ${rids.length === 1 ? "linha apontando" : "linhas apontando"} para ela.`,
      });
    }
  }

  return { updates, steps, blocks };
}

export function applyUpdates(data: SimData, updates: CellUpdate[]): SimData {
  if (updates.length === 0) return data;
  const byRow = new Map<string, CellUpdate[]>();
  for (const update of updates) {
    const key = `${update.tableId}|${update.rid}`;
    byRow.set(key, [...(byRow.get(key) ?? []), update]);
  }
  const next: SimData = { ...data };
  for (const tableId of new Set(updates.map((item) => item.tableId))) {
    next[tableId] = rowsOf(data, tableId).map((row) => {
      const patch = byRow.get(`${tableId}|${ridOf(row)}`);
      if (!patch) return row;
      const copy = { ...row };
      for (const update of patch) copy[update.columnId] = update.value;
      return copy;
    });
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Linhas relacionadas, para destacar no canvas                        */
/* ------------------------------------------------------------------ */

export interface RelatedRows {
  /** rid das linhas ligadas, por tabela */
  byTable: Record<string, string[]>;
  parents: Array<{ relation: Relation; tableId: string; rid: string | null; value: Primitive }>;
  children: Array<{ relation: Relation; tableId: string; rids: string[]; value: Primitive }>;
}

export function relatedRows(diagram: Diagram, data: SimData, ref: RowRef): RelatedRows {
  const result: RelatedRows = { byTable: {}, parents: [], children: [] };
  const row = findRow(data, ref.tableId, ref.rid);
  if (!row) return result;

  const push = (tableId: string, rid: string) => {
    const list = result.byTable[tableId] ?? [];
    if (!list.includes(rid)) list.push(rid);
    result.byTable[tableId] = list;
  };

  for (const relation of parentRelations(diagram, ref.tableId)) {
    const value = row[relation.targetColumnId] ?? null;
    const parentRow = rowsOf(data, relation.sourceTableId).find((item) =>
      sameValue(item[relation.sourceColumnId], value),
    );
    result.parents.push({
      relation,
      tableId: relation.sourceTableId,
      rid: parentRow ? ridOf(parentRow) : null,
      value,
    });
    if (parentRow) push(relation.sourceTableId, ridOf(parentRow));
  }

  for (const relation of childRelations(diagram, ref.tableId)) {
    const value = row[relation.sourceColumnId] ?? null;
    const matches = rowsOf(data, relation.targetTableId).filter((item) =>
      sameValue(item[relation.targetColumnId], value),
    );
    result.children.push({
      relation,
      tableId: relation.targetTableId,
      rids: matches.map((item) => ridOf(item)),
      value,
    });
    for (const item of matches) push(relation.targetTableId, ridOf(item));
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* SQL equivalente, para o log da demonstracao                         */
/* ------------------------------------------------------------------ */

function literalOf(column: Column, value: Primitive): string {
  if (value === null) return "NULL";
  const kind = getType(column.type).kind;
  if (kind === "int" || kind === "float") return String(value);
  if (kind === "bool") return value ? "TRUE" : "FALSE";
  return quoteLiteral(String(value));
}

function whereClause(table: Table, row: SimRow): string {
  const keys = table.columns.filter((column) => column.isPrimary);
  const list = keys.length > 0 ? keys : table.columns.slice(0, 1);
  return list
    .map((column) => `${quoteIdent(column.name)} = ${literalOf(column, row[column.id] ?? null)}`)
    .join(" AND ");
}

export function deleteSql(table: Table, rows: SimRow[]): string {
  if (rows.length === 0) return "";
  const fq = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
  if (rows.length === 1) return `DELETE FROM ${fq} WHERE ${whereClause(table, rows[0])};`;
  const parts = rows.map((row) => `(${whereClause(table, row)})`).join("\n    OR ");
  return `DELETE FROM ${fq}\n  WHERE ${parts};`;
}

export function updateSql(table: Table, row: SimRow, column: Column, value: Primitive): string {
  const fq = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
  return `UPDATE ${fq} SET ${quoteIdent(column.name)} = ${literalOf(column, value)} WHERE ${whereClause(table, row)};`;
}

export function insertSql(table: Table, row: SimRow): string {
  const fq = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
  const names = table.columns.map((column) => quoteIdent(column.name)).join(", ");
  const values = table.columns
    .map((column) => literalOf(column, row[column.id] ?? null))
    .join(", ");
  return `INSERT INTO ${fq} (${names})\n  VALUES (${values});`;
}

/* ------------------------------------------------------------------ */
/* Log de operacoes                                                    */
/* ------------------------------------------------------------------ */

export type LogTone = "ok" | "warn" | "danger" | "info";

export interface OpLog {
  id: string;
  tone: LogTone;
  title: string;
  detail: string[];
  sql?: string;
  tableId?: string;
}

export function makeLog(entry: Omit<OpLog, "id">): OpLog {
  return { id: newId("log"), ...entry };
}

/** frases do plano, na ordem em que o banco aplicaria */
export function describePlan(diagram: Diagram, plan: DeletePlan): string[] {
  const lines: string[] = [];
  for (const step of plan.steps) {
    const table = tableOf(diagram, step.tableId);
    if (!table) continue;
    const count = step.rids.length;
    const rowWord = count === 1 ? "linha" : "linhas";
    if (step.kind === "root") {
      lines.push(`${count} ${rowWord} de ${table.name} apagadas na mão.`);
    } else if (step.kind === "cascade") {
      const from = tableOf(diagram, step.fromTableId ?? "");
      lines.push(
        `ON DELETE CASCADE: ${count} ${rowWord} de ${table.name} sumiram junto com ${from?.name ?? "o pai"}.`,
      );
    } else if (step.kind === "set-null") {
      const column = columnOf(table, step.columnId ?? "");
      lines.push(
        `ON DELETE SET NULL: ${table.name}.${column?.name ?? "fk"} virou NULL em ${count} ${rowWord}.`,
      );
    } else if (step.kind === "set-default") {
      const column = columnOf(table, step.columnId ?? "");
      lines.push(
        `ON DELETE SET DEFAULT: ${table.name}.${column?.name ?? "fk"} voltou para o default em ${count} ${rowWord}.`,
      );
    }
  }
  return lines;
}
