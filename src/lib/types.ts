/**
 * Modelo de dominio do pgcanvas.
 * Tudo que o app manipula (tabelas, colunas, relacionamentos) vive aqui.
 */

export type KeyRole = "none" | "pk" | "fk" | "pfk";

export type Cardinality = "1:1" | "1:N" | "N:N";

export type FkAction =
  | "NO ACTION"
  | "RESTRICT"
  | "CASCADE"
  | "SET NULL"
  | "SET DEFAULT";

export interface Column {
  id: string;
  name: string;
  /** chave do catalogo em pg-types.ts, ex.: "varchar" */
  type: string;
  /** varchar(n), char(n), bit(n) */
  length?: number;
  /** numeric(p, s) */
  precision?: number;
  scale?: number;
  isPrimary: boolean;
  isForeign: boolean;
  nullable: boolean;
  unique: boolean;
  /** GENERATED ALWAYS AS IDENTITY */
  identity: boolean;
  defaultValue?: string;
  check?: string;
  comment?: string;
  /** forca um gerador especifico na simulacao de dados */
  generator?: string;
}

export interface Table {
  id: string;
  name: string;
  schema: string;
  comment?: string;
  /** cor da faixa do card no canvas */
  color: string;
  position: { x: number; y: number };
  columns: Column[];
  /** quantidade de linhas a gerar na simulacao */
  rowCount: number;
}

export interface Relation {
  id: string;
  name: string;
  /** lado 1: tabela referenciada (pai) */
  sourceTableId: string;
  sourceColumnId: string;
  /** lado N: tabela que recebe a FK (filha) */
  targetTableId: string;
  targetColumnId: string;
  cardinality: Cardinality;
  /** relacionamento identificador: a FK tambem compoe a PK (vira PFK) */
  identifying: boolean;
  onDelete: FkAction;
  onUpdate: FkAction;
}

export interface Diagram {
  name: string;
  tables: Table[];
  relations: Relation[];
}

export type Selection =
  | { kind: "none" }
  | { kind: "table"; tableId: string }
  | { kind: "column"; tableId: string; columnId: string }
  | { kind: "relation"; relationId: string };

export type EditorMode = "modeler" | "simulation" | "demo";

export interface SqlOptions {
  includeDrop: boolean;
  includeComments: boolean;
  includeIndexes: boolean;
  ifNotExists: boolean;
}

export interface SimOptions {
  seed: string;
  nullRate: number;
  locale: "pt-BR";
}

/** uma linha gerada: valores indexados pelo id da coluna */
export type SimRow = Record<string, string | number | boolean | null>;

/**
 * Identidade interna da linha. Fica dentro do proprio SimRow, mas nunca sai
 * no DDL, no CSV ou nos INSERTs porque todo mundo itera por table.columns.
 * O indice do array nao serve como identidade: apagar uma linha renumera as
 * de baixo e a selecao passaria a apontar para outro registro.
 */
export const ROW_ID = "__rid";

export function ridOf(row: SimRow): string {
  return String(row[ROW_ID] ?? "");
}

/** referencia estavel para uma linha em qualquer tabela */
export interface RowRef {
  tableId: string;
  rid: string;
}

export type SimData = Record<string, SimRow[]>;

export interface Issue {
  level: "error" | "warning";
  message: string;
  tableId?: string;
  columnId?: string;
  relationId?: string;
}

export function keyRole(column: Column): KeyRole {
  if (column.isPrimary && column.isForeign) return "pfk";
  if (column.isPrimary) return "pk";
  if (column.isForeign) return "fk";
  return "none";
}

export function applyKeyRole(column: Column, role: KeyRole): Column {
  switch (role) {
    case "pk":
      return { ...column, isPrimary: true, isForeign: false, nullable: false };
    case "fk":
      return { ...column, isPrimary: false, isForeign: true };
    case "pfk":
      return { ...column, isPrimary: true, isForeign: true, nullable: false };
    default:
      return { ...column, isPrimary: false, isForeign: false };
  }
}
