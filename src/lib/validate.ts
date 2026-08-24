import type { Diagram, Issue } from "./types";
import { getType, isSerial, typesCompatible } from "./pg-types";
import { RESERVED_WORDS, isValidIdentifier } from "./utils";

export function validateDiagram(diagram: Diagram): Issue[] {
  const issues: Issue[] = [];
  const seenTable = new Set<string>();

  for (const table of diagram.tables) {
    const fq = `${table.schema}.${table.name}`;

    if (!isValidIdentifier(table.name)) {
      issues.push({
        level: "error",
        tableId: table.id,
        message: `A tabela "${table.name}" não é um identificador válido. Use minúsculas, números e underline.`,
      });
    }
    if (RESERVED_WORDS.has(table.name.toLowerCase())) {
      issues.push({
        level: "warning",
        tableId: table.id,
        message: `"${table.name}" é palavra reservada do PostgreSQL e será gerada entre aspas.`,
      });
    }
    if (seenTable.has(fq)) {
      issues.push({
        level: "error",
        tableId: table.id,
        message: `Existe mais de uma tabela chamada ${fq}.`,
      });
    }
    seenTable.add(fq);

    if (table.columns.length === 0) {
      issues.push({
        level: "error",
        tableId: table.id,
        message: `A tabela ${table.name} não tem colunas.`,
      });
      continue;
    }

    const pkColumns = table.columns.filter((c) => c.isPrimary);
    if (pkColumns.length === 0) {
      issues.push({
        level: "warning",
        tableId: table.id,
        message: `A tabela ${table.name} não tem chave primária.`,
      });
    }

    const seenColumn = new Set<string>();
    for (const column of table.columns) {
      if (!isValidIdentifier(column.name)) {
        issues.push({
          level: "error",
          tableId: table.id,
          columnId: column.id,
          message: `${table.name}.${column.name}: identificador inválido.`,
        });
      }
      if (RESERVED_WORDS.has(column.name.toLowerCase())) {
        issues.push({
          level: "warning",
          tableId: table.id,
          columnId: column.id,
          message: `${table.name}.${column.name} é palavra reservada e será gerada entre aspas.`,
        });
      }
      if (seenColumn.has(column.name)) {
        issues.push({
          level: "error",
          tableId: table.id,
          columnId: column.id,
          message: `${table.name} tem a coluna ${column.name} duplicada.`,
        });
      }
      seenColumn.add(column.name);

      const type = getType(column.type);
      if (type.args === "length" && !column.length) {
        issues.push({
          level: "warning",
          tableId: table.id,
          columnId: column.id,
          message: `${table.name}.${column.name}: ${type.sql} sem tamanho definido.`,
        });
      }
      if (column.identity && isSerial(column.type)) {
        issues.push({
          level: "warning",
          tableId: table.id,
          columnId: column.id,
          message: `${table.name}.${column.name}: ${type.sql} já gera sequence, identity será ignorado.`,
        });
      }
      if (column.isPrimary && column.nullable) {
        issues.push({
          level: "error",
          tableId: table.id,
          columnId: column.id,
          message: `${table.name}.${column.name} faz parte da PK e não pode aceitar nulo.`,
        });
      }
      if (column.isForeign) {
        const hasRelation = diagram.relations.some(
          (r) => r.targetTableId === table.id && r.targetColumnId === column.id,
        );
        if (!hasRelation) {
          issues.push({
            level: "warning",
            tableId: table.id,
            columnId: column.id,
            message: `${table.name}.${column.name} está marcada como FK mas não aponta para nenhuma tabela.`,
          });
        }
      }
    }
  }

  for (const relation of diagram.relations) {
    const parent = diagram.tables.find((t) => t.id === relation.sourceTableId);
    const child = diagram.tables.find((t) => t.id === relation.targetTableId);
    if (!parent || !child) {
      issues.push({
        level: "error",
        relationId: relation.id,
        message: "Relacionamento aponta para uma tabela que não existe mais.",
      });
      continue;
    }
    const parentColumn = parent.columns.find((c) => c.id === relation.sourceColumnId);
    const childColumn = child.columns.find((c) => c.id === relation.targetColumnId);
    if (!parentColumn || !childColumn) {
      issues.push({
        level: "error",
        relationId: relation.id,
        message: `Relacionamento ${parent.name} para ${child.name} aponta para uma coluna que não existe mais.`,
      });
      continue;
    }

    if (!typesCompatible(parentColumn.type, childColumn.type)) {
      issues.push({
        level: "error",
        relationId: relation.id,
        message: `Tipos incompatíveis: ${parent.name}.${parentColumn.name} e ${childColumn.type} em ${child.name}.${childColumn.name}.`,
      });
    }
    if (!parentColumn.isPrimary && !parentColumn.unique) {
      issues.push({
        level: "error",
        relationId: relation.id,
        message: `${parent.name}.${parentColumn.name} precisa ser PK ou UNIQUE para ser referenciada.`,
      });
    }
    if (relation.identifying && !childColumn.isPrimary) {
      issues.push({
        level: "warning",
        relationId: relation.id,
        message: `Relacionamento identificador exige que ${child.name}.${childColumn.name} componha a PK.`,
      });
    }
    if (relation.cardinality === "1:1" && !childColumn.unique && !childColumn.isPrimary) {
      issues.push({
        level: "warning",
        relationId: relation.id,
        message: `Cardinalidade 1:1 exige UNIQUE em ${child.name}.${childColumn.name}.`,
      });
    }
    if (relation.onDelete === "SET NULL" && !childColumn.nullable) {
      issues.push({
        level: "error",
        relationId: relation.id,
        message: `ON DELETE SET NULL exige que ${child.name}.${childColumn.name} aceite nulo.`,
      });
    }
    if (relation.cardinality === "N:N") {
      issues.push({
        level: "warning",
        relationId: relation.id,
        message: `${parent.name} para ${child.name} esta como N:N. Resolva com uma tabela associativa.`,
      });
    }
  }

  return issues;
}

export function countBy(issues: Issue[], level: Issue["level"]): number {
  return issues.filter((issue) => issue.level === level).length;
}
