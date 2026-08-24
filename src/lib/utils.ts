import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { customAlphabet } from "nanoid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 10);

export function newId(prefix: string): string {
  return `${prefix}_${nano()}`;
}

/** Palavras reservadas mais comuns do PostgreSQL, usadas na validacao */
export const RESERVED_WORDS = new Set([
  "all", "analyse", "analyze", "and", "any", "array", "as", "asc", "authorization",
  "between", "binary", "both", "case", "cast", "check", "collate", "column",
  "constraint", "create", "cross", "current_date", "current_role", "current_time",
  "current_timestamp", "current_user", "default", "deferrable", "desc", "distinct",
  "do", "else", "end", "except", "false", "for", "foreign", "freeze", "from", "full",
  "grant", "group", "having", "ilike", "in", "initially", "inner", "intersect",
  "into", "is", "isnull", "join", "leading", "left", "like", "limit", "localtime",
  "localtimestamp", "natural", "new", "not", "notnull", "null", "offset", "old",
  "on", "only", "or", "order", "outer", "overlaps", "placing", "primary",
  "references", "right", "select", "session_user", "similar", "some", "table",
  "then", "to", "trailing", "true", "union", "unique", "user", "using", "verbose",
  "when", "where", "with",
]);

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

export function isValidIdentifier(name: string): boolean {
  return IDENT_RE.test(name);
}

/** Converte um rotulo humano em identificador snake_case seguro */
export function toIdentifier(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 63);
}

/** Aspas duplas apenas quando o identificador exige */
export function quoteIdent(name: string): string {
  if (isValidIdentifier(name) && !RESERVED_WORDS.has(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function copyText(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

export const TABLE_COLORS = [
  "#336791", // elefante
  "#1F7A5C", // verde dado
  "#6B4FBB", // violeta fk
  "#B5642B", // terracota
  "#8E2F4A", // vinho
  "#2F6E7A", // petroleo
  "#5A6B23", // oliva
  "#7A4E8C", // ameixa
];

export function nextColor(index: number): string {
  return TABLE_COLORS[index % TABLE_COLORS.length];
}
