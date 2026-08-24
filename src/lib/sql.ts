import type { Diagram, Relation, SqlOptions, Table } from "./types";
import { isSerial, renderType } from "./pg-types";
import { quoteIdent, quoteLiteral } from "./utils";

const DEFAULT_OPTIONS: SqlOptions = {
  includeDrop: false,
  includeComments: true,
  includeIndexes: true,
  ifNotExists: true,
};

function qualified(table: Table): string {
  return `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
}

function columnDefinition(table: Table, pad: number): string[] {
  return table.columns.map((column) => {
    const parts: string[] = [];
    const name = quoteIdent(column.name).padEnd(pad, " ");
    parts.push(name);
    parts.push(
      renderType(column.type, {
        length: column.length,
        precision: column.precision,
        scale: column.scale,
      }),
    );
    if (column.identity && !isSerial(column.type)) {
      parts.push("GENERATED ALWAYS AS IDENTITY");
    }
    if (!column.nullable) parts.push("NOT NULL");
    if (column.defaultValue && column.defaultValue.trim().length > 0) {
      parts.push(`DEFAULT ${column.defaultValue.trim()}`);
    }
    return parts.join(" ");
  });
}

function tableConstraints(table: Table): string[] {
  const lines: string[] = [];
  const pk = table.columns.filter((c) => c.isPrimary);
  if (pk.length > 0) {
    const cols = pk.map((c) => quoteIdent(c.name)).join(", ");
    lines.push(`CONSTRAINT ${quoteIdent(`pk_${table.name}`)} PRIMARY KEY (${cols})`);
  }
  for (const column of table.columns) {
    if (column.unique && !column.isPrimary) {
      lines.push(
        `CONSTRAINT ${quoteIdent(`uq_${table.name}_${column.name}`)} UNIQUE (${quoteIdent(column.name)})`,
      );
    }
  }
  for (const column of table.columns) {
    if (column.check && column.check.trim().length > 0) {
      lines.push(
        `CONSTRAINT ${quoteIdent(`ck_${table.name}_${column.name}`)} CHECK (${column.check.trim()})`,
      );
    }
  }
  return lines;
}

function createTable(table: Table, options: SqlOptions): string {
  const pad = Math.min(
    32,
    table.columns.reduce((max, c) => Math.max(max, quoteIdent(c.name).length), 0) + 1,
  );
  const body = [...columnDefinition(table, pad), ...tableConstraints(table)];
  const head = options.ifNotExists
    ? `CREATE TABLE IF NOT EXISTS ${qualified(table)} (`
    : `CREATE TABLE ${qualified(table)} (`;
  return [head, body.map((line) => `  ${line}`).join(",\n"), ");"].join("\n");
}

function foreignKey(relation: Relation, diagram: Diagram): string | null {
  const parent = diagram.tables.find((t) => t.id === relation.sourceTableId);
  const child = diagram.tables.find((t) => t.id === relation.targetTableId);
  if (!parent || !child) return null;
  const parentColumn = parent.columns.find((c) => c.id === relation.sourceColumnId);
  const childColumn = child.columns.find((c) => c.id === relation.targetColumnId);
  if (!parentColumn || !childColumn) return null;

  const name = relation.name || `fk_${child.name}_${parent.name}`;
  return [
    `ALTER TABLE ${qualified(child)}`,
    `  ADD CONSTRAINT ${quoteIdent(name)} FOREIGN KEY (${quoteIdent(childColumn.name)})`,
    `  REFERENCES ${qualified(parent)} (${quoteIdent(parentColumn.name)})`,
    `  ON DELETE ${relation.onDelete} ON UPDATE ${relation.onUpdate};`,
  ].join("\n");
}

function indexes(diagram: Diagram): string[] {
  const lines: string[] = [];
  for (const relation of diagram.relations) {
    const child = diagram.tables.find((t) => t.id === relation.targetTableId);
    if (!child) continue;
    const column = child.columns.find((c) => c.id === relation.targetColumnId);
    if (!column || column.isPrimary) continue;
    lines.push(
      `CREATE INDEX ${quoteIdent(`idx_${child.name}_${column.name}`)} ON ${qualified(child)} (${quoteIdent(column.name)});`,
    );
  }
  return lines;
}

function comments(diagram: Diagram): string[] {
  const lines: string[] = [];
  for (const table of diagram.tables) {
    if (table.comment?.trim()) {
      lines.push(`COMMENT ON TABLE ${qualified(table)} IS ${quoteLiteral(table.comment.trim())};`);
    }
    for (const column of table.columns) {
      if (column.comment?.trim()) {
        lines.push(
          `COMMENT ON COLUMN ${qualified(table)}.${quoteIdent(column.name)} IS ${quoteLiteral(column.comment.trim())};`,
        );
      }
    }
  }
  return lines;
}

function section(title: string): string {
  return `-- ${"-".repeat(68)}\n-- ${title}\n-- ${"-".repeat(68)}`;
}

export function generateSql(diagram: Diagram, partial?: Partial<SqlOptions>): string {
  const options = { ...DEFAULT_OPTIONS, ...partial };
  const blocks: string[] = [];

  blocks.push(
    [
      `-- ${diagram.name}`,
      "-- DDL PostgreSQL gerado pelo pgcanvas",
      `-- Tabelas: ${diagram.tables.length} | Relacionamentos: ${diagram.relations.length}`,
    ].join("\n"),
  );

  const schemas = Array.from(new Set(diagram.tables.map((t) => t.schema))).filter(
    (s) => s !== "public",
  );

  if (options.includeDrop) {
    blocks.push(section("Limpeza"));
    const drops = [...diagram.tables]
      .reverse()
      .map((table) => `DROP TABLE IF EXISTS ${qualified(table)} CASCADE;`);
    blocks.push(drops.join("\n"));
  }

  if (schemas.length > 0) {
    blocks.push(section("Schemas"));
    blocks.push(schemas.map((s) => `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(s)};`).join("\n"));
  }

  if (diagram.tables.length > 0) {
    blocks.push(section("Tabelas"));
    blocks.push(diagram.tables.map((table) => createTable(table, options)).join("\n\n"));
  }

  const fks = diagram.relations
    .map((relation) => foreignKey(relation, diagram))
    .filter((sql): sql is string => Boolean(sql));

  if (fks.length > 0) {
    blocks.push(section("Chaves estrangeiras"));
    blocks.push(fks.join("\n\n"));
  }

  if (options.includeIndexes) {
    const idx = indexes(diagram);
    if (idx.length > 0) {
      blocks.push(section("Índices"));
      blocks.push(idx.join("\n"));
    }
  }

  if (options.includeComments) {
    const cmt = comments(diagram);
    if (cmt.length > 0) {
      blocks.push(section("Documentação"));
      blocks.push(cmt.join("\n"));
    }
  }

  return `${blocks.join("\n\n")}\n`;
}

/** Ordem topologica das tabelas respeitando dependencias de FK */
export function topologicalOrder(diagram: Diagram): { order: Table[]; hasCycle: boolean } {
  const byId = new Map(diagram.tables.map((t) => [t.id, t]));
  const indegree = new Map<string, number>(diagram.tables.map((t) => [t.id, 0]));
  const children = new Map<string, string[]>();

  for (const relation of diagram.relations) {
    if (relation.sourceTableId === relation.targetTableId) continue;
    if (!byId.has(relation.sourceTableId) || !byId.has(relation.targetTableId)) continue;
    indegree.set(relation.targetTableId, (indegree.get(relation.targetTableId) ?? 0) + 1);
    const list = children.get(relation.sourceTableId) ?? [];
    list.push(relation.targetTableId);
    children.set(relation.sourceTableId, list);
  }

  const queue = diagram.tables.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: Table[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const table = byId.get(id);
    if (table) order.push(table);
    for (const child of children.get(id) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  const hasCycle = order.length !== diagram.tables.length;
  if (hasCycle) {
    for (const table of diagram.tables) {
      if (!order.some((t) => t.id === table.id)) order.push(table);
    }
  }
  return { order, hasCycle };
}
