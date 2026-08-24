/**
 * Leitura de DDL PostgreSQL para dentro do modelo.
 *
 * Nao e um parser completo de SQL, e um leitor tolerante: entende o que
 * descreve estrutura (CREATE TABLE, constraints, ALTER TABLE ADD, COMMENT ON)
 * e ignora o resto sem quebrar. Tudo que for ignorado vira aviso, para o
 * usuario saber o que nao entrou no diagrama.
 */

import type { Cardinality, Diagram, FkAction, Relation, Table } from "./types";
import { newId, nextColor } from "./utils";

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

type TokenKind = "word" | "number" | "string" | "quoted" | "punct";

interface Token {
  kind: TokenKind;
  /** texto cru, ainda com aspas quando houver */
  text: string;
  start: number;
  end: number;
}

const SYMBOL = /[+\-*/<>=~!@#%^&|`?]/;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    // comentarios
    if (char === "-" && input[i + 1] === "-") {
      while (i < input.length && input[i] !== "\n") i += 1;
      continue;
    }
    if (char === "/" && input[i + 1] === "*") {
      let depth = 1;
      i += 2;
      while (i < input.length && depth > 0) {
        if (input[i] === "/" && input[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else if (input[i] === "*" && input[i + 1] === "/") {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      continue;
    }

    const start = i;

    if (char === "'") {
      i += 1;
      while (i < input.length) {
        if (input[i] === "'" && input[i + 1] === "'") i += 2;
        else if (input[i] === "'") {
          i += 1;
          break;
        } else i += 1;
      }
      tokens.push({ kind: "string", text: input.slice(start, i), start, end: i });
      continue;
    }

    if (char === '"') {
      i += 1;
      while (i < input.length) {
        if (input[i] === '"' && input[i + 1] === '"') i += 2;
        else if (input[i] === '"') {
          i += 1;
          break;
        } else i += 1;
      }
      tokens.push({ kind: "quoted", text: input.slice(start, i), start, end: i });
      continue;
    }

    if (/[A-Za-z_À-ɏ]/.test(char)) {
      while (i < input.length && /[A-Za-z0-9_$À-ɏ]/.test(input[i])) i += 1;
      tokens.push({ kind: "word", text: input.slice(start, i), start, end: i });
      continue;
    }

    if (/[0-9]/.test(char)) {
      while (i < input.length && /[0-9.eE]/.test(input[i])) i += 1;
      tokens.push({ kind: "number", text: input.slice(start, i), start, end: i });
      continue;
    }

    if (SYMBOL.test(char)) {
      while (i < input.length && SYMBOL.test(input[i])) i += 1;
      tokens.push({ kind: "punct", text: input.slice(start, i), start, end: i });
      continue;
    }

    i += 1;
    tokens.push({ kind: "punct", text: char, start, end: i });
  }

  return tokens;
}

function word(token: Token | undefined): string {
  return token && token.kind === "word" ? token.text.toUpperCase() : "";
}

function isWord(token: Token | undefined, expected: string): boolean {
  return word(token) === expected;
}

/** desfaz as aspas do identificador; sem aspas o PostgreSQL rebaixa para minusculo */
function identOf(token: Token | undefined): string {
  if (!token) return "";
  if (token.kind === "quoted") return token.text.slice(1, -1).replace(/""/g, '"');
  return token.text.toLowerCase();
}

function literalOf(token: Token | undefined): string {
  if (!token || token.kind !== "string") return "";
  return token.text.slice(1, -1).replace(/''/g, "'");
}

/** nome possivelmente qualificado: schema.tabela */
function readQualifiedName(tokens: Token[], index: number): { schema?: string; name: string; next: number } {
  const parts: string[] = [identOf(tokens[index])];
  let i = index + 1;
  while (tokens[i]?.text === "." && tokens[i + 1]) {
    parts.push(identOf(tokens[i + 1]));
    i += 2;
  }
  if (parts.length >= 2) return { schema: parts[parts.length - 2], name: parts[parts.length - 1], next: i };
  return { name: parts[0], next: i };
}

/** posicao do parentese que fecha o que abre em `open` */
function matchParen(tokens: Token[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i += 1) {
    if (tokens[i].text === "(") depth += 1;
    else if (tokens[i].text === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return tokens.length - 1;
}

/** lista de identificadores dentro de parenteses, como em PRIMARY KEY (a, b) */
function readColumnList(tokens: Token[], open: number): { names: string[]; next: number } {
  const close = matchParen(tokens, open);
  const names: string[] = [];
  let i = open + 1;
  while (i < close) {
    if (tokens[i].text === "," ) {
      i += 1;
      continue;
    }
    if (tokens[i].kind === "word" || tokens[i].kind === "quoted") {
      names.push(identOf(tokens[i]));
      i += 1;
      // ignora ASC, DESC, NULLS FIRST, opclass
      while (i < close && tokens[i].text !== ",") i += 1;
      continue;
    }
    i += 1;
  }
  return { names, next: close + 1 };
}

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** nomes aceitos para cada tipo do catalogo, do mais especifico ao mais curto */
const TYPE_ALIASES: Array<{ words: string[]; key: string }> = [
  { words: ["timestamp", "with", "time", "zone"], key: "timestamptz" },
  { words: ["timestamp", "without", "time", "zone"], key: "timestamp" },
  { words: ["time", "with", "time", "zone"], key: "timetz" },
  { words: ["time", "without", "time", "zone"], key: "time" },
  { words: ["character", "varying"], key: "varchar" },
  { words: ["double", "precision"], key: "double" },
  { words: ["bit", "varying"], key: "varchar" },
  { words: ["timestamptz"], key: "timestamptz" },
  { words: ["timestamp"], key: "timestamp" },
  { words: ["timetz"], key: "timetz" },
  { words: ["time"], key: "time" },
  { words: ["date"], key: "date" },
  { words: ["interval"], key: "interval" },
  { words: ["varchar"], key: "varchar" },
  { words: ["character"], key: "char" },
  { words: ["bpchar"], key: "char" },
  { words: ["char"], key: "char" },
  { words: ["text"], key: "text" },
  { words: ["citext"], key: "text" },
  { words: ["smallint"], key: "smallint" },
  { words: ["int2"], key: "smallint" },
  { words: ["integer"], key: "integer" },
  { words: ["int4"], key: "integer" },
  { words: ["int"], key: "integer" },
  { words: ["bigint"], key: "bigint" },
  { words: ["int8"], key: "bigint" },
  { words: ["smallserial"], key: "smallserial" },
  { words: ["serial2"], key: "smallserial" },
  { words: ["bigserial"], key: "bigserial" },
  { words: ["serial8"], key: "bigserial" },
  { words: ["serial"], key: "serial" },
  { words: ["serial4"], key: "serial" },
  { words: ["numeric"], key: "numeric" },
  { words: ["decimal"], key: "numeric" },
  { words: ["real"], key: "real" },
  { words: ["float4"], key: "real" },
  { words: ["float8"], key: "double" },
  { words: ["float"], key: "double" },
  { words: ["money"], key: "money" },
  { words: ["boolean"], key: "boolean" },
  { words: ["bool"], key: "boolean" },
  { words: ["uuid"], key: "uuid" },
  { words: ["jsonb"], key: "jsonb" },
  { words: ["json"], key: "json" },
  { words: ["bytea"], key: "bytea" },
  { words: ["inet"], key: "inet" },
  { words: ["cidr"], key: "cidr" },
  { words: ["macaddr"], key: "macaddr" },
  { words: ["point"], key: "point" },
  { words: ["tsvector"], key: "tsvector" },
];

interface TypeMatch {
  key: string;
  length?: number;
  precision?: number;
  scale?: number;
  next: number;
  raw: string;
  known: boolean;
}

function readType(tokens: Token[], index: number): TypeMatch {
  let matched: { words: string[]; key: string } | null = null;
  for (const alias of TYPE_ALIASES) {
    const ok = alias.words.every((part, offset) => word(tokens[index + offset]) === part.toUpperCase());
    if (ok) {
      matched = alias;
      break;
    }
  }

  const start = index;
  let i = matched ? index + matched.words.length : index + 1;
  let key = matched?.key ?? "text";

  const args: number[] = [];
  if (tokens[i]?.text === "(") {
    const close = matchParen(tokens, i);
    for (let j = i + 1; j < close; j += 1) {
      if (tokens[j].kind === "number") args.push(Number(tokens[j].text));
    }
    i = close + 1;
  }

  // array: text[] vira o tipo de array do catalogo
  let isArray = false;
  while (tokens[i]?.text === "[") {
    isArray = true;
    i = tokens[i + 1]?.text === "]" ? i + 2 : i + 1;
  }
  if (isArray) {
    key = key === "integer" || key === "bigint" || key === "smallint" ? "int_array" : "text_array";
  }

  const raw = tokens[start] ? tokens.slice(start, i).map((t) => t.text).join(" ") : "";

  const result: TypeMatch = { key, next: i, raw, known: Boolean(matched) };
  if (key === "varchar" || key === "char") {
    if (args[0]) result.length = args[0];
    else if (key === "char") result.length = 1;
  } else if (key === "numeric") {
    result.precision = args[0] ?? 12;
    result.scale = args[1] ?? 0;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Estruturas intermediarias                                           */
/* ------------------------------------------------------------------ */

interface DraftColumn {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  isPrimary: boolean;
  unique: boolean;
  identity: boolean;
  defaultValue?: string;
  check?: string;
  comment?: string;
}

interface DraftTable {
  key: string;
  schema: string;
  name: string;
  comment?: string;
  columns: DraftColumn[];
}

interface DraftFk {
  childSchema: string;
  childTable: string;
  childColumns: string[];
  parentSchema: string;
  parentTable: string;
  parentColumns: string[];
  name?: string;
  onDelete: FkAction;
  onUpdate: FkAction;
}

const FK_ACTIONS: FkAction[] = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];

function readAction(tokens: Token[], index: number): { action: FkAction; next: number } {
  const first = word(tokens[index]);
  const second = word(tokens[index + 1]);
  const pair = `${first} ${second}`;
  if (FK_ACTIONS.includes(pair as FkAction)) return { action: pair as FkAction, next: index + 2 };
  if (FK_ACTIONS.includes(first as FkAction)) return { action: first as FkAction, next: index + 1 };
  return { action: "NO ACTION", next: index + 1 };
}

/* ------------------------------------------------------------------ */
/* Leitor principal                                                    */
/* ------------------------------------------------------------------ */

export interface ParsedDdl {
  diagram: Diagram;
  warnings: string[];
  stats: { tables: number; columns: number; relations: number };
}

export function parseDdl(sql: string, diagramName?: string): ParsedDdl {
  const warnings: string[] = [];
  const tables = new Map<string, DraftTable>();
  const fks: DraftFk[] = [];

  const tableKey = (schema: string, name: string) => `${schema}.${name}`;
  const findTable = (schema: string | undefined, name: string): DraftTable | undefined => {
    if (schema) return tables.get(tableKey(schema, name));
    // sem schema explicito, procura em public primeiro e depois em qualquer um
    return (
      tables.get(tableKey("public", name)) ??
      Array.from(tables.values()).find((table) => table.name === name)
    );
  };
  const findColumn = (table: DraftTable, name: string) =>
    table.columns.find((column) => column.name === name) ??
    table.columns.find((column) => column.name.toLowerCase() === name.toLowerCase());

  for (const statement of splitStatements(sql)) {
    const tokens = tokenize(statement);
    if (tokens.length === 0) continue;

    const head = word(tokens[0]);
    const second = word(tokens[1]);

    if (head === "CREATE" && findWordIndex(tokens, "TABLE", 0, 4) >= 0) {
      readCreateTable(tokens, statement, tables, fks, warnings, tableKey);
      continue;
    }

    if (head === "ALTER" && second === "TABLE") {
      readAlterTable(tokens, statement, findTable, findColumn, fks, warnings);
      continue;
    }

    if (head === "COMMENT" && second === "ON") {
      readComment(tokens, findTable, findColumn);
      continue;
    }

    if (head === "CREATE" && findWordIndex(tokens, "INDEX", 0, 4) >= 0) {
      readIndex(tokens, findTable, findColumn);
      continue;
    }

    // ruido comum de dump que nao descreve estrutura
    if (
      head === "SET" ||
      head === "SELECT" ||
      head === "INSERT" ||
      head === "BEGIN" ||
      head === "COMMIT" ||
      head === "GRANT" ||
      head === "REVOKE" ||
      (head === "CREATE" && (second === "SEQUENCE" || second === "SCHEMA" || second === "EXTENSION")) ||
      (head === "ALTER" && second === "SEQUENCE") ||
      (head === "DROP" && true)
    ) {
      continue;
    }

    warnings.push(`Instrução ignorada: ${shorten(statement)}`);
  }

  /* --------- monta o diagrama --------- */

  const drafts = Array.from(tables.values());
  const built = new Map<string, Table>();

  drafts.forEach((draft, index) => {
    const table: Table = {
      id: newId("tbl"),
      name: draft.name,
      schema: draft.schema,
      comment: draft.comment,
      color: nextColor(index),
      position: { x: 0, y: 0 },
      rowCount: 12,
      columns: draft.columns.map((column) => ({
        id: newId("col"),
        name: column.name,
        type: column.type,
        length: column.length,
        precision: column.precision,
        scale: column.scale,
        isPrimary: column.isPrimary,
        isForeign: false,
        nullable: column.isPrimary ? false : column.nullable,
        unique: column.unique && !column.isPrimary,
        identity: column.identity,
        defaultValue: column.defaultValue,
        check: column.check,
        comment: column.comment,
      })),
    };
    built.set(draft.key, table);
  });

  const relations: Relation[] = [];
  for (const fk of fks) {
    const childDraft = findTable(fk.childSchema, fk.childTable);
    const parentDraft = findTable(fk.parentSchema, fk.parentTable);
    const child = childDraft ? built.get(childDraft.key) : undefined;
    const parent = parentDraft ? built.get(parentDraft.key) : undefined;

    if (!child || !parent) {
      warnings.push(
        `FK ignorada: ${fk.childTable} referencia ${fk.parentTable}, que não está no script.`,
      );
      continue;
    }

    const pairs = fk.childColumns.length;
    if (pairs > 1) {
      warnings.push(
        `A FK composta de ${child.name} (${fk.childColumns.join(", ")}) virou ${pairs} relacionamentos separados, porque o modelo liga uma coluna de cada vez.`,
      );
    }

    fk.childColumns.forEach((childName, index) => {
      const childColumn = child.columns.find((column) => column.name === childName);
      const parentName = fk.parentColumns[index] ?? fk.parentColumns[0];
      const parentColumn = parentName
        ? parent.columns.find((column) => column.name === parentName)
        : parent.columns.find((column) => column.isPrimary);

      if (!childColumn || !parentColumn) {
        warnings.push(`FK ignorada em ${child.name}: coluna ${childName} não encontrada.`);
        return;
      }
      if (relations.some((r) => r.targetTableId === child.id && r.targetColumnId === childColumn.id)) {
        warnings.push(
          `${child.name}.${childColumn.name} recebe mais de uma FK; o modelo guarda só a primeira.`,
        );
        return;
      }

      childColumn.isForeign = true;
      const single = fk.childColumns.length === 1;
      const cardinality: Cardinality =
        single && (childColumn.unique || (childColumn.isPrimary && child.columns.filter((c) => c.isPrimary).length === 1))
          ? "1:1"
          : "1:N";

      relations.push({
        id: newId("rel"),
        name: (pairs > 1 ? `${fk.name ?? ""}_${index + 1}` : fk.name) || `fk_${child.name}_${parent.name}`,
        sourceTableId: parent.id,
        sourceColumnId: parentColumn.id,
        targetTableId: child.id,
        targetColumnId: childColumn.id,
        cardinality,
        identifying: childColumn.isPrimary,
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
      });
    });
  }

  const list = Array.from(built.values());
  layout(list, relations);

  for (const table of list) {
    if (!table.columns.some((column) => column.isPrimary)) {
      warnings.push(`${table.name} entrou sem chave primária.`);
    }
  }

  const diagram: Diagram = {
    name: diagramName?.trim() || "Modelo importado",
    tables: list,
    relations,
  };

  return {
    diagram,
    warnings,
    stats: {
      tables: list.length,
      columns: list.reduce((total, table) => total + table.columns.length, 0),
      relations: relations.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Instrucoes                                                          */
/* ------------------------------------------------------------------ */

/** separa por ponto e virgula respeitando aspas, comentarios e parenteses */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];

    if (char === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (char === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (char === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i += 1;
          break;
        } else i += 1;
      }
      continue;
    }
    if (char === '"') {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') {
          i += 1;
          break;
        } else i += 1;
      }
      continue;
    }
    if (char === "$") {
      // corpo de funcao em dollar quoting
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (tag) {
        const closing = sql.indexOf(tag[0], i + tag[0].length);
        i = closing < 0 ? sql.length : closing + tag[0].length;
        continue;
      }
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === ";" && depth === 0) {
      const piece = sql.slice(start, i).trim();
      if (piece) out.push(piece);
      start = i + 1;
    }
    i += 1;
  }

  const tail = sql.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function findWordIndex(tokens: Token[], target: string, from: number, limit: number): number {
  for (let i = from; i < Math.min(tokens.length, from + limit); i += 1) {
    if (word(tokens[i]) === target) return i;
  }
  return -1;
}

function shorten(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 70 ? `${clean.slice(0, 70)}...` : clean;
}

const CONSTRAINT_STARTERS = new Set([
  "PRIMARY",
  "UNIQUE",
  "CHECK",
  "FOREIGN",
  "EXCLUDE",
  "LIKE",
  "CONSTRAINT",
]);

function readCreateTable(
  tokens: Token[],
  raw: string,
  tables: Map<string, DraftTable>,
  fks: DraftFk[],
  warnings: string[],
  tableKey: (schema: string, name: string) => string,
) {
  const tableWord = findWordIndex(tokens, "TABLE", 0, 4);
  let i = tableWord + 1;
  if (isWord(tokens[i], "IF") && isWord(tokens[i + 1], "NOT") && isWord(tokens[i + 2], "EXISTS")) {
    i += 3;
  }

  const name = readQualifiedName(tokens, i);
  i = name.next;

  if (tokens[i]?.text !== "(") {
    warnings.push(`CREATE TABLE sem corpo: ${shorten(raw)}`);
    return;
  }
  const close = matchParen(tokens, i);
  const items = splitItems(tokens, i + 1, close);

  const schema = name.schema ?? "public";
  const draft: DraftTable = {
    key: tableKey(schema, name.name),
    schema,
    name: name.name,
    columns: [],
  };

  const pending: Array<{ columns: string[]; kind: "pk" | "unique" | "check"; raw?: string }> = [];

  for (const item of items) {
    const first = word(tokens[item.start]);
    const isConstraint =
      CONSTRAINT_STARTERS.has(first) &&
      !(first === "CONSTRAINT" && item.end - item.start === 1);

    if (isConstraint) {
      let j = item.start;
      let constraintName: string | undefined;
      if (word(tokens[j]) === "CONSTRAINT") {
        constraintName = identOf(tokens[j + 1]);
        j += 2;
      }
      const kind = word(tokens[j]);

      if (kind === "PRIMARY" && tokens[j + 2]?.text === "(") {
        pending.push({ columns: readColumnList(tokens, j + 2).names, kind: "pk" });
      } else if (kind === "UNIQUE" && tokens[j + 1]?.text === "(") {
        pending.push({ columns: readColumnList(tokens, j + 1).names, kind: "unique" });
      } else if (kind === "CHECK" && tokens[j + 1]?.text === "(") {
        const end = matchParen(tokens, j + 1);
        pending.push({
          columns: [],
          kind: "check",
          raw: raw.slice(tokens[j + 2].start, tokens[end - 1].end),
        });
      } else if (kind === "FOREIGN" && tokens[j + 2]?.text === "(") {
        const fk = readForeignKey(tokens, j, schema, name.name, constraintName);
        if (fk) fks.push(fk);
      } else if (kind === "EXCLUDE" || kind === "LIKE") {
        warnings.push(`${name.name}: cláusula ${kind} não é representada no modelo.`);
      }
      continue;
    }

    const column = readColumnDefinition(tokens, item.start, item.end, raw, schema, name.name, fks, warnings);
    if (column) draft.columns.push(column);
  }

  for (const constraint of pending) {
    if (constraint.kind === "check" && constraint.raw) {
      const target = draft.columns.find((column) =>
        new RegExp(`(^|[^a-z0-9_"])"?${escapeRe(column.name)}"?([^a-z0-9_"]|$)`, "i").test(
          constraint.raw!,
        ),
      );
      if (target) target.check = constraint.raw;
      else warnings.push(`${name.name}: CHECK de tabela não foi ligado a nenhuma coluna.`);
      continue;
    }
    for (const columnName of constraint.columns) {
      const column = draft.columns.find((item) => item.name === columnName);
      if (!column) continue;
      if (constraint.kind === "pk") {
        column.isPrimary = true;
        column.nullable = false;
      } else if (constraint.columns.length === 1) {
        column.unique = true;
      }
    }
    if (constraint.kind === "unique" && constraint.columns.length > 1) {
      warnings.push(
        `${name.name}: UNIQUE composto em (${constraint.columns.join(", ")}) não é representado no modelo.`,
      );
    }
  }

  tables.set(draft.key, draft);
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** quebra o corpo do CREATE TABLE nas virgulas de nivel zero */
function splitItems(tokens: Token[], from: number, to: number): Array<{ start: number; end: number }> {
  const items: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < to; i += 1) {
    const text = tokens[i].text;
    if (text === "(") depth += 1;
    else if (text === ")") depth -= 1;
    else if (text === "," && depth === 0) {
      if (i > start) items.push({ start, end: i });
      start = i + 1;
    }
  }
  if (to > start) items.push({ start, end: to });
  return items;
}

const MODIFIER_STOP = new Set([
  "NOT",
  "PRIMARY",
  "UNIQUE",
  "CHECK",
  "REFERENCES",
  "GENERATED",
  "COLLATE",
  "CONSTRAINT",
  "DEFERRABLE",
  "DEFAULT",
]);

function readColumnDefinition(
  tokens: Token[],
  from: number,
  to: number,
  raw: string,
  schema: string,
  tableName: string,
  fks: DraftFk[],
  warnings: string[],
): DraftColumn | null {
  let i = from;
  const nameToken = tokens[i];
  if (!nameToken || (nameToken.kind !== "word" && nameToken.kind !== "quoted")) return null;
  const name = identOf(nameToken);
  i += 1;
  if (i >= to) return null;

  const type = readType(tokens, i);
  if (!type.known) {
    warnings.push(`${tableName}.${name}: tipo ${type.raw || "desconhecido"} virou text.`);
  }
  i = type.next;

  const column: DraftColumn = {
    name,
    type: type.key,
    length: type.length,
    precision: type.precision,
    scale: type.scale,
    nullable: true,
    isPrimary: false,
    unique: false,
    identity: false,
  };

  while (i < to) {
    const current = word(tokens[i]);

    if (current === "CONSTRAINT") {
      i += 2;
      continue;
    }
    if (current === "NOT" && isWord(tokens[i + 1], "NULL")) {
      column.nullable = false;
      i += 2;
      continue;
    }
    if (current === "NULL") {
      column.nullable = true;
      i += 1;
      continue;
    }
    if (current === "PRIMARY" && isWord(tokens[i + 1], "KEY")) {
      column.isPrimary = true;
      column.nullable = false;
      i += 2;
      continue;
    }
    if (current === "UNIQUE") {
      column.unique = true;
      i += 1;
      continue;
    }
    if (current === "CHECK" && tokens[i + 1]?.text === "(") {
      const close = matchParen(tokens, i + 1);
      column.check = raw.slice(tokens[i + 2].start, tokens[close - 1].end);
      i = close + 1;
      continue;
    }
    if (current === "DEFAULT") {
      let j = i + 1;
      const start = tokens[j]?.start ?? 0;
      let depth = 0;
      while (j < to) {
        const text = tokens[j].text;
        if (text === "(") depth += 1;
        else if (text === ")") depth -= 1;
        else if (depth === 0 && j > i + 1 && MODIFIER_STOP.has(word(tokens[j]))) break;
        j += 1;
      }
      const end = tokens[j - 1]?.end ?? start;
      column.defaultValue = raw.slice(start, end).trim();
      i = j;
      continue;
    }
    if (current === "GENERATED") {
      let j = i + 1;
      while (j < to && !isWord(tokens[j], "IDENTITY") && tokens[j].text !== "(") j += 1;
      if (isWord(tokens[j], "IDENTITY")) {
        column.identity = true;
        j += 1;
        if (tokens[j]?.text === "(") j = matchParen(tokens, j) + 1;
      } else {
        warnings.push(`${tableName}.${name}: coluna gerada (GENERATED AS) entrou como coluna comum.`);
        if (tokens[j]?.text === "(") j = matchParen(tokens, j) + 1;
        while (j < to && isWord(tokens[j], "STORED")) j += 1;
      }
      i = j;
      continue;
    }
    if (current === "REFERENCES") {
      const fk = readInlineReferences(tokens, i, to, schema, tableName, name);
      if (fk) {
        fks.push(fk.value);
        i = fk.next;
        continue;
      }
    }
    if (current === "COLLATE") {
      i += 2;
      continue;
    }
    i += 1;
  }

  // integer DEFAULT nextval(...) e a forma antiga de serial
  if (column.defaultValue && /nextval\s*\(/i.test(column.defaultValue)) {
    const asSerial: Record<string, string> = {
      integer: "serial",
      bigint: "bigserial",
      smallint: "smallserial",
    };
    const serial = asSerial[column.type];
    if (serial) {
      column.type = serial;
      column.defaultValue = undefined;
      column.nullable = false;
      warnings.push(`${tableName}.${name}: DEFAULT nextval() virou ${serial}.`);
    }
  }

  return column;
}

function readInlineReferences(
  tokens: Token[],
  index: number,
  to: number,
  schema: string,
  tableName: string,
  columnName: string,
): { value: DraftFk; next: number } | null {
  let i = index + 1;
  if (!tokens[i]) return null;
  const parent = readQualifiedName(tokens, i);
  i = parent.next;

  const parentColumns: string[] = [];
  if (tokens[i]?.text === "(") {
    const list = readColumnList(tokens, i);
    parentColumns.push(...list.names);
    i = list.next;
  }

  const fk: DraftFk = {
    childSchema: schema,
    childTable: tableName,
    childColumns: [columnName],
    parentSchema: parent.schema ?? schema,
    parentTable: parent.name,
    parentColumns,
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  };

  i = readFkOptions(tokens, i, to, fk);
  return { value: fk, next: i };
}

function readFkOptions(tokens: Token[], from: number, to: number, fk: DraftFk): number {
  let i = from;
  while (i < to) {
    const current = word(tokens[i]);
    if (current === "ON" && isWord(tokens[i + 1], "DELETE")) {
      const action = readAction(tokens, i + 2);
      fk.onDelete = action.action;
      i = action.next;
      continue;
    }
    if (current === "ON" && isWord(tokens[i + 1], "UPDATE")) {
      const action = readAction(tokens, i + 2);
      fk.onUpdate = action.action;
      i = action.next;
      continue;
    }
    if (current === "MATCH") {
      i += 2;
      continue;
    }
    if (current === "DEFERRABLE" || current === "INITIALLY" || current === "NOT") {
      i += 1;
      continue;
    }
    if (current === "DEFERRED" || current === "IMMEDIATE") {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

function readForeignKey(
  tokens: Token[],
  index: number,
  schema: string,
  tableName: string,
  constraintName?: string,
): DraftFk | null {
  // FOREIGN KEY (a, b) REFERENCES pai (x, y) ...
  let i = index + 2;
  if (tokens[i]?.text !== "(") return null;
  const child = readColumnList(tokens, i);
  i = child.next;
  if (!isWord(tokens[i], "REFERENCES")) return null;
  i += 1;
  const parent = readQualifiedName(tokens, i);
  i = parent.next;

  const parentColumns: string[] = [];
  if (tokens[i]?.text === "(") {
    const list = readColumnList(tokens, i);
    parentColumns.push(...list.names);
    i = list.next;
  }

  const fk: DraftFk = {
    childSchema: schema,
    childTable: tableName,
    childColumns: child.names,
    parentSchema: parent.schema ?? schema,
    parentTable: parent.name,
    parentColumns,
    name: constraintName,
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  };
  readFkOptions(tokens, i, tokens.length, fk);
  return fk;
}

function readAlterTable(
  tokens: Token[],
  raw: string,
  findTable: (schema: string | undefined, name: string) => DraftTable | undefined,
  findColumn: (table: DraftTable, name: string) => DraftColumn | undefined,
  fks: DraftFk[],
  warnings: string[],
) {
  let i = 2;
  if (isWord(tokens[i], "ONLY")) i += 1;
  if (isWord(tokens[i], "IF") && isWord(tokens[i + 1], "EXISTS")) i += 2;
  const target = readQualifiedName(tokens, i);
  i = target.next;

  const table = findTable(target.schema, target.name);
  if (!table) {
    warnings.push(`ALTER TABLE em ${target.name}, que não foi criada neste script.`);
    return;
  }

  const action = word(tokens[i]);

  if (action === "ADD") {
    let j = i + 1;
    let constraintName: string | undefined;
    if (isWord(tokens[j], "CONSTRAINT")) {
      constraintName = identOf(tokens[j + 1]);
      j += 2;
    }
    const kind = word(tokens[j]);

    if (kind === "FOREIGN") {
      const fk = readForeignKey(tokens, j, table.schema, table.name, constraintName);
      if (fk) fks.push(fk);
      return;
    }
    if (kind === "PRIMARY" && tokens[j + 2]?.text === "(") {
      for (const name of readColumnList(tokens, j + 2).names) {
        const column = findColumn(table, name);
        if (column) {
          column.isPrimary = true;
          column.nullable = false;
        }
      }
      return;
    }
    if (kind === "UNIQUE" && tokens[j + 1]?.text === "(") {
      const list = readColumnList(tokens, j + 1).names;
      if (list.length === 1) {
        const column = findColumn(table, list[0]);
        if (column) column.unique = true;
      } else {
        warnings.push(`${table.name}: UNIQUE composto não é representado no modelo.`);
      }
      return;
    }
    if (kind === "CHECK" && tokens[j + 1]?.text === "(") {
      const close = matchParen(tokens, j + 1);
      const expression = raw.slice(tokens[j + 2].start, tokens[close - 1].end);
      const column = table.columns.find((item) =>
        new RegExp(`(^|[^a-z0-9_"])"?${escapeRe(item.name)}"?([^a-z0-9_"]|$)`, "i").test(expression),
      );
      if (column) column.check = expression;
      else warnings.push(`${table.name}: CHECK não foi ligado a nenhuma coluna.`);
      return;
    }
    if (kind === "COLUMN" || tokens[j]?.kind === "word" || tokens[j]?.kind === "quoted") {
      const start = kind === "COLUMN" ? j + 1 : j;
      const column = readColumnDefinition(
        tokens,
        start,
        tokens.length,
        raw,
        table.schema,
        table.name,
        fks,
        warnings,
      );
      if (column) table.columns.push(column);
      return;
    }
    return;
  }

  if (action === "ALTER") {
    let j = i + 1;
    if (isWord(tokens[j], "COLUMN")) j += 1;
    const column = findColumn(table, identOf(tokens[j]));
    j += 1;
    if (!column) return;
    if (isWord(tokens[j], "SET") && isWord(tokens[j + 1], "NOT") && isWord(tokens[j + 2], "NULL")) {
      column.nullable = false;
      return;
    }
    if (isWord(tokens[j], "DROP") && isWord(tokens[j + 1], "NOT")) {
      column.nullable = true;
      return;
    }
    if (isWord(tokens[j], "SET") && isWord(tokens[j + 1], "DEFAULT")) {
      const start = tokens[j + 2]?.start;
      if (start !== undefined) {
        const expression = raw.slice(start).trim();
        if (/nextval\s*\(/i.test(expression)) {
          const asSerial: Record<string, string> = {
            integer: "serial",
            bigint: "bigserial",
            smallint: "smallserial",
          };
          const serial = asSerial[column.type];
          if (serial) {
            column.type = serial;
            column.nullable = false;
            return;
          }
        }
        column.defaultValue = expression;
      }
      return;
    }
  }
}

function readComment(
  tokens: Token[],
  findTable: (schema: string | undefined, name: string) => DraftTable | undefined,
  findColumn: (table: DraftTable, name: string) => DraftColumn | undefined,
) {
  const kind = word(tokens[2]);
  if (kind !== "TABLE" && kind !== "COLUMN") return;

  const parts: string[] = [identOf(tokens[3])];
  let i = 4;
  while (tokens[i]?.text === "." && tokens[i + 1]) {
    parts.push(identOf(tokens[i + 1]));
    i += 2;
  }
  if (!isWord(tokens[i], "IS")) return;
  const text = literalOf(tokens[i + 1]);
  if (!text) return;

  if (kind === "TABLE") {
    const table =
      parts.length > 1 ? findTable(parts[parts.length - 2], parts[parts.length - 1]) : findTable(undefined, parts[0]);
    if (table) table.comment = text;
    return;
  }

  const columnName = parts[parts.length - 1];
  const tableName = parts[parts.length - 2];
  const schema = parts.length > 2 ? parts[parts.length - 3] : undefined;
  const table = tableName ? findTable(schema, tableName) : undefined;
  if (!table) return;
  const column = findColumn(table, columnName);
  if (column) column.comment = text;
}

function readIndex(
  tokens: Token[],
  findTable: (schema: string | undefined, name: string) => DraftTable | undefined,
  findColumn: (table: DraftTable, name: string) => DraftColumn | undefined,
) {
  const unique = isWord(tokens[1], "UNIQUE");
  if (!unique) return;
  const on = findWordIndex(tokens, "ON", 0, 12);
  if (on < 0) return;
  const target = readQualifiedName(tokens, on + 1);
  const table = findTable(target.schema, target.name);
  if (!table) return;
  if (tokens[target.next]?.text !== "(") return;
  const list = readColumnList(tokens, target.next).names;
  if (list.length !== 1) return;
  const column = findColumn(table, list[0]);
  if (column) column.unique = true;
}

/* ------------------------------------------------------------------ */
/* Posicionamento                                                      */
/* ------------------------------------------------------------------ */

const COLUMN_GAP = 360;
const ROW_GAP = 44;

/**
 * Coloca as tabelas em colunas por profundidade de dependencia: pai a
 * esquerda, filho a direita. E o mesmo sentido que o canvas usa para
 * decidir de que lado a linha do relacionamento sai.
 */
function layout(tables: Table[], relations: Relation[]) {
  const parentsOf = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.sourceTableId === relation.targetTableId) continue;
    parentsOf.set(relation.targetTableId, [
      ...(parentsOf.get(relation.targetTableId) ?? []),
      relation.sourceTableId,
    ]);
  }

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // ciclo: para de descer
    visiting.add(id);
    const parents = parentsOf.get(id) ?? [];
    const value = parents.length === 0 ? 0 : Math.max(...parents.map(depthOf)) + 1;
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };

  const nextY = new Map<number, number>();
  for (const table of tables) {
    const level = Math.min(depthOf(table.id), 8);
    const y = nextY.get(level) ?? 40;
    table.position = { x: 40 + level * COLUMN_GAP, y };
    nextY.set(level, y + 92 + table.columns.length * 30 + ROW_GAP);
  }
}
