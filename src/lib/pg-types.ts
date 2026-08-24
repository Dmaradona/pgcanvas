/**
 * Catalogo de tipos do PostgreSQL usados no modelador.
 * `args` define quais parametros o tipo aceita no editor de coluna.
 */

export type TypeArgs = "none" | "length" | "precision";

export type ValueKind =
  | "int"
  | "float"
  | "text"
  | "bool"
  | "date"
  | "time"
  | "timestamp"
  | "uuid"
  | "json"
  | "binary"
  | "network"
  | "geometric"
  | "array"
  | "money"
  | "interval";

export interface PgType {
  key: string;
  /** nome canonico emitido no DDL */
  sql: string;
  group: string;
  args: TypeArgs;
  defaultLength?: number;
  defaultPrecision?: number;
  defaultScale?: number;
  kind: ValueKind;
  /** texto curto exibido no editor */
  hint?: string;
}

export const PG_TYPES: PgType[] = [
  // Numericos
  { key: "smallint", sql: "smallint", group: "Numéricos", args: "none", kind: "int", hint: "inteiro 2 bytes, -32768 a 32767" },
  { key: "integer", sql: "integer", group: "Numéricos", args: "none", kind: "int", hint: "inteiro 4 bytes" },
  { key: "bigint", sql: "bigint", group: "Numéricos", args: "none", kind: "int", hint: "inteiro 8 bytes" },
  { key: "numeric", sql: "numeric", group: "Numéricos", args: "precision", defaultPrecision: 12, defaultScale: 2, kind: "float", hint: "decimal exato, use para dinheiro" },
  { key: "real", sql: "real", group: "Numéricos", args: "none", kind: "float", hint: "ponto flutuante 4 bytes" },
  { key: "double", sql: "double precision", group: "Numéricos", args: "none", kind: "float", hint: "ponto flutuante 8 bytes" },
  { key: "smallserial", sql: "smallserial", group: "Numéricos", args: "none", kind: "int", hint: "auto incremento 2 bytes" },
  { key: "serial", sql: "serial", group: "Numéricos", args: "none", kind: "int", hint: "auto incremento 4 bytes" },
  { key: "bigserial", sql: "bigserial", group: "Numéricos", args: "none", kind: "int", hint: "auto incremento 8 bytes" },

  // Texto
  { key: "varchar", sql: "varchar", group: "Texto", args: "length", defaultLength: 255, kind: "text", hint: "texto com limite" },
  { key: "char", sql: "char", group: "Texto", args: "length", defaultLength: 1, kind: "text", hint: "texto de tamanho fixo" },
  { key: "text", sql: "text", group: "Texto", args: "none", kind: "text", hint: "texto sem limite" },

  // Data e hora
  { key: "date", sql: "date", group: "Data e hora", args: "none", kind: "date" },
  { key: "time", sql: "time", group: "Data e hora", args: "none", kind: "time" },
  { key: "timetz", sql: "time with time zone", group: "Data e hora", args: "none", kind: "time" },
  { key: "timestamp", sql: "timestamp", group: "Data e hora", args: "none", kind: "timestamp" },
  { key: "timestamptz", sql: "timestamptz", group: "Data e hora", args: "none", kind: "timestamp", hint: "recomendado para auditoria" },
  { key: "interval", sql: "interval", group: "Data e hora", args: "none", kind: "interval" },

  // Booleano e identificadores
  { key: "boolean", sql: "boolean", group: "Booleano e ids", args: "none", kind: "bool" },
  { key: "uuid", sql: "uuid", group: "Booleano e ids", args: "none", kind: "uuid", hint: "chave distribuída" },

  // Estruturados
  { key: "json", sql: "json", group: "Estruturados", args: "none", kind: "json" },
  { key: "jsonb", sql: "jsonb", group: "Estruturados", args: "none", kind: "json", hint: "json binário indexável" },
  { key: "bytea", sql: "bytea", group: "Estruturados", args: "none", kind: "binary" },
  { key: "text_array", sql: "text[]", group: "Estruturados", args: "none", kind: "array" },
  { key: "int_array", sql: "integer[]", group: "Estruturados", args: "none", kind: "array" },

  // Especiais
  { key: "money", sql: "money", group: "Especiais", args: "none", kind: "money", hint: "prefira numeric(12,2)" },
  { key: "inet", sql: "inet", group: "Especiais", args: "none", kind: "network" },
  { key: "cidr", sql: "cidr", group: "Especiais", args: "none", kind: "network" },
  { key: "macaddr", sql: "macaddr", group: "Especiais", args: "none", kind: "network" },
  { key: "point", sql: "point", group: "Especiais", args: "none", kind: "geometric" },
  { key: "tsvector", sql: "tsvector", group: "Especiais", args: "none", kind: "text" },
];

export const TYPE_GROUPS = Array.from(new Set(PG_TYPES.map((t) => t.group)));

const TYPE_INDEX = new Map(PG_TYPES.map((t) => [t.key, t]));

export function getType(key: string): PgType {
  return TYPE_INDEX.get(key) ?? TYPE_INDEX.get("varchar")!;
}

export interface TypeArgsShape {
  length?: number;
  precision?: number;
  scale?: number;
}

/** Monta o tipo completo para o DDL, ex.: varchar(120) ou numeric(12,2) */
export function renderType(key: string, args: TypeArgsShape): string {
  const type = getType(key);
  if (type.args === "length") {
    const len = args.length ?? type.defaultLength;
    return len ? `${type.sql}(${len})` : type.sql;
  }
  if (type.args === "precision") {
    const p = args.precision ?? type.defaultPrecision;
    const s = args.scale ?? type.defaultScale;
    if (p && s !== undefined) return `${type.sql}(${p}, ${s})`;
    if (p) return `${type.sql}(${p})`;
    return type.sql;
  }
  return type.sql;
}

/** Versao curta para o card no canvas */
export function renderTypeShort(key: string, args: TypeArgsShape): string {
  return renderType(key, args).replace(/\s/g, "");
}

/** serial e bigserial ja carregam sequence, nao aceitam identity */
export function isSerial(key: string): boolean {
  return key === "serial" || key === "bigserial" || key === "smallserial";
}

export function isIntegerLike(key: string): boolean {
  return getType(key).kind === "int";
}

/** Compatibilidade entre a coluna referenciada e a FK */
export function typesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const ka = getType(a).kind;
  const kb = getType(b).kind;
  if (ka !== kb) return false;
  return ka === "int" || ka === "text" || ka === "uuid";
}
